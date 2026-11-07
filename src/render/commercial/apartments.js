// District Deck V3.70 — apartment-permit, apartment-midrise, apartment-mid (lane L4).
//
// The three upper rungs of the succession ladder. `apartment-low.js` owns the first rung; the
// shared family is in `apartment-kit.js` and is not duplicated here.
//
// THE SILHOUETTE ARGUMENT, rung by rung. Each is sortable from its neighbours at board zoom on
// height, bay rhythm, balcony grammar and roofline together — never on one of them alone.
//
//   apartment-permit  — 5 storeys, 18.1 m. FOUR bays. Balconies CHECKERBOARD: two projecting
//     slabs per floor, alternating sides floor to floor, so the frontage reads as a diagonal
//     zig-zag. Roofline: a level parapet with a lift overrun and a tilted solar array set back
//     behind it. The rung that looks like a recent permit approval, because it is one.
//
//   apartment-midrise — 7 storeys, 22.9 m. FOUR bays, but the balconies form a CONTINUOUS BAND
//     across the whole frontage on every floor, framed by solid render BLADE WALLS at both ends
//     that run the full height. Roofline: the top storey is SET BACK by 1.6 m on all four sides
//     and carries a roof terrace with planters and a pergola. Read as a profile: a tall slab
//     with vertical edges and a stepped, planted crown.
//
//   apartment-mid     — 8 storeys, 26.6 m. FIVE bays. The centre bay is a RECESSED GLAZED STAIR
//     CORE running the full height, splitting the balcony stack into two halves that return
//     around the corners. Roofline: a projecting crown cornice over the parapet with roof plant
//     behind a louvred screen. The tallest, the most vertical, and the only one with a slot up
//     its middle.

import { RECESS } from './surfaces.js';
import {
  METRICS, part, box, slab, recessFaces,
  hole, openWall, stringCourse, parapetCrown,
  slabBalcony, steelRail, roofPlant, shrubMass, paverField,
} from './core.js';
import {
  LADDER, apartmentLot, apartmentShell, apartmentEntry, glazedBay, gridWindow, bayCentres, lotEra,
} from './apartment-kit.js';

const S = 5840;

/* ────────────────────────────── shared rung scaffolding ───────────────────────────── */

/**
 * Every upper rung lays its frontage out the same way and then differs in what it hangs on it.
 * `frontPlan` returns the openings and the bay geometry so the shell and the joinery agree; a
 * frontage authored twice is a frontage that drifts.
 */
function frontPlan({ halfW, storeys, storeyH, bays, entryBay, coreBay = -1 }) {
  const { centres, pitch } = bayCentres(halfW, bays, 0.62);
  const entryX = centres[entryBay];
  const openings = [];
  const bayW = pitch * 0.74;
  for (let s = 0; s < storeys; s += 1) {
    for (let b = 0; b < bays; b += 1) {
      if (s === 0 && b === entryBay) continue;
      if (b === coreBay) continue;
      openings.push(hole(centres[b], s * storeyH + 0.06, bayW, storeyH - 0.34));
    }
  }
  if (coreBay >= 0) {
    openings.push(hole(centres[coreBay], 0.0, pitch * 0.80, storeys * storeyH - 0.30));
  }
  openings.push(hole(entryX, 0.0, 3.05, 4.45));
  return { centres, pitch, bayW, entryX, openings };
}

function frontJoinery(ctx, {
  centres, bayW, storeys, storeyH, entryBay, frontZ, coreBay = -1,
}) {
  const add = (produced) => ctx.add(produced);
  for (let s = 0; s < storeys; s += 1) {
    for (let b = 0; b < centres.length; b += 1) {
      if (s === 0 && b === entryBay) continue;
      if (b === coreBay) continue;
      add(glazedBay(ctx, {
        x: centres[b], z: frontZ, w: bayW,
        y0: s * storeyH + 0.06, y1: s * storeyH + storeyH - 0.28,
        spandrelH: 0.92,
        // One slider per building is a mischief target (§3.5). First floor, outermost bay —
        // reachable from the board camera and clear of the entry canopy.
        interactive: s === 1 && b === centres.length - 1,
        id: `slider-${b}-${s}`,
        label: 'Balcony door',
      }));
    }
  }
}

/* ────────────────────────────── apartment-permit ──────────────────────────────────── */

export function buildApartmentPermit(ctx) {
  const { env, p } = ctx;
  const add = (produced) => ctx.add(produced);
  const rung = LADDER['apartment-permit'];
  const halfW = env.bodyW / 2;
  const frontZ = env.frontZ;
  const backZ = env.backZ;
  const midZ = (frontZ + backZ) / 2;
  const { storeys, storeyH, baseStoreys, bays } = rung;
  const wallH = storeys * storeyH;
  const plan = frontPlan({ halfW, storeys, storeyH, bays, entryBay: 0 });

  apartmentLot(ctx, { entryX: plan.entryX, frontZ, backZ, halfW, salt: S, id: 'apartment-permit' });
  apartmentShell(ctx, {
    frontZ, backZ, halfW, storeys, storeyH, baseStoreys,
    sideWins: rung.sideWins, winW: rung.winW, frontOpenings: plan.openings,
  });
  frontJoinery(ctx, { ...plan, storeys, storeyH, entryBay: 0, frontZ });
  const entry = apartmentEntry(ctx, {
    x: plan.entryX, z: frontZ, w: 3.05, h: 4.45, id: 'permit',
    form: lotEra('apartment-permit').entry,
  });
  add(entry.parts);
  for (const o of entry.openings) ctx.addOpening(o);

  // CHECKERBOARD balconies: bays 1 and 3 on even floors, bays 0 and 2 on odd ones.
  for (let s = 1; s < storeys; s += 1) {
    const set = s % 2 === 0 ? [1, 3] : [0, 2];
    for (const b of set) {
      if (b >= bays) continue;
      if (b === 0 && s === 0) continue;
      add(slabBalcony(ctx, {
        x: plan.centres[b], y: s * storeyH + 0.10, z: frontZ, w: plan.pitch * 0.90,
        proj: 1.28, planter: b === set[0] && s === 2,
      }));
    }
  }
  // The bays with no balcony this floor get a juliet rail instead, so no bay is a blank hole.
  for (let s = 1; s < storeys; s += 1) {
    const set = s % 2 === 0 ? [0, 2] : [1, 3];
    for (const b of set) {
      if (b >= bays) continue;
      add(steelRail(ctx, {
        x: plan.centres[b], y: s * storeyH + 0.10, z: frontZ + 0.14,
        w: plan.bayW, depth: 0.10, h: 1.02,
      }));
    }
  }

  /* ── roofline: parapet, lift overrun, tilted solar array ─────────────────────────── */
  add(parapetCrown(ctx, { z: midZ, w: halfW * 2, d: frontZ - backZ, y: wallH, parapet: 0.86 }));
  const orW = 2.6;
  add([
    part(slab(orW, 1.85, orW, -halfW + orW / 2 + 0.7, wallH + 0.12, backZ + orW / 2 + 0.7, 'overrun'), p.wall),
    part(slab(orW + 0.24, 0.16, orW + 0.24, -halfW + orW / 2 + 0.7, wallH + 1.97,
      backZ + orW / 2 + 0.7, 'overrun-cap'), p.trim),
  ]);
  const arrayW = halfW * 1.3;
  for (let i = 0; i < 3; i += 1) {
    const az = midZ - 1.6 + i * 1.45;
    add([
      part(box(arrayW, 0.09, 1.10, halfW * 0.25, wallH + 0.72, az, 'solar-panel'), p.joinery),
      part(box(arrayW - 0.2, 0.05, 0.9, halfW * 0.25, wallH + 0.66, az, 'solar-back'), p.roof),
      part(box(0.09, 0.62, 0.09, halfW * 0.25 - arrayW / 2 + 0.2, wallH + 0.42, az, 'solar-leg-l'), p.joinery),
      part(box(0.09, 0.62, 0.09, halfW * 0.25 + arrayW / 2 - 0.2, wallH + 0.42, az, 'solar-leg-r'), p.joinery),
    ]);
  }
  add(roofPlant(ctx, {
    x: halfW - 2.2, z: midZ + (frontZ - backZ) * 0.3, w: 2.6, d: 2.0,
    y: wallH + 0.12, units: 1, screen: false,
  }));
}

/* ────────────────────────────── apartment-midrise ─────────────────────────────────── */

export function buildApartmentMidrise(ctx) {
  const { env, p } = ctx;
  const add = (produced) => ctx.add(produced);
  const rung = LADDER['apartment-midrise'];
  const halfW = env.bodyW / 2;
  const frontZ = env.frontZ;
  const backZ = env.backZ;
  const bodyD = frontZ - backZ;
  const midZ = (frontZ + backZ) / 2;
  const { storeys, storeyH, baseStoreys, bays } = rung;
  const mainStoreys = storeys - 1;
  const mainH = mainStoreys * storeyH;
  const wallH = storeys * storeyH;
  const plan = frontPlan({ halfW, storeys: mainStoreys, storeyH, bays, entryBay: 1 });

  apartmentLot(ctx, { entryX: plan.entryX, frontZ, backZ, halfW, salt: S + 40, id: 'apartment-midrise' });
  apartmentShell(ctx, {
    frontZ, backZ, halfW, storeys: mainStoreys, storeyH, baseStoreys,
    sideWins: rung.sideWins, winW: rung.winW, frontOpenings: plan.openings,
  });
  frontJoinery(ctx, { ...plan, storeys: mainStoreys, storeyH, entryBay: 1, frontZ });
  const entry = apartmentEntry(ctx, {
    x: plan.entryX, z: frontZ, w: 3.05, h: 4.45, id: 'midrise',
    form: lotEra('apartment-midrise').entry,
  });
  add(entry.parts);
  for (const o of entry.openings) ctx.addOpening(o);

  // BLADE WALLS: solid render fins at both ends of the frontage, full height, standing proud of
  // the balcony band. They are what stop the band reading as a stack of shelves.
  const bladeW = 0.62;
  for (const side of [-1, 1]) {
    const bx = side * (halfW - bladeW / 2);
    add([
      part(box(bladeW, mainH, 1.65, bx, mainH / 2, frontZ + 0.75, 'blade'), p.wall),
      part(box(bladeW + 0.16, 0.16, 1.81, bx, mainH + 0.08, frontZ + 0.75, 'blade-cap'), p.trim),
    ]);
  }
  // CONTINUOUS BALCONY BAND on every upper floor, between the blades.
  const bandW = halfW * 2 - bladeW * 2 - 0.10;
  for (let s = 1; s < mainStoreys; s += 1) {
    const y = s * storeyH + 0.10;
    const proj = 1.42;
    add([
      // r12 MAJ-6 — balcony soffit, per face. See `apartment-low.js` for the finding.
      part(recessFaces(slab(bandW, 0.22, proj, 0, y - 0.22, frontZ + proj / 2, 'band-slab'),
        RECESS.soffit, ['ny']), p.trim),
      part(slab(bandW + 0.06, 0.08, 0.13, 0, y - 0.24, frontZ + proj + 0.02, 'band-nose'), p.roof),
      // r12 — THE BALCONY DECK, which is the other half of MAJ-6 and the larger half by area.
      // `l4r12-members.mjs` measures 11.85 m2 of this member below sky visibility 0.12 on this
      // subject alone — it is the floor of a balcony with the next balcony's slab directly over
      // it, so it takes even less sky than the soffit does. `interior` rather than `soffit` on
      // purpose: one step below the slab above it, so the two keep a value step instead of
      // merging into one lit band, which is the fault §2.9 calls muddy.
      part(recessFaces(slab(bandW - 0.12, 0.05, proj - 0.16, 0, y, frontZ + proj / 2,
        'band-floor'), RECESS.interior, ['py']), p.paving),
    ]);
    add(steelRail(ctx, { x: 0, y, z: frontZ + proj - 0.08, w: bandW, depth: 0.12, h: METRICS.railH }));
    // Vertical fins between bays, carried on the band — the midrise's own vertical rhythm.
    for (let b = 1; b < bays; b += 1) {
      const fx = (plan.centres[b - 1] + plan.centres[b]) / 2;
      add([part(box(0.20, storeyH - 0.28, proj * 0.85, fx, y + (storeyH - 0.28) / 2,
        frontZ + proj * 0.42, 'band-fin'), p.wall)]);
    }
  }
  add(stringCourse(ctx, { z: midZ, w: halfW * 2, d: bodyD, y: mainH - 0.14, thick: 0.20, proud: 0.16 }));

  /* ── roofline: set-back top storey with a planted roof terrace ───────────────────── */
  const setback = 1.60;
  const topW = halfW * 2 - setback * 2;
  const topD = bodyD - setback * 2;
  add(parapetCrown(ctx, { z: midZ, w: halfW * 2, d: bodyD, y: mainH, parapet: 0.92, deck: true }));
  const topOpenings = [];
  for (let b = 0; b < bays; b += 1) {
    if (Math.abs(plan.centres[b]) > topW / 2 - 1.0) continue;
    topOpenings.push(hole(plan.centres[b], mainH + 0.10, plan.pitch * 0.62, storeyH - 0.55));
  }
  add(openWall(ctx, {
    material: p.wall, axis: 'x', face: 1, plane: midZ + topD / 2, centre: 0, run: topW,
    y0: mainH, y1: wallH, depth: 0.30, openings: topOpenings, name: 'top-front',
  }));
  add(openWall(ctx, {
    material: p.wall, axis: 'x', face: -1, plane: midZ - topD / 2, centre: 0, run: topW,
    y0: mainH, y1: wallH, depth: 0.30, name: 'top-back',
  }));
  for (const side of [-1, 1]) {
    add(openWall(ctx, {
      material: p.wall, axis: 'z', face: side, plane: side * topW / 2, centre: midZ, run: topD,
      y0: mainH, y1: wallH, depth: 0.30,
      openings: [hole(midZ, mainH + 1.0, 1.35, 1.5)], name: 'top-side',
    }));
    add(gridWindow(ctx, {
      x: side * topW / 2, y: mainH + 1.75, z: midZ, w: 1.35, h: 1.5,
      facing: side > 0 ? 'right' : 'left',
    }));
  }
  add([part(box(topW - 0.7, storeyH - 0.2, topD - 0.7, 0, mainH + storeyH / 2, midZ, 'top-room'), p.shadow)]);
  for (const o of topOpenings) {
    add(glazedBay(ctx, {
      x: o.u, z: midZ + topD / 2, w: o.width, y0: o.y, y1: o.y + o.height, spandrelH: 0.40,
    }));
  }
  add(parapetCrown(ctx, { z: midZ, w: topW, d: topD, y: wallH, parapet: 0.72 }));

  // The terrace on the setback: paving, planters, a pergola and a balustrade at the edge.
  const terraceZ = midZ + topD / 2 + setback / 2 + 0.1;
  add(paverField(ctx, {
    x: 0, z: terraceZ, w: topW + 1.2, d: setback - 0.35, unit: 1.40, bed: false, y: mainH + 0.14,
    name: 'terr-deck-paver',
  }));
  for (const tx of [-topW * 0.34, topW * 0.34]) {
    add([
      part(slab(1.5, 0.52, 0.72, tx, mainH + 0.16, terraceZ, 'terr-planter'), p.wallAlt),
      part(slab(1.62, 0.10, 0.84, tx, mainH + 0.68, terraceZ, 'terr-planter-cap'), p.trim),
    ]);
    add(shrubMass(ctx, { x: tx, z: terraceZ, r: 0.44, h: 0.62, y: mainH + 0.72, name: 'terr-shrub' }));
  }
  // Pergola over the terrace — the thing that makes the crown read as inhabited.
  const perX = 0;
  for (const side of [-1, 1]) {
    add([part(box(0.14, 2.35, 0.14, perX + side * (topW * 0.42), mainH + 1.30,
      terraceZ - 0.2, 'pergola-post'), p.joinery)]);
  }
  add([part(box(topW * 0.90, 0.13, 0.14, perX, mainH + 2.42, terraceZ - 0.2, 'pergola-beam'), p.joinery)]);
  for (let i = 0; i < 6; i += 1) {
    add([part(box(0.08, 0.10, 1.0, perX - topW * 0.40 + (i / 5) * topW * 0.80,
      mainH + 2.50, terraceZ - 0.2, 'pergola-rafter'), p.joinery)]);
  }
  add(steelRail(ctx, {
    x: 0, y: mainH + 0.14, z: midZ + bodyD / 2 - 0.30, w: topW + 1.2, depth: 0.10, h: 1.04,
  }));
  add(roofPlant(ctx, {
    x: 0, z: midZ - topD / 2 - setback * 0.5, w: topW * 0.55, d: setback * 0.8,
    y: mainH + 0.14, units: 2, screen: false,
  }));
}

/* ────────────────────────────── apartment-mid ─────────────────────────────────────── */

export function buildApartmentMid(ctx) {
  const { env, p } = ctx;
  const add = (produced) => ctx.add(produced);
  const rung = LADDER['apartment-mid'];
  const halfW = env.bodyW / 2;
  const frontZ = env.frontZ;
  const backZ = env.backZ;
  const bodyD = frontZ - backZ;
  const midZ = (frontZ + backZ) / 2;
  const { storeys, storeyH, baseStoreys, bays } = rung;
  const wallH = storeys * storeyH;
  const coreBay = 2;
  const plan = frontPlan({
    halfW, storeys, storeyH, bays, entryBay: coreBay, coreBay,
  });

  apartmentLot(ctx, { entryX: plan.entryX, frontZ, backZ, halfW, salt: S + 80, id: 'apartment-mid' });
  apartmentShell(ctx, {
    frontZ, backZ, halfW, storeys, storeyH, baseStoreys,
    sideWins: rung.sideWins, winW: rung.winW, frontOpenings: plan.openings,
  });
  frontJoinery(ctx, { ...plan, storeys, storeyH, entryBay: coreBay, frontZ, coreBay });

  // THE STAIR CORE: a full-height recessed glazed slot on the centre bay, with the common entry
  // at its foot. It is the rung's signature and it is a real void in the massing.
  const coreW = plan.pitch * 0.80;
  const coreX = plan.centres[coreBay];
  add([
    // ── r7 MAJ-8: "the stair core renders as a full-height black canyon" ─────────────────────
    //
    // Named by the r2 critic, listed by the r3 builder under "what is still short" as "named,
    // not fixed", shipped again on r7 at median luma 0.0 over a 14 x 200 px strip. The mechanism
    // is the same one r3 found behind the shopfront and did not carry across: this box is
    // `shadow` (rendered albedo ~50) at the back of a 0.86 m recess behind a pane, so its pixel
    // is albedo x an irradiance the recess has already taken to nearly nothing, and the display
    // chain clips at scene-linear 0.0062 (`v370-l4-r8-transfer.mjs`).
    //
    // A glazed stair core is the one part of an apartment block that is LIT AT NIGHT AND BY DAY
    // — it is a shaft with landings and a rooflight, which is why architects glaze it. `trim` is
    // the lit shaft, the landings in front of it are already `trim`, and the pane over it now
    // carries its own sky (surfaces.js `GLASS_SKY`). Zero triangles: one bucket.
    // r10 — plus the §5.3 floor. r9 confirms the shaft itself came off zero (median 0.0 -> 48.7)
    // and that the fault MOVED rather than closed: "immediately to its left a black slot runs the
    // full height", 46.2 % literal zero on the same strip. The slot is the RECESS's own side —
    // `core-jamb` was 0.34 m deep inside a 0.86 m recess, so 0.52 m of raw wall cut face stood
    // open beside the core with nothing on it but `wall` geometry, which cannot carry a member
    // floor. The jamb now spans the whole recess. Same two boxes, deeper: ZERO triangles.
    part(box(coreW, wallH - 0.30, 0.86, coreX, (wallH - 0.30) / 2, frontZ - 0.50, 'core-void'), p.trim, 1),
    part(box(coreW - 0.24, wallH - 0.60, 0.05, coreX, (wallH - 0.60) / 2 + 0.10, frontZ - 0.22, 'core-glass'), p.glass),
  ]);
  const CORE_JAMB_D = 0.98;
  for (const side of [-1, 1]) {
    add([part(box(0.22, wallH - 0.30, CORE_JAMB_D, coreX + side * (coreW / 2 - 0.11),
      (wallH - 0.30) / 2, frontZ - CORE_JAMB_D / 2 + 0.06, 'core-jamb'), p.joinery, 1)]);
  }
  // The flights behind the glass — a stair core with nothing in it is a lit box.
  for (let s = 1; s < storeys; s += 1) {
    add([
      part(box(coreW - 0.40, 0.14, 0.55, coreX, s * storeyH - 0.10, frontZ - 0.44, 'core-landing'), p.trim, 1),
      part(box(coreW - 0.55, 0.10, 0.10, coreX, s * storeyH + 0.40, frontZ - 0.20, 'core-rail'), p.joinery, RECESS.sash),
    ]);
  }
  for (let s = 0; s < storeys; s += 1) {
    add([part(box(coreW - 0.30, 0.12, 0.12, coreX, s * storeyH + storeyH * 0.5,
      frontZ - 0.20, 'core-transom'), p.joinery, RECESS.sash)]);
  }
  const entry = apartmentEntry(ctx, {
    x: coreX, z: frontZ, w: coreW - 0.10, h: 4.40, id: 'mid',
    form: lotEra('apartment-mid').entry,
  });
  add(entry.parts);
  for (const o of entry.openings) ctx.addOpening(o);

  // FULL BALCONY STACK on both halves of the frontage, returning around the corners.
  for (let s = 1; s < storeys; s += 1) {
    const y = s * storeyH + 0.10;
    const proj = 1.36;
    for (const side of [-1, 1]) {
      const inner = coreX + side * (coreW / 2 + 0.16);
      const outer = side * halfW;
      const w = Math.abs(outer - inner);
      const cx = (inner + outer) / 2;
      if (w < 0.6) continue;
      add([
        // r12 MAJ-6 — balcony soffit, per face.
        part(recessFaces(slab(w, 0.22, proj, cx, y - 0.22, frontZ + proj / 2, 'stack-slab'),
          RECESS.soffit, ['ny']), p.trim),
        part(slab(w + 0.04, 0.08, 0.13, cx, y - 0.24, frontZ + proj + 0.02, 'stack-nose'), p.roof),
        // r12 — the balcony deck. See `band-floor` above.
        part(recessFaces(slab(w - 0.14, 0.05, proj - 0.16, cx, y, frontZ + proj / 2,
          'stack-floor'), RECESS.interior, ['py']), p.paving),
      ]);
      add(steelRail(ctx, {
        x: cx, y, z: frontZ + proj - 0.08, w, depth: proj - 0.18, h: METRICS.railH,
        infill: ctx.detail,
      }));
      // The corner return: the balcony wraps 1.1 m down the flank. It is closed with a solid
      // upstand rather than left as an open shelf — a slab cantilevering off a flank with
      // nothing on its edge is the "floating element with no support" §1.2 counts as a major,
      // and a full steel rail on fourteen returns costs 1,700 triangles for a detail seen edge-on.
      const rz = frontZ - 0.55;
      add([
        // r12 MAJ-6 — the corner return's underside is the same member class.
        part(recessFaces(slab(proj, 0.22, 1.10, outer + side * proj / 2, y - 0.22, rz,
          'stack-return-slab'), RECESS.soffit, ['ny']), p.trim),
        part(slab(0.18, METRICS.railH, 1.10, outer + side * (proj - 0.09), y, rz, 'stack-return-face'), p.wall),
        part(slab(0.28, 0.10, 1.20, outer + side * (proj - 0.09), y + METRICS.railH, rz, 'stack-return-cope'), p.trim),
      ]);
    }
    if (s % 2 === 1 && ctx.detail) {
      add([
        part(slab(0.72, 0.34, 0.42, coreX - coreW, y, frontZ + 0.9, 'stack-pot'), p.wallAlt),
      ]);
      add(shrubMass(ctx, { x: coreX - coreW, z: frontZ + 0.9, r: 0.26, h: 0.42, y: y + 0.34, name: 'balc-shrub' }));
    }
  }

  /* ── roofline: projecting crown cornice, plant behind a louvred screen ───────────── */
  add(stringCourse(ctx, { z: midZ, w: halfW * 2, d: bodyD, y: wallH - 1.30, thick: 0.24, proud: 0.22 }));
  add([
    part(slab(halfW * 2 + 0.90, 0.30, bodyD + 0.90, 0, wallH - 0.34, midZ, 'crown-cornice'), p.trim),
    part(slab(halfW * 2 + 1.02, 0.10, bodyD + 1.02, 0, wallH - 0.44, midZ, 'crown-drip'), p.roof),
    part(box(halfW * 2 + 0.55, 0.22, bodyD + 0.55, 0, wallH - 0.49, midZ, 'crown-soffit'), p.shadow),
  ]);
  add(parapetCrown(ctx, { z: midZ, w: halfW * 2, d: bodyD, y: wallH, parapet: 0.90 }));
  // Communal roof deck at the front, plant behind a screen at the back.
  add(paverField(ctx, {
    // 1.10 -> 1.55. A communal roof deck 25 m up is seen edge-on at board zoom and from
    // directly above in nothing this programme captures; the joint rhythm survives at 1.55
    // and §3.4's lot account is the only place `apartment-mid` was still over.
    x: 0, z: midZ + bodyD * 0.22, w: halfW * 1.5, d: bodyD * 0.42, unit: 1.55,
    bed: false, y: wallH + 0.14, name: 'deck-paver',
  }));
  for (const tx of [-halfW * 0.55, halfW * 0.55]) {
    add([
      part(slab(1.4, 0.50, 0.70, tx, wallH + 0.16, midZ + bodyD * 0.22, 'deck-planter'), p.wallAlt),
      part(slab(1.52, 0.10, 0.82, tx, wallH + 0.66, midZ + bodyD * 0.22, 'deck-planter-cap'), p.trim),
    ]);
    add(shrubMass(ctx, { x: tx, z: midZ + bodyD * 0.22, r: 0.42, h: 0.58, y: wallH + 0.70, name: 'deck-shrub' }));
  }
  add(roofPlant(ctx, {
    x: 0, z: midZ - bodyD * 0.24, w: halfW * 1.3, d: bodyD * 0.34,
    y: wallH + 0.14, units: 3, screen: true,
  }));
  add([
    part(slab(2.5, 1.9, 2.5, halfW - 1.9, wallH + 0.14, backZ + 2.0, 'overrun'), p.wall),
    part(slab(2.72, 0.16, 2.72, halfW - 1.9, wallH + 2.04, backZ + 2.0, 'overrun-cap'), p.trim),
  ]);
}

export const APARTMENT_BUILDERS = Object.freeze({
  'apartment-permit': buildApartmentPermit,
  'apartment-midrise': buildApartmentMidrise,
  'apartment-mid': buildApartmentMid,
});
