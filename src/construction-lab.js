// District Deck — construction / renovation fidelity lab.
// Isolated stage plates so a critic can grade works without the rest of the board.
//
//   ?phase=demolition|excavation|slab|frame|cladding|renovation
//   ?view=three-quarter|street|detail|orbit|top
//   ?progress=0..1   freeze intra-quarter progress
//   ?studio=1        cream seamless (blind-safe)
//
// Deterministic. window.__csLab.step(n) drives frames.

import * as THREE from 'three';
import { MaterialLibrary } from './render/materials.js';
import { LightingRig } from './render/lighting.js';
import { PostChain } from './render/post.js';
import { SkyDome } from './render/sky.js';
import { TILE } from './core/grid.js';
import {
  createConstructionStageGroup,
  createRenovationScaffoldGroup,
} from './render/construction-site.js';
import { tickConstructionSites } from './render/construction-site.js';

const params = new URLSearchParams(location.search);
const PHASE = params.get('phase') ?? 'frame';
const VIEW = params.get('view') ?? 'three-quarter';
const PROGRESS = params.get('progress') == null ? null : Number(params.get('progress'));
const TIME_OF_DAY = Number(params.get('tod') ?? 0.32);
const QUALITY = params.get('quality') ?? 'high';
const POST_ON = params.get('post') !== 'off';
const STUDIO = params.get('studio') === '1';
const STOREYS = Math.max(1, Number(params.get('storeys') ?? 2));
const TARGET = params.get('target')
  ?? (STOREYS >= 5 ? 'apartment-permit' : STOREYS >= 3 ? 'walkup-flats' : 'cottage-federation');

const PHASE_QUARTER = {
  demolition: 1,
  excavation: 1,
  slab: 2,
  frame: 3,
  cladding: 4,
  renovation: 1,
};

const canvas = document.getElementById('lab');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !POST_ON,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = POST_ON ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.32;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(STUDIO ? '#e9e2d6' : '#4a7ab0');

const extent = { x: TILE * 6, z: TILE * 6 };
const materials = new MaterialLibrary({ quality: QUALITY });
const lighting = new LightingRig(scene, extent, {
  quality: QUALITY, timeOfDay: TIME_OF_DAY, renderer,
});
lighting.bakeEnvironment();

const sky = new SkyDome(scene, extent, {
  quality: QUALITY, reducedMotion: true, timeOfDay: TIME_OF_DAY,
});
if (STUDIO) {
  for (const key of ['root', 'mesh', 'dome']) {
    const node = sky?.[key];
    if (node && typeof node === 'object' && 'visible' in node) node.visible = false;
  }
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(extent.x, extent.z),
  new THREE.MeshPhysicalMaterial({
    color: STUDIO ? '#e2dacc' : '#8a8678',
    roughness: 0.92,
    metalness: 0,
  }),
);
ground.rotation.x = -Math.PI / 2;
// V3.70 instrument r3 — see `residential-lab.js:170`. A studio seamless that receives shadow puts a
// grey slab under the subject that no photographed reference has, which is a blind-pair sort key.
ground.receiveShadow = !STUDIO;
scene.add(ground);

const parcel = {
  id: 'lab-site',
  centre: { x: 0, y: 0, z: 0 },
  placement: { envelopeMetres: { x: 11.2, z: 9.4 } },
  groundFootprint: [1, 1],
  storeys: STOREYS,
};

const construction = {
  toArchetype: TARGET,
  startedQuarter: 1,
  completionQuarter: 5,
  residentialBuild: true,
  durationQuarters: 4,
  accidentOccurred: false,
};

const quarter = PHASE_QUARTER[PHASE] ?? 1;
const boardShim = { constructionStages: new Map(), renovationScaffolds: new Map(), reducedMotion: false };

let group;
if (PHASE === 'renovation') {
  group = createRenovationScaffoldGroup({ parcel, materials, storeys: STOREYS });
  // Lab-only mass so the wrap reads as a wrap. Play.html keeps the real house.
  const dummy = new THREE.Group();
  dummy.name = 'reno-lab-house';
  const wall = materials.get('render', { variant: 'reno-lab-wall', color: '#e8dcc8', roughness: 0.84 });
  const roof = materials.get('slate', { variant: 'reno-lab-roof', color: '#6a7380', roughness: 0.5 });
  const house = new THREE.Mesh(new THREE.BoxGeometry(8.4, 5.2, 7.2), wall);
  house.position.y = 2.6;
  house.castShadow = true;
  house.receiveShadow = true;
  const pitchL = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.2, 7.8), roof);
  pitchL.position.set(-2.0, 5.7, 0);
  pitchL.rotation.z = 0.42;
  pitchL.castShadow = true;
  const pitchR = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.2, 7.8), roof);
  pitchR.position.set(2.0, 5.7, 0);
  pitchR.rotation.z = -0.42;
  pitchR.castShadow = true;
  dummy.add(house, pitchL, pitchR);
  group.add(dummy);
  boardShim.renovationScaffolds.set('lab', { group, storeys: STOREYS });
} else {
  group = createConstructionStageGroup({
    parcel,
    construction,
    quarter,
    materials,
  });
  boardShim.constructionStages.set('lab', {
    group,
    stageIndex: group.userData.constructionStage,
    toArchetype: construction.toArchetype,
  });
}
if (Number.isFinite(PROGRESS)) group.userData.progressOverride = PROGRESS;
if (PHASE === 'excavation') group.userData.progressOverride = PROGRESS ?? 0.82;
scene.add(group);
lighting.applyEnvironmentToScene(scene);

const camera = new THREE.PerspectiveCamera(28, 1, 0.4, 200);
const l2 = String(TARGET).startsWith('apartment') || STOREYS >= 5;
const tall = PHASE === 'cladding' || PHASE === 'renovation' || PHASE === 'frame' || l2;
const VIEWS = {
  'three-quarter': l2
    ? { polar: 30, azimuth: 40, dist: 46, lookY: 6.4 }
    : tall
      ? { polar: 36, azimuth: 40, dist: 28, lookY: 2.2 }
      : { polar: 34, azimuth: 38, dist: 18, lookY: 0.9 },
  street: l2
    ? { polar: 14, azimuth: 8, dist: 36, lookY: 5.2 }
    : tall
      ? { polar: 18, azimuth: 8, dist: 20, lookY: 1.7 }
      : { polar: 16, azimuth: 6, dist: 15, lookY: 0.85 },
  detail: l2
    ? { polar: 24, azimuth: 24, dist: 28, lookY: 5.6 }
    : tall
      ? { polar: 28, azimuth: 24, dist: 16, lookY: 2.4 }
      : { polar: 26, azimuth: 22, dist: 12, lookY: 0.9 },
  orbit: { polar: 34, azimuth: 50, dist: l2 ? 48 : tall ? 26 : 18, lookY: l2 ? 6.0 : tall ? 2.0 : 0.8 },
  top: { polar: 14, azimuth: 0, dist: l2 ? 28 : 20, lookY: 0.4 },
};

function poseCamera(view = VIEW, elapsed = 0) {
  const v = VIEWS[view] ?? VIEWS['three-quarter'];
  const DEG = Math.PI / 180;
  const az = v.azimuth * DEG + (view === 'orbit' ? elapsed * 0.12 : 0);
  const pol = v.polar * DEG;
  const horizontal = Math.cos(pol) * v.dist;
  camera.position.set(
    Math.sin(az) * horizontal,
    Math.sin(pol) * v.dist,
    Math.cos(az) * horizontal,
  );
  camera.lookAt(0, v.lookY, 0);
}

const post = POST_ON ? new PostChain(renderer, scene, camera, { quality: QUALITY }) : null;
let elapsed = 8.4;
let last = performance.now();

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  if (post) post.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
}
window.addEventListener('resize', resize);
resize();

function frame(dt) {
  elapsed += dt;
  tickConstructionSites(boardShim, dt, elapsed);
  poseCamera(VIEW, elapsed);
  lighting.update(camera, new THREE.Vector3(0, 0.6, 0), 22);
  sky.update?.(1 / 60, elapsed);
  renderer.info.reset();
  if (post) post.render(scene, camera, { accumulate: 4, elapsed, index: 0 });
  else renderer.render(scene, camera);
}

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frame(dt);
  requestAnimationFrame(loop);
}

window.__csLab = {
  phase: PHASE,
  view: VIEW,
  group,
  step(n = 1) {
    for (let i = 0; i < n; i += 1) frame(1 / 30);
  },
  setProgress(p) {
    group.userData.progressOverride = p;
    frame(0);
  },
  tap(kind = 'beam') {
    const rec = group.userData.tapTargets?.find((t) => t.kind === kind)
      ?? group.userData.tapTargets?.[0];
    if (!rec) return 0;
    const { impulseMember } = window.__csLab;
    return impulseMember ? impulseMember(rec, 0.4) : 0;
  },
};

import('./render/construction/tap.js').then((mod) => {
  window.__csLab.impulseMember = mod.impulseMember;
});

poseCamera(VIEW, elapsed);
frame(0);
if (params.get('still') !== '1') requestAnimationFrame(loop);
