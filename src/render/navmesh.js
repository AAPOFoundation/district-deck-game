// District Deck V3.10 W2-CROWD — render-only footpath navmesh.
// Generates a walkable graph from street/footpath topology at city load, paths with A*,
// and hard-rejects any sample that sits inside a parcel/civic building footprint.
// Never writes simulation state. Placement noise uses seeded hash streams only.

import { CELL, PITCH, ROAD, TILE, cityExtent } from '../core/grid.js';

const FOOTPATH_OFFSETS = Object.freeze([CELL / 2, ROAD - CELL / 2]);

function hash32(text) {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

function nodeId(x, z) {
  return `n:${String(x).padStart(6, '0')}:${String(z).padStart(6, '0')}`;
}

function parseNodeId(id) {
  const match = /^n:(\d+):(\d+)$/.exec(id);
  if (!match) return null;
  return { x: Number(match[1]), z: Number(match[2]) };
}

/** Axis-aligned building footprints used by the I-29 hard gate. */
export function buildingFootprintAabbs(city) {
  return [
    ...Object.values(city.parcels ?? {}),
    ...(city.civicUses ?? []),
  ].map((building) => {
    const offset = building.placement?.modelOffset ?? { x: 0, z: 0 };
    const envelope = building.placement?.envelopeMetres ?? {
      x: (building.groundFootprint?.[0] ?? 1) * TILE - 1,
      z: (building.groundFootprint?.[1] ?? 1) * TILE - 1,
    };
    const x = building.centre.x + offset.x;
    const z = building.centre.z + offset.z;
    return {
      id: building.id,
      minX: x - envelope.x / 2,
      maxX: x + envelope.x / 2,
      minZ: z - envelope.z / 2,
      maxZ: z + envelope.z / 2,
    };
  });
}

export function pointInsideFootprint(x, z, footprints) {
  for (let index = 0; index < footprints.length; index += 1) {
    const box = footprints[index];
    if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ) return true;
  }
  return false;
}

// ——— the auction crowd ————————————————————————————————————————————————————————————————
//
// **This was a ring and is now a frontage fan, and the change closes three findings at once.**
//
// Until V3.70 every bidder stood on a rectangle drawn round the whole envelope at a fixed
// perimeter fraction: twenty to a loop, two loops, half a place of stagger between them. It read
// exactly as it was built. The r2 critic's words for it — `_reviews/quality-loop/v370/l2-people/
// r2-critic.md` §1.1 — were *"A is a single line strung along a hedge"*, and its M6 was bidders
// crossed at waist height by the hedge with their legs in front of it and feet through the picket
// fence. Both are properties of the loop rather than of the figure: a loop spends three of its
// four sides on the flanks and the rear, which is where a residential lot keeps its planting, its
// side fence and its bin store, and none of that is in `buildingFootprintAabbs` so no gate here
// can see it.
//
// A Saturday auction crowd does not surround the house. It stands on the nature strip and the
// footpath **in front of it**, facing the auctioneer at the front steps, in clumps with gaps
// between them, deeper in the middle than at the edges, with the late arrivals at the back. So
// the placement is now a clustered fan on the frontage the parcel already declares, which is the
// one side of the envelope this file can prove is street rather than garden.
//
// **The depth band is arithmetic, and it is measured off the LOT LINE rather than off the
// envelope.** `CORRIDOR.footpathB` is 3 m wide and it starts at the lot boundary, so the band a
// bidder may stand in runs from the boundary to the kerb — and the distance from the envelope to
// the boundary is not a constant. Measured on seed `DD-SHOT-0001`: envelopes are 15 × 15,
// 15 × 13.5 and 13.5 × 15 on a 16 m tile, so the front setback is **0.5 m on some ids and 1.25 m
// on others**. A fixed 1.05 m standoff off the envelope therefore puts a bidder on the footpath
// on one id and inside the front fence on the next, which is the shape of M6. So the fan is
// `CROWD_FRONT_CLEAR` past the boundary and stops `CROWD_KERB_CLEAR` short of the kerb, and both
// ends move with the setback the id actually has.
//
// Width is the other half. Forty people in a 2.3 m band need about 55 m² of standing room and a
// 15 m frontage gives 34 — so the fan is allowed `CROWD_FAN_MARGIN` past each end of the lot,
// onto the neighbours' footpath, which is exactly where an overflowing auction crowd goes. It is
// still gated: any stand that lands inside a footprint is pushed out and re-checked.
const CROWD_FRONT_CLEAR = 0.55;
const CROWD_FOOTPATH_DEPTH = 3.0;
const CROWD_KERB_CLEAR = 0.15;
const CROWD_FAN_MARGIN = 5.6;
/**
 * Centre-to-centre floor, and it is a floor rather than a target.
 *
 * A shoulder is ~0.45 m across, so 1.00 m is people standing close without occupying each other.
 * It is deliberately below the spacing the fan's area implies (~1.3 m): a relaxation that drives
 * every pair to the same distance produces a lattice, which is the ring's fault in a different
 * coordinate system. Slack is what lets a group of three stand together and leave a gap beside
 * them, and the nearest-neighbour CV in `tests/v370-crowd-placement.mjs` is the measure of it.
 */
const CROWD_MIN_SPACING = 1.02;
/**
 * What the dart throw aims for before it settles, and it is **two** numbers on purpose.
 *
 * People who came together stand together: a couple at `CROWD_SEED_NEAR`, which is barely above
 * the floor. People who did not stand further apart, at `CROWD_SEED_FAR`. One number for both
 * produces an evenly spaced field — the ring's fault in polar coordinates — and the split is what
 * puts a gap between one clump and the next without inventing an empty corridor.
 */
const CROWD_SEED_NEAR = 1.06;
const CROWD_SEED_FAR = 1.52;
const CROWD_RELAX_PASSES = 10;
/** Where the auctioneer stands, off the front face. Every bidder's default facing points here. */
const CROWD_FOCUS_STANDOFF = 0.35;
/** The push-out ladder a stand walks when it lands inside a footprint. Metres. */
const CROWD_PUSH_STEP = 0.28;
const CROWD_PUSH_MAX = 2.6;
const CROWD_SLIDE_STEP = 0.42;
const CROWD_SLIDE_MAX = 3.0;

/** 0–1 from a salted key. The same stream `unitFrom` gives the figure lanes, stated locally. */
function crowdUnit(key) {
  return (hash32(key) >>> 8) / 0x01000000;
}

/**
 * The auction building's own footprint, in exactly the terms `buildingFootprintAabbs` states it
 * — `centre + modelOffset`, half the envelope — so the ring and the gate are drawn about the
 * same box. A numeric `envelopeMetres` is read as a square, which the axis-form fallback in the
 * gate does not do and which is why a flank building's box degenerates there.
 */
function crowdBox(parcel) {
  const declared = parcel.placement?.envelopeMetres;
  const envelope = typeof declared === 'number'
    ? { x: declared, z: declared }
    : declared ?? {
      x: (parcel.groundFootprint?.[0] ?? 1) * TILE - 1,
      z: (parcel.groundFootprint?.[1] ?? 1) * TILE - 1,
    };
  const offset = parcel.placement?.modelOffset ?? { x: 0, z: 0 };
  return {
    x: parcel.centre.x + (offset.x ?? 0),
    z: parcel.centre.z + (offset.z ?? 0),
    halfX: envelope.x / 2,
    halfZ: envelope.z / 2,
  };
}

/**
 * The frontage frame: which way the building faces the street, and how far its own envelope
 * reaches along and across that direction.
 *
 * `parcel.rotation` is the street the tile fronts, in the degrees `grid.js` `frontage()` writes —
 * 0 south, 90 east, 180 north, 270 west — so the outward normal is `(sin θ, 0, cos θ)` and the
 * lateral axis is `(cos θ, 0, −sin θ)`. Both are exactly axis-aligned at those four values; the
 * trigonometry is here so a rotation that is ever authored off-axis still resolves rather than
 * silently picking the wrong wall.
 *
 * A parcel with no usable rotation falls back to the side with the most clear standing room,
 * measured on the gate itself. That is deterministic — a fixed scan, no hashes — and it is the
 * honest answer: this file cannot see a fence or a hedge, but it can see a wall.
 */
function crowdFrontage(box, parcel, isBlocked) {
  const rotation = parcel?.rotation;
  const declared = Number.isFinite(rotation) ? ((rotation % 360) + 360) % 360 : null;
  const sides = declared === null ? [0, 90, 180, 270] : [declared];
  const tiles = parcel?.groundFootprint ?? [1, 1];
  let best = null;
  for (const degrees of sides) {
    const theta = (degrees * Math.PI) / 180;
    const nx = Math.sin(theta);
    const nz = Math.cos(theta);
    const ux = Math.cos(theta);
    const uz = -Math.sin(theta);
    const halfNormal = Math.abs(nx) * box.halfX + Math.abs(nz) * box.halfZ;
    const halfLateral = Math.abs(ux) * box.halfX + Math.abs(uz) * box.halfZ;
    // The lot, in the same frame, so the setback the id actually has is a measurement rather
    // than an assumption. `box` carries `modelOffset`; the lot does not, so the offset has to
    // come back out of the front distance or an eccentric model reports the wrong setback.
    const lotHalfNormal = (Math.abs(nx) * (tiles[0] ?? 1) + Math.abs(nz) * (tiles[1] ?? 1))
      * TILE * 0.5;
    const lotHalfLateral = (Math.abs(ux) * (tiles[0] ?? 1) + Math.abs(uz) * (tiles[1] ?? 1))
      * TILE * 0.5;
    const offsetOut = (box.x - (parcel?.centre?.x ?? box.x)) * nx
      + (box.z - (parcel?.centre?.z ?? box.z)) * nz;
    const setback = Math.max(0, lotHalfNormal - offsetOut - halfNormal);
    const frame = {
      theta, nx, nz, ux, uz, halfNormal, halfLateral, setback, lotHalfLateral,
      inner: setback + CROWD_FRONT_CLEAR,
      outer: setback + CROWD_FOOTPATH_DEPTH - CROWD_KERB_CLEAR,
    };
    if (declared !== null) return frame;
    // Nine probes across the band, at the depth the fan actually uses.
    let clear = 0;
    for (let step = 0; step < 9; step += 1) {
      const along = ((step / 8) * 2 - 1) * (halfLateral + CROWD_FAN_MARGIN * 0.5);
      const out = halfNormal + (frame.inner + frame.outer) * 0.5;
      if (!isBlocked(box.x + nx * out + ux * along, box.z + nz * out + uz * along)) clear += 1;
    }
    if (!best || clear > best.clear) best = { ...frame, clear };
  }
  return best;
}

/** A point in the frontage frame — `along` the frontage, `out` from the front face — to world. */
function fanPoint(box, frame, along, out) {
  const distance = frame.halfNormal + out;
  return {
    x: box.x + frame.nx * distance + frame.ux * along,
    z: box.z + frame.nz * distance + frame.uz * along,
  };
}

function entityCentre(city, anchor, state, seen = new Set()) {
  if (!anchor || seen.has(`${anchor.kind}:${anchor.id}`)) return null;
  seen.add(`${anchor.kind}:${anchor.id}`);
  if (anchor.kind === 'parcel') return city.parcels[anchor.id]?.centre ?? null;
  if (anchor.kind === 'civic') {
    return city.civicUses.find(({ id }) => id === anchor.id)?.centre ?? null;
  }
  if (anchor.kind === 'reserve') {
    return city.reserve?.id === anchor.id ? city.reserve.centre : null;
  }
  if (anchor.kind === 'core') {
    const coreId = anchor.id.replace(/:mouth$/, '');
    const core = city.blockCores.find(({ id }) => id === coreId)
      ?? city.rightsOfWay.find(({ id }) => id === coreId);
    if (!core) return null;
    if (core.centre) return core.centre;
    return {
      x: core.bx * (city.extent.x / city.blocksX) + city.extent.x / city.blocksX / 2,
      z: core.bz * (city.extent.z / city.blocksZ) + city.extent.z / city.blocksZ / 2,
    };
  }
  if (anchor.kind === 'person') {
    return entityCentre(city, state?.people?.byId?.[anchor.id]?.toAnchor, state, seen);
  }
  if (anchor.kind === 'avatar') {
    return entityCentre(city, state?.avatars?.[anchor.id]?.destination, state, seen);
  }
  return null;
}

function resolveAnchorKey(anchor, state, seen = new Set()) {
  if (!anchor) return null;
  const key = `${anchor.kind}:${anchor.id}`;
  if (seen.has(key)) return null;
  seen.add(key);
  if (anchor.kind === 'person') {
    return resolveAnchorKey(state?.people?.byId?.[anchor.id]?.toAnchor, state, seen);
  }
  if (anchor.kind === 'avatar') {
    return resolveAnchorKey(state?.avatars?.[anchor.id]?.destination, state, seen);
  }
  return `a:${key}`;
}

/**
 * Walkable footpath graph for the presentation layer.
 * Nodes sit on corridor footpath centrelines and rights-of-way; A* paths between them.
 */
export class NavMesh {
  constructor(city) {
    this.city = null;
    this.nodes = new Map(); // id -> { x, z }
    this.edges = new Map(); // id -> string[]
    this.anchors = new Map(); // a:kind:id -> nodeId
    this.footprints = [];
    this.seed = '';
    this.versionKey = '';
    if (city) this.rebuild(city);
  }

  /** Topology signature — rebuild when parcels or display graph change. */
  static versionKey(city) {
    const topology = city?.topology?.version ?? 0;
    const order = city?.order?.length ?? 0;
    const graphSize = city?.displayWalkGraph
      ? Object.keys(city.displayWalkGraph).length
      : 0;
    return `${city?.seed ?? ''}|${topology}|${order}|${graphSize}`;
  }

  rebuild(city) {
    this.city = city;
    this.seed = city.seed ?? '';
    this.versionKey = NavMesh.versionKey(city);
    this.footprints = buildingFootprintAabbs(city);
    this.nodes = new Map();
    this.edges = new Map();
    this.anchors = new Map();

    // Prefer the frozen city display walk graph (same lattice as city load) so presentation
    // connectivity stays aligned with the measured topology already sealed on the city.
    const graph = city.displayWalkGraph;
    if (graph && Object.keys(graph).length) {
      this._ingestDisplayGraph(graph, city);
    } else {
      this._generateFromTopology(city);
    }
    return this;
  }

  ensure(city) {
    if (!city) return this;
    if (this.versionKey !== NavMesh.versionKey(city)) this.rebuild(city);
    return this;
  }

  _ingestDisplayGraph(graph, city) {
    for (const [id, neighbours] of Object.entries(graph)) {
      if (id.startsWith('n:')) {
        const point = parseNodeId(id);
        if (!point) continue;
        if (pointInsideFootprint(point.x, point.z, this.footprints)) continue;
        this.nodes.set(id, point);
        this.edges.set(id, []);
      } else if (id.startsWith('a:')) {
        this.edges.set(id, []);
      }
    }
    for (const [id, neighbours] of Object.entries(graph)) {
      if (!this.edges.has(id) && !id.startsWith('a:')) continue;
      const legal = [];
      for (const neighbour of neighbours) {
        if (neighbour.startsWith('n:') && !this.nodes.has(neighbour)) continue;
        if (neighbour.startsWith('a:') || this.nodes.has(neighbour) || this.edges.has(neighbour)) {
          legal.push(neighbour);
        }
      }
      if (!this.edges.has(id)) this.edges.set(id, []);
      this.edges.set(id, [...new Set([...this.edges.get(id), ...legal])].sort());
      if (id.startsWith('a:')) {
        const node = legal.find((entry) => entry.startsWith('n:'));
        if (node) this.anchors.set(id, node);
      }
    }
    // Ensure undirected links for A* over pure node keys.
    for (const [id, neighbours] of this.edges) {
      for (const neighbour of neighbours) {
        if (!this.edges.has(neighbour)) this.edges.set(neighbour, []);
        if (!this.edges.get(neighbour).includes(id)) {
          this.edges.get(neighbour).push(id);
          this.edges.get(neighbour).sort();
        }
      }
    }
    void city;
  }

  _generateFromTopology(city) {
    const extent = city.extent ?? cityExtent(city.blocksX, city.blocksZ);
    const legal = (x, z) => !pointInsideFootprint(x, z, this.footprints);
    const addNode = (x, z) => {
      if (!legal(x, z)) return null;
      const id = nodeId(x, z);
      if (!this.nodes.has(id)) {
        this.nodes.set(id, { x, z });
        this.edges.set(id, []);
      }
      return id;
    };
    const connect = (left, right) => {
      if (!left || !right || left === right) return;
      if (!this.edges.get(left).includes(right)) this.edges.get(left).push(right);
      if (!this.edges.get(right).includes(left)) this.edges.get(right).push(left);
    };
    const addLine = (points) => {
      let previous = null;
      for (const point of points) {
        const current = addNode(point.x, point.z);
        if (
          previous
          && current
          && Math.abs(this.nodes.get(previous).x - point.x)
            + Math.abs(this.nodes.get(previous).z - point.z) === CELL
        ) connect(previous, current);
        previous = current;
      }
    };

    for (const corridor of city.corridors?.vertical ?? []) {
      const baseX = corridor.index * PITCH;
      for (const offset of FOOTPATH_OFFSETS) {
        const points = [];
        for (let z = CELL / 2; z < extent.z; z += CELL) {
          points.push({ x: baseX + offset, z });
        }
        addLine(points);
      }
    }
    for (const corridor of city.corridors?.horizontal ?? []) {
      const baseZ = corridor.index * PITCH;
      for (const offset of FOOTPATH_OFFSETS) {
        const points = [];
        for (let x = CELL / 2; x < extent.x; x += CELL) {
          points.push({ x, z: baseZ + offset });
        }
        addLine(points);
      }
    }
    for (const row of [...(city.rightsOfWay ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
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
    }

    for (const [id, list] of this.edges) list.sort();

    const centres = new Map([
      ...Object.values(city.parcels ?? {}).map(({ id, centre }) => [`parcel:${id}`, centre]),
      ...(city.civicUses ?? []).map(({ id, centre }) => [`civic:${id}`, centre]),
      ...(city.blockCores ?? []).map(({ id, centre }) => [`core:${id}`, centre]),
      ...(city.rightsOfWay ?? []).map(({ id, centre }) => [`core:${id}:mouth`, centre]),
      ...(city.reserve ? [[`reserve:${city.reserve.id}`, city.reserve.centre]] : []),
    ]);
    const nodeIds = [...this.nodes.keys()].sort();
    for (const value of [...(city.walkAnchors ?? [])].sort((left, right) =>
      `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`))) {
      const anchorId = `a:${value.kind}:${value.id}`;
      const centre = centres.get(`${value.kind}:${value.id}`);
      if (!centre || !nodeIds.length) continue;
      const nearest = this.nearestNodeId(centre.x, centre.z);
      if (!nearest) continue;
      this.anchors.set(anchorId, nearest);
      this.edges.set(anchorId, [nearest]);
      if (!this.edges.get(nearest).includes(anchorId)) {
        this.edges.get(nearest).push(anchorId);
        this.edges.get(nearest).sort();
      }
    }
  }

  isInsideBuilding(x, z) {
    return pointInsideFootprint(x, z, this.footprints);
  }

  nearestNodeId(x, z) {
    let best = null;
    let bestDist = Infinity;
    for (const [id, point] of this.nodes) {
      const dist = Math.abs(point.x - x) + Math.abs(point.z - z);
      if (dist < bestDist || (dist === bestDist && (best === null || id < best))) {
        best = id;
        bestDist = dist;
      }
    }
    return best;
  }

  nodePoint(id) {
    if (this.nodes.has(id)) return { ...this.nodes.get(id) };
    const parsed = parseNodeId(id);
    return parsed ? { ...parsed } : null;
  }

  /** Project any world XZ onto the nearest legal footpath node. */
  projectWalkable(x, z) {
    const id = this.nearestNodeId(x, z);
    if (!id) {
      return {
        x: this.city?.extent?.x / 2 ?? 0,
        z: this.city?.extent?.z / 2 ?? 0,
      };
    }
    return this.nodePoint(id);
  }

  /**
   * Hard gate: if (x,z) is inside a building footprint, snap to nearest walkable node.
   * Otherwise leave the sample alone (callers may still prefer projectWalkable).
   */
  enforceWalkable(x, z) {
    if (!this.isInsideBuilding(x, z)) return { x, z };
    return this.projectWalkable(x, z);
  }

  anchorNodeId(anchor, state) {
    const key = resolveAnchorKey(anchor, state);
    if (!key) return this.nearestNodeId(
      this.city?.extent?.x / 2 ?? 0,
      this.city?.extent?.z / 2 ?? 0,
    );
    if (this.anchors.has(key)) return this.anchors.get(key);
    // Fall back: nearest walkable to the entity centre.
    const centre = entityCentre(this.city, anchor, state);
    if (!centre) return this.nearestNodeId(0, 0);
    return this.nearestNodeId(centre.x, centre.z);
  }

  /**
   * Seeded stand pose on the footpath at an anchor. Offset stays on the path lattice
   * (small longitudinal jitter only) so the actor never steps into a footprint.
   */
  standPosition(anchor, state, actorId) {
    const node = this.anchorNodeId(anchor, state);
    const base = this.nodePoint(node) ?? this.projectWalkable(0, 0);
    const hash = hash32(`${this.seed}|stand|${actorId}|${node}`);
    // Longitudinal jitter along the dominant corridor axis of the nearest edge.
    const neighbours = (this.edges.get(node) ?? []).filter((id) => id.startsWith('n:'));
    let tangentX = 1;
    let tangentZ = 0;
    if (neighbours.length) {
      const other = this.nodePoint(neighbours[0]);
      if (other) {
        const dx = other.x - base.x;
        const dz = other.z - base.z;
        const len = Math.hypot(dx, dz) || 1;
        tangentX = dx / len;
        tangentZ = dz / len;
      }
    }
    // Reserve dogs stand beside the rotunda: walk further along the path, not into mass.
    const reserveDog = anchor?.kind === 'reserve' && String(actorId).startsWith('dog-');
    const amplitude = reserveDog ? 2.4 : 0.55;
    const signed = (((hash >>> 3) % 9) - 4) / 4; // -1..1
    let x = base.x + tangentX * signed * amplitude;
    let z = base.z + tangentZ * signed * amplitude;
    if (reserveDog) {
      // Push further from the rotunda centre along the outward path direction.
      const centre = entityCentre(this.city, anchor, state);
      if (centre) {
        const awayX = base.x - centre.x;
        const awayZ = base.z - centre.z;
        const awayLen = Math.hypot(awayX, awayZ) || 1;
        x = base.x + (awayX / awayLen) * 11.5;
        z = base.z + (awayZ / awayLen) * 11.5;
        const projected = this.projectWalkable(x, z);
        x = projected.x;
        z = projected.z;
      }
    }
    const safe = this.enforceWalkable(x, z);
    // Final absolute gate.
    if (this.isInsideBuilding(safe.x, safe.z)) {
      return this.projectWalkable(safe.x, safe.z);
    }
    return safe;
  }

  /**
   * A* over walkable nodes. Returns an ordered list of {x,z} including endpoints.
   * start/goal may be anchor keys or node ids; both are projected to nodes.
   */
  findPath(startId, goalId) {
    const start = startId?.startsWith('n:') ? startId : this.anchors.get(startId) ?? startId;
    const goal = goalId?.startsWith('n:') ? goalId : this.anchors.get(goalId) ?? goalId;
    if (!start || !goal || !this.nodes.has(start) || !this.nodes.has(goal)) return null;
    if (start === goal) {
      const point = this.nodePoint(start);
      return point ? [point] : null;
    }

    const heuristic = (id) => {
      const a = this.nodes.get(id);
      const b = this.nodes.get(goal);
      return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
    };
    const open = [start];
    const cameFrom = new Map([[start, null]]);
    const gScore = new Map([[start, 0]]);
    const fScore = new Map([[start, heuristic(start)]]);
    const closed = new Set();

    while (open.length) {
      // Linear extract-min is fine: graph is a few thousand nodes, cast is ≤ 19 actors.
      let bestIndex = 0;
      let bestF = fScore.get(open[0]) ?? Infinity;
      for (let index = 1; index < open.length; index += 1) {
        const score = fScore.get(open[index]) ?? Infinity;
        if (score < bestF || (score === bestF && open[index] < open[bestIndex])) {
          bestF = score;
          bestIndex = index;
        }
      }
      const current = open.splice(bestIndex, 1)[0];
      if (current === goal) {
        const keys = [];
        for (let key = goal; key !== null; key = cameFrom.get(key)) keys.push(key);
        keys.reverse();
        return keys.map((id) => this.nodePoint(id)).filter(Boolean);
      }
      closed.add(current);
      const currentG = gScore.get(current) ?? Infinity;
      for (const neighbour of this.edges.get(current) ?? []) {
        if (!neighbour.startsWith('n:') || !this.nodes.has(neighbour)) continue;
        if (closed.has(neighbour)) continue;
        const weight = CELL;
        const tentative = currentG + weight;
        if (tentative >= (gScore.get(neighbour) ?? Infinity)) continue;
        cameFrom.set(neighbour, current);
        gScore.set(neighbour, tentative);
        fScore.set(neighbour, tentative + heuristic(neighbour));
        if (!open.includes(neighbour)) open.push(neighbour);
      }
    }
    return null;
  }

  /**
   * Full presentation route for an actor: stand pose → A* nodes → stand pose.
   * Every sample is enforceWalkable'd. Identical for a given seed + anchors + actorId.
   */
  routeFor(fromAnchor, toAnchor, state, actorId) {
    const fromNode = this.anchorNodeId(fromAnchor, state);
    const toNode = this.anchorNodeId(toAnchor, state);
    const startStand = this.standPosition(fromAnchor, state, `${actorId}:from`);
    const endStand = this.standPosition(toAnchor, state, `${actorId}:to`);
    if (!fromNode || !toNode) {
      return [startStand, endStand].map((point) => this.enforceWalkable(point.x, point.z));
    }
    const mid = this.findPath(fromNode, toNode);
    if (!mid) {
      // Direct footpath hop between stands when A* cannot connect (should be rare).
      return [
        this.enforceWalkable(startStand.x, startStand.z),
        this.enforceWalkable(endStand.x, endStand.z),
      ];
    }
    const points = [startStand, ...mid, endStand]
      .map((point) => this.enforceWalkable(point.x, point.z));
    // Collapse near-duplicates so lerp does not stutter on the attachment node.
    const collapsed = [];
    for (const point of points) {
      const prior = collapsed.at(-1);
      if (
        prior
        && Math.abs(prior.x - point.x) < 1e-4
        && Math.abs(prior.z - point.z) < 1e-4
      ) continue;
      collapsed.push(point);
    }
    // Absolute gate: drop any residual interior samples by reprojecting.
    return collapsed.map((point) => {
      if (this.isInsideBuilding(point.x, point.z)) return this.projectWalkable(point.x, point.z);
      return point;
    });
  }

  /**
   * Stand positions for an auction crowd: a clustered fan on the parcel's street frontage.
   *
   * The header note above states why this is no longer a ring. What it produces, in order:
   *
   * 1. **Clusters, not places.** Bidders are dealt into groups of two to six — a couple, a
   *    family, three neighbours who came together — and the group is placed, not the person.
   *    Group centres are spread across the frontage with their own jitter, so the gaps between
   *    them fall where the hash puts them rather than at a fixed pitch. This is the whole of the
   *    "forty places evenly round a rectangle" read, and it is the reason the old layout could
   *    not help looking issued.
   * 2. **Deeper in the middle, later at the back.** A group's depth rises with its index and with
   *    its distance from the middle of the frontage, so the crowd is a wedge pointing at the
   *    front steps rather than a band of uniform thickness.
   * 3. **A relaxation, then the gate.** Fixed-count pairwise push-apart to `CROWD_MIN_SPACING`,
   *    then the depth clamp, then the footprint gate — pushed out toward the street first,
   *    slid along the frontage second, and only then thrown at the lattice.
   * 4. **Uneven facing.** The default is the auctioneer's spot, off the front face, plus a per-
   *    person deviation; a share of the crowd is turned to the person beside them instead, which
   *    is what stops forty heads pointing at one pixel.
   *
   * Every stand also reports `rank` — 0 at the front of the crowd, 1 at the back — so the figure
   * layer can put the people who cannot see up on their toes without re-deriving the geometry.
   *
   * Deterministic throughout: every random quantity is `hash32` of `eventId` and the index, and
   * every search is a fixed-step scan. Nothing here reads or writes simulation state.
   */
  crowdPositions(parcel, count, eventId) {
    const box = crowdBox(parcel);
    if (count <= 0) return [];
    const frame = crowdFrontage(box, parcel, (x, z) => this.isInsideBuilding(x, z));
    const span = Math.max(frame.lotHalfLateral, frame.halfLateral) + CROWD_FAN_MARGIN;
    const depthSpan = Math.max(0.6, frame.outer - frame.inner);

    // —— 1. deal the crowd into groups ——————————————————————————————————————————————
    const groups = [];
    for (let placed = 0, g = 0; placed < count; g += 1) {
      const size = Math.min(count - placed, 2 + (hash32(`${eventId}|g|${g}`) % 6));
      groups.push({ start: placed, size });
      placed += size;
    }

    // —— 2. place the groups, then their members ——————————————————————————————————————
    //
    // The group centres walk the frontage on **uneven** strides rather than sitting on even
    // slots: a hashed width per group, normalised to fill the span, so the gaps between clumps
    // fall where the hash puts them. Even slots plus jitter still reads as a pitch with wobble.
    const widths = groups.map((_, g) => 0.45 + crowdUnit(`${eventId}|gw|${g}`) * 1.30);
    const widthTotal = widths.reduce((sum, value) => sum + value, 0);
    const seats = [];
    let cursor = -span;
    groups.forEach((group, g) => {
      const width = (widths[g] / widthTotal) * span * 2;
      const along = cursor + width * 0.5;
      cursor += width;
      // Depth is not the deal order: an early group can be at the back and a late one at the
      // front. What does push a group back is standing off the middle of the frontage, where
      // the view of the front steps is worse — so the crowd is a wedge, not a band.
      const edge = Math.min(1, Math.abs(along) / Math.max(0.001, span));
      const depth = frame.inner + depthSpan * Math.min(
        1, 0.06 + 0.56 * crowdUnit(`${eventId}|gd|${g}`) + 0.38 * edge ** 1.6,
      );
      // **Members are thrown as darts, not dealt onto a disc, and that is what makes a crowd
      // rather than a lattice.** A disc of members plus a spacing relaxation drives every pair
      // to the floor and the whole fan comes out evenly spaced — measured at a nearest-neighbour
      // CV of 0.092, which is a grid. Rejection sampling instead: a handful of hashed candidates
      // around the group centre, each further out than the last, and the first one that clears
      // `CROWD_SEED_NEAR` of its own group and `CROWD_SEED_FAR` of everybody else wins. Where a
      // group cannot find room it takes the roomiest candidate it saw, so the throw terminates.
      const reach = 0.55 + Math.sqrt(group.size) * 0.46;
      for (let member = 0; member < group.size; member += 1) {
        const index = group.start + member;
        const key = `${eventId}|s|${index}`;
        let bestSeat = null;
        let bestClear = -Infinity;
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const angle = crowdUnit(`${key}|a|${attempt}`) * Math.PI * 2;
          const grow = 1 + attempt * 0.22;
          const radius = (0.20 + crowdUnit(`${key}|r|${attempt}`) * reach) * grow;
          const candidate = {
            index,
            group: g,
            along: along + Math.cos(angle) * radius * 1.25,
            out: Math.min(frame.outer, Math.max(
              frame.inner, depth + Math.sin(angle) * radius * 0.70,
            )),
          };
          let clear = Infinity;
          for (const seat of seats) {
            const want = seat.group === g ? CROWD_SEED_NEAR : CROWD_SEED_FAR;
            clear = Math.min(clear, Math.hypot(
              seat.along - candidate.along, seat.out - candidate.out,
            ) / want);
          }
          if (clear > bestClear) { bestClear = clear; bestSeat = candidate; }
          if (clear >= 1) break;
        }
        seats.push(bestSeat);
      }
    });

    // —— 3. relax, clamp, gate ————————————————————————————————————————————————————————
    const clamp = (seat) => {
      seat.out = Math.min(frame.outer, Math.max(frame.inner, seat.out));
      seat.along = Math.min(span + 0.8, Math.max(-span - 0.8, seat.along));
    };
    for (let pass = 0; pass < CROWD_RELAX_PASSES; pass += 1) {
      for (let a = 0; a < seats.length; a += 1) {
        for (let b = a + 1; b < seats.length; b += 1) {
          const da = seats[a].along - seats[b].along;
          const db = seats[a].out - seats[b].out;
          const gap = Math.hypot(da, db);
          if (gap >= CROWD_MIN_SPACING) continue;
          // Coincident pairs are separated along the frontage, which is where the room is.
          const nx = gap > 1e-6 ? da / gap : 1;
          const nz = gap > 1e-6 ? db / gap : 0;
          const push = (CROWD_MIN_SPACING - gap) * 0.55 + 1e-3;
          seats[a].along += nx * push;
          seats[a].out += nz * push;
          seats[b].along -= nx * push;
          seats[b].out -= nz * push;
        }
      }
      for (const seat of seats) clamp(seat);
    }

    const positions = new Array(count);
    for (const seat of seats) {
      const point = this._crowdStand(box, frame, seat.along, seat.out);
      positions[seat.index] = {
        x: point.x,
        z: point.z,
        rank: Math.min(1, Math.max(0, (seat.out - frame.inner) / depthSpan)),
      };
    }

    // The gate moves people, and two people it moves can land on each other — which is how the
    // old layout put six figures on one lattice node. So the spacing floor is re-imposed in
    // WORLD space after the gate, and a push that would put somebody inside a footprint is
    // reverted rather than taken. Fixed passes, fixed order: deterministic.
    for (let pass = 0; pass < CROWD_RELAX_PASSES; pass += 1) {
      let moved = false;
      for (let a = 0; a < count; a += 1) {
        for (let b = a + 1; b < count; b += 1) {
          const dx = positions[a].x - positions[b].x;
          const dz = positions[a].z - positions[b].z;
          const gap = Math.hypot(dx, dz);
          if (gap >= CROWD_MIN_SPACING) continue;
          const nx = gap > 1e-6 ? dx / gap : frame.ux;
          const nz = gap > 1e-6 ? dz / gap : frame.uz;
          const push = (CROWD_MIN_SPACING - gap) * 0.55 + 1e-3;
          for (const [end, sign] of [[positions[a], 1], [positions[b], -1]]) {
            const x = end.x + nx * push * sign;
            const z = end.z + nz * push * sign;
            // The band is a hard edge here too. A push that shoves somebody back toward the
            // front fence to buy 20 mm of elbow room is the M6 fault re-entering by the side
            // door, so it is declined rather than taken.
            const out = (x - box.x) * frame.nx + (z - box.z) * frame.nz - frame.halfNormal;
            if (out < frame.inner || out > frame.outer + 0.35) continue;
            if (this.isInsideBuilding(x, z)) continue;
            end.x = x;
            end.z = z;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }

    // **The relaxation has a tail and the tail is the thing that shows.** Measured before this
    // pass over 489 parcels × 5 seeds at forty bidders: 8 pairs of 381,420 still under 1.06 m,
    // worst 0.726 — two people occupying each other, on a plate, once every sixty crowds. A mean
    // does not close that any more than it closes a score. So any residual pair is opened by
    // walking the later of the two along the frontage in fixed steps until it is clear of
    // everybody, in band, and outside every footprint. Fixed order, fixed step: deterministic.
    const inBand = (x, z) => {
      const out = (x - box.x) * frame.nx + (z - box.z) * frame.nz - frame.halfNormal;
      const side = Math.abs((x - box.x) * frame.ux + (z - box.z) * frame.uz);
      return out >= frame.inner && out <= frame.outer + 0.35 && side <= span + 3.0;
    };
    const clearOf = (x, z, self) => {
      let worst = Infinity;
      for (let other = 0; other < count; other += 1) {
        if (other === self) continue;
        worst = Math.min(worst, Math.hypot(positions[other].x - x, positions[other].z - z));
      }
      return worst;
    };
    for (let a = 0; a < count; a += 1) {
      for (let b = a + 1; b < count; b += 1) {
        const gap = Math.hypot(
          positions[a].x - positions[b].x, positions[a].z - positions[b].z,
        );
        if (gap >= CROWD_MIN_SPACING) continue;
        let bestX = positions[b].x;
        let bestZ = positions[b].z;
        let bestClear = gap;
        for (let step = 1; step <= 16 && bestClear < CROWD_MIN_SPACING; step += 1) {
          for (const side of [-1, 1]) {
            const reach = step * 0.16 * side;
            const x = positions[b].x + frame.ux * reach;
            const z = positions[b].z + frame.uz * reach;
            if (!inBand(x, z) || this.isInsideBuilding(x, z)) continue;
            const clear = clearOf(x, z, b);
            if (clear <= bestClear) continue;
            bestX = x;
            bestZ = z;
            bestClear = clear;
            if (clear >= CROWD_MIN_SPACING) break;
          }
        }
        // Where the floor is unreachable the roomiest legal stand still beats the one that was
        // there. Reported rather than hidden: the sweep's `closest pair` is this number.
        positions[b].x = bestX;
        positions[b].z = bestZ;
      }
    }

    // —— 4. facing ————————————————————————————————————————————————————————————————————
    const focusAlong = (crowdUnit(`${eventId}|focus`) - 0.5) * frame.halfLateral * 0.5;
    const focus = fanPoint(box, frame, focusAlong, CROWD_FOCUS_STANDOFF);
    for (let index = 0; index < count; index += 1) {
      const stand = positions[index];
      let toX = focus.x - stand.x;
      let toZ = focus.z - stand.z;
      // A share of the crowd is talking to whoever is next to them rather than watching.
      if (crowdUnit(`${eventId}|chat|${index}`) < 0.22) {
        let near = -1;
        let best = 2.6;
        for (let other = 0; other < count; other += 1) {
          if (other === index) continue;
          const gap = Math.hypot(
            positions[other].x - stand.x, positions[other].z - stand.z,
          );
          if (gap < best) { best = gap; near = other; }
        }
        if (near >= 0) {
          toX = (positions[near].x - stand.x) * 0.78 + toX * 0.22;
          toZ = (positions[near].z - stand.z) * 0.78 + toZ * 0.22;
        }
      }
      const deviation = (crowdUnit(`${eventId}|dev|${index}`) - 0.5) * 0.62;
      stand.facing = Math.atan2(toZ, toX) + deviation;
      // Crown-to-sole metres, on the same 1.56 m centre and the same ±8 per cent spread the
      // street and the cast are built at, so a bidder and a passer-by are one population.
      stand.height = 1.56
        * (0.925 + (((hash32(`${eventId}:h:${index}`) >>> 3) % 32) / 31) * 0.155);
      delete stand.seat;
    }
    return positions;
  }

  /**
   * One legal stand in the frontage frame, preferring `(along, out)`. Deterministic: every
   * search below is a fixed-step scan, and the absolute gate still wins over the composition.
   */
  _crowdStand(box, frame, along, out) {
    const ideal = fanPoint(box, frame, along, out);
    if (!this.isInsideBuilding(ideal.x, ideal.z)) return ideal;

    // Toward the street first. On the frontage the room is always outward, and a bidder pushed
    // that way stays in front of the same house rather than migrating along the terrace.
    for (let step = CROWD_PUSH_STEP; step <= CROWD_PUSH_MAX; step += CROWD_PUSH_STEP) {
      const point = fanPoint(box, frame, along, out + step);
      if (!this.isInsideBuilding(point.x, point.z)) return point;
    }
    // Then along the frontage, nearest first, so the fan stays a fan.
    for (let step = CROWD_SLIDE_STEP; step <= CROWD_SLIDE_MAX; step += CROWD_SLIDE_STEP) {
      for (const side of [-1, 1]) {
        const point = fanPoint(box, frame, along + side * step, out);
        if (!this.isInsideBuilding(point.x, point.z)) return point;
      }
    }
    return this.projectWalkable(ideal.x, ideal.z);
  }

  stats() {
    return {
      nodes: this.nodes.size,
      anchors: this.anchors.size,
      footprints: this.footprints.length,
      versionKey: this.versionKey,
    };
  }

  dispose() {
    this.nodes.clear();
    this.edges.clear();
    this.anchors.clear();
    this.footprints = [];
    this.city = null;
    this.versionKey = '';
  }
}

export default NavMesh;
