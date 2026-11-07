// Shared bust-cam of a Meshy walk-shell. One WebGL renderer; 2D canvases on the
// person card and PEOPLE rail. Canvas stays hidden until a framed bust is drawn.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { identityFor } from '../core/people-identities.js';
import { PROPORTIONS } from '../render/people/core.js';

const loader = new GLTFLoader();
const gltfCache = new Map();
const views = new Set();
const _head = new THREE.Vector3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _box = new THREE.Box3();
const _clipPoint = new THREE.Vector3();
const _clipUp = new THREE.Vector3(0, 1, 0);
const _clipPlane = new THREE.Plane();
const BUST_BONES = [
  'Head', 'neck', 'Neck', 'Spine02', 'Spine01',
  'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm',
];

let glRenderer = null;
let hubRaf = 0;
let hubLast = 0;

export function portraitShellId(person) {
  if (!person) return null;
  const archetypeId = person.archetypeId;
  if (archetypeId === 'dog' || archetypeId === 'avatar') return null;
  if (archetypeId === 'family') {
    const members = identityFor('family', person.identityId ?? 0).members ?? [];
    return members.find((id) => id.endsWith('-mum')) ?? members[0] ?? null;
  }
  return archetypeId;
}

function walkUrl(id) {
  return `assets/models/people/${id}/walk.glb`;
}

function loadGltf(id) {
  if (gltfCache.has(id)) return gltfCache.get(id);
  const pending = loader.loadAsync(walkUrl(id)).catch((err) => {
    gltfCache.delete(id);
    throw err;
  });
  gltfCache.set(id, pending);
  return pending;
}

function scaleToHeight(root, metres) {
  _box.setFromObject(root);
  const height = _box.max.y - _box.min.y;
  if (!(height > 0.05)) return;
  root.scale.multiplyScalar(metres / height);
  _box.setFromObject(root);
  root.position.y -= _box.min.y;
}

function indexBones(root) {
  const bones = {};
  root.traverse((node) => {
    if (node.name) bones[node.name] = node;
  });
  return bones;
}

function captureBind(bones) {
  const bind = {};
  for (const name of ['Head', 'neck', 'Neck', 'Spine', 'Spine01', 'Spine02', 'Hips']) {
    if (bones[name]) bind[name] = bones[name].quaternion.clone();
  }
  return bind;
}

function bustFocus(root, bones) {
  root.updateMatrixWorld(true);
  const pts = [];
  for (const name of BUST_BONES) {
    const bone = bones[name];
    if (!bone) continue;
    const p = new THREE.Vector3();
    bone.getWorldPosition(p);
    pts.push(p);
  }
  if (bones.Head) {
    bones.Head.getWorldPosition(_head);
    pts.push(_head.clone().setY(_head.y + 0.16));
  }
  if (!pts.length) {
    _box.setFromObject(root);
    const height = Math.max(0.2, _box.max.y - _box.min.y);
    return {
      center: new THREE.Vector3(
        (_box.min.x + _box.max.x) * 0.5,
        _box.min.y + height * 0.82,
        (_box.min.z + _box.max.z) * 0.5,
      ),
      radius: height * 0.22,
      clipY: _box.min.y + height * 0.58,
    };
  }
  _box.setFromPoints(pts);
  _box.expandByScalar(0.05);
  _box.max.y += 0.08;
  _box.getCenter(_center);
  _box.getSize(_size);
  const radius = Math.max(_size.x, _size.y, _size.z) * 0.5;
  return {
    center: _center.clone(),
    radius: Math.max(0.18, radius),
    clipY: _box.min.y - 0.03,
  };
}

function frameBust(view) {
  if (!view.root) return;
  const width = Math.max(1, view.canvas.clientWidth || view.canvas.width || 120);
  const height = Math.max(1, view.canvas.clientHeight || view.canvas.height || 160);
  const aspect = width / height;
  const focus = bustFocus(view.root, view.bones ?? {});
  const fov = 28;
  const vFov = THREE.MathUtils.degToRad(fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const dist = Math.max(
    focus.radius / Math.tan(vFov / 2),
    focus.radius / Math.tan(hFov / 2),
  ) * 1.28;
  view.camera.fov = fov;
  view.camera.aspect = aspect;
  view.camera.near = Math.max(0.05, dist - focus.radius * 2.2);
  view.camera.far = dist + focus.radius * 3;
  view.camera.position.set(
    focus.center.x + 0.07,
    focus.center.y + 0.02,
    focus.center.z + dist,
  );
  view.camera.lookAt(focus.center.x, focus.center.y + 0.01, focus.center.z);
  view.camera.updateProjectionMatrix();
  view.clipY = focus.clipY;
  view.framed = true;
  view.frameKey = `${width}x${height}`;
}

function portraitIdle(view, dt) {
  view.clock += dt;
  const bones = view.bones;
  const bind = view.bind;
  if (!bones || !bind) return;
  for (const [name, quat] of Object.entries(bind)) {
    bones[name]?.quaternion.copy(quat);
  }
  const t = view.clock;
  const phase = view.phase;
  const spine = bones.Spine01 ?? bones.Spine;
  if (spine) spine.rotateX(Math.sin(t * 1.45 + phase) * 0.018);
  const head = bones.Head;
  if (head) {
    head.rotateY(Math.sin(t * 0.42 + phase * 2) * 0.1);
    head.rotateX(Math.sin(t * 0.31 + phase) * 0.025);
  }
}

function getGlRenderer() {
  if (glRenderer) return glRenderer;
  glRenderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power',
  });
  glRenderer.setClearColor(0x1a1612, 1);
  glRenderer.outputColorSpace = THREE.SRGBColorSpace;
  glRenderer.setPixelRatio(1);
  glRenderer.localClippingEnabled = true;
  return glRenderer;
}

function stopHubIfEmpty() {
  if (views.size > 0) return;
  cancelAnimationFrame(hubRaf);
  hubRaf = 0;
  hubLast = 0;
}

function startHub() {
  if (hubRaf) return;
  const tick = (now) => {
    hubRaf = requestAnimationFrame(tick);
    if (document.hidden) return;
    if (hubLast && now - hubLast < 48) return;
    const dt = hubLast ? Math.min(0.08, (now - hubLast) / 1000) : 1 / 20;
    hubLast = now;
    const gl = getGlRenderer();
    for (const view of views) {
      if (!view.canvas.isConnected || view.disposed || !view.root) continue;
      portraitIdle(view, dt);
      const width = Math.max(1, Math.round(view.canvas.clientWidth || view.canvas.width || 1));
      const height = Math.max(1, Math.round(view.canvas.clientHeight || view.canvas.height || 1));
      const frameKey = `${width}x${height}`;
      if (!view.framed || view.frameKey !== frameKey) frameBust(view);
      if (view.canvas.width !== width || view.canvas.height !== height) {
        view.canvas.width = width;
        view.canvas.height = height;
      }
      gl.setSize(width, height, false);
      _clipPoint.set(0, view.clipY ?? 0.7, 0);
      _clipUp.set(0, 1, 0);
      _clipPlane.setFromNormalAndCoplanarPoint(_clipUp, _clipPoint);
      gl.clippingPlanes = [_clipPlane];
      gl.render(view.scene, view.camera);
      const ctx = view.canvas.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(gl.domElement, 0, 0, width, height);
      view.stage?.classList.add('has-3d');
    }
  };
  hubRaf = requestAnimationFrame(tick);
}

function makeScene() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xf2e6d4, 0x2a221c, 1.25));
  const key = new THREE.DirectionalLight(0xffe6c4, 1.55);
  key.position.set(0.45, 1.7, 1.2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb8c4d4, 0.5);
  fill.position.set(-0.8, 0.6, 0.6);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xfff2dc, 0.35);
  rim.position.set(-0.15, 1.3, -0.9);
  scene.add(rim);
  return scene;
}

function mountView(canvas, shellId, stage) {
  if (!canvas || !shellId) return () => {};
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return () => {};

  const view = {
    canvas,
    stage: stage ?? canvas.parentElement,
    id: shellId,
    scene: makeScene(),
    camera: new THREE.PerspectiveCamera(28, 0.75, 0.05, 16),
    root: null,
    bones: null,
    bind: null,
    clock: 0,
    phase: Math.random() * Math.PI * 2,
    clipY: 0.7,
    framed: false,
    frameKey: '',
    disposed: false,
  };
  views.add(view);
  startHub();

  loadGltf(shellId).then((gltf) => {
    if (view.disposed) return;
    const root = cloneSkinned(gltf.scene);
    scaleToHeight(root, PROPORTIONS.height);
    root.rotation.y = 0.18;
    view.scene.add(root);
    view.root = root;
    view.bones = indexBones(root);
    view.bind = captureBind(view.bones);
    frameBust(view);
  }).catch(() => {
    view.stage?.classList.remove('has-3d');
  });

  return () => {
    view.disposed = true;
    views.delete(view);
    view.stage?.classList.remove('has-3d');
    stopHubIfEmpty();
  };
}

export function mountPersonPortrait3d(cardEl, person) {
  const stage = cardEl?.querySelector?.('[data-person-stage][data-person-3d]');
  const canvas = stage?.querySelector('canvas.card__cast-3d');
  const shellId = stage?.dataset.person3d || portraitShellId(person);
  if (!stage || !canvas || !shellId) return () => {};
  return mountView(canvas, shellId, stage);
}

export function mountRailPortraits(rootEl) {
  if (!rootEl) return () => {};
  const disposers = [...rootEl.querySelectorAll('canvas[data-rail-portrait]')].map((canvas) => {
    const id = canvas.dataset.railPortrait;
    const stage = canvas.closest('.cast-avatar__media') ?? canvas.parentElement;
    return mountView(canvas, id, stage);
  });
  return () => {
    for (const dispose of disposers) dispose();
  };
}
