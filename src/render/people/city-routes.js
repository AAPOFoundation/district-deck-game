// District Deck V3.70 L2 — the footpath lattice, and one person's errand on it.
//
// **Why this file exists.** Until now a story walker was steered: `city-wander.js` lerped toward
// whichever place the current beat named and leaned on a nearest-face push to keep it out of the
// buildings. Measured over a full story day on two seeds (`mvp/tests/v370-l2-pavement.mjs`), that
// put 16.22% of every street sample on a carriageway, a tram reservation or the middle of an
// intersection, and the drift across a road happened wherever the straight line happened to
// reach it. A steering rule cannot fix that, because the thing it is missing is not a correction
// — it is a *route*.
//
// So: build the graph the pavement actually is, ask it for a path, and walk the path.
//
//   1. **Nodes** are the four kerb corners of every junction, at the footpath centrelines
//      `CORRIDOR.footpathCentreLow` / `High` — the same two insets `city-places.js` stands a
//      walker on.
//   2. **Run edges** join adjacent junctions along one corridor on one side. A run is the length
//      of a block frontage and crosses no road.
//   3. **Crossing edges** join the two sides of one corridor *at* a junction, which is where the
//      tactile pads and the zebra are. Crossing anywhere else is not representable.
//   4. **Corner turns are free** because a corner is one node serving both corridors.
//
// A route is then Dijkstra over ~100 nodes, with a crossing surcharge so a walker prefers to
// stay on the side of the street it started on and crosses when the errand needs it.
//
// The polyline is filleted at every corner and arc-length parameterised, so the tangent — and
// therefore the figure's yaw — turns over a metre of arc instead of stepping. The walker's
// distance along it is a **pure function of its own clock**, through a trapezoidal speed profile
// per leg: a push-off out of every dwell, a decelerating step into the next one, and a constant
// cruise between. That is what lets `ambient-life.js` hand `rig.js` a distance-locked cycle phase
// and get a planted foot by construction rather than by correction.
//
// Deterministic: no `Math.random`, no clock, no sim reads. Salt namespace 900–949, which is clear
// of core 0–99, figure 100–199, head 200–299, wardrobe 300–399, rig 400–499, materials 500–599,
// cast 600–699, ambient 700–799 and stories 850–899.

import { CORRIDOR, PITCH, ROAD } from '../../core/grid.js';
import { unitFrom } from './core.js';
import { corridorCell } from './city-surface.js';
import { pavementFront } from './city-places.js';

export const ROUTE_SALT = Object.freeze({
  LANE: 900,
  PHASE: 901,
  DWELL: 902,
});

/** Adult walk, metres per second. The one `city-wander.js` publishes; restated by import there. */
export const CRUISE_SPEED = 1.4;

/**
 * Metres the walker spends accelerating out of a stand and decelerating into one.
 *
 * One stride, near enough: §2.7 asks that "stopping is a decelerating step, not a freeze" and
 * "starting is a push-off, not an instant velocity", and a step is the unit both are measured in.
 * Shorter and the profile is a jerk; longer and a walker crawls the last three metres of a
 * fifty-metre leg.
 */
export const RAMP_METRES = 1.15;

/** Corner fillet radius. A pedestrian rounds a kerb corner; it does not pivot on the spot. */
export const CORNER_RADIUS = 1.45;

/** Seconds a walker holds at each place before the next leg. Long enough to read as an errand. */
export const DWELL_SECONDS = 5.5;

/**
 * What a crossing costs, in metres of detour a walker will accept to avoid one.
 *
 * Not a safety model — a legibility one. With no surcharge the graph crosses and re-crosses a
 * road for a metre of saving, and a pedestrian who zig-zags across a street four times on one
 * errand reads as lost rather than as busy.
 */
const CROSSING_SURCHARGE = 26;

/** Half-width the walker may sit either side of the footpath centreline, metres. */
const LANE_HALF = 0.55;

const TWO_PI = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

const INSET = [CORRIDOR.footpathCentreLow, CORRIDOR.footpathCentreHigh];

const nodeKey = (i, sx, j, sz) => `${i}:${sx}:${j}:${sz}`;

/**
 * The four kerb corners of every junction, and the runs and crossings between them.
 *
 * @param {object} city
 * @returns {{ nodes: Map, blocksX: number, blocksZ: number }}
 */
export function buildFootpathGraph(city) {
  const blocksX = city?.blocksX ?? 0;
  const blocksZ = city?.blocksZ ?? 0;
  const nodes = new Map();
  const add = (i, sx, j, sz) => {
    const key = nodeKey(i, sx, j, sz);
    if (nodes.has(key)) return nodes.get(key);
    const node = {
      key,
      i,
      j,
      sx,
      sz,
      x: i * PITCH + INSET[sx],
      z: j * PITCH + INSET[sz],
      edges: [],
    };
    nodes.set(key, node);
    return node;
  };
  for (let i = 0; i <= blocksX; i += 1) {
    for (let j = 0; j <= blocksZ; j += 1) {
      for (let sx = 0; sx < 2; sx += 1) for (let sz = 0; sz < 2; sz += 1) add(i, sx, j, sz);
    }
  }
  const link = (a, b, crossing) => {
    if (!a || !b) return;
    const cost = Math.hypot(a.x - b.x, a.z - b.z) + (crossing ? CROSSING_SURCHARGE : 0);
    a.edges.push({ to: b.key, cost, crossing });
    b.edges.push({ to: a.key, cost, crossing });
  };
  for (let i = 0; i <= blocksX; i += 1) {
    for (let j = 0; j <= blocksZ; j += 1) {
      const at = (ii, sx, jj, sz) => nodes.get(nodeKey(ii, sx, jj, sz));
      // Runs along a vertical corridor, past one block frontage.
      if (j < blocksZ) {
        for (let sx = 0; sx < 2; sx += 1) link(at(i, sx, j, 1), at(i, sx, j + 1, 0), false);
      }
      // Runs along a horizontal corridor.
      if (i < blocksX) {
        for (let sz = 0; sz < 2; sz += 1) link(at(i, 1, j, sz), at(i + 1, 0, j, sz), false);
      }
      // Crossings, at the junction and nowhere else.
      for (let sx = 0; sx < 2; sx += 1) link(at(i, sx, j, 0), at(i, sx, j, 1), true);
      for (let sz = 0; sz < 2; sz += 1) link(at(i, 0, j, sz), at(i, 1, j, sz), true);
    }
  }
  return { nodes, blocksX, blocksZ };
}

function withinBoard(graph, x, z) {
  const maxX = graph.blocksX * PITCH + ROAD;
  const maxZ = graph.blocksZ * PITCH + ROAD;
  return x >= -0.5 && z >= -0.5 && x <= maxX + 0.5 && z <= maxZ + 0.5;
}

function nearestNode(graph, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const node of graph.nodes.values()) {
    const d = Math.hypot(node.x - x, node.z - z);
    if (d < bestD) { bestD = d; best = node; }
  }
  return best;
}

/**
 * The nodes a point standing on a footpath centreline can reach without leaving it.
 *
 * **One each way, not the two nearest.** A junction corner carries two nodes 13 m apart, so on a
 * mid-block stand the two *nearest* nodes are frequently both on the same side — and the router
 * then has no way to set off in the other direction except by walking to the far one and turning
 * round. Measured on `ambient:day-15`, seed 0: a school run that starts at x = 93.4 and ends 100 m
 * east opened with a 15 m walk west to (78.5, 206.5), a 180° reversal, and 15 m back past its own
 * front door. Bracketing the point instead — nearest below, nearest above — is what a bracket
 * means and removes both the detour and the reversal.
 */
function bracketNodes(graph, x, z) {
  const cell = corridorCell(x, z);
  if (!cell || cell.kind !== 'footpath' || !withinBoard(graph, x, z)) return null;
  const side = cell.local >= ROAD / 2 ? 1 : 0;
  const along = cell.axis === 'v' ? z : x;
  const candidates = [];
  if (cell.axis === 'v') {
    const i = Math.round(cell.low / PITCH);
    for (let j = 0; j <= graph.blocksZ; j += 1) {
      for (let sz = 0; sz < 2; sz += 1) {
        const node = graph.nodes.get(nodeKey(i, side, j, sz));
        if (node) candidates.push({ node, at: node.z });
      }
    }
  } else {
    const j = Math.round(cell.low / PITCH);
    for (let i = 0; i <= graph.blocksX; i += 1) {
      for (let sx = 0; sx < 2; sx += 1) {
        const node = graph.nodes.get(nodeKey(i, sx, j, side));
        if (node) candidates.push({ node, at: node.x });
      }
    }
  }
  let below = null;
  let above = null;
  for (const c of candidates) {
    const gap = c.at - along;
    if (gap <= 0 && (!below || -gap < below.cost)) below = { node: c.node, cost: -gap };
    if (gap >= 0 && (!above || gap < above.cost)) above = { node: c.node, cost: gap };
  }
  const out = [below, above].filter(Boolean);
  return out.length ? out : null;
}

/**
 * Where a place joins the lattice.
 *
 * `entry` is on the pavement; `tail` is the open-ground walk from the pavement to the place —
 * a cafe terrace, a reserve path, a boardwalk. Those are legitimately not footpath, and the
 * pavement probe scores them as `lot` / `shore` rather than as a defect.
 */
function attach(graph, place) {
  const x = place.x;
  const z = place.z;
  const direct = bracketNodes(graph, x, z);
  if (direct) return { entry: { x, z }, tail: [], links: direct };
  const front = pavementFront(x, z);
  const viaFront = bracketNodes(graph, front.x, front.z);
  if (viaFront && Math.hypot(front.x - x, front.z - z) <= 45) {
    return { entry: { x: front.x, z: front.z }, tail: [{ x, z }], links: viaFront };
  }
  const node = nearestNode(graph, x, z);
  return { entry: { x: node.x, z: node.z }, tail: [{ x, z }], links: [{ node, cost: 0 }] };
}

/** Dijkstra between two attachment points. Returns the node polyline, entries excluded. */
function nodePath(graph, from, to) {
  const target = new Map(to.links.map(({ node, cost }) => [node.key, cost]));
  const dist = new Map();
  const prev = new Map();
  const queue = [];
  for (const { node, cost } of from.links) {
    if (!dist.has(node.key) || cost < dist.get(node.key)) {
      dist.set(node.key, cost);
      queue.push(node.key);
    }
  }
  const visited = new Set();
  let bestEnd = null;
  let bestTotal = Infinity;
  while (queue.length) {
    let pick = 0;
    for (let k = 1; k < queue.length; k += 1) {
      if (dist.get(queue[k]) < dist.get(queue[pick])) pick = k;
    }
    const key = queue.splice(pick, 1)[0];
    if (visited.has(key)) continue;
    visited.add(key);
    const d = dist.get(key);
    if (target.has(key)) {
      const total = d + target.get(key);
      if (total < bestTotal) { bestTotal = total; bestEnd = key; }
    }
    if (d >= bestTotal) continue;
    for (const edge of graph.nodes.get(key).edges) {
      const next = d + edge.cost;
      if (next < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, next);
        prev.set(edge.to, key);
        queue.push(edge.to);
      }
    }
  }
  if (!bestEnd) return [];
  const chain = [];
  let cursor = bestEnd;
  while (cursor) {
    chain.push(graph.nodes.get(cursor));
    cursor = prev.get(cursor);
  }
  chain.reverse();
  return chain.map((node) => ({ x: node.x, z: node.z }));
}

function pushPoint(list, point) {
  const last = list[list.length - 1];
  if (last && Math.hypot(last.x - point.x, last.z - point.z) < 0.05) return;
  list.push({ x: point.x, z: point.z });
}

/**
 * One leg: place A to place B, on the pavement wherever the pavement goes there.
 *
 * `openHead` / `openTail` are the metres at each end that leave the lattice — the walk off a
 * cafe terrace, across a reserve lawn, out onto a boardwalk. The caller needs them because those
 * stretches are the only ones where a walker is legitimately not on a footpath, and the
 * building-clearance guard must not shove somebody out of the frontage they are walking into.
 */
export function legPolyline(graph, a, b) {
  const from = attach(graph, a);
  const to = attach(graph, b);
  const points = [];
  // Off the place, onto the pavement, along the lattice, onto the next pavement, into the place.
  // `pushPoint` de-duplicates, so a place that already stands on a footpath contributes one point
  // rather than a zero-length tail.
  pushPoint(points, { x: a.x, z: a.z });
  pushPoint(points, from.entry);
  for (const point of nodePath(graph, from, to)) pushPoint(points, point);
  pushPoint(points, to.entry);
  pushPoint(points, { x: b.x, z: b.z });
  points.openHead = Math.hypot(from.entry.x - a.x, from.entry.z - a.z);
  points.openTail = Math.hypot(to.entry.x - b.x, to.entry.z - b.z);
  return points;
}

// ——— arc-length geometry ———————————————————————————————————————————————————————————————
//
// A polyline with square corners has an undefined tangent at every vertex, and a figure driven
// off that tangent snaps its yaw through ninety degrees in one frame. Filleting is the fix, and
// it is also what makes the feet step round the corner: the walker is on a circular arc for
// ~1.4 m, so the heading rotates continuously and the curvature is a number the caller can lean
// the body by.

function filletRoute(points, radius = CORNER_RADIUS) {
  const segments = [];
  const push = (segment) => {
    if (segment.length <= 1e-6) return;
    segment.s0 = segments.length ? segments[segments.length - 1].s1 : 0;
    segment.s1 = segment.s0 + segment.length;
    segments.push(segment);
  };
  const line = (a, b) => ({
    kind: 'line',
    ax: a.x,
    az: a.z,
    bx: b.x,
    bz: b.z,
    length: Math.hypot(b.x - a.x, b.z - a.z),
    curvature: 0,
  });

  let cursor = points[0];
  for (let index = 1; index < points.length - 1; index += 1) {
    const corner = points[index];
    const next = points[index + 1];
    // **Measured from `cursor`, not from `points[index - 1]`.** `cursor` is where the previous
    // fillet let go, which on two corners a metre apart is well past the previous vertex. Sizing
    // this corner's tangent against the *original* leg length then let it reach back behind
    // `cursor`, and `line(cursor, start)` ran backwards — a 0.43 m gap in the polyline at
    // s = 8.3 m on `ambient:day-15`, which the walker crossed in one frame and the slip probe
    // booked as a 1.05 m support-foot jump. Sizing it against what is actually left cannot.
    const inX = corner.x - cursor.x;
    const inZ = corner.z - cursor.z;
    const outX = next.x - corner.x;
    const outZ = next.z - corner.z;
    const inLen = Math.hypot(inX, inZ);
    const outLen = Math.hypot(outX, outZ);
    if (inLen < 1e-4 || outLen < 1e-4) continue;
    const ux = inX / inLen;
    const uz = inZ / inLen;
    const vx = outX / outLen;
    const vz = outZ / outLen;
    const dot = clamp(ux * vx + uz * vz, -1, 1);
    const turn = Math.acos(dot);
    if (turn < 0.02) continue; // straight through
    /**
     * **One half-angle, used for both the tangent and the radius, and never clamped apart.**
     *
     * `tangent = r · tan(θ/2)` is what makes the arc land on `end`; clamping θ for the tangent
     * and not for the radius (or the reverse) breaks that identity and the arc stops somewhere
     * else. On a near-180° reversal — which the graph produced whenever both bracket nodes sat on
     * the same side of a place — the clamp put the arc's end 0.73 m from where the following line
     * began, and the walker crossed the gap in a frame.
     *
     * The only clamp left is off π itself, where the tangent is infinite. A reversal then comes
     * out as a very tight arc, which is what a reversal is.
     */
    const half = Math.min(turn, Math.PI - 2e-3) * 0.5;
    let tangent = radius * Math.tan(half);
    // 0.9 of what is left inbound (nothing else wants it), 0.45 outbound (the next corner does).
    tangent = Math.min(tangent, inLen * 0.9, outLen * 0.45);
    if (tangent < 0.05) {
      // Too tight to fillet: walk into the corner and turn on it, rather than cutting across it.
      push(line(cursor, corner));
      cursor = corner;
      continue;
    }
    const r = tangent / Math.tan(half);
    const start = { x: corner.x - ux * tangent, z: corner.z - uz * tangent };
    const end = { x: corner.x + vx * tangent, z: corner.z + vz * tangent };
    push(line(cursor, start));
    // Centre is off the incoming segment, on the side the turn goes.
    const cross = ux * vz - uz * vx; // >0 turns one way, <0 the other
    const sign = cross >= 0 ? 1 : -1;
    const nx = -uz * sign;
    const nz = ux * sign;
    const centre = { x: start.x + nx * r, z: start.z + nz * r };
    const a0 = Math.atan2(start.z - centre.z, start.x - centre.x);
    const a1 = Math.atan2(end.z - centre.z, end.x - centre.x);
    let sweep = a1 - a0;
    while (sweep > Math.PI) sweep -= TWO_PI;
    while (sweep < -Math.PI) sweep += TWO_PI;
    push({
      kind: 'arc',
      cx: centre.x,
      cz: centre.z,
      r,
      a0,
      sweep,
      length: Math.abs(sweep) * r,
      curvature: (sweep >= 0 ? 1 : -1) / r,
    });
    cursor = end;
  }
  push(line(cursor, points[points.length - 1]));
  return segments;
}

/** Position, unit tangent and signed curvature at arc length `s`. */
export function sampleSegments(segments, s) {
  if (!segments.length) return { x: 0, z: 0, tx: 0, tz: 1, curvature: 0 };
  const total = segments[segments.length - 1].s1;
  const at = clamp(s, 0, total);
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].s1 < at) lo = mid + 1;
    else hi = mid;
  }
  const seg = segments[lo];
  const local = at - seg.s0;
  if (seg.kind === 'line') {
    const t = seg.length > 1e-9 ? local / seg.length : 0;
    const dx = (seg.bx - seg.ax) / (seg.length || 1);
    const dz = (seg.bz - seg.az) / (seg.length || 1);
    return {
      x: seg.ax + (seg.bx - seg.ax) * t,
      z: seg.az + (seg.bz - seg.az) * t,
      tx: dx,
      tz: dz,
      curvature: 0,
    };
  }
  const dir = seg.sweep >= 0 ? 1 : -1;
  const angle = seg.a0 + dir * (local / seg.r);
  const x = seg.cx + Math.cos(angle) * seg.r;
  const z = seg.cz + Math.sin(angle) * seg.r;
  // Tangent is the radius turned a quarter, in the direction of travel.
  return {
    x,
    z,
    tx: -Math.sin(angle) * dir,
    tz: Math.cos(angle) * dir,
    curvature: seg.curvature,
  };
}

// ——— the schedule ——————————————————————————————————————————————————————————————————————
//
// Distance along the route as a pure function of the walker's own clock. Every leg is a
// trapezoid: ramp up over `RAMP_METRES`, cruise, ramp down over the same, then dwell.

function legSchedule(length, cruise = CRUISE_SPEED) {
  const ramp = Math.min(RAMP_METRES, length * 0.5);
  const rampTime = ramp > 1e-6 ? (2 * ramp) / cruise : 0;
  const cruiseLen = Math.max(0, length - 2 * ramp);
  const cruiseTime = cruiseLen / cruise;
  return {
    length, ramp, rampTime, cruiseLen, cruiseTime, travel: rampTime * 2 + cruiseTime, cruise,
  };
}

/** Metres travelled `t` seconds into a leg, and the speed at that instant. */
function legDistance(sched, t) {
  const { ramp, rampTime, cruiseTime, cruise } = sched;
  if (t <= 0) return { d: 0, v: 0 };
  if (rampTime > 0 && t < rampTime) {
    const k = t / rampTime;
    return { d: ramp * k * k, v: cruise * k };
  }
  const afterUp = t - rampTime;
  if (afterUp < cruiseTime) return { d: ramp + cruise * afterUp, v: cruise };
  const down = afterUp - cruiseTime;
  if (rampTime > 0 && down < rampTime) {
    const k = down / rampTime;
    return { d: sched.length - ramp * (1 - k) * (1 - k), v: cruise * (1 - k) };
  }
  return { d: sched.length, v: 0 };
}

/**
 * Build one person's day as a closed circuit on the pavement.
 *
 * `places` is the resolved place for each story beat, in order. The circuit returns to the first,
 * so a walker who reaches the end of their day starts it again from where they are standing
 * rather than teleporting home.
 */
/**
 * Pull a polyline back inside a balustrade at build time. V3.70 L2 r3.
 *
 * The footpath lattice on the promenade runs seaward of the rail, so a route legitimately built
 * on it crosses the barrier, and `city-physics.js` `barrierBlock` then corrects the walker at
 * run time. Any run-time correction of a walker's *position* breaks the one identity this lane is
 * measured on — the odometer the stride is read against is the route's arc length, and a body
 * pushed off that route no longer travels the distance its feet are stepping. Measured with the
 * correction at run time and nothing here: cruise-band skating went 0.01 % → 0.18 % at capacity
 * 34 purely from the lateral push.
 *
 * Clamping the polyline instead moves the correction to build, where `sampleSegments` measures the
 * arc length of the *clamped* line — so the odometer and the ground agree again by construction
 * and the run-time guard never fires for a route walker. The guard stays for the drivers that
 * have no route.
 */
function clampToRails(poly, rails, standoff) {
  if (!rails?.length) return poly;
  return poly.map((point) => {
    let x = point.x;
    let z = point.z;
    for (const rail of rails) {
      const abx = rail.bx - rail.ax;
      const abz = rail.bz - rail.az;
      const length = Math.hypot(abx, abz) || 1;
      const ux = abx / length;
      const uz = abz / length;
      const t = clamp(((x - rail.ax) * ux + (z - rail.az) * uz) / length, 0, 1);
      const cx = rail.ax + ux * t * length;
      const cz = rail.az + uz * t * length;
      let nx = rail.nx ?? -uz;
      let nz = rail.nz ?? ux;
      const nn = Math.hypot(nx, nz) || 1;
      nx /= nn;
      nz /= nn;
      const toward = (x - cx) * nx + (z - cz) * nz;
      const over = toward + standoff;
      if (over > 0) { x -= nx * over; z -= nz * over; }
    }
    return { ...point, x, z };
  });
}

export function buildErrandRoute(id, places, graph, {
  cruise = CRUISE_SPEED, dwell = DWELL_SECONDS, rails = null, railStandoff = 0.52,
} = {}) {
  const raw = (places ?? []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
  /**
   * Collapse stops that are the same place under two names before any leg is built.
   *
   * The `beach-day` book runs `stairs → beach → look-sea → stairs`, and `stairs` and `look-sea`
   * resolve 0.2 m apart on the same tread. Dropping the degenerate leg *after* the fact left the
   * route with a 0.2 m gap between the leg that ended at `stairs` and the leg that started at
   * `look-sea`, and the walker stepped across it in one frame — measured as a 0.45 m support-foot
   * slip, the whole of the residual peak after the routing rewrite. Collapsing first means every
   * leg starts exactly where the previous one ended and the polyline is continuous by
   * construction rather than by a tolerance.
   */
  const stops = [];
  for (const place of raw) {
    const last = stops[stops.length - 1];
    if (last && Math.hypot(last.x - place.x, last.z - place.z) < 0.6) continue;
    stops.push(place);
  }
  while (stops.length > 1) {
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (Math.hypot(first.x - last.x, first.z - last.z) >= 0.6) break;
    stops.pop();
  }
  if (stops.length < 2) return null;
  const legs = [];
  let base = 0;
  const allSegments = [];
  for (let index = 0; index < stops.length; index += 1) {
    const a = stops[index];
    const b = stops[(index + 1) % stops.length];
    const poly = clampToRails(legPolyline(graph, a, b), rails, railStandoff);
    const segments = filletRoute(poly);
    if (!segments.length) continue;
    const length = segments[segments.length - 1].s1;
    if (!(length > 0.6)) continue;
    for (const seg of segments) {
      allSegments.push({ ...seg, s0: seg.s0 + base, s1: seg.s1 + base });
    }
    const endSample = sampleSegments(segments, length);
    const startSample = sampleSegments(segments, 0);
    legs.push({
      startYaw: Math.atan2(startSample.tx, startSample.tz),
      index: legs.length,
      base,
      to: b,
      from: a,
      /**
       * The facing this leg *ends* on, taken off the last segment's own tangent.
       *
       * Most places on this board carry no authored `yaw`, so `city-wander.js` had nothing to
       * ease a stand onto and fell through to the route tangent — which is a different tangent on
       * either side of a stop, and at a stop the walker usually turns round. Recording the
       * arrival tangent gives the stand a facing that is continuous with the walk that produced
       * it, costs one atan2 at route build, and is a pure function of the geometry.
       */
      arriveYaw: Math.atan2(endSample.tx, endSample.tz),
      // Padded by the fillet allowance, so the guard releases a shade before the walker actually
      // leaves the lattice rather than a shade after.
      openHead: poly.openHead > 0.05 ? poly.openHead + 0.8 : 0,
      openTail: poly.openTail > 0.05 ? poly.openTail + 0.8 : 0,
      sched: legSchedule(length, cruise),
      dwell,
    });
    base += length;
  }
  if (!legs.length) return null;
  /**
   * **The two turn angles a leg contains, resolved once, at build.**
   *
   * A driver that takes the shortest arc from the *current* tangent to a stand facing every frame
   * is unstable at exactly the case this exists for. A walker leaving a shop sets off back the way
   * it came, so the two facings sit near 180° apart, and at 180° the shortest arc flips sign on a
   * millidegree of tangent wobble — a 2π·weight jump in the blended yaw. Measured: the ramp band's
   * peak support-foot travel went **0.0148 → 0.1845 m/frame** and its peak ratio 2.90 → 21.12 when
   * the ease was first written per frame. Resolving the angle once, against the leg's own start
   * and end tangents, removes the degeneracy rather than damping it: the sign cannot change
   * because the number is not recomputed.
   *
   * `standYawHead` reads the *previous* leg's arrival, which is the facing the walker is actually
   * holding when it pushes off, so leg N's tail angle and leg N+1's head angle name one facing and
   * the hand-off is continuous by construction rather than by tolerance.
   */
  const shortArc = (a, b) => ((a - b + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  for (const leg of legs) {
    const prev = legs[(leg.index - 1 + legs.length) % legs.length];
    const standTail = Number.isFinite(leg.to?.yaw) ? leg.to.yaw : leg.arriveYaw;
    const standHead = Number.isFinite(leg.from?.yaw) ? leg.from.yaw : prev.arriveYaw;
    leg.headTurn = shortArc(standHead, leg.startYaw);
    leg.tailTurn = shortArc(standTail, leg.arriveYaw);
    leg.standTail = standTail;
    leg.standHead = standHead;
  }
  const cycle = legs.reduce((sum, leg) => sum + leg.sched.travel + leg.dwell, 0);
  return {
    id,
    segments: allSegments,
    legs,
    total: base,
    cycle,
    /** Which side of the footpath centreline this walker keeps to. Deterministic per person. */
    lane: (unitFrom(id, ROUTE_SALT.LANE) - 0.5) * 2 * LANE_HALF,
    /** Where in the day they start. Two neighbours must not be in lockstep. */
    phase: unitFrom(id, ROUTE_SALT.PHASE),
  };
}

/**
 * Where the walker is at `clock`, as a pure function of it.
 *
 * @returns {{ x, z, yaw, speed, moving, bank, legIndex, place, dwelling, distance }}
 */
export function routeStateAt(route, clock) {
  if (!route) return null;
  const cycle = route.cycle;
  const raw = clock + route.phase * cycle;
  let t = ((raw % cycle) + cycle) % cycle;
  /**
   * **How many whole circuits this walker has completed, and why a driver needs it. r3.**
   *
   * `distance` is a position along the route and therefore wraps to zero at the end of every
   * circuit. `rig.js` reads the walk cycle as `odometer ÷ stride`, so handing it a wrapping
   * distance steps the cycle by `frac(route.total ÷ stride)` at the wrap — a discontinuity of up
   * to half a stride. It was invisible while the arrival blend held both feet at the authored
   * stand through every stop, and `mvp/tests/v370-l2-r3-jump.mjs` found it the moment the feet
   * were left on the cycle: **0.476 m in one frame on `ambient:day-23`**, with `dist` going
   * 912.3607 → 0.0001 across the same pair of frames. A lap index makes the odometer monotone
   * and the wrap disappears; it costs one `Math.floor`.
   */
  const lap = Math.floor(raw / cycle);
  let distance = 0;
  let leg = route.legs[0];
  let speed = 0;
  let dwelling = false;
  let dwellPhase = 0;
  for (const candidate of route.legs) {
    leg = candidate;
    if (t < candidate.sched.travel) {
      const step = legDistance(candidate.sched, t);
      distance = candidate.base + step.d;
      speed = step.v;
      dwelling = false;
      t = -1;
      break;
    }
    t -= candidate.sched.travel;
    if (t < candidate.dwell) {
      distance = candidate.base + candidate.sched.length;
      speed = 0;
      dwelling = true;
      dwellPhase = candidate.dwell > 1e-6 ? t / candidate.dwell : 1;
      t = -1;
      break;
    }
    t -= candidate.dwell;
  }
  if (t >= 0) {
    // Fell off the end through floating-point drift: hold at the last stop.
    distance = route.total;
    speed = 0;
    dwelling = true;
    leg = route.legs[route.legs.length - 1];
  }
  const sample = sampleSegments(route.segments, distance);
  // Keep to one side of the footpath. Constant per person, so it separates two walkers who
  // share a corridor without nudging either of them frame to frame — a per-frame push is a
  // planted foot sliding sideways, which is the defect this lane is measured on.
  const nx = -sample.tz;
  const nz = sample.tx;
  // Off the lattice at either end of the leg: a terrace, a lawn, a boardwalk. The walker does not
  // hold a footpath lane there and the building guard must let it pass.
  const headSlack = (distance - leg.base) - leg.openHead;
  const tailSlack = (leg.base + leg.sched.length - distance) - leg.openTail;
  const onOpen = headSlack < 0 || tailSlack < 0 || dwelling;
  // The lane offset eases in and out over the metre either side of the lattice, because a
  // sideways step of half a metre in one frame is a slid foot however correct the two endpoints
  // are. It reaches zero at every stop, which is also where a walker naturally squares up.
  const lane = route.lane * clamp(Math.min(headSlack, tailSlack), 0, 1);
  return {
    onOpen,
    x: sample.x + nx * lane,
    z: sample.z + nz * lane,
    yaw: Math.atan2(sample.tx, sample.tz),
    hx: sample.tx,
    hz: sample.tz,
    speed,
    moving: speed > 1e-3,
    dwelling,
    /**
     * Lean into the turn. `v²·κ` is the lateral acceleration the walker is taking; over `g` it is
     * the angle a body balances at. Damped to 0.55 and capped, because a pedestrian rounding a
     * kerb leans, and a pedestrian rounding a kerb at a motorcycle's angle is a different film.
     */
    bank: clamp(-0.55 * (speed * speed * sample.curvature) / 9.81, -0.11, 0.11),
    curvature: sample.curvature,
    legIndex: leg.index,
    lap,
    /** Monotone metres walked since the clock started. The quantity the stride is read against. */
    odometer: lap * route.total + distance,
    place: leg.to,
    /**
     * The place this leg *left*, and where along the leg the walker is. Both published for the
     * facing ease in `city-wander.js` `routeStoryPose`.
     *
     * V3.70 r1 turned a walker's yaw from the place's facing to the route tangent in one frame at
     * the instant it pushed off, and a walker leaving a shop sets off in roughly the direction it
     * came from — so the snap was routinely near 180°, which swings a foot on a 0.15 m track
     * through 0.30 m in a frame on a body that has moved 0.05 mm. `v370-l2-r2-diag.mjs` measured
     * the residual after the settle fix at **0.4121 m**, all of it on `moving false→true`, with
     * the arrival side already at zero. §2.7 asks for a turn, not a yaw snap; the driver cannot
     * ease between two facings it is never told the first of.
     */
    from: leg.from,
    legBase: leg.base,
    legLength: leg.sched.length,
    /**
     * The facings the two ends of this leg are stood at, already resolved: a place's authored
     * `yaw` where it has one, and otherwise the tangent the walker arrived on. The head one is
     * the *previous* leg's, which is what the walker is currently holding when it pushes off, so
     * a driver easing out of a stand and a driver easing into one read the same field.
     */
    standYawTail: leg.standTail,
    standYawHead: leg.standHead,
    headTurn: leg.headTurn,
    tailTurn: leg.tailTurn,
    /**
     * How far through the stand the walker is, and the turn that stand ends on.
     *
     * **The departure turn belongs to the dwell, and finding that out cost three attempts.** A
     * walker leaving a shopfront turns through ~180°, and a 180° turn is a *pivot*: a foot on a
     * 0.15 m track sweeps 0.47 m of arc while the body covers nothing. Spend it on the push-off
     * ramp and §1.2's support-foot-over-body ratio is unbounded — measured 53 % of ramp frames
     * skating. Spend it during the stand and the same 0.47 m of arc is spread over 2.5 s of a
     * body that is not translating at all, where the honest measure is absolute foot travel and
     * the number is 5 mm a frame. It is also what a person does: you turn, *then* you walk.
     */
    dwellPhase,
    nextStartYaw: route.legs[(leg.index + 1) % route.legs.length].startYaw,
    nextHeadTurn: route.legs[(leg.index + 1) % route.legs.length].headTurn,
    distance,
  };
}

/** Total metres of the route that a walker crosses a carriageway on. Used by the probes. */
export function routeCrossingLength(route) {
  return route?.segments?.length ?? 0;
}
