// District Deck V3.10 W2-PHYS — presentation kinematics only.
// Fixed-step, seed-forked trajectories for debris / dust / sparks.
// Never reads or writes simulation state, action logs, or holdings.

import { stream } from '../core/rng.js';

/** Presentation gravity in board metres / s² (toy scale, readable arcs). */
export const GRAVITY = -26;
export const GROUND_Y = 0.12;
export const FIXED_DT = 1 / 60;

/**
 * Named stream for a presentation event. Two effects with the same seed+eventId
 * always sample the same rolls; distinct eventIds never share entropy.
 */
export function physStream(seed, eventId) {
  return stream(seed ?? 'dd-vfx', `phys:${eventId ?? 'anon'}`);
}

/**
 * Spawn one debris box body. Origin is the parcel centre (ground-ish).
 * Returns a plain record stepped by stepDebris / settleDebris.
 */
export function spawnDebris(rng, origin, {
  height = 4,
  spread = 5,
  speed = 9,
  sizeMin = 0.28,
  sizeMax = 0.85,
} = {}) {
  const angle = rng.range(0, Math.PI * 2);
  const elev = rng.range(0.35, 1.15);
  const launch = speed * rng.range(0.55, 1.0);
  const sx = rng.range(sizeMin, sizeMax);
  const sy = rng.range(sizeMin * 0.7, sizeMax * 0.95);
  const sz = rng.range(sizeMin * 0.7, sizeMax);
  return {
    x: origin.x + rng.range(-0.4, 0.4) * spread * 0.15,
    y: origin.y + rng.range(0.4, Math.max(1.2, height * 0.65)),
    z: origin.z + rng.range(-0.4, 0.4) * spread * 0.15,
    vx: Math.cos(angle) * launch * elev,
    vy: launch * rng.range(0.55, 1.35),
    vz: Math.sin(angle) * launch * elev,
    rx: rng.range(0, Math.PI * 2),
    ry: rng.range(0, Math.PI * 2),
    rz: rng.range(0, Math.PI * 2),
    wx: rng.range(-8, 8),
    wy: rng.range(-5, 5),
    wz: rng.range(-8, 8),
    sx,
    sy,
    sz,
    life: 1,
    settled: false,
    settleAge: 0,
    bounces: 0,
  };
}

/**
 * Soft dust mote: rises and expands outward, no ground collision.
 */
export function spawnDust(rng, origin, {
  spread = 4,
  lift = 3.2,
  height = 1.2,
} = {}) {
  const angle = rng.range(0, Math.PI * 2);
  const radius = Math.sqrt(rng.unit()) * spread;
  return {
    x: origin.x + Math.cos(angle) * radius * 0.35,
    y: origin.y + rng.range(0.15, height),
    z: origin.z + Math.sin(angle) * radius * 0.35,
    vx: Math.cos(angle) * rng.range(0.4, 2.4),
    vy: lift * rng.range(0.45, 1.15),
    vz: Math.sin(angle) * rng.range(0.4, 2.4),
    size: rng.range(0.7, 2.4),
    life: 1,
    fade: rng.range(0.55, 1.05),
  };
}

/**
 * Hot spark: short ballistic arc, bright, dies quickly.
 */
export function spawnSpark(rng, origin, {
  spread = 3.5,
  speed = 11,
  height = 2.0,
} = {}) {
  const angle = rng.range(0, Math.PI * 2);
  const elev = rng.range(0.2, 1.4);
  const launch = speed * rng.range(0.5, 1.15);
  return {
    x: origin.x + rng.range(-0.3, 0.3),
    y: origin.y + rng.range(0.3, height),
    z: origin.z + rng.range(-0.3, 0.3),
    vx: Math.cos(angle) * launch * Math.min(1, elev),
    vy: launch * elev * 0.7,
    vz: Math.sin(angle) * launch * Math.min(1, elev),
    life: 1,
    fade: rng.range(1.6, 2.8),
    // spread retained for callers that want to scale sparks by parcel width
    _spread: spread,
  };
}

/**
 * Fixed-step debris integration with toy bounce and settle.
 * Multiple substeps when dt is large keep replay-stable arcs.
 */
export function stepDebris(body, dt, {
  gravity = GRAVITY,
  groundY = GROUND_Y,
  restitution = 0.28,
  friction = 0.72,
  settleSpeed = 0.55,
} = {}) {
  if (body.settled) {
    body.settleAge += dt;
    body.life = Math.max(0, body.life - dt * 0.22);
    body.vx *= 0.9;
    body.vz *= 0.9;
    body.wx *= 0.85;
    body.wy *= 0.85;
    body.wz *= 0.85;
    return body;
  }

  let remaining = Math.min(0.05, Math.max(0, dt));
  while (remaining > 1e-6) {
    const step = Math.min(FIXED_DT, remaining);
    remaining -= step;

    body.vy += gravity * step;
    body.x += body.vx * step;
    body.y += body.vy * step;
    body.z += body.vz * step;
    body.rx += body.wx * step;
    body.ry += body.wy * step;
    body.rz += body.wz * step;

    const half = body.sy * 0.5;
    if (body.y - half <= groundY && body.vy <= 0) {
      body.y = groundY + half;
      body.vy = -body.vy * restitution;
      body.vx *= friction;
      body.vz *= friction;
      body.wx *= 0.55;
      body.wy *= 0.7;
      body.wz *= 0.55;
      body.bounces += 1;
      const speed = Math.hypot(body.vx, body.vy, body.vz);
      if (speed < settleSpeed || body.bounces >= 4) {
        body.settled = true;
        body.vy = 0;
        body.vx *= 0.4;
        body.vz *= 0.4;
        body.wx *= 0.2;
        body.wy *= 0.2;
        body.wz *= 0.2;
      }
    }
  }

  body.life = Math.max(0, body.life - dt * 0.12);
  return body;
}

export function stepDust(mote, dt) {
  mote.x += mote.vx * dt;
  mote.y += mote.vy * dt;
  mote.z += mote.vz * dt;
  mote.vx *= 0.985;
  mote.vz *= 0.985;
  mote.vy *= 0.96;
  mote.vy += 0.35 * dt; // slight loft so the plume reads volumetric
  mote.size += dt * 1.1;
  mote.life -= dt * mote.fade;
  return mote;
}

export function stepSpark(spark, dt, { gravity = GRAVITY * 1.35 } = {}) {
  spark.vy += gravity * dt;
  spark.x += spark.vx * dt;
  spark.y += spark.vy * dt;
  spark.z += spark.vz * dt;
  spark.vx *= 0.99;
  spark.vz *= 0.99;
  if (spark.y < GROUND_Y) {
    spark.y = GROUND_Y;
    spark.vy *= -0.2;
    spark.life -= 0.35;
  }
  spark.life -= dt * spark.fade;
  return spark;
}
