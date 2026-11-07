// District Deck V3.70 — `community-recreation`. Lane L3.
//
// THE SILHOUETTE ARGUMENT (spec §4).
//
// One big volume with a curve on it, and a low glazed snout in front of it:
//
//   1. A SINGLE CLEAR-SPAN HALL under a FACETED BARREL ROOF. It is the only curved roof on the
//      board. The hospital's roofs are flat behind parapets and the school's are pitched gables,
//      so at board zoom the three profiles are a slab, a comb and an arc — sortable before a
//      critic reads a single window.
//   2. A CLERESTORY BAND high on both hall flanks, under the eaves and above everything else on
//      the elevation. A hall is lit from above head height because the walls are for playing
//      against; the band is the geometry that says so.
//   3. A HARD COURT with painted markings, two rings and its own mesh fence, occupying the whole
//      eastern half of the forecourt where a hospital would put its ambulance bay.
//
// Salt namespace 700–899.

import {
  slab, box, cyl, part,
  CIVIC_METRICS, hole, volume, arcEndPlate, barrelRoof, plinthCourse, stringCourse, parapetRoof,
  rampSolid, steelRail,
  downpipe, boardPlate, lawn, paverRun, sealedSlab, lineMarks, lineCircle,
  fenceRun, gate, shrubMass, hedgeRun, canopyTree, plantedBed, plantingStrip, tussock,
  bench, bikeRack, bin,
  signPylon, iconRoundel, wallLamp, goalPost,
} from './core.js';
import { civicWindow, ribbonBand, glazedEntry, civicDoor, entryCanopy, noticeCase } from './openings.js';

const M = CIVIC_METRICS;
const Y0 = M.plateRise;
const SALT_BED = 780;

export default function buildCommunity(ctx) {
  const E = ctx.env;
  lotAndBoundary(ctx, E);
  hall(ctx, E);
  foyer(ctx, E);
  hardCourt(ctx, E);
  rearService(ctx, E);
}

/* ─────────────────────────────────────── the lot ──────────────────────────────────── */

function lotAndBoundary(ctx, E) {
  const { p } = ctx;
  const kerbZ = E.lotD / 2 - 0.25;
  const half = E.lotW / 2 - 0.35;

  ctx.add(boardPlate(ctx, { width: E.lotW, depth: E.lotD }));
  ctx.add(lawn(ctx, {
    x: -4.6, z: (E.foyerFrontZ + kerbZ) / 2, w: 5.4, d: kerbZ - E.foyerFrontZ,
    tufts: 11, salt: 700, name: 'front-lawn',
  }));
  ctx.add(lawn(ctx, {
    x: -6.7, z: -6.0, w: 1.4, d: 16.0, tufts: 10, salt: 730, name: 'flank-lawn',
  }));

  // r5: the path starts where the apron ends — 5.04 m² of coplanar joint bed between the two runs
  // on the r4 build, measured by `v370-l3-r5-clash.mjs`. §1.2's z-fight clause.
  ctx.add(paverRun(ctx, {
    x0: E.foyerCentreX - 1.4, x1: E.foyerCentreX + 1.4,
    z0: E.foyerFrontZ + 2.0, z1: kerbZ - 0.25, name: 'entry-path',
  }));
  ctx.add(paverRun(ctx, {
    x0: E.foyerCentreX - 3.0, x1: E.foyerCentreX + 5.0,
    z0: E.foyerFrontZ + 0.1, z1: E.foyerFrontZ + 1.9, name: 'entry-apron',
  }));

  ctx.add(plantedBed(ctx, {
    x: E.foyerCentreX - 3.1, z: E.foyerFrontZ + 2.4, w: 2.6, d: 3.4, salt: 740, shrubs: 3,
  }));
  ctx.add(hedgeRun(ctx, { x: -5.4, z: kerbZ - 1.0, w: 3.6, d: 0.78, h: 0.90, salt: 760 }));
  // r5: the second tree moves off the foyer. [MEASURED] `v370-l3-r5-clash.mjs` had three of its
  // canopy clumps inside `foyer-room` at (−6.4, −1.2) — the foyer runs x −6.10…0.90, z −2.00…3.40
  // and the crown reached straight through its west wall. It moves into the front lawn where it
  // can be seen, and gains a metre for it.
  ctx.add(canopyTree(ctx, { x: -6.0, z: 11.4, h: 5.3, canopy: 1.50, clearance: 7.20 - 6.0 }));
  ctx.add(canopyTree(ctx, { x: -5.0, z: 7.2, h: 4.6, canopy: 1.35, clearance: 7.20 - 5.0 }));
  // r6: the first shrub moves 0.55 m west. [MEASURED] the r10 critic found its `-c` lobe 0.168 m
  // inside `hall-plinth-base` and the r6 probe reproduces it at 0.197 — the plinth projects 0.14 m
  // outboard of the wall and the r5 probe's masses were `-room` boxes, so nothing could see it.
  for (const [sx, sz, r] of [[-6.80, 5.0, 0.54], [-6.90, -7.6, 0.50], [0.4, 13.2, 0.50]]) {
    ctx.add(shrubMass(ctx, { x: sx, z: sz, r, h: 0.88 }));
  }

  // §2.8 — a low masonry wall with capped piers to the street, which is the boundary a suburban
  // community centre actually has, and it is deliberately NOT the school's picket or the
  // hospital's palisade. The court carries its own mesh fence, so the lot has two fence systems.
  // Set back from the kerb line by the pier cap's own overhang. A 0.58 m cap centred ON the kerb
  // line put every pier cap 0.04 m past the plate deck; measured by `v370-l3-r4-overhang.mjs`.
  const wallZ = kerbZ - 0.16;
  ctx.add(fenceRun(ctx, {
    x1: -half, z1: wallZ, x2: E.gateX - 1.6, z2: wallZ, style: 'wall', h: 1.35, name: 'wall-w',
  }));
  ctx.add(fenceRun(ctx, {
    x1: E.gateX + 1.6, z1: wallZ, x2: half, z2: wallZ, style: 'wall', h: 1.35, name: 'wall-e',
  }));
  ctx.add(gate(ctx, { x: E.gateX, z: wallZ, width: 2.6, h: 1.20, name: 'front-gate' }));
  // The flank and rear sheeted fence is deleted and replaced by kerbed planting. `plantingStrip`
  // in `core.js` carries the reasoning and the reference reading. §2.8 is satisfied by the street
  // frontage, which keeps its capped brick wall, its piers and its gate.
  // r5: the flank beds move outboard, 0.92 → 0.40 from the lot edge, and narrow 1.10 → 0.62. The
  // hall is 9.60 m wide on a 15 m lot and its pilasters reach |x| 6.72, so the r4 bed at 6.58 ran
  // 0.30 m into the masonry for the hall's whole length. Same defect as the hospital's flanks and
  // found the same way, by `v370-l3-r5-clash.mjs` rather than by looking at a plate.
  for (const side of [-1, 1]) {
    ctx.add(plantingStrip(ctx, {
      // r6 §3.6: at 0.40 from the lot edge the bed's own inboard KERB measured |x| 7.57 against a
      // 7.50 deck on every façade — `plantingStrip` adds a 0.16 m kerb outboard of the width it is
      // given, which the 0.40 setback did not allow for. 0.56 clears it by 0.03.
      x: side * (E.lotW / 2 - 0.56), z: -1.2, w: 0.62, d: E.lotD - 3.2,
      salt: SALT_BED + (side > 0 ? 40 : 0), density: 0.85,
      name: `flank-bed-${side > 0 ? 'e' : 'w'}`,
    }));
  }
  ctx.add(plantingStrip(ctx, {
    x: 0, z: -E.lotD / 2 + 1.02, w: E.lotW - 3.6, d: 1.10, salt: SALT_BED + 80, name: 'rear-bed',
  }));

  // ── l3sign: THE IDENTITY SIGN AT THE FRONTAGE, AND IT IS MASONRY BECAUSE THE WALL IS. ──
  //
  // What stood here was `signBoard` — the same board-on-two-steel-posts the hospital and the school
  // carried, in each subject's accent. [MEASURED] `l3sign-boardzoom.mjs` on the shipped build,
  // az −45 at 319 m (110 px per lot tile): this board read 61.1 visible px and its two legend bars
  // were 0.37 px thick. Three civic lots, three red-or-ochre rectangles, no icon on any of them:
  // §4 asks the three to be sortable at board zoom and the signage was doing nothing for it.
  //
  // A monolith instead, and specifically a MASONRY one. This is the only subject in the lane whose
  // street boundary is a capped brick wall rather than a steel palisade or a picket, so its entry
  // sign is a pier in the same wall — `wallAlt` base, `trim` shaft and coping, an ochre name panel,
  // and the roundel. It is east of the gate where the wall run starts, standing at the head of the
  // entry paving rather than inside the hedge the old board sat in.
  //
  // Clamped inboard, as the board was: on façade 3 the envelope scale pushes plan dimensions and a
  // sign authored hard against the boundary leaves the deck (`v370-l3-r4-overhang.mjs`).
  ctx.add(signPylon(ctx, {
    x: Math.min(Math.max(E.gateX + 2.6, -1.00), E.lotW / 2 - 1.30),
    z: kerbZ - 0.60, w: 2.10, h: 3.60, depth: 0.42, name: 'lot-sign',
    // `face` and not `z`: a roundel is applied to a face, where the hospital's H is a through-blade
    // glyph carried on one primitive for both sides. The monolith stands at the street boundary and
    // the street is the side that reads.
    icon: ({ x, y, face, room }) => iconRoundel(ctx, {
      x, y, z: face, r: room / 2, proud: 0.055, segments: 12, figures: 3, name: 'lot-sign-roundel',
    }),
  }));
  // ── r6: THE ENTRY RAMP AND ITS HANDRAILS. ──
  //
  // The r10 critic listed this third on the subject and named it as the lane's cheapest: *"no ramp,
  // no handrail. The reference's single clearest CIVIC CUE, and the lane's cheapest… it would move
  // the subject's identity read from HALL to PUBLIC HALL."* It is right, and it is right for a
  // reason beyond the reference: a hall with a ramp is a building the public is invited into, and
  // that is the whole difference between this subject and a shed.
  //
  // A 1:14 ramp off the entry apron, 1.5 m wide, with a landing at the threshold, a kerb rail each
  // side and a steel handrail on both. It rises 0.20 m — the apron-to-threshold difference — over
  // 2.8 m, which is the real gradient and reads as a ramp rather than as a wedge.
  const rampX = E.foyerCentreX + 3.05;
  const rampZ = E.foyerFrontZ + 1.35;
  ctx.add([
    part(rampSolid(1.50, 2.80, 0.20, rampX, Y0 - 0.02, rampZ, -1, 'entry-ramp'), p.ground),
    part(slab(1.74, 0.10, 1.20, rampX, Y0 + 0.16, rampZ - 1.90, 'entry-ramp-landing'), p.ground),
    // The kerb each side, which is what stops a wheel and what gives the ramp its edge at board zoom.
    part(slab(0.12, 0.28, 2.86, rampX - 0.75, Y0 + 0.02, rampZ, 'entry-ramp-kerb'), p.trim),
    part(slab(0.12, 0.28, 2.86, rampX + 0.75, Y0 + 0.02, rampZ, 'entry-ramp-kerb'), p.trim),
  ]);
  for (const side of [-1, 1]) {
    ctx.add(steelRail(ctx, {
      x: rampX + side * 0.75, y: Y0 + 0.16, z: rampZ, w: 2.86, axis: 'z', h: 0.92,
      name: `entry-rail-${side > 0 ? 'e' : 'w'}`,
    }));
  }
  ctx.add(bench(ctx, { x: E.foyerCentreX - 2.6, z: E.foyerFrontZ + 1.2, w: 1.9 }));
  ctx.add(bikeRack(ctx, { x: E.foyerCentreX + 0.2, z: E.foyerFrontZ + 1.9, hoops: 4 }));
  ctx.add(bin(ctx, { x: E.foyerCentreX - 3.6, z: E.foyerFrontZ + 1.0 }));
  void p;
}

/* ──────────────────────────────────────  the hall ─────────────────────────────────── */

function hall(ctx, E) {
  const { p } = ctx;
  const x = E.hallCentreX;
  const w = E.hallW;
  const zF = E.hallFrontZ;
  const zB = E.hallBackZ;
  const d = zF - zB;
  const midZ = (zF + zB) / 2;
  const eave = Y0 + E.hallEave;

  // The clerestory is the hall's only glazing on the flanks and it sits high, which is the whole
  // architectural claim: the wall below head height belongs to the game being played inside.
  const clerY = Y0 + E.clerestoryY;
  const clerH = E.clerestoryH;
  const clerW = d - 2.6;
  const eastDoorZ = midZ + 2.4;

  const flankL = [hole(midZ, clerY, clerW, clerH, 'cler')];
  const flankR = [
    hole(midZ, clerY, clerW, clerH, 'cler'),
    hole(eastDoorZ, Y0, 2.3, 2.42, 'exit'),
    hole(midZ - 3.0, Y0 + 1.20, 1.5, 1.55, 'win'),
  ];
  const back = [hole(x, Y0 + 4.6, w - 3.4, 1.8, 'gable-win')];
  const front = [hole(x + 3.2, Y0, 1.15, 2.30, 'side-door')];

  ctx.add(volume(ctx, {
    material: p.wall, x, zFront: zF, zBack: zB, width: w, y0: Y0, y1: eave,
    front, back, left: flankL, right: flankR, room: true, name: 'hall',
  }));
  ctx.add(plinthCourse(ctx, {
    x, z: midZ, w, d, yBase: Y0 - 0.02, h: 1.18, proud: 0.16, name: 'hall-plinth',
  }));
  ctx.add(stringCourse(ctx, {
    x, z: midZ, w, d, y: clerY - 0.34, thick: 0.22, proud: 0.14, name: 'hall-band',
  }));

  // Pilasters between the bays — a hall's structure, expressed. They also give the long blank
  // flank a rhythm at board zoom, which an eleven-metre wall of one material does not have.
  //
  // THEY STOP UNDER THE CLERESTORY, and the r1 plate is why. Run full height they cut the glazing
  // band into four separate tall windows, and the clerestory's whole architectural claim — that
  // the light comes in ABOVE everything else on the elevation — went with it. Stopped at the
  // string course they do the opposite: the band runs unbroken over a colonnade.
  const piers = 4;
  const pierH = E.clerestoryY - 0.34;
  for (let i = 0; i <= piers; i += 1) {
    const pz = midZ - clerW / 2 + (i / piers) * clerW;
    for (const side of [-1, 1]) {
      ctx.add([
        part(slab(0.34, pierH, 0.62, x + side * (w / 2 + 0.15), Y0, pz, 'hall-pier'), p.wall),
        part(slab(0.46, 0.16, 0.74, x + side * (w / 2 + 0.15), Y0 + pierH, pz,
          'hall-pier-cap'), p.trim),
      ]);
    }
  }

  ctx.add(barrelRoof(ctx, {
    w, d, x, z: midZ, springY: eave, rise: E.barrelRise, facets: 7, overhang: 0.36,
    name: 'hall-barrel',
  }));
  // The barrel's two ends, filled on the roof's own circle so no daylight reaches the underside
  // of the vault (§1.2 — a hole through the envelope is a major, and r2 had one at both ends).
  // The fill spans the roof's full width including the overhang, which is what a gable end under
  // an oversailing roof actually does, and a trim barge caps its outer face.
  for (const end of [1, -1]) {
    const ez = midZ + end * (d / 2);
    ctx.add([part(arcEndPlate(w + 0.72, E.barrelRise, 0.42, x, eave, ez - end * 0.21,
      'hall-tympanum'), p.wall)]);
    ctx.add([part(arcEndPlate(w + 0.86, E.barrelRise * 1.02, 0.16, x, eave - 0.06,
      ez + end * 0.34, 'hall-barge'), p.trim)]);
    ctx.add([part(box(w * 0.30, 0.36, 0.16, x, eave + E.barrelRise * 0.44, ez + end * 0.24,
      'hall-tymp-vent'), p.metal)]);
  }
  // ── l3sign: THE ROUNDEL ON THE GABLE, AND IT IS THE COMMUNITY CENTRE'S BOARD-ZOOM ICON. ──
  //
  // WHY THE BARGE. [MEASURED] `l3sign-boardzoom.mjs` on the shipped build, az −45 at 319 m:
  // `hall-barge` is the second-largest visible surface on the subject at 494 px, and it is the
  // only large one that faces the street rather than the sky. (`hall-tympanum` behind it renders
  // 0.0 px on every pose — the barge caps it, which is what a barge is for.) A 2.24 m arch of blank
  // `trim` over the entrance, seen from every azimuth on the +z half of the orbit, is where a hall
  // puts its name and its badge, and it is what this subject has instead of a tower.
  //
  // SIZED INSIDE THE ARC, NOT AGAINST IT. The barge is an `arcEndPlate` of half-width 5.23 m and
  // rise 2.244 m, so its circle has radius 7.217 m and its own height at |dx| = 0.95 is 2.18 m
  // above the springing. A 0.95 m roundel centred 1.08 m up therefore clears the arc by 0.15 m at
  // its widest point rather than by eye. 1.90 m across is 13.9 px at 7.33 px/m and its ochre core
  // is 9.5 px — the icon that carries this subject at board zoom.
  ctx.add(iconRoundel(ctx, {
    x, y: eave + 1.02, z: midZ + d / 2 + 0.34 + 0.08, r: 0.95, proud: 0.06,
    segments: 12, figures: 3, name: 'hall-badge',
  }));

  // Ridge vents along the apex.
  for (let i = 0; i < 3; i += 1) {
    const vz = midZ - d * 0.28 + i * d * 0.28;
    ctx.add([
      // r6: the vents stood 0.047 m clear of the barrel they are supposed to be flashed into —
      // §1.2's floating clause, found by the r6 support probe on the one object that has to be
      // seen from directly above. Down 0.12 m, so the base beds into the sheet.
      part(cyl(0.30, 0.44, x, eave + E.barrelRise + 0.18, vz, 'y', 'hall-vent', 8), p.metal),
      part(cyl(0.38, 0.12, x, eave + E.barrelRise + 0.46, vz, 'y', 'hall-vent-cowl', 8), p.trim),
    ]);
  }

  ctx.add(ribbonBand(ctx, {
    x: x - w / 2, y: clerY + clerH / 2, z: midZ, w: clerW, h: clerH,
    facing: 'left', bays: 3, lean: true, id: 'hall-cler-l',
  }));
  ctx.add(ribbonBand(ctx, {
    x: x + w / 2, y: clerY + clerH / 2, z: midZ, w: clerW, h: clerH,
    facing: 'right', bays: 4, id: 'hall-cler-r',
  }));
  ctx.add(civicWindow(ctx, {
    x, y: Y0 + 4.6 + 0.9, z: zB, w: w - 3.4, h: 1.8, facing: 'back', lights: 4, lean: true,
    id: 'hall-gable-win',
  }));
  ctx.add(civicWindow(ctx, {
    x: x + w / 2, y: Y0 + 1.20 + 0.78, z: midZ - 3.0, w: 1.5, h: 1.55, facing: 'right',
    lights: 2, id: 'hall-court-win',
  }));

  // The court-side exits: a pair of doors under a small hood, opening onto the hard court.
  ctx.add(civicDoor(ctx, {
    x: x + w / 2, y: Y0, z: eastDoorZ - 0.6, w: 1.10, h: 2.42, facing: 'right', accent: true,
    id: 'hall-exit-a', label: 'Hall exit',
  }));
  ctx.add(civicDoor(ctx, {
    x: x + w / 2, y: Y0, z: eastDoorZ + 0.6, w: 1.10, h: 2.42, facing: 'right', accent: true,
    interactive: false, id: 'hall-exit-b',
  }));
  ctx.add(entryCanopy(ctx, {
    x: x + w / 2, y: Y0 + 2.86, z: eastDoorZ, w: 3.0, proj: 1.15, facing: 'right',
    id: 'hall-exit-hood',
  }));
  ctx.add(civicDoor(ctx, {
    x: x + 3.2, y: Y0, z: zF, w: 1.15, h: 2.30, accent: false, interactive: false,
    id: 'hall-side-door',
  }));
  ctx.add(wallLamp(ctx, { x: x + w / 2 + 0.06, y: Y0 + 3.2, z: eastDoorZ, facing: 1, axis: 'x' }));

  for (const side of [-1, 1]) {
    for (const dz of [midZ - d * 0.40, midZ + d * 0.40]) {
      ctx.add(downpipe(ctx, {
        x: x + side * (w / 2 + 0.42), z: dz, y0: Y0, y1: eave + 0.30, name: 'hall-dp',
      }));
    }
  }
}

/* ────────────────────────────────────── the foyer ─────────────────────────────────── */

function foyer(ctx, E) {
  const { p } = ctx;
  const x = E.foyerCentreX;
  const w = E.foyerW;
  const zF = E.foyerFrontZ;
  const zB = E.foyerBackZ;
  const d = zF - zB;
  const midZ = (zF + zB) / 2;
  const top = Y0 + E.foyerH;

  const entryW = 4.4;
  const entryH = 3.30;
  const front = [
    hole(x, Y0, entryW, entryH, 'entry'),
    hole(x - w / 2 + 0.9, Y0 + 1.15, 1.05, 1.70, 'win'),
  ];
  const flank = [hole(midZ, Y0 + 1.15, 2.4, 1.70, 'win')];

  ctx.add(volume(ctx, {
    material: p.wall, x, zFront: zF, zBack: zB, width: w, y0: Y0, y1: top,
    front, left: flank, right: flank, back: [], room: true, name: 'foyer',
  }));
  ctx.add(plinthCourse(ctx, {
    x, z: midZ, w, d, yBase: Y0 - 0.02, h: 0.92, proud: 0.14, name: 'foyer-plinth',
  }));
  ctx.add(parapetRoof(ctx, {
    x, z: midZ, w, d, y: top, parapet: 0.58, deckMaterial: p.ground, name: 'foyer-para',
  }));

  ctx.add(glazedEntry(ctx, {
    x, y: Y0, z: zF, w: entryW, h: entryH, doorW: 2.1, doorH: 2.36,
    id: 'comm-entry', label: 'Community centre entrance', sidelights: 2,
  }));
  ctx.add(entryCanopy(ctx, {
    x, y: Y0 + entryH + 0.40, z: zF, w: entryW + 1.8, proj: 1.7, id: 'comm-eyebrow',
  }));
  ctx.add(noticeCase(ctx, { x: x - w / 2 + 0.9, y: Y0 + 1.95, z: zF, w: 1.05, h: 1.05 }));
  ctx.add(civicWindow(ctx, {
    x: x - w / 2, y: Y0 + 2.0, z: midZ, w: 2.4, h: 1.70, facing: 'left', lights: 3, lean: true,
    id: 'foyer-win-l',
  }));
  ctx.add(civicWindow(ctx, {
    x: x + w / 2, y: Y0 + 2.0, z: midZ, w: 2.4, h: 1.70, facing: 'right', lights: 3,
    id: 'foyer-win-r',
  }));
  ctx.add(wallLamp(ctx, { x: x - entryW / 2 - 0.9, y: Y0 + 2.6, z: zF + 0.05 }));
  ctx.add(wallLamp(ctx, { x: x + entryW / 2 + 0.9, y: Y0 + 2.6, z: zF + 0.05 }));
  // ── l3sign: THE NAME BLADE, RESIZED AGAINST THE BOARD STATION RATHER THAN THE DETAIL ONE. ──
  //
  // It was a 3.64 × 0.52 m accent slab with one 0.16 m `trim` bar on it. [MEASURED]
  // `l3sign-boardzoom.mjs`, shipped build, az −45 at 319 m: 42.3 visible px, and 0.52 m is 3.8 px
  // of height — a coloured dash. Its legend bar was 1.17 px.
  //
  // It stands ON the parapet coping now (`foyer-para-coping` tops at `top + 0.58 + 0.13`) instead
  // of leaning against it, at 1.15 m of height — 8.4 px — with a `trim` cap giving the accent an
  // edge against the sky, which is the same rule the ambulance canopy's fascia follows. It carries
  // TWO legend bars and NO icon, deliberately: the roundel is on the gable and at the gate, and a
  // third one at 6 px would be a mark nobody can resolve pretending to be an icon.
  const bladeW = w * 0.52;
  const bladeY = top + 0.58 + 0.13;
  ctx.add([
    part(slab(bladeW, 1.15, 0.20, x + w * 0.16, bladeY, zF - 0.10, 'foyer-blade'), p.accent),
    part(slab(bladeW + 0.16, 0.12, 0.28, x + w * 0.16, bladeY + 1.15, zF - 0.10, 'foyer-blade-cap'),
      p.trim),
    part(box(bladeW * 0.74, 0.24, 0.06, x + w * 0.16, bladeY + 0.72, zF - 0.01,
      'foyer-blade-legend'), p.trim),
    part(box(bladeW * 0.50, 0.15, 0.06, x + w * 0.16 - bladeW * 0.11, bladeY + 0.38, zF - 0.01,
      'foyer-blade-legend'), p.trim),
  ]);
  for (const dx of [x - w / 2 + 0.28, x + w / 2 - 0.28]) {
    ctx.add(downpipe(ctx, { x: dx, z: zF + 0.20, y0: Y0, y1: top + 0.52, name: 'foyer-dp' }));
  }
}

/* ──────────────────────────────────── the hard court ──────────────────────────────── */

function hardCourt(ctx, E) {
  const { p } = ctx;
  const cx = E.courtCentreX;
  const z0 = E.courtBackZ;
  const z1 = E.courtFrontZ;
  const cz = (z0 + z1) / 2;
  const w = E.courtW;
  const d = z1 - z0;

  // ── r5: THE COURT LEAVES THE `roof` BUCKET. Open since r1 on this subject. ──
  //
  // r1's critic read this surface as a STORM-WATER GRATE and it was its single largest score
  // driver here; r4 fixed the school's court the same way and left this one, saying so. The
  // `corrugated` family's albedo carries a directional rib, and a 5.4 × 11 m horizontal plane of
  // it at board zoom is a grating, not a playing surface. A painted acrylic court is the `ground`
  // family with the value break carried by the kerb and the marking — plus wear patches, which is
  // what the reference's asphalt has and ours did not.
  ctx.add(sealedSlab(ctx, {
    x: cx, z: cz, w, d, kerb: true, patches: 4, name: 'court',
  }));
  const iw = w - 0.9;
  const id = d - 0.9;
  ctx.add(lineMarks(ctx, {
    segments: [
      [cx, cz + id / 2, iw, 0.11],
      [cx, cz - id / 2, iw, 0.11],
      [cx - iw / 2, cz, 0.11, id],
      [cx + iw / 2, cz, 0.11, id],
      [cx, cz, iw, 0.11],
      [cx, cz + id / 2 - 2.6, 3.0, 0.11],
      [cx - 1.5, cz + id / 2 - 1.3, 0.11, 2.6],
      [cx + 1.5, cz + id / 2 - 1.3, 0.11, 2.6],
      [cx, cz - id / 2 + 2.6, 3.0, 0.11],
      [cx - 1.5, cz - id / 2 + 1.3, 0.11, 2.6],
      [cx + 1.5, cz - id / 2 + 1.3, 0.11, 2.6],
    ],
    y: Y0 + 0.08,
    wear: 0.14,
    name: 'court-line',
  }));
  // r7: `court-surface` tops at `Y0 + 0.08`, not `Y0 + 0.09`. Eleven boundary lines and eight
  // circle bars stood 10 mm above the asphalt they are painted on.
  ctx.add(lineCircle(ctx, { x: cx, z: cz, r: 1.5, bars: 8, thick: 0.12, y: Y0 + 0.08 }));

  ctx.add(goalPost(ctx, { x: cx, z: z1 - 0.75, facing: -1, name: 'court-goal-n' }));
  ctx.add(goalPost(ctx, { x: cx, z: z0 + 0.75, facing: 1, name: 'court-goal-s' }));

  // THE COURT CAGE IS RETIRED. It was three palisade runs plus a gate — 1,020 triangles of pickets,
  // 11.6 % of the whole model — and the r1 critic read it as part of one large blue field with the
  // court surface, standing between the camera and everything behind it. `mp-community-recreation`
  // has no cage: its court is a marked asphalt bay at grade with planting on its open sides and a
  // low kerb. That is a better object and it is 1,020 triangles cheaper, which is most of what pays
  // for the rebuilt trees and the planted lot.
  //
  // What the cage was carrying that the court still needs is EDGE: without something at its
  // boundary the court reads as a painted rectangle. Two kerbed planting runs down the open flanks
  // do that job the way the reference does it.
  // The east bed is clamped against the pad rather than mirrored: `courtCentreX` is 4.30 and the
  // court is 5.40 wide, so a mirrored 0.90 m bed at +0.55 clearance reached |x| 8.16 once façade
  // jitter was applied. The probe caught it on façades 1-3 only, which is the useful shape of that
  // check — a spill that appears on one façade in four is exactly what an eyeballed plate misses.
  // r5: ONE bed, on the west side. The east one was clamped to |x| 6.95 and the lot's own east
  // flank bed sits at 6.58, so the two were the same object drawn twice — 6.34 m² of coplanar
  // mulch, the worst z-fight in the lane, found by `v370-l3-r5-clash.mjs`. The east side of the
  // court is already planted by the flank bed and does not need a second one.
  // Its northern two thirds only: the foyer's east wall runs to z 3.40 and a full-length bed drove
  // 0.27 m of mulch into it.
  ctx.add(plantingStrip(ctx, {
    x: cx - w / 2 - 0.62, z: (z1 + 4.4) / 2, w: 0.90, d: z1 - 4.4,
    salt: 840, density: 0.8, name: 'court-bed-w',
  }));
  ctx.add(bench(ctx, { x: cx - w / 2 - 1.7, z: cz, w: 2.0, axis: 'z' }));
  void p;
}

/* ───────────────────────────────────── rear service ───────────────────────────────── */

function rearService(ctx, E) {
  const { p } = ctx;
  const zB = E.hallBackZ;
  const yardZ0 = -E.lotD / 2 + 0.7;
  if (zB - yardZ0 < 1.2) return;
  const yardZ = (zB + yardZ0) / 2;

  ctx.add(sealedSlab(ctx, {
    x: E.hallCentreX, z: yardZ, w: E.hallW + 1.2, d: zB - yardZ0, kerb: false,
    material: p.ground, name: 'rear-yard',
  }));
  ctx.add(civicDoor(ctx, {
    x: E.hallCentreX - 2.6, y: Y0, z: zB, w: 1.10, h: 2.24, facing: 'back',
    accent: false, vision: false, interactive: false, id: 'comm-service',
  }));
  ctx.add([
    part(slab(2.6, 1.85, 1.5, E.hallCentreX + 2.6, Y0, yardZ, 'bin-store'), p.wallAlt),
    part(slab(2.8, 0.14, 1.7, E.hallCentreX + 2.6, Y0 + 1.85, yardZ, 'bin-store-cap'), p.trim),
  ]);
  ctx.add(bin(ctx, { x: E.hallCentreX - 0.4, z: yardZ }));
  ctx.add(bin(ctx, { x: E.hallCentreX + 0.5, z: yardZ }));
  ctx.add([
    part(slab(1.6, 1.15, 1.0, E.hallCentreX - 3.4, Y0, yardZ - 0.2, 'plant-box'), p.metal),
    part(slab(1.7, 0.10, 1.1, E.hallCentreX - 3.4, Y0 + 1.15, yardZ - 0.2, 'plant-cap'), p.trim),
  ]);
}

export const COMMUNITY_ENVELOPE = Object.freeze({
  footprint: [1, 2],
  storeys: 2,
  hallW: 9.60,
  hallCentreX: -1.60,
  hallFrontZ: -2.00,
  hallBackZ: -13.00,
  hallEave: 7.40,
  barrelRise: 2.20,
  clerestoryY: 5.35,
  clerestoryH: 1.55,
  foyerW: 7.00,
  foyerCentreX: -2.60,
  foyerFrontZ: 3.40,
  foyerBackZ: -2.00,
  foyerH: 4.20,
  courtCentreX: 4.10,
  courtW: 4.90,
  courtBackZ: 0.60,
  courtFrontZ: 11.60,
  gateX: -3.60,
});
