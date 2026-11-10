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
import { SOUTHERN_CROSS_MODELS } from './landmarks-southern-cross-models.js';
import { albertParkModels } from './landmark-albert-park.js';
import { portLandmarkModels } from './landmark-port.js';
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
export const ROD_LAVER_LOD1_URL = './assets/models/landmarks/rod-laver-lod1.glb';
// R127: use the existing L2b prop scene. AssetRegistry deduplicates this id
// when airport and Rod Laver are selected together.
export const PARKED_CARS_JOB = Object.freeze({ id: 'parked-cars', url: './assets/models/props/parked-cars.glb', source: 'prop-scene' });
export const LANDMARK_MODELS = [
  { id: 'kit-board', url: './assets/models/landmarks/kit-board.glb', source: 'landmark-blender' },
  { id: 'airport', url: AIRPORT_VARIANTS[AIRPORT_DEFAULT_VARIANT], source: 'landmark-blender', variants: AIRPORT_VARIANTS },
  { id: 'airport-far', switch: 'airport', url: AIRPORT_LOD1_URL, source: 'landmark-blender', lod: 1 },
  { id: 'rod-laver', url: './assets/models/landmarks/rod-laver.glb', source: 'landmark-blender' },
  { id: 'rod-laver-far', switch: 'rod-laver', url: ROD_LAVER_LOD1_URL, source: 'landmark-blender', lod: 1 },
  ...SOUTHERN_CROSS_MODELS,
  ...albertParkModels(),
  ...portLandmarkModels(),
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
  const jobs = LANDMARK_MODELS
    .filter(row => selected.has(row.switch ?? row.id))
    .map(row => ({ id: row.id, url: (variant && row.variants?.[variant]) || row.url, source: row.source }))
    .filter(job => typeof job.url === 'string' && job.url);
  if (selected.has('rod-laver')) jobs.push(PARKED_CARS_JOB);
  return jobs;
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

// R131: smallest existing city size class, then the least outward radial move
// for 0.5 m clearance at both LODs. Keep the source-site form, yaw and colour.
// Measured old/new sites and minimum moves are pinned in the Rod Laver spec/tests.
const ROD_LAVER_TREE_MOVES = Object.freeze({
  'fringe:rod-laver-form-trees:cypress:0:0': 1.3977,
  'fringe:rod-laver-form-trees:cypress:0:1': 9.3389,
  'fringe:rod-laver-form-trees:cypress:2:1': 0.745,
  'fringe:rod-laver-form-trees:eucalypt:2:1': 0.7996,
  'fringe:rod-laver-form-trees:plane:1:3': 19.1304,
  'fringe:rod-laver-form-trees:plane:2:autumn:0': 2.9335,
});

/**
 * Plant the city's species at the airport trunks: one InstancedMesh per species for the trunk, the canopy and the
 * canopy's fall layer, built from buildSpeciesGeometry with the city's materials, and posed and coloured as
 * FoliageLayer's instance loop does (size law, form class, lean, season palette, leaf bias, bark spread). No crown fit,
 * district tint, pit or contact blob: the airport has no parcels and its trees stand in turf.
 */
function plantCityTrees(root, trunks, { quality = 'high', reducedMotion = false, landmark = 'airport', fallLayer = true } = {}) {
  const group = new THREE.Group();
  group.name = landmark === 'airport' ? AIRPORT_CITY_TREES : 'fringe:rod-laver-city-trees';
  group.userData[landmark === 'airport' ? 'airportCityTrees' : 'rodLaverCityTrees'] = true;
  const report = { planted: [], meshes: 0, triangles: 0, calls: 0, quality };
  if (!trunks.length) return { group, report };
  const materials = cityTreeMaterials({ quality, reducedMotion });
  const placements = trunks.map(({ name, kind, species, x, y, z, sourceCrownRadius }) => {
    const speciesId = species ?? AIRPORT_TREE_SPECIES[kind] ?? 'plane';
    const salt = `${landmark}:${name}`;
    const sizeClass = Math.floor(unitFromKey(`t12-size:${salt}`) * 4) % 4;
    const formClass = spatialFormClass(x, z);
    return { name, speciesId, x, y, z, sourceCrownRadius, salt, sizeClass, scale: FOLIAGE_SIZE_CLASS[sizeClass], formClass,
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
    const meshes = [[built.wood, woodMat, 'trunk'], [built.leaf, leafMat, 'canopy'], ...(fallLayer && built.leafDrop ? [[built.leafDrop, leafMat, 'canopy-drop']] : [])]
      .map(([geometry, material, part]) => {
        geometry.setAttribute('aTap', new THREE.InstancedBufferAttribute(new Float32Array(batch.length), 1));
        const mesh = new THREE.InstancedMesh(geometry, material, batch.length);
        // The city's mesh names, so the style class and LOD families read them as street trees.
        mesh.name = `nature:foliage:${speciesId}:${part}`;
        mesh.userData.ownsGeometry = true;
        mesh.userData[landmark === 'airport' ? 'airportCityTree' : 'rodLaverCityTree'] = speciesId;
        mesh.castShadow = quality !== 'low';
        mesh.receiveShadow = true;
        mesh.raycast = () => {};
        return mesh;
      });
    if (!fallLayer) built.leafDrop?.dispose();
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

      const radialMove = landmark === 'rod-laver' ? ROD_LAVER_TREE_MOVES[p.name] : undefined;
      // R139: measure every existing class in this site's unchanged form/yaw.
      // R131's six clearance sites retain their smallest class and radial move.
      let crownChoice = null;
      if (landmark === 'rod-laver') {
        const point = new THREE.Vector3(), leaf = built.leaf.attributes.position;
        const variants = FOLIAGE_SIZE_CLASS.map((sizeScale, sizeClass) => {
          const f = treeFrame({ ...p, sizeClass, scale: sizeScale }, speciesId, unitTop);
          euler.y = p.yaw; quaternion.setFromEuler(euler);
          leanAxis.set(Math.cos(f.leanDir), 0, Math.sin(f.leanDir));
          quaternion.premultiply(leanQuat.setFromAxisAngle(leanAxis, f.leanAmt));
          matrix.compose(position.set(0, 0, 0), quaternion, scale.set(f.h * f.girthX, f.h * f.stretch, f.h * f.girthZ));
          let radius = 0;
          for (let v = 0; v < leaf.count; v += 1) {
            point.fromBufferAttribute(leaf, v).applyMatrix4(matrix);
            radius = Math.max(radius, Math.hypot(point.x, point.z));
          }
          return { sizeClass, radius };
        });
        crownChoice = radialMove === undefined
          ? variants.reduce((a, b) => Math.abs(b.radius - p.sourceCrownRadius) < Math.abs(a.radius - p.sourceCrownRadius) ? b : a)
          : variants[0];
      }
      const sizeClass = crownChoice?.sizeClass ?? p.sizeClass;
      const frame = treeFrame({ ...p, sizeClass, scale: FOLIAGE_SIZE_CLASS[sizeClass] }, speciesId, unitTop);
      const radialScale = radialMove === undefined ? 1 : 1 + radialMove / Math.hypot(p.x, p.z);
      position.set(p.x * radialScale, p.y, p.z * radialScale);
      euler.y = p.yaw;
      quaternion.setFromEuler(euler);
      leanAxis.set(Math.cos(frame.leanDir), 0, Math.sin(frame.leanDir));
      leanQuat.setFromAxisAngle(leanAxis, frame.leanAmt);
      quaternion.premultiply(leanQuat);
      scale.set(frame.h * frame.girthX, frame.h * frame.stretch, frame.h * frame.girthZ);
      matrix.compose(position, quaternion, scale);
      meshes.forEach((mesh, k) => { mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, k === 0 ? barkColor : leafColor); });
      report.planted.push({ tree: p.name, species: speciesId, season: p.season, x: +position.x.toFixed(2), z: +position.z.toFixed(2),
        height: +(frame.h * unitTop * frame.stretch).toFixed(2),
        ...(crownChoice ? { sizeClass, sourceCrownRadius: p.sourceCrownRadius, crownRadius: crownChoice.radius,
          crownResidualM: crownChoice.radius - p.sourceCrownRadius, clearanceException: radialMove !== undefined } : {}) });
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

/** One type of the loaded parked-car GLB: { paint, detail, box, wheels, paints } (node-local), or null. */
function parkedCarPart(scene, info, type) {
  if (!scene || !info) return null;
  const node = scene.getObjectByName(`parked-car:${type}`);
  const meshes = [];
  node?.traverse((m) => { if (m.isMesh) meshes.push(m); });
  const paint = meshes.find(m => !m.geometry.attributes.color);
  const detail = meshes.find(m => m.geometry.attributes.color);
  const t = info.types?.[type];
  if (!paint || !detail || !t || !info.paints?.[type]?.length) return null;
  return { paint, detail, box: t.box, wheels: t.wheels, paints: info.paints[type] };
}

/** The parked-car types the loaded GLB carries: { type: { paint, detail, box, wheels, paints } } (node-local). */
export function parkedCarKit(scene) {
  const info = scene?.userData?.dd_parked_cars;
  if (!info) return null;
  const kit = {};
  for (const type of PARKED_CAR_TYPES) {
    kit[type] = parkedCarPart(scene, info, type);
    if (!kit[type]) return null;
  }
  return kit;
}

/**
 * L2b: stand AIRPORT_PARKED_COUNT parked cars in the roof bays of car parks A and B. Bays come from the JS bay lines;
 * each bay's deck is read from the GLB car-park node under its four wheel contacts, the car seated on the plane through
 * them, nose-in and centred, at 1.0. A bay whose car box would cross any GLB triangle (a stair core, light pole or
 * upstand) is left out. The seed ranks the open bays and fills the first AIRPORT_PARKED_COUNT; it also picks each car's
 * type and the city paint. One InstancedMesh per type and primitive (paint, detail): at most six calls.
 * L2c: `kerb` (posed kerb cars of the same types) rides the same InstancedMeshes as the last instances of its type
 * (`userData.airportKerbCars` counts them); the report's figures stay the bay cars'; `kerbReport` takes theirs.
 */
function placeParkedCars(root, parkNodes, scene, kerb = [], kerbReport = null) {
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
    const extra = kerb.filter(car => car.type === type);
    if (!cars.length && !extra.length) continue;
    const { paint, detail } = kit[type];
    for (const [source, part, shadow] of [[paint, 'paint', true], [detail, 'detail', false]]) {
      const mesh = new THREE.InstancedMesh(source.geometry, source.material, cars.length + extra.length);
      mesh.name = `${AIRPORT_PARKED_CARS}:${type}-${part}`;
      [...cars, ...extra].forEach((car, i) => {
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
      if (extra.length) mesh.userData.airportKerbCars = extra.length;
      mesh.computeBoundingSphere();
      group.add(mesh);
      const g = source.geometry;
      const each = Math.floor((g.index ? g.index.count : g.attributes.position.count) / 3);
      if (cars.length) {
        report.meshes += 1;
        report.calls += 1;
        report.triangles += each * cars.length;
      } else if (kerbReport) {
        kerbReport.meshes += 1;
        kerbReport.calls += 1;
      }
      if (kerbReport) kerbReport.triangles += each * extra.length;
    }
    if (cars.length) report.types[type] = cars.length;
  }
  for (const car of chosen) {
    report.perDeck[car.bay.park] = (report.perDeck[car.bay.park] ?? 0) + 1;
    report.cars.push({ bay: car.bay.id, type: car.type, paint: car.paint, x: +car.position.x.toFixed(3),
      y: +car.position.y.toFixed(3), z: +car.position.z.toFixed(3), nose: car.bay.nose,
      contacts: car.contacts.map(p => +p.y.toFixed(3)) });
  }
  report.placed = chosen.length;
  return { group: chosen.length || kerb.length ? group : null, report, chosen };
}

// ---------------------------------------------------------------- L2c: the airport's ground furniture

// L2c (scratch/pkg/l1-airport/l2c/spec-addendum.json and build-plan.md): five nodes of airport.glb and airport-lod1.glb
// rebuild the JS ground furniture. Each goes under its JS parent in a THREE.LOD like the building nodes; a file without
// them places none and the JS furniture still leaves.
export const AIRPORT_FURNITURE_NODES = Object.freeze({
  'fringe:tullamarine-hotel-forecourt': 'hotel',
  'fringe:tullamarine-landside': 'root',
  'fringe:tullamarine-frontage': 'root',
  'fringe:tullamarine-airside-furniture': 'root',
  'fringe:tullamarine-apron-edge': 'root',
});
// The addendum's runtime selector (PLAN-L2 amendment 4, ruling 101). airport.js is frozen (rulings 89 and 102), so it
// reads no source lines: the root's material table, two mesh names, the hotel entrance group, the sign-text wraps and
// root-local mesh boxes. Root-local metres; regions are [x0, x1, z0, z1] on the mesh box centre.
const FURNITURE_MATS = new Set(['kerb', 'stoneDark', 'apronJoint', 'gravel', 'hedge', 'leafA', 'leafB', 'bloomA', 'bloomB',
  'bloomC', 'concrete', 'dark', 'lampGlass', 'steel', 'white', 'soil', 'liveryTeal', 'copper', 'grass', 'grassAlt', 'yellow',
  'rail', 'grimeDark', 'rust', 'rustDark', 'stain', 'scorch', 'aggA', 'aggB']);
const FURNITURE_PLANT = new Set(['hedge', 'leafB', 'bloomA', 'bloomB', 'bloomC']);
const FURNITURE_WEAR = new Set(['stain', 'scorch', 'aggA', 'aggB', 'grimeDark']);
const FURNITURE_NAMED = Object.freeze(['fringe:tullamarine-windsock-mast', 'fringe:tullamarine-warning']);
const FURNITURE_ENTRANCE = 'fringe:tullamarine-hotel-door';
const FURNITURE_REGIONS = Object.freeze({
  main: [-67.0, 52.5, -23.0, 25.0],
  apronWest: [-59.0, -54.0, 15.5, 51.2],
  apronEast: [46.4, 50.95, 15.5, 51.2],
  apronAirside: [-59.0, 51.0, 47.5, 51.2],
  windsock: [29.0, 31.0, 58.5, 59.7],
  // Wear materials only, or a part within FURNITURE_MAST_REACH of a JS flood-mast site.
  apronInterior: [-56.0, 48.0, 17.0, 48.3],
});
const FURNITURE_MAST_SITES = Object.freeze([[-38, 23], [37, 19.5], [-42, 43], [44, 42]]);
const FURNITURE_MAST_REACH = 2.6;
// The eight planters whose JS planting stays (7 frontage, 1 verge): centre x, z and half sizes, root-local.
export const AIRPORT_KEPT_PLANTERS = Object.freeze([[-40, 20.4, 1.45, 0.725], [-33.4, 20.4, 1.45, 0.725],
  [-26.8, 20.4, 1.45, 0.725], [-20.2, 20.4, 1.45, 0.725], [-7, 20.4, 1.45, 0.725], [-0.4, 20.4, 1.45, 0.725],
  [19.4, 20.4, 1.45, 0.725], [28.1, -11.6, 1.1, 0.55]].map(Object.freeze));

function insideSignText(mesh) {
  for (let n = mesh.parent; n; n = n.parent) if (n.userData?.advance !== undefined) return true;
  return false;
}

/**
 * L2c: the JS meshes the furniture nodes replace and the classes L2c drops (apron wear, chain fence, warning plates,
 * court lawn and planter), as a list of meshes under `root`. Read-only; placeAirportLandmark detaches them. Kept: the
 * apron's own bay joints (29.8 m and 102.8 m), the shoulder rims (over 110 m), the stand marks (wear at 1.4-1.95 x 4.6 m
 * and under 0.05 m high), the planting in the eight kept planters, the sign letters and the porch taxi paint.
 */
export function airportFurnitureSelection(root) {
  const mats = root?.userData?.airport?.mats;
  if (!mats) return [];
  const keys = new Map(Object.entries(mats).map(([key, material]) => [material, key]));
  const keyOf = m => (Array.isArray(m.material) ? m.material : [m.material]).map(x => keys.get(x) ?? '?').join('+');
  root.updateWorldMatrix(true, true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const local = new THREE.Matrix4();
  const box = new THREE.Box3(), c = new THREE.Vector3(), sz = new THREE.Vector3();
  const inR = ([x0, x1, z0, z1]) => c.x >= x0 && c.x <= x1 && c.z >= z0 && c.z <= z1;
  const out = [];
  root.traverse((m) => {
    if (!m.isMesh || !m.geometry?.attributes?.position) return;
    const k = keyOf(m);
    // The hotel entrance group: everything but its letters and the taxi paint.
    let entrance = false;
    for (let n = m.parent; n && n !== root; n = n.parent) if (n.name === FURNITURE_ENTRANCE) { entrance = true; break; }
    if (entrance) { if (!insideSignText(m) && k !== 'taxi') out.push(m); return; }
    if (m.parent !== root || (m.name && !FURNITURE_NAMED.includes(m.name))) return;
    if (insideSignText(m) || !FURNITURE_MATS.has(k)) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.copy(m.geometry.boundingBox).applyMatrix4(local.multiplyMatrices(toRoot, m.matrixWorld));
    box.getCenter(c);
    box.getSize(sz);
    if (k === 'apronJoint' && (Math.abs(sz.z - 29.8) < 0.05 || Math.abs(sz.x - 102.8) < 0.05)) return;
    if (Math.max(sz.x, sz.z) > 110) return;
    const wear = FURNITURE_WEAR.has(k);
    const standMark = sz.x >= 1.4 && sz.x <= 1.95 && Math.abs(sz.z - 4.6) < 0.05 && sz.y < 0.05;
    if (wear && standMark) return;
    if (FURNITURE_PLANT.has(k) && AIRPORT_KEPT_PLANTERS.some(([x, z, hx, hz]) => Math.abs(c.x - x) <= hx && Math.abs(c.z - z) <= hz)) return;
    const R = FURNITURE_REGIONS;
    if (inR(R.main) || inR(R.apronWest) || inR(R.apronEast) || inR(R.apronAirside) || inR(R.windsock)) { out.push(m); return; }
    if (inR(R.apronInterior) && (wear || FURNITURE_MAST_SITES.some(([x, z]) => Math.abs(c.x - x) <= FURNITURE_MAST_REACH
      && Math.abs(c.z - z) <= FURNITURE_MAST_REACH))) out.push(m);
  });
  return out;
}

// Decision D4: the windsock mast moves to the turf east of the apron (the GLB airside-furniture node carries it), and
// the JS orange sock follows by this root-local translation; its height, rotation and seed lean are unchanged.
export const AIRPORT_WINDSOCK = Object.freeze({ name: 'fringe:tullamarine-windsock', move: Object.freeze([21.20, 0, -14.50]),
  mast: Object.freeze({ x: 51.20, z: 44.60, top: 6.80 }) });

// Decision D2: three kerb cars and three taxis from parked-cars.glb (L2b). The cars ride the bay cars' sedan, hatch and
// wagon InstancedMeshes as one more instance each; the taxis take one InstancedMesh pair. Root-local x, z of the car
// origin, the way its nose points along x (car +z is its nose) and the deck top it stands on (above y0): the road deck
// 0.26, the hotel forecourt paving 0.44 (the JS porch taxis at lz 19.35 lie under the apron). L2c D6 (review 1 fix 2): the
// forecourt taxi stands in front of the porte-cochere between the door and its east column, on the apron top flush with
// the GLB forecourt slab, its wheels east of the apron's tone panel and joint and its box clear of the east hotel lamp;
// under the porch deck at (30.4, 15.25) it was hidden at AC2.
export const AIRPORT_KERB_VEHICLES = 6;
export const AIRPORT_KERB_TAXIS = 'fringe:tullamarine-kerb-taxis';
export const AIRPORT_KERB = Object.freeze([
  { type: 'sedan', x: -40.00, z: -0.30, nose: 1, deck: 0.26, where: 'kerb' },
  { type: 'hatch', x: -21.00, z: -3.70, nose: -1, deck: 0.26, where: 'kerb' },
  { type: 'wagon', x: 14.00, z: -0.30, nose: 1, deck: 0.26, where: 'kerb' },
  { type: 'taxi', x: -6.00, z: 0.60, nose: 1, deck: 0.26, where: 'rank' },
  { type: 'taxi', x: 2.40, z: 0.60, nose: 1, deck: 0.26, where: 'rank' },
  { type: 'taxi', x: 38.00, z: 20.30, nose: 1, deck: 0.44, where: 'porch' },
].map(Object.freeze));

/**
 * The kerb vehicles posed at their sites, each car's box from BOX_LIFT above its wheels clear of every placed GLB node
 * triangle (the L2b rule); a vehicle whose box crosses one is left out and reported. Kerb cars take their type's paint
 * by mixedUnit('l2c-kerb:<i>'), taxis the taxi paint.
 */
function poseKerbVehicles(root, y0, cars, glbNodes) {
  const report = { placed: 0, cars: 0, taxis: 0, meshes: 0, calls: 0, triangles: 0, vehicles: [], rejected: [], reason: null };
  const info = cars?.userData?.dd_parked_cars;
  const kit = {};
  for (const type of [...PARKED_CAR_TYPES, 'taxi']) kit[type] = parkedCarPart(cars, info, type);
  if (Object.values(kit).some(k => !k)) { report.reason = 'parked-cars GLB not loaded'; return { report, poses: [] }; }
  root.updateWorldMatrix(true, true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const nodeBoxes = glbNodes.map(node => ({ node, box: new THREE.Box3().setFromObject(node).applyMatrix4(toRoot), tris: null }));
  const up = new THREE.Vector3(0, 1, 0), corner = new THREE.Vector3();
  const poses = [];
  let kerbIndex = 0;
  AIRPORT_KERB.forEach((site, i) => {
    const k = kit[site.type];
    const quaternion = new THREE.Quaternion().setFromAxisAngle(up, site.nose > 0 ? Math.PI / 2 : -Math.PI / 2);
    const position = new THREE.Vector3(site.x, y0 + site.deck, site.z);
    const box = new THREE.Box3();
    for (const sx of [0, 1]) for (const sy of [0, 1]) for (const sz of [0, 1]) {
      corner.set(sx ? k.box.max[0] : k.box.min[0], sy ? k.box.max[1] : k.box.min[1], sz ? k.box.max[2] : k.box.min[2])
        .applyQuaternion(quaternion).add(position);
      box.expandByPoint(corner);
    }
    box.min.y = position.y + BOX_LIFT;
    let hit = null;
    for (const entry of nodeBoxes) {
      if (!entry.box.intersectsBox(box)) continue;
      entry.tris ??= nodeTriangles(entry.node, toRoot).all;
      if (entry.tris.some(t => box.intersectsTriangle(t))) { hit = entry.node.name; break; }
    }
    const paint = site.type === 'taxi' ? k.paints[0]
      : k.paints[Math.floor(mixedUnit(`l2c-kerb:${kerbIndex++}`) * k.paints.length) % k.paints.length];
    if (hit) { report.rejected.push({ site: i, type: site.type, where: site.where, why: `structure ${hit}` }); return; }
    const contacts = k.wheels.map(([wx, wz]) => {
      const p = new THREE.Vector3(wx, 0, wz).applyQuaternion(quaternion);
      return { x: position.x + p.x, y: position.y, z: position.z + p.z };
    });
    poses.push({ site: i, type: site.type, where: site.where, paint, position, quaternion, contacts, box });
    report.vehicles.push({ site: i, type: site.type, where: site.where, paint, x: +position.x.toFixed(3),
      y: +position.y.toFixed(3), z: +position.z.toFixed(3), nose: site.nose });
  });
  report.placed = poses.length;
  report.taxis = poses.filter(p => p.type === 'taxi').length;
  report.cars = report.placed - report.taxis;
  return { report, poses, kit };
}

/** The taxi pair: one InstancedMesh per primitive (paint, detail) holding every posed taxi. */
function kerbTaxiGroup(poses, kit, report) {
  const taxis = poses.filter(p => p.type === 'taxi');
  if (!taxis.length) return null;
  const group = new THREE.Group();
  group.name = AIRPORT_KERB_TAXIS;
  group.userData.airportParkedCars = true;
  group.userData.airportKerbVehicles = true;
  const matrix = new THREE.Matrix4(), unit = new THREE.Vector3(1, 1, 1), colour = new THREE.Color();
  const { paint, detail } = kit.taxi;
  for (const [source, part, shadow] of [[paint, 'paint', true], [detail, 'detail', false]]) {
    const mesh = new THREE.InstancedMesh(source.geometry, source.material, taxis.length);
    mesh.name = `${AIRPORT_KERB_TAXIS}:taxi-${part}`;
    taxis.forEach((car, i) => {
      matrix.compose(car.position, car.quaternion, unit);
      mesh.setMatrixAt(i, matrix);
      if (part === 'paint') mesh.setColorAt(i, colour.set(car.paint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.raycast = () => {};
    mesh.userData.airportParkedCar = 'taxi';
    mesh.userData.airportKerbCars = taxis.length;
    mesh.computeBoundingSphere();
    group.add(mesh);
    const { triangles } = meshTriangles(mesh);
    report.meshes += 1;
    report.calls += 1;
    report.triangles += triangles;
  }
  return group;
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

function landmarkNode(source, name, landmark = 'airport') {
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
    o.userData.landmark = landmark;
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
 * L2c: the furniture nodes the file carries go in the same way; the JS ground furniture and the dropped classes leave
 * (airportFurnitureSelection), the windsock sock follows its mast, and the kerb vehicles stand at the kerbs and the porch.
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
    clearedMeshes: 0, cityTrees: null, parkedCars: null, reason: null,
    // L2c: the furniture nodes' own figures (the building nodes' stay above), the JS furniture removed, the sock's move
    // and the kerb vehicles.
    furniture: { nodes: 0, missing: [], calls: 0, triangles: 0, callsFar: 0, trianglesFar: 0, removedMeshes: 0,
      removedTriangles: 0, removedFromHotel: 0 },
    windsock: null, kerbVehicles: null };
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
  // L2c: the furniture nodes the file carries (none before the blockout); the JS furniture leaves either way.
  const furniture = Object.keys(AIRPORT_FURNITURE_NODES).map(name => [name, landmarkNode(source, name)]);
  report.furniture.missing = furniture.filter(([, node]) => !node).map(([name]) => name);
  const placedFurniture = furniture.filter(([, node]) => node);

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
  report.hiddenTrees = hideTreesUnderNodes(root, [...nodes, ...placedFurniture]);
  // L2a: the GSE, vehicles, figures, private jets and JS trees leave; the city's species stand at the trunks clear of
  // the GLB footprints (the trees just hidden are not replanted).
  const clear = clearAirport(root, new Set(report.hiddenTrees.map(h => h.tree)));
  report.cleared = clear.cleared;
  report.clearedMeshes = clear.removedMeshes;
  report.cityTrees = clear.cityTrees;
  // L2c: the JS ground furniture and the dropped classes leave, detached (batching.js judges each mesh by its own flag).
  for (const mesh of airportFurnitureSelection(root)) {
    report.furniture.removedTriangles += meshTriangles(mesh).triangles;
    if (isUnder(mesh, hotel)) report.furniture.removedFromHotel += 1;
    mesh.userData.l2cRemoved = true; // tests and probes read the removal off the detached mesh
    report.furniture.removedMeshes += dropObject(mesh);
  }

  // Place each node in a LOD at its bbox centre, at the JS root's frame (root-local metres, y up from y0).
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const at = new THREE.Matrix4();
  const placing = [...nodes.map(([name, node]) => [name, node, parents[AIRPORT_NODES[name]], report]),
    ...placedFurniture.map(([name, node]) => [name, node, parents[AIRPORT_FURNITURE_NODES[name]], report.furniture])];
  for (const [name, node, parent, tally] of placing) {
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
      tally.trianglesFar += (index ? index.count : o.geometry.attributes.position.count) / 3;
      if (shownFar) tally.callsFar += 1;
    });
    at.copy(parent.matrixWorld).invert().multiply(root.matrixWorld)
      .multiply(new THREE.Matrix4().makeTranslation(centre.x, centre.y + y0, centre.z));
    at.decompose(lod.position, lod.quaternion, lod.scale);
    parent.add(lod);
    tally.nodes += 1;
    let shown = true;
    for (let n = parent; n && n !== root.parent; n = n.parent) if (!n.visible) shown = false;
    node.traverse((o) => {
      if (!o.isMesh) return;
      const index = o.geometry.index;
      tally.triangles += (index ? index.count : o.geometry.attributes.position.count) / 3;
      if (shown) tally.calls += 1;
    });
  }
  // L2c, decision D4: the JS sock follows the windsock mast to its GLB site.
  const sock = root.children.find(child => child.name === AIRPORT_WINDSOCK.name);
  if (sock) {
    const [dx, dy, dz] = AIRPORT_WINDSOCK.move;
    sock.position.x += dx;
    sock.position.y += dy;
    sock.position.z += dz;
    report.windsock = { x: +sock.position.x.toFixed(3), y: +sock.position.y.toFixed(3), z: +sock.position.z.toFixed(3) };
  }
  // L2c, decision D2: the kerb vehicles, clear of every GLB node just placed; the cars join the bay cars' meshes below.
  const kerb = poseKerbVehicles(root, y0, cars, placing.map(([, node]) => node));
  report.kerbVehicles = kerb.report;
  // L2b: the parked level of the city's cars in the roof bays of car parks A and B, on the GLB decks just placed.
  const parkNodes = ['a', 'b'].map(label => ({ label, park: parents[`car-park:${label}`],
    node: nodes.find(([name]) => name === `fringe:tullamarine-car-park-body:${label}`)[1] }));
  const parked = placeParkedCars(root, parkNodes, cars, kerb.poses.filter(p => p.type !== 'taxi'), kerb.report);
  if (parked.group) root.add(parked.group);
  report.parkedCars = parked.report;
  const taxis = kerb.kit ? kerbTaxiGroup(kerb.poses, kerb.kit, kerb.report) : null;
  if (taxis) root.add(taxis);
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

// ---------------------------------------------------------------- L4 Rod Laver (M0 section 5)
// Both files use the precinct's local metres, including its 0.34 m ground lift, under this export root.
export const ROD_LAVER_ROOT_NODE = 'fringe:rod-laver-buildings';
export const ROD_LAVER_LOD_DISTANCE = 400;
export const ROD_LAVER_NODES = Object.freeze(Object.fromEntries([
  'arena-shell', 'bowl-court', 'roof-frame', 'roof-leaf-north', 'roof-leaf-south', 'show-court-a', 'show-court-b',
  'court-fences', 'forecourt', 'paths-furniture', 'event-structures', 'signs-lights',
].map(suffix => [`fringe:rod-laver-${suffix}`, 'root'])));

// The frozen builder's structural markers identify each completed section before batching. Weak metadata leaves
// the switch-off graph untouched. No source line numbers, stack parsing, mesh ordinals or approximate box tests.
const ROD_LAVER_PARTS = new WeakMap();
export function rodLaverPartMarker(root, courtPaint) {
  return (part) => root.traverse((mesh) => {
    if (!mesh.isMesh || ROD_LAVER_PARTS.has(mesh)) return;
    const name = mesh.name;
    const ancestry = [];
    for (let p = mesh; p && p !== root; p = p.parent) ancestry.push(p.name);
    let cls = part;
    if (/crowd:|:i4-body$|precinct-people:/.test(name)) cls = 'keep:city-I4-figures';
    else if (/form-trees:|rod-laver-trunks$|palm-(fronds|crowns)$/.test(name)) cls = 'remove:venue-tree-geometry';
    else if (ancestry.some(n => /rod-laver-(cars$|car-cabins$|food-van:|lawn-van:)/.test(n))) cls = 'remove:bespoke-vehicles';
    else if (/hedges|shrubs|blooms/.test(name)) cls = 'keep:terrain-and-planting';
    else if (ancestry.some(n => /-letters(?:-|$)/.test(n))) cls = 'keep:lettering';
    else if (name === 'fringe:rod-laver-plaza-ground-light' || /glow/.test(name)) cls = 'keep:light-effects';
    else if (mesh.material === courtPaint || name === 'fringe:rod-laver-court') cls = 'keep:court-and-road-paint-pick';
    else if (/lamp|flood|flag|banner|scoreboard/.test(name)) cls = 'glb:signs-lights';
    else if (/kiosk|marquee/.test(name)) cls = 'glb:event-structures';
    ROD_LAVER_PARTS.set(mesh, cls);
  });
}

/** Exact, disjoint mesh removal units from the structural hooks; retained groups (letters, fountain light) stay. */
export function rodLaverClearUnits(root) {
  const units = [];
  root?.traverse((mesh) => {
    const cls = ROD_LAVER_PARTS.get(mesh);
    if (mesh.isMesh && /^(glb|remove):/.test(cls ?? '')) units.push([mesh, cls]);
  });
  return units;
}

// Read the actual venue-kit instances after the boulevard and GP keep-outs. Their origins are M0's 26 trunk sites;
// old palms have no form-tree entry and do not get replanted. This also follows a different venue frame or seed.
function rodLaverTreeSites(root, units) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), local = new THREE.Matrix4(), instance = new THREE.Matrix4();
  const trunks = [];
  for (const [mesh, cls] of units) {
    const match = /^fringe:rod-laver-form-trees:(plane|eucalypt|cypress):/.exec(mesh.name);
    if (cls !== 'remove:venue-tree-geometry' || !mesh.isInstancedMesh || !match) continue;
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, instance);
      local.copy(inverse).multiply(mesh.matrixWorld).multiply(instance);
      const at = new THREE.Vector3().setFromMatrixPosition(local);
      const point = new THREE.Vector3(), positions = mesh.geometry.attributes.position;
      let sourceCrownRadius = 0;
      for (let v = 0; v < positions.count; v += 1) {
        point.fromBufferAttribute(positions, v).applyMatrix4(local);
        sourceCrownRadius = Math.max(sourceCrownRadius, Math.hypot(point.x - at.x, point.z - at.z));
      }
      trunks.push({ name: `${mesh.name}:${i}`, species: match[1], x: at.x, y: at.y, z: at.z, sourceCrownRadius });
    }
  }
  return trunks;
}

export const ROD_LAVER_PARKED_CARS = 'fringe:rod-laver-parked-cars';
export const ROD_LAVER_PARKED_COUNT = 8;

/** R127.8: the L2b city kit at the existing JS parking sites. Eight evenly
 * spaced occupied sites keep both precinct LOD totals inside the M0 caps.
 * Reuse the two primitives per family, paint palette and wheel datum at 1:1.
 */
function placeRodLaverCars(root, scene) {
  const report = { placed: 0, sourceSites: 0, calls: 0, triangles: 0, cars: [], reason: null };
  const kit = parkedCarKit(scene), old = root.getObjectByName('fringe:rod-laver-cars');
  if (!kit) { report.reason = 'parked-cars GLB not loaded'; return { group: null, report }; }
  if (!old?.isInstancedMesh) { report.reason = 'source parking sites missing'; return { group: null, report }; }
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), local = new THREE.Matrix4(), instance = new THREE.Matrix4();
  old.geometry.computeBoundingBox();
  const contact = old.geometry.boundingBox.min.y;
  report.sourceSites = old.count;
  const chosen = [];
  for (let j = 0; j < Math.min(ROD_LAVER_PARKED_COUNT, old.count); j++) {
    const i = Math.round(j * (old.count - 1) / (Math.min(ROD_LAVER_PARKED_COUNT, old.count) - 1 || 1));
    old.getMatrixAt(i, instance);
    local.copy(inverse).multiply(old.matrixWorld).multiply(instance);
    const position = new THREE.Vector3(0, contact, 0).applyMatrix4(local);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(local);
    const type = PARKED_CAR_TYPES[j % PARKED_CAR_TYPES.length], part = kit[type];
    const paint = part.paints[Math.floor(mixedUnit(`rod-laver-parked:${i}`) * part.paints.length)];
    chosen.push({ source: i, type, paint, position, quaternion });
  }
  const group = new THREE.Group(); group.name = ROD_LAVER_PARKED_CARS;
  const matrix = new THREE.Matrix4(), unit = new THREE.Vector3(1, 1, 1), colour = new THREE.Color();
  for (const type of PARKED_CAR_TYPES) {
    const cars = chosen.filter(c => c.type === type);
    if (!cars.length) continue;
    const { paint, detail } = kit[type];
    for (const [source, part, shadow] of [[paint, 'paint', true], [detail, 'detail', false]]) {
      const mesh = new THREE.InstancedMesh(source.geometry, source.material, cars.length);
      mesh.name = `${ROD_LAVER_PARKED_CARS}:${type}-${part}`;
      cars.forEach((car, i) => {
        matrix.compose(car.position, car.quaternion, unit); mesh.setMatrixAt(i, matrix);
        if (part === 'paint') mesh.setColorAt(i, colour.set(car.paint));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.raycast = () => {};
      mesh.userData.rodLaverParkedCar = type; mesh.computeBoundingSphere(); group.add(mesh);
      report.calls++;
      report.triangles += (source.geometry.index?.count ?? source.geometry.attributes.position.count) / 3 * cars.length;
    }
  }
  report.placed = chosen.length;
  report.cars = chosen.map(c => ({ source: c.source, type: c.type, paint: c.paint, position: c.position.toArray(), quaternion: c.quaternion.toArray() }));
  return { group, report };
}

/**
 * With the switch and all twelve LOD0 nodes present, detach M0's replacement/vehicle/tree classes, plant city-kit
 * trees and attach independent LODs. The precinct hook runs after events' material/light register. Missing LOD0
 * keeps the JS intact; missing LOD1 keeps the complete near copy. Reports contain measured removals, never pins.
 */
export function placeRodLaverLandmark(root, {
  y0 = 0, quality = 'high', search = globalThis.location?.search ?? '',
  scene = loadedLandmarkScene('rod-laver'), far = loadedLandmarkScene('rod-laver-far'),
  cars = loadedLandmarkScene(PARKED_CARS_KEY),
} = {}) {
  if (!root || !parseLandmarkSwitch(search).has('rod-laver')) return null;
  if (root.userData.rodLaverLandmark?.placed) return root.userData.rodLaverLandmark;
  const report = { placed: false, reason: null, nodes: 0, lod1: false, removed: {}, removedMeshes: 0,
    removedTriangles: 0, triangles: 0, trianglesFar: 0, cityTrees: null, parkedCars: null };
  root.userData.rodLaverLandmark = report;
  const source = scene?.getObjectByName(ROD_LAVER_ROOT_NODE);
  const names = Object.keys(ROD_LAVER_NODES);
  const missing = names.filter(name => !source?.children.some(o => o.name === name));
  if (missing.length) { report.reason = `node missing: ${missing.join(', ')}`; return report; }
  const farSource = far?.getObjectByName(ROD_LAVER_ROOT_NODE);
  const fullFar = names.every(name => farSource?.children.some(o => o.name === name));
  const nodes = names.map(name => [name, landmarkNode(source, name, 'rod-laver'),
    fullFar ? landmarkNode(farSource, name, 'rod-laver') : null]);
  const units = rodLaverClearUnits(root);
  const trunks = rodLaverTreeSites(root, units);
  const trees = plantCityTrees(root, trunks, { quality, landmark: 'rod-laver', fallLayer: false });
  const parked = placeRodLaverCars(root, cars);
  for (const [object, cls] of units) {
    const measured = meshTriangles(object);
    const row = report.removed[cls] ??= { meshes: 0, triangles: 0 };
    row.meshes += measured.meshes; row.triangles += measured.triangles;
    report.removedMeshes += dropObject(object);
    report.removedTriangles += measured.triangles;
  }
  root.add(trees.group);
  report.cityTrees = trees.report;
  if (parked.group) root.add(parked.group);
  report.parkedCars = parked.report;
  for (const [name, node, farNode] of nodes) {
    const centre = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
    const lod = new THREE.LOD();
    lod.name = `${name}-lod`;
    lod.userData.landmark = 'rod-laver';
    lod.userData.dynamicVisibility = true; // batching must leave both copies inside their LOD
    lod.position.copy(centre); lod.position.y += y0;
    node.position.copy(centre).negate();
    lod.addLevel(node, 0);
    if (farNode) {
      farNode.traverse(o => { if (o.name === name) o.name = airportFarName(name); });
      farNode.position.copy(centre).negate();
      lod.addLevel(farNode, ROD_LAVER_LOD_DISTANCE);
      farNode.visible = false;
      report.trianglesFar += meshTriangles(farNode).triangles;
    }
    root.add(lod);
    report.nodes += 1;
    report.triangles += meshTriangles(node).triangles;
  }
  report.lod1 = fullFar;
  report.placed = true;
  return report;
}
