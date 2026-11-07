// Action glyphs + plant sway. Deterministic. No sim. No Math.random.
// Local materials — do not import mats() from veggie-voxels (circular).

import * as THREE from 'three';
import { box, cyl, ball, rosette, calyx, ribbedOrb } from './geom.js';

const DROP_COUNT = 14;
const GRAVITY = -3.6;
const SOIL_LOCAL = -0.13;

function paint(hex, { rough = 0.72, metal = 0.04, transparent = false, opacity = 1 } = {}) {
  return new THREE.MeshStandardMaterial({
    color: hex,
    roughness: rough,
    metalness: metal,
    transparent,
    opacity,
    depthWrite: !transparent,
  });
}

function M() {
  return {
    galv: paint('#9aa4aa', { rough: 0.42, metal: 0.62 }),
    paintBlue: paint('#5b7f96', { rough: 0.55 }),
    paintGreen: paint('#4f7a34', { rough: 0.62 }),
    tomato: paint('#b8412f', { rough: 0.58 }),
    pumpkin: paint('#c8762c', { rough: 0.66 }),
    tuber: paint('#c0a578', { rough: 0.88 }),
    timber: paint('#8a6a45', { rough: 0.88 }),
    timberPale: paint('#c4ab7a', { rough: 0.86 }),
    timberDark: paint('#7a5c40', { rough: 0.9 }),
    soil: paint('#7a6248', { rough: 0.96 }),
    soilRich: paint('#7a5a3c', { rough: 0.97 }),
    weed: paint('#a3bd63', { rough: 0.86 }),
    leafDeep: paint('#4a6638', { rough: 0.84 }),
    leafMid: paint('#5c8a44', { rough: 0.82 }),
    tag: paint('#e2dcc8', { rough: 0.9 }),
    glove: paint('#e8c49a', { rough: 0.78 }),
    gloveDark: paint('#c9a074', { rough: 0.82 }),
  };
}

let MATS = null;
function mats() {
  if (!MATS) MATS = M();
  return MATS;
}

function launch(node, extra = {}) {
  Object.assign(node.userData, {
    ox: node.position.x,
    oy: node.position.y,
    oz: node.position.z,
    sx: node.scale.x,
    sy: node.scale.y,
    sz: node.scale.z,
    rx: node.rotation.x,
    ry: node.rotation.y,
    rz: node.rotation.z,
    opacity0: node.material?.transparent ? node.material.opacity : undefined,
    vx: 0,
    vy: 0,
    vz: 0,
    role: 'bit',
  }, extra);
  return node;
}

function wetMat(hex, opacity) {
  return paint(hex, { rough: 0.5, metal: 0.06, transparent: true, opacity });
}

function sheenMat(hex, opacity) {
  return new THREE.MeshBasicMaterial({
    color: hex, transparent: true, opacity, depthWrite: false,
  });
}

function buildWater(group, m) {
  const can = new THREE.Group();
  can.name = 'fx-can';
  cyl(can, m.galv, 0.078, 0.098, 0.20, -0.16, 0.40, 0, 12);
  cyl(can, m.galv, 0.084, 0.084, 0.028, -0.16, 0.51, 0, 12);
  cyl(can, m.galv, 0.082, 0.082, 0.018, -0.16, 0.34, 0, 12);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.086, 0.013, 6, 12, Math.PI), m.galv);
  handle.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  handle.position.set(-0.255, 0.40, 0);
  handle.castShadow = true;
  can.add(handle);
  const spout = cyl(can, m.galv, 0.016, 0.016, 0.22, -0.02, 0.46, 0, 8);
  spout.rotation.z = 1.12;
  cyl(can, m.galv, 0.038, 0.030, 0.036, 0.08, 0.375, 0, 10);
  cyl(can, m.paintBlue, 0.022, 0.022, 0.012, 0.10, 0.358, 0, 8);
  can.rotation.z = -0.16;
  launch(can, { role: 'prop', pour: true });
  group.add(can);

  const wet = cyl(group, wetMat('#6b5644', 0.58), 0.34, 0.34, 0.014, 0.10, SOIL_LOCAL, 0, 16);
  wet.name = 'fx-wet';
  wet.castShadow = false;
  launch(wet, { role: 'wet' });
  const sheen = cyl(group, sheenMat('#5b7f96', 0.32), 0.26, 0.26, 0.008, 0.10, SOIL_LOCAL + 0.012, 0, 14);
  sheen.name = 'fx-sheen';
  sheen.castShadow = false;
  launch(sheen, { role: 'wet' });

  for (let i = 0; i < DROP_COUNT; i += 1) {
    const u = i / (DROP_COUNT - 1);
    const ox = 0.10 + u * 0.24;
    const oy = 0.34 - u * 0.40 + Math.sin(u * Math.PI) * 0.13;
    const oz = ((i * 37) % 11 - 5) * 0.018;
    const r = 0.016 + ((i * 13) % 7) * 0.0024;
    const drop = ball(group, m.paintBlue, r, ox, oy, oz, 8);
    drop.name = 'fx-drop';
    launch(drop, {
      role: 'drop',
      vx: 0.18 + (i % 5) * 0.035,
      vy: 0.06 - u * 0.28,
      vz: ((i % 5) - 2) * 0.045,
      floor: SOIL_LOCAL,
    });
  }
}

function buildSow(group, m) {
  const hand = new THREE.Group();
  hand.name = 'fx-glove';
  hand.position.set(-0.08, 0.38, 0.06);
  buildGlove(hand, m, 0, 0, 0);
  launch(hand, { role: 'prop', pour: true });
  group.add(hand);

  const pack = new THREE.Group();
  pack.name = 'fx-packet';
  box(pack, m.paintGreen, 0.18, 0.24, 0.04, 0, 0.36, 0, [0.12, 0.35, 0.18]);
  box(pack, m.tag, 0.13, 0.08, 0.012, 0.005, 0.33, 0.026, [0.12, 0.35, 0.18]);
  box(pack, m.paintGreen, 0.18, 0.045, 0.05, 0, 0.49, 0.01, [0.55, 0.35, 0.12]);
  ball(pack, m.tuber, 0.018, 0.02, 0.30, 0.034, 6);
  launch(pack, { role: 'prop' });
  group.add(pack);

  for (let i = 0; i < 5; i += 1) {
    const ox = (i - 2) * 0.055;
    const oy = 0.20 - (i % 3) * 0.045;
    const oz = ((i % 2) * 2 - 1) * 0.04;
    const seed = ball(group, m.tuber, 0.022, ox, oy, oz, 6);
    seed.name = 'fx-seed';
    seed.scale.set(1, 0.72, 1.18);
    launch(seed, {
      role: 'seed',
      vx: (i - 2) * 0.09,
      vy: -0.10 - i * 0.035,
      vz: ((i % 2) * 2 - 1) * 0.055,
      spin: 0.45 + i * 0.12,
      floor: SOIL_LOCAL,
    });
  }
}

function buildWeed(group, m) {
  const yanked = new THREE.Group();
  yanked.name = 'fx-weed';
  yanked.position.set(0, 0.28, 0);
  yanked.rotation.set(0.35, 0.28, 0.85);
  rosette(yanked, m.weed, {
    x: 0, y: 0, z: 0, count: 6, len: 0.18, wid: 0.055, tilt: 1.16, phase: 0.4,
  });
  cyl(yanked, m.tuber, 0.010, 0.020, 0.11, 0, -0.07, 0, 6);
  launch(yanked, { role: 'prop', vy: 0.24, spin: 0.85 });
  group.add(yanked);

  for (let i = 0; i < 6; i += 1) {
    const ang = (i / 6) * Math.PI * 2;
    const crumb = box(
      group, m.soil,
      0.038 + ((i * 13) % 5) * 0.004,
      0.026,
      0.032,
      Math.cos(ang) * 0.10, 0.07, Math.sin(ang) * 0.10,
      [0.25 * i, ang, 0.18],
    );
    crumb.name = 'fx-crumb';
    launch(crumb, {
      role: 'crumb',
      vx: Math.cos(ang) * 0.24,
      vy: 0.20 + (i % 3) * 0.05,
      vz: Math.sin(ang) * 0.24,
      spin: 1.1 + i * 0.15,
      floor: SOIL_LOCAL,
    });
  }
}

function buildCompost(group, m) {
  const heap = new THREE.Group();
  heap.name = 'fx-heap';
  ball(heap, m.soilRich, 0.12, 0, 0.10, 0, 10).scale.set(1.18, 0.68, 1.06);
  ball(heap, m.soilRich, 0.075, 0.055, 0.16, 0.02, 8);
  box(heap, m.leafMid, 0.10, 0.028, 0.06, -0.04, 0.18, 0.03, [0.4, 0.6, 0.1]);
  box(heap, m.timberDark, 0.07, 0.04, 0.05, 0.05, 0.20, -0.02, [0.2, 1.0, 0.15]);
  launch(heap, { role: 'puff' });
  group.add(heap);

  for (let i = 0; i < 3; i += 1) {
    const ang = (i / 3) * Math.PI * 2 + 0.4;
    const crumb = box(
      group, m.timberDark, 0.05, 0.04, 0.04,
      Math.cos(ang) * 0.12, 0.16, Math.sin(ang) * 0.10,
      [0.2, ang, 0.3],
    );
    crumb.name = 'fx-crumb';
    launch(crumb, {
      role: 'crumb',
      vx: Math.cos(ang) * 0.20,
      vy: 0.30,
      vz: Math.sin(ang) * 0.20,
      spin: 0.9 + i * 0.2,
      floor: SOIL_LOCAL,
    });
  }
}

function buildHarvest(group, m) {
  const hand = new THREE.Group();
  hand.name = 'fx-glove';
  hand.position.set(0.06, 0.42, 0.10);
  buildGlove(hand, m, 0, 0, 0);
  launch(hand, { role: 'prop', vy: 0.12 });
  group.add(hand);

  const crate = new THREE.Group();
  crate.name = 'fx-crate';
  box(crate, m.timberPale, 0.32, 0.05, 0.24, 0, 0.10, 0);
  box(crate, m.timber, 0.32, 0.16, 0.04, 0, 0.18, -0.10);
  box(crate, m.timber, 0.32, 0.16, 0.04, 0, 0.18, 0.10);
  box(crate, m.timber, 0.04, 0.16, 0.24, -0.14, 0.18, 0);
  box(crate, m.timber, 0.04, 0.16, 0.24, 0.14, 0.18, 0);
  launch(crate, { role: 'prop' });
  group.add(crate);

  const tomato = new THREE.Group();
  tomato.name = 'fx-tomato';
  tomato.position.set(-0.06, 0.38, 0.04);
  ball(tomato, m.tomato, 0.055, 0, 0, 0, 10);
  calyx(tomato, m.leafDeep, { x: 0, y: 0.042, z: 0, s: 0.034 });
  launch(tomato, {
    role: 'produce',
    vx: -0.18,
    vy: 0.55,
    vz: 0.08,
    spin: 1.2,
    floor: -0.04,
  });
  group.add(tomato);

  const pumpkin = new THREE.Group();
  pumpkin.name = 'fx-pumpkin';
  pumpkin.position.set(0.10, 0.42, -0.04);
  ribbedOrb(pumpkin, m.pumpkin, { x: 0, y: 0, z: 0, r: 0.08, squash: 0.78, ribs: 8, segs: 10 });
  box(pumpkin, m.leafDeep, 0.018, 0.05, 0.018, 0, 0.072, 0);
  launch(pumpkin, {
    role: 'produce',
    vx: 0.22,
    vy: 0.48,
    vz: -0.10,
    spin: -0.9,
    floor: -0.03,
  });
  group.add(pumpkin);
}

function buildGlove(group, m, x, y, z) {
  box(group, m.glove, 0.13, 0.055, 0.16, x, y, z);
  box(group, m.gloveDark, 0.12, 0.03, 0.06, x, y + 0.03, z - 0.02);
  for (let i = 0; i < 4; i += 1) {
    box(group, m.glove, 0.026, 0.026, 0.085, x - 0.048 + i * 0.032, y + 0.008, z + 0.105);
  }
  box(group, m.glove, 0.032, 0.03, 0.07, x - 0.082, y + 0.018, z + 0.02, [0, 0.55, 0.45]);
}

function buildHeldSow(group, m) {
  buildGlove(group, m, 0, 0, 0);
  box(group, m.paintGreen, 0.07, 0.09, 0.025, 0.02, 0.06, 0.04, [0.2, 0.3, 0.1]);
  for (let i = 0; i < 4; i += 1) {
    ball(group, m.tuber, 0.012, -0.03 + (i % 2) * 0.04, 0.04, 0.05 + Math.floor(i / 2) * 0.03, 6);
  }
}

function buildHeldHarvest(group, m) {
  buildGlove(group, m, 0, 0, 0);
}

function buildHeldWater(group, m) {
  cyl(group, m.galv, 0.055, 0.065, 0.14, -0.04, 0.04, 0, 10);
  cyl(group, m.galv, 0.014, 0.014, 0.16, 0.06, 0.07, 0, 6).rotation.z = 1.05;
  cyl(group, m.paintBlue, 0.028, 0.024, 0.024, 0.13, 0.02, 0, 8);
}

function buildHeldWeed(group, m) {
  box(group, m.timberPale, 0.028, 0.42, 0.028, -0.04, 0.08, 0, [0, 0, 0.45]);
  box(group, m.galv, 0.14, 0.022, 0.09, 0.08, -0.06, 0, [0.1, 0, 0.15]);
}

function buildHeldCompost(group, m) {
  box(group, m.timber, 0.11, 0.03, 0.16, 0, 0.02, 0);
  box(group, m.soilRich, 0.08, 0.035, 0.10, 0, 0.05, -0.01);
  box(group, m.timberPale, 0.025, 0.18, 0.025, 0, 0.10, 0.08, [0.7, 0, 0]);
}

/** Cursor stand-in. Follows the pointer; `useUntil` on userData drives the use swing. */
export function buildHeldTool(tool) {
  const m = mats();
  const group = new THREE.Group();
  group.name = 'held-tool';
  group.userData.tool = tool;
  group.userData.useUntil = 0;
  if (tool === 'sow') buildHeldSow(group, m);
  else if (tool === 'harvest') buildHeldHarvest(group, m);
  else if (tool === 'water') buildHeldWater(group, m);
  else if (tool === 'weed') buildHeldWeed(group, m);
  else if (tool === 'compost') buildHeldCompost(group, m);
  group.scale.setScalar(0.95);
  return group;
}

export function tickHeldTool(held, nowMs) {
  if (!held) return;
  const tool = held.userData.tool;
  const until = held.userData.useUntil ?? 0;
  const t = until > nowMs ? 1 - (until - nowMs) / 380 : 0;
  const swing = Math.sin(Math.max(0, t) * Math.PI);
  if (tool === 'water') held.rotation.set(-0.35, 0.2, -0.25 - swing * 0.7);
  else if (tool === 'weed') held.rotation.set(-0.45 - swing * 0.85, 0.15, 0.2);
  else if (tool === 'compost') held.rotation.set(-0.25, 0.25, 0.15 + swing * 0.8);
  else if (tool === 'sow') held.rotation.set(-0.3 + swing * 0.45, 0.35, 0.1);
  else if (tool === 'harvest') held.rotation.set(-0.4 + swing * 0.55, 0.2, 0.05);
  else held.rotation.set(-0.3, 0.2, 0);
}

/** Short-lived Three.js glyph for the tool just used. Garden-local metres. */
export function buildActionFx(tool, x, y, z) {
  const m = mats();
  const group = new THREE.Group();
  group.name = 'veggie-fx';
  group.position.set(x, y, z);
  group.userData.tool = tool;
  if (tool === 'water') buildWater(group, m);
  else if (tool === 'sow') buildSow(group, m);
  else if (tool === 'weed') buildWeed(group, m);
  else if (tool === 'compost') buildCompost(group, m);
  else if (tool === 'harvest') buildHarvest(group, m);
  return group;
}

const BALLISTIC = new Set(['drop', 'seed', 'crumb', 'produce']);

function tickChild(child, elapsed, index) {
  const u = child.userData;
  if (u.ox == null) {
    u.ox = child.position.x;
    u.oy = child.position.y;
    u.oz = child.position.z;
  }
  const role = u.role;
  if (role === 'wet') {
    const k = Math.min(1, elapsed / 0.32);
    const s = (u.sx ?? 1) * (1 + 0.38 * k);
    child.scale.set(s, u.sy ?? 1, s);
    if (child.material?.transparent) {
      const base = u.opacity0 ?? child.material.opacity ?? 0.5;
      child.material.opacity = base * Math.max(0.16, 1 - elapsed / 1.05);
    }
    return;
  }
  if (role === 'puff') {
    const k = Math.min(1, elapsed / 0.24);
    child.scale.set(
      (u.sx ?? 1) * (1 + 0.42 * k),
      (u.sy ?? 1) * (1 + 0.28 * k),
      (u.sz ?? 1) * (1 + 0.42 * k),
    );
    child.position.y = u.oy + elapsed * 0.10;
    return;
  }
  const hasV = u.vx != null || u.vy != null || u.vz != null;
  if (hasV && role) {
    const vx = u.vx ?? 0;
    const vy = u.vy ?? 0;
    const vz = u.vz ?? 0;
    const g = BALLISTIC.has(role) ? GRAVITY : 0;
    let y = u.oy + vy * elapsed + 0.5 * g * elapsed * elapsed;
    const floor = u.floor ?? SOIL_LOCAL;
    let landed = false;
    if (BALLISTIC.has(role) && y < floor) {
      y = floor;
      landed = true;
    }
    child.position.set(
      u.ox + vx * elapsed,
      role === 'prop' ? y + Math.sin(elapsed * 5) * 0.012 : y,
      u.oz + vz * elapsed,
    );
    const spin = u.spin ?? 0;
    if (role === 'prop') {
      const pour = u.pour ? -Math.min(0.22, elapsed * 0.35) : 0;
      child.rotation.z = (u.rz ?? 0) + spin * elapsed + pour + Math.sin(elapsed * 3) * 0.06;
    } else if (spin) {
      child.rotation.set(
        (u.rx ?? 0) + spin * elapsed * 6,
        (u.ry ?? 0) + spin * elapsed * 4,
        (u.rz ?? 0) + spin * elapsed * 3,
      );
    }
    if (landed && role === 'drop') {
      child.scale.set((u.sx ?? 1) * 1.45, (u.sy ?? 1) * 0.32, (u.sz ?? 1) * 1.45);
    } else if (u.sx != null) {
      child.scale.set(u.sx, u.sy, u.sz);
    }
    return;
  }
  const phase = index * 0.73;
  child.position.set(
    u.ox + (Math.sin(elapsed * 5 + phase) - Math.sin(phase)) * 0.018,
    u.oy + elapsed * 0.10 + (Math.sin(elapsed * 7 + phase) - Math.sin(phase)) * 0.012,
    u.oz + (Math.cos(elapsed * 4 + phase) - Math.cos(phase)) * 0.012,
  );
}

/** Pose FX from (born, now). Sets born on first call. No Math.random. */
export function tickVeggieFx(group, nowMs) {
  if (!group) return;
  if (group.userData.born == null) group.userData.born = nowMs;
  const elapsed = Math.max(0, (nowMs - group.userData.born) / 1000);
  const kids = group.children;
  for (let i = 0; i < kids.length; i += 1) tickChild(kids[i], elapsed, i);
}

/** Tiny Z sway. Null-safe. ±0.03 rad, sin(now/800 + i). */
export function applyPlantSway(plantsGroup, nowMs) {
  if (!plantsGroup) return;
  const namedRoot = plantsGroup.name === 'veggie-plants'
    ? plantsGroup
    : plantsGroup.getObjectByName?.('veggie-plants');
  const root = namedRoot ?? plantsGroup;
  const kids = root.children;
  const named = [];
  const groups = [];
  for (let i = 0; i < kids.length; i += 1) {
    const child = kids[i];
    if (child.name && /plant|crop|plot/i.test(child.name)) named.push(child);
    if (child.isGroup) groups.push(child);
  }
  const targets = named.length ? named : (groups.length ? groups : kids);
  for (let i = 0; i < targets.length; i += 1) {
    const child = targets[i];
    if (child.userData.swayZ0 == null) child.userData.swayZ0 = child.rotation.z;
    child.rotation.z = child.userData.swayZ0 + Math.sin(nowMs / 800 + i) * 0.03;
  }
}
