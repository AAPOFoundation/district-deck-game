// District Deck V3.41 — MP9 lane J: `petrol-station`.
//
// Spec: `docs/next-phase/V341-MP9-BUILDINGS-SPEC.md` §6J — THE CANOPY IS THE BUILDING.
//
// ══ WHAT THE SUBJECT IS ═══════════════════════════════════════════════════════════════════
//
// A contemporary suburban forecourt. Its identity is not a shed with a sign on it: it is a
// WIDE FLAT PLATE ON FOUR SLIM COLUMNS with a deep saturated fascia band round all four sides,
// standing over a sealed forecourt with four pump islands on it, a glazed shop box behind, and
// a tall thin price totem at the kerb. Nothing else on this board has that silhouette, and the
// reason it reads is that it is the OPPOSITE of everything else: the widest, the lowest, the
// brightest, and the only subject whose principal mass is a horizontal plane with daylight
// under it.
//
// It measured 1 148 triangles before this file — a small box on a bare pad, with no canopy, no
// pumps, no forecourt and no totem. Every one of those is now geometry.
//
// ══ THE HAZARD IS A GAME INPUT, SO IT IS MODELLED ═════════════════════════════════════════
//
// `content.js` gives this archetype `hazard: 'fuel-fire'` and `fireExposureBp: 1_600`. The sim
// charges the player for that risk every quarter, and a player who is being charged for a
// hazard should be able to SEE the hazard. So the tank farm is real: four fill points with
// locking caps set in painted rings, inside a hatched no-parking zone, behind a bollard line,
// with a vapour-recovery riser standing beside them, a spill-kit cabinet, and extinguisher
// cabinets on the shop flank and on a canopy column. The riser is deliberately the second
// tallest object on the lot, because a hazard that is only legible at close range is not
// legible on a board.
//
// ══ THE ENVELOPE, AND WHY NOTHING HERE IS BUILT FROM IT ═══════════════════════════════════
//
// The shipped row is `widthF: 0.80, depthF: 0.34, frontSetback: 0.42` — a 12.0 × 5.1 strip in
// the middle of the lot. A forecourt is not a strip in the middle of a lot; it is the WHOLE
// lot, sealed, with the building pushed to the back of it. So `siteFrame()` derives every
// dimension from the LOT (`env.lotW`, `env.lotD`, `METRICS.rim`) and uses `env.wallH` for the
// shop's wall head and nothing else. That is the same discipline `hammerbarn.js` states —
// "everything is CLAMPED against the lot rather than trusted to the envelope table" — and here
// it has a second payoff: the composition is identical whether or not the orchestrator applies
// the envelope row this lane asks for in its report. Only the lab's framing box moves.
//
// ══ COLOUR ═══════════════════════════════════════════════════════════════════════════════
//
//   wall     THE WHITE. Canopy deck, fascia inner and drip, columns, shop walls, line marking.
//   wallAlt  THE BRAND. The fascia band, the totem head, the shop sign band, hazard fittings.
//   trim     THE SECOND BRAND (gold). Downlight lenses, hatching, fill rings, copings, price
//            panels. Reserved for things that are lit or that mean "keep off".
//   roof     canopy top cap, shop roof deck, bin lids, plant.
//   joinery  DARKEST — mullions, dispenser heads, hoses, bollard cores, poles, the totem post.
//   glass    the shop front and the dispenser displays. Ramped, never a flat card.
//   shadow   reveals, soffit voids, the board tray, paving beds, the shop's interior room.
//   paving   the forecourt slab, the footpath, the service apron.
//   garden   the two kerbed beds and the street strip.
//
// §2.10 — one hue may not own the model. The brand red lives on exactly five elements (canopy
// fascia band, totem head, shop sign band, bollard collars, extinguisher and hazard cabinets)
// and the gold on markings and lenses. The dominant area by a wide margin is the forecourt
// (`paving`) and the canopy (`wall`), which is what a real forecourt reads as: a grey plane
// under a white plate with a red line round it.
//
// Salt namespace 3800–3899.

import {
  box, slab, cyl, taper,
  METRICS, part, recessFaces, hole, countAperture,
  openWall, parapetCrown, battenScreen, roofPlant,
  boardPlinth, paverField, shrubMass, canopyTree,
} from './core.js';
import { RECESS } from './surfaces.js';
import { reliefLetters, reliefExtent } from '../signage/index.js';

/* ────────────────────────────── the site frame ───────────────────────────────────────────
 *
 * ONE PURE FUNCTION DERIVES EVERY DIMENSION and every consumer reads it. The canopy plate, the
 * column grid, the island grid and the dispensers all have to agree about the same two rows and
 * the same two column lines; four producers each re-deriving them from `env` is the duplicated
 * constant defect, and on a subject whose whole silhouette is a rectangle balanced on four
 * points it would show as a column standing beside its island.
 */
function siteFrame(ctx) {
  const { env } = ctx;
  const halfW = env.lotW / 2;
  const halfD = env.lotD / 2;
  const inW = halfW - METRICS.rim;          // 6.88 on a 1x1 parcel
  const inD = halfD - METRICS.rim;

  // The street edge: footpath, kerb, then the forecourt seal starts.
  const walkD = 1.35;
  const walkOuter = inD;
  const kerbZ = walkOuter - walkD - 0.11;
  const apronZ1 = kerbZ - 0.11;             // front edge of the sealed forecourt
  const apronZ0 = -inD;
  const apronY = 0.0;                       // paver field datum; deck top lands at +0.08
  const deckY = apronY + 0.08;

  /* THE SHOP is pushed to the REAR-EAST corner, and both halves of that are a camera decision.
   * REAR, because a forecourt is what stands between the street and the shop. EAST (+x),
   * because the lab's three-quarter station sits at azimuth +0.20π — camera at +x, +z — so the
   * shop's own front AND its east flank are both in frame, and the canopy cannot eclipse it. */
  const shopX1 = inW;                       //  6.88
  const shopW = 5.95;
  const shopX0 = shopX1 - shopW;            //  0.93
  const shopX = (shopX0 + shopX1) / 2;
  const shopZ0 = -inD;
  const shopD = 5.15;
  const shopZ1 = shopZ0 + shopD;            // -1.73
  const shopWallY = env.wallH;              //  4.40
  const shopParapet = 0.94;
  const shopCrown = shopWallY + shopParapet; // 5.34, before the coping

  /* THE CANOPY. 11.10 m across a 13.76 m usable lot, 5.70 deep, its underside at 4.78 and its
   * fascia top at 5.98 — so it is 1.86 times wider than it is tall to the top of the band, and
   * a whole metre lower than the shop's parapet blade. That ratio is the identity.
   *
   * Its rear edge stops 0.42 m clear of the shop's front wall so the two masses read as two
   * objects rather than as one, and so the gap lets daylight onto the shop's glazing. */
  const canW = 11.10;
  const canX = -0.10;
  const canZ1 = 4.55;
  const canD = 5.70;
  const canZ0 = canZ1 - canD;               // -1.15
  const canZ = (canZ0 + canZ1) / 2;
  const soffitY = 4.78;                     // the lit underside
  const soffitT = 0.16;
  const fascia0 = 4.68;                     // the band hangs 0.10 below the soffit plane
  const fascia1 = 5.98;
  const fasciaT = 0.28;                     // its own section, so it is a member not a stripe
  const capT = 0.13;

  /* THE ISLAND GRID — two rows, two columns, and the aisles solved against the lot rather than
   * asserted. A 15 m frontage cannot hold four islands and four 3.2 m lanes; hammerbarn wrote
   * down the same trade ("the ratio is taken on the axis the board DOES have") and the honest
   * version here is a 2.40 m centre aisle with 2.88 m outer lanes, which is a small urban servo
   * and not a highway one. */
  const islW = 2.80;                        // island length, along x
  const islD = 1.20;                        // island width, along z
  const islX = 2.60;                        // island centres at ±2.60
  const rowA = 0.55;
  const rowB = 3.35;
  const islY = deckY;
  const islH = 0.17;                        // kerb upstand
  const islTop = islY + islH;

  // The canopy column stands at the OUTER end of each island, which is where a real one stands
  // and which is also what keeps the plate's cantilevers even: 1.55 m each side in x, 1.20 m
  // front and 1.70 m rear.
  const colX = islX + islW / 2 - 0.45;      // 3.55
  const colFace = 0.34;

  // The dispenser stands at the inner end, 1.45 m clear of its column.
  const dispX = islX - islW / 2 + 0.50;     // 1.70

  /* THE TANK FARM. The west strip, x from the lot rim to the canopy's west edge, is the only
   * band of forecourt with nothing over it, so the fill points are legible from the station
   * without a column or a dispenser in the way. The line is SOLVED between those two edges
   * rather than clamped: a clamped value puts the rings half under the canopy on any lot the
   * envelope jitters, which is the one place they cannot be seen. */
  const canWest = canX - canW / 2;          // -5.65
  const fillLineX = (canWest + (-inW)) / 2; // midway between the canopy edge and the rim
  const fillZ = [-0.55, 0.75, 2.05, 3.35];

  return {
    halfW, halfD, inW, inD,
    walkD, walkOuter, kerbZ, apronZ0, apronZ1, apronY, deckY,
    shopX, shopX0, shopX1, shopW, shopZ0, shopZ1, shopD, shopWallY, shopParapet, shopCrown,
    canW, canX, canD, canZ, canZ0, canZ1, canWest, canEast: canX + canW / 2,
    soffitY, soffitT, fascia0, fascia1, fasciaT, capT,
    islW, islD, islX, rowA, rowB, islY, islH, islTop,
    colX, colFace, dispX,
    fillLineX, fillZ,
  };
}

/* ────────────────────────────── the forecourt ──────────────────────────────────────────── */

/* ══ r2: THE SHADOW UNDER THE CANOPY, AND WHY IT WAS A VOID ═════════════════════════════════
 *
 * The r1 plate measured **crush 9.66 %, p05 0.2** against the programme's band of ≤ 2.0 % and
 * ≥ 18, and the orchestrator's census says every Monopoly Plus frame crushes 1.2–1.8 % and has
 * no true blacks anywhere. This subject is the one most exposed to that finding, because a wide
 * flat canopy on slim columns casts ONE large hard shadow over the whole forecourt — pumps,
 * islands, markings and fill points all inside it — and a forecourt that goes to void throws
 * away everything §6J asks for.
 *
 * It is not the rig, and `surfaces.js RESPONSE` says why in one column:
 *
 *   render (wall/wallAlt)  envBase 0.70      metal (roof)     envBase 0.13
 *   trim                   envBase 0.78      joinery          envBase 0.11
 *   shadow                 envBase 0.42      paving           envBase 0.38
 *
 * `envBase` is how much of the environment return a bucket collects, and under a canopy the
 * environment return is the ENTIRE lighting budget — there is no key at all. r1 drew the seal
 * from `paving` (0.38), the canopy top from `roof` (0.13) and the totem post, the light poles
 * and the dispenser heads from `joinery` (0.11): the four darkest responses in the lane, on the
 * four largest surfaces that never see the sun. So the fix is in the buckets, and it is a
 * material argument rather than a grade one:
 *
 *   the SEAL  -> `wall`. A servo forecourt is a poured concrete pavement, not asphalt; it is
 *                the lightest ground on the board and it collects 0.70 of the env return.
 *                ALL LINE MARKING THEN GOES GOLD, because white paint on a white pavement is
 *                not marking. That is not a compromise — yellow is what a forecourt is actually
 *                marked in, it puts the loud second brand colour on 40-odd small members spread
 *                right across the frame, and the r1 plate was already 33.1 % saturated with the
 *                gold only on the hatching.
 *   the CAP   -> `paving`. A canopy roof is a grey membrane with fall to two sumps, and at 0.38
 *                it sits a clear value step under the white fascia edges without going to void.
 *   the POSTS -> `wall`, with `joinery` kept for the small members it is right for.
 *
 * And on top of the buckets, the §5.3 emissive floor, which is what the lane already uses for
 * a surface that cannot be lit: every member standing in the canopy's own shade carries one.
 * Zero triangles, zero materials, and it is what makes the shadow LIFTED and coloured with the
 * saw cuts and the line marking still readable through it, which is what the reference frames
 * do rather than what a brighter albedo alone would do.
 */
const SHADE = Object.freeze({
  /** Members standing under the canopy plate, in its permanent shade. */
  canopy: 0.90,
  /** Seal outside the canopy but inside its cast shadow at the graded time of day. */
  apron: 0.58,
});

/**
 * Raise the emissive floor of every member in a group that has not already asked for a higher
 * one. `part()` writes `ddRecess` onto the geometry, `mergeByMaterial` expands it per vertex,
 * and `recessFaces`'s per-face array is combined with `Math.max` — so this composes with both
 * rather than fighting either.
 */
function shade(parts, level) {
  for (const it of parts ?? []) {
    const g = it?.geometry;
    if (!g) continue;
    g.userData ??= {};
    if (!(Number(g.userData.ddRecess) >= level)) g.userData.ddRecess = level;
  }
  return parts;
}

/** A painted line on the forecourt. Thin, proud of the seal, and made of something. */
function mark(ctx, { x, z, w, d, material = null, name = 'mark' }) {
  // Line marking carries the canopy floor unconditionally: half of it is under the plate, and a
  // painted arrow that reads on the sunlit half and vanishes on the shaded half is worse than
  // no arrow at all — it tells a viewer the shadow is a hole.
  return part(slab(w, 0.026, d, x, ctx.__deckY, z, name), material ?? ctx.p.trim, SHADE.canopy);
}

/**
 * A hatched keep-off zone — diagonal gold bars, which is what a fuel delivery bay is painted
 * with and what tells a player at a glance that the ground there is not for parking.
 *
 * The bars are rotated boxes rather than a texture, because §2.4's objection to a member drawn
 * as a stripe applies to line marking exactly as it applies to a seam.
 */
function hatchZone(ctx, {
  x, z, w, d, pitch = 0.62, angle = Math.PI / 4, name = 'hatch',
}) {
  const out = [];
  const p = ctx.p;
  // The border first, so the zone reads as an enclosure at board zoom even when the bars grey out.
  out.push(mark(ctx, { x, z: z + d / 2 - 0.06, w, d: 0.12, material: p.trim, name: `${name}-edge` }));
  out.push(mark(ctx, { x, z: z - d / 2 + 0.06, w, d: 0.12, material: p.trim, name: `${name}-edge` }));
  out.push(mark(ctx, { x: x - w / 2 + 0.06, z, w: 0.12, d, material: p.trim, name: `${name}-edge` }));
  out.push(mark(ctx, { x: x + w / 2 - 0.06, z, w: 0.12, d, material: p.trim, name: `${name}-edge` }));
  if (!ctx.mid) return out;

  /* THE BAR LENGTH IS SOLVED, NOT CHOSEN, and the first draft is why this paragraph exists.
   *
   * A bar authored as a fraction of the zone's DIAGONAL overshoots a long thin zone by more
   * than its own width: the delivery zone here is 1.55 x 5.20, its diagonal is 5.43, and a bar
   * 62 % of that at 50° reached x -8.34 against a lot rim at -7.50. The census caught it as a
   * bounding box wider than the parcel — nine painted bars standing on the neighbour's land.
   *
   * A 45° bar spanning the zone's NARROW axis has exactly half that axis of extent in both x
   * and z, so it cannot leave the zone whatever the aspect ratio is, and the run is then a march
   * along the long axis with the first and last centres held a half-span in from the ends.
   */
  const alongZ = d >= w;
  const cross = alongZ ? w : d;
  const run = alongZ ? d : w;
  const len = Math.max(0.30, cross * Math.SQRT2 - 0.16);
  const usable = run - cross;
  if (usable < pitch * 0.5) return out;
  const n = Math.max(2, Math.round(usable / pitch));
  for (let i = 0; i <= n; i += 1) {
    const u = -usable / 2 + (i / n) * usable;
    const g = box(0.13, 0.026, len, 0, 0, 0, `${name}-bar`);
    g.rotateY(alongZ ? angle : -angle);
    g.translate(alongZ ? x : x + u, ctx.__deckY + 0.013, alongZ ? z + u : z);
    g.computeBoundingBox();
    out.push(part(g, ctx.p.trim));
  }
  return out;
}

/** A directional arrow painted on the seal. Head plus shaft, so it has a direction. */
function arrow(ctx, { x, z, dir = 1, name = 'arrow' }) {
  const out = [];
  out.push(mark(ctx, { x, z, w: 0.20, d: 1.30, name: `${name}-shaft` }));
  for (let i = 0; i < 3; i += 1) {
    const w = 0.62 - i * 0.20;
    out.push(mark(ctx, {
      x, z: z + dir * (0.65 + i * 0.17), w, d: 0.17, name: `${name}-head`,
    }));
  }
  return out;
}

/**
 * THE FORECOURT ITSELF — brushed concrete in saw-cut bays, and the saw cuts are joints between
 * real slabs rather than lines drawn on one.
 *
 * `paverField` at a 3.20 m unit is exactly that: a dark bed with 3.2 m slabs standing 40 mm
 * proud of it, so every joint is a groove with its own shadow. A single slab with dark stripes
 * on top would be the same triangle count and would read as a printed grid.
 */
function forecourt(ctx, F) {
  const p = ctx.p;
  const out = [];
  const w = F.inW * 2;
  const d = F.apronZ1 - F.apronZ0;
  const cz = (F.apronZ0 + F.apronZ1) / 2;

  /* `paverField` cannot do this one, and the reason is the whole of the r2 note above: it draws
   * from `paving` and it has no way to say that the bay under the canopy is a different lighting
   * problem from the bay in the sun. So the seal is laid here — same rules, same joint-as-a-real-
   * gap construction, `wall` instead of `paving`, and a per-bay emissive floor. */
  out.push(part(slab(w, 0.10, d, 0, F.apronY - 0.06, cz, 'apron-bed'), p.shadow, SHADE.apron));
  const cols = Math.max(1, Math.round(w / 3.20));
  const rows = Math.max(1, Math.round(d / 3.20));
  const cw = w / cols;
  const rl = d / rows;
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const sx = -w / 2 + (c + 0.5) * cw;
      const sz = cz - d / 2 + (r + 0.5) * rl;
      // A bay is "under the plate" if its centre is inside the canopy footprint grown by 1.6 m,
      // which is the penumbra the plate's own edge throws at the graded time of day.
      const under = Math.abs(sx - F.canX) < F.canW / 2 + 1.6
        && Math.abs(sz - F.canZ) < F.canD / 2 + 1.6;
      out.push(part(slab(cw - 0.055, 0.08, rl - 0.055, sx, F.apronY, sz, 'apron'),
        p.wall, under ? SHADE.canopy : SHADE.apron));
    }
  }

  /* THE LANE MARKING. Two crossovers at the kerb, a run line down each drive lane, and arrows
   * that say which way traffic goes round the islands. This is what makes the seal read as a
   * forecourt instead of as a car park. */
  const laneL = -(F.islX + F.islW / 2 + 1.40);      // -5.40, the west drive lane
  const laneR = F.islX + F.islW / 2 + 1.40;         //  5.40, the east drive lane past the shop
  for (const [lx, dir] of [[laneL, 1], [laneR, -1]]) {
    out.push(...arrow(ctx, { x: lx, z: dir > 0 ? 4.30 : 4.30, dir, name: 'lane-arrow' }));
    if (ctx.detail) out.push(...arrow(ctx, { x: lx, z: -0.10, dir, name: 'lane-arrow' }));
  }
  // The centre aisle's own stop line and give-way bar at the exit.
  out.push(mark(ctx, { x: 0, z: F.apronZ1 - 0.55, w: 2.20, d: 0.16, name: 'stop-line' }));

  /* THE ISLAND SURROUNDS — a painted box round each island so the kerb has a warning band, and
   * the hose-drop line between the two rows. */
  for (const cz of [F.rowA, F.rowB]) {
    for (const sx of [-1, 1]) {
      const cx = sx * F.islX;
      out.push(mark(ctx, {
        x: cx, z: cz + F.islD / 2 + 0.20, w: F.islW + 0.60, d: 0.11, material: p.trim,
        name: 'island-warn',
      }));
      out.push(mark(ctx, {
        x: cx, z: cz - F.islD / 2 - 0.20, w: F.islW + 0.60, d: 0.11, material: p.trim,
        name: 'island-warn',
      }));
    }
  }
  return out;
}

/* ────────────────────────────── the canopy ─────────────────────────────────────────────── */

/**
 * §6J's first sentence, built.
 *
 * Four layers, four different depths, and each one throws its own shadow onto the one below:
 *
 *   1. the DRIP — a white edge standing 60 mm proud of the fascia at its foot
 *   2. the FASCIA BAND — 1.30 m deep, saturated, wrapping all four sides with real section
 *   3. the SOFFIT — a lit white panel recessed inside the band, with a grid of downlights
 *   4. the CAP — a grey top plate with fall to two rainwater outlets
 *
 * A canopy authored as one white box with a red stripe on it is the thing this replaces. The
 * band's 0.28 m section is what makes the plate read as 1.30 m thick at the edge and 0.16 m
 * thick in the middle, which is what a real canopy looks like from underneath.
 */
function canopy(ctx, F) {
  const p = ctx.p;
  const out = [];
  const hw = F.canW / 2;
  const hd = F.canD / 2;
  const bandH = F.fascia1 - F.fascia0;

  // ── the four fascia bands ────────────────────────────────────────────────────────────────
  const band = (w, d, x, z, name) => {
    out.push(part(slab(w, bandH, d, x, F.fascia0, z, name), p.wallAlt));
    // A gold pinstripe near the head of the band, and a white one at its foot. Two members,
    // 24 triangles, and they are what stops 1.30 m of flat red reading as a painted rectangle.
    out.push(part(slab(w + 0.05, 0.10, d + 0.05, x, F.fascia1 - 0.30, z, `${name}-stripe`), p.trim));
    out.push(part(slab(w + 0.07, 0.11, d + 0.07, x, F.fascia0 - 0.02, z, `${name}-drip`), p.wall));
  };
  band(F.canW, F.fasciaT, F.canX, F.canZ + hd - F.fasciaT / 2, 'fascia-f');
  band(F.canW, F.fasciaT, F.canX, F.canZ - hd + F.fasciaT / 2, 'fascia-b');
  band(F.fasciaT, F.canD - F.fasciaT * 2, F.canX - hw + F.fasciaT / 2, F.canZ, 'fascia-l');
  band(F.fasciaT, F.canD - F.fasciaT * 2, F.canX + hw - F.fasciaT / 2, F.canZ, 'fascia-r');

  // ── the soffit, and it is LIT ────────────────────────────────────────────────────────────
  //
  // §5.3's arithmetic, on the single largest downward-facing surface in the lane: 55 m² of
  // white panel under a plate, receiving no sky at all. Authored plain it renders at literal
  // zero and the canopy reads as a black slab on white legs, which is the exact inversion of
  // the subject. It carries `RECESS.soffit` on the face that is seen.
  const sw = F.canW - F.fasciaT * 2;
  const sd = F.canD - F.fasciaT * 2;
  out.push(part(recessFaces(
    slab(sw, F.soffitT, sd, F.canX, F.soffitY, F.canZ, 'canopy-soffit'), RECESS.soffit, ['ny'],
  ), p.wall, RECESS.soffit));

  // Shallow ribs across the soffit at the column lines — the structure the plate hangs on, seen
  // from below as two shadow lines. 0.22 m deep, so they read without eating the clear height.
  for (const rz of [F.rowA, F.rowB]) {
    out.push(part(recessFaces(
      slab(sw, 0.20, 0.34, F.canX, F.soffitY - 0.20, rz, 'canopy-rib'), RECESS.soffit, ['ny'],
    ), p.wall, RECESS.soffit));
  }
  for (const sx of [-1, 1]) {
    out.push(part(recessFaces(
      slab(0.30, 0.18, sd - 0.20, F.canX + sx * (sw / 2 - 0.60), F.soffitY - 0.18, F.canZ,
        'canopy-rib-l'), RECESS.soffit, ['ny'],
    ), p.wall, RECESS.soffit));
  }

  /* ── THE DOWNLIGHT GRID ────────────────────────────────────────────────────────────────
   *
   * Six by four recessed lenses on the soffit, gold, each carrying the level-1 emissive floor.
   * A petrol-station canopy at night IS its downlights and in daylight it is still the grid of
   * lenses that tells you what the plate is. 24 members, 288 triangles, and it is the cheapest
   * identity cue on the subject. */
  const cols = ctx.detail ? 6 : 4;
  const rows = ctx.detail ? 4 : 3;
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const lx = F.canX - sw / 2 + ((i + 0.5) / cols) * sw;
      const lz = F.canZ - sd / 2 + ((j + 0.5) / rows) * sd;
      // Skip a lens that would land inside a rib.
      if (Math.abs(lz - F.rowA) < 0.30 || Math.abs(lz - F.rowB) < 0.30) continue;
      out.push(part(slab(0.46, 0.05, 0.46, lx, F.soffitY - 0.05, lz, 'canopy-lens'), p.trim, 1));
    }
  }

  // ── the top cap, with fall and two outlets ──────────────────────────────────────────────
  //
  // r2 — `paving`, not `roof`. The cap is the largest single plane in the three-quarter frame
  // and `roof` binds the METAL response at envBase 0.13, which is the second-lowest environment
  // return in the lane: on the r1 plate it rendered as a near-black slab sitting on a white
  // canopy, which is the exact inversion of the subject. A canopy roof is a grey membrane, and
  // `paving` at 0.38 puts it a clear step under the white fascia edges without going to void.
  out.push(part(slab(F.canW + 0.04, F.capT, F.canD + 0.04, F.canX, F.fascia1 - F.capT, F.canZ,
    'canopy-cap'), p.paving));
  // The membrane's welded laps, and the fall to two sumps. `roof` survives HERE, on 60 mm
  // members catching their own highlight, which is what a metal response is good for.
  const laps = ctx.mid ? 6 : 3;
  for (let i = 1; i < laps; i += 1) {
    out.push(part(slab(0.10, 0.05, F.canD - 0.10, F.canX - F.canW / 2 + (i / laps) * F.canW,
      F.fascia1, F.canZ, 'canopy-lap'), p.roof));
  }
  for (const sx of [-1, 1]) {
    out.push(part(slab(1.30, 0.07, 1.30, F.canX + sx * (hw - 1.10), F.fascia1 - F.capT - 0.07,
      F.canZ - hd + 1.10, 'canopy-sump'), p.roof));
    out.push(part(slab(1.46, 0.06, 1.46, F.canX + sx * (hw - 1.10), F.fascia1 - F.capT - 0.01,
      F.canZ - hd + 1.10, 'canopy-sump-flash'), p.roof));
  }
  // A maintenance walkway down the spine, so the plane has a line of its own on it.
  out.push(part(slab(F.canW - 1.60, 0.05, 0.62, F.canX, F.fascia1, F.canZ + 0.30,
    'canopy-walk'), p.wall));

  /* ── THE COLUMNS ───────────────────────────────────────────────────────────────────────
   *
   * Slim, square, standing on the islands, with a base plate and a collar where they meet the
   * plate. Four of them carry 63 m² of canopy, which is what a steel canopy actually does and
   * is why the silhouette reads as a plate floating over daylight. */
  for (const sx of [-1, 1]) {
    for (const cz of [F.rowA, F.rowB]) {
      const cx = sx * F.colX;
      const h = F.soffitY - F.islTop;
      // Every column member carries the canopy floor: a column stands in its own plate's shadow
      // for the whole of every day, and four black posts holding up a white roof is the r1 plate.
      out.push(part(slab(F.colFace + 0.16, 0.10, F.colFace + 0.16, cx, F.islTop, cz,
        'col-plate'), p.joinery, SHADE.canopy));
      out.push(part(slab(F.colFace, h, F.colFace, cx, F.islTop + 0.10, cz, 'col-shaft'),
        p.wall, SHADE.canopy));
      out.push(part(slab(F.colFace + 0.13, 0.22, F.colFace + 0.13, cx, F.soffitY - 0.24, cz,
        'col-collar'), p.wall, SHADE.canopy));
      // A brand-red collar at knee height on each column — the guard ring a real one carries,
      // and four more places for the loud bucket to appear in the middle of the frame.
      out.push(part(slab(F.colFace + 0.10, 0.42, F.colFace + 0.10, cx, F.islTop + 0.28, cz,
        'col-guard'), p.wallAlt, SHADE.canopy));
      // The drainage downpipe is strapped to the column — a real canopy drains through them.
      if (ctx.detail) {
        out.push(part(cyl(0.065, h - 0.20, cx + sx * (F.colFace / 2 + 0.07), F.islTop + h / 2, cz,
          'y', 'col-pipe', 6), p.joinery, SHADE.canopy));
      }
    }
  }
  return out;
}

/* ────────────────────────────── the pump islands ───────────────────────────────────────── */

/**
 * One island: a kerbed concrete plinth, a dispenser with a lit display and two hose loops in
 * their holsters, a bollard at each end, and — on the two front islands — a screen-wash bucket
 * stand, which is the one piece of forecourt furniture nobody models and everybody recognises.
 */
function pumpIsland(ctx, F, { x, z, hand, wash }) {
  const p = ctx.p;
  const out = [];
  const top = F.islTop;

  // Kerb and fill. Two members, so the island has a shadow line rather than being a grey patch.
  out.push(part(slab(F.islW, F.islH, F.islD, x, F.islY, z, 'island-kerb'), p.paving, SHADE.canopy));
  out.push(part(slab(F.islW - 0.26, 0.05, F.islD - 0.26, x, top - 0.02, z, 'island-fill'),
    p.paving, SHADE.canopy));
  // Yellow nosing on the two long edges — the paint that stops a tyre finding the kerb.
  for (const sz of [-1, 1]) {
    out.push(part(slab(F.islW, 0.045, 0.13, x, top - 0.045, z + sz * (F.islD / 2 - 0.065),
      'island-nose'), p.trim));
  }

  /* THE DISPENSER. A real cabinet: painted body, a dark head with the grade display in it, a
   * glazed price panel each side, a lit nozzle boot, and a hose that leaves the machine and
   * comes back to a holster. */
  // `hand` is +1 for the east island pair and -1 for the west one, and it puts the dispenser at
  // the INNER end of its island — toward the centre aisle — so both machines face the lane a car
  // actually pulls into and neither one hides behind its own column.
  const px = x - hand * (F.islW / 2 - 0.50);
  const bodyW = 0.66;
  const bodyD = 0.58;
  const bodyH = 1.42;
  out.push(part(slab(bodyW + 0.14, 0.10, bodyD + 0.14, px, top, z, 'disp-base'), p.joinery));
  out.push(part(slab(bodyW, bodyH, bodyD, px, top + 0.10, z, 'disp-body'), p.wall));
  out.push(part(slab(bodyW + 0.08, 0.44, bodyD + 0.08, px, top + 0.10 + bodyH, z, 'disp-head'),
    p.roof, SHADE.canopy));
  out.push(part(slab(bodyW + 0.12, 0.09, bodyD + 0.12, px, top + 0.10 + bodyH + 0.44, z,
    'disp-cap'), p.wallAlt));
  // The two display panels, seen from both drive lanes.
  for (const sz of [-1, 1]) {
    out.push(part(box(bodyW - 0.14, 0.30, 0.05, px, top + 0.10 + bodyH + 0.22,
      z + sz * (bodyD / 2 + 0.05), 'disp-screen'), p.glass));
    out.push(part(box(bodyW - 0.20, 0.34, 0.05, px, top + 0.10 + bodyH * 0.68,
      z + sz * (bodyD / 2 + 0.035), 'disp-panel'), p.glass));
  }
  // Nozzle boots and hoses — one per side, which is what a two-hose dispenser is.
  if (ctx.mid) {
    for (const sz of [-1, 1]) {
      const hz = z + sz * (bodyD / 2 + 0.08);
      out.push(part(box(0.17, 0.34, 0.15, px + 0.20, top + 0.86, hz, 'disp-boot'), p.joinery));
      out.push(part(box(0.11, 0.24, 0.11, px + 0.20, top + 1.06, hz + sz * 0.05, 'disp-nozzle'),
        p.wallAlt));
      // The hose leaves the head, drops, and returns — three members reading as one loop.
      out.push(part(cyl(0.035, 0.62, px - 0.22, top + 1.18, hz, 'y', 'disp-hose', 5), p.joinery));
      out.push(part(cyl(0.035, 0.44, px - 0.01, top + 0.88, hz, 'x', 'disp-hose', 5), p.joinery));
      out.push(part(cyl(0.032, 0.30, px + 0.20, top + 0.96, hz, 'y', 'disp-hose', 5), p.joinery));
    }
  }

  /* BOLLARDS, one at each end of the island, with a red collar. They are the hazard's most
   * repeated fitting and they are also what keeps the island reading as raised. */
  for (const sx of [-1, 1]) {
    const bx = x + sx * (F.islW / 2 - 0.28);
    out.push(part(cyl(0.095, 0.92, bx, top + 0.46, z, 'y', 'bollard', 6), p.wall));
    out.push(part(cyl(0.105, 0.16, bx, top + 0.70, z, 'y', 'bollard-collar', 6), p.wallAlt));
    out.push(part(cyl(0.112, 0.07, bx, top + 0.925, z, 'y', 'bollard-cap', 6), p.joinery));
  }

  /* THE SCREEN-WASH STAND — a post, a tray, a bucket and a squeegee handle standing in it. */
  if (wash && ctx.detail) {
    const wx = x + hand * (F.islW / 2 - 0.34);
    const wz = z + (F.islD / 2 - 0.30);
    out.push(part(box(0.10, 0.86, 0.10, wx, top + 0.43, wz, 'wash-post'), p.joinery));
    out.push(part(slab(0.44, 0.07, 0.36, wx, top + 0.82, wz, 'wash-tray'), p.joinery));
    out.push(part(cyl(0.14, 0.30, wx, top + 1.04, wz, 'y', 'wash-bucket', 7), p.wallAlt));
    out.push(part(cyl(0.022, 0.52, wx + 0.05, top + 1.34, wz, 'y', 'wash-handle', 5), p.joinery));
  }
  return out;
}

/* ────────────────────────────── the shop box ───────────────────────────────────────────── */

/**
 * A modern convenience shopfront: a full-height glazed screen in a chunky dark frame, standing
 * on a low painted kick rail, with the shop's fitout modelled BEHIND the glass rather than
 * painted on it.
 *
 * `corner-shop.js`'s `shopfrontBay` is the lane's exemplar and it is not this: it carries a
 * chequered stallboard, a bullnose and a stone nosing, which are 1900s corner-shop details and
 * would put a Victorian frontage on a contemporary forecourt. What is lifted from it is the
 * ARGUMENT — the reveal is a real distance, the frame is a member with section, the backer is a
 * dim room at `RECESS.interior` rather than a lit white card, and the pane sits behind both.
 */
function shopScreen(ctx, F, { x, z, w, sill, head, door = false }) {
  const p = ctx.p;
  const out = [];
  const h = head - sill;
  const REV = 0.20;

  // The dim interior the pane blends against. `RECESS.interior` is the level authored for
  // exactly this member — a room seen THROUGH glass, meant to read as dim rather than as lit.
  out.push(part(box(w + 0.06, h + 0.06, 0.10, x, sill + h / 2, z - REV - 0.30, 'shop-back'),
    p.paving, RECESS.soffit));

  // Kick rail and head transom — the two horizontal members that give the screen its section.
  out.push(part(slab(w + 0.10, sill, 0.30, x, 0.0, z - 0.02, 'screen-kick'), p.wallAlt));
  out.push(part(slab(w + 0.16, 0.13, 0.36, x, sill, z - 0.02, 'screen-kick-cap'), p.wall));
  out.push(part(box(w + 0.12, 0.22, 0.34, x, head + 0.11, z - 0.02, 'screen-head'), p.wall, 1));

  /* ── r4: THE PANE AREA IS THE CRUSH, AND IT IS CUT RATHER THAN LIT ────────────────────
   *
   * r3 lit the interior — a ceiling plane at level 1.0, battens, a `paving` rear wall, shelving
   * — and the two worst tiles on the r3 crush map are still this bay. The arithmetic says why
   * and `surfaces.js` states it: the pane blends at `GLASS_RAMP.opacity` 0.84, so 84 % of every
   * pane pixel is the pane's OWN authored ramp and only 16 % is whatever is behind it. That
   * ramp is authored for a shopfront that sees sky. This one sees a canopy soffit.
   *
   * So the fix is area. A real servo shopfront is not a curtain wall: it carries a solid head
   * panel above the transom, a solid spandrel under the sill, and promotional panels pasted
   * across a third of the remaining glass. All three are things the type actually has, all three
   * are members with their own value, and together they take roughly half the glazing out of the
   * elevation without removing one square metre of the shopfront's read.
   */
  const spandrel = Math.min(0.46, (head - sill) * 0.18);
  out.push(part(slab(w, spandrel, 0.16, x, sill, z - 0.10, 'screen-spandrel'), p.wall, 1));
  const headPanel = Math.min(0.62, (head - sill) * 0.22);
  out.push(part(slab(w, headPanel, 0.16, x, head - headPanel, z - 0.10, 'screen-head-panel'),
    p.wallAlt, 1));

  // Mullions at a 1.35 m pitch, each spanning the reveal so the frame IS the lining — the
  // zero-triangle argument `gridWindow` works out in its own r10 note.
  const bays = Math.max(2, Math.round(w / 1.35));
  const bw = w / bays;
  for (let i = 0; i <= bays; i += 1) {
    const mx = x - w / 2 + i * bw;
    out.push(part(box(0.15, h, REV + 0.06, mx, sill + h / 2, z - REV / 2, 'screen-mullion'),
      p.joinery, 1));
  }
  // One transom across, at the head of the door leaf height.
  out.push(part(box(w, 0.13, REV + 0.06, x, sill + h * 0.74, z - REV / 2, 'screen-transom'),
    p.joinery, 1));

  // The panes. One per bay, set back behind the frame, and stopping at the spandrel and the
  // head panel rather than running the full opening.
  const gy0 = sill + spandrel;
  const gy1 = head - headPanel;
  for (let i = 0; i < bays; i += 1) {
    const mx = x - w / 2 + (i + 0.5) * bw;
    out.push(part(box(bw - 0.17, gy1 - gy0, 0.045, mx, (gy0 + gy1) / 2, z - REV - 0.05,
      'screen-pane'), p.glass));
    countAperture('shopfrontBay');
    /* PROMOTIONAL PANELS. Every second bay carries one, alternating brand red and gold, pasted
     * on the INSIDE face of the glass where a real one is. Deterministic by bay index, so the
     * rhythm is authored rather than random. */
    if (ctx.mid && i % 2 === (door ? 1 : 0)) {
      const ph = (gy1 - gy0) * 0.46;
      out.push(part(box(bw - 0.30, ph, 0.04, mx, gy0 + (gy1 - gy0) * 0.60, z - REV - 0.02,
        'screen-poster'), i % 4 === 0 ? p.wallAlt : p.trim, 1));
    }
  }

  /* WHAT IS READ THROUGH THE GLASS. Two gondola runs and a lit counter, all at
   * `RECESS.interior` so they sit in the same dim band as the backer and lift the pane off
   * literal zero without turning it into a white card. */
  if (ctx.mid) {
    /* ── r3: A SHOP WITH ITS LIGHTS ON ──────────────────────────────────────────────────
     *
     * r2 tagged all of this at `RECESS.interior` (0.72) against a `shadow` backer, and the
     * crush map put the two worst tiles in the whole frame on this bay. The lane's own note in
     * `shopfrontBay` sets out the trap on both sides: a `trim` backer behind a pane that passes
     * 16 % of it comes back as a white card, and a `shadow` one comes back as a hole.
     *
     * What neither is, is a LIT CEILING. A convenience shop is lit from a plane 3 m up that the
     * pane sees end-on, so the bright thing is above the eye line and the fitout below it is
     * read in silhouette against it. That is one member at level 1.0 and two battens, and it
     * gives the pane a value structure instead of a flat fill: bright band at the head, mid
     * gondola tops, dark aisle floor.
     */
    const ceil = head - 0.30;
    out.push(part(slab(w - 0.20, 0.10, 2.30, x, ceil, z - 1.35, 'shop-ceiling'), p.wall, 1));
    for (let i = 0; i < 2; i += 1) {
      out.push(part(slab(w * 0.72, 0.09, 0.20, x, ceil - 0.14, z - 0.75 - i * 0.95,
        'shop-batten'), p.trim, 1));
    }
    // The rear wall of the sales floor, lit by that ceiling rather than by the sky.
    out.push(part(slab(w - 0.20, ceil - sill, 0.12, x, sill, z - 2.45, 'shop-rearwall'),
      p.paving, RECESS.soffit));
    for (let i = 0; i < 2; i += 1) {
      const gz = z - 0.85 - i * 0.72;
      out.push(part(slab(w * 0.62, 1.30, 0.34, x - w * 0.14, 0.0, gz, 'shop-gondola'),
        p.wallAlt, RECESS.soffit));
      out.push(part(slab(w * 0.64, 0.09, 0.42, x - w * 0.14, 1.30, gz, 'shop-gondola-top'),
        p.trim, RECESS.soffit));
      out.push(part(slab(w * 0.60, 0.08, 0.30, x - w * 0.14, 0.86, gz + 0.04, 'shop-shelf'),
        p.trim, RECESS.soffit));
    }
    out.push(part(slab(1.55, 1.05, 0.56, x + w * 0.30, 0.0, z - 0.78, 'shop-counter'),
      p.wall, RECESS.soffit));
    out.push(part(slab(1.62, 0.09, 0.62, x + w * 0.30, 1.05, z - 0.78, 'shop-counter-top'),
      p.trim, 1));
  }

  /* THE DOOR. An automatic sliding leaf with a push bar and a dark frame, set 0.06 m forward of
   * the screen line so it reads as an opening rather than as a lighter pane. */
  if (door) {
    const dw = Math.min(1.55, w * 0.42);
    out.push(part(box(dw + 0.16, h + 0.10, 0.16, x, sill + h / 2 - 0.06, z + 0.02, 'door-frame'),
      p.joinery, 1));
    out.push(part(box(dw, h - 0.30, 0.05, x, sill + (h - 0.30) / 2, z - 0.06, 'door-leaf'), p.glass));
    out.push(part(box(dw - 0.10, 0.09, 0.10, x, sill + 1.02, z + 0.05, 'door-bar'), p.wall));
    out.push(part(box(0.10, h - 0.30, 0.11, x - dw / 2 + 0.05, sill + (h - 0.30) / 2, z + 0.03,
      'door-stile'), p.joinery, 1));
    countAperture('door');
  }
  return out;
}

/** The shop box: walls, the glazed frontage, the sign band, the parapet and the roof plant. */
function shopBox(ctx, F) {
  const p = ctx.p;
  const out = [];
  const y1 = F.shopWallY;
  const glazeSill = 0.34;
  const glazeHead = 3.30;
  const bandY = 3.52;

  // ── the three solid elevations ──────────────────────────────────────────────────────────
  //
  // §2.1's blank-wall rule: the east flank is the one the station looks straight at, so it gets
  // a service door and a louvre bank rather than 26 m² of render.
  const midZ = (F.shopZ0 + F.shopZ1) / 2;
  // r3 — the core is what the ENTRY bay opens into, and at `shadow` / 0.72 the doorway read as
  // a rectangle of literal black on the r2 crush map. It is the inside of a lit shop.
  out.push(part(box(F.shopW - 0.60, y1 - 0.20, F.shopD - 0.60, F.shopX, (y1 - 0.20) / 2, midZ,
    'shop-room'), p.paving, RECESS.soffit));
  out.push(...openWall(ctx, {
    material: p.wall, axis: 'x', face: -1, plane: F.shopZ0, centre: F.shopX, run: F.shopW,
    y0: 0, y1, name: 'shop-back',
  }));
  out.push(...openWall(ctx, {
    material: p.wall, axis: 'z', face: 1, plane: F.shopX1, centre: midZ, run: F.shopD,
    y0: 0, y1, name: 'shop-east',
    openings: [hole(midZ + F.shopD * 0.24, 0.0, 1.05, 2.25, 'door')],
  }));
  out.push(...openWall(ctx, {
    material: p.wall, axis: 'z', face: -1, plane: F.shopX0, centre: midZ, run: F.shopD,
    y0: 0, y1, name: 'shop-west',
  }));
  // The east service door, its reveal already lined by `openWall`.
  const svz = midZ + F.shopD * 0.24;
  out.push(part(box(0.10, 2.25, 1.05, F.shopX1 - 0.06, 1.125, svz, 'shop-svc-leaf'),
    p.paving, RECESS.soffit));
  out.push(part(box(0.13, 0.10, 1.20, F.shopX1 + 0.02, 2.32, svz, 'shop-svc-head'), p.wall));

  /* §2.1 — THE EAST FLANK IS THE PLANE THE STATION LOOKS STRAIGHT AT, and on the r2 plate it
   * was 22 m2 of unbroken render with one door in it. A shop flank on a servo carries plant: a
   * louvre bank for the cool room, a downpipe off the parapet, a wall light over the service
   * door, and a string course splitting the elevation at door head height. */
  out.push(part(slab(0.14, 0.16, F.shopD + 0.10, F.shopX1 + 0.05, 2.42, midZ, 'shop-string'),
    p.trim));
  /* THE COOL-ROOM LOUVRE. Hand-wound rather than `battenScreen`, and the r3 plate is the
   * reason: `battenScreen` marches its slats along X and frames them along X, so asked to stand
   * on an X-plane it laid a 2.18 m gold bar and eleven black slats straight out through the
   * parcel boundary — the census caught it as a bounding box 0.56 m wider than the lot. A louvre
   * on a flank is horizontal blades in a frame, and it takes six lines to say so. */
  const lz = midZ - F.shopD * 0.22;
  const lw = 1.90;
  out.push(part(slab(0.16, 1.26, lw + 0.16, F.shopX1 + 0.04, 2.66, lz, 'louvre-frame'),
    p.paving, SHADE.apron));
  for (let i = 0; i < 5; i += 1) {
    out.push(part(slab(0.10, 0.10, lw, F.shopX1 + 0.13, 2.76 + i * 0.21, lz, 'louvre-blade'),
      p.joinery, SHADE.apron));
  }
  out.push(part(cyl(0.085, y1 - 0.20, F.shopX1 + 0.11, (y1 - 0.20) / 2 + 0.20,
    F.shopZ1 - 0.42, 'y', 'shop-downpipe', 6), p.paving));
  out.push(part(box(0.20, 0.14, 0.20, F.shopX1 + 0.11, 0.30, F.shopZ1 - 0.42, 'shop-shoe'),
    p.joinery));
  out.push(part(box(0.16, 0.14, 0.34, F.shopX1 + 0.10, 2.62, svz, 'shop-lamp-arm'), p.joinery));
  out.push(part(box(0.13, 0.10, 0.28, F.shopX1 + 0.17, 2.55, svz, 'shop-lamp'), p.trim, 1));

  // The dark base course, which every subject in this lane stands on (§2.3). On a forecourt it
  // is also the truth: a shop on a servo has a 300 mm bunded kerb round it.
  for (const [w, d, x, z] of [
    [F.shopW + 0.16, 0.20, F.shopX, F.shopZ0 - 0.08],
    [F.shopW + 0.16, 0.20, F.shopX, F.shopZ1 + 0.08],
    [0.20, F.shopD + 0.16, F.shopX0 - 0.08, midZ],
    [0.20, F.shopD + 0.16, F.shopX1 + 0.08, midZ],
  ]) {
    // r3 — `paving`, not `joinery`. On the r2 crush map this course was a continuous literal-
    // black band 300 mm high running the entire frontage and the entire east flank, directly
    // under the elevation the subject is judged on. `joinery` collects 0.11 of the env return
    // and the course stands in the canopy's shade for all of it. A bunded kerb is a concrete
    // upstand; `paving` at 0.38 plus the apron floor keeps it a value STEP rather than a hole.
    out.push(part(slab(w, 0.30, d, x, F.deckY, z, 'shop-base'), p.paving, SHADE.apron));
    out.push(part(slab(w + 0.06, 0.07, d + 0.06, x, F.deckY + 0.30, z, 'shop-base-cap'), p.wall));
  }

  // ── the frontage ────────────────────────────────────────────────────────────────────────
  //
  // Glazing across the western two thirds, the entry at the east end where the drive lane
  // arrives, and a solid pier between them carrying the extinguisher cabinet.
  const glazeW = F.shopW * 0.56;
  const glazeX = F.shopX0 + 0.35 + glazeW / 2;
  const entryW = F.shopW * 0.30;
  const entryX = F.shopX1 - 0.32 - entryW / 2;
  out.push(...openWall(ctx, {
    material: p.wall, axis: 'x', face: 1, plane: F.shopZ1, centre: F.shopX, run: F.shopW,
    y0: 0, y1,
    openings: [
      hole(glazeX, glazeSill - 0.34, glazeW, glazeHead - glazeSill + 0.34, 'shopwin'),
      hole(entryX, 0, entryW, glazeHead, 'door'),
    ],
    name: 'shop-front',
  }));
  out.push(...shade(shopScreen(ctx, F, {
    x: glazeX, z: F.shopZ1 - 0.06, w: glazeW, sill: glazeSill, head: glazeHead,
  }), SHADE.apron));
  out.push(...shade(shopScreen(ctx, F, {
    x: entryX, z: F.shopZ1 - 0.06, w: entryW, sill: 0.06, head: glazeHead, door: true,
  }), SHADE.apron));

  /* THE SIGN BAND. Brand colour, running the full frontage above the glazing, with two gold
   * pinstripes and NO WORD ON IT — the word has moved up to the blade, and the r1 plate is the
   * argument: the band sits at 3.52–4.38 and the canopy's fascia stands from 4.68 to 5.98 in
   * front of it, so from the graded three-quarter station the frontage reads "RVO". A word
   * three fifths eclipsed is worse than a blank band, and a blank saturated band with a stripe
   * on it is what a real shop fascia under a canopy looks like anyway. */
  out.push(part(slab(F.shopW + 0.14, 0.86, 0.30, F.shopX, bandY, F.shopZ1 + 0.04, 'sign-band'),
    p.wallAlt));
  out.push(part(slab(F.shopW + 0.20, 0.09, 0.36, F.shopX, bandY + 0.86, F.shopZ1 + 0.04,
    'sign-cap'), p.trim));
  out.push(part(slab(F.shopW + 0.20, 0.09, 0.36, F.shopX, bandY - 0.09, F.shopZ1 + 0.04,
    'sign-sill'), p.trim));

  // ── the crown ───────────────────────────────────────────────────────────────────────────
  out.push(...parapetCrown(ctx, {
    x: F.shopX, z: midZ, w: F.shopW, d: F.shopD, y: y1, parapet: F.shopParapet, name: 'shop-crown',
  }));
  /* THE ENTRY BLADE — a raised section of parapet over the entry bay. It carries the subject's
   * one word, and it carries it for a measured reason: the blade's centre is at x 5.67 and the
   * canopy's east edge at x 5.45, so the blade is the only part of the shop that stands clear of
   * the plate in plan AND above it in height. `SERVO` is the Australian generic for the type and
   * names no company; there is no device, no logo and no trade dress anywhere in this file. */
  const word = String(ctx.signText ?? 'SERVO').toUpperCase().slice(0, 9);
  const bladeH = 1.42;
  const bladeW = entryW + 1.55;
  out.push(part(slab(bladeW, bladeH, 0.34, entryX, F.shopCrown, F.shopZ1 + 0.02,
    'shop-blade'), p.wall));
  out.push(part(slab(bladeW + 0.16, 0.14, 0.46, entryX, F.shopCrown + bladeH, F.shopZ1 + 0.02,
    'shop-blade-cope'), p.trim));
  out.push(part(slab(bladeW + 0.10, 0.11, 0.42, entryX, F.shopCrown - 0.11, F.shopZ1 + 0.02,
    'shop-blade-sill'), p.trim));
  const ext = reliefExtent(word, { cap: 0.66, maxWidth: bladeW - 0.70 });
  out.push(...reliefLetters({
    text: word, x: entryX, y: F.shopCrown + bladeH / 2 - ext.inkH / 2 - ext.inkBottom,
    z: F.shopZ1 + 0.19, cap: 0.66, maxWidth: bladeW - 0.70, depth: 0.05, embed: 0.03,
    material: p.wallAlt, axis: 'z', facing: 1, name: 'sign-letters',
  }));

  // Roof plant behind the parapet, screened. It shows as a break in the roofline and nothing
  // more, which is exactly what it should do.
  out.push(...roofPlant(ctx, {
    x: F.shopX - 0.8, z: midZ - F.shopD * 0.18, w: 2.60, d: 1.70, y: y1, units: 2, screen: true,
    name: 'shop-plant',
  }));
  return out;
}

/* ────────────────────────────── the hazard ─────────────────────────────────────────────── */

/**
 * §6J's fifth bullet, and the reason it is a bullet: the sim charges this archetype 1 600 bp of
 * fire exposure every quarter and the player has never been able to see why.
 *
 * Four fill points with locking caps, each in a painted ring, inside a hatched delivery zone
 * behind a bollard line; a vapour-recovery riser standing 5.4 m; a spill-kit cabinet; and two
 * extinguisher cabinets where a real one hangs — on the shop pier and on a canopy column.
 */
function tankFarm(ctx, F) {
  const p = ctx.p;
  const out = [];
  const x = F.fillLineX;
  const z0 = F.fillZ[0];
  const z1 = F.fillZ[F.fillZ.length - 1];

  out.push(...hatchZone(ctx, {
    x, z: (z0 + z1) / 2, w: 1.55, d: (z1 - z0) + 1.30, pitch: 0.66, name: 'delivery',
  }));

  for (let i = 0; i < F.fillZ.length; i += 1) {
    const fz = F.fillZ[i];
    // The painted ring, the concrete surround, the chamber lid and the locking cap on it.
    out.push(part(cyl(0.44, 0.03, x, F.deckY + 0.015, fz, 'y', 'fill-ring', 12), p.trim));
    out.push(part(cyl(0.36, 0.05, x, F.deckY + 0.03, fz, 'y', 'fill-surround', 12), p.paving));
    out.push(part(cyl(0.27, 0.06, x, F.deckY + 0.055, fz, 'y', 'fill-lid', 10), p.joinery));
    out.push(part(cyl(0.11, 0.09, x, F.deckY + 0.10, fz, 'y', 'fill-cap', 8), p.wallAlt));
    if (ctx.detail) {
      out.push(part(box(0.16, 0.05, 0.05, x + 0.11, F.deckY + 0.115, fz, 'fill-lock'), p.joinery));
    }
  }

  // The bollard line between the delivery zone and the drive lane.
  const bz0 = z0 - 0.75;
  const bz1 = z1 + 0.75;
  const n = 5;
  for (let i = 0; i < n; i += 1) {
    const bz = bz0 + (i / (n - 1)) * (bz1 - bz0);
    out.push(part(cyl(0.09, 0.98, x + 0.86, F.deckY + 0.49, bz, 'y', 'bollard', 6), p.wall));
    out.push(part(cyl(0.10, 0.17, x + 0.86, F.deckY + 0.74, bz, 'y', 'bollard-collar', 6), p.wallAlt));
    out.push(part(cyl(0.105, 0.06, x + 0.86, F.deckY + 0.98, bz, 'y', 'bollard-cap', 6), p.joinery));
  }

  /* THE VAPOUR-RECOVERY RISER. Two vent stacks on a common frame, 5.4 m to the caps, standing
   * clear of the canopy's west edge. It is deliberately taller than the canopy: a hazard whose
   * only tell is at ground level cannot be read at board altitude. */
  const vz = z0 - 1.85;
  out.push(part(slab(0.90, 0.24, 0.78, x, F.deckY, vz, 'vent-base'), p.paving, SHADE.apron));
  for (let i = 0; i < 2; i += 1) {
    const ox = x + (i - 0.5) * 0.44;
    out.push(part(cyl(0.075, 5.05, ox, F.deckY + 0.24 + 2.525, vz, 'y', 'vent-riser', 7), p.wall));
    out.push(part(cyl(0.115, 0.22, ox, F.deckY + 5.36, vz, 'y', 'vent-cap', 7), p.joinery));
  }
  for (const yy of [1.55, 3.35]) {
    out.push(part(box(0.62, 0.07, 0.07, x, F.deckY + yy, vz, 'vent-brace'), p.joinery));
  }
  // The guard cage round the base — a hazard fitting with a hazard fitting's colour.
  out.push(...battenScreen(ctx, {
    x, y: F.deckY + 0.24, z: vz + 0.42, w: 0.98, h: 1.15, pitch: 0.26, facing: 1,
    material: p.wallAlt, frame: true,
  }));

  /* THE SPILL KIT — a yellow cabinet on a stand beside the delivery zone, with a red lid. */
  const sz = z1 + 1.55;
  out.push(part(slab(0.74, 0.18, 0.56, x, F.deckY, sz, 'spill-plinth'), p.paving, SHADE.apron));
  out.push(part(slab(0.68, 0.86, 0.50, x, F.deckY + 0.18, sz, 'spill-body'), p.trim));
  out.push(part(slab(0.76, 0.10, 0.58, x, F.deckY + 1.04, sz, 'spill-lid'), p.wallAlt));
  if (ctx.detail) {
    out.push(part(box(0.30, 0.05, 0.06, x, F.deckY + 0.62, sz + 0.28, 'spill-latch'), p.joinery));
  }
  return out;
}

/** An extinguisher cabinet — red box, dark handle, white placard. Hangs on a wall or a column. */
function extinguisher(ctx, { x, y, z, facing = 1, name = 'ext' }) {
  const p = ctx.p;
  return [
    part(box(0.52, 0.78, 0.26, x, y, z, `${name}-box`), p.wallAlt),
    part(box(0.56, 0.07, 0.30, x, y + 0.42, z, `${name}-cap`), p.joinery),
    part(box(0.20, 0.26, 0.04, x, y + 0.08, z + facing * 0.15, `${name}-placard`), p.wall),
    part(box(0.16, 0.05, 0.06, x, y - 0.18, z + facing * 0.15, `${name}-handle`), p.joinery),
  ];
}

/* ────────────────────────────── the street edge ────────────────────────────────────────── */

/**
 * The kerb with TWO splayed crossovers cut through it, a footpath of real units, a planted strip
 * between the crossovers, and the price totem standing behind the west kerb run.
 *
 * `kerbAndFootpath()` lays one unbroken kerb the full width of the lot, which on this subject
 * would be a servo you cannot drive into. So the footpath is taken from it and the kerb is
 * stood here in three runs with the crossovers between them.
 */
function streetEdge(ctx, F) {
  const p = ctx.p;
  const out = [];
  const edge = F.inD;
  const zWalk = edge - F.walkD / 2;

  out.push(...paverField(ctx, {
    x: 0, z: zWalk, w: F.inW * 2, d: F.walkD, unit: 1.55, bed: false, name: 'walk',
  }));

  // Three kerb runs and two crossovers. The crossover is a lowered kerb with a splayed wing at
  // each end, which is the detail that says "vehicle entry" rather than "gap".
  const gaps = [[-4.70, -1.55], [1.75, 5.55]];
  const kerbZ = edge - F.walkD - 0.11;
  const runs = [];
  let cursor = -F.inW;
  for (const [g0, g1] of gaps) {
    if (g0 - cursor > 0.10) runs.push([cursor, g0]);
    cursor = g1;
  }
  if (F.inW - cursor > 0.10) runs.push([cursor, F.inW]);
  for (const [a, b] of runs) {
    out.push(part(slab(b - a, 0.22, 0.22, (a + b) / 2, F.deckY - 0.06, kerbZ, 'kerb'),
      p.paving, SHADE.apron));
    out.push(part(slab(b - a, 0.05, 0.26, (a + b) / 2, F.deckY + 0.16, kerbZ, 'kerb-cap'), p.wall));
  }
  for (const [g0, g1] of gaps) {
    // The lowered apron across the crossover, and its two splay wings.
    out.push(part(slab(g1 - g0, 0.09, 0.30, (g0 + g1) / 2, F.deckY - 0.06, kerbZ, 'cross-apron'),
      p.paving));
    for (const gx of [g0, g1]) {
      out.push(part(slab(0.46, 0.15, 0.26, gx, F.deckY - 0.06, kerbZ, 'cross-splay'),
        p.paving, SHADE.apron));
    }
    // Painted entry bars on the seal, inside the crossover.
    out.push(mark(ctx, {
      x: (g0 + g1) / 2, z: kerbZ - 0.55, w: g1 - g0 - 0.60, d: 0.14, name: 'cross-bar',
    }));
  }

  /* THE PLANTED STRIP between the two crossovers — the only soft ground on the lot, and the
   * §2.1 answer to a forecourt that would otherwise be seal from rim to rim. */
  const bx = (gaps[0][1] + gaps[1][0]) / 2;
  const bw = gaps[1][0] - gaps[0][1] - 0.30;
  out.push(part(slab(bw, 0.26, 1.10, bx, F.deckY - 0.06, kerbZ - 0.72, 'bed-kerb'), p.wall));
  out.push(part(slab(bw - 0.30, 0.12, 0.84, bx, F.deckY + 0.12, kerbZ - 0.72, 'planter-soil'),
    p.garden));
  for (let i = 0; i < 4; i += 1) {
    out.push(...shade(shrubMass(ctx, {
      x: bx - bw / 2 + 0.95 + ((i + 0.5) / 4) * (bw - 1.05),
      z: kerbZ - 0.72 + (ctx.v.unit(3840 + i) - 0.5) * 0.22,
      r: 0.34 + ctx.v.unit(3846 + i) * 0.12, h: 0.56, y: F.deckY + 0.20, name: 'shrub-strip',
    }), SHADE.apron));
  }
  // The lot's one tree, at the west end of the planter, in daylight and out of everything's way.
  out.push(...shade(canopyTree(ctx, {
    x: bx - bw / 2 + 0.48, z: kerbZ - 0.70, h: 2.95, canopy: 0.74, pit: false,
  }), SHADE.apron));

  /* THE PRICE TOTEM. Tall, thin, at the west corner where it is silhouetted against the field
   * rather than standing in front of the building, and 7.3 m to the cap — the tallest object on
   * the lot and 1.3 m clear of the canopy, which is what makes it board-legible. */
  // r4 — 0.45 m FORWARD of r3, and it is a clash fix rather than a composition one. The head is
  // 2.05 wide and 0.42 deep with its top at 7.10; at `kerbZ - 0.95` it spanned z 4.26-4.68 and
  // x -6.86 to -4.81, and the canopy plate occupies z -1.15 to 4.55, x -5.65 to 5.45, y 4.68 to
  // 5.98. The two solids interpenetrated over 0.85 x 0.29 x 1.30 m — invisible from the graded
  // station because the totem stands in front of the canopy's far corner, and a defect anyway.
  const tx = -F.inW + 0.95;
  const tz = kerbZ - 0.50;
  const headY = 4.55;
  const headH = 2.55;
  const headW = 2.05;
  out.push(part(slab(1.10, 0.30, 0.90, tx, F.deckY, tz, 'totem-plinth'), p.paving, SHADE.apron));
  out.push(part(slab(1.24, 0.09, 1.02, tx, F.deckY + 0.30, tz, 'totem-plinth-cap'), p.wall));
  // r2 — `wall`, not `joinery`. A 4 m post at envBase 0.11 standing against the field is a black
  // bar, and on the r1 crush map it was the single worst cell in the top third of the frame.
  // A totem post is a painted steel column and it is the same white as the canopy.
  out.push(part(slab(0.46, headY - F.deckY - 0.39, 0.40, tx, F.deckY + 0.39, tz, 'totem-post'),
    p.wall));
  out.push(part(slab(0.54, 0.14, 0.48, tx, headY - 0.72, tz, 'totem-post-band'), p.joinery));
  // The head: a brand slab with a white price field let into it and a capping.
  out.push(part(slab(headW, headH, 0.42, tx, headY, tz, 'totem-head'), p.wallAlt));
  out.push(part(slab(headW + 0.16, 0.16, 0.54, tx, headY + headH, tz, 'totem-cap'), p.trim));
  out.push(part(slab(headW + 0.14, 0.14, 0.52, tx, headY - 0.14, tz, 'totem-foot'), p.trim));
  out.push(part(box(headW - 0.28, headH * 0.66, 0.07, tx, headY + headH * 0.40, tz + 0.245,
    'totem-field'), p.wall, 1));
  out.push(part(box(headW - 0.28, headH * 0.66, 0.07, tx, headY + headH * 0.40, tz - 0.245,
    'totem-field'), p.wall, 1));

  // Three price rows, in relief, on the face the station sees. Grade chips down the left edge.
  const rows = ['189.9', '199.5', '215.7'];
  for (let i = 0; i < rows.length; i += 1) {
    const ry = headY + headH * 0.62 - i * 0.52;
    out.push(...reliefLetters({
      text: rows[i], x: tx + 0.16, y: ry, z: tz + 0.29, cap: 0.34,
      maxWidth: headW - 0.85, depth: 0.035, embed: 0.02,
      material: p.joinery, axis: 'z', facing: 1, name: 'totem-price',
    }));
    out.push(part(box(0.24, 0.30, 0.05, tx - headW / 2 + 0.34, ry + 0.13, tz + 0.29,
      'totem-chip'), i === 0 ? p.wallAlt : i === 1 ? p.roof : p.trim));
  }
  // The header, above the price field.
  out.push(...reliefLetters({
    text: 'FUEL', x: tx, y: headY + headH - 0.52, z: tz + 0.24, cap: 0.36,
    maxWidth: headW - 0.50, depth: 0.04, embed: 0.02,
    material: p.wall, axis: 'z', facing: 1, name: 'totem-word',
  }));
  return out;
}

/* ────────────────────────────── the rest of the lot ────────────────────────────────────── */

/** Vacuum and air bay, the gas-bottle cage, the bin store, and two forecourt light poles. */
function serviceEdge(ctx, F) {
  const p = ctx.p;
  const out = [];
  const midZ = (F.shopZ0 + F.shopZ1) / 2;

  /* THE VACUUM AND AIR BAY, on the east drive lane beside the shop where a car can pull in. */
  // r3 — the bay moves from IN FRONT OF the entry to BESIDE the east flank. On the r2 plate a
  // 1.6 m red cabinet stood on the sight line between the station and the shop door, which is
  // the one thing on the lot a viewer needs to be able to find.
  const vx = F.inW - 0.92;
  const vz = F.shopZ1 - 1.30;
  out.push(mark(ctx, { x: vx - 0.30, z: vz + 0.60, w: 2.40, d: 0.13, material: p.trim, name: 'bay-line' }));
  out.push(mark(ctx, { x: vx - 1.45, z: vz - 0.20, w: 0.13, d: 1.70, material: p.trim, name: 'bay-line' }));
  out.push(part(slab(1.10, 0.16, 0.86, vx, F.deckY, vz, 'vac-plinth'), p.wall));
  out.push(part(slab(0.62, 1.42, 0.62, vx, F.deckY + 0.16, vz, 'vac-body'), p.wallAlt));
  out.push(part(slab(0.70, 0.16, 0.70, vx, F.deckY + 1.58, vz, 'vac-head'), p.joinery));
  out.push(part(cyl(0.05, 0.90, vx - 0.34, F.deckY + 0.70, vz, 'y', 'vac-hose', 5), p.joinery));
  out.push(part(box(0.16, 0.26, 0.14, vx - 0.34, F.deckY + 1.24, vz, 'vac-nozzle'), p.joinery));
  // The air stand beside it — a shorter post with a reel and a gauge head.
  out.push(part(box(0.18, 1.15, 0.18, vx - 0.86, F.deckY + 0.575, vz, 'air-post'),
    p.paving, SHADE.apron));
  out.push(part(cyl(0.19, 0.16, vx - 0.86, F.deckY + 1.22, vz, 'z', 'air-reel', 8), p.wall));
  out.push(part(box(0.26, 0.20, 0.14, vx - 0.86, F.deckY + 1.42, vz, 'air-head'), p.wallAlt));

  /* THE GAS-BOTTLE CAGE against the shop's west flank — a caged exchange stack, which is what
   * every servo has and what nothing else on the board has. */
  const gx = F.shopX0 - 0.72;
  const gz = midZ + 0.55;
  out.push(part(slab(1.30, 0.14, 1.65, gx, F.deckY, gz, 'cage-slab'), p.paving));
  out.push(...battenScreen(ctx, {
    x: gx, y: F.deckY + 0.14, z: gz - 0.80, w: 1.24, h: 1.72, pitch: 0.24, facing: -1,
  }));
  out.push(part(slab(0.09, 1.72, 1.62, gx - 0.62, F.deckY + 0.14, gz, 'cage-side'),
    p.joinery, SHADE.apron));
  out.push(part(slab(0.09, 1.72, 1.62, gx + 0.62, F.deckY + 0.14, gz, 'cage-side'),
    p.joinery, SHADE.apron));
  out.push(part(slab(1.42, 0.10, 1.78, gx, F.deckY + 1.86, gz, 'cage-roof'), p.roof));
  if (ctx.detail) {
    for (let i = 0; i < 4; i += 1) {
      const bx = gx - 0.34 + (i % 2) * 0.62;
      const bz = gz - 0.38 + Math.floor(i / 2) * 0.72;
      out.push(part(cyl(0.19, 0.72, bx, F.deckY + 0.50, bz, 'y', 'gas-bottle', 7), p.wallAlt));
      out.push(part(cyl(0.08, 0.14, bx, F.deckY + 0.93, bz, 'y', 'gas-bottle-neck', 6), p.joinery));
    }
  }

  /* THE BIN STORE, tucked at the rear-west corner where the delivery lane ends. */
  const nx = F.shopX0 - 1.05;
  const nz = F.shopZ0 + 0.95;
  out.push(part(slab(1.90, 1.30, 0.14, nx, F.deckY, nz - 0.62, 'bin-wall'), p.wall));
  for (const sx of [-1, 1]) {
    out.push(part(slab(0.12, 1.30, 1.20, nx + sx * 0.89, F.deckY, nz, 'bin-wall'), p.wall));
  }
  out.push(part(slab(2.02, 0.09, 1.34, nx, F.deckY + 1.30, nz, 'bin-cope'), p.trim));
  for (const sx of [-1, 1]) {
    out.push(part(slab(0.66, 0.92, 0.60, nx + sx * 0.40, F.deckY, nz + 0.04, 'bin-body'),
      p.wallAlt, SHADE.apron));
    out.push(part(slab(0.70, 0.09, 0.64, nx + sx * 0.40, F.deckY + 0.92, nz + 0.04, 'bin-lid'), p.roof));
  }

  /* FORECOURT LIGHT POLES. Both stand on the WEST half, front and rear, and that is an r2 fix
   * rather than a preference: the r1 plate put the second pole at x +6.03 on the front boundary,
   * which from the graded station projects straight through the shop's frontage and rules a
   * 5 m bar down the one elevation the whole shop is judged on. The east side is lit by the
   * canopy and the shop's own blade; nothing is lost by moving it. */
  for (const [lx, lz] of [[-F.inW + 0.85, F.apronZ1 - 1.10], [-F.inW + 0.85, F.shopZ1 - 1.20]]) {
    out.push(part(slab(0.44, 0.24, 0.44, lx, F.deckY, lz, 'pole-plinth'), p.wall));
    out.push(part(slab(0.32, 0.05, 0.32, lx, F.deckY + 0.24, lz, 'pole-plate'), p.paving));
    // r2 — the shaft is `wall`. At `joinery`'s 0.11 env return a 5 m pole crossing the shop
    // front reads as a black bar ruled through the building, which is what the r1 plate shows.
    out.push(part(taper(0.10, 0.065, 5.05, lx, F.deckY + 0.29, lz, 'pole-column', 6), p.wall));
    out.push(part(box(0.80, 0.13, 0.46, lx, F.deckY + 5.42, lz - 0.12, 'pole-head'), p.roof));
    out.push(part(box(0.68, 0.05, 0.36, lx, F.deckY + 5.34, lz - 0.12, 'pole-lens'), p.trim, 1));
  }

  /* ONE TREE at the east boundary beside the shop, in a kerbed pit. The lot is sealed by
   * definition and a servo really does get one street tree and nothing else; §2.1's composed
   * ground is carried by the marking, the kerbs and the islands rather than by planting. */
  /* r4 — THE TREE COMES OFF THE FORECOURT ALTOGETHER. It has now been tried east of the shop
   * (r2: it took a third of the glazed bay) and west of the canopy (r3: it stood in front of the
   * parked car and was the second largest crush blob on the plate, because `canopyTree` draws a
   * `joinery` trunk and `garden` foliage and both live at the bottom of the value range).
   *
   * The place a tree belongs on a servo is the street planter between the two crossovers, which
   * is the one piece of soft ground the type actually has. There it is foreground at the frame's
   * lower edge, it occludes nothing that is being graded, and it stands in daylight rather than
   * under the plate. `serviceEdge` no longer plants anything; `streetEdge` does.  */
  return out;
}

/* ────────────────────────────── inhabitation ───────────────────────────────────────────── */

/**
 * §2.5 of the lane brief — "the lot is inhabited". One car, at the near pump, nose to the shop.
 *
 * It is a MINIATURE of a car and it is built like one: a lower body with a wheel-arch line, a
 * cabin set in from both flanks with a raked screen and backlight, four wheels on visible arches,
 * a bumper each end and lamps that are lit. What it is not is a box with four cylinders under it,
 * which is worse than an empty forecourt because it tells a viewer the modelling stopped.
 *
 * `roof` (the metal response) is the right bucket for it: it is the only bucket in the scheme
 * bound to a painted-metal family, it is not the canopy's white and it is not the brand red, and
 * a slate car on a light forecourt under a red fascia keeps §2.10's hue spread intact.
 */
function forecourtCar(ctx, F, { x, z, yaw = 0 }) {
  const p = ctx.p;
  const out = [];
  const y = F.deckY;
  const L = 4.05;
  const W = 1.74;
  const place = (g) => {
    if (yaw) g.rotateY(yaw);
    g.translate(x, 0, z);
    g.computeBoundingBox();
    return g;
  };
  // Body: a sill band, the main volume, and a shoulder that steps in — three depths down the
  // flank rather than one slab side.
  /* ── r4: THREE BOXES, NOT TWO ────────────────────────────────────────────────────────
   *
   * r3's car was a full-length body with a cabin sitting on it, and on its own plate that reads
   * as a van or a skip — the silhouette has no bonnet and no boot, so nothing about it says
   * "car" at the 60 px it occupies. A saloon is three masses at three heights and the STEPS
   * between them are the whole read: bonnet low and forward, cabin high and central, boot low
   * and back. Same triangle count, different arrangement.
   *
   * And it is `wallAlt`, not `paving`. A silver car on a concrete forecourt under a grey canopy
   * has nothing to separate it from either; the one thing on this lot that is allowed to be a
   * saturated object is the brand colour, and a red car at a pump is a car at a pump.
   */
  const cabL = L * 0.44;
  const bonL = (L - cabL) / 2;
  out.push(part(place(box(W - 0.14, 0.24, L - 0.12, 0, y + 0.40, 0, 'car-sill')), p.joinery));
  // bonnet, cabin block, boot — the three masses
  out.push(part(place(box(W - 0.06, 0.52, bonL + 0.20, 0, y + 0.72, (cabL + bonL) / 2 - 0.10,
    'car-bonnet')), p.wallAlt));
  out.push(part(place(box(W, 0.78, cabL + 0.30, 0, y + 0.85, 0, 'car-body')), p.wallAlt));
  out.push(part(place(box(W - 0.06, 0.60, bonL + 0.14, 0, y + 0.76, -(cabL + bonL) / 2 + 0.07,
    'car-boot')), p.wallAlt));
  out.push(part(place(box(W + 0.04, 0.06, L * 0.70, 0, y + 0.98, 0, 'car-crease')), p.joinery));
  // The greenhouse: glass on three sides, inset from both flanks, under a painted roof panel.
  out.push(part(place(box(W - 0.22, 0.54, cabL, 0, y + 1.51, -L * 0.03, 'car-cabin')), p.glass));
  out.push(part(place(box(W - 0.26, 0.09, cabL - 0.10, 0, y + 1.82, -L * 0.03, 'car-roof')),
    p.wallAlt));
  for (const sp of [-1, 1]) {
    out.push(part(place(box(0.09, 0.54, cabL, sp * (W / 2 - 0.12), y + 1.51, -L * 0.03,
      'car-pillar')), p.wallAlt));
  }
  // Wheels on their arches, and the arches are members so the car sits IN its wheels.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wx = sx * (W / 2 - 0.08);
      const wz = sz * (L / 2 - 0.86);
      out.push(part(place(cyl(0.32, 0.20, wx, y + 0.32, wz, 'x', 'car-wheel', 9)), p.joinery));
      out.push(part(place(cyl(0.14, 0.22, wx, y + 0.32, wz, 'x', 'car-hub', 7)), p.wall));
      out.push(part(place(box(0.09, 0.26, 0.84, sx * (W / 2 + 0.01), y + 0.56, wz, 'car-arch')),
        p.joinery));
    }
  }
  // Bumpers and lamps. The lamps carry the emissive floor, so the car has two bright points on
  // it at board zoom, which is most of what makes a 4 m object read as a vehicle.
  for (const sz of [-1, 1]) {
    out.push(part(place(box(W + 0.04, 0.22, 0.16, 0, y + 0.52, sz * (L / 2 + 0.02), 'car-bumper')),
      p.paving));
    for (const sx of [-1, 1]) {
      out.push(part(place(box(0.34, 0.16, 0.09, sx * (W / 2 - 0.29), y + 0.84,
        sz * (L / 2 + 0.02), 'car-lamp')), sz > 0 ? p.wall : p.trim, 1));
    }
  }
  return out;
}

/* ────────────────────────────── the subject ────────────────────────────────────────────── */

/**
 * `petrol-station` — a contemporary suburban forecourt.
 *
 * @param {any} ctx the commercial dispatcher's context (see `commercial/CONTRACT.md`)
 */
export function buildPetrolStation(ctx) {
  const F = siteFrame(ctx);
  // `mark()` and `hatchZone()` both need the seal's top face and neither should re-derive it.
  ctx.__deckY = F.deckY;

  // §2.1 — the tray first, with the lawn OFF. A forecourt is sealed to its boundary; a green
  // field under it would be a lawn nothing on this subject ever stands on.
  // The tray takes a floor too. It is the largest single area in the lower third of every plate
  // and `shadow` collects 0.42 of the env return with no key on its standing faces at all — the
  // reference frames' trays are DARK, and not one pixel of them is void.
  ctx.add(shade(boardPlinth(ctx, { lawn: false }), 0.62));

  ctx.add(forecourt(ctx, F));
  ctx.add(shopBox(ctx, F));

  /* EVERYTHING THAT STANDS UNDER THE PLATE CARRIES THE CANOPY FLOOR. The islands, the
   * dispensers, the bollards, the wash stands and the parked car spend their whole life in a
   * shadow with no key light in it, and the r1 plate measured what that costs: 9.66 % of the
   * subject at literal black against a reference band of 1.2-1.8 %. See the r2 note above
   * `SHADE` — zero triangles, zero materials, and the members are still modelled dark, they are
   * just no longer modelled ABSENT. */
  for (const sx of [-1, 1]) {
    for (const cz of [F.rowA, F.rowB]) {
      ctx.add(shade(pumpIsland(ctx, F, {
        x: sx * F.islX, z: cz, hand: sx, wash: cz === F.rowB,
      }), SHADE.canopy));
    }
  }
  ctx.add(shade(forecourtCar(ctx, F, { x: -5.30, z: 1.75, yaw: 0.03 }), SHADE.canopy));

  ctx.add(canopy(ctx, F));
  ctx.add(shade(tankFarm(ctx, F), SHADE.apron));
  ctx.add(shade(streetEdge(ctx, F), SHADE.apron));
  ctx.add(shade(serviceEdge(ctx, F), SHADE.apron));

  // The two extinguisher cabinets, where a real one hangs: on the shop's front pier beside the
  // entry, and on the inboard face of the nearest canopy column.
  ctx.add(shade(extinguisher(ctx, {
    x: F.shopX0 + 0.24, y: 1.62, z: F.shopZ1 + 0.16, facing: 1, name: 'ext-shop',
  }), SHADE.canopy));
  ctx.add(shade(extinguisher(ctx, {
    x: F.colX - 0.32, y: F.islTop + 1.55, z: F.rowB, facing: 1, name: 'ext-col',
  }), SHADE.canopy));
}

/** The lane dispatcher's registration map for this file. */
export const PETROL_STATION_BUILDERS = Object.freeze({
  'petrol-station': buildPetrolStation,
});

/**
 * The envelope row this lane asks the orchestrator for. Exported so the request and the report
 * cannot disagree about the numbers, and so an instrument can read it without re-typing it.
 *
 * The shipped row frames a 12.0 x 5.1 box in the middle of the lot. Nothing here is built from
 * it — `siteFrame()` derives from the LOT — so the row does not change one vertex. What it
 * changes is the LAB'S FRAMING: `assembleCommercial` builds `frameBox` from `bodyW`, `frontZ`
 * and `backZ`, and at 0.34 depth behind a 0.42 setback that box stops at z = 3.05, which cuts
 * the totem, the crossovers and the front third of the forecourt out of every station that
 * falls back to it.
 */
export const PETROL_STATION_ENVELOPE = Object.freeze({
  footprint: [1, 1], widthF: 0.90, depthF: 0.74, frontSetback: 0.17,
  wallH: 4.40, storeys: 1, units: 1,
});

export default buildPetrolStation;
