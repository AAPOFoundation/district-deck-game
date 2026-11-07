// District Deck V3.70 L7 — voxel meshes for the playground builder.
//
// Geometry only. The rules are in `src/core/playground-builder.js`; nothing here reads
// or writes simulation state, and nothing here rolls dice — a design produces the same
// meshes every time it is built.
//
// Everything is authored in BLOCK-CORE LOCAL METRES with the ground at `GROUND_Y`
// (0.26, from `block-cores/kit.js` CORE_GROUND) and the grid centred on the softfall pad
// that `types/playground.js` already lays. That is deliberate: the same function that
// draws the builder's preview can be hung under a block core to show a saved playground
// back on the board, without either file having to convert coordinates.
//
// Palette note, V370 spec §5.2: nothing here is authored near black. The darkest value
// is the poured-rubber sole at #4a524d (sRGB luma ≈ 80), well above the luma 21 floor the
// post grade turns into saturated navy, and above the reference's own darkest large family.
//
// ## r3 — the geometry the r2 critic measured against the model this lane replaced
//
// r2 shipped 1,836 triangles across 105 meshes against the static `types/playground.js`
// model's 8,068 across 61: less than a quarter of the geometry of the thing it was opened
// to improve, with trees that were two stacked cubes, softfall that was a flat slab, and
// 68.5 % of the model area in two adjacent value bands. The brief was "the best playground
// in the world in simple voxel format", and voxel is a register, not a budget — a voxel
// tree still has a crown silhouette and poured rubber still has an edge and a surface.
//
// So every one of the nine pieces is re-authored here with the three things §2 asks for and
// r2 did not spend on:
//
//  - **Silhouette** (§2.6). A crown of twenty clustered masses in three leaf values instead
//    of two boxes; a slide bed that follows a real curve and rotates with its own slope; a
//    tunnel with ring collars; a climbing frame with slatted deck, balusters and a shade
//    canopy; hedge-and-shrub planting on the pad surround.
//  - **Section** (§2.4). Nothing is a single unmodulated slab. Softfall is a dark poured
//    sole with a wearing course inset above it and a hashed patch where a second pour met
//    the first. Sandpit sleepers carry a proud capping board. Posts carry caps.
//  - **Value separation** (§2.9). `VALUES` below is the whole nine-band contract, authored
//    as luma rather than as hue, and `tint` on `mat()` is how a shared procedural texture
//    lands in the band it was assigned rather than the band its own base hex happens to sit
//    in. The measured worst-adjacent-pair is reported in the r3 builder note.

import * as THREE from 'three';
import {
  CELL,
  GRID,
  GROUND_Y,
  PAD_CENTRE,
  pieceOf,
  specOf,
} from '../core/playground-builder.js';
import { buildDeck } from './playground-pieces/deck.js';
import { buildSlide } from './playground-pieces/slide.js';
import { buildSwing } from './playground-pieces/swing.js';
import { buildTunnel } from './playground-pieces/tunnel.js';
import { buildSandpit } from './playground-pieces/sandpit.js';
import { buildRoundabout } from './playground-pieces/roundabout.js';
import { buildSeat } from './playground-pieces/seat.js';
import { buildTree } from './playground-pieces/tree.js';
import { buildSurface } from './playground-pieces/surface.js';
import {
  EXTRA, VALUES, VOXEL_COLOURS, LEVEL_H,
  box, cyl, taper, wobble, shrub, padMetrics,
} from './playground-pieces/_kit.js';

export { LEVEL_H, VOXEL_COLOURS, padMetrics, gateLocal, resetPlaygroundMaterials } from './playground-pieces/_kit.js';

const BUILDERS = Object.freeze({
  deck: buildDeck,
  slide: buildSlide,
  swing: buildSwing,
  tunnel: buildTunnel,
  sandpit: buildSandpit,
  roundabout: buildRoundabout,
  seat: buildSeat,
  tree: buildTree,
  surface: buildSurface,
});

export function colourHex(colourId) {
  return VOXEL_COLOURS[colourId] ?? VOXEL_COLOURS.lime;
}

/** One piece as its own group, so the builder can highlight or lift a single entry. */
export function buildPiece(entry, groundY = GROUND_Y) {
  const group = new THREE.Group();
  const spec = specOf(entry.id, entry.variant);
  group.name = `pg-${entry.id}-${spec?.variantId ?? 0}`;
  const piece = pieceOf(entry.id);
  if (!piece || !spec) return group;
  const base = groundY + (entry.y ?? 0) * LEVEL_H;
  const colour = colourHex(entry.colour ?? piece.colours[0]);
  (BUILDERS[piece.id] ?? buildSurface)(group, entry, base, colour);
  group.userData.entry = entry;
  group.userData.variant = spec.variant;
  return group;
}

/**
 * The whole design, in block-core local space. A block core wanting to show a saved
 * playground adds this straight to its own group — see the hook in the L7 report.
 */
export function buildPlaygroundVoxels(design, { groundY = GROUND_Y } = {}) {
  const root = new THREE.Group();
  root.name = 'playground-voxels';
  for (const entry of design?.pieces ?? []) root.add(buildPiece(entry, groundY));
  return root;
}

/**
 * The softfall pad, its kerb and the ground it sits in. The board draws its own, so this is
 * the builder's stage — and it is where §2.1 (a board-tile base with a dark bevelled edge),
 * §2.6 (planted surround), §2.7 (a path made of units) and §2.9 (separated value bands) get
 * paid for. r1 laid one untextured tan diamond; r2 laid the bands but left two of the
 * largest — the pale pour and the gravel margin — inside one value of each other.
 */
export function buildPadShell(groundY = GROUND_Y) {
  const group = new THREE.Group();
  group.name = 'playground-pad';
  const { span, cx, cz, half, gateFrom, gateTo } = padMetrics();

  // Board-tile plinth: the miniature stands ON something with a dark bevelled edge.
  box(group, EXTRA.plinth, span + 4.6, 0.34, span + 4.6, cx, groundY - 0.36, cz,
    { rough: 0.95, tint: VALUES.padPlinth });
  // Turf apron, a PALE apron, a thin gravel strip, then the bluestone kerb.
  //
  // THE VALUE ARITHMETIC, and it is the reason the margin is pale rather than grey. Under
  // this overlay's rig a surface renders at roughly 0.70 of its albedo, so bucket 5 and above
  // needs an albedo of 203+ and the top four of the nine buckets are effectively out of reach
  // by paint. r3's first cut answered §2.9 by pushing the pad DOWN, and the measured worst
  // adjacent pair moved from 70.8 % to 70.1 % — the pair slid a band and did not separate,
  // because the gravel margin (albedo 132), the turf (127) and the coloured tiles (102–128)
  // all followed it down. The separation has to come from moving a LARGE area UP, and the
  // only families that can go up are the pale ones. So the margin is decomposed granite at
  // albedo 182 rather than grey gravel at 132, and the second pour is a buff.
  box(group, EXTRA.turfPad, span + 4.2, 0.20, span + 4.2, cx, groundY - 0.16, cz,
    { rough: 0.95, repeat: 6, tint: VALUES.padTurf });
  box(group, EXTRA.paverPale, span + 2.5, 0.18, span + 2.5, cx, groundY - 0.13, cz,
    { rough: 0.95, repeat: 5, tint: VALUES.padApron });
  box(group, EXTRA.gravelPad, span + 1.3, 0.17, span + 1.3, cx, groundY - 0.125, cz,
    { rough: 0.95, repeat: 3, tint: VALUES.padGravel });
  box(group, EXTRA.bluestone, span + 0.7, 0.26, span + 0.7, cx, groundY - 0.13, cz,
    { rough: 0.88, tint: VALUES.padKerb });
  // Wet-pour softfall. Monopoly Plus pad is faded red rubber with grey-blue wear,
  // not charcoal-green gravel and two tan lots. The pour IS the ground.
  box(group, VOXEL_COLOURS.rubberR, span, 0.08, span, cx, groundY - 0.012, cz,
    { rough: 0.95, repeat: 3 });
  // Faded circular scars — wet-pour islands, not kite shards or a painted L.
  const wearTones = [VOXEL_COLOURS.rubberB, VOXEL_COLOURS.rubberB, EXTRA.rubberWear, VOXEL_COLOURS.rubberB];
  for (let i = 0; i < 9; i += 1) {
    const r = span * (0.055 + wobble(i, 3, 11) * 0.070);
    const px = cx + (wobble(i, 13, 5) - 0.5) * span * 0.52;
    const pz = cz + (wobble(i, 17, 29) - 0.5) * span * 0.52;
    cyl(group, wearTones[i % 4], r, 0.042, px, groundY + 0.004, pz, 16,
      { rough: 0.95, tint: 0.88 + wobble(i, 31, 3) * 0.08 });
  }
  // One modest sand lot — sandpit family owns the pit; the pad stays pour.
  const sandW = span * 0.20;
  const sandD = span * 0.18;
  const sandX = cx + span * 0.32;
  const sandZ = cz - span * 0.30;
  box(group, VOXEL_COLOURS.sand, sandW, 0.07, sandD, sandX, groundY - 0.004, sandZ,
    { rough: 0.95, repeat: 2, tint: VALUES.padZone });
  for (const [w, d, x, z] of [
    [sandW + 0.12, 0.09, sandX, sandZ - sandD / 2 - 0.04],
    [sandW + 0.12, 0.09, sandX, sandZ + sandD / 2 + 0.04],
    [0.09, sandD + 0.12, sandX - sandW / 2 - 0.04, sandZ],
    [0.09, sandD + 0.12, sandX + sandW / 2 + 0.04, sandZ],
  ]) {
    box(group, EXTRA.rubberSole, w, 0.08, d, x, groundY + 0.008, z, { rough: 0.95, tint: 0.72 });
  }
  // EPDM crumb occupying the pour, not a sparse speckle.
  for (let i = 0; i < 48; i += 1) {
    const fx = (wobble(i, 3, 11) - 0.5) * span * 0.88;
    const fz = (wobble(i, 7, 19) - 0.5) * span * 0.88;
    const s = 0.10 + wobble(i, 13, 29) * 0.10;
    const tone = [VOXEL_COLOURS.rubberB, VOXEL_COLOURS.rubberG, EXTRA.rubberSole, EXTRA.rubberWear][i % 4];
    box(group, tone, s, 0.018, s * (0.55 + wobble(i, 17, 5) * 0.40),
      cx + fx, groundY + 0.028, cz + fz,
      { rough: 0.92, rot: [0, (wobble(i, 23, 7) - 0.5) * 1.4, 0] });
  }

  // A paved entry path with real units, running from the turf edge through the gate
  // and onto the pour — the way the children walk in.
  box(group, EXTRA.paverPale, 1.7, 0.10, 3.2, cx - half + (gateFrom + gateTo) / 2, groundY - 0.06, cz - span * 0.5 - 1.1,
    { rough: 0.88, tint: VALUES.padPaver });
  // Picket fence on two sides: posts at intervals, capped, a mid rail, pales, and a gate at
  // the path — §2.8. r2 had posts and one top rail, which is a paddock rail.
  const railY = groundY + 0.54;
  for (let i = 0; i <= GRID; i += 1) {
    const t = -half + (i / GRID) * half * 2;
    box(group, VOXEL_COLOURS.post, 0.11, 0.66, 0.11, cx + t, groundY + 0.33, cz - half,
      { rough: 0.88, tint: VALUES.fence });
    box(group, VOXEL_COLOURS.post, 0.14, 0.05, 0.14, cx + t, groundY + 0.68, cz - half,
      { rough: 0.88, tint: VALUES.fence });
    if (i % 2 === 0) {
      box(group, VOXEL_COLOURS.post, 0.11, 0.66, 0.11, cx - half, groundY + 0.33, cz + t,
        { rough: 0.88, tint: VALUES.fence });
      box(group, VOXEL_COLOURS.post, 0.14, 0.05, 0.14, cx - half, groundY + 0.68, cz + t,
        { rough: 0.88, tint: VALUES.fence });
    }
  }
  box(group, VOXEL_COLOURS.post, half * 2, 0.09, 0.06, cx, railY, cz - half,
    { rough: 0.88, tint: VALUES.fence });
  box(group, VOXEL_COLOURS.post, half * 2, 0.07, 0.05, cx, groundY + 0.24, cz - half,
    { rough: 0.88, tint: VALUES.fence });
  box(group, VOXEL_COLOURS.post, 0.06, 0.09, half * 2, cx - half, railY, cz,
    { rough: 0.88, tint: VALUES.fence });
  box(group, VOXEL_COLOURS.post, 0.05, 0.07, half * 2, cx - half, groundY + 0.24, cz,
    { rough: 0.88, tint: VALUES.fence });
  // Silver chain-link — MP fence language, not picket pales.
  const meshN = GRID * 5;
  const meshH = 0.52;
  const meshY = groundY + 0.28;
  for (let i = 0; i < meshN; i += 1) {
    const u = (i + 0.5) / meshN;
    const along = u * half * 2;
    if (along > gateFrom && along < gateTo) continue;
    box(group, VOXEL_COLOURS.steel, 0.016, meshH, 0.016, cx - half + along, meshY, cz - half,
      { metal: 0.42, rough: 0.38 });
    box(group, VOXEL_COLOURS.steel, 0.016, meshH, 0.016, cx - half, meshY, cz - half + along,
      { metal: 0.42, rough: 0.38 });
  }
  for (const yOff of [-0.16, 0, 0.16]) {
    box(group, VOXEL_COLOURS.steel, half * 2, 0.014, 0.014, cx, meshY + yOff, cz - half,
      { metal: 0.42, rough: 0.38 });
    box(group, VOXEL_COLOURS.steel, 0.014, 0.014, half * 2, cx - half, meshY + yOff, cz,
      { metal: 0.42, rough: 0.38 });
  }
  // The gate leaf itself, hung open into the path.
  const gx = cx - half + (gateFrom + gateTo) / 2;
  const gRot = [0, -0.42, 0];
  box(group, VOXEL_COLOURS.steel, 0.06, 0.62, 0.06, gx - 0.26, groundY + 0.33, cz - half,
    { metal: 0.38 });
  box(group, VOXEL_COLOURS.post, 0.58, 0.08, 0.05, gx, railY - 0.04, cz - half + 0.10,
    { rough: 0.88, rot: gRot, tint: VALUES.fence });
  box(group, VOXEL_COLOURS.post, 0.58, 0.07, 0.05, gx, groundY + 0.22, cz - half + 0.10,
    { rough: 0.88, rot: gRot, tint: VALUES.fence });
  for (let i = 0; i < 4; i += 1) {
    box(group, VOXEL_COLOURS.post, 0.05, 0.52, 0.045,
      gx - 0.21 + i * 0.14, groundY + 0.30, cz - half + 0.10 + (i - 1.5) * 0.06,
      { rough: 0.88, rot: gRot, tint: VALUES.fence });
  }

  // A planted surround, §2.6: a shrub band along the far turf edge, a hedge run on the
  // near side, and a bin and a park sign so the pad reads as a place rather than a tray.
  for (let i = 0; i < 9; i += 1) {
    shrub(group, cx - span * 0.44 + i * (span * 0.11), groundY - 0.06, cz + half + 0.62,
      0.92 + wobble(i, 3, 5) * 0.34, i * 13 + 5);
  }
  // A clipped hedge run on the near side. It is drawn as a clipped BODY with a broken crest,
  // not as an extruded box with a flat lid — which is the §2.6 fault the r2 critic filed
  // against the town square's hedges, and it would be the same fault here.
  const hx = cx + half + 0.62;
  box(group, EXTRA.plinth, 1.00, 0.10, span * 1.02, hx, groundY - 0.02, cz, { rough: 0.95 });
  box(group, EXTRA.leafDeep, 0.72, 0.50, span * 0.96, hx, groundY + 0.22, cz, { rough: 0.88 });
  for (let i = 0; i < 15; i += 1) {
    const t = (i + 0.5) / 15 - 0.5;
    const w1 = wobble(i, 7, 11);
    const w2 = wobble(i, 13, 29);
    box(group, i % 2 ? VOXEL_COLOURS.leaf : EXTRA.leafLight,
      0.62 + w1 * 0.16, 0.20 + w2 * 0.14, (span * 0.96) / 15 * (0.88 + w1 * 0.2),
      hx + (w1 - 0.5) * 0.09, groundY + 0.50 + w2 * 0.07, cz + t * span * 0.96,
      { rough: 0.88, rot: [0, w2 * 0.18 - 0.09, 0] });
  }
  // Bin.
  const bx = cx + span * 0.30;
  const bz = cz - half - 0.55;
  taper(group, VOXEL_COLOURS.steel, 0.24, 0.20, 0.72, bx, groundY + 0.36, bz, 12, { metal: 0.38 });
  cyl(group, VOXEL_COLOURS.steel, 0.26, 0.06, bx, groundY + 0.75, bz, 12, { metal: 0.38 });
  box(group, EXTRA.bluestone, 0.62, 0.07, 0.62, bx, groundY + 0.035, bz, { rough: 0.88 });
  // Park sign at the gate, which is where a council puts one.
  const sx = cx - half + gateTo + 0.55;
  box(group, VOXEL_COLOURS.steel, 0.09, 1.30, 0.09, sx, groundY + 0.65, cz - half - 0.30, { metal: 0.38 });
  box(group, EXTRA.plinth, 0.94, 0.60, 0.07, sx, groundY + 1.32, cz - half - 0.30, { rough: 0.88 });
  box(group, EXTRA.paverPale, 0.80, 0.44, 0.03, sx, groundY + 1.32, cz - half - 0.26, { rough: 0.88 });
  return group;
}

/** Faint per-cell guides so a player can see where a piece will land. */
export function buildGridGuides(groundY = GROUND_Y) {
  const group = new THREE.Group();
  group.name = 'playground-grid';
  const material = new THREE.LineBasicMaterial({ color: '#cfc6ae', transparent: true, opacity: 0.5 });
  const half = (GRID * CELL) / 2;
  const points = [];
  for (let i = 0; i <= GRID; i += 1) {
    const t = -half + i * CELL;
    points.push(
      new THREE.Vector3(PAD_CENTRE.x + t, groundY + 0.01, PAD_CENTRE.z - half),
      new THREE.Vector3(PAD_CENTRE.x + t, groundY + 0.01, PAD_CENTRE.z + half),
      new THREE.Vector3(PAD_CENTRE.x - half, groundY + 0.01, PAD_CENTRE.z + t),
      new THREE.Vector3(PAD_CENTRE.x + half, groundY + 0.01, PAD_CENTRE.z + t),
    );
  }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), material));
  return group;
}

// --- Children at the gate ----------------------------------------------------
// Voxel kids, same register as the kit. Six shirts, two moods (heart / tear).
// The overlay walks them; this file only builds the figure and the token.

const CHILD_SHIRTS = Object.freeze([
  VOXEL_COLOURS.coral,
  VOXEL_COLOURS.sky,
  VOXEL_COLOURS.sun,
  VOXEL_COLOURS.lime,
  VOXEL_COLOURS.rubberB,
  VOXEL_COLOURS.rubberG,
]);

export function buildChildFigure(hue = 0) {
  const group = new THREE.Group();
  group.name = 'pg-child';
  const shirt = CHILD_SHIRTS[((hue % CHILD_SHIRTS.length) + CHILD_SHIRTS.length) % CHILD_SHIRTS.length];
  const skin = '#d7b089';
  const hair = hue % 2 === 0 ? '#4a3728' : EXTRA.plinth;
  const shorts = hue % 3 === 0 ? VOXEL_COLOURS.sky : VOXEL_COLOURS.post;
  box(group, shorts, 0.13, 0.22, 0.11, -0.06, 0.16, 0.00, { rough: 0.82 });
  box(group, shorts, 0.13, 0.22, 0.11, 0.06, 0.16, 0.00, { rough: 0.82 });
  box(group, shirt, 0.28, 0.24, 0.16, 0, 0.38, 0, { rough: 0.72 });
  box(group, skin, 0.08, 0.18, 0.08, -0.18, 0.36, 0, { rough: 0.78 });
  box(group, skin, 0.08, 0.18, 0.08, 0.18, 0.36, 0, { rough: 0.78 });
  box(group, skin, 0.18, 0.18, 0.16, 0, 0.58, 0.01, { rough: 0.78 });
  box(group, hair, 0.20, 0.08, 0.18, 0, 0.70, 0.00, { rough: 0.90 });
  box(group, EXTRA.plinth, 0.03, 0.03, 0.02, -0.05, 0.60, 0.09, { rough: 0.70 });
  box(group, EXTRA.plinth, 0.03, 0.03, 0.02, 0.05, 0.60, 0.09, { rough: 0.70 });
  return group;
}

export function buildVibeToken(mood = 'love') {
  const group = new THREE.Group();
  group.name = `pg-vibe-${mood}`;
  if (mood === 'sadness') {
    box(group, VOXEL_COLOURS.sky, 0.10, 0.16, 0.08, 0, 0.04, 0, { rough: 0.45 });
    box(group, VOXEL_COLOURS.sky, 0.07, 0.07, 0.07, 0, -0.06, 0, { rough: 0.45 });
    return group;
  }
  // A voxel heart: two lobes and a point. Same language as the kit, not a sprite.
  box(group, VOXEL_COLOURS.coral, 0.10, 0.10, 0.08, -0.06, 0.08, 0, { rough: 0.62 });
  box(group, VOXEL_COLOURS.coral, 0.10, 0.10, 0.08, 0.06, 0.08, 0, { rough: 0.62 });
  box(group, VOXEL_COLOURS.coral, 0.16, 0.10, 0.08, 0, 0.00, 0, { rough: 0.62 });
  box(group, VOXEL_COLOURS.coral, 0.08, 0.08, 0.08, 0, -0.08, 0, { rough: 0.62 });
  return group;
}

/** Empty layer the overlay fills with walking children. */
export function buildVisitorRoot() {
  const group = new THREE.Group();
  group.name = 'playground-visitors';
  return group;
}

