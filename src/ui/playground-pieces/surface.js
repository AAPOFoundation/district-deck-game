// Surface family — four variants. Shared kit only.
// Mound is a one-way poured berm: low crest, long constant-grade run-up, toe at grade.
import * as THREE from 'three';
import {
  EXTRA, VOXEL_COLOURS,
  box, mat, wobble, boundsOf,
} from './_kit.js';
import { spanOf, variantIndexOf } from '../../core/playground-builder.js';

const SOLE_H = 0.18;
const SHELF_H = 0.22;
const WEAR_H = 0.075;
const WEAR_INSET = 0.18;
const POUR_INSET = 0.10;
const KERB_H = 0.30;
const KERB_T = 0.13;
const PATCH_H = 0.028;
const CRUMB_TONES = [
  VOXEL_COLOURS.rubberR, VOXEL_COLOURS.rubberB, VOXEL_COLOURS.rubberG, EXTRA.rubberSole,
];

function saltOf(entry) {
  return Math.round((entry.x ?? 0) * 17 + (entry.z ?? 0) * 5 + 1);
}

function fadeB(colour) {
  return colour === VOXEL_COLOURS.rubberB ? VOXEL_COLOURS.rubberG : VOXEL_COLOURS.rubberB;
}

function wearY(base) {
  return base + SHELF_H + WEAR_H / 2 - 0.016;
}

function patchY(base, i = 0) {
  return base + SHELF_H + WEAR_H - 0.008 + PATCH_H / 2 + i * 0.0024;
}

function crumbY(base) {
  return base + SHELF_H + WEAR_H + 0.008;
}

function pourBed(group, w, d, x, base, z) {
  box(group, EXTRA.rubberSole, w, SOLE_H, d, x, base + SOLE_H / 2, z, { rough: 0.95, repeat: 2 });
  box(group, EXTRA.rubberSole, w - 0.14, SHELF_H, d - 0.14,
    x, base + SHELF_H / 2, z, { rough: 0.95 });
}

function wearCourse(group, colour, w, d, x, base, z) {
  box(group, colour, w, WEAR_H, d, x, wearY(base), z, { rough: 0.95 });
}

function proudKerb(group, w, d, x, base, z) {
  const y = base + KERB_H / 2;
  box(group, EXTRA.rubberSole, w, KERB_H, KERB_T, x, y, z - d / 2 + KERB_T / 2, { rough: 0.95 });
  box(group, EXTRA.rubberSole, w, KERB_H, KERB_T, x, y, z + d / 2 - KERB_T / 2, { rough: 0.95 });
  box(group, EXTRA.rubberSole, KERB_T, KERB_H, d - KERB_T * 2,
    x - w / 2 + KERB_T / 2, y, z, { rough: 0.95 });
  box(group, EXTRA.rubberSole, KERB_T, KERB_H, d - KERB_T * 2,
    x + w / 2 - KERB_T / 2, y, z, { rough: 0.95 });
}

function longKerbs(group, w, d, x, base, z, alongX) {
  const y = base + KERB_H / 2;
  if (alongX) {
    box(group, EXTRA.rubberSole, w, KERB_H, KERB_T, x, y, z - d / 2 + KERB_T / 2, { rough: 0.95 });
    box(group, EXTRA.rubberSole, w, KERB_H, KERB_T, x, y, z + d / 2 - KERB_T / 2, { rough: 0.95 });
  } else {
    box(group, EXTRA.rubberSole, KERB_T, KERB_H, d, x - w / 2 + KERB_T / 2, y, z, { rough: 0.95 });
    box(group, EXTRA.rubberSole, KERB_T, KERB_H, d, x + w / 2 - KERB_T / 2, y, z, { rough: 0.95 });
  }
}

/** Second pour: overlapping fade fields. Wear is never tinted. */
function mottledPour(group, w, d, x, base, z, salt, colour) {
  const buff = EXTRA.rubberWear;
  const grey = fadeB(colour);
  const blobs = [
    [0.30, 0.32, 0.76, 0.62, buff],
    [0.72, 0.66, 0.58, 0.58, grey],
    [0.56, 0.22, 0.50, 0.42, buff],
    [0.22, 0.74, 0.46, 0.46, grey],
    [0.48, 0.50, 0.36, 0.36, buff],
    [0.82, 0.40, 0.34, 0.30, EXTRA.rubberPour],
    [0.14, 0.48, 0.32, 0.34, grey],
    [0.64, 0.82, 0.40, 0.30, buff],
  ];
  const n = (w < 0.28 || d < 0.28) ? 4 : blobs.length;
  for (let i = 0; i < n; i += 1) {
    const [fx, fz, fw, fd, tone] = blobs[i];
    const jx = (wobble(salt, i, 5) - 0.5) * 0.10;
    const jz = (wobble(salt, i, 11) - 0.5) * 0.10;
    const bw = Math.min(w * fw, w - 0.04);
    const bd = Math.min(d * fd, d - 0.04);
    const px = x + (fx - 0.5 + jx) * Math.max(0.04, w - bw);
    const pz = z + (fz - 0.5 + jz) * Math.max(0.04, d - bd);
    const yaw = (wobble(salt, i, 19) - 0.5) * 0.48;
    box(group, tone, bw, PATCH_H, bd, px, patchY(base, i), pz, { rough: 0.88, rot: [0, yaw, 0] });
  }
}

/** Jittered-grid EPDM chips so crumb occupies the wear, not a sparse speckle. */
function crumbField(group, w, d, x, yTop, z, salt, n, chan = 0) {
  const tones = CRUMB_TONES;
  const cols = Math.max(2, Math.round(Math.sqrt(n * (w / Math.max(0.10, d)))));
  const rows = Math.max(2, Math.ceil(n / cols));
  let i = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (i >= n) return;
      const jx = (wobble(salt, i + chan * 17, 11) - 0.5) * 0.58;
      const jz = (wobble(salt, i + chan * 17, 23) - 0.5) * 0.58;
      const fx = (c + 0.5 + jx) / cols;
      const fz = (r + 0.5 + jz) / rows;
      const wt = wobble(salt, i + chan * 17, 41);
      const s = 0.11 + wt * 0.08;
      const t = 0.018 + wt * 0.012;
      box(group, tones[i % 4], s, t, s * (0.58 + wt * 0.50),
        x + (fx - 0.5) * w,
        yTop + t / 2,
        z + (fz - 0.5) * d,
        { rough: 0.92, rot: [0, (wobble(salt, i + chan * 17, 7) - 0.5) * 1.2, 0] });
      i += 1;
    }
  }
}

/** Larger second-pour islands — crumb that occupies area, not dust. */
function crumbIslands(group, w, d, x, yTop, z, salt, n, chan = 0) {
  for (let i = 0; i < n; i += 1) {
    const fx = 0.16 + wobble(salt, i + chan * 9, 13) * 0.68;
    const fz = 0.16 + wobble(salt, i + chan * 9, 29) * 0.68;
    const wt = wobble(salt, i + chan * 9, 43);
    const bw = 0.20 + wt * 0.14;
    const bd = 0.16 + (1 - wt) * 0.12;
    const t = 0.022 + wt * 0.010;
    box(group, CRUMB_TONES[(i + 1) % 4], bw, t, bd,
      x + (fx - 0.5) * Math.max(0.08, w - bw),
      yTop + t / 2,
      z + (fz - 0.5) * Math.max(0.08, d - bd),
      { rough: 0.90, rot: [0, (wobble(salt, i + chan * 9, 7) - 0.5) * 0.9, 0] });
  }
}

/** Wide running surface; sides are constant-grade banks, not a rounded hill. */
function shoulder(t, s = 0) {
  const hold = s < 0 ? 0.58 : 0.50 + 0.22 * Math.max(0, Math.min(1, s));
  const a = Math.abs(t);
  if (a <= hold) return 1;
  const u = (a - hold) / Math.max(0.02, 1 - hold);
  const lip = 0.10;
  if (u < lip) {
    return 1 - (2 / lip) * u * u + (1 / (lip * lip)) * u * u * u;
  }
  return Math.max(0, 1 - u);
}

/**
 * s=0 crest, s<0 short back scarp, s=1 toe at grade.
 * Front is constant grade with C1 fillets so N·L is not a function of height.
 */
function bermH(s) {
  const back = 0.18;
  const cap = 0.10;
  const toe = 0.22;
  if (s <= -back) return 0;
  if (s < 0) {
    const u = (s + back) / back;
    return u * u * (3 - 2 * u);
  }
  if (s >= 1) return 0;
  if (s <= cap) {
    return 1 - (2 / cap) * s * s + (1 / (cap * cap)) * s * s * s;
  }
  if (s >= 1 - toe) {
    const u = (s - (1 - toe)) / toe;
    return toe * (1 - u - u * u + u * u * u);
  }
  return 1 - s;
}

/** Toe flares onto the pad. Crest stays a ridge, not a point. */
function bermW(s) {
  if (s <= 0) return 0.92;
  if (s >= 1) return 1.16;
  const u = Math.max(0, Math.min(1, s));
  return 0.92 + 0.24 * (u * u * (3 - 2 * u));
}

function bermPoint(s, t, salt, run, maxW, crestH, zBack, baseY, mode = 'wear') {
  const ss = Math.max(-0.18, Math.min(1.06, s));
  const u = Math.max(0, Math.min(1, ss));
  const wander = Math.sin(u * Math.PI) * maxW * 0.014
    + (wobble(salt, 3, 7) - 0.5) * 0.028;
  const width = Math.max(0.30, bermW(ss) * maxW);
  const bias = 0.04 * (wobble(salt, 5, 11) - 0.35);
  const halfL = width * (0.51 - bias);
  const halfR = width * (0.49 + bias);
  const half = t < 0 ? halfL : halfR;
  const x = wander + t * half;
  const z = zBack + ss * run;
  const sh = shoulder(t, ss);
  const crown = 1 + 0.010 * Math.sin((t + 0.18) * 1.3);
  let h;
  if (mode === 'sole') {
    if (ss > 0.02 || Math.abs(t) > 0.72) h = 0;
    else h = crestH * bermH(ss) * sh * 0.96;
  } else {
    h = crestH * bermH(ss) * sh * crown;
  }
  return { x, y: baseY + Math.max(0, h), z, s: ss, t };
}

function bermPitch(s, t, salt, run, maxW, crestH, zBack, baseY) {
  const a = bermPoint(s, t, salt, run, maxW, crestH, zBack, baseY, 'wear');
  const b = bermPoint(s + 0.04, t, salt, run, maxW, crestH, zBack, baseY, 'wear');
  return Math.atan2(a.y - b.y, b.z - a.z);
}

function bermGrid(opt) {
  const {
    nu, nv, salt, run, maxW, crestH, zBack, baseY, mode = 'wear',
  } = opt;
  const s0 = mode === 'sole' ? -0.18 : -0.01;
  const s1 = mode === 'sole' ? 0.02 : 1.04;
  const grid = [];
  for (let j = 0; j <= nv; j += 1) {
    const t = (j / nv) * 2 - 1;
    const row = [];
    for (let i = 0; i <= nu; i += 1) {
      const s = s0 + (i / nu) * (s1 - s0);
      row.push(bermPoint(s, t, salt, run, maxW, crestH, zBack, baseY, mode));
    }
    grid.push(row);
  }
  return grid;
}

/** Wear skin — one tint. UV is (t, s) so grain runs up the grade, not along isolines. */
function addHillSkin(group, colour, grid, baseY, extras = {}) {
  const nv = grid.length - 1;
  const nu = grid[0].length - 1;
  const pos = [];
  const uv = [];
  const index = [];
  const grade = baseY + 0.0015;
  for (let j = 0; j <= nv; j += 1) {
    for (let i = 0; i <= nu; i += 1) {
      const p = grid[j][i];
      pos.push(p.x, p.y, p.z);
      uv.push((p.t ?? 0) * 0.5 + 0.5, (p.s ?? 0) * 0.92 + 0.04);
    }
  }
  for (let j = 0; j < nv; j += 1) {
    for (let i = 0; i < nu; i += 1) {
      const a = grid[j][i];
      const b = grid[j][i + 1];
      const c = grid[j + 1][i + 1];
      const d = grid[j + 1][i];
      if ((a.y + b.y + c.y + d.y) / 4 <= grade) continue;
      const i00 = j * (nu + 1) + i;
      const i10 = i00 + 1;
      const i01 = (j + 1) * (nu + 1) + i;
      const i11 = i01 + 1;
      index.push(i00, i10, i11, i00, i11, i01);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const material = mat(colour, extras).clone();
  material.side = THREE.DoubleSide;
  material.vertexColors = false;
  material.flatShading = false;
  material.map = null;
  material.color = new THREE.Color(colour);
  material.needsUpdate = true;
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** Dark sole as the back scarp only. Never a ring, never a band on the run-up. */
function addSoleBack(group, grid, baseY) {
  const nv = grid.length - 1;
  const nu = grid[0].length - 1;
  const pos = [];
  const grade = baseY + 0.004;
  for (let j = 0; j < nv; j += 1) {
    for (let i = 0; i < nu; i += 1) {
      const a = grid[j][i];
      const b = grid[j][i + 1];
      const c = grid[j + 1][i + 1];
      const d = grid[j + 1][i];
      if ((a.y + b.y + c.y + d.y) / 4 <= grade) continue;
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      pos.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    }
  }
  for (let j = 0; j < nv; j += 1) {
    const p = grid[j][0];
    const q = grid[j + 1][0];
    if (p.y <= grade && q.y <= grade) continue;
    pos.push(p.x, p.y, p.z, p.x, baseY, p.z, q.x, baseY, q.z);
    pos.push(p.x, p.y, p.z, q.x, baseY, q.z, q.x, q.y, q.z);
  }
  if (pos.length < 9) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const material = mat(EXTRA.rubberSole, { rough: 0.95 }).clone();
  material.side = THREE.DoubleSide;
  material.flatShading = false;
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function crumbOnBerm(group, salt, run, maxW, crestH, zBack, baseY, n, chan) {
  for (let i = 0; i < n; i += 1) {
    const s = 0.14 + wobble(salt, i + chan * 17, 11) * 0.62;
    const t = (wobble(salt, i + chan * 17, 23) - 0.5) * 0.88;
    if (shoulder(t, s) < 0.72) continue;
    const wt = wobble(salt, i + chan * 17, 41);
    const p = bermPoint(s, t, salt, run, maxW, crestH, zBack, baseY, 'wear');
    if (p.y <= baseY + 0.06) continue;
    const pitch = bermPitch(s, t, salt, run, maxW, crestH, zBack, baseY);
    const sz = 0.08 + wt * 0.06;
    const h = 0.012 + wt * 0.008;
    const yaw = (wobble(salt, i + chan * 17, 7) - 0.5) * 1.1;
    box(group, CRUMB_TONES[i % 4], sz, h, sz * (0.55 + wt * 0.48),
      p.x, p.y + h * 0.40, p.z,
      { rough: 0.92, rot: [pitch, yaw, 0] });
  }
}

export function buildSurface(group, entry, base, colour) {
  const v = variantIndexOf(entry.variant);
  if (v === 1) return buildSurfacePath(group, entry, base, colour);
  if (v === 2) return buildSurfaceMound(group, entry, base, colour);
  if (v === 3) return buildSurfaceZebra(group, entry, base, colour);
  return buildSurfaceTile(group, entry, base, colour);
}

export function buildSurfaceTile(group, entry, base, colour) {
  const b = boundsOf(entry);
  const salt = saltOf(entry);
  const tone = colour ?? VOXEL_COLOURS.rubberR;
  pourBed(group, b.w - 0.02, b.d - 0.02, b.cx, base, b.cz);
  proudKerb(group, b.w - 0.02, b.d - 0.02, b.cx, base, b.cz);
  wearCourse(group, tone, b.w - WEAR_INSET * 2, b.d - WEAR_INSET * 2, b.cx, base, b.cz);
  mottledPour(group, b.w - POUR_INSET * 2, b.d - POUR_INSET * 2, b.cx, base, b.cz, salt, tone);
  crumbIslands(group, b.w - 0.28, b.d - 0.28, b.cx, crumbY(base), b.cz, salt, 7, 1);
  crumbField(group, b.w - 0.32, b.d - 0.32, b.cx, crumbY(base) + 0.008, b.cz, salt, 44);
}

export function buildSurfacePath(group, entry, base, colour) {
  const b = boundsOf(entry);
  const salt = saltOf(entry);
  const tone = colour ?? VOXEL_COLOURS.rubberR;
  const { w } = spanOf(entry.id, entry.yaw ?? 0, entry.variant);
  const alongX = w > 1;
  const n = 4;
  const joint = 0.12;
  const length = alongX ? b.w : b.d;
  const width = alongX ? b.d : b.w;
  const endPad = 0.10;
  const unitL = (length - endPad * 2 - joint * (n - 1)) / n;
  const unitW = width - WEAR_INSET * 2;
  pourBed(group, b.w - 0.02, b.d - 0.02, b.cx, base, b.cz);
  longKerbs(group, b.w - 0.02, b.d - 0.02, b.cx, base, b.cz, alongX);
  for (let i = 0; i < n; i += 1) {
    const along = (alongX ? b.minX : b.minZ) + endPad + unitL * (i + 0.5) + joint * i;
    const ux = alongX ? along : b.cx;
    const uz = alongX ? b.cz : along;
    const uw = alongX ? unitL : unitW;
    const ud = alongX ? unitW : unitL;
    wearCourse(group, tone, uw, ud, ux, base, uz);
    mottledPour(group, uw * 0.96, ud * 0.96, ux, base, uz, salt + i * 13, tone);
    crumbIslands(group, uw * 0.80, ud * 0.80, ux, crumbY(base), uz, salt, 3, i + 2);
    crumbField(group, uw * 0.88, ud * 0.88, ux, crumbY(base) + 0.006, uz, salt, 16, i + 1);
    if (i < n - 1) {
      const gap = (alongX ? b.minX : b.minZ) + endPad + unitL * (i + 1) + joint * i + joint / 2;
      const gx = alongX ? gap : b.cx;
      const gz = alongX ? b.cz : gap;
      const gw = alongX ? joint * 0.72 : unitW * 0.90;
      const gd = alongX ? unitW * 0.90 : joint * 0.72;
      box(group, EXTRA.rubberSole, gw, WEAR_H * 0.40, gd,
        gx, base + SHELF_H + WEAR_H * 0.18, gz, { rough: 0.95 });
    }
  }
}

export function buildSurfaceMound(group, entry, base, colour) {
  const b = boundsOf(entry);
  const salt = saltOf(entry);
  const tone = colour ?? VOXEL_COLOURS.rubberR;
  const grey = fadeB(tone);
  const turned = ((Math.round((entry.yaw ?? 0) / 90) % 4) + 4) % 4;
  const span = Math.min(b.w, b.d);
  const berm = new THREE.Group();
  berm.position.set(b.cx, 0, b.cz);
  // yaw 0: run-up toward +X, toe onto the pad, crest toward the far/left fence.
  berm.rotation.y = turned * (Math.PI / 2) + Math.PI / 2
    + (wobble(salt, 2, 5) - 0.5) * 0.04;
  group.add(berm);

  const gradeY = base + 0.032;
  const run = span * 3.40;
  const maxW = span * 3.10;
  const crestH = 0.42;
  const zBack = -span * 0.18;
  const spec = {
    salt, run, maxW, crestH, zBack, baseY: gradeY,
  };

  addHillSkin(berm, tone, bermGrid({ ...spec, nu: 20, nv: 14, mode: 'wear' }),
    gradeY, { rough: 0.95 });
  crumbOnBerm(berm, salt, run, maxW, crestH, zBack, gradeY, 18, 2);

  const face = [
    [0.32, -0.24, 0.36, 0.012, 0.22, EXTRA.rubberWear],
    [0.58, 0.20, 0.28, 0.010, 0.18, grey],
  ];
  for (let i = 0; i < face.length; i += 1) {
    const [s, t, bw, bh, bd, col] = face[i];
    const p = bermPoint(s, t, salt, run, maxW, crestH, zBack, gradeY, 'wear');
    if (p.y <= gradeY + 0.05) continue;
    const pitch = bermPitch(s, t, salt, run, maxW, crestH, zBack, gradeY);
    const yaw = (wobble(salt, i, 19) - 0.5) * 0.22;
    box(berm, col, bw, bh, bd, p.x, p.y + bh * 0.22, p.z,
      { rough: 0.88, rot: [pitch, yaw, 0] });
  }

  crumbOnBerm(berm, salt, run, maxW, crestH, zBack, gradeY, 8, 8);

  // Poured downhill sole — same plane as the run-up, not a detached plank.
  const toe = bermPoint(0.96, 0, salt, run, maxW, crestH, zBack, gradeY, 'wear');
  const pitch = bermPitch(0.94, 0, salt, run, maxW, crestH, zBack, gradeY);
  box(berm, EXTRA.rubberSole, maxW * 0.72, 0.05, 0.38,
    0, Math.max(gradeY + 0.02, toe.y * 0.35 + gradeY * 0.65), toe.z,
    { rough: 0.95, rot: [pitch, 0, 0] });
}

export function buildSurfaceZebra(group, entry, base, colour) {
  const b = boundsOf(entry);
  const salt = saltOf(entry);
  const tone = colour ?? VOXEL_COLOURS.rubberR;
  const { d } = spanOf(entry.id, entry.yaw ?? 0, entry.variant);
  const alongZ = d > 1;
  pourBed(group, b.w - 0.02, b.d - 0.02, b.cx, base, b.cz);
  longKerbs(group, b.w - 0.02, b.d - 0.02, b.cx, base, b.cz, !alongZ);
  const n = 6;
  const inset = 0.16;
  const gap = 0.055;
  const span = (alongZ ? b.d : b.w) - inset * 2;
  const start = (alongZ ? b.minZ : b.minX) + inset;
  const pitch = (span - gap * (n - 1)) / n;
  const stripeW = (alongZ ? b.w : b.d) - WEAR_INSET * 2;
  for (let i = 0; i < n; i += 1) {
    const along = start + i * (pitch + gap) + pitch / 2;
    const stripe = i % 2 === 0 ? tone : EXTRA.rubberWear;
    if (alongZ) {
      box(group, stripe, stripeW, WEAR_H, pitch,
        b.cx, wearY(base), along, { rough: 0.95 });
      crumbIslands(group, stripeW * 0.80, pitch * 0.72, b.cx, crumbY(base), along, salt, 2, i + 4);
      crumbField(group, stripeW * 0.88, pitch * 0.74, b.cx, crumbY(base) + 0.006, along, salt, 8, i + 3);
    } else {
      box(group, stripe, pitch, WEAR_H, stripeW,
        along, wearY(base), b.cz, { rough: 0.95 });
      crumbIslands(group, pitch * 0.72, stripeW * 0.80, along, crumbY(base), b.cz, salt, 2, i + 4);
      crumbField(group, pitch * 0.74, stripeW * 0.88, along, crumbY(base) + 0.006, b.cz, salt, 8, i + 3);
    }
  }
  if (alongZ) {
    box(group, EXTRA.rubberSole, b.w - 0.14, 0.14, 0.16, b.cx, base + 0.14, b.minZ + 0.09, { rough: 0.95 });
    box(group, EXTRA.rubberSole, b.w - 0.14, 0.14, 0.16, b.cx, base + 0.14, b.maxZ - 0.09, { rough: 0.95 });
    box(group, EXTRA.rubberWear, b.w - 0.26, 0.05, 0.10, b.cx, base + 0.20, b.minZ + 0.09, { rough: 0.88 });
    box(group, EXTRA.rubberWear, b.w - 0.26, 0.05, 0.10, b.cx, base + 0.20, b.maxZ - 0.09, { rough: 0.88 });
  } else {
    box(group, EXTRA.rubberSole, 0.16, 0.14, b.d - 0.14, b.minX + 0.09, base + 0.14, b.cz, { rough: 0.95 });
    box(group, EXTRA.rubberSole, 0.16, 0.14, b.d - 0.14, b.maxX - 0.09, base + 0.14, b.cz, { rough: 0.95 });
    box(group, EXTRA.rubberWear, 0.10, 0.05, b.d - 0.26, b.minX + 0.09, base + 0.20, b.cz, { rough: 0.88 });
    box(group, EXTRA.rubberWear, 0.10, 0.05, b.d - 0.26, b.maxX - 0.09, base + 0.20, b.cz, { rough: 0.88 });
  }
}
