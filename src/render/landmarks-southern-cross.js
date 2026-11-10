// Southern Cross M0/D1: exact semantic replacement, with the JS scene as the complete fallback.
import * as THREE from 'three';
import { FoliageLayer, buildSpeciesGeometry, mixStreetSpecies, treeFrame, seasonForPlacement, spatialFormClass, SPECIES_FORM,
  INSTANCE_LEAF_PALETTE, AUTUMN_LEAF_PALETTE, WINTER_LEAF_PALETTE, FOLIAGE_SIZE_CLASS, BARK_VALUE_SPREAD } from './foliage.js';
import { hashSeed } from './textures.js';
import { loadedLandmarkScene, parkedCarKit } from './landmarks-glb.js';

export { SOUTHERN_CROSS_MODELS } from './landmarks-southern-cross-models.js';
export const SOUTHERN_CROSS_ROOT_NODE = 'fringe:southern-cross-buildings';
export const SOUTHERN_CROSS_LOD_DISTANCE = 400;
export const SOUTHERN_CROSS_NODES = Object.freeze(Object.fromEntries([
  'hall-base', 'roof-shell', 'roof-plant', 'hall-frame', 'concourse', 'frontage', 'platforms', 'platform-furniture', 'forecourts',
].map(suffix => [`fringe:southern-cross-${suffix}`, 'root'])));
export const SOUTHERN_CROSS_TREE_SPECIES = Object.freeze({ plane: 'plane', round: 'plane', umbrella: 'eucalypt', cypress: 'cypress', weeping: 'bottlebrush' });
const PARTS = new WeakMap();

/** Snapshot a helper's existing meshes; finish marks only new, still-unmarked meshes. Weak metadata never changes the off graph. */
export function southernCrossPartMarker(root, mats) {
  const seen = new WeakSet();
  root.traverse(m => { if (m.isMesh) seen.add(m); });
  const keys = new Map(Object.entries(mats).map(([key, material]) => [material, key]));
  return part => root.traverse(mesh => {
    if (!mesh.isMesh || seen.has(mesh)) return;
    seen.add(mesh);
    if (PARTS.has(mesh)) return;
    const key = keys.get(mesh.material) ?? '';
    let cls = part;
    if (!part.startsWith('remove:')) {
      if (/^contact/.test(key)) cls = 'keep:contact';
      else if (part === 'keep:commuters') cls = part;
      else if (['letters', 'lettersWarm', 'lettersDark'].includes(key)) cls = 'keep:lettering';
      else if (mesh.material.emissive?.getHex() && mesh.material.emissiveIntensity) cls = 'keep:emissive';
      else if (/^(grass|hedge|leaf|mulch)/.test(key)) cls = 'keep:planting';
    }
    PARTS.set(mesh, cls);
  });
}
export function southernCrossParts(root) {
  const out = [];
  root?.traverse(m => { if (m.isMesh && PARTS.has(m)) out.push([m, PARTS.get(m)]); });
  return out;
}
export function southernCrossClearUnits(root) {
  return southernCrossParts(root).filter(([, cls]) => /^(glb|remove):/.test(cls));
}
function meshTriangles(root) {
  let meshes = 0, triangles = 0;
  root.traverse(m => { if (m.isMesh) { meshes++; triangles += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3 * (m.isInstancedMesh ? m.count : 1); } });
  return { meshes, triangles };
}
const MATERIAL_ROUTES = Object.freeze([
  { species: 'plane', tree: { x: 0, z: 0, model: 'plane-tree-london', role: 'southern-cross-materials' } },
  { species: 'eucalypt', tree: { x: 200, z: 0, model: 'australian-eucalyptus', streetType: 'fringe' } },
  { species: 'cypress', tree: { x: 400, z: 0, model: 'australian-eucalyptus', role: 'reserve-avenue' } },
  { species: 'palm', tree: { x: 600, z: 0, model: 'melbourne-beach-palm', role: 'shore-palm' } },
]);
const SPECIES_MATERIAL_FROM = Object.freeze({ plane: 'plane', eucalypt: 'eucalypt', cypress: 'cypress', palm: 'palm', bottlebrush: 'palm' });

/** The city's tree materials per species ({ wood, leaf }), made by FoliageLayer's own constructor. */
function cityTreeMaterials({ quality = 'high', reducedMotion = false } = {}) {
  const board = new THREE.Group();
  board.userData.foliagePlacements = MATERIAL_ROUTES.map(route => route.tree);
  const layer = new FoliageLayer(new THREE.Group(), { seed: 0, extent: { x: 800, z: 800 } }, { quality, reducedMotion, boardRoot: board });
  const routed = {};
  for (const { species } of MATERIAL_ROUTES) {
    const wood = layer.root.getObjectByName(`nature:foliage:${species}:trunk`);
    const leaf = layer.root.getObjectByName(`nature:foliage:${species}:canopy`);
    if (!wood?.material || !leaf?.material) throw new Error(`FoliageLayer did not route a ${species} tree`);
    routed[species] = { wood: wood.material, leaf: leaf.material };
  }
  const out = {};
  for (const [species, from] of Object.entries(SPECIES_MATERIAL_FROM)) out[species] = routed[from];
  // The stand-in's geometry and the materials no species takes are released (the jacaranda materials are listed for
  // the broadleaf atlas until disposed). The cypress atlas stays with the cypress material.
  const kept = new Set(Object.values(out).flatMap(({ wood, leaf }) => [wood, leaf]));
  layer.root.traverse((m) => { if (m.isMesh) m.geometry?.dispose(); });
  for (const material of layer._materials ?? []) if (!kept.has(material)) material.dispose();
  return out;
}

// R131 measured moves; distance is radial from the station origin. Species,
// buffers, materials and call counts stay fixed. Populated from D5 geometry.
export const SOUTHERN_CROSS_TREE_CLEARANCE = Object.freeze({
  "fringe:southern-cross-tree:cypress:316:-139:112": {
    "radial": 0,
    "groundY": 1.0700000524520874,
    "from": [
      31.600000381469727,
      0.9200000166893005,
      -13.899999618530273
    ]
  },
  "fringe:southern-cross-tree:cypress:-373:243:62": {
    "radial": 0,
    "groundY": 1.78,
    "from": [
      -37.268798828125,
      0.9200000166893005,
      24.25
    ],
    "supportComponent": "forecourts:source-2354-0"
  },
  "fringe:southern-cross-tree:cypress:-397:92:72": {
    "radial": 0,
    "groundY": 1.78,
    "from": [
      -39.668800354003906,
      0.9200000166893005,
      9.199999809265137
    ],
    "supportComponent": "forecourts:source-2370-0"
  },
  "fringe:southern-cross-tree:plane:-265:250:72": {
    "radial": 2.479,
    "groundY": 0.960000002980232,
    "from": [
      -26.5,
      1.7799999713897705,
      24.950000762939453
    ]
  },
  "fringe:southern-cross-tree:round:265:175:90": {
    "radial": 5.341,
    "groundY": 0.7099999994039536,
    "from": [
      26.5,
      1.7799999713897705,
      17.5
    ]
  },
  "fringe:southern-cross-tree:round:-397:243:72": {
    "radial": 0,
    "groundY": 1.78,
    "from": [
      -39.668800354003906,
      0.9200000166893005,
      24.25
    ],
    "supportComponent": "forecourts:source-2354-0"
  },
  "fringe:southern-cross-tree:round:-373:92:62": {
    "radial": 0,
    "groundY": 1.78,
    "from": [
      -37.268798828125,
      0.9200000166893005,
      9.199999809265137
    ],
    "supportComponent": "forecourts:source-2370-0"
  },
  "fringe:southern-cross-tree:umbrella:255:250:90": {
    "radial": 2.651,
    "groundY": 0.9160053188587223,
    "from": [
      25.5,
      1.7799999713897705,
      24.950000762939453
    ]
  },
  "fringe:southern-cross-tree:umbrella:496:-141:90": {
    "radial": 0,
    "groundY": 1.0700000524520874,
    "from": [
      49.599998474121094,
      0.9200000166893005,
      -14.100000381469727
    ]
  }
});

const unitFromKey = key => (hashSeed(key) >>> 0) / 4294967296;
const SEASON_PALETTE = { autumn: AUTUMN_LEAF_PALETTE, winter: WINTER_LEAF_PALETTE, green: INSTANCE_LEAF_PALETTE };

function plantCityTrees(root, trunks, { quality = 'high', reducedMotion = false } = {}) {
  const group = new THREE.Group();
  group.name = 'fringe:southern-cross-city-trees';
  group.userData.southernCrossCityTrees = true;
  const report = { planted: [], meshes: 0, triangles: 0, calls: 0, quality };
  if (!trunks.length) return { group, report };
  const materials = cityTreeMaterials({ quality, reducedMotion });
  const placements = trunks.map(({ name, kind, x, y, z, compact }) => {
    const speciesId = SOUTHERN_CROSS_TREE_SPECIES[kind] ?? 'plane';
    const salt = `southern-cross:${name}`;
    const sizeClass = compact ? 0 : Math.floor(unitFromKey(`t12-size:${salt}`) * 4) % 4;
    const formClass = spatialFormClass(x, z);
    return { name, speciesId, x, y, z, salt, sizeClass, compact, scale: FOLIAGE_SIZE_CLASS[sizeClass], formClass,
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
  const stand = placements.map(p => ({ speciesId: 'southern-cross', x: p.x, z: p.z, season: p.season }));
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
        mesh.userData.southernCrossCityTree = speciesId;
        mesh.castShadow = quality !== 'low';
        mesh.receiveShadow = true;
        mesh.raycast = () => {};
        return mesh;
      });
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

      const adjustment = SOUTHERN_CROSS_TREE_CLEARANCE[p.name];
      const frame = treeFrame(adjustment ? {...p, sizeClass: 0, scale: FOLIAGE_SIZE_CLASS[0]} : p, speciesId, unitTop);
      if (adjustment) {
        const radius = Math.hypot(p.x,p.z);
        p.x += p.x / radius * adjustment.radial;
        p.z += p.z / radius * adjustment.radial;
        p.y = adjustment.groundY;
      }
      position.set(p.x, p.y, p.z);
      euler.y = p.yaw;
      quaternion.setFromEuler(euler);
      leanAxis.set(Math.cos(frame.leanDir), 0, Math.sin(frame.leanDir));
      leanQuat.setFromAxisAngle(leanAxis, frame.leanAmt);
      quaternion.premultiply(leanQuat);
      scale.set(frame.h * frame.girthX, frame.h * frame.stretch, frame.h * frame.girthZ);
      matrix.compose(position, quaternion, scale);
      meshes.forEach((mesh, k) => { mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, k === 0 ? barkColor : leafColor); });
      report.planted.push({ tree: p.name, species: speciesId, season: p.season, x: +p.x.toFixed(2), z: +p.z.toFixed(2),
        height: +(frame.h * unitTop * frame.stretch).toFixed(2), compact: Boolean(p.compact) });
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

function treeSites(root) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), point = new THREE.Vector3();
  const sites = [];
  root.traverse(tree => {
    const data = tree.userData.venueTree;
    if (!data || !SOUTHERN_CROSS_TREE_SPECIES[data.kind] || !southernCrossClearUnits(tree).length) return;
    point.set(data.x, data.y, data.z).applyMatrix4(tree.parent.matrixWorld).applyMatrix4(inverse);
    // R126 (3), R130: both indoor planter sites lose their city tree. The
    // retained planter/planting stays; no replacement species enters the hall.
    if (Math.abs(point.x) < 26.34 && Math.abs(point.z) < 10.74) return;
    sites.push({ name: tree.name, kind: data.kind, compact: false, x: point.x, y: point.y, z: point.z });
  });
  return sites;
}

/** R141/R26: refill the decoded source vehicles, including the cross-bay and
 * aisle occupants. Four furniture bays stay empty. Costs remain a separate row. */
function plantParkedCars(root, units, scene) {
  const kit = parkedCarKit(scene);
  const report = { placed: 0, triangles: 0, calls: 0, bays: [] };
  if (!kit) return { group: null, report };
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), poses = [];
  const paints = ['carA','carB','carC','carD','carE','carF'].map(k=>root.userData.mats[k]);
  const bodies = units.filter(([m,cls])=>{
    if (cls !== 'remove:parked-cars' || !paints.includes(m.material)) return false;
    m.geometry.computeBoundingBox();
    const size = m.geometry.boundingBox.getSize(new THREE.Vector3());
    // The source body is 1.78 m wide; cabins are 1.62 m and racks 1.28 m.
    return size.x >= 3 && size.z > 1.7;
  }).map(([m])=>m);
  const sizes = Object.fromEntries(['sedan','hatch','wagon'].map(type=>{
    kit[type].paint.geometry.computeBoundingBox();
    return [type,kit[type].paint.geometry.boundingBox.getSize(new THREE.Vector3()).z];
  }));
  for (const [sourceCar, body] of bodies.entries()) {
    const matrix = inverse.clone().multiply(body.matrixWorld);
    const position = body.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(matrix);
    const sourceLength = body.geometry.boundingBox.getSize(new THREE.Vector3()).x;
    const type = Object.keys(sizes).sort((a,b)=>Math.abs(sizes[a]-sourceLength)-Math.abs(sizes[b]-sourceLength))[0], car=kit[type];
    // Local X is the source car's long axis; the city kit points along local Z.
    const yaw=Math.atan2(-matrix.elements[2],matrix.elements[0]);
    const quaternion=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw+(position.x < -38 ? Math.PI/2 : -Math.PI/2));
    position.y=0;
    const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0)), heights=[];
    for (const wheel of car.wheels) {
      const p=new THREE.Vector3(wheel[0],0,wheel[1]).applyQuaternion(quaternion).add(position);
      ray.set(new THREE.Vector3(p.x,3,p.z).applyMatrix4(root.matrixWorld),new THREE.Vector3(0,-1,0));
      const hits=[];
      for (const [m,cls] of units) if(cls==='glb:forecourts'&&['tarWorn','asphalt'].some(k=>m.material===root.userData.mats[k])) THREE.Mesh.prototype.raycast.call(m,ray,hits);
      hits.sort((a,b)=>a.distance-b.distance);
      if(hits[0])heights.push(hits[0].point.clone().applyMatrix4(inverse).y);
    }
    if(heights.length!==4)continue;
    position.y=Math.max(...heights);
    poses.push({type,position,quaternion,paint:car.paints[sourceCar%car.paints.length],sourceCar,sourceLength});
  }
  const group = new THREE.Group(); group.name = 'fringe:southern-cross-parked-cars';
  const unit = new THREE.Vector3(1,1,1), transform = new THREE.Matrix4(), colour = new THREE.Color();
  for (const type of ['sedan','hatch','wagon']) {
    const chosen = poses.filter(p=>p.type===type);
    if (!chosen.length) continue;
    for (const part of ['paint','detail']) {
      const source = kit[type][part], mesh = new THREE.InstancedMesh(source.geometry,source.material,chosen.length);
      mesh.name = `${group.name}:${type}-${part}`;
      chosen.forEach((p,i)=>{transform.compose(p.position,p.quaternion,unit);mesh.setMatrixAt(i,transform);if(part==='paint')mesh.setColorAt(i,colour.set(p.paint));});
      mesh.instanceMatrix.needsUpdate = true;
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = part==='paint'; mesh.receiveShadow = true; mesh.raycast = ()=>{};
      mesh.computeBoundingSphere(); group.add(mesh);
      report.calls++; report.triangles += meshTriangles(mesh).triangles;
    }
  }
  report.placed = poses.length;
  report.sourceCount = bodies.length;
  report.bays = poses.map(p=>({sourceCar:p.sourceCar,sourceLength:p.sourceLength,type:p.type,position:p.position.toArray(),quaternion:p.quaternion.toArray()}));
  return {group,report};
}

// Geometry is authored in the export root's local metres. Flatten nested node transforms into owned geometry,
// retaining the original material objects, colours and emissive values. The cached source scene stays untouched.
function landmarkNode(source, name) {
  const found = source.children.find(o => o.name === name);
  found.updateWorldMatrix(true, true);
  const inverse = source.matrixWorld.clone().invert();
  const originals = [];
  found.traverse(o => originals.push(o));
  const node = found.clone(true);
  let index = 0;
  node.traverse(o => {
    const from = originals[index++];
    if (o.isMesh) {
      const matrix = new THREE.Matrix4().multiplyMatrices(inverse, from.matrixWorld);
      o.geometry = from.geometry.clone().applyMatrix4(matrix);
      o.userData.ownsGeometry = true;
      o.raycast = () => {}; // existing fringe hall group remains the pick target
    }
    o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1); o.updateMatrix();
    o.userData.landmark = 'southern-cross';
  });
  node.updateMatrixWorld(true);
  return node;
}

/** All near nodes must be present before anything detaches. An absent/incomplete far file keeps every near node. */
export function placeSouthernCrossLandmark(root, {
  quality = 'high', search = globalThis.location?.search ?? '',
  scene = null, far = null, cars = loadedLandmarkScene('parked-cars'),
} = {}) {
  const selected = typeof search === 'string' ? new URLSearchParams(search).get('landmarks')?.split(',').map(s => s.trim()) ?? [] : [];
  if (!root || !selected.some(id => id === 'southern-cross' || id === 'all')) return null;
  if (root.userData.southernCrossLandmark?.placed) return root.userData.southernCrossLandmark;
  const report = { placed: false, reason: null, nodes: 0, lod1: false, removed: {}, removedMeshes: 0,
    removedTriangles: 0, triangles: 0, trianglesFar: 0, cityTrees: null };
  root.userData.southernCrossLandmark = report;
  const source = scene?.getObjectByName(SOUTHERN_CROSS_ROOT_NODE);
  const names = Object.keys(SOUTHERN_CROSS_NODES);
  const missing = names.filter(name => !source?.children.some(o => o.name === name));
  if (missing.length) { report.reason = `node missing: ${missing.join(', ')}`; return report; }
  const farSource = far?.getObjectByName(SOUTHERN_CROSS_ROOT_NODE);
  const fullFar = names.every(name => farSource?.children.some(o => o.name === name));
  const nodes = names.map(name => [name, landmarkNode(source, name), fullFar ? landmarkNode(farSource, name) : null]);
  const units = southernCrossClearUnits(root);
  const parked = plantParkedCars(root, units, cars);
  const trees = plantCityTrees(root, treeSites(root), { quality, reducedMotion: root.userData.reducedMotion });
  for (const [mesh, cls] of units) {
    const measured = meshTriangles(mesh), row = report.removed[cls] ??= { meshes: 0, triangles: 0 };
    row.meshes += measured.meshes; row.triangles += measured.triangles;
    report.removedMeshes += measured.meshes; report.removedTriangles += measured.triangles;
    mesh.removeFromParent();
    if (mesh.userData.ownsGeometry) mesh.geometry.dispose();
  }
  root.add(trees.group);
  if (parked.group) root.add(parked.group);
  report.parkedCars = parked.report;
  report.cityTrees = trees.report;
  for (const [name, node, farNode] of nodes) {
    const centre = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
    const lod = new THREE.LOD();
    lod.name = `${name}-lod`;
    lod.userData.landmark = 'southern-cross';
    lod.userData.dynamicVisibility = true; // both copies must survive batchStaticWorld
    lod.position.copy(centre);
    node.position.copy(centre).negate();
    lod.addLevel(node, 0);
    if (farNode) {
      farNode.traverse(o => { if (o.name === name) o.name = `${name}-far`; });
      farNode.position.copy(centre).negate();
      lod.addLevel(farNode, SOUTHERN_CROSS_LOD_DISTANCE);
      farNode.visible = false;
      report.trianglesFar += meshTriangles(farNode).triangles;
    }
    root.add(lod);
    report.nodes++;
    report.triangles += meshTriangles(node).triangles;
  }
  report.lod1 = fullFar;
  report.placed = true;
  return report;
}
