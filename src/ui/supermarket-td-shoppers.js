// Vinyl toy shoppers for Zombie Shopper TD. Party Animals hop-step, not billboard sprites.

import * as THREE from 'three';
import { PA_GAIT, createShopperGait, shopperGaitTick, pathYaw } from './supermarket-td-gait.js';

const SKIN = Object.freeze(['#9dba8a', '#8aaf7a', '#b5c98c', '#7ea072']);
const SHIRT = Object.freeze({
  fresh: '#7ed34a',
  household: '#5ec8ff',
  liquor: '#ff5ba0',
  cashier: '#ff8c2a',
});
const PANTS = '#2a221c';
const SHOE = '#1a1410';
const BASKET = '#f4e4b0';
/** Old sprite was 1.92 tall so it cleared the 1.5 m bays. Toy humans must too. */
export const SHOPPER_SCALE = 1.52;
/** Hip-socket offset. Keep tiny so the bind pose is a column, not a V. */
const LEG_X = 0.022;
/** Slight inward roll so iso does not read as a duck stance. */
const LEG_IN = 0.07;

function vinyl(color, extras = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: extras.roughness ?? 0.34,
    metalness: extras.metalness ?? 0.06,
    emissive: extras.emissive ?? 0x000000,
    emissiveIntensity: extras.emissiveIntensity ?? 0,
  });
}

function mesh(geo, material, x, y, z, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function limb(parent, geo, material, x, y, z) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const m = mesh(geo, material, 0, -geo.parameters?.height / 2 || -0.12, 0);
  pivot.add(m);
  parent.add(pivot);
  return pivot;
}

export function buildVinylHuman({
  want = 'fresh',
  role = 'shopper',
  seed = 0,
  wantMap = null,
} = {}) {
  const skin = vinyl(SKIN[Math.floor(seed * SKIN.length) % SKIN.length]);
  const shirt = vinyl(SHIRT[want] ?? SHIRT.fresh, {
    emissive: SHIRT[want] ?? SHIRT.fresh,
    emissiveIntensity: 0.08,
  });
  const pants = vinyl(PANTS, { roughness: 0.55 });
  const shoe = vinyl(SHOE, { roughness: 0.62 });
  const basketMat = vinyl(BASKET, { roughness: 0.4 });

  const root = new THREE.Group();
  root.name = role === 'cashier' ? 'zstd:cashier' : 'zstd:shopper';
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  const hips = new THREE.Group();
  hips.position.y = 0.46;
  body.add(hips);

  const torso = mesh(new THREE.BoxGeometry(0.30, 0.36, 0.22), shirt, 0, 0.22, 0);
  hips.add(torso);
  const pelvis = mesh(new THREE.BoxGeometry(0.12, 0.14, 0.16), pants, 0, 0.02, 0);
  hips.add(pelvis);

  const head = new THREE.Group();
  head.position.set(0, 0.52, 0);
  hips.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.175, 14, 12), skin, 0, 0.02, 0));
  head.add(mesh(new THREE.SphereGeometry(0.032, 8, 6), vinyl('#1a1410'), -0.06, 0.05, 0.14, false));
  head.add(mesh(new THREE.SphereGeometry(0.032, 8, 6), vinyl('#1a1410'), 0.06, 0.05, 0.14, false));
  const mouth = mesh(new THREE.BoxGeometry(0.08, 0.025, 0.03), vinyl('#3a3020'), 0, -0.04, 0.16, false);
  head.add(mouth);

  const armGeo = new THREE.BoxGeometry(0.09, 0.28, 0.09);
  const leftArm = limb(hips, armGeo, shirt, -0.22, 0.34, 0);
  const rightArm = limb(hips, armGeo, shirt, 0.22, 0.34, 0);
  leftArm.children[0].position.y = -0.14;
  rightArm.children[0].position.y = -0.14;

  const thighGeo = new THREE.BoxGeometry(0.06, 0.22, 0.10);
  const shinGeo = new THREE.BoxGeometry(0.055, 0.2, 0.09);
  const leftThigh = limb(hips, thighGeo, pants, -LEG_X, 0, 0);
  const rightThigh = limb(hips, thighGeo, pants, LEG_X, 0, 0);
  leftThigh.children[0].position.y = -0.11;
  rightThigh.children[0].position.y = -0.11;
  const leftShin = limb(leftThigh, shinGeo, pants, 0, -0.22, 0);
  const rightShin = limb(rightThigh, shinGeo, pants, 0, -0.22, 0);
  leftShin.children[0].position.y = -0.1;
  rightShin.children[0].position.y = -0.1;
  const leftFoot = mesh(new THREE.BoxGeometry(0.055, 0.05, 0.16), shoe, 0, -0.22, 0.05);
  const rightFoot = mesh(new THREE.BoxGeometry(0.055, 0.05, 0.16), shoe, 0, -0.22, 0.05);
  leftShin.add(leftFoot);
  rightShin.add(rightFoot);

  if (role === 'shopper') {
    const basket = new THREE.Group();
    basket.position.set(0.02, -0.22, 0.08);
    rightArm.add(basket);
    basket.add(mesh(new THREE.BoxGeometry(0.2, 0.04, 0.16), basketMat, 0, 0, 0, false));
    basket.add(mesh(new THREE.BoxGeometry(0.03, 0.12, 0.16), basketMat, -0.09, 0.06, 0, false));
    basket.add(mesh(new THREE.BoxGeometry(0.03, 0.12, 0.16), basketMat, 0.09, 0.06, 0, false));
    const handle = mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 10, Math.PI), basketMat, 0, 0.12, 0, false);
    handle.rotation.z = Math.PI;
    basket.add(handle);
  }

  let bubble = null;
  if (wantMap) {
    const mat = new THREE.MeshStandardMaterial({
      map: wantMap,
      transparent: true,
      alphaTest: 0.22,
      roughness: 0.5,
      depthWrite: true,
    });
    bubble = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), mat);
    bubble.position.set(0.22, 0.92, 0.18);
    bubble.name = 'want-bubble';
    root.add(bubble);
  }

  root.scale.setScalar(SHOPPER_SCALE);
  return {
    root,
    body,
    hips,
    head,
    leftArm,
    rightArm,
    leftThigh,
    rightThigh,
    leftShin,
    rightShin,
    shirt,
    bubble,
    gait: createShopperGait(seed),
  };
}

export function poseVinylHuman(handle, pose, { camera = null } = {}) {
  handle.body.position.y = pose.hop;
  handle.body.scale.set(1, pose.scaleY, pose.scaleXZ);
  handle.body.rotation.x = pose.lean;
  handle.hips.rotation.y = 0;
  handle.leftThigh.rotation.set(pose.leftLeg, 0, LEG_IN);
  handle.rightThigh.rotation.set(pose.rightLeg, 0, -LEG_IN);
  handle.leftThigh.position.set(-LEG_X, 0, pose.leftLeg * 0.04);
  handle.rightThigh.position.set(LEG_X, 0, pose.rightLeg * 0.04);
  handle.leftShin.rotation.x = Math.max(0, -pose.leftLeg) * 0.45;
  handle.rightShin.rotation.x = Math.max(0, -pose.rightLeg) * 0.45;
  handle.leftArm.rotation.x = pose.leftArm;
  handle.rightArm.rotation.x = pose.rightArm;
  handle.root.rotation.y = pose.yaw;
  if (pose.stomp) handle.root.rotation.z = pose.stomp;
  else handle.root.rotation.z = 0;
  if (handle.bubble && camera) handle.bubble.lookAt(camera.position);
}

export function tickVinylShopper(handle, {
  dt, moving, pathSpeed, from, to, rage, reducedMotion, camera,
}) {
  const yaw = pathYaw(from, to) ?? handle.gait.yaw;
  const pose = shopperGaitTick(handle.gait, {
    dt, moving, pathSpeed, yaw, rage, reducedMotion,
  });
  poseVinylHuman(handle, pose, { camera });
  const pop = 0.22 + pose.pop * 0.78;
  handle.root.scale.setScalar(pop * SHOPPER_SCALE);
  return pose;
}

export function buildVinylTrap(kind) {
  const root = new THREE.Group();
  root.name = kind === 'magazine' ? 'zstd:mag' : 'zstd:bin';
  root.userData.pop = 0;
  if (kind === 'magazine') {
    const wood = vinyl('#5a3820', { roughness: 0.55 });
    root.add(mesh(new THREE.BoxGeometry(0.62, 1.25, 0.28), wood, 0, 0.62, 0));
    const covers = ['#ff5ba0', '#5ec8ff', '#ffd23a', '#7ed34a'];
    for (let i = 0; i < 4; i += 1) {
      const card = mesh(
        new THREE.BoxGeometry(0.42, 0.24, 0.06),
        vinyl(covers[i], { roughness: 0.28 }),
        0.12,
        0.28 + i * 0.24,
        0.12,
        false,
      );
      card.rotation.y = -0.18;
      root.add(card);
    }
  } else {
    const bin = vinyl('#ffd445', { roughness: 0.32, emissive: '#8a5a10', emissiveIntensity: 0.12 });
    root.add(mesh(new THREE.CylinderGeometry(0.48, 0.4, 0.52, 14), bin, 0, 0.3, 0));
    const sweets = ['#ff5ba0', '#5ec8ff', '#7ed34a', '#ff8a2a'];
    for (let i = 0; i < 4; i += 1) {
      const a = i * 1.5;
      root.add(mesh(
        new THREE.BoxGeometry(0.12, 0.1, 0.1),
        vinyl(sweets[i], { roughness: 0.26 }),
        Math.cos(a) * 0.12,
        0.42,
        Math.sin(a) * 0.12,
        false,
      ));
    }
  }
  root.scale.setScalar(0.2);
  return root;
}

export function tickTrapPop(root, dt) {
  if (!root) return;
  root.userData.pop = Math.min(1, (root.userData.pop ?? 0) + Math.max(0, dt) * 7);
  const p = root.userData.pop;
  const bounce = Math.sin(p * Math.PI) * 0.18;
  root.scale.set(1 + bounce * 0.35, Math.max(0.2, p + bounce), 1 + bounce * 0.35);
}

export { PA_GAIT };
