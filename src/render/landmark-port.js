// Port M0/D1. GLB geometry replaces only these seven machines. The JS rig objects,
// clamps, cargo, falls, lamps and lettering remain the animation/picking contract.
import * as THREE from 'three';
import { loadedLandmarkScene, parseLandmarkSwitch } from './landmarks-glb.js';

export const PORT_LOD_DISTANCE = 400;
// Hoisted and self-contained: assets -> landmarks -> port and port -> landmarks
// can enter this cycle in either order. The registry must not read a const in its TDZ.
export function portLandmarkModels() {
  return ['gantry-hold', 'gantry-apron', 'forklift', 'stacker'].flatMap(type => [0, 1].map(lod => ({
    id: `port-${type}${lod ? '-far' : ''}`, switch: 'port', source: 'landmark-blender', lod,
    url: `./assets/models/landmarks/port-${type}${lod ? '-lod1' : ''}.glb`,
  })));
}
export const PORT_MODELS = Object.freeze(portLandmarkModels());
// Reviewed file ceilings: rulings 121 and 125; byte and call caps remain M0.
export const PORT_BUDGETS = Object.freeze({
  'gantry-hold': { triangles: [14000, 5500], bytes: [405000, 230000], calls: 28, materials: 7 },
  'gantry-apron': { triangles: [14300, 5700], bytes: [420000, 242000], calls: 28, materials: 7 },
  forklift: { triangles: [1200, 480], bytes: [54000, 31000], calls: 8, materials: 7 },
  stacker: { triangles: [4160, 1640], bytes: [187000, 105000], calls: 30, materials: 7 },
});
export const PORT_NODE_CAPS = Object.freeze({
  'gantry-hold': { body: [12700, 4900], backreach: [650, 350], trolley: [250, 100], spreader: [400, 150] },
  'gantry-apron': { body: [13000, 5100], backreach: [650, 350], trolley: [250, 100], spreader: [400, 150] },
  forklift: { body: [808, 352], 'mast-left': [44, 12], 'mast-right': [44, 12], 'fork-left': [152, 52], 'fork-right': [152, 52] },
  stacker: { ...Object.fromEntries([0, 1, 2].map(i => [`${i}-body`, [1270, 500]])), spreader: [350, 140] },
});
const GANTRY_PARTS = ['body', 'backreach', 'trolley', 'spreader'];
const FORKLIFT_PARTS = ['body', 'mast-left', 'mast-right', 'fork-left', 'fork-right'];
export const PORT_NODE_MAP = Object.freeze({
  'gantry-hold': Object.fromEntries(GANTRY_PARTS.map(p => [p, `fringe:port-gantry:hold${p === 'body' ? '' : `:${p}`}`])),
  'gantry-apron': Object.fromEntries(GANTRY_PARTS.map(p => [p, `fringe:port-gantry:apron${p === 'body' ? '' : `:${p}`}`])),
  forklift: Object.fromEntries(FORKLIFT_PARTS.map(p => [p, `fringe:port-forklift:${p}`])),
  stacker: { ...Object.fromEntries([0, 1, 2].map(i => [`${i}-body`, `fringe:port-stacker:${i}-body`])), spreader: 'fringe:port-stacker:spreader' },
});

/** Semantic sections: invoked once at the end of each of the three JS builders. */
export function markPortRig(rig, type, origin = [0, 0, 0], keepMaterials = [], beaconMaterial = null) {
  rig.userData.portLandmarkRig = type;
  rig.userData.portLandmarkOrigin = origin;
  rig.traverse(mesh => {
    if (!mesh.isMesh) return;
    const chain = [];
    for (let p = mesh; p && p !== rig; p = p.parent) chain.push(p.name);
    let part = 'body';
    if (type === 'gantry') {
      if (keepMaterials.includes(mesh.material)) part = 'keep:contact';
      else if (chain.some(n => n.startsWith('fringe:port-name:'))) part = 'keep:letters';
      else if (chain.includes(`${rig.name}:cargo-mount`)) part = 'keep:cargo';
      else if (/:falls:\d+$/.test(mesh.name)) part = 'keep:falls';
      else if (/:lamp:\d+$/.test(mesh.name)) part = 'keep:lamps';
      else part = ['backreach', 'spreader', 'trolley'].find(p => chain.includes(`${rig.name}:${p}`)) ?? 'body';
    } else if (type === 'forklift') {
      part = FORKLIFT_PARTS.slice(1).find(p => chain.includes(`${rig.name}:${p}`)) ?? 'body';
    } else if (chain.includes(`${rig.name}:cargo`)) part = 'keep:cargo';
    else if (chain.includes(`${rig.name}:spreader`)) part = 'spreader';
    mesh.userData.portLandmarkPart = part;
    // R140 changes retention, never the frozen source component numbering.
    mesh.userData.portLandmarkSourcePart = part;
  });
  if (type === 'gantry' && beaconMaterial) {
    for (const mesh of rig.children) {
      if (!mesh.isMesh || mesh.material !== beaconMaterial) continue;
      const stalk = rig.children[rig.children.indexOf(mesh) - 1];
      for (const lamp of [stalk, mesh]) {
        lamp.userData.portLandmarkPart = 'keep:lamps';
        lamp.userData.portLandmarkRoofBeacon = true;
      }
    }
  }
}

/** Exact mesh removal list; never remove a parent that holds a retained rig part. */
export function portRemovalUnits(root) {
  const units = [];
  root?.traverse(mesh => {
    const part = mesh.userData?.portLandmarkPart;
    if (mesh.isMesh && part && !part.startsWith('keep:') && mesh.userData.landmark !== 'port') units.push([mesh, part]);
  });
  return units;
}

function definitions(rig) {
  const type = rig.userData.portLandmarkRig;
  const id = rig.name.split(':').at(-1);
  const file = type === 'gantry' ? `gantry-${id}` : type;
  const parts = type === 'gantry' ? GANTRY_PARTS : type === 'forklift' ? FORKLIFT_PARTS : ['body', 'spreader'];
  return parts.map(part => ({ part, file, name: PORT_NODE_MAP[file][type === 'stacker' && part === 'body' ? `${id}-body` : part],
    parent: part === 'body' ? rig : rig.getObjectByName(`${rig.name}:${part}`),
  }));
}

function sourceNode(scene, name) {
  const found = [];
  scene?.traverse(o => { if (o.name === name) found.push(o); });
  // restoreNodeNames also names per-material primitive meshes after their group.
  const roots = found.filter(o => !found.includes(o.parent));
  if (roots.length !== 1) return null;
  let geometry = false;
  roots[0].traverse(o => { geometry ||= !!(o.isMesh && o.geometry?.attributes?.position?.count); });
  return geometry ? roots[0] : null;
}

/** Author nodes at identity in their destination's local frame. Gantry body/backreach
 * are centred on x=0, apron y=0; their JS parents instead use terminal coordinates.
 * Forklift nodes share geometry/materials between the two independent moving rigs.
 * Stacker variants keep their three authored boom poses in a single file.
 */
export function placePortLandmark(root, {
  search = globalThis.location?.search ?? '', scenes = null,
} = {}) {
  if (!parseLandmarkSwitch(search).has('port')) return { placed: false, reason: 'switch-off' };
  if (root?.userData.portLandmark) return root.userData.portLandmark;
  const rigs = [];
  root?.traverse(o => { if (o.userData.portLandmarkRig) rigs.push(o); });
  if (!rigs.length) return { placed: false, reason: 'no-rigs' };
  const get = (file, far = false) => {
    const key = `port-${file}${far ? '-far' : ''}`;
    return scenes ? scenes[key] : loadedLandmarkScene(key);
  };
  const prepared = [];
  for (const rig of rigs) {
    const defs = definitions(rig);
    const rows = defs.map(d => ({ ...d, near: sourceNode(get(d.file), d.name), far: sourceNode(get(d.file, true), d.name) }));
    // Validate the whole swap before detaching anything. A partial near file is JS fallback.
    if (rows.some(d => !d.parent || !d.near)) return { placed: false, reason: 'incomplete-near', rig: rig.name };
    const farComplete = rows.every(d => d.far);
    for (const row of rows) {
      // Parts must be separate exports; cloning a body containing the other parts would duplicate geometry.
      if (rows.some(other => other !== row && row.near.getObjectById(other.near.id))) return { placed: false, reason: 'nested-parts' };
      if (farComplete && rows.some(other => other !== row && row.far.getObjectById(other.far.id))) return { placed: false, reason: 'nested-parts' };
      const lod = new THREE.LOD();
      lod.name = `${rig.name}:landmark-${row.part}`;
      lod.userData.dynamicVisibility = true; // keep both levels out of world batches
      lod.userData.mischiefLive = true; // batching.js's existing motion flag also prevents matrix freezing
      lod.userData.landmark = 'port';
      if (rig.userData.portLandmarkRig === 'gantry' && ['body', 'backreach'].includes(row.part)) {
        lod.position.fromArray(rig.userData.portLandmarkOrigin);
      }
      for (const [level, source] of [[0, row.near], [1, farComplete ? row.far : null]]) {
        if (!source) continue;
        const clone = source.clone(true);
        clone.name = `${row.name}-lod${level}`;
        clone.traverse(o => {
          o.userData.landmark = 'port';
          delete o.userData.portLandmarkPart;
          delete o.userData.portLandmarkRig;
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            o.raycast = () => {}; // the existing fringe pick proxies own interaction
          }
        });
        lod.addLevel(clone, level ? PORT_LOD_DISTANCE : 0);
        clone.visible = level === 0;
      }
      prepared.push({ ...row, lod, rig });
    }
  }
  const removed = {};
  for (const [mesh, part] of portRemovalUnits(root)) {
    let rig = mesh.parent;
    while (rig && !rig.userData.portLandmarkRig) rig = rig.parent;
    const key = `${rig.name}/${part}`;
    removed[key] = (removed[key] ?? 0) + 1;
    // No disposal: geometries and materials can be shared with retained JS objects.
    mesh.removeFromParent();
  }
  for (const { parent, lod } of prepared) parent.add(lod);
  // D5 / standing rule 24: the source glyph backs penetrate their name boards
  // by 0.025 m. Recess only the two boards by 0.026 m (below the 0.05 m line),
  // leaving every glyph, parent, material and rig transform at its source pose.
  // This runs after the atomic near check and only once with the landmark on.
  const signBackingOffsets = [];
  for (const variant of ['hold', 'apron']) {
    const board = root.getObjectByName(`fringe:port-name:gantry-${variant}`)?.children[0];
    if (!board) continue;
    const from = board.position.z;
    board.position.z -= 0.026;
    board.updateMatrix();
    signBackingOffsets.push({ variant, from, to: board.position.z });
  }
  const report = { placed: true, removed, rigs: rigs.length, parts: prepared.length,
    farParts: prepared.filter(p => p.lod.levels.length === 2).length, signBackingOffsets };
  root.userData.portLandmark = report;
  return report;
}
