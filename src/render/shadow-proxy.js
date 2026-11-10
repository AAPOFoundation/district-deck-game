// P09: static, opaque shadow-only world-space chunks. Colour geometry stays owned by its source.
import * as THREE from 'three';
import { hasDynamicAncestry } from './batching.js';
import { SHADOW_LAYER, installShadowLod } from './lod.js';
import { WORLD_CURVE_STATE } from './world-curve.js';
import { classifyPhotoCaster } from './photo-shadow-registration.js';
import { P23_LIGHT_PHOTO } from './v4-p1-polish.js';

export function readGraphDiet(search = '') {
  return new URLSearchParams(search).get('graphDiet') === 'on';
}

// G1: one live walk before both cascades, then Three skips caster-free branches.
// Layers do not prune Three's child recursion. Reparenting a flat caster list
// would disturb ownership, visibility hooks and nested casters; a cached list
// would miss async additions, receiver-budget changes and proxy ejections.
// Keep the original graph/order and all caster ancestry, including non-proxy
// exclusions (cutouts, index-visibility meshes, LOD and dynamic actors).
function shadowGraphDiet() {
  const hidden = [];
  function collect(node) {
    if (node.visible === false) return false;
    const start = hidden.length;
    let casts = !!(node.castShadow && (node.isMesh || node.isLine || node.isPoints));
    for (const child of node.children) casts = collect(child) || casts;
    if (!casts && node.children.length) {
      // Retain just the highest caster-free root, not each of its descendants.
      hidden.length = start;
      hidden.push(node, node.visible);
    }
    return casts;
  }
  return function(shadowMap, render, lights, world, camera) {
    // VSM also draws receivers; G1 is the existing PCF CSM path only. Preserve
    // Three's skipped-pass behaviour and do no extra walk on an idle shadow map.
    if (shadowMap.type === THREE.VSMShadowMap || !lights.some(light => light.shadow
      && !(light.shadow.autoUpdate === false && light.shadow.needsUpdate === false))) {
      return render.call(shadowMap, lights, world, camera);
    }
    try {
      collect(world);
      for (let i = 0; i < hidden.length; i += 2) hidden[i].visible = false;
      return render.call(shadowMap, lights, world, camera);
    } finally {
      for (let i = 0; i < hidden.length; i += 2) hidden[i].visible = hidden[i + 1];
      hidden.length = 0;
    }
  };
}

function visible(mesh, scene) {
  if (mesh.material.visible === false) return false;
  let onScene = false;
  for (let p = mesh; p; p = p.parent) {
    if (!p.visible) return false;
    if (p === scene) onScene = true;
  }
  return onScene;
}

function eligible(mesh, scene) {
  const m = mesh.material, g = mesh.geometry;
  // LOD swaps geometry and can disable castShadow after the proxy is built.
  if (scene.userData.lodState?.enabled && mesh.userData.lod) return false;
  return mesh.isMesh && mesh.castShadow && !mesh.userData.shadowCulledSize
    && !mesh.isSkinnedMesh && !mesh.isBatchedMesh && !mesh.morphTargetInfluences?.length
    && !mesh.userData.shadowMesh && !mesh.userData.shadowMovedToLod && !mesh.userData.indexVisibility
    && !mesh.customDepthMaterial && g?.attributes.position && m && !Array.isArray(m)
    && !m.transparent && !m.alphaTest && !m.alphaToCoverage && !m.alphaMap && !m.displacementMap
    && !m.clippingPlanes?.length && !m.wireframe && !m.isShaderMaterial
    && !hasDynamicAncestry(mesh, true) && visible(mesh, scene);
}

function snapshot(rec, scene) {
  rec.matrix.set(rec.mesh.matrixWorld.elements);
  if (rec.instances) rec.instances.set(rec.mesh.instanceMatrix.array);
  rec.version = rec.mesh.instanceMatrix?.version;
  rec.count = rec.mesh.isInstancedMesh ? rec.mesh.count : 1;
  rec.visible = visible(rec.mesh, scene);
}

function rewrite(proxy, rec, collapse = false) {
  const mesh = rec.mesh, g = rec.geometry, attr = g.attributes.position;
  const flip = !mesh.isInstancedMesh && mesh.matrixWorld.determinant() < 0;
  for (const slice of rec.slices) {
    const { chunk, vertices, instance, offset, indexStart, indexCount } = slice;
    const array = chunk.geometry.attributes.position.array;
    const hidden = collapse || !rec.visible || instance >= rec.count;
    if (flip !== slice.flipped) {
      const index = chunk.geometry.index.array;
      for (let i = indexStart; i < indexStart + indexCount; i += 3) {
        const save = index[i + 1]; index[i + 1] = index[i + 2]; index[i + 2] = save;
      }
      slice.flipped = flip; chunk.geometry.index.needsUpdate = true;
    }
    proxy.matrix.copy(mesh.matrixWorld);
    if (mesh.isInstancedMesh) {
      mesh.getMatrixAt(instance, proxy.instance);
      proxy.matrix.multiply(proxy.instance);
    }
    for (let i = 0; i < vertices.length; i++) {
      const at = (offset + i) * 3;
      if (hidden) { array[at] = array[at + 1] = array[at + 2] = 0; continue; }
      proxy.vertex.fromBufferAttribute(attr, vertices[i]).applyMatrix4(proxy.matrix);
      array[at] = proxy.vertex.x; array[at + 1] = proxy.vertex.y; array[at + 2] = proxy.vertex.z;
    }
    chunk.userData.p09Dirty = true;
  }
}

function refreshBounds(proxy) {
  for (const chunk of proxy.chunks) {
    if (!chunk.userData.p09Dirty) continue;
    chunk.geometry.attributes.position.needsUpdate = true;
    chunk.geometry.computeBoundingBox(); chunk.geometry.computeBoundingSphere();
    chunk.userData.p09Dirty = false;
  }
}

// Depth-only positions can share vertices across normal/UV seams. Sort source
// indices to find exact duplicates once at build time, without float-keyed maps.
function positionRepresentatives(geometry) {
  const p = geometry.attributes.position;
  const order = Uint32Array.from({ length: p.count }, (_, i) => i), indices = new Uint32Array(p.count);
  order.sort((a, b) => p.getX(a) - p.getX(b) || p.getY(a) - p.getY(b) || p.getZ(a) - p.getZ(b));
  let first = order[0];
  for (const i of order) {
    if (p.getX(i) !== p.getX(first) || p.getY(i) !== p.getY(first) || p.getZ(i) !== p.getZ(first)) first = i;
    indices[i] = first;
  }
  return indices;
}

export function buildStaticShadowProxy(scene, batch, {
  layer = SHADOW_LAYER, tileM = 96, maxVerts = 65535,
  extent = { x: 272, z: 272 }, photoCSM = null, farTiny = new WeakSet(), renderer = null,
  graphDiet = readGraphDiet(typeof location !== 'undefined' ? location.search : ''),
} = {}) {
  if (scene.userData.staticShadowProxy) return scene.userData.staticShadowProxy;
  const root = new THREE.Group(); root.name = 'p09:shadow-proxy';
  const proxy = { root, scene, batch, layer, photoCSM, sources: [], chunks: [], materials: [], frame: 0,
    matrix: new THREE.Matrix4(), instance: new THREE.Matrix4(), vertex: new THREE.Vector3(), disposed: false,
    stats: { sources: 0, chunks: 0, tris: 0, bytes: 0, rewrites: 0, ejected: 0 } };
  const [w, e, n, s] = P23_LIGHT_PHOTO.shadowFringe, [lo, hi] = P23_LIGHT_PHOTO.shadowHeight;
  const prism = new THREE.Box3(new THREE.Vector3(-w - 40, lo - 40, -n - 40),
    new THREE.Vector3(extent.x + e + 40, hi + 40, extent.z + s + 40));
  const classified = new WeakSet(), positions = new WeakMap();
  const box = new THREE.Box3(), centre = new THREE.Vector3(), buckets = new Map(), materials = new Map();
  const limit = Math.max(3, Math.floor(Math.min(65535, maxVerts) / 3) * 3);
  for (const mesh of batch.casters) {
    if (!eligible(mesh, scene)) continue;
    if (mesh.isInstancedMesh) { mesh.computeBoundingBox(); box.copy(mesh.boundingBox); }
    else { mesh.geometry.computeBoundingBox(); box.copy(mesh.geometry.boundingBox); }
    box.applyMatrix4(mesh.matrixWorld);
    if (!prism.intersectsBox(box)) continue;
    box.getCenter(centre);
    const g = mesh.geometry, start = g.drawRange.start;
    const end = Math.min(g.index?.count ?? g.attributes.position.count, start + g.drawRange.count);
    const count = Math.floor((end - start) / 3) * 3;
    if (!count) continue;
    const side = mesh.material.shadowSide ?? mesh.material.side;
    // Explicit shadowSide bypasses Three's default Front/Back shadow-side reversal.
    const shadowSide = mesh.material.shadowSide;
    // Keep near-only contact casters out of the far cascade after merging.
    classifyPhotoCaster(mesh, classified, farTiny);
    const tiny = farTiny.has(mesh), sideKey = `${side}:${shadowSide}`;
    const key = `${Math.floor(centre.x / tileM)}:${Math.floor(centre.z / tileM)}:${sideKey}:${Number(tiny)}`;
    const rec = { mesh, geometry: g, slices: [], matrix: new Float64Array(16),
      instances: mesh.isInstancedMesh ? new Float32Array(mesh.instanceMatrix.array.length) : null,
      history: new Uint8Array(120), bursts: 0, streak: 0, lastChanged: false, ejected: false };
    snapshot(rec, scene);
    proxy.sources.push(rec);
    if (!positions.has(g)) positions.set(g, positionRepresentatives(g));
    const representatives = positions.get(g);
    const capacity = mesh.isInstancedMesh ? mesh.instanceMatrix.count : 1;
    for (let instance = 0; instance < capacity; instance++) {
      let chunk = buckets.get(key), slice = null;
      const mapped = new Map(); // build-only integer vertex indices, never float keys
      for (let from = start; from < start + count; from += 3) {
        const ids = [0, 1, 2].map(k => representatives[g.index ? g.index.getX(from + k) : from + k]);
        const added = new Set(ids.filter(id => !mapped.has(id))).size;
        if (!chunk || chunk.used + added > limit) {
          chunk = { key, sideKey, side, shadowSide, tiny, used: 0, slices: [], indices: [] };
          buckets.set(key, chunk); proxy.chunks.push(chunk); slice = null; mapped.clear();
        }
        if (!slice) {
          slice = { chunk, vertices: [], instance, offset: chunk.used,
            indexStart: chunk.indices.length, indexCount: 0, flipped: false };
          rec.slices.push(slice); chunk.slices.push(slice);
        }
        for (const id of ids) {
          if (!mapped.has(id)) { mapped.set(id, chunk.used++); slice.vertices.push(id); }
          chunk.indices.push(mapped.get(id));
        }
        slice.indexCount += 3;
      }
    }
  }

  for (let i = 0; i < proxy.chunks.length; i++) {
    const draft = proxy.chunks[i], geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(draft.used * 3), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(draft.indices), 1));
    // Mesh's default unlit material is owned once per side class, then shared.
    const chunk = new THREE.Mesh(geometry, materials.get(draft.sideKey));
    if (!materials.has(draft.sideKey)) {
      chunk.material.side = draft.side; chunk.material.shadowSide = draft.shadowSide;
      materials.set(draft.sideKey, chunk.material); proxy.materials.push(chunk.material);
    }
    chunk.name = `p09:shadow-proxy:${draft.key}:${i}`;
    if (draft.tiny) farTiny.add(chunk);
    chunk.layers.set(layer); chunk.castShadow = true; chunk.receiveShadow = false;
    chunk.matrixAutoUpdate = false;
    // Flat CPU bounds cannot cull the shader's curved-world silhouettes.
    Object.defineProperty(chunk, 'frustumCulled', {
      get: () => WORLD_CURVE_STATE.uWorldCurve.value === 0,
    });
    for (const slice of draft.slices) {
      slice.chunk = chunk; slice.vertices = new Uint32Array(slice.vertices);
      proxy.stats.bytes += slice.vertices.byteLength;
    }
    proxy.chunks[i] = chunk; root.add(chunk);
    proxy.stats.tris += draft.indices.length / 3;
    proxy.stats.bytes += geometry.attributes.position.array.byteLength + geometry.index.array.byteLength;
  }
  const selected = new Set();
  for (const rec of proxy.sources) {
    rewrite(proxy, rec); rec.mesh.castShadow = false; selected.add(rec.mesh);
    proxy.stats.bytes += rec.matrix.byteLength + rec.history.byteLength + (rec.instances?.byteLength ?? 0);
  }
  batch.casters = batch.casters.filter(mesh => !selected.has(mesh));
  batch.casters.push(...proxy.chunks);
  proxy.stats.sources = proxy.sources.length; proxy.stats.chunks = proxy.chunks.length;
  scene.add(root); root.updateMatrixWorld(true); refreshBounds(proxy);
  // This Three version tests caster layers against the render camera, not
  // the cascade camera. A reusable view admits proxies only in the depth pass;
  // the main camera's layers stay untouched, including during reflections.
  if (renderer) {
    const shadowMap = renderer.shadowMap, previous = shadowMap.render;
    const renderDiet = graphDiet ? shadowGraphDiet() : null;
    const cameraView = { layers: new THREE.Layers() };
    let renderingDiet = false;
    proxy.shadowMap = shadowMap; proxy.previousShadowRender = previous;
    // renderer.render calls shadowMap.render for every scene in the frame
    // (world, reflection, foliage mask, and each post quad). Three's
    // WebGLShadowMap.render returns before drawing when enabled is false, or
    // when autoUpdate and needsUpdate are both false — the second world render
    // of a frame, after the first pass clears needsUpdate. Sync and the
    // 120-slot history run only for this scene and only on a pass three will
    // draw. Undefined flags are not false, matching that early return.
    // Every other call delegates unchanged.
    proxy.shadowRender = function(lights, world, camera) {
      if (world !== proxy.scene) return previous.call(this, lights, world, camera);
      // A nested shadow callback must not sync sources against the outer
      // pass's temporary visibility, or restore that pass's hidden roots.
      if (renderingDiet) return previous.call(this, lights, world, cameraView);
      const draws = this.enabled !== false && !(this.autoUpdate === false && this.needsUpdate === false);
      if (draws) syncStaticShadowProxy(proxy);
      Object.setPrototypeOf(cameraView, camera);
      cameraView.layers.mask = camera.layers.mask | (1 << layer);
      if (draws && renderDiet) {
        renderingDiet = true;
        try { return renderDiet(this, previous, lights, world, cameraView); }
        finally { renderingDiet = false; }
      }
      return previous.call(this, lights, world, cameraView);
    };
    shadowMap.render = proxy.shadowRender;
  }
  scene.userData.staticShadowProxy = proxy;
  return proxy;
}

export function syncStaticShadowProxy(proxy) {
  if (!proxy || proxy.disposed) return;
  if (proxy.photoCSM) for (const light of proxy.photoCSM.lights) {
    installShadowLod(light); light.shadow.camera.layers.enable(proxy.layer);
  }
  const slot = proxy.frame++ % 120;
  for (const rec of proxy.sources) {
    if (rec.ejected) continue;
    const mesh = rec.mesh;
    let changed = visible(mesh, proxy.scene) !== rec.visible || (mesh.isInstancedMesh ? mesh.count : 1) !== rec.count;
    for (let i = 0; i < 16; i++) if (mesh.matrixWorld.elements[i] !== rec.matrix[i]) changed = true;
    if (rec.instances && mesh.instanceMatrix.version !== rec.version) {
      for (let i = 0; i < rec.instances.length; i++) if (rec.instances[i] !== mesh.instanceMatrix.array[i]) { changed = true; break; }
      rec.version = mesh.instanceMatrix.version;
    }
    // One world-scene shadow render consumes one ring slot. A single board
    // lean is one burst inside that 120-render window. A source that changes
    // on every world-scene shadow render still leaves after 120.
    rec.bursts -= rec.history[slot];
    rec.history[slot] = changed && !rec.lastChanged ? 1 : 0;
    rec.bursts += rec.history[slot]; rec.streak = changed ? rec.streak + 1 : 0; rec.lastChanged = changed;
    if (!changed) continue;
    snapshot(rec, proxy.scene);
    if (rec.bursts > 4 || rec.streak >= 120) {
      rec.ejected = true; rec.mesh.castShadow = true;
      proxy.batch.casters.push(rec.mesh); proxy.stats.ejected++;
    }
    rewrite(proxy, rec, rec.ejected); proxy.stats.rewrites++;
  }
  refreshBounds(proxy);
}

export function disposeStaticShadowProxy(proxy) {
  if (!proxy || proxy.disposed) return;
  proxy.disposed = true;
  if (proxy.shadowMap && proxy.shadowMap.render === proxy.shadowRender) proxy.shadowMap.render = proxy.previousShadowRender;
  const chunks = new Set(proxy.chunks);
  proxy.batch.casters = proxy.batch.casters.filter(mesh => !chunks.has(mesh));
  for (const rec of proxy.sources) if (!rec.ejected) {
    rec.mesh.castShadow = true; proxy.batch.casters.push(rec.mesh);
  }
  proxy.root.removeFromParent();
  for (const chunk of proxy.chunks) chunk.geometry.dispose();
  for (const material of proxy.materials) material.dispose();
  proxy.root.clear(); proxy.sources.length = 0; proxy.chunks.length = 0; proxy.materials.length = 0;
  proxy.shadowMap = null; proxy.shadowRender = null; proxy.previousShadowRender = null;
  if (proxy.scene.userData.staticShadowProxy === proxy) proxy.scene.userData.staticShadowProxy = null;
}
