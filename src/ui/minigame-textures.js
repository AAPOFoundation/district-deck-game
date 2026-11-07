// District Deck V3.70 L7 — procedural surfaces shared by the three block-centre minigames.
//
// WHY THIS FILE EXISTS. The r1 lane shipped 74 meshes with `meshesWithAnyTexture: 0` and a
// solid-colour sky, which the V370 scale defines as a 2 ("reads as untextured geometry, flat
// colour"). §2.5 asks that nothing be a clean flat colour, and §2.9 asks that the greyscale
// read separate. Both of those are surface problems, so they are solved with surfaces.
//
// These are CanvasTextures — pixels generated here, in the browser, and hung on real THREE
// geometry. They are NOT a procedural-raster path standing in for a model (§3.1): every one
// of them is a map on a mesh that exists. The house precedent is
// `src/ui/supermarket-td-textures.js`, which does the same thing for the shopper game.
//
// Deterministic by construction: seeded integer hash noise, no Math.random, no clock. The
// same texture is byte-identical on every machine and every run, so a captured plate is
// reproducible.
//
// Palette rule, V370 §5.2: nothing here is authored near black. The darkest value emitted is
// #2b2118 (sRGB luma ≈ 35), well clear of the floor the post grade turns into saturated navy.

import * as THREE from 'three';

const SIZE = 256;
const CACHE = new Map();

// --- noise -------------------------------------------------------------------

function hash2(ix, iy, seed) {
  let n = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ (seed | 0);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

/** Tiling value noise. `period` is in cells, so the result wraps cleanly at the edge. */
function valueNoise(x, y, period, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const wrap = (v) => ((v % period) + period) % period;
  const a = hash2(wrap(x0), wrap(y0), seed);
  const b = hash2(wrap(x0 + 1), wrap(y0), seed);
  const c = hash2(wrap(x0), wrap(y0 + 1), seed);
  const d = hash2(wrap(x0 + 1), wrap(y0 + 1), seed);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

function fbm(x, y, period, seed, octaves = 3) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    const p = period * (2 ** i);
    sum += valueNoise(x * (2 ** i), y * (2 ** i), p, seed + i * 7919) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

// --- canvas plumbing ---------------------------------------------------------

function canvas2d(size = SIZE) {
  const el = document.createElement('canvas');
  el.width = size;
  el.height = size;
  return { el, ctx: el.getContext('2d', { willReadFrequently: false }) };
}

function hexToRgb(hex) {
  const s = String(hex).replace('#', '');
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/**
 * Paint per-pixel from a callback returning a multiplier around 1. The base colour is the
 * AUTHORED hex; the multiplier is the grunge. Authoring against the rendered value rather
 * than the hex is the material-library lesson, so callers pass the colour they want to see.
 */
function grain(ctx, size, baseHex, fn) {
  const [br, bg, bb] = hexToRgb(baseHex);
  const image = ctx.createImageData(size, size);
  const data = image.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const m = fn(x / size, y / size, x, y);
      data[i] = clamp255(br * m);
      data[i + 1] = clamp255(bg * m);
      data[i + 2] = clamp255(bb * m);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function finish(el, { repeat = 1, srgb = true } = {}) {
  const texture = new THREE.CanvasTexture(el);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function cached(key, make) {
  if (!CACHE.has(key)) CACHE.set(key, make());
  return CACHE.get(key);
}

// --- the surfaces ------------------------------------------------------------

/** Worked soil: clods, a wetness drift, and flecks of straw mulch. */
export function soilTexture(tone = 'dry') {
  return cached(`soil:${tone}`, () => {
    const { el, ctx } = canvas2d();
    const base = tone === 'wet' ? '#3d3024' : tone === 'rich' ? '#332a20' : '#4a3a2a';
    const seed = tone === 'wet' ? 0x51a3 : tone === 'rich' ? 0x77c1 : 0x2f9d;
    grain(ctx, SIZE, base, (u, v) => {
      const clods = fbm(u * 9, v * 9, 9, seed, 3);
      const fine = valueNoise(u * 34, v * 34, 34, seed + 31);
      return 0.74 + clods * 0.46 + fine * 0.16;
    });
    // Straw and dry-leaf litter — the flecks are what make it read as worked, not painted.
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 190; i += 1) {
      const x = hash2(i, 3, seed) * SIZE;
      const y = hash2(i, 11, seed) * SIZE;
      const a = hash2(i, 17, seed) * Math.PI;
      const len = 3 + hash2(i, 23, seed) * 7;
      ctx.strokeStyle = i % 3 === 0 ? '#8d7a55' : '#6b5a3e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return finish(el, { repeat: 2 });
  });
}

/** Sawn timber: grain lines along one axis, knots, and a weathered silvering. */
export function timberTexture(tone = 'bed') {
  return cached(`timber:${tone}`, () => {
    const { el, ctx } = canvas2d();
    const base = tone === 'pale' ? '#b9a37a' : tone === 'dark' ? '#6f5334' : '#8a6a41';
    const seed = tone === 'pale' ? 0x9911 : tone === 'dark' ? 0x1177 : 0x44b3;
    grain(ctx, SIZE, base, (u, v) => {
      const rings = Math.sin((v * 26 + fbm(u * 3, v * 3, 3, seed, 2) * 5) * Math.PI) * 0.5 + 0.5;
      const drift = fbm(u * 4, v * 2, 4, seed + 13, 2);
      return 0.80 + rings * 0.20 + drift * 0.22;
    });
    ctx.globalAlpha = 0.28;
    for (let i = 0; i < 5; i += 1) {
      const x = hash2(i, 5, seed) * SIZE;
      const y = hash2(i, 9, seed) * SIZE;
      const r = 3 + hash2(i, 15, seed) * 5;
      ctx.fillStyle = '#5b4227';
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return finish(el, { repeat: 1 });
  });
}

/** Bluestone paving: individual units with recessed joints. §2.7 wants real pavers. */
export function paverTexture(tone = 'bluestone') {
  return cached(`paver:${tone}`, () => {
    const { el, ctx } = canvas2d();
    const base = tone === 'pale' ? '#bdb6a4' : '#5b6165';
    const seed = tone === 'pale' ? 0x3ac1 : 0x8d27;
    grain(ctx, SIZE, base, (u, v) => 0.86 + fbm(u * 12, v * 12, 12, seed, 3) * 0.30);
    const cols = 4;
    const rows = 8;
    const w = SIZE / cols;
    const h = SIZE / rows;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const offset = r % 2 ? w / 2 : 0;
        const x = c * w + offset;
        const y = r * h;
        // Per-unit tonal drift: a paved surface is never one value.
        const t = hash2(c + r * 31, r, seed);
        ctx.fillStyle = `rgba(255,255,255,${(t * 0.10).toFixed(3)})`;
        ctx.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
        ctx.fillStyle = `rgba(20,18,16,${(0.10 + t * 0.10).toFixed(3)})`;
        // Joint: two sides only, so the shadow reads directional.
        ctx.fillRect(x, y, w, 2);
        ctx.fillRect(x, y, 2, h);
      }
    }
    return finish(el, { repeat: 1 });
  });
}

/** Loose gravel path. Reads as many small units rather than a tone. */
export function gravelTexture() {
  return cached('gravel', () => {
    const { el, ctx } = canvas2d();
    grain(ctx, SIZE, '#8d8779', (u, v) => 0.84 + fbm(u * 22, v * 22, 22, 0x6c41, 3) * 0.34);
    for (let i = 0; i < 620; i += 1) {
      const x = hash2(i, 2, 0x6c41) * SIZE;
      const y = hash2(i, 6, 0x6c41) * SIZE;
      const r = 0.8 + hash2(i, 10, 0x6c41) * 2.0;
      const light = hash2(i, 14, 0x6c41);
      ctx.fillStyle = light > 0.55
        ? `rgba(214,208,192,${(0.30 + light * 0.35).toFixed(2)})`
        : `rgba(74,68,58,${(0.24 + light * 0.30).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return finish(el, { repeat: 2 });
  });
}

/** Galvanised steel: neutral, streaked below fixings, faintly mottled. §2.5. */
export function galvTexture() {
  return cached('galv', () => {
    const { el, ctx } = canvas2d();
    grain(ctx, SIZE, '#9aa2a6', (u, v) => {
      const spangle = fbm(u * 16, v * 16, 16, 0x21ce, 3);
      const vertical = valueNoise(u * 40, v * 2, 40, 0x77aa);
      return 0.80 + spangle * 0.26 + vertical * 0.18;
    });
    ctx.globalAlpha = 0.20;
    for (let i = 0; i < 26; i += 1) {
      const x = hash2(i, 4, 0x21ce) * SIZE;
      const top = hash2(i, 8, 0x21ce) * SIZE * 0.6;
      const len = 20 + hash2(i, 12, 0x21ce) * 90;
      const grad = ctx.createLinearGradient(0, top, 0, top + len);
      grad.addColorStop(0, 'rgba(96,86,70,0.75)');
      grad.addColorStop(1, 'rgba(96,86,70,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, top, 2 + hash2(i, 16, 0x21ce) * 3, len);
    }
    ctx.globalAlpha = 1;
    return finish(el, { repeat: 1 });
  });
}

/** Painted steel or moulded plastic: even, with wear at the noise peaks. */
export function paintTexture(hex = '#c9705a') {
  return cached(`paint:${hex}`, () => {
    const { el, ctx } = canvas2d();
    const seed = hexToRgb(hex).reduce((a, b) => a * 31 + b, 7) | 0;
    grain(ctx, SIZE, hex, (u, v) => {
      const mottle = fbm(u * 7, v * 7, 7, seed, 3);
      const scuff = valueNoise(u * 48, v * 48, 48, seed + 91);
      return 0.90 + mottle * 0.16 + scuff * 0.10;
    });
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < 14; i += 1) {
      const x = hash2(i, 21, seed) * SIZE;
      const y = hash2(i, 27, seed) * SIZE;
      ctx.strokeStyle = '#efe7d6';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 6 + hash2(i, 33, seed) * 22, y + 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return finish(el, { repeat: 1 });
  });
}

/** Wet-pour rubber softfall: two-tone granulate. The playground's ground truth. */
export function rubberTexture(hex = '#a8564a') {
  return cached(`rubber:${hex}`, () => {
    const { el, ctx } = canvas2d();
    const seed = hexToRgb(hex).reduce((a, b) => a * 17 + b, 3) | 0;
    grain(ctx, SIZE, hex, (u, v) => 0.88 + fbm(u * 18, v * 18, 18, seed, 2) * 0.22);
    for (let i = 0; i < 900; i += 1) {
      const x = hash2(i, 7, seed) * SIZE;
      const y = hash2(i, 13, seed) * SIZE;
      const r = 0.7 + hash2(i, 19, seed) * 1.5;
      const light = hash2(i, 29, seed);
      ctx.fillStyle = light > 0.6
        ? 'rgba(238,230,214,0.24)'
        : 'rgba(46,42,38,0.26)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return finish(el, { repeat: 3 });
  });
}

/** Washed pit sand. */
export function sandTexture() {
  return cached('sand', () => {
    const { el, ctx } = canvas2d();
    grain(ctx, SIZE, '#d9c48d', (u, v) => 0.88 + fbm(u * 30, v * 30, 30, 0x4411, 3) * 0.24);
    for (let i = 0; i < 420; i += 1) {
      const x = hash2(i, 3, 0x4411) * SIZE;
      const y = hash2(i, 5, 0x4411) * SIZE;
      ctx.fillStyle = hash2(i, 9, 0x4411) > 0.5 ? 'rgba(255,250,232,0.30)' : 'rgba(120,102,66,0.22)';
      ctx.fillRect(x, y, 1.4, 1.4);
    }
    return finish(el, { repeat: 4 });
  });
}

/** Foliage: leaf-scale dapple, so a canopy is not one flat green. §2.6. */
export function leafTexture(hex = '#5c8a44') {
  return cached(`leaf:${hex}`, () => {
    const { el, ctx } = canvas2d();
    const seed = hexToRgb(hex).reduce((a, b) => a * 13 + b, 11) | 0;
    grain(ctx, SIZE, hex, (u, v) => 0.74 + fbm(u * 11, v * 11, 11, seed, 3) * 0.52);
    ctx.globalAlpha = 0.34;
    for (let i = 0; i < 260; i += 1) {
      const x = hash2(i, 2, seed) * SIZE;
      const y = hash2(i, 8, seed) * SIZE;
      const r = 2 + hash2(i, 14, seed) * 5;
      const a = hash2(i, 20, seed) * Math.PI;
      ctx.fillStyle = hash2(i, 26, seed) > 0.5 ? '#9dc271' : '#3f5c2e';
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.42, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return finish(el, { repeat: 1 });
  });
}

/** Lawn: tufted, two greens and a dry note. */
export function turfTexture() {
  return cached('turf', () => {
    const { el, ctx } = canvas2d();
    grain(ctx, SIZE, '#6d8a4e', (u, v) => 0.80 + fbm(u * 14, v * 14, 14, 0x5b2a, 3) * 0.38);
    for (let i = 0; i < 900; i += 1) {
      const x = hash2(i, 4, 0x5b2a) * SIZE;
      const y = hash2(i, 12, 0x5b2a) * SIZE;
      const h = 2 + hash2(i, 18, 0x5b2a) * 4;
      const t = hash2(i, 24, 0x5b2a);
      ctx.strokeStyle = t > 0.72 ? 'rgba(176,186,110,0.42)' : t > 0.4 ? 'rgba(122,150,80,0.40)' : 'rgba(58,78,44,0.42)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (t - 0.5) * 2, y - h);
      ctx.stroke();
    }
    return finish(el, { repeat: 3 });
  });
}

/** Weathered render / stucco for a shed or a wall, with grime at the base. */
export function renderTexture(hex = '#c8bda6') {
  return cached(`render:${hex}`, () => {
    const { el, ctx } = canvas2d();
    const seed = hexToRgb(hex).reduce((a, b) => a * 23 + b, 5) | 0;
    grain(ctx, SIZE, hex, (u, v) => {
      const drift = fbm(u * 6, v * 6, 6, seed, 3);
      const grime = Math.max(0, (v - 0.62) / 0.38);
      return 0.92 + drift * 0.14 - grime * 0.22;
    });
    return finish(el, { repeat: 1 });
  });
}

// --- sky ---------------------------------------------------------------------

/**
 * A graded sky for a minigame scene background. Replaces a solid `THREE.Color`, which is
 * what put 80.7 % of the r1 playground plate into one bucket and 82.6 % into one hue.
 */
const SKY_RAMPS = Object.freeze({
  day: [['#8fb2c9', 0], ['#b3c8d3', 0.50], ['#d7d3c2', 0.82], ['#bcae94', 1]],
  garden: [['#9db9cf', 0], ['#bccbcb', 0.50], ['#c6c8ae', 0.76], ['#8d9576', 1]],
  square: [['#93b0c6', 0], ['#b6c6cd', 0.55], ['#d3cdb9', 0.84], ['#a99a80', 1]],
});

export function skyTexture(kind = 'day') {
  return cached(`sky:${kind}`, () => {
    const size = 128;
    const { el, ctx } = canvas2d(size);
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    const list = SKY_RAMPS[kind] ?? SKY_RAMPS.day;
    for (const [colour, at] of list) grad.addColorStop(at, colour);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    // Broken high cloud, so the top of frame is not one flat value either.
    ctx.globalAlpha = 0.30;
    for (let i = 0; i < 60; i += 1) {
      const x = hash2(i, 3, 0x9ac1) * size;
      const y = hash2(i, 7, 0x9ac1) * size * 0.5;
      const w = 8 + hash2(i, 11, 0x9ac1) * 34;
      ctx.fillStyle = '#f2f2ea';
      ctx.beginPath();
      ctx.ellipse(x, y, w, 2 + hash2(i, 15, 0x9ac1) * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(el);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  });
}

/**
 * The one place a minigame builds a standard material.
 *
 * The texture already CARRIES the authored colour — `grain()` bakes the base hex into the
 * pixels — so the material colour is white by default. That is the material-library lesson
 * applied in the other direction: a map multiplied by a second copy of its own colour lands
 * two stops dark, and the value contract in §2.9 is written against what renders, not
 * against what was typed. Pass `tint` only when a family genuinely wants a shift.
 */
export function surfaced(texture, { rough = 0.72, metal = 0.04, repeat = null, tint = '#ffffff' } = {}) {
  const key = `mat:${tint}:${texture?.uuid ?? 'none'}:${rough}:${metal}:${repeat ?? '-'}`;
  return cached(key, () => {
    let map = texture ?? null;
    if (map && repeat) {
      map = map.clone();
      map.needsUpdate = true;
      map.repeat.set(repeat, repeat);
    }
    return new THREE.MeshStandardMaterial({
      color: tint,
      map,
      roughness: rough,
      metalness: metal,
    });
  });
}

/** Tests and probes reset between scenes; the cache is process-lifetime otherwise. */
export function clearTextureCache() {
  for (const value of CACHE.values()) value?.dispose?.();
  CACHE.clear();
}
