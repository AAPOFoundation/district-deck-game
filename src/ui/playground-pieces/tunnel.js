// Tunnel family — four crawl-toy variants. Shared kit only.
// Kid-scale crawl tube: a pawn vanishes into a dark hole, but the object
// is playground equipment the size of a slide-foot tube, not a cistern.
// Palette is forced (barrel=sky, elbow=sun, climb=coral, portal=sky+sun). Lime is ignored.
import {
  EXTRA, VOXEL_COLOURS,
  box, cyl, mat, boundsOf,
} from './_kit.js';
import { spanOf, variantIndexOf } from '../../core/playground-builder.js';
import * as THREE from 'three';

const SKY = VOXEL_COLOURS.sky;
const SUN = VOXEL_COLOURS.sun;
const CORAL = VOXEL_COLOURS.coral;
const WHITE = EXTRA.paverPale;
const SOLE = EXTRA.rubberSole;
const SEGS = 14;
const PAINT = new Map();

function paint(colour, extras = {}) {
  const side = extras.side ?? THREE.FrontSide;
  if (side === THREE.FrontSide) return mat(colour, extras);
  const key = `${colour}:${extras.rough ?? 0.62}:${extras.metal ?? 0.05}:${extras.tint ?? 1}:${side}`;
  if (!PAINT.has(key)) {
    const material = mat(colour, extras).clone();
    material.side = side;
    PAINT.set(key, material);
  }
  return PAINT.get(key);
}

function tubeAlongZ(entry) {
  const { w, d } = spanOf(entry.id, entry.yaw ?? 0, entry.variant);
  if (d !== w) return d > w;
  const yaw = ((Math.round((entry.yaw ?? 0) / 90) % 4) + 4) % 4;
  return yaw % 2 === 0;
}

function addPipe(group, colour, r, length, x, y, z, alongZ, extras = {}) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, length, extras.segs ?? SEGS, 1, true),
    paint(colour, extras),
  );
  mesh.position.set(x, y, z);
  if (alongZ) mesh.rotation.x = Math.PI / 2;
  else mesh.rotation.z = Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addLip(group, colour, inner, outer, x, y, z, alongZ, extras = {}) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, extras.segs ?? SEGS),
    paint(colour, { ...extras, side: THREE.DoubleSide }),
  );
  mesh.position.set(x, y, z);
  if (!alongZ) mesh.rotation.y = Math.PI / 2;
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

function addRod(group, colour, r, length, x, y, z, alongZ, extras = {}) {
  return cyl(group, colour, r, length, x, y, z, extras.segs ?? 8, {
    rough: extras.rough ?? 0.5,
    rot: alongZ ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2],
  });
}

function addTorus(group, colour, radius, tube, x, y, z, alongZ, extras = {}) {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, extras.radial ?? 8, extras.tubular ?? 14, extras.arc ?? Math.PI * 2),
    paint(colour, extras),
  );
  mesh.position.set(x, y, z);
  if (!alongZ) mesh.rotation.y = Math.PI / 2;
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

function axisPoint(cx, cy, cz, length, alongZ, t) {
  const u = (t - 0.5) * length;
  return alongZ ? [cx, cy, cz + u] : [cx + u, cy, cz];
}

function bolts(group, x, y, z, r, alongZ) {
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    box(group, VOXEL_COLOURS.steel, 0.04, 0.04, 0.04,
      x + (alongZ ? Math.cos(a) * r : 0),
      y + Math.sin(a) * r,
      z + (alongZ ? 0 : Math.cos(a) * r),
      { metal: 0.38 });
  }
}

/**
 * Yellow play collar you crawl into, then wall section, then a receding dark throat.
 * Sole rings eat light. They stay rings — the bore is not plugged.
 */
function mouth(group, cx, cy, cz, alongZ, rOut, rIn, opts = {}) {
  const flange = opts.flange ?? SUN;
  const wall = opts.wall ?? SKY;
  addTorus(group, flange, rOut + 0.02, 0.055, cx, cy, cz, alongZ, { rough: 0.48 });
  addPipe(group, flange, rOut + 0.07, 0.15, cx, cy, cz, alongZ, { rough: 0.5 });
  addLip(group, flange, rOut + 0.008, rOut + 0.082, cx, cy, cz, alongZ, { rough: 0.48 });
  addLip(group, wall, rIn + 0.008, rOut + 0.014, cx, cy, cz, alongZ, { rough: 0.54 });
  addLip(group, flange, rIn, rIn + 0.022, cx, cy, cz, alongZ, { rough: 0.46 });
  const dir = opts.dir ?? 1;
  const step = (inset) => (alongZ
    ? [cx, cy, cz + dir * inset]
    : [cx + dir * inset, cy, cz]);
  // One thin sole ring — a second shrinking lip read as a plug and hid the rungs.
  const a = step(0.055);
  addLip(group, SOLE, rIn * 0.90, rIn + 0.002, a[0], a[1], a[2], alongZ, {
    rough: 0.97, tint: 0.14,
  });
}

/** Side grab rails a child holds to crawl in. Toy tube, not a fitting. */
function grabRails(group, cx, cy, cz, length, alongZ, rOut) {
  const railLen = length * 0.62;
  const stand = rOut + 0.08;
  for (const s of [-1, 1]) {
    const x = alongZ ? cx + s * stand : cx;
    const z = alongZ ? cz : cz + s * stand;
    addRod(group, SUN, 0.042, railLen, x, cy + rOut * 0.08, z, alongZ);
    for (const t of [0.24, 0.50, 0.76]) {
      const [px, , pz] = axisPoint(cx, cy, cz, length, alongZ, t);
      box(group, SUN,
        alongZ ? 0.10 : 0.05, 0.05, alongZ ? 0.05 : 0.10,
        alongZ ? cx + s * (rOut + 0.04) : px,
        cy + rOut * 0.08,
        alongZ ? pz : cz + s * (rOut + 0.04),
        { rough: 0.5 });
    }
  }
}

/** Over-mouth grab arch — posts + rail + half-torus. Silhouette of play equipment. */
function playArch(group, x, y, z, alongZ, rOut) {
  const postR = 0.042;
  const postH = rOut * 1.08;
  const span = rOut * 1.64;
  const poke = 0.06;
  for (const s of [-1, 1]) {
    cyl(group, SUN, postR, postH,
      alongZ ? x + s * span * 0.48 : x + poke,
      y + rOut * 0.16,
      alongZ ? z + poke : z + s * span * 0.48,
      8, { rough: 0.48 });
  }
  addRod(group, SUN, postR, span,
    alongZ ? x : x + poke,
    y + rOut * 0.68,
    alongZ ? z + poke : z,
    !alongZ);
  addTorus(group, SUN, rOut + 0.10, 0.034,
    alongZ ? x : x + poke,
    y,
    alongZ ? z + poke : z,
    alongZ, { rough: 0.48, arc: Math.PI });
}

function hoopAt(group, x, y, z, alongZ, rOut) {
  playArch(group, x, y, z, alongZ, rOut);
}

function facePorthole(mesh, facing) {
  if (facing === 'up') mesh.rotation.x = -Math.PI / 2;
  else if (facing === 'x') mesh.rotation.y = Math.PI / 2;
}

/** Proud sun frame + dark glass. Top-facing so the iso plate can see them. */
function porthole(group, x, y, z, facing) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.065, 0.11, SEGS),
    paint(SUN, { rough: 0.48, side: THREE.DoubleSide }),
  );
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(0.066, SEGS),
    paint(SOLE, { rough: 0.95, tint: 0.34, side: THREE.DoubleSide }),
  );
  ring.position.set(x, y, z);
  glass.position.set(x, y, z);
  facePorthole(ring, facing);
  facePorthole(glass, facing);
  ring.castShadow = true;
  group.add(ring);
  group.add(glass);
}

function topPorts(group, cx, cy, cz, length, alongZ, rOut) {
  for (const t of [0.36, 0.64]) {
    const [x, , z] = axisPoint(cx, cy, cz, length, alongZ, t);
    porthole(group, x, cy + rOut + 0.014, z, 'up');
  }
}

const GLOW = new Map();

/** Pale sun that holds value inside an unlit bore. Shared clone — do not mutate. */
function glow(colour, extras = {}) {
  const glowAmt = extras.glow ?? 0.30;
  const key = `${colour}:${extras.rough ?? 0.34}:${glowAmt}`;
  if (!GLOW.has(key)) {
    const material = paint(colour, { rough: extras.rough ?? 0.34, side: THREE.DoubleSide }).clone();
    material.emissive = new THREE.Color(SUN);
    material.emissiveIntensity = glowAmt;
    GLOW.set(key, material);
  }
  return GLOW.get(key);
}

function liveRung(group, colour, w, h, d, x, y, z, extras = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glow(colour, extras));
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  return mesh;
}

/**
 * Fat pale floor rungs packed into the visible cone of a mouth.
 * Family iso looks ~55° off the tube axis, so only the first ~0.5 m of bore is
 * on screen. Rungs sit in the lower third so the upper disk stays a dark throat.
 */
function mouthRungs(group, cx, cy, cz, length, alongZ, rIn, count = 6, from = 'both') {
  const first = 0.42;
  const last = Math.min(1.10, length * 0.72);
  const ends = from === 'both' ? [1, -1] : from === 'far' ? [-1] : [1];
  const thick = 0.058;
  const treadY = cy - rIn * 0.30;
  for (const dir of ends) {
    for (let i = 0; i < count; i += 1) {
      const inset = count === 1 ? first : first + (i / (count - 1)) * (last - first);
      const t = dir === 1 ? 1 - inset / length : inset / length;
      const [x, , z] = axisPoint(cx, cy, cz, length, alongZ, t);
      liveRung(group, SOLE,
        alongZ ? rIn * 1.46 : thick,
        0.095,
        alongZ ? thick : rIn * 1.46,
        x, treadY, z);
      liveRung(group, SOLE,
        alongZ ? rIn * 1.16 : thick * 0.62,
        0.040,
        alongZ ? thick * 0.62 : rIn * 1.16,
        x, treadY + 0.054, z, { glow: 0.22 });
      for (const s of [-1, 1]) {
        liveRung(group, SOLE,
          alongZ ? 0.055 : thick,
          0.055,
          alongZ ? thick : 0.055,
          alongZ ? cx + s * rIn * 0.68 : x,
          treadY,
          alongZ ? z : cz + s * rIn * 0.68);
      }
    }
  }
}

function irisAt(group, cx, cy, cz, alongZ, t, length, rIn, hole, tint = 0.10) {
  const [x, y, z] = axisPoint(cx, cy, cz, length, alongZ, t);
  addLip(group, SOLE, hole, rIn - 0.004, x, y, z, alongZ, {
    rough: 0.97, tint,
  });
}

/** Smooth hollow barrel. BackSide lining — the cavity eats light, not the silhouette. */
function bore(group, colour, cx, cy, cz, length, alongZ, opts = {}) {
  const rOut = opts.rOut ?? 0.51;
  const rIn = opts.rIn ?? 0.35;
  const lining = opts.lining ?? SOLE;
  const liningTint = opts.liningTint ?? 0.16;
  addPipe(group, colour, rOut, length, cx, cy, cz, alongZ, { rough: 0.52 });
  addPipe(group, lining, rIn, length - 0.02, cx, cy, cz, alongZ, {
    rough: 0.96, side: THREE.BackSide, tint: liningTint,
  });
  if (opts.throat !== false) {
    const throatLen = Math.max(0.42, length * 0.70);
    const [tx, ty, tz] = axisPoint(cx, cy, cz, length, alongZ, opts.throatAt ?? 0.36);
    addPipe(group, lining, rIn * 0.86, throatLen, tx, ty, tz, alongZ, {
      rough: 0.97, side: THREE.BackSide, tint: opts.throatTint ?? 0.08,
    });
  }
  if (opts.iris) {
    const stops = Array.isArray(opts.iris) ? opts.iris : [0.50];
    for (const stop of stops) {
      const t = typeof stop === 'number' ? stop : stop.t;
      const hole = typeof stop === 'number' ? rIn * 0.52 : (stop.hole ?? rIn * 0.52);
      const tint = typeof stop === 'number' ? 0.10 : (stop.tint ?? 0.10);
      irisAt(group, cx, cy, cz, alongZ, t, length, rIn, hole, tint);
    }
  }
  if (opts.mouths !== 'none') {
    for (const end of [0, 1]) {
      if (opts.mouths === 'near' && end === 0) continue;
      const [x, y, z] = axisPoint(cx, cy, cz, length, alongZ, end);
      mouth(group, x, y, z, alongZ, rOut, rIn, {
        flange: opts.flange ?? SUN,
        wall: colour,
        dir: end === 0 ? 1 : -1,
      });
    }
  }
}

/** Compact plastic cradles on rubber coins. They hold the tube; they are not haunches. */
function shoes(group, cx, baseY, cz, length, alongZ, accent) {
  const half = length / 2 - 0.28;
  for (const s of [-1, 1]) {
    const x = alongZ ? cx : cx + s * half;
    const z = alongZ ? cz + s * half : cz;
    box(group, SOLE, 0.56, 0.06, 0.46, x, baseY + 0.03, z, { rough: 0.95 });
    box(group, accent,
      alongZ ? 0.42 : 0.28, 0.13, alongZ ? 0.28 : 0.42,
      x, baseY + 0.10, z, { rough: 0.5 });
    for (const side of [-1, 1]) {
      box(group, accent,
        alongZ ? 0.08 : 0.24, 0.18, alongZ ? 0.24 : 0.08,
        alongZ ? x + side * 0.22 : x,
        baseY + 0.18,
        alongZ ? z : z + side * 0.22,
        { rough: 0.5 });
    }
  }
}

/** Rubber step + yellow threshold outside a mouth. You crawl up into the hole. */
function crawlStoop(group, x, baseY, z, alongZ, dir) {
  const ox = alongZ ? 0 : dir * 0.20;
  const oz = alongZ ? dir * 0.20 : 0;
  box(group, SOLE,
    alongZ ? 0.56 : 0.26, 0.07, alongZ ? 0.26 : 0.56,
    x + ox, baseY + 0.035, z + oz, { rough: 0.95 });
  box(group, SUN,
    alongZ ? 0.40 : 0.12, 0.055, alongZ ? 0.12 : 0.40,
    x + ox * 0.55, baseY + 0.08, z + oz * 0.55, { rough: 0.5 });
}

function darkCap(group, x, y, z, r, alongZ, tint = 0.14) {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(r, SEGS),
    paint(SOLE, { rough: 0.97, tint }),
  );
  mesh.position.set(x, y, z);
  if (!alongZ) mesh.rotation.y = Math.PI / 2;
  group.add(mesh);
}

export function buildTunnel(group, entry, base, colour) {
  void colour;
  const v = variantIndexOf(entry.variant);
  if (v === 1) return buildTunnelElbow(group, entry, base);
  if (v === 2) return buildTunnelClimb(group, entry, base);
  if (v === 3) return buildTunnelPortal(group, entry, base);
  return buildTunnelBarrel(group, entry, base);
}

export function buildTunnelBarrel(group, entry, base) {
  const b = boundsOf(entry);
  const alongZ = tubeAlongZ(entry);
  const rOut = 0.51;
  const rIn = 0.35;
  const length = (alongZ ? b.d : b.w) + 0.92;
  const cy = base + rOut + 0.10;
  bore(group, SKY, b.cx, cy, b.cz, length, alongZ, {
    rOut, rIn, liningTint: 0.08, throatTint: 0.04, throatAt: 0.28,
    mouths: 'near',
    iris: [
      { t: 0.18, hole: rIn * 0.32, tint: 0.045 },
      { t: 0.40, hole: rIn * 0.40, tint: 0.06 },
      { t: 0.62, hole: rIn * 0.28, tint: 0.04 },
    ],
  });
  grabRails(group, b.cx, cy, b.cz, length, alongZ, rOut);
  mouthRungs(group, b.cx, cy, b.cz, length, alongZ, rIn, 6, 'near');
  topPorts(group, b.cx, cy, b.cz, length, alongZ, rOut);
  const [nx, , nz] = axisPoint(b.cx, cy, b.cz, length, alongZ, 1);
  const [fx, , fz] = axisPoint(b.cx, cy, b.cz, length, alongZ, 0);
  hoopAt(group, nx, cy, nz, alongZ, rOut);
  crawlStoop(group, nx, base, nz, alongZ, 1);
  darkCap(group, fx, cy, fz, rIn - 0.01, alongZ, 0.06);
  shoes(group, b.cx, base, b.cz, length, alongZ, SUN);
  for (const t of [0.22, 0.78]) {
    const [x, , z] = axisPoint(b.cx, cy, b.cz, length, alongZ, t);
    box(group, SUN,
      alongZ ? 0.20 : 0.11, 0.055, alongZ ? 0.11 : 0.20,
      x, cy + rOut + 0.04, z, { rough: 0.52 });
  }
}

/** Two mouths + a knuckle fitting. Play grips on the cube so it is kit, not plumbing. */
export function buildTunnelElbow(group, entry, base) {
  const b = boundsOf(entry);
  const rOut = 0.42;
  const rIn = 0.28;
  const house = 0.80;
  const cy = base + house / 2 + 0.08;
  const kx = b.minX + 0.50;
  const kz = b.minZ + 0.50;
  const zJoin = kz + house / 2 - 0.02;
  const zMouth = b.maxZ + 0.14;
  const zLen = Math.max(0.88, zMouth - zJoin);
  const zMid = zJoin + zLen / 2;
  const xJoin = kx + house / 2 - 0.02;
  const xMouth = b.maxX + 0.14;
  const xLen = Math.max(0.88, xMouth - xJoin);
  const xMid = xJoin + xLen / 2;

  bore(group, SUN, kx, cy, zMid, zLen, true, {
    rOut, rIn, flange: SUN, mouths: 'near', liningTint: 0.12, throatTint: 0.07, throatAt: 0.34,
    iris: [{ t: 0.28, hole: rIn * 0.40, tint: 0.07 }],
  });
  bore(group, SUN, xMid, cy, kz, xLen, false, {
    rOut, rIn, flange: SUN, mouths: 'near', liningTint: 0.12, throatTint: 0.07, throatAt: 0.34,
    iris: [{ t: 0.28, hole: rIn * 0.40, tint: 0.07 }],
  });
  darkCap(group, kx, cy, zJoin + 0.03, rIn - 0.008, true, 0.10);
  darkCap(group, xJoin + 0.03, cy, kz, rIn - 0.008, false, 0.10);
  mouthRungs(group, kx, cy, zMid, zLen, true, rIn, 5, 'near');
  mouthRungs(group, xMid, cy, kz, xLen, false, rIn, 5, 'near');

  box(group, SKY, house, house, house, kx, cy, kz, { rough: 0.52 });
  box(group, CORAL, house + 0.04, 0.09, house + 0.04, kx, cy, kz, { rough: 0.52 });
  addPipe(group, CORAL, rOut + 0.06, 0.10, kx, cy, zJoin, true, { rough: 0.52 });
  addPipe(group, CORAL, rOut + 0.06, 0.10, xJoin, cy, kz, false, { rough: 0.52 });
  cyl(group, SUN, 0.12, 0.055, kx, cy + house / 2 + 0.03, kz, 8, { rough: 0.5 });
  bolts(group, kx, cy + house / 2 + 0.04, kz, 0.09, true);
  porthole(group, kx, cy + house / 2 + 0.07, kz, 'up');

  for (const s of [-1, 1]) {
    box(group, CORAL, 0.055, 0.16, 0.055,
      kx + s * 0.16, cy + house / 2 + 0.10, kz, { rough: 0.5 });
  }
  box(group, CORAL, 0.36, 0.055, 0.055, kx, cy + house / 2 + 0.18, kz, { rough: 0.48 });
  box(group, SUN, 0.07, 0.08, 0.18, kx + house / 2 + 0.04, cy + 0.06, kz, { rough: 0.5 });
  box(group, SUN, 0.18, 0.08, 0.07, kx, cy + 0.06, kz + house / 2 + 0.04, { rough: 0.5 });
  hoopAt(group, kx, cy, zMouth, true, rOut);
  hoopAt(group, xMouth, cy, kz, false, rOut);
  crawlStoop(group, kx, base, zMouth, true, 1);
  crawlStoop(group, xMouth, base, kz, false, 1);

  box(group, SOLE, 0.42, 0.055, 0.42, kx, base + 0.028, zMid, { rough: 0.95 });
  box(group, CORAL, 0.26, 0.10, 0.22, kx, base + 0.085, zMid, { rough: 0.52 });
  box(group, SOLE, 0.42, 0.055, 0.42, xMid, base + 0.028, kz, { rough: 0.95 });
  box(group, CORAL, 0.22, 0.10, 0.26, xMid, base + 0.085, kz, { rough: 0.52 });
}

/** Fat rungs inside the bore, readable looking into the mouth. */
export function buildTunnelClimb(group, entry, base) {
  const b = boundsOf(entry);
  const alongZ = tubeAlongZ(entry);
  const rOut = 0.46;
  const rIn = 0.32;
  const length = (alongZ ? b.d : b.w) + 0.38;
  const rise = 0.38;
  const slope = Math.atan2(rise, length);
  const cy = base + rOut + 0.10 + rise / 2;
  const tube = new THREE.Group();
  bore(tube, CORAL, 0, 0, 0, length, alongZ, {
    rOut, rIn, flange: SUN,
    lining: SOLE, liningTint: 0.11, throatTint: 0.055, throatAt: 0.32,
    iris: [
      { t: 0.16, hole: rIn * 0.36, tint: 0.055 },
      { t: 0.36, hole: rIn * 0.50, tint: 0.075 },
    ],
  });
  grabRails(tube, 0, 0, 0, length, alongZ, rOut);
  mouthRungs(tube, 0, 0, 0, length, alongZ, rIn, 6, 'both');
  topPorts(tube, 0, 0, 0, length, alongZ, rOut);
  const [mx, , mz] = axisPoint(0, 0, 0, length, alongZ, 1);
  const [nx, , nz] = axisPoint(0, 0, 0, length, alongZ, 0);
  hoopAt(tube, mx, 0, mz, alongZ, rOut);
  hoopAt(tube, nx, 0, nz, alongZ, rOut);
  tube.position.set(b.cx, cy, b.cz);
  if (alongZ) tube.rotation.x = slope;
  else tube.rotation.z = -slope;
  group.add(tube);
  const half = length / 2;
  const low = alongZ
    ? [b.cx, b.cz + half * 0.82]
    : [b.cx + half * 0.82, b.cz];
  const high = alongZ
    ? [b.cx, b.cz - half * 0.82]
    : [b.cx - half * 0.82, b.cz];
  box(group, SOLE, 0.48, 0.055, 0.48, low[0], base + 0.028, low[1], { rough: 0.95 });
  box(group, SUN, 0.32, 0.11, 0.24, low[0], base + 0.085, low[1], { rough: 0.52 });
  box(group, SOLE, 0.40, 0.055, 0.40, high[0], base + 0.028, high[1], { rough: 0.95 });
  box(group, SUN, 0.26, 0.10, 0.20, high[0], base + 0.085, high[1], { rough: 0.52 });
  crawlStoop(group, low[0], base, low[1], alongZ, 1);
}

/** Crawl mouth you vanish into. Yellow collar is the entrance; the run is the hole. */
export function buildTunnelPortal(group, entry, base) {
  const b = boundsOf(entry);
  const alongZ = tubeAlongZ(entry);
  const rOut = 0.46;
  const rIn = 0.32;
  const depth = 1.28;
  const cy = base + 0.12 + rOut;
  bore(group, SKY, b.cx, cy, b.cz, depth, alongZ, {
    rOut, rIn, flange: SUN, mouths: 'none', liningTint: 0.10, throatTint: 0.05, throatAt: 0.30,
    iris: [
      { t: 0.22, hole: rIn * 0.34, tint: 0.05 },
      { t: 0.44, hole: rIn * 0.48, tint: 0.07 },
    ],
  });
  const [fx, , fz] = axisPoint(b.cx, cy, b.cz, depth, alongZ, 1);
  const [bx, , bz] = axisPoint(b.cx, cy, b.cz, depth, alongZ, 0);
  darkCap(group, alongZ ? bx : bx + 0.016, cy, alongZ ? bz + 0.016 : bz, rIn - 0.008, alongZ, 0.08);
  addPipe(group, SUN, rOut + 0.03, 0.09,
    alongZ ? bx : bx + 0.016, cy, alongZ ? bz + 0.016 : bz,
    alongZ, { rough: 0.52 });

  const faceR = rOut + 0.06;
  addPipe(group, SUN, faceR, 0.14, fx, cy, fz, alongZ, { rough: 0.5 });
  addLip(group, SUN, rOut + 0.05, faceR + 0.025, fx, cy, fz, alongZ, { rough: 0.48 });
  mouth(group, fx, cy, fz, alongZ, rOut, rIn, {
    flange: SUN, wall: SKY, dir: -1,
  });
  mouthRungs(group, b.cx, cy, b.cz, depth, alongZ, rIn, 6, 'near');

  const poke = 0.10;
  const eyeY = cy + rIn + 0.10;
  const eyeSep = rOut * 0.38;
  for (const s of [-1, 1]) {
    const ex = alongZ ? b.cx + s * eyeSep : fx + poke;
    const ez = alongZ ? fz + poke : b.cz + s * eyeSep;
    const eyeRot = alongZ ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2];
    cyl(group, WHITE, 0.038, 0.045, ex, eyeY, ez, 8, { rough: 0.48, rot: eyeRot });
    cyl(group, SOLE, 0.018, 0.028, ex, eyeY + 0.008, ez, 8, {
      rough: 0.9, tint: 0.50, rot: eyeRot,
    });
  }

  for (const s of [-1, 1]) {
    box(group, CORAL, 0.07, 0.22, 0.07,
      alongZ ? b.cx + s * (faceR + 0.03) : fx + 0.03,
      cy + 0.04,
      alongZ ? fz + 0.03 : b.cz + s * (faceR + 0.03),
      { rough: 0.5 });
    box(group, SUN, 0.055, 0.08, 0.055,
      alongZ ? b.cx + s * (faceR + 0.055) : fx + 0.055,
      cy + 0.04,
      alongZ ? fz + 0.03 : b.cz + s * (faceR + 0.055),
      { rough: 0.48 });
  }
  box(group, CORAL,
    alongZ ? rIn * 1.20 : 0.09, 0.08, alongZ ? 0.09 : rIn * 1.20,
    alongZ ? b.cx : fx + 0.04, cy - rIn * 0.76, alongZ ? fz + 0.04 : b.cz,
    { rough: 0.5 });

  grabRails(group, b.cx, cy, b.cz, depth * 0.72, alongZ, rOut);
  hoopAt(group, fx, cy, fz, alongZ, faceR);
  crawlStoop(group, fx, base, fz, alongZ, 1);
  porthole(group, b.cx, cy + rOut + 0.014, b.cz, 'up');

  box(group, SOLE, 0.72, 0.055, 0.72, b.cx, base + 0.028, b.cz, { rough: 0.95 });
  box(group, SKY, 0.52, 0.10, 0.52, b.cx, base + 0.085, b.cz, { rough: 0.52 });
  box(group, SUN,
    alongZ ? 0.44 : 0.12, 0.07, alongZ ? 0.12 : 0.44,
    alongZ ? b.cx : fx + 0.03, base + 0.085, alongZ ? fz + 0.03 : b.cz,
    { rough: 0.5 });
}
