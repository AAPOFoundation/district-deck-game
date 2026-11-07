// P14-G3 — sighting/fight land is a smoothed iso mesh. The voxel ledger stays
// the game rule and fades in only past the yard interaction zoom.

import {
  GLOBE_COLS,
  GLOBE_RADIUS,
  GLOBE_ROWS,
  LAND_HEIGHT,
  LAND_SURFACE,
  cellToLatLon,
  isCanalWater,
  isLandCell,
  inlandDistanceCells,
  landAltitudeAt,
  latLonToVector,
  reliefNoise,
} from './world-globe.js';
import { canopyColorAt, climateColorAt, forestInfluence } from './world-climate-color.js';
import { P1_GLOBE_LIGHT } from '../../render/v4-p1-polish.js';

export const SMOOTH_LAND = Object.freeze({
  iso: 0.5,
  laplacianPasses: 2,
  heightBlurRadius: 2,
  mottleLuma: 0,
  shelfPx: 2.5,
  shelfFadePx: 6,
  shelfOuterShade: 0.40,
  voxelFadeMs: 600,
  yardZoomZ: 3.4,
  sightingCamZ: 5.15,
  pinSightingScale: 0.6,
  riverFlowMin: 20,
  riverAccMin: 96,
  riverContinentMin: 800,
  rightAngleDeg: 90,
  rightAngleTolDeg: 8,
  rightAngleMaxShare: 0.05,
  pxPerWorld: 314.9,
  forestPatchCells: 3,
  forestPatchKm: 40,
  normalGain: 11.5,
  flankLumaMin: 20,
  silhouetteIoUMin: 0.85,
  lakeFillMax: 28,
  minFragmentCells: 3,
  weldCellEps: 0.02,
  albedoContrast: 1.6,
  keyShadeGain: 1.8,
  ridgeLift: 0.25,
  forestDrop: 0.20,
  lakeDrop: 0.30,
  mudLuma: 10,
  mudKm0: 200,
  mudKm1: 80,
  displayLumaMin: 40,
  displayLumaMax: 200,
  displayStdMin: 28,
  cellKm: 40075.017 / GLOBE_COLS,
});

/** MeshBasic + own filmic; ACES at exposure 1.06 crushed G4's albedo. */
export const SMOOTH_LAND_MATERIAL = Object.freeze({
  color: 0xffffff,
  vertexColors: true,
  toneMapped: false,
  fog: true,
  roughness: 0.92,
});

export const LAND_BIOMES = Object.freeze({
  ice: 0xe8eef4,
  tundra: 0x91aa70,
  boreal: 0x416f4a,
  temperate: 0x69934e,
  savanna: 0xc9ad65,
  desert: 0xdfb867,
  tropical: 0x416f4a,
  coastRim: 0x48677e,
  river: 0x416f4a,
  ridge: 0xb77a47,
  canopy: 0x416f4a,
});

const ISO = SMOOTH_LAND.iso;
const COLS = GLOBE_COLS;
const ROWS = GLOBE_ROWS;
const N = COLS * ROWS;

let occField = null;
let heightField = null;
let rawFilled = null;
let built = null;

const KEY_POS = P1_GLOBE_LIGHT.keyPosition;
const KEY_LEN = Math.hypot(KEY_POS[0], KEY_POS[1], KEY_POS[2]) || 1;
const KEY_DIR = [KEY_POS[0] / KEY_LEN, KEY_POS[1] / KEY_LEN, KEY_POS[2] / KEY_LEN];

function mixHex(a, b, t) {
  const u = Math.min(1, Math.max(0, t));
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (Math.round(ar + ((br - ar) * u)) << 16)
    | (Math.round(ag + ((bg - ag) * u)) << 8)
    | Math.round(ab + ((bb - ab) * u));
}

function lumaOf(hex) {
  return 0.2126 * ((hex >> 16) & 255)
    + 0.7152 * ((hex >> 8) & 255)
    + 0.0722 * (hex & 255);
}

function shiftLuma(hex, delta) {
  const r = Math.min(255, Math.max(0, ((hex >> 16) & 255) + delta));
  const g = Math.min(255, Math.max(0, ((hex >> 8) & 255) + delta));
  const b = Math.min(255, Math.max(0, (hex & 255) + delta));
  return (r << 16) | (g << 8) | b;
}

function wrapC(c) {
  return ((c % COLS) + COLS) % COLS;
}

function srgbToLinear(c) {
  const x = Math.max(0, Math.min(1, c));
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c) {
  const x = Math.max(0, c);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * (x ** (1 / 2.4)) - 0.055;
}

/** Tasmania / New Zealand / Japan stay even when a component is under 3 cells. */
export function isNamedIsland(lat, lon) {
  if (lat >= -44.2 && lat <= -40.4 && lon >= 144.4 && lon <= 148.7) return true;
  if (lat >= -47.6 && lat <= -34.0 && lon >= 166.0 && lon <= 179.4) return true;
  if (lat >= 24.0 && lat <= 45.8 && lon >= 122.8 && lon <= 146.2) return true;
  return false;
}

function filmicCurve(x) {
  const y = Math.max(0, x);
  return 1.15 * y / (y + 0.28);
}

function mudMottleLuma(column, row) {
  const s0 = SMOOTH_LAND.mudKm0 / SMOOTH_LAND.cellKm;
  const s1 = SMOOTH_LAND.mudKm1 / SMOOTH_LAND.cellKm;
  const n0 = reliefNoise(column / s0 + 0.4, row / s0 + 1.7, 101);
  const n1 = reliefNoise(column / s1 + 2.1, row / s1 + 0.3, 109);
  return ((n0 - 0.5) * 0.62 + (n1 - 0.5) * 0.38) * SMOOTH_LAND.mudLuma;
}

function landOccupancyAt(column, row) {
  if (row < 0 || row >= ROWS) return 0;
  const c = wrapC(column);
  const { lat, lon } = cellToLatLon(c, row);
  if (isCanalWater(lat, lon)) return 0;
  return isLandCell(c, row) ? 1 : 0;
}

function boxBlurSeparable(src, radius) {
  const out = new Float32Array(N);
  const tmp = new Float32Array(N);
  const w = radius * 2 + 1;
  for (let row = 0; row < ROWS; row += 1) {
    const base = row * COLS;
    let acc = 0;
    for (let k = -radius; k <= radius; k += 1) acc += src[base + wrapC(k)];
    for (let column = 0; column < COLS; column += 1) {
      tmp[base + column] = acc / w;
      acc += src[base + wrapC(column + radius + 1)] - src[base + wrapC(column - radius)];
    }
  }
  for (let column = 0; column < COLS; column += 1) {
    let acc = 0;
    for (let k = -radius; k <= radius; k += 1) {
      const r = Math.max(0, Math.min(ROWS - 1, k));
      acc += tmp[r * COLS + column];
    }
    for (let row = 0; row < ROWS; row += 1) {
      out[row * COLS + column] = acc / w;
      const add = Math.max(0, Math.min(ROWS - 1, row + radius + 1));
      const sub = Math.max(0, Math.min(ROWS - 1, row - radius));
      acc += tmp[add * COLS + column] - tmp[sub * COLS + column];
    }
  }
  return out;
}

function fillEnclosedLakes(raw, maxSize) {
  const id = new Int32Array(N).fill(-1);
  const sizes = [];
  const stack = [];
  let next = 0;
  for (let i = 0; i < N; i += 1) {
    if (raw[i] || id[i] >= 0) continue;
    const cid = next;
    next += 1;
    let size = 0;
    stack.length = 0;
    stack.push(i);
    id[i] = cid;
    while (stack.length) {
      const cur = stack.pop();
      size += 1;
      const row = Math.floor(cur / COLS);
      const column = cur - row * COLS;
      const nbrs = [
        row * COLS + wrapC(column + 1),
        row * COLS + wrapC(column - 1),
        row > 0 ? (row - 1) * COLS + column : -1,
        row < ROWS - 1 ? (row + 1) * COLS + column : -1,
      ];
      for (const n of nbrs) {
        if (n < 0 || raw[n] || id[n] >= 0) continue;
        id[n] = cid;
        stack.push(n);
      }
    }
    sizes[cid] = size;
  }
  let ocean = 0;
  for (let i = 1; i < sizes.length; i += 1) {
    if (sizes[i] > sizes[ocean]) ocean = i;
  }
  let filled = 0;
  for (let i = 0; i < N; i += 1) {
    if (raw[i]) continue;
    const cid = id[i];
    if (cid === ocean) continue;
    if ((sizes[cid] ?? 0) <= maxSize) {
      raw[i] = 1;
      filled += 1;
    }
  }
  return filled;
}

function dropTinyFragments(raw, minCells) {
  const id = new Int32Array(N).fill(-1);
  const sizes = [];
  const stack = [];
  let next = 0;
  for (let i = 0; i < N; i += 1) {
    if (!raw[i] || id[i] >= 0) continue;
    const cid = next;
    next += 1;
    let size = 0;
    stack.length = 0;
    stack.push(i);
    id[i] = cid;
    while (stack.length) {
      const cur = stack.pop();
      size += 1;
      const row = Math.floor(cur / COLS);
      const column = cur - row * COLS;
      const nbrs = [
        row * COLS + wrapC(column + 1),
        row * COLS + wrapC(column - 1),
        row > 0 ? (row - 1) * COLS + column : -1,
        row < ROWS - 1 ? (row + 1) * COLS + column : -1,
      ];
      for (const n of nbrs) {
        if (n < 0 || !raw[n] || id[n] >= 0) continue;
        id[n] = cid;
        stack.push(n);
      }
    }
    sizes[cid] = size;
  }
  const keep = new Uint8Array(sizes.length);
  for (let cid = 0; cid < sizes.length; cid += 1) {
    if (sizes[cid] >= minCells) keep[cid] = 1;
  }
  for (let i = 0; i < N; i += 1) {
    const cid = id[i];
    if (cid < 0 || keep[cid]) continue;
    const row = Math.floor(i / COLS);
    const column = i - row * COLS;
    const { lat, lon } = cellToLatLon(column, row);
    if (isNamedIsland(lat, lon)) keep[cid] = 1;
  }
  let dropped = 0;
  for (let i = 0; i < N; i += 1) {
    if (!raw[i]) continue;
    const cid = id[i];
    if (cid >= 0 && !keep[cid]) {
      raw[i] = 0;
      dropped += 1;
    }
  }
  return dropped;
}

function filledOccupancy() {
  if (rawFilled) return rawFilled;
  const raw = new Float32Array(N);
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLS; column += 1) {
      raw[row * COLS + column] = landOccupancyAt(column, row);
    }
  }
  fillEnclosedLakes(raw, SMOOTH_LAND.lakeFillMax);
  dropTinyFragments(raw, SMOOTH_LAND.minFragmentCells);
  rawFilled = raw;
  return rawFilled;
}

function occupancyField() {
  if (occField) return occField;
  occField = boxBlurSeparable(filledOccupancy(), 1);
  return occField;
}

function heightFromOccupancy() {
  if (heightField) return heightField;
  const occR2 = boxBlurSeparable(filledOccupancy(), SMOOTH_LAND.heightBlurRadius);
  const out = new Float32Array(N);
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLS; column += 1) {
      const i = row * COLS + column;
      const occ = occR2[i];
      if (occ <= 0.08) {
        out[i] = 0;
        continue;
      }
      const alt = landAltitudeAt(column, row);
      const inland = inlandDistanceCells()[i] ?? 0;
      const plateau = occ >= 0.48 ? 1 : (occ > 0.28 ? (occ - 0.28) / 0.20 : 0);
      const t = Math.min(1, inland / 10);
      out[i] = plateau * (0.06 + t * (0.14 + 0.80 * alt));
    }
  }
  heightField = out;
  return heightField;
}

function sampleField(field, u, v) {
  const x = ((u % COLS) + COLS) % COLS;
  const y = Math.max(0, Math.min(ROWS - 1, v));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = wrapC(x0 + 1);
  const y1 = Math.min(ROWS - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = field[y0 * COLS + x0];
  const b = field[y0 * COLS + x1];
  const c = field[y1 * COLS + x0];
  const d = field[y1 * COLS + x1];
  const top = a + ((b - a) * fx);
  const bot = c + ((d - c) * fx);
  return top + ((bot - top) * fy);
}

export function occupancyAt(column, row) {
  return occupancyField()[Math.max(0, Math.min(ROWS - 1, row)) * COLS + wrapC(column)];
}

export function blurredHeightAt(column, row) {
  return heightFromOccupancy()[Math.max(0, Math.min(ROWS - 1, row)) * COLS + wrapC(column)];
}

function forestAmountAt(column, row, lat, alt, dry = 0, lon = cellToLatLon(column, row).lon) {
  // Sample the patch field on the sphere, keeping the date line and poles joined.
  const p = latLonToVector(lat, lon, 1);
  const scale = COLS / (Math.PI * 2 * SMOOTH_LAND.forestPatchCells);
  const forest = reliefNoise((p.x + p.z * .7) * scale + .6, p.y * scale + 1.1, 61);
  const belt = reliefNoise((p.x + p.z * .7) * scale / 2.4 + 2.2, p.y * scale / 2.4, 73);
  return forestInfluence({ lat, alt, dry, forest, belt, uplandAt: LAND_SURFACE.uplandAt });
}

/** Continuous climate paint + mid-frequency ridges/forests + key-facing slope. */
export function biomeColorAt(column, row, lat, lon) {
  const abs = Math.abs(lat);
  const climatePoint = latLonToVector(lat, lon, 1);
  const continent = reliefNoise(climatePoint.x * 2 + climatePoint.z, climatePoint.y * 2, 13);
  const belt = reliefNoise(climatePoint.x * 3 + climatePoint.z + 2.1, climatePoint.y * 3 + .7, 29);
  const inland = inlandDistanceCells()[Math.max(0, Math.min(ROWS - 1, row)) * COLS + wrapC(column)] ?? 0;
  const inlandN = Math.min(1, inland / 7);
  const inlandS = inlandN * inlandN * inlandN;
  // Dry subtropical interiors; distance inland alone must not desertify Eurasia.
  const dryBelt = Math.exp(-(((abs - 26) / 12) ** 2));
  const dry = Math.max(0, Math.min(1, inlandS * dryBelt * 0.88 + continent * 0.08 + belt * 0.04));
  let colour = climateColorAt(lat, lon, dry, LAND_BIOMES);
  const alt = landOccupancyAt(column, row) ? landAltitudeAt(column, row) : 0;
  if (alt >= 0.55) {
    const ridge = Math.min(1, (alt - 0.55) / 0.45);
    colour = mixHex(colour, mixHex(0x8a7a58, LAND_BIOMES.ridge, ridge), ridge * 0.34);
  }
  const forest = forestAmountAt(column, row, lat, alt, dry, lon);
  if (forest > 0) {
    const canopy = canopyColorAt(lat, lon, LAND_BIOMES);
    colour = mixHex(colour, shiftLuma(canopy, -10), forest);
  }
  const mottle = reliefNoise(column / 4.2 + 1.3, row / 4.2 + 2.8, 47);
  const lumaShift = (mottle - 0.5) * SMOOTH_LAND.mottleLuma;
  colour = shiftLuma(colour, lumaShift);
  const east = blurredHeightAt(column + 1, row) - blurredHeightAt(column - 1, row);
  const north = blurredHeightAt(column, row - 1) - blurredHeightAt(column, row + 1);
  const facing = Math.max(-1, Math.min(1, east * -2.8 + north * 1.9));
  const { x, y, z } = latLonToVector(lat, lon, 1);
  const nrm = heightNormalAt(heightFromOccupancy(), column + 0.5, row + 0.5, x, y, z);
  const ndotl = Math.max(0, nrm[0] * KEY_DIR[0] + nrm[1] * KEY_DIR[1] + nrm[2] * KEY_DIR[2]);
  const occEast = occupancyAt(column + 1, row) - occupancyAt(column - 1, row);
  const occNorth = occupancyAt(column, row - 1) - occupancyAt(column, row + 1);
  const occSteep = Math.min(1, Math.hypot(occEast, occNorth) * 6.2);
  const flank = alt >= 0.55 ? 0.16 : 0.09;
  const slope = Math.max(0.82, Math.min(1.08, 1.01 - occSteep * 0.18 + facing * flank + alt * 0.04 + (ndotl - 0.5) * 0.02));
  const occH = occupancyAt(column, row);
  const rim = 1 - Math.max(0, Math.min(1, (0.58 - occH) / 0.12)) * 0.18;
  const r = Math.min(255, Math.round(((colour >> 16) & 255) * slope * rim));
  const g = Math.min(255, Math.round(((colour >> 8) & 255) * slope * rim));
  const b = Math.min(255, Math.round((colour & 255) * slope * rim));
  return (r << 16) | (g << 8) | b;
}

function uvToLatLon(u, v) {
  const lon = (u / COLS) * 360 - 180;
  const lat = 90 - (v / ROWS) * 180;
  return { lat, lon };
}

function lerpT(a, b, iso) {
  const d = b - a;
  if (Math.abs(d) < 1e-8) return 0.5;
  return Math.max(0, Math.min(1, (iso - a) / d));
}

function vertexKey(kind, a, b, c, d) {
  if (kind === 'c') return `c:${a}:${b}`;
  if (a < c || (a === c && b < d)) return `e:${a}:${b}:${c}:${d}`;
  return `e:${c}:${d}:${a}:${b}`;
}

function addVertex(store, key, u, v) {
  const existing = store.map.get(key);
  if (existing !== undefined) return existing;
  const index = store.u.length;
  store.map.set(key, index);
  store.u.push(u);
  store.v.push(v);
  return index;
}

function fanTriangles(poly, indices) {
  if (poly.length < 3) return;
  for (let i = 1; i < poly.length - 1; i += 1) {
    indices.push(poly[0], poly[i], poly[i + 1]);
  }
}

function polygonizeSquare(field, store, indices, column, row) {
  const c1 = wrapC(column + 1);
  const r1 = row + 1;
  if (r1 >= ROWS) return;
  const v0 = field[row * COLS + column];
  const v1 = field[row * COLS + c1];
  const v2 = field[r1 * COLS + c1];
  const v3 = field[r1 * COLS + column];
  const inside = (v0 >= ISO ? 1 : 0)
    | (v1 >= ISO ? 2 : 0)
    | (v2 >= ISO ? 4 : 0)
    | (v3 >= ISO ? 8 : 0);
  if (inside === 0) return;
  const corners = [
    [column, row, v0],
    [c1, row, v1],
    [c1, r1, v2],
    [column, r1, v3],
  ];
  const poly = [];
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    const [ci, ri, vi] = corners[i];
    const [cj, rj, vj] = corners[j];
    if (vi >= ISO) {
      poly.push(addVertex(store, vertexKey('c', ci, ri), ci + 0.5, ri + 0.5));
    }
    if ((vi >= ISO) !== (vj >= ISO)) {
      const t = lerpT(vi, vj, ISO);
      const u = (ci + 0.5) + ((cj + 0.5) - (ci + 0.5)) * t;
      const v = (ri + 0.5) + ((rj + 0.5) - (ri + 0.5)) * t;
      poly.push(addVertex(store, vertexKey('e', ci, ri, cj, rj), u, v));
    }
  }
  fanTriangles(poly, indices);
}

function laplacianSmooth(store, indices, passes) {
  const count = store.u.length;
  const adj = Array.from({ length: count }, () => new Set());
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i];
    const b = indices[i + 1];
    const c = indices[i + 2];
    adj[a].add(b); adj[a].add(c);
    adj[b].add(a); adj[b].add(c);
    adj[c].add(a); adj[c].add(b);
  }
  const field = occupancyField();
  const nu = new Float32Array(count);
  const nv = new Float32Array(count);
  for (let pass = 0; pass < passes; pass += 1) {
    for (let i = 0; i < count; i += 1) {
      const nbrs = adj[i];
      if (!nbrs.size) {
        nu[i] = store.u[i];
        nv[i] = store.v[i];
        continue;
      }
      let su = 0;
      let sv = 0;
      for (const n of nbrs) {
        let du = store.u[n] - store.u[i];
        if (du > COLS * 0.5) du -= COLS;
        if (du < -COLS * 0.5) du += COLS;
        su += store.u[i] + du;
        sv += store.v[n];
      }
      const au = su / nbrs.size;
      const av = sv / nbrs.size;
      const occ = sampleField(field, store.u[i], store.v[i]);
      const lambda = occ > 0.62 && occ < 0.92 ? 0.85 : 0.35;
      nu[i] = store.u[i] + (au - store.u[i]) * lambda;
      nv[i] = store.v[i] + (av - store.v[i]) * lambda;
    }
    for (let i = 0; i < count; i += 1) {
      store.u[i] = ((nu[i] % COLS) + COLS) % COLS;
      store.v[i] = Math.max(0, Math.min(ROWS - 1, nv[i]));
    }
  }
  for (let i = 0; i < count; i += 1) {
    const occ = sampleField(field, store.u[i], store.v[i]);
    if (occ <= 0.22 || occ >= 0.92) continue;
    const gu = sampleField(field, store.u[i] + 0.6, store.v[i])
      - sampleField(field, store.u[i] - 0.6, store.v[i]);
    const gv = sampleField(field, store.u[i], store.v[i] + 0.6)
      - sampleField(field, store.u[i], store.v[i] - 0.6);
    const g2 = gu * gu + gv * gv;
    if (g2 < 1e-8) continue;
    const step = (occ - ISO) / g2;
    store.u[i] = ((store.u[i] - gu * step) % COLS + COLS) % COLS;
    store.v[i] = Math.max(0, Math.min(ROWS - 1, store.v[i] - gv * step));
  }
  return adj;
}

function weldStore(store, indices, eps = SMOOTH_LAND.weldCellEps) {
  const q = 1 / Math.max(1e-4, eps);
  const wrapQ = Math.round(COLS * q);
  const map = new Map();
  const remap = new Int32Array(store.u.length);
  const nu = [];
  const nv = [];
  for (let i = 0; i < store.u.length; i += 1) {
    const uq = ((Math.round(store.u[i] * q) % wrapQ) + wrapQ) % wrapQ;
    const vq = Math.round(store.v[i] * q);
    const key = `${uq}:${vq}`;
    let idx = map.get(key);
    if (idx === undefined) {
      idx = nu.length;
      map.set(key, idx);
      nu.push(store.u[i]);
      nv.push(store.v[i]);
    }
    remap[i] = idx;
  }
  const nidx = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = remap[indices[i]];
    const b = remap[indices[i + 1]];
    const c = remap[indices[i + 2]];
    if (a === b || b === c || c === a) continue;
    nidx.push(a, b, c);
  }
  store.u = nu;
  store.v = nv;
  indices.length = 0;
  for (let i = 0; i < nidx.length; i += 1) indices.push(nidx[i]);
  return { before: remap.length, after: nu.length };
}

function boundaryEdges(indices) {
  const seen = new Map();
  const keyOf = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (let i = 0; i < indices.length; i += 3) {
    const tri = [indices[i], indices[i + 1], indices[i + 2]];
    for (let e = 0; e < 3; e += 1) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      const k = keyOf(a, b);
      if (seen.has(k)) seen.delete(k);
      else seen.set(k, [a, b]);
    }
  }
  return [...seen.values()];
}

export function coastTurningShare(edges, u, v) {
  const nbrs = new Map();
  for (const [a, b] of edges) {
    if (!nbrs.has(a)) nbrs.set(a, []);
    if (!nbrs.has(b)) nbrs.set(b, []);
    nbrs.get(a).push(b);
    nbrs.get(b).push(a);
  }
  let turns = 0;
  let right = 0;
  const toRad = Math.PI / 180;
  const target = SMOOTH_LAND.rightAngleDeg * toRad;
  const tol = SMOOTH_LAND.rightAngleTolDeg * toRad;
  for (const [vert, list] of nbrs) {
    if (list.length !== 2) continue;
    const [n0, n1] = list;
    let du0 = u[n0] - u[vert];
    let du1 = u[n1] - u[vert];
    if (du0 > COLS * 0.5) du0 -= COLS;
    if (du0 < -COLS * 0.5) du0 += COLS;
    if (du1 > COLS * 0.5) du1 -= COLS;
    if (du1 < -COLS * 0.5) du1 += COLS;
    const a0 = Math.hypot(du0, v[n0] - v[vert]) || 1;
    const a1 = Math.hypot(du1, v[n1] - v[vert]) || 1;
    const dot = ((du0 / a0) * (du1 / a1)) + (((v[n0] - v[vert]) / a0) * ((v[n1] - v[vert]) / a1));
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    turns += 1;
    if (Math.abs(angle - target) <= tol) right += 1;
  }
  return { turns, right, share: turns ? right / turns : 0 };
}

function connectedContinents(rawOcc) {
  const id = new Int32Array(N).fill(-1);
  const sizes = [];
  let next = 0;
  const stack = [];
  for (let i = 0; i < N; i += 1) {
    if (!rawOcc[i] || id[i] >= 0) continue;
    const cid = next;
    next += 1;
    let size = 0;
    stack.length = 0;
    stack.push(i);
    id[i] = cid;
    while (stack.length) {
      const cur = stack.pop();
      size += 1;
      const row = Math.floor(cur / COLS);
      const column = cur - row * COLS;
      const nbrs = [
        row * COLS + wrapC(column + 1),
        row * COLS + wrapC(column - 1),
        row > 0 ? (row - 1) * COLS + column : -1,
        row < ROWS - 1 ? (row + 1) * COLS + column : -1,
      ];
      for (const n of nbrs) {
        if (n < 0 || !rawOcc[n] || id[n] >= 0) continue;
        id[n] = cid;
        stack.push(n);
      }
    }
    sizes[cid] = size;
  }
  return { id, sizes };
}

function drainageRivers() {
  const height = heightFromOccupancy();
  const raw = new Uint8Array(N);
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLS; column += 1) {
      raw[row * COLS + column] = landOccupancyAt(column, row);
    }
  }
  const continents = connectedContinents(raw);
  const down = new Int32Array(N).fill(-1);
  const order = [];
  for (let row = 1; row < ROWS - 1; row += 1) {
    for (let column = 0; column < COLS; column += 1) {
      const i = row * COLS + column;
      if (!raw[i]) continue;
      order.push(i);
      let best = i;
      let bestH = height[i];
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (!dc && !dr) continue;
          const nr = row + dr;
          const nc = wrapC(column + dc);
          const ni = nr * COLS + nc;
          if (!raw[ni]) {
            if (height[i] < bestH + 0.02) {
              best = -1;
              bestH = -1;
            }
            continue;
          }
          if (height[ni] < bestH) {
            bestH = height[ni];
            best = ni;
          }
        }
      }
      down[i] = best === i ? -1 : best;
    }
  }
  order.sort((a, b) => height[b] - height[a]);
  const acc = new Float32Array(N);
  for (const i of order) acc[i] = 1;
  for (const i of order) {
    const nxt = down[i];
    if (nxt >= 0) acc[nxt] += acc[i];
  }
  const riverCells = [];
  for (const i of order) {
    const cid = continents.id[i];
    if (cid < 0) continue;
    if ((continents.sizes[cid] ?? 0) < SMOOTH_LAND.riverContinentMin) continue;
    if (acc[i] >= SMOOTH_LAND.riverAccMin && down[i] >= 0) riverCells.push(i);
  }
  const segments = [];
  for (const i of riverCells) {
    const nxt = down[i];
    if (nxt < 0) continue;
    const r0 = Math.floor(i / COLS);
    const c0 = i - r0 * COLS;
    const r1 = Math.floor(nxt / COLS);
    const c1 = nxt - r1 * COLS;
    segments.push([c0 + 0.5, r0 + 0.5, c1 + 0.5, r1 + 0.5]);
  }
  return { riverCells, segments, count: riverCells.length };
}

function heightNormalAt(height, u, v, px, py, pz) {
  const hL = sampleField(height, u - 1, v);
  const hR = sampleField(height, u + 1, v);
  const hS = sampleField(height, u, v + 1);
  const hN = sampleField(height, u, v - 1);
  const dhdu = (hR - hL) * 0.5;
  const dhdv = (hS - hN) * 0.5;
  const len = Math.hypot(px, py, pz) || 1;
  const rx = px / len;
  const ry = py / len;
  const rz = pz / len;
  let ecx = rz;
  let ecy = 0;
  let ecz = -rx;
  let el = Math.hypot(ecx, ecy, ecz);
  if (el < 1e-5) {
    ecx = 1;
    ecy = 0;
    ecz = 0;
    el = 1;
  } else {
    ecx /= el;
    ecy /= el;
    ecz /= el;
  }
  const ncx = ry * ecz - rz * ecy;
  const ncy = rz * ecx - rx * ecz;
  const ncz = rx * ecy - ry * ecx;
  const gain = SMOOTH_LAND.normalGain;
  const nx = rx - ecx * dhdu * gain - ncx * dhdv * gain;
  const ny = ry - ecy * dhdu * gain - ncy * dhdv * gain;
  const nz = rz - ecz * dhdu * gain - ncz * dhdv * gain;
  const nl = Math.hypot(nx, ny, nz) || 1;
  return [nx / nl, ny / nl, nz / nl];
}

function projectStore(store, rivers) {
  const height = heightFromOccupancy();
  const occ = occupancyField();
  const riverMark = new Uint8Array(N);
  for (const i of rivers.riverCells) riverMark[i] = 1;
  const count = store.u.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const u = store.u[i];
    const v = store.v[i];
    const { lat, lon } = uvToLatLon(u, v);
    const relief = sampleField(height, u, v);
    const occS = sampleField(occ, u, v);
    const plateau = occS * occS * (3 - 2 * occS);
    const lift = LAND_HEIGHT * (0.18 + plateau * (0.22 + relief * 0.92));
    const radius = GLOBE_RADIUS + 0.006 + lift;
    const p = latLonToVector(lat, lon, radius);
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
    const n = heightNormalAt(height, u, v, p.x, p.y, p.z);
    normals[i * 3] = n[0];
    normals[i * 3 + 1] = n[1];
    normals[i * 3 + 2] = n[2];
    const column = wrapC(Math.floor(u));
    const row = Math.max(0, Math.min(ROWS - 1, Math.floor(v)));
    let hex = biomeColorAt(column, row, lat, lon);
    // P21: keep the biome paint; the global ochre wash obscured every green.
    const altV = landOccupancyAt(column, row) ? landAltitudeAt(column, row) : 0;
    const inlandV = inlandDistanceCells()[row * COLS + column] ?? 0;
    const dryV = Math.min(1, inlandV / 7);
    const dryS = dryV * dryV * dryV;
    const forest = forestAmountAt(column, row, lat, altV, dryS, lon);
    if (forest > 0) {
      const canopy = canopyColorAt(lat, lon, LAND_BIOMES);
      hex = mixHex(hex, shiftLuma(canopy, -16), forest * 1.45);
    }
    const isRiver = riverMark[row * COLS + column];
    if (isRiver) hex = mixHex(hex, LAND_BIOMES.river, 0.72);
    const ndotl = Math.max(0.04, n[0] * KEY_DIR[0] + n[1] * KEY_DIR[1] + n[2] * KEY_DIR[2]);
    const east = sampleField(height, u + 1, v) - sampleField(height, u - 1, v);
    const north = sampleField(height, u, v - 1) - sampleField(height, u, v + 1);
    const facing = Math.max(-1, Math.min(1, east * -2.8 + north * 1.9));
    // P21-G1B: sphere lighting now follows the live warm key in the material.
    const shade = 0.96 + 0.035 * facing;
    let r = ((hex >> 16) & 255) / 255;
    let g = ((hex >> 8) & 255) / 255;
    let b = (hex & 255) / 255;
    const mean = (r + g + b) / 3;
    const contrast = 1; // P21: no second saturation pass over the painted palette.
    r = mean + ((r - mean) * contrast);
    g = mean + ((g - mean) * contrast);
    b = mean + ((b - mean) * contrast);
    if (altV >= 0.55) {
      const ridge = Math.min(1, (altV - 0.55) / 0.45);
      r += SMOOTH_LAND.ridgeLift * ridge;
      g += SMOOTH_LAND.ridgeLift * 0.88 * ridge;
      b += SMOOTH_LAND.ridgeLift * 0.64 * ridge;
    }
    if (forest > 0) {
      const drop = SMOOTH_LAND.forestDrop * Math.min(1, forest / 0.40);
      r -= drop;
      g -= drop * 0.62;
      b -= drop * 0.90;
    }
    if (isRiver) {
      r -= SMOOTH_LAND.lakeDrop;
      g -= SMOOTH_LAND.lakeDrop * 0.72;
      b -= SMOOTH_LAND.lakeDrop * 0.58;
    }
    const absLat = Math.abs(lat);
    const khaki = dryS > 0.28 && forest < 0.08 && altV < 0.55 && absLat < 62;
    if (khaki) {
      const mud = 0; // P21: remove screen-scale static from dry interiors.
      r += mud * 0.92;
      g += mud * 0.78;
      b += mud * 0.55;
    }
    r = Math.max(0, r) * shade;
    g = Math.max(0, g) * shade;
    b = Math.max(0, b) * shade;
    // P21: the palette is already authored in display space. The old filmic
    // lift bleached middle greens into grey and ochre into ivory.
    const lo = SMOOTH_LAND.displayLumaMin / 255;
    const hi = SMOOTH_LAND.displayLumaMax / 255;
    r = Math.min(hi, Math.max(lo, r));
    g = Math.min(hi, Math.max(lo, g));
    b = Math.min(hi, Math.max(lo, b));
    colors[i * 3] = srgbToLinear(r);
    colors[i * 3 + 1] = srgbToLinear(g);
    colors[i * 3 + 2] = srgbToLinear(b);
  }
  return { positions, colors, normals };
}

function shelfRibbon(edges, store) {
  const width = SMOOTH_LAND.shelfPx / SMOOTH_LAND.pxPerWorld;
  const fade = SMOOTH_LAND.shelfFadePx / SMOOTH_LAND.pxPerWorld;
  const field = occupancyField();
  const positions = [];
  const colors = [];
  const indices = [];
  const pale = [
    srgbToLinear(((LAND_BIOMES.coastRim >> 16) & 255) / 255),
    srgbToLinear(((LAND_BIOMES.coastRim >> 8) & 255) / 255),
    srgbToLinear((LAND_BIOMES.coastRim & 255) / 255),
  ];
  const outerShade = SMOOTH_LAND.shelfOuterShade;
  const push = (u, v, radius, shade) => {
    const { lat, lon } = uvToLatLon(u, v);
    const p = latLonToVector(lat, lon, radius);
    positions.push(p.x, p.y, p.z);
    colors.push(pale[0] * shade, pale[1] * shade, pale[2] * shade);
    return (positions.length / 3) - 1;
  };
  for (const [a, b] of edges) {
    const u0 = store.u[a];
    const v0 = store.v[a];
    const u1 = store.u[b];
    const v1 = store.v[b];
    let du = u1 - u0;
    if (du > COLS * 0.5) du -= COLS;
    if (du < -COLS * 0.5) du += COLS;
    const dv = v1 - v0;
    const len = Math.hypot(du, dv) || 1;
    let nu = -dv / len;
    let nv = du / len;
    const midU = (u0 + du * 0.5 + COLS) % COLS;
    const midV = v0 + dv * 0.5;
    if (sampleField(field, midU + nu * 0.4, midV + nv * 0.4)
      > sampleField(field, midU - nu * 0.4, midV - nv * 0.4)) {
      nu = -nu;
      nv = -nv;
    }
    const n0 = reliefNoise(u0 * 0.18 + 3.1, v0 * 0.18, 127);
    const n1 = reliefNoise(u1 * 0.18 + 3.1, v1 * 0.18, 127);
    const w0 = fade * (0.78 + n0 * 0.44);
    const w1 = fade * (0.78 + n1 * 0.44);
    const rInner = GLOBE_RADIUS + 0.0042;
    const rOuter = GLOBE_RADIUS + 0.0024;
    const rBand = GLOBE_RADIUS + 0.0016;
    const i0 = push(u0, v0, rInner, 1);
    const i1 = push(u1, v1, rInner, 1);
    const i2 = push(u1 + nu * width, v1 + nv * width, rOuter, 0.92);
    const i3 = push(u0 + nu * width, v0 + nv * width, rOuter, 0.92);
    indices.push(i0, i1, i2, i0, i2, i3);
    const i4 = push(u0 + nu * width, v0 + nv * width, rOuter, outerShade);
    const i5 = push(u1 + nu * width, v1 + nv * width, rOuter, outerShade);
    const i6 = push(u1 + nu * w1, v1 + nv * w1, rBand, outerShade);
    const i7 = push(u0 + nu * w0, v0 + nv * w0, rBand, outerShade);
    indices.push(i4, i5, i6, i4, i6, i7);
  }
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
  };
}

function riverLines(segments) {
  const positions = [];
  for (const [u0, v0, u1, v1] of segments) {
    const a = uvToLatLon(u0, v0);
    const b = uvToLatLon(u1, v1);
    const pa = latLonToVector(a.lat, a.lon, GLOBE_RADIUS + 0.011);
    const pb = latLonToVector(b.lat, b.lon, GLOBE_RADIUS + 0.011);
    positions.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
  }
  return { positions: new Float32Array(positions), count: segments.length };
}

export function laplacianEnergyAt(colorFn, window = null) {
  const lat0 = window?.lat0 ?? -90;
  const lat1 = window?.lat1 ?? 90;
  const lon0 = window?.lon0 ?? -180;
  const lon1 = window?.lon1 ?? 180;
  const luma = new Float32Array(N);
  const mask = new Uint8Array(N);
  for (let row = 0; row < ROWS; row += 1) {
    const { lat } = cellToLatLon(0, row);
    if (lat < lat0 || lat > lat1) continue;
    for (let column = 0; column < COLS; column += 1) {
      if (!landOccupancyAt(column, row)) continue;
      const { lon } = cellToLatLon(column, row);
      if (lon < lon0 || lon > lon1) continue;
      const hex = colorFn(column, row, lat, lon);
      luma[row * COLS + column] = lumaOf(hex);
      mask[row * COLS + column] = 1;
    }
  }
  let sum = 0;
  let n = 0;
  for (let row = 1; row < ROWS - 1; row += 1) {
    for (let column = 0; column < COLS; column += 1) {
      const i = row * COLS + column;
      if (!mask[i]) continue;
      const l = 4 * luma[i]
        - luma[row * COLS + wrapC(column + 1)]
        - luma[row * COLS + wrapC(column - 1)]
        - luma[(row + 1) * COLS + column]
        - luma[(row - 1) * COLS + column];
      sum += l * l;
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

export function occupancySilhouetteIoU() {
  occupancyField();
  let inter = 0;
  let union = 0;
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLS; column += 1) {
      const a = landOccupancyAt(column, row);
      const b = occupancyAt(column, row) >= ISO ? 1 : 0;
      if (a || b) union += 1;
      if (a && b) inter += 1;
    }
  }
  return union ? inter / union : 1;
}

export function mountainFlankLumaRange(window = null) {
  const lat0 = window?.lat0 ?? -90;
  const lat1 = window?.lat1 ?? 90;
  const lon0 = window?.lon0 ?? -180;
  const lon1 = window?.lon1 ?? 180;
  let minL = 255;
  let maxL = 0;
  let n = 0;
  for (let row = 1; row < ROWS - 1; row += 1) {
    const { lat } = cellToLatLon(0, row);
    if (lat < lat0 || lat > lat1) continue;
    for (let column = 0; column < COLS; column += 1) {
      if (!landOccupancyAt(column, row)) continue;
      const { lon } = cellToLatLon(column, row);
      if (lon < lon0 || lon > lon1) continue;
      const alt = landAltitudeAt(column, row);
      if (alt < LAND_SURFACE.uplandAt) continue;
      const east = blurredHeightAt(column + 1, row) - blurredHeightAt(column - 1, row);
      const north = blurredHeightAt(column, row - 1) - blurredHeightAt(column, row + 1);
      if (Math.hypot(east, north) < 0.012) continue;
      const hex = biomeColorAt(column, row, lat, lon);
      const l = lumaOf(hex);
      if (l < minL) minL = l;
      if (l > maxL) maxL = l;
      n += 1;
    }
  }
  return { min: minL, max: maxL, range: n ? maxL - minL : 0, n };
}

export function forestPatchStats(window = null) {
  const lat0 = window?.lat0 ?? -90;
  const lat1 = window?.lat1 ?? 90;
  const lon0 = window?.lon0 ?? -180;
  const lon1 = window?.lon1 ?? 180;
  const mark = new Uint8Array(N);
  let marked = 0;
  for (let row = 0; row < ROWS; row += 1) {
    const { lat } = cellToLatLon(0, row);
    if (lat < lat0 || lat > lat1) continue;
    for (let column = 0; column < COLS; column += 1) {
      if (!landOccupancyAt(column, row)) continue;
      const { lon } = cellToLatLon(column, row);
      if (lon < lon0 || lon > lon1) continue;
      const alt = landAltitudeAt(column, row);
      const inland = inlandDistanceCells()[row * COLS + wrapC(column)] ?? 0;
      const inlandN = Math.min(1, inland / 7);
      const dry = inlandN * inlandN * inlandN;
      if (forestAmountAt(column, row, lat, alt, dry) > 0.18) {
        mark[row * COLS + column] = 1;
        marked += 1;
      }
    }
  }
  let largest = 0;
  const seen = new Uint8Array(N);
  const stack = [];
  for (let i = 0; i < N; i += 1) {
    if (!mark[i] || seen[i]) continue;
    let size = 0;
    stack.length = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const cur = stack.pop();
      size += 1;
      const row = Math.floor(cur / COLS);
      const column = cur - row * COLS;
      const nbrs = [
        row * COLS + wrapC(column + 1),
        row * COLS + wrapC(column - 1),
        row > 0 ? (row - 1) * COLS + column : -1,
        row < ROWS - 1 ? (row + 1) * COLS + column : -1,
      ];
      for (const n of nbrs) {
        if (n < 0 || !mark[n] || seen[n]) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    if (size > largest) largest = size;
  }
  return {
    marked,
    largest,
    largestKm: largest * SMOOTH_LAND.cellKm,
    cellKm: SMOOTH_LAND.cellKm,
    patchCells: SMOOTH_LAND.forestPatchCells,
  };
}

export function islandHeightSpan(maxCells = 80) {
  const raw = filledOccupancy();
  const id = new Int32Array(N).fill(-1);
  const sizes = [];
  const stack = [];
  let next = 0;
  for (let i = 0; i < N; i += 1) {
    if (!raw[i] || id[i] >= 0) continue;
    const cid = next;
    next += 1;
    let size = 0;
    stack.length = 0;
    stack.push(i);
    id[i] = cid;
    while (stack.length) {
      const cur = stack.pop();
      size += 1;
      const row = Math.floor(cur / COLS);
      const column = cur - row * COLS;
      const nbrs = [
        row * COLS + wrapC(column + 1),
        row * COLS + wrapC(column - 1),
        row > 0 ? (row - 1) * COLS + column : -1,
        row < ROWS - 1 ? (row + 1) * COLS + column : -1,
      ];
      for (const n of nbrs) {
        if (n < 0 || !raw[n] || id[n] >= 0) continue;
        id[n] = cid;
        stack.push(n);
      }
    }
    sizes[cid] = size;
  }
  let worst = 0;
  for (let cid = 0; cid < sizes.length; cid += 1) {
    if (sizes[cid] < 4 || sizes[cid] > maxCells) continue;
    let hMin = 1;
    let hMax = 0;
    for (let i = 0; i < N; i += 1) {
      if (id[i] !== cid) continue;
      const row = Math.floor(i / COLS);
      const column = i - row * COLS;
      const h = blurredHeightAt(column, row);
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
    }
    const span = hMax - hMin;
    if (span > worst) worst = span;
  }
  return worst;
}

export function buildSmoothLand() {
  if (built) return built;
  const field = occupancyField();
  heightFromOccupancy();
  const store = { map: new Map(), u: [], v: [] };
  const indices = [];
  for (let row = 0; row < ROWS - 1; row += 1) {
    for (let column = 0; column < COLS; column += 1) {
      polygonizeSquare(field, store, indices, column, row);
    }
  }
  laplacianSmooth(store, indices, SMOOTH_LAND.laplacianPasses);
  const weld = weldStore(store, indices);
  const edges = boundaryEdges(indices);
  const turning = coastTurningShare(edges, store.u, store.v);
  const rivers = drainageRivers();
  const mesh = projectStore(store, rivers);
  // P21: the UV lattice points south, so most projected faces wound inward.
  // Orient every triangle against the radial normal (including seam cells).
  // Otherwise the opaque ocean hides the back-culled land and only the shelf
  // paint remains visible, disguising the missing continents.
  const p = mesh.positions;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const outward = (uy * vz - uz * vy) * p[a]
      + (uz * vx - ux * vz) * p[a + 1] + (ux * vy - uy * vx) * p[a + 2];
    if (outward < 0) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  }
  built = {
    positions: mesh.positions,
    colors: mesh.colors,
    normals: mesh.normals,
    indices: Uint32Array.from(indices),
    vertexCount: store.u.length,
    triangleCount: indices.length / 3,
    coastEdges: edges.length,
    turning,
    weld,
    shelf: shelfRibbon(edges, store),
    rivers: riverLines(rivers.segments),
    riverCount: rivers.count,
    u: Float32Array.from(store.u),
    v: Float32Array.from(store.v),
  };
  return built;
}

export function meshDisplayLumaStats(window = null) {
  const mesh = buildSmoothLand();
  const lat0 = window?.lat0 ?? -90;
  const lat1 = window?.lat1 ?? 90;
  const lon0 = window?.lon0 ?? -180;
  const lon1 = window?.lon1 ?? 180;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  let minL = 255;
  let maxL = 0;
  for (let i = 0; i < mesh.vertexCount; i += 1) {
    const { lat, lon } = uvToLatLon(mesh.u[i], mesh.v[i]);
    if (lat < lat0 || lat > lat1 || lon < lon0 || lon > lon1) continue;
    const r = linearToSrgb(mesh.colors[i * 3]) * 255;
    const g = linearToSrgb(mesh.colors[i * 3 + 1]) * 255;
    const b = linearToSrgb(mesh.colors[i * 3 + 2]) * 255;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += l;
    sumSq += l * l;
    n += 1;
    if (l < minL) minL = l;
    if (l > maxL) maxL = l;
  }
  const mean = n ? sum / n : 0;
  const std = n > 1 ? Math.sqrt(Math.max(0, sumSq / n - mean * mean)) : 0;
  return { n, mean, std, min: minL, max: maxL, range: n ? maxL - minL : 0 };
}

export function fragmentCensus() {
  const raw = filledOccupancy();
  const { id, sizes } = connectedContinents(raw);
  let tiny = 0;
  let namedKept = 0;
  for (let cid = 0; cid < sizes.length; cid += 1) {
    if (sizes[cid] >= SMOOTH_LAND.minFragmentCells) continue;
    tiny += 1;
    for (let i = 0; i < N; i += 1) {
      if (id[i] !== cid) continue;
      const row = Math.floor(i / COLS);
      const column = i - row * COLS;
      const { lat, lon } = cellToLatLon(column, row);
      if (isNamedIsland(lat, lon)) namedKept += 1;
      break;
    }
  }
  return { components: sizes.length, tinyRemaining: tiny, namedKept };
}

export function landFadeTarget(camZ) {
  const z = Number(camZ);
  if (!Number.isFinite(z)) return 0;
  if (z >= SMOOTH_LAND.yardZoomZ) return 0;
  const span = Math.max(0.2, SMOOTH_LAND.yardZoomZ - 2.15);
  return Math.max(0, Math.min(1, (SMOOTH_LAND.yardZoomZ - z) / span));
}

export function pinScaleForCamZ(camZ) {
  const z = Number.isFinite(camZ) ? camZ : SMOOTH_LAND.sightingCamZ;
  const distance = Math.max(0.45, z / SMOOTH_LAND.sightingCamZ);
  const raw = SMOOTH_LAND.pinSightingScale * (distance ** 0.72);
  return Math.min(0.75, Math.max(0.28, raw));
}

export function stepLandFade(current, target, dtMs, reducedMotion) {
  if (reducedMotion) return target;
  const k = Math.min(1, Math.max(0, (Number(dtMs) || 0) / SMOOTH_LAND.voxelFadeMs));
  return current + ((target - current) * k);
}
