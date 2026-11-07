// Pocket rule models for cards and the How-to-play book.
//
// One offscreen WebGL renderer serves every view. Each host owns only a 2D canvas;
// a scene is posed, rendered once, then copied into that canvas. There is deliberately
// no animation loop in this module: state changes and the optional hover pose are the
// only reasons to draw another frame.

import * as THREE from 'three';
import { RULES } from '../core/content.js';
import { money, pct } from '../core/format.js';
import { rivalColours } from '../render/rival-hue.js';

const CSS_WIDTH = 220;
const CSS_HEIGHT = 140;
const HOVER_YAW = THREE.MathUtils.degToRad(12);
const AZIMUTH = THREE.MathUtils.degToRad(35);
const POLAR = THREE.MathUtils.degToRad(62);
const KINDS = new Set([
  'corridor', 'works-ladder', 'merge', 'ceiling',
  'tenancy', 'bands', 'ownership', 'auction',
]);

const sceneCache = new Map();
const geometryCache = new Map();
const views = new Set();
const mountedHosts = new WeakMap();
const _box = new THREE.Box3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _direction = new THREE.Vector3();

let glRenderer = null;
let sharedMaterials = null;

function materials() {
  if (sharedMaterials) return sharedMaterials;
  const standard = (color, roughness = 0.78, metalness = 0.03, extra = {}) => (
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra })
  );
  sharedMaterials = {
    amber: standard('#d8a24a', 0.72),
    amberGhost: standard('#d8a24a', 0.72, 0.02, {
      transparent: true, opacity: 0.28, depthWrite: false,
    }),
    blue: standard('#6f96b8', 0.68),
    rival: standard(rivalColours().light, 0.68),
    blueGhost: standard('#6f96b8', 0.68, 0.02, {
      transparent: true, opacity: 0.26, depthWrite: false,
    }),
    bone: standard('#ece6da', 0.84),
    boneGhost: standard('#ece6da', 0.84, 0.01, {
      transparent: true, opacity: 0.22, depthWrite: false,
    }),
    ink: standard('#0a0c0e', 0.88),
    inkLift: standard('#252b30', 0.86),
  };
  return sharedMaterials;
}

function geometry(w, h, d) {
  const key = `${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}`;
  if (!geometryCache.has(key)) geometryCache.set(key, new THREE.BoxGeometry(w, h, d));
  return geometryCache.get(key);
}

function box(parent, material, w, h, d, x, y, z, name = '') {
  const mesh = new THREE.Mesh(geometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function terrace(parent, material, x, z, scale = 1) {
  const m = materials();
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  box(group, material, 1.12 * scale, 1.12 * scale, 0.92 * scale, 0, 0.76 * scale, 0);
  const roof = box(group, m.ink, 1.24 * scale, 0.15 * scale, 1.02 * scale, 0, 1.39 * scale, 0);
  roof.rotation.z = 0.04;
  box(group, m.ink, 0.25 * scale, 0.50 * scale, 0.05 * scale, 0, 0.50 * scale, 0.485 * scale);
  box(group, m.bone, 0.22 * scale, 0.24 * scale, 0.05 * scale, -0.32 * scale, 0.87 * scale, 0.485 * scale);
  box(group, m.bone, 0.22 * scale, 0.24 * scale, 0.05 * scale, 0.32 * scale, 0.87 * scale, 0.485 * scale);
  parent.add(group);
  return group;
}

function arrow(parent, material, x, y, z, length = 1.2, direction = 1, vertical = false) {
  const group = new THREE.Group();
  if (vertical) {
    box(group, material, 0.13, length, 0.13, 0, 0, 0);
    const a = box(group, material, 0.13, 0.58, 0.13, -0.18, length * 0.48, 0);
    const b = box(group, material, 0.13, 0.58, 0.13, 0.18, length * 0.48, 0);
    a.rotation.z = -0.65;
    b.rotation.z = 0.65;
    if (direction < 0) group.rotation.z = Math.PI;
  } else {
    box(group, material, length, 0.13, 0.13, 0, 0, 0);
    const a = box(group, material, 0.52, 0.13, 0.13, direction * length * 0.46, 0.18, 0);
    const b = box(group, material, 0.52, 0.13, 0.13, direction * length * 0.46, -0.18, 0);
    a.rotation.z = direction * -0.65;
    b.rotation.z = direction * 0.65;
  }
  group.position.set(x, y, z);
  parent.add(group);
  return group;
}

function recolor(group, material) {
  group.traverse((node) => { if (node.isMesh) node.material = material; });
}

function percent(bp) {
  const value = Number(bp) || 0;
  return pct(value, Math.abs(value) % 100 === 0 ? 0 : 1);
}

function linkCount(links) {
  if (Array.isArray(links)) return links.length;
  return Number.isFinite(Number(links)) ? Number(links) : 2;
}

function sceneShell(kind) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a0c0e');
  scene.add(new THREE.AmbientLight('#ece6da', 1.85));
  const key = new THREE.DirectionalLight('#fff4df', 2.65);
  key.position.set(-4.5, 8, 7);
  scene.add(key);
  const root = new THREE.Group();
  root.name = `card-diorama:${kind}`;
  scene.add(root);
  return { scene, root };
}

function corridorScene() {
  const m = materials();
  const entry = sceneShell('corridor');
  const { root } = entry;
  box(root, m.inkLift, 8.8, 0.22, 3.0, 0, -0.24, 0);
  const plinths = [];
  const homes = [];
  [-3.15, -1.05, 1.05, 3.15].forEach((x, index) => {
    plinths.push(box(root, index < 3 ? m.amber : m.boneGhost, 1.75, 0.28, 1.78, x, 0, 0));
    if (index < 3) homes.push(terrace(root, m.bone, x, -0.03, 0.78));
    else {
      box(root, m.boneGhost, 1.12, 0.22, 0.92, x, 0.25, -0.03);
      box(root, m.ink, 0.12, 0.76, 0.12, x, 0.66, 0.38);
      box(root, m.bone, 0.58, 0.30, 0.08, x + 0.25, 0.91, 0.38);
    }
  });
  const links = [
    box(root, m.amber, 0.48, 0.16, 0.16, -2.10, 0.28, 0.62),
    box(root, m.amber, 0.48, 0.16, 0.16, 0, 0.28, 0.62),
  ];
  // The open gap is as important as the two connected bars.
  box(root, m.bone, 0.12, 0.72, 0.12, 2.30, 0.48, 0.62);
  box(root, m.bone, 0.12, 0.72, 0.12, 2.58, 0.48, 0.62);
  entry.apply = (opts) => {
    const count = Math.max(0, Math.min(2, Math.round(linkCount(opts.links))));
    links.forEach((mesh, index) => { mesh.visible = index < count; });
    plinths.slice(0, 3).forEach((mesh, index) => {
      mesh.material = index <= count ? m.amber : m.boneGhost;
    });
    homes.forEach((home, index) => { home.visible = index <= count; });
  };
  entry.labels = (opts) => {
    const count = Math.max(0, Math.min(2, Math.round(linkCount(opts.links))));
    const bonus = `+${percent(opts.bonusBp ?? RULES.corridorLinkBp)}`;
    return [
      ...(count > 0 ? [{ text: bonus, x: 30, y: 13, tone: 'amber' }] : []),
      ...(count > 1 ? [{ text: bonus, x: 51, y: 13, tone: 'amber' }] : []),
      { text: 'CHAIN STOPS', x: 66, y: 73, tone: 'bone' },
    ];
  };
  entry.caption = (opts) => (
    `Adjacent holdings · +${percent(opts.bonusBp ?? RULES.corridorLinkBp)} rent per link · value after a full quarter`
  );
  return entry;
}

function worksLadderScene() {
  const m = materials();
  const entry = sceneShell('works-ladder');
  const { root } = entry;
  box(root, m.inkLift, 8.8, 0.22, 3.2, 0, -0.24, 0);

  // Renovate: the building stays inside a scaffold cage and its condition rises.
  box(root, m.amber, 3.35, 0.26, 2.55, -2.40, 0, 0);
  terrace(root, m.bone, -2.40, 0, 0.90);
  for (const x of [-3.24, -1.56]) {
    box(root, m.blue, 0.10, 2.25, 0.10, x, 1.15, -0.68);
    box(root, m.blue, 0.10, 2.25, 0.10, x, 1.15, 0.68);
  }
  for (const y of [0.38, 1.15, 1.92]) {
    box(root, m.blue, 1.82, 0.09, 0.09, -2.40, y, -0.68);
    box(root, m.blue, 1.82, 0.09, 0.09, -2.40, y, 0.68);
  }
  arrow(root, m.amber, -3.55, 1.20, 0.84, 0.86, 1, true);

  // Redevelop: an empty pad and a successor ladder, with locked mass above the cap.
  box(root, m.amber, 3.35, 0.26, 2.55, 2.35, 0, 0);
  const rungs = [
    box(root, m.bone, 1.05, 0.55, 1.05, 1.25, 0.42, 0.02),
    box(root, m.amberGhost, 1.22, 1.30, 1.16, 2.35, 0.79, 0.02),
    box(root, m.boneGhost, 1.42, 2.10, 1.26, 3.52, 1.19, 0.02),
  ];
  arrow(root, m.bone, 1.79, 0.48, 0.76, 0.56, 1, false);
  arrow(root, m.bone, 2.93, 0.79, 0.76, 0.56, 1, false);
  entry.apply = (opts) => {
    const ceiling = Math.max(0, Math.min(3, Number(opts.ceiling ?? 2)));
    rungs[0].material = m.bone;
    rungs[1].material = ceiling >= 1 ? m.amberGhost : m.boneGhost;
    rungs[2].material = ceiling >= 2 ? m.amberGhost : m.boneGhost;
  };
  entry.labels = (opts) => [
    { text: 'RENOVATE', x: 7, y: 10, tone: 'amber' },
    { text: 'CONDITION ↑', x: 5, y: 76, tone: 'bone' },
    { text: 'REDEVELOP', x: 56, y: 10, tone: 'amber' },
    { text: `L0 → L1 → L${Math.max(2, Number(opts.ceiling ?? 2))}`, x: 57, y: 76, tone: 'bone' },
  ];
  entry.caption = () => 'Renovate keeps building · redevelop clears pad · ceiling gates successor';
  return entry;
}

function mergeScene() {
  const m = materials();
  const entry = sceneShell('merge');
  const { root } = entry;
  box(root, m.inkLift, 8.8, 0.22, 3.2, 0, -0.24, 0);
  const leftPads = [
    box(root, m.amber, 1.38, 0.34, 1.75, -3.05, 0, 0),
    box(root, m.amber, 1.38, 0.34, 1.75, -1.55, 0, 0),
  ];
  box(root, m.bone, 0.09, 0.42, 1.84, -2.30, 0.12, 0, 'seam');
  const forward = arrow(root, m.bone, -0.20, 0.72, 0, 1.05, 1, false);
  const reverse = arrow(root, m.blue, -0.20, 0.28, 0, 1.05, -1, false);
  const merged = box(root, m.amber, 2.86, 0.34, 1.75, 2.30, 0, 0);
  box(root, m.ink, 0.08, 0.12, 1.62, 2.30, 0.24, 0, 'old-seam');
  box(root, m.bone, 1.05, 0.66, 0.95, 1.60, 0.50, 0);
  box(root, m.bone, 1.05, 1.20, 0.95, 2.92, 0.77, 0);
  entry.apply = (opts) => {
    const subdivide = opts.mode === 'subdivide' || opts.merged === true;
    leftPads.forEach((mesh) => { mesh.material = subdivide ? m.amberGhost : m.amber; });
    merged.material = subdivide ? m.amber : m.amberGhost;
    recolor(forward, subdivide ? m.boneGhost : m.bone);
    recolor(reverse, subdivide ? m.blue : m.blueGhost);
  };
  entry.labels = (opts) => {
    const subdivide = opts.mode === 'subdivide' || opts.merged === true;
    return [
      { text: '1×1 + 1×1', x: 5, y: 73, tone: subdivide ? 'bone' : 'amber' },
      { text: subdivide ? 'SUBDIVIDE ←' : 'CONSOLIDATE →', x: 38, y: 10, tone: subdivide ? 'blue' : 'bone' },
      { text: '1×2 PAD', x: 70, y: 73, tone: subdivide ? 'amber' : 'bone' },
    ];
  };
  entry.caption = (opts) => (
    opts.mode === 'subdivide' || opts.merged === true
      ? '1×2 pad · holding pair · reversible'
      : 'L0 pair · 1×2 pad · reversible'
  );
  return entry;
}

function ceilingScene() {
  const m = materials();
  const entry = sceneShell('ceiling');
  const { root } = entry;
  box(root, m.inkLift, 7.6, 0.22, 3.4, 0, -0.24, 0);
  box(root, m.amber, 4.2, 0.28, 2.65, -0.65, 0, 0);
  const storeys = [];
  for (let index = 0; index < 3; index += 1) {
    storeys.push(box(root, m.boneGhost, 2.55, 0.67, 1.75, -0.65, 0.48 + index * 0.72, 0));
    box(root, m.ink, 0.40, 0.24, 0.05, -1.25, 0.49 + index * 0.72, 0.90);
    box(root, m.ink, 0.40, 0.24, 0.05, -0.05, 0.49 + index * 0.72, 0.90);
  }
  const cap = box(root, m.amber, 3.58, 0.12, 2.25, -0.65, 1.20, 0);
  arrow(root, m.amber, 2.17, 1.15, 0, 1.35, 1, true);
  box(root, m.bone, 1.55, 0.70, 0.14, 2.18, 2.36, 0);
  box(root, m.ink, 1.20, 0.13, 0.17, 2.18, 2.36, 0.08);
  entry.apply = (opts) => {
    const current = Math.max(0, Math.min(3, Math.round(Number(opts.current ?? 1))));
    const ceiling = Math.max(current, Math.min(3, Math.round(Number(opts.ceiling ?? 2))));
    storeys.forEach((mesh, index) => {
      const level = index + 1;
      mesh.material = level <= current
        ? m.bone
        : level <= ceiling ? m.amberGhost : m.boneGhost;
    });
    cap.position.y = 0.12 + ceiling * 0.72;
  };
  entry.labels = (opts) => {
    const current = Math.max(0, Math.min(3, Math.round(Number(opts.current ?? 1))));
    const ceiling = Math.max(current, Math.min(3, Math.round(Number(opts.ceiling ?? 2))));
    const next = Math.min(Number(opts.max ?? 3), ceiling + 1);
    return [
      { text: `NOW L${current}`, x: 5, y: 74, tone: 'bone' },
      { text: `CEILING L${ceiling}`, x: 36, y: 10, tone: 'amber' },
      { text: `PASS ↑ L${next}`, x: 70, y: 24, tone: 'bone' },
    ];
  };
  entry.caption = () => 'Lobby · PASS raises ceiling · unlocks next rung';
  return entry;
}

function tenancyScene() {
  const m = materials();
  const entry = sceneShell('tenancy');
  const { root } = entry;
  box(root, m.inkLift, 9.6, 0.22, 3.2, 0, -0.24, 0);
  const xs = [-3.55, -1.20, 1.20, 3.55];
  xs.forEach((x, index) => {
    box(root, index === 0 ? m.amber : m.boneGhost, 2.05, 0.24, 2.15, x, 0, 0);
    box(root, m.bone, 1.42, 1.40, 1.15, x, 0.82, 0);
    box(root, m.ink, 1.56, 0.14, 1.28, x, 1.59, 0);
    box(root, m.ink, 0.27, 0.60, 0.05, x, 0.52, 0.60);
    const leftWindow = box(root, index === 0 || index === 2 ? m.amber : m.ink, 0.28, 0.30, 0.05, x - 0.40, 1.02, 0.60);
    box(root, index === 0 ? m.amber : m.ink, 0.28, 0.30, 0.05, x + 0.40, 1.02, 0.60);
    if (index === 2) {
      box(root, m.blue, 0.10, 0.80, 0.10, x + 0.74, 0.48, 0.45);
      box(root, m.bone, 0.62, 0.38, 0.08, x + 0.48, 0.75, 0.45);
    }
    if (index === 3) {
      box(root, m.amber, 0.70, 0.55, 0.62, x + 0.55, 0.40, 0.62);
      box(root, m.ink, 0.74, 0.08, 0.66, x + 0.55, 0.69, 0.62);
      box(root, m.bone, 0.42, 0.36, 0.42, x - 0.52, 0.30, 0.68);
    }
    leftWindow.userData.stateIndex = index;
  });
  entry.apply = () => {};
  entry.labels = () => [
    { text: 'TENANTED', x: 2, y: 74, tone: 'amber' },
    { text: '$0 VACANT', x: 27, y: 74, tone: 'bone' },
    { text: 'NOTICE', x: 55, y: 74, tone: 'blue' },
    { text: 'BUYOUT', x: 81, y: 74, tone: 'amber' },
  ];
  entry.caption = () => 'Rent at settle · vacant earns $0 · clear tenancy before works';
  return entry;
}

function bandsScene() {
  const m = materials();
  const entry = sceneShell('bands');
  const { root } = entry;
  box(root, m.inkLift, 7.8, 0.22, 3.4, 0, -0.24, 0);
  box(root, m.amber, 4.4, 0.28, 2.75, -0.45, 0, 0);
  box(root, m.bone, 2.85, 2.35, 1.85, -0.45, 1.31, 0);
  box(root, m.ink, 3.10, 0.20, 2.05, -0.45, 2.58, 0);
  for (const x of [-1.30, -0.45, 0.40]) {
    box(root, m.ink, 0.42, 0.42, 0.06, x, 1.47, 0.96);
  }
  const flood = box(root, m.blueGhost, 4.25, 0.76, 2.65, -0.45, 0.42, 0);
  const fire = box(root, m.amberGhost, 3.65, 0.62, 2.38, -0.45, 2.45, 0);
  // Survey tripod and sight line.
  box(root, m.bone, 0.13, 1.72, 0.13, 2.48, 0.91, 0);
  const legA = box(root, m.bone, 0.10, 1.28, 0.10, 2.10, 0.57, 0.20);
  const legB = box(root, m.bone, 0.10, 1.28, 0.10, 2.84, 0.57, 0.20);
  legA.rotation.z = -0.36;
  legB.rotation.z = 0.36;
  box(root, m.blue, 0.65, 0.42, 0.45, 2.48, 1.78, 0);
  box(root, m.amber, 2.05, 0.08, 0.08, 1.18, 1.78, 0);
  entry.apply = (opts) => {
    const floodBp = Number(opts.floodBp);
    const fireBp = Number(opts.fireBp);
    const floodScale = Number.isFinite(floodBp) ? THREE.MathUtils.clamp(floodBp / 3000, 0.45, 1.25) : 0.72;
    const fireScale = Number.isFinite(fireBp) ? THREE.MathUtils.clamp(fireBp / 3000, 0.45, 1.25) : 0.72;
    flood.scale.y = floodScale;
    flood.position.y = 0.08 + 0.38 * floodScale;
    fire.scale.y = fireScale;
    fire.position.y = 2.33 + 0.31 * fireScale;
  };
  entry.labels = (opts) => {
    const floodBp = Number(opts.floodBp);
    const fireBp = Number(opts.fireBp);
    return [
      { text: `FLOOD ${Number.isFinite(floodBp) ? percent(floodBp) : '?'}`, x: 4, y: 70, tone: 'blue' },
      { text: `FIRE ${Number.isFinite(fireBp) ? percent(fireBp) : '?'}`, x: 5, y: 11, tone: 'amber' },
    ];
  };
  entry.caption = (opts) => (
    `Exact condition and hazard bands · ${money(Number(opts.cost ?? RULES.surveyCost))} · 1 action`
  );
  return entry;
}

function ownershipScene() {
  const m = materials();
  const entry = sceneShell('ownership');
  const { root } = entry;
  box(root, m.inkLift, 8.6, 0.22, 3.4, 0, -0.24, 0);
  box(root, m.amber, 3.35, 0.30, 2.75, -2.25, 0, 0);
  terrace(root, m.bone, -2.25, 0, 0.94);
  box(root, m.rival, 3.35, 0.30, 2.75, 2.25, 0, 0);
  terrace(root, m.bone, 2.25, 0, 0.94);
  // Petridis target flag.
  box(root, m.ink, 0.12, 2.18, 0.12, 3.24, 1.15, 0.72);
  box(root, m.rival, 1.18, 0.62, 0.10, 2.71, 1.92, 0.72);
  // The deny outcome is already amber, joined by a decisive left arrow.
  box(root, m.ink, 0.12, 1.65, 0.12, -1.28, 0.90, 0.72);
  box(root, m.amber, 1.02, 0.52, 0.10, -0.83, 1.48, 0.72);
  arrow(root, m.amber, 0, 2.05, 0.72, 1.25, -1, false);
  entry.apply = () => {};
  entry.labels = () => [
    { text: 'YOURS', x: 9, y: 73, tone: 'amber' },
    { text: 'BUY FIRST ←', x: 38, y: 9, tone: 'bone' },
    { text: 'PETRIDIS', x: 74, y: 73, tone: 'plum' },
  ];
  entry.caption = () => 'Amber yours · Petridis · buy first denies';
  return entry;
}

function auctionScene() {
  const m = materials();
  const entry = sceneShell('auction');
  const { root } = entry;
  box(root, m.inkLift, 8.9, 0.22, 3.3, 0, -0.24, 0);
  box(root, m.amber, 3.30, 0.30, 2.70, -2.45, 0, 0);
  box(root, m.boneGhost, 2.00, 0.18, 1.55, -2.45, 0.24, 0);
  // Hammer, visibly parked on the lot.
  const handle = box(root, m.bone, 0.20, 0.20, 2.15, -2.45, 1.02, 0);
  handle.rotation.x = 0.15;
  handle.rotation.y = -0.72;
  const head = box(root, m.ink, 1.35, 0.62, 0.62, -1.76, 1.45, 0.67);
  head.rotation.y = -0.72;

  const bars = [
    box(root, m.bone, 0.70, 1, 0.76, 0.42, 0.50, 0),
    box(root, m.amber, 0.70, 1, 0.76, 1.65, 0.50, 0),
    box(root, m.blue, 0.70, 1, 0.76, 2.88, 0.50, 0),
  ];
  for (const x of [0.42, 1.65, 2.88]) box(root, m.ink, 0.94, 0.12, 1.00, x, 0.02, 0);
  entry.apply = (opts) => {
    const reserve = Math.max(1, Number(opts.reserve) || 700_000);
    const max = Math.max(reserve, Number(opts.max) || 860_000);
    const hammer = Math.max(reserve, Math.min(max, Number(opts.hammer) || 780_000));
    const top = Math.max(reserve, max, hammer);
    [reserve, max, hammer].forEach((value, index) => {
      const height = 0.50 + (value / top) * 2.75;
      bars[index].scale.y = height;
      bars[index].position.y = height / 2;
    });
  };
  entry.labels = (opts) => {
    const reserve = Math.max(1, Number(opts.reserve) || 700_000);
    const max = Math.max(reserve, Number(opts.max) || 860_000);
    const hammer = Math.max(reserve, Math.min(max, Number(opts.hammer) || 780_000));
    return [
      { text: `RES ${money(reserve)}`, x: 44, y: 73, tone: 'bone' },
      { text: `MAX ${money(max)}`, x: 62, y: 9, tone: 'amber' },
      { text: `HAMMER ${money(hammer)}`, x: 61, y: 47, tone: 'blue' },
    ];
  };
  entry.caption = () => 'Set maximum · pay hammer price · Petridis wins ties';
  return entry;
}

const BUILDERS = Object.freeze({
  corridor: corridorScene,
  'works-ladder': worksLadderScene,
  merge: mergeScene,
  ceiling: ceilingScene,
  tenancy: tenancyScene,
  bands: bandsScene,
  ownership: ownershipScene,
  auction: auctionScene,
});

function sceneFor(kind) {
  if (sceneCache.has(kind)) return sceneCache.get(kind);
  const entry = BUILDERS[kind]();
  entry.camera = new THREE.PerspectiveCamera(30, CSS_WIDTH / CSS_HEIGHT, 0.05, 100);
  entry.baseYaw = 0;
  entry.meshCount = 0;
  entry.root.traverse((node) => { if (node.isMesh) entry.meshCount += 1; });
  if (entry.meshCount > 64) throw new Error(`${kind} diorama exceeds 64 meshes (${entry.meshCount})`);
  sceneCache.set(kind, entry);
  return entry;
}

function renderer() {
  if (glRenderer) return glRenderer;
  glRenderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power',
  });
  glRenderer.setClearColor(0x0a0c0e, 1);
  glRenderer.setPixelRatio(1);
  glRenderer.outputColorSpace = THREE.SRGBColorSpace;
  glRenderer.toneMapping = THREE.NoToneMapping;
  glRenderer.shadowMap.enabled = false;
  return glRenderer;
}

function frame(entry, aspect) {
  entry.root.updateMatrixWorld(true);
  _box.setFromObject(entry.root);
  _box.getCenter(_center);
  _box.getSize(_size);
  const halfW = Math.max(0.5, _size.x * 0.5);
  const halfH = Math.max(0.5, _size.y * 0.5);
  const halfD = Math.max(0.5, _size.z * 0.5);
  const vFov = THREE.MathUtils.degToRad(entry.camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const distance = Math.max(
    halfH / Math.tan(vFov / 2),
    halfW / Math.tan(hFov / 2),
  ) + halfD * 1.45;
  _direction.set(
    Math.sin(POLAR) * Math.sin(AZIMUTH),
    Math.cos(POLAR),
    Math.sin(POLAR) * Math.cos(AZIMUTH),
  );
  entry.camera.aspect = aspect;
  entry.camera.position.copy(_center).addScaledVector(_direction, distance * 1.08);
  entry.camera.near = Math.max(0.05, distance * 0.02);
  entry.camera.far = distance * 4;
  entry.camera.lookAt(_center.x, _center.y + _size.y * 0.02, _center.z);
  entry.camera.updateProjectionMatrix();
}

function setLabels(view, labels) {
  view.labels.replaceChildren();
  for (const spec of labels) {
    const label = document.createElement('span');
    const requestedTone = spec.tone ?? 'bone';
    // Hazard readouts share the mill's amber/bone stamp register. Flood remains distinct
    // in the model itself; its label does not introduce a cool debug-plate ink.
    const tone = view.kind === 'bands' && requestedTone === 'blue'
      ? 'bone'
      : requestedTone;
    label.className = `card-diorama__tag card-diorama__tag--${tone}`;
    label.textContent = spec.text;
    if (view.kind !== 'bands') {
      label.style.left = `${spec.x}%`;
      label.style.top = `${spec.y}%`;
    }
    view.labels.appendChild(label);
  }
}

function renderView(view, yaw = 0) {
  if (view.disposed || !view.canvas.isConnected) return;
  const entry = sceneFor(view.kind);
  entry.apply(view.opts);
  entry.root.rotation.y = entry.baseYaw + yaw;

  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const width = Math.round(CSS_WIDTH * dpr);
  const height = Math.round(CSS_HEIGHT * dpr);
  if (view.canvas.width !== width) view.canvas.width = width;
  if (view.canvas.height !== height) view.canvas.height = height;

  const gl = renderer();
  gl.setSize(width, height, false);
  frame(entry, width / height);
  gl.render(entry.scene, entry.camera);
  view.context.drawImage(gl.domElement, 0, 0, width, height);

  setLabels(view, entry.labels(view.opts));
  const caption = entry.caption(view.opts);
  view.caption.textContent = caption;
  view.figure.setAttribute('aria-label', caption);
  view.figure.dataset.meshCount = String(entry.meshCount);
}

function makeView(kind, host, opts) {
  const figure = document.createElement('figure');
  figure.className = 'card-diorama';
  figure.dataset.dioramaKind = kind;
  figure.setAttribute('role', 'img');

  const bezel = document.createElement('div');
  bezel.className = 'card-diorama__bezel';
  const stage = document.createElement('div');
  stage.className = 'card-diorama__stage';
  const canvas = document.createElement('canvas');
  canvas.className = 'card-diorama__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.width = `${CSS_WIDTH}px`;
  canvas.style.height = `${CSS_HEIGHT}px`;
  const labels = document.createElement('div');
  labels.className = kind === 'bands'
    ? 'card-diorama__labels card-diorama__labels--row'
    : 'card-diorama__labels';
  labels.setAttribute('aria-hidden', 'true');
  if (kind === 'bands') stage.append(canvas);
  else stage.append(canvas, labels);

  const caption = document.createElement('figcaption');
  caption.className = 'card-diorama__caption';
  const captionPlate = document.createElement('div');
  captionPlate.className = 'card-diorama__caption-plate';
  captionPlate.append(caption);
  if (kind === 'bands') bezel.append(stage, labels, captionPlate);
  else bezel.append(stage, captionPlate);
  figure.append(bezel);
  host.replaceChildren(figure);
  host.dataset.dioramaMounted = kind;

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error(`Could not create 2D canvas for ${kind} diorama`);
  const view = {
    kind,
    host,
    figure,
    canvas,
    context,
    labels,
    caption,
    opts: { ...opts },
    disposed: false,
    onEnter: null,
    onLeave: null,
    controller: null,
  };
  view.onEnter = () => renderView(view, HOVER_YAW);
  view.onLeave = () => renderView(view, 0);
  figure.addEventListener('pointerenter', view.onEnter);
  figure.addEventListener('pointerleave', view.onLeave);
  return view;
}

function disposeView(view) {
  if (!view || view.disposed) return;
  view.disposed = true;
  view.figure.removeEventListener('pointerenter', view.onEnter);
  view.figure.removeEventListener('pointerleave', view.onLeave);
  views.delete(view);
  if (mountedHosts.get(view.host) === view) mountedHosts.delete(view.host);
  delete view.host.dataset.dioramaMounted;
  view.figure.remove();
}

/** Mount one cached rule scene into a host-owned 2D canvas. */
export function mountDiorama(kind, host, opts = {}) {
  if (!KINDS.has(kind)) throw new TypeError(`Unknown card diorama kind: ${kind}`);
  if (!(host instanceof Element)) throw new TypeError('mountDiorama needs a host Element');

  const mounted = mountedHosts.get(host);
  if (mounted && !mounted.disposed && mounted.kind === kind) {
    mounted.controller.update(opts);
    return mounted.controller;
  }
  if (mounted) disposeView(mounted);

  // Build/cache before creating DOM so a scene-limit failure leaves the host untouched.
  const entry = sceneFor(kind);
  const view = makeView(kind, host, opts);
  const controller = {
    meshCount: entry.meshCount,
    update(nextOpts = {}) {
      if (view.disposed) return;
      view.opts = { ...view.opts, ...nextOpts };
      renderView(view, 0);
    },
    dispose() {
      disposeView(view);
    },
  };
  view.controller = controller;
  views.add(view);
  mountedHosts.set(host, view);
  renderView(view, 0);
  return controller;
}

/** Mesh colours and caption of one built How-to-play scene. No GL draw. */
export function readDioramaScene(kind) {
  const entry = sceneFor(kind);
  const materials = [];
  entry.root.traverse((node) => {
    if (node.isMesh && node.material?.color) materials.push(`#${node.material.color.getHexString()}`);
  });
  return { materials, caption: entry.caption({}) };
}

/** Release every mounted view, cached scene, geometry, material and the shared GL context. */
export function disposeDioramaHub() {
  for (const view of [...views]) disposeView(view);
  sceneCache.clear();
  for (const item of geometryCache.values()) item.dispose();
  geometryCache.clear();
  if (sharedMaterials) {
    for (const material of Object.values(sharedMaterials)) material.dispose();
    sharedMaterials = null;
  }
  if (glRenderer) {
    glRenderer.dispose();
    glRenderer.forceContextLoss?.();
    glRenderer = null;
  }
}
