import * as THREE from 'three';
import document from './liveries.json' with { type: 'json' };
import { freezeTree, resolveColour } from './material-classes.js';

// This order is the shared regionId contract: 0 none, 1 side, 2 roof, 3 front, 4 rear.
export const REGIONS = Object.freeze(['side', 'roof', 'front', 'rear']);
const FAMILIES = Object.freeze(['tram', 'bus', 'car', 'cab']);
const PATTERNS = Object.freeze(['band', 'check', 'chevron', 'stripe']);
const TEXELS_PER_METRE = 96;
const GUTTER = 1;
const MAX_ATLAS_EDGE = 4096;
const positive = value => Number.isFinite(value) && value > 0;
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const hasRegions = value => record(value) && Object.keys(value).length === REGIONS.length && REGIONS.every(r => Object.hasOwn(value, r));

/** Read once at import; unknown tokens do not enable a family. */
export function parseLiverySwitches(search, defaults = document.defaults) {
  const value = new URLSearchParams(search || '').get('livery');
  const names = new Set(value === null ? defaults : value.split(',').map(name => name.trim()));
  return Object.freeze(Object.fromEntries(FAMILIES.map(name => [name, !names.has('none') && (names.has('all') || names.has(name))])));
}

/**
 * Schema v1: {schemaVersion:1, units:'metres', defaults:[], register, specs:{name:spec}}.
 * A spec has fixtureOnly, sizeMetres:{region:[width,height]}, regions:{region:[band]}.
 * Bands partition [0,height]: {fromMetres,toMetres,colour,pattern}; patterned bands also
 * need background (a register name) and repeatMetres (one check/stripe width).
 * u runs along a face; v rises from the sill, or runs inward from the roof edge.
 * Parse/validate only: no texture, canvas, material or GPU work happens at import.
 */
export function parseLiverySpecs(input) {
  const doc = typeof input === 'string' ? JSON.parse(input) : structuredClone(input);
  if (!record(doc) || doc.schemaVersion !== 1 || doc.units !== 'metres' || !record(doc.register) || !record(doc.specs) || !Object.keys(doc.specs).length) {
    throw new Error('Invalid livery schema (version 1, metres, register and specs required)');
  }
  if (!Array.isArray(doc.defaults) || doc.defaults.some(name => !FAMILIES.includes(name))) {
    throw new Error('Invalid livery defaults: expected an array of known family names');
  }
  for (const name of Object.keys(doc.register)) resolveColour(name, doc.register);
  for (const [name, spec] of Object.entries(doc.specs)) {
    if (!name || !record(spec) || typeof spec.fixtureOnly !== 'boolean' || !hasRegions(spec.regions) || !hasRegions(spec.sizeMetres)) {
      throw new Error(`Invalid livery schema/regions: ${name}`);
    }
    for (const region of REGIONS) {
      const size = spec.sizeMetres[region];
      if (!Array.isArray(size) || size.length !== 2 || !size.every(positive)) throw new Error(`Invalid region size in metres: ${name}/${region}`);
      const bands = spec.regions[region];
      if (!Array.isArray(bands) || !bands.length) throw new Error(`Missing region bands: ${name}/${region}`);
      let edge = 0;
      for (const band of bands) {
        if (!record(band) || !Number.isFinite(band.fromMetres) || !Number.isFinite(band.toMetres) || band.fromMetres !== edge || band.toMetres <= edge || band.toMetres > size[1]) {
          throw new Error(`Invalid band extent in metres: ${name}/${region}`);
        }
        resolveColour(band.colour, doc.register);
        if (!PATTERNS.includes(band.pattern)) throw new Error(`Unknown livery pattern: ${band.pattern}`);
        if (band.pattern !== 'band') {
          resolveColour(band.background, doc.register);
          if (!positive(band.repeatMetres)) throw new Error(`Invalid pattern repeat in metres: ${name}/${region}`);
        }
        edge = band.toMetres;
      }
      if (edge !== size[1]) throw new Error(`Bands must fill region height in metres: ${name}/${region}`);
    }
  }
  layout(doc.specs); // Bound allocation before accepting a spec, including aggregate height.
  return freezeTree(doc.specs);
}

// Deterministic shelves with extruded gutters; rectangle units are atlas pixels.
function layout(specs) {
  const tiles = Object.entries(specs).flatMap(([name, spec]) => REGIONS.map(region => {
    const [widthMetres, heightMetres] = spec.sizeMetres[region];
    return { name, region, widthMetres, heightMetres, width: Math.ceil(widthMetres * TEXELS_PER_METRE), height: Math.ceil(heightMetres * TEXELS_PER_METRE) };
  }));
  const area = tiles.reduce((sum, t) => sum + (t.width + 2 * GUTTER) * (t.height + 2 * GUTTER), 0);
  const widest = Math.max(...tiles.map(t => t.width + 2 * GUTTER));
  if (area > MAX_ATLAS_EDGE ** 2 || widest > MAX_ATLAS_EDGE) throw new Error('Livery atlas exceeds 4096 texels per edge');
  const pack = limit => {
    const rects = new Map();
    let x = 0, y = 0, rowHeight = 0, width = 0;
    for (const { name, region, ...tile } of tiles) {
      const w = tile.width + 2 * GUTTER, h = tile.height + 2 * GUTTER;
      if (x + w > limit) { y += rowHeight; x = 0; rowHeight = 0; }
      rects.set(JSON.stringify([name, region]), Object.freeze({ x: x + GUTTER, y: y + GUTTER, ...tile }));
      x += w;
      rowHeight = Math.max(rowHeight, h);
      width = Math.max(width, x);
    }
    return { rects, width, height: y + rowHeight };
  };
  let packed = pack(Math.min(MAX_ATLAS_EDGE, Math.max(widest, Math.ceil(Math.sqrt(area)))));
  if (packed.height > MAX_ATLAS_EDGE) packed = pack(MAX_ATLAS_EDGE);
  if (packed.height > MAX_ATLAS_EDGE) throw new Error('Livery atlas exceeds 4096 texels per edge');
  return packed;
}
export const LIVERY_SPECS = parseLiverySpecs(document);
export const LIVERY_SWITCHES = parseLiverySwitches(typeof location !== 'undefined' ? location.search : '');
let atlas;

function inkAt(band, u, v) {
  if (band.pattern === 'band') return band.colour;
  const x = u / band.repeatMetres, y = (v - band.fromMetres) / band.repeatMetres;
  let cell;
  if (band.pattern === 'check') cell = Math.floor(x) + Math.floor(y);
  else if (band.pattern === 'stripe') cell = Math.floor(x + y);
  else cell = Math.floor(y - Math.abs((x % 2) - 1));
  return cell % 2 === 0 ? band.colour : band.background;
}

/**
 * One lazily allocated, cached sRGB atlas for all specs. regionRect returns a frozen
 * {x,y,width,height,widthMetres,heightMetres}; x/y use a bottom-left pixel origin.
 * No mipmaps: one-texel extrusion protects linear sampling from neighbouring regions.
 * Callers share the map and materials; lifetime/disposal belongs to the scene owner.
 */
export function liveryAtlas() {
  if (atlas) return atlas;
  const { rects, width, height } = layout(LIVERY_SPECS);
  const data = new Uint8Array(width * height * 4);
  const inks = new Map(Object.keys(document.register).map(name => [name, [
    ...resolveColour(name).colour.slice(1).match(/../g).map(byte => Number.parseInt(byte, 16)), 255,
  ]]));
  for (const [name, spec] of Object.entries(LIVERY_SPECS)) for (const region of REGIONS) {
    const r = rects.get(JSON.stringify([name, region]));
    const bands = spec.regions[region];
    for (let y = -GUTTER; y < r.height + GUTTER; y++) {
      const py = Math.max(0, Math.min(r.height - 1, y));
      const v = Math.min((py + 0.5) / TEXELS_PER_METRE, r.heightMetres);
      const band = bands.find(b => v < b.toMetres) || bands[bands.length - 1];
      for (let x = -GUTTER; x < r.width + GUTTER; x++) {
        const px = Math.max(0, Math.min(r.width - 1, x));
        const u = Math.min((px + 0.5) / TEXELS_PER_METRE, r.widthMetres);
        data.set(inks.get(inkAt(band, u, v)), ((r.y + y) * width + r.x + x) * 4);
      }
    }
  }
  const map = new THREE.DataTexture(data, width, height);
  map.colorSpace = THREE.SRGBColorSpace;
  map.minFilter = map.magFilter = THREE.LinearFilter;
  map.generateMipmaps = false;
  map.flipY = false;
  map.needsUpdate = true;
  const regionRect = (specName, region) => {
    if (!Object.hasOwn(LIVERY_SPECS, specName)) throw new Error(`Unknown livery spec: ${specName}`);
    if (!REGIONS.includes(region)) throw new Error(`Unknown livery region: ${region}`);
    return rects.get(JSON.stringify([specName, region]));
  };
  atlas = Object.freeze({ map, texelsPerMetre: TEXELS_PER_METRE, regionRect });
  return atlas;
}

/** Transform metre coordinates to normalised atlas UVs; regionId 0 has no transform. */
export function metreToAtlasUV(specName, region, uMetres, vMetres) {
  const { map, regionRect } = liveryAtlas();
  const r = regionRect(specName, region);
  if (![uMetres, vMetres].every(Number.isFinite) || uMetres < 0 || vMetres < 0 || uMetres > r.widthMetres || vMetres > r.heightMetres) {
    throw new Error(`Livery coordinates outside region metres: ${specName}/${region}`);
  }
  return [(r.x + uMetres * TEXELS_PER_METRE) / map.image.width, (r.y + vMetres * TEXELS_PER_METRE) / map.image.height];
}
