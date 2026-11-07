// District Deck V3.70 — LANDMARKS lane · THE UNIVERSITY OF MELBOURNE, OLD ARTS BUILDING.
//
// Subject: the Collegiate Gothic range on the University of Melbourne's Parkville campus, in
// KYNETON freestone (not Tasmanian — that is the Melbourne Town Hall's stone; the Victorian
// Heritage Database has Old Arts in Kyneton freestone, and the first draft of this file had the
// two swapped), with the square crenellated clock tower over its entrance.
//
// WHAT A PLAYER SORTS IT BY, in the order the silhouette gives it up:
//   1. The SQUARE CRENELLATED CLOCK TOWER. Square, not octagonal; crenellated, not spired; and
//      standing over the entrance in the middle of the range rather than at one end. It is the
//      one element that has to survive board zoom, and it is sized against that station rather
//      than against the elevation — see `mvp/tests/lm-boardzoom.mjs`.
//   2. The STEEP SLATE ROOF over a long two-storey range, which is what makes it a range and not
//      a block.
//   3. The CLOISTERED GROUND ARCADE — a run of pointed arches with a shadowed walk behind, which
//      is the shadow band along the base of every photograph of this building.
//   4. POINTED WINDOWS WITH TRACERY above it, on a bay rhythm set by stepped buttresses.
//   5. COURSED ASHLAR over a rusticated base.
//
// THE TOWER IS OFF-CENTRE ON PURPOSE. The range runs further to one side of it than the other,
// which is what the real building does and what stops the model reading as a symmetrical palace
// with a turret stuck on the axis. Everything else on the front is symmetrical about the tower's
// own centre line, not about the range's.

import {
  LM_METRICS, part, box, slab, rotBox, taper, extrude, pointedArchProfile, inflateProfile,
  hole, archedHole, volume, plinthCourse, stringCourse, crenellation, seamGable, downpipe,
  boardPlate, lawn, paverRun, stoneWallRun, palisadeRun, shrubMass, hedgeRun, canopyTree,
  bench, lampPost, inst,
} from './kit.js';
import {
  lancetHoles, lancetWindow, sashHoles, doorLeaves, casementLeaf, clockFace, faceFrame,
} from './openings.js';

/**
 * Authored against a 2 x 2 parcel (31 x 31 m after the setback lattice). `index.js` scales every
 * key ending W / X / Gap by the width ratio and every key ending Z / D by the depth ratio, so the
 * building keeps its proportions on a parcel that is not that shape rather than spilling off it.
 */
export const OLD_ARTS_ENVELOPE = Object.freeze({
  footprint: [2, 2],
  storeys: 2,
  rangeW: 26.0,
  rangeD: 12.0,
  frontZ: 5.0,
  backZ: -7.0,
  groundH: 4.9,
  upperH: 4.5,
  bayGap: 3.30,
  towerW: 6.6,
  towerD: 7.4,
  towerX: -2.4,
  towerProudZ: 1.5,
  // 19.4 -> 21.2, and it is a fix rather than a taste. [MEASURED by looking]
  // `plates/r1/university-old-arts--detail.png`: the LEFT clock face is cut by the roof plane,
  // because the r1 ridge stood at 16.1 and the clock stage sat at 15.1. The clock is the one
  // element this subject is sorted by and it cannot be behind its own roof.
  towerH: 21.2,
  arcadeD: 2.5,
  // and the pitch comes down with it, 0.76 -> 0.68 (39 deg), which keeps the range steep and
  // drops the ridge 1.3 m clear of the clock stage.
  roofPitch: 0.68,
});

export default function buildOldArts(ctx) {
  const e = ctx.env;
  const g = e.groundY;
  const wallTop = g + e.groundH + e.upperH;

  lot(ctx, wallTop);
  const bays = bayPlan(ctx);
  range(ctx, bays, wallTop);
  arcade(ctx, bays, wallTop);
  tower(ctx, wallTop);
}

/* ─────────────────────────────────── the bay plan ─────────────────────────────────── */

/**
 * One bay grid drives the arcade below, the windows above, the buttresses between and the roof
 * dormers over. A Gothic range's whole discipline is that those four things agree, and computing
 * them from one list is the only way they can.
 */
function bayPlan(ctx) {
  const e = ctx.env;
  const half = e.rangeW / 2;
  const towerL = e.towerX - e.towerW / 2;
  const towerR = e.towerX + e.towerW / 2;
  const bays = [];
  for (let x = -half + e.bayGap * 0.62; x < half; x += e.bayGap) {
    if (x > towerL - 0.9 && x < towerR + 0.9) continue;
    if (x > half - e.bayGap * 0.45) break;
    bays.push(Number(x.toFixed(4)));
  }
  return bays;
}

/* ────────────────────────────────────── the lot ───────────────────────────────────── */

function lot(ctx, wallTop) {
  const e = ctx.env;
  const p = ctx.p;
  const g = e.groundY;
  const halfW = e.lotW / 2;
  const halfD = e.lotD / 2;

  ctx.add(boardPlate(ctx, { width: e.lotW, depth: e.lotD }));

  // The forecourt: a lawn quadrangle with the paved walk cut through it to the tower door. The
  // walk is the only sealed route across the front, because that is what the building has.
  const courtZ0 = e.frontZ + 0.4;
  const courtZ1 = halfD - 1.8;
  const walkHalf = 2.1;
  // Two lawn panels flanking the walk, each sized from the lot's own half-extents rather than
  // from a constant — the first draft carried an arithmetic slip here that put the left panel's
  // edge 1.8 m OFF THE PAD, which `lm-probe.mjs` caught as an envelope overhang. Derive both
  // panels from the same walk edges the paving uses and the two cannot disagree.
  const walkL = e.towerX - walkHalf;
  const walkR = e.towerX + walkHalf;
  const padL = -halfW + 1.2;
  const padR = halfW - 1.2;
  ctx.add(lawn(ctx, {
    x: (padL + walkL - 0.5) / 2, z: (courtZ0 + courtZ1) / 2,
    w: Math.max(2, (walkL - 0.5) - padL), d: Math.max(2, courtZ1 - courtZ0), tufts: 7, salt: 20,
  }));
  ctx.add(lawn(ctx, {
    x: (walkR + 0.5 + padR) / 2, z: (courtZ0 + courtZ1) / 2,
    w: Math.max(2, padR - (walkR + 0.5)), d: Math.max(2, courtZ1 - courtZ0), tufts: 8, salt: 60,
  }));
  ctx.add(paverRun(ctx, {
    x0: e.towerX - walkHalf, x1: e.towerX + walkHalf, z0: courtZ0 - 0.6, z1: halfD - 0.6,
    unit: 1.50, joint: 0.09, name: 'walk',
  }));
  // The service apron behind, so the rear elevation is not standing in a lawn.
  // A service yard is laid in bigger slabs than a ceremonial walk, which is both true and the
  // cheapest 570 triangles in the lane: at unit 1.6 this one field was 816 of the lot's 3,776.
  ctx.add(paverRun(ctx, {
    x0: -halfW + 1.2, x1: halfW - 1.2, z0: -halfD + 1.0, z1: e.backZ - 0.6,
    unit: 2.75, joint: 0.10, flat: true, name: 'yard',
  }));

  // Boundary: a dressed-stone wall with piers, and an iron palisade across the entrance gap.
  const bw = halfW - 0.5;
  const bd = halfD - 0.5;
  const pierPitch = 7.6;
  ctx.add(stoneWallRun(ctx, { x0: -bw, x1: -walkHalf - 2.4 + e.towerX, z0: bd, z1: bd, pierPitch }));
  ctx.add(stoneWallRun(ctx, { x0: walkHalf + 2.4 + e.towerX, x1: bw, z0: bd, z1: bd, pierPitch }));
  ctx.add(stoneWallRun(ctx, { x0: -bw, x1: -bw, z0: bd, z1: -bd, pierPitch }));
  ctx.add(stoneWallRun(ctx, { x0: bw, x1: bw, z0: bd, z1: -bd, pierPitch }));
  ctx.add(stoneWallRun(ctx, { x0: -bw, x1: bw, z0: -bd, z1: -bd, pierPitch }));
  ctx.add(palisadeRun(ctx, {
    x0: e.towerX - walkHalf - 2.4, x1: e.towerX + walkHalf + 2.4, z: bd, h: 1.65, pitch: 0.54,
  }));

  // ── EVERY FURNITURE COORDINATE IS DERIVED FROM THE MEASURED LOT, NOT AUTHORED FLAT. ──
  //
  // `index.js` scales the BUILDING onto whatever parcel it is given, and r1 left the lot's own
  // coordinates as literals authored against a 2 x 2. [MEASURED] on a 1 x 2 parcel the Town Hall's
  // furniture put geometry at x −14.18 against a 7.78 limit — an envelope breach under §3.6 and a
  // major under §1.2, invisible to a probe that only ever tests the authored footprint. `lm-probe`
  // now sweeps three parcel shapes and both lots derive from `halfW` / `halfD`.
  const fx = (t) => (t / 15.5) * halfW;
  const fz = (t) => (t / 15.5) * halfD;
  ctx.add(canopyTree(ctx, { x: fx(-10.4), z: bd - fz(3.6), h: 7.6, r: Math.min(2.9, halfW * 0.19), salt: 61 }));
  ctx.add(canopyTree(ctx, { x: fx(10.9), z: bd - fz(4.4), h: 6.8, r: Math.min(2.5, halfW * 0.16), salt: 71 }));
  ctx.add(canopyTree(ctx, { x: fx(11.9), z: fz(-6.0), h: 6.0, r: Math.min(2.0, halfW * 0.13), salt: 81 }));
  ctx.add(hedgeRun(ctx, {
    x0: e.towerX + walkHalf + 0.5, x1: fx(12.4), z0: courtZ0 + 0.8, z1: courtZ0 + 0.8, h: 0.95,
  }));
  ctx.add(hedgeRun(ctx, {
    x0: fx(-12.4), x1: e.towerX - walkHalf - 0.5, z0: courtZ0 + 0.8, z1: courtZ0 + 0.8, h: 0.95,
  }));
  for (const [sx, sz, r] of [[-8.2, 8.4, 0.9], [5.0, 8.0, 0.8], [11.2, 9.6, 1.0]]) {
    ctx.add(shrubMass(ctx, { x: fx(sx), z: fz(sz), r, lobes: 3, salt: 40 }));
  }
  ctx.add(bench(ctx, { x: fx(-6.0), z: bd - fz(2.6), w: 2.0 }));
  ctx.add(bench(ctx, { x: fx(6.4), z: bd - fz(2.6), w: 2.0 }));
  ctx.add(lampPost(ctx, { x: e.towerX - walkHalf - 1.5, z: bd - fz(1.6), h: 4.4 }));
  ctx.add(lampPost(ctx, { x: e.towerX + walkHalf + 1.5, z: bd - fz(1.6), h: 4.4 }));
  void wallTop; void p;
}

/* ───────────────────────────────────── the range ──────────────────────────────────── */

function range(ctx, bays, wallTop) {
  const e = ctx.env;
  const p = ctx.p;
  const g = e.groundY;
  const M = LM_METRICS;
  const zc = (e.frontZ + e.backZ) / 2;
  const groundTop = g + e.groundH;

  // ── the punched schedule ─────────────────────────────────────────────────────────────
  const front = [];
  const back = [];
  const left = [];
  const right = [];

  // Ground: the cloister arcade. Each arch is one aperture with a stepped pointed head.
  const archW = e.bayGap * 0.82;
  const archH = e.groundH - 0.85;
  for (const x of bays) {
    front.push(...archedHole(x, g + 0.30, archW, archH, {
      headFrac: 0.38, steps: 3, tag: `arcade@${x}`, pointed: true,
    }));
    ctx.countAperture(`arcade@${x}`);
  }
  // First floor: pointed two-light windows on the same bay centres.
  const winW = e.bayGap * 0.60;
  const winH = e.upperH - 1.45;
  const winY = groundTop + 0.85;
  for (const x of bays) {
    front.push(...lancetHoles(x, winY, winW, winH, `lancet@${x}`));
    ctx.countAperture(`lancet@${x}`);
  }

  // Flanks and rear: square-headed openings under a pointed label mould. A Collegiate Gothic
  // range does not carry its best tracery on a service elevation, and the spec allows a lane to
  // simplify a rear elevation on its own judgement rather than as a fidelity dodge.
  const flankZs = [zc - 3.6, zc, zc + 3.6];
  for (const z of flankZs) {
    for (const [y, h] of [[g + 0.85, e.groundH - 2.1], [winY, winH]]) {
      left.push(...sashHoles(z, y, 1.35, h, `l@${z}@${y}`));
      right.push(...sashHoles(z, y, 1.35, h, `r@${z}@${y}`));
      ctx.countAperture(`flankL@${z}@${y}`);
      ctx.countAperture(`flankR@${z}@${y}`);
    }
  }
  const rearXs = [];
  for (let x = -e.rangeW / 2 + 2.6; x <= e.rangeW / 2 - 2.6; x += 3.55) rearXs.push(Number(x.toFixed(3)));
  for (const x of rearXs) {
    for (const [y, h] of [[g + 0.85, e.groundH - 2.1], [winY, winH]]) {
      back.push(...sashHoles(x, y, 1.30, h, `b@${x}@${y}`));
      ctx.countAperture(`rear@${x}@${y}`);
    }
  }

  // ── the mass ─────────────────────────────────────────────────────────────────────────
  ctx.add(plinthCourse(ctx, {
    x: 0, z: zc, w: e.rangeW, d: e.rangeD, yBase: g - 0.02, h: 1.05, proud: 0.18,
  }));
  ctx.add(volume(ctx, {
    x: 0, zFront: e.frontZ, zBack: e.backZ, width: e.rangeW, y0: g, y1: wallTop,
    front, back, left, right, name: 'rng',
  }));

  // String course at first-floor level, which is the line the whole elevation hangs from.
  ctx.add(stringCourse(ctx, {
    x: 0, z: zc, w: e.rangeW, d: e.rangeD, y: groundTop - 0.10, thick: 0.22, proud: 0.14,
  }));
  // Eaves corbel table under the roof.
  ctx.add(stringCourse(ctx, {
    x: 0, z: zc, w: e.rangeW, d: e.rangeD, y: wallTop - 0.55, thick: 0.26, proud: 0.20,
  }));

  // ── window dressing ──────────────────────────────────────────────────────────────────
  for (const x of bays) {
    ctx.add(lancetWindow(ctx, {
      facing: 'front', plane: e.frontZ, u: x, y: winY, w: winW, h: winH,
      tracery: true, segs: 3, name: `win${bays.indexOf(x)}`,
    }));
  }
  // One street casement opens (§3.5), on the bay beside the entrance.
  const openBay = bays.find((x) => x > e.towerX) ?? bays[0];
  ctx.add(casementLeaf(ctx, {
    id: 'old-arts-casement', label: 'Reading room window', facing: 'front', plane: e.frontZ,
    u: openBay, y: winY + 0.10, w: winW - 0.10, h: winH * 0.52, name: 'oa-case',
  }));

  // Flank and rear dressings: sill, and a pointed label mould so the elevation stays Gothic.
  for (const z of flankZs) {
    for (const [y, h] of [[g + 0.85, e.groundH - 2.1], [winY, winH]]) {
      for (const facing of ['left', 'right']) {
        const plane = facing === 'left' ? -e.rangeW / 2 : e.rangeW / 2;
        const f = faceFrame(facing, plane);
        const [px, py, pz] = f.pos(z, y + h / 2, -(M.reveal + 0.05));
        ctx.push(box(...f.dims(1.15, h - 0.16, 0.06), px, py, pz, 'flank-pane'), p.glass);
        const [sx, sy, sz] = f.pos(z, y - 0.11, 0.10);
        ctx.push(box(...f.dims(1.75, 0.17, 0.36), sx, sy, sz, 'flank-sill'), p.trim);
        const [hx, hy, hz] = f.pos(z, y + h + 0.13, 0.10);
        ctx.push(box(...f.dims(1.85, 0.22, 0.34), hx, hy, hz, 'flank-label'), p.trim);
      }
    }
  }
  for (const x of rearXs) {
    for (const [y, h] of [[g + 0.85, e.groundH - 2.1], [winY, winH]]) {
      ctx.push(box(1.10, h - 0.16, 0.06, x, y + h / 2, e.backZ + M.reveal + 0.05, 'rear-pane'), p.glass);
      ctx.push(box(1.66, 0.16, 0.32, x, y - 0.10, e.backZ - 0.10, 'rear-sill'), p.trim);
    }
  }

  // ── buttresses ───────────────────────────────────────────────────────────────────────
  // Stepped, weathered, and standing on the plinth rather than on the wall face. Four on the
  // front between the wings' bays, and two per flank.
  const buttFrontX = [-e.rangeW / 2 + 0.55, e.rangeW / 2 - 0.55,
    bays.length ? (bays[0] + bays[1]) / 2 : -9, bays.length > 3 ? (bays[bays.length - 2] + bays[bays.length - 1]) / 2 : 9];
  for (const x of buttFrontX) {
    ctx.add(buttress(ctx, { x, z: e.frontZ, facing: 'front', top: wallTop - 0.9 }));
  }
  for (const z of [zc - 4.4, zc + 4.4]) {
    ctx.add(buttress(ctx, { x: -e.rangeW / 2, z, facing: 'left', top: wallTop - 0.9 }));
    ctx.add(buttress(ctx, { x: e.rangeW / 2, z, facing: 'right', top: wallTop - 0.9 }));
  }

  // ── roof ─────────────────────────────────────────────────────────────────────────────
  ctx.add(seamGable(ctx, {
    x: 0, z: zc, w: e.rangeW, d: e.rangeD, eaveY: wallTop, pitch: e.roofPitch,
    overhang: 0.50, coursePitch: 1.22, name: 'rf',
  }));
  // Dormers on the front pitch, on the bay rhythm, so the roof belongs to the elevation below it.
  const dormerBays = bays.filter((_, i) => i % 2 === 0);
  for (const x of dormerBays) ctx.add(dormer(ctx, { x, eaveY: wallTop, zc }));

  // CROSS-GABLES over the end bay of each wing. [MEASURED by looking]
  // `_reference-landmarks/mp-oldarts-three-quarter.png` breaks its eaves line with projecting
  // gabled bays, and it is the difference between a range and a long shed: r1's front read as one
  // uninterrupted 26 m eaves with a tower punched through it. A parapeted wall gable buys most of
  // that read for 52 triangles each — the full projecting cross-wing would cost 600 and this
  // subject has 564 of headroom under its 9,000.
  for (const x of [bays[0], bays[bays.length - 1]]) {
    if (x == null) continue;
    const gw = e.bayGap * 1.15;
    const gh = 2.7;
    ctx.push(extrude([[-gw / 2, 0], [gw / 2, 0], [0, gh]], {
      depth: 0.42, axis: 'z', x, y: wallTop - 0.35, z: e.frontZ + 0.10, name: 'xgable',
    }), p.wall);
    const rake = Math.hypot(gw / 2, gh);
    const rakeA = Math.atan2(gh, gw / 2);
    for (const sgn of [-1, 1]) {
      ctx.push(rotBox(rake, 0.22, 0.34, x - sgn * gw / 4, wallTop + gh / 2 - 0.35, e.frontZ + 0.22,
        { z: sgn * (Math.PI / 2 - rakeA) }, 'xgable-coping'), p.trim);
    }
    ctx.push(taper(0.22, 0.04, 0.85, x, wallTop + gh - 0.35, e.frontZ + 0.22, 'xgable-finial', 6), p.trim);
  }

  // Rainwater goods that end somewhere (§2 rule 4).
  for (const x of [-e.rangeW / 2 + 0.35, e.rangeW / 2 - 0.35]) {
    ctx.add(downpipe(ctx, { x, z: e.frontZ + 0.20, y0: g, y1: wallTop - 0.30 }));
  }
  ctx.add(downpipe(ctx, { x: -e.rangeW / 2 + 0.35, z: e.backZ - 0.20, y0: g, y1: wallTop - 0.30 }));
}

/** A stepped buttress with a weathered head. */
function buttress(ctx, { x, z, facing, top }) {
  const p = ctx.p;
  const g = ctx.env.groundY;
  const out = [];
  const f = faceFrame(facing, facing === 'front' ? z : x);
  const steps = [
    { h: (top - g) * 0.52, proud: 1.15, w: 1.35 },
    { h: (top - g) * 0.30, proud: 0.86, w: 1.12 },
    { h: (top - g) * 0.18, proud: 0.60, w: 0.92 },
  ];
  let y = g;
  for (let i = 0; i < steps.length; i += 1) {
    const s = steps[i];
    const u = facing === 'front' ? x : z;
    const [bx, by, bz] = f.pos(u, y + s.h / 2, s.proud / 2 - 0.05);
    out.push(part(box(...f.dims(s.w, s.h, s.proud), bx, by, bz, 'butt-step'), p.wallAlt));
    // Weathering: a sloped stone over each set-off, so water and light both find an edge.
    const [wx, wy, wz] = f.pos(u, y + s.h, s.proud / 2 - 0.05);
    out.push(part(extrude([[-s.proud / 2, 0], [s.proud / 2, 0], [-s.proud / 2, 0.42]], {
      depth: s.w, axis: facing === 'front' ? 'x' : 'z',
      x: wx, y: wy, z: wz, name: 'butt-weather',
    }), p.trim));
    y += s.h;
  }
  return out;
}

/** A gabled dormer with a lancet in it. */
function dormer(ctx, { x, eaveY, zc }) {
  const p = ctx.p;
  const e = ctx.env;
  const out = [];
  const halfD = e.rangeD / 2 + 0.50;
  const z = zc + halfD * 0.52;
  const y = eaveY + Math.tan(e.roofPitch) * (halfD * 0.48);
  out.push(part(box(1.55, 2.0, 1.45, x, y + 1.0, z, 'dorm-body'), p.wall));
  out.push(part(extrude([[-0.95, 0], [0.95, 0], [0, 1.05]], {
    depth: 1.55, axis: 'z', x, y: y + 2.0, z, name: 'dorm-gable',
  }), p.roof));
  const prof = pointedArchProfile({ halfW: 0.42, spring: 0.95, rise: 0.44, base: 0, segs: 2 });
  out.push(part(extrude(prof, {
    depth: 0.06, axis: 'z', x, y: y + 0.42, z: z + 0.74, name: 'dorm-pane',
  }), p.glass));
  out.push(part(extrude(inflateProfile(prof, 0.14), {
    depth: 0.14, axis: 'z', x, y: y + 0.42, z: z + 0.78, name: 'dorm-hood', holes: [prof],
  }), p.trim));
  return out;
}

/* ──────────────────────────────────── the arcade ──────────────────────────────────── */

/**
 * The cloister. The arches are already punched by `range`; this adds what makes them read as an
 * arcade rather than as large windows — an arch moulding, engaged shafts with caps and bases at
 * every pier, and a recessed inner wall with the walk between.
 *
 * The walk's back wall is the reason the arches are black in every photograph of this building,
 * and it is also §2.2's room: a punched arch with nothing behind it is a hole in a card.
 */
function arcade(ctx, bays, wallTop) {
  const e = ctx.env;
  const p = ctx.p;
  const g = e.groundY;
  const archW = e.bayGap * 0.82;
  const archH = e.groundH - 0.85;
  const spring = archH * 0.62;
  const rise = archH * 0.38;
  const innerZ = e.frontZ - e.arcadeD;

  // The walk: floor, back wall and a dark ceiling, inside the arcade depth.
  ctx.add([
    part(slab(e.rangeW - 1.2, 0.12, e.arcadeD - 0.10, 0, g, innerZ + e.arcadeD / 2, 'arc-floor'), p.ground),
    part(box(e.rangeW - 1.2, 0.20, e.arcadeD - 0.10, 0, g + archH + 0.42,
      innerZ + e.arcadeD / 2, 'arc-soffit'), p.shadow),
  ]);
  for (const x of bays) {
    // Back wall behind each arch, in `room` so the recess carries value rather than crushing
    // to a black sticker (§5.3 — no albedo can light a reveal).
    ctx.push(box(archW + 0.9, archH + 0.4, 0.30, x, g + (archH + 0.4) / 2, innerZ, 'arc-back'), p.room);
  }

  for (let i = 0; i < bays.length; i += 1) {
    const x = bays[i];
    const inner = pointedArchProfile({ halfW: archW / 2, spring, rise, base: 0, segs: 3 });
    const outer = inflateProfile(inner, 0.26);
    ctx.push(extrude(outer, {
      depth: 0.24, axis: 'z', x, y: g + 0.30, z: e.frontZ + 0.12,
      name: `arc${i}-mould`, holes: [inner],
    }), p.trim);
    // Engaged shafts either side, with a moulded cap and a base. A shaft that stops in mid-air is
    // the floating element §1.2 calls a major.
    for (const s of [-1, 1]) {
      const sx = x + s * (archW / 2 + 0.30);
      ctx.push(taper(0.19, 0.17, spring + 0.30, sx, g + 0.42, e.frontZ + 0.20, 'arc-shaft', 6), p.trim);
      ctx.push(box(0.52, 0.20, 0.52, sx, g + spring + 0.80, e.frontZ + 0.20, 'arc-cap'), p.trim);
      ctx.push(box(0.56, 0.22, 0.56, sx, g + 0.36, e.frontZ + 0.20, 'arc-base'), p.trim);
    }
  }
  void wallTop;
}

/* ───────────────────────────────────── the tower ──────────────────────────────────── */

/**
 * The square crenellated clock tower, which is the whole identity of this subject.
 *
 * Proportion: the shaft is a little under three times its own width to the parapet, which is what
 * the real tower reads as and what keeps it a TOWER rather than a turret or a campanile. It stands
 * over the entrance, projecting forward of the range so it casts its own shadow onto the front.
 */
function tower(ctx, wallTop) {
  const e = ctx.env;
  const p = ctx.p;
  const g = e.groundY;
  const tx = e.towerX;
  const zF = e.frontZ + e.towerProudZ;
  const zB = zF - e.towerD;
  const zc = (zF + zB) / 2;
  const top = g + e.towerH;

  // ── the punched schedule ─────────────────────────────────────────────────────────────
  const doorW = 3.0;
  const doorH = 4.3;
  const front = [...archedHole(tx, g, doorW, doorH, {
    headFrac: 0.40, steps: 3, tag: 'tower-door', pointed: true,
  })];
  ctx.countAperture('tower-door');
  // Stair light over the entrance, then the belfry stage.
  const stairY = g + 6.6;
  front.push(...lancetHoles(tx, stairY, 1.5, 2.9, 'tower-stair'));
  ctx.countAperture('tower-stair');
  const belfryY = g + 13.4;
  const belfryH = 3.2;
  const belfryW = 1.8;
  const sides = { front: [...front], back: [], left: [], right: [] };
  for (const key of ['front', 'back', 'left', 'right']) {
    const u = key === 'front' || key === 'back' ? tx : zc;
    sides[key].push(...archedHole(u, belfryY, belfryW, belfryH, {
      headFrac: 0.36, steps: 2, tag: `belfry-${key}`, pointed: true,
    }));
    ctx.countAperture(`belfry-${key}`);
  }

  ctx.add(plinthCourse(ctx, {
    x: tx, z: zc, w: e.towerW, d: e.towerD, yBase: g - 0.02, h: 1.35, proud: 0.22,
  }));
  ctx.add(volume(ctx, {
    x: tx, zFront: zF, zBack: zB, width: e.towerW, y0: g, y1: top,
    front: sides.front, back: sides.back, left: sides.left, right: sides.right, name: 'twr',
  }));

  // Belfry louvres — four blades per face, set back in the reveal, so the openings read as louvred
  // rather than glazed. A belfry with glass in it is a mistake anyone who has seen a bell tower
  // will make in a fifth of a second.
  for (const key of ['front', 'back', 'left', 'right']) {
    const plane = key === 'front' ? zF : key === 'back' ? zB
      : key === 'right' ? tx + e.towerW / 2 : tx - e.towerW / 2;
    const f = faceFrame(key, plane);
    const u = key === 'front' || key === 'back' ? tx : zc;
    for (let i = 0; i < 4; i += 1) {
      const by = belfryY + 0.35 + i * (belfryH * 0.72) / 4;
      const [bx, byy, bz] = f.pos(u, by, -(LM_METRICS.reveal - 0.04));
      ctx.push(rotBox(...f.dims(belfryW - 0.12, 0.16, 0.22), bx, byy, bz,
        f.axis === 'z' ? { x: 0.42 } : { z: 0.42 }, 'twr-louvre'), p.metal);
    }
  }

  // Entrance dressing, and the doors that open.
  ctx.add(entrance(ctx, { tx, zF, doorW, doorH }));
  ctx.add(lancetWindow(ctx, {
    facing: 'front', plane: zF, u: tx, y: stairY, w: 1.5, h: 2.9, tracery: true, segs: 3,
    name: 'twr-stair',
  }));

  // String courses dividing the stages. A tower with no horizontal divisions is a chimney.
  for (const y of [g + 5.4, g + 11.9, g + e.towerH - 2.6]) {
    ctx.add(stringCourse(ctx, {
      x: tx, z: zc, w: e.towerW, d: e.towerD, y, thick: 0.24, proud: 0.16,
    }));
  }

  // ── the clock stage ──────────────────────────────────────────────────────────────────
  // Four faces, because the board orbits 360 degrees and the civic lane measured what happens to
  // a single-sided identity mark at az 135 and 225: zero pixels.
  const clockY = g + e.towerH - 4.6;
  const r = 1.55;
  for (const key of ['front', 'back', 'left', 'right']) {
    const plane = key === 'front' ? zF : key === 'back' ? zB
      : key === 'right' ? tx + e.towerW / 2 : tx - e.towerW / 2;
    const u = key === 'front' || key === 'back' ? tx : zc;
    ctx.add(clockFace(ctx, {
      facing: key, plane, u, y: clockY, r, name: `twr-clock-${key}`, hours: true,
    }));
  }

  // ── the crown ────────────────────────────────────────────────────────────────────────
  ctx.add(stringCourse(ctx, {
    x: tx, z: zc, w: e.towerW, d: e.towerD, y: top - 0.75, thick: 0.30, proud: 0.34,
  }));
  ctx.add(crenellation(ctx, {
    x: tx, z: zc, w: e.towerW + 0.68, d: e.towerD + 0.68, y: top - 0.20,
    merlonH: 1.05, merlonW: 0.86, gap: 0.62, wallT: 0.38,
  }));
  // Corner pinnacles: an octagonal shaft on a base, with a small spire. They are what stop the
  // crenellated top reading as a notched box.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = tx + sx * (e.towerW / 2 + 0.30);
      const pz = zc + sz * (e.towerD / 2 + 0.30);
      // Stubbier than r1: a 1.85 m shaft under a 1.35 m spire read as a rocket on
      // `plates/r1/university-old-arts--street.png`. A Collegiate Gothic corner pinnacle is
      // mostly shaft with a short capped spire, and it is wider than r1's at the base.
      ctx.push(box(0.96, 0.40, 0.96, px, top + 0.10, pz, 'twr-pin-base'), p.trim);
      ctx.push(taper(0.42, 0.36, 1.55, px, top + 0.30, pz, 'twr-pin-shaft', 8), p.wall);
      ctx.push(taper(0.46, 0.06, 0.95, px, top + 1.85, pz, 'twr-pin-spire', 8), p.trim);
    }
  }
  // The roof behind the parapet, so the tower is closed rather than open to the sky.
  ctx.push(slab(e.towerW - 0.5, 0.28, e.towerD - 0.5, tx, top - 0.30, zc, 'twr-deck'), p.roof);
  // A flag on the deck — one saturated accent, on a small area.
  ctx.push(taper(0.10, 0.06, 4.2, tx + 1.6, top + 0.0, zc, 'twr-flagpole', 5), p.metal);
  ctx.push(box(1.30, 0.78, 0.06, tx + 2.28, top + 3.5, zc, 'twr-flag'), p.accent);
  void wallTop;
}

/** The entrance: an order of mouldings, a hood, steps, and two leaves that open. */
function entrance(ctx, { tx, zF, doorW, doorH }) {
  const p = ctx.p;
  const g = ctx.env.groundY;
  const out = [];
  const inner = pointedArchProfile({
    halfW: doorW / 2, spring: doorH * 0.60, rise: doorH * 0.40, base: 0, segs: 3,
  });
  // Two orders of moulding, which is how a Gothic portal gets its depth.
  out.push(part(extrude(inflateProfile(inner, 0.30), {
    depth: 0.30, axis: 'z', x: tx, y: g, z: zF + 0.15, name: 'ent-order1', holes: [inner],
  }), p.trim));
  const order2 = inflateProfile(inner, 0.30);
  out.push(part(extrude(inflateProfile(inner, 0.62), {
    depth: 0.22, axis: 'z', x: tx, y: g, z: zF + 0.05, name: 'ent-order2', holes: [order2],
  }), p.wallAlt));
  // Tympanum over the doors, and the label mould's returns.
  out.push(part(box(doorW - 0.30, 0.90, 0.16, tx, g + doorH * 0.68, zF - 0.12, 'ent-tympanum'), p.trim));
  for (const s of [-1, 1]) {
    out.push(part(box(0.30, 0.34, 0.34, tx + s * (doorW / 2 + 0.46), g + doorH * 0.60 + 0.10,
      zF + 0.10, 'ent-label-stop'), p.trim));
  }
  // Steps up to the threshold, each a real tread with a nosing.
  for (let i = 0; i < 3; i += 1) {
    out.push(part(slab(doorW + 2.4 - i * 0.35, 0.17, 1.30 - i * 0.34,
      tx, g - 0.51 + i * 0.17, zF + 1.55 - i * 0.30, 'ent-step'), p.ground));
  }
  const leaves = doorLeaves(ctx, {
    id: 'old-arts-door', label: 'Old Arts entrance', facing: 'front', plane: zF,
    u: tx, y: g, w: doorW, h: doorH * 0.72, name: 'ent',
  });
  ctx.addOpening(leaves.opening);
  return out;
}
