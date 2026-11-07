// District Deck V3.70 — `hammerbarn`, the Australian big-box hardware warehouse (lane L4).
//
// A NEW SUBJECT, so this file is new and NOTHING ELSE IN THIS DIRECTORY IS TOUCHED. The four
// shared-file edits the subject needs — the dispatcher registration, the envelope row, the
// palette scheme and the two board/content registrations — are written out as paste-ready
// patches in `_reviews/quality-loop/v370/hammerbarn/r1-builder.md` rather than made here
// (CONTRACT.md rule 6 and 7, and the lane has been live all session).
//
// ══ WHAT THE SUBJECT IS, AND WHAT IT IS NOT ═══════════════════════════════════════════════
//
// It is a BUILDING TYPE: a clear-span steel portal shed holding a warehouse, with a deep
// colonnaded entry canopy across its front, a blank fascia band above that, a screened outdoor
// nursery / timber yard at one end, a loading dock down the other flank, and an asphalt car
// park apron in front. It is NOT any particular company's store. There is no logo, no device,
// no mascot and no trade dress anywhere in this file. What names the type is MASSING, COLOUR
// and CONSTRUCTION. The one word permitted on it is HAMMERBARN, in relief letters on the
// fascia band, and that word is the only text this file emits.
//
// ══ THE ONE THING THE BOARD CANNOT GIVE THIS SUBJECT, STATED RATHER THAN FAKED (§6.4) ═════
//
// The type's single most identifying property is that it is EIGHT TIMES LONGER THAN IT IS
// TALL. The reference pack's own subject brief
// (`_reference-hammerbarn/_prompts/subject-hammerbarn-three-quarter.txt`, opened) sets it on a
// 95 x 95 m parcel at 76 m of frontage, 52 m deep, 9 m to the eaves.
//
// A commercial parcel on this board is a `[1, 2]` footprint: 15 m across the street frontage
// and 31 m deep, and `city.js rowPlacementForFootprint()` rejects any footprint whose
// ROW-setback axis is not 1 tile, so a `[2, 2]` id would be silently swapped for a 1x1
// archetype on every ROW-adjacent parcel. 76 m of frontage is unreachable by any means this
// lane has, and no massing choice recovers it.
//
// So the ratio is taken on the axis the board DOES have: the shed runs 17.4 m BACK from an
// 11.0 m frontage at 5.90 m to the eaves, which is 2.95 : 1 on the flank the three-quarter
// board camera actually looks at, and the height is pushed down rather than the length faked.
// The measured figures and the `[2, 2]` request are in the round report. Nothing here bends
// to a number the pad cannot hold.
//
// ══ THE NINE BUCKETS, AND WHERE THE RED IS ALLOWED TO GO ══════════════════════════════════
//
//   wall     grey-green profiled steel cladding — the field, and the largest area (§5.3.1)
//   wallAlt  THE ACCENT. Fascia band, entry-pier faces, bollards, pylon slab. Nowhere else.
//   roof     seamed metal roof, ridge and barge cappings, plant, banner panels
//   trim     LIGHTEST — concrete dado, canopy soffit lining, footings, line marking, kerbs
//   joinery  DARKEST — mesh screen, shutters, guides, gutters, stair, poles, framing
//   glass    the entry bank, ramped, never a flat card
//   shadow   reveals, soffits, the board tray, path beds, the base course
//   paving   the asphalt apron and the service lane
//   garden   the nursery stock, the islands, the street strip
//
// §2.10 is the clause a red-and-grey shed fights, and it is answered by AREA rather than by
// desaturation. Measured by `hb-palette.mjs`: the accent lives on exactly four elements — the
// fascia band, the entry-pier shafts, the bollards and the pylon slab — and takes 7.3 % of the
// STREET ELEVATION, the one view where it is concentrated, against the cladding's 35.1 %; on the
// whole object it is 1.6 %. The cladding, not the red, is the dominant hue, which is what §5.3.1
// permits of a subject's principal material. Its rendered chroma (43) is over the lane probe's
// 26 cap for a non-`wall` bucket and that is REPORTED in the round report, not waived here.
//
// Salt namespace: 5900–5999. The lane's published ranges are core/lot 5000–5199, surfaces
// 5400–5499, office 5500–5599, shop 5600–5699, apartment 5700–5899; 5900+ was free.

import {
  box, slab, rotBox, cyl, taper,
  METRICS, part, recessFaces, hole, volume, countAperture, yawParts,
  seamedGable, gutterRun, punchedWindow, commercialDoor,
  battenScreen, streaks, boardPlinth, paverField, kerbAndFootpath,
  shrubMass, canopyTree, plantedBed,
} from './core.js';
import { RECESS } from './surfaces.js';
import { reliefLetters, reliefExtent } from '../signage/index.js';
import { FARM_KIT } from '../../core/content.js';

/* ────────────────────────────── the site frame ──────────────────────────────────────────
 *
 * ONE PURE FUNCTION DERIVES EVERY DIMENSION, and every consumer reads it. The alternative —
 * each producer recomputing the shed's west wall from `env` — is the duplicated-constant
 * defect this programme has logged ten times, and on a subject whose canopy piers, cladding
 * ribs and roof seams are all supposed to be counted off ONE structural frame it would show.
 *
 * Everything is CLAMPED against the lot rather than trusted to the envelope table. §3.6 says
 * the envelope stays on the pad; `index.js` jitters `bodyW` by ±1.4 % and `bodyD` by ±1.6 %
 * per façade, and a rear wall sized from the jittered depth alone reaches -15.47 on façade 1
 * against a lot rim at -15.5 — before the 0.30 m roof overhang. So the rear is set from the
 * PAD and the depth follows, not the other way round.
 */
function siteFrame(ctx) {
  const { env } = ctx;
  const halfW = env.lotW / 2;
  const halfD = env.lotD / 2;

  // Margins are the roof overhang (0.30) plus a clear band, so nothing on the building —
  // including the gutter and the barge capping — reaches the tray's bevel rim.
  const EAST = 0.62;
  const REAR = 0.92;

  const bodyW = env.bodyW;
  const sx = halfW - EAST - bodyW / 2;      // shed centre, pushed east so a service lane fits
  const frontZ = env.frontZ;
  const rearZ = Math.max(-halfD + REAR, frontZ - env.bodyD);
  const bodyD = frontZ - rearZ;

  const extraFloors = Math.max(0, (Number(env.storeys) || 1) - 1);
  const eaves = env.wallH + extraFloors * HAMMERBARN_EXTRA_FLOOR;
  const pitchDeg = 4;                       // the reference's own figure, opened and used
  const overhang = 0.30;
  const ridgeRise = Math.tan((pitchDeg * Math.PI) / 180) * (bodyD / 2 + overhang);

  const dadoH = 1.20;                       // concrete dado panel, all the way round
  const baseH = 0.16;                       // the darker course under it (§2.3)

  // The canopy. Clear height under the beam, then the beam, then the deck, then the fascia
  // band standing above the deck as a parapet — four distinct depths on the frontage.
  // [SEEN] `_reference-hammerbarn/hb-hammerbarn-elevation.png`: the fascia band sits BELOW the
  // eaves with a clear band of cladding above it, not proud of them as a parapet. The first
  // draft put its top 0.30 m above the eaves, which reads as a parapeted shop rather than as a
  // shed with a sign band across it. The band now stops 0.52 m under the eaves.
  const canopyProj = 3.00;
  const canopyClear = 3.05;
  const beamH = 0.50;
  const deckY = canopyClear + beamH;        // 3.55
  const fascia0 = 3.78;
  // ── THE ONE PLACE THIS SUBJECT TRADES PROPORTION FOR LEGIBILITY, AND THE TRADE IS MEASURED ──
  //
  // Measured off `hb-hammerbarn-elevation.png`: the band is 0.26 of the wall's eaves height and
  // 0.14 of it again shows as cladding above. On our 5.90 m eaves that is a 1.55 m band — and
  // `hb-signage.mjs` prices a 1.55 m band's word at stroke 0.92 px at the 319 m station, which
  // `assessLabel()` returns as BLANK-PLATE: "a scatter of dots, worse than a blank". The signage
  // seat has plates of exactly that failure.
  //
  // 1.80 m is the smallest band that keeps the word off that verdict (stroke 1.04 px, MARGINAL at
  // 319 m, READS at the shipped 190 m default). The cost is stated rather than hidden: band/eaves
  // is 0.305 against the plate's 0.26, and only 0.32 m of cladding shows above it instead of 0.81.
  // The alternative — hold the plate's proportion exactly and ship the band BLANK, which is what
  // both reference plates actually show — is one line, and it is offered in the round report.
  const fascia1 = 5.58;
  const pierFace = 0.62;
  // [SEEN] same plate: every pier stands on a squat GREY CONCRETE footing block roughly a third
  // of a metre high, and the red shaft starts above it. 0.16 read as a skirting.
  const pierPad = 0.50;

  // The service lane runs the shed's west flank from the street to the dock.
  const laneW = (sx - bodyW / 2) - (-halfW + 0.30);
  const laneX = (-halfW + 0.30 + (sx - bodyW / 2)) / 2;

  // The forecourt. Apron from the canopy's leading edge to the footpath.
  const walkD = 1.30;
  const walkFront = halfD - METRICS.rim;                 // outer edge of the paved footpath
  const apronZ1 = walkFront - walkD - 0.10;
  // THE SEAL RUNS UNDER THE CANOPY, TO THE WALL. The first draft started it at the canopy's
  // leading edge, which left a colonnaded entry verandah standing on the lawn field for its
  // whole 3 m depth — `hb-palette.mjs`'s area census is what showed it, 882 m2 of `garden` on a
  // big-box lot. A car park apron is sealed up to the shopfront and that is what a plate of this
  // type shows under the canopy: asphalt, in shade, with the pier footings standing proud of it.
  const apronZ0 = frontZ;
  const apronCz = (apronZ0 + apronZ1) / 2;
  const apronD = apronZ1 - apronZ0;
  const apronTop = 0.06;

  // The yard sits at the EAST end of the forecourt, against the shed's east flank, so the
  // three-quarter camera looks down into it with the shed rising behind. Putting it at the
  // rear (where the reference's 95 m parcel puts it) would hide it behind the shed on every
  // station this programme captures.
  const yardW = Math.min(4.20, bodyW * 0.40);
  const yardX = sx + bodyW / 2 - yardW / 2;
  const yardZ0 = frontZ + canopyProj + 0.35;                 // clear of the canopy's east end
  const yardD = Math.min(4.60, apronZ1 - yardZ0 - 0.30);
  const yardZ = yardZ0 + yardD / 2;

  return {
    halfW, halfD, sx, bodyW, bodyD, frontZ, rearZ,
    west: sx - bodyW / 2, east: sx + bodyW / 2,
    eaves, baseEaves: env.wallH, extraFloors,
    pitchDeg, overhang, ridgeRise, ridgeY: eaves + ridgeRise,
    dadoH, baseH,
    canopyProj, canopyClear, beamH, deckY, fascia0, fascia1, pierFace, pierPad,
    laneW, laneX,
    walkD, walkFront, apronZ0, apronZ1, apronCz, apronD, apronTop,
    yardW, yardX, yardD, yardZ,
  };
}

/* ────────────────────────────── the shed shell ──────────────────────────────────────────── */

/**
 * §2.5, and it is the surface that names the type — WIDE VERTICAL BAYS OF PROFILED STEEL.
 *
 * A run of real ribs standing 55 mm proud at even centres, each one catching its own highlight
 * and casting its own thin shadow straight down the sheet. NOT a stripe painted on a flat wall,
 * and NOT a normal map — §2.4's objection to corrugation-as-texture applies to cladding for
 * exactly the same reason.
 *
 * The pitch is 0.95 m, which is a real trapezoidal cladding module and also the number the
 * board can see: at the measured board-zoom scale of 6.47 px/m along a wall (§5.4.0 — NOT the
 * inherited 7.33) a 0.95 m bay is 6.1 px, so the rhythm survives the station it is graded at.
 * A 0.30 m rib pitch would be truer to a real sheet and would arrive as grey.
 */
function claddingRibs(ctx, { axis, face, plane, centre, run, y0, y1, skip = [] }) {
  const out = [];
  if (!ctx.mid || !(run > 1) || !(y1 - y0 > 0.4)) return out;
  // 0.95 -> 0.62. [SEEN] `hb-hammerbarn-three-quarter.png` and `hb-hammerbarn-elevation.png`:
  // the reference's cladding reads as a fine vertical corduroy, not as a run of wide pilasters,
  // and at 0.95 m ours was the second thing. 0.62 m is 4.0 px along a wall at the board station's
  // measured 6.47 px/m (§5.4.0), so the rhythm still resolves where it is graded; the reference's
  // own ~0.35 m module would arrive at 2.3 px and grey out.
  const PITCH = 0.62;
  const n = Math.max(3, Math.round(run / PITCH));
  const step = run / n;
  const lo = centre - run / 2;
  // i starts at 1 and stops before n: a rib standing exactly on the wall's end is swallowed by
  // the corner flashing that covers the same 0.20 m — `hb-clash.mjs` reported eight of them as
  // `clad-rib inside corner-flash`, 96 triangles nothing can see.
  for (let i = 1; i < n; i += 1) {
    const u = lo + i * step;
    if (skip.some(([a, b]) => u > a - 0.10 && u < b + 0.10)) continue;
    // A rib is proud of the sheet, so it is authored OUTSIDE the wall plane with a negative
    // `set` — the same convention `streaks()` uses, and it means the rib never z-fights the
    // panel it stands on.
    const g = axis === 'x'
      ? box(0.09, y1 - y0, 0.055, u, (y0 + y1) / 2, plane + face * 0.027, 'clad-rib')
      : box(0.055, y1 - y0, 0.09, plane + face * 0.027, (y0 + y1) / 2, u, 'clad-rib');
    const unit = ctx.v.unit(70 + i);
    const mat = unit < 0.16 ? ctx.p.joinery : unit > 0.86 ? ctx.p.trim : ctx.p.wall;
    out.push(part(g, mat));
  }
  return out;
}

/**
 * §2.3 — the concrete dado and the darker course under it.
 *
 * The type's own base detail: a 1.2 m concrete panel running the whole way round under the
 * cladding, grubby where trolleys and pallets have hit it. It is drawn from `trim` rather than
 * from `wallAlt` — `plinthCourse()`'s default — for two reasons. `wallAlt` on this subject is
 * the ACCENT, and a red skirting round a shed would put the loud bucket on the one element
 * §2.10 is most alert to. And the dado really is the lightest large surface at ground level on
 * this type; the grounding dark comes from the 0.16 m course beneath it instead.
 */
function dadoCourse(ctx, F, gap) {
  const p = ctx.p;
  const out = [];
  const cz = (F.frontZ + F.rearZ) / 2;
  const dado = F.dadoH - F.baseH;

  /* ── THE FRONT COURSE IS SPLIT AROUND THE ENTRY BANK ────────────────────────────────────
   *
   * The first draft wrapped all three courses round the shed as single solid boxes, and
   * `hb-clash.mjs` found the consequence: `entry-screen-0-rail-b inside dado-panel`. A 1.2 m
   * concrete dado standing 0.10 m proud of the wall, run straight across a glazed entry bank
   * whose sill is at 0.34, buries the bottom 0.86 m of the glazing and the doors' thresholds
   * with it. That is §5.4.1's buried pond in a different material: the members exist, and no
   * camera can see them. A dado returns at an opening; it does not cross one.
   */
  const run = (w, d, x, z, y, h, name, mat) => {
    if (w > 0.02 && d > 0.02) out.push(part(slab(w, h, d, x, y, z, name), mat));
  };
  const face = (x, z, w, d, name) => {
    run(w, d, x, z, 0, F.baseH, `base-course${name}`, p.shadow);
    run(w, d, x, z, F.baseH, dado - 0.07, `dado-panel${name}`, p.trim);
    run(w + 0.06, d + 0.06, x, z, F.dadoH - 0.07, 0.07, `dado-weather${name}`, p.trim);
  };
  // Front, in two pieces flanking the entry bank.
  const zF = F.frontZ + 0.10;
  const leftW = (gap[0] - 0.10) - (F.west - 0.10);
  const rightW = (F.east + 0.10) - (gap[1] + 0.10);
  face((F.west - 0.10 + gap[0] - 0.10) / 2, zF, leftW, 0.20, '-fl');
  face((gap[1] + 0.10 + F.east + 0.10) / 2, zF, rightW, 0.20, '-fr');
  // Rear, and the two flanks, which carry no opening below 1.24.
  face(F.sx, F.rearZ - 0.10, F.bodyW + 0.20, 0.20, '-b');
  face(F.west - 0.10, cz, 0.20, F.bodyD - 0.20, '-l');
  face(F.east + 0.10, cz, 0.20, F.bodyD - 0.20, '-r');
  // The two returns into the entry bank, so the course stops as a member rather than as an edge.
  for (const gx of gap) {
    face(gx + (gx < F.sx ? -0.10 : 0.10), F.frontZ - 0.02, 0.20, 0.24, '-ret');
  }
  return out;
}

/**
 * A roller shutter in a flank wall: a real recessed opening, a modelled coiled-shutter hood
 * above it, guides down each jamb, and a curtain of fine horizontal slats.
 *
 * `raise` is the fraction of the opening the curtain has left. One shutter down and one part
 * raised is the reference's own instruction and it is the detail that makes the opening read
 * as an opening rather than as a panel: with the curtain up you see the reveal depth behind it.
 */
function rollerShutter(ctx, {
  x, z, w, h, y0 = 0, facing = -1, raise = 0, interactive = false, id = 'shutter',
}) {
  const p = ctx.p;
  const frame = [];
  const leaf = [];
  const plane = x;
  const n = facing;
  const R = 0.24;

  // The reveal returns are PAINTED, not `shadow` — §5.3's arithmetic, restated by
  // `punchedWindow`'s own r8 comment: a jamb authored dark inside a reveal is not dark, it is
  // absent. `trim` at a level-1 lining floor is what reads as a lined opening.
  frame.push(part(recessFaces(
    box(R, h, 0.12, plane + n * R / 2, y0 + h / 2, z - w / 2 - 0.06, `${id}-ret-a`), 1, ['px', 'nx'],
  ), p.trim, 1));
  frame.push(part(recessFaces(
    box(R, h, 0.12, plane + n * R / 2, y0 + h / 2, z + w / 2 + 0.06, `${id}-ret-b`), 1, ['px', 'nx'],
  ), p.trim, 1));
  frame.push(part(recessFaces(
    box(R, 0.12, w + 0.24, plane + n * R / 2, y0 + h + 0.06, z, `${id}-ret-head`), 1, ['ny'],
  ), p.trim, 1));
  // The dark behind the curtain. This one IS meant to be the dark, and it carries the interior
  // floor so it is a room rather than a hole (§5.3).
  frame.push(part(box(0.10, h, w, plane - n * 0.06, y0 + h / 2, z, `${id}-void`), p.shadow, RECESS.interior));
  // Guides and the coil hood — the members that say "roller" rather than "flap".
  for (const s of [-1, 1]) {
    frame.push(part(box(0.14, y0 + h + 0.10, 0.11, plane + n * 0.09, (y0 + h + 0.10) / 2,
      z + s * (w / 2 + 0.055), `${id}-guide`), p.joinery));
  }
  frame.push(part(box(0.46, 0.44, w + 0.34, plane + n * 0.22, y0 + h + 0.30, z, `${id}-hood`), p.joinery));
  frame.push(part(box(0.52, 0.09, w + 0.40, plane + n * 0.24, y0 + h + 0.55, z, `${id}-hood-cap`), p.trim));

  // The curtain. Slats, not a slab — a shutter with no slat line is a garage door painted on.
  const shown = Math.max(0, 1 - raise);
  const curtainH = h * shown;
  if (curtainH > 0.12) {
    const slats = Math.max(2, Math.round(curtainH / 0.34));
    for (let i = 0; i < slats; i += 1) {
      const sh = curtainH / slats;
      leaf.push(part(box(0.07, sh - 0.03, w - 0.06,
        plane + n * 0.035, y0 + h - curtainH + (i + 0.5) * sh, z, `${id}-slat`), p.joinery, RECESS.sash));
    }
    leaf.push(part(box(0.09, 0.10, w - 0.04,
      plane + n * 0.04, y0 + h - curtainH + 0.05, z, `${id}-slat-rail`), p.trim, RECESS.sash));
  }

  const opening = interactive ? {
    id,
    kind: 'slider',
    label: 'Roller shutter',
    pivot: { x: plane, y: y0 + h / 2, z },
    axis: 'y',
    openAngle: 0,
    slide: { axis: 'y', distance: h * 0.86 },
    parts: leaf,
    pick: { cx: 0, cy: y0 + h / 2 - h * shown / 2, cz: 0, w: 0.3, h: Math.max(0.4, curtainH), d: w },
  } : null;
  return { parts: interactive ? frame : frame.concat(leaf), opening };
}

function shedShell(ctx, F) {
  const p = ctx.p;
  const out = [];
  const openings = [];
  const y0 = 0;
  const y1 = F.eaves;
  const cz = (F.frontZ + F.rearZ) / 2;

  /* THE ENTRY BANK. Two glazed doors between two tall screens, deeply recessed under the
   * canopy. The holes are declared here so `volume()` genuinely REMOVES the wall (§2.2's
   * "punched" — the room behind is visible through the glass), and the sashes are added
   * afterwards into those holes. */
  const doorW = 2.80;
  const screenW = 2.40;
  const screenGap = 0.55;
  const doorHole = hole(F.sx, 0, doorW, 2.85, 'entry');
  const screenL = hole(F.sx - doorW / 2 - screenGap - screenW / 2, 0.34, screenW, 2.75, 'screen');
  const screenR = hole(F.sx + doorW / 2 + screenGap + screenW / 2, 0.34, screenW, 2.75, 'screen');

  /* THE LOADING END, in the west flank. `u` on a `z`-axis wall is world z, so these are
   * positions BACK from the frontage. Both sit behind the yard so the dock reads as a
   * different world from the entry. */
  const dockZa = F.rearZ + 3.10;
  const dockZb = F.rearZ + 7.00;
  const shutterW = 3.00;
  const shutterH = 3.40;
  // 1.10 -> 1.28. The dock openings sat 100 mm BELOW the top of the concrete dado, so the
  // bottom of every shutter and of the staff door was behind a proud course. A dock opening
  // starts at dock level, and dock level is the platform's own top face.
  const dockY = 1.28;
  const persoZ = F.rearZ + 9.90;
  const shutterA = hole(dockZa, dockY, shutterW, shutterH, 'shutter');
  const shutterB = hole(dockZb, dockY, shutterW, shutterH, 'shutter');
  const persoHole = hole(persoZ, dockY, 1.30, 2.35, 'door');

  out.push(...volume(ctx, {
    material: p.wall,
    x: F.sx, zFront: F.frontZ, zBack: F.rearZ, width: F.bodyW, y0, y1,
    front: [doorHole, screenL, screenR],
    back: [],
    left: [shutterA, shutterB, persoHole],
    right: [],
    room: true,
    name: 'shed',
  }));

  out.push(...dadoCourse(ctx, F, [
    screenL.u - screenW / 2 - 0.12, screenR.u + screenW / 2 + 0.12,
  ]));
  out.push(part(slab(F.bodyW + 0.70, 0.038, F.bodyD + 0.70, F.sx, -0.012, cz, 'p1-footing-ao'),
    p.shadow));

  /* THE CLADDING, on all four elevations above the dado. The front elevation's ribs stop
   * clear of the entry bank; the west flank's stop clear of the dock openings. */
  const clad0 = F.dadoH;
  out.push(...claddingRibs(ctx, {
    axis: 'x', face: 1, plane: F.frontZ, centre: F.sx, run: F.bodyW, y0: clad0, y1,
    skip: [[F.sx - doorW / 2 - screenGap - screenW - 0.3, F.sx + doorW / 2 + screenGap + screenW + 0.3]],
  }));
  out.push(...claddingRibs(ctx, {
    axis: 'x', face: -1, plane: F.rearZ, centre: F.sx, run: F.bodyW, y0: clad0, y1,
  }));
  out.push(...claddingRibs(ctx, {
    axis: 'z', face: -1, plane: F.west, centre: cz, run: F.bodyD, y0: clad0, y1,
    skip: [
      [dockZa - shutterW / 2 - 0.4, dockZa + shutterW / 2 + 0.4],
      [dockZb - shutterW / 2 - 0.4, dockZb + shutterW / 2 + 0.4],
    ],
  }));
  out.push(...claddingRibs(ctx, {
    axis: 'z', face: 1, plane: F.east, centre: cz, run: F.bodyD, y0: clad0, y1,
  }));

  /* §2.5 — THE HORIZONTAL LAP. Sheet steel comes in lengths, and where two lengths lap the
   * joint shows as a fine line all the way round the building. One line per elevation at the
   * sheet break, 0.045 m proud, is 48 triangles and it is the detail that stops a 19 m flank
   * reading as one continuous panel — which is the fault the reference brief names for this
   * material by name ("it must not be one dead flat tone"). */
  if (ctx.detail) {
    // `joinery`, NOT `trim`. [SEEN] `plates/r1/hammerbarn--three-quarter.png`: at the lightest
    // family it read as a white stripe painted across the flank. A sheet lap is a shadow line.
    const lapYs = [clad0 + (Math.min(y1, F.baseEaves) - clad0) * 0.56];
    if (F.extraFloors > 0) {
      lapYs.push(F.baseEaves, F.baseEaves + (y1 - F.baseEaves) * 0.52);
    }
    for (const lapY of lapYs) {
      out.push(part(box(F.bodyW + 0.02, 0.05, 0.09, F.sx, lapY, F.frontZ + 0.042, 'clad-lap'), p.joinery));
      out.push(part(box(F.bodyW + 0.02, 0.05, 0.09, F.sx, lapY, F.rearZ - 0.042, 'clad-lap'), p.joinery));
      out.push(part(box(0.09, 0.05, F.bodyD + 0.02, F.west - 0.042, lapY, cz, 'clad-lap'), p.joinery));
      out.push(part(box(0.09, 0.05, F.bodyD + 0.02, F.east + 0.042, lapY, cz, 'clad-lap'), p.joinery));
    }
  }

  /* External corner flashings. A plain flashing at every external corner is the detail that
   * stops four cladding fields meeting at a raw arris, and it is four boxes. */
  for (const [x, z] of [[F.west, F.frontZ], [F.east, F.frontZ], [F.west, F.rearZ], [F.east, F.rearZ]]) {
    out.push(part(box(0.20, y1 - clad0, 0.20, x, (clad0 + y1) / 2, z, 'corner-flash'), p.trim));
  }

  /* §2.5 — streaking down from the gutter outlets and the fixing lines. The subject's largest
   * area is one colour of steel; without this it is one dead flat tone, which is the fault the
   * reference brief names for this material by name. */
  out.push(...streaks(ctx, {
    plane: F.frontZ, facing: 1, axis: 'x', yTop: F.eaves - 0.15, length: 2.4,
    xs: [F.sx - F.bodyW * 0.42, F.sx - F.bodyW * 0.18, F.sx + F.bodyW * 0.22, F.sx + F.bodyW * 0.44],
  }));
  out.push(...streaks(ctx, {
    plane: F.east, facing: 1, axis: 'z', yTop: F.eaves - 0.15, length: 3.0,
    xs: [F.frontZ - F.bodyD * 0.22, F.frontZ - F.bodyD * 0.55, F.frontZ - F.bodyD * 0.82],
  }));

  /* THE ENTRY SASHES, into the holes cut above. */
  const doorX = [F.sx - 0.72, F.sx + 0.72];
  for (let i = 0; i < 2; i += 1) {
    const r = commercialDoor(ctx, {
      x: doorX[i], y: F.apronTop + 1.30, z: F.frontZ, w: 1.24, h: 2.60, facing: 'front',
      interactive: true, id: `entry-${i}`, label: 'Entry doors', glazed: true,
      leafMaterial: p.joinery,
    });
    out.push(...r.parts);
    if (r.opening) openings.push(r.opening);
  }
  for (const [i, sx] of [screenL.u, screenR.u].entries()) {
    out.push(...punchedWindow(ctx, {
      x: sx, y: 0.34 + 2.75 / 2, z: F.frontZ, w: screenW - 0.10, h: 2.65, facing: 'front',
      lights: 2, id: `entry-screen-${i}`, sill: false, head: true, reveal: 0.26,
    }).parts);
  }

  /* THE LOADING END. One shutter down, one part raised, so the depth of the opening reads —
   * and the raised one is the interactive target (§3.5: a roller shutter is exactly the kind
   * of opening a person operates). */
  for (const [i, spec] of [[dockZa, 0.62, true], [dockZb, 0, false]].entries()) {
    const [z, raise, live] = spec;
    const r = rollerShutter(ctx, {
      x: F.west, z, w: shutterW, h: shutterH, y0: dockY, facing: -1,
      raise, interactive: live, id: `dock-shutter-${i}`,
    });
    out.push(...r.parts);
    if (r.opening) openings.push(r.opening);
  }
  const perso = commercialDoor(ctx, {
    x: F.west, y: dockY + 2.35 / 2, z: persoZ, w: 1.10, h: 2.20, facing: 'left',
    interactive: true, id: 'staff-door', label: 'Staff door', glazed: false,
  });
  out.push(...perso.parts);
  if (perso.opening) openings.push(perso.opening);

  // V4 Wave P1: the east flank was an unbroken plane (`right: []`). A service door,
  // two downpipes and a signage-shadow plate break it without cloning the west dock.
  const eastDoor = commercialDoor(ctx, {
    x: F.east, y: F.dadoH + 1.08, z: F.rearZ + F.bodyD * 0.38, w: 1.02, h: 2.12, facing: 'right',
    interactive: false, id: 'p1-service-door', label: 'Service door', glazed: false,
  });
  out.push(...eastDoor.parts);
  for (const [i, z] of [F.frontZ - 0.85, F.rearZ + 0.90].entries()) {
    out.push(part(cyl(0.055, F.eaves - 0.12, F.east + 0.07, (F.eaves - 0.12) / 2, z, 'y',
      'p1-downpipe', 8), p.joinery));
    out.push(part(box(0.16, 0.10, 0.16, F.east + 0.10, 0.08, z, 'p1-downpipe-shoe'), p.joinery));
    void i;
  }
  out.push(part(box(0.04, 0.92, 1.55, F.east + 0.055, F.dadoH + 2.15, cz, 'p1-signage-shadow'),
    p.shadow));

  return { parts: out, openings };
}

/* ────────────────────────────── the roof ───────────────────────────────────────────────── */

function shedRoof(ctx, F) {
  const p = ctx.p;
  const out = [];
  const cz = (F.frontZ + F.rearZ) / 2;

  // §2.4 — a seamed shallow gable, ridge parallel to the street frontage. `seamedGable` builds
  // raised battens with their own shadow, rakes that follow the pitch, a fascia with section
  // and a ridge cap, and it closes both gable ends. Four degrees is the reference's figure.
  out.push(...seamedGable(ctx, {
    w: F.bodyW, d: F.bodyD, x: F.sx, z: cz, springY: F.eaves,
    pitch: F.pitchDeg, overhang: F.overhang, name: 'shed-roof',
    endWalls: true, endMaterial: p.wall,
  }));

  // Translucent roof sheeting: bands of a lighter panel laid with the fall. Every shed of this
  // type has them and they break the roof's single value without costing an opening.
  //
  // PLACED THE WAY `seamedGable` PLACES ITS OWN SEAMS — `deckY + 0.07`, rotated by the pitch,
  // centred at `z ± half/2`. The first draft derived a height from the eave line instead and
  // `hb-clash.mjs` reported all eight bands as `roof-light inside shed-roof-f/b`: they were
  // INSIDE the 0.12 m deck, invisible from every station. Reusing the deck's own arithmetic
  // rather than re-deriving it is the fix and it is also the rule (§5.4.2).
  if (ctx.mid) {
    const rad = (F.pitchDeg * Math.PI) / 180;
    const half = F.bodyD / 2 + F.overhang;
    const deckY = F.eaves + F.ridgeRise / 2;
    const span = F.bodyW + F.overhang * 2;
    for (let i = 0; i < 4; i += 1) {
      const u = F.sx - span * 0.32 + (i / 3) * span * 0.64;
      const w = 0.38 + ctx.v.range(80 + i, 0, 0.22);
      const mat = ctx.v.unit(84 + i) < 0.45 ? p.paving : p.roof;
      out.push(part(rotBox(w, 0.05, half * 0.86, u, deckY + 0.075, cz + half / 2, { x: rad },
        'roof-light'), mat));
      out.push(part(rotBox(w, 0.05, half * 0.86, u, deckY + 0.075, cz - half / 2, { x: -rad },
        'roof-light'), mat));
    }
    for (let i = 0; i < 3; i += 1) {
      const u = F.sx - F.bodyW * 0.28 + (i / 2) * F.bodyW * 0.56 + ctx.v.range(90 + i, -0.35, 0.35);
      const zc2 = cz + half * (i === 1 ? -0.22 : 0.30);
      const pitchSign = zc2 >= cz ? 1 : -1;
      const y = deckY + 0.08 + Math.tan(rad) * Math.abs(zc2 - cz) * 0.15;
      out.push(part(slab(1.72, 0.18, 1.08, u, y, zc2, 'p1-skylight-kerb'), p.joinery));
      out.push(part(slab(1.42, 0.05, 0.82, u, y + 0.18, zc2, 'p1-skylight-pane'), p.paving));
      void pitchSign;
    }
    for (let i = 0; i < 3; i += 1) {
      const u = F.sx + ctx.v.range(100 + i, -F.bodyW * 0.28, F.bodyW * 0.28);
      const zBand = cz + half * (0.18 + i * 0.12) * (i % 2 ? -1 : 1);
      const bandW = F.bodyW * ctx.v.range(108 + i, 0.16, 0.40);
      out.push(part(rotBox(bandW, 0.02, 0.52, u, deckY + 0.09, zBand,
        { x: zBand >= cz ? rad : -rad }, 'p1-patina-band'), p.shadow));
    }
  }

  // §2.4 — the eaves gutter, on both long sides, ending in downpipes with a shoe on the ground.
  out.push(...gutterRun(ctx, {
    x: F.sx, z: F.frontZ + F.overhang, w: F.bodyW + F.overhang * 1.4, y: F.eaves + 0.02,
    facing: 1, dropAt: F.east - 0.35, y0: 0,
  }));
  out.push(...gutterRun(ctx, {
    x: F.sx, z: F.rearZ - F.overhang, w: F.bodyW + F.overhang * 1.4, y: F.eaves + 0.02,
    facing: -1, dropAt: F.west + 0.35, y0: 0,
  }));

  // The eaves gutter is a DEEP BOX GUTTER ON VISIBLE BRACKETS — the reference names the
  // brackets, and a gutter with no bracket is §1.2's floating element at 19 m of run.
  if (ctx.detail) {
    for (const face of [1, -1]) {
      const z = face > 0 ? F.frontZ + F.overhang : F.rearZ - F.overhang;
      for (let i = 0; i < 5; i += 1) {
        const u = F.sx - F.bodyW * 0.40 + (i / 4) * F.bodyW * 0.80;
        out.push(part(recessFaces(
          box(0.09, 0.22, 0.30, u, F.eaves - 0.14, z - face * 0.10, 'gutter-bracket'),
          RECESS.soffit, ['ny'],
        ), p.joinery));
      }
    }
  }

  // THE PORTAL KNEE IS WITHDRAWN, and this is a read finding rather than a budget one.
  //
  // [SEEN] `plates/r1/hammerbarn--board.png` and `--three-quarter.png`: six members drawn from
  // the DARKEST family, standing 0.10 m proud of a lit green flank at three-quarter height, read
  // as four black rectangular patches stuck to the wall. They do not read as a haunched steel
  // member; at board zoom a 0.34 m haunch is 2.2 px and all that survives is its value. The
  // reference brief asks for the knee "where it is visible at the eaves — under the gutter",
  // which on this massing it is not: our eaves line is the gable rake, and the gutters are on
  // the other two elevations, which already carry real brackets.
  //
  // Withdrawn rather than recoloured, because a member whose only legible property at the graded
  // station is a value it should not have is not a member the model needs. 72 triangles back.

  // Roof-mounted fan cowls, on the rear pitch where a shed puts them. Seated on the deck plane
  // at the same `deckY + pitch` arithmetic, for the reason above.
  if (ctx.detail) {
    const rad = (F.pitchDeg * Math.PI) / 180;
    const half = F.bodyD / 2 + F.overhang;
    const deckY = F.eaves + F.ridgeRise / 2;
    const zc = cz - half * 0.46;
    const y = deckY + 0.06 + Math.tan(rad) * (half * 0.04);
    for (let i = 0; i < 4; i += 1) {
      const u = F.sx - F.bodyW * 0.30 + (i / 3) * F.bodyW * 0.60;
      out.push(part(cyl(0.30, 0.44, u, y + 0.22, zc, 'y', 'roof-fan', 8), p.roof));
      out.push(part(slab(0.74, 0.09, 0.74, u, y + 0.40, zc, 'roof-fan-cowl'), p.joinery));
    }
  }

  return out;
}

/* ────────────────────────────── the entry front ─────────────────────────────────────────── */

/**
 * The canopy, the fascia band and the word.
 *
 * This is the half of the subject a player reads at board zoom, and every member in it is one
 * the reference brief names: square piers on visible footing pads, a boxed beam pier to pier,
 * a lined soffit that is LIT rather than a black void, a fascia band standing proud as a real
 * box with a return at each end, and hanging banner panels between piers.
 */
function entryFront(ctx, F) {
  const p = ctx.p;
  const out = [];
  const zFace = F.frontZ;
  const zEdge = zFace + F.canopyProj;

  /* THE PIERS. Square, chunky, no capital and no base moulding — a broad flat shaft with a
   * clean arris, on even centres, each landing on a squat concrete footing pad slightly proud
   * of the apron. The FACES carry the accent; the pad and the cap do not. */
  const bays = Math.max(3, Math.round(F.bodyW / 2.75));
  const step = (F.bodyW - F.pierFace) / bays;
  for (let i = 0; i <= bays; i += 1) {
    const x = F.west + F.pierFace / 2 + i * step;
    out.push(part(slab(F.pierFace + 0.30, F.pierPad, F.pierFace + 0.30, x, F.apronTop,
      zEdge - 0.45, 'pier-pad'), p.trim));
    out.push(part(slab(F.pierFace, F.canopyClear - F.pierPad, F.pierFace, x, F.apronTop + F.pierPad,
      zEdge - 0.45, 'pier-shaft'), p.wallAlt));
    // A thin dark shadow line where the red shaft meets its grey pad, so the pier is standing on
    // something rather than growing out of the concrete.
    out.push(part(slab(F.pierFace + 0.05, 0.06, F.pierFace + 0.05, x, F.apronTop + F.pierPad,
      zEdge - 0.45, 'pier-kick'), p.shadow));
  }

  /* THE BOXED BEAM, pier to pier, and the canopy deck on top of it. */
  out.push(part(box(F.bodyW + 0.20, F.beamH, 0.66, F.sx, F.canopyClear + F.beamH / 2, zEdge - 0.45,
    'entry-canopy-beam'), p.trim));
  out.push(part(recessFaces(
    box(F.bodyW + 0.20, 0.18, F.canopyProj + 0.28, F.sx, F.deckY + 0.09, (zFace + zEdge) / 2 + 0.10,
      'entry-canopy-deck'), RECESS.soffit, ['ny'],
  ), p.roof));

  /* THE SOFFIT, LINED AND LIT. §5.3: a surface inside a recess cannot be lit, it must CARRY
   * its value — so the lining boards take `RECESS.soffit` on the faces the forecourt sees, and
   * they are drawn from `trim`, the lightest family, because the reference brief puts the
   * canopy underside as "the lightest large surface in the shaded zone". Six boards with real
   * joints between them; a single plane under a 3.4 m canopy is the black void §5.3 names. */
  if (ctx.mid) {
    const boards = ctx.detail ? 7 : 4;
    for (let i = 0; i < boards; i += 1) {
      const t = (i + 0.5) / boards;
      out.push(part(recessFaces(
        box(F.bodyW - 0.12, 0.055, F.canopyProj / boards - 0.06,
          F.sx, F.deckY - 0.05, zFace + t * F.canopyProj, 'entry-canopy-lining'),
        RECESS.soffit, ['ny', 'pz', 'nz'],
      ), p.trim));
    }
  }
  // The canopy's leading edge: a fascia with section and a gutter under it, both with a shadow
  // line of their own. §1.2 — nothing floats: the deck lands on the beam, the beam on the piers.
  out.push(part(box(F.bodyW + 0.26, 0.34, 0.16, F.sx, F.deckY + 0.03, zEdge + 0.06, 'entry-canopy-edge'), p.trim));
  out.push(part(box(F.bodyW + 0.20, 0.15, 0.17, F.sx, F.deckY - 0.20, zEdge + 0.10, 'entry-canopy-gutter'), p.joinery));
  out.push(part(recessFaces(
    box(F.bodyW + 0.14, 0.10, 0.13, F.sx, F.deckY - 0.07, zFace + 0.08, 'entry-canopy-wallplate'),
    RECESS.soffit, ['ny', 'pz'],
  ), p.trim));

  /* THE FASCIA BAND. A real box standing 0.34 m proud of the wall behind it, with a squared
   * top and bottom edge and a visible RETURN at each end — a band with no return reads as a
   * painted stripe from three-quarter, which is the one station this subject is graded at. */
  const bandH = F.fascia1 - F.fascia0;
  const bandZ = zFace + 0.17;
  out.push(part(box(F.bodyW + 0.24, bandH, 0.34, F.sx, (F.fascia0 + F.fascia1) / 2, bandZ,
    'fascia-band'), p.wallAlt));
  out.push(part(box(F.bodyW + 0.34, 0.13, 0.42, F.sx, F.fascia1 + 0.065, bandZ + 0.02,
    'fascia-cope'), p.trim));
  out.push(part(recessFaces(
    box(F.bodyW + 0.34, 0.11, 0.42, F.sx, F.fascia0 - 0.055, bandZ + 0.02, 'fascia-soffit'),
    RECESS.soffit, ['ny'],
  ), p.trim));

  /* THE WORD. `reliefLetters()` costs ZERO new material buckets — it is paint on a bucket the
   * building already owns — which is the only affordable route at nine (§3.2).
   *
   * MEASURED, NOT ASSUMED. `hb-signage.mjs` prices it at the board station using §5.4.0's
   * facade scales (6.47 px/m along a wall, 4.97 up it — NOT the inherited 7.33): the band's
   * WIDTH binds before its height, capping the letters at 1.378 m, which `assessLabel()`
   * returns as MARGINAL at the 319 m graded station (stroke 1.10 px, cap 6.9 px) and as READS
   * at the 190 m shipped default (1.84 px). The word is not the payload here — the massing and
   * the colour are — which is exactly the condition `assessLabel` attaches to a marginal
   * verdict, so it is built rather than refused.
   */
  const maxWidth = F.bodyW - 0.55;
  const word = F.fasciaWord ?? 'HAMMERBARN';
  const fit = reliefExtent(word, { cap: bandH * 0.78, maxWidth });
  out.push(...reliefLetters({
    text: word,
    x: F.sx, y: (F.fascia0 + F.fascia1) / 2, z: bandZ + 0.17,
    cap: bandH * 0.78, maxWidth, material: p.trim,
    axis: 'z', facing: 1, depth: 0.055, embed: 0.020,
    name: word === 'HAMMERBARN' ? 'fascia-word' : `fascia-word:${word}`,
  }));
  void fit;

  /* HANGING BANNERS between two bays, plain rectangles of colour on two slim rods each. They
   * are BLANK — no text, no device — and they are drawn from `roof`, not from the accent,
   * because §2.10's answer on this subject is to keep the red to four named elements. */
  if (ctx.detail) {
    for (const s of [-1, 1]) {
      const x = F.sx + s * step * 1.5;
      const zb = zFace + F.canopyProj * 0.42;
      out.push(part(recessFaces(box(1.55, 1.05, 0.06, x, F.deckY - 0.85, zb, 'banner-panel'),
        RECESS.interior, ['py']), p.roof));
      for (const t of [-0.62, 0.62]) {
        out.push(part(cyl(0.025, 0.52, x + t, F.deckY - 0.08, zb, 'y', 'banner-rod', 6),
          p.joinery, RECESS.soffit));
      }
    }
  }

  return out;
}

/* ────────────────────────────── the service side ────────────────────────────────────────── */

function serviceSide(ctx, F) {
  const p = ctx.p;
  const out = [];
  const cz = (F.frontZ + F.rearZ) / 2;
  const laneX = F.laneX;
  const laneW = Math.max(1.2, F.laneW - 0.24);

  // The lane is asphalt with its own kerb, not landscaping — the reference is explicit, and it
  // is also what stops the west third of the lot reading as a lawn a truck drives over.
  out.push(part(slab(laneW, 0.06, F.bodyD + 4.6, laneX, 0.01, cz + 1.8, 'lane-seal'), p.paving));
  out.push(part(slab(0.16, 0.20, F.bodyD + 4.6, laneX + laneW / 2 + 0.08, 0.01, cz + 1.8,
    'lane-kerb'), p.trim));

  // THE DOCK. A raised concrete platform with a chamfered edge and a steel bumper strip, hard
  // against the flank under the shutters.
  const dockZ0 = F.rearZ + 1.60;
  const dockZ1 = F.rearZ + 8.50;
  const dockD = dockZ1 - dockZ0;
  const dockW = Math.min(2.10, laneW * 0.66);
  const dockX = F.west - dockW / 2 - 0.02;
  out.push(part(slab(dockW, 1.19, dockD, dockX, 0.02, (dockZ0 + dockZ1) / 2, 'dock-slab'), p.trim));
  out.push(part(slab(dockW + 0.10, 0.09, dockD + 0.10, dockX, 1.21, (dockZ0 + dockZ1) / 2,
    'dock-nosing'), p.trim));
  out.push(part(box(0.14, 0.26, dockD, dockX - dockW / 2 - 0.05, 0.95, (dockZ0 + dockZ1) / 2,
    'dock-bumper'), p.joinery));
  for (let i = 0; i < 3; i += 1) {
    out.push(part(box(0.16, 0.30, 0.16, dockX - dockW / 2 - 0.06, 0.15,
      dockZ0 + (i + 0.5) * (dockD / 3), 'dock-buffer'), p.joinery));
  }

  // A steel stair with an open landing up to the personnel door, so the door is reachable.
  const stairZ = F.rearZ + 9.90;
  out.push(part(slab(1.30, 0.10, 1.35, F.west - 0.72, 1.18, stairZ, 'stair-landing'), p.joinery));
  // A FLIGHT, not four separate slabs. `hb-clash.mjs` found all four treads floating with
  // nothing within 12 mm: they were spaced 0.24 in rise against a 0.07 thickness and 0.27 in
  // going against a 0.26 tread, so each one hung in air. Treads now lap in plan and a pair of
  // stringers carries them from the landing down to the apron, which is what makes it a stair.
  const steps = 4;
  const rise = (1.06 - 0.10) / steps;
  const going = 0.30;
  for (let i = 0; i < steps; i += 1) {
    out.push(part(slab(1.10, 0.06, going + 0.06, F.west - 0.72, 0.10 + i * rise,
      stairZ + 0.80 + (steps - 1 - i) * going, 'stair-tread'), p.joinery));
  }
  for (const sgn of [-1, 1]) {
    out.push(part(rotBox(0.07, 0.22, Math.hypot(steps * going, steps * rise),
      F.west - 0.72 + sgn * 0.56, 0.10 + (steps * rise) / 2, stairZ + 0.80 + (steps * going) / 2 - going / 2,
      { x: Math.atan2(steps * rise, steps * going) }, 'stair-stringer'), p.joinery));
  }
  for (const s of [-1, 1]) {
    out.push(part(box(0.07, 1.02, 0.07, F.west - 0.72 + s * 0.60, 1.79, stairZ - 0.60,
      'stair-post'), p.joinery));
  }
  out.push(part(box(1.34, 0.07, 0.07, F.west - 0.72, 2.26, stairZ - 0.60, 'stair-rail'), p.joinery));

  // A blank plate beside the door. It is a real object with a real edge and one flat face, and
  // nothing is written on it — the type wears writing everywhere and this model wears one word.
  out.push(part(box(0.07, 0.44, 0.30, F.west - 0.05, 2.30, stairZ - 1.05, 'door-plate'), p.trim));

  return out;
}

/* ────────────────────────────── the yard ───────────────────────────────────────────────── */

/**
 * The outdoor nursery and timber yard, at the east end of the frontage.
 *
 * Enclosed toward the car park by a SEE-THROUGH screen and closed on its far side by the shed's
 * own flank. Open to the sky, screen standing well below the eaves, so from the three-quarter
 * board camera you look down into it and the shed rises behind it.
 *
 * THE SCREEN IS FRAMED PANELS ON A LOW KERB, NOT A MODELLED MESH, and that is a budget decision
 * taken with a precedent rather than a shrug: §5.3.3 records L6 spending 2,280 triangles on 136
 * sub-pixel chain-link diagonals that no station resolves. A 0.30 m bar pitch is 1.9 px along a
 * wall at board zoom (§5.4.0's 6.47 px/m); a 40 mm mesh is 0.26 px, i.e. grey. So the screen is
 * built at the pitch the board can see and the mesh is declined by measurement.
 */
function yard(ctx, F) {
  const p = ctx.p;
  const out = [];
  const openings = [];
  const x0 = F.yardX - F.yardW / 2;
  const x1 = F.yardX + F.yardW / 2;
  const z0 = F.yardZ - F.yardD / 2;
  const z1 = F.yardZ + F.yardD / 2;

  // The yard floor: compacted gravel, not lawn and not asphalt, so it separates from both.
  // ON the seal, not under it. A 0.05 m slab at y 0.012 would have sat 10 mm BELOW the apron's
  // own top face — the buried-pond failure of §5.4.1, where a builder reported a surface as
  // legible that no camera above the object can see.
  out.push(part(slab(F.yardW, 0.06, F.yardD, F.yardX, F.apronTop, F.yardZ, 'yard-ground'), p.shadow));

  // The kerb the screen stands on, and the screen itself, on the two open sides.
  const SCREEN_H = 2.05;
  const gateW = Math.min(2.40, F.yardW * 0.55);
  out.push(part(slab(F.yardW + 0.10, 0.22, 0.16, F.yardX, 0.01, z1 + 0.08, 'yard-kerb-f'), p.trim));
  out.push(part(slab(0.16, 0.22, F.yardD + 0.10, x0 - 0.08, 0.01, F.yardZ, 'yard-kerb-l'), p.trim));

  // Front screen, split around the sliding gate.
  const leftRun = (gateW / 2 + x0 - F.yardX) * -1;
  for (const [cx, w] of [
    [F.yardX - gateW / 2 - leftRun / 2, leftRun],
    [F.yardX + gateW / 2 + leftRun / 2, leftRun],
  ]) {
    if (w < 0.3) continue;
    out.push(...battenScreen(ctx, {
      x: cx, y: 0.22, z: z1 + 0.08, w, h: SCREEN_H, pitch: 0.30, facing: 1, material: p.joinery,
    }));
  }
  /* West screen, running back to the shed flank.
   *
   * `battenScreen` builds along X only, so this one is authored at the origin facing +Z and then
   * YAWED into place with `yawParts` — the lane's own primitive for exactly this, and the reason
   * it exists. The first draft rotated the geometry AFTER it had been placed, which rotates it
   * about the world origin rather than about itself: `hb-budget.mjs` measured the result at
   * x 9.470 against a lot half-extent of 7.5, i.e. 1.97 m off the pad and through the neighbour.
   * Caught by the probe on its first run, which is what the probe is for. */
  out.push(...yawParts(battenScreen(ctx, {
    x: 0, y: 0.22, z: 0, w: F.yardD, h: SCREEN_H, pitch: 0.30,
    facing: 1, material: p.joinery,
  }), -Math.PI / 2, x0 - 0.08, F.yardZ));

  // THE GATE. A wide sliding screen gate facing the car park, and it is the yard's operable
  // opening — §3.5 binds where the real object has one, and a yard gate is one.
  const gateLeaf = [];
  const gn = Math.max(4, Math.round(gateW / 0.30));
  for (let i = 0; i < gn; i += 1) {
    const u = F.yardX - gateW / 2 + (i + 0.5) * (gateW / gn);
    gateLeaf.push(part(box(0.06, SCREEN_H - 0.20, 0.07, u, 0.22 + (SCREEN_H - 0.20) / 2, z1 + 0.08,
      'yard-gate-bar'), p.joinery, RECESS.sash));
  }
  for (const yy of [0.30, SCREEN_H + 0.10]) {
    gateLeaf.push(part(box(gateW, 0.10, 0.09, F.yardX, yy, z1 + 0.08, 'yard-gate-rail'),
      p.joinery, RECESS.sash));
  }
  out.push(part(box(0.11, SCREEN_H + 0.34, 0.11, F.yardX - gateW / 2 - 0.06,
    (SCREEN_H + 0.34) / 2, z1 + 0.08, 'yard-gate-post'), p.joinery));
  out.push(part(box(0.11, SCREEN_H + 0.34, 0.11, F.yardX + gateW / 2 + 0.06,
    (SCREEN_H + 0.34) / 2, z1 + 0.08, 'yard-gate-post'), p.joinery));
  // A plain blank sign tray over the gate. Real object, real edge, one flat face, nothing on it.
  // Bedded into the gate posts' own head, not hung 70 mm above it — `hb-clash.mjs` reported it
  // as a floating member, which is §1.2's own example.
  out.push(part(box(gateW * 0.72, 0.42, 0.10, F.yardX, SCREEN_H + 0.30, z1 + 0.10,
    'yard-gate-tray'), p.roof));
  openings.push({
    id: 'yard-gate',
    kind: 'slider',
    label: 'Yard gate',
    pivot: { x: F.yardX, y: 1.2, z: z1 + 0.08 },
    axis: 'y',
    openAngle: 0,
    slide: { axis: 'x', distance: gateW * 0.92 },
    parts: gateLeaf,
    pick: { cx: 0, cy: 1.2 - 1.2, cz: 0, w: gateW, h: SCREEN_H, d: 0.3 },
  });

  /* WHAT IS INSIDE, AND VISIBLE THROUGH THE SCREEN. Open racking of stacked timber lengths and
   * bagged material on pallets against the shed flank; rows of nursery stock in pots on low
   * benches under a run of open shade-cloth. The yard is the one place on this subject where
   * the green is fresh rather than muted — everything else in `garden` is street planting. */
  const rackX = x1 - 0.62;
  for (let i = 0; i < 3; i += 1) {
    const zz = z0 + 0.7 + i * (F.yardD - 1.4) / 2;
    out.push(part(slab(1.05, 0.10, 1.15, rackX, 0.06, zz, 'yard-timber'), p.trim));
    out.push(part(slab(0.95, 0.10, 1.05, rackX, 0.22, zz, 'yard-timber'), p.trim));
    out.push(part(box(0.09, 1.55, 0.09, rackX - 0.5, 0.80, zz, 'yard-rack-post'), p.joinery));
    out.push(part(box(0.09, 1.55, 0.09, rackX + 0.5, 0.80, zz, 'yard-rack-post'), p.joinery));
  }
  // The shade-cloth run: a light steel frame with an open top, over the potted stock.
  const benchX = F.yardX - F.yardW * 0.18;
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      out.push(part(box(0.08, 2.10, 0.08, benchX + s * 0.85, 1.05, F.yardZ + t * (F.yardD * 0.30),
        'yard-shade-post'), p.joinery));
    }
  }
  out.push(part(recessFaces(
    box(2.00, 0.05, F.yardD * 0.68, benchX, 2.12, F.yardZ, 'yard-shade-cloth'),
    RECESS.soffit, ['ny'],
  ), p.roof));
  // Benches, and the stock on them: many small masses, which is what a nursery row reads as.
  for (const t of [-1, 1]) {
    const bz = F.yardZ + t * (F.yardD * 0.20);
    out.push(part(slab(1.90, 0.09, 0.55, benchX, 0.52, bz, 'yard-bench'), p.trim));
    out.push(part(box(0.07, 0.52, 0.45, benchX - 0.85, 0.26, bz, 'yard-bench-leg'), p.joinery));
    out.push(part(box(0.07, 0.52, 0.45, benchX + 0.85, 0.26, bz, 'yard-bench-leg'), p.joinery));
    const pots = ctx.detail ? 7 : 4;
    for (let i = 0; i < pots; i += 1) {
      const px = benchX - 0.80 + (i / (pots - 1)) * 1.60;
      out.push(part(taper(0.11, 0.14, 0.20, px, 0.61, bz, 'yard-pot', 5), p.trim));
      out.push(part(taper(0.17, 0.05, 0.30 + ctx.v.unit(5930 + i) * 0.16, px, 0.79, bz,
        'yard-stock', 5), p.garden));
    }
  }
  // Two larger specimens standing on the gravel, so the yard has a silhouette of its own above
  // the screen line rather than being a flat pen.
  out.push(...shrubMass(ctx, { x: x0 + 0.75, z: z0 + 0.70, r: 0.52, h: 0.90, y: 0.05, name: 'yard-shrub' }));
  out.push(...shrubMass(ctx, { x: x0 + 0.85, z: z1 - 0.85, r: 0.46, h: 0.78, y: 0.05, name: 'yard-shrub' }));

  return { parts: out, openings };
}

/* ────────────────────────────── the car park apron ──────────────────────────────────────── */

/**
 * §2.1, §2.6, §2.7 — the lot, and on this subject the lot IS half the identity.
 *
 * ASPHALT IS NOT PAVED IN UNITS, AND THAT IS THE ONE PLACE THIS SUBJECT DEPARTS FROM §2.7. A
 * sealed apron is monolithic; laying it as 54 individual paver units would put a joint grid
 * across the largest area on the lot and read as a tiled courtyard, which is precisely the
 * "tiled carpet" failure the repo's own commit log records. §2.7 asks for "a path that is made
 * of something" — so the FOOTPATH and the CROSSOVER, which really are unit-paved, are built
 * from individual units with joint lines, and the apron carries its detail the way a real
 * apron does: line marking, wheel stops, kerbed islands and grime.
 */
function carPark(ctx, F) {
  const p = ctx.p;
  const out = [];
  // The apron spans the lot between the service lane's outer kerb and the shed's east flank,
  // and it is derived from those two EDGES rather than from a width plus an offset. The first
  // draft built it as `bodyW + laneW * 0.9` centred by arithmetic and `hb-budget.mjs` measured
  // its kerb at x 8.286 against a 7.5 half-extent — 0.79 m off the pad. An edge-to-edge
  // construction cannot make that mistake, whatever the façade jitter does to `bodyW`.
  const apronXa = -F.halfW + 0.30;
  const apronXb = F.east;
  const apronW = apronXb - apronXa;
  const apronX = (apronXa + apronXb) / 2;

  // The seal, and the kerb that contains it on every side.
  out.push(part(slab(apronW, F.apronTop, F.apronD, apronX, 0.0, F.apronCz, 'apron-seal'), p.paving));
  out.push(part(slab(apronW + 0.16, 0.20, 0.16, apronX, 0.0, F.apronCz + F.apronD / 2 + 0.08,
    'apron-kerb-f'), p.trim));
  out.push(part(slab(0.16, 0.20, F.apronD, apronX - apronW / 2 - 0.08, 0.0, F.apronCz,
    'apron-kerb-l'), p.trim));

  /* THE BAYS RUN PERPENDICULAR TO THE FRONTAGE, and this is a decision the plates settled.
   *
   * [SEEN] `_reference-hammerbarn/hb-hammerbarn-elevation.png` and
   * `hb-hammerbarn-three-quarter.png`: the white lines run AWAY from the building, so a car noses
   * in toward the shed and the bay is 2.5 m across the frontage by about 5 m deep. An earlier
   * draft here turned the whole bank 90 degrees to buy a 4.6 m bay depth out of the forecourt's
   * WIDTH, and both plates say that is the wrong car park — the line direction is the single most
   * visible thing about a marked apron at board zoom.
   *
   * The arithmetic it was dodging is real and is reported rather than hidden: the forecourt is
   * 10.63 m deep, the canopy takes 3.00 of it, and a double-loaded module is 15.6 m. So this is a
   * SINGLE-LOADED row — bays against the street kerb at 4.30 m, a 3.15 m aisle between them and
   * the canopy — and it is one row where the reference has two. That is the parcel, not the
   * layout. Bays are marked by PLAIN WHITE LINES only and every one is EMPTY. */
  const bayDepth = 4.30;
  const bayZ1 = F.apronZ1 - 0.20;
  const bayZ0 = bayZ1 - bayDepth;
  const bankX0 = apronXa + 0.12;
  const bankX1 = F.yardX - F.yardW / 2 - 1.40;
  const bays = Math.max(2, Math.round((bankX1 - bankX0) / 2.50));
  for (let i = 0; i <= bays; i += 1) {
    const x = bankX0 + (i / bays) * (bankX1 - bankX0);
    out.push(part(slab(0.11, 0.02, bayDepth - 0.30, x, F.apronTop, (bayZ0 + bayZ1) / 2, 'bay-line'), p.trim));
  }
  for (let i = 0; i < bays; i += 1) {
    const x = bankX0 + ((i + 0.5) / bays) * (bankX1 - bankX0);
    out.push(part(slab(1.30, 0.14, 0.22, x, F.apronTop, bayZ0 + 0.42, 'wheel-stop'), p.trim));
  }
  // The pedestrian route from the head of the bays to the canopy, hatched across the aisle.
  if (ctx.detail) {
    for (let i = 0; i < 5; i += 1) {
      out.push(part(slab(1.55, 0.02, 0.13, bankX1 + 0.75, F.apronTop,
        bayZ0 - 0.45 - i * 0.34, 'crossing-hatch'), p.trim));
    }
  }

  /* ONE KERBED PLANTING ISLAND, running front-to-back beside the bay bank exactly as the
   * reference's islands do, with a leaf-cluster tree in it. `plantedBed` draws its kerb from
   * `wallAlt`, which on this subject is the ACCENT — so it is called with `kerbed: false` and the
   * kerb stood separately from `trim`. A red kerb round a car-park island is the §2.10 spread
   * this subject exists to avoid. */
  const islandX = (bankX1 + (F.yardX - F.yardW / 2)) / 2;
  const islandZ = (bayZ0 + bayZ1) / 2;
  out.push(...plantedBed(ctx, {
    x: islandX, z: islandZ, w: 1.20, d: bayDepth - 0.60, plants: 3, salt: 5940, kerbed: false,
  }));
  for (const [dx, dz, w, d] of [[0, (bayDepth - 0.60) / 2 + 0.07, 1.38, 0.14],
    [0, -((bayDepth - 0.60) / 2 + 0.07), 1.38, 0.14],
    [0.67, 0, 0.14, bayDepth - 0.46], [-0.67, 0, 0.14, bayDepth - 0.46]]) {
    out.push(part(slab(w, 0.20, d, islandX + dx, F.apronTop, islandZ + dz, 'island-kerb'), p.trim));
  }
  out.push(...canopyTree(ctx, { x: islandX, z: islandZ, h: 3.2, canopy: 0.82, pit: false }));

  /* TALL LIGHT POLES — slim tapered columns on a squat concrete plinth with a visible base
   * plate, carrying a flat rectangular head, standing well clear of the canopy. */
  for (const [lx, lz] of [[bankX0 + 0.55, bayZ0 - 0.75], [islandX, bayZ0 - 0.75],
    [bankX1 - 1.9, bayZ1 - 0.55]]) {
    out.push(part(slab(0.46, 0.22, 0.46, lx, F.apronTop, lz, 'pole-plinth'), p.trim));
    out.push(part(slab(0.34, 0.05, 0.34, lx, F.apronTop + 0.22, lz, 'pole-plate'), p.joinery));
    out.push(part(taper(0.11, 0.07, 5.40, lx, F.apronTop + 0.27, lz, 'pole-column', 6), p.joinery));
    out.push(part(box(0.86, 0.14, 0.50, lx, F.apronTop + 5.74, lz + 0.14, 'pole-head'), p.joinery));
  }

  /* BOLLARDS protecting the front of the entry canopy — plain posts with a domed cap and a base
   * collar. They carry the accent, which is the third and last place it is allowed to go. */
  const bollardZ = F.frontZ + F.canopyProj + 0.52;
  // The run is SOLVED between two edges rather than clamped. Clamping put bollards 5 and 6 on
  // the same point — `hb-clash.mjs` reported `2 x bollard inside bollard`, which is two members
  // occupying one place and is a defect however small it looks.
  const bolA = F.west + 0.9;
  const bolB = F.yardX - F.yardW / 2 - 0.9;
  const bolN = Math.max(3, Math.round((bolB - bolA) / 1.25));
  for (let i = 0; i <= bolN; i += 1) {
    const bx = bolA + (i / bolN) * (bolB - bolA);
    out.push(part(cyl(0.085, 0.86, bx, F.apronTop + 0.43, bollardZ, 'y', 'bollard', 6), p.wallAlt));
    out.push(part(cyl(0.105, 0.10, bx, F.apronTop + 0.89, bollardZ, 'y', 'bollard-cap', 6), p.wallAlt));
    out.push(part(cyl(0.13, 0.09, bx, F.apronTop + 0.045, bollardZ, 'y', 'bollard-collar', 6), p.trim));
  }

  /* A TROLLEY BAY near the entry: a flat roof on four legs with a rail down each side, and
   * nothing written on it. */
  // Clamped inside the pad rather than placed by a fraction of a jittered width — unclamped, an
  // earlier draft put its 2.6 m roof at x -7.750 against a -7.5 half-extent (`hb-budget.mjs`,
  // third run). It stands in the aisle beside the head of the bay bank, where a trolley bay is.
  const tbx = Math.max(-F.halfW + 1.62, bankX0 + 1.45);
  const tbz = bayZ0 - 1.45;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      out.push(part(box(0.09, 2.20, 0.09, tbx + sx * 1.15, F.apronTop + 1.10, tbz + sz * 0.72,
        'trolley-leg'), p.joinery));
    }
  }
  out.push(part(recessFaces(box(2.60, 0.11, 1.70, tbx, F.apronTop + 2.26, tbz, 'trolley-roof'),
    RECESS.soffit, ['ny']), p.roof));
  for (const sz of [-1, 1]) {
    out.push(part(box(2.30, 0.07, 0.07, tbx, F.apronTop + 0.85, tbz + sz * 0.72, 'trolley-rail'), p.joinery));
  }

  /* THE STREET EDGE. A footpath of individual paving units with joint lines and a kerb with a
   * real upstand (`kerbAndFootpath`), ONE wide crossover breaking the kerb, and a landscape
   * strip between the footpath and the parking. */
  out.push(...kerbAndFootpath(ctx, { walkD: F.walkD }));
  const crossX = islandX;   // the crossover lands on the island's own line, not on a bay
  out.push(...paverField(ctx, {
    x: crossX, z: F.walkFront - F.walkD / 2, w: 3.60, d: F.walkD + 0.22, unit: 1.20,
    bed: false, material: ctx.p.trim, name: 'crossover',
  }));
  // The strip, planted. Two leaf-cluster trees and low shrub masses, per the lot brief.
  const stripZ = F.apronZ1 + (F.walkFront - F.walkD - F.apronZ1) / 2;
  const stripD = Math.max(0.4, F.walkFront - F.walkD - F.apronZ1);
  if (stripD > 0.6) {
    // [SEEN] both plates: the street strip carries a CONTINUOUS run of low clustered masses the
    // whole width of the parcel with trees standing in it, not two isolated shrubs.
    const runX0 = -F.halfW + 1.0;
    const runX1 = F.halfW - 1.0;
    const nShrub = ctx.detail ? 5 : 3;
    for (let i = 0; i < nShrub; i += 1) {
      const sx = runX0 + ((i + 0.5) / nShrub) * (runX1 - runX0);
      out.push(...shrubMass(ctx, {
        x: sx, z: stripZ + (ctx.v.unit(5960 + i) - 0.5) * Math.min(0.5, stripD * 0.3),
        r: 0.42 + ctx.v.unit(5970 + i) * 0.16, h: 0.66, y: 0.02, name: 'strip-shrub',
      }));
    }
    out.push(...canopyTree(ctx, { x: runX0 + 1.2, z: stripZ, h: 3.4, canopy: 0.90, pit: false }));
  }

  /* THE PYLON at the street beside the crossover: a plain rectangular slab on a single square
   * post, both faces flat saturated colour and completely BLANK. It is the fourth and final
   * home of the accent. */
  const px = F.sx + F.bodyW * 0.40;
  const pz = F.walkFront - F.walkD - 0.55;
  out.push(part(slab(0.62, 0.18, 0.62, px, 0.01, pz, 'pylon-base'), p.trim));
  out.push(part(box(0.30, 2.30, 0.30, px, 1.34, pz, 'pylon-post'), p.joinery));
  out.push(part(box(1.55, 1.30, 0.20, px, 3.05, pz, 'pylon-slab'), p.wallAlt));
  out.push(part(box(1.70, 0.11, 0.30, px, 3.76, pz, 'pylon-cap'), p.trim));

  return out;
}

/* ────────────────────────────── the subject ────────────────────────────────────────────── */

/**
 * `hammerbarn` — an Australian big-box hardware warehouse.
 *
 * @param {any} ctx the commercial dispatcher's context (see `commercial/CONTRACT.md`)
 */
export function buildHammerbarn(ctx, options = {}) {
  const F = {
    ...siteFrame(ctx),
    fasciaWord: options.fasciaWord ?? 'HAMMERBARN',
  };

  // §2.1 — the board tray first, with the lawn field left ON, so every square metre of lot the
  // apron, lane and yard do not cover reads as planted ground rather than as bare tray.
  ctx.add(boardPlinth(ctx, { lawn: true }));

  const shell = shedShell(ctx, F);
  ctx.add(shell.parts);
  for (const o of shell.openings) ctx.addOpening(o);

  ctx.add(shedRoof(ctx, F));
  ctx.add(entryFront(ctx, F));
  ctx.add(serviceSide(ctx, F));

  const y = yard(ctx, F);
  ctx.add(y.parts);
  for (const o of y.openings) ctx.addOpening(o);

  ctx.add(carPark(ctx, F));

  // The two apertures the shed's flank carries are cut by `openWall` but produced by
  // `rollerShutter`, which is a local helper — so they are registered with the lane's shared
  // census explicitly rather than left invisible to §3.4's opening audit. `countAperture` takes
  // only the census's own keys; the shutters are reported under their own heading in
  // `hb-budget.mjs` so the number stays attributable rather than folded into "windows".
  countAperture('shopfrontBay');
  countAperture('shopfrontBay');
}

/** The lane dispatcher's registration map for this file. */
export const RETAIL_SHED_BUILDERS = Object.freeze({
  hammerbarn: buildHammerbarn,
  // V4.0 Wave 3 / R5 — grain yard reuses the hardware shed kit and paints
  // GRAIN YARD on the fascia (builder options carry the relief word).
  'grain-plot': (ctx) => buildHammerbarn(ctx, {
    fasciaWord: FARM_KIT['grain-plot'].fascia,
  }),
});

/**
 * The envelope row `index.js` needs. Exported so the orchestrator's patch and this file cannot
 * disagree about the numbers, and so an instrument can read the authored envelope without
 * re-typing it — the duplicated-constant defect, avoided by construction.
 */
export const HAMMERBARN_ENVELOPE = Object.freeze({
  footprint: [1, 2], widthF: 0.75, depthF: 0.57, frontSetback: 0.408,
  wallH: 5.90, storeys: 1, units: 1,
});

/** Extra clear-span floor when the pad is redeveloped to L1. Canopy and fascia stay put. */
export const HAMMERBARN_EXTRA_FLOOR = 4.80;

/** The palette scheme row `surfaces.js` needs. Same reason as above. */
export const HAMMERBARN_SCHEME = Object.freeze({
  wallFamily: 'render', altFamily: 'render',
  // Both entries below were RE-SOLVED against the reference plate rather than adjusted by eye.
  // `hb-plate.py` on `_reference-hammerbarn/hb-hammerbarn-elevation.png` measures the reference's
  // fascia at rgb(206,62,41) chroma 165 and its cladding at rgb(123,118,102) chroma 21, b-r -21;
  // our r1 board plate measured rgb(157,104,86) chroma 71 and rgb(107,117,120) chroma 13,
  // b-r +13. So the accent was under half the reference's saturation and the cladding was on the
  // COOL side of neutral where the reference's is warm.
  //
  // The accent goes to a rendered chroma of 56, which is exactly `shop-corner`'s `wall` — the
  // lane's existing loudest bucket and its declared "one loud bucket". This subject does not
  // exceed any precedent in the lane; it puts the same loudness on 7 % of a street elevation
  // instead of on a whole brick field. It is still 3x under the reference's own plate value.
  wall: '#849684', //    100,110, 88  L106 c22  grey-green profiled steel cladding, warmed
  wallAlt: '#a7746d', //  128, 84, 72  L 92 c56  THE ACCENT — fascia, piers, bollards, pylon
  roof: '#545e65', //      58, 65, 70  L 64 c12  seamed roof, cappings, banners, shade cloth
  trim: '#afada6', //     152,150,144  L150 c 8  concrete dado, soffit lining, marking, kerbs
  joinery: '#495054', //   50, 55, 58  L 54 c 8  screen, shutters, gutters, stair, poles
  shadow: '#38434f', //    41, 47, 51  L 46 c10  reveals, soffits, tray, yard ground
  paving: '#8d97a0', //    80, 85, 88  L 84 c 8  asphalt apron and service lane
  garden: '#5d6f59', //    70, 80, 58  L 76 c22  nursery stock, islands, street strip
});
