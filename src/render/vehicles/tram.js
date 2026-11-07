// District Deck — reservation shuttle with comfort stops and rest-reverse.
// Seed / presentation only. Not a Melbourne-complete W/E-class simulator.
// Both-end cabs: dir flips at rest. The hull never pirouettes on the reservation.

export const TRAM_CRUISE = 5.2;
export const TRAM_DWELL = 4.2;
export const TRAM_END_DWELL = 2.2;
export const TRAM_COMFORT_BRAKE = 1.6; // m/s²
export const TRAM_STOP_CATCH = 2.4;

const TRAM_COMFORT_ACCEL = 1.2;
const TRAM_HARD_BRAKE = 4.8;
const SNAP = 0.15;
const BRAKE_BUFFER = 1.5;
const FLIP_SPEED = 0.15;
const CREEP_K = 0.40;
const PED_LOOKAHEAD = 18;
const PED_LATERAL = 0.55;
const TRAM_LOOKAHEAD = 32;
const TRAM_NOSE_GAP = 0.8;

/** Last-frame pedestrians on the reservation. Scene writes this before board.update. */
let reservationPeds = [];

export function setReservationPedestrians(list) {
  reservationPeds = Array.isArray(list) ? list : [];
}

export function reservationPedestrians() {
  return reservationPeds;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function alongOf(tram, from, span) {
  return Number.isFinite(tram.t) ? from + span * tram.t : from;
}

/**
 * Reservation-aligned hull yaw in degrees. W/E-class are double-ended, so this
 * does not change when `dir` flips — only travel does.
 */
export function tramReservationYaw(item) {
  if (item?.axis === 'v') return 90;
  if (item?.axis === 'h') return 0;
  return Number.isFinite(item?.rotation) ? item.rotation : 0;
}

/** Unit travel vector along the reservation. Independent of hull facing. */
export function tramTravelForward(axis, dir) {
  const sign = dir < 0 ? -1 : 1;
  if (axis === 'v') return { x: 0, z: sign };
  return { x: sign, z: 0 };
}

function isTerminus(along, from, to) {
  return Math.abs(along - to) <= SNAP + 1e-3 || Math.abs(along - from) <= SNAP + 1e-3;
}

function stoppingDistance(speed) {
  const v = Math.max(0, speed);
  return (v * v) / (2 * TRAM_COMFORT_BRAKE) + BRAKE_BUFFER;
}

/** Speed that can still stop at `dist` under comfort brake, with a linear close near the line. */
function approachSpeed(dist) {
  if (!(dist > SNAP)) return 0;
  const room = Math.max(0, dist - BRAKE_BUFFER);
  const ballistic = Math.sqrt(2 * TRAM_COMFORT_BRAKE * room);
  const creep = dist * CREEP_K;
  return Math.min(TRAM_CRUISE, Math.max(ballistic, creep));
}

function applySpeed(speed, target, dt, brake = TRAM_COMFORT_BRAKE) {
  const want = Math.max(0, Math.min(TRAM_CRUISE, target));
  if (want > speed) return Math.min(want, speed + TRAM_COMFORT_ACCEL * dt);
  if (want < speed) return Math.max(want, speed - Math.min(TRAM_HARD_BRAKE, brake) * dt);
  return want;
}

function nextUnusedStop(along, dir, stops, lastStopAlong) {
  let best = null;
  let bestDist = Infinity;
  for (const raw of stops ?? []) {
    const at = Number(raw);
    if (!Number.isFinite(at)) continue;
    if (lastStopAlong != null && Math.abs(at - lastStopAlong) < 0.05) continue;
    const dist = (at - along) * dir;
    if (dist < -SNAP) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = { along: at, dist: Math.max(0, dist) };
    }
  }
  return best;
}

/**
 * Metres from the tram nose to the nearest pedestrian standing in the
 * reservation, or null. A kerb waiter (off the hull) is not a hold.
 */
export function pedHoldDist(tram, along, dir) {
  const item = tram?.item;
  if (!item) return null;
  const travel = tramTravelForward(item.axis, dir);
  const px = item.axis === 'v' ? item.x : along;
  const pz = item.axis === 'v' ? along : item.z;
  const half = tram.halfLength ?? 7;
  const halfW = tram.halfWidth ?? 1.33;
  let best = null;
  for (const ped of reservationPeds) {
    if (!Number.isFinite(ped.x) || !Number.isFinite(ped.z)) continue;
    const dx = ped.x - px;
    const dz = ped.z - pz;
    const ahead = dx * travel.x + dz * travel.z;
    const lat = Math.abs(dx * -travel.z + dz * travel.x);
    if (lat > halfW + PED_LATERAL) continue;
    if (ahead < -0.4 || ahead > PED_LOOKAHEAD + half) continue;
    const dist = Math.max(0, ahead - half - 0.45);
    if (best == null || dist < best) best = dist;
  }
  return best;
}

function tramAlong(tram) {
  const item = tram?.item;
  if (!item) return 0;
  const from = Number(item.from) || 0;
  const to = Number.isFinite(Number(item.to)) ? Number(item.to) : from + 1;
  return clamp(alongOf(tram, from, Math.max(1, to - from)), from, to);
}

function tramCentreAt(item, along) {
  if (item.axis === 'v') return { x: item.x, z: along };
  return { x: along, z: item.z };
}

function sameReservation(a, b) {
  if (!a || !b || a.axis !== b.axis) return false;
  if (a.axis === 'v') return Math.abs((a.x ?? 0) - (b.x ?? 0)) < 2.2;
  return Math.abs((a.z ?? 0) - (b.z ?? 0)) < 2.2;
}

function crossingOf(a, b) {
  if (!a || !b || a.axis === b.axis) return null;
  const v = a.axis === 'v' ? a : b;
  const h = a.axis === 'h' ? a : b;
  if (!Number.isFinite(v.x) || !Number.isFinite(h.z)) return null;
  return { x: v.x, z: h.z };
}

function distToPoint(item, along, dir, x, z) {
  const at = item.axis === 'v' ? z : x;
  return (at - along) * (dir < 0 ? -1 : 1);
}

function reservationKey(tram) {
  const item = tram?.item;
  if (!item) return '';
  return `${item.axis}:${item.x ?? ''}:${item.z ?? ''}`;
}

/**
 * Metres from this tram's nose to the nearest other tram it must not occupy,
 * or null. Same-reservation hulls are leaders / oncoming; crossing
 * reservations hold short of the junction when the other tram owns or
 * will occupy the box.
 */
export function tramHoldDist(tram, along, dir, peers) {
  const item = tram?.item;
  if (!item || !Array.isArray(peers) || peers.length === 0) return null;
  const travel = tramTravelForward(item.axis, dir);
  const self = tramCentreAt(item, along);
  const half = tram.halfLength ?? 7;
  const halfW = tram.halfWidth ?? 1.33;
  let best = null;
  const consider = (dist) => {
    if (best == null || dist < best) best = dist;
  };

  for (const other of peers) {
    if (!other || other === tram || other.item == null) continue;
    const oItem = other.item;
    const oAlong = tramAlong(other);
    const oHalf = other.halfLength ?? 7;
    const oHalfW = other.halfWidth ?? 1.33;
    const oDir = other.dir < 0 ? -1 : 1;

    if (sameReservation(item, oItem)) {
      const otherPos = tramCentreAt(oItem, oAlong);
      const dx = otherPos.x - self.x;
      const dz = otherPos.z - self.z;
      const ahead = dx * travel.x + dz * travel.z;
      const lat = Math.abs(dx * -travel.z + dz * travel.x);
      if (lat > halfW + oHalfW + 0.6) continue;
      if (ahead < -oHalf || ahead > TRAM_LOOKAHEAD + half) continue;
      consider(Math.max(0, ahead - half - oHalf - TRAM_NOSE_GAP));
      continue;
    }

    const box = crossingOf(item, oItem);
    if (!box) continue;
    const ourTo = distToPoint(item, along, dir, box.x, box.z);
    if (ourTo < -half) continue;
    const theirTo = distToPoint(oItem, oAlong, oDir, box.x, box.z);
    const theyIn = Math.abs(theirTo) <= oHalf + 2.4;
    const theyComing = theirTo > -oHalf && theirTo < TRAM_LOOKAHEAD;
    if (!theyIn && !theyComing) continue;
    const weIn = Math.abs(ourTo) <= half + 2.4;
    if (weIn && !theyIn) continue;
    if (weIn && theyIn) continue;
    let yieldBox = theyIn && !weIn;
    if (!yieldBox && !weIn && theyComing) {
      if (theirTo < ourTo - 0.5) yieldBox = true;
      else if (Math.abs(theirTo - ourTo) <= 0.5
        && reservationKey(other) < reservationKey(tram)) yieldBox = true;
    }
    if (!yieldBox) continue;
    consider(Math.max(0, ourTo - half - oHalfW - TRAM_NOSE_GAP));
  }
  return best;
}

function signalHoldDist(ctx) {
  const signal = ctx?.signal;
  if (signal !== 'red' && signal !== 'amber') return null;
  const given = ctx.signalDist;
  if (Number.isFinite(given) && given >= 0) return given;
  return null;
}

/**
 * Advance one tram along its corridor reservation.
 * Mutates tram.along-equivalent via tram.t, tram.dir, tram.speed, tram.dwellTimer, tram.lastStopAlong.
 * @param {object} tram  { t, dir, item:{from,to,axis,x,z}, stopAlong, lastStopAlong, dwellTimer, speed, halfLength }
 * @param {number} dt
 * @param {{ reducedMotion?: boolean, signal?: 'green'|'amber'|'red'|null, signalDist?: number,
 *   trams?: object[] }} ctx
 * @returns {{ along: number, speed: number }}
 */
export function stepTram(tram, dt, ctx = {}) {
  if (!tram?.item) return { along: 0, speed: 0 };

  const item = tram.item;
  const from = Number(item.from) || 0;
  const to = Number.isFinite(Number(item.to)) ? Number(item.to) : from + 1;
  const span = Math.max(1, to - from);
  let along = clamp(alongOf(tram, from, span), from, to);
  let speed = Math.max(0, Number(tram.speed) || 0);
  let dir = tram.dir < 0 ? -1 : 1;
  if (!Number.isFinite(tram.dwellTimer)) tram.dwellTimer = 0;
  if (tram.lastStopAlong === undefined) tram.lastStopAlong = null;

  const commit = () => {
    tram.dir = dir;
    tram.speed = speed;
    tram.t = (along - from) / span;
    return { along, speed };
  };

  const step = Math.min(0.05, Math.max(0, Number(dt) || 0));
  if (ctx?.reducedMotion) {
    speed = 0;
    return commit();
  }
  if (step === 0) return commit();

  if (tram.dwellTimer > 0) {
    tram.dwellTimer = Math.max(0, tram.dwellTimer - step);
    speed = 0;
    if (tram.dwellTimer === 0 && isTerminus(along, from, to) && speed <= FLIP_SPEED) {
      dir = -dir;
      tram.lastStopAlong = null;
    }
    return commit();
  }

  const endAlong = dir > 0 ? to : from;
  const endDist = Math.max(0, (endAlong - along) * dir);
  const stop = nextUnusedStop(along, dir, tram.stopAlong, tram.lastStopAlong);

  let target = TRAM_CRUISE;
  if (stop && stop.dist <= stoppingDistance(speed)) {
    target = Math.min(target, approachSpeed(stop.dist));
  }
  if (endDist <= stoppingDistance(speed)) {
    target = Math.min(target, approachSpeed(endDist));
  }

  const signal = ctx?.signal ?? null;
  const hold = signalHoldDist(ctx);
  const pedDist = pedHoldDist(tram, along, dir);
  const tramDist = tramHoldDist(tram, along, dir, ctx.trams);
  if (pedDist != null && pedDist <= stoppingDistance(speed)) {
    target = Math.min(target, approachSpeed(pedDist));
  }
  if (tramDist != null && tramDist <= stoppingDistance(speed)) {
    target = Math.min(target, approachSpeed(tramDist));
  }
  if (signal === 'red' && hold != null) {
    target = Math.min(target, approachSpeed(hold));
  } else if (signal === 'amber') {
    const hold = signalHoldDist(ctx);
    const needed = (speed * speed) / (2 * TRAM_COMFORT_BRAKE);
    if (hold != null && (needed <= hold * 0.92 || hold <= SNAP)) {
      target = Math.min(target, approachSpeed(hold));
    }
  }

  const needBrake = endDist > SNAP
    ? (speed * speed) / (2 * endDist)
    : (speed > FLIP_SPEED ? TRAM_HARD_BRAKE : TRAM_COMFORT_BRAKE);
  speed = applySpeed(speed, target, step, Math.max(TRAM_COMFORT_BRAKE, needBrake));

  let next = along + speed * step * dir;
  if (stop && (next - stop.along) * dir > 0) next = stop.along;
  if ((next - endAlong) * dir > 0) next = endAlong;
  if (signal === 'red' && hold != null && hold <= SNAP) next = along;
  if (pedDist != null && pedDist <= SNAP) next = along;
  if (tramDist != null && tramDist <= SNAP) next = along;
  along = clamp(next, from, to);

  const distEnd = Math.max(0, (endAlong - along) * dir);
  const distStop = stop ? Math.max(0, (stop.along - along) * dir) : Infinity;

  const endCatch = distEnd <= SNAP || (distEnd <= TRAM_STOP_CATCH && speed <= FLIP_SPEED);
  if (endCatch) {
    along = endAlong;
    if (speed <= 0.05) tram.dwellTimer = TRAM_END_DWELL;
    return commit();
  }

  if (stop && distStop <= TRAM_STOP_CATCH && speed <= FLIP_SPEED) {
    if (distStop <= SNAP) along = stop.along;
    speed = applySpeed(speed, 0, step);
    if (speed <= 0.02) {
      speed = 0;
      along = stop.along;
      tram.dwellTimer = TRAM_DWELL;
      tram.lastStopAlong = stop.along;
    }
  }

  return commit();
}
