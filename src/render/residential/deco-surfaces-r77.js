// R77 — Art Deco flats only. The residential brick atlas owns final wall albedo
// and normal after applyPaintedTile's red-channel overwrite. The flat roof keeps
// its membrane sample and loses the 1.4×3.6 panel grid. No new textures.

import * as THREE from 'three';
import { readRestyle } from '../style/restyle.js';

export const R77_VERSION = 'r77-deco-surfaces-v1';
export const R77_MAP_ATTRIBUTE = 'aR77Map';
export const R77_BRICK_W = 0.230;
export const R77_BRICK_H = 0.076;
export const R77_BRICKS_ACROSS = 8;
export const R77_COURSES_DOWN = 16;
export const R77_MODULE_X = R77_BRICKS_ACROSS * R77_BRICK_W;
export const R77_MODULE_Y = R77_COURSES_DOWN * R77_BRICK_H;
export const R77_ROLL_WIDTH = 1.05;
export const R77_ROLL_LENGTH = 8;
export const R77_NORMAL_GAIN = 0.65;
export const R77_FRONT_DATUM = 'r77FrontZ';

/** Decorative joint skins. Not shells, sills, copings, or repointing. */
export const R77_RETIRED_DECORATIONS = Object.freeze([
  'brick-mortar-front',
  'brick-mortar-flank',
  'tower-mortar-grid',
  'bay-curved-mortar-courses',
]);

const ROOF_GRID_START = 'vec2 r7Panel = r7Roof / vec2(1.4, 3.6);';
const ROOF_GRID_END = 'roughnessFactor = max(roughnessFactor, 0.86);\n';
const LIGHTS_ANCHOR = '#include <lights_physical_fragment>';

export function decoSurfaceKind(material) {
  const variant = material?.userData?.variant ?? '';
  if (variant.startsWith('res-wall-art-deco-flats-')) return 'wall';
  if (variant.startsWith('res-roof-art-deco-flats-')) return 'roof';
  return null;
}

export function isDecoSurfaceMaterial(material) {
  return decoSurfaceKind(material) != null;
}

/** True when this Deco build should skip one named decorative mortar skin. */
export function retireDecoMortar(ctx, name) {
  if (ctx?.archetypeId !== 'art-deco-flats') return false;
  if (!R77_RETIRED_DECORATIONS.includes(name)) return false;
  if (!ctx.r77Retired) ctx.r77Retired = [];
  ctx.r77Retired.push(name);
  return true;
}

/**
 * Cylinder unwrap in authored metres. Across is angle × radius, so the bond
 * does not restart where the radial normal changes dominant axis. Up is Y,
 * the same course phase as a planar wall.
 */
export function authorCurvedMasonryMap(geometry, { cx, cz }) {
  const position = geometry?.getAttribute?.('position');
  if (!position) return geometry;
  const map = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const dx = position.getX(i) - cx;
    const dz = position.getZ(i) - cz;
    const radius = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    map[i * 3] = angle * radius;
    map[i * 3 + 1] = position.getY(i);
    map[i * 3 + 2] = 1;
  }
  geometry.setAttribute(R77_MAP_ATTRIBUTE, new THREE.Float32BufferAttribute(map, 3));
  return geometry;
}

/**
 * Real-scale projection. Every side face uses the same authored frontZ, so
 * adjacent shell pieces keep one brick phase. At z = frontZ, across = x, which
 * meets the front face.
 */
export function authorPlanarMasonryMap(geometry, frontZ) {
  const position = geometry?.getAttribute?.('position');
  const normal = geometry?.getAttribute?.('normal');
  if (!position || !normal) return geometry;
  if (!Number.isFinite(frontZ)) throw new Error('Deco planar map requires one building frontZ');
  const count = position.count;
  const map = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const nx = normal.getX(i);
    const ny = normal.getY(i);
    const nz = normal.getZ(i);
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    let across = x;
    let up = y;
    if (ay >= ax && ay >= az) up = z;
    else if (ax > az) {
      const sign = nx >= 0 ? 1 : -1;
      across = x + (frontZ - z) * sign;
    }
    map[i * 3] = across;
    map[i * 3 + 1] = up;
    map[i * 3 + 2] = 0;
  }
  geometry.setAttribute(R77_MAP_ATTRIBUTE, new THREE.Float32BufferAttribute(map, 3));
  return geometry;
}

export function authorRoofMembraneMap(geometry) {
  const position = geometry?.getAttribute?.('position');
  if (!position) return geometry;
  const map = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    map[i * 3] = position.getX(i);
    map[i * 3 + 1] = position.getZ(i);
    map[i * 3 + 2] = 2;
  }
  geometry.setAttribute(R77_MAP_ATTRIBUTE, new THREE.Float32BufferAttribute(map, 3));
  return geometry;
}

export function authorMissingDecoMap(geometry, kind, frontZ) {
  if (!geometry || geometry.getAttribute?.(R77_MAP_ATTRIBUTE)) return geometry;
  if (kind === 'roof') return authorRoofMembraneMap(geometry);
  return authorPlanarMasonryMap(geometry, frontZ);
}

export function authorDecoPartMaps(ctx) {
  if (ctx?.archetypeId !== 'art-deco-flats') return;
  const frontZ = ctx.env?.frontZ;
  if (ctx.p?.wall) ctx.p.wall.userData[R77_FRONT_DATUM] = frontZ;
  const stamp = (part) => {
    if (!part?.geometry || part.geometry.getAttribute(R77_MAP_ATTRIBUTE)) return;
    if (part.material === ctx.p.wall) authorPlanarMasonryMap(part.geometry, frontZ);
    else if (part.material === ctx.p.roof) authorRoofMembraneMap(part.geometry);
  };
  for (const part of ctx.parts ?? []) stamp(part);
  for (const opening of ctx.openings ?? []) {
    for (const part of opening.parts ?? []) stamp(part);
  }
}

/** Lap weight 0..1 at one roof point. Roll width 1.05 m, end lap every 8 m on alternate rolls. */
export function membraneLap(along, across) {
  const seam = Math.min(
    fract(across / R77_ROLL_WIDTH),
    1 - fract(across / R77_ROLL_WIDTH),
  );
  const lap = 1 - smoothstep(0.010, 0.042, seam);
  const roll = Math.floor(across / R77_ROLL_WIDTH);
  const end = (1 - smoothstep(0.015, 0.055, Math.abs(fract(along / R77_ROLL_LENGTH) - 0.03)))
    * (fract(roll * 0.5) >= 0.5 ? 1 : 0);
  return { lap, end };
}

function fract(value) {
  return value - Math.floor(value);
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function replaceOnce(source, anchor, body, label) {
  let count = 0;
  let from = 0;
  while (from < source.length) {
    const at = source.indexOf(anchor, from);
    if (at < 0) break;
    count += 1;
    from = at + anchor.length;
  }
  if (count !== 1) throw new Error(`Deco surface ${label} occurred ${count} times`);
  return source.replace(anchor, body);
}

/** Drop the bathroom-tile panel grid from a roof shader that already contains it. */
export function retireMembraneGrid(fragment) {
  const start = fragment.indexOf(ROOF_GRID_START);
  if (start < 0) return fragment;
  const end = fragment.indexOf(ROOF_GRID_END, start);
  if (end < 0) throw new Error('Deco roof grid has no roughness terminator');
  return `${fragment.slice(0, start)}// r77-retired-membrane-grid\n${fragment.slice(end + ROOF_GRID_END.length)}`;
}

function wallLights(restyle = false) {
  return `// ${R77_VERSION}
{
  vec2 r77Tile = vR77Map.xy / vec2(${R77_MODULE_X.toFixed(4)}, ${R77_MODULE_Y.toFixed(4)});
  vec2 r77Dx = dFdx(r77Tile);
  vec2 r77Dy = dFdy(r77Tile);
  vec2 r77Uv = r77Tile;
  vec3 r77Sample = vec3(1.0);
  #ifdef USE_MAP
    r77Uv = ddResidentialAtlasFragOffset + fract(r77Tile) * ddResidentialAtlasFragScale;
    r77Sample = textureGrad(map, r77Uv, r77Dx * ddResidentialAtlasFragScale, r77Dy * ddResidentialAtlasFragScale).rgb;
  #endif
  vec3 r77Albedo = r77Sample * diffuse${restyle ? ' * 0.59' : ''};
  #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
    diffuseColor.rgb = r77Albedo * vColor.rgb;
  #else
    diffuseColor.rgb = r77Albedo;
  #endif
  #ifdef USE_ROUGHNESSMAP
    roughnessFactor = clamp(roughness * textureGrad(roughnessMap, r77Uv, r77Dx * ddResidentialAtlasFragScale, r77Dy * ddResidentialAtlasFragScale).g, 0.55, 1.0);
  #endif
  normal = nonPerturbedNormal;
  #ifdef USE_NORMALMAP
    if (r77Fine > 0.5) {
      vec3 r77MapN = textureGrad(normalMap, r77Uv, r77Dx * ddResidentialAtlasFragScale, r77Dy * ddResidentialAtlasFragScale).xyz * 2.0 - 1.0;
      r77MapN.xy *= ${R77_NORMAL_GAIN.toFixed(2)};
      mat3 r77Tbn = getTangentFrame( - vViewPosition, normalize( nonPerturbedNormal ), r77Tile );
      #ifdef DOUBLE_SIDED
        r77Tbn[0] *= faceDirection;
        r77Tbn[1] *= faceDirection;
      #endif
      normal = normalize( r77Tbn * r77MapN );
    }
  #endif
}
${LIGHTS_ANCHOR}`;
}

function roofLights() {
  return `// ${R77_VERSION}
{
  float r77Up = smoothstep(0.72, 0.94, abs(normalize(vR77N).y));
  float r77Along = vR77Map.x;
  float r77Across = vR77Map.y;
  float r77Seam = min(fract(r77Across / ${R77_ROLL_WIDTH.toFixed(2)}), 1.0 - fract(r77Across / ${R77_ROLL_WIDTH.toFixed(2)}));
  float r77Lap = (1.0 - smoothstep(0.010, 0.042, r77Seam)) * r77Up;
  float r77Roll = floor(r77Across / ${R77_ROLL_WIDTH.toFixed(2)});
  float r77End = (1.0 - smoothstep(0.015, 0.055, abs(fract(r77Along / ${R77_ROLL_LENGTH.toFixed(1)}) - 0.03)))
    * step(0.5, fract(r77Roll * 0.5)) * r77Up;
  diffuseColor.rgb *= 1.0 - r77Lap * 0.16 - r77End * 0.08;
  roughnessFactor = min(1.0, roughnessFactor + r77Lap * 0.08 + r77End * 0.04);
}
${LIGHTS_ANCHOR}`;
}

/** Neutral atlas × authored diffuse once, then vertex/instance colour once. */
export function r77WallAlbedo(sample, diffuse, vColor) {
  const texel = sample ?? [1, 1, 1];
  const albedo = [
    texel[0] * diffuse[0],
    texel[1] * diffuse[1],
    texel[2] * diffuse[2],
  ];
  if (!vColor) return albedo;
  return [
    albedo[0] * vColor[0],
    albedo[1] * vColor[1],
    albedo[2] * vColor[2],
  ];
}

function v3(x, y, z) {
  return [x, y, z];
}

function v3dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function v3cross(a, b) {
  return v3(
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  );
}

function v3add(a, b) {
  return v3(a[0] + b[0], a[1] + b[1], a[2] + b[2]);
}

function v3scale(a, s) {
  return v3(a[0] * s, a[1] * s, a[2] * s);
}

function v3norm(a) {
  const length = Math.hypot(a[0], a[1], a[2]);
  return length === 0 ? v3(0, 0, 0) : v3scale(a, 1 / length);
}

/** Three's getTangentFrame, on the continuous unwrap. q0/q1 are derivatives of -vViewPosition. */
export function r77TangentFrame(q0, q1, surfNorm, st0, st1) {
  const normal = v3norm(surfNorm);
  const q1perp = v3cross(q1, normal);
  const q0perp = v3cross(normal, q0);
  const tangent = v3add(v3scale(q1perp, st0[0]), v3scale(q0perp, st1[0]));
  const bitangent = v3add(v3scale(q1perp, st0[1]), v3scale(q0perp, st1[1]));
  const det = Math.max(v3dot(tangent, tangent), v3dot(bitangent, bitangent));
  const scale = det === 0 ? 0 : 1 / Math.sqrt(det);
  return [v3scale(tangent, scale), v3scale(bitangent, scale), normal];
}

export function r77ShadeNormal(q0, q1, surfNorm, st0, st1, mapN, { doubleSided = false, faceDirection = 1 } = {}) {
  const frame = r77TangentFrame(q0, q1, surfNorm, st0, st1);
  const side = doubleSided ? faceDirection : 1;
  const tangent = v3scale(frame[0], side);
  const bitangent = v3scale(frame[1], side);
  return v3norm(v3add(
    v3add(v3scale(tangent, mapN[0]), v3scale(bitangent, mapN[1])),
    v3scale(frame[2], mapN[2]),
  ));
}

/** One guarded vertex/instance tint after the neutral atlas has been dyed by diffuse. */
export function assessR77Tint(fragment) {
  const start = fragment.indexOf(`// ${R77_VERSION}`);
  const end = fragment.indexOf(LIGHTS_ANCHOR, start);
  if (start < 0 || end < 0) throw new Error('Deco owned block missing');
  const block = fragment.slice(start, end);
  const tintUses = block.split('r77Albedo * vColor.rgb').length - 1;
  const diffuseUses = block.split('r77Sample * diffuse').length - 1;
  const guarded = block.includes('#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )')
    && block.includes('#else')
    && block.includes('diffuseColor.rgb = r77Albedo;');
  if (!guarded) throw new Error('Deco tint is not guarded');
  if (tintUses !== 1) throw new Error(`Deco tint is applied ${tintUses} times`);
  if (diffuseUses !== 1) throw new Error(`Deco diffuse dye is applied ${diffuseUses} times`);
  if (!block.includes('vec3 r77Sample = vec3(1.0);')) throw new Error('Deco map fallback drops diffuse');
  if (block.includes('r7bChannels') || block.includes('diffuse * diffuse')) {
    throw new Error('Deco wall block still composites the painted overwrite');
  }
  if (!block.includes('getTangentFrame( - vViewPosition, normalize( nonPerturbedNormal ), r77Tile )')) {
    throw new Error('Deco normal frame is not the unwrapped tangent frame');
  }
  if (block.includes('r77R1') || block.includes('getTangentFrame( - vViewPosition, normalize( nonPerturbedNormal ), r77Uv )')) {
    throw new Error('Deco normal frame uses a screen basis or wrapped UV');
  }
  return true;
}

export function applyDecoSurfaceFinish(material, { quality = 'high' } = {}) {
  const kind = decoSurfaceKind(material);
  if (!kind || material?.userData?.r77DecoSurface) return material;
  const fine = quality === 'low' ? 0 : 1;
  // Ruling 73e: roof laps keep their existing shader and key.
  const restyle = kind === 'wall' && readRestyle(globalThis.location?.search ?? '').enabled;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.defaultAttributeValues = {
    ...material.defaultAttributeValues,
    [R77_MAP_ATTRIBUTE]: [0, 0, 0],
  };
  material.userData.r77DecoSurface = {
    version: R77_VERSION,
    kind,
    fine,
    mapAttribute: R77_MAP_ATTRIBUTE,
    module: [R77_MODULE_X, R77_MODULE_Y],
    owns: kind === 'wall' ? ['albedo', 'roughness', 'normal'] : ['laps'],
  };
  material.onBeforeCompile = function onDecoSurface(shader, renderer) {
    if (typeof previous === 'function') previous.call(this, shader, renderer);
    shader.uniforms.r77Fine = { value: fine };
    shader.vertexShader = replaceOnce(
      shader.vertexShader,
      '#include <common>',
      `#include <common>
attribute vec3 ${R77_MAP_ATTRIBUTE};
varying vec3 vR77Map;
varying vec3 vR77N;`,
      'vertex common',
    );
    shader.vertexShader = replaceOnce(
      shader.vertexShader,
      '#include <begin_vertex>',
      `#include <begin_vertex>
vR77Map = ${R77_MAP_ATTRIBUTE};
vR77N = objectNormal;`,
      'vertex begin',
    );
    shader.fragmentShader = replaceOnce(
      shader.fragmentShader,
      '#include <common>',
      `#include <common>
varying vec3 vR77Map;
varying vec3 vR77N;
uniform float r77Fine;`,
      'fragment common',
    );
    if (kind === 'roof') shader.fragmentShader = retireMembraneGrid(shader.fragmentShader);
    shader.fragmentShader = replaceOnce(
      shader.fragmentShader,
      LIGHTS_ANCHOR,
      kind === 'roof' ? roofLights() : wallLights(restyle),
      'lights',
    );
  };
  material.customProgramCacheKey = function decoSurfaceKey() {
    const base = typeof previousKey === 'function' ? previousKey.call(this) : '';
    return `${base}|${R77_VERSION}:${kind}${restyle ? '|r77-restyle' : ''}`;
  };
  if ('needsUpdate' in material) material.needsUpdate = true;
  return material;
}
