// District Deck V3.32 — presentation tap-sway.
// Damped harmonic rock for trees and street furniture. Renderer-local only:
// no sim state, no action log, no clock, no Math.random. Seeded impulses come
// from the caller’s mischief RNG fork.

/** @typedef {'tree' | 'lamp' | 'prop' | 'heavy' | 'umbrella' | 'tram' | 'ice'} SwayKind */

/**
 * Per-kind oscillator. Units: omega rad/s, zeta dimensionless, impulse rad/s
 * per tap, maxTheta rad, energy 0–1, decay 1/s.
 *
 * Trees are slow and readable. Lamps whip. Benches rock firmly. Bins thud.
 * Umbrellas flutter. Trams lurch. Ice-cream keeps its slide path (near-zero).
 */
export const SWAY_PROFILES = Object.freeze({
  tree: Object.freeze({
    // r9: 1-tap must leave headroom so kept-tapping is more lean, not more shred.
    omega: 4.65, zeta: 0.22, impulse: 0.58, maxTheta: 0.24, energyHit: 0.28, decay: 0.26,
    wobble: 0.04,
  }),
  lamp: Object.freeze({
    // r10: heavier metal nod. Clamp and 1-tap band stay.
    omega: 6.20, zeta: 0.34, impulse: 0.48, maxTheta: 0.20, energyHit: 0.22, decay: 0.28,
    wobble: 0.04,
  }),
  prop: Object.freeze({
    // r10: timber on four feet. Clamp and 1-tap band stay.
    omega: 6.80, zeta: 0.40, impulse: 0.42, maxTheta: 0.16, energyHit: 0.22, decay: 0.36,
    wobble: 0.04,
  }),
  heavy: Object.freeze({
    omega: 9.80, zeta: 0.30, impulse: 0.34, maxTheta: 0.14, energyHit: 0.30, decay: 0.56,
  }),
  umbrella: Object.freeze({
    omega: 6.15, zeta: 0.145, impulse: 0.50, maxTheta: 0.22, energyHit: 0.24, decay: 0.40,
  }),
  tram: Object.freeze({
    omega: 3.85, zeta: 0.40, impulse: 0.16, maxTheta: 0.07, energyHit: 0.32, decay: 0.70,
  }),
  bus: Object.freeze({
    omega: 4.15, zeta: 0.38, impulse: 0.22, maxTheta: 0.10, energyHit: 0.28, decay: 0.62,
  }),
  ice: Object.freeze({
    omega: 4.2, zeta: 0.55, impulse: 0.04, maxTheta: 0.02, energyHit: 0.20, decay: 0.80,
  }),
});

const REST_THETA = 0.01;   // ~0.6° — invisible at board distance
const REST_VEL = 0.02;
const REST_ENERGY = 8e-4;
const FIXED_DT = 1 / 60;

/**
 * Pick a profile from a mischief target. Kind first, then model id.
 * @param {{ kind?: string, model?: string, key?: string } | null} target
 * @returns {SwayKind}
 */
export function swayKindFor(target) {
  if (!target) return 'prop';
  if (target.kind === 'tree') return 'tree';
  if (target.kind === 'tram') return 'tram';
  if (target.kind === 'bus') return 'bus';
  const id = String(target.model ?? target.key ?? '').toLowerCase();
  if (id.includes('ice-cream') || id.includes('icecream')) return 'ice';
  if (id.includes('umbrella')) return 'umbrella';
  if (
    id.includes('lamp') || id.includes('signal') || id.includes('light')
    || id.includes('pylon') || id.includes('tram-flag') || id.includes('tram-stop')
  ) return 'lamp';
  if (
    id.includes('bin') || id.includes('bollard') || id.includes('planter')
    || id.includes('fountain') || id.includes('tree-guard') || id.includes('lifeguard')
  ) return 'heavy';
  return 'prop';
}

export function profileFor(target) {
  return SWAY_PROFILES[swayKindFor(target)];
}

/**
 * @param {typeof SWAY_PROFILES[SwayKind]} profile
 * @param {{ range: (a: number, b: number) => number, unit: () => number }} rng
 */
export function createSway(profile, rng, { heading } = {}) {
  // Lamps/benches lock heading 0 so the rock is pitch (thetaX), not a lazy-susan.
  const locked = Number.isFinite(heading) ? heading : rng.range(0, Math.PI * 2);
  return {
    thetaX: 0,
    thetaZ: 0,
    velX: 0,
    velZ: 0,
    energy: 0,
    taps: 0,
    heading: locked,
    active: false,
  };
}

export function resetSway(state) {
  state.thetaX = 0;
  state.thetaZ = 0;
  state.velX = 0;
  state.velZ = 0;
  state.energy = 0;
  state.taps = 0;
  state.active = false;
  return state;
}

/**
 * Add a tap impulse. Direction is the record heading plus a small seeded wobble
 * so two taps in a row do not sit on one plane.
 */
export function impulseSway(state, profile, rng) {
  const span = profile.wobble ?? 0.55;
  const wobble = rng.range(-span, span);
  const heading = state.heading + wobble;
  const boost = 1 + Math.min(0.85, state.energy * 0.9);
  const impulse = profile.impulse * boost;
  state.velX += Math.cos(heading) * impulse;
  state.velZ += Math.sin(heading) * impulse;
  // Instant offset is the still. Keep it under half of maxTheta so tap 3 can grow.
  state.thetaX += Math.cos(heading) * impulse * 0.18;
  state.thetaZ += Math.sin(heading) * impulse * 0.18;
  state.energy = Math.min(1, state.energy + profile.energyHit * (0.72 + rng.unit() * 0.28));
  state.taps += 1;
  state.active = true;
  return state;
}

function integrateAxis(theta, vel, omega, twoZetaOmega, dt) {
  // θ'' + 2ζω θ' + ω² θ = 0
  const acc = -omega * omega * theta - twoZetaOmega * vel;
  const nextVel = vel + acc * dt;
  const nextTheta = theta + nextVel * dt;
  return { theta: nextTheta, vel: nextVel };
}

/**
 * Fixed-step damped spring. Energy leaks even at rest so a single tap always
 * dies unless the player keeps feeding it. Reduced motion snaps to zero.
 */
export function stepSway(state, profile, dt, { reducedMotion = false } = {}) {
  if (reducedMotion) {
    resetSway(state);
    return state;
  }
  if (!state.active && state.energy <= REST_ENERGY) return state;

  const omega = profile.omega;
  const twoZetaOmega = 2 * profile.zeta * omega;
  let remaining = Math.min(0.05, Math.max(0, dt));
  while (remaining > 1e-6) {
    const step = Math.min(FIXED_DT, remaining);
    remaining -= step;
    const x = integrateAxis(state.thetaX, state.velX, omega, twoZetaOmega, step);
    const z = integrateAxis(state.thetaZ, state.velZ, omega, twoZetaOmega, step);
    state.thetaX = x.theta;
    state.velX = x.vel;
    state.thetaZ = z.theta;
    state.velZ = z.vel;
  }

  const max = profile.maxTheta;
  const amp = Math.hypot(state.thetaX, state.thetaZ);
  if (amp > max && amp > 1e-8) {
    const k = max / amp;
    state.thetaX *= k;
    state.thetaZ *= k;
    state.velX *= k;
    state.velZ *= k;
  }

  state.energy = Math.max(0, state.energy - profile.decay * Math.min(0.05, Math.max(0, dt)));
  if (state.energy <= REST_ENERGY) {
    // Energy is gone: collapse leftover ringing instead of waiting on the envelope.
    state.velX *= 0.78;
    state.velZ *= 0.78;
    state.thetaX *= 0.86;
    state.thetaZ *= 0.86;
  }

  const still = Math.abs(state.thetaX) < REST_THETA
    && Math.abs(state.thetaZ) < REST_THETA
    && Math.abs(state.velX) < REST_VEL
    && Math.abs(state.velZ) < REST_VEL
    && state.energy < REST_ENERGY;
  if (still) {
    state.thetaX = 0;
    state.thetaZ = 0;
    state.velX = 0;
    state.velZ = 0;
    state.energy = 0;
    state.active = false;
  } else {
    state.active = true;
  }
  return state;
}

export function swayAmplitude(state) {
  return Math.hypot(state.thetaX, state.thetaZ);
}

/**
 * Lift so a rotation about the pavement cannot bury the downhill foot.
 * halfX / halfZ are the world half-extents of the token.
 */
export function plantedLift(swayX, swayZ, halfX, halfZ) {
  return Math.abs(Math.sin(swayZ)) * Math.max(0, halfX)
    + Math.abs(Math.sin(swayX)) * Math.max(0, halfZ);
}

/**
 * World azimuth the crown travels when a planted tree falls.
 * Positive thetaZ leans toward +X; positive thetaX leans toward −Z.
 */
export function treeFallHeading(swayX, swayZ, fallback = 0) {
  if (Math.hypot(swayX, swayZ) > 0.02) return Math.atan2(-swayX, swayZ);
  return fallback;
}

/**
 * Lift so a fallen bole and remaining crown sit on the grate, not through it.
 * `scaleY` is the instance height in metres (baseMatrix Y scale).
 */
export function treeFallLift(angle, scaleY) {
  const boleHalf = Math.max(0.08, scaleY * 0.055);
  const crownRest = Math.max(0.18, scaleY * 0.12);
  const s = Math.abs(Math.sin(angle));
  const past = Math.max(0, -Math.cos(angle));
  return boleHalf * s + crownRest * s * s + crownRest * 0.35 * past;
}

/** Local Y of the lamp bolt — stone hex stays below; post nods above. */
export function lampHingeY(modelId) {
  const id = String(modelId ?? '').toLowerCase();
  if (id.includes('lamp') || id.includes('light') || id.includes('lantern')) return 0.42;
  return 0;
}

export function isLampBaseGeometry(geometry, hingeY) {
  if (!hingeY || !geometry) return false;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return geometry.boundingBox.max.y <= hingeY + 0.08;
}

export { REST_THETA, REST_ENERGY };
