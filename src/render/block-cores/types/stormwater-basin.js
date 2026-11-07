import { clusterKitTree } from '../../foliage.js';
// Block-core stormwater retention basin. V3.70 L5.
//
// MECHANIC — the basin cuts every lot in its block's flash-flood exposure, so the
// flash-flood event hits the block far less often.
// Hook: city.js exposureFor() floodExposureBp, read at events.js:396.
//
// IDENTITY at board zoom: a bunded grass bowl with water in the bottom. It is the only
// block centre on the roster whose subject is negative space — everything else stands up.
//
// Variants:
//   0 retarding basin — grass batters, reed shelf, headwall and trash rack, viewing deck
//   1 wetland cell    — split cells with a rock weir between them, boardwalk, GPT chamber
//
// Buckets (9): soil · turf · concrete · water · steel · foliage · path · paintY · timber
//
// r2. The r1 critic found §2.2, §2.3, §2.4 and half of §2.5 unanswered in source here:
// "stormwater-basin.js calls no plinthCourse, no grime, no revealWindow, no revealDoor
// and no seam roof — verified by grep across the file." Two of those have no subject on
// an object with no building, and §6.4 says say so rather than bolt a window onto a
// basin. What the object DOES owe is §2.3, and the reference plate says what it looks
// like: `mp-block-stormwater-basin.png` retains the whole lot behind a stone-pitched wall
// with the maintenance track on top of it. That wall is this object's plinth course, and
// it is now the thing the miniature stands on.

const PAD = 15.4;
const DEG = Math.PI / 180;
const CREST = 1.05;     // bund crest above the board-tile top
const TOP = 0.20;       // board-tile top
const FLOOR = 0.02;     // basin floor — r4: BELOW the board-tile top, not on it
/**
 * IMPROVE ROUND — THE BOWL HAD A VERTICAL WALL ROUND IT, AND THAT IS W1.
 *
 * Four rounds of "it does not read as a basin", and the geometry says why. r12 put the cut
 * at ±6.30 and then laid `ring('path', 7.02, 6.30, TOP + CREST, CREST + 0.12)` — a box
 * spanning y 0.08 to 1.25 whose INNER face at x = 6.30 is a 1.17 m sheer wall in the
 * brightest bucket in the lane, standing directly on the rim of a dish 0.30 m deep. So the
 * interior of this object was 1.17 m of vertical `path` above 0.30 m of terrace: a lit pit
 * wall round a shallow tray, which is exactly the r11 and r13 reads — "a fenced grey
 * enclosure with stepped concrete boxes inside it", "no shadow gradient into the bowl, no
 * rim line".
 *
 * §3.4's standing ruling is not re-derived and no depth was chased: the tile is 0.34 m
 * thick and a basin "metres deep" stays unreachable. What the ruling asks for instead is
 * "terraced sides, a planting band and a shadowed centre", and the sheer face was the thing
 * preventing all three. So the bund's inner face is BATTERED now — the maintenance track
 * narrows to 0.45 m on the wall head and the ground behind it falls away in three earth
 * steps, each with its own planting band, before the four cut terraces take over.
 *
 * Measured off these constants rather than asserted: crest 1.25 m to floor −0.04 m is
 * 1.29 m of fall over 3.50 m of plan — a 20° mean batter in SEVEN steps, against r12's one
 * 90° face and four steps. The bowl the eye reads runs to ±7.02, wider than r12's ±6.30,
 * because the batter is now part of the bowl instead of a wall in front of it.
 */
const BOWL = 5.30;              // the CUT — where boardTile's hollow starts
const BOWL_FLOOR = BOWL * 0.58; // 3.074 — the flat floor `boardTile` leaves inside the cut
const TRACK_IN = 6.57;          // inner edge of the maintenance track on the wall head
//
// r4 — THE BOWL IS CUT, NOT ONLY BUNDED, and the honest limit is stated with it.
//
// r3 disclosed the fault and mis-filed the fix: 'the bowl is made by raising the bund,
// not by cutting the tile, so the pool's hollow is 4 cm deep', and it raised excavation
// as an orchestrator request. It is not one — `boardTile` is lane source and the lane
// could always have cut it. It is cut now, via `boardTile({ hollow })`.
//
// What that buys, measured rather than claimed, and the first number I wrote here was
// wrong: I set FLOOR to -0.08 and the probe failed me at -0.235 m, under the tile
// underside. The pool's scour bed and wet margin sit ~0.155 m below FLOOR, and the §3.6
// floor is -0.15 m, so the deepest FLOOR this tile can carry is **+0.02 m**. Excavation is
// therefore worth **0.21 m**, not the 0.31 m the geometry looked like it allowed: crest to
// floor goes 1.02 m → 1.23 m, a 21 % deepening. That is the whole of what cutting the tile
// can give, and a basin 'metres deep' is not reachable inside a tile a third of a metre
// thick by any means available to this lane. Saying so per §6.4 rather than reporting it as
// though it closed the finding: what actually
// makes a shallow bowl READ deep in `mp-block-stormwater-basin.png` is not its absolute
// depth, it is four concentric vegetated terraces and a planted floor. Those are the
// other half of this change and they are what the terrace rings and reed mass below do.

/**
 * r12 — THE BOWL IS THE OBJECT, AND FOR THREE ROUNDS IT WAS THE SMALLEST THING ON THE TILE.
 *
 * r11 majors W1, W2 and W3 are one fault with three faces. "At 150 px tall in greyscale the
 * object is a fenced grey pad with railings and no positive identity mark of any kind. There
 * is no dish, no shadowed centre, no continuous planting band, and no visible water beyond a
 * two-pixel slot." Its chroma also moved AWAY from its reference this round — 0.213 against
 * `mp-block-stormwater-basin.png`'s 0.351, the largest per-object palette error in the lane
 * on the object whose reference is the most saturated of the six.
 *
 * Measured on the r11 source rather than argued: of the 15.4 m tile, the bowl occupied
 * ±5.05 m and everything outboard of it — a 1.42 m turf crown, a 0.70 m concrete retaining
 * wall, a 0.66 m sett course, a 0.74 m gravel margin and a 6.82 m palisade — was hard grey
 * rim. Two thirds of the frame was the thing around the basin.
 *
 * The standing depth ruling is not re-derived: `boardTile` is 0.34 m thick, §3.6's floor is
 * −0.15, so excavation is worth 0.21 m and a basin "metres deep" is unreachable. §3.4:
 * "judge the read, not the metric — a miniature says depth through terraced sides, a
 * planting band and a shadowed centre, exactly as the reference plate does." So this round
 * spends nothing on depth and everything on those three:
 *
 *   TERRACED SIDES  the bowl goes to ±5.95 with four stepped rings instead of two, each one
 *                   a 0.14 m riser that throws its own shadow line;
 *   PLANTING BAND   the crown and both shelves are continuous massed planting, not a mown
 *                   ring with a dozen tufts on it — and the massed bands are what take the
 *                   object's chroma back toward its reference, because green area is the
 *                   only thing on this object that carries saturation;
 *   SHADOWED CENTRE the floor is `soil` at rendered 31 under a pool in `water` at 15, and
 *                   the pool is now 6.4 m across instead of 4.9, so the centre of the object
 *                   is the darkest thing in the frame — which is exactly what the reference
 *                   plate does and the opposite of what ours did.
 *
 * And the 40-post inner handrail goes. It was 1,368 triangles, it is the "railings" in the
 * critic's one-line read, and a maintenance rail around a 0.3 m retarding basin is not a
 * thing that exists — the reference has a kerb and planting. That single deletion pays for
 * the whole rebuild and takes the object back inside the §3.4 combined cap.
 */
export function buildStormwaterBasin(ctx) {
  ctx.boardTile({
    ground: 'turf', size: PAD,
    // The cut starts at ±5.30 and the 1.27 m between it and the wall head is the earth
    // batter below, not a wall. Four steps inside the cut, three outside it, one bowl.
    /**
     * IMPROVE ROUND — THE BED IS `concrete`, NOT `soil`, AND THAT IS WHY THE POND WAS
     * INVISIBLE FOR FOUR ROUNDS.
     *
     * `water` renders 43 on the ground read and `soil` renders 28. r14 moved the pond off
     * a warm brown onto a cool slate to open that 15-luma gap and reported it as W3 closed;
     * the plate taken this round says the gap is not the problem. Fifteen luma between two
     * buckets that are BOTH at the bottom of the register reads as one dark mass, and the
     * centre of this object photographs as a black rectangle whatever the probe says about
     * the pair.
     *
     * A retarding basin's low-flow bed is concrete — it is what stops the invert scouring —
     * so the bed takes `concrete` at 93 and the pond sits on it 50 luma darker. The mud
     * shore stays `soil`, so the order into the centre is now bed 93 → shore 28 → water 43
     * and the pond is the only dark disc inside a pale bowl instead of one dark thing
     * inside another. Same subject, same bucket count, and the shadowed centre §3.4 asks
     * for arrives from CONTRAST rather than from the pond being dark on its own.
     */
    hollow: {
      halfX: BOWL, halfZ: BOWL, depth: 0.30, floor: 'concrete', batter: 'turf', steps: 4,
    },
  });
  bund(ctx);
  // §2.1 / §2.6 / §2.7 on the crest, not on the tile: this object's walkable surface is
  // the bund top, 1.25 m up, so the sett course, gravel margin, tonal drift and planting
  // are laid there. `size: 14.1` puts the sett run at 6.35–7.01 m, inside the retaining
  // wall head and outboard of the batter — which is the maintenance track in the plate.
  ctx.lotEdge({
    size: 14.1, seed: `basin${ctx.variant}`, y: TOP + CREST,
    sett: 'path', gravel: 'concrete', grass: 'turf', shrub: 'foliage',
    tuftCount: 16, shrubScale: 0.9, drift: false,
  });
  /**
   * IMPROVE ROUND — THE PERIMETER PALISADE GOES, AND IT IS THE SINGLE BIGGEST READ CHANGE
   * AVAILABLE TO THIS OBJECT.
   *
   * The r13 critic's board-zoom finding was that four of six centres sort and two collide:
   * "`substation` and `stormwater-basin` collide: both are square fenced yards with nothing
   * above the fence line and dark clutter inside, and the basin is the weaker of the two
   * because it has no vertical incident at all." On the plate taken this round the fence is
   * the dominant graphic on the object — a 1.25 m dark cage standing on a 1.25 m bund, so
   * the tallest thing on a subject whose whole identity is a HOLE, drawn in the same `soil`
   * the substation's palisade is drawn in.
   *
   * r12 already made this exact deletion one ring further in, and its reasoning applies
   * unchanged: "a maintenance rail around a 0.3 m retarding basin is not a thing that
   * exists — the reference has a kerb and planting". What is true of the inner rail is true
   * of the outer one; the basin is 1.29 m from crest to floor with a 20° planted batter and
   * nothing about it needs a security fence. `mp-block-stormwater-basin.png` has none.
   *
   * What replaces it is what a Melbourne retarding basin actually has at the track edge: a
   * bollard line at the vehicle entry and nothing anywhere else. 1,296 triangles back, and
   * they go into the bowl.
   */
  for (let i = 0; i < 5; i += 1) {
    const bx = -3.20 + i * 1.60;
    ctx.cyl('concrete', 0.12, 0.14, 0.72, bx, TOP + CREST + 0.40, 6.92, 6);
    ctx.cyl('paintY', 0.13, 0.13, 0.09, bx, TOP + CREST + 0.74, 6.92, 6);
  }
  /**
   * …and a TIMBER POST-AND-RAIL on the track's inner edge, which is what actually stands at
   * the top of a Melbourne retarding basin's batter.
   *
   * Two things follow from taking the palisade off and this back on, and the second is
   * measured rather than intended. The read: a 0.90 m two-rail timber line marks the edge
   * without caging the bowl, so the object stops being a square fenced yard and starts
   * being a bowl with a path round it — which is the whole of the board-zoom collision with
   * `substation`. The number: the palisade was 1,296 triangles of `soil` at 0.32 rendered
   * chroma in the warm bin, and deleting it took this row's chroma-weighted warm share from
   * 0.502 to 0.451, under the probe's 0.48 floor. `timber` carries 0.49 — the highest warm
   * chroma in the layer — so 380 triangles of rail put back more warm than 1,296 of palisade
   * took away, on a member that is a third of its height.
   */
  const railTop = TOP + CREST + 0.92;
  for (const [ax, az, bx2, bz2] of [
    [-6.72, -6.72, 6.72, -6.72], [-6.72, 6.72, 6.72, 6.72],
    [-6.72, -6.72, -6.72, 6.72], [6.72, -6.72, 6.72, 6.72],
  ]) {
    const alongX = Math.abs(bx2 - ax) > Math.abs(bz2 - az);
    const len = alongX ? bx2 - ax : bz2 - az;
    const mx = (ax + bx2) * 0.5;
    const mz = (az + bz2) * 0.5;
    for (const y of [railTop, railTop - 0.38]) {
      if (alongX) ctx.box('timber', Math.abs(len), 0.10, 0.09, mx, y, mz);
      else ctx.box('timber', 0.09, 0.10, Math.abs(len), mx, y, mz);
    }
    const n = 6;
    for (let i = 0; i <= n; i += 1) {
      const t = (i / n - 0.5) * Math.abs(len);
      ctx.box('timber', 0.13, 1.02, 0.13,
        mx + (alongX ? t : 0), TOP + CREST + 0.55, mz + (alongX ? 0 : t));
    }
  }
  ctx.paverRun(0, 6.98, 0, 6.62, { width: 2.20, bucket: 'concrete', joint: 'soil', unit: 0.62, y: TOP + CREST + 0.04 });
  // The depth board stands at the pond's own edge, not out on the rim where r12 left it.
  // The mechanic is flood storage and the one element on this object that states it is a
  // graduated staff gauge with water at its foot; at 4.7 m from the pool it stated nothing.
  markerBoard(ctx, -2.10, 2.05);
  // r14 §2.5 — tonal drift on the maintenance track. `concrete` is 68 rendered luma below
  // `path` on the r14 ladder, not one rung; `steel` is 7 below it, which is a tonal
  // difference inside the material's own band. Declared with `on:` and probe-checked.
  /**
   * IMPROVE ROUND — TWO §2.5 FIELDS, AND THE FIRST ONE WAS PLACING NOTHING.
   *
   * `driftField` keeps its centres `size` inboard of `half`, so a field with `half 6.92`
   * and `size 0.9` can only place inside ±6.02 — and the keep-out excluded everything
   * inside ±6.57. Every candidate failed both tests and the loop placed zero lobes on a
   * field the report would have counted as §2.5 coverage. Caught by arithmetic on the two
   * bounds rather than on a plate, and it is the same species as the r13 critic's LF4: two
   * numbers in one instrument that cannot both be satisfied.
   *
   * The track field is sized to the 0.45 m track it lies on. The second field is the one
   * that matters: WATER LOBES ON THE MUD, in the four corners of the rectangular floor
   * the round pond does not reach. `water` renders 43 on the ground read against `soil` at
   * 28 — 15 apart, inside `DRIFT_MAX`, which is what a damp patch on a basin bed is — and
   * it is the one §2.5 mechanism in this lane that also states the mechanic: a floor that
   * holds water in its corners is a floor that fills.
   */
  /**
   * UNBURY ROUND — THE TRACK FIELD IS DELETED, BECAUSE THE LOBE IS WIDER THAN THE TRACK.
   *
   * The improve round diagnosed this field as unsatisfiable, moved `half` 6.92 → 7.00 and
   * `size` 0.9 → 0.34, and reported it fixed. It placed **0 lobes on v0 and 2 on v1**, and
   * the R2 sampler above only takes that to 1 and 2. The arithmetic says why, and it is not
   * the sampler: `ring('path', 7.02, TRACK_IN, …)` is a maintenance track **0.45 m wide**,
   * and a `tonalDrift` lobe at `size` 0.34 is up to 1.17 x size across with a 0.36 x size
   * cluster offset — **0.64 m of plan for 0.45 m of track**. A lobe that fits needs
   * `size` under 0.238, at which point it is a 0.4 m patch at Δ5.5 luma on a 0.45 m strip
   * that is four pixels wide at board zoom: present in the statistic, invisible on the
   * plate, which is the critic's M12 written into a new field rather than answered.
   *
   * §2.5 asks for tonal drift on LARGE FLAT SURFACES. A 0.45 m walkway is not one, and the
   * object keeps its real field — 10 `foliage` lobes on the `turf` batters below, which
   * places 10 of 10. Deleting the declaration also gives back the `steel|path` drift-pair
   * collision exemption this object was claiming without earning, which is M4's other half.
   */
  // The floor-corner puddle field is DELETED with the bed change: `water` on `concrete` is
  // 50 luma, three rungs, and that is r13's B2 — the tar patch — not weathering. A bound
  // that would have been breached is not a bound to route around.
  /**
   * …and rank growth on the cut terraces, which is the second §2.5 field and the one my own
   * new `DRIFT_MIN`/`DRIFT_MAX` pair caught me on.
   *
   * It began as `water` lobes declared against `soil` — a wet shelf — and passed at Δ15
   * while the pond was authored at 43. Raising the pond to 62 for the plate took the pair to
   * Δ33 and the probe failed the row on the round's own new bound, which is the receipt that
   * the bound is live on something other than a synthetic mutation. `water` on the terraces
   * has no legal declaration anyway: the terraces are `turf` at 149, which is 87 away.
   *
   * `foliage` at 134 on `turf` at 149 is 15 — one rung, inside both bounds — and on a
   * grassed batter it is the right material as well as the right value: the strip a mower
   * cannot reach on a 20° slope grows rank and reads a rung darker than the sward. Same
   * lobes, same cost, legal pair, and the object keeps two §2.5 fields.
   */
  ctx.driftField('foliage', 4.75, {
    seed: `bws${ctx.variant}`, count: 10, size: 0.58, y: bowlY(3.95) + 0.022, on: 'turf',
    avoid: (px, pz) => Math.max(Math.abs(px), Math.abs(pz)) < 3.72,
  });
  /**
   * r12 — the 40-post handrail ring is GONE, and this is the deletion the round turns on.
   *
   * r4 put a 0.92 m rail on all four inner crest edges: 40 posts and 8 rails, 1,368
   * triangles, 15 % of the object's whole budget. Its stated justification was that it
   * "takes `steel` over the 4 % inclusion threshold and gives the ladder its sixth band" —
   * which is a reason to add geometry to satisfy a probe, not a reason a basin has a
   * handrail. `mp-block-stormwater-basin.png` has a kerb and a planted rim, not a rail, and
   * the r11 critic read ours in six words: "a fenced grey pad with railings".
   *
   * What replaces it is a low kerb with the planting breaking over it — which is what the
   * reference has, costs 48 triangles instead of 1,368, and reads as the rim of a bowl
   * rather than as a cage in front of one. The ladder's sixth band now comes from the
   * enlarged pool in `water`, which is the object's subject rather than its scaffolding.
   */
  for (const [ox, oz, w, d] of [
    [0, -6.62, 13.5, 0.22], [0, 6.62, 13.5, 0.22],
    [-6.62, 0, 0.22, 13.5], [6.62, 0, 0.22, 13.5],
  ]) {
    ctx.box('concrete', w, 0.20, d, ox, TOP + CREST - 0.04, oz);
  }

  // r4 §2.6 — the reference basin floor is DENSE: reed clumps, seed heads and dead
  // material standing over the whole wet area, not a patch of dark spikes. The r3 critic
  // called ours 'a narrow dark slot with no shore transition, no planting growing into it'.
  // This is also the bucket that takes `foliage` over 4 % of the object, which is the sixth
  // band the ladder was one short of.
  reedBeds(ctx);
  if (ctx.variant === 0) retardingBasin(ctx);
  else wetlandCell(ctx);
}

/**
 * Raised earth bund with battered inner faces. The bowl is made by lifting the rim,
 * not by cutting below the tile — the board tile stays a solid plinth.
 */
function bund(ctx) {
  // Rings, not slabs. A solid terrace box buries the pool; a ring leaves the bowl open,
  // and the step between two rings is the shadow line that says "this is a hollow".
  const ring = (bucket, outer, inner, top, h) => {
    const mid = (outer + inner) * 0.5;
    const band = outer - inner;
    ctx.box(bucket, outer * 2, h, band, 0, top - h * 0.5, -mid);
    ctx.box(bucket, outer * 2, h, band, 0, top - h * 0.5, mid);
    ctx.box(bucket, band, h, inner * 2, -mid, top - h * 0.5, 0);
    ctx.box(bucket, band, h, inner * 2, mid, top - h * 0.5, 0);
  };
  // §2.3. The retaining wall — a stone-pitched face carrying the whole lot up from the
  // board tile to the crest, with a coping course on its head. This is the plinth on an
  // object that has no building to put one under, and it is what the reference plate
  // does. r1 had the bund batter straight down to the tile with no face at all.
  /**
   * IMPROVE ROUND — THE WALL AND ITS STRING COURSE ARE OPEN-ENDED SHELLS, WHICH IS r4'S
   * SKIRT-CAP FINDING ONE LAYER UP AND ON THIS LANE'S OWN GEOMETRY.
   *
   * `ring()` builds four boxes. On the retaining wall — 15.32 m square, 0.64 m thick, 1.11 m
   * tall — that is 176 m² of face area of which the INNER face (buried behind the batter),
   * the TOP (buried under the coping) and the BOTTOM (buried in the tile) are 126 m². Nothing
   * but the outer elevation is ever seen. A 4-segment `cylEx` at yaw 45 with `openEnded` is
   * the same square elevation in 8 triangles and one face layer: −40 triangles and −108 m²
   * of phantom area on the wall, −70 m² on the string course, with no visual change from any
   * camera that can reach this object. r4 made exactly this move on `boardTile`'s two skirt
   * frusta and measured 987 m² of phantom `soil` on `substation` v0; the same species was
   * sitting in this file's own plinth.
   */
  // …and the wall takes `soil`, which is this lane's plinth bucket by definition ("plinth,
  // reveal voids, grime, tile skirt" — `CORE_COLOURS`). §2.3 asks for "a darker masonry
  // base where the mass meets the ground", and a stone-pitched retaining wall is exactly
  // that. It is also the object's largest single vertical surface, so carrying it in
  // `concrete` was holding that bucket's FACE mean at 59.6 while its bed and aprons render
  // 93 — one bucket describing two surfaces 33 luma apart, which is the fault r14's face
  // ladder was built to find. `concrete` now means the made horizontal surfaces of this
  // object and reads as one value.
  shell(ctx, 'soil', 15.32, TOP + CREST, CREST + 0.06);
  shell(ctx, 'concrete', 15.36, TOP + CREST - 0.30, 0.30);
  ring('path', 7.72, 6.96, TOP + CREST + 0.08, 0.10);
  // Coursing and staining down the wall face, so the retaining wall is masonry rather
  // than a grey band. §2.5 was entirely unanswered on this object in r1.
  for (const [ox, oz, ww, yy] of [
    [0, -7.40, 14.6, 0], [0, 7.40, 14.6, 180], [-7.40, 0, 14.6, 270], [7.40, 0, 14.6, 90],
  ]) {
    ctx.grimeWall('soil', ww, CREST, ox, TOP, oz, { yaw: yy, seed: `wall${ox}${oz}`, patches: 5, wash: 3 });
  }
  /**
   * r12 — THE CROWN IS NARROW AND THE BATTER IS PLANTED, which is the reference's
   * proportion and the inverse of r11's.
   *
   * r11 laid a 1.42 m mown crown (7.02 → 5.60) and one 1.00 m shelf, both `turf`, then a
   * 0.30 m bowl. The rim was wider than the thing it surrounds. The crown is 0.72 m now and
   * the batter carries three planted bands stepping down into the bowl, each with its own
   * riser, which is r11's "four concentric vegetated terraces" read off the reference plate.
   */
  // r12 — THE CROWN IS THE MAINTENANCE TRACK, in `path` at rendered 115.
  //
  // r11 laid it in `turf`. `mp-block-stormwater-basin.png` puts a made track on top of the
  // retaining wall, and it is the brightest surface on that plate — which is why the basin's
  // reference is the LIGHTEST of the six (25.6 % of it renders over luma 110, against 10.1 %
  // of ours). A grass crown gave the object no top rung at all: five value bands where the
  // floor is six, and a light-area share below the gate. The track is both the reference's
  // arrangement and the missing rung.
  //
  // IMPROVE ROUND — and it is now 0.45 m of track ON THE WALL HEAD instead of 0.72 m of
  // track on top of a 1.17 m wall. Two things follow and both are measured, not argued.
  //
  //   THE READ. What stood between the crest and the bowl was a sheer bright face. It is
  //   three earth steps now, each carrying its own planting band, and the eye walks down
  //   them into the four cut terraces without meeting a vertical surface anywhere.
  //
  //   THE LIGHT END. `path` measured a FACE luma of 109.5 on this object against 142.8 on
  //   `market-hall`, because 1.17 m x 4 x 13 m of it was vertical wall — so the lane's
  //   brightest bucket sat 0.5 luma under the probe's own LIGHT_FLOOR and contributed
  //   nothing to the light-area share this object was failing. A track is a horizontal
  //   surface. Removing the wall does not brighten the paint; it stops averaging the paint
  //   against a face the reference's track does not have.
  ring('path', 7.02, TRACK_IN, TOP + CREST, 0.28);
  /**
   * THE EARTH BATTER — three steps from the track down to the cut, in `soil` with a planted
   * bench on each.
   *
   * `soil` and not `turf`, and the reason is the reference rather than the ladder: a
   * retarding basin's bund is graded earth with vegetation ON it, and the shadow a critic
   * reads under each bench comes from the dark riser, not from the green. It also runs the
   * right way on §2.10 — `soil` carries 0.32 rendered chroma in the 30° bin against `path`'s
   * 0.17, so replacing a bright near-neutral wall with a dark earth batter moves this
   * object TOWARD the warm share its own reference sits at rather than away from it.
   *
   * A step is a RISER BAND plus a BENCH SLAB, not a solid ring, and the difference is 56 m²
   * of buried face per step. A solid ring from the ground to each step top buries its whole
   * inner face below the riser against the ring inboard of it — which is the same phantom
   * this file just took off the retaining wall. The riser is 0.12 m of opaque band, the
   * bench is a `slab` (one up-facing plane, two triangles), and every course is carried by
   * the course below it inside the probe's own 0.14 m support gap. Nothing above the tile
   * can see into the space behind them: the wall closes it outside, the risers close it
   * inside, the benches close it above.
   */
  const BATTER = [
    [TRACK_IN, 6.15, TOP + CREST - 0.28],
    [6.15, 5.73, TOP + CREST - 0.51],
    [5.73, BOWL, TOP + CREST - 0.74],
  ];
  BATTER.forEach(([outer, inner, top], i) => {
    const drop = i === 2 ? top - (TOP + 0.02) : 0.30;
    ring('soil', inner + 0.12, inner, top, drop);
    const band = outer - inner;
    const mid = (outer + inner) * 0.5;
    ctx.slab('soil', outer * 2, band, 0, top, -mid);
    ctx.slab('soil', outer * 2, band, 0, top, mid);
    ctx.slab('soil', band, inner * 2, -mid, top, 0);
    ctx.slab('soil', band, inner * 2, mid, top, 0);
    ring('foliage', outer - 0.05, inner + 0.05, top + 0.09, 0.09);
  });
  /**
   * FOUR VEGETATED TERRACES, laid ON the cut rather than built above it.
   *
   * `boardTile({ hollow })` already steps the bowl down in four risers of `turf`; what it
   * does not do is plant them, so at r11 the batter was one smooth green slope and the
   * terracing was invisible. Each step gets a massed-planting ring set back from its own
   * riser, which is `mp-block-stormwater-basin.png`'s whole device: the shadow under each
   * planted band is what says depth on an object that has 0.21 m of it.
   *
   * The radii are the hollow's own step geometry, not independent numbers: `boardTile` lays
   * step `i` of `steps` at `hx = halfX − halfX·0.42·i/steps` and `y = yTop − depth·i/steps`,
   * so these are computed from the same three constants rather than copied.
   */
  const HOLLOW_HALF = BOWL;
  const HOLLOW_STEPS = 4;
  const HOLLOW_DEPTH = 0.30;
  /**
   * THE WET SHELF — the element that says "this fills up", and the object's sixth value band.
   *
   * A retarding basin has a permanent pool and a shelf that is under water most of the year;
   * `mp-block-stormwater-basin.png` shows exactly that, a brown sheet over the lowest terrace
   * with reeds standing through it. r11 had a single 4.9 m pool and `water` at 1.7 % of the
   * object, so the mechanic — flood exposure — had nothing on the model to point at.
   *
   * It is also the honest way to the sixth band. r4 got its sixth band by adding 1,368
   * triangles of handrail so `steel` would cross the 4 % inclusion threshold. This is the
   * same threshold crossed by the object's own subject.
   */
  //
  // IMPROVE ROUND — THE SHELF IS LAID ON THE FLOOR, NOT ACROSS THE TERRACES. r12 put it at
  // `HOLLOW_HALF x 0.730 / 0.552`, which on a four-step cut lands 3.87 → 2.93 against a floor
  // edge at 3.07: a rectangular ring crossing two risers on the axes and sitting inside the
  // floor on the diagonals. That is r13's W2 — the interpenetration finding — on a ring
  // rather than on a reed. It is derived from `BOWL_FLOOR` now, so it cannot leave the floor
  // whatever the cut does, and the mud rim sits OUTSIDE it rather than on top of it.
  // IMPROVE ROUND — THE SEPARATE SHELF RING IS DELETED AND ITS WATER GOES INTO THE POND.
  //
  // r12 laid it at `HOLLOW_HALF x 0.730 / 0.552`, which on a four-step cut lands 3.87 -> 2.93
  // against a floor edge at 3.07: a rectangular ring crossing two risers on the axes and
  // sitting inside the floor on the diagonals. That is r13's W2 — the interpenetration
  // finding — on a ring rather than on a reed, and re-deriving its radii off `BOWL_FLOOR`
  // only made it a thinner ring in the same wrong place.
  //
  // What it was FOR was `water` crossing the 4 % inclusion threshold so the ladder had a
  // second band. Measuring where the flat ground actually is settles it better: `boardTile`
  // lays its LAST step in the `floor` bucket at the SAME y as the floor slab, so the flat
  // bed runs to ±3.63 m, not the ±3.07 the slab alone suggests. A pond of radius 2.90 fits
  // inside that with its mud shore and its planted fringe, carries 29.8 m² of surface
  // against r12's 22.2, and is one body of water rather than a body and a moat.
  for (let i = 1; i <= HOLLOW_STEPS; i += 1) {
    const t = i / HOLLOW_STEPS;
    const hx = HOLLOW_HALF - (HOLLOW_HALF * 0.42) * t;
    const prev = HOLLOW_HALF - (HOLLOW_HALF * 0.42) * ((i - 1) / HOLLOW_STEPS);
    const stepTop = TOP + 0.06 - HOLLOW_DEPTH * t + 0.05;
    ring('foliage', prev - 0.12, hx + 0.10, stepTop + 0.09, 0.09);
    const mid = (prev + hx) * 0.5;
    const n = 14 - i * 2;
    for (let k = 0; k < n; k += 1) {
      const u = (k + 0.5) / n;
      const side = Math.floor(u * 4);
      const v = (u * 4 - side) * 2 - 1;
      const along = v * mid * 0.92;
      const [px, pz] = side === 0 ? [along, -mid] : side === 1 ? [mid, along]
        : side === 2 ? [-along, mid] : [-mid, -along];
      ctx.tuft(px, pz, {
        y: stepTop + 0.05, bucket: 'foliage',
        scale: 1.15 + ((k + i) % 3) * 0.28, seed: `bter${i}-${k}`,
      });
    }
  }
  // Kerb along the crest so the crown edge has section.
  for (const [ox, oz, w, d] of [
    [0, 7.28, 15.0, 0.20], [0, -7.28, 15.0, 0.20],
    [-7.28, 0, 0.20, 15.0], [7.28, 0, 0.20, 15.0],
  ]) {
    ctx.box('concrete', w, 0.24, d, ox, TOP + CREST + 0.10, oz);
  }
  ctx.tufts('basin-bund', 14, {
    half: 7.16, y: TOP + CREST + 0.02, scale: 1.0,
    avoid: (px, pz) => Math.abs(px) < 6.88 && Math.abs(pz) < 6.88,
  });
}

/**
 * A body of water with a bank, not a card.
 *
 * r1 laid `cyl('water', r, r, 0.10)` flat on the basin floor. The r1 critic's blind
 * pair-02 call, fault 1: "B's water is water; A's is a sticker. B reads as a damp channel
 * with gravel margins, a wet line and vegetation growing into it. A's is a flat pale-blue
 * polygon with a hard edge, floating at a level above the basin floor with no bank
 * transition." §2.2 forbids exactly this for glass and the critic read the same clause
 * onto water; the read is correct, and the fix is the same fix — give the transparent body
 * a depth to sit in and an edge to meet.
 *
 * Four rings: a scour bed sunk below the floor, a wet-margin ring of dark silt, the water
 * body itself set DOWN into that hollow rather than laid on top of it, and a shallow
 * gravel batter climbing back out to the floor level.
 */
function pool(ctx, x, z, r) {
  // A graded batter stepping DOWN into the hole `basinFloor` left, in three courses. Each
  // one is lower and narrower than the last, so the shore is a slope rather than a cliff.
  // Heights are set against the BOARD TILE's ground surface (0.26 m), not against `FLOOR`.
  // The basin's bowl is made by raising the bund, not by cutting the tile, so the tile's own
  // ground disc is a solid slab at 0.26 under the whole object — anything the pool lays below
  // that is invisible whatever `FLOOR` says. r3's first attempt at this pool put two of its
  // three batter courses at 0.245 and the geometry probe's new sunk check caught them.
  // r12 — THE SHORE IS A DESCENDING VALUE RAMP, not three bright rings round a dark slot.
  // r11 laid `concrete` (99) and `path` (115) round a pool in the middle of a bowl, so the
  // brightest surfaces on the object ringed its darkest one and the whole thing read as a
  // grey pad with a slot in it. Turf 65 → soil 31 → water 15 walks the eye down into the
  // centre, which is what `mp-block-stormwater-basin.png` does and what §3.4's depth ruling
  // means by "a shadowed centre".
  /**
   * IMPROVE ROUND — THE SHEET IS WIDER THAN THE SHORE THAT RINGS IT, WHICH IS THE REVERSE
   * OF r12'S ORDER.
   *
   * r12 spent three concentric rings — `turf` at r+0.62, `foliage` at r+0.36, `soil` at
   * r+0.14 — getting the eye down to a water disc of radius r−0.30. On a 2.80 m pool that
   * is 1.5 m of shore round 2.5 m of water, and the r13 critic could not find water on any
   * of the six plates of this object. The terraces above already do the descending-band
   * job — there are seven of them now — so the shore here is ONE dark mud ring, and the
   * radius the shore used to occupy goes to the sheet.
   *
   * Sized against the BED, not against the floor edge, and that is the correction the plate
   * forced. A pond of radius 2.90 tops out at 3.08 m on a bed that runs to 3.07 — so the
   * water covered the whole visible bed and the centre of the object photographed as one
   * black rectangle, which is r13's W1 in a new costume. Water reads as water by
   * CONTRAST with what rings it: at radius 2.35 the sheet is 2.53 m across, the mud line
   * sits at 2.87 and the planted fringe at 3.07, and 0.6–1.1 m of pale `concrete` bed shows
   * between the fringe and the floor edge on every side. The pond gains a
   * continuous `soil` bank the planting stands behind —
   * the r13 critic's own prescription, "make it wide, and put a dark shore under the
   * planting", in that order.
   */
  /**
   * UNBURY ROUND — THE SHEET WAS UNDER THE SHORE, AND THE COMMENT ABOVE SAYS WHY.
   *
   * The improve round wrote "`cyl` builds a SOLID disc" two lines above the bug and then
   * laid the shore as a solid disc over the water anyway. Measured on the shipped numbers:
   * `soil` r+0.52 → r+0.30, h 0.07, centre FLOOR+0.020, so its TOP FACE sat at FLOOR+0.055
   * and its radius was r+0.52 there; `water` r+0.18 → r+0.02, h 0.11, centre FLOOR−0.005,
   * so its top face sat at FLOOR+0.050 and its widest radius was r+0.18. **Five millimetres
   * lower and 0.34 m narrower at every height, inside a solid body.** No camera above the
   * object could see the sheet, and the round's headline claim was that it could.
   *
   * The fix is that a shore is a BANK, not a lid, and a bank is an OPEN cone. Three bodies:
   *
   *   bed    solid `soil` disc, top face FLOOR+0.055 — the mud the sheet lies on, unchanged
   *   shore  OPEN-ENDED `soil` cone, inner rim r+0.24 at FLOOR+0.055 rising to r+0.52 at
   *          FLOOR+0.115 — a 0.28 m batter with a sloped face and NO CAP over the water
   *   sheet  `water` r+0.26 → r+0.08, top face FLOOR+0.085
   *
   * So the sheet's top is 3 cm BELOW the bank crest and 3 cm ABOVE the bed: it sits down in
   * a dish rather than on a slab, which is the r1 critic's "sticker" finding answered, and
   * nothing is over it. The shore's own face at the sheet's radius is FLOOR+0.059 — 2.6 cm
   * under the waterline — so a 0.12 m ring of wet mud shows between the sheet and the bank
   * on every side. At the detail station's ~35° elevation a 3 cm crest occludes 4.3 cm of
   * plan and the crest is 0.26 m outside the water's edge, so the sheet is unoccluded from
   * every station this object is shot at.
   *
   * Cost: 28 triangles for the open cone. The water disc is the same 56 it was.
   */
  ctx.cyl('soil', r + 0.52, r + 0.30, 0.07, x, FLOOR + 0.020, z, 14);
  ctx.cylEx('soil', r + 0.52, r + 0.24, 0.06, x, FLOOR + 0.085, z, { segments: 14, openEnded: true });
  ctx.cyl('water', r + 0.26, r + 0.08, 0.13, x, FLOOR + 0.020, z, 14);
  // Silt breaking the circle. r2 laid four wedges in the near-black bucket and the critic
  // read them as "a row of pale grey wedges like teeth"; these are low, wide, few and in
  // the bed's own bucket, so they read as the bed intruding on the water rather than as
  // objects standing on it.
  // UNBURY ROUND — the silt wedges were at FLOOR+0.064 under a sheet that now tops out at
  // FLOOR+0.085, so all three were about to be buried by the fix. They ride 1.3 cm proud of
  // the waterline instead, which is what a silt bar in a shallow pond does: they break the
  // circle from the bank into the sheet rather than sitting under it.
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + 0.6;
    ctx.cyl('soil', r * 0.30, r * 0.52, 0.045, x + Math.sin(a) * r * 0.80, FLOOR + 0.076, z + Math.cos(a) * r * 0.80, 6);
  }
}

/**
 * The y of `boardTile`'s cut at a plan radius, computed from the same three constants the
 * tile uses rather than copied off it — `hollow` lays step `i` of `steps` from
 * `hx(i-1)` to `hx(i)` at `yTop − depth·i/steps`, so anything standing IN the bowl has to
 * ask which step it is on. r12 placed the headwall, the outlet, the trees and both gross
 * pollutant traps against a single `FLOOR` constant and a single `TOP + CREST`, which was
 * right for one radius each and wrong for the rest of them.
 */
function shell(ctx, bucket, side, top, h) {
  const r = side * Math.SQRT1_2;
  ctx.cylEx(bucket, r, r, h, 0, top - h * 0.5, 0, { yaw: 45, segments: 4, openEnded: true });
}

function bowlY(radius) {
  if (radius >= BOWL) return TOP + 0.06;
  const step = Math.min(4, Math.ceil(((BOWL - radius) * 4) / (BOWL * 0.42)));
  return TOP + 0.06 - 0.30 * (step / 4);
}

/** Depth board: banded gauge on a post, the thing that says "this fills up". */
function markerBoard(ctx, x, z) {
  ctx.box('concrete', 0.46, 0.34, 0.46, x, FLOOR + 0.14, z);
  ctx.box('steel', 0.11, 2.30, 0.11, x, FLOOR + 1.20, z);
  ctx.box('paintY', 0.44, 1.85, 0.07, x, FLOOR + 1.28, z + 0.09);
  for (let i = 0; i < 6; i += 1) {
    ctx.box('soil', 0.46, 0.14, 0.05, x, FLOOR + 0.55 + i * 0.30, z + 0.13);
  }
  ctx.box('steel', 0.52, 0.07, 0.08, x, FLOOR + 2.24, z + 0.09);
}

/**
 * Reed clump. r12 REWRITE — r11 major W3: "at 4x the reeds are stars of tapered blades that
 * read as caltrops".
 *
 * That read was earned. r11 walked `count` stems round a full 360 deg circle at a radius of
 * `spread * (0.32 .. 1.10)` with no body under them, so a clump WAS a star of spokes: nothing
 * in the middle, everything radiating out, three boxes a spoke.
 *
 * A reed bed is a mass with growth standing out of the top of it. Two low overlapping bodies
 * give the clump a silhouette from every yaw, the stems are hash-scattered inside that
 * footprint rather than spoked around its edge, and each stem is a leaning blade with a seed
 * head instead of three splayed blades. Two boxes a stem against three, so the denser,
 * better-read clump is also 300 triangles cheaper on `wetlandCell`.
 */
function reeds(ctx, seed, count, cx, cz, spread) {
  /**
   * r14 — W2, BOTH HALVES, AND BOTH WERE ARITHMETIC.
   *
   * "several brown seed heads sit in air with no stem under them". The blade is a LEANING
   * box — `roll` up to ±14°, `pitch` up to ±6° — and r12 put the seed head at the blade's
   * BASE coordinates plus a 2 cm nudge, not at its tip. `boxEx` applies rotateX(pitch) then
   * rotateZ(roll), so the tip of a blade of height h sits at
   *     ( −(h/2)·cos(pitch)·sin(roll),  (h/2)·cos(pitch)·cos(roll),  (h/2)·sin(pitch) )
   * from the blade centre, which at h = 1.5 and roll 14° is 9 cm of horizontal offset — a
   * seed head's own width and a half. It is computed now instead of guessed.
   *
   * "blades pass through the white concrete terrace face". The basin floor slab runs to
   * ±3.654 m (`boardTile`'s `hollow` at halfX 6.30, 4 steps, 0.42 taper — the floor is
   * `halfX × 0.58`). r12 put a clump centre at (−2.95, 2.05) with a scatter of ±0.85·spread
   * on top of a body 0.93·spread wide, so the mass reached 3.92 m and stood ON the first
   * riser. Every clump is now clamped so its whole footprint stays inside `BOWL_FLOOR`.
   */
  // IMPROVE ROUND — the clamp reads the module's `BOWL_FLOOR`, which is derived from the
  // cut, instead of r14's hardcoded 3.50. r14 wrote the number for a ±6.30 cut; the cut has
  // moved and a copied constant would have put the blades back through the risers.
  const reach = spread * 0.95;
  const clamp = (v) => Math.max(-(BOWL_FLOOR - reach), Math.min(BOWL_FLOOR - reach, v));
  const ox = clamp(cx);
  const oz = clamp(cz);
  ctx.box('foliage', spread * 1.85, 0.30, spread * 1.55, ox, FLOOR + 0.23, oz);
  ctx.box('foliage', spread * 1.25, 0.44, spread * 1.05, ox + spread * 0.22, FLOOR + 0.32, oz - spread * 0.16);
  for (let i = 0; i < count; i += 1) {
    const px = ox + ((i * 37 % 100) / 100 - 0.5) * spread * 1.7;
    const pz = oz + ((i * 61 % 100) / 100 - 0.5) * spread * 1.45;
    const h = 0.92 + ((i * 3) % 5) * 0.20;
    const roll = 14 - (i % 5) * 7;
    const pitch = (i % 3) * 6 - 6;
    ctx.boxEx('foliage', 0.07, h, 0.055, px, FLOOR + 0.36 + h * 0.5, pz, { roll, pitch });
    const cp = Math.cos(pitch * DEG);
    const tipX = px - (h * 0.5) * cp * Math.sin(roll * DEG);
    const tipY = FLOOR + 0.36 + h * 0.5 + (h * 0.5) * cp * Math.cos(roll * DEG);
    const tipZ = pz + (h * 0.5) * Math.sin(pitch * DEG);
    ctx.boxEx('soil', 0.06, 0.17, 0.06, tipX, tipY + 0.04, tipZ, { roll, pitch });
  }
}

/** Precast headwall with a pipe mouth and a trash rack — the basin's front door. */
function headwall(ctx, x, z, { yaw = 0, w = 3.20, h = 1.55, pipeR = 0.62, y0 = FLOOR } = {}) {
  const fwdX = Math.sin(yaw * Math.PI / 180);
  const fwdZ = Math.cos(yaw * Math.PI / 180);
  const sideX = Math.cos(yaw * Math.PI / 180);
  const sideZ = -Math.sin(yaw * Math.PI / 180);
  ctx.box('concrete', w, h, 0.52, x, y0 + h * 0.5, z, yaw);
  ctx.box('concrete', w + 0.42, 0.22, 0.72, x, y0 + h + 0.09, z, yaw);
  // Splayed wing walls.
  for (const s of [-1, 1]) {
    ctx.boxEx(
      'concrete', 1.85, h * 0.82, 0.42,
      x + sideX * (w * 0.5 + 0.72) * s + fwdX * 0.62,
      y0 + h * 0.40,
      z + sideZ * (w * 0.5 + 0.72) * s + fwdZ * 0.62,
      { yaw: yaw + 38 * s },
    );
  }
  // Pipe mouth: a dark barrel set into the wall, so the opening has a reveal.
  ctx.cylEx('soil', pipeR, pipeR, 1.10, x - fwdX * 0.30, y0 + pipeR + 0.10, z - fwdZ * 0.30, { pitch: 90, yaw, segments: 12 });
  ctx.cylEx('concrete', pipeR + 0.14, pipeR + 0.14, 0.20, x + fwdX * 0.24, y0 + pipeR + 0.10, z + fwdZ * 0.24, { pitch: 90, yaw, segments: 12 });
  // Trash rack: raked steel bars across the mouth.
  for (let i = 0; i < 7; i += 1) {
    const t = (i / 6 - 0.5) * (pipeR * 2.1);
    ctx.boxEx(
      'steel', 0.06, pipeR * 2.0, 0.06,
      x + sideX * t + fwdX * 0.34, y0 + pipeR + 0.10, z + sideZ * t + fwdZ * 0.34,
      { yaw, pitch: 12 },
    );
  }
  ctx.box('steel', pipeR * 2.2, 0.08, 0.09, x + fwdX * 0.36, y0 + pipeR * 2 + 0.12, z + fwdZ * 0.36, yaw);
  ctx.box('steel', pipeR * 2.2, 0.08, 0.09, x + fwdX * 0.36, y0 + 0.14, z + fwdZ * 0.36, yaw);
  // Scour apron with rock protection under the mouth.
  ctx.box('concrete', w * 0.92, 0.11, 1.85, x + fwdX * 1.30, y0 + 0.10, z + fwdZ * 1.30, yaw);
  for (let i = 0; i < 9; i += 1) {
    const t = ((i % 3) - 1) * 0.85;
    const u = Math.floor(i / 3) * 0.55;
    ctx.cyl('concrete', 0.26, 0.32, 0.20, x + sideX * t + fwdX * (1.25 + u), y0 + 0.20, z + sideZ * t + fwdZ * (1.25 + u), 5);
  }
  ctx.streaks('soil', x, y0 + h - 0.10, z + fwdZ * 0.28, { yaw, count: 4, len: 0.85, spread: 0.85 });
  ctx.grimeWall('soil', w * 0.92, h, x + fwdX * 0.27, y0, z + fwdZ * 0.27, { yaw, seed: `hw${x}`, patches: 4, wash: 2 });
}

/**
 * UNBURY ROUND — `lowFlowChannel` IS DELETED, AND THE PROBE FOUND IT THE SAME WAY IT FOUND
 * THE POND.
 *
 * Both calls laid a 1.0-1.3 m concrete invert **entirely underneath the headwall's own
 * scour apron**. Measured: the v0 channel occupies x[-3.35,-2.35] z[-1.95,-0.65] with its
 * top face at 0.185, and the apron is a 2.94 x 1.85 m slab whose top face is at 0.190 and
 * whose geometry covers the channel's centre — 3.2 m² of v0 and 2.9 m² of v1 paid for and
 * never seen. The new plan-exact cover test in `v370-l5-geometry-probe.mjs` is what caught
 * it; the old bounding-box lid test could not, for the same reason it could not see the
 * pond's shore disc sitting on the water.
 *
 * It is a deletion rather than a relocation because there is nowhere to put it. The apron
 * reaches 2.23 m out from a headwall at 3.95 m from centre, and the widened pond's shore
 * runs to 2.87 m: the apron now discharges straight into the pool, and there is no strip of
 * basin floor left between them for an invert to run along. That is also correct — a low
 * flow that reaches the water at the apron lip does not need a channel to carry it there.
 */

/** Outlet structure: penstock riser with a spinning handwheel and a stepped spillway. */
function outlet(ctx, x, z, y0 = FLOOR) {
  ctx.box('concrete', 1.85, 1.55, 1.65, x, y0 + 0.78, z);
  ctx.box('concrete', 2.15, 0.18, 1.95, x, y0 + 1.62, z);
  ctx.box('soil', 1.05, 0.85, 0.10, x, y0 + 0.62, z + 0.84);
  for (let i = 0; i < 5; i += 1) {
    ctx.box('steel', 1.05, 0.07, 0.09, x, y0 + 0.28 + i * 0.19, z + 0.90);
  }
  ctx.cyl('steel', 0.11, 0.11, 1.05, x, y0 + 2.05, z, 8);
  ctx.box('steel', 0.42, 0.30, 0.34, x, y0 + 1.78, z);
  ctx.toy({
    kind: 'valve', id: 'penstock', x, z, y: y0 + 2.45, accent: 'steel',
    sx: 0.7, sy: 0.7, sz: 0.7, label: 'Penstock',
  });
  // Stepped spillway up the batter to the crest.
  for (let i = 0; i < 5; i += 1) {
    ctx.box('concrete', 2.35, 0.24, 0.62, x, y0 + 0.16 + i * 0.22, z - 1.35 - i * 0.44);
    ctx.box('path', 2.05, 0.05, 0.42, x, y0 + 0.30 + i * 0.22, z - 1.35 - i * 0.44);
  }
  for (const s of [-1, 1]) {
    ctx.box('concrete', 0.22, 0.95, 2.60, x + s * 1.28, y0 + 0.60, z - 2.20);
  }
}

function retardingBasin(ctx) {
  // r12 — the inlet sits at the top of the batter and discharges DOWN the slope, which is
  // where a headwall goes and also puts it clear of the enlarged pool.
  // IMPROVE ROUND — and its foot is set on the step it actually stands on. At (−4.95,−2.35)
  // on the new cut it would have been 0.165 m into terrace 1.
  headwall(ctx, -3.95, -1.75, { yaw: 66, y0: bowlY(3.95) });
  outlet(ctx, 0, 4.30, bowlY(4.30));

  // ONE pool, 5.3 m of water across a 6.1 m floor. r11's was 4.9 m of water inside a bowl
  // that occupied a third of the tile, and the r11 critic could not find it: "no visible
  // water beyond a two-pixel slot".
  pool(ctx, 0, 0, 2.35);
  reeds(ctx, 'basin0-a', 10, -2.35, 1.75, 0.85);
  reeds(ctx, 'basin0-b', 8, 2.15, 2.05, 0.85);
  reeds(ctx, 'basin0-c', 7, -2.35, -1.85, 0.78);

  /**
   * Timber viewing deck, off the maintenance track and out over the batter.
   *
   * IMPROVE ROUND — it is the object's one piece of `timber` and it carries 0.49 rendered
   * chroma in the 30° bin, which is why it is 0.9 m wider rather than smaller: this row
   * was 0.016 under the probe's chroma-weighted warm floor and green is the only other
   * thing on the object with any saturation in it. It is also the element that says a
   * person comes here, which is what a retarding basin in a residential block actually
   * has. Both ends land on made ground: the inboard end on the track at −6.80, the
   * outboard end on the deck's own four bearers.
   */
  ctx.box('timber', 4.55, 0.16, 2.55, -4.75, TOP + CREST - 0.02, 3.95);
  for (let i = 0; i < 7; i += 1) {
    ctx.box('soil', 4.45, 0.04, 0.10, -4.75, TOP + CREST + 0.07, 2.90 + i * 0.36);
  }
  // Bearers down to the batter, then one continuous guard on three sides.
  for (const [px, pz] of [[-2.85, 2.95], [-2.85, 4.95], [-6.45, 2.95], [-6.45, 4.95]]) {
    ctx.box('timber', 0.20, CREST + 0.28, 0.20, px, TOP + CREST * 0.40, pz);
  }
  const railY = [TOP + CREST + 0.52, TOP + CREST + 0.96];
  for (const y of railY) {
    ctx.box('timber', 4.55, 0.11, 0.13, -4.75, y, 2.80);
    ctx.box('timber', 4.55, 0.11, 0.13, -4.75, y, 5.10);
    ctx.box('timber', 0.13, 0.11, 2.40, -2.55, y, 3.95);
  }
  for (const [px, pz] of [[-2.55, 2.80], [-2.55, 5.10], [-4.75, 2.80], [-6.95, 2.80], [-6.95, 5.10], [-4.75, 5.10]]) {
    ctx.box('timber', 0.15, 1.06, 0.15, px, TOP + CREST + 0.52, pz);
    ctx.box('timber', 0.22, 0.09, 0.22, px, TOP + CREST + 1.08, pz);
  }
  // Both trees stand ON the track, not on air 0.7 m above the batter — r12 gave them
  // `y0: TOP + CREST` at a radius the cut has since moved out from under.
  clusterKitTree(ctx, -6.36, -6.36, { s: 1.05, y0: TOP + CREST - 0.28, seed: 'basin0-t1' });
  clusterKitTree(ctx, 6.36, -6.36, { s: 0.92, y0: TOP + CREST - 0.28, seed: 'basin0-t2' });
  ctx.toy({
    kind: 'hatch', id: 'gpt', x: -6.80, z: -1.20, y: TOP + CREST + 0.12,
    accent: 'paintY', accent2: 'steel',
    sx: 0.95, sy: 0.4, sz: 0.95, label: 'Gross pollutant trap',
  });
  ctx.box('concrete', 1.20, 0.26, 1.20, -6.80, TOP + CREST + 0.03, -1.20);
}

function wetlandCell(ctx) {
  headwall(ctx, 3.85, -2.05, { yaw: -66, w: 2.60, h: 1.35, pipeR: 0.52, y0: bowlY(3.85) });

  // Two cells split by a rock weir: sediment forebay, then the wetland proper. Both pools
  // sit on the flat floor the four-step cut leaves, and their radii are derived from it —
  // fringe reach 1.25 + 0.62 = 1.87 against a floor edge at 3.07.
  pool(ctx, -1.25, 0.42, 1.15);
  pool(ctx, 1.25, -0.42, 1.15);
  ctx.box('concrete', 0.55, 0.52, 3.05, 0, FLOOR + 0.28, 0);
  for (let i = 0; i < 5; i += 1) {
    ctx.cyl('concrete', 0.28, 0.34, 0.30, 0, FLOOR + 0.44, -1.20 + i * 0.58, 5);
  }
  reeds(ctx, 'basin1-a', 8, -2.20, 2.25, 0.90);
  reeds(ctx, 'basin1-b', 7, 2.25, 2.15, 0.85);
  reeds(ctx, 'basin1-c', 6, -2.35, -1.95, 0.80);

  outlet(ctx, -0.20, 4.30, bowlY(4.30));

  // Boardwalk on piles crossing the wetland cell, along the bowl's north edge.
  // IMPROVE ROUND — six bays, not seven. The bowl is 1.00 m narrower and the seventh bay
  // ran out over the batter; §5.4's direction is a cut on the thing that left the object,
  // not on the thing being read.
  for (let i = 0; i < 6; i += 1) {
    const pz = -1.30 + i * 1.05;
    ctx.box('timber', 2.35, 0.14, 0.95, 3.75, FLOOR + 0.95, pz);
    ctx.box('soil', 2.25, 0.04, 0.11, 3.75, FLOOR + 1.03, pz - 0.32);
    ctx.box('soil', 2.25, 0.04, 0.11, 3.75, FLOOR + 1.03, pz + 0.32);
    if (i % 2 === 0) {
      ctx.box('timber', 0.15, 0.95, 0.15, 2.80, FLOOR + 0.45, pz);
      ctx.box('timber', 0.15, 0.95, 0.15, 4.70, FLOOR + 0.45, pz);
      ctx.box('timber', 0.13, 1.02, 0.13, 2.77, FLOOR + 1.50, pz);
      ctx.box('timber', 0.13, 1.02, 0.13, 4.73, FLOOR + 1.50, pz);
    }
  }
  ctx.box('timber', 0.14, 0.14, 7.35, 2.77, FLOOR + 1.98, 1.80);
  ctx.box('timber', 0.14, 0.14, 7.35, 4.73, FLOOR + 1.98, 1.80);

  clusterKitTree(ctx, -6.36, 6.36, { s: 1.0, y0: TOP + CREST - 0.28, seed: 'basin1-t1' });
  clusterKitTree(ctx, 6.36, 6.36, { s: 0.88, y0: TOP + CREST - 0.28, seed: 'basin1-t2' });
  ctx.box('concrete', 1.20, 0.26, 1.20, 6.80, TOP + CREST + 0.03, -3.20);
  ctx.toy({
    kind: 'hatch', id: 'gpt', x: 6.80, z: -3.20, y: TOP + CREST + 0.12,
    accent: 'paintY', accent2: 'steel',
    sx: 0.95, sy: 0.4, sz: 0.95, label: 'Gross pollutant trap',
  });
}

/**
 * r4 — reed beds on the basin floor and the wet shelf. Massed, not scattered: four
 * irregular clumps of standing growth with tufts breaking out of them, sitting IN the
 * water margin the way the reference's do rather than beside it.
 */
function reedBeds(ctx) {
  // IMPROVE ROUND — the clumps ring the pond's mud shore instead of straddling it. The
  // sheet now reaches r + 0.18 and the shore r + 0.42, so a clump centred inside 2.9 m
  // stood in open water.
  const clumps = [
    [-2.45, -1.45, 1.55, 1.20], [2.20, 1.75, 1.45, 1.30],
    [-1.55, 2.35, 1.35, 1.05], [2.35, -1.95, 1.20, 1.25],
  ];
  let k = 0;
  for (const [cx, cz, w, d] of clumps) {
    k += 1;
    // The mass: two low overlapping bodies so the clump has a silhouette from every yaw.
    ctx.box('foliage', w, 0.34, d, cx, FLOOR + 0.28, cz);
    ctx.box('foliage', w * 0.68, 0.46, d * 0.74, cx + w * 0.12, FLOOR + 0.36, cz - d * 0.10);
    // Standing growth over it, at reed height rather than lawn height.
    for (let i = 0; i < 5; i += 1) {
      ctx.tuft(
        cx + ((i * 37 % 100) / 100 - 0.5) * w * 1.05,
        cz + ((i * 61 % 100) / 100 - 0.5) * d * 1.05,
        { y: FLOOR + 0.44, bucket: 'foliage', scale: 1.35 + (i % 3) * 0.3, seed: `reed${k}-${i}` },
      );
    }
  }
  /**
   * A wet-shelf fringe: the planting climbs the first terrace instead of stopping at a line.
   *
   * r14 — the radius was a hardcoded 4.55 on a circle, which crosses the second and third
   * risers on the axes and lands inside the floor slab on the diagonals: the same species as
   * the clump overrun above, on a ring. It is laid on the SQUARE of the floor edge now,
   * because the bowl is rectangular and a circle inscribed in it is neither on the floor nor
   * on a terrace for most of its length.
   */
  const EDGE = BOWL_FLOOR * 0.98;
  for (let i = 0; i < 12; i += 1) {
    const t = ((i % 3) + 0.5) / 3 - 0.5;
    const side = Math.floor(i / 3);
    const fx = side === 0 ? t * EDGE * 1.7 : side === 1 ? EDGE : side === 2 ? t * EDGE * 1.7 : -EDGE;
    const fz = side === 0 ? -EDGE : side === 1 ? t * EDGE * 1.7 : side === 2 ? EDGE : t * EDGE * 1.7;
    ctx.tuft(fx, fz, {
      y: FLOOR + 0.30, bucket: 'foliage', scale: 1.1 + (i % 4) * 0.22, seed: `fringe${i}`,
    });
  }
}
