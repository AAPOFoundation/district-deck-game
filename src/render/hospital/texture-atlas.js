// District Deck — hospital-scoped procedural material atlas.
//
// Hospital geometry is authored and merged in one building-local coordinate system. This pack
// therefore projects four quiet PBR surfaces in authored metres and applies three explicitly
// bounded wear stories in that same coordinate system. It never clones materials, adds meshes,
// changes geometry attributes or mutates a default MaterialLibrary family.

import * as THREE from 'three';
import { hashSeed, sobelNormalFromHeight } from '../textures.js';

const TILE_ORDER = Object.freeze(['concrete', 'render', 'brick', 'metal']);
const COLUMNS = 2;
const ROWS = 2;
const GUTTER = 8;
const QUALITY_TILE_SIZE = Object.freeze({ high: 256, medium: 192, low: 128 });
const WEAR_KINDS = Object.freeze({ baseSplash: 0, parapetRunoff: 1, serviceExhaust: 2 });
const BASE_SHADER_STATE = new WeakMap();

const SURFACE_PROFILES = Object.freeze({
  agedConcrete: Object.freeze({
    tile: 'concrete', metres: [4.8, 3.6], phase: [0.11, 0.17], normal: 0.18,
  }),
  renderedMasonry: Object.freeze({
    tile: 'render', metres: [3.9, 3.4], phase: [0.29, 0.07], normal: 0.12,
  }),
  redBrick: Object.freeze({
    tile: 'brick', metres: [2.76, 1.52], phase: [0, 0], normal: 0.24,
  }),
  paintedSteel: Object.freeze({
    tile: 'metal', metres: [4.2, 3.2], phase: [0.19, 0.37], normal: 0.075,
  }),
});

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function hashCell(seed, x, y, period) {
  const px = positiveModulo(x, period);
  const py = positiveModulo(y, period);
  let value = (seed ^ Math.imul(px + 1, 0x45d9f3b)
    ^ Math.imul(py + 1, 0x119de1f3)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
}

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

/** Seamless, band-limited value noise; no per-pixel salt-and-pepper grain. */
function periodicNoise(u, v, period, seed) {
  const x = u * period;
  const y = v * period;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smoothstep(x - x0);
  const fy = smoothstep(y - y0);
  const a = hashCell(seed, x0, y0, period);
  const b = hashCell(seed, x0 + 1, y0, period);
  const c = hashCell(seed, x0, y0 + 1, period);
  const d = hashCell(seed, x0 + 1, y0 + 1, period);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fy;
}

function periodicFbm(u, v, seed, basePeriod = 2, octaves = 3) {
  let amplitude = 0.5;
  let sum = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    const period = basePeriod * (2 ** octave);
    sum += periodicNoise(u, v, period, seed + octave * 0x9e3779b9) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
  }
  return sum / weight;
}

function makeChannels(size) {
  return {
    albedo: new Uint8ClampedArray(size * size * 4),
    roughness: new Uint8ClampedArray(size * size * 4),
    height: new Uint8ClampedArray(size * size * 4),
  };
}

function writePixel(channels, size, x, y, rgb, roughness, height) {
  const index = (y * size + x) * 4;
  channels.albedo[index] = clampByte(rgb[0]);
  channels.albedo[index + 1] = clampByte(rgb[1]);
  channels.albedo[index + 2] = clampByte(rgb[2]);
  channels.albedo[index + 3] = 255;
  const roughnessByte = clampByte(roughness);
  channels.roughness[index] = roughnessByte;
  channels.roughness[index + 1] = roughnessByte;
  channels.roughness[index + 2] = roughnessByte;
  channels.roughness[index + 3] = 255;
  const heightByte = clampByte(height);
  channels.height[index] = heightByte;
  channels.height[index + 1] = heightByte;
  channels.height[index + 2] = heightByte;
  channels.height[index + 3] = 255;
}

function generateMineralTile(kind, size, seed) {
  const channels = makeChannels(size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const broad = periodicFbm(u, v, seed, 2, 3) - 0.5;
      const medium = periodicNoise(u, v, 10, seed ^ 0x517cc1b7) - 0.5;
      if (kind === 'concrete') {
        // Broad aggregate cloud and restrained board lift; deliberately no form-tie dots.
        const board = Math.sin(v * Math.PI * 8) * 1.6;
        const value = 239 + broad * 15 + medium * 3 + board;
        writePixel(channels, size, x, y,
          [value + 2, value, value - 3], 237 + broad * 12, 128 + broad * 9 + board);
      } else {
        // Directional trowel history remains readable after miniature downsampling.
        const trowel = Math.sin((u * 2.0 + v * 1.3) * Math.PI * 2) * 2.2;
        const value = 244 + broad * 10 + medium * 2 + trowel;
        writePixel(channels, size, x, y,
          [value + 2, value + 1, value - 2], 242 + broad * 8, 128 + broad * 5 + trowel);
      }
    }
  }
  return channels;
}

function generateBrickTile(size, seed) {
  const channels = makeChannels(size);
  const brickWidth = size / 12;
  const brickHeight = size / 20;
  const mortar = Math.max(0.75, size / 180);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const row = Math.floor(y / brickHeight);
      const offset = (row & 1) ? brickWidth * 0.5 : 0;
      const localX = positiveModulo(x + offset, brickWidth);
      const localY = positiveModulo(y, brickHeight);
      const inMortar = localX < mortar || localY < mortar;
      const column = Math.floor((x + offset) / brickWidth);
      const brickTone = hashCell(seed, column, row, 32) - 0.5;
      const kiln = periodicFbm(x / size, y / size, seed ^ 0x6c8e9cf5, 2, 3) - 0.5;
      if (inMortar) {
        const value = 229 + kiln * 7;
        writePixel(channels, size, x, y, [value, value - 3, value - 7], 251, 113);
      } else {
        const value = 242 + brickTone * 15 + kiln * 8;
        writePixel(channels, size, x, y,
          [value + 3, value - 1, value - 8], 229 + Math.abs(brickTone) * 18, 132 + kiln * 4);
      }
    }
  }
  return channels;
}

function generateMetalTile(size, seed) {
  const channels = makeChannels(size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const broad = periodicFbm(u, v, seed, 2, 3) - 0.5;
      const roller = Math.sin(v * Math.PI * 20 + Math.sin(u * Math.PI * 2) * 0.35);
      const seam = Math.min(1, Math.abs(positiveModulo(u * 4 + 0.5, 1) - 0.5) * 18);
      const value = 243 + broad * 8 + roller * 1.8 - (1 - seam) * 3;
      writePixel(channels, size, x, y,
        [value + 1, value, value - 2], 216 + broad * 20 + roller * 3, 128 + roller * 3);
    }
  }
  return channels;
}

/** Exported for deterministic hospital-local diagnostics. */
export function generateHospitalSurfaceTile(kind, size = 128) {
  if (!TILE_ORDER.includes(kind)) throw new RangeError(`Unknown hospital surface tile: ${kind}`);
  if (!Number.isInteger(size) || size < 32) {
    throw new RangeError('Hospital surface tile size must be an integer >= 32');
  }
  const seed = hashSeed(`district-deck:hospital-atlas:r1:${kind}:${size}`);
  if (kind === 'concrete' || kind === 'render') return generateMineralTile(kind, size, seed);
  if (kind === 'brick') return generateBrickTile(size, seed);
  return generateMetalTile(size, seed);
}

function copyPixel(target, targetIndex, source, sourceIndex) {
  target[targetIndex] = source[sourceIndex];
  target[targetIndex + 1] = source[sourceIndex + 1];
  target[targetIndex + 2] = source[sourceIndex + 2];
  target[targetIndex + 3] = source[sourceIndex + 3];
}

function dataTexture(data, width, height, colorSpace, name) {
  const texture = new THREE.DataTexture(
    data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType,
  );
  texture.name = name;
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  texture.userData.procedural = true;
  texture.userData.hospitalAtlas = true;
  return texture;
}

function makeAtlas(tileSize) {
  const width = tileSize * COLUMNS;
  const height = tileSize * ROWS;
  const albedo = new Uint8ClampedArray(width * height * 4);
  const roughness = new Uint8ClampedArray(width * height * 4);
  const normal = new Uint8ClampedArray(width * height * 4);
  const contentSize = tileSize - GUTTER * 2;
  const regions = {};

  for (let index = 0; index < TILE_ORDER.length; index += 1) {
    const kind = TILE_ORDER[index];
    const maps = generateHospitalSurfaceTile(kind, contentSize);
    const normalPixels = sobelNormalFromHeight(
      maps.height, contentSize, kind === 'brick' ? 1.25 : kind === 'metal' ? 0.72 : 0.96,
    );
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const originX = column * tileSize;
    const originY = row * tileSize;

    // Replicated gutters keep every useful mip level inside the selected material cell.
    for (let y = 0; y < tileSize; y += 1) {
      const sourceY = Math.max(0, Math.min(contentSize - 1, y - GUTTER));
      for (let x = 0; x < tileSize; x += 1) {
        const sourceX = Math.max(0, Math.min(contentSize - 1, x - GUTTER));
        const sourceIndex = (sourceY * contentSize + sourceX) * 4;
        const targetIndex = ((originY + y) * width + originX + x) * 4;
        copyPixel(albedo, targetIndex, maps.albedo, sourceIndex);
        copyPixel(roughness, targetIndex, maps.roughness, sourceIndex);
        copyPixel(normal, targetIndex, normalPixels, sourceIndex);
      }
    }

    regions[kind] = Object.freeze({
      offset: [(originX + GUTTER + 0.5) / width, (originY + GUTTER + 0.5) / height],
      scale: [(contentSize - 1) / width, (contentSize - 1) / height],
    });
  }

  return {
    width,
    height,
    regions: Object.freeze(regions),
    albedo: dataTexture(albedo, width, height, THREE.SRGBColorSpace, 'dd-hospital-r1-albedo'),
    roughness: dataTexture(
      roughness, width, height, THREE.NoColorSpace, 'dd-hospital-r1-roughness',
    ),
    normal: dataTexture(normal, width, height, THREE.NoColorSpace, 'dd-hospital-r1-normal'),
  };
}

export class HospitalTextureAtlas {
  constructor({ quality = 'high' } = {}) {
    this.quality = QUALITY_TILE_SIZE[quality] ? quality : 'high';
    this.tileSize = QUALITY_TILE_SIZE[this.quality];
    Object.assign(this, makeAtlas(this.tileSize));
    this.id = `hospital-atlas-r1-${this.quality}`;
    this.disposed = false;
  }

  textureBytes() {
    // RGBA8, three maps and the complete generated mip chain.
    return Math.round(this.width * this.height * 4 * 1.34 * 3);
  }

  dispose() {
    if (this.disposed) return;
    this.albedo.dispose();
    this.roughness.dispose();
    this.normal.dispose();
    this.disposed = true;
  }
}

/** MaterialLibrary owns the one cached hospital pack and releases it during board teardown. */
export function getHospitalTextureAtlas(materials) {
  if (!materials || typeof materials.registerTexturePack !== 'function') return null;
  materials.userData ??= Object.create(null);
  if (materials.userData.hospitalTextureAtlas) return materials.userData.hospitalTextureAtlas;
  const atlas = new HospitalTextureAtlas({ quality: materials.quality });
  materials.userData.hospitalTextureAtlas = atlas;
  materials.registerTexturePack(atlas);
  return atlas;
}

function finiteNumber(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function vec3(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  return source.map((item, index) => finiteNumber(item, fallback[index]));
}

function normaliseWear(wear) {
  const zones = wear?.zones ?? [];
  if (zones.length !== 0 && zones.length !== 3) {
    throw new RangeError('Hospital macro wear must define exactly three zones or none');
  }
  const normalised = zones.map((zone, index) => {
    const kindName = zone?.kind ?? Object.keys(WEAR_KINDS)[index];
    if (!(kindName in WEAR_KINDS)) throw new RangeError(`Unknown hospital wear kind: ${kindName}`);
    const radius = vec3(zone.radius, [1, 1, 0.4]).map((item) => Math.max(0.01, Math.abs(item)));
    let normal = vec3(zone.normal, [0, 0, 1]);
    const normalLength = Math.hypot(...normal);
    normal = normalLength > 1e-5
      ? normal.map((item) => item / normalLength)
      : [0, 0, 1];
    return Object.freeze({
      kind: kindName,
      kindId: WEAR_KINDS[kindName],
      center: vec3(zone.center, [0, 0, 0]),
      radius,
      normal,
      tint: vec3(zone.tint, kindName === 'serviceExhaust'
        ? [0.17, 0.15, 0.13] : [0.28, 0.27, 0.24]).map((item) => Math.max(0, Math.min(1, item))),
      strength: Math.max(0, Math.min(0.65, finiteNumber(zone.strength, 0.16))),
      roughness: Math.max(-0.35, Math.min(0.35, finiteNumber(zone.roughness, 0.08))),
      irregularity: Math.max(0, Math.min(1, finiteNumber(zone.irregularity, 0.5))),
    });
  });
  while (normalised.length < 3) {
    normalised.push(Object.freeze({
      kind: Object.keys(WEAR_KINDS)[normalised.length],
      kindId: normalised.length,
      center: [0, 0, 0],
      radius: [1, 1, 1],
      normal: [0, 0, 1],
      tint: [0, 0, 0],
      strength: 0,
      roughness: 0,
      irregularity: 0,
    }));
  }
  return Object.freeze({
    seed: finiteNumber(wear?.seed, 0.5),
    count: zones.length,
    zones: Object.freeze(normalised),
  });
}

function installHospitalShader(material, atlas, profile, region, wear) {
  if (!BASE_SHADER_STATE.has(material)) {
    BASE_SHADER_STATE.set(material, {
      onBeforeCompile: material.onBeforeCompile,
      customProgramCacheKey: material.customProgramCacheKey.bind(material),
    });
  }
  const base = BASE_SHADER_STATE.get(material);
  material.onBeforeCompile = (shader, renderer) => {
    base.onBeforeCompile?.call(material, shader, renderer);
    shader.uniforms.ddHospitalAtlasOffset = { value: new THREE.Vector2(...region.offset) };
    shader.uniforms.ddHospitalAtlasScale = { value: new THREE.Vector2(...region.scale) };
    shader.uniforms.ddHospitalAtlasMetres = { value: new THREE.Vector2(...profile.metres) };
    shader.uniforms.ddHospitalAtlasPhase = { value: new THREE.Vector2(...profile.phase) };
    shader.uniforms.ddHospitalWearSeed = { value: wear.seed };
    wear.zones.forEach((zone, index) => {
      shader.uniforms[`ddHospitalWearCenter${index}`] = {
        value: new THREE.Vector3(...zone.center),
      };
      shader.uniforms[`ddHospitalWearRadius${index}`] = {
        value: new THREE.Vector3(...zone.radius),
      };
      shader.uniforms[`ddHospitalWearNormal${index}`] = {
        value: new THREE.Vector3(...zone.normal),
      };
      shader.uniforms[`ddHospitalWearTint${index}`] = { value: new THREE.Color(...zone.tint) };
      shader.uniforms[`ddHospitalWearParams${index}`] = {
        value: new THREE.Vector4(
          zone.strength, zone.roughness, zone.kindId, zone.irregularity,
        ),
      };
    });

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 ddHospitalLocalPosition;\nvarying vec3 ddHospitalLocalNormal;',
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
ddHospitalLocalPosition = transformed;
ddHospitalLocalNormal = objectNormal;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 ddHospitalLocalPosition;
varying vec3 ddHospitalLocalNormal;
uniform vec2 ddHospitalAtlasOffset;
uniform vec2 ddHospitalAtlasScale;
uniform vec2 ddHospitalAtlasMetres;
uniform vec2 ddHospitalAtlasPhase;
uniform float ddHospitalWearSeed;
uniform vec3 ddHospitalWearCenter0;
uniform vec3 ddHospitalWearCenter1;
uniform vec3 ddHospitalWearCenter2;
uniform vec3 ddHospitalWearRadius0;
uniform vec3 ddHospitalWearRadius1;
uniform vec3 ddHospitalWearRadius2;
uniform vec3 ddHospitalWearNormal0;
uniform vec3 ddHospitalWearNormal1;
uniform vec3 ddHospitalWearNormal2;
uniform vec3 ddHospitalWearTint0;
uniform vec3 ddHospitalWearTint1;
uniform vec3 ddHospitalWearTint2;
uniform vec4 ddHospitalWearParams0;
uniform vec4 ddHospitalWearParams1;
uniform vec4 ddHospitalWearParams2;
vec2 ddHospitalProjection(vec3 p, vec3 n) {
  vec3 axis = abs(normalize(n));
  if (axis.y >= axis.x && axis.y >= axis.z) return p.xz;
  if (axis.x >= axis.z) return p.zy;
  return p.xy;
}
float ddHospitalWearMask(
  vec3 p, vec3 n, vec3 center, vec3 radius, vec3 faceNormal, vec4 params
) {
  float face = smoothstep(0.48, 0.9, dot(normalize(n), normalize(faceNormal)));
  vec3 q = (p - center) / max(radius, vec3(0.01));
  float broadA = sin(dot(p.xz, vec2(0.43, -0.31)) + ddHospitalWearSeed * 11.0);
  float broadB = cos(dot(p.xy, vec2(0.24, 0.37)) - ddHospitalWearSeed * 7.0);
  float boundary = length(q) + (broadA * 0.035 + broadB * 0.025) * params.w;
  float support = 1.0 - smoothstep(0.76, 1.0, boundary);
  float baseStory = 0.88 + 0.12 * broadA;
  float runoffStory = 0.82 + 0.18 * sin(p.x * 0.78 + p.y * 0.17 + ddHospitalWearSeed * 5.0);
  float exhaustStory = 0.86 + 0.14 * cos(p.x * 0.32 - p.y * 0.28 + ddHospitalWearSeed * 3.0);
  float story = params.z < 0.5 ? baseStory : params.z < 1.5 ? runoffStory : exhaustStory;
  return face * support * story * params.x;
}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `vec3 ddHospitalN = normalize(ddHospitalLocalNormal);
vec2 ddHospitalSurfacePosition = ddHospitalProjection(ddHospitalLocalPosition, ddHospitalN);
vec2 ddHospitalSurfaceUv = ddHospitalSurfacePosition / ddHospitalAtlasMetres
  + ddHospitalAtlasPhase;
vec2 ddHospitalSampleUv = ddHospitalAtlasOffset
  + fract(ddHospitalSurfaceUv) * ddHospitalAtlasScale;
vec4 ddHospitalSurfaceData = vec4(1.0);
#ifdef USE_ROUGHNESSMAP
  ddHospitalSurfaceData = texture2D(roughnessMap, ddHospitalSampleUv);
#endif
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D(map, ddHospitalSampleUv);
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = sRGBTransferEOTF(sampledDiffuseColor);
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif
float ddHospitalWear0 = ddHospitalWearMask(
  ddHospitalLocalPosition, ddHospitalN, ddHospitalWearCenter0,
  ddHospitalWearRadius0, ddHospitalWearNormal0, ddHospitalWearParams0
);
float ddHospitalWear1 = ddHospitalWearMask(
  ddHospitalLocalPosition, ddHospitalN, ddHospitalWearCenter1,
  ddHospitalWearRadius1, ddHospitalWearNormal1, ddHospitalWearParams1
);
float ddHospitalWear2 = ddHospitalWearMask(
  ddHospitalLocalPosition, ddHospitalN, ddHospitalWearCenter2,
  ddHospitalWearRadius2, ddHospitalWearNormal2, ddHospitalWearParams2
);
diffuseColor.rgb = mix(diffuseColor.rgb, ddHospitalWearTint0, ddHospitalWear0);
diffuseColor.rgb = mix(diffuseColor.rgb, ddHospitalWearTint1, ddHospitalWear1);
diffuseColor.rgb = mix(diffuseColor.rgb, ddHospitalWearTint2, ddHospitalWear2);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  roughnessFactor *= ddHospitalSurfaceData.g;
#endif
roughnessFactor = clamp(
  roughnessFactor
    + ddHospitalWear0 * ddHospitalWearParams0.y
    + ddHospitalWear1 * ddHospitalWearParams1.y
    + ddHospitalWear2 * ddHospitalWearParams2.y,
  0.04,
  0.995
);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
#ifdef USE_NORMALMAP_OBJECTSPACE
  normal = texture2D(normalMap, ddHospitalSampleUv).xyz * 2.0 - 1.0;
  #ifdef FLIP_SIDED
    normal = -normal;
  #endif
  #ifdef DOUBLE_SIDED
    normal = normal * faceDirection;
  #endif
  normal = normalize(normalMatrix * normal);
#elif defined(USE_NORMALMAP_TANGENTSPACE)
  vec3 mapN = texture2D(normalMap, ddHospitalSampleUv).xyz * 2.0 - 1.0;
  #if defined(USE_PACKED_NORMALMAP)
    mapN = vec3(mapN.xy, sqrt(saturate(1.0 - dot(mapN.xy, mapN.xy))));
  #endif
  mapN.xy *= normalScale;
  mat3 ddHospitalTbn = getTangentFrame(-vViewPosition, normal, ddHospitalSurfaceUv);
  normal = normalize(ddHospitalTbn * mapN);
#elif defined(USE_BUMPMAP)
  normal = perturbNormalArb(-vViewPosition, normal, dHdxy_fwd(), faceDirection);
#endif`,
    );
  };
  material.customProgramCacheKey = () => `${base.customProgramCacheKey()}|hospital-atlas-r1-local-wear`;
  material.needsUpdate = true;
}

/**
 * Apply one hospital surface to an existing shared-library material in place.
 *
 * `wear.zones`, when supplied, must contain exactly three explicitly bounded local-space
 * regions: normally baseSplash, parapetRunoff and serviceExhaust. Reapplying the same profile
 * and zone values is a no-op, preserving the material bucket and shader hook identity.
 */
export function applyHospitalMaterialSurface(material, atlas, profileId, wear = null) {
  if (!material || !atlas) return false;
  const profile = SURFACE_PROFILES[profileId];
  if (!profile) throw new RangeError(`Unknown hospital material profile: ${profileId}`);
  const region = atlas.regions[profile.tile];
  if (!region) throw new Error(`Hospital atlas is missing ${profile.tile}`);
  const normalisedWear = normaliseWear(wear);
  const configurationKey = `${atlas.id}:${profileId}:${JSON.stringify(normalisedWear)}`;
  material.userData ??= {};
  if (material.userData.hospitalTextureAtlasConfiguration === configurationKey) return true;

  material.map = atlas.albedo;
  material.roughnessMap = atlas.roughness;
  material.normalMap = atlas.normal;
  material.aoMap = null;
  material.bumpMap = null;
  material.displacementMap = null;
  material.normalScale?.setScalar(profile.normal);
  material.userData.hospitalTextureAtlas = {
    id: atlas.id,
    profile: profileId,
    tile: profile.tile,
    coordinateSpace: 'hospital-local',
    metres: [...profile.metres],
    wearZoneCount: normalisedWear.count,
    drawCallDelta: 0,
  };
  material.userData.hospitalTextureAtlasConfiguration = configurationKey;
  installHospitalShader(material, atlas, profile, region, normalisedWear);
  return true;
}

export const HOSPITAL_SURFACE_PROFILES = SURFACE_PROFILES;
export const HOSPITAL_ATLAS_TILES = TILE_ORDER;
export const HOSPITAL_WEAR_KINDS = WEAR_KINDS;
