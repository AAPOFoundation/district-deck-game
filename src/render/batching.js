// P19 X1B — scene-level batching. Runs after the city graph is built.
// InstancedMesh for repeated geom+material, mergeGeometries-style world-bake for
// leftover static by material, a name registry so getObjectByName still resolves,
// shadow-caster size/distance cull, matrix freeze. Deterministic.

import * as THREE from 'three';
import { isFixedShipyardStructure, fixedShipyardMotionName } from './fixed-port-batching.js';
import { disposeSceneLod, prepareSceneLod } from './lod.js';

export const SHADOW_CASTER_MIN_M = 1.5;
export const SHADOW_CASTER_RANGE_M = 160;
export const LIFE_TICK_HZ = 20;
export const POST_INTERNAL_MAX_W = 1920;
export const POST_INTERNAL_MAX_H = 1080;
export const MIN_INSTANCE_COUNT = 8;
export const MIN_MERGE_COUNT = 2;
export const MERGE_VERT_CHUNK = 240000;

const DYNAMIC_ROOT = /^(v303:people|v303:auction-crowd|v310:traffic|v310:ambient-life|v310:city-services|world-deliveries|military-units|military-attacks|vfx|weather|mischief|nature:coast-spray|nature:water:reflection|v311:buses|v311:traffic)/;
const MOVE_NAME = /ship|barge|tug|boat|vessel|tanker|craft|hoist|trolley|spreader|^fringe:port-(?:dredger|pilot|launch|tender|punt|runner|lighter)(?::|$)/;
const SKIP_ANCESTOR = /^(succession:|opening:|site-works:|pick$)/;

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _color = new THREE.Color();

// Interactive groups keep the static draw calls. Only visibility transitions
// upload their instance matrix or triangle range; intact targets cost no tick work.
function visibilityOwner(mesh) {
  for (let p = mesh; p; p = p.parent) {
    if (p.userData?.mischiefBatchOwner) return p;
  }
  return null;
}

export function setBatchedVisibility(group, visible) {
  if (group.userData.mischiefBatchVisible === visible) return;
  group.userData.mischiefBatchVisible = visible;
  for (const write of group.userData.mischiefBatchWrites ?? []) write(visible);
}

function bindVisibility(owner, write) {
  if (!owner) return;
  (owner.userData.mischiefBatchWrites ??= []).push(write);
  if (owner.userData.mischiefBatchVisible === false) write(false);
}

export function capInternalSize(cssW, cssH, dpr, maxW = POST_INTERNAL_MAX_W, maxH = POST_INTERNAL_MAX_H) {
  const bufW = Math.max(1, cssW * dpr);
  const bufH = Math.max(1, cssH * dpr);
  const scale = Math.min(1, maxW / bufW, maxH / bufH);
  return [Math.max(1, Math.round(bufW * scale)), Math.max(1, Math.round(bufH * scale))];
}

export function findNamed(root, name) {
  if (!root || !name) return null;
  let node = root;
  while (node) {
    const map = node.userData?.mergedNameRegistry;
    if (map?.has(name)) return map.get(name);
    node = node.parent;
  }
  return root.getObjectByName?.(name) ?? null;
}

function q4(v) {
  return Math.round((Number(v) || 0) * 10000) / 10000;
}

function q12(v) {
  return Math.round(Math.min(1, Math.max(0, Number(v) || 0)) * 12);
}

function isShaderMat(mat) {
  return Boolean(mat && (mat.isShaderMaterial || mat.isRawShaderMaterial));
}

function firstMaterial(mesh) {
  const mat = mesh.material;
  if (Array.isArray(mat)) return mat[0] ?? null;
  return mat ?? null;
}

function geometryFingerprint(geometry) {
  if (!geometry) return '';
  const p = geometry.parameters;
  // Only parameterized primitives share a fingerprint. Hashed BufferGeometry
  // collisions instanced warehouse slabs onto crane transforms.
  if (p && typeof geometry.type === 'string' && /^(Box|Sphere|Cylinder|Plane|Circle|Cone|Torus|Ring)Geometry$/.test(geometry.type)) {
    const keys = Object.keys(p).sort();
    let s = geometry.type;
    for (const k of keys) {
      const v = p[k];
      s += `:${k}=${typeof v === 'number' ? q4(v) : String(v)}`;
    }
    return s;
  }
  return `uuid:${geometry.uuid}`;
}

function materialFingerprint(mat, { ignoreColor = false } = {}) {
  if (!mat) return '';
  const c = mat.color;
  const e = mat.emissive;
  const surfaceKey = mat.userData?.surfaceRole ? mat.customProgramCacheKey?.() ?? '' : '';
  const restyled = surfaceKey.includes('|p16-surface-v1:');
  return [
    restyled ? mat.userData.surfaceRole : '',
    restyled ? surfaceKey : '',
    mat.type,
    mat.map?.uuid ?? '',
    mat.normalMap?.uuid ?? '',
    mat.roughnessMap?.uuid ?? '',
    mat.metalnessMap?.uuid ?? '',
    mat.alphaMap?.uuid ?? '',
    mat.aoMap?.uuid ?? '',
    mat.emissiveMap?.uuid ?? '',
    // Tagged restyles retain shader ownership and colour; avoid hookless tint clones.
    ignoreColor && !restyled ? '' : (c ? `${q12(c.r)},${q12(c.g)},${q12(c.b)}` : ''),
    // style W1 (L3): a material the style rules moved is grouped by the roughness and metalness it was authored with, so the
    // switch changes what the bake draws and never how it groups (materials the rules bring to one value are not merged).
    q4(mat.userData?.styleRules?.roughness ?? mat.roughness),
    q4(mat.userData?.styleRules?.metalness ?? mat.metalness),
    // ... and a material the rules left alone because a mesh's name says glass or water stays apart from a same-looking material they ruled
    // (the name is not in the fingerprint, and the bake keeps the first material of a fingerprint it meets).
    mat.userData?.styleSurface ?? '',
    q4(mat.opacity),
    mat.transparent ? 1 : 0,
    mat.side ?? 0,
    mat.vertexColors ? 1 : 0,
    q4(mat.alphaTest),
    mat.blending ?? 0,
    mat.depthWrite === false ? 0 : 1,
    mat.depthTest === false ? 0 : 1,
    e ? `${q4(e.r)},${q4(e.g)},${q4(e.b)},${q4(mat.emissiveIntensity)}` : '',
    mat.flatShading ? 1 : 0,
    mat.wireframe ? 1 : 0,
    mat.premultipliedAlpha ? 1 : 0,
    // Port roof hooks own local perimeter uniforms; preserve the material identity.
    mat.userData?.portMatRoof ? `port-roof:${mat.uuid}` : '',
    // taste-r1 (W20-C): a turf that carries the venue join (grain, worn edge) is a shader of its own; a hookless
    // material of the same quantised colour must not replace it.
    mat.userData?.venueGround?.join ? `venue-join:${mat.uuid}` : '',
  ].join('|');
}

function worldSizeM(mesh) {
  const g = mesh.geometry;
  if (!g) return 0;
  if (!g.boundingSphere) g.computeBoundingSphere();
  const r = g.boundingSphere?.radius ?? 0;
  const e = mesh.matrixWorld.elements;
  const sx = Math.hypot(e[0], e[1], e[2]);
  const sy = Math.hypot(e[4], e[5], e[6]);
  const sz = Math.hypot(e[8], e[9], e[10]);
  return r * 2 * Math.max(sx, sy, sz);
}

function isDynamicMesh(mesh) {
  if (!mesh?.isMesh) return true;
  if (mesh.isSkinnedMesh || mesh.isInstancedMesh) return true;
  const mat = firstMaterial(mesh);
  if (!mat || isShaderMat(mat)) return true;
  if (mat.visible === false) return true;
  if (mesh.morphTargetInfluences?.length) return true;
  if (mesh.layers && (mesh.layers.mask & 1) === 0) return true;
  return hasDynamicAncestry(mesh);
}

// Shared by the depth-only proxy, which also admits static InstancedMeshes.
export function hasDynamicAncestry(mesh, includeFigures = false) {
  const fixedShipyard = isFixedShipyardStructure(mesh);
  for (let p = mesh; p; p = p.parent) {
    const n = typeof p.name === 'string' ? p.name : '';
    if (includeFigures && p.userData?.p17Figure) return true;
    if (p.userData?.mischiefLive || p.userData?.oceanBuoyancy) return true;
    if (DYNAMIC_ROOT.test(n) || SKIP_ANCESTOR.test(n) || MOVE_NAME.test(fixedShipyard ? fixedShipyardMotionName(n) : n)) return true;
  }
  return false;
}

function collectMeshes(scene) {
  const list = [];
  scene.traverse((o) => {
    if (o.isMesh) list.push(o);
  });
  return list;
}

function demoteToStub(mesh, retired) {
  const parent = mesh.parent;
  if (!parent) return mesh;
  if (retired && mesh.geometry) retired.push(mesh.geometry);
  // Anonymous leaves have no lookup identity or children to preserve. Their
  // geometry is already in a batch; an empty replacement would still burden
  // scene projection, shadow traversal and matrix propagation every frame.
  if (!mesh.name && mesh.children.length === 0) {
    parent.remove(mesh);
    return mesh;
  }
  const stub = new THREE.Object3D();
  stub.name = mesh.name;
  stub.userData = mesh.userData;
  stub.position.copy(mesh.position);
  stub.quaternion.copy(mesh.quaternion);
  stub.scale.copy(mesh.scale);
  stub.matrix.copy(mesh.matrix);
  stub.matrixWorld.copy(mesh.matrixWorld);
  stub.matrixAutoUpdate = false;
  stub.matrixWorldAutoUpdate = false;
  stub.visible = mesh.visible;
  stub.renderOrder = mesh.renderOrder;
  stub.layers.mask = mesh.layers.mask;
  const kids = mesh.children.slice();
  const index = parent.children.indexOf(mesh);
  parent.remove(mesh);
  for (const child of kids) stub.add(child);
  parent.add(stub);
  const arr = parent.children;
  const at = arr.indexOf(stub);
  if (at !== index && index >= 0) {
    arr.splice(at, 1);
    arr.splice(Math.min(index, arr.length), 0, stub);
  }
  return stub;
}

function registerName(registry, name, object, mergedInto) {
  if (!name) return;
  object.userData.mergedInto = mergedInto ?? null;
  if (!registry.has(name)) registry.set(name, object);
}

function instanceKey(mesh, { ignoreColor = false } = {}) {
  const mat = firstMaterial(mesh);
  return [
    geometryFingerprint(mesh.geometry),
    materialFingerprint(mat, { ignoreColor }),
    mesh.castShadow ? 1 : 0,
    mesh.receiveShadow ? 1 : 0,
    mesh.renderOrder | 0,
    mat.transparent ? 1 : 0,
    mat.side ?? 0,
    mat.blending ?? 0,
    mat.depthWrite === false ? 0 : 1,
  ].join('||');
}

function setInstanceBounds(mesh) {
  if (typeof mesh.computeBoundingSphere === 'function') mesh.computeBoundingSphere();
  if (typeof mesh.computeBoundingBox === 'function') mesh.computeBoundingBox();
}

function instanceBucket(batch, meshes, material, { useInstanceColor }) {
  if (meshes.length < MIN_INSTANCE_COUNT) return 0;
  const geom = meshes[0].geometry;
  let mat = material;
  if (useInstanceColor) {
    mat = material.clone();
    mat.color.setRGB(1, 1, 1);
    batch.ownedMaterials.push(mat);
  }
  const inst = new THREE.InstancedMesh(geom, mat, meshes.length);
  inst.name = `batch:instanced:${batch.instanced.length}`;
  inst.matrixAutoUpdate = false;
  inst.matrixWorldAutoUpdate = false;
  inst.frustumCulled = true;
  inst.castShadow = meshes.some((m) => m.castShadow);
  inst.receiveShadow = meshes.some((m) => m.receiveShadow);
  inst.renderOrder = meshes[0].renderOrder;
  inst.layers.mask = meshes[0].layers.mask;
  const names = [];
  for (let i = 0; i < meshes.length; i += 1) {
    const src = meshes[i];
    inst.setMatrixAt(i, src.matrixWorld);
    if (useInstanceColor) {
      const c = firstMaterial(src)?.color;
      _color.copy(c ?? mat.color);
      inst.setColorAt(i, _color);
    }
    if (src.name) names.push(src.name);
    const owner = visibilityOwner(src);
    if (owner) {
      const base = src.matrixWorld.clone();
      const hidden = base.clone().multiply(new THREE.Matrix4().makeScale(0, 0, 0));
      bindVisibility(owner, (visible) => {
        inst.setMatrixAt(i, visible ? base : hidden);
        inst.instanceMatrix.addUpdateRange(i * 16, 16);
        inst.instanceMatrix.needsUpdate = true;
      });
    }
    const stub = demoteToStub(src, batch.retiredGeometries);
    registerName(batch.registry, src.name, stub, inst);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.userData.mergedNames = names;
  inst.userData.batchStatic = true;
  setInstanceBounds(inst);
  inst.updateMatrix();
  inst.updateMatrixWorld(true);
  batch.root.add(inst);
  batch.instanced.push(inst);
  return meshes.length;
}

function mergeBatch(batch, meshes, material) {
  if (meshes.length < MIN_MERGE_COUNT) return 0;
  let verts = 0;
  const usable = [];
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const pos = g?.attributes?.position;
    if (!pos) continue;
    const n = g.index ? g.index.count : pos.count;
    if (n <= 0 || n > MERGE_VERT_CHUNK) continue;
    usable.push(mesh);
    verts += n;
  }
  if (usable.length < MIN_MERGE_COUNT) return 0;
  let wrote = 0;
  let start = 0;
  while (start < usable.length) {
    let count = 0;
    let v = 0;
    let end = start;
    while (end < usable.length) {
      const g = usable[end].geometry;
      const n = g.index ? g.index.count : g.attributes.position.count;
      if (v + n > MERGE_VERT_CHUNK && count >= MIN_MERGE_COUNT) break;
      v += n;
      count += 1;
      end += 1;
    }
    const slice = usable.slice(start, end);
    start = end;
    if (slice.length < MIN_MERGE_COUNT) continue;
    wrote += mergeSlice(batch, slice, material, v);
  }
  return wrote;
}

function mergeSlice(batch, meshes, material, verts) {
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const uvs = new Float32Array(verts * 2);
  // P22 orchestrator (2026-09-07): the bake dropped every source's `color` attribute while the batch material kept
  // `vertexColors: true`, so vertex-coloured sources (the I4 beach / venue figures) baked to black. Carry the colours,
  // white where a source has none.
  const col = material?.vertexColors ? new Float32Array(verts * 3) : null;
  let w = 0;
  const names = [];
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const P = g.attributes.position;
    const N = g.attributes.normal;
    const U = g.attributes.uv;
    const C = col ? g.attributes.color : null;
    const idx = g.index;
    const count = idx ? idx.count : P.count;
    _nm.getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i < count; i += 1) {
      const k = idx ? idx.getX(i) : i;
      _v.fromBufferAttribute(P, k).applyMatrix4(mesh.matrixWorld);
      pos[w * 3] = _v.x;
      pos[w * 3 + 1] = _v.y;
      pos[w * 3 + 2] = _v.z;
      if (N) {
        _n.fromBufferAttribute(N, k).applyMatrix3(_nm).normalize();
      } else {
        _n.set(0, 1, 0);
      }
      nor[w * 3] = _n.x;
      nor[w * 3 + 1] = _n.y;
      nor[w * 3 + 2] = _n.z;
      uvs[w * 2] = U ? U.getX(k) : 0;
      uvs[w * 2 + 1] = U ? U.getY(k) : 0;
      if (col) {
        col[w * 3] = C ? C.getX(k) : 1;
        col[w * 3 + 1] = C ? C.getY(k) : 1;
        col[w * 3 + 2] = C ? C.getZ(k) : 1;
      }
      w += 1;
    }
    if (mesh.name) names.push(mesh.name);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (col) geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geom.computeBoundingSphere();
  geom.computeBoundingBox();
  const merged = new THREE.Mesh(geom, material);
  merged.name = `batch:merged:${batch.merged.length}`;
  merged.matrixAutoUpdate = false;
  merged.matrixWorldAutoUpdate = false;
  merged.frustumCulled = true;
  merged.castShadow = meshes.some((m) => m.castShadow);
  merged.receiveShadow = meshes.some((m) => m.receiveShadow);
  merged.renderOrder = meshes[0].renderOrder;
  merged.layers.mask = meshes[0].layers.mask;
  merged.userData.mergedNames = names;
  merged.userData.batchStatic = true;
  merged.updateMatrix();
  merged.updateMatrixWorld(true);
  batch.root.add(merged);
  batch.merged.push(merged);
  batch.ownedGeometries.push(geom);
  let offset = 0;
  for (const mesh of meshes) {
    const count = mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count;
    const owner = visibilityOwner(mesh);
    if (owner) {
      // Degenerate only this source's triangles. Opaque colour and shadow passes
      // consume the same index buffer, so there is no translucent residue.
      if (!geom.index) geom.setIndex(new THREE.BufferAttribute(Uint32Array.from({ length: verts }, (_, i) => i), 1));
      const start = offset;
      merged.userData.indexVisibility = true;
      bindVisibility(owner, (visible) => {
        const index = geom.index;
        for (let i = start; i < start + count; i += 1) index.array[i] = visible ? i : start;
        index.addUpdateRange(start, count);
        index.needsUpdate = true;
      });
    }
    offset += count;
    const stub = demoteToStub(mesh, batch.retiredGeometries);
    registerName(batch.registry, mesh.name, stub, merged);
  }
  return meshes.length;
}

export function dedupeMaterials(meshes) {
  const canon = new Map();
  let replaced = 0;
  for (const mesh of meshes) {
    // Marked static multi-group owners canonicalize only their held first slot.
    const materialGroups = Array.isArray(mesh.material);
    if (materialGroups && !mesh.userData.preserveMaterialGroups) continue;
    const mat = materialGroups ? mesh.material[0] : mesh.material;
    if (!mat || isShaderMat(mat)) continue;
    const key = materialFingerprint(mat);
    const hit = canon.get(key);
    if (!hit) {
      canon.set(key, mat);
      continue;
    }
    if (hit !== mat) {
      if (materialGroups) mesh.material[0] = hit;
      else mesh.material = hit;
      replaced += 1;
    }
  }
  return { unique: canon.size, replaced };
}

export function applyShadowSizeCull(meshes) {
  let culled = 0;
  for (const mesh of meshes) {
    if (!mesh.castShadow) continue;
    let size = 0;
    if (mesh.isInstancedMesh) {
      const g = mesh.geometry;
      if (g && !g.boundingSphere) g.computeBoundingSphere();
      size = (g?.boundingSphere?.radius ?? 0) * 2;
    } else {
      size = worldSizeM(mesh);
    }
    mesh.userData.shadowSizeM = size;
    if (size < SHADOW_CASTER_MIN_M) {
      mesh.castShadow = false;
      mesh.userData.shadowCulledSize = true;
      culled += 1;
    }
  }
  return culled;
}

export function applyShadowCasterBudget(scene, camera, _target, state) {
  if (!state?.casters || !camera) return;
  const cx = camera.position.x;
  const cy = camera.position.y;
  const cz = camera.position.z;
  const range = SHADOW_CASTER_RANGE_M;
  const list = state.casters;
  for (let i = 0; i < list.length; i += 1) {
    const mesh = list[i];
    if (!mesh || mesh.userData.shadowCulledSize) {
      if (mesh) {
        mesh.castShadow = false;
        if (mesh.userData.shadowMesh) mesh.userData.shadowMesh.castShadow = false;
      }
      continue;
    }
    const e = mesh.matrixWorld.elements;
    const dx = e[12] - cx;
    const dy = e[13] - cy;
    const dz = e[14] - cz;
    let r = 0;
    const bs = mesh.boundingSphere ?? mesh.geometry?.boundingSphere;
    if (bs) {
      const sx = Math.hypot(e[0], e[1], e[2]);
      r = (bs.radius + (bs.center?.length?.() ?? 0)) * sx;
    }
    const lim = range + r;
    const inRange = (dx * dx + dy * dy + dz * dz) <= lim * lim;
    if (mesh.userData.shadowMovedToLod) {
      mesh.castShadow = false;
      if (mesh.userData.shadowMesh) mesh.userData.shadowMesh.castShadow = inRange;
    } else {
      mesh.castShadow = inRange;
    }
  }
}

export function freezeStaticMatrices(scene) {
  scene.traverse((o) => {
    if (o.isLight || o.isCamera) return;
    if (o.userData?.batchStatic) {
      o.matrixAutoUpdate = false;
      o.matrixWorldAutoUpdate = false;
      return;
    }
    if (o.isInstancedMesh) {
      o.matrixAutoUpdate = false;
      return;
    }
    if (o.isMesh && !isDynamicMesh(o)) {
      o.matrixAutoUpdate = false;
      o.matrixWorldAutoUpdate = false;
    }
  });
}

export function censusScene(scene) {
  const rows = new Map();
  const bump = (key, mesh, tris, staticWorld) => {
    let row = rows.get(key);
    if (!row) {
      row = {
        prefix: key, meshes: 0, instanced: 0, tris: 0, materials: new Set(),
        castShadow: 0, static: 0, dynamic: 0,
      };
      rows.set(key, row);
    }
    row.meshes += 1;
    if (mesh.isInstancedMesh) row.instanced += 1;
    row.tris += tris;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) if (m) row.materials.add(m.uuid);
    if (mesh.castShadow) row.castShadow += 1;
    if (staticWorld) row.static += 1;
    else row.dynamic += 1;
  };
  let meshes = 0;
  let instanced = 0;
  let casters = 0;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    meshes += 1;
    if (o.isInstancedMesh) instanced += 1;
    if (o.castShadow) casters += 1;
    const g = o.geometry;
    const pos = g?.attributes?.position;
    const idx = g?.index;
    const base = idx ? idx.count / 3 : (pos ? pos.count / 3 : 0);
    const tris = Math.round(base * (o.isInstancedMesh ? (o.count || 1) : 1));
    const staticWorld = !isDynamicMesh(o) && !o.isInstancedMesh;
    const name = o.name || '';
    const colon = name.indexOf(':');
    const prefix = !name ? '(unnamed)' : (colon > 0 ? name.slice(0, colon) : name.slice(0, 24));
    bump(prefix, o, tris, staticWorld);
  });
  return {
    meshes,
    instanced,
    casters,
    prefixes: [...rows.values()]
      .map((r) => ({
        prefix: r.prefix,
        meshes: r.meshes,
        instanced: r.instanced,
        tris: Math.round(r.tris),
        materials: r.materials.size,
        castShadow: r.castShadow,
        static: r.static,
        dynamic: r.dynamic,
      }))
      .sort((a, b) => b.meshes - a.meshes),
  };
}

/**
 * Batch the static world in place. Idempotent. Original names survive as
 * Object3D stubs plus `userData.mergedNames` on the replacement mesh.
 */
export function batchStaticWorld(scene, { quality = 'high' } = {}) {
  if (scene.userData.batching) return scene.userData.batching;
  scene.updateMatrixWorld(true);

  const root = new THREE.Group();
  root.name = 'batch:static';
  root.matrixAutoUpdate = false;
  root.matrixWorldAutoUpdate = false;
  scene.add(root);

  const registry = new Map();
  scene.userData.mergedNameRegistry = registry;
  const batch = {
    root,
    registry,
    instanced: [],
    merged: [],
    ownedGeometries: [],
    ownedMaterials: [],
    retiredGeometries: [],
    casters: [],
    stats: {
      inputMeshes: 0,
      instancedFrom: 0,
      mergedFrom: 0,
      instancedMeshes: 0,
      mergedMeshes: 0,
      materialsBefore: 0,
      materialsAfter: 0,
      materialsReplaced: 0,
      sizeCulled: 0,
      skippedDynamic: 0,
      skippedMaterialGroups: 0,
      quality,
    },
  };

  const all = collectMeshes(scene);
  batch.stats.inputMeshes = all.length;

  const staticMeshes = [];
  for (const mesh of all) {
    if (mesh.parent === root) continue;
    if (mesh.isInstancedMesh) {
      batch.stats.skippedDynamic += 1;
      continue;
    }
    if (isDynamicMesh(mesh)) {
      batch.stats.skippedDynamic += 1;
      continue;
    }
    // World batches leave the source hierarchy, so preserve inherited visibility
    // and keep visibility-controlled branches live for later venue changes.
    let hidden = false;
    let dynamicVisibility = false;
    for (let p = mesh; p; p = p.parent) {
      hidden ||= !p.visible;
      dynamicVisibility ||= p.userData?.dynamicVisibility === true;
    }
    if (dynamicVisibility) {
      batch.stats.skippedDynamic += 1;
      continue;
    }
    if (hidden) {
      batch.stats.skippedHidden = (batch.stats.skippedHidden ?? 0) + 1;
      continue;
    }
    if (!mesh.geometry?.attributes?.position) continue;
    staticMeshes.push(mesh);
  }
  batch.stats.staticCollected = staticMeshes.length;

  batch.stats.sizeCulled = applyShadowSizeCull(staticMeshes);
  batch.stats.sizeCulled += applyShadowSizeCull(all.filter((m) => m.isInstancedMesh));
  const deduped = dedupeMaterials(staticMeshes);
  batch.stats.materialsBefore = deduped.unique + deduped.replaced;
  batch.stats.materialsAfter = deduped.unique;
  batch.stats.materialsReplaced = deduped.replaced;

  const colorGroups = new Map();
  for (const mesh of staticMeshes) {
    // Static, authored material groups must survive; no gameplay-dynamic marker.
    if (mesh.userData.preserveMaterialGroups) {
      batch.stats.skippedMaterialGroups += 1;
      continue;
    }
    const key = instanceKey(mesh, { ignoreColor: true });
    const list = colorGroups.get(key) ?? [];
    list.push(mesh);
    colorGroups.set(key, list);
  }

  const leftover = [];
  for (const group of colorGroups.values()) {
    if (group.length < MIN_INSTANCE_COUNT) {
      leftover.push(...group);
      continue;
    }
    const colors = new Set();
    for (const mesh of group) {
      const c = firstMaterial(mesh)?.color;
      colors.add(c ? `${q4(c.r)},${q4(c.g)},${q4(c.b)}` : '');
    }
    const used = instanceBucket(batch, group, firstMaterial(group[0]), {
      useInstanceColor: colors.size > 1,
    });
    if (used) batch.stats.instancedFrom += used;
    else leftover.push(...group);
  }

  const mergeGroups = new Map();
  for (const mesh of leftover) {
    if (!mesh.parent) continue;
    const mat = firstMaterial(mesh);
    // The roof edge shader reads local coordinates; a world bake would move them.
    if (mat.userData?.portMatRoof) continue;
    // Only world-bake small props. Large kit/port forms stay as themselves —
    // baking a scaled shed/crane into a merged buffer produced city-sized slabs.
    if (worldSizeM(mesh) > 6) continue;
    const key = [
      materialFingerprint(mat),
      mesh.renderOrder | 0,
      mat.transparent ? 1 : 0,
      mat.side ?? 0,
      mat.blending ?? 0,
    ].join('|');
    const list = mergeGroups.get(key) ?? [];
    list.push(mesh);
    mergeGroups.set(key, list);
  }
  for (const group of mergeGroups.values()) {
    const used = mergeBatch(batch, group, firstMaterial(group[0]));
    batch.stats.mergedFrom += used;
  }

  freezeStaticMatrices(scene);

  // Invisible pick proxies still count as meshes in the budget. Demote them
  // in place; pickTargets hold the Mesh objects themselves.
  const invisible = [];
  scene.traverse((o) => {
    // Moving pick proxies must remain in the graph so their world matrices
    // follow the cars. Invisible material submits no colour/shadow draw call.
    if (o.isMesh && firstMaterial(o)?.visible === false && !o.userData.mischiefKey) invisible.push(o);
  });
  for (const mesh of invisible) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    demoteToStub(mesh, batch.retiredGeometries);
  }

  const casters = [];
  scene.traverse((o) => {
    if (o.isMesh && o.castShadow && !o.userData.shadowCulledSize) casters.push(o);
  });
  casters.sort((a, b) => (b.userData.shadowSizeM || 0) - (a.userData.shadowSizeM || 0));
  const CASTER_CAP = 3000;
  for (let i = CASTER_CAP; i < casters.length; i += 1) {
    casters[i].castShadow = false;
    casters[i].userData.shadowCulledSize = true;
  }
  batch.casters = casters.slice(0, CASTER_CAP);
  batch.stats.instancedMeshes = batch.instanced.length;
  batch.stats.mergedMeshes = batch.merged.length;
  batch.stats.castersKept = casters.length;
  let remainingStatic = 0;
  scene.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh && !isDynamicMesh(o) && o.parent !== root) remainingStatic += 1;
  });
  batch.stats.remainingStatic = remainingStatic;

  const usedGeo = new Set();
  scene.traverse((o) => {
    if (o.isMesh && o.geometry) usedGeo.add(o.geometry.uuid);
  });
  let disposedSources = 0;
  for (const geom of batch.retiredGeometries) {
    if (!geom || usedGeo.has(geom.uuid)) continue;
    geom.dispose();
    disposedSources += 1;
  }
  batch.retiredGeometries.length = 0;
  batch.stats.disposedSourceGeos = disposedSources;

  scene.userData.batching = batch;
  scene.userData.batchingStats = batch.stats;
  const lod = prepareSceneLod(scene, { quality });
  batch.stats.lodTagged = lod.stats.tagged;
  batch.stats.lodSimplified = lod.stats.simplified;
  batch.stats.lodShadows = lod.stats.shadows;
  batch.stats.lodEnabled = Boolean(lod.stats.enabled);
  return batch;
}

export function disposeBatching(scene) {
  const batch = scene.userData.batching;
  if (!batch) return;
  disposeSceneLod(scene);
  scene.remove(batch.root);
  for (const geom of batch.ownedGeometries) geom.dispose();
  for (const mat of batch.ownedMaterials) mat.dispose();
  scene.userData.batching = null;
  scene.userData.mergedNameRegistry = null;
}
