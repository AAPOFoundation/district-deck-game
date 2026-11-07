// Deck family — four variants. Shared kit only.
// Monopoly Plus bar: stacked-cube blue stair tower, moulded white treads, red rails.
import {
  EXTRA, VOXEL_COLOURS, LEVEL_H,
  box, cyl, taper, boundsOf,
} from './_kit.js';
import { spanOf, variantIndexOf } from '../../core/playground-builder.js';

export function buildDeck(group, entry, base, colour) {
  const v = variantIndexOf(entry.variant);
  if (v === 1) return buildDeckStairs(group, entry, base, colour);
  if (v === 2) return buildDeckBridge(group, entry, base, colour);
  if (v === 3) return buildDeckLookout(group, entry, base, colour);
  return buildDeckPlatform(group, entry, base, colour);
}

/** Tower body is always MP sky. Player colour may tint a flag, never the mass. */
function bodyOf() {
  return VOXEL_COLOURS.sky;
}

function accentOf(colour) {
  return colour === VOXEL_COLOURS.sky ? VOXEL_COLOURS.sun : colour;
}

/** Stair rails are the red sticks in refs/4.jpg — not a player-colour accent. */
function railOf() {
  return VOXEL_COLOURS.coral;
}

function alongZOf(entry) {
  const { w, d } = spanOf(entry.id, entry.yaw ?? 0, entry.variant);
  if (w !== d) return d > w;
  return (((Math.round((entry.yaw ?? 0) / 90) % 4) + 4) % 4) % 2 === 0;
}

/** Place a box in (across, along) so the same flight works on both yaws. */
function put(group, colour, aW, h, aD, across, y, along, alongZ, extras = {}) {
  box(group, colour,
    alongZ ? aW : aD, h, alongZ ? aD : aW,
    alongZ ? across : along, y, alongZ ? along : across,
    extras);
}

function addCappedPost(group, paint, x, y0, y1, z, size = 0.14) {
  const h = Math.max(0.08, y1 - y0);
  box(group, paint, size, h, size, x, y0 + h / 2, z, { rough: 0.50 });
  box(group, VOXEL_COLOURS.steel, size * 1.22, 0.045, size * 1.22, x, y1 + 0.022, z, { metal: 0.36 });
  box(group, EXTRA.bluestone, size * 1.45, 0.045, size * 1.45, x, y0 + 0.022, z, { rough: 0.88 });
}

function addBaluster(group, paint, x, yLid, z, railH) {
  box(group, paint, 0.050, railH - 0.04, 0.050, x, yLid + railH / 2, z, { metal: 0.28 });
  box(group, paint, 0.074, 0.034, 0.074, x, yLid + railH * 0.48, z, { metal: 0.28 });
  box(group, paint, 0.064, 0.038, 0.064, x, yLid + railH + 0.01, z, { metal: 0.28 });
}

function addRailX(group, x0, x1, yLid, z, { railH = 0.50, count = 5, paint = VOXEL_COLOURS.coral } = {}) {
  const cx = (x0 + x1) / 2;
  const span = Math.abs(x1 - x0);
  box(group, paint, span, 0.070, 0.070, cx, yLid + railH, z, { metal: 0.28 });
  box(group, paint, span, 0.048, 0.048, cx, yLid + railH * 0.5, z, { metal: 0.28 });
  box(group, paint, span, 0.048, 0.058, cx, yLid + 0.04, z, { metal: 0.28 });
  for (let i = 0; i < count; i += 1) {
    addBaluster(group, paint, x0 + ((i + 0.5) / count) * (x1 - x0), yLid, z, railH);
  }
}

function addRailZ(group, z0, z1, yLid, x, { railH = 0.50, count = 5, paint = VOXEL_COLOURS.coral } = {}) {
  const cz = (z0 + z1) / 2;
  const span = Math.abs(z1 - z0);
  box(group, paint, 0.070, 0.070, span, x, yLid + railH, cz, { metal: 0.28 });
  box(group, paint, 0.048, 0.048, span, x, yLid + railH * 0.5, cz, { metal: 0.28 });
  box(group, paint, 0.058, 0.048, span, x, yLid + 0.04, cz, { metal: 0.28 });
  for (let i = 0; i < count; i += 1) {
    addBaluster(group, paint, x, yLid, z0 + ((i + 0.5) / count) * (z1 - z0), railH);
  }
}

const STEPS = 6;
/** 2×2 cell is 2.1 m. Lid stays at 2.6×LEVEL_H so a y=1 chute still leaves this landing. */
const TOWER_H = LEVEL_H * 2.6;
const STAIR_COURSES = 6;
const NX = 5;
const NZ = 5;
/** Extra cube courses above the landing — the shaft that owns the horse. */
const LOOKOUT_PIER = 7;
const PLATFORM_PIER = 9;
const JOINT = 0.048;
// Paler untextured hex via mat() — paverPale is stone and dies into the pad.
const TREAD = '#f7f4ec';
const NOSE = '#fbf9f3';
const GAP = EXTRA.rubberSole;
const PLASTIC = { rough: 0.32 };
const TEAL = '#3eb6ae';
const TREAD_H = 0.155;

/**
 * Thick moulded walking cap. Two punched holes + a countersink so the hole
 * reads at family zoom without eating the slab (not a three-hole paver).
 */
function addStepCap(group, across, yTop, alongFront, alongZ, width) {
  const depth = 0.30;
  const along = alongFront - depth / 2 + 0.022;
  put(group, TREAD, width, TREAD_H, depth,
    across, yTop + TREAD_H * 0.36, along, alongZ, PLASTIC);
  put(group, NOSE, width + 0.055, 0.082, 0.108,
    across, yTop + 0.014, alongFront + 0.034, alongZ, PLASTIC);
  const spread = width >= 1.05 ? 0.20 : 0.15;
  for (const off of [-spread, spread]) {
    const hx = alongZ ? across + off : alongFront - 0.12;
    const hz = alongZ ? alongFront - 0.12 : across + off;
    cyl(group, GAP, 0.060, TREAD_H + 0.046, hx, yTop + 0.052, hz, 8, { rough: 0.94 });
    cyl(group, GAP, 0.078, 0.024, hx, yTop + TREAD_H * 0.70, hz, 8, { rough: 0.94 });
  }
}

/**
 * Face-filling flight for the stairs variant. Six white caps on blue cheeks.
 * Not the named tower — that is the cube stack on platform / lookout.
 */
function addMouldedFlight(group, b, base, lid, {
  alongZ = true, full = false, steps = STEPS,
} = {}) {
  const body = bodyOf();
  const rail = railOf();
  const cheekW = full ? 0.16 : 0.22;
  const margin = 0.040;
  const across0 = (alongZ ? b.minX : b.minZ) + margin;
  const across1 = (alongZ ? b.maxX : b.maxZ) - margin;
  const strip = Math.max(0.70, across1 - across0);
  const inner = Math.max(0.42, strip - cheekW * 2);
  const mid = (across0 + across1) / 2;
  const runMax = alongZ ? b.maxZ : b.maxX;
  const runMin = alongZ ? b.minZ : b.minX;
  const runStart = runMax - 0.02;
  const runEnd = full
    ? runMin + 0.08
    : runMin + (runMax - runMin) * 0.36;
  const span = Math.max(0.72, runStart - runEnd);
  const rise = (lid - base) / steps;
  const run = span / steps;
  const well = {
    alongZ, mid, inner, cheekW, strip, runStart, runEnd, span, steps, rise, run,
    across0, across1,
  };

  put(group, body, strip + 0.08, 0.09, span + 0.12,
    mid, base + 0.045, (runStart + runEnd) / 2, alongZ, { rough: 0.50, tint: 0.92 });

  for (let i = 0; i < steps; i += 1) {
    const front = runStart - i * run;
    const back = runStart - (i + 1) * run;
    const along = (front + back) / 2;
    const yTop = base + (i + 1) * rise;
    const cheekH = Math.max(0.11, (i + 1) * rise - 0.062);
    const tint = i % 2 === 0 ? 1 : 0.84;

    for (const s of [-1, 1]) {
      const ac = mid + s * (inner / 2 + cheekW / 2);
      put(group, body, cheekW, cheekH, run - 0.028,
        ac, base + cheekH / 2, along, alongZ, { rough: 0.50, tint });
      put(group, body, cheekW - 0.02, Math.max(0.10, cheekH - rise * 0.15), run * 0.55,
        ac, base + cheekH / 2 - 0.01, along - run * 0.22, alongZ,
        { rough: 0.50, tint: tint === 1 ? 0.90 : 1 });
    }

    const riserH = Math.max(0.055, rise - TREAD_H - 0.012);
    put(group, body, inner - 0.02, riserH, run - 0.04,
      mid, yTop - TREAD_H - riserH / 2 - 0.008, along - 0.01, alongZ,
      { rough: 0.50, tint: 0.88 });

    addStepCap(group, mid, yTop - 0.012, front, alongZ, inner + 0.08);
  }

  const railLen = Math.hypot(span, lid - base);
  const pitch = Math.atan2(lid - base, span);
  const midAlong = (runStart + runEnd) / 2;
  const midY = (base + lid) / 2 + 0.46;
  const rot = alongZ ? [pitch, 0, 0] : [0, 0, -pitch];
  for (const s of [-1, 1]) {
    const off = (inner / 2 + 0.04) * s;
    const x = alongZ ? mid + off : midAlong;
    const z = alongZ ? midAlong : mid + off;
    box(group, rail, alongZ ? 0.078 : railLen, 0.078, alongZ ? railLen : 0.078,
      x, midY, z, { rot, rough: 0.46 });
    box(group, rail, alongZ ? 0.056 : railLen, 0.056, alongZ ? railLen : 0.056,
      x, midY - 0.17, z, { rot, rough: 0.46 });
  }
  for (const s of [-1, 1]) {
    const off = (inner / 2 + 0.04) * s;
    addCappedPost(group, rail,
      alongZ ? mid + off : runStart - 0.02, base, base + 0.58,
      alongZ ? runStart - 0.02 : mid + off, 0.10);
    addCappedPost(group, rail,
      alongZ ? mid + off : runEnd + 0.04, lid - 0.02, lid + 0.56,
      alongZ ? runEnd + 0.04 : mid + off, 0.10);
  }
  put(group, GAP, inner + 0.30, 0.05, 0.34,
    mid, base + 0.026, runStart + 0.02, alongZ, { rough: 0.95 });
  put(group, TREAD, strip - 0.06, 0.07, 0.18,
    mid, lid + 0.012, runEnd + 0.05, alongZ, PLASTIC);
  return well;
}

/**
 * refs/4.jpg massing: a pile of cubic sky blocks that go up.
 * Near face recedes as a cube stair; the back two columns keep stacking
 * so the silhouette is a tower, not a punched wedge.
 */
function addStackedCubeTower(group, b, base, alongZ, { lookout = false, accent } = {}) {
  const body = bodyOf();
  const rail = railOf();
  const inset = 0.055;
  const across0 = (alongZ ? b.minX : b.minZ) + inset;
  const across1 = (alongZ ? b.maxX : b.maxZ) - inset;
  const runMin = (alongZ ? b.minZ : b.minX) + inset;
  const runMax = (alongZ ? b.maxZ : b.maxX) - inset;
  const cw = (across1 - across0) / NX;
  const cd = (runMax - runMin) / NZ;
  const cubeH = TOWER_H / STAIR_COURSES;
  const tints = [1.0, 0.86, 0.95];
  const lid = base + TOWER_H;
  const pierN = lookout ? LOOKOUT_PIER : PLATFORM_PIER;
  const pierIxs = [[0, 1], [3, 4]];
  const pierIzs = [3, 4];

  function putCube(ix, iy, iz) {
    const across = across0 + (ix + 0.5) * cw;
    const along = runMax - (iz + 0.5) * cd;
    const y = base + (iy + 0.5) * cubeH;
    const x = alongZ ? across : along;
    const z = alongZ ? along : across;
    box(group, body,
      Math.max(0.14, cw - JOINT),
      Math.max(0.14, cubeH - JOINT),
      Math.max(0.14, cd - JOINT),
      x, y, z,
      { rough: 0.50, tint: tints[iy % 3] });
  }

  for (let iy = 0; iy < STAIR_COURSES; iy += 1) {
    // Last two courses are a 2-cube landing so the piers sit on mass, not air.
    const frontIz = iy < STAIR_COURSES - 2 ? iy : NZ - 2;
    for (let ix = 0; ix < NX; ix += 1) {
      for (let iz = 0; iz < NZ; iz += 1) {
        if (iz < frontIz) continue;
        putCube(ix, iy, iz);
      }
    }
    if (iy < STAIR_COURSES - 2) {
      const frontAlong = runMax - frontIz * cd;
      const yTop = base + (iy + 1) * cubeH;
      addStepCap(group, (across0 + across1) / 2, yTop - 0.010, frontAlong, alongZ, cw * 3.15);
    }
  }
  addStepCap(group, (across0 + across1) / 2, lid - 0.010, runMax - (NZ - 2) * cd, alongZ, cw * 3.15);

  const mid = (across0 + across1) / 2;
  for (let i = 0; i < 3; i += 1) {
    const along = runMin + ((i + 0.5) / 3) * (cd * 2);
    put(group, body, (across1 - across0) - 0.10, 0.068, (cd * 2) / 3 - 0.028,
      mid, lid + 0.012, along, alongZ, { rough: 0.50, tint: i % 2 === 0 ? 1 : 0.90 });
  }

  for (let iy = STAIR_COURSES; iy < STAIR_COURSES + pierN; iy += 1) {
    for (const pair of pierIxs) {
      for (const ix of pair) {
        for (const iz of pierIzs) putCube(ix, iy, iz);
      }
    }
  }

  const span = (STAIR_COURSES - 1) * cd;
  const railLen = Math.hypot(span, TOWER_H);
  const pitch = Math.atan2(TOWER_H, span);
  const midAlong = runMax - span / 2;
  const midY = base + TOWER_H / 2 + 0.44;
  const rot = alongZ ? [pitch, 0, 0] : [0, 0, -pitch];
  for (const s of [-1, 1]) {
    const off = (across1 - across0) * 0.42 * s;
    const x = alongZ ? mid + off : midAlong;
    const z = alongZ ? midAlong : mid + off;
    box(group, rail, alongZ ? 0.078 : railLen, 0.078, alongZ ? railLen : 0.078,
      x, midY, z, { rot, rough: 0.46 });
    box(group, rail, alongZ ? 0.056 : railLen, 0.056, alongZ ? railLen : 0.056,
      x, midY - 0.17, z, { rot, rough: 0.46 });
  }
  for (const s of [-1, 1]) {
    const off = (across1 - across0) * 0.42 * s;
    addCappedPost(group, rail,
      alongZ ? mid + off : runMax - 0.04, base, base + 0.58,
      alongZ ? runMax - 0.04 : mid + off, 0.10);
    addCappedPost(group, rail,
      alongZ ? mid + off : runMin + cd * 1.6, lid - 0.02, lid + 0.52,
      alongZ ? runMin + cd * 1.6 : mid + off, 0.10);
  }

  const landAlong0 = runMin;
  const landAlong1 = runMin + cd * 2.2;
  if (alongZ) {
    addRailX(group, across0 + 0.06, across1 - 0.06, lid, runMin + 0.08, { count: 4, paint: rail });
    addRailZ(group, landAlong0 + 0.08, landAlong1, lid, across0 + 0.06, { count: 3, paint: rail });
    addRailZ(group, landAlong0 + 0.08, landAlong1, lid, across1 - 0.06, { count: 3, paint: rail });
  } else {
    addRailZ(group, across0 + 0.06, across1 - 0.06, lid, runMin + 0.08, { count: 4, paint: rail });
    addRailX(group, landAlong0 + 0.08, landAlong1, lid, across0 + 0.06, { count: 3, paint: rail });
    addRailX(group, landAlong0 + 0.08, landAlong1, lid, across1 - 0.06, { count: 3, paint: rail });
  }

  const pierTop = base + (STAIR_COURSES + pierN) * cubeH;
  const pierAlong = runMin + cd;
  for (const pair of pierIxs) {
    const ix = (pair[0] + pair[1] + 1) / 2;
    const across = across0 + ix * cw;
    const x = alongZ ? across : pierAlong;
    const z = alongZ ? pierAlong : across;
    if (lookout) {
      box(group, TREAD, alongZ ? cw * 1.7 : cd * 1.6, 0.06, alongZ ? cd * 1.6 : cw * 1.7,
        x, pierTop + 0.02, z, PLASTIC);
    } else {
      const holeY = pierTop - cubeH * 1.15;
      put(group, GAP, cw * 0.72, 0.26, 0.08, across, holeY, pierAlong, alongZ, { rough: 0.92 });
      put(group, body, cw * 0.95, 0.08, cd * 1.55, across, pierTop + 0.02, pierAlong, alongZ,
        { rough: 0.50 });
    }
  }
  if (!lookout) {
    put(group, body, cw * 3.4, 0.09, 0.10, mid, pierTop + 0.02, pierAlong, alongZ, { rough: 0.50 });
  }

  if (lookout) {
    addTooledCanopy(group,
      alongZ ? mid : pierAlong,
      pierTop + 0.04,
      alongZ ? pierAlong : mid,
      accent);
  }

  put(group, GAP, across1 - across0 + 0.16, 0.05, 0.30,
    mid, base + 0.026, runMax + 0.01, alongZ, { rough: 0.95 });
}

/**
 * refs/4.jpg pavilion: hip lid on white sticks, yellow fascia, tooled ridge.
 * Not a blue shrine peak sitting on a keep.
 */
function addTooledCanopy(group, cx, yPole0, cz, accent) {
  const w = 1.26;
  const d = 1.04;
  const poleH = 0.84;
  const eave = yPole0 + poleH;
  const rise = 0.24;
  const peak = eave + rise;
  const corners = [
    [cx - w / 2 + 0.08, cz - d / 2 + 0.08],
    [cx + w / 2 - 0.08, cz - d / 2 + 0.08],
    [cx - w / 2 + 0.08, cz + d / 2 - 0.08],
    [cx + w / 2 - 0.08, cz + d / 2 - 0.08],
  ];
  for (const [px, pz] of corners) {
    box(group, VOXEL_COLOURS.steel, 0.062, 0.030, 0.062, px, yPole0 + 0.018, pz, { metal: 0.36 });
    cyl(group, TREAD, 0.034, poleH, px, yPole0 + poleH / 2, pz, 8, { rough: 0.40 });
    box(group, VOXEL_COLOURS.sun, 0.068, 0.036, 0.068, px, eave, pz, { rough: 0.46 });
  }

  box(group, TREAD, w - 0.18, 0.034, d - 0.18, cx, eave + 0.018, cz, PLASTIC);

  const fh = 0.100;
  box(group, VOXEL_COLOURS.sun, w + 0.02, fh, 0.058, cx, eave - 0.012, cz - d / 2, { rough: 0.46 });
  box(group, VOXEL_COLOURS.sun, w + 0.02, fh, 0.058, cx, eave - 0.012, cz + d / 2, { rough: 0.46 });
  box(group, VOXEL_COLOURS.sun, 0.058, fh, d + 0.02, cx - w / 2, eave - 0.012, cz, { rough: 0.46 });
  box(group, VOXEL_COLOURS.sun, 0.058, fh, d + 0.02, cx + w / 2, eave - 0.012, cz, { rough: 0.46 });
  for (let i = 0; i < 7; i += 1) {
    const t = (i + 0.5) / 7;
    const x = cx - w / 2 + t * w;
    box(group, VOXEL_COLOURS.sun, 0.062, 0.12, 0.028, x, eave - 0.10, cz - d / 2, { rough: 0.46 });
    box(group, VOXEL_COLOURS.sun, 0.062, 0.12, 0.028, x, eave - 0.10, cz + d / 2, { rough: 0.46 });
  }

  const halfD = d / 2;
  const halfW = w / 2;
  const pitchZ = Math.atan2(rise, halfD);
  const pitchX = Math.atan2(rise, halfW);
  const lenZ = Math.hypot(halfD, rise);
  const lenX = Math.hypot(halfW, rise);
  box(group, TEAL, w - 0.10, 0.052, lenZ,
    cx, (eave + peak) / 2, cz - halfD / 2, { rot: [pitchZ, 0, 0], rough: 0.44 });
  box(group, TEAL, w - 0.10, 0.052, lenZ,
    cx, (eave + peak) / 2, cz + halfD / 2, { rot: [-pitchZ, 0, 0], rough: 0.44 });
  box(group, TEAL, lenX, 0.052, d - 0.18,
    cx - halfW / 2, (eave + peak) / 2, cz, { rot: [0, 0, -pitchX], rough: 0.44 });
  box(group, TEAL, lenX, 0.052, d - 0.18,
    cx + halfW / 2, (eave + peak) / 2, cz, { rot: [0, 0, pitchX], rough: 0.44 });

  box(group, TREAD, 0.44, 0.048, 0.080, cx, peak + 0.012, cz, PLASTIC);
  box(group, VOXEL_COLOURS.sun, 0.16, 0.055, 0.10, cx, peak + 0.048, cz, { rough: 0.46 });
  taper(group, VOXEL_COLOURS.steel, 0.012, 0.018, 0.15, cx, peak + 0.14, cz, 8, { metal: 0.38 });
  box(group, accent, 0.15, 0.07, 0.026, cx + 0.09, peak + 0.17, cz, { rough: 0.50 });
}

function addSole(group, b, base) {
  box(group, EXTRA.rubberSole, b.w - 0.06, 0.055, b.d - 0.06, b.cx, base + 0.028, b.cz, { rough: 0.95 });
}

function buildStairTower(group, entry, base, colour, { lookout = false } = {}) {
  const b = boundsOf(entry);
  const alongZ = alongZOf(entry);
  addSole(group, b, base);
  addStackedCubeTower(group, b, base, alongZ, { lookout, accent: accentOf(colour) });
}

export function buildDeckPlatform(group, entry, base, colour) {
  buildStairTower(group, entry, base, colour, { lookout: false });
}

export function buildDeckStairs(group, entry, base, colour) {
  void colour;
  const b = boundsOf(entry);
  const lid = base + LEVEL_H;
  const { d } = spanOf(entry.id, entry.yaw ?? 0, entry.variant);
  addSole(group, b, base);
  addMouldedFlight(group, b, base, lid, { alongZ: d > 1, full: true, steps: STEPS });
}

export function buildDeckBridge(group, entry, base, colour) {
  void colour;
  const b = boundsOf(entry);
  const { w } = spanOf(entry.id, entry.yaw ?? 0, entry.variant);
  const alongX = w > 1;
  const lid = base + LEVEL_H;
  const body = bodyOf();
  const half = 0.30;
  const alongs = alongX
    ? [b.minX + 0.12, (b.minX + b.cx) / 2, (b.maxX + b.cx) / 2, b.maxX - 0.12]
    : [b.minZ + 0.12, (b.minZ + b.cz) / 2, (b.maxZ + b.cz) / 2, b.maxZ - 0.12];
  addSole(group, b, base);
  for (const a of alongs) {
    for (const s of [-1, 1]) {
      addCappedPost(group, body,
        alongX ? a : b.cx + s * half, base, lid, alongX ? b.cz + s * half : a, 0.12);
    }
  }
  if (alongX) {
    for (const s of [-1, 0, 1]) {
      box(group, body, b.w - 0.16, 0.08, 0.09, b.cx, lid - 0.14, b.cz + s * 0.22, { rough: 0.50 });
    }
  } else {
    for (const s of [-1, 0, 1]) {
      box(group, body, 0.09, 0.08, b.d - 0.16, b.cx + s * 0.22, lid - 0.14, b.cz, { rough: 0.50 });
    }
  }
  const slats = 9;
  for (let i = 0; i < slats; i += 1) {
    const t = (i + 0.5) / slats;
    const tint = i % 2 === 0 ? 1 : 0.88;
    if (alongX) {
      box(group, body, (b.w - 0.18) / slats - 0.022, 0.07, 0.70,
        b.minX + 0.09 + t * (b.w - 0.18), lid - 0.03, b.cz, { rough: 0.50, tint });
    } else {
      box(group, body, 0.70, 0.07, (b.d - 0.18) / slats - 0.022,
        b.cx, lid - 0.03, b.minZ + 0.09 + t * (b.d - 0.18), { rough: 0.50, tint });
    }
  }
  const paint = VOXEL_COLOURS.steel;
  if (alongX) {
    addRailX(group, b.minX + 0.10, b.maxX - 0.10, lid, b.minZ + 0.10, { count: 7, paint });
    addRailX(group, b.minX + 0.10, b.maxX - 0.10, lid, b.maxZ - 0.10, { count: 7, paint });
  } else {
    addRailZ(group, b.minZ + 0.10, b.maxZ - 0.10, lid, b.minX + 0.10, { count: 7, paint });
    addRailZ(group, b.minZ + 0.10, b.maxZ - 0.10, lid, b.maxX - 0.10, { count: 7, paint });
  }
}

export function buildDeckLookout(group, entry, base, colour) {
  buildStairTower(group, entry, base, colour, { lookout: true });
}
