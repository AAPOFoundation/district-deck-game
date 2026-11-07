// Pick proxy over the port shed. Recipe matches makeFringePickTargets in
// fringe.js (invisible box on the fringe root). Does not edit fringe.js.

import * as THREE from 'three';

/** Cited from fringe/port.js addTerminal shedLen / shedDep / h. */
const SHED_LEN = 30;
const SHED_DEP = 10.4;
const SHED_H = 9.4;

function pickMaterial() {
  return new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  });
}

function boundsFromShedGroup(root) {
  const group = root.getObjectByName('fringe:port-shed');
  if (!group?.isObject3D) return null;
  group.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(group);
  return bounds.isEmpty() ? null : bounds;
}

function boundsFromLogistics(root) {
  const port = root.getObjectByName('fringe:port');
  const logistics = port?.userData?.logistics;
  const inside = logistics?.shed?.inside;
  const toWorld = logistics?.toWorld;
  if (!inside || typeof toWorld !== 'function') return null;
  const hx = SHED_LEN * 0.5;
  const hz = SHED_DEP * 0.5;
  const y0 = 0.4;
  const y1 = y0 + SHED_H;
  const points = [];
  for (const dx of [-hx, hx]) {
    for (const dy of [y0, y1]) {
      for (const dz of [-hz, hz]) {
        const world = toWorld(inside.x + dx, dy, inside.z + dz);
        points.push(new THREE.Vector3(world.x, world.y, world.z));
      }
    }
  }
  const bounds = new THREE.Box3().setFromPoints(points);
  return bounds.isEmpty() ? null : bounds;
}

function boundsFromDoor(root) {
  const door = root.getObjectByName('fringe:port-shed:door-west');
  if (!door?.isObject3D) return null;
  door.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(door);
  return bounds.isEmpty() ? null : bounds;
}

export function addPortWarehousePickTarget(fringe) {
  const targets = fringe?.pickTargets ?? [];
  if (targets.some((proxy) => proxy?.userData?.focus === 'warehouse')) return targets;
  const root = fringe?.root;
  if (!root?.isObject3D) return targets;
  root.updateWorldMatrix(true, true);
  const bounds = boundsFromShedGroup(root)
    ?? boundsFromLogistics(root)
    ?? boundsFromDoor(root);
  if (!bounds) return targets;
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(
      Math.max(1.25, size.x),
      Math.max(1.25, size.y),
      Math.max(1.25, size.z),
    ),
    pickMaterial(),
  );
  proxy.name = 'pick:fringe:port:warehouse';
  proxy.position.copy(root.worldToLocal(centre));
  proxy.userData.fringeId = 'port';
  proxy.userData.focus = 'warehouse';
  proxy.userData.label = 'Port warehouse';
  proxy.userData.sourceName = 'fringe:port-shed';
  proxy.userData.sourceMeshName = 'fringe:port-shed:door-west';
  root.add(proxy);
  targets.push(proxy);
  if (fringe) fringe.pickTargets = targets;
  return targets;
}

/** Invisible boxes follow the rendered structures, including every tank and yard instance. */
export function addPortStructurePickTargets(fringe) {
  const targets = fringe?.pickTargets ?? [];
  const root = fringe?.root;
  if (!root?.isObject3D) return targets;
  root.updateWorldMatrix(true, true);
  // COPY-DRAFT: names shown when a port structure is picked.
  const parts = [
    { portPart: 'gantry-hold', name: 'fringe:port-gantry:hold', focus: null, label: 'Port cranes' },
    { portPart: 'gantry-apron', name: 'fringe:port-gantry:apron', focus: null, label: 'Port cranes' },
    { portPart: 'yard', focus: 'warehouse', label: 'Container yard' },
    { portPart: 'tanks', focus: 'warehouse', label: 'Tank farm' },
  ];
  for (const part of parts) {
    if (targets.some((proxy) => proxy.userData?.fringeId === 'port' && proxy.userData.portPart === part.portPart)) continue;
    const bounds = new THREE.Box3();
    root.traverse((object) => {
      const matches = part.name ? object.name === part.name
        : part.portPart === 'yard'
          ? object.isMesh && /^fringe:port-yard(?:-live)?:body:/.test(object.name)
          : object.isGroup && object.name === 'fringe:port-oil-tank';
      if (matches) bounds.union(new THREE.Box3().setFromObject(object));
    });
    if (bounds.isEmpty()) continue;
    const size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3());
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), pickMaterial());
    proxy.name = `pick:fringe:port:${part.portPart}`;
    // Keep the world-aligned box on its source even if the fringe root is transformed.
    proxy.applyMatrix4(root.matrixWorld.clone().invert().multiply(new THREE.Matrix4().makeTranslation(centre.x, centre.y, centre.z)));
    proxy.userData = { fringeId: 'port', portPart: part.portPart, focus: part.focus, label: part.label };
    root.add(proxy);
    targets.push(proxy);
  }
  fringe.pickTargets = targets;
  return targets;
}
