// District Deck — coast lab.
//
// Mounts ONLY the W-AAA coastal system (water shader, waves, foam, beach sand,
// piers, beach life) with the real lighting rig, sky dome and post chain — and
// nothing else. No board, no buildings, no simulation.
//
// Why it exists: the coast seats need to judge water and sand from pixels, and
// the full `play.html` boot depends on every building module in the project. A
// single unrelated error anywhere in that graph takes the whole page down and
// blocks every capture. This page depends only on the files the coast seats own
// plus lighting / sky / post / materials.
//
// It is a lab, not a shipping surface. Framing, exposure and the stand-in
// seawall are chosen to match `play.html` closely enough that a plate captured
// here is a fair read of what the board will show — but the board's own plates
// remain the final authority.

import * as THREE from 'three';
import { LightingRig, sunDirection } from './render/lighting.js';
import { SkyDome } from './render/sky.js';
import { MaterialLibrary } from './render/materials.js';
import { PostChain } from './render/post.js';
import { WaterSurface } from './render/water.js';
import { SHORE, shorePoint } from './render/shore.js';

const params = new URLSearchParams(location.search);
const quality = params.get('quality') ?? 'high';
const EXTENT = { x: 272, z: 272 };
const WATER_EDGE = params.get('edge') ?? 'east';

const canvas = document.getElementById('lab');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = quality !== 'low';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// The board's post chain owns the transfer curve (AgX + a baked LUT), so three's
// own tone mapping must stay OFF here exactly as it is there — otherwise the same
// shader grades differently in the two places and the lab lies about colour. The
// SURFACE seat caught this: with ACES on, its board-calibrated palette read
// near-black offshore in the lab.
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1.32;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#4a7ab0');
// Held in a variable so the diagnosis switch below can put it back.
const labFog = new THREE.Fog('#6a8aaa', EXTENT.x * 3.2, EXTENT.x * 6.5);
scene.fog = labFog;

const camera = new THREE.PerspectiveCamera(26, 1, 1, 2000);

const lighting = new LightingRig(scene, EXTENT, {
  quality,
  timeOfDay: 0.42,
  renderer,
});
lighting.bakeEnvironment();

const sky = new SkyDome(scene, EXTENT, { quality, timeOfDay: 0.42 });
const materials = new MaterialLibrary({ quality });

// ── Stand-in landward mass ───────────────────────────────────────────────────
// Not the real board — just enough to give the beach something to end against,
// so the seats can judge the wall/sand/water join and the props sitting on it.
const land = new THREE.Group();
land.name = 'lab:land';
{
  const groundMat = new THREE.MeshStandardMaterial({ color: '#8d8f86', roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.BoxGeometry(EXTENT.x + 40, 0.4, EXTENT.z + 40), groundMat);
  ground.position.set(EXTENT.x / 2, -0.2, EXTENT.z / 2);
  ground.receiveShadow = true;
  land.add(ground);

  // Seawall along the water edge at the SHORE contract offsets.
  const wallMat = new THREE.MeshStandardMaterial({ color: '#b9b2a2', roughness: 0.88 });
  const along = WATER_EDGE === 'north' || WATER_EDGE === 'south' ? EXTENT.x : EXTENT.z;
  const wallGeom = new THREE.BoxGeometry(
    WATER_EDGE === 'north' || WATER_EDGE === 'south' ? along + 6 : SHORE.wallDeep,
    SHORE.wallH,
    WATER_EDGE === 'north' || WATER_EDGE === 'south' ? SHORE.wallDeep : along + 6,
  );
  const wall = new THREE.Mesh(wallGeom, wallMat);
  const c = shorePoint(WATER_EDGE, EXTENT, SHORE.wallOffset, 0);
  wall.position.set(c.x, SHORE.wallH / 2, c.z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  land.add(wall);
}
scene.add(land);

const water = new WaterSurface(scene, { waterEdge: WATER_EDGE, extent: EXTENT }, {
  quality,
  envMap: lighting.equirect,
  boardRoot: null,
  materials,
});
water.setSolar(lighting.profile, sunDirection(lighting.profile));

const labRay = new THREE.Raycaster();
const labPointer = new THREE.Vector2();
canvas.addEventListener('pointerup', (event) => {
  const rect = canvas.getBoundingClientRect();
  labPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  labPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  labRay.setFromCamera(labPointer, camera);
  const hit = water.pickAt(labRay);
  if (hit) water.tap(hit);
});
lighting.applyEnvironmentToScene(scene);

// ── Camera control ───────────────────────────────────────────────────────────
const pose = {
  target: new THREE.Vector3(EXTENT.x + 34, 0, EXTENT.z * 0.5),
  distance: 150,
  azimuth: 250 * (Math.PI / 180),
  polar: 34 * (Math.PI / 180),
};

/**
 * Identical convention to `IsoCameraRig._poseCamera`: polar is measured up from
 * the horizon, not down from the zenith. Diverging here would make every lab
 * plate a different shot from the board plate of the same name.
 */
function poseCamera() {
  const { target, distance, azimuth, polar } = pose;
  const horizontal = Math.cos(polar) * distance;
  camera.position.set(
    target.x + Math.sin(azimuth) * horizontal,
    target.y + Math.sin(polar) * distance,
    target.z + Math.cos(azimuth) * horizontal,
  );
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

// Same chain the board runs, constructed the same way, so a lab plate and a board
// plate of the same shader agree.
const post = new PostChain(renderer, {
  quality,
  width: window.innerWidth,
  height: window.innerHeight,
  grade: lighting.profile?.grade ?? null,
});

const basePostExposure = post.exposure;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const ratio = Math.min(window.devicePixelRatio, 1.75);
  post.setSize(w * ratio, h * ratio);
}
window.addEventListener('resize', resize);
resize();

let elapsed = 0;
function renderFrame(dt) {
  elapsed += dt;
  water.update(dt, elapsed);
  sky.update?.(dt, elapsed);
  poseCamera();
  // The board focuses the tilt-shift at the orbit distance and drives the
  // lighting rig from the same number. Omitting it here left the chain focused
  // on nothing and blurred the top and bottom of every lab plate.
  const focusDistance = pose.distance;
  lighting.update?.(camera, pose.target, focusDistance);
  renderer.info.reset();
  post.render(scene, camera, {
    elapsed,
    focusDistance,
    sunDirection: lighting.postState?.().sunDirection,
    accumulate: 1,
  });
}

let last = performance.now();
let auto = true;
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (auto) renderFrame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/**
 * Capture-harness surface. Mirrors the parts of `window.__districtDeck` that the
 * water capture scripts use, so one harness can drive both pages.
 */
window.__coastLab = {
  scene,
  camera,
  renderer,
  water,
  lighting,
  sky,
  extent: EXTENT,
  waterEdge: WATER_EDGE,
  /** Freeze the rAF loop so stepping is the only source of time. */
  pause() { auto = false; },
  resume() { auto = true; last = performance.now(); },
  /**
   * Advance n frames of dt seconds. Same call shape as play.html's step(frames, dt)
   * so one harness can drive both surfaces and mean the same thing by it.
   */
  step(n = 1, dt = 1 / 60) {
    auto = false;
    for (let i = 0; i < n; i += 1) renderFrame(dt);
  },
  /** Absolute wave clock, for A/B at a known instant. */
  setElapsed(seconds) {
    elapsed = seconds;
    water.update(0, elapsed);
    sky.update?.(0, elapsed);
    poseCamera();
    renderer.render(scene, camera);
  },
  setPose({ target, distance, azimuth, polar }) {
    if (target) pose.target.set(target.x, target.y ?? 0, target.z);
    if (typeof distance === 'number') pose.distance = distance;
    if (typeof azimuth === 'number') pose.azimuth = azimuth * (Math.PI / 180);
    if (typeof polar === 'number') pose.polar = polar * (Math.PI / 180);
    poseCamera();
  },
  setTimeOfDay(tod) {
    lighting.setTimeOfDay?.(tod);
    sky.setTimeOfDay?.(tod);
    water.setEnvMap(lighting.equirect);
    water.setSolar(lighting.profile, sunDirection(lighting.profile));
    // The board re-grades the post chain on every time-of-day move; so must this,
    // or golden-hour plates carry the midday grade.
    if (lighting.profile?.grade) post.setGrade(lighting.profile.grade);
  },
  /** Hide the stand-in land so the water can be judged with nothing behind it. */
  setLandVisible(on) { land.visible = on; },
  /**
   * Fire a tap at a world point. Capture scripts use this so a slap is
   * deterministic and does not need a real pointer.
   */
  tapWorld(point, kind) {
    return water.tap({ point, kind });
  },
  findWorld(name) {
    const v = new THREE.Vector3();
    let found = null;
    water.root.traverse((obj) => {
      if (found || obj.name !== name) return;
      obj.getWorldPosition(v);
      found = { x: v.x, y: v.y, z: v.z, name: obj.name };
    });
    return found;
  },
  resetCoast() {
    return water.resetCoast?.() ?? null;
  },
  liveTaps() {
    return (water._field?.taps ?? [])
      .filter((t) => t.live)
      .map((t) => ({
        kind: t.kind,
        along: t.along,
        front: t.front,
        energy: t.energy,
        burst: t.burst,
        scar: t.scar,
        hits: t.hits,
        mischief: t.mischief,
        age: t.age,
      }));
  },
  pickCoast(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    labPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    labPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    labRay.setFromCamera(labPointer, camera);
    return water.pickAt(labRay);
  },
  fieldEnergy() {
    const taps = water._field?.taps ?? [];
    return taps.reduce((sum, tap) => sum + (tap.live ? tap.energy : 0), 0);
  },

  // ── Diagnosis switches ─────────────────────────────────────────────────────
  // For attributing a whole-frame defect to a stage. When the coast reads hazy
  // or washed, the question is always "which stage did that" — the water shader,
  // the scene fog, the bloom, or the grade — and guessing has cost rounds.
  //
  // ⚠ `setPostEnabled(false)` IS NOT A VIEW OF THE SCENE, for water.
  //
  // The water is a raw ShaderMaterial ending in `gl_FragColor` with no
  // <colorspace_fragment> include, so three.js does not inject the output
  // encode into it. Rendering straight to the canvas (outputColorSpace = sRGB)
  // therefore writes linear values into a framebuffer that will be read as
  // sRGB, and the water comes out roughly a gamma too dark. Rendering into the
  // post chain's NoColorSpace half-float target, linear is correct.
  //
  // Two rounds of this programme were spent blaming the grade for a wash that
  // was an artefact of exactly this comparison. Use post-off to isolate a
  // *built-in* material, or use addProbeQuad() for a known value — never to
  // judge how the water looks. See W-AAA-haze-attribution.md.
  post,
  setPostEnabled(on) { post.enabled = Boolean(on); },
  /**
   * Pin an unlit quad of a known scene-linear value in front of the camera.
   *
   * The point is to have one surface in frame whose correct pixel value can be
   * computed by hand, so "the post path renders brighter" can be separated from
   * "this particular material renders brighter in the post path". Unlit, so no
   * lighting, shadow or env term can contribute.
   */
  addProbeQuad(linearValue = 0.016) {
    if (this._probe) scene.remove(this._probe);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(linearValue, linearValue, linearValue),
        toneMapped: false,
        fog: false,
        depthTest: false,
      }),
    );
    m.material.color.setRGB(linearValue, linearValue, linearValue, THREE.LinearSRGBColorSpace);
    m.renderOrder = 9999;
    m.frustumCulled = false;
    camera.add(m);
    m.position.set(0, 0, -5);
    if (!camera.parent) scene.add(camera);
    this._probe = m;
    return linearValue;
  },
  setFogEnabled(on) { scene.fog = on ? labFog : null; },
  setBloom(strength) { post.bloomStrength = strength; },
  setExposure(mult) { post.exposure = basePostExposure * mult; },
  /** Luma percentiles of the current canvas — cheap contrast read. */
  lumaStats() {
    const c = renderer.domElement;
    const off = document.createElement('canvas');
    off.width = c.width;
    off.height = c.height;
    off.getContext('2d').drawImage(c, 0, 0);
    const d = off.getContext('2d').getImageData(0, 0, off.width, off.height).data;
    const lum = [];
    for (let i = 0; i < d.length; i += 4 * 17) {
      lum.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    }
    lum.sort((a, b) => a - b);
    const q = (f) => lum[Math.floor(f * (lum.length - 1))];
    return {
      p5: +q(0.05).toFixed(1),
      p50: +q(0.5).toFixed(1),
      p95: +q(0.95).toFixed(1),
      range: +(q(0.95) - q(0.05)).toFixed(1),
    };
  },
};

document.getElementById('boot')?.remove();
