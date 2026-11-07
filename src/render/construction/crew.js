// Toy site gang — pavement-scale Monopoly-Plus tokens. Occupancy at the play/orbit camera.

import * as THREE from 'three';
import { box, cyl, sphere, capsule } from './kit.js';
import { PROPORTIONS } from '../people/core.js';

/**
 * The raw token reaches 1.842 m from sole to the tallest hard-hat variant. It used to be
 * multiplied by 1.45–1.60, yielding 2.67–2.95 m giants beside 1.38 m pavement figures.
 */
export const SITE_CREW_RAW_STATURE_MAX = 1.842;
export const SITE_CREW_TARGET_STATURE = PROPORTIONS.height;
export const SITE_CREW_SCALE_MAX = SITE_CREW_TARGET_STATURE / SITE_CREW_RAW_STATURE_MAX;
export const SITE_CREW_STATURE_AUDIT = Object.freeze({
  rawMax: SITE_CREW_RAW_STATURE_MAX,
  oldScaleMin: 1.45,
  oldScaleMax: 1.60,
  oldCrownMin: Math.round(SITE_CREW_RAW_STATURE_MAX * 1.45 * 1000) / 1000,
  oldCrownMax: Math.round(SITE_CREW_RAW_STATURE_MAX * 1.60 * 1000) / 1000,
  pavementCrown: SITE_CREW_TARGET_STATURE,
  newScaleMin: SITE_CREW_SCALE_MAX * 0.96,
  newScaleMax: SITE_CREW_SCALE_MAX,
});

function mats(ctx) {
  const P = ctx.palette;
  const jeanA = ctx.materials.get('asphalt', {
    variant: 'cs-crew-jean', color: '#2c4568', roughness: 0.88,
  });
  const jeanB = ctx.materials.get('asphalt', {
    variant: 'cs-crew-jean-b', color: '#4a4030', roughness: 0.9,
  });
  const skinA = ctx.materials.get('render', {
    variant: 'cs-crew-skin', color: '#d9a07a', roughness: 0.74,
  });
  const skinB = ctx.materials.get('render', {
    variant: 'cs-crew-skin-b', color: '#c4865c', roughness: 0.76,
  });
  const stud = ctx.materials.get('painted_metal', {
    variant: 'cs-crew-stud', color: '#f4f0e6', roughness: 0.55, metalness: 0.08,
  });
  return {
    P, jeanA, jeanB, skinA, skinB, stud,
    tape: P.white,
    boot: P.black,
    sole: P.steelDark,
    glove: P.yellowDark,
    steel: P.steel,
    handle: P.plate,
    belt: P.steelDark,
  };
}

function gateZ(ctx) {
  return -(ctx.d + 1.05) / 2;
}

function clampLot(ctx, x, z) {
  const mx = (ctx.w + 1.05) / 2 - 0.2;
  const mz = (ctx.d + 1.05) / 2 - 0.2;
  return {
    x: Math.max(-mx, Math.min(mx, x)),
    z: Math.max(-mz, Math.min(mz, z)),
  };
}

function towardCentre(x, z, dist) {
  const len = Math.hypot(x, z) || 1;
  return { x: x - (x / len) * dist, z: z - (z / len) * dist };
}

function plantBeside(ctx, labels, dist, fbX, fbZ) {
  for (const lab of labels) {
    const node = ctx.taps.find((t) => t.label === lab)?.node;
    if (!node) continue;
    return towardCentre(node.position.x, node.position.z, dist);
  }
  return { x: fbX, z: fbZ };
}

function separateSlots(ctx, slots, minDist) {
  const out = slots.map((s) => ({ ...s }));
  for (let iter = 0; iter < 10; iter += 1) {
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        const dx = out[j].x - out[i].x;
        const dz = out[j].z - out[i].z;
        const dist = Math.hypot(dx, dz);
        if (dist >= minDist || dist < 1e-6) continue;
        const push = (minDist - dist) / 2;
        const nx = dx / dist;
        const nz = dz / dist;
        out[i].x -= nx * push;
        out[i].z -= nz * push;
        out[j].x += nx * push;
        out[j].z += nz * push;
      }
    }
    for (const s of out) {
      const p = clampLot(ctx, s.x, s.z);
      s.x = p.x;
      s.z = p.z;
    }
  }
  return out;
}

function tag(id, part, extra = {}) {
  return { name: `site-crew:${id}:${part}`, ...extra };
}

function restOf(pose) {
  switch (pose) {
    case 'swing':
      return { lX: 0.45, rX: 2.42, lZ: 0.22, rZ: 0.18, tX: 0.18, hipL: -0.22, hipR: 0.34 };
    case 'clear':
      return { lX: -0.88, rX: -1.18, lZ: 0.12, rZ: -0.1, tX: 0.48, hipL: -0.42, hipR: -0.16 };
    case 'pour':
      return { lX: -1.08, rX: -1.22, lZ: 0.16, rZ: -0.14, tX: 0.68, hipL: -0.58, hipR: -0.28 };
    case 'watch':
      return { lX: 0.22, rX: -0.62, lZ: 0.38, rZ: 0.12, tX: 0.06, hipL: 0.1, hipR: -0.14 };
    case 'timber':
      return { lX: -1.22, rX: -1.22, lZ: 0.32, rZ: -0.32, tX: 0.2, hipL: -0.3, hipR: 0.24 };
    case 'fit':
      return { lX: -1.08, rX: -0.58, lZ: 0.14, rZ: -0.1, tX: 0.28, hipL: -0.2, hipR: 0.12 };
    default:
      return { lX: 0.12, rX: 0.12, lZ: 0.08, rZ: -0.08, tX: 0, hipL: 0, hipR: 0 };
  }
}

function addSledge(arm, C, id) {
  const t = new THREE.Group();
  t.position.set(0.04, -0.52, 0);
  t.rotation.set(-0.15, 0, 0.55);
  arm.add(t);
  cyl(t, 0.05, 0.055, 1.22, 6, C.handle, 0, -0.22, 0, tag(id, 'sledge-haft'));
  box(t, 0.62, 0.26, 0.26, C.P.steelDark, 0, -0.86, 0, tag(id, 'sledge-head'));
  box(t, 0.66, 0.08, 0.08, C.P.hazard, 0, -0.86, 0, tag(id, 'sledge-lip', { cast: false }));
}

function addShovel(arm, C, id) {
  const t = new THREE.Group();
  t.position.set(0, -0.5, 0);
  t.rotation.set(-0.62, 0, 0.12);
  arm.add(t);
  cyl(t, 0.042, 0.048, 1.12, 6, C.handle, 0, -0.28, 0, tag(id, 'shovel-haft'));
  box(t, 0.42, 0.06, 0.48, C.P.steel, 0, -0.88, 0.08, tag(id, 'shovel-blade'));
  box(t, 0.42, 0.05, 0.1, C.P.orange, 0, -0.88, 0.3, tag(id, 'shovel-lip'));
}

function addScreed(arm, C, id) {
  const t = new THREE.Group();
  t.position.set(0, -0.5, 0);
  t.rotation.set(-0.15, 0, 0);
  arm.add(t);
  box(t, 0.08, 0.07, 1.15, C.P.safety, 0, 0, 0.22, tag(id, 'screed'));
  box(t, 0.1, 0.05, 0.12, C.P.steelDark, 0, 0, 0.78, tag(id, 'screed-end', { cast: false }));
}

function addBoard(torso, C, id) {
  box(torso, 0.06, 0.78, 0.46, C.P.white, 0.32, 0.08, 0.28, tag(id, 'board'));
  box(torso, 0.04, 0.78, 0.06, C.P.plate, 0.28, 0.08, 0.28, tag(id, 'board-edge', { cast: false }));
}

function addStud(torso, C, id) {
  box(torso, 1.45, 0.18, 0.18, C.stud, 0, 0.08, 0.34, tag(id, 'stud', { rotZ: 0.08 }));
  box(torso, 0.16, 0.2, 0.2, C.P.hazard, -0.55, 0.08, 0.34, tag(id, 'stud-band', { cast: false }));
  box(torso, 0.16, 0.2, 0.2, C.P.hazard, 0.55, 0.08, 0.34, tag(id, 'stud-band-b', { cast: false }));
}

function addRadio(arm, C, id) {
  box(arm, 0.14, 0.26, 0.1, C.P.black, 0, -0.5, 0.05, tag(id, 'radio'));
  cyl(arm, 0.018, 0.018, 0.2, 5, C.P.steel, 0.04, -0.34, 0.05, tag(id, 'radio-ant', { cast: false }));
  box(arm, 0.08, 0.04, 0.04, C.P.orange, 0, -0.42, 0.1, tag(id, 'radio-pip', { cast: false }));
}

function addFigure(layer, C, id, slot) {
  const { x, z, y, yaw, pose } = slot;
  const hivis = slot.hivis;
  const hatMat = slot.hat;
  const skin = slot.skin;
  const jean = slot.jean;
  const g = new THREE.Group();
  g.name = `site-crew:${id}`;
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  layer.add(g);

  box(g, 0.7, 0.04, 0.5, C.P.black, 0, 0.02, 0.04, tag(id, 'shadow', { cast: false, receive: false }));

  const rest = restOf(pose);
  const hipY = 0.78;
  const hipL = new THREE.Group();
  hipL.position.set(-0.14, hipY, 0);
  hipL.rotation.x = rest.hipL;
  g.add(hipL);
  capsule(hipL, 0.09, 0.52, 6, jean, 0, -0.34, 0);
  box(hipL, 0.26, 0.16, 0.34, C.boot, 0, -0.70, 0.05, tag(id, 'boot-l'));
  box(hipL, 0.28, 0.04, 0.36, C.sole, 0, -0.76, 0.06, tag(id, 'sole-l', { cast: false }));

  const hipR = new THREE.Group();
  hipR.position.set(0.14, hipY, 0);
  hipR.rotation.x = rest.hipR;
  g.add(hipR);
  capsule(hipR, 0.09, 0.52, 6, jean, 0, -0.34, 0);
  box(hipR, 0.26, 0.16, 0.34, C.boot, 0, -0.70, 0.05, tag(id, 'boot-r'));
  box(hipR, 0.28, 0.04, 0.36, C.sole, 0, -0.76, 0.06, tag(id, 'sole-r', { cast: false }));

  const girth = slot.girth ?? 1;
  box(g, 0.4 * girth, 0.22, 0.24, jean, 0, 0.68, 0, tag(id, 'hips'));
  box(g, 0.44 * girth, 0.09, 0.28, C.belt, 0, 0.78, 0, tag(id, 'belt'));
  box(g, 0.12, 0.12, 0.1, C.handle, -0.18 * girth, 0.78, 0.16, tag(id, 'pouch', { cast: false }));

  const torso = new THREE.Group();
  torso.name = `site-crew:${id}:torso`;
  torso.position.set(0, 0.82, 0);
  torso.rotation.x = rest.tX;
  g.add(torso);

  box(torso, 0.46 * girth, 0.5, 0.3, hivis, 0, 0.26, 0, tag(id, 'vest'));
  const tapes = slot.tapes ?? 2;
  if (tapes >= 1) box(torso, 0.48 * girth, 0.08, 0.32, C.tape, 0, 0.12, 0, tag(id, 'tape-lo', { cast: false }));
  if (tapes >= 2) box(torso, 0.48 * girth, 0.08, 0.32, C.tape, 0, 0.34, 0, tag(id, 'tape-hi', { cast: false }));
  if (tapes >= 3) box(torso, 0.08, 0.36, 0.32, C.tape, 0, 0.24, 0, tag(id, 'tape-mid', { cast: false }));
  box(torso, 0.16 * girth, 0.12, 0.32, C.P.yellowDark, -0.16 * girth, 0.44, 0, tag(id, 'fade-l', { cast: false }));
  box(torso, 0.16 * girth, 0.12, 0.32, C.P.yellowDark, 0.16 * girth, 0.44, 0, tag(id, 'fade-r', { cast: false }));

  const armL = new THREE.Group();
  armL.position.set(-0.28 * girth, 0.4, 0);
  torso.add(armL);
  capsule(armL, 0.07, 0.48, 6, hivis, 0, -0.2, 0);
  sphere(armL, 0.08, 6, C.glove, 0, -0.46, 0, tag(id, 'glove-l'));

  const armR = new THREE.Group();
  armR.position.set(0.28 * girth, 0.4, 0);
  torso.add(armR);
  capsule(armR, 0.07, 0.48, 6, hivis, 0, -0.2, 0);
  sphere(armR, 0.08, 6, C.glove, 0, -0.46, 0, tag(id, 'glove-r'));

  cyl(torso, 0.08, 0.09, 0.12, 6, skin, 0, 0.54, 0.02, tag(id, 'neck'));
  sphere(torso, 0.16, 8, skin, 0, 0.66, 0.03, tag(id, 'head'));

  const hat = new THREE.Group();
  hat.position.set(0, 0.78, 0.03);
  hat.scale.setScalar(slot.hatScale ?? 1.06);
  torso.add(hat);
  sphere(hat, 0.16, 8, hatMat, 0, 0.06, 0, tag(id, 'hat'));
  cyl(hat, 0.22, 0.22, 0.045, 10, hatMat, 0, -0.02, 0.02, tag(id, 'brim'));
  box(hat, 0.06, 0.035, 0.16, C.P.black, 0, -0.01, 0.14, tag(id, 'peak', { cast: false }));

  if (pose === 'swing') addSledge(armR, C, id);
  else if (pose === 'clear') addShovel(armR, C, id);
  else if (pose === 'pour') addScreed(armR, C, id);
  else if (pose === 'timber') addStud(torso, C, id);
  else if (pose === 'fit') addBoard(torso, C, id);
  else addRadio(armL, C, id);

  armL.rotation.set(rest.lX, 0, rest.lZ);
  armR.rotation.set(rest.rX, 0, rest.rZ);
  armL.userData.rest = { x: rest.lX, y: 0, z: rest.lZ };
  armR.userData.rest = { x: rest.rX, y: 0, z: rest.rZ };
  torso.userData.rest = { x: rest.tX, y: 0, z: 0 };
  hipL.userData.rest = { x: rest.hipL, y: 0, z: 0 };
  hipR.userData.rest = { x: rest.hipR, y: 0, z: 0 };
  g.userData.restYaw = yaw;
  g.userData.workPosition = new THREE.Vector3(x, y, z);
  g.userData.entryPosition = new THREE.Vector3(
    slot.entryX ?? x,
    slot.entryY ?? 0,
    slot.entryZ ?? z,
  );

  const token = slot.scale ?? SITE_CREW_SCALE_MAX;
  g.scale.setScalar(token);

  g.traverse((o) => {
    if (o.isMesh && !String(o.name).startsWith('site-crew:')) {
      o.name = `site-crew:${id}`;
    }
  });

  return {
    root: g, torso, armL, armR, hipL, hipR, pose, phase: slot.phase,
  };
}

function cameraScaffold(ctx) {
  const halfW = ctx.w * 0.39 + 0.62;
  const halfD = ctx.d * 0.36 + 0.62;
  return {
    zFace: { x: 0.7, z: halfD - 0.26, y: 2.05, yaw: Math.PI },
    xFace: { x: halfW - 0.26, z: 0.55, y: 2.05, yaw: -Math.PI / 2 },
  };
}

function buildRoster(ctx) {
  const { w, d } = ctx;
  const stage = ctx.stageIndex ?? 0;
  const gz = gateZ(ctx);
  const skip = plantBeside(ctx, ['skip'], 1.85, w * 0.42, -d * 0.28);
  const cabin = plantBeside(ctx, ['cabin', 'loo'], 1.75, -w * 0.4, d * 0.32);
  const sc = cameraScaffold(ctx);

  let raw;
  if (stage <= 0) {
    raw = [
      { x: 0.85, z: gz + 0.55, y: 0, yaw: 0, pose: 'swing' },
      { x: skip.x, z: skip.z, y: 0, yaw: -0.6, pose: 'clear' },
      { x: cabin.x, z: cabin.z, y: 0, yaw: 0.4, pose: 'watch' },
      { x: -1.15, z: 0.35, y: 0, yaw: 0.2, pose: 'swing' },
      { x: 0.9, z: d * 0.42, y: 0, yaw: Math.PI, pose: 'watch' },
    ];
  } else if (stage === 1) {
    raw = [
      { x: 0.85, z: gz + 0.55, y: 0, yaw: 0, pose: 'watch' },
      { x: skip.x, z: skip.z, y: 0, yaw: -0.5, pose: 'clear' },
      { x: cabin.x, z: cabin.z, y: 0, yaw: 0.35, pose: 'watch' },
      { x: -0.9, z: -0.15, y: 0.22, yaw: 0.25, pose: 'pour' },
      { x: 0.8, z: d * 0.34, y: 0.22, yaw: Math.PI, pose: 'pour' },
    ];
  } else if (stage === 2) {
    const frontZ = -d * 0.38 - 0.85;
    raw = [
      { x: 0.9, z: gz + 0.5, y: 0, yaw: 0, pose: 'swing' },
      { x: w * 0.46, z: 0.35, y: 0, yaw: -Math.PI / 2, pose: 'timber' },
      { x: -w * 0.46, z: d * 0.40, y: 0, yaw: 0.3, pose: 'watch' },
      { x: -2.15, z: frontZ, y: 0, yaw: 0, pose: 'timber' },
      { x: -0.4, z: d * 0.44, y: 0, yaw: Math.PI, pose: 'swing' },
    ];
  } else {
    raw = [
      { x: 0.85, z: gz + 0.5, y: 0, yaw: 0, pose: 'watch' },
      { x: skip.x, z: skip.z, y: 0, yaw: -0.4, pose: 'timber' },
      { x: cabin.x, z: cabin.z, y: 0, yaw: 0.25, pose: 'watch' },
      { x: sc.xFace.x, z: sc.xFace.z, y: sc.xFace.y, yaw: sc.xFace.yaw, pose: 'fit' },
      { x: sc.zFace.x, z: sc.zFace.z, y: sc.zFace.y, yaw: sc.zFace.yaw, pose: 'fit' },
    ];
  }
  return separateSlots(ctx, raw, 1.55);
}

function poseCrew(crew, p, dt, { reducedMotion = false } = {}) {
  const freeze = reducedMotion || !Number.isFinite(dt);
  for (const fig of crew) {
    const { armL, armR, torso, hipL, hipR, root, pose, phase } = fig;
    const restL = armL.userData.rest;
    const restR = armR.userData.rest;
    const restT = torso.userData.rest;
    const restHL = hipL.userData.rest;
    const restHR = hipR.userData.rest;
    const restYaw = root.userData.restYaw;
    const walkAlpha = Math.min(1, Math.max(0, p / 0.22));
    const walkEase = walkAlpha * walkAlpha * (3 - 2 * walkAlpha);
    root.position.lerpVectors(
      root.userData.entryPosition,
      root.userData.workPosition,
      walkEase,
    );
    if (freeze) {
      armL.rotation.set(restL.x, restL.y, restL.z);
      armR.rotation.set(restR.x, restR.y, restR.z);
      torso.rotation.set(restT.x, restT.y, restT.z);
      hipL.rotation.set(restHL.x, restHL.y, restHL.z);
      hipR.rotation.set(restHR.x, restHR.y, restHR.z);
      root.rotation.y = restYaw;
      continue;
    }
    // Walk in, complete a bounded set of work beats, then return to the authored hold pose.
    const working = p >= 0.18 && p < 0.92;
    const workP = Math.min(1, Math.max(0, (p - 0.18) / 0.74));
    const edge = Math.min(1, workP / 0.08, (1 - workP) / 0.08);
    const s = working
      ? Math.sin((workP * 2.5 + phase) * Math.PI * 2) * Math.max(0, edge)
      : 0;
    let dLX = 0;
    let dRX = 0;
    let dLZ = 0;
    let dRZ = 0;
    let dTX = 0;
    let dTZ = 0;
    let dYaw = 0;
    let dHL = 0;
    let dHR = 0;
    if (pose === 'swing') {
      dRX = s * 0.85;
      dLX = s * 0.16;
      dTZ = s * 0.1;
      dHL = -s * 0.12;
      dHR = s * 0.16;
    } else if (pose === 'clear') {
      dRX = s * 0.38;
      dLX = s * 0.28;
      dTX = s * 0.08;
      dHL = s * 0.1;
      dHR = -s * 0.08;
    } else if (pose === 'pour') {
      dRZ = s * 0.18;
      dLX = s * 0.12;
      dTX = s * 0.1;
      dHL = s * 0.12;
    } else if (pose === 'watch') {
      dYaw = s * 0.12;
      dRX = s * 0.1;
    } else if (pose === 'timber') {
      dTX = s * 0.06;
      dHL = s * 0.08;
      dHR = -s * 0.08;
    } else if (pose === 'fit') {
      dRX = s * 0.22;
      dTX = s * 0.07;
      dHL = s * 0.06;
    }
    armL.rotation.set(restL.x + dLX, restL.y, restL.z + dLZ);
    armR.rotation.set(restR.x + dRX, restR.y, restR.z + dRZ);
    torso.rotation.set(restT.x + dTX, restT.y, restT.z + dTZ);
    hipL.rotation.set(restHL.x + dHL, restHL.y, restHL.z);
    hipR.rotation.set(restHR.x + dHR, restHR.y, restHR.z);
    root.rotation.y = restYaw + dYaw;
  }
}

/** Five separate walkers around the lot ring. Token scale, not a hydra clump. */
export function addSiteGang(ctx) {
  if (!ctx?.group) return 0;
  const n = 5;
  const layer = ctx.layer('crew');
  const C = mats(ctx);
  const hivis = [C.P.safety, C.P.orange, C.P.hazard, C.P.safety, C.P.orange];
  const hats = [C.P.yellow, C.P.white, C.P.orange, C.P.yellow, C.P.white];
  const skins = [C.skinA, C.skinB, C.skinA, C.skinB, C.skinA];
  const jeans = [C.jeanA, C.jeanB, C.jeanA, C.jeanB, C.jeanA];
  const roster = separateSlots(ctx, buildRoster(ctx).slice(0, n), 1.5);
  // Keep the gate queue legible at the start of the once-per-quarter walk-in. Alternating
  // two shallow rows preserves pavement separation without pretending scaffold fitters
  // materialise at height; their Y also walks from ground to the authored work position.
  const entrySpan = Math.min(ctx.w * 0.72, 6.4);
  const crew = [];
  for (let i = 0; i < roster.length; i += 1) {
    crew.push(addFigure(layer, C, i, {
      ...roster[i],
      entryX: -entrySpan / 2 + (entrySpan * i) / Math.max(1, roster.length - 1),
      entryY: 0,
      entryZ: gateZ(ctx) - 0.42 + (i % 2) * 2.3,
      hivis: hivis[i],
      hat: hats[i],
      skin: skins[i],
      jean: jeans[i],
      scale: SITE_CREW_SCALE_MAX * (0.96 + ctx.u(`crew-sc:${i}`) * 0.04),
      hatScale: 1.0 + ctx.u(`crew-hat:${i}`) * 0.1,
      girth: 0.88 + (i % 2) * 0.12 + ctx.u(`crew-g:${i}`) * 0.12,
      tapes: 1 + (i % 3),
      phase: ctx.u(`crew-ph:${i}`),
    }));
  }
  ctx.rig('crew', crew);
  ctx.group.userData.crewCount = crew.length;
  ctx.anim((p, dt, _elapsed, opts = {}) => {
    poseCrew(crew, p, dt, opts);
  });
  return crew.length;
}
