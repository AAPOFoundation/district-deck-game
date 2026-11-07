// District Deck V3.70 — SIGNAGE lane harness.
//
// A demonstration frontage carrying the four Australian signage idioms the brief names, on the
// SHIPPED rig (`lighting.js`, `post.js`, `materials.js` all imported unmodified — §4.9 is pinned
// and this lane does not touch it), so a stroke measured here is a stroke the board draws.
//
//   ?station=board|street|detail   ?text=HOSPITAL   ?cap=0.9   ?route=both|relief|atlas
//
// The board station is the SHIPPED BOARD POSE, not a fit: distance 319 m, az -45, polar 42, fov
// 26, at 1920 x 1080 — the pose `mvp/tests/l3sign-boardzoom.mjs --scale` derives as 7.33 px/m.
// The street station reproduces `residential-lab.js:639`'s own entry verbatim (az 0.18pi,
// eyeAbs 3.20, margin 1.12, look 0.34, fitHeight 24) with the same six-pass projected-corner fit,
// because a station invented here would measure a camera nobody ships.
//
// `window.__signLab.pxPerM(a, b)` projects two world points and returns the pixel distance
// between them, so px/m at a station is MEASURED off the live projection rather than derived from
// a cosine — which is the step the lane's own history says goes wrong.

import * as THREE from 'three';
import { MaterialLibrary } from './render/materials.js';
import { LightingRig } from './render/lighting.js';
import { PostChain } from './render/post.js';
import { SkyDome } from './render/sky.js';
import { signPlate, reliefLetters, reliefExtent, signageMaterial } from './render/signage/index.js';

const params = new URLSearchParams(location.search);
const STATION = params.get('station') ?? 'board';
const TEXT = params.get('text') ?? 'HOSPITAL';
const CAP = Number(params.get('cap') ?? 0.90);
const ROUTE = params.get('route') ?? 'both';
const RELIEF = params.get('relief') ?? 'applied';   // applied | flat (signwritten)
const TOD = Number(params.get('tod') ?? 0.42);
const QUALITY = params.get('quality') ?? 'high';
const POST_ON = params.get('post') !== 'off';

const canvas = document.getElementById('lab');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !POST_ON, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = POST_ON ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.32;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#4a7ab0');

const TILE = 15;
const extent = { x: TILE * 6, z: TILE * 6 };
const centre = new THREE.Vector3(0, 0, 0);

const materials = new MaterialLibrary({ quality: QUALITY });
const lighting = new LightingRig(scene, extent, { quality: QUALITY, timeOfDay: TOD, renderer });
lighting.bakeEnvironment();
const sky = new SkyDome(scene, extent, { quality: QUALITY, reducedMotion: true, timeOfDay: TOD });

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(extent.x * 3, extent.z * 3),
  materials.get('concrete', { variant: 'sign-lab-ground', color: '#b9b3a6' }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* ───────────────────────────── the demonstration frontage ──────────────────────────────── */
//
// A 15 m single-storey civic frontage with a street verandah — the commonest Australian civic /
// retail massing on this board, and the shape both the hospital's ambulance wing and the
// community centre's foyer already are. Four signage carriers on one subject:
//
//   A  PARAPET  — applied relief letters standing proud of the parapet face (route 2, 0 buckets)
//   B  FASCIA   — a painted signwritten band on the verandah fascia    (route 1, atlas)
//   C  BLADE    — a projecting double-sided blade off the corner pier  (route 1, atlas, 2 faces)
//   D  PYLON    — a pole-mounted pylon at the kerb                     (route 1, atlas, 2 faces)

const p = {
  wall: materials.get('brick', { variant: 'sign-lab-wall', color: '#b8836a' }),
  render: materials.get('render', { variant: 'sign-lab-render', color: '#d9cdb6' }),
  trim: materials.get('render', { variant: 'sign-lab-trim', color: '#efe7d6' }),
  accent: materials.get('painted_metal', { variant: 'sign-lab-accent', color: '#7f4034' }),
  metal: materials.get('painted_metal', { variant: 'sign-lab-metal', color: '#5c5c58' }),
  roof: materials.get('corrugated', { variant: 'sign-lab-roof', color: '#7d7f7c' }),
};

const root = new THREE.Group();
scene.add(root);
const parts = [];
const box = (w, h, d, x, y, z, mat) => {
  parts.push({ geometry: new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), material: mat });
};

const W = 13.4;        // usable frontage
const WALL_H = 4.6;
const PARAPET_H = 1.55;
const FRONT_Z = 3.0;   // the front wall plane (facing +z, toward the street)

// Body + parapet.
box(W, WALL_H, 9.0, 0, 0, FRONT_Z - 4.5, p.wall);
box(W + 0.30, PARAPET_H, 0.52, 0, WALL_H, FRONT_Z - 0.10, p.render);
box(W + 0.46, 0.16, 0.68, 0, WALL_H + PARAPET_H, FRONT_Z - 0.10, p.trim);
// Corner piers, so the blade has something real to hang off.
for (const s of [-1, 1]) box(0.62, WALL_H + PARAPET_H, 0.62, s * (W / 2 - 0.31), 0, FRONT_Z - 0.20, p.render);
// Street verandah: posts, fascia beam, skillion deck.
const VER_Z = FRONT_Z + 2.6;
const VER_Y = 3.05;
for (let i = -2; i <= 2; i += 1) box(0.20, VER_Y, 0.20, i * 3.0, 0, VER_Z, p.metal);
box(W + 0.4, 0.10, 2.9, 0, VER_Y + 0.36, VER_Z - 1.3, p.roof);
const FASCIA_H = 0.94;
box(W + 0.5, FASCIA_H, 0.22, 0, VER_Y - 0.22, VER_Z + 0.06, p.accent);
box(W + 0.6, 0.10, 0.30, 0, VER_Y - 0.22 + FASCIA_H, VER_Z + 0.06, p.trim);
// Kerb + footpath band so the street station has a ground story.
box(30, 0.14, 5.2, 0, 0, VER_Z + 3.4, p.trim);

/* ── A. PARAPET, relief letters — route 2, zero new materials ───────────────────────────── */
const parapetFace = FRONT_Z - 0.10 + 0.26;
const reliefInfo = reliefExtent(TEXT, { cap: CAP, maxWidth: W - 1.2 });
if (ROUTE !== 'atlas') {
  parts.push(...reliefLetters({
    text: TEXT,
    x: 0,
    y: WALL_H + (PARAPET_H - reliefInfo.cap) / 2,
    z: parapetFace,
    cap: CAP,
    maxWidth: W - 1.2,
    depth: RELIEF === 'flat' ? 0.009 : 0.075,   // signwritten paint section vs applied metal
    material: p.accent,          // accent letters on the render parapet: a bucket it already owns
    axis: 'z', facing: 1,
    name: 'parapet-letters',
  }));
}

/* ── B. FASCIA, painted plate — route 1, the atlas ──────────────────────────────────────── */
const atlasParts = [];
if (ROUTE !== 'relief') {
  atlasParts.push(...signPlate(materials, {
    text: TEXT,
    x: 0, y: VER_Y - 0.22 + FASCIA_H / 2, z: VER_Z + 0.17,
    w: W - 0.6, h: FASCIA_H * 0.86,
    axis: 'z', facing: 1, proud: 0.01,
    ink: '#efe7d6', ground: '#7f4034', capFrac: 0.66, rule: 0,
    name: 'fascia-plate',
  }));

  /* ── C. BLADE, projecting, double-sided ──────────────────────────────────────────────── */
  const bladeX = W / 2 - 0.31;
  const bladeY = WALL_H - 1.1;
  box(0.14, 2.30, 1.05, bladeX + 0.62, bladeY - 1.15, FRONT_Z + 0.20, p.metal);
  for (const f of [1, -1]) {
    atlasParts.push(...signPlate(materials, {
      text: TEXT,
      x: bladeX + 0.62 + f * 0.075, y: bladeY, z: FRONT_Z + 0.20,
      w: 2.10, h: 0.95,
      axis: 'x', facing: f, proud: 0.005,
      ink: '#efe7d6', ground: '#7f4034', capFrac: 0.66,
      name: `blade-plate-${f > 0 ? 'a' : 'b'}`,
    }));
  }

  /* ── D. PYLON at the kerb, double-sided ──────────────────────────────────────────────── */
  const pylonZ = VER_Z + 4.2;
  box(1.05, 0.42, 0.70, -4.4, 0, pylonZ, p.render);
  box(0.34, 3.10, 0.40, -4.4, 0.42, pylonZ, p.metal);
  box(2.30, 1.35, 0.30, -4.4, 3.10, pylonZ, p.render);
  for (const f of [1, -1]) {
    atlasParts.push(...signPlate(materials, {
      text: TEXT,
      x: -4.4, y: 3.10 + 1.35 / 2, z: pylonZ + f * 0.155,
      w: 2.05, h: 1.12,
      axis: 'z', facing: f, proud: 0.008,
      ink: '#332d26', ground: '#e6ddc9', capFrac: 0.60,
      name: `pylon-plate-${f > 0 ? 'a' : 'b'}`,
    }));
  }
}

for (const part of [...parts, ...atlasParts]) {
  const mesh = new THREE.Mesh(part.geometry, part.material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
}

/* ─────────────────────────────────── camera stations ───────────────────────────────────── */

const camera = new THREE.PerspectiveCamera(26, 1, 1, 2000);
const bounds = new THREE.Box3().setFromObject(root);
const size = bounds.getSize(new THREE.Vector3());
const target = bounds.getCenter(new THREE.Vector3());

const CORNERS = [];
for (const x of [bounds.min.x, bounds.max.x]) {
  for (const y of [bounds.min.y, bounds.max.y]) {
    for (const z of [bounds.min.z, bounds.max.z]) CORNERS.push(new THREE.Vector3(x, y, z));
  }
}
const probe = new THREE.Vector3();

// `residential-lab.js:639` verbatim. Not re-derived here: a second copy of a constant is the
// signature defect this programme has now recorded ten times.
const STREET = { az: Math.PI * 0.18, eyeAbs: 3.20, margin: 1.12, look: 0.34, fitHeight: 24 };
const DETAIL = { az: Math.PI * 0.10, eye: 0.62, margin: 0.42, look: 0.62 };

function fitStation(v) {
  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(camera.aspect, 0.1));
  const tanV = Math.tan(vFov / 2);
  const tanH = Math.tan(hFov / 2);
  const aimY = bounds.min.y + size.y * v.look;
  const capY = v.fitHeight != null
    ? Math.min(bounds.max.y, bounds.min.y + v.fitHeight) : bounds.max.y;
  const corners = capY >= bounds.max.y
    ? CORNERS : CORNERS.map((c) => (c.y > capY ? new THREE.Vector3(c.x, capY, c.z) : c));
  const eyeY = v.eyeAbs != null ? bounds.min.y + v.eyeAbs
    : v.eye != null ? bounds.min.y + size.y * v.eye : null;
  const aim = new THREE.Vector3(target.x, Math.min(aimY, capY), target.z);
  let horiz = Math.max(size.x, Math.min(size.y, capY - bounds.min.y), size.z) * 1.5;
  for (let pass = 0; pass < 6; pass += 1) {
    const camY = eyeY != null ? eyeY : aimY + Math.tan(v.el ?? 0.18) * horiz;
    camera.position.set(target.x + Math.sin(v.az) * horiz, camY, target.z + Math.cos(v.az) * horiz);
    camera.lookAt(aim);
    camera.updateMatrixWorld(true);
    let overflow = 0;
    for (const corner of corners) {
      probe.copy(corner).applyMatrix4(camera.matrixWorldInverse);
      const depth = Math.max(-probe.z, 0.05);
      overflow = Math.max(overflow, Math.abs(probe.x) / (tanH * depth), Math.abs(probe.y) / (tanV * depth));
    }
    if (overflow <= 1e-4) break;
    horiz = Math.max(horiz * (1 + (overflow * v.margin - 1) * 0.85), 8);
  }
  const camY = eyeY != null ? eyeY : aimY + Math.tan(v.el ?? 0.18) * horiz;
  camera.position.set(target.x + Math.sin(v.az) * horiz, camY, target.z + Math.cos(v.az) * horiz);
  camera.lookAt(aim);
  camera.updateProjectionMatrix();
}

function placeCamera(station) {
  if (station === 'board') {
    // The shipped board pose, reproduced from `camera.js:29-31` + `_poseCamera`. Distance 319 is
    // the lane's own board-tile figure, derived in `l3sign-boardzoom.mjs`.
    const d = Number(params.get('dist') ?? 319);
    const az = -45 * Math.PI / 180;
    const polar = 42 * Math.PI / 180;
    const aim = new THREE.Vector3(target.x, bounds.min.y + size.y * 0.45, target.z);
    camera.position.set(
      aim.x + Math.sin(polar) * Math.sin(az) * d,
      aim.y + Math.cos(polar) * d,
      aim.z + Math.sin(polar) * Math.cos(az) * d,
    );
    camera.lookAt(aim);
    camera.updateProjectionMatrix();
    return;
  }
  fitStation(station === 'detail' ? DETAIL : STREET);
}

let post = null;
function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  placeCamera(STATION);
  if (POST_ON) {
    if (!post) {
      post = new PostChain(renderer, {
        quality: QUALITY, reducedMotion: true, width: w, height: h, grade: lighting.profile.grade,
      });
      post.dofStrength = Number(params.get('dof') ?? 0);
    } else post.setSize(w, h);
  }
}
window.addEventListener('resize', resize);
resize();

function drawFrame() {
  lighting.update?.(0);
  if (post) post.render(scene, camera);
  else renderer.render(scene, camera);
  renderer.info.reset();
}

/** Pixels between two world points, measured off the live projection. */
function pxBetween(a, b) {
  const w = renderer.domElement.width;
  const h = renderer.domElement.height;
  const pa = new THREE.Vector3(...a).project(camera);
  const pb = new THREE.Vector3(...b).project(camera);
  return Math.hypot((pa.x - pb.x) * w / 2, (pa.y - pb.y) * h / 2);
}

window.__signLab = {
  ready: true,
  station: STATION,
  text: TEXT,
  /** World centre of each carrier's lettering, so a sampler hits the ink and not the wall. */
  pt: {
    parapet: [0, WALL_H + PARAPET_H / 2, parapetFace],
    fascia: [0, VER_Y - 0.22 + FASCIA_H / 2, VER_Z + 0.18],
    pylon: [-4.4, 3.775, VER_Z + 4.2 + 0.163],
    blade: [W / 2 - 0.31 + 0.70, WALL_H - 1.1, 3.20],
  },
  step(n = 1) { for (let i = 0; i < n; i += 1) drawFrame(); },
  pxBetween,
  /**
   * The measurements the report is built on, taken in the SIGN'S OWN PLANE at each carrier.
   * `strokePx` is the authored stroke advanced along the plane's horizontal, projected — so it
   * carries the pose's foreshortening rather than assuming a cosine.
   */
  measure() {
    const py = WALL_H + (PARAPET_H - reliefInfo.cap) / 2;
    const s = reliefInfo.stroke;
    const carriers = {
      // parapet relief letters, front plane facing +z
      parapet: {
        strokeH: pxBetween([0, py + reliefInfo.cap / 2, parapetFace], [s, py + reliefInfo.cap / 2, parapetFace]),
        strokeV: pxBetween([0, py, parapetFace], [0, py + s, parapetFace]),
        capPx: pxBetween([0, py, parapetFace], [0, py + reliefInfo.cap, parapetFace]),
        widthPx: pxBetween([-reliefInfo.width / 2, py, parapetFace], [reliefInfo.width / 2, py, parapetFace]),
        strokeM: s, capM: reliefInfo.cap, widthM: reliefInfo.width,
      },
    };
    // fascia plate: cap is capFrac of the plate height, stroke is 0.16 of cap
    const fh = FASCIA_H * 0.86;
    const fcap = fh * 0.66;
    const fs = fcap * 0.16;
    const fy = VER_Y - 0.22 + FASCIA_H / 2;
    carriers.fascia = {
      strokeH: pxBetween([0, fy, VER_Z + 0.18], [fs, fy, VER_Z + 0.18]),
      strokeV: pxBetween([0, fy, VER_Z + 0.18], [0, fs + fy, VER_Z + 0.18]),
      capPx: pxBetween([0, fy - fcap / 2, VER_Z + 0.18], [0, fy + fcap / 2, VER_Z + 0.18]),
      widthPx: pxBetween([-(W - 0.6) / 2, fy, VER_Z + 0.18], [(W - 0.6) / 2, fy, VER_Z + 0.18]),
      strokeM: fs, capM: fcap, widthM: W - 0.6,
    };
    const pcap = 1.12 * 0.60;
    const ps = pcap * 0.16;
    const pz = VER_Z + 4.2 + 0.163;
    carriers.pylon = {
      strokeH: pxBetween([-4.4, 3.775, pz], [-4.4 + ps, 3.775, pz]),
      strokeV: pxBetween([-4.4, 3.775, pz], [-4.4, 3.775 + ps, pz]),
      capPx: pxBetween([-4.4, 3.775 - pcap / 2, pz], [-4.4, 3.775 + pcap / 2, pz]),
      widthPx: pxBetween([-4.4 - 1.025, 3.775, pz], [-4.4 + 1.025, 3.775, pz]),
      strokeM: ps, capM: pcap, widthM: 2.05,
    };
    const bcap = 0.95 * 0.66;
    const bs = bcap * 0.16;
    const bx = W / 2 - 0.31 + 0.62 + 0.08;
    carriers.blade = {
      strokeH: pxBetween([bx, WALL_H - 1.1, 3.0 + 0.20], [bx, WALL_H - 1.1, 3.0 + 0.20 + bs]),
      strokeV: pxBetween([bx, WALL_H - 1.1, 3.20], [bx, WALL_H - 1.1 + bs, 3.20]),
      capPx: pxBetween([bx, WALL_H - 1.1 - bcap / 2, 3.20], [bx, WALL_H - 1.1 + bcap / 2, 3.20]),
      widthPx: pxBetween([bx, WALL_H - 1.1, 3.20 - 1.05], [bx, WALL_H - 1.1, 3.20 + 1.05]),
      strokeM: bs, capM: bcap, widthM: 2.10,
    };
    // A 1 m rule laid on the parapet face, so px/m at this station is measured not derived.
    carriers.__scale = {
      onePxPerM_horizontal: pxBetween([0, py, parapetFace], [1, py, parapetFace]),
      onePxPerM_vertical: pxBetween([0, py, parapetFace], [0, py + 1, parapetFace]),
      onePxPerM_flat: pxBetween([0, 0.001, target.z], [1, 0.001, target.z]),
      viewport: [renderer.domElement.width, renderer.domElement.height],
      cameraDistance: camera.position.distanceTo(target),
    };
    return carriers;
  },
  /** Screen pixels of a world point, for a measuring script that has to find a feature. */
  project(a) {
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    const v = new THREE.Vector3(...a).project(camera);
    return [(v.x * 0.5 + 0.5) * w, (0.5 - v.y * 0.5) * h];
  },
  /**
   * RENDERED VALUE, not the hex. The atlas material carries no family map so the authored pixel
   * IS the albedo — but the rig and the post grade still stand between albedo and plate, and
   * §5.2 says the bottom of that curve adds chroma. Sampled off the finished frame.
   */
  sampleRect(centreWorld, halfWpx, halfHpx) {
    const [cx, cy] = this.project(centreWorld);
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    const x0 = Math.max(0, Math.round(cx - halfWpx));
    const y0 = Math.max(0, Math.round(cy - halfHpx));
    const x1 = Math.min(w, Math.round(cx + halfWpx));
    const y1 = Math.min(h, Math.round(cy + halfHpx));
    if (x1 <= x0 || y1 <= y0) return null;
    // RE-RENDER IN THIS TASK BEFORE READING. `preserveDrawingBuffer` is false, so the WebGL
    // buffer is cleared once the browser composites — and a read after that returns a black
    // patch that looks like a measurement. It did exactly that on the r3 board plates: a
    // 46 x 6 rect sitting squarely on a parapet the screenshot shows lettering on came back
    // (0,0,0) for BOTH darkest and brightest, which is the tell that nothing was read at all.
    drawFrame();
    const c2 = document.createElement('canvas');
    c2.width = x1 - x0; c2.height = y1 - y0;
    const g = c2.getContext('2d', { willReadFrequently: true });
    g.drawImage(renderer.domElement, x0, y0, c2.width, c2.height, 0, 0, c2.width, c2.height);
    const d = g.getImageData(0, 0, c2.width, c2.height).data;
    // DARKEST / BRIGHTEST, not ink / ground. Half the signage on this board is light-on-dark
    // (a painted fascia) and half is dark-on-light (a pylon), so a field called `ink` would be
    // the letters on one carrier and the plate on the next — a label that reports the wrong
    // thing half the time is worse than no label.
    let darkest = null; let brightest = null; let lo = 1e9; let hi = -1;
    let sum = 0; let n = 0;
    const lum = (r, gg, b) => 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    for (let i = 0; i < d.length; i += 4) {
      const L = lum(d[i], d[i + 1], d[i + 2]);
      sum += L; n += 1;
      if (L < lo) { lo = L; darkest = [d[i], d[i + 1], d[i + 2]]; }
      if (L > hi) { hi = L; brightest = [d[i], d[i + 1], d[i + 2]]; }
    }
    if (hi <= 0.5) return { rect: [x0, y0, x1 - x0, y1 - y0], readFailed: true };
    return {
      rect: [x0, y0, x1 - x0, y1 - y0],
      darkestRGB: darkest, darkestLuma: Number(lo.toFixed(1)),
      brightestRGB: brightest, brightestLuma: Number(hi.toFixed(1)),
      meanLuma: Number((sum / Math.max(1, n)).toFixed(1)),
      // Michelson contrast on the rendered pixels, which is what the eye gets.
      contrast: Number(((hi - lo) / Math.max(1, hi + lo)).toFixed(3)),
    };
  },
  cost() {
    let tris = 0; let meshes = 0;
    const byMaterial = new Map();
    const uuids = new Set();
    root.traverse((o) => {
      if (!o.isMesh) return;
      meshes += 1;
      uuids.add(o.material.uuid);
      const idx = o.geometry.index;
      const n = (idx ? idx.count : o.geometry.attributes.position.count) / 3;
      tris += n;
      const k = `${o.material.name ?? 'anon'}#${o.material.uuid.slice(0, 4)}`;
      byMaterial.set(k, (byMaterial.get(k) ?? 0) + n);
    });
    return {
      meshes,
      triangles: Math.round(tris),
      materials: uuids.size,
      byMaterial: Object.fromEntries([...byMaterial].map(([k, v]) => [k, Math.round(v)])),
      reliefWord: reliefInfo,
      signageMaterialName: signageMaterial(materials)?.name ?? null,
    };
  },
  /** §3.3 proof: hash the atlas canvas. Same id, same pixels. */
  atlasHash() {
    const atlas = materials.userData.__signAtlas;
    if (!atlas) return null;
    const d = atlas.ctx.getImageData(0, 0, 2048, 512).data;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < d.length; i += 1) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; }
    return { hash: h.toString(16), cells: atlas.cells.size };
  },
  /**
   * Is `fillText` deterministic across machines? Measured, not asserted: if the same CSS generic
   * resolves to a different face than a named one, the pixels are host-dependent.
   */
  fontProbe() {
    const c = document.createElement('canvas').getContext('2d');
    const out = {};
    for (const fam of ['sans-serif', 'Arial', 'Helvetica', 'DejaVu Sans', 'Liberation Sans', 'system-ui']) {
      c.font = `bold 64px ${fam}`;
      out[fam] = Number(c.measureText('HOSPITAL').width.toFixed(3));
    }
    return out;
  },
};

drawFrame();
