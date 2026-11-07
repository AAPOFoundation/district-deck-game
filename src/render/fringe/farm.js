// Surveyed farms use the registered cottage and compact shed, on the drawn ground.
import * as THREE from 'three';
import { surveyedPaddocks } from '../../core/city.js';
import { assembleHouse } from '../residential/houses/index.js';
import { assembleWarehouseShed } from '../industrial/warehouse-shed.js';
import * as sharedFarmKit from './farm-models.js';
import * as s1FarmKit from './surveyed-farm-kit.js';
import { addBox } from './kit.js';
import { trackKinActive, makeTrackKinMesh, TRACK_PADDOCK_GAIN, TRACK_PADDOCK_TINT, TRACK_KIN_GATEWAY, splitTrackRuns } from './track-form.js';

const fieldUniforms = new Map();
const farmTone = [0.81, 0.2, 0.96, 0.87];
// S1 is not in this checkout yet. Prefer its shared factory after integration;
// the isolated, tested snapshot leaves all hinterland/landscape callers alone.
const farmKit = sharedFarmKit.makeShedMaterial ? sharedFarmKit : s1FarmKit;
const shedMaterials = new WeakMap();

/** Default on; the single zero switch keeps the original warehouse and access. */
export function surveyedFarmActive(search = globalThis.location?.search ?? '') {
  return new URLSearchParams(search).get('surveyedFarm') !== '0';
}

function surveyedShed(materials) {
  let material = shedMaterials.get(materials);
  if (!material) {
    material = farmKit.makeShedMaterial(); shedMaterials.set(materials, material);
    // The library owns the shared material lifetime, as it does the cottage's.
    // This scoped resource has no texture allocation to add to its ledger.
    materials.registerTexturePack({ id: 's3-farm-surface', textureBytes: () => 0,
      dispose() { material.dispose(); shedMaterials.delete(materials); } });
  }
  // Three 4 m bays fit the existing yard; the first bay faces its access strip.
  // Force the kit on here: surveyedFarm alone owns this lane's rollback.
  const geometry = farmKit.makeShedGeometry('machinery-3', { shedGeometry: 1 });
  const tank = farmKit.makeShedGeometry('tank', { shedGeometry: 1 });
  // Beside the rear eave, inside the kept boundary and clear of the shared yard.
  tank.translate(8.2, 0, -2.35);
  return { geometry, tank, material,
    doorX: -geometry.userData.shed.length / 2 + 2, wallFront: geometry.userData.shed.width / 2 };
}

/** One hook on T13's existing tone variable; no extra field surface. */
export function attachFarmFields(material, seed) {
  const uniforms = { value: Array.from({ length: 2 }, () => new THREE.Vector4(0, 0, 0, 0)) };
  if (!fieldUniforms.has(seed)) fieldUniforms.set(seed, new Set());
  fieldUniforms.get(seed).add(uniforms);
  material.addEventListener('dispose', () => fieldUniforms.get(seed)?.delete(uniforms));
  const prior = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    prior.call(material, shader, renderer);
    shader.uniforms.uFarmFields = uniforms;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uFarmFields[2];');
    shader.fragmentShader = shader.fragmentShader.replace('float tone = workedHash(fieldId + vec2(71.0, 43.0));', `float tone = workedHash(fieldId + vec2(71.0, 43.0));
      for (int f = 0; f < 2; f++) if (uFarmFields[f].w > 0.5 && distance(fieldId, uFarmFields[f].xy) < 0.1) tone = uFarmFields[f].z;`);
    // TASTE R1: the phase-3 darkening of a worked-in field now lives in the parcel
    // palette function (`parcelReflectance` in fringe.js), because the paddock edge
    // blends the three nearest parcels and each must carry its own farm state.
  };
  material.customProgramCacheKey = () => `${key}|farm-fields-v2`;
  return material;
}

function groundStrip(group, points, width, material, heightAt, name) {
  const vertices = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d < 1e-6) continue;
    const nx = -(b[1] - a[1]) / d * width / 2, nz = (b[0] - a[0]) / d * width / 2;
    const along = Math.max(1, Math.ceil(d)), across = Math.max(1, Math.ceil(width));
    const point = (u, v) => [a[0] + (b[0] - a[0]) * u + nx * (1 - 2 * v), a[1] + (b[1] - a[1]) * u + nz * (1 - 2 * v)];
    for (let u = 0; u < along; u++) for (let v = 0; v < across; v++) {
      const p = [point(u / along, v / across), point(u / along, (v + 1) / across), point((u + 1) / along, v / across), point((u + 1) / along, (v + 1) / across)];
      for (const k of [0, 2, 1, 1, 2, 3]) vertices.push(p[k][0], heightAt(...p[k]) + .04, p[k][1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.receiveShadow = true; group.add(mesh);
}

function buildingParts(model) {
  // Both register builders publish per-role vertex spans. Remove their urban
  // display lots, garden planting and separate fences; the farm owns one yard.
  return model.parts.flatMap((part) => {
    const features = model.i2.features.filter(f => f.role === part.material.userData.i2Role && !f.lot);
    const count = features.reduce((n, f) => n + f.vertexCount, 0);
    if (!count) { part.geometry.dispose(); return []; }
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(part.geometry.attributes)) {
      const values = new attribute.array.constructor(count * attribute.itemSize); let offset = 0;
      for (const f of features) {
        const span = attribute.array.subarray(f.vertexStart * attribute.itemSize, (f.vertexStart + f.vertexCount) * attribute.itemSize);
        values.set(span, offset); offset += span.length;
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize, attribute.normalized));
    }
    geometry.name = part.geometry.name; part.geometry.dispose();
    return [{ geometry, material: part.material }];
  });
}

export function createFarmModel(parcel, materials, heightAt, roadFootprint = null) {
  const group = new THREE.Group(); group.name = `fringe:farm:${parcel.id}`;
  const { x, z } = parcel.centre;
  const cottage = assembleHouse('cottage-federation', materials, { quality: 'low', facade: 0 });
  const newShed = surveyedFarmActive();
  const shed = newShed ? surveyedShed(materials)
    : assembleWarehouseShed(materials, { quality: 'low', facade: 0, lotSpan: { spanX: 1, spanZ: 1 } }, { footprint: [1, 2], storeys: 1 });
  for (const [model, dx, label] of [[cottage, -9, 'farmhouse'], [shed, 9, 'shed']]) {
    const building = new THREE.Group(); building.name = `farm:${label}`;
    const nativeShed = newShed && label === 'shed';
    building.userData.removedLotTriangles = nativeShed ? 0 : model.i2.features.filter(f => f.lot).reduce((n, f) => n + f.vertexCount / 3, 0);
    const parts = nativeShed ? [
      { geometry: model.geometry, material: model.material, name: 'farm:machinery-shed' },
      { geometry: model.tank, material: model.material, name: 'farm:rainwater-tank' },
    ] : buildingParts(model);
    for (const part of parts) {
      const mesh = new THREE.Mesh(part.geometry, part.material);
      if (part.name) mesh.name = part.name;
      mesh.castShadow = true; mesh.receiveShadow = true; building.add(mesh);
    }
    // Warp each kit's ground datum onto the actual triangles. The kit's existing
    // footing, paths and thresholds therefore meet the same ground as the yard.
    for (const child of building.children) {
      const p = child.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + heightAt(x + dx + p.getX(i), z + p.getZ(i)));
      p.needsUpdate = true; child.geometry.computeVertexNormals(); child.geometry.computeBoundingBox();
      if (nativeShed) child.geometry.computeBoundingSphere();
    }
    building.position.set(x + dx, 0, z); group.add(building);
  }
  const soil = materials.get('concrete', { variant: 'farm-yard', color: '#78674a', roughness: 1, side: THREE.DoubleSide });
  groundStrip(group, [[x - 17, z + 8], [x + 17, z + 8]], 5, soil, heightAt, 'farm:shared-yard');
  const entry = newShed ? shed : shed.i2;
  groundStrip(group, [[x + 9 + entry.doorX, z + entry.wallFront], [x + 9 + entry.doorX, z + 8]], 2.8, soil, heightAt, 'farm:shed-access');
  // taste W33 (TRACK_KIN): the access track in the hinterland's formed-track form, scaled to its 2.8 m (off, the flat strip).
  // taste W35: broken into runs where it meets the airport link's formation, so the ruts do not cross the road. taste W36: and where it lies on
  // the Southern Cross apron's service road (`roadFootprint(x, z)` is the union of the two, from `syncFarms`).
  const kin = TRACK_KIN_GATEWAY && trackKinActive() ? makeTrackKinMesh(
    roadFootprint ? splitTrackRuns(parcel.accessTrack, roadFootprint, { halfWidth: 1.4, yard: true }) : [{ pts: parcel.accessTrack, yard: true }], {
      seed: 0, sampleGround: heightAt, gain: TRACK_PADDOCK_GAIN, tint: TRACK_PADDOCK_TINT, halfWidth: 1.4, lift: 0.04, line0: 21,
    }) : null;
  if (kin) { kin.name = 'farm:gateway-track'; group.add(kin); } else groundStrip(group, parcel.accessTrack, 2.8, soil, heightAt, 'farm:gateway-track');
  const timber = materials.get('timber', { variant: 'farm-boundary', color: '#655e48' });
  for (const [a, b] of [[[x - 20, z - 12], [x + 20, z - 12]], [[x - 20, z - 12], [x - 20, z + 11]], [[x + 20, z - 12], [x + 20, z + 11]], [[x - 20, z + 11], [x - 2, z + 11]], [[x + 2, z + 11], [x + 20, z + 11]]]) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(length / 4);
    for (let i = 0; i <= n; i++) {
      const px = a[0] + (b[0] - a[0]) * i / n, pz = a[1] + (b[1] - a[1]) * i / n;
      addBox(group, .16, 1.1, .16, timber, px, heightAt(px, pz) + .55, pz, { name: 'farm:fence-post' });
      if (i === n) continue;
      const qx = a[0] + (b[0] - a[0]) * (i + 1) / n, qz = a[1] + (b[1] - a[1]) * (i + 1) / n;
      const y0 = heightAt(px, pz), y1 = heightAt(qx, qz);
      for (const h of [.45, .9]) {
        const rail = addBox(group, Math.hypot(length / n, y1 - y0), .09, .09, timber, (px + qx) / 2, (y0 + y1) / 2 + h, (pz + qz) / 2, { name: 'farm:fence-rail' });
        rail.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(qx - px, y1 - y0, qz - pz).normalize());
      }
    }
  }
  return group;
}

export function farmGroundSampler(mesh) {
  mesh.updateWorldMatrix(true, false);
  const p = mesh.geometry.attributes.position, index = mesh.geometry.index;
  const bins = new Map(), count = index?.count ?? p.count, size = 16;
  for (let i = 0; i < count; i += 3) {
    const tri = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld));
    const xs = tri.map(v => v.x), zs = tri.map(v => v.z);
    for (let x = Math.floor(Math.min(...xs) / size); x <= Math.floor(Math.max(...xs) / size); x++) for (let z = Math.floor(Math.min(...zs) / size); z <= Math.floor(Math.max(...zs) / size); z++) {
      const key = `${x},${z}`; if (!bins.has(key)) bins.set(key, []); bins.get(key).push(tri);
    }
  }
  return (x, z) => {
    let height = -Infinity;
    for (const [a, b, c] of bins.get(`${Math.floor(x / size)},${Math.floor(z / size)}`) ?? []) {
      const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(d) < 1e-9) continue;
      const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d;
      const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) height = Math.max(height, u * a.y + v * b.y + (1 - u - v) * c.y);
    }
    return Number.isFinite(height) ? height : .02;
  };
}

export function syncFarms(board, state) {
  const seed = (board.city.seed ?? 0) >>> 0, parcels = surveyedPaddocks(board.city);
  for (const uniform of fieldUniforms.get(seed) ?? []) uniform.value.forEach((v, i) => {
    const parcel = parcels[i], farm = state.farms?.[parcel?.id];
    const phase = farm?.completedQuarter == null ? 0 : (state.quarter - farm.completedQuarter) % 4;
    v.set(parcel?.fieldId[0] ?? 0, parcel?.fieldId[1] ?? 0, farmTone[phase], farm ? phase + 1 : 0);
  });
  if (!board.root?.parent) return;
  const scene = board.root.parent, fields = scene.getObjectByName('fringe:hinterland-fields');
  if (!fields) return;
  board.farmModels ??= new Map();
  // The drawn sheet disables gameplay raycasts. Index its triangles once for
  // exact barycentric grounding, independent of picking and without per-vertex rays.
  let heightAt;
  for (const parcel of parcels) {
    const farm = state.farms?.[parcel.id], previous = board.farmModels.get(parcel.id);
    if (farm?.completedQuarter != null && !previous) {
      heightAt ??= farmGroundSampler(fields);
      // taste W36: the gateway track is broken where it meets either road it crosses or runs along: the airport link's formation (rail-link.js)
      // and the Southern Cross apron's service road (station.js). Each is a test in the parent's x, z; there is no import from either module.
      const link = scene.getObjectByName('fringe:airport-link')?.userData.formFootprint ?? null;
      const apron = scene.getObjectByName('fringe:southern-cross')?.userData.apronFootprint ?? null;
      const blocked = link || apron ? (bx, bz) => Boolean(link?.(bx, bz) || apron?.(bx, bz)) : null;
      const group = createFarmModel(parcel, board.materials, heightAt, blocked); board.root.add(group); board.farmModels.set(parcel.id, group);
    } else if (!farm && previous) {
      previous.removeFromParent(); previous.traverse((o) => o.geometry?.dispose()); board.farmModels.delete(parcel.id);
    }
  }
}
