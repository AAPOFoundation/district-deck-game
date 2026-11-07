// V3.70 — house-modern-skillion.
//
// **The identity fix.** V3.60 built this id with `standingSeamGable()` over the main mass and a
// `chimney()` through it. A symmetrical gable with a chimney on the ridge is a Federation
// cottage silhouette. It was on an id whose whole name is the roof form, and the programme brief
// calls it correctly: an identity failure, not a finish failure. At board zoom the roof IS the
// building, so no amount of surface work on the walls could have recovered it.
//
// What replaces it, per `V350-MODERN-RESIDENTIAL-SPEC.md`: an asymmetric Melbourne skillion.
// One seated metal plane over the main mass, high at the street and falling to the rear, so the
// street elevation is the tall one and the parapet-less edge reads as a single raking line. The
// lower wing carries a second skillion falling the OTHER way, which is the move that makes the
// pair read as deliberate rather than as one roof that got cut. No ridge, no gable ends, no
// chimney.
//
// Pale render over a charcoal brick plinth, timber-lined entry recess, steel portico.

import {
  floorPlate, wallShell, seatedSkillion, plinthCourse, rakingWall, rakingEnd,
  downpipes, lantern, houseNumber, stringCourse,
} from './modern-kit.js';
import { framedWindow, modernDoor } from './modern-detail.js';
import { fenU, fenY, fenW, fenH, fenLights } from './modern-variants.js';
import { composeModernLot, LOT_DATUM } from './modern-garden.js';
import { box, rotBox } from '../core.js';

export default function build(ctx) {
  const { env, p } = ctx;
  // V3.71 Lane G. `ctx.var` hashes `archetypeId | districtId | facade` and nothing else (§3.3).
  // Every use below moves a proportion or a position that already existed; the two masses, the
  // one-plane skillion and its opposed wing — the whole of this id's identity — do not move.
  const V = ctx.var;
  const floorY = env.floorY;
  const y2 = env.wallH;
  const storey = (y2 - floorY) / 2;
  const y1 = floorY + storey;

  // The sub-mass proportions vary inside a band that keeps the main mass dominant and the wing
  // subordinate — which is what makes the pair read as house-and-wing rather than as two boxes.
  const mainW = env.bodyW * (V?.mass?.mainW ?? 0.64);
  const wingW = env.bodyW * (V?.mass?.wingW ?? 0.38);
  const mainD = env.bodyD * (V?.mass?.mainD ?? 0.78);
  const mainX = -env.bodyW / 2 + mainW / 2;
  const wingX = env.bodyW / 2 - wingW / 2;
  const mainZ = env.frontZ - mainD / 2;
  const wingSetback = 0.16;
  const wingFront = env.frontZ - wingSetback;

  // **r3 — MAJOR 4. The wing may not stand over an opening punched in the flank it abuts, and the
  // limit is DERIVED from the openings rather than assumed to be safe.**
  //
  // The r2 round left `wing-skillion-deck` 0.061 m inside `win-side-ru-frame-l` and filed it as
  // pre-existing. It is not: the r2 critic built a true `git archive HEAD` control and HEAD clears
  // the same pair by 1.573 m on all twelve instances. The mechanism is a mismatch of two numbers
  // that were never checked against each other. The two right-flank openings sit at a fixed
  // FRACTION of `mainD` (r12 moved them to 0.40 and 0.38 for exactly this reason), while the wing's
  // depth is an r1 variation axis — `mass.wingD`, 0.525–0.60 of `bodyD` — and the wing's rear verge,
  // its capping and its apron flashing all hang past the wing's own back wall. Two numbers moving
  // independently against one fixed clearance: on five of twelve instances the wing reaches behind
  // the flank openings, and on one of them it reaches far enough to cut the window.
  //
  // So the wing's depth is clamped against the openings' own near edge. Every term is read off the
  // list below rather than chosen: `side-ru` is `w 1.10` and `side-rg` is `w 1.05`, and
  // `framedWindow`'s proud sill is `w + 0.34` wide (`modern-detail.js`), so the sill's near edge is
  // `mainZ − u + (w + 0.34) / 2`. `right` faces run `u` along −z (`house-kit.js` FACES), which is
  // why `u` subtracts.
  //
  // **A second interpenetration of the same family is closed by the same clamp, and no probe in
  // this lane could have named it.** `wallShell` names every shell `wall-<face>-field` whichever
  // mass built it, so the wing's back wall and the main's flank wall are indistinguishable in the
  // part list — a wing wall standing in a main-flank window looks exactly like a main wall hosting
  // its own. Measured geometrically (`tests/v371-g3-flank.mjs`), the wing's back wall stood 0.037 m
  // behind `win-side-rg`'s sill on richmond-flat f3. It is included in the keep-out below.
  const FLANK_CLEAR = 0.08;                       // 4x the overlap probe's 0.02 tolerance
  // The rearmost thing the wing throws past its own back wall: the deck verge is 0.20, the apron
  // 0.17, and `seatedSkillion`'s high capping 0.22 (`spanD + 0.04`). Take the largest and add a
  // little, so a later change to any one of the three cannot walk back through this.
  const WING_REAR_PROJ = 0.24;
  const flankNearZ = Math.max(
    mainZ - mainD * 0.40 + (1.10 + 0.34) / 2,     // side-ru, upper
    mainZ - mainD * 0.38 + (1.05 + 0.34) / 2,     // side-rg, ground
  );
  const wingDMax = wingFront - (flankNearZ + FLANK_CLEAR + WING_REAR_PROJ);
  // The floor keeps a wing that is still a wing if the flank geometry ever moves hard: below about
  // half the main's depth the pair stops reading as house-and-wing, which §5.3.7's rule (identity
  // outranks a convenient number) makes the binding constraint rather than the clearance.
  const wingD = Math.max(mainD * 0.52, Math.min(env.bodyD * (V?.mass?.wingD ?? 0.56), wingDMax));
  const wingZ = wingFront - wingD / 2;

  const plinthH = 0.72;
  const doorW = 1.12;
  const doorH = 2.24;
  // The entrance slides within its own bay; the windows take the elevation's rhythm. `fenU`
  // pivots the spread about the elevation centre and clamps against the wall edge, so no amount
  // of spread can walk a reveal off the end of the render.
  const doorLocalX = Math.max(
    -mainW * 0.42 + doorW / 2,
    Math.min(mainW * 0.42 - doorW / 2, mainW * 0.26 + (V?.entry?.doorShift ?? 0)),
  );
  const doorX = mainX + doorLocalX;
  const half = mainW / 2;
  const winGLocalX = fenU(V, -mainW * 0.22, 0, 0.91, half);
  const winULeftX = fenU(V, -mainW * 0.22, 0, 0.76, half);
  const winURightX = fenU(V, mainW * 0.24, 0, 0.66, half);

  ctx.add(floorPlate(ctx, {
    w: mainW + 0.08, d: mainD + 0.08, x: mainX, z: mainZ,
    height: floorY, material: p.wallAlt,
  }));
  ctx.add(floorPlate(ctx, {
    w: wingW + 0.08, d: wingD + 0.08, x: wingX, z: wingZ,
    height: floorY, material: p.wallAlt,
  }));

  // §2.3 — the plinth course, wrapping both masses. It starts below the lawn datum so the wall
  // never meets the ground on a bare line, and its cap lands just under the ground-floor
  // window sills, which is where a rendered wall would start on a real one of these.
  const plinthTop = floorY + plinthH;
  for (const m of [
    { w: mainW, d: mainD, x: mainX, z: mainZ },
    { w: wingW, d: wingD, x: wingX, z: wingZ },
  ]) {
    ctx.add(plinthCourse(ctx, {
      x: m.x, z: m.z, w: m.w, d: m.d,
      y0: LOT_DATUM - 0.14, h: plinthTop - (LOT_DATUM - 0.14),
    }));
  }

  const mainOpen = [
    // The door's sill is the threshold and does not move with the storey band.
    { face: 'front', x: doorLocalX, y: floorY, w: doorW, h: doorH, tag: 'door' },
    { face: 'front', x: winGLocalX, y: fenY(V, floorY + 0.84, 0), w: fenW(V, 1.82), h: fenH(V, 1.48), tag: 'g-win' },
    { face: 'front', x: winULeftX, y: fenY(V, y1 + 0.42, 1), w: fenW(V, 1.52), h: fenH(V, 1.48), tag: 'u-win-l' },
    { face: 'front', x: winURightX, y: fenY(V, y1 + 0.42, 1), w: fenW(V, 1.32), h: fenH(V, 1.48), tag: 'u-win-r' },
    { face: 'left', x: mainD * 0.18, y: fenY(V, floorY + 0.88, 0), w: 1.12, h: 1.28, tag: 'side-lg' },
    { face: 'left', x: mainD * 0.06, y: fenY(V, y1 + 0.46, 1), w: 1.18, h: 1.36, tag: 'side-lu' },
    // **r12 — the two right-flank windows move BACK, from u 0.30/0.28 to 0.40/0.38.** The wing
    // abuts this face and its back wall stands at z −2.085; measured with the r12 probe, `side-ru`'s
    // reveal ran z −3.179 to −2.079 and `side-rg`'s to −1.76, so both were punched partly through
    // the elevation the wing is built against — a window into a wall. It is also what made the
    // rebuilt `wing-rise-b` and the `wing-apron` report opening crossings of 0.0067 and 0.0013 m3:
    // the members are in the right place and the openings were not.
    { face: 'right', x: mainD * 0.40, y: fenY(V, y1 + 0.46, 1), w: 1.10, h: 1.32, tag: 'side-ru' },
    { face: 'right', x: mainD * 0.38, y: fenY(V, floorY + 0.90, 0), w: 1.05, h: 1.22, tag: 'side-rg' },
    { face: 'back', x: -mainW * 0.12, y: fenY(V, floorY + 0.88, 0), w: 1.28, h: 1.32, tag: 'rear' },
  ];
  const main = wallShell(ctx, {
    w: mainW, d: mainD, x: mainX, z: mainZ,
    base: floorY, height: y2 - floorY,
    openings: mainOpen,
    material: p.wall,
    baseCourse: { height: plinthH, material: p.wallAlt, moulding: true },
  });
  ctx.add(main);
  for (const rec of main.openings ?? []) {
    const tag = rec.src?.tag ?? '';
    if (tag === 'door') {
      ctx.add(modernDoor(ctx, {
        opening: rec, id: 'front-door', timber: true, interactive: true,
      }));
    } else {
      // Which windows carry a mullion is a permutation, not an addition — the phase moves WHICH
      // sashes take a mullion, never how many openings there are. It is not quite free: on an
      // ordinal set that is not a whole multiple of the stride the match count can move by one,
      // which is one mullion. `tests/v371-g-budget.mjs` measures this id's whole building spread
      // across eight variants at 38 triangles on a 9,000 cap.
      const ordinal = mainOpen.findIndex((o) => o.tag === tag);
      ctx.add(framedWindow(ctx, {
        opening: rec,
        id: `win-${tag}`,
        lights: tag.startsWith('u') || tag === 'g-win'
          ? fenLights(V, ordinal, 1, 2, 2)
          : fenLights(V, ordinal, 1, 2, 4),
        interactive: rec.face === 'front',
      }));
    }
  }

  // **r2 — `sky.alt` raises the WING'S WALL HEAD, not its pitch, and the reason is a measurement.**
  // The first draft added it to the wing roof's high edge. `seatedSkillion` rotates its deck about
  // the deck's own centre, so raising one edge drops the other: the exact triangle test measured the
  // deck 0.064 m into `win-wing-drip` — the wing's own window head — at the top rung. Lifting the
  // wall head instead moves the whole plane up together, which INCREASES the clearance over that
  // window, keeps the roof seated on the wall it sits on, and is the more honest change anyway: a
  // wing that stands taller reads as a different house, a wing roof that is steeper for no reason
  // does not.
  const wingH = storey + 0.16 + (V?.sky?.alt ?? 0);
  const wingTop = floorY + wingH;
  const wingOpen = [
    { face: 'front', x: fenU(V, 0.05, 0, 1.11, wingW / 2), y: fenY(V, floorY + 0.82, 0), w: fenW(V, 2.22), h: fenH(V, 1.48), tag: 'wing' },
    { face: 'right', x: -wingD * 0.06, y: fenY(V, floorY + 0.88, 0), w: 1.18, h: 1.28, tag: 'wing-side' },
    { face: 'back', x: 0.10, y: fenY(V, floorY + 0.90, 0), w: 1.12, h: 1.18, tag: 'wing-rear' },
  ];
  const wing = wallShell(ctx, {
    w: wingW, d: wingD, x: wingX, z: wingZ,
    base: floorY, height: wingH,
    openings: wingOpen,
    material: p.wall,
    baseCourse: { height: plinthH, material: p.wallAlt, moulding: true },
    articulate: false,
  });
  ctx.add(wing);
  for (const rec of wing.openings ?? []) {
    ctx.add(framedWindow(ctx, {
      opening: rec,
      id: `win-${rec.src?.tag}`,
      lights: rec.src?.tag === 'wing' ? 2 : 1,
      interactive: rec.face === 'front',
    }));
  }

  ctx.add(stringCourse(ctx, {
    x: mainX, z: mainZ, w: mainW, d: mainD, y: y1, thick: 0.12, proud: 0.07,
  }));

  // The main skillion: high at the street, falling to the rear. One plane, no ridge.
  // The rise is modest — a 15° fall over an 8 m depth is the Melbourne skillion, not a lean-to.
  // `roofK` is the pitch axis: how steeply the one plane falls, never which way it falls or how
  // many planes there are. 0.80–1.26 spans about 12° to 19° over this depth, which is the range a
  // Melbourne skillion is actually built at.
  // **r2 — `sky.step` is a RUNG on the high edge, and it is the reason this id's silhouette now
  // reads.** r1 measured 0.131 m of height spread across four facades — 0.65 px up a facade at
  // §5.4.0's board scale — because `roofK` is a continuous band and four hash samples of a band
  // cluster. The rung set moves the high edge in authored steps of 0.26 m, so two instances stand
  // at visibly different heights against the sky. The roof is still ONE plane falling ONE way,
  // which is the whole of this id's identity (§5.3.7: an identity constraint outranks a
  // convenient difference, and the same holds for a convenient sameness).
  const mainHigh = y2 + 0.92 * (V?.roofK ?? 1) + (V?.sky?.step ?? 0);
  const mainLow = y2 - 0.06;
  ctx.add(seatedSkillion(ctx, {
    w: mainW, d: mainD, x: mainX, z: mainZ,
    yLow: mainLow, yHigh: mainHigh, fall: 'back', overhang: 0.30, name: 'main-skillion',
    // The seam pitch is a member COUNT (§5.5.5). Over this plane the rungs run 25 battens to 14.
    seamPitch: V?.count?.seamPitch,
  }));
  // The raking side walls that carry it. Without these the roof plane floats over a flat-topped
  // box and the whole silhouette reads as a lid, which is what a skillion must not do.
  const rakeRise = mainHigh - mainLow;
  for (const side of [-1, 1]) {
    const rx = mainX + side * (mainW / 2 - 0.09);
    ctx.add([{
      geometry: rakingWall(0.18, mainD, rakeRise, rx, mainLow - 0.02, mainZ, `main-rake-${side}`),
      material: p.wall,
    }]);
  }
  // The high street wall the roof springs from, standing above the eave line.
  ctx.add([{
    geometry: box(mainW + 0.02, rakeRise + 0.08, 0.20, mainX, mainLow + rakeRise / 2, mainZ + mainD / 2 - 0.09, 'main-upstand'),
    material: p.wall,
  }]);

  // The wing's skillion falls the other way — the opposition is the identity.
  const skillionLow = wingTop - 0.03;
  // **A clamp against `win-side-ru` was tried here and REMOVED, and the failed attempt is worth the
  // four lines.** The exact triangle test found the wing deck 0.061 m inside `win-side-ru-frame-l`
  // once `sky.alt` lifted the wing roof, so the first fix clamped the high edge under that window's
  // sill. That number is 2.85 m and the wing's own wall head is 3.21 m, so the clamp did not limit
  // the pitch — it INVERTED the plane, and the probe then reported a different collision on the
  // portico because the roof had turned over. The window is cleared in Z, not in Y: r12 moved
  // `win-side-ru` back from u 0.30 to 0.40 for exactly this reason and recorded it in the opening
  // list above. Lifting the wall head rather than the ridge is what fixes it, and that is what
  // `wingH` now does.
  const skillionHigh = wingTop + 0.74 * (V?.roofK ?? 1);
  ctx.add(seatedSkillion(ctx, {
    w: wingW, d: wingD, x: wingX + 0.04, z: wingZ,
    yLow: skillionLow, yHigh: skillionHigh,
    fall: 'right', overhang: 0.20, name: 'wing-skillion',
    seamPitch: V?.count?.seamPitch,
  }));
  // **r12 — major 1, rebuilt as a TRIANGLE. This is the third attempt and the previous two
  // failed the same way, so the fix is a change of shape, not a change of arithmetic.**
  //
  // History, because it is the whole lesson. r9 found `wing-rise-f/-b` interpenetrating the roof
  // and ending in air. r10 rebuilt them in the deck's own frame, proved 7 mm of separation with
  // an exact separating-axis test on the ROOF NORMAL, and reported the major closed. The r11
  // critic's finding: "the r10 separating-axis result is measured from the roof. The member is
  // unsupported BELOW, because the wall it was meant to bury into is a window." It was the first
  // thing the critic saw, at 1×, on all three views — a ~2.5 m raking render slab hanging across
  // the wing's ground-floor window, 65 mm proud of the render, cutting the head trim, ending in
  // open air. **The test answered a different question from the one that mattered.**
  //
  // The reason a box could never work here: the member's job is to fill the wedge between a FLAT
  // wall head and a SLOPING roof underside. That wedge is a triangle. A box has a bottom face,
  // and r10 put the bottom 1.15 m below the wall head because it wanted the surplus "buried in
  // the wall below" — but on this elevation the thing below the wall head is a 2.22 m window, so
  // the surplus was buried in a hole. `rakingEnd()` (`modern-kit.js`) builds the wedge itself:
  // base ON the wall head, hypotenuse parallel to the deck underside, nothing below the base.
  //
  // Every number below is derived rather than chosen:
  //   * `yUnder(x)` is the deck's own underside plane, solved from `seatedSkillion`'s rotated box:
  //     `midY − halfT/cos(tilt) − (x − deckX)·tan(tilt)`.
  //   * `xC` is where that plane crosses the wall head, so the wedge closes exactly there.
  //   * the whole panel drops by `SEAT` below the wall head, which makes the hypotenuse a line
  //     PARALLEL to the deck underside and `SEAT` clear of it — separation by construction, at
  //     every pitch — while seating the base inside the wall it stands on.
  //   * the panel is inset half its thickness from the wall face, so it is FLUSH, not proud.
  const wingSpanW = wingW + 0.40;                 // seatedSkillion's overhang, both sides
  const wingTilt = Math.atan2(skillionHigh - skillionLow, wingSpanW);
  const deckX = wingX + 0.04;
  const deckMidY = (skillionLow + skillionHigh) / 2;
  const deckHalfT = 0.06;                         // seatedSkillion deck is 0.12 thick
  const ct = Math.cos(wingTilt);
  const st = Math.sin(wingTilt);
  const tt = Math.tan(wingTilt);
  // fall = 'right' means the plane drops with increasing x, so the euler is negative about Z.
  // Kept for the apron flashing below, which r11 graded closed and which is untouched.
  const deckEuler = { z: -wingTilt };
  const at = (du, dv) => ({ x: deckX + du * ct + dv * st, y: deckMidY - du * st + dv * ct });
  const yUnder = (x) => deckMidY - deckHalfT / ct - (x - deckX) * tt;
  const SEAT = 0.03;
  const riseT = 0.16;
  const xL = wingX - wingW / 2 + 0.01;
  // Where the roof underside meets the wall head. Clamped to the wing's own right-hand edge: if
  // the geometry ever changes so that the plane is still above the wall head at the edge, the
  // panel stops at the edge rather than extending past the wall it is standing on.
  const xC = Math.min(wingX + wingW / 2 - 0.01, deckX + (deckMidY - deckHalfT / ct - wingTop) / tt);
  const riseW = xC - xL;
  const riseRise = yUnder(xL) - wingTop;
  if (riseW > 0.2 && riseRise > 0.05) {
    for (const [sign, tag] of [[1, 'f'], [-1, 'b']]) {
      ctx.add([{
        geometry: rakingEnd(
          riseW, riseT, riseRise,
          (xL + xC) / 2, wingTop - SEAT,
          wingZ + sign * (wingD / 2 - riseT / 2),
          `wing-rise-${tag}`,
        ),
        material: p.wall,
      }]);
    }
  }

  // The apron flashing: an upstand standing against the main wall where the wing roof dies into
  // it, sitting ON the roof rather than across it. `du` is taken to the wall plane so its foot
  // follows the roof's height there, and it is 60 mm proud of the wall face, so its back is
  // against render for its whole run and there is no daylight under any part of it.
  const apronDu = (mainX + mainW / 2 - deckX) / ct;
  const apronAt = at(apronDu, deckHalfT + 0.19);
  ctx.add([{
    geometry: rotBox(
      0.11, 0.34, wingD + 0.34,
      apronAt.x + 0.06, apronAt.y, wingZ,
      deckEuler, 'wing-apron',
    ),
    material: p.joinery,
  }]);

  // The steel portico. Slimmer than V3.60 and set higher: at 0.26-square posts and a 220 mm
  // slab it was a mass the same size as the door it was sheltering, and the r1 plate reads it
  // as one dark block with the entrance somewhere inside. A portico is a frame around the front
  // door, so its members have to be thinner than the door is wide.
  // **The canopy is held clear of the first-floor sill, and that clearance is derived rather
  // than assumed.** With the storey band free to move ±90 mm the authored 2.72 put the slab top
  // 60 mm INSIDE `win-u-win-r`'s proud sill (which hangs 250 mm below the opening line) on two of the eight (district × facade) rows — an
  // interpenetration, and one that only appears on some variants, which is exactly the kind a
  // single-facade probe never sees. The upper sill's own varied height is the datum.
  const upperSillY = fenY(V, y1 + 0.42, 1);
  const slabY = Math.min(floorY + 2.72, upperSillY - 0.46);
  const postH = 2.68;
  const post = 0.13;
  const stepOut = V?.entry?.stepOut ?? 0;
  // **Three entry treatments, and all three are a real front door on a real threshold.**
  //
  // 0 — the posted portico r1 asked for: a thin slab on two slim posts with cast bases.
  // 1 — a cantilevered hood: the same slab carried on two raking brackets off the wall, which is
  //     the commonest thing built over a Melbourne skillion's door and reads completely
  //     differently in silhouette because nothing lands on the path.
  // 2 — a deep portico with a return blade down one side, so the entrance reads as a recess
  //     under a cover rather than as a canopy in front of one.
  //
  // Every member is still thinner than the door is wide (the r1 finding that sized the original),
  // and every one of them lands on something: a post on a base, a bracket on the wall, the blade
  // on the threshold slab.
  const canopy = V?.entry?.canopy ?? 0;
  const hand = V?.entry?.hand ?? 1;
  const projK = canopy === 2 ? 1.34 : 1;
  const slabD = 1.30 * projK;
  const entryParts = [
    { geometry: box(2.10, 0.14, slabD, doorX, slabY, env.frontZ + slabD * 0.415, 'portico-slab'), material: p.joinery },
    { geometry: box(1.94, 0.05, slabD - 0.14, doorX, slabY - 0.09, env.frontZ + slabD * 0.40, 'portico-soffit'), material: p.shadow },
    { geometry: box(2.10, 0.11, 0.13, doorX, slabY - 0.02, env.frontZ + 0.06, 'portico-ledger'), material: p.joinery },
  ];
  if (canopy === 1) {
    // Raking brackets. Each one has its back against the render for its whole length and its top
    // under the slab it carries, so neither end is in air.
    const bh = 0.92;
    for (const side of [-1, 1]) {
      entryParts.push({
        geometry: rotBox(
          0.09, Math.hypot(bh, slabD * 0.62), 0.16,
          doorX + side * 0.84, slabY - 0.10 - bh / 2, env.frontZ + slabD * 0.30,
          { x: Math.atan2(slabD * 0.62, bh) }, `portico-bracket-${side > 0 ? 'r' : 'l'}`,
        ),
        material: p.joinery,
      });
    }
  } else {
    const postZ = env.frontZ + (canopy === 2 ? 1.42 : 1.02);
    for (const side of [-1, 1]) {
      const px = doorX + side * 0.90;
      entryParts.push(
        { geometry: box(post, postH, post, px, floorY + postH / 2, postZ, `portico-${side > 0 ? 'r' : 'l'}`), material: p.joinery },
        { geometry: box(post + 0.09, 0.07, post + 0.09, px, floorY + 0.03, postZ, `portico-base-${side > 0 ? 'r' : 'l'}`), material: p.joinery },
      );
    }
    if (canopy === 2) {
      // The return blade. It stands on the lower step, which is 1.52 wide, so its foot is
      // supported for its whole section rather than resting on the lawn.
      entryParts.push({
        geometry: box(0.11, postH, slabD * 0.70, doorX + hand * 0.90, floorY + postH / 2, env.frontZ + slabD * 0.42, 'portico-blade'),
        material: p.wall,
      });
    }
  }
  entryParts.push(
    { geometry: box(1.34, 0.14, 0.50 + stepOut, doorX, floorY - 0.05, env.frontZ + 0.26 + stepOut / 2, 'door-step'), material: p.trim },
    { geometry: box(1.52, 0.09, 0.62 + stepOut, doorX, floorY - 0.16, env.frontZ + 0.30 + stepOut / 2, 'door-step-lower'), material: p.wallAlt },
  );
  ctx.add(entryParts);

  // The timber-lined entry recess the spec names. The lining runs BACK into the opening rather
  // than sitting proud of it, so the recess reads as depth and the timber only shows on the
  // returns — which is what lining an opening means.
  const recessD = 0.34;
  ctx.add([
    { geometry: box(0.09, doorH + 0.30, recessD, doorX - doorW / 2 - 0.16, floorY + (doorH + 0.30) / 2, env.frontZ - recessD / 2 + 0.02, 'recess-l'), material: p.timber },
    { geometry: box(0.09, doorH + 0.30, recessD, doorX + doorW / 2 + 0.16, floorY + (doorH + 0.30) / 2, env.frontZ - recessD / 2 + 0.02, 'recess-r'), material: p.timber },
    { geometry: box(doorW + 0.50, 0.09, recessD, doorX, floorY + doorH + 0.30, env.frontZ - recessD / 2 + 0.02, 'recess-head'), material: p.timber },
    // The back of the recess is shadow, not timber. Lining an opening means lining its RETURNS;
    // a full-width timber panel behind the door put a saturated red-brown field the size of the
    // entrance onto the r1 plate and pulled the eye off the door itself.
    { geometry: box(doorW + 0.50, doorH + 0.34, 0.07, doorX, floorY + (doorH + 0.34) / 2, env.frontZ - recessD + 0.02, 'recess-back'), material: p.shadow },
  ]);

  const lampSide = V?.entry?.lampSide ?? -1;
  ctx.add(lantern(ctx, {
    x: doorX + lampSide * 0.82, y: floorY + 1.88, z: env.frontZ + 0.02, facing: 1,
  }));
  ctx.add(houseNumber(ctx, {
    x: doorX - lampSide * 0.82, y: floorY + 1.58, z: env.frontZ + 0.02, facing: 1,
  }));

  // No chimney. A modern skillion has a flue at most, and this one does not need even that —
  // the identity is the roof plane, and anything standing on it competes with the raking line.
  ctx.add(downpipes(ctx, {
    xL: mainX - mainW / 2 - 0.06,
    xR: mainX + mainW / 2 + 0.02,
    z: env.frontZ - 0.10, y0: LOT_DATUM, y1: mainLow - 0.16,
  }));

  ctx.add(composeModernLot(ctx, {
    entryX: doorX,
    deckZ: env.frontZ + 0.12,
    extraShrubs: [
      { x: doorX - 1.55, z: env.frontZ + 0.92, r: 0.50, h: 0.66 },
      { x: doorX - 2.35, z: env.frontZ + 1.18, r: 0.42, h: 0.54 },
      { x: wingX + 0.35, z: env.frontZ + 0.88, r: 0.46, h: 0.60 },
    ],
  }));
}
