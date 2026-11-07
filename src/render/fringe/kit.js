// Shared toy primitives for fringe terminals. Presentation only. No Math.random.

import * as THREE from 'three';
import { edgeAxes, shorePoint, alongLength } from '../shore.js';
import { registerLodVersions } from '../lod.js';

export const WATER_Y = 0.02;

export function noPick(mesh) {
  mesh.raycast = () => {};
  return mesh;
}

export function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: extra.roughness ?? 0.62,
    metalness: extra.metalness ?? 0.08,
    ...extra,
  });
}

export function addBox(group, w, h, d, mat, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  if (opts.rotX) mesh.rotation.x = opts.rotX;
  if (opts.rotY) mesh.rotation.y = opts.rotY;
  if (opts.rotZ) mesh.rotation.z = opts.rotZ;
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  mesh.userData.ownsGeometry = true;
  if (opts.name) mesh.name = opts.name;
  noPick(mesh);
  registerLodVersions(mesh, opts.lodFamily || 'kit');
  group.add(mesh);
  return mesh;
}

export function addCyl(group, rTop, rBot, h, segs, mat, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segs), mat);
  mesh.position.set(x, y, z);
  if (opts.rotX) mesh.rotation.x = opts.rotX;
  if (opts.rotZ) mesh.rotation.z = opts.rotZ;
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  mesh.userData.ownsGeometry = true;
  if (opts.name) mesh.name = opts.name;
  noPick(mesh);
  registerLodVersions(mesh, opts.lodFamily || 'kit');
  group.add(mesh);
  return mesh;
}

export function addSphere(group, r, segs, mat, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, segs, Math.max(6, segs / 2)), mat);
  mesh.position.set(x, y, z);
  if (opts.scaleY) mesh.scale.y = opts.scaleY;
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  mesh.userData.ownsGeometry = true;
  if (opts.name) mesh.name = opts.name;
  noPick(mesh);
  registerLodVersions(mesh, opts.lodFamily || 'kit');
  group.add(mesh);
  return mesh;
}

export function addCone(group, r, h, segs, mat, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, segs), mat);
  mesh.position.set(x, y, z);
  if (opts.rotY) mesh.rotation.y = opts.rotY;
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  mesh.userData.ownsGeometry = true;
  if (opts.name) mesh.name = opts.name;
  noPick(mesh);
  registerLodVersions(mesh, opts.lodFamily || 'kit');
  group.add(mesh);
  return mesh;
}

/** Local X along the edge, local Z seaward. */
export function edgeFrame(edge, extent, seawardM, alongFromCentre) {
  const { seaward, along } = edgeAxes(edge);
  const origin = shorePoint(edge, extent, seawardM, alongFromCentre);
  const yaw = Math.atan2(seaward.x, seaward.z);
  return { origin, seaward, along, yaw, length: alongLength(edge, extent) };
}

export function placeGroup(parent, group, frame) {
  group.position.copy(frame.origin);
  group.rotation.y = frame.yaw;
  parent.add(group);
  return group;
}

/** Tiny Monopoly-token people so a terminal reads occupied from play camera. */
export function addTokenPerson(group, mat, x, y, z, opts = {}) {
  const h = opts.h ?? 1.55;
  const r = opts.r ?? 0.28;
  addCyl(group, r * 0.85, r, h * 0.62, 6, mat, x, y + h * 0.31, z, { name: opts.name });
  addSphere(group, r * 0.72, 7, mat, x, y + h * 0.78, z);
  return group;
}

/**
 * Constructor-scale toy person. 1997 lots photograph workers at ~1/6 of the pad.
 * Default 3.2 m body + hat so occupancy survives a play-camera postage stamp.
 */
export function addToyPerson(group, mat, x, y, z, opts = {}) {
  const h = opts.h ?? 3.2;
  const r = opts.r ?? 0.55;
  addCyl(group, r * 0.88, r, h * 0.62, 6, mat, x, y + h * 0.31, z, { name: opts.name });
  addSphere(group, r * 0.74, 7, mat, x, y + h * 0.78, z);
  if (opts.hat) {
    addCyl(group, r * 0.62, r * 0.84, h * 0.14, 6, opts.hat, x, y + h * 0.96, z, {
      name: opts.name ? `${opts.name}:hat` : undefined,
    });
  }
  if (opts.point) {
    const side = opts.point < 0 ? -1 : 1;
    addBox(group, r * 0.32, r * 0.28, h * 0.48, mat, x + side * r * 1.05, y + h * 0.74, z, {
      rotZ: side * -0.72,
    });
  }
  return group;
}

/** Painted roof/wall letters. `text` is A–Z plus space. Each glyph is boxes. */
export function addToyLetters(group, text, mat, x, y, z, opts = {}) {
  const s = opts.s ?? 0.85;
  const gap = opts.gap ?? 0.18;
  const depth = opts.depth ?? 0.12;
  const yaw = opts.yaw ?? 0;
  const glyphs = {
    A: [[0.12, 1.0371, 0.1375, -0.0186, -0.2684], [0.12, 1.0371, 0.4125, -0.0186, 0.2684], [0.34, 0.12, 0.275, 0.3]],
    B: [[0.12, 1, 0, 0], [0.46, 0.14, 0.26, 0.86], [0.46, 0.12, 0.26, 0.44], [0.46, 0.14, 0.26, 0.06], [0.12, 0.3, 0.52, 0.58], [0.12, 0.3, 0.52, 0.16]],
    C: [[0.12, 0.72, 0, 0.14], [0.46, 0.14, 0.26, 0.86], [0.46, 0.14, 0.26, 0.06]],
    D: [[0.12, 1, 0, 0], [0.12, 0.72, 0.55, 0.14], [0.46, 0.14, 0.26, 0.86], [0.46, 0.14, 0.26, 0.06]],
    E: [[0.12, 1, 0, 0], [0.58, 0.14, 0.28, 0.86], [0.48, 0.12, 0.23, 0.44], [0.58, 0.14, 0.28, 0.06]],
    F: [[0.12, 1, 0, 0], [0.58, 0.14, 0.28, 0.86], [0.48, 0.12, 0.23, 0.44]],
    G: [[0.12, 0.72, 0, 0.14], [0.46, 0.14, 0.26, 0.86], [0.46, 0.14, 0.26, 0.06], [0.12, 0.34, 0.55, 0.14], [0.26, 0.12, 0.43, 0.4]],
    H: [[0.12, 1, 0, 0], [0.12, 1, 0.55, 0], [0.46, 0.12, 0.275, 0.44]],
    I: [[0.12, 1, 0.275, 0], [0.44, 0.12, 0.275, 0.88], [0.44, 0.12, 0.275, 0]],
    J: [[0.12, 0.86, 0.48, 0.14], [0.44, 0.12, 0.33, 0.88], [0.34, 0.14, 0.22, 0.06], [0.12, 0.24, 0.05, 0.06]],
    K: [[0.12, 1, 0, 0], [0.12, 0.7145, 0.305, 0.3828, -0.7557], [0.12, 0.6859, 0.305, -0.103, 0.7957]],
    L: [[0.12, 1, 0, 0], [0.52, 0.14, 0.29, 0.06]],
    M: [[0.12, 1, 0, 0], [0.12, 1, 0.55, 0], [0.12, 0.6419, 0.1375, 0.3891, 0.4427], [0.12, 0.6419, 0.4125, 0.3891, -0.4427]],
    N: [[0.12, 1, 0, 0], [0.12, 1, 0.55, 0], [0.12, 1.1413, 0.275, -0.0706, 0.5028]],
    O: [[0.12, 0.72, 0, 0.14], [0.12, 0.72, 0.55, 0.14], [0.46, 0.14, 0.26, 0.86], [0.46, 0.14, 0.26, 0.06]],
    P: [[0.12, 1, 0, 0], [0.46, 0.14, 0.26, 0.86], [0.46, 0.12, 0.26, 0.44], [0.12, 0.3, 0.52, 0.58]],
    Q: [[0.12, 0.72, 0, 0.14], [0.12, 0.66, 0.55, 0.2], [0.46, 0.14, 0.26, 0.86], [0.46, 0.14, 0.26, 0.06], [0.12, 0.4104, 0.48, -0.0952, 0.7509]],
    R: [[0.12, 1, 0, 0], [0.46, 0.14, 0.26, 0.86], [0.46, 0.12, 0.26, 0.44], [0.12, 0.3, 0.52, 0.58], [0.12, 0.5382, 0.395, -0.0491, 0.6138]],
    S: [[0.58, 0.14, 0.28, 0.86], [0.12, 0.34, 0, 0.52], [0.54, 0.12, 0.28, 0.44], [0.12, 0.34, 0.55, 0.12], [0.58, 0.14, 0.28, 0.06]],
    T: [[0.12, 1, 0.275, 0], [0.62, 0.14, 0.28, 0.86]],
    U: [[0.12, 0.86, 0, 0.14], [0.12, 0.86, 0.55, 0.14], [0.46, 0.14, 0.26, 0.06]],
    V: [[0.12, 1.0371, 0.1375, -0.0186, 0.2684], [0.12, 1.0371, 0.4125, -0.0186, -0.2684]],
    W: [[0.12, 1.0094, 0.0688, -0.0047, 0.1366], [0.12, 1.0094, 0.2063, -0.0047, -0.1366], [0.12, 1.0094, 0.3438, -0.0047, 0.1366], [0.12, 1.0094, 0.4813, -0.0047, -0.1366]],
    X: [[0.12, 1.1413, 0.275, -0.0706, -0.5028], [0.12, 1.1413, 0.275, -0.0706, 0.5028]],
    Y: [[0.12, 0.5, 0.275, 0], [0.12, 0.5706, 0.1375, 0.4647, 0.5028], [0.12, 0.5706, 0.4125, 0.4647, -0.5028]],
    Z: [[0.58, 0.14, 0.28, 0.86], [0.58, 0.14, 0.28, 0.06], [0.12, 0.8591, 0.275, 0.1004, -0.6947]],
    0: [[0.12, 0.72, 0, 0.14], [0.12, 0.72, 0.55, 0.14], [0.46, 0.14, 0.26, 0.86], [0.46, 0.14, 0.26, 0.06]],
    1: [[0.12, 1, 0.3, 0], [0.12, 0.228, 0.23, 0.796, -0.661], [0.46, 0.12, 0.3, 0]],
    2: [[0.46, 0.14, 0.26, 0.86], [0.12, 0.3, 0.55, 0.56], [0.5, 0.12, 0.28, 0.44], [0.12, 0.3, 0, 0.16], [0.58, 0.14, 0.28, 0.06]],
    3: [[0.46, 0.14, 0.26, 0.86], [0.12, 0.3, 0.55, 0.56], [0.4, 0.12, 0.3, 0.44], [0.12, 0.3, 0.55, 0.16], [0.46, 0.14, 0.26, 0.06]],
    4: [[0.12, 0.52, 0.02, 0.48], [0.12, 1, 0.42, 0], [0.54, 0.12, 0.27, 0.36]],
    5: [[0.58, 0.14, 0.28, 0.86], [0.12, 0.32, 0, 0.54], [0.5, 0.12, 0.26, 0.44], [0.12, 0.32, 0.55, 0.14], [0.5, 0.14, 0.26, 0.06]],
    6: [[0.12, 0.86, 0, 0.14], [0.46, 0.14, 0.26, 0.86], [0.46, 0.12, 0.26, 0.44], [0.12, 0.32, 0.55, 0.14], [0.46, 0.14, 0.26, 0.06]],
    7: [[0.58, 0.14, 0.28, 0.86], [0.12, 0.9176, 0.3, -0.0288, -0.3562]],
    8: [[0.12, 0.72, 0, 0.14], [0.12, 0.72, 0.55, 0.14], [0.46, 0.14, 0.26, 0.86], [0.46, 0.12, 0.26, 0.44], [0.46, 0.14, 0.26, 0.06]],
    9: [[0.12, 0.32, 0, 0.54], [0.12, 0.86, 0.55, 0], [0.46, 0.14, 0.26, 0.86], [0.46, 0.12, 0.26, 0.44], [0.46, 0.14, 0.26, 0.06]],
    '-': [[0.44, 0.12, 0.275, 0.44]],
    '.': [[0.14, 0.14, 0.275, 0]],
  };
  const chars = String(text).toUpperCase().split('');
  let cursor = 0;
  const wrap = new THREE.Group();
  wrap.position.set(x, y, z);
  wrap.rotation.y = yaw;
  for (const ch of chars) {
    if (ch === ' ') {
      cursor += 0.42 * s;
      continue;
    }
    const bars = glyphs[ch];
    if (bars) {
      for (const [w, h, ox, oy, rotZ = 0] of bars) {
        // Glyph Y coordinates describe each bar's bottom edge; boxes are positioned
        // from their centre. Keeping that distinction makes full-height stems join
        // their caps instead of dropping half a letter below the baseline.
        addBox(wrap, w * s, h * s, depth, mat, cursor + ox * s, (oy + h * 0.5) * s, 0, { rotZ });
      }
    }
    cursor += 0.78 * s + gap;
  }
  group.add(wrap);
  return wrap;
}

export function disposeGroup(group) {
  group?.traverse((node) => {
    node.geometry?.dispose?.();
    const mats = node.material;
    if (!mats) return;
    if (Array.isArray(mats)) mats.forEach((m) => m.dispose?.());
    else mats.dispose?.();
  });
}
