// Party Animals-style toy gait for Zombie Shopper TD. Pure numbers; Three.js poses consume this.

export const PA_GAIT = Object.freeze({
  stepHz: 2.45,
  hop: 0.30,
  squash: 0.14,
  lean: 0.34,
  legSwing: 1.35,
  armSwing: 1.25,
  laneBias: -0.42,
  hipSway: 0,
  idleBob: 0.016,
  idleHz: 1.15,
  rageHz: 6.4,
  rageAmp: 0.035,
  turnRate: 10,
  turnMax: 9,
  popRate: 4.2,
  floorY: 0.55,
});

export function wrapDelta(delta) {
  let d = delta;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dampYaw(from, to, dt, rate, maxRate) {
  const delta = wrapDelta(to - from);
  const t = Math.max(0, dt);
  const k = Math.max(0, rate);
  const step = delta * (1 - Math.exp(-t * k));
  const cap = Math.max(0, maxRate) * t;
  if (cap <= 0) return from;
  if (Math.abs(step) <= cap) return from + step;
  return from + Math.sign(step) * cap;
}

export function createShopperGait(seed01 = 0) {
  return {
    phase: seed01 * Math.PI * 2,
    yaw: 0,
    pop: 0,
    clock: seed01 * 8,
  };
}

/**
 * One gait sample. `speed` is path units per second (shopper.speed is ~0.11–0.2 of path).
 * Returns SET poses, never additives.
 */
export function shopperGaitTick(state, {
  dt, moving, pathSpeed, yaw, rage, reducedMotion = false,
}) {
  const t = Math.max(0, dt);
  state.clock += t;
  state.pop = Math.min(1, state.pop + t * PA_GAIT.popRate);
  const targetYaw = Number.isFinite(yaw) ? yaw : state.yaw;
  state.yaw = reducedMotion
    ? targetYaw
    : dampYaw(state.yaw, targetYaw, t, PA_GAIT.turnRate, PA_GAIT.turnMax);

  if (reducedMotion) {
    return {
      hop: 0,
      squash: 0,
      scaleY: 1,
      scaleXZ: 1,
      lean: 0,
      sway: 0,
      leftLeg: 0,
      rightLeg: 0,
      leftArm: 0,
      rightArm: 0,
      yaw: state.yaw,
      pop: state.pop,
      stomp: 0,
    };
  }

  const cadence = 0.72 + Math.min(1.6, Math.max(0, pathSpeed) * 8);
  if (moving) {
    state.phase += t * PA_GAIT.stepHz * Math.PI * 2 * cadence;
  } else if (rage) {
    state.phase += t * PA_GAIT.rageHz;
  } else {
    state.phase += t * PA_GAIT.idleHz;
  }

  const s = Math.sin(state.phase);
  const c = Math.cos(state.phase);
  const two = Math.sin(state.phase * 2);
  const land = moving ? Math.max(0, -two) : 0;
  const hop = moving ? Math.max(0, two) * PA_GAIT.hop * (rage ? 1.25 : 1) : 0;
  const squash = moving ? land * PA_GAIT.squash : 0;
  const breathe = (!moving && !rage) ? (0.5 + 0.5 * Math.sin(state.clock * 2.2)) * PA_GAIT.idleBob : 0;
  const stomp = rage && !moving ? Math.sin(state.phase) * PA_GAIT.rageAmp : 0;
  const swing = moving ? c : (rage ? s * 0.35 : c * 0.08);

  return {
    hop: hop + breathe + Math.abs(stomp) * 0.4,
    squash,
    scaleY: 1 - squash + (moving ? 0 : breathe * 0.8),
    scaleXZ: 1 + squash * 0.22,
    lean: moving ? PA_GAIT.lean * Math.min(1, 0.35 + pathSpeed * 4) : (rage ? 0.08 : 0.03),
    sway: moving ? c * PA_GAIT.hipSway : 0,
    leftLeg: swing * PA_GAIT.legSwing,
    rightLeg: -swing * PA_GAIT.legSwing,
    leftArm: -swing * PA_GAIT.armSwing,
    rightArm: swing * PA_GAIT.armSwing,
    yaw: state.yaw,
    pop: state.pop,
    stomp,
  };
}

export function nextFreeTrapSlot(slots, kind) {
  return (slots ?? []).find((slot) => slot.kind === kind && !slot.used) ?? null;
}

export function pathYaw(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (dx * dx + dz * dz < 1e-10) return null;
  return Math.atan2(dx, dz);
}
