// Standalone AF1 capture plate using the board's LightingRig and PostChain.
import * as THREE from 'three';
import { addPlane } from './render/fringe/aircraft.js';
import { createCityFringeMaterial } from './render/materials.js';
import { LightingRig } from './render/lighting.js';
import { PostChain } from './render/post.js';

export function aircraftLabView(search = '') {
  const q = new URLSearchParams(search);
  const number = (key, fallback, min, max) => {
    const raw = q.get(key), n = raw === null || raw === '' ? fallback : Number(raw);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };
  const type = ['a380', '747', 'private-jet'].includes(q.get('type')) ? q.get('type') : 'a380';
  const view = q.get('view') ?? '3q-front';
  return { type, view, distance: number('d', 38, 6, 240), pitch: number('p', view === 'top' ? 80 : 22, 5, 85),
    azimuth: number('a', ({ '3q-front': -38, side: -90, rear: 180, top: 0, front: 0 })[view] ?? -38, -360, 360) };
}

/** This assembly is also built by node tests; no DOM, renderer or textures required. */
export function buildAircraftLabScene(search = '') {
  const view = aircraftLabView(search), scene = new THREE.Scene();
  scene.background = new THREE.Color('#a9afb5');
  const source = createCityFringeMaterial('#ffffff', { roughness: 0.46, metalness: 0.06,
    emissive: '#1c1c1c', vertexColors: true }, 'fringe/airport.js');
  const aircraft = addPlane(view.type, { airframe: source }, {}, { search });
  scene.add(aircraft);
  const paint = (color, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(180, 0.16, 180), paint('#817b6d'));
  slab.position.y = -0.08; slab.name = 'aircraft-lab:apron'; slab.receiveShadow = true; scene.add(slab);
  const bounds = new THREE.Box3().setFromObject(aircraft), span = bounds.max.x;
  const figure = new THREE.Group(); figure.name = 'aircraft-lab:adult'; figure.position.set(span + 2, 0, 1);
  const coat = paint('#696355'), skin = paint('#b39b83');
  const part = (geometry, material, x, y, z) => {
    const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; figure.add(m); return m;
  };
  part(new THREE.SphereGeometry(0.12, 10, 6), skin, 0, 1.58, 0);
  part(new THREE.CylinderGeometry(0.16, 0.13, 0.57, 8), coat, 0, 1.135, 0);
  for (const side of [-1, 1]) {
    part(new THREE.CylinderGeometry(0.065, 0.055, 0.81, 6), coat, side * 0.085, 0.445, 0);
    part(new THREE.BoxGeometry(0.11, 0.08, 0.22), coat, side * 0.085, 0.04, 0.035);
    part(new THREE.CylinderGeometry(0.048, 0.04, 0.54, 6), coat, side * 0.20, 1.10, 0);
  }
  scene.add(figure);
  const bar = new THREE.Group(); bar.name = 'aircraft-lab:scale-bar';
  const barMats = [paint('#c6bca7'), paint('#565147')];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.012, 0.12), barMats[i % 2]);
    m.position.set(i - 1.5, 0.006, bounds.max.z + 1.7); m.receiveShadow = true; bar.add(m);
  }
  scene.add(bar);
  return { scene, aircraft, figure, bar, view, source };
}

export function mountAircraftLab() {
  const search = location.search, q = new URLSearchParams(search);
  const { scene, aircraft, view } = buildAircraftLabScene(search);
  const canvas = document.getElementById('lab');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const lighting = new LightingRig(scene, { x: 60, z: 60 }, { quality: 'high', timeOfDay: 0.865, renderer });
  lighting.bakeEnvironment(); lighting.applyEnvironmentToScene(scene);
  const post = new PostChain(renderer, { quality: 'high', reducedMotion: true, width: innerWidth, height: innerHeight, grade: lighting.profile.grade });
  post.dofStrength = 0;
  const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 1000);
  const target = new THREE.Vector3(0, view.type === 'private-jet' ? 0.6 : 1.8, 0);
  const pose = { ...view };
  function render() {
    const p = THREE.MathUtils.degToRad(pose.pitch), a = THREE.MathUtils.degToRad(pose.azimuth);
    camera.position.set(target.x + pose.distance * Math.cos(p) * Math.sin(a), target.y + pose.distance * Math.sin(p),
      target.z + pose.distance * Math.cos(p) * Math.cos(a)); camera.lookAt(target); camera.updateMatrixWorld();
    scene.updateMatrixWorld(true); aircraft.update?.(camera); lighting.update(camera, target, pose.distance);
    post.render(scene, camera, { accumulate: 8, elapsed: 0, index: 0, focusDistance: pose.distance, sunDirection: lighting.postState?.().sunDirection });
  }
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    post.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio()); render();
  }
  let drag = null;
  canvas.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return; pose.azimuth -= (e.clientX - drag[0]) * 0.3;
    pose.pitch = Math.max(5, Math.min(85, pose.pitch + (e.clientY - drag[1]) * 0.25)); drag = [e.clientX, e.clientY]; render();
  });
  canvas.addEventListener('wheel', e => { e.preventDefault(); pose.distance = Math.max(6, Math.min(240, pose.distance * Math.exp(e.deltaY * 0.001))); render(); }, { passive: false });
  canvas.addEventListener('dblclick', () => { Object.assign(pose, view); render(); });
  window.addEventListener('resize', resize);
  if (q.get('hud') === '0') document.getElementById('caption').hidden = true;
  resize();
  window.__aircraftLab = { ready: true, scene, camera, aircraft, render, view: pose };
}

if (typeof document !== 'undefined') mountAircraftLab();
