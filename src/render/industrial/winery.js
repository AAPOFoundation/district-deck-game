// District Deck V3.41 — MP9 lane C: `winery`.
//
// Spec: `docs/next-phase/V341-MP9-BUILDINGS-SPEC.md` §6C. Bar: Monopoly Plus.
//
// THE SUBJECT, and every line here answers to it: a working Victorian winery. Not a cellar-door
// confection and — the fault this file closes — not the Port Melbourne bond store with the word
// WINERY screwed to it. Three masses, in the order a viewer reads them:
//
//   1. **A TANK FARM OUTDOORS.** Twelve stainless fermenters of two heights standing in a bunded
//      concrete slab down the east flank, with a catwalk between the rows, ladders, a glycol ring
//      main and hose drops. A paired field of vessels standing in a kerbed tray is a shape nothing
//      else on this board has: the abattoir's identity is a pen field, the grain yard's is silos
//      in a line, and neither is this. It is built first, before a triangle goes anywhere else.
//   2. **A GABLED BARREL HALL** with deep round-arched openings down the flank the camera sees,
//      iron-strapped timber doors, a rendered gable to the street, and a **TERRACOTTA TILE ROOF**.
//      §6C names terracotta as a colour the board needs, and the Monopoly Plus villa frames
//      (`_refs-mp/mp-villa-terracotta.png`) carry it as the single warmest plane in the picture:
//      saturated coral-red, deep eaves, course lines running down the slope. It is built as a
//      plane plus its course battens rather than as one flat quad for exactly that reason.
//   3. **AN OPEN CRUSH PAD** under a light canopy in the west forecourt — receival hopper, press,
//      picking-bin stack, channel drain, and the purple must stains that go with them.
//
// and a **CELLAR-DOOR COURT** across the street end: gravel, a vined pergola, planted urns, two
// cypress, lamps, and a dwarf stone wall with piers to the footpath. §6C is explicit that this is
// the one place on this lot where planting is DESIGNED rather than incidental, and it is the only
// amendment this subject makes to the industrial register's no-garden rule.
//
// THE PLAN IS DRIVEN BY A CONSTRAINT A LANE CANNOT EDIT. `industrial/index.js` builds a
// 2.6 × 0.78 m fascia plate for this archetype at **x = 0, y = 3.4, z = env.frontZ + 0.06**,
// unconditionally, and that file is orchestrator-owned. So x ∈ [−1.3, 1.3] at y ∈ [3.0, 3.8] on
// the front plane has to be clear masonry with a designed field behind it, and nothing on the lot
// may stand in the sight line to it. Every opening on the gable is sited around that fact: the
// cart arch goes west of the ridge, the cellar door goes east and stops below the band, and the
// pergola is set 1.6 m back so its vine cannot clip the plate at the station's own elevation.
//
// COLOUR IS THE OTHER HALF OF THE BRIEF. `core.js: palette` hands every industrial subject the
// same nine buckets and the shipped tints are a bond store's — roof, wall and yard inside twelve
// points of each other, which on a building whose whole silhouette is a red roof over a cream wall
// is the wrong ladder. `tuneColour` re-authors eight of them for this archetype. That cannot leak:
// `palette()` keys every variant on `${archetypeId}-${districtId}-f${facade}`.
//
// NINE BUCKETS AND THERE IS NO TENTH. `p.shadow` is an alias of `p.steel`. What that costs here is
// albedo separation between an arch reveal and the ironwork in front of it; the depth read is
// carried instead by the reveal's own 0.55 m of masonry, by the voussoir ring standing proud of
// the face, and by the pale stooled sill under every opening.
//
// DETERMINISM (§5): no Math.random, no clock. Every variation is `ctx.v` on salts 3200–3299, this
// lane's range. The table below is exhaustive.

import * as THREE from 'three';
import {
  box, slab, rotBox, cyl, taper, skillion, applyMetreUv,
  emit, requestWear, PLATE, boardPlate,
  hardstandSlab, meshPanelFence, industrialGate, bollard, wheelStop, kerb,
  serviceGrate, palletStack, crateStack, drumCluster, weedLine, ladderCaged, externalStair,
  louvreScreen, pipeRun, gutterAndDownpipe, leafLobe, grassTuft, bollardLight, shrubMass,
} from './core.js';

/* ─────────────────────────────── salts, 3200–3299, exhaustive ──────────────────────────────── */

const S = Object.freeze({
  /** Bucket colour picks. 3200 … 3207. */
  roofShift: 3200,
  renderShift: 3201,
  groundShift: 3202,
  claddingShift: 3203,
  steelShift: 3204,
  goodsShift: 3205,
  foliageShift: 3206,
  trimShift: 3207,
  glassShift: 3208,
  /** Arcade opening state and door swing: 3210 … 3229. */
  opening: 3210,
  /** Tank farm — per-vessel height class and fittings. 3230 … 3259. */
  tank: 3230,
  /** Catwalk, ring main, hose drops, chiller. 3260 … 3265. */
  services: 3260,
  /** Crush pad: bin stack, stain runs. 3266 … 3271. */
  crush: 3266,
  /** Cellar-door court: pergola, urns, cypress, lamps. 3272 … 3279. */
  court: 3272,
  /** Yard base, boundary, gate, street edge, volunteers. 3280 … 3287. */
  yard: 3280,
  /** Barrels and stored goods. 3288 … 3291. */
  goods: 3288,
  /** Vine rows. 3292 … 3295. */
  vines: 3292,
  /** Wear seeds. 3296 … 3299. */
  wear: 3296,
});

/* ───────────────────────────────── local geometry helpers ──────────────────────────────────── */
//
// Four primitives `core.js` does not have. They live here rather than there because a lane owns
// exactly one file (§3), and none of them is general enough to belong in the shared kit anyway.

/**
 * A GABLE END — a triangular prism standing in the XY plane, extruded in Z.
 *
 * `core.js: prism` builds a roof solid whose ridge runs along X. This building's ridge runs along
 * Z, because a 1 × 2 lot is deep and a hall that runs with the lot presents its gable to the
 * street and its long tiled pitch to the camera. So the gable wall it needs is the triangle
 * `prism` cannot give.
 *
 * Faces are wound counter-clockwise seen from OUTSIDE, verified by taking the cross product of
 * each triangle's first two edges rather than by reading it off a plate — a back-facing gable is
 * invisible under the kit's default material side and would have shipped as a hole in the wall.
 */
function gableEnd(width, thickness, xc, yBase, apexY, z, ridgeFrac = 0, name = 'gable') {
  const hw = width / 2;
  const t = Math.max(0.05, thickness);
  const x0 = xc - hw; const x1 = xc + hw;
  const xa = xc + Math.max(-hw, Math.min(hw, ridgeFrac * width));
  const zf = z + t / 2; const zb = z - t / 2;
  const verts = [
    [x0, yBase, zf], [x1, yBase, zf], [xa, apexY, zf],   // 0,1,2 front
    [x0, yBase, zb], [x1, yBase, zb], [xa, apexY, zb],   // 3,4,5 back
  ];
  const faces = [
    [0, 1, 2],                     // +Z face
    [3, 5, 4],                     // -Z face
    [0, 3, 4], [0, 4, 1],          // base soffit
    [0, 2, 5], [0, 5, 3],          // west rake
    [1, 4, 5], [1, 5, 2],          // east rake
  ];
  const positions = [];
  for (const [a, b, c] of faces) positions.push(...verts[a], ...verts[b], ...verts[c]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  g.name = name;
  applyMetreUv(g);
  g.computeBoundingBox();
  return g;
}

/**
 * A ROUND-ARCH VOUSSOIR RING, standing proud of the wall face.
 *
 * `n` wedges swept over a half circle of radius `r` about (`centre`, `springY`) in the wall's own
 * plane, each a `rotBox` whose long axis is radial — so the ring reads as separate stones with
 * joints between them rather than as a curve drawn on a rectangle. That is the whole of §2a's
 * "ornament is modelled, not mapped" on this elevation, at nine boxes an arch.
 *
 * `axis` is the wall's NORMAL axis: 'x' for a flank, 'z' for a gable or rear. `plane` is the
 * wall's OUTER FACE, not its centre — a ring placed on the centre plane sits entirely inside a
 * 0.55 m wall and draws nothing, which is a fault that costs a whole elevation and is invisible
 * in a triangle count.
 */
function voussoirRing({
  axis, plane, centre, springY, r, n = 9, ringT = 0.32, depth = 0.26, facing = 1,
  name = 'voussoir',
}) {
  const out = [];
  const rMid = r + ringT / 2;
  // Bites 0.10 into the wall and stands the rest proud, so the stones are keyed in rather than
  // stuck on and the joint shadows fall on masonry.
  const p = plane + facing * (depth / 2 - 0.10);
  const stoneW = (Math.PI * rMid) / n + 0.04;
  for (let i = 0; i < n; i += 1) {
    const a = Math.PI * ((i + 0.5) / n);
    const ax = centre + Math.cos(a) * rMid;
    const ay = springY + Math.sin(a) * rMid;
    const tan = a - Math.PI / 2;
    out.push(axis === 'x'
      ? rotBox(depth, ringT, stoneW, p, ay, ax, { x: -tan }, `${name}-stone`)
      : rotBox(stoneW, ringT, depth, ax, ay, p, { z: tan }, `${name}-stone`));
  }
  return out;
}

/**
 * THE SPANDREL — the masonry between an arch's extrados and the band above it.
 *
 * Built as a stepped stack rather than approximated away, because the alternative is an opening
 * that is a rectangle with a curve painted over it. `k` steps a side; each block runs from the
 * arch's own half-width at the step's TOP — the narrower of its two, so no block can cut into the
 * void — out to the bay edge. The voussoir ring covers the steps on the face.
 */
function spandrelBlocks({
  axis, plane, centre, springY, r, bayHalf, thickness, k = 4, name = 'spandrel',
}) {
  const out = [];
  for (let side = -1; side <= 1; side += 2) {
    for (let j = 0; j < k; j += 1) {
      const y0 = springY + (r * j) / k;
      const y1 = springY + (r * (j + 1)) / k;
      const dy = Math.min(r, y1 - springY);
      const w = Math.sqrt(Math.max(0, r * r - dy * dy));
      const a0 = centre + side * w;
      const a1 = centre + side * bayHalf;
      const len = Math.abs(a1 - a0);
      if (len < 0.06) continue;
      const am = (a0 + a1) / 2;
      out.push(axis === 'x'
        ? slab(thickness, y1 - y0, len, plane, y0, am, `${name}-block`)
        : slab(len, y1 - y0, thickness, am, y0, plane, `${name}-block`));
    }
  }
  return out;
}

/**
 * A TILED ROOF PITCH — one plane plus its course battens.
 *
 * The Monopoly Plus villa roofs are not flat quads: every one carries visible course lines running
 * with the fall, and that is what makes a terracotta plane read as tile rather than as paint. The
 * plane is a single tilted box; the battens are thin tilted boxes standing 50 mm proud on a
 * 0.34 m course pitch, which at board altitude is two or three pixels — a tile course.
 *
 * `side` is −1 for the west pitch and +1 for the east. Everything is in the `wall` bucket, which
 * this archetype authors as terracotta.
 */
function tiledPitch({
  side, ridgeX, ridgeY, slope, halfRun, z, depth, thickness = 0.22, coursePitch = 0.34,
  battens = true, name = 'pitch',
}) {
  const out = [];
  const angle = Math.atan(slope);
  const runLen = Math.hypot(halfRun, halfRun * slope);
  const xMid = ridgeX + (side * halfRun) / 2;
  const yMid = ridgeY - (halfRun * slope) / 2;
  out.push(rotBox(runLen, thickness, depth, xMid, yMid, z, { z: -side * angle }, `${name}-plane`));
  if (!battens) return out;
  const courses = Math.max(4, Math.round(runLen / coursePitch));
  // SEATING THE BATTEN IS AN ARITHMETIC TRAP AND THE OBVIOUS FORM IS WRONG. For a plane of
  // thickness `t` tilted by `angle`, the vertical distance from its centre line to its top
  // surface AT A FIXED x is (t / 2) / cos(angle), not (t / 2) · cos(angle). At this pitch the two
  // differ by 50 mm on a 50 mm batten — i.e. the whole course buried inside the tile plane.
  const battenT = 0.07;
  const seat = (thickness / 2 + battenT / 2 - 0.012) / Math.cos(angle);
  for (let i = 0; i < courses; i += 1) {
    const t = (i + 0.5) / courses;                         // 0 at ridge, 1 at eave
    const d = halfRun * t;
    out.push(rotBox(runLen / courses - 0.055, battenT, depth - 0.02,
      ridgeX + side * d, ridgeY - d * slope + seat, z, { z: -side * angle }, `${name}-course`));
  }
  return out;
}

/** Fold one geometry list into another. */
function emitTo(into, list) {
  for (const g of list) if (g) into.push(g);
}

/* ─────────────────────────────────────── colour ────────────────────────────────────────────── */

/**
 * Re-author the palette for this archetype. §2.8: value separation before hue.
 *
 * The ladder, as authored sRGB luminance: dark iron 0.07, gravel yard 0.06, sheet olive 0.13, oak
 * 0.14, terracotta 0.17, lime render 0.34, stainless 0.47. Seven separated bands, and the three
 * that carry this subject — mid iron, warm terracotta, bright stainless — are the three furthest
 * apart.
 *
 * The terracotta is authored against the response `warehouse.js: tuneColour` measured for this
 * same bucket: rendered R ≈ 0.86·A + 56, G ≈ 0.83·A + 50, B nearly pinned near 52. So (164, 85,
 * 53) lands near a rendered (197, 121, 51) — hue 27°, the coral-red of the villa reference, and
 * the warmest plane on the lot by a wide margin.
 *
 * ── THE ROUND-1 PROGRAMME FINDING, AND IT MOVES TWO BUCKETS ─────────────────────────────────
 *
 * `mvp/_reviews/mp9/LEDGER.md` "Round 1 finding": censused on subject pixels only, our lanes
 * crush **7–13 % of the subject below luminance 12** and every Monopoly Plus frame crushes
 * 1.2–1.8 %. **There are no true blacks anywhere in the reference.** Saturation is also under —
 * ours 22–24 % against their 27–42 % — and every reference frame is warm, r − b between +23 and
 * +43. The same ledger proves it is not the rig: `international-exchange` comes out of this
 * lighting, this post chain and this time of day at 1.09 % crush.
 *
 * So the dark end of this palette is authored UP rather than down, against the bond store's own
 * near-black convention:
 *
 *   - `steel` was `#2e3430` (authored 46). It is now 72, which renders about twenty-three points
 *     higher. It carries the reveals, the catwalk, the fences, the pipework, the footing band AND
 *     — through `boardPlate` — the plate rim that frames the whole subject, so it is the single
 *     largest dark area on the lot and the one that decides the crush number.
 *   - `glass` was the shipped `#151b1f`. It carries the must stains, the bund channel and the
 *     yard's own cracks and pools, all of which are supposed to be the darkest marks on their
 *     surface — but "darkest mark" is a relative claim and it survives being lifted.
 *
 * Neither is pushed into the opposite failure the same ledger names: the terracotta, the oak and
 * the gravel hold the low-mid band, so this is a lifted floor rather than one flat albedo.
 * `wearProgram` raises `shadowFloor` on every bucket to match, which is the other half of it.
 */
function tuneColour(ctx) {
  const { p, v } = ctx;

  // Roof tile. The `wall` bucket, because it is the one masonry family whose atlas carries a fine
  // repeating course — read across a pitch in plan projection, that course IS a tile course.
  p.wall.color.set(v.pick(S.roofShift, ['#ab4f2a', '#a24827', '#b2572f', '#9a4225']));
  p.wall.needsUpdate = true;
  // Lime-washed render: hall walls, plinth, sills, coping, concrete pads, street wall. Warmer and
  // more saturated than a bond store's stone, because the ledger's saturation gap is measured on
  // the whole subject and this is the largest pale area on it.
  p.wallAlt.color.set(v.pick(S.renderShift, ['#ab8f5c', '#b39764', '#a28755']));
  p.wallAlt.needsUpdate = true;
  // The yard is gravel and dirt, not a poured slab, and it is the largest single area on the plate
  // — so it sets the plate's median almost on its own. Dark and warm, so the pale concrete pads
  // laid on it read as a second material rather than as a slightly different grey.
  p.ground.color.set(v.pick(S.groundShift, ['#4b3b24', '#524128', '#453620']));
  p.ground.needsUpdate = true;
  // Profiled sheet: the crush canopy and the chiller case. Olive rather than the shipped
  // grey-green, so the only other large sloping plane on the lot cannot be read as tile.
  p.cladding.color.set(v.pick(S.claddingShift, ['#56663a', '#4e5e34', '#5e6e42']));
  p.cladding.needsUpdate = true;
  // Stainless. The tanks are the subject and they are the brightest thing on it by design. The
  // hue is warm-neutral rather than the blue-grey a metal bucket defaults to: r − b is a graded
  // statistic on this programme and the tanks are too much of the plate to spend it cool.
  p.trim.color.set(v.pick(S.trimShift, ['#bdb3a0', '#c3b9a6', '#b7ad9a']));
  p.trim.needsUpdate = true;
  // Iron, lifted off near-black — see the round-1 finding above.
  p.steel.color.set(v.pick(S.steelShift, ['#4a4331', '#443d2d', '#514a37']));
  p.steel.needsUpdate = true;
  // The dark, wet bucket: must stains, the bund channel, the yard's cracks and standing water,
  // the oculus and sight glasses. Lifted for the same reason, and it stays the darkest thing on
  // every surface it is drawn on, which is all that mark has to be.
  p.glass.color.set(v.pick(S.glassShift, ['#2a2f2b', '#262a27', '#2f342f']));
  p.glass.needsUpdate = true;
  // Oak: barrels, hall doors, pergola beams, rafter tails, picking bins.
  p.goods.color.set(v.pick(S.goodsShift, ['#8f5f26', '#845722', '#99672b']));
  p.goods.needsUpdate = true;
  // Vine. §6C's designed-planting exemption, so a grape green rather than the weed green the rest
  // of the industrial row runs.
  p.foliage.color.set(v.pick(S.foliageShift, ['#5b8a24', '#639328', '#537f20']));
  p.foliage.needsUpdate = true;
}

/* ─────────────────────────────────────── the layout ────────────────────────────────────────── */

/**
 * Every dimension the file uses, solved once from the envelope.
 *
 * EVERYTHING STANDS ON `PLATE.rise`, NOT ON ZERO, and `g` is carried into every height below.
 * `boardPlate` lays a 0.30 m deck whose top is at 0.14; a member built at y = 0 is buried in it.
 *
 * THE PLAN IS SOLVED IN FRACTIONS OF THE LOT, NOT IN METRES. `warehouse-brick`'s envelope — which
 * this archetype aliases — is dealt as a single tile on roughly six parcels in ten, where `lotD`
 * is 15 rather than 31. A tank row authored at a fixed z stands in the roadway on those.
 */
function layout(env) {
  const g = PLATE.rise;
  const inset = env.boundaryInset;
  const halfW = env.lotW / 2 - inset;
  const halfD = env.lotD / 2 - inset;

  // The hall takes the west two thirds of the width and the far half of the depth; the tank farm
  // takes the east strip beside it. The 0.36 fraction is what leaves a bund wide enough for two
  // rows of 1.5 m vessels with a catwalk between them, AND leaves the hall's east wall far enough
  // east that the dispatcher's fascia plate at x = 0 ± 1.3 lands on masonry with a margin.
  const hallX0 = -halfW + 0.15;
  const hallX1 = halfW - Math.max(4.2, env.lotW * 0.36);
  const hallW = hallX1 - hallX0;
  const ridgeX = (hallX0 + hallX1) / 2;
  const hallZ1 = env.frontZ;                                    // front gable face — the sign plane
  const hallZ0 = Math.max(-halfD + 2.6, env.backZ - 0.6);
  const hallD = hallZ1 - hallZ0;

  const plinthTop = g + 0.62;
  const wallHead = g + 6.55;
  const eaveOver = 0.62;
  const halfRun = hallW / 2 + eaveOver;
  const ridgeY = g + 10.40;
  // Solved so the roof plane passes 0.30 m above the wall head at the wall face, then oversails.
  const slope = (ridgeY - (wallHead + 0.30)) / (hallW / 2);
  const eaveY = ridgeY - slope * halfRun;

  /* THE BUND: a kerbed concrete tray down the east flank holding two rows of vessels.
   *
   * r1 ran it the full 12.8 m of the flank and stopped 0.15 m short of the boundary. Two things
   * came back on the plate. The tank field read as a long thin ROW rather than as a field, and it
   * covered every one of the six arches on the flank — 2 500 triangles of ornament rendered
   * invisible. And the boundary fence stood hard against the outermost vessels, so the bund's own
   * kerb — the half of "cylinders in a bund" that a lane can lose by leaving it out — never
   * appeared at all. It is 10 m now, it stops 5 m short of the rear wall so the last arches read,
   * and it keeps 0.75 m of pale slab outboard of the east column. */
  const bundX0 = hallX1 + 0.55;
  const bundX1 = halfW - 0.75;
  const bundZ1 = env.frontZ - 0.40;
  const bundZ0 = Math.max(hallZ0 + 4.6, bundZ1 - 10.0);

  const yardD = Math.max(1.0, halfD - env.frontZ);

  return {
    g, inset, halfW, halfD,
    hallX0, hallX1, hallW, hallZ0, hallZ1, hallD, ridgeX,
    plinthTop, wallHead, ridgeY, eaveY, slope, halfRun, eaveOver,
    wallT: 0.55,
    /* THE OPENING HEIGHTS ARE SOLVED AGAINST THE NAME BAND AND AGAINST EACH OTHER.
     *
     * The band runs 2.74 → 4.20 so the dispatcher's plate (3.01 → 3.79) sits inside it with a
     * margin. Every arch on the gable therefore has to CROWN below 2.74 or spring above 4.20,
     * and the cart arch is the one that goes above. `sill` is a metre off the plinth on the
     * flank — §6C says "deep arched openings", and an opening that starts at chest height is a
     * window whatever shape its head is. */
    arcadeOpenW: 1.90,
    arcadeSpring: g + 2.70,
    arcadeSill: plinthTop + 0.06,
    /** The cart arch, WEST of the ridge so it clears the fascia plate's x band. */
    cartC: ridgeX - hallW * 0.155,
    cartW: 3.00,
    cartSpring: g + 3.20,
    cartSill: plinthTop + 0.04,
    /** The cellar door, east of the plate and crowning just under its sill. */
    doorC: hallX1 - 1.05,
    doorW: 1.40,
    doorSpring: g + 1.86,
    doorSill: plinthTop + 0.04,
    /** Name band: panel base, panel height, and the moulded sill and head that frame it. */
    bandBase: 2.86,
    bandH: 1.20,
    bundX0, bundX1, bundZ1, bundZ0,
    bundW: bundX1 - bundX0,
    bundD: bundZ1 - bundZ0,
    frontZ: env.frontZ,
    yardD,
    /** Crush pad, pushed forward so the cart arch is not swallowed by its canopy. */
    crushZ0: env.frontZ + Math.min(3.0, yardD * 0.25),
    crushZ1: env.frontZ + Math.min(7.0, yardD * 0.58),
    /** The cellar-door court runs from there to the street wall. */
    courtZ0: env.frontZ + Math.min(7.4, yardD * 0.62),
    /** Rainwater / wear stations, off real pier centres rather than round numbers. */
    dropFlankZ: hallZ0 + (hallZ1 - hallZ0) * 0.28,
    dropGableX: ridgeX - hallW * 0.30,
    tier: env.conditionTier ?? 'standard',
  };
}

/* ──────────────────────────────────── the barrel hall ──────────────────────────────────────── */

/**
 * AN ARCADE — a real punched skin, not a wall with dark cards on it.
 *
 * Piers between the openings, a continuous sill band under them, a stepped spandrel above, and a
 * voussoir ring on the face. The reveal is the masonry's own 0.55 m, so the opening is a HOLE with
 * thickness in it — §2.3's whole clause, and the cheapest quality on this building per triangle.
 *
 * The helper builds the WALL as well as the openings, so a caller must not also lay a slab across
 * the same run: two coplanar faces in one bucket z-fight, and on the gable that would flicker
 * across the elevation the plate is graded on.
 */
function arcade(ctx, L, {
  axis = 'x', plane, a0, a1, facing = 1, bays, openW, springY, headY, baseY, sillY,
  states = null, sills = true, ring = true, name = 'arcade',
}) {
  const { p, v, mid, detail } = ctx;
  const t = L.wallT;
  const run = a1 - a0;
  const r = openW / 2;
  const n = Math.max(1, Math.min(bays, Math.floor((run - 0.55) / (openW + 0.55))));
  const pierW = (run - n * openW) / (n + 1);
  const crown = springY + r;
  const base = baseY ?? L.plinthTop;
  // `plane` is the wall's CENTRE; `face` is what a proud member is measured from. Every sill,
  // impost and voussoir below is face-relative, because on a 0.55 m wall the difference between
  // the two is the difference between ornament and no ornament.
  const face = plane + (facing * t) / 2;
  const sill = sillY ?? springY - r * 0.62;
  const wall = []; const dark = []; const stone = []; const timber = []; const iron = [];

  const put = (arr, alongMid, len, y, h) => {
    arr.push(axis === 'x'
      ? slab(t, h, len, plane, y, alongMid, `${name}-wall`)
      : slab(len, h, t, alongMid, y, plane, `${name}-wall`));
  };

  // Piers, full height. n + 1 of them, so the run starts and ends on masonry.
  for (let i = 0; i <= n; i += 1) {
    put(wall, a0 + pierW / 2 + i * (pierW + openW), pierW, base, headY - base);
  }
  // The sill band under every opening, where there is one — an opening that reaches the floor is
  // a doorway and a 0.20 m band drawn across it is a threshold nobody can walk over.
  if (sill - base > 0.14) put(wall, (a0 + a1) / 2, run, base, sill - base);
  // The band that carries the wall head over the arches. It starts AT the crown: the first draft
  // started it 0.30 m higher, which left a 0.30 m slot running the whole length of the elevation
  // with no masonry in it — a hole through the building that a triangle count cannot see.
  put(wall, (a0 + a1) / 2, run, crown - 0.02, Math.max(0.25, headY - crown + 0.02));

  for (let i = 0; i < n; i += 1) {
    const c = a0 + pierW + openW / 2 + i * (pierW + openW);
    const state = states ? states(i) : 'open';
    const revealD = 0.34;
    const rp = plane - facing * revealD;

    // The reveal: a dark board set back inside the opening, so the depth is the wall's own.
    dark.push(axis === 'x'
      ? slab(0.16, crown - sill, openW - 0.06, rp, sill, c, `${name}-reveal`)
      : slab(openW - 0.06, crown - sill, 0.16, c, sill, rp, `${name}-reveal`));

    emitTo(wall, spandrelBlocks({
      axis, plane, centre: c, springY, r, bayHalf: openW / 2 + 0.02, thickness: t,
      k: mid ? 4 : 2, name: `${name}-spandrel`,
    }));
    if (ring && mid) {
      emitTo(stone, voussoirRing({
        axis, plane: face, centre: c, springY, r, n: detail ? 7 : 5, facing,
        name: `${name}-voussoir`,
      }));
    }
    // Impost blocks — the stone the arch springs off, and what stops the ring reading as a
    // curve drawn on a rectangle.
    for (const sd of [-1, 1]) {
      stone.push(axis === 'x'
        ? slab(0.26, 0.20, 0.44, face + facing * 0.05, springY - 0.10, c + sd * (r + 0.05),
          `${name}-impost`)
        : slab(0.44, 0.20, 0.26, c + sd * (r + 0.05), springY - 0.10, face + facing * 0.05,
          `${name}-impost`));
    }
    if (sills && sill - base > 0.14) {
      stone.push(axis === 'x'
        ? slab(0.34, 0.16, openW + 0.36, face + facing * 0.02, sill - 0.16, c, `${name}-sill`)
        : slab(openW + 0.36, 0.16, 0.34, c, sill - 0.16, face + facing * 0.02, `${name}-sill`));
    }

    // What is IN the opening. Three deterministic states: a pair of iron-strapped timber doors
    // with one leaf swung, a barred vent, or an open mouth with the dark of the hall behind it.
    if (state === 'doors') {
      const swing = v.range(S.opening + i, 0.0, 0.55);
      const leafW = (openW - 0.10) / 2;
      const leafH = crown - sill - 0.10;
      for (const sd of [-1, 1]) {
        const lc = c + (sd * leafW) / 2;
        const turn = sd < 0 ? swing : 0;
        if (axis === 'x') {
          timber.push(rotBox(0.09, leafH, leafW, face - facing * 0.30, sill + leafH / 2, lc,
            { y: turn }, `${name}-leaf`));
          if (detail) {
            for (const hy of [0.28, 0.74]) {
              iron.push(slab(0.11, 0.07, leafW * 0.92, face - facing * 0.26,
                sill + leafH * hy, lc, `${name}-strap`));
            }
          }
        } else {
          timber.push(rotBox(leafW, leafH, 0.09, lc, sill + leafH / 2, face - facing * 0.30,
            { y: turn }, `${name}-leaf`));
          if (detail) {
            for (const hy of [0.28, 0.74]) {
              iron.push(slab(leafW * 0.92, 0.07, 0.11, lc, sill + leafH * hy,
                face - facing * 0.26, `${name}-strap`));
            }
          }
        }
      }
    } else if (state === 'barred' && mid) {
      const bars = 5;
      for (let b = 0; b < bars; b += 1) {
        const bc = c - openW / 2 + (openW * (b + 0.5)) / bars;
        iron.push(axis === 'x'
          ? slab(0.07, crown - sill - 0.22, 0.07, plane - facing * 0.15, sill + 0.11, bc,
            `${name}-bar`)
          : slab(0.07, crown - sill - 0.22, 0.07, bc, sill + 0.11, plane - facing * 0.15,
            `${name}-bar`));
      }
    }
  }

  ctx.push(wall, p.wallAlt);
  ctx.push(stone, p.wallAlt);
  ctx.push(dark, p.shadow);
  ctx.push(timber, p.goods);
  ctx.push(iron, p.steel);
}

/** The hall: plinth, four elevations, tiled roof, ridge lantern, gable to the street. */
function barrelHall(ctx, L) {
  const { p, v, mid, detail } = ctx;
  const g = L.g;
  const midZ = (L.hallZ0 + L.hallZ1) / 2;
  const t = L.wallT;

  /* — PLINTH. A footing course, a render base and a splayed weathering. It is what stops the wall
       meeting the gravel on a line, and it is where the lime bloom in `wearProgram` rises out of. */
  ctx.push(slab(L.hallW + 0.42, 0.30, L.hallD + 0.42, L.ridgeX, g, midZ, 'hall-footing'), p.shadow);
  ctx.push(slab(L.hallW + 0.34, L.plinthTop - g - 0.30, L.hallD + 0.34, L.ridgeX, g + 0.30, midZ,
    'hall-plinth'), p.wallAlt);
  ctx.push(slab(L.hallW + 0.20, 0.09, L.hallD + 0.20, L.ridgeX, L.plinthTop - 0.09, midZ,
    'hall-plinth-weathering'), p.wallAlt);

  /* — EAST FLANK: the arcade. Deep round-arched openings, and the elevation that carries this
       building's identity from the three-quarter station. — */
  arcade(ctx, L, {
    axis: 'x', plane: L.hallX1 - t / 2, facing: 1,
    a0: L.hallZ0, a1: L.hallZ1,
    bays: 6, openW: L.arcadeOpenW, springY: L.arcadeSpring, sillY: L.arcadeSill,
    headY: L.wallHead,
    states: (i) => ['doors', 'open', 'doors', 'barred', 'open', 'doors'][i % 6],
    name: 'hall-east',
  });

  /* — WEST FLANK and REAR: solid render with buttresses. The camera station never reaches them,
       so they are built honestly and cheaply; the budget goes on the two graded elevations. — */
  ctx.push(slab(t, L.wallHead - L.plinthTop, L.hallD, L.hallX0 + t / 2, L.plinthTop, midZ,
    'hall-west-wall'), p.wallAlt);
  ctx.push(slab(L.hallW, L.wallHead - L.plinthTop, t, L.ridgeX, L.plinthTop, L.hallZ0 + t / 2,
    'hall-rear-wall'), p.wallAlt);
  if (mid) {
    const buttresses = 5;
    for (let i = 0; i < buttresses; i += 1) {
      const bz = L.hallZ0 + (L.hallD * (i + 0.5)) / buttresses;
      ctx.push(slab(0.34, L.wallHead - L.plinthTop - 0.55, 0.62, L.hallX0 - 0.09, L.plinthTop, bz,
        'hall-west-buttress'), p.wallAlt);
      ctx.push(slab(0.44, 0.12, 0.72, L.hallX0 - 0.11, L.wallHead - 0.66, bz,
        'hall-west-buttress-cap'), p.wallAlt);
    }
  }

  /* — THE STREET GABLE. It is built as three runs so nothing is coplanar with anything else: the
       cart arcade in the west, the door arcade in the east, and a solid panel between them that
       carries the name band the dispatcher's fascia plate lands on. — */
  const gz = L.hallZ1;
  const gp = gz - t / 2;
  const cartA0 = L.cartC - L.cartW / 2 - 0.62;
  const cartA1 = L.cartC + L.cartW / 2 + 0.62;
  const doorA0 = L.doorC - L.doorW / 2 - 0.60;
  const doorA1 = L.hallX1;

  ctx.push(slab(cartA0 - L.hallX0, L.wallHead - L.plinthTop, t,
    (L.hallX0 + cartA0) / 2, L.plinthTop, gp, 'hall-gable-west'), p.wallAlt);
  ctx.push(slab(doorA0 - cartA1, L.wallHead - L.plinthTop, t,
    (cartA1 + doorA0) / 2, L.plinthTop, gp, 'hall-gable-centre'), p.wallAlt);
  ctx.push(gableEnd(L.hallW, t, L.ridgeX, L.wallHead, L.ridgeY - 0.16, gp, 0, 'hall-gable'),
    p.wallAlt);

  arcade(ctx, L, {
    axis: 'z', plane: gp, facing: 1, a0: cartA0, a1: cartA1,
    bays: 1, openW: L.cartW, springY: L.cartSpring, sillY: L.cartSill, headY: L.wallHead,
    states: () => 'doors', name: 'hall-cart',
  });
  arcade(ctx, L, {
    axis: 'z', plane: gp, facing: 1, a0: doorA0, a1: doorA1,
    bays: 1, openW: L.doorW, springY: L.doorSpring, sillY: L.doorSill, headY: L.wallHead,
    states: () => 'doors', name: 'hall-door',
  });

  // A lancet vent high in the gable, on the ridge line — the hall's own ferment ventilation, and
  // the thing that stops four metres of render triangle reading as a blank card.
  {
    const vw = 0.84;
    const vSpring = L.wallHead + 1.95;
    ctx.push(slab(vw + 0.40, vSpring - L.wallHead - 0.20, 0.22, L.ridgeX, L.wallHead + 0.10,
      gz - 0.03, 'hall-vent-surround'), p.wallAlt);
    ctx.push(slab(vw, vSpring - L.wallHead - 0.35, 0.16, L.ridgeX, L.wallHead + 0.25, gz + 0.01,
      'hall-vent-void'), p.shadow);
    if (mid) {
      emit(ctx, louvreScreen({
        x: L.ridgeX, y: L.wallHead + 0.95, z: gz + 0.05, width: vw, height: 1.32, facing: 1,
        blade: 0.19, name: 'hall-vent',
      }));
    }
    ctx.push(voussoirRing({
      axis: 'z', plane: gz - 0.02, centre: L.ridgeX, springY: vSpring - 0.35, r: vw / 2, n: 5,
      ringT: 0.22, depth: 0.20, facing: 1, name: 'hall-vent-arch',
    }), p.wallAlt);
  }

  // The name band: a rendered panel with a moulded head and sill, standing 60 mm proud, sized so
  // the dispatcher's 2.6 × 0.78 plate lands inside it with a margin all round.
  ctx.push(slab(3.60, L.bandH, 0.07, 0, L.bandBase, gz + 0.005, 'hall-name-band'), p.wallAlt);
  ctx.push(slab(3.88, 0.14, 0.15, 0, L.bandBase + L.bandH, gz + 0.01, 'hall-name-band-head'),
    p.wallAlt);
  ctx.push(slab(3.88, 0.12, 0.15, 0, L.bandBase - 0.12, gz + 0.01, 'hall-name-band-sill'),
    p.wallAlt);

  /* — THE RAMP AND THE STEP. Both openings now reach the plinth head rather than a chest-height
       sill, so both need something to arrive on: a stone ramp under the cart arch and a two-tread
       step at the cellar door. §2.2 — a door a person cannot reach is the same fault as a pipe
       that ends in air, and it is the fault the raised sills were hiding. — */
  ctx.push(skillion(L.cartW + 0.70, 0.15, L.cartC, gz + 0.10, L.cartSill,
    gz + 1.80, g + 0.06, 'cart-ramp'), p.wallAlt);
  for (const [w, dz, drop] of [[L.doorW + 0.70, 0.30, 0.21], [L.doorW + 1.10, 0.62, 0.42]]) {
    ctx.push(slab(w, 0.21, 0.62, L.doorC, L.doorSill - drop, gz + dz, 'door-step'), p.wallAlt);
  }

  // An oculus over the cart arch, west of the band.
  if (mid) {
    const ox = L.cartC;
    const oy = L.cartSpring + L.cartW / 2 + 0.95;
    ctx.push(cyl(0.50, 0.30, ox, oy, gz - 0.05, 'z', 'hall-oculus-void', 12), p.shadow);
    ctx.push(cyl(0.66, 0.16, ox, oy, gz + 0.06, 'z', 'hall-oculus-ring', 12), p.wallAlt);
    ctx.push(cyl(0.42, 0.06, ox, oy, gz + 0.02, 'z', 'hall-oculus-glass', 12), p.glass);
  }

  /* — THE ROOF. Two tiled pitches, a ridge run with capping tiles, barge boards on both gables,
       an eaves fascia and rafter tails. Terracotta, and the largest saturated plane on the lot. */
  const roofZ = midZ;
  const roofD = L.hallD + L.eaveOver * 2;
  for (const side of [-1, 1]) {
    ctx.push(tiledPitch({
      side, ridgeX: L.ridgeX, ridgeY: L.ridgeY, slope: L.slope, halfRun: L.halfRun,
      z: roofZ, depth: roofD, battens: mid, coursePitch: detail ? 0.34 : 0.62,
      name: `hall-roof-${side > 0 ? 'e' : 'w'}`,
    }), p.wall);
  }
  ctx.push(slab(0.46, 0.30, roofD, L.ridgeX, L.ridgeY - 0.10, roofZ, 'hall-ridge'), p.wall);
  if (detail) {
    const caps = Math.max(6, Math.round(roofD / 0.62));
    for (let i = 0; i < caps; i += 1) {
      ctx.push(cyl(0.17, 0.42, L.ridgeX, L.ridgeY + 0.20,
        roofZ - roofD / 2 + (roofD * (i + 0.5)) / caps, 'z', 'hall-ridge-cap', 8), p.wall);
    }
  }
  {
    const angle = Math.atan(L.slope);
    const runLen = Math.hypot(L.halfRun, L.halfRun * L.slope);
    for (const gzp of [L.hallZ0 - L.eaveOver, L.hallZ1 + L.eaveOver]) {
      for (const side of [-1, 1]) {
        // Top flush with the tile, hanging 0.30 below it — same seating arithmetic as the
        // battens, and −0.22 was a guess that hung the board a fifth of a metre in mid air.
        ctx.push(rotBox(runLen, 0.30, 0.16, L.ridgeX + (side * L.halfRun) / 2,
          L.ridgeY - (L.halfRun * L.slope) / 2 - 0.05, gzp, { z: -side * angle },
          'hall-barge'), p.wallAlt);
      }
    }
  }
  for (const side of [-1, 1]) {
    // The roof's underside at the eave is `eaveY − (thickness / 2) / cos(angle)`; the fascia's
    // top lands there and the board hangs 0.30 under it.
    ctx.push(slab(0.15, 0.30, roofD, L.ridgeX + side * (L.halfRun + 0.075), L.eaveY - 0.44,
      roofZ, 'hall-eaves-fascia'), p.wallAlt);
  }
  if (detail) {
    const tails = Math.max(6, Math.round(roofD / 0.90));
    for (let i = 0; i < tails; i += 1) {
      const cz = roofZ - roofD / 2 + (roofD * (i + 0.5)) / tails;
      ctx.push(box(0.68, 0.13, 0.10, L.hallX1 + 0.30, L.eaveY + 0.06, cz, 'hall-rafter-tail'),
        p.goods);
    }
  }

  /* — THE RIDGE LANTERN. A winery hall vents its ferment heat through a monitor, and on the plate
       it is the second tooth in the silhouette: a louvred box with its own tiled roof sitting on
       the ridge, which no other industrial subject on the board carries. — */
  if (mid) {
    const lanW = 1.55;
    const lanD = L.hallD * 0.50;
    const lanBase = L.ridgeY + 0.14;
    const lanH = 1.05;
    ctx.push(slab(lanW, lanH, lanD, L.ridgeX, lanBase, roofZ, 'hall-lantern-body'), p.wallAlt);
    /* `louvreScreen` BUILDS A Z-FACING SCREEN AND ONLY A Z-FACING ONE. Its blades are `width`
       along X and its jambs are boxes 0.07 wide in X at ±width/2 — `facing` only flips the blade
       tilt and the plenum's offset in Z. r1 called it for the lantern's two X faces and got two
       grey slabs flying off the ridge at right angles to the building, which is the single most
       obviously wrong thing on that plate. The lantern's own blades are built here instead, and
       the gable vent keeps the helper because that opening really is Z-facing. */
    const blades = Math.max(3, Math.round((lanH - 0.24) / 0.20));
    const louvre = [];
    for (const side of [-1, 1]) {
      const bx = L.ridgeX + side * (lanW / 2 - 0.02);
      louvre.push(slab(0.10, lanH - 0.12, 0.10, bx, lanBase + 0.06, roofZ - lanD / 2 + 0.08,
        'hall-lantern-jamb'));
      louvre.push(slab(0.10, lanH - 0.12, 0.10, bx, lanBase + 0.06, roofZ + lanD / 2 - 0.08,
        'hall-lantern-jamb'));
      for (let i = 0; i < blades; i += 1) {
        const by = lanBase + 0.12 + ((lanH - 0.24) * (i + 0.5)) / blades;
        louvre.push(rotBox(0.20, 0.035, lanD - 0.22, bx, by, roofZ, { z: side * 0.55 },
          'hall-lantern-blade'));
      }
    }
    ctx.push(louvre, p.trim);
    // A plenum behind the blades, so the lantern reads as an opening rather than as a slatted box.
    ctx.push(slab(lanW - 0.30, lanH - 0.20, lanD - 0.26, L.ridgeX, lanBase + 0.10, roofZ,
      'hall-lantern-plenum'), p.shadow);
    // The lantern roof's EAVE has to land on the lantern's head, not its ridge — r1 solved the
    // ridge height and let the pitch float a third of a metre clear of the box below it.
    const lanHalfRun = lanW / 2 + 0.32;
    const lanSlope = 0.78;
    const lanRidgeY = lanBase + lanH + 0.06 + lanHalfRun * lanSlope;
    for (const side of [-1, 1]) {
      ctx.push(tiledPitch({
        side, ridgeX: L.ridgeX, ridgeY: lanRidgeY, slope: lanSlope, halfRun: lanHalfRun,
        z: roofZ, depth: lanD + 0.34, thickness: 0.16, battens: false,
        name: 'hall-lantern-roof',
      }), p.wall);
    }
    ctx.push(slab(0.30, 0.20, lanD + 0.34, L.ridgeX, lanRidgeY - 0.06, roofZ,
      'hall-lantern-ridge'), p.wall);
  }

  /* — RAINWATER. The gutter runs the east eaves and the pipe lands on the bund kerb, which is a
       real place for it to land (§2.2) rather than in the gravel. — */
  // `gutterAndDownpipe` ties its collars back in Z whatever the run's axis, so `wallPlane` is
  // always a Z coordinate — passing the wall's X here builds a four-metre tie across the yard.
  // On a Z-axis run the pipe is already on the drop line, so the plane IS the drop.
  // `drain: false` because its own surround is laid at absolute y = 0, which on this subject is
  // 0.14 m under the plate deck; the bund has a real sump instead.
  emit(ctx, gutterAndDownpipe({
    x: L.ridgeX + L.halfRun + 0.25, y: L.eaveY - 0.30, z: roofZ, runLength: roofD, axis: 'z',
    dropAt: L.dropFlankZ, wallPlane: L.dropFlankZ, facing: 1, landingY: L.g + 0.50,
    drain: false, name: 'hall-rainwater',
  }));
  void v;
}

/* ────────────────────────────────────── the tank farm ──────────────────────────────────────── */

/**
 * ONE FERMENTATION VESSEL.
 *
 * A stainless tank is not a cylinder: it is a cylinder on legs with a dished bottom, a shallow
 * conical top, a glycol jacket band, a man-way, a sight glass and a sample valve, and every one of
 * those is a value break on a body that is otherwise one flat tone. The jacket rides `steel` and
 * the sight glass rides `glass`, so one vessel carries three of the nine buckets — which is what
 * stops ten of them reading as ten grey poles.
 *
 * ── r1 PLATE READ: THE FIRST SET WERE SILOS, AND THE FAULT IS THE CONE ────────────────────────
 *
 * r1 gave every vessel a 0.72–0.78 m cone tapering to r · 0.22 — a sharp point almost a fifth of
 * the body's height — on a body 1.5 m across. Opened at full size, the row reads as a line of
 * grain silos or, worse, of bottles: the eye takes a tall narrow cylinder under a sharp cone as
 * STORAGE, which is exactly the read the grain-yard lane two doors down is supposed to own.
 *
 * A fermenter's top is a SHALLOW cone to a wide flat manway platform with a rail round it, and its
 * body is proportionally taller. So the cone is 0.32 m to r · 0.62 — a lid rather than a spire —
 * the rim is a real ring, the tall class gains a metre of body, and the whole vessel gains a dark
 * skirt at the legs so it is planted on the bund rather than hovering over it.
 */
function tank(ctx, { x, z, g, r, bodyH, coneH, legH, tall = false, name = 'tank' }) {
  const { p, detail } = ctx;
  const steel = []; const shell = []; const dark = []; const stone = [];
  const seg = detail ? 14 : 10;

  // Legs on pads. A vessel that meets the slab on a cylinder is a bin, not a tank.
  for (let i = 0; i < 4; i += 1) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const lx = x + Math.cos(a) * r * 0.76;
    const lz = z + Math.sin(a) * r * 0.76;
    steel.push(slab(0.10, legH, 0.10, lx, g, lz, `${name}-leg`));
    stone.push(slab(0.28, 0.06, 0.28, lx, g, lz, `${name}-leg-pad`));
  }
  const bottomY = g + legH;
  shell.push(taper(r * 0.34, r, 0.44, x, bottomY, z, `${name}-dish`, seg));
  const bodyY = bottomY + 0.44;
  shell.push(cyl(r, bodyH, x, bodyY + bodyH / 2, z, 'y', `${name}-body`, seg));
  // The glycol jacket: a dark band two thirds up, the member that says what the vessel is for,
  // and the thing that breaks a four-metre column of one value into two.
  steel.push(cyl(r + 0.022, 0.84, x, bodyY + bodyH * 0.64, z, 'y', `${name}-jacket`, seg));
  const topY = bodyY + bodyH;
  // The lid, not a spire. A wide shallow cone to a flat manway deck with a rim ring on it.
  shell.push(taper(r, r * 0.62, coneH, x, topY, z, `${name}-cone`, seg));
  shell.push(cyl(r * 0.66, 0.09, x, topY + coneH + 0.045, z, 'y', `${name}-top-deck`, seg));
  steel.push(cyl(r * 0.70, 0.05, x, topY + coneH + 0.11, z, 'y', `${name}-rim-ring`, seg));
  shell.push(cyl(r * 0.24, 0.15, x, topY + coneH + 0.16, z, 'y', `${name}-hatch`, 8));
  steel.push(cyl(r * 0.29, 0.045, x, topY + coneH + 0.25, z, 'y', `${name}-hatch-lid`, 8));
  // A dark skirt round the legs. Without it a vessel on four 100 mm posts hovers, and ten of them
  // hovering is the difference between a tank farm and a row of bollards with hats on.
  steel.push(cyl(r * 0.92, 0.13, x, g + 0.07, z, 'y', `${name}-skirt`, seg));
  if (tall) {
    // A safety hoop round the manway on the tall class only, so the two heights differ in
    // silhouette detail as well as in height.
    for (let i = 0; i < 4; i += 1) {
      const a = (i * Math.PI) / 2 + 0.4;
      steel.push(slab(0.05, 0.72, 0.05, x + Math.cos(a) * r * 0.60, topY + coneH + 0.09,
        z + Math.sin(a) * r * 0.60, `${name}-hoop-post`));
    }
    steel.push(cyl(r * 0.63, 0.05, x, topY + coneH + 0.78, z, 'y', `${name}-hoop`, seg));
  }

  if (detail) {
    // Man-way, sight glass and sample valve on the east face, which is the face the camera sees.
    dark.push(slab(0.14, 0.50, 0.42, x + r - 0.02, bodyY + 0.52, z, `${name}-manway`));
    steel.push(cyl(0.08, 0.10, x + r + 0.08, bodyY + 0.77, z, 'x', `${name}-manway-dog`, 6));
    ctx.push(slab(0.06, bodyH * 0.44, 0.12, x + r + 0.01, bodyY + 0.28, z + r * 0.44,
      `${name}-sight-glass`), p.glass);
    steel.push(cyl(0.05, 0.30, x + r + 0.13, bottomY + 0.28, z, 'x', `${name}-outlet`, 6));
    steel.push(cyl(0.14, 0.04, x + r + 0.29, bottomY + 0.28, z, 'x', `${name}-hand-wheel`, 8));
    // A chalked lot card on the shoulder — the winery's own storytelling, at one quad.
    stone.push(slab(0.02, 0.24, 0.32, x + r + 0.012, bodyY + bodyH * 0.82, z - r * 0.32,
      `${name}-lot-card`));
  }
  ctx.push(shell, p.trim);
  ctx.push(steel, p.steel);
  ctx.push(dark, p.shadow);
  ctx.push(stone, p.wallAlt);
}

/**
 * THE TANK FARM — a bunded slab, twelve vessels in two rows, a catwalk between them, ladders, the
 * glycol ring main, the hose drops and the chiller skid the main comes off.
 *
 * §6C: "Nothing else on the board is a field of cylinders in a bund." The bund is the half of that
 * a lane can lose by leaving it out — a tank on open gravel is a farm water tank; a tank in a
 * kerbed tray that falls to a sump is a winery.
 */
function tankFarm(ctx, L) {
  const { p, v, mid, detail } = ctx;
  const g = L.g;
  const cx = (L.bundX0 + L.bundX1) / 2;
  const cz = (L.bundZ0 + L.bundZ1) / 2;

  /* — THE BUND. A pale concrete tray with a 0.34 m upstand kerb all round, a channel down the
       middle and a sump grate at the street end. A bund that drains nowhere is a tray. — */
  ctx.push(slab(L.bundW, 0.16, L.bundD, cx, g, cz, 'bund-slab'), p.wallAlt);
  for (const [w, d, bx, bz] of [
    [L.bundW, 0.28, cx, L.bundZ0 + 0.14],
    [L.bundW, 0.28, cx, L.bundZ1 - 0.14],
    [0.28, L.bundD, L.bundX0 + 0.14, cz],
    [0.28, L.bundD, L.bundX1 - 0.14, cz],
  ]) {
    ctx.push(slab(w, 0.34, d, bx, g + 0.16, bz, 'bund-kerb'), p.wallAlt);
    ctx.push(slab(w + 0.05, 0.045, d + 0.05, bx, g + 0.50, bz, 'bund-kerb-cap'), p.shadow);
  }
  ctx.push(slab(0.32, 0.025, L.bundD - 0.8, cx, g + 0.155, cz, 'bund-channel'), p.glass);
  emit(ctx, serviceGrate(ctx, {
    x: cx, z: L.bundZ1 - 0.85, y: g + 0.17, width: 0.70, depth: 0.56, salt: S.services + 1,
    name: 'bund-sump',
  }));

  /* — THE VESSELS. Two rows of six. Height class comes off a deterministic pick rather than off
       `i % 2`, because a strict alternation reads as a pattern and an uneven one reads as a
       working cellar that has been added to twice. — */
  const rows = 5;
  const r = Math.max(0.42, Math.min(0.82, (L.bundW - 1.30) / 4.6));
  const colX = [cx - L.bundW * 0.25, cx + L.bundW * 0.25];
  const pitchZ = (L.bundD - 1.4) / rows;
  const legH = 0.72;
  const shortTop = 0.16 + legH + 0.44 + 2.42 + 0.32 + 0.20;
  for (let c = 0; c < 2; c += 1) {
    for (let i = 0; i < rows; i += 1) {
      const tz = L.bundZ0 + 0.70 + pitchZ * (i + 0.5);
      const tall = v.chance(S.tank + c * 8 + i, 0.55);
      tank(ctx, {
        x: colX[c], z: tz, g: g + 0.16, r, tall,
        // The tall class tops out near 6.3 m against the short class's 4.1. Two heights is a §6C
        // requirement and it is also the only thing that gives the field a stepped top edge
        // instead of a fence-like one; a 0.7 m difference would not have been visible.
        bodyH: tall ? 4.55 : 2.42,
        coneH: 0.32,
        legH,
        name: `tank-${c}${i}`,
      });
    }
  }

  /* — THE CATWALK between the rows, at short-tank hatch height, handrailed both sides, with a
       stair down at the street end and a caged ladder at the back. It is what makes twelve
       vessels read as one plant rather than as twelve objects, and it is the horizontal that ties
       the field together in the plate. — */
  const walkY = g + shortTop + 0.10;
  const walkZ0 = L.bundZ0 + 0.85;
  const walkZ1 = L.bundZ1 - 1.55;
  const walkD = walkZ1 - walkZ0;
  const walkC = (walkZ0 + walkZ1) / 2;
  const gap = Math.max(0.46, (colX[1] - colX[0]) - 2 * r - 0.10);
  const deckW = Math.min(1.00, gap);
  const steel = [];
  steel.push(slab(deckW, 0.09, walkD, cx, walkY, walkC, 'catwalk-deck'));
  if (mid) {
    const planks = Math.max(4, Math.round(walkD / 0.55));
    for (let i = 0; i < planks; i += 1) {
      steel.push(slab(deckW - 0.04, 0.03, 0.09, cx, walkY + 0.09,
        walkZ0 + (walkD * (i + 0.5)) / planks, 'catwalk-plank'));
    }
  }
  const posts = Math.max(3, Math.round(walkD / 1.75));
  for (const side of [-1, 1]) {
    const px = cx + (side * deckW) / 2;
    for (let i = 0; i <= posts; i += 1) {
      steel.push(slab(0.055, 1.05, 0.055, px, walkY + 0.09, walkZ0 + (walkD * i) / posts,
        'catwalk-post'));
    }
    steel.push(slab(0.065, 0.065, walkD, px, walkY + 1.09, walkC, 'catwalk-rail'));
    steel.push(slab(0.045, 0.045, walkD, px, walkY + 0.62, walkC, 'catwalk-midrail'));
    steel.push(slab(0.04, 0.12, walkD, px, walkY + 0.10, walkC, 'catwalk-toeboard'));
  }
  for (let i = 0; i <= posts; i += 1) {
    const bz = walkZ0 + (walkD * i) / posts;
    steel.push(slab(deckW + 0.22, 0.11, 0.11, cx, walkY - 0.11, bz, 'catwalk-bearer'));
    if (i % 2 === 0) {
      steel.push(slab(0.09, walkY - g - 0.27, 0.09, cx, g + 0.16, bz, 'catwalk-stanchion'));
    }
  }
  ctx.push(steel, p.steel);
  // THE STAIR GOES TO THE REAR AND THE LADDER TO THE FRONT, WHICH IS THE OPPOSITE OF r1. An
  // `externalStair` is a diagonal object about three metres long, and at the bund's street end it
  // landed across the forecourt as a set of raking grey sticks in front of the crush pad — the
  // loudest thing in the near half of the r1 plate and the least legible. A caged ladder at the
  // front is vertical, reads as plant, and costs a third of the pixels.
  emit(ctx, externalStair({
    x: cx, z: walkZ0 - 0.06, yBase: g + 0.16, yTop: walkY, width: 0.90, facing: -1,
    name: 'catwalk-stair',
  }));
  emit(ctx, ladderCaged({
    x: cx, z: walkZ1 + 0.10, yBase: g + 0.16, yTop: walkY + 0.85, width: 0.42, facing: 1,
    name: 'tank-ladder',
  }));

  /* — THE GLYCOL RING MAIN AND THE HOSE DROPS. §6C asks for "a manifold of hose lines and glycol
       pipework", and a pipe that starts nowhere is the construction-logic fault §2.2 names. This
       one starts at the chiller skid, runs the length of the bund on brackets off the hall wall,
       and laterals across to each vessel. — */
  if (mid) {
    const pipeY = g + 2.30;
    const px = L.hallX1 + 0.26;
    for (const [dy, rad, nm] of [[0, 0.10, 'glycol-flow'], [-0.32, 0.085, 'glycol-return']]) {
      emit(ctx, pipeRun({
        // `pipeRun` takes `{x, y, z}` vertices, not tuples — a tuple polyline builds a run of
        // NaN-length cylinders and three.js only says so on `computeBoundingBox`.
        points: [
          { x: px, y: pipeY + dy, z: L.bundZ1 - 1.1 },
          { x: px, y: pipeY + dy, z: L.bundZ0 + 0.7 },
        ],
        radius: rad, bracketTo: 'x', bracketPlane: L.hallX1, name: nm,
      }));
    }
    const drops = [];
    for (let i = 0; i < rows; i += 1) {
      const dz = L.bundZ0 + 0.70 + pitchZ * (i + 0.5);
      drops.push(cyl(0.05, pipeY - g - 1.05, px, g + 0.90, dz, 'y', 'glycol-drop', 6));
      const lx0 = px;
      const lx1 = colX[0] - r;
      drops.push(cyl(0.045, Math.max(0.2, lx1 - lx0), (lx0 + lx1) / 2, g + 1.32, dz, 'x',
        'glycol-lateral', 6));
    }
    ctx.push(drops, p.steel);

    // The chiller skid the main comes off: a louvred case on a pad at the hall's front corner.
    const skX = L.hallX1 + 0.90;
    const skZ = L.bundZ1 - 0.60;
    ctx.push(slab(1.44, 0.20, 1.06, skX, g, skZ, 'chiller-pad'), p.wallAlt);
    ctx.push(slab(1.28, 1.30, 0.94, skX, g + 0.20, skZ, 'chiller-body'), p.cladding);
    emit(ctx, louvreScreen({
      x: skX, y: g + 0.88, z: skZ + 0.49, width: 1.06, height: 0.82, facing: 1, blade: 0.14,
      name: 'chiller',
    }));
    if (detail) {
      ctx.push(cyl(0.32, 0.09, skX, g + 1.55, skZ, 'y', 'chiller-fan', 10), p.steel);
      ctx.push(cyl(0.36, 0.06, skX, g + 1.52, skZ, 'y', 'chiller-fan-ring', 10), p.trim);
    }
  }

  // Hose bibs and a coiled hose on the bund kerb — the lot is worked, not displayed.
  if (detail) {
    for (const hz of [L.bundZ1 - 2.6, L.bundZ0 + 2.2]) {
      ctx.push(cyl(0.055, 0.52, L.bundX1 - 0.32, g + 0.60, hz, 'y', 'hose-bib', 6), p.steel);
      ctx.push(cyl(0.28, 0.15, L.bundX1 - 0.32, g + 0.24, hz + 0.42, 'y', 'hose-coil', 10),
        p.steel);
    }
  }
}

/* ─────────────────────────────────────── the crush pad ─────────────────────────────────────── */

/**
 * THE CRUSH PAD — a concrete pad under an open canopy, with the receival hopper, the press, the
 * bin stack and the channel drain that make it one. It sits forward of the cart arch rather than
 * across it, so the arch head still reads over the canopy from the three-quarter station.
 */
function crushPad(ctx, L) {
  const { p, v, mid, detail } = ctx;
  const g = L.g;
  const x0 = L.hallX0 - 0.05;
  const x1 = L.cartC + L.cartW / 2 + 0.40;
  const z0 = L.crushZ0;
  const z1 = L.crushZ1;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0;
  const d = z1 - z0;
  if (w < 2.2 || d < 2.2) return;

  ctx.push(slab(w, 0.20, d, cx, g, cz, 'crush-pad'), p.wallAlt);
  ctx.push(slab(w - 0.5, 0.025, 0.28, cx, g + 0.195, cz + d * 0.30, 'crush-channel'), p.glass);
  emit(ctx, serviceGrate(ctx, {
    x: cx + w * 0.24, z: cz + d * 0.30, y: g + 0.21, width: 0.76, depth: 0.38,
    salt: S.crush + 1, name: 'crush-grate',
  }));

  /* — THE CANOPY: six posts on base plates, a beam each way, knee braces, and a shallow mono roof
       in profiled sheet. Olive against terracotta, so the two sloping planes on this lot cannot be
       read as the same material. — */
  const postY = g + 3.30;
  const steel = [];
  const postsX = [x0 + 0.45, cx, x1 - 0.45];
  const postsZ = [z0 + 0.45, z1 - 0.45];
  for (const px of postsX) {
    for (const pz of postsZ) {
      steel.push(slab(0.16, postY - g - 0.20, 0.16, px, g + 0.20, pz, 'crush-post'));
      steel.push(slab(0.34, 0.08, 0.34, px, g + 0.20, pz, 'crush-post-plate'));
      if (mid) {
        steel.push(rotBox(0.09, 0.09, 0.74, px, postY - 0.30, pz + (pz > cz ? -0.28 : 0.28),
          { x: Math.PI / 4 }, 'crush-brace'));
      }
    }
  }
  for (const pz of postsZ) {
    steel.push(slab(w - 0.5, 0.24, 0.13, cx, postY, pz, 'crush-beam'));
  }
  for (const px of postsX) {
    steel.push(slab(0.12, 0.18, d - 0.5, px, postY + 0.24, cz, 'crush-rafter'));
  }
  ctx.push(steel, p.steel);
  /* — THE CANOPY ROOF IS TILED, NOT SHEETED, AND THAT IS AN r1 REVERSAL. —
     r1 built it as a flat olive mono in profiled sheet, with the stated reasoning that two
     sloping planes on one lot must not read as the same material. On the plate it read as a bus
     shelter: one pale flat quad, the second-largest surface in the near half, with no course, no
     fascia and no shadow line — and it spent the board's warmest, most saturated colour on
     exactly one object while the measured plate came back 24 points under the reference on
     saturation. Every Monopoly Plus villa carries a SECOND, LOWER terracotta plane beside its
     main roof, and it is most of what makes those roofs read as roofs. So the canopy takes the
     tile, gabled across the pad, and the profiled sheet keeps the chiller case where a small
     galvanised object is the truthful material anyway. */
  {
    const gableRise = 0.90;
    const roofRidgeZ = cz;
    const halfRunZ = d / 2 + 0.42;
    const angleZ = Math.atan(gableRise / halfRunZ);
    for (const side of [-1, 1]) {
      const runLen = Math.hypot(halfRunZ, gableRise);
      ctx.push(rotBox(w + 0.55, 0.16, runLen, cx,
        postY + 0.44 + gableRise / 2, roofRidgeZ + (side * halfRunZ) / 2,
        { x: side * angleZ }, 'crush-roof-plane'), p.wall);
      const courses = Math.max(3, Math.round(runLen / 0.36));
      for (let i = 0; i < courses; i += 1) {
        const t = (i + 0.5) / courses;
        ctx.push(rotBox(w + 0.55, 0.06, runLen / courses - 0.05, cx,
          postY + 0.44 + gableRise * (1 - t) + 0.11 / Math.cos(angleZ),
          roofRidgeZ + side * halfRunZ * t, { x: side * angleZ }, 'crush-roof-course'), p.wall);
      }
    }
    ctx.push(slab(w + 0.55, 0.20, 0.34, cx, postY + 0.44 + gableRise - 0.04, roofRidgeZ,
      'crush-roof-ridge'), p.wall);
    for (const side of [-1, 1]) {
      ctx.push(slab(w + 0.60, 0.26, 0.14, cx, postY + 0.30,
        roofRidgeZ + side * (halfRunZ + 0.06), 'crush-roof-fascia'), p.wallAlt);
    }
  }
  emit(ctx, gutterAndDownpipe({
    x: cx, y: postY + 0.22, z: cz + d / 2 + 0.56, runLength: w + 0.4, axis: 'x',
    dropAt: x0 + 0.45, wallPlane: cz + d / 2 + 0.11, facing: 1, landingY: g + 0.20,
    drain: false, name: 'crush-rainwater',
  }));

  /* — WHAT IS UNDER IT: a receival hopper on legs with an auger throat, a bladder press on a
       frame, and a stack of picking bins. Three objects of three shapes in three buckets. — */
  const hx = cx - w * 0.26;
  const hz = cz - d * 0.14;
  ctx.push(taper(0.34, 1.50, 1.22, hx, g + 1.02, hz, 'crush-hopper', 4), p.trim);
  ctx.push(slab(1.66, 0.13, 1.66, hx, g + 2.24, hz, 'crush-hopper-lip'), p.steel);
  for (let i = 0; i < 4; i += 1) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    ctx.push(slab(0.10, 0.82, 0.10, hx + Math.cos(a) * 0.68, g + 0.20, hz + Math.sin(a) * 0.68,
      'crush-hopper-leg'), p.steel);
  }
  ctx.push(cyl(0.19, 1.70, hx + 0.28, g + 0.70, hz + 1.20, 'z', 'crush-auger', 8), p.steel);

  const qx = cx + w * 0.25;
  const qz = cz - d * 0.10;
  ctx.push(cyl(0.62, 2.10, qx, g + 1.22, qz, 'z', 'crush-press-drum', 12), p.trim);
  ctx.push(slab(2.40, 0.20, 0.86, qx, g + 0.20, qz, 'crush-press-frame'), p.steel);
  for (const sd of [-1, 1]) {
    ctx.push(slab(0.15, 0.80, 0.82, qx + sd * 1.10, g + 0.40, qz, 'crush-press-end'), p.steel);
  }
  if (detail) {
    ctx.push(cyl(0.09, 0.55, qx + 1.30, g + 1.22, qz, 'z', 'crush-press-shaft', 8), p.steel);
    ctx.push(cyl(0.24, 0.09, qx + 1.55, g + 1.22, qz, 'z', 'crush-press-wheel', 10), p.trim);
  }

  emit(ctx, crateStack(ctx, {
    x: x0 + 1.05, z: z1 - 1.05, y: g + 0.20, columns: 2, rows: 3,
    crateW: 1.02, crateH: 0.70, crateD: 0.94, rotationY: v.range(S.crush + 3, -0.22, 0.22),
    salt: S.crush + 4, name: 'picking-bin',
  }));

  /* — THE STAIN. Purple must runs off the hopper lip and the press end, on `glass` because it is
       the only bucket genuinely darker than the pale pad and because a must stain IS dark and wet.
       Five quads, sited on the two fixtures that actually drip, with clean pad beside them. — */
  if (mid) {
    const stains = [];
    for (let i = 0; i < 5; i += 1) {
      const sw = v.range(S.crush + 10 + i, 0.55, 1.40);
      const sd = v.range(S.crush + 20 + i, 0.45, 1.15);
      const sx = (i < 3 ? hx : qx) + v.range(S.crush + 30 + i, -0.9, 0.9);
      const sz = (i < 3 ? hz : qz) + v.range(S.crush + 40 + i, 0.3, 1.5);
      stains.push(slab(sw, 0.010, sd, sx, g + 0.20, sz, 'crush-stain'));
    }
    ctx.push(stains, p.glass);
  }
}

/* ────────────────────────────────── the cellar-door court ──────────────────────────────────── */

/** A cypress: eight lobes on a vertical axis, narrowing. Eight triangles a lobe, and the darkest
 *  vertical on the lot — the reference frames put a pair either side of every entrance. */
function cypress(ctx, { x, z, y, h = 4.2, r = 0.62, salt = 0, name = 'cypress' }) {
  const { p, v } = ctx;
  const lobes = 8;
  ctx.push(cyl(0.09, 0.52, x, y + 0.26, z, 'y', `${name}-stem`, 6), p.shadow);
  for (let i = 0; i < lobes; i += 1) {
    const t = i / (lobes - 1);
    const rr = r * (1 - t * t * 0.80) * v.range(salt + i, 0.86, 1.10);
    const ly = y + 0.42 + h * (0.06 + t * 0.88);
    ctx.push(leafLobe(rr, x + v.range(salt + 40 + i, -0.08, 0.08), ly,
      z + v.range(salt + 60 + i, -0.08, 0.08), `${name}-lobe`, `${name}|${salt}|${i}`), p.foliage);
  }
}

/** A planted urn: a turned render pot on a plinth with a shrub in it. */
function urn(ctx, { x, z, y, salt = 0, name = 'urn' }) {
  const { p } = ctx;
  ctx.push(slab(0.82, 0.15, 0.82, x, y, z, `${name}-plinth`), p.wallAlt);
  ctx.push(taper(0.26, 0.42, 0.68, x, y + 0.15, z, `${name}-bowl`, 10), p.wallAlt);
  ctx.push(cyl(0.48, 0.09, x, y + 0.87, z, 'y', `${name}-rim`, 10), p.wallAlt);
  ctx.push(cyl(0.38, 0.04, x, y + 0.86, z, 'y', `${name}-soil`, 10), p.shadow);
  emit(ctx, shrubMass(ctx, {
    x, z, y: y + 0.90, h: 0.58, spread: 0.74, salt, name: `${name}-plant`,
  }));
}

/**
 * THE CELLAR-DOOR COURT — §6C's "one place on the lot where planting is designed".
 *
 * A gravel car court on a paved apron, a vined pergola set back off the gable, two planted urns
 * flanking the cellar door, a pair of cypress, bollard lamps and a barrel on end by the door. It
 * is the half of this subject that is a place rather than a plant, and every reference frame is
 * unanimous that a Monopoly Plus lot is a small scene rather than a building on a slab.
 */
function cellarCourt(ctx, L) {
  const { p, v, mid, detail } = ctx;
  const g = L.g;
  const courtZ0 = L.courtZ0;
  const courtZ1 = L.halfD - 0.55;
  const courtD = Math.min(3.2, courtZ1 - courtZ0);
  const courtC = (courtZ0 + courtZ1) / 2;

  if (courtD > 1.2) {
    ctx.push(slab(L.halfW * 2 - 1.2, 0.10, courtD, 0, g, courtC, 'court-paving'), p.wallAlt);
    if (mid) {
      const bays = 6;
      for (let i = 1; i < bays; i += 1) {
        ctx.push(slab(0.05, 0.02, courtD - 0.2,
          -L.halfW + 0.6 + ((L.halfW * 2 - 1.2) * i) / bays, g + 0.10, courtC, 'court-joint'),
        p.shadow);
      }
    }
  }

  /* — THE PERGOLA. Six posts, two beams, a rafter run and a vine over the top. It is set 1.6 m
       back off the gable, and that number is a sight line rather than a taste: at the
       three-quarter station's own elevation a vine at the gable face would clip the top corner of
       the dispatcher's fascia plate, and the plate is the one thing on this elevation a lane may
       not obstruct. — */
  const pgX0 = 0.55;
  const pgX1 = Math.min(L.bundX0 + 0.4, L.halfW - 0.6);
  const pgZ0 = L.frontZ + 1.60;
  const pgZ1 = Math.min(pgZ0 + 3.4, courtZ0 - 0.4);
  if (pgZ1 - pgZ0 > 1.4 && pgX1 - pgX0 > 1.4) {
    const beamY = g + 2.62;
    const timber = [];
    for (const px of [pgX0 + 0.18, (pgX0 + pgX1) / 2, pgX1 - 0.18]) {
      for (const pz of [pgZ0 + 0.18, pgZ1 - 0.18]) {
        timber.push(slab(0.18, beamY - g - 0.16, 0.18, px, g + 0.16, pz, 'pergola-post'));
        ctx.push(slab(0.40, 0.18, 0.40, px, g, pz, 'pergola-footing'), p.wallAlt);
      }
    }
    for (const pz of [pgZ0 + 0.18, pgZ1 - 0.18]) {
      timber.push(slab(pgX1 - pgX0 + 0.4, 0.21, 0.13, (pgX0 + pgX1) / 2, beamY, pz,
        'pergola-beam'));
    }
    const rafters = Math.max(4, Math.round((pgX1 - pgX0) / 0.58));
    for (let i = 0; i <= rafters; i += 1) {
      timber.push(slab(0.09, 0.13, pgZ1 - pgZ0 + 0.5, pgX0 + ((pgX1 - pgX0) * i) / rafters,
        beamY + 0.21, (pgZ0 + pgZ1) / 2, 'pergola-rafter'));
    }
    ctx.push(timber, p.goods);
    if (mid) {
      const stations = detail ? 26 : 12;
      for (let i = 0; i < stations; i += 1) {
        const t = (i + v.range(S.court + 100 + i, 0.1, 0.9)) / stations;
        const lx = pgX0 + (pgX1 - pgX0) * t;
        const lz = pgZ0 + (pgZ1 - pgZ0) * v.range(S.court + 140 + i, 0.10, 0.90);
        const rr = v.range(S.court + 180 + i, 0.24, 0.44);
        ctx.push(leafLobe(rr, lx, beamY + 0.32 + v.range(S.court + 220 + i, -0.04, 0.12), lz,
          'pergola-vine', `vine|${i}`), p.foliage);
      }
      for (const px of [pgX0 + 0.18, pgX1 - 0.18]) {
        ctx.push(cyl(0.07, beamY - g - 0.2, px + 0.13, g + (beamY - g) / 2, pgZ1 - 0.18, 'y',
          'vine-trunk', 6), p.shadow);
      }
    }
  }

  /* — URNS, CYPRESS, LAMPS AND THE BARREL BY THE DOOR. — */
  urn(ctx, { x: L.doorC - 1.20, z: L.frontZ + 0.80, y: g, salt: S.court + 1, name: 'urn-w' });
  urn(ctx, { x: L.doorC + 1.20, z: L.frontZ + 0.80, y: g, salt: S.court + 2, name: 'urn-e' });
  cypress(ctx, {
    x: -L.halfW + 1.20, z: courtZ0 + 0.9, y: g, h: 4.1, r: 0.60, salt: S.court + 10,
    name: 'cypress-w',
  });
  cypress(ctx, {
    x: -L.halfW + 1.55, z: courtZ1 - 1.1, y: g, h: 3.3, r: 0.50, salt: S.court + 20,
    name: 'cypress-nw',
  });
  if (mid) {
    for (const lx of [-L.halfW + 3.2, L.halfW - 2.6]) {
      bollardLight(ctx, {
        x: lx, z: courtZ0 - 0.30, y: g, h: 0.98, salt: S.court + 30, name: 'court-lamp',
      });
    }
    bollardLight(ctx, {
      x: L.doorC + 2.3, z: L.frontZ + 1.0, y: g, h: 0.98, salt: S.court + 31, name: 'court-lamp',
    });
  }
  ctx.push(cyl(0.40, 0.88, L.doorC - 2.55, g + 0.44, L.frontZ + 1.05, 'y', 'court-barrel', 12),
    p.goods);
  ctx.push(cyl(0.42, 0.05, L.doorC - 2.55, g + 0.90, L.frontZ + 1.05, 'y', 'court-barrel-head', 12),
    p.steel);
}

/* ────────────────────────────────────────── the yard ───────────────────────────────────────── */

/**
 * A CLIPPED HEDGE — the boundary the reference lots actually use, and the r1 plate's biggest
 * single fault by area.
 *
 * r1 fenced three sides in `meshPanelFence`: posts, rails and ribs, all in one near-neutral paint,
 * all of them thin. Opened at full size that is a grid of grey wire laid over the entire near half
 * and the whole east flank — a large desaturated area on a plate whose measured saturation was
 * 21.9 % against a bar of 46.4 %, and a mass of thin linework in front of the one object the lot
 * exists to show. Every Monopoly Plus frame bounds its lots with a low wall, a hedge, or both, and
 * both are SOLID and one of them is the most saturated thing in the picture.
 *
 * Two staggered rows of lobes on a soil band, on the same three-axis leaf body the trees use, at
 * eight triangles a lobe.
 */
function hedgeRun(ctx, { x0, z0, x1, z1, y, h = 0.95, w = 0.62, salt = 0, name = 'hedge' }) {
  const { p, v, mid } = ctx;
  const dx = x1 - x0; const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.8) return;
  const alongX = Math.abs(dx) >= Math.abs(dz);
  // The soil band under it, so the hedge is planted rather than sitting on the gravel.
  ctx.push(slab(alongX ? len : w, 0.10, alongX ? w : len, (x0 + x1) / 2, y, (z0 + z1) / 2,
    `${name}-bed`), p.shadow);
  if (!mid) return;
  const stations = Math.max(3, Math.round(len / 0.58));
  for (let i = 0; i < stations; i += 1) {
    const t = (i + 0.5) / stations;
    const bx = x0 + dx * t;
    const bz = z0 + dz * t;
    for (const [side, lift] of [[-1, 0.30], [1, 0.46]]) {
      const r = h * v.range(salt + i * 3 + (side > 0 ? 1 : 2), 0.42, 0.56);
      ctx.push(leafLobe(r,
        bx + (alongX ? v.range(salt + 300 + i, -0.10, 0.10) : side * w * 0.22),
        y + h * lift + v.range(salt + 600 + i * 2 + (side > 0 ? 1 : 0), -0.05, 0.09),
        bz + (alongX ? side * w * 0.22 : v.range(salt + 300 + i, -0.10, 0.10)),
        `${name}-lobe`, `${name}|${salt}|${i}|${side}`), p.foliage);
    }
  }
}

/** A row of trained vines on posts and wire — the only thing on the lot that says it is attached
 *  to a vineyard rather than to a suburb. */
function vineRow(ctx, { x0, x1, z, y, salt, name = 'vine-row' }) {
  const { p, v, mid } = ctx;
  const len = x1 - x0;
  const posts = Math.max(3, Math.round(len / 1.9));
  const steel = [];
  for (let i = 0; i <= posts; i += 1) {
    steel.push(slab(0.07, 1.58, 0.07, x0 + (len * i) / posts, y, z, `${name}-post`));
  }
  for (const wy of [0.86, 1.32]) {
    steel.push(slab(len, 0.03, 0.03, (x0 + x1) / 2, y + wy, z, `${name}-wire`));
  }
  ctx.push(steel, p.shadow);
  if (!mid) return;
  const vines = Math.max(3, Math.round(len / 1.15));
  for (let i = 0; i < vines; i += 1) {
    const vx = x0 + (len * (i + 0.5)) / vines;
    ctx.push(cyl(0.055, 0.78, vx, y + 0.39, z, 'y', `${name}-trunk`, 5), p.shadow);
    for (let k = 0; k < 3; k += 1) {
      const rr = v.range(salt + i * 5 + k, 0.32, 0.54);
      ctx.push(leafLobe(rr, vx + v.range(salt + 200 + i * 5 + k, -0.52, 0.52),
        y + 1.02 + v.range(salt + 300 + i * 5 + k, -0.14, 0.40),
        z + v.range(salt + 400 + i * 5 + k, -0.20, 0.20), `${name}-leaf`, `${name}|${i}|${k}`),
      p.foliage);
    }
  }
}

/** The lot: plate, gravel, street edge, boundary, vine row and stored goods. */
function yard(ctx, L, env) {
  const { p, v, mid, detail } = ctx;
  const g = L.g;
  const halfW = L.halfW;
  const halfD = L.halfD;

  /* — THE BOARD PLATE, FIRST AND ONCE. Every plate in `_reference-mp/` stands its subject on a
       thick base with a clean dark chamfered edge; a subject on a thin pad reads as a model on
       grey rather than as a board piece, and it is a measured blind-gate leak besides. — */
  emit(ctx, boardPlate(ctx, { width: env.lotW, depth: env.lotD, salt: S.yard }));

  /* — THE GRAVEL. `mode: 'asphalt'` suppresses the saw cuts a poured slab has and a gravel court
       does not; the patches, cracks and standing water stay, because a working winery yard is
       repaired in pieces like every other yard. The material family is unchanged — that comes
       from `MATERIAL_IDENTITY`, not from this flag. — */
  emit(ctx, hardstandSlab(ctx, {
    x: 0, z: 0, width: env.lotW - L.inset * 2, depth: env.lotD - L.inset * 2, y: g,
    mode: 'asphalt', jointPitch: 4.4, salt: S.yard + 1,
    patches: 2, cracks: 3, tidePools: 1, channelEdges: true,
  }));

  /* — THE STREET EDGE: kerb, face and footpath carried the full width of the plate, so the
       boundary line runs past the lot rather than stopping at the gate. — */
  emit(ctx, kerb(ctx, { x1: -halfW, z1: halfD, x2: halfW, z2: halfD, y: g, salt: S.yard + 2 }));
  const pathD = env.lotD / 2 - halfD;
  ctx.push(slab(env.lotW, 0.05, pathD, 0, g, (halfD + env.lotD / 2) / 2, 'street-footpath'),
    p.wallAlt);
  ctx.push(slab(env.lotW, 0.06, 0.16, 0, g - 0.02, halfD + pathD - 0.08, 'street-kerb-face'),
    p.shadow);

  /* — THE BOUNDARY. §6C: a stone wall on the street. A dwarf wall with piers and a coping, a drive
       opening, and two taller gate piers each carrying a lamp — the reference's signature entrance
       move. Mesh panel down the flanks and the rear, because a working winery secures its back the
       cheap way and the contrast between the two is the point. — */
  const gateHalf = 2.5;
  const wallY = 1.02;
  const wallZ = halfD - 0.12;
  for (const [wx0, wx1] of [[-halfW, -gateHalf], [gateHalf, halfW]]) {
    const wLen = wx1 - wx0;
    if (wLen < 0.6) continue;
    ctx.push(slab(wLen, wallY, 0.40, (wx0 + wx1) / 2, g, wallZ, 'street-wall'), p.wallAlt);
    ctx.push(slab(wLen, 0.10, 0.52, (wx0 + wx1) / 2, g + wallY, wallZ, 'street-wall-coping'),
      p.wallAlt);
    const piers = Math.max(2, Math.round(wLen / 3.2));
    for (let i = 0; i <= piers; i += 1) {
      const px = wx0 + (wLen * i) / piers;
      ctx.push(slab(0.58, wallY + 0.30, 0.58, px, g, wallZ, 'street-pier'), p.wallAlt);
      ctx.push(slab(0.70, 0.11, 0.70, px, g + wallY + 0.30, wallZ, 'street-pier-cap'), p.wallAlt);
      if (detail) {
        ctx.push(slab(0.28, 0.20, 0.28, px, g + wallY + 0.41, wallZ, 'street-pier-finial'),
          p.wallAlt);
      }
    }
  }
  for (const sd of [-1, 1]) {
    const px = sd * (gateHalf + 0.34);
    ctx.push(slab(0.70, 2.00, 0.70, px, g, wallZ, 'gate-pier'), p.wallAlt);
    ctx.push(slab(0.86, 0.13, 0.86, px, g + 2.00, wallZ, 'gate-pier-cap'), p.wallAlt);
    ctx.push(slab(0.24, 0.40, 0.24, px, g + 2.13, wallZ, 'gate-lamp-stem'), p.steel);
    ctx.push(slab(0.32, 0.34, 0.32, px, g + 2.53, wallZ, 'gate-lamp-lens'), p.trim);
    ctx.push(slab(0.40, 0.09, 0.40, px, g + 2.87, wallZ, 'gate-lamp-cap'), p.steel);
  }
  emit(ctx, industrialGate(ctx, {
    x: 0, z: wallZ, y: g, width: gateHalf * 2, height: 1.78, openFraction: 0.42,
    salt: S.yard + 3, name: 'gate',
  }));
  /* THE FLANKS ARE A DWARF WALL WITH A HEDGE ON TOP OF IT, AND THE REAR IS HEDGE ALONE.
     r1 ran `meshPanelFence` down both flanks and across the rear, and the plate is the argument:
     a grid of thin grey wire over the whole near half, in front of the tank field, on a subject
     already 24 points under the reference's saturation. A winery is bounded in stone and planting.
     Mesh survives only where a working site genuinely uses it — the service run behind the crush
     pad, where it is short and mostly hidden. */
  for (const side of [-1, 1]) {
    const fz0 = wallZ - 0.5;
    const fz1 = L.hallZ0 - 0.4;
    ctx.push(slab(0.34, 0.86, fz0 - fz1, side * halfW, g, (fz0 + fz1) / 2, 'flank-dwarf-wall'),
      p.wallAlt);
    ctx.push(slab(0.44, 0.10, fz0 - fz1, side * halfW, g + 0.86, (fz0 + fz1) / 2,
      'flank-dwarf-coping'), p.wallAlt);
    const piers = Math.max(2, Math.round((fz0 - fz1) / 4.4));
    for (let i = 0; i <= piers; i += 1) {
      const pz = fz1 + ((fz0 - fz1) * i) / piers;
      ctx.push(slab(0.52, 1.10, 0.52, side * halfW, g, pz, 'flank-pier'), p.wallAlt);
      ctx.push(slab(0.64, 0.10, 0.64, side * halfW, g + 1.10, pz, 'flank-pier-cap'), p.wallAlt);
    }
    hedgeRun(ctx, {
      x0: side * (halfW - 0.42), z0: fz1, x1: side * (halfW - 0.42), z1: fz0, y: g + 0.96,
      h: 0.86, w: 0.68, salt: S.yard + 70 + (side > 0 ? 40 : 0), name: 'flank-hedge',
    });
  }
  hedgeRun(ctx, {
    x0: -halfW + 0.5, z0: -halfD + 0.55, x1: halfW - 0.5, z1: -halfD + 0.55, y: g,
    h: 1.35, w: 0.85, salt: S.yard + 110, name: 'rear-hedge',
  });
  // The one run of mesh a working winery does have: the service line behind the crush pad.
  emit(ctx, meshPanelFence(ctx, {
    x1: -halfW + 0.4, z1: -halfD + 0.35, x2: halfW - 0.4, z2: -halfD + 0.35, y: g, height: 1.75,
    salt: S.yard + 6, name: 'rear-fence',
  }));

  /* — THE VINE ROW along the rear boundary (§6C, curtilage). — */
  if (-halfD + 1.2 < L.hallZ0 - 0.5) {
    vineRow(ctx, {
      x0: -halfW + 0.9, x1: halfW - 0.9, z: -halfD + 0.95, y: g, salt: S.vines,
      name: 'vine-rear',
    });
  }

  /* — STORED GOODS. Oak barrels are this subject's pallets: a rack of six chocked on a pad at the
       bund's front apron, with dunnage under them. — */
  {
    const bx = (L.bundX0 + L.bundX1) / 2;
    const bz = L.frontZ + 1.85;
    const barrels = []; const iron = [];
    ctx.push(slab(2.86, 0.20, 1.22, bx, g, bz, 'barrel-pad'), p.wallAlt);
    for (let row = 0; row < 2; row += 1) {
      const count = row === 0 ? 3 : 2;
      for (let i = 0; i < count; i += 1) {
        const px = bx + (i - (count - 1) / 2) * 0.86;
        const py = g + 0.62 + row * 0.78;
        barrels.push(cyl(0.39, 0.92, px, py, bz, 'z', 'barrel', 12));
        if (detail) {
          for (const hz of [-0.28, 0.28]) {
            iron.push(cyl(0.405, 0.06, px, py, bz + hz, 'z', 'barrel-hoop', 12));
          }
        }
      }
      if (row === 0) {
        for (let i = 0; i < 4; i += 1) {
          iron.push(slab(0.09, 0.22, 1.06, bx - 1.29 + i * 0.86, g + 0.20, bz, 'barrel-chock'));
        }
      }
    }
    ctx.push(barrels, p.goods);
    ctx.push(iron, p.steel);
  }
  emit(ctx, palletStack(ctx, {
    x: -halfW + 2.3, z: L.courtZ0 + 0.5, y: g, count: 4,
    rotationY: v.range(S.goods, -0.4, 0.4), salt: S.goods + 1, name: 'yard-pallets',
  }));
  emit(ctx, drumCluster(ctx, {
    x: halfW - 2.2, z: L.hallZ0 - 1.5, y: g, count: 4, salt: S.goods + 2, name: 'rear-drums',
  }));

  if (mid) {
    for (const bz of [L.bundZ1 + 0.60, L.bundZ1 + 2.20]) {
      emit(ctx, bollard(ctx, {
        x: L.bundX0 - 0.50, z: bz, y: g, salt: S.yard + 7, name: 'bund-bollard',
      }));
    }
    emit(ctx, wheelStop(ctx, {
      x: -halfW + 4.4, z: L.courtZ0 + 1.9, y: g, salt: S.yard + 8, name: 'court-stop',
    }));
  }

  /* — WEEDS. §2b's incidental planting: the fence base and the flank, and nowhere near the cellar
       door, where the planting is designed instead. — */
  emit(ctx, weedLine(ctx, {
    x1: -halfW + 0.25, z1: -halfD + 0.40, x2: halfW - 0.25, z2: -halfD + 0.40, y: g,
    density: 0.28, salt: S.yard + 9, name: 'rear-weeds',
  }));
  emit(ctx, weedLine(ctx, {
    x1: halfW - 0.28, z1: -halfD + 1.2, x2: halfW - 0.28, z2: L.bundZ0 - 0.6, y: g,
    density: 0.30, salt: S.yard + 10, name: 'flank-weeds',
  }));
  if (detail) {
    for (let i = 0; i < 6; i += 1) {
      ctx.push(grassTuft(ctx, {
        x: v.range(S.yard + 20 + i, -halfW + 0.6, halfW - 0.6),
        z: v.range(S.yard + 40 + i, -halfD + 1.6, L.hallZ0 - 0.6),
        y: g, r: 0.22, h: 0.30, salt: S.yard + 60 + i, name: 'volunteer',
      }), p.foliage);
    }
  }
}

/* ────────────────────────────────────────── the wear ───────────────────────────────────────── */

/**
 * Directed wear, per §2c: every mark sited at something that actually produces it, and clean
 * surface immediately beside dirty. §6C names three for this subject — purple stain runs at the
 * crush pad, lime bloom on the stone, clean stainless immediately beside both.
 *
 * The stain is GEOMETRY (see `crushPad`) because it is a spill on a horizontal pad and the
 * shader's marks are all vertical-face programs. Everything else is material response.
 *
 * ── `shadowFloor` IS THE OTHER HALF OF THE ROUND-1 CRUSH FIX, AND IT IS THE HALF ALBEDO CANNOT
 *    REACH ────────────────────────────────────────────────────────────────────────────────────
 *
 * `texture-atlas.js` clamps `outgoingLight = max(outgoingLight, vec3(ddIndShadowFloor))` in LINEAR
 * radiance before tone mapping, and its own note says why the uniform exists: "a face turned off
 * the key returning literally zero … a clipped wall at zero is not a shadow." The kit's default is
 * 0.050, and `palette()` then LOWERS it to 0.030 on `steel` and 0.038 on `glass` — the two buckets
 * that carry every reveal, every recess and the plate rim. That is the bond store's convention and
 * it is the wrong one for the bar: the ledger measures 1.2–1.8 % crush on every Monopoly Plus
 * frame and 7–13 % on ours, on subject pixels only.
 *
 * So every bucket states its own floor. ── r1 MEASURED THE FIRST SET AND THEY WERE FAR TOO HIGH.
 * `measure-plate.py` on `laneC-r1/winery--three-quarter.png` against `mp-villa-terracotta.png`:
 *
 *   |                       | crush% | p05  | median | p95   | sat%  | r − b |
 *   | laneC-r1              |  0.108 | 67.7 |  129.9 | 200.4 |  21.9 | +34.1 |
 *   | mp-villa-terracotta   |  1.685 | 23.6 |  117.6 | 197.2 |  46.4 | +54.8 |
 *
 * The crush target was hit forty times over and the plate landed in the OTHER failure the ledger
 * names — no dark end at all, a p05 forty-four levels above the bar. The relationship turns out to
 * be almost one to one: a floor of 0.048 linear renders at sRGB 62 before the grade's own lift, and
 * p05 came back at 67.7. So p05 IS the floor, and the floor is now solved for rather than guessed:
 * sRGB 30 is linear 0.0130, so the largest-area buckets sit at 0.013–0.019 and the darkest at
 * 0.011. That still forbids a true black — nothing can render under about sRGB 26 — which is the
 * whole of what the finding asked for.
 */
function wearProgram(ctx, L) {
  const { p, v } = ctx;
  const seed = v.unit(S.wear);

  // Terracotta: moss in the course valleys and on the up-facing ridge and barge, nothing else. A
  // tile roof does not rust and it does not chalk; what it does is grow moss on its shaded slope.
  requestWear(p.wall, {
    dropA: L.dropFlankZ, dropB: L.dropGableX,
    rustBleed: 0.08, grimeBand: 0.20, saltBloom: 0.0, chalk: 0.15, mossValley: 0.95,
    mossGain: 2.2, grimeGain: 1.0, headY: L.ridgeY, plinthY: L.eaveY, seed,
    shadowFloor: 0.019,
  });
  // Render: lime bloom rising out of the plinth, a grime band at cart height on the gable, chalked
  // lime on the sun elevation. The bloom's band is `smoothstep(plinthY + 0.30, plinthY − 0.55, y)`
  // so `plinthY` is stated ABOVE the plinth head — at the head itself the whole band sits behind
  // the stone and paints nothing, which is the fault `warehouse.js` spent two rounds finding.
  requestWear(p.wallAlt, {
    dropA: L.dropGableX, dropB: L.dropFlankZ,
    rustBleed: 0.35, grimeBand: 0.85, saltBloom: 1.0, chalk: 0.55, mossValley: 0.30,
    rustGain: 1.6, grimeGain: 2.2, saltGain: 1.8, chalkGain: 0.9,
    headY: L.wallHead - 0.20, plinthY: L.plinthTop + 1.05, seed: v.unit(S.wear + 1),
    shadowFloor: 0.018,
  });
  // Stainless: almost nothing, and that is the point — §6C asks for clean stainless immediately
  // beside the stain, so the vessels take a light grime at hose height and no rust at all.
  requestWear(p.trim, {
    dropA: L.bundZ1 - 2.0, dropB: L.bundX1 - 1.0,
    rustBleed: 0.10, grimeBand: 0.55, chalk: 0.10, saltBloom: 0.15,
    grimeGain: 1.3, headY: L.wallHead, plinthY: L.g + 1.30, seed: v.unit(S.wear + 2),
    shadowFloor: 0.021,
  });
  // Iron: the catwalk fixings, the gate, the fence line and the bund kerb bolts do rust, and they
  // are the only things on this lot that should.
  requestWear(p.steel, {
    dropA: L.bundZ0 + 2.4, dropB: L.hallX1 + 0.26,
    rustBleed: 1.0, grimeBand: 0.80, chalk: 0.15,
    rustGain: 3.0, grimeGain: 2.0, headY: L.wallHead, plinthY: L.g + 0.9,
    seed: v.unit(S.wear + 3),
    // The bucket the crush number actually lives in: reveals, recesses, the footing band and the
    // plate rim. 0.072 against the 0.030 `palette()` hands it.
    shadowFloor: 0.014,
  });
  // Gravel: the tyre scrub is the vintage run from the gate to the crush pad and the oil is where
  // the tractor stands. Both horizontal, both sited off the crush pad rather than off a dock.
  requestWear(p.ground, {
    tyreScrub: 1.0, oilBloom: 0.9, grimeBand: 0.0, saltBloom: 0.20,
    dockZ: L.crushZ1, seed: v.unit(S.wear + 4),
    // The smallest lift on the lot. The gravel is the largest area and it has to stay the low
    // value of the plate, or the whole subject flattens into the ledger's other failure.
    shadowFloor: 0.013,
  });
  // Timber: barrels and doors grey off at the top and stay dark at the hoops.
  requestWear(p.goods, {
    grimeBand: 0.55, chalk: 0.35, saltBloom: 0.0, mossValley: 0.20,
    headY: L.wallHead, plinthY: L.g + 0.6, seed: v.unit(S.wear + 5),
    shadowFloor: 0.016,
  });
  // Profiled sheet: the canopy is the one plane on the lot that is genuinely turned away from the
  // key for most of its area, so it needs the floor more than its area suggests.
  requestWear(p.cladding, {
    rustBleed: 0.75, grimeBand: 0.55, chalk: 0.55, mossValley: 0.35,
    rustGain: 2.0, headY: L.wallHead, plinthY: L.g + 1.2, seed: v.unit(S.wear + 6),
    shadowFloor: 0.017,
  });
  // The wet bucket. Its marks are supposed to be the darkest thing on whatever they are drawn on,
  // and they still are at this floor — the surfaces under them all sit well above it.
  requestWear(p.glass, {
    rustBleed: 0.20, grimeBand: 0.90, chalk: 0.0, saltBloom: 0.0, mossValley: 0.0,
    headY: L.wallHead, plinthY: L.plinthTop, seed: v.unit(S.wear + 7),
    shadowFloor: 0.011,
  });
}

/* ─────────────────────────────────────── the builder ───────────────────────────────────────── */

export function buildWinery(ctx) {
  const { env } = ctx;
  const L = layout(env);
  tuneColour(ctx);
  barrelHall(ctx, L);
  tankFarm(ctx, L);
  crushPad(ctx, L);
  cellarCourt(ctx, L);
  yard(ctx, L, env);
  wearProgram(ctx, L);
}

/** archetypeId → builder(ctx). `industrial/index.js` spreads this into `INDUSTRIAL_BUILDERS`. */
export const WINERY_BUILDERS = Object.freeze({
  winery: buildWinery,
});

export default buildWinery;
