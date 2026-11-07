// Construction-local tap physics. Independent of mischief.js / sway.js (those seats are live).
// Damped harmonic rock. More taps loosen the member (lower omega, bigger max theta).

const PROFILES = Object.freeze({
  beam: Object.freeze({
    omega0: 7.2, zeta: 0.13, impulse: 0.95, max0: 0.22, loosen: 0.07, decay: 0.32,
  }),
  joist: Object.freeze({
    omega0: 8.4, zeta: 0.16, impulse: 0.72, max0: 0.16, loosen: 0.05, decay: 0.38,
  }),
  truss: Object.freeze({
    omega0: 6.1, zeta: 0.12, impulse: 0.88, max0: 0.18, loosen: 0.06, decay: 0.3,
  }),
  scaffold: Object.freeze({
    omega0: 6.8, zeta: 0.18, impulse: 0.55, max0: 0.12, loosen: 0.04, decay: 0.4,
  }),
  skip: Object.freeze({
    omega0: 9.4, zeta: 0.28, impulse: 0.42, max0: 0.1, loosen: 0.03, decay: 0.55,
  }),
  hoarding: Object.freeze({
    omega0: 5.6, zeta: 0.2, impulse: 0.48, max0: 0.14, loosen: 0.04, decay: 0.36,
  }),
  excavator: Object.freeze({
    omega0: 4.2, zeta: 0.35, impulse: 0.22, max0: 0.08, loosen: 0.02, decay: 0.5,
  }),
  crane: Object.freeze({
    omega0: 3.6, zeta: 0.32, impulse: 0.18, max0: 0.06, loosen: 0.015, decay: 0.48,
  }),
  cone: Object.freeze({
    omega0: 10.5, zeta: 0.22, impulse: 0.85, max0: 0.28, loosen: 0.08, decay: 0.48,
  }),
  portaloo: Object.freeze({
    omega0: 6.4, zeta: 0.24, impulse: 0.5, max0: 0.16, loosen: 0.05, decay: 0.42,
  }),
  cabin: Object.freeze({
    omega0: 5.2, zeta: 0.32, impulse: 0.28, max0: 0.07, loosen: 0.02, decay: 0.5,
  }),
  formwork: Object.freeze({
    omega0: 8.8, zeta: 0.2, impulse: 0.6, max0: 0.12, loosen: 0.04, decay: 0.4,
  }),
});

const REST_THETA = 0.008;
const REST_VEL = 0.015;
const FIXED_DT = 1 / 60;

export function profileForKind(kind) {
  return PROFILES[kind] ?? PROFILES.beam;
}

export function createTapState(kind, heading = 0) {
  return {
    kind,
    thetaX: 0,
    thetaZ: 0,
    velX: 0,
    velZ: 0,
    energy: 0,
    taps: 0,
    heading,
    active: false,
  };
}

export function impulseTap(state, kind, salt = 0.31) {
  const p = profileForKind(kind);
  const loosen = 1 + Math.min(1.4, state.taps * p.loosen);
  const heading = state.heading + (salt - 0.5) * 1.1;
  const impulse = p.impulse * loosen * (1 + Math.min(0.7, state.energy * 0.8));
  state.velX += Math.cos(heading) * impulse;
  state.velZ += Math.sin(heading) * impulse;
  state.thetaX += Math.cos(heading) * impulse * 0.42;
  state.thetaZ += Math.sin(heading) * impulse * 0.42;
  state.energy = Math.min(1, state.energy + 0.28 * loosen);
  state.taps += 1;
  state.active = true;
  return state;
}

function integrate(theta, vel, omega, twoZetaOmega, dt) {
  const acc = -omega * omega * theta - twoZetaOmega * vel;
  const nextVel = vel + acc * dt;
  return { theta: theta + nextVel * dt, vel: nextVel };
}

export function stepTap(state, kind, dt, { reducedMotion = false } = {}) {
  if (reducedMotion) {
    state.thetaX = 0;
    state.thetaZ = 0;
    state.velX = 0;
    state.velZ = 0;
    state.energy = 0;
    state.active = false;
    return state;
  }
  const p = profileForKind(kind);
  const omega = p.omega0 / (1 + state.taps * p.loosen * 0.55);
  const twoZetaOmega = 2 * p.zeta * omega;
  const maxTheta = p.max0 * (1 + Math.min(1.6, state.taps * p.loosen * 2.2));
  let remaining = Math.min(0.05, Math.max(0, dt));
  while (remaining > 1e-6) {
    const step = Math.min(FIXED_DT, remaining);
    remaining -= step;
    const x = integrate(state.thetaX, state.velX, omega, twoZetaOmega, step);
    const z = integrate(state.thetaZ, state.velZ, omega, twoZetaOmega, step);
    state.thetaX = x.theta;
    state.velX = x.vel;
    state.thetaZ = z.theta;
    state.velZ = z.vel;
  }
  const amp = Math.hypot(state.thetaX, state.thetaZ);
  if (amp > maxTheta && amp > 1e-8) {
    const k = maxTheta / amp;
    state.thetaX *= k;
    state.thetaZ *= k;
    state.velX *= k;
    state.velZ *= k;
  }
  state.energy = Math.max(0, state.energy - p.decay * Math.min(0.05, Math.max(0, dt)));
  const still = Math.abs(state.thetaX) < REST_THETA
    && Math.abs(state.thetaZ) < REST_THETA
    && Math.abs(state.velX) < REST_VEL
    && Math.abs(state.velZ) < REST_VEL
    && state.energy < 8e-4;
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

export function applyTapPose(node, state) {
  if (!node) return;
  node.rotation.x = state.thetaX;
  node.rotation.z = state.thetaZ;
}

export function bindTapMembers(ctx) {
  for (const rec of ctx.taps) {
    rec.state = createTapState(rec.kind, ctx.u(`tap-h:${rec.label}`) * Math.PI * 2);
    rec.pick = rec.node;
  }
}

export function tickTaps(ctx, dt, { reducedMotion = false } = {}) {
  for (const rec of ctx.taps) {
    if (!rec.state) continue;
    if (rec.broken) {
      applyTapPose(rec.node, rec.state);
      continue;
    }
    stepTap(rec.state, rec.kind, dt, { reducedMotion });
    applyTapPose(rec.node, rec.state);
  }
}

export function impulseMember(rec, salt = 0.4) {
  if (!rec?.state) return 0;
  impulseTap(rec.state, rec.kind, salt);
  rec.taps = rec.state.taps;
  applyTapPose(rec.node, rec.state);
  return rec.taps;
}

export { PROFILES };
