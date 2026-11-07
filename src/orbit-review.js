import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const canvas = document.querySelector('#orbit-canvas');
const stateLabel = document.querySelector('#load-state');
const viewportStatus = document.querySelector('#viewport-status');
const assetPosition = document.querySelector('#asset-position');
const assetList = document.querySelector('#asset-list');
const searchInput = document.querySelector('#asset-search');
const referenceImage = document.querySelector('#reference-image');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#626b69');
scene.fog = new THREE.Fog('#626b69', 70, 150);

const camera = new THREE.PerspectiveCamera(31, 1, 0.05, 240);
camera.up.set(0, 1, 0);

scene.add(new THREE.HemisphereLight('#fff4df', '#302f2d', 1.65));
const keyLight = new THREE.DirectionalLight('#ffe0bb', 3.1);
keyLight.position.set(-18, 26, 20);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.1;
keyLight.shadow.camera.far = 90;
keyLight.shadow.camera.left = -35;
keyLight.shadow.camera.right = 35;
keyLight.shadow.camera.top = 35;
keyLight.shadow.camera.bottom = -35;
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight('#bad4e6', 1.2);
fillLight.position.set(18, 12, -18);
scene.add(fillLight);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(46, 96),
  new THREE.MeshStandardMaterial({ color: '#384441', roughness: 0.97, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.025;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(72, 36, '#87918d', '#59635f');
grid.position.y = 0.006;
grid.material.transparent = true;
grid.material.opacity = 0.26;
scene.add(grid);

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const orbit = {
  target: new THREE.Vector3(0, 2, 0),
  theta: Math.PI * 0.72,
  phi: Math.PI * 0.34,
  radius: 22,
  minRadius: 2,
  maxRadius: 120,
  dragging: false,
  pointerId: null,
  x: 0,
  y: 0,
  autoRotate: false,
};

const views = {
  isometric: new THREE.Vector3(1.25, 0.78, 1.35),
  front: new THREE.Vector3(0, 0.28, 1),
  rear: new THREE.Vector3(0, 0.28, -1),
  left: new THREE.Vector3(-1, 0.28, 0),
  right: new THREE.Vector3(1, 0.28, 0),
  top: new THREE.Vector3(0.001, 1.8, 0.001),
};

let manifest;
let specs;
let assets = [];
let selectedIndex = 0;
let currentModel = null;
let currentBoundsHelper = null;
let currentMetrics = null;
let wireframeEnabled = false;
let boundsEnabled = false;
let loadEpoch = 0;

function updateCamera() {
  const sinPhi = Math.sin(orbit.phi);
  camera.position.set(
    orbit.target.x + orbit.radius * sinPhi * Math.sin(orbit.theta),
    orbit.target.y + orbit.radius * Math.cos(orbit.phi),
    orbit.target.z + orbit.radius * sinPhi * Math.cos(orbit.theta),
  );
  camera.lookAt(orbit.target);
}

function setPressed(selector, value) {
  document.querySelectorAll(selector).forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.view === value));
  });
}

function setView(name = 'isometric') {
  const direction = views[name].clone().normalize();
  orbit.theta = Math.atan2(direction.x, direction.z);
  orbit.phi = Math.acos(THREE.MathUtils.clamp(direction.y, -0.9999, 0.9999));
  setPressed('[data-view]', name);
  updateCamera();
}

function frameModel(name = 'isometric') {
  if (!currentMetrics) return;
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  orbit.radius = (currentMetrics.radius / Math.sin(limitingFov / 2)) * 1.12;
  orbit.minRadius = Math.max(1.2, currentMetrics.radius * 0.72);
  orbit.maxRadius = Math.max(30, currentMetrics.radius * 8);
  orbit.target.set(0, currentMetrics.size.y * 0.43, 0);
  camera.near = Math.max(0.035, currentMetrics.radius / 200);
  camera.far = Math.max(160, currentMetrics.radius * 16);
  camera.updateProjectionMatrix();
  setView(name);
}

function disposeObject(root) {
  if (!root) return;
  scene.remove(root);
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    geometries.add(object.geometry);
    const rows = Array.isArray(object.material) ? object.material : [object.material];
    rows.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function actualMetrics(model) {
  let triangles = 0;
  let meshes = 0;
  const materials = new Set();
  model.traverse((object) => {
    if (!object.isMesh) return;
    meshes += 1;
    const count = object.geometry.index?.count ?? object.geometry.attributes.position?.count ?? 0;
    triangles += Math.floor(count / 3);
    const rows = Array.isArray(object.material) ? object.material : [object.material];
    rows.forEach((material) => materials.add(material.name || material.uuid));
  });
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  return { triangles, meshes, materials: materials.size, box, size, radius: sphere.radius };
}

function prepareModel(model) {
  let box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  model.updateMatrixWorld(true);
  model.traverse((object) => {
    if (!object.isMesh) return;
    const rows = Array.isArray(object.material) ? object.material : [object.material];
    const glass = rows.some((material) => /glass|glaz/i.test(material?.name ?? ''));
    object.castShadow = !glass;
    object.receiveShadow = !glass;
    rows.forEach((material) => {
      if (!material?.isMeshStandardMaterial) return;
      material.envMapIntensity = glass ? 0.9 : 0.3;
      material.wireframe = wireframeEnabled;
      material.needsUpdate = true;
    });
  });
  box = new THREE.Box3().setFromObject(model);
  return actualMetrics(model);
}

function formatMetres(size) {
  return `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m`;
}

function updateInspector(row, spec, metrics) {
  document.querySelector('#asset-wave').textContent = row.wave === 'H' ? 'Heritage replacement' : `Wave ${row.wave}`;
  document.querySelector('#asset-name').textContent = spec?.label ?? row.id.replaceAll('-', ' ');
  document.querySelector('#melbourne-register').textContent = spec?.melbourneRegister ?? 'District Deck procedural map asset.';
  document.querySelector('#metric-size').textContent = formatMetres(metrics.size);
  document.querySelector('#metric-geometry').textContent = `${metrics.meshes} meshes · ${metrics.materials} materials`;
  document.querySelector('#metric-manifest').textContent = `${row.triangles.toLocaleString()} triangles · ${row.gateState}`;
  document.querySelector('#metric-runtime').textContent = (
    metrics.triangles === row.triangles && metrics.materials === row.materials
      ? 'Exact parity'
      : `${metrics.triangles.toLocaleString()} tris · ${metrics.materials} mats`
  );
  const list = document.querySelector('#critical-features');
  list.replaceChildren();
  for (const feature of spec?.criticalFeatures ?? []) {
    const item = document.createElement('li');
    item.textContent = feature;
    list.append(item);
  }
  referenceImage.src = `/review-reference/${row.id}-six-view.png`;
  referenceImage.alt = `${spec?.label ?? row.id} six-view likeness reference`;
  document.querySelector('#model-link').href = `/assets/models/${row.file}`;
}

function updateSelectionUI(row) {
  document.querySelectorAll('.asset-button').forEach((button) => {
    button.setAttribute('aria-current', String(button.dataset.id === row.id));
  });
  assetPosition.textContent = `${selectedIndex + 1} / ${assets.length} · ${row.id}`;
}

async function selectAsset(id) {
  const index = assets.findIndex((row) => row.id === id);
  if (index < 0) throw new Error(`unknown review asset: ${id}`);
  selectedIndex = index;
  const row = assets[index];
  const spec = specs.get(row.id);
  const epoch = ++loadEpoch;
  stateLabel.dataset.state = 'loading';
  stateLabel.textContent = `Loading ${row.id}`;
  viewportStatus.hidden = false;
  viewportStatus.textContent = 'Loading GLB';
  canvas.dataset.modelReady = 'false';
  updateSelectionUI(row);

  try {
    const gltf = await loader.loadAsync(`/assets/models/${row.file}`);
    if (epoch !== loadEpoch) {
      disposeObject(gltf.scene);
      return;
    }
    disposeObject(currentModel);
    if (currentBoundsHelper) {
      scene.remove(currentBoundsHelper);
      currentBoundsHelper.geometry.dispose();
      currentBoundsHelper.material.dispose();
    }
    currentModel = gltf.scene;
    currentModel.name = `review:${row.id}`;
    currentMetrics = prepareModel(currentModel);
    scene.add(currentModel);
    currentBoundsHelper = new THREE.Box3Helper(currentMetrics.box, '#ffd0a6');
    currentBoundsHelper.visible = boundsEnabled;
    scene.add(currentBoundsHelper);
    frameModel('isometric');
    updateInspector(row, spec, currentMetrics);
    stateLabel.dataset.state = 'ready';
    stateLabel.textContent = 'Runtime GLB ready';
    viewportStatus.hidden = true;
    Object.assign(canvas.dataset, {
      modelReady: 'true',
      assetId: row.id,
      triangles: String(currentMetrics.triangles),
      materials: String(currentMetrics.materials),
      meshes: String(currentMetrics.meshes),
    });
  } catch (error) {
    console.error(`[orbit-review] ${row.id} failed`, error);
    stateLabel.dataset.state = 'error';
    stateLabel.textContent = 'Model failed';
    viewportStatus.hidden = false;
    viewportStatus.textContent = 'GLB load failed';
    canvas.dataset.modelReady = 'false';
    throw error;
  }
}

function renderAssetList() {
  const labels = { H: 'Heritage', A: 'Wave A · Succession', B: 'Wave B · Civic', C: 'Wave C · Map systems' };
  assetList.replaceChildren();
  for (const wave of ['H', 'A', 'B', 'C']) {
    const rows = assets.filter((row) => row.wave === wave);
    if (!rows.length) continue;
    const section = document.createElement('section');
    section.className = 'asset-group';
    section.dataset.wave = wave;
    const heading = document.createElement('h3');
    heading.textContent = labels[wave];
    const items = document.createElement('div');
    items.className = 'asset-list__items';
    for (const row of rows) {
      const spec = specs.get(row.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'asset-button';
      button.dataset.id = row.id;
      button.dataset.search = `${row.id} ${spec?.label ?? ''} ${spec?.melbourneRegister ?? ''}`.toLowerCase();
      button.setAttribute('aria-current', 'false');
      const name = document.createElement('span');
      name.textContent = spec?.label ?? row.id;
      const detail = document.createElement('small');
      detail.textContent = `${row.triangles.toLocaleString()} tris · ${row.materials} mats`;
      button.append(name, detail);
      button.addEventListener('click', () => selectAsset(row.id));
      items.append(button);
    }
    section.append(heading, items);
    assetList.append(section);
  }
}

function filterAssets(query) {
  const needle = query.trim().toLowerCase();
  document.querySelectorAll('.asset-group').forEach((group) => {
    let visible = 0;
    group.querySelectorAll('.asset-button').forEach((button) => {
      button.hidden = Boolean(needle) && !button.dataset.search.includes(needle);
      if (!button.hidden) visible += 1;
    });
    group.hidden = visible === 0;
  });
}

canvas.addEventListener('pointerdown', (event) => {
  orbit.dragging = true;
  orbit.pointerId = event.pointerId;
  orbit.x = event.clientX;
  orbit.y = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!orbit.dragging || event.pointerId !== orbit.pointerId) return;
  const dx = event.clientX - orbit.x;
  const dy = event.clientY - orbit.y;
  orbit.x = event.clientX;
  orbit.y = event.clientY;
  orbit.theta -= dx * 0.006;
  orbit.phi = THREE.MathUtils.clamp(orbit.phi + dy * 0.006, 0.05, Math.PI * 0.49);
  setPressed('[data-view]', '');
  updateCamera();
});
const releasePointer = (event) => {
  if (event.pointerId !== orbit.pointerId) return;
  orbit.dragging = false;
  orbit.pointerId = null;
};
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  orbit.radius = THREE.MathUtils.clamp(
    orbit.radius * Math.exp(event.deltaY * 0.001),
    orbit.minRadius,
    orbit.maxRadius,
  );
  updateCamera();
}, { passive: false });

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});
document.querySelector('#auto-rotate').addEventListener('click', (event) => {
  orbit.autoRotate = !orbit.autoRotate;
  event.currentTarget.setAttribute('aria-pressed', String(orbit.autoRotate));
});
document.querySelector('#wireframe').addEventListener('click', (event) => {
  wireframeEnabled = !wireframeEnabled;
  currentModel?.traverse((object) => {
    if (!object.isMesh) return;
    const rows = Array.isArray(object.material) ? object.material : [object.material];
    rows.forEach((material) => {
      material.wireframe = wireframeEnabled;
      material.needsUpdate = true;
    });
  });
  event.currentTarget.setAttribute('aria-pressed', String(wireframeEnabled));
});
document.querySelector('#bounds').addEventListener('click', (event) => {
  boundsEnabled = !boundsEnabled;
  if (currentBoundsHelper) currentBoundsHelper.visible = boundsEnabled;
  event.currentTarget.setAttribute('aria-pressed', String(boundsEnabled));
});
document.querySelector('#reset-view').addEventListener('click', () => {
  orbit.autoRotate = false;
  document.querySelector('#auto-rotate').setAttribute('aria-pressed', 'false');
  frameModel('isometric');
});
searchInput.addEventListener('input', () => filterAssets(searchInput.value));
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const delta = event.key === 'ArrowDown' ? 1 : -1;
  const next = (selectedIndex + delta + assets.length) % assets.length;
  selectAsset(assets[next].id);
});

function resize() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();
updateCamera();

let previousTime = performance.now();
renderer.setAnimationLoop((time) => {
  const dt = Math.min(0.05, (time - previousTime) / 1000);
  previousTime = time;
  if (orbit.autoRotate && !orbit.dragging) {
    orbit.theta += dt * 0.42;
    updateCamera();
  }
  renderer.render(scene, camera);
});

async function boot() {
  const [manifestResponse, specResponse] = await Promise.all([
    fetch('./assets/models/kit-manifest.json'),
    fetch('/review-spec.json'),
  ]);
  if (!manifestResponse.ok || !specResponse.ok) throw new Error('review data unavailable');
  manifest = await manifestResponse.json();
  const specPayload = await specResponse.json();
  specs = new Map(specPayload.assets.map((row) => [row.id, row]));
  assets = manifest.assets.filter((row) => ['H', 'A', 'B', 'C'].includes(row.wave));
  renderAssetList();
  await selectAsset('bungalow-californian');
  window.__v302Orbit = {
    select: selectAsset,
    snapshot: () => ({
      selectedId: assets[selectedIndex]?.id ?? null,
      assetIds: assets.map((row) => row.id),
      ready: canvas.dataset.modelReady === 'true',
      triangles: Number(canvas.dataset.triangles ?? 0),
      materials: Number(canvas.dataset.materials ?? 0),
      meshes: Number(canvas.dataset.meshes ?? 0),
      dimensions: currentMetrics?.size.toArray() ?? null,
      wireframe: wireframeEnabled,
      bounds: boundsEnabled,
      autoRotate: orbit.autoRotate,
    }),
  };
}

boot().catch((error) => {
  console.error('[orbit-review] boot failed', error);
  stateLabel.dataset.state = 'error';
  stateLabel.textContent = 'Review failed';
  viewportStatus.textContent = 'Review data unavailable';
});
