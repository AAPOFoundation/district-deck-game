// Intra-quarter + plant animation. One bounded work cycle is requested by each quarter change;
// the finished pose then holds until the next request. No timer or private rAF lives here.

import { CYCLE_SECONDS } from './kit.js';

export function fract(t) {
  return t - Math.floor(t);
}

export function smoothstep(a, b, x) {
  if (b === a) return x >= b ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function remap(x, a, b) {
  return smoothstep(a, b, x);
}

/** Arm one and only one work cycle for a simulation quarter. Repeated same-quarter syncs no-op. */
export function requestSiteWorkCycle(group, quarter) {
  if (!group?.userData) return false;
  const q = Math.max(0, Math.floor(Number(quarter) || 0));
  if (group.userData.requestedWorkQuarter === q) return false;
  group.userData.requestedWorkQuarter = q;
  group.userData.workCycleOrigin = null;
  group.userData.workCycleRunning = true;
  group.userData.workCycleComplete = false;
  group.userData.workCycleRunsOnce = true;
  return true;
}

/**
 * Clamped 0→1 progress from this site's first ordinary scene tick. Unlike the old `fract`
 * clock, reaching 1 is terminal until `requestSiteWorkCycle` sees a new quarter.
 */
export function siteProgress(group, elapsed) {
  const override = group?.userData?.progressOverride;
  if (Number.isFinite(override)) return Math.min(1, Math.max(0, override));
  if (!group?.userData) return 1;
  if (!Number.isInteger(group.userData.requestedWorkQuarter)) {
    requestSiteWorkCycle(group, group.userData.quarter ?? 0);
  }
  const cycle = group?.userData?.cycleSeconds ?? CYCLE_SECONDS;
  const t = elapsed ?? 0;
  if (!Number.isFinite(group.userData.workCycleOrigin)) {
    group.userData.workCycleOrigin = t;
    group.userData.workCycleRunning = true;
    group.userData.workCycleComplete = false;
    return 0;
  }
  const progress = Math.min(1, Math.max(
    0,
    (t - group.userData.workCycleOrigin) / Math.max(4, cycle),
  ));
  if (progress >= 1) {
    group.userData.workCycleRunning = false;
    group.userData.workCycleComplete = true;
    group.userData.completedWorkQuarter = group.userData.requestedWorkQuarter;
  }
  return progress;
}

/**
 * Pose a 4-DOF excavator.
 * rig = { turret, boom, stick, bucket, rams? }
 * Cycle: approach → scoop → lift → swing → dump → return.
 */
export function poseExcavator(rig, p, { tapYaw = 0 } = {}) {
  if (!rig?.turret) return;
  const scoop = remap(p, 0.18, 0.38);
  const lift = remap(p, 0.38, 0.58);
  const swing = remap(p, 0.58, 0.78);
  const dump = remap(p, 0.76, 0.9);
  const back = remap(p, 0.9, 1);

  // Boom lies along local -X. Positive Z rotation lifts the bucket; keep the
  // work pose low over the pad so stills are not a yellow stick in the sky.
  const boomLift = 0.22 + scoop * 0.08 + lift * 0.42 - dump * 0.05 - back * 0.18;
  const stickCurl = 0.25 + scoop * 0.85 - dump * 0.7 + back * 0.1;
  const bucketCurl = -0.2 + scoop * 1.15 - dump * 1.25 + back * 0.15;
  const yaw = -0.08 + swing * 0.95 - back * 0.9 + tapYaw;

  rig.turret.rotation.y = yaw;
  if (rig.boom) rig.boom.rotation.z = boomLift;
  if (rig.stick) rig.stick.rotation.z = stickCurl;
  if (rig.bucket) rig.bucket.rotation.z = bucketCurl;
}

/** Concrete pump boom reaches over the pad as the pour grows. */
export function posePump(rig, p) {
  if (!rig?.boom) return;
  const reach = remap(p, 0.42, 0.85);
  rig.boom.rotation.z = -0.25 - reach * 0.35;
  if (rig.stick) rig.stick.rotation.z = 0.55 - reach * 0.4;
  if (rig.hose) {
    rig.hose.scale.y = 0.55 + reach * 0.7;
    rig.hose.position.y = (rig.hose.userData.baseY ?? 0.4) * (0.7 + reach * 0.4);
  }
}

/** Layer visibility / scale for intra-quarter micro-phases. */
export function poseLayers(ctx, p) {
  const set = (name, visible) => {
    const g = ctx.layers.get(name);
    if (!g) return;
    g.visible = Boolean(visible);
    g.scale.set(1, 1, 1);
  };
  const stage = ctx.stageIndex;
  if (stage <= 0) {
    // Keep the demolition read on screen for most of the cycle. Excavation
    // layers in later; it must not wipe the site to a bare dirt pad at t≈0.
    set('demo-pad', p < 0.72);
    set('demo-walls', p < 0.78);
    set('demo-rubble', p < 0.7);
    set('demo-spoil', true);
    set('excavation', p > 0.45);
    set('shoring', p > 0.55);
  } else if (stage === 1) {
    set('pit-hold', p < 0.3);
    set('formwork', p > 0.06);
    set('rebar', p > 0.18);
    set('pour', p > 0.4);
    set('cure', p > 0.78);
  } else if (stage === 2) {
    set('slab-hold', true);
    set('frame-l0', p > 0.02);
    set('frame-l1', p > 0.28);
    set('frame-roof', p > 0.52);
    set('frame-brace', p > 0.7);
  } else {
    const hasFinished = Boolean(ctx.layers.get('completed')?.children?.length);
    set('frame-ghost', p < (hasFinished ? 0.28 : 0.4));
    set('shell', p > 0.06 && (!hasFinished || p < 0.7));
    set('glazing', p > 0.28 && (!hasFinished || p < 0.7));
    set('roof', p > 0.5 && (!hasFinished || p < 0.7));
    set('completed', hasFinished ? p > 0.18 : p > 0.62);
    set('scaffold', p < 0.92);
    set('hoarding', p < 0.88);
  }
}

/** Rising wet puddle on the slab. */
export function posePour(ctx, p) {
  const wet = ctx.rigs.wet;
  if (!wet) return;
  const k = remap(p, 0.48, 0.82);
  wet.scale.set(0.25 + k * 0.75, 1, 0.25 + k * 0.75);
  wet.visible = k > 0.04;
  if (wet.material && wet.material.roughness != null) {
    wet.material.roughness = 0.22 + remap(p, 0.78, 1) * 0.5;
  }
}

export function tickSite(ctx, dt, elapsed, { reducedMotion = false } = {}) {
  const p = reducedMotion ? 1 : siteProgress(ctx.group, elapsed);
  if (reducedMotion) {
    ctx.group.userData.workCycleRunning = false;
    ctx.group.userData.workCycleComplete = true;
    ctx.group.userData.completedWorkQuarter = ctx.group.userData.requestedWorkQuarter;
  }
  ctx.group.userData.progress = p;
  poseLayers(ctx, p);
  poseExcavator(ctx.rigs.excavator, fract(p * 1.15 + 0.05), {
    tapYaw: ctx.rigs.excavator?.tapYaw ?? 0,
  });
  posePump(ctx.rigs.pump, p);
  posePour(ctx, p);
  if (ctx.rigs.crane) {
    ctx.rigs.crane.rotation.y = Math.sin(p * Math.PI * 1.5) * 0.55;
  }
  if (ctx.rigs.netting) {
    for (const panel of ctx.rigs.netting) {
      panel.rotation.y = Math.sin(p * Math.PI * 5 + panel.userData.phase) * 0.04;
    }
  }
  for (const fn of ctx.anims) fn(p, dt, elapsed, { reducedMotion });
}

export function attachTicker(group, ctx) {
  group.userData.ctx = ctx;
  group.userData.tick = (dt, elapsed, opts = {}) => {
    tickSite(ctx, dt, elapsed, opts);
  };
}
