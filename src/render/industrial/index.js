// District Deck V3.32 — industrial kit dispatcher.
//
// `building-kit.js` calls `assembleIndustrial()` before its own legacy path. When a builder is
// registered for the archetype the industrial kit owns the whole model; when it is not, this
// returns null and the legacy kit runs unchanged. That fall-through is what keeps the
// programme from ever leaving the board in a worse state than it started.
//
// SCOPE, AND IT IS EXACTLY TWO IDS.
//
//   factory-light      Lane A   industrial/factory.js
//   warehouse-brick    Lane B   industrial/warehouse.js
//
// `warehouse-richmond-loft` and `warehouse-converted` are NOT in this kit and must never be
// added to it from a V3.32 seat. They are occupied industrial residentials on the legacy kit
// path, they are named out of scope by V332 §1, and `mvp/tests/industrial-product.test.mjs`
// asserts their authored recipes. `ownsArchetype` returning false for them is the mechanism
// that keeps them on that path.
//
// Shared files (`core.js`, `texture-atlas.js`, this file) are orchestrator-owned during a
// round. A lane that needs a new primitive or a new palette bucket ASKS FOR IT IN ITS REPORT;
// two lanes editing `core.js` concurrently is how a programme loses an afternoon. Salts are
// namespaced so one lane's addition never shifts the other's variation: core 0–99, yard
// 100–199, factory 200–399, warehouse 400–599.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE, STOREY, SETBACK } from '../../core/grid.js';
import { MaterialLibrary, surfacesForArchetype } from '../materials.js';
import {
  makeContext, palette, variation, emit, INDUSTRIAL_BUCKET_CAP,
  slab, box, prism, corrugatedPanel, portalFrame, sawtoothRoof, rollerDoor, dockBumper,
  gutterAndDownpipe, taper, ladderCaged, footingOcclusionBand,
  hardstandSlab, apron, palisadeFence, chainLinkFence, industrialGate, bollard, wheelStop,
  kerb, palletStack, drumCluster, signPlate, weedLine,
} from './core.js';
import { FARM_KIT, PROCESS_KIT } from '../../core/content.js';
import { reliefLetters, fitCap } from '../signage/index.js';

// V3.32 r1 hand-over: the two lane files are live and the placeholders below are dead code kept
// only as the fall-back the scaffold banner describes. Lane A owns `factory.js`, lane B owns
// `warehouse.js`, and neither imports the other.
import { FACTORY_BUILDERS } from './factory.js';
import { WAREHOUSE_BUILDERS } from './warehouse.js';
// V3.70 lane L6. Two conversions of the bond store shell: the data-centre planning permit and
// the apartments succession rung. `warehouse-converted` MOVES ONTO THIS KIT with this import —
// it was on the legacy `building-kit.js` path, where it landed with no site at all, and V370
// §4/L6 assigns its landscaping to this lane. The V332 §1 note above forbade adding it FROM A
// V3.32 SEAT; V370 supersedes that for this id and this id only, and `conversions.js` builds it
// from the same `bondStoreShell` the graded bond store uses.
import { CONVERSION_BUILDERS } from './conversions.js';
// V3.41 MP9 lanes A / C / D. Three subjects that were `factory-light` and `warehouse-brick`
// geometry with a different word on the sign plate get models of their own. Spread AFTER the
// factory and warehouse registries below so they override those kits' aliased entries.
import { ABATTOIR_BUILDERS } from './abattoir.js';
import { WINERY_BUILDERS } from './winery.js';
import { SPACE_WORKS_BUILDERS } from './space-works.js';

/**
 * The three exterior tiers, and the thresholds are the board's own condition scale.
 *
 * `worn` is a lot that has been let go: full yard clutter, security fencing, the heaviest wear.
 * `standard` is a working bond store, which is what the programme has been building and grading.
 * `renovated` is what a player has just spent money on — the yard cleared, the industrial fencing
 * gone, the exterior made good.
 *
 * Anything that is not a recognised tier resolves to `standard`, so a caller that knows nothing
 * about condition gets exactly the building the lanes were graded on.
 */
export const CONDITION_TIERS = Object.freeze(['worn', 'standard', 'renovated']);

/**
 * `renovated` IS NOT REACHABLE FROM CONDITION ALONE, AND THAT IS THE POINT.
 *
 * The first version keyed the tier off condition only, with `renovated` at 0.78 and above. That
 * is wrong in a way that only shows on a fresh board: a parcel whose STARTING condition is high
 * rendered as cleared, landscaped and re-fenced before the player had done anything, so the
 * warehouse that had never been touched looked exactly like the one somebody had just paid to
 * refurbish — and the reward for renovating was invisible because it had already been given away.
 *
 * So `renovated` is gated on the works, not on the number. `renovationStarted` is true from the
 * moment a renovation record exists on the holding — the same signal that raises the scaffold —
 * and stays true once the works have completed. Condition still separates `worn` from
 * `standard`, because that genuinely is a property of the building rather than of the player.
 *
 * A caller that knows nothing about works passes nothing and can only get `worn` or `standard`,
 * which is the correct default for the lab, a tile preview, and a board with no state yet.
 */
export function tierFromCondition(condition, renovationStarted = false) {
  if (renovationStarted) return 'renovated';
  if (!Number.isFinite(condition)) return 'standard';
  // CONDITION IS AN INTEGER 0 / 1 / 2, NOT A 0-1 FRACTION.
  //
  // The first two versions of this tested `< 0.45` and `>= 0.78`, which is a fraction's scale and
  // is meaningless against the one the game actually uses. `board.js` `_conditionTint` indexes
  // `[0.76, 1, 1.10]` BY condition, `economy.js` computes `nextCondition = min(condition + 1,
  // maxCondition)`, and a fresh seed 0 board deals 34 parcels at 0, 48 at 1 and 15 at 2. So the
  // domain is three integers and a renovation moves it up by exactly one step.
  //
  // Under the old thresholds, condition 1 — an ordinary working building, the most common value
  // on the board — tested `>= 0.78` and came back `renovated`. That is what made half the board's
  // warehouses render cleared and landscaped before anyone had touched them.
  return condition <= 0 ? 'worn' : 'standard';
}

/* ─────────────────────────────────── the envelope ─────────────────────────────────── */

/**
 * Footprint fractions, storeys, setback and dock side per subject.
 *
 * Both subjects are 1 × 2 parcels — 15 × 31 m of lot after the setback lattice — and neither
 * fills it. THE YARD IS PART OF THE SUBJECT (V332 §2b): "on an industrial site the yard is a
 * larger fraction of the plate than a house's garden is, and it is graded as hard." So the
 * building takes roughly half the depth and the rest is hardstand, apron, boundary and the
 * stored goods that say what the shed is for.
 *
 * THE PRODUCT CONTRACT (V332 §2d) IS ENCODED HERE AS WELL AS IN `INDUSTRIAL_FACADE_RECIPES`.
 *
 * The recipe table lives in `building-kit.js`, which imports THIS file — reading it from here
 * would be a circular import, so the per-façade contract is MIRRORED below rather than shared.
 * The mirror is deliberate and it is a maintenance obligation: `mvp/tests/industrial-product
 * .test.mjs` asserts the recipe table's numbers, and if those numbers ever move, the mirror
 * moves with them or the kit and the test describe two different buildings.
 *
 *   | | factory | warehouse |
 *   | roof  | sawtooth or closed mono, north-lit glazing | flat behind a parapet |
 *   | dock  | TWO bays | ONE bay |
 *   | stack | required, board-legible | FORBIDDEN |
 *   | upper | metal cladding over a masonry base | multi-storey brick punch grid |
 *   | annex | plant / substation | pitched metal lean-to |
 *
 * A round that improves a subject's craft while eroding that split fails (§2d).
 */
const ENVELOPE = Object.freeze({
  'factory-light': Object.freeze({
    footprint: [1, 2],
    storeys: 2,
    /** A shed's height is its eaves, not its storey count. 8.4 m is a two-crane light plant. */
    eaveH: 8.4,
    /** Masonry base under the cladding — the §2d "metal cladding over a masonry base" line. */
    plinthH: 2.6,
    // 0.78 rather than the 0.86 the first draft carried, and the reason is measurable: the
    // product test asserts the ASSEMBLED bounding box against half-extents of 8 × 16, so the
    // side margin has to hold the flank plant, the stack base and anything else outboard of the
    // shell. `env.annexW` below is that margin, stated once so a lane never has to derive it.
    widthF: 0.78,
    depthF: 0.52,
    frontSetback: 0.42,
    dockBays: 2,
    dockSide: 'front',
    hasStack: true,
    annex: 'plant',
    hardstand: 'asphalt',
    // Mirrored from INDUSTRIAL_FACADE_RECIPES['factory-light'] — see the note above.
    roofByFacade: [
      { mode: 'closed-mono', teeth: 1, rise: 5.6, stackHeight: 12.4 },
      { mode: 'sawtooth', teeth: 2, rise: 2.8, stackHeight: 12.8 },
      { mode: 'closed-mono', teeth: 1, rise: 5.4, stackHeight: 13.0 },
      { mode: 'sawtooth', teeth: 2, rise: 2.6, stackHeight: 13.2 },
    ],
  }),
  /**
   * `warehouse-datacentre` and `warehouse-converted` ARE THE SAME ENVELOPE AS THE BOND STORE,
   * AND THAT IS THE CONTRACT RATHER THAN A SHORTCUT.
   *
   * V370 §4/L6: "the exterior shell is unchanged — same brick bond store, same parapet, same
   * pilasters." An envelope is the first place a shell can quietly stop being the same one: a
   * width fraction 20 mm off, a different eave height, a parapet rise that does not match, and
   * two buildings that are supposed to be the same building read as cousins. Both conversions
   * therefore take `warehouse-brick`'s spec object by spread, with only the fields that describe
   * WHAT THE BUILDING IS FOR touched — and today neither of them touches one. The `hasStack:
   * false` line is inherited rather than restated for the same reason §2d gives: a data centre
   * that grows a process chimney reads as a factory at board altitude.
   *
   * Written as a function so the three entries cannot drift: change the bond store's envelope
   * and both conversions move with it in the same commit.
   */
  'warehouse-brick': Object.freeze({
    footprint: [1, 2],
    storeys: 3,
    /** Three storeys of bond store at the vertical quantum, so the punch grid has three rows. */
    eaveH: 3 * STOREY,
    /** Bluestone plinth course. Low, because a bond store's plinth is a course, not a base. */
    plinthH: 1.0,
    // The bond store is NARROWER than the factory on purpose, and the width is set by the
    // annex rather than by the shell. §2d requires a pitched metal lean-to on the flank, and a
    // lean-to needs about 2.3 m outboard of the wall; at the 0.84 the first draft carried, the
    // lean-to landed at x = −9.50 on a lot whose half-extent is 8.0 and the product test
    // failed on façade 0. `env.annexW` is the room this leaves.
    widthF: 0.62,
    depthF: 0.50,
    frontSetback: 0.40,
    dockBays: 1,
    dockSide: 'front',
    hasStack: false,
    annex: 'metal-lean-to',
    hardstand: 'concrete',
    // Mirrored from INDUSTRIAL_FACADE_RECIPES['warehouse-brick']: flat roof, parapet rise
    // 3.8–4.1 as the total roof zone, of which the parapet must stay board-legible above the
    // roof deck. `teeth: 0` and `stackHeight: 0` are the contract, not an omission.
    roofByFacade: [
      { mode: 'flat', teeth: 0, rise: 3.8, stackHeight: 0 },
      { mode: 'flat', teeth: 0, rise: 4.0, stackHeight: 0 },
      { mode: 'flat', teeth: 0, rise: 3.9, stackHeight: 0 },
      { mode: 'flat', teeth: 0, rise: 4.1, stackHeight: 0 },
    ],
  }),
});

/**
 * The two V3.70 L6 conversions, sharing the bond store's envelope exactly.
 *
 * `ENVELOPE` is frozen and this reuses the frozen object rather than copying its fields, so the
 * three entries are the same numbers by construction and not by transcription. `roofByFacade` is
 * shared by reference for the same reason: the parapet rise is part of the silhouette these
 * three subjects must not disagree about.
 */
const CONVERSION_ENVELOPE = Object.freeze({
  'warehouse-datacentre': ENVELOPE['warehouse-brick'],
  'warehouse-converted': ENVELOPE['warehouse-brick'],
});

/** Envelope lookup across both tables. One function so a caller never has to know which. */
const KIT_ALIAS = Object.freeze({
  'space-works': 'factory-light',
  'dairy-processor': 'factory-light',
  'cattle-abattoir': 'factory-light',
  'winery': 'warehouse-brick',
  steelworks: 'factory-light',
  smelter: 'factory-light',
  refinery: 'factory-light',
  terafab: 'warehouse-datacentre',
  'works-hall': 'warehouse-brick',
  kiln: 'warehouse-brick',
  'pulp-mill': 'warehouse-brick',
  'printing-press': 'warehouse-brick',
});

function envelopeFor(archetypeId) {
  const kitId = KIT_ALIAS[archetypeId] ?? archetypeId;
  return ENVELOPE[kitId] ?? CONVERSION_ENVELOPE[kitId] ?? null;
}

/**
 * Both subjects declare their own wall family and ignore the district bias.
 *
 * §2d makes the wall material part of the product contract, so a district that prefers render
 * cannot turn a bond store into a rendered box. `core.js: MATERIAL_IDENTITY` holds the same
 * declaration for the palette; this one is what the surfaces resolver sees.
 */
function industrialSurfaces(archetypeId) {
  const declared = surfacesForArchetype(archetypeId, null);
  return { ...declared, wall: 'brick', trim: 'painted_metal' };
}

/* ─────────────────────────── placeholder builders (temporary) ─────────────────────── */
//
// ██ PLACEHOLDERS — OWNED BY LANES A AND B, NOT BY THIS FILE ██
//
// These exist for exactly one reason: the board and the industrial lab must run green from the
// moment the scaffold lands, so that Lane A and Lane B are testing their own work rather than
// discovering that the dispatcher was never exercised. They produce an HONEST massing — the
// right envelope, the §2d product contract, a hardstand and a boundary — and nothing more. They
// are not a starting point to refine and they are not a style reference; every dimension the
// two graded subjects are judged on (§2a ornament, §2b curtilage, §2c wear, openings,
// construction logic) is deliberately absent.
//
// TO HAND OVER, the orchestrator makes exactly two edits to this file:
//
//   1. add the imports beside the core import at the top:
//        import { FACTORY_BUILDERS } from './factory.js';
//        import { WAREHOUSE_BUILDERS } from './warehouse.js';
//   2. replace the INDUSTRIAL_BUILDERS body with:
//        { ...FACTORY_BUILDERS, ...WAREHOUSE_BUILDERS }
//
// and deletes everything between this banner and the one that closes it. Lane files export a
// single frozen object keyed by archetype id whose values are `builder(ctx)` functions — the
// same shape `residential/index.js` consumes — so nothing else in this file changes.

/** Boundary, hardstand and the two yard objects that keep the placeholder honest. */
function placeholderYard(ctx) {
  const { env } = ctx;
  const inset = env.boundaryInset;
  const halfW = env.lotW / 2 - inset;
  const halfD = env.lotD / 2 - inset;

  emit(ctx, hardstandSlab(ctx, {
    x: 0, z: 0, width: env.lotW - inset * 2, depth: env.lotD - inset * 2,
    mode: env.hardstand, salt: 100,
  }));
  emit(ctx, apron(ctx, {
    x: 0, z: env.frontZ + env.apronD / 2, width: env.bodyW * 0.92, depth: env.apronD,
    bays: env.dockBays, salt: 104,
  }));
  emit(ctx, kerb(ctx, { x1: -halfW, z1: halfD, x2: halfW, z2: halfD, salt: 128 }));

  // Boundary: palisade to the street, chain-link down the two flanks and the rear, with a gate
  // wide enough for the truck the dock implies (§2b).
  const gateHalf = 3.4;
  emit(ctx, palisadeFence(ctx, { x1: -halfW, z1: halfD, x2: -gateHalf, z2: halfD, salt: 108 }));
  emit(ctx, palisadeFence(ctx, { x1: gateHalf, z1: halfD, x2: halfW, z2: halfD, salt: 109 }));
  emit(ctx, industrialGate(ctx, { x: 0, z: halfD, width: gateHalf * 2, openFraction: 0.35, salt: 116 }));
  for (const side of [-1, 1]) {
    emit(ctx, chainLinkFence(ctx, {
      x1: side * halfW, z1: halfD, x2: side * halfW, z2: -halfD, salt: 112 + (side > 0 ? 1 : 0),
    }));
  }
  emit(ctx, chainLinkFence(ctx, { x1: -halfW, z1: -halfD, x2: halfW, z2: -halfD, salt: 114 }));
  emit(ctx, weedLine(ctx, { x1: -halfW + 0.2, z1: -halfD + 0.3, x2: halfW - 0.2, z2: -halfD + 0.3, salt: 164 }));

  for (const bx of [-env.bodyW * 0.42, env.bodyW * 0.42]) {
    emit(ctx, bollard(ctx, { x: bx, z: env.frontZ + 0.9, salt: 120 }));
  }
  emit(ctx, wheelStop(ctx, { x: 0, z: env.frontZ + env.apronD * 0.72, salt: 124 }));
  emit(ctx, palletStack(ctx, { x: -env.bodyW * 0.30, z: env.frontZ + 2.1, count: 5, salt: 136 }));
  emit(ctx, drumCluster(ctx, { x: env.bodyW * 0.34, z: env.frontZ + 2.4, count: 4, salt: 144 }));
  emit(ctx, signPlate(ctx, {
    x: env.bodyW * 0.36, y: 3.3, z: env.frontZ + 0.09, width: 1.3, height: 0.5,
    mount: 'wall', wallPlane: env.frontZ, kind: 'name', salt: 160,
  }));
}

/** The shell every placeholder shares: base, upper wall, dock openings, gutter. */
function placeholderShell(ctx, { cladUpper }) {
  const { env, p } = ctx;
  const midZ = (env.frontZ + env.backZ) / 2;
  const baseH = Math.min(env.plinthH, env.eaveH * 0.9);

  ctx.push(slab(env.bodyW, baseH, env.bodyD, 0, 0, midZ, 'placeholder-base'), p.wall);
  ctx.push(slab(env.bodyW + 0.30, 0.42, env.bodyD + 0.30, 0, 0, midZ, 'placeholder-plinth'), p.wallAlt);
  if (cladUpper) {
    ctx.push(slab(env.bodyW * 0.995, env.eaveH - baseH, env.bodyD * 0.995, 0, baseH, midZ,
      'placeholder-upper'), p.cladding);
    for (const side of [-1, 1]) {
      ctx.push(corrugatedPanel({
        width: env.bodyD * 0.98, height: env.eaveH - baseH,
        x: side * env.bodyW / 2, y: (env.eaveH + baseH) / 2, z: midZ,
        euler: { y: side * Math.PI / 2 }, name: 'placeholder-clad-flank',
      }), p.cladding);
    }
  } else {
    ctx.push(slab(env.bodyW, env.eaveH - baseH, env.bodyD, 0, baseH, midZ, 'placeholder-upper'), p.wall);
    // A punch grid, so the product split reads even on a placeholder (§2d, upper wall).
    for (let storey = 1; storey < env.storeys + 1; storey += 1) {
      const y = baseH + (env.eaveH - baseH) * ((storey - 0.5) / env.storeys);
      for (let bay = 0; bay < 5; bay += 1) {
        const bx = -env.bodyW * 0.36 + (env.bodyW * 0.72 * bay) / 4;
        ctx.push(box(1.05, 1.55, 0.14, bx, y, env.frontZ + 0.02, 'placeholder-punch'), p.glass);
        ctx.push(box(1.25, 0.16, 0.18, bx, y + 0.86, env.frontZ + 0.04, 'placeholder-lintel'), p.wallAlt);
      }
    }
  }

  // Dock openings — the count is the product contract (§2d), so a placeholder honours it.
  const bays = env.dockBays;
  for (let i = 0; i < bays; i += 1) {
    const bx = env.bodyW * ((i + 0.5) / bays - 0.5) * 0.78;
    emit(ctx, rollerDoor({
      x: bx, z: env.frontZ, width: 3.4, height: 4.0, openFraction: i === 0 ? 0.34 : 0,
      name: 'placeholder-dock',
    }));
    for (const side of [-1, 1]) {
      emit(ctx, dockBumper({ x: bx + side * 1.9, z: env.frontZ + 0.04, name: 'placeholder-bumper' }));
    }
  }
  // A personnel door beside the dock. Its vision panel is the only glazing a closed-mono
  // factory placeholder would otherwise have, and a shed a person cannot walk into is a
  // construction-logic failure before any lane touches it.
  const doorX = -env.bodyW * 0.40;
  ctx.push(box(0.98, 2.10, 0.30, doorX, 1.05, env.frontZ - 0.06, 'placeholder-door-reveal'), p.shadow);
  ctx.push(box(0.90, 2.02, 0.06, doorX, 1.01, env.frontZ + 0.02, 'placeholder-door-leaf'), p.trim);
  ctx.push(box(0.44, 0.46, 0.10, doorX, 1.72, env.frontZ + 0.04, 'placeholder-door-vision'), p.glass);
  ctx.push(box(1.22, 0.20, 0.22, doorX, 2.22, env.frontZ + 0.03, 'placeholder-door-head'), p.wallAlt);

  emit(ctx, gutterAndDownpipe({
    x: 0, y: env.eaveH + 0.10, z: env.frontZ + 0.16, runLength: env.bodyW,
    axis: 'x', dropAt: env.bodyW * 0.44, wallPlane: env.frontZ, name: 'placeholder-rainwater',
  }));
  emit(ctx, ladderCaged({
    x: -env.bodyW * 0.44, z: env.frontZ + 0.10, yTop: env.eaveH - 0.2, name: 'placeholder-ladder',
  }));
}

/** PLACEHOLDER — Lane A owns `factory-light` in `industrial/factory.js`. */
function placeholderFactory(ctx) {
  const { env, p } = ctx;
  const midZ = (env.frontZ + env.backZ) / 2;
  placeholderShell(ctx, { cladUpper: true });

  if (env.roofMode === 'sawtooth') {
    emit(ctx, sawtoothRoof({
      width: env.bodyW, depth: env.bodyD, teeth: env.teeth, yBase: env.eaveH,
      rise: env.roofRise, z: midZ, name: 'placeholder-sawtooth',
    }));
  } else {
    ctx.push(prism(env.bodyW, env.bodyD, env.roofRise, 0, env.eaveH, midZ,
      'placeholder-mono', 0.5), p.cladding);
  }
  // Portal frames, visible through the open dock and under the eaves.
  for (let i = 0; i < 3; i += 1) {
    const fz = env.backZ + env.bodyD * ((i + 0.5) / 3);
    emit(ctx, portalFrame({
      span: env.bodyW * 0.92, eaveH: env.eaveH - 0.4, z: fz, mono: env.roofMode !== 'sawtooth',
      name: 'placeholder-portal',
    }));
  }
  // The stack. §2d: required, board-legible height, and forbidden on the warehouse.
  const sx = env.bodyW * 0.38;
  const sz = env.backZ + 1.1;
  ctx.push(taper(0.72, 0.52, env.stackHeight, sx, 0.2, sz, 'placeholder-stack'), p.steel);
  ctx.push(taper(0.66, 0.66, 0.5, sx, env.stackHeight + 0.2, sz, 'placeholder-stack-cap'), p.trim);
  ctx.push(slab(2.0, 0.4, 2.0, sx, 0, sz, 'placeholder-stack-base'), p.wallAlt);
  placeholderYard(ctx);
}

/** PLACEHOLDER — Lane B owns `warehouse-brick` in `industrial/warehouse.js`. */
function placeholderWarehouse(ctx) {
  const { env, p } = ctx;
  const midZ = (env.frontZ + env.backZ) / 2;
  placeholderShell(ctx, { cladUpper: false });

  // Flat roof behind a parapet (§2d). The deck is the hardstand family, the coping is masonry.
  ctx.push(slab(env.bodyW - 0.5, 0.20, env.bodyD - 0.5, 0, env.eaveH, midZ,
    'placeholder-roof-deck'), p.ground);
  const parapet = Math.max(1.0, env.parapetH);
  for (const [w, d, x, z] of [
    [env.bodyW, 0.34, 0, env.frontZ - 0.17],
    [env.bodyW, 0.34, 0, env.backZ + 0.17],
    [0.34, env.bodyD, -env.bodyW / 2 + 0.17, midZ],
    [0.34, env.bodyD, env.bodyW / 2 - 0.17, midZ],
  ]) {
    ctx.push(slab(w, parapet, d, x, env.eaveH, z, 'placeholder-parapet'), p.wall);
    ctx.push(slab(w + 0.16, 0.16, d + 0.16, x, env.eaveH + parapet, z, 'placeholder-coping'), p.wallAlt);
  }
  // Pitched metal lean-to annex (§2d), sized to the measured margin rather than to a wish.
  const annexW = Math.max(1.2, env.annexW);
  const annexX = -(env.bodyW / 2 + annexW / 2);
  ctx.push(slab(annexW, 3.4, env.bodyD * 0.62, annexX, 0, midZ, 'placeholder-annex'), p.wall);
  ctx.push(prism(annexW + 0.3, env.bodyD * 0.64, 1.1, annexX, 3.4, midZ,
    'placeholder-annex-roof', -0.5), p.cladding);
  placeholderYard(ctx);
}

/** ██ END PLACEHOLDERS ██ */

/* ─────────────────────────────────── the dispatcher ───────────────────────────────── */

/** archetypeId → builder(ctx). A missing entry falls through to the legacy kit. */
export const INDUSTRIAL_BUILDERS = Object.freeze({
  ...FACTORY_BUILDERS,
  ...WAREHOUSE_BUILDERS,
  ...CONVERSION_BUILDERS,
  steelworks: FACTORY_BUILDERS['factory-light'],
  smelter: FACTORY_BUILDERS['factory-light'],
  refinery: FACTORY_BUILDERS['factory-light'],
  terafab: CONVERSION_BUILDERS['warehouse-datacentre'],
  'works-hall': WAREHOUSE_BUILDERS['warehouse-brick'],
  kiln: WAREHOUSE_BUILDERS['warehouse-brick'],
  'pulp-mill': WAREHOUSE_BUILDERS['warehouse-brick'],
  'printing-press': WAREHOUSE_BUILDERS['warehouse-brick'],
  // V3.41 MP9. Last, so `cattle-abattoir`, `winery` and `space-works` resolve to their own lane
  // files rather than to the factory / warehouse entries that alias them above.
  ...ABATTOIR_BUILDERS,
  ...WINERY_BUILDERS,
  ...SPACE_WORKS_BUILDERS,
});

/**
 * The placeholders are retained rather than deleted, against the scaffold banner's instruction,
 * for one reason: they are the only honest massing this programme can fall back to if a lane
 * file has to be pulled mid-round, and `ownsArchetype` returning false would silently drop both
 * subjects onto the legacy kit instead — which is a different building, not a simpler one.
 * `INDUSTRIAL_PLACEHOLDERS` is exported so that swap is one line rather than a merge conflict.
 */
export const INDUSTRIAL_PLACEHOLDERS = Object.freeze({
  'factory-light': placeholderFactory,
  'warehouse-brick': placeholderWarehouse,
});

/** Whether the industrial kit owns this archetype. Two ids, and never a third from V3.32. */
export function ownsArchetype(archetypeId) {
  return typeof INDUSTRIAL_BUILDERS[archetypeId] === 'function';
}

/**
 * Assemble an industrial model, or return null so the legacy kit runs.
 *
 * @param {string} archetypeId
 * @param {MaterialLibrary} materials
 * @param {{districtId?: string|null, quality?: string, facade?: number}} opts
 * @returns {{parts: Array<{geometry: THREE.BufferGeometry, material: any}>, size: THREE.Vector3,
 *            source: string, fallback: boolean, kit: boolean, archetypeId: string,
 *            form: string} | null}
 */
export function assembleIndustrial(archetypeId, materials, opts = {}) {
  const builder = INDUSTRIAL_BUILDERS[archetypeId];
  if (!builder) return null;

  const quality = opts.quality ?? 'high';
  const districtId = opts.districtId ?? null;
  const facade = Math.max(0, Math.min(3, opts.facade | 0));
  const spec = envelopeFor(archetypeId);
  if (!spec) return null;

  const v = variation(`${archetypeId}|${districtId ?? ''}|f${facade}`);
  const roof = spec.roofByFacade[facade] ?? spec.roofByFacade[0];

  // The lot: the parcel minus the setback lattice. `boundaryInset` keeps the fence, the kerb
  // and everything outboard of them INSIDE the lot — `industrial-product.test.mjs` measures the
  // assembled bounding box against half-extents of 8 × 16 and a fence post on the line is the
  // kind of thing that passes on three façades and spills on the fourth.
  // THE LOT IS THE PARCEL, NOT THE AUTHORED FOOTPRINT, WHEN THE CALLER KNOWS THE DIFFERENCE.
  //
  // `warehouse-brick` is authored `footprint: [1, 2]` and its parcels are not all that shape:
  // measured across forty seeds, **49 of 80 are a single tile** and 31 are two. The retired
  // commissioned GLB was about 12.8 × 15.0 m — one tile — so nothing noticed until V3.32 built
  // the warehouse to its authored footprint and put a 31 m building on a 16 m lot, overhanging
  // into the street and the neighbour at both ends. No rotation fixes that; a 1 × 2 model does
  // not fit a 1 × 1 parcel at any angle, which is why `industrialFrontRotation`'s fit constraint
  // is necessary but not sufficient on its own.
  //
  // `opts.lotSpan` is `{ spanX, spanZ }` in tiles, measured from the parcel by `board.js`. When
  // it is absent — the lab, a tile preview, any non-industrial caller — the authored footprint
  // stands, so this is additive and the civic factory, whose parcels really are 1 × 2, is
  // unchanged. The depth fraction is held: a bond store on one tile is a shallower building with
  // a shallower yard, not the same building spilling off its site.
  const span = opts.lotSpan;
  const tilesX = Math.max(1, span?.spanX ?? spec.footprint[0]);
  const tilesZ = Math.max(1, span?.spanZ ?? spec.footprint[1]);
  const lotW = tilesX * TILE - SETBACK * 2;
  const lotD = tilesZ * TILE - SETBACK * 2;
  const bodyW = lotW * spec.widthF * (1 + (facade - 1.5) * 0.016);
  const bodyD = lotD * spec.depthF * (1 + ((facade * 2) % 3 - 1) * 0.018);
  const frontZ = lotD / 2 - lotD * spec.frontSetback;
  const backZ = frontZ - bodyD;
  const eaveH = spec.eaveH;

  // CONDITION TIER — what a renovation actually changes on the outside.
  //
  // `condition` is a 0–1 number the board already resolves per building and, until now, spent
  // entirely on an instance tint and a roughness nudge. A repaint is not what a player sees when
  // they renovate a bond store: they see the yard cleared and the security fencing come down.
  //
  // Quantised to three tiers rather than used continuously, because the tier is part of the batch
  // identity — `board.js` builds one `InstancedMesh` per key, so a continuous value would mint a
  // model per building. Three is the fewest that reads as a progression: neglected, working,
  // renovated.
  const conditionTier = opts.conditionTier ?? tierFromCondition(opts.condition);

  const env = {
    archetypeId,
    facade,
    /** `'worn' | 'standard' | 'renovated'`. Lanes vary the yard and the boundary off this. */
    conditionTier,
    /** The footprint the model is ACTUALLY built to, in tiles — the parcel's when it is known. */
    footprint: [tilesX, tilesZ],
    /** What the archetype table authors, kept so a lane can tell it was resized. */
    authoredFootprint: spec.footprint,
    lotW,
    lotD,
    bodyW,
    bodyD,
    /** Building front plane. POSITIVE Z IS THE STREET and the dock faces it. */
    frontZ,
    backZ,
    leftX: -bodyW / 2,
    rightX: bodyW / 2,
    kerbZ: lotD / 2 + 0.6,
    /** Yard depth in front of the dock, which is what the apron and the truck stand on. */
    apronD: Math.max(3.0, lotD / 2 - frontZ - 1.4),
    /** Everything outboard of this is off the lot. Fences and kerbs sit on it, not past it. */
    boundaryInset: 0.35,
    /**
     * How much room there is beside the shell for a flank annex, plant compound or stack base,
     * measured rather than guessed. A lane that builds outboard of `bodyW / 2` uses THIS and
     * does not re-derive it: the product test measures the assembled bounding box against
     * half-extents of 8 × 16, and a lean-to that fits on façade 0 and spills on façade 3 is
     * exactly the kind of defect the width jitter above produces.
     */
    annexW: Math.max(0, lotW / 2 - 0.35 - bodyW / 2 - 0.15),
    /** Outer face a flank annex may reach. Nothing on the lot goes past this in x. */
    annexOuterX: lotW / 2 - 0.35,
    storeys: Math.max(1, spec.storeys),
    storeyH: STOREY,
    wallH: eaveH,
    eaveH,
    plinthH: spec.plinthH,
    roofMode: roof.mode,
    teeth: roof.teeth,
    roofRise: roof.rise,
    /** Warehouse only: the visible parapet above the roof deck. Zero on the factory. */
    parapetH: roof.mode === 'flat' ? Math.max(1.0, roof.rise - 2.6) : 0,
    stackHeight: roof.stackHeight,
    hasStack: spec.hasStack,
    dockBays: spec.dockBays,
    dockSide: spec.dockSide,
    /** Where the dock is, in Z. The apron wear program is sited off this. */
    dockZ: frontZ,
    annex: spec.annex,
    hardstand: spec.hardstand,
    units: 1,
  };

  const surfaces = industrialSurfaces(archetypeId);
  const key = `${archetypeId}-${districtId ?? 'x'}-f${facade}`;
  const p = palette(materials, surfaces, v, key, archetypeId, env);

  const ctx = makeContext({ env, palette: p, variation: v, quality, archetypeId, districtId });
  builder(ctx);
  ctx.push(footingOcclusionBand({
    width: env.bodyW, depth: env.bodyD, z: (env.frontZ + env.backZ) / 2, name: 'p1-footing-ao',
  }), p.shadow);
  const fasciaName = {
    'space-works': 'space-works-fascia',
    'dairy-processor': 'dairy-processor-fascia',
    'cattle-abattoir': 'cattle-abattoir-fascia',
    winery: 'winery-fascia',
    steelworks: 'steelworks-fascia',
    smelter: 'smelter-fascia',
    refinery: 'refinery-fascia',
    terafab: 'terafab-fascia',
    'works-hall': 'works-hall-fascia',
    kiln: 'kiln-fascia',
    'pulp-mill': 'pulp-mill-fascia',
    'printing-press': 'printing-press-fascia',
  }[archetypeId];
  if (fasciaName) {
    const farmWord = PROCESS_KIT[archetypeId]?.fascia
      ?? FARM_KIT[archetypeId]?.fascia
      ?? '';
    const plate = signPlate(ctx, {
      x: 0,
      y: 3.4,
      z: env.frontZ + 0.06,
      width: 2.6,
      height: 0.78,
      facing: 1,
      mount: 'wall',
      kind: farmWord ? 'text' : 'name',
      text: farmWord,
      name: fasciaName,
    });
    emit(ctx, {
      trim: plate.trim,
      steel: plate.steel,
      shadow: plate.shadow,
    });
    if (plate.textMaterial && plate.text?.length) {
      ctx.push(plate.text, plate.textMaterial);
    } else if (farmWord) {
      // Node / no-document: canvas texture is null, so the standing model
      // still carries the word as relief letters on the existing trim bucket.
      const cap = fitCap(farmWord, { width: 2.2, height: 0.48 });
      emit(ctx, reliefLetters({
        text: farmWord,
        x: 0,
        y: 3.4,
        z: env.frontZ + 0.12,
        cap,
        material: ctx.p.trim,
        axis: 'z',
        facing: 1,
        maxWidth: 2.2,
        depth: 0.04,
        name: `${fasciaName}-text:${farmWord}`,
      }));
    }
  }
  if (!ctx.parts.length) return null;

  const merged = mergeByMaterial(ctx.parts);
  if (merged.length > INDUSTRIAL_BUCKET_CAP) {
    // Not fatal — the board still draws — but it is a spec breach worth surfacing in the
    // console during development rather than only in a perf run days later.
    console.warn(
      `[industrial] ${archetypeId} produced ${merged.length} material buckets `
      + `(cap ${INDUSTRIAL_BUCKET_CAP}). Reuse a palette bucket instead of adding a material.`,
    );
  }

  const bounds = new THREE.Box3();
  const scratch = new THREE.Box3();
  for (const part of merged) {
    if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
    scratch.copy(part.geometry.boundingBox);
    bounds.union(scratch);
  }
  const size = bounds.isEmpty()
    ? new THREE.Vector3(bodyW, eaveH + 2.6, bodyD)
    : bounds.getSize(new THREE.Vector3());

  return {
    parts: merged,
    size,
    /**
     * PER-PART CENSUS, OPT-IN, AND IT EXISTS BECAUSE EVERY SEAT SO FAR HAS HAD TO GUESS.
     *
     * `mergeByMaterial` collapses the build into nine geometries, so by the time any probe sees a
     * model the name every primitive was given has gone. Both prior rounds attributed triangles
     * by commenting a call out, measuring, and putting it back — which is a real measurement made
     * with a temporary edit to a shared checkout, and it is not a thing a report can be audited
     * against. This hands back the pre-merge roll-up as PLAIN NUMBERS: no geometry references, so
     * nothing is retained, nothing needs disposing, and an `everyMesh`-style walker that looks for
     * `{ geometry }` skips it rather than double-counting the model.
     *
     * Off unless asked for, and the bounding boxes are only computed when it is.
     */
    ...(opts.partCensus ? { partCensus: censusOf(ctx.parts) } : {}),
    /**
     * PRE-MERGE GEOMETRY, OPT-IN AND SEPARATE FROM `partCensus`, added by V3.71 lane F r2.
     *
     * `partCensus` deliberately hands back plain numbers, and its own note says why. That is the
     * right default and it is also the reason major 1 shipped: **a per-instance bounding box can
     * say where a leaf is and can never say what it touches.** An AABB gap of 40 mm proves two
     * hulls are at least 40 mm apart, but an AABB OVERLAP proves nothing at all — two rotated
     * boxes can share a bounding volume and share no point. A coherence probe needs vertices.
     *
     * So this is a second, louder door: `{ partGeometry: true }` returns the live pre-merge
     * geometries by name. It retains references, so it is for instruments only and it is off
     * unless asked for. `partCensus` is untouched, and every existing consumer of it — the L6
     * tri-by-name probe, this lane's census, the critic's four — reads exactly what it read
     * before.
     */
    ...(opts.partGeometry ? { partGeometry: geometryOf(ctx.parts) } : {}),
    source: 'industrial-kit',
    fallback: false,
    kit: true,
    archetypeId,
    form: 'industrial',
  };
}

/**
 * Roll the pre-merge parts up by geometry name — triangles, instance count, and the union
 * bounding box, all as plain numbers. See the `partCensus` note on the returned model.
 *
 * The bounding box is the half of this that closes a class of major on its own: "an orphan quad
 * lies flat on the paving" and "a foliage quad interpenetrates the boundary-wall coping" are both
 * containment questions, and a containment question is answerable from a box and a name without
 * a plate.
 */
function censusOf(parts) {
  const rows = new Map();
  for (const part of parts) {
    const g = part.geometry;
    const name = g.name ?? '(unnamed)';
    const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox;
    let row = rows.get(name);
    if (!row) {
      row = {
        name,
        family: part.material?.userData?.family ?? null,
        tris: 0,
        count: 0,
        /**
         * ONE BOX PER INSTANCE, NOT A UNION, and the difference is the whole value of the field.
         * A union of every `plant-bed-crown` on a lot is a box the size of the lot, and it
         * overlaps everything — the first draft of the containment check reported six breaches
         * off exactly that and every one of them was the instrument, not the model. Containment
         * is per body or it is nothing.
         */
        boxes: [],
      };
      rows.set(name, row);
    }
    row.tris += tris;
    row.count += 1;
    row.boxes.push([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]);
  }
  return [...rows.values()].sort((a, b) => b.tris - a.tris);
}

/**
 * The pre-merge parts as `{ name, family, geometry }`, in build order.
 *
 * One flat list rather than a roll-up: a connectivity graph is over BODIES, and rolling twelve
 * lobes up under one name is exactly the operation that hides which of them is floating.
 */
function geometryOf(parts) {
  return parts.map((part) => ({
    name: part.geometry?.name ?? '(unnamed)',
    family: part.material?.userData?.family ?? null,
    variant: part.material?.userData?.variant ?? null,
    geometry: part.geometry,
  }));
}

/**
 * One geometry per material. Mirrors `building-kit.js`'s own merge so the two kits present the
 * board with the same shape of model.
 *
 * The attribute pruning is not tidiness: `mergeGeometries` requires every input to carry the
 * same attribute set, and a stray attribute on one primitive returns null for the whole merge
 * — silently, which would drop a whole material system off the building.
 */
function mergeByMaterial(parts) {
  const buckets = new Map();
  for (const part of parts) {
    const k = part.material?.uuid ?? 'none';
    if (!buckets.has(k)) buckets.set(k, { material: part.material, geos: [] });
    buckets.get(k).geos.push(part.geometry);
  }
  const merged = [];
  for (const { material, geos } of buckets.values()) {
    const prepared = [];
    for (const raw of geos) {
      let g = raw;
      if (g.index) {
        const nonIndexed = g.toNonIndexed();
        g.dispose();
        g = nonIndexed;
      }
      for (const name of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) {
        const n = g.attributes.position.count;
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      }
      prepared.push(g);
    }
    const geometry = prepared.length === 1 ? prepared[0] : mergeGeometries(prepared, false);
    if (!geometry) {
      for (let i = 1; i < prepared.length; i += 1) prepared[i].dispose();
      if (prepared[0]) {
        prepared[0].computeBoundingBox();
        prepared[0].computeBoundingSphere();
        MaterialLibrary.ensureUv2(prepared[0]);
        merged.push({ geometry: prepared[0], material });
      }
      continue;
    }
    if (prepared.length > 1) for (const g of prepared) g.dispose();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    MaterialLibrary.ensureUv2(geometry);
    geometry.name = `industrial:${material?.userData?.family ?? 'wall'}`;
    merged.push({ geometry, material });
  }
  return merged;
}

export { TILE, STOREY, SETBACK };
