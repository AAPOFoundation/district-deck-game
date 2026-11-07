// F1 tram-stop orbit lab: the kit stop and a free flag on a strip of footpath and road.
// ?az=<deg>&pol=<deg>&d=<m> sets the orbit (defaults 200, 62, 14); ?flag=0 hides the free flag.
// One sun at 42 degrees, as the board (v4-p1-polish.js:181). Not the board's grade or post.
import * as THREE from 'three';
import { MaterialLibrary } from './render/materials.js';
import { tramStopModel, tramFlagModel, kitStats, tramFlagPlate, TRAM_STOP_DIMENSIONS } from './render/tram-stop-kit.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) && Number.isFinite(+q.get(k)) ? +q.get(k) : d);
const canvas = document.getElementById('lab');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#b9c2c6');
scene.add(new THREE.HemisphereLight('#dfe6ea', '#7d776c', 0.9));
const sun = new THREE.DirectionalLight('#fff4e2', 2.6);
const elev = 42 * Math.PI / 180;
sun.position.set(Math.cos(elev) * 20 * Math.sin(1.15), Math.sin(elev) * 20, Math.cos(elev) * 20 * Math.cos(1.15));
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 60 });
scene.add(sun);

const box = (w, h, d, x, y, z, color, roughness = 0.92) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness }));
  m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); return m;
};
// Footpath (top 0.275 world), kerb, road. Stop frame: kerb at z -1.5.
box(16, 0.275, 3.0, 0, 0.1375, 0, '#a39e96');
box(16, 0.295, 0.28, 0, 0.1475, -1.5, '#a39e96');
box(16, 0.05, 8, 0, 0.025, -5.6, '#4c4f50', 0.95);

const lib = new MaterialLibrary();
const ensureUv2 = (g) => MaterialLibrary.ensureUv2(g);
const add = (model, x, y, z) => {
  const g = new THREE.Group();
  for (const p of model.parts) {
    const m = new THREE.Mesh(p.geometry, p.material);
    m.castShadow = p.castShadow !== false; m.receiveShadow = true; g.add(m);
  }
  g.position.set(x, y, z); scene.add(g); return g;
};
const stop = tramStopModel(lib, { ensureUv2 });
const stopGroup = add(stop, 0, TRAM_STOP_DIMENSIONS.stopBaseWorld, 0);
const plates = (group, kind, text) => {
  const part = tramFlagPlate(lib, text, kind);
  if (part) {
    const mesh = new THREE.Mesh(part.geometry, part.material);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
};
plates(stopGroup, 'stop', '12');
if (q.get('flag') !== '0') {
  const flagGroup = add(tramFlagModel(lib, { ensureUv2 }), -6.5, 0, 0);
  plates(flagGroup, 'flag', '12');
}

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
const target = new THREE.Vector3(0, 1.4, 0);
const view = { az: num('az', 200), pol: num('pol', 62), d: num('d', 14) };
const place = () => {
  const az = view.az * Math.PI / 180;
  const pol = view.pol * Math.PI / 180;
  camera.position.set(target.x + view.d * Math.sin(pol) * Math.sin(az), target.y + view.d * Math.cos(pol),
    target.z + view.d * Math.sin(pol) * Math.cos(az));
  camera.lookAt(target);
};
// Drag to orbit, wheel to dolly (the vendored three carries no OrbitControls).
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  view.az -= (e.clientX - drag.x) * 0.3;
  view.pol = Math.min(88, Math.max(8, view.pol - (e.clientY - drag.y) * 0.3));
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('wheel', (e) => { view.d = Math.min(60, Math.max(4, view.d * (e.deltaY > 0 ? 1.08 : 0.92))); });
const resize = () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
};
addEventListener('resize', resize); resize();
window.__tramStopLab = { stats: kitStats(stop), ready: false };
renderer.setAnimationLoop(() => { place(); renderer.render(scene, camera); window.__tramStopLab.ready = true; });
