import { clusterCanopyPart } from '../../foliage.js';
// District Deck V3.60 — modern massing kit.
// Punched walls with dark rooms, seated charcoal roofs, chunky members.
// Do not call house-kit corrugated roofs from this lane.

import * as THREE from 'three';
import { box, slab, cyl, rotBox, taper } from '../core.js';
import { floorPlate, wallShell, chimney } from '../houses/house-kit.js';

export { floorPlate, wallShell, chimney };

/**
 * A raking wall: the triangular end that carries a skillion plane.
 *
 * The lane had `gable()` for a two-pitch roof and nothing for a one-pitch one, so the V3.60
 * skillion sat on a flat-topped box and the roof read as a lid rather than as the top of the
 * wall. Eight triangles, wound counter-clockwise seen from outside — verified face by face
 * against the solid's centroid, because a raking wall wound inward is an invisible wall and the
 * envelope then reads as a hole, which §1.2 counts as a major.
 *
 * Cross-section is a right triangle in the YZ plane: low at −Z, high at +Z. Extruded along X.
 */
export function rakingWall(thick, d, rise, x, yBase, z, name = 'rake') {
  const ht = thick / 2;
  const hz = d / 2;
  const v = new Float32Array([
    -ht, 0, -hz, -ht, 0, hz, -ht, rise, hz,
    ht, 0, -hz, ht, 0, hz, ht, rise, hz,
  ]);
  const faces = [
    0, 1, 2, // −X end
    3, 5, 4, // +X end
    0, 3, 4, 0, 4, 1, // soffit
    1, 4, 5, 1, 5, 2, // high face at +Z
    0, 2, 5, 0, 5, 3, // the rake itself
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.setIndex(faces);
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();
  flat.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(flat.attributes.position.count * 2), 2));
  flat.translate(x, yBase, z);
  flat.name = name;
  return flat;
}

/**
 * The OTHER raking end: a right triangle in the XY plane, extruded along Z.
 *
 * **r12 — this exists because major 1 was a member built in the wrong frame twice.**
 * `rakingWall()` above extrudes along X, so it can only close the end of a roof that falls in
 * Z. `house-modern-skillion`'s wing roof falls in X (`fall: 'right'` — the opposition to the
 * main plane IS the id's identity), so its open ends are the +Z and −Z faces and there was no
 * primitive for them. r10 filled them with two rotated BOXES hung from the roof, which is how a
 * 2.5 m render slab ended up hanging across the wing's ground-floor window with nothing under
 * it: a box has a bottom, and the bottom of that box was in mid air over an opening.
 *
 * A triangle has no bottom below its base. The base sits ON the wall head and the hypotenuse
 * follows the roof, so the member cannot reach an opening and cannot end in air — the shape
 * itself is the proof, not a tolerance.
 *
 * Cross-section: right triangle, low at +X, high at −X, apex directly above the −X corner.
 * Eight triangles, wound counter-clockwise seen from outside; every face is checked against the
 * solid's centroid by `v370-l1-winding-probe.mjs`, because an inward-wound face here is a hole
 * through a gable end and §1.2 counts that as a major.
 */
export function rakingEnd(w, thick, rise, x, yBase, z, name = 'rake-end') {
  const hw = w / 2;
  const ht = thick / 2;
  const v = new Float32Array([
    -hw, 0, -ht, hw, 0, -ht, -hw, rise, -ht,
    -hw, 0, ht, hw, 0, ht, -hw, rise, ht,
  ]);
  const faces = [
    0, 2, 1,            // −Z end
    3, 4, 5,            // +Z end
    0, 1, 4, 0, 4, 3,   // soffit (y = 0)
    0, 3, 5, 0, 5, 2,   // the high vertical face at −X
    1, 2, 5, 1, 5, 4,   // the rake itself
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.setIndex(faces);
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();
  flat.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(flat.attributes.position.count * 2), 2));
  flat.translate(x, yBase, z);
  flat.name = name;
  return flat;
}

export const MODERN_METRICS = Object.freeze({
  wallDepth: 0.30,
  reveal: 0.20,
  parapet: 0.48,
  railH: 1.02,
  battenPitch: 0.14,
  battenT: 0.065,
  balconySlab: 0.18,
  balconyProj: 1.12,
  // 0.62, up from 0.48. Two reasons and both are measurements. A 0.062 batten with a 0.030
  // bead beside it is 3.4 px and 1.7 px on the r7 plate's roof, and a 1.7 px dark line beside
  // a 3.4 px light one at a fixed pitch is what produced the checkered read; and the pair was
  // the second-largest line in the roof bucket's triangle spend. Fewer, chunkier seams read as
  // more of a standing seam, not less.
  seamPitch: 0.62,
});

function part(geometry, material) {
  return { geometry, material };
}

export function faceBox(axis, face, plane, { u, y, run, height, depth, set = 0 }, name = 'face') {
  const outer = plane - face * set;
  const centre = outer - face * (depth / 2);
  return axis === 'x'
    ? box(run, height, depth, u, y, centre, name)
    : box(depth, height, run, centre, y, u, name);
}

export function hole(u, y, width, height, tag = 'win') {
  return { u, y, width, height, tag };
}

export function openWall(ctx, {
  material, axis = 'x', face = 1, plane, centre = 0, run, y0, y1,
  depth = MODERN_METRICS.wallDepth, openings = [], name = 'wall',
}) {
  if (!(run > 0.02) || !(y1 - y0 > 0.02)) return [];
  const out = [];
  const edges = [y0, y1];
  for (const o of openings) {
    edges.push(Math.max(y0, Math.min(y1, o.y)), Math.max(y0, Math.min(y1, o.y + o.height)));
  }
  edges.sort((a, b) => a - b);
  const ys = edges.filter((y, i) => i === 0 || y - edges[i - 1] > 0.004);
  const lo = centre - run / 2;
  const hi = centre + run / 2;
  for (let i = 0; i < ys.length - 1; i += 1) {
    const a = ys[i];
    const b = ys[i + 1];
    const mid = (a + b) / 2;
    const spans = openings
      .filter((o) => o.y < mid && o.y + o.height > mid)
      .map((o) => [o.u - o.width / 2, o.u + o.width / 2])
      .sort((s, t) => s[0] - t[0]);
    let u = lo;
    for (const [s, t] of spans) {
      const left = Math.max(u, lo);
      const right = Math.min(s, hi);
      if (right - left > 0.02) {
        out.push(part(faceBox(axis, face, plane, {
          u: (left + right) / 2, y: mid, run: right - left, height: b - a, depth,
        }, name), material));
      }
      u = Math.max(u, t);
    }
    if (hi - u > 0.02) {
      out.push(part(faceBox(axis, face, plane, {
        u: (u + hi) / 2, y: mid, run: hi - u, height: b - a, depth,
      }, name), material));
    }
  }
  return out;
}

export function volume(ctx, {
  material, x = 0, zFront, zBack, width, y0, y1, depth = MODERN_METRICS.wallDepth,
  front = [], back = [], left = [], right = [], name = 'vol',
}) {
  const out = [];
  const zc = (zFront + zBack) / 2;
  const d = zFront - zBack;
  if (!(width > 0.05) || !(d > 0.05) || !(y1 - y0 > 0.05)) return out;
  if (!(width > depth * 2.2) || !(d > depth * 2.2)) {
    out.push(part(box(width, y1 - y0, d, x, (y0 + y1) / 2, zc, `${name}-solid`), material));
    return out;
  }
  // Dark room, not a wall-coloured core — punched holes must read as interiors.
  const inset = depth * 1.05;
  out.push(part(
    box(
      Math.max(0.18, width - inset * 2),
      Math.max(0.18, y1 - y0 - 0.12),
      Math.max(0.18, d - inset * 2),
      x, (y0 + y1) / 2, zc, `${name}-room`,
    ),
    ctx.p.shadow,
  ));
  out.push(part(
    box(Math.max(0.2, width - depth), 0.10, Math.max(0.2, d - depth), x, y0 + 0.05, zc, `${name}-floor`),
    ctx.p.trim,
  ));
  out.push(...openWall(ctx, {
    material, axis: 'x', face: 1, plane: zFront, centre: x, run: width, y0, y1, depth,
    openings: front, name: `${name}-front`,
  }));
  out.push(...openWall(ctx, {
    material, axis: 'x', face: -1, plane: zBack, centre: x, run: width, y0, y1, depth,
    openings: back, name: `${name}-back`,
  }));
  out.push(...openWall(ctx, {
    material, axis: 'z', face: 1, plane: x + width / 2, centre: zc, run: d, y0, y1, depth,
    openings: right, name: `${name}-right`,
  }));
  out.push(...openWall(ctx, {
    material, axis: 'z', face: -1, plane: x - width / 2, centre: zc, run: d, y0, y1, depth,
    openings: left, name: `${name}-left`,
  }));
  return out;
}

export function flatParapet(ctx, {
  x = 0, z, w, d, y, parapet = MODERN_METRICS.parapet, planted = false, name = 'parapet',
}) {
  const p = ctx.p;
  const out = [];
  out.push(part(slab(w + 0.10, 0.10, d + 0.10, x, y, z, `${name}-deck`), p.roof));
  out.push(part(slab(w + 0.22, parapet, 0.18, x, y, z + d / 2 + 0.05, `${name}-f`), p.wallAlt));
  out.push(part(slab(w + 0.22, parapet, 0.18, x, y, z - d / 2 - 0.05, `${name}-b`), p.wallAlt));
  out.push(part(slab(0.18, parapet, d, x + w / 2 + 0.05, y, z, `${name}-r`), p.wallAlt));
  out.push(part(slab(0.18, parapet, d, x - w / 2 - 0.05, y, z, `${name}-l`), p.wallAlt));
  // The parapet's planting bed is a bed along the front of the roof deck, not a slab across the
  // middle of it. At `w * 0.72 x d * 0.62` centred on the deck it sat under whatever else the
  // roof carries — on `apartment-modern-bar` that is a 2.3 m plant room — and the containment
  // probe measured its clumps inside it. A roof garden is planted where there is room to plant.
  if (planted) {
    out.push(...planter(ctx, {
      x, y: y + 0.02, z: z + d * 0.30, w: w * 0.56, d: Math.max(0.5, d * 0.28), h: 0.38,
    }));
  }
  return out;
}

/**
 * The roof edge: fascia, then gutter, then a bead of shadow under the gutter.
 *
 * §2.4 asks for a fascia and gutter with section. A single 0.10 × 0.12 plank at the eave gives
 * a roof one silhouette line where the reference has three: the fascia board, the gutter that
 * hangs off it, and the dark gap between the gutter and the wall behind. Three members, all
 * cheap, and it is the difference between an edge and a trim strip.
 *
 * `axis: 'x'` runs the edge along X (a front or back eave); `'z'` runs it along Z (a raking or
 * side eave). `outward` is +1 or -1 along the other axis.
 */
export function eaveEdge(ctx, {
  axis = 'x', run, x, y, z, outward = 1, name = 'eave',
}) {
  const p = ctx.p;
  const out = [];
  const along = (w, d) => (axis === 'x' ? [w, d] : [d, w]);
  const off = (n) => (axis === 'x' ? { x, z: z + outward * n } : { x: x + outward * n, z });

  const f = off(0);
  const [fw, fd] = along(run, 0.085);
  out.push(part(box(fw, 0.19, fd, f.x, y, f.z, `${name}-fascia`), p.joinery));

  const g = off(0.075);
  const [gw, gd] = along(run - 0.02, 0.10);
  out.push(part(box(gw, 0.115, gd, g.x, y - 0.035, g.z, `${name}-gutter`), p.roof));
  const [lw, ld] = along(run - 0.02, 0.055);
  out.push(part(box(lw, 0.045, ld, g.x, y + 0.045, g.z, `${name}-gutter-lip`), p.joinery));

  const s = off(-0.055);
  const [sw, sd] = along(run - 0.04, 0.05);
  out.push(part(box(sw, 0.075, sd, s.x, y - 0.115, s.z, `${name}-eave-shadow`), p.shadow));
  return out;
}

/**
 * Charcoal standing-seam gable. Two seated pitches, raised battens, fascia + gutter.
 *
 * V3.70 — the battens were 0.035 × 0.045 and sat 0.06 above a 0.11 deck, which is a rib whose
 * own shadow is thinner than one pixel at board zoom. §2.4 is explicit that a standing seam
 * "shows its battens as raised members with their own shadow", so the section roughly doubles
 * and each batten gets a dark bead beside it. The rake barges also moved from `trim` to `roof`:
 * a cream board along the rake of a charcoal roof is a Federation detail, and it was drawing a
 * pale outline around the one element that should read as a single dark mass.
 */
export function standingSeamGable(ctx, {
  w, d, x = 0, z, springY, pitch = 22, overhang = 0.30, name = 'gable',
  // r2 — the seam pitch is a caller's number, not a module constant. §5.5.5: a member COUNT is
  // what the eye reads, and a roof plane is the largest surface a board camera sees on a low
  // building. `MODERN_METRICS.seamPitch` remains the default so an uncalled site is unchanged.
  seamPitch = MODERN_METRICS.seamPitch,
}) {
  const p = ctx.p;
  const out = [];
  const rad = (pitch * Math.PI) / 180;
  const half = d / 2 + overhang;
  const rise = Math.tan(rad) * half;
  const span = w + overhang * 2;
  const deckY = springY + rise / 2;
  out.push(part(rotBox(span, 0.11, half, x, deckY, z + half / 2 - 0.01, { x: rad }, `${name}-front`), p.roof));
  out.push(part(rotBox(span, 0.11, half, x, deckY, z - half / 2 + 0.01, { x: -rad }, `${name}-back`), p.roof));
  const rake = Math.hypot(half, rise);
  for (const side of [-1, 1]) {
    const bx = x + side * (span / 2 - 0.03);
    out.push(part(rotBox(0.11, 0.15, rake, bx, deckY + 0.03, z + half / 2 - 0.02, { x: rad }, `${name}-rake-f`), p.roof));
    out.push(part(rotBox(0.11, 0.15, rake, bx, deckY + 0.03, z - half / 2 + 0.02, { x: -rad }, `${name}-rake-b`), p.roof));
  }
  out.push(...eaveEdge(ctx, {
    axis: 'x', run: span + 0.04, x, y: springY + 0.02, z: z + d / 2 + overhang * 0.55, outward: 1, name: `${name}-f`,
  }));
  out.push(...eaveEdge(ctx, {
    axis: 'x', run: span + 0.04, x, y: springY + 0.02, z: z - d / 2 - overhang * 0.55, outward: -1, name: `${name}-b`,
  }));
  out.push(part(box(span + 0.02, 0.13, 0.20, x, springY + rise + 0.05, z, `${name}-ridge`), p.roof));
  out.push(part(box(span + 0.02, 0.05, 0.07, x, springY + rise + 0.12, z, `${name}-ridge-cap`), p.joinery));
  const n = Math.max(5, Math.round(span / Math.max(0.24, seamPitch)));
  for (let i = 0; i < n; i += 1) {
    const u = x - span / 2 + (i + 0.5) * (span / n);
    for (const [sign, tag] of [[1, 'f'], [-1, 'b']]) {
      out.push(part(rotBox(0.062, 0.085, half, u, deckY + 0.075, z + sign * half / 2, { x: sign * rad }, `${name}-batten-${tag}`), p.roof));
      out.push(part(rotBox(0.030, 0.050, half, u + 0.052, deckY + 0.062, z + sign * half / 2, { x: sign * rad }, `${name}-batten-bead-${tag}`), p.shadow));
    }
  }
  return out;
}

const alongWFall = (fall) => fall === 'left' || fall === 'right';

/** One seated metal plane. fall = edge that is LOW. */
export function seatedSkillion(ctx, {
  w, d, x = 0, z, yLow, yHigh, fall = 'front', overhang = 0.24, name = 'skillion',
  seamPitch = MODERN_METRICS.seamPitch,
}) {
  const p = ctx.p;
  const out = [];
  const spanW = w + overhang * 2;
  const spanD = d + overhang * 2;
  const drop = yHigh - yLow;
  const midY = (yLow + yHigh) / 2;
  let euler = { x: 0, z: 0 };
  let eave = { axis: 'x', x, y: yLow + 0.02, z: z + spanD / 2 - 0.04, outward: 1, run: spanW };
  if (fall === 'front') {
    euler = { x: Math.atan2(drop, spanD) };
  } else if (fall === 'back') {
    euler = { x: -Math.atan2(drop, spanD) };
    eave = { axis: 'x', x, y: yLow + 0.02, z: z - spanD / 2 + 0.04, outward: -1, run: spanW };
  } else if (fall === 'right') {
    euler = { z: -Math.atan2(drop, spanW) };
    eave = { axis: 'z', x: x + spanW / 2 - 0.04, y: yLow + 0.02, z, outward: 1, run: spanD };
  } else {
    euler = { z: Math.atan2(drop, spanW) };
    eave = { axis: 'z', x: x - spanW / 2 + 0.04, y: yLow + 0.02, z, outward: -1, run: spanD };
  }
  out.push(part(rotBox(spanW, 0.12, spanD, x, midY, z, euler, `${name}-deck`), p.roof));
  out.push(...eaveEdge(ctx, { ...eave, name }));
  // The high edge needs a capping. A skillion's top edge is the one the street sees on this
  // lane's flagship id, and without a capping it shows the deck's raw 120 mm section as a bare
  // cut — the r1 plate had exactly that along the whole street frontage.
  const capW = alongWFall(fall) ? 0.16 : spanW + 0.04;
  const capD = alongWFall(fall) ? spanD + 0.04 : 0.16;
  const capX = fall === 'right' ? x - spanW / 2 + 0.06 : fall === 'left' ? x + spanW / 2 - 0.06 : x;
  const capZ = fall === 'front' ? z - spanD / 2 + 0.06 : fall === 'back' ? z + spanD / 2 - 0.06 : z;
  out.push(part(box(capW, 0.17, capD, capX, yHigh + 0.06, capZ, `${name}-cap`), p.roof));
  out.push(part(box(capW - 0.03, 0.055, capD - 0.03, capX, yHigh + 0.155, capZ, `${name}-cap-lip`), p.joinery));
  const alongW = alongWFall(fall);
  const run = alongW ? spanD : spanW;
  const n = Math.max(4, Math.round(run / Math.max(0.24, seamPitch)));
  for (let i = 0; i < n; i += 1) {
    const t = -run / 2 + (i + 0.5) * (run / n);
    const rx = alongW ? x : x + t;
    const rz = alongW ? z + t : z;
    const [rw, rd] = alongW ? [spanW, 0.060] : [0.060, spanD];
    const [bw, bd] = alongW ? [spanW, 0.030] : [0.030, spanD];
    out.push(part(rotBox(rw, 0.080, rd, rx, midY + 0.080, rz, euler, `${name}-batten`), p.roof));
    out.push(part(rotBox(bw, 0.045, bd, alongW ? rx : rx + 0.050, midY + 0.068, alongW ? rz + 0.050 : rz, euler, `${name}-batten-bead`), p.shadow));
  }
  return out;
}

/**
 * §2.3 — the plinth course. A darker masonry base wrapping the building where it meets the
 * ground, capped by a proud weathering course that throws a shadow onto it.
 *
 * It is not decoration: it is what stops the wall from meeting the ground on a bare line, and
 * it hides the intersection between the envelope and whatever the lot surface actually is. The
 * baseline had a `baseCourse` option on `wallShell` that changed the colour of the bottom band
 * and nothing else, so the wall still met the ground on a line — a painted skirting, not a
 * plinth.
 */
export function plinthCourse(ctx, {
  x = 0, z, w, d, y0 = 0, h = 0.62, proud = 0.075, name = 'plinth',
}) {
  const p = ctx.p;
  const out = [];
  const bw = w + proud * 2;
  const bd = d + proud * 2;
  out.push(part(slab(bw, h, bd, x, y0, z, `${name}-body`), p.wallAlt));
  // The weathering course: wider still, thin, with a dark bead under it so the wall above
  // reads as sitting BACK from the plinth rather than flush with it.
  // r3 §5.5.10 — the weathering cap is `joinery`, not `trim`. See the note above `stringCourse`.
  out.push(part(slab(bw + 0.075, 0.085, bd + 0.075, x, y0 + h - 0.085, z, `${name}-cap`), p.joinery));
  out.push(part(slab(bw + 0.030, 0.055, bd + 0.030, x, y0 + h - 0.140, z, `${name}-cap-bead`), p.shadow));
  // Damp course at the very bottom — a darker band where the masonry meets the ground, which
  // is where §2.5's grime lives on a real building.
  out.push(part(slab(bw + 0.035, 0.10, bd + 0.035, x, y0, z, `${name}-toe`), p.shadow));
  return out;
}

/**
 * **r3 — §5.5.10: THE DARK MOVES OFF THE GROUND AND ONTO THE BUILDING'S DRAWING.**
 *
 * Every lane's blind comparison this round decided on the same sentence: *the reference puts its
 * darks in the JOINERY and we put ours in the GROUND.* Measured across the programme, our bottom
 * three value bands hold 19.5–24.7 % of the subject against the reference's 39.4–44.6 %, and the
 * reference spends that mass on window frames, sashes, mullions, door leaves, fascia edges,
 * gutters and railings — dark drawing ON the object — while ours sits in asphalt, mulch and
 * shadowed lawn, so our buildings read pale against a dark base.
 *
 * **Where we already comply, stated so the change is not over-claimed.** `framedWindow`'s frames,
 * sashes, mullions and the door leaf are `joinery` already; `eaveEdge`'s fascia and gutter lip are
 * `joinery` and its gutter is `roof`; every balustrade post and rail is `joinery`. The reference's
 * list was largely done.
 *
 * **What was NOT.** The near-white `trim` bucket — which renders at about 164–171 on a plate
 * through §5.3's transfer, against `joinery`'s 75 — carried every horizontal BAND on the building:
 * the plinth's weathering cap, the string course wrapping at first-floor level, the batten screen's
 * sill and head rails, the pavilion's lid lips and the render pair's corner wraps. Those bands are
 * the lines a viewer reads a facade by, and they were the brightest thing on it.
 *
 * They move to `joinery`. **Zero triangles, zero new buckets, no albedo edited** — the same members
 * in a bucket that already exists, which is what §5.5.10 means by a redistribution rather than a
 * darkening, and it matters because a sibling lane measured that at albedo zero this rig still
 * renders ground surfaces at sRGB 72–110, above the reference's darkest elements. You cannot reach
 * the reference's darks on the ground; you can put a dark band around a building.
 *
 * **What deliberately does NOT move.** The reveal linings stay `trim`: a lining is what makes an
 * opening read as depth (§2.2), and it reads by being lighter than the frame in front of it. The
 * balcony soffit stays `trim` because r12 bought that move against §5.3's crush measurement and it
 * is not this round's to undo. The ground stays where it is — the point is not to brighten the lot.
 *
 * Consumers of every member below, enumerated per §5.5.7a: all six modern residential ids, through
 * `plinthCourse` (six), `stringCourse` (skillion, brick row, courtyard, bar) and `battenScreen`
 * (render pair only). No file outside `residential/modern/` imports this kit.
 */
export function stringCourse(ctx, { x = 0, z, w, d, y, thick = 0.11, proud = 0.07, name = 'string' }) {
  const p = ctx.p;
  return [
    part(slab(w + proud * 2, thick, proud, x, y, z + d / 2 + proud / 2, `${name}-f`), p.joinery),
    part(slab(w + proud * 2, thick, proud, x, y, z - d / 2 - proud / 2, `${name}-b`), p.joinery),
    part(slab(proud, thick, d, x + w / 2 + proud / 2, y, z, `${name}-r`), p.joinery),
    part(slab(proud, thick, d, x - w / 2 - proud / 2, y, z, `${name}-l`), p.joinery),
  ];
}

// Three overlapping rounded leaf masses in the original clump's XZ envelope.
// The lowest points reach the existing soil top; existing maximum height stays.
// One returned geometry and the caller's existing garden material remain owned.
function layeredPlanterClump(original, v, salt, soilTop) {
  original.computeBoundingBox();
  const box = original.boundingBox, extent = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const height = box.max.y - soilTop;
  if (!(extent.x > 0 && extent.z > 0 && height > 0)) throw Error('Invalid planted clump envelope');
  const positions = [], normals = [], uvs = [];
  const source = new THREE.IcosahedronGeometry(1, 0);
  const p = source.getAttribute('position');
  const specs = [[-.16, -.10, .30, .36, .82], [.15, -.04, .31, .34, 1], [.00, .18, .34, .28, .66]];
  for (let lobe = 0; lobe < specs.length; lobe++) {
    const [ox, oz, sx, sz, sy] = specs[lobe];
    const yaw = v.range(salt + 501 + lobe, -.6, .6);
    const rotation = new THREE.Matrix4().makeRotationY(yaw);
    const points = Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(rotation));
    const bounds = new THREE.Box3().setFromPoints(points), half = bounds.getSize(new THREE.Vector3()).multiplyScalar(.5);
    const mid = bounds.getCenter(new THREE.Vector3());
    const radius = new THREE.Vector3(extent.x * sx, height * sy * .5, extent.z * sz);
    const offset = new THREE.Vector3(centre.x + extent.x * ox, soilTop + radius.y, centre.z + extent.z * oz);
    for (let i = 0; i < points.length; i += 3) {

      for (let j = 0; j < 3; j++) {
        const q = points[i + j].clone().sub(mid).divide(half);
        positions.push(q.x * radius.x + offset.x, q.y * radius.y + offset.y, q.z * radius.z + offset.z);
        // Analytic ellipsoid normals are continuous at repeated triangle vertices.
        const n = q.clone().divide(radius).normalize(); normals.push(n.x, n.y, n.z);
        // Continuous oblique local projection: no longitude seam or pole.
        // The small Y contribution avoids collapsed UVs on vertical facets.
        uvs.push(.5 + .5*q.x + .173*q.y, .5 + .5*q.z + .117*q.y);
      }
    }
  }
  source.dispose();
  const result = new THREE.BufferGeometry();
  result.name = original.name;
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  result.userData.courtyardLayeredPlanting = { soilTop, originalBounds: { min: box.min.toArray(), max: box.max.toArray() }, lobes: 3 };
  original.dispose();
  return result;
}

export function planter(ctx, { x, y, z, w, d, h = 0.42, planted = true, name = 'planter', layeredPlanting = false }) {
  const p = ctx.p;
  const t = 0.10;
  const out = [
    part(slab(w, h, t, x, y, z + d / 2 - t / 2, `${name}-f`), p.wallAlt),
    part(slab(w, h, t, x, y, z - d / 2 + t / 2, `${name}-b`), p.wallAlt),
    part(slab(t, h, d - t * 2, x + w / 2 - t / 2, y, z, `${name}-r`), p.wallAlt),
    part(slab(t, h, d - t * 2, x - w / 2 + t / 2, y, z, `${name}-l`), p.wallAlt),
    part(slab(w - t * 2, 0.10, d - t * 2, x, y + h - 0.14, z, `${name}-soil`), p.shadow),
  ];
  if (planted) {
    // **The planting is sized to a PLANT, not to the planter.** The two lobes were a fraction
    // of `w`, and `flatParapet` calls this with `w = terrW * 0.72` — so on
    // `apartment-modern-bar`'s roof terrace the first lobe came out as a single green box more
    // than two metres across, lying over the whole terrace and through the parapet. That is the
    // r1 critic's major 13, "a single mis-scaled quad", and its coordinates are exactly there.
    //
    // A planter holds a row of shrubs. The count follows the length, each clump is capped at
    // 380 mm whatever the box is, and every clump is placed inside the planter's own inner
    // footprint — so a wider planter gets more planting rather than bigger planting, and no
    // clump can reach a parapet the planter is standing behind.
    const inner = Math.max(0.12, w - t * 2.2);
    const innerD = Math.max(0.12, d - t * 2.2);
    const clumps = Math.max(2, Math.min(7, Math.round(inner / 0.42)));
    const size = Math.min(0.38, Math.max(0.16, inner / (clumps * 1.05)));
    // **r12 — the clumps are `leafClump`s.** The r11 critic booked the roof gardens on three ids
    // separately from the lot planting — "the roof gardens on pavilion, courtyard and bar are rows
    // of flat boxes" and, at board zoom, "the roof planters are boxes in trays". Same primitive
    // fault, same twelve-triangle fix; see `leafClump`. The row spacing, the count and the 380 mm
    // cap are r10's and are unchanged, because they were not what was wrong.
    const v = ctx.v;
    for (let i = 0; i < clumps; i += 1) {
      const u = -inner / 2 + (i + 0.5) * (inner / clumps);
      const tilt = ((i * 37) % 11) / 11 - 0.5;
      const clump = leafClump(
        v, 3700 + i * 13 + Math.round(Math.abs(x) * 7),
        // 0.48, so the clump's rim (`size × 1.02` inside `leafClump`) spans about the same width
        // the old box did and the "no clump reaches the parapet" property r10 established survives
        // the primitive change unchanged.
        size * 0.48,
        x + u, y + h + size * 0.20, z + innerD * 0.10 * tilt,
        `${name}-clump-${i}`, 1.05,
      );
      // Explicit four-court-bed option; default callers retain their exact geometry.
      out.push(part(layeredPlanting
        ? layeredPlanterClump(clump, v, 3700 + i * 13 + Math.round(Math.abs(x) * 7), y + h - 0.04)
        : clump, p.garden));
    }
  }
  return out;
}

export function lantern(ctx, { x, y, z, facing = 1 }) {
  const p = ctx.p;
  return [
    part(box(0.08, 0.10, 0.08, x, y + 0.18, z + facing * 0.04, 'lantern-arm'), p.joinery),
    part(box(0.14, 0.18, 0.12, x, y, z + facing * 0.10, 'lantern-cage'), p.trim),
  ];
}

export function houseNumber(ctx, { x, y, z, facing = 1 }) {
  const p = ctx.p;
  return [
    part(box(0.22, 0.16, 0.04, x, y, z + facing * 0.04, 'num-plate'), p.trim),
    part(box(0.04, 0.10, 0.03, x - 0.04, y, z + facing * 0.06, 'num-glyph'), p.joinery),
  ];
}

export function slabBalcony(ctx, {
  x, y, z, w, proj = MODERN_METRICS.balconyProj, rail = true, name = 'balc', railPitch = 1.15,
}) {
  const p = ctx.p;
  const out = [];
  const slabH = MODERN_METRICS.balconySlab;
  // The slab is `wallAlt` — concrete — not `trim`. In `trim` it was the near-white plank the
  // r1 critic read inside an open dark crate at x600-700 / y250-290 and down the whole stack,
  // and a pale board floating inside a dark frame is precisely the "unsupported plank" read.
  // A soffit under it in `shadow` gives the slab a lit top and a dark underside, which is what
  // says "this is a slab cantilevered off the wall" rather than "this is a card".
  out.push(part(slab(w, slabH, proj, x, y - slabH, z + proj / 2, `${name}-slab`), p.wallAlt));
  // **r12 — the soffit moves from `shadow` to `trim`, and this is L4's paid-for move (§5.3), not
  // a new idea.** A balcony soffit is the deepest pocket on this lane's two apartments and the
  // r11 critic painted the bar's whole balcony stack as solid literal-zero: "the bar's entire
  // balcony stack is solid yellow soffit-and-back-wall". A diffuse term is `albedo × irradiance`
  // and the irradiance under a slab is what goes to zero, so the surface has to CARRY its value.
  // `trim`'s effective albedo is about five times `shadow`'s and it now has an emissive floor of
  // its own (`modern-surfaces.js` EMISSIVE_FLOOR.trim), which is what stops it reaching display
  // zero at any occlusion. It is also right on the merits: a Monopoly-Plus balcony underside is
  // a mid-grey painted soffit, not a black hole.
  out.push(part(slab(w - 0.10, 0.055, proj - 0.10, x, y - slabH - slabH / 2 + 0.03, z + proj / 2, `${name}-soffit`), p.trim));
  out.push(part(slab(w + 0.08, 0.06, 0.10, x, y - 0.04, z + proj + 0.02, `${name}-nose`), p.wallAlt));
  if (rail) out.push(...steelRail(ctx, { x, y, z: z + proj - 0.06, w, depth: proj - 0.14, pitch: railPitch }));
  return out;
}

export function steelRail(ctx, {
  x, y, z, w, depth = 0.08, h = MODERN_METRICS.railH,
  // r2 — the baluster pitch. A balcony stack is the most repeated assembly on both apartments and
  // the post pitch decides how many uprights each run carries: on the bar's 2.05 m balconies a
  // 0.46 m pitch gives five and a 1.15 m pitch gives two, which is a rhythm difference visible
  // down a whole elevation rather than a coordinate nobody can see.
  pitch = 1.15,
}) {
  const p = ctx.p;
  const out = [];
  // Posts at 1.15 m rather than 0.70. A balcony stack on the six-storey bar carries twenty of
  // these runs, and the post pitch was the third-largest line in its triangle budget while
  // reading, at board zoom, as a solid dark band either way. The top rail keeps its full
  // section so the balustrade still has a silhouette.
  const posts = Math.max(2, Math.round(w / Math.max(0.3, pitch)));
  for (let i = 0; i < posts; i += 1) {
    const u = x - w / 2 + (i / (posts - 1)) * w;
    out.push(part(box(0.08, h, 0.08, u, y + h / 2, z, 'rail-post'), p.joinery));
  }
  out.push(part(box(w + 0.08, 0.085, 0.085, x, y + h, z, 'rail-top'), p.joinery));
  out.push(part(box(w + 0.08, 0.055, 0.055, x, y + h * 0.48, z, 'rail-mid'), p.joinery));
  // Returns only on a balcony deep enough to stand on. A Juliet balustrade projects 740 mm and
  // its returns are two 80 mm posts seen end-on against the wall behind them — 24 triangles per
  // balcony that carry no silhouette at all.
  if (depth > 0.72) {
    out.push(part(box(0.08, h, depth, x - w / 2, y + h / 2, z - depth / 2, 'rail-ret-l'), p.joinery));
    out.push(part(box(0.08, h, depth, x + w / 2, y + h / 2, z - depth / 2, 'rail-ret-r'), p.joinery));
  }
  return out;
}

/**
 * `axis: 'x'` runs the screen across a street elevation; `axis: 'z'` runs it down a flank.
 *
 * r10 added the second case. r9's highest-value fix for `townhouse-modern-render` was "break the
 * blank flank — it is the largest single undifferentiated field in the lane at 27.5 % of subject",
 * and the id's own best material was already a cedar batten screen that only existed on the front.
 * Returning it round the corner is the cheapest way to give the flank a second material, and it is
 * what the building would actually do.
 */
export function battenScreen(ctx, {
  x, y, z, w, h, pitch = MODERN_METRICS.battenPitch, face = 1, axis = 'x',
}) {
  const p = ctx.p;
  const out = [];
  const n = Math.max(4, Math.round(w / pitch));
  const t = MODERN_METRICS.battenT;
  const alongX = axis === 'x';
  for (let i = 0; i < n; i += 1) {
    const u = (alongX ? x : z) - w / 2 + (i + 0.5) * (w / n);
    out.push(part(alongX
      ? box(t, h, 0.08, u, y + h / 2, z + face * 0.05, `batten-${i}`)
      : box(0.08, h, t, x + face * 0.05, y + h / 2, u, `batten-${i}`), p.timber));
  }
  for (const [dy, tag] of [[0.04, 'sill'], [h - 0.04, 'head']]) {
    out.push(part(alongX
      ? box(w + 0.06, 0.08, 0.09, x, y + dy, z + face * 0.04, `batten-${tag}`)
      // r3 §5.5.10 — the screen's sill and head rails are `joinery`. They are the two horizontal
      // lines a batten field is read by, and near-white they were the field's brightest members.
      : box(0.09, 0.08, w + 0.06, x + face * 0.04, y + dy, z, `batten-${tag}`), p.joinery));
  }
  return out;
}

export function blade(ctx, {
  x, zFront, zBack, y0, y1, thick = 0.32, material,
}) {
  const mat = material ?? ctx.p.wallAlt;
  const d = zFront - zBack;
  const zc = (zFront + zBack) / 2;
  return [part(box(thick, y1 - y0, d + 0.12, x, (y0 + y1) / 2, zc, 'blade'), mat)];
}

export function downpipes(ctx, { xL, xR, z, y0, y1 }) {
  const p = ctx.p;
  const out = [];
  for (const x of [xL, xR]) {
    out.push(part(cyl(0.055, y1 - y0, x, (y0 + y1) / 2, z, 'y', 'downpipe', 8), p.joinery));
    out.push(part(box(0.18, 0.07, 0.16, x, y0 + 0.04, z, 'dp-shoe'), p.joinery));
    out.push(part(box(0.14, 0.08, 0.18, x, y1 - 0.04, z + 0.04, 'dp-head'), p.joinery));
  }
  return out;
}

/**
 * Modelled bed joints on a brick face.
 *
 * **The pitch went from 0.22 to 0.52 and a row cap was added.** At 0.22 a six-storey brick
 * bookend carries 86 modelled courses per face, and the measured cost was 11.7 kt in the shadow
 * bucket on `apartment-modern-bar` alone — against a 9 kt whole-building budget. The joints were
 * buying almost nothing for it: the brick atlas region already carries course-scale relief in
 * its normal map, so the modelled joints are there to break the SILHOUETTE of the face at a
 * scale the normal map cannot, and for that a course every half metre reads exactly as well as
 * one every 220 mm. §2.5's "brick varies course to course" is a material job, not a geometry
 * job, and it is done by `configureResidentialWearShader` on the masonry bucket.
 */
export function brickCourses(ctx, {
  axis = 'x', face = 1, plane, centre = 0, run, y0, y1, openings = [], maxRows = 14, pitch: want = null,
  // **r2 — an opening's KEEP-OUT is bigger than its hole.** A punched opening carries a proud sill
  // below it and a drip above it, both of them wider than the hole and standing off the wall by
  // more than a bed joint's 35 mm relief. Courses were filtered against the hole alone, so the
  // course immediately above a head ran straight through the drip: `v371-g2-overlap.mjs` measured
  // it at 0.028 m — the joint's entire thickness — on the brick row, the bar and, once this round
  // put courses on it, the pavilion's rear cube. Inflating the filter is both the fix and the
  // truer construction: brickwork stops at the lintel zone, it does not run across it.
  // The numbers are the opening's own furniture, read off `modern-detail.js` rather than guessed:
  // the head drip sits `h/2 + jamb + 0.07` above centre with a 0.10 section and runs `w + 0.30`
  // wide, and the sill hangs below with a `w + 0.34` run. So the keep-out is 0.30 m above and
  // below the hole and 0.19 m each side of it, which is what those members actually occupy.
  inflate = { dy: 0.30, du: 0.19 },
}) {
  if (!ctx.mid || !(run > 0.5) || !(y1 - y0 > 0.4)) return [];
  const p = ctx.p;
  const wanted = want ?? (ctx.detail ? 0.66 : 0.86);
  const pitch = Math.max(wanted, (y1 - y0) / maxRows);
  const out = [];
  const rows = Math.floor((y1 - y0) / pitch);
  const dy = inflate?.dy ?? 0;
  const du = inflate?.du ?? 0;
  for (let r = 1; r < rows; r += 1) {
    const by = y0 + r * pitch;
    let u = centre - run / 2;
    // **r3 — spans are CLIPPED to the run, and a span wholly outside it is dropped.**
    // The walk below assumes every span lies inside the face it is filtering, and nothing enforced
    // it. Hand this helper a keep-out belonging to a neighbouring bay — which is exactly what the
    // bar's balcony stack is, since the outermost slab laps 0.155 m onto the bookend — and `u`
    // jumps PAST the end of the run, after which the next span emits a bed joint in mid-air
    // between two spans that are both off the wall. Measured before the clip: a 2.79 m joint
    // standing across the middle of `apartment-modern-bar`, on a face whose course run is 2.90 m
    // wide and three metres away. Consumers: `townhouse-brick.js`, `house-pavilion.js`,
    // `apartment-bar.js` — the behaviour is unchanged for every span that was already inside.
    const uMin = centre - run / 2;
    const uMax = centre + run / 2;
    const spans = openings
      .filter((o) => o.y - dy < by && o.y + o.height + dy > by)
      .map((o) => [o.u - o.width / 2 - du, o.u + o.width / 2 + du])
      .filter(([a, b]) => b > uMin && a < uMax)
      .map(([a, b]) => [Math.max(a, uMin), Math.min(b, uMax)])
      .sort((a, b) => a[0] - b[0]);
    for (const [a, b] of [...spans, [centre + run / 2, centre + run / 2]]) {
      if (a - u > 0.12) {
        out.push(part(faceBox(axis, face, plane, {
          u: (u + a) / 2, y: by, run: a - u, height: 0.028, depth: 0.045, set: -0.01,
        }, 'bed-joint'), p.shadow));
      }
      u = Math.max(u, b);
    }
  }
  return out;
}

/**
 * §2.6 — "Shrubs are clustered masses with leaf silhouette, not spheres."
 *
 * A `SphereGeometry` at 7 segments is a sphere with a faceted edge; read against the reference
 * plate's shrubs, which are lumpy clumps whose outline is made of leaf-sized bumps, it is the
 * tell. This builds the mass out of small rotated slabs instead: six of them, tilted off each
 * other, give an outline that breaks at leaf scale and reads as foliage from any angle.
 *
 * It is also cheaper. Six boxes is 72 triangles against the sphere pair's 78, which matters
 * because the two apartments were 2.7× over the triangle budget and planting was 2 kt of it.
 *
 * Deterministic: the jitter comes off `ctx.v`, which hashes `archetypeId | districtId | facade`
 * and nothing else. Callers pass a `salt` so two shrubs on the same lot are not clones.
 */
/**
 * §2.6 — the planting primitive. **r12 replaced the primitive, not its parameters.**
 *
 * r10 widened the lobe spread and the tilt of a cluster of `rotBox` prisms. The r11 critic's
 * verdict on that is the reason this function exists: "r10 widened the lobe spread and tilt
 * parameters, which is a real change to the distribution and no change at all to the primitive:
 * at 2× they read as green cardboard offcuts", and — the finding that set the priority — the
 * prisms read **worse at board zoom than at review zoom**, which is the distance the game is
 * actually played at.
 *
 * A box cannot be made to read as foliage. Six of its eight silhouette vertices are right
 * angles, its outline is four straight lines at any orientation, and three of its faces are
 * parallel pairs so the sun gives it three values and no gradient. A clump has to have an
 * irregular outline and a top that catches light at a different angle from its flanks.
 *
 * `leafClump` is a six-sided bipyramid with every rim vertex pushed out to its own radius and
 * lifted to its own height: **twelve triangles, the same as a box**, and its outline is a
 * six-notch polygon that changes shape as it turns rather than four straight lines. Stacking a
 * few of them at different sizes gives §2.6's "clustered masses with leaf silhouette"; the
 * triangle count is unchanged, so the two lots with 176 and 188 spare do not pay for it.
 *
 * Deterministic: every jitter comes off `ctx.v`, which hashes `archetypeId | districtId | facade`
 * and nothing else.
 */
export function leafClump(v, s, size, x, y, z, name = 'leaf', squash = 1.0) {
  const n = 6;
  const yaw = v.range(s, 0, Math.PI / 3);
  const rim = [];
  for (let i = 0; i < n; i += 1) {
    const a = yaw + (i / n) * Math.PI * 2;
    const rad = size * (0.58 + 0.44 * v.unit(s + 11 + i));
    rim.push([
      Math.cos(a) * rad,
      size * squash * v.range(s + 23 + i, -0.20, 0.20),
      Math.sin(a) * rad,
    ]);
  }
  const top = [
    size * v.range(s + 41, -0.14, 0.14),
    size * squash * (0.58 + 0.30 * v.unit(s + 43)),
    size * v.range(s + 45, -0.14, 0.14),
  ];
  const bot = [0, -size * squash * (0.40 + 0.22 * v.unit(s + 47)), 0];
  const pos = [];
  const push = (a, b, c) => { pos.push(...a, ...b, ...c); };
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    push(top, rim[j], rim[i]);
    push(bot, rim[i], rim[j]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.translate(x, y, z);
  g.name = name;
  return g;
}

/** Courtyard-only paired leaf sprays. No opaque canopy substrate.
 * Ten two-segment stems carry at most fourteen bent, closed blades each.
 * Whole leaves that exceed the old planted hull or furniture keepouts are omitted.
 */
function courtyardLeafSprays(original, v, salt, ground, existingParts, x, z) {
  try {
  const bounds = new THREE.Box3(), points = [];
  for (const item of original) {
    const a = item.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(a, i);
      bounds.expandByPoint(p); points.push([p.x, p.z]);
    }
  }
  const cross = (o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const sorted=[...new Map(points.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const half=seq=>{const h=[];for(const p of seq){while(h.length>1&&cross(h.at(-2),h.at(-1),p)<=0)h.pop();h.push(p);}return h.slice(0,-1);};
  const hull=[...half(sorted),...half([...sorted].reverse())], height=bounds.max.y-ground;
  const obstacles=existingParts.filter(p=>/^(bench-|fount-)/.test(p.geometry.name)).map(p=>{
    p.geometry.computeBoundingBox();return{name:p.geometry.name,box:p.geometry.boundingBox.clone().expandByScalar(.012)};
  }).filter(p=>p.box.intersectsBox(bounds));
  const inside=p=>p.y>=ground-1e-9&&p.y<=bounds.max.y&&hull.every((a,i)=>cross(a,hull[(i+1)%hull.length],[p.x,p.z])>=1e-7);
  const safe=vertices=>vertices.every(inside)&&!obstacles.some(o=>o.box.intersectsBox(new THREE.Box3().setFromPoints(vertices)));
  const root=new THREE.Vector3(x,ground+.006,z), stationSalt=salt+Math.round(x*113+z*271);
  if(!inside(root)||obstacles.some(o=>o.box.containsPoint(root)))throw new Error('Courtyard leaf root outside authored support');
  const positions=[],uv=[],components=[],sprays=[];
  // Independent triangle vertices preserve the narrow folded leaf's upper/lower normals.
  const triangle=(a,b,c,ua,ub,uc)=>{positions.push(...a.toArray(),...b.toArray(),...c.toArray());uv.push(...ua,...ub,...uc);};
  function prism(a,b,radius) {
    const axis=b.clone().sub(a).normalize(),side=new THREE.Vector3(0,1,0).cross(axis).normalize();
    if(side.lengthSq()<.5)side.set(1,0,0);
    const across=axis.clone().cross(side).normalize(),verts=[];
    for(const end of[a,b])for(let i=0;i<3;i++){const t=i*Math.PI*2/3;verts.push(end.clone().addScaledVector(side,Math.cos(t)*radius).addScaledVector(across,Math.sin(t)*radius));}
    // Flat root cap seats at the actual court datum; it is not a rounded body.
    if(a===root)for(let i=0;i<3;i++)verts[i].y=ground;
    if(!safe(verts))return false;
    const faces=[[0,2,1],[3,4,5],[0,1,4],[0,4,3],[1,2,5],[1,5,4],[2,0,3],[2,3,5]];
    const centre=a.clone().add(b).multiplyScalar(.5);
    for(let[a,b,c]of faces){const pa=verts[a],pb=verts[b],pc=verts[c];if(pb.clone().sub(pa).cross(pc.clone().sub(pa)).dot(pa.clone().add(pb).add(pc).multiplyScalar(1/3).sub(centre))<0)[b,c]=[c,b];triangle(verts[a],verts[b],verts[c],[0,0],[1,0],[.5,1]);}
    components.push({kind:'stem',triangles:8});return true;
  }
  function leaf(base,axis,side,length,width,curl) {
    // Six ellipse-rim vertices, with a lifted distal tip and two separated midrib centres.
    const normal=axis.clone().cross(side).normalize(),verts=[],tex=[];
    for(let i=0;i<6;i++){
      const angle=i*Math.PI/3,u=(1+Math.cos(angle))*.5,w=Math.sin(angle)*.5;
      verts.push(base.clone().addScaledVector(axis,u*length).addScaledVector(side,w*width).addScaledVector(normal,curl*u*u));tex.push([u,w+.5]);
    }
    const centre=base.clone().addScaledVector(axis,length*.5).addScaledVector(normal,curl*.25);
    verts.push(centre.clone().addScaledVector(normal,.005),centre.clone().addScaledVector(normal,-.003));tex.push([.5,.5],[.5,.5]);
    if(!safe(verts))return false;
    for(let i=0;i<6;i++){let a=i,b=(i+1)%6;const pa=verts[a],pb=verts[b];if(pb.clone().sub(pa).cross(verts[6].clone().sub(pa)).dot(normal)<0)[a,b]=[b,a];triangle(verts[a],verts[b],verts[6],tex[a],tex[b],tex[6]);triangle(verts[b],verts[a],verts[7],tex[b],tex[a],tex[7]);}
    components.push({kind:'leaf',triangles:12,length,width});return true;
  }
  const phase=v.range(stationSalt+501,0,Math.PI*2);
  let leaves=0,rejectedLeaves=0;
  for(let spray=0;spray<10;spray++) {
    const angle=phase+spray*2.3999632297+v.range(stationSalt+510+spray,-.16,.16);
    const radial=Math.min(bounds.max.x-bounds.min.x,bounds.max.z-bounds.min.z)*(.20+.055*(spray%3));
    const tip=new THREE.Vector3(x+Math.cos(angle)*radial,ground+height*(.49+.048*spray),z+Math.sin(angle)*radial);
    const bend=root.clone().lerp(tip,.48);bend.y+=height*.09;
    const checkpoint=positions.length,uvCheckpoint=uv.length,componentCheckpoint=components.length;
    if(!prism(root,bend,.0045)||!prism(bend,tip,.0035)){positions.length=checkpoint;uv.length=uvCheckpoint;components.length=componentCheckpoint;sprays.push({spray,admitted:false,leaves:0});continue;}
    let count=0;
    for(let node=0;node<7;node++)for(let pair=0;pair<2;pair++) {
      const t=.24+node*.115,base=t<.48?root.clone().lerp(bend,t/.48):bend.clone().lerp(tip,(t-.48)/.52);
      const growth=tip.clone().sub(root).normalize(),tangent=new THREE.Vector3(-Math.sin(angle),0,Math.cos(angle));
      const sign=pair?1:-1,axis=growth.clone().multiplyScalar(.38).addScaledVector(tangent,sign*.85).add(new THREE.Vector3(Math.cos(angle)*.35,.08,Math.sin(angle)*.35)).normalize();
      const normal=new THREE.Vector3(Math.cos(angle)*.25,1,Math.sin(angle)*.25).normalize();
      const side=normal.clone().cross(axis).normalize();
      const length=Math.min(.225,height*.20)*(.82+.26*v.unit(stationSalt+600+spray*17+node*2+pair));
      if(leaf(base,axis,side,length,length*.56,length*.11)){leaves++;count++;}else rejectedLeaves++;
    }
    sprays.push({spray,admitted:true,leaves:count});
  }
  if(leaves<60)throw new Error('Courtyard leaf spray coverage below authored minimum');
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();g.name='shrub-leaf-sprays';
  g.userData.courtyardLeafSprays={station:[x,ground,z],ground,hull,sourceBounds:[bounds.min.toArray(),bounds.max.toArray()],leaves,rejectedLeaves,sprays,components,obstacles:obstacles.map(o=>({name:o.name,box:[o.box.min.toArray(),o.box.max.toArray()]}))};
  const material=original[0].material;return[part(g,material)];
  } finally { for(const item of original)item.geometry.dispose(); }
}

export function shrubMass(ctx, {
  x, z, r = 0.55, h = 0.72, y = 0.02, salt = 0, lobes = 5, leafSprays = false,
}) {
  const p = ctx.p;
  const v = ctx.v;
  const s = 3500 + ((salt * 7) % 60);
  const out = [];
  // The skirt is a wide flat clump now, not a box. It is the member that meets the lawn, so it
  // is the one whose outline the eye follows at board zoom — and a 1.55r × 1.45r rectangle laid
  // on the grass was the straight edge under every shrub on every plate.
  out.push(part(leafClump(
    v, s + 300, r * 0.86, x, y + h * 0.13, z, 'shrub-skirt', 0.42,
  ), p.garden));
  // **r10 — the outline breaks harder, and on the ids with lot headroom it breaks in more
  // places.** r9's read was "shrubs are rotated cubes with hard facets ... §2.6 asks for leaf
  // silhouette, and a cluster of cubes is not spheres but it is not leaves either." Two changes,
  // and only one of them costs triangles:
  //
  //   * the size spread across the lobes goes from 0.52-0.78 of `r` to 0.38-0.86, and the tilt
  //     from ±0.5 rad to ±0.85, so no two lobes present the same face and the outline is made of
  //     differently-sized bumps rather than one repeated one. **Free.**
  //   * `lobes` is a parameter. The two detached houses and the render pair have 116-248
  //     triangles of lot allowance left and keep five; the brick row, the courtyard and the bar
  //     have 1,436-1,736 and take seven. Spending the allowance where it exists is the point of
  //     reporting the two budgets separately.
  // `lobes` keeps its name and its call sites; what it now buys is a mass count plus a sprig
  // count, at the same twelve triangles a form. 5 → three masses and two sprigs; 7 → four and
  // three. The masses OVERLAP rather than sitting on a ring, which is the difference between
  // "clustered mass" and the r11 critic's "green confetti".
  const masses = Math.max(2, Math.ceil(lobes / 2));
  const sprigs = Math.max(1, lobes - masses);
  for (let i = 0; i < masses; i += 1) {
    const a = (i / masses) * Math.PI * 2 + v.range(s + i, -0.6, 0.6);
    // The two ranges are set by the containment budget, not by taste: `leafClump`'s rim reaches
    // `size × 1.02`, so `rad_max + size_max × 1.02 = 0.38 + 0.775 = 1.155 r` — inside the
    // 1.20 r reach `modern-garden.js` declares to its station keeper, with margin.
    const rad = r * (0.14 + 0.24 * v.unit(s + 20 + i));
    const lift = h * (0.30 + 0.34 * v.unit(s + 40 + i));
    const size = r * (0.46 + 0.30 * v.unit(s + 10 + i));
    out.push(part(leafClump(
      v, s + 100 + i * 7, size,
      x + Math.cos(a) * rad, y + lift, z + Math.sin(a) * rad,
      `shrub-lobe-${i}`, 0.92,
    ), p.garden));
  }
  // The sprigs are the outline breakers: small clumps pushed to the edge of the mass and lifted
  // above it, so the silhouette has tips standing out of it instead of a closed convex outline.
  // §2.6's "leaf silhouette" is a property of the OUTLINE, and this is the member that owns it.
  for (let i = 0; i < sprigs; i += 1) {
    const a = ((i + 0.5) / sprigs) * Math.PI * 2 + v.range(s + 70 + i, -0.9, 0.9);
    const rad = r * (0.58 + 0.22 * v.unit(s + 80 + i));
    const lift = h * (0.52 + 0.42 * v.unit(s + 90 + i));
    out.push(part(leafClump(
      v, s + 200 + i * 5, r * (0.20 + 0.14 * v.unit(s + 96 + i)),
      x + Math.cos(a) * rad, y + lift, z + Math.sin(a) * rad,
      `shrub-sprig-${i}`, 1.25,
    ), p.garden));
  }
  return leafSprays ? courtyardLeafSprays(out, v, s, y, ctx.parts, x, z) : out;
}

/**
 * §2.6 — "Trees have a leaf-cluster canopy, not a lollipop."
 *
 * Same argument as the shrub, one storey up: a trunk with three spheres balanced on it is the
 * lollipop the spec names. The crown is now seven tilted clusters at varying radius and height,
 * so the silhouette has notches in it and the sun catches the upper clusters while the lower
 * ones fall into shade — which is what makes a canopy read as depth rather than as a ball.
 */
export function canopyTree(ctx, {
  x, z, h = 2.4, canopy = 0.72, salt = 0, y = 0.02,
}) {
  const p = ctx.p;
  const v = ctx.v;
  const s = 3560 + ((salt * 11) % 36);
  // The trunk used to start at a hard-coded y = 0.02 while the lawn sits on the tray at 0.125,
  // so every trunk began 100 mm under the grass and the crown floated relative to it. `y` is
  // the lawn datum now, and both the trunk and the crown are measured from it — which is also
  // the reason the courtyard's crown could sit at third-storey height with nothing under it.
  // The trunk is `wallAlt`, not `timber`. `timber` on this lane is the door leaf — a saturated
  // red-brown chosen so a front door reads from across the tile — and the r1 plate put that
  // same colour on every tree trunk, which made two orange sticks the loudest thing on the lot.
  // A trunk is grey-brown bark; `wallAlt` is the grey-brown masonry bucket and is exactly right
  // for it, and it costs no extra bucket.
  const out = [
    part(taper(0.145, 0.095, h * 0.58, x, y, z, 'trunk', 6), p.timber),
    part(box(0.26, 0.16, 0.26, x, y + 0.02, z, 'trunk-flare'), p.timber),
  ];
  // r10 — same seven clusters, wider spread. A canopy whose clusters are all 0.62-0.92 of the
  // crown radius reads as a ball with notches; 0.44-0.98, with the vertical spread doubled and
  // the tilt widened, gives an outline where the sun catches the upper clusters and the lower
  // ones fall away. This costs no triangles, which matters because two of the six lots have 116
  // of their allowance left.
  //
  // **r12 — the clusters are `leafClump`s, not boxes, at the same twelve triangles each.** r10
  // widened the spread of seven rotated boxes and the r11 critic still read the canopy as
  // cardboard at 1× and worse at board zoom. The primitive was the fault; see `leafClump`.
  //
  // The reach the station keeper in `modern-garden.js` depends on: `rad_max = 0.80 canopy`,
  // `size_max = 0.52 canopy`, and `leafClump`'s rim reaches `size × 1.02` — so the crown never
  // gets past `1.33 canopy` and the keeper's declared 1.40 still holds.
  const clusters = 7;
  for (let i = 0; i < clusters; i += 1) {
    const a = (i / clusters) * Math.PI * 2 + v.range(s + i, -0.5, 0.5);
    const rad = canopy * (i === 0 ? 0.10 : 0.36 + 0.44 * v.unit(s + 12 + i));
    const lift = y + h * (0.52 + 0.42 * v.unit(s + 24 + i));
    const size = canopy * (0.34 + 0.18 * v.unit(s + 6 + i));
    out.push(part(leafClump(
      v, s + 120 + i * 9, size,
      x + Math.cos(a) * rad, lift, z + Math.sin(a) * rad,
      `canopy-${i}`, 1.0,
    ), p.garden));
  }
  return out.map(p => /canopy|clump/.test(p.geometry.name) ? clusterCanopyPart(p) : p);
}

/**
 * §2.6 — "Lawn has scattered tufts standing proud of it."
 *
 * The thing that stops a lawn reading as a green rectangle is not its colour, it is that the
 * outline of the green area is broken by blades standing above it. Six thin uprights per
 * station, three stations per call, and the whole lot gets a handful of them.
 */
export function lawnTufts(ctx, { x, z, spread = 0.55, y = 0.02, salt = 0, blades = 6 }) {
  const p = ctx.p;
  const v = ctx.v;
  const s = 3600 + ((salt * 13) % 90);
  const out = [];
  for (let i = 0; i < blades; i += 1) {
    const a = (i / blades) * Math.PI * 2 + v.range(s + i, -0.6, 0.6);
    const rad = spread * (0.2 + 0.8 * v.unit(s + 12 + i));
    const hh = 0.16 + 0.16 * v.unit(s + 24 + i);
    out.push(part(rotBox(
      0.055, hh, 0.055,
      x + Math.cos(a) * rad, y + hh / 2, z + Math.sin(a) * rad,
      { x: v.range(s + 36 + i, -0.30, 0.30), z: v.range(s + 48 + i, -0.30, 0.30) },
      `tuft-${i}`,
    ), p.garden));
  }
  return out;
}

export function openingRecord({ face, u, y, w, h, plane, axis = 'x', faceSign = 1 }) {
  const outward = axis === 'x'
    ? [0, 0, faceSign]
    : [faceSign, 0, 0];
  const uAxis = axis === 'x' ? [1, 0, 0] : [0, 0, 1];
  const centre = axis === 'x'
    ? [u, y + h / 2, plane]
    : [plane, y + h / 2, u];
  return Object.freeze({
    face, centre, outward, uAxis, w, h,
    sillY: y, headY: y + h, reveal: MODERN_METRICS.reveal,
    src: { face, x: u, y, w, h },
  });
}

// Back-compat aliases so older builders that imported house-kit roofs still compile
// while they are rewritten. These are charcoal seated roofs, not corrugated.
export function gableRoof(ctx, opts = {}) {
  return standingSeamGable(ctx, {
    w: opts.w, d: opts.d, x: opts.x, z: opts.z,
    springY: opts.springY, pitch: opts.pitch ?? 22, overhang: opts.overhang ?? 0.30,
  });
}

export function skillionRoof(ctx, opts = {}) {
  const spring = opts.springY ?? opts.yLow ?? 3;
  const rise = Math.tan(((opts.pitch ?? 12) * Math.PI) / 180) * (opts.d ?? 4);
  return seatedSkillion(ctx, {
    w: opts.w, d: opts.d, x: opts.x, z: opts.z,
    yLow: spring, yHigh: spring + rise,
    fall: opts.fall ?? 'front', overhang: opts.overhang ?? 0.24,
  });
}

export function eaves() {
  return [];
}
