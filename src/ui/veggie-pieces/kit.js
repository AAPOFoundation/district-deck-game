// Veggie patch kit — tank, shed, bench, compost, bought tools.
// Geometry only. Deterministic. No Math.random. Materials come from veggie-voxels `M()`.

import * as THREE from 'three';
import { box, cyl, ball, rosette, calyx, ribbedOrb } from './geom.js';

/** Brighter than `m.paintBlue` so the open tank deck reads as water, not galv. */
const WATER = new THREE.MeshStandardMaterial({
  color: '#93c2d8',
  roughness: 0.22,
  metalness: 0.08,
});

function torus(group, material, r, tube, x, y, z, rot = null, arc = Math.PI * 2) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 12, arc), material);
  mesh.position.set(x, y, z);
  if (rot) mesh.rotation.set(rot[0] ?? 0, rot[1] ?? 0, rot[2] ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** Yellow ring + soft disc around a grab target. Visual only — never steals the ray. */
function selectChrome(piece, x, y, z, radius, hitH = 0.42) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.70, radius, 40),
    new THREE.MeshBasicMaterial({
      color: '#e8c069',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.name = 'hover-ring';
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, y, z);
  ring.raycast = () => {};
  piece.add(ring);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.68, 28),
    new THREE.MeshBasicMaterial({
      color: '#f0dfa8',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  glow.name = 'hover-glow';
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(x, y - 0.012, z);
  glow.raycast = () => {};
  piece.add(glow);
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 1.72, hitH, radius * 1.72),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.name = 'hover-hit';
  hit.position.set(x, y + hitH * 0.45, z);
  piece.add(hit);
}

/**
 * Skillion in corrugated steel, in the roof's own tilted frame so seams stay on the plane.
 * Copied from veggie-voxels `buildShedRoof`, plus bargeboards on the raking edges.
 */
function buildShedRoof(group, m, x, y, z, w, d, pitch) {
  const roof = new THREE.Group();
  roof.position.set(x, y, z);
  roof.rotation.z = pitch;
  box(roof, m.galv, w, 0.055, d, 0, 0, 0);
  const seams = 6;
  for (let i = 0; i < seams; i += 1) {
    const ox = (-(seams - 1) / 2 + i) * (w / seams);
    box(roof, m.galv, 0.05, 0.085, d + 0.02, ox, 0.062, 0);
  }
  box(roof, m.galv, 0.12, 0.10, d + 0.04, -w / 2 + 0.06, 0.06, 0);
  box(roof, m.timberDark, 0.07, 0.16, d + 0.04, w / 2 - 0.02, -0.06, 0);
  box(roof, m.timberPale, w + 0.08, 0.09, 0.045, 0, 0.04, d / 2 + 0.02);
  box(roof, m.timberPale, w + 0.08, 0.09, 0.045, 0, 0.04, -d / 2 - 0.02);
  const gutter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, d + 0.02, 8, 1, false, 0, Math.PI),
    m.galv,
  );
  gutter.rotation.set(Math.PI / 2, 0, Math.PI);
  gutter.position.set(w / 2 + 0.06, -0.06, 0);
  gutter.castShadow = true;
  gutter.receiveShadow = true;
  roof.add(gutter);
  for (const bz of [-d / 2 + 0.22, d / 2 - 0.22]) {
    box(roof, m.galv, 0.20, 0.035, 0.035, w / 2 + 0.02, -0.10, bz);
  }
  group.add(roof);
  const dropX = x + (w / 2) * Math.cos(pitch) + 0.06;
  const dropZ = z + d / 2 - 0.24;
  cyl(group, m.galv, 0.045, 0.045, y - 0.10, dropX, (y - 0.10) / 2, dropZ, 8);
  box(group, m.galv, 0.10, 0.05, 0.10, dropX, 0.02, dropZ);
  return { dropX, dropZ };
}

export function buildTank(group, m, x, z) {
  box(group, m.stone, 1.56, 0.10, 1.56, x, 0.05, z);
  box(group, m.stone, 1.42, 0.04, 1.42, x, 0.11, z);
  cyl(group, m.galv, 0.62, 0.62, 1.36, x, 0.80, z, 16);
  for (const y of [0.34, 0.86, 1.38]) {
    cyl(group, m.galv, 0.70, 0.70, 0.07, x, y, z, 16);
  }
  cyl(group, m.galv, 0.66, 0.62, 0.07, x, 1.56, z, 16);
  cyl(group, WATER, 0.56, 0.56, 0.022, x, 1.495, z, 16);
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    cyl(group, m.galv, 0.014, 0.014, 0.16, x + Math.cos(a) * 0.38, 1.62, z + Math.sin(a) * 0.38, 6);
  }
  cyl(group, m.galv, 0.26, 0.50, 0.16, x, 1.74, z, 16);
  box(group, m.galv, 0.18, 0.04, 0.04, x, 1.84, z);
  cyl(group, m.galv, 0.055, 0.055, 1.70, x + 0.60, 0.85, z + 0.30, 8);
  box(group, m.galv, 0.16, 0.05, 0.05, x + 0.52, 1.48, z + 0.30);
  box(group, m.paintGreen, 0.10, 0.09, 0.09, x + 0.52, 0.36, z + 0.56);
  cyl(group, m.galv, 0.016, 0.016, 0.11, x + 0.52, 0.33, z + 0.64, 8).rotation.x = Math.PI / 2;
  box(group, m.galv, 0.07, 0.016, 0.016, x + 0.46, 0.42, z + 0.56);
  ball(group, m.paintBlue, 0.016, x + 0.52, 0.22, z + 0.70, 8);
  cyl(group, m.soilWet, 0.12, 0.10, 0.014, x + 0.52, 0.128, z + 0.66, 10);
  cyl(group, m.paintBlue, 0.16, 0.13, 0.24, x + 0.52, 0.12, z + 0.80, 10);
  cyl(group, m.galv, 0.165, 0.165, 0.03, x + 0.52, 0.24, z + 0.80, 10);
  cyl(group, m.paintBlue, 0.12, 0.12, 0.02, x + 0.52, 0.18, z + 0.80, 10);
  torus(group, m.galv, 0.13, 0.012, x + 0.52, 0.24, z + 0.80, null, Math.PI);
}

export function buildShed(group, m, x, z) {
  const shed = new THREE.Group();
  shed.name = 'veggie-shed';
  shed.userData.shed = true;
  group.add(shed);
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(1.16, 1.48, 48),
    new THREE.MeshBasicMaterial({
      color: '#e8c069',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  halo.name = 'shed-halo';
  halo.rotation.x = -Math.PI / 2;
  halo.position.set(x, 0.06, z);
  halo.raycast = () => {};
  shed.add(halo);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.18, 28),
    new THREE.MeshBasicMaterial({
      color: '#f0dfa8',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  glow.name = 'shed-glow';
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(x, 0.04, z);
  glow.raycast = () => {};
  shed.add(glow);
  const mass = box(shed, m.render, 1.90, 1.70, 1.30, x, 0.85, z);
  mass.name = 'shed-mass';
  const slatH = 0.17;
  const slatPitch = 0.155;
  for (let i = 0; i < 10; i += 1) {
    const y = 0.16 + i * slatPitch;
    box(shed, m.timberPale, 1.92, slatH, 0.045, x, y, z + 0.672);
    box(shed, m.timberPale, 1.92, slatH, 0.045, x, y, z - 0.672);
    box(shed, m.timberPale, 0.045, slatH, 1.32, x + 0.972, y, z);
    box(shed, m.timberPale, 0.045, slatH, 1.32, x - 0.972, y, z);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(shed, m.timber, 0.10, 1.70, 0.10, x + sx * 0.95, 0.85, z + sz * 0.655);
    }
  }
  const { dropX, dropZ } = buildShedRoof(shed, m, x, 1.76, z, 2.10, 1.50, 0.10);
  box(shed, m.timber, 0.66, 1.36, 0.07, x - 0.30, 0.70, z + 0.685);
  box(shed, m.timberDark, 0.54, 0.07, 0.06, x - 0.30, 1.24, z + 0.735);
  box(shed, m.timberDark, 0.54, 0.07, 0.06, x - 0.30, 0.20, z + 0.735);
  box(shed, m.timberDark, 1.18, 0.07, 0.06, x - 0.30, 0.72, z + 0.735, [0, 0, -Math.atan2(1.04, 0.52)]);
  box(shed, m.galv, 0.08, 0.08, 0.08, x - 0.04, 0.76, z + 0.73);
  box(shed, m.timberDark, 0.72, 0.05, 0.12, x - 0.30, 0.05, z + 0.72);
  box(shed, m.timberPale, 0.52, 0.46, 0.06, x + 0.42, 1.12, z + 0.68);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.40, 0.34), m.timberDark);
  pane.position.set(x + 0.42, 1.14, z + 0.655);
  pane.castShadow = true;
  pane.receiveShadow = true;
  shed.add(pane);
  box(shed, m.timber, 0.44, 0.04, 0.03, x + 0.42, 1.14, z + 0.712);
  box(shed, m.timber, 0.04, 0.36, 0.03, x + 0.42, 1.14, z + 0.712);
  box(shed, m.timberPale, 0.58, 0.07, 0.16, x + 0.42, 0.86, z + 0.74);
  box(shed, m.stone, 2.10, 0.12, 1.50, x, 0.06, z);
  for (let i = 0; i < 3; i += 1) {
    const px = x + 0.72;
    const pz = z - 0.28 + i * 0.30;
    cyl(shed, m.terracotta, 0.13, 0.10, 0.20, px, 0.22, pz, 10);
    cyl(shed, m.soilRich, 0.09, 0.09, 0.03, px, 0.31, pz, 8);
    rosette(shed, i === 1 ? m.leafLight : m.leafMid, {
      x: px, y: 0.33, z: pz, count: 5, len: 0.16 + i * 0.02, wid: 0.055, tilt: 0.88, phase: i,
    });
  }
  cyl(shed, m.paintGreen, 0.24, 0.24, 0.58, dropX + 0.22, 0.40, dropZ, 12);
  cyl(shed, m.galv, 0.255, 0.255, 0.04, dropX + 0.22, 0.22, dropZ, 12);
  cyl(shed, m.galv, 0.255, 0.255, 0.04, dropX + 0.22, 0.52, dropZ, 12);
  cyl(shed, m.paintGreen, 0.16, 0.24, 0.07, dropX + 0.22, 0.72, dropZ, 12);
  box(shed, m.galv, 0.26, 0.05, 0.05, dropX + 0.10, 0.66, dropZ);
}

export function fillCompostMound(heap, m, amount, x, z) {
  while (heap.children.length) heap.remove(heap.children[0]);
  const n = Math.max(0, Math.min(10, Math.round(Number(amount) || 0)));
  heap.userData.amount = n;
  box(heap, m.soilWet, 0.74, 0.03, 0.54, x, 0.08, z);
  if (n === 0) return;
  const h = 0.11 + n * 0.068;
  const r = 0.20 + n * 0.026;
  ball(heap, m.soilRich, r, x, 0.12 + h * 0.42, z, 12).scale.set(1.46, 0.52 + n * 0.055, 1.24);
  if (n >= 4) {
    ball(heap, m.soilWet, r * 0.52, x + 0.14, 0.16 + h * 0.48, z - 0.07, 10).scale.set(1.18, 0.68, 1.08);
  }
  if (n >= 8) {
    ball(heap, m.soilRich, r * 0.42, x - 0.12, 0.20 + h * 0.42, z + 0.08, 9).scale.set(1.1, 0.72, 1.05);
  }
  for (let i = 0; i < n; i += 1) {
    const ang = (i / n) * Math.PI * 2 + 0.28;
    const rad = 0.10 + (i % 3) * 0.09;
    const crumb = i % 3 === 0 ? m.leafDry : (i % 3 === 1 ? m.weed : m.soilRich);
    box(
      heap, crumb,
      0.13 - (i % 3) * 0.015, 0.055, 0.10,
      x + Math.cos(ang) * rad,
      0.14 + h * (0.22 + (i % 4) * 0.12),
      z + Math.sin(ang) * rad,
      [0.18, ang, 0.12 * ((i % 3) - 1)],
    );
  }
}

function poseCompostScoop(scoop, amount, x, z) {
  const n = Math.max(0, Math.min(10, Math.round(Number(amount) || 0)));
  const y = n === 0 ? 0.42 : 0.22 + n * 0.068;
  scoop.position.set(x + 0.22, y, z + 0.16);
  scoop.rotation.set(0.15, 0.35, n === 0 ? 0.55 : 0.25);
}

export function setCompostVisual(root, amount) {
  const crate = root?.getObjectByName?.('veggie-compost');
  if (!crate) return;
  const heap = crate.getObjectByName('compost-mound');
  const { x, z, mats: m } = crate.userData;
  if (heap && m) fillCompostMound(heap, m, amount, x, z);
  const scoop = crate.getObjectByName('hand-compost');
  if (scoop) poseCompostScoop(scoop, amount, x, z);
}

export function buildCompostCrate(group, m, x, z, amount = 2) {
  const crate = new THREE.Group();
  crate.name = 'veggie-compost';
  crate.userData.tool = 'compost';
  crate.userData.x = x;
  crate.userData.z = z;
  crate.userData.mats = m;
  group.add(crate);

  const w = 1.10;
  const d = 0.86;
  const postH = 0.82;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(crate, m.timberDark, 0.08, postH, 0.08,
        x + sx * (w / 2 - 0.02), postH / 2, z + sz * (d / 2 - 0.02));
    }
  }
  const slatH = 0.11;
  const gap = 0.055;
  for (let i = 0; i < 4; i += 1) {
    const y = 0.10 + i * (slatH + gap);
    box(crate, m.timberDark, w - 0.14, slatH, 0.045, x, y, z - d / 2);
    box(crate, m.timberDark, w - 0.14, slatH, 0.045, x, y, z + d / 2);
    box(crate, m.timberDark, 0.045, slatH, d - 0.14, x - w / 2, y, z);
    box(crate, m.timberDark, 0.045, slatH, d - 0.14, x + w / 2, y, z);
  }
  box(crate, m.timber, w - 0.16, 0.04, d - 0.16, x, 0.06, z);

  const heap = new THREE.Group();
  heap.name = 'compost-mound';
  crate.add(heap);
  fillCompostMound(heap, m, amount, x, z);

  const scoop = new THREE.Group();
  scoop.name = 'hand-compost';
  scoop.userData.tool = 'compost';
  box(scoop, m.timber, 0.18, 0.045, 0.26, 0, 0, 0);
  box(scoop, m.soilRich, 0.12, 0.05, 0.16, 0, 0.04, -0.02);
  box(scoop, m.timberPale, 0.04, 0.30, 0.04, 0, 0.12, 0.14, [0.72, 0, 0]);
  crate.add(scoop);
  poseCompostScoop(scoop, amount, x, z);
  selectChrome(crate, x, 0.09, z, 0.72, 0.88);
}

export const TABLE = Object.freeze({ w: 3.35, d: 1.05, y: 0.80 });

export function buildPottingBench(group, m, x, z) {
  const { w, d, y } = TABLE;
  box(group, m.timberPale, w, 0.08, d, x, y, z);
  box(group, m.timber, w + 0.06, 0.05, 0.06, x, y - 0.06, z - d / 2 + 0.03);
  box(group, m.timber, w + 0.06, 0.05, 0.06, x, y - 0.06, z + d / 2 - 0.03);
  box(group, m.timber, w - 0.18, 0.05, d - 0.18, x, 0.38, z);
  for (const px of [-1, 0, 1]) {
    for (const pz of [-1, 1]) {
      box(group, m.timber, 0.09, y, 0.09, x + px * (w / 2 - 0.10), y / 2, z + pz * (d / 2 - 0.10));
    }
  }
  box(group, m.timber, w - 0.22, 0.04, 0.04, x, 0.16, z);
}

function grab(parent, tool) {
  const piece = new THREE.Group();
  piece.name = `hand-${tool}`;
  piece.userData.tool = tool;
  parent.add(piece);
  return piece;
}

/** Always-on tools on the potting table. Click to grab. One slot each, nothing stacked. */
export function buildTableTools(group, m, x, z) {
  const tools = new THREE.Group();
  tools.name = 'table-tools';
  group.add(tools);
  const y = TABLE.y + 0.10;
  const slot = [-1.20, -0.40, 0.40, 1.20];

  const sow = grab(tools, 'sow');
  box(sow, m.paintGreen, 0.46, 0.07, 0.32, x + slot[0], y, z);
  box(sow, m.soilRich, 0.40, 0.04, 0.26, x + slot[0], y + 0.05, z);
  for (let i = 0; i < 4; i += 1) {
    rosette(sow, m.leafLight, {
      x: x + slot[0] - 0.10 + (i % 2) * 0.20,
      y: y + 0.08,
      z: z - 0.06 + Math.floor(i / 2) * 0.12,
      count: 4, len: 0.055, wid: 0.022, tilt: 0.7, phase: i, thick: 0.008,
    });
  }
  selectChrome(sow, x + slot[0], y - 0.03, z, 0.34, 0.28);

  const water = grab(tools, 'water');
  const s = 1.35;
  const cx = x + slot[1];
  cyl(water, m.galv, 0.12 * s, 0.14 * s, 0.26 * s, cx, y + 0.10, z, 10);
  cyl(water, m.galv, 0.05 * s, 0.05 * s, 0.04 * s, cx, y + 0.26 * s, z, 8);
  cyl(water, m.paintBlue, 0.024 * s, 0.024 * s, 0.36 * s, cx + 0.18 * s, y + 0.12, z, 6).rotation.z = 1.1;
  cyl(water, m.galv, 0.06 * s, 0.06 * s, 0.04 * s, cx + 0.34 * s, y + 0.20, z, 10).rotation.z = 1.1;
  torus(water, m.galv, 0.085 * s, 0.016 * s, cx - 0.13 * s, y + 0.12, z);
  selectChrome(water, cx, y - 0.03, z, 0.32, 0.42);

  const weed = grab(tools, 'weed');
  box(weed, m.timberPale, 0.05, 0.78, 0.05, x + slot[2], y + 0.28, z, [0, 0, 0.42]);
  box(weed, m.galv, 0.26, 0.035, 0.16, x + slot[2] + 0.22, y + 0.02, z, [0.08, 0, 0.16]);
  selectChrome(weed, x + slot[2] + 0.10, y - 0.03, z, 0.36, 0.72);

  const harvest = grab(tools, 'harvest');
  box(harvest, m.timberPale, 0.42, 0.06, 0.30, x + slot[3], y, z);
  box(harvest, m.timber, 0.42, 0.14, 0.05, x + slot[3], y + 0.08, z - 0.13);
  box(harvest, m.timber, 0.42, 0.14, 0.05, x + slot[3], y + 0.08, z + 0.13);
  box(harvest, m.timber, 0.05, 0.14, 0.28, x + slot[3] - 0.18, y + 0.08, z);
  box(harvest, m.timber, 0.05, 0.14, 0.28, x + slot[3] + 0.18, y + 0.08, z);
  ball(harvest, m.tomato, 0.055, x + slot[3] - 0.08, y + 0.10, z, 8);
  ball(harvest, m.pumpkin, 0.065, x + slot[3] + 0.08, y + 0.10, z + 0.02, 8);
  selectChrome(harvest, x + slot[3], y - 0.03, z, 0.34, 0.32);
}

export function buildSprinkler(group, m, x, z) {
  cyl(group, m.galv, 0.07, 0.09, 0.06, x, 0.04, z, 10);
  cyl(group, m.galv, 0.05, 0.05, 0.72, x, 0.40, z, 8);
  cyl(group, m.paintGreen, 0.10, 0.10, 0.08, x, 0.78, z, 10);
  cyl(group, m.galv, 0.045, 0.045, 0.06, x, 0.84, z, 8);
  for (let i = 0; i < 4; i += 1) {
    const ang = (i / 4) * Math.PI * 2;
    box(
      group, m.galv, 0.42, 0.03, 0.04,
      x + Math.cos(ang) * 0.20, 0.80, z + Math.sin(ang) * 0.20,
      [0, ang, 0],
    );
    cyl(
      group, m.paintGreen, 0.016, 0.012, 0.05,
      x + Math.cos(ang) * 0.40, 0.86, z + Math.sin(ang) * 0.40, 6,
    );
  }
}

export function buildHoe(group, m, x, z) {
  const lean = 0.36;
  box(group, m.timberPale, 0.048, 1.12, 0.048, x, 0.66, z, [0, 0, lean]);
  const half = 0.56;
  const bx = x + Math.sin(lean) * half;
  const by = 0.66 - Math.cos(lean) * half;
  cyl(group, m.galv, 0.038, 0.034, 0.10, bx, by + 0.06, z, 8).rotation.z = lean;
  box(group, m.galv, 0.08, 0.03, 0.04, bx + 0.04, by + 0.03, z);
  box(group, m.galv, 0.32, 0.028, 0.18, bx + 0.12, by + 0.02, z, [0.12, 0, 0.08]);
}

export function buildSeedTray(group, m, x, z) {
  box(group, m.paintGreen, 0.76, 0.03, 0.50, x, 0.08, z);
  box(group, m.paintGreen, 0.76, 0.10, 0.04, x, 0.14, z - 0.24);
  box(group, m.paintGreen, 0.76, 0.10, 0.04, x, 0.14, z + 0.24);
  box(group, m.paintGreen, 0.04, 0.10, 0.48, x - 0.36, 0.14, z);
  box(group, m.paintGreen, 0.04, 0.10, 0.48, x + 0.36, 0.14, z);
  box(group, m.paintGreen, 0.02, 0.08, 0.46, x - 0.12, 0.13, z);
  box(group, m.paintGreen, 0.02, 0.08, 0.46, x + 0.12, 0.13, z);
  box(group, m.paintGreen, 0.70, 0.08, 0.02, x, 0.13, z);
  for (let i = 0; i < 6; i += 1) {
    const ox = ((i % 3) - 1) * 0.24;
    const oz = (i < 3 ? -1 : 1) * 0.12;
    box(group, m.soilRich, 0.20, 0.04, 0.18, x + ox, 0.12, z + oz);
    rosette(group, m.leafLight, {
      x: x + ox, y: 0.15, z: z + oz,
      count: 4, len: 0.055, wid: 0.022, tilt: 0.7, phase: i, thick: 0.008,
    });
  }
}

export function buildTumbler(group, m, x, z) {
  // Forward of the compost crate so the two masses do not read as one cistern.
  const tx = x + 0.08;
  const tz = z + 0.82;
  const by = 0.40;
  cyl(group, m.paintGreen, 0.20, 0.20, 0.50, tx, by, tz, 14).rotation.x = Math.PI / 2;
  cyl(group, m.timberDark, 0.225, 0.225, 0.055, tx, by, tz - 0.27, 14).rotation.x = Math.PI / 2;
  cyl(group, m.timberDark, 0.225, 0.225, 0.055, tx, by, tz + 0.27, 14).rotation.x = Math.PI / 2;
  cyl(group, m.timberDark, 0.21, 0.21, 0.04, tx, by, tz, 12).rotation.x = Math.PI / 2;
  for (const ez of [-0.22, 0.22]) {
    box(group, m.timber, 0.055, 0.46, 0.055, tx - 0.18, 0.22, tz + ez, [0, 0, 0.38]);
    box(group, m.timber, 0.055, 0.46, 0.055, tx + 0.18, 0.22, tz + ez, [0, 0, -0.38]);
    box(group, m.timberDark, 0.40, 0.04, 0.04, tx, 0.04, tz + ez);
  }
  cyl(group, m.timberDark, 0.025, 0.025, 0.56, tx, by, tz, 8).rotation.x = Math.PI / 2;
  box(group, m.timberDark, 0.16, 0.04, 0.20, tx, by + 0.20, tz);
  cyl(group, m.galv, 0.018, 0.018, 0.16, tx, by, tz + 0.36, 8).rotation.x = Math.PI / 2;
  box(group, m.galv, 0.045, 0.20, 0.045, tx, by + 0.12, tz + 0.42);
  box(group, m.galv, 0.045, 0.045, 0.12, tx, by + 0.22, tz + 0.46);
}

export function buildHarvestCrate(group, m, x, z) {
  for (let i = 0; i < 3; i += 1) {
    box(group, m.timberPale, 0.68, 0.03, 0.12, x, 0.08, z + (i - 1) * 0.16);
  }
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 2; i += 1) {
      box(group, m.timber, 0.70, 0.10, 0.04, x, 0.18 + i * 0.14, z + sz * 0.24);
    }
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 2; i += 1) {
      box(group, m.timber, 0.04, 0.10, 0.48, x + sx * 0.34, 0.18 + i * 0.14, z);
    }
    box(group, m.timberDark, 0.06, 0.36, 0.06, x + sx * 0.34, 0.22, z - 0.22);
    box(group, m.timberDark, 0.06, 0.36, 0.06, x + sx * 0.34, 0.22, z + 0.22);
  }
  ball(group, m.tomato, 0.065, x - 0.18, 0.155, z + 0.04, 10);
  calyx(group, m.leafMid, { x: x - 0.18, y: 0.21, z: z + 0.04, s: 0.032 });
  ribbedOrb(group, m.pumpkin, {
    x: x + 0.02, y: 0.16, z: z - 0.04, r: 0.085, squash: 0.76, ribs: 8, segs: 10,
  });
  box(group, m.leafDeep, 0.02, 0.05, 0.02, x + 0.02, 0.24, z - 0.04);
  const rx = x + 0.20;
  const rz = z + 0.08;
  ball(group, m.radish, 0.05, rx, 0.14, rz, 10).scale.set(1, 0.88, 1);
  cyl(group, m.radish, 0.012, 0.005, 0.06, rx, 0.08, rz, 6);
  rosette(group, m.leafLight, {
    x: rx, y: 0.18, z: rz, count: 5, len: 0.085, wid: 0.03, tilt: 0.5, phase: 0.5, thick: 0.008,
  });
}
