// District Deck V3.10 — W1-RENDER material library.
//
// One factory, shared cached MeshPhysicalMaterial per surface family. Albedo / roughness /
// normal / AO come from textures.js. envMap is left null at creation so LightingRig can
// assign the PMREM cube and own envMapIntensity via applyEnvironmentToScene.
//
// The renderer never writes simulation state. No Math.random / Date.now.

import { tagSurface } from './style/restyle.js';
import { restyleColour } from './style/restyle.js';
import { readRestyle } from './style/restyle.js';
import { recordPortSurfaceSource } from './style/restyle.js';
import * as THREE from 'three';
import { scheduleKitAO, applyKitAO } from './kit-ao.js';
import { applyBeauxSurfaceFinish, createBeauxPlasterMap, isBeauxSurfaceMaterial } from './residential/beaux-surfaces-r72.js';
import { applyDecoSurfaceFinish } from './residential/deco-surfaces-r77.js';
import {
  applyModerneSurfaceFinish,
  authorMissingModerneAttributes,
  isModerneSurfaceMaterial,
} from './residential/moderne-surfaces-r79.js';
import {
  BUILDING_WEATHER_ATLAS,
  BUILDING_WEATHER_ROLE,
  TextureLibrary,
  MICRO_SPECS,
  hashSeed,
  makeRng,
  applyPaintedTile,
} from './textures.js';
import { P1_HIGHLIGHT, P4_GRUNGE } from './v4-p1-polish.js';
import { TASTE } from './taste-tokens.js';
import { DRY_CAST, DRY_CAST_GLSL, ROAD_SURFACE_COMMON_GLSL, roadSurfaceBodyGlsl } from './wet-road.js';

// W4-B: city lawns (ground tile, block cores, childcare lawn) are one lush green blended toward
// the dry token over roughly 28% of the area, in world metres, so no tile repeats.
const lawnRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const LAWN_DRY_MUL = lawnRgb(TASTE.ground.grassDry).map((c) => (c / lawnRgb(TASTE.ground.grassLush)[1]).toFixed(3));
const LAWN_FIELD_GLSL = `
float ddLawnH(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float ddLawnN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(ddLawnH(i), ddLawnH(i + vec2(1., 0.)), f.x), mix(ddLawnH(i + vec2(0., 1.)), ddLawnH(i + vec2(1., 1.)), f.x), f.y); }`;

/**
 * Surface families required by V3.10 §7. `textureSet` is the procedural pack id in
 * textures.js; null means a pure physical material (glass, and water which is glass-like).
 */
export const MATERIAL_FAMILIES = Object.freeze({
  brick: {
    textureSet: 'brick',
    color: '#c4a090',
    roughness: 0.90,
    metalness: 0.0,
    envBase: 0.58,
    normalScale: 0.85,
    repeat: 3,
  },
  render: {
    textureSet: 'render',
    color: '#e8e0d4',
    roughness: 0.90,
    metalness: 0.0,
    envBase: 0.56,
    normalScale: 0.62,
    repeat: 2,
  },
  weatherboard: {
    textureSet: 'weatherboard',
    color: '#f0ebe0',
    roughness: 0.84,
    metalness: 0.0,
    envBase: 0.58,
    normalScale: 0.7,
    repeat: 2.5,
  },
  corrugated: {
    textureSet: 'corrugation',
    // Lifted so land-use-free instance white still reads as iron, not void.
    // r3: higher roughness / lower metal+env so altitude roofs lose plastic sheen.
    color: '#c8ced4',
    roughness: 0.90,
    metalness: 0.0,
    envBase: 0.46,
    normalScale: 1.15,
    repeat: 4,
    anisotropy: 0.46,
    anisotropyRotation: Math.PI / 2,
    specularIntensity: 0.22,
  },
  slate: {
    textureSet: 'slate',
    // r3: slightly rougher tile/slate so specular stays mineral, not clearcoat.
    color: '#9aa4b0',
    roughness: 0.90,
    metalness: 0.0,
    envBase: 0.46,
    normalScale: 0.75,
    repeat: 3,
    specularIntensity: 0.22,
  },
  tile: {
    textureSet: 'tile',
    color: '#a2432b',
    roughness: 0.92,
    metalness: 0.0,
    envBase: 0.44,
    normalScale: 1.0,
    repeat: 3.5,
    specularIntensity: 0.20,
  },
  asphalt: {
    textureSet: 'asphalt',
    color: '#3a3e42',
    roughness: 0.92,
    metalness: 0.0,
    envBase: 0.55,
    normalScale: 0.70,
    repeat: 6,
  },
  limestone: {
    textureSet: 'limestone',
    color: '#d8d4c8',
    roughness: 0.88,
    metalness: 0.0,
    normalScale: 1.15,
    envBase: 0.58,
  },
  concrete: {
    textureSet: 'concrete',
    color: '#c8c4bc',
    roughness: 0.92,
    metalness: 0.0,
    envBase: 0.42,
    specularIntensity: 0.22,
    normalScale: 0.68,
    repeat: 3,
  },
  glass: {
    textureSet: null,
    // Dark cool shopfront pane (V01 milk-bar): alpha so depth reads, not cream frost.
    color: '#152833',
    roughness: 0.12,
    metalness: 0.0,
    envBase: 1.18,
    transparent: true,
    opacity: 0.58,
    transmission: 0.0,
    ior: 1.5,
    specularIntensity: 0.72,
  },
  painted_metal: {
    textureSet: 'painted_metal',
    color: '#d8c090',
    roughness: 0.42,
    metalness: 0.35,
    envBase: 1.15,
    normalScale: 0.35,
    clearcoat: 0.35,
    clearcoatRoughness: 0.3,
    repeat: 2,
  },
  timber: {
    textureSet: 'timber',
    color: '#c4a070',
    roughness: 0.78,
    metalness: 0.0,
    envBase: 0.78,
    normalScale: 0.65,
    repeat: 2,
  },
  sand: {
    textureSet: 'sand',
    color: '#e0c890',
    roughness: 0.95,
    metalness: 0.0,
    envBase: 0.5,
    normalScale: 0.4,
    repeat: 4,
  },
  foliage: {
    textureSet: 'foliage',
    color: '#6a8a48',
    roughness: 0.92,
    metalness: 0.0,
    envBase: 0.55,
    normalScale: 0.55,
    repeat: 5,
  },
  /** Board water until W2-NATURE ships the full shader. Glass-like physical surface. */
  water: {
    textureSet: null,
    color: '#1a5a6e',
    roughness: 0.12,
    metalness: 0.12,
    envBase: 1.4,
    transparent: true,
    opacity: 0.88,
  },
});

export const FAMILY_IDS = Object.freeze(Object.keys(MATERIAL_FAMILIES));

// P23: final kit trim values, after atlas palette matching. Keep these scoped to
// architectural joinery; the shared painted-metal family also serves vehicles.
export const KIT_DARK_TRIM = Object.freeze({
  charcoal: '#414446',
  bronze: '#464039',
  roughness: 0.72,
  metalness: 0.12,
});

const kitWallRoofBaseGains = new WeakMap();

export const KIT_ROOF_EDGE_PALETTE = Object.freeze({
  gutter: Object.freeze({ family: 'painted_metal', color: '#afb4b5', floor: 0.35, roughness: 0.5, metalness: 0.2 }),
  fascia: Object.freeze({ family: 'render', color: '#d6d1c4', luminance: 0.44, roughness: 0.8, metalness: 0 }),
  coping: Object.freeze({ family: 'concrete', color: '#bdbfb9', luminance: 0.36, roughness: 0.9, metalness: 0 }),
});
// Vertex colours own the enclosure's wall/coping distinction. A white atlas
// multiplier previously cancelled every channel of its base map to reflectance 1.
// Broad concrete absorbs more light than the original chalk-white enclosure.
// Architectural trim keeps its authored hue at a separately controlled value.
export const KIT_ROOF_ENCLOSURE_REFLECTANCE = 0.48;

// These bright residential masses and dressings share authored maps with their
// existing recesses. Adjust only their linear diffuse multiplier, after the
// specialist palette has landed; the darker alternate buckets retain it.
export const KIT_FACADE_VALUES = Object.freeze([
  Object.freeze({ prefix: 'res-wall-walkup-beaux-arts-', luminance: 0.50 }),
  Object.freeze({ prefix: 'res-wall-walkup-moderne-', luminance: 0.56 }),
  Object.freeze({ prefix: 'res-trim-walkup-beaux-arts-', luminance: 0.46 }),
  Object.freeze({ prefix: 'res-wall-alt-art-deco-flats-', multiplier: 0.70, threshold: 0.60 }),
]);

function finishKitFacadeValue(material) {
  const data = material?.userData;
  if (!material?.color || !data || data.kitDarkWalls || data.kitDarkTrim
    || data.family === 'glass' || data.kitRoofEdge || data.kitRoofEdgeFinished
    || data.buildingWeatherOverlay?.role === 'roof') return material;
  const spec = KIT_FACADE_VALUES.find(({ prefix }) => (data.variant ?? '').startsWith(prefix));
  if (!spec) return material;
  const source = material.color.toArray();
  // A shared reference may be finished for many parts, or its specialist palette
  // may be reapplied during later kit assembly. Never compound the multiplier;
  // do reapply it when that palette has restored an authored source colour.
  if (data.kitFacadeValue?.color.every((v, i) => v === source[i])) return material;
  const before = source[0] * 0.2126 + source[1] * 0.7152 + source[2] * 0.0722;
  if (!Number.isFinite(before) || before <= (spec.threshold ?? 0)) return material;
  const scale = spec.luminance == null ? spec.multiplier : Math.min(1, spec.luminance / before);
  if (scale >= 1) return material;
  material.color.multiplyScalar(scale);
  data.kitFacadeValue = { cohort: spec.prefix, source, color: material.color.toArray(), before, scale };
  return material;
}

function finishKitRoofEdge(material) {
  if (!material?.color || material.userData.kitRoofEdgeFinished) return material;
  const variant = material.userData.variant ?? '';
  const enclosure = variant.startsWith('p17-b6-roof:');
  const edge = material.userData.kitRoofEdge
    ?? (/^res-trim-walkup-moderne-/.test(variant) ? 'fascia' : null);
  if (!enclosure && !edge) return material;
  const gain = kitAlbedoBaseGain(material);
  const source = material.color.toArray();
  if (enclosure) {
    // The existing vertex colours author each concrete face. Neutralise only the
    // retained atlas hue; the absorption applies equally to every vertex colour.
    // Ruling 75: under ?restyle=1 the enclosure reads x1.3 brighter (walkup-flats and courtyard concrete 47-52 against 62-70).
    const entryId = variant.slice('p17-b6-roof:'.length).split('|')[0];
    // Ruling 80/round 3: courtyard A/B read V64/76 with p99 100 at 2.60.
    // Reduce that exact owner to 2.10; flats, Moderne and other enclosures keep their gains.
    const ownerGain = { 'walkup-flats': 2.52, 'walkup-moderne': 1.70, 'apartment-modern-courtyard': 2.10 }[entryId];
    const base = KIT_ROOF_ENCLOSURE_REFLECTANCE;
    const reflectance = ownerGain == null
      ? base * (readRestyle(globalThis.location?.search ?? '').enabled ? 1.3 : 1)
      : restyleColour(new THREE.Color().setScalar(base), new THREE.Color().setScalar(base * ownerGain),
        { id: `building:${entryId}.roofEnclosure` }).r;
    material.color.setRGB(...gain.map(v => reflectance / Math.max(v, 0.01)));
  } else {
    const spec = KIT_ROOF_EDGE_PALETTE[edge];
    const color = new THREE.Color(spec.color);
    const luma = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
    color.multiplyScalar(spec.luminance == null
      ? Math.max(1, spec.floor / luma) : spec.luminance / luma);
    material.color.setRGB(color.r / Math.max(gain[0], 0.01),
      color.g / Math.max(gain[1], 0.01), color.b / Math.max(gain[2], 0.01));
    material.roughness = spec.roughness;
    material.metalness = spec.metalness;
    material.clearcoat = 0;
  }
  material.userData.kitRoofEdgeFinished = { source, gain, edge: enclosure ? 'enclosure' : edge };
  return material;
}

function kitAlbedoBaseGain(material) {
  // Match paintedAlbedoGain: the neutral photo tile retains the old map's mean.
  // Correct only the colour multiplier, preserving texture, hue, light and wear.
  let gain = [1, 1, 1];
  const map = material.userData.r7bPaintedTile && material.map;
  if (map?.image?.width && typeof document !== 'undefined') {
    gain = kitWallRoofBaseGains.get(map);
    if (!gain) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx?.drawImage) return [1, 1, 1];
      ctx.drawImage(map.image, 0, 0, 32, 32);
      const pixels = ctx.getImageData(0, 0, 32, 32).data;
      gain = [0, 0, 0];
      for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) {
        const v = pixels[i + c] / 255;
        gain[c] += (map.colorSpace === THREE.SRGBColorSpace
          ? (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) : v) / 1024;
      }
      kitWallRoofBaseGains.set(map, gain);
    }
  }
  return gain;
}

function finishKitWallRoofAlbedo(material, palette) {
  const variant = material?.userData?.variant ?? '';
  const family = material?.userData?.family;
  if (!palette || !material?.color || material.userData.kitDarkWalls
    || material.userData.kitDarkTrim || family === 'glass'
    || /interior|void|tyre|tire|vehicle|trim|joinery|shadow|gutter|flashing/i.test(variant)) return material;
  const roof = material.userData.buildingWeatherOverlay?.role === 'roof';
  if (!roof && !/wall|facade|cladding|masonry|rustication|ashlar|precast/i.test(variant)) return material;
  const gain = kitAlbedoBaseGain(material);
  const color = material.color;
  const luma = color.r * gain[0] * 0.2126 + color.g * gain[1] * 0.7152 + color.b * gain[2] * 0.0722;
  if (luma >= palette.threshold || luma <= 0) return material;
  const floor = roof ? palette.roof : family === 'brick'
    ? (/art-deco-flats/.test(variant) ? palette.artDeco
      : /walkup/.test(variant) ? palette.walkup : palette.brick)
    : family === 'weatherboard' ? palette.weatherboard : palette.painted;
  const source = color.toArray();
  // A richer fired-red finish keeps Carlton's exposed brick from reading pink.
  // Preserve its authored hue; normalise reflectance again after saturation.
  const saturation = palette.saturation?.[variant];
  if (saturation != null) {
    const srgb = color.clone().convertLinearToSRGB();
    const hsl = srgb.getHSL({});
    color.copy(srgb.setHSL(hsl.h, saturation, hsl.l).convertSRGBToLinear());
  }
  const adjustedLuma = color.r * gain[0] * 0.2126 + color.g * gain[1] * 0.7152 + color.b * gain[2] * 0.0722;
  color.multiplyScalar(floor / adjustedLuma);
  material.userData.kitDarkWalls = { source, color: color.toArray(), baseGain: gain, before: luma, floor };
  return material;
}

function finishKitDarkTrim(material) {
  const variant = material?.userData?.variant ?? '';
  if (!material?.color || material.userData.kitDarkTrim || material.userData.family === 'glass'
    || /glass|interior|void|tyre|tire|vehicle/.test(variant)
    || !/(?:^res-(?:iron|shadow|trim)-|\|(?:shadow|joinery|trim)$|^kit-.*(?:trim|frame|mullion|iron|eaves|steel|shade|charcoal|flue-lip|dock-black))/.test(variant)) return material;
  const srgb = material.color.clone().convertLinearToSRGB();
  const luma = (srgb.r * 0.2126 + srgb.g * 0.7152 + srgb.b * 0.0722) * 255;
  // Bright stone/cream trims and calibrated atlas multipliers retain their values.
  if (luma >= 70) return material;
  const color = srgb.r > srgb.b ? KIT_DARK_TRIM.bronze : KIT_DARK_TRIM.charcoal;
  const source = { color: material.color.getHexString(), roughness: material.roughness,
    metalness: material.metalness, clearcoat: material.clearcoat };
  material.color.set(color);
  material.roughness = KIT_DARK_TRIM.roughness;
  material.metalness = material.userData.family === 'painted_metal' ? KIT_DARK_TRIM.metalness : 0;
  material.clearcoat = 0;
  material.userData.kitDarkTrim = { color, sourceLuma: luma, source };
  // Atlas texels multiply the paint colour; lifting only the multiplier still
  // leaves black texels black. Give this dark paint a charcoal albedo base while
  // retaining texture variation above it. This acts before physical lighting:
  // cast shadows, AO and specular remain lighting, with no emissive/output floor.
  const base = { value: new THREE.Color(color) };
  material.userData.kitDarkTrim.albedoBase = base;
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    shader.uniforms.p23TrimAlbedoBase = base;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 p23TrimAlbedoBase;')
      .replace('#include <lights_physical_fragment>', `
diffuseColor.rgb = p23TrimAlbedoBase + (vec3(1.0) - p23TrimAlbedoBase) * diffuseColor.rgb;
#include <lights_physical_fragment>`);
  };
  material.customProgramCacheKey = () => `${previousKey}|p23-dark-trim-albedo`;
  material.needsUpdate = true;
  return material;
}

/**
 * V5.0 Lane H — grungy Monopoly Plus albedo variants.
 * Base FAMILY hexes stay the SURFACE-AUTHORING hold (p4-grunge). Live board
 * colour rides instance tint: variant / base, hashed by parcel id, no RNG.
 * Wear stays in seams (textures.js); this table is chroma only.
 */
// P21 D1 extends R3's BOARD_EDGE/venue-ground asphalt and paving values.
// Wear slots index BUILDING_WEATHER_ATLAS.roles; null means no architectural wear.
export const CITY_FINISHES = Object.freeze({
  asphalt: Object.freeze({ color: '#4d4b47', roughness: 0.94, metalness: 0, wearAtlasSlot: 2 }),
  paving: Object.freeze({ color: '#c3bfb7', roughness: 0.92, metalness: 0, wearAtlasSlot: 2 }),
  kerb: Object.freeze({ color: '#c3bfb7', roughness: 0.92, metalness: 0, wearAtlasSlot: 2 }),
  concrete: Object.freeze({ color: MATERIAL_FAMILIES.concrete.color, roughness: 0.92, metalness: 0, wearAtlasSlot: 2 }),
  paintedSteel: Object.freeze({ color: '#232a2d', roughness: 0.90, metalness: 0, wearAtlasSlot: 0 }),
  timber: Object.freeze({ color: MATERIAL_FAMILIES.timber.color, roughness: 0.84, metalness: 0, wearAtlasSlot: 0 }),
  glass: Object.freeze({ color: MATERIAL_FAMILIES.glass.color, roughness: 0.12, metalness: 0, wearAtlasSlot: null }),
  terracotta: Object.freeze({ color: MATERIAL_FAMILIES.tile.color, roughness: 0.92, metalness: 0, wearAtlasSlot: 1 }),
  brick: Object.freeze({ color: MATERIAL_FAMILIES.brick.color, roughness: 0.90, metalness: 0, wearAtlasSlot: 0 }),
  render: Object.freeze({ color: MATERIAL_FAMILIES.render.color, roughness: 0.90, metalness: 0, wearAtlasSlot: 0 }),
  foliage: Object.freeze({ color: MATERIAL_FAMILIES.foliage.color, roughness: 0.92, metalness: 0, wearAtlasSlot: null }),
  water: Object.freeze({ color: MATERIAL_FAMILIES.water.color, roughness: 0.12, metalness: 0.12, wearAtlasSlot: null }),
  sand: Object.freeze({ color: MATERIAL_FAMILIES.sand.color, roughness: 0.95, metalness: 0, wearAtlasSlot: null }),
  grass: Object.freeze({ color: '#858c62', roughness: 0.92, metalness: 0, wearAtlasSlot: null }),
});

// V370 §2 requires nine separated value buckets, but supplies no numeric ramp.
// These are authored sRGB value anchors, from reveal/metalwork through lit trim.
export const CITY_VALUE_RAMP = Object.freeze([0.08, 0.16, 0.25, 0.36, 0.49, 0.63, 0.77, 0.90, 1]);
export const CITY_PAINT_HUES = Object.freeze(Array.from({ length: 30 }, (_, i) => i * 12));
export const CITY_SATURATION_RAMP = Object.freeze([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
export const CITY_NEAR_DUPLICATE = Object.freeze({ hueDegrees: 6, rgbDistance: 0.06, neutralSaturation: 0.12 });
// Large masonry fields keep close matches. Smaller painted/wood/planting buckets
// deliberately adopt the measured nine-band palette, including its authored hue variety.
export const CITY_ATLAS_MATCH_LIMITS = Object.freeze({
  concrete: 0.08, painted_metal: Infinity, timber: Infinity, foliage: Infinity,
});
// Nine value-ordered atlas multiplier bands, measured from the city entry census.
// These retain each atlas's colour compensation; they are NOT display-space swatches.
// Neutral white is reserved for geometry whose vertex colours already own the palette.
export const CITY_ATLAS_RAMPS = Object.freeze(Object.fromEntries(Object.entries({
  render: ['#26221c', '#2e3a33', '#38434f', '#766155', '#9a8353', '#a0b6cc', '#c6dff3', '#f8e8d0', '#ffffff'],
  foliage: ['#5f715c', '#a36f5b', '#9f6f6b', '#9f7283', '#88a636', '#9dbb47', '#a7c552', '#f2ecb0', '#ffffff'],
  painted_metal: ['#232a2c', '#402b18', '#443e39', '#48535e', '#666125', '#656d71', '#a2a6ab', '#fce9cb', '#ffffff'],
  concrete: ['#1a1814', '#4b4c4c', '#515155', '#8a8680', '#93a4b5', '#b0a89a', '#bdbfc2', '#e7e4da', '#ffffff'],
  brick: ['#654636', '#555042', '#834435', '#bc5739', '#746c63', '#ad9275', '#f0dcac', '#f7ecbe', '#ffffff'],
  timber: ['#958572', '#b98a5e', '#c58496', '#a09296', '#b090e6', '#909eba', '#90a0d6', '#c79e73', '#ffffff'],
  tile: ['#695649', '#6d5b4f', '#6d5c50', '#705f54', '#cf613c', '#d1623d', '#d2623d', '#f0753e', '#ffffff'],
}).map(([family, ramp]) => [family, Object.freeze(ramp)])));
export const CITY_SURFACE_FAMILY = Object.freeze({
  asphalt: 'asphalt', concrete: 'concrete', limestone: 'concrete',
  painted_metal: 'paintedSteel', corrugated: 'paintedSteel', slate: 'paintedSteel',
  timber: 'timber', weatherboard: 'render', glass: 'glass', tile: 'terracotta',
  brick: 'brick', render: 'render', foliage: 'foliage', sand: 'sand',
});

/** Consolidate the physical response after specialist atlas binding, before kit batching.
 * Keep shader/texture ownership separate: equal physical signatures alone do not make
 * two atlas materials interchangeable. Never apply this to protected scene systems.
 */
export function finishCitySurface(material, { tint = false, atlasRamp = false } = {}) {
  const family = CITY_SURFACE_FAMILY[material?.userData?.family];
  if (!family || family === 'glass' || material.userData.citySurfaceFinish) return material;
  const spec = CITY_FINISHES[family];
  // Census data only. The ramp below still writes material.color.
  const authoredSrgb = material.color.getHexString();
  const source = material.color.clone().convertLinearToSRGB();
  const value = Math.max(source.r, source.g, source.b);
  const band = CITY_VALUE_RAMP.reduce((best, v, i) =>
    Math.abs(v - value) < Math.abs(CITY_VALUE_RAMP[best] - value) ? i : best, 0);
  const colour = source.clone();
  // Quantise the authored multiplier, not the effective surface hue: specialist
  // atlases compensate their own non-neutral maps. Replacing that multiplier with
  // a family hex creates a second tint and breaks the solved facade colours.
  const atlasNeutral = value <= 1 && Math.min(source.r, source.g, source.b) > 0.98;
  if (atlasNeutral) colour.setRGB(1, 1, 1);
  else if (value <= 1 && Math.min(source.r, source.g, source.b) >= 0) {
    const hsl = source.getHSL({});
    const hue = CITY_PAINT_HUES[Math.round(hsl.h * CITY_PAINT_HUES.length) % CITY_PAINT_HUES.length] / 360;
    const saturation = CITY_SATURATION_RAMP[Math.round(hsl.s * 10)];
    colour.setHSL(hue, saturation, 0.5);
  }
  if (value <= 1) colour.multiplyScalar(CITY_VALUE_RAMP[band] / Math.max(colour.r, colour.g, colour.b));
  // Existing atlas shaders and vertex palettes have calibrated colour ratios. Their
  // albedo migration must happen in the owning palette, not after binding. Only an
  // explicit uncalibrated city caller opts into the published tint ramp here.
  if (tint) material.color.copy(colour.convertSRGBToLinear());
  const ramp = atlasRamp && CITY_ATLAS_RAMPS[material.userData.family];
  let atlasBand = null;
  if (ramp && value <= 1 && !atlasNeutral) {
    const limit = CITY_ATLAS_MATCH_LIMITS[material.userData.family] ?? CITY_NEAR_DUPLICATE.rgbDistance;
    let distance = limit ** 2;
    const sourceHsl = source.getHSL({});
    for (const [index, hex] of ramp.entries()) {
      const candidate = new THREE.Color(hex).convertLinearToSRGB();
      const candidateHsl = candidate.getHSL({});
      const hue = Math.abs(sourceHsl.h - candidateHsl.h);
      if (Number.isFinite(limit) && Math.min(hue, 1-hue)*360 > CITY_NEAR_DUPLICATE.hueDegrees
        && Math.max(sourceHsl.s, candidateHsl.s) >= CITY_NEAR_DUPLICATE.neutralSaturation) continue;
      const d = (source.r-candidate.r)**2 + (source.g-candidate.g)**2 + (source.b-candidate.b)**2;
      if (d <= distance) { atlasBand = index; distance = d; }
    }
    // A unique authored finish is not a near-duplicate: retain it for owner migration.
    if (atlasBand !== null) material.color.set(ramp[atlasBand]);
  }
  material.roughness = spec.roughness;
  material.metalness = spec.metalness;
  material.userData.citySurfaceFinish = {
    family, valueBand: tint ? band : null, atlasBand, wearAtlasSlot: spec.wearAtlasSlot,
    authoredSrgb, snappedSrgb: material.color.getHexString(),
  };
  return material;
}

// P21 D1C: measured authored fringe finishes. Each entry is [sRGB, roughness,
// metalness]; bounded matching preserves hue and specialist texture compensation.
export const CITY_FRINGE_FINISHES = Object.freeze([
  // Authored military identifiers remain exact, including their track response.
  Object.freeze(['#817558',0.56,0.14]),
  Object.freeze(['#3d4732',0.62,0.10]),
  Object.freeze(['#1a1c20',0.84,0.08]),
  Object.freeze(['#1a1c20',0.82,0.10]),
  Object.freeze(["#ffffff",0.95,0]),
  Object.freeze(["#40464c",0.72,0.66]),
  Object.freeze(["#ffffff",0.8,0.02]),
  Object.freeze(["#ffffff",0.72,0.03]),
  Object.freeze(["#8a9098",0.72,0.7]),
  Object.freeze(["#7b848d",0.34,0.68]),
  Object.freeze(["#6a727a",0.48,0.85]),
  Object.freeze(["#452e1c",0.82,0.03]),
  Object.freeze(["#e6dfca",0.36,0.09]),
  Object.freeze(["#514c45",0.96,0.02]),
  Object.freeze(["#8b8378",0.93,0.02]),
  Object.freeze(["#4a5568",0.78,0.02]),
  Object.freeze(["#7c8794",0.74,0.02]),
  Object.freeze(["#4a525b",0.36,0.72]),
  Object.freeze(["#7a5228",0.82,0.03]),
  Object.freeze(["#5a6a4a",0.96,0.02]),
  Object.freeze(["#6f6a62",0.95,0.02]),
  Object.freeze(["#241f1d",0.52,0.03]),
  Object.freeze(["#939aa1",0.34,0.52]),
  Object.freeze(["#6d6a63",0.68,0.06]),
  Object.freeze(["#3a342c",0.92,0.04]),
  Object.freeze(["#6e4a30",0.9,0.16]),
  Object.freeze(["#f2f0e8",0.48,0.1]),
  Object.freeze(["#353c44",0.5,0.4]),
  Object.freeze(["#d5c9ae",0.88,0.04]),
  Object.freeze(["#839153",0.98,0]),
  Object.freeze(["#41474e",0.72,0.55]),
  Object.freeze(["#ffffff",0.6,0]),
  Object.freeze(["#fcfbf7",0.38,0.04]),
  Object.freeze(["#332f28",0.42,0.55]),
  Object.freeze(["#97948e",0.48,0.02]),
  Object.freeze(["#26272b",0.95,0.02]),
  Object.freeze(["#5c5850",0.48,0.08]),
  Object.freeze(["#c07b3a",0.88,0.14]),
  Object.freeze(["#8e8a80",0.9,0.04]),
  Object.freeze(["#ffffff",1,0.12]),
  Object.freeze(["#26282c",0.96,0.02]),
  Object.freeze(["#e8c4a8",0.78,0.02]),
  Object.freeze(["#24391a",0.96,0.01]),
  Object.freeze(["#2c3a28",0.92,0.02]),
  Object.freeze(["#283646",0.82,0.02]),
  Object.freeze(["#39402f",0.96,0.02]),
  Object.freeze(["#6b4f34",0.9,0.02]),
  Object.freeze(["#353c44",0.72,0.4]),
  Object.freeze(["#212328",0.72,0.14]),
  Object.freeze(["#242629",0.55,0.18]),
  Object.freeze(["#69727c",0.72,0.62]),
  Object.freeze(["#5d6874",0.72,0.38]),
  Object.freeze(["#5d6874",0.52,0.38]),
  Object.freeze(["#dde2e6",0.32,0.44]),
  Object.freeze(["#a77a24",0.35,0.55]),
  Object.freeze(["#d9a077",0.72,0.02]),
  Object.freeze(["#a49d8d",0.9,0.03]),
  Object.freeze(["#d5aa45",0.35,0.55]),
  Object.freeze(["#e8e6df",0.62,0.05]),
  Object.freeze(["#2b6415",0.96,0.01]),
  Object.freeze(["#b0aca0",0.32,0.64]),
  Object.freeze(["#495663",0.34,0.13]),
  Object.freeze(["#7a4a2c",0.62,0.55]),
  Object.freeze(["#f16305",0.55,0.08]),
  Object.freeze(["#13210d",0.96,0.01]),
  Object.freeze(["#e8dcc2",0.66,0.03]),
  Object.freeze(["#3a3f4a",0.78,0.08]),
  Object.freeze(["#968c78",0.8,0.04]),
  Object.freeze(["#ac8639",0.46,0.24]),
  Object.freeze(["#ffffff",0.32,0.22]),
  Object.freeze(["#585751",0.94,0.02]),
  Object.freeze(["#dfe6ef",0.72,0.04]),
  Object.freeze(["#ffcc00",0.48,0.02]),
  Object.freeze(["#c3b79c",0.94,0.03]),
  Object.freeze(["#7d8894",0.36,0.3]),
  Object.freeze(["#8f959d",0.46,0.28]),
  Object.freeze(["#b2c1ad",1,0]),
  Object.freeze(["#ffffff",0.4,0.3]),
  Object.freeze(["#a34513",0.52,0.14]),
  Object.freeze(["#a97213",0.52,0.14]),
  Object.freeze(["#639343",0.95,0.01]),
  Object.freeze(["#666760",0.38,0.68]),
  Object.freeze(["#c9302c",0.5,0.06]),
  Object.freeze(["#1b1d20",0.55,0.35]),
  Object.freeze(["#b2a78f",0.8,0.04]),
  Object.freeze(["#3e6d33",0.96,0.01]),
  Object.freeze(["#e8b92e",0.5,0.05]),
  Object.freeze(["#ffffff",0.3,0.36]),
  Object.freeze(["#12607f",0.52,0.14]),
  Object.freeze(["#e0621a",0.46,0.1]),
  Object.freeze(["#afb722",0.74,0.02]),
  Object.freeze(["#737a81",0.38,0.48]),
  Object.freeze(["#2a4a32",0.98,0]),
  Object.freeze(["#546b7a",0.7,0.14]),
  Object.freeze(["#c0995e",0.72,0.06]),
  Object.freeze(["#c7d2dc",0.56,0.03]),
  Object.freeze(["#c8ac63",0.95,0]),
  Object.freeze(["#e2d9c0",0.72,0.12]),
  Object.freeze(["#ffffff",0.72,0.26]),
  Object.freeze(["#f6efd6",0.3,0.2]),
  Object.freeze(["#f2c419",0.7,0]),
  Object.freeze(["#0a2450",0.48,0.1]),
  Object.freeze(["#1d130d",0.78,0.03]),
  Object.freeze(["#6c452e",0.7,0.05]),
  Object.freeze(["#727c87",0.54,0.32]),
  Object.freeze(["#252b2a",0.6,0.35]),
  Object.freeze(["#e2ddd0",0.45,0.06]),
  Object.freeze(["#171614",0.94,0.02]),
  Object.freeze(["#7b7770",0.44,0.34]),
  Object.freeze(["#8d6539",0.9,0]),
  Object.freeze(["#e58928",0.74,0.02]),
  Object.freeze(["#fff0c0",0.3,0.1]),
  Object.freeze(["#2b3036",0.44,0.16]),
  Object.freeze(["#8b2210",0.5,0.16]),
  Object.freeze(["#c43c2a",0.42,0.35]),
  Object.freeze(["#6a6558",0.96,0]),
  Object.freeze(["#a58558",0.8,0.02]),
  Object.freeze(["#3474d6",0.3,0.1]),
  Object.freeze(["#20181a",0.98,0]),
  Object.freeze(["#35383d",0.48,0.02]),
  Object.freeze(["#5a3426",0.78,0.02]),
  Object.freeze(["#b8bcc2",0.42,0.24]),
  Object.freeze(["#6a8a48",0.92,0]),
  Object.freeze(["#c2452f",0.56,0.04]),
  Object.freeze(["#c14405",0.58,0.08]),
  Object.freeze(["#4c473e",0.8,0.08]),
  Object.freeze(["#23342c",0.38,0.55]),
  Object.freeze(["#5e656e",0.72,0.3]),
  Object.freeze(["#5f6c79",0.72,0.16]),
  Object.freeze(["#e58928",0.86,0.03]),
  Object.freeze(["#161a1e",0.9,0.12]),
  Object.freeze(["#5c646c",0.36,0.72]),
  Object.freeze(["#635045",0.8,0.06]),
  Object.freeze(["#815035",0.78,0.02]),
  Object.freeze(["#9c8262",0.5,0.04]),
  Object.freeze(["#c8a778",0.96,0]),
  Object.freeze(["#e2c48a",0.82,0.02]),
  Object.freeze(["#f0c518",0.6,0.04]),
  Object.freeze(["#2c3648",0.62,0.04]),
  Object.freeze(["#4a5a34",1,0]),
  Object.freeze(["#afb722",0.86,0.03]),
  Object.freeze(["#b87852",0.78,0.02]),
  Object.freeze(["#3f4a50",0.42,0.12]),
  Object.freeze(["#4d7f38",0.97,0.01]),
  Object.freeze(["#e01c23",0.5,0.06]),
  Object.freeze(["#e07b2c",0.5,0.06]),
  Object.freeze(["#f2e4c8",0.82,0.02]),
  Object.freeze(["#1f6e8c",0.42,0.35]),
  Object.freeze(["#4a5a68",0.85,0.08]),
  Object.freeze(["#5d7683",0.6,0.14]),
  Object.freeze(["#62462b",0.66,0.03]),
  Object.freeze(["#8a8e96",0.82,0.02]),
  Object.freeze(["#c2a06a",0.82,0.02]),
  Object.freeze(["#c9b088",0.66,0.1]),
  Object.freeze(["#17559e",0.6,0.06]),
  Object.freeze(["#1d140e",0.9,0.02]),
  Object.freeze(["#474b51",0.94,0]),
  Object.freeze(["#91aed2",0.62,0.03]),
  Object.freeze(["#0a3c78",0.46,0.18]),
  Object.freeze(["#1e2a44",0.82,0.02]),
  Object.freeze(["#3a2a20",0.9,0]),
  Object.freeze(["#8f9367",0.88,0.02]),
  Object.freeze(["#307539",0.94,0]),
  Object.freeze(["#4a4f57",0.62,0.04]),
  Object.freeze(["#878376",0.42,0.58]),
  Object.freeze(["#cfcabe",0.6,0.1]),
  Object.freeze(["#dd3579",0.5,0.06]),
  Object.freeze(["#1a1c20",0.82,0.1]),
  Object.freeze(["#2a63a0",0.44,0.12]),
  Object.freeze(["#851f0f",0.76,0.05]),
  Object.freeze(["#461057",0.44,0.18]),
  Object.freeze(["#a84535",0.82,0.02]),
  Object.freeze(["#d3322c",0.6,0.04]),
  Object.freeze(["#495663",0.72,0.13]),
  Object.freeze(["#9aa3a8",0.92,0.04]),
  Object.freeze(["#24476b",0.82,0.02]),
  Object.freeze(["#33363c",0.42,0.72]),
  Object.freeze(["#74228f",0.34,0.22]),
  Object.freeze(["#bac2c9",0.44,0.14]),
  Object.freeze(["#e2cea3",0.72,0.03]),
  Object.freeze(["#08101c",0.72,0.34]),
  Object.freeze(["#3a4248",0.7,0.02]),
  Object.freeze(["#4d6f66",0.9,0.02]),
  Object.freeze(["#6d6961",0.72,0.17]),
  Object.freeze(["#6f9075",0.86,0.02]),
  Object.freeze(["#e07050",0.82,0.02]),
  Object.freeze(["#ffc60a",0.36,0.12]),
  Object.freeze(["#10305e",0.7,0.06]),
  Object.freeze(["#1a7fb5",0.44,0.16]),
  Object.freeze(["#1c62a8",0.7,0.03]),
  Object.freeze(["#474439",0.98,0.01]),
  Object.freeze(["#ff3a24",0.35,0.1]),
  Object.freeze(["#1160b8",0.36,0.2]),
  Object.freeze(["#285a78",0.82,0.02]),
  Object.freeze(["#54646f",0.44,0.56]),
  Object.freeze(["#8c8352",0.98,0.01]),
  Object.freeze(["#bd6b39",0.42,0.34]),
  Object.freeze(["#c9c9c5",0.86,0.03]),
  Object.freeze(["#00838c",0.5,0.06]),
  Object.freeze(["#0e4bb0",0.5,0.06]),
  Object.freeze(["#4a5a32",0.82,0.02]),
  Object.freeze(["#6432b8",0.5,0.06]),
  Object.freeze(["#6b7a3a",0.95,0]),
  Object.freeze(["#8d5330",0.9,0.14]),
  Object.freeze(["#8d6142",0.98,0]),
  Object.freeze(["#d68e0a",0.58,0.06]),
  Object.freeze(["#3b3f42",0.92,0.03]),
  Object.freeze(["#7c919f",1,0.08]),
  Object.freeze(["#9e8071",1,0.08]),
  Object.freeze(["#a54162",0.86,0.03]),
  Object.freeze(["#a79c86",0.6,0.06]),
  Object.freeze(["#b2a788",1,0.08]),
  Object.freeze(["#bb9f90",1,0.08]),
  Object.freeze(["#0d1f3e",0.3,0.24]),
  Object.freeze(["#333941",0.4,0.3]),
  Object.freeze(["#67a497",0.86,0.03]),
  Object.freeze(["#8d8f96",0.7,0.14]),
  Object.freeze(["#8fbf3a",0.5,0.06]),
  Object.freeze(["#a54162",0.74,0.02]),
  Object.freeze(["#a58520",0.74,0.02]),
  Object.freeze(["#a58520",0.86,0.03]),
  Object.freeze(["#a8d016",0.7,0.02]),
  Object.freeze(["#b9834f",0.97,0]),
  Object.freeze(["#c9c9c5",0.74,0.02]),
  Object.freeze(["#e39c12",0.44,0.16]),
  Object.freeze(["#306091",0.86,0.03]),
  Object.freeze(["#306436",0.74,0.02]),
  Object.freeze(["#455460",0.34,0.44]),
  Object.freeze(["#4a3a5e",0.5,0.06]),
  Object.freeze(["#67a497",0.74,0.02]),
  Object.freeze(["#6a5a55",0.82,0.08]),
  Object.freeze(["#7a4436",0.82,0.08]),
  Object.freeze(["#857e70",0.6,0.2]),
  Object.freeze(["#87978f",0.3,0]),
  Object.freeze(["#95616e",1,0.08]),
  Object.freeze(["#a3211b",0.4,0.12]),
  Object.freeze(["#c98d5f",0.7,0.08]),
  Object.freeze(["#dde5ea",0.42,0.3]),
  Object.freeze(["#ffe7b8",0.5,0.02]),
  Object.freeze(["#009b72",0.86,0.03]),
  Object.freeze(["#00bd8b",0.74,0.02]),
  Object.freeze(["#00bd8b",0.86,0.03]),
  Object.freeze(["#0a1f45",0.72,0.06]),
  Object.freeze(["#0a5fae",0.42,0.12]),
  Object.freeze(["#166464",0.74,0.02]),
  Object.freeze(["#20867f",0.5,0.08]),
  Object.freeze(["#2a0305",0.9,0]),
  Object.freeze(["#3071b6",0.86,0.03]),
  Object.freeze(["#416d3f",0.94,0]),
  Object.freeze(["#45495c",0.74,0.02]),
  Object.freeze(["#45495c",0.86,0.03]),
  Object.freeze(["#8a5c3c",0.7,0.08]),
  Object.freeze(["#be973d",0.74,0.02]),
  Object.freeze(["#c8397e",0.7,0.08]),
  Object.freeze(["#c93a22",0.44,0.16]),
  Object.freeze(["#c94f77",0.74,0.02]),
  Object.freeze(["#c94f77",0.86,0.03]),
  Object.freeze(["#cfd5da",0.32,0.62]),
  Object.freeze(["#d6dbe0",0.4,0.42]),
  Object.freeze(["#f2f0e8",0.3,0.12]),
  Object.freeze(["#ffeec6",0.72,0.38]),
  Object.freeze(["#0d4fd6",0.5,0.06]),
  Object.freeze(["#121316",0.55,0.08]),
  Object.freeze(["#166464",0.86,0.03]),
  Object.freeze(["#17a89a",0.7,0.08]),
  Object.freeze(["#1b7a7a",0.86,0.03]),
  Object.freeze(["#2f7a28",0.72,0.02]),
  Object.freeze(["#779a89",1,0.08]),
  Object.freeze(["#8a8493",0.6,0.24]),
  Object.freeze(["#91a6b9",1,0.08]),
  Object.freeze(["#97161b",0.68,0.08]),
  Object.freeze(["#976565",1,0.08]),
  Object.freeze(["#9e9787",0.52,0.24]),
  Object.freeze(["#9f711c",0.74,0.02]),
  Object.freeze(["#9f711c",0.86,0.03]),
  Object.freeze(["#a8917d",0.9,0.02]),
  Object.freeze(["#ae571c",0.74,0.02]),
  Object.freeze(["#b32d17",0.72,0.05]),
  Object.freeze(["#b3bcc4",0.34,0.7]),
  Object.freeze(["#b85c42",0.74,0.02]),
  Object.freeze(["#b85c42",0.86,0.03]),
  Object.freeze(["#b9c3cb",0.3,0.5]),
  Object.freeze(["#be973d",0.86,0.03]),
  Object.freeze(["#c43a2a",0.86,0.03]),
  Object.freeze(["#c4520b",0.42,0.12]),
  Object.freeze(["#e36f92",0.6,0.02]),
  Object.freeze(["#ed2168",0.74,0.02]),
  Object.freeze(["#ffb020",0.35,0.08]),
  Object.freeze(["#009b72",0.74,0.02]),
  Object.freeze(["#0d4d94",0.42,0.2]),
  Object.freeze(["#0d6a5c",0.93,0.01]),
  Object.freeze(["#0f6fb5",0.58,0.06]),
  Object.freeze(["#11616e",0.4,0.12]),
  Object.freeze(["#1769e0",0.74,0.02]),
  Object.freeze(["#1769e0",0.86,0.03]),
  Object.freeze(["#1b7a7a",0.74,0.02]),
  Object.freeze(["#1c8149",0.58,0.06]),
  Object.freeze(["#2e9455",0.44,0.16]),
  Object.freeze(["#2f6fc0",0.7,0.08]),
  Object.freeze(["#3a8ade",0.74,0.02]),
  Object.freeze(["#50463c",0.9,0.12]),
  Object.freeze(["#687684",0.93,0.03]),
  Object.freeze(["#8a7550",0.99,0.01]),
  Object.freeze(["#93307c",0.58,0.06]),
  Object.freeze(["#977b64",0.93,0.02]),
  Object.freeze(["#9a6b47",0.78,0]),
  Object.freeze(["#ad9f8b",0.93,0.02]),
  Object.freeze(["#ae571c",0.86,0.03]),
  Object.freeze(["#bdb5a2",0.34,0.38]),
  Object.freeze(["#c0995e",0.58,0.06]),
  Object.freeze(["#c6ff00",0.46,0.05]),
  Object.freeze(["#c9b9a2",0.9,0.02]),
  Object.freeze(["#cda851",0.4,0.26]),
  Object.freeze(["#cf3a12",0.72,0.08]),
  Object.freeze(["#e04a3c",0.7,0.08]),
  Object.freeze(["#ed2168",0.86,0.03]),
  Object.freeze(["#f05a1e",0.38,0.12]),
  Object.freeze(["#f0c9a4",0.7,0.08]),
  Object.freeze(["#ff4c00",0.48,0.06]),
  Object.freeze(["#08306d",0.93,0.01]),
  Object.freeze(["#101214",0.97,0.02]),
  Object.freeze(["#1657bd",0.72,0.08]),
  Object.freeze(["#216e3b",0.68,0.08]),
  Object.freeze(["#22624f",1,0]),
  Object.freeze(["#275b50",0.74,0.02]),
  Object.freeze(["#275b50",0.86,0.03]),
  Object.freeze(["#2a3036",0.38,0.42]),
  Object.freeze(["#2b838a",0.46,0.1]),
  Object.freeze(["#332d28",0.44,0.2]),
  Object.freeze(["#345b3e",0.5799999833106995,0.07999999821186066]),
  Object.freeze(["#373b40",0.58,0.26]),
  Object.freeze(["#3a8ade",0.86,0.03]),
  Object.freeze(["#3c4249",0.5,0.52]),
  Object.freeze(["#46596b",0.44,0.3]),
  Object.freeze(["#4d8f3c",0.7,0.08]),
  Object.freeze(["#5d425b",0.86,0.03]),
  Object.freeze(["#637497",1,0.08]),
  Object.freeze(["#643592",0.68,0.08]),
  Object.freeze(["#6f5d4b",0.68,0.1]),
  Object.freeze(["#6f797f",1,0.08]),
  Object.freeze(["#72516f",0.74,0.02]),
  Object.freeze(["#72516f",0.86,0.03]),
  Object.freeze(["#7d3a26",0.94,0.03]),
  Object.freeze(["#8b8f92",0.44,0.6]),
  Object.freeze(["#998e6f",1,0.08]),
  Object.freeze(["#a04b32",0.92,0.03]),
  Object.freeze(["#a79c86",0.72,0.06]),
  Object.freeze(["#aeb7be",0.72,0.1]),
  Object.freeze(["#b8a28e",1,0.08]),
  Object.freeze(["#b9b6ad",0.82,0.06]),
  Object.freeze(["#bb3417",0.72,0.18]),
  Object.freeze(["#c0b4a8",1,0.08]),
  Object.freeze(["#c21b55",0.74,0.02]),
  Object.freeze(["#c21b55",0.86,0.03]),
  Object.freeze(["#c8b48c",0.34,0.5]),
  Object.freeze(["#d5a928",0.72,0.46]),
  Object.freeze(["#e4e2e0",0.95,0.02]),
  Object.freeze(["#e6c893",0.9,0]),
  Object.freeze(["#e6e2d2",0.8,0]),
  Object.freeze(["#eed5a0",0.72,0.26]),
  Object.freeze(["#ffd9a0",0.9,0.02]),
  Object.freeze(["#00bd8b",0.62,0.02]),
  Object.freeze(["#029a70",0.62,0.08]),
  Object.freeze(["#0a8060",0.58,0.04]),
  Object.freeze(["#0d3129",1,0]),
  Object.freeze(["#0d3260",0.6,0.08]),
  Object.freeze(["#0d8f63",0.45,0.18]),
  Object.freeze(["#141416",0.42,0.1]),
  Object.freeze(["#17a89a",0.44,0.14]),
  Object.freeze(["#18a3b4",0.66,0.05]),
  Object.freeze(["#191c1d",0.47999998927116394,0.6200000047683716]),
  Object.freeze(["#1a3a7a",0.42,0.12]),
  Object.freeze(["#1a6fc8",0.45,0.18]),
  Object.freeze(["#1b64bc",0.54,0.1]),
  Object.freeze(["#1b7a7a",0.62,0.02]),
  Object.freeze(["#1d6f3e",0.42,0.2]),
  Object.freeze(["#1f6b3b",0.52,0.14]),
  Object.freeze(["#24476b",0.62,0.02]),
  Object.freeze(["#2a1c0c",0.4,0.1]),
  Object.freeze(["#2b2f33",0.38,0.74]),
  Object.freeze(["#2c6fb5",0.34,0.28]),
  Object.freeze(["#2c9a52",0.6,0.04]),
  Object.freeze(["#2d1d11",0.62,0.02]),
  Object.freeze(["#2f4226",0.34,0.02]),
  Object.freeze(["#2f5796",0.7,0.03]),
  Object.freeze(["#2f7a5e",0.7,0.04]),
  Object.freeze(["#2f8f74",0.34,0.28]),
  Object.freeze(["#33383d",0.66,0.3]),
  Object.freeze(["#37474f",0.58,0.1]),
  Object.freeze(["#376447",0.94,0]),
  Object.freeze(["#3a3740",0.58,0.34]),
  Object.freeze(["#3a7a42",0.62,0.02]),
  Object.freeze(["#3a7a5e",1,0]),
  Object.freeze(["#3a8ade",0.62,0.02]),
  Object.freeze(["#3b4a37",0.62,0.04]),
  Object.freeze(["#3f2d18",0.36,0.45]),
  Object.freeze(["#3f3b34",0.82,0.18]),
  Object.freeze(["#3f4a35",0.9,0.03]),
  Object.freeze(["#3fb673",0.3,0.1]),
  Object.freeze(["#4a3228",0.62,0.18]),
  Object.freeze(["#4a5056",0.4,0.55]),
  Object.freeze(["#4fbdb2",0.5,0.08]),
  Object.freeze(["#5592db",0.5,0.08]),
  Object.freeze(["#565061",0.66,0.24]),
  Object.freeze(["#56626d",0.6,0.16]),
  Object.freeze(["#5a6a38",0.62,0.02]),
  Object.freeze(["#5d425b",0.74,0.02]),
  Object.freeze(["#5d6168",0.6,0.3]),
  Object.freeze(["#61b57e",0.5,0.08]),
  Object.freeze(["#62783e",0.97,0.02]),
  Object.freeze(["#67582d",0.97,0.01]),
  Object.freeze(["#6a6a64",0.86,0.06]),
  Object.freeze(["#6f2fae",0.62,0.08]),
  Object.freeze(["#6f4323",0.47999998927116394,0]),
  Object.freeze(["#72516f",0.62,0.02]),
  Object.freeze(["#7a2f2c",0.5,0.06]),
  Object.freeze(["#7a3048",0.62,0.02]),
  Object.freeze(["#7a4bbd",0.66,0.05]),
  Object.freeze(["#7a7a3e",0.96,0.01]),
  Object.freeze(["#7d3f8f",0.58,0.08]),
  Object.freeze(["#7e9850",0.96,0.02]),
  Object.freeze(["#7ec8b8",0.62,0.02]),
  Object.freeze(["#84509a",0.7,0.03]),
  Object.freeze(["#86a1c0",0.72,0.26]),
  Object.freeze(["#8d97a1",0.3,0.13]),
  Object.freeze(["#8e8a94",0.5,0.4]),
  Object.freeze(["#9aa08c",0.82,0.06]),
  Object.freeze(["#9aa1a6",0.34,0.74]),
  Object.freeze(["#9aa2a8",0.3,0.44]),
  Object.freeze(["#9b8228",0.97,0.01]),
  Object.freeze(["#aa76db",0.5,0.08]),
  Object.freeze(["#ab9d57",0.97,0.01]),
  Object.freeze(["#b18b44",0.3499999940395355,0.7799999713897705]),
  Object.freeze(["#b7a273",0.43,0.35]),
  Object.freeze(["#b8471a",0.42,0.2]),
  Object.freeze(["#c0328f",0.66,0.05]),
  Object.freeze(["#c28a22",0.62,0.02]),
  Object.freeze(["#c45a2a",0.42,0.12]),
  Object.freeze(["#c8b53a",0.45,0.18]),
  Object.freeze(["#c8bb2e",0.85,0.02]),
  Object.freeze(["#c9a21a",0.44,0.12]),
  Object.freeze(["#c9a227",0.62,0.02]),
  Object.freeze(["#c9c2b2",0.32,0.12]),
  Object.freeze(["#cbd94e",0.46,0.03]),
  Object.freeze(["#cf3a12",0.58,0.04]),
  Object.freeze(["#d2c6a4",0.42,0.09]),
  Object.freeze(["#d3322c",0.4,0.14]),
  Object.freeze(["#d3322c",0.68,0.08]),
  Object.freeze(["#d46a22",0.62,0.02]),
  Object.freeze(["#d46a22",0.74,0.02]),
  Object.freeze(["#d46a22",0.86,0.03]),
  Object.freeze(["#d4b581",0.72,0.2]),
  Object.freeze(["#d4c6a4",0.5799999833106995,0]),
  Object.freeze(["#d8a608",0.54,0.1]),
  Object.freeze(["#d94f70",0.62,0.02]),
  Object.freeze(["#d9a327",0.36,0.26]),
  Object.freeze(["#dff05a",0.62,0.03]),
  Object.freeze(["#e07020",0.35,0.08]),
  Object.freeze(["#e07050",0.62,0.02]),
  Object.freeze(["#e1555a",0.5,0.08]),
  Object.freeze(["#e2560f",0.68,0.03]),
  Object.freeze(["#e6d21a",0.58,0.02]),
  Object.freeze(["#ed2168",0.62,0.02]),
  Object.freeze(["#ee895d",0.5,0.08]),
  Object.freeze(["#efe6d4",0.4,0.2]),
  Object.freeze(["#f0a41c",0.66,0.05]),
  Object.freeze(["#f0c31c",0.44,0.14]),
  Object.freeze(["#f0d84a",0.7,0.08]),
  Object.freeze(["#f2a51c",0.52,0.08]),
  Object.freeze(["#f4d152",0.5,0.08]),
  Object.freeze(["#f4df8a",0.97,0.01]),
  Object.freeze(["#ff2a78",0.46,0.05]),
  Object.freeze(["#ffffff",0.4,0.45]),
]);
export const CITY_FRINGE_MATCH = Object.freeze({ rgbDistance: 0.12, responseDelta: 0.08, hueDegrees: 6 });
let fringeFinishSamples;

/** Opt-in material factory for declared fringe owners; never traverses the scene.
 * Materials remain independently owned because callers mutate maps and wear hooks.
 * Glass, transparency and HDR multipliers retain authored colours. Textures and
 * calibrated multipliers remain owned by each caller; only close matches qualify.
 */
export function createCityFringeMaterial(color, extra = {}, owner = 'fringe') {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.08, ...extra });
  let finish = null;
  if (!material.transparent && material.opacity === 1 && material.roughness >= 0.3) {
    fringeFinishSamples ??= CITY_FRINGE_FINISHES.map(([hex, roughness, metalness]) => {
      const rgb = new THREE.Color(hex).convertLinearToSRGB();
      return { rgb, hsl: rgb.getHSL({}), roughness, metalness };
    });
    const rgb = material.color.clone().convertLinearToSRGB();
    const hsl = rgb.getHSL({});
    const neutral = Math.min(rgb.r, rgb.g, rgb.b) > 0.98;
    let best = Infinity;
    for (const [index, sample] of fringeFinishSamples.entries()) {
      if (Math.max(rgb.r, rgb.g, rgb.b) > 1 || Math.min(rgb.r, rgb.g, rgb.b) < 0) break;
      if (neutral && Math.min(sample.rgb.r, sample.rgb.g, sample.rgb.b) <= 0.98) continue;
      if (Math.abs(material.roughness - sample.roughness) > CITY_FRINGE_MATCH.responseDelta + 1e-9
        || Math.abs(material.metalness - sample.metalness) > CITY_FRINGE_MATCH.responseDelta + 1e-9) continue;
      const hue = Math.abs(hsl.h - sample.hsl.h);
      if (Math.max(hsl.s, sample.hsl.s) >= 0.12 && Math.min(hue, 1-hue)*360 > CITY_FRINGE_MATCH.hueDegrees) continue;
      const distance = (rgb.r-sample.rgb.r)**2 + (rgb.g-sample.rgb.g)**2 + (rgb.b-sample.rgb.b)**2;
      if (distance > CITY_FRINGE_MATCH.rgbDistance ** 2) continue;
      const score = distance + (material.roughness-sample.roughness)**2 + (material.metalness-sample.metalness)**2;
      if (score < best) { best = score; finish = index; }
    }
    if (finish !== null) {
      const [hex, roughness, metalness] = CITY_FRINGE_FINISHES[finish];
      material.color.set(hex); material.roughness = roughness; material.metalness = metalness;
    }
  }
  material.userData.cityFringeFinish = { owner, finish, preserved: finish === null };
  recordPortSurfaceSource(material, color, owner);
  return material;
}

/** Opt-in for streetscape surfaces, compatible with a get()-only material provider. */
export function getCityMaterial(library, family, opts = {}) {
  return finishCitySurface(library.get(family, opts), { tint: true });
}

export const MAJOR_ALBEDO_FAMILIES = Object.freeze([
  'brick', 'render', 'weatherboard', 'corrugated', 'slate', 'tile',
  'asphalt', 'concrete', 'painted_metal', 'timber', 'foliage', 'sand', 'limestone',
]);

export const FAMILY_ALBEDO_VARIANTS = Object.freeze({
  // Warmer, deeper worn brick — saturated reds, not a brown wash.
  brick: Object.freeze(['#c45a38', '#a83828', '#d46840']),
  render: Object.freeze(['#efe6d6', '#e6d4c0', '#d8d2c6']),
  weatherboard: Object.freeze(['#f3eee4', '#e4d5c0', '#c5d4c8']),
  // Roof rotation: galvanised iron, verdigris, weathered copper.
  corrugated: Object.freeze(['#c8ced4', '#3f8a74', '#b56a3a']),
  slate: Object.freeze(['#8a96a4', '#6a7888', '#4a5868']),
  tile: Object.freeze(['#b8432a', '#8c2e1c', '#d45a32']),
  asphalt: Object.freeze(['#3a3e42', '#32363c', '#2c3036']),
  concrete: Object.freeze(['#c8c4bc', '#b8b4ac', '#d0ccc4']),
  // Awning / trim accents — punchy Monopoly blocks, not cream-on-cream.
  painted_metal: Object.freeze(['#c43c2a', '#1f6e8c', '#d4a018']),
  timber: Object.freeze(['#c4a070', '#a87c4e', '#d4b080']),
  foliage: Object.freeze(['#3d8c32', '#2e6e28', '#5a9a38']),
  sand: Object.freeze(['#e0c890', '#d8c08a', '#ead4a4']),
  limestone: Object.freeze(['#d8d4c8', '#c8c0b0', '#e4ddd0']),
});

export function parcelVariantIndex(parcelId, family, count = 3) {
  const n = Math.max(1, count | 0);
  const seed = hashSeed(`${family}:${String(parcelId ?? '')}`);
  return seed % n;
}

export function pickFamilyAlbedo(family, parcelId) {
  const table = FAMILY_ALBEDO_VARIANTS[family];
  if (!table?.length) return MATERIAL_FAMILIES[family]?.color ?? '#ffffff';
  return table[parcelVariantIndex(parcelId, family, table.length)];
}

/**
 * Instance-colour multiplier so shared family materials keep their authored
 * hex while a parcel reads as its hashed variant (effective ≈ variant).
 */
export function familyInstanceTint(family, parcelId) {
  const hex = pickFamilyAlbedo(family, parcelId);
  const spec = MATERIAL_FAMILIES[family];
  const variant = new THREE.Color(hex);
  if (['brick', 'render', 'weatherboard', 'tile', 'corrugated', 'slate', 'concrete'].includes(family)) {
    const rng = makeRng(hashSeed(`p23-tone:${parcelId}`));
    const hsl = variant.getHSL({});
    // Relative hue ±6%; RGB scaling is HSV value ±10%, preserving saturation.
    variant.setHSL(hsl.h * (0.94 + rng() * 0.12), hsl.s, hsl.l);
    variant.multiplyScalar(0.90 + rng() * 0.20);
  }
  if (!spec?.color) return variant;
  const base = new THREE.Color(spec.color);
  const chan = (v, b) => (b > 1e-4 ? Math.min(2.2, v / b) : v);
  return new THREE.Color(chan(variant.r, base.r), chan(variant.g, base.g), chan(variant.b, base.b));
}

/**
 * Create-time environment clamp. Opaque families keep the P1 ceiling; glass
 * also gets a sky-catch floor so day panes cannot author as unlit holes.
 * Water is glass-like for roughness only — it is not a window.
 */
export function clampEnvIntensityBase(family, authoredEnv) {
  const envBase = Number.isFinite(authoredEnv) ? authoredEnv : 0.92;
  const floored = family === 'glass'
    ? Math.max(envBase, P1_HIGHLIGHT.minEnvGlass)
    : envBase;
  return Math.min(floored, P1_HIGHLIGHT.maxEnvBase);
}

/** P16 L1 matte floor for architectural surfaces that must not carry a plastic sky highlight. */
export const ARCHITECTURAL_MATTE_FLOOR = Object.freeze({
  roughness: 0.72,
  envMapIntensity: 0.60,
});

function architecturalDescriptor(material, object = null) {
  const values = [
    material?.name,
    material?.userData?.family,
    material?.userData?.variant,
    material?.userData?.surface,
    material?.userData?.role,
    material?.userData?.weatherRole,
    object?.name,
    object?.userData?.family,
    object?.userData?.surface,
    object?.userData?.role,
  ];
  // Part names such as `ic-roof` are intentionally terse; their parent carries the semantic
  // exclusion (`beach-icecream-van`). Walk a short ancestry chain so vehicle paint cannot be
  // mistaken for an architectural roof merely because both use the shared painted-metal family.
  let ancestor = object?.parent;
  for (let depth = 0; ancestor && depth < 4; depth += 1, ancestor = ancestor.parent) {
    values.push(
      ancestor.name,
      ancestor.userData?.family,
      ancestor.userData?.surface,
      ancestor.userData?.role,
    );
  }
  return values.filter((value) => value != null && value !== '')
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasArchitecturalGlossExclusion(descriptor) {
  const tokens = new Set(descriptor.split(/\s+/));
  const vehicle = tokens.has('car') || tokens.has('vehicle') || tokens.has('van')
    || tokens.has('truck') || tokens.has('bus');
  const paint = tokens.has('paint') || tokens.has('painted');
  return tokens.has('glass') || tokens.has('glazing') || tokens.has('window')
    || tokens.has('water') || tokens.has('ocean') || tokens.has('foam')
    || (vehicle && paint)
    || (tokens.has('metal') && tokens.has('trim'));
}

/**
 * Name/family classifier for the after-load roof/facade finish. Explicit glossy families win
 * before the architectural tags: a car called `roof-rack` remains car paint, and water/glass or
 * a named metal trim keeps its authored response.
 */
export function isArchitecturalMatteTarget(material, object = null) {
  if (!material || (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial)) {
    return false;
  }
  const descriptor = architecturalDescriptor(material, object);
  if (!descriptor) return false;
  const tokens = new Set(descriptor.split(/\s+/));
  if (hasArchitecturalGlossExclusion(descriptor)) return false;
  return ['roof', 'render', 'brick', 'concrete', 'asphalt'].some((tag) => tokens.has(tag));
}

/** Clamp one tagged material in place; returns a small receipt used by the scene walk/tests. */
export function enforceArchitecturalMatteFloor(material, object = null) {
  if (!isArchitecturalMatteTarget(material, object)) {
    return { matched: false, changed: false };
  }
  const beforeRoughness = Number.isFinite(material.roughness) ? material.roughness : 0;
  const beforeEnv = Number.isFinite(material.envMapIntensity) ? material.envMapIntensity : 1;
  const beforeEnvBase = Number.isFinite(material.userData?.envIntensityBase)
    ? material.userData.envIntensityBase : beforeEnv;
  material.roughness = Math.max(ARCHITECTURAL_MATTE_FLOOR.roughness, beforeRoughness);
  material.envMapIntensity = Math.min(ARCHITECTURAL_MATTE_FLOOR.envMapIntensity, beforeEnv);
  material.userData ??= {};
  material.userData.envIntensityBase = Math.min(
    ARCHITECTURAL_MATTE_FLOOR.envMapIntensity,
    beforeEnvBase,
  );
  const changed = material.roughness !== beforeRoughness
    || material.envMapIntensity !== beforeEnv
    || material.userData.envIntensityBase !== beforeEnvBase;
  material.userData.architecturalMatteFloor = {
    roughness: ARCHITECTURAL_MATTE_FLOOR.roughness,
    envMapIntensity: ARCHITECTURAL_MATTE_FLOOR.envMapIntensity,
  };
  if (changed) material.needsUpdate = true;
  return {
    matched: true,
    changed,
    beforeRoughness,
    afterRoughness: material.roughness,
    beforeEnv,
    afterEnv: material.envMapIntensity,
  };
}

/**
 * One deterministic, load-time scene walk. Shared materials are revisited only until a binding
 * identifies them as architectural; once clamped, subsequent mesh bindings are free.
 */
export function applyArchitecturalMatteFloor(root) {
  const unique = new Set();
  const matched = new Set();
  const excluded = new Set();
  let bindings = 0;
  let changed = 0;
  // Exclusions are material-wide and take precedence over scene order. A shared material seen
  // first on a roof and later on water/car trim must remain glossy everywhere it is bound.
  root?.traverse?.((object) => {
    if (!object?.material) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (material && hasArchitecturalGlossExclusion(architecturalDescriptor(material, object))) {
        excluded.add(material);
      }
    }
  });
  root?.traverse?.((object) => {
    if (!object?.material) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material) continue;
      unique.add(material);
      if (excluded.has(material)) continue;
      if (matched.has(material)) continue;
      bindings += 1;
      const receipt = enforceArchitecturalMatteFloor(material, object);
      if (!receipt.matched) continue;
      matched.add(material);
      if (receipt.changed) changed += 1;
    }
  });
  return {
    materials: unique.size,
    bindings,
    matched: matched.size,
    changed,
  };
}

/** P17 families whose building surfaces receive the shared second weather map. */
export const P17_BUILDING_SURFACE_FAMILIES = Object.freeze([
  'brick', 'render', 'weatherboard', 'corrugated', 'slate', 'tile', 'concrete',
  // The exchange's ashlar and kit-authored sheet trims use the same restrained overlay path.
  'limestone', 'painted_metal', 'asphalt',
]);

const P17_BUILDING_SURFACE_SET = new Set(P17_BUILDING_SURFACE_FAMILIES);

/** Authored roof response. L1's load-time matte floor is intentionally a no-op on these values. */
export const P17_ROOF_MATERIAL_LIMITS = Object.freeze({
  roughness: 0.86,
  effectiveRoughness: 0.72,
  metalness: 0,
  envMapIntensity: 0.60,
  specularIntensity: 0.22,
  clearcoat: 0,
});

const P17_BUILDING_ROUGHNESS_FLOOR = Object.freeze({
  brick: 0.90,
  render: 0.90,
  weatherboard: 0.84,
  corrugated: 0.90,
  slate: 0.90,
  tile: 0.92,
  concrete: 0.92,
  limestone: 0.88,
});

export const P17_GLASS_TINTS = Object.freeze([
  '#b9d7e3',
  '#c4d5dc',
  '#aecbd8',
  '#c7d9d4',
]);

/**
 * B4 board-camera facade register. Parcel centres sit on an 8 m half-tile lattice; the
 * x + 2z five-cycle means an axis-adjacent facade cannot land in the same value bucket.
 */
export const P17_FACADE_TONE_GRID_M = 8;
export const P17_FACADE_TONES = Object.freeze([0.88, 0.94, 1.0, 1.06, 0.91]);

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

export function buildingFacadeToneIndex(worldX, worldZ) {
  const ix = Math.floor((Number(worldX) + P17_FACADE_TONE_GRID_M * 0.5)
    / P17_FACADE_TONE_GRID_M);
  const iz = Math.floor((Number(worldZ) + P17_FACADE_TONE_GRID_M * 0.5)
    / P17_FACADE_TONE_GRID_M);
  return positiveModulo(ix + iz * 2, P17_FACADE_TONES.length);
}

export function buildingFacadeTone(worldX, worldZ) {
  return P17_FACADE_TONES[buildingFacadeToneIndex(worldX, worldZ)];
}

// Nine repeatable wear bands on the parcel lattice; cardinal neighbours differ.
export function buildingWearBand(worldX, worldZ) {
  return positiveModulo(Math.floor((worldX + 4) / 8)
    + 2 * Math.floor((worldZ + 4) / 8), CITY_VALUE_RAMP.length);
}

/** Three deterministic warm rooms per fifty cells; no extra material bucket or draw. */
export const P17_WINDOW_LIGHTING = Object.freeze({
  fraction: 0.06,
  cellMetres: Object.freeze([2.4, 3.0, 2.4]),
  emissiveIntensity: 0.52,
});

export function buildingWindowLightCell(seedKey, worldX, worldY, worldZ) {
  const [cellX, cellY, cellZ] = P17_WINDOW_LIGHTING.cellMetres;
  const ix = Math.floor((Number(worldX) + 0.6) / cellX);
  const iy = Math.floor((Number(worldY) + 0.25) / cellY);
  const iz = Math.floor((Number(worldZ) + 1.1) / cellZ);
  const salt = hashSeed(`p17-room:${seedKey}`) % 50;
  return positiveModulo(ix * 3 + iy * 2 + iz * 7 + salt, 50) < 3;
}

/**
 * Resolve a material bucket to facade / roof / contact without touching geometry. The suffixes
 * are shared by the residential, commercial, industrial, civic and landmark surface systems.
 */
export function buildingWeatherRoleFor(family, descriptor = '') {
  if (!P17_BUILDING_SURFACE_SET.has(family)) return null;
  const id = String(descriptor ?? '').toLowerCase();
  if (/(?:^|[|:_-])(shadow|interior|room|void)(?:$|[|:_-])/.test(id)) return null;
  if (/(plinth|foundation|footing|site-foot|ground|threshold|step|paving|hardstand|court)/.test(id)) {
    return 'contact';
  }
  if (/(cladding|wall|facade|façade|masonry|rustication|ashlar|precast|body)/.test(id)) {
    return 'facade';
  }
  if (/(roof|ridge|gutter|downpipe|flashing|capping|coping)/.test(id)) return 'roof';
  if (family === 'painted_metal' && /(lace|iron|railing|fixing)/.test(id)) return 'facade';
  if (family === 'asphalt') return 'contact';
  if (family === 'corrugated' || family === 'slate' || family === 'tile') return 'roof';
  if (family === 'brick' || family === 'render' || family === 'weatherboard' || family === 'limestone') {
    return 'facade';
  }
  return null;
}

/**
 * Chain a single texture sample into a physical material. The atlas stays shared; a stable hash
 * of instance origin + material salt selects one of four columns, so one InstancedMesh can still
 * batch many buildings while their streak/rust pattern differs per building.
 */
export function applyBuildingWeatherOverlay(material, atlas, {
  role,
  seedKey = material?.userData?.variant ?? material?.name ?? 'building',
} = {}) {
  if (!material || !atlas?.map || BUILDING_WEATHER_ROLE[role] == null) return material;
  if (material.userData?.buildingWeatherOverlay) return material;

  const seed = hashSeed(`p17:${seedKey}`);
  const family = material.userData?.family ?? '';
  const weatherFamily = family === 'corrugated' ? 1
    : family === 'tile' ? 2
      : family === 'slate' ? 3
        : family === 'concrete' ? 4
          : family === 'painted_metal' ? 5
            : 0;
  const uniforms = {
    p17WeatherMap: { value: atlas.map },
    p17WeatherRole: { value: BUILDING_WEATHER_ROLE[role] },
    p17WeatherFamily: { value: weatherFamily },
    p17WeatherSalt: { value: (seed % 8191) + 1 },
    p17WeatherStrength: { value: BUILDING_WEATHER_ATLAS.intensity },
    p17BoardScaleStrength: { value: 1 },
  };
  material.userData.buildingWeatherOverlay = {
    atlas: atlas.id,
    role,
    seed,
    variants: BUILDING_WEATHER_ATLAS.variants,
    contactBandMetres: [...BUILDING_WEATHER_ATLAS.contactBandMetres],
    family,
    strengthUniform: uniforms.p17WeatherStrength,
    boardScaleStrengthUniform: uniforms.p17BoardScaleStrength,
    facadeFeatureMetres: [...BUILDING_WEATHER_ATLAS.facadeFeatureMetres],
    roofCourseMetres: BUILDING_WEATHER_ATLAS.roofCourseMetres,
    secondMap: true,
  };

  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    if (previousCompile) previousCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
varying vec2 vP17WeatherUv;
varying vec2 vP17BuildingOrigin;
varying float vP17HeightAboveBase;
varying vec3 vP17WorldPosition;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
#ifdef USE_UV
  vP17WeatherUv = uv;
#else
  vP17WeatherUv = vec2(0.5);
#endif
#ifdef USE_INSTANCING
  vec4 p17Origin = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec4 p17World = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
#else
  vec4 p17Origin = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec4 p17World = modelMatrix * vec4(transformed, 1.0);
#endif
  vP17BuildingOrigin = p17Origin.xz;
  vP17HeightAboveBase = max(0.0, p17World.y - p17Origin.y);
  vP17WorldPosition = p17World.xyz;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform sampler2D p17WeatherMap;
uniform float p17WeatherRole;
uniform float p17WeatherFamily;
uniform float p17WeatherSalt;
uniform float p17WeatherStrength;
uniform float p17BoardScaleStrength;
varying vec2 vP17WeatherUv;
varying vec2 vP17BuildingOrigin;
varying float vP17HeightAboveBase;
varying vec3 vP17WorldPosition;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
{
  if (p17WeatherStrength > 0.001) {
  vec2 p17Cell = floor((vP17BuildingOrigin + vec2(4.0)) / 8.0);
  float p17Seed = fract(sin(dot(p17Cell + vec2(p17WeatherSalt, p17WeatherSalt * 0.37),
    vec2(12.9898, 78.233))) * 43758.5453);
  float p17Variant = min(3.0, floor(p17Seed * 4.0));
  vec2 p17Uv = fract(vP17WeatherUv * 0.99999);
  if (p17WeatherRole > 1.5) {
    p17Uv.y = clamp(vP17HeightAboveBase / 0.8, 0.0, 1.0);
  }
  vec2 p17AtlasUv = vec2(
    (p17Variant * 64.0 + 0.5 + p17Uv.x * 63.0) / 256.0,
    (p17WeatherRole * 64.0 + 0.5 + p17Uv.y * 63.0) / 256.0
  );
  vec4 p17Wear = texture2D(p17WeatherMap, p17AtlasUv);
  vec3 p17WorldNormal = normalize(normal * mat3(viewMatrix));
  float p17Facing = smoothstep(0.20, 0.72, 1.0 - abs(p17WorldNormal.y));
  if (p17WeatherRole > 0.5 && p17WeatherRole < 1.5) {
    p17Facing = smoothstep(0.16, 0.66, abs(p17WorldNormal.y));
    if (p17WeatherFamily > 1.5 && p17WeatherFamily < 2.5) {
      float p17South = smoothstep(0.08, 0.72, -p17WorldNormal.z);
      float p17Neutral = dot(p17Wear.rgb, vec3(0.2126, 0.7152, 0.0722));
      p17Wear.rgb = vec3(p17Neutral)
        * mix(vec3(1.0), vec3(0.78, 0.93, 0.75), p17Wear.a * p17South * 0.42);
    } else if (p17WeatherFamily < 0.5 || p17WeatherFamily > 1.5) {
      p17Wear.rgb = vec3(dot(p17Wear.rgb, vec3(0.2126, 0.7152, 0.0722)));
    }
  } else if (p17WeatherRole > 1.5) {
    // Contact shadow belongs on the vertical plinth edge, never across its horizontal top.
    p17Facing = 1.0 - smoothstep(0.62, 0.90, abs(p17WorldNormal.y));
    p17Facing *= 1.0 - smoothstep(0.4, 0.8, vP17HeightAboveBase);
  }
  float r7WearBand = mod(mod(p17Cell.x + p17Cell.y * 2.0, 9.0) + 9.0, 9.0);
  float p17PerBuilding = 0.55 + r7WearBand * 0.05625;
  diffuseColor.rgb *= mix(vec3(1.0), p17Wear.rgb,
    p17WeatherStrength * p17Facing * p17PerBuilding);

  // B4: board-camera marks are generated in metres, so the signal survives the plate's
  // downsample instead of depending on 128px normal texels. This remains one shader/map bucket.
  if (p17BoardScaleStrength > 0.001) {
    vec2 p17Relative = vP17WorldPosition.xz - vP17BuildingOrigin;
    if (p17WeatherRole < 0.5) {
      float p17ToneIndex = mod(mod(p17Cell.x + p17Cell.y * 2.0, 5.0) + 5.0, 5.0);
      float p17Tone = p17ToneIndex < 0.5 ? 0.88
        : p17ToneIndex < 1.5 ? 0.94
          : p17ToneIndex < 2.5 ? 1.0
            : p17ToneIndex < 3.5 ? 1.06 : 0.91;
      float p17Across = abs(p17WorldNormal.z) >= abs(p17WorldNormal.x)
        ? p17Relative.x : p17Relative.y;
      float p17LaneCell = floor((p17Across + p17Seed * 2.1) / 2.6);
      float p17LaneGate = step(0.34, fract(sin(p17LaneCell * 21.731
        + p17WeatherSalt) * 43758.5453));
      float p17LaneDistance = abs(fract((p17Across + p17Seed * 2.1) / 2.6) - 0.5) * 2.6;
      float p17MacroStreak = (1.0 - smoothstep(0.15, 0.42, p17LaneDistance)) * p17LaneGate;
      float p17HeadPhase = fract((vP17HeightAboveBase + p17Seed * 1.7) / 3.0);
      float p17HeadSoot = 1.0 - smoothstep(0.12, 0.27, abs(p17HeadPhase - 0.76));
      float p17PlinthDirt = 1.0 - smoothstep(0.0, 1.2, vP17HeightAboveBase);
      float p17MacroDirt = p17MacroStreak * (0.07 + p17HeadSoot * 0.16)
        + p17PlinthDirt * 0.24 * p17PerBuilding;
      diffuseColor.rgb *= p17Tone * (1.0 - p17MacroDirt
        * p17BoardScaleStrength * p17Facing);
      // B7: plate-scale brick courses, render tonal drift, and a darker splash band.
      float p17BrickCourse = fract(vP17HeightAboveBase / 0.36 + p17Seed * 0.41);
      float p17CourseBand = 1.0 - smoothstep(0.08, 0.22,
        min(p17BrickCourse, 1.0 - p17BrickCourse));
      float p17CourseRow = floor(vP17HeightAboveBase / 0.36);
      float p17CourseTint = mix(-0.05, 0.04, fract(sin((p17CourseRow + p17Seed)
        * 17.13) * 43758.5453));
      diffuseColor.rgb *= 1.0 + p17CourseTint * p17BoardScaleStrength * p17Facing;
      diffuseColor.rgb *= 1.0 - p17CourseBand * 0.08 * p17BoardScaleStrength * p17Facing;
      float p17Drift = fract(sin(dot(floor(p17Relative / 1.15), vec2(12.9898, 78.233))
        + p17WeatherSalt) * 43758.5453);
      diffuseColor.rgb *= mix(vec3(1.0), vec3(mix(0.90, 1.06, p17Drift)),
        0.22 * p17BoardScaleStrength * p17Facing);
      float p17BaseGrime = 1.0 - smoothstep(0.0, 1.2, vP17HeightAboveBase);
      diffuseColor.rgb *= 1.0 - p17BaseGrime * 0.12 * p17BoardScaleStrength * p17Facing;
    } else if (p17WeatherRole > 0.5 && p17WeatherRole < 1.5) {
      float p17RoofEdge = 1.0 - smoothstep(0.025, 0.13,
        min(min(p17Uv.x, 1.0 - p17Uv.x), min(p17Uv.y, 1.0 - p17Uv.y)));
      diffuseColor.rgb *= 1.0 - p17RoofEdge * 0.14 * p17BoardScaleStrength;

      if (p17WeatherFamily > 1.5 && p17WeatherFamily < 3.5) {
        float p17CoursePhase = fract(vP17HeightAboveBase / 0.48 + p17Seed * 0.37);
        float p17CourseJoint = 1.0 - smoothstep(0.045, 0.16,
          min(p17CoursePhase, 1.0 - p17CoursePhase));
        float p17CourseLip = 1.0 - smoothstep(0.08, 0.22, abs(p17CoursePhase - 0.27));
        diffuseColor.rgb *= 1.0 - p17CourseJoint * 0.17 * p17BoardScaleStrength;
        diffuseColor.rgb *= 1.0 + p17CourseLip * 0.055 * p17BoardScaleStrength;
      } else if (p17WeatherFamily > 0.5 && p17WeatherFamily < 1.5) {
        float p17IronAcross = p17Relative.x + p17Relative.y * 0.37;
        float p17IronPhase = abs(fract((p17IronAcross + p17Seed) / 0.78) - 0.5) * 0.78;
        float p17IronSeam = 1.0 - smoothstep(0.055, 0.16, p17IronPhase);
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.91, 0.82, 0.76),
          p17IronSeam * 0.48 * p17BoardScaleStrength);
      } else if (p17WeatherFamily > 3.5 && p17WeatherFamily < 4.5) {
        vec2 p17PoolCell = fract((p17Relative + vec2(p17Seed * 3.1, p17Seed * 1.7))
          / vec2(5.8, 4.6)) - 0.5;
        float p17Pool = 1.0 - smoothstep(0.22, 0.48,
          length(p17PoolCell * vec2(1.0, 1.45)));
        p17Pool *= smoothstep(0.78, 0.94, abs(p17WorldNormal.y));
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.72, 0.84, 0.90),
          p17Pool * 0.34 * p17BoardScaleStrength);
        roughnessFactor = mix(roughnessFactor, max(0.38, roughnessFactor * 0.56),
          p17Pool * 0.68 * p17BoardScaleStrength);
      }
    }
  }
  }
}`,
    );
  };
  material.customProgramCacheKey = () => {
    const upstream = typeof previousKey === 'function' ? previousKey.call(material) : '';
    return `${upstream}|p17-building-weather-v5-r7`;
  };
  material.needsUpdate = true;
  return material;
}

/** Opaque kit glazing: unchanged Fresnel sky reflection, one shallow room, monotonic base room ambient, and one warm occupancy pass. */
export function applyBuildingGlassFinish(material, seedKey = material?.userData?.variant ?? 'glass', profile = null) {
  if (!material || material.userData?.buildingGlassFinish) return material;
  const seed = hashSeed(`p17-glass:${seedKey}`);
  const tint = P17_GLASS_TINTS[seed % P17_GLASS_TINTS.length];
  material.color.setRGB(0.12, 0.12, 0.12);
  material.metalness = 0;
  material.roughness = 0.08;
  material.transparent = false;
  material.opacity = 1;
  // The glass family starts transparent with depthWrite=false. Once made opaque,
  // restore depth writes or later room-core draws overwrite the entire pane/interior.
  material.depthWrite = true;
  material.ior = 1.5;
  material.specularIntensity = Math.max(0.58, Math.min(0.78, material.specularIntensity ?? 0.68));
  material.specularColor = new THREE.Color(tint);
  material.userData.envIntensityBase = Math.max(
    P1_HIGHLIGHT.minEnvGlass,
    Math.min(P1_HIGHLIGHT.maxEnvBase, material.userData.envIntensityBase ?? 1.1),
  );
  material.emissive = material.emissive?.isColor
    ? material.emissive
    : new THREE.Color('#000000');
  if ((material.emissiveIntensity ?? 0) < 0.045) {
    material.emissive.set('#000000');
    material.emissiveIntensity = 0.045;
  }
  const uniforms = {
    p17RoomSalt: { value: hashSeed(`p17-room:${seedKey}`) % 50 },
    p17LitRoomStrength: { value: 1 },
    // Safe daylight default until the existing lighting registration binds it.
    p24GlassDaylight: { value: 1 },
  };
  material.userData.buildingGlassFinish = {
    seed,
    tint,
    fresnelIor: 1.5,
    skyReflection: true,
    interiorWarmth: 'seeded-room-cells',
    ...(profile === 'bar-lit-room-r138b' ? { profile } : {}),
    interiorVolume: {
      method: 'ray-box',
      backDepthMetres: 0.60,
      cellMetres: [2.4, 3.0],
      planes: ['back', 'sides', 'floor', 'ceiling'],
      addedTriangles: 0,
      // Width and height of planar masks on the cell. Not ray-intersected faces.
      planarMasks: { edgeCurtainMetres: 0.11, blindMetres: 0.18 },
      // Base unoccupied coefficient inside p20Room * p24RoomLight, not the courtyard variant:
      // 0.02*(1+day/5)/(1-0.8*day). Night 0.02, day 0.12, strictly increasing in daylight.
      illumination: {
        reflection: 'unchanged',
        unoccupiedBase: profile === 'bar-lit-room-r138b' ? 'monotonic-0.02-night-0.384-day' : 'monotonic-0.02-night-0.12-day',
        occupied: 'one-warm-pass',
      },
    },
    litFraction: P17_WINDOW_LIGHTING.fraction,
    roomCellMetres: [...P17_WINDOW_LIGHTING.cellMetres],
    litRoomStrengthUniform: uniforms.p17LitRoomStrength,
    daylightUniform: uniforms.p24GlassDaylight,
  };

  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    if (previousCompile) previousCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 vP17GlassWorldPosition;
varying float vP17GlassVertical;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
#ifdef USE_INSTANCING
  mat4 p17GlassModel = modelMatrix * instanceMatrix;
#else
  mat4 p17GlassModel = modelMatrix;
#endif
  vP17GlassWorldPosition = (p17GlassModel * vec4(transformed, 1.0)).xyz;
  vec3 p17GlassWorldNormal = normalize(mat3(p17GlassModel) * normal);
  vP17GlassVertical = 1.0 - smoothstep(0.55, 0.84, abs(p17GlassWorldNormal.y));`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform float p17RoomSalt;
uniform float p17LitRoomStrength;
uniform float p24GlassDaylight;
varying vec3 vP17GlassWorldPosition;
varying float vP17GlassVertical;
vec3 p20OccupancyRadiance;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
// Analytic hemisphere reflection, available even before LightingRig supplies its PMREM.
vec3 p20Reflection = reflect(-normalize(cameraPosition - vP17GlassWorldPosition),
  normalize(normal * mat3(viewMatrix)));
vec3 p20Sky = mix(vec3(0.055, 0.065, 0.035), vec3(0.42, 0.46, 0.50),
  smoothstep(-0.15, 0.65, p20Reflection.y));
float p20Fresnel = 0.04 + 0.30 * pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 5.0);
outgoingLight += p20Sky * p20Fresnel;
// One shallow room locked to this fragment's oriented cell (2.4 m × 3.0 m).
// The nearest nonnegative hit is the back, a side, the floor or the ceiling.
// Curtain and blind are planar masks in that cell, not extra intersected faces.
vec3 p20N = normalize(normal * mat3(viewMatrix));
vec3 p20Eye = normalize(cameraPosition - vP17GlassWorldPosition);
vec3 p20U = normalize(vec3(p20N.z, 0.0, -p20N.x) + vec3(0.00001, 0.0, 0.0));
float p20Nd = max(0.20, abs(dot(p20Eye, p20N)));
float p20Du = -dot(p20Eye, p20U) / p20Nd;
float p20Dy = -p20Eye.y / p20Nd;
float p20CellW = 2.4;
float p20CellH = 3.0;
float p20Along = dot(vP17GlassWorldPosition, p20U);
float p20CellU = floor((p20Along + 0.6) / p20CellW);
float p20CellY = floor((vP17GlassWorldPosition.y + 0.25) / p20CellH);
float p20RoomU = p20Along + 0.6 - p20CellU * p20CellW;
float p20RoomY = vP17GlassWorldPosition.y + 0.25 - p20CellY * p20CellH;
// Nearest nonnegative face only. A later mix must not replace a closer wall.
float p20BackT = 0.60;
float p20SideT = -1.0;
if (p20Du > 0.0001) p20SideT = (p20CellW - p20RoomU) / p20Du;
else if (p20Du < -0.0001) p20SideT = p20RoomU / -p20Du;
float p20FloorT = -1.0;
float p20CeilT = -1.0;
if (p20Dy < -0.0001) p20FloorT = p20RoomY / -p20Dy;
else if (p20Dy > 0.0001) p20CeilT = (p20CellH - p20RoomY) / p20Dy;
float p20T = p20BackT;
float p20Kind = 0.0;
if (p20SideT >= 0.0 && p20SideT < p20T) { p20T = p20SideT; p20Kind = 1.0; }
if (p20FloorT >= 0.0 && p20FloorT < p20T) { p20T = p20FloorT; p20Kind = 2.0; }
if (p20CeilT >= 0.0 && p20CeilT < p20T) { p20T = p20CeilT; p20Kind = 3.0; }
float p20HitU = clamp(p20RoomU + p20Du * p20T, 0.0, p20CellW);
float p20HitY = clamp(p20RoomY + p20Dy * p20T, 0.0, p20CellH);
float p20Var = mod(mod(p20CellU * 3.0 + p20CellY * 2.0 + p17RoomSalt, 50.0) + 50.0, 50.0) / 49.0;
vec3 p20BackWall = mix(vec3(0.070, 0.060, 0.052), vec3(0.056, 0.058, 0.064), p20Var * 0.55);
float p20Inset = smoothstep(0.0, 0.50, min(p20HitU, p20CellW - p20HitU))
  * smoothstep(0.0, 0.38, min(p20HitY, p20CellH - p20HitY));
p20BackWall *= mix(0.68, 1.0, p20Inset);
vec3 p20SideWall = max(p20BackWall * 0.46, vec3(0.028));
vec3 p20FloorCol = max(p20BackWall * vec3(0.70, 0.58, 0.48), vec3(0.030));
vec3 p20CeilCol = max(p20BackWall * vec3(1.05, 1.08, 1.12), vec3(0.046));
vec3 p20Room = p20BackWall;
if (p20Kind > 0.5 && p20Kind < 1.5) p20Room = p20SideWall;
else if (p20Kind > 1.5 && p20Kind < 2.5) p20Room = p20FloorCol;
else if (p20Kind > 2.5) p20Room = p20CeilCol;
float p20Curtain = 1.0 - smoothstep(0.045, 0.11, min(p20RoomU, p20CellW - p20RoomU));
float p20Blind = 1.0 - smoothstep(0.05, 0.18, p20CellH - p20RoomY);
p20Room = mix(p20Room, vec3(0.031, 0.030, 0.029), max(p20Curtain, p20Blind) * 0.70);
// Reflection, Fresnel, PMREM and the analytic sky above are unchanged.
// Combined base ambient, the room-term coefficient after cancelling p24RoomLight, is
// 0.02*(1+day/5)/(1-0.8*day): 0.02 at night, 0.12 at day, and strictly
// increasing, so a dimmer daylight is never brighter. The division only
// cancels mix(1.0, 0.12, day). Courtyard recesses then multiply this term by
// mix(1.0, 0.20, day), which cancels the denominator and leaves 0.02+0.004*day.
float p24Day = clamp(p24GlassDaylight, 0.0, 1.0);
float p24InteriorLight = mix(0.72, 0.24, p24Day);
float p24RoomLight = mix(1.0, 0.12, p24Day);
float p20Face = clamp(dot(p20Room, vec3(0.30, 0.59, 0.11))
  / max(dot(p20BackWall, vec3(0.30, 0.59, 0.11)), 1e-4), 0.35, 1.25);
float p20BaseAmbient = 0.02 * (1.0 + p24Day / 5.0) / (1.0 - 0.8 * p24Day);
p20Room *= p20BaseAmbient / p24RoomLight;
${profile === 'bar-lit-room-r138b' ? `
// P138 bar pilot: sealed proxy diffuse colour is not a pane reflection.
// Keep physical specular/PMREM and the analytic sky on the outer surface.
// Transmit the existing ray-box room and one occupancy pass behind it.
vec3 p138GlassSurface = reflectedLight.directSpecular + reflectedLight.indirectSpecular
  + p20Sky * p20Fresnel;
// P138B: daylight reaches the existing back/side/floor/ceiling planes.
// Preserve their relative contrast; occupancy and the reflected pane stay held.
float p138bRoomGain = mix(1.0, 3.2, p24Day);
vec3 p138RoomRadiance = p20Room * p24RoomLight * p138bRoomGain + p20OccupancyRadiance * p20Face;
outgoingLight = mix(outgoingLight, p138GlassSurface
  + p138RoomRadiance * (1.0-p20Fresnel), vP17GlassVertical);
` : `outgoingLight -= p20OccupancyRadiance;
outgoingLight = mix(outgoingLight, outgoingLight * p24InteriorLight + p20Room * p24RoomLight + p20OccupancyRadiance * p20Face,
  vP17GlassVertical * (1.0-p20Fresnel));`}
#include <opaque_fragment>`);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
{
  // Same world-cell occupancy as before. The room composite withdraws this add
  // and applies it once on the hit face, so authored base emissive stays put.
  p20OccupancyRadiance = vec3(0.0);
  if (p17LitRoomStrength > 0.001 && vP17GlassVertical > 0.001) {
    vec3 p17RoomCell = floor((vP17GlassWorldPosition + vec3(0.6, 0.25, 1.1))
      / vec3(2.4, 3.0, 2.4));
    float p17RoomCode = mod(mod(p17RoomCell.x * 3.0 + p17RoomCell.y * 2.0
      + p17RoomCell.z * 7.0 + p17RoomSalt, 50.0) + 50.0, 50.0);
    float p17RoomLit = 1.0 - step(3.0, p17RoomCode);
    p20OccupancyRadiance = vec3(1.0, 0.43, 0.12) * p17RoomLit
      * vP17GlassVertical * 0.52 * p17LitRoomStrength
      * mix(1.0, 0.12, clamp(p24GlassDaylight, 0.0, 1.0))
      * mix(0.25, 1.0, smoothstep(0.15,0.27,fract(vP17GlassWorldPosition.x / 2.4))
        * (1.0-smoothstep(0.75,0.87,fract(vP17GlassWorldPosition.x / 2.4))));
    totalEmissiveRadiance += p20OccupancyRadiance;
  }
}`,
    );
  };
  material.customProgramCacheKey = () => {
    const upstream = typeof previousKey === 'function' ? previousKey.call(material) : '';
    return `${upstream}|p17-building-glass-v2|kitmat6-monotonic-ambient|v4-daylight-v1${profile ? "|" + profile : ""}`;
  };
  material.needsUpdate = true;
  return material;
}

function movingProfileNumber(value) {
  if (typeof value !== 'number') return null;
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
  if (Object.is(value, -0)) return '-0';
  return value;
}

function movingProfileColor(color) {
  if (!color?.isColor) return null;
  return [movingProfileNumber(color.r), movingProfileNumber(color.g), movingProfileNumber(color.b)];
}

/** Kit glass that carries the shared finish marker. Name is not a classifier. */
function isMovingKitGlass(material) {
  const finish = material?.userData?.buildingGlassFinish;
  return material?.userData?.family === 'glass'
    && finish != null
    && typeof finish === 'object'
    && finish.mode !== 'reflective-only';
}

function movingProfileFlag(value, absent) {
  return typeof value === 'boolean' ? value : absent;
}

function movingProfileScalar(value, absent) {
  return movingProfileNumber(typeof value === 'number' ? value : absent);
}

function movingGlassProfileKey(material) {
  const normalScale = material.normalScale?.isVector2
    ? [movingProfileNumber(material.normalScale.x), movingProfileNumber(material.normalScale.y)]
    : [1, 1];
  // JSON array: exact values, fixed order, no delimiter that a field can impersonate.
  // Absent properties use the MeshPhysicalMaterial value copy leaves in place.
  return JSON.stringify([
    movingProfileFlag(material.vertexColors, false),
    movingProfileFlag(material.flatShading, false),
    movingProfileFlag(material.transparent, false),
    movingProfileScalar(material.opacity, 1),
    movingProfileFlag(material.depthWrite, true),
    movingProfileFlag(material.depthTest, true),
    movingProfileScalar(material.side, 0),
    movingProfileFlag(material.fog, true),
    movingProfileScalar(material.roughness, 1),
    movingProfileScalar(material.metalness, 0),
    movingProfileScalar(material.alphaTest, 0),
    movingProfileScalar(material.transmission, 0),
    movingProfileScalar(material.ior, 1.5),
    movingProfileScalar(material.specularIntensity, 1),
    movingProfileScalar(material.clearcoat, 0),
    movingProfileScalar(material.clearcoatRoughness, 0),
    movingProfileScalar(material.sheen, 0),
    movingProfileScalar(material.sheenRoughness, 1),
    movingProfileScalar(material.emissiveIntensity, 1),
    movingProfileScalar(material.envMapIntensity, 1),
    movingProfileScalar(material.userData?.envIntensityBase, null),
    movingProfileColor(material.color) ?? [1, 1, 1],
    movingProfileColor(material.emissive) ?? [0, 0, 0],
    movingProfileColor(material.specularColor) ?? [1, 1, 1],
    movingProfileColor(material.sheenColor) ?? [1, 1, 1],
    normalScale,
    ['map', 'roughnessMap', 'normalMap', 'aoMap', 'emissiveMap', 'alphaMap']
      .map((name) => material[name]?.uuid ?? null),
  ]);
}

function copyMovingGlassProfile(target, source) {
  const flag = movingProfileFlag;
  const scalar = (value, absent) => (typeof value === 'number' ? value : absent);
  if (source.color?.isColor) target.color.copy(source.color);
  target.roughness = scalar(source.roughness, 1);
  target.metalness = scalar(source.metalness, 0);
  target.opacity = scalar(source.opacity, 1);
  target.transparent = flag(source.transparent, false);
  target.depthWrite = flag(source.depthWrite, true);
  target.depthTest = flag(source.depthTest, true);
  target.alphaTest = scalar(source.alphaTest, 0);
  target.side = scalar(source.side, 0);
  target.vertexColors = flag(source.vertexColors, false);
  target.flatShading = flag(source.flatShading, false);
  target.fog = flag(source.fog, true);
  if (source.emissive?.isColor) target.emissive.copy(source.emissive);
  target.emissiveIntensity = scalar(source.emissiveIntensity, 1);
  target.map = source.map ?? null;
  target.roughnessMap = source.roughnessMap ?? null;
  target.normalMap = source.normalMap ?? null;
  target.aoMap = source.aoMap ?? null;
  target.emissiveMap = source.emissiveMap ?? null;
  target.alphaMap = source.alphaMap ?? null;
  if (target.normalScale?.isVector2) {
    if (source.normalScale?.isVector2) target.normalScale.copy(source.normalScale);
    else target.normalScale.set(1, 1);
  }
  target.ior = scalar(source.ior, 1.5);
  target.transmission = scalar(source.transmission, 0);
  target.clearcoat = scalar(source.clearcoat, 0);
  target.clearcoatRoughness = scalar(source.clearcoatRoughness, 0);
  target.sheen = scalar(source.sheen, 0);
  target.sheenRoughness = scalar(source.sheenRoughness, 1);
  if (target.sheenColor?.isColor) {
    if (source.sheenColor?.isColor) target.sheenColor.copy(source.sheenColor);
    else target.sheenColor.setRGB(1, 1, 1);
  }
  target.specularIntensity = scalar(source.specularIntensity, 1);
  if (target.specularColor?.isColor) {
    if (source.specularColor?.isColor) target.specularColor.copy(source.specularColor);
    else target.specularColor.setRGB(1, 1, 1);
  }
  target.envMapIntensity = scalar(source.envMapIntensity, 1);
  target.userData.envIntensityBase = typeof source.userData?.envIntensityBase === 'number'
    ? source.userData.envIntensityBase
    : undefined;
}

/**
 * Opaque reflective glass for a moving leaf. Same Fresnel/analytic-sky block as
 * static kit glass, with no room intersection and no world-cell occupancy.
 * The diffuse body is multiplied by 0.24 — the static daytime substrate
 * coefficient — immediately before physical outgoingLight. Specular, authored
 * emissive, sheen and clearcoat are left on Three's own composition.
 * Source onBeforeCompile hooks, including procedural room emission, are not copied.
 */
function applyReflectiveMovingGlassFinish(material) {
  if (!material || material.userData?.buildingGlassFinish?.mode === 'reflective-only') return material;
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  const movingPhysicalSum = 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;';
  material.onBeforeCompile = (shader, renderer) => {
    if (previousCompile) previousCompile.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 vP20MovingGlassWorld;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
#ifdef USE_INSTANCING
  mat4 p20MovingModel = modelMatrix * instanceMatrix;
#else
  mat4 p20MovingModel = modelMatrix;
#endif
  vP20MovingGlassWorld = (p20MovingModel * vec4(transformed, 1.0)).xyz;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 vP20MovingGlassWorld;`,
    );
    const physicalSums = shader.fragmentShader.split(movingPhysicalSum).length - 1;
    if (physicalSums !== 1) {
      throw new Error(`Moving glass diffuse gain needs exactly one physical outgoingLight sum, found ${physicalSums}`);
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      movingPhysicalSum,
      `totalDiffuse *= 0.24;\n${movingPhysicalSum}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
vec3 p20Reflection = reflect(-normalize(cameraPosition - vP20MovingGlassWorld),
  normalize(normal * mat3(viewMatrix)));
vec3 p20Sky = mix(vec3(0.055, 0.065, 0.035), vec3(0.42, 0.46, 0.50),
  smoothstep(-0.15, 0.65, p20Reflection.y));
float p20Fresnel = 0.04 + 0.30 * pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 5.0);
outgoingLight += p20Sky * p20Fresnel;
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => {
    const upstream = typeof previousKey === 'function' ? previousKey.call(material) : '';
    return `${upstream}|p20-moving-glass-reflective-v2`;
  };
  material.userData.buildingGlassFinish = {
    mode: 'reflective-only',
    skyReflection: true,
    fresnelIor: material.ior ?? 1.5,
    interior: 'none',
    occupancy: 'none',
    // Trial body gain only. Static p24InteriorLight is mix(0.72, 0.24, daylight); 0.24 is its day end.
    diffuseBodyGain: 0.24,
    diffuseBody: 'static-daytime-substrate-before-outgoing-light',
  };
  material.needsUpdate = true;
  return material;
}

/**
 * Stable wall/roof pairing per building archetype. Name-based, never random.
 * Victorian brick terraces → brick + slate; federation cottages → weatherboard + corrugated;
 * postwar / contemporary → render + corrugated or glass accents.
 */
export const ARCHETYPE_SURFACES = Object.freeze({
  'terrace-single': { wall: 'brick', roof: 'slate', trim: 'painted_metal' },
  'terrace-double': { wall: 'brick', roof: 'slate', trim: 'painted_metal' },
  'terrace-carlton-heritage': { wall: 'brick', roof: 'slate', trim: 'painted_metal' },
  'cottage-federation': { wall: 'weatherboard', roof: 'corrugated', trim: 'timber' },
  'heritage-federation-villa': { wall: 'render', roof: 'tile', trim: 'timber' },
  'bungalow-californian': { wall: 'render', roof: 'corrugated', trim: 'timber' },
  'bungalow-brighton': { wall: 'render', roof: 'tile', trim: 'timber' },
  'walkup-flats': { wall: 'brick', roof: 'concrete', trim: 'render' },
  'art-deco-flats': { wall: 'render', roof: 'concrete', trim: 'painted_metal' },
  'shop-corner': { wall: 'render', roof: 'corrugated', trim: 'painted_metal' },
  'warehouse-brick': { wall: 'brick', roof: 'corrugated', trim: 'painted_metal' },
  'warehouse-richmond-loft': { wall: 'brick', roof: 'corrugated', trim: 'painted_metal' },
  'tower-office': { wall: 'glass', roof: 'concrete', trim: 'painted_metal' },
  'townhouse-row': { wall: 'render', roof: 'slate', trim: 'timber' },
  'townhouse-paired-single': { wall: 'weatherboard', roof: 'corrugated', trim: 'timber' },
  'apartment-low': { wall: 'render', roof: 'concrete', trim: 'painted_metal' },
  'apartment-mid': { wall: 'render', roof: 'concrete', trim: 'glass' },
  'apartment-tower': { wall: 'glass', roof: 'concrete', trim: 'painted_metal' },
  'apartment-midrise': { wall: 'render', roof: 'concrete', trim: 'glass' },
  'apartment-permit': { wall: 'render', roof: 'concrete', trim: 'painted_metal' },
  'house-modern-skillion': { wall: 'render', roof: 'corrugated', trim: 'painted_metal' },
  'house-modern-pavilion': { wall: 'render', roof: 'concrete', trim: 'painted_metal' },
  'townhouse-modern-brick': { wall: 'brick', roof: 'corrugated', trim: 'painted_metal' },
  'townhouse-modern-render': { wall: 'render', roof: 'corrugated', trim: 'timber' },
  'apartment-modern-courtyard': { wall: 'render', roof: 'concrete', trim: 'painted_metal' },
  'apartment-modern-bar': { wall: 'render', roof: 'concrete', trim: 'painted_metal' },
  'shoptop-mixed': { wall: 'brick', roof: 'corrugated', trim: 'glass' },
  'warehouse-converted': { wall: 'brick', roof: 'corrugated', trim: 'glass' },
  // V3.70 L6. `trim: 'painted_metal'` rather than the conversion's `glass`, and it is the whole
  // difference between the two futures of this shell: a data-centre fit-out seals its openings
  // with louvres and precast panels, so there is no glass anywhere on the building to trim with.
  'warehouse-datacentre': { wall: 'brick', roof: 'corrugated', trim: 'painted_metal' },
  'office-lowrise': { wall: 'glass', roof: 'concrete', trim: 'painted_metal' },
  // Civic commissioned ids land here when rematerialised as fallbacks.
  'transport-interchange': { wall: 'brick', roof: 'corrugated', trim: 'painted_metal' },
  'supermarket-strip': { wall: 'render', roof: 'corrugated', trim: 'painted_metal' },
  'cafe-corner': { wall: 'brick', roof: 'corrugated', trim: 'timber', glass: 'glass' },
  'school-primary': { wall: 'brick', roof: 'slate', trim: 'painted_metal' },
  'childcare-centre': { wall: 'render', roof: 'corrugated', trim: 'timber' },
  'community-recreation': { wall: 'brick', roof: 'concrete', trim: 'painted_metal' },
  'hospital-district': { wall: 'render', roof: 'concrete', trim: 'painted_metal', glass: 'glass' },
  'police-station': { wall: 'concrete', roof: 'concrete', trim: 'painted_metal' },
  'remand-centre': { wall: 'concrete', roof: 'concrete', trim: 'painted_metal' },
  'factory-light': { wall: 'concrete', roof: 'corrugated', trim: 'painted_metal' },
  'stock-exchange': { wall: 'render', roof: 'slate', trim: 'painted_metal', glass: 'glass' },
});

/**
 * District wall bias. Applied when the archetype table does not force glass (towers keep
 * glass). Brighton weatherboard coastal read; Docklands concrete/render; heritage brick.
 */
export const DISTRICT_WALL_BIAS = Object.freeze({
  'fitzroy-north': 'brick',
  'carlton-east': 'render',
  'richmond-flat': 'brick',
  'brighton-reach': 'weatherboard',
  'docklands-quay': 'render',
  'brunswick-rise': 'weatherboard',
});

/**
 * Per-district wall chroma multipliers (instanceColor). Geometry batches by wall family
 * bucket (not 6 districts); this mul supplies district colour on shared kit-wall materials.
 * Values stay near-white so parcel tintFor still reads.
 */
export const DISTRICT_WALL_CHROMA = Object.freeze({
  'fitzroy-north': '#f0d8c8', // warm heritage brick
  'carlton-east': '#f2ebe2', // cream render
  'richmond-flat': '#e4cfc0', // deeper brick
  'brighton-reach': '#f6f2ea', // pale coastal weatherboard
  'docklands-quay': '#dce2e8', // cool quay render
  'brunswick-rise': '#ebe6dc', // soft weatherboard
});

/**
 * Wall-family batch bucket for a parcel archetype + district.
 * Returns the effective wall surface id (brick / render / weatherboard / glass / …)
 * after DISTRICT_WALL_BIAS. Draw batches key on this — not on districtId — so six
 * districts collapse into a handful of wall families.
 *
 * @param {string} archetypeId
 * @param {string|null} [districtId]
 * @returns {string}
 */
export function wallBucketFor(archetypeId, districtId = null) {
  return surfacesForArchetype(archetypeId, districtId).wall;
}

/**
 * Classify a mesh part as wall / roof / glass / trim from geometry bounds and material cues.
 * Stable, name-first, then colour / metalness heuristics. Never random.
 */
export function classifyPartRole(part, index, partCount) {
  const material = part.material;
  const name = `${material?.name ?? ''} ${part.geometry?.name ?? ''} ${part.name ?? ''}`.toLowerCase();

  // Shopfront openings and glazing first — before roof colour heuristics swallow dark panes.
  if (/\b(glass|glaz|window|curtain|shopfront|servery)\b/.test(name)) return 'glass';
  if (/\bopening-.*-(glass|window|shopfront|servery|curtain)\b/.test(name)) return 'glass';
  if (/\bopening-front-(servery|mid-glass|right-glass|door)\b/.test(name)) {
    // Doors stay timber; glass bays and servery are glazing.
    if (/\bdoor\b/.test(name) && !/\bglass\b/.test(name)) return 'trim';
    return 'glass';
  }
  if (/\b(roof|corrug|slate|iron|tile|gutter|hip|ridge|flue|lantern-cap|lantern-curb|cope-)\b/.test(name)) {
    return 'roof';
  }
  if (/\b(trim|door|frame|rail|fascia|eave|metal|steel|shutter|awning)\b/.test(name)) return 'trim';
  if (/\b(wall|brick|render|weather|cladding|masonry|body|facade|façade|pier|plinth|wainscot|apron)\b/.test(name)) {
    return 'wall';
  }

  if (material?.transparent && (material.opacity ?? 1) < 0.85) return 'glass';
  // Authored glass material name (V300 glass) even when alpha was not yet exported.
  if (/\bglass\b/.test(material?.name ?? '')) return 'glass';
  if ((material?.metalness ?? 0) > 0.45 && (material?.roughness ?? 1) < 0.55) return 'roof';

  // Height band from bounding box: top fifth of a multi-part model is usually roof.
  const box = part.geometry?.boundingBox;
  if (box && partCount > 1) {
    const midY = (box.min.y + box.max.y) * 0.5;
    const topish = box.max.y > 0.01 && midY > box.max.y * 0.72;
    if (topish && index === partCount - 1) return 'roof';
    if (topish && material?.color) {
      const hsl = { h: 0, s: 0, l: 0 };
      material.color.getHSL(hsl);
      if (hsl.l < 0.45) return 'roof';
    }
  }

  // Colour heuristics on authored kit materials.
  if (material?.color) {
    const c = material.color;
    const max = Math.max(c.r, c.g, c.b);
    const min = Math.min(c.r, c.g, c.b);
    const sat = max > 1e-5 ? (max - min) / max : 0;
    const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    // Cool dark low-sat → roof iron / slate.
    if (lum < 0.38 && sat < 0.25 && c.b >= c.r * 0.9) return 'roof';
    // Warm mid red → brick already classified as wall by default.
    // Very dark blue-green transparent-ish already handled.
    if (lum < 0.28 && sat < 0.2) return 'roof';
  }

  // Last part on a two-part fallback is the roof slab.
  if (partCount === 2 && index === 1) return 'roof';
  return 'wall';
}

export function surfacesForArchetype(archetypeId, districtId = null) {
  const base = ARCHETYPE_SURFACES[archetypeId] ?? {
    wall: 'render',
    roof: 'corrugated',
    trim: 'painted_metal',
  };
  const wallBias = districtId ? DISTRICT_WALL_BIAS[districtId] : null;
  // Towers and glass-wall archetypes keep glass; everything else may take district bias.
  if (wallBias && base.wall !== 'glass') {
    return { ...base, wall: wallBias };
  }
  return base;
}

/**
 * Shared, cached MeshPhysicalMaterial factory. One material instance per
 * (family, variantKey) so instancing stays cheap and dispose is centralised.
 */
export class MaterialLibrary {
  /**
   * @param {{ quality?: 'high'|'medium'|'low' }} options
   */
  constructor({ quality = 'high', r72PlasterLoad = null } = {}) {
    this.quality = quality;
    this._r72PlasterLoad = r72PlasterLoad;
    this.textures = new TextureLibrary({ quality });
    /** @type {Map<string, THREE.MeshPhysicalMaterial>} */
    this._cache = new Map();
    /** Additive packs owned by a scoped renderer path, e.g. residential's atlas. */
    this._texturePacks = new Map();
    this.userData = Object.create(null);
    this._disposed = false;
  }

  /** One plaster map for the three Beaux surface buckets. Created on first use. */
  beauxPlaster() {
    if (this._disposed) throw new Error('MaterialLibrary disposed');
    if (!this._r72Plaster) {
      this._r72Plaster = createBeauxPlasterMap(
        this._r72PlasterLoad ? { load: this._r72PlasterLoad } : {},
      );
      this.registerTexturePack(this._r72Plaster);
    }
    return this._r72Plaster;
  }

  /** Register a scoped texture pack without changing any default material family. */
  registerTexturePack(pack) {
    if (!pack?.id || typeof pack.textureBytes !== 'function') {
      throw new TypeError('Texture pack must expose id and textureBytes()');
    }
    this._texturePacks.set(pack.id, pack);
    return pack;
  }

  /**
   * @param {string} family one of MATERIAL_FAMILIES keys
   * @param {{
   *   variant?: string,
   *   color?: string|number|THREE.Color,
   *   roughness?: number,
   *   metalness?: number,
   *   opacity?: number,
   *   transparent?: boolean,
   *   flatShading?: boolean,
   *   envBase?: number,
   *   weatherRole?: 'facade'|'roof'|'contact',
   *   buildingKey?: string,
   *   buildingGlass?: boolean,
   *   movingGlass?: 'reflective-only',
   * }} [opts]
   * @returns {THREE.MeshPhysicalMaterial}
   */
  get(family, opts = {}) {
    if (this._disposed) throw new Error('MaterialLibrary disposed');
    const spec = MATERIAL_FAMILIES[family];
    if (!spec) throw new RangeError(`Unknown material family: ${family}`);

    const variant = opts.variant ?? 'default';
    const cacheKey = `${family}::${variant}`;
    // Any surface override gets its own cache entry so two callers cannot fight over
    // metalness / opacity / colour on a shared MeshPhysicalMaterial.
    const hasOverride = opts.color != null
      || opts.roughness !== undefined
      || opts.metalness !== undefined
      || opts.opacity !== undefined
      || opts.transparent !== undefined
      || opts.envBase !== undefined
      || opts.weatherRole !== undefined
      || opts.buildingKey !== undefined
      || opts.buildingGlass !== undefined
      || opts.movingGlass !== undefined;
    const movingSuffix = opts.movingGlass !== undefined ? `:${opts.movingGlass}` : '';
    const derivedKey = hasOverride
      ? `${cacheKey}::${String(opts.color ?? '')}:${opts.roughness ?? ''}:${opts.metalness ?? ''}:${opts.opacity ?? ''}:${opts.transparent ?? ''}:${opts.envBase ?? ''}:${opts.weatherRole ?? ''}:${opts.buildingKey ?? ''}:${opts.buildingGlass ?? ''}${movingSuffix}`
      : `${cacheKey}${movingSuffix}`;
    if (this._cache.has(derivedKey)) return this._cache.get(derivedKey);

    const material = this._create(family, spec, opts);
    this._cache.set(derivedKey, material);
    return material;
  }

  _create(family, spec, opts) {
    const params = {
      color: opts.color ?? spec.color,
      roughness: opts.roughness ?? spec.roughness,
      metalness: opts.metalness ?? spec.metalness ?? 0,
      envMapIntensity: clampEnvIntensityBase(
        family,
        opts.envBase ?? spec.envBase ?? 0.92,
      ),
      flatShading: opts.flatShading ?? false,
    };

    if (spec.transparent || opts.transparent) {
      params.transparent = true;
      params.opacity = opts.opacity ?? spec.opacity ?? 1;
      params.depthWrite = (params.opacity ?? 1) > 0.95;
    }

    if (spec.clearcoat) {
      params.clearcoat = spec.clearcoat;
      params.clearcoatRoughness = spec.clearcoatRoughness ?? 0.3;
    }
    if (spec.ior != null) params.ior = spec.ior;
    if (spec.specularIntensity != null) params.specularIntensity = spec.specularIntensity;

    const micro = MICRO_SPECS[family] ? this.textures.getMicro(family) : null;

    if (spec.textureSet) {
      const pack = this._tryGetSet(spec.textureSet);
      if (pack) {
        params.map = pack.map;
        if (!micro) {
          params.roughnessMap = pack.roughnessMap;
          if (pack.normalMap && this.quality !== 'low') {
            params.normalMap = pack.normalMap;
            const ns = spec.normalScale ?? 1;
            params.normalScale = new THREE.Vector2(ns, ns);
          }
        }
        if (pack.aoMap && this.quality === 'high') {
          params.aoMap = pack.aoMap;
          params.aoMapIntensity = P4_GRUNGE.aoMapIntensity;
        }
      }
      // When a map is present, keep colour as a gentle multiplier so instance tint still
      // reads. Neutral-ish so the albedo carries the family identity.
      if (!opts.color) {
        params.color = spec.color;
      }
    }

    if (micro) {
      params.roughnessMap = micro.roughnessMap;
      if (micro.normalMap && this.quality !== 'low') {
        params.normalMap = micro.normalMap;
        const ns = spec.normalScale ?? 1;
        params.normalScale = new THREE.Vector2(ns, ns);
      }
    }

    const glassLike = family === 'glass' || family === 'water';
    const minRough = glassLike ? P1_HIGHLIGHT.minRoughnessGlass : P1_HIGHLIGHT.minRoughnessOpaque;
    params.roughness = Math.max(params.roughness ?? 0.5, minRough);
    // L4C: painted steel and glazing retain their authored surface-family range.
    // Architectural weather/roof finishes still apply their semantic floors later.
    if (family === 'painted_metal') params.roughness = THREE.MathUtils.clamp(params.roughness, 0.40, 0.50);
    if (family === 'glass') params.roughness = THREE.MathUtils.clamp(params.roughness, 0.08, 0.15);
    if (params.clearcoat != null) {
      params.clearcoat = Math.min(params.clearcoat, P1_HIGHLIGHT.maxClearcoat);
    }

    const material = new THREE.MeshPhysicalMaterial(params);
    // The reserve authors grass + worn soil in its instance palette. A fixed
    // display-space hue here erased that palette, including its cool compensation
    // for the warm aggregate map. Other legacy lawns retain their existing finish.
    const authoredReserveTurf = opts.variant === 'reserve-turf-r32b-mown';
    if (authoredReserveTurf) material.userData.albedoGroup = 'grass';
    if (!authoredReserveTurf && (/(lawn|grass|turf)/i.test(opts.variant ?? '') || (family === 'foliage' && !opts.variant))) {
      // Final albedo correction includes texture and instance tint, in display RGB.
      const upstream = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        upstream.call(material, shader, renderer);
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vDdLawn;');
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
vec4 ddLawnP = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
ddLawnP = instanceMatrix * ddLawnP;
#endif
vDdLawn = (modelMatrix * ddLawnP).xz;`);
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 vDdLawn;\n${LAWN_FIELD_GLSL}`);
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
vec3 p23Turf = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.0/2.2));
float p23Value = max(p23Turf.r, max(p23Turf.g, p23Turf.b));
diffuseColor.rgb = pow(p23Value * vec3(.94, 1.0, .62), vec3(2.2));
// W4-B lawn field: two octaves (3 m and 1.5 m, domain-warped) blend lush toward the dry token
// over about 28% of the area; a fine 0.7 m / 0.3 m octave keeps a 2 m patch from reading flat.
vec2 ddW = vDdLawn;
vec2 ddWarp = vec2(ddLawnN(ddW / 7. + vec2(3.1, 9.7)), ddLawnN(ddW / 7. + vec2(21.4, 5.3))) - .5;
vec2 ddQ = ddW + ddWarp * 3.2;
float ddBroad = ddLawnN(ddQ / 3.) * .65 + ddLawnN(ddQ / 1.5 + vec2(37.1, 11.9)) * .35;
float ddDry = smoothstep(.53, .67, ddBroad);
float ddFine = ddLawnN(ddW / .7 + vec2(5.5, 1.7)) * .6 + ddLawnN(ddW / .3 + vec2(13., 29.)) * .4;
vec3 ddDryCol = pow(p23Value * vec3(${LAWN_DRY_MUL[0]}, ${LAWN_DRY_MUL[1]}, ${LAWN_DRY_MUL[2]}), vec3(2.2));
diffuseColor.rgb = mix(diffuseColor.rgb, ddDryCol, ddDry * .85) * .88 * (1. + (ddFine - .5) * .22 + (ddBroad - .5) * .12);`);
      };
      material.customProgramCacheKey = () => 'p23-warm-turf-v2-w4b-lawn-field';
      material.userData.p23TurfSaturation = 0.38;
      material.userData.albedoGroup = 'grass';
    }
    material.specularIntensity = spec.specularIntensity ?? P1_HIGHLIGHT.specularIntensity;
    if (spec.anisotropy != null) material.anisotropy = spec.anisotropy;
    if (spec.anisotropyRotation != null) material.anisotropyRotation = spec.anisotropyRotation;
    material.name = `dd-mat:${family}`;
    material.userData.sharedLibrary = true;
    material.userData.family = family;
    material.userData.variant = opts.variant ?? 'default';
    /**
     * Environment intensity, overridable per variant since V3.31.
     *
     * It was a family constant, and that made it the one surface property a lane could not
     * reach. The café lane measured the consequence: two albedo→pixel pairs where **blue arrives
     * almost independently of albedo** — albedo blue literally zero, rendered blue 87. Where the
     * cause was a specular sky return the lane could fix it by roughening its own variant, and
     * did, taking an awning arm from +45 blue over albedo to +1. Where the cause is env
     * intensity it could not, because `glass` runs at 1.55 — the highest in the library — and
     * `get()` had no way to say otherwise for one variant.
     *
     * That capped the colour dimension from outside every lane at once, which is why this is
     * changed here rather than in any one of them. Purely additive: no caller passes `envBase`
     * today, so every existing material keeps its family value, and a variant that does pass one
     * gets its own cache entry.
     */
    material.userData.envIntensityBase = clampEnvIntensityBase(
      family,
      opts.envBase ?? spec.envBase ?? 0.92,
    );
    material.userData.microVariation = Boolean(micro);
    // MeshPhysical needs second UVs for aoMap in some three paths; duplicate uv→uv2.
    // Callers that use aoMap on geometry without uv2 still render; three falls back.

    if (opts.weatherRole) {
      applyBuildingWeatherOverlay(material, this.textures.getBuildingWeatherAtlas(), {
        role: opts.weatherRole,
        seedKey: opts.buildingKey ?? opts.variant ?? family,
      });
    }
    if (family === 'glass' && opts.movingGlass === 'reflective-only') {
      applyReflectiveMovingGlassFinish(material);
    } else if (family === 'glass' && opts.buildingGlass) {
      applyBuildingGlassFinish(material, opts.buildingKey ?? opts.variant ?? family, opts.kitGlassProfile ?? null);
    }

    // Only the actual city carriageway and its existing paint-film wear batch.
    // Tyres, vehicles and specialist fringe asphalt retain their owner's finish.
    if (family === 'asphalt' && ['road-asphalt-r5-worn', 'p17-plate-wheel-wear'].includes(opts.variant)) {
      material.color.set('#4d4b47');
      // Removing sky specular needs a diffuse compensation, measured at hero.
      if (opts.variant === 'road-asphalt-r5-worn') material.color.set('#696763');
      // W4-B: wheel tracks sit about 12% under the carriageway instead of reading as black bars.
      else material.color.set('#5e5c58');
      material.roughness = 0.96;
      material.metalness = 0;
      material.specularIntensity = 0;
      material.userData.r7RoadSurface = true;
      // W8-B: the structured carriageway surface; low keeps the broad octaves, lane wear and kerb dirt only.
      const w8RoadFine = this.quality !== 'low';
      const w8RoadPlate = opts.variant === 'p17-plate-wheel-wear';
      const previous = material.onBeforeCompile;
      const previousKey = material.customProgramCacheKey;
      const atlas = this.textures.getBuildingWeatherAtlas();
      material.onBeforeCompile = (shader, renderer) => {
        previous.call(material, shader, renderer);
        shader.uniforms.r7RoadAtlas = { value: atlas.map };
        shader.uniforms.ddDryCast = DRY_CAST;
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vR7Road;');
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
vec4 r7RoadPoint = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
r7RoadPoint = instanceMatrix * r7RoadPoint;
#endif
vR7Road = (modelMatrix * r7RoadPoint).xz;`);
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 vR7Road;\nuniform sampler2D r7RoadAtlas;\nuniform float ddDryCast;\n${LAWN_FIELD_GLSL}\n${ROAD_SURFACE_COMMON_GLSL}`);
        shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
// Resurfaced quadrilaterals, edge dirt and old wheel paths in world metres.
vec2 r7Cell = floor(vR7Road / 4.8);
float r7Code = mod(r7Cell.x * 19.0 + r7Cell.y * 37.0 + 13.0, 101.0);
vec2 r7Q = fract(vR7Road / 4.8);
float r7Repair = (1.0 - step(24.0, r7Code))
  * smoothstep(0.08, 0.12, r7Q.x + r7Q.y * 0.08)
  * (1.0 - smoothstep(0.84, 0.88, r7Q.x))
  * smoothstep(0.12, 0.16, r7Q.y)
  * (1.0 - smoothstep(0.78, 0.82, r7Q.y + r7Q.x * 0.06));
vec2 r7Corridor = mod(vR7Road, 64.0);
float r7Across = min(r7Corridor.x, r7Corridor.y);
float r7Kerb = 1.0 - smoothstep(0.18, 0.65, min(abs(r7Across - 2.8), abs(r7Across - 13.2)));
float r7Wheel = 1.0 - smoothstep(0.12, 0.46, min(abs(r7Across - 5.4), abs(r7Across - 10.6)));
vec3 r7Grain = texture2D(r7RoadAtlas, vec2(fract(vR7Road.x / 13.0) * 0.246, 0.50 + fract(vR7Road.y / 11.0) * 0.246)).rgb;
diffuseColor.rgb *= (0.94 - r7Repair * 0.30 - r7Kerb * 0.22 - r7Wheel * 0.12) * mix(vec3(1.0), r7Grain, 0.32);
roughnessFactor = max(0.75, roughnessFactor);
// W6-A: wear has its own form and shares nothing with the rain puddles (a 2.5 m and 1.1 m blob mask).
// The 2 m isotropic value noise of W4-B made pale blobs of the same size, so it is gone: wear is now
// streaks stretched along the lane (0.5 m across, 5.5 m along), two faint wheel-track bands 1.7 m apart
// in each lane, and the 0.55 m grain. Every term only darkens from a ceiling of 1.04, so nothing on the
// carriageway is paler than the asphalt around it; junction squares take no streaks (no lane direction).
float r7InX = step(2.8, r7Corridor.x) * step(r7Corridor.x, 13.2);
float r7InZ = step(2.8, r7Corridor.y) * step(r7Corridor.y, 13.2);
float r7ZRoad = r7InX * (1.0 - r7InZ);
float r7Straight = r7ZRoad + r7InZ * (1.0 - r7InX);
vec2 r7Lane = mix(vR7Road.yx, vR7Road.xy, r7ZRoad);
float r7LaneAcross = mix(r7Corridor.y, r7Corridor.x, r7ZRoad);
float r7LaneC = min(abs(r7LaneAcross - 5.4), abs(r7LaneAcross - 10.6));
float r7Streak = ddLawnN(vec2(r7Lane.x / 0.5, r7Lane.y / 5.5) + vec2(4.7, 8.3));
float r7Track = (1.0 - smoothstep(0.10, 0.34, abs(r7LaneC - 0.85))) * r7Straight;
float r7Fine = ddLawnN(vR7Road / .55 + vec2(7.3, 2.1));
diffuseColor.rgb *= 1.04 - r7Fine * .08 - r7Streak * .06 * r7Straight - r7Track * (.02 + .05 * r7Streak);
${roadSurfaceBodyGlsl({ fine: w8RoadFine, plate: w8RoadPlate })}
// W6-A: trim against the warm clear key (wet-road.js DRY_CAST); gone in rain, where the key is neutral.
diffuseColor.rgb *= mix(vec3(1.0), ${DRY_CAST_GLSL}, ddDryCast);`);
      };
      material.customProgramCacheKey = () => `${previousKey.call(material)}|r7-road-v4-w8b-surface${w8RoadFine ? '' : '-low'}${w8RoadPlate ? '-plate' : ''}`;
      applyPaintedTile(material, 'asphalt');
      if (opts.variant === 'p17-plate-wheel-wear') {
        // W4-B: the wheel-track slabs carried the packed asphalt tile at full albedo contrast, which is
        // what made them read as gritty black bars; they take the carriageway's reduced contrast.
        const wearPrevious = material.onBeforeCompile;
        const wearKey = material.customProgramCacheKey;
        material.onBeforeCompile = function (shader, renderer) {
          wearPrevious.call(this, shader, renderer);
          shader.fragmentShader = shader.fragmentShader.replace(
            'sampleValue.r = max(.025, .35+(sampleValue.r-.35)/sqrt(dot(w,w)));',
            'sampleValue.r = clamp(.35+(sampleValue.r-.35)*.35,.20,.50);');
        };
        material.customProgramCacheKey = function () { return `${wearKey.call(this)}|w4b-wheel-wear-contrast`; };
      }
      if (opts.variant === 'road-asphalt-r5-worn') {
        // Board-owned carriageway only. The shared packed texture stays immutable;
        // this local compiled response changes scale/contrast and normal balance.
        const packedPrevious = material.onBeforeCompile;
        const packedKey = material.customProgramCacheKey;
        const lowRoadWithoutRepair = this.quality === 'low';
        material.onBeforeCompile = function (shader, renderer) {
          packedPrevious.call(this, shader, renderer);
          if (shader.uniforms.r7bMetres?.value !== 6) {
            throw new Error('City road packed metre contract changed');
          }
          shader.uniforms.r7bMetres.value = 1.5;
          const replaceOnce = (from, to) => {
            if (shader.fragmentShader.split(from).length !== 2) {
              throw new Error('City road packed response changed: ' + from);
            }
            shader.fragmentShader = shader.fragmentShader.replace(from, to);
          };
          replaceOnce('sampleValue.r = max(.025, .35+(sampleValue.r-.35)/sqrt(dot(w,w)));',
            'sampleValue.r = clamp(.35+(sampleValue.r-.35)*.35,.20,.50);');
          replaceOnce('vec2 r7bN=r7bPacked.rg*2.0-1.0;',
            'normal=normalize(mix(nonPerturbedNormal,normal,0.20));\nvec2 r7bN=(r7bPacked.rg*2.0-1.0)*0.28;');
          replaceOnce('(0.94 - r7Repair * 0.30 - r7Kerb * 0.22 - r7Wheel * 0.12) * mix(vec3(1.0), r7Grain, 0.32)',
            lowRoadWithoutRepair
              ? '(0.94 - r7Repair * 0.0 - r7Kerb * 0.14 - r7Wheel * 0.08) * mix(vec3(1.0), r7Grain, 0.12)'
              : '(0.94 - r7Repair * 0.12 - r7Kerb * 0.14 - r7Wheel * 0.08) * mix(vec3(1.0), r7Grain, 0.12)');
        };
        material.customProgramCacheKey = function () {
          return `${packedKey.call(this)}|m15-city-carriageway-finish-r1${lowRoadWithoutRepair ? '|r112-low-no-repair' : ''}`;
        };
        material.userData.r7bPaintedTile.metres = 1.5;
        material.userData.m15CityCarriagewayFinish = {
          packedMetres: 1.5, albedoContrast: 0.35, precedingNormalWeight: 0.20,
          packedNormalWeight: 0.28, sharedTextureUnchanged: true,
        };
        material.needsUpdate = true;
      }
    }

    if (family === 'concrete' && ['footpath-r4-light', 'kit-civic-paving-r1',
      'kit-rec-access-paving-v331', 'kit-cafe-pave-r331', 'kit-childcare-path-v310'].includes(opts.variant)) {
      applyPaintedTile(material, 'pavement');
    }
    if (family === 'concrete' && ['beach-pad', 'beach-pad-b'].includes(opts.variant)) {
      tagSurface(material, 'beach-pad');
    }

    return material;
  }

  /**
   * Library-owned reflective glass for one compatible source profile.
   * Returns the same object for solids, imported glass, and repeats of a profile.
   * Does not write the source material or its material array.
   */
  reflectiveMovingGlass(material) {
    if (this._disposed) throw new Error('MaterialLibrary disposed');
    if (Array.isArray(material)) return material.map((entry) => this.reflectiveMovingGlass(entry));
    if (!isMovingKitGlass(material)) return material;
    const profileKey = movingGlassProfileKey(material);
    const cacheKey = `glass::moving-reflective::${profileKey}`;
    const cached = this._cache.get(cacheKey);
    if (cached) return cached;
    const created = new THREE.MeshPhysicalMaterial();
    created.name = 'dd-mat:glass-moving';
    created.userData.sharedLibrary = true;
    created.userData.family = 'glass';
    created.userData.variant = 'p20-moving-reflective';
    created.userData.movingGlass = 'reflective-only';
    created.userData.movingGlassProfile = profileKey;
    copyMovingGlassProfile(created, material);
    applyReflectiveMovingGlassFinish(created);
    this._cache.set(cacheKey, created);
    return created;
  }

  /** Albedo packs need a canvas. Node tests skip them; DataTexture micro maps still attach. */
  _tryGetSet(setId) {
    if (typeof document === 'undefined') return null;
    return this.textures.getSet(setId);
  }

  /** Re-key named legacy roof members before batching; never recolour their source bucket. */
  roofEdgeMaterial(name, material, roofMaterial = null) {
    if (!name || !material || /glass|grime|moss|sign|blue-fascia|cresting/.test(name)) return material;
    if (/ridge-(?:cap|coping|beam|flash)|verandah-ridge/.test(name)) return roofMaterial ?? material;
    const edge = /gutter|downpipe/.test(name) ? 'gutter'
      : /fascia|barge|rake-eaves|eaves-shadow|eave-band|soffit|awning-underside|verandah-underside/.test(name) ? 'fascia'
        : /parapet.*(?:cap|coping|shadow-line)|coping.*parapet/.test(name) ? 'coping' : null;
    if (!edge) return material;
    const spec = KIT_ROOF_EDGE_PALETTE[edge];
    const result = this.get(spec.family, { variant: `p23-roof-edge-${edge}`,
      color: spec.color, roughness: spec.roughness, metalness: spec.metalness });
    result.userData.kitRoofEdge = edge;
    return result;
  }

  /** Final material-only pass over a kit; geometry topology and transforms are untouched. */
  finishKitMaterials(model, wallRoofPalette = null) {
    scheduleKitAO(model, this.quality);
    // Live leaves replace triangles from these buckets and need identical material
    // substitution. AO remains scheduled only on the fixed model topology above.
    const parts = model.openingSourceGeometries?.length
      ? [...model.parts, ...model.openings.flatMap(opening => opening.parts)] : model.parts;
    for (const part of parts) {
      const finish = (material) => {
        const transitCanopy = model.kit === true && model.archetypeId === 'transport-interchange'
          && material?.userData?.variant === 'kit-transit-canopy-glass-r22'
          && material.userData.transitCanopyThinGlass === true;
        if (material?.userData?.family === 'glass' && !transitCanopy
          && !(material.userData.variant === 'courtyard-recess-glass-r4'
            && material.userData.courtyardRecessGlass === true)) {
          material = model.archetypeId === 'apartment-modern-bar'
            ? this.get('glass', { variant: 'p138b-bar-lit-room-glass', buildingGlass: true,
              buildingKey: 'p20-shared-kit-glass', kitGlassProfile: 'bar-lit-room-r138b' })
            : model.archetypeId === 'factory-light' && readRestyle(globalThis.location?.search ?? '').enabled
              ? this.get('glass', { variant: 'p17-factory-dark-kit-glass', buildingGlass: true,
                buildingKey: 'p20-shared-kit-glass' })
              : this.get('glass', { variant: 'p20-shared-kit-glass', buildingGlass: true });
          // Ruling 73c: keep the shared room seed, finish and program; only factory panes darken.
          if (material.userData.variant === 'p17-factory-dark-kit-glass') material.color.setRGB(.0194, .0194, .0194);
        }
        if (material?.userData?.buildingWeatherOverlay && !material.userData.kitWear) {
          material.userData.kitWear = { coverageMax: 0.25, causeRadiusMetres: 1 };
          const previous = material.onBeforeCompile;
          material.onBeforeCompile = (shader, renderer) => {
            previous.call(material, shader, renderer);
            shader.fragmentShader = shader.fragmentShader.replace(
              'if (p17WeatherStrength > 0.001) {', `
// Apply the same second tile layer to ported roofs whose authored atlas is disabled.
if (p17WeatherRole > 0.5 && p17WeatherRole < 1.5 && p17WeatherFamily > 1.5 && p17WeatherFamily < 3.5) {
  vec2 p20TileQ = vec2(vP17WorldPosition.x + vP17WorldPosition.z, vP17WorldPosition.y) / vec2(0.42,0.28);
  vec2 p20TileId = floor(p20TileQ);
  float p20TileCode = mod(p20TileId.x * 19.0 + p20TileId.y * 37.0 + p17WeatherSalt, 101.0);
  float p20Jitter = mod(p20TileCode,13.0)-6.0;
  diffuseColor.rgb = max(vec3(0.0), diffuseColor.rgb + vec3(p20Jitter / 255.0 * 0.5));
  float p20Lift = (1.0-step(5.0,p20TileCode)) * (1.0-smoothstep(0.0,0.18,fract(p20TileQ.y)));
  float p20Crack = step(95.0,p20TileCode) * (1.0-smoothstep(0.015,0.035,abs(fract(p20TileQ.x)-0.28-fract(p20TileQ.y)*0.22)));
  diffuseColor.rgb *= 1.0 - p20Lift*0.09 - p20Crack*0.18;
}
vec3 p20CleanAlbedo = diffuseColor.rgb;
float p20CleanRoughness = roughnessFactor;
if (p17WeatherStrength > 0.001) {`);
            // Insert at the end of the inherited weather block, before the next lighting chunk.
            const end = '  }\n  }\n}';
            shader.fragmentShader = shader.fragmentShader.replace(end, `  }
  }
// Three texel-wide lanes out of sixteen: 18.75% UV support, with measured area headroom. Offset excludes constant UV=0 backers.
float p20WearMask = 1.0 - step(3.0, mod(floor(fract(vP17WeatherUv.x * 0.99999) * 256.0) + 9.0, 16.0));
float p20Cause = 1.0 - step(0.999, vKitCause);
// Moss follows the geometric roof edge/gutter cause band, never an atlas-repeat seam.
if (p17WeatherRole > 0.5 && p17WeatherRole < 1.5 && p17WeatherFamily > 1.5 && p17WeatherFamily < 3.5) {
  float p20Moss = (1.0-smoothstep(0.12,0.55,vKitCause)) * p20WearMask;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.66,0.78,0.49), p20Moss*0.55);
}
diffuseColor.rgb = mix(p20CleanAlbedo, diffuseColor.rgb, p20WearMask * p20Cause);
roughnessFactor = mix(p20CleanRoughness, min(1.0, roughnessFactor + 0.12), p20WearMask * p20Cause);
// Membrane courses are construction texture, not dirt coverage: retain them
// across the deck after the bounded edge-wear mask has done its own job.
if (p17WeatherRole > 0.5 && p17WeatherRole < 1.5) {
  vec3 r7Normal = normalize(normal * mat3(viewMatrix));
  vec2 r7Roof = vP17WorldPosition.xz - vP17BuildingOrigin;
  float r7Flat = smoothstep(0.94, 0.995, abs(r7Normal.y));
  vec2 r7Panel = r7Roof / vec2(1.4, 3.6);
  vec2 r7Joint = min(fract(r7Panel), 1.0 - fract(r7Panel));
  float r7Seam = 1.0 - smoothstep(0.015, 0.055, min(r7Joint.x, r7Joint.y));
  float r7Tone = mod(floor(r7Panel.x) * 19.0 + floor(r7Panel.y) * 7.0 + p17WeatherSalt, 9.0) / 8.0;
  float r7Gravel = (1.0 - smoothstep(0.15, 0.55, vKitCause))
    * (0.5 + 0.5 * sin(r7Roof.x * 19.0) * sin(r7Roof.y * 23.0));
  diffuseColor.rgb *= mix(1.0, 0.84 + r7Tone * 0.20 - r7Seam * 0.24 + r7Gravel * 0.12, r7Flat);
  roughnessFactor = max(roughnessFactor, 0.86);
}
}`);
          };
        }
        const tileFamily = material?.userData?.family;
        const tileRole = material?.userData?.buildingWeatherOverlay?.role;
        if (tileRole === 'roof' && ['tile', 'corrugated', 'painted_metal', 'concrete', 'render'].includes(tileFamily)) {
          applyPaintedTile(material, tileFamily === 'tile' ? 'tile'
            : ['corrugated', 'painted_metal'].includes(tileFamily) ? 'corrugated' : 'membrane');
        } else if (tileRole !== 'roof' && ['brick', 'render', 'weatherboard'].includes(tileFamily)
          && !/(lawn|grass|landscape|foliage)/.test(material.userData.variant ?? '')) {
          applyPaintedTile(material, tileFamily);
        }
        const finished = applyKitAO(finishKitFacadeValue(finishKitRoofEdge(
          finishKitWallRoofAlbedo(finishKitDarkTrim(finishCitySurface(
            material, { atlasRamp: true },
          )), wallRoofPalette))));
        if (isBeauxSurfaceMaterial(finished)) {
          return applyBeauxSurfaceFinish(finished, {
            quality: this.quality,
            plaster: this.beauxPlaster(),
          });
        }
        if (isModerneSurfaceMaterial(finished)) {
          authorMissingModerneAttributes(part.geometry, finished);
          return applyModerneSurfaceFinish(finished, {
            quality: this.quality,
            plaster: this.beauxPlaster(),
          });
        }
        return applyDecoSurfaceFinish(finished, { quality: this.quality });
      };
      part.material = Array.isArray(part.material) ? part.material.map(finish) : finish(part.material);
    }
    return model;
  }

  /** Finish an already-authored building bucket after specialist atlas shaders have landed. */
  finishBuildingMaterial(material, {
    descriptor = '',
    role = null,
    seedKey = '',
  } = {}) {
    if (!material) return material;
    const family = material.userData?.family;
    const variant = material.userData?.variant ?? '';
    if (family === 'glass') {
      return applyBuildingGlassFinish(material, seedKey || variant || descriptor);
    }
    const resolvedRole = role ?? buildingWeatherRoleFor(family, `${variant} ${descriptor}`);
    const familyFloor = P17_BUILDING_ROUGHNESS_FLOOR[family];
    if (familyFloor != null) {
      const roleFloor = resolvedRole === 'roof'
        ? Math.max(P17_ROOF_MATERIAL_LIMITS.roughness, familyFloor)
        : familyFloor;
      material.roughness = Math.max(roleFloor, material.roughness ?? roleFloor);
      if (family === 'corrugated') {
        material.anisotropy = Math.max(0.46, material.anisotropy ?? 0);
        material.anisotropyRotation = Math.PI / 2;
        material.specularIntensity = Math.min(
          P17_ROOF_MATERIAL_LIMITS.specularIntensity,
          material.specularIntensity ?? P17_ROOF_MATERIAL_LIMITS.specularIntensity,
        );
      }
      if (resolvedRole === 'roof') {
        material.metalness = P17_ROOF_MATERIAL_LIMITS.metalness;
        material.envMapIntensity = Math.min(
          P17_ROOF_MATERIAL_LIMITS.envMapIntensity,
          material.envMapIntensity ?? P17_ROOF_MATERIAL_LIMITS.envMapIntensity,
        );
        material.userData.envIntensityBase = Math.min(
          P17_ROOF_MATERIAL_LIMITS.envMapIntensity,
          material.userData.envIntensityBase ?? P17_ROOF_MATERIAL_LIMITS.envMapIntensity,
        );
        material.specularIntensity = Math.min(
          P17_ROOF_MATERIAL_LIMITS.specularIntensity,
          material.specularIntensity ?? P17_ROOF_MATERIAL_LIMITS.specularIntensity,
        );
        if ('clearcoat' in material) material.clearcoat = P17_ROOF_MATERIAL_LIMITS.clearcoat;
        material.userData.p17RoofMaterial = { ...P17_ROOF_MATERIAL_LIMITS };
      }
      material.userData.buildingSurfaceFinish = {
        family,
        role: resolvedRole,
        roughnessFloor: roleFloor,
        normalMapped: Boolean(material.normalMap),
        roughnessMapped: Boolean(material.roughnessMap),
      };
    }
    if (!resolvedRole) return material;
    return applyBuildingWeatherOverlay(material, this.textures.getBuildingWeatherAtlas(), {
      role: resolvedRole,
      seedKey: seedKey || variant || descriptor,
    });
  }

  /** Ensure aoMap has a second UV set (three samples ao on uv2). Shares the uv buffer. */
  static ensureUv2(geometry) {
    if (!geometry?.attributes?.uv) return geometry;
    if (!geometry.attributes.uv2) {
      geometry.setAttribute('uv2', geometry.attributes.uv);
    }
    return geometry;
  }

  /**
   * Map an authored kit material name (e.g. "V300 glass") onto a library family.
   * Prefer this over pure geometry heuristics so cafe glass stays glass and green
   * wainscot does not become brick.
   */
  static familyFromAuthoredName(materialName) {
    const n = String(materialName ?? '').toLowerCase();
    if (!n) return null;
    if (n.includes('glass')) return 'glass';
    if (n.includes('brick')) return 'brick';
    if (n.includes('render')) return 'render';
    if (n.includes('timber')) return 'timber';
    if (n.includes('roof-iron') || n.includes('roof iron')) return 'corrugated';
    if (n.includes('awning')) return 'painted_metal';
    if (n.includes('tile-green') || n.includes('tile green')) return 'tile-green';
    if (n.includes('bluestone')) return 'limestone';
    return null;
  }

  /** Remap a registry model to shared library materials by archetype (and optional district). */
  rematerializeModel(model, archetypeId, districtId = null) {
    if (!model?.parts?.length) return model;
    const surfaces = surfacesForArchetype(archetypeId, districtId);
    const partCount = model.parts.length;
    return {
      ...model,
      parts: model.parts.map((part, index) => {
        const role = classifyPartRole(part, index, partCount);
        const authored = MaterialLibrary.familyFromAuthoredName(part.material?.name);
        // Authored glass / timber / green tile win over role heuristics.
        let family = authored
          ?? surfaces[role]
          ?? (role === 'glass' ? 'glass' : null)
          ?? (role === 'roof' ? 'corrugated' : null)
          ?? surfaces.wall
          ?? 'render';
        // Green apron tile: not a stock family — dark green physical with tile roughness.
        let material;
        if (family === 'tile-green') {
          material = this.get('asphalt', {
            variant: 'cafe-tile-green',
            color: '#0f3a2a',
            roughness: 0.48,
            metalness: 0.02,
          });
        } else if (family === 'painted_metal' && /awning/i.test(part.material?.name ?? '')) {
          material = this.get('painted_metal', {
            variant: 'cafe-awning-dark',
            color: '#0c0d0e',
            roughness: 0.40,
            metalness: 0.45,
          });
        } else {
          material = this.get(family);
        }
        material = this.finishBuildingMaterial(material, {
          descriptor: `${part.material?.name ?? ''} ${part.geometry?.name ?? ''} ${role}`,
          role: role === 'roof' ? 'roof' : null,
          seedKey: `${archetypeId}|${districtId ?? 'none'}|${role}`,
        });
        MaterialLibrary.ensureUv2(part.geometry);
        return { geometry: part.geometry, material };
      }),
    };
  }

  /** List of all live materials (for LightingRig env assignment after late creates). */
  materials() {
    return [...this._cache.values()];
  }

  textureBytes() {
    let bytes = this.textures.textureBytes();
    for (const pack of this._texturePacks.values()) bytes += pack.textureBytes();
    return bytes;
  }

  dispose() {
    if (this._disposed) return;
    for (const material of this._cache.values()) {
      // Maps are owned by TextureLibrary — do not dispose them here.
      material.map = null;
      material.roughnessMap = null;
      material.normalMap = null;
      material.aoMap = null;
      material.envMap = null;
      material.dispose();
    }
    this._cache.clear();
    for (const pack of this._texturePacks.values()) pack.dispose?.();
    this._texturePacks.clear();
    this._r72Plaster = null;
    this.textures.dispose();
    this.userData = Object.create(null);
    this._disposed = true;
  }
}

/** True when a material is owned by MaterialLibrary and must not be disposed by board meshes. */
export function isSharedLibraryMaterial(material) {
  return Boolean(material?.userData?.sharedLibrary);
}
