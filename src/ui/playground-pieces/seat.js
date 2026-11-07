// Seat family — four variants. Shared kit only.
import * as THREE from 'three';
import {
  EXTRA, VOXEL_COLOURS,
  box, cyl, taper, wobble, boundsOf,
} from './_kit.js';
import { spanOf, variantIndexOf } from '../../core/playground-builder.js';

/** Family plate is zoom 1.22 / 1.50. Group already 1.34× — sit-read is geometry, not another scale. */
const BENCH_READ = 1.34;
const SIT_SLAT_D = 0.145;
const SIT_GAP = 0.138;
const SIT_COUNT = 4;
/** Front sitting slat — iso faces this edge. A mid-bay hole hid as a dark band. */
const SIT_HOLE_I = 1;
const SIT_HOLE_PUSH = 0.32;
const SIT_WELL_W = 0.48;
const SIT_WELL_ALONG = 0.92;
const SIT_WELL_H = 0.26;
const SIT_WELL_DROP = 0.32;
/** Remaining-slat middle drop (local m). World = × 1.34. Seat y is 0.42, so the U kisses the pad. */
const SIT_SAG = 0.56;
/** Fallen board ≥ bench depth (4×0.145 + 3×0.138 = 0.994). On the pad, in front, not under a slat. */
const SIT_BOARD_LEN = 1.18;
const SIT_BOARD_D = 0.22;
const SIT_BOARD_H = 0.10;
const SIT_BOARD_DC = 0.72;
const SIT_BOARD_YAW = 0.12;
const SIT_BOARD_Y = 0.04;

export function buildSeat(group, entry, base, colour) {
  const v = variantIndexOf(entry.variant);
  if (v === 1) return buildSeatPicnic(group, entry, base, colour);
  if (v === 2) return buildSeatStoop(group, entry, base, colour);
  if (v === 3) return buildSeatPergola(group, entry, base, colour);
  return buildSeatBench(group, entry, base, colour);
}

function alongXOf(entry) {
  const { w, d } = spanOf(entry.id, entry.yaw ?? 0, entry.variant);
  if (w !== d) return w > d;
  return (((Math.round((entry.yaw ?? 0) / 90) % 4) + 4) % 4) % 2 === 0;
}

function saltOf(entry, extra = 0) {
  return Math.round((entry.x ?? 0) * 31 + (entry.z ?? 0) * 7 + (entry.variant ?? 0) * 13 + extra);
}

/** Tired park iron — leftover green-grey paint on rusted metal, not charcoal kit and not toy lime. */
const IRON = VOXEL_COLOURS.lime;
const BARE = VOXEL_COLOURS.steel;
const CAST = { metal: 0.48, tint: 0.40, rough: 0.70 };
const CAST_LIT = { metal: 0.38, tint: 0.54, rough: 0.54 };
const CAST_DARK = { metal: 0.55, tint: 0.30, rough: 0.78 };
/** Coral at tint 0.50 reads as a brown stone pad. Socks stay coral. */
const RUST = { rough: 0.90, tint: 0.96, metal: 0.06 };

function member(alongX, along, across, h) {
  return alongX ? [along, h, across] : [across, h, along];
}

function at(cx, cz, alongX, da, dc) {
  return alongX ? [cx + da, cz + dc] : [cx + dc, cz + da];
}

function rakeOf(alongX, rake) {
  return alongX ? [rake, 0, 0] : [0, 0, -rake];
}

function timberOf(salt, i, sit = 0) {
  return {
    rough: 0.84 + wobble(salt, i + 3, 7) * 0.10 - sit * 0.34,
    tint: 0.88 + wobble(salt, i + 1, 19) * 0.08 + sit * 0.14,
  };
}

/**
 * Sat-on slats stay four distinct values at pad distance.
 * Shade slats (wear=false) stay timber so a roof does not go galv.
 */
function slatColour(colour, salt, i, worn = true) {
  if (!worn) {
    const lane = (i + (wobble(salt, i, 41) > 0.5 ? 1 : 0)) % 3;
    if (lane === 0) return VOXEL_COLOURS.post;
    if (lane === 1) return EXTRA.plinth;
    return colour;
  }
  return i % 2 === 0 ? EXTRA.plinth : VOXEL_COLOURS.post;
}

function slatExtras(col, salt, i, sit, rot) {
  const wood = { ...timberOf(salt, i, sit), rot };
  if (col === VOXEL_COLOURS.steel) {
    wood.metal = 0.44;
    wood.rough = 0.46 + sit * 0.12;
    wood.tint = 0.96;
  }
  return wood;
}

function bowRot(alongX, pitch) {
  return alongX ? [0, 0, -pitch] : [pitch, 0, 0];
}

/** Seven-piece U. Power < 1 keeps ends high and dumps the middle — a banana, not a kink. */
function putWornSlat(group, colour, alongX, len, h, slatD, cx, y, cz, da, dc, sag, extras) {
  if (sag < 0.04 || len < 0.50) {
    put(group, colour, alongX, len, h, slatD, cx, y - sag * 0.62, cz, da, dc, extras);
    return;
  }
  const n = 7;
  const piece = len / n;
  const baseRot = extras.rot || [0, 0, 0];
  const u = (t) => Math.pow(Math.sin(t * Math.PI), 0.55);
  for (let k = 0; k < n; k += 1) {
    const t = (k + 0.5) / n;
    const wave = u(t);
    const drop = wave * sag;
    const alongOff = da + (k - (n - 1) / 2) * piece;
    const d0 = u(k / n) * sag;
    const d1 = u((k + 1) / n) * sag;
    const br = bowRot(alongX, Math.atan2(d1 - d0, piece));
    put(group, colour, alongX, piece * 0.97, h * (1 - wave * 0.18), slatD,
      cx, y - drop, cz, alongOff, dc, {
        ...extras,
        rot: [baseRot[0] + br[0], baseRot[1] + br[1], baseRot[2] + br[2]],
      });
  }
}

function put(group, colour, alongX, along, h, across, cx, y, cz, da, dc, extras = {}) {
  const [x, z] = at(cx, cz, alongX, da, dc);
  const { pitch: rake, ...rest } = extras;
  if (rake != null) rest.rot = rakeOf(alongX, rake);
  box(group, colour, ...member(alongX, along, across, h), x, y, z, rest);
}

/** Gap wider than slat depth — otherwise the run reads as one plank at pad distance. */
function slatRun(group, colour, alongX, cx, y, cz, len, slatD, gap, count, h, salt, start, wear = true, kind = '') {
  const pitchS = slatD + gap;
  const mid = (count - 1) / 2;
  const missKind = kind || (wear && count >= 4 ? 'missing' : wear && count === 2 ? 'short' : '');
  const gapI = missKind === 'missing' ? SIT_HOLE_I : missKind ? Math.min(count - 1, 1) : -1;
  for (let i = 0; i < count; i += 1) {
    let dc = (i - mid) * pitchS;
    if (missKind === 'missing' && i < gapI) dc -= SIT_HOLE_PUSH;
    const sit = !wear ? 0 : (count <= 2 ? 1 : 1 - Math.abs(i / (count - 1) - 0.5) * 2);
    const col = slatColour(colour, salt, start + i, wear);
    const side = wobble(salt, start + i, 71) > 0.5 ? 1 : -1;
    if (missKind === 'missing' && (i === gapI || i === gapI + 1)) {
      // Two-slat AIR. Red pour through the seat. No stub, no well, no hanging plank.
      continue;
    }
    const chip = wear ? 0.22 + wobble(salt, start + i, 53) * 0.22 : 0;
    let slatLen = len;
    let da0 = 0;
    if (missKind === 'short' && i === gapI) {
      slatLen = len * 0.50;
      da0 = -len * 0.22;
    }
    if (wear) {
      slatLen -= chip;
      da0 += side * chip * 0.5;
    }
    const sag = !wear ? 0
      : missKind === 'missing'
        ? SIT_SAG + sit * 0.06
        : 0.11 + sit * 0.09 + wobble(salt, start + i, 17) * 0.022;
    const roll = wear ? (wobble(salt, start + i, 91) - 0.5) * 0.08 : 0;
    const rot = alongX ? [0, 0, roll] : [roll, 0, 0];
    const wood = slatExtras(col, salt, start + i, sit, rot);
    if (wear) {
      putWornSlat(group, col, alongX, slatLen, h, slatD, cx, y, cz, da0, dc, sag, wood);
    } else {
      put(group, col, alongX, slatLen, h, slatD, cx, y, cz, da0, dc, wood);
    }
    if (wear && chip > 0.26) {
      put(group, EXTRA.plinth, alongX, 0.085, h * 0.58, slatD * 0.72,
        cx, y - sag - h * 0.12, cz, da0 + side * (slatLen / 2 + 0.024), dc,
        { rough: 0.94, tint: 0.64 });
    }
    if (wear && sit > 0.22 && slatLen > 0.34) {
      put(group, EXTRA.paverPale, alongX, Math.min(0.72, slatLen * 0.52), 0.034, slatD * 0.86,
        cx, y - sag + h * 0.46, cz, da0 * 0.08, dc,
        { rough: 0.34, tint: 1, metal: col === VOXEL_COLOURS.steel ? 0.34 : 0.05 });
    }
  }
}

function drawCastEnd(group, ex, ez, alongX, base) {
  put(group, IRON, alongX, 0.10, 0.42, 0.11, ex, base + 0.21, ez, 0, 0.34, CAST);
  put(group, IRON, alongX, 0.10, 0.42, 0.11, ex, base + 0.21, ez, 0, -0.50, CAST_DARK);
  put(group, IRON, alongX, 0.16, 0.06, 0.92, ex, base + 0.035, ez, 0, -0.06, CAST_DARK);
  put(group, IRON, alongX, 0.07, 0.52, 0.08, ex, base + 0.24, ez, 0, 0.04,
    { ...CAST_LIT, pitch: 0.70 });
  put(group, IRON, alongX, 0.10, 0.08, 0.72, ex, base + 0.405, ez, 0, -0.04, CAST);
  put(group, IRON, alongX, 0.09, 0.72, 0.09, ex, base + 0.76, ez, 0, -0.52, CAST_DARK);
  put(group, IRON, alongX, 0.09, 0.07, 0.58, ex, base + 0.64, ez, 0, -0.08, CAST_LIT);
  put(group, IRON, alongX, 0.07, 0.26, 0.08, ex, base + 0.55, ez, 0, 0.26,
    { ...CAST, pitch: -0.18 });
  put(group, IRON, alongX, 0.08, 0.08, 0.16, ex, base + 0.60, ez, 0, -0.44, CAST);
  put(group, BARE, alongX, 0.05, 0.04, 0.05, ex, base + 0.47, ez, 0, 0.30,
    { metal: 0.52, tint: 0.88, rough: 0.40 });
  put(group, EXTRA.plinth, alongX, 0.04, 0.05, 0.06, ex, base + 0.18, ez, 0, 0.28,
    { rough: 0.92, tint: 0.62 });
  // Coral sleeves on the iron legs — tall socks, not pad-sized brown cubes.
  put(group, VOXEL_COLOURS.coral, alongX, 0.13, 0.40, 0.13, ex, base + 0.22, ez, 0, 0.34, RUST);
  put(group, VOXEL_COLOURS.coral, alongX, 0.13, 0.40, 0.13, ex, base + 0.22, ez, 0, -0.50, RUST);
  put(group, VOXEL_COLOURS.coral, alongX, 0.16, 0.10, 0.16, ex, base + 0.06, ez, 0, 0.34,
    { ...RUST, tint: 1 });
  put(group, VOXEL_COLOURS.coral, alongX, 0.16, 0.10, 0.16, ex, base + 0.06, ez, 0, -0.50,
    { ...RUST, tint: 1 });
  put(group, VOXEL_COLOURS.coral, alongX, 0.11, 0.18, 0.11, ex, base + 0.38, ez, 0.02, 0.34,
    { ...RUST, tint: 0.88 });
  put(group, VOXEL_COLOURS.coral, alongX, 0.11, 0.18, 0.11, ex, base + 0.38, ez, -0.02, -0.50,
    { ...RUST, tint: 0.88 });
  put(group, VOXEL_COLOURS.lime, alongX, 0.14, 0.24, 0.15, ex, base + 0.40, ez, 0.03, 0.24,
    { rough: 0.74, tint: 0.92 });
  put(group, VOXEL_COLOURS.lime, alongX, 0.11, 0.16, 0.12, ex, base + 0.76, ez, 0.02, -0.44,
    { rough: 0.76, tint: 0.88 });
  put(group, BARE, alongX, 0.11, 0.040, 0.32, ex, base + 0.422, ez, 0, 0.06,
    { metal: 0.58, tint: 0.94, rough: 0.32 });
  put(group, IRON, alongX, 0.05, 0.04, 0.05, ex, base + 1.04, ez, 0, -0.52, CAST_DARK);
}

/** Two yellow C-curves — a peel, not a fruit. */
function drawPeel(group, x, y, z, yaw) {
  const yel = VOXEL_COLOURS.sun;
  const arm = (ox, oz, a0, roll) => {
    for (let i = 0; i < 3; i += 1) {
      const t = i / 2;
      const a = a0 + t * 0.88;
      box(group, yel, 0.11 - i * 0.014, 0.024, 0.042,
        x + ox + Math.cos(yaw + a) * (0.068 * i),
        y + i * 0.006,
        z + oz + Math.sin(yaw + a) * (0.068 * i),
        { rough: 0.64, rot: [0.16 + t * 0.22, yaw + a, roll * (0.72 + t)] });
    }
  };
  arm(0, 0, 0.12, 0.88);
  arm(-0.02, 0.055, 1.08, -0.88);
}

function drawOpenBin(group, cx, cz, alongX, base, da, dc, salt) {
  const bin = VOXEL_COLOURS.lime;
  const body = { rough: 0.58, tint: 0.80 };
  const rim = { rough: 0.54, tint: 0.62 };
  put(group, EXTRA.bluestone, alongX, 0.48, 0.04, 0.42, cx, base + 0.02, cz, da, dc, { rough: 0.88 });
  put(group, bin, alongX, 0.34, 0.045, 0.28, cx, base + 0.06, cz, da, dc, body);
  const wallH = 0.40;
  const wallY = base + 0.08 + wallH / 2;
  put(group, bin, alongX, 0.38, wallH, 0.042, cx, wallY, cz, da, dc - 0.14, body);
  put(group, bin, alongX, 0.38, wallH, 0.042, cx, wallY, cz, da, dc + 0.14, body);
  put(group, bin, alongX, 0.042, wallH, 0.24, cx, wallY, cz, da - 0.17, dc, body);
  put(group, bin, alongX, 0.042, wallH, 0.24, cx, wallY, cz, da + 0.17, dc, body);
  // Dark well so the mouth is a hole, not a lid.
  put(group, EXTRA.rubberSole, alongX, 0.30, 0.24, 0.22, cx, base + 0.20, cz, da, dc,
    { rough: 0.95, tint: 0.48 });
  put(group, bin, alongX, 0.40, 0.034, 0.048, cx, base + 0.49, cz, da, dc - 0.14, rim);
  put(group, bin, alongX, 0.40, 0.034, 0.048, cx, base + 0.49, cz, da, dc + 0.14, rim);
  put(group, bin, alongX, 0.048, 0.034, 0.28, cx, base + 0.49, cz, da - 0.17, dc, rim);
  put(group, bin, alongX, 0.048, 0.034, 0.28, cx, base + 0.49, cz, da + 0.17, dc, rim);

  const papers = [
    [EXTRA.paverPale, 0.14, 0.12, 0.050, 0.03, 0.14, -0.01, 0.45, 0.55, 0.18],
    [VOXEL_COLOURS.post, 0.10, 0.15, 0.042, -0.04, 0.16, 0.04, -0.28, 0.22, 0.52],
    [EXTRA.paverPale, 0.09, 0.09, 0.060, 0.05, 0.11, -0.05, 0.72, -0.38, 0.12],
    [EXTRA.rubberWear, 0.08, 0.13, 0.036, -0.01, 0.18, 0.02, 0.18, 0.85, -0.28],
    [VOXEL_COLOURS.post, 0.12, 0.05, 0.08, 0.00, 0.04, 0.16, 0.35, 0.20, 0.55],
  ];
  papers.forEach(([c, w, h, d, ox, oy, oz, rx, ry, rz], i) => {
    const jx = (wobble(salt, i, 3) - 0.5) * 0.03;
    const jz = (wobble(salt, i, 11) - 0.5) * 0.03;
    const [px, pz] = at(cx, cz, alongX, da + ox, dc + oz);
    box(group, c, w, h, d, px + jx, base + 0.42 + oy, pz + jz,
      { rough: 0.86, tint: 0.92 + wobble(salt, i, 19) * 0.10, rot: [rx, ry, rz] });
  });

  const [px, pz] = at(cx, cz, alongX, da - 0.04, dc + 0.22);
  drawPeel(group, px, base + 0.028, pz, alongX ? 0.35 : 1.15);
  const [fx, fz] = at(cx, cz, alongX, da + 0.10, dc + 0.24);
  cyl(group, VOXEL_COLOURS.coral, 0.048, 0.056, fx, base + 0.036, fz, 8, { rough: 0.70 });
  box(group, EXTRA.plinth, 0.012, 0.018, 0.012, fx, base + 0.068, fz, { rough: 0.82 });
  const [wx, wz] = at(cx, cz, alongX, da + 0.14, dc + 0.14);
  box(group, EXTRA.paverPale, 0.07, 0.016, 0.048, wx, base + 0.018, wz,
    { rough: 0.78, rot: [0.15, 0.7, 0.25] });
}

function drawBench(group, cx, cz, alongX, len, base, colour, salt, opts = {}) {
  const rig = new THREE.Group();
  rig.position.set(cx, base, cz);
  rig.scale.setScalar(opts.scale ?? BENCH_READ);
  group.add(rig);

  const shiftC = opts.shiftAcross ?? 0;
  let benchLen = len;
  let benchDa = opts.benchDa ?? 0;
  if (opts.bin) {
    if (!opts.keepLen) {
      benchLen = Math.min(len * 0.78, 1.54);
      benchDa = opts.benchDa ?? -(len - benchLen) * 0.40;
    }
    const binDa = opts.binDa ?? benchDa + benchLen / 2 + 0.26;
    const binDc = opts.binDc ?? shiftC + 0.18;
    drawOpenBin(rig, 0, 0, alongX, 0, binDa, binDc, salt);
  }
  const [ox, oz] = at(0, 0, alongX, benchDa, shiftC);
  const slatLen = benchLen - 0.24;
  const end = benchLen / 2 - 0.10;
  for (const side of [-1, 1]) {
    const [ex, ez] = at(ox, oz, alongX, side * end, 0);
    box(rig, EXTRA.bluestone, ...member(alongX, 0.20, 0.34, 0.032), ex, 0.016, ez,
      { rough: 0.90, tint: 0.58 });
    drawCastEnd(rig, ex, ez, alongX, 0);
  }
  slatRun(rig, colour, alongX, ox, 0.42, oz, slatLen, SIT_SLAT_D, SIT_GAP, SIT_COUNT, 0.092, salt, 0, true, 'missing');
  put(rig, EXTRA.paverPale, alongX, SIT_BOARD_LEN, SIT_BOARD_H, SIT_BOARD_D,
    ox, SIT_BOARD_Y, oz, 0, SIT_BOARD_DC,
    { rough: 0.78, tint: 1, rot: [0.04, SIT_BOARD_YAW, 0.04] });
  const backs = [
    [0.58, -0.52],
    [0.76, -0.545],
    [0.94, -0.57],
    [1.10, -0.595],
  ];
  backs.forEach(([y, dc], i) => {
    const col = slatColour(colour, salt, 8 + i, true);
    const side = wobble(salt, 8 + i, 71) > 0.5 ? 1 : -1;
    if (i === 1) {
      const stub = Math.max(0.22, slatLen * 0.24);
      put(rig, col, alongX, stub, 0.078, 0.080,
        ox, y - 0.05, oz, side * (slatLen / 2 - stub / 2), dc,
        { ...slatExtras(col, salt, 8 + i, 0.4, null), pitch: 0.28 });
      return;
    }
    const cut = 0.18 + wobble(salt, 8 + i, 53) * 0.22;
    put(rig, col, alongX, slatLen - 0.04 - cut, 0.082, 0.078,
      ox, y, oz, side * cut * 0.5, dc,
      { ...slatExtras(col, salt, 8 + i, 0.22, null), pitch: 0.16 });
    if (cut > 0.24) {
      put(rig, EXTRA.plinth, alongX, 0.07, 0.05, 0.050,
        ox, y - 0.03, oz, side * (slatLen / 2 - 0.05), dc,
        { rough: 0.94, tint: 0.66 });
    }
  });
  put(rig, IRON, alongX, slatLen - 0.10, 0.065, 0.07, ox, 0.28, oz, 0, -0.22, CAST);
  put(rig, IRON, alongX, slatLen, 0.07, 0.08, ox, 1.10, oz, 0, -0.58, CAST_DARK);
}

export function buildSeatBench(group, entry, base, colour) {
  const b = boundsOf(entry);
  const alongX = alongXOf(entry);
  const len = (alongX ? b.w : b.d) - 0.16;
  drawBench(group, b.cx, b.cz, alongX, len, base, colour, saltOf(entry, 3), {
    bin: true,
    shiftAcross: 0.12,
  });
}

export function buildSeatPicnic(group, entry, base, colour) {
  const b = boundsOf(entry);
  const alongX = alongXOf(entry);
  const salt = saltOf(entry, 5);
  const len = Math.min(b.w, b.d) * 0.84;
  box(group, EXTRA.bluestone, b.w - 0.16, 0.05, b.d - 0.16, b.cx, base + 0.025, b.cz, { rough: 0.88 });
  slatRun(group, colour, alongX, b.cx, base + 0.74, b.cz, len, 0.13, 0.13, 4, 0.086, salt, 0, true, 'short');
  for (const side of [-1, 1]) {
    const [bx, bz] = at(b.cx, b.cz, alongX, 0, side * 0.68);
    slatRun(group, colour, alongX, bx, base + 0.42, bz, len - 0.04, 0.125, 0.12, 2, 0.080, salt, 10 + side, true, 'short');
  }
  for (const side of [-1, 1]) {
    const da = side * (len / 2 - 0.11);
    put(group, IRON, alongX, 0.09, 0.70, 0.09, b.cx, base + 0.36, b.cz, da, -0.34, CAST);
    put(group, IRON, alongX, 0.09, 0.70, 0.09, b.cx, base + 0.36, b.cz, da, 0.34, CAST_DARK);
    put(group, IRON, alongX, 0.10, 0.08, 0.86, b.cx, base + 0.69, b.cz, da, 0, CAST);
    put(group, IRON, alongX, 0.10, 0.07, 1.64, b.cx, base + 0.385, b.cz, da, 0, CAST);
    put(group, IRON, alongX, 0.14, 0.06, 1.70, b.cx, base + 0.035, b.cz, da, 0, CAST_DARK);
    put(group, IRON, alongX, 0.07, 0.07, 0.46, b.cx, base + 0.54, b.cz, da, -0.16,
      { ...CAST_LIT, pitch: 0.52 });
    put(group, IRON, alongX, 0.07, 0.07, 0.46, b.cx, base + 0.54, b.cz, da, 0.16,
      { ...CAST_LIT, pitch: -0.52 });
    for (const [y, dc] of [[0.79, -0.30], [0.79, 0.30], [0.46, -0.66], [0.46, 0.66]]) {
      put(group, IRON, alongX, 0.045, 0.04, 0.045, b.cx, base + y, b.cz, da, dc, CAST);
    }
    put(group, VOXEL_COLOURS.coral, alongX, 0.12, 0.14, 0.12, b.cx, base + 0.08, b.cz, da, 0.34, RUST);
    put(group, VOXEL_COLOURS.coral, alongX, 0.12, 0.14, 0.12, b.cx, base + 0.08, b.cz, da, -0.34, RUST);
    put(group, VOXEL_COLOURS.lime, alongX, 0.05, 0.08, 0.05, b.cx, base + 0.42, b.cz, da + 0.02, 0.08,
      { rough: 0.74, tint: 0.86 });
  }
  put(group, IRON, alongX, len - 0.36, 0.07, 0.07, b.cx, base + 0.28, b.cz, 0, 0, CAST_DARK);
  const [ux, uz] = at(b.cx, b.cz, alongX, 0.24, -0.10);
  cyl(group, VOXEL_COLOURS.coral, 0.062, 0.008, ux, base + 0.782, uz, 10, { rough: 0.88, tint: 0.62 });
  cyl(group, EXTRA.paverPale, 0.052, 0.12, ux, base + 0.85, uz, 8, { rough: 0.56, tint: 0.94 });
  cyl(group, VOXEL_COLOURS.coral, 0.058, 0.026, ux, base + 0.918, uz, 8, { rough: 0.50 });
  const [hx, hz] = at(b.cx, b.cz, alongX, 0.304, -0.10);
  box(group, EXTRA.paverPale, ...member(alongX, 0.016, 0.036, 0.046), hx, base + 0.85, hz, { rough: 0.56 });
  const [gx, gz] = at(b.cx, b.cz, alongX, -0.30, 0.14);
  box(group, EXTRA.plinth, 0.18, 0.14, 0.13, gx, base + 0.86, gz,
    { rough: 0.90, rot: [0.08, 0.40, 0.12] });
  box(group, VOXEL_COLOURS.post, 0.14, 0.045, 0.09, gx, base + 0.94, gz,
    { rough: 0.86, rot: [0.08, 0.40, 0.12] });
  const [nx, nz] = at(b.cx, b.cz, alongX, -0.26, 0.18);
  box(group, EXTRA.paverPale, 0.055, 0.055, 0.028, nx, base + 0.92, nz,
    { rough: 0.74, rot: [0.2, 0.5, 0.1] });
  const [bx, bz] = at(b.cx, b.cz, alongX, 0.02, 0.16);
  cyl(group, VOXEL_COLOURS.sky, 0.032, 0.14, bx, base + 0.87, bz, 8, { rough: 0.46, tint: 0.85 });
  cyl(group, EXTRA.paverPale, 0.020, 0.034, bx, base + 0.95, bz, 6, { rough: 0.55 });
}

export function buildSeatStoop(group, entry, base, colour) {
  const b = boundsOf(entry);
  const alongX = alongXOf(entry);
  const s = Math.min(b.w, b.d);
  const cx = b.cx;
  const cz = b.cz;
  // Sole fills the cell so the stoop is not a postage-stamp crate on gravel.
  box(group, EXTRA.rubberSole, s - 0.04, 0.045, s - 0.04, cx, base + 0.022, cz,
    { rough: 0.92, tint: 0.72 });
  const cheekA = 0.085;
  const cheekDa = s / 2 - 0.062;
  for (const side of [-1, 1]) {
    put(group, EXTRA.bluestone, alongX, cheekA, 0.20, 0.36, cx, base + 0.14, cz, side * cheekDa, 0.30,
      { rough: 0.88, tint: 0.82 });
    put(group, EXTRA.bluestone, alongX, cheekA, 0.44, 0.62, cx, base + 0.26, cz, side * cheekDa, -0.14,
      { rough: 0.88, tint: 0.74 });
    put(group, EXTRA.rubberSole, alongX, 0.028, 0.14, 0.22, cx, base + 0.15, cz,
      side * (cheekDa - 0.042), 0.28, { rough: 0.94, tint: 0.58 });
    put(group, EXTRA.rubberSole, alongX, 0.028, 0.26, 0.40, cx, base + 0.30, cz,
      side * (cheekDa - 0.042), -0.10, { rough: 0.94, tint: 0.50 });
  }
  const span = s - 0.20;
  // Riser 1 — dark face recessed under a proud pale nosing.
  put(group, EXTRA.rubberSole, alongX, span - 0.04, 0.16, 0.046, cx, base + 0.11, cz, 0, 0.44,
    { rough: 0.94, tint: 0.48 });
  put(group, EXTRA.bluestone, alongX, span, 0.058, 0.30, cx, base + 0.198, cz, 0, 0.28,
    { rough: 0.86, tint: 0.90 });
  put(group, EXTRA.paverPale, alongX, span + 0.08, 0.058, 0.12, cx, base + 0.236, cz, 0, 0.48,
    { rough: 0.74, tint: 1 });
  put(group, EXTRA.rubberSole, alongX, span - 0.08, 0.032, 0.045, cx, base + 0.174, cz, 0, 0.48,
    { rough: 0.95, tint: 0.42 });
  // Riser 2 + sitting tread. Nosing is the name of the piece — not a crate lid.
  put(group, EXTRA.rubberSole, alongX, span - 0.06, 0.18, 0.048, cx, base + 0.28, cz, 0, 0.10,
    { rough: 0.94, tint: 0.46 });
  put(group, EXTRA.bluestone, alongX, span + 0.02, 0.068, 0.54, cx, base + 0.378, cz, 0, -0.16,
    { rough: 0.86, tint: 0.86 });
  put(group, EXTRA.paverPale, alongX, span + 0.10, 0.062, 0.13, cx, base + 0.426, cz, 0, 0.16,
    { rough: 0.72, tint: 1 });
  put(group, EXTRA.rubberSole, alongX, span - 0.10, 0.034, 0.050, cx, base + 0.348, cz, 0, 0.16,
    { rough: 0.95, tint: 0.40 });
  put(group, EXTRA.plinth, alongX, span * 0.56, 0.028, 0.32, cx, base + 0.408, cz, 0.02, -0.18,
    { rough: 0.88, tint: 0.60 });
  put(group, EXTRA.paverPale, alongX, span * 0.38, 0.028, 0.22, cx, base + 0.424, cz, -0.04, -0.14,
    { rough: 0.42, tint: 1 });
  put(group, EXTRA.paverPale, alongX, 0.20, 0.016, 0.14, cx, base + 0.430, cz, 0.10, -0.10,
    { rough: 0.36, tint: 1 });
  put(group, EXTRA.bluestone, alongX, span + 0.08, 0.24, 0.090, cx, base + 0.50, cz, 0, -(s / 2 - 0.10),
    { rough: 0.88, tint: 0.70 });
  put(group, EXTRA.paverPale, alongX, span + 0.10, 0.042, 0.11, cx, base + 0.63, cz, 0, -(s / 2 - 0.10),
    { rough: 0.80, tint: 0.94 });
}

export function buildSeatPergola(group, entry, base, colour) {
  const b = boundsOf(entry);
  const alongX = alongXOf(entry);
  const salt = saltOf(entry, 17);
  const h = 1.42;
  const inset = 0.13;
  const corners = [
    [b.minX + inset, b.minZ + inset],
    [b.maxX - inset, b.minZ + inset],
    [b.minX + inset, b.maxZ - inset],
    [b.maxX - inset, b.maxZ - inset],
  ];
  for (const [px, pz] of corners) {
    taper(group, VOXEL_COLOURS.post, 0.045, 0.065, h, px, base + h / 2, pz, 8, { rough: 0.86 });
    box(group, VOXEL_COLOURS.post, 0.16, 0.05, 0.16, px, base + h + 0.02, pz);
    box(group, EXTRA.bluestone, 0.24, 0.05, 0.24, px, base + 0.025, pz, { rough: 0.88 });
  }
  box(group, VOXEL_COLOURS.post, b.w - 0.18, 0.09, 0.09, b.cx, base + h, b.minZ + inset);
  box(group, VOXEL_COLOURS.post, b.w - 0.18, 0.09, 0.09, b.cx, base + h, b.maxZ - inset);
  box(group, VOXEL_COLOURS.post, 0.09, 0.09, b.d - 0.18, b.minX + inset, base + h, b.cz);
  box(group, VOXEL_COLOURS.post, 0.09, 0.09, b.d - 0.18, b.maxX - inset, base + h, b.cz);
  for (const t of [-0.28, 0, 0.28]) {
    put(group, VOXEL_COLOURS.post, alongX, 0.07, 0.06, (alongX ? b.d : b.w) - 0.18,
      b.cx, base + h + 0.02, b.cz, t * (alongX ? b.w : b.d), 0, { rough: 0.86 });
  }
  const shadeAlong = (alongX ? b.w : b.d) - 0.10;
  const shadeAcross = (alongX ? b.d : b.w) - 0.22;
  const shadeD = 0.08;
  const shadeGap = 0.12;
  const shadeN = Math.max(6, Math.round((shadeAcross + shadeGap) / (shadeD + shadeGap)));
  slatRun(group, colour, alongX, b.cx, base + h + 0.07, b.cz, shadeAlong, shadeD, shadeGap, shadeN, 0.05, salt, 20, false);
  drawBench(group, b.cx, b.cz, alongX, 1.52, base, colour, salt, {
    bin: true,
    keepLen: true,
    binDa: 0.70,
    binDc: 0.46,
  });
}
