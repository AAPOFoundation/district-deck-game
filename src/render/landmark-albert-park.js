// Albert Park M0 + D1: exact pre-batch sections and an atomic, opt-in near/far swap.
// Coordinates are precinct-local metres, including the existing ground elevation.
import * as THREE from 'three';
import { parseLandmarkSwitch, loadedLandmarkScene, bakedGeometry, cityTreeMaterials, parkedCarKit, PARKED_CARS_KEY, PARKED_CAR_TYPES } from './landmarks-glb.js';
import { buildSpeciesGeometry, mixStreetSpecies, treeFrame, seasonForPlacement, spatialFormClass, SPECIES_FORM,
  INSTANCE_LEAF_PALETTE, AUTUMN_LEAF_PALETTE, WINTER_LEAF_PALETTE, FOLIAGE_SIZE_CLASS, BARK_VALUE_SPREAD } from './foliage.js';
import { hashSeed } from './textures.js';

// Hoisted factory keeps direct imports of either side safe across the shared-loader utility cycle.
export function albertParkModels() { return [
  { id: 'albert-park', url: './assets/models/landmarks/albert-park.glb', source: 'landmark-blender' },
  { id: 'albert-park-far', switch: 'albert-park', url: './assets/models/landmarks/albert-park-lod1.glb', source: 'landmark-blender', lod: 1 },
]; }
export const ALBERT_PARK_ROOT_NODE = 'fringe:grand-prix-buildings';
export const ALBERT_PARK_LOD_DISTANCE = 400;
// R119 file ceilings, independently checked against landmark-spec.json.
export const ALBERT_PARK_BUDGETS = Object.freeze({
  triangles: 30000, trianglesFar: 12000, bytes: 2000000, bytesFar: 1000000, calls: 48, materials: 7,
});
export const ALBERT_PARK_NODES = Object.freeze(Object.fromEntries([
  'pit-building', 'timing-tower', 'grandstand-main', 'grandstand-north', 'spectator-banks', 'event-structures',
  'entry-gates', 'track-furniture', 'signs-lights', 'park-buildings', 'paths-furniture', 'podium',
].map(suffix => [`fringe:grand-prix-${suffix}`, 'root'])));

const PARTS = new WeakMap();
/** First completed section owns a mesh; nested letters/track helpers mark before their enclosing section. */
export function markAlbertParkPart(root, part) {
  root.traverse(mesh => {
    if (!mesh.isMesh || PARTS.has(mesh)) return;
    const n = mesh.name;
    const ancestors = [];
    for (let p = mesh; p; p = p.parent) ancestors.push(p.name);
    let cls = part;
    // R137: the seven named identity occupants survive the car-park replacement.
    if (ancestors.some(a => /^fringe:grand-prix-(transporter|course-car):[0-9]+$/.test(a))) cls = 'keep:grand-prix-service-vehicles';
    if (/:i4-body$|-people(?::|$)/.test(n)) cls = 'keep:city-I4-figures';
    else if (/form-trees:(plane|eucalypt|cypress):|grand-prix-palm-(trunks|fronds)$/.test(n)) cls = 'remove:venue-tree-geometry';
    else if (/form-trees:weeping:/.test(n)) cls = 'keep:lake-and-landscape';
    else if (/runoff-(grit|tuft)|promenade-(spill|tuft)|infield-contact|shrubs|hedge|boulevard-median-shrub/.test(n)) cls = 'keep:lake-and-landscape';
    else if (ancestors.some(a => /grand-prix-park-edge-terrace:/.test(a))) cls = 'glb:park-buildings';
    else if (/boulevard-lamp/.test(n)) cls = 'glb:signs-lights';
    // Keep existing luminous fixtures and their exact materials; GLBs replace only their supports.
    if (cls.startsWith('glb:') && [mesh.material].flat().some(m => m.emissive?.getHex() && m.emissiveIntensity > 0)) {
      cls = 'keep:light-effects';
    }
    PARTS.set(mesh, cls);
  });
}
export function albertParkPart(mesh) { return PARTS.get(mesh); }
export function albertParkClearUnits(root) {
  const units = [];
  root?.traverse(mesh => { const cls = PARTS.get(mesh); if (mesh.isMesh && /^(glb|remove):/.test(cls ?? '')) units.push([mesh, cls]); });
  return units;
}
const meshTriangles = mesh => ({ triangles: (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 * (mesh.isInstancedMesh ? mesh.count : 1) });
function triangles(root) { let n = 0; root.traverse(o => { if (o.isMesh) n += meshTriangles(o).triangles; }); return n; }

/** Read the actual instances before detachment; palms drop and the lake's four weeping trees stay JS. */
export function albertParkTreeSites(root) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), local = new THREE.Matrix4(), instance = new THREE.Matrix4();
  const sites = [];
  for (const [mesh, cls] of albertParkClearUnits(root)) {
    const match = /^fringe:grand-prix-form-trees:(plane|eucalypt|cypress):/.exec(mesh.name);
    if (cls !== 'remove:venue-tree-geometry' || !mesh.isInstancedMesh || !match) continue;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, instance);
      local.copy(inverse).multiply(mesh.matrixWorld).multiply(instance);
      const at = new THREE.Vector3().setFromMatrixPosition(local);
      let crownRadius = 0;
      const positions = mesh.geometry.attributes.position, point = new THREE.Vector3();
      for (let j = 0; j < positions.count; j++) {
        point.fromBufferAttribute(positions, j).applyMatrix4(local);
        crownRadius = Math.max(crownRadius, Math.hypot(point.x - at.x, point.z - at.z));
      }
      sites.push({ name: `${mesh.name}:${i}`, species: match[1], x: at.x, y: at.y, z: at.z, crownRadius });
    }
  }
  return sites;
}

// Same city species, materials, size/season/lean laws as the airport and Rod Laver adapters.
// R131 clearance adjustments are measured against decoded structure in the D7 test.
export const ALBERT_PARK_TREE_CLEARANCE = Object.freeze({
  "fringe:grand-prix-form-trees:eucalypt:0:5": {
    "dx": -0.4374403688271955,
    "dz": -1.4141257915269743,
    "sizeClass": 0
  },
  "fringe:grand-prix-form-trees:eucalypt:1:7": {
    "dx": 1.50377394258228,
    "dz": -0.4651717916590799,
    "sizeClass": 0
  },
  "fringe:grand-prix-form-trees:plane:1:1": {
    "dx": 1.179339811064367,
    "dz": -0.2506764152804143,
    "sizeClass": 0
  }
});
const unitFromKey = key => (hashSeed(key) >>> 0) / 4294967296;
const SEASON_PALETTE = { autumn: AUTUMN_LEAF_PALETTE, winter: WINTER_LEAF_PALETTE, green: INSTANCE_LEAF_PALETTE };

/**
 * Plant the city's species at the measured Grand Prix trunks: one InstancedMesh per species for the trunk, the canopy without a fall layer, built from buildSpeciesGeometry with the city's materials, and posed and coloured as
 * FoliageLayer's instance loop does (form class, lean, season palette, leaf bias, bark spread). R139 selects the nearest
 * city crown size class. R131 clearance moves preserve the source site's pose seed.
 */
export function plantAlbertParkTrees(root, trunks, { quality = 'high', reducedMotion = false } = {}) {
  const group = new THREE.Group();
  group.name = 'fringe:grand-prix-city-trees';
  group.userData.albertParkCityTrees = true;
  const report = { planted: [], meshes: 0, triangles: 0, calls: 0, quality };
  if (!trunks.length) return { group, report };
  const materials = cityTreeMaterials({ quality, reducedMotion });
  const placements = trunks.map(({ name, species, x, y, z, crownRadius }) => {
    const speciesId = species;
    const salt = `albert-park:${name}`;
    const sizeClass = Math.floor(unitFromKey(`t12-size:${salt}`) * 4) % 4;
    const formClass = spatialFormClass(x, z);
    return { name, speciesId, x, y, z, crownRadius, salt, sizeClass, scale: FOLIAGE_SIZE_CLASS[sizeClass], formClass,
      yaw: (unitFromKey(`tree-yaw:${salt}`) - 0.5) * 1.2 + formClass * 0.37, season: seasonForPlacement(speciesId, salt) };
  });
  // FoliageLayer's neighbour rule (same species, size and season within 20 m steps the season, then the size).
  for (let i = 0; i < placements.length; i += 1) {
    const a = placements[i];
    for (let j = 0; j < i; j += 1) {
      const b = placements[j];
      if (Math.hypot(a.x - b.x, a.z - b.z) >= 20) continue;
      if (a.speciesId === b.speciesId && a.sizeClass === b.sizeClass && a.season === b.season) {
        a.season = a.season === 'green' ? 'autumn' : a.season === 'autumn' ? 'winter' : 'green';
        if (a.speciesId === b.speciesId && a.sizeClass === b.sizeClass && a.season === b.season) {
          a.sizeClass = (a.sizeClass + 1) % 4;
          a.scale = FOLIAGE_SIZE_CLASS[a.sizeClass];
        }
      }
    }
  }
  // The city's autumn spacing (28 m), through mixStreetSpecies itself on stand-ins that no species rule touches.
  const stand = placements.map(p => ({ speciesId: 'albert-park', x: p.x, z: p.z, season: p.season }));
  mixStreetSpecies(stand);
  stand.forEach((s, i) => { placements[i].season = s.season; });

  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), quaternion = new THREE.Quaternion();
  const leanQuat = new THREE.Quaternion(), leanAxis = new THREE.Vector3(), scale = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const leafColor = new THREE.Color(), barkColor = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
  for (const speciesId of [...new Set(placements.map(p => p.speciesId))]) {
    const batch = placements.filter(p => p.speciesId === speciesId);
    const built = buildSpeciesGeometry(speciesId, quality);
    built.leaf.computeBoundingBox();
    const unitTop = built.leaf.boundingBox.max.y;
    const { wood: woodMat, leaf: leafMat } = materials[speciesId];
    const meshes = [[built.wood, woodMat, 'trunk'], [built.leaf, leafMat, 'canopy']]
      .map(([geometry, material, part]) => {
        geometry.setAttribute('aTap', new THREE.InstancedBufferAttribute(new Float32Array(batch.length), 1));
        const mesh = new THREE.InstancedMesh(geometry, material, batch.length);
        // The city's mesh names, so the style class and LOD families read them as street trees.
        mesh.name = `nature:foliage:${speciesId}:${part}`;
        mesh.userData.ownsGeometry = true;
        mesh.userData.albertParkCityTree = speciesId;
        mesh.castShadow = quality !== 'low';
        mesh.receiveShadow = true;
        mesh.raycast = () => {};
        return mesh;
      });
    built.leafDrop?.dispose();
    const form = SPECIES_FORM[speciesId];
    const speciesBark = new THREE.Color(form.bark);
    batch.forEach((p, i) => {
      const mix = unitFromKey(`leaf-instance-mix:${speciesId}:${p.salt}`);
      const palette = SEASON_PALETTE[p.season] ?? INSTANCE_LEAF_PALETTE;
      leafColor.set(palette[Math.floor(mix * palette.length) % palette.length]);
      leafColor.getHSL(hsl);
      leafColor.setHSL(
        (hsl.h + (unitFromKey(`leaf-hue:${speciesId}:${p.salt}`) - 0.5) * 0.045 + 1) % 1,
        THREE.MathUtils.clamp(hsl.s * (0.90 + unitFromKey(`leaf-sat:${speciesId}:${p.salt}`) * 0.20), 0, 1),
        THREE.MathUtils.clamp(hsl.l * (0.88 + unitFromKey(`leaf-light:${speciesId}:${p.salt}`) * 0.24), 0.08, 0.82),
      );
      leafColor.setRGB(leafColor.r * form.leafBias[0], leafColor.g * form.leafBias[1], leafColor.b * form.leafBias[2]);
      if (speciesId === 'eucalypt') leafColor.lerp(new THREE.Color('#809078'), 0.50);
      if (speciesId === 'cypress') leafColor.lerp(new THREE.Color('#536637'), 0.65).multiplyScalar(0.86 + mix * 0.28);
      const barkK = 1 - BARK_VALUE_SPREAD * 0.5 + unitFromKey(`bark:${speciesId}:${p.salt}`) * BARK_VALUE_SPREAD;
      barkColor.setRGB(speciesBark.r * barkK, speciesBark.g * barkK, speciesBark.b * barkK);

      const candidates = FOLIAGE_SIZE_CLASS.map((size, sizeClass) => {
        const frame = treeFrame({ ...p, scale: size, sizeClass }, speciesId, unitTop);
        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.yaw, 0, 'YXZ'));
        const axis = new THREE.Vector3(Math.cos(frame.leanDir), 0, Math.sin(frame.leanDir));
        rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, frame.leanAmt));
        const pose = new THREE.Matrix4().compose(new THREE.Vector3(), rotation,
          new THREE.Vector3(frame.h * frame.girthX, frame.h * frame.stretch, frame.h * frame.girthZ));
        const point = new THREE.Vector3(); let radius = 0;
        for (let j = 0; j < built.leaf.attributes.position.count; j++) {
          point.fromBufferAttribute(built.leaf.attributes.position, j).applyMatrix4(pose);
          radius = Math.max(radius, Math.hypot(point.x, point.z));
        }
        return { sizeClass, radius, error: Math.abs(radius / p.crownRadius - 1) };
      });
      // R139 supersedes the largest-within-25% rule; ties keep the larger crown.
      const chosen = [...candidates].sort((a, b) => a.error - b.error || b.radius - a.radius)[0];
      p.sizeClass = chosen.sizeClass; p.scale = FOLIAGE_SIZE_CLASS[p.sizeClass];
      const adjustment = ALBERT_PARK_TREE_CLEARANCE[p.name];
      if (adjustment) { p.x += adjustment.dx; p.z += adjustment.dz; p.sizeClass = adjustment.sizeClass; p.scale = FOLIAGE_SIZE_CLASS[p.sizeClass]; }
      // A clearance move is a translation: preserve the source site's city pose seed.
      const frame = treeFrame(adjustment ? { ...p, x: p.x-adjustment.dx, z: p.z-adjustment.dz } : p, speciesId, unitTop);
      position.set(p.x, p.y, p.z);
      euler.y = p.yaw;
      quaternion.setFromEuler(euler);
      leanAxis.set(Math.cos(frame.leanDir), 0, Math.sin(frame.leanDir));
      leanQuat.setFromAxisAngle(leanAxis, frame.leanAmt);
      quaternion.premultiply(leanQuat);
      scale.set(frame.h * frame.girthX, frame.h * frame.stretch, frame.h * frame.girthZ);
      matrix.compose(position, quaternion, scale);
      meshes.forEach((mesh, k) => { mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, k === 0 ? barkColor : leafColor); });
      report.planted.push({ tree: p.name, species: speciesId, season: p.season, x: p.x, y: p.y, z: p.z,
        height: +(frame.h * unitTop * frame.stretch).toFixed(2), sizeClass: p.sizeClass, sourceCrownRadius: p.crownRadius,
        crownRadius: candidates.find(c => c.sizeClass === p.sizeClass).radius, crownCandidates: candidates, clearance: adjustment ?? null });
    });
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
      const { triangles } = meshTriangles(mesh);
      report.meshes += 1;
      report.calls += 1;
      report.triangles += triangles;
    }
  }
  return { group, report };
}


/** R137: all 36 JS bays; city geometry/paint, six instance calls, no custom car meshes. */
export function albertParkCarSites(root) {
  root.updateWorldMatrix(true, true);
  const body = root.getObjectByName('fringe:grand-prix-carpark:body');
  if (!body?.isInstancedMesh) return [];
  const toRoot = root.matrixWorld.clone().invert().multiply(body.matrixWorld), instance = new THREE.Matrix4();
  return Array.from({ length: body.count }, (_, i) => {
    body.getMatrixAt(i, instance); const transform = toRoot.clone().multiply(instance);
    const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), size = new THREE.Vector3();
    transform.decompose(position, rotation, size);
    // Source body centre 0.44 m above the car-park deck (buildCarPark).
    return { id: i, x: position.x, y: position.y - .44, z: position.z, rotation };
  });
}
export function placeAlbertParkCars(root, scene) {
  const sites = albertParkCarSites(root), kit = parkedCarKit(scene);
  const report = { bays: sites.length, placed: 0, calls: 0, triangles: 0, cars: [], reason: null };
  if (!kit) { report.reason = 'parked-cars GLB not loaded'; return { group: null, report }; }
  const group = new THREE.Group(); group.name = 'fringe:grand-prix-city-parked-cars';
  group.userData.albertParkParkedCars = true;
  for (const [index, type] of PARKED_CAR_TYPES.entries()) {
    const selected = sites.filter(s => s.id % PARKED_CAR_TYPES.length === index), k = kit[type];
    if (!selected.length) continue;
    for (const part of ['paint', 'detail']) {
      const source = k[part], geometry = bakedGeometry(source.geometry, source.matrix);
      const mesh = new THREE.InstancedMesh(geometry, source.material, selected.length);
      mesh.name = `${group.name}:${type}:${part}`; mesh.userData.ownsGeometry = true;
      mesh.castShadow = source.castShadow; mesh.receiveShadow = source.receiveShadow; mesh.raycast = () => {};
      selected.forEach((site, i) => {
        mesh.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(site.x, site.y, site.z), site.rotation, new THREE.Vector3(1, 1, 1)));
        if (part === 'paint') mesh.setColorAt(i, new THREE.Color(k.paints[site.id % k.paints.length]));
      });
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere(); group.add(mesh); report.calls++; report.triangles += meshTriangles(mesh).triangles;
    }
    for (const site of selected) report.cars.push({ id: site.id, type, x: site.x, y: site.y, z: site.z });
    report.placed += selected.length;
  }
  report.cars.sort((a, b) => a.id - b.id);
  return { group, report };
}

function cloneNode(source, name) {
  const original = source.children.find(child => child.name === name);
  const node = original.clone(true);
  source.updateWorldMatrix(true, true);
  const inverse = source.matrixWorld.clone().invert();
  const originals = []; original.traverse(o => originals.push(o));
  let i = 0;
  node.traverse(o => {
    const from = originals[i++];
    if (o.isMesh) {
      o.geometry = bakedGeometry(from.geometry, new THREE.Matrix4().multiplyMatrices(inverse, from.matrixWorld));
      o.userData.ownsGeometry = true;
      o.castShadow = true; o.receiveShadow = true; o.raycast = () => {};
    }
    o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1);
    o.userData.landmark = 'albert-park';
  });
  return node;
}

/** Missing or incomplete LOD0 leaves the JS intact. Incomplete LOD1 keeps every node on the near model. */
export function placeAlbertParkLandmark(root, {
  quality = 'high', search = globalThis.location?.search ?? '',
  scene = loadedLandmarkScene('albert-park'), far = loadedLandmarkScene('albert-park-far'),
  cars = loadedLandmarkScene(PARKED_CARS_KEY),
} = {}) {
  if (!root || !parseLandmarkSwitch(search).has('albert-park')) return null;
  if (root.userData.albertParkLandmark?.placed) return root.userData.albertParkLandmark;
  const report = { placed: false, reason: null, nodes: 0, lod1: false, removed: {}, removedMeshes: 0,
    removedTriangles: 0, triangles: 0, trianglesFar: 0, cityTrees: null };
  const source = scene?.getObjectByName(ALBERT_PARK_ROOT_NODE);
  const names = Object.keys(ALBERT_PARK_NODES);
  const hasMesh = (parent, name) => {
    const child = parent?.children.find(o => o.name === name); let found = false;
    child?.traverse(o => { if (o.isMesh && o.geometry?.attributes.position?.count) found = true; });
    return found;
  };
  const missing = names.filter(name => !hasMesh(source, name));
  if (missing.length) { report.reason = `node missing: ${missing.join(', ')}`; return report; }
  const farSource = far?.getObjectByName(ALBERT_PARK_ROOT_NODE);
  const fullFar = names.every(name => hasMesh(farSource, name));
  const nodes = names.map(name => [name, cloneNode(source, name), fullFar ? cloneNode(farSource, name) : null]);
  const units = albertParkClearUnits(root);
  const parked = placeAlbertParkCars(root, cars);
  const trees = plantAlbertParkTrees(root, albertParkTreeSites(root), { quality });
  for (const [mesh, cls] of units) {
    if (cls === 'remove:bespoke-road-vehicles' && !parked.group) continue;
    const n = meshTriangles(mesh).triangles;
    const row = report.removed[cls] ??= { meshes: 0, triangles: 0 };
    row.meshes++; row.triangles += n;
    report.removedMeshes++; report.removedTriangles += n;
    // Materials and geometries may be shared with retained objects. Detach without disposing them.
    mesh.removeFromParent();
  }
  root.add(trees.group); report.cityTrees = trees.report;
  if (parked.group) root.add(parked.group); report.parkedCars = parked.report;
  for (const [name, node, farNode] of nodes) {
    const centre = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
    const lod = new THREE.LOD(); lod.name = `${name}-lod`;
    lod.userData.landmark = 'albert-park'; lod.userData.dynamicVisibility = true;
    lod.position.copy(centre); node.position.copy(centre).negate(); lod.addLevel(node, 0);
    if (farNode) {
      farNode.traverse(o => { if (o.name === name) o.name = `${name}-far`; });
      farNode.position.copy(centre).negate(); lod.addLevel(farNode, ALBERT_PARK_LOD_DISTANCE); farNode.visible = false;
      report.trianglesFar += triangles(farNode);
    }
    root.add(lod); report.nodes++; report.triangles += triangles(node);
  }
  report.lod1 = fullFar; report.placed = true; root.userData.albertParkLandmark = report;
  return report;
}
