// Tree family — four variants. Shared kit only.
// r6: leaf-CLUSTER skyline that dwarfs the swing. Dense + tall, not a puffier hat.
import {
  EXTRA, VOXEL_COLOURS, LEVEL_H,
  box, cyl, taper, wobble, boundsOf, crown, shrub,
} from './_kit.js';
import { spanOf, variantIndexOf } from '../../core/playground-builder.js';

const LEAF = [EXTRA.leafDeep, VOXEL_COLOURS.leaf, EXTRA.leafLight];

export function buildTree(group, entry, base) {
  const v = variantIndexOf(entry.variant);
  if (v === 1) return buildTreeGum(group, entry, base);
  if (v === 2) return buildTreeHedge(group, entry, base);
  if (v === 3) return buildTreeGrove(group, entry, base);
  return buildTreePlane(group, entry, base);
}

/** A limb: long axis is local Z, yawed then lifted. Centre sits on the bole. */
function limb(group, colour, cx, y, cz, az, pitch, len, r = 0.058) {
  box(group, colour, r, r, len,
    cx + Math.cos(az) * (len * 0.42),
    y + Math.sin(pitch) * (len * 0.28),
    cz + Math.sin(az) * (len * 0.42),
    { rough: 0.88, rot: [0, -az, pitch] });
}

function flares(group, cx, baseY, cz, salt, n = 3, reach = 0.13) {
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + salt * 0.2;
    box(group, VOXEL_COLOURS.timber, 0.12, 0.10, 0.22,
      cx + Math.cos(a) * reach, baseY + 0.08, cz + Math.sin(a) * reach,
      { rough: 0.88, rot: [0, -a, 0] });
  }
}

/**
 * One foliage clump. Plate-scale voxels, overlapped — r4's 5 cm tufts vanished.
 * r6 keeps the mass and packs it; thinning is the wrong move.
 */
function leafClump(group, cx, cy, cz, scale, salt, n = 13) {
  for (let i = 0; i < n; i += 1) {
    const w1 = wobble(salt, i, 11);
    const w2 = wobble(salt, i, 29);
    const w3 = wobble(salt, i, 47);
    const a = (i / n) * Math.PI * 2 + w1 * 1.7;
    const rr = scale * (0.05 + w3 * 0.20);
    const s = scale * (0.38 + w1 * 0.20);
    box(group, LEAF[i % 3],
      s * (1.16 + w2 * 0.36),
      s * (0.66 + w3 * 0.38),
      s * (1.16 + w1 * 0.36),
      cx + Math.cos(a) * rr,
      cy + (w2 - 0.40) * scale * 0.52,
      cz + Math.sin(a) * rr,
      { rough: 0.88, rot: [w2 * 0.70 - 0.35, a * 0.70, w3 * 0.56 - 0.28] });
  }
}

/** Extra overlapping voxels that close gaps between clumps. */
function leafFill(group, cx, cy, cz, spread, salt, n = 56) {
  const radius = spread * 0.5;
  for (let i = 0; i < n; i += 1) {
    const w1 = wobble(salt, i, 7);
    const w2 = wobble(salt, i, 19);
    const w3 = wobble(salt, i, 31);
    const a = (i / n) * Math.PI * 2 + w1 * 0.95;
    const rr = radius * (0.06 + w2 * 0.84);
    const s = 0.22 + w3 * 0.14;
    box(group, LEAF[i % 3],
      s * (1.16 + w1 * 0.34),
      s * (0.58 + w2 * 0.36),
      s * (1.16 + w3 * 0.34),
      cx + Math.cos(a) * rr,
      cy + (w1 - 0.38) * radius * 0.78,
      cz + Math.sin(a) * rr,
      { rough: 0.88, rot: [w2 * 0.62 - 0.31, a * 0.66, w3 * 0.50 - 0.25] });
  }
}

/**
 * Irregular leaf-cluster with vertical bulk. `spread` is crown diameter in metres.
 * Three layers (skirt / body / cap) so the mass is a wood, not a lollipop disk.
 * `holes` skip azimuths on the body only — two adjacent = one sky window.
 */
function leafCanopy(group, cx, cy, cz, spread, salt, opts = {}) {
  const layers = opts.layers ?? 3;
  const perLayer = opts.count ?? 16;
  const clump = opts.clump ?? 0.72;
  const holes = opts.holes ?? [];
  const core = opts.core ?? 0;
  const nPer = opts.nPer ?? 13;
  const rise = opts.rise ?? 0.78;
  const flat = opts.flat ?? 1.12;
  const radius = spread * 0.5;
  if (core > 0) crown(group, cx, cy, cz, core, salt);
  for (let layer = 0; layer < layers; layer += 1) {
    const t = layers === 1 ? 0.5 : layer / (layers - 1);
    const layerRad = radius * (1.04 - t * 0.30);
    const ly = cy + (t - 0.22) * rise * (layers - 1) * flat;
    const layerClump = clump * (0.90 + t * 0.18);
    const n = perLayer - (layer === layers - 1 ? 2 : 0);
    for (let i = 0; i < n; i += 1) {
      if (layer === 1 && holes.includes(i)) continue;
      const w1 = wobble(salt, layer * 31 + i + 3, 13);
      const w2 = wobble(salt, layer * 31 + i + 3, 37);
      const w3 = wobble(salt, layer * 31 + i + 3, 53);
      const a = (i / n) * Math.PI * 2 + w1 * 0.70 + salt * 0.04 + layer * 0.22;
      const ringT = (i % 5 === 0)
        ? 0.10 + w1 * 0.16
        : 0.40 + (i % 7) * 0.07 + w2 * 0.10;
      const rr = layerRad * Math.min(0.98, ringT);
      const yOff = (w3 - 0.42) * layerRad * 0.42;
      const drop = (layer === 0 && i % 6 === 4) ? layerRad * 0.36 : 0;
      leafClump(
        group,
        cx + Math.cos(a) * rr,
        ly + yOff - drop,
        cz + Math.sin(a) * rr,
        layerClump * (0.80 + w1 * 0.34),
        salt + layer * 53 + i * 17,
        nPer,
      );
    }
  }
  leafFill(group, cx, cy, cz, spread, salt + 91, opts.fill ?? 56);
  leafFill(group, cx, cy + rise * 0.70, cz, spread * 0.70, salt + 107, Math.round((opts.fill ?? 56) * 0.48));
}

/** Offset kit-crown cores so the heart is a cluster of masses, not one ball. */
function crownCores(group, cx, cy, cz, salt, span) {
  crown(group, cx, cy, cz, span * 0.34, salt);
  crown(group, cx + span * 0.28, cy + span * 0.10, cz - span * 0.16, span * 0.26, salt + 11);
  crown(group, cx - span * 0.26, cy + span * 0.06, cz + span * 0.22, span * 0.25, salt + 23);
  crown(group, cx + span * 0.06, cy + span * 0.28, cz + span * 0.04, span * 0.22, salt + 31);
  crown(group, cx - span * 0.04, cy - span * 0.18, cz - span * 0.08, span * 0.20, salt + 41);
}

export function buildTreePlane(group, entry, base) {
  const b = boundsOf(entry);
  const salt = Math.round((entry.x ?? 0) * 31 + (entry.z ?? 0) * 7 + 3);
  const lean = (wobble(salt, 5, 3) - 0.5) * 0.16;
  cyl(group, EXTRA.plinth, 0.36, 0.050, b.cx, base + 0.026, b.cz, 12, { rough: 0.95 });
  flares(group, b.cx, base, b.cz, salt, 4, 0.18);
  taper(group, VOXEL_COLOURS.timber, 0.092, 0.176, 2.28, b.cx, base + 1.16, b.cz, 10, { rough: 0.88 });
  taper(group, VOXEL_COLOURS.timber, 0.056, 0.096, 1.46,
    b.cx + lean * 1.2, base + 2.72, b.cz + lean * 0.45, 8, { rough: 0.88, rot: [0.11, 0, lean] });
  taper(group, VOXEL_COLOURS.timber, 0.048, 0.088, 1.22,
    b.cx - lean * 1.0, base + 2.64, b.cz + 0.16, 8, { rough: 0.88, rot: [-0.22, 0.58, -0.11] });
  taper(group, VOXEL_COLOURS.timber, 0.040, 0.070, 0.88,
    b.cx + 0.10, base + 2.56, b.cz - 0.18, 8, { rough: 0.88, rot: [0.18, -0.92, 0.09] });
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + salt * 0.4;
    box(group, VOXEL_COLOURS.post, 0.032, 0.22 + wobble(salt, i, 9) * 0.14, 0.085,
      b.cx + Math.cos(a) * 0.13, base + 0.50 + i * 0.36, b.cz + Math.sin(a) * 0.13,
      { rough: 0.90, rot: [0, -a, 0] });
  }
  const forkY = base + 2.78;
  const arms = [
    { az: 0.32 + salt * 0.04, pitch: 0.48, len: 1.28, r: 0.068 },
    { az: 1.55 + salt * 0.03, pitch: 0.38, len: 1.08, r: 0.058 },
    { az: 2.28 + salt * 0.03, pitch: 0.44, len: 1.18, r: 0.062 },
    { az: 3.72 + salt * 0.05, pitch: 0.52, len: 1.36, r: 0.066 },
    { az: 5.18 + salt * 0.02, pitch: 0.36, len: 1.04, r: 0.054 },
  ];
  arms.forEach((arm, i) => {
    limb(group, VOXEL_COLOURS.timber, b.cx, forkY, b.cz, arm.az, arm.pitch, arm.len, arm.r);
    const midX = b.cx + Math.cos(arm.az) * arm.len * 0.50;
    const midZ = b.cz + Math.sin(arm.az) * arm.len * 0.50;
    const midY = forkY + Math.sin(arm.pitch) * arm.len * 0.34;
    const az2 = arm.az + (wobble(salt, i, 19) - 0.5) * 1.10;
    limb(group, VOXEL_COLOURS.timber, midX, midY, midZ, az2, arm.pitch + 0.16, arm.len * 0.42, arm.r * 0.66);
  });
  const canopyY = base + LEVEL_H * 5.35;
  const cx = b.cx + lean * 0.45;
  const cz = b.cz + lean * 0.22;
  crownCores(group, cx, canopyY, cz, salt, 2.70);
  leafCanopy(group, cx, canopyY, cz, 3.55, salt, {
    count: 16, clump: 0.74, core: 0, holes: [7, 8], nPer: 13, flat: 1.10, fill: 62, rise: 0.84,
  });
  leafClump(group, cx + 1.18, canopyY - 1.18, cz - 0.38, 0.62, salt + 41, 12);
  leafClump(group, cx - 1.12, canopyY - 1.06, cz + 0.82, 0.60, salt + 43, 12);
  leafClump(group, cx + 0.28, canopyY + 1.22, cz + 0.16, 0.58, salt + 47, 12);
  leafClump(group, cx - 0.22, canopyY - 1.42, cz - 0.14, 0.56, salt + 49, 11);
  leafClump(group, cx + 0.08, canopyY + 1.55, cz - 0.10, 0.50, salt + 51, 11);
}

export function buildTreeGum(group, entry, base) {
  const b = boundsOf(entry);
  const salt = Math.round((entry.x ?? 0) * 31 + (entry.z ?? 0) * 7 + 11);
  const lean = (wobble(salt, 4, 8) - 0.5) * 0.18;
  cyl(group, EXTRA.plinth, 0.28, 0.050, b.cx, base + 0.026, b.cz, 12, { rough: 0.95 });
  flares(group, b.cx, base, b.cz, salt, 3, 0.12);
  const bole = LEVEL_H * 4.15;
  taper(group, VOXEL_COLOURS.post, 0.040, 0.108, bole, b.cx, base + bole / 2, b.cz, 10, { rough: 0.88 });
  taper(group, VOXEL_COLOURS.post, 0.028, 0.044, 1.28,
    b.cx + lean * 1.6, base + bole + 0.46, b.cz - lean * 0.55, 8,
    { rough: 0.88, rot: [0.11, 0, lean * 1.3] });
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + salt * 0.27;
    const hh = 0.18 + wobble(salt, i, 7) * 0.16;
    box(group, VOXEL_COLOURS.timber, 0.028, hh, 0.072,
      b.cx + Math.cos(a) * 0.095, base + 0.55 + i * 0.62, b.cz + Math.sin(a) * 0.095,
      { rough: 0.90, rot: [0, -a, 0] });
  }
  for (let i = 0; i < 6; i += 1) {
    const w1 = wobble(salt, i, 13);
    const w2 = wobble(salt, i, 41);
    const a = (i / 6) * Math.PI * 2 + salt * 0.11;
    const hh = 0.30 + w1 * 0.36;
    const out = 0.11 + w1 * 0.05;
    box(group, i % 2 ? VOXEL_COLOURS.post : VOXEL_COLOURS.timber,
      0.018, hh, 0.12,
      b.cx + Math.cos(a) * out, base + 0.70 + w2 * 2.20, b.cz + Math.sin(a) * out,
      { rough: 0.90, rot: [0.20 + w2 * 0.32, -a, 0.52 + w1 * 0.38] });
  }
  const forkY = base + bole + 0.10;
  const arms = [
    { az: 0.42 + salt * 0.05, pitch: 0.36, len: 1.22, r: 0.052 },
    { az: 1.70 + salt * 0.03, pitch: 0.28, len: 1.02, r: 0.044 },
    { az: 2.40 + salt * 0.03, pitch: 0.44, len: 1.14, r: 0.048 },
    { az: 3.88 + salt * 0.04, pitch: 0.40, len: 1.20, r: 0.050 },
    { az: 5.38 + salt * 0.02, pitch: 0.32, len: 1.00, r: 0.042 },
  ];
  arms.forEach((arm, i) => {
    limb(group, VOXEL_COLOURS.post, b.cx + lean, forkY, b.cz, arm.az, arm.pitch, arm.len, arm.r);
    const midX = b.cx + lean + Math.cos(arm.az) * arm.len * 0.52;
    const midZ = b.cz + Math.sin(arm.az) * arm.len * 0.52;
    const midY = forkY + Math.sin(arm.pitch) * arm.len * 0.32;
    limb(group, VOXEL_COLOURS.post, midX, midY, midZ,
      arm.az + (i % 2 ? 0.80 : -0.70), arm.pitch + 0.16, arm.len * 0.38, arm.r * 0.68);
  });
  const canopyY = base + LEVEL_H * 5.55;
  const cx = b.cx + lean;
  crownCores(group, cx, canopyY + 0.10, b.cz, salt, 2.48);
  leafCanopy(group, cx, canopyY + 0.10, b.cz, 3.25, salt + 5, {
    count: 15, clump: 0.70, core: 0, holes: [5, 6], nPer: 13, flat: 1.00, fill: 54, rise: 0.80,
  });
  leafClump(group, cx + 1.02, canopyY - 0.92, b.cz + 0.28, 0.56, salt + 71, 12);
  leafClump(group, cx - 0.94, canopyY - 0.78, b.cz - 0.46, 0.54, salt + 73, 12);
  leafClump(group, cx + 0.10, canopyY + 1.18, b.cz - 0.08, 0.52, salt + 75, 11);
  leafClump(group, cx - 0.12, canopyY + 1.42, b.cz + 0.10, 0.48, salt + 77, 11);
}

export function buildTreeHedge(group, entry, base) {
  const b = boundsOf(entry);
  const { w, d } = spanOf(entry.id, entry.yaw ?? 0, entry.variant);
  const alongX = w >= d;
  const len = alongX ? b.w : b.d;
  const thick = alongX ? b.d : b.w;
  const salt = Math.round((entry.x ?? 0) * 17 + (entry.z ?? 0) * 11 + 19);
  for (let i = 0; i < 5; i += 1) {
    const t = (i + 0.5) / 5 - 0.5;
    const w1 = wobble(salt, i, 5);
    const w2 = wobble(salt, i, 19);
    const pw = (len / 5) * (1.15 + w1 * 0.35);
    const pd = thick * (0.28 + w2 * 0.22);
    const ox = alongX ? t * len * 0.82 : (w2 - 0.5) * 0.16;
    const oz = alongX ? (w2 - 0.5) * 0.16 : t * len * 0.82;
    box(group, EXTRA.plinth,
      alongX ? pw : pd, 0.046, alongX ? pd : pw,
      b.cx + ox, base + 0.024, b.cz + oz,
      { rough: 0.95, rot: [0, (w1 - 0.5) * 0.50, 0] });
  }
  for (let i = 0; i < 4; i += 1) {
    const t = (i + 0.5) / 4 - 0.5;
    const w1 = wobble(salt, i + 3, 29);
    const ox = alongX ? t * len * 0.74 : thick * 0.34 * (i % 2 ? 1 : -1);
    const oz = alongX ? thick * 0.34 * (i % 2 ? 1 : -1) : t * len * 0.74;
    box(group, VOXEL_COLOURS.post,
      alongX ? 0.22 + w1 * 0.10 : 0.045,
      0.06,
      alongX ? 0.045 : 0.22 + w1 * 0.10,
      b.cx + ox, base + 0.055, b.cz + oz, { rough: 0.88 });
  }
  // Overlapping clipped bays of small leaf voxels — peak / gap / peak, not a cargo crate.
  const bays = [
    { t: -0.42, h: 0.92, depth: 0.14, bitten: false },
    { t: -0.28, h: 1.28, depth: -0.12, bitten: false },
    { t: -0.12, h: 0.12, depth: 0.02, bitten: true },
    { t: 0.02, h: 0.78, depth: 0.18, bitten: false },
    { t: 0.16, h: 1.36, depth: -0.10, bitten: false },
    { t: 0.32, h: 1.08, depth: 0.12, bitten: false },
    { t: 0.44, h: 0.38, depth: -0.16, bitten: false },
  ];
  bays.forEach((bay, i) => {
    const w1 = wobble(salt, i, 3);
    const w2 = wobble(salt, i, 11);
    const yaw = (w1 - 0.5) * 0.34;
    const ox = alongX ? bay.t * len : bay.depth;
    const oz = alongX ? bay.depth : bay.t * len;
    const n = bay.bitten ? 5 : 16;
    for (let k = 0; k < n; k += 1) {
      const wk = wobble(salt, i * 17 + k, 41);
      const wj = wobble(salt, i * 17 + k, 19);
      const wm = wobble(salt, i * 17 + k, 7);
      const along = (wk - 0.5) * 0.50;
      const out = (wj - 0.5) * 0.32;
      const s = 0.16 + wm * 0.12;
      const y = base + 0.10 + (bay.bitten ? wk * bay.h * 0.40 : wm * bay.h * 0.90);
      box(group, LEAF[(i + k) % 3],
        alongX ? s * (1.20 + wk * 0.30) : s * (0.90 + wj * 0.30),
        s * (0.70 + wm * 0.40),
        alongX ? s * (0.90 + wj * 0.30) : s * (1.20 + wk * 0.30),
        b.cx + ox + (alongX ? along : out),
        y,
        b.cz + oz + (alongX ? out : along),
        { rough: 0.88, rot: [wm * 0.20 - 0.10, yaw, wj * 0.16 - 0.08] });
    }
    if (!bay.bitten) {
      leafClump(group, b.cx + ox, base + bay.h * 0.55, b.cz + oz, 0.42 + w2 * 0.10, salt + i * 9, 11);
      leafClump(group, b.cx + ox, base + bay.h + 0.08, b.cz + oz, 0.32 + w1 * 0.08, salt + i * 11, 10);
      box(group, EXTRA.leafLight,
        alongX ? 0.22 + w1 * 0.10 : 0.030,
        0.22 + w2 * 0.14,
        alongX ? 0.030 : 0.22 + w1 * 0.10,
        alongX ? b.cx + ox : b.cx + ox + 0.16,
        base + bay.h * 0.42,
        alongX ? b.cz + oz + 0.16 : b.cz + oz,
        { rough: 0.82, rot: [0, yaw, 0] });
    } else {
      box(group, VOXEL_COLOURS.timber, 0.028, 0.22, 0.028,
        b.cx + ox, base + 0.16, b.cz + oz, { rough: 0.90 });
      leafClump(group, b.cx + ox, base + 0.12, b.cz + oz, 0.16, salt + i * 9, 5);
    }
  });
  const crests = 11;
  for (let i = 0; i < crests; i += 1) {
    if (i === 2 || i === 3 || i === 7) continue;
    const t = (i + 0.5) / crests - 0.5;
    const w1 = wobble(salt, i + 7, 19);
    const w2 = wobble(salt, i + 7, 31);
    const hh = 0.10 + w1 * 0.24 + (i === 1 || i === 9 ? 0.22 : 0);
    const ox = alongX ? t * len * 0.82 : (w2 - 0.5) * 0.16;
    const oz = alongX ? (w2 - 0.5) * 0.16 : t * len * 0.82;
    box(group, LEAF[i % 3],
      alongX ? (len / crests) * 1.20 : thick * (0.26 + w2 * 0.20),
      hh,
      alongX ? thick * (0.26 + w2 * 0.20) : (len / crests) * 1.20,
      b.cx + ox, base + 0.92 + w1 * 0.32 + (i % 3) * 0.08, b.cz + oz,
      { rough: 0.88, rot: [0, (w1 - 0.5) * 0.50, 0] });
    if (w1 > 0.32) {
      box(group, LEAF[(i + 1) % 3],
        alongX ? 0.16 : 0.13, 0.08 + w2 * 0.08, alongX ? 0.13 : 0.16,
        b.cx + ox + (w2 - 0.5) * 0.08, base + 1.12 + w1 * 0.20, b.cz + oz,
        { rough: 0.88, rot: [0.12, w2, -0.08] });
    }
  }
  const endA = alongX ? { x: b.cx - len * 0.44, z: b.cz + 0.10 } : { x: b.cx + 0.10, z: b.cz - len * 0.44 };
  const endB = alongX ? { x: b.cx + len * 0.42, z: b.cz - 0.12 } : { x: b.cx - 0.12, z: b.cz + len * 0.42 };
  shrub(group, endA.x, base, endA.z, 0.36, salt + 4);
  shrub(group, endB.x, base, endB.z, 0.30, salt + 8);
  leafClump(group, endB.x, base + 0.46, endB.z, 0.32, salt + 10, 8);
}

export function buildTreeGrove(group, entry, base) {
  const b = boundsOf(entry);
  const salt = Math.round((entry.x ?? 0) * 13 + (entry.z ?? 0) * 19 + 27);
  for (let i = 0; i < 6; i += 1) {
    const w1 = wobble(salt, i, 5);
    const w2 = wobble(salt, i, 17);
    const w3 = wobble(salt, i, 29);
    box(group, EXTRA.plinth,
      0.50 + w1 * 0.38, 0.050, 0.46 + w2 * 0.34,
      b.cx + (w1 - 0.5) * 0.88, base + 0.026, b.cz + (w2 - 0.5) * 0.88,
      { rough: 0.95, rot: [0, w3 * 1.4, 0] });
  }
  const stems = [
    { x: b.cx - 0.50, z: b.cz - 0.34, h: 3.42, lean: 0.12, k: 21 },
    { x: b.cx + 0.46, z: b.cz - 0.24, h: 3.12, lean: -0.10, k: 38 },
    { x: b.cx + 0.04, z: b.cz + 0.44, h: 3.88, lean: 0.08, k: 55 },
  ];
  stems.forEach((s, i) => {
    flares(group, s.x, base, s.z, salt + s.k, 3, 0.10);
    taper(group, VOXEL_COLOURS.timber, 0.044, 0.094, s.h, s.x + s.lean * 0.28, base + s.h / 2, s.z, 8,
      { rough: 0.88, rot: [0, 0, s.lean] });
    const a0 = salt * 0.13 + i * 1.7;
    limb(group, VOXEL_COLOURS.timber, s.x, base + s.h * 0.68, s.z, a0, 0.48, 0.88, 0.050);
    limb(group, VOXEL_COLOURS.timber, s.x, base + s.h * 0.80, s.z, a0 + 2.15, 0.40, 0.74, 0.044);
    limb(group, VOXEL_COLOURS.timber, s.x, base + s.h * 0.90, s.z, a0 + 3.8, 0.34, 0.60, 0.038);
  });
  const canopyY = base + LEVEL_H * 5.15;
  crownCores(group, b.cx, canopyY, b.cz, salt, 2.90);
  crown(group, b.cx - 0.62, canopyY + 0.18, b.cz - 0.34, 0.72, salt + 21);
  crown(group, b.cx + 0.58, canopyY + 0.10, b.cz + 0.30, 0.70, salt + 38);
  leafCanopy(group, b.cx, canopyY + 0.06, b.cz, 3.70, salt + 4, {
    count: 17, clump: 0.76, core: 0, holes: [11, 12], nPer: 13, flat: 1.08, fill: 68, rise: 0.82,
  });
  leafClump(group, b.cx + 1.18, canopyY - 0.92, b.cz - 0.52, 0.60, salt + 61, 12);
  leafClump(group, b.cx - 1.10, canopyY - 0.78, b.cz + 0.70, 0.58, salt + 67, 12);
  leafClump(group, b.cx + 0.12, canopyY + 1.18, b.cz - 0.08, 0.54, salt + 69, 12);
  leafClump(group, b.cx - 0.08, canopyY - 1.28, b.cz + 0.10, 0.56, salt + 77, 12);
  leafClump(group, b.cx + 0.04, canopyY + 1.48, b.cz + 0.06, 0.50, salt + 81, 11);
  shrub(group, b.cx + 0.62, base, b.cz + 0.48, 0.34, salt + 9);
  shrub(group, b.cx - 0.58, base, b.cz + 0.22, 0.28, salt + 12);
  taper(group, VOXEL_COLOURS.timber, 0.036, 0.070, 0.22, b.cx - 0.18, base + 0.14, b.cz + 0.10, 7, { rough: 0.88 });
}
