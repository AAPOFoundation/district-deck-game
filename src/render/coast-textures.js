// W14-T: luminance and mask packs for the coast and the ground, and the one GLSL chunk that reads them.
//
// Four PNGs, each three single-channel maps packed as R, G, B (RGB, 8 bit, never JPEG: chroma
// subsampling would mix the packed channels). Three hold luminance with mean 128 and SD about 26,
// used as `token * lum`, never as colour; `foam` holds masks where 0 is no foam.
//
// Interface I1 of coast/DESIGN.md. The exported names and the channel order do not change after
// the first version: other lanes compile against them.

import * as THREE from 'three';

const BASE = new URL('./assets/coast/', import.meta.url).href;
const V3 = (r, g, b) => Object.freeze([r, g, b]);

function entry(file, size, repeatM, names, kind) {
  const channel = {};
  names.forEach((n, i) => { channel[n] = V3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0); });
  return Object.freeze({
    url: BASE + file,
    size,
    repeatM,
    kind,
    channels: Object.freeze(names.slice()),
    channel: Object.freeze(channel),
  });
}

export const COAST_PACKS = Object.freeze({
  coast: entry('coast-lum.png', 1024, 12, ['sandDry', 'sandWet', 'seabed'], 'lum'),
  ground: entry('ground-lum.png', 1024, 16, ['pastureDry', 'meadow', 'earth'], 'lum'),
  rock: entry('rock-lum.png', 512, 12, ['strata', 'rock', 'drystone'], 'lum'),
  foam: entry('foam-lace.png', 512, 24, ['breaker', 'fleck', 'swash'], 'mask'),
  foliage: entry('foliage-lum.png', 512, 1.6, ['leafFine', 'leafBroad', 'relief'], 'lum'),
  // W21-A: four leaf-cluster cards for the crowns (R mask, G tone, B depth); not a world-space layer, read by the card uv.
  crown: entry('crown-cards.png', 512, 1, ['mask', 'tone', 'depth'], 'lum'),
});

const cache = new Map();

function placeholder(kind) {
  const v = kind === 'mask' ? 0 : 128;
  const texture = new THREE.DataTexture(new Uint8Array([v, v, v, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

function setState(name, value) {
  const g = globalThis;
  if (!g.__ddCoastPackState) g.__ddCoastPackState = {};
  g.__ddCoastPackState[name] = value;
}

/**
 * One texture per pack per page. In a browser the 1 by 1 placeholder is replaced in place when the PNG
 * arrives; `ready.value` is 0 until then (and stays 0 on error), so a consumer multiplies by `ready`
 * or reads the placeholder (128 luminance, 0 mask) and looks unchanged. In node (no `document`) the
 * placeholder is returned and nothing loads.
 */
export function loadCoastPack(name) {
  if (cache.has(name)) return cache.get(name);
  const def = COAST_PACKS[name];
  if (!def) throw new Error(`coast pack unknown: ${name}`);
  const texture = placeholder(def.kind);
  const ready = { value: 0 };
  const result = { texture, ready };
  cache.set(name, result);
  if (typeof document === 'undefined' || typeof Image === 'undefined') return result;

  setState(name, 0);
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // The placeholder owns a 1 by 1 GPU allocation; dispose it so the next upload allocates the real size.
      texture.dispose();
      texture.image = { data: new Uint8Array(px.data.buffer), width: canvas.width, height: canvas.height };
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      ready.value = 1;
      setState(name, 1);
    } catch (error) {
      setState(name, -1);
      console.warn('coast pack failed', name, def.url, error && error.message);
    }
  };
  image.onerror = () => {
    setState(name, -1);
    console.warn('coast pack failed', name, def.url);
  };
  image.src = def.url;
  return result;
}

// Integer hash (no fract(sin(...))): at world coordinates of 800 m a sine hash bands on some GPUs.
// Every helper name starts with ddCoast.
export const COAST_DETAIL_GLSL = [
  '#ifndef DD_COAST_DETAIL',
  '#define DD_COAST_DETAIL',
  'float ddCoastHash(ivec2 p) {',
  '  uvec2 q = uvec2(p) * uvec2(1597334673u, 3812015801u);',
  '  uint n = (q.x ^ q.y) * 1597334673u;',
  '  n ^= n >> 15u;',
  '  n *= 2246822519u;',
  '  return float(n >> 8u) * (1.0 / 16777216.0);',
  '}',
  'float ddCoastNoise(vec2 p) {',
  '  vec2 i = floor(p);',
  '  vec2 f = p - i;',
  '  vec2 u = f * f * (3.0 - 2.0 * f);',
  '  ivec2 c = ivec2(i);',
  '  float a = ddCoastHash(c);',
  '  float b = ddCoastHash(c + ivec2(1, 0));',
  '  float d = ddCoastHash(c + ivec2(0, 1));',
  '  float e = ddCoastHash(c + ivec2(1, 1));',
  '  return mix(mix(a, b, u.x), mix(d, e, u.x), u.y);',
  '}',
  // Two lookups of the same pack, chosen by a value noise so neither copy shows a ghost of the other.
  // Lookup one is warped by a slowly varying displacement (Pocket Reserve rotates by fbm * 3.2 rad about the
  // origin; the stretch of that grows with distance from the origin and reaches tens at 700 m, so the same
  // slowly varying turning is carried here by a bounded warp whose Jacobian stays near identity).
  // Lookup two is un-warped, scaled 1 / 1.53 and offset 0.27 (terrain-splat.ts:326-329). Pocket Reserve also turns it
  // 37.5 degrees; that is dropped here because ripples, strata and courses then change direction at the patch edge
  // and read as stamped patches. The blend noise is turned instead so its plateaus do not follow the world axes.
  'vec4 ddCoastFetch(sampler2D pack, vec2 w, float repeatM, float bias) {',
  '  vec2 wp = w / (repeatM * 4.5);',
  '  vec2 warp = vec2(ddCoastNoise(wp) - 0.5, ddCoastNoise(wp + vec2(31.7, 17.3)) - 0.5) * (repeatM * 1.8);',
  '  vec2 p1 = (w + warp) / repeatM;',
  '  vec2 p2 = w / (repeatM * 1.53) + vec2(0.27);',
  '  float n = ddCoastNoise(mat2(0.8660254, 0.5, -0.5, 0.8660254) * w / (repeatM * 1.9) + vec2(7.3, 2.9));',
  '  float m = smoothstep(0.45, 0.55, n);',
  '  return mix(texture2D(pack, p1, bias), texture2D(pack, p2, bias), m);',
  '}',
  'float ddCoastLumBias(sampler2D pack, vec3 channel, vec2 worldXZ, float repeatM, float bias) {',
  '  float l = dot(ddCoastFetch(pack, worldXZ, repeatM, bias).rgb, channel) * (255.0 / 128.0);',
  '  return mix(l, max(l, 0.62), 0.9);',
  '}',
  'float ddCoastLum(sampler2D pack, vec3 channel, vec2 worldXZ, float repeatM) {',
  '  return ddCoastLumBias(pack, channel, worldXZ, repeatM, 0.0);',
  '}',
  'float ddCoastMask(sampler2D pack, vec3 channel, vec2 uv) {',
  '  return clamp(dot(texture2D(pack, uv).rgb, channel), 0.0, 1.0);',
  '}',
  '#endif',
].join('\n');
