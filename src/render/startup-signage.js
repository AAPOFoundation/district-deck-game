// Runtime overlay: text + icon on a corner shop that is operating as an AI startup.
// Sim state does not reach the commercial kit (§3.3), so this sits beside the building
// the same way construction stages do — attached to the board root, keyed by parcel.

import * as THREE from 'three';
import { activeVenture } from '../core/ventures.js';

const SIGN_KEY = 'startupSigns';

function textTexture(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#12151c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#6ee7ff';
  ctx.fillRect(0, 0, 10, canvas.height);
  ctx.fillRect(canvas.width - 10, 0, 10, canvas.height);
  ctx.fillStyle = '#f4fbff';
  ctx.font = '700 56px "IBM Plex Sans", "Helvetica Neue", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function iconGroup() {
  const group = new THREE.Group();
  group.name = 'startup-icon';
  const cyan = new THREE.MeshStandardMaterial({
    color: '#5ad6ef',
    roughness: 0.35,
    metalness: 0.15,
    emissive: '#143038',
    emissiveIntensity: 0.55,
  });
  const node = (x, y, z, s = 0.16) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), cyan);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
  };
  const bar = (x, y, z, w, h, d) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cyan);
    mesh.position.set(x, y, z);
    group.add(mesh);
  };
  node(-0.22, 0.08, 0, 0.18);
  node(0.22, 0.10, 0, 0.16);
  node(0.00, -0.16, 0, 0.14);
  bar(-0.01, 0.09, 0, 0.40, 0.035, 0.035);
  bar(-0.11, -0.04, 0, 0.035, 0.28, 0.035);
  bar(0.11, -0.03, 0, 0.035, 0.26, 0.035);
  return group;
}

function makeSignGroup(parcel, venture) {
  const group = new THREE.Group();
  group.name = `startup-sign:${parcel.id}`;
  const label = venture.label ?? 'Nova.ai';
  const texture = textTexture(label);
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.55,
    metalness: 0.05,
    emissive: '#0a2a33',
    emissiveIntensity: 0.35,
  });
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.62, 0.08), mat);
  fascia.position.set(0, 4.15, 2.35);
  fascia.castShadow = true;
  group.add(fascia);

  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.10, 1.05, 0.72),
    new THREE.MeshStandardMaterial({
      color: '#1b2430',
      roughness: 0.5,
      metalness: 0.08,
    }),
  );
  blade.position.set(1.85, 3.55, 2.05);
  blade.rotation.y = Math.PI / 4;
  blade.castShadow = true;
  group.add(blade);

  const icon = iconGroup();
  icon.position.set(1.85, 3.72, 2.05);
  icon.rotation.y = Math.PI / 4;
  group.add(icon);

  const yaw = THREE.MathUtils.degToRad(Number(parcel.rotation) || 0);
  group.position.set(parcel.centre.x, 0, parcel.centre.z);
  group.rotation.y = yaw;
  group.userData = { parcelId: parcel.id, label, dispose() {
    texture.dispose();
    mat.dispose();
    blade.material.dispose();
    icon.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material && child.material !== mat) child.material.dispose?.();
    });
    fascia.geometry.dispose();
    blade.geometry.dispose();
  } };
  return group;
}

export function syncStartupSignage(board, city, state) {
  if (!board?.root) return;
  if (!board[SIGN_KEY]) board[SIGN_KEY] = new Map();
  const live = board[SIGN_KEY];
  const wanted = new Set();
  for (const [parcelId, holding] of Object.entries(state?.holdings ?? {})) {
    const venture = activeVenture(holding);
    if (!venture) continue;
    const parcel = city?.parcels?.[parcelId];
    if (!parcel?.centre) continue;
    wanted.add(parcelId);
    const existing = live.get(parcelId);
    if (existing && existing.userData.label === venture.label) continue;
    if (existing) {
      board.root.remove(existing);
      existing.userData.dispose?.();
    }
    const group = makeSignGroup(parcel, venture);
    board.root.add(group);
    live.set(parcelId, group);
  }
  for (const [parcelId, group] of live) {
    if (wanted.has(parcelId)) continue;
    board.root.remove(group);
    group.userData.dispose?.();
    live.delete(parcelId);
  }
}
