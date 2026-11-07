// apartment-modern-bar — six-storey bar: charcoal bookends, cream mid, slab stacks, setback terrace.

import {
  volume, hole, openingRecord, flatParapet, slabBalcony, brickCourses,
  downpipes, planter, stringCourse, lantern, houseNumber, plinthCourse,
} from './modern-kit.js';
import { framedWindow, modernDoor } from './modern-detail.js';
import { fenY, fenW, fenH, fenLights } from './modern-variants.js';
import { composeModernLot, LOT_DATUM } from './modern-garden.js';
import { slab, box } from '../core.js';

// **r12 — the bar's proportions, and the escalation that goes with them (§6.4).**
//
// The r11 critic's major 7: "12.7 m frontage on a 6.3 m depth at 20.4 m to ridge is 1.6× taller
// than it is long ... a bar is long and low, and you built a tower that satisfies the metric." It
// settled that at board zoom too: "the measurement moved 79 % and the silhouette did not move at
// all, because the number never contained the height."
//
// **The conflict is with the spec, and it is named here rather than routed around.**
// `V350-MODERN-RESIDENTIAL-SPEC.md` §"The six" says `apartment-modern-bar` is a **"Six-storey
// bar. Brick bookends, projecting slab balconies, glass/render mid, rooftop setback terrace."**
// The tile is 15 m square, so the largest frontage §3.6 leaves on it is about 13.9 m. Six storeys
// at any real Melbourne floor-to-floor is 17–19 m. **"Six storeys" and "reads long and low on one
// tile" cannot both hold**, and §6.4 says say so and stop rather than bend the model. The row is
// V350 §"The six", `apartment-modern-bar`, the word is "Six-storey", and it needs an owner ruling
// — either the storey count comes down or the id takes two tiles.
//
// What IS available without contradicting that row, and what r12 does:
//
//  1. **The setback terrace becomes the sixth storey instead of sitting on top of six.** V350 says
//     six storeys AND a rooftop setback terrace; r10 built six full-width storeys, then a terrace
//     box, then a 2.32 m plant room on top of that — 22.35 m of actual bounds against a declared
//     20.40. Reading the setback level AS the sixth storey is the honest reading of the same
//     sentence, and it drops the FULL-WIDTH parapet from 18.98 m to 14.68 m against a 13.88 m
//     frontage — 1.06, where r10's was 1.50. The silhouette is now a long block with a set-back
//     top, which is what a bar is.
//  2. **Four bays instead of three**, so the frontage rhythm is long rather than square, and the
//     punched-opening count stays over §3.4's 60.
//  3. **A storey-height horizontal band at every level.** The device that makes a tall block read
//     as a bar is an unbroken horizontal, and r10 had exactly one, at the podium.
//  4. **2.92 m floor-to-floor, not 3.15**, and the plant room down from 2.32 m to 0.95 m.
//
// `STOREYS` is the declared count and is still six. `FULL` is how many of them are full-width.
const STOREYS = 6;
const FULL = 5;
const STOREY = 2.92;
const COLS = 4;
const BALC_PROJ = 1.24;
const FLANK_PROJ = 0.95;
const RAIL_H = 1.02;

function storeyY(y0, s, lift = 0.40) {
  return y0 + s * STOREY + lift;
}

function midColX(midW, c) {
  return -midW / 2 + (c + 0.5) * (midW / COLS);
}

function flankBalcony(ctx, { plane, sign, y, z, w, proj = FLANK_PROJ }) {
  const p = ctx.p;
  const xMid = plane + sign * (proj / 2);
  const xRail = plane + sign * (proj - 0.07);
  const parts = [
    // **r12 — `fb-slab` is `wallAlt`, not `trim`.** `slabBalcony()` in `modern-kit.js` has carried
    // a comment since r1 explaining why a balcony floor slab in `trim` is wrong ("in `trim` it was
    // the near-white plank the r1 critic read inside an open dark crate"), and this function never
    // got the same treatment. The r11 critic measured the consequence at board zoom: the floating
    // slabs "are the brightest elements on the whole model at board distance — the only near-white
    // thing on a warm brick tower". A concrete balcony floor is concrete.
    { geometry: slab(proj, 0.20, w, xMid, y - 0.20, z, 'fb-slab'), material: p.wallAlt },
    { geometry: slab(0.10, 0.07, w + 0.10, plane + sign * (proj + 0.03), y - 0.05, z, 'fb-nose'), material: p.wallAlt },
    // `trim`, not `shadow`: this is the flank balcony's soffit and it is one of the three places
    // the r11 critic's dark map put the literal-zero population. Same move as `slabBalcony`.
    { geometry: slab(proj - 0.12, 0.05, w - 0.10, xMid, y - 0.24, z, 'fb-cave'), material: p.trim },
  ];
  const posts = 2;
  for (let i = 0; i < posts; i += 1) {
    const u = z - w / 2 + (i / (posts - 1)) * w;
    parts.push({ geometry: box(0.08, RAIL_H, 0.08, xRail, y + RAIL_H / 2, u, 'fb-post'), material: p.joinery });
  }
  parts.push({ geometry: box(0.08, 0.08, w + 0.10, xRail, y + RAIL_H, z, 'fb-top'), material: p.joinery });
  parts.push({ geometry: box(0.075, 0.065, w + 0.08, xRail, y + RAIL_H * 0.47, z, 'fb-mid'), material: p.joinery });
  parts.push({ geometry: box(proj - 0.14, RAIL_H, 0.08, xMid, y + RAIL_H / 2, z - w / 2, 'fb-ret-a'), material: p.joinery });
  parts.push({ geometry: box(proj - 0.14, RAIL_H, 0.08, xMid, y + RAIL_H / 2, z + w / 2, 'fb-ret-b'), material: p.joinery });
  ctx.add(parts);
}

function balconyLife(ctx, { x, y, z, proj, salt = 0 }) {
  const p = ctx.p;
  const deep = z + proj * 0.46;
  // r12 — the pot and its plant sat 120 mm above the balcony floor. Small, and the same class of
  // fault as the parasol above, so it is corrected while the file is open: everything on a balcony
  // now starts at `y`, which is the slab's own top face (`slabBalcony` lays the slab from
  // `y - slabH` to `y`).
  ctx.add([
    { geometry: box(0.36, 0.34, 0.32, x - 0.28, y + 0.17, deep, 'chair'), material: p.joinery },
    { geometry: box(0.24, 0.16, 0.24, x + 0.26, y + 0.08, deep + 0.06, 'pot'), material: p.wallAlt },
    { geometry: box(0.20, 0.26, 0.18, x + 0.26, y + 0.29, deep + 0.06, 'tuft'), material: p.garden },
  ]);
  // **r12 — the parasol is deleted. It was major 3, and this is the fourth round it has been
  // booked in.**
  //
  // r1 major 14 → r2 major 7 → r9 major 5 → r11 major 3, always described the same way: "a pale
  // slab sits clear above the balustrade top rail with daylight between, overhangs it into the
  // space in front of the balcony, and its pedestal — the striated stalk below — passes through
  // the rail and does not meet the slab". r10 probed for an AABB overlap, found none, and said
  // plainly that its test was pointed at the wrong thing, because the fault is a GAP.
  //
  // It was `umb-cap`: a 0.78 × 0.78 × 0.07 plate in `trim` — which renders 161–168, the palest
  // bucket on the model — at `y + 1.20`, with the top rail's own top face at `y + 1.063`. So
  // 137 mm of daylight under a near-white plate, on a 60 mm pole that is sub-pixel at every graded
  // distance and invisible where it crosses the rail. Eight of them on the front elevation, which
  // is exactly the count the critic reported.
  //
  // It is deleted rather than rebuilt. A parasol IS a plate on a thin stick; there is no version of
  // it that reads as supported at board zoom, and the r11 critic found it as the brightest object
  // on the whole model at that distance. The balcony keeps the chair, the pot and the plant, all of
  // which stand ON the slab.
  // A bench, not a table: a solid box standing on the slab. The first draft of this replacement was
  // a 0.62 × 0.56 top on a 0.13 pedestal, and the r12 probe's own support test reported it at 0.18
  // — an eighth of a square metre of top with an eighth of that under it, which is the parasol's
  // fault at a smaller scale. Caught by the instrument written to catch it, in the same round,
  // which is the point of writing the instrument before the geometry.
  if (salt % 2 === 0) {
    ctx.add([
      { geometry: box(0.58, 0.34, 0.34, x + 0.04, y + 0.17, deep - 0.06, 'balc-bench'), material: p.wallAlt },
      { geometry: box(0.60, 0.05, 0.36, x + 0.04, y + 0.365, deep - 0.06, 'balc-bench-top'), material: p.joinery },
    ]);
  }
}

export default function build(ctx) {
  const { env, p } = ctx;
  // V3.71 Lane G. A long low slab with brick bookends, a render mid and projecting slab
  // balconies is the identity (§5.3.7: "bar" is the identity constraint). The storey count, the
  // bookend-mid-bookend composition and the balcony stack do not move. The bookend PROPORTION,
  // the balcony projection, the storey-band sill heights, the window rhythm and the set-back top
  // storey's footprint do.
  const V = ctx.var;
  const y0 = env.floorY;
  // Every window on a storey takes the same band delta, so two openings in one band can never
  // converge; the bands are 2.92 m apart against a ±90 mm move.
  const bandY = (s, lift) => fenY(V, storeyY(y0, s, lift), s);
  const balcProj = V?.mass?.balcProj ?? BALC_PROJ;
  const top = y0 + FULL * STOREY;          // the FULL-WIDTH parapet, storeys 0..4
  const width = env.bodyW;
  const zF = env.frontZ;
  const zB = env.backZ;
  const depth = zF - zB;
  const zc = (zF + zB) / 2;
  const endW = width * (V?.mass?.endW ?? 0.22);
  const midW = width - endW * 2;
  const leftX = -width / 2 + endW / 2;
  const rightX = width / 2 - endW / 2;
  const leftPlane = -width / 2;
  const rightPlane = width / 2;
  const midZ = zF - 0.15;
  const doorW = 1.70;
  const doorH = 2.35;
  const midWinW = 1.52;
  const midWinH = 1.70;
  const endWinW = 1.28;
  const endWinH = 1.58;
  const flankWinW = 1.32;
  const flankWinH = 1.58;
  const flankStreetZ = zc + depth * 0.20;
  const flankRearZ = zc - depth * 0.18;

  // **§2.3 — the same r9 major as the courtyard, and the same fix.** A six-storey bar had a
  // 12-triangle ground pad standing in for a plinth course. The pad stays (it is the ground the
  // block sits on); a real course now wraps it, with the proud weathering cap, the shadow bead
  // under the cap and the damp course at the toe that `plinthCourse` builds.
  //
  // The head is `y0 + 0.30`, which is low for a plinth and is set by the elevation rather than by
  // taste: the ground-floor windows sill at `y0 + 0.28` (`storeyY(y0, 0, 0.28)`), so a taller
  // course would run through them. 48 triangles against 2,948 of building headroom.
  ctx.add([{
    geometry: slab(width + 0.30, Math.max(0.12, y0), depth + 0.30, 0, 0, zc, 'plinth'),
    material: p.wallAlt,
  }]);
  ctx.add(plinthCourse(ctx, {
    x: 0, z: zc, w: width, d: depth,
    y0: LOT_DATUM - 0.14, h: y0 + 0.30 - (LOT_DATUM - 0.14),
  }));

  const endFront = (u0) => {
    const holes = [];
    for (let s = 0; s < FULL; s += 1) {
      const h = s === 0 ? 1.82 : endWinH;
      holes.push(hole(u0, bandY(s, s === 0 ? 0.28 : 0.52), endWinW, h, `end-f-${s}`));
    }
    return holes;
  };
  const endFlank = () => {
    const holes = [];
    for (let s = 0; s < FULL; s += 1) {
      const y = bandY(s, s === 0 ? 0.30 : 0.52);
      const h = s === 0 ? 1.80 : flankWinH;
      holes.push(hole(flankStreetZ, y, flankWinW, h, `end-fs-${s}`));
      holes.push(hole(flankRearZ, y, flankWinW, h, `end-fr-${s}`));
    }
    return holes;
  };

  const leftFrontHoles = endFront(leftX);
  const rightFrontHoles = endFront(rightX);
  const leftFlankHoles = endFlank();
  const rightFlankHoles = endFlank();

  ctx.add(volume(ctx, {
    material: p.wallAlt, x: leftX, zFront: zF, zBack: zB, width: endW,
    y0, y1: top, front: leftFrontHoles, left: leftFlankHoles, name: 'book-l',
  }));
  ctx.add(volume(ctx, {
    material: p.wallAlt, x: rightX, zFront: zF, zBack: zB, width: endW,
    y0, y1: top, front: rightFrontHoles, right: rightFlankHoles, name: 'book-r',
  }));
  // r2 — the bookend bond is a member COUNT (§5.5.5). `maxRows` is raised from the helper's
  // default 14 because on a 14.6 m bookend that default clamps every pitch under 1.04 m to one
  // value, which would have made the rungs a descriptor field with no mesh behind it. The rungs
  // run 23 courses to 12 up the bookend.
  const coursePitch = V?.count?.coursePitch ?? 0.66;
  // **r3 — the bookend's bed courses stop where the balcony stack is built into them.**
  //
  // The r3 HEAD control (`tests/v371-g2-overlap.mjs --control`) reports `bed-joint x balc-soffit`
  // at 0.026 m as NEW, and it is: the mid section's outermost balcony is 2.05 m wide on a column
  // centred `midW * 0.375` off the middle, so it laps 0.155 m onto the bookend's front face, and
  // r2's `coursePitch` rung is what first landed a course at the lapping soffit's height. A slab
  // built into brickwork is correct construction; a modelled bed joint passing through it is not,
  // so the balcony stack joins the keep-out list the same way an opening's sill and drip did.
  // The spans are derived from the same three numbers `slabBalcony` is called with below —
  // `midColX`, the 2.05 m slab and `bandY(s, 0.38) - 0.08` — rather than measured off a plate.
  const balcKeepOut = (c) => {
    const out = [];
    for (let s = 1; s < FULL; s += 1) {
      const yBal = bandY(s, 0.38) - 0.08;
      out.push({ u: midColX(midW, c), y: yBal - 0.18 - 0.07, width: 2.05, height: 0.18 + 0.09 });
    }
    return out;
  };
  for (const c of [
    { axis: 'x', face: 1, plane: zF, centre: leftX, run: endW, openings: [...leftFrontHoles, ...balcKeepOut(0)] },
    { axis: 'x', face: 1, plane: zF, centre: rightX, run: endW, openings: [...rightFrontHoles, ...balcKeepOut(COLS - 1)] },
    { axis: 'z', face: -1, plane: leftPlane, centre: zc, run: depth, openings: leftFlankHoles },
    { axis: 'z', face: 1, plane: rightPlane, centre: zc, run: depth, openings: rightFlankHoles },
  ]) {
    ctx.add(brickCourses(ctx, { ...c, y0, y1: top, pitch: coursePitch, maxRows: 24 }));
  }

  const midFront = [];
  const midBack = [];
  for (let s = 0; s < FULL; s += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const u = midColX(midW, c);
      const isDoor = s === 0 && c === 1;
      midFront.push(hole(
        u,
        isDoor ? y0 + 0.10 : bandY(s, s === 0 ? 0.22 : 0.38),
        isDoor ? doorW : fenW(V, midWinW),
        isDoor ? doorH : fenH(V, s === 0 ? 1.95 : midWinH),
        isDoor ? 'lobby' : `m-${s}-${c}`,
      ));
    }
    midBack.push(hole(-midW * 0.22, bandY(s, 0.48), 1.22, 1.42, `mb-l-${s}`));
    midBack.push(hole(midW * 0.22, bandY(s, 0.48), 1.22, 1.42, `mb-r-${s}`));
  }

  ctx.add(volume(ctx, {
    material: p.wall, x: 0, zFront: midZ, zBack: zB, width: midW,
    y0, y1: top, front: midFront, back: midBack, name: 'mid',
  }));

  // **r12 — a band at EVERY storey line, not just the podium.** The device that makes a tall block
  // read as a long one is an unbroken horizontal repeated up the elevation; r10 had exactly one
  // band, at `podiumY`, and the r11 critic read the result as a point tower from every distance
  // including board zoom. The bands run the full frontage — both bookends and the mid together —
  // so the eye reads one line across 13.9 m rather than three separate panels. 144 triangles.
  for (let s = 1; s <= FULL; s += 1) {
    const by = y0 + s * STOREY;
    const thick = s === 1 ? 0.12 : 0.095;
    ctx.add([
      { geometry: slab(endW + 0.08, thick, 0.10, leftX, by, zF + 0.04, `string-l-${s}`), material: p.trim },
      { geometry: slab(endW + 0.08, thick, 0.10, rightX, by, zF + 0.04, `string-r-${s}`), material: p.trim },
      { geometry: slab(midW + 0.06, thick, 0.10, 0, by, midZ + 0.04, `string-m-${s}`), material: p.trim },
    ]);
  }

  const jambH = doorH + 0.42;
  const jambY = y0 + jambH / 2;
  ctx.add([
    { geometry: box(0.44, jambH, 0.42, -doorW / 2 - 0.18, jambY, midZ + 0.16, 'jamb-l'), material: p.wallAlt },
    { geometry: box(0.44, jambH, 0.42, doorW / 2 + 0.18, jambY, midZ + 0.16, 'jamb-r'), material: p.wallAlt },
    { geometry: box(doorW + 1.05, 0.38, 0.50, 0, y0 + doorH + 0.32, midZ + 0.20, 'lintel'), material: p.wallAlt },
    { geometry: slab(doorW + 1.22, 0.14, 0.78, 0, y0 + doorH + 0.50, midZ + 0.42, 'canopy'), material: p.trim },
    { geometry: slab(2.55, 0.10, 0.58, 0, y0 - 0.02, midZ + 0.32, 'lobby-step'), material: p.wallAlt },
  ]);
  ctx.add(modernDoor(ctx, {
    opening: openingRecord({
      face: 'front', u: 0, y: y0 + 0.10, w: doorW, h: doorH, plane: midZ,
    }),
    id: 'lobby-door', timber: false, interactive: true, w: doorW, h: doorH,
    label: 'Lobby',
  }));
  const lampSide = V?.entry?.lampSide ?? 1;
  ctx.add(lantern(ctx, { x: lampSide * (doorW / 2 + 0.52), y: y0 + 2.08, z: midZ + 0.22, facing: 1 }));
  ctx.add(houseNumber(ctx, { x: -lampSide * (doorW / 2 + 0.50), y: y0 + 1.58, z: midZ + 0.20, facing: 1 }));

  for (let s = 0; s < FULL; s += 1) {
    const yEnd = bandY(s, s === 0 ? 0.28 : 0.52);
    const hEnd = s === 0 ? 1.82 : endWinH;
    const yFlank = bandY(s, s === 0 ? 0.30 : 0.52);
    const hFlank = s === 0 ? 1.80 : flankWinH;

    ctx.add(framedWindow(ctx, {
      opening: openingRecord({
        face: 'front', u: leftX, y: yEnd, w: endWinW, h: hEnd, plane: zF,
      }),
      id: `ew-l-${s}`, lights: 1, interactive: s === 0, label: 'Street window',
    }));
    ctx.add(framedWindow(ctx, {
      opening: openingRecord({
        face: 'front', u: rightX, y: yEnd, w: endWinW, h: hEnd, plane: zF,
      }),
      id: `ew-r-${s}`, lights: 1, interactive: s === 0, label: 'Street window',
    }));

    for (const [zWin, tag] of [[flankStreetZ, 's'], [flankRearZ, 'r']]) {
      ctx.add(framedWindow(ctx, {
        opening: openingRecord({
          face: 'left', u: zWin, y: yFlank, w: flankWinW, h: hFlank,
          plane: leftPlane, axis: 'z', faceSign: -1,
        }),
        id: `fw-l-${tag}-${s}`, lights: 1, interactive: s === 0, label: 'Flank window',
      }));
      ctx.add(framedWindow(ctx, {
        opening: openingRecord({
          face: 'right', u: zWin, y: yFlank, w: flankWinW, h: hFlank,
          plane: rightPlane, axis: 'z', faceSign: 1,
        }),
        id: `fw-r-${tag}-${s}`, lights: 1, interactive: s === 0, label: 'Flank window',
      }));
    }

    if (s >= 1) {
      flankBalcony(ctx, { plane: leftPlane, sign: -1, y: yFlank - 0.06, z: flankStreetZ, w: 1.62 });
      flankBalcony(ctx, { plane: rightPlane, sign: 1, y: yFlank - 0.06, z: flankStreetZ, w: 1.62 });
    }

    for (let c = 0; c < COLS; c += 1) {
      if (s === 0 && c === 1) continue;
      const u = midColX(midW, c);
      const yWin = bandY(s, s === 0 ? 0.22 : 0.38);
      const hWin = s === 0 ? 1.95 : midWinH;
      ctx.add(framedWindow(ctx, {
        opening: openingRecord({
          face: 'front', u, y: yWin, w: fenW(V, midWinW), h: fenH(V, hWin), plane: midZ,
        }),
        id: `mw-${s}-${c}`, lights: fenLights(V, s + c, 1, 2, 2), interactive: s === 1, label: 'Apartment window',
      }));
      if (s >= 1) {
        const yBal = yWin - 0.08;
        ctx.add(slabBalcony(ctx, {
          x: u, y: yBal, z: midZ, w: 2.05, proj: balcProj, railPitch: V?.count?.railPitch,
        }));
        // r12 — `balc-cave` deleted. `slabBalcony()` already lays a soffit under the slab; this was
        // a SECOND dark card 220 mm below the first, and the pocket between them is the deepest
        // occlusion on the id. The r11 critic measured `apartment-modern-bar` as the worst crush in
        // the lane "by a wide margin, 5.08 % at literal sRGB zero, and the whole balcony stack is a
        // wall of it". Removing the pocket is a real reduction in the minimum irradiance, which is
        // the only quantity that governs the fault; darkening a card was never going to help.
        balconyLife(ctx, { x: u, y: yBal, z: midZ, proj: balcProj, salt: s + c });
      }
    }

    ctx.add(framedWindow(ctx, {
      opening: openingRecord({
        face: 'back', u: -midW * 0.22, y: bandY(s, 0.48), w: 1.22, h: 1.42,
        plane: zB, faceSign: -1,
      }),
      id: `bw-l-${s}`, lights: 1, interactive: false,
    }));
    ctx.add(framedWindow(ctx, {
      opening: openingRecord({
        face: 'back', u: midW * 0.22, y: bandY(s, 0.48), w: 1.22, h: 1.42,
        plane: zB, faceSign: -1,
      }),
      id: `bw-r-${s}`, lights: 1, interactive: false,
    }));
  }

  ctx.add([{
    geometry: slab(width + 0.10, 0.14, depth + 0.10, 0, top, zc, 'main-deck'),
    material: p.roof,
  }]);

  // **r12 — the setback level IS the sixth storey.** It was a 1.05 m parapet-height box; it is now
  // a full 2.92 m storey with its own windows, set back on all four sides, standing on the
  // full-width parapet at `top`. That is the same total storey count V350 asks for and a
  // fundamentally different silhouette: the full-width mass now stops at 14.68 m against a 13.88 m
  // frontage instead of running to 18.98 m, and what stands above it is visibly a set-back top
  // storey rather than the shoulder of a tower.
  // The top storey's setback is this id's pitch axis: a flat-roofed bar has no plane to tilt,
  // and how far the penthouse stands back from the parapet is what a player reads at board zoom.
  const terrW = width * (0.72 / Math.max(0.90, V?.roofK ?? 1));
  const terrD = depth * (0.74 / Math.max(0.90, V?.roofK ?? 1));
  const terrH = STOREY;
  const terrZ = zc + 0.18;
  const terrY1 = top + terrH;

  // **r2 — THE BOOKENDS RUN ABOVE THE PARAPET, AND THIS IS THE ID'S SHOULDER LINE.**
  //
  // The r1 critic measured this id at **0.000 m of height spread** across four facades: everything
  // above the fifth floor — deck, terrace box, overrun — was authored at fixed heights, so twelve
  // instances stood at exactly one height. The apex takes its rung from the overrun below; this is
  // the other half, and it is the half that matters for a BAR. §5.3.7's ruling is that the typology
  // is the identity and a bar is read by its long horizontal shoulder, so the line worth varying is
  // where the brick ends against the sky rather than how tall the whole thing is.
  //
  // Built as an upstand ON the deck rather than by extending the bookend volume: the deck is a
  // full-width slab laid at `top`, so a taller volume would have driven its own walls through it.
  //
  // **And it is clipped OUTBOARD of the set-back storey, which an instrument found rather than a
  // plate.** The first draft ran the upstand across the whole bookend footprint and
  // `v371-g2-overlap.mjs` measured it **0.160 m inside `sw-f-0-sill`** — through the penthouse
  // windows — because the terrace box widens as `roofK` falls and reaches within 1.1 m of the
  // bookend's outer face at the shallowest rung. So the upstand runs from the outer face inward
  // only as far as the terrace's own face less a 0.12 m gap: a separating axis in X that holds at
  // every rung of both axes, not a clearance that happens to work at the one I measured. Below
  // 0.35 m of remaining width there is no upstand — a 200 mm brick fin is not a member.
  const bookUp = V?.sky?.alt ?? 0;
  if (bookUp > 0.05) {
    for (const sign of [-1, 1]) {
      const outer = sign * (width / 2 + 0.03);
      // `Math.max`, not `min` — the clip has to take the MORE outboard of the two constraints. The
      // first draft took the nearer one and `v371-g2-overlap.mjs` measured the upstand 0.160 m
      // through the penthouse sills, because the bookend's own inner edge sits inboard of the
      // terrace face on every rung where `roofK` is low. Whichever face is further out is the one
      // that governs.
      // 0.34 m of gap, not 0.12: the set-back storey's flank windows carry a PROUD SILL that hangs
      // outboard of the wall plane it is punched in, so clearing the wall does not clear the
      // opening. Measured with `v371-g2-overlap.mjs` at 0.090 m of remaining overlap on the 0.12
      // gap, and the weathering capping — which is wider than the body — took it to 0.100 m.
      const inner = sign * Math.max(width / 2 - endW, terrW / 2 + 0.34);
      const upW = Math.abs(outer - inner);
      if (upW < 0.35) continue;
      const ux = (outer + inner) / 2;
      const tag = sign < 0 ? 'l' : 'r';
      // The capping and its shadow bead overhang OUTWARD only. A capping centred on its own body
      // reaches inboard as well, which is the direction the terrace is in.
      ctx.add([
        {
          geometry: slab(upW, bookUp, depth + 0.06, ux, top + 0.14, zc, `book-up-${tag}`),
          material: p.wallAlt,
        },
        {
          geometry: slab(upW + 0.10, 0.10, depth + 0.20, ux + sign * 0.05, top + 0.14 + bookUp, zc, `book-up-cap-${tag}`),
          material: p.trim,
        },
        {
          geometry: slab(upW + 0.05, 0.055, depth + 0.12, ux + sign * 0.025, top + 0.09 + bookUp, zc, `book-up-bead-${tag}`),
          material: p.shadow,
        },
      ]);
    }
  }

  const setWinW = 1.42;
  const setWinH = 1.62;
  const setFront = [];
  const setBack = [];
  const setLeft = [];
  const setRight = [];
  for (let c = 0; c < 3; c += 1) {
    const u = -terrW / 2 + (c + 0.5) * (terrW / 3);
    setFront.push(hole(u, top + 0.62, setWinW, setWinH, `set-f-${c}`));
  }
  setBack.push(hole(-terrW * 0.24, top + 0.66, 1.26, 1.42, 'set-b-l'));
  setBack.push(hole(terrW * 0.24, top + 0.66, 1.26, 1.42, 'set-b-r'));
  setLeft.push(hole(terrZ + 0.20, top + 0.66, 1.20, 1.42, 'set-l'));
  setRight.push(hole(terrZ + 0.20, top + 0.66, 1.20, 1.42, 'set-r'));
  ctx.add(volume(ctx, {
    material: p.wall,
    x: 0,
    zFront: terrZ + terrD / 2,
    zBack: terrZ - terrD / 2,
    width: terrW,
    y0: top,
    y1: terrY1,
    front: setFront,
    back: setBack,
    left: setLeft,
    right: setRight,
    name: 'terrace-box',
  }));
  for (let c = 0; c < 3; c += 1) {
    const u = -terrW / 2 + (c + 0.5) * (terrW / 3);
    ctx.add(framedWindow(ctx, {
      opening: openingRecord({
        face: 'front', u, y: top + 0.62, w: setWinW, h: setWinH, plane: terrZ + terrD / 2,
      }),
      id: `sw-f-${c}`, lights: 2, interactive: false, label: 'Penthouse window',
    }));
  }
  for (const [u, tag] of [[-terrW * 0.24, 'l'], [terrW * 0.24, 'r']]) {
    ctx.add(framedWindow(ctx, {
      opening: openingRecord({
        face: 'back', u, y: top + 0.66, w: 1.26, h: 1.42, plane: terrZ - terrD / 2, faceSign: -1,
      }),
      id: `sw-b-${tag}`, lights: 1, interactive: false,
    }));
  }
  ctx.add(framedWindow(ctx, {
    opening: openingRecord({
      face: 'left', u: terrZ + 0.20, y: top + 0.66, w: 1.20, h: 1.42,
      plane: -terrW / 2, axis: 'z', faceSign: -1,
    }),
    id: 'sw-fl-l', lights: 1, interactive: false,
  }));
  ctx.add(framedWindow(ctx, {
    opening: openingRecord({
      face: 'right', u: terrZ + 0.20, y: top + 0.66, w: 1.20, h: 1.42,
      plane: terrW / 2, axis: 'z', faceSign: 1,
    }),
    id: 'sw-fl-r', lights: 1, interactive: false,
  }));
  ctx.add(stringCourse(ctx, {
    x: 0, z: terrZ, w: terrW, d: terrD, y: terrY1 - 0.04, thick: 0.10, proud: 0.06,
  }));
  ctx.add(flatParapet(ctx, {
    x: 0, z: terrZ, w: terrW, d: terrD, y: terrY1, planted: true, name: 'terrace',
  }));
  ctx.add(planter(ctx, {
    x: 0, y: terrY1 + 0.06, z: terrZ + terrD / 2 - 0.34,
    w: terrW * 0.82, d: 0.62, h: 0.46, name: 'rim-f',
  }));
  ctx.add(planter(ctx, {
    x: -terrW / 2 + 0.36, y: terrY1 + 0.06, z: terrZ + 0.10,
    w: 0.62, d: terrD * 0.52, h: 0.42, name: 'rim-l',
  }));
  ctx.add(planter(ctx, {
    x: terrW / 2 - 0.36, y: terrY1 + 0.06, z: terrZ - 0.15,
    w: 0.62, d: terrD * 0.48, h: 0.44, name: 'rim-r',
  }));
  // `bed-a` moved off the plant room. It sat at x = -1.15 with a 1.35 m box while the plant
  // room runs from about x = -1.4; the containment probe measured its first two clumps 224 mm
  // and 169 mm inside `plant-room-left`. Pushed clear to the terrace's own left quarter.
  // r12 — `bed-a` moves to the OTHER side. The plant room moved to the terrace's left quarter this
  // round (see below), which is exactly where r10 had put this bed to get it off the old central
  // plant room. Measured rather than eyeballed: the bed spans x 2.42..3.58 and the plant room
  // −3.70..−0.30, so they are 2.7 m apart.
  ctx.add(planter(ctx, {
    x: terrW * 0.30, y: terrY1 + 0.06, z: terrZ - terrD * 0.30,
    w: 1.15, d: 0.80, h: 0.50, name: 'bed-a',
  }));

  // r12 — the plant room is a lift overrun, not a storey. At 2.32 m it put a second box on top of
  // the terrace box and took the actual bounds to 22.35 m against a declared ridge of 20.40; the
  // r11 critic read the resulting stack as the shoulder of a tower from above. 0.95 m is what an
  // overrun is, and it moves to one end so the roofline stays a long horizontal rather than
  // presenting a central turret.
  const prW = terrW * 0.34;
  const prD = terrD * 0.42;
  // r2 — the overrun height is a rung (0.80 / 1.05 / 1.30 / 1.55 m) and it is what moves this id's
  // APEX. r12 cut this member from 2.32 m to 0.95 m because at 2.32 it read as the shoulder of a
  // tower from above; the top rung is a third under what r12 removed, and the box is 34 % of the
  // terrace width standing at one end, so no rung turns the roofline into a turret.
  const prH = V?.sky?.step ?? 0.95;
  const prX = -terrW * 0.20;
  const prZf = terrZ - terrD * 0.06;
  const prZb = prZf - prD;
  const prY1 = terrY1 + prH;
  // The vent is sized to the overrun it is punched through: 0.46 m in a 0.95 m box, not the 0.92 m
  // it was when the box was 2.32 m tall. A hole taller than its wall is a hole through the envelope.
  const prVent = [hole(prX, terrY1 + 0.26, 0.78, 0.46, 'pr-vent')];
  ctx.add(volume(ctx, {
    material: p.wallAlt,
    x: prX,
    zFront: prZf,
    zBack: prZb,
    width: prW,
    y0: terrY1,
    y1: prY1,
    front: prVent,
    name: 'plant-room',
  }));
  ctx.add(framedWindow(ctx, {
    opening: openingRecord({
      face: 'front', u: prX, y: terrY1 + 0.26, w: 0.78, h: 0.46, plane: prZf,
    }),
    id: 'plant-vent', lights: 1, interactive: false,
  }));
  ctx.add([
    { geometry: slab(prW + 0.16, 0.14, prD + 0.16, prX, prY1, (prZf + prZb) / 2, 'pr-roof'), material: p.roof },
  ]);
  // The HVAC comes off the plant-room roof and stands on the terrace instead. On the overrun it was
  // the tallest thing on the model and it was a 420 mm lump at the apex of the stack the r11 critic
  // read as a tower shoulder from above; on the terrace deck it is a plant enclosure beside the
  // overrun, which is where it belongs and where it costs the silhouette nothing.
  ctx.add([
    { geometry: box(0.62, 0.46, 0.52, prX + prW * 0.72, terrY1 + 0.23, (prZf + prZb) / 2 + 0.20, 'hvac-a'), material: p.joinery },
    { geometry: box(0.44, 0.34, 0.40, prX + prW * 1.28, terrY1 + 0.17, (prZf + prZb) / 2 - 0.05, 'hvac-b'), material: p.joinery },
  ]);

  ctx.add(downpipes(ctx, {
    xL: leftPlane - 0.05, xR: rightPlane + 0.05, z: zF - 0.06, y0: 0.02, y1: top,
  }));

  ctx.add(composeModernLot(ctx, {
    entryX: 0,
    density: 'lean',
    deckZ: zF + 0.08,
    extraShrubs: [
      { x: -endW * 0.15, z: zF + 0.58, r: 0.50, h: 0.74 },
      { x: endW * 0.20, z: zF + 0.52, r: 0.44, h: 0.66 },
      { x: leftPlane + 0.55, z: zF + 0.42, r: 0.38, h: 0.58 },
      { x: rightPlane - 0.55, z: zF + 0.40, r: 0.40, h: 0.60 },
      { x: leftPlane - 0.48, z: flankStreetZ, r: 0.36, h: 0.70 },
      { x: rightPlane + 0.48, z: flankStreetZ + 0.15, r: 0.34, h: 0.62 },
    ],
  }));
}
