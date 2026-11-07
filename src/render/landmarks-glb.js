// K1 (LANDMARK-BUILD-PROCESS.md sections 1 and 8): the `landmark-blender` loader rows, the `?landmarks=`
// switch and the node-naming scheme every remodelled landmark GLB keeps. With the switch absent nothing here
// requests, builds or places anything; the JS builders stay as they are.
// No static import of fringe.js: assets.js imports this module and fringe.js reaches assets.js through
// core/city.js and board.js, so that import made core/city.js fail on load (TDZ). The caller hands in
// fringe.js's ground sampler instead.
// L2a: foliage.js is imported for the city's tree species. It reaches only grid.js, textures.js, sway.js, style/restyle.js,
// v4-p1-polish.js and the two public-tree-pit modules, none of which leads back to assets.js or core/city.js; the load
// test in tests/l2a-airport-clear.test.mjs holds that.
import * as THREE from 'three';
import {
  FoliageLayer, buildSpeciesGeometry, mixStreetSpecies, treeFrame, seasonForPlacement, spatialFormClass, SPECIES_FORM,
  INSTANCE_LEAF_PALETTE, AUTUMN_LEAF_PALETTE, WINTER_LEAF_PALETTE, FOLIAGE_SIZE_CLASS, BARK_VALUE_SPREAD,
} from './foliage.js';
import { hashSeed } from './textures.js';

export const LANDMARK_IDS = Object.freeze(['airport', 'rod-laver', 'southern-cross', 'albert-park', 'port', 'kit-board']);

// Group ids each landmark keeps (section 1). Prefix groups take `<prefix>` or `<prefix>-…`; the port's are
// exact, and only `port-gantry` carries the rig parts the animation code drives. Mirrored in
// scripts/blender/landmark_kit/lint_landmark.py GROUPS.
export const LANDMARK_GROUPS = Object.freeze({
  airport: Object.freeze({ kind: 'prefix', groups: Object.freeze(['tullamarine']) }),
  'rod-laver': Object.freeze({ kind: 'prefix', groups: Object.freeze(['rod-laver', 'melbourne-park']) }),
  'southern-cross': Object.freeze({ kind: 'prefix', groups: Object.freeze(['southern-cross']) }),
  'albert-park': Object.freeze({ kind: 'prefix', groups: Object.freeze(['grand-prix']) }),
  port: Object.freeze({ kind: 'exact', groups: Object.freeze(['port-gantry', 'port-forklift', 'port-stacker']) }),
  'kit-board': Object.freeze({ kind: 'prefix', groups: Object.freeze(['landmark-kit-board']) }),
});
export const RIG_GROUP = 'port-gantry';
export const RIG_PARTS = Object.freeze(['trolley', 'spreader', 'backreach']);
const TOKEN = '[a-z0-9]+(?:-[a-z0-9]+)*';
const NODE_NAME = new RegExp(`^fringe:(${TOKEN})(?::(${TOKEN})(?::(${RIG_PARTS.join('|')}))?)?$`);

/** `fringe:<group>` or `fringe:<group>:<id>[:trolley|:spreader|:backreach]`, with the group owned by `id`. */
export function nodeNameOk(name, id) {
  if (typeof name !== 'string' || !Object.hasOwn(LANDMARK_GROUPS, id)) return false;
  const match = NODE_NAME.exec(name);
  if (!match) return false;
  const [, group, , rig] = match;
  if (rig && group !== RIG_GROUP) return false;
  const { kind, groups } = LANDMARK_GROUPS[id];
  return kind === 'exact' ? groups.includes(group) : groups.some(g => group === g || group.startsWith(`${g}-`));
}

/** `?landmarks=` as a fresh Set: comma ids or `all`; unknown ids ignored; absent or empty = none. */
export function parseLandmarkSwitch(search) {
  const selected = new Set();
  if (typeof search !== 'string' || !search) return selected;
  const raw = new URLSearchParams(search).get('landmarks');
  if (!raw) return selected;
  const ids = raw.split(',').map(s => s.trim());
  if (ids.includes('all')) return new Set(LANDMARK_IDS);
  for (const id of ids) if (LANDMARK_IDS.includes(id)) selected.add(id);
  return selected;
}

// L1: the final airport (D6, `dd_pass: final`), built at the raised hall that blockout read 1 item 1 adopted (h122);
// `?landmarkVariant=` still picks among the files listed here, and none or an unknown one loads the default.
export const AIRPORT_VARIANTS = Object.freeze({
  h122: './assets/models/landmarks/airport.glb',
});
export const AIRPORT_DEFAULT_VARIANT = 'h122';

// One row per landmark GLB; rows join the asset registry's jobs only when the switch names them. A row joins under
// `row.switch ?? row.id` (ruling 88 and review 1 item 4: assets.js keeps the first row of an id, so the LOD1 file
// takes its own id and the airport's switch). `variants` maps `?landmarkVariant=` to a url; a row with a null url
// stays out of the jobs. L1 D6: airport-lod1.glb (scene key `airport-far`) is the far copy placeAirportLandmark
// switches to at AIRPORT_LOD_DISTANCE.
export const AIRPORT_LOD1_URL = './assets/models/landmarks/airport-lod1.glb';
export const LANDMARK_MODELS = [
  { id: 'kit-board', url: './assets/models/landmarks/kit-board.glb', source: 'landmark-blender' },
  { id: 'airport', url: AIRPORT_VARIANTS[AIRPORT_DEFAULT_VARIANT], source: 'landmark-blender', variants: AIRPORT_VARIANTS },
  { id: 'airport-far', switch: 'airport', url: AIRPORT_LOD1_URL, source: 'landmark-blender', lod: 1 },
];

/** `?landmarkVariant=` when it names a known variant, else null. */
export function landmarkVariant(search = globalThis.location?.search ?? '') {
  if (typeof search !== 'string' || !search) return null;
  const raw = new URLSearchParams(search).get('landmarkVariant');
  return raw && Object.hasOwn(AIRPORT_VARIANTS, raw) ? raw : null;
}

/** The LANDMARK_MODELS rows the switch enables, in row order (none with the switch absent), as registry jobs. */
export function landmarkJobs(search = globalThis.location?.search ?? '') {
  const selected = parseLandmarkSwitch(search);
  if (!selected.size) return [];
  const variant = landmarkVariant(search);
  return LANDMARK_MODELS
    .filter(row => selected.has(row.switch ?? row.id))
    .map(row => ({ id: row.id, url: (variant && row.variants?.[variant]) || row.url, source: row.source }))
    .filter(job => typeof job.url === 'string' && job.url);
}

/**
 * GLTFLoader passes node names through PropertyBinding.sanitizeNodeName, which strips `:`, so
 * `fringe:port-gantry:0:trolley` arrives as `fringeport-gantry0trolley`. Put back the exported glTF names
 * (the group ids section 1 keeps) from the parser's associations; the per-primitive meshes of a multi-material
 * node take that node's name. Returns `gltf.scene`.
 */
export function restoreNodeNames(gltf) {
  const nodes = gltf?.parser?.json?.nodes ?? [];
  const associations = gltf?.parser?.associations;
  gltf?.scene?.traverse((object) => {
    const index = associations?.get(object)?.nodes;
    if (Number.isInteger(index) && typeof nodes[index]?.name === 'string') object.name = nodes[index].name;
    // A node with several primitives loads as a group of meshes, one per primitive: they share its group id.
    else if (object.isMesh && object.parent && associations?.get(object.parent)?.nodes !== undefined) object.name = object.parent.name;
  });
  // L1: a landmark file names itself in its scene extras (`dd_landmark`), so a builder that has no registry (the
  // fringe builders run inside FringeLayer, after AssetRegistry.loadAll) can find the loaded scene by that key.
  const json = gltf?.parser?.json;
  const key = json?.scenes?.[json.scene ?? 0]?.extras?.dd_landmark;
  if (typeof key === 'string' && gltf?.scene) rememberLandmarkScene(key, gltf.scene);
  return gltf?.scene ?? null;
}

const LOADED_SCENES = new Map();
/** Keep a loaded landmark scene under its `dd_landmark` key (restoreNodeNames does this on load). */
export function rememberLandmarkScene(key, scene) {
  if (typeof key === 'string' && scene?.isObject3D) LOADED_SCENES.set(key, scene);
}
/** The loaded scene for a landmark key (`airport`, `airport-far`), or null. */
export function loadedLandmarkScene(key) {
  return LOADED_SCENES.get(key) ?? null;
}
export function forgetLandmarkScenes() {
  LOADED_SCENES.clear();
}

// ---------------------------------------------------------------- L1 airport stub (spec node_map, review 1 item 11)

export const AIRPORT_ROOT_NODE = 'fringe:tullamarine-buildings';
export const AIRPORT_LOD_DISTANCE = 400; // spec lod.LOD0 0-400 m, LOD1 beyond, measured from each node's bbox centre
// GLB node -> the JS object it goes under. Car parks A and B are the first and second JS group of that name, by
// addCarPark call order; the jet bridges replace the JS groups of the same names under the airport root.
export const AIRPORT_NODES = Object.freeze({
  'fringe:tullamarine-terminal-body': 'terminal',
  'fringe:tullamarine-hotel-body': 'hotel',
  'fringe:tullamarine-jetbridge:0': 'root',
  'fringe:tullamarine-jetbridge:1': 'root',
  'fringe:tullamarine-car-park-body:a': 'car-park:a',
  'fringe:tullamarine-car-park-body:b': 'car-park:b',
  'fringe:tullamarine-t2-body': 't2',
  'fringe:tullamarine-t2-jetway': 't2',
});
// JS children that stay in the set groups (spec stays_js): the letters, T2's digit slot, the pick proxies, and the
// hotel's door, forecourt and porch letters. Car parks keep their cars and the `:mark` bay lines.
const AIRPORT_KEEP = Object.freeze({
  terminal: new Set(['fringe:tullamarine-terminal-glass-mel', 'fringe:tullamarine-letters', 'fringe:tullamarine-tower-letters',
    'fringe:tullamarine-terminal-shell']),
  t2: new Set(['fringe:tullamarine-t2-letters', 'fringe:tullamarine-t2-digit']),
});
const AIRPORT_JS_REMOVED = Object.freeze(['fringe:tullamarine-jetbridge:0', 'fringe:tullamarine-jetbridge:1',
  'fringe:tullamarine-canopy-lamps']);
const CAR_PARK_MODEL_PART = /^fringe:tullamarine-car-park:(?!mark$)/;
// Ruling 90: the JS totem letters (s 2.15) overrun the GLB sign-totem blank (lx -35.8..-21.2, y 6.1..8.7 above y0),
// so with the switch on the stub scales the letter group to s 1.40 in x and y (depth kept, so they stay on the
// board) and centres the run on the blank. airport.js is not edited.
export const AIRPORT_TOTEM = Object.freeze({ name: 'fringe:tullamarine-letters', from: 2.15, to: 1.40, x: -28.5, y: 7.4 });
// The pick proxies move inside the GLB masses at either hall height (V5): the terminal shell inside the hall core and
// end bays (x -42.8..2.8, z 5.2..18.8, y 0..9.6), the hotel pick core inside the room block (x 28.35..41.65,
// z 2.6..11.0, y to 19.2). Root-local metres, y above the pad top y0.
const AIRPORT_PICK_BOXES = Object.freeze({
  'fringe:tullamarine-terminal-shell': Object.freeze({ x: -20, z: 12, y0: 1.1, size: [45.2, 8.0, 12.6] }),
  'fringe:tullamarine-hotel-tower': Object.freeze({ x: 35, z: 6.8, y0: 0.5, size: [12.3, 18.0, 7.4] }),
});

// L1 D5 item 4: with the switch on, a JS airport tree whose trunk base (its `userData.venueTree` x, z) falls inside a GLB
// node's plan footprint (the union of the node's triangles projected on y) is hidden, group and meshes: batching.js
// merges every mesh whose own `visible` is true, whatever its parents say. The tree stays in the graph, so its name,
// census and the switch-off scene are unchanged.
export const AIRPORT_TREE_PREFIX = 'fringe:tullamarine-tree:';

/** Plan triangles [ax, az, bx, bz, cx, cz] of a GLB node (root-local metres), with their bbox; vertical faces drop out. */
function planFootprint(node) {
  const tris = [];
  const box = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  const p = new THREE.Vector3();
  node.updateMatrixWorld(true);
  node.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    const n = index ? index.count : pos.count;
    const at = (k) => { p.fromBufferAttribute(pos, index ? index.getX(k) : k).applyMatrix4(mesh.matrixWorld); return [p.x, p.z]; };
    for (let k = 0; k < n; k += 3) {
      const [ax, az] = at(k), [bx, bz] = at(k + 1), [cx, cz] = at(k + 2);
      if (Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) < 1e-6) continue;
      tris.push([ax, az, bx, bz, cx, cz]);
      box.x0 = Math.min(box.x0, ax, bx, cx); box.x1 = Math.max(box.x1, ax, bx, cx);
      box.z0 = Math.min(box.z0, az, bz, cz); box.z1 = Math.max(box.z1, az, bz, cz);
    }
  });
  return { tris, box };
}

function inFootprint({ tris, box }, x, z) {
  if (x < box.x0 || x > box.x1 || z < box.z0 || z > box.z1) return false;
  for (const [ax, az, bx, bz, cx, cz] of tris) {
    const d = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    const u = ((x - ax) * (cz - az) - (z - az) * (cx - ax)) / d;
    const v = ((bx - ax) * (z - az) - (bz - az) * (x - ax)) / d;
    if (u >= 0 && v >= 0 && u + v <= 1) return true;
  }
  return false;
}

/** Hide the JS airport trees standing in a GLB node's footprint; `nodes` = [[name, node at root-local identity]]. */
function hideTreesUnderNodes(root, nodes) {
  const prints = nodes.map(([name, node]) => [name, planFootprint(node)]);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const trunk = new THREE.Vector3();
  const hidden = [];
  const trees = [];
  root.traverse((o) => { if (o.name?.startsWith(AIRPORT_TREE_PREFIX) && o.userData.venueTree) trees.push(o); });
  for (const tree of trees) {
    const { x, y, z } = tree.userData.venueTree;
    trunk.set(x, y, z).applyMatrix4(tree.parent.matrixWorld).applyMatrix4(toRoot);
    const under = prints.find(([, print]) => inFootprint(print, trunk.x, trunk.z));
    if (!under) continue;
    tree.traverse((o) => { o.visible = false; });
    hidden.push({ tree: tree.name, node: under[0], x: +trunk.x.toFixed(2), z: +trunk.z.toFixed(2) });
  }
  return hidden;
}

/** `fringe:<group>[:<id>]` -> `fringe:<group>-far[:<id>]`, the LOD1 copy's name (it keeps the naming scheme). */
export function airportFarName(name) {
  const m = /^fringe:([a-z0-9-]+)(:.+)?$/.exec(name ?? '');
  return m ? `fringe:${m[1]}-far${m[2] ?? ''}` : `${name}-far`;
}

function dropObject(object) {
  let meshes = 0;
  object.traverse((node) => {
    if (!node.isMesh) return;
    meshes += 1;
    if (node.userData.ownsGeometry) node.geometry?.dispose?.();
  });
  object.removeFromParent();
  return meshes;
}

// ---------------------------------------------------------------- L2a: clear the airport, the map's trees

// The classes L2a removes with the switch on (PLAN-L2 FP3, FP4 and amendment 1; m1 section 1.2), each pinned in
// tests/l2a-airport-clear.test.mjs by its removed meshes. The A380 and 747, their shades, and everything else stay.
export const AIRPORT_CLEAR_CLASSES = Object.freeze(['gse', 'apron-bus', 'fire-follow', 'road-cars', 'park-cars', 'taxis', 'crew',
  'pax', 'guests', 'private-jet', 't2-jet', 'jet-shades', 'trees']);
// Named groups directly under the airport root, by class (airport.js names them; ruling 89 keeps that file as it is).
const CLEAR_ROOT_NAMES = Object.freeze([
  [/^fringe:tullamarine-(?:tug:[a-z0-9-]+|baggage-tug|luggage-cart:\d+|fuel-bowser)$/, 'gse'],
  [/^fringe:tullamarine-apron-bus$/, 'apron-bus'],
  [/^fringe:tullamarine-(?:fire-tender|follow-me)$/, 'fire-follow'],
  [/^fringe:tullamarine-(?:ground|lane)-crew-pose:\d+$/, 'crew'],
  [/^fringe:tullamarine-jet-shade$/, 'jet-shades'],
]);
const CLEAR_TAXI = /^fringe:tullamarine-hotel-taxi:\d+$/; // two at the rank under the root, two at the porch under the hotel
const T2_JET = 'fringe:plane:t2-jet';
const T2_STAND = 'fringe:tullamarine-t2-stand';
// addCar's nine meshes (airport.js 1974): the body and cabin in one paint, glass, two lamps and four tyres.
const CAR_SIGNATURE = 'body,body,glass,tyre,tyre,tyre,tyre,white,white';
// The loose GSE standing straight on the root (GPUs, cones, the stacked container's top): an anchor in a GSE paint or
// cone orange, and its parts in these materials within 1.0 m of it in plan.
const GSE_PART_MATS = new Set(['dark', 'tyre', 'white', 'metal']);
const GSE_PART_REACH = 1.0;
// A contact patch (airport.js contactPatch, mats.contact) goes with the removed object standing on it: the nearest
// removed origin within 2.0 m in plan. The batter's long contact strip (addGroundApron) is wider than 12 m and stays.
const CONTACT_REACH = 2.0;
const CONTACT_MAX_SPAN = 12;

function materialKeyOf(mats) {
  const keys = new Map(Object.entries(mats ?? {}).map(([key, material]) => [material, key]));
  return (mesh) => keys.get(Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) ?? '';
}

function meshTriangles(object) {
  let meshes = 0, triangles = 0;
  object.traverse((m) => {
    if (!m.isMesh || !m.geometry?.attributes?.position) return;
    meshes += 1;
    const g = m.geometry;
    triangles += Math.floor((g.index ? g.index.count : g.attributes.position.count) / 3) * (m.isInstancedMesh ? m.count : 1);
  });
  return { meshes, triangles };
}

/**
 * The L2a removal units under the airport root, as [object, class]: the named groups, the unnamed vehicle and GSE
 * groups by their parts, the 30 figures by registerAirportFigure's tags, the two private jets with their shades,
 * the trees, the loose GSE by material and reach, and the contact patches under all of these. Read-only.
 */
export function airportClearUnits(root) {
  const data = root?.userData?.airport;
  const keyOf = materialKeyOf(data?.mats);
  const units = new Map();
  const take = (object, cls) => { if (object && !units.has(object)) units.set(object, cls); };
  const parts = (group) => { const out = []; group.traverse(m => { if (m.isMesh) out.push(keyOf(m)); }); return out; };
  const isCar = (group) => {
    const keys = parts(group);
    const body = keys.find(k => k.startsWith('gse'));
    return keys.map(k => (k === body ? 'body' : k)).sort().join(',') === CAR_SIGNATURE;
  };
  const isFigure = m => Boolean(m.userData?.airportFigure || m.userData?.airportSuitcase);

  for (const child of root.children) {
    if (child.userData?.landmark === 'airport') continue;
    const named = CLEAR_ROOT_NAMES.find(([pattern]) => pattern.test(child.name ?? ''));
    if (named) { take(child, named[1]); continue; }
    if (child.name?.startsWith(AIRPORT_TREE_PREFIX)) { take(child, 'trees'); continue; }
    if (!child.isMesh && !child.name && child.children.length) {
      // Unnamed groups: a road car by its parts; any other with a tyre or a GSE paint is ground equipment (ULDs,
      // dollies, the catering truck, belt loader and stairs). The `16` sign and the stand marks have neither.
      if (isCar(child)) take(child, 'road-cars');
      else if (parts(child).some(k => k === 'tyre' || k.startsWith('gse'))) take(child, 'gse');
    }
    if (child.name === 'fringe:tullamarine-car-park') {
      for (const car of child.children) if (!car.isMesh && !car.name && isCar(car)) take(car, 'park-cars');
    }
  }
  root.traverse((o) => { if (CLEAR_TAXI.test(o.name ?? '')) take(o, 'taxis'); });
  // Figures: the crew stand in their pose groups (taken above); passengers on the root, guests and their cases at the porch.
  root.traverse((m) => {
    if (!m.isMesh || !isFigure(m)) return;
    for (let p = m.parent; p && p !== root; p = p.parent) if (units.has(p)) return;
    const owner = m.userData.airportFigure?.owner ?? m.userData.airportSuitcase?.name ?? '';
    take(m, /-pax:/.test(owner) ? 'pax' : 'guests');
  });
  take(data?.jet, 'private-jet');
  const stand = root.getObjectByName(T2_STAND);
  take(stand?.getObjectByName(T2_JET), 't2-jet');
  for (const m of stand?.children ?? []) if (m.isMesh && /^shadeAir/.test(keyOf(m))) take(m, 'jet-shades');

  // Loose GSE on the root.
  const loose = root.children.filter(m => m.isMesh && !isFigure(m) && !units.has(m));
  const anchors = loose.filter(m => keyOf(m).startsWith('gse') || keyOf(m) === 'orange');
  for (const anchor of anchors) take(anchor, 'gse');
  for (const m of loose) {
    if (units.has(m) || !GSE_PART_MATS.has(keyOf(m))) continue;
    if (anchors.some(a => Math.hypot(a.position.x - m.position.x, a.position.z - m.position.z) <= GSE_PART_REACH)) take(m, 'gse');
  }

  // Contact patches under the removed objects (trees by their trunk, the rest by their origin).
  root.updateWorldMatrix(true, true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const at = new THREE.Vector3();
  const origins = [];
  for (const [object, cls] of units) {
    const tree = object.userData?.venueTree;
    if (tree) at.set(tree.x, tree.y, tree.z).applyMatrix4(object.parent.matrixWorld).applyMatrix4(toRoot);
    else at.setFromMatrixPosition(object.matrixWorld).applyMatrix4(toRoot);
    origins.push([at.x, at.z, cls]);
  }
  for (const m of root.children) {
    if (!m.isMesh || units.has(m) || keyOf(m) !== 'contact') continue;
    m.geometry.computeBoundingBox();
    const size = m.geometry.boundingBox.getSize(at);
    if (Math.max(size.x, size.z) > CONTACT_MAX_SPAN) continue;
    let best = null;
    for (const [x, z, cls] of origins) {
      const d = Math.hypot(x - m.position.x, z - m.position.z);
      if (d <= CONTACT_REACH && (!best || d < best[0])) best = [d, cls];
    }
    if (best) take(m, best[1]);
  }
  return [...units];
}

// L2a step 4 (PLAN-L2 FP5, m1 section 2.2): the airport's JS tree kinds become the city's own species at the size law.
export const AIRPORT_TREE_SPECIES = Object.freeze({ round: 'plane', umbrella: 'eucalypt', cypress: 'cypress', weeping: 'bottlebrush', palm: 'palm' });
export const AIRPORT_CITY_TREES = 'fringe:tullamarine-city-trees';
// FoliageLayer takes no placements after it is built (scene.js builds it before FringeLayer and sizes each species'
// instanced buffers to the city roster), and its species pass (mixStreetSpecies) re-routes every street species, so the
// airport trees cannot ride the city's own instanced meshes. Its materials are made inside its constructor. So a
// FoliageLayer is built here over a stand-in city of four trees that its own rules land on plane, eucalypt, cypress and
// palm, and the airport trees take those species meshes' materials; bottlebrush takes palm's, as the constructor gives
// every species that is neither a street variant nor broadleaf (leaf-cluster canopy, plain bark).
const MATERIAL_ROUTES = Object.freeze([
  { species: 'plane', tree: { x: 0, z: 0, model: 'plane-tree-london', role: 'airport-materials' } },
  { species: 'eucalypt', tree: { x: 200, z: 0, model: 'australian-eucalyptus', streetType: 'fringe' } },
  { species: 'cypress', tree: { x: 400, z: 0, model: 'australian-eucalyptus', role: 'reserve-avenue' } },
  { species: 'palm', tree: { x: 600, z: 0, model: 'melbourne-beach-palm', role: 'shore-palm' } },
]);
const SPECIES_MATERIAL_FROM = Object.freeze({ plane: 'plane', eucalypt: 'eucalypt', cypress: 'cypress', palm: 'palm', bottlebrush: 'palm' });

/** The city's tree materials per species ({ wood, leaf }), made by FoliageLayer's own constructor. */
export function cityTreeMaterials({ quality = 'high', reducedMotion = false } = {}) {
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

const unitFromKey = key => (hashSeed(key) >>> 0) / 4294967296;
const SEASON_PALETTE = { autumn: AUTUMN_LEAF_PALETTE, winter: WINTER_LEAF_PALETTE, green: INSTANCE_LEAF_PALETTE };

/**
 * Plant the city's species at the airport trunks: one InstancedMesh per species for the trunk, the canopy and the
 * canopy's fall layer, built from buildSpeciesGeometry with the city's materials, and posed and coloured as
 * FoliageLayer's instance loop does (size law, form class, lean, season palette, leaf bias, bark spread). No crown fit,
 * district tint, pit or contact blob: the airport has no parcels and its trees stand in turf.
 */
function plantCityTrees(root, trunks, { quality = 'high', reducedMotion = false } = {}) {
  const group = new THREE.Group();
  group.name = AIRPORT_CITY_TREES;
  group.userData.airportCityTrees = true;
  const report = { planted: [], meshes: 0, triangles: 0, calls: 0, quality };
  if (!trunks.length) return { group, report };
  const materials = cityTreeMaterials({ quality, reducedMotion });
  const placements = trunks.map(({ name, kind, x, y, z }) => {
    const speciesId = AIRPORT_TREE_SPECIES[kind] ?? 'plane';
    const salt = `airport:${name}`;
    const sizeClass = Math.floor(unitFromKey(`t12-size:${salt}`) * 4) % 4;
    const formClass = spatialFormClass(x, z);
    return { name, speciesId, x, y, z, salt, sizeClass, scale: FOLIAGE_SIZE_CLASS[sizeClass], formClass,
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
  const stand = placements.map(p => ({ speciesId: 'airport', x: p.x, z: p.z, season: p.season }));
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
    const meshes = [[built.wood, woodMat, 'trunk'], [built.leaf, leafMat, 'canopy'], ...(built.leafDrop ? [[built.leafDrop, leafMat, 'canopy-drop']] : [])]
      .map(([geometry, material, part]) => {
        geometry.setAttribute('aTap', new THREE.InstancedBufferAttribute(new Float32Array(batch.length), 1));
        const mesh = new THREE.InstancedMesh(geometry, material, batch.length);
        // The city's mesh names, so the style class and LOD families read them as street trees.
        mesh.name = `nature:foliage:${speciesId}:${part}`;
        mesh.userData.ownsGeometry = true;
        mesh.userData.airportCityTree = speciesId;
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

      const frame = treeFrame(p, speciesId, unitTop);
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
        height: +(frame.h * unitTop * frame.stretch).toFixed(2) });
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

/**
 * L2a, with the switch on and the GLB placed: detach every removal unit (airportClearUnits) and plant the city's
 * species at the JS trunks that stand clear of the GLB footprints (`skip`, the trunks hideTreesUnderNodes hid).
 * Detached, not hidden: batching.js would otherwise judge each mesh by its own flag. updateAirport re-poses the
 * private jet and its shade by reference, so those references are cleared and it skips them.
 */
function clearAirport(root, skip) {
  const data = root.userData.airport;
  const cleared = Object.fromEntries(AIRPORT_CLEAR_CLASSES.map(cls => [cls, { meshes: 0, triangles: 0 }]));
  // The quality the airport was built at, as adaptAirportHotelWeeping recorded it (placeAirportLandmark is not handed it).
  let quality = 'high';
  root.traverse((m) => { const q = m.userData?.r158DensityFloor?.requestedQuality; if (q) quality = q; });
  root.updateWorldMatrix(true, true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const trunks = [];
  const units = airportClearUnits(root);
  for (const [object, cls] of units) {
    const tree = object.userData?.venueTree;
    // A tree group the JS build left empty (clipVenueCityEdge took the palm at lx 17.1, whose crown crossed the city edge)
    // has no tree to replace.
    if (cls === 'trees' && tree && !skip.has(object.name) && meshTriangles(object).meshes > 0) {
      const p = new THREE.Vector3(tree.x, tree.y, tree.z).applyMatrix4(object.parent.matrixWorld).applyMatrix4(toRoot);
      trunks.push({ name: object.name, kind: tree.kind, x: p.x, y: p.y, z: p.z });
    }
  }
  for (const [object, cls] of units) {
    const { meshes, triangles } = meshTriangles(object);
    cleared[cls].meshes += meshes;
    cleared[cls].triangles += triangles;
    object.userData.l2aClass = cls; // tests and probes read the class off the detached unit
    dropObject(object);
  }
  if (data) {
    if (!data.jet?.parent) data.jet = null;
    if (!data.jetShade?.parent) data.jetShade = null;
  }
  const { group, report } = plantCityTrees(root, trunks, { quality, reducedMotion: Boolean(data?.reducedMotion) });
  if (group.children.length) root.add(group);
  return { cleared, removedMeshes: Object.values(cleared).reduce((n, c) => n + c.meshes, 0), cityTrees: report };
}

// ---------------------------------------------------------------- L2b: the parked level of the city's cars

// PLAN-L2 FP2 and amendment 2: the car parks take the parked level of the city's own traffic cars
// (assets/models/props/parked-cars.glb, exported from traffic.js's builders by scripts/assets/export-parked-cars.mjs;
// traffic.js is not imported here). The families that fit a 5.0 m stall; the taxi waits for the kerb package.
export const PARKED_CARS_KEY = 'parked-cars';
export const PARKED_CAR_TYPES = Object.freeze(['sedan', 'hatch', 'wagon']);
export const AIRPORT_PARKED_CARS = 'fringe:tullamarine-parked-cars';
export const AIRPORT_PARKED_COUNT = 20;
const PARK_MARK = 'fringe:tullamarine-car-park:mark';
// The roof bay lines (airport-models.js carParkModel): 0.12 m lines at a 2.6 m pitch, 5.0 m long, two rows across a
// 3.8 m aisle (2.8 m on car park B). Only the roof decks take cars: from stations A-landside and C-close no bay of a
// lower deck is in sight (a ray probe from car-top points, L2b dispatch 1), so they stay empty.
export const PARKED_BAY = Object.freeze({ stall: 5.0, pitch: 2.6, line: 0.12, tol: 0.05 });
// The deck under a bay is read from the GLB car-park node within this height of the bay line (m); a car's box from
// this far above its lowest wheel contact must cross no GLB triangle (cores, upstands, light poles).
const DECK_REACH = 0.3;
const BOX_LIFT = 0.15;
// FNV-1a (hashSeed) barely moves its high bits for keys that differ in the last character, so neighbouring bays drew
// the same type, paint and rank; the murmur3 finaliser spreads it.
function mixedUnit(key) {
  let h = hashSeed(key);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Root-local quads of a `:mark` mesh (four vertices each, in order), as { x0, x1, z0, z1, y }. */
function markQuads(mark, toRoot) {
  const pos = mark.geometry.attributes.position;
  const m = new THREE.Matrix4().multiplyMatrices(toRoot, mark.matrixWorld);
  const v = new THREE.Vector3();
  const quads = [];
  for (let q = 0; q + 4 <= pos.count; q += 4) {
    const pts = [0, 1, 2, 3].map(k => v.fromBufferAttribute(pos, q + k).applyMatrix4(m).clone());
    quads.push({
      x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)),
      z0: Math.min(...pts.map(p => p.z)), z1: Math.max(...pts.map(p => p.z)),
      y: pts.reduce((s, p) => s + p.y, 0) / 4,
    });
  }
  return quads;
}

/**
 * The roof bays of one car park, from its JS bay lines: a bay between two neighbouring stall lines of a row, with its
 * centre, the line height there and the way its nose points (away from the aisle, nose-in). Root-local metres.
 */
export function carParkBays(park, toRoot, label) {
  const mark = park.getObjectByName(PARK_MARK);
  if (!mark?.geometry) return [];
  const { stall, pitch, line, tol } = PARKED_BAY;
  const lines = markQuads(mark, toRoot).filter(q => Math.abs(q.z1 - q.z0 - stall) < tol && Math.abs(q.x1 - q.x0 - line) < tol);
  const rows = [...new Map(lines.map(l => [l.z0.toFixed(2), [l.z0, l.z1]])).values()].sort((a, b) => a[0] - b[0]);
  const bays = [];
  rows.forEach(([z0, z1], r) => {
    const other = rows[r === 0 ? 1 : 0];
    // The aisle lies toward the other row; the nose points the other way, into the stall's far end.
    const nose = other ? (other[0] > z0 ? -1 : 1) : 1;
    const row = lines.filter(l => Math.abs(l.z0 - z0) < 1e-3).sort((a, b) => a.x0 - b.x0);
    for (let i = 0; i + 1 < row.length; i += 1) {
      const a = row[i], b = row[i + 1];
      if (Math.abs(b.x0 - a.x0 - pitch) > tol) continue;
      bays.push({ id: `${label}:${r}:${i}`, park: label, row: r, index: i, x: (a.x0 + a.x1 + b.x0 + b.x1) / 4,
        z: (z0 + z1) / 2, y: (a.y + b.y) / 2, nose, inner: { x0: a.x1, x1: b.x0, z0, z1 } });
    }
  });
  return bays;
}

/** Root-local triangles of a placed node's meshes, as THREE.Triangle, and the upward ones (deck surfaces). */
function nodeTriangles(node, toRoot) {
  const all = [];
  node.updateWorldMatrix(true, true);
  node.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const m = new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld);
    const pos = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    const n = index ? index.count : pos.count;
    const at = k => new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(k) : k).applyMatrix4(m);
    for (let k = 0; k < n; k += 3) all.push(new THREE.Triangle(at(k), at(k + 1), at(k + 2)));
  });
  const normal = new THREE.Vector3();
  const up = all.filter(t => t.getNormal(normal).y > 0.9);
  return { all, up };
}

/** Height of the upward triangle under (x, z) nearest `near` (within DECK_REACH), or null. */
function deckHeight(up, x, z, near) {
  let best = null;
  for (const { a, b, c } of up) {
    const d = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    if (Math.abs(d) < 1e-9) continue;
    const u = ((x - a.x) * (c.z - a.z) - (z - a.z) * (c.x - a.x)) / d;
    const v = ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x)) / d;
    if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
    const y = a.y + u * (b.y - a.y) + v * (c.y - a.y);
    if (Math.abs(y - near) <= DECK_REACH && (best === null || Math.abs(y - near) < Math.abs(best - near))) best = y;
  }
  return best;
}

/** The parked-car types the loaded GLB carries: { type: { paint, detail, box, wheels, paints } } (node-local). */
export function parkedCarKit(scene) {
  const info = scene?.userData?.dd_parked_cars;
  if (!info) return null;
  const kit = {};
  for (const type of PARKED_CAR_TYPES) {
    const node = scene.getObjectByName(`parked-car:${type}`);
    const meshes = [];
    node?.traverse((m) => { if (m.isMesh) meshes.push(m); });
    const paint = meshes.find(m => !m.geometry.attributes.color);
    const detail = meshes.find(m => m.geometry.attributes.color);
    const t = info.types?.[type];
    if (!paint || !detail || !t || !info.paints?.[type]?.length) return null;
    kit[type] = { paint, detail, box: t.box, wheels: t.wheels, paints: info.paints[type] };
  }
  return kit;
}

/**
 * L2b: stand AIRPORT_PARKED_COUNT parked cars in the roof bays of car parks A and B. Bays come from the JS bay lines;
 * each bay's deck is read from the GLB car-park node under its four wheel contacts, the car seated on the plane through
 * them, nose-in and centred, at 1.0. A bay whose car box would cross any GLB triangle (a stair core, light pole or
 * upstand) is left out. The seed ranks the open bays and fills the first AIRPORT_PARKED_COUNT; it also picks each car's
 * type and the city paint. One InstancedMesh per type and primitive (paint, detail): at most six calls.
 */
function placeParkedCars(root, parkNodes, scene) {
  const report = { placed: 0, bays: 0, open: 0, perDeck: {}, types: {}, rejected: [], cars: [], meshes: 0, calls: 0,
    triangles: 0, reason: null };
  const kit = parkedCarKit(scene);
  if (!kit) { report.reason = 'parked-cars GLB not loaded'; return { group: null, report }; }
  root.updateWorldMatrix(true, true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const open = [];
  for (const { label, park, node } of parkNodes) {
    const { all, up } = nodeTriangles(node, toRoot);
    for (const bay of carParkBays(park, toRoot, label)) {
      report.bays += 1;
      open.push({ bay, all, up });
    }
  }
  // Seeded order over every bay; each is posed for its drawn type and taken while clear, until the count is reached.
  const rank = bay => mixedUnit(`l2b-parked:${bay.id}`);
  open.sort((p, q) => rank(p.bay) - rank(q.bay) || (p.bay.id < q.bay.id ? -1 : 1));
  const yaw = new THREE.Quaternion(), tilt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3(), corner = new THREE.Vector3();
  const box = new THREE.Box3();
  const chosen = [];
  for (const { bay, all, up: deck } of open) {
    const type = PARKED_CAR_TYPES[Math.floor(mixedUnit(`l2b-type:${bay.id}`) * PARKED_CAR_TYPES.length) % PARKED_CAR_TYPES.length];
    const k = kit[type];
    const paint = k.paints[Math.floor(mixedUnit(`l2b-paint:${bay.id}`) * k.paints.length) % k.paints.length];
    yaw.setFromAxisAngle(up, bay.nose > 0 ? 0 : Math.PI);
    // Wheel contacts in the bay (car +z is its nose), and the deck under each.
    const contacts = k.wheels.map(([wx, wz]) => {
      const p = new THREE.Vector3(wx, 0, wz).applyQuaternion(yaw);
      const x = bay.x + p.x, z = bay.z + p.z;
      return { x, z, y: deckHeight(deck, x, z, bay.y) };
    });
    if (contacts.some(c => c.y === null)) { report.rejected.push({ bay: bay.id, why: 'no deck' }); continue; }
    // Least-squares plane y = a + b (x - bay.x) + c (z - bay.z) through the contacts.
    const n = contacts.length;
    const mx = contacts.reduce((s, c) => s + c.x - bay.x, 0) / n, mz = contacts.reduce((s, c) => s + c.z - bay.z, 0) / n;
    const my = contacts.reduce((s, c) => s + c.y, 0) / n;
    let sxx = 0, szz = 0, sxz = 0, sxy = 0, szy = 0;
    for (const c of contacts) {
      const dx = c.x - bay.x - mx, dz = c.z - bay.z - mz, dy = c.y - my;
      sxx += dx * dx; szz += dz * dz; sxz += dx * dz; sxy += dx * dy; szy += dz * dy;
    }
    const det = sxx * szz - sxz * sxz;
    const b = Math.abs(det) > 1e-12 ? (sxy * szz - szy * sxz) / det : 0;
    const c = Math.abs(det) > 1e-12 ? (szy * sxx - sxy * sxz) / det : 0;
    const y = my - b * mx - c * mz;
    normal.set(-b, 1, -c).normalize();
    tilt.setFromUnitVectors(up, normal);
    const quaternion = tilt.clone().multiply(yaw);
    const position = new THREE.Vector3(bay.x, y, bay.z);
    // The car's box in the root frame, from BOX_LIFT above the deck; it must cross no triangle of the car park.
    box.makeEmpty();
    for (const sx of [0, 1]) for (const sy of [0, 1]) for (const sz of [0, 1]) {
      corner.set(sx ? k.box.max[0] : k.box.min[0], sy ? k.box.max[1] : k.box.min[1], sz ? k.box.max[2] : k.box.min[2])
        .applyQuaternion(quaternion).add(position);
      box.expandByPoint(corner);
    }
    box.min.y = Math.max(...contacts.map(p => p.y)) + BOX_LIFT;
    const hit = all.find(t => box.intersectsTriangle(t));
    if (hit) { report.rejected.push({ bay: bay.id, why: 'structure' }); continue; }
    report.open += 1;
    if (chosen.length < AIRPORT_PARKED_COUNT) chosen.push({ bay, type, paint, position, quaternion, contacts, box: box.clone() });
  }

  const group = new THREE.Group();
  group.name = AIRPORT_PARKED_CARS;
  group.userData.airportParkedCars = true;
  const matrix = new THREE.Matrix4(), unit = new THREE.Vector3(1, 1, 1), colour = new THREE.Color();
  for (const type of PARKED_CAR_TYPES) {
    const cars = chosen.filter(car => car.type === type);
    if (!cars.length) continue;
    const { paint, detail } = kit[type];
    for (const [source, part, shadow] of [[paint, 'paint', true], [detail, 'detail', false]]) {
      const mesh = new THREE.InstancedMesh(source.geometry, source.material, cars.length);
      mesh.name = `${AIRPORT_PARKED_CARS}:${type}-${part}`;
      cars.forEach((car, i) => {
        matrix.compose(car.position, car.quaternion, unit);
        mesh.setMatrixAt(i, matrix);
        if (part === 'paint') mesh.setColorAt(i, colour.set(car.paint));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.raycast = () => {};
      mesh.userData.airportParkedCar = type;
      mesh.computeBoundingSphere();
      group.add(mesh);
      const { triangles } = meshTriangles(mesh);
      report.meshes += 1;
      report.calls += 1;
      report.triangles += triangles;
    }
    report.types[type] = cars.length;
  }
  for (const car of chosen) {
    report.perDeck[car.bay.park] = (report.perDeck[car.bay.park] ?? 0) + 1;
    report.cars.push({ bay: car.bay.id, type: car.type, paint: car.paint, x: +car.position.x.toFixed(3),
      y: +car.position.y.toFixed(3), z: +car.position.z.toFixed(3), nose: car.bay.nose,
      contacts: car.contacts.map(p => +p.y.toFixed(3)) });
  }
  report.placed = chosen.length;
  return { group: chosen.length ? group : null, report, chosen };
}

// L1 D6 item 3: the airport files carry KHR_mesh_quantization (positions as normalized shorts in a per-mesh cube, the
// dequantisation scale and offset on the mesh's node; normals as bytes). GLTFLoader decodes it with no decoder, and
// placement below moves each node to its LOD's centre, so the node's own transform is baked into float positions and
// normals first; UV and COLOR_0 stay as the normalized attributes three.js reads directly.
const DEQUANTIZED = new WeakMap();
function floatAttribute(attribute) {
  const { itemSize, count } = attribute;
  const out = new Float32Array(count * itemSize);
  for (let i = 0; i < count; i += 1) for (let k = 0; k < itemSize; k += 1) out[i * itemSize + k] = attribute.getComponent(i, k);
  return new THREE.BufferAttribute(out, itemSize);
}
/** The mesh's geometry with `matrix` (its transform within its landmark node) baked into float POSITION and NORMAL. */
export function bakedGeometry(geometry, matrix) {
  const position = geometry.attributes.position;
  const quantized = !(position.array instanceof Float32Array) || position.normalized;
  const identity = matrix.equals(new THREE.Matrix4());
  if (!quantized && identity) return geometry;
  const key = `${matrix.elements.join(',')}`;
  const cached = DEQUANTIZED.get(geometry);
  if (cached?.key === key) return cached.geometry;
  const out = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    out.setAttribute(name, name === 'position' || name === 'normal' ? floatAttribute(attribute) : attribute);
  }
  out.setIndex(geometry.index);
  for (const group of geometry.groups) out.addGroup(group.start, group.count, group.materialIndex);
  if (!identity) out.applyMatrix4(matrix);
  out.computeBoundingBox();
  out.computeBoundingSphere();
  DEQUANTIZED.set(geometry, { key, geometry: out });
  return out;
}

function landmarkNode(source, name) {
  let found = null;
  for (const child of source.children) if (child.name === name) { found = child; break; }
  if (!found) return null;
  const node = found.clone(true);
  // Bake every mesh's transform within the node (the dequantisation scale and offset) before the node's goes.
  node.position.set(0, 0, 0);
  node.quaternion.identity();
  node.scale.set(1, 1, 1);
  node.updateMatrix();
  const inNode = new THREE.Matrix4();
  found.updateWorldMatrix(true, true);
  const sourceInv = new THREE.Matrix4().copy(found.parent?.matrixWorld ?? new THREE.Matrix4()).invert();
  const sources = [];
  found.traverse((o) => { if (o.isMesh) sources.push(o); });
  let k = 0;
  node.traverse((o) => {
    if (!o.isMesh) return;
    const from = sources[k++];
    inNode.multiplyMatrices(sourceInv, from.matrixWorld);
    o.geometry = bakedGeometry(from.geometry, inNode);
    if (o !== node) { o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1); }
  });
  node.traverse((o) => {
    o.userData.landmark = 'airport';
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.raycast = () => {}; // picking goes through the fringe pick proxies, as for the JS parts
    }
  });
  node.updateMatrixWorld(true);
  return node;
}

/**
 * L1 integration stub: with `?landmarks=airport` and the airport GLB loaded, put the GLB set at the airport frame
 * (each node under its JS group, at the JS root's transform with y = y0, inside a THREE.LOD at its bbox centre that
 * switches to the `airport-far` copy at 400 m when that file is loaded) and remove the JS parts the nodes replace.
 * Called once at the end of addAirport. Without the switch it returns null and touches nothing; without the GLB the
 * JS stays as the fallback. The report is left on `root.userData.airportLandmark`.
 */
export function placeAirportLandmark(root, {
  y0 = 0,
  search = globalThis.location?.search ?? '',
  scene = loadedLandmarkScene('airport'),
  far = loadedLandmarkScene('airport-far'),
  cars = loadedLandmarkScene(PARKED_CARS_KEY),
} = {}) {
  if (!root || !parseLandmarkSwitch(search).has('airport')) return null;
  if (root.userData.airportLandmark?.placed) return root.userData.airportLandmark;
  const report = { placed: false, y0, variant: landmarkVariant(search) ?? AIRPORT_DEFAULT_VARIANT, nodes: 0, calls: 0,
    triangles: 0, callsFar: 0, trianglesFar: 0, removedMeshes: 0, lod1: false, hiddenTrees: [], cleared: null,
    clearedMeshes: 0, cityTrees: null, parkedCars: null, reason: null };
  root.userData.airportLandmark = report;
  const source = scene?.getObjectByName?.(AIRPORT_ROOT_NODE);
  if (!source) { report.reason = 'airport GLB not loaded'; return report; }
  const farSource = far?.getObjectByName?.(AIRPORT_ROOT_NODE) ?? null;
  const parks = root.children.filter(child => child.name === 'fringe:tullamarine-car-park');
  const parents = {
    root,
    terminal: root.getObjectByName('fringe:tullamarine-terminal'),
    hotel: root.getObjectByName('fringe:tullamarine-hotel'),
    t2: root.getObjectByName('fringe:tullamarine-t2'),
    'car-park:a': parks[0],
    'car-park:b': parks[1],
  };
  const missing = Object.entries(parents).filter(([, group]) => !group).map(([key]) => key);
  const nodes = Object.keys(AIRPORT_NODES).map(name => [name, landmarkNode(source, name)]);
  missing.push(...nodes.filter(([, node]) => !node).map(([name]) => name));
  if (missing.length) { report.reason = `missing ${missing.join(', ')}`; return report; }

  // Remove the JS parts the GLB replaces. The terminal shell (a pick proxy) leaves terminal-body first.
  const { terminal, hotel, t2 } = parents;
  root.updateWorldMatrix(true, true);
  const shell = terminal.getObjectByName('fringe:tullamarine-terminal-shell');
  if (shell) terminal.attach(shell);
  for (const child of [...terminal.children]) if (!AIRPORT_KEEP.terminal.has(child.name)) report.removedMeshes += dropObject(child);
  for (const child of [...hotel.children]) if (child.name === 'fringe:tullamarine-hotel-body') report.removedMeshes += dropObject(child);
  for (const child of [...t2.children]) if (!AIRPORT_KEEP.t2.has(child.name)) report.removedMeshes += dropObject(child);
  for (const park of parks.slice(0, 2)) {
    const parts = [];
    park.traverse(node => { if (node.isMesh && CAR_PARK_MODEL_PART.test(node.name)) parts.push(node); });
    for (const part of parts) report.removedMeshes += dropObject(part);
  }
  for (const child of [...root.children]) if (AIRPORT_JS_REMOVED.includes(child.name)) report.removedMeshes += dropObject(child);
  for (const [name, box] of Object.entries(AIRPORT_PICK_BOXES)) {
    const proxy = root.getObjectByName(name);
    if (!proxy?.isMesh) continue;
    proxy.geometry = new THREE.BoxGeometry(...box.size);
    proxy.position.set(box.x, y0 + box.y0 + box.size[1] / 2, box.z);
    proxy.rotation.set(0, 0, 0);
    proxy.visible = false;
  }

  // D5 item 4: the trees standing in a node's footprint, read while the nodes are still at the root-local identity.
  root.updateWorldMatrix(true, true);
  report.hiddenTrees = hideTreesUnderNodes(root, nodes);
  // L2a: the GSE, vehicles, figures, private jets and JS trees leave; the city's species stand at the trunks clear of
  // the GLB footprints (the trees just hidden are not replanted).
  const clear = clearAirport(root, new Set(report.hiddenTrees.map(h => h.tree)));
  report.cleared = clear.cleared;
  report.clearedMeshes = clear.removedMeshes;
  report.cityTrees = clear.cityTrees;

  // Place each node in a LOD at its bbox centre, at the JS root's frame (root-local metres, y up from y0).
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const at = new THREE.Matrix4();
  for (const [name, node] of nodes) {
    const parent = parents[AIRPORT_NODES[name]];
    const box = new THREE.Box3().setFromObject(node);
    box.getCenter(centre);
    box.getSize(size);
    node.position.copy(centre).negate();
    const lod = new THREE.LOD();
    lod.userData.landmark = 'airport';
    // D6 item 4: batching.js world-bakes static meshes under 6 m (the jet-bridge glass), which would take them out of
    // the LOD and show both levels at every distance; since P22 (ba0fd86e) it leaves every mesh under an ancestor with
    // this flag live, so each level keeps switching with its node. batching.js is not edited here.
    lod.userData.dynamicVisibility = true;
    lod.addLevel(node, 0);
    const farNode = farSource ? landmarkNode(farSource, name) : null;
    if (farNode) {
      farNode.traverse((o) => { if (o.name === name) o.name = airportFarName(name); });
      farNode.position.copy(centre).negate();
      lod.addLevel(farNode, AIRPORT_LOD_DISTANCE);
      report.lod1 = true;
    }
    let shownFar = true;
    for (let n = parent; n && n !== root.parent; n = n.parent) if (!n.visible) shownFar = false;
    farNode?.traverse((o) => {
      if (!o.isMesh) return;
      const index = o.geometry.index;
      report.trianglesFar += (index ? index.count : o.geometry.attributes.position.count) / 3;
      if (shownFar) report.callsFar += 1;
    });
    at.copy(parent.matrixWorld).invert().multiply(root.matrixWorld)
      .multiply(new THREE.Matrix4().makeTranslation(centre.x, centre.y + y0, centre.z));
    at.decompose(lod.position, lod.quaternion, lod.scale);
    parent.add(lod);
    report.nodes += 1;
    let shown = true;
    for (let n = parent; n && n !== root.parent; n = n.parent) if (!n.visible) shown = false;
    node.traverse((o) => {
      if (!o.isMesh) return;
      const index = o.geometry.index;
      report.triangles += (index ? index.count : o.geometry.attributes.position.count) / 3;
      if (shown) report.calls += 1;
    });
  }
  // L2b: the parked level of the city's cars in the roof bays of car parks A and B, on the GLB decks just placed.
  const parkNodes = ['a', 'b'].map(label => ({ label, park: parents[`car-park:${label}`],
    node: nodes.find(([name]) => name === `fringe:tullamarine-car-park-body:${label}`)[1] }));
  const parked = placeParkedCars(root, parkNodes, cars);
  if (parked.group) root.add(parked.group);
  report.parkedCars = parked.report;
  // Ruling 90: the totem letters at s 1.40, centred on the blank.
  const totem = terminal.getObjectByName(AIRPORT_TOTEM.name);
  if (totem) {
    const k = AIRPORT_TOTEM.to / AIRPORT_TOTEM.from;
    totem.scale.set(totem.scale.x * k, totem.scale.y * k, totem.scale.z);
    terminal.updateWorldMatrix(true, true);
    const run = new THREE.Box3().setFromObject(totem);
    const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
    run.applyMatrix4(toRoot);
    const mid = run.getCenter(new THREE.Vector3());
    totem.position.x += AIRPORT_TOTEM.x - mid.x;
    totem.position.y += y0 + AIRPORT_TOTEM.y - mid.y;
    report.totem = { scale: k, run: +(run.max.x - run.min.x).toFixed(3) };
  }
  // Blockout read 1 item 5: the T2 nodes follow fringe:tullamarine-t2's visibility. They are its children and
  // inherit it, so each LOD stays visible itself, re-asserted after every venue sync; a direct t2.visible = true
  // shows them as well.
  const t2Lods = t2.children.filter(child => child.isLOD && child.userData.landmark === 'airport');
  const follow = () => { for (const lod of t2Lods) lod.visible = true; };
  const sync = root.userData.syncVenues;
  if (typeof sync === 'function' && !sync.airportLandmark) {
    const wrapped = (venues) => { const out = sync(venues); follow(); return out; };
    wrapped.airportLandmark = true;
    root.userData.syncVenues = wrapped;
  }
  follow();
  report.placed = true;
  return report;
}

export const KIT_BOARD_NODE = 'fringe:landmark-kit-board';
// Review feedback-3 items 1-2 and ruling 87: the 42 x 50 m apron centred at (-124, 66) with yaw 0 (footprint
// x -145..-103, z 41..91), the nearest site in the page scan (10 m grid, 450 m of the board centre) whose
// rendered-ground spread is within 1.5 m and whose footprint + 3 m is clear of fringe and scene meshes other than
// ground dressing (fringe:venue-ground-scrub-contact, which the apron covers) and droppable scatter. Seated on the
// rendered ground sampled on a 4 m grid (11 x 13), at the highest sample + 0.05 m, with a skirt to the lowest
// - 0.3 m; a site whose samples spread more than 1.5 m is refused. Fringe scatter instances within the footprint
// + 3 m are dropped.
export const KIT_BOARD_PLACE = Object.freeze({
  x: -124, z: 66, yaw: 0, halfX: 21, halfZ: 25, apronTop: 0.45,
  step: 4, lift: 0.05, skirtDrop: 0.3, maxSpread: 1.5, clearPad: 3,
});

// The scatter the board may drop (review feedback-3 item 1: tussock and rock scatter); anything else in the
// footprint + 3 m disqualifies the site rather than being removed.
export const KIT_BOARD_SCATTER = /tussock|tuft|scrub|rock|boulder/i;

/** The 11 x 13 seating samples (world x, z) over the footprint. */
export function kitBoardSamples(place = KIT_BOARD_PLACE) {
  const out = [];
  const nx = Math.floor((2 * place.halfX) / place.step), nz = Math.floor((2 * place.halfZ) / place.step);
  for (let j = 0; j <= nz; j += 1) {
    for (let i = 0; i <= nx; i += 1) out.push([place.x - (nx * place.step) / 2 + i * place.step, place.z - (nz * place.step) / 2 + j * place.step]);
  }
  return out;
}

/** Drop (zero-scale) every instance of a `fringe:` scatter InstancedMesh whose position lies in `rect`; returns the count. */
export function clearKitBoardSite(scene, rect, skip = null) {
  let cleared = 0;
  const m = new THREE.Matrix4(), w = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse((mesh) => {
    if (!mesh.isInstancedMesh || !/^fringe:/.test(mesh.name ?? '') || !KIT_BOARD_SCATTER.test(mesh.name) || (skip && isUnder(mesh, skip))) return;
    let changed = false;
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, m);
      if (m.elements[0] === 0 && m.elements[1] === 0 && m.elements[2] === 0) continue; // already dropped
      w.multiplyMatrices(mesh.matrixWorld, m).decompose(pos, q, sc);
      if (pos.x < rect.x0 || pos.x > rect.x1 || pos.z < rect.z0 || pos.z > rect.z1) continue;
      m.decompose(pos, q, sc);
      m.compose(pos, q, sc.set(0, 0, 0));
      mesh.setMatrixAt(i, m);
      changed = true;
      cleared += 1;
    }
    if (changed) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere?.();
      mesh.computeBoundingBox?.();
    }
  });
  return cleared;
}

function isUnder(node, root) {
  for (let n = node; n; n = n.parent) if (n === root) return true;
  return false;
}

/**
 * Put the K1 kit board beside the city board, only when `?landmarks=` names kit-board and the registry
 * loaded it. `surfaceY(x, z)` is fringe.js's sampler of the built ground sheet (the rendered triangles,
 * FringeLayer._sampleHinterlandY); where it returns null, `groundSampler(plan)` (fringe.js
 * hinterlandGroundSampler, the analytic surface it tracks to ~0.2 m) stands in. `ground` overrides both in
 * tests. The site report is left on `scene.userData.kitBoardSite`.
 */
export function placeKitBoard(scene, registry, plan, {
  search = globalThis.location?.search ?? '',
  groundSampler = null,
  surfaceY = null,
  ground = null,
  place = KIT_BOARD_PLACE,
} = {}) {
  if (!scene || !parseLandmarkSwitch(search).has('kit-board')) return null;
  const placed = scene.getObjectByName(KIT_BOARD_NODE);
  if (placed?.userData.landmark === 'kit-board') return placed; // once per scene
  const source = registry?.get?.('kit-board')?.scene?.getObjectByName?.(KIT_BOARD_NODE);
  if (!source) return null;
  let analytic = null;
  let built = 0;
  const heightAt = ground ?? ((x, z) => {
    const y = surfaceY?.(x, z);
    if (Number.isFinite(y)) { built += 1; return y; }
    analytic ??= groundSampler?.(plan) ?? (() => 0);
    return analytic(x, z);
  });
  const samples = kitBoardSamples(place);
  const heights = samples.map(([x, z]) => heightAt(x, z));
  const min = Math.min(...heights), max = Math.max(...heights);
  const site = { samples: samples.length, min, max, spread: max - min, builtSamples: built, seat: null, cleared: 0, refused: false };
  scene.userData.kitBoardSite = site;
  if (!(max - min <= place.maxSpread)) { site.refused = true; return null; }
  const seat = max + place.lift;
  const board = source.clone(true);
  board.position.set(place.x, seat - place.apronTop, place.z);
  board.rotation.set(0, place.yaw, 0);
  board.userData.landmark = 'kit-board';
  board.traverse((node) => {
    if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
  });
  // Skirt from the apron's underside down to the lowest sample - 0.3 m, in the apron's material.
  const bottom = min - place.skirtDrop, top = seat - place.apronTop;
  const apron = board.getObjectByName(`${KIT_BOARD_NODE}:apron`);
  if (apron?.material && top - bottom > 0.01) {
    const geometry = new THREE.BoxGeometry(2 * place.halfX, top - bottom, 2 * place.halfZ);
    const n = geometry.getAttribute('position').count;
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(0.8), 3));
    const skirt = new THREE.Mesh(geometry, apron.material);
    skirt.name = `${KIT_BOARD_NODE}:skirt`;
    skirt.position.set(0, (bottom + top) / 2 - top, 0);
    skirt.receiveShadow = true;
    board.add(skirt);
  }
  site.seat = seat;
  const pad = place.clearPad;
  site.cleared = clearKitBoardSite(scene, {
    x0: place.x - place.halfX - pad, x1: place.x + place.halfX + pad,
    z0: place.z - place.halfZ - pad, z1: place.z + place.halfZ + pad,
  });
  scene.add(board);
  return board;
}
