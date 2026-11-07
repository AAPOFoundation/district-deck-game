// District Deck V3.20 — interwar walk-up lane.
//
// These blocks are masonry and water-management systems, not tall boxes with windows pasted
// on them. The brick fields stop at real openings, floor bands return around the flanks, and
// every parapet stands on a roof slab carried by the wall heads below it.

import * as THREE from 'three';
import { restyleColour } from '../style/restyle.js';
import {
  box, cyl, rotBox, slab, skillion,
  emit, applySharedWear,
} from './core.js';
import {
  chimney,
  corniceRun,
  dentilCourse,
  doubleHungWindow,
  downpipe,
  frontDoor,
  gutterRun,
  steppedParapet,
  stringCourse,
  turnBundle,
  ventGrille,
  windowSurround,
} from './ornament.js';
import { composeLot } from './curtilage.js';
import {
  authorCurvedMasonryMap,
  authorDecoPartMaps,
  retireDecoMortar,
} from './deco-surfaces-r77.js';

const DETAIL_REMAP = Object.freeze({
  // Interwar steel joinery and rainwater goods share the charcoal iron bucket. Curtains are
  // placed separately behind the glazing, so the window component never needs a tenth draw.
  wall: 'wall',
  wallAlt: 'wallAlt',
  trim: 'trim',
  joinery: 'iron',
  iron: 'iron',
  roofTrim: 'iron',
  roof: 'roof',
  glass: 'glass',
  shadow: 'shadow',
});

const NUMBER_BY_FACADE = Object.freeze(['37', '24', '51', '18']);

function detail(ctx, produced, remap = null) {
  return emit(ctx, produced, remap ?? DETAIL_REMAP);
}

function tuneInterwarMaterials(ctx, deco = false) {
  // These materials are created with an archetype-specific cache key in core, so tinting
  // them here cannot leak into another lane or parcel family. Keep the existing maps and
  // buckets: this changes period colour, not the material topology or submission count.
  const baseTrim = ctx.p.trim.color;
  const trim = restyleColour(baseTrim, deco ? new THREE.Color('#edc980').multiplyScalar(1.95) : '#ffdd8d', { id: `building:${ctx.archetypeId}.trim` });
  if (trim !== baseTrim) {
    ctx.p.trim.color.set(trim);
    ctx.p.trim.userData.residentialTargetColor = deco ? trim.clone() : '#ffdd8d';
  }
  const brick = deco
    ? ctx.v.pick(405, ['#74392f', '#834435', '#69352f'])
    : ctx.v.pick(406, ['#874638', '#954c3a', '#773d35']);
  ctx.p.wall.color.set(brick);
  ctx.p.wall.needsUpdate = true;
  if (!deco) {
    ctx.p.wallAlt.color.set(ctx.v.pick(407, ['#b89c7c', '#c0a587', '#ad9275']));
    ctx.p.wallAlt.needsUpdate = true;
  }
}

function tag(geometry, name) {
  geometry.name = name;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function pushTri(positions, a, b, c) {
  positions.push(...a, ...b, ...c);
}

function pushFace(positions, a, b, c, d, reverse = false) {
  if (reverse) {
    pushTri(positions, a, c, b);
    pushTri(positions, a, d, c);
  } else {
    pushTri(positions, a, b, c);
    pushTri(positions, a, c, d);
  }
}

/** One outward-facing rectangle; masonry joints do not need hidden box backs. */
function surfaceFace(positions, { axis, face, normal, a0, a1, y0, y1, offset = 0.008 }) {
  const plane = face + normal * offset;
  if (axis === 'x') {
    pushFace(positions,
      [a0, y0, plane], [a1, y0, plane], [a1, y1, plane], [a0, y1, plane],
      normal < 0);
  } else {
    pushFace(positions,
      [plane, y0, a0], [plane, y0, a1], [plane, y1, a1], [plane, y1, a0],
      normal > 0);
  }
}

function faceGeometry(positions, name) {
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return tag(geometry, name);
}

/** A closed annular sector, used where a rectangle would destroy the Deco silhouette. */
function arcPanel({
  cx, cz, rOuter, rInner, yBase, height, a0, a1, segments = 8, name = 'arc-panel',
}) {
  const n = Math.max(1, segments | 0);
  const positions = [];
  const point = (r, a, y) => [cx + Math.sin(a) * r, y, cz + Math.cos(a) * r];
  for (let i = 0; i < n; i += 1) {
    const aa = a0 + ((a1 - a0) * i) / n;
    const ab = a0 + ((a1 - a0) * (i + 1)) / n;
    const o0 = point(rOuter, aa, yBase);
    const o1 = point(rOuter, ab, yBase);
    const O0 = point(rOuter, aa, yBase + height);
    const O1 = point(rOuter, ab, yBase + height);
    const i0 = point(rInner, aa, yBase);
    const i1 = point(rInner, ab, yBase);
    const I0 = point(rInner, aa, yBase + height);
    const I1 = point(rInner, ab, yBase + height);
    pushTri(positions, o0, o1, O1); pushTri(positions, o0, O1, O0);
    pushTri(positions, i0, I1, i1); pushTri(positions, i0, I0, I1);
    pushTri(positions, O0, O1, I1); pushTri(positions, O0, I1, I0);
    pushTri(positions, o0, i1, o1); pushTri(positions, o0, i0, i1);
    if (i === 0) {
      pushTri(positions, o0, O0, I0); pushTri(positions, o0, I0, i0);
    }
    if (i === n - 1) {
      pushTri(positions, o1, I1, O1); pushTri(positions, o1, i1, I1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return tag(geometry, name);
}

/** Visible curved skin only; used where the main wall behind already supplies thickness. */
function arcSurface({
  cx, cz, radius, yBase, height, a0, a1, segments = 12, name = 'arc-surface',
}) {
  const positions = [];
  const point = (a, y) => [cx + Math.sin(a) * radius, y, cz + Math.cos(a) * radius];
  const n = Math.max(2, segments | 0);
  for (let i = 0; i < n; i += 1) {
    const aa = a0 + ((a1 - a0) * i) / n;
    const ab = a0 + ((a1 - a0) * (i + 1)) / n;
    pushFace(positions,
      point(aa, yBase), point(ab, yBase), point(ab, yBase + height), point(aa, yBase + height));
  }
  return faceGeometry(positions, name);
}

function opening(x, y, width, height, kind = 'window') {
  return { x, y, width, height, kind };
}

function intervalsAround(min, max, active) {
  const out = [];
  let cursor = min;
  const sorted = active
    .map((o) => [o.x - o.width / 2, o.x + o.width / 2])
    .sort((a, b) => a[0] - b[0]);
  for (const [a, b] of sorted) {
    if (a > cursor + 0.015) out.push([cursor, Math.min(a, max)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < max - 0.015) out.push([cursor, max]);
  return out.filter(([a, b]) => b - a > 0.02);
}

/** Split one wall skin around the holes so the shared liners enter actual masonry reveals. */
function punchedShell(ctx, {
  axis, face, normal, min, max, baseY, height, thickness, openings, material, name,
}) {
  const ys = [baseY, baseY + height];
  for (const o of openings) ys.push(o.y, o.y + o.height);
  ys.sort((a, b) => a - b);
  const levels = ys.filter((y, i) => i === 0 || Math.abs(y - ys[i - 1]) > 0.001);
  for (let i = 0; i < levels.length - 1; i += 1) {
    const y0 = levels[i];
    const y1 = levels[i + 1];
    const ym = (y0 + y1) / 2;
    const active = openings.filter((o) => o.y < ym && o.y + o.height > ym);
    for (const [a, b] of intervalsAround(min, max, active)) {
      const span = b - a;
      const centre = (a + b) / 2;
      const geometry = axis === 'x'
        ? slab(span, y1 - y0, thickness, centre, y0, face - normal * thickness / 2,
          `${name}-${i}`)
        : slab(thickness, y1 - y0, span, face - normal * thickness / 2, y0, centre,
          `${name}-${i}`);
      ctx.push(geometry, material);
    }
  }
}

/**
 * Real 80 mm courses, drawn as one skin of mortar faces instead of thousands of closed
 * bricks. The old 340 mm blocks spent most of the lane budget making metre-wide masonry;
 * these joints keep the correct scale and leave those triangles for silhouette and flanks.
 */
function brickFace(ctx, {
  axis, face, normal, min, max, baseY, height, openings = [], salt = 140, sparse = false,
}) {
  if (ctx.q === 'low') return;
  if (retireDecoMortar(ctx, sparse ? 'brick-mortar-flank' : 'brick-mortar-front')) return;
  const course = ctx.q === 'high' ? (sparse ? 0.12 : 0.08) : 0.16;
  const brick = ctx.q === 'high' ? (sparse ? 0.36 : 0.24) : 0.48;
  const gap = ctx.q === 'high' ? (sparse ? 0.016 : 0.012) : 0.020;
  const perpendEvery = ctx.q === 'high' ? (sparse ? 16 : 5) : 10;
  const courses = Math.floor(height / course);
  const positions = [];
  for (let c = 0; c < courses; c += 1) {
    const y = baseY + c * course;
    const ym = y + course / 2;
    const active = openings.filter((o) => o.y - 0.03 < ym && o.y + o.height + 0.03 > ym);
    const intervals = intervalsAround(min, max, active);
    for (const [a, b] of intervals) {
      surfaceFace(positions, {
        axis, face, normal, a0: a, a1: b, y0: y, y1: y + gap,
      });
      if ((c + salt) % perpendEvery !== 0) continue;
      const stagger = ((c + salt) & 1) * brick * 0.5;
      for (let joint = min - stagger; joint <= max + brick; joint += brick) {
        if (joint <= a + gap || joint >= b - gap) continue;
        surfaceFace(positions, {
          axis, face, normal,
          a0: joint - gap / 2, a1: joint + gap / 2,
          y0: y + gap, y1: Math.min(baseY + height, y + course),
        });
      }
    }
  }
  ctx.push(faceGeometry(positions, sparse ? 'brick-mortar-flank' : 'brick-mortar-front'),
    ctx.p.ground);
}

/** A masonry sun shift: altered bricks grow denser toward the exposed upper street corner. */
function sunFaceShift(ctx, {
  axis, face, normal, min, max, baseY, height, openings = [], salt = 120,
}) {
  if (!ctx.detail) return;
  const course = 0.08;
  const brick = 0.24;
  const positions = [];
  const rows = Math.floor(height / course);
  for (let c = 0; c < rows; c += 1) {
    const y0 = baseY + c * course + 0.012;
    const y1 = Math.min(baseY + height, y0 + course - 0.016);
    const ym = (y0 + y1) / 2;
    const active = openings.filter((o) => o.y < ym && o.y + o.height > ym);
    for (const [a, b] of intervalsAround(min, max, active)) {
      const stagger = ((c + salt) & 1) * brick * 0.5;
      for (let start = min - stagger, index = 0; start < max + brick; start += brick, index += 1) {
        const lo = Math.max(a, start + 0.014);
        const hi = Math.min(b, start + brick - 0.014);
        if (hi - lo < 0.10) continue;
        const exposure = ((lo + hi) / 2 - min) / Math.max(0.01, max - min);
        const lift = 0.025 + exposure * 0.085 + ((ym - baseY) / height) * 0.025;
        const pickSalt = salt + ((c * 17 + index * 29) % 78);
        if (ctx.v.unit(pickSalt) >= lift) continue;
        surfaceFace(positions, { axis, face, normal, a0: lo, a1: hi, y0, y1, offset: 0.010 });
      }
    }
  }
  ctx.push(faceGeometry(positions, 'sun-shift-bricks'), ctx.p.wallAlt);
}

/** Dark masonry gathers under a gutter in a thinning field, not one pasted-on stripe. */
function gutterGrimeRamp(ctx, {
  face, normal = 1, min, max, topY, openings = [], salt = 210,
}) {
  if (!ctx.detail) return;
  const positions = [];
  const rowH = 0.07;
  const cellW = 0.24;
  const rows = 10;
  for (let row = 0; row < rows; row += 1) {
    const y1 = topY - row * rowH;
    const y0 = y1 - rowH + 0.012;
    const ym = (y0 + y1) / 2;
    const active = openings.filter((o) => o.y < ym && o.y + o.height > ym);
    for (const [a, b] of intervalsAround(min, max, active)) {
      for (let x = min, index = 0; x < max; x += cellW, index += 1) {
        const lo = Math.max(a, x + 0.012);
        const hi = Math.min(b, x + cellW - 0.012);
        if (hi - lo < 0.08) continue;
        const density = 0.40 * (1 - row / rows) + 0.05;
        const pickSalt = salt + ((row * 19 + index * 31) % 82);
        if (ctx.v.unit(pickSalt) >= density) continue;
        surfaceFace(positions, {
          axis: 'x', face, normal, a0: lo, a1: hi, y0, y1, offset: 0.014,
        });
      }
    }
  }
  ctx.push(faceGeometry(positions, 'gutter-grime-gradient'), ctx.p.wallAlt);
}

function orientedBundle(bundle, { x, z, angle }) {
  if (angle) turnBundle(bundle, { x, z, angle });
  return bundle;
}

function curtainBundle(ctx, o, z, salt) {
  if (ctx.q === 'low' || !ctx.v.chance(salt, 0.82)) return { trim: [] };
  const depth = 0.018;
  const h = o.height * ctx.v.range(salt + 1, 0.58, 0.90);
  const y = o.y + o.height - h / 2 - 0.08;
  const gap = ctx.v.range(salt + 2, 0.18, 0.36);
  const panelW = o.width * (0.5 - gap / 2) - 0.06;
  return {
    trim: [
      box(panelW, h, depth, o.x - o.width * (0.25 + gap / 4), y, z, 'curtain-left'),
      box(panelW, h, depth, o.x + o.width * (0.25 + gap / 4), y, z, 'curtain-right'),
    ],
  };
}

function addWindow(ctx, o, { face, angle = 0, surround = false, salt = 180 }) {
  const bundle = doubleHungWindow(ctx, {
    x: o.x, y: o.y, z: face, width: o.width, height: o.height,
    reveal: 0.30, sash: '6over6', curtain: 'none', salt,
  });
  detail(ctx, orientedBundle(bundle, { x: o.x, z: face, angle }));
  const curtains = curtainBundle(ctx, o, face - 0.37, salt + 40);
  detail(ctx, orientedBundle(curtains, { x: o.x, z: face, angle }));
  if (surround) {
    const frame = windowSurround(ctx, {
      x: o.x, y: o.y, z: face, width: o.width, height: o.height,
      style: 'plain', projection: 0.085, jamb: 0.115, sill: true, brackets: false,
    });
    detail(ctx, orientedBundle(frame, { x: o.x, z: face, angle }), { trim: 'ground' });
  }
}

function addStains(ctx, openings, face, salt) {
  if (!ctx.detail) return;
  for (let i = 0; i < openings.length; i += 1) {
    const o = openings[i];
    if (o.kind !== 'window' || !ctx.v.chance(salt + i, 0.56)) continue;
    const count = ctx.v.int(salt + 30 + i, 1, 2);
    for (let j = 0; j < count; j += 1) {
      const w = ctx.v.range(salt + 60 + i * 3 + j, 0.08, 0.17);
      const h = ctx.v.range(salt + 90 + i * 3 + j, 0.18, 0.42);
      const x = o.x + ctx.v.range(salt + 120 + i * 3 + j, -o.width * 0.32, o.width * 0.32);
      ctx.push(slab(w, h, 0.018, x, o.y - h, face + 0.028, 'sill-stain'), ctx.p.wallAlt);
    }
  }
}

function repointingPatch(ctx, {
  axis, face, normal, centre, yBase, width = 1.45, height = 0.72,
}) {
  if (!ctx.detail) return;
  const positions = [];
  const course = 0.08;
  const min = centre - width / 2;
  const max = centre + width / 2;
  const rows = Math.floor(height / course);
  for (let row = 0; row <= rows; row += 1) {
    const y = yBase + row * course;
    surfaceFace(positions, {
      axis, face, normal, a0: min, a1: max, y0: y, y1: y + 0.018, offset: 0.016,
    });
  }
  for (let row = 0; row < rows; row += 2) {
    const stagger = (row & 1) * 0.12;
    for (let joint = min + 0.24 + stagger; joint < max; joint += 0.48) {
      surfaceFace(positions, {
        axis, face, normal, a0: joint - 0.009, a1: joint + 0.009,
        y0: yBase + row * course, y1: yBase + (row + 1) * course,
        offset: 0.016,
      });
    }
  }
  ctx.push(faceGeometry(positions, 'repointed-mortar-patch'), ctx.p.ground);
}

function wrapCourse(ctx, {
  y, frontZ, backZ, bodyW, bodyD, height = 0.15, salt = 140, accent = false,
}) {
  detail(ctx, stringCourse(ctx, {
    x: 0, y, z: frontZ + 0.02, length: bodyW, height, projection: 0.10,
  }), { trim: 'wallAlt' });
  const rear = stringCourse(ctx, {
    x: 0, y, z: backZ - 0.02, length: bodyW, height, projection: 0.10,
  });
  detail(ctx, orientedBundle(rear, { x: 0, z: backZ - 0.02, angle: Math.PI }),
    { trim: 'wallAlt' });
  for (const side of [-1, 1]) {
    const sideX = side * (bodyW / 2 + 0.02);
    const run = stringCourse(ctx, {
      x: sideX, y, z: (frontZ + backZ) / 2, length: bodyD,
      height, projection: 0.10,
    });
    detail(ctx, orientedBundle(run, {
      x: sideX, z: (frontZ + backZ) / 2, angle: side * Math.PI / 2,
    }), { trim: 'wallAlt' });
  }
  if (accent) {
    const capY = y + height - 0.075;
    const profile = [[1, 1]];
    detail(ctx, stringCourse(ctx, {
      x: 0, y: capY, z: frontZ + 0.03, length: bodyW,
      height: 0.075, projection: 0.115, profile,
    }));
    const rearCap = stringCourse(ctx, {
      x: 0, y: capY, z: backZ - 0.03, length: bodyW,
      height: 0.075, projection: 0.115, profile,
    });
    detail(ctx, orientedBundle(rearCap, { x: 0, z: backZ - 0.03, angle: Math.PI }));
    for (const side of [-1, 1]) {
      const sideX = side * (bodyW / 2 + 0.03);
      const sideCap = stringCourse(ctx, {
        x: sideX, y: capY, z: (frontZ + backZ) / 2, length: bodyD,
        height: 0.075, projection: 0.115, profile,
      });
      detail(ctx, orientedBundle(sideCap, {
        x: sideX, z: (frontZ + backZ) / 2, angle: side * Math.PI / 2,
      }));
    }
  }
  void salt;
}

function reliefNumber(ctx, { text, x, y, z, scale = 0.28 }) {
  const segments = Object.freeze({
    0: 'abcedf', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
    5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  });
  const defs = {
    a: [0, 1, 0], b: [0.5, 0.5, 1], c: [0.5, -0.5, 1], d: [0, -1, 0],
    e: [-0.5, -0.5, 1], f: [-0.5, 0.5, 1], g: [0, 0, 0],
  };
  const pitch = scale * 1.45;
  for (let n = 0; n < text.length; n += 1) {
    const cx = x + (n - (text.length - 1) / 2) * pitch;
    for (const key of segments[text[n]] ?? '') {
      const [dx, dy, vertical] = defs[key];
      const geometry = vertical
        ? box(scale * 0.16, scale * 0.82, 0.055, cx + dx * scale, y + dy * scale,
          z, 'entry-number')
        : box(scale * 0.82, scale * 0.16, 0.055, cx, y + dy * scale, z, 'entry-number');
      ctx.push(geometry, ctx.p.wallAlt);
    }
  }
}

function addPortal(ctx, { entryX, frontZ, baseY, deco = false }) {
  const portalW = deco ? 2.64 : 2.02;
  const pierW = deco ? 0.34 : 0.40;
  const clearH = deco ? 2.72 : 2.40;
  const beamH = deco ? 0.52 : 0.46;
  const projection = deco ? 0.72 : 0.54;
  const z = frontZ + projection / 2;
  for (const side of [-1, 1]) {
    ctx.push(slab(pierW, clearH + beamH, projection, entryX + side * (portalW / 2 - pierW / 2),
      baseY, z, 'portal-pier'), ctx.p.ground);
  }
  ctx.push(slab(portalW - pierW * 2, beamH, projection, entryX, baseY + clearH, z,
    'portal-lintel'), ctx.p.ground);
  if (deco) {
    ctx.push(slab(portalW + 0.18, 0.10, projection + 0.08, entryX, baseY + clearH + beamH,
      z, 'portal-cap'), ctx.p.ground);
  }
  // The outer tread meets the path and the inner tread reaches the raised threshold, so the
  // door is approached by a stair rather than hovering above the garden datum.
  ctx.push(slab(portalW * 0.86, 0.10, deco ? 0.84 : 0.52, entryX, baseY - 0.02, frontZ + 0.34,
    'portal-step-lower'), ctx.p.ground);
  ctx.push(slab(portalW * 0.70, 0.10, deco ? 0.62 : 0.38, entryX, baseY + 0.08, frontZ + 0.19,
    'portal-step-upper'), ctx.p.ground);
  reliefNumber(ctx, {
    text: NUMBER_BY_FACADE[ctx.env.facade], x: entryX, y: baseY + clearH + beamH * 0.53,
    z: frontZ + projection + 0.035, scale: deco ? 0.27 : 0.25,
  });
}

/** Square meter cabinet recessed into masonry, with a proud weathering frame. */
function addMeterBox(ctx, { x, y, z, angle = 0, width = 0.50, height = 0.30 }) {
  const bundle = {
    shadow: [box(width, height, 0.035, x, y + height / 2, z - 0.025, 'meter-box-recess')],
    iron: [
      box(width + 0.08, 0.045, 0.055, x, y - 0.022, z + 0.018, 'meter-box-frame'),
      box(width + 0.08, 0.045, 0.055, x, y + height + 0.022, z + 0.018, 'meter-box-frame'),
      box(0.045, height, 0.055, x - width / 2 - 0.022, y + height / 2, z + 0.018,
        'meter-box-frame'),
      box(0.045, height, 0.055, x + width / 2 + 0.022, y + height / 2, z + 0.018,
        'meter-box-frame'),
    ],
  };
  detail(ctx, orientedBundle(bundle, { x, z, angle }));
}

/** A complete flank drainage run: hopper, brackets, shoe and grated gully. */
function addSideDrainage(ctx, { side, z, baseY, roofY, salt }) {
  const face = side * (ctx.env.bodyW / 2 + 0.055);
  const pipeX = face + side * 0.055;
  const topY = roofY + 0.34;
  const pipeH = topY - baseY - 0.28;
  ctx.push(cyl(0.07, pipeH, pipeX, baseY + 0.24 + pipeH / 2, z,
    'y', 'flank-downpipe', ctx.detail ? 8 : 6), ctx.p.iron);
  ctx.push(box(0.28, 0.30, 0.22, pipeX, topY - 0.17, z,
    'flank-hopper'), ctx.p.iron);
  for (let floor = 0; floor < 3; floor += 1) {
    ctx.push(box(0.06, 0.07, 0.30, face, baseY + floor * ctx.env.storeyH + 2.46,
      z, 'flank-downpipe-bracket'), ctx.p.iron);
  }
  ctx.push(rotBox(0.14, 0.14, 0.34, pipeX, baseY + 0.18, z - 0.10,
    { x: Math.PI / 6 }, 'flank-downpipe-shoe'), ctx.p.iron);
  ctx.push(slab(0.36, 0.04, 0.36, pipeX, baseY - 0.02, z - 0.23,
    'flank-gully'), ctx.p.iron);
  void salt;
}

function addWalkupEntryBay(ctx, { entryX, frontZ, baseY, roofY }) {
  const width = 2.38;
  const projection = 0.50;
  const pierW = 0.34;
  for (const side of [-1, 1]) {
    ctx.push(slab(pierW, roofY - baseY + 1.08, projection,
      entryX + side * (width / 2 - pierW / 2), baseY, frontZ + projection / 2,
      'walkup-entry-bay-pier'), ctx.p.wall);
  }
  for (let floor = 0; floor < 3; floor += 1) {
    ctx.push(slab(width - pierW * 2, 0.34, projection, entryX,
      baseY + floor * ctx.env.storeyH + 2.52, frontZ + projection / 2,
      'walkup-entry-bay-spandrel'), ctx.p.wall);
  }
  for (let floor = 1; floor < 3; floor += 1) {
    const y = baseY + floor * ctx.env.storeyH + 0.58;
    const slot = doubleHungWindow(ctx, {
      x: entryX, y, z: frontZ + projection + 0.015,
      width: 1.28, height: 1.54, reveal: 0.18, sash: '2over2',
      curtain: 'none', salt: 420 + floor,
    });
    detail(ctx, slot);
  }
  ctx.push(slab(width + 0.24, 0.16, projection + 0.20, entryX, roofY + 0.96,
    frontZ + projection / 2, 'walkup-entry-bay-coping'), ctx.p.ground);
  ctx.push(slab(width + 0.34, 0.18, 1.08, entryX, baseY + 2.62,
    frontZ + 0.58, 'walkup-concrete-canopy'), ctx.p.ground);
}

function addDecoEntry(ctx, { entryX, frontZ, baseY }) {
  const doorZ = frontZ - 0.24;
  const totalW = 1.80;
  const leafW = 0.84;
  const leafH = 2.24;
  ctx.push(box(totalW + 0.18, 2.84, 0.04, entryX, baseY + 1.42, doorZ - 0.12,
    'deco-entry-shadow'), ctx.p.shadow);
  for (const side of [-1, 1]) {
    const cx = entryX + side * (leafW / 2 + 0.03);
    ctx.push(box(leafW, 0.72, 0.075, cx, baseY + 0.36, doorZ,
      'deco-door-lower-panel'), ctx.p.iron);
    ctx.push(box(leafW - 0.14, leafH - 0.82, 0.035, cx, baseY + 0.77 + (leafH - 0.82) / 2,
      doorZ, 'deco-door-glass'), ctx.p.glass);
    for (const dx of [-leafW / 2, leafW / 2]) {
      ctx.push(box(0.055, leafH, 0.075, cx + dx, baseY + leafH / 2, doorZ + 0.025,
        'deco-door-stile'), ctx.p.iron);
    }
    for (let light = 0; light <= 6; light += 1) {
      ctx.push(box(leafW, 0.045, 0.075, cx,
        baseY + 0.77 + ((leafH - 0.82) * light) / 6, doorZ + 0.025,
        'deco-door-astragal'), ctx.p.iron);
    }
    for (let step = 0; step < 2; step += 1) {
      ctx.push(box(leafW * (0.74 - step * 0.10), 0.055, 0.045, cx,
        baseY + 0.22 + step * 0.24, doorZ + 0.065, 'deco-door-moulding'), ctx.p.trim);
    }
  }
  ctx.push(box(totalW, 0.45, 0.035, entryX, baseY + leafH + 0.225, doorZ,
    'deco-fanlight-glass'), ctx.p.glass);
  for (const dx of [-totalW / 2, -totalW / 6, totalW / 6, totalW / 2]) {
    ctx.push(box(0.055, 0.45, 0.075, entryX + dx, baseY + leafH + 0.225,
      doorZ + 0.025, 'deco-fanlight-fin'), ctx.p.iron);
  }
  for (let step = 0; step < 3; step += 1) {
    ctx.push(slab(totalW + 0.66 - step * 0.22, 0.16, 0.48 + step * 0.32,
      entryX, baseY - 0.16 + step * 0.16, frontZ + 0.34 - step * 0.16,
      'deco-entry-tread'), ctx.p.ground);
  }
  for (const side of [-1, 1]) {
    ctx.push(slab(0.30, 0.90, 1.26, entryX + side * (totalW / 2 + 0.32),
      baseY - 0.02, frontZ + 0.08, 'deco-entry-cheek'), ctx.p.wallAlt);
    ctx.push(slab(0.40, 0.10, 1.34, entryX + side * (totalW / 2 + 0.32),
      baseY + 0.88, frontZ + 0.08, 'deco-entry-cheek-cap'), ctx.p.ground);
  }
  ctx.push(slab(3.02, 0.10, 1.10, entryX, baseY + 2.96, frontZ + 0.56,
    'deco-entry-canopy'), ctx.p.ground);
  for (let band = 0; band < 3; band += 1) {
    ctx.push(slab(3.02 - band * 0.16, 0.075, 0.12, entryX,
      baseY + 2.87 - band * 0.075, frontZ + 1.10 - band * 0.04,
      'deco-canopy-fascia'), ctx.p.trim);
  }
}

function addHopper(ctx, { x, y, z, salt }) {
  const flare = ctx.v.range(salt, 0.36, 0.42);
  ctx.push(box(flare, 0.11, 0.22, x, y - 0.055, z + 0.11, 'rainwater-hopper-lip'), ctx.p.iron);
  ctx.push(box(flare * 0.78, 0.24, 0.16, x, y - 0.22, z + 0.08,
    'rainwater-hopper-body'), ctx.p.iron);
  ctx.push(box(flare * 0.60, 0.055, 0.018, x, y - 0.12, z + 0.175,
    'rainwater-hopper-mouth'), ctx.p.shadow);
}

function hopperStreaks(ctx, { x, topY, face, salt }) {
  if (!ctx.detail) return;
  const positions = [];
  for (let i = 0; i < 3; i += 1) {
    const width = ctx.v.range(salt + i * 2, 0.035, 0.075);
    const length = ctx.v.range(salt + i * 2 + 1, 0.22, 0.66) * (1 - i * 0.18);
    const centre = x + (i - 1) * 0.085;
    surfaceFace(positions, {
      axis: 'x', face, normal: 1,
      a0: centre - width / 2, a1: centre + width / 2,
      y0: topY - length, y1: topY, offset: 0.016,
    });
  }
  ctx.push(faceGeometry(positions, 'hopper-rust-streaks'), ctx.p.wallAlt);
}

function addParapetMoss(ctx, { bodyW, backZ, roofY, salt }) {
  if (!ctx.detail) return;
  for (let i = 0; i < 5; i += 1) {
    const w = ctx.v.range(salt + i * 2, 0.34, 0.82);
    const x = ctx.v.range(salt + i * 2 + 1, -bodyW * 0.38, bodyW * 0.38);
    ctx.push(slab(w, 0.025, 0.16, x, roofY + 0.19, backZ + 0.36,
      'parapet-moss-growth'), ctx.p.foliage);
  }
}

function addFlatRoof(ctx, {
  bodyW, bodyD, frontZ, backZ, roofY, frontOpenings = [], deco = false,
}) {
  const centreZ = (frontZ + backZ) / 2;
  ctx.push(slab(bodyW - 0.18, 0.24, bodyD - 0.18, 0, roofY - 0.08, centreZ,
    'flat-roof-slab'), ctx.p.roof);
  const parapetH = deco ? 0.56 : 0.68;
  // Walk-up keeps the lower rear and side. Deco uses one height so the coping returns.
  const rearH = deco ? parapetH : parapetH * 0.82;
  const sideH = deco ? parapetH : parapetH * 0.90;
  ctx.push(slab(bodyW, parapetH, 0.30, 0, roofY, frontZ - 0.15, 'front-parapet'), ctx.p.wallAlt);
  ctx.push(slab(bodyW, rearH, 0.30, 0, roofY, backZ + 0.15, 'rear-parapet'), ctx.p.wallAlt);
  for (const side of [-1, 1]) {
    ctx.push(slab(0.30, sideH, bodyD, side * (bodyW / 2 - 0.15), roofY,
      centreZ, 'side-parapet'), ctx.p.wallAlt);
  }
  // Capping closes the parapet on every elevation; the old front-only cornice left three
  // raw slab tops visible from the board orbit.
  ctx.push(slab(bodyW + 0.12, 0.10, 0.44, 0, roofY + parapetH - 0.01,
    frontZ - 0.15, 'front-parapet-cap'), ctx.p.ground);
  ctx.push(slab(bodyW + 0.12, 0.10, 0.44, 0, roofY + rearH - 0.01,
    backZ + 0.15, 'rear-parapet-cap'), ctx.p.ground);
  for (const side of [-1, 1]) {
    ctx.push(slab(0.44, 0.10, bodyD - 0.24, side * (bodyW / 2 - 0.15),
      roofY + sideH - 0.01, centreZ, 'side-parapet-cap'), ctx.p.ground);
    if (!deco) continue;
    ctx.push(slab(0.48, parapetH, 0.48, side * (bodyW / 2 - 0.15), roofY,
      frontZ - 0.15, 'deco-parapet-return'), ctx.p.wallAlt);
    ctx.push(slab(0.48, parapetH, 0.48, side * (bodyW / 2 - 0.15), roofY,
      backZ + 0.15, 'deco-parapet-return-rear'), ctx.p.wallAlt);
  }
  detail(ctx, corniceRun(ctx, {
    x: 0, y: roofY + parapetH - 0.03, z: frontZ + 0.01, length: bodyW,
    height: 0.16, projection: 0.16, returns: 0.16,
  }), { trim: 'ground' });
  if (!deco) {
    detail(ctx, dentilCourse(ctx, {
      x: 0, y: roofY - 0.18, z: frontZ + 0.02, length: bodyW * 0.98,
      size: 0.13, pitch: 0.29, height: 0.15, projection: 0.12,
    }), { trim: 'wallAlt' });
  }
  for (let course = 0; course < 3; course += 1) {
    ctx.push(slab(bodyW * (0.985 - course * 0.008), 0.055, 0.10 + course * 0.025,
      0, roofY - 0.35 - course * 0.057, frontZ + 0.055,
      'parapet-corbel-course'), ctx.p.wallAlt);
  }

  // The gutter is hung from a fascia under the parapet edge; both downpipes begin at its
  // outlets and finish at paved gullies, closing the rainwater path from roof to ground.
  detail(ctx, gutterRun(ctx, {
    x: 0, y: roofY + 0.06, z: frontZ + 0.12, length: bodyW * 0.92,
    style: 'ogee', depth: 0.15, fascia: true, fasciaDrop: 0.19,
  }));
  for (const side of [-1, 1]) {
    const x = side * (bodyW / 2 - 0.32);
    addHopper(ctx, { x, y: roofY + 0.01, z: frontZ + 0.10, salt: 224 + (side + 1) });
    detail(ctx, downpipe(ctx, {
      x, z: frontZ + 0.03,
      fromY: roofY - 0.23, toY: 0.14, radius: 0.055, swan: 0.10, brackets: 3, shoe: true,
    }));
  }
}

function addRearAndSideOpenings(ctx, {
  baseY, bodyW, bodyD, frontZ, backZ, sideOpenings, rearOpenings,
}) {
  const sunSide = ctx.v.chance(116, 0.5) ? 1 : -1;
  for (const side of [-1, 1]) {
    const flank = Array.isArray(sideOpenings)
      ? sideOpenings
      : (sideOpenings[side] ?? []);
    const face = side * bodyW / 2;
    punchedShell(ctx, {
      axis: 'z', face, normal: side, min: backZ, max: frontZ,
      baseY, height: ctx.env.wallH, thickness: 0.34,
      openings: flank, material: ctx.p.wall, name: `side-shell-${side}`,
    });
    brickFace(ctx, {
      axis: 'z', face, normal: side, min: backZ, max: frontZ,
      baseY, height: ctx.env.wallH, openings: flank,
      salt: 126 + side, sparse: true,
    });
    for (let i = 0; i < flank.length; i += 1) {
      const o = flank[i];
      const angle = side * Math.PI / 2;
      if (o.kind === 'door') {
        const bundle = frontDoor(ctx, {
          x: face, y: o.y, z: o.x, width: o.width, height: o.height,
          style: 'flush', reveal: 0.30, fanlight: 0.22, salt: 164 + i + (side + 1) * 8,
        });
        detail(ctx, orientedBundle(bundle, { x: face, z: o.x, angle }));
        continue;
      }
      const bundle = doubleHungWindow(ctx, {
        x: face, y: o.y, z: o.x, width: o.width, height: o.height,
        reveal: 0.30, sash: '2over2', curtain: 'none', salt: 210 + i + (side + 1) * 10,
      });
      detail(ctx, orientedBundle(bundle, { x: face, z: o.x, angle }));
      const curtain = curtainBundle(ctx, { ...o, x: face }, o.x - 0.37,
        250 + i + (side + 1) * 10);
      detail(ctx, orientedBundle(curtain, { x: face, z: o.x, angle }));
    }
    const ventZ = backZ + bodyD * (side < 0 ? 0.22 : 0.72);
    detail(ctx, orientedBundle(ventGrille(ctx, {
      x: face, y: baseY + 0.32, z: ventZ, width: 0.52, height: 0.28, style: 'airbrick',
    }), { x: face, z: ventZ, angle: side * Math.PI / 2 }));
    if (side === -sunSide) {
      repointingPatch(ctx, {
        axis: 'z', face, normal: side, centre: backZ + bodyD * 0.68,
        yBase: baseY + 0.26,
      });
    }
  }

  punchedShell(ctx, {
    axis: 'x', face: backZ, normal: -1, min: -bodyW / 2, max: bodyW / 2,
    baseY, height: ctx.env.wallH, thickness: 0.34,
    openings: rearOpenings, material: ctx.p.wall, name: 'rear-shell',
  });
  brickFace(ctx, {
    axis: 'x', face: backZ, normal: -1, min: -bodyW / 2, max: bodyW / 2,
    baseY, height: ctx.env.wallH, openings: rearOpenings, salt: 132, sparse: true,
  });
  for (let i = 0; i < rearOpenings.length; i += 1) {
    const o = rearOpenings[i];
    if (o.kind === 'door') {
      const bundle = frontDoor(ctx, {
        x: o.x, y: o.y, z: backZ, width: o.width, height: o.height,
        style: 'flush', reveal: 0.30, fanlight: 0.18, salt: 174 + i,
      });
      detail(ctx, orientedBundle(bundle, { x: o.x, z: backZ, angle: Math.PI }));
      continue;
    }
    const bundle = doubleHungWindow(ctx, {
      x: o.x, y: o.y, z: backZ, width: o.width, height: o.height,
      reveal: 0.30, sash: '2over2', curtain: 'none', salt: 270 + i,
    });
    detail(ctx, orientedBundle(bundle, { x: o.x, z: backZ, angle: Math.PI }));
  }
  detail(ctx, orientedBundle(ventGrille(ctx, {
    x: 0, y: baseY + 0.34, z: backZ, width: 0.60, height: 0.28, style: 'airbrick',
  }), { x: 0, z: backZ, angle: Math.PI }));
}

function addChimneyBreast(ctx, {
  side, bodyW, frontZ, backZ, baseY, roofY, salt,
}) {
  const z = backZ + (frontZ - backZ) * 0.44;
  const outerFace = side * (bodyW / 2 + 0.42);
  ctx.push(slab(0.58, roofY - baseY, 1.18, outerFace - side * 0.29,
    baseY, z, 'flank-chimney-breast'), ctx.p.wall);
  brickFace(ctx, {
    axis: 'z', face: outerFace, normal: side, min: z - 0.59, max: z + 0.59,
    baseY, height: roofY - baseY, salt, sparse: true,
  });
  ctx.push(slab(0.70, 0.09, 1.30, outerFace - side * 0.29, roofY - 0.10,
    z, 'chimney-breast-corbel'), ctx.p.wallAlt);
  detail(ctx, chimney(ctx, {
    x: side * (bodyW / 2 - 0.46), z, baseY: roofY - 0.18,
    height: 1.42, width: 0.82, depth: 1.02, pots: 2, salt: salt + 6,
  }));
}

function addRearServiceWing(ctx, { bodyW, backZ, baseY, entryX, salt }) {
  const width = Math.min(3.0, bodyW * 0.24);
  const depth = 2.72;
  const height = 2.56;
  const outerZ = backZ - depth;
  const doorW = 0.92;
  const jambW = (width - doorW) / 2;
  for (const hand of [-1, 1]) {
    ctx.push(slab(jambW, height, depth, entryX + hand * (doorW / 2 + jambW / 2),
      baseY, backZ - depth / 2, 'service-wing-jamb'), ctx.p.wall);
  }
  ctx.push(slab(doorW, 0.34, depth, entryX, baseY + height - 0.34,
    backZ - depth / 2, 'service-wing-head'), ctx.p.wall);
  ctx.push(skillion(width + 0.22, 0.09, entryX,
    backZ + 0.05, baseY + height + 0.22,
    outerZ - 0.10, baseY + height + 0.02,
    'service-wing-skillion'), ctx.p.roof);
  const door = frontDoor(ctx, {
    x: entryX, y: baseY + 0.10, z: outerZ, width: doorW, height: 2.10,
    style: 'flush', reveal: 0.24, fanlight: 0.16, salt,
  });
  detail(ctx, orientedBundle(door, { x: entryX, z: outerZ, angle: Math.PI }));
}

function standardOpenings(ctx, entryX) {
  const front = [];
  const side = { '-1': [], '1': [] };
  const rear = [];
  const floor = ctx.env.storeyH;
  const frontXs = [-0.36, -0.13, 0.13, 0.36].map((f) => ctx.env.bodyW * f);
  for (let storey = 0; storey < 3; storey += 1) {
    const y = 0.14 + storey * floor + 0.64;
    for (const x of frontXs) front.push(opening(x, y, 1.34, 1.58));
    side[-1].push(opening(ctx.env.backZ + ctx.env.bodyD * 0.72, y, 1.30, 1.48));
    for (const zf of [0.30, 0.72]) {
      side[1].push(opening(ctx.env.backZ + ctx.env.bodyD * zf, y, 1.20, 1.44));
    }
    for (const x of [-0.24, 0.24]) {
      rear.push(opening(ctx.env.bodyW * x, y, 1.24, 1.44));
    }
  }
  side[-1].push(opening(ctx.env.backZ + ctx.env.bodyD * 0.24, 0.30, 0.96, 2.20, 'door'));
  rear.push(opening(entryX, 0.30, 0.96, 2.20, 'door'));
  front.push(opening(entryX, 0.30, 1.12, 2.30, 'door'));
  return { front, side, rear };
}

function buildWalkup(ctx) {
  tuneInterwarMaterials(ctx, false);
  const { bodyW, bodyD, frontZ, backZ, wallH, storeyH, facade } = ctx.env;
  const baseY = 0.14;
  const entryX = 0;
  const openings = standardOpenings(ctx, entryX);
  const shellT = 0.34;
  const coreW = bodyW - shellT * 2 - 0.12;
  const coreD = bodyD - shellT * 2 - 0.12;
  ctx.push(box(coreW, wallH, coreD, 0, baseY + wallH / 2,
    (frontZ + backZ) / 2, 'walkup-masonry-core'), ctx.p.wall);
  punchedShell(ctx, {
    axis: 'x', face: frontZ, normal: 1, min: -bodyW / 2, max: bodyW / 2,
    baseY, height: wallH, thickness: shellT, openings: openings.front,
    material: ctx.p.wall, name: 'walkup-front-shell',
  });
  brickFace(ctx, {
    axis: 'x', face: frontZ, normal: 1, min: -bodyW / 2, max: bodyW / 2,
    baseY, height: wallH, openings: openings.front, salt: 141, sparse: true,
  });
  addRearAndSideOpenings(ctx, {
    baseY, bodyW, bodyD, frontZ, backZ,
    sideOpenings: openings.side, rearOpenings: openings.rear,
  });

  for (let i = 0; i < openings.front.length; i += 1) {
    const o = openings.front[i];
    if (o.kind === 'door') {
      detail(ctx, frontDoor(ctx, {
        x: entryX, y: o.y, z: frontZ, width: o.width, height: o.height,
        style: 'panelled', reveal: 0.32, fanlight: 0.36, salt: 160 + facade,
      }));
    } else addWindow(ctx, o, { face: frontZ, surround: true, salt: 180 + i });
  }
  addPortal(ctx, { entryX, frontZ, baseY, deco: false });

  for (let floor = 0; floor < 3; floor += 1) {
    wrapCourse(ctx, {
      y: baseY + floor * storeyH + 0.48, frontZ, backZ, bodyW, bodyD,
      height: 0.12, salt: 140 + floor,
    });
    wrapCourse(ctx, {
      y: baseY + floor * storeyH + 2.42, frontZ, backZ, bodyW, bodyD,
      height: 0.16, salt: 150 + floor,
    });
  }
  const roofY = baseY + wallH;
  addWalkupEntryBay(ctx, { entryX, frontZ, baseY, roofY });
  // A two-course projecting plinth gives every elevation a load path into the lot datum.
  ctx.push(slab(bodyW + 0.14, 0.46, 0.22, 0, baseY, frontZ + 0.05,
    'walkup-front-brick-plinth'), ctx.p.wallAlt);
  ctx.push(slab(bodyW + 0.14, 0.46, 0.22, 0, baseY, backZ - 0.05,
    'walkup-rear-brick-plinth'), ctx.p.wallAlt);
  for (const side of [-1, 1]) {
    ctx.push(slab(0.22, 0.46, bodyD, side * (bodyW / 2 + 0.05), baseY,
      (frontZ + backZ) / 2, 'walkup-flank-brick-plinth'), ctx.p.wallAlt);
  }
  addChimneyBreast(ctx, {
    side: ctx.v.chance(152, 0.5) ? 1 : -1,
    bodyW, frontZ, backZ, baseY, roofY, salt: 188,
  });
  addRearServiceWing(ctx, { bodyW, backZ, baseY, entryX, salt: 196 });
  addFlatRoof(ctx, {
    bodyW, bodyD, frontZ, backZ, roofY, frontOpenings: openings.front, deco: false,
  });
  // The centre is the stair bay and therefore rises above the residential wings. The full
  // parapet remains behind it, so the end bays read as deliberate lower shoulders.
  ctx.push(slab(bodyW * 0.42, 0.62, 0.36, entryX, roofY + 0.58,
    frontZ - 0.12, 'walkup-raised-centre-parapet'), ctx.p.wallAlt);
  ctx.push(slab(bodyW * 0.42 + 0.20, 0.12, 0.50, entryX, roofY + 1.17,
    frontZ - 0.12, 'walkup-raised-centre-coping'), ctx.p.ground);
  const secondSide = ctx.v.chance(152, 0.5) ? -1 : 1;
  detail(ctx, chimney(ctx, {
    x: secondSide * (bodyW / 2 - 0.72), z: backZ + bodyD * 0.72,
    baseY: roofY - 0.12, height: 1.22, width: 0.70, depth: 0.78,
    pots: 1, salt: 206,
  }));
  const serviceZ = backZ + bodyD * 0.82;
  addSideDrainage(ctx, { side: 1, z: serviceZ, baseY, roofY, salt: 214 });
  detail(ctx, orientedBundle(ventGrille(ctx, {
    x: bodyW / 2 + 0.04, y: roofY - 1.02, z: serviceZ - 0.74,
    width: 0.60, height: 0.60, style: 'louvre',
  }), { x: bodyW / 2 + 0.04, z: serviceZ - 0.74, angle: Math.PI / 2 }));
  addMeterBox(ctx, {
    x: bodyW / 2 + 0.05, y: baseY + 1.20, z: serviceZ - 0.86, angle: Math.PI / 2,
  });

  applySharedWear(ctx, { width: bodyW, frontZ, baseY, salt: 170 });
  detail(ctx, composeLot(ctx, {
    era: 'interwar', entryX, driveway: false, planting: 'shrubbery',
    services: false, streetTree: false,
  }));
}

function towerBrickSkin(ctx, { cx, cz, radius, baseY, height, gapAngle }) {
  if (ctx.q === 'low') return;
  if (retireDecoMortar(ctx, 'tower-mortar-grid')) return;
  const positions = [];
  // The tower's brick texture supplies the true 80 mm albedo rhythm. A raised joint every
  // 120 mm is the visual relief pass; denser closed strips spend four figures of triangles
  // on sub-pixel geometry and push façade variant zero over the hard ceiling.
  const course = ctx.q === 'high' ? 0.16 : 0.20;
  const mortar = ctx.q === 'high' ? 0.018 : 0.022;
  const segs = ctx.q === 'high' ? 6 : 5;
  const ranges = [[-Math.PI / 2, -gapAngle], [gapAngle, Math.PI / 2]];
  const point = (a, y) => [cx + Math.sin(a) * (radius + 0.012), y,
    cz + Math.cos(a) * (radius + 0.012)];
  const rows = Math.floor(height / course);
  for (let row = 0; row < rows; row += 1) {
    const y0 = baseY + row * course;
    const y1 = y0 + mortar;
    for (const [a0, a1] of ranges) {
      for (let i = 0; i < segs; i += 1) {
        const aa = a0 + ((a1 - a0) * i) / segs;
        const ab = a0 + ((a1 - a0) * (i + 1)) / segs;
        pushFace(positions, point(aa, y0), point(ab, y0), point(ab, y1), point(aa, y1));
      }
      if (row % 12 !== 0) continue;
      const jointStep = 0.24 / radius;
      const stagger = (row & 1) * jointStep * 0.5;
      for (let a = a0 + jointStep + stagger; a < a1; a += jointStep) {
        const da = mortar / radius;
        pushFace(positions,
          point(a - da / 2, y0 + mortar), point(a + da / 2, y0 + mortar),
          point(a + da / 2, y0 + course), point(a - da / 2, y0 + course));
      }
    }
  }
  ctx.push(faceGeometry(positions, 'tower-mortar-grid'), ctx.p.ground);
}

function addStairTower(ctx, { cx, cz, radius, baseY, roofY }) {
  const height = roofY - baseY + 1.42;
  const gapAngle = Math.asin(Math.min(0.42, 0.42 / radius));
  const towerLeft = arcPanel({
    cx, cz, rOuter: radius, rInner: radius - 0.28, yBase: baseY, height,
    a0: -Math.PI / 2, a1: -gapAngle, segments: ctx.detail ? 32 : 12, name: 'tower-shell-left',
  });
  const towerRight = arcPanel({
    cx, cz, rOuter: radius, rInner: radius - 0.28, yBase: baseY, height,
    a0: gapAngle, a1: Math.PI / 2, segments: ctx.detail ? 32 : 12, name: 'tower-shell-right',
  });
  authorCurvedMasonryMap(towerLeft, { cx, cz });
  authorCurvedMasonryMap(towerRight, { cx, cz });
  ctx.push(towerLeft, ctx.p.wall);
  ctx.push(towerRight, ctx.p.wall);
  towerBrickSkin(ctx, { cx, cz, radius, baseY, height: height - 0.10, gapAngle });

  const stripW = 0.86;
  const stripY = baseY + 0.46;
  const stripH = height - 0.54;
  const glassZ = cz + radius - 0.025;
  ctx.push(box(stripW, stripH, 0.035, cx, stripY + stripH / 2, glassZ,
    'tower-glazed-strip'), ctx.p.glass);
  ctx.push(box(stripW, stripH, 0.035, cx, stripY + stripH / 2, glassZ - 0.08,
    'tower-strip-shadow'), ctx.p.shadow);
  for (const x of [cx - stripW / 2, cx + stripW / 2]) {
    ctx.push(box(0.075, stripH, 0.09, x, stripY + stripH / 2, glassZ + 0.02,
      'tower-strip-jamb'), ctx.p.iron);
  }
  ctx.push(box(0.065, stripH, 0.085, cx, stripY + stripH / 2, glassZ + 0.02,
    'tower-strip-centre-mullion'), ctx.p.iron);
  const panes = ctx.detail ? 10 : 6;
  for (let i = 0; i <= panes; i += 1) {
    ctx.push(box(stripW, 0.075, 0.09, cx, stripY + (stripH * i) / panes,
      glassZ + 0.02, 'tower-strip-mullion'), ctx.p.iron);
  }
  for (let floor = 1; floor < 3; floor += 1) {
    ctx.push(arcPanel({
      cx, cz, rOuter: radius + 0.10, rInner: radius - 0.03,
      yBase: baseY + floor * ctx.env.storeyH - 0.18, height: 0.22,
      a0: -Math.PI / 2, a1: Math.PI / 2, segments: ctx.detail ? 14 : 8,
      name: 'tower-string-course',
    }), ctx.p.trim);
  }
  ctx.push(arcPanel({
    cx, cz, rOuter: radius + 0.12, rInner: radius - 0.02,
    yBase: baseY + height - 0.18, height: 0.18,
    a0: -Math.PI / 2, a1: Math.PI / 2, segments: ctx.detail ? 14 : 8,
    name: 'tower-capping',
  }), ctx.p.trim);
  ctx.push(arcPanel({
    cx, cz, rOuter: radius + 0.18, rInner: radius - 0.04,
    yBase: baseY + height - 0.04, height: 0.25,
    a0: -Math.PI / 2, a1: Math.PI / 2, segments: ctx.detail ? 32 : 12,
    name: 'tower-crown-collar',
  }), ctx.p.trim);
  ctx.push(arcPanel({
    cx, cz, rOuter: radius + 0.28, rInner: radius - 0.08,
    yBase: baseY + height + 0.20, height: 0.18,
    a0: -Math.PI / 2, a1: Math.PI / 2, segments: ctx.detail ? 32 : 12,
    name: 'tower-crown-cap',
  }), ctx.p.ground);
}

function arcBrickSkinBand(ctx, { cx, cz, radius, yBase, height, a0, a1, segments }) {
  if (ctx.q === 'low') return;
  if (retireDecoMortar(ctx, 'bay-curved-mortar-courses')) return;
  const positions = [];
  // The broad albedo/normal texture carries the intervening courses. A raised mortar line
  // every second real course is the highest density that remains legible at board altitude.
  const course = ctx.q === 'high' ? 0.16 : 0.24;
  const mortar = ctx.q === 'high' ? 0.012 : 0.018;
  const point = (a, y) => [cx + Math.sin(a) * (radius + 0.014), y,
    cz + Math.cos(a) * (radius + 0.014)];
  const rows = Math.floor(height / course);
  for (let row = 0; row <= rows; row += 1) {
    const y0 = Math.min(yBase + height, yBase + row * course);
    const y1 = Math.min(yBase + height, y0 + mortar);
    for (let seg = 0; seg < segments; seg += 1) {
      const aa = a0 + ((a1 - a0) * seg) / segments;
      const ab = a0 + ((a1 - a0) * (seg + 1)) / segments;
      pushFace(positions, point(aa, y0), point(ab, y0), point(ab, y1), point(aa, y1));
    }
  }
  ctx.push(faceGeometry(positions, 'bay-curved-mortar-courses'), ctx.p.ground);
}

function addSegmentalBay(ctx, { cx, cz, radius, baseY }) {
  const a0 = -1.03;
  const a1 = 1.03;
  const segs = ctx.detail ? 20 : 10;
  const bandSegs = ctx.detail ? 12 : 8;
  const masonrySegs = ctx.detail ? 8 : 6;
  for (let floor = 0; floor < 3; floor += 1) {
    const floorY = baseY + floor * ctx.env.storeyH;
    const sillY = floorY + 0.54;
    const windowH = 1.62;
    const baySpandrel = arcSurface({
      cx, cz, radius, yBase: floorY, height: 0.58,
      a0, a1, segments: segs, name: 'bay-spandrel',
    });
    authorCurvedMasonryMap(baySpandrel, { cx, cz });
    ctx.push(baySpandrel, ctx.p.wall);
    arcBrickSkinBand(ctx, {
      cx, cz, radius, yBase: floorY, height: 0.58, a0, a1, segments: masonrySegs,
    });
    ctx.push(arcSurface({
      cx, cz, radius: radius + 0.025, yBase: sillY, height: windowH,
      a0, a1, segments: segs, name: 'bay-glass',
    }), ctx.p.glass);
    ctx.push(arcSurface({
      cx, cz, radius: radius - 0.075, yBase: sillY + 0.08, height: windowH - 0.16,
      a0, a1, segments: segs,
      name: 'bay-room-shadow',
    }), ctx.p.shadow);
    // One neutral room card backs the whole unit. Per-pane curtains made adjacent panes
    // switch from charcoal glass to opaque cream and destroyed the continuous curved bay.
    ctx.push(arcSurface({
      cx, cz, radius, yBase: sillY + windowH,
      height: ctx.env.storeyH - 0.54 - windowH,
      a0, a1, segments: segs, name: 'bay-head-spandrel',
    }), ctx.p.wallAlt);
    arcBrickSkinBand(ctx, {
      cx, cz, radius, yBase: sillY + windowH,
      height: ctx.env.storeyH - 0.54 - windowH, a0, a1, segments: masonrySegs,
    });
    const mullions = 7;
    for (let i = 0; i <= mullions; i += 1) {
      const a = a0 + ((a1 - a0) * i) / mullions;
      ctx.push(rotBox(0.075, windowH, 0.11,
        cx + Math.sin(a) * (radius + 0.04), sillY + windowH / 2,
        cz + Math.cos(a) * (radius + 0.04), { y: a }, 'bay-mullion'), ctx.p.iron);
    }
    for (const y of [sillY, sillY + windowH * 0.52, sillY + windowH]) {
      ctx.push(arcSurface({
        cx, cz, radius: radius + 0.07, yBase: y - 0.035, height: 0.07,
        a0, a1, segments: bandSegs, name: 'bay-rail',
      }), ctx.p.iron);
    }
    ctx.push(arcSurface({
      cx, cz, radius: radius + 0.15, yBase: sillY - 0.04, height: 0.12,
      a0, a1, segments: bandSegs,
      name: 'bay-continuous-sill',
    }), ctx.p.trim);
    ctx.push(arcSurface({
      cx, cz, radius: radius + 0.10, yBase: sillY + windowH, height: 0.10,
      a0, a1, segments: bandSegs,
      name: 'bay-continuous-head',
    }), ctx.p.trim);
  }
}

/** Flanking lights: a deep masonry reveal, stone sill and render head. Not a wrapped band. */
function decoFlankingWindow(ctx, o, face, salt) {
  detail(ctx, doubleHungWindow(ctx, {
    x: o.x, y: o.y, z: face, width: o.width, height: o.height,
    reveal: 0.34, sash: '2over2', curtain: 'none', salt,
  }));
  ctx.push(slab(o.width + 0.28, 0.10, 0.22, o.x, o.y - 0.10, face + 0.01,
    'deco-window-sill'), ctx.p.ground);
  ctx.push(slab(o.width + 0.16, 0.11, 0.16, o.x, o.y + o.height, face,
    'deco-window-head'), ctx.p.trim);
  for (const side of [-1, 1]) {
    ctx.push(box(0.07, o.height - 0.04, 0.22,
      o.x + side * (o.width / 2 + 0.015), o.y + o.height / 2, face - 0.08,
      'deco-window-jamb'), ctx.p.trim);
  }
}

function chevronRelief(ctx, { x, y, z, width = 0.70, height = 0.45 }) {
  for (const offset of [0, 0.18]) {
    ctx.push(rotBox(width * 0.58, 0.065, 0.045, x - width * 0.15,
      y + offset, z, { z: -Math.atan2(height, width) }, 'deco-chevron'), ctx.p.shadow);
    ctx.push(rotBox(width * 0.58, 0.065, 0.045, x + width * 0.15,
      y + offset, z, { z: Math.atan2(height, width) }, 'deco-chevron'), ctx.p.shadow);
  }
}

function buildDeco(ctx) {
  tuneInterwarMaterials(ctx, true);
  const { bodyW, bodyD, frontZ, backZ, wallH, storeyH, facade } = ctx.env;
  const baseY = 0.14;
  const mirror = facade % 2 === 0 ? 1 : -1;
  const entryX = mirror * 0.12;
  const towerX = -mirror * bodyW * 0.18;
  const bayX = mirror * bodyW * 0.365;
  const wingX = -mirror * bodyW * 0.405;
  const flatX = mirror * bodyW * 0.15;
  const towerR = 1.34;
  const bayR = 1.43;
  const front = [opening(entryX, 0.30, 1.94, 2.69, 'door')];
  for (let floor = 0; floor < 3; floor += 1) {
    const y = baseY + floor * storeyH + 0.64;
    front.push(opening(wingX, y, 1.28, 1.54));
    front.push(opening(flatX, y, 1.28, 1.54));
  }
  const side = { '-1': [], '1': [] };
  const rear = [];
  for (let floor = 0; floor < 3; floor += 1) {
    const y = baseY + floor * storeyH + 0.66;
    side[-1].push(opening(backZ + bodyD * 0.30, y, 1.18, 1.42));
    side[1].push(opening(backZ + bodyD * 0.28, y, 1.18, 1.42));
    side[1].push(opening(backZ + bodyD * 0.68, y, 1.18, 1.42));
    rear.push(opening(-bodyW * 0.22, y, 1.22, 1.42));
    rear.push(opening(bodyW * 0.22, y, 1.22, 1.42));
  }
  side[-1].push(opening(backZ + bodyD * 0.68, 0.30, 0.94, 2.18, 'door'));
  side[1].push(opening(backZ + bodyD * 0.78, 0.30, 0.90, 1.90, 'door'));
  rear.push(opening(0, 0.30, 0.94, 2.18, 'door'));

  const shellT = 0.34;
  ctx.push(box(bodyW - shellT * 2 - 0.12, wallH, bodyD - shellT * 2 - 0.12,
    0, baseY + wallH / 2, (frontZ + backZ) / 2, 'deco-masonry-core'), ctx.p.wall);
  punchedShell(ctx, {
    axis: 'x', face: frontZ, normal: 1, min: -bodyW / 2, max: bodyW / 2,
    baseY, height: wallH, thickness: shellT, openings: front,
    material: ctx.p.wall, name: 'deco-front-shell',
  });
  brickFace(ctx, {
    axis: 'x', face: frontZ, normal: 1, min: -bodyW / 2, max: bodyW / 2,
    baseY, height: wallH, openings: front, salt: 151, sparse: true,
  });
  addRearAndSideOpenings(ctx, {
    baseY, bodyW, bodyD, frontZ, backZ, sideOpenings: side, rearOpenings: rear,
  });
  for (let i = 0; i < front.length; i += 1) {
    const o = front[i];
    if (o.kind === 'door') {
      addDecoEntry(ctx, { entryX, frontZ, baseY });
    } else decoFlankingWindow(ctx, o, frontZ, 190 + i);
  }
  addPortal(ctx, { entryX, frontZ, baseY, deco: true });

  const roofY = baseY + wallH;
  addFlatRoof(ctx, {
    bodyW, bodyD, frontZ, backZ, roofY, frontOpenings: front, deco: true,
  });
  addStairTower(ctx, {
    cx: towerX, cz: frontZ - 0.18, radius: towerR, baseY, roofY,
  });
  addSegmentalBay(ctx, {
    cx: bayX, cz: frontZ - 0.30, radius: bayR, baseY,
  });

  // The stair drum is one jamb of the entry. The other jamb is a stone pier in the
  // gap before the nearer window stack, carried up into the parapet.
  const pierX = entryX + mirror * 1.02;
  ctx.push(slab(0.20, wallH + 0.56, 0.22, pierX, baseY, frontZ - 0.02,
    'deco-entry-pier'), ctx.p.trim);
  for (let groove = -1; groove <= 1; groove += 1) {
    ctx.push(box(0.026, wallH - 0.30, 0.028, pierX + groove * 0.045,
      baseY + wallH / 2, frontZ + 0.10, 'deco-pier-flute'), ctx.p.shadow);
  }
  // Three brick piers a side, in the gaps of the punched rhythm, from plinth to parapet.
  for (const flank of [-1, 1]) {
    const face = flank * (bodyW / 2);
    for (const fraction of [0.12, 0.48, 0.90]) {
      const z = backZ + bodyD * fraction;
      ctx.push(slab(0.28, roofY - baseY + 0.46, 0.42,
        face + flank * 0.10, baseY, z, 'deco-flank-pier'), ctx.p.wall);
      ctx.push(slab(0.38, 0.28, 0.54,
        face + flank * 0.14, baseY - 0.02, z, 'deco-flank-pier-plinth'), ctx.p.ground);
      ctx.push(slab(0.36, 0.12, 0.52,
        face + flank * 0.13, roofY + 0.40, z, 'deco-flank-pier-cap'), ctx.p.ground);
    }
  }
  const serviceSide = 1;
  const serviceZ = backZ + bodyD * 0.72;
  const serviceFace = serviceSide * bodyW / 2;
  addSideDrainage(ctx, {
    side: serviceSide, z: serviceZ + 0.30, baseY, roofY, salt: 448,
  });
  addMeterBox(ctx, {
    x: serviceFace + 0.055, y: baseY + 1.20, z: serviceZ - 1.10,
    angle: Math.PI / 2,
  });

  // Brick panels between the flanking lights. No extra grooves — the sill and head own that scale.
  for (const x of [wingX, flatX]) {
    for (let floor = 0; floor < 2; floor += 1) {
      const sy = baseY + floor * storeyH + 2.50;
      ctx.push(slab(1.08, 0.42, 0.045, x, sy, frontZ + 0.02,
        'deco-recessed-spandrel'), ctx.p.wallAlt);
    }
  }

  // Stepped parapet bears on the front coping, over the entry, and stops short of the stair crown.
  detail(ctx, steppedParapet(ctx, {
    x: entryX, y: roofY + 0.64, z: frontZ - 0.31,
    width: 2.55, height: 0.72, steps: 3, depth: 0.26, reeds: true,
  }));
  chevronRelief(ctx, {
    x: entryX, y: roofY + 0.86, z: frontZ + 0.02, width: 0.62, height: 0.34,
  });

  applySharedWear(ctx, { width: bodyW, frontZ, baseY, salt: 190 });
  detail(ctx, composeLot(ctx, {
    era: 'interwar', entryX, driveway: false, planting: 'shrubbery',
    services: false, streetTree: false,
  }));
  authorDecoPartMaps(ctx);
}

export const WALKUP_BUILDERS = Object.freeze({
  'walkup-flats': (ctx) => buildWalkup(ctx),
  'art-deco-flats': (ctx) => buildDeco(ctx),
});
