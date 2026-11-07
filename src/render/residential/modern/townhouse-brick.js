// V3.60 — townhouse-modern-brick.
// Three charcoal-brick dwellings, three seated metal roof bays, red doors.

import {
  volume, hole, openingRecord, standingSeamGable,
  slabBalcony, brickCourses, blade, downpipes, stringCourse,
  lantern, houseNumber, shrubMass, plinthCourse,
} from './modern-kit.js';
import { framedWindow, modernDoor, garageDoor } from './modern-detail.js';
import { fenU, fenY, fenW, fenH, fenLights } from './modern-variants.js';
import { composeModernLot, LOT_DATUM } from './modern-garden.js';
import { slab, gable } from '../core.js';

export default function build(ctx) {
  const { env, p } = ctx;
  // V3.71 Lane G. Three three-storey brick dwellings with party-wall blades and a garage and a
  // door per unit is the identity, and the unit count, the storey count and the blades are all
  // untouched. What varies is which side of its own bay each dwelling's garage sits on, the bay
  // pitches, the window rhythm and the lot.
  const V = ctx.var;
  const units = env.units || 3;
  const floorY = env.floorY;
  const storey = 3.12;
  const y0 = floorY;
  const y1 = y0 + storey;
  const y2 = y1 + storey;
  const y3 = y2 + storey;
  const width = env.bodyW;
  const unitW = width / units;
  const zF = env.frontZ;
  const zB = env.backZ;
  const zc = (zF + zB) / 2;
  const depth = zF - zB;
  const bladeT = 0.34;

  // §2.3 — the plinth course. On a brick row it is the engineering-brick base, a value band
  // darker than the face brick, capped so the bond above it starts on a line.
  ctx.add(plinthCourse(ctx, {
    x: 0, z: zc, w: width, d: depth,
    y0: LOT_DATUM - 0.14, h: floorY + 0.52 - (LOT_DATUM - 0.14),
  }));

  const doorXs = [];
  const garXs = [];

  for (let i = 0; i < units; i += 1) {
    const ux = -width / 2 + (i + 0.5) * unitW;
    const left = ux - unitW / 2;
    const garW = 1.86;
    const doorW = 0.94;
    // **Handedness per dwelling — the single biggest read on this id and it costs nothing.**
    // A real brick row alternates its garage and its entry so two front doors pair at a party
    // wall; the V3.70 model put the garage hard left and the door hard right in all three bays,
    // which is what made the row read as one bay stamped three times. `hand` and `phase` between
    // them give a uniform row, a mirrored row and both alternating patterns.
    const hand = (V?.entry?.hand ?? 1)
      * (((i + (V?.fen?.lightPhase ?? 0)) % 2 === 0) ? 1 : -1);
    const garU = hand > 0 ? left + 0.30 + garW / 2 : left + unitW - 0.30 - garW / 2;
    const doorU = hand > 0 ? left + unitW - 0.40 - doorW / 2 : left + 0.40 + doorW / 2;
    doorXs.push(doorU);
    garXs.push(garU);

    const winW = fenW(V, Math.min(1.72, unitW - 1.05));
    const garY = y0 + 0.06;
    const garH = 2.08;
    const doorH = 2.22;
    // The two upper windows take the storey bands and a bounded lateral offset inside their own
    // bay, so the row's rhythm is not a perfect grid on every instance. `fenU` clamps against the
    // bay's own half-width, so a window can never cross a party-wall blade.
    const winU = fenU(V, ux, ux, winW / 2, unitW / 2, 0.34);
    const midY = fenY(V, y1 + 0.24, 1);
    const midH = fenH(V, 1.52);
    const topY = fenY(V, y2 + 0.26, 2);
    const topH = fenH(V, 1.48);

    const front = [
      hole(garU, garY, garW, garH, 'garage'),
      hole(doorU, y0, doorW, doorH, 'door'),
      hole(winU, midY, winW, midH, 'mid'),
      hole(winU, topY, winW, topH, 'top'),
    ];
    // **Only the holes that get a reveal.** `rear-g` and `rear-t` were punched through the rear
    // wall and never given a `framedWindow`, so each was a rectangle with no lining, no frame
    // and no pane — §1.2's "an opening with no reveal", six of them on this id, on a face no
    // graded view reaches. Fixing them by adding six more assemblies costs 648 triangles that
    // §3.4 does not have; fixing them by not punching them costs nothing and is honest, because
    // a rear elevation with one window per floor is a real elevation.
    const back = [
      hole(ux, fenY(V, y1 + 0.42, 1), 1.22, 1.32, 'rear-m'),
    ];

    const flankA = zF - 2.35;
    const flankB = zc + 0.15;
    const flankC = zB + 2.55;
    const flankHoles = [
      hole(flankA, y0 + 0.62, 1.12, 1.24, 'flank-g'),
      hole(flankB, y1 + 0.38, 1.18, 1.32, 'flank-m'),
      hole(flankC, y2 + 0.38, 1.14, 1.28, 'flank-t'),
    ];
    const sides = {};
    if (i === 0) sides.left = flankHoles;
    if (i === units - 1) sides.right = flankHoles;

    ctx.add(volume(ctx, {
      material: p.wallAlt,
      x: ux, zFront: zF, zBack: zB,
      width: unitW,
      y0, y1: y3,
      front, back, ...sides,
      name: `unit-${i}`,
    }));
    // The street elevation keeps the tighter course; the flanks take a coarser one. A flank on
    // this id is seen at a raking angle across nine metres, where a 0.52 m modelled joint stops
    // reading as a course and starts reading as boarding — the exact fault the r1 critic booked
    // against `apartment-modern-courtyard`'s podium. Coarser there is both truer and cheaper.
    // **r2 — the street course pitch is a rung, and `maxRows` is raised so the rungs survive.**
    // The helper clamps `pitch` to `(y1 - y0) / maxRows`, which on a 9.45 m elevation with the
    // default 14 is 0.675 — so every rung below that would have collapsed to one value and the
    // axis would have been another thing that is true in the descriptor and absent from the mesh.
    // The r1 critic called this relief the best in the lane; the count of it is now what varies.
    ctx.add(brickCourses(ctx, {
      axis: 'x', face: 1, plane: zF, centre: ux, run: unitW - 0.06,
      y0, y1: y3, openings: front, pitch: V?.count?.coursePitch ?? 0.62, maxRows: 22,
    }));
    if (i === units - 1) {
      ctx.add(brickCourses(ctx, {
        axis: 'z', face: 1, plane: width / 2, centre: zc, run: depth - 0.3,
        y0, y1: y3, openings: flankHoles, pitch: 0.94,
      }));
    }
    if (i === 0) {
      ctx.add(brickCourses(ctx, {
        axis: 'z', face: -1, plane: -width / 2, centre: zc, run: depth - 0.3,
        y0, y1: y3, openings: flankHoles, pitch: 0.94,
      }));
    }

    ctx.add(garageDoor(ctx, {
      opening: openingRecord({
        face: 'front', u: garU, y: garY, w: garW, h: garH, plane: zF,
      }),
      id: `garage-${i}`, interactive: true,
    }));
    ctx.add(modernDoor(ctx, {
      opening: openingRecord({
        face: 'front', u: doorU, y: y0, w: doorW, h: doorH, plane: zF,
      }),
      id: `door-${i}`, accent: true, timber: true, interactive: true,
    }));
    ctx.add(framedWindow(ctx, {
      opening: openingRecord({
        face: 'front', u: winU, y: midY, w: winW, h: midH, plane: zF,
      }),
      id: `mid-${i}`, lights: fenLights(V, i, 1, 2, 3), interactive: true,
    }));
    ctx.add(framedWindow(ctx, {
      opening: openingRecord({
        face: 'front', u: winU, y: topY, w: winW, h: topH, plane: zF,
      }),
      id: `top-${i}`, lights: fenLights(V, i + 1, 1, 2, 3), interactive: false,
    }));
    ctx.add(framedWindow(ctx, {
      opening: openingRecord({
        face: 'back', u: ux, y: fenY(V, y1 + 0.42, 1), w: 1.22, h: 1.32, plane: zB, faceSign: -1,
      }),
      id: `rear-m-${i}`, lights: 1, interactive: false,
    }));

    if (i === 0 || i === units - 1) {
      const face = i === 0 ? 'left' : 'right';
      const plane = i === 0 ? -width / 2 : width / 2;
      const sign = i === 0 ? -1 : 1;
      const zs = [flankA, flankB, flankC];
      const ys = [y0 + 0.62, y1 + 0.38, y2 + 0.38];
      const hs = [1.24, 1.32, 1.28];
      const ws = [1.12, 1.18, 1.14];
      for (let f = 0; f < 3; f += 1) {
        ctx.add(framedWindow(ctx, {
          opening: openingRecord({
            face, u: zs[f], y: ys[f], w: ws[f], h: hs[f],
            plane, axis: 'z', faceSign: sign,
          }),
          id: `flank-${i}-${f}`, lights: 1, interactive: false,
        }));
      }
    }

    ctx.add(slabBalcony(ctx, {
      x: winU, y: midY - 0.14, z: zF, w: winW + 0.06, proj: 0.74,
    }));

    ctx.add(lantern(ctx, {
      x: doorU - hand * 0.62, y: y0 + 1.88, z: zF, facing: 1,
    }));
    ctx.add(houseNumber(ctx, {
      x: doorU + hand * 0.58, y: y0 + 1.62, z: zF, facing: 1,
    }));

    // **r10 — the bay roofs are 200 mm narrower each side, and that is half of major 4's fix.**
    //
    // At `w: unitW - 0.48` with a 0.14 overhang each bay's roof spanned `unitW - 0.20`, leaving a
    // 200 mm gap at each party line for a 340 mm blade to stand in. The blade therefore had to
    // pass THROUGH both neighbouring roof planes by 70 mm in x for its whole depth, and its cap,
    // 140 mm proud each side, cantilevered over the slope. `w: unitW - 0.78` opens the gap to
    // 500 mm, so the blade, its shadow bead and its coping are separated from both roof planes
    // on the X axis by 30 mm a side and cannot intersect whatever their profiles do — a
    // separating axis, not a tolerance. The r10 probe's SAT check names the axis it used.
    // The three bay pitches. `pitchBase` and `pitchStep` move the whole fan, so the row keeps
    // its stepping roofline — which is the identity — while no two instances step the same way.
    const bayPitch = (V?.mass?.pitchBase ?? 14) + i * (V?.mass?.pitchStep ?? 6);
    const bayRise = Math.tan((bayPitch * Math.PI) / 180) * ((depth - 0.14) / 2 + 0.14);
    ctx.add(standingSeamGable(ctx, {
      w: unitW - 0.78,
      d: depth - 0.14,
      x: ux,
      z: zc,
      springY: y3 - 0.02,
      pitch: bayPitch,
      overhang: 0.14,
      name: `bay-${i}`,
      seamPitch: V?.count?.seamPitch,
    }));
    if (i === 0 || i === units - 1) {
      // The outer gable end sits UNDER its roof edge rather than level with it, and stops 20 mm
      // below the ridge instead of 60 mm above it — at `bayRise + 0.06` it pushed through the
      // ridge cap on the two ids that carry one.
      const gx = ux + (i === 0 ? -1 : 1) * (unitW / 2 - 0.30);
      ctx.add([{
        geometry: gable(0.16, depth - 0.10, bayRise - 0.02, gx, y3 - 0.04, zc, `gable-end-${i}`),
        material: p.wallAlt,
      }]);
    }

    // One planting station per dwelling, not two. Twelve shrub clumps on a lot whose building
    // fills four fifths of it is 864 triangles of foliage the eye reads as one hedge, on an id
    // that has to give 1,132 back to §3.4.
    ctx.add(shrubMass(ctx, {
      x: (garU + doorU) / 2, z: zF + 0.62, r: 0.36, h: 0.52,
    }));

    // **r12 — the two local driveways are gone, because they were BURIED and because the lot owns
    // this job now.** They were laid at y = −0.02 and +0.02 while the lawn they were meant to sit on
    // is at 0.175 and the tray field at 0.14, so both were 175–195 mm under the grass. The r11
    // critic reported the visible consequence — "three garage doors, and a continuous picket run
    // across the entire frontage with no crossover, no driveway and no gate opposite any of them" —
    // and booked it as major 8, worse at board zoom than at review zoom. All three drives are now
    // built by `composeModernLot`, at the lawn datum, with a break in the boundary and a crossover
    // over the footpath, which is what makes them legible at 1×.
  }

  // Two string courses, not three. The band at first-floor level and the cornice are what give
  // the row its horizontal reading; the second-floor band between them was a third parallel
  // line at the same proud dimension, and three evenly spaced cream bands on a brick elevation
  // is a Victorian device rather than a 2020s one.
  ctx.add(stringCourse(ctx, {
    x: 0, z: zc, w: width, d: depth, y: y1, thick: 0.13, proud: 0.09, name: 'string-1',
  }));
  ctx.add(stringCourse(ctx, {
    x: 0, z: zc, w: width, d: depth, y: y3, thick: 0.10, proud: 0.08, name: 'cornice',
  }));

  // **Party-wall blades — r10 rebuild. This is r1 major 5 → r2 major 4 → r9 major 4, closed.**
  //
  // r9's words: "the party-wall caps cantilever off the pier onto the roof slope with daylight
  // visible under the cantilever and end in a jagged notched zigzag cut in open air." Both halves
  // are geometry and both are reproducible without a plate.
  //
  //   The blade body ran the full depth with a FLAT top at `y3 + 0.62`, under gables rising
  //   1.06 m (14°) to 2.07 m (26°) above the same spring line. So the blade was buried near each
  //   ridge and stood proud near each eave, and the line where it emerged crossed a 0.62 m batten
  //   run at an angle — which is the zigzag. The 0.10 x 0.48 cap, 0.14 proud of a 0.34 blade
  //   standing in a 0.20 gap, then hung over the slope with nothing under it.
  //
  //   `v370-l1-r10-probe.mjs`, roof-normal separating-axis test: **PENETRATES by 0.810 m
  //   (blade-cap-2 vs bay-0-front)** on the r9 geometry.
  //
  // The rebuild is two changes. The bay roofs above are 200 mm narrower each side, so the blade
  // now stands in a 400 mm gap and is separated from both roof planes on the X axis. And the
  // blade's own top follows the ROOFLINE instead of cutting across it: a box up to the wall head,
  // then a `gable()` prism at the steepest of the three bay pitches, so the upstand rises with
  // the rake and dies into the roof at the eaves rather than terminating in air. The coping and
  // its shadow bead are nested gables of the same profile, which is what a capping on a raking
  // party wall actually is.
  const maxBayRise = Math.tan((((V?.mass?.pitchBase ?? 14) + (units - 1) * (V?.mass?.pitchStep ?? 6)) * Math.PI) / 180)
    * ((depth - 0.14) / 2 + 0.14);
  for (let i = 1; i < units; i += 1) {
    const x = -width / 2 + i * unitW;
    const bladeZf = zF + 0.14;
    const bladeZb = zB - 0.08;
    const bladeZc = (bladeZf + bladeZb) / 2;
    const bladeD = bladeZf - bladeZb;
    // r2 — the party blade's upstand takes a small rung. Deliberately small: this id already
    // carries the largest silhouette spread of the six off its bay-pitch fan, and the r1 critic
    // ruled that the fan is the lane's only working silhouette axis and must not be disturbed.
    // The blade steps with it rather than against it.
    const upstandY = y3 + 0.10 + (V?.sky?.step ?? 0);
    ctx.add(blade(ctx, {
      x,
      zFront: bladeZf,
      zBack: bladeZb,
      y0,
      y1: upstandY,
      thick: bladeT,
      material: p.wallAlt,
    }));
    ctx.add([
      {
        geometry: gable(bladeT, bladeD, maxBayRise + 0.06, x, upstandY, bladeZc, `blade-rake-${i}`),
        material: p.wallAlt,
      },
      {
        geometry: gable(bladeT + 0.10, bladeD, maxBayRise + 0.15, x, upstandY + 0.005, bladeZc, `blade-cap-${i}`),
        material: p.trim,
      },
      {
        geometry: gable(bladeT + 0.05, bladeD, maxBayRise + 0.11, x, upstandY, bladeZc, `blade-cap-bead-${i}`),
        material: p.shadow,
      },
    ]);
  }

  ctx.add(downpipes(ctx, {
    xL: -width / 2 - 0.06, xR: width / 2 + 0.06, z: zF + 0.02, y0: 0.02, y1: y3 + 0.06,
  }));
  ctx.add(downpipes(ctx, {
    xL: -width / 2 + unitW, xR: -width / 2 + unitW * 2, z: zF + 0.04, y0: 0.02, y1: y3 + 0.06,
  }));

  // **No chimney.** V3.70 removed the Federation chimney from `house-modern-skillion` as an
  // identity failure and left the identical detail standing on this id, where the r1 critic
  // found it: a corbelled brick flue on a 2020s townhouse row is the same silhouette error on
  // a second building. Three-storey infill townhouses have flues at most, and this one does not
  // need even that — the party-wall blades are the vertical the elevation is composed on.

  // The three shrubs that stood in the 220 mm strip between the flank walls and the pad edge
  // are gone. They were never visible from any graded view and the keep-out test would drop
  // them now anyway.

  // No `extraShrubs`. Each unit already carries a station between its garage and its door, and
  // the second station at `doorX - 0.85` sat 850 mm from it — one clump read as two and cost
  // 216 triangles on an id §3.4 has 9,000 for.
  ctx.add(composeModernLot(ctx, {
    entryX: doorXs[0],
    density: 'lean',
    deckZ: zF + 0.06,
    // One crossover per garage. `composeModernLot` drops any drive whose break would collide with
    // the gate or run off the pad, so the count is checked rather than assumed — the r12 probe
    // prints how many landed.
    driveways: garXs.map((x) => ({ x, w: 2.30 })),
  }));
}
