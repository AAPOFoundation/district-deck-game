// Stage 3 — lock-up. House shell (not a warehouse lid): weatherboard / render,
// openings with sashes going in, two-plane corrugated roof, scaffold wrap.

import * as THREE from 'three';
import { box, cyl, fitRoof } from './kit.js';
import { addSiteCabin, addSkip, addTrafficCones } from './plant.js';

function addGable(parent, span, rise, thick, mat, x, y, z, rotY) {
  const shape = new THREE.Shape();
  shape.moveTo(-span * 0.5, 0);
  shape.lineTo(span * 0.5, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  geo.translate(0, 0, -thick * 0.5);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.ownsGeometry = true;
  parent.add(mesh);
  return mesh;
}

function punch(parent, w, h, deep, x, y, z, alongX, mat) {
  if (alongX) box(parent, w, h, deep, mat, x, y, z, { cast: false });
  else box(parent, deep, h, w, mat, x, y, z, { cast: false });
}

function reveal(parent, w, h, x, y, z, alongX, mat) {
  const t = 0.09;
  const deep = 0.12;
  if (alongX) {
    box(parent, w + t * 2, t, deep, mat, x, y + h / 2, z);
    box(parent, w + t * 2, t, deep, mat, x, y - h / 2, z);
    box(parent, t, h, deep, mat, x - w / 2 - t / 2, y, z);
    box(parent, t, h, deep, mat, x + w / 2 + t / 2, y, z);
  } else {
    box(parent, deep, t, w + t * 2, mat, x, y + h / 2, z);
    box(parent, deep, t, w + t * 2, mat, x, y - h / 2, z);
    box(parent, deep, h, t, mat, x, y, z - w / 2 - t / 2);
    box(parent, deep, h, t, mat, x, y, z + w / 2 + t / 2);
  }
}

function weatherFace(parent, {
  width, height, cx, y0, z, flip, openings, mat,
}) {
  const n = Math.max(10, Math.round(height / 0.18));
  const h = height / n;
  const zOff = z + (flip ? -0.035 : 0.035);
  const left = cx - width / 2;
  const right = cx + width / 2;
  for (let i = 0; i < n; i += 1) {
    const y = y0 + h * (i + 0.5);
    const yLo = y - h * 0.48;
    const yHi = y + h * 0.48;
    let spans = [{ a: left, b: right }];
    for (const op of openings) {
      const oLo = op.y - op.h / 2;
      const oHi = op.y + op.h / 2;
      if (yHi < oLo || yLo > oHi) continue;
      const next = [];
      for (const s of spans) {
        const cutL = Math.min(s.b, op.x - op.w / 2);
        const cutR = Math.max(s.a, op.x + op.w / 2);
        if (cutL - s.a > 0.07) next.push({ a: s.a, b: cutL });
        if (s.b - cutR > 0.07) next.push({ a: cutR, b: s.b });
      }
      spans = next;
    }
    for (const s of spans) {
      const bw = s.b - s.a;
      if (bw < 0.07) continue;
      box(parent, bw, h * 0.9, 0.07, mat, (s.a + s.b) / 2, y, zOff);
    }
  }
}

function addSash(parent, w, h, x, y, z, { yaw = 0, pitch = 0, P }) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.set(pitch, yaw, 0);
  parent.add(g);
  box(g, w, h, 0.045, P.glass, 0, 0, 0, { cast: false });
  box(g, w + 0.1, 0.08, 0.07, P.steelDark, 0, h / 2, 0, { cast: false });
  box(g, w + 0.1, 0.08, 0.07, P.steelDark, 0, -h / 2, 0, { cast: false });
  box(g, 0.08, h, 0.07, P.steelDark, -w / 2, 0, 0, { cast: false });
  box(g, 0.08, h, 0.07, P.steelDark, w / 2, 0, 0, { cast: false });
  box(g, 0.045, h - 0.1, 0.04, P.steelDark, 0, 0, 0, { cast: false });
  box(g, w - 0.1, 0.045, 0.04, P.steelDark, 0, 0, 0, { cast: false });
  return g;
}

function addRoofPlane(parent, { len, depth, x, y, z, rotZ, P, ribs }) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.z = rotZ;
  parent.add(g);
  // Galvanised sheet — palette steel, not slate (slate stamps as asphalt shingles).
  box(g, len, 0.065, depth, P.steel, 0, 0, 0);
  const n = Math.max(8, ribs);
  const step = depth / n;
  for (let i = 0; i < n; i += 1) {
    box(g, len, 0.04, 0.075, P.steelDark, 0, 0.042, -depth / 2 + (i + 0.5) * step, { cast: false });
  }
  return g;
}

export function addScaffoldBay(ctx, parent, wallH, halfW, halfD) {
  const { palette: P } = ctx;
  const BAY = 2.05;
  const LIFT = 2.0;
  const DECK = 0.52;
  const lifts = Math.max(1, Math.min(3, Math.round(wallH / 2.55)));
  const topY = Math.min(lifts * LIFT, wallH + 0.28);
  const postH = wallH + 0.45;
  const corners = [
    { x: -halfW, z: halfD }, { x: halfW, z: halfD },
    { x: halfW, z: -halfD }, { x: -halfW, z: -halfD },
  ];
  const runs = corners.map((c, i) => {
    const n = corners[(i + 1) % 4];
    const dx = n.x - c.x;
    const dz = n.z - c.z;
    const len = Math.hypot(dx, dz);
    return { from: c, to: n, dx, dz, len, ix: dz / len, iz: -dx / len };
  });
  const netting = [];

  for (const r of runs) {
    const bays = Math.max(1, Math.round(r.len / BAY));
    for (let i = 0; i < bays; i += 1) {
      const t = i / bays;
      const x = r.from.x + r.dx * t;
      const z = r.from.z + r.dz * t;
      for (const inset of [0, DECK]) {
        const px = x + r.ix * inset;
        const pz = z + r.iz * inset;
        const std = new THREE.Group();
        std.position.set(px, 0, pz);
        parent.add(std);
        cyl(std, 0.07, 0.07, postH, 6, P.steel, 0, postH / 2, 0, { cast: false });
        box(std, 0.22, 0.08, 0.22, P.scaffoldBase, 0, 0.04, 0, { cast: false });
        ctx.tap(std, 'scaffold', { label: `std-${px.toFixed(1)}-${pz.toFixed(1)}` });
      }
    }
  }

  for (let l = 1; l <= lifts; l += 1) {
    const y = Math.min(l * LIFT, topY);
    for (const r of runs) {
      const alongX = Math.abs(r.dx) > Math.abs(r.dz);
      const midX = (r.from.x + r.to.x) / 2 + r.ix * (DECK / 2);
      const midZ = (r.from.z + r.to.z) / 2 + r.iz * (DECK / 2);
      const lw = alongX ? r.len : 0.07;
      const ld = alongX ? 0.07 : r.len;
      for (const inset of [-(DECK / 2), DECK / 2]) {
        box(parent, lw, 0.06, ld, P.steel, midX + r.ix * inset, y, midZ + r.iz * inset, { cast: false });
        box(parent, lw, 0.06, ld, P.steel, midX + r.ix * inset, y + 0.88, midZ + r.iz * inset, { cast: false });
      }
      box(parent, alongX ? r.len : DECK, 0.07, alongX ? DECK : r.len, P.pine, midX, y + 0.05, midZ, {
        cast: false,
      });
      box(
        parent,
        alongX ? r.len : 0.04,
        0.16,
        alongX ? 0.04 : r.len,
        P.pine,
        midX - r.ix * (DECK / 2),
        y + 0.14,
        midZ - r.iz * (DECK / 2),
        { cast: false },
      );
    }
  }

  // No solid netting panes. They photographed as mint shopfront glass (r5b major).
  ctx.rig('netting', netting);

  const ladX = -halfW * 0.35;
  const ladZ = halfD - DECK * 0.82;
  for (const ox of [-0.16, 0.16]) {
    cyl(parent, 0.03, 0.03, postH, 5, P.steel, ladX + ox, postH / 2, ladZ, { cast: false });
  }
  for (let r = 0; r < Math.floor(postH / 0.28); r += 1) {
    box(parent, 0.34, 0.025, 0.025, P.steel, ladX, 0.28 * (r + 1), ladZ, { cast: false });
  }
}

export function buildCladding(ctx) {
  if (ctx.fit) return buildFittedCladding(ctx);
  const { w, d, height, storeys, palette: P } = ctx;
  const levels = Math.max(1, Math.min(storeys, 4));
  const storeyH = Math.min(3.05, (height * 0.78) / levels);
  const wallH = 0.22 + levels * storeyH;
  const halfW = w * 0.39;
  const halfD = d * 0.36;
  const houseW = halfW * 2;
  const houseD = halfD * 2;
  const rise = Math.min(2.45, Math.max(1.55, halfW * 0.54));
  const wallT = 0.2;
  const winW = Math.min(1.38, houseW * 0.17);
  const winH = Math.min(1.18, storeyH * 0.4);
  const doorW = 1.02;
  const doorH = 2.08;

  const ghost = ctx.layer('frame-ghost');
  for (const t of [-0.36, -0.12, 0.12, 0.36]) {
    box(ghost, 0.14, wallH * 0.88, 0.14, P.pine, t * houseW, wallH * 0.48, -halfD + 0.18);
    box(ghost, 0.14, wallH * 0.88, 0.14, P.pine, t * houseW, wallH * 0.48, halfD - 0.18);
  }
  box(ghost, 0.14, 0.14, houseD * 0.78, P.pine, 0, wallH + rise, 0);
  const ghostLen = Math.hypot(halfW, rise);
  const ghostPitch = Math.atan2(rise, halfW);
  for (const z of [-houseD * 0.22, houseD * 0.22]) {
    box(ghost, ghostLen, 0.12, 0.12, P.pine, -halfW * 0.5, wallH + rise * 0.5, z, { rotZ: ghostPitch });
    box(ghost, ghostLen, 0.12, 0.12, P.pine, halfW * 0.5, wallH + rise * 0.5, z, { rotZ: -ghostPitch });
  }

  const shell = ctx.layer('shell');
  box(shell, houseW + 0.45, 0.2, houseD + 0.45, P.slab, 0, 0.1, 0, { cast: false, receive: true });
  // Brick plinth
  box(shell, houseW + 0.1, 0.32, wallT + 0.1, P.brick, 0, 0.28, halfD + 0.02);
  box(shell, houseW + 0.1, 0.32, wallT + 0.1, P.brick, 0, 0.28, -halfD - 0.02);
  box(shell, wallT + 0.1, 0.32, houseD + 0.1, P.brick, halfW + 0.02, 0.28, 0);
  box(shell, wallT + 0.1, 0.32, houseD + 0.1, P.brick, -halfW - 0.02, 0.28, 0);

  const zPlusOpen = [];
  const zMinusOpen = [];
  const xPlusOpen = [];
  const xMinusOpen = [];
  const doorX = -houseW * 0.22;
  const doorY = doorH / 2 + 0.12;
  zPlusOpen.push({ x: doorX, y: doorY, w: doorW, h: doorH, kind: 'door' });

  for (let level = 0; level < levels; level += 1) {
    const y = 0.92 + level * storeyH + winH / 2;
    const streetWins = houseW > 7.2
      ? [houseW * 0.06, houseW * 0.28]
      : [houseW * 0.18];
    for (const x of streetWins) {
      zPlusOpen.push({
        x, y, w: winW, h: winH, kind: 'win',
        lean: level === 0 && x === streetWins[0],
      });
    }
    for (const x of [-houseW * 0.24, houseW * 0.22]) {
      zMinusOpen.push({ x, y, w: winW, h: winH, kind: 'win' });
    }
    xPlusOpen.push({
      z: -houseD * 0.06, y, w: winW, h: winH, kind: 'win', lean: level === 0,
    });
    xMinusOpen.push({ z: houseD * 0.1, y, w: winW, h: winH, kind: 'win' });
  }

  box(shell, houseW, wallH, 0.06, P.plywood, 0, wallH / 2, halfD - 0.05, { cast: false });
  box(shell, houseW, wallH, 0.06, P.plywood, 0, wallH / 2, -halfD + 0.05, { cast: false });
  weatherFace(shell, {
    width: houseW, height: wallH - 0.32, cx: 0, y0: 0.32, z: halfD, flip: false,
    openings: zPlusOpen, mat: P.weather,
  });
  weatherFace(shell, {
    width: houseW, height: wallH - 0.32, cx: 0, y0: 0.32, z: -halfD, flip: true,
    openings: zMinusOpen, mat: P.weather,
  });

  box(shell, wallT, wallH, houseD, P.render, halfW, wallH / 2, 0);
  box(shell, wallT, wallH, houseD, P.render, -halfW, wallH / 2, 0);
  // Patched render on the visible gable
  box(shell, 0.05, 1.15, 1.55, P.white, halfW + 0.12, wallH * 0.55, -houseD * 0.18, { cast: false });
  box(shell, 0.05, 0.85, 1.05, P.white, halfW + 0.13, wallH * 0.78, houseD * 0.22, { cast: false });

  for (const op of zPlusOpen) {
    punch(shell, op.w, op.h, wallT + 0.08, op.x, op.y, halfD, true, P.black);
    reveal(shell, op.w, op.h, op.x, op.y, halfD + 0.06, true, P.pine);
  }
  for (const op of zMinusOpen) {
    punch(shell, op.w, op.h, wallT + 0.08, op.x, op.y, -halfD, true, P.black);
    reveal(shell, op.w, op.h, op.x, op.y, -halfD - 0.06, true, P.pine);
  }
  for (const op of xPlusOpen) {
    punch(shell, op.w, op.h, wallT + 0.08, halfW, op.y, op.z, false, P.black);
    reveal(shell, op.w, op.h, halfW + 0.06, op.y, op.z, false, P.pine);
  }
  for (const op of xMinusOpen) {
    punch(shell, op.w, op.h, wallT + 0.08, -halfW, op.y, op.z, false, P.black);
    reveal(shell, op.w, op.h, -halfW - 0.06, op.y, op.z, false, P.pine);
  }

  const leaf = new THREE.Group();
  leaf.position.set(doorX - doorW / 2, 0.12, halfD + 0.02);
  leaf.rotation.y = -0.18;
  shell.add(leaf);
  box(leaf, doorW * 0.94, doorH * 0.96, 0.07, P.plate, doorW * 0.47, doorH * 0.48, 0);
  box(leaf, 0.07, 0.07, 0.05, P.steelDark, doorW * 0.78, doorH * 0.5, 0.04, { cast: false });
  box(shell, 1.35, 0.12, 0.55, P.slab, doorX, 0.18, halfD + 0.42, { cast: false, receive: true });
  ctx.tap(leaf, 'beam', { label: 'door-leaf' });

  const glazing = ctx.layer('glazing');
  // Lock-up verb: most openings stay dark holes. One unit leans in the street hole;
  // one sits on the deck. Installed glass reads as a finished house.
  for (const op of zPlusOpen) {
    if (op.kind !== 'win' || !op.lean) continue;
    addSash(glazing, op.w - 0.16, op.h - 0.16, op.x, op.y - 0.08, halfD + 0.18, {
      yaw: 0.12, pitch: -0.72, P,
    });
  }
  // Spare unit sitting on the street-face scaffold deck.
  const spare = addSash(glazing, winW - 0.12, winH - 0.12, houseW * 0.18, 2.18, halfD + 0.38, {
    yaw: 0.18, pitch: -0.58, P,
  });
  ctx.tap(spare, 'beam', { label: 'sash-deck' });

  const roof = ctx.layer('roof');
  const over = 0.32;
  const sheetLen = Math.hypot(halfW + over, rise) + 0.06;
  const sheetPitch = Math.atan2(rise, halfW + over);
  const sheetD = houseD + 0.48;
  const ribs = Math.max(10, Math.round(sheetD / 0.55));
  addRoofPlane(roof, {
    len: sheetLen, depth: sheetD,
    x: -(halfW + over) / 2, y: wallH + rise / 2 + 0.05, z: 0,
    rotZ: sheetPitch, P, ribs,
  });
  addRoofPlane(roof, {
    len: sheetLen, depth: sheetD,
    x: (halfW + over) / 2, y: wallH + rise / 2 + 0.05, z: 0,
    rotZ: -sheetPitch, P, ribs,
  });
  box(roof, 0.2, 0.1, sheetD + 0.08, P.steelDark, 0, wallH + rise + 0.08, 0);
  const bargeLen = Math.hypot(halfW + 0.16, rise) + 0.08;
  for (const zSign of [-1, 1]) {
    box(roof, bargeLen, 0.1, 0.08, P.plate, -halfW * 0.5, wallH + rise * 0.5, zSign * (halfD + 0.08), {
      rotZ: sheetPitch,
    });
    box(roof, bargeLen, 0.1, 0.08, P.plate, halfW * 0.5, wallH + rise * 0.5, zSign * (halfD + 0.08), {
      rotZ: -sheetPitch,
    });
  }
  box(roof, 0.1, 0.16, houseD + 0.4, P.plate, -halfW - 0.14, wallH + 0.02, 0);
  box(roof, 0.1, 0.16, houseD + 0.4, P.plate, halfW + 0.14, wallH + 0.02, 0);
  const chimX = halfW * 0.32;
  const chimY = wallH + rise * 0.38 + 0.55;
  box(roof, 0.46, 1.15, 0.4, P.brick, chimX, chimY, houseD * 0.16);
  box(roof, 0.54, 0.1, 0.48, P.brickDark, chimX, chimY + 0.58, houseD * 0.16);
  cyl(roof, 0.07, 0.08, 0.28, 6, P.steelDark, chimX, chimY + 0.78, houseD * 0.16, { cast: false });

  const scaffold = ctx.layer('scaffold');
  addScaffoldBay(ctx, scaffold, wallH, halfW + 0.62, halfD + 0.62);

  addSiteCabin(ctx, -0.48, -0.48);
  addSkip(ctx, 0.48, 0.5);
  addTrafficCones(ctx, [
    [-1.15, halfD + 1.32],
    [0.25, halfD + 1.42],
    [1.45, halfD + 1.22],
  ]);
}

function roofPanel(parent, points, material, name) {
  const vertices = [];
  for (let i = 1; i < points.length - 1; i++) {
    // Both faces without changing a shared palette material's sidedness.
    vertices.push(...points[0], ...points[i], ...points[i + 1], ...points[i + 1], ...points[i], ...points[0]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.ownsGeometry = true;
  parent.add(mesh);
}

function buildFittedCladding(ctx) {
  const { fit, palette: P } = ctx;
  const { w, d, eave, ridge, form } = fit;
  const shell = ctx.fitLayer('shell');
  box(shell, w, 0.24, d, P.slab, 0, 0.12, 0, { receive: true, cast: false });
  const levels = Math.max(1, ctx.storeys), storeyH = (eave - 0.24) / levels;
  for (const alongX of [true, false]) for (const sign of [-1, 1]) {
    const face = new THREE.Group(); shell.add(face);
    if (!alongX) face.rotation.y = Math.PI / 2;
    const width = alongX ? w : d, depth = alongX ? d : w;
    const openings = [];
    for (let level = 0; level < levels; level++) for (const t of [-0.24, 0.24]) {
      openings.push({ x: t * width, y: 0.24 + level * storeyH + storeyH * 0.55,
        w: Math.min(1.3, width * 0.18), h: Math.min(1.3, storeyH * 0.45) });
    }
    if (alongX && sign === 1) openings.push({ x: 0, y: 1.2, w: 1, h: 1.9 });
    weatherFace(face, { width, height: eave - 0.24, cx: 0, y0: 0.24,
      z: sign * (depth / 2 - 0.05), flip: sign < 0, openings, mat: P.weather });
    for (const op of openings) reveal(face, op.w, op.h, op.x, op.y, sign * (depth / 2 - 0.03), true, P.pine);
  }
  const roof = ctx.fitLayer('roof');
  const { along, across, ridgeHalf, point } = fitRoof(fit);
  if (form === 'flat') {
    box(roof, w, 0.14, d, P.plate, 0, eave, 0);
    for (const sign of [-1, 1]) {
      box(roof, w, 0.18, 0.14, P.plate, 0, eave + 0.12, sign * (d / 2 - 0.07));
      box(roof, 0.14, 0.18, d, P.plate, sign * (w / 2 - 0.07), eave + 0.12, 0);
    }
  } else {
    const rise = ridge - eave;
    const beam = (a, b, width, material, name, depth = width) => {
      const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
      const delta = end.clone().sub(start), mid = start.add(end).multiplyScalar(0.5);
      const mesh = box(roof, width, Math.max(0.01, delta.length()), depth, material, mid.x, mid.y, mid.z, { name });
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    };
    // Face coordinates: s follows the eave; t climbs from eave (0) to ridge (1).
    // Clip rib flanks in this plane before lifting them, including at hips and the laying edge.
    const clip = (polygon, limit, greater) => {
      const output = [], inside = ([s]) => greater ? s >= limit : s <= limit;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        if (inside(a)) output.push(a);
        if (inside(a) !== inside(b)) {
          const t = (limit - a[0]) / (b[0] - a[0]);
          output.push([limit, a[1] + (b[1] - a[1]) * t]);
        }
      }
      return output;
    };
    const sheet = (name, baseHalf, topHalf, run, at, coverage) => {
      const taper = baseHalf - topHalf, half = (t) => baseHalf - taper * t;
      const top = half(coverage);
      const polygon = [[-baseHalf, 0], [baseHalf, 0], [top, coverage]];
      if (top > 0) polygon.push([-top, coverage]);
      roofPanel(roof, polygon.map(([s, t]) => at(s, t)), P.steel, name);
      const vertices = [];
      const count = Math.max(10, Math.round(baseHalf * 2 / 0.55)), step = baseHalf * 2 / count;
      for (let i = 0; i < count; i++) {
        const centre = -baseHalf + (i + 0.5) * step;
        for (const [lo, hi] of [[centre - 0.0375, centre], [centre, centre + 0.0375]]) {
          const flank = clip(clip(polygon, lo, true), hi, false)
            .map(([s, t]) => at(s, t, 0.005 + 0.04 * (1 - Math.abs(s - centre) / 0.0375)));
          for (let j = 1; j < flank.length - 1; j++) {
            vertices.push(...flank[0], ...flank[j], ...flank[j + 1], ...flank[j + 1], ...flank[j], ...flank[0]);
          }
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeVertexNormals();
      const ribs = new THREE.Mesh(geometry, P.steelDark);
      ribs.name = 'cs:roof-ribs'; ribs.receiveShadow = true; ribs.userData.ownsGeometry = true;
      roof.add(ribs);
      if (coverage === 1) return;
      // The exposed upper section still follows the measured pitch. Short slopes keep
      // three batten rows so the unfinished work remains legible; longer ones use ~0.9 m centres.
      const rows = Math.max(3, Math.ceil((1 - coverage) * Math.hypot(run, rise) / 0.9));
      for (let i = 0; i < rows; i++) {
        const t = coverage + (1 - coverage) * (i + 0.5) / rows;
        beam(at(-half(t), t, -0.035), at(half(t), t, -0.035), 0.07, P.pine, 'cs:batten');
      }
      const rafters = Math.max(6, Math.ceil(baseHalf * 2 / 0.9));
      for (let i = 0; i < rafters; i++) {
        const s = -baseHalf + (i + 0.5) * baseHalf * 2 / rafters;
        const topT = taper > 0 ? Math.min(1, (baseHalf - Math.abs(s)) / taper) : 1;
        if (topT <= coverage) continue;
        beam(at(s, coverage, -0.135), at(s, topT, -0.135), 0.13, P.pine, 'cs:rafter');
      }
    };
    for (const side of [-1, 1]) {
      sheet(form === 'hip' ? 'cs:hip-trapezoid' : 'cs:gable-plane', along / 2, ridgeHalf, across / 2,
        (s, t, lift = 0) => point(s, eave + rise * t + lift, side * across / 2 * (1 - t)),
        side === -1 ? 0.6 : 1);
    }
    for (const end of [-1, 1]) {
      if (form === 'hip') {
        sheet('cs:hip-triangle', across / 2, 0, along / 2 - ridgeHalf,
          (s, t, lift = 0) => point(end * (along / 2 - (along / 2 - ridgeHalf) * t), eave + rise * t + lift, s),
          end === -1 ? 0.6 : 1);
        for (const side of [-1, 1]) {
          beam(point(end * along / 2, eave + 0.05, side * across / 2), point(end * ridgeHalf, ridge + 0.05, 0),
            0.16, P.steelDark, 'cs:hip-cap', 0.08);
        }
      } else roofPanel(roof, [
        point(end * along / 2, eave, -across / 2), point(end * along / 2, eave, across / 2),
        point(end * ridgeHalf, ridge, 0),
      ], P.weather, 'cs:gable-end');
    }
    beam(point(-ridgeHalf, ridge + 0.05, 0), point(ridgeHalf, ridge + 0.05, 0),
      0.18, P.steelDark, 'cs:ridge-cap', 0.08);
  }
  const scaffold = ctx.fitLayer('scaffold');
  addScaffoldBay(ctx, scaffold, eave, w / 2 + 0.62, d / 2 + 0.62);
  addSiteCabin(ctx, -0.48, -0.48); addSkip(ctx, 0.48, 0.5);
  addTrafficCones(ctx, [[-ctx.w * 0.4, ctx.d * 0.5], [ctx.w * 0.4, ctx.d * 0.5]]);
}
