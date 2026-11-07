// District Deck — LANDMARKS fidelity lab (V3.70, lane LANDMARKS).
//
// Renders `render/landmarks/` against the runtime material library, lighting rig and post chain,
// so a critic judges the same pixels the board draws. It is a NEW file rather than an edit to
// `residential-lab.js`, for two reasons: five seats share that harness and a concurrent edit
// there loses somebody else's work, and these two ids are not registered in `content.js`, so
// `BuildingKit.get` cannot assemble them.
//
//   ?id=<university-old-arts|town-hall-melbourne>&view=<three-quarter|street|detail|board|tower|boardpose>
//   &studio=1   the warm seamless the reference plates are shot on
//   &tod=0.28   time of day, passed straight to the rig
//
// Deterministic: no Math.random, no Date.now in scene construction. Frames are pumped by hand
// through `window.__lmLab.step(n)` so a headless capture never races the RAF loop.

import * as THREE from 'three';
import { TILE } from './core/grid.js';
import { MaterialLibrary, MATERIAL_FAMILIES } from './render/materials.js';
import { LightingRig, sunDirection } from './render/lighting.js';
import { PostChain } from './render/post.js';
import { SkyDome } from './render/sky.js';
import { assembleLandmark, LANDMARK_IDS } from './render/landmarks/index.js';
import { hash32, unitFrom } from './render/landmarks/kit.js';

const params = new URLSearchParams(location.search);
const ID = params.get('id') ?? 'university-old-arts';
const VIEW = params.get('view') ?? 'three-quarter';
const DISTRICT = params.get('district') ?? 'carlton-east';
const FACADE = Number(params.get('facade') ?? 0);
const TIME_OF_DAY = Number(params.get('tod') ?? 0.28);
const QUALITY = params.get('quality') ?? 'high';
const POST_ON = params.get('post') !== 'off';
const STUDIO = params.get('studio') === '1';

const canvas = document.getElementById('lab');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: !POST_ON, powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = POST_ON ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.32;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#4a7ab0');

const extent = { x: TILE * 6, z: TILE * 6 };
const centre = new THREE.Vector3(0, 0, 0);

const materials = new MaterialLibrary({ quality: QUALITY });
const lighting = new LightingRig(scene, extent, {
  quality: QUALITY, timeOfDay: TIME_OF_DAY, renderer,
});
lighting.bakeEnvironment();

const sky = new SkyDome(scene, extent, {
  quality: QUALITY, reducedMotion: true, timeOfDay: TIME_OF_DAY,
});
for (const key of ['root', 'mesh', 'dome']) {
  const node = sky?.[key];
  if (node && typeof node === 'object' && 'visible' in node) node.visible = !STUDIO;
}
if (STUDIO) scene.background = new THREE.Color('#e9e2d6');

// The backdrop value varies per subject, deterministically. A constant backdrop is a signature:
// four blind critics once defeated an A/B by sampling one corner pixel.
const backdropSeed = hash32(`lm-backdrop|${ID}|${DISTRICT}`);
const lift = unitFrom(backdropSeed, 17);
const warm = unitFrom(backdropSeed, 23) * 0.03 - 0.015;
const shellLow = [0.79 + lift * 0.16 + warm, 0.76 + lift * 0.16, 0.72 + lift * 0.16 - warm];
const GROUND_LIGHT_GAIN = [1.049, 1.018, 0.990];

const groundMat = STUDIO
  ? new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(
      shellLow[0] / GROUND_LIGHT_GAIN[0],
      shellLow[1] / GROUND_LIGHT_GAIN[1],
      shellLow[2] / GROUND_LIGHT_GAIN[2],
    ),
    roughness: 0.95,
    metalness: 0,
  })
  : materials.get('concrete', { variant: 'lm-lab-ground', color: '#b9b3a6' });
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(extent.x * (STUDIO ? 12 : 3), extent.z * (STUDIO ? 12 : 3)),
  groundMat,
);
ground.rotation.x = -Math.PI / 2;
ground.position.copy(centre);
// The seamless does not catch the model's shadow: a soft cast shadow lying outside the tile is
// counted as SUBJECT by the pair compositor, which is how an earlier lane's measured aspect ran
// 2.9 against a reference's 1.9. The lot's own plate still receives.
ground.receiveShadow = !STUDIO;
scene.add(ground);

if (STUDIO) {
  // A seamless is a floor that curves up into a wall, and a flat card has an edge a tall subject
  // sees past. An enclosing shell does not.
  const shellR = Math.max(extent.x, extent.z) * 9;
  const shell = new THREE.SphereGeometry(shellR, 32, 24);
  const pos = shell.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const low = new THREE.Color().setRGB(shellLow[0], shellLow[1], shellLow[2]);
  const high = new THREE.Color().setRGB(
    0.90 + lift * 0.08 + warm, 0.88 + lift * 0.08, 0.85 + lift * 0.08 - warm,
  );
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const t = Math.min(Math.max(pos.getY(i) / shellR * 0.5 + 0.5, 0), 1);
    c.copy(low).lerp(high, t ** 0.6);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  shell.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const shellMesh = new THREE.Mesh(shell, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  shellMesh.position.copy(centre);
  shellMesh.renderOrder = -1;
  scene.add(shellMesh);
}

const root = new THREE.Group();
scene.add(root);

const model = assembleLandmark(ID, materials, {
  districtId: DISTRICT, quality: QUALITY, facade: FACADE,
});
if (!model) throw new Error(`no landmark builder for ${ID}`);
for (const item of model.parts) {
  const mesh = new THREE.Mesh(item.geometry, item.material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
}
for (const opening of model.openings ?? []) {
  for (const item of opening.parts ?? []) {
    const mesh = new THREE.Mesh(item.geometry, item.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

// ── THE ENVIRONMENT HAS TO BE APPLIED AFTER THE MODEL IS MOUNTED, AND FORGETTING IT COST A ──
// ── WHOLE PLATE ROUND.                                                                     ──
//
// `LightingRig` assigns `scene.environment` at bake time, and three then lights every physical
// material from it at `envMapIntensity` — which defaults to **1**. `applyEnvironmentToScene`
// walks the tree and replaces that default with the material's own
// `userData.envIntensityBase x profile.envIntensity`, which is the ONLY route by which a bucket's
// authored `envBase` reaches the pixel. Materials built after the bake, as every kit's are, are
// invisible to the rig until this call.
//
// [MEASURED by looking] `plates/r2/university-old-arts--three-quarter.png`, shot without this
// call: the roof's LIT plane came back cobalt after the bucket had already been re-authored warm
// and its `envBase` taken from 0.52 to 0.34 — because neither number was reaching the shader. The
// baked sky term is linear (0.129, 0.392, 0.850), so an untuned material at intensity 1 renders
// the sky, not the slate. Every other lab in the repo makes this call (`residential-lab.js:458`,
// `industrial-lab.js:459`, `coast-lab.js:111`, `construction-lab.js:151`); this one did not.
lighting.applyEnvironmentToScene(scene);

const fitBounds = new THREE.Box3().setFromObject(root);
const size = fitBounds.getSize(new THREE.Vector3());
const target = fitBounds.getCenter(new THREE.Vector3());
target.y = fitBounds.min.y;

const camera = new THREE.PerspectiveCamera(34, 1.5, 0.5, 3000);

/**
 * Stations. `board` is a framed isometric; `boardpose` is the SHIPPED RIG'S OWN POSE — azimuth
 * -45 deg, polar 42 deg, camera distance 319 m — which is the station this lane's legibility
 * claims are measured at, so a critic can see the same thing the raster measures.
 */
const VIEWS = {
  'three-quarter': { az: Math.PI * 0.22, el: 0.20, margin: 1.10, look: 0.42 },
  street: { az: Math.PI * 0.15, eyeAbs: 3.4, margin: 1.10, look: 0.34, fitHeight: 30 },
  detail: { az: Math.PI * 0.15, eye: 0.30, margin: 0.52, look: 0.26 },
  tower: { az: Math.PI * 0.20, el: 0.34, margin: 0.60, look: 0.82 },
  board: { az: Math.PI * 0.25, el: 0.62, margin: 1.16, look: 0.45 },
  boardpose: { fixed: { az: -Math.PI / 4, polar: (42 * Math.PI) / 180, dist: 319, fov: 26 } },
};

const CORNERS = [];
for (const x of [fitBounds.min.x, fitBounds.max.x]) {
  for (const y of [fitBounds.min.y, fitBounds.max.y]) {
    for (const z of [fitBounds.min.z, fitBounds.max.z]) CORNERS.push(new THREE.Vector3(x, y, z));
  }
}
const fitProbe = new THREE.Vector3();

function placeCamera(view) {
  const v = VIEWS[view] ?? VIEWS['three-quarter'];
  if (v.fixed) {
    // No fit: the rig's own pose, reproduced. `camera.js` aims the ground plane, so the target is
    // the subject's footprint centre at y = 0 rather than its bounding-box centre.
    const { az, polar, dist, fov } = v.fixed;
    camera.fov = fov;
    const horizontal = Math.cos(polar) * dist;
    camera.position.set(
      target.x + Math.sin(az) * horizontal,
      fitBounds.min.y + Math.sin(polar) * dist,
      target.z + Math.cos(az) * horizontal,
    );
    camera.lookAt(target.x, fitBounds.min.y, target.z);
    camera.updateProjectionMatrix();
    return;
  }
  camera.fov = 34;
  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(camera.aspect, 0.1));
  const tanV = Math.tan(vFov / 2);
  const tanH = Math.tan(hFov / 2);
  const aimY = fitBounds.min.y + size.y * v.look;
  const eyeY = v.eyeAbs != null ? fitBounds.min.y + v.eyeAbs
    : v.eye != null ? fitBounds.min.y + size.y * v.eye : null;
  const capY = v.fitHeight != null
    ? Math.min(fitBounds.max.y, fitBounds.min.y + v.fitHeight) : fitBounds.max.y;
  const corners = capY >= fitBounds.max.y
    ? CORNERS
    : CORNERS.map((c) => (c.y > capY ? new THREE.Vector3(c.x, capY, c.z) : c));
  const aim = new THREE.Vector3(target.x, Math.min(aimY, capY), target.z);

  // Framing is solved against the PROJECTED CORNERS rather than a closed form. Perspective
  // framing is a fixed point, so iterate it: place, project every corner, find the worst
  // overflow against the frustum, scale the distance by it.
  let horiz = Math.max(size.x, Math.min(size.y, capY - fitBounds.min.y), size.z) * 1.5;
  for (let pass = 0; pass < 6; pass += 1) {
    const camY = eyeY != null ? eyeY : aimY + Math.tan(v.el ?? 0.18) * horiz;
    camera.position.set(target.x + Math.sin(v.az) * horiz, camY, target.z + Math.cos(v.az) * horiz);
    camera.lookAt(aim);
    camera.updateMatrixWorld(true);
    let overflow = 0;
    for (const corner of corners) {
      fitProbe.copy(corner).applyMatrix4(camera.matrixWorldInverse);
      const depth = Math.max(-fitProbe.z, 0.05);
      overflow = Math.max(overflow,
        Math.abs(fitProbe.x) / (tanH * depth), Math.abs(fitProbe.y) / (tanV * depth));
    }
    if (overflow <= 1e-4) break;
    const want = overflow * v.margin;
    horiz = Math.max(horiz * (1 + (want - 1) * 0.85), 8);
  }
  const camY = eyeY != null ? eyeY : aimY + Math.tan(v.el ?? 0.18) * horiz;
  camera.position.set(target.x + Math.sin(v.az) * horiz, camY, target.z + Math.cos(v.az) * horiz);
  camera.lookAt(aim);
  camera.updateProjectionMatrix();
}

let post = null;
function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  placeCamera(VIEW);
  if (POST_ON) {
    if (!post) {
      post = new PostChain(renderer, {
        quality: QUALITY, reducedMotion: true, width: w, height: h, grade: lighting.profile.grade,
      });
      post.dofStrength = Number(params.get('dof') ?? 0);
      // AO radii are authored for the board camera. A hero plate sits at a fraction of that
      // distance, so an unscaled radius resolves to a hairline the critic cannot see — which
      // four blind seats once used as a signature identifying the game render. The board is
      // untouched; this is the lab's own post instance.
      const aoScale = Math.max(1, Math.max(size.x, size.y, size.z) / 12);
      post.setAmbientOcclusion({
        radiusNear: 0.35 * aoScale,
        radiusFar: 1.6 * aoScale,
        intensity: 3.05,
        contactDarkness: 0.46,
      });
    } else post.setSize(w, h);
  }
}
window.addEventListener('resize', resize);
resize();

if (lighting.profile) sunDirection(lighting.profile);

let frameIndex = 0;
let elapsed = 0;
function drawFrame() {
  frameIndex += 1;
  elapsed += 1 / 60;
  const camDistance = camera.position.distanceTo(target);
  lighting.update(camera, target, camDistance);
  sky.update(1 / 60, elapsed);
  // Eight sub-frames, not two: a captured frame at accumulate 2 only ever gets 2 of the 8 Halton
  // phases and keeps a raw staircase on every diagonal. A fidelity plate is not a game frame.
  if (post) post.render(scene, camera, { accumulate: 8, elapsed, index: frameIndex });
  else renderer.render(scene, camera);
  renderer.info.reset();
}

window.__lmLab = {
  ready: true,
  id: ID,
  ids: LANDMARK_IDS,
  step(n = 1) { for (let i = 0; i < n; i += 1) drawFrame(); },
  setView(view) { placeCamera(view); drawFrame(); },
  stats() {
    let tris = 0; let parts = 0;
    root.traverse((o) => {
      if (!o.isMesh) return;
      parts += 1;
      const idx = o.geometry.index;
      tris += (idx ? idx.count : o.geometry.attributes.position.count) / 3;
    });
    return { parts, triangles: Math.round(tris), buckets: model.parts.length,
      apertures: model.apertures?.length ?? 0, openings: model.openings.length };
  },
  /**
   * THE FAMILY GAIN, MEASURED (§5.0). `MaterialLibrary._create()` multiplies a bucket's authored
   * colour by its family's map, so the RENDERED value is authored-linear x gain. The spread is
   * about 20x across the library and no lane can author a value ladder without it. The maps are
   * generated onto a canvas, so this can only be measured in a browser — which is why it lives
   * here rather than in a node probe.
   */
  familyGains(families = null) {
    const list = families ?? Object.keys(MATERIAL_FAMILIES);
    const out = {};
    const cv = document.createElement('canvas');
    const cx = cv.getContext('2d', { willReadFrequently: true });
    for (const family of list) {
      const spec = MATERIAL_FAMILIES[family];
      if (!spec?.textureSet) { out[family] = null; continue; }
      const mat = materials.get(family, { variant: `gain-probe-${family}` });
      const img = mat.map?.image;
      if (!img) { out[family] = null; continue; }
      cv.width = img.width; cv.height = img.height;
      cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, cv.width, cv.height).data;
      let r = 0; let g = 0; let b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      out[family] = [r / n / 255, g / n / 255, b / n / 255].map((v) => Number(v.toFixed(4)));
    }
    return out;
  },
};

drawFrame();
