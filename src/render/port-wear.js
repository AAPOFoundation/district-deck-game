// P16-PM12 / PM13 — seeded port wear library. Sparse, geometry-driven rust /
// salt / oil / tyre / grime. Lazy like TextureLibrary, cached ≤ 256². No Math.random.

import * as THREE from 'three';
import { hashSeed, makeRng } from './textures.js';

export const PM12_WEAR = Object.freeze({
  size: 256,
  phases: 8,
  containerPhases: 6,
  logos: 6,
  baseBandM: 0.4,
  saltBandM: 0.6,
  harbourY: 0.17,
  apronY: 0.34,
  // PM13: pose-scale marks stay world-metre, but sparse and geometry-driven.
  // Fine grain only on the clean remainder. No 11.5 m mottle, no 2.4×1.8 m panels.
  streakWidthM: 0.22,
  stainMinM: 1.15,
  jointWidthM: 0.14,
  tyreWidthM: 0.18,
  panelWM: 0,
  panelHM: 0,
  fixingPitchM: 1.7,
  mottleRepeatM: 0.42,
  baseBandMul: 0.82,
  maxLumaDev: 25,
  maxBlobThinM: 0.6,
  maxBytes: 12 * 1024 * 1024,
  paintedEnvMax: 0.6,
  ranges: Object.freeze({
    'painted-steel': Object.freeze({ roughMin: 0.45, roughMax: 0.75 }),
    galvanised: Object.freeze({ roughMin: 0.38, roughMax: 0.62 }),
    concrete: Object.freeze({ roughMin: 0.82, roughMax: 0.98 }),
    timber: Object.freeze({ roughMin: 0.72, roughMax: 0.94 }),
    rubber: Object.freeze({ roughMin: 0.86, roughMax: 0.98 }),
    container: Object.freeze({ roughMin: 0.48, roughMax: 0.82 }),
  }),
});

const CLASS_LIST = Object.freeze(Object.keys(PM12_WEAR.ranges));

export const PM13_WEAR = Object.freeze({
  coverageMax: 0.15,
  oilMax: 0.06,
  grimeMax: 0.08,
  tyreMax: 0.05,
  saltMax: 0.04,
  causeRadiusM: 1.5,
  causeMinFrac: 0.70,
  maxLumaDev: 25,
  maxBlobThinM: 0.6,
  grainRepeatM: 0.42,
});

const PORT_CLASS_KEYS = Object.freeze({
  'painted-steel': Object.freeze([
    'yellow', 'yellowDark', 'yellowPale', 'gantryBleach', 'gantryGrime', 'gantryHazard',
    'white', 'cream', 'orange', 'tank', 'tankWeld', 'tankBand',
    'cladWhite', 'cladBlue', 'cladRed', 'cladBay0', 'cladBay1', 'cladBay2', 'cladGrime',
    'plateWhite', 'plateCream', 'plateRed', 'plateBlue', 'paintedSteel', 'hiVis',
    'redBoot', 'blueHull', 'blackHull', 'tankerHull', 'navyHull', 'spiritBlue',
    'lifeboat', 'armGloss', 'canopyRed', 'canopyWhite', 'hardhat', 'rollerRust',
    'hazard', 'rust', 'rustDark', 'soot', 'bootWet', 'waterlineStrake',
  ]),
  galvanised: Object.freeze([
    'steel', 'steelDark', 'steelPale', 'steelWork', 'galvanised',
    'grey', 'greyDark', 'greyLight', 'hullGrey', 'hullGreyDark', 'hullSteel',
  ]),
  concrete: Object.freeze([
    'concrete', 'concreteDark', 'concreteWet', 'concreteWork', 'concreteAgg',
    'cope', 'apronWear', 'apronDark', 'apronMid', 'brick', 'ballast',
    'rockDry', 'rockWet', 'armourMoss',
  ]),
  timber: Object.freeze(['promenade', 'promenadeRail', 'pile', 'pileWet']),
  rubber: Object.freeze(['rubber', 'beltPale', 'grease']),
});

const YARD_CLASS_KEYS = Object.freeze({
  'painted-steel': Object.freeze([
    'plate', 'super', 'boot', 'boot2', 'buntA', 'buntB', 'buntC', 'navy',
    'funnel', 'deck', 'wetBand', 'wetDeep', 'wet',
  ]),
  galvanised: Object.freeze(['frame', 'rail', 'keel', 'chain', 'strake', 'railSubmerged', 'seam']),
  timber: Object.freeze(['timber', 'block', 'hardwood', 'shoreTimber']),
  rubber: Object.freeze(['tyre', 'grease']),
});

function clampByte(v) {
  return Math.max(0, Math.min(255, v | 0));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smooth01(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function hash2(ix, iy, salt) {
  let h = Math.imul(ix * 374761393 + iy * 668265263, 1274126177) ^ (salt >>> 0);
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h >>> 8) / 16777216;
}

function lattice(u, v, freq, salt) {
  const x = u * freq;
  const y = v * freq;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const w = (i, j) => hash2(x0 + i, y0 + j, salt);
  const a = w(0, 0) + (w(1, 0) - w(0, 0)) * sx;
  const b = w(0, 1) + (w(1, 1) - w(0, 1)) * sx;
  return a + (b - a) * sy;
}

function makeRgbaTexture(data, size, {
  colorSpace = THREE.NoColorSpace,
  wrap = THREE.RepeatWrapping,
  srgb = false,
} = {}) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : colorSpace;
  tex.wrapS = wrap;
  tex.wrapT = wrap;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.flipY = false;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  tex.userData.procedural = true;
  tex.userData.pm12Wear = true;
  tex.userData.byteLength = data.length;
  return tex;
}

/**
 * RGB = albedo multiply (rust / salt / oil / tyre / grime). A = roughness 0–1
 * used to span each class's authored range. Seeded, no Math.random.
 */
export function generatePortWearAlbedo(size = PM12_WEAR.size, seed = hashSeed('pm12-port-wear-albedo')) {
  const n = size * size;
  const data = new Uint8ClampedArray(n * 4);
  const rng = makeRng(seed);
  const fixings = Array.from({ length: 7 }, () => ({
    u: rng(),
    width: 0.010 + rng() * 0.016,
    length: 0.28 + rng() * 0.32,
    rust: 0.35 + rng() * 0.30,
  }));
  const oils = Array.from({ length: 4 }, () => ({
    u: rng(),
    v: rng(),
    r: 0.035 + rng() * 0.045,
    dark: 0.28 + rng() * 0.22,
  }));
  const tyreRows = [0.31 + rng() * 0.03, 0.68 + rng() * 0.03];

  for (let y = 0; y < size; y += 1) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const n1 = lattice(u, v, 28, seed);
      const n2 = lattice(u * 2.2, v * 2.2, 48, seed ^ 0x9e3779b1);
      const n3 = lattice(u * 5.1, v * 5.1, 36, seed ^ 0x85ebca6b);

      // Fine material grain only — the 11.5 m splotch lived here.
      let r = 0.97 + (n1 - 0.5) * 0.05;
      let g = 0.97 + (n1 - 0.5) * 0.045;
      let b = 0.97 + (n1 - 0.5) * 0.04;

      let streak = 0;
      for (const f of fixings) {
        const across = Math.abs(((u - f.u + 1.5) % 1) - 0.5) * 2 / (f.width * 8);
        const down = v / f.length;
        if (down > 1) continue;
        streak = Math.max(streak, Math.exp(-(across * across) * 3.2) * (1 - down * 0.45) * f.rust);
      }
      r = lerp(r, 0.62, streak * 0.28);
      g = lerp(g, 0.42, streak * 0.28);
      b = lerp(b, 0.28, streak * 0.28);

      const salt = v < 0.10 && n3 > 0.84 ? (0.22 + n1 * 0.18) * (1 - v / 0.10) : 0;
      r = lerp(r, 0.90, salt * 0.18);
      g = lerp(g, 0.92, salt * 0.18);
      b = lerp(b, 0.94, salt * 0.20);

      let oil = 0;
      for (const blob of oils) {
        const dx = (u - blob.u) * 1.4;
        const dy = (v - blob.v);
        oil = Math.max(oil, Math.exp(-(dx * dx + dy * dy) / (blob.r * blob.r)) * blob.dark);
      }
      r *= 1 - oil * 0.22;
      g *= 1 - oil * 0.20;
      b *= 1 - oil * 0.16;

      let tyre = 0;
      for (const row of tyreRows) {
        tyre = Math.max(tyre, Math.exp(-(((v - row) / 0.018) ** 2)) * (0.35 + n3 * 0.2));
      }
      r *= 1 - tyre * 0.16;
      g *= 1 - tyre * 0.14;
      b *= 1 - tyre * 0.12;

      const jointU = 1 - smooth01(Math.abs(((u * 6) % 1) - 0.5) / 0.028);
      const jointV = 1 - smooth01(Math.abs(((v * 5) % 1) - 0.5) / 0.028);
      const joints = Math.max(jointU, jointV) * (0.18 + n2 * 0.12);
      r *= 1 - joints * 0.14;
      g *= 1 - joints * 0.13;
      b *= 1 - joints * 0.11;

      const edgeU = Math.min(u, 1 - u);
      const edgeV = Math.min(v, 1 - v);
      const corner = (1 - smooth01(edgeU / 0.03)) * (1 - smooth01(edgeV / 0.03));
      const grime = corner * (0.22 + n2 * 0.18);
      r *= 1 - grime * 0.16;
      g *= 1 - grime * 0.14;
      b *= 1 - grime * 0.12;

      r = Math.max(0, Math.min(1, r));
      g = Math.max(0, Math.min(1, g));
      b = Math.max(0, Math.min(1, b));

      const rough = 0.12 + n2 * 0.76 + streak * 0.10 + oil * 0.06 + tyre * 0.04 + joints * 0.05;
      const i = (y * size + x) * 4;
      data[i] = clampByte(r * 255);
      data[i + 1] = clampByte(g * 255);
      data[i + 2] = clampByte(b * 255);
      data[i + 3] = clampByte(Math.max(0, Math.min(1, rough)) * 255);
    }
  }
  return data;
}

/** R = bare-steel chip/edge mask. Metalness only where paint has broken. */
export function generatePortWearMetal(size = PM12_WEAR.size, seed = hashSeed('pm12-port-wear-metal')) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const n = lattice(u * 4.2, v * 4.2, 24, seed);
      const edgeU = Math.min(u, 1 - u);
      const rim = 1 - smooth01(edgeU / 0.045);
      const chip = n > 0.78 ? (n - 0.78) / 0.22 : 0;
      const m = Math.max(rim * 0.85, chip);
      const i = (y * size + x) * 4;
      const b = clampByte(m * 255);
      data[i] = b;
      data[i + 1] = b;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

function drawStar(setPx, cx, cy, r, points, color) {
  const inner = r * 0.42;
  for (let y = cy - r; y <= cy + r; y += 1) {
    for (let x = cx - r; x <= cx + r; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const ang = Math.atan2(dy, dx);
      const spin = ((ang + Math.PI) / (Math.PI * 2)) * points;
      const f = spin - Math.floor(spin);
      const rad = lerp(r, inner, Math.abs(f - 0.5) * 2);
      if (dx * dx + dy * dy <= rad * rad) setPx(x, y, color, 220);
    }
  }
}

function fillRectAlpha(setPx, x0, y0, w, h, color, a) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) setPx(x, y, color, a);
  }
}

function fillCircle(setPx, cx, cy, r, color, a) {
  for (let y = cy - r; y <= cy + r; y += 1) {
    for (let x = cx - r; x <= cx + r; x += 1) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) setPx(x, y, color, a);
    }
  }
}

/** Six owner marks in a 3×2 atlas. White paper is transparent. */
export function generatePortLogoAtlas(size = PM12_WEAR.size, seed = hashSeed('pm12-port-logo-family')) {
  const data = new Uint8ClampedArray(size * size * 4);
  const cols = 3;
  const rows = 2;
  const tw = Math.floor(size / cols);
  const th = Math.floor(size / rows);
  const rng = makeRng(seed);
  const palettes = [
    [0x00, 0x51, 0x9b],
    [0xc8, 0x10, 0x2e],
    [0x0a, 0x6b, 0x3c],
    [0xf0, 0xa0, 0x00],
    [0x1a, 0x1a, 0x2a],
    [0x2a, 0x6a, 0x9a],
  ];
  const setPx = (x, y, rgb, a) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = a;
  };

  for (let id = 0; id < PM12_WEAR.logos; id += 1) {
    const col = id % cols;
    const row = Math.floor(id / cols);
    const ox = col * tw;
    const oy = row * th;
    const cx = ox + (tw >> 1);
    const cy = oy + (th >> 1);
    const rgb = palettes[id];
    const jitter = (rng() - 0.5) * 4;
    if (id === 0) {
      drawStar(setPx, cx, cy + jitter, Math.floor(tw * 0.32), 7, rgb);
    } else if (id === 1) {
      for (let k = 0; k < 3; k += 1) {
        fillRectAlpha(setPx, cx - 18 + k * 14, cy - 22, 8, 44, rgb, 230);
      }
    } else if (id === 2) {
      for (let y = -22; y <= 22; y += 1) {
        const w = 22 - Math.abs(y);
        fillRectAlpha(setPx, cx - w, cy + y, w * 2, 1, rgb, 220);
      }
    } else if (id === 3) {
      fillCircle(setPx, cx, cy, 24, rgb, 230);
      fillCircle(setPx, cx, cy, 12, [245, 240, 230], 0);
      fillRectAlpha(setPx, cx - 4, cy - 20, 8, 40, rgb, 230);
      fillRectAlpha(setPx, cx - 20, cy - 4, 40, 8, rgb, 230);
    } else if (id === 4) {
      for (let k = 0; k < 3; k += 1) {
        const y = cy - 16 + k * 12;
        for (let x = -18; x <= 18; x += 1) {
          if (x + 18 > k * 6) setPx(cx + x, y, rgb, 220);
          if (x + 18 > k * 6) setPx(cx + x, y + 1, rgb, 220);
        }
      }
    } else {
      fillRectAlpha(setPx, cx - 20, cy - 16, 40, 32, rgb, 230);
      fillRectAlpha(setPx, cx - 14, cy - 8, 28, 16, [245, 240, 230], 0);
    }
  }
  return data;
}

export class PortWearLibrary {
  constructor() {
    this._maps = new Map();
    this._bytes = 0;
    this._disposed = false;
  }

  _put(id, data, size, opts) {
    if (this._maps.has(id)) return this._maps.get(id);
    const tex = makeRgbaTexture(data, size, opts);
    tex.name = `dd-port-wear:${id}`;
    this._maps.set(id, tex);
    this._bytes += data.length;
    return tex;
  }

  get albedo() {
    if (this._disposed) throw new Error('PortWearLibrary disposed');
    if (this._maps.has('albedo')) return this._maps.get('albedo');
    return this._put('albedo', generatePortWearAlbedo(), PM12_WEAR.size);
  }

  get metal() {
    if (this._disposed) throw new Error('PortWearLibrary disposed');
    if (this._maps.has('metal')) return this._maps.get('metal');
    return this._put('metal', generatePortWearMetal(), PM12_WEAR.size);
  }

  get logos() {
    if (this._disposed) throw new Error('PortWearLibrary disposed');
    if (this._maps.has('logos')) return this._maps.get('logos');
    return this._put('logos', generatePortLogoAtlas(), PM12_WEAR.size, { srgb: true, wrap: THREE.ClampToEdgeWrapping });
  }

  byteLength() {
    this.albedo;
    this.metal;
    this.logos;
    return this._bytes;
  }

  mapCount() {
    this.byteLength();
    return this._maps.size;
  }

  maxDimension() {
    let max = 0;
    for (const tex of this._maps.values()) {
      max = Math.max(max, tex.image.width, tex.image.height);
    }
    return max;
  }

  dispose() {
    for (const tex of this._maps.values()) tex.dispose();
    this._maps.clear();
    this._bytes = 0;
    this._disposed = true;
  }
}

let _lib = null;
export function getPortWearLibrary() {
  if (!_lib || _lib._disposed) _lib = new PortWearLibrary();
  return _lib;
}

export function resetPortWearLibrary() {
  if (_lib) _lib.dispose();
  _lib = null;
}

const KLASS_ID = Object.freeze({
  'painted-steel': 0,
  galvanised: 1,
  concrete: 2,
  timber: 3,
  rubber: 4,
  container: 5,
  signage: 6,
});

const DRESS_SKIP = new Set([
  'tex', 'glass', 'roofGlass', 'lamp', 'beacon', 'harbourWater', 'pool',
  'spiritStripe', 'amberLamp', 'workerGreen', 'workerOrange', 'workerLime',
  'workerBlue', 'coverall', 'vestOrange', 'vestLime', 'vestMagenta',
  'hatWhite', 'hatRed', 'reflectSeam', 'spoilPlume', 'tussock', 'seaweed',
  'shell', 'skins', 'togs', 'hair', 'spark', 'foam', 'foamWet', 'window',
  'skin', 'vest', 'spray', 'shadow', 'signLetter', 'letterWhite', 'letter',
  'promenadePlankMap',
  'timberGrainRough', 'chopPale', 'chopDark', 'waterFilm',
]);

const SIGNAGE_NAME = /port-name|port-letters|name-plate|nameplate|signboard|sign-letter/;

function klassFlags(klass) {
  if (klass === 'signage') {
    return {
      lattice: 0, logo: 0, metalEdges: 0, salt: 0, tyre: 0, keepRough: 0, id: 6,
    };
  }
  return {
    lattice: klass === 'container' ? 1 : 0,
    logo: klass === 'container' ? 1 : 0,
    metalEdges: klass === 'painted-steel' || klass === 'galvanised' || klass === 'container' ? 1 : 0,
    salt: klass === 'painted-steel' || klass === 'galvanised' || klass === 'timber' || klass === 'container' ? 1 : 0,
    tyre: klass === 'concrete' ? 1 : 0,
    keepRough: 0,
    id: KLASS_ID[klass] ?? 0,
  };
}

function inferKlass(key, material) {
  const k = String(key || '').toLowerCase();
  if (SIGNAGE_NAME.test(k) || /letter/.test(k)) return 'signage';
  if (/container/.test(k)) return 'container';
  if (/apron|concrete|cope|brick|ballast|rock|armour/.test(k)) return 'concrete';
  if (/belt|rubber|tyre|grease/.test(k)) return 'rubber';
  if (/promenade|pile|timber|plank|sleeper/.test(k)) return 'timber';
  if (/steel|grey|galvan|rail|frame|hullsteel/.test(k)) return 'galvanised';
  if ((material?.metalness ?? 0) >= 0.4) return 'galvanised';
  if ((material?.roughness ?? 0.5) >= 0.88 && (material?.metalness ?? 0) <= 0.08) return 'concrete';
  return 'painted-steel';
}

/**
 * World-metre wear: rust/oil/grime from the atlas, a 0.4 m contact band at
 * every foot, a 0.6 m salt bloom above the harbour datum, roughness spanning
 * the class range, metalness only on paint chips. Adjacent origins take
 * different phases so no two neighbours share a wear field.
 */
export function applyPortWear(material, {
  klass = 'painted-steel',
  keepRoughnessMap = false,
} = {}) {
  if (!material?.isMeshStandardMaterial) return material;
  if (material.userData.portWear) return material;
  if (material.transparent && (material.opacity ?? 1) < 0.95) return material;
  const em = material.emissive;
  const emLuma = em ? em.r * 0.2126 + em.g * 0.7152 + em.b * 0.0722 : 0;
  if ((material.emissiveIntensity ?? 0) * emLuma > 0.25) return material;

  const range = PM12_WEAR.ranges[klass] ?? PM12_WEAR.ranges['painted-steel'];
  const flags = klassFlags(klass);
  flags.keepRough = keepRoughnessMap ? 1 : 0;
  const lib = getPortWearLibrary();
  const uniforms = {
    pm12WearMap: { value: lib.albedo },
    pm12MetalMap: { value: lib.metal },
    pm12LogoMap: { value: lib.logos },
    pm12RoughMin: { value: range.roughMin },
    pm12RoughMax: { value: range.roughMax },
    pm12BaseBand: { value: PM12_WEAR.baseBandM },
    pm12SaltBand: { value: PM12_WEAR.saltBandM },
    pm12HarbourY: { value: PM12_WEAR.harbourY },
    pm12ApronY: { value: PM12_WEAR.apronY },
    pm12Lattice: { value: flags.lattice },
    pm12Logo: { value: flags.logo },
    pm12MetalEdges: { value: flags.metalEdges },
    pm12Salt: { value: flags.salt },
    pm12Tyre: { value: flags.tyre },
    pm12KeepRough: { value: flags.keepRough },
    pm12Klass: { value: flags.id },
  };

  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    if (typeof previousCompile === 'function') previousCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
varying float vPm12HeightAboveBase;
varying vec3 vPm12WorldPosition;
varying vec3 vPm12Origin;
varying vec3 vPm12WorldNormal;
varying vec3 vPm12ObjectPos;
varying vec3 vPm12ObjectNormal;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
#ifdef USE_INSTANCING
  mat4 pm12Model = modelMatrix * instanceMatrix;
#else
  mat4 pm12Model = modelMatrix;
#endif
  vec4 pm12Origin = pm12Model * vec4(0.0, 0.0, 0.0, 1.0);
  vec4 pm12World = pm12Model * vec4(transformed, 1.0);
  vPm12Origin = pm12Origin.xyz;
  vPm12WorldPosition = pm12World.xyz;
  vPm12HeightAboveBase = max(0.0, pm12World.y - pm12Origin.y);
  vPm12WorldNormal = normalize(mat3(pm12Model) * objectNormal);
  vPm12ObjectPos = transformed;
  vPm12ObjectNormal = objectNormal;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform sampler2D pm12WearMap;
uniform sampler2D pm12MetalMap;
uniform sampler2D pm12LogoMap;
uniform float pm12RoughMin;
uniform float pm12RoughMax;
uniform float pm12BaseBand;
uniform float pm12SaltBand;
uniform float pm12HarbourY;
uniform float pm12ApronY;
uniform float pm12Lattice;
uniform float pm12Logo;
uniform float pm12MetalEdges;
uniform float pm12Salt;
uniform float pm12Tyre;
uniform float pm12KeepRough;
uniform float pm12Klass;
varying float vPm12HeightAboveBase;
varying vec3 vPm12WorldPosition;
varying vec3 vPm12Origin;
varying vec3 vPm12WorldNormal;
varying vec3 vPm12ObjectPos;
varying vec3 vPm12ObjectNormal;
float pm12Hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
{
  vec3 wp = vPm12WorldPosition;
  vec3 wn = normalize(vPm12WorldNormal);
  float vert = 1.0 - smoothstep(0.35, 0.78, abs(wn.y));
  float horiz = smoothstep(0.45, 0.85, abs(wn.y));
  float cellX;
  float cellZ;
  float cellY;
  if (pm12Lattice > 0.5) {
    cellX = floor(vPm12Origin.x / 4.24 + 0.0001);
    cellZ = floor(vPm12Origin.z / 1.71 + 0.0001);
    cellY = floor(vPm12Origin.y / 1.81 + 0.0001);
  } else {
    cellX = floor((vPm12Origin.x + 4.0) / 8.0);
    cellZ = floor((vPm12Origin.z + 4.0) / 8.0);
    cellY = 0.0;
  }
  float phase = mod(cellX + 2.0 * cellZ + cellY, 8.0);
  vec3 on = normalize(vPm12ObjectNormal);
  float memberWidth = 2.0 * abs(dot(vPm12ObjectPos, on));
  float thin = (1.0 - smoothstep(0.30, 0.65, memberWidth)) * vert;
  float maxBlob = mix(0.60, min(0.60, max(0.08, memberWidth * 2.0)), thin);
  vec2 grainUv = fract(wp.xz / 0.42 + wp.y / 0.55 + vec2(phase * 0.13, phase * 0.07));
  vec4 wear = texture2D(pm12WearMap, grainUv);

  if (pm12Klass > 5.5 && pm12Klass < 6.5) {
#ifdef USE_UV
    float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float frame = 1.0 - smoothstep(0.0, 0.045, e);
    diffuseColor.rgb *= mix(vec3(1.0), vec3(0.78, 0.76, 0.72), frame * 0.35);
#endif
  } else {
    float grain = ((wear.r + wear.g + wear.b) / 3.0 - 0.97) * 0.55;
    diffuseColor.rgb *= 1.0 + clamp(grain, -0.04, 0.04);

    float across = abs(wn.x) >= abs(wn.z) ? wp.z : wp.x;
    float aboveApron = max(0.0, wp.y - pm12ApronY);
    float baseAmt = (1.0 - smoothstep(0.0, pm12BaseBand, aboveApron)) * vert;
    diffuseColor.rgb *= mix(vec3(1.0), vec3(0.82, 0.78, 0.74), baseAmt * 0.50);

    if (pm12Salt > 0.5) {
      float saltY = wp.y - pm12HarbourY;
      float saltBand = 1.0 - clamp(abs(saltY - pm12SaltBand * 0.5) / (pm12SaltBand * 0.5), 0.0, 1.0);
      vec2 saltCell = floor(vec2(across, wp.y) / 0.85 + vec2(phase, 0.0));
      float saltGate = step(0.985, pm12Hash(saltCell + vec2(phase, 3.1)));
      float saltBlob = 1.0 - smoothstep(0.12, 0.28, length(fract(vec2(across, wp.y) / 0.85) - 0.5) * 0.85);
      float salt = saltBand * vert * saltGate * saltBlob;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.89, 0.91), salt * 0.22);
    }

    if (pm12Klass < 0.5 || (pm12Klass > 4.5 && pm12Klass < 5.5)) {
      float pitch = 4.2;
      float dist = abs(fract(across / pitch + phase * 0.11) - 0.5) * pitch;
      float gutter = 1.0 - smoothstep(0.0, 1.8, mod(wp.y + 0.15 + phase * 0.4, 3.4));
      float streakGate = step(0.62, pm12Hash(vec2(floor(across / pitch), phase)));
      float streakW = min(0.22, maxBlob * 0.5);
      float streak = (1.0 - smoothstep(streakW * 0.35, streakW, dist)) * vert * gutter * streakGate;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.56, 0.38, 0.24), streak * 0.32);
      float boltR = min(0.10, maxBlob * 0.35);
      float bolt = 1.0 - smoothstep(boltR * 0.45, boltR, length(vec2(
        abs(fract(across / 1.7) - 0.5) * 1.7,
        abs(fract(wp.y / 1.7) - 0.5) * 1.7)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.52, 0.34, 0.20), bolt * vert * 0.30);
    } else if (pm12Klass > 0.5 && pm12Klass < 1.5) {
      float rustFoot = (1.0 - smoothstep(0.0, 0.55, aboveApron)) * vert;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.58, 0.42, 0.28), rustFoot * 0.28);
      float boltR = min(0.10, maxBlob * 0.35);
      float bolt = 1.0 - smoothstep(boltR * 0.45, boltR, length(vec2(
        abs(fract(across / 1.7) - 0.5) * 1.7,
        abs(fract(wp.y / 1.7) - 0.5) * 1.7)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.52, 0.36, 0.22), bolt * vert * 0.28);
    } else if (pm12Klass > 1.5 && pm12Klass < 2.5) {
      float pitch = 6.4;
      float lane = abs(fract(wp.z / pitch + 0.18 + phase * 0.07) - 0.5) * pitch;
      float track = (1.0 - smoothstep(0.06, 0.16, lane)) * horiz;
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.72, 0.70, 0.66), track * 0.40);
      float jx = abs(fract(wp.x / 6.0 + phase * 0.02) - 0.5) * 6.0;
      float jz = abs(fract(wp.z / 6.0) - 0.5) * 6.0;
      float joint = (1.0 - smoothstep(0.03, 0.08, min(jx, jz))) * horiz;
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.70, 0.68, 0.64), joint * 0.38);
      vec2 oilCell = floor(wp.xz / 12.0 + vec2(phase * 0.17, phase * 0.09));
      vec2 oilUv = (fract(wp.xz / 12.0) - 0.5) * 12.0;
      float oilGate = step(0.88, pm12Hash(oilCell + vec2(2.7, phase)));
      float oilRx = 1.15 + pm12Hash(oilCell + vec2(4.1, 1.3)) * 0.55;
      float oilRz = oilRx * 0.72;
      float oil = (1.0 - smoothstep(oilRx * 0.40, oilRx, length(oilUv / vec2(1.0, oilRz / oilRx)))) * oilGate * horiz;
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.62, 0.58, 0.52), oil * 0.42);
    } else if (pm12Klass > 2.5 && pm12Klass < 3.5) {
      float fixCell = floor(wp.x / 1.7 + phase * 0.08);
      float fixGate = step(0.62, pm12Hash(vec2(fixCell, phase)));
      float fix = (1.0 - smoothstep(0.06, 0.14, abs(fract(wp.x / 1.7 + phase * 0.08) - 0.5) * 1.7)) * horiz * fixGate;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.56, 0.42, 0.28), fix * 0.30);
    } else if (pm12Klass > 3.5 && pm12Klass < 4.5) {
      float scuff = abs(fract(wp.x / 4.8 + phase * 0.13) - 0.5) * 4.8;
      float beltGate = step(0.55, pm12Hash(vec2(floor(wp.x / 4.8), phase)));
      float belt = (1.0 - smoothstep(0.06, 0.16, scuff)) * horiz * beltGate;
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.70, 0.66, 0.60), belt * 0.32);
      vec2 oilCell = floor(wp.xz / 8.0);
      float oil = (1.0 - smoothstep(0.22, 0.65, length((fract(wp.xz / 8.0) - 0.5) * 8.0))) * step(0.82, pm12Hash(oilCell + phase)) * horiz;
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.64, 0.60, 0.54), oil * 0.35);
    }

    if (pm12Logo > 0.5) {
#ifdef USE_UV
      if (vUv.x > 0.12 && vUv.x < 0.40 && vUv.y > 0.30 && vUv.y < 0.74) {
        float logoId = mod(phase, 6.0);
        vec2 tile = vec2(mod(logoId, 3.0), floor(logoId / 3.0));
        vec2 local = vec2((vUv.x - 0.12) / 0.28, (vUv.y - 0.30) / 0.44);
        vec2 atlas = (tile + clamp(local, 0.02, 0.98)) / vec2(3.0, 2.0);
        vec4 logo = texture2D(pm12LogoMap, atlas);
        diffuseColor.rgb = mix(diffuseColor.rgb, logo.rgb, logo.a * 0.88);
      }
#endif
    }
  }

  float wearRough = wear.a;
  if (pm12Klass > 5.5 && pm12Klass < 6.5) {
  } else if (pm12KeepRough < 0.5) {
    roughnessFactor = mix(pm12RoughMin, pm12RoughMax, wearRough);
  } else {
    roughnessFactor = mix(roughnessFactor, mix(pm12RoughMin, pm12RoughMax, wearRough), 0.35);
  }
  if (pm12Klass > 2.5 && pm12Klass < 3.5) {
    float glossBreak = pm12Hash(floor(wp.xz / 1.15 + phase));
    roughnessFactor = mix(roughnessFactor, mix(0.55, 0.96, glossBreak), 0.22);
  }

  if (pm12MetalEdges > 0.5) {
    float edge = texture2D(pm12MetalMap, grainUv).r;
    metalnessFactor = mix(metalnessFactor * 0.08, max(metalnessFactor, 0.72), edge);
  }
}`,
    );
  };
  material.customProgramCacheKey = () => `${previousKey ? previousKey() : ''}|pm13:${klass}:${flags.keepRough}`;
  if (klass === 'painted-steel' || klass === 'container') {
    const env = Math.min(material.envMapIntensity ?? 1, PM12_WEAR.paintedEnvMax);
    material.envMapIntensity = env;
    if (material.userData.envIntensityBase != null) {
      material.userData.envIntensityBase = Math.min(material.userData.envIntensityBase, PM12_WEAR.paintedEnvMax);
    }
  }
  material.userData.portWear = {
    klass,
    roughMin: range.roughMin,
    roughMax: range.roughMax,
    baseBandM: PM12_WEAR.baseBandM,
    saltBandM: PM12_WEAR.saltBandM,
    streakWidthM: PM12_WEAR.streakWidthM,
    stainMinM: PM12_WEAR.stainMinM,
    phases: klass === 'container' ? PM12_WEAR.containerPhases : PM12_WEAR.phases,
    logos: klass === 'container' ? PM12_WEAR.logos : 0,
    envMax: klass === 'painted-steel' || klass === 'container' ? PM12_WEAR.paintedEnvMax : null,
    worldMetre: true,
    restrained: true,
    signage: klass === 'signage',
  };
  material.needsUpdate = true;
  return material;
}

function dressRecord(mats, classKeys, { keepRoughness = new Set() } = {}) {
  if (!mats) return mats;
  for (const [klass, keys] of Object.entries(classKeys)) {
    for (const key of keys) {
      const m = mats[key];
      if (!m) continue;
      applyPortWear(m, { klass, keepRoughnessMap: keepRoughness.has(key) });
    }
  }
  if (Array.isArray(mats.containers)) {
    for (const m of mats.containers) applyPortWear(m, { klass: 'container' });
  }
  for (const [key, m] of Object.entries(mats)) {
    if (DRESS_SKIP.has(key)) continue;
    if (!m) continue;
    if (Array.isArray(m)) continue;
    if (!m.isMeshStandardMaterial) continue;
    if (m.userData?.portWear) continue;
    applyPortWear(m, { klass: inferKlass(key, m), keepRoughnessMap: keepRoughness.has(key) });
  }
  return mats;
}

export function dressPortMaterials(mats) {
  return dressRecord(mats, PORT_CLASS_KEYS);
}

export function dressShipyardMaterials(mats) {
  dressRecord(mats, YARD_CLASS_KEYS, { keepRoughness: new Set(['plate']) });
  if (mats?.signBoard) applyPortWear(mats.signBoard, { klass: 'signage' });
  return mats;
}

export function wearStampedMaterials(mats) {
  const list = Array.isArray(mats) ? mats : [mats];
  for (const m of list) applyPortWear(m, { klass: 'container' });
  return mats;
}

export function wearContainerTree(root) {
  if (!root) return root;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      if (!m?.isMeshStandardMaterial) continue;
      if (m.name && m.name.startsWith('container-')) {
        applyPortWear(m, { klass: 'container' });
        continue;
      }
      const n = `${o.name || ''} ${m.name || ''}`.toLowerCase();
      if (/container|cargo|empty/.test(n)) applyPortWear(m, { klass: 'container' });
    }
  });
  return root;
}

const TREE_SKIP = /worker|crew|glass|lamp|beacon|water|harbour|wave|foam|chop|letter|person|figure|wake|splash|hatwhite|hatred|:boot-|:leg-|:arm-|:torso|:pelvis|:thigh|:forearm|:head|:skin/;

function cloneStripped(material) {
  const c = material.clone();
  c.onBeforeCompile = undefined;
  c.customProgramCacheKey = undefined;
  c.userData = { ...(material.userData || {}) };
  delete c.userData.portWear;
  c.needsUpdate = true;
  return c;
}

function cloneForSignage(material) {
  return applyPortWear(cloneStripped(material), { klass: 'signage' });
}

function nameBlob(o) {
  const parts = [];
  let p = o;
  for (let i = 0; i < 5 && p; i += 1, p = p.parent) {
    if (p.name) parts.push(p.name);
  }
  return parts.join(' ').toLowerCase();
}

function replaceMaterials(mesh, fn) {
  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const next = list.map((m) => (m?.isMeshStandardMaterial ? fn(m) : m));
  mesh.material = Array.isArray(mesh.material) ? next : next[0];
}

export function wearPortTree(root) {
  if (!root) return root;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const nmLower = nameBlob(o);
    const isSign = SIGNAGE_NAME.test(nmLower);
    const isLetter = /letter/.test(nmLower);
    if (isLetter) {
      replaceMaterials(o, (m) => {
        if (!m.userData?.portWear) return m;
        return cloneStripped(m);
      });
      return;
    }
    if (isSign) {
      replaceMaterials(o, (m) => {
        if (m.userData?.portWear?.klass === 'signage') return m;
        return cloneForSignage(m);
      });
      return;
    }
    if (TREE_SKIP.test(nmLower)) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      if (!m?.isMeshStandardMaterial) continue;
      if (m.userData?.portWear) continue;
      const luma = m.color ? m.color.r * 0.2126 + m.color.g * 0.7152 + m.color.b * 0.0722 : 0;
      if ((m.metalness ?? 0) <= 0.02 && (m.roughness ?? 0) >= 0.8 && luma > 0.65) continue;
      if ((m.metalness ?? 0) >= 0.65 && (m.roughness ?? 0) <= 0.16) continue;
      if (luma > 0.88 && (m.metalness ?? 0) <= 0.15 && (m.roughness ?? 0.5) <= 0.62) continue;
      const klass = /container|cargo|empty/.test(nmLower)
        ? 'container'
        : inferKlass(nmLower, m);
      if (klass === 'signage') continue;
      applyPortWear(m, { klass });
    }
  });
  return root;
}

function pm12HashJs(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / Math.max(1e-8, e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * CPU mirror of the PM13 fragment field. Returns layer weights in 0–1 and the
 * distance to the nearest geometric cause (foot, fixing, gutter, joint, lane, pad).
 */
export function evaluatePortWearSample(klass, wp, wn, origin = { x: 0, y: 0, z: 0 }) {
  const vert = 1 - smoothstep(0.35, 0.78, Math.abs(wn.y));
  const horiz = smoothstep(0.45, 0.85, Math.abs(wn.y));
  const container = klass === 'container';
  const cellX = container
    ? Math.floor(origin.x / 4.24 + 1e-4)
    : Math.floor((origin.x + 4) / 8);
  const cellZ = container
    ? Math.floor(origin.z / 1.71 + 1e-4)
    : Math.floor((origin.z + 4) / 8);
  const cellY = container ? Math.floor(origin.y / 1.81 + 1e-4) : 0;
  const phase = ((cellX + 2 * cellZ + cellY) % 8 + 8) % 8;
  const across = Math.abs(wn.x) >= Math.abs(wn.z) ? wp.z : wp.x;
  const aboveApron = Math.max(0, wp.y - PM12_WEAR.apronY);
  const layers = { oil: 0, grime: 0, tyre: 0, salt: 0, rust: 0, foot: 0 };
  const causes = [];

  const foot = (1 - smoothstep(0, PM12_WEAR.baseBandM, aboveApron)) * vert;
  layers.foot = foot;
  if (foot > 0.05) causes.push({ kind: 'base', d: aboveApron });

  if (klass === 'painted-steel' || klass === 'galvanised' || klass === 'timber' || klass === 'container') {
    const saltY = wp.y - PM12_WEAR.harbourY;
    const saltBand = 1 - Math.max(0, Math.min(1, Math.abs(saltY - PM12_WEAR.saltBandM * 0.5) / (PM12_WEAR.saltBandM * 0.5)));
    const saltCellX = Math.floor(across / 0.85 + phase);
    const saltCellY = Math.floor(wp.y / 0.85);
    const saltGate = pm12HashJs(saltCellX + phase, saltCellY + 3.1) >= 0.985 ? 1 : 0;
    const fx = (across / 0.85) - Math.floor(across / 0.85) - 0.5;
    const fy = (wp.y / 0.85) - Math.floor(wp.y / 0.85) - 0.5;
    const saltBlob = 1 - smoothstep(0.12, 0.28, Math.hypot(fx, fy) * 0.85);
    layers.salt = saltBand * vert * saltGate * saltBlob;
    if (layers.salt > 0.05) causes.push({ kind: 'harbour', d: Math.abs(saltY) });
  }

  if (klass === 'painted-steel' || klass === 'container' || klass === 'galvanised') {
    const pitch = klass === 'galvanised' ? 1.7 : 4.2;
    const dist = Math.abs(((across / pitch + phase * 0.11) % 1 + 1) % 1 - 0.5) * pitch;
    const gutter = 1 - smoothstep(0, 1.8, ((wp.y + 0.15 + phase * 0.4) % 3.4 + 3.4) % 3.4);
    const streakGate = klass === 'galvanised' ? 0 : (pm12HashJs(Math.floor(across / pitch), phase) >= 0.62 ? 1 : 0);
    const streak = klass === 'galvanised' ? 0 : (1 - smoothstep(0.08, 0.22, dist)) * vert * gutter * streakGate;
    const bolt = (1 - smoothstep(0.045, 0.10, Math.hypot(
      Math.abs(((across / 1.7) % 1 + 1) % 1 - 0.5) * 1.7,
      Math.abs(((wp.y / 1.7) % 1 + 1) % 1 - 0.5) * 1.7,
    ))) * vert;
    const rustFoot = klass === 'galvanised' ? (1 - smoothstep(0, 0.55, aboveApron)) * vert : 0;
    layers.rust = Math.max(streak, bolt, rustFoot);
    if (streak > 0.05) causes.push({ kind: 'gutter', d: dist });
    if (bolt > 0.05) causes.push({ kind: 'fixing', d: 0 });
    if (rustFoot > 0.05) causes.push({ kind: 'base', d: aboveApron });
  }

  if (klass === 'concrete') {
    const pitch = 6.4;
    const lane = Math.abs((((wp.z / pitch + 0.18 + phase * 0.07) % 1) + 1) % 1 - 0.5) * pitch;
    layers.tyre = (1 - smoothstep(0.06, 0.16, lane)) * horiz;
    const jx = Math.abs((((wp.x / 6 + phase * 0.02) % 1) + 1) % 1 - 0.5) * 6;
    const jz = Math.abs((((wp.z / 6) % 1) + 1) % 1 - 0.5) * 6;
    layers.grime = (1 - smoothstep(0.03, 0.08, Math.min(jx, jz))) * horiz;
    const oilCellX = Math.floor(wp.x / 12 + phase * 0.17);
    const oilCellZ = Math.floor(wp.z / 12 + phase * 0.09);
    const oilGate = pm12HashJs(oilCellX + 2.7, oilCellZ + phase) >= 0.88 ? 1 : 0;
    const oilRx = 1.15 + pm12HashJs(oilCellX + 4.1, oilCellZ + 1.3) * 0.55;
    const oilRz = oilRx * 0.72;
    const ox = ((((wp.x / 12) % 1) + 1) % 1 - 0.5) * 12;
    const oz = ((((wp.z / 12) % 1) + 1) % 1 - 0.5) * 12;
    const oilLen = Math.hypot(ox, oz / (oilRz / oilRx));
    layers.oil = (1 - smoothstep(oilRx * 0.40, oilRx, oilLen)) * oilGate * horiz;
    if (layers.tyre > 0.05) causes.push({ kind: 'lane', d: lane });
    if (layers.grime > 0.05) causes.push({ kind: 'drain', d: Math.min(jx, jz) });
    if (layers.oil > 0.05) causes.push({ kind: 'machine', d: Math.hypot(ox, oz) });
  }

  if (klass === 'timber') {
    const fixCell = Math.floor(wp.x / 1.7 + phase * 0.08);
    const fixGate = pm12HashJs(fixCell, phase) >= 0.62 ? 1 : 0;
    const dFix = Math.abs((((wp.x / 1.7 + phase * 0.08) % 1) + 1) % 1 - 0.5) * 1.7;
    layers.grime = (1 - smoothstep(0.06, 0.14, dFix)) * horiz * fixGate;
    if (layers.grime > 0.05) causes.push({ kind: 'fixing', d: dFix });
  }

  if (klass === 'rubber') {
    const scuff = Math.abs((((wp.x / 4.8 + phase * 0.13) % 1) + 1) % 1 - 0.5) * 4.8;
    const beltGate = pm12HashJs(Math.floor(wp.x / 4.8), phase) >= 0.55 ? 1 : 0;
    layers.grime = (1 - smoothstep(0.06, 0.16, scuff)) * horiz * beltGate;
    const oilCellX = Math.floor(wp.x / 8);
    const oilCellZ = Math.floor(wp.z / 8);
    const ox = ((((wp.x / 8) % 1) + 1) % 1 - 0.5) * 8;
    const oz = ((((wp.z / 8) % 1) + 1) % 1 - 0.5) * 8;
    layers.oil = (1 - smoothstep(0.22, 0.65, Math.hypot(ox, oz)))
      * (pm12HashJs(oilCellX + phase, oilCellZ) >= 0.82 ? 1 : 0) * horiz;
    if (layers.grime > 0.05) causes.push({ kind: 'lane', d: scuff });
    if (layers.oil > 0.05) causes.push({ kind: 'machine', d: Math.hypot(ox, oz) });
  }

  const any = Math.max(layers.oil, layers.grime, layers.tyre, layers.salt, layers.rust, layers.foot);
  const causeDist = any > 0.05
    ? Math.min(...causes.map((c) => c.d), PM13_WEAR.causeRadiusM + 1)
    : Infinity;
  return { ...layers, any, causeDist, phase, vert, horiz };
}

/**
 * Coverage law census: fraction of each class carrying oil/grime/tyre/salt/any,
 * and the share of wear samples that sit within 1.5 m of a geometric cause.
 */
export function portWearCoverageCensus({ step = 0.55, span = 48 } = {}) {
  const classes = {
    'painted-steel': { nx: 0, ny: 0, nz: 1, y0: 0.5, y1: 7.5, horiz: false },
    galvanised: { nx: 0, ny: 0, nz: 1, y0: 0.4, y1: 5.5, horiz: false },
    concrete: { nx: 0, ny: 1, nz: 0, y0: PM12_WEAR.apronY, y1: PM12_WEAR.apronY, horiz: true },
    timber: { nx: 0, ny: 1, nz: 0, y0: 0.42, y1: 0.42, horiz: true },
    rubber: { nx: 0, ny: 1, nz: 0, y0: 0.9, y1: 0.9, horiz: true },
    container: { nx: 0, ny: 0, nz: 1, y0: 0.5, y1: 7.2, horiz: false },
  };
  const out = {};
  for (const [klass, spec] of Object.entries(classes)) {
    let n = 0;
    let wearN = 0;
    let causeN = 0;
    let saltBandN = 0;
    const acc = { oil: 0, grime: 0, tyre: 0, salt: 0 };
    const yCount = spec.horiz ? 1 : Math.max(1, Math.round((spec.y1 - spec.y0) / step));
    for (let ix = 0; ix < Math.round(span / step); ix += 1) {
      for (let iz = 0; iz < Math.round(span / step); iz += 1) {
        for (let iy = 0; iy < yCount; iy += 1) {
          const x = ix * step + 1.1;
          const z = iz * step - 18.4;
          const y = spec.horiz ? spec.y0 : spec.y0 + iy * step;
          const sample = evaluatePortWearSample(
            klass,
            { x, y, z },
            { x: spec.nx, y: spec.ny, z: spec.nz },
            { x, y: spec.horiz ? 0 : y * 0.5, z },
          );
          n += 1;
          if (sample.oil > 0.05) acc.oil += 1;
          if (sample.grime > 0.05) acc.grime += 1;
          if (sample.tyre > 0.05) acc.tyre += 1;
          const saltY = y - PM12_WEAR.harbourY;
          const inSaltBand = saltY >= -0.02 && saltY <= PM12_WEAR.saltBandM + 0.02 && !spec.horiz;
          if (inSaltBand) {
            saltBandN += 1;
            if (sample.salt > 0.05) acc.salt += 1;
          }
          if (sample.any > 0.05) {
            wearN += 1;
            if (sample.causeDist <= PM13_WEAR.causeRadiusM) causeN += 1;
          }
        }
      }
    }
    out[klass] = {
      n,
      any: wearN / n,
      oil: acc.oil / n,
      grime: acc.grime / n,
      tyre: acc.tyre / n,
      salt: saltBandN ? acc.salt / saltBandN : 0,
      causeFrac: wearN ? causeN / wearN : 1,
    };
  }
  return out;
}

/** Adjacent cells on the 8 m lattice never share a phase (B4-style x + 2z). */
export function wearPhaseAt(x, z, y = 0, { container = false } = {}) {
  if (container) {
    const cellX = Math.floor(x / 4.24 + 1e-4);
    const cellZ = Math.floor(z / 1.71 + 1e-4);
    const cellY = Math.floor(y / 1.81 + 1e-4);
    return ((cellX + 2 * cellZ + cellY) % 8 + 8) % 8;
  }
  const cellX = Math.floor((x + 4) / 8);
  const cellZ = Math.floor((z + 4) / 8);
  return ((cellX + 2 * cellZ) % 8 + 8) % 8;
}

function sampleAlbedoAt(data, size, u, v) {
  const x = Math.max(0, Math.min(size - 1, Math.floor(u * size)));
  const y = Math.max(0, Math.min(size - 1, Math.floor(v * size)));
  const i = (y * size + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

/**
 * Unique quantized (albedo, roughness) pairs from the wear field. `before`
 * is one pair per class (flat scalar). `after` samples every phase × UV.
 */
export function portWearPairCensus() {
  const lib = getPortWearLibrary();
  const tex = lib.albedo;
  const data = tex.image.data;
  const size = tex.image.width;
  const before = new Set();
  const after = new Set();
  for (const klass of CLASS_LIST) {
    const range = PM12_WEAR.ranges[klass];
    const mid = ((range.roughMin + range.roughMax) * 0.5).toFixed(2);
    before.add(`808080:${mid}:${klass}`);
    const phases = klass === 'container' ? PM12_WEAR.containerPhases : PM12_WEAR.phases;
    for (let phase = 0; phase < phases; phase += 1) {
      for (let s = 0; s < 12; s += 1) {
        const u = (0.07 + s * 0.071 + phase * 0.37) % 1;
        const v = (0.11 + s * 0.063 + phase * 0.19) % 1;
        const p = sampleAlbedoAt(data, size, u, v);
        const hex = ((p.r << 16) | (p.g << 8) | p.b).toString(16).padStart(6, '0');
        const rough = lerp(range.roughMin, range.roughMax, p.a / 255).toFixed(2);
        after.add(`${hex}:${rough}`);
      }
    }
  }
  const roughVar = {};
  for (const klass of CLASS_LIST) {
    const range = PM12_WEAR.ranges[klass];
    const samples = [];
    const phases = klass === 'container' ? PM12_WEAR.containerPhases : PM12_WEAR.phases;
    for (let phase = 0; phase < phases; phase += 1) {
      for (let s = 0; s < 24; s += 1) {
        const u = (0.04 + s * 0.039 + phase * 0.37) % 1;
        const v = (0.07 + s * 0.037 + phase * 0.19) % 1;
        const p = sampleAlbedoAt(data, size, u, v);
        samples.push(lerp(range.roughMin, range.roughMax, p.a / 255));
      }
    }
    const n = samples.length;
    const mean = samples.reduce((a, b) => a + b, 0) / n;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    roughVar[klass] = {
      min: Math.min(...samples),
      max: Math.max(...samples),
      mean,
      std: Math.sqrt(variance),
      n,
      authored: [range.roughMin, range.roughMax],
    };
  }
  return {
    before: before.size,
    after: after.size,
    ratio: after.size / Math.max(1, before.size),
    classes: CLASS_LIST.length,
    phases: PM12_WEAR.phases,
    containerPhases: PM12_WEAR.containerPhases,
    logos: PM12_WEAR.logos,
    roughVar,
    bytes: lib.byteLength(),
    maxDim: lib.maxDimension(),
    maps: lib.mapCount(),
  };
}

export function portWearReceipt(root) {
  const census = portWearPairCensus();
  const dressed = new Map();
  if (root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) {
        if (!m?.userData?.portWear) continue;
        const k = m.userData.portWear.klass;
        dressed.set(k, (dressed.get(k) ?? 0) + 1);
      }
    });
  }
  return { ...census, dressed: Object.fromEntries(dressed) };
}
