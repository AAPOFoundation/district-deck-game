// District Deck V3.00 — landing hero.
// The first viewport is the real game, not a picture of it: the same kit, the same
// generator, a smaller city, one slow orbit. If WebGL or the kit is unavailable the
// page still reads completely — the canvas simply never appears.

import * as THREE from 'three';
import { createCity } from './core/city.js';
import { createRun, applyAction } from './core/state.js';
import { canAcquire } from './core/economy.js';
import { dailySeed } from './core/format.js';
import { AssetRegistry } from './render/assets.js';
import { Board } from './render/board.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function mountHero(canvas, seedText) {
  if (!canvas) return;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch {
    canvas.remove();
    return;
  }

  const seed = seedText || dailySeed(new Date());
  const city = createCity({ seed, blocksX: 2, blocksZ: 2 });

  const registry = new AssetRegistry();
  await registry.loadAll();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#07090b');

  scene.add(new THREE.HemisphereLight('#cfe0ef', '#3a3630', 1.2));
  const key = new THREE.DirectionalLight('#ffe8c4', 2.5);
  key.position.set(90, 130, 40);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const span = Math.max(city.extent.x, city.extent.z) * 0.72;
  Object.assign(key.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 8, far: 520 });
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.6;
  key.target.position.set(city.extent.x / 2, 0, city.extent.z / 2);
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#7fa6c8', 0.55);
  fill.position.set(-70, 60, -80);
  scene.add(fill);

  const board = new Board(city, registry);
  board.reducedMotion = prefersReducedMotion;
  scene.add(board.root);

  // Show the shape of the game: a small holding with one live corridor.
  let state = createRun({ city });
  const anchor = city.order.find((id) => (city.adjacency[id] ?? []).length >= 3
    && canAcquire(city, state, id).ok);
  if (anchor) {
    const targets = [anchor, ...(city.adjacency[anchor] ?? []).slice(0, 2)];
    for (const id of targets) {
      const step = applyAction(city, state, { type: 'acquire', parcelId: id });
      if (!step.rejected) {
        state = step.state;
        state.actionsRemaining = 2;
      }
    }
    board.setSelection(anchor);
  }
  board.syncOwnership(state);

  const camera = new THREE.PerspectiveCamera(24, 1, 1, 1200);
  const centre = new THREE.Vector3(city.extent.x / 2, 0, city.extent.z / 2);
  let azimuth = -0.72;
  const distance = Math.max(city.extent.x, city.extent.z) * 1.32;
  const polar = 0.72;

  const resize = () => {
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 520;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  const clock = new THREE.Clock();
  let running = true;
  let frame = null;

  const observer = new IntersectionObserver(([entry]) => {
    running = entry.isIntersecting;
    if (running && !frame) loop();
  }, { threshold: 0.02 });
  observer.observe(canvas);

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running && !frame) loop();
  });

  function loop() {
    if (!running) { frame = null; return; }
    frame = requestAnimationFrame(loop);
    const dt = Math.min(0.05, clock.getDelta());
    if (!prefersReducedMotion) azimuth += dt * 0.055;
    const horizontal = Math.cos(polar) * distance;
    camera.position.set(
      centre.x + Math.sin(azimuth) * horizontal,
      centre.y + Math.sin(polar) * distance,
      centre.z + Math.cos(azimuth) * horizontal,
    );
    camera.lookAt(centre);
    board.update(dt, clock.elapsedTime);
    renderer.render(scene, camera);
  }
  loop();

  canvas.dataset.ready = 'true';
}
