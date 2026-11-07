// District Deck V3.70 — apartment-low (lane L4). The first rung of the succession ladder.
//
// THE IDENTITY: a four-storey brick-base walk-up. It is the ladder's SMALLEST and the only rung
// with a PITCHED ROOF, and those two facts are the whole silhouette argument:
//
//   - Height 15.3 m against 18.1 / 22.9 / 26.6 for the rungs above it. On a 15 m lot it is the
//     only apartment that is not markedly taller than it is wide.
//   - A standing-seam gable with a real fascia, gutter and gable-end vent sits on top of it.
//     Every other rung has a flat top. Read as a profile at board zoom, this rung is the one
//     with a triangle on it.
//   - THREE wide bays, not four or five, so its window rhythm is coarse — one large opening per
//     bay with a shared sill band, rather than the tight vertical grid of the taller rungs.
//   - One projecting balcony per upper floor, on the centre bay only. The frontage is mostly
//     wall; the taller rungs are mostly balcony.
//
// What it shares with the rest of the ladder is everything in `apartment-kit.js`: the same brick
// base, the same render field, the same cream string courses, the same black steel, the same
// recessed entry, the same lot grammar. Same street, earlier decade.

import { RECESS } from './surfaces.js';
import {
  METRICS, part, box, slab, rotBox, hole, seamedGable, gutterRun, punchedWindow, stringCourse,
  recessFaces,
} from './core.js';
import {
  LADDER, apartmentLot, apartmentShell, apartmentEntry, glazedBay, bayCentres, lotEra,
} from './apartment-kit.js';

const S = 5800;

export function buildApartmentLow(ctx) {
  const { env, p } = ctx;
  const add = (produced) => ctx.add(produced);
  const rung = LADDER['apartment-low'];

  const halfW = env.bodyW / 2;
  const frontZ = env.frontZ;
  const backZ = env.backZ;
  const midZ = (frontZ + backZ) / 2;
  const { storeys, storeyH, baseStoreys, bays, winW } = rung;
  const wallH = storeys * storeyH;
  const { centres, pitch } = bayCentres(halfW, bays, 0.70);
  const entryX = centres[0];

  // Frontage openings: one wide window per bay per storey, except the entry bay's ground floor
  // (the recessed common entry) and the centre bay's upper floors (glazed balcony doors).
  const frontOpenings = [];
  const winH = 1.72;
  const balconyBay = 1;
  for (let s = 0; s < storeys; s += 1) {
    for (let b = 0; b < bays; b += 1) {
      if (s === 0 && b === 0) continue;
      if (b === balconyBay && s > 0) {
        frontOpenings.push(hole(centres[b], s * storeyH + 0.05, pitch * 0.66, storeyH - 0.35));
      } else {
        frontOpenings.push(hole(centres[b], s * storeyH + 1.05, winW, winH));
      }
    }
  }
  frontOpenings.push(hole(entryX, 0.0, 3.05, 4.42));

  apartmentLot(ctx, { entryX, frontZ, backZ, halfW, salt: S, id: 'apartment-low' });
  apartmentShell(ctx, {
    frontZ, backZ, halfW, storeys, storeyH, baseStoreys,
    sideWins: rung.sideWins, winW: 1.42, frontOpenings,
  });

  // Frontage joinery.
  for (let s = 0; s < storeys; s += 1) {
    for (let b = 0; b < bays; b += 1) {
      if (s === 0 && b === 0) continue;
      if (b === balconyBay && s > 0) {
        add(glazedBay(ctx, {
          x: centres[b], z: frontZ, w: pitch * 0.66,
          y0: s * storeyH + 0.05, y1: s * storeyH + storeyH - 0.30, spandrelH: 0.42,
        }));
      } else {
        add(punchedWindow(ctx, {
          x: centres[b], y: s * storeyH + 1.05 + winH / 2, z: frontZ, w: winW, h: winH,
          lights: 2, id: `low-f${b}-${s}`,
          interactive: s === 1 && b === bays - 1, label: 'Apartment window',
        }));
      }
    }
  }
  const entry = apartmentEntry(ctx, {
    x: entryX, z: frontZ, w: 3.05, h: 4.42, id: 'low',
    form: lotEra('apartment-low').entry,
  });
  add(entry.parts);
  for (const o of entry.openings) ctx.addOpening(o);

  // ══ r8: THE ACCESS GALLERY AND THE EXTERNAL STAIR ═══════════════════════════════════════════
  //
  // r7, on identity: "The reference is a red-brick walk-up with continuous access galleries and
  // an external stair — none of that is here, so the identity is not the reference's."
  // r7, on §4: `apartment-low` v `apartment-permit` 0.871 front IoU, `low` v `shoptop-mixed`
  // 0.926, and the diagnosis that "the rungs separate on height and nothing else — one render
  // value, one window language, one entry, one fence, one lot instanced four times."
  //
  // Both are the same missing thing. A walk-up's circulation is OUTSIDE it: a gallery running
  // the full frontage at every upper floor and an open stair at one end. That is a different
  // silhouette (three 1.3 m slabs standing off the face, and a stair mass rising clear of the
  // envelope at the left end), a different window language (doors onto a deck, not punched
  // windows on a flat wall) and a different entry (an open stair foot, not a recessed porch).
  // None of the other three rungs has any of it.
  //
  // The centre-bay balcony this replaces was the rung's only projecting member and it is the one
  // the taller rungs also have, so it was working against the separation rather than for it.
  const GALL = 1.34;
  for (let s = 1; s < storeys; s += 1) {
    add(slabBalconyLocal(ctx, {
      x: 0.35, y: s * storeyH + 0.10, z: frontZ, w: halfW * 2 - 2.2, proj: GALL, barPitch: 0.62,
    }));
  }
  // The stair: a blade wall at the left end carrying three straight flights with a half-landing
  // between them, open to the street. The blade is brick, the flights and landings are `trim`
  // (a concrete stair on a brick wall), the balustrade is `joinery`.
  const stairX = -halfW + 1.05;
  const stairZ = frontZ + GALL * 0.62;
  add([
    part(box(0.28, wallH - 0.20, GALL * 1.5, stairX - 0.92, (wallH - 0.20) / 2, stairZ, 'stair-blade'), p.wallAlt),
    part(box(0.40, 0.16, GALL * 1.62, stairX - 0.92, wallH - 0.12, stairZ, 'stair-blade-cap'), p.trim),
  ]);
  for (let s = 0; s < storeys - 1; s += 1) {
    const y0 = s * storeyH + 0.10;
    const rise = storeyH / 2;
    const run = GALL * 1.30;
    for (const half of [0, 1]) {
      const yb = y0 + half * rise;
      const dir = half ? -1 : 1;
      add([
        part(rotBox(1.24, 0.17, Math.hypot(run, rise), stairX, yb + rise / 2,
          stairZ + dir * run * 0.28, { x: dir * Math.atan2(rise, run) }, 'stair-flight'), p.trim),
        part(box(1.34, 0.18, 0.92, stairX, yb + rise - 0.09,
          stairZ + dir * (run * 0.56 + 0.46), 'stair-landing'), p.trim),
      ]);
    }
    add([
      part(box(0.07, METRICS.railH, GALL * 1.5, stairX + 0.66, y0 + storeyH / 2 + METRICS.railH / 2,
        stairZ, 'stair-rail'), p.joinery),
      part(box(0.13, 0.09, GALL * 1.56, stairX + 0.66, y0 + storeyH / 2 + METRICS.railH,
        stairZ, 'stair-rail-cap'), p.joinery),
    ]);
  }

  /* ── the roofline: standing-seam gable ───────────────────────────────────────────── */
  add(seamedGable(ctx, {
    w: halfW * 2, d: frontZ - backZ, x: 0, z: midZ, springY: wallH, pitch: 25, overhang: 0.42,
  }));
  add(gutterRun(ctx, {
    x: 0, z: frontZ + 0.42, w: halfW * 1.9, y: wallH - 0.02, facing: 1,
    dropAt: halfW - 0.4, y0: 0.6,
  }));
  add(gutterRun(ctx, {
    x: 0, z: backZ - 0.42, w: halfW * 1.9, y: wallH - 0.02, facing: -1,
    dropAt: -halfW + 0.4, y0: 0.6,
  }));
  // Gable-end vents and the eaves soffit, so the roof lands on the wall rather than hovering.
  const rise = Math.tan((25 * Math.PI) / 180) * ((frontZ - backZ) / 2 + 0.42);
  // ── r10: THE VENT WAS INSIDE THE ROOF ──────────────────────────────────────────────────────
  //
  // r9's GROUND-GAP found `gable-vent` x2 floating 1,133 mm. It is worse than a float: the gable
  // END panels stand at x = +-(halfW - 0.06) and the vent was authored at x = +-(halfW - 0.9),
  // 0.55 m wide — so it sat 0.56 m INSIDE the roof void, invisible from every station, floating,
  // and costing 24 triangles to do it. This is the fourth instance this programme has logged of
  // "the feature is missing" turning out to be "the feature is occluded" (§5.3.2).
  //
  // Turned through 90 degrees and seated ON the gable end, which is where a gable vent goes: a
  // louvred plate on the +-X face, inside the triangle at its own height. Same box.
  for (const side of [-1, 1]) {
    add([
      part(box(0.16, 0.42, 0.60, side * (halfW + 0.04), wallH + rise * 0.34, midZ, 'gable-vent'), p.joinery),
      part(box(0.07, 0.50, 0.70, side * (halfW + 0.11), wallH + rise * 0.34, midZ, 'gable-vent-arch'), p.trim),
    ]);
  }
  add([
    part(box(halfW * 2 + 0.84, 0.10, 0.42, 0, wallH - 0.09, frontZ + 0.21, 'soffit-f'), p.shadow, RECESS.soffit),
    part(box(halfW * 2 + 0.84, 0.10, 0.42, 0, wallH - 0.09, backZ - 0.21, 'soffit-b'), p.shadow, RECESS.soffit),
  ]);
  add(stringCourse(ctx, {
    z: midZ, w: halfW * 2, d: frontZ - backZ, y: wallH - 0.34, thick: 0.16, proud: 0.11,
  }));
}

/**
 * Local balcony / access gallery: shallower and lighter than the taller rungs'.
 *
 * `barPitch` is r8's addition and it is a budget lever, not a style one: the balustrade's bars
 * scale with the member's width, and a full-frontage gallery at the old 0.40 m pitch spends
 * 408 triangles a floor on bars alone. 0.62 on a 12 m run reads the same at board zoom.
 */
function slabBalconyLocal(ctx, { x, y, z, w, proj = 1.02, barPitch = 0.40 }) {
  const p = ctx.p;
  const t = 0.18;
  const out = [
    // r12 MAJ-6 — the balcony soffit. §5.3 names "balcony soffits" in its own list and
    // `RECESS.soffit` was authored for them; on this rung and the two above it the underside of
    // every balcony slab was still at zero, one per storey, which the r11 critic measured as a
    // per-storey stack of black wedges 8.9-19.0 px thick and called the most repeated dark
    // member in the lane by instance count. Per face: the slab's top carries the floor finish
    // and stays exactly as it was.
    part(recessFaces(slab(w, t, proj, x, y - t, z + proj / 2, 'balc-slab'),
      RECESS.soffit, ['ny']), p.trim),
    part(slab(w + 0.09, 0.07, 0.12, x, y - t - 0.02, z + proj + 0.02, 'balc-nose'), p.roof),
    // r12 — the balcony deck, under the next balcony's slab. See `apartments.js band-floor`.
    part(recessFaces(slab(w - 0.10, 0.05, proj - 0.14, x, y, z + proj / 2, 'balc-floor'),
      RECESS.interior, ['py']), p.paving),
  ];
  // Brackets — a slab that projects a metre off a wall needs to be carried, and a gallery that
  // runs 12 m needs more than two. One every 2.6 m, which is what a real walk-up gallery has.
  const brackets = Math.max(2, Math.round(w / 2.6) + 1);
  for (let i = 0; i < brackets; i += 1) {
    out.push(part(box(0.11, 0.34, proj * 0.7, x - w / 2 + (i / (brackets - 1)) * w, y - t - 0.17,
      z + proj * 0.35, 'balc-bracket'), p.joinery));
  }
  const railH = METRICS.railH;
  const rz = z + proj - 0.07;
  const posts = 3;
  for (let i = 0; i < posts; i += 1) {
    out.push(part(box(0.07, railH, 0.07, x - w / 2 + (i / (posts - 1)) * w, y + railH / 2, rz, 'balc-post'), p.joinery));
  }
  out.push(part(box(w + 0.08, 0.08, 0.09, x, y + railH, rz, 'balc-rail-top'), p.joinery));
  out.push(part(box(w + 0.08, 0.05, 0.05, x, y + 0.10, rz, 'balc-rail-kick'), p.joinery));
  const bars = Math.max(4, Math.round(w / barPitch));
  for (let i = 0; i < bars; i += 1) {
    out.push(part(box(0.032, railH - 0.14, 0.032, x - w / 2 + (i + 0.5) * (w / bars),
      y + railH / 2 - 0.03, rz, 'balc-bar'), p.joinery));
  }
  for (const side of [-1, 1]) {
    out.push(part(box(0.07, railH, proj - 0.16, x + side * w / 2, y + railH / 2,
      z + (proj - 0.16) / 2, 'balc-return'), p.joinery));
  }
  return out;
}

export const APARTMENT_LOW_BUILDERS = Object.freeze({
  'apartment-low': buildApartmentLow,
});
