// R72 — Beaux plaster and cast-stone response.
// Owns final albedo, roughness and normal for three existing buckets.
// Building-local position is copied into a mapping attribute before merge so a
// later parcel rotation or instance transform cannot retile the facade.
// One shared plaster map per library. Low tier keeps the colour and drip mask and skips cast relief.

import * as THREE from 'three';
import { readRestyle } from '../style/restyle.js';

export const R72_VERSION = 'r72d-beaux-plaster-v1';
export const R72_PLASTER_METRES = 2;
export const R72_PLASTER_FILE_BYTES = 3614139;
export const R72_PLASTER_EDGE = 1254;

function rgba8MipChainBytes(edge) {
  let bytes = 0;
  let width = edge;
  let height = edge;
  for (;;) {
    bytes += width * height * 4;
    if (width === 1 && height === 1) break;
    width = Math.max(1, width >> 1);
    height = Math.max(1, height >> 1);
  }
  return bytes;
}

/** Decoded RGBA8 bytes of every mip, not the compressed PNG. */
export const R72_PLASTER_MIP_BYTES = rgba8MipChainBytes(R72_PLASTER_EDGE);
// Decoded sRGB mean of the original plaster image. Fallback only; not a second grade.
export const R72_PLASTER_MEAN = Object.freeze([0.43415, 0.36131, 0.28744]);
// Darker, warmer, and smooth. Not a resample of the plaster aggregate.
export const R72_STONE = Object.freeze([0.372, 0.286, 0.214]);
export const R72_ROLE_ATTRIBUTE = 'aR72Role';
export const R72_MAP_ATTRIBUTE = 'aR72Map';
export const R72_CONTACT_LIMIT = 48;
export const R72_PLASTER = 0;
export const R72_CAST = 1;
export const R72_SHELTER = 2;

// One numeric source for the mask and the shader. Changing a field changes both.
export const R72_DRIP = Object.freeze({
  margin: 0.02,
  drop: 1.25,
  column: 0.11,
  gate: 0.38,
  width: 0.01,
  widthJitter: 0.018,
  soft: 0.028,
  reach: 0.22,
  reachJitter: 0.92,
  fadeStart: 0.4,
  centre: 0.35,
  centreJitter: 0.3,
});

const WALL_PREFIX = 'res-wall-walkup-beaux-arts-';
const ALT_PREFIX = 'res-wall-alt-walkup-beaux-arts-';
const TRIM_PREFIX = 'res-trim-walkup-beaux-arts-';
const LIGHTS_ANCHOR = '#include <lights_physical_fragment>';

function fract(value) {
  return value - Math.floor(value);
}

/** Same construction as the shader hash. Stable, no time. */
export function r72Hash(x, y) {
  let px = fract(x * 0.1031);
  let py = fract(y * 0.1031);
  let pz = fract(x * 0.1031);
  const dot = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
  px += dot;
  py += dot;
  pz += dot;
  return fract((px + py) * pz);
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function faceCode(normal) {
  const ax = Math.abs(normal[0]);
  const ay = Math.abs(normal[1]);
  const az = Math.abs(normal[2]);
  if (ay > 0.65 && ay >= ax && ay >= az) return -1;
  if (az >= ax) return normal[2] >= 0 ? 0 : 2;
  return 1;
}

/**
 * Sparse sill/cornice drips in authored building metres.
 * Returns 0..1. Columns inside a contact are often empty, and a live column
 * fades before the drop limit, so the mask is not a rectangle.
 */
export function beauxDripResponse(position, normal, contacts) {
  const face = faceCode(normal);
  if (face < 0 || !contacts?.length) return 0;
  const across = face === 1 ? position[2] : position[0];
  const y = position[1];
  let best = 0;
  for (let i = 0; i < contacts.length; i += 1) {
    const contact = contacts[i];
    if (contact.face !== face) continue;
    const below = contact.y - y;
    if (below < 0 || below > R72_DRIP.drop) continue;
    if (across < contact.a0 - R72_DRIP.margin || across > contact.a1 + R72_DRIP.margin) continue;
    const col = Math.floor((across - contact.a0) / R72_DRIP.column);
    const h = r72Hash(col + 3, contact.y * 17 + contact.face * 9 + i);
    if (h > R72_DRIP.gate) continue;
    const centre = contact.a0 + (col + R72_DRIP.centre + h * R72_DRIP.centreJitter) * R72_DRIP.column;
    const width = R72_DRIP.width + h * R72_DRIP.widthJitter;
    const band = 1 - smoothstep(width, width + R72_DRIP.soft, Math.abs(across - centre));
    const reach = R72_DRIP.reach + h * R72_DRIP.reachJitter;
    const fade = 1 - smoothstep(reach * R72_DRIP.fadeStart, reach, below);
    best = Math.max(best, band * fade);
  }
  return best;
}

/** Parse the emitted soffit scalar. Reversed smoothstep edges are invalid. */
export function r72SoffitAt(expression) {
  const text = String(expression ?? '').trim();
  const negated = /^1\.0\s*-\s*smoothstep\(/.test(text);
  const body = negated ? text.replace(/^1\.0\s*-\s*/, '') : text;
  const match = body.match(/^smoothstep\(\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*,\s*r72N\.y\s*\)$/);
  if (!match) throw new Error('Beaux soffit expression is not a smoothstep of r72N.y');
  const edge0 = Number(match[1]);
  const edge1 = Number(match[2]);
  if (!(edge0 < edge1) || !Number.isFinite(edge0) || !Number.isFinite(edge1)) {
    throw new Error('Beaux soffit smoothstep edges are invalid');
  }
  return (normalY) => {
    const t = Math.min(1, Math.max(0, (normalY - edge0) / (edge1 - edge0)));
    const smooth = t * t * (3 - 2 * t);
    return negated ? 1 - smooth : smooth;
  };
}

/** One guarded instance/vertex tint. Zero or two applications are rejected. */
export function assessR72Tint(fragment) {
  const start = fragment.indexOf(`// ${R72_VERSION}`);
  const end = fragment.indexOf('#include <lights_physical_fragment>', start);
  if (start < 0 || end < 0) throw new Error('Beaux owned block missing');
  const block = fragment.slice(start, end);
  const uses = block.split('r72Albedo * vColor.rgb').length - 1;
  const guarded = block.includes('#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )')
    && block.includes('#else')
    && block.includes('#endif');
  if (!guarded) throw new Error('Beaux tint is not guarded by the colour defines');
  if (uses !== 1) throw new Error(`Beaux tint is applied ${uses} times`);
  if (!block.includes('diffuseColor.rgb = r72Albedo;')) {
    throw new Error('Beaux tint drops the untinted response');
  }
  return true;
}

export function isBeauxSurfaceMaterial(material) {
  const variant = material?.userData?.variant ?? '';
  if (material?.userData?.buildingWeatherOverlay?.role === 'roof') return false;
  return variant.startsWith(WALL_PREFIX)
    || variant.startsWith(ALT_PREFIX)
    || variant.startsWith(TRIM_PREFIX);
}

export function normalizeBeauxContacts(input) {
  if (input == null) return [];
  if (!Array.isArray(input)) throw new TypeError('Beaux contacts must be an array');
  if (input.length > R72_CONTACT_LIMIT) {
    throw new Error(`Beaux contacts exceed ${R72_CONTACT_LIMIT}`);
  }
  return input.map((contact, index) => {
    const a0 = +contact?.a0;
    const a1 = +contact?.a1;
    const y = +contact?.y;
    const face = +contact?.face;
    if (![a0, a1, y, face].every(Number.isFinite)) {
      throw new Error(`Beaux contact ${index} is not finite`);
    }
    if (a1 < a0) throw new Error(`Beaux contact ${index} is inverted`);
    if (face !== 0 && face !== 1 && face !== 2) {
      throw new Error(`Beaux contact ${index} face is not a facade`);
    }
    return { a0, a1, y, face };
  });
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
  if (count !== 1) throw new Error(`Beaux surface ${label} occurred ${count} times`);
  return source.replace(anchor, body);
}

function retireInheritedAlbedo(fragment) {
  const line = 'diffuseColor *= sampledDiffuseColor;';
  let count = 0;
  let from = 0;
  while (from < fragment.length) {
    const at = fragment.indexOf(line, from);
    if (at < 0) break;
    count += 1;
    from = at + line.length;
  }
  if (count > 1) throw new Error(`Beaux surface atlas albedo occurred ${count} times`);
  if (count === 1) {
    return fragment.replace(line, 'diffuseColor *= vec4(1.0, 1.0, 1.0, sampledDiffuseColor.a);');
  }
  return replaceOnce(fragment, '#include <map_fragment>', '// r72-retired-map-fragment', 'map fragment');
}

function shaderSource(limit, restyle = false) {
  const d = R72_DRIP;
  return {
    vertexCommon: `#include <common>
attribute float ${R72_ROLE_ATTRIBUTE};
attribute vec3 ${R72_MAP_ATTRIBUTE};
varying float vR72Role;
varying vec3 vR72Map;
varying vec3 vR72N;`,
    vertexBegin: `#include <begin_vertex>
vR72Role = ${R72_ROLE_ATTRIBUTE};
vR72Map = ${R72_MAP_ATTRIBUTE};
vR72N = objectNormal;`,
    fragmentCommon: `#include <common>
varying float vR72Role;
varying vec3 vR72Map;
varying vec3 vR72N;
uniform float r72Fine;
uniform float r72Bucket;
uniform float r72ContactCount;
uniform vec4 r72Contacts[${limit}];
uniform sampler2D r72PlasterMap;
uniform float r72PlasterReady;
vec3 r72SrgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow(max((c + 0.055) / 1.055, vec3(0.0)), vec3(2.4));
  return mix(lo, hi, step(vec3(0.04045), c));
}
float r72Hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float r72Value(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(r72Hash(i), r72Hash(i + vec2(1.0, 0.0)), u.x),
    mix(r72Hash(i + vec2(0.0, 1.0)), r72Hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float r72Pockets(vec2 uv, float cell) {
  vec2 id = floor(uv / cell);
  float h = r72Hash(id + vec2(2.7, 8.1));
  if (h < 0.64) return 0.0;
  vec2 jitter = vec2(r72Hash(id + vec2(1.3, 4.4)), r72Hash(id + vec2(6.2, 2.2)));
  vec2 centre = (id + 0.28 + 0.44 * jitter) * cell;
  float radius = cell * (0.12 + 0.18 * h);
  float dist = length(uv - centre);
  return (1.0 - smoothstep(radius * 0.25, radius, dist)) * (h - 0.64) / 0.36;
}
float r72Drips(vec3 p, vec3 n) {
  vec3 an = abs(n);
  if (an.y > 0.65 && an.y >= an.x && an.y >= an.z) return 0.0;
  float face = an.z >= an.x ? (n.z >= 0.0 ? 0.0 : 2.0) : 1.0;
  float across = face > 0.5 && face < 1.5 ? p.z : p.x;
  float best = 0.0;
  for (int i = 0; i < ${limit}; i++) {
    if (float(i) >= r72ContactCount) continue;
    vec4 c = r72Contacts[i];
    if (abs(c.w - face) > 0.25) continue;
    float below = c.z - p.y;
    if (below < 0.0 || below > ${d.drop.toFixed(2)}) continue;
    if (across < c.x - ${d.margin.toFixed(2)} || across > c.y + ${d.margin.toFixed(2)}) continue;
    float col = floor((across - c.x) / ${d.column.toFixed(2)});
    float h = r72Hash(vec2(col + 3.0, c.z * 17.0 + c.w * 9.0 + float(i)));
    if (h > ${d.gate.toFixed(2)}) continue;
    float centre = c.x + (col + ${d.centre.toFixed(2)} + h * ${d.centreJitter.toFixed(1)}) * ${d.column.toFixed(2)};
    float width = ${d.width.toFixed(3)} + h * ${d.widthJitter.toFixed(3)};
    float band = 1.0 - smoothstep(width, width + ${d.soft.toFixed(3)}, abs(across - centre));
    float reach = ${d.reach.toFixed(2)} + h * ${d.reachJitter.toFixed(2)};
    float fade = 1.0 - smoothstep(reach * ${d.fadeStart.toFixed(1)}, reach, below);
    best = max(best, band * fade);
  }
  return best;
}`,
    lights: `// ${R72_VERSION}
{
  vec3 r72N = normalize(vR72N);
  float r72Role = vR72Role;
  if (r72Role < 0.0) r72Role = r72Bucket;
  r72Role = clamp(floor(r72Role + 0.5), 0.0, 2.0);
  vec3 r72Abs = abs(r72N);
  vec2 r72Uv = r72Abs.y > max(r72Abs.x, r72Abs.z) ? vR72Map.xz
    : (r72Abs.x > r72Abs.z ? vR72Map.zy : vR72Map.xy);
  vec3 r72Plaster = vec3(${R72_PLASTER_MEAN.map((v) => v.toFixed(5)).join(', ')});
  if (r72PlasterReady > 0.5) {
    r72Plaster = r72SrgbToLinear(texture2D(r72PlasterMap, r72Uv / ${R72_PLASTER_METRES.toFixed(1)}).rgb);
  }
${restyle ? '  r72Plaster = mix(vec3(0.43415, 0.36131, 0.28744), r72Plaster, 0.25) * 3.85;\n' : ''}  vec3 r72Stone = vec3(${R72_STONE.map((v) => v.toFixed(3)).join(', ')});
${restyle ? '  r72Stone *= 2.05;\n' : ''}  r72Stone *= 1.0 + (r72Value(r72Uv / 1.7 + 3.0) - 0.5) * 0.035;
  vec3 r72Albedo = r72Role < 0.5 ? r72Plaster : r72Stone;
  if (r72Role > 1.5) r72Albedo *= vec3(0.78, 0.75, 0.70);
  float r72Soffit = 1.0 - smoothstep(-0.62, -0.12, r72N.y);
  r72Albedo = mix(r72Albedo, r72Albedo * vec3(0.82, 0.80, 0.76), r72Soffit);
  float r72Across = r72Abs.x > r72Abs.z ? vR72Map.z : vR72Map.x;
  float r72Gh = r72Hash(vec2(floor(r72Across / 0.36), 7.0));
  float r72Reach = 0.18 + r72Gh * 0.55;
  float r72Ground = (1.0 - smoothstep(r72Reach * 0.45, r72Reach, vR72Map.y))
    * (1.0 - smoothstep(0.55, 0.82, r72Abs.y));
  float r72Drip = r72Drips(vR72Map, r72N);
  r72Albedo *= 1.0 - r72Ground * 0.10 - r72Drip * 0.22;
  r72Albedo = max(r72Albedo, vec3(0.0));
  #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
    diffuseColor.rgb = r72Albedo * vColor.rgb;
  #else
    diffuseColor.rgb = r72Albedo;
  #endif
  float r72Rough = r72Role < 0.5 ? 0.93 : (r72Role < 1.5 ? 0.78 : 0.97);
  r72Rough += r72Soffit * 0.04 + r72Ground * 0.04 + r72Drip * 0.08;
  roughnessFactor = clamp(r72Rough, 0.55, 1.0);
  normal = nonPerturbedNormal;
  if (r72Fine > 0.5) {
    float r72Height = r72Role > 0.5 && r72Role < 1.5
      ? (r72Value(r72Uv / 0.85) - 0.5) * 0.0003
      : 0.0;
    vec3 r72S = dFdx(vViewPosition);
    vec3 r72T = dFdy(vViewPosition);
    vec2 r72Dh = vec2(dFdx(r72Height), dFdy(r72Height));
    vec3 r72R1 = cross(r72T, normal);
    vec3 r72R2 = cross(normal, r72S);
    float r72Det = dot(r72S, r72R1) * faceDirection;
    vec3 r72Grad = sign(r72Det) * (r72Dh.x * r72R1 + r72Dh.y * r72R2);
    normal = normalize(abs(r72Det) * normal - r72Grad);
  }
}
${restyle ? '  diffuseColor.rgb *= min(1.0, 0.88 / max(max(diffuseColor.r, diffuseColor.g), max(diffuseColor.b, 0.000001)));\n' : ''}${LIGHTS_ANCHOR}`,
  };
}

const PLASTER_URL = new URL(
  '../../../assets/materials/r72-mineral-plaster-v1.png',
  import.meta.url,
).href;

function defaultPlasterLoad(url, onLoad, onError) {
  const loader = new THREE.TextureLoader();
  loader.load(url, (loaded) => {
    const image = loaded.image;
    loaded.image = null;
    loaded.dispose();
    onLoad(image);
  }, undefined, onError);
}

/** One shared plaster texture for a MaterialLibrary. Not a module singleton. */
export function createBeauxPlasterMap({ load = defaultPlasterLoad } = {}) {
  const texture = new THREE.Texture();
  texture.name = 'r72-mineral-plaster-v1';
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  const ready = { value: 0 };
  const map = { value: texture };
  let disposed = false;
  try {
    load(PLASTER_URL, (image) => {
      if (disposed) return;
      texture.image = image;
      texture.needsUpdate = true;
      ready.value = 1;
    }, () => {
      if (!disposed) ready.value = 0;
    });
  } catch {
    ready.value = 0;
  }
  return {
    id: 'r72-mineral-plaster-v1',
    texture,
    map,
    ready,
    url: PLASTER_URL,
    fileBytes: R72_PLASTER_FILE_BYTES,
    get disposed() { return disposed; },
    textureBytes() { return disposed ? 0 : R72_PLASTER_MIP_BYTES; },
    dispose() {
      if (disposed) return;
      disposed = true;
      ready.value = 0;
      texture.image = null;
      texture.dispose();
    },
  };
}

export function applyBeauxSurfaceFinish(material, { quality = 'high', plaster = null } = {}) {
  if (!isBeauxSurfaceMaterial(material)) return material;
  if (material.userData.r72BeauxSurface) return material;
  const contacts = normalizeBeauxContacts(material.userData.r72BeauxContacts);
  const bucket = material.userData.r72BeauxBucket === 1 ? 1 : 0;
  const fine = quality === 'low' ? 0 : 1;
  const packed = contacts.map((contact) => new THREE.Vector4(
    contact.a0, contact.a1, contact.y, contact.face,
  ));
  while (packed.length < R72_CONTACT_LIMIT) packed.push(new THREE.Vector4(0, 0, 0, -1));
  // Ruling 73e: capture the switch with the material's shader and cache key.
  const restyle = readRestyle(globalThis.location?.search ?? '').enabled;
  // Ruling 80: recover render through albedo only, before the single tail cap
  // and lighting. Keep the round-2 stone level and unit trim response.
  const wallResponse = material.userData.variant.startsWith(TRIM_PREFIX) ? 1 : 1.65;
  const source = shaderSource(R72_CONTACT_LIMIT, restyle);
  if (restyle) {
    // Prepare albedo outside the compile hook: three's default cache key includes
    // that function's source, whose switch-off bytes must stay unchanged.
    const cap = '  diffuseColor.rgb *= min(1.0, 0.88 / max(max(diffuseColor.r, diffuseColor.g), max(diffuseColor.b, 0.000001)));\n';
    source.lights = replaceOnce(source.lights, cap,
      `  diffuseColor.rgb *= ${wallResponse.toFixed(2)};\n` + cap, 'wall response');
  }
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.defaultAttributeValues = {
    ...material.defaultAttributeValues,
    [R72_ROLE_ATTRIBUTE]: [-1],
    [R72_MAP_ATTRIBUTE]: [0, 0, 0],
  };
  material.userData.r72BeauxSurface = {
    version: R72_VERSION,
    fine,
    bucket,
    contacts: contacts.length,
    owns: ['albedo', 'roughness', 'normal'],
    mapAttribute: R72_MAP_ATTRIBUTE,
    plaster: plaster?.id ?? null,
  };
  material.onBeforeCompile = function onBeauxSurface(shader, renderer) {
    if (typeof previous === 'function') previous.call(this, shader, renderer);
    shader.uniforms.r72Fine = { value: fine };
    shader.uniforms.r72Bucket = { value: bucket };
    shader.uniforms.r72ContactCount = { value: contacts.length };
    shader.uniforms.r72Contacts = { value: packed };
    shader.uniforms.r72PlasterMap = plaster?.map ?? { value: null };
    shader.uniforms.r72PlasterReady = plaster?.ready ?? { value: 0 };
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>', source.vertexCommon, 'vertex common');
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <begin_vertex>', source.vertexBegin, 'vertex begin');
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <common>', source.fragmentCommon, 'fragment common');
    shader.fragmentShader = retireInheritedAlbedo(shader.fragmentShader);
    shader.fragmentShader = replaceOnce(shader.fragmentShader, LIGHTS_ANCHOR, source.lights, 'lights');
  };
  material.customProgramCacheKey = function beauxSurfaceKey() {
    const base = typeof previousKey === 'function' ? previousKey.call(this) : '';
    return `${base}|${R72_VERSION}${restyle ? '|r72-restyle|p17-w2a-beaux|p17-w2a-beaux-r2:' + wallResponse : ''}`;
  };
  if ('needsUpdate' in material) material.needsUpdate = true;
  return material;
}
