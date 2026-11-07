// Zombie Shopper TD — seeded vinyl albedo maps (injection-molded PA plastic).
// Deterministic. No type. Tileable-enough via wrapped stamps + periodic noise.

import * as THREE from 'three';

const SIZE = 512;

const PALETTE = Object.freeze({
  mint: '#7ed3a0',
  cream: '#f2e0a4',
  purple: '#9a48d0',
  orange: '#ff8a28',
  grape: '#5a2480',
});

const SEEDS = Object.freeze({
  mint: 0xa17e33d1,
  cream: 0xc2ea40a4,
  purple: 0x9a48d077,
  orange: 0xff8a2813,
  grape: 0x5a2480c9,
});

const STICKERS = Object.freeze({
  mint: ['#ff5ba0', '#7a4aa0', '#fff4d2', '#ffd23a'],
  cream: ['#7ed3a0', '#9a48d0', '#ff8a28', '#ff5ba0'],
  purple: ['#fff4d2', '#ffd23a', '#ff5ba0', '#7ed3a0'],
  orange: ['#5a2480', '#fff4d2', '#7ed3a0', '#ffd23a'],
  grape: ['#ffd23a', '#fff4d2', '#ff8a28', '#7ed3a0'],
});

const NAMES = Object.freeze(Object.keys(PALETTE));

let cache = null;

function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

function hash2(ix, iy, seed) {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y, period, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xa = ((x0 % period) + period) % period;
  const ya = ((y0 % period) + period) % period;
  const x1 = (xa + 1) % period;
  const y1 = (ya + 1) % period;
  const wx = fade(x - x0);
  const wy = fade(y - y0);
  const v00 = hash2(xa, ya, seed);
  const v10 = hash2(x1, ya, seed);
  const v01 = hash2(xa, y1, seed);
  const v11 = hash2(x1, y1, seed);
  return v00 + (v10 - v00) * wx + (v01 - v00) * wy + (v00 - v10 - v01 + v11) * wx * wy;
}

function fbm(nx, ny, period, seed) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let x = nx;
  let y = ny;
  let p = period;
  let s = seed;
  for (let o = 0; o < 4; o += 1) {
    sum += amp * valueNoise(x, y, p, s);
    norm += amp;
    amp *= 0.5;
    x *= 2;
    y *= 2;
    p *= 2;
    s += 19;
  }
  return sum / (norm || 1);
}

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function normHex(value) {
  if (typeof value === 'number') return `#${value.toString(16).padStart(6, '0')}`;
  const s = String(value || '').trim().toLowerCase();
  if (PALETTE[s]) return PALETTE[s];
  if (s.charAt(0) === '#' && s.length === 7) return s;
  if (s.charAt(0) === '#' && s.length === 4) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  return s;
}

function nearestName(colorHex) {
  const hex = normHex(colorHex);
  if (PALETTE[hex]) return hex;
  for (const name of NAMES) {
    if (PALETTE[name] === hex) return name;
  }
  const rgb = hex.charAt(0) === '#' ? hexToRgb(hex) : null;
  if (!rgb) return 'mint';
  let best = 'mint';
  let dist = Infinity;
  for (const name of NAMES) {
    const c = hexToRgb(PALETTE[name]);
    const d = (c.r - rgb.r) ** 2 + (c.g - rgb.g) ** 2 + (c.b - rgb.b) ** 2;
    if (d < dist) {
      dist = d;
      best = name;
    }
  }
  return best;
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function wrapDraw(ctx, size, x, y, paint) {
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      ctx.save();
      ctx.translate(x + ox, y + oy);
      paint(ctx);
      ctx.restore();
    }
  }
}

function pawPath(ctx, scale) {
  ctx.beginPath();
  ctx.ellipse(0, 7 * scale, 11 * scale, 8.2 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  const toes = [
    [-12, -3.5],
    [-4.2, -11],
    [4.2, -11],
    [12, -3.5],
  ];
  for (const [tx, ty] of toes) {
    ctx.beginPath();
    ctx.ellipse(tx * scale, ty * scale, 4.1 * scale, 5.1 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintBase(ctx, size, rgb, seed, dark) {
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const dirtAmt = dark ? 22 : 36;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const swirl = fbm(u * 5, v * 5, 5, seed);
      const grain = fbm(u * 31, v * 31, 31, seed + 17);
      const blot = fbm(u * 3 + 1.7, v * 3 + 0.4, 3, seed + 91);
      const pit = hash2(x, y, seed + 3);
      const dye = (swirl - 0.5) * 16;
      const speckle = (grain - 0.5) * 9;
      const soil = Math.max(0, blot - 0.56) * dirtAmt;
      const pock = pit > 0.993 ? -20 : pit > 0.972 ? -7 : 0;
      const polish = swirl > 0.62 ? (swirl - 0.62) * 22 : 0;
      const i = (y * size + x) * 4;
      const dust = dark ? soil * -0.35 : soil;
      data[i] = clampByte(rgb.r + dye + speckle - dust * 0.72 + pock + polish);
      data[i + 1] = clampByte(rgb.g + dye * 0.88 + speckle - dust * 0.88 + pock + polish * 0.9);
      data[i + 2] = clampByte(rgb.b + dye * 0.72 + speckle - dust * 0.55 + pock + polish * 0.75);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function dirtSmudges(ctx, size, rng, count, dark) {
  const rgb = dark ? '210,198,180' : '72,50,30';
  for (let i = 0; i < count; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const rad = 16 + rng() * 44;
    const a0 = 0.04 + rng() * 0.07;
    wrapDraw(ctx, size, x, y, (c) => {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, rad);
      g.addColorStop(0, `rgba(${rgb},${a0})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(0, 0, rad, rad * (0.6 + rng() * 0.5), rng() * Math.PI, 0, Math.PI * 2);
      c.fill();
    });
  }
}

function scuffs(ctx, size, rng, count) {
  for (let i = 0; i < count; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const ang = rng() * Math.PI * 2;
    const len = 5 + rng() * 16;
    const light = rng() > 0.45;
    wrapDraw(ctx, size, x, y, (c) => {
      c.rotate(ang);
      c.strokeStyle = light
        ? `rgba(255,255,255,${0.035 + rng() * 0.06})`
        : `rgba(40,28,18,${0.04 + rng() * 0.05})`;
      c.lineWidth = 0.55 + rng() * 1.15;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-len * 0.5, 0);
      c.quadraticCurveTo(0, (rng() - 0.5) * 3.5, len * 0.5, 0);
      c.stroke();
    });
  }
}

function moldedPaws(ctx, size, rng, count, rgb) {
  for (let i = 0; i < count; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const scale = 0.55 + rng() * 0.75;
    const rot = rng() * Math.PI * 2;
    const lift = rng() > 0.5;
    wrapDraw(ctx, size, x, y, (c) => {
      c.rotate(rot);
      c.globalAlpha = 0.09 + rng() * 0.08;
      c.fillStyle = lift
        ? `rgb(${clampByte(rgb.r + 30)},${clampByte(rgb.g + 26)},${clampByte(rgb.b + 20)})`
        : `rgb(${clampByte(rgb.r - 24)},${clampByte(rgb.g - 22)},${clampByte(rgb.b - 16)})`;
      pawPath(c, scale);
    });
  }
}

function pawStickers(ctx, size, rng, colors) {
  const n = 5;
  for (let i = 0; i < n; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const scale = 0.42 + rng() * 0.38;
    const rot = rng() * Math.PI * 2;
    const ink = colors[i % colors.length];
    const peel = rng() * 0.18;
    wrapDraw(ctx, size, x, y, (c) => {
      c.rotate(rot);
      c.globalAlpha = 0.78 + rng() * 0.18;
      c.fillStyle = `rgba(252,246,228,${0.82 - peel})`;
      c.beginPath();
      c.ellipse(0, 1 * scale, 16 * scale, 17.5 * scale, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = ink;
      pawPath(c, scale);
      c.globalAlpha = 0.12;
      c.fillStyle = 'rgba(40,24,16,1)';
      c.beginPath();
      c.ellipse(scale * 4, scale * 8, 7 * scale, 3 * scale, 0.4, 0, Math.PI * 2);
      c.fill();
    });
  }
}

function yellowSplatters(ctx, size, rng, count) {
  for (let i = 0; i < count; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const scale = 0.55 + rng() * 0.85;
    const rot = rng() * Math.PI * 2;
    const a = 0.28 + rng() * 0.32;
    wrapDraw(ctx, size, x, y, (c) => {
      c.rotate(rot);
      c.fillStyle = `rgba(255,210,58,${a})`;
      c.beginPath();
      c.ellipse(0, 0, 13 * scale, 8.5 * scale, 0, 0, Math.PI * 2);
      c.fill();
      const drops = 3 + ((rng() * 4) | 0);
      for (let d = 0; d < drops; d += 1) {
        const ang = rng() * Math.PI * 2;
        const dist = (7 + rng() * 16) * scale;
        c.beginPath();
        c.ellipse(
          Math.cos(ang) * dist,
          Math.sin(ang) * dist,
          (1.4 + rng() * 3.2) * scale,
          (1.1 + rng() * 2.4) * scale,
          ang,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
    });
  }
}

function ejectorPins(ctx, size, rng, count) {
  for (let i = 0; i < count; i += 1) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 2.6 + rng() * 3.4;
    wrapDraw(ctx, size, x, y, (c) => {
      c.strokeStyle = 'rgba(20,16,12,0.1)';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.07)';
      c.beginPath();
      c.arc(0.5, -0.4, r * 0.78, 0, Math.PI * 2);
      c.stroke();
    });
  }
}

function paintVinyl(name) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) return null;

  const rgb = hexToRgb(PALETTE[name]);
  const rng = makeRng(SEEDS[name]);
  const dark = name === 'grape' || name === 'purple';

  paintBase(ctx, SIZE, rgb, SEEDS[name], dark);
  dirtSmudges(ctx, SIZE, rng, dark ? 7 : 9, dark);
  moldedPaws(ctx, SIZE, rng, 10, rgb);
  ejectorPins(ctx, SIZE, rng, 4);
  scuffs(ctx, SIZE, rng, 36);
  pawStickers(ctx, SIZE, rng, STICKERS[name]);
  yellowSplatters(ctx, SIZE, rng, 5);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  texture.name = `vinyl-${name}`;
  texture.userData.procedural = true;
  texture.userData.vinylName = name;
  return texture;
}

function resolveMap(maps, colorHex) {
  if (!maps) return null;
  if (maps.isTexture) return maps;
  if (colorHex != null && maps[colorHex]) return maps[colorHex];
  const name = nearestName(colorHex);
  return maps[name] ?? null;
}

/** Five playset albedos: mint, cream, purple, orange, grape. */
export function makeVinylMaps() {
  if (cache) return cache;
  const maps = {};
  for (const name of NAMES) maps[name] = paintVinyl(name);
  cache = maps;
  return cache;
}

/** MeshStandardMaterial tinted by colorHex, mapped to the matching vinyl sheet. */
export function vinylStandard(THREELib, maps, colorHex, extras = {}) {
  const T = THREELib || THREE;
  const map = extras.map ?? resolveMap(maps, colorHex);
  const named = map?.userData?.vinylName;
  const color = extras.color ?? (named ? 0xffffff : colorHex || 0xffffff);
  return new T.MeshStandardMaterial({
    color,
    map,
    roughness: extras.roughness ?? 0.38,
    metalness: extras.metalness ?? 0.05,
    emissive: extras.emissive ?? 0x000000,
    emissiveIntensity: extras.emissiveIntensity ?? 0,
    transparent: Boolean(extras.transparent),
    alphaTest: extras.alphaTest ?? 0,
    depthWrite: extras.depthWrite ?? true,
  });
}
