// Slide family — four variants. Shared kit only.
// Bar: chrome-yellow U-channel that leaves the 2×2 lid and dies on the pad (refs/4.jpg, refs/1.jpg).
import {
  EXTRA, VOXEL_COLOURS, LEVEL_H,
  box, cyl, taper, mat, boundsOf, wobble,
} from './_kit.js';
import { spanOf, variantIndexOf } from '../../core/playground-builder.js';
import * as THREE from 'three';

const Y_UP = new THREE.Vector3(0, 1, 0);
const Z_FWD = new THREE.Vector3(0, 0, 1);
/** Chrome-yellow toy plastic. sun #e2b74a is mustard and reads timber at iso. */
const TOY = '#f5ce12';
const STRIPE = VOXEL_COLOURS.coral;
const THROAT = EXTRA.rubberSole;
/** Match deck.js tower lid so a y=1 chute leaves the tall mass, not a one-level shelf. */
const TOWER_H = LEVEL_H * 2.6;

const SIDE_MATS = new Map();

function paint(colour, extras = {}) {
  const side = extras.side ?? THREE.FrontSide;
  if (side === THREE.FrontSide) return mat(colour, extras);
  const key = `${colour}:${extras.rough ?? 0.62}:${extras.metal ?? 0.05}:${extras.tint ?? 1}:${side}`;
  if (!SIDE_MATS.has(key)) {
    const material = mat(colour, extras).clone();
    material.side = side;
    SIDE_MATS.set(key, material);
  }
  return SIDE_MATS.get(key);
}

export function buildSlide(group, entry, base, colour) {
  void colour;
  const v = variantIndexOf(entry.variant);
  if (v === 1) return buildSlideWave(group, entry, base);
  if (v === 2) return buildSlideTube(group, entry, base);
  if (v === 3) return buildSlideRunout(group, entry, base);
  return buildSlideChute(group, entry, base);
}

/**
 * Capture parks the 1×3 at the same (x, z) as the 2×2 host, y=1.
 * Head sits on the last of that lid; the ribbon leaves the eave, not minZ.
 */
function frameOf(entry, base) {
  const b = boundsOf(entry);
  const { d } = spanOf(entry.id, entry.yaw ?? 0, entry.variant);
  const alongZ = d > 1;
  const y = entry.y ?? 0;
  const padY = y > 0 ? base - y * LEVEL_H : base;
  const lid = padY + TOWER_H;
  const top = lid + 0.04;
  const grade = padY;
  const length = alongZ ? b.d : b.w;
  const min = alongZ ? b.minZ : b.minX;
  // Start on the 2×2 eave; hang past the 1×3 so the run is as long as a swing bay.
  const host = Math.min(length * 0.50, 1.62);
  const overhang = 1.55;
  const span = Math.max(2.20, length - host + overhang);
  return {
    b,
    alongZ,
    top,
    grade,
    span,
    start: min + host,
    leaveT: 0.06,
  };
}

function at(frame, along, lateral = 0) {
  return frame.alongZ
    ? { x: frame.b.cx + lateral, z: along }
    : { x: along, z: frame.b.cz + lateral };
}

function pointOn(frame, t, profile, lateral) {
  const p = at(frame, frame.start + t * frame.span, lateral(t));
  return { x: p.x, y: profile(t), z: p.z };
}

function tag(mesh, section) {
  mesh.userData.section = section;
  return mesh;
}

function boxRot(alongZ, slope, yaw) {
  return alongZ ? [slope, yaw, 0] : [0, -yaw, -slope];
}

function smooth01(t) {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

/** Flat on the eave, banana through the middle, last 14 % already on the pad. */
function chuteProfile(t, top, grade, leaveT) {
  const land = grade + 0.08;
  const leave = leaveT ?? 0.06;
  if (t <= leave) return top;
  if (t >= 0.86) return land;
  const u = smooth01((t - leave) / (0.86 - leave));
  const drop = u * u * (1.85 - 0.85 * u);
  return top - (top - land) * Math.min(1, drop);
}

/** Two wide hills on a falling spine — a camel ribbon, not stacked crates. */
function waveProfile(t, top, grade, leaveT) {
  const land = grade + 0.08;
  const leave = leaveT ?? 0.06;
  if (t <= leave) return top;
  if (t >= 0.88) return land;
  const u = (t - leave) / (0.88 - leave);
  const spine = top - (top - land) * (0.38 * u + 0.62 * smooth01(u));
  const h1 = Math.exp(-(((t - 0.34) / 0.13) ** 2)) * 0.36;
  const h2 = Math.exp(-(((t - 0.62) / 0.13) ** 2)) * 0.28;
  return spine + h1 + h2;
}

/** Hold the head on the 1-wide lid; bow toward +cross after the eave so iso sees a banana. */
function swingOut(t, amp) {
  return 0.03 + amp * smooth01(Math.max(0, (t - 0.14) / 0.86));
}

function axesOf(tan) {
  const n = tan.clone().normalize();
  const side = new THREE.Vector3().crossVectors(Y_UP, n);
  if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
  else side.normalize();
  const up = new THREE.Vector3().crossVectors(n, side).normalize();
  return { side, up };
}

function posOf(origin, side, up, s, u) {
  return new THREE.Vector3(
    origin.x + side.x * s + up.x * u,
    origin.y + side.y * s + up.y * u,
    origin.z + side.z * s + up.z * u,
  );
}

function quadRing(origin, side, up, s0, s1, u0, u1) {
  return [
    posOf(origin, side, up, s0, u0),
    posOf(origin, side, up, s1, u0),
    posOf(origin, side, up, s1, u1),
    posOf(origin, side, up, s0, u1),
  ];
}

function pushQuad(positions, indices, p0, p1, p2, p3) {
  const base = positions.length / 3;
  positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function loftPrism(group, rings, colour, extras, section) {
  if (rings.length < 2) return null;
  const positions = [];
  const indices = [];
  for (let i = 0; i < rings.length - 1; i += 1) {
    const a = rings[i];
    const b = rings[i + 1];
    pushQuad(positions, indices, a[0], a[1], b[1], b[0]);
    pushQuad(positions, indices, a[1], a[2], b[2], b[1]);
    pushQuad(positions, indices, a[2], a[3], b[3], b[2]);
    pushQuad(positions, indices, a[3], a[0], b[0], b[3]);
  }
  const first = rings[0];
  const last = rings[rings.length - 1];
  pushQuad(positions, indices, first[0], first[3], first[2], first[1]);
  pushQuad(positions, indices, last[0], last[1], last[2], last[3]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat(colour, extras));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.section = section;
  group.add(mesh);
  return mesh;
}

function samplesOf(frame, profile, lateral, n, opts) {
  const bed0 = opts.bedW ?? 1.04;
  const kerb0 = opts.kerbH ?? 0.50;
  const kerbW = opts.kerbW ?? 0.18;
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const flare = opts.flare ? Math.max(0, (t - 0.68) / 0.32) : 0;
    const p = pointOn(frame, t, profile, lateral);
    pts.push({
      t,
      x: p.x,
      y: p.y,
      z: p.z,
      bedW: bed0 + flare * 0.48,
      kerbH: kerb0 - flare * 0.12,
      kerbW,
    });
  }
  for (let i = 0; i <= n; i += 1) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n, i + 1)];
    const tan = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
    if (tan.lengthSq() < 1e-8) tan.set(frame.alongZ ? 0 : 1, 0, frame.alongZ ? 1 : 0);
    pts[i].tan = tan.normalize();
  }
  return pts;
}

/**
 * Locked-up lofted U-channel. Fat bed, tall kerbs, inner lips, coral rail on the inner cap.
 * One ribbon, not a stair of crates.
 */
function layBanana(group, frame, profile, lateral, opts = {}) {
  const samples = samplesOf(frame, profile, lateral, opts.runs ?? 28, opts);
  const sole = [];
  const bed = [];
  const runner = [];
  const leftK = [];
  const rightK = [];
  const leftCap = [];
  const rightCap = [];
  const leftLip = [];
  const rightLip = [];
  const leftStripe = [];
  const rightStripe = [];
  for (const s of samples) {
    const { side, up } = axesOf(s.tan);
    const o = new THREE.Vector3(s.x, s.y, s.z);
    const hw = s.bedW * 0.5;
    const kw = s.kerbW;
    const kh = s.kerbH;
    sole.push(quadRing(o, side, up, -hw * 0.94, hw * 0.94, -0.055, 0));
    bed.push(quadRing(o, side, up, -hw, hw, 0, 0.10));
    runner.push(quadRing(o, side, up, -hw * 0.38, hw * 0.38, 0.08, 0.13));
    leftK.push(quadRing(o, side, up, -hw - kw, -hw, 0.04, kh));
    rightK.push(quadRing(o, side, up, hw, hw + kw, 0.04, kh));
    leftCap.push(quadRing(o, side, up, -hw - kw - 0.02, -hw + 0.04, kh - 0.02, kh + 0.048));
    rightCap.push(quadRing(o, side, up, hw - 0.04, hw + kw + 0.02, kh - 0.02, kh + 0.048));
    leftLip.push(quadRing(o, side, up, -hw, -hw + 0.055, 0.07, 0.15));
    rightLip.push(quadRing(o, side, up, hw - 0.055, hw, 0.07, 0.15));
    leftStripe.push(quadRing(o, side, up, -hw - 0.015, -hw + 0.045, kh - 0.01, kh + 0.042));
    rightStripe.push(quadRing(o, side, up, hw - 0.045, hw + 0.015, kh - 0.01, kh + 0.042));
  }
  loftPrism(group, sole, EXTRA.rubberSole, { rough: 0.95 }, 'sole');
  loftPrism(group, bed, TOY, { rough: 0.50 }, 'bed');
  loftPrism(group, runner, TOY, { rough: 0.46, tint: 0.84 }, 'runner');
  loftPrism(group, leftK, TOY, { rough: 0.50 }, 'kerb');
  loftPrism(group, rightK, TOY, { rough: 0.50 }, 'kerb');
  loftPrism(group, leftCap, TOY, { rough: 0.48 }, 'kerb-cap');
  loftPrism(group, rightCap, TOY, { rough: 0.48 }, 'kerb-cap');
  loftPrism(group, leftLip, TOY, { rough: 0.48 }, 'lip');
  loftPrism(group, rightLip, TOY, { rough: 0.48 }, 'lip');
  loftPrism(group, leftStripe, STRIPE, { rough: 0.50 }, 'stripe');
  loftPrism(group, rightStripe, STRIPE, { rough: 0.50 }, 'stripe');
  if (opts.ribs) {
    for (let i = 4; i < samples.length - 5; i += 3) {
      const s = samples[i];
      const { side, up } = axesOf(s.tan);
      const hw = s.bedW * 0.5 + s.kerbW + 0.03;
      for (const sgn of [-1, 1]) {
        const p = posOf(new THREE.Vector3(s.x, s.y, s.z), side, up, sgn * hw, s.kerbH * 0.42);
        tag(box(group, TOY, 0.07, s.kerbH * 0.70, 0.08, p.x, p.y, p.z, { rough: 0.52 }), 'flute');
      }
    }
  }
}

function headMouth(group, frame, lateral) {
  const p = pointOn(frame, frame.leaveT, () => frame.top, lateral);
  const az = frame.alongZ;
  const rot = boxRot(az, 0.06, 0);
  tag(box(group, TOY, az ? 1.10 : 0.46, 0.12, az ? 0.46 : 1.10,
    p.x, frame.top + 0.02, p.z, { rot, rough: 0.50 }), 'head-bed');
  tag(box(group, EXTRA.rubberSole, az ? 0.96 : 0.36, 0.05, az ? 0.36 : 0.96,
    p.x, frame.top - 0.05, p.z, { rot, rough: 0.95 }), 'head-sole');
  for (const s of [-1, 1]) {
    tag(box(group, TOY, az ? 0.18 : 0.46, 0.50, az ? 0.46 : 0.18,
      p.x + (az ? s * 0.54 : 0), frame.top + 0.26, p.z + (az ? 0 : s * 0.54),
      { rot, rough: 0.50 }), 'head-cheek');
    tag(box(group, TOY, az ? 0.20 : 0.46, 0.055, az ? 0.46 : 0.20,
      p.x + (az ? s * 0.54 : 0), frame.top + 0.50, p.z + (az ? 0 : s * 0.54),
      { rot, rough: 0.48 }), 'head-cap');
    tag(box(group, STRIPE, az ? 0.05 : 0.46, 0.06, az ? 0.46 : 0.05,
      p.x + (az ? s * 0.62 : 0), frame.top + 0.36, p.z + (az ? 0 : s * 0.62),
      { rot, rough: 0.50 }), 'head-stripe');
    tag(cyl(group, VOXEL_COLOURS.steel, 0.032, 0.50,
      p.x + (az ? s * 0.40 : -0.04), frame.top + 0.36, p.z + (az ? -0.04 : s * 0.40),
      8, { metal: 0.40 }), 'grab');
  }
  tag(box(group, VOXEL_COLOURS.steel, az ? 0.88 : 0.05, 0.05, az ? 0.05 : 0.88,
    p.x, frame.top + 0.60, p.z, { metal: 0.40 }), 'grab-bar');
}

function footApron(group, frame, t, lateral) {
  const p = pointOn(frame, t, () => frame.grade + 0.08, lateral);
  tag(box(group, EXTRA.rubberSole, 1.28, 0.08, 1.22, p.x, frame.grade + 0.04, p.z,
    { rough: 0.95 }), 'foot-sole');
  tag(box(group, EXTRA.rubberWear, 0.92, 0.055, 0.86, p.x, frame.grade + 0.095, p.z,
    { rough: 0.95 }), 'foot-wear');
  const az = frame.alongZ;
  for (const s of [-1, 1]) {
    tag(box(group, TOY, az ? 0.16 : 0.48, 0.26, az ? 0.48 : 0.16,
      p.x + (az ? s * 0.62 : 0.10), frame.grade + 0.22,
      p.z + (az ? 0.10 : s * 0.62),
      { rough: 0.50, rot: [0, s * 0.38, 0] }), 'foot-wing');
    tag(box(group, TOY, az ? 0.18 : 0.48, 0.05, az ? 0.48 : 0.18,
      p.x + (az ? s * 0.62 : 0.10), frame.grade + 0.36,
      p.z + (az ? 0.10 : s * 0.62),
      { rough: 0.48, rot: [0, s * 0.38, 0] }), 'foot-wing-cap');
    tag(box(group, STRIPE, az ? 0.05 : 0.44, 0.05, az ? 0.44 : 0.05,
      p.x + (az ? s * 0.70 : 0.10), frame.grade + 0.28,
      p.z + (az ? 0.10 : s * 0.70),
      { rough: 0.50, rot: [0, s * 0.38, 0] }), 'foot-stripe');
  }
  barkPatch(group, p.x, frame.grade + 0.02, p.z + (az ? 0.42 : 0), 1.15, 0.72, 17);
}

function barkPatch(group, cx, y, cz, w, d, salt) {
  const nx = 5;
  const nz = 4;
  const tones = [EXTRA.plinth, VOXEL_COLOURS.timber, EXTRA.rubberWear, VOXEL_COLOURS.coral];
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < nz; j += 1) {
      const u = wobble(salt, i, j + 3);
      const v = wobble(salt, j, i + 11);
      const s = 0.09 + u * 0.08;
      tag(box(group, tones[(i + j) % 4],
        s * 1.35, 0.035 + v * 0.028, s,
        cx + (i - (nx - 1) / 2) * (w / nx) + (u - 0.5) * 0.05,
        y + 0.02,
        cz + (j - (nz - 1) / 2) * (d / nz) + (v - 0.5) * 0.05,
        { rough: 0.92, rot: [0, u * 1.3, 0] }), 'bark');
    }
  }
}

function supportLegs(group, frame, profile, lateral, ts) {
  for (const t of ts) {
    const p = pointOn(frame, t, profile, lateral);
    const h = p.y - frame.grade - 0.10;
    if (!Number.isFinite(h) || h < 0.18) continue;
    tag(taper(group, VOXEL_COLOURS.post, 0.052, 0.084, h, p.x, frame.grade + 0.06 + h / 2, p.z,
      8, { rough: 0.88 }), 'leg');
    tag(box(group, VOXEL_COLOURS.post, 0.16, 0.05, 0.16, p.x, p.y - 0.07, p.z,
      { rough: 0.88 }), 'leg-cap');
    tag(box(group, EXTRA.bluestone, 0.28, 0.06, 0.28, p.x, frame.grade + 0.03, p.z,
      { rough: 0.88 }), 'foot-plate');
  }
}

export function buildSlideChute(group, entry, base) {
  const frame = frameOf(entry, base);
  const profile = (t) => chuteProfile(t, frame.top, frame.grade, frame.leaveT);
  const lateral = (t) => swingOut(t, 0.92);
  layBanana(group, frame, profile, lateral, {
    runs: 40, bedW: 1.04, kerbH: 0.50, kerbW: 0.18, flare: true, ribs: true,
  });
  headMouth(group, frame, lateral);
  footApron(group, frame, 0.96, lateral);
  supportLegs(group, frame, profile, lateral, [0.38, 0.62]);
}

export function buildSlideWave(group, entry, base) {
  const frame = frameOf(entry, base);
  const profile = (t) => waveProfile(t, frame.top, frame.grade, frame.leaveT);
  const lateral = (t) => swingOut(t, 0.22);
  layBanana(group, frame, profile, lateral, {
    runs: 44, bedW: 1.06, kerbH: 0.52, kerbW: 0.18, flare: true, ribs: false,
  });
  headMouth(group, frame, lateral);
  footApron(group, frame, 0.96, lateral);
  supportLegs(group, frame, profile, lateral, [0.26, 0.48, 0.72]);
}

function addOriented(group, geometry, colour, x, y, z, tan, section, extras = {}) {
  const mesh = new THREE.Mesh(geometry, paint(colour, extras));
  mesh.position.set(x, y, z);
  mesh.quaternion.setFromUnitVectors(extras.axis === 'z' ? Z_FWD : Y_UP, tan);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.section = section;
  group.add(mesh);
  return mesh;
}

export function buildSlideTube(group, entry, base) {
  const frame = frameOf(entry, base);
  const profile = (t) => chuteProfile(t, frame.top, frame.grade, frame.leaveT);
  const lateral = (t) => swingOut(t, 0.42);
  const skins = 18;
  const radius = 0.50;
  const inner = 0.40;
  for (let i = 0; i < skins; i += 1) {
    const t0 = frame.leaveT + (i / skins) * (0.86 - frame.leaveT);
    const t1 = frame.leaveT + ((i + 1) / skins) * (0.86 - frame.leaveT);
    const tm = (t0 + t1) / 2;
    const a = pointOn(frame, t0, profile, lateral);
    const b = pointOn(frame, t1, profile, lateral);
    const tan = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
    if (tan.lengthSq() < 1e-8) continue;
    const len = tan.length() * 1.28;
    if (!Number.isFinite(len) || len < 0.06) continue;
    tan.normalize();
    const m = pointOn(frame, tm, profile, lateral);
    const cy = m.y + radius - 0.08;
    addOriented(group,
      new THREE.CylinderGeometry(radius, radius, len, 12, 1, true),
      TOY, m.x, cy, m.z, tan, 'skin', { rough: 0.50 });
    addOriented(group,
      new THREE.CylinderGeometry(inner, inner, len * 0.98, 12, 1, true),
      THROAT, m.x, cy, m.z, tan, 'throat', {
        rough: 0.92, tint: 0.55, side: THREE.BackSide,
      });
    if (i === 0 || (i % 4 === 0 && tm < 0.80)) {
      addOriented(group,
        new THREE.TorusGeometry(radius + 0.03, 0.045, 6, 12),
        TOY, m.x, cy, m.z, tan, 'ring', { rough: 0.50, axis: 'z' });
    }
  }
  {
    const t = frame.leaveT;
    const a = pointOn(frame, t, profile, lateral);
    const b = pointOn(frame, t + 0.06, profile, lateral);
    const tan = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
    if (tan.lengthSq() > 1e-8) {
      tan.normalize();
      const m = pointOn(frame, t, profile, lateral);
      const cy = m.y + radius - 0.08;
      addOriented(group,
        new THREE.TorusGeometry(radius + 0.07, 0.085, 6, 12),
        TOY, m.x, cy, m.z, tan, 'collar', { rough: 0.50, axis: 'z' });
      addOriented(group,
        new THREE.TorusGeometry(inner - 0.02, 0.055, 5, 10),
        THROAT, m.x, cy, m.z, tan, 'mouth', {
          rough: 0.92, tint: 0.50, axis: 'z',
        });
    }
  }
  const exit = {
    ...frame,
    start: frame.start + frame.span * 0.78,
    span: frame.span * 0.24,
    leaveT: 0,
  };
  const exitProfile = (t) => profile(0.78 + t * 0.22);
  const exitLateral = (t) => lateral(0.78 + t * 0.22);
  layBanana(group, exit, exitProfile, exitLateral, {
    runs: 8, bedW: 0.96, kerbH: 0.30, kerbW: 0.16, flare: true, ribs: false,
  });
  headMouth(group, frame, lateral);
  footApron(group, frame, 0.96, lateral);
  supportLegs(group, frame, profile, lateral, [0.38, 0.66]);
}

/** Flared yellow mouth + rubber apron + bark. The mouth is the identity, not a pit. */
export function buildSlideRunout(group, entry, base) {
  const b = boundsOf(entry);
  const y0 = base;
  tag(box(group, EXTRA.rubberSole, b.w - 0.04, 0.08, b.d - 0.04, b.cx, y0 + 0.04, b.cz,
    { rough: 0.95 }), 'sole');
  tag(box(group, EXTRA.rubberPour, b.w - 0.18, 0.06, b.d - 0.18, b.cx, y0 + 0.09, b.cz,
    { rough: 0.95 }), 'pour');
  const fake = {
    b,
    alongZ: true,
    top: y0 + 0.46,
    grade: y0,
    span: b.d - 0.28,
    start: b.minZ + 0.12,
    leaveT: 0,
  };
  const profile = (t) => y0 + 0.54 - 0.42 * smooth01(t);
  const lateral = () => 0;
  layBanana(group, fake, profile, lateral, {
    runs: 14, bedW: 1.22, kerbH: 0.44, kerbW: 0.18, flare: true, ribs: false,
  });
  const mouthZ = b.maxZ - 0.10;
  tag(box(group, EXTRA.rubberWear, 1.10, 0.055, 0.52, b.cx, y0 + 0.12, mouthZ + 0.12,
    { rough: 0.95 }), 'mouth-apron');
  for (const s of [-1, 1]) {
    tag(box(group, TOY, 0.18, 0.30, 0.52,
      b.cx + s * 0.78, y0 + 0.26, mouthZ + 0.04,
      { rough: 0.50, rot: [0, s * 0.42, 0] }), 'mouth-wing');
    tag(box(group, TOY, 0.20, 0.05, 0.52,
      b.cx + s * 0.78, y0 + 0.42, mouthZ + 0.04,
      { rough: 0.48, rot: [0, s * 0.42, 0] }), 'mouth-cap');
    tag(box(group, STRIPE, 0.05, 0.05, 0.48,
      b.cx + s * 0.88, y0 + 0.34, mouthZ + 0.04,
      { rough: 0.50, rot: [0, s * 0.42, 0] }), 'mouth-stripe');
  }
  barkPatch(group, b.cx, y0 + 0.10, mouthZ + 0.22, 1.55, 0.70, 29);
}
