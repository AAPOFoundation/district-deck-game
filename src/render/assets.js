import { runBuild, buildBudget, yieldToBrowser } from './startup.js';
// District Deck V3.00 — runtime asset registry.
// Framework §5.1: every asset records its representation, and anything missing at
// runtime falls back to procedural geometry so the game never fails to render.

import * as THREE from 'three';
import { buildTramModel, registerFactoryTram, forgetFactoryTram, tramFactoryScale, exposeFactoryTramLivery } from './vehicles/tram-model.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE, STOREY, CORRIDOR } from '../core/grid.js';
import { ARCHETYPES } from '../core/content.js';
import { landmarkJobs, parseLandmarkSwitch, restoreNodeNames } from './landmarks-glb.js';

/** Planar XZ UVs for a geometry whose uv attribute is missing or entirely zero. */
function ensurePlanarUv(geometry) {
  const pos = geometry.attributes.position;
  if (!pos) return;
  const uv = geometry.attributes.uv;
  if (uv) {
    let any = false;
    for (let i = 0; i < uv.count && !any; i += 1) if (uv.getX(i) !== 0 || uv.getY(i) !== 0) any = true;
    if (any) return;
  }
  const out = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) { out[i * 2] = pos.getX(i); out[i * 2 + 1] = pos.getZ(i); }
  geometry.setAttribute('uv', new THREE.BufferAttribute(out, 2));
}


/** The six DDMG-1 ground and road modules. Framework §5.3. */
export const GROUND_MODELS = [
  'ground-tile', 'road-straight', 'road-corner', 'road-tee', 'road-cross', 'road-tram-straight',
];

const KIT_PATH = './assets/models/';
const PROP_PATH = './assets/models/props/';

/** Flat placeholder palette. Value separation matters more than hue at 60-200 m. */
const FALLBACK_COLOURS = {
  brick: 0x8f5a44,
  render: 0xcfc4b2,
  iron: 0x5b6167,
  tile: 0x8e4b3a,
  timber: 0xb9a07c,
  glass: 0x33424d,
  bluestone: 0x4a4d52,
};

export const PROP_MODELS = [
  'city-blackwood-bench',
  'hoddle-grid-bin',
  'melbourne-bike-hoop',
  'city-drinking-fountain',
  'cast-street-bollard',
  'city-information-pillar',
  'granite-tree-guard',
  'modern-tram-stop-pylon',
  'overhead-wire-pole',
  'signal-cabinet',
];

export const TRANSIT_MODELS = ['w-class-tram', 'e-class-tram', 'tram-stop-shelter'];

/**
 * L2b: props that join the loader only when `?landmarks=` names their landmark, and keep their node graph
 * (restoreNodeNames) for placement. `parked-cars` is the parked level of the city's traffic cars
 * (scripts/assets/export-parked-cars.mjs) that the airport and Albert Park adapters stand in the car-park bays.
 */
export const SWITCHED_PROP_MODELS = Object.freeze([
  Object.freeze({ id: 'parked-cars', switches: ['airport', 'rod-laver', 'southern-cross', 'albert-park'], url: `${PROP_PATH}parked-cars.glb`, source: 'prop-scene' }),
]);

/** The SWITCHED_PROP_MODELS rows the switch enables, as registry jobs (none with the switch absent). */
export function switchedPropJobs(search = globalThis.location?.search ?? '') {
  const selected = parseLandmarkSwitch(search);
  return SWITCHED_PROP_MODELS.filter(row => (row.switches ?? [row.switch]).some(id => selected.has(id))).map(({ id, url, source }) => ({ id, url, source }));
}

/** Street trees, from the existing Melbourne planting kit. Cheap and worth the shadow. */
export const TREE_MODELS = [
  'australian-eucalyptus',
  'australian-jacaranda',
  'australian-bottlebrush',
  'plane-tree-london',
];

/**
 * Declared real-world dimensions for imported models that were not authored at DDMG-1
 * scale. The kit buildings and the street furniture measure correctly and are never
 * touched; the vehicles and planting are fitted here, and the fit factor is logged so
 * the adjustment is visible rather than a hidden fudge.
 */
export const REAL_DIMENSIONS = Object.freeze({
  'w-class-tram': { length: 13.9, height: 3.28, width: 2.67 },
  'e-class-tram': { length: 16.5, height: 3.60, width: 2.65 },
  'australian-eucalyptus': { height: 8.4 },
  'australian-jacaranda': { height: 7.6 },
  'australian-bottlebrush': { height: 5.2 },
  'plane-tree-london': { height: 12 },
  'car-sedan': { length: 4.7, height: 1.45, width: 1.8 },
});

/**
 * Per-axis scale that lands a model on its declared size. Axes are glTF: x length,
 * y roof height for trams (collector excluded), z width. Missing dimensions leave that axis on the uniform height factor.
 */
export function fitScale(model, id) {
  const target = REAL_DIMENSIONS[id];
  if (!model || !target || !model.size) return { x: 1, y: 1, z: 1, uniform: 1 };
  if (id === 'w-class-tram' || id === 'e-class-tram') {
    const fit = tramFactoryScale(model,id);
    return {...fit,uniform:fit.y};
  }
  const size = model.size;
  const uniform = target.height && size.y > 0.001 ? target.height / size.y : 1;
  return {
    x: target.length && size.x > 0.001 ? target.length / size.x : uniform,
    y: uniform,
    z: target.width && size.z > 0.001 ? target.width / size.z : uniform,
    uniform,
  };
}

/**
 * Collapse a loaded glTF scene to one mesh per material, with world transforms baked.
 * The factory assets carry hundreds of separate objects; without this a single tram
 * costs 331 draw calls.
 */
/**
 * KHR_mesh_quantization stores positions as normalized integers. applyMatrix4 and
 * mergeGeometries both assume float attributes, so de-quantize before touching
 * anything — skipping this silently corrupts every quantized asset in the kit.
 */
function toFloatAttribute(attribute) {
  if (attribute.array instanceof Float32Array && !attribute.normalized) return attribute;
  const { itemSize, count } = attribute;
  const out = new Float32Array(count * itemSize);
  for (let i = 0; i < count; i += 1) {
    out[i * itemSize] = attribute.getX(i);
    if (itemSize > 1) out[i * itemSize + 1] = attribute.getY(i);
    if (itemSize > 2) out[i * itemSize + 2] = attribute.getZ(i);
    if (itemSize > 3) out[i * itemSize + 3] = attribute.getW(i);
  }
  return new THREE.BufferAttribute(out, itemSize);
}

/** Modern kit exports keep tap-to-open leaves under `dd-openings`. Strip them before merge. */
function extractModernOpenings(root) {
  if (!root) return [];
  root.updateMatrixWorld(true);
  let meta = [];
  root.traverse((node) => {
    const extras = node.userData?.districtDeck?.openings;
    if (Array.isArray(extras) && extras.length) meta = extras;
  });
  const openingRoot = root.getObjectByName('dd-openings');
  if (!openingRoot) return [];
  const byId = new Map(meta.map((item) => [item.id, item]));
  const openings = [];
  for (const child of [...openingRoot.children]) {
    const id = String(child.name ?? '').replace(/^dd-opening:/, '') || `opening-${openings.length}`;
    const parts = [];
    child.updateMatrixWorld(true);
    child.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.geometry) return;
      const geometry = mesh.geometry.clone();
      for (const name of Object.keys(geometry.attributes)) {
        if (!['position', 'normal', 'uv'].includes(name)) {
          geometry.deleteAttribute(name);
          continue;
        }
        geometry.setAttribute(name, toFloatAttribute(geometry.attributes[name]));
      }
      geometry.applyMatrix4(mesh.matrixWorld);
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      // P16 (2026-09-04): the road modules ship with no usable UVs (every vertex at (0, 0)),
      // so their 512-px grunge map sampled one near-black texel across the whole tile — the
      // roads rendered darker than their albedo everywhere and crushed to black in shade (the
      // blind critic's "unlit black void wedge" at the beach corner). Planar XZ UVs at one
      // unit per metre; the material's repeat sets the tiling. Assets with real UVs are untouched.
      ensurePlanarUv(geometry);
      geometry.computeBoundingBox();
      parts.push({ geometry, material: mesh.material });
    });
    const rec = byId.get(id) ?? {
      id, kind: 'door', label: id, pivot: { x: 0, y: 1, z: 0 }, axis: 'y', openAngle: -1.1,
    };
    openings.push({ ...rec, parts });
  }
  openingRoot.removeFromParent();
  return openings;
}

function* mergeByMaterialSteps(root) {
  const pauseBuild = buildBudget();
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const children = [];
  root.traverse(child => children.push(child));
  for (const child of children) {
    if (pauseBuild()) yield null;
    if (!child.isMesh || !child.geometry) continue;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const material = materials[0];
    const key = material.uuid;
    const geometry = child.geometry.clone();
    // Merging requires a uniform, float, non-interleaved attribute set.
    for (const name of Object.keys(geometry.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) { geometry.deleteAttribute(name); continue; }
      geometry.setAttribute(name, toFloatAttribute(geometry.attributes[name]));
    }
    geometry.applyMatrix4(child.matrixWorld);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    if (!geometry.attributes.uv) {
      const count = geometry.attributes.position.count;
      geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    if (!buckets.has(key)) buckets.set(key, { material, geometries: [] });
    buckets.get(key).geometries.push(geometry);
  }

  const parts = [];
  for (const { material, geometries } of buckets.values()) {
    if (pauseBuild()) yield null;
    const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    if (!merged) continue;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    ensurePlanarUv(merged);
    parts.push({ geometry: merged, material });
  }
  return parts;
}

/** Drop the model onto y = 0 and report its measured size. Framework §1.5 / §1.6. */
function normaliseToGround(parts) {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  for (const part of parts) {
    tmp.copy(part.geometry.boundingBox);
    box.union(tmp);
  }
  if (!Number.isFinite(box.min.y)) return { parts, size: new THREE.Vector3(), offsetY: 0 };
  const offsetY = -box.min.y;
  if (Math.abs(offsetY) > 0.001) {
    for (const part of parts) {
      part.geometry.translate(0, offsetY, 0);
      part.geometry.computeBoundingBox();
      part.geometry.computeBoundingSphere();
    }
  }
  const size = new THREE.Vector3();
  box.getSize(size);
  return { parts, size, offsetY };
}

/** Procedural fallback massing — never a blank tile. Framework §5.1, last row. */
function fallbackBuilding(archetypeId) {
  const archetype = ARCHETYPES[archetypeId] ?? ARCHETYPES['terrace-single'];
  const [fx, fz] = archetype.footprint;
  const w = fx * TILE - 1;
  const d = fz * TILE - 1;
  const h = archetype.storeys * STOREY;
  const parts = [];

  const body = new THREE.BoxGeometry(w * 0.86, h, d * 0.86);
  body.translate(0, h / 2, 0);
  body.computeBoundingBox();
  parts.push({
    geometry: body,
    material: new THREE.MeshStandardMaterial({ color: FALLBACK_COLOURS.brick, roughness: 0.85 }),
  });

  const roof = new THREE.BoxGeometry(w * 0.9, 0.5, d * 0.9);
  roof.translate(0, h + 0.25, 0);
  roof.computeBoundingBox();
  parts.push({
    geometry: roof,
    material: new THREE.MeshStandardMaterial({ color: FALLBACK_COLOURS.iron, roughness: 0.7 }),
  });

  return { parts, size: new THREE.Vector3(w, h, d), fallback: true };
}

/**
 * Ground and road modules need fallbacks too. One missing `road-straight.glb` used to
 * punch holes straight through the board, and a missing kit left buildings floating over
 * a blank plinth — a 404 must degrade the look, never the playability.
 */
function fallbackGround(id) {
  const parts = [];
  const add = (geometry, color, roughness = 0.95) => {
    geometry.computeBoundingBox();
    ensurePlanarUv(geometry); // procedural ground/road tiles carry no UVs (P16 2026-09-04)
    parts.push({ geometry, material: new THREE.MeshStandardMaterial({ color, roughness }) });
  };

  if (id === 'ground-tile') {
    const g = new THREE.BoxGeometry(TILE, 0.02, TILE);
    g.translate(0, 0.01, 0);
    add(g, 0x3d5c2e);
    return { parts, size: new THREE.Vector3(TILE, 0.02, TILE), fallback: true };
  }

  // Every road module is the same section: footpath, carriageway, reservation, back out.
  const bands = [
    [CORRIDOR.footpathA, 0.16, 0x85827a],
    [CORRIDOR.carriagewayA, 0.02, 0x14171a],
    [CORRIDOR.tramReservation, 0.02, 0x4d5145],
    [CORRIDOR.carriagewayB, 0.02, 0x14171a],
    [CORRIDOR.footpathB, 0.16, 0x85827a],
  ];
  for (const [[from, to], height, colour] of bands) {
    const width = to - from;
    const g = new THREE.BoxGeometry(width, height, TILE);
    g.translate(from + width / 2 - TILE / 2, height / 2, 0);
    add(g, colour, 0.94);
  }
  if (id === 'road-tram-straight') {
    for (const offset of [-0.72, 0.72]) {
      const rail = new THREE.BoxGeometry(0.09, 0.04, TILE);
      rail.translate(offset, 0.04, 0);
      add(rail, 0x565b5f, 0.35);
    }
  }
  return { parts, size: new THREE.Vector3(TILE, 0.18, TILE), fallback: true };
}

function fallbackProp() {
  const g = new THREE.BoxGeometry(0.5, 0.9, 0.5);
  g.translate(0, 0.45, 0);
  g.computeBoundingBox();
  return {
    parts: [{
      geometry: g,
      material: new THREE.MeshStandardMaterial({ color: FALLBACK_COLOURS.bluestone, roughness: 0.9 }),
    }],
    size: new THREE.Vector3(0.5, 0.9, 0.5),
    fallback: true,
  };
}

/**
 * Honest tram massing when the factory GLB fails to load. Must already be in board metres
 * so board.js never multiplies a 0.5 m prop box by fitScale → 28 m cream selection bar.
 */
function fallbackTram(id) {
  return exposeFactoryTramLivery(buildTramModel(id), id);
}

export class AssetRegistry {
  constructor() {
    this.models = new Map();     // id -> { parts, size, source, fallback }
    this.manifest = null;
    this.diagnostics = [];
    const draco = new DRACOLoader();
    draco.setDecoderPath('./vendor/three/examples/jsm/libs/draco/gltf/');
    this.loader = new GLTFLoader();
    this.loader.setDRACOLoader(draco);
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    this.dracoLoader = draco;
  }

  async loadOne(id, url, source) {
    try {
      const gltf = await this.loader.loadAsync(url);
      await yieldToBrowser();
      const openings = extractModernOpenings(gltf.scene);
      const parts = await runBuild(mergeByMaterialSteps(gltf.scene));
      if (!parts.length) throw new Error('no geometry');
      const normalised = normaliseToGround(parts);
      if (Math.abs(normalised.offsetY) > 0.001) {
        for (const opening of openings) {
          for (const part of opening.parts ?? []) {
            part.geometry.translate(0, normalised.offsetY, 0);
            part.geometry.computeBoundingBox();
          }
          if (opening.pivot) opening.pivot = {
            ...opening.pivot,
            y: opening.pivot.y + normalised.offsetY,
          };
        }
      }
      for (const part of parts) {
        part.material = part.material.clone();
        // Civic Codex GLBs are authored double-sided in places (thin clock faces,
        // glass, fretwork). FrontSide culled those to empty lots from the board camera.
        part.material.side = source === 'commissioned-blender' ? THREE.DoubleSide : THREE.FrontSide;
        if (part.material.map) part.material.map.colorSpace = THREE.SRGBColorSpace;
      }
      // Production trial for this asset only. The two named glasses were the
      // supermarket identities in the transmission pass. The GLB bytes, alpha,
      // opacity, thickness, name and material object stay; door motion is untouched.
      if (id === 'supermarket-strip') {
        const trialGlass = new Set(['commercial shopfront glass', 'auto door glass transparent']);
        const clearTransmission = (material) => {
          const list = Array.isArray(material) ? material : [material];
          for (const m of list) if (m && trialGlass.has(m.name)) m.transmission = 0;
        };
        for (const part of parts) clearTransmission(part.material);
        for (const opening of openings) {
          for (const part of opening.parts ?? []) clearTransmission(part.material);
        }
      }
      this.models.set(id, {
        ...normalised,
        source,
        fallback: false,
        drawParts: parts.length,
        openings,
        // K1: landmark GLBs keep their node graph (group ids, COLOR_0) for placement beside the merged parts.
        ...(source === 'landmark-blender' || source === 'prop-scene' ? { scene: restoreNodeNames(gltf) } : {}),
      });
      if (id === 'w-class-tram' || id === 'e-class-tram') {
        exposeFactoryTramLivery(this.models.get(id),id);
        registerFactoryTram(id, this.models.get(id));
      }
      return true;
    } catch (error) {
      this.diagnostics.push({ id, url, error: String(error && error.message ? error.message : error) });
      return false;
    }
  }

  /**
   * Load the kit, then the factory props. A failure anywhere installs the procedural
   * fallback for that id and records a diagnostic — it never blocks the game.
   */
  async loadAll(onProgress = () => {}) {
    let manifest = null;
    try {
      const res = await fetch(`${KIT_PATH}kit-manifest.json`);
      if (res.ok) manifest = await res.json();
    } catch (error) {
      this.diagnostics.push({ id: 'kit-manifest', error: String(error) });
    }
    this.manifest = manifest;

    const kitIds = manifest
      ? manifest.assets.map((a) => ({ id: a.id, file: a.file }))
      : [
        ...Object.keys(ARCHETYPES).map((id) => ({ id, file: `${id}.glb` })),
        ...GROUND_MODELS.map((id) => ({ id, file: `${id}.glb` })),
      ];

    const requestedJobs = [
      // Commissioned landmarks / parcel heroes first so they win de-duplication over kit rows.
      { id: 'stock-exchange', url: './assets/models/stock-exchange.glb', source: 'commissioned-blender' },
      { id: 'hospital-district', url: './assets/models/hospital-district.glb', source: 'commissioned-blender' },
      { id: 'cafe-corner', url: './assets/models/cafe-corner.glb', source: 'commissioned-blender' },
      { id: 'supermarket-strip', url: './assets/models/supermarket-strip.glb', source: 'commissioned-blender' },
      { id: 'school-primary', url: './assets/models/school-primary.glb', source: 'commissioned-blender' },
      { id: 'remand-centre', url: './assets/models/remand-centre.glb', source: 'commissioned-blender' },
      { id: 'factory-light', url: './assets/models/factory-light.glb', source: 'commissioned-blender' },
      { id: 'house-modern-skillion', url: './assets/models/house-modern-skillion.glb', source: 'modern-glb' },
      { id: 'house-modern-pavilion', url: './assets/models/house-modern-pavilion.glb', source: 'modern-glb' },
      { id: 'townhouse-modern-brick', url: './assets/models/townhouse-modern-brick.glb', source: 'modern-glb' },
      { id: 'townhouse-modern-render', url: './assets/models/townhouse-modern-render.glb', source: 'modern-glb' },
      { id: 'apartment-modern-courtyard', url: './assets/models/apartment-modern-courtyard.glb', source: 'modern-glb' },
      { id: 'apartment-modern-bar', url: './assets/models/apartment-modern-bar.glb', source: 'modern-glb' },
      ...kitIds.map((a) => ({ id: a.id, url: KIT_PATH + a.file, source: 'procedural-blender' })),
      ...PROP_MODELS.map((id) => ({ id, url: `${PROP_PATH}${id}.glb`, source: 'factory-import' })),
      ...TRANSIT_MODELS.map((id) => ({ id, url: `${PROP_PATH}${id}.glb`, source: 'factory-import' })),
      ...TREE_MODELS.map((id) => ({ id, url: `${PROP_PATH}${id}.glb`, source: 'factory-import' })),
      // K1: landmark GLBs join only when `?landmarks=` names them; switch absent = no extra request.
      ...landmarkJobs(globalThis.location?.search ?? ''),
      // L2b: switched props after the landmark rows, on the same switch.
      ...switchedPropJobs(globalThis.location?.search ?? ''),
    ];
    // A manifest may promote a former factory import into the commissioned kit. Keep
    // the manifest row (first occurrence) and avoid racing two loads into one id.
    const jobs = requestedJobs.filter(
      (job, index) => requestedJobs.findIndex((candidate) => candidate.id === job.id) === index,
    );

    let done = 0;
    // Sequential-ish batching keeps the Draco worker pool sane on low-end devices.
    const BATCH = 4;
    for (let i = 0; i < jobs.length; i += BATCH) {
      await yieldToBrowser();
      const slice = jobs.slice(i, i + BATCH);
      await Promise.all(slice.map(async (job) => {
        await this.loadOne(job.id, job.url, job.source);
        done += 1;
        onProgress(done / jobs.length, job.id);
      }));
    }

    // Install fallbacks for anything that did not arrive.
    for (const id of Object.keys(ARCHETYPES)) {
      if (!this.models.has(id)) {
        this.models.set(id, { ...fallbackBuilding(id), source: 'runtime-procedural' });
      }
    }
    for (const id of GROUND_MODELS) {
      if (!this.models.has(id)) {
        this.models.set(id, { ...fallbackGround(id), source: 'runtime-procedural' });
      }
    }
    for (const id of [...PROP_MODELS, ...TREE_MODELS]) {
      if (!this.models.has(id)) {
        this.models.set(id, { ...fallbackProp(), source: 'runtime-procedural' });
      }
    }
    for (const id of TRANSIT_MODELS) {
      if (!this.models.has(id)) {
        // Trams must never use fallbackProp (0.5 m cube) — fitScale would explode them.
        this.models.set(
          id,
          id === 'tram-stop-shelter'
            ? { ...fallbackProp(), source: 'runtime-procedural' }
            : fallbackTram(id),
        );
      }
    }
    this.dracoLoader.dispose();
    return this;
  }

  get(id) {
    return this.models.get(id) ?? null;
  }

  has(id) {
    return this.models.has(id);
  }

  /** Provenance summary — framework §5.1 last paragraph. */
  provenance() {
    const counts = { 'procedural-blender': 0, 'factory-import': 0, 'runtime-procedural': 0 };
    for (const model of this.models.values()) counts[model.source] = (counts[model.source] ?? 0) + 1;
    return { counts, diagnostics: this.diagnostics };
  }

  dispose() {
    for (const [id, model] of this.models) {
      forgetFactoryTram(id,model);
      for (const part of model.parts) {
        part.geometry.dispose();
        if (part.material.map) part.material.map.dispose();
        part.material.dispose();
      }
    }
    this.models.clear();
  }
}

export { FALLBACK_COLOURS };
