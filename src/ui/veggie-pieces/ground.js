// Garden set: soil, beds, gravel, turf, fence, orchard.
// Deterministic. No sim. No Math.random.
// BED_* / FARM_* / bedCentre are copied from veggie-voxels.js — importing them
// would cycle once that file re-exports these builders.

import * as THREE from 'three';
import { box, cyl, ball } from './geom.js';

const BED_W = 3;
const BED_D = 2;
const BED_GAP = 0.92;
const SOIL_Y = 0.34;
const FARM_W = 22;
const FARM_D = 18;

const BED_CX = BED_W / 2 + BED_GAP / 2;
const BED_CZ = BED_D / 2 + BED_GAP / 2;

function bedCentre(bed) {
  return {
    x: (bed % 2 === 0 ? -1 : 1) * BED_CX,
    z: (bed < 2 ? -1 : 1) * BED_CZ,
  };
}

function unit(i, k) {
  let n = Math.imul((i | 0) + 1, 374761393) ^ Math.imul((k | 0) + 3, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function buildGround(group, m) {
  const w = FARM_W;
  const d = FARM_D;
  // Tight yard so the gravel/turf kerb sits inside the crop frustum.
  const gw = 10.2;
  const gd = 9.4;

  box(group, m.soilWet, w + 8.2, 1.5, d + 8.2, 0, -0.82, 0.2);
  box(group, m.turf, w + 7.6, 0.18, d + 7.6, 0, -0.20, 0.2);
  box(group, m.turf, w + 6.4, 0.18, d + 6.4, 0, -0.08, 0.2);

  box(group, m.gravel, gw + 0.36, 0.07, gd + 0.36, 0, -0.015, 0);
  box(group, m.gravel, gw, 0.08, gd, 0, 0.040, 0);

  paveCrossing(group, m);

  const hx = gw / 2;
  const hz = gd / 2;
  kerbLine(group, m, -hx, -hz, hx, -hz);
  kerbLine(group, m, -hx, hz, hx, hz);
  kerbLine(group, m, -hx, -hz, -hx, hz);
  kerbLine(group, m, hx, -hz, hx, hz);
}

/** Countable bluestone units on the + only. Dark soil bed is the mortar. */
function paveCrossing(group, m) {
  const pw = 0.28;
  const ph = 0.06;
  const pitch = 0.31;
  const yMortar = 0.050;
  const yPaver = 0.092;
  box(group, m.soil, 0.96, 0.035, 5.55, 0, yMortar, 0);
  box(group, m.soil, 7.50, 0.035, 0.96, 0, yMortar, 0);
  for (let iz = -8; iz <= 8; iz += 1) {
    for (let ix = -1; ix <= 1; ix += 1) {
      box(group, m.stone, pw, ph, pw, ix * pitch, yPaver, iz * pitch);
    }
  }
  for (let ix = -12; ix <= 12; ix += 1) {
    if (ix >= -1 && ix <= 1) continue;
    for (let iz = -1; iz <= 1; iz += 1) {
      box(group, m.stone, pw, ph, pw, ix * pitch, yPaver, iz * pitch);
    }
  }
  box(group, m.galv, 0.38, 0.025, 0.38, 0, 0.130, 0);
  for (let i = -1; i <= 1; i += 1) {
    box(group, m.galv, 0.028, 0.016, 0.34, i * 0.10, 0.142, 0);
  }
}

function kerbLine(group, m, x0, z0, x1, z1) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.round(len / 0.45));
  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.5) / n;
    box(group, m.stone, 0.16, 0.11, 0.16, x0 + dx * t, 0.095, z0 + dz * t);
  }
}

export function buildBedFrame(group, m, bed) {
  const c = bedCentre(bed);
  const t = 0.18;
  const zN = c.z - BED_D / 2 + t / 2;
  const zS = c.z + BED_D / 2 - t / 2;
  const xW = c.x - BED_W / 2 + t / 2;
  const xE = c.x + BED_W / 2 - t / 2;

  // Lower / upper long sides: two boards, joints staggered, pale end-grain.
  const lowSplit = 1.18 + bed * 0.20;
  const upSplit = 1.82 - bed * 0.16;
  longCourse(group, m, m.timberDark, c, zN, 0.085, 0.15, t, lowSplit);
  longCourse(group, m, m.timberDark, c, zS, 0.085, 0.15, t, BED_W - lowSplit - 0.05);
  longCourse(group, m, m.timber, c, zN, 0.270, 0.20, t, upSplit);
  longCourse(group, m, m.timber, c, zS, 0.270, 0.20, t, BED_W - upSplit - 0.05);

  box(group, m.timberDark, t, 0.15, BED_D - t * 2, xW, 0.085, c.z);
  box(group, m.timberDark, t, 0.15, BED_D - t * 2, xE, 0.085, c.z);
  box(group, m.timber, t, 0.20, BED_D - t * 2, xW, 0.270, c.z);
  box(group, m.timber, t, 0.20, BED_D - t * 2, xE, 0.270, c.z);
  endGrain(group, m, xW, 0.085, 0.15, t, c.z - (BED_D / 2 - t) + 0.03, true);
  endGrain(group, m, xW, 0.085, 0.15, t, c.z + (BED_D / 2 - t) - 0.03, true);
  endGrain(group, m, xE, 0.085, 0.15, t, c.z - (BED_D / 2 - t) + 0.03, true);
  endGrain(group, m, xE, 0.085, 0.15, t, c.z + (BED_D / 2 - t) - 0.03, true);

  // Cap sits 0.04 above the plot slabs (plot top ≈ 0.35) so the inner lip reads.
  const capY = 0.415;
  const capMat = bed === 1 ? m.timber : m.timberPale;
  const capExtra = bed === 0 ? 0.14 : 0;
  box(group, capMat, BED_W + 0.10 + capExtra, 0.05, t + 0.07, c.x - capExtra / 2, capY, zN);
  box(group, m.timberPale, BED_W + 0.10, 0.05, t + 0.07, c.x, capY, zS);
  box(group, m.timberPale, t + 0.07, 0.05, BED_D + 0.04, xW, capY, c.z);
  box(group, m.timberPale, t + 0.07, 0.05, BED_D + 0.04, xE, capY, c.z);

  for (const px of [-1, 1]) {
    for (const pz of [-1, 1]) {
      const x = c.x + px * (BED_W / 2 - 0.04);
      const z = c.z + pz * (BED_D / 2 - 0.04);
      box(group, m.timberDark, 0.22, 0.52, 0.22, x, 0.26, z);
      box(group, m.timberPale, 0.26, 0.06, 0.26, x, 0.55, z);
    }
  }

  if (bed !== 2) {
    box(group, m.galv, 0.09, 0.09, 0.04, c.x - 0.70, 0.24, zN + t * 0.35);
  }
  box(group, m.galv, 0.09, 0.09, 0.04, c.x + 0.70, 0.24, zS - t * 0.35);

  // Fill stays below the cap (and below the plot slabs).
  const fillH = 0.22;
  const fillTop = 0.30;
  box(group, m.soilWet, BED_W - t * 2 - 0.06, fillH, BED_D - t * 2 - 0.06, c.x, fillTop - fillH / 2, c.z);
  scatterMulch(group, m, c, bed);
}

function longCourse(group, m, mat, c, z, y, h, t, leftLen) {
  const gap = 0.05;
  const rightLen = Math.max(0.40, BED_W - leftLen - gap);
  const leftX = c.x - BED_W / 2 + leftLen / 2;
  const rightX = c.x + BED_W / 2 - rightLen / 2;
  box(group, mat, leftLen, h, t, leftX, y, z);
  box(group, mat, rightLen, h, t, rightX, y, z);
  endGrain(group, m, c.x - BED_W / 2 + 0.03, y, h, t, z, false);
  endGrain(group, m, c.x + BED_W / 2 - 0.03, y, h, t, z, false);
  endGrain(group, m, c.x - BED_W / 2 + leftLen, y, h, t, z, false);
}

function endGrain(group, m, x, y, h, t, z, alongZ) {
  if (alongZ) box(group, m.timberPale, t + 0.02, h * 0.90, 0.055, x, y, z);
  else box(group, m.timberPale, 0.055, h * 0.90, t + 0.02, x, y, z);
}

function scatterMulch(group, m, c, bed) {
  // Sit on the plot surface, inner sleeper band, large enough for this iso.
  const y = 0.368;
  const hw = BED_W / 2 - 0.30;
  const hd = BED_D / 2 - 0.30;
  const spots = [];
  for (let i = 0; i < 4; i += 1) {
    const u = (i + 0.5) / 4;
    spots.push([c.x + (u - 0.5) * 2 * hw, c.z - hd]);
    spots.push([c.x + (u - 0.5) * 2 * hw, c.z + hd]);
  }
  spots.push([c.x - hw, c.z]);
  spots.push([c.x + hw, c.z]);
  for (let i = 0; i < spots.length; i += 1) {
    const u = unit(i, bed * 9 + 2);
    const s = 0.08 + u * 0.05;
    box(
      group, i % 2 ? m.timberDark : m.soilRich,
      s, 0.05, s * 0.72,
      spots[i][0] + (u - 0.5) * 0.05, y, spots[i][1],
      [0, u * 1.4, 0],
    );
  }
}

export function buildFence(group, m) {
  const halfW = FARM_W / 2;
  const halfD = FARM_D / 2;
  const step = 2.15;
  const xs = [];
  for (let x = -halfW; x <= halfW + 0.01; x += step) xs.push(x);
  const zs = [];
  for (let z = -halfD + step; z < halfD - 0.4; z += step) zs.push(z);

  for (const x of xs) {
    fencePost(group, m, x, -halfD);
    fencePost(group, m, x, halfD);
  }
  for (const z of zs) {
    fencePost(group, m, -halfW, z);
    fencePost(group, m, halfW, z);
  }

  railRun(group, m, 0, -halfD, FARM_W, 0.07, true);
  railRun(group, m, 0, halfD, FARM_W * 0.38, 0.07, false);
  railRun(group, m, -FARM_W * 0.32, halfD, FARM_W * 0.28, 0.07, true);
  railRun(group, m, FARM_W * 0.32, halfD, FARM_W * 0.28, 0.07, true);
  railRun(group, m, -halfW, 0, 0.07, FARM_D, true);
  railRun(group, m, halfW, 0, 0.07, FARM_D, true);

  for (let i = 0; i < xs.length - 1; i += 1) {
    droppers(group, m, xs[i], -halfD, xs[i + 1], -halfD);
    const lo = Math.min(xs[i], xs[i + 1]);
    const hi = Math.max(xs[i], xs[i + 1]);
    if (hi < -1.6 || lo > 1.6) {
      droppers(group, m, xs[i], halfD, xs[i + 1], halfD);
    }
  }
  for (let i = 0; i < zs.length - 1; i += 1) {
    droppers(group, m, -halfW, zs[i], -halfW, zs[i + 1]);
    droppers(group, m, halfW, zs[i], halfW, zs[i + 1]);
  }

  // Four posts + two rails immediately behind the back beds — the horizon the crop plate can see.
  const hz = -BED_CZ - BED_D / 2 - 1.28;
  const hxs = [-2.25, -0.55, 1.15, 2.05];
  for (const x of hxs) fencePost(group, m, x, hz);
  railRun(group, m, (hxs[0] + hxs[3]) / 2, hz, hxs[3] - hxs[0], 0.07, true);
  for (let i = 0; i < hxs.length - 1; i += 1) {
    droppers(group, m, hxs[i], hz, hxs[i + 1], hz);
  }

  gateLeaf(group, m, 0.72, halfD + 0.18, -0.32, 1);
  gateLeaf(group, m, -0.72, halfD + 0.18, 0.32, -1);
  box(group, m.galv, 0.06, 0.08, 0.04, 0.08, 0.62, halfD + 0.28);
}

function fencePost(group, m, x, z) {
  box(group, m.stone, 0.22, 0.07, 0.22, x, 0.035, z);
  box(group, m.timberDark, 0.13, 1.15, 0.13, x, 0.02 + 1.15 / 2, z);
  box(group, m.timberPale, 0.17, 0.06, 0.17, x, 0.02 + 1.15 + 0.03, z);
}

function railRun(group, m, x, z, w, d, wire) {
  for (const y of [0.38, 0.78]) box(group, m.timber, w, 0.07, d, x, y, z);
  if (!wire) return;
  const alongX = w >= d;
  for (const y of [0.53, 0.65, 0.94]) {
    if (alongX) box(group, m.galv, w, 0.012, 0.012, x, y, z);
    else box(group, m.galv, 0.012, 0.012, d, x, y, z);
  }
}

function droppers(group, m, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.round(len / 0.68));
  for (let i = 1; i < n; i += 1) {
    const t = i / n;
    box(group, m.galv, 0.010, 0.42, 0.010, ax + dx * t, 0.58, az + dz * t);
  }
}

function gateLeaf(group, m, x, z, yaw, hingeSign) {
  const leaf = new THREE.Group();
  leaf.position.set(x, 0.58, z);
  leaf.rotation.y = yaw;
  const W = 1.55;
  const H = 1.02;
  box(leaf, m.timberPale, 0.07, H, 0.07, -W / 2 + 0.03, 0, 0);
  box(leaf, m.timberPale, 0.07, H, 0.07, W / 2 - 0.03, 0, 0);
  box(leaf, m.timberPale, W - 0.04, 0.07, 0.07, 0, H / 2 - 0.04, 0);
  box(leaf, m.timberPale, W - 0.04, 0.07, 0.07, 0, -H / 2 + 0.04, 0);
  box(leaf, m.timber, W - 0.08, 0.055, 0.055, 0, 0.02, 0);
  box(leaf, m.timber, W - 0.22, 0.045, 0.045, 0, 0, 0, [0, 0, 0.58]);
  for (let i = 0; i < 5; i += 1) {
    box(leaf, m.galv, 0.012, H - 0.18, 0.010, -0.52 + i * 0.26, 0, 0);
  }
  for (const y of [-0.22, 0.22]) {
    box(leaf, m.galv, W - 0.20, 0.010, 0.010, 0, y, 0);
  }
  const hx = hingeSign * (W / 2 - 0.02);
  cyl(leaf, m.galv, 0.018, 0.018, 0.08, hx, 0.38, 0.04, 6);
  cyl(leaf, m.galv, 0.018, 0.018, 0.08, hx, -0.38, 0.04, 6);
  group.add(leaf);
}

export function buildOrchard(group, m) {
  for (let i = 0; i < 3; i += 1) {
    const x = -FARM_W / 2 + 1.4 + i * 1.55;
    const z = -FARM_D / 2 + 1.35;
    orchardTree(group, m, x, z, i);
  }
  // Two trees pulled onto the crop plate, behind the back beds.
  const zNear = -BED_CZ - BED_D / 2 - 0.72;
  orchardTree(group, m, -BED_CX + 0.10, zNear, 3);
  orchardTree(group, m, BED_CX - 0.55, zNear, 4);
}

function orchardTree(group, m, x, z, i) {
  const lean = (unit(i, 1) - 0.5) * 0.16;
  const h = 0.80 + unit(i, 2) * 0.14;
  const fruit = i % 2 === 0 ? m.tomato : m.pumpkin;
  cyl(group, m.soilRich, 0.34, 0.34, 0.05, x, 0.035, z, 10);
  cyl(group, m.soil, 0.22, 0.22, 0.03, x + lean * 0.2, 0.055, z, 8);
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI * 2 + i * 0.35;
    box(
      group, m.timberDark, 0.10, 0.08, 0.20,
      x + Math.cos(a) * 0.12, 0.07, z + Math.sin(a) * 0.12,
      [0, -a, 0.15],
    );
  }
  cyl(group, m.timberDark, 0.055, 0.125, h, x, h / 2 + 0.02, z, 8);
  cyl(group, m.timberDark, 0.032, 0.055, 0.40, x + lean, h + 0.16, z + lean * 0.35, 7);
  box(group, m.timberDark, 0.30, 0.04, 0.04, x + 0.14, h + 0.08, z, [0, 0.35 + i * 0.1, 0.42]);
  box(group, m.timberDark, 0.24, 0.035, 0.035, x - 0.10, h + 0.16, z + 0.08, [0, -0.7, -0.28]);
  const cy = h + 0.42;
  ball(group, m.leafDeep, 0.50, x, cy, z, 10);
  ball(group, m.leafMid, 0.38, x + 0.20 + lean, cy + 0.16, z + 0.12, 9);
  ball(group, m.leafLight, 0.30, x - 0.18, cy + 0.20, z - 0.10, 8);
  ball(group, fruit, 0.046, x + 0.28, cy - 0.10, z + 0.10, 7);
  ball(group, fruit, 0.038, x - 0.18, cy + 0.04, z + 0.16, 7);
  if (i % 2 === 0) {
    ball(group, fruit, 0.034, x + 0.06, cy + 0.18, z - 0.22, 6);
  }
}
