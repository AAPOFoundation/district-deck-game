// District Deck V3.10 — W1-RENDER procedural PBR textures.
//
// Canvas-generated albedo / roughness / height / AO plus build-baked micro maps. No
// Math.random or Date.now. Every generator is seeded from a stable family string so a rebuild
// always produces the same pixels. Normals are Sobel-derived from the height channel.
//
// Budget target (V3.10 §7): ≤ 40 MB of generated texture memory. Resolution and map count
// scale with the quality tier; low skips normals entirely.

import * as THREE from 'three';
import { recordAtlasConcreteMap } from './style/restyle.js';
import { P1_HIGHLIGHT, P4_GRUNGE } from './v4-p1-polish.js';

export const TEXTURE_SIZE = Object.freeze({
  high: 512,
  medium: 512,
  low: 256,
});

/** FNV-1a over a string → uint32 seed. Same string always yields the same maps. */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic xorshift32. Not the sim RNG — visual only. */
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function valueNoise2d(x, y, rngTable, tableSize) {
  const x0 = Math.floor(x) & (tableSize - 1);
  const y0 = Math.floor(y) & (tableSize - 1);
  const x1 = (x0 + 1) & (tableSize - 1);
  const y1 = (y0 + 1) & (tableSize - 1);
  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const v00 = rngTable[y0 * tableSize + x0];
  const v10 = rngTable[y0 * tableSize + x1];
  const v01 = rngTable[y1 * tableSize + x0];
  const v11 = rngTable[y1 * tableSize + x1];
  const a = v00 + (v10 - v00) * sx;
  const b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sy;
}

function fbm(x, y, rngTable, tableSize, octaves = 4) {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * valueNoise2d(x * freq, y * freq, rngTable, tableSize);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function buildNoiseTable(seed, tableSize = 64) {
  const rng = makeRng(seed);
  const table = new Float32Array(tableSize * tableSize);
  for (let i = 0; i < table.length; i += 1) table[i] = rng();
  return table;
}

function clampByte(v) {
  return Math.max(0, Math.min(255, v | 0));
}

// P23: face weathering collects at the base, never around the tile perimeter.
// Canvas rows run downward; y=size-1 is the bottom of a face texture.
export const P23_BOTTOM_DIRT = Object.freeze({ height: 0.12, strength: 0.08 });
export function bottomDirtAt(y, size) {
  return Math.max(0, Math.min(1, 1 - (size - 1 - y) / (size * P23_BOTTOM_DIRT.height)))
    * P23_BOTTOM_DIRT.strength;
}

/**
 * Structure-only wear. Crevice value drop, cooler edge lift, cool vertical
 * streaks. Never a global brown multiply. Amounts come from P4_GRUNGE.
 */
export function applyStructuredWear(sample, { seam = 0, edge = 0, streak = 0, chip = 0 } = {}) {
  const grime = Math.max(0, seam) * P4_GRUNGE.grimeAmount;
  const wear = Math.max(0, edge) * P4_GRUNGE.edgeWear;
  const rain = Math.max(0, streak) * P4_GRUNGE.roofStreak;
  const flake = Math.max(0, chip);
  let { r, g, b, h, rough, occ } = sample;
  r *= 1 - grime * 0.55;
  g *= 1 - grime * 0.50;
  b *= 1 - grime * 0.42;
  occ *= 1 - grime * 0.20;
  h *= 1 - grime * 0.18;
  r += (176 - r) * wear * 0.40;
  g += (174 - g) * wear * 0.40;
  b += (180 - b) * wear * 0.50;
  rough += flake * P4_GRUNGE.specularBreakup * 0.45 - wear * P4_GRUNGE.specularBreakup * 0.25;
  r -= rain * 26;
  g -= rain * 20;
  b -= rain * 14;
  occ -= rain * 0.10;
  h -= rain * 12;
  return {
    r,
    g,
    b,
    h,
    rough: Math.max(0, rough),
    occ: Math.max(0, occ),
  };
}

function heightAt(height, size, x, y) {
  const xx = ((x % size) + size) % size;
  const yy = ((y % size) + size) % size;
  return height[(yy * size + xx) * 4] / 255;
}

/**
 * Sobel normal map from a height RGBA buffer. Strength is in "height units per texel".
 * Output is tangent-space, OpenGL convention (Y+ up).
 */
export function sobelNormalFromHeight(heightRgba, size, strength = 2.4) {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const tl = heightAt(heightRgba, size, x - 1, y - 1);
      const t = heightAt(heightRgba, size, x, y - 1);
      const tr = heightAt(heightRgba, size, x + 1, y - 1);
      const l = heightAt(heightRgba, size, x - 1, y);
      const r = heightAt(heightRgba, size, x + 1, y);
      const bl = heightAt(heightRgba, size, x - 1, y + 1);
      const b = heightAt(heightRgba, size, x, y + 1);
      const br = heightAt(heightRgba, size, x + 1, y + 1);
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * size + x) * 4;
      out[i] = clampByte((nx * 0.5 + 0.5) * 255);
      out[i + 1] = clampByte((ny * 0.5 + 0.5) * 255);
      out[i + 2] = clampByte((nz * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
  return out;
}

function canvasFromRgba(rgba, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  const image = ctx.createImageData(size, size);
  image.data.set(rgba);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function makeTexture(canvas, {
  colorSpace = THREE.NoColorSpace,
  wrap = THREE.RepeatWrapping,
  repeat = 1,
  generateMipmaps = true,
} = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.wrapS = wrap;
  texture.wrapT = wrap;
  texture.repeat.set(repeat, repeat);
  texture.generateMipmaps = generateMipmaps;
  texture.minFilter = generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  texture.userData.procedural = true;
  return texture;
}

function makeDataMap(rgba, size, {
  colorSpace = THREE.NoColorSpace,
  wrap = THREE.RepeatWrapping,
  repeat = 1,
  generateMipmaps = true,
} = {}) {
  const texture = new THREE.DataTexture(rgba, size, size, THREE.RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.wrapS = wrap;
  texture.wrapT = wrap;
  texture.repeat.set(repeat, repeat);
  texture.generateMipmaps = generateMipmaps;
  texture.minFilter = generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  texture.userData.procedural = true;
  texture.userData.micro = true;
  return texture;
}

function makeRectDataMap(rgba, width, height, {
  colorSpace = THREE.NoColorSpace,
  wrap = THREE.ClampToEdgeWrapping,
  generateMipmaps = false,
} = {}) {
  const texture = new THREE.DataTexture(rgba, width, height, THREE.RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.wrapS = wrap;
  texture.wrapT = wrap;
  texture.generateMipmaps = generateMipmaps;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  texture.userData.procedural = true;
  return texture;
}

// --- P6 micro-variation (generic kit) -----------------------------------------
// Small tileable DataTextures. Form, not grain. Build-baked once and shared per family.

export const MICRO_TILE_SIZE = 128;

/**
 * Build-baked copies of the deterministic micro normal/roughness buffers. Keeping every URL
 * static lets Vite fingerprint the files while Node can still resolve them for parity tests.
 * The browser decodes these away from the main thread only when a material family is requested.
 */
export const MICRO_BAKED_ASSETS = Object.freeze({
  brick: Object.freeze({
    normal: new URL('../../assets/img/p17-building-micro/brick-normal.png', import.meta.url).href,
    roughness: new URL('../../assets/img/p17-building-micro/brick-roughness.png', import.meta.url).href,
  }),
  render: Object.freeze({
    normal: new URL('../../assets/img/p17-building-micro/render-normal.png', import.meta.url).href,
    roughness: new URL('../../assets/img/p17-building-micro/render-roughness.png', import.meta.url).href,
  }),
  weatherboard: Object.freeze({
    normal: new URL('../../assets/img/p17-building-micro/weatherboard-normal.png', import.meta.url).href,
    roughness: new URL('../../assets/img/p17-building-micro/weatherboard-roughness.png', import.meta.url).href,
  }),
  corrugated: Object.freeze({
    normal: new URL('../../assets/img/p17-building-micro/corrugated-normal.png', import.meta.url).href,
    roughness: new URL('../../assets/img/p17-building-micro/corrugated-roughness.png', import.meta.url).href,
  }),
  slate: Object.freeze({
    normal: new URL('../../assets/img/p17-building-micro/slate-normal.png', import.meta.url).href,
    roughness: new URL('../../assets/img/p17-building-micro/slate-roughness.png', import.meta.url).href,
  }),
  tile: Object.freeze({
    normal: new URL('../../assets/img/p17-building-micro/tile-normal.png', import.meta.url).href,
    roughness: new URL('../../assets/img/p17-building-micro/tile-roughness.png', import.meta.url).href,
  }),
  asphalt: Object.freeze({
    normal: new URL('../../assets/img/p17-building-micro/asphalt-normal.png', import.meta.url).href,
    roughness: new URL('../../assets/img/p17-building-micro/asphalt-roughness.png', import.meta.url).href,
  }),
  concrete: Object.freeze({
    normal: new URL('../../assets/img/p17-building-micro/concrete-normal.png', import.meta.url).href,
    roughness: new URL('../../assets/img/p17-building-micro/concrete-roughness.png', import.meta.url).href,
  }),
});

/** Material-family ids that carry micro normal + roughness maps. */
export const P17_ROOF_EFFECTIVE_ROUGHNESS_MIN = 0.72;

export const MICRO_SPECS = Object.freeze({
  // `reliefMm` is the real-world authoring target represented by the normal, not displacement.
  // Roughness maps multiply `familyRough`; faces therefore stay matte while joints/laps reach it.
  brick: Object.freeze({ size: 128, amplitude: 2.25, familyRough: 0.90, repeat: 3, kind: 'brick', reliefMm: 12 }),
  render: Object.freeze({ size: 128, amplitude: 1.45, familyRough: 0.90, repeat: 2, kind: 'render', reliefMm: 3 }),
  weatherboard: Object.freeze({ size: 128, amplitude: 2.35, familyRough: 0.84, repeat: 2.5, kind: 'weatherboard', reliefMm: 18 }),
  corrugated: Object.freeze({ size: 128, amplitude: 3.20, familyRough: 0.90, repeat: 4, kind: 'corrugated', reliefMm: 18, effectiveRoughnessFloor: P17_ROOF_EFFECTIVE_ROUGHNESS_MIN }),
  slate: Object.freeze({ size: 128, amplitude: 2.40, familyRough: 0.90, repeat: 3, kind: 'slate', reliefMm: 9, effectiveRoughnessFloor: P17_ROOF_EFFECTIVE_ROUGHNESS_MIN }),
  tile: Object.freeze({ size: 128, amplitude: 2.75, familyRough: 0.92, repeat: 3.5, kind: 'tile', reliefMm: 28, effectiveRoughnessFloor: P17_ROOF_EFFECTIVE_ROUGHNESS_MIN }),
  asphalt: Object.freeze({ size: 128, amplitude: 1.40, familyRough: 0.92, repeat: 6, kind: 'asphalt' }),
  concrete: Object.freeze({ size: 128, amplitude: 1.70, familyRough: 0.92, repeat: 3, kind: 'concrete', reliefMm: 5, effectiveRoughnessFloor: P17_ROOF_EFFECTIVE_ROUGHNESS_MIN }),
});

export const GENERIC_MICRO_FAMILIES = Object.freeze(Object.keys(MICRO_SPECS));

function roughnessMod(mod, familyRough, effectiveFloor = P1_HIGHLIGHT.minRoughnessOpaque) {
  // The map is written with integer truncation, so step up to the next representable byte.
  const floorByte = Math.ceil((effectiveFloor / Math.max(familyRough, 1e-6)) * 255);
  const floorMod = (floorByte + 0.001) / 255;
  return Math.max(floorMod, Math.min(1, mod));
}

function writeHeightRough(height, roughness, i, h, rough) {
  const hb = clampByte(h * 255);
  height[i] = hb;
  height[i + 1] = hb;
  height[i + 2] = hb;
  height[i + 3] = 255;
  const rb = clampByte(rough * 255);
  roughness[i] = rb;
  roughness[i + 1] = rb;
  roughness[i + 2] = rb;
  roughness[i + 3] = 255;
}

function genMicroBrick(size, seed, familyRough) {
  const noise = buildNoiseTable(seed, 32);
  const height = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const brickW = size / 8;
  const brickH = size / 16;
  const mortar = Math.max(1, size / 64);
  const sillBand = Math.max(2, size / 32);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const row = Math.floor(y / brickH);
      const offset = (row & 1) ? brickW * 0.5 : 0;
      const localX = (x + offset) % brickW;
      const localY = y % brickH;
      const inMortar = localX < mortar || localY < mortar
        || localX > brickW - mortar || localY > brickH - mortar;
      const dEdge = Math.min(localX, localY, brickW - localX, brickH - localY);
      const bevel = Math.max(0, 1 - dEdge / Math.max(1, mortar * 1.8));
      const n = valueNoise2d(x * 0.07, y * 0.07, noise, 32);
      let h;
      let rough;
      if (inMortar) {
        h = 0.26 + n * 0.04;
        rough = 1.0;
      } else {
        h = 0.58 + n * 0.05 - bevel * 0.16;
        // Face slightly tighter than mortar; drip band under every 4th course.
        rough = 0.92 + n * 0.03;
        const belowSill = (row % 4) === 3 && localY > mortar && localY < mortar + sillBand;
        if (belowSill) rough = 0.99;
      }
      writeHeightRough(height, roughness, (y * size + x) * 4, h, roughnessMod(rough, familyRough));
    }
  }
  return { height, roughness };
}

function genMicroRender(size, seed, familyRough) {
  const noise = buildNoiseTable(seed, 32);
  const height = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const panelW = size / 4;
  const panelH = size / 3;
  const seamW = Math.max(1, size / 96);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = valueNoise2d(x * 0.11, y * 0.11, noise, 32);
      const trowel = 0.5 + 0.5 * Math.sin((x + y * 0.32) * (Math.PI * 2 / (size / 7)));
      const inSeam = (x % panelW) < seamW || (y % panelH) < seamW;
      let h = 0.48 + trowel * 0.10 + n * 0.05;
      let rough = 0.93 + n * 0.04;
      if (inSeam) {
        h = 0.30 + n * 0.04;
        rough = 0.99;
      }
      // Slight polish on the trowel ridge.
      if (!inSeam && trowel > 0.72) rough = Math.max(rough - 0.05, 0.86);
      writeHeightRough(height, roughness, (y * size + x) * 4, h, roughnessMod(rough, familyRough));
    }
  }
  return { height, roughness };
}

function genMicroWeatherboard(size, seed, familyRough) {
  const noise = buildNoiseTable(seed, 32);
  const height = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const boardH = size / 12;
  const lap = Math.max(1, size / 96);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const localY = y % boardH;
      const inLap = localY < lap;
      const grain = valueNoise2d(x * 0.28, y * 0.04, noise, 32);
      let h;
      let rough;
      if (inLap) {
        h = 0.28;
        rough = 1.0;
      } else {
        const lip = localY < lap * 3 ? 1 - (localY - lap) / Math.max(1, lap * 2) : 0;
        h = 0.56 + grain * 0.05 - Math.max(0, lip) * 0.12;
        rough = 0.91 + grain * 0.04;
      }
      writeHeightRough(height, roughness, (y * size + x) * 4, h, roughnessMod(rough, familyRough));
    }
  }
  return { height, roughness };
}

function genMicroCorrugated(size, seed, familyRough, effectiveFloor) {
  const noise = buildNoiseTable(seed, 32);
  const height = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const period = size / 10;
  const seamEvery = period * 5;
  const screwEvery = size / 8;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const phase = (x % period) / period;
      const ridge = 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);
      const trough = 1 - ridge;
      const streak = valueNoise2d(x * 0.03, y * 0.38, noise, 32);
      const n = valueNoise2d(x * 0.08, y * 0.05, noise, 32);
      const seamDist = Math.min(x % seamEvery, seamEvery - (x % seamEvery));
      const seam = seamDist < Math.max(1, size / 128) ? 1 : 0;
      const ridgeDist = Math.min(x % period, period - (x % period));
      const screwY = Math.abs((y % screwEvery) - screwEvery * 0.5);
      const screw = ridgeDist < Math.max(1, size / 128)
        && screwY < Math.max(1, size / 128) ? 1 : 0;
      // Fine brushing runs DOWN the sheet, perpendicular to the corrugation response.
      const brush = 0.5 + 0.5 * Math.sin(y * 1.35 + n * 5.0);
      const h = 0.20 + ridge * 0.56 + n * 0.025 + seam * 0.08 + screw * 0.10;
      let rough = 0.82 + trough * 0.15 + brush * 0.03;
      if (streak > 0.58) rough = Math.min(1, rough + (streak - 0.58) * trough * 0.20);
      if (seam || screw) rough = Math.min(1, rough + 0.12);
      writeHeightRough(height, roughness, (y * size + x) * 4, h,
        roughnessMod(rough, familyRough, effectiveFloor));
    }
  }
  return { height, roughness };
}

function genMicroSlate(size, seed, familyRough, effectiveFloor) {
  const noise = buildNoiseTable(seed, 32);
  const height = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const tileW = size / 6;
  const tileH = size / 10;
  const gap = Math.max(1, size / 128);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const row = Math.floor(y / tileH);
      const offset = (row & 1) ? tileW * 0.5 : 0;
      const localX = (x + offset) % tileW;
      const localY = y % tileH;
      const inGap = localX < gap || localY < gap;
      const n = valueNoise2d(x * 0.14 + row, y * 0.14, noise, 32);
      let h;
      let rough;
      if (inGap) {
        h = 0.24 + n * 0.04;
        rough = 1.0;
      } else {
        const bevel = Math.max(0, 1 - Math.min(localX, localY) / Math.max(2, gap * 3));
        h = 0.54 + n * 0.08 - bevel * 0.14;
        rough = 0.90 + n * 0.05;
      }
      writeHeightRough(height, roughness, (y * size + x) * 4, h,
        roughnessMod(rough, familyRough, effectiveFloor));
    }
  }
  return { height, roughness };
}

/** Half-round terracotta pantiles: curved barrels, recessed channels and course overlaps. */
function genMicroTile(size, seed, familyRough, effectiveFloor) {
  const noise = buildNoiseTable(seed, 32);
  const height = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const tileW = size / 6;
  const tileH = size / 8;
  const gap = Math.max(1, size / 128);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const row = Math.floor(y / tileH);
      const offset = (row & 1) ? tileW * 0.5 : 0;
      const localX = (x + offset) % tileW;
      const localY = y % tileH;
      const phase = localX / tileW;
      const barrel = 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);
      const channel = 1 - barrel;
      const courseGap = localY < gap;
      const overlap = Math.max(0, 1 - localY / Math.max(1, tileH * 0.28));
      const n = valueNoise2d(x * 0.12 + row, y * 0.11, noise, 32);
      let h = 0.25 + barrel * 0.48 + overlap * 0.13 + n * 0.035;
      // Glazed barrel crowns catch a narrow highlight; channels and laps remain mineral-matte.
      let rough = 0.66 + channel * 0.25 + n * 0.045;
      if (courseGap) {
        h = 0.18 + n * 0.025;
        rough = 1.0;
      } else if (overlap > 0.72) {
        rough = Math.max(0.58, rough - 0.08 * overlap);
      }
      writeHeightRough(height, roughness, (y * size + x) * 4, h,
        roughnessMod(rough, familyRough, effectiveFloor));
    }
  }
  return { height, roughness };
}

function genMicroAsphalt(size, seed, familyRough) {
  const noise = buildNoiseTable(seed, 32);
  const height = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const macro = valueNoise2d(x * 0.045, y * 0.045, noise, 32);
      const patch = valueNoise2d(x * 0.016 + 3, y * 0.016, noise, 32);
      const h = 0.40 + macro * 0.22 + patch * 0.08;
      const oil = Math.max(0, patch - 0.60) * 2.2;
      // Oil patches polish; aggregate stays matte. Multiplier stays near 1.
      const rough = 0.97 - oil * 0.10 + macro * 0.03;
      writeHeightRough(height, roughness, (y * size + x) * 4, h, roughnessMod(rough, familyRough));
    }
  }
  return { height, roughness };
}

function genMicroConcrete(size, seed, familyRough, effectiveFloor) {
  const noise = buildNoiseTable(seed, 32);
  const height = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const panel = size / 2;
  const seamW = Math.max(1, size / 96);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const agg = valueNoise2d(x * 0.16, y * 0.16, noise, 32);
      const inSeam = (x >= panel && x < panel + seamW) || (y >= panel && y < panel + seamW);
      const h = inSeam ? 0.30 + agg * 0.04 : 0.52 + agg * 0.10;
      const cx = (x + 0.5) / size - 0.5;
      const cy = (y + 0.5) / size - 0.5;
      const traffic = Math.max(0, 1 - Math.hypot(cx, cy) * 2.15);
      // Centre traffic-polish, bottom dirt and internal joint grit; no outer rim.
      let rough = 0.94 - traffic * 0.08 + bottomDirtAt(y, size);
      if (inSeam) rough = Math.min(1, rough + 0.05);
      writeHeightRough(height, roughness, (y * size + x) * 4, h,
        roughnessMod(rough, familyRough, effectiveFloor));
    }
  }
  return { height, roughness };
}

const MICRO_GENERATORS = Object.freeze({
  brick: genMicroBrick,
  render: genMicroRender,
  weatherboard: genMicroWeatherboard,
  corrugated: genMicroCorrugated,
  slate: genMicroSlate,
  tile: genMicroTile,
  asphalt: genMicroAsphalt,
  concrete: genMicroConcrete,
});

/**
 * Deterministic micro normal/roughness buffers for a generic family.
 * Same (family, size, seed) always yields the same bytes. Size is clamped to ≤128.
 *
 * @returns {{
 *   family: string,
 *   size: number,
 *   amplitude: number,
 *   familyRough: number,
 *   height: Uint8ClampedArray,
 *   roughness: Uint8ClampedArray,
 *   normal: Uint8ClampedArray,
 * }}
 */
export function generateMicroVariation(family, size, seed) {
  const spec = MICRO_SPECS[family];
  if (!spec) throw new RangeError(`Unknown micro family: ${family}`);
  const tile = Math.min(MICRO_TILE_SIZE, Math.max(16, (size ?? spec.size) | 0));
  const resolvedSeed = seed ?? hashSeed(`p6-micro:${family}:${tile}`);
  const gen = MICRO_GENERATORS[spec.kind];
  const maps = gen(tile, resolvedSeed, spec.familyRough, spec.effectiveRoughnessFloor);
  const normal = sobelNormalFromHeight(maps.height, tile, spec.amplitude);
  return {
    family,
    size: tile,
    amplitude: spec.amplitude,
    familyRough: spec.familyRough,
    effectiveRoughnessFloor: spec.effectiveRoughnessFloor ?? null,
    reliefMm: spec.reliefMm ?? null,
    height: maps.height,
    roughness: maps.roughness,
    normal,
  };
}

function minRoughnessByte(familyRough) {
  const floorMod = P1_HIGHLIGHT.minRoughnessOpaque / Math.max(familyRough, 1e-6);
  return clampByte(Math.min(1, floorMod) * 255);
}

export function microRoughnessRespectsP1(roughnessRgba, familyRough) {
  const floor = minRoughnessByte(familyRough);
  for (let i = 1; i < roughnessRgba.length; i += 4) {
    if (roughnessRgba[i] < floor) return false;
  }
  return true;
}

// --- P17 building weather overlay --------------------------------------------
// One small shared atlas, sampled as a SECOND map in materials.js. Four seeded columns keep
// adjacent instances from repeating; the three rows separate facade, roof and founded contact.

export const BUILDING_WEATHER_ATLAS = Object.freeze({
  tileSize: 64,
  variants: 4,
  roles: Object.freeze(['facade', 'roof', 'contact']),
  contactBandMetres: Object.freeze([0.4, 0.8]),
  // B4 macro marks are authored for the judged camera, not only for a material close-up.
  // On the usual 8–14 m frontage the normalized atlas widths below resolve to 0.3–1.0 m.
  facadeFeatureMetres: Object.freeze([0.3, 1.0]),
  roofCourseMetres: 0.48,
  intensity: 0.92,
  coverageMax: 0.25,
  causeRadiusMetres: 1,
});

export const BUILDING_WEATHER_ROLE = Object.freeze(
  Object.fromEntries(BUILDING_WEATHER_ATLAS.roles.map((role, index) => [role, index])),
);

function smoothStep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function wrappedDistance(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

/**
 * Build the semantic multiply atlas used by every building finish.
 * RGB is a neutral/cool colour multiplier; roof alpha is the south-face lichen mask.
 * The output is deterministic and intentionally has no material-family hue baked into it.
 */
export function generateBuildingWeatherAtlas(
  size = BUILDING_WEATHER_ATLAS.tileSize,
  seed = hashSeed('p17-building-weather-atlas'),
) {
  const tileSize = Math.min(64, Math.max(16, size | 0));
  const width = tileSize * BUILDING_WEATHER_ATLAS.variants;
  const height = tileSize * 4; // P20 square atlas; fourth row reserved, neutral.
  const overlay = new Uint8ClampedArray(width * height * 4);
  overlay.fill(255);

  for (let variant = 0; variant < BUILDING_WEATHER_ATLAS.variants; variant += 1) {
    const variantSeed = (seed ^ Math.imul(variant + 1, 0x9e3779b1)) >>> 0;
    const noise = buildNoiseTable(variantSeed, 32);
    const rng = makeRng(variantSeed);
    const streaks = Array.from({ length: 7 }, () => ({
      x: rng(),
      head: 0.38 + rng() * 0.52,
      width: 0.032 + rng() * 0.038,
      length: 0.22 + rng() * 0.42,
    }));
    const sootPatches = Array.from({ length: 3 }, () => ({
      x: rng(),
      y: 0.42 + rng() * 0.46,
      width: 0.055 + rng() * 0.04,
      height: 0.055 + rng() * 0.055,
    }));
    const screwLines = [0.08 + rng() * 0.12, 0.42 + rng() * 0.16, 0.76 + rng() * 0.12];

    for (let roleIndex = 0; roleIndex < BUILDING_WEATHER_ATLAS.roles.length; roleIndex += 1) {
      const role = BUILDING_WEATHER_ATLAS.roles[roleIndex];
      for (let y = 0; y < tileSize; y += 1) {
        const v = y / Math.max(1, tileSize - 1);
        for (let x = 0; x < tileSize; x += 1) {
          const u = x / Math.max(1, tileSize - 1);
          const n = fbm(u * 7.0 + variant * 1.7, v * 8.0, noise, 32, 3);
          let r = 1;
          let g = 1;
          let b = 1;
          let alpha = 0;

          if (role === 'facade') {
            // Damp rises from the plinth; dirt sits under two sill/coping datums; narrow seeded
            // streaks fall from heads. All are cool/neutral value shifts, never a brown wash.
            const damp = (1 - smoothStep(0.02, 0.28, v)) * (0.72 + n * 0.28);
            const sill = Math.exp(-(((v - 0.34) / 0.026) ** 2))
              + 0.8 * Math.exp(-(((v - 0.63) / 0.024) ** 2));
            const coping = Math.exp(-(((v - 0.88) / 0.045) ** 2)) * (0.45 + n * 0.55);
            let rain = 0;
            for (const streak of streaks) {
              if (v > streak.head || v < streak.head - streak.length) continue;
              const across = wrappedDistance(u, streak.x) / streak.width;
              const down = (streak.head - v) / streak.length;
              rain = Math.max(rain, Math.exp(-(across ** 2) * 2.2) * (1 - down * 0.46));
            }
            let soot = 0;
            for (const patch of sootPatches) {
              const sx = wrappedDistance(u, patch.x) / patch.width;
              const sy = (v - patch.y) / patch.height;
              soot = Math.max(soot, Math.exp(-(sx * sx + sy * sy) * 1.8));
            }
            const dirt = damp * 0.19 + Math.min(1, sill) * 0.065
              + coping * 0.085 + rain * 0.16 + soot * 0.12;
            r = 1 - dirt * 1.1;
            g = 1 - dirt;
            b = 1 - dirt * 0.84;
          } else if (role === 'roof') {
            // General run-off plus iron bloom at gutters, seams and screw lines. Alpha carries
            // lichen separately so materials.js can restrict it to world-south roof faces.
            const gutter = 1 - smoothStep(0.01, 0.13, Math.min(v, 1 - v));
            let fixing = 0;
            for (const line of screwLines) {
              fixing = Math.max(fixing, Math.exp(-(((u - line) / 0.018) ** 2)));
            }
            const seam = Math.exp(-((wrappedDistance(u, 0.5) / 0.022) ** 2));
            const bloom = Math.max(0, n - 0.54) * 1.9 * Math.min(1, gutter + seam + fixing * 0.7);
            const runoff = Math.max(0, fbm(u * 3.0, v * 24.0, noise, 32, 2) - 0.45) * 0.22;
            r = 1 - runoff * 1.15 - bloom * 0.12 - gutter * 0.12;
            g = 1 - runoff * 1.25 - bloom * 0.25 - gutter * 0.15;
            b = 1 - runoff * 1.30 - bloom * 0.34 - gutter * 0.18;
            const lichenNoise = fbm(u * 9.0 + 5.0, v * 7.0 + variant, noise, 32, 3);
            alpha = smoothStep(0.60, 0.82, lichenNoise) * (0.35 + gutter * 0.65);
          } else {
            // A cool feathered junction, authored to span the 0.4–0.8 m plinth range. The
            // fragment hook suppresses this on horizontal tops, so it cannot dirty a whole pad.
            const contact = (1 - smoothStep(0.02, 0.96, v)) * (0.88 + n * 0.12);
            r = 1 - contact * 0.30;
            g = 1 - contact * 0.25;
            b = 1 - contact * 0.19;
          }

          const px = variant * tileSize + x;
          const py = roleIndex * tileSize + y;
          const i = (py * width + px) * 4;
          overlay[i] = clampByte(r * 255);
          overlay[i + 1] = clampByte(g * 255);
          overlay[i + 2] = clampByte(b * 255);
          overlay[i + 3] = clampByte(alpha * 255);
        }
      }
    }
  }

  return { overlay, width, height, tileSize, seed: seed >>> 0 };
}

// --- surface generators -------------------------------------------------------
// Each returns { albedo, roughness, height, ao } as Uint8ClampedArray RGBA.

function genBrick(size, seed) {
  const noise = buildNoiseTable(seed, 64);
  const albedo = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const height = new Uint8ClampedArray(size * size * 4);
  const ao = new Uint8ClampedArray(size * size * 4);
  const brickW = size / 8;
  const brickH = size / 16;
  const mortar = Math.max(1, size / 64);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const row = Math.floor(y / brickH);
      const offset = (row & 1) ? brickW * 0.5 : 0;
      const localX = (x + offset) % brickW;
      const localY = y % brickH;
      const inMortar = localX < mortar || localY < mortar
        || localX > brickW - mortar || localY > brickH - mortar;
      const n = fbm(x * 0.08, y * 0.08, noise, 64, 3);
      const brickVar = fbm(x * 0.25 + row, y * 0.25, noise, 64, 2);
      // Efflorescence: pale salt bloom near mortar joints, seeded.
      const eff = !inMortar && localY < mortar * 3 && n > 0.62 ? (n - 0.62) * 2.2 : 0;
      let r;
      let g;
      let b;
      let h;
      let rough;
      let occ;
      if (inMortar) {
        // Cool recessed mortar. This is a colour MULTIPLIER, so it stays neutral and lets
        // the material/instance colour own the brick hue instead of squaring a red albedo.
        r = 112 + n * 18;
        g = 116 + n * 18;
        b = 120 + n * 18;
        h = 40 + n * 20;
        rough = 1.0;
        occ = 0.62 + n * 0.08;
      } else {
        // Neutral mid-grey modulation, following genAsphalt's P16 rule. The material colour
        // and per-parcel tint carry hue; this map contributes fired-face value and salt bloom.
        const face = 132 + brickVar * 42 - n * 14 + eff * 38;
        r = face + 3;
        g = face;
        b = face - 2;
        h = 150 + brickVar * 40 - n * 20;
        rough = 0.82 + brickVar * 0.10;
        occ = 0.88 + n * 0.08;
        const dEdge = Math.min(
          localX - mortar,
          localY - mortar,
          brickW - mortar - localX,
          brickH - mortar - localY,
        );
        const edge = Math.max(0, 1 - Math.max(0, dEdge) / Math.max(1, mortar * 2.2));
        ({ r, g, b, h, rough, occ } = applyStructuredWear(
          { r, g, b, h, rough, occ },
          { edge },
        ));
      }
      const i = (y * size + x) * 4;
      albedo[i] = clampByte(r);
      albedo[i + 1] = clampByte(g);
      albedo[i + 2] = clampByte(b);
      albedo[i + 3] = 255;
      const rb = clampByte(rough * 255);
      roughness[i] = rb;
      roughness[i + 1] = rb;
      roughness[i + 2] = rb;
      roughness[i + 3] = 255;
      const hb = clampByte(h);
      height[i] = hb;
      height[i + 1] = hb;
      height[i + 2] = hb;
      height[i + 3] = 255;
      const ob = clampByte(occ * 255);
      ao[i] = ob;
      ao[i + 1] = ob;
      ao[i + 2] = ob;
      ao[i + 3] = 255;
    }
  }
  return { albedo, roughness, height, ao };
}

function genCorrugation(size, seed) {
  const noise = buildNoiseTable(seed, 64);
  const albedo = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const height = new Uint8ClampedArray(size * size * 4);
  const ao = new Uint8ClampedArray(size * size * 4);
  const period = size / 10;
  const seamEvery = period * 5;
  const screwEvery = size / 8;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const phase = (x % period) / period;
      const ridge = 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);
      const rust = fbm(x * 0.05, y * 0.12, noise, 64, 3);
      const streak = fbm(x * 0.02, y * 0.4, noise, 64, 2);
      // Cool galvanised: dirt lives in the troughs as cool-dark streaks, not rust-brown.
      const trough = 1 - ridge;
      const base = 152 + ridge * 44;
      const rustAmt = Math.max(0, rust - 0.68) * trough * 0.9;
      const seamDist = Math.min(x % seamEvery, seamEvery - (x % seamEvery));
      const seam = seamDist < Math.max(1, size / 256) ? 1 : 0;
      const ridgeDist = Math.min(x % period, period - (x % period));
      const screwY = Math.abs((y % screwEvery) - screwEvery * 0.5);
      const screw = ridgeDist < Math.max(1, size / 192)
        && screwY < Math.max(1, size / 192) ? 1 : 0;
      const brush = 0.5 + 0.5 * Math.sin(y * 1.1 + rust * 4.0);
      let r = base * 0.98 + rustAmt * 16;
      let g = base * 0.99 + rustAmt * 6;
      let b = base * 1.03 - rustAmt * 4;
      let h = 66 + ridge * 146 + seam * 18 + screw * 24;
      // Directional brushed highlight on ridge crowns; troughs, seams and fixings break it.
      let rough = 0.56 + trough * 0.28 + brush * 0.055 + rustAmt * 0.10;
      rough = Math.min(1, rough + seam * 0.10 + screw * 0.14);
      let occ = 0.78 + ridge * 0.18;
      const streakAmt = Math.max(0, streak - 0.40) * trough;
      ({ r, g, b, h, rough, occ } = applyStructuredWear(
        { r, g, b, h, rough, occ },
        { streak: streakAmt, seam: trough * 0.35 },
      ));
      const i = (y * size + x) * 4;
      albedo[i] = clampByte(r);
      albedo[i + 1] = clampByte(g);
      albedo[i + 2] = clampByte(b);
      albedo[i + 3] = 255;
      const rb = clampByte(rough * 255);
      roughness[i] = rb;
      roughness[i + 1] = rb;
      roughness[i + 2] = rb;
      roughness[i + 3] = 255;
      const hb = clampByte(h);
      height[i] = hb;
      height[i + 1] = hb;
      height[i + 2] = hb;
      height[i + 3] = 255;
      const ob = clampByte(occ * 255);
      ao[i] = ob;
      ao[i + 1] = ob;
      ao[i + 2] = ob;
      ao[i + 3] = 255;
    }
  }
  return { albedo, roughness, height, ao };
}

function genWeatherboard(size, seed) {
  const noise = buildNoiseTable(seed, 64);
  const albedo = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const height = new Uint8ClampedArray(size * size * 4);
  const ao = new Uint8ClampedArray(size * size * 4);
  const boardH = size / 12;
  const lap = Math.max(1, size / 96);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const localY = y % boardH;
      const inLap = localY < lap;
      const grain = fbm(x * 0.35, y * 0.04, noise, 64, 3);
      const board = fbm(Math.floor(y / boardH) * 1.7, 0.3, noise, 64, 1);
      // Neutral modulation around mid grey; paint colour remains a material property.
      const paint = 142 + board * 28 - grain * 14;
      let r = paint + 2;
      let g = paint;
      let b = paint - 2;
      let h = 170 + grain * 20;
      let rough = 0.72 + grain * 0.1;
      let occ = 0.92;
      if (inLap) {
        r *= 0.78;
        g *= 0.78;
        b *= 0.76;
        h = 70;
        rough = 0.86;
        occ = 0.62;
      } else {
        const lip = localY < lap * 3 ? 1 - (localY - lap) / Math.max(1, lap * 2) : 0;
        ({ r, g, b, h, rough, occ } = applyStructuredWear(
          { r, g, b, h, rough, occ },
          { edge: Math.max(0, lip), seam: 0 },
        ));
      }
      const i = (y * size + x) * 4;
      albedo[i] = clampByte(r);
      albedo[i + 1] = clampByte(g);
      albedo[i + 2] = clampByte(b);
      albedo[i + 3] = 255;
      const rb = clampByte(rough * 255);
      roughness[i] = rb;
      roughness[i + 1] = rb;
      roughness[i + 2] = rb;
      roughness[i + 3] = 255;
      const hb = clampByte(h);
      height[i] = hb;
      height[i + 1] = hb;
      height[i + 2] = hb;
      height[i + 3] = 255;
      const ob = clampByte(occ * 255);
      ao[i] = ob;
      ao[i + 1] = ob;
      ao[i + 2] = ob;
      ao[i + 3] = 255;
    }
  }
  return { albedo, roughness, height, ao };
}

function genAsphalt(size, seed) {
  const noise = buildNoiseTable(seed, 64);
  const albedo = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const height = new Uint8ClampedArray(size * size * 4);
  const ao = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const agg = fbm(x * 0.55, y * 0.55, noise, 64, 4);
      const oil = fbm(x * 0.07, y * 0.07, noise, 64, 2);
      const patch = fbm(x * 0.02 + 3, y * 0.02, noise, 64, 2);
      // Aggregate sparkle + oil staining + patch tone.
      // P16 (2026-09-04): the map MULTIPLIES the material colour (#474b51 on the roads), so a
      // 28–76 byte base squared the darkness — every road tile sampled ~50/255 on top of its
      // albedo and crushed to pure black in shade (the blind critic's "unlit void wedge").
      // The map is a modulation around mid grey now; the material colour carries the tone.
      const base = 96 + agg * 48 + patch * 16;
      const oilAmt = Math.max(0, oil - 0.58) * 2.4;
      const r = base * (1 - oilAmt * 0.35);
      const g = base * (1 - oilAmt * 0.28);
      const b = base * (1 - oilAmt * 0.15);
      const h = 90 + agg * 80;
      const rough = 0.88 - oilAmt * 0.35 + agg * 0.06;
      const occ = 0.9 - oilAmt * 0.08;
      const i = (y * size + x) * 4;
      albedo[i] = clampByte(r);
      albedo[i + 1] = clampByte(g);
      albedo[i + 2] = clampByte(b);
      albedo[i + 3] = 255;
      const rb = clampByte(rough * 255);
      roughness[i] = rb;
      roughness[i + 1] = rb;
      roughness[i + 2] = rb;
      roughness[i + 3] = 255;
      const hb = clampByte(h);
      height[i] = hb;
      height[i + 1] = hb;
      height[i + 2] = hb;
      height[i + 3] = 255;
      const ob = clampByte(occ * 255);
      ao[i] = ob;
      ao[i + 1] = ob;
      ao[i + 2] = ob;
      ao[i + 3] = 255;
    }
  }
  return { albedo, roughness, height, ao };
}


/** Cream limestone ashlar — board-readable courses with per-block chroma + edge bevel (R17). */
function genLimestone(size, seed) {
  const noise = buildNoiseTable(seed, 64);
  const blockNoise = buildNoiseTable(seed ^ 0x9e3779b9, 64);
  const albedo = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const height = new Uint8ClampedArray(size * size * 4);
  const ao = new Uint8ClampedArray(size * size * 4);
  // Larger modules at board distance: ~3 courses × ~2.5 blocks per tile.
  const courseH = Math.max(10, Math.floor(size / 4.2));
  const blockW = Math.max(16, Math.floor(size / 2.6));
  const mortar = Math.max(2, Math.floor(size / 48));
  const bevel = Math.max(2, Math.floor(mortar * 1.6));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const course = Math.floor(y / courseH);
      const stagger = (course % 2) * Math.floor(blockW * 0.5);
      const bx = Math.floor((x + stagger) / blockW);
      const by = course;
      const localX = (x + stagger) % blockW;
      const localY = y % courseH;
      const onMortar = (
        localX < mortar
        || localY < mortar
        || localX >= blockW - mortar
        || localY >= courseH - mortar
      );
      // Soft bevel inset from mortar (height falloff toward joint).
      const dMortar = Math.min(localX, localY, blockW - 1 - localX, courseH - 1 - localY);
      const bevelT = onMortar ? 1 : Math.max(0, 1 - dMortar / bevel);

      // Stable per-block chroma (not per-pixel) so ashlar reads as discrete stones.
      const bHash = ((bx * 73856093) ^ (by * 19349663) ^ seed) >>> 0;
      const bN = ((bHash % 1000) / 1000);
      const n = fbm(x * 0.07, y * 0.08, noise, 64, 5);
      const grain = fbm(x * 0.42, y * 0.15, noise, 64, 3);
      const vein = fbm(x * 0.02 + by * 0.3, y * 0.05, noise, 64, 2);

      // Cool cream limestone base with block-to-block value spread.
      let r = 206 + bN * 16 + n * 14 + grain * 6 - vein * 8;
      let g = 200 + bN * 14 + n * 12 + grain * 5 - vein * 6;
      let b = 184 + bN * 12 + n * 10 + grain * 4 - vein * 5;
      let h = 155 + n * 30 + grain * 12 - bevelT * 55;
      let rough = 0.74 + n * 0.1 + bN * 0.04;
      let occ = 0.94 + n * 0.04 - bevelT * 0.18;

      if (onMortar) {
        // Cool grey mortar, slightly recessed.
        r = 152 + n * 12;
        g = 148 + n * 10;
        b = 138 + n * 9;
        h = 48 + n * 14;
        rough = 0.94;
        occ = 0.52;
      } else {
        // Edge darkening into mortar for joint shadow without full mortar pixel.
        r -= bevelT * 18;
        g -= bevelT * 16;
        b -= bevelT * 14;
        // Fossil / pit flecks
        if (grain > 0.78) {
          r -= 12; g -= 10; b -= 8; h -= 22; rough += 0.04;
        }
        // Rare darker inclusion
        if (bN > 0.88 && grain > 0.55) {
          r -= 20; g -= 18; b -= 14; h -= 10;
        }
      }

      const i = (y * size + x) * 4;
      albedo[i] = clampByte(r);
      albedo[i + 1] = clampByte(g);
      albedo[i + 2] = clampByte(b);
      albedo[i + 3] = 255;
      const rb = clampByte(rough * 255);
      roughness[i] = rb; roughness[i + 1] = rb; roughness[i + 2] = rb; roughness[i + 3] = 255;
      const hb = clampByte(h);
      height[i] = hb; height[i + 1] = hb; height[i + 2] = hb; height[i + 3] = 255;
      const ob = clampByte(occ * 255);
      ao[i] = ob; ao[i + 1] = ob; ao[i + 2] = ob; ao[i + 3] = 255;
    }
  }
  return { albedo, roughness, height, ao };
}


function genConcrete(size, seed) {
  const noise = buildNoiseTable(seed, 64);
  const albedo = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const height = new Uint8ClampedArray(size * size * 4);
  const ao = new Uint8ClampedArray(size * size * 4);
  const tieEvery = size / 4;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = fbm(x * 0.12, y * 0.12, noise, 64, 4);
      const stain = fbm(x * 0.03, y * 0.05, noise, 64, 2);
      const rain = fbm(x * 0.025, y * 0.46, noise, 64, 2);
      // Form-tie dimples on a regular grid.
      const tx = Math.abs((x % tieEvery) - tieEvery * 0.5);
      const ty = Math.abs((y % tieEvery) - tieEvery * 0.5);
      const tie = (tx < size / 48 && ty < size / 48) ? 1 : 0;
      const seamW = Math.max(1, size / 96);
      const panel = size / 2;
      const inSeam = (x >= panel && x < panel + seamW) || (y >= panel && y < panel + seamW);
      const base = 148 + n * 28 - stain * 14;
      let r = base - tie * 30;
      let g = base * 1.00 - tie * 28;
      let b = base * 1.02 - tie * 22;
      let h = 130 + n * 40 - tie * 70 - stain * 12;
      let rough = 0.9 + n * 0.05;
      let occ = 0.86 - tie * 0.2 + n * 0.06;
      ({ r, g, b, h, rough, occ } = applyStructuredWear(
        { r, g, b, h, rough, occ },
        { seam: inSeam ? 1 : 0, streak: Math.max(0, rain - 0.58) },
      ));
      const dirt = bottomDirtAt(y, size);
      r *= 1 - dirt; g *= 1 - dirt; b *= 1 - dirt;
      const i = (y * size + x) * 4;
      albedo[i] = clampByte(r);
      albedo[i + 1] = clampByte(g);
      albedo[i + 2] = clampByte(b);
      albedo[i + 3] = 255;
      const rb = clampByte(rough * 255);
      roughness[i] = rb;
      roughness[i + 1] = rb;
      roughness[i + 2] = rb;
      roughness[i + 3] = 255;
      const hb = clampByte(h);
      height[i] = hb;
      height[i + 1] = hb;
      height[i + 2] = hb;
      height[i + 3] = 255;
      const ob = clampByte(occ * 255);
      ao[i] = ob;
      ao[i + 1] = ob;
      ao[i + 2] = ob;
      ao[i + 3] = 255;
    }
  }
  return { albedo, roughness, height, ao };
}

function genTimber(size, seed) {
  const noise = buildNoiseTable(seed, 64);
  const albedo = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const height = new Uint8ClampedArray(size * size * 4);
  const ao = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Strong grain along X, soft ring modulation.
      const grain = fbm(x * 0.9, y * 0.04, noise, 64, 4);
      const ring = 0.5 + 0.5 * Math.sin(y * 0.08 + grain * 3.5);
      const knot = fbm(x * 0.15, y * 0.15, noise, 64, 2);
      const knotAmt = Math.max(0, knot - 0.72) * 3.5;
      const r = 118 + grain * 50 + ring * 24 - knotAmt * 40;
      const g = 78 + grain * 32 + ring * 14 - knotAmt * 28;
      const b = 42 + grain * 16 + ring * 8 - knotAmt * 14;
      const h = 100 + grain * 70 - knotAmt * 30;
      const rough = 0.72 + grain * 0.14 + knotAmt * 0.1;
      const occ = 0.88 - knotAmt * 0.15;
      const i = (y * size + x) * 4;
      albedo[i] = clampByte(r);
      albedo[i + 1] = clampByte(g);
      albedo[i + 2] = clampByte(b);
      albedo[i + 3] = 255;
      const rb = clampByte(rough * 255);
      roughness[i] = rb;
      roughness[i + 1] = rb;
      roughness[i + 2] = rb;
      roughness[i + 3] = 255;
      const hb = clampByte(h);
      height[i] = hb;
      height[i + 1] = hb;
      height[i + 2] = hb;
      height[i + 3] = 255;
      const ob = clampByte(occ * 255);
      ao[i] = ob;
      ao[i + 1] = ob;
      ao[i + 2] = ob;
      ao[i + 3] = 255;
    }
  }
  return { albedo, roughness, height, ao };
}

function genSand(size, seed) {
  const noise = buildNoiseTable(seed, 64);
  const albedo = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const height = new Uint8ClampedArray(size * size * 4);
  const ao = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Gentle wind-ripple ridges across X, fine grain noise.
      const ripple = 0.5 + 0.5 * Math.sin(x * 0.22 + fbm(x * 0.04, y * 0.04, noise, 64, 2) * 2);
      const grain = fbm(x * 0.7, y * 0.7, noise, 64, 3);
      const r = 198 + ripple * 22 + grain * 18;
      const g = 176 + ripple * 16 + grain * 14;
      const b = 132 + ripple * 10 + grain * 10;
      const h = 100 + ripple * 70 + grain * 20;
      const rough = 0.92 + grain * 0.05;
      const occ = 0.9 + ripple * 0.06;
      const i = (y * size + x) * 4;
      albedo[i] = clampByte(r);
      albedo[i + 1] = clampByte(g);
      albedo[i + 2] = clampByte(b);
      albedo[i + 3] = 255;
      const rb = clampByte(rough * 255);
      roughness[i] = rb;
      roughness[i + 1] = rb;
      roughness[i + 2] = rb;
      roughness[i + 3] = 255;
      const hb = clampByte(h);
      height[i] = hb;
      height[i + 1] = hb;
      height[i + 2] = hb;
      height[i + 3] = 255;
      const ob = clampByte(occ * 255);
      ao[i] = ob;
      ao[i + 1] = ob;
      ao[i + 2] = ob;
      ao[i + 3] = 255;
    }
  }
  return { albedo, roughness, height, ao };
}

function genSlate(size, seed) {
  const noise = buildNoiseTable(seed, 64);
  const albedo = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const height = new Uint8ClampedArray(size * size * 4);
  const ao = new Uint8ClampedArray(size * size * 4);
  const tileW = size / 6;
  const tileH = size / 10;
  const gap = Math.max(1, size / 128);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const row = Math.floor(y / tileH);
      const offset = (row & 1) ? tileW * 0.5 : 0;
      const localX = (x + offset) % tileW;
      const localY = y % tileH;
      const inGap = localX < gap || localY < gap;
      const n = fbm(x * 0.2 + row, y * 0.2, noise, 64, 3);
      let r;
      let g;
      let b;
      let h;
      let rough;
      let occ;
      if (inGap) {
        r = 58;
        g = 60;
        b = 66;
        h = 55;
        rough = 0.95;
        occ = 0.55;
      } else {
        // Cool blue-grey slate, value kept above the grade's shadow crush.
        const face = 126 + n * 38;
        r = face - 2;
        g = face;
        b = face + 3;
        h = 140 + n * 40;
        rough = 0.68 + n * 0.14;
        occ = 0.9;
        const rain = fbm(x * 0.03, y * 0.42, noise, 64, 2);
        ({ r, g, b, h, rough, occ } = applyStructuredWear(
          { r, g, b, h, rough, occ },
          { streak: Math.max(0, rain - 0.58) },
        ));
      }
      // Seeded tile-scale second layer, bounded ±6 display luma before defects.
      const tileCode = ((row * 37 + Math.floor((x + offset) / tileW) * 19 + seed) >>> 0) % 101;
      const jitter = (tileCode % 13) - 6;
      r += jitter; g += jitter; b += jitter;
      if (!inGap && tileCode < 5) {
        const lifted = Math.max(0, 1 - localY / (tileH * 0.25));
        h += lifted * 34; r -= lifted * 9; g -= lifted * 9; b -= lifted * 9;
      }
      if (!inGap && tileCode > 95 && Math.abs(localX/tileW - 0.28 - localY/tileH*0.22) < 0.024) {
        r *= 0.62; g *= 0.62; b *= 0.62; h -= 30; rough = 0.97;
      }
      const i = (y * size + x) * 4;
      albedo[i] = clampByte(r);
      albedo[i + 1] = clampByte(g);
      albedo[i + 2] = clampByte(b);
      albedo[i + 3] = 255;
      const rb = clampByte(rough * 255);
      roughness[i] = rb;
      roughness[i + 1] = rb;
      roughness[i + 2] = rb;
      roughness[i + 3] = 255;
      const hb = clampByte(h);
      height[i] = hb;
      height[i + 1] = hb;
      height[i + 2] = hb;
      height[i + 3] = 255;
      const ob = clampByte(occ * 255);
      ao[i] = ob;
      ao[i + 1] = ob;
      ao[i + 2] = ob;
      ao[i + 3] = 255;
    }
  }
  return { albedo, roughness, height, ao };
}

/** Terracotta pantile colour multiplier — curved barrels and overlapping courses, not slate. */
function genTile(size, seed) {
  const noise = buildNoiseTable(seed, 64);
  const albedo = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const height = new Uint8ClampedArray(size * size * 4);
  const ao = new Uint8ClampedArray(size * size * 4);
  const tileW = size / 6;
  const tileH = size / 8;
  const gap = Math.max(1, size / 128);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const row = Math.floor(y / tileH);
      const offset = (row & 1) ? tileW * 0.5 : 0;
      const localX = (x + offset) % tileW;
      const localY = y % tileH;
      const barrel = 0.5 + 0.5 * Math.cos((localX / tileW) * Math.PI * 2);
      const channel = 1 - barrel;
      const courseGap = localY < gap;
      const overlap = Math.max(0, 1 - localY / Math.max(1, tileH * 0.28));
      const n = fbm(x * 0.16 + row, y * 0.14, noise, 64, 3);
      const fired = fbm(x * 0.045 + row * 0.7, y * 0.06, noise, 64, 2);
      let value = 130 + n * 26 + fired * 16 + barrel * 15;
      let h = 62 + barrel * 132 + overlap * 30 + n * 10;
      let rough = 0.66 + channel * 0.24 + n * 0.06;
      let occ = 0.82 + barrel * 0.15;
      if (courseGap) {
        value = 94 + n * 12;
        h = 42 + n * 8;
        rough = 1.0;
        occ = 0.58;
      } else if (overlap > 0.72) {
        // The fired/glazed roll at each overlap is the controlled glossy ridge.
        rough = Math.max(0.56, rough - overlap * 0.10);
      }
      const tileCode = ((row * 37 + Math.floor((x + offset) / tileW) * 19 + seed) >>> 0) % 101;
      value += (tileCode % 13) - 6;
      if (!courseGap && tileCode < 5) {
        const lifted = Math.max(0, 1 - localY / (tileH * 0.25));
        h += lifted * 34; value -= lifted * 9;
      }
      if (!courseGap && tileCode > 95 && Math.abs(localX/tileW - 0.28 - localY/tileH*0.22) < 0.024) {
        value *= 0.62; h -= 30; rough = 0.97;
      }
      const i = (y * size + x) * 4;
      albedo[i] = clampByte(value + 3);
      albedo[i + 1] = clampByte(value);
      albedo[i + 2] = clampByte(value - 3);
      albedo[i + 3] = 255;
      const rb = clampByte(rough * 255);
      roughness[i] = rb;
      roughness[i + 1] = rb;
      roughness[i + 2] = rb;
      roughness[i + 3] = 255;
      const hb = clampByte(h);
      height[i] = hb;
      height[i + 1] = hb;
      height[i + 2] = hb;
      height[i + 3] = 255;
      const ob = clampByte(occ * 255);
      ao[i] = ob;
      ao[i + 1] = ob;
      ao[i + 2] = ob;
      ao[i + 3] = 255;
    }
  }
  return { albedo, roughness, height, ao };
}

function genRender(size, seed) {
  // Smooth stucco/render: fine noise only, no hard pattern.
  const noise = buildNoiseTable(seed, 64);
  const albedo = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const height = new Uint8ClampedArray(size * size * 4);
  const ao = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = fbm(x * 0.35, y * 0.35, noise, 64, 4);
      const stain = fbm(x * 0.04, y * 0.06, noise, 64, 2);
      const rain = fbm(x * 0.03, y * 0.48, noise, 64, 2);
      const panelW = size / 4;
      const panelH = size / 3;
      const seamW = Math.max(1, size / 96);
      const inSeam = (x % panelW) < seamW || (y % panelH) < seamW;
      const render = 140 + n * 28 - stain * 12;
      let r = render + 2;
      let g = render + 1;
      let b = render;
      let h = 140 + n * 30 - stain * 8;
      let rough = 0.86 + n * 0.08;
      let occ = 0.94 - stain * 0.04;
      ({ r, g, b, h, rough, occ } = applyStructuredWear(
        { r, g, b, h, rough, occ },
        {
          seam: inSeam ? 1 : 0,
          streak: Math.max(0, rain - 0.55),
        },
      ));
      const i = (y * size + x) * 4;
      albedo[i] = clampByte(r);
      albedo[i + 1] = clampByte(g);
      albedo[i + 2] = clampByte(b);
      albedo[i + 3] = 255;
      const rb = clampByte(rough * 255);
      roughness[i] = rb;
      roughness[i + 1] = rb;
      roughness[i + 2] = rb;
      roughness[i + 3] = 255;
      const hb = clampByte(h);
      height[i] = hb;
      height[i + 1] = hb;
      height[i + 2] = hb;
      height[i + 3] = 255;
      const ob = clampByte(occ * 255);
      ao[i] = ob;
      ao[i + 1] = ob;
      ao[i + 2] = ob;
      ao[i + 3] = 255;
    }
  }
  return { albedo, roughness, height, ao };
}

function genFoliage(size, seed) {
  const noise = buildNoiseTable(seed, 64);
  const albedo = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const height = new Uint8ClampedArray(size * size * 4);
  const ao = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = fbm(x * 0.4, y * 0.4, noise, 64, 4);
      const clump = fbm(x * 0.08, y * 0.08, noise, 64, 2);
      const r = 28 + n * 20 + clump * 12;
      const g = 118 + n * 46 + clump * 28;
      const b = 28 + n * 16 + clump * 10;
      const h = 100 + n * 80 + clump * 30;
      const rough = 0.9 + n * 0.06;
      const occ = 0.82 + clump * 0.12;
      const i = (y * size + x) * 4;
      albedo[i] = clampByte(r);
      albedo[i + 1] = clampByte(g);
      albedo[i + 2] = clampByte(b);
      albedo[i + 3] = 255;
      const rb = clampByte(rough * 255);
      roughness[i] = rb;
      roughness[i + 1] = rb;
      roughness[i + 2] = rb;
      roughness[i + 3] = 255;
      const hb = clampByte(h);
      height[i] = hb;
      height[i + 1] = hb;
      height[i + 2] = hb;
      height[i + 3] = 255;
      const ob = clampByte(occ * 255);
      ao[i] = ob;
      ao[i + 1] = ob;
      ao[i + 2] = ob;
      ao[i + 3] = 255;
    }
  }
  return { albedo, roughness, height, ao };
}

function genPaintedMetal(size, seed) {
  const noise = buildNoiseTable(seed, 64);
  const albedo = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const height = new Uint8ClampedArray(size * size * 4);
  const ao = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = fbm(x * 0.2, y * 0.2, noise, 64, 3);
      const chip = fbm(x * 0.5, y * 0.5, noise, 64, 2);
      const chipAmt = chip > 0.78 ? (chip - 0.78) * 4 : 0;
      // Cream paint; chips reveal cooler metal, not rust-brown.
      let r = 210 + n * 12 - chipAmt * 55;
      let g = 190 + n * 10 - chipAmt * 30;
      let b = 150 + n * 8 + chipAmt * 25;
      let h = 160 + n * 20 - chipAmt * 40;
      let rough = 0.38 + n * 0.12;
      let occ = 0.94 - chipAmt * 0.1;
      ({ r, g, b, h, rough, occ } = applyStructuredWear(
        { r, g, b, h, rough, occ },
        { chip: chipAmt, edge: chipAmt * 0.35 },
      ));
      const i = (y * size + x) * 4;
      albedo[i] = clampByte(r);
      albedo[i + 1] = clampByte(g);
      albedo[i + 2] = clampByte(b);
      albedo[i + 3] = 255;
      const rb = clampByte(rough * 255);
      roughness[i] = rb;
      roughness[i + 1] = rb;
      roughness[i + 2] = rb;
      roughness[i + 3] = 255;
      const hb = clampByte(h);
      height[i] = hb;
      height[i + 1] = hb;
      height[i + 2] = hb;
      height[i + 3] = 255;
      const ob = clampByte(occ * 255);
      ao[i] = ob;
      ao[i + 1] = ob;
      ao[i + 2] = ob;
      ao[i + 3] = 255;
    }
  }
  return { albedo, roughness, height, ao };
}

/** Texture set generators keyed by the shared map identity (not always 1:1 with family). */
const GENERATORS = Object.freeze({
  brick: genBrick,
  corrugation: genCorrugation,
  weatherboard: genWeatherboard,
  asphalt: genAsphalt,
  concrete: genConcrete,
  limestone: genLimestone,
  timber: genTimber,
  sand: genSand,
  slate: genSlate,
  tile: genTile,
  render: genRender,
  foliage: genFoliage,
  painted_metal: genPaintedMetal,
});

/** Default UV repeat per set — tuned so 8–12 m façades read at board distance. */
const DEFAULT_REPEAT = Object.freeze({
  brick: 3,
  corrugation: 4,
  weatherboard: 2.5,
  asphalt: 6,
  concrete: 3,
  limestone: 1.55,
  timber: 2,
  sand: 4,
  slate: 3,
  tile: 3.5,
  render: 2,
  foliage: 5,
  painted_metal: 2,
});

const NORMAL_STRENGTH = Object.freeze({
  brick: 3.2,
  corrugation: 4.5,
  weatherboard: 2.8,
  asphalt: 1.6,
  concrete: 1.8,
  limestone: 3.4,
  timber: 2.2,
  sand: 1.4,
  slate: 2.6,
  tile: 3.1,
  render: 1.1,
  foliage: 1.8,
  painted_metal: 1.2,
});

const MICRO_NEUTRAL_BUFFERS = new Map();

function neutralMicroBuffer(size, kind) {
  const key = `${size}:${kind}`;
  if (MICRO_NEUTRAL_BUFFERS.has(key)) return MICRO_NEUTRAL_BUFFERS.get(key);
  const rgba = new Uint8ClampedArray(size * size * 4);
  if (kind === 'roughness') {
    rgba.fill(255);
  } else {
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 128;
      rgba[i + 1] = 128;
      rgba[i + 2] = 255;
      rgba[i + 3] = 255;
    }
  }
  MICRO_NEUTRAL_BUFFERS.set(key, rgba);
  return rgba;
}

function makePendingMicroMap(size, kind, repeat) {
  const texture = makeDataMap(neutralMicroBuffer(size, kind), size, { repeat });
  texture.userData.procedural = false;
  texture.userData.baked = true;
  texture.userData.pending = true;
  return texture;
}

// PNG decode and readback happen in this worker. Only the two 128² RGBA buffers cross back to
// the render thread; the worker never constructs Three objects and owns no persistent bitmap.
const MICRO_BAKED_WORKER_SOURCE = `
async function decodePng(url, expectedSize) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('micro asset ' + response.status + ': ' + url);
  const blob = await response.blob();
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob, {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
  } catch {
    bitmap = await createImageBitmap(blob);
  }
  if (bitmap.width !== expectedSize || bitmap.height !== expectedSize) {
    const dimensions = bitmap.width + 'x' + bitmap.height;
    bitmap.close();
    throw new Error('micro asset size ' + dimensions + ', expected ' + expectedSize + 'x' + expectedSize);
  }
  const canvas = new OffscreenCanvas(expectedSize, expectedSize);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, expectedSize, expectedSize).data;
}

self.addEventListener('message', async (event) => {
  const { id, family, size, normalUrl, roughnessUrl } = event.data;
  try {
    const roughness = await decodePng(roughnessUrl, size);
    const normal = normalUrl ? await decodePng(normalUrl, size) : null;
    const transfer = [roughness.buffer];
    if (normal) transfer.push(normal.buffer);
    self.postMessage({
      id,
      family,
      roughness: roughness.buffer,
      normal: normal ? normal.buffer : null,
    }, transfer);
  } catch (error) {
    self.postMessage({ id, family, error: String(error && error.message || error) });
  }
});
`;

/**
 * Cached texture library. One instance per SceneView / quality tier.
 * Glass has no maps — materials.js handles it as a pure physical surface.
 */
export class TextureLibrary {
  /**
   * @param {{ quality?: 'high'|'medium'|'low' }} options
   */
  constructor({ quality = 'high' } = {}) {
    const bootStart = typeof performance !== 'undefined' ? performance.now() : 0;
    this.quality = quality;
    this.size = TEXTURE_SIZE[quality] ?? TEXTURE_SIZE.high;
    this.includeNormals = quality !== 'low';
    this.includeAO = quality === 'high';
    this._sets = new Map(); // setId -> { map, roughnessMap, normalMap, aoMap, textures[] }
    this._micro = new Map(); // family -> { roughnessMap, normalMap, size, textures[] }
    this._microWorker = undefined; // undefined = untried, null = unavailable
    this._microRequests = new Map();
    this._nextMicroRequest = 1;
    this._buildingWeather = null; // one 4-column × 3-role overlay atlas
    this.microBuildMode = 'lazy-baked-worker';
    this._disposed = false;
    // Constructor boot deliberately performs no family generation or asset decode.
    this.microBuildMs = typeof performance !== 'undefined' ? performance.now() - bootStart : 0;
  }

  _ensureMicroWorker() {
    if (this._microWorker !== undefined) return this._microWorker;
    this._microWorker = null;
    if (typeof Worker === 'undefined'
      || typeof Blob === 'undefined'
      || typeof URL === 'undefined'
      || typeof URL.createObjectURL !== 'function') return null;
    try {
      const blob = new Blob([MICRO_BAKED_WORKER_SOURCE], { type: 'text/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl, { name: 'district-deck-micro-maps' });
      URL.revokeObjectURL(workerUrl);
      worker.addEventListener('message', (event) => this._receiveMicroMaps(event.data));
      worker.addEventListener('error', (event) => {
        event.preventDefault?.();
        this._fallbackPendingMicroMaps(event.message ?? 'micro worker error');
      });
      this._microWorker = worker;
    } catch {
      this._microWorker = null;
    }
    return this._microWorker;
  }

  _applyMicroMaps(pack, maps, source) {
    const expected = pack.size * pack.size * 4;
    const roughness = maps.roughness instanceof ArrayBuffer
      ? new Uint8ClampedArray(maps.roughness)
      : maps.roughness;
    const normal = maps.normal instanceof ArrayBuffer
      ? new Uint8ClampedArray(maps.normal)
      : maps.normal;
    if (roughness?.length !== expected || (pack.normalMap && normal?.length !== expected)) {
      throw new Error(`Invalid ${pack.id} micro-map payload`);
    }
    pack.roughnessMap.image.data = roughness;
    pack.roughnessMap.needsUpdate = true;
    pack.roughnessMap.userData.pending = false;
    pack.roughnessMap.userData.source = source;
    if (pack.normalMap) {
      pack.normalMap.image.data = normal;
      pack.normalMap.needsUpdate = true;
      pack.normalMap.userData.pending = false;
      pack.normalMap.userData.source = source;
    }
    pack.source = source;
  }

  _receiveMicroMaps(payload) {
    const request = this._microRequests.get(payload?.id);
    if (!request) return;
    this._microRequests.delete(payload.id);
    try {
      if (payload.error) throw new Error(payload.error);
      // P23: the retained concrete PNG has the old perimeter seam/rim. Refresh
      // this one 128² pack at load time until its separately owned bake is updated.
      const bottomBand = request.pack.id === 'concrete';
      this._applyMicroMaps(request.pack,
        bottomBand ? generateMicroVariation('concrete', request.pack.size) : payload,
        bottomBand ? 'procedural-bottom-band' : 'baked-png-worker');
    } catch {
      this._applyMicroMaps(
        request.pack,
        generateMicroVariation(request.pack.id, request.pack.size),
        'procedural-fallback',
      );
    }
    request.resolve(request.pack);
  }

  _fallbackPendingMicroMaps() {
    this._microWorker?.terminate();
    this._microWorker = null;
    for (const [id, request] of this._microRequests) {
      this._microRequests.delete(id);
      this._applyMicroMaps(
        request.pack,
        generateMicroVariation(request.pack.id, request.pack.size),
        'procedural-fallback',
      );
      request.resolve(request.pack);
    }
  }

  /**
   * Shared ≤128² DataTextures for generic wall/roof/ground families.
   * Null for glass, water, timber, foliage, and other non-generic ids.
   * @param {string} family MATERIAL_FAMILIES key
   */
  getMicro(family) {
    if (this._disposed) throw new Error('TextureLibrary disposed');
    if (!MICRO_SPECS[family]) return null;
    if (this._micro.has(family)) return this._micro.get(family);

    const spec = MICRO_SPECS[family];
    const worker = this._ensureMicroWorker();
    const maps = worker ? null : generateMicroVariation(family, spec.size);
    const textures = [];
    const roughnessMap = maps
      ? makeDataMap(maps.roughness, maps.size, { repeat: spec.repeat })
      : makePendingMicroMap(spec.size, 'roughness', spec.repeat);
    roughnessMap.name = `dd-micro-rough:${family}`;
    textures.push(roughnessMap);

    let normalMap = null;
    if (this.includeNormals) {
      normalMap = maps
        ? makeDataMap(maps.normal, maps.size, { repeat: spec.repeat })
        : makePendingMicroMap(spec.size, 'normal', spec.repeat);
      normalMap.name = `dd-micro-n:${family}`;
      textures.push(normalMap);
    }

    const pack = {
      id: family,
      size: maps?.size ?? spec.size,
      amplitude: spec.amplitude,
      roughnessMap,
      normalMap,
      textures,
      source: maps ? 'procedural-fallback' : 'baked-png-pending',
      ready: null,
    };
    this._micro.set(family, pack);
    if (worker) {
      const id = this._nextMicroRequest;
      this._nextMicroRequest += 1;
      pack.ready = new Promise((resolve) => this._microRequests.set(id, { pack, resolve }));
      const assets = MICRO_BAKED_ASSETS[family];
      worker.postMessage({
        id,
        family,
        size: spec.size,
        normalUrl: this.includeNormals ? assets.normal : null,
        roughnessUrl: assets.roughness,
      });
    } else {
      pack.ready = Promise.resolve(pack);
    }
    return pack;
  }

  /** Queue every generic micro pack once. Returns main-thread registration time. */
  buildMicroVariations() {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    for (const family of GENERIC_MICRO_FAMILIES) this.getMicro(family);
    this.microBuildMs = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
    return this.microBuildMs;
  }

  /** Resolve after every family requested so far has its final baked or fallback bytes. */
  whenMicroReady() {
    return Promise.all([...this._micro.values()].map((pack) => pack.ready)).then(() => this);
  }

  /** Shared facade/roof/contact multiply atlas. One texture for the entire board. */
  getBuildingWeatherAtlas() {
    if (this._disposed) throw new Error('TextureLibrary disposed');
    if (this._buildingWeather) return this._buildingWeather;
    const maps = generateBuildingWeatherAtlas();
    const map = makeRectDataMap(maps.overlay, maps.width, maps.height);
    map.name = 'dd-building-weather:p17';
    map.userData.buildingWeather = true;
    this._buildingWeather = {
      id: 'p17-building-weather',
      ...maps,
      map,
      textures: [map],
    };
    return this._buildingWeather;
  }

  /**
   * Build or return the shared map pack for a generator id.
   * @param {keyof typeof GENERATORS} setId
   */
  getSet(setId) {
    if (this._disposed) throw new Error('TextureLibrary disposed');
    if (!GENERATORS[setId]) throw new RangeError(`Unknown texture set: ${setId}`);
    if (this._sets.has(setId)) return this._sets.get(setId);

    // Stock-exchange ashlar needs extra resolution so joints stay sharp at orbit.
    const size = (setId === 'limestone' && this.quality === 'high')
      ? Math.max(this.size, 1024)
      : this.size;
    const seed = hashSeed(`v310-w1:${setId}:${size}:r17`);
    const maps = GENERATORS[setId](size, seed);
    const repeat = DEFAULT_REPEAT[setId] ?? 2;
    const textures = [];

    const map = makeTexture(canvasFromRgba(maps.albedo, size), {
      colorSpace: THREE.SRGBColorSpace,
      repeat,
    });
    recordAtlasConcreteMap(map, setId);
    textures.push(map);

    const roughnessMap = makeTexture(canvasFromRgba(maps.roughness, size), {
      colorSpace: THREE.NoColorSpace,
      repeat,
    });
    textures.push(roughnessMap);

    let normalMap = null;
    if (this.includeNormals) {
      const normalRgba = sobelNormalFromHeight(
        maps.height,
        size,
        NORMAL_STRENGTH[setId] ?? 2.0,
      );
      normalMap = makeTexture(canvasFromRgba(normalRgba, size), {
        colorSpace: THREE.NoColorSpace,
        repeat,
      });
      textures.push(normalMap);
    }

    let aoMap = null;
    if (this.includeAO) {
      aoMap = makeTexture(canvasFromRgba(maps.ao, size), {
        colorSpace: THREE.NoColorSpace,
        repeat,
      });
      textures.push(aoMap);
    }

    const pack = {
      id: setId,
      size,
      map,
      roughnessMap,
      normalMap,
      aoMap,
      textures,
    };
    this._sets.set(setId, pack);
    return pack;
  }

  /** Estimated GPU memory for generated textures (RGBA, mip factor when enabled). */
  textureBytes() {
    let bytes = 0;
    for (const pack of this._sets.values()) {
      for (const texture of pack.textures) {
        const w = texture.image?.width ?? pack.size;
        const h = texture.image?.height ?? pack.size;
        const mip = texture.generateMipmaps === false ? 1 : 1.34;
        bytes += w * h * 4 * mip;
      }
    }
    for (const pack of this._micro.values()) {
      for (const texture of pack.textures) {
        const w = texture.image?.width ?? pack.size;
        const h = texture.image?.height ?? pack.size;
        const mip = texture.generateMipmaps === false ? 1 : 1.34;
        bytes += w * h * 4 * mip;
      }
    }
    for (const texture of this._buildingWeather?.textures ?? []) {
      const w = texture.image?.width ?? this._buildingWeather.width;
      const h = texture.image?.height ?? this._buildingWeather.height;
      const mip = texture.generateMipmaps === false ? 1 : 1.34;
      bytes += w * h * 4 * mip;
    }
    return Math.round(bytes);
  }

  dispose() {
    if (this._disposed) return;
    this._microWorker?.terminate();
    this._microWorker = null;
    for (const request of this._microRequests.values()) {
      request.pack.source = 'disposed';
      request.resolve(request.pack);
    }
    this._microRequests.clear();
    for (const pack of this._sets.values()) {
      for (const texture of pack.textures) texture.dispose();
    }
    this._sets.clear();
    for (const pack of this._micro.values()) {
      for (const texture of pack.textures) texture.dispose();
    }
    this._micro.clear();
    for (const texture of this._buildingWeather?.textures ?? []) texture.dispose();
    this._buildingWeather = null;
    this._disposed = true;
  }
}

export { GENERATORS as TEXTURE_GENERATORS };

// P23: eight shared 1024² RGBA tiles: linear neutral albedo / normal XY / roughness.
// 42.67 MiB including mipmaps; neutral albedo leaves material/instance hue authoritative.
export const PAINTED_TILES = Object.freeze({
  brick: ['brick-red', 2.4], render: ['render-cream', 3],
  tile: ['terracotta-roof', 2], corrugated: ['metal-roof', 2.5],
  membrane: ['membrane-roof', 4], asphalt: ['asphalt', 6],
  pavement: ['pavement', 3], weatherboard: ['weatherboard', 1.8],
});
const paintedTileCache = new Map();
const paintedBaseGain = new WeakMap();
function paintedAlbedoGain(map, uniforms, finishes) {
  if (!map?.image || typeof document === 'undefined' || typeof document.createElementNS !== 'function') return new THREE.Vector3(1, 1, 1);
  const image = map.image;
  if (!(image.width > 0 && image.height > 0)) return new THREE.Vector3(1, 1, 1);
  let rect = null;
  if (map.userData?.residentialAtlas) {
    // These completed finishers already compensate material colour against a
    // recorded gain. Preserve that cancellation; the roof-edge finisher runs last.
    const compensated = [finishes?.kitRoofEdgeFinished?.gain, finishes?.kitDarkWalls?.baseGain]
      .find(gain => Array.isArray(gain) && gain.length === 3
        && [0, 1, 2].every(index => Number.isFinite(gain[index]) && gain[index] >= 0 && gain[index] <= 1));
    if (compensated) return new THREE.Vector3(...compensated);
    // The predecessor atlas hook has already published the exact shader region.
    // Missing/invalid atlas metadata must not average unrelated surface families.
    const offset = uniforms?.ddResidentialAtlasFragOffset?.value;
    const scale = uniforms?.ddResidentialAtlasFragScale?.value;
    if (![offset?.x, offset?.y, scale?.x, scale?.y].every(Number.isFinite)
      || offset.x < 0 || offset.y < 0 || scale.x <= 0 || scale.y <= 0
      || offset.x + scale.x > 1 || offset.y + scale.y > 1) return new THREE.Vector3(1, 1, 1);
    rect = [offset.x, map.flipY ? 1 - offset.y - scale.y : offset.y, scale.x, scale.y];
  }
  const key = rect ? rect.join('|') : 'image';
  let cache = paintedBaseGain.get(map);
  if (cache?.image !== image || cache?.colorSpace !== map.colorSpace) cache = null;
  if (cache?.gains.has(key)) return cache.gains.get(key);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx?.drawImage) return new THREE.Vector3(1, 1, 1);
  // Keep the previous albedo's reflectance within its actual sampled region.
  // Ordinary single-image maps retain the original whole-image draw path.
  if (rect) ctx.drawImage(image, rect[0] * image.width, rect[1] * image.height,
    rect[2] * image.width, rect[3] * image.height, 0, 0, 32, 32);
  else ctx.drawImage(image, 0, 0, 32, 32);
  const pixels = ctx.getImageData(0, 0, 32, 32).data;
  const mean = [0, 0, 0];
  for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) {
    const v = pixels[i + c] / 255;
    mean[c] += map.colorSpace === THREE.SRGBColorSpace ? (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) : v;
  }
  const gain = new THREE.Vector3(...mean.map(v => v / 1024));
  if (!cache) {
    cache = { image, colorSpace: map.colorSpace, gains: new Map() };
    paintedBaseGain.set(map, cache);
  }
  cache.gains.set(key, gain);
  return gain;
}
export function applyPaintedTile(material, family) {
  const spec = PAINTED_TILES[family];
  if (!material || !spec || material.userData.r7bPaintedTile) return material;
  // Node structural tests have no image decoder; retain shader metadata there.
  let texture = paintedTileCache.get(family);
  if (!texture && typeof document !== 'undefined' && typeof document.createElementNS === 'function') {
    texture = new THREE.TextureLoader().load(new URL(`../../assets/materials/r7b-${spec[0]}.png`, import.meta.url).href);
    texture.name = `r7b:${family}`;
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 8;
    paintedTileCache.set(family, texture);
  }
  material.userData.r7bPaintedTile = { family, metres: spec[1], texture, bytes: 1024 * 1024 * 4 * 4 / 3 };
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.r7bTile = { value: texture ?? null };
    shader.uniforms.r7bMetres = { value: spec[1] };
    shader.uniforms.r7bBaseGain = { value: paintedAlbedoGain(material.map, shader.uniforms, material.userData) };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vR7bWorld;\nvarying vec2 vR7bOrigin;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
vec4 r7bPoint = vec4(transformed, 1.0);
vec4 r7bOrigin = vec4(0.0, 0.0, 0.0, 1.0);
#ifdef USE_INSTANCING
r7bPoint = instanceMatrix * r7bPoint;
r7bOrigin = instanceMatrix * r7bOrigin;
#endif
vR7bWorld = (modelMatrix * r7bPoint).xyz;
vR7bOrigin = (modelMatrix * r7bOrigin).xz;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vR7bWorld;
varying vec2 vR7bOrigin;
uniform sampler2D r7bTile;
uniform float r7bMetres;
uniform vec3 r7bBaseGain;
vec2 r7bHash(vec2 p) { return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453); }
vec4 r7bSample(vec2 uv) {
  // Triangular stochastic tiling: neighbours share interpolation weights but
  // sample independently offset tiles, removing the exact one-tile period.
  vec2 cell = floor(uv); vec2 f = fract(uv);
  float upper = step(1.0, f.x+f.y);
  vec2 a = cell + vec2(upper); vec2 b = cell + vec2(1.0,0.0); vec2 c = cell + vec2(0.0,1.0);
  vec3 w = upper > .5 ? vec3(f.x+f.y-1.0,1.0-f.y,1.0-f.x) : vec3(1.0-f.x-f.y,f.x,f.y);
  vec2 ua=fract(uv+r7bHash(a)), ub=fract(uv+r7bHash(b)), uc=fract(uv+r7bHash(c));
  vec4 sampleValue = texture2D(r7bTile,ua)*w.x
    + texture2D(r7bTile,ub)*w.y + texture2D(r7bTile,uc)*w.z;
  // Only restore albedo variance. Keep the data channels convex and bounded.
  sampleValue.r = max(.025, .35+(sampleValue.r-.35)/sqrt(dot(w,w)));
  return sampleValue;
}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
vec3 r7bFace=abs(cross(dFdx(vR7bWorld),dFdy(vR7bWorld)));
vec2 r7bUv = r7bFace.y > max(r7bFace.x,r7bFace.z) ? vR7bWorld.xz
  : (r7bFace.x > r7bFace.z ? vR7bWorld.zy : vR7bWorld.xy);
vec2 r7bLot=r7bHash(floor(vR7bOrigin/16.0));
r7bUv = r7bUv/r7bMetres;
// Half-turns preserve horizontal brick courses/weatherboards.
r7bUv *= r7bLot.x > .5 ? -1.0 : 1.0;
r7bUv += r7bLot*19.0;
vec4 r7bChannels = r7bSample(r7bUv);
diffuseColor.rgb = diffuse * r7bBaseGain * r7bChannels.r/.35;
#include <color_fragment>`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
vec3 r7bPacked=r7bChannels.gba;
// The packed map supplies local variation, while the material still owns the
// finish. Replacing roughness outright made painted metal and masonry respond
// identically wherever they shared a tile. Ignore the superseded UV roughness
// map here: its pattern is not registered to this world-space packed texture.
roughnessFactor = clamp(roughness * (0.75 + 0.35 * r7bPacked.b), 0.04, 1.0);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
vec2 r7bN=r7bPacked.rg*2.0-1.0;
vec3 r7bDx=dFdx(-vViewPosition), r7bDy=dFdy(-vViewPosition);
vec2 r7bDu=dFdx(r7bUv), r7bDv=dFdy(r7bUv);
vec3 r7bT=cross(r7bDy,normal)*r7bDu.x+cross(normal,r7bDx)*r7bDv.x;
vec3 r7bB=cross(r7bDy,normal)*r7bDu.y+cross(normal,r7bDx)*r7bDv.y;
float r7bInv=inversesqrt(max(max(dot(r7bT,r7bT),dot(r7bB,r7bB)),1e-8));
normal=normalize(normal*sqrt(max(.01,1.0-dot(r7bN,r7bN)))+(r7bT*r7bN.x+r7bB*r7bN.y)*r7bInv);`);
  };
  material.customProgramCacheKey = () => `${previousKey.call(material)}|p23-photo-rgba-v2:${family}`;
  material.needsUpdate = true;
  return material;
}
