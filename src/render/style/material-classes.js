import * as THREE from 'three';
import document from './liveries.json' with { type: 'json' };
import { hexToHsv, TASTE_CAPS } from '../taste-tokens.js';

export function freezeTree(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeTree);
    Object.freeze(value);
  }
  return value;
}

// Frozen B2 targets under ruling 60. Ruling 53 keeps the vehicle pilots unchanged.
// Baselines use the largest row-B sample per class in P14-1 anchor-clusters.txt;
// they describe current albedo, never the target, and never pool different anchors.
// The vehicle V cap applies to identity/safety paint, never dark glazing or rubber.
// Physical paint/glass and standard trim already occur in traffic.js; no custom shaders.
export const MATERIAL_CLASSES = freezeTree({
  'identity-paint': { v: [...TASTE_CAPS.vehicle.v], s: [35, 75], roughness: 0.55, metalness: 0.08, type: 'MeshPhysicalMaterial',
    frozen: true, source: 'B2 vehicle pilots, ruling 53', tolerance: 4,
  },
  safety: { v: [...TASTE_CAPS.vehicle.v], s: [55, 85], roughness: 0.65, metalness: 0, type: 'MeshPhysicalMaterial',
    frozen: true, source: 'B2 vehicle pilots, ruling 53', tolerance: 4,
  },
  'painted-steel': { v: [66, 82], s: [3, 10], roughness: 0.58, metalness: 0.10, type: 'MeshStandardMaterial',
    frozen: true, source: 'B2 vehicle pilots, ruling 53', tolerance: 4,
    baseline: { anchor: 'building:cottage-federation', row: 'B', albedo: { V: 41.2, S: 30.8 }, outside: { V: 24.8, S: 20.8 } },
  },
  'dark-glass': { v: [10, 20], s: [10, 35], roughness: 0.15, metalness: 0, type: 'MeshPhysicalMaterial',
    frozen: true, source: 'B2 vehicle pilots, ruling 53', tolerance: 4,
    baseline: { anchor: 'building:cottage-federation', row: 'B', albedo: { V: 13.9, S: 5.0 }, outside: { V: 0, S: 5.0 } },
  },
  'rubber-trim': { v: [10, 16], s: [0, 8], roughness: 0.85, metalness: 0, type: 'MeshStandardMaterial',
    frozen: true, source: 'B2 vehicle pilots, ruling 53', tolerance: 4,
  },
  'brick': { v: [40, 58], s: [35, 55], roughness: 0.88, metalness: 0, type: 'MeshStandardMaterial',
    frozen: true, source: 'B2 proposal, ruling 60', tolerance: 4,
    baseline: { anchor: 'building:warehouse-brick', row: 'B', albedo: { V: 52.3, S: 67.5 }, outside: { V: 0, S: 12.5 } },
  },
  'render-light-paint': { v: [72, 82], s: [6, 12], roughness: 0.88, metalness: 0, type: 'MeshStandardMaterial',
    frozen: true, source: 'B2 proposal, ruling 60', tolerance: 4,
    baseline: { anchor: 'building:cottage-federation', row: 'B', albedo: { V: 12.1, S: 11.7 }, outside: { V: 59.9, S: 0 } },
  },
  'weatherboard': { v: [76, 84], s: [4, 10], roughness: 0.84, metalness: 0, type: 'MeshStandardMaterial',
    frozen: true, source: 'B2 proposal, ruling 60', tolerance: 4,
    baseline: { anchor: 'building:cottage-federation', row: 'B', albedo: { V: 52.2, S: 21.3 }, outside: { V: 23.8, S: 11.3 } },
  },
  'corrugated-iron': { v: [52, 60], s: [4, 10], roughness: 0.72, metalness: 0.05, type: 'MeshStandardMaterial',
    frozen: true, source: 'B2 proposal, ruling 60', tolerance: 4,
    baseline: { anchor: 'building:cottage-federation', row: 'B', albedo: { V: 30.7, S: 9.8 }, outside: { V: 21.3, S: 0 } },
  },
  'pre-painted-steel': { v: null, s: [4, 30], roughness: 0.60, metalness: 0.05, type: 'MeshStandardMaterial',
    frozen: true, source: 'B2 proposal, ruling 60', tolerance: 4,
    // V is defined by the named register swatch, not a universal band.
  },
  'terracotta-tile': { v: null, s: null, roughness: 0.85, metalness: 0, type: 'MeshStandardMaterial',
    frozen: true, source: 'B2 proposal, ruling 60', tolerance: 4,
    pending: 'P15 anchor',
  },
  'slate': { v: null, s: null, roughness: 0.82, metalness: 0, type: 'MeshStandardMaterial',
    frozen: true, source: 'B2 proposal, ruling 60', tolerance: 4,
    pending: 'P15 anchor',
  },
  'concrete': { v: [62, 70], s: [5, 10], roughness: 0.92, metalness: 0, type: 'MeshStandardMaterial',
    frozen: true, source: 'B2 proposal, ruling 60', tolerance: 4,
    baseline: { anchor: 'building:warehouse-brick', row: 'B', albedo: { V: 17.9, S: 6.7 }, outside: { V: 44.1, S: 0 } },
  },
  'asphalt': { v: [28, 32], s: [2, 6], roughness: 0.92, metalness: 0, type: 'MeshStandardMaterial',
    frozen: true, source: 'B2 proposal, ruling 60', tolerance: 4,
  },
  'stone': { v: [60, 70], s: [15, 28], roughness: 0.88, metalness: 0, type: 'MeshStandardMaterial',
    frozen: true, source: 'B2 proposal, ruling 60', tolerance: 4,
    baseline: { anchor: 'building:warehouse-brick', row: 'B', albedo: { V: 53.0, S: 33.0 }, outside: { V: 7.0, S: 5.0 } },
  },
  'raw-timber': { v: [50, 58], s: [40, 52], roughness: 0.80, metalness: 0, type: 'MeshStandardMaterial',
    frozen: true, source: 'B2 proposal, ruling 60', tolerance: 4,
    baseline: { anchor: 'building:cottage-federation', row: 'B', albedo: { V: 19.8, S: 58.6 }, outside: { V: 30.2, S: 6.6 } },
  },
});

// Ruling 69. Kept off MATERIAL_CLASSES so the frozen sixteen keys and bands stay put.
// s null means no saturation gate. legacy-ao is not a painted-metal band.
export const PAINTED_METAL_ROLES = freezeTree({
  'metal-roof-sheet': { v: [20, 82], s: [0, 12], provisional: true, source: 'ruling 69' },
  'metal-joinery': { v: [15, 40], s: null, provisional: true, source: 'ruling 69' },
  'metal-railing': { v: [12, 30], s: null, provisional: true, source: 'ruling 69' },
  'metal-trim': { v: [60, 82], s: [0, 12], provisional: true, source: 'ruling 69' },
  'metal-fallback': { v: [12, 85], s: null, provisional: true, source: 'ruling 69' },
  'legacy-ao': { v: null, s: null, provisional: true, source: 'ruling 69', statistics: false },
});
export const METAL_ROLE_ORDER = Object.freeze(['metal-roof-sheet', 'metal-joinery', 'metal-railing', 'metal-trim', 'metal-fallback']);
const register = freezeTree(structuredClone(document.register));
const cache = new Map();
const sourceCaches = new WeakMap();

function classRow(className) {
  if (!Object.hasOwn(MATERIAL_CLASSES, className)) throw new Error(`Unknown material class: ${className}`);
  return MATERIAL_CLASSES[className];
}

/** Validate authored sRGB albedo, before three.js converts it to linear colour. */
export function validateSwatch(className, colour) {
  const row = classRow(className);
  if (typeof colour !== 'string' || !/^#[\da-f]{6}$/i.test(colour)) throw new Error(`Invalid swatch: ${colour}`);
  if (row.pending) throw new Error(`Material class ${className} pending: ${row.pending}`);
  const hsv = hexToHsv(colour);
  for (const key of ['v', 's']) {
    if (row[key] && (hsv[key] < row[key][0] || hsv[key] > row[key][1])) throw new Error(`Swatch outside ${className} ${key.toUpperCase()} band: ${colour}`);
  }
  return colour;
}

/** Register names only; painted steel is reserved for registered neutral livery components. */
export function resolveColour(name, source = register) {
  if (!source || !Object.hasOwn(source, name)) throw new Error(`Unknown register colour: ${name}`);
  const swatch = source[name];
  if (!swatch || typeof swatch !== 'object') throw new Error(`Invalid register colour: ${name}`);
  validateSwatch(swatch.className, swatch.colour);
  if (swatch.className === 'painted-steel' && swatch.usage !== 'neutral-livery-component') {
    throw new Error(`Painted steel must be a neutral livery component: ${name}`);
  }
  return swatch;
}

/** One shared material per (class, register name); shared:false returns one caller-owned material. */
export function classMaterial(className, swatchName, { source, shared = true } = {}) {
  const row = classRow(className);
  const swatch = resolveColour(swatchName);
  validateSwatch(className, swatch.colour);
  if (swatch.className !== className) throw new Error(`Register colour ${swatchName} belongs to class ${swatch.className}`);
  const key = JSON.stringify([className, swatchName]);
  // Pilots may retain an existing shader family. Only albedo changes: clearcoat,
  // maps, transparency and both shader callbacks remain the source's contract.
  if (source) {
    if (!source.isMaterial || !source.color) throw new TypeError('Material source requires albedo');
    if (shared && !sourceCaches.has(source)) sourceCaches.set(source, new Map());
    const variants = sourceCaches.get(source);
    if (!shared || !variants.has(key)) {
      const material = source.clone();
      // Standard/Physical copy() resets defines to its built-in defaults.
      // Retain any source feature defines alongside its shader callbacks.
      if (source.defines) material.defines = { ...source.defines };
      material.onBeforeCompile = source.onBeforeCompile;
      material.customProgramCacheKey = source.customProgramCacheKey;
      material.color.set(swatch.colour);
      if (!shared) return material;
      variants.set(key, material);
    }
    return variants.get(key);
  }
  if (!shared || !cache.has(key)) {
    // Constructor selection belongs to the frozen class table, not to vehicle callers.
    const material = new THREE[row.type]({ color: swatch.colour, roughness: row.roughness, metalness: row.metalness });
    material.name = `${className}:${swatchName}`;
    if (!shared) return material;
    cache.set(key, material);
  }
  return cache.get(key);
}
