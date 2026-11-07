// District Deck V3.41 — MP9 lane B: `grain-plot` (GRAIN YARD).
//
// Spec: `docs/next-phase/V341-MP9-BUILDINGS-SPEC.md` §6B — broadacre receival site.
//
// ══ WHAT THIS SUBJECT IS ═══════════════════════════════════════════════════════════════════
//
// A country grain receival site: a battery of galvanised silos with conical roofs under a
// shared top walkway, an elevator head house standing above them with an inclined intake
// gallery running down to a truck tipping pit, an open-fronted bunker shed with grain visible
// in the opening, and a weighbridge with its sample hut at the gate.
//
// ══ THE ONE THING THAT MATTERS, STATED FIRST ═══════════════════════════════════════════════
//
// THE SILHOUETTE IS THE PRODUCT. Every other subject on this board is a box, or a box with a
// roof on it. This one is a row of cylinders under cones with a tower at one end and a diagonal
// running off it, and that reads at thumbnail size with every material thrown away. The budget
// is spent in that order: cylinders, cones, tower, diagonal, walkway, bunker mouth, weighbridge.
//
// ══ WHY THE SUBJECT IS 13.8 m TALL AND NOT 17, WHICH r1 MEASURED ══════════════════════════
//
// r1 stood the head house at 17.0 m and the cones at 13.8. The plate came back with the object
// filling 82 % of frame HEIGHT and the lot reduced to a dark sliver around it — every station
// in `industrial-lab.js` fits the FULL bounds, so height buys itself by spending the ground,
// and the ground is §2/4 of the register ("every building stands on a designed plinth … the lot
// is inhabited"). r1's own plate was a tall grey object standing on nothing.
//
// So the whole subject came down about a fifth — cones to 11.1, head house roof to 13.8 — and
// nothing else on the board is within 4 m of it, which is what §6B's "the only vertical of its
// kind on the board" actually asks for. The height was never the identity; the CYLINDERS are.
//
// ══ THE ENVELOPE ═══════════════════════════════════════════════════════════════════════════
//
// `commercial/index.js` gives `grain-plot` the `HAMMERBARN_ENVELOPE` — [1, 2] tiles, widthF
// 0.75, depthF 0.57, wallH 5.90, one storey. `wallH` is the head of the SHED wall on that
// envelope and on this subject there is no shed wall: what stands on the lot is a silo battery
// whose eaves are at 9.7 m. That is correct and nothing here is clamped to `env.wallH`. The
// FOOTPRINT and STOREY COUNT are the sim inputs and neither is touched — this file never reads
// `env.storeys`, `env.bodyW` or `env.bodyD`, and composes against the LOT the way `boardPlinth`
// does, so a re-spanned parcel re-solves rather than overhangs.
//
// ══ THE PALETTE, AND THE ONE THING THIS LANE NEEDS FROM THE ORCHESTRATOR ═══════════════════
//
// `surfaces.js COMMERCIAL_SURFACE_SCHEME` has no `grain-plot` row, so `commercialPalette()`
// silently falls back to `office-lowrise` — buff BRICK on `wall`, charcoal precast on `wallAlt`.
// A lane may not edit `surfaces.js`, so this file is authored to look right on the fallback and
// the proper scheme is REQUESTED in the round report. Bucket assignment, and r1's lesson:
//
//   wall     THE LARGEST AREA, AND IT IS THE ONLY WARM BUCKET THE FALLBACK HAS. Rendered
//            (118,104,92), luma 106, albedo r−b +26. The silo barrels, the hopper bins, the
//            yard field, the grain, the truck load, the sample hut. "Pale wheat", §6B's own
//            word. It is brick-bound, which on a silo barrel gives a coursed relief that reads
//            as a concrete-stave bin — a real Australian silo type — rather than as brickwork.
//   trim     LIGHTEST, luma 150. The cone roofs, the head house shaft, the shed roof, the
//            walkway deck, line marking, the truck cab. §6B's "value break at the roofs" is a
//            step UP from 106 to 150 on every cylinder's eaves ring.
//   paving   luma 96 — the concrete PADS (battery slab, weighbridge apron, bunker floor, fuel
//            bund), the erection bands on the shells, soffits, and every place r1 reached for
//            `shadow` and printed a black line instead of a shaded one.
//   garden   luma 76 — the stubble margins, the boundary trees, the volunteers.
//   roof     luma 68 — the bunker's walls, the gallery casings, the head house cap.
//   joinery  luma 58 — ladders, handrails, posts, wheels, bollards. RATIONED: r1 spent eleven
//            near-black members on every silo and the census read them as drawn black lines.
//   wallAlt  luma 55, the one dark accent, held to the head house crown, the truck body, the
//            sign board, the bin hoppers and the ramp cheeks.
//   shadow   luma 50 — the tray and the room interiors seen through a hole. Nothing else.
//   glass    hut window, head house lights, truck cab.
//
// Nine buckets exactly, which is `COMMERCIAL_BUCKET_CAP`.
//
// ══ THE r1 CENSUS, AND WHAT IT CHANGED ═════════════════════════════════════════════════════
//
// `measure-plate.py` on the r1 plate: p05 0.1, median 111.4, crush 12.838 %, sat 22.3 %,
// r−b −3.1, against a Monopoly Plus reference band of p05 19-33, crush 1.2-1.8 %, sat 27-42 %,
// r−b +23 to +43. The most crushed and the coldest thing measured on either side.
//
// It is not the rig — `international-exchange` comes out of the same rig at 1.09 % crush — and
// it is not fixable in a palette this lane may not edit. It is fixable in WHICH bucket each
// member is drawn from, and that is the whole of the r2 material pass above: the two coolest
// large-area buckets (`paving` field, `garden` lawn) gave up the ground to `wall`; `shadow`
// gave up every soffit, toe, floor, pit surround and tarpaulin to `paving`; `joinery` gave up
// the silo hoops and straps to relief in the shell's own bucket; and the two largest dark
// planes on the lot — the shed roof and the gallery cap — went from `wallAlt` to `trim`.
//
// Salt namespace 3100–3199, and every salt used is listed at `S` below.

import {
  box, slab, rotBox, cyl, taper, ball,
  part, volume, hole, bevelRing, METRICS, paverField, canopyTree, shrubMass,
  lawnTufts,
} from './core.js';
import { gable } from '../residential/core.js';
import { reliefLetters } from '../signage/index.js';
import { FARM_KIT } from '../../core/content.js';

/* ══ `p.steel` — WHY THIS LANE DOES NOT DRAW A HANDRAIL FROM `joinery` ══════════════════════
 *
 * The r3 crush mask (`measure-plate.py` plus a per-pixel overlay) put the surviving 13.2 % of
 * near-black almost entirely on two things: the conveyor gallery casing, and EVERY THIN STEEL
 * MEMBER ON THE LOT — ladders, handrails, purlins, girts, bollards, fence posts, mast poles,
 * truck chassis, the incline truss. Both were drawn from the two buckets `surfaces.js RESPONSE`
 * gives almost no ambient return:
 *
 *     trim    envBase 0.78        brick   0.60        shadow  0.42
 *     render  envBase 0.70        garden  0.40        paving  0.38
 *     metal   envBase 0.13   ← `roof`     joinery 0.11   ← `joinery`
 *
 * A member turned off the key returns `albedo × ambient × envBase`, so at 0.11 it is not dark,
 * it is ABSENT — the same arithmetic `punchedWindow`'s own header works out for a reveal lining,
 * arriving at a different member. And the fix is the same one: keep the value, change the
 * bucket. `wallAlt` binds `altFamily`, which is `render` on this scheme, so it is albedo
 * rendered (48,57,62) — one luma DARKER than `joinery`'s 58 — at SIX TIMES the ambient return.
 * The steel keeps its value in sun and stops going to zero in shade.
 *
 * `p.steel` is that decision named once. It adds no material and no bucket: it is `p.wallAlt`,
 * and the alias exists so a future scheme can separate the two by editing one line here rather
 * than fifty-seven call sites. If the orchestrator lands a `grain-plot` scheme, `altFamily` must
 * stay a `render`-response family or this whole class of member crushes again.
 *
 * `roof` survives on exactly three members, all of them planes that face the sky and take the
 * key directly: the head house hip, the sample hut gable and the truck cab roof.
 */
function pal(ctx) {
  return { ...ctx.p, steel: ctx.p.wallAlt };
}

/** Salt register, 3100–3199. One name per use so no two scatters can collide. */
const S = Object.freeze({
  siloJitter: 3100,
  gravelWear: 3115,
  spill: 3125,
  weeds: 3140,
  trees: 3150,
  heap: 3160,
  tufts: 3170,
  clutter: 3185,
});

/* ─────────────────────────────── the site frame ───────────────────────────────────────────
 *
 * ONE pure function derives every dimension and every consumer reads it. Everything is solved
 * against the LOT with a rim margin, never against the envelope's body box, because this
 * subject's identity is a yard and a yard is the lot.
 *
 * ── WHERE THINGS GO, AND WHY, MEASURED IN PLATE COLUMNS ──────────────────────────────────
 *
 * The `three-quarter` station stands the camera at azimuth 0.20π, so its right vector is
 * (cos az, −sin az) = (0.809, −0.588) and a lot point lands at plate column
 * u = 0.809·x − 0.588·z. On a [1, 2] parcel the tray therefore spans u ∈ [−15.2, +15.2] — and
 * r1 put every object it owned between −9.5 and +7.7, which is why that plate had a bare tray
 * running off both ends of the frame. The far-left band is the lot's FRONT-WEST corner and the
 * far-right band is its REAR-EAST corner, so those two corners are given real objects here:
 * the gate, the site sign and the tipping ramp at one end, the hopper bins, the fuel stand and
 * the rear apron at the other. That is a composition decision taken in the projection the plate
 * is actually made in rather than in plan.
 */
function siteFrame(ctx) {
  const { env } = ctx;
  const halfW = Math.max(4, env.lotW / 2);
  const halfD = Math.max(6, env.lotD / 2);
  const RIM = 0.62;
  const inW = halfW - RIM;               // 6.88 on a [1,2] parcel
  const inD = halfD - RIM;               // 14.88

  // ── the head house ──────────────────────────────────────────────────────────────────────
  const headW = Math.min(3.45, inW * 0.50);
  const headD = Math.min(3.95, inD * 0.27);
  const headX = -inW + headW / 2;
  const rowZ = -inD * 0.34;              // the silo row's centre line
  const headZ = rowZ;

  // ── the silo battery ────────────────────────────────────────────────────────────────────
  // The pitch is SOLVED from the span left over east of the head house rather than asserted,
  // so a parcel of a different width still lands four tangent cylinders inside the rim instead
  // of pushing the last one over the bevel.
  const siloCount = 4;
  const zoneL = headX + headW / 2 + 0.34;
  const zoneR = inW;
  const pitch = (zoneR - zoneL) / siloCount;
  // ── THE GAP BETWEEN BARRELS IS A CRUSH LEVER, NOT A STYLE ONE ─────────────────────────
  //
  // r2 stood the four shells 0.10 m apart, which is what a real bolted battery does — and put
  // four full-height crevices down the front of the brightest object on the lot, each one a
  // slot the sky cannot reach. The r2 census came back at 15.97 % crush, WORSE than r1. 0.42 m
  // of air lets the key into every junction, and it also separates the cylinders in the plate,
  // which is the silhouette argument `civic/school.js` worked out: masses that touch merge
  // into one tooth.
  const siloR = pitch / 2 - 0.21;
  const siloX = [];
  for (let i = 0; i < siloCount; i += 1) siloX.push(zoneL + (i + 0.5) * pitch);

  const baseH = 0.52;                    // the concrete ring the shell stands on
  const siloTop = 9.70;                  // eaves — the walkway datum
  const coneH = 1.42;                    // 47° — a silo cone, not a witch's hat (r1 was 60°)
  const coneTop = siloTop + coneH;       // 11.12

  const headTop = 11.85;
  const crownTop = 13.15;
  const headRoof = 13.82;

  // ── the inclined intake gallery ─────────────────────────────────────────────────────────
  const incHiZ = headZ + headD / 2 - 0.85;
  const incHiY = 11.35;
  const incLoZ = Math.min(inD * 0.50, incHiZ + 11.4);
  const incLoY = 1.42;

  // ── the bunker grain shed, east of centre, pulled back off the frontage so the near third
  //    of the lot is yard rather than building ─────────────────────────────────────────────
  const shedX0 = 1.45;
  const shedX1 = inW;
  const shedZ0 = 0.35;
  const shedZ1 = Math.min(inD * 0.42, 5.95);
  const shedLow = 3.30;                  // rear eaves
  const shedHigh = 4.85;                 // the open mouth's head

  // ── the weighbridge lane, front centre-west ─────────────────────────────────────────────
  const wbW = 3.20;
  const wbX = -1.85;
  const wbZ1 = inD - 1.85;
  const wbZ0 = wbZ1 - 5.90;

  const gateZ = inD - 0.30;

  return {
    halfW, halfD, inW, inD, RIM,
    headW, headD, headX, headZ, headTop, crownTop, headRoof,
    siloCount, siloR, siloX, rowZ, pitch, baseH, siloTop, coneH, coneTop,
    incHiZ, incHiY, incLoZ, incLoY,
    shedX0, shedX1, shedZ0, shedZ1, shedLow, shedHigh,
    wbX, wbW, wbZ0, wbZ1, gateZ,
    word: FARM_KIT['grain-plot']?.fascia ?? 'GRAIN YARD',
  };
}

/* ─────────────────────────────── local primitives ─────────────────────────────────────────
 *
 * `core.js` has no ladder, no corrugated shell, no wedge and no figure, and a lane may not add
 * one to it. These four are the only local helpers and each is used more than twice.
 */

/**
 * A handrail. `core.js`'s `steelRail()` hard-codes `p.joinery` and takes no material, and this
 * lane may not edit `core.js` — so the walkway's rail, which runs the full width of the plate at
 * the brightest part of the subject, is built here in `p.steel` instead.
 */
function rail(ctx, { x, y, z, w, h = 1.02 }) {
  const p = pal(ctx);
  const out = [];
  const posts = Math.max(3, Math.round(w / 2.6));
  for (let i = 0; i < posts; i += 1) {
    out.push(part(box(0.08, h, 0.08, x - w / 2 + (i / (posts - 1)) * w, y + h / 2, z,
      'rail-post'), p.steel));
  }
  out.push(part(box(w + 0.10, 0.09, 0.10, x, y + h, z, 'rail-top'), p.trim));
  out.push(part(box(w + 0.10, 0.06, 0.07, x, y + h * 0.55, z, 'rail-mid'), p.steel));
  out.push(part(box(w + 0.10, 0.10, 0.08, x, y + 0.11, z, 'rail-kick'), p.steel));
  return out;
}

/** A cage ladder: two stiles, rungs at a fixed pitch, and hoops over the top half. */
function ladder(ctx, { x, z, y0, y1, facing = 1, width = 0.44, name = 'ladder' }) {
  const p = pal(ctx);
  const out = [];
  const h = y1 - y0;
  if (h < 0.6) return out;
  for (const s of [-1, 1]) {
    out.push(part(box(0.055, h, 0.055, x + s * width / 2, y0 + h / 2, z, `${name}-stile`), p.steel));
  }
  const step = ctx.detail ? 0.60 : 1.05;
  const n = Math.max(2, Math.round(h / step));
  for (let i = 0; i < n; i += 1) {
    out.push(part(box(width, 0.035, 0.035, x, y0 + (i + 0.5) * (h / n), z, `${name}-rung`), p.steel));
  }
  if (ctx.detail && h > 4) {
    const hoops = Math.max(2, Math.round(h / 2.4));
    for (let i = 0; i < hoops; i += 1) {
      const hy = y0 + h * 0.34 + (i / hoops) * h * 0.64;
      out.push(part(box(width + 0.34, 0.05, 0.05, x, hy, z + facing * 0.34, `${name}-hoop`), p.steel));
      for (const s of [-1, 1]) {
        out.push(part(box(0.05, 0.05, 0.34, x + s * (width / 2 + 0.15), hy, z + facing * 0.18,
          `${name}-hoop-arm`), p.steel));
      }
    }
  }
  return out;
}

/**
 * A corrugated steel shell: the cylinder, stiffener hoops and vertical seam straps.
 *
 * The hoops are what stop a 2.6 m cylinder ten metres tall reading as a grey pipe — they put a
 * horizontal rhythm on it at the pitch a real bolted silo has, and every one of them is a
 * `joinery` line against a `trim` field, which is also the only place on the battery where the
 * value ladder has anything to do.
 */
function siloShell(ctx, { x, z, r, y0, y1, bands = 3, name = 'silo' }) {
  const p = pal(ctx);
  const out = [];
  const segs = ctx.detail ? 20 : 12;
  const h = y1 - y0;
  out.push(part(cyl(r, h, x, (y0 + y1) / 2, z, 'y', `${name}-shell`, segs), p.wall));
  if (!ctx.mid) return out;
  // ── CORRUGATION IS RELIEF, NOT A DRAWN LINE, AND THAT IS THE r1 FIX ────────────────────
  //
  // r1 ringed each barrel with `joinery` hoops and ran `joinery` straps up it. The r1 census
  // read the result exactly right — "flat cylinders with black seam lines drawn on them" — and
  // it also cost: eleven near-black members per silo, on the brightest object on the lot, in a
  // plate already measured at 12.8 % crush. The rhythm is now RELIEF IN THE SHELL'S OWN
  // BUCKET: rings standing 35 mm proud, which catch the key on their top face and shade their
  // own underside, so the barrel has a horizontal beat with no dark member anywhere in it.
  const ribs = ctx.detail ? 11 : 5;
  for (let i = 1; i <= ribs; i += 1) {
    const hy = y0 + (i / (ribs + 1)) * h;
    out.push(part(cyl(r + 0.035, 0.13, x, hy, z, 'y', `${name}-rib`, Math.max(10, segs - 6)),
      p.wall));
  }
  // the erection joints between shell courses, one value step down and no more
  for (let i = 1; i <= bands; i += 1) {
    const hy = y0 + (i / (bands + 1)) * h;
    out.push(part(cyl(r + 0.075, 0.22, x, hy, z, 'y', `${name}-band`, Math.max(10, segs - 6)),
      p.trim));
  }
  return out;
}

/**
 * A raking plate: a thin box sheared about X. `hBack` is the height at the −Z end and `hFront`
 * at the +Z end, so a ramp that climbs away from the street is written the way it is read.
 */
function rakePlate(w, hBack, hFront, d, x, yBase, z, material, thick = 0.24, name = 'rake') {
  const rise = hFront - hBack;
  const rad = Math.atan2(rise, d);
  const len = Math.hypot(d, rise);
  return part(rotBox(w, thick, len, x, yBase + (hBack + hFront) / 2, z, { x: -rad }, name), material);
}

/** A person: six boxes and a head. A lot with nobody on it is a diagram, not a place. */
function figure(ctx, { x, z, yaw = 0, name = 'figure' }) {
  const p = pal(ctx);
  const parts = [
    part(box(0.19, 0.74, 0.21, -0.11, 0.37, 0, `${name}-leg`), p.steel),
    part(box(0.19, 0.74, 0.21, 0.11, 0.37, 0, `${name}-leg`), p.steel),
    part(box(0.48, 0.62, 0.30, 0, 1.05, 0, `${name}-vest`), p.trim),
    part(box(0.16, 0.54, 0.17, -0.32, 1.05, 0.02, `${name}-arm`), p.trim),
    part(box(0.16, 0.54, 0.17, 0.32, 1.05, 0.02, `${name}-arm`), p.trim),
    part(ball(0.135, 0, 1.50, 0, `${name}-head`, 5), p.wall),
    part(box(0.32, 0.10, 0.34, 0, 1.62, 0.01, `${name}-hat`), p.wallAlt),
  ];
  for (const item of parts) {
    item.geometry.rotateY(yaw);
    item.geometry.translate(x, 0, z);
    item.geometry.computeBoundingBox();
  }
  return parts;
}

/** A tipper: chassis, six wheels, cab, body, load. Used loaded and empty. */
function tipper(ctx, { x, z, yBase = 0, loaded = true, name = 'truck' }) {
  const p = pal(ctx);
  const out = [];
  const y = yBase;
  for (const s of [-1, 1]) {
    for (const wz of [z + 2.42, z - 1.32, z - 2.12]) {
      out.push(part(cyl(0.50, 0.32, x + s * 1.04, y + 0.50, wz, 'x', `${name}-wheel`, 10),
        p.steel));
    }
  }
  out.push(part(slab(1.98, 0.32, 6.20, x, y + 0.60, z, `${name}-chassis`), p.steel));
  out.push(part(slab(2.12, 1.58, 1.98, x, y + 0.92, z + 2.22, `${name}-cab`), p.trim));
  out.push(part(slab(2.18, 0.17, 2.04, x, y + 2.50, z + 2.22, `${name}-cab-roof`), p.roof));
  out.push(part(box(1.88, 0.76, 0.07, x, y + 2.06, z + 3.18, `${name}-screen`), p.glass));
  for (const s of [-1, 1]) {
    out.push(part(box(0.07, 0.64, 1.32, x + s * 1.05, y + 2.02, z + 2.18, `${name}-side-glass`),
      p.glass));
  }
  out.push(part(box(2.04, 0.28, 0.26, x, y + 0.70, z + 3.26, `${name}-bar`), p.steel));
  out.push(part(slab(2.20, 1.48, 3.90, x, y + 0.92, z - 0.98, `${name}-body`), p.wallAlt));
  out.push(part(box(2.28, 0.13, 4.02, x, y + 2.46, z - 0.98, `${name}-body-rail`), p.steel));
  if (loaded) {
    out.push(part(slab(1.94, 0.46, 3.62, x, y + 2.14, z - 0.98, `${name}-load`), p.wall));
    out.push(part(rotBox(2.10, 0.20, 0.80, x, y + 2.52, z - 2.68, { x: 0.55 }, `${name}-tarp`),
      p.paving));
  }
  return out;
}

/* ─────────────────────────────── the silo battery ─────────────────────────────────────── */

function siloBattery(ctx, F) {
  const p = pal(ctx);
  const out = [];

  // the concrete pad the whole battery stands on — a designed base under the identity mass
  const padL = F.headX - F.headW / 2 - 0.55;
  const padR = F.siloX[F.siloCount - 1] + F.siloR + 0.75;
  out.push(...paverField(ctx, {
    x: (padL + padR) / 2, z: F.rowZ + 0.35, w: padR - padL, d: F.siloR * 2 + 4.2,
    unit: 1.70, y: 0.07, bed: false, material: p.paving, name: 'battery-pad',
  }));

  for (let i = 0; i < F.siloCount; i += 1) {
    const x = F.siloX[i];
    const z = F.rowZ;
    // ±5 % of shell radius and ±0.35 m of eaves so the row is a battery built in three
    // campaigns rather than four copies of one extrusion. Deterministic, off `ctx.v`.
    const r = F.siloR * (0.955 + ctx.v.unit(S.siloJitter + i) * 0.070);
    const top = F.siloTop - ctx.v.unit(S.siloJitter + 20 + i) * 0.36;

    out.push(part(cyl(r + 0.22, F.baseH, x, F.baseH / 2, z, 'y', 'silo-ring', 14), p.paving));
    out.push(part(cyl(r + 0.33, 0.13, x, 0.065, z, 'y', 'silo-ring-toe', 12), p.paving));

    out.push(...siloShell(ctx, {
      x, z, r, y0: F.baseH, y1: top, bands: ctx.detail ? 3 : 2, name: `silo${i}`,
    }));

    // eaves ring, then the cone. THE ROOF IS THE LIGHTER VALUE, WHICH IS THE OTHER WAY ROUND
    // FROM r1: barrels are `wall` at rendered luma 106 and warm, cones are `trim` at 150, so
    // §6B's "value break at the roofs" is a step UP into the light four times across the plate
    // rather than a step down into a near-black cap.
    out.push(part(cyl(r + 0.12, 0.26, x, top + 0.13, z, 'y', 'silo-eaves', 14), p.trim));
    out.push(part(taper(r + 0.09, 0.20, F.coneH, x, top + 0.26, z, 'silo-cone', 16), p.trim));
    out.push(part(cyl(0.26, 0.30, x, top + 0.41 + F.coneH, z, 'y', 'silo-cap', 8), p.wallAlt));
    out.push(part(taper(0.32, 0.14, 0.18, x, top + 0.56 + F.coneH, z, 'silo-vent', 8), p.trim));
  }

  // ── the outloading spout, over the truck bay ────────────────────────────────────────────
  //
  // A silo with no way of getting grain OUT of it is a drum. The spout is one member and it is
  // the thing that explains the truck standing under the battery.
  const sx = F.siloX[1];
  const sz = F.rowZ + F.siloR + 1.05;
  out.push(part(box(0.70, 0.66, 0.80, sx, F.siloTop - 1.65, sz - 0.30, 'spout-head'), p.wallAlt));
  out.push(part(taper(0.30, 0.46, 2.55, sx, F.siloTop - 4.35, sz, 'spout', 8), p.steel));
  out.push(part(cyl(0.28, 0.85, sx, F.siloTop - 5.05, sz, 'y', 'spout-sock', 8), p.wallAlt));
  out.push(part(rotBox(0.16, 3.55, 0.16, sx + 0.55, F.siloTop - 3.0, sz - 0.55, { z: 0.16 },
    'spout-stay'), p.steel));

  // ── the shared top walkway ──────────────────────────────────────────────────────────────
  //
  // Deck, enclosed cross-conveyor casing behind it, handrail in front. Three depths on one
  // horizontal line, which is what stops the walkway reading as a painted stripe.
  const wLeft = F.headX;
  const wRight = F.siloX[F.siloCount - 1] + F.siloR + 0.60;
  const wW = wRight - wLeft;
  const wX = (wLeft + wRight) / 2;
  const deckZ = F.rowZ + F.siloR + 0.36;
  const deckY = F.siloTop - 0.34;
  out.push(part(slab(wW, 0.16, 1.60, wX, deckY, deckZ, 'walkway-deck'), p.trim));
  out.push(part(slab(wW, 0.10, 1.78, wX, deckY - 0.11, deckZ, 'walkway-soffit'), p.trim));
  out.push(part(slab(wW, 1.00, 0.90, wX, deckY + 0.16, deckZ - 0.38, 'gallery-casing'), p.trim));
  out.push(part(slab(wW + 0.12, 0.15, 1.02, wX, deckY + 1.16, deckZ - 0.38, 'gallery-cap'),
    p.wallAlt));
  out.push(...rail(ctx, { x: wX, y: deckY + 0.16, z: deckZ + 0.70, w: wW, h: 1.02 }));
  if (ctx.mid) {
    for (let i = 0; i < F.siloCount; i += 1) {
      out.push(part(rotBox(0.10, 0.95, 0.12, F.siloX[i], deckY - 0.62, deckZ - 0.28,
        { x: 0.72 }, 'walkway-bracket'), p.steel));
    }
  }

  out.push(...ladder(ctx, {
    x: F.siloX[0], z: F.rowZ + F.siloR + 0.09, y0: F.baseH, y1: deckY - 0.10,
    facing: 1, name: 'silo-ladder',
  }));

  // grain that has escaped the spout, and a tyre-scrub arc where the trucks turn under it
  for (let i = 0; i < 6; i += 1) {
    const gx = sx + (ctx.v.unit(S.spill + i * 2) * 2 - 1) * 1.60;
    const gz = sz + 0.45 + ctx.v.unit(S.spill + i * 2 + 1) * 1.70;
    out.push(part(ball(0.18 + ctx.v.unit(S.spill + 40 + i) * 0.17, gx, 0.16, gz, 'grain-spill', 5),
      p.wall));
  }
  return out;
}

/* ─────────────────────────────── the head house ───────────────────────────────────────── */

function headHouse(ctx, F) {
  const p = pal(ctx);
  const out = [];
  const x = F.headX;
  const z = F.headZ;
  const w = F.headW;
  const d = F.headD;

  out.push(part(slab(w + 0.52, 0.16, d + 0.52, x, 0, z, 'head-plinth-toe'), p.paving));
  out.push(part(slab(w + 0.36, 0.58, d + 0.36, x, 0.10, z, 'head-plinth'), p.paving));

  // the shaft. `volume` so the lights are real holes with a dark room behind them rather than
  // panels stuck on a solid.
  out.push(...volume(ctx, {
    material: p.trim,
    x, zFront: z + d / 2, zBack: z - d / 2, width: w, y0: 0.58, y1: F.headTop,
    depth: 0.30, room: true, name: 'head',
    front: [hole(-0.72, 3.40, 0.86, 1.10, 'win'), hole(-0.72, 7.60, 0.86, 1.10, 'win')],
    right: [hole(0.35, 5.50, 0.86, 1.10, 'win')],
  }));
  for (const y of [3.40, 7.60]) {
    out.push(part(box(0.80, 1.04, 0.05, x - 0.72, y + 0.55, z + d / 2 - 0.16, 'head-light'), p.glass));
  }
  out.push(part(box(0.05, 1.04, 0.80, x + w / 2 - 0.16, 5.50 + 0.55, z + 0.35, 'head-light'), p.glass));

  // corner posts and girts — the shaft is a clad steel frame, and saying so is what keeps a
  // twelve-metre pale box from reading as a monolith.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      out.push(part(box(0.18, F.headTop - 0.58, 0.18,
        x + sx * (w / 2 - 0.02), 0.58 + (F.headTop - 0.58) / 2, z + sz * (d / 2 - 0.02),
        'head-post'), p.steel));
    }
  }
  if (ctx.mid) {
    const girts = ctx.detail ? 5 : 3;
    for (let i = 1; i <= girts; i += 1) {
      const gy = 0.58 + (i / (girts + 1)) * (F.headTop - 0.58);
      out.push(part(box(w + 0.07, 0.11, d + 0.07, x, gy, z, 'head-girt'), p.steel));
    }
  }

  // the crown: the machinery deck. A darker mass, wider than the shaft, standing clear of it —
  // and the ONE dark accent this subject spends `wallAlt` on at size.
  out.push(part(slab(w + 0.48, F.crownTop - F.headTop, d + 0.48, x, F.headTop, z, 'head-crown'),
    p.wallAlt));
  out.push(part(slab(w + 0.74, 0.22, d + 0.74, x, F.crownTop, z, 'head-crown-cap'), p.trim));
  // a hipped cap rather than a flat lid: the tower's top is the highest thing on the board and
  // a flat slab up there reads as an unfinished box.
  out.push(part(gable(w + 0.30, d + 0.30, F.headRoof - F.crownTop - 0.22, x, F.crownTop + 0.22, z,
    'head-roof'), p.roof));
  out.push(part(cyl(0.09, 0.85, x, F.headRoof + 0.30, z, 'y', 'head-mast', 6), p.steel));

  // hoist beam out over the front face, with its block
  out.push(part(box(0.22, 0.26, 1.85, x + 0.55, F.crownTop - 0.58, z + d / 2 + 0.70, 'hoist-beam'),
    p.steel));
  out.push(part(box(0.28, 0.36, 0.28, x + 0.55, F.crownTop - 0.96, z + d / 2 + 1.32, 'hoist-block'),
    p.steel));
  out.push(part(cyl(0.03, 1.45, x + 0.55, F.crownTop - 1.85, z + d / 2 + 1.32, 'y', 'hoist-line', 6),
    p.steel));

  out.push(...ladder(ctx, {
    x: x + w / 2 + 0.14, z: z - d * 0.24, y0: 0.58, y1: F.headTop - 0.35,
    facing: 1, width: 0.40, name: 'head-ladder',
  }));

  // ── THE WORD, ON TWO LINES ──────────────────────────────────────────────────────────────
  //
  // A country receival site paints its name on the head house. r1 set it as one line inside a
  // 2.7 m band, which `reliefLetters`'s own `maxWidth` clamp then shrank to a 0.42 m cap — a
  // scatter of dots at the graded station, which the plate confirmed. Two lines double the cap
  // for the same band width, which is the only lever a fixed shaft width leaves.
  // ── THE WORD IS NOT HERE, AND THAT IS A DECISION RATHER THAN AN OMISSION ────────────────
  //
  // r1 set it as one line and `reliefLetters`'s own `maxWidth` clamp shrank the cap to 0.42 m —
  // a scatter of dots on the plate. r2 split it over two lines at 0.70 m and the plate came
  // back with two half-glyphs on a tower face twelve metres up and forty metres from the lens:
  // a 3.15 m band on a 3.45 m shaft cannot hold a ten-character word at any cap that survives
  // the station, and stacking it only trades one unreadable thing for another.
  //
  // So the shaft carries the BAND — a painted stripe with a capping, which is what the tower
  // needs at that height anyway — and the word goes where a word on this subject can actually
  // be read: the site sign at the gate, two metres tall and closest to the lens on the plate.
  // `frontage()` builds it and it reads at the graded station.
  const bandY = 9.55;
  const bandH = 1.05;
  out.push(part(box(w + 0.12, bandH, 0.10, x, bandY, z + d / 2 + 0.03, 'name-band'), p.wallAlt));
  out.push(part(box(w + 0.26, 0.12, 0.18, x, bandY + bandH / 2 + 0.06, z + d / 2 + 0.05,
    'name-band-cap'), p.trim));
  out.push(part(box(w + 0.26, 0.12, 0.18, x, bandY - bandH / 2 - 0.06, z + d / 2 + 0.05,
    'name-band-base'), p.trim));
  return out;
}

/* ─────────────────────── the inclined gallery, the pit and the ramp ───────────────────── */

function inclinedGallery(ctx, F) {
  const p = pal(ctx);
  const out = [];
  const x = F.headX;
  const dz = F.incLoZ - F.incHiZ;
  const dy = F.incLoY - F.incHiY;
  const len = Math.hypot(dz, dy);
  const rad = Math.atan2(-dy, dz);          // the +Z end falls, so a positive rotation about X
  const cz = (F.incHiZ + F.incLoZ) / 2;
  const cy = (F.incHiY + F.incLoY) / 2;

  // casing, cap, two bottom chords and a web — four members deep, so the diagonal has a
  // section rather than being a drawn line. r1 drew the casing from `wallAlt` and it printed
  // as a near-black band across the brightest part of the plate; §2/3 forbids that, so it is
  // `roof` now and the `wallAlt` is spent on the cap alone.
  out.push(part(rotBox(1.06, 1.22, len, x, cy, cz, { x: rad }, 'incline-casing'), p.trim));
  out.push(part(rotBox(1.18, 0.14, len - 0.2, x, cy + 0.64, cz, { x: rad }, 'incline-cap'),
    p.wallAlt));
  for (const s of [-1, 1]) {
    out.push(part(rotBox(0.10, 0.15, len - 0.3, x + s * 0.52, cy - 0.68, cz, { x: rad },
      'incline-chord'), p.steel));
  }
  if (ctx.detail) {
    const bays = 8;
    for (let i = 0; i < bays; i += 1) {
      const t = -len / 2 + (i + 0.5) * (len / bays);
      out.push(part(rotBox(1.14, 0.09, 0.09, x, cy - Math.sin(rad) * t - 0.62,
        cz + Math.cos(rad) * t, { x: rad }, 'incline-web'), p.steel));
    }
  }

  // two support bents down to the yard
  for (const f of [0.34, 0.68]) {
    const bz = F.incHiZ + dz * f;
    const by = F.incHiY + (bz - F.incHiZ) * (dy / dz) - 0.82;
    if (by < 0.8) continue;
    for (const s of [-1, 1]) {
      out.push(part(box(0.21, by, 0.21, x + s * 0.54, by / 2, bz, 'incline-leg'), p.steel));
    }
    out.push(part(box(1.34, 0.17, 0.19, x, by, bz, 'incline-cap-beam'), p.steel));
    out.push(part(rotBox(0.09, Math.hypot(1.08, by * 0.6), 0.09, x, by * 0.62, bz,
      { z: 0.55 }, 'incline-brace'), p.steel));
    out.push(part(slab(1.62, 0.20, 0.95, x, 0, bz, 'incline-pad'), p.paving));
  }

  // ── the intake pit, its shelter and the tipping ramp ────────────────────────────────────
  const pitZ = F.incLoZ + 0.45;
  out.push(part(slab(3.60, 0.24, 3.35, x, 0, pitZ, 'pit-apron'), p.paving));
  out.push(part(slab(2.30, 0.30, 2.05, x, 0.05, pitZ, 'pit-mouth'), p.shadow));
  if (ctx.mid) {
    for (let i = 0; i < 7; i += 1) {
      out.push(part(box(2.14, 0.07, 0.11, x, 0.30, pitZ - 0.88 + i * 0.29, 'pit-grate'), p.steel));
    }
  }
  // a shelter over the pit, on four legs — the intake of a receival site is always roofed
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      out.push(part(box(0.17, 4.05, 0.17, x + sx * 1.72, 2.02, pitZ + sz * 1.55, 'pit-post'),
        p.steel));
    }
  }
  out.push(rakePlate(4.05, 4.35, 3.85, 3.65, x, 0, pitZ, p.trim, 0.16, 'pit-roof'));
  out.push(part(box(4.05, 0.24, 0.16, x, 3.86, pitZ + 1.84, 'pit-roof-fascia'), p.trim));

  // the ramp a tipper backs up: high at the pit end (−Z), falling to the yard
  const rampZ0 = pitZ + 1.75;
  const rampZ1 = rampZ0 + 3.40;
  out.push(rakePlate(3.30, 1.05, 0.16, rampZ1 - rampZ0, x, 0, (rampZ0 + rampZ1) / 2,
    p.paving, 0.26, 'ramp-deck'));
  for (const s of [-1, 1]) {
    out.push(part(slab(0.28, 0.66, rampZ1 - rampZ0, x + s * 1.65, 0, (rampZ0 + rampZ1) / 2,
      'ramp-cheek'), p.wallAlt));
  }
  for (let i = 0; i < 5; i += 1) {
    const gx = x + (ctx.v.unit(S.spill + 60 + i * 2) * 2 - 1) * 1.75;
    const gz = pitZ + (ctx.v.unit(S.spill + 61 + i * 2) * 2 - 1) * 1.55;
    out.push(part(ball(0.19 + ctx.v.unit(S.spill + 90 + i) * 0.15, gx, 0.16, gz, 'grain-spill', 5),
      p.wall));
  }
  return out;
}

/* ─────────────────────────────── the bunker grain shed ────────────────────────────────── */

function bunkerShed(ctx, F) {
  const p = pal(ctx);
  const out = [];
  const x0 = F.shedX0;
  const x1 = F.shedX1;
  const z0 = F.shedZ0;                 // rear, low
  const z1 = F.shedZ1;                 // open mouth, high
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;

  out.push(part(slab(w + 0.90, 0.22, d + 1.00, cx, 0, cz, 'bunker-slab'), p.paving));
  out.push(part(slab(w + 1.08, 0.11, d + 1.16, cx, 0, cz, 'bunker-slab-toe'), p.paving));

  // ── THE WALLS ARE `roof`, NOT `trim`, AND THAT IS THE r1 FIX ────────────────────────────
  //
  // r1 clad this shed in the same pale bucket as the silo battery standing behind it, and the
  // plate came back with the two masses at one value — an eight-metre white box in front of a
  // ten-metre white cylinder, with the identity read spent. The shed is a mid-value mass now
  // and the battery is the only pale thing on the lot, which is the separation §6B's "value
  // break" is really asking for.
  out.push(part(slab(w, F.shedLow, 0.30, cx, 0.20, z0 + 0.15, 'bunker-rear'), p.paving));
  const steps = ctx.detail ? 6 : 3;
  for (const sx of [x0 + 0.15, x1 - 0.15]) {
    for (let i = 0; i < steps; i += 1) {
      const t0 = z0 + (i / steps) * d;
      const t1 = z0 + ((i + 1) / steps) * d;
      const h = F.shedLow + ((i + 0.5) / steps) * (F.shedHigh - F.shedLow);
      out.push(part(slab(0.30, h, t1 - t0, sx, 0.20, (t0 + t1) / 2, 'bunker-side'), p.paving));
    }
  }
  // girts across the flank, so the wall is a clad frame rather than a painted panel
  if (ctx.mid) {
    for (const gy of [1.20, 2.30, 3.40]) {
      out.push(part(box(0.36, 0.13, d, x1 - 0.15, gy, cz, 'bunker-girt'), p.wallAlt));
    }
  }

  const rise = F.shedHigh - F.shedLow;
  const rad = Math.atan2(rise, d);
  const rlen = Math.hypot(d, rise);
  // §2/3: "nothing on a Monopoly Plus frame is a near-black roof plane." r1's shed roof was
  // `wallAlt` at rendered luma 55 and it was the biggest sloping plane on the lot. A farm shed
  // is galvanised, so it is `trim` — and with the battery now buff, the pale bucket is free.
  out.push(part(rotBox(w + 0.70, 0.19, rlen + 0.60, cx, 0.20 + (F.shedLow + F.shedHigh) / 2, cz,
    { x: -rad }, 'bunker-roof'), p.trim));
  out.push(part(box(w + 0.70, 0.36, 0.22, cx, F.shedHigh + 0.20, z1 + 0.32, 'bunker-fascia'),
    p.trim));
  if (ctx.mid) {
    const purlins = ctx.detail ? 7 : 4;
    for (let i = 0; i < purlins; i += 1) {
      const t = -rlen / 2 + (i + 0.5) * (rlen / purlins);
      out.push(part(rotBox(w + 0.70, 0.06, 0.06, cx,
        0.20 + (F.shedLow + F.shedHigh) / 2 + Math.sin(rad) * t + 0.14,
        cz + Math.cos(rad) * t, { x: -rad }, 'bunker-purlin'), p.steel));
    }
  }

  // the portal at the mouth — two columns and a head beam, so the opening is framed
  for (const sx of [x0 + 0.15, x1 - 0.15]) {
    out.push(part(box(0.36, F.shedHigh, 0.38, sx, F.shedHigh / 2 + 0.20, z1 - 0.19,
      'bunker-column'), p.steel));
    out.push(part(slab(0.62, 0.34, 0.64, sx, 0.20, z1 - 0.19, 'bunker-column-base'), p.trim));
  }
  out.push(part(box(w, 0.44, 0.36, cx, F.shedHigh, z1 - 0.19, 'bunker-head'), p.steel));

  // ── what is INSIDE the opening, which is the whole reason the shed is open-fronted ──────
  //
  // §6B: "a wall of bagged or bulk grain visible in the opening." r1 built a tall gable of it
  // that read as a crate lying down and left the rest of the bay literally black. It is now a
  // LOW BROAD heap that reaches the mouth plane, so the grain is the lit thing in the opening
  // rather than a dark void with a wedge in it, with lobes breaking the ridge line.
  // ── THE BAY IS LINED PALE AND FILLED, WHICH IS WHERE r2's CRUSH LIVED ──────────────────
  //
  // r2's mouth was a 5 m x 4 m rectangle of unlit interior with a small heap in it, and it is
  // the single largest black area the census found. Two changes, both of them things a real
  // bunker has: the inside faces are LINED in `trim` — a bunker's push walls are whitewashed
  // concrete and they bounce every photon that gets through the opening — and the heap is
  // filled to within a metre of the head beam, so what the opening frames is grain in the
  // light rather than a cavity with a mound at the back of it.
  out.push(part(slab(w - 0.62, 0.13, d - 0.30, cx, 0.22, cz + 0.02, 'bunker-floor'), p.trim));
  out.push(part(slab(w - 0.66, F.shedLow - 0.55, 0.16, cx, 0.32, z0 + 0.34, 'bunker-lining'),
    p.trim));
  for (const s of [-1, 1]) {
    out.push(part(slab(0.16, F.shedLow - 0.85, d - 0.55, cx + s * (w / 2 - 0.34), 0.32, cz,
      'bunker-lining'), p.trim));
    out.push(part(rotBox(1.15, 0.30, d - 0.45, cx + s * (w / 2 - 0.78), 0.78, cz,
      { z: s * 0.62 }, 'bunker-pushwall'), p.trim));
  }
  const heapH = F.shedHigh - 1.35;
  out.push(part(gable(w - 0.95, d + 0.55, heapH, cx, 0.30, cz + 0.24, 'grain-heap'), p.wall));
  if (ctx.mid) {
    for (let i = 0; i < 7; i += 1) {
      const hx = cx + (ctx.v.unit(S.heap + i * 2) * 2 - 1) * (w * 0.34);
      const hz = cz + 0.5 + (ctx.v.unit(S.heap + i * 2 + 1) * 2 - 1) * (d * 0.30);
      out.push(part(ball(0.52 + ctx.v.unit(S.heap + 30 + i) * 0.38, hx,
        0.32 + heapH * 0.46, hz, 'grain-heap-lobe', 5), p.wall));
    }
  }
  // the toe of the heap spilling past the mouth line, and a tarpaulin lapped over one end
  out.push(part(rotBox(w * 0.34, 0.20, 1.45, cx - w * 0.28, 0.55, z1 + 0.42, { x: -0.30 },
    'grain-toe'), p.wall));
  out.push(part(rotBox(w * 0.30, 0.10, 1.55, cx + w * 0.26, 1.05, z1 - 0.55, { x: 0.36 },
    'tarp'), p.paving));

  for (let i = 0; i < 4; i += 1) {
    const sx = cx + (ctx.v.unit(S.spill + 110 + i * 2) * 2 - 1) * (w * 0.36);
    const sz = z1 + 0.75 + ctx.v.unit(S.spill + 111 + i * 2) * 1.35;
    out.push(part(ball(0.20 + ctx.v.unit(S.spill + 130 + i) * 0.14, sx, 0.18, sz, 'grain-spill', 5),
      p.wall));
  }

  // r1 ran `streaks()` down the mouth columns for wear. It draws from `shadow` — three
  // near-black lines on the one elevation the plate reads the grain through — and the census
  // put this subject at 12.8 % crush against a reference band of 1.2-1.8 %. The wear that
  // survives is the SCUFF at loader height, in `paving` against the shed's `roof` wall: a
  // clean surface immediately beside a dirty one, which is the doctrine, at one value step
  // instead of eight.
  if (ctx.detail) {
    for (const bx of [x0 + 1.0, cx, x1 - 1.2]) {
      out.push(part(box(0.9, 0.34, 0.05, bx, 1.15, z1 - 0.40, 'scuff'), p.paving));
    }
  }
  return out;
}

/* ─────────────────────── weighbridge, sample hut, gate, yard ──────────────────────────── */

function weighbridge(ctx, F) {
  const p = pal(ctx);
  const out = [];
  const x = F.wbX;
  const w = F.wbW;
  const z0 = F.wbZ0;
  const z1 = F.wbZ1;
  const d = z1 - z0;
  const cz = (z0 + z1) / 2;

  out.push(...paverField(ctx, {
    x, z: cz, w: w + 3.4, d: d + 2.2, unit: 1.55, y: 0.07, bed: false, material: p.paving,
    name: 'wb-apron',
  }));
  out.push(part(slab(w + 0.36, 0.26, d + 0.36, x, 0, cz, 'wb-pit'), p.paving));
  const plates = 4;
  for (let i = 0; i < plates; i += 1) {
    out.push(part(slab(w, 0.16, d / plates - 0.07, x, 0.18, z0 + (i + 0.5) * (d / plates),
      'wb-deck'), p.trim));
  }
  for (const s of [-1, 1]) {
    out.push(part(slab(0.17, 0.32, d, x + s * (w / 2 + 0.11), 0.16, cz, 'wb-kerb'), p.steel));
    if (ctx.mid) {
      for (let i = 0; i < 4; i += 1) {
        out.push(part(cyl(0.08, 0.78, x + s * (w / 2 + 0.52), 0.39,
          z0 + 0.7 + i * (d - 1.4) / 3, 'y', 'wb-bollard', 6), p.steel));
      }
    }
  }
  // painted approach lines on the apron — the only marking the palette can carry, and the
  // reference's aprons are never blank
  if (ctx.mid) {
    for (const s of [-1, 1]) {
      out.push(part(slab(0.16, 0.03, 3.2, x + s * (w / 2 + 1.15), 0.09, z1 + 1.35, 'wb-line'),
        p.trim));
    }
    out.push(part(slab(w + 0.6, 0.03, 0.18, x, 0.09, z1 + 0.55, 'wb-stop-line'), p.trim));
  }
  // the indicator head on its post
  const ix = x - w / 2 - 1.15;
  out.push(part(cyl(0.10, 2.15, ix, 1.07, z1 - 1.4, 'y', 'wb-post', 8), p.steel));
  out.push(part(box(0.80, 0.58, 0.26, ix, 2.42, z1 - 1.4, 'wb-head'), p.wallAlt));
  out.push(part(box(0.62, 0.36, 0.05, ix, 2.42, z1 - 1.4 + 0.16, 'wb-face'), p.glass));
  return out;
}

function sampleHut(ctx, F) {
  const p = pal(ctx);
  const out = [];
  const w = 2.55;
  const d = 2.65;
  const x = F.wbX + F.wbW / 2 + 2.70;
  const z = F.wbZ1 - 1.55;
  const h = 2.85;

  out.push(...paverField(ctx, {
    x, z, w: w + 1.5, d: d + 1.5, unit: 1.05, y: 0.07, bed: false, material: p.paving,
    name: 'hut-pad',
  }));
  out.push(part(slab(w + 0.30, 0.26, d + 0.30, x, 0.02, z, 'hut-plinth'), p.paving));
  out.push(...volume(ctx, {
    material: p.wall,
    x, zFront: z + d / 2, zBack: z - d / 2, width: w, y0: 0.30, y1: h,
    depth: 0.22, room: true, name: 'hut',
    front: [hole(-0.50, 1.05, 1.20, 1.00, 'win'), hole(0.80, 0.30, 0.86, 2.05, 'door')],
    right: [hole(0, 1.05, 0.95, 1.00, 'win')],
  }));
  out.push(part(box(1.14, 0.94, 0.05, x - 0.50, 1.55, z + d / 2 - 0.11, 'hut-glass'), p.glass));
  out.push(part(box(0.05, 0.94, 0.89, x + w / 2 - 0.11, 1.55, z, 'hut-glass'), p.glass));
  out.push(part(box(0.80, 1.99, 0.06, x + 0.80, 1.30, z + d / 2 - 0.09, 'hut-door'), p.steel));
  // a shallow gable with an eaves band and a skillion porch over the door
  out.push(part(gable(w + 0.62, d + 0.62, 0.68, x, h, z, 'hut-roof'), p.roof));
  out.push(part(slab(w + 0.70, 0.14, d + 0.70, x, h - 0.14, z, 'hut-eaves'), p.trim));
  out.push(rakePlate(1.55, 2.55, 2.25, 1.25, x + 0.80, 0, z + d / 2 + 0.62, p.trim, 0.12,
    'hut-porch'));
  for (const s of [-1, 1]) {
    out.push(part(box(0.11, 2.30, 0.11, x + 0.80 + s * 0.66, 1.15, z + d / 2 + 1.18, 'hut-porch-post'),
      p.steel));
  }
  // the sampling spear leaning by the door
  out.push(part(rotBox(0.06, 2.05, 0.06, x + w / 2 + 0.30, 1.15, z + 0.30, { z: 0.22 },
    'hut-spear'), p.steel));
  return out;
}

/** The gate, the site sign and the boundary — the lot's FRONT-WEST corner, plate column −13. */
function frontage(ctx, F) {
  const p = pal(ctx);
  const out = [];
  const gz = F.gateZ;
  const gateHalf = 2.55;

  // a rural site fence: posts, three wires, and a wide stock gate on the haul road
  const runs = [[-F.inW, F.wbX - gateHalf], [F.wbX + gateHalf, F.inW]];
  for (const [a, b] of runs) {
    if (b - a < 0.4) continue;
    const n = Math.max(2, Math.round((b - a) / 2.30));
    for (let i = 0; i <= n; i += 1) {
      out.push(part(box(0.14, 1.42, 0.14, a + (i / n) * (b - a), 0.71, gz, 'fence-post'), p.steel));
    }
    for (const wy of [0.55, 1.16]) {
      out.push(part(box(b - a, 0.06, 0.06, (a + b) / 2, wy, gz, 'fence-wire'), p.trim));
    }
  }
  // the two side boundaries, run back far enough to say the lot is enclosed
  for (const s of [-1, 1]) {
    const zA = -F.inD * 0.25;
    const n = Math.max(2, Math.round((gz - zA) / 2.30));
    for (let i = 0; i <= n; i += 1) {
      out.push(part(box(0.14, 1.42, 0.14, s * F.inW, 0.71, zA + (i / n) * (gz - zA),
        'fence-post'), p.steel));
    }
    for (const wy of [0.55, 1.16]) {
      out.push(part(box(0.06, 0.06, gz - zA, s * F.inW, wy, (zA + gz) / 2, 'fence-wire'),
        p.trim));
    }
  }
  for (const s of [-1, 1]) {
    out.push(part(box(0.28, 2.15, 0.28, F.wbX + s * gateHalf, 1.07, gz, 'gate-post'), p.steel));
    out.push(part(slab(0.56, 0.32, 0.56, F.wbX + s * gateHalf, 0, gz, 'gate-footing'), p.paving));
    const gx = F.wbX + s * (gateHalf + 1.10);
    out.push(part(box(2.15, 0.10, 0.10, gx, 1.36, gz - 0.24, 'gate-rail'), p.steel));
    out.push(part(box(2.15, 0.10, 0.10, gx, 0.62, gz - 0.24, 'gate-rail'), p.steel));
    out.push(part(box(0.10, 0.84, 0.10, gx + s * 1.00, 0.99, gz - 0.24, 'gate-stile'), p.steel));
    if (ctx.detail) {
      for (let i = 0; i < 4; i += 1) {
        out.push(part(box(0.07, 0.70, 0.07, gx - 0.78 + i * 0.52, 0.99, gz - 0.24, 'gate-bar'),
          p.steel));
      }
    }
  }

  // ── the site sign, in the lot's far-left plate band ─────────────────────────────────────
  const sx = -F.inW + 1.15;
  const sz = gz - 1.25;
  for (const s of [-1, 1]) {
    out.push(part(box(0.19, 2.55, 0.19, sx + s * 1.55, 1.27, sz, 'sign-post'), p.steel));
    out.push(part(slab(0.44, 0.26, 0.44, sx + s * 1.55, 0, sz, 'sign-footing'), p.paving));
  }
  out.push(part(box(3.60, 1.25, 0.13, sx, 1.92, sz, 'sign-board'), p.wallAlt));
  out.push(part(box(3.78, 0.13, 0.20, sx, 2.61, sz + 0.02, 'sign-cap'), p.trim));
  out.push(part(box(3.78, 0.13, 0.20, sx, 1.23, sz + 0.02, 'sign-base'), p.trim));
  out.push(...reliefLetters({
    text: F.word, x: sx, y: 1.94, z: sz + 0.07,
    cap: 0.62, maxWidth: 3.20, material: p.trim,
    axis: 'z', facing: 1, depth: 0.05, embed: 0.020,
    name: `sign-word:${F.word}`,
  }));

  // mast lighting, one each side of the yard
  for (const [mx, mz] of [[-F.inW + 0.50, F.inD * 0.20], [F.inW - 0.50, -F.inD * 0.58]]) {
    out.push(part(slab(0.78, 0.44, 0.78, mx, 0, mz, 'mast-base'), p.paving));
    out.push(part(taper(0.18, 0.10, 7.10, mx, 0.44, mz, 'mast', 8), p.steel));
    out.push(part(box(1.36, 0.19, 0.66, mx, 7.62, mz, 'mast-head'), p.steel));
    for (const s of [-1, 1]) {
      out.push(part(box(0.48, 0.15, 0.46, mx + s * 0.38, 7.50, mz, 'mast-lamp'), p.trim));
    }
  }
  return out;
}

/** The rear-east corner — plate column +9 to +14, which r1 left as bare tray. */
function rearYard(ctx, F) {
  const p = pal(ctx);
  const out = [];
  const zBack = -F.inD;

  out.push(...paverField(ctx, {
    x: F.inW * 0.24, z: zBack + 3.2, w: F.inW * 1.45, d: 5.4,
    unit: 1.75, y: 0.07, bed: false, material: p.paving, name: 'rear-apron',
  }));

  // ── the squat hopper bins §6B asks for, on legs, standing where the plate has room ──────
  for (const [bx, bz, br, bh] of [
    [F.inW * 0.62, zBack + 4.30, 1.08, 3.15],
    [F.inW * 0.94, zBack + 2.15, 0.88, 2.55],
  ]) {
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2 + 0.78;
      out.push(part(box(0.16, 1.62, 0.16, bx + Math.cos(a) * br * 0.74, 0.81,
        bz + Math.sin(a) * br * 0.74, 'bin-leg'), p.steel));
    }
    out.push(part(taper(0.24, br, 1.18, bx, 1.62, bz, 'bin-hopper', 12), p.wallAlt));
    out.push(part(cyl(br, bh, bx, 2.80 + bh / 2, bz, 'y', 'bin-shell', 14), p.wall));
    for (const f of [0.34, 0.68]) {
      out.push(part(cyl(br + 0.06, 0.16, bx, 2.80 + bh * f, bz, 'y', 'bin-hoop', 10), p.trim));
    }
    out.push(part(taper(br + 0.07, 0.14, 0.78, bx, 2.80 + bh, bz, 'bin-cone', 14), p.trim));
    out.push(part(slab(br * 2.6, 0.22, br * 2.6, bx, 0, bz, 'bin-pad'), p.paving));
    out.push(...ladder(ctx, {
      x: bx, z: bz + br + 0.08, y0: 0.2, y1: 2.80 + bh * 0.92, width: 0.36, name: 'bin-ladder',
    }));
  }

  // a fuel tank on a stand, which every farm receival site has and no other subject on the
  // board carries
  const fx = -F.inW * 0.12;
  const fz = zBack + 2.6;
  for (const s of [-1, 1]) {
    out.push(part(box(0.22, 1.75, 0.22, fx + s * 1.05, 0.88, fz - 0.42, 'fuel-leg'), p.steel));
    out.push(part(box(0.22, 1.75, 0.22, fx + s * 1.05, 0.88, fz + 0.42, 'fuel-leg'), p.steel));
    out.push(part(rotBox(0.09, 1.55, 0.09, fx + s * 1.05, 0.90, fz, { x: s * 0.5 }, 'fuel-brace'),
      p.steel));
  }
  out.push(part(cyl(0.68, 2.85, fx, 2.30, fz, 'x', 'fuel-tank', 12), p.trim));
  out.push(part(box(0.30, 0.26, 0.30, fx + 1.20, 2.90, fz, 'fuel-cap'), p.steel));
  out.push(part(box(0.34, 0.62, 0.30, fx - 1.55, 1.45, fz, 'fuel-pump'), p.wallAlt));
  out.push(part(slab(3.6, 0.20, 2.1, fx, 0, fz, 'fuel-bund'), p.paving));

  // stacked pallets and drums against the rear boundary
  if (ctx.detail) {
    const px = -F.inW * 0.62;
    const pz = zBack + 1.5;
    for (let i = 0; i < 4; i += 1) {
      out.push(part(slab(1.20, 0.16, 1.00, px, 0.02 + i * 0.18, pz, 'pallet'), p.wall));
    }
    for (let i = 0; i < 3; i += 1) {
      out.push(part(cyl(0.30, 0.90, px + 1.45 + i * 0.66, 0.45, pz + 0.20, 'y', 'drum', 8),
        p.wallAlt));
    }
  }

  // the rear boundary fence
  const n = Math.max(2, Math.round((F.inW * 2) / 2.30));
  for (let i = 0; i <= n; i += 1) {
    out.push(part(box(0.14, 1.42, 0.14, -F.inW + (i / n) * F.inW * 2, 0.71, zBack, 'fence-post'),
      p.steel));
  }
  for (const wy of [0.55, 1.16]) {
    out.push(part(box(F.inW * 2, 0.06, 0.06, 0, wy, zBack, 'fence-wire'), p.trim));
  }
  return out;
}

/**
 * §2.1 — the board tray, built here rather than taken from `boardPlinth()`.
 *
 * `boardPlinth` draws its body AND its chamfer from `p.shadow`, and the r3 crush mask shows that
 * chamfer as an unbroken near-black outline running the entire perimeter of the lot — the one
 * continuous crushed edge in the frame, on the largest single object in it. The geometry here is
 * `boardPlinth`'s, member for member and dimension for dimension (`METRICS.plateDepth`,
 * `rimFall`, `rim`, the same `bevelRing` call); the only change is the bucket, from `shadow`
 * (envBase 0.42) to `wallAlt` (0.70) at one luma darker. Still a dark chamfered tray, still the
 * thin charcoal edge the register asks for, and no longer a black line.
 */
function tray(ctx, F) {
  const p = pal(ctx);
  const { env } = ctx;
  const depth = METRICS.plateDepth;
  return [
    part(slab(env.lotW, depth, env.lotD, 0, -depth, 0, 'tray-body'), p.wallAlt),
    part(bevelRing(F.halfW, F.halfD, METRICS.rim, -0.005, METRICS.rimFall, 'tray-bevel'),
      p.wallAlt),
  ];
}

/** The working yard, the planting and the stubble bias under it all. */
function ground(ctx, F) {
  const p = pal(ctx);
  const out = [];

  // ── THE GROUND HAS A COLOUR, AND THE COLOUR IS WARM ─────────────────────────────────────
  //
  // r1 laid the whole lot as `paving` pavers over `boardPlinth`'s `garden` field. Both of those
  // buckets are authored COOL on the fallback scheme — `surfaces.js` §7 deliberately puts
  // `paving`, `roof`, `shadow` and `wallAlt` at albedo r−b ≈ −16 to move them out of the
  // coloured pool — and between them they own the largest area in the frame, which is why the
  // r1 census came back at r−b −3.1 against a reference band of +23 to +43, the coldest number
  // on either side of the table.
  //
  // A receival yard is not a concrete apron. It is compacted decomposed granite and spilled
  // grain, and the one warm bucket the fallback scheme has is `wall` at albedo r−b +26. So the
  // yard field is `wall`, which is both the correct material and the only lever this lane has
  // on the warmth measurement while `surfaces.js` stays the orchestrator's file. `paving` is
  // demoted to what it actually is: the concrete PADS — the battery slab, the weighbridge
  // apron, the bunker floor, the fuel bund — which now read as cool islands in a warm yard
  // instead of as the yard itself.
  // TWO FIELDS, NOT NINE HUNDRED PAVERS. r2 laid the yard as a `paverField` and the joints
  // between the units are 50 mm slots the sky cannot reach — a thousand of them across the
  // largest area in the frame, which is a measurable share of a 15.97 % crush reading. The
  // ground is now two solid slabs with the brick-bound `wall` map doing the granularity, and
  // the only paved units left on the lot are the concrete pads, where a joint IS the material.
  const fieldW = F.inW * 2 - 0.08;
  const fieldD = F.inD * 2 - 0.08;
  out.push(part(slab(fieldW, 0.11, fieldD, 0, -0.02, 0, 'stubble-field'), p.garden));
  out.push(part(slab(F.inW * 1.76, 0.13, F.inD * 1.52, 0, -0.02, -F.inD * 0.07, 'yard-field'),
    p.wall));
  // the haul road out to the gate, standing a whisker proud so the wheel path reads
  out.push(part(slab(F.wbW + 2.4, 0.14, F.inD - F.wbZ1 + 1.6, F.wbX, -0.02,
    (F.wbZ1 + F.inD) / 2 - 0.6, 'road'), p.wall));

  // a windbreak on the rear boundary and volunteers where the loader does not go. A receival
  // site is not landscaped, and planting it like a park would be the failure §6B's curtilage
  // clause is written against.
  for (let i = 0; i < 3; i += 1) {
    const tx = -F.inW + 1.25 + i * (F.inW * 0.88);
    out.push(...canopyTree(ctx, {
      x: Math.min(F.inW - 1.0, tx), z: -F.inD - 0.15 - ctx.v.unit(S.trees + i) * 0.45,
      h: 3.6 + ctx.v.unit(S.trees + 10 + i) * 1.5, canopy: 1.10, habit: 'open',
    }));
  }
  out.push(...canopyTree(ctx, {
    x: F.inW - 0.95, z: F.inD - 2.60, h: 4.1, canopy: 1.20, habit: 'openBroken',
  }));
  for (let i = 0; i < 7; i += 1) {
    const wx = (ctx.v.unit(S.weeds + i * 2) * 2 - 1) * (F.inW - 0.5);
    const wz = -F.inD + 0.7 + ctx.v.unit(S.weeds + i * 2 + 1) * 1.5;
    out.push(...shrubMass(ctx, { x: wx, z: wz, r: 0.42, h: 0.58, name: 'weed' }));
  }
  for (let i = 0; i < 4; i += 1) {
    const wx = (ctx.v.unit(S.weeds + 40 + i) * 2 - 1) * (F.inW - 0.4);
    out.push(...shrubMass(ctx, { x: wx, z: F.inD - 0.75, r: 0.36, h: 0.48, name: 'weed' }));
  }
  out.push(...lawnTufts(ctx, {
    count: 16, salt: S.tufts,
    avoid: [{ x: 0, z: -F.inD * 0.05, w: F.inW * 1.80, d: F.inD * 1.58 }],
  }));
  return out;
}

/** Auger, loader bucket, bird-scarer, people. */
function yardClutter(ctx, F) {
  const p = pal(ctx);
  const out = [];

  // the auger, parked on its wheels beside the bunker mouth
  const ax = F.shedX0 - 0.75;
  const az = F.shedZ1 + 2.30;
  out.push(part(rotBox(0.32, 0.32, 5.60, ax, 1.80, az, { x: 0.62 }, 'auger-tube'), p.trim));
  out.push(part(rotBox(0.46, 0.46, 0.60, ax, 3.22, az - 2.08, { x: 0.62 }, 'auger-head'), p.steel));
  out.push(part(slab(1.00, 0.58, 0.95, ax, 0.30, az + 1.95, 'auger-hopper'), p.wallAlt));
  out.push(part(box(1.60, 0.17, 0.19, ax, 0.44, az + 1.35, 'auger-axle'), p.steel));
  for (const s of [-1, 1]) {
    out.push(part(cyl(0.34, 0.17, ax + s * 0.82, 0.34, az + 1.35, 'x', 'auger-wheel', 8), p.steel));
  }

  // a loader bucket dropped on the gravel
  const bx = F.shedX0 + 2.30;
  const bz = F.shedZ1 + 2.55;
  out.push(part(slab(1.95, 0.66, 1.00, bx, 0.02, bz, 'bucket-body'), p.wallAlt));
  out.push(part(rotBox(1.95, 0.15, 0.90, bx, 0.76, bz - 0.30, { x: 0.75 }, 'bucket-back'), p.wallAlt));
  out.push(part(box(2.00, 0.11, 0.24, bx, 0.06, bz + 0.50, 'bucket-lip'), p.steel));

  // the gas bird-scarer, a tripod and a barrel pointed at the sky
  const sx = -F.inW * 0.36;
  const sz = -F.inD * 0.72;
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    out.push(part(rotBox(0.07, 1.10, 0.07, sx + Math.cos(a) * 0.26, 0.52, sz + Math.sin(a) * 0.26,
      { x: Math.sin(a) * 0.26, z: -Math.cos(a) * 0.26 }, 'scarer-leg'), p.steel));
  }
  out.push(part(rotBox(0.14, 1.00, 0.14, sx, 1.38, sz, { x: -0.55 }, 'scarer-barrel'), p.steel));
  out.push(part(cyl(0.17, 0.36, sx, 0.98, sz + 0.20, 'y', 'scarer-bottle', 7), p.wallAlt));

  // people: one taking a sample at the hut, one at the bunker mouth, one on the walkway
  out.push(...figure(ctx, {
    x: F.wbX + F.wbW / 2 + 1.15, z: F.wbZ1 - 2.85, yaw: -0.9, name: 'grader',
  }));
  out.push(...figure(ctx, {
    x: F.shedX0 + 1.20, z: F.shedZ1 + 1.15, yaw: 2.3, name: 'hand',
  }));
  out.push(...figure(ctx, {
    x: F.siloX[2] + 0.55, z: F.rowZ + F.siloR + 1.05, yaw: 0.35, name: 'driver',
  }));
  return out;
}

/* ─────────────────────────────── the builder ──────────────────────────────────────────── */

/**
 * `grain-plot` — the Grain Yard.
 *
 * @param {any} ctx the commercial kit's assembly context
 * @param {{fasciaWord?: string}} [opts]
 */
export function buildGrainYard(ctx, opts = {}) {
  const F = siteFrame(ctx);
  if (opts.fasciaWord) F.word = opts.fasciaWord;

  ctx.add(tray(ctx, F));
  ctx.add(ground(ctx, F));
  ctx.add(rearYard(ctx, F));
  ctx.add(bunkerShed(ctx, F));
  ctx.add(siloBattery(ctx, F));
  ctx.add(headHouse(ctx, F));
  ctx.add(inclinedGallery(ctx, F));
  ctx.add(weighbridge(ctx, F));
  ctx.add(sampleHut(ctx, F));
  ctx.add(frontage(ctx, F));
  // ── THE TRUCK STANDS ON THE WEIGHBRIDGE ────────────────────────────────────────────────
  //
  // r2 put it under the outloading spout, which is where the story wants it — and the bunker
  // shed stands between that bay and the lens, so the plate came back with a 6 m vehicle
  // entirely hidden behind a shed. The weighbridge is the near-left of the plate, unoccluded by
  // anything, and a loaded tipper standing on the deck with the sample hut beside it is the
  // same story told where it can be seen. The spout keeps its grain spill, so the bay still
  // says what happens there.
  ctx.add(tipper(ctx, {
    x: F.wbX, z: F.wbZ0 + 2.85, yBase: 0.34, loaded: true, name: 'truck',
  }));
  ctx.add(yardClutter(ctx, F));

  return ctx.parts;
}

export const GRAIN_YARD_BUILDERS = Object.freeze({
  'grain-plot': buildGrainYard,
});

export default buildGrainYard;
