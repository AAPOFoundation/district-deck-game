import * as THREE from 'three';
import { WORLD_CURVE_STATE } from './world-curve.js';

/** Partition complete authored triangles; attributes and shader inputs are unchanged. */
export function partitionWaterGeometry(geometry, cellSize, padding = 16) {
  const position = geometry.getAttribute('position'), index = geometry.getIndex();
  if (!index || geometry.groups.length) throw new Error('Water patches require an indexed, single-material geometry');
  const cells = new Map();
  for (let i = 0; i < index.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const x = ids.reduce((sum, id) => sum + position.getX(id), 0) / 3;
    const z = ids.reduce((sum, id) => sum + position.getZ(id), 0) / 3;
    const key = `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(...ids);
  }
  return [...cells].map(([cell, indices]) => {
    const patch = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) patch.setAttribute(name, attribute);
    patch.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    const box = new THREE.Box3(), point = new THREE.Vector3();
    for (const id of indices) box.expandByPoint(point.fromBufferAttribute(position, id));
    box.expandByScalar(padding);
    patch.boundingBox = box; patch.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    patch.userData.waterPatch = { cell, padding, triangles: indices.length / 3 };
    return patch;
  });
}

/** Keep the public owner mesh and its transform; child patches use its local frame. */
export function mountWaterPatches(owner, { cellSize, padding = 16 }) {
  const originalGeometry = owner.geometry;
  const geometries = partitionWaterGeometry(originalGeometry, cellSize, padding);
  if (!geometries.length) return [];
  // Original geometry remains owned by the caller, exactly as before mounting.
  // Geometry reads occur before Three's frustum test: render callbacks are too
  // late to switch away from a culled first patch. These accessors allocate nothing.
  let externalGeometry, externalOverride = false;
  Object.defineProperty(owner, 'geometry', { configurable: true, enumerable: true,
    get() { return externalOverride ? externalGeometry
      : WORLD_CURVE_STATE.uWorldCurve.value === 0 ? geometries[0] : originalGeometry; },
    // Existing LOD writes are excluded by callers. Any future explicit assignment
    // still takes effect immediately, replacing the whole representation rather
    // than leaving old patch children rendering alongside the assigned geometry.
    set(value) { externalGeometry = value; externalOverride = true; },
  });
  const before = owner.onBeforeRender;
  let lastRenderer, lastCamera, lastFrame;
  const sync = (renderer, scene, camera, ...rest) => {
    const frame = renderer.info.render.frame;
    if (renderer !== lastRenderer || camera !== lastCamera || frame !== lastFrame) {
      before.call(owner, renderer, scene, camera, ...rest);
      lastRenderer = renderer; lastCamera = camera; lastFrame = frame;
    }
  };
  for (let i = 0; i < geometries.length; i++) {
    const mesh = i === 0 ? owner : new THREE.Mesh(geometries[i], owner.material);
    if (i !== 0) {
      mesh.name = `${owner.name}:patch:${i}`;
      mesh.castShadow = owner.castShadow; mesh.receiveShadow = owner.receiveShadow;
      mesh.renderOrder = owner.renderOrder; mesh.layers.mask = owner.layers.mask;
      let explicitlyVisible = mesh.visible;
      Object.defineProperty(mesh, 'visible', { configurable: true, enumerable: true,
        get() { return explicitlyVisible && !externalOverride && WORLD_CURVE_STATE.uWorldCurve.value === 0; },
        set(value) { explicitlyVisible = Boolean(value); },
      });
      // Raycaster traverses invisible children; suppress the inactive representation
      // so curved/full mode returns only the original surface's intersections.
      const raycast = mesh.raycast;
      mesh.raycast = function (...args) { if (this.visible) raycast.apply(this, args); };
      owner.add(mesh);
    }
    mesh.onBeforeRender = sync;
    mesh.userData.waterGeometryPatch = geometries[i].userData.waterPatch;
    let allowed = true;
    Object.defineProperty(mesh, 'frustumCulled', { configurable: true, enumerable: true,
      get() { return allowed && WORLD_CURVE_STATE.uWorldCurve.value === 0; },
      set(value) { allowed = Boolean(value); } });
  }
  return geometries;
}
