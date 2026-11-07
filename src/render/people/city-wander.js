// District Deck H-LIFE — purpose-driven pedestrian routes.
//
// Replaces the V3.10 4 m sine-leg for anyone we can give a reason to walk.
// Clock is the actor's own accumulated time so a yield freezes the route
// rather than sliding the world under a planted foot.
//
// Deterministic. No Math.random. Presentation only.

import { CORRIDOR, PITCH, ROAD } from '../../core/grid.js';
import { SHORE, boardwalkCentre, edgeAxes } from '../shore.js';
import {
  barrierBlock, clearVehicleHulls, obbClearance, PEDESTRIAN_RADIUS,
  pointInsideFootprints, pushOutOfBuildings,
  resolveSurfaceStep, sampleStairs, shouldYield, separate,
  trafficYield,
} from './city-physics.js';
import { corridorCell, deckTopY, groundYAt, isCarriageway, oppositeKerb } from './city-surface.js';
import { storyBeat } from './city-stories.js';
import { nearestBench, pavementFront, resolvePlace } from './city-places.js';
import { buildErrandRoute, routeStateAt } from './city-routes.js';

function signalOf(actor, world) {
  return {
    elapsed: world?.signalElapsed,
    seed: world?.signalSeed,
    id: actor?.id ?? actor?.key ?? null,
  };
}

/** Adult walk, metres per second. Not a board-scale shuffle and not a slide. */
export const WALK_SPEED = 1.4;
export const CLIMB_SPEED = 0.82;
export const LOOK_SECONDS = 3.2;
export const WAIT_PERIOD = 22;
export const WAIT_HOLD_END = 0.36;
export const WAIT_CROSS_START = 0.36;
export const WAIT_CROSS_END = 0.72;
/** Stand is the junction tactile. Do not walk them off it while yielding. */
export const WAIT_PAD_M = 0;
/** Metres the hull must leave before a waiter steps.
 * 16 m left a nose-on W-class in the resume still. 36 m never fired —
 * the W-class parks ~32 m past this junction. 28 m is behind the r1s-b
 * camera (z≈60) once the hull has gone north of the zebra. */
export const WAIT_CLEAR_M = 28;
/** First clear step plants on the near west/east zebra, not into the tram box. */
export const WAIT_STRIPE_M = 0.92;
export const WAIT_STRIPE_K = 0.16;

const TWO_PI = Math.PI * 2;

/**
 * Fraction of a stand spent turning to the heading the next leg leaves on. A 5.5 s dwell gives
 * about 2.5 s of turn, which puts a 180° pivot at roughly 5 mm of foot travel a frame.
 */
const DEPART_TURN_FRAC = 0.45;

/** And the fraction at the head of it spent turning off the tangent the walker arrived on. */
const ARRIVE_TURN_FRAC = 0.30;

/**
 * A standing turn, as steps. V3.70 L2 r3.
 *
 * r2 moved every turn off the walk and into the dwell, which is right, and the r2 critic then
 * measured what a turn about the root does to a foot that never leaves the ground: **59 % of
 * dwell frames sliding in contact, a median 0.95 m and a maximum 1.53 m of sole drag per stand,
 * at a maximum sole lift of 6.5 mm** — against a 145 mm lift on the same slot while walking,
 * which it published as a control. Absolute foot travel had fallen 31×; the sole was still
 * sweeping the pavement for the whole stand.
 *
 * The distinction between a pivot and a skate is whether the sole is airborne while its facing
 * changes, and nothing about a yaw can express that. So the stand is scheduled as **alternating
 * steps**: the body turns continuously, one foot is planted and is held at the facing it was
 * planted at, the other lifts and swings past it, and they swap. The planted foot's world
 * position is then held exactly rather than approximately, because the rig counter-rotates it
 * about the same root the driver rotates the body about.
 *
 * Two constants and one shape:
 *
 *   * `STAND_STEP_TURN` — how much body turn one step gives back. 0.55 rad is 31°, which is
 *     about what a person takes in one shuffle; a 180° pivot is six steps.
 *   * `STAND_LIFT` — the arc of that step, as a fraction of leg length. A step with no lift is a
 *     skate however short it is.
 *   * both turns finish **one step before their ramp does**, so the last step of each ramp is a
 *     pure catch-up and every foot's lag is zero at both ends of the stand. Without that the
 *     walker pushes off with one boot rotated a third of a turn out of true.
 */
const STAND_STEP_TURN = 0.55;
const STAND_LIFT = 0.075;

const smooth01 = (t) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };

/** The first step index at or after `from` that foot `i` takes. Feet alternate: foot `k % 2`. */
function firstStepFor(from, i) {
  const k = Math.ceil(from - 1e-9);
  return (((k % 2) + 2) % 2) === i ? k : k + 1;
}

/**
 * @returns {{ turn: number, plant: { lag: number[], lift: number[], close: number[] } }}
 *   `turn` is the body's yaw offset from the tangent it arrived on. `plant` is what `rig.js`
 *   needs: per foot, the radians its world facing lags the body's, its lift, and how far it has
 *   travelled from where the walk cycle left it to the authored standing stance.
 */
function standSchedule(tail, head, phase) {
  const na = Math.max(2, Math.ceil(Math.abs(tail) / STAND_STEP_TURN) + 1);
  const nd = Math.max(3, Math.ceil(Math.abs(head) / STAND_STEP_TURN) + 1);
  const arrive = smooth01(phase / ARRIVE_TURN_FRAC);
  const depart = smooth01((phase - (1 - DEPART_TURN_FRAC)) / DEPART_TURN_FRAC);
  const step = na * arrive + nd * depart;
  const turnAt = (m) => tail * clamp(m / (na - 1), 0, 1)
    - head * clamp((m - na) / (nd - 1), 0, 1);
  const k = Math.floor(step);
  const f = step - k;
  const lag = [0, 0];
  const lift = [0, 0];
  const close = [0, 0];
  const turn = turnAt(step);
  for (let i = 0; i < 2; i += 1) {
    const stepping = (((k % 2) + 2) % 2) === i;
    // A stepping foot carries its anchor from one behind the body to one ahead of it across its
    // own swing; a planted one holds the anchor it landed on. Both are continuous at the hand-off
    // because the incoming foot starts where the outgoing one's anchor already is.
    const anchor = stepping ? (k - 1) + 2 * smooth01(f) : k;
    lag[i] = turn - turnAt(anchor);
    lift[i] = stepping ? STAND_LIFT * Math.sin(Math.PI * f) : 0;
    // The stance squares up on each foot's first step and opens again on its first step of the
    // departure ramp, so the walk resumes from the pose the cycle was frozen at and nothing has
    // to slide back.
    const shut = firstStepFor(na, i);
    close[i] = clamp((anchor - (i - 1)) / 2, 0, 1) * (1 - clamp((anchor - (shut - 1)) / 2, 0, 1));
  }
  return { turn, plant: { lag, lift, close } };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function wrap01(u) {
  return u - Math.floor(u);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function heading(ax, az, bx, bz) {
  return { hx: bx - ax, hz: bz - az, yaw: Math.atan2(bx - ax, bz - az) };
}

const OPEN_AIR = new Set(['beach', 'stairs', 'look-sea', 'promenade']);

function footpathOn(cell) {
  if (!cell) return null;
  const high = cell.local >= ROAD / 2;
  const inset = high ? CORRIDOR.footpathCentreHigh : CORRIDOR.footpathCentreLow;
  return cell.axis === 'v'
    ? { x: cell.low + inset, axis: 'v', low: cell.low }
    : { z: cell.low + inset, axis: 'h', low: cell.low };
}

/**
 * Next kerb point that stays on the street lattice. A straight lerp home→cafe
 * cuts through the block; the nearest-face push then flips sides and the
 * walker teleports across the map.
 */
export function sidewalkWaypoint(x, z, destX, destZ) {
  const destKerb = pavementFront(destX, destZ);
  const kerb = pavementFront(x, z);
  const hereCell = corridorCell(x, z) ?? corridorCell(kerb.x, kerb.z);
  const destCell = corridorCell(destKerb.x, destKerb.z);
  if (!hereCell || !destCell) return destKerb;
  if (!corridorCell(x, z) && Math.hypot(kerb.x - x, kerb.z - z) > 0.35) return kerb;

  const lx = ((x % PITCH) + PITCH) % PITCH;
  const lz = ((z % PITCH) + PITCH) % PITCH;
  if (lx < ROAD && lz < ROAD) {
    return destCell.axis === 'v'
      ? { x: destKerb.x, z }
      : { x, z: destKerb.z };
  }

  const here = footpathOn(hereCell);
  const there = footpathOn(destCell);
  const sameStreet = here && there
    && here.axis === there.axis
    && Math.abs(here.low - there.low) < 0.8;
  if (sameStreet) return destKerb;

  if (hereCell.axis === 'v') {
    const footX = here.x;
    if (destCell.axis === 'h') return { x: footX, z: destKerb.z };
    const toward = destKerb.z >= z ? 1 : -1;
    const pitch = toward > 0
      ? Math.floor(z / PITCH) * PITCH + PITCH
      : Math.ceil(z / PITCH) * PITCH - PITCH;
    const foot = toward > 0 ? CORRIDOR.footpathCentreLow : CORRIDOR.footpathCentreHigh;
    return { x: footX, z: pitch + foot };
  }
  const footZ = here.z;
  if (destCell.axis === 'v') return { x: destKerb.x, z: footZ };
  const toward = destKerb.x >= x ? 1 : -1;
  const pitch = toward > 0
    ? Math.floor(x / PITCH) * PITCH + PITCH
    : Math.ceil(x / PITCH) * PITCH - PITCH;
  const foot = toward > 0 ? CORRIDOR.footpathCentreLow : CORRIDOR.footpathCentreHigh;
  return { x: pitch + foot, z: footZ };
}

/**
 * Legacy there-and-back, kept as the geometric fallback so a seed that
 * already placed a mid-block stroller does not teleport.
 */
export function pingPong(actor, clock) {
  const period = 11.4;
  const u = (clock + (actor.phase ?? 0) * period) / period;
  const leg = Math.floor(u);
  const k = u - leg;
  const sign = (((leg % 2) + 2) % 2) === 0 ? 1 : -1;
  const amp = actor.strollAmp ?? 2.4;
  const s = sign * (-amp + 2 * amp * k);
  if ((actor.strollAxis ?? 'z') === 'x') {
    return {
      x: actor.x + s,
      z: actor.z,
      yaw: sign > 0 ? Math.PI / 2 : -Math.PI / 2,
      alpha: k,
      length: amp * 2,
    };
  }
  return {
    x: actor.x,
    z: actor.z + s,
    yaw: sign > 0 ? 0 : Math.PI,
    alpha: k,
    length: amp * 2,
  };
}

function promenadeAlong(actor, clock, world) {
  const edge = world.waterEdge;
  const extent = world.extent;
  if (!edge || !extent) return pingPong(actor, clock);
  const { along, seaward } = edgeAxes(edge);
  const walk = boardwalkCentre(edge, extent);
  const amp = Math.max(8, actor.strollAmp * 4);
  const period = (amp * 2) / WALK_SPEED;
  const u = (clock + (actor.phase ?? 0) * period) / period;
  const leg = Math.floor(u);
  const k = u - leg;
  const sign = (((leg % 2) + 2) % 2) === 0 ? 1 : -1;
  const s = sign * (-amp + 2 * amp * k);
  const alongPos = (actor.homeAlong ?? 0) + s;
  const lookBeat = wrap01((clock + (actor.phase ?? 0) * 17) / 17);
  const lookOut = lookBeat > 0.70 && lookBeat < 0.90;
  const out = lookOut ? 1.85 : 0;
  const x = walk.x + along.x * alongPos + seaward.x * out;
  const z = walk.z + along.z * alongPos + seaward.z * out;
  const hx = lookOut ? seaward.x : along.x * sign;
  const hz = lookOut ? seaward.z : along.z * sign;
  const yaw = Math.atan2(hx, hz);
  return {
    x,
    z,
    y: deckTopY(),
    yaw,
    hx,
    hz,
    alpha: k,
    length: amp * 2,
    seawardX: seaward.x,
    seawardZ: seaward.z,
    moving: true,
    intent: lookOut ? 'wander' : 'wander',
  };
}

function stairCycle(actor, clock, world) {
  const flight = (world.flights ?? [])[actor.flightIndex ?? 0] ?? world.flights?.[0];
  if (!flight) return { ...idlePose(actor), intent: 'idle' };
  const length = flight.count * flight.run;
  const period = (length * 2) / CLIMB_SPEED + LOOK_SECONDS * 2;
  const t = (clock + (actor.phase ?? 0) * period) % period;
  const downTime = length / CLIMB_SPEED;
  let out;
  let goingDown = true;
  if (t < downTime) {
    out = (t / downTime) * length;
    goingDown = true;
  } else if (t < downTime + LOOK_SECONDS) {
    out = length;
    goingDown = true;
  } else if (t < downTime + LOOK_SECONDS + downTime) {
    const u = (t - downTime - LOOK_SECONDS) / downTime;
    out = (1 - u) * length;
    goingDown = false;
  } else {
    out = 0;
    goingDown = false;
  }
  const x = flight.originX + flight.seawardX * out;
  const z = flight.originZ + flight.seawardZ * out;
  const hit = sampleStairs(x, z, [flight]);
  const hx = goingDown ? flight.seawardX : -flight.seawardX;
  const hz = goingDown ? flight.seawardZ : -flight.seawardZ;
  const looking = t >= downTime && t < downTime + LOOK_SECONDS;
  return {
    x,
    z,
    y: hit?.y ?? (goingDown ? flight.sandY : flight.deckY),
    yaw: looking ? Math.atan2(flight.seawardX, flight.seawardZ) : Math.atan2(hx, hz),
    hx: looking ? 0 : hx,
    hz: looking ? 0 : hz,
    alpha: (out / length) % 1,
    length,
    moving: !looking,
    intent: looking ? 'look-sea' : 'climb',
    onStair: Boolean(hit?.onStair),
  };
}

function streetPose(actor, clock, world, vehicles) {
  // Longer street legs: the 4 m ping-pong never reached a crossing.
  const amp = Math.max(actor.strollAmp ?? 2, 7.5);
  const stretched = pingPong({ ...actor, strollAmp: amp }, clock);
  let x = stretched.x;
  let z = stretched.z;
  const hx = x - (actor._lastX ?? actor.x);
  const hz = z - (actor._lastZ ?? actor.z);
  const yaw = stretched.yaw;
  const heading = {
    x, z, hx: Math.sin(yaw), hz: Math.cos(yaw),
  };
  const nextX = x + heading.hx * 0.9;
  const nextZ = z + heading.hz * 0.9;
  // Stay on the footpath unless this actor is a designated crosser.
  if (actor.lifeMode !== 'cross' && isCarriageway(nextX, nextZ)) {
    return {
      x: actor._lastX ?? actor.x,
      z: actor._lastZ ?? actor.z,
      y: actor.baseY ?? 0,
      yaw,
      hx: 0,
      hz: 0,
      alpha: stretched.alpha,
      length: stretched.length,
      moving: false,
      intent: 'wait-kerb',
    };
  }
  const decision = trafficYield(heading, vehicles, world?.crossings, signalOf(actor, world));
  if (decision.yield) {
    return {
      x: actor._lastX ?? x,
      z: actor._lastZ ?? z,
      y: actor.baseY ?? 0,
      yaw: decision.lookYaw,
      hx: 0,
      hz: 0,
      alpha: stretched.alpha,
      length: stretched.length,
      moving: false,
      intent: decision.reason,
    };
  }
  return {
    x,
    z,
    y: actor.baseY ?? 0,
    yaw,
    hx: heading.hx,
    hz: heading.hz,
    alpha: stretched.alpha,
    length: stretched.length,
    moving: true,
    intent: 'wander',
    _hx: hx,
    _hz: hz,
  };
}

function crossPose(actor, clock, world, vehicles) {
  const far = actor.farKerb ?? oppositeKerb(actor.x, actor.z);
  if (!far) return streetPose(actor, clock, world, vehicles);
  const period = 16;
  const u = wrap01((clock + (actor.phase ?? 0) * period) / period);
  // 0–0.24 hold kerb, then cross if clear, then reverse. Yield never leaves the footpath.
  const going = u < 0.5;
  const home = { x: actor.x, z: actor.z };
  const dest = going ? far : home;
  const from = going ? home : far;
  const local = going ? u / 0.5 : (u - 0.5) / 0.5;
  const kerbHold = 0.24;
  const approach = local < kerbHold ? 0 : Math.min(1, (local - kerbHold) / 0.36);
  const x = lerp(from.x, dest.x, approach);
  const z = lerp(from.z, dest.z, approach);
  const { hx, hz, yaw } = heading(from.x, from.z, dest.x, dest.z);
  const onRoad = isCarriageway(x, z) || isCarriageway(
    x + Math.sign(hx) * 0.6, z + Math.sign(hz) * 0.6,
  );
  const ped = { x, z, hx, hz };
  const decision = shouldYield(ped, vehicles, world?.crossings, signalOf(actor, world));
  if (decision.yield && (onRoad || local < 0.55)) {
    return {
      x: from.x,
      z: from.z,
      y: 0,
      yaw: decision.lookYaw,
      hx: 0,
      hz: 0,
      alpha: local,
      length: Math.hypot(dest.x - from.x, dest.z - from.z),
      moving: false,
      intent: decision.reason,
    };
  }
  return {
    x,
    z,
    y: 0,
    yaw,
    hx,
    hz,
    alpha: local,
    length: Math.hypot(dest.x - from.x, dest.z - from.z),
    moving: local >= kerbHold,
    intent: onRoad ? 'cross' : (local < kerbHold ? 'idle' : 'wander'),
  };
}

/**
 * Dedicated kerb waiter: stay on the stand, face the reservation, freeze when
 * a tram/bus/car owns the crossing. A short clear-road cross is optional.
 */
function waitStopPose(actor, clock, world, vehicles) {
  const far = actor.farKerb ?? oppositeKerb(actor.x, actor.z);
  const hx = far ? far.x - actor.x : Math.sin(actor.yaw ?? 0);
  const hz = far ? far.z - actor.z : Math.cos(actor.yaw ?? 0);
  const ped = { x: actor.x, z: actor.z, hx, hz };
  const decision = shouldYield(ped, vehicles, world?.crossings, signalOf(actor, world));
  // Dedicated tram-stop waiters freeze for trams/buses. A parked car on the
  // next zebra must not pin them for the whole day (r1f resume died as wait-car).
  const tramOrBus = decision.reason === 'wait-tram' || decision.reason === 'wait-bus';
  const n = Math.hypot(hx, hz) || 1;
  const pad = {
    x: actor.x + (hx / n) * WAIT_PAD_M,
    z: actor.z + (hz / n) * WAIT_PAD_M,
    y: actor.baseY ?? 0,
    yaw: decision.lookYaw,
    hx: 0,
    hz: 0,
    alpha: 0,
    length: 0,
    moving: false,
    intent: decision.reason ?? 'wait-tram',
  };
  if (decision.yield && tramOrBus) {
    actor._tramHeld = true;
    actor._clearAt = null;
    return pad;
  }
  // Stay planted until the hull has actually left the junction.
  // r1r resume walked the box while the W-class was still 10 m away.
  if (actor._tramHeld) {
    let nearest = Infinity;
    for (const v of vehicles ?? []) {
      if (v.kind !== 'tram' && v.kind !== 'bus') continue;
      const d = Math.hypot((v.x ?? 0) - actor.x, (v.z ?? 0) - actor.z);
      if (d < nearest) nearest = d;
    }
    if (nearest < WAIT_CLEAR_M) {
      actor._clearAt = null;
      return { ...pad, intent: 'wait-tram', yaw: Math.atan2(hx, hz) };
    }
  }
  // Stay on the tactile until a tram has actually owned this crossing.
  // Walking the first clear frame (r1n/r1o) planted them in the box.
  if (!actor._tramHeld) {
    const n = Math.hypot(hx, hz) || 1;
    return {
      x: actor.x + (hx / n) * WAIT_PAD_M,
      z: actor.z + (hz / n) * WAIT_PAD_M,
      y: actor.baseY ?? 0,
      yaw: Math.atan2(hx, hz),
      hx,
      hz,
      alpha: 0,
      length: 0,
      moving: false,
      intent: 'idle',
    };
  }
  // After the hull has cleared, walk from this clock. Yield froze the
  // day clock in the hold window, so a period-phase walk would never start.
  if (far) {
    if (actor._clearAt == null) actor._clearAt = clock;
    const span = WAIT_PERIOD * (WAIT_CROSS_END - WAIT_CROSS_START);
    // Stay on the zebra for the first clear metres (r1q resume left the paint).
    const k = Math.min(1, 0.06 + Math.max(0, clock - actor._clearAt) / span);
    // r1u walked +x into the tram box. The near white bars sit *behind*
    // the tactile (west of a west pad). Step onto those first.
    const toward = Math.sign(far.x - actor.x) || 1;
    const stripe = { x: actor.x - toward * WAIT_STRIPE_M, z: actor.z };
    // Hold the near-bar plant while a hull is still in the south postcard.
    // r1v resume put feet on paint with a nose-on W-class up-street.
    const resX = (actor.x + far.x) / 2;
    let southHull = false;
    for (const v of vehicles ?? []) {
      if (v.kind !== 'tram' && v.kind !== 'bus') continue;
      const vx = v.x ?? 0;
      const vz = v.z ?? 0;
      if (Math.abs(vx - resX) < 8 && vz > actor.z + 6 && vz < actor.z + 58) {
        southHull = true;
        break;
      }
    }
    if (southHull) {
      actor._stripePinned = true;
      return {
        x: stripe.x,
        z: stripe.z,
        y: actor.baseY ?? 0,
        yaw: heading(actor.x, actor.z, stripe.x, stripe.z).yaw,
        hx: 0,
        hz: 0,
        alpha: WAIT_STRIPE_K,
        length: Math.hypot(far.x - actor.x, far.z - actor.z),
        moving: false,
        intent: 'wander',
      };
    }
    if (actor._stripePinned) {
      actor._clearAt = clock - (WAIT_STRIPE_K - 0.06) * span;
      actor._stripePinned = false;
    }
    let x;
    let z;
    let aim = far;
    if (k <= WAIT_STRIPE_K) {
      const u = k / WAIT_STRIPE_K;
      x = lerp(actor.x, stripe.x, u);
      z = lerp(actor.z, stripe.z, u);
      aim = stripe;
    } else {
      const u = (k - WAIT_STRIPE_K) / (1 - WAIT_STRIPE_K);
      x = lerp(stripe.x, far.x, u);
      z = lerp(stripe.z, far.z, u);
    }
    const step = heading(actor.x, actor.z, aim.x, aim.z);
    return {
      x,
      z,
      y: actor.baseY ?? 0,
      yaw: step.yaw,
      hx: k < 1 ? step.hx : 0,
      hz: k < 1 ? step.hz : 0,
      alpha: k,
      length: Math.hypot(far.x - actor.x, far.z - actor.z),
      moving: k < 1,
      intent: k < 1 && isCarriageway(x, z) ? 'cross' : (k < 1 ? 'wander' : 'idle'),
    };
  }
  return {
    x: actor.x,
    z: actor.z,
    y: actor.baseY ?? 0,
    yaw: Math.atan2(hx, hz),
    hx,
    hz,
    alpha: 0,
    length: 0,
    moving: false,
    intent: 'idle',
  };
}

function beachPose(actor, clock) {
  const amp = 6.5 + (actor.strollAmp ?? 2);
  const stretched = pingPong({ ...actor, strollAmp: amp, strollAxis: actor.strollAxis }, clock);
  return {
    x: stretched.x,
    z: stretched.z,
    y: actor.baseY ?? (SHORE.sandY ?? 0.06),
    yaw: stretched.yaw,
    hx: Math.sin(stretched.yaw),
    hz: Math.cos(stretched.yaw),
    alpha: stretched.alpha,
    length: stretched.length,
    moving: true,
    intent: 'wander',
  };
}

function reservePose(actor, clock, world) {
  const reserve = world.reserve;
  const bench = nearestBench(actor.x, actor.z, world.benches, 2.4);
  if (bench && actor.kind === 'sit') {
    return {
      ...idlePose({ ...actor, x: bench.x, z: bench.z, yaw: bench.yaw, baseY: bench.y ?? 0 }),
      intent: 'sit',
      onBench: true,
    };
  }
  if (!reserve?.centre || actor.kind === 'stand') {
    return { ...idlePose(actor), intent: 'idle' };
  }
  const cx = reserve.centre.x;
  const cz = reserve.centre.z;
  const radius = 6 + (actor.phase ?? 0.3) * 10;
  const speed = 0.22;
  const theta = (clock * speed + (actor.phase ?? 0) * TWO_PI) % TWO_PI;
  const x = cx + Math.sin(theta) * radius;
  const z = cz + Math.cos(theta) * radius;
  const yaw = theta + Math.PI / 2;
  return {
    x,
    z,
    y: groundYAt(x, z, world, 0),
    yaw,
    hx: Math.cos(theta) * radius * 0.01,
    hz: -Math.sin(theta) * radius * 0.01,
    alpha: wrap01(theta / TWO_PI),
    length: TWO_PI * radius,
    moving: true,
    intent: 'wander',
  };
}

export function idlePose(actor) {
  const sit = actor.kind === 'sit' && actor.onBench;
  return {
    x: actor.x,
    z: actor.z,
    y: actor.baseY ?? 0,
    yaw: actor.yaw ?? 0,
    hx: 0,
    hz: 0,
    alpha: 0,
    length: 0,
    moving: false,
    intent: sit ? 'sit' : 'idle',
    onBench: Boolean(sit),
  };
}

export function inferLifeMode(actor) {
  if (actor.lifeMode) return actor.lifeMode;
  if (actor.story) return 'story';
  if (actor.kind === 'sit' || actor.kind === 'stand') return 'idle';
  if (actor.zone === 'promenade') return 'promenade';
  if (actor.zone === 'beach') return 'beach';
  if (actor.zone === 'reserve') return 'reserve';
  if (actor.zone === 'street') return 'street';
  return 'idle';
}

/**
 * The errand, on the pavement. V3.70 L2.
 *
 * Everything that decides where this walker is comes from `city-routes.js`: the route is their
 * own story's places joined by the footpath graph, built once, and their distance along it is a
 * pure function of their own clock. Nothing here steers, nothing here corrects, and nothing here
 * integrates a heading — which is why the support foot can be locked to the ground by handing
 * `ambient-life.js` the distance and the speed rather than an interpolation fraction.
 *
 * The legacy beat-lerp below it is kept as the fallback for a city with no lattice (the lab's
 * bare-plane modes) and for a story whose places all collapse onto one point.
 */
function routeStoryPose(actor, clock, world, vehicles) {
  let route = actor._route;
  if (route === undefined) {
    /**
     * **A bench a walker sits on is a place the route goes to, not a place it appears at. r3.**
     *
     * The runtime snap below used to read `nearestBench(state.x, state.z, …, 3.2)` on the first
     * frame of every dwell and write the bench's own point straight into `x`/`z`. That is a
     * teleport of up to 3.2 m in one frame, on a body that has just stopped, and
     * `mvp/tests/v370-l2-r3-jump.mjs` names it to the frame: **`ambient:day-139` @ 5388, body
     * 2.502949 m, `climb` → `look-sea`, with the route odometer moving 0.0234 m across the same
     * pair**. Twenty-five events at capacity 200 and none at 34, which is the population
     * surfacing it rather than causing it.
     *
     * The r2 report booked this as M11 and attributed it to "the legacy stair/promenade path".
     * That attribution is wrong and this probe is why: every one of these frames carries a route
     * odometer and a `climb`/`look-sea` intent, both of which only `routeStoryPose` publishes.
     * The legacy driver was never involved.
     *
     * Resolving the bench into the *place* moves it to route-build time, so the walker walks
     * there. The runtime snap stays, and is now a no-op by construction — the bench nearest a
     * stop that is already on the bench is that bench, at zero metres.
     */
    const places = (actor.story?.beats ?? []).map((beat) => {
      const place = resolvePlace(beat, actor, world.places);
      const bench = nearestBench(place.x, place.z, world.benches, 3.2);
      if (!bench) return place;
      return {
        ...place,
        x: bench.x,
        z: bench.z,
        yaw: Number.isFinite(bench.yaw) ? bench.yaw : place.yaw,
      };
    });
    route = buildErrandRoute(actor.id ?? 'ambient', places, world.footpaths,
      { rails: world.rails }) ?? null;
    actor._route = route;
  }
  if (!route) return null;

  const state = routeStateAt(route, clock);
  const beat = storyBeat(actor.story, clock);
  const placeKind = state.place?.kind ?? beat.to;
  const bench = state.dwelling ? nearestBench(state.x, state.z, world.benches, 3.2) : null;

  let x = state.x;
  let z = state.z;
  if (bench) {
    x = bench.x;
    z = bench.z;
  }

  // Cars: do not freeze mid-carriageway — finish the crossing. Trams: the
  // reservation IS the carriageway the hull owns, so a walker who skips yield
  // here walks through the W-class. Hold for a tram even on the reservation.
  const onRoad = isCarriageway(x, z);
  const ped = { x, z, hx: state.moving ? state.hx : 0, hz: state.moving ? state.hz : 0 };
  const trams = (vehicles ?? []).filter((row) => row.kind === 'tram');
  const tramHold = trams.length
    ? shouldYield(ped, trams, world?.crossings, signalOf(actor, world))
    : { yield: false };
  const inTram = tramHold.yield ? null : trams.find((row) =>
    obbClearance(x, z, row, PEDESTRIAN_RADIUS) < 0.12);
  const carHold = state.moving && !onRoad
    ? trafficYield(ped, vehicles, world?.crossings, signalOf(actor, world))
    : { yield: false };
  const decision = tramHold.yield
    ? tramHold
    : inTram
      ? { yield: true, reason: 'wait-tram', lookYaw: Math.atan2(inTram.x - x, inTram.z - z) }
      : carHold;
  if (decision.yield) {
    /**
     * **The hold is the route's own point, not last frame's.**
     *
     * `actor._lastX ?? x` reads the previous frame's write, which makes the pose a function of how
     * many frames the layer has run rather than of its clock — and V3.32 §3 says every pose is a
     * pure function of its inputs. It never showed while the layer held 34 walkers, because none
     * of them was yielding at the moment `_ambient-lod-probe.mjs` compares two layers; at 200 one
     * is, and that probe's determinism check reported a **0.423 m** drift between a warmed layer
     * and a fresh one on `ambient:day-137`.
     *
     * The route point is the right answer and not merely the deterministic one: `ambient-life.js`
     * freezes `actor.clock` for the duration of a `wait-*` intent, so `state.x/z` is already
     * constant through the yield. The two expressions agree on every frame after the first, and
     * on the first the route point is the correct one.
     */
    return {
      x,
      z,
      y: actor.baseY ?? 0,
      yaw: decision.lookYaw,
      hx: 0,
      hz: 0,
      alpha: 0,
      length: 0,
      speed: 0,
      distance: state.distance,
      bank: 0,
      moving: false,
      intent: decision.reason,
      storyBeat: beat,
      onOpen: state.onOpen,
      onRoute: true,
    };
  }

  const sitHere = state.dwelling && Boolean(bench);
  const workHere = state.dwelling && (placeKind === 'site' || placeKind === 'work');
  const intent = sitHere
    ? 'sit'
    : (workHere
      ? 'work'
      : (state.dwelling
        ? (placeKind === 'look-sea' ? 'look-sea' : `at-${placeKind}`)
        /**
         * **A walker on the roadway is crossing, and until r3 it never said so.**
         *
         * The r2 critic ran the clock over 3,600 frames at capacity 200 and found `crossing: 0`
         * on every one of them, then checked the counter mechanism against `atRail` and found it
         * working. The cause is here: `lifeStats.crossing` counts `intent === 'cross'`, which only
         * the legacy `crossPose` driver ever produced, and every route walker published `errand`
         * whatever it was standing on. The behaviour was never absent — r1's own pavement probe
         * reports 13.3 % of ambient positions on a legal crossing, and this round's reports
         * 1,721–5,575 crossing samples per story — the *intent* was.
         *
         * `onRoad` is the strip test the yield guard above already runs, and a route walker is
         * only ever on a carriageway or a tram reservation where its route crosses one: the same
         * run measures 0.00 % off-pavement, so every one of these frames is a legal crossing
         * rather than a walker in the traffic.
         */
        : (onRoad ? 'cross' : (placeKind === 'stairs' ? 'climb' : 'errand'))));

  /**
   * **Facing is eased between the stand and the tangent rather than switched, V3.70 L2 r2.**
   *
   * A parked walker faces its place; a walking one faces the way it is going; and r1 changed
   * between the two in a single frame. On arrival the two agree closely, because a walker arrives
   * pointing at what it came for. On departure they are routinely opposed, because a walker
   * leaving a shop sets off back the way it came — so the snap was near 180°, and a 180° snap
   * about the root swings a foot on a 0.15 m track through 0.30 m while the body moves 0.05 mm.
   *
   * The weight is the same one `ambient-life.js` settles the gait on, and for the same reason:
   * one ramp for the whole arrival means the head, the shoulders and the boots stop turning
   * together. It is a pure function of the route state, so a hand-stepped capture is unmoved.
   *
   * `nearHead` picks which stand the walker is easing out of or into. On the first half of a leg
   * that is the place it just left (`state.from`); on the second half it is the place it is
   * walking to. At the leg boundary the weight is ~1 and the target is the same place on both
   * sides of it, which is what makes the hand-off continuous rather than merely small.
   */
  const along = state.distance - (state.legBase ?? 0);
  const legLength = state.legLength ?? 0;
  /**
   * The two turn angles are the leg's own, resolved at route build — see `city-routes.js`. They
   * are constants for the leg, so no amount of tangent wobble can flip the direction of the turn
   * mid-way through it. A bench overrides the tail facing, and only a bench needs a live arc,
   * because a bench is 8 m from the route and never near the antipode of it.
   */
  /**
   * **Every turn between a walk and a stand is spent standing, and that is the fourth version.**
   *
   * The first drove the weight off speed, the second off distance into the leg, and both put the
   * turn where the walker is *translating slowly*, which is the worst place for it. §1.2 counts a
   * frame as skating when the support foot travels at ≥ 0.5× body speed, and a walker completing a
   * 180° turn at 0.2 m/s is pivoting: a foot on a 0.15 m track sweeps 0.47 m of arc while the body
   * covers almost nothing, so the ratio is unbounded by construction. Measured across the three
   * attempts, ramp skating went 24.3 % → 53.4 % → 27.9 % while the *absolute* foot travel fell
   * every time. The metric was reading a pivot as a slide, and it was right to: at 0.2 m/s the two
   * are the same picture.
   *
   * Standing, they are not the same picture, and the band's honest measure is absolute travel
   * rather than a ratio against a body that is not moving. A 5.5 s stand carries a 180° turn at
   * about 5 mm of foot travel a frame. So the walk carries **no** turn at all now: it arrives on
   * its own tangent and leaves on the next leg's, and the whole of both turns happens between
   * those two moments, while the figure is parked. A person turns and then walks; they do not
   * walk sideways out of a shop doorway.
   *
   * Both ends of the stand are exact rather than close. `arriveYaw + tailTurn` is the stand
   * facing by definition, and `standTail − nextHeadTurn` is the next leg's start tangent by the
   * same definition, so the two boundaries of the dwell carry no step and need no tolerance.
   */
  let yaw = state.yaw;
  /**
   * **The turn the stand is spending, published as a schedule rather than only as a yaw. r3.**
   *
   * r2 moved every turn into the dwell, which is right — a person turns and then walks — and the
   * r2 critic then measured what a turn about the root actually does to a foot while the body is
   * parked: **59 % of dwell frames are a sole sliding in ground contact, a median 0.95 m and a
   * maximum 1.53 m of drag per stand, at a maximum sole lift of 6.5 mm** against a 145 mm lift on
   * the same slot while walking. The pivot was a sweep, not a step.
   *
   * A sweep and a step differ in one thing only: whether the foot leaves the ground while its
   * facing changes. Neither the rig nor this function can decide that from a yaw alone, so what
   * goes to the rig is the *path* of the turn and its current direction, and `ambient-life.js`
   * turns those into an alternating two-foot staircase. `path` is monotone across the whole stand
   * — it accumulates both turns as magnitudes — so a step count derived from it never runs
   * backwards even though `yaw` itself reverses between arrival and departure.
   */
  let stand = null;
  if (state.dwelling) {
    let tailTurn = state.tailTurn ?? 0;
    const headTurn = state.nextHeadTurn ?? 0;
    if (sitHere && Number.isFinite(bench.yaw)) {
      // A bench overrides the tail facing. It is 8 m off the route and never near the antipode
      // of it, so the live arc is safe here and nowhere else.
      tailTurn = ((bench.yaw - state.yaw + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
    }
    const sched = standSchedule(tailTurn, headTurn, state.dwellPhase);
    yaw = state.yaw + sched.turn;
    stand = sched.plant;
  }

  return {
    x,
    z,
    y: actor.baseY ?? 0,
    yaw,
    hx: state.moving ? state.hx : 0,
    hz: state.moving ? state.hz : 0,
    // `alpha` and `length` stay published for the legacy readers; the pair that matters now is
    // (`distance`, `speed`), which is what locks the stride to the ground.
    alpha: beat.alpha,
    length: route.total,
    distance: state.distance,
    /** Monotone; `distance` wraps at the end of a circuit and the stride cannot be read off it. */
    odometer: state.odometer,
    speed: state.speed,
    bank: state.bank,
    moving: state.moving,
    intent,
    onBench: sitHere,
    onOpen: state.onOpen,
    onRoute: true,
    stand,
    storyBeat: beat,
  };
}

function storyPose(actor, clock, world, vehicles) {
  if (world?.footpaths && actor.story?.beats?.length) {
    const routed = routeStoryPose(actor, clock, world, vehicles);
    if (routed) return routed;
  }
  const beat = storyBeat(actor.story, clock);
  const places = world.places ?? {};
  const from = resolvePlace(beat.from, actor, places);
  const to = resolvePlace(beat.to, actor, places);
  const bench = !beat.traveling
    ? nearestBench(to.x, to.z, world.benches, 6.0)
    : null;
  const dest = bench ?? to;
  const span = Math.hypot(dest.x - from.x, dest.z - from.z);
  const openAir = OPEN_AIR.has(beat.to) || OPEN_AIR.has(beat.from);

  const prevClock = actor._clock;
  actor._clock = clock;
  const rawDt = prevClock == null ? 0 : clock - prevClock;
  const jump = prevClock == null || rawDt < 0 || rawDt > 2;
  const step = WALK_SPEED * Math.min(0.05, Math.max(0, rawDt));

  let x;
  let z;
  let moving;
  if (jump && clock > 1) {
    if (beat.traveling) {
      x = lerp(from.x, dest.x, beat.alpha);
      z = lerp(from.z, dest.z, beat.alpha);
      moving = span > 0.35 && beat.alpha < 0.999;
    } else {
      x = dest.x;
      z = dest.z;
      moving = false;
    }
  } else {
    x = actor._px ?? actor._lastX ?? actor.x ?? from.x;
    z = actor._pz ?? actor._lastZ ?? actor.z ?? from.z;
    const remainDest = Math.hypot(dest.x - x, dest.z - z);
    const enterLot = remainDest < 2.8;
    const aim = (openAir || enterLot)
      ? dest
      : sidewalkWaypoint(x, z, dest.x, dest.z);
    const dx = aim.x - x;
    const dz = aim.z - z;
    const remain = Math.hypot(dx, dz);
    if (remainDest <= 0.45) {
      x = dest.x;
      z = dest.z;
      moving = false;
    } else if (remain <= 0.35 && enterLot) {
      x = dest.x;
      z = dest.z;
      moving = remainDest > 0.45;
    } else if (step < 1e-5) {
      moving = remainDest > 0.45;
    } else if (remain > 1e-5) {
      x += (dx / remain) * step;
      z += (dz / remain) * step;
      moving = true;
    } else {
      moving = remainDest > 0.45;
    }
  }

  const { hx, hz, yaw } = heading(
    actor._px ?? actor._lastX ?? from.x,
    actor._pz ?? actor._lastZ ?? from.z,
    dest.x,
    dest.z,
  );
  const walkHx = x - (actor._px ?? actor._lastX ?? x);
  const walkHz = z - (actor._pz ?? actor._lastZ ?? z);
  const walkN = Math.hypot(walkHx, walkHz);
  const along = span > 1e-3 ? 1 - Math.hypot(dest.x - x, dest.z - z) / span : 1;
  const y = lerp(from.y ?? 0, dest.y ?? 0, Math.max(0, Math.min(1, along)));
  const ped = {
    x,
    z,
    hx: moving ? (walkN > 1e-4 ? walkHx : hx) : 0,
    hz: moving ? (walkN > 1e-4 ? walkHz : hz) : 0,
  };
  const decision = trafficYield(ped, vehicles, world?.crossings, signalOf(actor, world));
  if (decision.yield && moving) {
    return {
      x: actor._lastX ?? x,
      z: actor._lastZ ?? z,
      y,
      yaw: decision.lookYaw,
      hx: 0,
      hz: 0,
      alpha: beat.alpha,
      length: span,
      moving: false,
      intent: decision.reason,
      storyBeat: beat,
    };
  }
  actor._px = x;
  actor._pz = z;
  const arrived = !moving;
  const sitHere = arrived && Boolean(bench);
  const workHere = arrived && (beat.to === 'site' || beat.to === 'work');
  const intent = sitHere
    ? 'sit'
    : (workHere
      ? 'work'
      : (arrived
        ? (beat.to === 'look-sea' ? 'look-sea' : `at-${beat.to}`)
        : (beat.to === 'stairs' || beat.from === 'stairs' ? 'climb' : 'errand')));
  let faceYaw = yaw;
  if (sitHere && Number.isFinite(bench.yaw)) faceYaw = bench.yaw;
  else if (arrived && Number.isFinite(dest.yaw)) faceYaw = dest.yaw;
  else if (arrived && beat.to === 'look-sea' && world.flights?.[0]) {
    faceYaw = Math.atan2(world.flights[0].seawardX, world.flights[0].seawardZ);
  } else if (moving) {
    faceYaw = Math.atan2(
      x - (actor._lastX ?? x),
      z - (actor._lastZ ?? z),
    );
    if (!Number.isFinite(faceYaw) || Math.hypot(x - (actor._lastX ?? x), z - (actor._lastZ ?? z)) < 1e-4) {
      faceYaw = yaw;
    }
  }
  const lean = workHere ? 0.22 : 0;
  return {
    x: x + Math.sin(faceYaw) * lean,
    z: z + Math.cos(faceYaw) * lean,
    y,
    yaw: faceYaw,
    hx: moving ? hx : 0,
    hz: moving ? hz : 0,
    alpha: beat.alpha,
    length: span,
    moving,
    intent,
    onBench: sitHere,
    storyBeat: beat,
  };
}

/**
 * One pose for one actor at one clock. Yield / rail / stairs applied here so
 * the layer write loop stays a write loop.
 */
/**
 * Where a walker is at `clock`, as a pure function of it and nothing else.
 *
 * **This exists so the neighbour list can stop being a feedback loop.** `ambient-life.js` built it
 * from `actor._lastX ?? actor.x` — the previous frame's write — which makes every pose that reads
 * it a function of how many frames the layer has run rather than of its clock. At 34 walkers the
 * consumers never fired inside a probe's window; at 200 they do, and `_ambient-lod-probe.mjs`
 * reported a **0.423 m** drift between a warmed layer and a fresh one at the same elapsed.
 *
 * Route walkers are answered off the route, which is what they are actually doing; anything with
 * no route falls back to its seeded point, which is at least a constant.
 */
export function lifePointAt(actor, clock, world) {
  if (world?.footpaths && actor.story?.beats?.length) {
    let route = actor._route;
    if (route === undefined) {
      const places = (actor.story?.beats ?? []).map((beat) => resolvePlace(beat, actor, world.places));
      route = buildErrandRoute(actor.id ?? 'ambient', places, world.footpaths,
      { rails: world.rails }) ?? null;
      actor._route = route;
    }
    if (route) {
      const state = routeStateAt(route, clock);
      if (state) return { x: state.x, z: state.z };
    }
  }
  return { x: actor.x, z: actor.z };
}

export function cityLifePose(actor, clock, world, vehicles = [], neighbours = []) {
  const mode = inferLifeMode(actor);
  let pose;
  if (mode === 'story') pose = storyPose(actor, clock, world, vehicles);
  else if (mode === 'stairs') pose = stairCycle(actor, clock, world);
  else if (mode === 'promenade') pose = promenadeAlong(actor, clock, world);
  else if (mode === 'wait') pose = waitStopPose(actor, clock, world, vehicles);
  else if (mode === 'cross') pose = crossPose(actor, clock, world, vehicles);
  else if (mode === 'street') pose = streetPose(actor, clock, world, vehicles);
  else if (mode === 'beach') pose = beachPose(actor, clock);
  else if (mode === 'reserve') pose = reservePose(actor, clock, world);
  else pose = idlePose(actor);

  if (mode === 'promenade' || mode === 'story') {
    const rail = barrierBlock(pose.x, pose.z, pose.hx ?? 0, pose.hz ?? 0, world.rails);
    if (rail.blocked) {
      // Shortest arc, weighted by the approach, so the facing arrives at the view over the last
      // metre and a half instead of stepping to it on the frame the guard fires.
      const toLook = ((rail.lookYaw - (pose.yaw ?? 0) + Math.PI) % TWO_PI + TWO_PI) % TWO_PI
        - Math.PI;
      pose = {
        ...pose,
        x: rail.x,
        z: rail.z,
        yaw: (pose.yaw ?? 0) + toLook * (rail.lookWeight ?? 1),
        hx: 0,
        hz: 0,
        moving: false,
        intent: 'look-sea',
        atRail: true,
      };
    } else if (rail.pushed) {
      // Past the standoff but still walking along the promenade: hold the walker inside the rail
      // without stopping it. Continuous in its own position, so it is a path that hugs the
      // balustrade rather than a body that jumps back off it.
      pose = { ...pose, x: rail.x, z: rail.z };
    }
  }
  if (mode === 'promenade' || mode === 'stairs' || mode === 'story') {
    const stair = sampleStairs(pose.x, pose.z, world.flights);
    if (stair) {
      pose.y = stair.y;
      pose.onStair = stair.onStair;
      if (stair.onStair && pose.intent === 'wander') pose.intent = 'climb';
    } else if (pose.y == null) {
      pose.y = deckTopY();
    }
  }

  // Waiters already decided tram/bus yield. A second pass was pinning
  // them as wait-car the moment they stepped off the stand (r1i resume).
  if (mode === 'street' || mode === 'cross') {
    const ped = { x: pose.x, z: pose.z, hx: pose.hx ?? 0, hz: pose.hz ?? 0 };
    const decision = pose.intent?.startsWith('wait')
      ? { yield: true }
      : (mode === 'cross'
        ? shouldYield(ped, vehicles, world?.crossings, signalOf(actor, world))
        : trafficYield(ped, vehicles, world?.crossings, signalOf(actor, world)));
    if (decision.yield && pose.intent === 'wander') {
      pose.moving = false;
      pose.intent = decision.reason;
      pose.yaw = decision.lookYaw;
      pose.hx = 0;
      pose.hz = 0;
    }
  }

  // Stair climbers stay on the flight centreline. Personal-space
  // slides pushed them onto the well wall (r1o empty treads).
  //
  // **A route walker is exempt, and that is a no-skating decision rather than a routing one.**
  // `separate` moves a body sideways by up to a third of a metre in one frame to open a gap; the
  // support foot is planted while it happens, so every separation event is a slid boot. Route
  // walkers hold a deterministic lane within the 3 m footpath instead (`city-routes.js`
  // `route.lane`), which separates two people who share a corridor without moving either of them
  // off their own path.
  if (neighbours.length && mode !== 'stairs' && !pose.onStair && !pose.onRoute) {
    const parted = separate({ id: actor.id, x: pose.x, z: pose.z }, neighbours);
    pose.x = parted.x;
    pose.z = parted.z;
  }

  // I-29 for ambient walkers. Sit / work / at-* may occupy a terrace or yard;
  // everyone else is walked to the nearest facade.
  //
  // **A routed walker skips the scan, and that is a proof rather than a shortcut.** Every
  // building footprint lies inside a block; every point of a lattice route lies inside a road
  // corridor, on a footpath centreline plus at most 0.55 m of lane; the two sets do not meet. The
  // scan is O(footprints) per figure per frame — 109 AABBs on seed 0 — and skipping it takes
  // `cityLifePose` from 17.0 µs to 14.4 µs a walker, measured. `pose.onOpen` covers the stretches
  // that *do* leave the lattice, and those fall through to `occupy` above.
  const routedOnPavement = pose.onRoute && !pose.onOpen;
  const occupy = pose.intent === 'sit' || pose.intent === 'work'
    || pose.onOpen || routedOnPavement
    || (typeof pose.intent === 'string' && pose.intent.startsWith('at-'));
  if (!occupy && mode !== 'stairs' && !pose.onStair) {
    const cleared = pushOutOfBuildings(
      pose.x, pose.z, world.footprints, { maxDepth: 0 },
    );
    if (cleared.hit) {
      // Recorded so a probe can say whether the guard is a safety net or load-bearing. On a
      // routed walker it should never fire: the route runs down footpath centrelines, and a hit
      // means the graph put somebody through a building rather than past one.
      pose.pushed = true;
      const alongX = pose.x - (actor._lastX ?? pose.x);
      const alongZ = pose.z - (actor._lastZ ?? pose.z);
      const slideX = pushOutOfBuildings(
        (actor._lastX ?? pose.x) + alongX, actor._lastZ ?? pose.z, world.footprints, { maxDepth: 0 },
      );
      const slideZ = pushOutOfBuildings(
        actor._lastX ?? pose.x, (actor._lastZ ?? pose.z) + alongZ, world.footprints, { maxDepth: 0 },
      );
      if (!slideX.hit) {
        pose.x = (actor._lastX ?? pose.x) + alongX;
        pose.z = actor._lastZ ?? pose.z;
      } else if (!slideZ.hit) {
        pose.x = actor._lastX ?? pose.x;
        pose.z = (actor._lastZ ?? pose.z) + alongZ;
      } else {
        const lastX = actor._lastX ?? pose.x;
        const lastZ = actor._lastZ ?? pose.z;
        const lastInside = pointInsideFootprints(lastX, lastZ, world.footprints);
        const snap = Math.hypot(cleared.x - lastX, cleared.z - lastZ);
        // Nearest-face from a block interior can flip to the opposite facade.
        // Still eject a spawn that is already inside.
        if (snap > 1.4 && !lastInside) {
          pose.x = lastX;
          pose.z = lastZ;
        } else {
          pose.x = cleared.x;
          pose.z = cleared.z;
        }
      }
      if (slideX.hit && slideZ.hit && mode !== 'story') {
        pose.moving = false;
        pose.hx = 0;
        pose.hz = 0;
        if (pose.intent === 'wander' || pose.intent === 'errand' || pose.intent === 'cross') {
          pose.intent = 'wait-kerb';
        }
      }
    }
  }

  if (pose.intent === 'sit' && !pose.onBench) {
    pose.intent = 'idle';
  }

  const hull = clearVehicleHulls(pose.x, pose.z, vehicles);
  if (hull.hit) {
    pose.x = hull.x;
    pose.z = hull.z;
  }

  const fromX = actor._lastX ?? pose.x;
  const fromZ = actor._lastZ ?? pose.z;
  const fromY = Number.isFinite(actor.baseY) ? actor.baseY : (pose.y ?? 0);
  const stepped = resolveSurfaceStep(fromX, fromZ, fromY, pose.x, pose.z, world);
  pose.x = stepped.x;
  pose.z = stepped.z;
  pose.y = stepped.y;
  if (stepped.onStair) pose.onStair = true;
  if (stepped.intent === 'climb' && (pose.intent === 'wander' || pose.intent === 'errand')) {
    pose.intent = 'climb';
  }
  if (stepped.blocked && pose.moving) {
    pose.moving = false;
    pose.hx = 0;
    pose.hz = 0;
  }

  return pose;
}

/** Used by the seeder: mid-block along-parameter for promenade lock. */
export function promenadeHomeAlong(x, z, city) {
  const edge = city?.waterEdge;
  const extent = city?.extent;
  if (!edge || !extent) return 0;
  const { along } = edgeAxes(edge);
  const walk = boardwalkCentre(edge, extent);
  return (x - walk.x) * along.x + (z - walk.z) * along.z;
}


