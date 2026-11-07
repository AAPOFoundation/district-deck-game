// V3.60 — house-modern-pavilion. Cream street cube + taller charcoal rear cube.

import {
  floorPlate, volume, hole, openingRecord, plinthCourse,
  flatParapet, slabBalcony, planter, downpipes, blade, lantern, houseNumber,
  shrubMass, brickCourses,
} from './modern-kit.js';
import { framedWindow, modernDoor } from './modern-detail.js';
import { fenU, fenY, fenW, fenH, fenLights } from './modern-variants.js';
import { composeModernLot, LOT_DATUM } from './modern-garden.js';
import { box } from '../core.js';

export default function build(ctx) {
  const { env, p } = ctx;
  // V3.71 Lane G. Two offset cubes, cream street pavilion in front of a taller charcoal rear
  // cube, is the identity and none of it moves. What moves is the proportion of each cube, how
  // far the rear one stands above the front one, the window rhythm and the entry.
  const V = ctx.var;
  const y0 = env.floorY;
  const storey = 3.00;
  const y1 = y0 + storey;
  const y2 = y1 + storey;
  // The rear cube's overtopping is this id's pitch axis: it has no roof plane to tilt, so the
  // step between the two lids is the thing a player sorts one instance from another by.
  // **r2 — the overtop is a RUNG.** r1 varied it through `roofK` alone and measured 0.145 m of
  // height spread across twelve instances — 0.72 px up a facade at §5.4.0's board scale, which is
  // no spread at all. The rungs add 0 / 0.30 / 0.60 / 0.92 m, so the step between the two lids —
  // the one line this id's silhouette is composed on — is authored rather than sampled.
  const yRear = y2 + 0.55 * (V?.roofK ?? 1) + (V?.sky?.step ?? 0);

  const creamW = env.bodyW * (V?.mass?.creamW ?? 0.60);
  const creamD = env.bodyD * (V?.mass?.creamD ?? 0.48);
  const rearW = env.bodyW * (V?.mass?.rearW ?? 0.48);
  const rearD = env.bodyD * (V?.mass?.rearD ?? 0.50);
  const creamX = -env.bodyW * 0.18;
  const rearX = env.bodyW * 0.24;
  const creamZFront = env.frontZ;
  const creamZBack = env.frontZ - creamD;
  const creamZc = (creamZFront + creamZBack) / 2;
  const rearZFront = env.frontZ - creamD * 0.38;
  const rearZBack = rearZFront - rearD;
  const rearZc = (rearZFront + rearZBack) / 2;

  const creamLeft = creamX - creamW / 2;
  const creamRight = creamX + creamW / 2;
  const doorW = 1.08;
  const doorH = 2.24;
  const doorU = Math.min(
    creamRight - 0.40 - doorW / 2,
    creamLeft + 0.44 + doorW / 2 + (V?.entry?.doorShift ?? 0) * 0.7,
  );
  const glassG = {
    u: fenU(V, creamX + creamW * 0.12, creamX, creamW * 0.35, creamW / 2, 0.20),
    y: y0 + 0.08,
    w: fenW(V, creamW * 0.70),
    h: fenH(V, storey - 0.36),
  };
  const glassU = {
    u: fenU(V, creamX + 0.06, creamX, creamW * 0.39, creamW / 2, 0.16),
    y: fenY(V, y1 + 0.10, 1),
    w: fenW(V, creamW * 0.78),
    h: fenH(V, storey - 0.42),
  };

  ctx.add(floorPlate(ctx, {
    w: creamW, d: creamD, x: creamX, z: creamZc,
    height: y0, material: p.wall, cap: false,
  }));
  ctx.add(floorPlate(ctx, {
    w: rearW, d: rearD, x: rearX, z: rearZc,
    height: y0, material: p.wallAlt, cap: false,
  }));

  // §2.3 — both cubes get a plinth course. The r1 plate had the charcoal-brick rear cube
  // meeting the lawn on a bare line, which is the fault the section names, and it is more
  // obvious on a brick mass than on a rendered one because the bond runs straight into grass.
  for (const m of [
    { w: creamW, d: creamD, x: creamX, z: creamZc },
    { w: rearW, d: rearD, x: rearX, z: rearZc },
  ]) {
    ctx.add(plinthCourse(ctx, {
      x: m.x, z: m.z, w: m.w, d: m.d,
      y0: LOT_DATUM - 0.14, h: y0 + 0.52 - (LOT_DATUM - 0.14),
    }));
  }

  const creamFront = [
    hole(doorU, y0, doorW, doorH, 'door'),
    hole(glassG.u, glassG.y, glassG.w, glassG.h, 'glass-g'),
    hole(glassU.u, glassU.y, glassU.w, glassU.h, 'glass-u'),
  ];
  const creamRY = fenY(V, y1 + 0.38, 1);
  const creamLY = fenY(V, y1 + 0.42, 1);
  const creamRightHoles = [
    hole(creamZc + 0.35, creamRY, 1.05, 1.55, 'cream-r'),
  ];
  const creamLeftHoles = [
    hole(creamZc + 0.55, creamLY, 0.95, 1.35, 'cream-l'),
  ];
  ctx.add(volume(ctx, {
    material: p.wall,
    x: creamX, zFront: creamZFront, zBack: creamZBack, width: creamW,
    y0, y1: y2,
    front: creamFront,
    right: creamRightHoles,
    left: creamLeftHoles,
    name: 'cream',
  }));

  ctx.add(modernDoor(ctx, {
    opening: openingRecord({
      face: 'front', u: doorU, y: y0, w: doorW, h: doorH, plane: creamZFront,
    }),
    id: 'front-door', timber: false, interactive: true,
  }));
  ctx.add(framedWindow(ctx, {
    opening: openingRecord({
      face: 'front', u: glassG.u, y: glassG.y, w: glassG.w, h: glassG.h, plane: creamZFront,
    }),
    id: 'street-glass-g', lights: 3, interactive: true,
  }));
  ctx.add(framedWindow(ctx, {
    opening: openingRecord({
      face: 'front', u: glassU.u, y: glassU.y, w: glassU.w, h: glassU.h, plane: creamZFront,
    }),
    id: 'street-glass-u', lights: 3, interactive: true,
  }));
  ctx.add(framedWindow(ctx, {
    opening: openingRecord({
      face: 'right', u: creamZc + 0.35, y: creamRY, w: 1.05, h: 1.55,
      plane: creamRight, axis: 'z', faceSign: 1,
    }),
    id: 'cream-right', lights: fenLights(V, 0, 1, 2, 2), interactive: false,
  }));
  ctx.add(framedWindow(ctx, {
    opening: openingRecord({
      face: 'left', u: creamZc + 0.55, y: creamLY, w: 0.95, h: 1.35,
      plane: creamLeft, axis: 'z', faceSign: -1,
    }),
    id: 'cream-left', lights: fenLights(V, 1, 1, 2, 2), interactive: false,
  }));

  ctx.add(slabBalcony(ctx, {
    x: creamX, y: y1, z: creamZFront, w: creamW - 0.16, proj: 1.12,
    railPitch: V?.count?.railPitch,
  }));

  // Cream lid stays cream — charcoal parapet walls belong on the rear cube only.
  ctx.add([
    { geometry: box(creamW + 0.10, 0.12, creamD + 0.10, creamX, y2 + 0.04, creamZc, 'cream-deck'), material: p.wall },
    // r3 §5.5.10 — the lid lips are `joinery`. On this id they are the line the cream cube is read
    // by against the sky, and near-white they put the brightest band on the building at its
    // silhouette edge — the opposite of what the reference does with a parapet.
    { geometry: box(creamW + 0.18, 0.16, 0.12, creamX, y2 + 0.08, creamZFront + 0.02, 'cream-lip-f'), material: p.joinery },
    { geometry: box(creamW + 0.18, 0.16, 0.12, creamX, y2 + 0.08, creamZBack - 0.02, 'cream-lip-b'), material: p.joinery },
    { geometry: box(0.12, 0.16, creamD, creamRight + 0.02, y2 + 0.08, creamZc, 'cream-lip-r'), material: p.joinery },
    { geometry: box(0.12, 0.16, creamD, creamLeft - 0.02, y2 + 0.08, creamZc, 'cream-lip-l'), material: p.joinery },
  ]);

  // Storey bands, moved whole. Two windows in one band can never converge on each other because
  // they take the same delta; the bands are 2.4 m apart against a ±90 mm move.
  const bG = fenY(V, y0 + 0.62, 0);
  const b1 = fenY(V, y1 + 0.42, 1);
  const b1f = fenY(V, y1 + 0.38, 1);
  const rearFront = [
    hole(rearX + rearW * 0.18, b1f, 1.15, 1.40, 'rear-f'),
  ];
  // **r3 — THE THIRD BAND COMES OFF THE REAR CUBE, AND THIS IS A §1.2 FAULT NOBODY HAD LOOKED
  // FOR.** `b2` sits at `y2 + 0.18` and its openings are 1.20–1.25 m tall, so their heads land at
  // about `y2 + 1.45` and their drips 190 mm above that. The rear cube's own top is
  // `yRear = y2 + 0.55·roofK + sky.step`, which at the no-op rung is `y2 + 0.40` to `y2 + 0.72`.
  // **The band therefore stood up to a metre PROUD OF THE ROOF IT WAS PUNCHED IN**: measured on
  // docklands-quay f2, `rear-right-2-frame-head` runs to 7.731 m and `rear-right-2-drip` to 7.851
  // against a cube topping out at 6.766 — a reveal, a frame, a sash and a drip hanging in the air
  // above the parapet with no wall behind them. §1.2 counts "a hole through the envelope" and "a
  // floating element with no support"; this is both.
  //
  // It is pre-existing — the same arithmetic holds at HEAD, where `yRear` is `y2 + 0.55` flat — and
  // no instrument in this lane could have found it: the overlap probe tests new members against
  // other members, and a window standing in mid-air intersects nothing at all.
  //
  // **It is also the whole of the r2 critic's pavilion finding.** The apex at the two lower rungs
  // was that drip at 7.74–7.87 m rather than the cube, so an authored 0.92 m of `sky.step` measured
  // 0.369 m at the silhouette: the axis was moving a cube that was not the tallest thing on the
  // building. With the band gone the rung moves the apex itself, one metre for one metre.
  //
  // A third band cannot be re-housed lower — `b1`'s heads already reach `y1 + 1.87` — so the rear
  // cube is what it always was, a two-storey mass with a raised parapet, and it is now built that
  // way. Ten openings remain on the id.
  const rearRight = [
    hole(rearZc + 0.85, bG, 1.20, 1.45, 'rear-r-g'),
    hole(rearZc + 0.85, b1, 1.20, 1.45, 'rear-r-1'),
  ];
  const rearBack = [
    hole(rearX - 0.35, bG, 1.30, 1.45, 'rear-b-g'),
    hole(rearX + 0.55, b1, 1.25, 1.45, 'rear-b-1'),
  ];
  ctx.add(volume(ctx, {
    material: p.wallAlt,
    x: rearX, zFront: rearZFront, zBack: rearZBack, width: rearW,
    y0, y1: yRear,
    front: rearFront,
    right: rearRight,
    back: rearBack,
    name: 'rear',
  }));

  // **r2 — the rear cube is COURSED, and this is both a member-count axis and the closing of the
  // round's one identity complaint about this id.**
  //
  // V350's line is a "charcoal BRICK rear cube" and the r1 critic ranked the id last of six on
  // exactly that clause: the two cubes are meant to sit in opposite value bands and read as two
  // materials, and the rear one carried no bond at all — a flat charcoal box beside a flat cream
  // one. Bed joints are what says brick. They are also the cheapest countable member on the id
  // (§5.5.5): the pitch rungs run 21 courses to 11 up a 7 m cube, which is a rhythm a player can
  // count at a close orbit and a texture difference at board zoom.
  //
  // `maxRows` is raised to 24 because the helper's default of 14 would clamp every rung below
  // 0.52 m to the same pitch and the axis would silently collapse to two values.
  // The front run stops clear of the linking blade rather than crossing it — `v371-g2-overlap.mjs`
  // measured a joint 0.028 m inside `blade` on the first draft, which is the joint's whole
  // thickness. The blade is the member the two cubes are joined by and a bed course does not run
  // over it any more than it runs over a downpipe.
  const bladeRight = (creamRight + (rearX - rearW / 2)) / 2 + 0.10;
  // ...and clear of the cream cube's own flank window furniture, whose head drip stands 0.20 m
  // proud of `creamRight`. Measured at 0.028 m of joint inside `cream-right-drip` before this term.
  const frontU0 = Math.max(rearX - rearW / 2 + 0.05, bladeRight + 0.06, creamRight + 0.30);
  const frontU1 = rearX + rearW / 2 - 0.05;
  // **r3 — the LEFT flank is coursed too, and this is the pavilion's member-count re-earn.**
  // The r2 critic's arithmetic on this id is right and it should be said plainly: its headline
  // 0.600 m of silhouette spread was 39 % `planter-clump` foliage riding `lot.plantScale`, which is
  // a CONTINUOUS axis — the very kind §5.5.5a exists to retire — and its architectural spread was
  // 0.369 m, or 1.83 px. So the id is re-earned where §5.5.5 says variation actually reads: on a
  // member a player can count. The rear cube's left flank was a blank charcoal face with no
  // opening and no bond on it, which is the same fault r1 booked on the whole cube, half-fixed.
  // Coursing it puts the `coursePitch` rung on a third face and raises the census by about half,
  // and it costs shadow-bucket relief strips on an id sitting at 4,588 of 9,000.
  for (const face of [
    { axis: 'z', face: 1, plane: rearX + rearW / 2, centre: rearZc, run: rearD - 0.10, openings: rearRight },
    { axis: 'z', face: -1, plane: rearX - rearW / 2, centre: rearZc, run: rearD - 0.10, openings: [] },
    {
      axis: 'x', face: 1, plane: rearZFront, centre: (frontU0 + frontU1) / 2,
      run: frontU1 - frontU0, openings: rearFront,
    },
  ]) {
    ctx.add(brickCourses(ctx, {
      ...face, y0: y0 + 0.52, y1: yRear - 0.10, pitch: V?.count?.coursePitch ?? 0.52, maxRows: 24,
    }));
  }

  ctx.add(framedWindow(ctx, {
    opening: openingRecord({
      face: 'front', u: rearX + rearW * 0.18, y: b1f, w: 1.15, h: 1.40, plane: rearZFront,
    }),
    id: 'rear-front', lights: 2, interactive: false,
  }));
  ctx.add(framedWindow(ctx, {
    opening: openingRecord({
      face: 'right', u: rearZc + 0.85, y: bG, w: 1.20, h: 1.45,
      plane: rearX + rearW / 2, axis: 'z', faceSign: 1,
    }),
    id: 'rear-right-g', lights: 2, interactive: false,
  }));
  ctx.add(framedWindow(ctx, {
    opening: openingRecord({
      face: 'right', u: rearZc + 0.85, y: b1, w: 1.20, h: 1.45,
      plane: rearX + rearW / 2, axis: 'z', faceSign: 1,
    }),
    id: 'rear-right-1', lights: 2, interactive: false,
  }));
  ctx.add(framedWindow(ctx, {
    opening: openingRecord({
      face: 'back', u: rearX - 0.35, y: bG, w: 1.30, h: 1.45,
      plane: rearZBack, axis: 'x', faceSign: -1,
    }),
    id: 'rear-back-g', lights: 2, interactive: false,
  }));
  ctx.add(framedWindow(ctx, {
    opening: openingRecord({
      face: 'back', u: rearX + 0.55, y: b1, w: 1.25, h: 1.45,
      plane: rearZBack, axis: 'x', faceSign: -1,
    }),
    id: 'rear-back-1', lights: 2, interactive: false,
  }));

  ctx.add(flatParapet(ctx, {
    x: rearX, z: rearZc, w: rearW, d: rearD, y: yRear, planted: true,
  }));
  ctx.add(planter(ctx, {
    x: rearX + rearW * 0.10, y: yRear + 0.12, z: rearZc - rearD * 0.08,
    w: rearW * 0.40, d: rearD * 0.34, h: 0.40,
  }));
  ctx.add(shrubMass(ctx, {
    x: rearX - 0.55, z: rearZc + 0.30, r: 0.58, h: 0.88, y: yRear + 0.40,
  }));
  ctx.add(shrubMass(ctx, {
    x: rearX + 0.70, z: rearZc - 0.22, r: 0.46, h: 0.74, y: yRear + 0.38,
  }));
  ctx.add(shrubMass(ctx, {
    x: rearX + 0.10, z: rearZc + 0.48, r: 0.36, h: 0.56, y: yRear + 0.36,
  }));

  ctx.add(blade(ctx, {
    x: (creamRight + (rearX - rearW / 2)) / 2,
    zFront: creamZFront - 0.08,
    zBack: rearZBack + 0.08,
    y0, y1: y2, thick: 0.20, material: p.wallAlt,
  }));
  ctx.add(downpipes(ctx, {
    xL: creamLeft - 0.05, xR: creamRight + 0.04,
    z: creamZFront - 0.10, y0: 0.02, y1: y2 - 0.06,
  }));
  const lampSide = V?.entry?.lampSide ?? 1;
  ctx.add(lantern(ctx, { x: doorU + lampSide * 0.68, y: y0 + 1.92, z: creamZFront, facing: 1 }));
  ctx.add(houseNumber(ctx, { x: doorU - lampSide * 0.72, y: y0 + 1.55, z: creamZFront, facing: 1 }));

  // **The room moved BEHIND the pane.** At 0.22 m it sat 20 mm in front of the glass, inside
  // the reveal, which is why the r7 plate reads a red bar across the bottom of the curtain wall
  // rather than a table in a room. `modern-detail.js` puts the pane at 0.24 and the room plane
  // at 0.46; the furniture now sits between them, and the pane is transparent enough to show it
  // (`modern-surfaces.js` GLASS_RAMP.opacity).
  const zIn = creamZFront - 0.36;
  ctx.add([
    // `wallAlt`, not `trim`. This member is the first-floor slab edge seen THROUGH the upper
    // curtain wall, and in `trim` it renders at 161 behind a pane that renders at 40 — which is
    // exactly r9's major 3, "a hard-edged pale rectangle floats inside it at x503-511/y360-370
    // with nothing beneath it". A concrete slab edge in a room is not the brightest thing in the
    // frame. In `wallAlt` it renders at 79, close enough to the pane that it reads as depth
    // behind glass rather than as a sticker on it, and it is the right material for a slab.
    { geometry: box(glassU.w - 0.20, 0.10, 0.30, glassU.u, y1 - 0.02, zIn, 'l1-sill'), material: p.wallAlt },
    { geometry: box(1.48, 0.08, 0.62, glassG.u, y0 + 0.76, zIn, 'table-top'), material: p.timber },
    { geometry: box(0.10, 0.70, 0.10, glassG.u - 0.55, y0 + 0.38, zIn - 0.18, 'table-leg-l'), material: p.timber },
    { geometry: box(0.10, 0.70, 0.10, glassG.u + 0.55, y0 + 0.38, zIn + 0.16, 'table-leg-r'), material: p.timber },
    { geometry: box(0.40, 0.52, 0.08, glassG.u - 0.10, y0 + 0.70, zIn + 0.28, 'chair-back'), material: p.timber },
    { geometry: box(0.26, 0.20, 0.26, glassG.u + 1.35, y0 + 0.18, zIn, 'pot'), material: p.wallAlt },
    // **r12 — the pendant is gone, and identifying it is the whole of major 2.**
    //
    // r2, r9 and r11 all booked "a hard-edged pale rectangle floats inside the curtain wall with
    // nothing under it". r10 read that as `l1-sill`, the first-floor slab edge, and moved it from
    // `trim` to `wallAlt`. The fault survived, and the r11 critic said why in one sentence: "it is
    // darker and it is still a floating rectangle rather than a slab edge, **because a slab edge is
    // a full-width horizontal band and this is an isolated square in the middle of a pane**."
    //
    // It was never `l1-sill`. `l1-sill` is 4.1 m wide and 290 px on the detail plate. The critic
    // measured the object at x≈378–392 / y≈278–292 — a 14 px square, at the height of a pendant
    // hung 1.76 m above the first floor. It was `lamp-globe`: a 200 mm cube in `trim`, which
    // renders 161–168, hung on a 40 mm `lamp-drop` in `joinery` that is sub-pixel BEHIND A PANE at
    // every graded distance. The brightest object on the elevation, hanging on an invisible wire.
    //
    // Three rounds tried to make it read as supported by changing a value. It is a geometry
    // problem: nothing 40 mm across is going to read as support through glass. The lamp moves onto
    // the table, where its support is a 260 mm base standing on a surface the plate can see.
    { geometry: box(0.13, 0.24, 0.13, glassG.u + 0.52, y0 + 0.92, zIn - 0.06, 'lamp-stem'), material: p.joinery },
    { geometry: box(0.26, 0.18, 0.26, glassG.u + 0.52, y0 + 1.13, zIn - 0.06, 'lamp-shade'), material: p.trim },
  ]);

  ctx.add(composeModernLot(ctx, {
    entryX: doorU,
    deckZ: creamZFront + 0.10,
  }));
}
