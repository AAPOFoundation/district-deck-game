// District Deck V3.20 — contemporary lane.
//
// Seven rungs of one succession ladder: two townhouse forms and five apartment forms a
// player redevelops upward through. A ladder only reads as a ladder if each rung is a
// different BUILDING rather than the rung below at a new height, so the massing moves are
// graded and none of them repeats — a gable-fronted pair, then a party-wall row under a
// folded roof with dormers, then a walk-up whose whole frontage is a grid of deep loggias,
// then volumes that step in plan with projecting balconies, then a pier-and-balcony midrise
// under a folded parapet, and finally a curtain wall on a stone base under a stepped-back
// crown. The plainest rung is deliberately the plainest: `apartment-permit` is the scheme as
// approved, denser than the block below it and less articulated than the block above.
//
// ── the value scheme ───────────────────────────────────────────────────────────────────
// The round-one weakness was that wall, trim, roof and lot all sat within a few tones of
// each other, so nothing separated at board altitude. Contemporary Melbourne fixes that for
// free — charcoal brick against pale render is a real value break — and the palette already
// carries a near-black bucket and a near-white one. So this lane spends `iron` on masonry as
// well as metal, because charcoal brick, folded roof, black window frames, spouting and
// steel balustrades are one dark value in every reference plate, and keeps `shadow` for
// reveals so an opening still reads deeper than the wall it is cut into.
//
//   iron     charcoal brick, folded metal roof, window frames, balustrades, spouting
//   wall     the pale render volumes
//   wallAlt  precast: slab edges, string courses, sills, planter walls, blade cappings
//   roof     stone: bases, cappings, canopies, decks — the mid value between the other two
//   trim     warm: timber battens, lobby lining, bronze fins, and the lit room behind glass
//   glass, shadow, ground, foliage as the kit intends
//
// Nine buckets exactly, counting the lot. `joinery` and `roofTrim` are remapped away,
// because cream sashes and cream spouting are the two details that would make a
// contemporary frontage read as a heritage model in different paint.
//
// ── the budget ─────────────────────────────────────────────────────────────────────────
// The tall rungs are where this lane could go wrong: twelve storeys of a well-detailed floor
// plate is four times the ceiling. So one plate's worth of detail is authored once and
// repeated, the tower's fins are continuous members rather than twelve stacked segments,
// interior planes and reveal jambs stop above the third storey where no player looks, and
// the savings go to the base, the crown and the balconies — the only parts seen closely.

import * as THREE from 'three';
import { apartmentReveal } from './apartment-relief.js';
import {
  box, cyl, gable, rotBox, skillion, slab, emit, applySharedWear,
} from './core.js';
import {
  balconyDripNose, downpipe, eaveSoffitFascia, gutterRun, projectingSill,
  revealReglet, steelBalustrade, stringCourse, timberBattenScreen, turnBundle, ventGrille,
} from './ornament.js';
import { composeLot, crossover, driveway, LOT } from './curtilage.js';

/** y = 0 is the board plane; the lot paving caps at LOT.rise and every wall starts there. */
const BASE_Y = LOT.rise;

/**
 * Ornament buckets → this lane's buckets. `roofTrim` and `joinery` are the two the kit
 * paints cream for a Victorian frontage; here they are charcoal, which is what a gutter, a
 * fascia and a window frame actually are on a contemporary building.
 */
const LANE_REMAP = Object.freeze({
  wall: 'wall',
  wallAlt: 'wallAlt',
  roof: 'roof',
  roofTrim: 'iron',
  trim: 'trim',
  joinery: 'iron',
  iron: 'iron',
  glass: 'glass',
  shadow: 'shadow',
});

/** Emit an ornament bundle through the lane's remap, with a per-call override. */
function det(ctx, bundle, over = null) {
  return emit(ctx, bundle, over ? { ...LANE_REMAP, ...over } : LANE_REMAP);
}

/**
 * Relative luminance of a bucket's own albedo. Used only to compare two buckets against each
 * other, so it does not matter whether three.js handed back sRGB or linear values — the
 * ordering survives either way.
 */
function lum(material) {
  const c = material?.color;
  if (!c) return 0.5;
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/**
 * The lane's value scheme, named once so every builder speaks the same language and a reader
 * can see which of the nine buckets is doing which job.
 */
function surfacesOf(ctx) {
  const p = ctx.p;
  const apartment = ctx.archetypeId?.startsWith('apartment-');
  return {
    /**
     * The masonry, and it is whichever of the roof value and the frontage colour is actually
     * darker rather than the roof value on principle.
     *
     * The contemporary wall table carries genuine darks — `#3f423f` and `#5a5f61` sit beside
     * two creams — while `ROOF_VALUE` gives concrete-roofed archetypes `#5c5a55`, a mid grey
     * that arrives from the post chain lighter still. Five of the seven rungs here take
     * `concrete`, so binding masonry to the roof bucket handed the whole apartment ladder a
     * mid-grey base under a cream shaft and no value break anywhere. Asking which bucket is
     * darker costs nothing and can only improve the answer.
     */
    // The apartment palette already has a dedicated dark bucket for recesses and soffits.
    // Reusing it for the charcoal masonry keeps the family at nine measured buckets while
    // preserving the intended dark-vs-stone contrast.
    brick: apartment ? p.shadow : (lum(p.wall) <= lum(p.roof) ? p.wall : p.roof),
    render: p.wall,      // the pale volumes
    // Apartment lots already carry a concrete ground bucket. Reuse it for precast so the
    // apartment family stays within the measured nine-bucket ceiling.
    precast: apartment ? p.ground : p.wallAlt,
    stone: p.ground,     // bases, cappings, canopies and decks share the lot's concrete value
    timber: p.trim,      // battens, lobby lining, bronze fins, the lit room behind glass
    glass: p.glass,
    dark: p.shadow,      // reveals, soffits, recesses
    /** The pale volumes, resolved the same way and for the same reason. */
    pale: lum(p.wall) >= lum(p.ground) ? p.wall : p.ground,
  };
}

/** A cheaper twin of the context, for detail that repeats up a tall building. */
function coarse(ctx) {
  return { ...ctx, q: ctx.q === 'low' ? 'low' : 'medium', detail: false };
}

/** Board-altitude repetition tier: preserves the rail silhouette with the low-tier spacing. */
function boardRepeat(ctx) {
  return { ...ctx, q: 'low', detail: false };
}

/* ────────────────────────────── elevation primitives ──────────────────────────────── */
//
// THE ELEVATION FRAME. Four elevations, one set of helpers. `axis` 'x' runs the elevation
// along X at the plane z; 'z' runs it along Z at the plane x. `face` is +1 when the
// elevation looks toward +Z (or +X) and −1 when it looks the other way. `u` is the position
// along the run, and `set` is how far BEHIND the face plane a part's own outer surface sits
// — so a reveal, a pane and a frame are authored as depths from the wall face rather than as
// world coordinates that drift the moment the wall moves.

function faceBox(axis, face, plane, { u, y, run, height, depth, set = 0 }, name = 'face') {
  const outer = plane - face * set;
  const centre = outer - face * (depth / 2);
  return axis === 'x'
    ? box(run, height, depth, u, y, centre, name)
    : box(depth, height, run, centre, y, u, name);
}

/** Which way an ornament bundle authored facing +Z must turn to land on this elevation. */
function faceAngle(axis, face) {
  if (axis === 'x') return face > 0 ? 0 : Math.PI;
  return face > 0 ? Math.PI / 2 : -Math.PI / 2;
}

/** Turn a bundle authored at the origin facing +Z, then move it into place. */
function placeBundle(bundle, { angle = 0, x = 0, y = 0, z = 0 }) {
  if (angle) turnBundle(bundle, { x: 0, z: 0, angle });
  if (x || y || z) {
    for (const key of Object.keys(bundle)) {
      for (const g of bundle[key]) {
        if (!g) continue;
        g.translate(x, y, z);
        g.computeBoundingBox();
      }
    }
  }
  return bundle;
}

/** Contemporary's five detail scales, authored at the opening rather than left as prose. */
function contemporaryBayDetails(ctx, {
  x, y, z, width, height, run = width, salt = 400,
}) {
  const drift = ctx.v.range(salt, -0.045, 0.045);
  const openingW = Math.max(0.42, width + drift);
  det(ctx, placeBundle(revealReglet(ctx, {
    x: 0, y: 0, z: 0, width: openingW, height, thickness: 0.06, salt,
  }), { x, y, z }));
  det(ctx, placeBundle(projectingSill(ctx, {
    x: 0, y: 0, z: 0, width: openingW, projection: 0.12 + drift, salt: salt + 1,
  }), { x, y, z: z - 0.01 }));
  det(ctx, placeBundle(balconyDripNose(ctx, {
    x: 0, y: 0, z: 0, width: run, depth: 0.20, salt: salt + 2,
  }), { x, y: y - 0.22, z: z - 0.02 }));
  det(ctx, placeBundle(eaveSoffitFascia(ctx, {
    x: 0, y: 0, z: 0, length: run, projection: 0.25, salt: salt + 3,
  }), { x, y: y + height + 0.34, z }));
  det(ctx, placeBundle(timberBattenScreen(ctx, {
    x: 0, y: 0, z: 0, width: Math.max(0.30, Math.min(run * 0.26, width * 0.7)),
    height: Math.min(height, 2.40), pitch: 0.10, depth: 0.09, salt: salt + 4,
  }), { x: x + run * 0.28, y, z: z + 0.08 }));
}

/** An opening record in an elevation's own frame. */
function hole(u, y, width, height) {
  return { u, y, width, height };
}

/**
 * A wall built as the panels its openings leave standing, so every reveal is a real hole.
 * Split into horizontal bands at each opening edge, then across each band into the pieces
 * between the openings live at that height. A pane laid on a solid box is the flat blue
 * rectangle §2.3 exists to prevent, and no amount of frame rescues it.
 */
function openWall(ctx, {
  material, axis = 'x', face = 1, plane, centre = 0, run, y0, y1,
  depth = 0.30, openings = [], name = 'wall',
}) {
  if (!(run > 0.02) || !(y1 - y0 > 0.02)) return;
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
        ctx.push(faceBox(axis, face, plane, {
          u: (left + right) / 2, y: mid, run: right - left, height: b - a, depth,
        }, name), material);
      }
      u = Math.max(u, t);
    }
    if (hi - u > 0.02) {
      ctx.push(faceBox(axis, face, plane, {
        u: (u + hi) / 2, y: mid, run: hi - u, height: b - a, depth,
      }, name), material);
    }
  }
}

/**
 * A closed volume: one solid core plus four elevations built around their openings. The core
 * is inset by the wall depth so the model is watertight without paying four walls' worth of
 * triangles for an interior nobody sees.
 */
function volume(ctx, {
  material, x = 0, zFront, zBack, width, y0, y1, depth = 0.30,
  front = [], back = [], left = [], right = [], name = 'vol',
}) {
  const zc = (zFront + zBack) / 2;
  const d = zFront - zBack;
  if (!(width > 0.05) || !(d > 0.05) || !(y1 - y0 > 0.05)) return;
  if (!(width > depth * 2.2) || !(d > depth * 2.2)) {
    ctx.push(box(width, y1 - y0, d, x, (y0 + y1) / 2, zc, `${name}-solid`), material);
    return;
  }
  ctx.push(box(width - depth * 2, y1 - y0, d - depth * 2, x, (y0 + y1) / 2, zc, `${name}-core`),
    material);
  openWall(ctx, { material, axis: 'x', face: 1, plane: zFront, centre: x, run: width, y0, y1, depth, openings: front, name: `${name}-front` });
  openWall(ctx, { material, axis: 'x', face: -1, plane: zBack, centre: x, run: width, y0, y1, depth, openings: back, name: `${name}-back` });
  openWall(ctx, { material, axis: 'z', face: 1, plane: x + width / 2, centre: zc, run: d, y0, y1, depth, openings: right, name: `${name}-right` });
  openWall(ctx, { material, axis: 'z', face: -1, plane: x - width / 2, centre: zc, run: d, y0, y1, depth, openings: left, name: `${name}-left` });
}

/**
 * A storey built as `units` frontages over one shared core, so each dwelling carries its own
 * wall value without paying for its own box.
 *
 * Lane A's terraces settled this: subdividing a row means splitting the FRONTAGE, not the
 * building. The core, the rear and the two flanks stay single runs; only the street elevation
 * is authored per dwelling. Three frontages therefore cost two extra wall panels rather than
 * three extra volumes, which is what keeps a three-unit row inside the same budget the
 * one-unit box had.
 */
function unitStorey(ctx, {
  x = 0, width, units, zFront, zBack, y0, y1, depth = 0.30, carcass,
  matFor, front = [], back = [], left = [], right = [], name = 'storey',
}) {
  const zc = (zFront + zBack) / 2;
  const d = zFront - zBack;
  if (!(width > 0.05) || !(d > 0.05) || !(y1 - y0 > 0.05)) return;
  ctx.push(box(width - depth * 2, y1 - y0, d - depth * 2, x, (y0 + y1) / 2, zc, `${name}-core`),
    carcass);
  const unitW = width / units;
  for (let i = 0; i < units; i += 1) {
    const ux = x - width / 2 + (i + 0.5) * unitW;
    openWall(ctx, {
      material: matFor(i), axis: 'x', face: 1, plane: zFront, centre: ux, run: unitW,
      y0, y1, depth, name: `${name}-front`,
      openings: front.filter((o) => Math.abs(o.u - ux) < unitW / 2),
    });
  }
  openWall(ctx, { material: carcass, axis: 'x', face: -1, plane: zBack, centre: x, run: width, y0, y1, depth, openings: back, name: `${name}-back` });
  openWall(ctx, { material: carcass, axis: 'z', face: 1, plane: x + width / 2, centre: zc, run: d, y0, y1, depth, openings: right, name: `${name}-right` });
  openWall(ctx, { material: carcass, axis: 'z', face: -1, plane: x - width / 2, centre: zc, run: d, y0, y1, depth, openings: left, name: `${name}-left` });
}

/**
 * Brick coursing: dark mortar lines across a charcoal face, every fifth course rather than
 * every course — at board altitude the rhythm is what reads, and five times the strips would
 * buy nothing but triangles. This is also half the answer to §2.1 on a flank, because the
 * lines start and finish on the wall's own arrises instead of crossing a blank plane.
 */
function courseLines(ctx, {
  axis = 'x', face = 1, plane, u, run, y0, y1, pitch = 0.42,
}) {
  if (!ctx.mid || !(run > 0.1) || !(y1 - y0 > pitch)) return;
  const s = surfacesOf(ctx);
  const n = Math.floor((y1 - y0) / pitch);
  const geos = [];
  for (let i = 1; i <= n; i += 1) {
    geos.push(faceBox(axis, face, plane, {
      u, y: y0 + i * pitch, run, height: 0.035, depth: 0.055, set: -0.02,
    }, 'brick-course'));
  }
  ctx.push(geos, s.dark);
}

/**
 * Masonry expressed as its JOINTS: a fine bed line every course, and staggered perpend ticks
 * on alternate courses.
 *
 * The first version laid proud brick FACES instead, and it was wrong twice over. A wall panel
 * is solid, so a recessed joint cannot be modelled — only the face can stand proud — and a
 * proud face wide enough to be affordable is 0.47 m long and 0.28 m high, which is two and a
 * half bricks by four. Every plate came back with a base course that read as rusticated stone
 * blocks, and the flanks read as printed tile at eleven thousand triangles a pair. What the
 * eye actually reads as brickwork at this scale is the horizontal striation, so that is what
 * is built: a 3 mm dark line on a 0.22 m course, with ticks where the perpends fall. Sparse
 * drops the ticks, which is right for a flank and costs a thirtieth of the old bond.
 */
function brickRelief(ctx, {
  axis = 'x', face = 1, plane, centre = 0, run, y0, y1, openings = [],
  course = 0.22, brick = 0.46, sparse = false,
}) {
  if (!ctx.mid || !(run > 0.4) || !(y1 - y0 > course * 2)) return;
  const s = surfacesOf(ctx);
  // Sparse is not a quality tier, it is a distance decision: the street elevation is read at
  // two metres in the detail view and the other three at board altitude, so they take a
  // coarser course and no perpends at all. Measured — the fine bond on all four elevations of
  // the row came to 39 654 triangles, a third over the ceiling, for a flank nobody inspects.
  const pitch = (ctx.detail ? course : course * 1.6) * (sparse ? 1.5 : 1);
  const rows = Math.max(1, Math.floor((y1 - y0) / pitch));
  const geos = [];
  const clear = (u, w, y, h) => !openings.some((o) => (
    y + h / 2 > o.y && y - h / 2 < o.y + o.height
    && u + w / 2 > o.u - o.width / 2 && u - w / 2 < o.u + o.width / 2
  ));
  for (let r = 1; r < rows; r += 1) {
    const by = y0 + r * pitch;
    // The bed line runs the whole elevation; the openings are cut out of it in the same pass
    // so a course can never bridge a window reveal.
    let u = centre - run / 2;
    const spans = openings
      .filter((o) => o.y < by && o.y + o.height > by)
      .map((o) => [o.u - o.width / 2, o.u + o.width / 2])
      .sort((a, b) => a[0] - b[0]);
    for (const [a, b] of [...spans, [centre + run / 2, centre + run / 2]]) {
      if (a - u > 0.10) {
        geos.push(faceBox(axis, face, plane, {
          u: (u + a) / 2, y: by, run: a - u, height: 0.030, depth: 0.05, set: -0.012,
        }, 'bed-joint'));
      }
      u = Math.max(u, b);
    }
  }
  if (ctx.detail && !sparse) {
    const cols = Math.max(2, Math.round(run / (brick * 2)));
    const step = run / cols;
    for (let r = 0; r < rows; r += 3) {
      const by = y0 + (r + 0.5) * pitch;
      for (let c = 0; c <= cols; c += 1) {
        const cu = centre - run / 2 + (c + ((r / 3) & 1) * 0.5) * step;
        if (cu < centre - run / 2 || cu > centre + run / 2) continue;
        if (!clear(cu, 0.05, by, pitch)) continue;
        geos.push(faceBox(axis, face, plane, {
          u: cu, y: by, run: 0.030, height: pitch * 0.82, depth: 0.05, set: -0.012,
        }, 'perpend'));
      }
    }
  }
  ctx.push(geos, s.dark);
}

/**
 * A blade standing proud of an elevation, from a plinth to a capping.
 *
 * The single cheapest answer to §2.1. A long flank reads as one plane no matter how much
 * relief is laid on it — that is the tiled-carpet failure the r13 row plate showed, where
 * eleven thousand triangles of brick module bought a flank that still looked like a printed
 * texture. What breaks a plane is a plane change, and one blade throws a hard vertical shadow
 * for thirty-six triangles. It starts on the plinth and finishes under a capping, so it also
 * satisfies the rule about things that cross a flank starting and finishing somewhere real.
 */
function blade(ctx, {
  axis = 'x', face = 1, plane, u, y0, y1, width = 0.46, proud = 0.20, material = null, cap = true,
  capOverhang = 0.07, capOverlap = 0,
}) {
  if (!(y1 - y0 > 0.4)) return;
  const s = surfacesOf(ctx);
  const mat = material ?? s.brick;
  ctx.push(faceBox(axis, face, plane, {
    u, y: (y0 + y1) / 2, run: width, height: y1 - y0, depth: proud + 0.10, set: -proud,
  }, 'blade'), mat);
  if (cap) {
    ctx.push(faceBox(axis, face, plane, {
      u, y: y1 + 0.05 - capOverlap, run: width + capOverhang * 2,
      height: 0.10, depth: proud + 0.20, set: -proud - 0.06,
    }, 'blade-cap'), s.stone);
  }
}

/**
 * A plane change down a long elevation: the run between `u0` and `u1` steps forward. Half of
 * ref-06's end flank is doing exactly this — the front third of the wall stands proud of the
 * back two thirds, and the shadow line between them is what stops twelve metres of dark brick
 * reading as a printed panel.
 */
function elevationStep(ctx, {
  axis = 'x', face = 1, plane, u0, u1, y0, y1, proud = 0.22, material = null,
}) {
  if (!(u1 - u0 > 0.3) || !(y1 - y0 > 0.3)) return;
  const s = surfacesOf(ctx);
  ctx.push(faceBox(axis, face, plane, {
    u: (u0 + u1) / 2, y: (y0 + y1) / 2, run: u1 - u0, height: y1 - y0,
    depth: proud + 0.08, set: -proud,
  }, 'elev-step'), material ?? s.brick);
  // The reveal down the open edge, so the step has a thickness rather than a painted seam.
  ctx.push(faceBox(axis, face, plane, {
    u: u1, y: (y0 + y1) / 2, run: 0.07, height: y1 - y0, depth: proud, set: -proud,
  }, 'elev-step-reveal'), s.dark);
}

/** Panel joints are segmented by floor so they terminate at the slab edge that cast them. */
function panelJoints(ctx, {
  axis = 'x', face = 1, plane, centre = 0, run, y0, rows, cols, openings = [],
}) {
  if (!ctx.detail || !(run > 0.5) || !(rows > 0) || !(cols > 1)) return;
  const s = surfacesOf(ctx);
  const floorH = ctx.env.storeyH;
  const geos = [];
  for (let r = 0; r < rows; r += 1) {
    const base = y0 + r * floorH;
    for (let c = 1; c < cols; c += 1) {
      const jointU = centre - run / 2 + (run * c) / cols;
      const jointY0 = base + 0.10;
      const jointY1 = base + floorH - 0.10;
      if (openings.some((o) => (
        jointU > o.u - o.width / 2 && jointU < o.u + o.width / 2
        && jointY1 > o.y && jointY0 < o.y + o.height
      ))) continue;
      geos.push(faceBox(axis, face, plane, {
        u: jointU, y: base + floorH / 2,
        run: 0.035, height: floorH - 0.20, depth: 0.04, set: -0.025,
      }, 'panel-joint-v'));
    }
    geos.push(faceBox(axis, face, plane, {
      u: centre, y: base + floorH - 0.07, run, height: 0.035, depth: 0.04, set: -0.025,
    }, 'panel-joint-h'));
  }
  ctx.push(geos, s.render);
}

/**
 * A punched opening with reveal depth, dark glass, a slim black frame and a stone sill.
 * `lean` drops the reveal jambs and the room behind the pane — used above the third storey,
 * where a player is reading a silhouette and paying for a room nobody can see into.
 */
function windowUnit(ctx, {
  axis = 'x', face = 1, plane, u, y, width, height,
  reveal = 0.22, mullions = 1, sill = true, head = false, lean = false, warm = true, relief = false,
}) {
  if (!(width > 0.12) || !(height > 0.12)) return;
  const s = surfacesOf(ctx);
  const at = (o, name) => faceBox(axis, face, plane, o, name);
  const yc = y + height / 2;
  const t = 0.06;
  const thin = ctx.detail ? 0.055 : 0.075;

  const liner = relief ? apartmentReveal({ width, height, depth: reveal }).map(geometry => {
    geometry.rotateY(faceAngle(axis, face));
    geometry.translate(axis === 'x' ? u : plane, yc, axis === 'x' ? plane : u);
    return geometry;
  }) : [
    at({ u, y: y + height - t / 2, run: width, height: t, depth: reveal }, 'reveal-head'),
    at({ u, y: y + t / 2, run: width, height: t, depth: reveal }, 'reveal-sill'),
  ];
  if (!relief && !lean && ctx.mid) {
    liner.push(at({ u: u - width / 2 + t / 2, y: yc, run: t, height, depth: reveal }, 'reveal-jamb'));
    liner.push(at({ u: u + width / 2 - t / 2, y: yc, run: t, height, depth: reveal }, 'reveal-jamb'));
  }
  ctx.push(liner, s.dark);

  // The room. A warm plane deep in the reveal is what makes a pane read as a lit interior
  // rather than a hole cut in a card, and it is the cheapest thing on this frontage.
  if (warm && !lean && ctx.mid) {
    ctx.push(at({
      u, y: yc, run: width - 0.10, height: height - 0.10, depth: 0.05, set: reveal + 0.26,
    }, 'room'), s.timber);
  }

  ctx.push(at({
    u, y: yc, run: width - 0.09, height: height - 0.09, depth: 0.035, set: reveal,
  }, 'glazing'), s.glass);

  const frame = [
    at({ u, y: y + thin / 2 + 0.03, run: width - 0.06, height: thin, depth: 0.055, set: reveal - 0.025 }, 'frame-rail'),
    at({ u, y: y + height - thin / 2 - 0.03, run: width - 0.06, height: thin, depth: 0.055, set: reveal - 0.025 }, 'frame-rail'),
  ];
  if (!lean) {
    frame.push(at({ u: u - width / 2 + thin / 2 + 0.03, y: yc, run: thin, height: height - 0.06, depth: 0.055, set: reveal - 0.025 }, 'frame-stile'));
    frame.push(at({ u: u + width / 2 - thin / 2 - 0.03, y: yc, run: thin, height: height - 0.06, depth: 0.055, set: reveal - 0.025 }, 'frame-stile'));
  }
  const m = Math.max(0, mullions | 0);
  for (let i = 1; i <= m; i += 1) {
    frame.push(at({
      u: u - width / 2 + (width * i) / (m + 1), y: yc,
      run: thin * 0.85, height: height - 0.08, depth: 0.05, set: reveal - 0.02,
    }, 'mullion'));
  }
  ctx.push(frame, s.brick);

  if (sill) {
    ctx.push(at({
      u, y: y - 0.055, run: width + 0.20, height: 0.11, depth: 0.20, set: -0.07,
    }, 'sill'), s.stone);
  }
  if (head && ctx.mid) {
    ctx.push(at({
      u, y: y + height + 0.07, run: width + 0.20, height: 0.13, depth: 0.17, set: -0.04,
    }, 'lintel'), s.stone);
  }
}

/**
 * Full-height glazed doors: two leaves, a real threshold and the same warm room behind. The
 * contemporary answer to a front door, and what fills every balcony opening in this lane.
 */
function glazedDoors(ctx, {
  axis = 'x', face = 1, plane, u, y, width, height, reveal = 0.16, leaves = 2, warm = true,
}) {
  if (!(width > 0.3) || !(height > 0.3)) return;
  const s = surfacesOf(ctx);
  const at = (o, name) => faceBox(axis, face, plane, o, name);
  const yc = y + height / 2;

  ctx.push([
    at({ u, y: y + height - 0.05, run: width, height: 0.10, depth: reveal }, 'door-head'),
    at({ u: u - width / 2 + 0.05, y: yc, run: 0.10, height, depth: reveal }, 'door-jamb'),
    at({ u: u + width / 2 - 0.05, y: yc, run: 0.10, height, depth: reveal }, 'door-jamb'),
  ], s.dark);
  if (warm && ctx.mid) {
    ctx.push(at({
      u, y: yc, run: width - 0.16, height: height - 0.12, depth: 0.05, set: reveal + 0.30,
    }, 'room'), s.timber);
  }
  ctx.push(at({
    u, y: yc, run: width - 0.12, height: height - 0.10, depth: 0.035, set: reveal,
  }, 'door-glazing'), s.glass);

  const t = ctx.detail ? 0.065 : 0.085;
  const frame = [
    at({ u, y: y + t / 2 + 0.02, run: width - 0.08, height: t, depth: 0.06, set: reveal - 0.03 }, 'door-rail'),
    at({ u, y: y + height - t / 2 - 0.04, run: width - 0.08, height: t, depth: 0.06, set: reveal - 0.03 }, 'door-rail'),
    at({ u: u - width / 2 + t / 2 + 0.04, y: yc, run: t, height: height - 0.08, depth: 0.06, set: reveal - 0.03 }, 'door-stile'),
    at({ u: u + width / 2 - t / 2 - 0.04, y: yc, run: t, height: height - 0.08, depth: 0.06, set: reveal - 0.03 }, 'door-stile'),
  ];
  const n = Math.max(1, leaves | 0);
  for (let i = 1; i < n; i += 1) {
    frame.push(at({
      u: u - width / 2 + (width * i) / n, y: yc, run: t * 1.15, height: height - 0.08,
      depth: 0.06, set: reveal - 0.03,
    }, 'door-meeting'));
  }
  ctx.push(frame, s.brick);
  ctx.push(at({
    u, y: y + 0.035, run: width + 0.12, height: 0.07, depth: reveal + 0.16, set: -0.06,
  }, 'threshold'), s.stone);
}

/**
 * The hardwood screen: vertical battens over a dark void. It is the one warm surface on a
 * charcoal frontage, and it does the work a fanlight does on a terrace — it tells the eye
 * where the front door is.
 */
function timberScreen(ctx, {
  axis = 'x', face = 1, plane, u, y, width, height, pitch = 0.135, batten = 0.055,
}) {
  if (!(width > 0.15) || !(height > 0.2)) return;
  const s = surfacesOf(ctx);
  const at = (o, name) => faceBox(axis, face, plane, o, name);
  ctx.push(at({ u, y: y + height / 2, run: width, height, depth: 0.10, set: 0.02 }, 'screen-void'), s.dark);
  if (!ctx.mid) return;
  const n = Math.max(2, Math.round(width / pitch));
  const geos = [];
  for (let i = 0; i <= n; i += 1) {
    geos.push(at({
      u: u - width / 2 + (width * i) / n, y: y + height / 2,
      run: batten, height, depth: 0.075, set: -0.03,
    }, 'screen-batten'));
  }
  geos.push(at({ u, y: y + height + 0.03, run: width + 0.06, height: 0.06, depth: 0.10, set: -0.04 }, 'screen-head'));
  geos.push(at({ u, y: y - 0.03, run: width + 0.06, height: 0.06, depth: 0.10, set: -0.04 }, 'screen-foot'));
  ctx.push(geos, s.timber);
}

/**
 * A sectional garage door set back in its reveal under a stone lintel. The horizontal panel
 * joints are the whole read: without them the opening is a black rectangle, and a black
 * rectangle in a base course is most of why the baseline townhouse looked like a shed.
 */
function garageDoor(ctx, { plane, u, y, width, height, reveal = 0.26 }) {
  const s = surfacesOf(ctx);
  const at = (o, name) => faceBox('x', 1, plane, o, name);
  ctx.push([
    at({ u, y: y + height - 0.07, run: width, height: 0.14, depth: reveal }, 'garage-head'),
    at({ u: u - width / 2 + 0.07, y: y + height / 2, run: 0.14, height, depth: reveal }, 'garage-jamb'),
    at({ u: u + width / 2 - 0.07, y: y + height / 2, run: 0.14, height, depth: reveal }, 'garage-jamb'),
  ], s.dark);
  ctx.push(at({
    u, y: y + height / 2, run: width - 0.16, height: height - 0.10, depth: 0.09, set: reveal,
  }, 'garage-leaf'), s.brick);

  if (ctx.mid) {
    const panels = ctx.detail ? 5 : 3;
    const geos = [];
    for (let i = 1; i < panels; i += 1) {
      geos.push(at({
        u, y: y + (height * i) / panels, run: width - 0.18, height: 0.045, depth: 0.05,
        set: reveal - 0.035,
      }, 'garage-joint'));
    }
    ctx.push(geos, s.dark);
  }
  ctx.push(at({
    u, y: y + height + 0.10, run: width + 0.28, height: 0.16, depth: 0.22, set: -0.06,
  }, 'garage-lintel'), s.stone);
}

/**
 * The front door: a flush timber leaf in a deep reveal, a glazed side light, a pull and a
 * step. Panelled doors belong to the other three lanes; here the interest is the reveal.
 */
function entryDoor(ctx, {
  plane, u, y, width = 1.02, height = 2.30, reveal = 0.40, sidelight = 0.38,
}) {
  const s = surfacesOf(ctx);
  const at = (o, name) => faceBox('x', 1, plane, o, name);
  const total = width + sidelight;
  ctx.push([
    at({ u, y: y + height + 0.06, run: total + 0.12, height: 0.12, depth: reveal }, 'entry-head'),
    at({ u: u - total / 2, y: y + height / 2, run: 0.12, height, depth: reveal }, 'entry-jamb'),
    at({ u: u + total / 2, y: y + height / 2, run: 0.12, height, depth: reveal }, 'entry-jamb'),
    at({ u, y: y + height / 2, run: total, height, depth: 0.06, set: reveal + 0.34 }, 'entry-back'),
  ], s.dark);

  const doorU = u - sidelight / 2;
  ctx.push(at({
    u: doorU, y: y + height / 2, run: width, height: height - 0.04, depth: 0.09, set: reveal,
  }, 'door-leaf'), s.timber);
  if (sidelight > 0.1) {
    const lightU = u + width / 2;
    ctx.push(at({
      u: lightU, y: y + height / 2, run: sidelight - 0.08, height: height - 0.12,
      depth: 0.03, set: reveal + 0.02,
    }, 'sidelight-glass'), s.glass);
    if (ctx.mid) {
      ctx.push(at({
        u: lightU, y: y + height / 2, run: sidelight - 0.02, height: height - 0.05,
        depth: 0.05, set: reveal + 0.10,
      }, 'sidelight-glow'), s.timber);
    }
  }
  if (ctx.detail) {
    ctx.push(at({
      u: doorU + width * 0.34, y: y + height * 0.50, run: 0.05, height: 0.75, depth: 0.05,
      set: reveal - 0.06,
    }, 'door-pull'), s.brick);
  }
  ctx.push(at({
    u, y: y + 0.035, run: total + 0.30, height: 0.07, depth: reveal + 0.34, set: -0.10,
  }, 'entry-step'), s.stone);
}

/**
 * The street number in relief. Seven strokes a numeral rather than modelled type: at board
 * altitude the eye reads "a number beside the door", and real letterforms would cost more
 * triangles than the lobby they sit on. Bits run top, top-right, bottom-right, bottom,
 * bottom-left, top-left, middle.
 */
const NUMERAL_STROKES = Object.freeze([63, 6, 91, 79, 102, 109, 125, 7, 127, 111]);

function streetNumber(ctx, { plane, u, y, digits, size = 0.30, set = -0.05 }) {
  if (!ctx.mid) return;
  const s = surfacesOf(ctx);
  const at = (o, name) => faceBox('x', 1, plane, o, name);
  const w = size * 0.62;
  const h = size;
  const t = Math.max(0.032, size * 0.13);
  const geos = [];
  const list = String(digits).split('');
  for (let i = 0; i < list.length; i += 1) {
    const cx = u + (i - (list.length - 1) / 2) * (w + size * 0.30);
    const mask = NUMERAL_STROKES[Number(list[i]) % 10];
    const strokes = [
      [0, cx, y + h, w, t],
      [1, cx + w / 2, y + h * 0.75, t, h / 2],
      [2, cx + w / 2, y + h * 0.25, t, h / 2],
      [3, cx, y, w, t],
      [4, cx - w / 2, y + h * 0.25, t, h / 2],
      [5, cx - w / 2, y + h * 0.75, t, h / 2],
      [6, cx, y + h / 2, w, t],
    ];
    for (const [bit, sx, sy, sw, sh] of strokes) {
      if (!(mask & (1 << bit))) continue;
      geos.push(at({ u: sx, y: sy, run: sw, height: sh, depth: 0.05, set }, 'numeral'));
    }
  }
  ctx.push(geos, s.brick);
}

/* ─────────────────────────────────── balconies ────────────────────────────────────── */

/**
 * A projecting balcony: a deck landing on a real slab, an expressed slab edge, a soffit, a
 * planter at one end and a steel balustrade standing on the deck. Cantilevered decks are how
 * a contemporary block gets its depth, and the edge band is what tells the eye the deck is
 * structure rather than a shelf screwed to a facade.
 */
function balconyProjecting(ctx, {
  x, zWall, reach, width, y, planter = true, lean = false, boardRail = false,
}) {
  const s = surfacesOf(ctx);
  const zc = zWall + reach / 2;
  const zFront = zWall + reach;
  // The deck is a real 0.28 slab. The nose is a separate projecting member, so the rail is
  // seated on structure and the underside has a readable shadow rather than one white plank.
  ctx.push(slab(width, 0.28, reach, x, y - 0.28, zc, 'balcony-deck'), s.stone);
  // balconyDripNose is authored at the origin; move its two parts to the balcony edge.
  const noseBundle = balconyDripNose(ctx, { width: width + 0.10, depth: 0.20, salt: 461 });
  placeBundle(noseBundle, { x, y: y - 0.20, z: zFront - 0.20 });
  det(ctx, noseBundle);
  // The soffit reads the underside as concrete in shade, which separates a deck from a plate
  // floating in front of a wall.
  ctx.push(box(width - 0.12, 0.05, reach - 0.12, x, y - 0.30, zc, 'balcony-soffit'), s.dark);
  for (const bx of [x - width * 0.25, x + width * 0.25]) {
    ctx.push(box(0.16, 0.16, Math.max(0.45, reach - 0.18), bx, y - 0.24,
      zWall + Math.max(0.22, (reach - 0.18) / 2), 'balcony-bearer'), s.precast);
  }

  // Repeated high-level balconies keep their complete deck/edge/soffit/return construction,
  // but their picket pitch is judged at board altitude. This is a discrete LOD decision, not
  // a global quality reduction: the podium, glazing, planters and crown remain untouched.
  const bctx = boardRail ? boardRepeat(ctx) : (lean ? coarse(ctx) : ctx);
  let railW = width - 0.06;
  let railX = x;
  if (planter && ctx.mid) {
    const pw = Math.min(0.84, width * 0.24);
    const px = x - width / 2 + pw / 2 + 0.05;
    ctx.push(slab(pw, 0.44, reach - 0.26, px, y, zc, 'planter'), s.precast);
    ctx.push(slab(pw - 0.12, 0.11, reach - 0.38, px, y + 0.40, zc, 'planter-fill'), ctx.p.foliage);
    railW = width - pw - 0.16;
    railX = x + pw / 2 + 0.02;
  }
  det(ctx, steelBalustrade(bctx, {
    width: railW, x: railX, yBase: y, z: zFront - 0.05, height: 1.05, depth: 0.05,
  }));
  // Return rails, so the balustrade turns the corner and dies into the wall it belongs to.
  for (const side of [-1, 1]) {
    const rail = steelBalustrade(bctx, {
      width: reach - 0.14, x: 0, yBase: y, z: 0, height: 1.05, depth: 0.05,
    });
    placeBundle(rail, { angle: Math.PI / 2, x: x + side * (width / 2 - 0.03), z: zc });
    det(ctx, rail);
  }
}

/**
 * A juliet: a balustrade fixed to the wall in front of a full-height door, with no deck at
 * all. It is what the permit-stage block gets instead of a balcony, and it is the detail that
 * separates that rung from the one above without changing the massing.
 */
function juliet(ctx, { x, zWall, width, y }) {
  const s = surfacesOf(ctx);
  const sill = projectingSill(ctx, { width, projection: 0.35, salt: 481 });
  placeBundle(sill, { x, y: y - 0.05, z: zWall - 0.10 });
  det(ctx, sill);
  det(ctx, steelBalustrade(ctx.detail ? ctx : coarse(ctx), {
    width, x, yBase: y + 0.05, z: zWall + 0.24, height: 1.00, depth: 0.05,
  }));
}

/* ────────────────────────────── roofs, parapets, plant ────────────────────────────── */

/** core's gable runs its ridge along X. A street-facing gable end wants it along Z. */
function gableAcross(w, d, height, x, yBase, z, name) {
  const g = gable(d, w, height, 0, yBase, 0, name);
  g.rotateY(Math.PI / 2);
  g.translate(x, 0, z);
  g.computeBoundingBox();
  return g;
}

/**
 * The folded metal roof: a pitched solid in the dark bucket, standing seams up each slope, a
 * folded ridge capping, closed verges and a real gutter at both eaves. The seams are the
 * cheapest texture in the lane and the whole difference between folded metal and a grey lid.
 */
function foldedRoof(ctx, {
  x = 0, z, width, depth, yBase, height, seam = 0.56, gutters = true,
}) {
  const s = surfacesOf(ctx);
  const ridgeY = yBase + height;
  const zFront = z + depth / 2;
  const zBack = z - depth / 2;
  // The solid closes the gable ends; these weathering skins guarantee both roof pitches
  // remain visible under the standing seams at the steep board camera.
  ctx.push([
    skillion(width, 0.14, x, z, ridgeY + 0.02, zFront, yBase + 0.02, 'roof-skin-front'),
    skillion(width, 0.14, x, z, ridgeY + 0.02, zBack, yBase + 0.02, 'roof-skin-back'),
  ], s.brick);

  if (ctx.mid) {
    const n = Math.max(2, Math.round(width / (ctx.detail ? seam : seam * 1.7)));
    const geos = [];
    for (let i = 0; i <= n; i += 1) {
      const sx = x - width / 2 + (width * i) / n;
      geos.push(skillion(0.055, 0.05, sx, z, ridgeY + 0.035, zFront, yBase + 0.035, 'roof-seam'));
      geos.push(skillion(0.055, 0.05, sx, z, ridgeY + 0.035, zBack, yBase + 0.035, 'roof-seam'));
    }
    // Barge boards close both verges: a fold that runs off the end of the roof and stops in
    // mid-air is exactly the thing §2.1 names.
    for (const side of [-1, 1]) {
      const bx = x + side * (width / 2 + 0.04);
      geos.push(skillion(0.11, 0.12, bx, z, ridgeY + 0.07, zFront, yBase + 0.07, 'barge'));
      geos.push(skillion(0.11, 0.12, bx, z, ridgeY + 0.07, zBack, yBase + 0.07, 'barge'));
    }
    ctx.push(geos, s.brick);
  }
  ctx.push(slab(width + 0.14, 0.08, 0.32, x, ridgeY - 0.035, z, 'ridge-fold'), s.brick);

  if (gutters) {
    for (const [zg, back] of [[zFront + 0.03, false], [zBack - 0.03, true]]) {
      const run = gutterRun(ctx, {
        x, y: yBase + 0.07, z: zg, length: width + 0.10,
        style: 'quad', depth: 0.14, fascia: true, fasciaDrop: 0.18,
      });
      if (back) turnBundle(run, { x, z: zg, angle: Math.PI });
      det(ctx, run);
    }
  }
}

/**
 * A dormer: the front wall carried up through the roof as a charcoal box with a window in it
 * and a metal capping. In the reference row these are what break a long roof into units.
 */
function dormer(ctx, { x, zFace, width, yBase, height, depth = 0.64 }) {
  const s = surfacesOf(ctx);
  const win = hole(x, yBase + 0.42, width - 0.92, height - 0.86);
  volume(ctx, {
    material: s.brick, x, zFront: zFace, zBack: zFace - depth, width,
    y0: yBase, y1: yBase + height, depth: 0.20, front: [win], name: 'dormer',
  });
  windowUnit(ctx, {
    plane: zFace, u: win.u, y: win.y, width: win.width, height: win.height,
    reveal: 0.14, mullions: 1, sill: false, lean: true,
  });
  ctx.push(slab(width + 0.18, 0.10, depth + 0.18, x, yBase + height, zFace - depth / 2 + 0.05, 'dormer-cap'), s.brick);
  courseLines(ctx, {
    plane: zFace, u: x, run: width, y0: yBase + 0.05, y1: yBase + height - 0.35,
  });
}

/**
 * A parapet with its capping and the roof deck behind it. `fold` steps alternate bays of the
 * street front up, so the skyline has a rhythm — the midrise's signature, and the cheapest
 * silhouette move in the lane.
 */
function parapet(ctx, {
  x = 0, zFront, zBack, width, y, height = 0.95, thickness = 0.26, fold = 0, material = null,
}) {
  const s = surfacesOf(ctx);
  const mat = material ?? s.render;
  const depth = zFront - zBack;
  const zc = (zFront + zBack) / 2;
  ctx.push(slab(width - 0.1, 0.16, depth - 0.1, x, y - 0.16, zc, 'roof-deck'), s.stone);

  for (const [px, pz, w, d] of [
    [x - width / 2 + thickness / 2, zc, thickness, depth],
    [x + width / 2 - thickness / 2, zc, thickness, depth],
    [x, zBack + thickness / 2, width, thickness],
  ]) {
    ctx.push(slab(w, height, d, px, y, pz, 'parapet'), mat);
    ctx.push(slab(w + 0.10, 0.09, d + 0.10, px, y + height, pz, 'parapet-cap'), s.stone);
  }

  const bays = fold > 0 ? Math.max(3, fold | 0) : 1;
  const bayW = width / bays;
  for (let i = 0; i < bays; i += 1) {
    const bx = x - width / 2 + (i + 0.5) * bayW;
    const h = height + (fold > 0 && i % 2 === 0 ? 0.44 : 0);
    ctx.push(slab(bayW + 0.02, h, thickness, bx, y, zFront - thickness / 2, 'parapet-front'), mat);
    ctx.push(slab(bayW + 0.06, 0.09, thickness + 0.14, bx, y + h, zFront - thickness / 2 + 0.05, 'parapet-cap'), s.stone);
    if (fold > 0 && ctx.mid && i % 2 === 0) {
      // The fold's own returns, so a capping that changes height does it over a built
      // upstand rather than for no reason.
      for (const side of [-1, 1]) {
        ctx.push(slab(0.10, 0.44, thickness + 0.14, bx + side * bayW / 2, y + height,
          zFront - thickness / 2 + 0.05, 'fold-return'), s.stone);
      }
    }
  }
}

/** Lift overrun, condensers and a vent stack. Every flat roof on this board is seen from above. */
function rooftopPlant(ctx, { x = 0, z, width, depth, y }) {
  if (!ctx.mid || !(width > 2.2) || !(depth > 1.6)) return;
  const s = surfacesOf(ctx);
  const w = Math.min(width * 0.34, 3.0);
  const d = Math.min(depth * 0.5, 2.6);
  ctx.push(slab(w, 1.75, d, x, y, z, 'lift-overrun'), s.render);
  ctx.push(slab(w + 0.14, 0.10, d + 0.14, x, y + 1.75, z, 'overrun-cap'), s.stone);
  if (!ctx.detail) return;
  const units = [];
  const fans = [];
  for (let i = 0; i < 2; i += 1) {
    const cx = x + w / 2 + 0.78 + i * 1.18;
    units.push(slab(1.02, 0.10, 0.92, cx, y, z - 0.28, 'condenser-pad'));
    units.push(slab(0.90, 0.68, 0.78, cx, y + 0.10, z - 0.28, 'condenser'));
    fans.push(cyl(0.25, 0.05, cx, y + 0.46, z + 0.12, 'z', 'condenser-fan', 8));
  }
  ctx.push(units, s.precast);
  ctx.push(fans, s.dark);
  ctx.push(cyl(0.15, 1.10, x - w / 2 - 0.58, y + 0.55, z + 0.42, 'y', 'vent-stack', 8), s.brick);
}

/* ─────────────────────────────── flanks and services ──────────────────────────────── */

/**
 * The openings a flank or a rear elevation carries, computed before the volume is built so
 * the wall can leave real holes for them rather than have windows pasted on afterwards.
 */
function serviceHoles({ centre, run, storeys, storeyH, y0, windows = 2, door = false, width = 0.80 }) {
  const out = [];
  const n = Math.max(0, windows | 0);
  for (let f = 0; f < storeys; f += 1) {
    for (let i = 0; i < n; i += 1) {
      out.push(hole(centre - run / 2 + (run * (i + 1)) / (n + 1), y0 + f * storeyH + 0.95, width, 1.44));
    }
  }
  if (door) out.push(hole(centre + run / 2 - 1.25, y0 + 0.02, 1.10, 2.16));
  return out;
}

/**
 * §2.1, applied. Every elevation the board can show carries a base course in a second
 * material, a floor band at each level, coursing where it is brick, its punched windows, a
 * louvre and — where it is the rear — a service door on a step. The rear is allowed to be
 * plainer than the front; it is not allowed to be empty.
 */
function serviceElevation(ctx, {
  axis, face, plane, centre, run, storeys, storeyH, y0, brickTo, holes = [], door = false, relief = false,
}) {
  const s = surfacesOf(ctx);
  const at = (o, name) => faceBox(axis, face, plane, o, name);

  ctx.push(at({ u: centre, y: y0 + 0.30, run, height: 0.60, depth: 0.17, set: -0.07 }, 'plinth'), s.brick);
  ctx.push(at({ u: centre, y: y0 + 0.64, run, height: 0.09, depth: 0.21, set: -0.09 }, 'plinth-cap'), s.stone);

  if (brickTo > y0 + 1.1) {
    courseLines(ctx, { axis, face, plane, u: centre, run, y0: y0 + 0.75, y1: brickTo });
  }

  const bands = [];
  for (let i = 1; i < storeys; i += 1) {
    bands.push(at({
      u: centre, y: y0 + i * storeyH, run, height: 0.14, depth: 0.15, set: -0.05,
    }, 'floor-band'));
  }
  ctx.push(bands, s.precast);

  for (const o of holes) {
    if (o.height > 2.0) continue;
    windowUnit(ctx, {
      axis, face, plane, u: o.u, y: o.y, width: o.width, height: o.height,
      reveal: relief ? 0.24 : 0.20, mullions: 0, lean: o.y > y0 + storeyH * 3.2, relief,
    });
  }

  const vent = ventGrille(ctx, {
    x: 0, y: 0, z: 0, width: 0.44, height: 0.30, style: 'louvre', depth: 0.09,
  });
  placeBundle(vent, {
    angle: faceAngle(axis, face),
    x: axis === 'x' ? centre - run / 2 + 0.9 : plane,
    y: y0 + 0.26,
    z: axis === 'x' ? plane : centre - run / 2 + 0.9,
  });
  det(ctx, vent, { trim: 'wallAlt' });

  if (door) {
    const d = holes.find((o) => o.height > 2.0);
    if (d) {
      ctx.push([
        at({ u: d.u, y: d.y + d.height / 2, run: d.width, height: d.height, depth: 0.24, set: 0.16 }, 'svc-back'),
      ], s.dark);
      ctx.push(at({
        u: d.u, y: d.y + d.height / 2, run: d.width - 0.14, height: d.height - 0.06,
        depth: 0.08, set: 0.14,
      }, 'svc-door'), s.brick);
      ctx.push(at({
        u: d.u, y: d.y + 0.035, run: d.width + 0.34, height: 0.07, depth: 0.44, set: -0.12,
      }, 'svc-step'), s.stone);
    }
  }
}

/** Rainwater. Four corners, each pipe starting at an outlet and finishing on a gully. */
function rainwater(ctx, { x = 0, zFront, zBack, width, topY }) {
  const corners = [
    [x - width / 2 + 0.24, zFront - 0.05, 0],
    [x + width / 2 - 0.24, zFront - 0.05, 0],
    [x - width / 2 + 0.24, zBack + 0.05, Math.PI],
    [x + width / 2 - 0.24, zBack + 0.05, Math.PI],
  ];
  for (const [px, pz, angle] of corners) {
    const pipe = downpipe(ctx, {
      x: 0, z: 0, fromY: topY, toY: LOT.rise + 0.02, radius: 0.055, swan: 0.18,
      brackets: ctx.detail ? 3 : 1,
    });
    placeBundle(pipe, { angle, x: px, z: pz });
    det(ctx, pipe);
  }
}

/* ────────────────────────────────── the lot ───────────────────────────────────────── */

/**
 * The lot, with the lane's two repaints. Curtilage hands back parts already painted, so the
 * two buckets this lane spent elsewhere are recoloured rather than added: the gate leaf and
 * the bin lids go dark, and the plant cabinets go pale.
 */
function contemporaryLot(ctx, opts) {
  applySharedWear(ctx, {
    width: ctx.env.bodyW,
    frontZ: opts.frontLimitZ ?? (ctx.env.frontZ - 0.30),
    baseY: BASE_Y,
    salt: 170,
  });
  const parts = composeLot(ctx, { era: 'contemporary', services: true, ...opts });
  for (const part of parts) {
    if (part.material === ctx.p.trim) part.material = ctx.p.iron;
    else if (part.material === ctx.p.joinery) part.material = ctx.p.wall;
    else if (ctx.archetypeId?.startsWith('apartment-') && part.material === ctx.p.wallAlt) {
      part.material = ctx.p.ground;
    }
  }
  emit(ctx, parts);
}

/* ═══════════════════════════════ the townhouse rungs ══════════════════════════════ */

/**
 * Townhouse row — three storeys, three dwellings, party walls INSIDE one parcel.
 *
 * A parcel is one 16-unit tile, so two neighbouring buildings can never be closer than a tile
 * apart and a party wall can never meet ACROSS parcels at this grid. Until `ENVELOPE` gave
 * this archetype a unit count it drew as one detached box with a twelve-metre blank flank, and
 * that is what a critic scored 1.5/10 for street read. So the row is a row inside its own
 * footprint: three narrow frontages, each with its own garage, its own entry, its own balcony
 * on a real bearer, its own wall value and its own pitch, separated by brick party blades that
 * stand proud of the street face and break the roofline. The only exposed flanks are the two
 * ends of the row, which is exactly where a real row shows a party wall.
 *
 * The section is the design: a charcoal brick base holding the garage and the entry, a frame
 * around a recessed first-floor balcony, a third storey above, and a folded metal roof with a
 * dormer per dwelling. Frames alternate pale and charcoal along the row and the two upper
 * storeys run in opposite phase, because ref-06's frontages are a charcoal field with pale
 * rendered frames punched into it in a rhythm — the rhythm is what makes four frontages read
 * as four houses rather than as one long elevation.
 */
function buildTownhouseRow(ctx) {
  const s = surfacesOf(ctx);
  const { storeyH, facade } = ctx.env;
  const width = ctx.env.bodyW;
  const units = ctx.env.units;
  const unitW = width / units;
  const recess = Math.min(1.25, unitW * 0.30);
  const frontZ = ctx.env.frontZ - 0.30;
  const backZ = ctx.env.backZ;
  const bodyD = frontZ - backZ;
  const y0 = BASE_Y;
  const y1 = y0 + storeyH;
  const y2 = y0 + storeyH * 2;
  const y3 = y0 + storeyH * 3;
  const upperZ = frontZ - recess;
  const topZ = frontZ - 0.06;
  const zc = (frontZ + backZ) / 2;
  // The third storey stops short of the rear and the last few metres stay two storeys under a
  // terrace. It is what a three-storey Melbourne townhouse actually does with its back half,
  // and it buys three things at once: the flank gets a real step in silhouette instead of
  // twelve metres at one height, the pitch now spans 7.5 m rather than 11 and reads as a roof
  // rather than as a lid, and the top storey and its roof both cost a third less.
  const wingZ = backZ + Math.min(3.9, (frontZ - backZ) * 0.30);

  // Every dwelling gets the pale render frame around its balcony, because in ref-06 every one
  // of them does — the pale band at first floor is the single strongest value break on the
  // building. What alternates is the storey above it, so the row carries a rhythm without
  // losing the horizontal.
  const phase = facade % 2;
  const topMat = (i) => ((i + phase) % 2 === 0 ? s.brick : s.pale);

  // The frontage setout is derived from the right-hand group inward rather than from
  // fractions of the unit, because `bodyW` carries a façade nudge and a fraction that fits at
  // one variant merges the garage into the front door at another. Overlapping openings do not
  // crash — `openWall` merges their spans — they just delete the pier between them.
  const screenW = Math.min(0.48, unitW * 0.10);
  const doorW = Math.min(1.02, unitW * 0.22);
  const rightGroup = screenW + 0.12 + doorW + 0.18;
  const garageW = Math.min(2.62, unitW - rightGroup - 0.66);
  const uLeft = (i) => -width / 2 + i * unitW;

  const garageXs = [];
  const entryXs = [];
  const screenXs = [];
  const bayXs = [];
  const groundHoles = [];
  for (let i = 0; i < units; i += 1) {
    const u0 = uLeft(i);
    const gx = u0 + 0.24 + garageW / 2;
    const sxu = u0 + unitW - 0.24 - screenW / 2;
    const ex = u0 + unitW - 0.24 - screenW - 0.12 - (doorW + 0.18) / 2;
    garageXs.push(gx);
    entryXs.push(ex);
    screenXs.push(sxu);
    bayXs.push(u0 + unitW / 2);
    groundHoles.push(hole(gx, y0 + 0.02, garageW, 2.34));
    groundHoles.push(hole(ex, y0 + 0.02, doorW + 0.18, 2.42));
  }
  const rearHoles = serviceHoles({
    centre: 0, run: width, storeys: 3, storeyH, y0, windows: 3, door: true,
  });
  // Flank openings are authored here rather than by `serviceHoles`, because the end wall of a
  // row is not a rear elevation: its slots have to clear the chimney breast at the street
  // corner, the mid blade and the ground-storey step, all of which are plane changes and
  // cannot have a window sunk into them.
  const flankHoles = [];
  for (let f = 0; f < 2; f += 1) {
    for (const dz of [2.40, -2.60]) {
      flankHoles.push(hole(zc + dz, y0 + f * storeyH + 0.98, 0.78, 1.46));
    }
  }
  // The top storey only exists over the front block, so its slots sit inside it.
  const flankTopHoles = [];
  for (const dz of [2.40, -1.55]) {
    flankTopHoles.push(hole(zc + dz, y0 + 2 * storeyH + 0.98, 0.78, 1.46));
  }

  /* ── ground: charcoal brick at the street line, one garage and one door per dwelling ── */
  unitStorey(ctx, {
    width, units, zFront: frontZ, zBack: backZ, y0, y1, depth: 0.32,
    carcass: s.brick, matFor: () => s.brick,
    front: groundHoles, back: rearHoles, left: flankHoles, right: flankHoles, name: 'th-base',
  });
  brickRelief(ctx, {
    plane: frontZ, run: width, y0: y0 + 0.10, y1: y1 - 0.12, openings: groundHoles,
  });
  for (let i = 0; i < units; i += 1) {
    garageDoor(ctx, { plane: frontZ, u: garageXs[i], y: y0 + 0.02, width: garageW, height: 2.34 });
    entryDoor(ctx, {
      plane: frontZ, u: entryXs[i], y: y0 + 0.02, width: doorW, height: 2.42,
      reveal: 0.44, sidelight: 0,
    });
    timberScreen(ctx, {
      plane: frontZ, u: screenXs[i], y: y0 + 0.08, width: screenW, height: 2.34,
    });
    streetNumber(ctx, {
      plane: frontZ, u: entryXs[i] - (doorW + 0.18) / 2 - 0.22, y: y0 + 1.74,
      digits: `${ctx.v.int(100, 1, 9)}${2 * i + 1}`, size: 0.24,
    });
  }

  /* ── first: the balcony frame, one per dwelling, alternating in value ───────────────── */
  const cheekW = 0.40;
  const deckW = unitW - cheekW * 2 - 0.06;
  const doorHoles = bayXs.map((bx) => hole(bx, y1 + 0.06, deckW - 0.44, 2.44));
  unitStorey(ctx, {
    width, units, zFront: upperZ, zBack: backZ, y0: y1, y1: y2, depth: 0.30,
    carcass: s.brick, matFor: () => s.pale,
    front: doorHoles, back: rearHoles, left: flankHoles, right: flankHoles, name: 'th-mid',
  });
  for (let i = 0; i < units; i += 1) {
    const bx = bayXs[i];
    const mat = s.pale;
    // Cheeks and header carry forward from the set-back wall to the street line, so the
    // balcony is a room with three sides rather than a shelf bolted to a facade.
    for (const cx of [bx - unitW / 2 + cheekW / 2, bx + unitW / 2 - cheekW / 2]) {
      ctx.push(slab(cheekW, y2 - y1, recess, cx, y1, upperZ + recess / 2, 'balcony-cheek'), mat);
    }
    ctx.push(slab(unitW - 0.30, 0.72, recess + 0.04, bx, y2 - 0.72, upperZ + recess / 2, 'balcony-header'), mat);
    ctx.push(slab(unitW - 0.16, 0.10, recess + 0.20, bx, y2 - 0.02, upperZ + recess / 2 + 0.08, 'header-cap'), s.stone);
    // The soffit. A balcony that is not visibly darker inside than out is a porch drawn on.
    ctx.push(slab(deckW, 0.06, recess - 0.06, bx, y2 - 0.78, upperZ + recess / 2, 'balcony-soffit'), s.dark);

    ctx.push(slab(deckW, 0.12, recess, bx, y1 - 0.06, upperZ + recess / 2, 'balcony-deck'), s.stone);
    // The bearer: a downstand across the opening, landing on the brick wall head below.
    ctx.push(box(deckW + 0.30, 0.34, 0.30, bx, y1 - 0.13, frontZ - 0.16, 'balcony-bearer'), s.precast);
    glazedDoors(ctx, {
      plane: upperZ, u: bx, y: y1 + 0.06, width: deckW - 0.44, height: 2.44, reveal: 0.16,
    });
    ctx.push([
      box(deckW - 0.24, 0.06, 0.06, bx, y1 + 0.08, upperZ - 1.24, 'balcony-room-floor'),
      box(deckW - 0.24, 0.06, 0.06, bx, y2 - 0.80, upperZ - 1.24, 'balcony-room-ceiling'),
    ], s.dark);
    det(ctx, steelBalustrade(ctx, {
      width: deckW - 0.16, x: bx, yBase: y1 + 0.02, z: frontZ - 0.13, height: 1.06, depth: 0.05,
    }));
    contemporaryBayDetails(ctx, {
      x: bx, y: y1 + 0.06, z: upperZ, width: deckW - 0.44, height: 2.44,
      run: deckW, salt: 400 + i,
    });
    if (ctx.detail) {
      const pw = 0.52;
      const px = bx + deckW / 2 - pw / 2 - 0.10;
      ctx.push(slab(pw, 0.34, 0.44, px, y1 + 0.02, frontZ - 0.42, 'balcony-planter'), s.precast);
      ctx.push(slab(pw - 0.12, 0.15, 0.32, px, y1 + 0.34, frontZ - 0.42, 'planter-fill'), ctx.p.foliage);
    }
  }

  /* ── second: the top storey, in the opposite value to the frame below ──────────────── */
  const topHoles = [];
  for (let i = 0; i < units; i += 1) {
    topHoles.push(hole(bayXs[i] - unitW * 0.16, y2 + 0.92, unitW * 0.40, 1.54));
    topHoles.push(hole(bayXs[i] + unitW * 0.29, y2 + 0.92, Math.min(0.60, unitW * 0.13), 1.66));
  }
  unitStorey(ctx, {
    width, units, zFront: topZ, zBack: wingZ, y0: y2, y1: y3, depth: 0.30,
    carcass: s.brick, matFor: topMat,
    front: topHoles, back: rearHoles.filter((o) => o.y > y2 && o.height < 2.0),
    left: flankTopHoles, right: flankTopHoles, name: 'th-top',
  });
  // The rear wing's terrace, and the band that tells the flank where the third storey stops.
  parapet(ctx, {
    zFront: wingZ, zBack: backZ, width, y: y2 - 0.02, height: 0.66,
    thickness: 0.30, material: s.brick,
  });
  if (ctx.mid) {
    ctx.push(slab(width - 0.66, 0.05, wingZ - backZ - 0.66, 0, y2 - 0.16,
      (wingZ + backZ) / 2, 'wing-membrane'), s.dark);
  }
  for (let i = 0; i < units; i += 1) {
    if (topMat(i) !== s.brick) continue;
    brickRelief(ctx, {
      plane: topZ, centre: bayXs[i], run: unitW - 0.36, y0: y2 + 0.14, y1: y3 - 0.16,
      openings: topHoles, sparse: true,
    });
  }
  for (const o of topHoles) {
    windowUnit(ctx, {
      plane: topZ, u: o.u, y: o.y, width: o.width, height: o.height,
      reveal: 0.20, mullions: o.width > 1.2 ? 1 : 0,
    });
  }

  /* ── party blades and the raked roof ───────────────────────────────────────────────── */
  // The pitch covers the front half of the plan and a flat deck covers the rest.
  //
  // A single ridge spanning the whole twelve-metre depth is what the first version drew, and
  // at 2.3 m of rise over 6 m of run it arrived as a flat lid on stilts — the r13 plate reads
  // as three grey sheets, not three roofs. Raising it until the pitch is convincing would put
  // the roof of a townhouse above the parapet of a four-storey apartment block and break the
  // succession ladder, so the pitch is shortened instead of steepened: a real 37° hat over the
  // front rooms, dormers punching through it, and a flat terrace behind that nobody at street
  // level ever sees.
  const roofH = 2.45;
  const roofFrontZ = topZ + 0.20;
  const roofD = roofFrontZ - wingZ;
  const roofZ = roofFrontZ - roofD / 2;
  const stepOf = (i) => (i - (units - 1) / 2) * -0.17;
  const bladeFront = frontZ + 0.13;
  const bladeBack = backZ + 0.10;
  const bladeZ = (bladeFront + bladeBack) / 2;
  const bladeD = bladeFront - bladeBack;
  for (let i = 1; i < units; i += 1) {
    const bx = uLeft(i);
    const top = y3 + roofH * 0.92 + Math.max(stepOf(i - 1), stepOf(i));
    // Over the front block the blade runs to the ridge; over the two-storey wing it drops to
    // the terrace upstand, because a fire wall follows the building it divides.
    ctx.push(slab(0.34, top - y0, bladeFront - wingZ, bx, y0,
      (bladeFront + wingZ) / 2, 'party-blade'), s.brick);
    ctx.push(slab(0.46, 0.10, bladeFront - wingZ + 0.12, bx, top,
      (bladeFront + wingZ) / 2, 'blade-cap'), s.stone);
    ctx.push(slab(0.34, y2 + 0.74 - y0, wingZ - bladeBack, bx, y0,
      (wingZ + bladeBack) / 2, 'wing-blade'), s.brick);
    ctx.push(slab(0.46, 0.10, wingZ - bladeBack + 0.12, bx, y2 + 0.74,
      (wingZ + bladeBack) / 2, 'wing-blade-cap'), s.stone);
  }
  // The two ends take a chimney breast at the street corner instead of a full-depth blade. A
  // blade the depth of the building IS the flank, which is how twelve metres of end wall
  // became one unbroken plane in the plate this round is fixing.
  const breastD = Math.min(2.6, bodyD * 0.22);
  for (const side of [-1, 1]) {
    const bx = side * width / 2;
    const top = y3 + roofH * 0.58 + stepOf(side < 0 ? 0 : units - 1);
    ctx.push(slab(0.50, top - y0, breastD, bx, y0, frontZ - breastD / 2, 'end-breast'), s.brick);
    ctx.push(slab(0.62, 0.10, breastD + 0.12, bx, top, frontZ - breastD / 2, 'breast-cap'), s.stone);
  }

  for (let i = 0; i < units; i += 1) {
    foldedRoof(ctx, {
      x: bayXs[i], z: roofZ, width: unitW - 0.10, depth: roofD,
      yBase: y3 + stepOf(i), height: roofH, seam: 0.58,
    });
  }
  // A rooflight per dwelling on the wing terrace. ref-06 puts flush lights on exactly this
  // plane, and the board camera looks down steeply enough to see them.
  if (ctx.mid) {
    const lights = [];
    const kerbs = [];
    const lz = (wingZ + backZ) / 2 + 0.5;
    for (let i = 0; i < units; i += 1) {
      kerbs.push(slab(1.26, 0.16, 0.92, bayXs[i], y2 - 0.06, lz, 'rooflight-kerb'));
      lights.push(slab(1.10, 0.05, 0.76, bayXs[i], y2 + 0.10, lz, 'rooflight'));
    }
    ctx.push(kerbs, s.precast);
    ctx.push(lights, s.glass);
  }

  /* ── the two exposed flanks ────────────────────────────────────────────────────────── */
  for (const side of [-1, 1]) {
    const plane = side * (width / 2);
    serviceElevation(ctx, {
      axis: 'z', face: side, plane, centre: zc, run: bodyD + 0.30, storeys: 2, storeyH,
      y0, brickTo: 0, holes: flankHoles,
    });
    // The third storey's own band and slots, over the front block only.
    ctx.push(faceBox('z', side, plane, {
      u: (topZ + wingZ) / 2, y: y2, run: topZ - wingZ, height: 0.14, depth: 0.15, set: -0.05,
    }, 'floor-band'), s.precast);
    for (const o of flankTopHoles) {
      windowUnit(ctx, {
        axis: 'z', face: side, plane, u: o.u, y: o.y, width: o.width, height: o.height,
        reveal: 0.20, mullions: 0,
      });
    }
    // Two full-height blades, spaced clear of the slot lines and of the louvre, so the flank
    // arrives at the eye as four bays rather than as one plane. Relief laid flat on the wall
    // cannot do this: the earlier version spent eleven thousand triangles on a brick module
    // here and still read as a printed carpet, because a plane with texture on it is a plane.
    blade(ctx, {
      axis: 'z', face: side, plane, u: zc, y0, y1: y3 + 0.34, width: 0.54, proud: 0.19,
    });
    blade(ctx, {
      axis: 'z', face: side, plane, u: backZ + 1.9, y0, y1: y2 + 0.74, width: 0.46, proud: 0.16,
    });
    // Masonry module on the flank, at brick scale and half-bonded. The earlier version laid a
    // full bond at a 0.72 m module, which is three bricks wide — it cost eleven thousand
    // triangles and read as printed tile. Half the units at half the module costs a fifth of
    // that and reads as raked brickwork, because what the eye is reading is the shadow rhythm.
    brickRelief(ctx, {
      axis: 'z', face: side, plane, centre: zc, run: bodyD - 0.4,
      y0: y0 + 0.72, y1: y2 - 0.16, openings: flankHoles, sparse: true,
    });
    brickRelief(ctx, {
      axis: 'z', face: side, plane, centre: (topZ + wingZ) / 2, run: topZ - wingZ - 0.3,
      y0: y2 + 0.22, y1: y3 - 0.20, openings: flankTopHoles, sparse: true,
    });
    const pipe = downpipe(ctx, {
      x: 0, z: 0, fromY: y3 + roofH + 0.04, toY: LOT.rise + 0.02, radius: 0.055, swan: 0.16,
      brackets: ctx.detail ? 3 : 1,
    });
    placeBundle(pipe, {
      angle: side > 0 ? Math.PI / 2 : -Math.PI / 2, x: plane + side * 0.08, z: zc - 1.35,
    });
    det(ctx, pipe);
  }
  serviceElevation(ctx, {
    axis: 'x', face: -1, plane: backZ, centre: 0, run: width, storeys: 2, storeyH,
    y0, brickTo: 0, holes: rearHoles.filter((o) => o.y < y2), door: true,
  });
  brickRelief(ctx, {
    axis: 'x', face: -1, plane: backZ, run: width, y0: y0 + 0.72, y1: y2 - 0.16,
    openings: rearHoles, sparse: true,
  });
  // The rear wing: the ground storey steps forward over one bay. The rear is allowed to be
  // plainer than the front and is not allowed to be flat, and a real change of plane costs
  // less than the relief that would be needed to fake one.
  elevationStep(ctx, {
    axis: 'x', face: -1, plane: backZ, u0: -width / 2 + 0.16, u1: -width / 4 - 0.95,
    y0: y0 + 0.68, y1: y1 + 0.26, proud: 0.18,
  });
  rainwater(ctx, { zFront: frontZ, zBack: backZ, width, topY: y2 + 0.62 });

  /* ── the lot: one crossover per dwelling, hedged between ───────────────────────────── */
  contemporaryLot(ctx, {
    frontLimitZ: frontZ - 0.05, entryX: entryXs[units - 1], driveway: false,
    planting: 'clipped', path: 'concrete', streetTree: false,
  });
  for (let i = 0; i < units; i += 1) {
    emit(ctx, driveway(ctx, {
      style: 'slab', x: garageXs[i], width: garageW + 0.35, toZ: frontZ - 0.05,
      frontLimitZ: frontZ - 0.05,
    }));
    emit(ctx, crossover(ctx, { x: garageXs[i], width: garageW + 0.55 }));
  }
}

/**
 * Paired townhouse — two storeys, two dwellings, twin gables to the street.
 *
 * `ENVELOPE` calls it paired and now says so in geometry: two mirrored frontages sharing a
 * party wall, each with one garage, one entry and one juliet. It is the rung below the row and
 * has to LOOK like the rung below — two thirds the height, no third storey, no dormers, and a
 * balustrade nobody can stand behind rather than a balcony they can. The silhouette carries
 * the separation: a pair of street-facing gables cannot be mistaken for the row's raked folded
 * roof from any camera the board offers.
 */
function buildTownhousePaired(ctx) {
  const s = surfacesOf(ctx);
  const { storeyH, facade } = ctx.env;
  const width = ctx.env.bodyW;
  const units = ctx.env.units;
  const unitW = width / units;
  const frontZ = ctx.env.frontZ - 0.35;
  const backZ = ctx.env.backZ;
  const bodyD = frontZ - backZ;
  const zc = (frontZ + backZ) / 2;
  const y0 = BASE_Y;
  const y1 = y0 + storeyH;
  const y2 = y0 + storeyH * 2;
  const upperZ = frontZ - 0.46;

  const phase = facade % 2;
  const upperMat = (i) => ((i + phase) % 2 === 0 ? s.pale : s.brick);

  // Mirrored, so the two garages sit at the outside of the pair and the two front doors meet
  // at the party wall. That is what a Melbourne dual occupancy does, and it puts the two
  // crossovers where a driveway can actually reach them.
  const garageW = Math.min(2.66, unitW * 0.38);
  const doorW = Math.min(1.06, unitW * 0.15);
  const screenW = Math.min(0.50, unitW * 0.075);
  const out = (i) => (i === 0 ? -1 : 1);
  const uMid = (i) => -width / 2 + (i + 0.5) * unitW;

  const garageXs = [];
  const entryXs = [];
  const screenXs = [];
  const windowXs = [];
  const windowWs = [];
  const groundHoles = [];
  for (let i = 0; i < units; i += 1) {
    const m = out(i);
    const gx = uMid(i) + m * (unitW / 2 - 0.30 - garageW / 2);
    const sxu = uMid(i) - m * (unitW / 2 - 0.32 - screenW / 2);
    const ex = uMid(i) - m * (unitW / 2 - 0.32 - screenW - 0.14 - (doorW + 0.42) / 2);
    // The remaining pier between the garage and the entry takes the living-room window, sized
    // from the measured gap so it can never grow into either opening.
    const gapA = gx - m * (garageW / 2);
    const gapB = ex + m * ((doorW + 0.42) / 2);
    const winW = Math.min(1.95, Math.abs(gapB - gapA) - 0.44);
    garageXs.push(gx);
    entryXs.push(ex);
    screenXs.push(sxu);
    windowXs.push((gapA + gapB) / 2);
    windowWs.push(winW);
    groundHoles.push(hole(gx, y0 + 0.02, garageW, 2.38));
    groundHoles.push(hole(ex, y0 + 0.02, doorW + 0.42, 2.44));
    if (winW > 0.6) groundHoles.push(hole((gapA + gapB) / 2, y0 + 0.94, winW, 1.60));
  }
  const rearHoles = serviceHoles({
    centre: 0, run: width, storeys: 2, storeyH, y0, windows: 3, door: true,
  });
  const flankHoles = [];
  for (let f = 0; f < 2; f += 1) {
    for (const dz of [2.20, -2.20]) {
      flankHoles.push(hole(zc + dz, y0 + f * storeyH + 0.96, 0.78, 1.44));
    }
  }

  /* ── ground: charcoal brick, mirrored openings ─────────────────────────────────────── */
  unitStorey(ctx, {
    width, units, zFront: frontZ, zBack: backZ, y0, y1, depth: 0.32,
    carcass: s.brick, matFor: () => s.brick,
    front: groundHoles, back: rearHoles, left: flankHoles, right: flankHoles, name: 'pair-base',
  });
  brickRelief(ctx, {
    plane: frontZ, run: width, y0: y0 + 0.10, y1: y1 - 0.12, openings: groundHoles,
    course: 0.19, brick: 0.42,
  });
  for (let i = 0; i < units; i += 1) {
    garageDoor(ctx, { plane: frontZ, u: garageXs[i], y: y0 + 0.02, width: garageW, height: 2.38 });
    entryDoor(ctx, {
      plane: frontZ, u: entryXs[i], y: y0 + 0.02, width: doorW, height: 2.44,
      reveal: 0.42, sidelight: 0.36,
    });
    timberScreen(ctx, {
      plane: frontZ, u: screenXs[i], y: y0 + 0.08, width: screenW, height: 2.36,
    });
    if (windowWs[i] > 0.6) {
      windowUnit(ctx, {
        plane: frontZ, u: windowXs[i], y: y0 + 0.94, width: windowWs[i], height: 1.60,
        reveal: 0.24, mullions: 1, head: true,
      });
    }
    streetNumber(ctx, {
      plane: frontZ, u: entryXs[i] - out(i) * ((doorW + 0.42) / 2 + 0.24), y: y0 + 1.78,
      digits: `${ctx.v.int(104, 1, 9)}${2 * i + 1}`, size: 0.24,
    });
    // The entry canopy, on two posts that land on the paving. It is what the pair has instead
    // of the row's recessed loggia, and a porch on posts is the clearest construction-logic
    // statement a small building can make.
    const cw = doorW + screenW + 0.90;
    const cx = (entryXs[i] + screenXs[i]) / 2;
    ctx.push(slab(cw, 0.16, 1.34, cx, y0 + 2.66, frontZ + 0.52, 'entry-canopy'), s.stone);
    ctx.push(slab(cw - 0.14, 0.05, 1.20, cx, y0 + 2.61, frontZ + 0.52, 'canopy-soffit'), s.dark);
    ctx.push(slab(cw + 0.08, 0.07, 1.44, cx, y0 + 2.82, frontZ + 0.52, 'canopy-cap'), s.precast);
    for (const px of [cx - cw / 2 + 0.12, cx + cw / 2 - 0.12]) {
      ctx.push(slab(0.50, 0.15, 0.50, px, y0, frontZ + 1.06, 'canopy-pad'), s.stone);
      ctx.push(box(0.11, 2.66 - 0.02, 0.11, px, y0 + 1.33, frontZ + 1.06, 'canopy-post'), ctx.p.iron);
    }
  }

  /* ── first: cladding set back from the brick, juliets to the street ─────────────────── */
  const upperHoles = [];
  for (let i = 0; i < units; i += 1) {
    upperHoles.push(hole(uMid(i) + out(i) * unitW * 0.20, y1 + 0.56, Math.min(1.80, unitW * 0.26), 2.16));
    upperHoles.push(hole(uMid(i) - out(i) * unitW * 0.24, y1 + 0.94, Math.min(1.26, unitW * 0.19), 1.56));
  }
  unitStorey(ctx, {
    width, units, zFront: upperZ, zBack: backZ, y0: y1, y1: y2, depth: 0.28,
    carcass: s.brick, matFor: upperMat,
    front: upperHoles, back: rearHoles, left: flankHoles, right: flankHoles, name: 'pair-upper',
  });
  for (let i = 0; i < units; i += 1) {
    const a = upperHoles[i * 2];
    const b = upperHoles[i * 2 + 1];
    glazedDoors(ctx, {
      plane: upperZ, u: a.u, y: a.y, width: a.width, height: a.height, reveal: 0.15,
    });
    juliet(ctx, { x: a.u, zWall: upperZ, width: a.width + 0.06, y: a.y });
    windowUnit(ctx, {
      plane: upperZ, u: b.u, y: b.y, width: b.width, height: b.height, reveal: 0.22,
      mullions: 1, head: true,
    });
    contemporaryBayDetails(ctx, {
      x: b.u, y: b.y, z: upperZ, width: b.width, height: b.height,
      run: b.width + 0.55, salt: 420 + i,
    });
    // A band under the cladding, so the set-back storey lands on something.
    ctx.push(slab(unitW - 0.06, 0.20, 0.30, uMid(i), y1 - 0.20, upperZ + 0.15, 'upper-bearer'), s.precast);
    // The projecting box over the garage. A pair reads as a pair from its silhouette long
    // before its detail, and one bay standing 0.55 m forward of the cladding on each half is
    // the cheapest thing that gives the elevation a front-to-back dimension at all.
    const boxX = garageXs[i];
    const boxW = Math.min(2.72, garageW + 0.12);
    const boxZ = upperZ + 0.55;
    const boxHole = hole(boxX, y1 + 0.80, boxW - 1.10, 1.54);
    volume(ctx, {
      material: upperMat(i), x: boxX, zFront: boxZ, zBack: upperZ - 0.02, width: boxW,
      y0: y1 + 0.16, y1: y2 - 0.34, depth: 0.22, front: [boxHole], name: 'oriel',
    });
    windowUnit(ctx, {
      plane: boxZ, u: boxHole.u, y: boxHole.y, width: boxHole.width, height: boxHole.height,
      reveal: 0.18, mullions: 1,
    });
    ctx.push(slab(boxW + 0.16, 0.12, 0.74, boxX, y1 + 0.04, boxZ - 0.30, 'oriel-sill'), s.stone);
    ctx.push(slab(boxW + 0.20, 0.11, 0.80, boxX, y2 - 0.34, boxZ - 0.30, 'oriel-cap'), s.stone);
    ctx.push(slab(boxW - 0.10, 0.06, 0.62, boxX, y1 + 0.16, boxZ - 0.28, 'oriel-soffit'), s.dark);
    // A batten screen beside the juliet. It is the pair's one warm surface above the entry
    // canopy, and it is what stops the upper storey reading as a blank clad panel with two
    // holes in it.
    timberScreen(ctx, {
      plane: upperZ, u: a.u + out(i) * (a.width / 2 + 0.44), y: y1 + 0.56,
      width: 0.62, height: 2.16,
    });
    if (upperMat(i) === s.brick) {
      brickRelief(ctx, {
        plane: upperZ, centre: uMid(i), run: unitW - 0.14, y0: y1 + 0.12, y1: y2 - 0.14,
        openings: upperHoles, sparse: true,
      });
    }
  }

  /* ── twin gables ───────────────────────────────────────────────────────────────────── */
  const gableH = 2.02;
  const gableD = upperZ - backZ + 0.34;
  const gableZ = (upperZ + backZ) / 2 + 0.17;
  for (let i = 0; i < units; i += 1) {
    const gx = uMid(i);
    const gw = unitW - 0.10;
    const gy = y2 + (i === 0 ? 0.11 : 0);
    ctx.push(gableAcross(gw, gableD, gableH, gx, gy, gableZ, 'pair-gable'), s.brick);
    if (ctx.mid) {
      // Seams run down the pitch of a street-facing gable, so it reads as folded metal from
      // the footpath rather than as a striped triangle.
      const n = Math.max(3, Math.round(gableD / (ctx.detail ? 0.52 : 0.9)));
      const len = Math.hypot(gw / 2, gableH);
      const ang = Math.atan2(gableH, gw / 2);
      const geos = [];
      for (let k = 0; k <= n; k += 1) {
        const sz = gableZ - gableD / 2 + (gableD * k) / n;
        for (const side of [-1, 1]) {
          geos.push(rotBox(len, 0.05, 0.055, gx + side * gw / 4, gy + gableH / 2 + 0.03, sz,
            { z: side > 0 ? -ang : ang }, 'gable-seam'));
        }
      }
      ctx.push(geos, s.brick);
      // Barge boards on the street verge: the gable end is closed, not cut off.
      for (const side of [-1, 1]) {
        ctx.push(rotBox(len + 0.12, 0.13, 0.14, gx + side * gw / 4, gy + gableH / 2 + 0.06,
          upperZ + 0.19, { z: side > 0 ? -ang : ang }, 'gable-barge'), s.stone);
      }
    }
    ctx.push(box(0.20, 0.10, gableD + 0.06, gx, gy + gableH + 0.02, gableZ, 'gable-ridge'), s.brick);
    det(ctx, gutterRun(ctx, {
      x: gx, y: gy + 0.10, z: upperZ + 0.21, length: gw * 0.46,
      style: 'quad', depth: 0.13, fascia: true, fasciaDrop: 0.16,
    }));
  }

  /* ── the party line and the two ends ───────────────────────────────────────────────── */
  const bladeFront = frontZ + 0.13;
  const bladeBack = backZ + 0.10;
  const bladeZ = (bladeFront + bladeBack) / 2;
  for (let i = 1; i < units; i += 1) {
    const bx = -width / 2 + i * unitW;
    const top = y2 + gableH * 0.64;
    ctx.push(slab(0.34, top - y0, bladeFront - bladeBack, bx, y0, bladeZ, 'party-blade'), s.brick);
    ctx.push(slab(0.46, 0.10, bladeFront - bladeBack + 0.12, bx, top, bladeZ, 'blade-cap'), s.stone);
  }
  const breastD = Math.min(2.4, bodyD * 0.20);
  for (const side of [-1, 1]) {
    const bx = side * width / 2;
    const top = y2 + 0.54;
    ctx.push(slab(0.48, top - y0, breastD, bx, y0, frontZ - breastD / 2, 'end-breast'), s.brick);
    ctx.push(slab(0.60, 0.10, breastD + 0.12, bx, top, frontZ - breastD / 2, 'breast-cap'), s.stone);

    const plane = side * (width / 2);
    serviceElevation(ctx, {
      axis: 'z', face: side, plane, centre: zc, run: bodyD, storeys: 2, storeyH,
      y0, brickTo: 0, holes: flankHoles,
    });
    blade(ctx, {
      axis: 'z', face: side, plane, u: zc, y0, y1: y2 + 0.22, width: 0.52, proud: 0.19,
    });
    blade(ctx, {
      axis: 'z', face: side, plane, u: backZ + 1.9, y0, y1: y2, width: 0.44, proud: 0.16,
    });
    brickRelief(ctx, {
      axis: 'z', face: side, plane, centre: zc, run: bodyD - 0.4,
      y0: y0 + 0.72, y1: y1 - 0.16, openings: flankHoles,
    });
    brickRelief(ctx, {
      axis: 'z', face: side, plane, centre: zc, run: bodyD - 0.4,
      y0: y1 + 0.10, y1: y2 - 0.16, openings: flankHoles, sparse: true,
    });
    const pipe = downpipe(ctx, {
      x: 0, z: 0, fromY: y2 + 0.04, toY: LOT.rise + 0.02, radius: 0.055, swan: 0.16,
      brackets: ctx.detail ? 2 : 1,
    });
    placeBundle(pipe, {
      angle: side > 0 ? Math.PI / 2 : -Math.PI / 2, x: plane + side * 0.08, z: zc - 1.30,
    });
    det(ctx, pipe);
  }
  serviceElevation(ctx, {
    axis: 'x', face: -1, plane: backZ, centre: 0, run: width, storeys: 2, storeyH,
    y0, brickTo: y1 - 0.2, holes: rearHoles, door: true,
  });
  elevationStep(ctx, {
    axis: 'x', face: -1, plane: backZ, u0: -width / 2 + 0.16, u1: -width / 4 - 0.95,
    y0: y0 + 0.68, y1: y1 + 0.22, proud: 0.18,
  });
  brickRelief(ctx, {
    axis: 'x', face: -1, plane: backZ, run: width, y0: y0 + 0.72, y1: y2 - 0.16,
    openings: rearHoles, sparse: true,
  });
  // The rear lean-to. Every one of these has a laundry stuck on the back, and it is the one
  // thing that stops the rear elevation being a rectangle with windows in it.
  {
    const leanD = Math.min(1.5, (frontZ - backZ) * 0.12);
    const leanW = width * 0.56;
    const leanHigh = y0 + storeyH - 0.30;
    ctx.push(box(leanW, leanHigh - y0, leanD, width * 0.06, (y0 + leanHigh) / 2,
      backZ - leanD / 2, 'lean-to'), s.brick);
    ctx.push(skillion(leanW + 0.20, 0.11, width * 0.06, backZ, leanHigh,
      backZ - leanD - 0.16, leanHigh - 0.46, 'lean-to-roof'), s.brick);
    ctx.push(slab(leanW + 0.24, 0.11, 0.16, width * 0.06, leanHigh - 0.58,
      backZ - leanD - 0.16, 'lean-to-gutter'), s.precast);
    const dw = 0.94;
    ctx.push(box(dw + 0.16, 2.12, 0.16, width * 0.06 - leanW * 0.28, y0 + 1.06,
      backZ - leanD - 0.04, 'lean-door-reveal'), s.dark);
    ctx.push(box(dw, 2.04, 0.09, width * 0.06 - leanW * 0.28, y0 + 1.02,
      backZ - leanD - 0.10, 'lean-door'), s.timber);
    windowUnit(ctx, {
      axis: 'x', face: -1, plane: backZ - leanD, u: width * 0.06 + leanW * 0.24,
      y: y0 + 1.02, width: 1.12, height: 1.10, reveal: 0.16, mullions: 1,
    });
  }

  // A flue through each pitch. Small, and the only thing on this rung that breaks the ridge
  // line — a twin-gable silhouette with nothing standing off it is a cardboard cut-out.
  if (ctx.mid) {
    for (let i = 0; i < units; i += 1) {
      const fx = uMid(i) - out(i) * unitW * 0.22;
      const fy = y2 + (i === 0 ? 0.11 : 0) + gableH * 0.52;
      ctx.push(slab(0.62, 0.08, 0.72, fx, fy - 0.04, gableZ - gableD * 0.16,
        'flue-flashing'), s.precast);
      ctx.push(slab(0.78, 0.025, 0.86, fx, fy - 0.015, gableZ - gableD * 0.16,
        'flue-roof-halo'), s.dark);
      ctx.push(slab(0.40, 1.16, 0.44, fx, fy, gableZ - gableD * 0.16, 'flue'), s.brick);
      ctx.push(slab(0.52, 0.10, 0.56, fx, fy + 1.16, gableZ - gableD * 0.16, 'flue-cap'), s.stone);
      ctx.push(cyl(0.15, 0.30, fx, fy + 1.34, gableZ - gableD * 0.16, 'y', 'flue-cowl', 8), ctx.p.iron);
    }
  }
  rainwater(ctx, { zFront: frontZ, zBack: backZ, width, topY: y2 + 0.18 });

  contemporaryLot(ctx, {
    frontLimitZ: frontZ - 0.05, entryX: 0, driveway: false, planting: 'clipped',
    path: 'concrete', streetTree: false,
  });
  for (let i = 0; i < units; i += 1) {
    emit(ctx, driveway(ctx, {
      style: 'slab', x: garageXs[i], width: garageW + 0.40, toZ: frontZ - 0.05,
      frontLimitZ: frontZ - 0.05,
    }));
    emit(ctx, crossover(ctx, { x: garageXs[i], width: garageW + 0.60 }));
  }
}

/** P20 I2: sheet appearance on the existing seven-storey, 11.9 m kit envelope. */
function buildMidriseFromSheet(ctx) {
  const {storeys, storeyH, lotW, lotD, backZ} = ctx.env;
  const W=Math.min(ctx.env.bodyW, APARTMENT_SPEC['apartment-midrise'].width);
  const F=ctx.env.frontZ-.30-APARTMENT_SPEC['apartment-midrise'].reach;
  const D=F-backZ, Z=(F+backZ)/2, Y=BASE_Y, H=Y+storeys*storeyH;
  const colours={wall:'#b67b58',wallAlt:'#bfb39c',roof:'#4a4f4c',trim:'#494132',
    iron:'#838363',glass:'#111b19',shadow:'#4e4a43',ground:'#aaa394',foliage:'#637647'};
  const features=[], offsets={}, counts={building:0,lot:0,openings:0,balconies:0,gates:0};
  let site=false;
  // One cached material per role. Preserve the atlas and weather chain; vertex colour
  // supplies course/plant variation without allocating per-brick/per-leaf materials.
  for(const [role,colour] of Object.entries(colours)) {
    const m=ctx.p[role];m.color.set('#ffffff');m.vertexColors=true;m.userData.i2Role=role;
    m.roughness=role==='glass'?.24:.92;m.metalness=role==='glass'?.12:0;
    if(role==='foliage')m.side=THREE.DoubleSide;
    if(!m.userData.abbPalette) {
      m.userData.abbPalette=true; // shared atlas's existing repeat-build guard
      const old=m.onBeforeCompile, oldKey=m.customProgramCacheKey.bind(m);
      m.onBeforeCompile=(shader,renderer)=>{
        old?.(shader,renderer);
        shader.fragmentShader=shader.fragmentShader
          .replace('diffuseColor.rgb *= ddResidentialTargetRatio;', '')
          .replace('diffuseColor *= sampledDiffuseColor;', 'diffuseColor *= vec4(vec3(dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), sampledDiffuseColor.a);');
        if(role==='glass') {
          if(shader.uniforms.ddResidentialShadowFloor)shader.uniforms.ddResidentialShadowFloor.value=.008;
          shader.fragmentShader=shader.fragmentShader.replace(
            'diffuseColor.rgb = mix( ddPaneSill, ddPaneHead, smoothstep( 0.05, 0.95, ddPane ) );',
            'diffuseColor.rgb *= mix(0.65, 1.2, smoothstep(0.05, 0.95, ddPane));');
        }
      };
      m.customProgramCacheKey=()=>`${oldKey()}-i2-vertex-${role}`;
    }
    m.needsUpdate=true;
  }
  const put=(g,role,name=g.name,colour=colours[role])=>{
    // Ends enclosed by rails, heads and sills need no duplicate caps. Ground-contact
    // boxes omit only their buried underside; all externally visible faces remain.
    if(g.type==='BoxGeometry'&&g.index) {
      const ix=Array.from(g.index.array);
      if(/balcony-baluster|reveal-return|opening-mullion/.test(name))g.setIndex(ix.filter((_,i)=>i<12||i>=24));
      else if(site) {
        g.computeBoundingBox();
        if(g.boundingBox.min.y<=Y+.001)g.setIndex(ix.filter((_,i)=>i<18||i>=24));
      }
    }
    if(name==='picket-cap'&&g.index)g.setIndex(Array.from(g.index.array).slice(0,12));
    g.name=`i2-${name}`;const p=g.attributes.position,c=new THREE.Color(colour),a=[];
    const boost={wall:1.65,wallAlt:1.15,foliage:2.3,roof:1.1,ground:1.1}[role]??1;
    const drift=.93+ctx.v.unit(1700+features.length)*.14;
    for(let i=0;i<p.count;i++) {
      const y=p.getY(i),x=p.getX(i),z=p.getZ(i);
      const damp=/wall|shadow/.test(role)?.76+.24*Math.min(1,Math.max(0,(y-Y)/1.4)):1;
      const wear=.96+.04*Math.sin(x*3.1+y*1.3+z*2.7);
      a.push(c.r*boost*drift*damp*wear,c.g*boost*drift*damp*wear,c.b*boost*drift*damp*wear);
    }
    g.setAttribute('color',new THREE.Float32BufferAttribute(a,3));g.computeBoundingBox();
    const tris=(g.index?.count??p.count)/3;counts[site?'lot':'building']+=tris;
    features.push({name:g.name,role,site,triangles:tris,vertexStart:offsets[role]??0,vertexCount:tris*3,
      bounds:[g.boundingBox.min.toArray(),g.boundingBox.max.toArray()]});
    offsets[role]=(offsets[role]??0)+tris*3;ctx.parts.push({geometry:g,material:ctx.p[role]});
  };
  const b=(w,h,d,x,y,z,r,n,c)=>put(slab(w,h,d,x,y,z),r,n,c);
  const face=(axis,sign,plane,u,y,w,h,d,set,role,name)=>put(
    faceBox(axis,sign,plane,{u,y:y+h/2,run:w,height:h,depth:d,set}),role,name);
  const wall=(axis,sign,plane,centre,run,y0,y1,holes,role,name)=>openWall({push:(g)=>put(g,role,name)},
    {axis,face:sign,plane,centre,run,y0,y1,openings:holes,depth:.46});
  const opening=(axis,sign,plane,o)=>{
    counts.openings++;const {u,y,width:w,height:h}=o;
    face(axis,sign,plane,u,y,w,h,.06,.36,'glass','recessed-glass');
    for(const side of [-1,1]) {
      face(axis,sign,plane,u+side*(w/2-.04),y,.08,h,.36,0,'shadow','reveal-return');
      face(axis,sign,plane,u+side*(w/2-.08),y,.12,h,.16,.12,'trim','opening-frame');
    }
    for(const yy of [y,y+h-.12])face(axis,sign,plane,u,yy,w,.12,.16,.12,'trim','opening-frame');
    face(axis,sign,plane,u,y+h-.06,w,.06,.36,0,'shadow','reveal-head');
    face(axis,sign,plane,u,y-.10,w+.22,.12,.34,-.09,'wallAlt','opening-sill');
    face(axis,sign,plane,u,y,.065,h,.10,.20,'trim','opening-mullion');
    if(w>1.5)face(axis,sign,plane,u+w*.30,y+.15,.22,h*.55,.015,.335,'iron','curtain-strip');
  };
  const front=[], sides=[], rear=[];
  const balconyX=W*.22, balconyW=W*.245;
  for(let f=1;f<storeys;f++) {
    const y=Y+f*storeyH;
    for(const x of [-W*.415,W*.415])front.push(hole(x,y+.88,W*.105,1.76));
    front.push(hole(0,y+.15,W*.095,2.60));
    for(const x of [-balconyX,balconyX])front.push(hole(x,y+.08,balconyW*.83,2.48));
  }
  const door=hole(0,Y+.08,1.50,2.62),garage=hole(balconyX+.4,Y+.02,3.25,2.70);
  front.push(door,garage,hole(-balconyX,Y+.8,2.35,1.72));
  for(let f=0;f<storeys;f++)for(const t of [-.26,.26]) {
    sides.push(hole(Z+t*D,Y+f*storeyH+.88,1.0,1.76));
    rear.push(hole(t*W,Y+f*storeyH+.88,1.18,1.76));
  }
  // Actual apertures through all four elevations; dark room core remains behind the panes.
  b(W-.94,H-Y-storeyH-.18,D-.94,0,Y+storeyH,Z,'shadow','interior-core');
  // Leave a usable-depth vehicle recess in the ground core, not a dark card on its face.
  const coreLeft=-W/2+.47,coreRight=W/2-.47;
  const garageLeft=garage.u-garage.width/2,garageRight=garage.u+garage.width/2;
  for(const [a,z] of [[coreLeft,garageLeft],[garageRight,coreRight]])
    b(z-a,storeyH,D-.94,(a+z)/2,Y,Z,'shadow','ground-core-cheek');
  b(garage.width,storeyH,D-2.82,garage.u,Y,(F-2.35+backZ+.47)/2,'shadow','garage-rear-core');
  for(const [axis,sign,plane,centre,run,holes] of [
    ['x',1,F,0,W,front],['x',-1,backZ,0,W,rear],
    ['z',1,W/2,Z,D,sides],['z',-1,-W/2,Z,D,sides]]) {
    wall(axis,sign,plane,centre,run,Y,Y+storeyH,holes,'shadow','stone-plinth-course');
    wall(axis,sign,plane,centre,run,Y+storeyH,H,holes,'wall','brick-wall');
    for(const o of holes)if(o!==garage)opening(axis,sign,plane,o);
    for(let f=1;f<=storeys;f++)face(axis,sign,plane,centre,Y+f*storeyH-.16,run+.10,.16,.22,-.08,'wallAlt','floor-course');
    // Stone joints stop at openings, using the same wall partitioner as the masonry.
    for(let y=Y+.42;y<Y+storeyH-.12;y+=.42)
      wall(axis,sign,plane+.008*sign,centre,run,y,y+.025,holes,'trim','stone-bed-joint');
  }
  counts.openings++; // deep garage portal, counted separately from framed glass units
  b(3.25,2.7,.08,garage.u,Y,F-2.35,'shadow','garage-back');
  b(3.23,.06,2.35,garage.u,Y,F-1.175,'ground','garage-floor');
  // A continuous stair spine between the two balcony stacks, on the same footprint.
  for(const x of [-W*.075,W*.075])b(.34,H-Y,.30,x,Y,F+.07,'wall','stair-pier');
  for(let f=1;f<storeys;f++) {
    const y=Y+f*storeyH;
    for(const x of [-balconyX,balconyX]) {
      counts.balconies++;b(balconyW,.24,1.25,x,y-.16,F+.58,'wallAlt','balcony-deck');
      b(balconyW,.075,.16,x,y-.20,F+1.17,'shadow','balcony-drip');
      const rail=(axis,plane,u,run)=>{
        for(const yy of [y+.18,y+1.04])face(axis,1,plane,u,yy,run,.065,.07,0,'iron','balcony-rail');
        const n=Math.ceil(run/.23);
        for(let i=0;i<=n;i++)face(axis,1,plane,u-run/2+i*run/n,y+.08,.045,1.02,.06,0,'iron','balcony-baluster');
      };
      rail('x',F+1.19,x,balconyW-.10);
      for(const s of [-1,1])rail('z',x+s*(balconyW/2-.04),F+.60,1.16);
      b(.65,.38,.55,x-.75,y+.08,F+.55,'roof','balcony-planter');
      for(let k=0;k<3;k++)put(new THREE.IcosahedronGeometry(.24,0).translate(x-.95+k*.18,y+.56,F+.55),
        'foliage','balcony-leaves');
    }
  }
  b(2.4,.22,1.18,0,Y+2.8,F+.51,'wallAlt','entry-canopy');
  for(const x of [-1.02,1.02])b(.12,2.8,.12,x,Y,F+.88,'trim','canopy-post');
  // Flat seamed membrane, real coping section, standing-seam olive service hut.
  b(W,.16,D,0,H-.16,Z,'roof','roof-deck');
  for(const x of [-W/2+.12,W/2-.12]) {
    b(.24,.43,D,x,H,Z,'shadow','roof-upstand');b(.38,.13,D+.14,x,H+.43,Z,'wallAlt','roof-coping');
  }
  for(const z of [backZ+.12,F-.12]) {
    b(W,.43,.24,0,H,z,'shadow','roof-upstand');b(W+.14,.13,.38,0,H+.43,z,'wallAlt','roof-coping');
  }
  for(let x=-W/2+.65;x<W/2-.3;x+=1.1)b(.035,.045,D-.48,x,H,Z,'iron','roof-seam');
  for(let z=backZ+.8;z<F-.3;z+=1.55)b(W-.48,.027,.026,0,H,z,'iron','roof-cross-seam');
  const hz=Z-.8,hw=2.65,hd=2.2;
  b(hw,1.8,hd,.7,H,hz,'iron','service-hut');b(hw+.18,.12,hd+.18,.7,H+1.8,hz,'wallAlt','hut-cap');
  for(let x=.7-hw/2+.15;x<.7+hw/2;x+=.28)b(.035,1.8,.06,x,H,hz+hd/2+.02,'trim','hut-standing-seam');
  for(let z=hz-hd/2+.15;z<hz+hd/2;z+=.28)b(.06,1.8,.035,.7+hw/2+.02,H,z,'trim','hut-standing-seam');
  b(.68,.64,.045,.8,H+.72,hz+hd/2+.045,'shadow','hut-vent');
  for(let i=0;i<6;i++)b(.60,.035,.06,.8,H+.78+i*.085,hz+hd/2+.075,'iron','vent-louvre');
  for(const [x,z,y] of [[-3,Z,H],[2.1,backZ+1,H],[.0,hz,H+1.92],[1.3,hz,H+1.92]]) {
    put(cyl(.07,.46,x,y+.23,z,'y','vent-stack',6),'iron','vent-stack');
    put(cyl(.12,.06,x,y+.45,z,'y','vent-cap',6),'wallAlt','vent-cap');
  }
  for(const x of [-W/2+.18,W/2-.18]) {
    put(cyl(.065,H-Y,x,(H+Y)/2,backZ-.08,'y','downpipe',6),'iron','downpipe');
    b(.18,.15,.24,x,Y,backZ-.05,'iron','drain-shoe');
  }
  site=true;
  // Closed octagonal tile, with sloping bevel; bottom respects the -0.15 m floor.
  const ring=(inset,y)=>{const x=lotW/2-inset,z=lotD/2-inset,c=.28;
    return [[-x+c,y,-z],[x-c,y,-z],[x,y,-z+c],[x,y,z-c],[x-c,y,z],[-x+c,y,z],[-x,y,z-c],[-x,y,-z+c]];};
  const rings=[ring(0,-.15),ring(0,-.04),ring(.18,Y)],v=[];
  const tri=(a,b,c)=>v.push(...a,...b,...c);
  for(let r=0;r<2;r++)for(let i=0;i<8;i++){const j=(i+1)%8;tri(rings[r][i],rings[r+1][i],rings[r][j]);tri(rings[r][j],rings[r+1][i],rings[r+1][j]);}
  for(let i=1;i<7;i++){tri(rings[2][0],rings[2][i+1],rings[2][i]);tri(rings[0][0],rings[0][i],rings[0][i+1]);}
  const tile=new THREE.BufferGeometry();tile.setAttribute('position',new THREE.Float32BufferAttribute(v,3));tile.computeVertexNormals();put(tile,'shadow','lot-bevel');
  const fenceZ=lotD/2-.85, gateW=1.72;
  // Front footpath and individual gate-to-door pavers; vehicle route is separately jointed.
  for(let x=-lotW/2+.55;x<lotW/2-.3;x+=.92)b(.89,.055,.62,x,Y,lotD/2-.48,'ground','footpath-paver');
  for(let z=F+.30;z<lotD/2-.40;z+=.52)for(const x of [-.43,.43])b(.82,.06,.49,x,Y,z,'ground','entry-paver');
  for(let z=F+.40;z<fenceZ;z+=.68)for(const x of [garage.u-.8,garage.u+.8])b(1.55,.055,.65,x,Y,z,'ground','driveway-paver');
  const railSegment=(a,z0,bx,z1,gate=false)=>{
    const length=Math.hypot(bx-a,z1-z0),angle=-Math.atan2(z1-z0,bx-a),cx=(a+bx)/2,cz=(z0+z1)/2;
    for(const yy of [.35,.92])put(rotBox(length,.075,.085,cx,Y+yy,cz,{y:angle}),gate?'iron':'wallAlt',gate?'gate-rail':'fence-rail');
    const n=Math.floor(length/.19);
    for(let i=0;i<=n;i++) {
      const x=a+(bx-a)*i/n,z=z0+(z1-z0)*i/n;
      b(gate?.045:.075,1.08,gate?.045:.075,x,Y,z,gate?'iron':'wallAlt',gate?'gate-picket':'fence-picket');
      if(!gate)put(new THREE.ConeGeometry(.065,.11,4).rotateY(Math.PI/4).translate(x,Y+1.135,z),'wallAlt','picket-cap');
    }
  };
  for(const [a,bx] of [[-lotW/2+.5,-gateW/2],[gateW/2,garage.u-1.68],[garage.u+1.68,lotW/2-.5]]) {
    if(bx-a<.1)continue;railSegment(a,fenceZ,bx,fenceZ);
    for(let x=a;x<=bx+.01;x+=Math.max(.2,(bx-a)/Math.ceil((bx-a)/1.8))) {
      b(.20,1.24,.20,x,Y,fenceZ,'wallAlt','fence-post');b(.28,.10,.28,x,Y+1.24,fenceZ,'wallAlt','post-cap');
    }
  }
  railSegment(-gateW/2+.08,fenceZ,gateW/2-.08,fenceZ,true);counts.gates++;
  b(.16,.07,.10,.57,Y+.70,fenceZ+.07,'trim','gate-latch');
  const leaves=(x,y,z,r,salt,n=7)=>{
    for(let i=0;i<n;i++) {
      const a=ctx.v.unit(salt+i)*Math.PI*2,rr=r*(.25+.5*ctx.v.unit(salt+i+31));
      const g=new THREE.IcosahedronGeometry(r*.47,0);g.scale(1,.8,1);
      g.translate(x+Math.cos(a)*rr,y+ctx.v.unit(salt+i+51)*r*.45,z+Math.sin(a)*rr);
      put(g,'foliage','leaf-cluster',i%3?'#627044':'#8b8650');
    }
  };
  const beds=[[-3.1,(F+fenceZ)/2,3.7,fenceZ-F-.35],[6.55,Z,.72,D],[-6.55,Z,.72,D]];
  for(const [x,z,w,d] of beds) {
    b(w,.09,d,x,Y,z,'foliage','lawn','#495132');
    const n=5;
    for(let i=0;i<n;i++) {
      const px=x+(ctx.v.unit(1800+i)*.72-.36)*w,pz=z-d*.4+i*d*.8/(n-1);
      leaves(px,Y+.25,pz,.47,1900+i*13,3);
      for(let k=0;k<2;k++)put(rotBox(.026,.31,.065,px+k*.08,Y+.18,pz+.26,{z:(k-1)*.3}),
        'foliage','grass-tuft');
    }
  }
  // Branching trees use intersecting clustered polyhedra with visible gaps, not spheres.
  for(const [x,z] of [[-5.25,F+1.15],[6.55,backZ+2.2]]) {
    b(.14,2.5,.14,x,Y,z,'trim','tree-trunk');
    for(let i=0;i<3;i++) {
      const reach=x>0?.30:.63;
      const angle=i*2.1,dx=Math.cos(angle)*reach,dz=Math.sin(angle)*reach;
      const start=new THREE.Vector3(x,Y+1.3,z),end=new THREE.Vector3(x+dx,Y+2.6+i*.22,z+dz),delta=end.clone().sub(start);
      const g=new THREE.CylinderGeometry(.04,.07,delta.length(),5);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));g.translate(...start.add(end).multiplyScalar(.5).toArray());put(g,'trim','tree-branch');
      leaves(x+dx,Y+2.65+i*.22,z+dz,x>0?.48:.80,2000+i*20,4);
    }
  }
  ctx.i2={counts,features,envelope:{width:W,depth:D,front:F,back:backZ,base:Y,roof:H,storeys},
    revealM:.36,bevelM:.18,gateX:0,doorX:door.u,pathX:0,garageX:garage.u,
    roofPlant:{heightM:2.40,areaM2:(hw+.18)*(hd+.18)+2*.24*.24,
      areaFrac:((hw+.18)*(hd+.18)+2*.24*.24)/(W*D)}};
}

/* ═══════════════════════════════ the apartment rungs ══════════════════════════════ */

/**
 * The four walk-up-to-midrise rungs. They are one family on purpose — a player redeveloping
 * upward should recognise the block getting bigger — but each carries a massing move the one
 * below does not, so they never read as four heights of one box:
 *
 *   low      two-storey brick base; the whole frontage above is a grid of deep loggias in a
 *            charcoal frame, under a heavy oversailing eaves band
 *   permit   the approved scheme: one-storey base, juliets, five narrow bays, panelised
 *            two-tone cladding, a flat parapet and nothing else
 *   mid      volumes that step in plan, projecting balconies with planters, a timber lobby,
 *            a top storey set back behind a roof terrace
 *   midrise  full-height brick piers between the bays and around the corners, a folded
 *            parapet, taller again
 *
 * The widths narrow as the ladder rises. A four-storey block on a fifteen-metre lot really is
 * wider than a seven-storey one — the taller rung buys its height by giving up frontage — and
 * a ladder whose rungs all sit within four hundred millimetres of one width reads as one
 * building at five heights however it is detailed. This is the cheapest separation available
 * and it costs nothing at all.
 */
const APARTMENT_SPEC = Object.freeze({
  'apartment-low': {
    base: 2, bays: 3, balcony: 'loggia', reach: 1.20, fold: 0, crown: 1,
    lobby: 'plain', width: 13.4, piers: false, step: 0, skin: 'loggia',
    cornice: true, cornerPiers: false,
  },
  'apartment-permit': {
    base: 1, bays: 5, balcony: 'juliet', reach: 0, fold: 0, crown: 1,
    lobby: 'plain', width: 12.8, piers: false, step: 0, skin: 'panel',
    cornice: false, cornerPiers: false,
  },
  'apartment-mid': {
    base: 1, bays: 3, balcony: 'projecting', reach: 1.35, fold: 0, crown: 1,
    lobby: 'timber', width: 12.3, piers: false, step: 0.95, skin: 'step',
    cornice: false, cornerPiers: false,
  },
  'apartment-midrise': {
    base: 1, bays: 4, balcony: 'projecting', reach: 1.25, fold: 3, crown: 1,
    lobby: 'timber', width: 11.9, piers: true, step: 0, skin: 'piers',
    cornice: false, cornerPiers: true,
  },
});

function buildApartment(ctx, id) {
  const s = surfacesOf(ctx);
  const flankRelief = ['apartment-low', 'apartment-permit', 'apartment-mid'].includes(id);
  const spec = APARTMENT_SPEC[id];
  const { storeyH, facade, storeys } = ctx.env;
  const width = Math.min(ctx.env.bodyW, spec.width);
  const loggia = spec.balcony === 'loggia';
  const project = spec.balcony === 'projecting';
  // The street limit belongs to the lot; the masonry stands back far enough that whatever
  // this rung throws forward — a balcony, a canopy, a stepped bay — still lands inside it.
  const frontZ = ctx.env.frontZ - 0.30 - (project ? spec.reach : 0) - spec.step;
  const backZ = ctx.env.backZ;
  const zc = (frontZ + backZ) / 2;
  const y0 = BASE_Y;
  const baseTop = y0 + storeyH * spec.base;
  const crownY = y0 + storeyH * (storeys - spec.crown);
  const topY = y0 + storeyH * storeys;
  const bayW = width / spec.bays;
  const bayX = (i) => -width / 2 + (i + 0.5) * bayW;

  // A plan step: the −X bay stands forward of the rest, so the block turns a corner on its
  // own frontage instead of presenting one flat card to the street.
  const stepW = spec.step > 0 ? bayW : 0;
  const stepX = -width / 2 + stepW / 2;
  const stepZ = frontZ + spec.step;
  const inStep = (u) => spec.step > 0 && u <= stepX + stepW / 2;
  const permitOuter = (u) => id === 'apartment-permit'
    && (u < -width / 2 + bayW || u > width / 2 - bayW);
  const planeFor = (u) => (inStep(u) ? stepZ : permitOuter(u) ? frontZ + 0.50 : frontZ);

  const lobbyBay = Math.floor(spec.bays / 2);
  const lobbyX = bayX(lobbyBay);
  const lobbyW = Math.min(3.4, bayW - 0.9);
  const lobbyH = spec.lobby === 'timber' ? storeyH * 1.58 : storeyH * 0.90;
  const loggiaZ = loggia ? frontZ - spec.reach : frontZ;

  const rearHoles = serviceHoles({
    centre: 0, run: width, storeys, storeyH, y0, windows: 3, door: true,
  });
  const sideHoles = serviceHoles({
    centre: zc, run: frontZ - backZ, storeys, storeyH, y0, windows: 2, door: false,
    width: flankRelief ? 1.15 : 0.80,
  });

  /* ── the base ─────────────────────────────────────────────────────────────────── */
  const baseHoles = [];
  for (let i = 0; i < spec.bays; i += 1) {
    if (i === lobbyBay) { baseHoles.push(hole(lobbyX, y0 + 0.02, lobbyW, lobbyH)); continue; }
    baseHoles.push(hole(bayX(i), y0 + 0.95, Math.min(2.5, bayW * 0.58), 1.85));
    if (spec.base > 1) {
      baseHoles.push(hole(bayX(i), y0 + storeyH + 0.95, Math.min(2.5, bayW * 0.58), 1.85));
    }
  }
  volume(ctx, {
    material: s.brick, zFront: frontZ, zBack: backZ, width, y0, y1: baseTop, depth: 0.34,
    front: baseHoles.filter((o) => !inStep(o.u)),
    back: rearHoles, left: sideHoles, right: sideHoles, name: 'ap-base',
  });
  if (spec.step > 0) {
    volume(ctx, {
      material: s.brick, x: stepX, zFront: stepZ, zBack: frontZ - 0.02, width: stepW,
      y0, y1: baseTop, depth: 0.30,
      front: baseHoles.filter((o) => inStep(o.u)), name: 'ap-base-step',
    });
    brickRelief(ctx, {
      plane: stepZ, centre: stepX, run: stepW, y0: y0 + 0.14, y1: baseTop - 0.16,
      openings: baseHoles,
    });
  }
  // The base is charcoal brick on every rung, so every rung gets the module. The frontage
  // takes a full bond at brick scale because a player looks at it from two metres away in the
  // detail view; the three elevations behind take the half bond, which reads as masonry at
  // board altitude for a fifth of the triangles.
  brickRelief(ctx, {
    plane: frontZ, run: width, y0: y0 + 0.12, y1: baseTop - 0.14, openings: baseHoles,
  });
  brickRelief(ctx, {
    axis: 'x', face: -1, plane: backZ, run: width, y0: y0 + 0.12, y1: baseTop - 0.14,
    openings: rearHoles, sparse: true,
  });
  for (const side of [-1, 1]) {
    brickRelief(ctx, {
      axis: 'z', face: side, plane: side * (width / 2), centre: zc,
      run: frontZ - backZ, y0: y0 + 0.12, y1: baseTop - 0.14,
      openings: sideHoles, sparse: id !== 'apartment-low',
    });
  }
  for (const o of baseHoles) {
    if (o.height > 2.6) continue;
    windowUnit(ctx, {
      plane: planeFor(o.u), u: o.u, y: o.y, width: o.width, height: o.height,
      reveal: 0.26, mullions: 1, head: true,
    });
  }

  /* ── the lobby ────────────────────────────────────────────────────────────────── */
  const lobbyZ = planeFor(lobbyX);
  ctx.push(box(lobbyW, lobbyH, 1.00, lobbyX, y0 + lobbyH / 2, lobbyZ - 0.50, 'lobby-recess'), s.dark);
  ctx.push(slab(lobbyW - 0.14, lobbyH - 0.22, 0.10, lobbyX, y0, lobbyZ - 0.97, 'lobby-lining'),
    spec.lobby === 'timber' ? s.timber : s.precast);
  if (spec.lobby === 'timber' && ctx.mid) {
    const battens = [];
    const run = lobbyW - 0.34;
    const n = Math.max(4, Math.round(run / 0.24));
    for (let i = 0; i <= n; i += 1) {
      battens.push(box(0.06, lobbyH - 0.40, 0.06, lobbyX - run / 2 + (run * i) / n,
        y0 + (lobbyH - 0.40) / 2 + 0.20, lobbyZ - 0.88, 'lobby-batten'));
    }
    ctx.push(battens, s.timber);
  }
  glazedDoors(ctx, {
    plane: lobbyZ - 0.56, u: lobbyX, y: y0 + 0.02, width: lobbyW - 0.5,
    height: Math.min(2.58, lobbyH - 0.30), reveal: 0.12, leaves: 2,
  });
  ctx.push(slab(lobbyW + 1.0, 0.20, 1.60, lobbyX, y0 + lobbyH, lobbyZ - 0.30, 'lobby-canopy'), s.stone);
  ctx.push(slab(lobbyW + 1.1, 0.09, 1.72, lobbyX, y0 + lobbyH + 0.20, lobbyZ - 0.30, 'canopy-cap'), s.precast);
  ctx.push(box(lobbyW - 0.42, lobbyH - 0.38, 0.06, lobbyX, y0 + (lobbyH - 0.38) / 2 + 0.20,
    lobbyZ - 0.78, 'lobby-light'), s.timber);
  for (const px of [lobbyX - lobbyW / 2 - 0.40, lobbyX + lobbyW / 2 + 0.40]) {
    ctx.push(slab(0.36, 0.12, 0.36, px, y0, lobbyZ + 0.42, 'canopy-foot'), s.stone);
    ctx.push(box(0.14, lobbyH, 0.14, px, y0 + lobbyH / 2, lobbyZ + 0.42, 'canopy-post'), s.iron);
  }
  ctx.push([
    slab(1.90, 0.07, 0.34, lobbyX, y0 - 0.09, lobbyZ + 0.18, 'lobby-step'),
    slab(2.20, 0.07, 0.34, lobbyX, y0 - 0.16, lobbyZ + 0.50, 'lobby-step'),
  ], s.stone);
  streetNumber(ctx, {
    plane: lobbyZ, u: lobbyX + lobbyW / 2 + 0.56, y: y0 + 1.62,
    digits: `${ctx.v.int(112, 2, 8)}${ctx.v.int(113, 0, 9)}`, size: 0.34,
  });

  /* ── the shaft ────────────────────────────────────────────────────────────────── */
  const shaftHoles = [];
  const stepHoles = [];
  const balconies = [];
  for (let f = spec.base; f < storeys - spec.crown; f += 1) {
    const yF = y0 + f * storeyH;
    for (let i = 0; i < spec.bays; i += 1) {
      const bx = bayX(i);
      // The stepped bay carries no balcony. It is already the thing that projects.
      const stepped = inStep(bx);
      const hasBalcony = stepped ? false : (spec.balcony === 'juliet'
        ? i % 2 === 1
        : (spec.bays <= 3 ? true : (i + f) % 2 === 0));
      if (stepped) {
        stepHoles.push(hole(bx, yF + 0.86, Math.min(2.4, bayW * 0.56), 1.86));
      } else if (hasBalcony) {
        const w = Math.min(bayW - 0.74, 3.3);
        shaftHoles.push(hole(bx, yF + 0.10, loggia ? w : w * 0.84, 2.44));
        balconies.push({ f, i, bx, yF, w });
      } else {
        shaftHoles.push(hole(bx, yF + 0.95, Math.min(2.3, bayW * 0.54), 1.74));
      }
    }
  }
  // The shaft is the pale volume, and `pale` rather than `render` because the frontage colour
  // is a coin flip on this table — a charcoal shaft above a charcoal base is the value
  // collapse the whole round is fixing.
  volume(ctx, {
    material: s.pale, zFront: loggiaZ, zBack: backZ, width, y0: baseTop, y1: crownY,
    depth: 0.30, front: shaftHoles, back: rearHoles, left: sideHoles, right: sideHoles,
    name: 'ap-shaft',
  });

  // Permit massing is deliberately not a five-storey card: the two end bays project as
  // shallow bookends and finish in a heavy cap, while the top storey is set back below.
  if (id === 'apartment-permit') {
    for (const i of [0, spec.bays - 1]) {
      const cx = bayX(i);
      openWall(ctx, {
        material: s.brick, axis: 'x', face: 1, plane: frontZ + 0.50, centre: cx,
        run: bayW - 0.08, y0, y1: baseTop, depth: 0.28, openings: baseHoles, name: 'permit-bookend-base',
      });
      openWall(ctx, {
        material: s.pale, axis: 'x', face: 1, plane: frontZ + 0.50, centre: cx,
        run: bayW - 0.08, y0: baseTop, y1: crownY, depth: 0.28, openings: shaftHoles,
        name: 'permit-bookend-shaft',
      });
      ctx.push(faceBox('x', 1, frontZ + 0.50, {
        u: cx, y: crownY + 0.25, run: bayW - 0.02, height: 0.50, depth: 0.42, set: -0.10,
      }, 'permit-bookend-cap'), s.stone);
    }
  }

  // What breaks the pale shaft, per rung. No elevation in ref-11 is one material for its whole
  // height: charcoal brick runs floor to parapet between the pale bays, and the corner is
  // brick where the building turns it.
  // Which bays are dark. The permit block alternates, which is what a panelised facade does
  // and all an approved-but-unbuilt scheme would ever show; the midrise darkens its two end
  // bays, because ref-11's read is charcoal wings around a pale centre. Built through
  // `openWall` so a panel leaves its windows alone — a solid one sealed every opening it
  // covered, which is how the first attempt bricked up half the frontage.
  const darkBay = spec.skin === 'panel'
    ? (i) => i % 2 === 0
    : (spec.skin === 'piers' ? (i) => i === 0 || i === spec.bays - 1 : () => false);
  if (spec.skin === 'panel' || spec.skin === 'piers') {
    for (let i = 0; i < spec.bays; i += 1) {
      if (!darkBay(i)) continue;
      openWall(ctx, {
        material: s.brick, axis: 'x', face: 1, plane: frontZ + 0.09, centre: bayX(i),
        run: bayW - 0.08, y0: baseTop, y1: crownY, depth: 0.17,
        openings: shaftHoles, name: 'clad-panel',
      });
      if (id !== 'apartment-midrise') {
        brickRelief(ctx, {
          plane: frontZ + 0.09, centre: bayX(i), run: bayW - 0.08,
          y0: baseTop + 0.10, y1: crownY - 0.12, openings: shaftHoles, sparse: true,
        });
      }
    }
    // The return onto both flanks. A dark bay that stops dead at the arris tells the eye the
    // charcoal is paint on a card; carried round the corner it tells the eye it is the wall.
    for (const side of [-1, 1]) {
      openWall(ctx, {
        material: s.brick, axis: 'z', face: side, plane: side * (width / 2 + 0.09),
        centre: frontZ - 0.85, run: 1.7, y0: baseTop, y1: crownY, depth: 0.17,
        openings: sideHoles, name: 'clad-return',
      });
    }
  }
  if (spec.skin === 'step') {
    // The stepped bay is carried the full height of the shaft in charcoal brick, so the block
    // turns a corner on its own frontage instead of stepping only where the base does. A step
    // that stops at the first floor reads as a podium detail, not as massing.
    volume(ctx, {
      material: s.brick, x: stepX, zFront: stepZ, zBack: frontZ - 0.02, width: stepW,
      y0: baseTop, y1: crownY, depth: 0.28, front: stepHoles, name: 'ap-shaft-step',
    });
    if (id !== 'apartment-mid') brickRelief(ctx, {
      plane: stepZ, centre: stepX, run: stepW, y0: baseTop + 0.14, y1: crownY - 0.18,
      openings: stepHoles,
    });
    for (const o of stepHoles) {
      windowUnit(ctx, {
        plane: stepZ, u: o.u, y: o.y, width: o.width, height: o.height,
        reveal: 0.24, mullions: 1, lean: o.y > y0 + storeyH * 3.4,
      });
    }
    // The two returns down the sides of the step, and the capping that stops it.
    ctx.push(slab(stepW + 0.14, 0.14, spec.step + 0.16, stepX, crownY - 0.14,
      (stepZ + frontZ) / 2 + 0.06, 'step-cap'), s.stone);
  }
  if (id === 'apartment-mid') {
    // One outer frame groups the two occupied balcony stacks. Their existing
    // slabs give the floor rhythm, so no second belt crosses the solid bay.
    // The piers bear on intact base wall and the head meets the terrace edge.
    const frameLeft = -width / 2 + bayW + 0.12;
    const frameRight = width / 2 - 0.23;
    const frameZ = frontZ + 0.02;
    const frameFinish = ctx.p.wallAlt;
    for (const px of [frameLeft, frameRight]) {
      ctx.push(slab(0.46, 0.14, 0.52,
        px, baseTop - 0.14, frameZ, 'living-frame-bearing'), frameFinish);
      ctx.push(slab(0.46, crownY - baseTop - 0.32, 0.48,
        px, baseTop, frameZ, 'living-frame-pier'), frameFinish);
    }
    ctx.push(slab(frameRight - frameLeft + 0.46, 0.32, 0.50,
      (frameLeft + frameRight) / 2, crownY - 0.32, frameZ,
      'living-frame-head'), frameFinish);
  }
  if (id === 'apartment-permit') {
    const panelRows = storeys - spec.base;
    panelJoints(ctx, {
      plane: frontZ, run: width, y0: baseTop, rows: panelRows, cols: 13,
      openings: shaftHoles,
    });
    panelJoints(ctx, {
      axis: 'x', face: -1, plane: backZ, run: width, y0: baseTop,
      rows: panelRows, cols: 13, openings: rearHoles,
    });
    for (const side of [-1, 1]) {
      panelJoints(ctx, {
        axis: 'z', face: side, plane: side * (width / 2), centre: zc,
        run: frontZ - backZ, y0: baseTop, rows: panelRows, cols: 13,
        openings: sideHoles,
      });
    }
  }

  // The loggia frame: cheeks on every bay line and a spandrel band at every floor, carried
  // forward from the set-back wall to the street face. Four storeys of deep shaded openings
  // is a different building from four storeys of punched windows, and it costs eleven slabs.
  if (loggia) {
    for (let i = 0; i <= spec.bays; i += 1) {
      const px = -width / 2 + i * bayW;
      const w = i === 0 || i === spec.bays ? 0.56 : 0.48;
      const cx = i === 0 ? px + w / 2 - 0.02 : (i === spec.bays ? px - w / 2 + 0.02 : px);
      // The cheeks are brick, not render. A pale frame around a pale wall is a drawing of a
      // loggia; a charcoal frame around a pale spandrel is the grid ref-11 reads as one.
      ctx.push(slab(w, crownY - baseTop, spec.reach, cx, baseTop, loggiaZ + spec.reach / 2, 'loggia-cheek'), s.brick);
      ctx.push(slab(w + 0.12, 0.10, spec.reach + 0.14, cx, crownY, loggiaZ + spec.reach / 2 + 0.06, 'cheek-cap'), s.stone);
    }
    for (let f = spec.base; f <= storeys - spec.crown; f += 1) {
      const yF = y0 + f * storeyH;
      ctx.push(slab(width, 0.62, spec.reach + 0.04, 0, yF - 0.62, loggiaZ + spec.reach / 2, 'loggia-band'), s.pale);
      ctx.push(slab(width + 0.10, 0.09, spec.reach + 0.16, 0, yF - 0.02, loggiaZ + spec.reach / 2 + 0.06, 'loggia-band-cap'), s.stone);
      // The reveal at the head of every loggia. It is the one surface on this rung guaranteed
      // to be in shade whatever the sun does, and it is what makes an opening read as deep.
      ctx.push(slab(width - 0.2, 0.07, spec.reach - 0.08, 0, yF - 0.70, loggiaZ + spec.reach / 2, 'loggia-soffit'), s.dark);
    }
  }

  for (let f = spec.base; f < storeys - spec.crown; f += 1) {
    const yF = y0 + f * storeyH;
    if (!loggia && id !== 'apartment-mid') {
      det(ctx, stringCourse(ctx, {
        x: 0, y: yF - 0.09, z: frontZ, length: width, height: 0.16, projection: 0.12,
      }), { trim: 'wallAlt' });
    }
  }

  // Full-height piers between the bays: the midrise's vertical expression, and a real one —
  // they stand on a stone offset and finish under a head band rather than floating.
  if (spec.piers) {
    for (let i = 0; i <= spec.bays; i += 1) {
      const px = -width / 2 + i * bayW;
      ctx.push(slab(0.50, crownY - baseTop, 0.40, px, baseTop, frontZ, 'pier'), s.brick);
      ctx.push(slab(0.62, 0.13, 0.50, px, baseTop - 0.13, frontZ + 0.06, 'pier-base'), s.stone);
      ctx.push(slab(0.62, 0.13, 0.50, px, crownY, frontZ + 0.06, 'pier-head'), s.stone);
    }
  }
  // The corner returns. A pier that stops at the arris tells the eye the brick is a stripe
  // painted on the front; a pier that turns the corner tells it the brick is the building.
  if (spec.cornerPiers) {
    for (const side of [-1, 1]) {
      const plane = side * (width / 2);
      for (const u of [frontZ - 0.25, backZ + 0.25]) {
        ctx.push(faceBox('z', side, plane, {
          u, y: (baseTop + crownY) / 2, run: 0.50, height: crownY - baseTop, depth: 0.30,
          set: -0.14,
        }, 'corner-pier'), s.brick);
        ctx.push(faceBox('z', side, plane, {
          u, y: crownY + 0.06, run: 0.62, height: 0.13, depth: 0.44, set: -0.20,
        }, 'corner-pier-head'), s.stone);
      }
    }
  }
  // The oversailing eaves band. The walk-up's crown, and the reason it cannot be mistaken for
  // the permit block with a storey added: a heavy shadow line all the way round the top.
  if (spec.cornice) {
    const eaveY = crownY - 0.62;
    ctx.push([
      slab(width + 0.62, 0.34, (frontZ - backZ) + 0.62, 0, eaveY, zc, 'eaves-band'),
    ], s.brick);
    ctx.push([
      slab(width + 0.78, 0.13, (frontZ - backZ) + 0.78, 0, eaveY + 0.34, zc, 'eaves-cap'),
    ], s.stone);
    ctx.push([
      slab(width + 0.50, 0.07, (frontZ - backZ) + 0.50, 0, eaveY - 0.07, zc, 'eaves-soffit'),
    ], s.dark);
  }

  for (const b of balconies) {
    const lean = b.f >= 3;
    if (project) {
      balconyProjecting(ctx, {
        x: b.bx, zWall: frontZ, reach: spec.reach, width: b.w, y: b.yF + 0.08,
        planter: b.f % 2 === 0, lean, boardRail: id === 'apartment-midrise',
      });
    } else if (loggia) {
      ctx.push(slab(b.w + 0.52, 0.18, spec.reach, b.bx, b.yF - 0.18,
        loggiaZ + spec.reach / 2, 'loggia-deck'), s.stone);
      det(ctx, steelBalustrade(lean ? coarse(ctx) : ctx, {
        width: Math.min(b.w + 0.46, bayW - 0.54), x: b.bx, yBase: b.yF - 0.02,
        z: frontZ - 0.12, height: 1.05, depth: 0.05,
      }));
    } else {
      juliet(ctx, { x: b.bx, zWall: frontZ, width: b.w * 0.84, y: b.yF + 0.12 });
    }
    glazedDoors(ctx, {
      plane: loggia ? loggiaZ : frontZ, u: b.bx, y: b.yF + 0.10,
      width: loggia ? b.w - 0.14 : b.w * 0.84, height: 2.44, reveal: 0.15,
    });
  }
  for (const o of shaftHoles) {
    if (o.height > 2.0) continue;
    windowUnit(ctx, {
      plane: loggia ? loggiaZ : frontZ, u: o.u, y: o.y, width: o.width, height: o.height,
      reveal: 0.24, mullions: 1, lean: o.y > y0 + storeyH * 2.6,
    });
  }

  /* ── the crown ────────────────────────────────────────────────────────────────── */
  if (spec.crown > 0) {
    const setback = 1.30;
    const cw = width - 1.7;
    const czF = frontZ - setback;
    const crownSideHoles = flankRelief ? serviceHoles({
      centre: (czF + backZ + 0.40) / 2, run: czF - backZ - 0.40,
      storeys: 1, storeyH, y0: crownY, width: 1.15,
    }) : [];
    ctx.push(slab(width - 0.2, 0.18, frontZ - backZ - 0.2, 0, crownY - 0.18, zc, 'terrace-deck'), s.stone);
    const crownHoles = [];
    for (let i = 0; i < spec.bays; i += 1) {
      crownHoles.push(hole(bayX(i) * 0.86, crownY + 0.10, Math.min(2.4, bayW * 0.60), 2.36));
    }
    volume(ctx, {
      material: s.pale, zFront: czF, zBack: backZ + 0.40, width: cw, y0: crownY, y1: topY,
      depth: 0.28, front: crownHoles,
      back: rearHoles.filter((o) => o.y > crownY && o.height < 2.0),
      left: crownSideHoles, right: crownSideHoles,
      name: 'ap-crown',
    });
    for (const side of [-1, 1]) for (const o of crownSideHoles) {
      windowUnit(ctx, {
        axis: 'z', face: side, plane: side * cw / 2, u: o.u, y: o.y,
        width: o.width, height: o.height, reveal: 0.24, mullions: 0,
        lean: true, relief: true,
      });
    }
    for (const o of crownHoles) {
      glazedDoors(ctx, {
        plane: czF, u: o.u, y: o.y, width: o.width, height: o.height, reveal: 0.14,
      });
    }
    det(ctx, steelBalustrade(coarse(ctx), {
      width: width - 0.7, x: 0, yBase: crownY, z: frontZ - 0.20, height: 1.05, depth: 0.05,
      style: 'wire',
    }));
    if (id === 'apartment-mid') {
      // The occupied strip is guarded at its front but was open at both short ends.
      // Turn matching rail sections back beside the existing corner planters; their
      // posts meet the front rail and overlap the planter edges without fencing the
      // narrow service ledges around the inset crown.
      for (const side of [-1, 1]) {
        const railX = side * (width / 2 - 0.38);
        const railZ = frontZ - 0.75;
        const section = steelBalustrade(coarse(ctx), {
          width: 1.10, x: railX, yBase: crownY, z: railZ, height: 1.05,
          depth: 0.05, style: 'wire',
        });
        det(ctx, turnBundle(section, { x: railX, z: railZ, angle: Math.PI / 2 }));
      }
    }
    if (ctx.detail) {
      for (const px of [-width / 2 + 1.05, width / 2 - 1.05]) {
        ctx.push(slab(1.30, 0.50, 0.82, px, crownY, frontZ - 0.92, 'terrace-planter'), s.precast);
        ctx.push(slab(1.14, 0.17, 0.66, px, crownY + 0.46, frontZ - 0.92, 'planter-fill'), ctx.p.foliage);
      }
    }
    parapet(ctx, {
      zFront: czF, zBack: backZ + 0.40, width: cw, y: topY, height: 0.80, fold: spec.fold,
    });
    rooftopPlant(ctx, { x: width * 0.14, z: backZ + 2.5, width: cw, depth: 3.0, y: topY });
  } else {
    parapet(ctx, {
      zFront: loggia ? frontZ : frontZ, zBack: backZ, width, y: topY, height: 1.05,
      fold: spec.fold,
    });
    rooftopPlant(ctx, { x: -width * 0.13, z: backZ + 2.7, width, depth: 3.2, y: topY });
  }

  /* ── the other three elevations ───────────────────────────────────────────────── */
  // §2.1: the board shows all four faces of every parcel, so a flank carries a base course, a
  // floor band at every level, a punched window grid, a louvre and — because bands and
  // windows alone still leave one plane — a blade the full height of the shaft at mid span.
  // The midrise already had piers doing that job on its frontage, and the lower rungs are
  // brought up to it here rather than the other way round.
  for (const side of [-1, 1]) {
    const plane = side * (width / 2);
    serviceElevation(ctx, {
      axis: 'z', face: side, plane, centre: zc, run: frontZ - backZ,
      storeys, storeyH, y0, brickTo: 0,
      holes: flankRelief ? sideHoles.filter(o => o.y < crownY) : sideHoles,
      relief: flankRelief,
    });
    if (id === 'apartment-midrise') {
      elevationStep(ctx, {
        axis: 'z', face: side, plane, u0: zc - (frontZ - backZ) * 0.17,
        u1: zc + (frontZ - backZ) * 0.17, y0, y1: topY - 0.18, proud: 0.45,
        material: s.render,
      });
      ctx.push(faceBox('z', side, plane, {
        u: zc, y: topY + 0.18, run: (frontZ - backZ) * 0.34 + 0.18,
        height: 0.36, depth: 0.26, set: -0.49,
      }, 'flank-step-parapet'), s.stone);
      for (const o of sideHoles.filter((h) => h.u > zc - (frontZ - backZ) * 0.17
        && h.u < zc + (frontZ - backZ) * 0.17)) {
        windowUnit(ctx, {
          axis: 'z', face: side, plane: plane + side * 0.49, u: o.u, y: o.y,
          width: o.width, height: o.height, reveal: 0.18, mullions: 0, lean: true,
        });
      }
    }
    for (const [u, w] of [[zc, 0.54], [zc + (frontZ - backZ) * 0.28, 0.44], [zc - (frontZ - backZ) * 0.28, 0.44]]) {
      blade(ctx, {
        axis: 'z', face: side, plane, u, y0,
        // The apartment-mid crown is 0.85 m inside this shaft face. Its old
        // full-height blades continued unsupported beside the roof terrace.
        y1: id === 'apartment-mid' ? crownY : topY - 0.10, width: w,
        proud: flankRelief ? (w > 0.5 ? 0.38 : 0.30) : (w > 0.5 ? 0.19 : 0.16),
        capOverhang: id === 'apartment-mid' ? 0.05 : 0.07,
        capOverlap: id === 'apartment-mid' ? 0.01 : 0,
      });
    }
  }
  if (id === 'apartment-midrise') {
    const ventSide = 1;
    const ventPlane = ventSide * (width / 2);
    const ventZ = zc + (frontZ - backZ) * 0.22;
    const ventY = topY - 0.68;
    ctx.push(cyl(0.20, 0.04, ventPlane + 0.02, ventY, ventZ, 'x', 'extract-flange', 8), s.stone);
    ctx.push(cyl(0.16, 0.22, ventPlane + 0.11, ventY, ventZ, 'x', 'extract-cowl', 8), s.brick);
    ctx.push(cyl(0.13, 0.03, ventPlane + 0.005, ventY, ventZ, 'x', 'extract-grille', 8), s.dark);
    ctx.push(box(0.035, 0.50, 0.07, ventPlane + 0.01, ventY - 0.28, ventZ,
      'extract-grime-streak'), s.dark);
  }
  serviceElevation(ctx, {
    axis: 'x', face: -1, plane: backZ, centre: 0, run: width,
    storeys, storeyH, y0, brickTo: 0, holes: rearHoles, door: true,
  });
  // Clear of the rear window grid, which `serviceHoles` puts on quarter points, and clear of
  // the service door on the right — a blade sunk through an opening is worse than no blade.
  for (const u of [-width * 0.125, width * 0.125]) {
    blade(ctx, {
      axis: 'x', face: -1, plane: backZ, u, y0,
      // The rear crown wall stands 0.40 m inward, so its shaft blades end
      // at the terrace deck rather than rising as detached rear posts.
      y1: id === 'apartment-mid' ? crownY : topY - 0.10, width: 0.50, proud: 0.17,
      capOverhang: id === 'apartment-mid' ? 0.05 : 0.07,
      capOverlap: id === 'apartment-mid' ? 0.01 : 0,
    });
  }
  // These apartment rungs use concealed roof drainage; visible downpipes are only emitted
  // where a gutter outlet and a ground shoe are both in the same elevation.

  contemporaryLot(ctx, {
    frontLimitZ: ctx.env.frontZ - 0.20, entryX: lobbyX, fence: 'palisade',
    driveway: false, planting: 'clipped', path: 'concrete', streetTree: facade % 2 === 1,
  });
}

/* ══════════════════════════════════ the tower ═════════════════════════════════════ */

/**
 * Apartment tower — twelve storeys of curtain wall on a two-storey stone base, under a crown
 * where the fin rhythm steps back.
 *
 * The budget lives or dies here. One floor plate's worth of detail is authored once and
 * repeated; the fins are CONTINUOUS members rather than twelve stacked segments, which is
 * both cheaper and what a fin actually is; and everything a player looks at closely — the
 * base, the canopy, the balconies and the crown — gets the triangles that saves.
 *
 * Stylised on purpose: the bay rhythm is coarser than a real curtain wall and the spandrels
 * deeper, so at board altitude it reads as a piece rather than an architectural render shrunk.
 */
function buildTower(ctx) {
  const s = surfacesOf(ctx);
  const { storeyH, storeys } = ctx.env;
  const width = Math.min(ctx.env.bodyW, 11.9);
  const frontZ = ctx.env.frontZ - 0.30;
  const bodyD = Math.min(ctx.env.bodyD, 11.9);
  const backZ = frontZ - bodyD;
  const zc = (frontZ + backZ) / 2;
  const y0 = BASE_Y;
  const baseTop = y0 + storeyH * 2;
  const crownY = y0 + storeyH * (storeys - 1);
  const topY = y0 + storeyH * storeys;
  const bays = 4;
  const inset = 0.18;
  const shrinkAt = (f) => (f >= storeys - 1 ? 0.64 : 0);

  const faces = [
    { axis: 'x', face: 1, plane: frontZ, centre: 0, run: width },
    { axis: 'x', face: -1, plane: backZ, centre: 0, run: width },
    { axis: 'z', face: 1, plane: width / 2, centre: zc, run: bodyD },
    { axis: 'z', face: -1, plane: -width / 2, centre: zc, run: bodyD },
  ];

  /* ── the expressed base ───────────────────────────────────────────────────────── */
  const lobbyW = 3.9;
  const baseHoles = [
    hole(0, y0 + 0.02, lobbyW, storeyH * 1.52),
    hole(-width * 0.33, y0 + 0.35, 2.60, Math.min(3.40, storeyH - 0.45)),
    hole(width * 0.33, y0 + 0.35, 2.60, Math.min(3.40, storeyH - 0.45)),
    hole(-width * 0.28, y0 + storeyH + 0.45, 2.60, Math.min(2.55, storeyH - 0.75)),
    hole(width * 0.28, y0 + storeyH + 0.45, 2.60, Math.min(2.55, storeyH - 0.75)),
  ];
  const baseRear = serviceHoles({
    centre: 0, run: width, storeys: 2, storeyH, y0, windows: 3, door: true,
  });
  const baseSide = serviceHoles({
    centre: zc, run: bodyD, storeys: 2, storeyH, y0, windows: 3, door: false,
  });
  volume(ctx, {
    material: s.stone, zFront: frontZ, zBack: backZ, width, y0, y1: baseTop, depth: 0.36,
    front: baseHoles, back: baseRear, left: baseSide, right: baseSide, name: 'tower-base',
  });
  // Ashlar: recessed joints on every face of the base. Stone that is not coursed is render.
  const baseOpenings = [baseHoles, baseRear, baseSide, baseSide];
  for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
    const f = faces[faceIndex];
    const holes = baseOpenings[faceIndex];
    const geos = [];
    const rows = Math.floor((baseTop - y0 - 0.4) / 0.62);
    for (let i = 1; i <= rows; i += 1) {
      geos.push(faceBox(f.axis, f.face, f.plane, {
        u: f.centre, y: y0 + 0.1 + i * 0.62, run: f.run, height: 0.05, depth: 0.06, set: 0.01,
      }, 'ashlar-joint'));
      if (ctx.detail) {
        const rowY = y0 + 0.15 + (i - 0.5) * 0.62;
        for (let j = 0; j < 8; j += 1) {
          const jointU = f.centre - f.run / 2 + ((j + 0.5 + (i & 1) * 0.5) * f.run) / 8;
          const blocked = holes.some((o) => (
            jointU > o.u - o.width / 2 && jointU < o.u + o.width / 2
            && rowY + 0.26 > o.y && rowY - 0.26 < o.y + o.height
          ));
          if (blocked) continue;
          geos.push(faceBox(f.axis, f.face, f.plane, {
            u: jointU, y: rowY, run: 0.04, height: 0.52, depth: 0.06, set: 0.01,
          }, 'ashlar-perpend'));
        }
      }
    }
    ctx.push(geos, s.dark);
  }
  for (const o of baseHoles) {
    if (o.height > 3.5) continue;
    windowUnit(ctx, {
      plane: frontZ, u: o.u, y: o.y, width: o.width, height: o.height,
      reveal: 0.30, mullions: 2, head: true,
    });
  }
  // The base is where the triangles belong on this rung. It is two storeys of stone at eye
  // level under twelve storeys nobody can get near, and at 18 026 triangles the tower was the
  // lightest of the seven while being the tallest — under-built exactly where it is looked at.
  // So: a plinth the whole way round, a pier between every opening, and a moulded capping.
  const plinth = [];
  const piers = [];
  const pierCaps = [];
  for (const f of faces) {
    plinth.push(faceBox(f.axis, f.face, f.plane, {
      u: f.centre, y: y0 + 0.34, run: f.run + 0.30, height: 0.68, depth: 0.24, set: -0.11,
    }, 'base-plinth'));
    plinth.push(faceBox(f.axis, f.face, f.plane, {
      u: f.centre, y: y0 + 0.73, run: f.run + 0.38, height: 0.11, depth: 0.30, set: -0.15,
    }, 'plinth-cap'));
  }
  ctx.push(plinth, s.stone);
  for (const f of faces) {
    for (let i = 0; i <= 4; i += 1) {
      const u = f.centre - f.run / 2 + (f.run * i) / 4;
      // The lobby bay is a void, not a pier; a pier standing in the doorway is the kind of
      // thing §2.2 exists to catch.
      if (f.face === 1 && f.axis === 'x' && Math.abs(u) < lobbyW / 2 + 0.30) continue;
      piers.push(faceBox(f.axis, f.face, f.plane, {
        u, y: y0 + (baseTop - y0) / 2 + 0.36, run: 0.62, height: baseTop - y0 - 0.72,
        depth: 0.30, set: -0.15,
      }, 'base-pier'));
      pierCaps.push(faceBox(f.axis, f.face, f.plane, {
        u, y: baseTop - 0.30, run: 0.78, height: 0.14, depth: 0.40, set: -0.21,
      }, 'base-pier-cap'));
    }
  }
  ctx.push(piers, s.stone);
  ctx.push(pierCaps, s.precast);

  // The lobby, its canopy and the number over the door.
  ctx.push(box(lobbyW, storeyH * 1.52, 1.10, 0, y0 + storeyH * 0.76, frontZ - 0.55, 'lobby-recess'), s.dark);
  ctx.push(slab(lobbyW - 0.18, storeyH * 1.42, 0.10, 0, y0, frontZ - 1.06, 'lobby-lining'), s.timber);
  glazedDoors(ctx, {
    plane: frontZ - 0.64, u: 0, y: y0 + 0.02, width: lobbyW - 0.6, height: 2.74,
    reveal: 0.12, leaves: 2,
  });
  ctx.push(slab(lobbyW + 2.0, 0.22, 1.90, 0, y0 + 3.10, frontZ - 0.20, 'entry-canopy'), s.stone);
  ctx.push(slab(lobbyW + 2.1, 0.09, 2.02, 0, y0 + 3.32, frontZ - 0.20, 'canopy-cap'), s.precast);
  if (ctx.mid) {
    for (const hx of [-(lobbyW / 2 + 0.75), lobbyW / 2 + 0.75]) {
      ctx.push(cyl(0.045, 2.10, hx, y0 + 4.15, frontZ + 0.44, 'y', 'canopy-hanger', 6), s.brick);
    }
  }
  ctx.push([
    slab(lobbyW + 0.9, 0.07, 0.36, 0, y0 - 0.09, frontZ + 0.20, 'entry-step'),
    slab(lobbyW + 1.2, 0.07, 0.36, 0, y0 - 0.16, frontZ + 0.54, 'entry-step'),
  ], s.stone);
  streetNumber(ctx, {
    plane: frontZ, u: lobbyW / 2 + 1.40, y: y0 + 1.90,
    digits: `${ctx.v.int(120, 1, 9)}${ctx.v.int(121, 0, 9)}${ctx.v.int(122, 0, 9)}`, size: 0.36,
  });

  /* ── the shaft ────────────────────────────────────────────────────────────────── */
  // A dark core, so any joint between the curtain-wall bands reads as an interior rather
  // than as a hole through the model.
  ctx.push(box(width - 2.6, topY - baseTop, bodyD - 2.6, 0, (baseTop + topY) / 2, zc, 'tower-core'), s.dark);
  const shaftSetback = 0.25;

  for (let f = 2; f < storeys; f += 1) {
    const yF = y0 + f * storeyH;
    const shrink = shrinkAt(f);
    for (const el of faces) {
      const p = el.plane - el.face * (shaftSetback + shrink);
      const run = el.run - (shaftSetback + shrink) * 2;
      // The spandrel is deeper and the glazing band shorter than the first version's.
      //
      // Our plates measure σ 34.5 with 2.1 % of pixels under 64 luminance against the
      // reference's 77.7 and 24.7 %, and on this rung the glass was most of the problem: the
      // shared family sits at envBase 1.42, so a tall unbroken band of it mirrors the sky and
      // arrives as a bright cyan panel however dark its albedo. Half the gap is the post chain
      // and not ours; the half that is ours is area. Less glass, more spandrel, and a shadow
      // reveal under every band.
      ctx.push(faceBox(el.axis, el.face, p, {
        u: el.centre, y: yF + 0.57, run, height: 1.14, depth: 0.36, set: inset,
      }, 'spandrel'), s.dark);
      ctx.push(faceBox(el.axis, el.face, p, {
        u: el.centre, y: yF + 1.20, run: run + 0.06, height: 0.09, depth: 0.30, set: inset - 0.08,
      }, 'spandrel-nose'), s.precast);
      ctx.push(faceBox(el.axis, el.face, p, {
        u: el.centre, y: yF + 2.19, run: run - 0.10, height: 1.90, depth: 0.05, set: inset + 0.08,
      }, 'curtain-glazing'), s.glass);
      ctx.push(faceBox(el.axis, el.face, p, {
        u: el.centre, y: yF + 2.19, run: run - 0.10, height: 0.13, depth: 0.20, set: inset + 0.02,
      }, 'curtain-rail'), s.brick);
      ctx.push(faceBox(el.axis, el.face, p, {
        u: el.centre, y: yF + 3.16, run: run - 0.10, height: 0.10, depth: 0.30, set: inset + 0.08,
      }, 'head-reveal'), s.dark);
      ctx.push(faceBox(el.axis, el.face, p, {
        u: el.centre, y: yF + 3.26, run, height: 0.14, depth: 0.24, set: inset - 0.02,
      }, 'transom'), s.brick);
      // Mullions continue behind the bronze fins. A curtain wall that loses its glazing
      // module above the fourth floor reads as one dark sheet even when the camera is close.
      const mullions = [];
      for (let i = 1; i < bays; i += 1) {
        mullions.push(faceBox(el.axis, el.face, p, {
          u: el.centre - run / 2 + (run * i) / bays, y: yF + 2.19, run: 0.09, height: 1.90,
          depth: 0.13, set: inset,
        }, 'curtain-mullion'));
      }
      ctx.push(mullions, s.brick);
    }
  }

  // Floor slabs read as a stack of edges behind the fins — the only honest way a curtain
  // wall shows the structure it hangs from.
  const edges = [];
  for (let f = 2; f <= storeys; f += 1) {
    const shrink = shrinkAt(f - 1);
    edges.push(box(width - shrink * 2 + 0.10, 0.16, bodyD - shrink * 2 + 0.10, 0,
      y0 + f * storeyH, zc, 'slab-edge'));
  }
  ctx.push(edges, s.precast);

  /* ── the fins ─────────────────────────────────────────────────────────────────── */
  // Bronze anodised, continuous from the base capping to the crown, five to a face. They
  // land on the stone base and finish under a capping, so nothing hangs in the air.
  const finTop = crownY + storeyH * 0.50;
  const fins = [];
  const finTips = [];
  for (const el of faces) {
    for (let i = 0; i <= bays; i += 1) {
      const u = el.centre - el.run / 2 + (el.run * i) / bays;
      fins.push(faceBox(el.axis, el.face, el.plane, {
        u, y: (baseTop + finTop) / 2, run: 0.28, height: finTop - baseTop, depth: 0.44, set: -0.17,
      }, 'fin'));
      if (ctx.mid) {
        finTips.push(faceBox(el.axis, el.face, el.plane, {
          u, y: (baseTop + finTop) / 2, run: 0.12, height: finTop - baseTop, depth: 0.10, set: -0.27,
        }, 'fin-edge'));
      }
    }
  }
  ctx.push(fins, s.timber);
  ctx.push(finTips, s.brick);
  ctx.push([
    slab(width + 0.36, 0.17, bodyD + 0.36, 0, baseTop - 0.17, zc, 'base-capping'),
    slab(width + 0.26, 0.15, bodyD + 0.26, 0, finTop, zc, 'fin-capping'),
  ], s.stone);
  ctx.push([
    slab(width + 0.70, 0.24, bodyD + 0.70, 0, baseTop + 0.02, zc, 'tower-base-cornice'),
    slab(width + 0.82, 0.12, bodyD + 0.82, 0, baseTop + 0.26, zc, 'tower-base-drip'),
  ], s.precast);

  /* ── the balcony bays ─────────────────────────────────────────────────────────── */
  // Every floor above the base, three bays a floor, rotating. ref-12 has balconies on nearly
  // every level and it is what makes the shaft read as dwellings rather than as an office
  // curtain wall in the wrong colour; the previous every-second-floor rhythm left half the
  // tower as flat glass. The recess is cut INTO the wall, so each one is a genuine dark void
  // in the elevation and not a shelf hung off it.
  // The balcony modules repeat through the distant shaft. Low-tier picket spacing retains
  // the recessed residential-bay read while reserving the tower's budget for podium/crown.
  const bctx = boardRepeat(ctx);
  for (let f = 2; f < storeys - 1; f += 1) {
    const yF = y0 + f * storeyH;
    const flip = f % 2 === 0;
    const picks = [
      [faces[0], flip ? 0 : 3],
      [faces[2], flip ? 1 : 2],
      [faces[3], flip ? 2 : 1],
    ];
    for (const [el, i] of picks) {
      const bw = el.run / bays;
      const u = el.centre - el.run / 2 + (i + 0.5) * bw;
      ctx.push(faceBox(el.axis, el.face, el.plane, {
        u, y: yF + 1.90, run: bw - 0.30, height: 2.36, depth: 1.05, set: inset + 0.08,
      }, 'balcony-recess'), s.dark);
      ctx.push(faceBox(el.axis, el.face, el.plane, {
        u, y: yF + 0.48, run: bw - 0.30, height: 0.16, depth: 1.05, set: inset + 0.08,
      }, 'balcony-deck'), s.stone);
      ctx.push(faceBox(el.axis, el.face, el.plane, {
        u, y: yF + 0.36, run: bw - 0.20, height: 0.13, depth: 0.26, set: inset - 0.06,
      }, 'balcony-edge'), s.precast);
      // Close the bay: a dark spandrel below a glazed sliding door, then a glass guard panel
      // just behind the nose. The old slot was an open shelf with no occupant protection.
      ctx.push(faceBox(el.axis, el.face, el.plane, {
        u, y: yF + 0.96, run: bw - 0.38, height: 0.90, depth: 0.16, set: inset + 0.82,
      }, 'balcony-spandrel'), s.dark);
      ctx.push(faceBox(el.axis, el.face, el.plane, {
        u, y: yF + 2.05, run: bw - 0.42, height: 2.10, depth: 0.05, set: inset + 0.18,
      }, 'balcony-sliding-glass'), s.glass);
      ctx.push(faceBox(el.axis, el.face, el.plane, {
        u, y: yF + 1.58, run: bw - 0.38, height: 0.06, depth: 0.09, set: inset + 0.12,
      }, 'balcony-door-head'), s.brick);
      const rail = steelBalustrade(bctx, {
        width: bw - 0.34, x: 0, yBase: 0, z: 0, height: 1.06, depth: 0.05, style: 'vertical',
      });
      placeBundle(rail, {
        angle: faceAngle(el.axis, el.face),
        x: el.axis === 'x' ? u : el.plane - el.face * (inset + 0.14),
        y: yF + 0.56,
        z: el.axis === 'x' ? el.plane - el.face * (inset + 0.14) : u,
      });
      det(ctx, rail);
    }
  }

  /* ── the crown ────────────────────────────────────────────────────────────────── */
  // The other place the budget belongs. A tower is read from the street as a base, a shaft
  // and a top, and the top is the only part of the shaft anyone reads as a shape rather than
  // as a texture. ref-12 steps its crown back behind a stone frame, carries the fin rhythm
  // through it, plants the setback and puts the plant room above that again.
  const cw = width - 1.28;
  const cd = bodyD - 1.28;
  const czF = frontZ - 0.64;
  const czB = backZ + 0.64;
  ctx.push(slab(cw + 0.2, 0.18, bodyD - 1.08, 0, crownY - 0.18, zc, 'crown-deck'), s.stone);
  // The frame the crown sits inside: a heavy band at the setback line, on a shadow reveal.
  ctx.push(slab(width + 0.30, 0.46, bodyD + 0.30, 0, crownY - 0.46, zc, 'crown-band'), s.stone);
  ctx.push(slab(width + 0.16, 0.09, bodyD + 0.16, 0, crownY - 0.55, zc, 'crown-band-reveal'), s.dark);
  parapet(ctx, {
    zFront: czF, zBack: czB, width: cw, y: topY, height: 0.92,
    thickness: 0.26, material: s.stone,
  });
  const crownBandW = cw + 0.60;
  const crownBandD = cd + 0.60;
  ctx.push([
    slab(crownBandW, 1.00, 0.22, 0, topY - 0.50, czF + 0.11, 'crown-termination-front'),
    slab(crownBandW, 1.00, 0.22, 0, topY - 0.50, czB - 0.11, 'crown-termination-back'),
    slab(0.22, 1.00, crownBandD, crownBandW / 2 - 0.11, topY - 0.50, zc, 'crown-termination-right'),
    slab(0.22, 1.00, crownBandD, -crownBandW / 2 + 0.11, topY - 0.50, zc, 'crown-termination-left'),
  ], s.stone);
  // The fins carried through the crown storey, so the vertical rhythm does not simply stop at
  // the setback and leave the top floor reading as a different building parked on this one.
  const crownFins = [];
  const crownFaces = [
    { axis: 'x', face: 1, plane: czF, centre: 0, run: cw },
    { axis: 'x', face: -1, plane: czB, centre: 0, run: cw },
    { axis: 'z', face: 1, plane: cw / 2, centre: zc, run: cd },
    { axis: 'z', face: -1, plane: -cw / 2, centre: zc, run: cd },
  ];
  for (const el of crownFaces) {
    for (let i = 0; i <= bays; i += 1) {
      crownFins.push(faceBox(el.axis, el.face, el.plane, {
        u: el.centre - el.run / 2 + (el.run * i) / bays, y: (crownY + topY) / 2,
        run: 0.24, height: topY - crownY, depth: 0.36, set: -0.15,
      }, 'crown-fin'));
    }
  }
  ctx.push(crownFins, s.timber);
  det(ctx, steelBalustrade(bctx, {
    width: cw - 0.4, x: 0, yBase: crownY, z: frontZ - 0.74, height: 1.02, depth: 0.05,
    style: 'wire',
  }));
  if (ctx.detail) {
    // The setback terrace is planted, which is the one thing that tells the eye it is a floor
    // somebody stands on rather than a ledge left over by the massing.
    for (const px of [-width / 2 + 1.0, width / 2 - 1.0]) {
      ctx.push(slab(1.10, 0.44, 1.30, px, crownY, frontZ - 0.98, 'crown-planter'), s.precast);
      ctx.push(slab(0.94, 0.16, 1.14, px, crownY + 0.40, frontZ - 0.98, 'planter-fill'), ctx.p.foliage);
    }
  }
  rooftopPlant(ctx, { x: 0, z: zc - 1.1, width: cw - 1.0, depth: bodyD - 3.0, y: topY });

  /* ── the other three elevations of the base ───────────────────────────────────── */
  for (const side of [-1, 1]) {
    serviceElevation(ctx, {
      axis: 'z', face: side, plane: side * (width / 2), centre: zc, run: bodyD,
      storeys: 2, storeyH, y0, brickTo: 0, holes: baseSide,
    });
  }
  serviceElevation(ctx, {
    axis: 'x', face: -1, plane: backZ, centre: 0, run: width, storeys: 2, storeyH,
    y0, brickTo: 0, holes: baseRear, door: true,
  });
  rainwater(ctx, { zFront: frontZ, zBack: backZ, width, topY: baseTop - 0.26 });

  contemporaryLot(ctx, {
    frontLimitZ: frontZ + 0.05, entryX: 0, fence: 'palisade', driveway: false,
    planting: 'clipped', path: 'concrete', streetTree: true,
  });
}

/* ═════════════════════════════════ registration ═══════════════════════════════════ */

export const CONTEMPORARY_BUILDERS = Object.freeze({
  'townhouse-row': (ctx) => buildTownhouseRow(ctx),
  'townhouse-paired-single': (ctx) => buildTownhousePaired(ctx),
  'apartment-low': (ctx) => buildApartment(ctx, 'apartment-low'),
  'apartment-mid': (ctx) => buildApartment(ctx, 'apartment-mid'),
  'apartment-midrise': buildMidriseFromSheet,
  'apartment-permit': (ctx) => buildApartment(ctx, 'apartment-permit'),
  'apartment-tower': (ctx) => buildTower(ctx),
});
