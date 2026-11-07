// District Deck — natural street gait helpers (presentation only).
// Pure numbers: MeshyPeoplePool consumes this; tests bite it without THREE/GLBs.
// No Math.random. Seed comes from the caller (`seedUnit` / hash).

export const GAIT = Object.freeze({
  walkGate: 0.1,
  stepMinSpeed: 0.3,
  wanderRadius: 0.7,
  wanderBound: 0.85,
  arriveEps: 0.05,
  headingCone: (40 * Math.PI) / 180,
  turnAlign: 0.08,
  turnMaxRate: 2.2,
  walkDampRate: 10,
  walkMaxRate: 4.0,
  idleDampRate: 6,
  idleMaxRate: 2.4,
  adultStepSpeed: 0.42,
  kidStepSpeed: 0.52,
  adultIdleMin: 4,
  adultIdleSpan: 7,
  kidIdleMin: 2,
  kidIdleSpan: 3,
  lookMax: 0.35,
  lookNeckShare: 0.4,
  lookEngage: 6,
  lookRelease: 4,
  lookHold: 1.8,
  lookDecayTo: 0.2,
  microLookAmp: 0.18,
  microLookMin: 5,
  microLookSpan: 4,
  microHoldMin: 1.0,
  microHoldSpan: 0.7,
  moonwalkMax: (18 * Math.PI) / 180,
  naturalWalk: 1.05,
  timeScaleMin: 0.55,
  timeScaleMax: 2.2,
  malePace: 0.76,
  femalePace: 0.90,
  maleStride: 0.88,
  femaleStride: 0.78,
  /** Ignore measured clip-forward below this; Mixamo shoulder swing is ~5° around +Z. */
  forwardDeadzone: (3 * Math.PI) / 180,
  travelerSnap: 1.2,
  /** Slerp UpLeg/LoLeg toward rest after the mixer. Mixamo contact is a 0.66 m split on a 1.38 m figure. */
  strideCompress: 0.40,
  /** Extra slerp toward rest at the passing pose so feet meet under the body. */
  passCompress: 0.78,
  /** Extra world-Y metres on the swing foot. Mixamo foot local Y is not world up. */
  swingLift: 0.14,
  /** Extra LoLeg flexion (radians) on the swing leg. Negative Mixamo local X is usually knee bend. */
  swingKnee: 0.55,
  /**
   * Mixamo walk binds a V: hip sockets wide, feet ~0.66 m apart on a 1.38 m figure.
   * World-space squeeze of UpLeg toward the figure midline (not bind local X —
   * Mixamo UpLeg.x is not lateral).
   */
  stanceNarrow: 0.72,
  /** Floor, metres, for each hip's world-X after squeeze. */
  stanceHalf: 0.032,
  /** Fraction of thigh lateral lean (frontal-plane V) cancelled every frame. */
  stanceAdduct: 0.90,
  /** Extra cancel at the passing pose so the swing foot tracks the stance foot. */
  passAdduct: 1.02,
  /** After adduct, pull remaining foot world-X toward the midline. */
  footTrack: 0.62,
  /** Floor, metres, for each foot's world-X after squeeze. */
  footHalf: 0.014,
});

/**
 * Scale a Mixamo UpLeg bind X toward a small half-width. Keeps sign; never widens.
 */
export function narrowHipX(restX, narrow = GAIT.stanceNarrow, half = GAIT.stanceHalf) {
  const sign = restX < 0 ? -1 : 1;
  const restAbs = Math.abs(restX);
  if (!(restAbs > 0)) return 0;
  const n = Math.max(0, Math.min(1, narrow));
  const floor = Math.max(0, half);
  const squeezed = restAbs * (1 - n);
  if (restAbs <= floor) return sign * restAbs;
  return sign * Math.max(floor, squeezed);
}

/** Pedestrian / cast ids inspected as female. Role suffixes (-mum/-girl) are handled in sexFor. */
export const FEMALE_IDS = Object.freeze(new Set([
  'architect',
  'ped-01',
  'ped-03',
  'ped-06',
  'ped-07',
]));

export function meanYaw(yaws) {
  if (!yaws?.length) return 0;
  let s = 0;
  let c = 0;
  for (const y of yaws) {
    s += Math.sin(y);
    c += Math.cos(y);
  }
  return Math.atan2(s, c);
}

/** Root-motion yaw from hips translation, or null when the clip is in-place (sway is not travel). */
export function clipRootMotionYaw(dx, dz, height) {
  const hypot = Math.hypot(dx, dz);
  if (hypot < 0.1 * Math.max(0.1, height)) return null;
  return Math.atan2(dx, dz);
}

export function composeLookSet(clip, look) {
  return {
    neck: clip.neck + look.neck,
    head: clip.head + look.head,
    spine: clip.spine + (look.spine ?? 0),
  };
}

export function wrapDelta(delta) {
  let d = delta;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function wrapYaw(yaw) {
  return wrapDelta(yaw);
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

export function walkTimeScale(speed, naturalSpeed, cadence = 1) {
  const v = Math.max(0, speed);
  if (v < GAIT.walkGate) return 0;
  const natural = Math.max(0.05, naturalSpeed);
  const c = Number.isFinite(cadence) ? cadence : 1;
  const raw = (v / natural) * c;
  return Math.min(GAIT.timeScaleMax, Math.max(GAIT.timeScaleMin, raw));
}

export function sexFromId(id) {
  return sexFor(id);
}

export function sexFor(id) {
  const s = String(id);
  if (s.endsWith('-dad') || s.endsWith('-boy')) return 'male';
  if (s.endsWith('-mum') || s.endsWith('-girl') || /(^|-)(mum|girl|woman|female)(-|$)/i.test(s)) {
    return 'female';
  }
  if (FEMALE_IDS.has(s)) return 'female';
  return 'male';
}

export function cadenceFor(id) {
  const styled = styleForSex(sexFor(id));
  return styled.pace / Math.max(0.4, styled.stride);
}

export function styleForSex(sex) {
  if (sex === 'female') {
    return { pace: GAIT.femalePace, stride: GAIT.femaleStride };
  }
  return { pace: GAIT.malePace, stride: GAIT.maleStride };
}

export function clipShouldPlay(speed) {
  return speed > GAIT.walkGate;
}

function clampDisc(x, z, cx, cz, radius) {
  const dx = x - cx;
  const dz = z - cz;
  const d = Math.hypot(dx, dz);
  if (d <= radius || d < 1e-9) return { x, z };
  const k = radius / d;
  return { x: cx + dx * k, z: cz + dz * k };
}

function sampleDisc(cx, cz, radius, u, v) {
  const ang = u * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, v)) * radius;
  return {
    x: cx + Math.sin(ang) * r,
    z: cz + Math.cos(ang) * r,
  };
}

function pickStepTarget(state, params, seedFn) {
  const cone = GAIT.headingCone;
  const used = state.facing + (seedFn(state.clock + 1) - 0.5) * 2 * cone;
  const dist = 0.22 + seedFn(state.clock + 2) * 0.40;
  let rawX = state.x + Math.sin(used) * dist;
  let rawZ = state.z + Math.cos(used) * dist;
  let bounded = clampDisc(rawX, rawZ, params.homeX, params.homeZ, GAIT.wanderBound);
  let heading = Math.atan2(bounded.x - state.x, bounded.z - state.z);
  if (Math.abs(wrapDelta(heading - state.facing)) > cone
    || Math.hypot(bounded.x - state.x, bounded.z - state.z) < 0.08) {
    const fallback = 0.18;
    rawX = state.x + Math.sin(state.facing) * fallback;
    rawZ = state.z + Math.cos(state.facing) * fallback;
    bounded = clampDisc(rawX, rawZ, params.homeX, params.homeZ, GAIT.wanderBound);
    heading = Math.atan2(bounded.x - state.x, bounded.z - state.z);
    if (Math.abs(wrapDelta(heading - state.facing)) > cone) {
      heading = Math.atan2(params.homeX - state.x, params.homeZ - state.z);
      if (Math.abs(wrapDelta(heading - state.facing)) > cone) heading = state.facing;
      bounded = clampDisc(
        state.x + Math.sin(heading) * fallback,
        state.z + Math.cos(heading) * fallback,
        params.homeX, params.homeZ, GAIT.wanderBound,
      );
    }
  }
  return { heading, targetX: bounded.x, targetZ: bounded.z };
}

function idleSpan(params, seedFn, salt) {
  if (params.kid) return GAIT.kidIdleMin + seedFn(salt) * GAIT.kidIdleSpan;
  return GAIT.adultIdleMin + seedFn(salt) * GAIT.adultIdleSpan;
}

export function createWanderState(homeX, homeZ, homeYaw, seed01 = 0) {
  return {
    mode: 'idle',
    modeT: seed01 * 2.4,
    idleFor: 4 + seed01 * 5,
    facing: homeYaw,
    x: homeX,
    z: homeZ,
    heading: homeYaw,
    targetX: homeX,
    targetZ: homeZ,
    clock: seed01 * 12,
    stepping: false,
  };
}

/**
 * Advance one wander brain. Mutates `state`. Positions stay inside a 1.5 m disc of home.
 * Facing never jumps: turn and walk share a damped channel with a hard rad/s clamp.
 */
export function wanderTick(state, params, dt, seedFn) {
  const t = Math.max(0, dt);
  state.clock += t;
  if (params.reducedMotion || !params.allowWander) {
    state.mode = 'idle';
    state.modeT = 0;
    state.stepping = false;
    state.x = params.homeX;
    state.z = params.homeZ;
    if (params.reducedMotion) {
      state.facing = params.homeYaw;
    } else {
      state.facing = dampYaw(
        state.facing, params.homeYaw, t, GAIT.idleDampRate, GAIT.idleMaxRate,
      );
    }
    return state;
  }

  if (state.mode === 'idle') {
    state.modeT += t;
    state.stepping = false;
    if (state.modeT >= state.idleFor) {
      const pick = pickStepTarget(state, params, seedFn);
      state.heading = pick.heading;
      state.targetX = pick.targetX;
      state.targetZ = pick.targetZ;
      state.mode = 'turn';
      state.modeT = 0;
    }
  } else if (state.mode === 'turn') {
    state.modeT += t;
    state.stepping = false;
    state.facing = dampYaw(
      state.facing, state.heading, t, GAIT.idleDampRate, GAIT.turnMaxRate,
    );
    if (Math.abs(wrapDelta(state.heading - state.facing)) <= GAIT.turnAlign) {
      state.mode = 'step';
      state.modeT = 0;
    }
  } else if (state.mode === 'step') {
    state.modeT += t;
    const speed = params.kid ? GAIT.kidStepSpeed : GAIT.adultStepSpeed;
    const dx = state.targetX - state.x;
    const dz = state.targetZ - state.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= GAIT.arriveEps) {
      state.x = state.targetX;
      state.z = state.targetZ;
      state.mode = 'idle';
      state.modeT = 0;
      state.idleFor = idleSpan(params, seedFn, state.clock + 7);
      state.stepping = false;
    } else {
      const travel = Math.min(dist, speed * t);
      state.x += (dx / dist) * travel;
      state.z += (dz / dist) * travel;
      const toward = Math.atan2(dx, dz);
      state.facing = dampYaw(
        state.facing, toward, t, GAIT.walkDampRate, GAIT.walkMaxRate,
      );
      state.stepping = true;
    }
  }

  const held = clampDisc(state.x, state.z, params.homeX, params.homeZ, GAIT.wanderBound);
  state.x = held.x;
  state.z = held.z;
  return state;
}

export function createLookState(seed01 = 0) {
  return {
    applied: 0,
    target: 0,
    holdT: 0,
    holdFor: 0,
    microT: seed01 * 3,
    microNext: GAIT.microLookMin + seed01 * GAIT.microLookSpan,
    external: false,
  };
}

/**
 * Neck/head glance. `worldLookYaw` is a world facing to glance toward, or null.
 * Returns { applied, neck, head } relative to body facing, clamped to ±lookMax.
 */
export function lookTick(state, { facing, worldLookYaw, dt, idle, reducedMotion, seedFn }) {
  const t = Math.max(0, dt);
  if (reducedMotion) {
    state.applied = 0;
    state.target = 0;
    state.holdT = 0;
    state.external = false;
    return { applied: 0, neck: 0, head: 0 };
  }

  if (Number.isFinite(worldLookYaw)) {
    state.external = true;
    state.target = Math.max(-GAIT.lookMax, Math.min(GAIT.lookMax, wrapDelta(worldLookYaw - facing)));
    state.holdT += t;
    if (state.holdT > GAIT.lookHold) {
      state.target *= GAIT.lookDecayTo;
    }
    state.applied = dampYaw(state.applied, state.target, t, GAIT.lookEngage, 8);
  } else {
    if (state.external) {
      state.external = false;
      state.target = 0;
      state.holdT = 0;
    }
    if (idle) {
      state.microT += t;
      if (state.microT >= state.microNext && state.holdFor <= 0) {
        const amp = (seedFn(state.microNext + 1) - 0.5) * 2 * GAIT.microLookAmp;
        state.target = amp;
        state.holdFor = GAIT.microHoldMin + seedFn(state.microNext + 2) * GAIT.microHoldSpan;
        state.holdT = 0;
        state.microT = 0;
        state.microNext = GAIT.microLookMin + seedFn(state.microNext + 3) * GAIT.microLookSpan;
      }
      if (state.holdFor > 0) {
        state.holdT += t;
        if (state.holdT >= state.holdFor) {
          state.holdFor = 0;
          state.target = 0;
        }
      }
    } else {
      state.target = 0;
      state.holdFor = 0;
    }
    state.applied = dampYaw(state.applied, state.target, t, GAIT.lookRelease, 6);
  }

  state.applied = Math.max(-GAIT.lookMax, Math.min(GAIT.lookMax, state.applied));
  const neck = state.applied * GAIT.lookNeckShare;
  const head = state.applied * (1 - GAIT.lookNeckShare);
  return { applied: state.applied, neck, head };
}
