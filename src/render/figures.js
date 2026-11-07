// District Deck P17 P1 / P1C — low-tri figure kit.
//
// Monopoly-plus crowd language: a rounded body (capsule torso/hips, shoulders,
// a neck, a head with hair volume, mitt hands, shoe feet), garments as
// silhouette (coat hem, dress, vest, shorts), weight-shifted poses, a
// two-tone from the key, a contact shadow. Deterministic. No Math.random.
//
// Ambient street still draws the reduced-cast instanced sheet in ambient-life.js;
// this file is the shared identity table, the two-tone ramp, the posed builder
// used by beach-life / port-corner / yard crew, and the clone/clip census.
// P1C raises the LOD0 ceiling to 320 tris (LOD1 ≤ 120 at 40 m; impostor > 80 m).

import * as THREE from 'three';
import { hash32, unitFrom, SALT, geometryTriangles } from './people/core.js';
import { RING_COUNTS } from './people/figure.js';

export const FIGURE_TRI_CEILING = 320;
export const FIGURE_TRI_LOD1_CEILING = 120;
export const FIGURE_LOD = Object.freeze({
  nearM: 40,
  midM: 80,
  impostorM: 80,
  lod0Max: 320,
  lod1Max: 120,
});
export const FIGURE_CLEARANCE_M = 0.6;

export const FIGURE_CONTACT = Object.freeze({
  alpha: 0.35,
  footprintScale: 1.2,
});

export const FIGURE_BUILDS = Object.freeze([
  'child', 'slim', 'average', 'stocky', 'tall', 'short', 'athletic', 'elder',
]);

export const FIGURE_ACCESSORIES = Object.freeze([
  'hat', 'cap', 'bag', 'backpack', 'umbrella', 'surfboard',
  'dog', 'pram', 'briefcase', 'hi-vis', 'hard-hat', 'towel-roll',
]);

export const FIGURE_POSES = Object.freeze([
  'stride', 'stand', 'sit', 'lean', 'point', 'lie', 'wave', 'kneel',
]);

/** Garments that change the outline — not a painted vest box. */
export const FIGURE_GARMENTS = Object.freeze([
  'coat', 'dress', 'vest', 'shorts',
]);

/** Two-tone outfit palettes: upper / lower. Twenty-four named combinations. */
export const FIGURE_PALETTES = Object.freeze([
  // W3-A: every upper and lower is S 55 or less (taste bible, clothing), same hue families.
  { id: 'navy-khaki', upper: '#3A5A7C', lower: '#C2A06A' },
  { id: 'red-cream', upper: '#A35B4D', lower: '#E8DCC4' },
  { id: 'teal-sand', upper: '#3F7C7A', lower: '#DAC08A' },
  { id: 'yellow-navy', upper: '#D2B063', lower: '#27324A' },
  { id: 'coral-white', upper: '#C47A5C', lower: '#E8E4DA' },
  { id: 'green-tan', upper: '#5C8A5E', lower: '#C4A06A' },
  { id: 'wine-grey', upper: '#7A3A48', lower: '#8A8E96' },
  { id: 'sky-navy', upper: '#5A86B0', lower: '#27324A' },
  { id: 'mustard-brown', upper: '#B59055', lower: '#5E4430' },
  { id: 'pink-denim', upper: '#B9607A', lower: '#3A5A78' },
  { id: 'orange-olive', upper: '#C48E62', lower: '#4A5A32' },
  { id: 'white-navy', upper: '#D9D6CE', lower: '#3A5A7C' },
  { id: 'charcoal-rust', upper: '#2A2C38', lower: '#A35B4D' },
  { id: 'aqua-coral', upper: '#5E9C86', lower: '#C47A5C' },
  { id: 'lilac-cream', upper: '#72516F', lower: '#D9C8A9' },
  { id: 'forest-khaki', upper: '#3F6E63', lower: '#C2A06A' },
  { id: 'brick-slate', upper: '#A35B4D', lower: '#3F5364' },
  { id: 'gold-navy', upper: '#B8A05A', lower: '#1C1E22' },
  { id: 'mint-navy', upper: '#7EB0A0', lower: '#27324A' },
  { id: 'crimson-tan', upper: '#B0604F', lower: '#D4A060' },
  { id: 'cobalt-sand', upper: '#5578A8', lower: '#E8D4A8' },
  { id: 'olive-cream', upper: '#5A6A38', lower: '#E8DCC4' },
  { id: 'rose-denim', upper: '#B9607A', lower: '#3F6882' },
  { id: 'ink-straw', upper: '#1C1E22', lower: '#DAC08A' },
]);

/**
 * Story groups the vignette planner must be able to name. Street S1/S2 roles
 * stay; P1 adds family/pram, shed workers, towel couple, promenade dog,
 * kiosk queue and pier fishers.
 */
export const FIGURE_VIGNETTE_TYPES = Object.freeze([
  'cafe-patron',
  'bus-queue',
  'crossing-pedestrian',
  'dog-walker',
  'shop-door',
  'venue-door',
  'kerb-social',
  'family-pram',
  'workers-shed',
  'couple-towels',
  'dog-promenade',
  'kiosk-queue',
  'fishers-pier',
]);

const BUILD_MEASURE = Object.freeze({
  child: { height: 1.12, width: 0.78, shoulder: 0.82, torso: 0.88 },
  slim: { height: 1.64, width: 0.86, shoulder: 0.90, torso: 0.86 },
  average: { height: 1.56, width: 1.00, shoulder: 1.00, torso: 1.00 },
  stocky: { height: 1.48, width: 1.22, shoulder: 1.18, torso: 1.22 },
  tall: { height: 1.76, width: 1.04, shoulder: 1.06, torso: 0.96 },
  short: { height: 1.38, width: 1.08, shoulder: 1.04, torso: 1.08 },
  athletic: { height: 1.66, width: 1.12, shoulder: 1.16, torso: 1.10 },
  elder: { height: 1.46, width: 0.94, shoulder: 0.92, torso: 1.04 },
});

const SKIN_TONES = Object.freeze([
  '#f3c9a7', '#dca57d', '#b87852', '#815035', '#5a3426',
]);

const HAIR_TONES = Object.freeze([
  '#1a1410', '#2a1c14', '#3a2414', '#4a3020', '#1c1210', '#5a3a22',
]);

const KIT_HEAD_SEG = RING_COUNTS.kitHead ?? 5;
const KIT_LIMB_SEG = RING_COUNTS.kitLimb ?? 5;
const KIT_HAIR_SEG = RING_COUNTS.kitHair ?? 4;
const KIT_JOINT_SEG = RING_COUNTS.kitJoint ?? 4;

function pick(list, key, salt) {
  const u = unitFrom(String(key), salt);
  return list[Math.floor(u * list.length) % list.length];
}

export function pickFigureKit(key, {
  pose = null, accessory = null, build = null, palette = null,
} = {}) {
  const kit = {
    build: build ?? pick(FIGURE_BUILDS, key, SALT.FIGURE + 1),
    accessory: accessory ?? pick(FIGURE_ACCESSORIES, `${key}|acc`, SALT.FIGURE + 2),
    pose: pose ?? pick(FIGURE_POSES, `${key}|pose`, SALT.FIGURE + 3),
    palette: palette ?? pick(FIGURE_PALETTES, `${key}|pal`, SALT.FIGURE + 4),
    skin: pick(SKIN_TONES, `${key}|skin`, SALT.FIGURE + 6),
    hair: pick(HAIR_TONES, `${key}|hair`, SALT.FIGURE + 7),
    garment: pick(FIGURE_GARMENTS, `${key}|gar`, SALT.FIGURE + 8),
  };
  if (!FIGURE_BUILDS.includes(kit.build)) kit.build = 'average';
  if (!FIGURE_ACCESSORIES.includes(kit.accessory)) kit.accessory = 'bag';
  if (!FIGURE_POSES.includes(kit.pose)) kit.pose = 'stand';
  if (!FIGURE_GARMENTS.includes(kit.garment)) kit.garment = 'coat';
  if (kit.accessory === 'hi-vis') kit.garment = 'vest';
  if (kit.build === 'child' && kit.garment === 'coat') kit.garment = 'shorts';
  return kit;
}

export function silhouetteKey(fig) {
  const pal = fig.palette?.id ?? fig.paletteId ?? fig.palette ?? '';
  const garment = fig.garment ?? '';
  return `${fig.build}|${fig.accessory}|${fig.pose}|${pal}|${garment}`;
}

export function clonePairsWithin(figures, radius = 12) {
  const pairs = [];
  const r2 = radius * radius;
  for (let i = 0; i < figures.length; i += 1) {
    const a = figures[i];
    const keyA = silhouetteKey(a);
    for (let j = i + 1; j < figures.length; j += 1) {
      const b = figures[j];
      const dx = (a.x ?? 0) - (b.x ?? 0);
      const dz = (a.z ?? 0) - (b.z ?? 0);
      if (dx * dx + dz * dz > r2) continue;
      if (keyA === silhouetteKey(b)) pairs.push([a.id ?? i, b.id ?? j]);
    }
  }
  return pairs;
}

/**
 * Greedy unique assignment: no two figures within `radius` metres share
 * (build, accessory, pose, palette). Pose stays locked when the caller set it.
 */
function applyKitChoice(fig, chosen) {
  fig.build = chosen.build;
  fig.accessory = chosen.accessory;
  fig.pose = chosen.pose;
  fig.palette = chosen.palette;
  fig.skin = chosen.skin;
  fig.hair = chosen.hair;
  fig.garment = chosen.garment;
  fig.paletteId = chosen.palette.id;
  const measure = BUILD_MEASURE[chosen.build] ?? BUILD_MEASURE.average;
  fig.height = measure.height;
  fig.width = measure.width;
  return fig;
}

/**
 * Beach/port pose names that predate the P1 kit. Walk/run become a stride;
 * a throw is a point; crouch/wade/carry keep a standing or sitting outline.
 */
export const PORT_POSE_MAP = Object.freeze({
  stand: 'stand',
  walk: 'stride',
  run: 'stride',
  sit: 'sit',
  lie: 'lie',
  lean: 'lean',
  point: 'point',
  stride: 'stride',
  crouch: 'sit',
  wade: 'stand',
  carry: 'stand',
  throw: 'point',
  fish: 'point',
  wave: 'wave',
  kneel: 'kneel',
});

export function mapPortFigurePose(pose) {
  if (FIGURE_POSES.includes(pose)) return pose;
  return PORT_POSE_MAP[pose] ?? 'stand';
}

export function assignUniqueKits(figures, radius = 12) {
  const r2 = radius * radius;
  for (let i = 0; i < figures.length; i += 1) {
    const fig = figures[i];
    const lockedPose = fig.pose;
    const lockedAcc = fig.accessoryLock ?? null;
    const lockedGarment = fig.garmentLock ?? null;
    let chosen = pickFigureKit(fig.id ?? `fig-${i}`, {
      pose: lockedPose,
      accessory: lockedAcc,
      build: fig.buildLock ?? null,
    });
    if (lockedPose) chosen.pose = lockedPose;
    if (lockedAcc) chosen.accessory = lockedAcc;
    if (lockedGarment) chosen.garment = lockedGarment;
    const neighbours = [];
    for (let j = 0; j < i; j += 1) {
      const other = figures[j];
      const dx = (fig.x ?? 0) - (other.x ?? 0);
      const dz = (fig.z ?? 0) - (other.z ?? 0);
      if (dx * dx + dz * dz <= r2) neighbours.push(silhouetteKey(other));
    }
    let guard = 0;
    while (neighbours.includes(silhouetteKey(chosen)) && guard < 64) {
      const acc = lockedAcc ?? FIGURE_ACCESSORIES[(guard + i) % FIGURE_ACCESSORIES.length];
      const build = FIGURE_BUILDS[(guard * 3 + i) % FIGURE_BUILDS.length];
      const pal = FIGURE_PALETTES[(guard * 5 + i) % FIGURE_PALETTES.length];
      const garment = lockedGarment ?? FIGURE_GARMENTS[(guard * 7 + i) % FIGURE_GARMENTS.length];
      chosen = {
        ...chosen,
        accessory: acc,
        build,
        palette: pal,
        garment,
      };
      guard += 1;
    }
    applyKitChoice(fig, chosen);
  }
  return figures;
}

/**
 * Assign one new figure against an already-built roster. Does not rewrite
 * neighbours — port-corner plants people as it walks the beach.
 */
export function assignUniqueKitFor(fig, existing = [], radius = 12) {
  const r2 = radius * radius;
  const lockedPose = fig.pose;
  const lockedAcc = fig.accessoryLock ?? null;
  const lockedGarment = fig.garmentLock ?? null;
  let chosen = pickFigureKit(fig.id ?? 'fig', {
    pose: lockedPose,
    accessory: lockedAcc,
    build: fig.buildLock ?? null,
    palette: fig.paletteLock ?? null,
  });
  if (lockedPose) chosen.pose = lockedPose;
  if (lockedAcc) chosen.accessory = lockedAcc;
  if (lockedGarment) chosen.garment = lockedGarment;
  if (fig.buildLock) chosen.build = fig.buildLock;
  if (fig.paletteLock) chosen.palette = fig.paletteLock;
  const neighbours = [];
  for (const other of existing) {
    const dx = (fig.x ?? 0) - (other.x ?? 0);
    const dz = (fig.z ?? 0) - (other.z ?? 0);
    if (dx * dx + dz * dz <= r2) neighbours.push(silhouetteKey(other));
  }
  let guard = 0;
  while (neighbours.includes(silhouetteKey(chosen)) && guard < 64) {
    const acc = lockedAcc ?? FIGURE_ACCESSORIES[(guard + 3) % FIGURE_ACCESSORIES.length];
    const build = fig.buildLock ?? FIGURE_BUILDS[(guard * 3 + 2) % FIGURE_BUILDS.length];
    const pal = fig.paletteLock ?? FIGURE_PALETTES[(guard * 5 + 4) % FIGURE_PALETTES.length];
    const garment = lockedGarment ?? FIGURE_GARMENTS[(guard * 7 + 1) % FIGURE_GARMENTS.length];
    chosen = { ...chosen, accessory: acc, build, palette: pal, garment };
    guard += 1;
  }
  return applyKitChoice(fig, chosen);
}

export function censusFigureSet(figures, { radius = 12 } = {}) {
  const keys = new Set(figures.map(silhouetteKey));
  const poses = Object.fromEntries(FIGURE_POSES.map((pose) => [
    pose, figures.filter((fig) => fig.pose === pose).length,
  ]));
  return {
    count: figures.length,
    uniqueSilhouettes: keys.size,
    clonePairs: clonePairsWithin(figures, radius).length,
    poses,
  };
}

/** Axis-aligned overlap in XZ. `onProp` sitters are not clips. */
export function clipCount(figures, props, { pad = 0.12 } = {}) {
  let hits = 0;
  for (const fig of figures) {
    if (fig.onProp) continue;
    const fw = (fig.width ?? 0.45) * 0.5 + pad;
    const fd = fw;
    for (const prop of props) {
      // Towels and umbrellas are seats; wrack/weed/drift is ground dressing.
      if (prop.kind === 'towel' || prop.kind === 'umbrella') continue;
      const pd0 = prop.depth ?? prop.width ?? 0.4;
      if (prop.kind === 'debris' && pd0 < 0.30) continue;
      const pw = (prop.width ?? 0.4) * 0.5;
      const pd = pd0 * 0.5;
      if (Math.abs((fig.x ?? 0) - (prop.x ?? 0)) < fw + pw
        && Math.abs((fig.z ?? 0) - (prop.z ?? 0)) < fd + pd) {
        hits += 1;
        break;
      }
    }
  }
  return hits;
}

/**
 * Face-side / shadow-side two-tone: a normal·light ramp, not a flat Lambert.
 * Injected at `<opaque_fragment>` the same way civic shade correction is.
 */
export function applyTwoToneRamp(material, {
  face = 1.0,
  shade = 0.66,
  key = new THREE.Vector3(0.35, 0.82, 0.44),
} = {}) {
  if (!material || material.userData.p17TwoTone) return material;
  material.userData.p17TwoTone = true;
  material.flatShading = false;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    if (previous) previous.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `{
    vec3 p17Nw = normalize(normal * mat3(viewMatrix));
    vec3 p17L = normalize(vec3(${key.x.toFixed(3)}, ${key.y.toFixed(3)}, ${key.z.toFixed(3)}));
    float ndl = clamp(dot(p17Nw, p17L), 0.0, 1.0);
    float ramp = mix(${shade.toFixed(3)}, ${face.toFixed(3)}, smoothstep(0.18, 0.78, ndl));
    outgoingLight *= ramp;
  }
  #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => {
    const base = previousKey ? previousKey.call(material) : '';
    return `${base}|p17-two-tone-v2`;
  };
  material.needsUpdate = true;
  return material;
}

export function createTwoToneMaterial(color, extra = {}) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: extra.roughness ?? 0.72,
    metalness: extra.metalness ?? 0.02,
    flatShading: false,
    ...extra,
  });
  applyTwoToneRamp(material);
  return material;
}

export function createContactDecal({
  radius = 0.38,
  alpha = FIGURE_CONTACT.alpha,
  scale = FIGURE_CONTACT.footprintScale,
  name = 'p17:figure-contact',
} = {}) {
  const geom = new THREE.CircleGeometry(radius * scale, 12);
  geom.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: '#3a2818',
    transparent: true,
    opacity: alpha,
    depthWrite: false,
  });
  mat.userData.waterFeather = {
    kind: 'radial-multiply-map',
    centre: 'dark',
    border: 'white',
  };
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = name;
  mesh.position.y = 0.012;
  // The transparent beach shelf renders at 3; contact must follow its colour.
  mesh.renderOrder = 4;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.p17Contact = { alpha, footprintScale: scale };
  mesh.userData.planRing = true;
  mesh.userData.ownsGeometry = true;
  return mesh;
}

function trisOf(geom) {
  return geometryTriangles(geom);
}

function addPart(parent, geom, mat, x, y, z, { name, rotX = 0, rotY = 0, rotZ = 0, scale = null, shadow = true } = {}) {
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rotX, rotY, rotZ);
  if (scale) mesh.scale.copy(scale);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  mesh.userData.ownsGeometry = true;
  mesh.userData.lodFamily = 'figure';
  mesh.userData.p17FigurePart = true;
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function cyl(rt, rb, h, segs = KIT_LIMB_SEG, open = true) {
  return new THREE.CylinderGeometry(rt, rb, h, segs, 1, open);
}

function sphere(r, w = KIT_JOINT_SEG, h = 3) {
  return new THREE.SphereGeometry(r, w, h);
}

function box(w, h, d) {
  return new THREE.BoxGeometry(w, h, d);
}

function hexLuma(hex) {
  const raw = String(hex ?? '#888888').replace('#', '');
  const n = parseInt(raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw, 16);
  if (!Number.isFinite(n)) return 0.4;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mulHex(hex, factor) {
  const raw = String(hex ?? '#888888').replace('#', '');
  const n = parseInt(raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw, 16);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) * factor);
  const g = clamp(((n >> 8) & 255) * factor);
  const b = clamp((n & 255) * factor);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function separateValueBands(skin, cloth, hair) {
  let s = skin;
  let c = cloth;
  let h = hair;
  if (hexLuma(h) > 0.18) h = mulHex(h, 0.5);
  if (hexLuma(c) < 0.30) c = mulHex(c, 1.65);
  if (hexLuma(c) > hexLuma(s) - 0.10) c = mulHex(c, 0.82);
  if (hexLuma(c) - hexLuma(h) < 0.12) h = mulHex(h, 0.45);
  return { skin: s, cloth: c, hair: h };
}

const STORY_PAIR_ROLES = new Set([
  'family-pram', 'couple-towels', 'workers-shed', 'dog-promenade',
  'fishers-pier', 'kiosk-queue',
]);

function pairToken(fig) {
  if (fig.pairId) return String(fig.pairId);
  if (fig.role && STORY_PAIR_ROLES.has(fig.role)) return `role:${fig.role}`;
  const id = String(fig.id ?? fig.name ?? '');
  const grouped = id.match(/port-corner:([a-z]+):(\d+)/i);
  if (grouped) return `${grouped[1]}:${grouped[2]}`;
  return null;
}

/** Figures closer than `radius` that are not a story pair / explicit pair. */
export function unpairedCloseCount(figures, radius = FIGURE_CLEARANCE_M) {
  const r2 = radius * radius;
  let hits = 0;
  for (let i = 0; i < figures.length; i += 1) {
    const a = figures[i];
    const tokenA = pairToken(a);
    for (let j = i + 1; j < figures.length; j += 1) {
      const b = figures[j];
      const tokenB = pairToken(b);
      if (tokenA && tokenB && tokenA === tokenB) continue;
      const dx = (a.x ?? 0) - (b.x ?? 0);
      const dz = (a.z ?? 0) - (b.z ?? 0);
      if (dx * dx + dz * dz < r2 && dx * dx + dz * dz > 1e-8) hits += 1;
    }
  }
  return hits;
}

/**
 * Push unpaired neighbours apart in XZ. Sitters on props stay put.
 * Mutates `fig.x` / `fig.z`. Caller moves the mesh.
 */
export function separateUnpairedFigures(figures, {
  radius = FIGURE_CLEARANCE_M, iterations = 24,
} = {}) {
  const target = radius * 1.05;
  const t2 = target * target;
  for (let n = 0; n < iterations; n += 1) {
    for (let i = 0; i < figures.length; i += 1) {
      const a = figures[i];
      const tokenA = pairToken(a);
      for (let j = i + 1; j < figures.length; j += 1) {
        const b = figures[j];
        const tokenB = pairToken(b);
        if (tokenA && tokenB && tokenA === tokenB) continue;
        const dx = (a.x ?? 0) - (b.x ?? 0);
        const dz = (a.z ?? 0) - (b.z ?? 0);
        const d2 = dx * dx + dz * dz;
        if (d2 >= t2 || d2 < 1e-10) continue;
        const d = Math.sqrt(d2);
        const push = (target - d) * 0.62;
        const nx = dx / d;
        const nz = dz / d;
        if (!a.onProp) {
          a.x = (a.x ?? 0) + nx * push;
          a.z = (a.z ?? 0) + nz * push;
        }
        if (!b.onProp) {
          b.x = (b.x ?? 0) - nx * push;
          b.z = (b.z ?? 0) - nz * push;
        }
      }
    }
  }
  return unpairedCloseCount(figures, radius);
}

/**
 * A posed, named figure. Body parts stay separate so military tests can find
 * `:head`, `:cap`, `:arm-l`. Rounded LOD0 (capsule torso/hips, shoulders, hair,
 * mitt hands, shoe feet, garment hem). Caller disposes via `p17Disposables`.
 */
export function createFigureGroup({
  build = 'average',
  pose = 'stand',
  accessory = 'none',
  palette = FIGURE_PALETTES[0],
  skin = '#e8c4a8',
  hair = '#2a1c14',
  garment = null,
  name = 'p17:figure',
  namePrefix = null,
  heightM = null,
  twoTone = true,
  materials = null,
} = {}) {
  const measure = BUILD_MEASURE[build] ?? BUILD_MEASURE.average;
  const stature = heightM ?? measure.height;
  const k = stature / 1.56;
  const w = measure.width;
  const sh = measure.shoulder;
  const torsoK = measure.torso;
  const pal = palette?.upper ? palette : FIGURE_PALETTES[0];
  let garmentKind = garment
    ?? (accessory === 'hi-vis' ? 'vest' : pick(FIGURE_GARMENTS, `${name}|gar`, SALT.FIGURE + 8));
  if (!FIGURE_GARMENTS.includes(garmentKind)) garmentKind = 'coat';
  if (accessory === 'hi-vis') garmentKind = 'vest';

  const bands = separateValueBands(skin, pal.upper, hair);
  const skinMat = materials?.skin ?? createTwoToneMaterial(bands.skin, { roughness: 0.78 });
  const upperMat = materials?.upper ?? createTwoToneMaterial(bands.cloth, { roughness: 0.74 });
  const lowerMat = materials?.lower ?? createTwoToneMaterial(pal.lower, { roughness: 0.82 });
  const shoeMat = materials?.shoe ?? createTwoToneMaterial('#241f1d', { roughness: 0.52, metalness: 0.03 });
  const propMat = materials?.prop ?? createTwoToneMaterial('#4a3a2c', { roughness: 0.66 });
  const capMat = materials?.cap ?? createTwoToneMaterial(pal.upper, { roughness: 0.62 });
  const hairMat = materials?.hair ?? createTwoToneMaterial(bands.hair, { roughness: 0.62 });
  const vestMat = accessory === 'hi-vis'
    ? (materials?.vest ?? createTwoToneMaterial('#e6d21a', {
      roughness: 0.58, emissive: '#c9d824', emissiveIntensity: 0.16,
    }))
    : upperMat;
  if (twoTone && !materials) {
    for (const mat of [skinMat, upperMat, lowerMat, shoeMat, propMat, capMat, hairMat, vestMat]) {
      applyTwoToneRamp(mat);
    }
  }

  const prefix = namePrefix ?? name;
  const nm = (part) => `${prefix}:${part}`;
  const group = new THREE.Group();
  group.name = name;
  const body = new THREE.Group();
  body.name = nm('body');
  group.add(body);

  const hipY = 0.84 * k;
  const stride = pose === 'stride';
  const sit = pose === 'sit';
  const lie = pose === 'lie';
  const lean = pose === 'lean';
  const point = pose === 'point';
  const wave = pose === 'wave';
  const kneel = pose === 'kneel';
  const dress = garmentKind === 'dress';
  const shorts = garmentKind === 'shorts';
  const coat = garmentKind === 'coat';
  const vest = garmentKind === 'vest';

  const plantedLeft = pose === 'stand' || point || wave || lean || kneel;
  const hipShift = (lie || sit) ? 0 : (plantedLeft ? -0.08 : 0.07) * w;
  const hipRoll = (lie || sit) ? 0 : (plantedLeft ? 0.16 : -0.12);
  const weightZ = stride ? 0 : (plantedLeft ? 0.045 : -0.03) * k;

  const legSpread = 0.132 * w;
  const strideZ = stride ? 0.16 * k : sit ? 0.22 * k : kneel ? 0.16 * k : weightZ;
  const strideY = stride ? 0.04 * k : 0;
  const sitDrop = sit ? 0.38 * k : kneel ? 0.22 * k : 0;
  const shinCloth = shorts ? skinMat : lowerMat;
  const thighCloth = dress ? upperMat : lowerMat;

  const shoeScale = new THREE.Vector3(1.45, 0.72, 1.90);
  addPart(body, sphere(0.075 * w, KIT_JOINT_SEG, 3), shoeMat,
    -legSpread + hipShift * 0.3, 0.042 * k, stride ? 0.10 * k : sit ? 0.20 * k : kneel ? 0.18 * k : 0.05 * k,
    { name: nm('boot-l'), scale: shoeScale });
  addPart(body, sphere(0.075 * w, KIT_JOINT_SEG, 3), shoeMat,
    legSpread + hipShift * 0.3, 0.042 * k + strideY, stride ? -0.12 * k : sit ? 0.20 * k : (plantedLeft ? -0.02 * k : 0.06 * k),
    { name: nm('boot-r'), scale: shoeScale });

  const shinH = 0.36 * k;
  const thighH = 0.38 * k;
  const thighR = 0.100 * w;
  const shinR = 0.082 * w;
  if (sit) {
    addPart(body, cyl(shinR * 0.88, shinR, shinH), shinCloth,
      -legSpread, 0.22 * k, 0.20 * k, { name: nm('leg-l') });
    addPart(body, cyl(shinR * 0.88, shinR, shinH), shinCloth,
      legSpread, 0.22 * k, 0.20 * k, { name: nm('leg-r') });
    addPart(body, cyl(thighR, thighR * 0.86, thighH), thighCloth,
      -legSpread, 0.42 * k, 0.08 * k, { name: nm('thigh-l'), rotX: Math.PI / 2 });
    addPart(body, cyl(thighR, thighR * 0.86, thighH), thighCloth,
      legSpread, 0.42 * k, 0.08 * k, { name: nm('thigh-r'), rotX: Math.PI / 2 });
  } else if (kneel) {
    addPart(body, cyl(shinR * 0.88, shinR, shinH), shinCloth,
      -legSpread, 0.14 * k, 0.20 * k, { name: nm('leg-l'), rotX: Math.PI / 2 });
    addPart(body, cyl(shinR * 0.88, shinR, shinH), shinCloth,
      legSpread, 0.26 * k, -0.02 * k, { name: nm('leg-r'), rotX: 0.12 });
    addPart(body, cyl(thighR, thighR * 0.86, thighH), thighCloth,
      -legSpread, 0.42 * k, 0.10 * k, { name: nm('thigh-l'), rotX: 0.85 });
    addPart(body, cyl(thighR, thighR * 0.86, thighH), thighCloth,
      legSpread, 0.58 * k, -0.02 * k, { name: nm('thigh-r'), rotX: 0.08 });
  } else {
    addPart(body, cyl(shinR * 0.88, shinR, shinH), shinCloth,
      -legSpread + hipShift, 0.26 * k, strideZ * 0.5,
      { name: nm('leg-l'), rotX: stride ? 0.22 : lean ? 0.12 : (plantedLeft ? 0.04 : 0.18) });
    addPart(body, cyl(shinR * 0.88, shinR, shinH), shinCloth,
      legSpread + hipShift, 0.26 * k + strideY, -strideZ * 0.55,
      { name: nm('leg-r'), rotX: stride ? -0.18 : (plantedLeft ? 0.16 : 0.04) });
    addPart(body, cyl(thighR, thighR * 0.86, thighH), thighCloth,
      -legSpread + hipShift, 0.62 * k - sitDrop, strideZ * 0.25,
      { name: nm('thigh-l'), rotX: stride ? 0.28 : (plantedLeft ? 0.05 : 0.14) });
    addPart(body, cyl(thighR, thighR * 0.86, thighH), thighCloth,
      legSpread + hipShift, 0.62 * k - sitDrop + strideY, -strideZ * 0.28,
      { name: nm('thigh-r'), rotX: stride ? -0.22 : (plantedLeft ? 0.18 : 0.04) });
  }

  addPart(body, sphere(0.185 * w * torsoK, KIT_JOINT_SEG, 3), lowerMat,
    hipShift, hipY - sitDrop, sit ? 0.02 * k : 0,
    { name: nm('pelvis'), scale: new THREE.Vector3(1.32, 0.82, 1.08) });

  const torsoH = 0.42 * k * torsoK;
  const torsoY = hipY + 0.26 * k - sitDrop;
  addPart(body, cyl(0.175 * w * sh, 0.145 * w * torsoK, torsoH, KIT_LIMB_SEG, false), upperMat,
    hipShift, torsoY, 0, { name: nm('torso'), rotZ: (lean ? 0.18 : 0) + hipRoll * 0.4 });

  const shoulderY = torsoY + torsoH * 0.42;
  const armOut = 0.228 * w * sh;
  const upperArmH = 0.26 * k;
  const forearmH = 0.24 * k;
  const armR = 0.070 * w;
  const armSwing = stride ? 0.55 : point ? 0 : wave ? 0.2 : lean ? 0.12 : 0;
  const pointLift = point ? -1.15 : 0;
  const waveLift = wave ? -2.05 : 0;

  addPart(body, sphere(0.095 * w * sh, KIT_JOINT_SEG, 3), upperMat,
    -armOut + hipShift, shoulderY, 0.01 * k, { name: nm('shoulder-l') });
  addPart(body, sphere(0.095 * w * sh, KIT_JOINT_SEG, 3), upperMat,
    armOut + hipShift, shoulderY, 0.01 * k, { name: nm('shoulder-r') });

  addPart(body, cyl(armR * 0.88, armR, upperArmH), upperMat,
    -armOut + hipShift, shoulderY - 0.06 * k, stride ? 0.06 * k : 0,
    { name: nm('arm-l'), rotZ: -0.28 + (lean ? 0.4 : 0), rotX: armSwing + waveLift });
  addPart(body, cyl(armR * 0.78, armR * 0.9, forearmH), skinMat,
    -armOut - 0.02 * w + hipShift, shoulderY - (wave ? -0.04 * k : 0.28 * k), stride ? 0.12 * k : (wave ? 0.10 * k : 0),
    { name: nm('forearm-l'), rotZ: -0.12, rotX: armSwing * 0.6 + waveLift * 0.55 });
  addPart(body, cyl(armR * 0.88, armR, upperArmH), upperMat,
    armOut + hipShift, shoulderY - 0.06 * k, stride ? -0.06 * k : 0,
    { name: nm('arm-r'), rotZ: 0.28 + pointLift * 0.15, rotX: -armSwing + pointLift });
  addPart(body, cyl(armR * 0.78, armR * 0.9, forearmH), skinMat,
    armOut + 0.02 * w + hipShift, shoulderY - (point ? -0.02 * k : 0.28 * k),
    stride ? -0.12 * k : (point ? 0.18 * k : 0),
    { name: nm('forearm-r'), rotZ: 0.12, rotX: -armSwing * 0.6 + pointLift });

  const mittScale = new THREE.Vector3(1.25, 0.72, 1.45);
  addPart(body, sphere(0.058 * w, KIT_JOINT_SEG, 3), skinMat,
    -armOut - 0.03 * w + hipShift, shoulderY - (wave ? -0.18 * k : 0.48 * k),
    stride ? 0.16 * k : (wave ? 0.12 * k : 0.02 * k),
    { name: nm('hand-l'), scale: mittScale });
  addPart(body, sphere(0.058 * w, KIT_JOINT_SEG, 3), skinMat,
    armOut + 0.03 * w + hipShift, shoulderY - (point ? -0.18 * k : 0.48 * k),
    stride ? -0.16 * k : (point ? 0.28 * k : 0.02 * k),
    { name: nm('hand-r'), scale: mittScale });

  const neckH = 0.08 * k;
  const neckY = torsoY + torsoH * 0.52 + neckH * 0.45;
  addPart(body, cyl(0.055 * w, 0.062 * w, neckH, KIT_LIMB_SEG, false), skinMat,
    hipShift, neckY, 0.01 * k, { name: nm('neck') });
  const headR = 0.138 * k * (build === 'child' ? 1.14 : 1);
  const headY = neckY + neckH * 0.7 + headR * 0.68;
  addPart(body, new THREE.SphereGeometry(headR, KIT_HEAD_SEG, 3), skinMat,
    hipShift, headY, 0.02 * k, { name: nm('head') });
  addPart(body, new THREE.SphereGeometry(headR * 1.14, KIT_HAIR_SEG, 3, 0, Math.PI * 2, 0, Math.PI * 0.74), hairMat,
    hipShift, headY + headR * 0.22, -0.012 * k, { name: nm('hair') });

  const headTop = headY + headR * 0.92;

  if (coat) {
    addPart(body, cyl(0.22 * w * sh, 0.158 * w * torsoK, 0.46 * k, KIT_LIMB_SEG, true), upperMat,
      hipShift, hipY - 0.02 * k - sitDrop, 0.015 * k, { name: nm('garment') });
  } else if (dress) {
    addPart(body, cyl(0.26 * w, 0.14 * w * torsoK, 0.56 * k, KIT_LIMB_SEG, true), upperMat,
      hipShift, hipY - 0.10 * k - sitDrop, 0.015 * k, { name: nm('garment') });
  } else if (vest) {
    addPart(body, cyl(0.188 * w * sh, 0.158 * w * torsoK, 0.30 * k, KIT_LIMB_SEG, true), vestMat,
      hipShift, torsoY + 0.01 * k, 0.02 * k, { name: nm('garment') });
  } else if (shorts) {
    addPart(body, cyl(0.175 * w, 0.145 * w, 0.20 * k, KIT_LIMB_SEG, true), lowerMat,
      hipShift, hipY - 0.06 * k - sitDrop, 0.015 * k, { name: nm('garment') });
  }

  if (accessory === 'hat' || accessory === 'cap' || accessory === 'hard-hat') {
    const capH = accessory === 'hard-hat' ? 0.09 * k : 0.06 * k;
    const capR = accessory === 'hat' ? 0.12 * k : accessory === 'hard-hat' ? 0.12 * k : 0.108 * k;
    addPart(body, cyl(capR * 0.92, capR, capH, 4, false),
      accessory === 'hard-hat' ? createTwoToneMaterial('#ffcc00', { roughness: 0.48 }) : capMat,
      hipShift, headTop - 0.01 * k, 0.01 * k, { name: nm('cap') });
    if (accessory !== 'cap') {
      addPart(body, cyl(capR * (accessory === 'hat' ? 1.55 : 1.35), capR * 1.05, 0.02 * k, 4, true),
        accessory === 'hard-hat' ? createTwoToneMaterial('#ffcc00', { roughness: 0.48 }) : capMat,
        hipShift, headTop - capH * 0.4, 0.04 * k, { name: nm('brim') });
    }
  }

  if (accessory === 'bag' || accessory === 'briefcase') {
    const bw = accessory === 'briefcase' ? 0.18 * k : 0.16 * k;
    const bh = accessory === 'briefcase' ? 0.14 * k : 0.22 * k;
    const bd = accessory === 'briefcase' ? 0.05 * k : 0.08 * k;
    addPart(body, box(bw, bh, bd), propMat,
      0.22 * w + hipShift, hipY + 0.08 * k - sitDrop, 0.02 * k, { name: nm('bag') });
  }
  if (accessory === 'backpack') {
    addPart(body, box(0.22 * w, 0.26 * k, 0.10 * k), propMat,
      hipShift, torsoY, -0.14 * k, { name: nm('backpack') });
  }
  if (accessory === 'umbrella') {
    addPart(body, cyl(0.012 * k, 0.012 * k, 0.95 * k, 4, true), propMat,
      0.24 * w, 0.55 * k, 0.04 * k, { name: nm('umbrella-stem') });
    addPart(body, cyl(0.18 * k, 0.02 * k, 0.08 * k, 4, false), capMat,
      0.24 * w, 1.05 * k, 0.04 * k, { name: nm('umbrella-canopy') });
  }
  if (accessory === 'surfboard') {
    addPart(body, box(0.14 * k, 0.06 * k, 1.15 * k), createTwoToneMaterial('#f2e4c8', { roughness: 0.7 }),
      0.28 * w, 0.72 * k, 0.08 * k, { name: nm('surfboard'), rotZ: 0.15 });
  }
  if (accessory === 'towel-roll') {
    addPart(body, cyl(0.07 * k, 0.07 * k, 0.32 * k, 6, false), capMat,
      0.22 * w, shoulderY, -0.04 * k, { name: nm('towel-roll'), rotZ: Math.PI / 2 });
  }
  if (accessory === 'pram') {
    addPart(body, box(0.42 * k, 0.28 * k, 0.62 * k), propMat,
      0, 0.34 * k, 0.42 * k, { name: nm('pram') });
    addPart(body, cyl(0.012 * k, 0.012 * k, 0.55 * k, KIT_LIMB_SEG, false), propMat,
      0, 0.62 * k, 0.12 * k, { name: nm('pram-handle'), rotX: 0.7 });
  }
  if (accessory === 'dog') {
    addPart(body, sphere(0.13 * k, 4, 3), propMat, 0.42 * w, 0.28 * k, 0.18 * k,
      { name: nm('dog-body'), scale: new THREE.Vector3(1.35, 0.85, 1.8) });
    addPart(body, sphere(0.07 * k, 3, 2), propMat, 0.42 * w, 0.36 * k, 0.32 * k, { name: nm('dog-head') });
  }

  const contact = createContactDecal({
    radius: 0.32 * w,
    name: nm('contact'),
  });
  contact.userData.lodFamily = 'figure';
  contact.userData.p17FigureKeep = true;
  group.add(contact);

  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(0.72 * w, 1.58 * k),
    new THREE.MeshStandardMaterial({
      color: bands.cloth, roughness: 0.86, metalness: 0.03, side: THREE.DoubleSide,
    }),
  );
  card.name = nm('lod-card');
  card.position.set(0, 0.79 * k, 0);
  card.visible = false;
  card.castShadow = true;
  card.receiveShadow = false;
  card.userData.lodFamily = 'figure';
  card.userData.p17FigureCard = true;
  card.userData.ownsGeometry = true;
  group.add(card);

  const midMat = upperMat;
  const mid = new THREE.Group();
  mid.name = nm('lod-mid');
  const midHead = new THREE.Mesh(new THREE.SphereGeometry(headR, 4, 3), skinMat);
  midHead.position.set(hipShift, headY, 0.02 * k);
  const midTorso = new THREE.Mesh(cyl(0.18 * w * sh, 0.14 * w * torsoK, torsoH + 0.20 * k, 4, false), midMat);
  midTorso.position.set(hipShift, torsoY - 0.04 * k, 0);
  const midLegL = new THREE.Mesh(cyl(0.08 * w, 0.09 * w, 0.70 * k, 4, true), lowerMat);
  midLegL.position.set(-legSpread * 0.8 + hipShift, 0.40 * k, 0.02 * k);
  const midLegR = new THREE.Mesh(cyl(0.08 * w, 0.09 * w, 0.70 * k, 4, true), lowerMat);
  midLegR.position.set(legSpread * 0.8 + hipShift, 0.40 * k, -0.02 * k);
  for (const mesh of [midHead, midTorso, midLegL, midLegR]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    mesh.userData.lodFamily = 'figure';
    mesh.userData.p17FigureMid = true;
    mesh.userData.ownsGeometry = true;
    mid.add(mesh);
  }
  group.add(mid);

  if (lie) {
    body.rotation.x = -Math.PI / 2;
    body.position.y = 0.18 * k;
    body.position.z = 0.15 * k;
    contact.scale.set(1.6, 1, 0.7);
  } else if (sit || kneel) {
    contact.scale.set(1.15, 1, 1.25);
    body.position.x = hipShift * 0.4;
  } else {
    body.position.x = hipShift * 0.25;
    body.rotation.z = hipRoll * 0.35;
  }

  const tris = figureTriangleCount(group);
  const lod1Tris = figureLod1TriangleCount(group);
  group.userData.p17Figure = {
    build, pose, accessory, palette: pal.id, garment: garmentKind,
    triangles: tris, lod1Triangles: lod1Tris, stature,
    lod0Max: FIGURE_TRI_CEILING, lod1Max: FIGURE_TRI_LOD1_CEILING,
  };
  group.userData.lodFamily = 'figure';
  group.userData.p17Disposables = [];
  group.traverse((ch) => {
    if (ch.isMesh) {
      if (ch.geometry) group.userData.p17Disposables.push(ch.geometry);
      if (ch.material && !materials) group.userData.p17Disposables.push(ch.material);
    }
  });
  return group;
}

export function figureTriangleCount(root) {
  let n = 0;
  root.traverse((ch) => {
    if (!ch.isMesh || !ch.geometry) return;
    if (ch.userData?.p17FigureCard || ch.userData?.p17FigureMid || ch.userData?.p17FigureKeep) return;
    const name = String(ch.name);
    if (name.includes('contact') || name.includes('lod-card') || name.includes('lod-mid')) return;
    n += trisOf(ch.geometry);
  });
  return n;
}

export function figureLod1TriangleCount(root) {
  let n = 0;
  root.traverse((ch) => {
    if (!ch.isMesh || !ch.geometry) return;
    if (!ch.userData?.p17FigureMid) return;
    n += trisOf(ch.geometry);
  });
  return n;
}

export function disposeFigureGroup(group) {
  for (const item of group?.userData?.p17Disposables ?? []) item.dispose?.();
}

export { hash32, unitFrom, BUILD_MEASURE };
