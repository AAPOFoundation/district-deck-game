import * as THREE from 'three';
import { TASTE } from './taste-tokens.js';

// One reserve-sized field: samples cross tile boundaries instead of repeating a
// paving image on each square. Original deterministic value noise, in metres.
function hash(x, z, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let u = x - ix, v = z - iz;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash(ix, iz, seed), hash(ix + 1, iz, seed), u),
    THREE.MathUtils.lerp(hash(ix, iz + 1, seed), hash(ix + 1, iz + 1, seed), u), v);
}

const hexRgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
/** sRGB texel level of the lush lawn; the material colour carries the grass.lush token. */
const LAWN_TEXEL = 0.56;
/** Dry/lush token ratio as texel multipliers, softened to 70% so the dry patches stay a drift. */
const LAWN_DRY_TEXEL = hexRgb(TASTE.ground.grassDry).map((c, i) => Math.pow(c / hexRgb(TASTE.ground.grassLush)[i], 0.7));

export function reserveGroundRegions(x, z, seed = 0) {
  // Rotated, domain-warped coordinates break the rectangular value-noise grid.
  const wx = x + (noise(x / 10, z / 10, seed + 113) - .5) * 5.6;
  const wz = z + (noise(x / 11, z / 11, seed + 227) - .5) * 5.6;
  const broad = noise((wx * .83 + wz * .56) / 5.8, (wz * .83 - wx * .56) / 5.8, seed);
  const growth = THREE.MathUtils.smoothstep(broad, .24, .76);
  const clumps = noise(wx / 1.8, wz / 1.8, seed + 71);
  const dry = THREE.MathUtils.smoothstep(noise(wx / 3.7, wz / 3.7, seed + 311), .42, .78);
  // Sub-metre, uneven grass tufts. Rotated elongated noise provides a body of
  // blades/clumps without pixel-white speckles or geometry at every grass site.
  const tufts = noise((wx * .94 + wz * .34) / .48, (wz * .94 - wx * .34) / .86, seed + 617);
  const grain = noise(x / .24, z / .31, seed + 719);
  return { growth, clumps, dry, tufts, grain };
}

/**
 * W4-B lawn blend, in metres: two domain-warped octaves (3 m and 1.5 m) carry the lush-to-dry
 * blend over roughly 28% of the area; a 0.7 m / 0.3 m fine octave keeps any 2 m patch from
 * reading flat. Same constants as the city lawn shader in materials.js.
 */
export function reserveLawnBlend(x, z, seed = 0) {
  const wx = x + (noise(x / 7 + 3.1, z / 7 + 9.7, seed + 401) - .5) * 3.2;
  const wz = z + (noise(x / 7 + 21.4, z / 7 + 5.3, seed + 433) - .5) * 3.2;
  const broad = noise(wx / 3, wz / 3, seed + 907) * .65 + noise(wx / 1.5 + 37.1, wz / 1.5 + 11.9, seed + 953) * .35;
  const dry = THREE.MathUtils.smoothstep(broad, .53, .67);
  const fine = noise(x / .7 + 5.5, z / .7 + 1.7, seed + 977) * .6 + noise(x / .3 + 13, z / .3 + 29, seed + 991) * .4;
  return { dry, broad, fine };
}

export function reserveGroundValue(x, z, seed = 0, contacts = []) {
  const { growth, clumps, tufts, grain } = reserveGroundRegions(x, z, seed);
  let contact = 0;
  for (const site of contacts) {
    let d, inner, outer;
    if (site.hx != null && site.hz != null) {
      const c = Math.cos(site.yaw ?? 0), s = Math.sin(site.yaw ?? 0);
      const dx = x - site.x, dz = z - site.z;
      // Signed distance to the actual support/pad, not its clearance disc.
      const ax = Math.abs(dx * c - dz * s) - site.hx;
      const az = Math.abs(dx * s + dz * c) - site.hz;
      d = Math.hypot(Math.max(ax, 0), Math.max(az, 0)) + Math.min(Math.max(ax, az), 0);
      inner = -.12; outer = .34;
    } else {
      const radius = site.what === 'tree' ? .55 : Math.min(site.r, .65);
      d = Math.hypot(x - site.x, z - site.z);
      inner = radius * .45; outer = radius + .4;
    }
    const brokenEdge = .65 + .35 * noise(x / .9, z / .9, seed + 509);
    contact = Math.max(contact, (1 - THREE.MathUtils.smoothstep(d, inner, outer)) * brokenEdge);
  }
  return (.51 + growth * .14 + clumps * .08 + tufts * .17 + grain * .10) * (1 - contact * .3);
}

// Local front-of-seat foot traffic and the OUTSIDE of an unbroken play kerb.
// Distances use final placed world coordinates; no invented gate or broad field.
export function reserveWearMask(x, z, sites = []) {
  let wear = 0;
  for (const site of sites) {
    const yaw = site.yaw ?? 0, c = Math.cos(yaw), s = Math.sin(yaw);
    const dx = x - site.x, dz = z - site.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (site.kind === 'bench-front') {
      const lateral = 1 - THREE.MathUtils.smoothstep(Math.abs(lx), .52, .86);
      const front = THREE.MathUtils.smoothstep(lz, .34, .50)
        * (1 - THREE.MathUtils.smoothstep(lz, .82, 1.18));
      wear = Math.max(wear, lateral * front);
    } else if (site.kind === 'desire-line') {
      // W4-B: a faint worn strip along a lawn shortcut, broken into patches so it is not a ribbon.
      const sx = site.x1 - site.x0, sz = site.z1 - site.z0;
      const t = THREE.MathUtils.clamp(((x - site.x0) * sx + (z - site.z0) * sz) / (sx * sx + sz * sz), 0, 1);
      const d = Math.hypot(x - (site.x0 + sx * t), z - (site.z0 + sz * t));
      const ends = Math.min(THREE.MathUtils.smoothstep(t, 0, .12), 1 - THREE.MathUtils.smoothstep(t, .88, 1));
      const patchy = .45 + .55 * noise(x / 1.3 + 7.1, z / 1.3 + 2.9, 811);
      wear = Math.max(wear, .5 * (1 - THREE.MathUtils.smoothstep(d, site.hw * .35, site.hw)) * ends * patchy);
    } else if (site.kind === 'play-perimeter') {
      const ax = Math.abs(lx) - site.hx, az = Math.abs(lz) - site.hz;
      const distance = Math.hypot(Math.max(ax, 0), Math.max(az, 0)) + Math.min(Math.max(ax, az), 0);
      // Zero inside the pad: its authored surface and equipment remain unchanged.
      if (distance >= 0) wear = Math.max(wear, .55 * (1 - THREE.MathUtils.smoothstep(distance, .04, .46)));
    }
  }
  return wear;
}

export function createReserveGroundTexture({ centre, extent = 47.4, seed = 0, contacts = [], wearSites = [], size = 256, presentation = 'accepted' }) {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = centre.x + ((i + .5) / size - .5) * extent;
    const z = centre.z + ((j + .5) / size - .5) * extent;
    const k = (j * size + i) * 4;
    data[k + 3] = 255 - Math.round(255 * reserveWearMask(x, z, wearSites));
    if (presentation === 'graded-lawn') {
      // W4-B: the material colour is grass.lush; the texel is lush at LAWN_TEXEL and slides
      // toward grass.dry over the blend (token ratio, softened) with a faint value tone.
      const { dry: dryT, broad, fine } = reserveLawnBlend(x, z, seed);
      const tone = 1 + (fine - .5) * .22 + (broad - .5) * .10;
      const base = LAWN_TEXEL * tone * 255;
      const t = dryT * .85;
      data[k] = Math.min(255, Math.round(base * (1 + (LAWN_DRY_TEXEL[0] - 1) * t)));
      data[k + 1] = Math.min(255, Math.round(base * (1 + (LAWN_DRY_TEXEL[1] - 1) * t)));
      data[k + 2] = Math.min(255, Math.round(base * (1 + (LAWN_DRY_TEXEL[2] - 1) * t)));
      continue;
    }
    const { dry } = reserveGroundRegions(x, z, seed);
    const value = 255 * reserveGroundValue(x, z, seed, contacts);
    data[k] = Math.round(value * (.9 + dry * .1));
    data[k + 1] = Math.round(value);
    data[k + 2] = Math.round(value * (.92 - dry * .16));
  }
  const map = new THREE.DataTexture(data, size, size);
  map.name = presentation === 'graded-lawn' ? 'v4-reserve-graded-lawn-r131' : 'v4-reserve-organic-ground';
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return map;
}

export function applyReserveGroundField(material, options) {
  const old = material.userData.reserveGroundField;
  if (old) { old.map.dispose(); material.removeEventListener('dispose', old.dispose); }
  const map = createReserveGroundTexture(options);
  // Cached shader programs keep these wrappers after the first compile. Mutate
  // them on reconfiguration rather than waiting for onBeforeCompile to rerun.
  const uniforms = old?.uniforms ?? {
    origin: { value: new THREE.Vector2() }, extent: { value: 47.4 }, wearMap: { value: null },
  };
  uniforms.wearMap.value = map;
  uniforms.origin.value.set(options.centre.x, options.centre.z);
  uniforms.extent.value = options.extent ?? 47.4;
  const dispose = () => map.dispose();
  material.addEventListener('dispose', dispose);
  // The material library owns the material; this hook owns only this procedural
  // map. Mineral maps remain library-owned and are never disposed here.
  material.map = map;
  if (options.presentation === 'graded-lawn') material.color.set(TASTE.ground.grassLush);
  material.normalMap = material.roughnessMap = material.aoMap = null;
  material.roughness = .98;
  material.specularIntensity = .08;
  if (!old) {
    const upstream = material.onBeforeCompile, key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      upstream.call(material, shader, renderer);
      const field = material.userData.reserveGroundField;
      shader.uniforms.v4ReserveOrigin = field.uniforms.origin;
      shader.uniforms.v4ReserveExtent = field.uniforms.extent;
      shader.vertexShader = shader.vertexShader.replace('#include <common>',
        '#include <common>\nuniform vec2 v4ReserveOrigin;\nuniform float v4ReserveExtent;');
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_MAP
vec4 v4ReservePoint = vec4(position, 1.0);
#ifdef USE_INSTANCING
v4ReservePoint = instanceMatrix * v4ReservePoint;
#endif
vMapUv = ((modelMatrix * v4ReservePoint).xz - v4ReserveOrigin) / v4ReserveExtent + 0.5;
#endif`);
    };
    material.customProgramCacheKey = () => `${key}|v4-reserve-ground-v1`;
  }
  material.userData.reserveGroundField = { map, uniforms, dispose, bytes: map.image.data.byteLength };
  if (options.wearSites?.length) applyReserveWearMaterial(material, material, 'turf');
  material.needsUpdate = true;
  return material;
}


// Borrow the existing field texture; only its turf owner disposes it. Hoggin's
// original map/normal/roughness UVs remain untouched by this separate varying.
export function applyReserveWearMaterial(material, owner, kind = 'path') {
  if (material.transparent || material.alphaTest || material.alphaHash || material.alphaToCoverage) {
    throw new Error('Reserve wear requires an opaque, non-alpha-tested material');
  }
  const field = owner.userData.reserveGroundField;
  if (!field) throw new Error('Reserve wear requires an existing field owner');
  const old = material.userData.reserveWear;
  if (old && old.uniforms !== field.uniforms) {
    throw new Error('Reserve wear cannot change field owner after binding');
  }
  material.userData.reserveWear = { uniforms: field.uniforms, kind };
  if (!old) {
    const upstream = material.onBeforeCompile, key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      upstream.call(material, shader, renderer);
      const wear = material.userData.reserveWear;
      shader.uniforms.v4WearMap = wear.uniforms.wearMap;
      shader.uniforms.v4WearOrigin = wear.uniforms.origin;
      shader.uniforms.v4WearExtent = wear.uniforms.extent;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
uniform vec2 v4WearOrigin;
uniform float v4WearExtent;
varying vec2 v4WearUv;`);
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
vec4 v4WearPoint = vec4(position, 1.0);
#ifdef USE_INSTANCING
v4WearPoint = instanceMatrix * v4WearPoint;
#endif
v4WearUv = ((modelMatrix * v4WearPoint).xz - v4WearOrigin) / v4WearExtent + 0.5;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D v4WearMap;
varying vec2 v4WearUv;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
float v4WearInside = step(0.0, v4WearUv.x) * step(v4WearUv.x, 1.0) * step(0.0, v4WearUv.y) * step(v4WearUv.y, 1.0);
float v4Wear = (1.0 - texture2D(v4WearMap, v4WearUv).a) * v4WearInside;
${wear.kind === 'turf'
  ? 'vec3 v4Worn = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722)) * vec3(1.05, .86, .63);\ndiffuseColor.rgb = mix(diffuseColor.rgb, v4Worn, v4Wear * .55);\ndiffuseColor.a = opacity;'
  : 'diffuseColor.rgb *= mix(vec3(1.0), vec3(.82, .79, .74), v4Wear * .45);'}`);
    };
    material.customProgramCacheKey = () => `${key}|v4-reserve-wear-v1:${material.userData.reserveWear.kind}`;
  }
  material.needsUpdate = true;
  return material;
}
