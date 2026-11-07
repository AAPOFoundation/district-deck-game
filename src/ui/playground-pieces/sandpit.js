// Sandpit family — four variants. Shared kit only.
// Bar: each variant owns its cell. 5-course crib that ate the 2×2; tray with
// overflow; toy excavator silhouette filling the 1×1; hypar sail as the 2×1 skyline.
import {
  EXTRA, VOXEL_COLOURS,
  box, cyl, taper, wobble, boundsOf, mat,
} from './_kit.js';
import { variantIndexOf } from '../../core/playground-builder.js';
import * as THREE from 'three';

export function buildSandpit(group, entry, base, colour) {
  const v = variantIndexOf(entry.variant);
  if (v === 1) return buildSandTable(group, entry, base, colour);
  if (v === 2) return buildSandDigger(group, entry, base, colour);
  if (v === 3) return buildSandSail(group, entry, base, colour);
  return buildSandBox(group, entry, base);
}

function addRaw(group, geometry, colour, x, y, z, extras = {}) {
  const mesh = new THREE.Mesh(geometry, mat(colour, extras));
  mesh.position.set(x, y, z);
  if (extras.rot) mesh.rotation.set(extras.rot[0] ?? 0, extras.rot[1] ?? 0, extras.rot[2] ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** Stacked sleeper ring. Pale cap oversails both faces. End-grain on the long sides. */
function sleeperRing(group, b, base, thick, courseH, courses) {
  for (let c = 0; c < courses; c += 1) {
    const inset = c * 0.012;
    const y = base + 0.08 + courseH * (c + 0.5);
    const t = thick - inset * 0.2;
    box(group, VOXEL_COLOURS.timber, b.w - inset, courseH - 0.012, t,
      b.cx, y, b.minZ + t / 2 + inset * 0.15);
    box(group, VOXEL_COLOURS.timber, b.w - inset, courseH - 0.012, t,
      b.cx, y, b.maxZ - t / 2 - inset * 0.15);
    box(group, VOXEL_COLOURS.timber, t, courseH - 0.012, b.d - t * 2 - inset,
      b.minX + t / 2 + inset * 0.15, y, b.cz);
    box(group, VOXEL_COLOURS.timber, t, courseH - 0.012, b.d - t * 2 - inset,
      b.maxX - t / 2 - inset * 0.15, y, b.cz);
    const endR = courseH * 0.36;
    for (const px of [b.minX + thick * 0.55, b.maxX - thick * 0.55]) {
      cyl(group, EXTRA.plinth, endR, 0.045, px, y, b.minZ - 0.01, 8,
        { rough: 0.90, rot: [Math.PI / 2, 0, 0] });
      cyl(group, EXTRA.plinth, endR, 0.045, px, y, b.maxZ + 0.01, 8,
        { rough: 0.90, rot: [Math.PI / 2, 0, 0] });
    }
  }
  const capH = 0.13;
  const capY = base + 0.08 + courseH * courses + capH / 2;
  const capT = thick + 0.20;
  box(group, VOXEL_COLOURS.post, b.w + 0.24, capH, capT, b.cx, capY, b.minZ + thick / 2);
  box(group, VOXEL_COLOURS.post, b.w + 0.24, capH, capT, b.cx, capY, b.maxZ - thick / 2);
  box(group, VOXEL_COLOURS.post, capT, capH, b.d - thick * 2 + 0.24,
    b.minX + thick / 2, capY, b.cz);
  box(group, VOXEL_COLOURS.post, capT, capH, b.d - thick * 2 + 0.24,
    b.maxX - thick / 2, capY, b.cz);
  for (const px of [b.minX + 0.18, b.maxX - 0.18, b.cx]) {
    for (const pz of [b.minZ + 0.18, b.maxZ - 0.18]) {
      cyl(group, VOXEL_COLOURS.steel, 0.018, 0.08, px, capY + capH / 2, pz, 6, { metal: 0.42 });
    }
  }
  for (const px of [b.minX + 0.18, b.maxX - 0.18]) {
    cyl(group, VOXEL_COLOURS.steel, 0.018, 0.08, px, capY + capH / 2, b.cz, 6, { metal: 0.42 });
  }
  return capY + capH / 2;
}

/** Cone hill: wide base, shoulder, peak. Tapers only — not a rotated box. */
function mound(group, x, y, z, r, h, tint) {
  taper(group, VOXEL_COLOURS.sand, r * 0.16, r, h * 0.72, x, y + h * 0.36, z, 9,
    { rough: 0.95, tint });
  taper(group, VOXEL_COLOURS.sand, r * 0.06, r * 0.50, h * 0.46, x, y + h * 0.70, z, 8,
    { rough: 0.95, tint: Math.min(1, tint + 0.07) });
  taper(group, VOXEL_COLOURS.sand, r * 0.015, r * 0.20, h * 0.26, x, y + h * 0.94, z, 7,
    { rough: 0.95, tint: Math.min(1, tint + 0.12) });
}

/** Dark lathe bowl so the well reads as a hole, not a tan disk. */
function wellBowl(group, cx, y, cz, r, depth) {
  const pts = [
    new THREE.Vector2(0.00, -depth),
    new THREE.Vector2(r * 0.16, -depth + 0.014),
    new THREE.Vector2(r * 0.42, -depth * 0.68),
    new THREE.Vector2(r * 0.72, -depth * 0.28),
    new THREE.Vector2(r, 0.00),
  ];
  addRaw(group, new THREE.LatheGeometry(pts, 16), VOXEL_COLOURS.sand, cx, y, cz,
    { rough: 0.95, tint: 0.22 });
  const inner = [
    new THREE.Vector2(0.00, -depth + 0.01),
    new THREE.Vector2(r * 0.12, -depth + 0.02),
    new THREE.Vector2(r * 0.30, -depth * 0.58),
    new THREE.Vector2(r * 0.46, -depth * 0.18),
  ];
  addRaw(group, new THREE.LatheGeometry(inner, 12), EXTRA.plinth, cx, y - 0.004, cz,
    { rough: 0.95, tint: 0.78 });
  cyl(group, EXTRA.plinth, r * 0.16, 0.028, cx, y - depth + 0.012, cz, 10, { rough: 0.95 });
}

/** Raised sand mass, dark scooped well, taper heaps that fill the crib. */
function sandBody(group, cx, y, cz, w, d, salt, scale = 1) {
  const holeW = w * 0.50;
  const holeD = d * 0.50;
  const tN = (d - holeD) / 2;
  const tW = (w - holeW) / 2;
  const fillH = 0.18 * Math.max(0.80, scale);
  box(group, VOXEL_COLOURS.sand, w, fillH, tN, cx, y, cz - (holeD + tN) / 2,
    { rough: 0.95, tint: 0.84 });
  box(group, VOXEL_COLOURS.sand, w, fillH, tN, cx, y, cz + (holeD + tN) / 2,
    { rough: 0.95, tint: 0.84 });
  box(group, VOXEL_COLOURS.sand, tW, fillH, holeD, cx - (holeW + tW) / 2, y, cz,
    { rough: 0.95, tint: 0.84 });
  box(group, VOXEL_COLOURS.sand, tW, fillH, holeD, cx + (holeW + tW) / 2, y, cz,
    { rough: 0.95, tint: 0.84 });
  const wellR = Math.min(holeW, holeD) * 0.70;
  wellBowl(group, cx, y + fillH * 0.16, cz, wellR, 0.44 * scale);
  const span = Math.min(w, d);
  // Heaps hug the rim so the well stays a hole, not a filled bowl.
  const heaps = [
    [0.38, -0.32, 0.26, 0.46, 0.88],
    [-0.38, 0.30, 0.25, 0.44, 0.74],
    [-0.32, -0.36, 0.24, 0.40, 0.92],
    [0.34, 0.34, 0.25, 0.42, 0.80],
    [0.04, -0.42, 0.20, 0.32, 0.86],
    [-0.04, 0.42, 0.19, 0.30, 0.78],
    [0.44, 0.02, 0.18, 0.28, 0.90],
    [-0.44, -0.04, 0.18, 0.26, 0.72],
  ];
  heaps.forEach(([ox, oz, rFrac, h, tint], i) => {
    const jx = (wobble(salt, i, 3) - 0.5) * 0.05;
    const jz = (wobble(salt, i, 9) - 0.5) * 0.05;
    mound(group, cx + ox * w + jx, y + fillH * 0.28, cz + oz * d + jz,
      rFrac * span * scale, h * scale, tint);
  });
}

function expandBounds(b, pad) {
  return {
    cx: b.cx,
    cz: b.cz,
    w: b.w + pad * 2,
    d: b.d + pad * 2,
    minX: b.minX - pad,
    maxX: b.maxX + pad,
    minZ: b.minZ - pad,
    maxZ: b.maxZ + pad,
  };
}

/**
 * Sand sits on the pale cap, walks down every sleeper face, then onto the pad
 * on all four sides so the crib claims ground around it — not a planter stamp.
 * `reach` scales how far the pad heaps walk (1 = pit, <1 = sail 2×1).
 */
function spillOverCap(group, b, capTop, base, salt, reach = 1) {
  const midY = base + (capTop - base) * 0.55;
  const hw = b.w / 2;
  const hd = b.d / 2;
  const edges = [
    { ox: 1, oz: 0, tx: 0, tz: 1, half: hd },
    { ox: -1, oz: 0, tx: 0, tz: 1, half: hd },
    { ox: 0, oz: 1, tx: 1, tz: 0, half: hw },
    { ox: 0, oz: -1, tx: 1, tz: 0, half: hw },
  ];
  let k = 0;
  const dump = (x, y, z, r, h, tint) => {
    const jx = (wobble(salt, k, 5) - 0.5) * 0.05 * reach;
    const jz = (wobble(salt, k, 11) - 0.5) * 0.05 * reach;
    mound(group, x + jx, y, z + jz, r * reach, h * reach, tint);
    k += 1;
  };
  edges.forEach((e, ei) => {
    const capAlong = [-0.34, -0.06, 0.28].map((t, ti) => (
      t + (wobble(salt, ei, 20 + ti) - 0.5) * 0.10
    ));
    capAlong.forEach((t, ti) => {
      dump(
        b.cx + e.ox * (hw - 0.04) + e.tx * e.half * t,
        capTop + 0.03 - ti * 0.01,
        b.cz + e.oz * (hd - 0.04) + e.tz * e.half * t,
        0.40 - ti * 0.04, 0.34 - ti * 0.04, 0.90 - ei * 0.02 - ti * 0.03,
      );
    });
    [-0.20, 0.22].forEach((t, ti) => {
      dump(
        b.cx + e.ox * (hw + 0.18 * reach) + e.tx * e.half * t,
        midY + (ti ? 0.05 : -0.06),
        b.cz + e.oz * (hd + 0.18 * reach) + e.tz * e.half * t,
        0.38, 0.32, 0.80 - ei * 0.02,
      );
    });
    [-0.26, 0.08, 0.32].forEach((t, ti) => {
      const out = (0.46 + ti * 0.10) * reach;
      dump(
        b.cx + e.ox * (hw + out) + e.tx * e.half * t,
        base + 0.04,
        b.cz + e.oz * (hd + out) + e.tz * e.half * t,
        0.50 - ti * 0.06, 0.34 - ti * 0.04, 0.78 - ei * 0.02 - ti * 0.02,
      );
    });
  });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      dump(
        b.cx + sx * (hw + 0.32 * reach),
        base + 0.04,
        b.cz + sz * (hd + 0.32 * reach),
        0.40, 0.28, 0.74,
      );
    }
  }
}

function bucketAndSpade(group, x, y, z, s = 1) {
  taper(group, VOXEL_COLOURS.rubberB, 0.20 * s, 0.28 * s, 0.38 * s, x, y + 0.20 * s, z, 10,
    { rough: 0.58 });
  box(group, VOXEL_COLOURS.rubberB, 0.070 * s, 0.22 * s, 0.070 * s,
    x - 0.23 * s, y + 0.40 * s, z, { rough: 0.58 });
  box(group, VOXEL_COLOURS.rubberB, 0.070 * s, 0.22 * s, 0.070 * s,
    x + 0.23 * s, y + 0.40 * s, z, { rough: 0.58 });
  box(group, VOXEL_COLOURS.rubberB, 0.52 * s, 0.06 * s, 0.06 * s, x, y + 0.52 * s, z,
    { rough: 0.58 });
  box(group, VOXEL_COLOURS.post, 0.068 * s, 0.068 * s, 0.64 * s, x + 0.40 * s, y + 0.16 * s, z + 0.20 * s,
    { rough: 0.72, rot: [0.50, 0.55, 0] });
  box(group, VOXEL_COLOURS.sun, 0.26 * s, 0.045 * s, 0.30 * s, x + 0.62 * s, y + 0.06 * s, z + 0.38 * s,
    { rough: 0.58, rot: [0.18, 0.55, 0] });
}

function hyparPoint(corners, tu, tv, sag) {
  const [c0, c1, c2, c3] = corners;
  const x = (c0[0] * (1 - tu) + c1[0] * tu) * (1 - tv) + (c3[0] * (1 - tu) + c2[0] * tu) * tv;
  const y = (c0[1] * (1 - tu) + c1[1] * tu) * (1 - tv) + (c3[1] * (1 - tu) + c2[1] * tu) * tv;
  const z = (c0[2] * (1 - tu) + c1[2] * tu) * (1 - tv) + (c3[2] * (1 - tu) + c2[2] * tu) * tv;
  const drop = sag * (
    4 * tu * (1 - tu) * 0.42
    + 4 * tv * (1 - tv) * 0.42
    + 16 * tu * (1 - tu) * tv * (1 - tv) * 0.40
  );
  return [x, y - drop, z];
}

/** Closed hypar sheet: corners stay on the posts, mid-span drops. */
function sagCloth(group, colour, corners, sag, thick = 0.03, extras = {}) {
  const nu = 5;
  const nv = 4;
  const top = [];
  const bot = [];
  for (let v = 0; v <= nv; v += 1) {
    const tv = v / nv;
    for (let u = 0; u <= nu; u += 1) {
      const p = hyparPoint(corners, u / nu, tv, sag);
      top.push([p[0], p[1] + thick, p[2]]);
      bot.push([p[0], p[1] - thick, p[2]]);
    }
  }
  const positions = [];
  const pushTri = (a, b, c) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };
  const at = (u, v) => v * (nu + 1) + u;
  for (let v = 0; v < nv; v += 1) {
    for (let u = 0; u < nu; u += 1) {
      const a = at(u, v);
      const b = at(u + 1, v);
      const c = at(u + 1, v + 1);
      const d = at(u, v + 1);
      pushTri(top[a], top[b], top[c]);
      pushTri(top[a], top[c], top[d]);
      pushTri(bot[a], bot[c], bot[b]);
      pushTri(bot[a], bot[d], bot[c]);
    }
  }
  const ring = [];
  for (let u = 0; u <= nu; u += 1) ring.push(at(u, 0));
  for (let v = 1; v <= nv; v += 1) ring.push(at(nu, v));
  for (let u = nu - 1; u >= 0; u -= 1) ring.push(at(u, nv));
  for (let v = nv - 1; v >= 1; v -= 1) ring.push(at(0, v));
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    pushTri(top[a], bot[a], bot[b]);
    pushTri(top[a], bot[b], top[b]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat(colour, { rough: extras.rough ?? 0.74, tint: extras.tint ?? 1 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

/** Two-tone gore: one hypar triangle so the sail is not a single card. */
function sagTriangle(group, colour, p0, p1, p2, sag, thick = 0.024, extras = {}) {
  const n = 4;
  const pts = [];
  const idxAt = [];
  let cursor = 0;
  for (let j = 0; j <= n; j += 1) {
    idxAt[j] = [];
    for (let i = 0; i <= n - j; i += 1) {
      const u = i / n;
      const v = j / n;
      const w = 1 - u - v;
      const drop = sag * 27 * u * v * w;
      pts.push([
        p0[0] * w + p1[0] * u + p2[0] * v,
        p0[1] * w + p1[1] * u + p2[1] * v - drop,
        p0[2] * w + p1[2] * u + p2[2] * v,
      ]);
      idxAt[j][i] = cursor;
      cursor += 1;
    }
  }
  const positions = [];
  const push = (a, b, c) => {
    positions.push(a[0], a[1] + thick, a[2], b[0], b[1] + thick, b[2], c[0], c[1] + thick, c[2]);
    positions.push(a[0], a[1] - thick, a[2], c[0], c[1] - thick, c[2], b[0], b[1] - thick, b[2]);
  };
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n - j; i += 1) {
      const a = pts[idxAt[j][i]];
      const b = pts[idxAt[j][i + 1]];
      const c = pts[idxAt[j + 1][i]];
      push(a, b, c);
      if (i < n - j - 1) {
        const d = pts[idxAt[j + 1][i + 1]];
        push(b, d, c);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat(colour, { rough: extras.rough ?? 0.74, tint: extras.tint ?? 1 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

/** Dark tape along a hypar isoline so the sail is not one khaki card. */
function clothSeam(group, colour, corners, sag, fixed, alongU, n = 7) {
  for (let i = 0; i < n; i += 1) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const a = alongU ? hyparPoint(corners, t0, fixed, sag) : hyparPoint(corners, fixed, t0, sag);
    const b = alongU ? hyparPoint(corners, t1, fixed, sag) : hyparPoint(corners, fixed, t1, sag);
    cable(group, a, b, colour, 0.042);
  }
}

export function buildSandBox(group, entry, base) {
  const cell = boundsOf(entry);
  const b = expandBounds(cell, 0.34);
  const salt = Math.round((entry.x ?? 0) * 19 + (entry.z ?? 0) * 7 + 3);
  const thick = 0.32;
  const courseH = 0.16;
  const courses = 3;
  // Sole stays under the crib; overflow heaps walk off it onto the pad.
  box(group, EXTRA.rubberSole, b.w + 0.48, 0.10, b.d + 0.48, b.cx, base + 0.03, b.cz,
    { rough: 0.95 });
  box(group, VOXEL_COLOURS.sand, b.w + 3.6, 0.07, b.d + 3.6, b.cx, base + 0.035, b.cz,
    { rough: 0.95, tint: 0.80 });
  const capTop = sleeperRing(group, b, base, thick, courseH, courses);
  for (const px of [b.minX + 0.20, b.maxX - 0.20]) {
    for (const pz of [b.minZ + 0.20, b.maxZ - 0.20]) {
      box(group, EXTRA.plinth, 0.30, capTop - base, 0.30, px, (base + capTop) / 2, pz);
      box(group, VOXEL_COLOURS.post, 0.38, 0.10, 0.38, px, capTop + 0.06, pz);
    }
  }
  // Fill sits low so the 5-course crib is a well, not a crate with a tan lid.
  const sandY = base + 0.08 + courseH * 2.35;
  const inner = Math.max(1.00, Math.min(b.w, b.d) - thick * 2 + 0.16);
  sandBody(group, b.cx, sandY, b.cz, inner, inner, salt, 1.20);
  spillOverCap(group, b, capTop, base, salt, 1);
  for (const [sx, sz] of [[b.minX + 0.52, b.minZ + 0.52]]) {
    box(group, VOXEL_COLOURS.post, 0.78, 0.10, 0.78, sx, capTop + 0.06, sz, { rot: [0, 0.78, 0] });
  }
  bucketAndSpade(group, b.cx - 0.08, sandY + 0.18, b.cz + 0.16, 1.62);
}

export function buildSandTable(group, entry, base, colour) {
  const cell = boundsOf(entry);
  const b = expandBounds(cell, 0.18);
  const salt = Math.round((entry.x ?? 0) * 13 + (entry.z ?? 0) * 11 + 5);
  const lip = base + 0.80;
  box(group, EXTRA.rubberSole, b.w + 0.40, 0.08, b.d + 0.40, b.cx, base + 0.03, b.cz,
    { rough: 0.95 });
  for (const px of [b.minX + 0.12, b.maxX - 0.12]) {
    for (const pz of [b.minZ + 0.12, b.maxZ - 0.12]) {
      taper(group, VOXEL_COLOURS.post, 0.072, 0.100, 0.74, px, base + 0.38, pz, 8);
      box(group, EXTRA.bluestone, 0.28, 0.06, 0.28, px, base + 0.03, pz, { rough: 0.88 });
      mound(group, px + 0.10, base + 0.04, pz + 0.08, 0.18, 0.12, 0.82);
    }
  }
  box(group, VOXEL_COLOURS.timber, b.w - 0.18, 0.062, 0.062, b.cx, base + 0.28, b.minZ + 0.16);
  box(group, VOXEL_COLOURS.timber, b.w - 0.18, 0.062, 0.062, b.cx, base + 0.28, b.maxZ - 0.16);
  box(group, VOXEL_COLOURS.timber, 0.062, 0.062, b.d - 0.18, b.minX + 0.16, base + 0.28, b.cz);
  box(group, VOXEL_COLOURS.timber, 0.062, 0.062, b.d - 0.18, b.maxX - 0.16, base + 0.28, b.cz);
  box(group, VOXEL_COLOURS.timber, b.w - 0.04, 0.12, b.d - 0.04, b.cx, lip - 0.12, b.cz);
  const wall = 0.12;
  const wallH = 0.34;
  box(group, VOXEL_COLOURS.timber, b.w - 0.02, wallH, wall, b.cx, lip + 0.06, b.minZ + 0.09);
  box(group, VOXEL_COLOURS.timber, b.w - 0.02, wallH, wall, b.cx, lip + 0.06, b.maxZ - 0.09);
  box(group, VOXEL_COLOURS.timber, wall, wallH, b.d - 0.16, b.minX + 0.09, lip + 0.06, b.cz);
  box(group, VOXEL_COLOURS.timber, wall, wallH, b.d - 0.16, b.maxX - 0.09, lip + 0.06, b.cz);
  box(group, VOXEL_COLOURS.post, b.w + 0.04, 0.07, wall + 0.10, b.cx, lip + 0.22, b.minZ + 0.09);
  box(group, VOXEL_COLOURS.post, b.w + 0.04, 0.07, wall + 0.10, b.cx, lip + 0.22, b.maxZ - 0.09);
  box(group, VOXEL_COLOURS.post, wall + 0.10, 0.07, b.d - 0.04, b.minX + 0.09, lip + 0.22, b.cz);
  box(group, VOXEL_COLOURS.post, wall + 0.10, 0.07, b.d - 0.04, b.maxX - 0.09, lip + 0.22, b.cz);
  const fill = colour ?? VOXEL_COLOURS.sand;
  box(group, fill, b.w - 0.24, 0.12, b.d - 0.24, b.cx, lip - 0.02, b.cz,
    { rough: 0.95, tint: 0.78 });
  wellBowl(group, b.cx + 0.02, lip + 0.04, b.cz, Math.min(b.w, b.d) * 0.32, 0.24);
  mound(group, b.cx + 0.22, lip + 0.04, b.cz - 0.12, 0.28, 0.24, 0.90);
  mound(group, b.cx - 0.18, lip + 0.04, b.cz + 0.16, 0.26, 0.22, 0.80);
  mound(group, b.cx + 0.04, lip + 0.04, b.cz + 0.02, 0.18, 0.16, 0.86);
  // Overflow cascade: lip, wall, pad — tray stays a tray, owns the 1×1.
  mound(group, b.maxX - 0.02, lip + 0.14, b.cz + 0.06, 0.28, 0.24, 0.88);
  mound(group, b.maxX + 0.12, lip + 0.00, b.cz + 0.10, 0.26, 0.22, 0.82);
  mound(group, b.maxX + 0.10, lip - 0.26, b.cz + 0.08, 0.24, 0.24, 0.76);
  mound(group, b.maxX + 0.30, base + 0.04, b.cz + 0.14, 0.38, 0.28, 0.80);
  mound(group, b.maxX + 0.20, base + 0.04, b.cz - 0.14, 0.30, 0.22, 0.76);
  mound(group, b.maxX + 0.12, base + 0.04, b.maxZ + 0.14, 0.28, 0.20, 0.74);
  mound(group, b.cx + 0.12, base + 0.04, b.maxZ + 0.24, 0.32, 0.22, 0.78);
  mound(group, b.cx - 0.12, lip + 0.14, b.maxZ - 0.02, 0.24, 0.20, 0.84);
  mound(group, b.cx - 0.06, lip - 0.22, b.maxZ + 0.12, 0.24, 0.20, 0.78);
  mound(group, b.minX - 0.10, base + 0.04, b.cz + 0.08, 0.24, 0.18, 0.72);
  mound(group, b.cx + 0.04, base + 0.04, b.minZ - 0.12, 0.22, 0.16, 0.74);
  bucketAndSpade(group, b.cx - 0.10, lip + 0.10, b.cz - 0.06, 1.20);
  const mold = wobble(salt, 4, 2);
  box(group, VOXEL_COLOURS.coral, 0.32, 0.16, 0.32,
    b.cx + 0.24, lip + 0.14, b.cz + 0.18,
    { rough: 0.58, rot: [0, mold, 0.12] });
  box(group, VOXEL_COLOURS.sun, 0.26, 0.05, 0.30, b.cx + 0.08, lip + 0.10, b.cz - 0.26,
    { rough: 0.58, rot: [0.2, 0.8, 0] });
}

/**
 * Toy excavator that fills the 1×1. Profile yaw puts boom along the iso
 * (+X−Z) so tracks, cab glass and the toothed arm survive family-plate zoom.
 */
export function buildSandDigger(group, entry, base, colour) {
  const b = boundsOf(entry);
  const paint = colour === VOXEL_COLOURS.sand ? VOXEL_COLOURS.sun : (colour ?? VOXEL_COLOURS.sun);
  const rig = new THREE.Group();
  rig.position.set(b.cx, 0, b.cz);
  // Camera sits at (+d,+d,+d). +45° lays local +X (boom) along camera-right
  // so iso looks down on two long track ovals and the arm in profile.
  rig.rotation.y = ((entry.yaw ?? 0) * Math.PI) / 180 + Math.PI / 4;
  group.add(rig);

  box(group, VOXEL_COLOURS.sand, 1.00, 0.10, 1.00, b.cx, base + 0.05, b.cz,
    { rough: 0.95, tint: 0.80 });
  mound(group, b.cx + 0.28, base + 0.06, b.cz + 0.18, 0.28, 0.20, 0.78);
  mound(group, b.cx - 0.22, base + 0.06, b.cz - 0.16, 0.24, 0.16, 0.72);
  mound(group, b.cx + 0.10, base + 0.06, b.cz - 0.30, 0.22, 0.14, 0.76);

  const S = 1.15;
  const body = new THREE.Group();
  body.position.y = base * (1 - S);
  body.scale.setScalar(S);
  rig.add(body);

  box(body, EXTRA.rubberSole, 0.80, 0.06, 0.76, -0.04, base + 0.03, 0, { rough: 0.95 });
  box(body, VOXEL_COLOURS.sand, 0.40, 0.08, 0.32, 0.30, base + 0.08, 0.04,
    { rough: 0.95, tint: 0.80, rot: [0, 0.25, 0] });
  mound(body, 0.40, base + 0.04, 0.02, 0.18, 0.16, 0.78);
  mound(body, 0.44, base + 0.04, -0.12, 0.14, 0.12, 0.50);

  // Two long dark ovals + five wheels a side. 1.15× r7 so the 1×1 is the machine.
  const trackGeom = new THREE.CapsuleGeometry(0.138, 0.84, 5, 10);
  for (const side of [-1, 1]) {
    const z = side * 0.36;
    addRaw(body, trackGeom, EXTRA.rubberSole, -0.06, base + 0.148, z,
      { rough: 0.95, rot: [0, 0, Math.PI / 2] });
    box(body, EXTRA.rubberSole, 0.84, 0.055, 0.24, -0.06, base + 0.25, z, { rough: 0.95 });
    for (let i = 0; i < 5; i += 1) {
      cyl(body, VOXEL_COLOURS.steel, 0.068, 0.11, -0.40 + i * 0.172, base + 0.14, z + side * 0.14, 8,
        { metal: 0.40, rot: [Math.PI / 2, 0, 0] });
    }
    cyl(body, VOXEL_COLOURS.steel, 0.076, 0.11, -0.46, base + 0.15, z + side * 0.08, 8,
      { metal: 0.40, rot: [Math.PI / 2, 0, 0] });
    cyl(body, VOXEL_COLOURS.steel, 0.076, 0.11, 0.38, base + 0.15, z + side * 0.08, 8,
      { metal: 0.40, rot: [Math.PI / 2, 0, 0] });
    for (let g = 0; g < 6; g += 1) {
      box(body, EXTRA.rubberSole, 0.048, 0.065, 0.24, -0.38 + g * 0.146, base + 0.05, z, { rough: 0.95 });
    }
  }

  box(body, VOXEL_COLOURS.steel, 0.60, 0.08, 0.46, -0.06, base + 0.28, 0, { metal: 0.30 });
  cyl(body, VOXEL_COLOURS.steel, 0.13, 0.065, 0.02, base + 0.33, 0, 10, { metal: 0.40 });

  // House + counterweight. Cab sits on top with glass on three faces.
  box(body, paint, 0.54, 0.18, 0.48, -0.08, base + 0.42, 0, { rough: 0.55 });
  box(body, EXTRA.plinth, 0.20, 0.16, 0.46, -0.38, base + 0.40, 0, { rough: 0.70 });
  box(body, paint, 0.24, 0.14, 0.44, 0.16, base + 0.39, 0, { rough: 0.55 });
  box(body, paint, 0.40, 0.34, 0.42, -0.14, base + 0.64, 0, { rough: 0.55 });
  box(body, paint, 0.46, 0.06, 0.48, -0.14, base + 0.83, 0, { rough: 0.55 });
  box(body, VOXEL_COLOURS.sky, 0.05, 0.20, 0.32, 0.07, base + 0.66, 0,
    { rough: 0.32, metal: 0.12 });
  box(body, VOXEL_COLOURS.sky, 0.26, 0.18, 0.045, -0.12, base + 0.66, 0.22,
    { rough: 0.32, metal: 0.12 });
  box(body, VOXEL_COLOURS.sky, 0.26, 0.18, 0.045, -0.12, base + 0.66, -0.22,
    { rough: 0.32, metal: 0.12 });
  box(body, VOXEL_COLOURS.sky, 0.045, 0.14, 0.24, -0.34, base + 0.64, 0,
    { rough: 0.32, metal: 0.12 });
  box(body, VOXEL_COLOURS.rubberB, 0.15, 0.08, 0.15, -0.16, base + 0.50, 0, { rough: 0.90 });
  cyl(body, VOXEL_COLOURS.steel, 0.024, 0.11, -0.22, base + 0.90, 0, 6, { metal: 0.40 });
  cyl(body, VOXEL_COLOURS.steel, 0.030, 0.13, 0.12, base + 0.52, 0.18, 6, { metal: 0.40 });

  const boomAng = 0.42;
  const boomLen = 0.66;
  const px = 0.24;
  const py = base + 0.50;
  const bx = px + Math.cos(boomAng) * (boomLen / 2);
  const by = py + Math.sin(boomAng) * (boomLen / 2);
  box(body, paint, boomLen, 0.14, 0.13, bx, by, 0, { rough: 0.55, rot: [0, 0, -boomAng] });
  cyl(body, VOXEL_COLOURS.steel, 0.048, 0.13, px, py, 0, 8, { metal: 0.40, rot: [Math.PI / 2, 0, 0] });
  box(body, VOXEL_COLOURS.steel, 0.30, 0.034, 0.034,
    px + Math.cos(boomAng + 0.28) * 0.19,
    py + Math.sin(boomAng + 0.28) * 0.19 + 0.02,
    0, { metal: 0.40, rot: [0, 0, -(boomAng + 0.14)] });

  const stickAng = -0.92;
  const stickLen = 0.50;
  const sx0 = px + Math.cos(boomAng) * boomLen;
  const sy0 = py + Math.sin(boomAng) * boomLen;
  const sx = sx0 + Math.cos(stickAng) * (stickLen / 2);
  const sy = sy0 + Math.sin(stickAng) * (stickLen / 2);
  box(body, paint, stickLen, 0.12, 0.11, sx, sy, 0, { rough: 0.55, rot: [0, 0, -stickAng] });
  cyl(body, VOXEL_COLOURS.steel, 0.040, 0.11, sx0, sy0, 0, 8,
    { metal: 0.40, rot: [Math.PI / 2, 0, 0] });

  const kx = sx0 + Math.cos(stickAng) * stickLen;
  const ky = sy0 + Math.sin(stickAng) * stickLen;
  const lipA = stickAng + 0.35;
  box(body, paint, 0.09, 0.20, 0.26, kx, ky, 0, { rough: 0.55, rot: [0, 0, -stickAng] });
  box(body, paint, 0.22, 0.05, 0.26,
    kx + Math.cos(stickAng) * 0.12, ky + Math.sin(stickAng) * 0.12 - 0.06, 0,
    { rough: 0.55, rot: [0.32, 0, -stickAng] });
  for (const s of [-1, 1]) {
    box(body, paint, 0.20, 0.15, 0.038,
      kx + Math.cos(stickAng) * 0.09, ky + Math.sin(stickAng) * 0.09 - 0.01, s * 0.13,
      { rough: 0.55, rot: [0, 0, -stickAng] });
  }
  for (const t of [-0.11, -0.055, 0, 0.055, 0.11]) {
    box(body, paint, 0.12, 0.06, 0.046,
      kx + Math.cos(lipA) * 0.22, ky + Math.sin(lipA) * 0.22 - 0.04, t,
      { rough: 0.50, rot: [0.42, 0, -stickAng] });
  }
  mound(body, kx + 0.04, base + 0.04, 0.02, 0.12, 0.10, 0.72);
}

export function buildSandSail(group, entry, base, colour) {
  const cell = boundsOf(entry);
  const pit = expandBounds(cell, 0.16);
  void colour;
  // Pale canvas + dark lining. Sun/khaki as a single card is the r2 residual.
  const cloth = VOXEL_COLOURS.post;
  const lining = EXTRA.plinth;
  const tape = VOXEL_COLOURS.timber;

  // Sleeper pit fills the 2×1; cloth is the skyline of that cell.
  box(group, EXTRA.rubberSole, pit.w + 0.36, 0.08, pit.d + 0.36, pit.cx, base + 0.03, pit.cz,
    { rough: 0.95 });
  const sailCap = sleeperRing(group, pit, base, 0.30, 0.16, 4);
  const salt = Math.round((entry.x ?? 0) * 17 + (entry.z ?? 0) * 5 + 2);
  sandBody(group, pit.cx, base + 0.18, pit.cz, pit.w - 0.58, pit.d - 0.58, salt, 0.90);
  spillOverCap(group, pit, sailCap, base, salt, 0.62);

  const inset = 0.06;
  const posts = [
    [pit.minX + inset, 2.08, pit.minZ + inset],
    [pit.maxX - inset, 1.74, pit.minZ + inset],
    [pit.maxX - inset, 1.98, pit.maxZ - inset],
    [pit.minX + inset, 1.64, pit.maxZ - inset],
  ];
  const corners = [];
  for (const [px, h, pz] of posts) {
    const mastH = h - 0.08;
    taper(group, VOXEL_COLOURS.steel, 0.040, 0.064, mastH, px, base + mastH / 2, pz, 8,
      { metal: 0.38 });
    box(group, EXTRA.bluestone, 0.28, 0.08, 0.28, px, base + 0.04, pz, { rough: 0.88 });
    cyl(group, VOXEL_COLOURS.steel, 0.068, 0.052, px, base + mastH + 0.02, pz, 8, { metal: 0.45 });
    cyl(group, VOXEL_COLOURS.post, 0.042, 0.054, px, base + mastH + 0.06, pz, 8, { metal: 0.20 });
    corners.push([px, base + mastH - 0.04, pz]);
  }
  const sag = 0.34;
  sagCloth(group, cloth, corners, sag, 0.034);
  sagTriangle(group, lining, corners[0], corners[1], corners[2], sag * 0.94, 0.020, { tint: 0.92 });
  sagTriangle(group, lining, corners[0], corners[2], corners[3], sag * 0.88, 0.016, { tint: 0.78 });
  const mid = [
    (corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) / 4,
    (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) / 4,
    (corners[0][2] + corners[1][2] + corners[2][2] + corners[3][2]) / 4,
  ];
  const inner = corners.map((c) => [
    c[0] + (mid[0] - c[0]) * 0.30,
    c[1] - 0.016,
    c[2] + (mid[2] - c[2]) * 0.30,
  ]);
  sagCloth(group, VOXEL_COLOURS.sun, inner, sag * 0.70, 0.016, { tint: 0.90 });
  clothSeam(group, lining, corners, sag, 0.28, true);
  clothSeam(group, lining, corners, sag, 0.50, true);
  clothSeam(group, lining, corners, sag, 0.72, true);
  clothSeam(group, tape, corners, sag, 0.36, false);
  clothSeam(group, tape, corners, sag, 0.64, false);
  for (let i = 0; i < corners.length; i += 1) {
    const a = corners[i];
    const c = corners[(i + 1) % corners.length];
    const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2 - sag * 0.50, (a[2] + c[2]) / 2];
    cable(group, a, m, VOXEL_COLOURS.post, 0.028);
    cable(group, m, c, VOXEL_COLOURS.post, 0.028);
  }
}

function cable(group, a, b, colour = VOXEL_COLOURS.steel, thick = 0.018) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 0.001;
  const flat = Math.hypot(dx, dz) || 0.001;
  box(group, colour, len, thick, thick,
    (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2,
    { metal: colour === VOXEL_COLOURS.steel ? 0.45 : 0.08, rot: [0, -Math.atan2(dz, dx), Math.atan2(dy, flat)] });
}
