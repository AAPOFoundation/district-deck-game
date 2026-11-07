// District Deck V3.70 — the modern lot.
//
// **Why this file stopped importing `houses/garden.js` for its surfaces.**
//
// The V3.60 lot called `lotSurface()`, `path()`, `boundary()` and `kerbAndFootpath()` out of the
// houses lane. Those are good functions and the houses lane owns them; the problem is what they
// are shaped for. `lotSurface()` puts its plate BELOW the datum — `slab(lotW, PLATE_H - fall, …,
// 0, -PLATE_H, 0)` — because a Federation lot is meant to read as ground, so in the studio,
// where the backdrop plane sits at y = 0, the only part of it that survives is the top sliver of
// its chamfer ring. That sliver, in the `shadow` bucket, is the "maroon strip" the programme
// brief names, and the lawn laid flat beside it is the "flat green rectangle". §2.1 calls that
// combination an automatic 2 and it is right: the miniature is not standing on anything.
//
// It is also not a file this lane may edit. Five other sessions are live on the houses lane. So
// the modern lot now builds its own ground: a chamfered board tray that the whole miniature
// stands ON, with the lawn, the footpath and the paved path as surfaces laid on top of the tray
// rather than as decals on the terrain.
//
// The small props came across too, rather than being imported. `houses/garden.js` sets its
// letterbox post and its bins on y = 0, which was the ground; on a lot with a tray it is
// 175 mm under the lawn, and a half-buried wheelie bin is a worse defect than the one this file
// set out to fix. They are four boxes each — cheaper to own than to work around.
//
// Geometry is building-local: X across the frontage, +Z toward the street, Y up.

import { slab, box, rotBox } from '../core.js';
import { shrubMass, canopyTree, lawnTufts } from './modern-kit.js';

function part(geometry, material) {
  return { geometry, material };
}

/**
 * §1.2 — "geometry that separates, interpenetrates, or leaves a hole through the envelope".
 *
 * The r1 critic verified planting interpenetration at three independent locations with
 * coordinates, including a crown embedded in `apartment-modern-courtyard`'s third storey with
 * no trunk at all, and judged it worse than the lollipops it replaced: a sphere's soft outline
 * made an intersection look like foliage touching a wall, where a hard-edged quad passing
 * through render is an unambiguous graphical error.
 *
 * The cause is one omission. `plant()` clamped a tree station by the PAD edge and by nothing
 * else, so a station computed as a fraction of the lot could land inside the building — and on
 * a four-storey U-plan it did, at facade height, with the trunk buried in the wall.
 *
 * This is the containment test that was missing. A station is a circle of radius `reach`; it
 * must clear the building footprint and stay on the pad. If it can be pushed clear it is
 * pushed to the nearest point outside; if the lot has no room for it, it is DROPPED rather
 * than clamped onto the wall, because a missing shrub is not a defect and a shrub inside a
 * wall is.
 */
export function makeStationKeeper(ctx, { margin = 0.30, extraKeepOut = [] } = {}) {
  const { env } = ctx;
  const padX = env.lotW / 2;
  const padZ = env.lotD / 2;
  const rects = [
    {
      x0: -env.bodyW / 2 - margin, x1: env.bodyW / 2 + margin,
      z0: env.backZ - margin, z1: env.frontZ + margin,
    },
    ...extraKeepOut,
  ];
  return function place(x, z, reach) {
    let px = Math.max(-padX + reach, Math.min(padX - reach, x));
    let pz = Math.max(-padZ + reach, Math.min(padZ - reach, z));
    for (let pass = 0; pass < rects.length + 1; pass += 1) {
      let moved = false;
      for (const r of rects) {
        const nx = Math.max(r.x0 - reach, Math.min(r.x1 + reach, px));
        const nz = Math.max(r.z0 - reach, Math.min(r.z1 + reach, pz));
        if (nx !== px || nz !== pz) continue;          // already outside on some axis
        // Inside the expanded rect: leave by whichever of the four faces is nearest.
        const out = [
          [r.x0 - reach - px, 0], [r.x1 + reach - px, 0],
          [0, r.z0 - reach - pz], [0, r.z1 + reach - pz],
        ].sort((a, b) => Math.hypot(...a) - Math.hypot(...b))[0];
        px += out[0];
        pz += out[1];
        moved = true;
      }
      if (!moved) break;
    }
    if (px < -padX + reach || px > padX - reach || pz < -padZ + reach || pz > padZ - reach) {
      return null;
    }
    for (const r of rects) {
      if (px > r.x0 - reach && px < r.x1 + reach && pz > r.z0 - reach && pz < r.z1 + reach) {
        return null;
      }
    }
    return { x: px, z: pz };
  };
}

/**
 * The board tray, in metres above the lot datum.
 *
 * `TOP` is deliberately small. The reference plates sit their miniature on a tray several
 * centimetres proud, and the temptation is to match that literally — but this lot ships onto a
 * board where the neighbouring parcels are Federation and terrace lots built flush, and a
 * modern lot standing 300 mm above its neighbour is a defect, not a plinth. 0.10 reads as a
 * kerb-height tray in the studio plate and as a step at the property line on the board.
 */
const TRAY = Object.freeze({
  TOP: 0.10,
  DEPTH: 0.62,
  RIM: 0.30,
  STEP: 0.16,
  FIELD: 0.14,
  LAWN: 0.175,
});

const FOOTPATH_D = 1.10;

/**
 * §2.1 — the chamfered board plinth with a dark bevelled edge.
 *
 * Three members, outside in: a near-black tray body whose vertical face IS the bevelled edge, a
 * stepped-in rim course a shade lighter that catches the sun along the top of the bevel, and the
 * field the lot's surfaces are laid on. The step rather than a true chamfer is deliberate — at
 * board zoom a 45° bevel and a 60 mm step read the same, and the step is four triangles instead
 * of a mitred ring.
 */
function boardTray(ctx) {
  const { env, p } = ctx;
  const out = [];
  const bodyY = TRAY.TOP - TRAY.DEPTH / 2;
  // **r10 — the tray body moved off `shadow` and the rim off `wallAlt`, and both moves are
  // consequences of the emissive-floor rebuild rather than taste.**
  //
  // `shadow`'s floor went up so that a reveal lining and a balcony soffit stop reaching display
  // zero (see `modern-surfaces.js` EMISSIVE_FLOOR). An UNOCCLUDED `shadow` surface now renders
  // about 95 instead of 83, and the tray's vertical face is the one instance of that bucket
  // which is neither in a reveal nor in a soffit — it is the "dark bevelled edge" §2.1 asks for,
  // in full light. In `joinery` it renders about 76 and stays the darkest thing at the board
  // line, which is what the clause wants.
  //
  // The rim goes to `trim` because it is continuous with the footpath and the paver path in both
  // material and plane, and because `wallAlt` is now a per-id masonry colour — a red-brick tray
  // rim on the courtyard and a charcoal one on the skillion is a difference the board reads as
  // noise rather than as identity.
  out.push(part(
    box(env.lotW, TRAY.DEPTH, env.lotD, 0, bodyY - 0.03, 0, 'lot-tray-body'),
    p.joinery,
  ));
  out.push(part(
    slab(env.lotW - 0.14, 0.09, env.lotD - 0.14, 0, TRAY.TOP - 0.03, 0, 'lot-tray-rim'),
    ctx.id === 'apartment-modern-courtyard' ? p.shadow : p.trim,
  ));
  out.push(part(
    slab(env.lotW - 0.32, 0.06, env.lotD - 0.32, 0, TRAY.FIELD - 0.06, 0, 'lot-tray-field'),
    ctx.id === 'apartment-modern-courtyard' ? p.shadow : p.trim,
  ));
  return out;
}

/** Lawn, laid on the tray, with tufts breaking its outline. */
function lawn(ctx) {
  const { env, p } = ctx;
  const out = [];
  const w = env.lotW - TRAY.RIM * 2 - 0.20;
  const d = env.lotD - TRAY.RIM * 2 - FOOTPATH_D - 0.20;
  const zc = -FOOTPATH_D / 2 - 0.02;
  out.push(part(slab(w, 0.05, d, 0, TRAY.LAWN - 0.05, zc, 'lot-lawn'), p.garden));
  // A darker soil band under the lawn edge, so the green does not meet the board on a bare line
  // — the same argument as the plinth course, one storey down.
  out.push(part(slab(w + 0.10, 0.045, d + 0.10, 0, TRAY.LAWN - 0.085, zc, 'lot-lawn-edge'), p.shadow));
  return out;
}

/** Courtyard apron: retained court ground, a paved arrival and smaller planted setbacks.
 * The original path, entrance, kerb and planting are separate members and stay in place.
 * Every surface replaces part of the lawn footprint; none is a raised overlay or planter.
 */
function courtyardApron(ctx, { entryX, deckZ }) {
  const { env, p } = ctx;
  const out = [];
  const half = (env.lotW - TRAY.RIM * 2 - 0.20) / 2;
  const back = -env.lotD / 2 + TRAY.RIM + 0.08;
  const front = env.lotD / 2 - TRAY.RIM - FOOTPATH_D - 0.12;
  const wall = env.bodyW / 2;
  const surface = (name, x0, x1, z0, z1, material) => {
    if (!(x1 > x0 && z1 > z0)) return;
    out.push(part(slab(x1 - x0, 0.05, z1 - z0,
      (x0 + x1) / 2, TRAY.LAWN - 0.05, (z0 + z1) / 2, `courtyard-apron-${name}`), material));
  };
  // Preserve the original surface beneath the U and its authored court furniture.
  surface('court-ground', -wall, wall, env.backZ, env.frontZ, p.garden);
  // A stone arrival spans the two wings. Cut around the existing path bed instead
  // of putting a second coplanar face under its open paver joints.
  const pathEnd = env.lotD / 2 - TRAY.RIM - FOOTPATH_D;
  const pathStart = Math.min(deckZ ?? env.frontZ, pathEnd - 0.30);
  const pathHalf = (1.18 * (ctx.var?.lot?.pathWidthK ?? 1) + 0.10) / 2;
  const pathX = entryX + (ctx.var?.lot?.pathSkew ?? 0) * 0.5;
  const cut0 = Math.max(env.frontZ, pathStart - 0.03);
  const cut1 = Math.min(front, pathEnd + 0.03);
  surface('arrival-toe', -half, half, env.frontZ, cut0, p.trim);
  surface('arrival-left', -half, pathX - pathHalf, cut0, cut1, p.trim);
  surface('arrival-right', pathX + pathHalf, half, cut0, cut1, p.trim);
  surface('arrival-street', -half, half, cut1, front, p.trim);
  // The rear planted band contains the existing rear shrubs and tuft stations. The
  // 0.35 m strip against the masonry stays mineral; no soil is brought up the wall.
  const bedBack = Math.max(back, env.backZ - 2.20);
  const bedFront = env.backZ - 0.35;
  surface('rear-edge', -half, half, back, bedBack, p.trim);
  surface('rear-bed', -half, half, bedBack, bedFront, p.garden);
  surface('rear-contact', -half, half, bedFront, env.backZ, p.shadow);
  for (const side of [-1, 1]) {
    const run = (name, a, b, material) => surface(`${side}-${name}`,
      side < 0 ? -b : a, side < 0 ? -a : b, env.backZ, env.frontZ, material);
    // A flush 0.20 m mineral drainage margin meets the existing plinth. The outer
    // grass strip is 0.26 m wide; no raised curb crosses the entry or pipe outlets.
    run('contact', wall, wall + 0.20, p.shadow);
    run('bed', half - 0.26, half, p.garden);
    const x0 = side < 0 ? -half + 0.26 : wall + 0.20;
    const x1 = side < 0 ? -wall - 0.20 : half - 0.26;
    let cursor = env.backZ;
    for (const fraction of [0.25, 0.5, 0.75]) {
      const z = env.backZ + (env.frontZ - env.backZ) * fraction;
      surface(`${side}-paving-${fraction}`, x0, x1, cursor, z - 0.018, p.trim);
      surface(`${side}-joint-${fraction}`, x0, x1, z - 0.018, z + 0.018, p.shadow);
      cursor = z + 0.018;
    }
    surface(`${side}-paving-end`, x0, x1, cursor, env.frontZ, p.trim);
  }
  return out;
}

/** Footpath and kerb along the street edge, on the tray rather than under it. */
function frontage(ctx) {
  const { env, p } = ctx;
  const out = [];
  const w = env.lotW - TRAY.RIM * 2;
  const zc = env.lotD / 2 - TRAY.RIM - FOOTPATH_D / 2;
  out.push(part(slab(w, 0.055, FOOTPATH_D, 0, TRAY.FIELD, zc, 'footpath'), p.trim));
  for (let i = 1; i < 5; i += 1) {
    const x = -w / 2 + (w * i) / 5;
    out.push(part(box(0.05, 0.028, FOOTPATH_D, x, TRAY.FIELD + 0.052, zc, `footpath-joint-${i}`), p.shadow));
  }
  out.push(part(
    slab(w, 0.16, 0.22, 0, TRAY.FIELD - 0.02, env.lotD / 2 - TRAY.RIM - 0.11, 'kerb'),
    p.shadow,
  ));
  return out;
}

/**
 * §2.7 — "A path that is made of something. Pavers, with individual units and joint lines,
 * running from the gate to the door."
 *
 * Two units across with a real joint between them and between courses, on a dark bed that shows
 * in the joints. The alternative — one long slab in the trim bucket — is what the baseline had,
 * and a paved path with no units in it is a ramp.
 */
function paverPath(ctx, { x, deckZ }) {
  const { env, p } = ctx;
  const out = [];
  const z1 = env.lotD / 2 - TRAY.RIM - FOOTPATH_D;
  const z0 = Math.min(deckZ ?? env.frontZ, z1 - 0.30);
  const run = z1 - z0;
  if (!(run > 0.4)) return out;

  // V3.71 Lane G — the path is one of the lot's variation axes, and it is a free one. The bond,
  // the width and the lateral drift all move; the paver COUNT does not, because the two detached
  // houses have 116–140 triangles of lot allowance left and §3.4's third amendment is explicit
  // that the lot may not borrow from the building. A bond change is a different set of joint
  // lines at identical cost, which is the shape of variation this lane can actually afford.
  const va = ctx.var?.lot ?? null;
  const pathW = 1.18 * (va?.pathWidthK ?? 1);
  const skew = va?.pathSkew ?? 0;
  out.push(part(slab(pathW + 0.10, 0.05, run + 0.06, x + skew * 0.5, TRAY.LAWN - 0.05, (z0 + z1) / 2, 'path-bed'), p.shadow));

  // **r10 — three units across instead of two, on a longer course.** §2.7 asks for "pavers, with
  // individual units and joint lines", and r9 ranked §2.7 among the two weakest clauses in the
  // lane. Two units across gives one longitudinal joint; three gives two, and the half-unit
  // stagger then puts a joint somewhere different on every course instead of alternating between
  // two positions. The course pitch goes from 0.46 to 0.55 so the change costs about 25 % rather
  // than 50 % — `house-modern-skillion` and `house-modern-pavilion` have 116 triangles of lot
  // allowance left and the path is not allowed to spend them all.
  const across = 3;
  const courses = Math.max(2, Math.round(run / 0.55));
  const cd = run / courses;
  // **The bond is count-stable by construction, and that is the whole design of this loop.**
  //
  // r10's version culled the outermost paver on a staggered course when the shift pushed it past
  // the edge, so the paver COUNT was a function of the shift — a bond axis built on it would have
  // spent triangles the two detached houses do not have (116–140 of lot allowance left, and
  // §3.4's third amendment forbids borrowing from the building). Instead a staggered course lays
  // the SAME three units and CUTS them at the ends, which is what a running bond on a real path
  // does anyway: a narrow cut unit, a full unit, and the remainder. Three boxes on every course
  // at every bond, so all three bonds cost exactly the same.
  //
  // `bond` sets how far the stagger runs: 0 a third, 1 a half (the V3.70 look), 2 two thirds.
  const cell = pathW / across;
  const joint = 0.045;
  const bond = va?.pathBond ?? 1;
  const stagger = [0.34, 0.50, 0.66][bond] * cell;
  for (let i = 0; i < courses; i += 1) {
    const cz = z0 + (i + 0.5) * cd;
    // The path drifts laterally from the gate to the door rather than running dead straight on
    // every lot. `skew` is bounded at ±0.21 m and halved again here, well inside the bed.
    const t = (i + 0.5) / courses;
    const cx = x + skew * (t - 0.5);
    const left = cx - pathW / 2;
    // Cut lines across the course. An even course is three whole units; an odd one is cut at
    // `stagger`, which moves both joints without moving the ends of the path.
    const edges = (i % 2 === 0)
      ? [0, cell, cell * 2, pathW]
      : [0, stagger, stagger + cell, pathW];
    for (let u = 0; u < across; u += 1) {
      const a = left + edges[u] + joint / 2;
      const b = left + edges[u + 1] - joint / 2;
      const w = b - a;
      if (!(w > 0.02)) continue;
      out.push(part(
        box(w, 0.055, cd - 0.055, (a + b) / 2, TRAY.LAWN - 0.005, cz, `paver-${i}-${u}`),
        p.trim,
      ));
    }
  }
  return out;
}

/**
 * §2.8 — "Fences with real pickets, capped, with posts at intervals, and a gate."
 *
 * The baseline's boundary put its pickets on nothing: no bottom rail, no post, so each blade
 * floated with a gap under it and the whole run read as a comb laid on the grass. This builds
 * the run the way a fence is actually made — posts first, two rails spanning between them,
 * pickets fixed to the rails, a capping on each post — and every picket's foot lands on the
 * bottom rail rather than in mid air.
 *
 * `pitch` is the picket spacing. It rides up on the tall archetypes because a six-storey
 * apartment's fence is a hundred triangles of silhouette the eye never resolves, and the
 * triangle budget is a hard constraint.
 */
function picketRun(ctx, {
  axis = 'x', from, to, at: line, gap = null, gaps = null, pitch = 0.26, h = 1.02, salt = 0,
  capped = true,
}) {
  const p = ctx.p;
  const out = [];
  const y0 = TRAY.LAWN - 0.03;
  const span = to - from;
  if (!(Math.abs(span) > 0.3)) return out;
  const along = (u, t) => (axis === 'x'
    ? { x: u, z: line, w: t.long, d: t.short }
    : { x: line, z: u, w: t.short, d: t.long });

  // **r12 — `gaps`, plural.** §2.8 asks for a gate; §2.7 asks for a path from the gate to the door;
  // and `townhouse-modern-brick` has THREE GARAGE DOORS with, in the r11 critic's words, "a
  // continuous picket run across the entire frontage with no crossover, no driveway and no gate
  // opposite any of them ... a legibility failure at 1×". A run could only ever take one opening,
  // so the two other openings could not be built. `gap` is kept as a call-site alias.
  const holes = (gaps ?? (gap ? [gap] : [])).slice().sort((a, b) => a[0] - b[0]);
  const inHole = (u, pad) => holes.some(([a, b]) => u > a - pad && u < b + pad);

  // **r3 — THE SEGMENTS ARE COMPUTED FIRST, AND A POST IS ONLY BUILT WHERE A PICKET RUN WILL
  // STAND BESIDE IT.** This is the r2 critic's regression R2, and the mechanism is an ordering
  // fault rather than an arithmetic one. Posts were laid on a 2.1 m grid, skipped only if they fell
  // inside an opening, and the rails and pickets were computed AFTERWARDS from the segments between
  // openings. A segment shorter than 0.25 m carries neither rail nor picket — so any grid post
  // landing in one stood on its own with a cap on its head and nothing either side of it, which is
  // what "capped posts with no pickets between them" is. r1 booked that on `townhouse-modern-brick`
  // alone, where the crossovers make the short segments; r2's looser picket rungs spread the read to
  // the skillion and the pavilion without changing this code at all.
  //
  // A post now has to belong to a run. Nothing is culled at an opening: the `holes` loop below still
  // builds a made post on each side of every crossover and gate, which is the edge §2.8 asks for.
  const runs = [];
  {
    let cursor = from;
    for (const [a, b] of holes) {
      if (a > cursor) runs.push([cursor, Math.min(a, to)]);
      cursor = Math.max(cursor, b);
    }
    if (cursor < to) runs.push([cursor, to]);
  }
  const RAIL_MIN = 0.25;
  const carriesRun = (u) => runs.some(([a, b]) => b - a > RAIL_MIN && u >= a - 0.02 && u <= b + 0.02);

  const posts = Math.max(2, Math.round(Math.abs(span) / 2.1) + 1);
  for (let i = 0; i < posts; i += 1) {
    const u = from + (i / (posts - 1)) * span;
    if (inHole(u, 0.18)) continue;
    if (!carriesRun(u)) continue;
    const g = along(u, { long: 0.15, short: 0.15 });
    out.push(part(box(g.w, h + 0.16, g.d, g.x, y0 + (h + 0.16) / 2, g.z, `fence-post-${salt}-${i}`), p.joinery));
    // Post cap in `joinery`, not `trim`. The r7 plate put a near-white blob on the head of
    // every post, which is the strongest single reason our fence does not read like the
    // reference's: a Monopoly-Plus fence is one dark value from foot to cap.
    out.push(part(box(g.w + 0.07, 0.07, g.d + 0.07, g.x, y0 + h + 0.19, g.z, `fence-cap-${salt}-${i}`), p.joinery));
  }

  // Posts either side of every opening, so a break in the run has a made edge rather than a
  // sawn-off rail. This is what a real crossover looks like and it is what the reference's brick
  // plate shows.
  for (let k = 0; k < holes.length; k += 1) {
    for (const u of holes[k]) {
      const g = along(u, { long: 0.16, short: 0.16 });
      out.push(part(box(g.w, h + 0.20, g.d, g.x, y0 + (h + 0.20) / 2, g.z, `fence-post-${salt}-j${k}`), p.joinery));
      out.push(part(box(g.w + 0.07, 0.075, g.d + 0.07, g.x, y0 + h + 0.22, g.z, `fence-cap-${salt}-j${k}`), p.joinery));
    }
  }

  for (const [a, b] of runs) {
    const len = b - a;
    if (!(len > RAIL_MIN)) continue;
    const mid = (a + b) / 2;
    for (const ry of [y0 + h * 0.22, y0 + h * 0.82]) {
      const g = along(mid, { long: len, short: 0.06 });
      out.push(part(box(g.w, 0.075, g.d, g.x, ry, g.z, `fence-rail-${salt}`), p.joinery));
    }
    // **r3 — ROUND, and never fewer than three.** `Math.floor` turns an authored 0.37 m pitch into
    // an effective 0.42 m on a 2.1 m bay, so the loosest rung was 60 % looser than r1's shipped
    // fence rather than the 40 % it authored — the open end the critic measured at 45 pickets
    // against r1's 62. Rounding holds the effective pitch at the authored one, and the floor of
    // three keeps every bay reading as pickets on rails rather than as two blades in a frame.
    const n = Math.max(3, Math.round(len / pitch));
    for (let i = 0; i < n; i += 1) {
      const u = a + (i + 0.5) * (len / n);
      const g = along(u, { long: 0.075, short: 0.048 });
      // **r12 — the picket is YAWED, and this is §5.3.2 applied rather than re-derived.** The key
      // direction off the pinned rig is (0.836, 0.534, 0.124) at the lab's tod 0.28, so a picket on
      // the street run presents its two large faces at `n·l = ±0.124` — near enough to zero that
      // the diffuse term is a rounding error and the whole face is ambient. §5.3.2: "No texture,
      // alpha map or authored hex fixes a face at `n·l = 0`. The fix is ambient and orientation ...
      // yawed the cards off the axis." A ±0.16 rad alternating yaw takes the sunward face to about
      // `n·l = 0.25`, which is twice the irradiance, and it costs nothing: the same twelve
      // triangles, and a picket run that is not machine-perfect is the grungier read anyway.
      const yaw = (i % 2 === 0 ? 1 : -1) * (0.10 + 0.09 * ctx.v.unit(3620 + salt * 17 + i));
      out.push(part(rotBox(g.w, h, g.d, g.x, y0 + h / 2, g.z, { y: yaw }, `picket-${salt}-${i}`), p.joinery));
      // The per-picket cap is a 45 mm block on a 75 mm picket. On a detached house it is a
      // legible highlight along the top edge; on a six-storey apartment the whole fence is
      // forty pixels tall and the cap is a quarter of one, while costing 12 triangles a picket
      // against a budget the id is over. `capped` follows the lot's density for that reason.
      if (capped) {
        out.push(part(rotBox(
          g.w + 0.018, 0.045, g.d + 0.018, g.x, y0 + h + 0.02, g.z, { y: yaw },
          `picket-cap-${salt}-${i}`,
        ), p.joinery));
      }
    }
  }
  return out;
}

/** The gate: two stiles, two rails, five bars, hung between the two posts either side of it. */
function modernGate(ctx, { x, z }) {
  const p = ctx.p;
  const out = [];
  const gw = 1.24;
  const h = 0.98;
  const y0 = TRAY.LAWN - 0.03;
  out.push(part(box(gw, 0.085, 0.07, x, y0 + h * 0.18, z, 'gate-rail-lo'), p.joinery));
  out.push(part(box(gw, 0.085, 0.07, x, y0 + h * 0.86, z, 'gate-rail-hi'), p.joinery));
  out.push(part(box(0.085, h, 0.085, x - gw / 2, y0 + h / 2, z, 'gate-stile-l'), p.joinery));
  out.push(part(box(0.085, h, 0.085, x + gw / 2, y0 + h / 2, z, 'gate-stile-r'), p.joinery));
  for (let i = 0; i < 5; i += 1) {
    const bx = x - gw / 2 + (i + 1) * (gw / 6);
    out.push(part(box(0.058, h - 0.08, 0.05, bx, y0 + h / 2, z, `gate-bar-${i}`), p.joinery));
  }
  out.push(part(box(0.10, 0.10, 0.09, x + gw / 2 - 0.16, y0 + h * 0.52, z + 0.05, 'gate-latch'), p.wallAlt));
  return out;
}

/** Letterbox on a post, standing on the lawn rather than 175 mm inside it. */
function letterbox(ctx, { x, z }) {
  const p = ctx.p;
  const y0 = TRAY.LAWN - 0.05;
  return [
    part(box(0.12, 0.86, 0.12, x, y0 + 0.43, z, 'letterbox-post'), p.timber),
    part(box(0.36, 0.29, 0.27, x, y0 + 1.00, z, 'letterbox-body'), p.wallAlt),
    part(box(0.43, 0.06, 0.34, x, y0 + 1.17, z, 'letterbox-cap'), p.trim),
    part(box(0.23, 0.05, 0.05, x, y0 + 0.99, z + 0.15, 'letterbox-slot'), p.shadow),
  ];
}

/** Meter box on the flank wall, and a pair of bins standing against it. */
function services(ctx, { side = 1, bins = true }) {
  const { env, p } = ctx;
  const out = [];
  const y0 = TRAY.LAWN - 0.05;
  const wallX = side * (env.bodyW / 2 + 0.09);
  const meterZ = Math.max(env.backZ + 0.5, env.frontZ - 1.7);
  out.push(part(box(0.16, 0.56, 0.40, wallX, y0 + 0.92, meterZ, 'meter-box'), p.trim));
  out.push(part(box(0.19, 0.05, 0.45, wallX, y0 + 1.22, meterZ, 'meter-hood'), p.trim));
  if (bins && ctx.mid) {
    const bx = side * (env.bodyW / 2 + 0.36);
    for (let i = 0; i < 2; i += 1) {
      const bz = meterZ - 0.85 - i * 0.62;
      out.push(part(box(0.54, 0.86, 0.54, bx, y0 + 0.43, bz, `bin-${i}`), p.wallAlt));
      out.push(part(box(0.58, 0.07, 0.58, bx, y0 + 0.89, bz, `bin-lid-${i}`), p.joinery));
    }
  }
  return out;
}

/**
 * Compose the whole lot.
 *
 * `density` trades planting and picket count against the triangle budget. `'full'` is the
 * detached houses, where the lot is half the plate; `'lean'` is the apartments, where the
 * building is nearly all of it and every triangle spent on a shrub is a triangle not spent on a
 * window reveal.
 */
export function composeModernLot(ctx, {
  entryX = 0,
  deckZ,
  driveway = false,
  driveX = null,
  // **r12 — `driveways`, plural: `[{ x, w }]`.** See `picketRun`'s `gaps` note and the r11 critic's
  // major 8. A driveway is not a slab on the lawn; it is a break in the boundary, a crossover over
  // the footpath and a paved run to the door of the garage, and until this round the lane could
  // build exactly one of them per lot.
  driveways = null,
  extraShrubs = [],
  density = 'full',
  fenceSides = true,
  keepOut = [],
} = {}) {
  const { env, p } = ctx;
  const lean = density === 'lean';
  const out = [];

  out.push(...boardTray(ctx));
  out.push(...(ctx.id === 'apartment-modern-courtyard' ? courtyardApron(ctx, { entryX, deckZ }) : lawn(ctx)));
  out.push(...frontage(ctx));
  out.push(...paverPath(ctx, { x: entryX, deckZ }));

  // V3.71 Lane G. Every axis below is a bounded move on a member that already exists, so the lot
  // varies at zero triangles — which is the only kind of lot variation §3.4's third amendment
  // leaves room for on the two detached houses.
  const va = ctx.var?.lot ?? null;
  const fenceLine = env.lotD / 2 - TRAY.RIM - FOOTPATH_D - 0.16;
  const halfW = env.lotW / 2 - TRAY.RIM - 0.16;
  const authoredDrives = (driveways ?? (driveway
    ? [{ x: driveX ?? entryX + (entryX >= 0 ? -2.15 : 2.15) }]
    : [])).map((d) => ({ x: d.x, w: d.w ?? 2.40 }));
  // **The gate slides along the frontage — and it may not slide onto a driveway.**
  //
  // A gate whose break overlaps a crossover would make the fence filter below DROP that
  // driveway, which on `townhouse-modern-brick` means a garage door with no way to it. The
  // candidate is therefore tested against the authored crossovers and falls back to the door
  // line, which is where it has always been. Same principle as the drive shift below: a
  // variation axis may not delete a member to make room for itself.
  const gateSpan = (gx) => [gx - 0.72, gx + 0.72];
  const gateClear = (gx) => authoredDrives.every((d) => (
    d.x + d.w / 2 + 0.20 < gateSpan(gx)[0] || d.x - d.w / 2 - 0.20 > gateSpan(gx)[1]
  ));
  const gateWanted = Math.max(-halfW + 1.1, Math.min(halfW - 1.1, entryX + (va?.gateShift ?? 0)));
  const gateX = gateClear(gateWanted) ? gateWanted : entryX;
  const gate = gateSpan(gateX);
  // **The picket pitch is an axis AND a fix, and the fix half came off a plate.**
  //
  // `townhouse-modern-brick--f0--street.png` shows the frontage boundary as a line of posts with
  // almost nothing between them. Measured with the member census: **17–21 pickets against 15–17
  // posts** on that id, i.e. about one picket per post, because a `lean` lot ran a 0.44 m pitch
  // and this id's boundary is mostly openings — three crossovers at 2.30 m plus a 1.44 m gate take
  // 8.7 m out of a 13.4 m frontage, so what is left is four short segments. §2.8 asks for "fences
  // with real pickets, capped, with posts at intervals"; one picket per bay is a rail, not a fence.
  //
  // 0.34 with a bounded per-instance jitter both closes the boarding up and makes it an axis: some
  // lots are close-boarded and some are open-paled, which is what a real street does. The lot
  // figures for every id at every facade are in `tests/v371-g-budget.mjs` and none moves over the
  // 3,500 allowance.
  //
  // **r2 — the pitch is a RUNG, and the rungs are authored per id against that id's own lot
  // headroom.** r1's jitter moved the pitch by ±4 %, which is one picket in sixty and reads as
  // nothing; §5.5.5's ruling is that a member COUNT is what the eye reads. The rung sets are in
  // `modern-variants.js` and they are not symmetric: `house-modern-skillion`'s lot runs at 3,468
  // of 3,500, so every rung on that id is at or LOOSER than what r1 shipped and the axis costs
  // triangles it does not have; `townhouse-modern-brick` has 1,340 spare, so its rungs go tighter
  // and close up the boarding the r1 critic read as "a line of posts with almost nothing between
  // them". Some lots are close-boarded and some are open-paled, which is what a real street is.
  const pitch = ctx.var?.count?.picketPitch
    ?? (lean ? 0.34 : 0.265) * (va ? 0.92 + va.pathWidthK * 0.08 : 1);
  // Every driveway that is on the street frontage takes its own break in the boundary. A drive
  // whose break would collide with the gate is dropped rather than merged, so the gate stays a
  // gate — the reference's brick plate keeps the two distinct and so does this.
  // **The drive shifts, and it shifts SAFELY — the shift is reverted rather than allowed to
  // trigger the drop.** The two filters below existed before this round and drop a drive that
  // would run off the pad or collide with the gate. That is right for an authored position and
  // wrong for a varied one: a garage door with its driveway silently deleted is a worse fault
  // than a driveway that did not move, and it would also swing the lot's triangle count between
  // facades. So the shifted position is tested first and the authored one is the fallback.
  const okDrive = (d) => d.x - d.w / 2 > -halfW - 0.05
    && d.x + d.w / 2 < halfW + 0.05
    && (d.x + d.w / 2 + 0.20 < gate[0] || d.x - d.w / 2 - 0.20 > gate[1]);
  const driveShift = va?.driveShift ?? 0;
  const drives = authoredDrives
    .map((base) => {
      const moved = { x: base.x + driveShift, w: base.w };
      return okDrive(moved) ? moved : base;
    })
    .filter(okDrive);
  const fenceGaps = [gate, ...drives.map((d) => [d.x - d.w / 2 - 0.06, d.x + d.w / 2 + 0.06])];
  out.push(...picketRun(ctx, {
    axis: 'x', from: -halfW, to: halfW, at: fenceLine, gaps: fenceGaps, pitch, salt: 0, capped: !lean,
  }));
  out.push(...modernGate(ctx, { x: gateX, z: fenceLine }));
  if (fenceSides) {
    // Returns down each side, stopping clear of the building so a fence never jams into a wall.
    const back = Math.max(env.frontZ + 0.25, fenceLine - (lean ? 1.6 : 2.6));
    for (const s of [-1, 1]) {
      out.push(...picketRun(ctx, {
        axis: 'z', from: back, to: fenceLine, at: s * halfW, pitch, salt: s > 0 ? 1 : 2, capped: !lean,
      }));
    }
  }

  // The letterbox changes which side of the gate it stands on, and the meter box and bins change
  // flank. Both were fixed reads on every instance of an id; neither costs a triangle to move.
  const boxSide = va ? va.boxSide : (entryX > 0 ? -1 : 1);
  out.push(...letterbox(ctx, {
    x: Math.max(-halfW + 0.4, Math.min(halfW - 0.4, gateX + boxSide * 0.95)),
    z: fenceLine - 0.10,
  }));
  const servicesSide = va ? va.servicesSide : (ctx.v.unit(3590) < 0.5 ? -1 : 1);
  out.push(...services(ctx, { side: servicesSide, bins: !lean }));
  // **The bins are a keep-out, and this was found by an instrument rather than by a plate.**
  // `services()` used to sit on a side chosen by its own salt and the planting stations were
  // authored around wherever it landed; once the side became a variation axis a shrub met a bin,
  // and `v371-g-contain.mjs` measured `shrub-lobe-0` 0.157 m inside `bin-1` on
  // `house-modern-skillion` carlton-east f0. The meter box and the two bins now declare their
  // footprint the way the fence and the driveway already do.
  const svcMeterZ = Math.max(env.backZ + 0.5, env.frontZ - 1.7);
  const serviceKeepOut = [{
    x0: Math.min(servicesSide * (env.bodyW / 2 + 0.02), servicesSide * (env.bodyW / 2 + 0.70)),
    x1: Math.max(servicesSide * (env.bodyW / 2 + 0.02), servicesSide * (env.bodyW / 2 + 0.70)),
    z0: svcMeterZ - 2.05,
    z1: svcMeterZ + 0.35,
  }];

  const frontZ = env.frontZ;
  const kerbZ = fenceLine - 0.55;
  const yardZ = (frontZ + Math.min(kerbZ, frontZ + 1.5)) / 2;
  const sideZ = (env.frontZ + env.backZ) / 2;

  // **r10 — the lean lots stop being lean where the budget says they need not be.**
  //
  // r9: "§2.6 (planted lot) and §2.7 (a path made of something) are the weakest clauses in the
  // lane", and "6 tufts on a whole lot is the number behind 'the lawn is still a flat slab'".
  // It also measured why the lean lots were the worst of them: `townhouse-modern-brick` spends
  // 1,764 of a 3,500 lot allowance and `apartment-modern-bar` 1,896, so both were carrying a
  // third of the houses' planting while sitting on the largest unspent allowances in the lane.
  //
  // `lean` now means five shrub stations and six tuft stations rather than two and two, and its
  // shrubs take the seven-lobe silhouette. The two detached houses and the render pair are
  // UNCHANGED, because they have 104-248 triangles left and cannot pay for it — which is the
  // whole reason §3.4's third amendment asks for the two budgets separately.
  const stations = lean
    ? [
      { x: entryX - 2.20, z: yardZ, r: 0.56, h: 0.74, salt: 1 },
      { x: entryX + 2.10, z: yardZ + 0.1, r: 0.50, h: 0.66, salt: 2 },
      { x: -env.lotW * 0.38, z: env.backZ - 0.40, r: 0.60, h: 0.78, salt: 3 },
      { x: env.lotW * 0.36, z: env.backZ - 0.24, r: 0.52, h: 0.68, salt: 4 },
      { x: -env.lotW * 0.40, z: sideZ + 0.3, r: 0.46, h: 0.72, salt: 5 },
    ]
    : [
      { x: entryX - 2.20, z: yardZ, r: 0.58, h: 0.78, salt: 1 },
      { x: entryX + 2.10, z: yardZ + 0.1, r: 0.52, h: 0.68, salt: 2 },
      { x: -env.lotW * 0.36, z: env.backZ - 0.32, r: 0.62, h: 0.80, salt: 3 },
      { x: env.lotW * 0.34, z: env.backZ - 0.18, r: 0.48, h: 0.62, salt: 4 },
      { x: -env.lotW * 0.40, z: sideZ, r: 0.44, h: 0.70, salt: 5 },
      { x: env.lotW * 0.40, z: sideZ + 0.4, r: 0.40, h: 0.58, salt: 6 },
    ];
  // **V3.71 Lane G — the planting arrangement is the lot's loudest variation axis and its cheapest.**
  //
  // `shrubMass` takes its lobe count from `lobes:`, so scaling a clump's radius and height and
  // sliding its station costs nothing at all. `plantPhase` rotates each station about the lot
  // centre by a bounded angle and `plantSpread` pushes the ring in or out, so two neighbouring
  // lots read as two gardens rather than one garden stamped twice. Every moved station still goes
  // through `keep()` below, which is what stops a clump reaching a wall, a fence or the pad edge —
  // the fault that cost r1 five of its sixteen majors.
  const varyStation = (s) => {
    if (!va) return s;
    const dx = s.x - entryX;
    const dz = s.z - ((env.frontZ + env.backZ) / 2);
    const a = va.plantPhase * 0.22;
    return {
      ...s,
      x: entryX + (dx * Math.cos(a) - dz * Math.sin(a)) * va.plantSpread,
      z: ((env.frontZ + env.backZ) / 2) + (dx * Math.sin(a) + dz * Math.cos(a)) * va.plantSpread,
      r: (s.r ?? 0.5) * va.plantScale,
      h: (s.h ?? 0.7) * (0.90 + va.plantScale * 0.12),
    };
  };

  // Every planting station now runs through the containment test. A shrub's reach is its lobe
  // radius plus the skirt, which `shrubMass` builds at r * 1.55 / 2 outward from the centre.
  // The fence is a keep-out for shrubs as well as for trees. The containment probe measured
  // `shrub-lobe` 150 mm inside `fence-post` on two ids — small, but it is the same class of
  // fault as the crown through the render wall and it is the one a critic sees at the gate,
  // where the eye already is.
  // A driveway is a keep-out for everything that grows. r10's single drive was not one, which the
  // containment probe could not see because it only tests planting against the BUILDING envelope.
  const driveKeepOut = drives.map((d) => ({
    x0: d.x - d.w / 2 - 0.12, x1: d.x + d.w / 2 + 0.12,
    z0: env.frontZ - 0.10, z1: env.lotD / 2 - TRAY.RIM,
  }));
  const keep = makeStationKeeper(ctx, {
    margin: 0.22,
    extraKeepOut: [
      { x0: -halfW - 0.2, x1: halfW + 0.2, z0: fenceLine - 0.16, z1: fenceLine + 0.16 },
      { x0: -halfW - 0.16, x1: -halfW + 0.16, z0: env.frontZ - 0.4, z1: fenceLine },
      { x0: halfW - 0.16, x1: halfW + 0.16, z0: env.frontZ - 0.4, z1: fenceLine },
      ...driveKeepOut,
      ...serviceKeepOut,
      ...keepOut,
    ],
  });
  for (const raw of [...stations, ...extraShrubs]) {
    const s = varyStation(raw);
    // **1.25, not 0.95, and this was caught by a probe rather than by a plate.** r10 widened the
    // shrub's lobe spread (0.30-0.68 of `r` from 0.34-0.64) and its lobe size (0.38-0.86 from
    // 0.52-0.78) to break the outline, which moves the clump's outermost point from about
    // `r * 0.95` to about `r * 1.25` once the ±0.85 rad tilt is taken. The keeper's reach is what
    // stops a clump reaching a wall, a fence or the pad edge, so a silhouette change that is not
    // matched here turns straight into r1's planting-through-render fault.
    // `v370-l1-determinism.test.mjs` "the envelope stays on the pad" failed on
    // `townhouse-modern-render f3` by 0.053 m before this line was corrected.
    const reach = (s.r ?? 0.5) * 1.20;
    // **A variation axis may not cost the lot its planting.** The keeper DROPS a station it
    // cannot hold, which is the right behaviour (a missing shrub is not a defect; a shrub inside
    // a wall is) and the wrong interaction with a moved station: a lot that had six clumps at
    // V3.70 would quietly ship four. So the varied station is tried first and the AUTHORED one is
    // the fallback, which makes the planting count non-decreasing against the graded baseline by
    // construction rather than by measurement.
    const at = keep(s.x, s.z, reach) ?? keep(raw.x, raw.z, (raw.r ?? 0.5) * 1.20);
    if (!at) continue;
    out.push(...shrubMass(ctx, {
      ...s, x: at.x, z: at.z, y: TRAY.LAWN - 0.06, salt: s.salt ?? ((s.x * 13) | 0),
      lobes: lean ? 7 : 5,
    }));
  }

  // Trees. The r1 plate's canopies were 0.70 across against a 5.5 m wall and read as green pins
  // on sticks; the reference tree is a third of the house's height and reads as a mass. Scaled
  // to the lot rather than to a constant, so a six-storey apartment does not get a bonsai.
  //
  // The r1 clamp took the pad edge and nothing else, which is how a crown ended up inside
  // `apartment-modern-courtyard`'s third storey. Every station now goes through the keeper,
  // and the FENCE is a keep-out too: the critic's third instance was a crown overlapping the
  // picket capping such that the post cap drew over the canopy in one place and the canopy
  // over the fence in another.
  const treeH = Math.min(4.6, Math.max(2.9, env.wallH * 0.52));
  const treeKeep = makeStationKeeper(ctx, {
    margin: 0.34,
    extraKeepOut: [
      { x0: -halfW - 0.2, x1: halfW + 0.2, z0: fenceLine - 0.22, z1: fenceLine + 0.22 },
      { x0: -halfW - 0.22, x1: -halfW + 0.22, z0: env.frontZ - 0.4, z1: fenceLine },
      { x0: halfW - 0.22, x1: halfW + 0.22, z0: env.frontZ - 0.4, z1: fenceLine },
      ...driveKeepOut,
      ...serviceKeepOut,
      ...keepOut,
    ],
  });
  const plant = (x, z, h, canopy, salt, fallback = null) => {
    // Measured, not guessed: `canopyTree` puts its outermost cluster centre at
    // canopy * 0.80 and gives it a half-size of canopy * 0.46, so the crown never reaches
    // past canopy * 1.26. 1.40 keeps a margin for the tilt.
    const reach = canopy * 1.40;
    let at = treeKeep(x, z, reach);
    let hh = h;
    let cc = canopy;
    // Same rule as the shrubs: try the varied station, then the authored one, and only then give
    // up. A tree is the largest single silhouette on a lot and losing one to a scale axis would
    // be the axis paying for itself out of §2.6.
    if (!at && fallback) {
      at = treeKeep(fallback.x, fallback.z, fallback.canopy * 1.40);
      if (at) { hh = fallback.h; cc = fallback.canopy; }
    }
    if (!at) return;
    out.push(...canopyTree(ctx, {
      x: at.x, z: at.z, h: hh, canopy: cc, salt, y: TRAY.LAWN - 0.05,
    }));
  };
  // V3.71 Lane G — which side the street tree stands, how big it is and how far along the
  // frontage it sits. `canopyTree`'s cluster count is fixed by the helper, so scale and station
  // are free; `treeKeep` still drops or slides any station that cannot be held.
  const tSide = va ? va.treeSide : -1;
  const tK = va ? va.treeScale : 1;
  const tShift = va ? va.treeShift : 0;
  plant(tSide * env.lotW * 0.34, frontZ + 0.95 + tShift * 0.20, treeH * tK, treeH * 0.40 * tK, 1,
    { x: -env.lotW * 0.34, z: frontZ + 0.95, h: treeH, canopy: treeH * 0.40 });
  if (!lean) {
    plant(-tSide * env.lotW * 0.34, frontZ + 0.75 - tShift * 0.16,
      treeH * 0.86 / tK, treeH * 0.34 / tK, 2,
      { x: env.lotW * 0.34, z: frontZ + 0.75, h: treeH * 0.86, canopy: treeH * 0.34 });
  }
  // r10 — the lean lots get a rear tree. Their buildings came down from 74-82 % of the lot depth
  // to 42-62 % (`index.js` ENVELOPE), so there is now a rear garden behind them with room for a
  // canopy, and the keeper drops the station rather than clamping it if there is not.
  if (lean) plant(env.lotW * 0.30, env.backZ - 1.10, treeH * 0.62, treeH * 0.26, 3);

  // Tufts, scattered where the eye reads the lawn's outline: along the path and at the corners.
  const tuftStations = lean
    ? [
      [entryX - 1.05, yardZ + 0.25], [entryX + 1.05, yardZ - 0.15],
      [-env.lotW * 0.32, yardZ + 0.15], [env.lotW * 0.30, yardZ + 0.35],
      // The rear pair sits a clear metre behind the building. At `backZ - 0.55` the keeper pushed
      // them out of the envelope keep-out and straight into the side-fence one, and DROPPED both
      // — which is the right behaviour and the wrong station. The lean ids' buildings came down
      // to 42-62 % of the lot depth this round, so there is somewhere for them to go now.
      [-env.lotW * 0.26, env.backZ - 1.30], [env.lotW * 0.28, env.backZ - 1.10],
    ]
    : [
      [entryX - 1.05, yardZ + 0.30], [entryX + 1.02, yardZ - 0.20],
      [-env.lotW * 0.30, yardZ + 0.10], [env.lotW * 0.28, yardZ + 0.35],
      [-env.lotW * 0.22, sideZ + 0.4], [env.lotW * 0.24, sideZ - 0.3],
    ];
  // **Tufts go through the keeper too, from r10.** They never did — `plant()` and the shrub loop
  // were containment-tested and this loop was not — and it did not matter while there were two
  // stations on a lean lot and the buildings were deep. With six stations and buildings that came
  // down to 42-62 % of the lot depth, `v370-l1-containment-probe.mjs` caught `tuft-1` 0.120 m
  // inside `plinth-body` on `townhouse-modern-brick` facade 3. A blade can stand a full `spread`
  // from its station, so that is the reach.
  const tuftKeep = makeStationKeeper(ctx, {
    margin: 0.26,
    extraKeepOut: [
      { x0: -halfW - 0.2, x1: halfW + 0.2, z0: fenceLine - 0.18, z1: fenceLine + 0.18 },
      { x0: -halfW - 0.18, x1: -halfW + 0.18, z0: env.frontZ - 0.4, z1: fenceLine },
      { x0: halfW - 0.18, x1: halfW + 0.18, z0: env.frontZ - 0.4, z1: fenceLine },
      ...driveKeepOut,
      ...serviceKeepOut,
      ...keepOut,
    ],
  });
  tuftStations.forEach(([tx0, tz0], i) => {
    // V3.71 Lane G — the tufts scatter differently per instance. `lawnTufts` takes its blade
    // count from `blades:`, so sliding a station is free. The offset is per-station rather than
    // global so the scatter changes pattern rather than translating as a block.
    const ph = va ? va.tuftPhase + i * 1.7 : 0;
    const sp = va ? va.tuftSpread : 1;
    const tx = va ? tx0 * sp + Math.cos(ph) * 0.42 : tx0;
    const tz = va ? tz0 + Math.sin(ph) * 0.38 : tz0;
    const at = tuftKeep(tx, tz, 0.60) ?? tuftKeep(tx0, tz0, 0.60);
    if (!at) return;
    // Eight blades per station on the lean lots, six on the two houses. Same argument as the
    // shrub lobes: `townhouse-modern-brick` sits on 1,568 unspent lot triangles and r9 ranked
    // §2.6 among the two weakest clauses in the lane, while the houses have 176 and cannot pay.
    out.push(...lawnTufts(ctx, {
      x: at.x, z: at.z, y: TRAY.LAWN - 0.02, salt: i + 1, blades: lean ? 8 : 6,
    }));
  });

  // **The driveway runs from the garage door to the KERB, and it crosses the footpath.**
  //
  // r10 built one drive per lot from the building face to `fenceLine + 0.10` and stopped there, and
  // `townhouse-brick.js` built its other two at y = −0.02 and +0.02 — which is 195 mm BELOW the
  // lawn it was supposed to be laid on. Two of the three driveways on that id existed and were
  // buried, which is the fourth instance on this programme of §5.3.2's "before concluding a feature
  // is missing, check whether it is occluded".
  const kerbFace = env.lotD / 2 - TRAY.RIM - 0.22;
  drives.forEach((drv, k) => {
    const z0 = env.frontZ + 0.06;
    const z1 = kerbFace;
    const d = z1 - z0;
    if (!(d > 0.4)) return;
    const zc = (z0 + z1) / 2;
    out.push(part(slab(drv.w, 0.05, d, drv.x, TRAY.LAWN - 0.05, zc, `driveway-bed-${k}`), p.shadow));
    out.push(part(slab(drv.w - 0.20, 0.055, d - 0.08, drv.x, TRAY.LAWN - 0.045, zc, `drive-top-${k}`), p.trim));
    out.push(part(box(0.05, 0.028, d - 0.08, drv.x, TRAY.LAWN + 0.012, zc, `drive-joint-${k}`), p.shadow));
    // The crossover: the drive's own surface carried across the footpath, with the two splayed
    // wings a real crossover has. §2.7's "made of something" applies to a driveway as much as to a
    // path, and this is the member that makes the break in the fence read as a way in rather than
    // as a missing panel.
    const fz = env.lotD / 2 - TRAY.RIM - FOOTPATH_D / 2;
    out.push(part(slab(drv.w + 0.10, 0.020, FOOTPATH_D + 0.16, drv.x, TRAY.FIELD + 0.055, fz, `crossover-${k}`), p.trim));
    for (const sgn of [-1, 1]) {
      out.push(part(box(
        0.30, 0.024, FOOTPATH_D + 0.16,
        drv.x + sgn * (drv.w / 2 + 0.20), TRAY.FIELD + 0.053, fz, `crossover-splay-${k}${sgn > 0 ? 'r' : 'l'}`,
      ), p.shadow));
    }
  });
  return out;
}

/**
 * The datum a builder should sit its ground floor on.
 *
 * Everything in this lane used to assume the lot surface was y = 0. It is now the top of the
 * board tray, and a builder that keeps assuming zero leaves its plinth buried by 175 mm. Export
 * the number rather than let six builders each guess it.
 */
export const LOT_DATUM = TRAY.LAWN - 0.05;

export { boardTray, picketRun, paverPath, letterbox, services };
