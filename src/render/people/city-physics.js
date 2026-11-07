// District Deck H-LIFE — presentation pedestrian physics.
//
// Pure functions. No THREE, no clock, no Math.random, no sim-state writes.
// Ambient life and the cast Walk adapter both call this; the board's cars already
// yield to trams, but until this file a pedestrian walked through a W-class.
//
// Salt is not consumed here. Variation lives in city-wander.js.

import { groundYAt, isCarriageway, kerbStand } from './city-surface.js';
import { stream } from '../../core/rng.js';
import { JAYWALK_CHANCE_BP } from '../../core/rates.js';

/** Keep in lockstep with traffic.js LIGHT_CYCLE / sharedSignalPhase — no traffic import (THREE). */
const LIGHT_CYCLE = 13.0;

export function pedestrianSignalPhase(elapsed, axis = 'ns') {
  const t = (((elapsed % LIGHT_CYCLE) + LIGHT_CYCLE) % LIGHT_CYCLE);
  const half = LIGHT_CYCLE * 0.5;
  const owns = axis === 'ns' ? t < half : t >= half;
  if (!owns) return 'red';
  const local = axis === 'ns' ? t : t - half;
  const amberLen = 1.05;
  const greenLen = Math.max(1.2, half - amberLen);
  if (local < greenLen) return 'green';
  return 'amber';
}

export const PEDESTRIAN_RADIUS = 0.33;
/** Two risers — enough for a long frame on a stair, not enough to walk through a seawall. */
export const STEP_CLIMB = 0.40;
/** Centre keeps this much air off a building envelope. I-29 for ambient walkers. */
export const BUILDING_STANDOFF = 0.55;
export const YIELD_LOOKAHEAD = 8.5;
export const YIELD_LATERAL = 2.4;
export const TRAM_YIELD_LOOKAHEAD = 14;
export const TRAM_YIELD_LATERAL = 3.6;
export const RAIL_STANDOFF = 0.42;
/** Metres of approach over which a walker turns to the view. See `barrierBlock`. */
export const RAIL_LOOK_BAND = 1.6;
const clamp01 = (v) => (v < 0 ? 0 : (v > 1 ? 1 : v));
export const PERSONAL_SPACE = 0.74;
export const CROSSING_HALF = 8.2;

/** True when this walker is on the road, or the next stride would step onto it. */
export function approachingRoad(ped) {
  if (!ped) return false;
  if (isCarriageway(ped.x, ped.z)) return true;
  const hx = ped.hx ?? 0;
  const hz = ped.hz ?? 0;
  const n = Math.hypot(hx, hz);
  if (n < 1e-6) return false;
  return isCarriageway(ped.x + (hx / n) * 1.25, ped.z + (hz / n) * 1.25);
}

/**
 * Yield used by walkers on a daily loop. Footpath traffic must not freeze
 * for a parallel car in the near lane — that pinned seed-0 streets still.
 * Dedicated kerb waiters keep calling `shouldYield` so a tram still owns the box.
 */
/** Axis of the road a walker is about to cross (NS road if they walk EW). */
export function crossingAxisForPed(ped) {
  return Math.abs(ped?.hx ?? 0) >= Math.abs(ped?.hz ?? 0) ? 'ns' : 'ew';
}

/** Walk is legal when cars on the crossed axis are red. */
export function pedestrianWalkAllowed(elapsed, ped) {
  if (!Number.isFinite(elapsed) || !ped) return true;
  return pedestrianSignalPhase(elapsed, crossingAxisForPed(ped)) === 'red';
}

export function vehicleAxisFromYaw(yaw) {
  return Math.abs(Math.sin(yaw ?? 0)) >= Math.abs(Math.cos(yaw ?? 0)) ? 'ew' : 'ns';
}

/**
 * A car (not a tram) at this zebra, on the road the pedestrian is crossing,
 * either rolling or sitting on a green/amber about to go.
 */
export function vehicleReadyAtCrossing(vehicle, crossing, elapsed) {
  if (!vehicle || vehicle.kind === 'tram' || !crossing?.signalised) return false;
  if (!Number.isFinite(vehicle.x) || !Number.isFinite(vehicle.z)) return false;
  const dist = Math.hypot(vehicle.x - crossing.x, vehicle.z - crossing.z);
  if (dist > 16) return false;
  if (!occupiesCrossing(vehicle, crossing) && dist > 12) return false;
  const axis = vehicleAxisFromYaw(vehicle.yaw);
  const phase = Number.isFinite(elapsed) ? pedestrianSignalPhase(elapsed, axis) : 'green';
  const moving = (vehicle.speed ?? 0) > 0.35;
  return moving || phase === 'green' || phase === 'amber';
}

export function conflictingReadyVehicle(ped, vehicles, crossings, elapsed) {
  const crossing = (crossings ?? []).find((row) =>
    row.signalised && nearCrossing(ped, row, 11.2));
  if (!crossing) return null;
  const road = crossingAxisForPed(ped);
  for (const vehicle of vehicles ?? []) {
    if (vehicleAxisFromYaw(vehicle.yaw) !== road) continue;
    if (!vehicleReadyAtCrossing(vehicle, crossing, elapsed)) continue;
    return { vehicle, crossing };
  }
  return null;
}

/** Jaywalk only when a conflicting car is at the light and ready to move. */
export function isJaywalking(seed, id, elapsed, readyVehicle = null) {
  if (!readyVehicle) return false;
  if (seed == null || id == null || !Number.isFinite(elapsed)) return false;
  const cycle = Math.floor(elapsed / LIGHT_CYCLE);
  return stream(String(seed), `jaywalk:${id}:${cycle}`).int(0, 9999) < JAYWALK_CHANCE_BP;
}

/**
 * Real volume overlap at a signalised zebra: moving car, pedestrian on the
 * carriageway, boxes interpenetrate. Inflated published boxes must sink in,
 * not just graze, or this becomes a phantom hit.
 */
export function detectPedestrianHits(vehicles, pedestrians, crossings = [], elapsed = null) {
  const hits = [];
  for (const ped of pedestrians ?? []) {
    if (!ped || !Number.isFinite(ped.x) || !Number.isFinite(ped.z)) continue;
    if (!isCarriageway(ped.x, ped.z)) continue;
    const crossing = (crossings ?? []).find((row) =>
      row.signalised && nearCrossing(ped, row, 8.5));
    if (!crossing) continue;
    const road = crossingAxisForPed(ped);
    for (const vehicle of vehicles ?? []) {
      if (vehicle.kind === 'tram') continue;
      if ((vehicle.speed ?? 0) < 1.15) continue;
      if (vehicleAxisFromYaw(vehicle.yaw) !== road) continue;
      if (!occupiesCrossing(vehicle, crossing)
        && Math.hypot(vehicle.x - crossing.x, vehicle.z - crossing.z) > 10) continue;
      // Negative clearance = the body actually contains the person.
      if (obbClearance(ped.x, ped.z, vehicle, 0) >= -0.08) continue;
      hits.push({ ped, vehicle, crossing });
      break;
    }
  }
  return hits;
}

export function trafficYield(ped, vehicles, crossings = [], signal = null) {
  // On the carriageway, wait for the vehicle that owns the box. On the kerb,
  // overlapping a published car hull is a slide, not a freeze — freezing both
  // the walker and the car is how a footpath crowd jammed a lane.
  if (approachingRoad(ped)) return shouldYield(ped, vehicles, crossings, signal);
  return {
    yield: false,
    reason: null,
    lookYaw: Math.atan2(ped.hx ?? 0, ped.hz ?? 0),
    vehicle: null,
  };
}

/**
 * Push a point just outside a vehicle OBB. Prefers the lateral face that is
 * not the carriageway, so a walker pops onto the kerb rather than into the lane.
 */
export function slideOffVehicle(px, pz, vehicle, pad = PEDESTRIAN_RADIUS + 0.12) {
  if (!vehicle || !Number.isFinite(vehicle.x) || !Number.isFinite(vehicle.z)) {
    return { x: px, z: pz, hit: false };
  }
  if (obbClearance(px, pz, vehicle, pad) >= 0) return { x: px, z: pz, hit: false };
  const hx = Math.sin(vehicle.yaw ?? 0);
  const hz = Math.cos(vehicle.yaw ?? 0);
  const dx = px - vehicle.x;
  const dz = pz - vehicle.z;
  const along = dx * hx + dz * hz;
  const lat = dx * -hz + dz * hx;
  const needLat = (vehicle.halfWidth ?? 1) + pad + 0.04;
  const candidates = [];
  for (const sign of [lat >= 0 ? 1 : -1, lat >= 0 ? -1 : 1]) {
    const x = vehicle.x + hx * along + (-hz) * sign * needLat;
    const z = vehicle.z + hz * along + hx * sign * needLat;
    candidates.push({ x, z, road: isCarriageway(x, z) });
  }
  const pick = candidates.find((row) => !row.road) ?? candidates[0];
  return { x: pick.x, z: pick.z, hit: true };
}

/**
 * Walkers who have sunk into a hull are put back on the kerb. Applied after
 * the walk step so a car can leave; the walker does not wait inside the box.
 */
export function clearVehicleHulls(x, z, vehicles, pad = PEDESTRIAN_RADIUS) {
  let px = x;
  let pz = z;
  let hit = false;
  for (const vehicle of vehicles ?? []) {
    if (obbClearance(px, pz, vehicle, pad) >= 0) continue;
    const slide = slideOffVehicle(px, pz, vehicle, pad);
    px = slide.x;
    pz = slide.z;
    hit = true;
  }
  if (hit && isCarriageway(px, pz) && !isCarriageway(x, z)) {
    const kerb = kerbStand(x, z);
    px = kerb.x;
    pz = kerb.z;
  }
  return { x: px, z: pz, hit };
}

export function nearestFlight(x, z, flights) {
  let best = null;
  let bestD = Infinity;
  for (const flight of flights ?? []) {
    if (!Number.isFinite(flight.originX) || !Number.isFinite(flight.originZ)) continue;
    const d = Math.hypot(x - flight.originX, z - flight.originZ);
    if (d < bestD) {
      bestD = d;
      best = flight;
    }
  }
  return best;
}

/**
 * Bind a proposed foot to the surface under it.
 *
 * A riser or a kerb is climbed. A seawall or a deck edge is not walked through —
 * the step is refused and the walker is steered toward the nearest flight so they
 * climb the stairs instead of skating into the mass.
 */
export function resolveSurfaceStep(fromX, fromZ, fromY, toX, toZ, world) {
  const fromSurface = sampleStairs(fromX, fromZ, world?.flights)?.y
    ?? groundYAt(fromX, fromZ, world, 0);
  const startY = Number.isFinite(fromY) ? fromY : fromSurface;
  const stair = sampleStairs(toX, toZ, world?.flights);
  const toY = stair ? stair.y : groundYAt(toX, toZ, world, 0);
  const rise = toY - startY;
  if (Math.abs(rise) <= STEP_CLIMB) {
    return {
      x: toX,
      z: toZ,
      y: toY,
      climbed: Math.abs(rise) > 0.04,
      blocked: false,
      onStair: Boolean(stair?.onStair),
    };
  }
  const flight = nearestFlight(fromX, fromZ, world?.flights);
  if (flight) {
    const dx = flight.originX - fromX;
    const dz = flight.originZ - fromZ;
    const n = Math.hypot(dx, dz) || 1;
    const step = Math.min(0.55, n);
    const nx = fromX + (dx / n) * step;
    const nz = fromZ + (dz / n) * step;
    const onto = sampleStairs(nx, nz, world.flights);
    const ny = onto ? onto.y : groundYAt(nx, nz, world, 0);
    if (Math.abs(ny - startY) <= STEP_CLIMB + 0.02) {
      return {
        x: nx,
        z: nz,
        y: ny,
        climbed: true,
        blocked: false,
        onStair: Boolean(onto?.onStair),
        intent: 'climb',
      };
    }
  }
  return {
    x: fromX,
    z: fromZ,
    y: fromSurface,
    climbed: false,
    blocked: true,
  };
}

/**
 * Oriented box vs point, expanded by `pad`. Positive is clear air.
 * Same SAT half as traffic-physics.test.mjs so a car box means the same thing here.
 */
export function obbClearance(px, pz, box, pad = 0) {
  const hx = Math.sin(box.yaw);
  const hz = Math.cos(box.yaw);
  const dx = px - box.x;
  const dz = pz - box.z;
  const along = dx * hx + dz * hz;
  const lat = dx * -hz + dz * hx;
  const da = Math.abs(along) - box.halfLength - pad;
  const dl = Math.abs(lat) - box.halfWidth - pad;
  return Math.max(da, dl);
}

/**
 * Will this pedestrian's next few metres meet this road user?
 * Trams win: longer look-ahead, wider lateral, yield even when dwelling on the track.
 */
export function conflictsWithVehicle(ped, vehicle) {
  if (!vehicle || !Number.isFinite(vehicle.x) || !Number.isFinite(vehicle.z)) return false;
  const hx = ped.hx ?? 0;
  const hz = ped.hz ?? 0;
  const heading = Math.hypot(hx, hz);
  const dx0 = vehicle.x - ped.x;
  const dz0 = vehicle.z - ped.z;
  if (heading < 1e-6) {
    const pad = PEDESTRIAN_RADIUS + (vehicle.halfLength ?? 2) + 0.6;
    return Math.hypot(dx0, dz0) < pad;
  }
  const ux = hx / heading;
  const uz = hz / heading;
  const tram = vehicle.kind === 'tram';
  const look = tram ? TRAM_YIELD_LOOKAHEAD : YIELD_LOOKAHEAD;
  const latPad = tram ? TRAM_YIELD_LATERAL : YIELD_LATERAL;
  const pad = PEDESTRIAN_RADIUS + 0.15;

  const dx = vehicle.x - ped.x;
  const dz = vehicle.z - ped.z;
  const ahead = dx * ux + dz * uz;
  const lat = dx * -uz + dz * ux;
  if (ahead < -(vehicle.halfLength ?? 2) - 0.4) return false;
  if (ahead > look + (vehicle.halfLength ?? 2)) return false;
  if (Math.abs(lat) > latPad + (vehicle.halfWidth ?? 1.2) + pad) return false;

  const vhx = Math.sin(vehicle.yaw ?? 0);
  const vhz = Math.cos(vehicle.yaw ?? 0);
  const towardPed = (ped.x - vehicle.x) * vhx + (ped.z - vehicle.z) * vhz;
  const moving = (vehicle.speed ?? 0) > 0.25;
  if (tram) {
    // A stopped tram on this crossing is still a tram. Walk around the ends, not through it.
    return towardPed > -(vehicle.halfLength ?? 7) - 1.2;
  }
  if (!moving && towardPed < -(vehicle.halfLength ?? 2)) return false;
  return towardPed > -(vehicle.halfLength ?? 2) - 0.8;
}

/**
 * Vehicle still owns, or is about to own, this junction. Trams get a longer
 * approach so a kerb waiter freezes before the hull sits on the zebra.
 */
export function occupiesCrossing(vehicle, crossing) {
  if (!vehicle || !crossing) return false;
  if (!Number.isFinite(vehicle.x) || !Number.isFinite(vehicle.z)) return false;
  const dx = vehicle.x - crossing.x;
  const dz = vehicle.z - crossing.z;
  const dist = Math.hypot(dx, dz);
  const look = vehicle.kind === 'tram' ? TRAM_YIELD_LOOKAHEAD : YIELD_LOOKAHEAD;
  const half = vehicle.halfLength ?? 2;
  if (dist > look + half) return false;
  const vhx = Math.sin(vehicle.yaw ?? 0);
  const vhz = Math.cos(vehicle.yaw ?? 0);
  // Must be on this corridor. Visual yaw on a W-class is 90° off travel;
  // a southbound hull must not "own" an east-west zebra.
  const lat = Math.abs(dx * -vhz + dz * vhx);
  if (lat > (vehicle.halfWidth ?? 1.3) + 2.6) return false;
  const aheadToCross = -dx * vhx - dz * vhz;
  return aheadToCross > -half - 0.8;
}

export function nearCrossing(ped, crossing, radius = 10.8) {
  if (!ped || !crossing) return false;
  return Math.hypot(ped.x - crossing.x, ped.z - crossing.z) <= radius;
}

function yieldReason(vehicle) {
  return vehicle.kind === 'tram' ? 'wait-tram'
    : vehicle.kind === 'bus' ? 'wait-bus'
      : 'wait-car';
}

/**
 * @returns {{ yield: boolean, reason: string|null, lookYaw: number, vehicle: object|null }}
 */
export function shouldYield(ped, vehicles, crossings = [], signal = null) {
  const headingYaw = Math.atan2(ped.hx ?? 0, ped.hz ?? 0);
  const elapsed = signal?.elapsed;
  if (Number.isFinite(elapsed)) {
    const nearSignal = (crossings ?? []).some((crossing) =>
      crossing.signalised && nearCrossing(ped, crossing, 11.2));
    if (nearSignal) {
      const walk = pedestrianWalkAllowed(elapsed, ped);
      const ready = conflictingReadyVehicle(ped, vehicles, crossings, elapsed);
      const jay = approachingRoad(ped)
        && isJaywalking(signal.seed, signal.id, elapsed, ready?.vehicle ?? null);
      if (!walk && !jay) {
        return {
          yield: true,
          reason: 'wait-signal',
          lookYaw: headingYaw,
          vehicle: null,
        };
      }
    }
  }
  let best = null;
  let bestAhead = Infinity;
  for (const vehicle of vehicles ?? []) {
    if (!conflictsWithVehicle(ped, vehicle)) continue;
    const hx = ped.hx ?? 0;
    const hz = ped.hz ?? 0;
    const n = Math.hypot(hx, hz) || 1;
    const ahead = ((vehicle.x - ped.x) * hx + (vehicle.z - ped.z) * hz) / n;
    if (ahead < bestAhead) {
      bestAhead = ahead;
      best = vehicle;
    }
  }
  for (const crossing of crossings ?? []) {
    if (!nearCrossing(ped, crossing)) continue;
    for (const vehicle of vehicles ?? []) {
      if (!occupiesCrossing(vehicle, crossing)) continue;
      const dist = Math.hypot(vehicle.x - ped.x, vehicle.z - ped.z);
      if (dist < bestAhead) {
        bestAhead = dist;
        best = vehicle;
      }
    }
  }
  if (!best) {
    return { yield: false, reason: null, lookYaw: headingYaw, vehicle: null };
  }
  const lookYaw = Math.atan2(best.x - ped.x, best.z - ped.z);
  return { yield: true, reason: yieldReason(best), lookYaw, vehicle: best };
}

/**
 * Height on a stair flight. Origin is the top landing centre.
 * `seaward` points down the flight (deck → sand). `along` is across the treads.
 *
 * Tread 0 is the deck. Each `run` of seaward travel drops one `rise`.
 * Off the flight returns null so the caller keeps its own ground.
 */
export function sampleStair(x, z, flight) {
  if (!flight) return null;
  const dx = x - flight.originX;
  const dz = z - flight.originZ;
  const along = dx * flight.alongX + dz * flight.alongZ;
  const out = dx * flight.seawardX + dz * flight.seawardZ;
  const half = (flight.width ?? 2.2) * 0.5 + 0.08;
  if (Math.abs(along) > half) return null;
  const length = (flight.count ?? 8) * (flight.run ?? 0.52);
  if (out < -0.18 || out > length + 0.22) return null;
  const run = flight.run ?? 0.52;
  const rise = flight.rise ?? 0.17;
  const count = flight.count ?? 8;
  if (out <= 0) {
    return {
      y: flight.deckY, tread: 0, onStair: false, onLanding: true, grade: 0,
    };
  }
  if (out >= length) {
    return {
      y: flight.sandY, tread: count, onStair: false, onLanding: true, grade: 0,
    };
  }
  const tread = Math.min(count - 1, Math.max(0, Math.floor(out / run)));
  const y = flight.deckY - (tread + 1) * rise;
  const grade = rise / run;
  return {
    y: Math.max(flight.sandY, y), tread, onStair: true, onLanding: false, grade,
  };
}

export function sampleStairs(x, z, flights) {
  for (const flight of flights ?? []) {
    const hit = sampleStair(x, z, flight);
    if (hit) return hit;
  }
  return null;
}

/**
 * Distance from a point to a finite rail segment, and the outward normal.
 */
export function railProximity(x, z, rail) {
  const abx = rail.bx - rail.ax;
  const abz = rail.bz - rail.az;
  const length = Math.hypot(abx, abz) || 1;
  const ux = abx / length;
  const uz = abz / length;
  const apx = x - rail.ax;
  const apz = z - rail.az;
  const t = Math.max(0, Math.min(1, (apx * ux + apz * uz) / length));
  const cx = rail.ax + ux * t * length;
  const cz = rail.az + uz * t * length;
  const dx = x - cx;
  const dz = z - cz;
  const dist = Math.hypot(dx, dz);
  // Normal: prefer the authored seaward if present, else the left-of-run perpendicular.
  let nx = rail.nx ?? -uz;
  let nz = rail.nz ?? ux;
  const nn = Math.hypot(nx, nz) || 1;
  nx /= nn;
  nz /= nn;
  return {
    dist, t, cx, cz, nx, nz, toward: dx * nx + dz * nz,
  };
}

function segmentsCross(ax, az, bx, bz, cx, cz, dx, dz) {
  const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
  if (Math.abs(den) < 1e-9) return false;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
  const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
  return t >= -0.02 && t <= 1.02 && u >= 0 && u <= 1;
}

/**
 * If the step from (x,z) along (hx,hz) would cross a rail, stop short and face the view.
 */
export function barrierBlock(x, z, hx, hz, rails, radius = RAIL_STANDOFF) {
  const heading = Math.hypot(hx, hz);
  const ux = heading > 1e-6 ? hx / heading : 0;
  const uz = heading > 1e-6 ? hz / heading : 0;
  const step = Math.max(0.45, heading);
  const nx = x + ux * step;
  const nz = z + uz * step;
  let best = null;
  /**
   * **The clamp runs on every frame; only the *stop* is predicated. r3.**
   *
   * Keeping the position correction behind `crossed || approaching` made it a step function: a
   * walker sat 1.43 m seaward of the rail with the guard dormant, the predicate fired, and the
   * whole 1.43 m was paid in one frame. Whether the walker is past the railing is a property of
   * where it is, not of where it is going, so the clamp is unconditional and continuous. Stopping
   * it and turning it to the view still needs the intent test, because a walker merely grazing
   * the standoff on its way along the promenade should keep walking.
   */
  let pushX = 0;
  let pushZ = 0;
  /**
   * **And the look is a weight, not a switch. r3.**
   *
   * `yaw = rail.lookYaw` on the frame the predicate fires is a yaw snap of up to π, and §2.7 fails
   * a yaw snap outright. Measured after the position clamp landed, the residual was **0.49 m of
   * foot travel on a body that moved 0.11 m**, `ambient:day-99` @ 4433, entirely from the facing
   * going −1.9227 → 1.5708 between two frames — the feet swinging round a root that turned 3.49
   * rad in 16 ms.
   *
   * So the caller is handed a weight that is continuous in the walker's own position and heading:
   * it rises from zero over the last `RAIL_LOOK_BAND` metres of the approach and is scaled by how
   * squarely the walker is facing the rail, so somebody walking *along* the promenade is not
   * turned to face the sea by passing near it.
   */
  let lookWeight = 0;
  let lookYaw = Math.atan2(hx, hz);
  for (const rail of rails ?? []) {
    const now = railProximity(x, z, rail);
    const over = Math.min(0, -radius - now.toward);
    if (over < 0) { pushX += now.nx * over; pushZ += now.nz * over; }
    const near = clamp01((now.toward + radius + RAIL_LOOK_BAND) / RAIL_LOOK_BAND);
    const facing = clamp01(ux * now.nx + uz * now.nz);
    const w = near * facing;
    if (w > lookWeight) { lookWeight = w; lookYaw = Math.atan2(now.nx, now.nz); }
  }
  for (const rail of rails ?? []) {
    const now = railProximity(x, z, rail);
    const next = railProximity(nx, nz, rail);
    const crossed = segmentsCross(x, z, nx, nz, rail.ax, rail.az, rail.bx, rail.bz);
    const approaching = next.dist < now.dist - 1e-4 && next.dist < radius + 0.12;
    if (!crossed && !approaching) continue;
    if (!best || now.dist < best.dist) {
      /**
       * **The guard clamps; it does not reflect. V3.70 L2 r3.**
       *
       * `x = now.cx − now.nx × max(radius, now.dist)` puts the walker `dist` on the *landward*
       * side of the rail whatever side it was on, so a walker whose route point is 1.25 m seaward
       * is mirrored 2.50 m in one frame. `mvp/tests/v370-l2-r3-jump.mjs` names it:
       * **`ambient:day-139` @ frame 5388, body 2.502949 m, (282.021, 133.731) → (279.682,
       * 132.842), `atRail` true on the far side** — and 24 more of the same shape at capacity 200,
       * none at 34. That is the whole of the r2 report's M11, which it booked against the legacy
       * stair/promenade driver; every one of these frames is `onRoute`.
       *
       * `toward` is the signed offset along the rail's own seaward normal, so the correction that
       * belongs here is a one-sided clamp on it: never seaward of the standoff, and nothing at all
       * when the walker is already landward. It is continuous in the walker's position — the push
       * grows from zero as `toward` rises through `−radius` — where the mirror is discontinuous at
       * the rail by twice the distance. The tangential position is untouched, which the mirror
       * also lost at a segment end.
       */
      best = {
        blocked: true,
        x: x + pushX,
        z: z + pushZ,
        lookYaw,
        lookWeight,
        dist: now.dist,
        reason: 'look-sea',
      };
    }
  }
  return best ?? {
    blocked: false,
    x: x + pushX,
    z: z + pushZ,
    pushed: pushX !== 0 || pushZ !== 0,
    lookYaw,
    lookWeight,
    dist: Infinity,
    reason: null,
  };
}

/**
 * Push overlapping pedestrians apart. Lower id yields the slide so the pair is stable.
 */
export function separate(self, others, minDist = PERSONAL_SPACE) {
  let ox = 0;
  let oz = 0;
  for (const other of others ?? []) {
    if (!other || other.id === self.id) continue;
    const dx = self.x - other.x;
    const dz = self.z - other.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-5) {
      ox += self.id < other.id ? 0.18 : -0.18;
      continue;
    }
    if (d >= minDist) continue;
    const push = (minDist - d) * 0.45;
    if (self.id < other.id) {
      ox += (dx / d) * push;
      oz += (dz / d) * push;
    }
  }
  return { x: self.x + ox, z: self.z + oz };
}

/**
 * Depth inside an AABB, or 0 when the point is outside.
 */
export function footprintDepth(x, z, box) {
  if (!box) return 0;
  if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) return 0;
  return Math.min(x - box.minX, box.maxX - x, z - box.minZ, box.maxZ - z);
}

export function pointInsideFootprints(x, z, footprints) {
  for (const box of footprints ?? []) {
    if (footprintDepth(x, z, box) > 0) return true;
  }
  return false;
}

/**
 * Nearest point just outside the box. Picks the closest face so a lerp
 * through a shop slides along the facade instead of teleporting.
 */
export function pushOutOfBox(x, z, box, pad = BUILDING_STANDOFF) {
  const left = x - box.minX;
  const right = box.maxX - x;
  const north = z - box.minZ;
  const south = box.maxZ - z;
  const nearest = Math.min(left, right, north, south);
  if (nearest === left) return { x: box.minX - pad, z };
  if (nearest === right) return { x: box.maxX + pad, z };
  if (nearest === north) return { x, z: box.minZ - pad };
  return { x, z: box.maxZ + pad };
}

/**
 * Keep a walker off parcel / civic envelopes. Occupying sitters may stay
 * near a facade (`maxDepth`); anyone deeper is walked out.
 */
export function pushOutOfBuildings(x, z, footprints, {
  pad = BUILDING_STANDOFF,
  maxDepth = 0,
} = {}) {
  let px = x;
  let pz = z;
  let hit = false;
  for (const box of footprints ?? []) {
    if (footprintDepth(px, pz, box) <= maxDepth) continue;
    const next = pushOutOfBox(px, pz, box, pad);
    px = next.x;
    pz = next.z;
    hit = true;
  }
  return { x: px, z: pz, hit };
}

function tramTravelYawFromItem(tram) {
  const axis = tram?.item?.axis;
  const dir = tram?.dir ?? 1;
  if (axis === 'h') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  if (axis === 'v') return dir > 0 ? 0 : Math.PI;
  return Number.isFinite(tram?.yaw) ? tram.yaw : 0;
}

/**
 * Flatten board trams + interchange buses + published cars into one obstacle list.
 * Cars already see buses via TrafficLayer.registerObstacleProvider; pedestrians
 * need the same population in one shape.
 */
export function collectRoadUsers(board, traffic) {
  const out = [];
  if (traffic && typeof traffic.queryVehicles === 'function') {
    const cars = traffic.queryVehicles();
    if (Array.isArray(cars)) {
      for (const car of cars) {
        if (car && Number.isFinite(car.x) && Number.isFinite(car.z)) out.push(car);
      }
    }
  }
  for (const tram of board?.trams ?? []) {
    const group = tram.group;
    const x = group?.position?.x ?? tram.x;
    const z = group?.position?.z ?? tram.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    // Mesh yaw is reservation-aligned (90° off a v-corridor). Yield and
    // tram-vs-ped use travel heading — fwdX/fwdZ after a board step, else dir.
    const travelYaw = (Number.isFinite(tram.fwdX) && Number.isFinite(tram.fwdZ)
      && (tram.fwdX !== 0 || tram.fwdZ !== 0))
      ? Math.atan2(tram.fwdX, tram.fwdZ)
      : tramTravelYawFromItem(tram);
    out.push({
      x,
      z,
      yaw: travelYaw,
      halfLength: tram.halfLength ?? (tram.item?.axis === 'h' ? 8.25 : 6.95),
      halfWidth: tram.halfWidth ?? 1.34,
      speed: tram.speed ?? 0,
      kind: 'tram',
    });
  }
  for (const bus of board?.interchangeBusFleet?.buses ?? []) {
    if (!Number.isFinite(bus.worldX) || !Number.isFinite(bus.worldZ)) continue;
    out.push({
      x: bus.worldX,
      z: bus.worldZ,
      yaw: bus.trafficYaw ?? 0,
      halfLength: bus.halfLength ?? 6.05,
      halfWidth: bus.halfWidth ?? 1.28,
      speed: bus.speed ?? 0,
      kind: 'bus',
    });
  }
  return out;
}
