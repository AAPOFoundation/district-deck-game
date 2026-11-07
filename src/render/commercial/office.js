// District Deck V3.70 — office-lowrise (lane L4).
//
// THE IDENTITY, per V370 §4/L4: "a three-storey brick-and-glass box with a glazed entry,
// spandrel bands, a plant screen on the roof and a bike rack. Neither is a rectangle with
// windows drawn on it."
//
// THE SILHOUETTE ARGUMENT — why this cannot be confused with anything else in the lane at board
// zoom, which is the §4 requirement:
//
//   - It is the only LONG LOW subject. Three storeys on a 1 × 2 pad gives an 11.6 m box on a
//     19 m plan: read from the board it is wider than it is tall, where every apartment rung is
//     taller than it is wide and the corner shop is lower still.
//   - Its skyline is ASYMMETRIC and has two things in it. The service core rises past the
//     parapet as a solid brick blade at one end; the louvred plant screen sits on the roof at
//     the other. An apartment has a level parapet, a shop has a stepped pediment.
//   - Its frontage is a PIER-AND-INFILL grid: five full-height brick piers with recessed glazed
//     bays between them and a spandrel band at each floor. Not punched holes in a wall, which is
//     what every residential subject in this lane has.
//   - It is the only subject with a paved FORECOURT rather than a garden. Planting is in kerbed
//     beds; the ground is pavers; the street furniture is a bike rack.
//
// Palette (§2.10 — one hue must not own it): buff brick piers, charcoal precast spandrels, pale
// precast cills and copes, near-black mullions, dark glass, grey pavers, green beds. Five value
// bands across four hue families.

import { RECESS } from './surfaces.js';
import {
  METRICS, part, box, slab, cyl, rotBox, recessFaces, yawParts,
  volume, hole, openWall, plinthCourse, stringCourse, parapetCrown, gutterRun,
  gridWindow, commercialDoor, brickCourses, streaks, countAperture, signBand, steelRail,
  boardPlinth, lawnTufts, paverField, paverPath, kerbAndFootpath,
  plantedBed, canopyTree, hedgeRun, shrubMass, pierWall, bikeRack, battenScreen, roofPlant, lamp,
} from './core.js';

const S = 5500; // salt namespace for this file

/**
 * One recessed glazed bay between two piers.
 *
 * Six depths: the spandrel is set back from the pier face, the transom and mullions sit in
 * front of the glass, the glass sits behind them, and the head and cill are proud precast.
 * That is what makes an office window an opening rather than a blue rectangle.
 */
function ribbonBay(ctx, { x, w, z, y0, y1, facing = 1, spandrelH = 0.85 }) {
  countAperture('ribbonBay');
  const p = ctx.p;
  const out = [];
  const face = z;
  const setback = 0.30;
  const glassZ = face - facing * (setback + 0.14);
  const frameZ = face - facing * setback;
  const h = y1 - y0;
  if (h < 0.6 || w < 0.4) return out;

  // Spandrel: the solid band under the glazing, in the charcoal precast bucket.
  out.push(part(box(w, spandrelH, 0.26, x, y0 + spandrelH / 2, face - facing * 0.10, 'bay-spandrel'), p.wallAlt));
  out.push(part(box(w + 0.10, 0.10, 0.30, x, y0 + spandrelH, face - facing * 0.06, 'bay-cill'), p.trim));
  // The dark reveal box behind everything — the room.
  out.push(part(box(w - 0.06, h - spandrelH - 0.12, 0.16, x, (y0 + spandrelH + y1) / 2 - 0.06,
    face - facing * (setback + 0.30), 'bay-room'), p.shadow, RECESS.interior));
  // ── r7 MAJ-9: "the bays read as plates ON the wall, not openings IN it" ───────────────────
  //
  // The critic saw a lit top edge and a drop shadow under each band. That is what a proud cill
  // over a BLACK hole looks like: with the pane at literal (0,0,0) there was nothing behind the
  // cill for the eye to read as depth, so the cill became the object and the opening became its
  // shadow. Two changes, and the first is the pane (surfaces.js `GLASS_SKY`).
  //
  // The second is here: the reveal returns were `shadow` at the back of a 0.30 m setback, which
  // by the same arithmetic as `punchedWindow` renders under the display chain's black clip. A
  // recess reads on the VALUE STEP between a lit return and a darker pane, and with both of its
  // terms at zero there was no step at all. `trim`, 0 triangles.
  for (const side of [-1, 1]) {
    out.push(part(box(0.10, h - spandrelH, setback, x + side * (w / 2 - 0.05),
      (y0 + spandrelH + y1) / 2, face - facing * setback / 2, 'bay-ret'), p.trim, 1));
  }
  out.push(part(box(w, 0.14, setback, x, y1 - 0.07, face - facing * setback / 2, 'bay-head-ret'), p.trim, 1));
  // ── r13 MAJ-4: ONE WIDE LIGHT IS STILL A CARD, AND HERE IT IS THE WIDEST IN THE LANE ──────
  //
  // r12 closed half of this on `shopfrontBay` by glazing a bay as the LIGHTS it actually has —
  // one plank per bay between the mullions, each with its own UV, so `GLASS_SKY.refl`'s raking
  // break restarts at every mullion — and measured its own ribbon bay still OPEN: "a ribbon bay
  // is one wide light and the break does not read at 3x. Not claimed." (r12 §7.3.)
  //
  // It is the same fault and it takes the same fix. A 2.43 m bay carries two lights; the mullion
  // between them now divides two panes instead of crossing one, which is what makes a mullion
  // read as SECTION rather than as a line drawn on glass. **+12 triangles a bay.**
  const gh = h - spandrelH - 0.22;
  const gy = y0 + spandrelH + gh / 2 + 0.08;
  const mulls = Math.max(1, Math.round(w / 1.45));
  for (let i = 0; i < mulls; i += 1) {
    const lw = (w - 0.16) / mulls;
    out.push(part(box(lw - 0.07, gh, 0.05, x - (w - 0.16) / 2 + (i + 0.5) * lw, gy, glassZ,
      'bay-glass'), p.glass));
  }
  out.push(part(box(w, 0.13, 0.13, x, y0 + spandrelH + 0.06, frameZ, 'bay-rail-lo'), p.joinery));
  out.push(part(box(w, 0.13, 0.13, x, y1 - 0.10, frameZ, 'bay-rail-hi'), p.joinery));
  for (let i = 1; i < mulls; i += 1) {
    out.push(part(box(0.11, gh, 0.13, x - w / 2 + (w * i) / mulls, gy, frameZ, 'bay-mull'), p.joinery));
  }
  if (ctx.detail) {
    // Transom at head height of the vision panel — the horizontal that makes the grid read.
    out.push(part(box(w, 0.09, 0.11, x, gy + gh * 0.30, frameZ, 'bay-transom'), p.joinery));
  }
  return out;
}

export function buildOfficeLowrise(ctx) {
  const { env, p } = ctx;
  const add = (produced) => ctx.add(produced);

  const halfW = env.bodyW / 2;
  const frontZ = env.frontZ;
  const backZ = env.backZ;
  const midZ = (frontZ + backZ) / 2;
  const groundH = 4.35;
  const upperH = (env.wallH - groundH) / 2;
  const floors = [0, groundH, groundH + upperH, env.wallH];

  /* ── lot ─────────────────────────────────────────────────────────────────────────── */
  add(boardPlinth(ctx, { lawn: true }));
  add(kerbAndFootpath(ctx));

  // The forecourt: pavers from the footpath to the entry, the whole width of the frontage.
  const courtZ0 = frontZ - 0.1;
  const courtZ1 = env.lotD / 2 - METRICS.rim - 1.35;
  const courtD = Math.max(1.2, courtZ1 - courtZ0);
  // Unit 1.25 -> 1.55. The forecourt is the largest paved area in the lane and its module is the
  // lot's biggest single triangle line; a bigger flag is also what a 1980s commercial forecourt
  // is actually laid in. It pays for the median, the approach walk and the bollards below, so
  // the lot account ends the round with MORE headroom than it started with rather than less —
  // r11's finding about growth toward a cap going unflagged is the reason this is stated here.
  add(paverField(ctx, {
    x: 0, z: (courtZ0 + courtZ1) / 2, w: env.bodyW + 1.4, d: courtD, unit: 1.55,
  }));

  /* ── envelope ────────────────────────────────────────────────────────────────────── */
  // Five piers, four bays. The entry takes bay index 1 — off centre on purpose, because a
  // symmetric front door on a 19 m plan reads as civic, and this is a speculative office.
  const BAYS = 4;
  const pierW = 0.92;
  const bayW = (env.bodyW - pierW * (BAYS + 1)) / BAYS;
  const pierX = [];
  for (let i = 0; i <= BAYS; i += 1) {
    pierX.push(-halfW + pierW / 2 + i * (pierW + bayW));
  }
  const bayX = [];
  for (let i = 0; i < BAYS; i += 1) bayX.push(pierX[i] + (pierW + bayW) / 2);
  const entryBay = 1;
  // ── r13: THE FRONTAGE IS NO LONGER FOUR OF THE SAME THING ─────────────────────────────────
  //
  // r11 closed MAJ-E as specified and took the read off the score anyway: "the bays now read as
  // thin dark slots under heavy pale bars and the diagonal step is MORE visible against the new
  // datum". r12 spent nothing on it and said so. The datum was never the problem — the problem
  // is that a 4 x 3 grid of identical bays has no hierarchy, so the only thing left for the eye
  // to organise is the bands, and the bands then have to carry a reading they cannot.
  //
  // Three changes to the rhythm, and none of them is a finish:
  //   * the ENTRY BAY is double height — its ground and first floors are one opening behind one
  //     portal frame, which is what an office lobby actually is and gives the elevation a
  //     subject rather than a repeat;
  //   * the LAST BAY is a service bay — solid spandrel, a louvred plant panel and a slot window
  //     per floor, so the run of glazed bays STOPS instead of running out at the corner;
  //   * the ground floor of the remaining bays is glazed taller on a low spandrel, so base and
  //     shaft are different things.
  const serviceBay = BAYS - 1;
  const lobbyH = groundH + upperH - 0.30;   // the double-height opening, to just under level 2

  // The shell. Flanks and rear are the brick field with a punched grid; the front is piers,
  // so the front face is authored bay by bay below rather than by `volume`.
  const flankHoles = { left: [], right: [], back: [] };
  const winW = 1.55;
  const winH = 1.72;
  const flankCols = 4;
  for (let s = 1; s < 3; s += 1) {
    const sillY = floors[s] + 1.05;
    for (let c = 0; c < flankCols; c += 1) {
      const u = midZ - env.bodyD * 0.34 + (c / (flankCols - 1)) * env.bodyD * 0.68;
      flankHoles.left.push(hole(u, sillY, winW, winH));
      flankHoles.right.push(hole(u, sillY, winW, winH));
    }
  }
  for (let s = 1; s < 3; s += 1) {
    const sillY = floors[s] + 1.05;
    for (let c = 0; c < 3; c += 1) {
      flankHoles.back.push(hole(-env.bodyW * 0.28 + c * env.bodyW * 0.28, sillY, winW, winH));
    }
  }
  // ── r13: THE GROUND FLOOR OF BOTH FLANKS WAS BLANK, AND r11 NAMED IT ─────────────────────
  //
  // "Right elevation ground floor still blank." It was blank on the left too — the flank loop
  // started at storey 1. A ground floor is where a building meets a person, and 19 m of unbroken
  // brick from the plinth to the first floor band is the largest single unrelieved surface on
  // the subject. Three openings a side at ground level, WIDER and LOWER than the office windows
  // above them, because a ground floor is not a repeat of the floor above it.
  for (const side of ['left', 'right']) {
    for (let c = 0; c < 3; c += 1) {
      const u = midZ - env.bodyD * 0.30 + (c / 2) * env.bodyD * 0.60;
      flankHoles[side].push(hole(u, 1.35, 2.05, 1.90));
    }
  }
  add(volume(ctx, {
    material: p.wall,
    x: 0, zFront: frontZ, zBack: backZ, width: env.bodyW, y0: 0, y1: env.wallH,
    depth: METRICS.wallDepth,
    front: [],
    back: flankHoles.back,
    left: flankHoles.left,
    right: flankHoles.right,
    name: 'office',
  }));
  // `volume` also builds a front wall; the front is authored as piers + bays, so punch the
  // whole frontage out of it and rebuild it. Cheaper and more honest than a special case.
  // The service bay keeps its wall — only its slots are punched — so the front is no longer four
  // identical holes in a frame.
  const serviceSlots = [];
  for (let s = 0; s < 3; s += 1) {
    serviceSlots.push(hole(bayX[serviceBay], floors[s] + 1.20, 0.68, 1.45));
  }
  add(openWall(ctx, {
    material: p.wall, axis: 'x', face: 1, plane: frontZ, centre: 0, run: env.bodyW,
    y0: 0, y1: env.wallH, depth: METRICS.wallDepth,
    openings: [
      ...bayX.filter((_, i) => i !== serviceBay).map((bx) => hole(bx, 0.0, bayW + 0.02, env.wallH)),
      ...serviceSlots,
    ],
    name: 'office-front',
  }));

  /* ── frontage: piers, bays, entry ────────────────────────────────────────────────── */
  for (let i = 0; i < pierX.length; i += 1) {
    const px = pierX[i];
    // The pier stands PROUD of the bay face, which is the whole point of a pier.
    //
    // r12 — AND ITS CHEEKS ARE THE BAY'S OUTER REVEAL. `l4r12-members.mjs` measures the pier's
    // along-frontage faces at sky visibility 0.09-0.31 against 0.56-0.81 on its street face:
    // they line the recess the bay sits in exactly as `bay-ret` lines its inner half, and they
    // were the only unlit surface left in the opening. Tagged at `soffit` rather than `lining`
    // ON PURPOSE — `bay-ret` is at 1.0 two hundred millimetres further in, and putting both at
    // the same level would collapse the value step §2.2 asks for into one lit band.
    add([part(recessFaces(box(pierW, env.wallH, 0.42, px, env.wallH / 2, frontZ + 0.10, 'pier'),
      RECESS.soffit, ['px', 'nx']), p.wall)]);
    add([part(box(pierW + 0.16, 0.16, 0.52, px, env.wallH + 0.08, frontZ + 0.12, 'pier-cap'), p.trim)]);
    if (ctx.mid) {
      add(brickCourses(ctx, {
        axis: 'x', face: 1, plane: frontZ + 0.31, centre: px, run: pierW,
        y0: 1.0, y1: 7.4, pitch: 0.46,
      }));
    }
  }
  for (let b = 0; b < BAYS; b += 1) {
    const bx = bayX[b];
    if (b === serviceBay) {
      // The service bay: a solid rendered panel with a louvred plant grille at each floor and a
      // slot window beside it. Same module, different content — which is what makes the rest of
      // the frontage read as glazing rather than as wallpaper.
      for (let s = 0; s < 3; s += 1) {
        add([part(box(bayW + 0.04, floors[s + 1] - floors[s] - 0.10, 0.16, bx,
          (floors[s] + floors[s + 1]) / 2, frontZ + 0.06, 'service-panel'), p.wallAlt)]);
        add(battenScreen(ctx, {
          x: bx + bayW * 0.22, y: floors[s] + 0.55, z: frontZ + 0.14,
          w: bayW * 0.42, h: 1.20, pitch: 0.20, facing: 1, material: p.joinery,
        }));
        add(gridWindow(ctx, {
          x: bx, y: floors[s] + 1.20 + 0.72, z: frontZ, w: 0.68, h: 1.45, facing: 'front',
        }));
      }
      continue;
    }
    for (let s = 0; s < 3; s += 1) {
      if (b === entryBay && s < 2) continue;   // the double-height lobby takes both
      add(ribbonBay(ctx, {
        x: bx, w: bayW, z: frontZ, y0: floors[s], y1: floors[s + 1],
        spandrelH: s === 0 ? 0.62 : 0.85,
      }));
    }
  }
  // ── r10 / r9 MAJ-E: THE BAYS HAD NO FLOOR DATUM ───────────────────────────────────────────
  //
  // r7 named it, r8 listed it as unaddressed, r9 kept it open: "within adjacent bays the bands
  // sit at four different heights, stepping diagonally across a three-storey elevation with no
  // floor datum."
  //
  // The bays ARE at one height — every one runs `floors[s]` to `floors[s+1]`, which I checked
  // before building anything. What is missing is the LINE that says so. Each bay's cill and head
  // stop at its own bay, and the piers stand 0.31 m proud between them, so in a three-quarter
  // view the eye gets a set of separate horizontal marks at four different SCREEN heights and no
  // continuous edge to refer them to. That is a real fault and the fix is architectural rather
  // than perceptual: a low-rise office of this era has a continuous precast floor band running
  // ACROSS its piers at every level. Two bands, 24 triangles, on a subject with 3,124 in hand.
  //
  // ── r13: THE BAND IS SLIMMER AND IT HAS A SHADOW UNDER IT ────────────────────────────────
  //
  // r11's objection to the fix was that each bay became "a thin dark slot under a HEAVY PALE
  // BAR". The datum has to exist — that was r7's finding and it stands — but 0.24 m of `trim`
  // projecting 0.20 m past the piers is a bigger member than the thing it is annotating. It is
  // now 0.15 m with a 0.06 m recessed shadow reveal under it, so the band reads as a line rather
  // than as a shelf, and the value step is the reveal's rather than the band's own width.
  for (let s = 1; s < 3; s += 1) {
    add([
      part(box(env.bodyW + 0.34, 0.15, 0.56, 0, floors[s] + 0.04, frontZ + 0.18,
        `floor-band-${s}`), p.trim),
      part(recessFaces(box(env.bodyW + 0.30, 0.07, 0.42, 0, floors[s] - 0.06, frontZ + 0.11,
        `floor-band-${s}-reveal`), RECESS.soffit, ['ny', 'pz']), p.shadow),
    ]);
  }

  // ── THE ENTRY IS DOUBLE HEIGHT, AND IT IS THE SUBJECT'S HIERARCHY ────────────────────────
  //
  // r11 and r12 both graded this elevation down for having nothing to look at. A single-storey
  // lobby in one of four identical bays cannot be the answer, because it is the same size as
  // everything beside it. The lobby now runs through two floors behind one portal frame, with a
  // mezzanine edge visible in it, a stair beyond and a blade that carries the address past the
  // parapet. Every member of it is either lit or carrying the §5.3 floor — a two-storey glazed
  // void is the deepest recess on the subject and the one place the black would go.
  const ex = bayX[entryBay];
  add([
    part(box(bayW, lobbyH, 0.90, ex, lobbyH / 2, frontZ - 0.55, 'lobby-void'), p.trim, 1),
    // The mezzanine floor edge and the stair flight behind the glass. This is what makes a
    // double-height lobby read as a room instead of as a taller hole.
    part(box(bayW - 0.30, 0.24, 0.62, ex, groundH - 0.30, frontZ - 0.62, 'lobby-mezz'), p.wallAlt, RECESS.interior),
    part(box(bayW - 0.30, 0.09, 0.10, ex, groundH + 0.72, frontZ - 0.62, 'lobby-mezz-rail'), p.joinery, RECESS.interior),
    part(rotBox(bayW * 0.42, 0.16, 3.30, ex - bayW * 0.24, groundH * 0.52, frontZ - 0.70,
      { x: -0.62 }, 'lobby-stair'), p.paving, RECESS.interior),
    part(box(bayW - 0.16, lobbyH - 0.34, 0.05, ex, lobbyH / 2 - 0.10, frontZ - 0.16, 'lobby-glass'), p.glass),
    part(box(bayW + 0.30, 0.26, 0.34, ex, lobbyH + 0.05, frontZ - 0.02, 'lobby-head'), p.trim),
    // The portal frame: a proud rendered surround standing clear of the piers either side, which
    // is what tells a viewer at board zoom which of the four bays is the way in.
    part(box(0.30, lobbyH + 0.36, 0.42, ex - bayW / 2 - 0.15, (lobbyH + 0.36) / 2, frontZ + 0.14, 'portal-l'), p.trim),
    part(box(0.30, lobbyH + 0.36, 0.42, ex + bayW / 2 + 0.15, (lobbyH + 0.36) / 2, frontZ + 0.14, 'portal-r'), p.trim),
    part(box(bayW + 0.90, 0.30, 0.42, ex, lobbyH + 0.30, frontZ + 0.14, 'portal-head'), p.trim),
    part(box(0.14, lobbyH, 0.24, ex - bayW / 2 + 0.07, lobbyH / 2, frontZ - 0.06, 'lobby-jamb-l'), p.joinery, 1),
    part(box(0.14, lobbyH, 0.24, ex + bayW / 2 - 0.07, lobbyH / 2, frontZ - 0.06, 'lobby-jamb-r'), p.joinery, 1),
    part(box(bayW - 0.28, 0.13, 0.20, ex, groundH - 0.44, frontZ - 0.14, 'lobby-transom'), p.joinery, RECESS.sash),
    part(box(bayW - 0.28, 0.11, 0.16, ex, lobbyH - 0.70, frontZ - 0.14, 'lobby-transom'), p.joinery, RECESS.sash),
  ]);
  // Entrance steps and threshold, so the lobby floor is above the forecourt.
  add([
    part(slab(bayW + 0.9, 0.16, 0.80, ex, 0.0, frontZ + 0.42, 'entry-step'), p.paving),
    part(slab(bayW + 0.5, 0.16, 0.55, ex, 0.16, frontZ + 0.20, 'entry-step-2'), p.paving),
  ]);
  for (const side of [-1, 1]) {
    add(commercialDoor(ctx, {
      x: ex + side * 0.62, y: 1.22, z: frontZ - 0.16, w: 1.10, h: 2.44,
      id: `office-entry-${side > 0 ? 'r' : 'l'}`,
      label: 'Office entry', glazed: true, leafMaterial: p.joinery,
    }));
  }
  // Canopy over the doors — now at DOOR height, not at lobby head height, because the lobby head
  // is 7.6 m up and a canopy there shelters nobody. It is the horizontal that lands the entry.
  const canopyProj = 1.55;
  const canopyY = 3.05;
  add([
    part(slab(bayW + pierW * 1.4, 0.22, canopyProj, ex, canopyY, frontZ + canopyProj / 2, 'canopy'), p.trim),
    part(slab(bayW + pierW * 1.4 + 0.08, 0.09, 0.14, ex, canopyY - 0.06, frontZ + canopyProj, 'canopy-nose'), p.roof),
    part(box(bayW + pierW * 1.4, 0.10, canopyProj - 0.2, ex, canopyY - 0.02, frontZ + canopyProj / 2, 'canopy-soffit'), p.shadow, RECESS.soffit),
  ]);
  for (const side of [-1, 1]) {
    const rodLen = Math.hypot(canopyProj - 0.35, 1.15);
    add([part(box(0.055, 0.055, rodLen, ex + side * (bayW / 2 - 0.1), canopyY + 0.65,
      frontZ + (canopyProj - 0.35) / 2, 'canopy-tie'), p.joinery)]);
  }
  // The address blade. It rises past the parapet on the entry bay's own centreline, so the thing
  // that makes the skyline step is the same thing that marks the way in — which is the hierarchy
  // this elevation has never had. It is also the third object on a skyline that carried two.
  //
  // ── AND IT WAS DRAWN FROM `wallAlt`, WHICH MADE IT A SERVICE RISER ─────────────────────
  //
  // `wallAlt` on this scheme is the charcoal precast spandrel at rendered luma 55. Standing 14 m
  // of it on end down the centre of a buff-brick elevation does not read as an address pylon; it
  // reads as a duct, and the variants critic measured it at 8.184 m2 of untagged dark and said
  // exactly that. A blade that marks the way in is the LIGHT thing on a dark wall, not the dark
  // thing on a light one — so the shaft takes `trim` (150) and the cap takes `wallAlt`, which
  // inverts the pair and gives the cap an edge it never had. Zero triangles, and it is also
  // 8 m2 of new sunlit pale area on the subject with the fewest occupied top value bands.
  add([
    part(box(0.46, env.wallH + 1.55, 0.62, ex - bayW / 2 - 0.15, (env.wallH + 1.55) / 2,
      frontZ + 0.24, 'address-blade'), p.trim),
    part(box(0.58, 0.14, 0.74, ex - bayW / 2 - 0.15, env.wallH + 1.62, frontZ + 0.25,
      'address-blade-cap'), p.wallAlt),
  ]);
  add(signBand(ctx, {
    x: ex + 0.30, y: lobbyH + 0.72, z: frontZ + 0.36, w: bayW * 0.62, h: 0.44,
    facing: 1, blank: true, name: 'address',
  }));
  add(lamp(ctx, { x: ex - bayW / 2 - pierW * 0.5, y: 2.55, z: frontZ + 0.34 }));

  /* ── base, courses, crown ────────────────────────────────────────────────────────── */
  add(plinthCourse(ctx, { z: midZ, w: env.bodyW, d: env.bodyD, h: 0.78, proud: 0.15 }));
  add(stringCourse(ctx, { z: midZ, w: env.bodyW, d: env.bodyD, y: env.wallH - 0.28, thick: 0.16, proud: 0.13 }));
  add(parapetCrown(ctx, {
    z: midZ, w: env.bodyW, d: env.bodyD, y: env.wallH, parapet: 0.78,
  }));
  // ── r13: THE PARAPET STEPS OVER THE ENTRY ────────────────────────────────────────────────
  //
  // A level parapet across a 14 m frontage is the flattest line on the subject, and §4 asks this
  // id to be sortable in silhouette. The step is over the entry bay — the same axis as the blade
  // and the portal — so the skyline says the same thing the plan does. A shadow reveal runs
  // under the whole coping so the crown has a line of its own at every hour.
  add([
    part(box(bayW + pierW * 2.4, 0.66, 0.40, ex, env.wallH + 0.78 + 0.33, frontZ + 0.06,
      'para-step'), p.wall),
    part(box(bayW + pierW * 2.4 + 0.22, 0.15, 0.54, ex, env.wallH + 1.52, frontZ + 0.07,
      'para-step-cope'), p.trim),
    part(recessFaces(box(env.bodyW + 0.20, 0.09, 0.30, 0, env.wallH + 0.70, frontZ + 0.16,
      'para-reveal'), RECESS.soffit, ['ny', 'pz']), p.shadow),
  ]);

  // The service core: a solid brick blade past the parapet at the LEFT end. This is the
  // silhouette's asymmetry and it is load-bearing for §4's "sortable in silhouette alone".
  const coreW = 3.1;
  const coreX = -halfW + coreW / 2 + 0.2;
  const coreTop = env.wallH + 2.65;
  // §2.10 — THE BLADE AND THE OVERRUN ARE `wallAlt`, NOT `wall`.
  //
  // r1 bound the body, the frontage, all five piers, this blade and the lift overrun to
  // `p.wall`, and the r1 critic measured the consequence: 88.0 % of the subject warm, one
  // material owning the envelope by construction, with the two objects that make the skyline
  // asymmetric rendering as the same brick as the wall they rise out of. A service core is a
  // different material from the frontage on every 1980s low-rise in Melbourne — it is the
  // stair-and-lift box, usually precast or blockwork. Zero triangles, and it is the fault §2.10
  // prices above any geometry gap.
  add([
    part(box(coreW, coreTop, 3.4, coreX, coreTop / 2, backZ + 2.1, 'core-blade'), p.wallAlt),
    part(box(coreW + 0.22, 0.20, 3.62, coreX, coreTop + 0.10, backZ + 2.1, 'core-cap'), p.trim),
  ]);
  // ── r13: THE BLADE IS NOT BLANK ANY MORE ─────────────────────────────────────────────────
  //
  // A 3.1 x 14.3 m precast slab with a cap on it is a massing study, and it is the largest
  // untextured area on this subject. A stair core has a stair in it, and every one of these in
  // Melbourne shows it the same way: a vertical slot of glass block or obscure glazing running
  // the full height between two expressed precast joints. Three members plus the slot.
  add([
    part(box(0.10, coreTop - 0.60, 0.12, coreX - coreW * 0.30, (coreTop - 0.60) / 2 + 0.30,
      backZ + 2.1 - 1.70 - 0.05, 'core-joint'), p.shadow, RECESS.soffit),
    part(box(0.10, coreTop - 0.60, 0.12, coreX + coreW * 0.30, (coreTop - 0.60) / 2 + 0.30,
      backZ + 2.1 - 1.70 - 0.05, 'core-joint'), p.shadow, RECESS.soffit),
    part(recessFaces(box(0.80, coreTop - 1.60, 0.20, coreX, (coreTop - 1.60) / 2 + 0.70,
      backZ + 2.1 - 1.70 - 0.02, 'core-slot-ret'), 1, ['pz']), p.trim, 1),
    part(box(0.62, coreTop - 1.80, 0.05, coreX, (coreTop - 1.80) / 2 + 0.80,
      backZ + 2.1 - 1.70 - 0.12, 'core-slot-glass'), p.glass),
  ]);
  // The stair landings behind that slot, seen through it — four treads' worth of horizontal, so
  // the slot reads as a stair rather than as a strip of paint.
  if (ctx.detail) {
    for (let i = 0; i < 4; i += 1) {
      add([part(box(0.66, 0.09, 0.10, coreX, 1.40 + i * 3.0, backZ + 2.1 - 1.70 - 0.24,
        'core-landing'), p.joinery, RECESS.interior)]);
    }
  }
  // No brick bed-joints on the blade any more: it is precast now, and a precast blade with brick
  // courses scribed on it is a worse lie than a brick blade. Reclaims ~28 triangles, which is
  // spent below on the flank fenestration.

  // ── r13: THE PLANT IS A ROOFSCAPE, NOT TWO BOXES ─────────────────────────────────────────
  //
  // r12 got the plant unit off literal zero — 59.048 % to 0.000 — and the object it lit is still
  // two chiller boxes standing on a deck with a louvre in front of them. A plant deck is a
  // BUILT thing: a raised concrete plinth, a screen on the three sides the street can see, a
  // walkway with a handrail, and the flue coming through. Four members and a rail, and it turns
  // the far end of the skyline into the second event §4 asks for.
  const plantX = halfW - 3.0;
  const plantZ = midZ + env.bodyD * 0.12;
  add([
    part(slab(5.0, 0.24, 3.8, plantX, env.wallH + 0.10, plantZ, 'plant-plinth'), p.paving),
    part(box(5.2, 0.11, 0.16, plantX, env.wallH + 0.34, plantZ + 1.98, 'plant-plinth-edge'), p.trim),
  ]);
  add(roofPlant(ctx, {
    x: plantX, z: plantZ, w: 4.4, d: 3.2,
    y: env.wallH + 0.34, units: 2, screen: true,
  }));
  for (const [sx, sz, syaw, sw] of [
    [plantX, plantZ + 1.82, 0, 4.9],
    [plantX + 2.42, plantZ, Math.PI / 2, 3.6],
  ]) {
    add(yawParts(battenScreen(ctx, {
      x: 0, y: env.wallH + 0.34, z: 0, w: sw, h: 1.35, pitch: 0.44, facing: 1,
      material: p.joinery,
    }), syaw, sx, sz));
  }
  add(steelRail(ctx, {
    x: plantX, y: env.wallH + 0.34, z: plantZ - 1.86, w: 4.6, depth: 0.07, h: 1.05, infill: false,
  }));
  // Lift overrun, low, between them.
  add([
    part(slab(2.3, 1.5, 2.3, halfW - 3.0, env.wallH + 0.12, backZ + 3.0, 'overrun'), p.wallAlt),
    part(slab(2.5, 0.14, 2.5, halfW - 3.0, env.wallH + 1.62, backZ + 3.0, 'overrun-cap'), p.trim),
  ]);

  /* ── rainwater, grunge ───────────────────────────────────────────────────────────── */
  for (const side of [-1, 1]) {
    add(gutterRun(ctx, {
      x: side * (halfW - 0.5), z: midZ, w: 0.6, y: env.wallH - 0.5, facing: 0, dropAt: null, y0: 0.8,
    }));
  }
  add([
    part(cyl(0.075, env.wallH - 0.9, halfW - 0.28, (env.wallH - 0.9) / 2 + 0.8, frontZ - 0.06, 'y', 'dp-front', 8), p.joinery),
    part(box(0.24, 0.10, 0.22, halfW - 0.28, 0.85, frontZ - 0.02, 'dp-shoe'), p.joinery),
  ]);
  add(streaks(ctx, {
    plane: frontZ + 0.31, facing: 1, axis: 'x',
    xs: [pierX[0], pierX[2], pierX[4]], yTop: env.wallH - 0.35, length: 2.0,
  }));
  add(brickCourses(ctx, {
    axis: 'z', face: 1, plane: halfW, centre: midZ, run: env.bodyD,
    y0: 0.9, y1: 7.6, openings: flankHoles.right, pitch: 0.66,
  }));

  /* ── flank windows ───────────────────────────────────────────────────────────────── */
  // Flanks and rear take `gridWindow` rather than the full `punchedWindow` member set. The
  // frontage is where a critic orbits and it keeps every member; the sides pay seven boxes an
  // opening instead of twelve, which is 1,600 triangles on this subject alone (§3.4).
  for (const [side, list] of [[1, flankHoles.right], [-1, flankHoles.left]]) {
    for (const o of list) {
      add(gridWindow(ctx, {
        x: side * halfW, y: o.y + o.height / 2, z: o.u, w: o.width, h: o.height,
        facing: side > 0 ? 'right' : 'left',
      }));
    }
  }
  for (const o of flankHoles.back) {
    add(gridWindow(ctx, {
      x: o.u, y: o.y + o.height / 2, z: backZ, w: o.width, h: o.height, facing: 'back',
    }));
  }
  // Rear service door — a building nobody can get out the back of is a construction failure.
  add(commercialDoor(ctx, {
    x: env.bodyW * 0.30, y: 1.20, z: backZ, w: 1.05, h: 2.28,
    facing: 'back', id: 'office-service', label: 'Service door', leafMaterial: p.joinery,
  }));

  /* ── forecourt furniture and planting ─────────────────────────────────────────────────
   *
   * ── r13: THE FORECOURT WAS ONE BLOB, AND THE r11 CRITIC MEASURED IT AS ONE ────────────
   *
   * "The forecourt blob is byte-identical at 15.086 %" — one paved rectangle 15.7 m wide with
   * two beds at the back of it, so the largest single area on the plate is a flat grid with
   * nothing in it. The fix is a LEVEL and a LINE, not more pavers: a raised planted median on
   * the entry axis with a seat wall along it, an approach walk in a different paving module
   * running from the gate to the door, and bollards where the forecourt meets the footpath.
   *
   * The shrubs also grow. `shrubMass` only emits its silhouette-breaking sprigs above r 0.34
   * (`core.js`), and these beds were planted at 0.30-0.46, so half of them came out as four
   * flat-topped lobes — which is exactly what r11 called "extruded prisms with flat tops". The
   * radius is a CALLER's choice and it costs nothing to make it a planting decision instead of
   * an accident. The generator's own low-radius behaviour is left alone: changing it would move
   * every lot in the lane, and `apartment-midrise` has 176 triangles of headroom.
   */
  const bedZ = courtZ1 - 0.85;
  add(plantedBed(ctx, { x: -env.lotW * 0.30, z: bedZ, w: 3.4, d: 1.5, plants: 2, salt: S + 10 }));
  add(plantedBed(ctx, { x: env.lotW * 0.30, z: bedZ, w: 3.4, d: 1.5, plants: 2, salt: S + 20 }));
  // The median on the entry axis: a kerbed raised bed with a seat wall along its street side.
  const medianZ = (courtZ0 + courtZ1) / 2;
  add([
    part(slab(2.30, 0.34, 3.20, bayX[entryBay] + 3.10, 0.0, medianZ, 'bed-soil'), p.shadow),
    part(slab(2.46, 0.42, 0.16, bayX[entryBay] + 3.10, 0.0, medianZ + 1.60, 'bed-kerb'), p.wallAlt),
    part(slab(2.46, 0.42, 0.16, bayX[entryBay] + 3.10, 0.0, medianZ - 1.60, 'bed-kerb'), p.wallAlt),
    part(slab(0.16, 0.42, 3.20, bayX[entryBay] + 4.23, 0.0, medianZ, 'bed-kerb'), p.wallAlt),
    part(slab(0.44, 0.46, 3.30, bayX[entryBay] + 1.97, 0.0, medianZ, 'bed-kerb'), p.wallAlt),
    part(slab(0.56, 0.09, 3.42, bayX[entryBay] + 1.97, 0.46, medianZ, 'bed-kerb-seat'), p.trim),
  ]);
  for (let i = 0; i < 3; i += 1) {
    add(shrubMass(ctx, {
      x: bayX[entryBay] + 2.55 + (i % 2) * 1.05,
      z: medianZ - 1.05 + i * 1.05, r: 0.46, h: 0.72, y: 0.34,
    }));
  }
  // The approach walk: a different paving module from the forecourt field, running from the
  // gate in the pier wall to the entry steps. §2.7 asks for a path made of units; a forecourt
  // that is all one unit has no path in it at all.
  add(paverPath(ctx, {
    x: bayX[entryBay], z0: frontZ + 0.9, z1: courtZ1 - 0.2, width: 2.60, unit: 0.85, y: 0.02,
  }));
  // Bollards at the footpath edge, which is what stops a car crossing a forecourt and what
  // gives the lot a foreground object at eye height.
  for (let i = 0; i < 4; i += 1) {
    const bx = -env.lotW * 0.30 + i * (env.lotW * 0.20);
    if (Math.abs(bx - bayX[entryBay]) < 1.8) continue;
    add([
      part(cyl(0.085, 0.86, bx, 0.43, courtZ1 + 0.30, 'y', 'lamp-bollard', 8), p.joinery),
      part(cyl(0.10, 0.07, bx, 0.88, courtZ1 + 0.30, 'y', 'lamp-bollard-cap', 8), p.trim),
    ]);
  }
  add(bikeRack(ctx, { x: -env.lotW * 0.16, z: frontZ + 1.5, hoops: 3 }));
  add(canopyTree(ctx, { x: -env.lotW * 0.34, z: courtZ0 + 1.6, h: 3.4, canopy: 0.95, pit: true }));
  add(canopyTree(ctx, { x: env.lotW * 0.34, z: courtZ0 + 2.6, h: 3.0, canopy: 0.82, pit: true }));
  add(pierWall(ctx, {
    z: env.lotD / 2 - METRICS.rim - 1.45, x0: -env.lotW / 2 + METRICS.rim, x1: env.lotW / 2 - METRICS.rim,
    h: 0.66, gapX: bayX[entryBay], gapW: 3.6, piers: 4,
  }));
  // Rear yard: parking bay hardstand, hedge to the boundary.
  add(paverField(ctx, {
    x: 0, z: backZ - 2.6, w: env.bodyW * 0.9, d: 3.6, unit: 1.65, bed: false,
  }));
  add(hedgeRun(ctx, {
    x0: -env.lotW / 2 + METRICS.rim + 0.5, z0: -env.lotD / 2 + METRICS.rim + 0.6,
    x1: env.lotW / 2 - METRICS.rim - 0.5, z1: -env.lotD / 2 + METRICS.rim + 0.6, h: 0.95,
  }));
  for (const side of [-1, 1]) {
    add(hedgeRun(ctx, {
      x0: side * (env.lotW / 2 - METRICS.rim - 0.45), z0: backZ - 0.5,
      x1: side * (env.lotW / 2 - METRICS.rim - 0.45), z1: -env.lotD / 2 + METRICS.rim + 1.0, h: 0.85,
    }));
  }
  add(lawnTufts(ctx, {
    count: 12, salt: S + 60,
    avoid: [
      { x: 0, z: midZ, w: env.bodyW + 2.2, d: env.bodyD + 2.2 },
      { x: 0, z: (courtZ0 + courtZ1) / 2, w: env.bodyW + 2.0, d: courtD + 0.6 },
      { x: 0, z: backZ - 2.6, w: env.bodyW, d: 4.0 },
    ],
  }));
}

/**
 * `tower-office` is the office's succession rung: the same pier-and-infill grammar taken up to
 * eight storeys with a two-storey podium and a set-back crown, so a player who upgrades sees the
 * same building's language grow rather than a different architect turning up.
 */
export function buildTowerOffice(ctx) {
  const { env, p } = ctx;
  const add = (produced) => ctx.add(produced);
  const halfW = env.bodyW / 2;
  const frontZ = env.frontZ;
  const backZ = env.backZ;
  const midZ = (frontZ + backZ) / 2;
  const podiumH = 7.4;
  const towerTop = env.wallH;
  const crownY = towerTop - 3.2;

  add(boardPlinth(ctx, { lawn: true }));
  add(kerbAndFootpath(ctx));
  const courtZ1 = env.lotD / 2 - METRICS.rim - 1.35;
  add(paverField(ctx, {
    x: 0, z: (frontZ + courtZ1) / 2, w: env.bodyW + 1.6, d: Math.max(1.2, courtZ1 - frontZ), unit: 1.25,
  }));

  const BAYS = 4;
  const pierW = 0.78;
  const bayW = (env.bodyW - pierW * (BAYS + 1)) / BAYS;
  const pierX = [];
  for (let i = 0; i <= BAYS; i += 1) pierX.push(-halfW + pierW / 2 + i * (pierW + bayW));
  const bayX = [];
  for (let i = 0; i < BAYS; i += 1) bayX.push(pierX[i] + (pierW + bayW) / 2);

  const storeys = Math.max(5, Math.round(env.wallH / 3.35));
  const floors = [];
  for (let i = 0; i <= storeys; i += 1) floors.push((env.wallH * i) / storeys);

  add(volume(ctx, {
    material: p.wall, x: 0, zFront: frontZ, zBack: backZ, width: env.bodyW,
    y0: 0, y1: crownY, depth: METRICS.wallDepth, name: 'tower',
  }));

  // THE FLANKS AND THE REAR WERE BLANK, AND ON THE r3 PLATE THEY ARE THE SUBJECT.
  //
  // `volume` was called with no `left`, `right` or `back` openings, so an eight-storey tower
  // carried three unbroken render walls; 43.5 % of the subject measured in one luma band, which
  // is a flat cream slab and nothing else. Fixed with a recessed glazing BAND per storey rather
  // than punched windows, for two reasons: it is what a 1980s office tower's flank actually is,
  // and it costs three boxes a storey instead of a grid of seven-member sashes — 864 triangles
  // for three elevations against the ~2,300 a punched grid would have wanted, inside the 1,920
  // this subject had spare.
  const bandInset = 0.30;
  for (const [face, plane, axis] of [[-1, -halfW, 'z'], [1, halfW, 'z'], [-1, backZ, 'x']]) {
    const run = axis === 'z' ? env.bodyD * 0.80 : env.bodyW * 0.78;
    const centre = axis === 'z' ? midZ : 0;
    for (let s = 0; s < floors.length - 1 && floors[s + 1] <= crownY + 0.01; s += 1) {
      const y0 = floors[s];
      const bandH = (floors[s + 1] - y0) * 0.46;
      const by = y0 + (floors[s + 1] - y0) * 0.52;
      const at = (w, h, d, off, name, mat) => (axis === 'z'
        ? part(box(d, h, w, plane - face * off, by, centre, name), mat)
        : part(box(w, h, d, centre, by, plane - face * off, name), mat));
      add([
        at(run, bandH + 0.10, bandInset, bandInset / 2 - 0.02, 'flank-band-void', p.shadow),
        at(run - 0.10, bandH, 0.06, bandInset - 0.04, 'flank-band-glass', p.glass),
        at(run + 0.24, 0.16, 0.16, -0.05, 'flank-band-cill', p.trim),
      ]);
    }
  }
  add(openWall(ctx, {
    material: p.wall, axis: 'x', face: 1, plane: frontZ, centre: 0, run: env.bodyW,
    y0: 0, y1: crownY, depth: METRICS.wallDepth,
    openings: bayX.map((bx) => hole(bx, 0.0, bayW + 0.02, crownY)),
    name: 'tower-front',
  }));
  for (const px of pierX) {
    add([part(recessFaces(box(pierW, crownY, 0.36, px, crownY / 2, frontZ + 0.08, 'pier'),
      RECESS.soffit, ['px', 'nx']), p.wall)]);
  }
  for (const bx of bayX) {
    for (let s = 0; s < floors.length - 1 && floors[s + 1] <= crownY + 0.01; s += 1) {
      add(ribbonBay(ctx, {
        x: bx, w: bayW, z: frontZ, y0: floors[s], y1: floors[s + 1],
        spandrelH: s === 0 ? 1.15 : 0.78,
      }));
    }
  }
  // Podium cornice: the horizontal that separates base from shaft.
  add(stringCourse(ctx, { z: midZ, w: env.bodyW, d: env.bodyD, y: podiumH, thick: 0.22, proud: 0.20 }));
  add(plinthCourse(ctx, { z: midZ, w: env.bodyW, d: env.bodyD, h: 0.9, proud: 0.16 }));
  // Set-back crown.
  const crownW = env.bodyW - 1.9;
  const crownD = env.bodyD - 1.9;
  add(volume(ctx, {
    material: p.wallAlt, x: 0, zFront: midZ + crownD / 2, zBack: midZ - crownD / 2,
    width: crownW, y0: crownY, y1: towerTop, depth: 0.30, name: 'crown',
  }));
  add(parapetCrown(ctx, { z: midZ, w: crownW, d: crownD, y: towerTop, parapet: 0.72 }));
  add(parapetCrown(ctx, { z: midZ, w: env.bodyW, d: env.bodyD, y: crownY, parapet: 0.86, deck: false }));
  add(roofPlant(ctx, { x: 0, z: midZ, w: crownW * 0.7, d: crownD * 0.6, y: towerTop + 0.12, units: 3 }));
  add(battenScreen(ctx, {
    x: 0, y: crownY, z: midZ + crownD / 2 + 0.05, w: crownW * 0.9, h: towerTop - crownY - 0.3, pitch: 0.34,
  }));

  const ex = bayX[1];
  add([
    part(box(bayW, podiumH * 0.62, 0.55, ex, podiumH * 0.31, frontZ - 0.38, 'lobby-void'), p.shadow),
    part(box(bayW - 0.18, podiumH * 0.56, 0.05, ex, podiumH * 0.31, frontZ - 0.16, 'lobby-glass'), p.glass),
    part(slab(bayW + pierW * 1.6, 0.24, 1.7, ex, podiumH * 0.64, frontZ + 0.85, 'canopy'), p.trim),
  ]);
  add(commercialDoor(ctx, {
    x: ex, y: 1.24, z: frontZ - 0.16, w: 1.30, h: 2.48,
    id: 'tower-entry', label: 'Office entry', glazed: true, leafMaterial: p.joinery,
  }));
  add(plantedBed(ctx, { x: -env.lotW * 0.30, z: courtZ1 - 0.9, w: 3.6, d: 1.5, plants: 3, salt: S + 80 }));
  add(plantedBed(ctx, { x: env.lotW * 0.30, z: courtZ1 - 0.9, w: 3.6, d: 1.5, plants: 3, salt: S + 90 }));
  add(bikeRack(ctx, { x: -env.lotW * 0.18, z: frontZ + 1.4, hoops: 3 }));
  add(canopyTree(ctx, { x: env.lotW * 0.34, z: frontZ + 2.2, h: 3.2, canopy: 0.86, pit: true }));
  add(hedgeRun(ctx, {
    x0: -env.lotW / 2 + METRICS.rim + 0.5, z0: -env.lotD / 2 + METRICS.rim + 0.6,
    x1: env.lotW / 2 - METRICS.rim - 0.5, z1: -env.lotD / 2 + METRICS.rim + 0.6, h: 0.95,
  }));
  add(lawnTufts(ctx, {
    count: 14, salt: S + 120,
    avoid: [{ x: 0, z: midZ, w: env.bodyW + 2.4, d: env.bodyD + 2.4 }],
  }));
}

export const OFFICE_BUILDERS = Object.freeze({
  'office-lowrise': buildOfficeLowrise,
  'tower-office': buildTowerOffice,
});
