// V3.60 — townhouse-modern-render. Mirrored cream pair, cedar field, folded metal lids.

import {
  volume, hole, openingRecord, seatedSkillion,
  slabBalcony, battenScreen, blade, downpipes, stringCourse,
  lantern, houseNumber, planter, plinthCourse,
} from './modern-kit.js';
import { framedWindow, modernDoor } from './modern-detail.js';
import { fenY, fenW, fenH, fenLights } from './modern-variants.js';
import { composeModernLot, LOT_DATUM } from './modern-garden.js';
import { slab, box, rotBox } from '../core.js';

export default function build(ctx) {
  const { env, p } = ctx;
  // V3.71 Lane G. A mirrored two-storey pair with paired entries, a cedar-batten upper field and
  // a low folded metal roof is the identity; the mirror, the pair and the two storeys do not
  // move. The fold's rise, the batten pitch, the balcony projection, the window rhythm and the
  // lot do.
  const V = ctx.var;
  const width = env.bodyW;
  const unitW = width / 2;
  const zF = env.frontZ;
  const zB = env.backZ;
  const zc = (zF + zB) / 2;
  const depth = zF - zB;
  const y0 = env.floorY;
  const y2 = env.wallH;
  const storey = (y2 - y0) / 2;
  const y1 = y0 + storey;

  const bladeT = 0.38;
  const volW = unitW - bladeT * 0.35;
  const doorW = 1.02;
  const doorH = 2.22;
  const gWinW = 1.58;
  const gWinH = 1.70;
  const uWinW = 1.48;
  const uWinH = 1.58;
  const balcW = 1.68;
  const balcProj = V?.mass?.balcProj ?? 1.08;
  const rise = 0.66 * (V?.roofK ?? 1);
  const yLow = y2 + 0.03;
  const yHigh = y2 + rise;

  // §2.3 — a real plinth course, not a 100 mm sliver of wall colour under the wall. It starts
  // below the lawn datum so the render never meets the ground on a bare line, and it is the
  // masonry bucket, so the base of the building sits in a distinct value band from the render
  // above it.
  ctx.add(plinthCourse(ctx, {
    x: 0, z: zc, w: width, d: depth,
    y0: LOT_DATUM - 0.14, h: y0 + 0.58 - (LOT_DATUM - 0.14),
  }));

  for (let i = 0; i < 2; i += 1) {
    const side = i === 0 ? -1 : 1;
    const ux = side * unitW / 2;
    const inward = -side;
    const doorU = ux + inward * unitW * 0.28;
    const gWinU = ux + side * unitW * 0.28;
    const balcU = ux + side * unitW * 0.26;
    const outerPlane = ux + side * (volW / 2);
    const fall = side < 0 ? 'left' : 'right';

    const gY = fenY(V, y0 + 0.50, 0);
    const uY = fenY(V, y1 + 0.24, 1);
    const gW = fenW(V, gWinW);
    const gH = fenH(V, gWinH);
    const uW = fenW(V, uWinW);
    const uH = fenH(V, uWinH);
    const front = [
      hole(doorU, y0, doorW, doorH, 'door'),
      hole(gWinU, gY, gW, gH, 'g-win'),
      hole(balcU, uY, uW, uH, 'u-win'),
    ];
    // `rear-g` was punched and never lined — an opening with no reveal on the rear elevation.
    // Same call as on the brick row: the hole goes rather than a seventh assembly arriving.
    const back = [
      hole(ux + inward * 0.35, fenY(V, y1 + 0.40, 1), 1.28, 1.42, 'rear-u'),
    ];
    // **r3 — the upper flank window moves BEHIND the cedar band, and the reason is that it was
    // never in front of it.** The r3 HEAD control (`tests/v371-g2-overlap.mjs --control`) reports
    // `batten-sill x flank-u-N-sill` at 0.080 m — the flank screen's bottom rail running straight
    // through the window's proud sill — and the backing board `cedar-flank-back-N` sits 0.055 m
    // inside the same sill without any probe in this lane naming it, because `^cedar-` is not on
    // the new-member list. Measured on the plate the fault is worse than the number: the band spans
    // z 1.251–3.705 and the window z 1.535–3.115, so **the screen covered the window entirely.**
    // r9 asked for the cedar to turn the corner and it did; nobody checked what it turned onto.
    //
    // The band stays where r9 put it — the flank's front third — and the window goes behind it,
    // derived from the band's own back edge rather than from a fixed 1.95. The clamp keeps it off
    // the rear wall on a shallow instance, where the depth axis can bring the two together.
    const flankScreenD = Math.min(2.60, depth * 0.34);
    const flankScreenZ = zF - 0.55 - flankScreenD / 2;
    const flankUZ = Math.max(zB + 1.20, zF - 0.55 - flankScreenD - 0.10 - (1.24 + 0.34) / 2);
    const flankHoles = [
      hole(zF - 1.95, fenY(V, y0 + 0.66, 0), 1.20, 1.40, 'flank-g'),
      hole(flankUZ, fenY(V, y1 + 0.40, 1), 1.24, 1.44, 'flank-u'),
    ];
    const flanks = side < 0 ? { left: flankHoles } : { right: flankHoles };

    ctx.add(volume(ctx, {
      material: p.wall,
      x: ux, zFront: zF, zBack: zB, width: volW,
      y0, y1: y2, front, back, ...flanks,
      name: `unit-${i}`,
    }));

    ctx.add(modernDoor(ctx, {
      opening: openingRecord({
        face: 'front', u: doorU, y: y0, w: doorW, h: doorH, plane: zF,
      }),
      id: `door-${i}`, timber: false, interactive: true,
    }));
    ctx.add(framedWindow(ctx, {
      opening: openingRecord({
        face: 'front', u: gWinU, y: gY, w: gW, h: gH, plane: zF,
      }),
      id: `gwin-${i}`, lights: fenLights(V, i, 1, 2, 2), interactive: true,
    }));
    ctx.add(framedWindow(ctx, {
      opening: openingRecord({
        face: 'front', u: balcU, y: uY, w: uW, h: uH, plane: zF,
      }),
      id: `uwin-${i}`, lights: fenLights(V, i + 1, 1, 2, 2), interactive: true,
    }));
    ctx.add(framedWindow(ctx, {
      opening: openingRecord({
        face: side < 0 ? 'left' : 'right',
        u: zF - 1.95, y: fenY(V, y0 + 0.66, 0), w: 1.20, h: 1.40,
        plane: outerPlane, axis: 'z', faceSign: side,
      }),
      id: `flank-g-${i}`, lights: 1, interactive: false,
    }));
    ctx.add(framedWindow(ctx, {
      opening: openingRecord({
        face: side < 0 ? 'left' : 'right',
        u: flankUZ, y: fenY(V, y1 + 0.40, 1), w: 1.24, h: 1.44,
        plane: outerPlane, axis: 'z', faceSign: side,
      }),
      id: `flank-u-${i}`, lights: 1, interactive: false,
    }));
    ctx.add(framedWindow(ctx, {
      opening: openingRecord({
        face: 'back', u: ux + inward * 0.35, y: fenY(V, y1 + 0.40, 1), w: 1.28, h: 1.42,
        plane: zB, axis: 'x', faceSign: -1,
      }),
      id: `rear-u-${i}`, lights: 1, interactive: false,
    }));

    // **r3 — the batten field's outer edge clears the balcony window's FURNITURE, not its hole.**
    // At 0.08 the field stopped 80 mm outboard of the opening, and `framedWindow` hangs a sill and
    // a head drip `w + 0.34` wide — 170 mm each side — so the field's outer battens and its sill
    // rail stood in both of them, and its edge was 4 mm from the balcony balustrade's return. The
    // HEAD control calls three of those pairs NEW and two DEEPENED: widening the batten pitch to
    // 0.132–0.238 in r2 put a batten where the lap was. 0.26 = the 0.17 furniture overhang, the
    // batten's own half-section, and 45 mm of air. It costs battens rather than triangles.
    const fieldOuter = balcU - side * (uW / 2 + 0.26);
    const fieldInner = ux + inward * (unitW / 2 - bladeT * 0.85);
    const fieldW = Math.abs(fieldInner - fieldOuter);
    const fieldX = (fieldInner + fieldOuter) / 2;
    const fieldH = storey - 0.28;
    const fieldY = y1 + 0.10;

    ctx.add([{
      geometry: box(fieldW - 0.04, fieldH - 0.06, 0.055, fieldX, fieldY + fieldH / 2, zF + 0.018, `cedar-back-${i}`),
      material: p.timber,
    }]);
    ctx.add(battenScreen(ctx, {
      x: fieldX, y: fieldY, z: zF + 0.03,
      w: fieldW, h: fieldH, pitch: V?.mass?.battenPitch ?? 0.175,
    }));
    // **The return down the flank — r9's single highest-value fix for this id.** The upper flank
    // was one undifferentiated cream field, and the id's best-crafted material stopped at the
    // corner. It now turns it: a cedar band on the flank's front third, on the same sill and head
    // lines as the street screen, with its own backing board so the battens read against timber
    // rather than against render. Roughly 260 triangles per unit against 4,004 of building
    // headroom, on an id whose depth also came down this round, so the flank it is breaking is
    // 29 % smaller than the one r9 measured.
    ctx.add([{
      geometry: box(0.055, fieldH - 0.06, flankScreenD - 0.04, outerPlane + side * 0.018, fieldY + fieldH / 2, flankScreenZ, `cedar-flank-back-${i}`),
      material: p.timber,
    }]);
    ctx.add(battenScreen(ctx, {
      x: outerPlane + side * 0.03, y: fieldY, z: flankScreenZ,
      w: flankScreenD, h: fieldH, pitch: (V?.mass?.battenPitch ?? 0.175) + 0.025, axis: 'z', face: side,
    }));

    ctx.add(slabBalcony(ctx, {
      x: balcU, y: y1 + 0.05, z: zF, w: balcW, proj: balcProj, railPitch: V?.count?.railPitch,
    }));
    ctx.add([{
      geometry: slab(balcW - 0.12, 0.035, balcProj - 0.14, balcU, y1 + 0.04, zF + balcProj / 2, `balc-deck-${i}`),
      material: p.timber,
    }]);
    ctx.add(planter(ctx, {
      x: balcU + side * (balcW * 0.28),
      y: y1 + 0.05,
      z: zF + balcProj * 0.46,
      w: 0.50, d: 0.34, h: 0.28,
      name: `balc-planter-${i}`,
    }));

    ctx.add([{
      // r3 §5.5.10 — the corner wrap is `joinery`. It is a vertical edge member on a pale render
      // elevation and it was rendering brighter than the render it is supposed to draw against.
      geometry: box(0.22, storey - 0.20, 0.22, ux + side * (volW / 2 - 0.06), y1 + storey / 2, zF + 0.08, `wrap-${i}`),
      material: p.joinery,
    }]);

    ctx.add(seatedSkillion(ctx, {
      w: unitW - 0.08, d: depth, x: ux, z: zc,
      yLow, yHigh, fall, overhang: 0.26, name: `lid-${i}`,
      seamPitch: V?.count?.seamPitch,
    }));
    // **The cream comb on both pitches was here.** `lid-seat` was an AXIS-ALIGNED box under a
    // sloping deck: its top ran level at `y2 + rise * 0.69` while the deck fell across the same
    // span, so the cream box surfaced through the dark roof between the battens over about half
    // its run. The r1 critic read it as "two coplanar surfaces fighting" and it is worse than
    // that — it is one solid passing through another.
    //
    // Rebuilt with the deck's OWN rotation so the two are parallel, and dropped along the
    // normal by more than the sum of the half-thicknesses (0.23 + 0.06 = 0.29; 0.34 world Y is
    // 0.315 along the normal at this pitch). Parallel surfaces cannot intersect, so the fix
    // holds at every pitch rather than at the one that was measured.
    const seatSpanW = (unitW - 0.08) + 0.52;
    const seatTilt = fall === 'right'
      ? { z: -Math.atan2(yHigh - yLow, seatSpanW) }
      : { z: Math.atan2(yHigh - yLow, seatSpanW) };
    ctx.add([{
      geometry: rotBox(
        unitW * 0.50, rise * 0.70, depth + 0.04,
        ux + inward * unitW * 0.22,
        (yLow + yHigh) / 2 - 0.34, zc, seatTilt, `lid-seat-${i}`,
      ),
      material: p.wall,
    }]);
    // The separate cream eave bar is gone. `seatedSkillion` already routes its low edge through
    // `eaveEdge()` — fascia, gutter, gutter lip and a shadow bead — and this bar was a second,
    // level member crossing the same sloping plane, which is the same fault as the seat.
    

    const lampSide = (V?.entry?.lampSide ?? 1) * inward;
    ctx.add(lantern(ctx, {
      x: doorU + lampSide * 0.62, y: y0 + 1.88, z: zF, facing: 1,
    }));
    ctx.add(houseNumber(ctx, {
      x: doorU - lampSide * 0.68, y: y0 + 1.52, z: zF, facing: 1,
    }));
  }

  // **r2 — the party blade is this id's skyline, and its head is a rung.** The two lids fold away
  // from each other, so what stands against the sky between them is the blade; r1 left its head at
  // a constant 0.42 m above the fold and took its whole silhouette variation from the fold rise,
  // which measured 0.255 m across twelve instances (1.27 px up a facade). The rungs run it to
  // 0.86 m proud, which is what a mirrored pair does where the party wall is expressed.
  ctx.add(blade(ctx, {
    x: 0, zFront: zF + 0.14, zBack: zB - 0.10,
    y0, y1: yHigh + 0.42 + (V?.sky?.step ?? 0), thick: bladeT, material: p.trim,
  }));
  ctx.add(stringCourse(ctx, {
    x: 0, z: zc, w: width, d: depth, y: y1, thick: 0.12, proud: 0.08,
  }));
  // **r2 major 5, closed.** `y1: yLow + 0.06` put the pipe head 60 mm ABOVE the low edge of a
  // roof deck whose overhang reaches `width / 2 + 0.22` — so the top of the downpipe and its
  // `dp-head` fitting passed through the deck for the whole of their section. The r10 probe's
  // roof-normal separating-axis test measured the penetration at 0.132 m against `lid-1-deck`.
  // A downpipe stops UNDER the gutter it drains, and `eaveEdge()` hangs that gutter 35 mm below
  // the eave line, so `yLow - 0.20` puts the head just clear of the deck's underside with the
  // gutter still directly over it.
  ctx.add(downpipes(ctx, {
    xL: -width / 2 - 0.05, xR: width / 2 + 0.05,
    z: zF - 0.05, y0: 0.02, y1: yLow - 0.20,
  }));

  // Which of the paired units the path serves, and therefore which side the drive falls on.
  const entryHand = V?.entry?.hand ?? -1;
  const leftDoorX = entryHand < 0 ? -unitW / 2 + unitW * 0.28 : unitW / 2 - unitW * 0.28;
  const yardZ = (zF + Math.min(env.kerbZ - 0.35, zF + 1.6)) / 2;
  ctx.add(composeModernLot(ctx, {
    entryX: leftDoorX,
    deckZ: zF + 0.06,
    driveway: true,
    driveX: -entryHand * unitW * 0.36,
    extraShrubs: [
      { x: -unitW * 0.74, z: yardZ + 0.02, r: 0.58, h: 0.78 },
      { x: unitW * 0.78, z: yardZ + 0.02, r: 0.54, h: 0.72 },
    ],
  }));
}
