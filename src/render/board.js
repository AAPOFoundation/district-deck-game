import { finishBuild, buildBudget, runBuild } from './startup.js';
// District Deck V3.00 — the board.
// Turns the frozen city into instanced geometry on the DDMG-1 lattice, and keeps the
// ownership overlay in sync with run state. The renderer READS state; it never writes it.

import { tagSurface } from './style/restyle.js';
import { restyleColour } from './style/restyle.js';
import { tagPortSurfaces } from './style/restyle.js';
import * as THREE from 'three';
import { rivalColours } from './rival-hue.js';
import { attachWetRoadUniform, updateWetRoadMaterial } from './wet-road.js';
import { applyPublicPavingSurface } from './public-paving.js';
import { planPublicTreePits } from './public-tree-pits.js';
import { clipGeometryToWorld, pitsTouchingRect } from './public-tree-pit-geometry.js';
import { applyReserveGroundField, applyReserveWearMaterial } from './reserve-ground.js';
import { waterRampHex } from './water/law.js';
import { enableStaticInstanceCulling } from './static-instance-culling.js';
import { syncFarms } from './fringe/farm.js';
import { syncCybercabDepot } from './fringe/cybercab-depot.js';
import { setBatchedVisibility } from './batching.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  TILE, ROAD, PITCH, BLOCK, STOREY, TILES_PER_BLOCK, CORRIDOR, globalTile, parseParcelId,
} from '../core/grid.js';
import { ARCHETYPES, RULES } from '../core/content.js';
import { archetypeIdOf, levelOf, viewerOwner } from '../core/economy.js';
import {
  livePadWorksJobs,
  slotParcelView,
  standingPadSlotPlacements,
} from '../core/pad-slots.js';
import {
  activeAdjacency, activeCovered, activeOrder, activeParcel,
  resolveCurrentParcelId,
} from '../core/city.js';
import { CIVIC_BAND_BY_USE, CIVIC_BY_ID } from '../core/landuse.js';
import { fitScale } from './assets.js';
// `resolveKitSpec` comes in beside the kit so `industrialFrontRotation` can compare a model's
// authored footprint against the parcel it is being placed on. board.js → building-kit.js is a
// one-way edge; building-kit.js does not import board.js, so this adds no cycle.
import { BuildingKit, resolveKitSpec } from './building-kit.js';
// The condition tier lives with the kit that varies on it. board.js -> industrial/index.js is a
// one-way edge; that module imports core, materials and grid, never board.
import { tierFromCondition } from './industrial/index.js';
import { ownsArchetype as civicKitOwns } from './civic/index.js';
import { ownsArchetype as commercialKitOwns, V370_PARKED } from './commercial/index.js';
// V3.70 corner-shop handedness. Measured over 20 seeds the split is 3 right : 1 left
// (143/43 of 186 parcels), not the 2:2 a block's four corners suggest — `frontage()`'s
// south/east/north/west push order is the compass cycle, so only the SW corner wraps.
import { handForParcel, HANDED_IDS } from './commercial/index.js';
const HANDED_SHOPS = new Set(HANDED_IDS);
import { BusFleet, samplePath as sampleBusPath } from './vehicles/bus.js';
import { stepTram, tramReservationYaw, tramTravelForward, TRAM_CRUISE, TRAM_DWELL } from './vehicles/tram.js';
import { rigTramDoors, updateTramDoors } from './fringe/transit.js';
import { publishAgendaTransit, tramCapability } from '../core/agendas.js';
import { BOARD_LENSES, BOARD_LENS_EVENT } from './event-overlays.js';
import {
  MaterialLibrary,
  isSharedLibraryMaterial,
  wallBucketFor,
  DISTRICT_WALL_CHROMA,
  familyInstanceTint,
  surfacesForArchetype,
} from './materials.js';
import { weatherOf } from '../core/weather.js';
import { wetRoadFactor } from './weather-fx.js';
import { Streetscape, planResidentialFrontages } from './streetscape.js';
import {
  createConstructionStageGroup,
  createRenovationScaffoldGroup,
} from './construction-site.js';
import { requestSiteWorkCycle } from './construction/animate.js';
import { finishedKey, measureFinishedForLot, finishedFit } from './construction/finished-measure.js';
import { constructionStageIndex } from '../core/construction-stages.js';
import {
  SHORE, edgeAxes, wallCentre, boardwalkCentre, alongLength, shorePoint,
} from './shore.js';
import {
  buildBoatShed, buildWallRun, buildSeawardStair, buildLandStair,
} from './coast-models.js';
import {
  FOLIAGE_SPECIES, planBoardFoliage, planResidentialVergeInfill,
  leafClusterAtlas,
} from './foliage.js';
import { furnitureLabel } from './furniture-labels.js';
import { authoredKitFromGroup, voxelKitFromModel, voxelKitFromMeshes } from './mischief.js';
import { plantedLift, lampHingeY, isLampBaseGeometry } from './sway.js';
import { TEXTURE_GENERATORS, TEXTURE_SIZE, hashSeed } from './textures.js';
import { BlockCoreLayer } from './block-cores/index.js';
import { tramStopKitEnabled, tramStopModel } from './tram-stop-kit.js';
import {
  P1_GROUNDING,
  attachContactBlob,
  contactDiscScale,
  makeContactMaterial,
  sharedContactGeometry,
} from './v4-p1-polish.js';

const DEG = Math.PI / 180;
const MODULES_PER_PITCH = PITCH / TILE; // 4
const WHITE = new THREE.Color(1, 1, 1);

/**
 * Measured outer-tile ground / kerb heights and the family hexes `_groundModel`
 * paints on the rim. From the GLBs, not the fallback boxes:
 *   ground-tile.glb           node y 0.01 ± 0.01  → top 0.02, bottom 0.00
 *   road-*.glb ground-contact same
 *   road-*.glb asphalt        node y 0.025 ± 0.015 → top 0.04
 *   road-*.glb kerb           node y 0.08 ± 0.08  → top 0.16 (3 m inboard)
 * The perimeter face is always a road module; its outer skin is ground-contact.
 */
export const BOARD_EDGE = Object.freeze({
  groundTopY: 0.02,
  groundBottomY: 0,
  asphaltTopY: 0.04,
  kerbTopY: 0.16,
  footpathWidth: CORRIDOR.footpathA[1] - CORRIDOR.footpathA[0],
  /** `_groundModel` road-asphalt-r5-worn */
  asphalt: '#474b51',
  /** `_groundModel` footpath-r4-light */
  footpath: '#c3bfb7',
  /** foliage family / ground-tile */
  ground: '#6a8a48',
});

/**
 * Ground/kerb mesh Y at the outer tile ring. Finite on the whole board
 * rectangle and just outside it (crust inner ring samples live at innerPad).
 * The rim face is module-ground-contact, so this is `groundTopY` everywhere.
 */
export function boardEdgeHeightAt(x, z, extent = { x: 272, z: 272 }) {
  const px = Number(x);
  const pz = Number(z);
  const ex = Number(extent?.x);
  const ez = Number(extent?.z);
  if (!Number.isFinite(px) || !Number.isFinite(pz)) return BOARD_EDGE.groundTopY;
  if (!Number.isFinite(ex) || !Number.isFinite(ez) || ex <= 0 || ez <= 0) {
    return BOARD_EDGE.groundTopY;
  }
  return BOARD_EDGE.groundTopY;
}

const STRATEGIC_KIND_ORDER = Object.freeze({ parcel: 0, civic: 1, reserve: 2 });
export const DEMOLITION_GLASS_OUT_STRIKES = 6;

export function openingsVisibleForDemolition(strikes) {
  const settled = Math.max(0, Math.min(10, Number(strikes) || 0));
  return settled < DEMOLITION_GLASS_OUT_STRIKES;
}

export function strategicSelectionKey(selection) {
  return selection ? `${selection.kind}:${selection.id}` : '';
}

/** One anchor per selectable land use, sorted on the global tile lattice. */
export function strategicSelectionOrder(city, state = null) {
  const anchors = [
    ...activeOrder(city, state).map((id) => {
      const parcel = activeParcel(city, state, id);
      return { kind: 'parcel', id, ...globalTile(parcel.bx, parcel.bz, parcel.tx, parcel.tz) };
    }),
    ...(city.civicUses ?? []).map((civic) => ({
      kind: 'civic',
      id: civic.id,
      ...globalTile(civic.bx, civic.bz, civic.tx, civic.tz),
    })),
    ...(city.reserve ? [{
      kind: 'reserve',
      id: city.reserve.id,
      ...globalTile(city.reserve.bx, city.reserve.bz, 0, 0),
    }] : []),
  ];
  return anchors
    .sort((a, b) =>
      a.gz - b.gz
      || a.gx - b.gx
      || STRATEGIC_KIND_ORDER[a.kind] - STRATEGIC_KIND_ORDER[b.kind]
      || a.id.localeCompare(b.id))
    .map(({ kind, id }) => ({ kind, id }));
}

/** Resolve any occupied global tile to the strategic land use that owns it. */
export function strategicSelectionAtTile(city, id, state = null) {
  const parcelId = activeParcel(city, state, id) ? id : activeCovered(city, state)[id];
  if (parcelId) return { kind: 'parcel', id: parcelId };
  const nonTradeable = city.nonTradeableTiles?.[id];
  if (nonTradeable?.kind === 'civic') {
    return { kind: 'civic', id: nonTradeable.civicId };
  }
  if (nonTradeable?.kind === 'public-reserve' && city.reserve) {
    return { kind: 'reserve', id: city.reserve.id };
  }
  return null;
}

// Kit models are authored front-to-+Z (framework §1.5). If a rebuild ever flips that,
// this is the single place it is corrected.
export const MODEL_FRONT_OFFSET_DEG = 0;

/**
 * Industrial archetypes whose PLACEMENT the industrial kit owns: `industrialFrontRotation` (so
 * the dock faces its street), `parcelTileSpan` (so the model is built to the parcel it stands
 * on rather than to its authored footprint), and the condition tier.
 *
 * MEMBERSHIP HERE IS NOT PROMOTION, and the two have been conflated once already at the cost of
 * a full review round. This set answers "who sizes and turns this building"; the V3.70 promotion
 * gate below answers "is this lane's model allowed on the shared board yet". `warehouse-datacentre`
 * is in this set and is simultaneously refused by that gate — it needs the rotation and span
 * handling to be capturable and gradeable at all, and it is at 2.5/5 NO-SHIP.
 */
export const INDUSTRIAL_KIT_IDS = Object.freeze(new Set([
  'warehouse-brick',
  'warehouse-richmond-loft',
  'warehouse-converted',
  // V3.70 L6 permit outcome. Registration for grading; promotion is the gate in `_modelFor`.
  'warehouse-datacentre',
  'factory-light',
  'space-works',
]));

/**
 * V3.70 kit hand-over set. An id lands here when its lane's Three.js kit has cleared the
 * V3.70 gate (harsh-critic ≥ 3.5/5, zero majors, blind win) and the commissioned GLB it
 * replaces should stop winning the `_modelFor` decision below.
 *
 * It is deliberately separate from `INDUSTRIAL_KIT_IDS`, which is a permanent statement about
 * who owns those four archetypes, and from `FORCE_KIT_IDS`, which is a review-only URL knob.
 * This one is a ratchet: ids go in as lanes finish and never come out.
 * See docs/next-phase/V370-AAA-PROGRAMME-SPEC.md §4.
 */
export const V370_KIT_IDS = Object.freeze(new Set([
  // R144: the authored grain yard replaces its runtime placeholder.
  'grain-plot',
  // R143: the reviewed eight-storey commercial apartment owns this rung.
  'apartment-mid',
  // V3.70 L1. These six are here for a different reason than the ratchet describes above, and the
  // reason is worth stating because it invalidated a whole round of grading.
  //
  // The board preferred `mvp/assets/models/<id>.glb` for them. `scripts/export-modern-glb.mjs`
  // calls `flattenMaterial()` on every part, which keeps colour, roughness, metalness and opacity
  // and **drops every map**. Measured on the shipped `house-modern-skillion.glb`: **37 materials,
  // 0 textures, 0 images** — four times the nine-bucket hard cap of §3.2, with every procedural
  // map gone. So the grunge, coursing and wear that §2.5 asks for existed only on the kit path
  // that `residential-lab.js` renders, and `play.html?seed=0` was showing an untextured model
  // nobody had graded.
  //
  // Sending these six to the kit is not promoting unproven work onto a shared board — it is
  // replacing a strictly worse asset with the one the programme has actually been reviewing.
  // V3.70, owner-reported 2026-08-18: "the corner shops are showing as the old models".
  //
  // `shop-corner` is the same defect as `school-primary` by a different route. The school was
  // explicitly PINNED to its GLB; this one needs no pin — a commissioned GLB simply wins by
  // default whenever one exists, so the two-storey rebuild (dwelling above the shop, per §5.3.11)
  // was never what the board drew. The three variants have no GLB and were always on the kit,
  // which is why only the incumbent looked wrong beside them.
  //
  // Same argument as the six L1 ids below: this replaces an asset that predates the rebuild with
  // the one the programme has actually been reviewing.
  'shop-corner',
  // Owner-reported 2026-08-18: the three period variants drew a 2-part runtime-procedural
  // BOX. They have no GLB, so the assumption was that the kit would win by default — it does
  // not. The registry pre-registers a `fallback: true` placeholder for an id it does not know,
  // and that placeholder beats the kit unless the id is named here. Measured on the live board:
  // `shop-corner` (named here) resolved `commercial-kit` with 9 parts, while the three variants
  // resolved `runtime-procedural` with 2. Registration made them PLACEABLE, not DRAWABLE.
  'shop-corner-victorian',
  'shop-corner-deco',
  'shop-corner-modern',
  // V3.36 Wave C — permit-only corner-shop finishes; their geometry is the shipped model.
  'childcare-centre',
  'medical-centre',
  'petrol-station',
  // Owner-reported 2026-08-18, and the same fault as the three shop variants above. Queried on
  // the live board BEFORE this line existed:
  //   office-lowrise       procedural-blender    552 tris  (kit builds 8,024)
  //   warehouse-datacentre runtime-procedural     24 tris  (kit builds 29,098) — a BOX
  //   warehouse-converted  procedural-blender    512 tris
  //   apartment-low        runtime-procedural     24 tris  — a BOX
  // Every one has a finished kit behind it. `walkup-flats` and `warehouse-brick` were already
  // correct at 24,980 and 26,290, which is why the fault looked subject-specific and was not.
  'office-lowrise',
  'warehouse-datacentre',
  'warehouse-converted',
  'apartment-low',
  // PERMIT_FINISH_ARCHETYPE[2] writes this id; without promotion it resolves to the box fallback.
  'apartment-permit',
  'house-modern-skillion',
  'house-modern-pavilion',
  'townhouse-modern-brick',
  'townhouse-modern-render',
  'apartment-modern-courtyard',
  'apartment-modern-bar',
  // Retail shed. Fourth id this day to need naming here: a new id has NO GLB, so the kit is
  // assumed to win by default — it does not, the registry's fallback placeholder does.
  'hammerbarn',
  // V3.38 Wave L — authored geometry-only civic, with no GLB counterpart.
  'courthouse',
  'walkup-beaux-arts',
  'walkup-moderne',
  // R141: reviewed authored civic builders replace runtime fallback prisms.
  'school-high',
  'missionary-school',
  'officer-school',
  'international-exchange',
]));

/**
 * V3.31 review affordance: `?forcekit=cafe-corner,stock-exchange` makes the procedural kit win
 * over a commissioned GLB for those ids, so a round can compare the two on plates instead of
 * arguing about them. Review-only — an empty set is the shipped behaviour, and nothing reads
 * this outside the two GLB-vs-kit decisions below.
 */
export const FORCE_KIT_IDS = (() => {
  try {
    const raw = new URLSearchParams(globalThis.location?.search ?? '').get('forcekit');
    if (!raw) return new Set();
    return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
})();

const FRONT_ROTATION_BY_SIDE = Object.freeze({
  south: 0,
  east: 90,
  north: 180,
  west: 270,
});

function longestIndustrialStreetSide(item, fallbackRotation) {
  if (!Array.isArray(item?.tiles) || !item.tiles.length) return null;
  const last = TILES_PER_BLOCK - 1;
  const counts = { south: 0, east: 0, north: 0, west: 0 };
  for (const tileId of item.tiles) {
    const { tx, tz } = parseParcelId(tileId);
    if (tz === last) counts.south += 1;
    if (tx === last) counts.east += 1;
    if (tz === 0) counts.north += 1;
    if (tx === 0) counts.west += 1;
  }
  const max = Math.max(...Object.values(counts));
  if (max === 0) return null;
  const candidates = Object.keys(counts).filter((side) => counts[side] === max);
  const normalizedFallback = ((fallbackRotation % 360) + 360) % 360;
  const fallbackSide = candidates.find((side) => FRONT_ROTATION_BY_SIDE[side] === normalizedFallback);
  return fallbackSide ?? candidates[0];
}

/**
 * The parcel's own tile span, in tiles, as `{ spanX, spanZ }`.
 *
 * A parcel is a set of tile ids rather than a rectangle, so the span is the bounding box of the
 * tiles it actually holds. This is what a model has to fit inside, and until V3.32 nothing
 * compared the two.
 */
export function parcelTileSpan(item) {
  if (!Array.isArray(item?.tiles) || !item.tiles.length) return null;
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const tileId of item.tiles) {
    const { tx, tz } = parseParcelId(tileId);
    if (!Number.isFinite(tx) || !Number.isFinite(tz)) return null;
    if (tx < minX) minX = tx;
    if (tx > maxX) maxX = tx;
    if (tz < minZ) minZ = tz;
    if (tz > maxZ) maxZ = tz;
  }
  return { spanX: maxX - minX + 1, spanZ: maxZ - minZ + 1 };
}

/**
 * Keep authored +Z industrial frontage aimed at its declared or longest street side — but never
 * at a side that would swing the building off its own lot.
 *
 * **The bug this closes, measured on seed 1.** `factory-light` is authored `footprint: [1, 2]`,
 * so it is 16 m across and 32 m deep. Its parcel there holds tiles `p3300(tx0,tz0)` and
 * `p3301(tx0,tz1)` — a span of 1 × 2 tiles, exactly the model. But `longestIndustrialStreetSide`
 * counts tiles touching each block edge, and a parcel one tile wide and two deep touches the
 * WEST edge with both of its tiles and the north edge with only one. West wins, the model is
 * rotated 270°, and its 32 m depth is laid across a lot that is 16 m wide. The building
 * overflowed its site by a full tile on each side, and on seed 0 it happened not to, purely
 * because that parcel declared a `rightOfWaySide` of north.
 *
 * The side-picker is not wrong about where the street is; it is answering a different question
 * from the one the placement needs. So the fit is now a constraint on the answer rather than a
 * change to how the answer is found: a quarter-turn is only offered when the rotated footprint
 * still fits the parcel's tile span, and a square footprint is unconstrained as before.
 *
 * **V3.71 Lane E — the guard was testing a box the kit does not build.** It read the AUTHORED
 * `resolveKitSpec(archetypeId).footprint`, but `industrial/index.js:489-491` builds to the LOT
 * SPAN whenever one is supplied:
 *
 *   const tilesX = Math.max(1, span?.spanX ?? spec.footprint[0]);
 *
 * So on the parcel path, where `board.js` hands the kit `parcelTileSpan(parcel)`, the model is
 * already the shape of its site and the authored `[1, 2]` describes nothing that is drawn. The two
 * agree today only because every industrial parcel `createCity` deals is 1 × 1 or 1 × 2 and
 * `warehouse-brick` happens to be authored `[1, 2]` — an accident, not a guard. Measured on a
 * 2 × 1 span with the authored test: it certifies a quarter-turn, and a span-built model turned a
 * quarter puts **7.96 m over each kerb**. Any new industrial id, any change to
 * `ARCHETYPES[...].footprint`, or any 2 × 1 parcel removes the coincidence.
 *
 * `opts.lotSpan` is therefore **the same object the caller is about to hand the kit**, and the
 * guard mirrors the kit's own fallback line for line. Omitting it keeps the authored footprint,
 * which is correct — and only correct — for a caller that builds without a span: the civic
 * industrial path (`_buildCivicUses` calls `buildingKit.get(useId, null, facade)` with no span,
 * so a civic `factory-light` really is the authored 1 × 2 and really does need the quarter-turn
 * the authored test grants it).
 */
export function industrialFrontRotation(item, archetypeId = item?.archetypeId ?? item?.useId, opts = {}) {
  const fallback = item?.rotation ?? 0;
  if (!INDUSTRIAL_KIT_IDS.has(archetypeId)) return fallback;

  const preferred = item?.placement?.rightOfWaySide
    ?? longestIndustrialStreetSide(item, fallback);
  const rotation = FRONT_ROTATION_BY_SIDE[preferred] ?? fallback;

  // The footprint the kit will actually build, in tiles, in the model's own local axes.
  const lotSpan = opts?.lotSpan ?? null;
  const built = lotSpan
    ? [lotSpan.spanX, lotSpan.spanZ]
    : resolveKitSpec(archetypeId)?.footprint;
  const span = parcelTileSpan(item);
  // A square footprint fits every quarter-turn, and a parcel we cannot measure is left alone
  // rather than guessed at — this must never make a placement worse than it found it.
  if (!span || !Array.isArray(built) || built[0] === built[1]) return rotation;

  const [fx, fz] = built;
  const fits = (deg) => {
    const sideways = ((deg % 360) + 360) % 360 % 180 !== 0;
    const needX = sideways ? fz : fx;
    const needZ = sideways ? fx : fz;
    return needX <= span.spanX && needZ <= span.spanZ;
  };
  if (fits(rotation)) return rotation;

  // The preferred side does not fit. Keep the axis that does and choose the end of it that still
  // faces a street, preferring the 180° flip of the requested side so the dock stays as close to
  // its intended aspect as the lot allows.
  const alternatives = (rotation === 90 || rotation === 270) ? [180, 0] : [90, 270];
  return alternatives.find(fits) ?? rotation;
}

/**
 * The right-of-way squeeze, expressed in the axes of the rotation the model is ACTUALLY DRAWN AT.
 *
 * **The fault this closes, measured on seed 225 `p0002`.** A data centre stood **0.46 m past its
 * pad and onto the footpath**, and so did the graded `warehouse-brick` control on the same parcel —
 * it was never a data-centre defect, and never an envelope defect either. Two rotations are
 * computed for one building and nothing reconciled them:
 *
 * - `city.js` `modelPlacement` (~:803-826) applies the 13.5/15 setback squeeze to
 *   `rowPlacement.setbackAxis`, which is a **world** axis, and then maps it into the model's local
 *   axes with `turned = rotationDeg % 180 !== 0` — where `rotationDeg` is the **parcel's**
 *   `face.rotation`.
 * - `industrialFrontRotation` above turns the model to face its street instead, from
 *   `placement.rightOfWaySide`. That is a different rotation, and on a right-of-way parcel it is
 *   frequently a different TURN PARITY.
 *
 * When the parities disagree the 0.9 lands on the wrong world axis: the axis that needed it is
 * drawn at 1.0 and still carries the ±0.5 m `modelOffset`, which is what walks the building onto
 * the pavement. Measured on that parcel: `modelScale {1, 1, 0.9}`, `modelOffset {0, 0.5}`, parcel
 * rotation 0, drawn yaw 270 — world X squeezed to 14.33 m on a 16 m axis that did not need it,
 * world Z left at 15.92 m and shoved half a metre, giving **z [48.540, 64.460]** against a pad of
 * **[48, 64]**. `grid.js:16-18` puts `footpathA` at `[0, 3]` of that corridor, so the plinth stood
 * inside the footpath. §3.6: nothing overhangs the pavement.
 *
 * The squeeze is a world-space requirement — the building has to be narrower ACROSS the lane,
 * whichever way its dock faces — so the correction is to re-express it for the drawn yaw. A
 * quarter-turn difference swaps the model's local X and Z, so the local scale swaps with it. Where
 * the two rotations already agree this returns `placement.modelScale` untouched, which is every
 * non-industrial building on the board and every industrial building not flanking a right of way.
 *
 * Deliberately NOT done here: changing `city.js`, changing the envelope, or making
 * `industrialFrontRotation` stop disagreeing. The first is another lane's file; the second is a
 * different fault (§5.4 — do not gut an object to move a metric); the third would throw away the
 * dock-faces-its-street behaviour the rotation exists for.
 */
export function industrialModelScale(item, appliedRotationDeg) {
  const base = item?.placement?.modelScale ?? { x: 1, y: 1, z: 1 };
  // Mirrors `city.js` `modelPlacement`'s own test, so the two cannot drift apart.
  const authoredTurned = (item?.rotation ?? 0) % 180 !== 0;
  const drawnTurned = (appliedRotationDeg ?? 0) % 180 !== 0;
  if (authoredTurned === drawnTurned) return base;
  return { x: base.z ?? 1, y: base.y ?? 1, z: base.x ?? 1 };
}

/**
 * Shrink a civic model so its plan stays inside the claimed pad.
 *
 * Seed 0 `supermarket-strip` is a 3×1 street-front (envelope 47 × 15 m). The
 * commissioned GLB is 38 × 24.5 m: width fits, depth spills 4.75 m into the
 * road. Scale is shrink-only and applied in the model's local axes so a
 * 180° frontage (this seed) and a quarter-turn frontage both stay on-pad.
 */
export function civicPadFitScale(item, model, appliedRotationDeg = item?.rotation ?? 0) {
  const env = item?.placement?.envelopeMetres;
  const size = model?.size;
  if (!env || !size || size.x < 0.001 || size.z < 0.001) {
    return { x: 1, y: 1, z: 1 };
  }
  const turned = (appliedRotationDeg ?? 0) % 180 !== 0;
  const padX = turned ? env.z : env.x;
  const padZ = turned ? env.x : env.z;
  return {
    x: Math.min(1, padX / size.x),
    y: 1,
    z: Math.min(1, padZ / size.z),
  };
}

function multiplyScale(a, b) {
  return {
    x: (a?.x ?? 1) * (b?.x ?? 1),
    y: (a?.y ?? 1) * (b?.y ?? 1),
    z: (a?.z ?? 1) * (b?.z ?? 1),
  };
}

/**
 * The whole placement transform for one building on one parcel, in one place.
 *
 * The lot span, the yaw and the scale are three answers to the same question and they were
 * computed at four separate call sites, from three different inputs, with nothing holding them
 * together. That is how a data centre came to be built to its parcel, turned by its street and
 * squeezed on the other axis. They are derived together here so a future caller cannot take two
 * of the three.
 *
 * `archetypeId` is the archetype BEING DRAWN, which on the dynamic path is not always
 * `parcel.archetypeId`: `_syncDynamicBuildings` passes `archetypeIdOf(...)`, the post-redevelop
 * id, and the span and the yaw both have to follow the model that is actually built.
 */
/** Headless board contract: one placement per standing 1×1 slot at the parent-tile centre. */
export function standingBuildingPlacements(city, state, parcelId) {
  const parcel = activeParcel(city, state, parcelId);
  if (!parcel) return [];
  const slots = standingPadSlotPlacements(city, state, parcelId);
  if (slots.length) {
    return slots.map((row) => {
      const view = slotParcelView(city, state, parcelId, row.slot) ?? {
        ...parcel,
        centre: row.centre,
        groundFootprint: [1, 1],
        consolidated: false,
      };
      const place = parcelBuildingTransform(view, row.archetypeId);
      return Object.freeze({
        key: `${parcelId}:${row.slot}`,
        parcelId,
        slot: row.slot,
        archetypeId: row.archetypeId,
        footprint: Object.freeze([1, 1]),
        x: row.centre.x + (place.modelOffset?.x ?? 0),
        y: 0,
        z: row.centre.z + (place.modelOffset?.z ?? 0),
        rotation: place.rotation,
      });
    });
  }
  const archetypeId = archetypeIdOf(city, state, parcelId);
  if (!archetypeId || state?.holdings?.[parcelId]?.siteCleared) return [];
  const place = parcelBuildingTransform(parcel, archetypeId);
  return [Object.freeze({
    key: parcelId,
    parcelId,
    slot: null,
    archetypeId,
    footprint: Object.freeze(parcel.groundFootprint ?? [1, 1]),
    x: parcel.centre.x + (place.modelOffset?.x ?? 0),
    y: 0,
    z: parcel.centre.z + (place.modelOffset?.z ?? 0),
    rotation: place.rotation,
  })];
}

export function parcelBuildingTransform(item, archetypeId = item?.archetypeId ?? item?.useId) {
  const lotSpan = INDUSTRIAL_KIT_IDS.has(archetypeId) ? parcelTileSpan(item) : null;
  const rotation = industrialFrontRotation(item, archetypeId, { lotSpan })
    + MODEL_FRONT_OFFSET_DEG;
  return {
    lotSpan,
    rotation,
    modelScale: industrialModelScale(item, rotation),
    modelOffset: item?.placement?.modelOffset ?? { x: 0, z: 0 },
  };
}

/** Stable facade recipe index shared by parcel and civic industrial products. */
export function deterministicFacade(id) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 4;
}

/**
 * Hospital R22 picks between two commissioned recipes from placement, not just id,
 * so the two GitHub hospital variants can both appear without changing city state.
 */
export function deterministicCivicFacade(civic) {
  const key = civic?.useId === 'hospital-district'
    ? `${civic.id}:${civic.centre?.x ?? 0}:${civic.centre?.z ?? 0}`
    : civic.id;
  return deterministicFacade(key);
}

export function corridorOpacityFor(lens, owner) {
  if (!BOARD_LENSES.includes(lens)) throw new RangeError(`Unknown board lens: ${lens}`);
  if (!['player', 'rival'].includes(owner)) throw new RangeError(`Unknown corridor owner: ${owner}`);
  if (lens !== 'corridor') return 0.25;
  return owner === 'player' ? 0.92 : 0.62;
}

/**
 * Pad plinths under the building. Owned lots no longer draw a plinth (P10b): the OWN lens outlines
 * them with the overlay layer's lit bars, so the garden and pad show through.
 * W2-ARCH R2: unowned pads are opaque and near-ground (not translucent) so street-oblique
 * never sorts transparent plinths through whole façades.
 * Legacy #2a2f36 black-hole unowned colour is still forbidden.
 */
/** Amber = your holdings; plum = Petridis. R16 board-token saturation. */
const OWNER_COLOURS = {
  player: new THREE.Color('#ffc14a'),
  get rival() { return new THREE.Color(rivalColours().plinth); },
  none: new THREE.Color('#5c6152'),
};

/** Arm directions in glTF space. Rotating +90deg about Y maps E->N->W->S->E. */
const ARM_CYCLE = ['E', 'N', 'W', 'S'];

function rotateArm(arm, steps) {
  const i = ARM_CYCLE.indexOf(arm);
  return ARM_CYCLE[(i + steps) % 4];
}

function armsAfterRotation(baseArms, steps) {
  return baseArms.map((a) => rotateArm(a, steps)).sort().join('');
}

/** Pick the road module and rotation whose arm set matches what this junction needs. */
function chooseRoadModule(arms) {
  const want = arms.slice().sort().join('');
  const candidates = [
    { id: 'road-cross', base: ['N', 'E', 'S', 'W'] },
    { id: 'road-tee', base: ['N', 'E', 'S'] },
    { id: 'road-corner', base: ['N', 'E'] },
    { id: 'road-straight', base: ['N', 'S'] },
  ];
  for (const candidate of candidates) {
    if (candidate.base.length !== arms.length) continue;
    for (let steps = 0; steps < 4; steps += 1) {
      if (armsAfterRotation(candidate.base, steps) === want) {
        return { id: candidate.id, steps };
      }
    }
  }
  return { id: 'road-straight', steps: 0 };
}

/**
 * Deterministic per-parcel tint. Pure hash of the parcel id — it consumes no PRNG
 * stream, so a visual change here can never move the economy (framework §2.1).
 */
function tintFor(parcelId) {
  let h = 0x811c9dc5;
  for (let i = 0; i < parcelId.length; i += 1) {
    h ^= parcelId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const a = ((h >>> 8) & 255) / 255;
  const b = ((h >>> 16) & 255) / 255;
  const value = 0.90 + a * 0.20;          // +/- 10% value
  const warm = 0.97 + b * 0.07;           // a little hue drift across the block
  return new THREE.Color(value * warm, value, value * (1.94 - warm));
}

function instanceTintForFamily(family, placement) {
  if (!family || family === 'glass' || family === 'asphalt') return WHITE;
  if (placement.roofFamily && family === placement.roofFamily) {
    return placement.roofTint ?? WHITE;
  }
  if (placement.trimFamily && family === placement.trimFamily) {
    return placement.trimTint ?? placement.tint ?? WHITE;
  }
  return placement.tint ?? WHITE;
}

/** Authored reserve grass over a neutral organic ground field.
 * Subtle cut direction and continuous wear leave variation to the shared field.
 */
export function reserveTurfTint(band, variation, worn = 0) {
  const u = THREE.MathUtils.clamp(variation, 0, 1);
  const wear = THREE.MathUtils.clamp(worn, 0, 1);
  return new THREE.Color(band ? '#607f50' : '#5f7e4f')
    .multiplyScalar(0.99 + u * 0.02)
    .lerp(new THREE.Color('#817963'), wear * 0.78);
}

// R131: one continuous, indexed lawn surface. The accepted 32x32 cell mask is
// retained, but adjacent cells share both vertex positions and smooth normals.
export function buildReserveLawnPanels(layout, placements, contacts = []) {
  const half = layout.HALF, pitch = half * 2 / 32, step = pitch / 2;
  const smooth = (a, b, value) => THREE.MathUtils.smoothstep(value, a, b);
  const height = (wx, wz) => {
    const dx = Math.abs(wx - layout.x), dz = Math.abs(wz - layout.z);
    const arm = Math.min(dx, dz) - layout.PATH_HALF;
    const circuit = Math.min(Math.abs(dx - layout.LOOP), Math.abs(dz - layout.LOOP)) - layout.LOOP_HALF;
    const apron = Math.hypot(dx, dz) - layout.APRON;
    const outer = half - Math.max(dx, dz);
    let bearing = Math.min(smooth(0.12, 2.6, Math.min(arm, circuit, apron)), smooth(0.0, 1.7, outer));
    const pondDistance = (Math.hypot((wx - layout.pond.x) / layout.pond.rx,
      (wz - layout.pond.z) / layout.pond.rz) - 1) * Math.min(layout.pond.rx, layout.pond.rz);
    const playDx = Math.abs(wx - layout.play.x) - layout.play.hx;
    const playDz = Math.abs(wz - layout.play.z) - layout.play.hz;
    const playDistance = Math.hypot(Math.max(0, playDx), Math.max(0, playDz))
      + Math.min(Math.max(playDx, playDz), 0);
    bearing = Math.min(bearing, smooth(0.0, 1.6, Math.min(pondDistance, playDistance)));
    for (const site of contacts) {
      let distance;
      if (site.hx != null && site.hz != null) {
        const yaw = site.yaw ?? 0, c = Math.cos(yaw), s = Math.sin(yaw);
        const px = wx - site.x, pz = wz - site.z;
        const ax = Math.abs(px * c - pz * s) - site.hx;
        const az = Math.abs(px * s + pz * c) - site.hz;
        distance = Math.hypot(Math.max(ax, 0), Math.max(az, 0)) + Math.min(Math.max(ax, az), 0);
      } else distance = Math.hypot(wx - site.x, wz - site.z)
        - (site.what === 'tree' ? 0.55 : Math.min(site.r ?? 0.6, 0.7));
      bearing = Math.min(bearing, smooth(0.0, 1.45, distance));
    }
    const broad = 0.72 + 0.28 * Math.cos((wx - layout.x) * 0.12 + (wz - layout.z) * 0.075);
    return 0.27 + 0.048 * bearing * broad;
  };
  const active = new Set();
  for (const row of placements) {
    const i = Math.round((row.position.x - layout.x + half) / pitch - 0.5);
    const j = Math.round((row.position.z - layout.z + half) / pitch - 0.5);
    active.add(`${i},${j}`);
  }
  const positions = [], normals = [], uvs = [], indices = [], topIndex = new Map();
  const addVertex = (wx, wy, wz, nx, ny, nz) => {
    const index = positions.length / 3;
    positions.push(wx, wy, wz); normals.push(nx, ny, nz);
    uvs.push((wx - layout.x + half) / (2 * half), (wz - layout.z + half) / (2 * half));
    return index;
  };
  const top = (i, j) => {
    const key = `${i},${j}`;
    if (topIndex.has(key)) return topIndex.get(key);
    const wx = layout.x - half + i * step, wz = layout.z - half + j * step;
    const eps = 0.12;
    const n = new THREE.Vector3(height(wx - eps, wz) - height(wx + eps, wz), 2 * eps,
      height(wx, wz - eps) - height(wx, wz + eps)).normalize();
    const index = addVertex(wx, height(wx, wz), wz, n.x, n.y, n.z);
    topIndex.set(key, index);
    return index;
  };
  let topTriangles = 0, boundaryTriangles = 0;
  for (const key of active) {
    const [i, j] = key.split(',').map(Number);
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      const p = top(i * 2 + a, j * 2 + b), q = top(i * 2 + a + 1, j * 2 + b);
      const r = top(i * 2 + a, j * 2 + b + 1), s = top(i * 2 + a + 1, j * 2 + b + 1);
      indices.push(p, r, q, q, r, s); topTriangles += 2;
    }
    for (const [di, dj, axis, side] of [[-1, 0, 'x', -1], [1, 0, 'x', 1], [0, -1, 'z', -1], [0, 1, 'z', 1]]) {
      if (active.has(`${i + di},${j + dj}`)) continue;
      for (let t = 0; t < 2; t++) {
        const gx0 = axis === 'x' ? (i + (side > 0 ? 1 : 0)) * 2 : i * 2 + t;
        const gz0 = axis === 'z' ? (j + (side > 0 ? 1 : 0)) * 2 : j * 2 + t;
        const gx1 = gx0 + (axis === 'z' ? 1 : 0), gz1 = gz0 + (axis === 'x' ? 1 : 0);
        const x0 = layout.x - half + gx0 * step, z0 = layout.z - half + gz0 * step;
        const x1 = layout.x - half + gx1 * step, z1 = layout.z - half + gz1 * step;
        const nx = axis === 'x' ? side : 0, nz = axis === 'z' ? side : 0;
        const a = addVertex(x0, height(x0, z0), z0, nx, 0, nz);
        const b = addVertex(x1, height(x1, z1), z1, nx, 0, nz);
        const c = addVertex(x0, 0.235, z0, nx, 0, nz);
        const d = addVertex(x1, 0.235, z1, nx, 0, nz);
        if ((axis === 'z' && side < 0) || (axis === 'x' && side > 0)) indices.push(a, b, c, b, d, c);
        else indices.push(a, c, b, b, c, d);
        boundaryTriangles += 2;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('uv2', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.userData.reserveLawn = { cells: active.size, topTriangles, boundaryTriangles,
    sharedTopVertices: topIndex.size, contactSites: contacts.length };
  return geometry;
}

// Compare the Float32 values actually stored, not unrounded matrix doubles.
// No cached owner state: later external writes and replacement attributes are observed.
export function writeInstancePoseIfChanged(mesh, index, matrix, color = null) {
  const equal = (array, offset, values) => array instanceof Float32Array
    && Number.isInteger(offset) && offset >= 0 && offset + values.length <= array.length
    && values.every((value, i) => Number.isFinite(value) && Object.is(array[offset + i], Math.fround(value)));
  let changed = 0;
  if (!equal(mesh.instanceMatrix?.array, index * 16, matrix.elements)) {
    mesh.setMatrixAt(index, matrix); mesh.instanceMatrix.needsUpdate = true; changed |= 1;
  }
  if (color && mesh.setColorAt) {
    if (!equal(mesh.instanceColor?.array, index * 3, [color.r, color.g, color.b])) {
      mesh.setColorAt(index, color); if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; changed |= 2;
    }
  }
  return changed;
}

// Only adjacent opaque parts on one live hinge share a submission. Their vertices
// are already in the same pivot-local space; material objects/hooks are not copied.
function openingGeometryKey(geometry) {
  if (!geometry?.isBufferGeometry || Object.keys(geometry.morphAttributes).length
    || geometry.morphTargetsRelative || geometry.drawRange.start !== 0
    || geometry.drawRange.count !== Infinity) return null;
  const names = Object.keys(geometry.attributes).sort();
  if (!names.includes('position')) return null;
  const attributes = names.map(name => geometry.attributes[name]);
  if (geometry.index) attributes.push(geometry.index);
  if (geometry.index && (geometry.index.normalized || geometry.index.itemSize !== 1)) return null;
  if (attributes.some(a => ![THREE.BufferAttribute, THREE.Float32BufferAttribute,
    THREE.Uint16BufferAttribute, THREE.Uint32BufferAttribute].includes(a.constructor)
    || a.usage !== THREE.StaticDrawUsage)) return null;
  return JSON.stringify([Boolean(geometry.index), attributes.map(a => [
    a.itemSize, a.normalized, a.array.constructor.name, a.gpuType, a.name,
  ]), names]);
}

function mergeOpeningParts(parts) {
  const result = [];
  for (let i = 0; i < parts.length;) {
    const first = parts[i], material = first.material;
    const key = !Array.isArray(material) && material?.isMaterial && !material.isShaderMaterial
      && !material.transparent && !(material.transmission > 0)
      && material.onBeforeRender === THREE.Material.prototype.onBeforeRender
      ? openingGeometryKey(first.geometry) : null;
    let end = i + 1;
    while (key && end < parts.length && parts[end].material === material
      && openingGeometryKey(parts[end].geometry) === key) end++;
    if (end === i + 1) { result.push(first); i = end; continue; }
    const sources = parts.slice(i, end).map(part => part.geometry);
    const geometry = mergeGeometries(sources, false);
    if (!geometry) { result.push(...parts.slice(i, end)); i = end; continue; }
    // mergeGeometries drops existing groups/names. Preserve their element ranges
    // and material indices even though these meshes have a single material.
    let offset = 0;
    for (const source of sources) {
      for (const group of source.groups) geometry.addGroup(offset + group.start, group.count, group.materialIndex);
      offset += source.index?.count ?? source.attributes.position.count;
    }
    for (const name of Object.keys(geometry.attributes)) {
      geometry.attributes[name].name = first.geometry.attributes[name].name;
    }
    if (geometry.index) {
      geometry.index.name = first.geometry.index.name;
      geometry.index.gpuType = first.geometry.index.gpuType;
    }
    geometry.name = sources.map(source => source.name).filter(Boolean).join(' + ');
    geometry.userData.ownsGeometry = true;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    for (const source of sources) source.dispose();
    result.push({ geometry, material });
    i = end;
  }
  return result;
}


/** One InstancedMesh per (model, material). Framework §6 / optimize-threejs-games. */
export function buildInstanced(model, placements, { castShadow = true, receiveShadow = true, tint = false, cullInstances = false } = {}) {
  const group = new THREE.Group();
  if (!model || !placements.length) return { group, meshes: [] };
  const matrix = new THREE.Matrix4();
  const meshes = [];
  // Instance tint multiplies albedo. Glass / asphalt keep authored family colour.
  // Walls, roofs and trim take hashed Monopoly Plus variants (Lane H).
  for (const part of model.parts) {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, placements.length);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.frustumCulled = false;
    const family = part.material?.userData?.family ?? '';
    placements.forEach((placement, index) => {
      matrix.compose(placement.position, placement.quaternion, placement.scale);
      mesh.setMatrixAt(index, matrix);
      if (tint) {
        mesh.setColorAt(index, instanceTintForFamily(family, placement));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (cullInstances) enableStaticInstanceCulling(mesh);
    group.add(mesh);
    meshes.push(mesh);
  }
  return { group, meshes };
}

/**
 * A soft radial falloff used as a fake ambient-occlusion decal. Three.js has no SSAO
 * without a post-processing pipeline, and the whole miniature reads as floating without
 * SOMETHING darkening the ground where a building meets it. One texture, one instanced
 * plane per building, no extra passes. Foliage owns its own real shadows; stamping the
 * retired `city.trees` roster here creates orphaned, overlapping black discs on roads.
 */
const CONTACT_SKIP_PROP = new Set([
  'granite-tree-guard',
]);

function placement(x, y, z, rotationDeg, scale = 1) {
  const scaleVector = scale?.isVector3
    ? scale.clone()
    : typeof scale === 'number'
      ? new THREE.Vector3(scale, scale, scale)
      : new THREE.Vector3(scale.x ?? 1, scale.y ?? 1, scale.z ?? 1);
  return {
    position: new THREE.Vector3(x, y, z),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationDeg * DEG),
    scale: scaleVector,
  };
}

// One joined playground slide, authored in pad-local metres and emitted as one
// painted-joinery mesh. The chute stations carry a continuous floor and two
// side returns through the short level run-out; the rear ladder actually lands
// on the supported launch deck rather than ending behind a decorative crossbar.
// A small rooted core fills only the interstices. Broad overlapping leaf-bearing
// surfaces cover its top and sides; each samples one actual leaf in the shared
// atlas at a useful world scale, rather than shrinking 45 leaves into a card.
function reserveLeafBedMap(foliageMap, quality) {
  const atlas = leafClusterAtlas();
  const source = atlas.image.data;
  const image = foliageMap?.image;
  if (foliageMap && foliageMap.colorSpace !== THREE.SRGBColorSpace) {
    throw new Error('Reserve foliage albedo must be sRGB');
  }
  // MaterialLibrary omits CanvasTexture packs in Node tests. The exported
  // generator and seed law are the same ones used by TextureLibrary.getSet;
  // browser construction reads its already-built canvas instead.
  const size = TEXTURE_SIZE[quality] ?? TEXTURE_SIZE.high;
  const pack = image?.getContext
    ? image.getContext('2d', { willReadFrequently: true })
      .getImageData(0, 0, image.width, image.height).data
    : TEXTURE_GENERATORS.foliage(size, hashSeed(`v310-w1:foliage:${size}:r17`)).albedo;
  const packWidth = image?.width ?? size, packHeight = image?.height ?? size;
  const data = new Uint8Array(source); // Texture.clone() would share the atlas Source.
  for (let y = 0; y < 64; y += 1) for (let x = 0; x < 128; x += 1) {
    // The accepted foliage pack repeats five times across its surface. Reuse its
    // actual RGB texels in that UV rhythm; the atlas keeps every alpha byte.
    const sx = Math.floor(((x / 128 * 5) % 1) * packWidth);
    const sy = Math.floor(((y / 64 * 5) % 1) * packHeight);
    const at = (y * 128 + x) * 4;
    const from = (sy * packWidth + sx) * 4;
    data[at] = pack[from];
    data[at + 1] = pack[from + 1];
    data[at + 2] = pack[from + 2];
  }
  const map = new THREE.DataTexture(data, 128, 64, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  return map;
}

function reserveLeafBedGeometry(quality = 'high') {
  const upperCount = quality === 'low' ? 10 : quality === 'medium' ? 12 : 14;
  const sideCount = quality === 'low' ? 6 : quality === 'medium' ? 7 : 8;
  const shell = new THREE.SphereGeometry(0.58, quality === 'low' ? 5 : 6, 3);
  // Keep the accepted -0.445 local underside and hence the planted support
  // planes, while reducing smooth exposed core acreage by over half.
  shell.scale(1, 0.55, 1);
  shell.translate(0, -0.126, 0);
  const shellColor = [];
  for (let i = 0; i < shell.attributes.position.count; i += 1) {
    const up = (shell.attributes.position.getY(i) + 0.445) / 0.64;
    const shade = 0.31 + Math.max(0, up) * 0.12;
    shellColor.push(shade, shade, shade);
    shell.attributes.uv.setX(i, 0.04 + shell.attributes.uv.getX(i) * 0.39);
  }
  shell.setAttribute('color', new THREE.Float32BufferAttribute(shellColor, 3));
  const leaves = new THREE.BufferGeometry(), positions = [], colours = [], uvs = [], indices = [];
  const cut = [[0,-.85],[-.55,-.35],[-.85,.10],[0,.90],[.85,.10],[.55,-.35]];
  const count = upperCount + sideCount;
  for (let i = 0; i < count; i += 1) {
    const side = i >= upperCount, j = side ? i - upperCount : i;
    const step = side ? sideCount : upperCount;
    const a = (j + (side ? .43 : 0)) * Math.PI * 2 / step + Math.sin(i * 2.37) * .075;
    const length = 1.42 + Math.sin(i * 1.71) * .085;
    const peak = .55 + Math.sin(a * 2.0 + .42) * .10 + Math.sin(i * 2.31) * .035;
    const radial = [side ? .30 : .08,side ? .58 : .32,side ? 1.02 : .91,length,
      side ? 1.02 : .91,side ? .58 : .32];
    const tangent = [0,-.24,-.45,0,.45,.24];
    const height = side ? [.035,.18,.31,.21,.31,.18] : [.20,peak-.03,peak+.05,peak-.08,peak+.05,peak-.03];
    const atlasLeaf = (i * 7 + 3) % 45;
    const cx = .5 + Math.sin(atlasLeaf * 2.4) * .42;
    const cy = .08 + (atlasLeaf % 15) * .06;
    const turn = atlasLeaf * 1.71;
    const base = positions.length / 3;
    for (let k = 0; k < 6; k += 1) {
      const r = radial[k],t = tangent[k] * (side ? .86 : 1);
      positions.push(Math.sin(a)*r + Math.cos(a)*t,height[k],Math.cos(a)*r - Math.sin(a)*t);
      const lx=cut[k][0]*.026,ly=cut[k][1]*.057;
      uvs.push(.5 + (cx + lx*Math.cos(turn)-ly*Math.sin(turn))*.5,
        cy + lx*Math.sin(turn)+ly*Math.cos(turn));
      const shade = side ? (i%3===0?.66:.78) : (i%5===0?.68:i%3===0?.84:.76);
      colours.push(shade,shade,shade);
    }
    for (let k = 1; k < 5; k += 1) indices.push(base,base+k,base+k+1);
  }
  leaves.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  leaves.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  leaves.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
  leaves.setIndex(indices);leaves.computeVertexNormals();
  const parts = [shell,leaves];
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  geometry.computeBoundingBox();
  geometry.userData.reserveLeafBed = {coreTriangles:shell.index.count/3,
    leafTriangles:leaves.index.count/3,upperCount,sideCount};
  return geometry;
}

function reserveSlideGeometry(px, pz) {
  const positions = [], colours = [], indices = [];
  const BLUE = new THREE.Color('#0d4bbf');
  const YELLOW = new THREE.Color('#e8a808');
  const vertex = (x, y, z, colour) => {
    positions.push(px + x, y, pz + z);
    colours.push(colour.r, colour.g, colour.b);
    return positions.length / 3 - 1;
  };
  const quad = (a, b, c, d, colour) => {
    const start = positions.length / 3;
    for (const p of [a, b, c, d]) vertex(...p, colour);
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  };
  const box = (sx, sy, sz, x, y, z, colour) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(x, y, z);
    const start = positions.length / 3;
    for (let i = 0; i < g.attributes.position.count; i++) {
      const p = g.attributes.position;
      vertex(p.getX(i), p.getY(i), p.getZ(i), colour);
    }
    for (const i of g.index.array) indices.push(start + i);
    g.dispose();
  };
  const beam = (a, b, width, depth, colour) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const g = new THREE.BoxGeometry(width, delta.length(), depth);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(start.add(end).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
    const offset = positions.length / 3;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) vertex(p.getX(i), p.getY(i), p.getZ(i), colour);
    for (const i of g.index.array) indices.push(offset + i);
    g.dispose();
  };
  // The pad surface is y=.377. Four legs carry the launch deck down to it.
  for (const x of [2.14, 3.26]) for (const z of [-1.81, -1.08])
    box(0.13, 2.73, 0.13, x, 1.745, z, BLUE);
  box(1.30, 0.16, 0.99, 2.70, 2.50, -1.45, BLUE); // top 2.58
  for (const x of [2.10, 3.30])
    box(0.095, 0.095, 0.91, x, 3.04, -1.45, BLUE); // side handrails
  // Open rear entry. Inclined side bars and five horizontal rungs join the deck.
  for (const x of [2.35, 3.05])
    beam([x, 0.41, -2.76], [x, 2.57, -1.87], 0.11, 0.11, BLUE);
  for (let rung = 0; rung < 5; rung++) {
    const t = (rung + 1) / 6;
    box(0.77, 0.105, 0.17, 2.70, 0.41 + 2.16 * t, -2.76 + 0.89 * t, BLUE);
  }
  // A continuous, closed 10 cm floor bends gently into a horizontal run-out.
  const stations = [
    {z: -1.04, y: 2.54, lip: 0.18},
    {z: -0.78, y: 2.46, lip: 0.18},
    {z:  1.16, y: 0.57, lip: 0.18},
    {z:  1.43, y: 0.49, lip: 0.16},
    {z:  1.98, y: 0.49, lip: 0.09},
  ];
  const prism = (left, right, topOffset, bottomOffset) => {
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i], b = stations[i + 1];
      const topA = a.y + topOffset(a), topB = b.y + topOffset(b);
      const botA = a.y + bottomOffset, botB = b.y + bottomOffset;
      quad([left, topA, a.z], [left, topB, b.z], [right, topB, b.z], [right, topA, a.z], YELLOW);
      quad([right, botA, a.z], [right, botB, b.z], [left, botB, b.z], [left, botA, a.z], YELLOW);
      quad([left, topA, a.z], [left, botA, a.z], [left, botB, b.z], [left, topB, b.z], YELLOW);
      quad([right, topB, b.z], [right, botB, b.z], [right, botA, a.z], [right, topA, a.z], YELLOW);
    }
    const first = stations[0], last = stations.at(-1);
    quad([right, first.y + topOffset(first), first.z], [right, first.y + bottomOffset, first.z],
      [left, first.y + bottomOffset, first.z], [left, first.y + topOffset(first), first.z], YELLOW);
    quad([left, last.y + topOffset(last), last.z], [left, last.y + bottomOffset, last.z],
      [right, last.y + bottomOffset, last.z], [right, last.y + topOffset(last), last.z], YELLOW);
  };
  prism(2.23, 3.17, () => 0, -0.10);
  prism(2.15, 2.25, station => station.lip, -0.045);
  prism(3.15, 3.25, station => station.lip, -0.045);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(
    Array.from({length: positions.length / 3}, (_, i) => [(positions[i * 3] - px) * 0.25, (positions[i * 3 + 2] - pz) * 0.25]).flat(), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  MaterialLibrary.ensureUv2(geometry);
  return geometry;
}

// Parcels the Wire will still report: plan moves that land. Auction slots, a spoiled
// acquire, and a works verb on a parcel the rival will not hold are skipped, matching
// executeRivalMove's moved:false results. Cash-fund failures are not modelled here.
export function rivalBoardTargets(state) {
  const intent = state?.rival?.intent;
  const plan = Array.isArray(intent?.plan) && intent.plan.length
    ? intent.plan
    : (intent?.parcelId ? [intent] : []);
  const owner = new Map();
  for (const [id, holding] of Object.entries(state?.holdings ?? {})) {
    if (holding?.owner) owner.set(id, holding.owner);
  }
  const reserved = new Set();
  for (const event of Object.values(state?.events?.byId ?? {})) {
    if (!event || event.type !== 'auction' || event.resolveQuarter !== state?.quarter) continue;
    if (event.status === 'resolved' || event.status === 'cancelled') continue;
    for (const id of event.anchorIds ?? []) reserved.add(id);
  }
  const out = [];
  const seen = new Set();
  for (const move of plan) {
    if (!move || move.moved === false || !move.parcelId) continue;
    const verb = move.verb;
    if (verb === 'auction' || verb === 'auction-pass') continue;
    const id = move.parcelId;
    if (reserved.has(id) && verb !== 'insure') continue;
    const held = owner.get(id) ?? null;
    let lands = false;
    if (verb === 'acquire') {
      lands = !held;
      if (lands) owner.set(id, 'rival');
    } else if (verb === 'lease' || verb === 'renovate' || verb === 'redevelop' || verb === 'insure') {
      lands = held === 'rival';
    }
    if (!lands || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export class Board {
  constructor(...args) {
    finishBuild(this._buildStages(...args));
  }

  static *build(...args) {
    const view = Object.create(this.prototype);
    yield* view._buildStages(...args);
    return view;
  }

  static create(...args) {
    const options = args[2] ?? {};
    return runBuild(this.build(...args), options.startup);
  }

  // Keep the synchronous builder hooks virtual for specialised boards. Base
  // implementations use their iterator so the staged path can still yield.
  *_buildMethodSteps(name) {
    if (this[name] !== Board.prototype[name]) return this[name]();
    return yield* this[`${name}Steps`]();
  }

  *_buildStages(city, registry, { quality = 'high' } = {}) {
    // COPY-DRAFT: loading stages describe work about to run.
    yield 'Preparing the building kit';
    this.city = city;
    this.registry = registry;
    this.quality = quality;
    this.root = new THREE.Group();
    this.root.name = 'board';

    // V3.10 §7 — shared procedural PBR library. Owns textures; meshes must not dispose them.
    this.materials = new MaterialLibrary({ quality });
    // V3.10 W2-ARCH — procedural form language for parcel massing (window reveals, eaves,
    // hip/gable/parapet, verandahs, shop awnings). Prefer over placeholder box GLBs.
    this.buildingKit = new BuildingKit(this.materials, { quality, liveOpenings: true });
    // Rematerialised kit models (archetypeId -> model with library materials). Geometry is
    // still owned by the registry; only the material pointers change.
    this._rematerialized = new Map();
    this._roadMaterial = null;
    this._roadWetUniform = { value: 0 };

    this.parcelIndex = new Map();   // parcelId -> index into the ownership overlay
    this.pickTargets = [];          // invisible parcel/civic/reserve boxes for exact selection
    this.mischiefTargets = [];      // renderer-only street furniture/tree/tram adapters
    this.mischiefPickTargets = [];
    this.mischiefPickGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.mischiefPickMaterial = new THREE.MeshBasicMaterial({ visible: false });
    this.trams = [];
    /** Animated route buses that enter / dwell / leave the single transport interchange. */
    this.interchangeBuses = [];
    this.staticBuildings = new Map();
    this.dynamicBuildings = new Map();
    this.demolitionStrikeAnimations = new Map();
    this.demolitionAnimations = new Map();
    this.completionAnimations = new Map();
    this.siteSheds = new Map();
    this.siteKits = new Map();
    /** parcelId → { group, stageIndex, toArchetype, completionQuarter } */
    this.constructionStages = new Map();
    // Model-coordinate fits (including suspect nulls), retained across repeat commissions.
    this._constructionFits = new Map();
    /** parcelId → { group, storeys } — solid renovation scaffold (not wireframe planes) */
    this.renovationScaffolds = new Map();
    this.footprintGhost = null;
    this.stats = { drawCalls: 0, instances: 0, triangles: 0 };
    this.activeLens = 'ownership';
    this.lastState = null;
    this.topologyVersion = 0;
    this._onLensChange = (event) => this.setLens(event.detail?.lens);
    globalThis.window?.addEventListener(BOARD_LENS_EVENT, this._onLensChange);

    yield 'Public Tree Pits';
    this._publishPublicTreePits();
    yield 'Plinth';
    this._buildPlinth();
    yield 'Ground';
    yield* this._buildMethodSteps('_buildGround');
    yield 'Streetscape';
    this._buildStreetscape();
    yield 'Topology';
    yield* this._buildMethodSteps('_buildTopology');
    yield 'Building the block cores';
    const skipCores = typeof location !== 'undefined'
      && new URLSearchParams(location.search).get('cores') === '0';
    if (skipCores) {
      this.coreLayer = null;
    } else {
      try {
        this.coreLayer = new BlockCoreLayer(this);
      } catch (err) {
        console.error('block-core layer failed', err);
        this.coreLayer = null;
      }
    }
    yield 'Waterfront';
    this._buildWaterfront();
    yield 'Buildings';
    yield* this._buildMethodSteps('_buildBuildings');
    yield 'Building Openings';
    yield* this._buildMethodSteps('_buildBuildingOpenings');
    yield 'Succession Overlays';
    this._buildSuccessionOverlays();
    yield 'Civic Buildings';
    yield* this._buildMethodSteps('_buildCivicBuildings');
    // After civics so bus routes can lock to the single interchange kit frame.
    yield 'Contact Shadows';
    this._buildContactShadows();
    yield 'Trees';
    this._buildTrees();
    yield 'Props';
    this._buildProps();
    yield 'Transit';
    this._buildTransit();
    yield 'Interchange Buses';
    this._buildInterchangeBuses();
    yield 'Ownership Overlay';
    this._buildOwnershipOverlay();
    yield 'Pick Targets';
    this._buildPickTargets();
    yield 'Selection';
    this._buildSelection();
    yield 'Amenity Affordance';
    this._buildAmenityAffordance();
    yield 'Corridors';
    this._buildCorridors();
    yield 'Rival Markers';
    this._buildRivalMarkers();
  }

  /**
   * Model for a parcel or civic id.
   *
   * Parcel archetypes (ARCHETYPES): prefer the W2-ARCH building kit so streetscape
   * form language replaces the placeholder extruded-box Blender kit.
   * Civic / commissioned GLBs: keep the registry path when a non-fallback asset is
   * present; kit only when the asset is missing or runtime-procedural.
   * Cached per archetype / district bias.
   */
  /**
   * `lotSpan` is `{ spanX, spanZ }` in TILES, measured from the parcel the model is going on.
   *
   * **Why it exists, measured across forty seeds.** `warehouse-brick` is authored
   * `footprint: [1, 2]`, but its parcels are not all that shape: **49 of 80 are a single tile**
   * and only 31 are two. The retired commissioned GLB was about 12.8 × 15.0 m — one tile — so
   * the mismatch was invisible until V3.32 rebuilt the warehouse to its authored footprint and
   * it became a 31 m building on a 16 m lot, overhanging into the street and the neighbour on
   * both ends. No rotation fixes that; a 1×2 model does not fit a 1×1 parcel at any angle.
   *
   * So the lot span rides in the cache key and the industrial kit sizes its envelope to the
   * parcel it is actually standing on. Omitting it keeps the authored footprint, which is what
   * every non-industrial caller wants and what the civic factory already gets right.
   */
  _modelFor(archetypeId, districtId = null, facade = 0, lotSpan = null, conditionTier = null, hand = null, storeys = null, signText = null) {
    const f = Math.max(0, Math.min(3, facade | 0));
    // Batch / cache by wall-family bucket (not raw district) so six districts collapse.
    const bucket = wallBucketFor(archetypeId, districtId);
    // Two parcels of different shape cannot share one model, so the span is part of the identity.
    // It is only appended when present, so every existing key is byte-identical to before.
    const spanKey = lotSpan ? `:l${lotSpan.spanX}x${lotSpan.spanZ}` : '';
    // Same reasoning for the condition tier: a renovated bond store has a cleared yard and no
    // security fencing, which is different GEOMETRY and so a different model, not a tint.
    const tierKey = conditionTier ? `:c${conditionTier}` : '';
    // V3.70 corner-shop handedness — the hand is part of the model identity, exactly as the
    // span and the condition tier are. Two hands are two meshes; omit it and the first corner
    // drawn is served to all four.
    const handKey = hand === 'left' ? ':hL' : '';
    const storeyKey = storeys ? `:s${storeys}` : '';
    const signKey = signText ? `:sign${encodeURIComponent(String(signText))}` : '';
    const key = `${archetypeId}:f${f}:w${bucket}${spanKey}${tierKey}${handKey}${storeyKey}${signKey}`;
    if (this._rematerialized.has(key)) return this._rematerialized.get(key);

    const source = this.registry?.get?.(archetypeId) ?? null;
    const isParcelArchetype = Boolean(ARCHETYPES[archetypeId]);
    const isCivic = Boolean(CIVIC_BY_ID[archetypeId]);
    const hasRealGlb = Boolean(source && source.source !== 'runtime-procedural' && !source.fallback);
    // V3.32 industrial kit owns factory + warehouse. The Aug 10 v303 factory map
    // is a simplified stand-in; the industrial kit is the later AAA model.
    const forceIndustrialKit = INDUSTRIAL_KIT_IDS.has(archetypeId);
    // V3.70: `V370_KIT_IDS` overrides the modern-GLB preference for the same reason it overrides
    // the commissioned one — the exporter flattens materials and drops every map, so the GLB is a
    // strictly worse asset than the kit it was exported from. See the set's own comment.
    const preferModernGlb = source?.source === 'modern-glb'
      && hasRealGlb
      && !FORCE_KIT_IDS.has(archetypeId)
      && !V370_KIT_IDS.has(archetypeId);
    // Only texture-first / later map GLBs that still beat the kit. Hospital, cafe,
    // stock-exchange, factory and remand use the quality-loop kits (R20 / V3.31 / V3.32).
    const commissionedPreferGlb = (
      source?.source === 'commissioned-blender'
      && hasRealGlb
      && !FORCE_KIT_IDS.has(archetypeId)
      && !V370_KIT_IDS.has(archetypeId)
      && (
        archetypeId === 'supermarket-strip'
        // `school-primary` REMOVED 2026-08-18, owner-reported: "the school is not showing".
        //
        // It was showing — the v303 commissioned GLB was, and L3's eight rounds of school work
        // never reached the board. The hospital and community centre were already on their kits;
        // the school alone stayed pinned here, so the one civic subject the programme rebuilt from
        // scratch twice (identity fixed once from a Federation silhouette, once from three domestic
        // gables) was the one nobody could see.
        //
        // Same argument as the six L1 ids in `V370_KIT_IDS`: this is not promoting unproven work
        // onto a shared board, it is replacing an asset that predates the programme with the one
        // the programme has actually been reviewing. The lane reports zero open majors at 3.25.
      )
    );

    // Commissioned Blender GLBs keep authored materials (cafe / stock-exchange /
    // hospital / warehouse). Rematerializing mapped "roof iron" → light corrugated
    // #c8ced4 and washed out finished decks. Kit-style V300 GLBs still rematerialize below.
    if (hasRealGlb && (commissionedPreferGlb || preferModernGlb)) {
      for (const part of source.parts ?? []) {
        MaterialLibrary.ensureUv2(part.geometry);
      }
      this._rematerialized.set(key, source);
      return source;
    }

    if (isCivic && hasRealGlb && commissionedPreferGlb && !forceIndustrialKit) {
      const remapped = this.materials.rematerializeModel(source, archetypeId, districtId);
      this._rematerialized.set(key, remapped);
      return remapped;
    }

    // ——— V3.70 promotion gate ———
    //
    // THE RATCHET HAD A HOLE AND THREE LANES WENT THROUGH IT. `V370_KIT_IDS` governs the
    // GLB-vs-kit decisions above, which is all it was built for. It says nothing about a NEW kit
    // that claims an archetype outright: `assembleBuilding()` asks `civicOwns()` / `commercialOwns()`
    // before it reaches any of that, so the moment a lane registered a builder its model was on the
    // shared seed-0 board — no grade, no gate, no decision.
    //
    // Measured cost of the hole: `hospital-district` and `community-recreation` (L3, NO-SHIP at
    // 2.75/3.0), `warehouse-converted` (L6, 2.5 with ten open majors), and four L4 ids including
    // `tower-office`, which its own builder marked "do not promote", and `shoptop-mixed`, which has
    // never been plated at all. Nine other sessions review that board.
    //
    // So the board — and ONLY the board — refuses a V3.70 kit that has not been promoted. Labs call
    // `assembleBuilding()` directly and are deliberately unaffected, because a lane must be able to
    // capture and grade its work before it is allowed to ship it. That is the whole point of the
    // sequence: grade first, promote second.
    // L6's r2 found the first version of this gate still had a hole: it only asked the civic and
    // commercial kits. `warehouse-converted` reaches the board through `INDUSTRIAL_KIT_IDS`, which
    // predates V3.70, so a lane that moved it off the legacy path and onto its own kit walked
    // straight past the check. `warehouse-brick` and `factory-light` are NOT listed here — they
    // passed a V3.32 gate and are not this programme's to hold back.
    const v370ClaimedIndustrial = archetypeId === 'warehouse-converted'
      || archetypeId === 'warehouse-datacentre';
    const v370Unpromoted = (civicKitOwns(archetypeId)
        || commercialKitOwns(archetypeId)
        || v370ClaimedIndustrial)
      && !V370_KIT_IDS.has(archetypeId)
      && !FORCE_KIT_IDS.has(archetypeId);
    // MEASURED, not assumed, when `warehouse-datacentre` was wired in: the `&& source` clause means
    // a null registry entry falls PAST this gate to the kit path below. On the live board that is
    // unreachable — `AssetRegistry.loadAll()` ends by installing a runtime-procedural fallback for
    // every id in `ARCHETYPES`, so a registered archetype always has a source even with no GLB (and
    // `warehouse-datacentre` is not in `kit-manifest.json`, so that is exactly the entry it gets).
    // It was left as-is deliberately: dropping the clause would make an incomplete-registry caller
    // render nothing rather than something, and a blank plate handed to a critic is the failure
    // this programme has already paid for once. Probe:
    // `_reviews/quality-loop/v370/_wiring/probe-datacentre-permit.mjs`.
    if (v370Unpromoted && source && !V370_PARKED.includes(archetypeId)) {
      const remapped = this.materials.rematerializeModel(source, archetypeId, districtId);
      this._rematerialized.set(key, remapped);
      return remapped;
    }
    // Parked L4 ids stay gradeable in the commercial lab, but the board must not
    // rematerialize their V300 placeholder GLB. `tower-office` (curtain-wall office
    // slab) was showing the 900-tri kit GLB on P2300 seed 2583142004; the reviewed
    // building-kit curtain wall (R10 podium / fins) is the live model.

    // Parcel stock + missing civics: building-kit form language (facade 0–3 variety).
    // Industrial ids remain kit-owned when no commissioned GLB won above.
    // districtId still flows in so surfacesForArchetype applies wall bias (= bucket).
    if ((forceIndustrialKit || isParcelArchetype || isCivic || !hasRealGlb)
      && this.buildingKit?.supports(archetypeId)
      && !(hasRealGlb && commissionedPreferGlb)) {
      const kitModel = this.buildingKit.get(
        archetypeId, districtId, f, lotSpan, conditionTier, hand, storeys, signText,
      );
      if (kitModel?.parts?.length) {
        this._rematerialized.set(key, kitModel);
        return kitModel;
      }
    }

    // Graceful fallback: rematerialised registry model (including box fallbacks).
    if (!source) return null;
    const remapped = this.materials.rematerializeModel(source, archetypeId, districtId);
    this._rematerialized.set(key, remapped);
    return remapped;
  }

  /** V3.10 W2-ARCH — kerbs, road markings, parked-car set dressing. */
  _buildStreetscape() {
    this.streetscape = new Streetscape(this.city, this.materials, this.registry, {
      quality: this.quality,
      publicTreePits: this.publicTreePits,
    });
    const group = this.streetscape.build();
    this.root.add(group);
    this.stats.instances += (this.streetscape.stats.kerbs ?? 0)
      + (this.streetscape.stats.markings ?? 0)
      + (this.streetscape.stats.cars ?? 0)
      + (this.streetscape.stats.bollards ?? 0)
      + (this.streetscape.stats.streetFurniture ?? 0);
    // Mischief + click-to-name targets for streetscape furniture.
    this._registerStreetscapeMischief();
  }

  _registerStreetscapeMischief() {
    const signals = this.streetscape?.signalPlacements ?? [];
    const signalMeshes = (this.streetscape?.signalMeshes ?? []).filter(Boolean);
    const signalModel = {
      parts: [],
      size: new THREE.Vector3(1.9, 6.2, 1.15),
      source: 'streetscape-signal',
    };
    signals.forEach((s, index) => {
      this._registerStaticMischiefTarget({
        key: `prop:signal:${index}:${s.x.toFixed(1)}:${s.z.toFixed(1)}`,
        kind: 'signal',
        modelId: 'traffic-signal',
        label: 'Traffic light',
        model: signalModel,
        meshes: signalMeshes,
        index,
        basePlacement: placement(s.x, 0, s.z, s.rotation ?? 0),
      });
    });
    // Register every bollard for click-to-name (stride only if very dense).
    const allBollards = this.streetscape?.bollardPlacements ?? [];
    const bollardStride = allBollards.length > 160 ? 2 : 1;
    const bollards = allBollards.filter((_, i) => i % bollardStride === 0);
    const bollardMeshes = (this.streetscape?.bollardMeshes ?? []).filter(Boolean);
    const bollardModel = {
      parts: [],
      size: new THREE.Vector3(0.78, 2.0, 0.78),
      source: 'streetscape-bollard',
    };
    bollards.forEach((b, index) => {
      this._registerStaticMischiefTarget({
        key: `prop:bollard:${index}:${b.x.toFixed(1)}:${b.z.toFixed(1)}`,
        kind: 'prop',
        modelId: 'cast-street-bollard',
        label: 'Bollard',
        model: bollardModel,
        meshes: bollardMeshes,
        index,
        basePlacement: placement(b.x, 0, b.z, b.rotation ?? 0),
      });
    });
    // Melbourne tram-stop signs along tram corridors.
    const flagPlacements = this.streetscape?.flagPlacements ?? [];
    const flagMeshes = (this.streetscape?.flagMeshes ?? []).filter(Boolean);
    if (flagPlacements.length && flagMeshes.length) {
      const flagModel = {
        parts: [],
        size: new THREE.Vector3(0.9, 3.5, 0.9),
        source: 'streetscape-melbourne-tram-stop-sign',
      };
      flagPlacements.forEach((f, index) => {
        this._registerStaticMischiefTarget({
          key: `prop:tram-stop-sign:${index}:${f.position.x.toFixed(1)}:${f.position.z.toFixed(1)}`,
          kind: 'prop',
          modelId: 'melbourne-tram-stop-sign',
          label: 'Tram stop',
          model: flagModel,
          meshes: flagMeshes,
          index,
          basePlacement: this.streetscape.flagDrawPlacements?.[index] ?? f,
        });
      });
    }
    // Parked streetscape cars (set dressing).
    const carBatches = this.streetscape?.carBatches ?? [];
    for (const batch of carBatches) {
      const size = batch.model?.size ?? new THREE.Vector3(2.0, 1.3, 4.4);
      const carModel = {
        parts: [],
        size,
        source: `street:p17:parked-${batch.type}`,
      };
      batch.placements.forEach((c, index) => {
        const record = batch.records?.[index];
        const label = record?.id === 'parked:delivery-van' ? 'Delivery van'
          : record?.id === 'parked:bus-at-stop' ? 'Bus at stop'
            : record?.id === 'parked:shop-truck' ? 'Delivery truck'
              : 'Parked car';
        this._registerStaticMischiefTarget({
          key: `prop:parked-${batch.type}:${index}:${c.position.x.toFixed(1)}:${c.position.z.toFixed(1)}`,
          kind: batch.type === 'bus' ? 'bus' : 'prop',
          modelId: `parked-${batch.type}`,
          label,
          model: carModel,
          meshes: (batch.meshes ?? []).filter(Boolean),
          index,
          basePlacement: c,
        });
      });
    }
    const carPlacements = this.streetscape?.carPlacements ?? [];
    const carMeshes = (this.streetscape?.carMeshes ?? []).filter(Boolean);
    if (carPlacements.length && carMeshes.length) {
      const carModel = {
        parts: [],
        size: new THREE.Vector3(2.0, 1.3, 4.4),
        source: 'streetscape-parked-car',
      };
      carPlacements.forEach((c, index) => {
        this._registerStaticMischiefTarget({
          key: `prop:parked-car:${index}:${c.position.x.toFixed(1)}:${c.position.z.toFixed(1)}`,
          kind: 'prop',
          modelId: 'parked-car',
          label: 'Parked car',
          model: carModel,
          meshes: carMeshes,
          index,
          basePlacement: c,
        });
      });
    }
  }

  _order() {
    return activeOrder(this.city, this.lastState);
  }

  _parcel(id) {
    return activeParcel(this.city, this.lastState, id);
  }

  _baseParcel(id) {
    return activeParcel(this.city, null, id);
  }

  /**
   * Have renovation works started on this parcel — and have they ever?
   *
   * This is what gates the industrial `renovated` tier, and it is deliberately NOT a condition
   * threshold. A parcel whose starting condition happens to be high has not been renovated by
   * anybody, and rendering it cleared and landscaped from the first frame gives away the reward
   * before the player has paid for it.
   *
   * Two signals, both from live state:
   *   - works UNDERWAY: a `renovation` record on the holding, which is the same signal that
   *     raises the scaffold in `_drawSuccessionState`, or a `construction` record for a rebuild.
   *   - works COMPLETED: the live condition standing meaningfully above the parcel's BASE
   *     condition. The renovation record is cleared on completion, so without this the yard would
   *     re-fill itself and the fencing would go back up the quarter the scaffold came down.
   *
   * The 0.08 margin is there so ordinary condition drift cannot trip it; only a works-sized jump
   * does. With no state at all — a fresh board, the lab, a tile preview — this is false, which is
   * the correct default.
   */
  _renovationStarted(id) {
    const holding = this.lastState?.holdings?.[id];
    if (holding?.renovation || holding?.construction) return true;
    const base = this._baseParcel(id)?.condition;
    const live = this.lastState?.parcelStatus?.[id]?.condition
      ?? holding?.condition
      ?? base;
    if (!Number.isFinite(base) || !Number.isFinite(live)) return false;
    // Condition is an integer 0/1/2 and a renovation raises it by exactly one step, so a strict
    // comparison is the whole test. The first version used `base + 0.08`, a fraction's margin on
    // a scale that has no fractions — it happened to work for 1 -> 2, but it was reasoning about
    // the wrong domain and would have failed the moment anyone trusted it.
    return live > base;
  }

  _adjacency(id) {
    return activeAdjacency(this.city, this.lastState, id);
  }

  _activeParcelForComponent(id) {
    const direct = this._parcel(id);
    if (direct) return direct;
    return this._order()
      .map((activeId) => this._parcel(activeId))
      .find((parcel) => parcel.componentParcelIds?.includes(id)) ?? null;
  }

  // --- static world ---------------------------------------------------------

  _buildPlinth() {
    const { extent } = this.city;
    // The plinth stops at the tray edge. At pad 10 its dark top (y -0.02) stood 0.2 m above the tray
    // band's verge (TASTE-BIBLE section 8) and showed through it as a navy strip; the wall now ends
    // the tray and the ground outside it is the ribbon, the crust and the sheet.
    const pad = 0;
    const geometry = new THREE.BoxGeometry(extent.x + pad * 2, 4, extent.z + pad * 2);
    MaterialLibrary.ensureUv2(geometry);
    const material = this.materials.get('concrete', {
      variant: 'plinth',
      color: '#1b1f24',
      roughness: 0.95,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(extent.x / 2, -2.02, extent.z / 2);
    mesh.receiveShadow = true;
    this.root.add(mesh);

    const rimGeom = new THREE.BoxGeometry(extent.x + pad * 2 + 0.4, 0.5, extent.z + pad * 2 + 0.4);
    MaterialLibrary.ensureUv2(rimGeom);
    const rim = new THREE.Mesh(
      rimGeom,
      this.materials.get('concrete', { variant: 'plinth-rim', color: '#2c333c', roughness: 0.8 }),
    );
    rim.position.set(extent.x / 2, -0.28, extent.z / 2);
    rim.receiveShadow = true;
    this.root.add(rim);
  }

  _buildGround(...args) { return finishBuild(this._buildGroundSteps(...args)); }

  *_buildGroundSteps() {
    const pauseBuild = buildBudget();
    const { blocksX, blocksZ, corridors } = this.city;
    const modulesX = blocksX * MODULES_PER_PITCH + 1;
    const modulesZ = blocksZ * MODULES_PER_PITCH + 1;

    const byModel = new Map();
    const push = (id, p) => {
      if (!byModel.has(id)) byModel.set(id, []);
      byModel.get(id).push(p);
    };

    const tramRailPatches = [];

    for (let j = 0; j < modulesZ; j += 1) {
      if (pauseBuild()) yield null;
      for (let i = 0; i < modulesX; i += 1) {
        if (pauseBuild()) yield null;
        const x = i * TILE + TILE / 2;
        const z = j * TILE + TILE / 2;
        const roadCol = i % MODULES_PER_PITCH === 0;
        const roadRow = j % MODULES_PER_PITCH === 0;

        if (!roadCol && !roadRow) {
          const tile = placement(x, 0, z, 0);
          tile.tint = familyInstanceTint('foliage', `ground:${i}:${j}`);
          push('ground-tile', tile);
          continue;
        }

        const vCorridor = roadCol ? corridors.vertical[i / MODULES_PER_PITCH] : null;
        const hCorridor = roadRow ? corridors.horizontal[j / MODULES_PER_PITCH] : null;

        if (roadCol && roadRow) {
          const arms = [];
          if (j > 0) arms.push('N');
          if (j < modulesZ - 1) arms.push('S');
          if (i > 0) arms.push('W');
          if (i < modulesX - 1) arms.push('E');
          const roadModule = chooseRoadModule(arms);
          push(roadModule.id, placement(x, 0, z, roadModule.steps * 90));
          // Trackwork does not survive the junction modules; close the rail visually.
          if (vCorridor?.tram) tramRailPatches.push({ x, z, axis: 'v' });
          if (hCorridor?.tram) tramRailPatches.push({ x, z, axis: 'h' });
          continue;
        }

        if (roadCol) {
          push(vCorridor?.tram ? 'road-tram-straight' : 'road-straight', placement(x, 0, z, 0));
        } else {
          push(hCorridor?.tram ? 'road-tram-straight' : 'road-straight', placement(x, 0, z, 90));
        }
      }
    }

    const concretePieces = [];
    let concreteModules = 0;
    for (const [id, placements] of byModel) {
      if (pauseBuild()) yield null;
      const model = this._groundModel(id);
      if (!model) continue;
      const cut = id !== 'ground-tile' ? this._roadPlacementsOnPits(placements) : [];
      const intact = cut.length
        ? placements.filter((item) => !cut.includes(item))
        : placements;
      if (intact.length) {
        const { group } = buildInstanced(model, intact, {
          castShadow: false,
          receiveShadow: true,
          tint: id === 'ground-tile',
        });
        group.name = `ground:${id}`;
        this.root.add(group);
        this.stats.instances += intact.length;
      }
      if (!cut.length) continue;
      concreteModules += cut.length;
      const plainParts = model.parts.filter((part) => !this._remappedConcrete(part));
      if (plainParts.length) {
        const { group } = buildInstanced({ parts: plainParts }, cut, {
          castShadow: false,
          receiveShadow: true,
        });
        group.name = `ground:${id}:pit-kept`;
        this.root.add(group);
      }
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < cut.length; i += 1) {
        if (pauseBuild()) yield null;
        const item = cut[i];
        matrix.compose(item.position, item.quaternion, item.scale);
        const rect = {
          minX: item.position.x - TILE * 0.5,
          maxX: item.position.x + TILE * 0.5,
          minZ: item.position.z - TILE * 0.5,
          maxZ: item.position.z + TILE * 0.5,
        };
        const holes = pitsTouchingRect(this.publicTreePits, rect).map((pit) => pit.rim);
        for (const part of model.parts) {
          if (pauseBuild()) yield null;
          if (!this._remappedConcrete(part) || !holes.length) continue;
          const clipped = clipGeometryToWorld(part.geometry, matrix, holes);
          if (!clipped) continue;
          concretePieces.push({ geometry: clipped, material: part.material });
        }
      }
    }
    this._mergeConcretePitCuts(concretePieces, concreteModules);

    this._buildRailPatches(tramRailPatches);
  }

  _publishPublicTreePits() {
    const core = planBoardFoliage(this.city);
    const verge = planResidentialVergeInfill(this.city, core);
    this._coreFoliage = core;
    this.publicTreePits = planPublicTreePits(this.city, [...core, ...verge], {
      protectedRects: this._publicEntryRects(),
    });
    this.root.userData.foliagePlacements = core;
    this.root.userData.publicTreePits = this.publicTreePits;
  }

  _publicEntryRects() {
    const parcels = this.city?.parcels;
    const centreOf = (id) => {
      if (!parcels || id == null) return null;
      const parcel = typeof parcels.get === 'function' ? parcels.get(id) : parcels[id];
      return parcel?.centre ?? null;
    };
    const rects = [];
    const push = (centre, rotation, xs, zs) => {
      if (!centre || !Number.isFinite(centre.x) || !Number.isFinite(centre.z)) return;
      const a = (rotation ?? 0) * Math.PI / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < xs.length; i += 1) {
        for (let j = 0; j < zs.length; j += 1) {
          const wx = centre.x + xs[i] * c + zs[j] * s;
          const wz = centre.z - xs[i] * s + zs[j] * c;
          if (wx < minX) minX = wx;
          if (wx > maxX) maxX = wx;
          if (wz < minZ) minZ = wz;
          if (wz > maxZ) maxZ = wz;
        }
      }
      if (maxX > minX && maxZ > minZ) rects.push({ minX, maxX, minZ, maxZ });
    };
    for (const plan of planResidentialFrontages(this.city)) {
      const centre = centreOf(plan.parcelId);
      if (plan.gate?.clearWidth > 0) {
        const half = plan.gate.clearWidth * 0.5;
        push(
          centre,
          plan.rotation,
          [plan.gate.x - half, plan.gate.x + half],
          [plan.boundaryZ, plan.kerbZ],
        );
      }
      for (const drive of plan.driveways ?? []) {
        if (!Number.isFinite(drive.x) || !Number.isFinite(drive.width)
          || !Number.isFinite(drive.depth) || !Number.isFinite(drive.localZ)) continue;
        const hx = (drive.width + 0.22) * 0.5;
        const hz = (drive.depth + 0.34) * 0.5;
        push(
          centre,
          plan.rotation,
          [drive.x - hx, drive.x + hx],
          [drive.localZ - hz, drive.localZ + hz],
        );
      }
    }
    return rects;
  }

  _roadPlacementsOnPits(placements) {
    if (!this.publicTreePits?.pits?.length) return [];
    const half = TILE * 0.5;
    const cut = [];
    for (let i = 0; i < placements.length; i += 1) {
      const item = placements[i];
      const rect = {
        minX: item.position.x - half,
        maxX: item.position.x + half,
        minZ: item.position.z - half,
        maxZ: item.position.z + half,
      };
      if (pitsTouchingRect(this.publicTreePits, rect).length) cut.push(item);
    }
    return cut;
  }

  _remappedConcrete(part) {
    return !!this._footpathConcrete && part?.material === this._footpathConcrete;
  }

  _mergeConcretePitCuts(pieces, modules) {
    const byMaterial = new Map();
    for (let i = 0; i < pieces.length; i += 1) {
      const piece = pieces[i];
      const key = piece.material?.uuid ?? 'concrete';
      if (!byMaterial.has(key)) byMaterial.set(key, { material: piece.material, geometries: [] });
      byMaterial.get(key).geometries.push(piece.geometry);
    }
    let triangles = 0;
    const addMesh = (geometry, material) => {
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometry.userData.ownsPitClip = true;
      MaterialLibrary.ensureUv2(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'ground:concrete-pit-cuts';
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.root.add(mesh);
      triangles += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
    };
    for (const group of byMaterial.values()) {
      const merged = group.geometries.length === 1
        ? group.geometries[0]
        : mergeGeometries(group.geometries, false);
      if (!merged) {
        for (let i = 0; i < group.geometries.length; i += 1) addMesh(group.geometries[i], group.material);
        continue;
      }
      if (merged !== group.geometries[0]) {
        for (let i = 0; i < group.geometries.length; i += 1) group.geometries[i].dispose();
      }
      addMesh(merged, group.material);
    }
    this.root.userData.publicPitConcrete = { modules, batches: byMaterial.size, triangles };
  }

  /**
   * Ground / road modules: asphalt carriageway, concrete footpath, foliage tile.
   * Classifies existing kit parts by luminance so a loaded GLB still picks up maps.
   */
  _groundModel(id) {
    if (this._rematerialized.has(`ground:${id}`)) return this._rematerialized.get(`ground:${id}`);
    const source = this.registry.get(id);
    if (!source) return null;
    let remapped;
    if (id === 'ground-tile') {
      const foliage = this.materials.get('foliage');
      remapped = {
        ...source,
        parts: source.parts.map((part) => {
          MaterialLibrary.ensureUv2(part.geometry);
          return { geometry: part.geometry, material: foliage };
        }),
      };
    } else {
      const asphalt = this.materials.get('asphalt', {
        // Lifted from #171b1f: blind R4/R5 read the roads as near-black
        // planes; worn daylight asphalt sits at a mid charcoal.
        // P16 (2026-09-03): lifted again from #31353a — the P16A1 blind critic read the
        // roads at corner-close, beach-corner and oil-sea as "unlit black wedges where the
        // ground plane ends" (measured 31353a → ~35–40 luma after the grade). Daylight
        // asphalt in the Monopoly Plus reference sits at a readable mid grey.
        variant: 'road-asphalt-r5-worn',
        color: '#474b51',
        roughness: 0.94,
        metalness: 0,
      });
      this._roadMaterial = asphalt;
      this._roadWetUniform = attachWetRoadUniform(asphalt);
      tagSurface(asphalt, 'road');
      const concrete = this.materials.get('concrete', {
        variant: 'footpath-r4-light',
        color: '#c3bfb7',
        roughness: 0.92,
      });
      applyPublicPavingSurface(concrete, { role: 'paving', quality: this.quality });
      this._footpathConcrete = concrete;
      const metal = this.materials.get('painted_metal', { variant: 'rail', color: '#565b5f', metalness: 0.7, roughness: 0.35 });
      remapped = {
        ...source,
        parts: source.parts.map((part) => {
          MaterialLibrary.ensureUv2(part.geometry);
          const name = `${part.material?.name ?? ''}`.toLowerCase();
          const lum = part.material?.color
            ? 0.2126 * part.material.color.r
              + 0.7152 * part.material.color.g
              + 0.0722 * part.material.color.b
            : 0.2;
          let material = asphalt;
          if (/\b(rail|steel|track)\b/.test(name) || ((part.material?.metalness ?? 0) > 0.4)) {
            material = metal;
          } else if (/\b(path|foot|kerb|curb|pave)\b/.test(name) || lum > 0.35) {
            material = concrete;
          }
          return { geometry: part.geometry, material };
        }),
      };
    }
    this._rematerialized.set(`ground:${id}`, remapped);
    return remapped;
  }

  /**
   * V3.02 land-use dressing. All flat work shares one instanced material; all solid
   * dressing shares another. The semantic variety comes from instance colour and scale,
   * not one material or draw call per block.
   */
  _buildTopology(...args) { return finishBuild(this._buildTopologySteps(...args)); }

  *_buildTopologySteps() {
    const pauseBuild = buildBudget();
    const flats = [];
    const solids = [];
    const rounds = [];
    const roofs = [];
    const domes = [];
    const rotundaStoneRounds = [];
    const rotundaStoneSolids = [];
    const waters = [];
    const ripples = [];
    let pondBankGeometry = null;
    let pondWaterGeometry = null;
    const playPieces = [];
    let reserveSlide = null;
    // V3.31 reserve landscape buckets. Split out because the shared `rounds` /
    // `solids` batches sit on material families whose instance tint is dropped by
    // `buildInstanced` (see the family exclusion list there), and because a
    // 16-segment cylinder costs 64 triangles — far too much for a gravel chip.
    const blobs = [];       // low-poly planting masses (shrubs, tussocks, clods)
    const leafBeds = [];    // connected reserve shrubs with atlas-cut leafy rims
    const blooms = [];      // small saturated flower dots
    const chips = [];       // shared gravel and small posts
    const pondStones = [];  // only the ten uncut shore pieces
    const pondLeaves = [];  // only the sixteen lily-pad lobes
    const pondIsland = [];  // only the three natural island layers
    const blades = [];      // reed / grass blades and thin planting spikes
    // V3.31 r2. The lawn and the path were the two largest surfaces in the subject and
    // both were single stretched fills. They are tiled fields now, each tile carrying
    // its own UV island so the texture set actually resolves at board distance.
    const turf = [];        // lawn tiles with continuous organic field and route wear
    const pathTiles = [];   // hoggin wearing course on the sand set
    const columns = [];     // rotunda shafts, flutes and capitals — painted stone, not ashlar
    const add = (bucket, x, y, z, sx, sy, sz, colour, rotation = 0) => {
      const item = placement(x, y, z, rotation, { x: sx, y: sy, z: sz });
      item.tint = new THREE.Color(colour);
      bucket.push(item);
    };

    // V3.33: block-core dressing lives in `render/block-cores/`. This method
    // still owns the public reserve and rights-of-way (other seats).

    for (const row of this.city.rightsOfWay ?? []) {
      if (pauseBuild()) yield null;
      if (this.city.reserve && row.bx === this.city.reserve.bx && row.bz === this.city.reserve.bz) continue;
      const sx = row.axis === 'x' ? row.length : row.width;
      const sz = row.axis === 'z' ? row.length : row.width;
      add(flats, row.centre.x, 0.285, row.centre.z, sx, 0.07, sz, '#58606a');
    }

    const reserve = this.city.reserve;
    this._reserveGroundContacts = [];
    this._reserveWearSites = [];
    if (reserve) {
      const { x, z } = reserve.centre;
      // V3.31 deterministic reserve variation. Hash only — no clock, no PRNG stream.
      const reserveSeed = `reserve:${this.city.seed ?? 0}`;
      const runit = (index, salt) => {
        let h = 0x811c9dc5;
        for (let i = 0; i < reserveSeed.length; i += 1) {
          h ^= reserveSeed.charCodeAt(i);
          h = Math.imul(h, 0x01000193);
        }
        h ^= Math.imul((index | 0) + 1, 0x9e3779b9);
        h = Math.imul(h ^ (h >>> 13), 0x85ebca6b);
        h ^= Math.imul((salt | 0) + 1, 0xc2b2ae35);
        h ^= h >>> 16;
        return (h >>> 0) / 0x100000000;
      };
      const LAY = Board.reserveLayout(reserve);
      // V3.70. One register, shared by every pass that sites anything on this block —
      // this method's beds and collar, `_buildParkFurniture`, `_buildReserveStreetKit`.
      // See {@link Board._reserveOccupancy} for the defect it closes.
      const SITES = Board._reserveOccupancy(LAY);
      this._reserveSites = SITES;
      // The eight reserve trees are authored upstream in `core/city.js` and the renderer
      // cannot move them, so they go on the register first and everything drawn here
      // yields to them. 1.25 m covers the trunk and the mulch pit `FoliageLayer` lays under
      // a `role`-tagged tree, so no shrub grows through a trunk and no bench stands in the
      // pit — while a seat in a tree's shade, which is the whole point of a park tree,
      // stays available.
      for (const tree of this.city.trees ?? []) {
        if (pauseBuild()) yield null;
        if (Math.abs(tree.x - x) > LAY.HALF || Math.abs(tree.z - z) > LAY.HALF) continue;
        SITES.take(tree.x, tree.z, 1.25, 'tree');
      }
      const PATH_HALF = LAY.PATH_HALF;   // half width of the gravel carriageway
      const KERB_MID = LAY.KERB_MID;     // paver centreline, so the kerb lands on the edge
      const HALF = LAY.HALF;             // lawn half-extent = the perimeter footpath
      const PATH_END = LAY.PATH_END;     // r2: arms now run all the way to the perimeter
      const APRON = LAY.APRON;           // rotunda apron radius — paths die into it
      const LOOP = LAY.LOOP;             // promenade circuit centreline
      const LOOP_HALF = LAY.LOOP_HALF;

      // ── Lawn ─────────────────────────────────────────────────────────────────────
      // Keep the existing 32×32 topology. Its reserve-wide, world-projected map
      // supplies the lawn variation and wear across tile boundaries.
      // V3.70 — the soil under the turf was authored a dark GREEN (#2f5c22), which is 2,247
      // square metres, a quarter of the whole block's footprint, in the same hue family as
      // the lawn on top of it. It is covered by turf everywhere except at the pond and the
      // playground margins, where it is what shows — and soil is not green. Loam brown is
      // both what it should read as at those edges and one less large green area in a
      // palette where green already owns half the block (§2.10).
      add(flats, x, 0.16, z, HALF * 2, 0.16, HALF * 2, '#46372a');  // soil under the turf
      // Preserve the existing tile footprint and feature exclusions exactly.
      const TURF = 1.48125;                      // 47.4 / 32, so the field closes exactly
      const TURF_N = 32;
      // Mow bands: a mower does not lay a perfectly regular stripe, and r2b's fixed
      // two-tile pitch put a dead-straight tonal seam across the lawn every 5.9 m at a
      // value step big enough to read as a join rather than as a cut. Band width now
      // alternates two and three tiles off the hash, and the step between them is smaller.
      const bandOf = new Array(TURF_N);
      {
        let idx = 0;
        let run = 0;
        let width = 2;
        for (let tj = 0; tj < TURF_N; tj += 1) {
          if (pauseBuild()) yield null;
          bandOf[tj] = idx % 2;
          run += 1;
          if (run >= width) {
            run = 0;
            idx += 1;
            width = runit(idx, 720) > 0.55 ? 5 : 4;
          }
        }
      }
      for (let ti = 0; ti < TURF_N; ti += 1) {
        if (pauseBuild()) yield null;
        for (let tj = 0; tj < TURF_N; tj += 1) {
          if (pauseBuild()) yield null;
          const tx = x - HALF + (ti + 0.5) * TURF;
          const tz = z - HALF + (tj + 0.5) * TURF;
          if (LAY.onFeature(tx, tz, -0.8)) continue;   // pond and softfall lay their own
          const band = bandOf[tj];
          const u = runit(ti * 31 + tj, 700);
          // Preserve authored tile transforms. Ground detail uses world coordinates,
          // so these rotations no longer repeat the same texture island.
          const yaw = band ? 90 : 0;
          const flip = u > 0.5 ? 180 : 0;
          // A per-tile colour, even a subtle one, repeats as a checker at ordinary
          // scale. The field map already has continuous world-space wear and grass.
          const tone = reserveTurfTint(0, 0, 0);
          add(turf, tx, 0.235, tz, TURF, 0.07, TURF, tone, yaw + flip);
        }
      }

      // ── Board-tile base (§2.1) ───────────────────────────────────────────────────
      // Measured before it was written: on the +x edge of the block, the outermost turf
      // tile sits at 22.96 and the next instanced thing at 25.50 is a footpath pillar.
      // Between them there was nothing at all — the lawn simply stopped, and §2.1 names
      // that by hand: "A green rectangle laid flat on the terrain reads as a cutout and is
      // an automatic 2." The reserve is the largest single tile on the board and it was
      // the one thing on it standing on nothing.
      //
      // A coping course of individual stones on a dark bevel board, so the reserve stands
      // ON something, the bevel throws the shadow line that separates the block from the
      // footpath, and the boundary reads with the same paver language as the kerbs inside
      // it. Cheap: about 120 instances for a 190 m perimeter.
      {
        const COPE_MID = HALF + 0.10;        // straddles the lawn edge, laps the footpath
        const BEVEL_MID = HALF + 0.34;
        const COPE_UNIT = 1.54;
        const COPE_PITCH = 1.66;             // 120 mm joint, wide enough to read at zoom
        const COPE_TONES = ['#969c98', '#a2a8a3', '#8e9691'];
        const steps = Math.floor((HALF * 2) / COPE_PITCH);
        for (const side of [-1, 1]) {
          if (pauseBuild()) yield null;
          // The bevel is one long dark member per side. It is the shadow, not a stone.
          add(flats, x + side * BEVEL_MID, 0.14, z, 0.46, 0.26, HALF * 2 + 0.94, '#241f1a');
          add(flats, x, 0.14, z + side * BEVEL_MID, HALF * 2 + 0.94, 0.26, 0.46, '#241f1a');
          for (let i = 0; i < steps; i += 1) {
            if (pauseBuild()) yield null;
            const run = -HALF + (i + 0.5) * COPE_PITCH;
            const tone = COPE_TONES[i % 3];
            add(flats, x + side * COPE_MID, 0.315, z + run, 0.60, 0.19, COPE_UNIT, tone);
            add(flats, x + run, 0.312, z + side * COPE_MID, COPE_UNIT, 0.19, 0.60, tone);
          }
        }
        // Corner stones, so the four returns are mitred rather than left open.
        for (const sx of [-1, 1]) {
          if (pauseBuild()) yield null;
          for (const sz of [-1, 1]) {
            if (pauseBuild()) yield null;
            add(flats, x + sx * COPE_MID, 0.315, z + sz * COPE_MID, 0.60, 0.19, 0.60, '#cdc2ab');
            add(flats, x + sx * BEVEL_MID, 0.14, z + sz * BEVEL_MID, 0.46, 0.26, 0.46, '#241f1a');
          }
        }
      }

      // ── Paths ────────────────────────────────────────────────────────────────────
      // r1's four arms stopped three metres short of the perimeter in open grass and
      // never met each other, so the reserve had no entrance and no route. The arms now
      // run to the perimeter footpath, and a promenade circuit closes the plan and links
      // all four. Curvature stays an art-direction call; connection is not one.
      const gravelRun = (cx, cz, alongX, halfAlong) => {
        const sx = alongX ? halfAlong * 2 : PATH_HALF * 2;
        const sz = alongX ? PATH_HALF * 2 : halfAlong * 2;
        add(flats, cx, 0.30, cz, sx, 0.07, sz, '#6b5b45');          // compacted formation
      };
      gravelRun(x, z, false, PATH_END);
      gravelRun(x, z, true, PATH_END);
      const loopRun = (cx, cz, alongX, halfAlong) => {
        const sx = alongX ? halfAlong * 2 : LOOP_HALF * 2;
        const sz = alongX ? LOOP_HALF * 2 : halfAlong * 2;
        add(flats, cx, 0.298, cz, sx, 0.07, sz, '#6b5b45');
      };
      for (const s of [-1, 1]) {
        if (pauseBuild()) yield null;
        loopRun(x + s * LOOP, z, false, LOOP + LOOP_HALF);
        loopRun(x, z + s * LOOP, true, LOOP + LOOP_HALF);
      }
      // Hoggin wearing course as tiles on the sand set, so the path answers light with a
      // graded aggregate instead of a flat cream fill. A paler crown down the middle and
      // a darker, damper margin at the kerb give the carriageway a real cross-fall.
      // Tile height matters more than tile colour here: at 0.055 every tile showed a lit
      // side face and the carriageway read as a laid carpet of squares. The wearing course
      // is 0.028 now, below the kerb lip, so what varies across it is tone and grain rather
      // than a grid of shadow lines.
      const PT = 2.36;
      // Sizes below are world-space. A quarter-turn after swapping both dimensions
      // made *both* branches long in world X, exposing formation between Z tiles.
      const hoggin = (cx, cz, axis, tone) => {
        add(pathTiles, cx, 0.336, cz,
          axis === 'x' ? PT : 1.68, 0.028, axis === 'z' ? PT : 1.68, tone);
      };
      for (let i = 0; i < 20; i += 1) {
        if (pauseBuild()) yield null;
        const run = (i - 9.5) * PT;
        if (Math.abs(run) > PATH_END - PT * 0.4) continue;
        const u = runit(i, 740);
        const onApron = Math.abs(run) < APRON;
        for (const lane of [-1, 1]) {
          if (pauseBuild()) yield null;
          const crown = lane * 0.84;
          const tone = u > 0.72 ? '#a5a79c' : u > 0.38 ? '#9c9e93' : '#939589';
          if (!onApron) {
            hoggin(x + crown, z + run, 'z', tone);
            hoggin(x + run, z + crown, 'x', tone);
          }
        }
        // Damp shaded margin against each kerb.
        if (!onApron) {
          for (const lane of [-1, 1]) {
            if (pauseBuild()) yield null;
            add(pathTiles, x + lane * 1.56, 0.334, z + run, 0.40, 0.026, PT, '#74776d', 0);
            add(pathTiles, x + run, 0.332, z + lane * 1.56, PT, 0.026, 0.40, '#74776d');
          }
        }
      }
      // ── Promenade paving (§2.7) ──────────────────────────────────────────────────
      // §2.7 asks for "a path that is made of something — pavers, with individual units
      // and joint lines". The circuit used to be laid in 2.36 m hoggin tiles two lanes
      // wide, which is a gravel wearing course drawn large, not a unit.
      //
      // The reserve now says two different things with two different surfaces, which is
      // also what separates them in value: the four radial arms stay a hoggin CARRIAGE
      // DRIVE (loose graded aggregate, kept as it was), and the circuit is a PAVED
      // PROMENADE in individual stones. Two lanes of 0.94 x 1.06 units at a 1.00 m pitch,
      // the outer lane offset half a pitch so the bond breaks, and a 60 mm joint with the
      // dark formation showing through it.
      const PAVER_L = 0.94;
      const PAVER_W = 1.06;
      const PAVER_PITCH = 1.00;
      for (let i = 0; i < 40; i += 1) {
        if (pauseBuild()) yield null;
        for (const lane of [-1, 1]) {
          if (pauseBuild()) yield null;
          const run = (i - 19.5) * PAVER_PITCH + (lane > 0 ? PAVER_PITCH * 0.5 : 0);
          if (Math.abs(run) > LOOP + LOOP_HALF - 0.34) continue;
          const u = runit(i * 2 + (lane > 0 ? 1 : 0), 760);
          const tone = u > 0.74 ? '#a3aeaa' : u > 0.5 ? '#9aa5a1' : u > 0.24 ? '#929e99' : '#8a9691';
          const cross = lane * 0.55;
          for (const s of [-1, 1]) {
            if (pauseBuild()) yield null;
            add(pathTiles, x + s * LOOP + cross, 0.334, z + run, PAVER_W, 0.030, PAVER_L, tone, 0);
            add(pathTiles, x + run, 0.332, z + s * LOOP + cross, PAVER_L, 0.030, PAVER_W, tone, 0);
          }
        }
      }
      // Coarse aggregate scattered on the wearing course, heavier at the junctions.
      for (let pebble = 0; pebble < 64; pebble += 1) {
        if (pauseBuild()) yield null;
        const axis = pebble % 2;
        const run = -21.0 + (pebble % 32) * (42 / 31);
        const cross = ((pebble * 7) % 11 - 5) * 0.32;
        const color = pebble % 4 === 0 ? '#6a5b48' : pebble % 4 === 1 ? '#e2cfa6'
          : pebble % 4 === 2 ? '#94795a' : '#c8a86e';
        add(chips,
          x + (axis ? run : cross),
          0.374 + (pebble % 2) * 0.006,
          z + (axis ? cross : run),
          0.22 + (pebble % 4) * 0.03,
          0.05,
          0.23 + (pebble % 3) * 0.035,
          color);
      }

      // ── Kerb ─────────────────────────────────────────────────────────────────────
      // r1 laid pavers 1.46 long at a 1.62 pitch, so the course read as a dashed line of
      // separate blocks. The unit is 1.60 at the same pitch now — a 20 mm joint — and a
      // grass fringe rides over the inner lip, because the reference's edge is a mown
      // one, not a machine-cut one.
      const paver = (cx, cy, cz, along, deg, tone) => {
        add(flats, cx, cy, cz,
          along ? 1.60 : 0.38, 0.17, along ? 0.38 : 1.60,
          tone, deg);
      };
      const fringe = (cx, cz, along, tone, len) => {
        add(flats, cx, 0.405, cz, along ? len : 0.30, 0.09, along ? 0.30 : len, tone);
      };
      for (const sign of [-1, 1]) {
        if (pauseBuild()) yield null;
        for (const side of [-1, 1]) {
          if (pauseBuild()) yield null;
          for (let i = 0; i < 12; i += 1) {
            if (pauseBuild()) yield null;
            const run = sign * (APRON + 0.4 + i * 1.62);
            if (Math.abs(run) > PATH_END - 0.4) continue;
            const tone = i % 3 === 0 ? '#a9a294' : i % 3 === 1 ? '#c0b8a8' : '#b4ab9c';
            paver(x + side * KERB_MID, 0.36, z + run, false, 0, tone);
            paver(x + run, 0.362, z + side * KERB_MID, true, 0, tone);
          }
        }
      }
      // Grass laps the kerb: a low fringe over the inner lip plus real tufts.
      //
      // V3.70 — this pair sat inside the `sign` loop above and is invariant in `sign`, so
      // both fringes were emitted twice at identical transforms. Four exact-duplicate
      // instances, four coplanar 46.2 m strips z-fighting along the full length of both
      // carriageways: the largest single duplication measured on the reserve, and the one
      // the owner would have seen as shimmer down the middle of the park. The fringe runs
      // once per side now, where it always belonged.
      for (const side of [-1, 1]) {
        if (pauseBuild()) yield null;
        fringe(x + side * (KERB_MID + 0.26), z, false, '#74ab41', PATH_END * 2 - 1.2);
        fringe(x, z + side * (KERB_MID + 0.26), true, '#74ab41', PATH_END * 2 - 1.2);
      }
      for (let i = 0; i < 26; i += 1) {
        if (pauseBuild()) yield null;
        const run = (i - 12.5) * 1.72;
        if (Math.abs(run) < APRON + 0.6 || Math.abs(run) > PATH_END - 0.6) continue;
        const u = runit(i, 780);
        for (const side of [-1, 1]) {
          if (pauseBuild()) yield null;
          const h = 0.30 + u * 0.20;
          add(blades, x + side * (KERB_MID + 0.24), 0.40 + h * 0.4, z + run,
            0.30, h, 0.26, u < 0.5 ? '#3f8130' : '#4f9a35');
          add(blades, x + run, 0.40 + h * 0.4, z + side * (KERB_MID + 0.24),
            0.26, h, 0.30, u < 0.5 ? '#357428' : '#4a9033');
        }
      }
      // Circuit kerb, same unit, both sides of both pairs of legs.
      for (let i = 0; i < 24; i += 1) {
        if (pauseBuild()) yield null;
        const run = (i - 11.5) * 1.62;
        if (Math.abs(run) > LOOP + LOOP_HALF - 0.4) continue;
        if (Math.abs(run) < PATH_HALF + 0.35) continue;   // the arms cross here
        const tone = i % 3 === 0 ? '#a9a294' : i % 3 === 1 ? '#c0b8a8' : '#b4ab9c';
        for (const s of [-1, 1]) {
          if (pauseBuild()) yield null;
          for (const side of [-1, 1]) {
            if (pauseBuild()) yield null;
            paver(x + s * LOOP + side * (LOOP_HALF + 0.2), 0.358, z + run, false, 0, tone);
            paver(x + run, 0.356, z + s * LOOP + side * (LOOP_HALF + 0.2), true, 0, tone);
          }
        }
      }
      // Apron paving. The band between the plinth edge and the kerb ring was bare dark
      // formation at r2b, because the wearing course skips the apron and nothing replaced
      // it. Radial mineral pavers connect the bandstand to the stone promenade;
      // the radial carriageways retain their warm loose aggregate.
      for (let i = 0; i < 26; i += 1) {
        if (pauseBuild()) yield null;
        const a = (i / 26) * Math.PI * 2;
        const u = runit(i, 800);
        const tone = u > 0.66 ? '#bcc2bd' : u > 0.33 ? '#aeb6af' : '#9ea9a2';
        for (const [ring, len] of [[6.32, 1.34], [7.02, 1.06]]) {
          if (pauseBuild()) yield null;
          add(pathTiles, x + Math.sin(a) * ring, 0.334, z + Math.cos(a) * ring,
            (2 * Math.PI * ring) / 26 + 0.06, 0.028, len, tone, (a * 180) / Math.PI);
        }
      }
      // Apron kerb: the same paver unit turned round the rotunda so the circle is edged
      // in the same language as the straights.
      for (let i = 0; i < 34; i += 1) {
        if (pauseBuild()) yield null;
        const a = (i / 34) * Math.PI * 2;
        const tone = i % 3 === 0 ? '#a9a294' : i % 3 === 1 ? '#c2baa9' : '#b4ab9c';
        // The `+ 90` here was the loose-slab bug. A yaw of θ sends the box's long axis to
        // world (cos θ, −sin θ), and the tangent at angle a is (cos a, −sin a), so the
        // tangential yaw is a and not a + 90. With the extra quarter turn every paver stood
        // radially, 0.38 wide against a 1.37 arc pitch, and the ring rendered as thirty-four
        // short bars strewn across the grass a metre apart — which is what the critic read
        // as scattered slabs at r1 and what the r2b hero plate still showed.
        add(flats, x + Math.sin(a) * APRON, 0.36, z + Math.cos(a) * APRON,
          1.42, 0.17, 0.38, tone, (a * 180) / Math.PI);
      }

      /**
       * A planting bed: stone edging, mulch sunk inside it, a shrub mass whose silhouette
       * is lumpy rather than domed, and a little seasonal colour. Defect 3 and defect 9 are
       * the same defect — the four "corner planting pads" were flat dark rectangles that
       * nothing grew out of, which is why they read as a shadow-cascade artefact.
       */
      // The old independent spheres are replaced by overlapping leafy units.
      const GREENS = ['#4e6845', '#60794f', '#72875c', '#83966b', '#587247', '#96a87b'];
      // One shared leafy geometry/material renders the planted units and low
      // bridges. Broad overlapping atlas-cut leaves occupy the top and sides;
      // the narrow rooted core only fills gaps between them.
      const shrub = (cx, cz, r, salt, bloomTone, supportY = 0.35, fit = 1) => {
        const radius = r * fit;
        const phase = runit(salt, 931) * Math.PI * 2;
        const dx = Math.sin(phase) * radius;
        const dz = Math.cos(phase) * radius;
        const yaw = phase * 180 / Math.PI;
        const put = (ox, oz, sx, sy, sz, colour, turn = 0) =>
          add(leafBeds, cx + ox, supportY + sy * 0.445, cz + oz,
            sx, sy, sz, colour, yaw + turn);
        // A low, dark joined skirt, then unequal offset canopy and shoulder. The
        // different heights keep it a planted mass instead of a smooth single dome.
        put(0, 0, radius * 1.12, radius * 0.56, radius * 1.12,
          GREENS[(salt + 1) % GREENS.length]);
        put(dx * 0.20, dz * 0.20, radius * 0.82, radius * 1.16, radius * 0.78,
          GREENS[(salt * 3 + 2) % GREENS.length], 37);
        put(-dx * 0.34, -dz * 0.34, radius * 0.68, radius * 0.90, radius * 0.72,
          GREENS[(salt * 3 + 4) % GREENS.length], -46);
        if (bloomTone && runit(salt, 1117) > 0.58) {
          add(blooms, cx + dx * 0.24, supportY + radius * 1.02,
            cz + dz * 0.24, 0.20, 0.15, 0.20, bloomTone);
        }
      };
      const leafBridge = (a, b, supportY, salt) => {
        const dx = b.x - a.x, dz = b.z - a.z;
        const distance = Math.hypot(dx, dz);
        if (distance > 1.95 || distance < 0.20) return;
        const middleX = (a.x + b.x) / 2, middleZ = (a.z + b.z) / 2;
        // Planting may join planting, but a continuous skirt cannot run through a
        // protected tree or furniture site just because its endpoints were clear.
        if (!SITES.free(middleX, middleZ, 0.30, d => d.what === 'planting')) return;
        const yaw = Math.atan2(dx, dz) * 180 / Math.PI;
        const height = Math.min(a.r, b.r) * 0.48;
        add(leafBeds, middleX, supportY + height * 0.445, middleZ,
          0.36, height, distance * 0.55, GREENS[(salt + 1) % GREENS.length], yaw);
      };

      /**
       * A planting bed: stone edging, mulch sunk inside it, and shrubs on a jittered grid.
       * Free scatter clusters and leaves a bare half, which reads as exactly the flat dark
       * rectangle this bed language was built to remove.
       */
      const bed = (bx, bz, halfX, halfZ, salt) => {
        this._reserveGroundContacts.push({x: bx, z: bz, hx: halfX + .15, hz: halfZ + .15});
        const kerbTone = '#ada393';
        add(flats, bx, 0.30, bz - halfZ, halfX * 2 + 0.32, 0.19, 0.30, kerbTone);
        add(flats, bx, 0.30, bz + halfZ, halfX * 2 + 0.32, 0.19, 0.30, kerbTone);
        add(flats, bx - halfX, 0.30, bz, 0.30, 0.19, halfZ * 2 + 0.32, kerbTone);
        add(flats, bx + halfX, 0.30, bz, 0.30, 0.19, halfZ * 2 + 0.32, kerbTone);
        add(flats, bx, 0.285, bz, halfX * 2 - 0.1, 0.13, halfZ * 2 - 0.1, '#4a3826');
        // Pitch halved with the shrub size, so a bed is a continuous lumpy planting rather
        // than four boulders sitting on visible mulch.
        const cols = Math.max(2, Math.round((halfX * 2) / 1.72));
        const rows = Math.max(2, Math.round((halfZ * 2) / 1.72));
        const rowPlanting = [];
        for (let cy = 0; cy < rows; cy += 1) {
          const row = [];
          for (let cxi = 0; cxi < cols; cxi += 1) {
            const s = cy * cols + cxi;
            const u = runit(s, salt);
            const v = runit(s, salt + 31);
            const w = runit(s, salt + 61);
            const siteX = bx - halfX + (cxi + 0.5) * ((halfX * 2) / cols) + (u - 0.5) * 0.62;
            const siteZ = bz - halfZ + (cy + 0.5) * ((halfZ * 2) / rows) + (v - 0.5) * 0.62;
            const r = 0.46 + w * 0.20;
            const leafReach = r * 0.98 * 2.05;
            const px2 = THREE.MathUtils.clamp(siteX,
              bx - halfX + leafReach, bx + halfX - leafReach);
            const pz2 = THREE.MathUtils.clamp(siteZ,
              bz - halfZ + leafReach, bz + halfZ - leafReach);
            const bloomTone = w > 0.45
              ? ['#f0e0a2', '#f3e2a8', '#e2718f', '#f0a34a', '#f4efe0'][(s + salt) % 5]
              : null;
            // V3.70. A bed may run right through a tree pit, and every one of the eight
            // reserve trees stood inside a perimeter border: measured nearest shrub-core
            // distance 0.33 to 0.85 m, so each trunk rose out of a shrub mass. Planting is
            // allowed to abut planting — that is what makes a bed a mass rather than a
            // sprinkle — but not to grow through a tree or a bench. The register leaves an
            // underplanting collar round each trunk, which is what a real bed does anyway.
            // Keep the accepted occupancy register exact. The visible leafy mass is
            // fitted within its bed; furniture/tree placement keeps its old claims.
            if (!SITES.claimPlanting(siteX, siteZ, r)) continue;
            shrub(px2, pz2, r, salt * 13 + s, bloomTone, 0.35, 0.98);
            row.push({x: px2, z: pz2, r});
          }
          rowPlanting.push(row);
        }
        for (const [rowIndex, row] of rowPlanting.entries())
          for (let i = 1; i < row.length; i += 1)
            if ((i + rowIndex) % 3 !== 0) leafBridge(row[i - 1], row[i], 0.35, salt + i + rowIndex);
      };

      // V3.70 — what each quadrant is for, decided once, here.
      //
      // The plan already spends two of the four lawn quadrants: one holds the pond, one
      // holds the playground. r2b then put a corner bed in all four and scattered picnic
      // tables through every one of them, so the two remaining quadrants had no job and
      // read as leftover ground with furniture dropped on it. One of the two free
      // quadrants is the PICNIC LAWN — tables, no corner bed, open grass — and the other
      // keeps its corner bed. Derived from the layout, so it follows the pond and the
      // playground round the board without a hash and without reading anything.
      const quadKey = (qx, qz) => `${qx},${qz}`;
      const spentQuads = new Set([
        quadKey(Math.sign(LAY.play.x - x), Math.sign(LAY.play.z - z)),
        quadKey(Math.sign(LAY.pond.x - x), Math.sign(LAY.pond.z - z)),
      ]);
      const freeQuads = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
        .filter(([qx, qz]) => !spentQuads.has(quadKey(qx, qz)));
      const picnicQuad = freeQuads[0] ?? [1, 1];
      this._reservePicnicQuad = picnicQuad;
      // Beds in the lawn quadrants. r1 put one in every quadrant, and in the pond
      // quadrant it sat under the water plates — placement is tested against the plan now.
      [[-12.6, -12.6], [12.6, -12.6], [-12.6, 12.6], [12.6, 12.6]].forEach(([dx, dz], i) => {
        if (Math.sign(dx) === picnicQuad[0] && Math.sign(dz) === picnicQuad[1]) return;
        if (!LAY.clear(x + dx, z + dz, 3.1)) return;
        bed(x + dx, z + dz, 2.6, 2.6, 200 + i * 17);
      });
      // Perimeter borders: two shrub beds a side, outside the circuit, with open lawn
      // between them and at the carriageway mouths. A continuous run all the way round
      // reads as a hedge maze and is the most repetitive thing that can be put on a
      // plate — V331 §2c grades that.
      [
        [0, -21.9, true], [0, 21.9, true],
        [-21.9, 0, false], [21.9, 0, false],
      ].forEach(([dx, dz, along], side) => {
        for (const dir of [-1, 1]) {
          const u0 = runit(side * 2 + (dir > 0 ? 1 : 0), 300);
          const halfLen = 4.0 + u0 * 1.3;
          const centreT = dir * (9.6 + u0 * 1.4);
          const bx = x + dx + (along ? centreT : 0);
          const bz = z + dz + (along ? 0 : centreT);
          const hx = along ? halfLen : 0.95;
          const hz = along ? 0.95 : halfLen;
          this._reserveGroundContacts.push({x: bx, z: bz, hx: hx + .15, hz: hz + .15});
          add(flats, bx, 0.29, bz, hx * 2 + 0.30, 0.17, hz * 2 + 0.30, '#a89e8e');
          add(flats, bx, 0.30, bz, hx * 2 - 0.1, 0.15, hz * 2 - 0.1, '#4a3826');
          const count = Math.max(4, Math.round((halfLen * 2) / 1.22));
          const planted = [];
          for (let s = 0; s < count; s += 1) {
            const t = -halfLen + (s + 0.5) * ((halfLen * 2) / count);
            const u = runit(s + side * 7 + (dir > 0 ? 41 : 0), 320);
            const siteCross = (s % 2 ? 0.26 : -0.26) + (u - 0.5) * 0.24;
            const cross = (s % 2 ? 0.09 : -0.09) + (u - 0.5) * 0.14;
            const siteX = bx + (along ? t : siteCross);
            const siteZ = bz + (along ? siteCross : t);
            const r = 0.42 + u * 0.16;
            const leafReach = r * 0.88 * 2.05;
            const insideT = THREE.MathUtils.clamp(t, -halfLen + leafReach, halfLen - leafReach);
            const crossLimit = Math.max(0, 0.95 - leafReach);
            const insideCross = THREE.MathUtils.clamp(cross, -crossLimit, crossLimit);
            const sx2 = bx + (along ? insideT : insideCross);
            const sz2 = bz + (along ? insideCross : insideT);
            if (!SITES.claimPlanting(siteX, siteZ, r)) continue;
            shrub(sx2, sz2, r, 640 + side * 29 + (dir > 0 ? 11 : 0) + s * 3,
              s % 3 === 1 ? ((s + side) % 2 ? '#f0e0a2' : '#e88fa8') : null, 0.375, 0.88);
            planted.push({x: sx2, z: sz2, r});
          }
          for (let i = 1; i < planted.length; i += 1)
            if (i % 4 !== 0) leafBridge(planted[i - 1], planted[i], 0.375, side * 19 + i);
        }
      });
      // Four diagonal collar beds leave the radial walks open. The former
      // evenly spaced ring put cut-leaf silhouettes directly over the gold
      // approach at every cardinal direction, even though their centre claims
      // were legal. Close neighbours here overlap as planted groups.
      for (let s = 0; s < 20; s += 1) {
        if (pauseBuild()) yield null;
        const quadrant = Math.floor(s / 5);
        const within = s % 5;
        const a = (quadrant + 0.5) * Math.PI / 2 + (within - 2) * 0.105;
        const u = runit(s, 420);
        const ring = APRON + 1.95 + u * 0.35;
        const cxp = x + Math.sin(a) * ring;
        const czp = z + Math.cos(a) * ring;
        const r = 0.50 + u * 0.20;
        // The actual cut-card footprint is about twice the placed radius.
        // Do not put a diagonal collar bed into the pond or the playground;
        // the old centre-only claim allowed a leafy edge to reach the slide.
        const leafReach = r * 0.82 * 2.05;
        if (LAY.onFeature(cxp, czp, leafReach)) continue;
        if (!SITES.claimPlanting(cxp, czp, r)) continue;
        shrub(cxp, czp, r, 420 + s * 5,
          s % 3 === 0 ? (s % 6 === 0 ? '#f4efe0' : '#e97fa4') : null, 0.27, 0.82);
      }

      // Playground: softfall pad + swing + slide + climbing frame (not coloured mystery boxes).
      {
        const px = LAY.play.x;
        const pz = LAY.play.z;
        this._reserveWearSites.push({ kind: 'play-perimeter', x: px, z: pz, hx: LAY.play.hx, hz: LAY.play.hz });
        // W4-B: every coloured play piece takes one accent hue (accent.red at S 58), greys stay.
        const PLAY_HUE = '#a04f44';
        // W4-B desire lines: a faint worn shortcut across each open lawn quadrant, arm to arm.
        for (const [qx, qz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          if (pauseBuild()) yield null;
          const near = LAY.PATH_HALF + 0.6, far = 13.5;
          const line = { kind: 'desire-line', hw: 0.65,
            x0: LAY.x + qx * near, z0: LAY.z + qz * far, x1: LAY.x + qx * far, z1: LAY.z + qz * near };
          let open = true;
          for (let s = 0; s <= 8; s += 1) {
            if (pauseBuild()) yield null;
            const f = s / 8;
            if (LAY.onFeature(line.x0 + (line.x1 - line.x0) * f, line.z0 + (line.z1 - line.z0) * f, 1.2)) open = false;
          }
          if (open) this._reserveWearSites.push(line);
        }
        // Softfall is bedded inside a timber sleeper kerb, so the pad has an edge rather
        // than a cut line, and a paler apron so it is not one flat salmon rectangle.
        // Bark softfall, not the salmon slab the critic saw: warm mid-brown with a paler
        // trafficked apron where the equipment is. Pulled in from r1's 13.0 × 11.8 so the
        // promenade circuit has a clear corridor round it.
        add(flats, px, 0.30, pz, LAY.play.hx * 2, 0.10, LAY.play.hz * 2, '#7d5c39');
        add(flats, px, 0.34, pz, LAY.play.hx * 2 - 0.8, 0.08, LAY.play.hz * 2 - 0.8, '#9d6538');
        add(flats, px, 0.352, pz, 7.8, 0.05, 6.8, '#ae7742');
        for (const [dx, dz, sx, sz] of [
          [0, -(LAY.play.hz - 0.2), LAY.play.hx * 2 - 0.1, 0.42],
          [0, LAY.play.hz - 0.2, LAY.play.hx * 2 - 0.1, 0.42],
          [-(LAY.play.hx - 0.2), 0, 0.42, LAY.play.hz * 2 - 0.9],
          [LAY.play.hx - 0.2, 0, 0.42, LAY.play.hz * 2 - 0.9],
        ]) {
          if (pauseBuild()) yield null;
          add(solids, px + dx, 0.42, pz + dz, sx, 0.34, sz, '#7c5c39');
        }
        // Swing: two posts + crossbar + seats
        add(playPieces, px - 3.2, 1.55, pz - 2.2, 0.18, 2.9, 0.18, PLAY_HUE);
        add(playPieces, px - 1.0, 1.55, pz - 2.2, 0.18, 2.9, 0.18, PLAY_HUE);
        add(playPieces, px - 2.1, 3.05, pz - 2.2, 2.4, 0.16, 0.16, PLAY_HUE);
        add(playPieces, px - 2.7, 1.05, pz - 2.2, 0.55, 0.12, 0.35, PLAY_HUE);
        add(playPieces, px - 1.5, 1.05, pz - 2.2, 0.55, 0.12, 0.35, PLAY_HUE);
        // Chains (thin posts)
        add(playPieces, px - 2.7, 2.0, pz - 2.2, 0.06, 1.7, 0.06, '#3c4045');
        add(playPieces, px - 1.5, 2.0, pz - 2.2, 0.06, 1.7, 0.06, '#3c4045');
        reserveSlide = reserveSlideGeometry(px, pz);
        // Climbing frame cube
        for (const [dx, dy, dz] of [
          [-0.9, 1.2, 2.2], [0.9, 1.2, 2.2], [-0.9, 1.2, 3.6], [0.9, 1.2, 3.6],
        ]) {
          if (pauseBuild()) yield null;
          add(playPieces, px + dx, dy, pz + dz, 0.16, 2.0, 0.16, PLAY_HUE);
        }
        add(playPieces, px, 2.25, pz + 2.9, 2.0, 0.14, 1.6, PLAY_HUE);
        add(playPieces, px, 1.2, pz + 2.9, 2.0, 0.14, 0.14, PLAY_HUE);
        // Springer and a low tunnel so the pad is not three items and a lot of orange.
        add(playPieces, px - 4.4, 0.62, pz + 3.1, 0.14, 0.9, 0.14, '#3c4045');
        add(playPieces, px - 4.4, 1.12, pz + 3.1, 1.05, 0.28, 0.42, PLAY_HUE);
        add(playPieces, px - 4.4, 1.34, pz + 2.75, 0.30, 0.34, 0.14, PLAY_HUE);
        // Planted corner inside the sleeper, so the pad is not a bare rectangle. r1 put
        // these two masses outside the kerb, where the circuit corridor now runs.
        add(flats, px + LAY.play.hx - 1.5, 0.345, pz - LAY.play.hz + 1.5, 2.6, 0.07, 2.6, '#4a3826');
        shrub(px + LAY.play.hx - 1.9, pz - LAY.play.hz + 1.4, 0.56, 851, '#f0e0a2', 0.38, 0.66);
        shrub(px + LAY.play.hx - 1.1, pz - LAY.play.hz + 2.1, 0.44, 857, null, 0.38, 0.66);
      }
      // ── Pond ─────────────────────────────────────────────────────────────────────
      // r1's pond was 18.8 × 16.6 — wide enough that no circuit could close round it, and
      // wide enough to swallow a bench, a bin, a planter, a picnic table and a lamp. It is
      // an ornamental pond now, inside the circuit corridor, and the depth is a graded run
      // of plates rather than three hard contour bands.
      const px = LAY.pond.x;
      const pz = LAY.pond.z;
      const PRX = LAY.pond.rx;   // 5.5
      const PRZ = LAY.pond.rz;   // 5.1
      // The accepted four cylindrical banks and ten water plates made hard concentric
      // walls. One shared annulus rises from lawn height to a single level waterline;
      // per-vertex colours blend the existing grass/shingle/wet tones without steps.
      const WATER_Y = 0.3635; // accepted lily-pad underside; island and jetty remain seated
      const bankRadii = [1.0, 0.97, 0.94, 0.915];
      const bankHeights = [0.265, 0.292, 0.329, WATER_Y];
      const bankTones = ['#4f8a3c', '#8c7f66', '#6d6151', '#4d5044'];
      const makePondSurface = (radii, heights, tones, centreTone = null) => {
        const segments = 64, vertices = [], colors = [], uv = [], indices = [];
        const tone = tones.map(value => new THREE.Color(value));
        for (let ring = 0; ring < radii.length; ring += 1) {
          for (let sector = 0; sector < segments; sector += 1) {
            const a = sector * Math.PI * 2 / segments;
            const rx = Math.sin(a) * radii[ring], rz = Math.cos(a) * radii[ring];
            vertices.push(px + PRX * rx, heights[ring], pz + PRZ * rz);
            colors.push(tone[ring].r, tone[ring].g, tone[ring].b);
            uv.push(0.5 + rx * 0.5, 0.5 + rz * 0.5);
          }
        }
        for (let ring = 0; ring < radii.length - 1; ring += 1) {
          for (let sector = 0; sector < segments; sector += 1) {
            const next = (sector + 1) % segments;
            const outer = ring * segments + sector, outerNext = ring * segments + next;
            const inner = (ring + 1) * segments + sector, innerNext = (ring + 1) * segments + next;
            indices.push(outer, outerNext, inner, inner, outerNext, innerNext);
          }
        }
        if (centreTone) {
          const centre = vertices.length / 3, c = new THREE.Color(centreTone);
          vertices.push(px, heights.at(-1), pz);
          colors.push(c.r, c.g, c.b); uv.push(0.5, 0.5);
          const inner = (radii.length - 1) * segments;
          for (let sector = 0; sector < segments; sector += 1)
            indices.push(centre, inner + sector, inner + (sector + 1) % segments);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geometry.setIndex(indices); geometry.computeVertexNormals();
        MaterialLibrary.ensureUv2(geometry);
        return geometry;
      };
      pondBankGeometry = makePondSurface(bankRadii, bankHeights, bankTones);
      pondWaterGeometry = makePondSurface(
        // W4-B: the pond sits on the shared water ramp at about 1.2 m, shoaling to 0.8 m at the bank.
        [0.915, 0.65, 0.35], [WATER_Y, WATER_Y, WATER_Y],
        [waterRampHex(0.8), waterRampHex(1.1), waterRampHex(1.4)], waterRampHex(1.5));
      // Retained ripple pair (method rule 4), re-sited: concentric on the island margin
      // where something actually disturbs the surface, and flattened so the torus reads as
      // a ring on the water rather than as a tube lying on it.
      // Retained under method rule 4, but the tone is what made it read as a white hoop
      // lying on the water. Both rings now sit within a few percent of the surface they
      // disturb, so they read as a ripple rather than as a tube.
      // The 5-segment torus emits a local Y crown of .03328698. Seat each
      // scaled crown just 1.5 mm above the level water, rather than exposing
      // an 9–12 mm bright hoop. XZ, radius, colour and material stay fixed.
      add(ripples, px - 1.5, WATER_Y - 0.00582, pz + 0.9, 1.45, 0.22, 1.30, '#63958d');
      add(ripples, px - 1.5, WATER_Y - 0.00449, pz + 0.9, 2.30, 0.18, 2.05, '#557f79');
      // Three unequal stone runs replace the tooth necklace. Their low six-sided tops
      // bear into the bank; open reaches leave room for reeds, shingle and the jetty.
      const stoneRuns = [[0.08, 0.70, 3], [2.12, 3.65, 4], [4.10, 5.75, 3]];
      let stoneIndex = 0;
      for (const [start, end, count] of stoneRuns) for (let i = 0; i < count; i += 1) {
        if (pauseBuild()) yield null;
        const u = runit(stoneIndex, 520), a = start + (i + 0.5 + (u - 0.5) * 0.18) / count * (end - start);
        const r = 0.925 + runit(stoneIndex, 529) * 0.020;
        const height = 0.13 + runit(stoneIndex, 541) * 0.055;
        const bankY = THREE.MathUtils.lerp(bankHeights[0], bankHeights.at(-1), (1 - r) / (1 - bankRadii.at(-1)));
        add(pondStones, px + Math.sin(a) * PRX * r,
          bankY - 0.025 + height * 0.5,
          pz + Math.cos(a) * PRZ * r,
          0.73 + u * 0.38, height, 0.43 + runit(stoneIndex, 553) * 0.14,
          u < 0.35 ? '#8b8578' : u < 0.7 ? '#a09786' : '#736c60',
          a * 180 / Math.PI);
        stoneIndex += 1;
      }
      // Marginal planting: reed clumps on the tapered blade batch, plus tussocks.
      for (let clump = 0; clump < 18; clump += 1) {
        if (pauseBuild()) yield null;
        const a = (clump / 18) * Math.PI * 2 + 0.09;
        const u = runit(clump, 560);
        const cx = px + Math.sin(a) * (PRX * 0.84 + u * 0.6);
        const cz = pz + Math.cos(a) * (PRZ * 0.84 + u * 0.55);
        if (Math.abs(Math.sin(a) - 1) < 0.26) continue;
        for (let blade = 0; blade < 5; blade += 1) {
          if (pauseBuild()) yield null;
          const bu = runit(clump * 5 + blade, 580);
          const h = 0.85 + bu * 0.75;
          add(blades,
            cx + (bu - 0.5) * 0.7,
            0.30 + h * 0.5,
            cz + (runit(clump * 5 + blade, 610) - 0.5) * 0.7,
            0.20 + bu * 0.07, h, 0.20 + bu * 0.07,
            bu < 0.4 ? '#22522c' : bu < 0.75 ? '#3a7431' : '#5c8a35');
        }
        if (clump % 4 === 0) {
          add(blobs, cx, 0.42, cz, 1.5, 0.85, 1.35, u < 0.5 ? '#356d2d' : '#468a34');
        }
      }
      // Lily pads: a notched pad rather than a plain hexagon, each one turned and sized
      // off the schedule so they are not eight copies of one decal.
      for (const [dx, dz, s, color, yaw] of [
        [-2.9, -1.8, 0.68, '#416b32', 14], [-2.0, -2.4, 0.46, '#5b7f3a', 62],
        [-0.9, -2.6, 0.56, '#355f2f', 108], [0.7, -2.3, 0.42, '#628944', 41],
        [2.0, -1.7, 0.64, '#426f35', 137], [-2.7, 2.3, 0.52, '#638947', 88],
        [-0.2, 2.5, 0.62, '#3b6832', 23], [1.8, 2.0, 0.48, '#587e3d', 156],
      ]) {
        if (pauseBuild()) yield null;
        add(pondLeaves, px + dx, 0.386, pz + dz, s * 1.5, 0.045, s * 1.25, color, yaw);
        add(pondLeaves, px + dx + s * 0.52, 0.384, pz + dz - s * 0.36, s * 0.9, 0.04, s * 0.8,
          color, yaw + 40);
        if (s > 0.5) {
          add(blooms, px + dx + s * 0.3, 0.435, pz + dz, 0.26, 0.22, 0.26, '#f2ecdc');
        }
      }
      // Duck island: shingle bank, soil above the waterline, tussock and two masses. The
      // three pieces of street furniture that stood here at r1 are on the bank now.
      add(pondIsland, px - 1.5, 0.335, pz + 0.9, 3.5, 0.06, 3.0, '#6d6151');
      add(pondIsland, px - 1.5, 0.375, pz + 0.9, 2.7, 0.09, 2.3, '#8a7f64');
      add(pondIsland, px - 1.5, 0.425, pz + 0.9, 2.0, 0.06, 1.7, '#4c6b34');
      shrub(px - 1.7, pz + 0.8, 0.40, 1201, null, 0.455, 0.72);
      // V3.70. r2b jittered all five blades of this tussock from ONE unit, and used the
      // same unit for x, for z and for height, so two blades whose draws happen to land
      // close land at the same point at the same size. That is what happened: the measured
      // pair sat 0.0003 m apart, from `runit(0, 1240) = 0.4215420` against
      // `runit(1, 1240) = 0.4218784`.
      //
      // The hash is not the fault, and this was checked before it was blamed. Over 256,000
      // consecutive-index pairs `runit` puts 0.166 % of them within 1e-3 of each other,
      // against the 0.1999 % two independent uniforms would give — it is very slightly
      // BETTER than chance, not worse, and a variant with a full avalanche finaliser scores
      // 0.1949 %, i.e. no improvement. A one-dimensional jitter with no separation between
      // draws is the fault. The blades sit on a stratified ring now: each takes its own
      // angular sector, so no two can occupy one point whatever the hash returns, and each
      // axis draws its own salt.
      for (let blade = 0; blade < 5; blade += 1) {
        if (pauseBuild()) yield null;
        const bu = runit(blade, 1240);
        const bv = runit(blade, 1271);
        const a = ((blade + 0.5) / 5) * Math.PI * 2 + (bv - 0.5) * 0.9;
        const rad = 0.34 + bu * 0.30;
        add(blades,
          px - 0.9 + Math.sin(a) * rad,
          0.46 + bu * 0.4,
          pz + 1.5 + Math.cos(a) * rad * 0.8,
          0.22, 0.8 + bu * 0.5, 0.22,
          bu < 0.5 ? '#2c5f2c' : '#457f31');
      }
      // Timber jetty. r1's pier ended square in open water with no piles and no end post,
      // which the critic read as construction debris on a pond. It runs from a landing on
      // the bank now and stops at a proper head: end post pair, cross rail, and piles that
      // carry every bearer down through the surface to the bed.
      const jettyBank = px + PRX * 1.42;    // on the shingle
      const jettyHead = px + PRX * 0.34;    // where the deck stops, out over the water
      const jettyLen = jettyBank - jettyHead;
      add(solids, px + PRX * 1.60, 0.44, pz, 1.7, 0.14, 2.3, '#8c6a48');  // bank landing
      const planks = Math.max(5, Math.round(jettyLen / 0.52));
      for (let plank = 0; plank < planks; plank += 1) {
        if (pauseBuild()) yield null;
        add(solids, jettyHead + (plank + 0.5) * (jettyLen / planks), 0.47, pz,
          (jettyLen / planks) - 0.06, 0.16, 1.5, plank % 2 ? '#8c6a48' : '#9a7752');
      }
      for (const zOff of [-0.52, 0.52]) {
        if (pauseBuild()) yield null;
        add(solids, jettyHead + jettyLen * 0.5, 0.35, pz + zOff, jettyLen, 0.16, 0.16, '#5f4228');
        add(solids, jettyHead + jettyLen * 0.5, 1.05, pz + zOff, jettyLen - 0.5, 0.12, 0.12, '#6a4a28');
      }
      // End return: the head is closed by a rail across it, so nothing terminates in air.
      add(solids, jettyHead + 0.06, 1.05, pz, 0.12, 0.12, 1.16, '#6a4a28');
      for (const xOff of [jettyHead + 0.10, jettyBank - 0.20]) {
        if (pauseBuild()) yield null;
        for (const zOff of [-0.62, 0.62]) {
          if (pauseBuild()) yield null;
          add(solids, xOff, 0.72, pz + zOff, 0.18, 0.94, 0.18, '#5f4228');   // post
          add(rounds, xOff, 0.20, pz + zOff, 0.26, 0.62, 0.26, '#4a3420');   // pile to the bed
        }
      }
      // Path-mouth bollards where each carriageway meets the perimeter — they used to sit
      // on the picnic tables at ±8.5 and read as white cylinders standing on the furniture.
      for (const [bx, bz] of [[0, -21.9], [0, 21.9], [-21.9, 0], [21.9, 0]]) {
        if (pauseBuild()) yield null;
        for (const spread of [-1.35, 1.35]) {
          if (pauseBuild()) yield null;
          const ox = bx === 0 ? spread : 0;
          const oz = bz === 0 ? spread : 0;
          // V3.70 §2.10 — off the municipal green with the lamps and the hoops. A bollard
          // in the same bottle green as the benches, the bin bands, the balustrade and the
          // dome was one more area agreeing with the lawn.
          add(rounds, x + bx + ox, 0.52, z + bz + oz, 0.30, 0.92, 0.30, '#2f3439');
          add(rounds, x + bx + ox, 0.99, z + bz + oz, 0.36, 0.10, 0.36, '#585f66');
        }
      }

      // ── Rotunda ───────────────────────────────────────────────────────────────────
      // Stone plinth, cream columns on the diagonals so both carriageways keep a clear
      // sightline, a dark pierced balustrade between them, a timber deck, and a ribbed
      // octagonal roof with a fascia at the eaves. The dome used to be a smooth
      // hemisphere on a glossy metal batch whose instance tint was discarded, which is
      // why it read as glazed ceramic rather than as a roof.
      // r2b's plinth ran to 7.3 m radius against a colonnade at 4.5, so the rotunda stood
      // in the middle of a pale stone terrace two metres wider than it needed to be — and
      // the apron kerb ring, at 6.9, landed *on* that terrace, which is why the hero plate
      // showed loose grey slabs strewn over stone. The skirt is a skirt now: 5.9 m at the
      // ground step, and the apron kerb at 7.4 sits on paving with lawn beyond it.
      add(rotundaStoneRounds, x, 0.26, z, 11.8, 0.16, 11.8, restyleColour('#a89c85', '#c5b79c', { id: 'civic:reserve-rotunda.ground-step' })); // ground step
      add(rotundaStoneRounds, x, 0.34, z, 11.0, 0.2, 11.0, restyleColour('#8c806c', '#a5967f', { id: 'civic:reserve-rotunda.plinth-ring' })); // outer plinth ring mass
      add(rotundaStoneRounds, x, 0.42, z, 10.2, 0.16, 10.2, restyleColour('#c8b99c', '#ead9b7', { id: 'civic:reserve-rotunda.raised-step' })); // raised step
      add(rotundaStoneRounds, x, 0.4325, z, 9.55, 0.085, 9.55, restyleColour('#6f6355', '#837564', { id: 'civic:reserve-rotunda.deck-margin' })); // deck bearer + margin
      // Timber deck: straight boards across the drum, chord-cut, alternating tone, all one
      // width and one laid direction. r1 ran a centre joint board 0.01 proud of the deck,
      // which is the white wedge the critic found floating on the planks.
      for (let plank = 0; plank < 11; plank += 1) {
        const t = (plank - 5) * 0.78;
        const halfChord = Math.sqrt(Math.max(0.04, 4.55 * 4.55 - t * t));
        add(solids, x, 0.52, z + t, halfChord * 2, 0.08, 0.70,
          plank % 2 ? '#7f6040' : '#8c6a48');
      }
      // Stone nosing course at the deck edge, sitting 0.08 below the board face, so the
      // boards die into a margin rather than stopping in air over the plinth.
      add(rotundaStoneRounds, x, 0.4525, z, 9.9, 0.045, 9.9, restyleColour('#b3a68b', '#d2c2a3', { id: 'civic:reserve-rotunda.nosing' }));

      const COLUMN_ANGLES = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];
      // Balustrade: bottom rail, capping rail and turned balusters in dark painted iron,
      // filling every bay but the two the N–S carriageway enters through.
      for (let bay = 0; bay < 8; bay += 1) {
        if (pauseBuild()) yield null;
        const centre = bay * 45;
        if (centre === 0 || centre === 180) continue; // stair bays
        const a = centre * DEG;
        const bxp = x + Math.sin(a) * 4.42;
        const bzp = z + Math.cos(a) * 4.42;
        add(playPieces, bxp, 0.66, bzp, 3.05, 0.20, 0.26, '#1d3a2c', centre);
        add(playPieces, bxp, 1.52, bzp, 3.20, 0.18, 0.32, '#2b5341', centre);
        add(playPieces, bxp, 1.63, bzp, 3.20, 0.07, 0.40, '#e6dcc4', centre); // capping highlight
        add(playPieces, bxp, 1.16, bzp, 3.05, 0.10, 0.20, '#24493a', centre);  // intermediate rail
        // §2.5 fails a comb of straight bars at one weight by name, and that is what r1
        // shipped. The panel carries two member weights now: five heavy turned balusters
        // with a mid bulge, four light bars between them, and three rails, so the light
        // through it is a rhythm of wide and narrow gaps rather than one pitch.
        for (let bal = 0; bal < 5; bal += 1) {
          if (pauseBuild()) yield null;
          const off = (bal - 2) * 0.66;
          const bwx = bxp + Math.cos(a) * off;
          const bwz = bzp - Math.sin(a) * off;
          add(playPieces, bwx, 1.10, bwz, 0.18, 0.72, 0.18, '#20402f', centre);
          add(playPieces, bwx, 1.02, bwz, 0.27, 0.26, 0.24, '#2b5341', centre); // turned belly
          add(playPieces, bwx, 0.80, bwz, 0.22, 0.09, 0.21, '#1a3527', centre); // foot
        }
        for (let bal = 0; bal < 4; bal += 1) {
          if (pauseBuild()) yield null;
          const off = (bal - 1.5) * 0.66;
          add(playPieces,
            bxp + Math.cos(a) * off, 1.34, bzp - Math.sin(a) * off,
            0.09, 0.34, 0.09, '#24493a', centre);
        }
      }
      // Stair bays: timber treads stepping from the deck (top 0.56) down onto the plinth
      // (top 0.44), with stone cheeks either side. Each tread lands on the one below it.
      for (const facing of [1, -1]) {
        if (pauseBuild()) yield null;
        for (let tread = 0; tread < 2; tread += 1) {
          if (pauseBuild()) yield null;
          const zz = z + facing * (4.95 + tread * 0.70);
          add(solids, x, 0.475 - tread * 0.06, zz, 3.0 + tread * 0.34, 0.14, 0.66,
            tread % 2 ? '#8a5e35' : '#9d6c3d');
        }
        for (const cheek of [-1, 1]) {
          if (pauseBuild()) yield null;
          add(rotundaStoneSolids, x + cheek * 1.78, 0.42, z + facing * 5.3,
            0.40, 0.34, 1.9, '#b7a98d');
          add(rotundaStoneSolids, x + cheek * 1.78, 0.60, z + facing * 4.85,
            0.44, 0.16, 0.9, '#e0d3b7'); // newel cap at the head of the flight
        }
      }
      // Columns. Two faults on the r1 plate: the limestone ashlar wrapped a cylinder at a
      // different texel density on every instance scale, so the near and far shaft carried
      // brickwork at two different sizes; and the shaft oversailed the pale collar under it.
      // The shafts move to the painted-stone batch, and every base member from the plinth
      // up is strictly wider than the one above it, so nothing can oversail anything.
      for (const angle of COLUMN_ANGLES) {
        if (pauseBuild()) yield null;
        const a = angle * DEG;
        const cx = x + Math.sin(a) * 4.5;
        const cz = z + Math.cos(a) * 4.5;
        add(rotundaStoneSolids, cx, 0.615, cz, 1.34, 0.19, 1.34, '#8a7f6a', angle); // square plinth
        add(columns, cx, 0.78, cz, 1.10, 0.14, 1.10, '#c8bca2');   // plinth cap
        add(columns, cx, 0.92, cz, 0.92, 0.16, 0.92, '#efe4cd');   // torus
        add(columns, cx, 1.04, cz, 0.80, 0.10, 0.80, '#b7aa8f');   // fillet
        // Directed wear: splash-back grime where rain comes off the deck onto the shaft.
        add(columns, cx, 1.35, cz, 0.72, 0.52, 0.72, '#c2b393');
        add(columns, cx, 3.26, cz, 0.70, 4.34, 0.70, '#efe6d0');   // shaft
        // Six shallow engaged reeds. Their outer face sits on the shaft radius, so the
        // flutes model the shaft rather than standing off it.
        for (let flute = 0; flute < 6; flute += 1) {
          if (pauseBuild()) yield null;
          const fa = (flute / 6) * Math.PI * 2 + a;
          add(columns,
            cx + Math.sin(fa) * 0.295,
            3.26,
            cz + Math.cos(fa) * 0.295,
            0.115, 4.06, 0.115,
            flute % 2 ? '#cfc3a6' : '#fbf3dd');
        }
        add(columns, cx, 5.50, cz, 0.76, 0.16, 0.76, '#a2957b');   // necking
        add(columns, cx, 5.66, cz, 1.04, 0.20, 1.04, '#f4e9d1');   // echinus
        add(rotundaStoneSolids, cx, 5.83, cz, 1.28, 0.16, 1.28, '#c4b394', angle); // abacus
        add(rotundaStoneSolids, cx, 5.97, cz, 1.40, 0.12, 1.40, '#6d6151', angle); // abacus shadow
        // Spandrel bracket: two raking members and a knee at each post head, dark against
        // pale, so the ornament reads as a bracket rather than as a green box.
        for (const side of [-1, 1]) {
          if (pauseBuild()) yield null;
          const bx2 = cx + Math.cos(a) * side * 0.62;
          const bz2 = cz - Math.sin(a) * side * 0.62;
          add(playPieces, bx2, 5.24, bz2, 0.62, 0.13, 0.20, '#274a3a', angle);
          add(playPieces, bx2 + Math.cos(a) * side * 0.20, 5.02,
            bz2 - Math.sin(a) * side * 0.20, 0.30, 0.30, 0.17, '#2e5842', angle);
          add(playPieces, bx2 - Math.cos(a) * side * 0.14, 4.86,
            bz2 + Math.sin(a) * side * 0.14, 0.17, 0.24, 0.15, '#20402f', angle);
        }
      }
      // Entablature drum — the roof bears on this, and the fascia projects past the dome.
      add(rotundaStoneRounds, x, 5.84, z, 10.6, 0.2, 10.6, '#6c604f');
      add(rotundaStoneRounds, x, 6.04, z, 9.9, 0.36, 9.9, '#e2d7c0');
      add(rotundaStoneRounds, x, 6.30, z, 9.4, 0.18, 9.4, '#8c7b61'); // soffit shadow line
      add(rotundaStoneRounds, x, 6.47, z, 8.8, 0.30, 8.8, '#efe4cb'); // eaves fascia
      add(rotundaStoneRounds, x, 6.66, z, 8.3, 0.12, 8.3, '#7d6f58'); // fascia reveal under the roof
      // Ribbed roof: sixteen facets whose joints carry the rib tubes built below.
      add(domes, x, 6.62, z, 7.9, 3.5, 7.9, '#37604a');
      // Memorial figure on the bandstand deck. At r1 this read as a brick pier on a white
      // brick plinth carrying a stack of brown discs, with a plank projecting into mid-air —
      // the first thing the eye landed on inside the best structure on the plate. Rebuilt:
      // a stepped limestone pedestal, a standing bronze with legs, torso, shoulders and
      // head, one arm down the side, and a staff that lands on the pedestal instead of a
      // spear ending in nothing.
      add(rotundaStoneSolids, x, 0.63, z, 1.62, 0.20, 1.62, '#7c7161', 22);   // base course
      add(rotundaStoneSolids, x, 0.80, z, 1.34, 0.16, 1.34, '#efe4cc', 22);   // plinth
      add(rotundaStoneSolids, x, 1.10, z, 1.08, 0.46, 1.08, '#ded2b6', 22);   // die
      add(rotundaStoneSolids, x, 1.38, z, 1.26, 0.12, 1.26, '#8b8069', 22);   // cornice
      const BRONZE = '#5d4426';
      const BRONZE_LIT = '#7a5c33';
      for (const leg of [-0.15, 0.15]) {
        if (pauseBuild()) yield null;
        add(columns, x + leg, 1.86, z, 0.24, 0.84, 0.26, BRONZE);
      }
      add(columns, x, 2.52, z, 0.60, 0.60, 0.42, BRONZE_LIT);                 // torso
      add(columns, x, 2.86, z, 0.70, 0.16, 0.44, BRONZE);                     // shoulders
      add(columns, x, 3.06, z, 0.22, 0.14, 0.22, BRONZE);                     // neck
      add(columns, x, 3.22, z, 0.34, 0.34, 0.32, BRONZE_LIT);                 // head
      add(columns, x - 0.34, 2.50, z + 0.04, 0.17, 0.72, 0.19, BRONZE);       // arm at the side
      add(columns, x + 0.36, 2.54, z + 0.02, 0.17, 0.64, 0.19, BRONZE_LIT);   // staff arm
      add(columns, x + 0.46, 2.74, z + 0.02, 0.10, 2.60, 0.10, '#2f2417');    // staff, on the plinth
      // Lantern cupola + gilt finial terminate the dome silhouette.
      add(rounds, x, 8.42, z, 1.34, 0.52, 1.34, '#e0d2b0');
      add(rounds, x, 8.72, z, 1.48, 0.14, 1.48, '#7d6f58');
      add(roofs, x, 9.16, z, 1.22, 1.05, 1.22, '#2f5744');
      add(rounds, x, 9.78, z, 0.22, 0.42, 0.22, '#d8b45c');
      add(rounds, x, 10.14, z, 0.13, 0.42, 0.13, '#e8c878'); // spire tip
    }

    const addBatch = (name, geometry, material, items, castShadow = false) => {
      if (!items.length) return;
      const model = { parts: [{ geometry, material }] };
      const { group } = buildInstanced(model, items, { tint: true, castShadow, receiveShadow: true });
      group.name = name;
      this.root.add(group);
      this.stats.instances += items.length;
    };
    const flatGeom = new THREE.BoxGeometry(1, 1, 1);
    const solidGeom = new THREE.BoxGeometry(1, 1, 1);
    const roundGeom = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
    const roofGeom = new THREE.ConeGeometry(1, 1, 8);
    // Sixteen facets, so the roof is panelled rather than a smooth hemisphere, and the
    // rib tubes below land exactly on the facet joints.
    const domeGeom = new THREE.SphereGeometry(0.5, 16, 5, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const rippleGeom = new THREE.TorusGeometry(1, 0.035, 5, 24);
    rippleGeom.rotateX(Math.PI / 2);
    // V3.31 landscape primitives: chunky low-poly masses that stay cheap in quantity.
    const blobGeom = new THREE.SphereGeometry(0.5, 6, 4);      // 36 tris
    const bloomGeom = new THREE.SphereGeometry(0.5, 4, 2);     // 8 tris
    const chipGeom = new THREE.CylinderGeometry(0.5, 0.5, 1, 6); // 20 tris

    // R136 pond-local pad: one continuous 24-sector contour, a narrow V notch and
    // a shallow cupped top. The flat underside remains y=-0.5, preserving the
    // accepted waterline for both preauthored leaf scales and every transform.
    const pondLeafGeom = (() => {
      const sectors = 24, gap = 0.22, outer = [], inner = [];
      const positions = [], uv = [], indices = [];
      const vertex = (x, y, z) => {
        const id = positions.length / 3;
        positions.push(x, y, z);
        uv.push(0.5 + x, 0.5 + z); // the accepted radial leaf-field mapping
        return id;
      };
      const centre = vertex(0, -0.21, 0);
      for (let i = 0; i <= sectors; i += 1) {
        const a = gap + i * (Math.PI * 2 - 2 * gap) / sectors;
        const radius = 0.5 * (1 + 0.022 * Math.sin(a * 5 + 0.4) + 0.012 * Math.sin(a * 9 - 0.7));
        const x = Math.cos(a), z = Math.sin(a);
        const vein = 0.014 * Math.pow(Math.max(0, Math.cos(a * 8)), 8);
        inner.push(vertex(x * radius * 0.38, -0.185 + vein * 0.45, z * radius * 0.38));
        outer.push(vertex(x * radius, -0.105 + vein, z * radius));
      }
      const notch = vertex(0.11, -0.19, 0);
      // Centre/inner fan, softly lifted annulus, and two triangles that taper
      // into the split. The annulus joins the same contour at both ends.
      for (let i = 0; i < sectors; i += 1) {
        indices.push(centre, inner[i], inner[i + 1]);
        indices.push(inner[i], outer[i], inner[i + 1], inner[i + 1], outer[i], outer[i + 1]);
      }
      indices.push(centre, notch, inner[0], centre, inner[sectors], notch);
      indices.push(notch, outer[0], inner[0], notch, inner[sectors], outer[sectors]);
      const contour = [...outer, notch], underside = [];
      for (const id of contour) underside.push(vertex(positions[id * 3], -0.5, positions[id * 3 + 2]));
      const bottomCentre = vertex(0, -0.5, 0);
      for (let i = 0; i < contour.length; i += 1) {
        const next = (i + 1) % contour.length;
        indices.push(contour[i], underside[i], contour[next], contour[next], underside[i], underside[next]);
        indices.push(bottomCentre, underside[next], underside[i]);
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      // Clockwise x/z parameterisation requires reversing each triangle so
      // the visible top faces up, the skirt faces out, and the underside down.
      for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
      geom.setIndex(indices); geom.computeVertexNormals();
      geom.userData.pondLeafR136 = { sectors, notch: 0.11, underside: -0.5 };
      return geom;
    })();
    const bladeGeom = new THREE.ConeGeometry(0.5, 1, 4, 1);    // 6 tris — tapered reed blade
    MaterialLibrary.ensureUv2(flatGeom);
    MaterialLibrary.ensureUv2(solidGeom);
    MaterialLibrary.ensureUv2(roundGeom);
    MaterialLibrary.ensureUv2(roofGeom);
    MaterialLibrary.ensureUv2(domeGeom);
    MaterialLibrary.ensureUv2(rippleGeom);
    MaterialLibrary.ensureUv2(blobGeom);
    MaterialLibrary.ensureUv2(bloomGeom);
    MaterialLibrary.ensureUv2(chipGeom);
    MaterialLibrary.ensureUv2(pondLeafGeom);
    MaterialLibrary.ensureUv2(bladeGeom);
    // Neutral map bases so instance colour (the land-use tint) stays legible. Foliage /
    // asphalt packs are too saturated to multiply by playground browns and still read.
    addBatch(
      'topology:flat',
      flatGeom,
      tagSurface(this.materials.get('render', { variant: 'topology-flat', color: '#ffffff' }), 'reserve-flat'),
      flats,
    );
    addBatch(
      'topology:solid',
      solidGeom,
      this.materials.get('timber', { variant: 'topology-solid', color: '#ffffff' }),
      solids,
      true, // playground + furniture cast shadows
    );
    // V3.31: painted joinery — playground equipment and the rotunda balustrade. Moved off
    // `painted_metal` because `buildInstanced` discards the instance tint on that family,
    // so every authored colour in this bucket was rendering as the material's own white.
    addBatch(
      'topology:playground-pieces',
      solidGeom,
      this.materials.get('render', {
        variant: 'topology-painted-joinery-r31',
        color: '#ffffff',
        roughness: 0.56,
        metalness: 0.0,
      }),
      playPieces,
      true,
    );
    if (reserveSlide) {
      const material = this.materials.get('render', {
        variant: 'reserve-slide-r91', color: '#ffffff', roughness: 0.56, metalness: 0,
      });
      material.vertexColors = true;
      material.needsUpdate = true;
      const slide = new THREE.Mesh(reserveSlide, material);
      slide.name = 'topology:reserve-slide';
      slide.castShadow = true;
      slide.receiveShadow = true;
      this.root.add(slide);
    }
    addBatch(
      'topology:round',
      roundGeom,
      this.materials.get('limestone', {
        variant: 'topology-round-r31', color: '#ffffff', roughness: 0.88, metalness: 0.01,
      }),
      rounds,
      true, // rotunda columns cast
    );
    // Only the island's three natural strata leave the shared dressed-stone batch.
    // The existing sand pack has continuous grain and no architectural joints.
    addBatch(
      'topology:pond-island-ground',
      roundGeom,
      this.materials.get('sand', {
        variant: 'pond-island-ground-r134', color: '#ffffff', roughness: 0.98, metalness: 0,
      }),
      pondIsland,
      true, // preserve the island's original round-batch shadow role
    );
    addBatch(
      'topology:reserve-rotunda-stone-round',
      roundGeom,
      this.materials.get('limestone', {
        variant: 'reserve-rotunda-limestone-r31', color: restyleColour(new THREE.Color('#ffffff'), new THREE.Color().setRGB(1.3, 1.3, 1.3), { id: 'civic:reserve-rotunda.stone-round' }), roughness: 0.9, metalness: 0,
      }),
      rotundaStoneRounds,
      true,
    );
    addBatch(
      'topology:reserve-rotunda-stone-square',
      solidGeom,
      this.materials.get('limestone', {
        variant: 'reserve-rotunda-cut-stone-r31', color: restyleColour(new THREE.Color('#ffffff'), new THREE.Color().setRGB(1.3, 1.3, 1.3), { id: 'civic:reserve-rotunda.stone-square' }), roughness: 0.86, metalness: 0,
      }),
      rotundaStoneSolids,
      true,
    );
    addBatch(
      'topology:roof',
      roofGeom,
      this.materials.get('tile', { variant: 'topology-roof-r31', color: '#ffffff' }),
      roofs,
      true,
    );
    addBatch(
      'topology:dome',
      domeGeom,
      this.materials.get('tile', {
        variant: 'reserve-rotunda-roof-r31-matt',
        color: '#ffffff',
        roughness: 0.80,
        metalness: 0.0,
      }),
      domes,
      true,
    );
    if (pondBankGeometry) {
      const bankMaterial = this.materials.get('limestone', {
        // P17-W2B: the bank's vertex colours own its stone variation; V35.5 -> 62.
        variant: 'topology-pond-bank-r133', color: restyleColour(new THREE.Color('#ffffff'),
          new THREE.Color(1, 1, 1).multiplyScalar(3.308627), { id: 'civic:reserve-pond.bank' }), roughness: 0.88, metalness: 0.01,
      });
      bankMaterial.vertexColors = true; bankMaterial.needsUpdate = true;
      const bank = new THREE.Mesh(pondBankGeometry, bankMaterial);
      bank.name = 'topology:pond-bank'; bank.receiveShadow = true;
      this.root.add(bank);
    }
    if (pondWaterGeometry) {
      const waterMaterial = this.materials.get('water', {
        // r2b's pond read as a swimming pool: roughness 0.06 and metalness 0.26 under a
        // 1.4 env made the whole surface a cyan mirror, so the graded depth plates under it
        // never showed. A duller, greener surface lets the depth run do its work.
        variant: 'topology-pond-water-r32c-still', color: '#606060', opacity: 0.96, // W4-B: the ramp tones carry the colour; grey gain keeps the lit pixel on the ramp
        roughness: 0.34, metalness: 0.05,
      });
      waterMaterial.vertexColors = true; waterMaterial.needsUpdate = true;
      const waterMesh = new THREE.Mesh(pondWaterGeometry, waterMaterial);
      waterMesh.name = 'topology:pond-water'; waterMesh.receiveShadow = true;
      this.root.add(waterMesh);
    }
    addBatch(
      'topology:pond-ripples',
      rippleGeom,
      this.materials.get('render', {
        variant: 'topology-pond-ripple-r31', color: '#ffffff', roughness: 0.34, metalness: 0.0,
      }),
      ripples,
    );
    // V3.31 reserve landscape batches — planting masses, blooms, gravel chips and reeds.
    addBatch(
      'topology:planting-mass',
      blobGeom,
      this.materials.get('foliage', {
        variant: 'reserve-planting-mass-r31', color: '#ffffff', roughness: 0.94, metalness: 0,
      }),
      blobs,
      true,
    );
    if (leafBeds.length) {
      const leafGeometry = reserveLeafBedGeometry(this.quality);
      // Keep the atlas geometry and tint, but use the reserve foliage finish.
      // The standalone cluster Standard material falls back to a 0.92 environment
      // base in LightingRig; that response is a candidate cause of the pale
      // Q1-rain clumps at the city camera. This clone retains a local lifecycle.
      const leafMaterial = this.materials.get('foliage', {
        variant: 'reserve-leafy-beds-r101e', color: '#ffffff', roughness: 0.94,
        metalness: 0, envBase: 0.55,
      }).clone();
      leafMaterial.userData.sharedLibrary = false;
      leafMaterial.userData.leafCluster = true;
      leafMaterial.vertexColors = true;
      leafMaterial.alphaTest = 0.45;
      leafMaterial.side = THREE.DoubleSide;
      leafMaterial.shadowSide = THREE.FrontSide;
      leafMaterial.specularIntensity = 0.22;
      leafMaterial.normalMap = null;
      leafMaterial.roughnessMap = null;
      leafMaterial.aoMap = null;
      const plantingAlbedo = this.materials.get('foliage', {
        variant: 'reserve-planting-mass-r31', color: '#ffffff',
        roughness: 0.94, metalness: 0,
      }).map;
      // The atlas is white in the leaf region: its RGB alone made the newly
      // exposed cards much brighter and less green than accepted planting.
      // This private map keeps atlas alpha and samples the actual foliage pack
      // RGB. Shared atlas bytes and other foliage callers remain untouched.
      leafMaterial.map = reserveLeafBedMap(plantingAlbedo, this.quality);
      leafMaterial.userData.reserveLeafAtlasCopy = true;
      leafMaterial.userData.reserveFoliageAlbedo = 'accepted-foliage-rgb-r101f';
      // `buildInstanced` intentionally ignores tint for materials without a family.
      // This private batch owns its family so authored green instance colours reach
      // the atlas-cut cards and the joined core; no shared foliage material changes.
      leafMaterial.userData.family = 'foliage';
      addBatch('topology:reserve-leafy-beds', leafGeometry, leafMaterial, leafBeds, true);
    }
    addBatch(
      'topology:planting-bloom',
      bloomGeom,
      this.materials.get('render', {
        variant: 'reserve-planting-bloom-r31', color: '#ffffff', roughness: 0.62, metalness: 0,
      }),
      blooms,
    );
    addBatch(
      'topology:ground-chip',
      chipGeom,
      this.materials.get('limestone', {
        variant: 'reserve-ground-chip-r31', color: '#ffffff', roughness: 0.92, metalness: 0,
      }),
      chips,
    );
    // Pond-local materials retain each placement's authored tint and exact transform.
    // Sand's continuous grain supplies uncut mineral relief without the limestone
    // mortar grid; the grey instance colours still distinguish individual stones.
    addBatch(
      'topology:pond-shore-stone',
      chipGeom,
      this.materials.get('sand', {
        variant: 'pond-uncut-stone-r134', color: '#ffffff', roughness: 0.96, metalness: 0,
      }),
      pondStones,
    );
    // A small deterministic leaf field follows the cylinder's existing circular UVs.
    // Soft radial veins and broad value drift give the pads a continuous cuticle;
    // there are no leaf cards, canopy imagery, mortar seams or extra geometry.
    const leafSize = 128;
    const leafPixels = new Uint8Array(leafSize * leafSize * 4);
    for (let y = 0; y < leafSize; y += 1) for (let x = 0; x < leafSize; x += 1) {
      if (pauseBuild()) yield null;
      const dx = (x + 0.5) / leafSize - 0.5;
      const dy = (y + 0.5) / leafSize - 0.5;
      const radius = Math.min(1, Math.hypot(dx, dy) * 2);
      const angle = Math.atan2(dy, dx);
      const veins = Math.pow(Math.max(0, Math.cos(angle * 10 + radius * 1.7)), 16)
        * Math.min(1, radius * 4) * 13;
      const drift = Math.sin(x * 0.16 + Math.sin(y * 0.09) * 1.4) * 4
        + Math.sin(y * 0.21 - x * 0.08) * 3;
      const value = Math.round(225 + drift - veins - radius * 11);
      const i = (y * leafSize + x) * 4;
      leafPixels[i] = value - 4;
      leafPixels[i + 1] = value + 8;
      leafPixels[i + 2] = value - 7;
      leafPixels[i + 3] = 255;
    }
    const leafMap = new THREE.DataTexture(leafPixels, leafSize, leafSize, THREE.RGBAFormat);
    leafMap.colorSpace = THREE.SRGBColorSpace;
    leafMap.needsUpdate = true;
    const leafMaterial = this.materials.get('sand', {
      variant: 'pond-lily-leaf-r134', color: '#ffffff', roughness: 0.89, metalness: 0,
    }).clone();
    leafMaterial.userData.sharedLibrary = false;
    leafMaterial.userData.pondLeafOwnedMap = true;
    leafMaterial.userData.family = 'sand';
    leafMaterial.map = leafMap;
    leafMaterial.roughnessMap = null;
    leafMaterial.normalMap = null;
    leafMaterial.aoMap = null;
    leafMaterial.needsUpdate = true;
    addBatch('topology:pond-lily-leaf', pondLeafGeom, leafMaterial, pondLeaves);
    addBatch(
      'topology:planting-blade',
      bladeGeom,
      this.materials.get('foliage', {
        variant: 'reserve-planting-blade-r31', color: '#ffffff', roughness: 0.93, metalness: 0,
      }),
      blades,
      true,
    );
    // Reserve-wide organic field replaces repeated mineral relief. Contact sites
    // come from the actual placement register; no new furniture or grass meshes.
    const turfMaterial = this.materials.get('sand', {
      variant: 'reserve-turf-r32b-mown', color: '#ffffff', roughness: 0.95, metalness: 0,
    });
    // These two reserve-only materials support the building masses. Set linear
    // values once; retain the authored instance hues and the shared wear field.
    turfMaterial.color.copy(reserveTurfTint(0, 0, 0)).multiplyScalar(0.90);
    const pathMaterial = this.materials.get('sand', {
      variant: 'reserve-hoggin-r32', color: '#ffffff', roughness: 0.96, metalness: 0,
    });
    pathMaterial.color.setRGB(0.82, 0.82, 0.82);
    addBatch('topology:reserve-hoggin', flatGeom, pathMaterial, pathTiles);
    // Rotunda columns move off `limestone`: its ashlar block runs at a different texel
    // density on every instance scale, which is what made the near and far shaft carry
    // brickwork at two different sizes. Painted stone reads as one material at any size.
    addBatch(
      'topology:reserve-rotunda-columns',
      roundGeom,
      this.materials.get('render', {
        variant: 'reserve-rotunda-column-r32', color: restyleColour(new THREE.Color('#d8d0c0'), new THREE.Color('#fef5e2').multiplyScalar(2), { id: 'civic:reserve-rotunda.columns' }), roughness: 0.72, metalness: 0,
      }),
      columns,
      true,
    );

    // Eight merged elliptical dome ribs: one draw and a literal radial construction
    // read over the panelled roof. The ribs used to run at radius 3.72 under a dome of
    // radius 3.80 — inside the solid, so no seam was visible at all. They now trace the
    // facet joints just proud of the surface, which is what makes the roof read as a roof.
    if (reserve?.centre) {
      const ribs = [];
      for (let rib = 0; rib < 8; rib += 1) {
        if (pauseBuild()) yield null;
        const angle = (rib / 8) * Math.PI;
        const points = [];
        for (let step = 0; step <= 10; step += 1) {
          if (pauseBuild()) yield null;
          const t = (step / 10) * Math.PI;
          const radius = Math.cos(t) * 4.00;
          points.push(new THREE.Vector3(
            reserve.centre.x + Math.cos(angle) * radius,
            6.62 + Math.sin(t) * 1.86,
            reserve.centre.z + Math.sin(angle) * radius,
          ));
        }
        ribs.push(new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points),
          16,
          0.058,
          5,
          false,
        ));
      }
      const ribGeometry = mergeGeometries(ribs, false);
      for (const geometry of ribs) geometry.dispose();
      MaterialLibrary.ensureUv2(ribGeometry);
      const ribMesh = new THREE.Mesh(
        ribGeometry,
        this.materials.get('limestone', {
          variant: 'reserve-rotunda-dome-ribs-r31b-seam',
          color: '#c6b795',
          roughness: 0.72,
          metalness: 0.02,
        }),
      );
      ribMesh.name = 'topology:reserve-rotunda-dome-ribs';
      ribMesh.castShadow = true;
      ribMesh.receiveShadow = true;
      this.root.add(ribMesh);
    }

    this._buildParkFurniture();
    if (reserve) {
      const layout = Board.reserveLayout(reserve);
      const bearingSites = [
        ...(this._reserveSites?.discs ?? []).filter(site => site.what !== 'bench'),
        ...this._reserveGroundContacts,
      ];
      const lawn = new THREE.Mesh(buildReserveLawnPanels(layout, turf, bearingSites), turfMaterial);
      lawn.name = 'topology:reserve-turf';
      lawn.receiveShadow = true;
      this.root.add(lawn);
    }
    if (reserve) applyReserveGroundField(turfMaterial, {
      centre: reserve.centre, extent: Board.reserveLayout(reserve).HALF * 2,
      presentation: 'graded-lawn',
      seed: this.city.seed ?? 0, wearSites: this._reserveWearSites, contacts: [
        ...(this._reserveSites?.discs ?? []).filter(site => site.what !== 'bench'),
        ...this._reserveGroundContacts,
      ],
    });
    if (reserve) applyReserveWearMaterial(pathMaterial, turfMaterial, 'path');

    // R15 quality-loop: avenue kerb product (benches/bins/lamps/postboxes) for Monopoly Plus street read.
    this._buildAvenueKerbFurniture();
  }

  /**
   * Monopoly Plus street furniture on corridor footpaths — chunky high-chroma
   * benches, bins, lamps and postboxes so avenue plates read product, not empty tarmac.
   * Deterministic from city.seed; does not touch sim state.
   */
  _buildAvenueKerbFurniture() {
    const { blocksX, blocksZ } = this.city;
    if (!blocksX || !blocksZ) return;

    // R19j Melbourne municipal kit — one dark-metal family + timber + role red only.
    // R20bc: cast frames via concrete family (painted_metal washes blue under board light).
    const timber = this.materials.get('timber', {
      variant: 'avenue-kerb-timber-r19j',
      color: '#8c6a48', // built.timber
    });
    const metalDark = this.materials.get('concrete', {
      variant: 'avenue-kerb-cast-dark-r20bc',
      color: '#1e2228',
      roughness: 0.78,
      metalness: 0.12,
    });
    const metalRed = this.materials.get('painted_metal', {
      variant: 'avenue-kerb-red-r19j',
      color: '#c62828',
      roughness: 0.45,
      metalness: 0.25,
    });
    // R20w: forest green via concrete family (painted_metal washed teal under board light).
    const metalBin = this.materials.get('concrete', {
      variant: 'avenue-kerb-bin-r20w',
      color: '#3d4146', // W4-B: dark grey body (was forest green), lighter rim below
      roughness: 0.72,
      metalness: 0.08,
    });
    const metalBinRim = this.materials.get('concrete', {
      variant: 'avenue-bin-rim-w4b', color: '#7a7d80', roughness: 0.7, metalness: 0.08,
    });
    const lampGlow = this.materials.get('painted_metal', {
      variant: 'avenue-kerb-lamp-glow-r19j',
      color: '#ffe6a0',
      roughness: 0.2,
      metalness: 0.08,
    });
    if (lampGlow.emissive) {
      lampGlow.emissive.set('#ffd36a');
      lampGlow.emissiveIntensity = 0.85;
    }

    // R20ao furniture craft: product joints/sockets readable at avenue close.
    // Codex R20an P2 floor was furniture 5.6 (toy craft + weak close inventory).
    const timberLight = this.materials.get('timber', {
      variant: 'avenue-kerb-timber-light-r20ao',
      color: '#9b7752',
    });
    const timberDark = this.materials.get('timber', {
      variant: 'avenue-kerb-timber-dark-r20ao',
      color: '#6f5338',
    });

    // R20bf bench: thinner cast end profiles + legible joins/feet (Codex: less block extrusion).
    const benchParts = [];
    {
      const pad = new THREE.BoxGeometry(1.68, 0.04, 0.54);
      pad.translate(0, 0.02, 0);
      MaterialLibrary.ensureUv2(pad);
      benchParts.push({
        geometry: pad,
        material: this.materials.get('concrete', {
          variant: 'avenue-bench-pad-r20bf', color: '#3a3834', roughness: 0.95,
        }),
      });
    }
    // Five seat planks alternating value so gaps read as manufactured timber.
    const seatZs = [0.17, 0.085, 0.0, -0.085, -0.17];
    for (let i = 0; i < seatZs.length; i += 1) {
      const plank = new THREE.BoxGeometry(1.52, 0.055, 0.072);
      plank.translate(0, 0.46, seatZs[i]);
      MaterialLibrary.ensureUv2(plank);
      benchParts.push({ geometry: plank, material: i % 2 === 0 ? timberLight : timberDark });
    }
    // Raked back: four thin slats + rear support rail.
    for (const [hy, z] of [[0.6, -0.21], [0.72, -0.235], [0.84, -0.26], [0.96, -0.28]]) {
      const back = new THREE.BoxGeometry(1.5, 0.048, 0.042);
      back.translate(0, hy, z);
      MaterialLibrary.ensureUv2(back);
      benchParts.push({ geometry: back, material: timber });
    }
    {
      const rail = new THREE.BoxGeometry(1.42, 0.035, 0.035);
      rail.translate(0, 0.58, -0.19);
      MaterialLibrary.ensureUv2(rail);
      benchParts.push({ geometry: rail, material: metalDark });
    }
    // Cast end-frames: thinner profile, visible feet/bolts, arm with join sockets.
    for (const lx of [-0.7, 0.7]) {
      // Open leg silhouette (front + rear legs + top rail) instead of solid block.
      const rearLeg = new THREE.BoxGeometry(0.07, 0.48, 0.07);
      rearLeg.translate(lx, 0.26, -0.18);
      MaterialLibrary.ensureUv2(rearLeg);
      benchParts.push({ geometry: rearLeg, material: metalDark });
      const frontLeg = new THREE.BoxGeometry(0.07, 0.48, 0.07);
      frontLeg.translate(lx, 0.26, 0.18);
      MaterialLibrary.ensureUv2(frontLeg);
      benchParts.push({ geometry: frontLeg, material: metalDark });
      const sideRail = new THREE.BoxGeometry(0.055, 0.05, 0.38);
      sideRail.translate(lx, 0.42, 0);
      MaterialLibrary.ensureUv2(sideRail);
      benchParts.push({ geometry: sideRail, material: metalDark });
      const footR = new THREE.BoxGeometry(0.16, 0.04, 0.14);
      footR.translate(lx, 0.02, -0.18);
      MaterialLibrary.ensureUv2(footR);
      benchParts.push({ geometry: footR, material: metalDark });
      const footF = new THREE.BoxGeometry(0.16, 0.04, 0.14);
      footF.translate(lx, 0.02, 0.18);
      MaterialLibrary.ensureUv2(footF);
      benchParts.push({ geometry: footF, material: metalDark });
      for (const fz of [-0.18, 0.18]) {
        const bolt = new THREE.CylinderGeometry(0.028, 0.028, 0.035, 6);
        bolt.translate(lx, 0.045, fz);
        MaterialLibrary.ensureUv2(bolt);
        benchParts.push({ geometry: bolt, material: metalDark });
      }
      const upright = new THREE.BoxGeometry(0.065, 0.68, 0.065);
      upright.translate(lx, 0.7, -0.25);
      MaterialLibrary.ensureUv2(upright);
      benchParts.push({ geometry: upright, material: metalDark });
      // Arm: thin bar + socket collar at upright.
      const arm = new THREE.BoxGeometry(0.07, 0.045, 0.44);
      arm.translate(lx, 0.7, -0.02);
      MaterialLibrary.ensureUv2(arm);
      benchParts.push({ geometry: arm, material: metalDark });
      const armSocket = new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8);
      armSocket.rotateZ(Math.PI / 2);
      armSocket.translate(lx, 0.7, -0.25);
      MaterialLibrary.ensureUv2(armSocket);
      benchParts.push({ geometry: armSocket, material: metalDark });
      const armNose = new THREE.BoxGeometry(0.055, 0.18, 0.05);
      armNose.translate(lx, 0.58, 0.18);
      MaterialLibrary.ensureUv2(armNose);
      benchParts.push({ geometry: armNose, material: metalDark });
      const seatBar = new THREE.BoxGeometry(0.05, 0.04, 0.36);
      seatBar.translate(lx, 0.42, 0.0);
      MaterialLibrary.ensureUv2(seatBar);
      benchParts.push({ geometry: seatBar, material: metalDark });
    }
    // Front + rear stretchers (manufactured joinery).
    for (const [zy, zz] of [[0.2, 0.17], [0.2, -0.17]]) {
      const stretcher = new THREE.BoxGeometry(1.28, 0.04, 0.04);
      stretcher.translate(0, zy, zz);
      MaterialLibrary.ensureUv2(stretcher);
      benchParts.push({ geometry: stretcher, material: metalDark });
    }
    {
      const midBar = new THREE.BoxGeometry(0.05, 0.04, 0.42);
      midBar.translate(0, 0.42, 0);
      MaterialLibrary.ensureUv2(midBar);
      benchParts.push({ geometry: midBar, material: metalDark });
      for (const gz of [0.13, 0.04, -0.04, -0.13]) {
        const gap = new THREE.BoxGeometry(1.42, 0.018, 0.012);
        gap.translate(0, 0.49, gz);
        MaterialLibrary.ensureUv2(gap);
        benchParts.push({
          geometry: gap,
          material: this.materials.get('concrete', {
            variant: 'avenue-bench-gap-r20bf', color: '#12100e', roughness: 0.95,
          }),
        });
      }
    }
    const benchModel = {
      parts: benchParts,
      size: new THREE.Vector3(1.8, 1.08, 0.64),
      source: 'procedural-avenue-bench-r20bf',
    };

    // R20bl bin: RECTANGULAR municipal body (Codex: kill stacked-cylinder residual).
    // Cast plinth + square taper body + hinged flat lid + service door + foot pedal.
    const binParts = [];
    {
      const base = new THREE.BoxGeometry(0.62, 0.08, 0.54);
      base.translate(0, 0.04, 0);
      MaterialLibrary.ensureUv2(base);
      binParts.push({ geometry: base, material: metalDark });
      for (const [bx, bz] of [[-0.24, -0.18], [0.24, -0.18], [-0.24, 0.18], [0.24, 0.18]]) {
        const bolt = new THREE.CylinderGeometry(0.024, 0.024, 0.03, 6);
        bolt.translate(bx, 0.03, bz);
        MaterialLibrary.ensureUv2(bolt);
        binParts.push({ geometry: bolt, material: metalDark });
      }
      // Slight taper rectangular body — not a pipe stack.
      const body = new THREE.BoxGeometry(0.48, 0.78, 0.42);
      body.translate(0, 0.48, 0);
      MaterialLibrary.ensureUv2(body);
      binParts.push({ geometry: body, material: metalBin });
      // Shoulder step under lid.
      const shoulder = new THREE.BoxGeometry(0.5, 0.06, 0.44);
      shoulder.translate(0, 0.9, 0);
      MaterialLibrary.ensureUv2(shoulder);
      binParts.push({ geometry: shoulder, material: metalBinRim });
      // Service door panel + recessed seam + latch.
      const door = new THREE.BoxGeometry(0.28, 0.4, 0.04);
      door.translate(0, 0.46, 0.22);
      MaterialLibrary.ensureUv2(door);
      binParts.push({ geometry: door, material: metalDark });
      const seam = new THREE.BoxGeometry(0.02, 0.36, 0.025);
      seam.translate(0, 0.46, 0.245);
      MaterialLibrary.ensureUv2(seam);
      binParts.push({
        geometry: seam,
        material: this.materials.get('concrete', {
          variant: 'avenue-bin-seam-r20bl', color: '#0a0a0c', roughness: 0.95,
        }),
      });
      const latch = new THREE.BoxGeometry(0.08, 0.05, 0.04);
      latch.translate(0.08, 0.52, 0.255);
      MaterialLibrary.ensureUv2(latch);
      binParts.push({ geometry: latch, material: metalDark });
      // Flat hinged lid + raised handle (not stacked dome).
      const lid = new THREE.BoxGeometry(0.52, 0.05, 0.46);
      lid.translate(0, 0.98, 0);
      MaterialLibrary.ensureUv2(lid);
      binParts.push({ geometry: lid, material: metalDark });
      const hinge = new THREE.BoxGeometry(0.48, 0.035, 0.04);
      hinge.translate(0, 0.99, -0.2);
      MaterialLibrary.ensureUv2(hinge);
      binParts.push({ geometry: hinge, material: metalDark });
      const lidHandle = new THREE.BoxGeometry(0.16, 0.04, 0.04);
      lidHandle.translate(0, 1.04, 0.08);
      MaterialLibrary.ensureUv2(lidHandle);
      binParts.push({ geometry: lidHandle, material: metalDark });
      // Open mouth slot under front lid lip.
      const mouth = new THREE.BoxGeometry(0.3, 0.08, 0.12);
      mouth.translate(0, 0.94, 0.18);
      MaterialLibrary.ensureUv2(mouth);
      binParts.push({
        geometry: mouth,
        material: this.materials.get('concrete', {
          variant: 'avenue-bin-mouth-r20bl', color: '#040508', roughness: 0.97,
        }),
      });
      // Foot pedal (municipal product language).
      const pedal = new THREE.BoxGeometry(0.16, 0.03, 0.1);
      pedal.translate(0, 0.04, 0.3);
      MaterialLibrary.ensureUv2(pedal);
      binParts.push({ geometry: pedal, material: metalDark });
      const pedalArm = new THREE.BoxGeometry(0.04, 0.06, 0.12);
      pedalArm.translate(0, 0.08, 0.24);
      MaterialLibrary.ensureUv2(pedalArm);
      binParts.push({ geometry: pedalArm, material: metalDark });
      // Corner foot pads.
      for (const [fx, fz] of [[-0.22, -0.18], [0.22, -0.18], [-0.22, 0.18], [0.22, 0.18]]) {
        const pad = new THREE.BoxGeometry(0.08, 0.02, 0.08);
        pad.translate(fx, 0.01, fz);
        MaterialLibrary.ensureUv2(pad);
        binParts.push({ geometry: pad, material: metalDark });
      }
    }
    const binModel = {
      parts: binParts,
      size: new THREE.Vector3(0.72, 1.15, 0.64),
      source: 'procedural-avenue-bin-r20bl',
    };

    // R20bf Australia Post: SQUAT wider cast pillar + deep hooded mail cavity
    // (Codex: tall thin cylinder still bollard — reverse to grounded postal mass).
    const postRed = this.materials.get('concrete', {
      variant: 'avenue-postbox-red-r20bf', color: '#9e3b2e', // accent.red roughness: 0.5, metalness: 0.1,
    });
    const postWhite = this.materials.get('concrete', {
      variant: 'avenue-postbox-belt-r20bf', color: '#d9d6ce', roughness: 0.65, metalness: 0.02,
    });
    const postBlack = this.materials.get('concrete', {
      variant: 'avenue-postbox-void-r20bf', color: '#030304', roughness: 0.98, metalness: 0.0,
    });
    const postMetal = this.materials.get('painted_metal', {
      variant: 'avenue-postbox-metal-r20bf', color: '#1e2226', roughness: 0.4, metalness: 0.42,
    });
    const boxParts = [];
    {
      // Broad cast footing grounds squat pillar.
      const plinth = new THREE.CylinderGeometry(0.36, 0.4, 0.1, 14);
      plinth.translate(0, 0.05, 0);
      MaterialLibrary.ensureUv2(plinth);
      boxParts.push({ geometry: plinth, material: postMetal });
      for (let i = 0; i < 4; i += 1) {
        const ang = (i / 4) * Math.PI * 2;
        const bolt = new THREE.CylinderGeometry(0.032, 0.032, 0.03, 6);
        bolt.translate(Math.cos(ang) * 0.3, 0.025, Math.sin(ang) * 0.3);
        MaterialLibrary.ensureUv2(bolt);
        boxParts.push({ geometry: bolt, material: postMetal });
      }
      // Oval squat body (wider than hydrant pipe).
      const body = new THREE.CylinderGeometry(0.28, 0.3, 0.95, 16);
      body.scale(1.12, 1, 0.92);
      body.translate(0, 0.58, 0);
      MaterialLibrary.ensureUv2(body);
      boxParts.push({ geometry: body, material: postRed });
      const skirt = new THREE.CylinderGeometry(0.32, 0.33, 0.05, 16);
      skirt.scale(1.1, 1, 0.92);
      skirt.translate(0, 0.14, 0);
      MaterialLibrary.ensureUv2(skirt);
      boxParts.push({ geometry: skirt, material: postRed });
      // R20bl: flush pressed crown (no black puck lid) + deep mail slot planes.
      const belt = new THREE.CylinderGeometry(0.31, 0.31, 0.028, 16);
      belt.scale(1.12, 1, 0.92);
      belt.translate(0, 1.05, 0);
      MaterialLibrary.ensureUv2(belt);
      boxParts.push({ geometry: belt, material: postWhite });
      // Single thin red crown disc flush with body — NOT a thick puck stack.
      const lidDisc = new THREE.CylinderGeometry(0.32, 0.32, 0.018, 16);
      lidDisc.scale(1.12, 1, 0.92);
      lidDisc.translate(0, 1.075, 0);
      MaterialLibrary.ensureUv2(lidDisc);
      boxParts.push({ geometry: lidDisc, material: postRed });
      // Deep hooded mail cavity with floor / cheek / back planes (3D aperture).
      const cavity = new THREE.BoxGeometry(0.42, 0.18, 0.36);
      cavity.translate(0, 0.86, 0.0);
      MaterialLibrary.ensureUv2(cavity);
      boxParts.push({ geometry: cavity, material: postBlack });
      const cavityFloor = new THREE.BoxGeometry(0.4, 0.02, 0.3);
      cavityFloor.translate(0, 0.78, 0.02);
      MaterialLibrary.ensureUv2(cavityFloor);
      boxParts.push({ geometry: cavityFloor, material: postMetal });
      const cavityBack = new THREE.BoxGeometry(0.36, 0.14, 0.02);
      cavityBack.translate(0, 0.86, -0.14);
      MaterialLibrary.ensureUv2(cavityBack);
      boxParts.push({ geometry: cavityBack, material: postMetal });
      // Slim hood shelf (not thick black cap over mouth).
      const hood = new THREE.BoxGeometry(0.48, 0.035, 0.2);
      hood.translate(0, 0.97, 0.2);
      MaterialLibrary.ensureUv2(hood);
      boxParts.push({ geometry: hood, material: postRed });
      const lip = new THREE.BoxGeometry(0.44, 0.022, 0.08);
      lip.translate(0, 0.76, 0.22);
      MaterialLibrary.ensureUv2(lip);
      boxParts.push({ geometry: lip, material: postMetal });
      for (const sx of [-0.22, 0.22]) {
        const cheek = new THREE.BoxGeometry(0.045, 0.16, 0.14);
        cheek.translate(sx, 0.86, 0.2);
        MaterialLibrary.ensureUv2(cheek);
        boxParts.push({ geometry: cheek, material: postRed });
      }
      // Horizontal mail slot (readable aperture, not solid graphic).
      const mouth = new THREE.BoxGeometry(0.36, 0.05, 0.04);
      mouth.translate(0, 0.86, 0.28);
      MaterialLibrary.ensureUv2(mouth);
      boxParts.push({ geometry: mouth, material: postBlack });
      // Collection door + recessed panel + hinge pins + hasp lock.
      const door = new THREE.BoxGeometry(0.32, 0.38, 0.04);
      door.translate(0, 0.38, 0.275);
      MaterialLibrary.ensureUv2(door);
      boxParts.push({ geometry: door, material: postRed });
      const doorPanel = new THREE.BoxGeometry(0.26, 0.3, 0.018);
      doorPanel.translate(0, 0.38, 0.3);
      MaterialLibrary.ensureUv2(doorPanel);
      boxParts.push({ geometry: doorPanel, material: postBlack });
      const hinge = new THREE.BoxGeometry(0.04, 0.36, 0.04);
      hinge.translate(-0.15, 0.38, 0.305);
      MaterialLibrary.ensureUv2(hinge);
      boxParts.push({ geometry: hinge, material: postMetal });
      for (const hy of [0.26, 0.5]) {
        const hingePin = new THREE.CylinderGeometry(0.02, 0.02, 0.045, 6);
        hingePin.rotateZ(Math.PI / 2);
        hingePin.translate(-0.15, hy, 0.305);
        MaterialLibrary.ensureUv2(hingePin);
        boxParts.push({ geometry: hingePin, material: postMetal });
      }
      const hasp = new THREE.BoxGeometry(0.1, 0.12, 0.04);
      hasp.translate(0.1, 0.38, 0.315);
      MaterialLibrary.ensureUv2(hasp);
      boxParts.push({ geometry: hasp, material: postMetal });
      const lock = new THREE.CylinderGeometry(0.028, 0.028, 0.05, 8);
      lock.rotateX(Math.PI / 2);
      lock.translate(0.1, 0.38, 0.34);
      MaterialLibrary.ensureUv2(lock);
      boxParts.push({ geometry: lock, material: postMetal });
      const plate = new THREE.BoxGeometry(0.18, 0.1, 0.026);
      plate.translate(0, 0.62, 0.285);
      MaterialLibrary.ensureUv2(plate);
      boxParts.push({ geometry: plate, material: postWhite });
      const seam = new THREE.BoxGeometry(0.02, 0.72, 0.025);
      seam.translate(0.17, 0.52, 0.265);
      MaterialLibrary.ensureUv2(seam);
      boxParts.push({ geometry: seam, material: postBlack });
    }
    const postboxModel = {
      parts: boxParts,
      size: new THREE.Vector3(0.78, 1.12, 0.68),
      source: 'procedural-avenue-postbox-r20bl-squat',
    };

    // Straight post-top street lamp (no hanging outreach arm).
    // Plinth + taper pole + mid band + top lantern globe, all on the pole axis.
    const lampParts = [];
    {
      const base = new THREE.CylinderGeometry(0.32, 0.4, 0.28, 8);
      base.translate(0, 0.14, 0);
      MaterialLibrary.ensureUv2(base);
      lampParts.push({ geometry: base, material: metalDark });
      const collar = new THREE.CylinderGeometry(0.14, 0.22, 0.14, 8);
      collar.translate(0, 0.32, 0);
      MaterialLibrary.ensureUv2(collar);
      lampParts.push({ geometry: collar, material: metalDark });
      for (let i = 0; i < 4; i += 1) {
        const ang = (i / 4) * Math.PI * 2 + 0.4;
        const bolt = new THREE.CylinderGeometry(0.038, 0.038, 0.045, 6);
        bolt.translate(Math.cos(ang) * 0.28, 0.04, Math.sin(ang) * 0.28);
        MaterialLibrary.ensureUv2(bolt);
        lampParts.push({ geometry: bolt, material: metalDark });
      }
      const pole = new THREE.CylinderGeometry(0.055, 0.1, 2.85, 10);
      pole.translate(0, 1.75, 0);
      MaterialLibrary.ensureUv2(pole);
      lampParts.push({ geometry: pole, material: metalDark });
      {
        const midBand = new THREE.CylinderGeometry(0.085, 0.085, 0.06, 10);
        midBand.translate(0, 1.65, 0);
        MaterialLibrary.ensureUv2(midBand);
        lampParts.push({ geometry: midBand, material: metalDark });
      }
      // Top lantern stack (centred on pole — not offset/hanging).
      const neck = new THREE.CylinderGeometry(0.07, 0.09, 0.12, 8);
      neck.translate(0, 3.2, 0);
      MaterialLibrary.ensureUv2(neck);
      lampParts.push({ geometry: neck, material: metalDark });
      const hood = new THREE.CylinderGeometry(0.22, 0.1, 0.12, 12);
      hood.translate(0, 3.32, 0);
      MaterialLibrary.ensureUv2(hood);
      lampParts.push({ geometry: hood, material: metalDark });
      const globe = new THREE.SphereGeometry(0.16, 12, 10);
      globe.scale(1, 1.05, 1);
      globe.translate(0, 3.48, 0);
      MaterialLibrary.ensureUv2(globe);
      lampParts.push({ geometry: globe, material: lampGlow });
      const cageRing = new THREE.CylinderGeometry(0.14, 0.15, 0.04, 10);
      cageRing.translate(0, 3.34, 0);
      MaterialLibrary.ensureUv2(cageRing);
      lampParts.push({ geometry: cageRing, material: metalDark });
      const finial = new THREE.CylinderGeometry(0.04, 0.06, 0.08, 8);
      finial.translate(0, 3.68, 0);
      MaterialLibrary.ensureUv2(finial);
      lampParts.push({ geometry: finial, material: metalDark });
    }
    const lampModel = {
      parts: lampParts,
      size: new THREE.Vector3(0.72, 3.8, 0.72),
      source: 'procedural-avenue-lamp-straight',
    };

    /**
     * Street furniture roster:
     * 1. Street lamps: exactly 2 per pavement stretch (one block face × one kerb).
     * 2. Benches: exactly one per city block, beside a street lamp (not both axes).
     * 3. Street bins: one per block, only beside a Melbourne tram-stop sign.
     * 4. Postal drop: postbox near one corner of every other intersection cluster.
     * Trees own footpath centreline; furniture on kerb-side offset. Crown envelopes clear.
     */
    const schedule = [];
    // Footpath kerb offsets: closer to carriageway than tree centreline (1.5 / 14.5).
    const KERB_LOW = CORRIDOR.kerbLow - 0.55;   // ~2.45 — still on footpathA
    const KERB_HIGH = CORRIDOR.kerbHigh + 0.55; // ~13.55 — still on footpathB
    const MODEL_SPECIES = {
      'plane-tree-london': 'tree',
      'australian-eucalyptus': 'tree',
      'australian-jacaranda': 'tree',
      'australian-bottlebrush': 'tree',
    };
    // R19w: exclusion uses full crown span so benches never sit under canopy.
    const treeEnvelopes = (this.city.trees ?? []).map((t) => {
      const speciesId = MODEL_SPECIES[t.model] ?? 'tree';
      const sp = FOLIAGE_SPECIES[speciesId] ?? FOLIAGE_SPECIES.tree;
      const scale = Math.min(0.82, Math.max(0.5, (t.scale ?? 1) * 0.72));
      // Full crown radius + margin — furniture on kerb line, trees on centreline.
      const crownR = sp.height * scale * (sp.crownRadius ?? 0.5) * 0.95;
      return { x: t.x, z: t.z, r: crownR };
    });
    // R19ad: wider crown exclusion — furniture never under canopy (clearance major).
    // Lamps are thin poles: lighter tree margin so 2/stretch can always land.
    const PROP_RADIUS = { lamp: 0.35, bench: 0.95, bin: 0.55, postbox: 0.55 };
    const PROP_MARGIN = 2.1;
    const LAMP_TREE_MARGIN = 0.55;
    const LAMP_MIN_SEP = 14; // keep the pair readable as two posts, not a cluster
    const BENCH_LAMP_OFFSET = 1.7; // metres along kerb from the lamp post
    const placed = [];
    const clearOccupancy = (x, z, kind, { treeMargin = PROP_MARGIN, propPad = 0.45 } = {}) => {
      const propR = PROP_RADIUS[kind] ?? 0.4;
      for (const t of treeEnvelopes) {
        const need = t.r + propR + treeMargin;
        const dx = t.x - x;
        const dz = t.z - z;
        if (dx * dx + dz * dz < need * need) return false;
      }
      for (const p of placed) {
        const need = p.r + propR + propPad;
        const dx = p.x - x;
        const dz = p.z - z;
        if (dx * dx + dz * dz < need * need) return false;
      }
      return true;
    };
    const pushIfClear = (x, z, rot, kind, axis = 'z') => {
      const propR = PROP_RADIUS[kind] ?? 0.4;
      const slides = [0, 1.6, -1.6, 3.0, -3.0];
      for (const d of slides) {
        const px = axis === 'x' ? x + d : x;
        const pz = axis === 'z' ? z + d : z;
        if (!clearOccupancy(px, pz, kind)) continue;
        schedule.push({ pos: placement(px, 0, pz, rot), kind });
        placed.push({ x: px, z: pz, r: propR });
        return true;
      }
      return false;
    };
    /**
     * Exactly two street lamps on one pavement stretch (block face × kerb).
     * Prefer clear posts; slide along the stretch; commit even if near canopy.
     * @returns {{ px: number, pz: number }[]} lamps placed on this stretch
     */
    const placeTwoLampsOnStretch = (fixed, stretch0, rot, axis) => {
      const propR = PROP_RADIUS.lamp;
      const inset = 10; // ~1/5 of 48 m block — readable pair, not jammed at corners
      const targets = [stretch0 + inset, stretch0 + BLOCK - inset];
      const lo = stretch0 + 3.5;
      const hi = stretch0 + BLOCK - 3.5;
      const slides = [0, 1.5, -1.5, 3, -3, 4.5, -4.5, 6.5, -6.5, 8.5, -8.5];
      /** @type {{ px: number, pz: number }[]} */
      const stretchLamps = [];
      for (const target of targets) {
        let best = null;
        for (const d of slides) {
          const along = target + d;
          if (along < lo || along > hi) continue;
          const px = axis === 'z' ? fixed : along;
          const pz = axis === 'z' ? along : fixed;
          // Soft tree margin first, then allow closer to trunk so the pair always lands.
          if (clearOccupancy(px, pz, 'lamp', { treeMargin: LAMP_TREE_MARGIN, propPad: 0.55 })) {
            best = { px, pz };
            break;
          }
          if (!best && clearOccupancy(px, pz, 'lamp', {
            treeMargin: 0.15, propPad: 0.55,
          })) {
            best = { px, pz };
          }
        }
        if (!best) {
          // Last resort: pin on the design target (clamped), ignore tree envelope only.
          const along = Math.min(Math.max(target, lo), hi);
          const px = axis === 'z' ? fixed : along;
          const pz = axis === 'z' ? along : fixed;
          let blockedByProp = false;
          for (const p of placed) {
            const need = p.r + propR + 0.55;
            const dx = p.x - px;
            const dz = p.z - pz;
            if (dx * dx + dz * dz < need * need) {
              blockedByProp = true;
              break;
            }
          }
          if (!blockedByProp) best = { px, pz };
        }
        if (!best) continue;
        // Keep the pair separated along this stretch only.
        if (stretchLamps.length) {
          const other = stretchLamps[0];
          if (axis === 'z') {
            if (Math.abs(best.pz - other.pz) < LAMP_MIN_SEP) {
              const dir = best.pz >= other.pz ? 1 : -1;
              best.pz = Math.min(Math.max(other.pz + dir * LAMP_MIN_SEP, lo), hi);
            }
          } else if (Math.abs(best.px - other.px) < LAMP_MIN_SEP) {
            const dir = best.px >= other.px ? 1 : -1;
            best.px = Math.min(Math.max(other.px + dir * LAMP_MIN_SEP, lo), hi);
          }
        }
        stretchLamps.push(best);
        schedule.push({ pos: placement(best.px, 0, best.pz, rot), kind: 'lamp' });
        placed.push({ x: best.px, z: best.pz, r: propR });
      }
      return stretchLamps;
    };
    /**
     * Seat next to a street lamp on this stretch.
     * Prefer the lamp nearer mid-block so the seat reads as a kerb rest, not a corner.
     */
    const placeBenchBesideLamp = (stretchLamps, stretch0, rot, axis) => {
      if (!stretchLamps.length) return false;
      const mid = stretch0 + BLOCK / 2;
      const lamp = stretchLamps.slice().sort((a, b) => {
        const da = axis === 'z' ? Math.abs(a.pz - mid) : Math.abs(a.px - mid);
        const db = axis === 'z' ? Math.abs(b.pz - mid) : Math.abs(b.px - mid);
        return da - db;
      })[0];
      const lo = stretch0 + 3.5;
      const hi = stretch0 + BLOCK - 3.5;
      // Offset toward block mid from the chosen lamp.
      const lampAlong = axis === 'z' ? lamp.pz : lamp.px;
      const towardMid = lampAlong <= mid ? 1 : -1;
      const tryOffsets = [
        towardMid * BENCH_LAMP_OFFSET,
        -towardMid * BENCH_LAMP_OFFSET,
        towardMid * (BENCH_LAMP_OFFSET + 1.2),
        -towardMid * (BENCH_LAMP_OFFSET + 1.2),
      ];
      for (const d of tryOffsets) {
        const along = Math.min(Math.max(lampAlong + d, lo), hi);
        const px = axis === 'z' ? lamp.px : along;
        const pz = axis === 'z' ? along : lamp.pz;
        if (!clearOccupancy(px, pz, 'bench', { treeMargin: 1.0, propPad: 0.55 })) continue;
        schedule.push({ pos: placement(px, 0, pz, rot), kind: 'bench' });
        placed.push({ x: px, z: pz, r: PROP_RADIUS.bench });
        return true;
      }
      // Commit beside the lamp even if crown soft-fails (identity > soft exclusion).
      const along = Math.min(Math.max(lampAlong + towardMid * BENCH_LAMP_OFFSET, lo), hi);
      const px = axis === 'z' ? lamp.px : along;
      const pz = axis === 'z' ? along : lamp.pz;
      let blockedByProp = false;
      for (const p of placed) {
        const need = p.r + PROP_RADIUS.bench + 0.55;
        const dx = p.x - px;
        const dz = p.z - pz;
        if (dx * dx + dz * dz < need * need) {
          blockedByProp = true;
          break;
        }
      }
      if (blockedByProp) return false;
      schedule.push({ pos: placement(px, 0, pz, rot), kind: 'bench' });
      placed.push({ x: px, z: pz, r: PROP_RADIUS.bench });
      return true;
    };

    // At most one bench per city block (N–S placement first; E–W only fills gaps).
    // Low kerb of corridor i faces block (i-1, bz); low kerb of corridor j faces (bx, j-1).
    const blocksWithBench = new Set();

    // —— Corridors parallel to Z (vary X) ——
    for (let i = 0; i <= blocksX; i += 1) {
      const corridorX = i * PITCH;
      // One kerb line per corridor half — not both sides stamped equally.
      for (const localX of [KERB_LOW, KERB_HIGH]) {
        const x = corridorX + localX;
        const rot = localX < ROAD / 2 ? 90 : -90;
        const isLowKerb = localX === KERB_LOW;
        for (let bz = 0; bz < blocksZ; bz += 1) {
          const blockZ0 = ROAD + bz * PITCH;
          // Exactly two lamps on this pavement stretch.
          const stretchLamps = placeTwoLampsOnStretch(x, blockZ0, rot, 'z');
          // One bench per city block beside a lamp (west footpath of road east of block).
          if (isLowKerb && i > 0 && i <= blocksX) {
            const blockKey = `${i - 1},${bz}`;
            if (!blocksWithBench.has(blockKey)) {
              if (placeBenchBesideLamp(stretchLamps, blockZ0, rot, 'z')) {
                blocksWithBench.add(blockKey);
              }
            }
          }
          // Situation 4: postal drop near block end.
          if (isLowKerb) {
            pushIfClear(x, blockZ0 + BLOCK - 8.5, rot, 'postbox', 'z');
          }
        }
      }
    }
    // —— Corridors parallel to X (vary Z) ——
    for (let j = 0; j <= blocksZ; j += 1) {
      const corridorZ = j * PITCH;
      for (const localZ of [KERB_LOW, KERB_HIGH]) {
        const z = corridorZ + localZ;
        const rot = localZ < ROAD / 2 ? 0 : 180;
        const isLowKerb = localZ === KERB_LOW;
        for (let bx = 0; bx < blocksX; bx += 1) {
          const blockX0 = ROAD + bx * PITCH;
          const stretchLamps = placeTwoLampsOnStretch(z, blockX0, rot, 'x');
          // Only if this city block still has no bench (should be rare after N–S pass).
          if (isLowKerb && j > 0 && j <= blocksZ) {
            const blockKey = `${bx},${j - 1}`;
            if (!blocksWithBench.has(blockKey)) {
              if (placeBenchBesideLamp(stretchLamps, blockX0, rot, 'x')) {
                blocksWithBench.add(blockKey);
              }
            }
          }
          if (isLowKerb) {
            pushIfClear(blockX0 + BLOCK - 8.5, z, rot, 'postbox', 'x');
          }
        }
      }
    }

    // Situation 3: one street bin per block, only beside a Melbourne tram-stop sign.
    {
      const tramSigns = this.streetscape?.flagPlacements ?? [];
      // F1: keep the bin beyond the canopy and its downstream flag.
      const BIN_OFFSET = tramStopKitEnabled() ? 3.7 : 1.45; // metres along the kerb from the stop pole
      const seenBlock = new Set();
      for (const sign of tramSigns) {
        const sx = sign.position.x;
        const sz = sign.position.z;
        // One bin per corridor-block cell (not both if dual signs ever reappear).
        const bi = Math.floor(sx / PITCH);
        const bj = Math.floor(sz / PITCH);
        const blockKey = `${bi},${bj}`;
        if (seenBlock.has(blockKey)) continue;
        seenBlock.add(blockKey);
        // Run direction: vertical corridor (sign on N–S road) → offset in Z; else X.
        const lx = ((sx % PITCH) + PITCH) % PITCH;
        const lz = ((sz % PITCH) + PITCH) % PITCH;
        const onVerticalRoad = lx < ROAD + 0.01;
        const onHorizontalRoad = lz < ROAD + 0.01;
        let bx = sx;
        let bz = sz;
        if (onVerticalRoad && !onHorizontalRoad) {
          bz = sz + BIN_OFFSET;
        } else if (onHorizontalRoad && !onVerticalRoad) {
          bx = sx + BIN_OFFSET;
        } else {
          // Junction-ish: prefer Z offset.
          bz = sz + BIN_OFFSET;
        }
        // Face the bin the same way as nearby kerb furniture.
        const rot = onVerticalRoad
          ? (lx < ROAD / 2 ? 90 : -90)
          : (lz < ROAD / 2 ? 0 : 180);
        if (!clearOccupancy(bx, bz, 'bin', { treeMargin: 0.8, propPad: 0.5 })) {
          // Nudge the other way along the stretch if the first slot is taken.
          if (onVerticalRoad && !onHorizontalRoad) bz = sz - BIN_OFFSET;
          else if (onHorizontalRoad && !onVerticalRoad) bx = sx - BIN_OFFSET;
          else bz = sz - BIN_OFFSET;
          if (!clearOccupancy(bx, bz, 'bin', { treeMargin: 0.8, propPad: 0.5 })) {
            // Still commit beside the sign — tram stop identity wins over crown soft fail.
            bx = onVerticalRoad ? sx : sx + BIN_OFFSET;
            bz = onVerticalRoad ? sz + BIN_OFFSET : sz;
          }
        }
        schedule.push({ pos: placement(bx, 0, bz, rot), kind: 'bin' });
        placed.push({ x: bx, z: bz, r: PROP_RADIUS.bin });
      }
    }

    const byKind = {
      bench: schedule.filter((s) => s.kind === 'bench').map((s) => s.pos),
      bin: schedule.filter((s) => s.kind === 'bin').map((s) => s.pos),
      lamp: schedule.filter((s) => s.kind === 'lamp').map((s) => s.pos),
      postbox: schedule.filter((s) => s.kind === 'postbox').map((s) => s.pos),
    };

    const placeKit = (model, placements, name, modelId, label) => {
      if (!placements.length) return;
      const { group, meshes } = buildInstanced(model, placements, {
        castShadow: true, receiveShadow: true,
      });
      group.name = name;
      this.root.add(group);
      this.stats.instances += placements.length;
      placements.forEach((basePlacement, index) => {
        this._registerStaticMischiefTarget({
          key: `prop:${name}:${index}:${basePlacement.position.x.toFixed(1)}:${basePlacement.position.z.toFixed(1)}`,
          kind: 'prop',
          modelId,
          label,
          model,
          meshes,
          index,
          basePlacement,
        });
      });
    };

    placeKit(benchModel, byKind.bench, 'streetscape:avenue-benches', 'park-blackwood-bench', 'Bench');
    placeKit(binModel, byKind.bin, 'streetscape:avenue-bins', 'hoddle-grid-bin', 'Street bin');
    placeKit(lampModel, byKind.lamp, 'streetscape:avenue-lamps', 'reserve-path-lamp', 'Street lamp');
    placeKit(postboxModel, byKind.postbox, 'streetscape:avenue-postboxes', 'australia-post-box', 'Australia Post box');
  }

  /**
   * V3.31 r2 — the reserve plan, as one source of truth.
   *
   * Round 1 kept the pond footprint, the playground pad and the path grid inside
   * `_buildTopology`, where the two furniture builders could not see them. The result on
   * the r1 plates was a picnic table, a planter, a litter bin and a lamp column standing
   * on open water, which the dimension critic scored as the defect that capped the whole
   * subject. Every placement list in this lane now runs through `layout.clear()`.
   *
   * Pure function of the reserve record: no clock, no PRNG, no state read beyond `city`.
   *
   * @param {{centre: {x: number, z: number}, pondQuadrant: string, playgroundQuadrant: string}} reserve
   */
  static reserveLayout(reserve) {
    const { x, z } = reserve.centre;
    const SIGN = {
      'north-west': [-1, -1], 'north-east': [1, -1],
      'south-east': [1, 1], 'south-west': [-1, 1],
    };
    const play = SIGN[reserve.playgroundQuadrant] ?? [-1, -1];
    const pond = SIGN[reserve.pondQuadrant] ?? [1, 1];
    const layout = {
      x,
      z,
      HALF: (BLOCK - 0.6) / 2,   // 23.7 — the lawn plate reaches the perimeter footpath
      // r2b closed the plan but paved roughly half of it: a 4.5 m carriageway on each of
      // four arms plus a 3.0 m circuit reads as more paving than lawn, where the reference
      // runs a slender ribbon through a lawn that dominates the tile. Both are narrower.
      PATH_HALF: 1.80,           // half width of a radial carriageway
      KERB_MID: 1.99,            // paver centreline on the carriageway edge
      APRON: 7.40,               // rotunda apron radius — outside the plinth, not on it
      LOOP: 17.6,                // promenade circuit centreline
      LOOP_HALF: 1.20,
      // The pond and the playground were both large enough at r1 to overrun any circuit
      // that closed the plan. Both are pulled in so the promenade has a clear corridor.
      pond: { x: x + pond[0] * 9.8, z: z + pond[1] * 9.8, rx: 5.5, rz: 5.1 },
      play: { x: x + play[0] * 10.0, z: z + play[1] * 10.0, hx: 5.6, hz: 5.2 },
    };
    layout.PATH_END = layout.HALF;
    layout.centre = { x, z };

    /** True when the pond or the playground pad covers this point. */
    layout.onFeature = (px, pz, pad = 0.9) => {
      const dxp = (px - layout.pond.x) / (layout.pond.rx + pad);
      const dzp = (pz - layout.pond.z) / (layout.pond.rz + pad);
      if (dxp * dxp + dzp * dzp < 1) return true;
      return Math.abs(px - layout.play.x) < layout.play.hx + pad
        && Math.abs(pz - layout.play.z) < layout.play.hz + pad;
    };

    /** True when the point is on made ground — a carriageway, the circuit or the apron. */
    layout.onPaving = (px, pz, pad = 0.9) => {
      const dx = Math.abs(px - x);
      const dz = Math.abs(pz - z);
      const arm = layout.PATH_HALF + 0.55 + pad * 0.5;
      if (dx < arm || dz < arm) return true;
      const loop = layout.LOOP_HALF + 0.45 + pad * 0.5;
      if (Math.abs(dx - layout.LOOP) < loop && dz < layout.LOOP + loop) return true;
      if (Math.abs(dz - layout.LOOP) < loop && dx < layout.LOOP + loop) return true;
      return Math.hypot(dx, dz) < layout.APRON + 0.8;
    };

    /** Somewhere a prop may legally stand: on the lawn, off the water, off the paving. */
    layout.clear = (px, pz, pad = 0.9) => {
      if (Math.abs(px - x) > layout.HALF - 1.0) return false;
      if (Math.abs(pz - z) > layout.HALF - 1.0) return false;
      if (layout.onFeature(px, pz, pad)) return false;
      return !layout.onPaving(px, pz, pad);
    };
    return layout;
  }

  /**
   * V3.70 RESERVE — the shared occupancy register the reserve did not have.
   *
   * The measured defect (`mvp/tests/reserve-coincidence.mjs`, r1 before-state): five
   * independent passes site objects on this block — planting beds and the rotunda collar in
   * `_buildTopology`, benches and picnic tables in `_buildParkFurniture`, bins / hoops /
   * lamps / planters / the fountain in `_buildReserveStreetKit`, and the eight reserve trees
   * authored upstream in `core/city.js`. Every one of them tested its candidate against
   * {@link reserveLayout}, which knows about lawn, paving, pond and softfall — and against
   * **nothing that had already been placed**. Ten furniture pairs stood inside each other, a
   * picnic table and a planter at 0.12 m apart, and every reserve tree trunk stood 0.33 to
   * 0.85 m from a shrub mass, which is the owner's "duplication of furniture, plants in the
   * same spot" exactly.
   *
   * This is that missing set. It is a plain list of keep-out discs, walked linearly: the
   * reserve places well under three hundred sited objects, so an index would cost more code
   * than it saves. Determinism is structural — there is no hash, no clock and no RNG in
   * here, and nothing reads simulation state (§3.3). Insertion order is the build order, so
   * two runs of the same seed produce byte-identical output.
   *
   * @param {ReturnType<typeof Board.reserveLayout>} LAY
   */
  static _reserveOccupancy(LAY) {
    /** @type {Array<{x: number, z: number, r: number, what: string}>} */
    const discs = [];
    const PLANTING = (d) => d.what === 'planting';
    return {
      discs,
      /**
       * Nothing already sited overlaps this candidate.
       *
       * Two radii, because a bench is 1.98 m long and 0.70 m deep and a single disc cannot
       * describe both. `r` is the circumscribed radius and governs furniture against
       * furniture, where an end-to-end clash is the failure. `softR` is the half-depth and
       * governs furniture against PLANTING, where a seat backing into the skirt of a
       * border is the intended reading, not a fault. Sizing planting off `r` culled eleven
       * of sixteen benches on the first run of this register for clashes that do not exist
       * in the geometry.
       *
       * @param {(d: object) => boolean | null} ignore discs this caller may sit against.
       */
      free(px, pz, r, ignore = null, softR = r) {
        for (const d of discs) {
          if (ignore && ignore(d)) continue;
          const mine = d.what === 'planting' ? softR : r;
          if (Math.hypot(px - d.x, pz - d.z) < mine + d.r) return false;
        }
        return true;
      },
      take(px, pz, r, what) {
        discs.push({ x: px, z: pz, r, what });
      },
      /** Site something if the plan allows it AND nothing already stands there. */
      claim(px, pz, r, what, pad = r, ignore = null, softR = r) {
        if (!LAY.clear(px, pz, pad)) return null;
        if (!this.free(px, pz, r, ignore, softR)) return null;
        this.take(px, pz, r, what);
        return { x: px, z: pz };
      },
      /**
       * The authored site, then four short offsets at up to 1.65 m, then nothing.
       *
       * This replaces r2b's `standOn` walker, which on a foul marched the object OUTWARD
       * along its own radius in 0.55 m steps for up to 14.3 m until `LAY.clear` passed —
       * and `LAY.clear` cannot see furniture. Measured: all eight path lamps failed the
       * circuit test by a 0.02 m margin and every one of them marched 4.95 m into the
       * perimeter band, where four of them came to rest 0.413 m from a bench. A hole in a
       * rhythm is a smaller fault than a lamp inside a bench, so a site that cannot be
       * found inside its own bay is dropped.
       */
      claimNear(px, pz, r, what, pad = r, ignore = null, softR = r) {
        const direct = this.claim(px, pz, r, what, pad, ignore, softR);
        if (direct) return direct;
        const dx = px - LAY.centre.x;
        const dz = pz - LAY.centre.z;
        const len = Math.hypot(dx, dz) || 1;
        const ux = dx / len;
        const uz = dz / len;
        for (const step of [0.55, 1.10, 1.65]) {
          for (const [ox, oz] of [
            [-uz * step, ux * step], [uz * step, -ux * step],
            [ux * step, uz * step], [-ux * step, -uz * step],
          ]) {
            const site = this.claim(px + ox, pz + oz, r, what, pad, ignore, softR);
            if (site) return site;
          }
        }
        return null;
      },
      /**
       * Planting may abut planting — that is what makes a bed a mass and not a sprinkle —
       * and may not stand in a tree pit or on furniture. No plan test: a bed's own
       * rectangle is authored and already sited, and applying `LAY.clear`'s 1.0 m
       * perimeter margin per shrub culled the outer half of every border.
       */
      claimPlanting(px, pz, r) {
        if (!this.free(px, pz, r, PLANTING)) return null;
        this.take(px, pz, r, 'planting');
        return { x: px, z: pz };
      },
    };
  }

  /**
   * V3.31 reserve-kit part builder.
   *
   * `buildInstanced` opens one `InstancedMesh` per `model.parts` entry, so a prop authored
   * as forty boxes costs forty draw submissions however few instances it has. The reserve
   * draws a lot of props, so every part list here is collected into per-material buckets
   * and merged: a planter carries seven hundred triangles of board-and-post construction
   * for four draw calls rather than forty.
   *
   * The unmerged list is still worth keeping — {@link _registerStaticMischiefTarget} reads
   * `model.parts` bounding boxes to build the damaged voxel kit, and a single merged tub
   * would collapse to one AABB and stage as a generic pile. Callers therefore pass the
   * fine-grained list as `mischiefModel` and the merged one to the renderer.
   *
   * @param {Array<{geometry: THREE.BufferGeometry, material: THREE.Material}>} entries
   * @returns {Array<{geometry: THREE.BufferGeometry, material: THREE.Material}>}
   */
  static _mergeKitParts(entries) {
    const byMaterial = new Map();
    for (const entry of entries) {
      if (!entry?.geometry || !entry.material) continue;
      if (!byMaterial.has(entry.material)) byMaterial.set(entry.material, []);
      byMaterial.get(entry.material).push(entry.geometry);
    }
    const parts = [];
    for (const [material, geometries] of byMaterial) {
      let geometry;
      if (geometries.length === 1) {
        geometry = geometries[0].clone();
      } else {
        geometry = mergeGeometries(geometries, false);
      }
      if (!geometry) continue;
      MaterialLibrary.ensureUv2(geometry);
      geometry.computeBoundingBox();
      parts.push({ geometry, material });
    }
    return parts;
  }

  /** Axis-aligned box part at a position, ready for {@link Board._mergeKitParts}. */
  static _kitBox(material, w, h, d, px, py, pz, yawDeg = 0) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    if (yawDeg) geometry.rotateY(yawDeg * DEG);
    geometry.translate(px, py, pz);
    return { geometry, material };
  }

  /** Cylinder part (radial segments kept low — these are board-scale props). */
  static _kitCyl(material, rTop, rBottom, h, px, py, pz, segments = 8) {
    const geometry = new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1);
    geometry.translate(px, py, pz);
    return { geometry, material };
  }

  /** Faceted low-poly mass for planting clumps and soil clods. 36 tris at the default. */
  static _kitBlob(material, rx, ry, rz, px, py, pz, wSeg = 6, hSeg = 4) {
    const geometry = new THREE.SphereGeometry(0.5, wSeg, hSeg);
    geometry.scale(rx * 2, ry * 2, rz * 2);
    geometry.translate(px, py, pz);
    return { geometry, material };
  }

  /** Hemispherical cap (lids, domes). */
  static _kitCap(material, rx, ry, rz, px, py, pz, wSeg = 10, hSeg = 4) {
    const geometry = new THREE.SphereGeometry(0.5, wSeg, hSeg, 0, Math.PI * 2, 0, Math.PI * 0.5);
    geometry.scale(rx * 2, ry * 2, rz * 2);
    geometry.translate(px, py, pz);
    return { geometry, material };
  }

  /** Four-sided pyramid cap for lantern hoods. */
  static _kitCone(material, r, h, px, py, pz, segments = 4) {
    const geometry = new THREE.ConeGeometry(r, h, segments, 1);
    geometry.translate(px, py, pz);
    return { geometry, material };
  }

  /**
   * Named procedural park bench + picnic table kit (InstancedMesh).
   * Replaces anonymous brown topology solids so pocket-park / reserve furniture
   * is pickable mischief and reads as seat furniture, not timber bars.
   * Low triangle cost: shared box parts × modest instance counts.
   */
  _buildParkFurniture() {
    const benches = [];
    const picnics = [];

    const pushBench = (x, z, rotationDeg) => {
      benches.push(placement(x, 0, z, rotationDeg));
    };
    const pushPicnic = (x, z, rotationDeg) => {
      picnics.push(placement(x, 0, z, rotationDeg));
    };

    // Pocket-park benches are authored with the V3.33 core layer.

    const reserve = this.city.reserve;
    if (reserve) {
      const { x, z } = reserve.centre;
      // V3.31 r2. Every reserve placement below is tested against the plan before it is
      // pushed. At r1 the pond footprint lived inside `_buildTopology` and nothing out
      // here could see it, so a picnic table stood on open water and a bench overhung it
      // by half its length — the defect the dimension critic said capped the subject.
      const LAY = Board.reserveLayout(reserve);
      // V3.70. Placements go through the shared register, so a bench cannot be sited on a
      // shrub, a tree or another bench. `_buildTopology` builds it and seeds it with the
      // trees and the planting; this method runs after it, and the street kit after this.
      const SITES = this._reserveSites ?? Board._reserveOccupancy(LAY);
      // 1.05 is the bench's circumscribed radius (it is 1.98 long); 0.46 is its half-depth
      // and is what planting is tested against, so a seat may back onto a border.
      const seat = (bx, bz, rot, pad = 1.3) => {
        const site = SITES.claimNear(bx, bz, 1.05, 'bench', pad, null, 0.46);
        if (!site) return;
        // The authored bench sits on a 1.98×.68m pad; shade that support,
        // not the wider collision-clearance circle used for placement.
        this._reserveGroundContacts?.push({ x: site.x, z: site.z, hx: .99, hz: .34, yaw: rot * DEG });
        this._reserveWearSites?.push({ kind: 'bench-front', x: site.x, z: site.z, yaw: rot * DEG });
        pushBench(site.x, site.z, rot);
      };
      const table = (bx, bz, rot) => {
        const site = SITES.claimNear(bx, bz, 1.35, 'picnic', 1.9, null, 0.95);
        if (!site) return;
        pushPicnic(site.x, site.z, rot);
      };
      // ── What the furniture is for ────────────────────────────────────────────────
      // r2b sited thirty benches: eight on the apron ring, twenty-four along the four
      // carriageway verges and eight on the promenade. The carriageway row is the one
      // that made the reserve read as a scatter field — it puts a bench every 3.4 m down
      // the middle of all four lawn quadrants, so no quadrant has a piece of open grass
      // wider than a bench, and every one of the four looks the same as the other three.
      //
      // The three places a person actually stops in a promenade garden are the bandstand
      // apron, the walk, and the picnic lawn. Seating lives on those three lines and the
      // lawn between them stays empty, which is what makes a lawn read as a lawn.
      //
      // Bench ring around the rotunda, outside the apron kerb and the planting collar.
      // Pushed 10.4 -> 11.0 so the seat clears the collar's outer masses rather than
      // standing 0.2 m inside them.
      //
      // Swept at 22.5 deg over the whole circle rather than authored at eight fixed
      // bearings. The pond and the playground each reach to within 4.3 m of the centre, so
      // a fixed eight-bearing ring puts half its benches on water or softfall — measured:
      // four of r2b's eight apron seats were rejected by the plan and the ring came out
      // lopsided. Sweeping lets the arc that exists carry an even rhythm and the arc that
      // does not carry none.
      for (let step = 0; step < 16; step += 1) {
        const angle = step * 22.5;
        const a = angle * DEG;
        const bx = x + Math.sin(a) * 11.0;
        const bz = z + Math.cos(a) * 11.0;
        seat(bx, bz, (Math.atan2(x - bx, z - bz) * 180) / Math.PI);
      }
      // Circuit-side benches, facing the promenade: the route the r2 plan actually closes.
      for (const s of [-1, 1]) {
        // 8.4 / 13.6 put a seat 1.68 m from the reserve trees at (+-12, +-21), inside the
        // tree pit. 7.6 / 15.8 straddles the tree instead of leaning on it.
        for (const along of [7.6, 15.8]) {
          seat(x + along * s, z + s * (LAY.LOOP + 2.9), s > 0 ? 180 : 0);
          seat(x + s * (LAY.LOOP + 2.9), z - along * s, s > 0 ? -90 : 90);
        }
      }
      // Picnic tables in ONE quadrant — the picnic lawn `_buildTopology` set aside, which
      // is also the quadrant that gives up its corner bed. r2b spread eight candidates
      // over all four quadrants and built three of them in three different corners, which
      // reads as leftovers rather than as a place to eat. Four tables in a loose group
      // read as a picnic lawn, and the other quadrants keep their grass.
      {
        const [qx, qz] = this._reservePicnicQuad ?? [1, 1];
        for (const [dx, dz, rot] of [
          [10.4, 12.9, 18], [13.8, 9.9, -24], [9.6, 8.8, 62], [14.4, 14.2, 4],
        ]) {
          table(x + qx * dx, z + qz * dz, rot * qx * qz);
        }
      }
    }

    if (!benches.length && !picnics.length) return;

    // R20bc/R20w finding, applied here: `painted_metal` washes blue-teal under board light,
    // so cast furniture ironwork is authored on the concrete family. The old frames were
    // literally `#1e6fbf`, which is why every bench and lamp on the reserve plate is blue.
    const castIron = this.materials.get('concrete', {
      variant: 'park-furniture-cast-green-r32',
      color: '#27503b',
      roughness: 0.66,
      metalness: 0.10,
    });
    const padStone = this.materials.get('concrete', {
      variant: 'park-furniture-pad-r31',
      color: '#8b8578',
      roughness: 0.93,
    });
    // Second value on the ironwork. r1's end frame was one flat dark green, which is why
    // ten separate members merged into what the critic read as a solid board.
    const castLit = this.materials.get('concrete', {
      variant: 'park-furniture-cast-lit-r32',
      color: '#3f6a55',
      roughness: 0.62,
      metalness: 0.08,
    });
    /** A raked member. `_kitBox` only yaws, and a bench scroll has to lean. */
    const RB = (material, w, h, d, px, py, pz, rotXDeg) => {
      const geometry = new THREE.BoxGeometry(w, h, d);
      geometry.rotateX(rotXDeg * DEG);
      geometry.translate(px, py, pz);
      return { geometry, material };
    };
    // Two timber tones. V331 §2c grades an identical asset repeated in a visible row as a
    // street-read fault, and the reserve shows sixteen benches at once.
    // r2a's slats measured (205, 125, 115) at hero distance — a salmon pink, because the
    // timber albedo carries far more blue than a park hardwood does and the tint was not
    // pulling it down. Both tones drop their blue by half so the bench reads as the warm
    // brown the reference bench is.
    const benchTimbers = [
      this.materials.get('timber', { variant: 'park-furniture-timber-a-r132', color: '#8c6a48' }),
      this.materials.get('timber', { variant: 'park-furniture-timber-b-r132', color: '#7d6040' }),
    ];

    // A square-ended board keeps the long side edge too sharp and thick at park
    // distance. A small real chamfer softens that edge without adding a trim strip.
    const easedBoard = (material, w, h, d, px, py, pz) => {
      const e = Math.min(0.009, h * 0.18, d * 0.08);
      const shape = new THREE.Shape();
      shape.moveTo(-d / 2 + e, -h / 2);
      shape.lineTo(d / 2 - e, -h / 2);
      shape.lineTo(d / 2, -h / 2 + e);
      shape.lineTo(d / 2, h / 2 - e);
      shape.lineTo(d / 2 - e, h / 2);
      shape.lineTo(-d / 2 + e, h / 2);
      shape.lineTo(-d / 2, h / 2 - e);
      shape.lineTo(-d / 2, -h / 2 + e);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: w, steps: 1, bevelEnabled: false, curveSegments: 1,
      });
      geometry.rotateY(Math.PI / 2);
      geometry.translate(px - w / 2, py, pz);
      return { geometry, material };
    };

    /** Four slender seat boards meet the same two supports as the three back boards. */
    const buildBenchParts = (timber) => {
      const B = Board._kitBox;
      const parts = [B(padStone, 1.98, 0.06, 0.68, 0, 0.03, 0.02)];
      // 30 mm open joints; seat top .470 and accepted sitting level retained.
      for (const dz of [-0.225, -0.075, 0.075, 0.225]) {
        parts.push(easedBoard(timber, 1.72, 0.050, 0.120, 0, 0.445, dz));
      }
      // The back's upper board still ends at 1.119 m; the iron back stay is
      // directly behind every board, rather than a separate perimeter cap.
      for (const [dy, dz] of [[0.70, -0.245], [0.885, -0.262], [1.07, -0.279]]) {
        parts.push(easedBoard(timber, 1.68, 0.085, 0.082, 0, dy, dz));
      }
      for (const lx of [-0.80, 0.80]) {
        // Feet touch the retained stone pad and both legs join the seat bearer.
        parts.push(B(castIron, 0.12, 0.06, 0.64, lx, 0.055, 0.02));
        parts.push(B(castIron, 0.080, 0.36, 0.080, lx, 0.24, 0.255));
        parts.push(B(castIron, 0.080, 0.36, 0.080, lx, 0.24, -0.215));
        parts.push(B(castIron, 0.105, 0.068, 0.60, lx, 0.395, 0.01));
        // The back stay connects to that bearer and contacts all three planks.
        parts.push(B(castIron, 0.070, 0.78, 0.070, lx, 0.805, -0.282));
        parts.push(B(castLit, 0.068, 0.052, 0.45, lx, 0.705, -0.015));
        parts.push(RB(castLit, 0.058, 0.39, 0.065, lx, 0.54, 0.155, -25));
      }
      return parts;
    };

    /** Two trestles carry the joined top and the two open-sided seat runs. */
    const buildPicnicParts = (timber) => {
      const B = Board._kitBox;
      const parts = [B(padStone, 2.18, 0.06, 1.82, 0, 0.03, 0)];
      // Accepted tabletop top .835 m; 30 mm open joints along its full run.
      for (const dz of [-0.40, -0.135, 0.135, 0.40]) {
        parts.push(easedBoard(timber, 1.94, 0.050, 0.235, 0, 0.810, dz));
      }
      for (const side of [-1, 1]) for (const shift of [-0.09, 0.09]) {
        parts.push(easedBoard(timber, 1.92, 0.055, 0.155, 0, 0.475, side * 0.76 + shift));
      }
      for (const lx of [-0.74, 0.74]) {
        // Four original foot centres, with two continuous transverse bearers:
        // top boards at .785 underside, seat boards at .4475 underside.
        parts.push(B(castIron, 0.13, 0.06, 1.84, lx, 0.055, 0));
        for (const lz of [-0.44, 0.44]) {
          parts.push(B(castIron, 0.085, 0.70, 0.085, lx, 0.41, lz));
          parts.push(RB(castIron, 0.065, 0.35, 0.070, lx, 0.45, lz * 1.35, lz > 0 ? -30 : 30));
        }
        parts.push(B(castIron, 0.100, 0.075, 1.02, lx, 0.750, 0));
        parts.push(B(castIron, 0.100, 0.080, 1.78, lx, 0.410, 0));
      }
      return parts;
    };

    const benchVariants = benchTimbers.map((timber) => {
      const rawParts = buildBenchParts(timber);
      return {
        raw: { parts: rawParts, size: new THREE.Vector3(1.98, 1.22, 0.70) },
        model: {
          parts: Board._mergeKitParts(rawParts),
          size: new THREE.Vector3(1.98, 1.22, 0.70),
          source: 'procedural-park-bench-r31',
        },
      };
    });
    const picnicVariants = benchTimbers.map((timber) => {
      const rawParts = buildPicnicParts(timber);
      return {
        raw: { parts: rawParts, size: new THREE.Vector3(2.18, 0.90, 1.82) },
        model: {
          parts: Board._mergeKitParts(rawParts),
          size: new THREE.Vector3(2.18, 0.90, 1.82),
          source: 'procedural-picnic-table-r31',
        },
      };
    });

    /** Deterministic split of a placement list across variants — hash only, no clock. */
    const variantOf = (basePlacement, salt) => {
      const key = `${salt}:${basePlacement.position.x.toFixed(2)}:${basePlacement.position.z.toFixed(2)}`;
      let h = 0x811c9dc5;
      for (let i = 0; i < key.length; i += 1) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return (h >>> 9) % 2;
    };

    const emitFurniture = (placements, variants, salt, groupName, modelId, reserveKeyPrefix, parkKeyPrefix) => {
      if (!placements.length) return;
      const split = variants.map(() => []);
      placements.forEach((p) => split[variantOf(p, salt)].push(p));
      split.forEach((list, variantIndex) => {
        if (!list.length) return;
        const { group, meshes } = buildInstanced(variants[variantIndex].model, list, {
          castShadow: true,
          receiveShadow: true,
        });
        group.name = `${groupName}:v${variantIndex}`;
        this.root.add(group);
        this.stats.instances += list.length;
        list.forEach((basePlacement, index) => {
          const onReserve = this.city.reserve && Math.hypot(
            basePlacement.position.x - this.city.reserve.centre.x,
            basePlacement.position.z - this.city.reserve.centre.z,
          ) < 28;
          this._registerStaticMischiefTarget({
            key: `${onReserve ? reserveKeyPrefix : parkKeyPrefix}:${variantIndex}-${index}:${basePlacement.position.x.toFixed(1)}:${basePlacement.position.z.toFixed(1)}`,
            kind: 'prop',
            modelId,
            // Fine-grained part list so the damaged state stages as slats, frame and
            // rail rather than as one merged block.
            model: variants[variantIndex].raw,
            meshes,
            index,
            basePlacement,
          });
        });
      });
    };

    emitFurniture(benches, benchVariants, 'bench', 'park:benches', 'park-blackwood-bench',
      'prop:reserve-bench', 'prop:park-bench');
    emitFurniture(picnics, picnicVariants, 'picnic', 'park:picnic-tables', 'park-picnic-table',
      'prop:reserve-picnic', 'prop:park-picnic');

    // Extra reserve street kit: bins + bike hoops (mischief targets around rotunda).
    if (this.city.reserve) {
      this._buildReserveStreetKit();
    }
  }

  /**
   * Extra central-reserve props (bins, bike hoops, fountain) — all pickable mischief.
   * Gift purchases add more via {@link syncReserveKit}.
   */
  _buildReserveStreetKit() {
    const reserve = this.city.reserve;
    if (!reserve) return;
    const { x, z } = reserve.centre;
    const B = Board._kitBox;
    const C = Board._kitCyl;
    const M = Board._kitBlob;
    // Deterministic per-instance variation for the kit. Hash only — no clock, no PRNG.
    const kitUnit = (index, salt) => {
      const key = `reserve-kit:${this.city.seed ?? 0}:${salt}:${index}`;
      let h = 0x811c9dc5;
      for (let i = 0; i < key.length; i += 1) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      h ^= h >>> 15;
      return (h >>> 0) / 0x100000000;
    };

    // V3.31 r2b. `_buildParkFurniture` tests its benches and picnic tables against the
    // reserve plan, and this builder did not, so an audit of the live scene still found a
    // litter bin in the middle of the pond, a second bin and a path lamp standing on the
    // playground softfall, and a planted tub floating on the water — the defect the
    // dimension critic said capped the subject on its own.
    //
    // V3.70 — r2b's answer to a fouled position was to walk it, and that is the fault the
    // owner reported. `standOn` marched a fouled prop OUTWARD along its own radius in
    // 0.55 m steps for up to 14.3 m until `LAY.clear` passed, and `LAY.clear` can only see
    // lawn, paving, pond and softfall. Measured on the r1 before-state: all eight path
    // lamps failed the promenade test by 0.02 m, every one walked 4.95 m, and four came to
    // rest 0.413 m from a bench; three planters walked 6.0–6.6 m and one bin walked 8.25 m
    // to within 0.186 m of one of them. The walker did not fix a placement fault, it
    // converted one into ten.
    //
    // Placement now goes through the shared register, which knows where the trees, the
    // planting and the seating already are, and offers at most 1.65 m of local give. The
    // authored ring positions below have been re-sited so they do not need it.
    const LAY = Board.reserveLayout(reserve);
    const SITES = this._reserveSites ?? Board._reserveOccupancy(LAY);
    /**
     * Place a ring of props on ground that exists and that nothing else is standing on.
     * @param {Array<{x: number, z: number, rot: number, scale?: object}>} specs
     * @param {number} pad plan clearance
     * @param {number} keepOut register disc radius for this prop
     * @param {string} what tag recorded on the register
     * @param {number} softR half-depth radius used against planting (see `free`)
     */
    const onGround = (specs, pad, keepOut, what, softR = keepOut) => specs
      .map((spec) => {
        const site = SITES.claimNear(spec.x, spec.z, keepOut, what, pad, null, softR);
        return site ? placement(site.x, 0, site.z, spec.rot, spec.scale) : null;
      })
      .filter(Boolean);

    // R20bc/R20w: `painted_metal` washes blue-teal under board light, so the municipal
    // ironwork family here is `concrete`. The previous kit metal was literally `#1e6fbf`,
    // which is why every lamp post, bin band and bike hoop on the reserve plate is blue.
    const castIron = this.materials.get('concrete', {
      variant: 'reserve-kit-cast-green-r32', color: '#27503b', roughness: 0.66, metalness: 0.10,
    });
    // Directed wear: paint chalks on the sun side of municipal green, so the upper third
    // of a post and the shoulder of a bin sit a value lighter than the body.
    const castChalk = this.materials.get('concrete', {
      variant: 'reserve-kit-cast-chalk-r31', color: '#3d6151', roughness: 0.80, metalness: 0.04,
    });
    // The limestone set is an ashlar block pattern. On a fountain bowl it wrapped a
    // running-bond grid across the top face — the "criss-cross lattice stamped on the
    // bowl" the critic found, still there on the r2a base plate at hero distance. Cast
    // stonework in this kit is a single moulded piece, so it takes the render set.
    const kitStone = this.materials.get('render', {
      variant: 'reserve-kit-cast-stone-r32', color: '#cdc4ae', roughness: 0.9,
    });
    // V3.70 §2.10. Measured on the r1 before-state: green owned 52.3 % of the reserve's
    // footprint, and the palette put ONE bottle green on the dome, the balustrade, the
    // spandrel brackets, the bench frames, the bin bands, the lamp standards, the bike
    // hoops and the path-mouth bollards at once. That is the fault §2.10 names by example
    // ("navy on roof, windows, door, fence and railing at once"), transposed to green.
    //
    // A park lawn is allowed to be green — the fault is the METALWORK agreeing with it.
    // The split is the one Melbourne actually uses: bottle-green seating, tubs and bins,
    // and BLACK cast iron for the lamp standards, the hoops and the bollards. Charcoal
    // rather than true black, with a lighter companion, so a standard keeps two values
    // down its height and does not crush at the dark end (§5.3 luma).
    const standardIron = this.materials.get('concrete', {
      variant: 'reserve-kit-cast-black-r370', color: '#2c3034', roughness: 0.58, metalness: 0.16,
    });
    const standardIronLit = this.materials.get('concrete', {
      variant: 'reserve-kit-cast-black-lit-r370', color: '#4b5258', roughness: 0.52, metalness: 0.12,
    });
    // V3.70 §2.10. Measured on the r1 before-state: green owned 52.3 % of the reserve's
    // footprint, and the palette put ONE bottle green on the dome, the balustrade, the
    // spandrel brackets, the bench frames, the bin bands, the lamp standards, the bike
    // hoops and the path-mouth bollards at once. That is the fault §2.10 names by example
    // ("navy on roof, windows, door, fence and railing at once"), transposed to green.
    //
    // A park lawn is allowed to be green — the fault is the METALWORK agreeing with it.
    // The split is the one Melbourne actually uses: bottle-green seating, tubs and bins,
    // and BLACK cast iron for the lamp standards, the hoops and the bollards. Charcoal
    // rather than true black, with a lighter companion, so a standard keeps two values
    // down its height and does not crush at the dark end (§5.3 luma).
    const timberBoard = this.materials.get('timber', {
      variant: 'reserve-planter-board-r31', color: '#8c6a48', roughness: 0.80,
    });
    const timberFrame = this.materials.get('timber', {
      variant: 'reserve-planter-frame-r31', color: '#6b4e34', roughness: 0.84,
    });
    const potSoil = this.materials.get('sand', {
      variant: 'reserve-planter-soil-r31', color: '#4a3625', roughness: 0.97,
    });
    const lampGlow = this.materials.get('painted_metal', {
      variant: 'reserve-path-lamp-glow-r31', color: '#fff0c4', roughness: 0.16, metalness: 0.06,
    });
    if (lampGlow.emissive) {
      // These plates are shot at midday. A pane emitting at 1.05 was the highest-value
      // object in its neighbourhood on a daylit plate, which §2.3 fails by name; the lamp
      // reads as glazed rather than as a lit lantern at this hour.
      lampGlow.emissive.set('#ffd98a');
      lampGlow.emissiveIntensity = 0.30;
    }

    /** Merge a raw part list and keep the fine-grained one for the mischief voxel kit. */
    const kit = (rawParts, size, source) => ({
      raw: { parts: rawParts, size },
      model: { parts: Board._mergeKitParts(rawParts), size, source },
    });

    /** Register every placement of an instanced kit as its own mischief target. */
    const emitKit = (entry, placements, groupName, modelId, keyFor) => {
      if (!placements.length) return;
      const { group, meshes } = buildInstanced(entry.model, placements, {
        castShadow: true, receiveShadow: true,
      });
      group.name = groupName;
      this.root.add(group);
      this.stats.instances += placements.length;
      placements.forEach((basePlacement, index) => {
        this._registerStaticMischiefTarget({
          key: keyFor(index, basePlacement),
          kind: 'prop',
          modelId,
          // The unmerged list, so the damaged state stages as the object's own members.
          model: entry.raw,
          meshes,
          index,
          basePlacement,
        });
      });
    };

    // ── Litter bin ────────────────────────────────────────────────────────────────
    // Ribbed municipal drum on a stone foot, with a rim band, a domed lid and a knob.
    // It used to be two smooth cylinders and half a sphere with no lid detail at all.
    // r2a authored ten ribs at radius 0.285 on a drum whose own radius runs 0.27 to 0.31,
    // so the ribs sat flush with the drum wall or inside it, in the drum's own colour — the
    // same mistake the dome ribs made at r1, and the reason the critic still read a smooth
    // capsule at hero distance. The staves stand 0.05 proud now and alternate with the
    // chalked tone, so the drum is a rhythm of light and dark verticals.
    const binParts = [];
    binParts.push(C(kitStone, 0.34, 0.37, 0.09, 0, 0.045, 0, 10));
    binParts.push(C(castIron, 0.25, 0.28, 0.78, 0, 0.46, 0, 10));
    for (let rib = 0; rib < 10; rib += 1) {
      const a = (rib / 10) * Math.PI * 2;
      binParts.push(B(rib % 2 ? castChalk : castIron, 0.075, 0.70, 0.075,
        Math.sin(a) * 0.285, 0.46, Math.cos(a) * 0.285,
        (a * 180) / Math.PI));
    }
    binParts.push(C(castChalk, 0.305, 0.30, 0.17, 0, 0.76, 0, 10)); // chalked shoulder
    binParts.push(C(castIron, 0.325, 0.325, 0.085, 0, 0.90, 0, 10)); // rim band
    binParts.push(C(castIron, 0.245, 0.245, 0.055, 0, 0.955, 0, 8)); // liner lip
    binParts.push(Board._kitCap(castIron, 0.30, 0.19, 0.30, 0, 0.96, 0, 10, 4));
    binParts.push(C(castIron, 0.05, 0.07, 0.10, 0, 1.19, 0, 6)); // lid knob
    binParts.push(B(castIron, 0.22, 0.05, 0.05, 0, 0.90, 0.30)); // aperture surround
    binParts.push(B(castIron, 0.05, 0.24, 0.05, 0.14, 0.78, 0.30));
    binParts.push(B(castIron, 0.05, 0.24, 0.05, -0.14, 0.78, 0.30));
    const binKit = kit(binParts, new THREE.Vector3(0.68, 1.24, 0.68), 'procedural-reserve-bin-r31');
    // V3.70. Bins belong where litter is made — at the four gates and beside the apron
    // seating — not on a ring through open lawn. r2b's eight sat at ±8.6 and ±12.6 in the
    // middle of all four quadrants; two of those were the ones that walked. Six now: one
    // per gate on a pinwheel so the four entrances are not four identical corners, and two
    // on the free apron diagonal. The other two diagonals fall on the pond and the
    // playground, which is why there are two and not four.
    // Scaled up a little: at board altitude the previous drum disappeared into the lawn.
    const BIN_S = { x: 1.18, y: 1.12, z: 1.18 };
    const bins = onGround([
      { x: x + 5.6, z: z + 20.4, rot: 0, scale: BIN_S },
      { x: x + 20.4, z: z - 5.6, rot: 90, scale: BIN_S },
      { x: x - 5.6, z: z - 20.4, rot: 180, scale: BIN_S },
      { x: x - 20.4, z: z + 5.6, rot: -90, scale: BIN_S },
      { x: x + 9.48, z: z + 9.48, rot: 225, scale: BIN_S },
      { x: x + 9.48, z: z - 9.48, rot: 315, scale: BIN_S },
    ], 1.0, 0.62, 'bin');
    emitKit(binKit, bins, 'park:reserve-bins', 'hoddle-grid-bin',
      (index, p) => `prop:reserve-bin:${index}:${p.position.x.toFixed(1)}`);

    // Directed litter: paper by three of the eight bins, not a dust layer on all of them.
    {
      const litterMat = this.materials.get('render', {
        variant: 'reserve-litter-r31', color: '#ddd6c4', roughness: 0.9,
      });
      const litterParts = [
        B(litterMat, 0.24, 0.03, 0.18, 0, 0.015, 0, 18),
        B(litterMat, 0.17, 0.03, 0.13, 0.42, 0.015, 0.26, -34),
        B(litterMat, 0.13, 0.05, 0.10, -0.30, 0.025, 0.34, 12),
        B(litterMat, 0.09, 0.09, 0.09, 0.16, 0.045, -0.38, 22),
      ];
      const litterKit = kit(litterParts, new THREE.Vector3(0.9, 0.1, 0.9),
        'procedural-reserve-litter-r31');
      const litterAt = [0, 4, 6]
        .map((binIndex) => bins[binIndex] && { p: bins[binIndex], binIndex })
        .filter(Boolean)
        .map(({ p, binIndex }) => placement(
          p.position.x + 0.9, 0, p.position.z + 0.75, binIndex * 47,
        ));
      const { group } = buildInstanced(litterKit.model, litterAt, {
        castShadow: false, receiveShadow: true,
      });
      group.name = 'park:reserve-litter';
      this.root.add(group);
      this.stats.instances += litterAt.length;
    }

    // ── Bike hoops ────────────────────────────────────────────────────────────────
    // Round-section tube, because that is what a hoop is: two uprights on flanged feet
    // rising into a bent crown built from short chorded segments.
    const hoopParts = [];
    const hoopR = 0.30;
    for (const lx of [-hoopR, hoopR]) {
      hoopParts.push(C(standardIron, 0.048, 0.048, 0.62, lx, 0.36, 0, 8));
      hoopParts.push(C(kitStone, 0.13, 0.15, 0.06, lx, 0.03, 0, 8));   // ground flange
      hoopParts.push(C(standardIron, 0.075, 0.095, 0.13, lx, 0.115, 0, 8)); // base collar
    }
    // Crown: seven short tubes stepped round a quarter-turn each side.
    for (let seg = 0; seg <= 6; seg += 1) {
      const t = (seg / 6) * Math.PI;
      const sx = -Math.cos(t) * hoopR;
      const sy = 0.67 + Math.sin(t) * 0.28;
      const tilt = (seg - 3) * 30;
      const mat = seg >= 2 && seg <= 4 ? standardIronLit : standardIron;
      const piece = new THREE.CylinderGeometry(0.048, 0.048, 0.20, 8, 1);
      piece.rotateZ(tilt * DEG);
      piece.translate(sx, sy, 0);
      hoopParts.push({ geometry: piece, material: mat });
    }
    {
      const rail = new THREE.CylinderGeometry(0.042, 0.042, hoopR * 2 + 0.02, 8, 1);
      rail.rotateZ(Math.PI / 2);
      rail.translate(0, 0.44, 0);
      hoopParts.push({ geometry: rail, material: standardIron }); // mid rail
    }
    const hoopKit = kit(hoopParts, new THREE.Vector3(0.78, 1.0, 0.24),
      'procedural-reserve-hoop-r31');
    // V3.70. A bike rank belongs at an entrance, in a rank, not as four singles at ±13 m
    // in open lawn where nobody arrives. Four hoops at one gate, parallel, at the pitch a
    // real rank uses, so they read as bike parking rather than as four green croquet hoops
    // dropped on the grass.
    const hoops = onGround([0, 1, 2, 3].map((i) => ({
      x: x + 20.3,
      z: z + 2.9 + i * 0.86,
      rot: 90,
    })), 0.8, 0.42, 'hoop');
    emitKit(hoopKit, hoops, 'park:reserve-hoops', 'melbourne-bike-hoop',
      (index, p) => `prop:reserve-hoop:${index}:${p.position.x.toFixed(1)}`);

    // ── Path lamp ─────────────────────────────────────────────────────────────────
    // Heritage standard: stepped base, fluted column, ladder bar, four-pane lantern
    // under a pyramid hood with a finial. The previous lamp was a plain taper with a
    // glowing ball, in the same wrong blue as the bench frames.
    const lampParts = [];
    lampParts.push(B(kitStone, 0.46, 0.09, 0.46, 0, 0.045, 0));
    lampParts.push(C(standardIron, 0.20, 0.29, 0.24, 0, 0.20, 0, 8));
    lampParts.push(C(standardIron, 0.12, 0.19, 0.13, 0, 0.37, 0, 8));
    lampParts.push(C(standardIron, 0.055, 0.10, 2.45, 0, 1.63, 0, 8));
    for (let flute = 0; flute < 6; flute += 1) {
      const a = (flute / 6) * Math.PI * 2;
      lampParts.push(B(standardIron, 0.035, 2.05, 0.035,
        Math.sin(a) * 0.078, 1.55, Math.cos(a) * 0.078));
    }
    lampParts.push(C(standardIron, 0.09, 0.09, 0.08, 0, 1.60, 0, 8)); // mid collar
    lampParts.push(C(standardIronLit, 0.062, 0.062, 0.62, 0, 2.55, 0, 8)); // chalked upper column
    lampParts.push(B(standardIron, 0.30, 0.05, 0.05, 0, 2.42, 0));    // ladder bar
    lampParts.push(B(standardIron, 0.05, 0.05, 0.30, 0, 2.42, 0));
    lampParts.push(C(standardIron, 0.21, 0.13, 0.10, 0, 2.93, 0, 4)); // lantern floor
    for (const [lx, lz] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) {
      lampParts.push(B(standardIron, 0.05, 0.44, 0.05, lx, 3.19, lz));
    }
    lampParts.push(C(lampGlow, 0.155, 0.115, 0.40, 0, 3.17, 0, 4));
    lampParts.push(Board._kitCone(standardIron, 0.26, 0.20, 0, 3.51, 0, 4));
    lampParts.push(C(standardIron, 0.05, 0.08, 0.09, 0, 3.65, 0, 6));
    lampParts.push(C(standardIron, 0.02, 0.045, 0.16, 0, 3.77, 0, 6));
    const lampKit = kit(lampParts, new THREE.Vector3(0.55, 3.9, 0.55),
      'procedural-reserve-path-lamp-r31');
    // V3.70. r2b hung eight lamps on a circle of radius 16.8, which is 0.8 m inside the
    // promenade circuit's own corridor — every one of them failed `onPaving` by 0.02 m and
    // walked 4.95 m outward into the perimeter band. A lamp standard lights a walk, so it
    // stands ON the walk: four just outside the circuit's corners and four on the outer
    // verge beside the four gate approaches, pinwheeled so the reserve does not read
    // four-fold symmetric from above.
    const LOOP_OUT = LAY.LOOP + 2.6;
    const pathLamps = onGround([
      { x: x + LOOP_OUT, z: z + LOOP_OUT, rot: 225 },
      { x: x + LOOP_OUT, z: z - LOOP_OUT, rot: 315 },
      { x: x - LOOP_OUT, z: z - LOOP_OUT, rot: 45 },
      { x: x - LOOP_OUT, z: z + LOOP_OUT, rot: 135 },
      { x: x + 6.4, z: z - 20.0, rot: 0 },
      { x: x + 20.0, z: z + 6.4, rot: 90 },
      { x: x - 6.4, z: z + 20.0, rot: 180 },
      { x: x - 20.0, z: z - 6.4, rot: 270 },
    ], 0.9, 0.55, 'lamp');
    emitKit(lampKit, pathLamps, 'park:reserve-path-lamps', 'reserve-path-lamp',
      (index) => `prop:reserve-path-lamp:${index}`);

    // ── Fountain ──────────────────────────────────────────────────────────────────
    // Kept as the tiered landmark it was, restyled: stone bowls on a pale apron with a
    // green cast stem, gadrooned rim and a damp band where the splash lands.
    const water = this.materials.get('glass', {
      variant: 'reserve-fountain-water-r31', color: '#7fd0dd', opacity: 0.62, roughness: 0.12,
    });
    // P17-W2B: only the fountain's cast stone moves V48 -> 77. Off retains the
    // exact shared material; bins, hoop flanges and lamp feet keep their existing stone.
    const fountainColour = restyleColour(kitStone.color, kitStone.color.clone().multiplyScalar(2.827746),
      { id: 'civic:reserve-fountain.stone' });
    const fountainStone = fountainColour === kitStone.color ? kitStone : this.materials.get('render', {
      variant: 'reserve-kit-cast-stone-r32', color: fountainColour, roughness: 0.9,
    });
    const fountainParts = [];
    fountainParts.push(C(fountainStone, 1.75, 1.85, 0.12, 0, 0.06, 0, 12));  // apron pad
    fountainParts.push(C(fountainStone, 1.15, 1.35, 0.35, 0, 0.24, 0, 12));
    fountainParts.push(C(castChalk, 1.02, 1.12, 0.18, 0, 0.50, 0, 12)); // damp splash band
    fountainParts.push(C(castIron, 0.85, 1.00, 0.42, 0, 0.68, 0, 12));
    fountainParts.push(C(fountainStone, 0.70, 0.65, 0.28, 0, 1.05, 0, 12));
    fountainParts.push(C(water, 0.52, 0.52, 0.08, 0, 1.12, 0, 12));
    fountainParts.push(C(fountainStone, 0.74, 0.74, 0.12, 0, 1.18, 0, 12));
    for (let gad = 0; gad < 8; gad += 1) {
      const a = (gad / 8) * Math.PI * 2;
      fountainParts.push(B(fountainStone, 0.20, 0.14, 0.12,
        Math.sin(a) * 0.72, 1.20, Math.cos(a) * 0.72, (a * 180) / Math.PI));
    }
    fountainParts.push(C(castIron, 0.14, 0.18, 0.85, 0, 1.58, 0, 8));
    fountainParts.push(C(fountainStone, 0.38, 0.42, 0.20, 0, 2.08, 0, 10));
    // r2a stood a flat opaque pale-blue cone on the upper bowl and called it a jet. Water
    // leaves a nozzle narrow and lands wide: a thin bright riser, four falls arcing off the
    // upper lip, and a disturbed ring lying in the lower bowl where they land.
    fountainParts.push(C(water, 0.035, 0.055, 0.42, 0, 2.40, 0, 6));    // riser
    fountainParts.push(Board._kitCap(water, 0.30, 0.10, 0.30, 0, 2.60, 0, 8, 3)); // crown
    for (let fall = 0; fall < 4; fall += 1) {
      const a = (fall / 4) * Math.PI * 2 + Math.PI / 4;
      fountainParts.push(C(water, 0.045, 0.075, 0.36,
        Math.sin(a) * 0.34, 2.05, Math.cos(a) * 0.34, 5));
      fountainParts.push(C(water, 0.055, 0.085, 0.30,
        Math.sin(a) * 0.50, 1.45, Math.cos(a) * 0.50, 5));
    }
    fountainParts.push(C(water, 0.60, 0.60, 0.05, 0, 1.15, 0, 12));     // disturbed ring
    const fountainKit = kit(fountainParts, new THREE.Vector3(3.7, 2.8, 3.7),
      'procedural-reserve-fountain-r31');
    // On the inner verge of the promenade, where a drinking fountain on a walk belongs,
    // rather than adrift on the lawn between the apron and the circuit.
    emitKit(fountainKit, onGround([{ x: x + 7.0, z: z + 14.2, rot: 0 }], 2.2, 2.0, 'fountain'),
      'park:reserve-fountain', 'city-drinking-fountain',
      () => 'prop:reserve-fountain:0');

    // ── Planter ───────────────────────────────────────────────────────────────────
    // Was two boxes and twelve triangles: a brown box with a green box balanced on it.
    // Built now as a real tub — corner posts carrying three board courses a side, a
    // capping rail with an overhang, bolt heads at each landing, soil sunk below the
    // rim, and a planting mass that breaks up so sky comes through its edges (V331 §2a
    // grades planting under penetration and structure). Same language as the esplanade
    // tubs in the sibling lane, because a player sees both on one board.
    const buildPlanterParts = (mix) => {
      const parts = [];
      const halfX = 0.75;
      const halfZ = 0.46;
      // Corner posts land on the ground and carry everything above them.
      for (const px2 of [-1, 1]) {
        for (const pz2 of [-1, 1]) {
          parts.push(B(timberFrame, 0.17, 0.64, 0.17, px2 * (halfX - 0.085), 0.32,
            pz2 * (halfZ - 0.085)));
        }
      }
      // Three board courses per side with a visible joint between each.
      for (const [courseY, courseH] of [[0.16, 0.15], [0.335, 0.15], [0.51, 0.15]]) {
        parts.push(B(timberBoard, halfX * 2 - 0.20, courseH, 0.075, 0, courseY, halfZ - 0.02));
        parts.push(B(timberBoard, halfX * 2 - 0.20, courseH, 0.075, 0, courseY, -(halfZ - 0.02)));
        parts.push(B(timberBoard, 0.075, courseH, halfZ * 2 - 0.20, halfX - 0.02, courseY, 0));
        parts.push(B(timberBoard, 0.075, courseH, halfZ * 2 - 0.20, -(halfX - 0.02), courseY, 0));
      }
      // Capping rail with an overhang, so the tub has a shadow line under its lip.
      parts.push(B(timberFrame, halfX * 2 + 0.14, 0.085, 0.15, 0, 0.625, halfZ + 0.01));
      parts.push(B(timberFrame, halfX * 2 + 0.14, 0.085, 0.15, 0, 0.625, -(halfZ + 0.01)));
      parts.push(B(timberFrame, 0.15, 0.085, halfZ * 2 - 0.14, halfX + 0.01, 0.625, 0));
      parts.push(B(timberFrame, 0.15, 0.085, halfZ * 2 - 0.14, -(halfX + 0.01), 0.625, 0));
      parts.push(B(timberFrame, halfX * 2 - 0.16, 0.08, halfZ * 2 - 0.16, 0, 0.09, 0)); // floor
      // Bolt heads where the boards land on the posts.
      for (const px2 of [-1, 1]) {
        for (const courseY of [0.16, 0.335, 0.51]) {
          parts.push(B(timberFrame, 0.055, 0.055, 0.055, px2 * (halfX - 0.085), courseY,
            halfZ + 0.02));
        }
      }
      // Soil sits below the rim and is uneven, so it reads as depth rather than a lid.
      parts.push(B(potSoil, halfX * 2 - 0.20, 0.13, halfZ * 2 - 0.20, 0, 0.50, 0));
      parts.push(M(potSoil, 0.30, 0.07, 0.22, -0.34, 0.55, 0.10));
      parts.push(M(potSoil, 0.24, 0.06, 0.19, 0.30, 0.55, -0.12));
      parts.push(M(potSoil, 0.19, 0.05, 0.16, 0.02, 0.55, 0.20));
      // Planting: seven overlapping masses at three radii plus three that spill over the
      // rim, so the silhouette is ragged and the timber does not win on clean edge alone.
      mix.masses.forEach(([mx, my, mz, r, tone]) => {
        parts.push(M(mix.leaf[tone], r * 1.05, r * 0.82, r * 0.95, mx, 0.58 + my, mz));
      });
      mix.spills.forEach(([sx2, sy, sz2, r]) => {
        parts.push(M(mix.leaf[0], r * 1.10, r * 0.68, r * 0.92, sx2, 0.56 + sy, sz2));
      });
      mix.blooms.forEach(([bx2, by, bz2]) => {
        parts.push(Board._kitBlob(mix.bloom, 0.075, 0.062, 0.075, bx2, 0.70 + by, bz2, 4, 2));
      });
      mix.spikes.forEach(([kx, kz, kh]) => {
        parts.push(B(mix.bloom, 0.055, kh, 0.055, kx, 0.74 + kh * 0.5, kz));
      });
      return parts;
    };

    const leafGreens = [
      this.materials.get('foliage', { variant: 'reserve-planter-leaf-a-r31', color: '#4d8f33' }),
      this.materials.get('foliage', { variant: 'reserve-planter-leaf-b-r31', color: '#2f6a2d' }),
      this.materials.get('foliage', { variant: 'reserve-planter-leaf-c-r31', color: '#6aa93e' }),
    ];
    const planterMixes = [
      {
        // Cottage mix: low mounded foliage under white and pink heads.
        leaf: leafGreens,
        bloom: this.materials.get('render', {
          variant: 'reserve-planter-bloom-pink-r31', color: '#e8709a', roughness: 0.66,
        }),
        masses: [
          [-0.44, 0.06, -0.10, 0.30, 0], [-0.14, 0.12, 0.14, 0.34, 2], [0.18, 0.08, -0.14, 0.31, 1],
          [0.48, 0.05, 0.10, 0.28, 0], [-0.30, 0.18, 0.06, 0.24, 2], [0.34, 0.17, 0.04, 0.23, 1],
          [0.02, 0.20, -0.02, 0.26, 0],
        ],
        spills: [[-0.72, -0.10, 0.22, 0.22], [0.70, -0.12, -0.20, 0.20], [0.04, -0.14, 0.46, 0.19]],
        blooms: [
          [-0.46, 0.06, -0.06], [-0.10, 0.12, 0.18], [0.22, 0.08, -0.16], [0.50, 0.04, 0.12],
          [-0.26, 0.14, 0.10], [0.36, 0.13, 0.02], [0.02, 0.16, -0.06], [-0.60, 0.00, 0.16],
          [0.62, -0.02, -0.12],
        ],
        spikes: [[-0.20, -0.06, 0.26], [0.26, 0.10, 0.22]],
      },
      {
        // Spike mix: taller, looser, hotter — orange and amber over darker foliage.
        leaf: [leafGreens[1], leafGreens[0], leafGreens[2]],
        bloom: this.materials.get('render', {
          variant: 'reserve-planter-bloom-amber-r31', color: '#ef9a34', roughness: 0.66,
        }),
        masses: [
          [-0.50, 0.04, 0.12, 0.27, 1], [-0.18, 0.14, -0.14, 0.33, 0], [0.16, 0.10, 0.16, 0.30, 2],
          [0.50, 0.06, -0.08, 0.26, 1], [-0.06, 0.22, 0.02, 0.28, 0], [0.32, 0.19, 0.10, 0.22, 2],
          [-0.34, 0.17, -0.08, 0.24, 1],
        ],
        spills: [[-0.74, -0.12, -0.18, 0.21], [0.72, -0.10, 0.20, 0.22], [-0.06, -0.14, -0.46, 0.18]],
        blooms: [
          [-0.48, 0.10, 0.14], [-0.16, 0.18, -0.10], [0.18, 0.14, 0.18], [0.48, 0.10, -0.06],
          [-0.02, 0.24, 0.04], [0.34, 0.20, 0.12], [-0.36, 0.18, -0.06], [0.58, 0.04, 0.14],
        ],
        spikes: [[-0.30, 0.10, 0.34], [0.10, -0.16, 0.30], [0.42, 0.06, 0.28]],
      },
    ];
    const planterKits = planterMixes.map((mix, i) => kit(
      buildPlanterParts(mix),
      new THREE.Vector3(1.64, 1.10, 1.06),
      `procedural-reserve-planter-r31-${i}`,
    ));
    // V3.70. r2b hung six tubs on a radius-14.4 ring in open lawn, where a planted tub has
    // nothing to do and three of the six walked 6 m looking for ground. A tub marks a
    // threshold, so they flank the four gate approaches in pairs — eight tubs that read as
    // gateposts and give the four entrances something to be. Per-instance yaw and scale
    // still come from the hash, so eight planters are not one planter eight times
    // (V331 §2c).
    const GATE = [
      [4.2, 21.0, 0], [-4.2, 21.0, 0],
      [4.2, -21.0, 180], [-4.2, -21.0, 180],
      [21.0, 4.2, 90], [21.0, -4.2, 90],
      [-21.0, 4.2, -90], [-21.0, -4.2, -90],
    ];
    const planterRing = onGround(GATE.map(([dx, dz, facing], i) => {
      const jitter = kitUnit(i, 'planter-scale');
      const s = 0.93 + jitter * 0.16;
      return {
        x: x + dx,
        z: z + dz,
        rot: facing + (kitUnit(i, 'planter-yaw') - 0.5) * 14,
        scale: { x: s, y: 0.96 + jitter * 0.12, z: s },
      };
    }), 1.3, 0.98, 'planter');
    planterKits.forEach((entry, variantIndex) => {
      const mine = planterRing.filter((_, i) => i % 2 === variantIndex);
      if (!mine.length) return;
      const { group, meshes } = buildInstanced(entry.model, mine, {
        castShadow: true, receiveShadow: true,
      });
      group.name = `park:reserve-planters:v${variantIndex}`;
      this.root.add(group);
      this.stats.instances += mine.length;
      mine.forEach((basePlacement, index) => {
        this._registerStaticMischiefTarget({
          // The mischief registration moves with the geometry: this key set replaces the
          // old `prop:reserve-planter:<i>` and points at the rebuilt model and its meshes.
          key: `prop:reserve-planter:${variantIndex}-${index}`,
          kind: 'prop',
          modelId: 'reserve-planter-box',
          // Unmerged parts, so a knocked tub sheds boards, posts, soil clods and planting
          // as themselves rather than staging as one generic block.
          model: entry.raw,
          meshes,
          index,
          basePlacement,
        });
      });
    });

    this._reserveGiftRoot = new THREE.Group();
    this._reserveGiftRoot.name = 'park:reserve-gifts';
    this.root.add(this._reserveGiftRoot);
  }

  /**
   * Spawn gifted furniture / terrain on the central reserve lawn (visible, lit).
   * Always recreates from state so a gift after purchase is immediate on the board.
   */
  syncReserveKit(state) {
    const reserve = this.city.reserve;
    if (!reserve) return;
    if (!this._reserveGiftRoot) {
      this._reserveGiftRoot = new THREE.Group();
      this._reserveGiftRoot.name = 'park:reserve-gifts';
      this.root.add(this._reserveGiftRoot);
    }
    // Clear previous gift meshes (geometries are unique per gift).
    while (this._reserveGiftRoot.children.length) {
      const child = this._reserveGiftRoot.children[0];
      this._reserveGiftRoot.remove(child);
      child.traverse?.((obj) => {
        if (obj.geometry) obj.geometry.dispose?.();
      });
    }

    const kit = state?.reserveKit ?? { furniture: {}, terrain: {} };
    const { x, z } = reserve.centre;
    const timber = this.materials.get('timber', {
      variant: 'reserve-gift-timber', color: '#8a6238', roughness: 0.78, metalness: 0.04,
    });
    const metal = this.materials.get('painted_metal', {
      variant: 'reserve-gift-metal', color: '#4a4540', roughness: 0.48, metalness: 0.42,
    });
    const turf = this.materials.get('painted_metal', {
      variant: 'reserve-gift-turf', color: '#2f6b34', roughness: 0.94, metalness: 0.02,
    });
    const flower = this.materials.get('painted_metal', {
      variant: 'reserve-gift-flower', color: '#6a8f3a', roughness: 0.9, metalness: 0.02,
    });

    const addMesh = (geom, mat, px, py, pz, rotY, name) => {
      MaterialLibrary.ensureUv2(geom);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(px, py, pz);
      mesh.rotation.y = rotY;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = name;
      this._reserveGiftRoot.add(mesh);
      return mesh;
    };

    /** Build a readable multi-part gift at lawn height. */
    const placeGift = (kind, id, index, slot) => {
      // Ring around rotunda on the grass (outside columns ~4.4, inside path ~14).
      const ang = slot * 0.55 + index * 0.22;
      const r = 10.2 + (slot % 5) * 0.85 + (index % 3) * 0.35;
      const px = x + Math.sin(ang) * r;
      const pz = z + Math.cos(ang) * r;
      const rot = ang + Math.PI;
      const lawnY = 0.32; // above reserve lawn flats

      if (kind === 'terrain') {
        // Raised garden/turf pad — clearly changes the park look.
        const pad = new THREE.BoxGeometry(
          id.includes('pond') ? 3.2 : 2.4,
          0.18,
          id.includes('softfall') ? 2.8 : 2.2,
        );
        pad.translate(0, 0.09, 0);
        addMesh(pad, id.includes('softfall') ? metal : (id.includes('garden') ? flower : turf),
          px, lawnY, pz, rot, `reserve-gift:${id}:${index}`);
        if (id.includes('tree')) {
          const trunk = new THREE.CylinderGeometry(0.12, 0.16, 1.8, 8);
          trunk.translate(0, 0.9, 0);
          addMesh(trunk, timber, px, lawnY, pz, rot, `reserve-gift:${id}:trunk:${index}`);
          const canopy = new THREE.SphereGeometry(0.85, 10, 8);
          canopy.translate(0, 2.1, 0);
          addMesh(canopy, flower, px, lawnY, pz, rot, `reserve-gift:${id}:canopy:${index}`);
        }
        return;
      }

      // Furniture gifts — multi-part so they read as seats / bins / lights.
      if (id.includes('bench') || id === 'blackwood-bench') {
        const seat = new THREE.BoxGeometry(1.65, 0.12, 0.5);
        seat.translate(0, 0.42, 0);
        const back = new THREE.BoxGeometry(1.65, 0.4, 0.1);
        back.translate(0, 0.68, -0.18);
        addMesh(seat, timber, px, lawnY, pz, rot, `reserve-gift:${id}:seat:${index}`);
        addMesh(back, timber, px, lawnY, pz, rot, `reserve-gift:${id}:back:${index}`);
        for (const lx of [-0.65, 0.65]) {
          const leg = new THREE.BoxGeometry(0.1, 0.4, 0.4);
          leg.translate(lx, 0.2, 0);
          addMesh(leg, metal, px, lawnY, pz, rot, `reserve-gift:${id}:leg:${index}:${lx}`);
        }
      } else if (id.includes('picnic')) {
        const top = new THREE.BoxGeometry(1.85, 0.1, 1.05);
        top.translate(0, 0.78, 0);
        addMesh(top, timber, px, lawnY, pz, rot, `reserve-gift:${id}:top:${index}`);
        for (const lz of [-0.72, 0.72]) {
          const side = new THREE.BoxGeometry(1.85, 0.09, 0.3);
          side.translate(0, 0.48, lz);
          addMesh(side, timber, px, lawnY, pz, rot, `reserve-gift:${id}:side:${index}:${lz}`);
        }
      } else if (id.includes('bin') || id.includes('hoddle')) {
        const body = new THREE.CylinderGeometry(0.28, 0.32, 0.9, 10);
        body.translate(0, 0.45, 0);
        addMesh(body, metal, px, lawnY, pz, rot, `reserve-gift:${id}:${index}`);
      } else if (id.includes('bike') || id.includes('hoop')) {
        for (const lx of [-0.28, 0.28]) {
          const leg = new THREE.BoxGeometry(0.08, 0.85, 0.08);
          leg.translate(lx, 0.42, 0);
          addMesh(leg, metal, px, lawnY, pz, rot, `reserve-gift:${id}:leg:${index}:${lx}`);
        }
        const top = new THREE.BoxGeometry(0.64, 0.08, 0.08);
        top.translate(0, 0.85, 0);
        addMesh(top, metal, px, lawnY, pz, rot, `reserve-gift:${id}:top:${index}`);
      } else if (id.includes('fountain') || id.includes('drinking')) {
        const base = new THREE.CylinderGeometry(0.5, 0.62, 0.3, 10);
        base.translate(0, 0.15, 0);
        const bowl = new THREE.CylinderGeometry(0.4, 0.36, 0.22, 10);
        bowl.translate(0, 0.42, 0);
        addMesh(base, metal, px, lawnY, pz, rot, `reserve-gift:${id}:base:${index}`);
        addMesh(bowl, timber, px, lawnY, pz, rot, `reserve-gift:${id}:bowl:${index}`);
      } else if (id.includes('light') || id.includes('path')) {
        const pole = new THREE.CylinderGeometry(0.06, 0.08, 1.4, 8);
        pole.translate(0, 0.7, 0);
        const lamp = new THREE.BoxGeometry(0.22, 0.18, 0.22);
        lamp.translate(0, 1.45, 0);
        addMesh(pole, metal, px, lawnY, pz, rot, `reserve-gift:${id}:pole:${index}`);
        addMesh(lamp, timber, px, lawnY, pz, rot, `reserve-gift:${id}:lamp:${index}`);
      } else {
        const box = new THREE.BoxGeometry(0.9, 0.7, 0.7);
        box.translate(0, 0.35, 0);
        addMesh(box, timber, px, lawnY, pz, rot, `reserve-gift:${id}:${index}`);
      }
    };

    let slot = 0;
    for (const [id, count] of Object.entries(kit.furniture ?? {})) {
      const n = Math.min(12, count | 0);
      for (let i = 0; i < n; i += 1) {
        placeGift('furniture', id, i, slot);
        slot += 1;
      }
    }
    for (const [id, count] of Object.entries(kit.terrain ?? {})) {
      const n = Math.min(12, count | 0);
      for (let i = 0; i < n; i += 1) {
        placeGift('terrain', id, i, slot);
        slot += 1;
      }
    }
  }

  _buildWaterfront() {
    const edge = this.city.waterEdge;
    if (!edge) return;
    const { extent } = this.city;
    // Flat fallback water (hidden by WaterSurface once nature layer mounts).
    const waterMaterial = this.materials.get('water');
    const waterGeometry = new THREE.PlaneGeometry(
      edge === 'north' || edge === 'south' ? extent.x : 400,
      edge === 'north' || edge === 'south' ? 400 : extent.z,
    );
    waterGeometry.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    if (edge === 'north') water.position.set(extent.x / 2, -0.4, -200);
    if (edge === 'south') water.position.set(extent.x / 2, -0.4, extent.z + 200);
    if (edge === 'west') water.position.set(-200, -0.4, extent.z / 2);
    if (edge === 'east') water.position.set(extent.x + 200, -0.4, extent.z / 2);
    water.receiveShadow = false;
    water.name = `water:${edge}`;
    this.root.add(water);

    this._buildEsplanade(edge, extent);
    this._buildWaterfrontStructures(edge, extent);
    // Land-edge rock walls are replaced by FringeLayer (hills / Yarra / expansion).
    // `_buildFringeRockBorders` stays in this file but is not called.
  }

  /**
   * Rock wall border on the three non-beach board edges.
   * Beach (waterEdge) keeps sand/esplanade only — armour lives on land fringes.
   */
  _buildFringeRockBorders(waterEdge, extent) {
    const edges = ['north', 'south', 'east', 'west'].filter((e) => e !== waterEdge);
    const rockMat = this.materials.get('concrete', {
      variant: 'fringe-rock-wall-r20z',
      color: '#4a4e52',
      roughness: 0.96,
      metalness: 0.02,
    });
    const group = new THREE.Group();
    group.name = 'fringe:rock-borders';
    const rockGeom = new THREE.DodecahedronGeometry(0.85, 0);
    MaterialLibrary.ensureUv2(rockGeom);
    const bedGeom = new THREE.BoxGeometry(1, 1, 1);
    MaterialLibrary.ensureUv2(bedGeom);

    for (const edge of edges) {
      const { seaward, along, alongX } = edgeAxes(edge);
      const L = alongLength(edge, extent);
      const wallPos = wallCentre(edge, extent);
      // Continuous low bed just outside board fringe.
      const bedW = 3.2;
      const bedH = 0.55;
      const bed = new THREE.Mesh(bedGeom, rockMat);
      bed.scale.set(alongX ? L - 1.2 : bedW, bedH, alongX ? bedW : L - 1.2);
      bed.position.copy(wallPos).addScaledVector(seaward, 0.4);
      bed.position.y = bedH * 0.4;
      bed.name = `fringe:rock-bed:${edge}`;
      bed.castShadow = true;
      bed.receiveShadow = true;
      group.add(bed);

      // Interlocked rock courses as a border wall (not beach toe armour).
      const pitch = 1.05;
      const stations = Math.max(4, Math.ceil((L - 2) / pitch) + 1);
      const courses = 3;
      const n = stations * courses;
      const rocks = new THREE.InstancedMesh(rockGeom, rockMat, n);
      rocks.name = `fringe:rock-wall:${edge}`;
      rocks.castShadow = true;
      rocks.receiveShadow = true;
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const eul = new THREE.Euler();
      const scl = new THREE.Vector3();
      for (let i = 0; i < n; i += 1) {
        const row = Math.floor(i / stations);
        const station = i % stations;
        const t = (station / Math.max(1, stations - 1) - 0.5) * (L - 2.0)
          + (row % 2 ? pitch * 0.4 : 0);
        p.copy(wallPos)
          .addScaledVector(along, t)
          .addScaledVector(seaward, 0.15 + row * 0.55 + ((i * 7) % 5) * 0.04);
        p.y = 0.35 + row * 0.55 + ((i * 3) % 4) * 0.06;
        eul.set(
          ((i * 11) % 7) * 0.15,
          ((i * 13) % 11) * 0.4,
          ((i * 5) % 6) * 0.1,
        );
        q.setFromEuler(eul);
        const sc = 0.75 + ((i * 17 + row * 3) % 7) * 0.1;
        scl.set(sc * 1.1, sc * 0.75, sc * 0.95);
        m.compose(p, q, scl);
        rocks.setMatrixAt(i, m);
        const rv = 0.32 + ((i * 23 + row * 7) % 9) * 0.05;
        rocks.setColorAt(i, new THREE.Color().setRGB(rv * 0.85, rv * 0.9, rv * 0.92));
      }
      rocks.instanceMatrix.needsUpdate = true;
      if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
      group.add(rocks);
      this.stats.instances += n;
    }
    this.root.add(group);
  }

  /**
   * AAA esplanade outside the board fringe: wall + cope, elevated planked deck on piles,
   * seaward rail, honest stairs to sand, dune berm. Rock armour lives on the other three
   * fringes (`_buildFringeRockBorders`) — not on the beach.
   */
  _buildEsplanade(edge, extent) {
    const { seaward, along, alongX } = edgeAxes(edge);
    const L = alongLength(edge, extent);
    const wallPos = wallCentre(edge, extent);
    const walkPos = boardwalkCentre(edge, extent);
    const group = new THREE.Group();
    group.name = `esplanade:${edge}`;

    const concrete = this.materials.get('concrete', { variant: 'seawall-r20b', color: '#6a7076' });
    const copeMat = this.materials.get('concrete', { variant: 'seawall-cope-r20b', color: '#91979d' });
    const timber = this.materials.get('timber', { variant: 'boardwalk-r20b', color: '#8a6f4e' });
    const timberDark = this.materials.get('timber', { variant: 'boardwalk-rail-r20b', color: '#5c4a36' });
    // Rock armour removed from beach — see `_buildFringeRockBorders` on land edges.
    const sandMat = this.materials.get('sand', { variant: 'berm-r20b', color: '#d8b882' });

    // Deck sits near wall top so the promenade reads as wall-top esplanade, not a ground slab.
    const deckTopY = SHORE.wallH - 0.08;
    const deckY = deckTopY - SHORE.boardwalkH / 2;
    const plankBottom = deckY - SHORE.boardwalkH * 0.5;
    // Match water.js SAND_Y / SHORE.sandY so stairs land on the beach plane.
    const sandY = SHORE.sandY ?? 0.06;

    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    const eul = new THREE.Euler(0, 0, 0, 'YXZ');

    // —— Seawall mass with stair wells at landward access bays (no embed in solid) ——
    // W12-G: each solid run is one modelled wall (coast-models.js buildWallRun): battered face on a stepped toe, panel
    // joints and weep holes by tone-dark inset, under a chamfered overhanging coping. Local x is seaward, z along the run.
    const landBayTs = [-0.2 * L, 0.2 * L];
    const wellHalfAlong = 1.35; // half-width of open well along the edge
    const wallCuts = [-L * 0.5];
    for (const bt of landBayTs) {
      wallCuts.push(bt - wellHalfAlong, bt + wellHalfAlong);
    }
    wallCuts.push(L * 0.5);
    wallCuts.sort((a, b) => a - b);
    const coastMat = (family, opts) => {
      const mat = this.materials.get(family, opts);
      mat.vertexColors = true;
      mat.needsUpdate = true;
      return mat;
    };
    const wallRunMat = coastMat('concrete', { variant: 'seawall-r12', color: '#6a7076' });
    const copeRunMat = coastMat('concrete', { variant: 'seawall-cope-r12', color: '#91979d' });
    // Basis with local x = seaward, y = up, z = seaward x up (the run is symmetric, so its sense along the edge is free).
    const runBasis = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      seaward.clone(),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3().crossVectors(seaward, new THREE.Vector3(0, 1, 0)),
    ));
    for (let ci = 0; ci < wallCuts.length - 1; ci += 1) {
      const a0 = wallCuts[ci];
      const a1 = wallCuts[ci + 1];
      const segLen = a1 - a0;
      const mid = (a0 + a1) * 0.5;
      const inWell = landBayTs.some((bt) => Math.abs(mid - bt) < wellHalfAlong - 0.01);
      if (inWell || segLen < 0.35) continue;
      const run = buildWallRun({ length: segLen, deep: SHORE.wallDeep, wallH: SHORE.wallH });
      for (const [geometry, material, name, cast] of [
        [run.wall, wallRunMat, `seawall:${edge}:seg${ci}`, true],
        [run.cope, copeRunMat, `seawall-cope:${edge}:seg${ci}`, true],
      ]) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(wallPos).addScaledVector(along, mid);
        mesh.position.y = 0;
        mesh.quaternion.copy(runBasis);
        mesh.name = name;
        mesh.castShadow = cast;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    }

    // R20z: rock toe REMOVED from beach — rock armour now borders the other three
    // land fringes via `_buildFringeRockBorders` (clean sand + esplanade at water).

    // —— Honest bearing stack: pile → cap → joist → plank (no pierces) ——
    // Continuous contacts: pile head sockets cap; cap bears joist; joist sockets plank.
    const joistH = 0.2;
    const capH = 0.1;
    const pileBaseY = -0.06;
    const joistTopY = plankBottom + 0.02; // slight embed under plank underside
    const joistCentreY = joistTopY - joistH * 0.5;
    const joistBottomY = joistTopY - joistH;
    const capTopY = joistBottomY + 0.02; // slight socket into joist
    const capCentreY = capTopY - capH * 0.5;
    const pileTopY = capTopY - capH + 0.03; // slight socket into cap
    const pileH = Math.max(0.4, pileTopY - pileBaseY);

    const pileRows = 2;
    const bayCount = Math.max(10, Math.floor(L / 3.8));
    const pileStations = [];
    for (let i = 0; i < bayCount; i += 1) {
      pileStations.push((i / Math.max(1, bayCount - 1) - 0.5) * (L - 2));
    }
    const pileCount = pileRows * pileStations.length;
    const pileGeom = new THREE.CylinderGeometry(0.1, 0.15, pileH, 8, 1);
    MaterialLibrary.ensureUv2(pileGeom);
    const piles = new THREE.InstancedMesh(pileGeom, timberDark, pileCount);
    piles.name = `esplanade:piles:${edge}`;
    piles.castShadow = true;
    piles.receiveShadow = true;
    const capGeom = new THREE.BoxGeometry(
      alongX ? 0.34 : 0.44,
      capH,
      alongX ? 0.44 : 0.34,
    );
    MaterialLibrary.ensureUv2(capGeom);
    const caps = new THREE.InstancedMesh(capGeom, timberDark, pileCount);
    caps.name = `esplanade:pile-caps:${edge}`;
    caps.castShadow = true;
    let pi = 0;
    for (let row = 0; row < pileRows; row += 1) {
      const side = row === 0 ? -0.34 : 0.34;
      for (let i = 0; i < pileStations.length; i += 1) {
        const t = pileStations[i];
        p.copy(walkPos)
          .addScaledVector(seaward, side * SHORE.boardwalkW)
          .addScaledVector(along, t);
        // Pile: base on sand plane, head under cap (does not pierce deck).
        p.y = pileBaseY + pileH * 0.5;
        q.identity();
        scl.set(1, 1, 1);
        m.compose(p, q, scl);
        piles.setMatrixAt(pi, m);
        // Cap on pile head — joist bears on cap.
        p.y = capCentreY;
        m.compose(p, q, scl);
        caps.setMatrixAt(pi, m);
        pi += 1;
      }
    }
    piles.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    group.add(piles);
    group.add(caps);
    this.stats.instances += pileCount * 2;

    // —— Joists on the same stations as piles, resting on caps ——
    const joistN = pileStations.length;
    const joistGeom = new THREE.BoxGeometry(
      alongX ? 0.2 : SHORE.boardwalkW * 0.92,
      joistH,
      alongX ? SHORE.boardwalkW * 0.92 : 0.2,
    );
    MaterialLibrary.ensureUv2(joistGeom);
    const joists = new THREE.InstancedMesh(joistGeom, timberDark, joistN);
    joists.name = `esplanade:joists:${edge}`;
    joists.castShadow = true;
    for (let i = 0; i < joistN; i += 1) {
      const t = pileStations[i];
      p.copy(walkPos).addScaledVector(along, t);
      p.y = joistCentreY;
      q.identity();
      scl.set(1, 1, 1);
      m.compose(p, q, scl);
      joists.setMatrixAt(i, m);
    }
    joists.instanceMatrix.needsUpdate = true;
    group.add(joists);
    this.stats.instances += joistN;

    // —— Planked deck on joists with readable kerf ——
    const plankPitch = 0.4;
    const plankGap = 0.07;
    const plankN = Math.max(12, Math.floor(L / plankPitch));
    const plankW = plankPitch - plankGap;
    const plankGeom = new THREE.BoxGeometry(
      alongX ? plankW : SHORE.boardwalkW * 0.96,
      SHORE.boardwalkH,
      alongX ? SHORE.boardwalkW * 0.96 : plankW,
    );
    MaterialLibrary.ensureUv2(plankGeom);
    const planks = new THREE.InstancedMesh(plankGeom, timber, plankN);
    planks.name = `esplanade:planks:${edge}`;
    planks.castShadow = true;
    planks.receiveShadow = true;
    for (let i = 0; i < plankN; i += 1) {
      const t = (i / Math.max(1, plankN - 1) - 0.5) * (L - 1.0);
      p.copy(walkPos).addScaledVector(along, t);
      p.y = deckY;
      q.identity();
      p.y += ((i * 13) % 3) * 0.01;
      const wVar = 1 + (((i * 7) % 3) - 1) * 0.04;
      scl.set(alongX ? wVar : 1, 1, alongX ? 1 : wVar);
      m.compose(p, q, scl);
      planks.setMatrixAt(i, m);
    }
    planks.instanceMatrix.needsUpdate = true;
    group.add(planks);
    this.stats.instances += plankN;

    for (const side of [-1, 1]) {
      const beamGeom = new THREE.BoxGeometry(
        alongX ? L - 1.2 : 0.22,
        joistH,
        alongX ? 0.22 : L - 1.2,
      );
      MaterialLibrary.ensureUv2(beamGeom);
      const beam = new THREE.Mesh(beamGeom, timberDark);
      beam.position.copy(walkPos)
        .addScaledVector(seaward, side * SHORE.boardwalkW * 0.42);
      beam.position.y = joistCentreY;
      beam.castShadow = true;
      beam.name = `esplanade:stringer:${edge}:${side}`;
      group.add(beam);
      // Outer fascia board at deck edge (section read).
      const fasciaGeom = new THREE.BoxGeometry(
        alongX ? L - 1.0 : 0.1,
        SHORE.boardwalkH * 1.15,
        alongX ? 0.1 : L - 1.0,
      );
      MaterialLibrary.ensureUv2(fasciaGeom);
      const fascia = new THREE.Mesh(fasciaGeom, timber);
      fascia.position.copy(walkPos)
        .addScaledVector(seaward, side * SHORE.boardwalkW * 0.5);
      fascia.position.y = deckY;
      fascia.name = `esplanade:fascia:${edge}:${side}`;
      group.add(fascia);
    }

    // —— Seaward stairs to sand (defined first so balustrade can open at each bay) ——
    const stairBays = 3;
    const steps = 8;
    const run = 0.52;
    const stepW = 2.2;
    // Along-positions of stair centres (shared with balustrade openings).
    const stairBayTs = Array.from({ length: stairBays }, (_, b) => (
      (b / Math.max(1, stairBays - 1) - 0.5) * (L * 0.55)
    ));
    // Clear opening in the deck balustrade wider than the flight (no rail across the head).
    const stairOpenHalf = stepW * 0.55 + 0.45;

    // Pier sockets (must match water.js PIER_* schedule) — open balustrade so the
    // boardwalk connects onto each pier deck without a rail across the throat.
    const pierCount = 1;
    const pierWidth = 5.4;
    const frameLen = alongX ? extent.x : extent.z;
    const pierMargin = Math.max(28, frameLen * 0.12);
    const pierUsable = Math.max(frameLen - pierMargin * 2, 40);
    const pierStep = pierCount <= 1 ? 0 : pierUsable / (pierCount - 1);
    const pierBayTs = Array.from({ length: pierCount }, (_, i) => (
      // water.js places a lone pier at absolute frame midpoint; esplanade t is
      // centre-relative, so its one throat must be exactly t = 0.
      pierCount === 1 ? 0 : (pierMargin + pierStep * i) - frameLen * 0.5
    ));
    const pierOpenHalf = pierWidth * 0.52 + 0.35;

    /** @type {{ t: number, half: number }[]} */
    // The boat shed's slipway (coast-models.js BOAT_SHED) leaves the deck edge through the rail: open it, with a post's width spare.
    const slipwayTs = (this.city.waterfront?.structures ?? [])
      .filter((structure) => structure.kind !== 'jetty')
      .map((structure) => (alongX ? structure.x - extent.x / 2 : structure.z - extent.z / 2));
    const railGaps = [
      ...stairBayTs.map((t) => ({ t, half: stairOpenHalf })),
      ...pierBayTs.map((t) => ({ t, half: pierOpenHalf })),
      ...slipwayTs.map((t) => ({ t, half: 2.3 })),
    ];
    const inRailOpening = (t) => railGaps.some((g) => Math.abs(t - g.t) < g.half);

    // —— Seaward handrail: posts + top/mid rail + kickboard, GAPPED at stairs + piers ——
    const railSeaward = seaward.clone().multiplyScalar(SHORE.boardwalkW * 0.46);
    const postPitch = 2.4;
    const postCandidates = Math.max(14, Math.floor(L / postPitch));
    // Newel posts at each side of every opening (framing the gap).
    const newelTs = [];
    for (const g of railGaps) {
      newelTs.push(g.t - g.half, g.t + g.half);
    }
    const postTs = [];
    for (let i = 0; i < postCandidates; i += 1) {
      const t = (i / Math.max(1, postCandidates - 1) - 0.5) * (L - 2.0);
      if (!inRailOpening(t)) postTs.push(t);
    }
    for (const nt of newelTs) {
      if (Math.abs(nt) <= (L - 2.0) * 0.5 + 0.01) postTs.push(nt);
    }
    // Dedupe near-duplicates
    postTs.sort((a, b) => a - b);
    const uniquePostTs = [];
    for (const t of postTs) {
      if (!uniquePostTs.length || Math.abs(t - uniquePostTs[uniquePostTs.length - 1]) > 0.2) {
        uniquePostTs.push(t);
      }
    }
    const postGeom = new THREE.BoxGeometry(0.12, 0.95, 0.12);
    MaterialLibrary.ensureUv2(postGeom);
    const posts = new THREE.InstancedMesh(postGeom, timberDark, uniquePostTs.length);
    posts.name = `esplanade:rail-posts:${edge}`;
    posts.castShadow = true;
    for (let i = 0; i < uniquePostTs.length; i += 1) {
      p.copy(walkPos).add(railSeaward).addScaledVector(along, uniquePostTs[i]);
      p.y = deckTopY + 0.48;
      q.identity();
      scl.set(1, 1, 1);
      m.compose(p, q, scl);
      posts.setMatrixAt(i, m);
    }
    posts.instanceMatrix.needsUpdate = true;
    posts.count = uniquePostTs.length;
    group.add(posts);
    this.stats.instances += uniquePostTs.length;

    // Continuous rails as segments between openings (not one bar through stair/pier heads).
    {
      const railSpan = L - 1.6;
      const railMin = -railSpan * 0.5;
      const railMax = railSpan * 0.5;
      const openings = railGaps
        .map((g) => [
          Math.max(railMin, g.t - g.half),
          Math.min(railMax, g.t + g.half),
        ])
        .filter(([a, b]) => b > a + 0.15)
        .sort((a, b) => a[0] - b[0]);
      // Merge overlapping openings, then invert to solid segments.
      const merged = [];
      for (const op of openings) {
        if (!merged.length || op[0] > merged[merged.length - 1][1] + 0.05) {
          merged.push(op.slice());
        } else {
          merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], op[1]);
        }
      }
      const segments = [];
      let cursor = railMin;
      for (const [o0, o1] of merged) {
        if (o0 - cursor > 0.35) segments.push([cursor, o0]);
        cursor = o1;
      }
      if (railMax - cursor > 0.35) segments.push([cursor, railMax]);

      for (const [yOff, name, h] of [[0.92, 'top', 0.08], [0.52, 'mid', 0.06], [0.12, 'kick', 0.1]]) {
        const railThick = h > 0.09 ? 0.08 : 0.07;
        segments.forEach(([a0, a1], si) => {
          const segLen = a1 - a0;
          if (segLen < 0.3) return;
          const mid = (a0 + a1) * 0.5;
          const railGeom = new THREE.BoxGeometry(
            alongX ? segLen : railThick,
            h,
            alongX ? railThick : segLen,
          );
          MaterialLibrary.ensureUv2(railGeom);
          const rail = new THREE.Mesh(railGeom, timberDark);
          rail.position.copy(walkPos).add(railSeaward).addScaledVector(along, mid);
          rail.position.y = deckTopY + yOff;
          rail.castShadow = name === 'top';
          rail.name = `esplanade:rail-${name}:${edge}:seg${si}`;
          group.add(rail);
        });
      }
    }

    // —— Seaward stairs: timber treads on closed risers + raked stringers (NO stair balustrades) ——
    // W12-G: one modelled flight (closed risers under overhanging treads, raked stringers) shared by every bay.
    const stairFlight = buildSeawardStair({
      steps, run, width: stepW, deckTop: deckTopY, sandY,
    });
    const stairMat = coastMat('timber', { variant: 'esplanade-stair-r12', color: '#9a7850', roughness: 0.84 });
    for (let b = 0; b < stairBays; b += 1) {
      const t = stairBayTs[b];
      const flight = new THREE.Mesh(stairFlight.stair, stairMat);
      flight.position.copy(walkPos)
        .addScaledVector(seaward, SHORE.boardwalkW * 0.48)
        .addScaledVector(along, t);
      flight.position.y = 0;
      flight.quaternion.copy(runBasis);
      flight.castShadow = true;
      flight.receiveShadow = true;
      flight.name = `esplanade:stair:${edge}:${b}`;
      group.add(flight);
    }

    // —— Landward access THROUGH wall stair wells (open air, continuous to deck) ——
    // Wells already cut in the seawall mass at landBayTs. Flight runs board → deck landward.
    const deckLandward = SHORE.wallOffset
      + SHORE.wallDeep * 0.48
      - SHORE.boardwalkW * 0.08;
    const climbStart = 0.3; // board fringe
    const climbEnd = deckLandward; // meets boardwalk landward edge
    const landSteps = 10; // gentler outdoor run (~0.37 m/tread over wall deep)
    const landSpan = climbEnd - climbStart;
    const landRise = deckTopY / landSteps;
    const landRun = landSpan / landSteps;
    const landStairMat = coastMat('concrete', { variant: 'esplanade-land-stair-r12', color: '#6a7076' });
    const landStairGeo = buildLandStair({ steps: landSteps, rise: landRise, run: landRun, width: 2.15 });
    for (const bay of landBayTs) {
      const t = bay;
      // W12-G: one solid flight (closed risers, nosings) per well instead of floating slabs.
      const landFlight = new THREE.Mesh(landStairGeo.stair, landStairMat);
      landFlight.position.copy(shorePoint(edge, extent, climbStart, t));
      landFlight.position.y = 0;
      landFlight.quaternion.copy(runBasis);
      landFlight.castShadow = true;
      landFlight.receiveShadow = true;
      landFlight.name = `esplanade:land-stair:${edge}:${bay}`;
      group.add(landFlight);
      // Thin planked landing threshold (not a thick timber block on the deck).
      const padPlankN = 3;
      for (let pi = 0; pi < padPlankN; pi += 1) {
        const plankGeom = new THREE.BoxGeometry(
          alongX ? 2.15 : 0.18,
          0.06,
          alongX ? 0.18 : 2.15,
        );
        MaterialLibrary.ensureUv2(plankGeom);
        const plank = new THREE.Mesh(plankGeom, timber);
        const alongOff = (pi - (padPlankN - 1) * 0.5) * 0.22;
        plank.position.copy(shorePoint(edge, extent, climbEnd, t + alongOff));
        plank.position.y = deckTopY + 0.03;
        plank.name = `esplanade:land-pad-plank:${edge}:${bay}:${pi}`;
        group.add(plank);
      }
      // Well cheeks: thin walls on each side of the open well (not solid trough under deck).
      for (const cheekSide of [-1, 1]) {
        const cheekGeom = new THREE.BoxGeometry(
          alongX ? 0.14 : landSpan * 0.98,
          deckTopY * 0.92,
          alongX ? landSpan * 0.98 : 0.14,
        );
        MaterialLibrary.ensureUv2(cheekGeom);
        const cheek = new THREE.Mesh(cheekGeom, concrete);
        cheek.position.copy(shorePoint(
          edge,
          extent,
          climbStart + landSpan * 0.5,
          t + cheekSide * (wellHalfAlong - 0.12),
        ));
        cheek.position.y = deckTopY * 0.46;
        cheek.name = `esplanade:land-well-cheek:${edge}:${bay}:${cheekSide}`;
        group.add(cheek);
      }
    }

    // —— AAA dune field (not stretched spheres) ——
    // Lathe mound: flat rim on sand, soft peak, wind-raked footprint via non-uniform scale.
    // Clusters with irregular spacing — never a ruler line of identical sausages.
    const duneProfile = [
      new THREE.Vector2(0.0, 1.0),
      new THREE.Vector2(0.18, 0.92),
      new THREE.Vector2(0.38, 0.72),
      new THREE.Vector2(0.58, 0.42),
      new THREE.Vector2(0.78, 0.16),
      new THREE.Vector2(0.92, 0.04),
      new THREE.Vector2(1.0, 0.0),
    ];
    const duneGeom = new THREE.LatheGeometry(duneProfile, 14);
    // Sit base on sand: lathe is Y-up with rim at y=0, peak at y=1.
    MaterialLibrary.ensureUv2(duneGeom);
    // Secondary hummock — slightly flatter profile.
    const hummockProfile = [
      new THREE.Vector2(0.0, 0.7),
      new THREE.Vector2(0.3, 0.55),
      new THREE.Vector2(0.6, 0.28),
      new THREE.Vector2(0.85, 0.08),
      new THREE.Vector2(1.0, 0.0),
    ];
    const hummockGeom = new THREE.LatheGeometry(hummockProfile, 12);
    MaterialLibrary.ensureUv2(hummockGeom);

    const sandMatB = this.materials.get('sand', { variant: 'berm-r23b', color: '#c9a56e' });
    const sandMatC = this.materials.get('sand', { variant: 'berm-r23c', color: '#e2c494' });

    // Deterministic hash in [0,1) — presentation only, no Math.random.
    const h01 = (n) => {
      const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };

    const clusterN = Math.max(4, Math.floor(L / 28));
    const dunesPerCluster = 3; // primary + 2 satellites / hummocks
    const duneCount = clusterN * dunesPerCluster;
    const dunes = new THREE.InstancedMesh(duneGeom, sandMat, duneCount);
    dunes.name = `esplanade:dunes:${edge}`;
    dunes.castShadow = true;
    dunes.receiveShadow = true;
    const hummocks = new THREE.InstancedMesh(hummockGeom, sandMatB, clusterN * 2);
    hummocks.name = `esplanade:hummocks:${edge}`;
    hummocks.castShadow = false;
    hummocks.receiveShadow = true;
    const hummocksHi = new THREE.InstancedMesh(hummockGeom, sandMatC, clusterN);
    hummocksHi.name = `esplanade:hummocks-hi:${edge}`;
    hummocksHi.receiveShadow = true;

    let di = 0;
    let hi = 0;
    let h2 = 0;
    // Beach band seaward of boardwalk where dunes sit (dry shelf, not wet intertidal).
    const duneBand0 = SHORE.wallOffset + SHORE.wallDeep * 0.55 + SHORE.boardwalkW + 1.6;
    const duneBand1 = duneBand0 + Math.min(SHORE.sandSeaward * 0.55, 22);

    for (let c = 0; c < clusterN; c += 1) {
      // Irregular cluster centres (jittered, not equal spacing).
      const baseT = (c / Math.max(1, clusterN - 1) - 0.5) * (L * 0.78);
      const tJitter = (h01(c * 3.17) - 0.5) * 14;
      const clusterT = baseT + tJitter;
      const clusterOut = duneBand0 + h01(c * 5.91) * (duneBand1 - duneBand0);
      // Skip a few clusters so the field has gaps (real beach, not a fence).
      if (h01(c * 9.3) < 0.12) {
        // Still consume satellite slots with zero scale.
        for (let k = 0; k < dunesPerCluster; k += 1) {
          scl.set(0, 0, 0);
          m.compose(p.set(0, -10, 0), q.identity(), scl);
          dunes.setMatrixAt(di, m);
          di += 1;
        }
        for (let k = 0; k < 2; k += 1) {
          scl.set(0, 0, 0);
          m.compose(p.set(0, -10, 0), q.identity(), scl);
          hummocks.setMatrixAt(hi, m);
          hi += 1;
        }
        scl.set(0, 0, 0);
        m.compose(p.set(0, -10, 0), q.identity(), scl);
        hummocksHi.setMatrixAt(h2, m);
        h2 += 1;
        continue;
      }

      for (let k = 0; k < dunesPerCluster; k += 1) {
        const seed = c * 17 + k * 4.7;
        const alongOff = (h01(seed) - 0.5) * (k === 0 ? 3.5 : 8.5);
        const outOff = (h01(seed + 1.3) - 0.5) * (k === 0 ? 2.2 : 5.5);
        p.copy(shorePoint(edge, extent, clusterOut + outOff, clusterT + alongOff));
        // Base on sand plane (lathe rim at y=0).
        p.y = sandY;
        // Yaw: mostly shore-parallel with scatter (wind rake orientation).
        const yaw = (alongX ? 0 : Math.PI * 0.5)
          + (h01(seed + 2.1) - 0.5) * 0.9
          + (k * 0.35);
        eul.set(0, yaw, 0);
        q.setFromEuler(eul);
        // Elongated footprint, low height — never a ball.
        const len = (k === 0 ? 4.8 : 2.8) + h01(seed + 3.2) * (k === 0 ? 3.2 : 2.0);
        const wid = (k === 0 ? 2.4 : 1.5) + h01(seed + 4.1) * 1.1;
        const ht = (k === 0 ? 0.55 : 0.32) + h01(seed + 5.0) * (k === 0 ? 0.35 : 0.22);
        scl.set(len, ht, wid);
        m.compose(p, q, scl);
        dunes.setMatrixAt(di, m);
        di += 1;
      }

      // Loose hummocks around the cluster.
      for (let k = 0; k < 2; k += 1) {
        const seed = c * 23 + k * 8.1 + 50;
        p.copy(shorePoint(
          edge,
          extent,
          clusterOut + (h01(seed) - 0.5) * 7,
          clusterT + (h01(seed + 1) - 0.5) * 11,
        ));
        p.y = sandY;
        eul.set(0, h01(seed + 2) * Math.PI * 2, 0);
        q.setFromEuler(eul);
        const hs = 1.2 + h01(seed + 3) * 1.4;
        scl.set(hs * 1.3, 0.18 + h01(seed + 4) * 0.16, hs * 0.85);
        m.compose(p, q, scl);
        hummocks.setMatrixAt(hi, m);
        hi += 1;
      }
      {
        const seed = c * 29 + 80;
        p.copy(shorePoint(
          edge,
          extent,
          clusterOut + (h01(seed) - 0.35) * 5,
          clusterT + (h01(seed + 1) - 0.5) * 6,
        ));
        p.y = sandY;
        eul.set(0, h01(seed + 2) * Math.PI, 0);
        q.setFromEuler(eul);
        const hs = 0.9 + h01(seed + 3) * 0.9;
        scl.set(hs, 0.14 + h01(seed + 4) * 0.1, hs * 1.15);
        m.compose(p, q, scl);
        hummocksHi.setMatrixAt(h2, m);
        h2 += 1;
      }
    }
    dunes.instanceMatrix.needsUpdate = true;
    hummocks.instanceMatrix.needsUpdate = true;
    hummocksHi.instanceMatrix.needsUpdate = true;
    group.add(dunes, hummocks, hummocksHi);
    this.stats.instances += duneCount + clusterN * 2 + clusterN;

    // Wall pilasters (rhythm on seaward face)
    const pilN = Math.max(6, Math.floor(L / 18));
    for (let i = 0; i < pilN; i += 1) {
      const t = (i / Math.max(1, pilN - 1) - 0.5) * (L - 6);
      const pilGeom = new THREE.BoxGeometry(
        alongX ? 0.55 : 0.28,
        SHORE.wallH * 0.95,
        alongX ? 0.28 : 0.55,
      );
      MaterialLibrary.ensureUv2(pilGeom);
      const pil = new THREE.Mesh(pilGeom, copeMat);
      pil.position.copy(wallPos)
        .addScaledVector(seaward, SHORE.wallDeep * 0.42)
        .addScaledVector(along, t);
      pil.position.y = SHORE.wallH * 0.45;
      pil.name = `seawall-pilaster:${edge}:${i}`;
      group.add(pil);
    }

    this.root.add(group);
  }

  _buildWaterfrontStructures(edge, extent) {
    const alongX = edge === 'north' || edge === 'south';
    // City "jetty" records used to draw flat TIMBER slabs on the beach between sand
    // and water — that read as weird decking. Swap to sand spits instead.
    const sandSpitPlacements = [];
    const shedPlacements = [];
    for (const structure of this.city.waterfront?.structures ?? []) {
      if (structure.kind === 'jetty') {
        sandSpitPlacements.push(placement(
          structure.x, 0.05, structure.z, 0,
          // Low sand spit seaward of fringe — not a timber deck.
          alongX ? { x: 4.5, y: 0.28, z: 14 } : { x: 14, y: 0.28, z: 4.5 },
        ));
      } else {
        // W12-G: the shed is a modelled gable boat shed in real metres (coast-models.js), placed at scale 1
        // with its water gable turned to the sea; local +x is the seaward axis.
        const shedYaw = edge === 'north' ? 90 : edge === 'south' ? -90 : edge === 'west' ? 180 : 0;
        shedPlacements.push(placement(structure.x, 0, structure.z, shedYaw, 1));
      }
    }
    const sand = this.materials.get('sand', { variant: 'jetty-spit-r21', color: '#e0c08a' });
    const boxGeom = new THREE.BoxGeometry(1, 1, 1);
    MaterialLibrary.ensureUv2(boxGeom);
    if (sandSpitPlacements.length) {
      const { group } = buildInstanced(
        { parts: [{ geometry: boxGeom, material: sand }] },
        sandSpitPlacements,
        { castShadow: false, receiveShadow: true },
      );
      group.name = 'waterfront:sand-spits';
      this.root.add(group);
      this.stats.instances += sandSpitPlacements.length;
    }
    if (shedPlacements.length) {
      // P17-W2B: pixel medians timber 31 -> 54, concrete 33.5 -> 64; retain vertex wear.
      const shedGeo = buildBoatShed();
      const coastMat = (family, opts) => {
        const m = this.materials.get(family, opts);
        m.vertexColors = true;
        m.needsUpdate = true;
        return m;
      };
      const { group } = buildInstanced(
        {
          parts: [
            { geometry: shedGeo.timber, material: coastMat('timber', { variant: 'boat-shed-r12', color: restyleColour(new THREE.Color('#8f7657'), new THREE.Color('#8f7657').multiplyScalar(3.231007), { id: 'coast:boat-shed.timber' }) }) },
            { geometry: shedGeo.roof, material: coastMat('painted_metal', { variant: 'boat-shed-roof-r12', color: '#7d8588', roughness: 0.62 }) },
            { geometry: shedGeo.concrete, material: coastMat('concrete', { variant: 'boat-shed-base-r12', color: restyleColour(new THREE.Color('#8d9195'), new THREE.Color('#8d9195').multiplyScalar(4.001368), { id: 'coast:boat-shed.base' }) }) },
          ],
        },
        shedPlacements,
        { castShadow: true, receiveShadow: true },
      );
      group.name = 'waterfront:boat-shed';
      this.root.add(group);
      this.stats.instances += shedPlacements.length;
    }
    void extent;
  }

  _buildRailPatches(patches) {
    if (!patches.length) return;
    const geometry = new THREE.BoxGeometry(0.09, 0.04, TILE);
    MaterialLibrary.ensureUv2(geometry);
    const material = this.materials.get('painted_metal', {
      variant: 'rail-patch',
      color: '#565b5f',
      roughness: 0.35,
      metalness: 0.7,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, patches.length * 2);
    const matrix = new THREE.Matrix4();
    let n = 0;
    for (const patch of patches) {
      for (const offset of [-0.72, 0.72]) {
        const p = patch.axis === 'v'
          ? placement(patch.x + offset, 0.16, patch.z, 0)
          : placement(patch.x, 0.16, patch.z + offset, 90);
        matrix.compose(p.position, p.quaternion, p.scale);
        mesh.setMatrixAt(n, matrix);
        n += 1;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.root.add(mesh);
  }

  _buildBuildings(...args) { return finishBuild(this._buildBuildingsSteps(...args)); }

  *_buildBuildingsSteps() {
    const pauseBuild = buildBudget();
    // Batch by archetype + facade (0–3) + wall-family bucket. District wall bias
    // collapses into a few material families (not 6 district meshes); chroma rides
    // on instanceColor = DISTRICT_WALL_CHROMA × tintFor(parcelId).
    const byKey = new Map();
    for (const id of this._order()) {
      if (pauseBuild()) yield null;
      const parcel = this._parcel(id);
      // Deterministic façade from parcel id — same seed → same street face.
      const facade = deterministicFacade(id);
      const districtId = parcel.districtId ?? null;
      const bucket = wallBucketFor(parcel.archetypeId, districtId);
      // The lot span is taken for INDUSTRIAL ids only, and deliberately so. It is part of the
      // batch identity, so span-keying every archetype would split batches that currently share
      // one `InstancedMesh` and multiply draw submissions for no benefit — nothing outside the
      // industrial kit reads it. Measured across forty seeds, warehouse parcels come in two
      // shapes (49 single-tile, 31 two-tile), so this splits exactly one archetype into two.
      const isIndustrial = INDUSTRIAL_KIT_IDS.has(parcel.archetypeId);
      // V3.71 Lane E: the span, the yaw and the squeeze come from one function so they describe
      // one building. `place.lotSpan` is the same value this site used to compute for itself.
      const place = parcelBuildingTransform(parcel, parcel.archetypeId);
      const lotSpan = place.lotSpan;
      // Condition becomes GEOMETRY on industrial ids: a renovated bond store has a cleared yard
      // and no security fencing. Quantised to three tiers, and taken for industrial ids only, so
      // the batch split is bounded at 3x on one archetype instead of applying board-wide.
      const conditionTier = isIndustrial
        ? tierFromCondition(parcel.condition, this._renovationStarted(id))
        : null;
      const spanKey = lotSpan ? `:l${lotSpan.spanX}x${lotSpan.spanZ}` : '';
      const tierKey = conditionTier ? `:c${conditionTier}` : '';
      // V3.70 corner-shop handedness. Computed HERE, in the per-parcel loop, because the hand is
      // a property of the parcel's corner — the batch loop below has no `parcel` in scope. It has
      // to be in the batch key too: two hands are two meshes, so batching them together would
      // serve whichever corner was drawn first to all of them.
      const hand = HANDED_SHOPS.has(parcel.archetypeId) ? handForParcel(parcel) : null;
      const handKey = hand === 'left' ? ':hL' : '';
      const key = `${parcel.archetypeId}:f${facade}:w${bucket}${spanKey}${tierKey}${handKey}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          archetypeId: parcel.archetypeId,
          facade,
          districtId,
          bucket,
          lotSpan,
          conditionTier,
          hand,
          entries: [],
        });
      }
      const p = placement(
        parcel.centre.x + place.modelOffset.x,
        0,
        parcel.centre.z + place.modelOffset.z,
        place.rotation,
        place.modelScale,
      );
      // Wall instance color: hashed family variant × district chroma × parcel drift.
      const surfaces = surfacesForArchetype(parcel.archetypeId, districtId);
      p.tint = familyInstanceTint(bucket, id);
      p.tint.multiply(tintFor(id));
      const chromaHex = districtId ? DISTRICT_WALL_CHROMA[districtId] : null;
      if (chromaHex) p.tint.multiply(new THREE.Color(chromaHex));
      p.roofFamily = surfaces.roof;
      p.trimFamily = surfaces.trim ?? 'painted_metal';
      p.roofTint = familyInstanceTint(p.roofFamily, `${id}:roof`);
      p.trimTint = familyInstanceTint(p.trimFamily, `${id}:trim`);
      byKey.get(key).entries.push({ id, placement: p });
    }
    for (const {
      archetypeId, facade, districtId, bucket, lotSpan, conditionTier, hand, entries,
    } of byKey.values()) {
      if (pauseBuild()) yield null;
      // Pass districtId so surfacesForArchetype / wall bias match the bucket.
      const model = this._modelFor(archetypeId, districtId, facade, lotSpan, conditionTier, hand);
      if (!model) continue;
      const placements = entries.map((entry) => entry.placement);
      const { group, meshes } = buildInstanced(model, placements, { tint: true, cullInstances: true });
      group.name = `buildings:${archetypeId}:f${facade}:w${bucket}`;
      this.root.add(group);
      this.stats.instances += placements.length;
      entries.forEach((entry, index) => {
        this.staticBuildings.set(entry.id, {
          archetypeId,
          meshes,
          index,
          placement: entry.placement,
          facade,
          districtId,
        });
      });
    }
  }

  /**
   * Place interactive door/window leaves as live groups (not instanced) so a tap
   * can swing or slide them without splitting the building batch.
   */
  _buildBuildingOpenings(...args) { return finishBuild(this._buildBuildingOpeningsSteps(...args)); }

  *_buildBuildingOpeningsSteps() {
    const pauseBuild = buildBudget();
    this.openingHinges = new Map();
    this.buildingOpenings = new Map();
    for (const [parcelId, rec] of this.staticBuildings) {
      if (pauseBuild()) yield null;
      const parcel = this._parcel(parcelId);
      if (!parcel) continue;
      const model = this._modelFor(
        rec.archetypeId,
        rec.districtId ?? parcel.districtId ?? null,
        rec.facade ?? 0,
        null,
        null,
      );
      if (!model?.openings?.length) continue;
      this._addBuildingOpenings(parcelId, rec.archetypeId, model, rec.placement);
    }
  }

  _addBuildingOpenings(parcelId, archetypeId, model, place) {
    if (!model?.openings?.length || !place) return;
    for (const opening of model.openings) {
      if (!opening.parts?.length || !opening.pivot) continue;
      const root = new THREE.Group();
      root.name = `opening:${parcelId}:${opening.id}`;
      root.position.copy(place.position);
      root.quaternion.copy(place.quaternion);
      root.scale.copy(place.scale);

      const hinge = new THREE.Group();
      hinge.position.set(opening.pivot.x, opening.pivot.y, opening.pivot.z);
      for (const part of mergeOpeningParts(opening.parts.map(part => {
        const geometry = part.geometry.clone();
        geometry.userData.ownsGeometry = true;
        geometry.translate(-opening.pivot.x, -opening.pivot.y, -opening.pivot.z);
        // New record only. Source parts and shared static materials stay put.
        return { geometry, material: this.materials.reflectiveMovingGlass(part.material) };
      }))) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        mesh.userData.ownsGeometry = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        hinge.add(mesh);
      }
      root.add(hinge);
      this.root.add(root);

      const pickLocal = new THREE.Vector3(
        opening.pivot.x + (opening.pick?.cx ?? 0),
        opening.pivot.y + (opening.pick?.cy ?? 0),
        opening.pivot.z + (opening.pick?.cz ?? 0),
      );
      pickLocal.applyQuaternion(place.quaternion);
      pickLocal.multiply(place.scale);
      pickLocal.add(place.position);

      const key = `opening:${parcelId}:${opening.id}`;
      const pickProxy = this._makeMischiefPickProxy(
        key,
        pickLocal,
        new THREE.Vector3(
          opening.pick?.w ?? 1.1,
          opening.pick?.h ?? 2.1,
          opening.pick?.d ?? 0.4,
        ),
        { kind: 'opening', label: opening.label ?? opening.id },
      );

      const applyOpen = (k) => {
        const t = Math.max(0, Math.min(1, k));
        if (opening.slide) {
          hinge.position.set(opening.pivot.x, opening.pivot.y, opening.pivot.z);
          hinge.position[opening.slide.axis] += opening.slide.distance * t;
          hinge.rotation.set(0, 0, 0);
        } else {
          hinge.rotation.set(0, 0, 0);
          hinge.rotation[opening.axis ?? 'y'] = (opening.openAngle ?? -1.1) * t;
        }
      };
      applyOpen(0);

      const target = {
        key,
        kind: 'opening',
        model: archetypeId,
        label: opening.label ?? opening.id,
        size: new THREE.Vector3(opening.pick?.w ?? 1, opening.pick?.h ?? 2, opening.pick?.d ?? 0.4),
        voxelKit: null,
        pickProxy,
        getPose: () => ({
          position: pickLocal.clone(),
          quaternion: place.quaternion.clone(),
        }),
        setOriginal: () => {},
        setOpen: applyOpen,
        setVariant: () => {},
      };
      this.mischiefTargets.push(target);
      this.openingHinges.set(key, hinge);
      this.buildingOpenings.set(key, {
        parcelId,
        archetypeId,
        root,
        hinge,
        target,
        pickProxy,
        baseScale: place.scale.clone(),
        baseQuaternion: place.quaternion.clone(),
      });
    }
  }

  _removeBuildingOpenings(parcelId) {
    for (const [key, record] of [...this.buildingOpenings]) {
      if (record.parcelId !== parcelId) continue;
      record.target.setOpen?.(0);
      this._disposeVisualGroup(record.root);
      this.root.remove(record.pickProxy);
      this.mischiefPickTargets = this.mischiefPickTargets.filter((proxy) => proxy !== record.pickProxy);
      this.mischiefTargets = this.mischiefTargets.filter((target) => target !== record.target);
      this.openingHinges.delete(key);
      this.buildingOpenings.delete(key);
    }
  }

  _syncBuildingOpenings(state) {
    const wanted = new Map();
    for (const id of [...activeOrder(this.city, state)].sort()) {
      const parcel = activeParcel(this.city, state, id);
      const holding = state.holdings[id];
      const archetypeId = archetypeIdOf(this.city, state, id);
      if (!parcel || !archetypeId || holding?.construction || holding?.siteCleared) continue;
      wanted.set(id, {
        parcel,
        holding,
        archetypeId,
        strikes: Math.max(0, Math.min(10, holding?.demolition?.strikes ?? 0)),
      });
    }

    const presentParcels = new Set(
      [...this.buildingOpenings.values()].map((record) => record.parcelId),
    );
    for (const parcelId of presentParcels) {
      const existing = [...this.buildingOpenings.values()]
        .find((record) => record.parcelId === parcelId);
      const desired = wanted.get(parcelId);
      if (!desired || desired.archetypeId !== existing?.archetypeId) {
        this._removeBuildingOpenings(parcelId);
      }
    }

    for (const [parcelId, desired] of wanted) {
      let records = [...this.buildingOpenings.values()]
        .filter((record) => record.parcelId === parcelId);
      if (!records.length) {
        const transform = parcelBuildingTransform(desired.parcel, desired.archetypeId);
        const lotSpan = transform.lotSpan;
        const condition = state.parcelStatus[parcelId]?.condition
          ?? desired.holding?.condition
          ?? desired.parcel.condition;
        const baseCondition = activeParcel(this.city, null, parcelId)?.condition;
        const renovationStarted = Boolean(
          desired.holding?.renovation
          || desired.holding?.construction
          || (Number.isFinite(baseCondition) && condition > baseCondition),
        );
        const conditionTier = INDUSTRIAL_KIT_IDS.has(desired.archetypeId)
          ? tierFromCondition(condition, renovationStarted)
          : null;
        const model = this._modelFor(
          desired.archetypeId,
          desired.parcel.districtId,
          deterministicFacade(parcelId),
          lotSpan,
          conditionTier,
        ) ?? this.registry.get(desired.archetypeId);
        this._addBuildingOpenings(
          parcelId,
          desired.archetypeId,
          model,
          placement(
            desired.parcel.centre.x + transform.modelOffset.x,
            0,
            desired.parcel.centre.z + transform.modelOffset.z,
            transform.rotation,
            transform.modelScale,
          ),
        );
        records = [...this.buildingOpenings.values()]
          .filter((record) => record.parcelId === parcelId);
      }
      const progress = desired.strikes / 10;
      const openingsVisible = openingsVisibleForDemolition(desired.strikes);
      for (const record of records) {
        record.root.scale.set(
          record.baseScale.x,
          record.baseScale.y * (1 - progress * 0.34),
          record.baseScale.z,
        );
        record.root.quaternion.copy(record.baseQuaternion);
        record.root.rotateX(progress * 0.025);
        record.root.rotateZ(-progress * 0.045);
        record.root.visible = openingsVisible;
        record.pickProxy.visible = false;
        record.pickProxy.layers.set(openingsVisible ? 0 : 31);
      }
    }
  }

  _buildSuccessionOverlays() {
    const capacity = Math.max(1, activeOrder(this.city, null).length);
    const hoardingMaterial = this.materials.get('timber', {
      variant: 'hoarding',
      color: '#b89a65',
      roughness: 0.94,
    });
    hoardingMaterial.side = THREE.DoubleSide;
    this.hoarding = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      hoardingMaterial,
      capacity * 4,
    );
    this.hoarding.count = 0;
    this.hoarding.frustumCulled = false;
    this.hoarding.name = 'succession:hoarding';
    this.root.add(this.hoarding);

    this.scaffold = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: '#a9b4b7',
        transparent: true,
        opacity: 0.58,
        wireframe: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      capacity * 4,
    );
    this.scaffold.count = 0;
    this.scaffold.frustumCulled = false;
    this.scaffold.name = 'succession:scaffold';
    this.root.add(this.scaffold);

    const spoilGeom = new THREE.ConeGeometry(2.6, 1.8, 10);
    MaterialLibrary.ensureUv2(spoilGeom);
    this.spoil = new THREE.InstancedMesh(
      spoilGeom,
      this.materials.get('sand', { variant: 'spoil', color: '#735d43' }),
      capacity,
    );
    this.spoil.count = 0;
    this.spoil.frustumCulled = false;
    this.spoil.name = 'succession:spoil';
    this.root.add(this.spoil);

    const craneMat = this.materials.get('painted_metal', {
      variant: 'crane',
      color: '#d5ae3f',
      roughness: 0.72,
    });
    this.craneMasts = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.45, 1, 0.45),
      craneMat,
      capacity,
    );
    this.craneBooms = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.34, 0.34),
      craneMat,
      capacity,
    );
    for (const mesh of [this.craneMasts, this.craneBooms]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.name = 'succession:crane';
      this.root.add(mesh);
    }
  }

  // Cafe outdoor dining belongs to the cafe model and nothing else. It used to be baked
  // into cafe-corner.glb; since V3.31 lane A it is authored in building-kit.js
  // assembleCafeCorner. Either way there is exactly one set of tables and chairs, and a
  // second procedural overlay here was the mystery-furniture bug — do not reintroduce it.

  /**
   * V3.02 §6: commissioned civic models take precedence by use id. Uses outside the
   * current asset wave retain the warehouse-and-band fallback, so missing art never
   * changes the deterministic city layout or blocks rendering.
   */
  _buildCivicBuildings(...args) { return finishBuild(this._buildCivicBuildingsSteps(...args)); }

  *_buildCivicBuildingsSteps() {
    const pauseBuild = buildBudget();
    const civics = this.city.civicUses ?? [];
    if (!civics.length) return;
    // supermarket-strip A33 is the later texture-first Codex GLB. School keeps its
    // v303 map. Every other civic on this seed uses the later quality-loop kit
    // (hospital R20, cafe V3.31, stock V3.31, factory V3.32, remand/police/childcare/
    // community dedicated mass). Do NOT list the same id in both sets.
    const commissionedPreferGlb = new Set([
      'supermarket-strip',
    ]);
    const kitPrefer = new Set([
      // V3.70 landmarks — civic uses with no GLB; named explicitly so the civic branch
      // takes the landmarks kit rather than a generic mass.
      'town-hall-melbourne',
      'university-old-arts',
      // `school-primary` moved here 2026-08-18 — see the sibling comment at the
      // `commissionedPreferGlb` branch above. Both sets had to change: listing it in one and not
      // the other is what the "Do NOT list the same id in both sets" warning is guarding against,
      // and leaving it in only one would have kept the GLB on half the render paths.
      'school-primary',
      'hospital-district',
      'cafe-corner',
      'stock-exchange',
      'factory-light',
      'remand-centre',
      'police-station',
      'childcare-centre',
      'community-recreation',
      'transport-interchange',
      'courthouse',
    ]);
    const fallbackCivics = [];
    const byUse = new Map();
    const kitByUse = new Map();
    for (const civic of civics) {
      if (pauseBuild()) yield null;
      const model = this.registry.get(civic.useId);
      const hasRealGlb = Boolean(
        model
        && model.source !== 'runtime-procedural'
        && !model.fallback
        && model.parts?.length,
      );
      // Prefer commissioned GLB whenever it loaded successfully.
      const forceGlb = commissionedPreferGlb.has(civic.useId)
        && hasRealGlb
        && !FORCE_KIT_IDS.has(civic.useId);
      const hasCommissionedModel = forceGlb || (
        hasRealGlb && !kitPrefer.has(civic.useId)
      );
      // Kit only if we are not forcing GLB, kit supports the id, and either
      // kitPrefer says so or there is no real GLB.
      const useKit = !forceGlb
        && this.buildingKit?.supports(civic.useId)
        && (kitPrefer.has(civic.useId) || FORCE_KIT_IDS.has(civic.useId) || !hasRealGlb);
      if (useKit) {
        const facade = deterministicCivicFacade(civic);
        const key = `${civic.useId}:f${facade}`;
        if (!kitByUse.has(key)) {
          kitByUse.set(key, { useId: civic.useId, facade, entries: [] });
        }
        kitByUse.get(key).entries.push(civic);
        continue;
      }
      if (hasCommissionedModel) {
        if (!byUse.has(civic.useId)) byUse.set(civic.useId, []);
        byUse.get(civic.useId).push(civic);
        continue;
      }
      fallbackCivics.push(civic);
    }

    for (const { useId, facade, entries } of kitByUse.values()) {
      if (pauseBuild()) yield null;
      // Force building-kit massing — do not resolve through _modelFor (GLB-first).
      const model = this.buildingKit?.get?.(useId, null, facade)
        ?? this._modelFor(useId, null, facade);
      if (!model?.parts?.length) {
        fallbackCivics.push(...entries);
        continue;
      }
      const placements = entries.map((civic) => {
        // NO `lotSpan` here, deliberately: the civic kit call below is
        // `buildingKit.get(useId, null, facade)`, so a civic industrial model really is built to
        // its AUTHORED footprint and the authored fit test is the right one for it. The squeeze,
        // though, still has to be expressed in the axes of the yaw actually applied — see
        // `industrialModelScale`.
        const rotation = industrialFrontRotation(civic, useId) + MODEL_FRONT_OFFSET_DEG;
        const rowScale = industrialModelScale(civic, rotation);
        const modelOffset = civic.placement?.modelOffset ?? { x: 0, z: 0 };
        return placement(
          civic.centre.x + modelOffset.x,
          0,
          civic.centre.z + modelOffset.z,
          rotation,
          rowScale,
        );
      });
      const { group } = buildInstanced(model, placements, {
        castShadow: true,
        receiveShadow: true,
        cullInstances: true,
      });
      group.name = `civic:${useId}:f${facade}`;
      this.root.add(group);
      this.stats.instances += placements.length;
    }

    for (const [useId, entries] of byUse) {
      if (pauseBuild()) yield null;
      const model = this._modelFor(useId) ?? this.registry.get(useId);
      const placements = entries.map((civic) => {
        // NO `lotSpan` here either: `_modelFor(useId)` above is called without a span, so this
        // model is its authored size whether it resolves to a GLB or to the kit. The squeeze
        // still has to follow the yaw actually applied — see `industrialModelScale`.
        const rotation = industrialFrontRotation(civic, useId) + MODEL_FRONT_OFFSET_DEG;
        const rowScale = industrialModelScale(civic, rotation);
        const padFit = useId === 'supermarket-strip'
          ? civicPadFitScale(civic, model, rotation)
          : { x: 1, y: 1, z: 1 };
        const modelOffset = civic.placement?.modelOffset ?? { x: 0, z: 0 };
        return placement(
          civic.centre.x + modelOffset.x,
          0,
          civic.centre.z + modelOffset.z,
          rotation,
          multiplyScale(rowScale, padFit),
        );
      });
      const { group } = buildInstanced(model, placements, {
        castShadow: true,
        receiveShadow: true,
        cullInstances: true,
      });
      group.name = `civic:${useId}`;
      this.root.add(group);
      this.stats.instances += placements.length;
    }

    // Cafe outdoor dining ships with the cafe model itself (V3.31: building-kit.js
    // assembleCafeCorner). Procedural overlay removed — dual outdoor was the
    // mystery-furniture bug.

    const warehouse = this._modelFor('warehouse-brick') ?? this.registry.get('warehouse-brick');
    if (!warehouse || !fallbackCivics.length) return;
    const civicMaterial = this.materials.get('render', { variant: 'civic-fallback' });
    const bodyModel = {
      parts: warehouse.parts.map((part) => ({
        geometry: part.geometry,
        material: civicMaterial,
      })),
    };
    const bodies = fallbackCivics.map((civic) => {
      const rowScale = civic.placement?.modelScale ?? { x: 1, y: 1, z: 1 };
      const modelOffset = civic.placement?.modelOffset ?? { x: 0, z: 0 };
      return placement(
        civic.centre.x + modelOffset.x,
        0,
        civic.centre.z + modelOffset.z,
        civic.rotation + MODEL_FRONT_OFFSET_DEG,
        {
          x: rowScale.x,
          y: (civic.storeys / 2) * rowScale.y,
          z: (civic.footprint[1] / 2) * rowScale.z,
        },
      );
    });
    const { group } = buildInstanced(bodyModel, bodies, {
      castShadow: true,
      receiveShadow: true,
    });
    group.name = 'civic:fallback-warehouse';
    this.root.add(group);
    this.stats.instances += bodies.length;

    // Stock Exchange is self-identifying (kit landmark) — no floating gold pin.

    const bands = fallbackCivics.map((civic) => {
      const [fx, fz] = civic.groundFootprint;
      const band = placement(
        civic.centre.x,
        civic.storeys * STOREY + 0.24,
        civic.centre.z,
        0,
        { x: fx * TILE - 1.4, y: 0.7, z: fz * TILE - 1.4 },
      );
      band.tint = new THREE.Color(CIVIC_BAND_BY_USE[civic.useId]);
      return band;
    });
    const bandGeom = new THREE.BoxGeometry(1, 1, 1);
    MaterialLibrary.ensureUv2(bandGeom);
    const { group: bandGroup } = buildInstanced(
      {
        parts: [{
          geometry: bandGeom,
          material: this.materials.get('painted_metal', { variant: 'civic-band' }),
        }],
      },
      bands,
      { tint: true, castShadow: false, receiveShadow: false },
    );
    bandGroup.name = 'civic:roof-bands';
    this.root.add(bandGroup);
    this.stats.instances += bands.length;
  }

  /**
   * Ground buildings with a soft dark decal in the low/no-post path. FoliageLayer owns
   * tree geometry and shadows, so legacy city-tree positions must never enter this batch.
   */
  _buildContactShadows() {
    const items = [];
    for (const id of activeOrder(this.city, null)) {
      const parcel = activeParcel(this.city, null, id);
      const modelOffset = parcel.placement?.modelOffset ?? { x: 0, z: 0 };
      items.push({
        x: parcel.centre.x + modelOffset.x,
        z: parcel.centre.z + modelOffset.z,
        w: (parcel.placement?.envelopeMetres?.x ?? TILE - 1) * 0.92,
        d: (parcel.placement?.envelopeMetres?.z ?? TILE - 1) * 0.92,
        rotation: parcel.rotation + MODEL_FRONT_OFFSET_DEG,
      });
    }
    for (const civic of this.city.civicUses ?? []) {
      const modelOffset = civic.placement?.modelOffset ?? { x: 0, z: 0 };
      const cx = civic.centre.x + modelOffset.x;
      const cz = civic.centre.z + modelOffset.z;
      const w = (civic.placement?.envelopeMetres?.x ?? civic.groundFootprint[0] * TILE - 1) * 0.92;
      const d = (civic.placement?.envelopeMetres?.z ?? civic.groundFootprint[1] * TILE - 1) * 0.92;
      const rotation = civic.rotation + MODEL_FRONT_OFFSET_DEG;
      const openCourt = civic.useId === 'hospital-district'
        || civic.useId === 'transport-interchange'
        || civic.useId === 'stock-exchange';
      if (!openCourt) {
        items.push({ x: cx, z: cz, w, d, rotation });
        continue;
      }
      // U-plan civics use three footprint shadows. A single envelope-sized decal would
      // fill the courtyard negative space and visually turn the landmark back into a slab.
      const yaw = rotation * DEG;
      const axis = new THREE.Vector3(0, 1, 0);
      const pushPiece = (lx, lz, pw, pd) => {
        const offset = new THREE.Vector3(lx, 0, lz).applyAxisAngle(axis, yaw);
        items.push({ x: cx + offset.x, z: cz + offset.z, w: pw, d: pd, rotation });
      };
      pushPiece(0, -d * 0.34, w * 0.9, d * 0.26);
      pushPiece(-w * 0.4, d * 0.06, w * 0.2, d * 0.68);
      pushPiece(w * 0.4, d * 0.06, w * 0.2, d * 0.68);
    }
    const propWidth = P1_GROUNDING.propContactWidth;
    for (const prop of this.city.props ?? []) {
      if (CONTACT_SKIP_PROP.has(prop.model)) continue;
      items.push({
        x: prop.x,
        z: prop.z,
        w: propWidth,
        d: propWidth,
        rotation: prop.rotation ?? 0,
      });
    }
    if (!items.length) return;

    const geometry = sharedContactGeometry();
    const material = makeContactMaterial(0.76);
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    items.forEach((item, index) => {
      rotation.setFromAxisAngle(up, (item.rotation ?? 0) * DEG);
      const disc = contactDiscScale(item.w, item.d);
      matrix.compose(
        new THREE.Vector3(item.x, P1_GROUNDING.contactY, item.z),
        rotation,
        new THREE.Vector3(disc.x, 1, disc.z),
      );
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.contactShadows = mesh;
    this.root.add(mesh);
  }

  _buildTrees() {
    // R17: do NOT draw board GLB trees. FoliageLayer owns all street/park/shore trees
    // (same trunk+canopy language). A thinned single-part GLB set looked like floating
    // canopy balls / easter-egg mismatches next to procedural trees.
    // P17-F1: publish a renderer-only placement copy on the board root. Positions, scale,
    // order and the simulation roster stay untouched; only presentation species changes
    // by street type (plane boulevard / jacaranda residential / palm beach / gum fringe).
    // FoliageLayer reads this after Board has finished constructing.
    this.root.userData.foliagePlacements = this._coreFoliage ?? planBoardFoliage(this.city);
  }

  _buildProps() {
    const byModel = new Map();
    // R19: keep all non-skipped street furniture so mischief easter eggs work on every prop.
    // granite-tree-guard removed (empty dual frames).
    const quality = this.quality ?? 'high';
    const keepBp = quality === 'low' ? 5500 : quality === 'medium' ? 8500 : 10000;
    /** Props replaced by clean procedural silhouettes (no mystery crosses). */
    const PROCEDURAL_PROP = new Set([
      'melbourne-bike-hoop',
      'city-blackwood-bench',
      'cast-street-bollard',
      'hoddle-grid-bin',
      'city-information-pillar',
      'city-drinking-fountain',
      'signal-cabinet',
      'overhead-wire-pole',
    ]);
    // Bins / bollards / benches are sited by streetscape + avenue rules, not scatter.
    // Overhead wire poles removed from street furniture.
    const SKIP_PROP = new Set([
      'granite-tree-guard',
      'hoddle-grid-bin',
      'cast-street-bollard',
      'city-blackwood-bench',
      'overhead-wire-pole',
    ]);
    for (const [propIndex, prop] of this.city.props.entries()) {
      if (SKIP_PROP.has(prop.model)) continue;
      let h = 2166136261;
      const key = `${prop.model}:${propIndex}:${prop.x}:${prop.z}`;
      for (let i = 0; i < key.length; i += 1) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      // keepBp 10000 on high = keep everything remaining.
      if ((h >>> 0) % 10000 >= keepBp) continue;
      if (!byModel.has(prop.model)) byModel.set(prop.model, []);
      byModel.get(prop.model).push({
        item: prop,
        itemIndex: propIndex,
        placement: placement(prop.x, 0.08, prop.z, prop.rotation),
      });
    }
    for (const [id, entries] of byModel) {
      const placements = entries.map((entry) => entry.placement);
      let model;
      if (PROCEDURAL_PROP.has(id)) {
        model = this._proceduralStreetProp(id);
      } else {
        const source = this.registry.get(id);
        if (!source?.parts?.length || source.fallback) {
          model = this._proceduralStreetProp(id);
        } else {
          // Prefer full readable silhouette — truncating to 1–2 parts made cafe-corner
          // furniture read as mystery bars (not trees). Cap only under extreme density.
          const maxParts = placements.length > 40
            ? 3
            : placements.length > 20
              ? 4
              : Math.min(6, source.parts.length);
          model = { ...source, parts: source.parts.slice(0, maxParts) };
        }
      }
      if (!model?.parts?.length) continue;
      const { group } = buildInstanced(model, placements, { castShadow: false, receiveShadow: false });
      group.name = `props:${id}`;
      this.root.add(group);
      this.stats.instances += placements.length;
      entries.forEach((entry, index) => {
        this._registerStaticMischiefTarget({
          key: `prop:${entry.itemIndex}:${id}:${entry.item.x}:${entry.item.z}`,
          kind: 'prop',
          modelId: id,
          model,
          meshes: group.children,
          index,
          basePlacement: entry.placement,
        });
      });
    }
  }

  /**
   * Clean board-scale street furniture when GLBs read as crossed bars / blobs.
   * Bike hoop = U-rack (not X). Tree guard = low ring (not cross frame).
   */
  _proceduralStreetProp(id) {
    const parts = [];
    const push = (geometry, color, roughness = 0.55, metalness = 0.35) => {
      geometry.computeBoundingBox();
      MaterialLibrary.ensureUv2(geometry);
      // P17-W2B: 'cabinet' currently matches the bin fallback; measured owners are 0/2/4.
      // Keep its geometry, dark seams and every other fallback user's colours.
      // P17-W2B round 2: measured V60 -> V66.4; preserve the pale green hue.
      const cabinetGain = id === 'signal-cabinet' ? { 0: 4.998867 * 1.25, 2: 12.993947 * 1.25, 4: 10.592062 * 1.25 }[parts.length] : null;
      const cabinetRole = { 0: 'body', 2: 'lid', 4: 'door' }[parts.length];
      parts.push({
        geometry,
        material: this.materials.get('painted_metal', {
          variant: `proc-prop:${id}:${parts.length}`,
          color: cabinetGain ? restyleColour(new THREE.Color(color),
            new THREE.Color(color).multiplyScalar(cabinetGain), { id: `furniture:signal-cabinet.${cabinetRole}` }) : color,
          roughness,
          metalness,
        }),
      });
    };
    if (id === 'melbourne-bike-hoop') {
      // Inverted-U bike rack: two legs + top rail in the X–Y plane (reads as a hoop, not +).
      const legL = new THREE.CylinderGeometry(0.045, 0.05, 0.85, 8, 1);
      legL.translate(-0.28, 0.42, 0);
      const legR = new THREE.CylinderGeometry(0.045, 0.05, 0.85, 8, 1);
      legR.translate(0.28, 0.42, 0);
      const top = new THREE.TorusGeometry(0.28, 0.045, 6, 12, Math.PI);
      top.rotateZ(Math.PI);
      top.translate(0, 0.85, 0);
      push(legL, '#c8c4bc', 0.4, 0.55);
      push(legR, '#c8c4bc', 0.4, 0.55);
      push(top, '#c8c4bc', 0.4, 0.55);
      return { parts, size: new THREE.Vector3(0.7, 0.95, 0.15), fallback: true, source: 'procedural-bike-hoop' };
    }
    if (id === 'city-blackwood-bench' || id.includes('bench')) {
      // R20m: multi-plank seat + raked back + foot anchors (not single slab blocks).
      const timber = '#5a3e28';
      const timberDark = '#4a3422';
      const metal = '#3a322c';
      // Alternating plank value for multi-plank read at mid-zoom.
      for (const [dz, y, col] of [
        [-0.14, 0.44, timber], [0.0, 0.42, timberDark], [0.14, 0.4, timber],
      ]) {
        const plank = new THREE.BoxGeometry(1.55, 0.06, 0.12);
        plank.translate(0, y, dz);
        push(plank, col, 0.78, 0.04);
      }
      // Raked back: three slats with value break.
      for (let i = 0; i < 3; i += 1) {
        const slat = new THREE.BoxGeometry(1.55, 0.08, 0.06);
        slat.translate(0, 0.58 + i * 0.12, -0.2 - i * 0.02);
        push(slat, i % 2 === 0 ? timberDark : '#3a2818', 0.75, 0.04);
      }
      // End frames with foot pads (anchored feet, not floating slabs).
      for (const x of [-0.62, 0.62]) {
        const leg = new THREE.BoxGeometry(0.08, 0.42, 0.38);
        leg.translate(x, 0.22, 0);
        push(leg, metal, 0.5, 0.45);
        const foot = new THREE.BoxGeometry(0.16, 0.05, 0.42);
        foot.translate(x, 0.03, 0);
        push(foot, metal, 0.55, 0.4);
        const arm = new THREE.BoxGeometry(0.08, 0.08, 0.42);
        arm.translate(x, 0.52, 0);
        push(arm, metal, 0.5, 0.4);
      }
      return { parts, size: new THREE.Vector3(1.65, 0.95, 0.58), fallback: true, source: 'procedural-bench-r20m' };
    }
    if (id === 'cast-street-bollard' || id.includes('bollard')) {
      const g = new THREE.CylinderGeometry(0.12, 0.14, 0.95, 8, 1);
      g.translate(0, 0.48, 0);
      push(g, '#e8e2d6', 0.45, 0.3);
      const cap = new THREE.SphereGeometry(0.14, 8, 6);
      cap.translate(0, 0.98, 0);
      push(cap, '#d8d2c6', 0.4, 0.35);
      return { parts, size: new THREE.Vector3(0.28, 1.05, 0.28), fallback: true, source: 'procedural-bollard' };
    }
    if (id.includes('bin') || id === 'hoddle-grid-bin') {
      // R20m: plinth + body + lid + mouth aperture + service-door seam.
      const body = new THREE.BoxGeometry(0.55, 0.78, 0.55);
      body.translate(0, 0.48, 0);
      push(body, '#3f6757', 0.65, 0.12);
      const plinth = new THREE.BoxGeometry(0.62, 0.1, 0.62);
      plinth.translate(0, 0.06, 0);
      push(plinth, '#2a3430', 0.75, 0.1);
      const lid = new THREE.BoxGeometry(0.58, 0.1, 0.58);
      lid.translate(0, 0.92, 0);
      push(lid, '#2a4540', 0.55, 0.2);
      // R20o: deeper black mouth + contrast door panel.
      const mouth = new THREE.BoxGeometry(0.36, 0.18, 0.12);
      mouth.translate(0, 0.86, 0.32);
      push(mouth, '#050808', 0.95, 0.02);
      const door = new THREE.BoxGeometry(0.4, 0.58, 0.05);
      door.translate(0, 0.45, 0.3);
      push(door, '#2a4a3c', 0.55, 0.15);
      const seam = new THREE.BoxGeometry(0.03, 0.58, 0.06);
      seam.translate(0.18, 0.45, 0.32);
      push(seam, '#0a1210', 0.7, 0.1);
      const handle = new THREE.BoxGeometry(0.04, 0.1, 0.06);
      handle.translate(0.12, 0.55, 0.34);
      push(handle, '#c8a820', 0.45, 0.35);
      return { parts, size: new THREE.Vector3(0.7, 1.05, 0.7), fallback: true, source: 'procedural-bin-r20o' };
    }
    if (id === 'city-information-pillar' || id.includes('information') || id.includes('pillar')) {
      // Melbourne City wayfinding information stand (map totem) — not a thin post+plaque.
      // Charcoal stainless frame, dual map faces, blue "i" header (municipal visitor cue).
      const frame = '#2a2e34';
      const frameLite = '#3a4048';
      const mapFace = '#e8e2d4';
      const mapInk = '#5a6a78';
      const headerBlue = '#0077c8'; // Melbourne / PTV municipal blue family
      const iWhite = '#f4f7fa';
      const pin = '#e53935';
      // Footing plinth (grounded municipal base).
      const plinth = new THREE.BoxGeometry(0.92, 0.12, 0.42);
      plinth.translate(0, 0.06, 0);
      push(plinth, frame, 0.55, 0.45);
      const plinthTop = new THREE.BoxGeometry(0.84, 0.05, 0.36);
      plinthTop.translate(0, 0.14, 0);
      push(plinthTop, frameLite, 0.5, 0.4);
      // Side posts (vertical frame).
      for (const x of [-0.36, 0.36]) {
        const post = new THREE.BoxGeometry(0.08, 2.35, 0.14);
        post.translate(x, 1.3, 0);
        push(post, frame, 0.48, 0.5);
      }
      // Bottom & top cross rails.
      const railBot = new THREE.BoxGeometry(0.78, 0.07, 0.14);
      railBot.translate(0, 0.28, 0);
      push(railBot, frame, 0.5, 0.48);
      const railMid = new THREE.BoxGeometry(0.78, 0.05, 0.12);
      railMid.translate(0, 1.95, 0);
      push(railMid, frame, 0.5, 0.48);
      const railTop = new THREE.BoxGeometry(0.82, 0.08, 0.16);
      railTop.translate(0, 2.55, 0);
      push(railTop, frame, 0.48, 0.5);
      // Flat cap (totem roof lip).
      const cap = new THREE.BoxGeometry(0.9, 0.06, 0.28);
      cap.translate(0, 2.66, 0);
      push(cap, frameLite, 0.45, 0.45);
      // Dual map faces (front + back) — cream board with simplified street grid.
      for (const z of [0.07, -0.07]) {
        const face = new THREE.BoxGeometry(0.68, 1.55, 0.04);
        face.translate(0, 1.1, z);
        push(face, mapFace, 0.72, 0.04);
        // Abstract Hoddle-grid lines (horizontal + vertical strokes).
        for (const dy of [-0.45, -0.15, 0.15, 0.45]) {
          const hLine = new THREE.BoxGeometry(0.58, 0.025, 0.02);
          hLine.translate(0, 1.1 + dy, z + Math.sign(z) * 0.025);
          push(hLine, mapInk, 0.8, 0.02);
        }
        for (const dx of [-0.18, 0.0, 0.18]) {
          const vLine = new THREE.BoxGeometry(0.025, 1.2, 0.02);
          vLine.translate(dx, 1.1, z + Math.sign(z) * 0.025);
          push(vLine, mapInk, 0.8, 0.02);
        }
        // "You are here" pin.
        const pinDot = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10, 1);
        pinDot.rotateX(Math.PI / 2);
        pinDot.translate(0.06, 1.05, z + Math.sign(z) * 0.04);
        push(pinDot, pin, 0.45, 0.08);
      }
      // Blue header band with white circular "i" (visitor-information stand cue).
      for (const z of [0.08, -0.08]) {
        const header = new THREE.BoxGeometry(0.72, 0.42, 0.05);
        header.translate(0, 2.22, z);
        push(header, headerBlue, 0.42, 0.08);
        const iDisc = new THREE.CylinderGeometry(0.12, 0.12, 0.03, 14, 1);
        iDisc.rotateX(Math.PI / 2);
        iDisc.translate(0, 2.24, z + Math.sign(z) * 0.035);
        push(iDisc, iWhite, 0.55, 0.04);
        // Dot + stem of the "i" glyph (readable at board distance).
        const iDot = new THREE.BoxGeometry(0.045, 0.05, 0.02);
        iDot.translate(0, 2.32, z + Math.sign(z) * 0.05);
        push(iDot, headerBlue, 0.5, 0.05);
        const iStem = new THREE.BoxGeometry(0.05, 0.12, 0.02);
        iStem.translate(0, 2.18, z + Math.sign(z) * 0.05);
        push(iStem, headerBlue, 0.5, 0.05);
      }
      // Thin side glazing reveal strips (stainless edge).
      for (const x of [-0.34, 0.34]) {
        const reveal = new THREE.BoxGeometry(0.03, 1.55, 0.16);
        reveal.translate(x, 1.1, 0);
        push(reveal, '#8a9098', 0.35, 0.65);
      }
      return {
        parts,
        size: new THREE.Vector3(0.95, 2.75, 0.48),
        fallback: true,
        source: 'procedural-melbourne-info-stand',
      };
    }
    if (id.includes('fountain') || id.includes('drinking')) {
      const base = new THREE.CylinderGeometry(0.35, 0.4, 0.35, 10, 1);
      base.translate(0, 0.18, 0);
      push(base, '#66777d', 0.55, 0.15);
      const bowl = new THREE.CylinderGeometry(0.28, 0.22, 0.2, 10, 1);
      bowl.translate(0, 0.45, 0);
      push(bowl, '#7a8a90', 0.45, 0.2);
      const spout = new THREE.CylinderGeometry(0.04, 0.04, 0.35, 6, 1);
      spout.translate(0, 0.7, 0);
      push(spout, '#8a9aa0', 0.4, 0.35);
      return { parts, size: new THREE.Vector3(0.8, 0.95, 0.8), fallback: true, source: 'procedural-fountain' };
    }
    if (id.includes('signal') || id.includes('cabinet')) {
      const boxG = new THREE.BoxGeometry(0.55, 1.1, 0.4);
      boxG.translate(0, 0.55, 0);
      push(boxG, '#58644f', 0.55, 0.15);
      const door = new THREE.BoxGeometry(0.42, 0.85, 0.04);
      door.translate(0, 0.55, 0.22);
      push(door, '#6a7860', 0.5, 0.12);
      return { parts, size: new THREE.Vector3(0.6, 1.15, 0.45), fallback: true, source: 'procedural-cabinet' };
    }
    if (id.includes('pole') || id.includes('overhead')) {
      const pole = new THREE.CylinderGeometry(0.08, 0.1, 5.2, 6, 1);
      pole.translate(0, 2.6, 0);
      push(pole, '#2a2c30', 0.45, 0.4);
      const arm = new THREE.BoxGeometry(1.4, 0.08, 0.08);
      arm.translate(0.5, 5.0, 0);
      push(arm, '#2a2c30', 0.45, 0.4);
      return { parts, size: new THREE.Vector3(1.6, 5.3, 0.25), fallback: true, source: 'procedural-pole' };
    }
    // Generic short pillar — never a horizontal cross bar.
    const g = new THREE.CylinderGeometry(0.16, 0.18, 0.9, 8, 1);
    g.translate(0, 0.45, 0);
    push(g, '#5a5854', 0.7, 0.15);
    return { parts, size: new THREE.Vector3(0.36, 0.9, 0.36), fallback: true, source: 'procedural-prop' };
  }

  _buildTransit() {
    const stops = [];
    for (const [transitIndex, item] of this.city.transit.entries()) {
      if (item.kind === 'stop') {
        stops.push({
          item,
          transitIndex,
          placement: placement(item.x, 0.16, item.z, item.rotation),
        });
        continue;
      }
      // One tram per flagged corridor, animated along the reservation centreline.
      const modelId = item.axis === 'v' ? 'w-class-tram' : 'e-class-tram';
      const tramHalfLength = modelId.startsWith('e-class') ? 8.25 : 6.95;
      const model = this.registry.get(modelId) ?? this.registry.get('w-class-tram');
      if (!model) continue;
      const inner = new THREE.Group();
      inner.name = `transit:${modelId}:measured-hull`;
      for (const part of model.parts) {
        // A tram's livery is renderer-local variation, so each moving vehicle owns its
        // material clone while continuing to share immutable geometry.
        const material = part.material.clone();
        // Standard/Physical clone() resets defines and omits callbacks. The
        // pilot changes albedo, so both switch paths retain the source program.
        if (part.material.defines) material.defines = { ...part.material.defines };
        material.onBeforeCompile = part.material.onBeforeCompile;
        material.customProgramCacheKey = part.material.customProgramCacheKey;
        // The imported cream/white and roof values were crossing the production bloom
        // threshold and collapsing a correctly measured tram into one bright selection-
        // bar silhouette. Keep the declared 13.9/16.5 m envelope; control the material
        // response instead of hiding the defect with an arbitrary scale fudge.
        const role = String(material.name ?? '').toLowerCase();
        material.toneMapped = true;
        if (material.emissive) {
          material.emissiveIntensity = Math.min(material.emissiveIntensity ?? 0, 0.08);
        }
        if (Number.isFinite(material.envMapIntensity)) {
          material.envMapIntensity = Math.min(material.envMapIntensity, 0.45);
        }
        // Cream/white hulls bloom into a single bright selection bar at mid-zoom.
        // Keep the factory Melbourne livery; only pull value down.
        if (/glass|window|glazing/.test(role)) {
          material.color?.set('#0a1218');
          material.roughness = 0.22;
          material.metalness = 0.35;
          if ('opacity' in material) {
            material.transparent = true;
            material.opacity = Math.min(material.opacity ?? 1, 0.85);
          }
        } else if (!material.userData.tramLivery && /modern white|warm cream|white lens|cream|white/.test(role)) {
          material.color?.set('#d4c6a4');
          material.roughness = Math.max(material.roughness ?? 0, 0.62);
          material.metalness = Math.min(material.metalness ?? 0, 0.18);
        } else if (!material.userData.tramLivery && /heritage green|PTV green/i.test(role)) {
          material.color?.set('#345b3e');
          material.roughness = 0.48;
        } else if (!material.userData.tramLivery && /roof grey|roof/.test(role)) {
          material.color?.set('#3a3c40');
          material.roughness = Math.max(material.roughness ?? 0, 0.78);
        } else if (!material.userData.tramLivery) {
          material.color?.multiplyScalar(0.85);
        }
        material.userData.mischiefTramClone = true;
        material.userData.mischiefBaseColour = material.color?.clone();
        material.userData.dogFindBaseColour = material.color?.clone();
        const mesh = new THREE.Mesh(part.geometry, material);
        mesh.castShadow = true;
        inner.add(mesh);
      }
      // Fit measured GLB hulls only. Procedural tram fallbacks are already in board metres.
      if (!model.fallback) {
        const fit = fitScale(model, modelId);
        // Guard: if authored size is near-unit (failed import / quantize), refuse stretch.
        const sx = model.size?.x ?? 0;
        const sy = model.size?.y ?? 0;
        if (sx < 2 || sy < 1.5) {
          // Broken import → replace with board-metre procedural hull, no fitScale.
          console.warn(`[tram] ${modelId} size ${sx}×${sy} too small; skip fitScale`);
        } else {
          inner.scale.set(fit.x, fit.y, fit.z);
        }
      }
      const group = new THREE.Group();
      // S3: moving trolley hulls must bypass static batching and generic LOD.
      // The batcher otherwise freezes copies while the reservation group moves.
      group.name = `transit:trolley:${modelId}:hull`;
      group.userData.tramModel = modelId;
      group.userData.fullDetailThroughM = 240;
      group.add(inner);
      const doorRig = rigTramDoors(inner, model, modelId);
      group.position.y = 0.16;
      attachContactBlob(group, tramHalfLength * 2, 2.7, {
        localY: P1_GROUNDING.contactY - 0.16,
        opacity: P1_GROUNDING.vehicleContactOpacity,
      });
      // Length sits on the reservation. Do not use city `item.rotation` here —
      // v-corridors ship rotation 0, which parks the hull across the track.
      group.rotation.y = tramReservationYaw(item) * DEG;
      this.root.add(group);
      const stopAlong = this.city.transit
        .filter((s) => s.kind === 'stop'
          && (item.axis === 'v' ? Math.abs(s.x - item.x) < 14 : Math.abs(s.z - item.z) < 14))
        .map((s) => (item.axis === 'v' ? s.z : s.x))
        .sort((a, b) => a - b);
      const tram = {
        group,
        item,
        doorRig,
        doorBerths: this.city.transit.filter(s => s.kind === 'stop'
          && (item.axis === 'v' ? Math.abs(s.x - item.x) < 14 : Math.abs(s.z - item.z) < 14))
          .map(s => ({ along: item.axis === 'v' ? s.z : s.x,
            side: Math.sign(item.axis === 'v' ? s.x - item.x : s.z - item.z) })),
        t: item.axis === 'v' ? 0.15 : 0.6,
        dir: 1,
        mischiefStopped: false,
        mischiefSlide: 0,
        speed: 0,
        yaw: tramReservationYaw(item) * DEG,
        visualRot: tramReservationYaw(item),
        fwdX: item.axis === 'v' ? 0 : 1,
        fwdZ: item.axis === 'v' ? 1 : 0,
        dwellTimer: 0,
        lastStopAlong: null,
        stopAlong,
        modelId,
        halfLength: tramHalfLength,
        halfWidth: 1.33,
      };
      this.trams.push(tram);
      this._registerTramMischiefTarget(tram, modelId, transitIndex);
    }
    if (stops.length) {
      // F1: one procedural Yarra Trams kerbside stop replaces the pylon GLB slice, the
      // streetscape box shelter and the stop-side PTV flag (`?tramStopKit=0` restores them).
      const kit = tramStopKitEnabled();
      let model;
      if (kit) {
        model = tramStopModel(this.materials, { includeFlag: false, ensureUv2: (g) => MaterialLibrary.ensureUv2(g) });
      } else {
        const source = this.registry.get('modern-tram-stop-pylon');
        // Prop-family thrift: pylon GLB is 9 materials; keep body (+ accent if sparse).
        const maxParts = stops.length > 20 ? 1 : Math.min(2, source?.parts?.length ?? 1);
        model = source
          ? { ...source, parts: source.parts.slice(0, maxParts) }
          : source;
      }
      const { group, meshes: stopMeshes } = buildInstanced(
        model,
        stops.map((stop) => stop.placement),
        { castShadow: kit, receiveShadow: kit },
      );
      if (kit) {
        stopMeshes.forEach((mesh, i) => {
          mesh.castShadow = model.parts[i]?.castShadow !== false;
          mesh.name = `transit:stop-kit:${model.parts[i]?.key ?? i}`;
        });
        group.userData.tramStopKit = true;
      }
      group.name = 'transit:stops';
      this.root.add(group);
      stops.forEach((stop, index) => {
        this._registerStaticMischiefTarget({
          key: `prop:transit-stop:${stop.transitIndex}:${stop.item.x}:${stop.item.z}`,
          kind: 'prop',
          modelId: 'modern-tram-stop-pylon',
          label: kit ? 'Tram stop' : null,
          model,
          meshes: group.children,
          index,
          basePlacement: stop.placement,
        });
      });
    }
  }

  /**
   * One route bus per transport interchange (the city quota is 1). The bodyshell, its
   * procedural texture set, the route and the whole motion controller live in
   * `./vehicles/bus.js`; the board keeps only the handle and forwards the frame tick.
   */
  _buildInterchangeBuses() {
    const hubs = (this.city.civicUses ?? []).filter((c) => c.useId === 'transport-interchange');
    this.interchangeBusFleet = new BusFleet(this.city, { reducedMotion: this.reducedMotion });
    this.root.add(this.interchangeBusFleet.root);
    /** Live bus records owned by the fleet — read by the transport capture harness. */
    this.interchangeBuses = this.interchangeBusFleet.build(hubs);
  }

  /**
   * Pose on a bus route at distance `s` from the berth. The board keeps this delegate
   * because `mvp/tests/capture-transport.mjs` drives the bus through it.
   */
  _sampleInterchangeBusPath(path, s) {
    return sampleBusPath(path, s);
  }

  _makeMischiefPickProxy(key, position, size, { kind = 'prop', label = null } = {}) {
    const proxy = new THREE.Mesh(this.mischiefPickGeometry, this.mischiefPickMaterial);
    // Trees: slim trunk-height proxy so city-frame rays can still hit buildings.
    // Trams: full hull — no 2.2 clamp (W/E-class are 13–16 m long).
    // Signals: tall slim pole volume for kerbside picks without blocking junctions.
    // Furniture: compact volume around the prop.
    let sx;
    let sy;
    let sz;
    if (kind === 'tree') {
      // Compact canopy hit volume: tall enough to tap, never a giant billboard proxy.
      // (Earlier pass used up to 3.2×9 which made some trees look enormous when hit.)
      sx = Math.min(1.8, Math.max(0.9, Number.isFinite(size.x) ? size.x * 0.22 : 1.2));
      sy = Math.min(5.5, Math.max(2.4, Number.isFinite(size.y) ? size.y * 0.45 : 3.5));
      sz = Math.min(1.8, Math.max(0.9, Number.isFinite(size.z) ? size.z * 0.22 : 1.2));
    } else if (kind === 'tram' || kind === 'bus') {
      sx = Math.max(1.2, size.x);
      sy = Math.max(1.4, size.y);
      sz = Math.max(1.0, size.z);
    } else if (kind === 'signal') {
      sx = Math.min(0.7, Math.max(0.35, size.x));
      sy = Math.min(5.2, Math.max(3.6, size.y));
      sz = Math.min(0.7, Math.max(0.35, size.z));
    } else if (kind === 'opening') {
      sx = Math.max(0.45, Math.min(2.8, size.x));
      sy = Math.max(0.8, Math.min(3.4, size.y));
      sz = Math.max(0.28, Math.min(1.2, size.z));
    } else {
      sx = Math.max(0.7, Math.min(2.2, size.x));
      sy = Math.max(0.9, Math.min(3.2, size.y));
      sz = Math.max(0.7, Math.min(2.2, size.z));
    }
    proxy.position.set(
      position.x,
      kind === 'opening' ? position.y : position.y + sy / 2,
      position.z,
    );
    proxy.scale.set(sx, sy, sz);
    proxy.visible = false;
    proxy.userData.mischiefKey = key;
    proxy.userData.mischiefKind = kind;
    proxy.userData.label = label || furnitureLabel(null, key);
    proxy.userData.modelId = null;
    this.root.add(proxy);
    this.mischiefPickTargets.push(proxy);
    return proxy;
  }

  _registerStaticMischiefTarget({
    key, kind, modelId, model, meshes, index, basePlacement,
    preserveFoliageMatrix = false,
    label = null,
    // V3.31 lane C. A caller that has already measured its own damaged kit passes it here.
    // Trees are the case that needs it: their meshes are instanced batches of the whole
    // species, so neither `voxelKitFromModel` nor `voxelKitFromMeshes` can describe one
    // tree, and without this the tree branch below could only ever resolve to null.
    voxelKit: authoredVoxelKit = null,
  }) {
    const size = (model?.size ?? new THREE.Vector3(0.8, 1.2, 0.8))
      .clone()
      .multiplyScalar(kind === 'tree' ? 1 : 1);
    // Furniture uses placement scale; trees use declared pick size (not huge scale product).
    if (kind !== 'tree') {
      size.multiply(basePlacement.scale);
    }
    const state = {
      visible: true,
      growth: 1,
      variantScale: new THREE.Vector3(1, 1, 1),
      tint: new THREE.Color(1, 1, 1),
      baseMatrices: null,
      swayX: 0,
      swayZ: 0,
    };
    const swayEuler = new THREE.Euler(0, 0, 0, 'XZY');
    const swayQuat = new THREE.Quaternion();
    // Snapshot foliage instance matrices once so mischief hide/show can restore them
    // without overwriting the authored canopy/trunk scales on first write.
    if (preserveFoliageMatrix && meshes?.length) {
      state.baseMatrices = meshes.map((mesh) => {
        const m = new THREE.Matrix4();
        if (mesh?.instanceMatrix && index < (mesh.count ?? 0)) {
          mesh.getMatrixAt(index, m);
        } else if (basePlacement.baseMatrix) {
          m.copy(basePlacement.baseMatrix);
        } else {
          m.compose(
            basePlacement.position,
            basePlacement.quaternion,
            basePlacement.scale,
          );
        }
        return m;
      });
    }
    const write = () => {
      for (let mi = 0; mi < meshes.length; mi += 1) {
        const mesh = meshes[mi];
        if (!mesh?.setMatrixAt) continue;
        // Foliage damage is explicit (setDamaged). Writing the hide/show
        // matrix here would undamage the tree every pose tick.
        if (mesh.isFoliageDamageBridge) continue;
        const matrix = new THREE.Matrix4();
        if (state.baseMatrices?.[mi]) {
          matrix.copy(state.baseMatrices[mi]);
          if (!state.visible || state.growth < 0.02) {
            matrix.multiply(new THREE.Matrix4().makeScale(0, 0, 0));
          } else if (state.variantScale.x !== 1 || state.variantScale.y !== 1) {
            const pos = new THREE.Vector3();
            const quat = new THREE.Quaternion();
            const scl = new THREE.Vector3();
            matrix.decompose(pos, quat, scl);
            scl.multiply(state.variantScale);
            scl.multiplyScalar(state.growth);
            matrix.compose(pos, quat, scl);
          }
        } else {
          const scale = basePlacement.scale.clone().multiply(state.variantScale);
          scale.multiplyScalar(state.visible ? state.growth : 0);
          swayEuler.set(state.swayX, 0, state.swayZ, 'XZY');
          swayQuat.setFromEuler(swayEuler);
          const hingeY = lampHingeY(modelId);
          if (hingeY > 0 && isLampBaseGeometry(mesh.geometry, hingeY)) {
            // Stone hex stays on the turf. Post nods above the bolt (r5 gimbal).
            matrix.compose(basePlacement.position, basePlacement.quaternion, scale);
          } else if (hingeY > 0) {
            matrix.compose(basePlacement.position, basePlacement.quaternion, new THREE.Vector3(1, 1, 1));
            matrix.multiply(new THREE.Matrix4().makeTranslation(0, hingeY, 0));
            matrix.multiply(new THREE.Matrix4().makeRotationFromQuaternion(swayQuat));
            matrix.multiply(new THREE.Matrix4().makeTranslation(0, -hingeY, 0));
            matrix.multiply(new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z));
          } else {
            // World half-extent, not instance scale. A 1.65 m bench at 0.40 rad
            // buries ~0.32 m; scale*0.42 only lifted 0.16 m (r4 turf clip).
            const lift = plantedLift(state.swayX, state.swayZ, size.x * 0.5, size.z * 0.5);
            const ground = new THREE.Matrix4().makeTranslation(
              basePlacement.position.x, lift, basePlacement.position.z,
            );
            const local = new THREE.Matrix4().compose(
              new THREE.Vector3(0, basePlacement.position.y, 0),
              basePlacement.quaternion,
              scale,
            );
            matrix.copy(ground)
              .multiply(new THREE.Matrix4().makeRotationFromQuaternion(swayQuat))
              .multiply(local);
          }
        }
        if (preserveFoliageMatrix) {
          // Preserve the separately owned foliage bridge's existing upload contract.
          mesh.setMatrixAt(index, matrix);
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        } else {
          writeInstancePoseIfChanged(mesh, index, matrix, state.tint);
        }
        if ((state.swayX || state.swayZ) && pickProxy) {
          pickProxy.rotation.x = state.swayX;
          pickProxy.rotation.z = state.swayZ;
        }
      }
    };
    const resolvedLabel = label || furnitureLabel(modelId, key);
    const pickProxy = this._makeMischiefPickProxy(key, basePlacement.position, size, {
      kind,
      label: resolvedLabel,
    });
    pickProxy.userData.modelId = modelId;
    // Voxel kit from the live model (or its instanced part meshes) so tip/scatter
    // matches the real prop silhouette — not a generic stub. An authored kit from the
    // caller wins: it was measured from geometry this function cannot see.
    const voxelKit = authoredVoxelKit?.length
      ? authoredVoxelKit
      : (kind === 'tree'
        ? null
        : (voxelKitFromModel(model) ?? voxelKitFromMeshes(meshes)));
    const target = {
      renderBinding: { meshes, index },
      key,
      kind,
      model: modelId,
      label: resolvedLabel,
      size,
      voxelKit,
      pickProxy,
      getPose: () => ({
        position: basePlacement.position.clone(),
        quaternion: basePlacement.quaternion.clone(),
      }),
      setOriginal: ({
        visible = state.visible,
        scale = state.growth,
        swayX = state.swayX,
        swayZ = state.swayZ,
      } = {}) => {
        state.visible = visible;
        state.growth = scale;
        state.swayX = swayX ?? 0;
        state.swayZ = swayZ ?? 0;
        write();
      },
      setVariant: (variant) => {
        state.variantScale.set(1, 1, 1);
        state.tint.setRGB(1, 1, 1);
        if (kind === 'tree') {
          const profiles = [
            { scale: [1.10, 0.96, 1.10], tint: '#6f8f58' },
            { scale: [0.88, 1.14, 0.88], tint: '#869275' },
            { scale: [1.14, 0.94, 1.14], tint: '#9a819c' },
            { scale: [0.95, 0.88, 0.95], tint: '#70906c' },
            { scale: [0.72, 1.18, 0.72], tint: '#5f8a4a' },
          ];
          const profile = profiles[variant % profiles.length];
          state.variantScale.fromArray(profile.scale);
          state.tint.set(profile.tint);
        } else if (modelId.includes('bench') || modelId.includes('picnic')) {
          state.tint.set(variant % 2 ? '#bf8a5f' : '#ffffff');
        } else {
          state.tint.set(variant % 2 ? '#d5c2a0' : '#ffffff');
        }
        write();
      },
    };
    // Foliage: skip initial write so we don't stomp the foliage layer matrices until hit.
    if (!preserveFoliageMatrix) write();
    this.mischiefTargets.push(target);
  }

  /**
   * Register FoliageLayer street trees as interactive mischief targets (tip / damage /
   * disappear easter egg). Call after foliage is built, before Mischief is constructed.
   * @param {{ mischiefTreeRecords?: Array<object> } | null} foliage
   */
  /**
   * Beach umbrellas + lifeguard tower + ice-cream truck — voxel tip/scatter mischief.
   * @param {{
   *   beachUmbrellaRecords?: Array<object>,
   *   beachLifeguardRecords?: Array<object>,
   *   beachIcecreamRecords?: Array<object>,
   * } | null} water
   */
  registerBeachUmbrellaMischief(water) {
    const records = water?.beachUmbrellaRecords ?? [];
    const cap = 96; // R30f: primary+staggered beach rows
    for (let i = 0; i < Math.min(records.length, cap); i += 1) {
      const rec = records[i];
      if (!rec?.group) continue;
      const group = rec.group;
      group.userData.mischiefBatchOwner = true;
      const size = new THREE.Vector3(2.2, 2.8, 2.2);
      const modelId = rec.modelId ?? 'beach-umbrella';
      const label = furnitureLabel(modelId, rec.key);
      const pickProxy = this._makeMischiefPickProxy(
        rec.key,
        new THREE.Vector3(rec.x, 0, rec.z),
        size,
        { kind: 'prop', label },
      );
      const syncPick = () => {
        pickProxy.position.set(group.position.x, size.y * 0.45, group.position.z);
        pickProxy.rotation.y = group.rotation.y;
      };
      const target = {
        renderBinding: { group },
        key: rec.key,
        kind: 'prop',
        model: modelId,
        userData: { mischief: { kind: 'umbrella' } },
        authoredGeometry: true,
        voxelKit: authoredKitFromGroup(group),
        label,
        size,
        pickProxy,
        getPose: () => ({
          position: group.position.clone(),
          quaternion: group.quaternion.clone(),
        }),
        setOriginal: ({
          visible = group.visible, scale = group.scale.x, swayX = 0, swayZ = 0,
        } = {}) => {
          group.visible = visible;
          setBatchedVisibility(group, visible);
          group.scale.setScalar(scale);
          if (!group.userData.mischiefBaseQuat) {
            group.userData.mischiefBaseQuat = group.quaternion.clone();
          }
          const swayQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(swayX, 0, swayZ, 'XZY'));
          group.quaternion.copy(group.userData.mischiefBaseQuat).multiply(swayQ);
          syncPick();
        },
        setVariant: (variant) => {
          const tint = new THREE.Color(variant % 2 ? '#f0c631' : '#ffffff');
          group.traverse((child) => {
            if (!child.isMesh || !child.material?.color) return;
            if (!child.material.userData.mischiefBaseColour) {
              child.material.userData.mischiefBaseColour = child.material.color.clone();
            }
            child.material.color.copy(child.material.userData.mischiefBaseColour).multiply(tint);
          });
        },
      };
      syncPick();
      this.mischiefTargets.push(target);
    }

    // Ice-cream truck(s): stages 1–2 slide the live van side-to-side; stage 3 → ice-cream cones.
    const vans = water?.beachIcecreamRecords ?? [];
    for (const rec of vans) {
      if (!rec?.group) continue;
      const group = rec.group;
      group.userData.mischiefBatchOwner = true;
      group.userData.mischiefLive = true;
      const baseScale = rec.baseScale ?? group.scale.x ?? 1;
      const baseYaw = group.rotation.y;
      const baseX = group.position.x;
      const baseY = group.position.y;
      const baseZ = group.position.z;
      const size = new THREE.Vector3(4.6, 3.6, 2.4);
      const modelId = rec.modelId ?? 'ice-cream-truck';
      const label = furnitureLabel(modelId, rec.key);
      // Leave voxelKit null so stage-3 uses the ice-cream-on-cones kit in mischief.js.
      const pickProxy = this._makeMischiefPickProxy(
        rec.key,
        new THREE.Vector3(baseX, 0, baseZ),
        size,
        { kind: 'prop', label },
      );
      const syncPick = () => {
        pickProxy.position.set(group.position.x, size.y * 0.4, group.position.z);
        pickProxy.rotation.y = baseYaw;
      };
      const target = {
        renderBinding: { group },
        key: rec.key,
        kind: 'prop',
        model: modelId,
        label,
        size,
        voxelKit: null,
        pickProxy,
        getPose: () => ({
          // Scatter cones from the van's last slid position, upright yaw.
          position: group.position.clone(),
          quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), baseYaw),
        }),
        setOriginal: ({ visible = true, scale = 1, slide = 0, swayX = 0, swayZ = 0 } = {}) => {
          group.visible = visible;
          setBatchedVisibility(group, visible);
          // Keep a tiny scale when hidden so getPose still reads a valid transform;
          // visibility alone removes the mesh from the frame.
          group.scale.setScalar(baseScale * Math.max(0.001, visible ? scale : 0.001));
          // Upright yaw; slide along local +Z (van width = side-to-side).
          const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), baseYaw);
          const swayQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(swayX, 0, swayZ, 'XZY'));
          group.quaternion.copy(yawQ).multiply(swayQ);
          const sx = Math.sin(baseYaw) * slide;
          const sz = Math.cos(baseYaw) * slide;
          group.position.set(baseX + sx, baseY, baseZ + sz);
          syncPick();
        },
        setVariant: (variant) => {
          const tint = new THREE.Color(variant % 2 ? '#ffb6c8' : '#ffffff');
          group.traverse((child) => {
            if (!child.isMesh || !child.material?.color) return;
            if (!child.material.userData.mischiefBaseColour) {
              child.material.userData.mischiefBaseColour = child.material.color.clone();
            }
            child.material.color.copy(child.material.userData.mischiefBaseColour).multiply(tint);
          });
        },
      };
      syncPick();
      this.mischiefTargets.push(target);
    }

    // Lifeguard tower(s) — same group hide + voxel tip/scatter path as umbrellas.
    const towers = water?.beachLifeguardRecords ?? [];
    for (const rec of towers) {
      if (!rec?.group) continue;
      const group = rec.group;
      group.userData.mischiefBatchOwner = true;
      const baseScale = rec.baseScale ?? group.scale.x ?? 1;
      const size = new THREE.Vector3(3.0, 5.8, 3.4);
      const modelId = rec.modelId ?? 'lifeguard-tower';
      const label = furnitureLabel(modelId, rec.key);
      // Prefer voxels from the live tower meshes; fall back to authored kit in mischief.js.
      // Mesh AABBs are in local unscaled space — multiply by baseScale so tip pieces match.
      const meshes = [];
      group.traverse((child) => {
        if (child.isMesh) meshes.push(child);
      });
      let voxelKit = voxelKitFromMeshes(meshes, { minParts: 8, maxParts: 22 });
      if (voxelKit?.length && baseScale !== 1) {
        voxelKit = voxelKit.map((piece) => ({
          position: piece.position.clone().multiplyScalar(baseScale),
          scale: piece.scale.clone().multiplyScalar(baseScale),
          colour: piece.colour.clone(),
          rotation: piece.rotation?.clone?.() ?? null,
        }));
      }
      if (voxelKit) voxelKit.settle = {
        halfX: 3.2, halfZ: 3.4, height: size.y, radius: 2.6, depth: 2.8, flatPieces: true,
      };
      const pickProxy = this._makeMischiefPickProxy(
        rec.key,
        new THREE.Vector3(rec.x ?? group.position.x, 0, rec.z ?? group.position.z),
        size,
        { kind: 'prop', label },
      );
      const syncPick = () => {
        pickProxy.position.set(group.position.x, size.y * 0.42, group.position.z);
        pickProxy.rotation.y = group.rotation.y;
      };
      const target = {
        renderBinding: { group },
        key: rec.key,
        kind: 'prop',
        model: modelId,
        label,
        size,
        voxelKit,
        pickProxy,
        getPose: () => ({
          position: group.position.clone(),
          quaternion: group.quaternion.clone(),
        }),
        setOriginal: ({ visible = group.visible, scale = 1, swayX = 0, swayZ = 0 } = {}) => {
          group.visible = visible;
          setBatchedVisibility(group, visible);
          // Preserve authored tower scale (1.18) under mischief growth.
          group.scale.setScalar(baseScale * (visible ? scale : 0));
          if (!group.userData.mischiefBaseQuat) {
            group.userData.mischiefBaseQuat = group.quaternion.clone();
          }
          const swayQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(swayX, 0, swayZ, 'XZY'));
          group.quaternion.copy(group.userData.mischiefBaseQuat).multiply(swayQ);
          syncPick();
        },
        setVariant: (variant) => {
          const tint = new THREE.Color(variant % 2 ? '#f0d060' : '#ffffff');
          group.traverse((child) => {
            if (!child.isMesh || !child.material?.color) return;
            if (!child.material.userData.mischiefBaseColour) {
              child.material.userData.mischiefBaseColour = child.material.color.clone();
            }
            child.material.color.copy(child.material.userData.mischiefBaseColour).multiply(tint);
          });
        },
      };
      syncPick();
      this.mischiefTargets.push(target);
    }
  }

  /**
   * Traffic cars as mischief targets (R30). Pick proxies track fleet poses;
   * tip uses voxel car kit; live cars crash-stop when tipped.
   * @param {import('./traffic.js').default | null} traffic
   */
  registerTrafficMischief(traffic) {
    // Core furniture registers inside its builder; give those adapters the
    // same batch visibility bridge before scene batching runs.
    for (const item of this.coreLayer?.toys?.items ?? []) {
      const target = this.mischiefTargets.find((t) => t.key === item.key);
      if (!target || target.renderBinding) continue;
      target.renderBinding = { group: item.group };
      item.group.userData.mischiefBatchOwner = true;
      if (target.kind === 'opening') item.group.userData.mischiefLive = true;
      const setOriginal = target.setOriginal;
      target.setOriginal = (pose = {}) => {
        setOriginal(pose);
        setBatchedVisibility(item.group, item.group.visible);
      };
    }
    // Keep a live handle: the bus fleet follows the cars through it and publishes itself
    // back to them via TrafficLayer.registerObstacleProvider. Trams publish the same way
    // so cars yield when a tram is ahead or crossing — not for one in the reservation.
    this.traffic = traffic ?? null;
    publishAgendaTransit(this.city, () => (this.trams ?? [])
      .filter(tram => !tram.mischiefStopped).map(tram => tramCapability(tram, this.city)));
    if (traffic && typeof traffic.registerObstacleProvider === 'function') {
      if (this._tramObstacleUnsub) this._tramObstacleUnsub();
      this._tramObstacleUnsub = traffic.registerObstacleProvider(() => {
        const out = [];
        for (const tram of this.trams ?? []) {
          if (!tram?.group || tram.mischiefStopped) continue;
          out.push({
            x: tram.group.position.x,
            z: tram.group.position.z,
            yaw: tram.yaw ?? 0,
            halfLength: tram.halfLength ?? 7.0,
            halfWidth: tram.halfWidth ?? 1.33,
            speed: tram.speed ?? 0,
            kind: 'tram',
          });
        }
        return out;
      });
    }
    this._registerBusMischiefTargets();
    const vehicles = traffic?.vehicles ?? traffic?.fleet ?? [];
    if (!vehicles.length) return;
    traffic._mischiefProxies = [];
    for (let i = 0; i < vehicles.length; i += 1) {
      const car = vehicles[i];
      const key = `prop:traffic-car:${i}`;
      const pack = traffic.byType?.[car.bodyType];
      const bounds = pack?.body.geometry;
      if (bounds && !bounds.boundingBox) bounds.computeBoundingBox();
      const size = bounds?.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(2.0, 1.5, 4.4);
      // Include the cabin above the hull; cars need their full length, unlike furniture.
      if (pack?.cabin.geometry) {
        pack.cabin.geometry.computeBoundingBox();
        size.y = Math.max(size.y, pack.cabin.geometry.boundingBox.max.y);
      }
      const label = furnitureLabel('traffic-car', key);
      const pickProxy = this._makeMischiefPickProxy(
        key,
        new THREE.Vector3(0, 0, 0),
        size,
        { kind: 'prop', label },
      );
      const state = { visible: true, growth: 1 };
      pickProxy.scale.copy(size);
      const syncPick = () => {
        pickProxy.position.set(car.worldX ?? 0, size.y / 2, car.worldZ ?? 0);
        pickProxy.rotation.y = car.yaw ?? 0;
        // Raycasting reads matrixWorld, even between rendered frames.
        pickProxy.updateWorldMatrix(true, false);
      };
      syncPick();
      const target = {
        renderBinding: { car },
        key,
        kind: 'prop',
        model: 'traffic-car',
        userData: car.userData,
        label,
        size,
        pickProxy,
        get carColours() {
          // Read the drawn instance × material, including the red tail-lamp
          // instance (its shared material is white) and the paint multiplier.
          const slot = vehicles.slice(0, i).filter(other => other.bodyType === car.bodyType).length;
          const drawn = (mesh, fallback) => {
            if (!mesh?.material?.color) return fallback;
            const colour = mesh.material.color.clone();
            if (mesh.instanceColor) colour.multiply(new THREE.Color().fromBufferAttribute(mesh.instanceColor, slot));
            return colour;
          };
          return {
            body: drawn(pack?.body, car.color),
            glass: drawn(pack?.cabin, traffic.materials?.glass?.color),
            trim: drawn(pack?.trim, traffic.materials?.trim?.color),
            tyre: traffic.wheels?.material?.color,
            headLamp: drawn(pack?.headlamps, traffic.materials?.headLamp?.color),
            tailLamp: drawn(pack?.taillamps, traffic.materials?.tailLamp?.color),
          };
        },
        getPose: () => ({
          position: new THREE.Vector3(car.worldX ?? 0, 0, car.worldZ ?? 0),
          quaternion: new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            car.yaw ?? 0,
          ),
        }),
        setOriginal: ({ visible = state.visible, scale = state.growth } = {}) => {
          state.visible = visible;
          state.growth = scale;
          car.mischiefHidden = !visible || scale < 0.05;
          car.mischiefScale = scale;
        },
        setStopped: (on) => {
          if (on && !car.mischiefStopped) {
            car.mischiefPose = { x: car.worldX, z: car.worldZ, yaw: car.yaw };
            car.speed = 0;
            car.accel = 0;
          }
          car.mischiefStopped = on;
          if (!on) car.mischiefPose = null;
        },
        setSway: ({ x = 0, z = 0 } = {}) => {
          car.mischiefSwayX = x;
          car.mischiefSwayZ = z;
        },
        setVariant: () => {},
      };
      this.mischiefTargets.push(target);
      traffic._mischiefProxies.push({ proxy: pickProxy, car, target, syncPick });
    }
    const prevUpdate = traffic.update.bind(traffic);
    traffic.update = (dt, elapsed = null) => {
      // Flow simulation has no crash branch. Remove hidden cars from its active
      // view while retaining vehicles for the shared opaque zero-scale draw path.
      const flow = traffic.flowFleet;
      if (flow?.some((car) => car.mischiefHidden && !car.mischiefStopped)) {
        traffic.flowFleet = flow.filter((car) => !car.mischiefHidden || car.mischiefStopped);
        try { prevUpdate(dt, elapsed); } finally { traffic.flowFleet = flow; }
      } else prevUpdate(dt, elapsed);
      for (const entry of traffic._mischiefProxies ?? []) {
        entry.syncPick();
      }
    };
  }

  registerFoliageMischiefTargets(foliage) {
    const records = foliage?.mischiefTreeRecords ?? [];
    // Central-reserve trees first so park mischief is never starved by the street cap.
    const ordered = [...records].sort((a, b) => {
      const ar = a.zone === 'reserve' ? 0 : 1;
      const br = b.zone === 'reserve' ? 0 : 1;
      return ar - br;
    });
    const cap = 240;
    for (let i = 0; i < ordered.length; i += 1) {
      if (this.mischiefTargets.filter((t) => t.kind === 'tree').length >= cap) break;
      const rec = ordered[i];
      if (!rec?.mesh) continue;
      const h = rec.height ?? 10;
      const basePlacement = {
        position: new THREE.Vector3(rec.x, 0, rec.z),
        quaternion: new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          rec.rotation ?? 0,
        ),
        scale: (() => {
          if (rec.baseMatrix) {
            const s = new THREE.Vector3();
            rec.baseMatrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
            return s;
          }
          return new THREE.Vector3(h * 0.45, h, h * 0.45);
        })(),
      };
      const meshes = [rec.mesh, rec.trunkMesh].filter(Boolean);
      // Pick size is logical only (proxy clamps in _makeMischiefPickProxy).
      // Do NOT multiply by huge foliage scale — that made some trees look gigantic.
      const pickW = rec.zone === 'reserve' ? 2.6 : 2.0;
      this._registerStaticMischiefTarget({
        key: rec.key,
        kind: 'tree',
        modelId: rec.modelId ?? rec.speciesId ?? 'tree',
        model: { size: new THREE.Vector3(pickW, Math.min(h, 12), pickW) },
        meshes,
        index: rec.instanceIndex,
        basePlacement,
        preserveFoliageMatrix: true,
        // The foliage layer measures its own damaged crown per instance; see
        // `damagedCrownKit` in foliage.js.
        voxelKit: rec.voxelKit ?? null,
      });
      const target = this.mischiefTargets[this.mischiefTargets.length - 1];
      if (target) {
        target.canopyColour = foliage.getCanopyColour?.(rec.speciesId, rec.instanceIndex);
        target.setSway = ({ x = 0, z = 0, energy = 0 } = {}) => {
          foliage.setTapSway?.(rec.speciesId, rec.instanceIndex, { x, z, energy });
        };
        target.setFall = ({ angle = 0, heading = 0 } = {}) => {
          foliage.setFall?.(rec.speciesId, rec.instanceIndex, { angle, heading });
        };
        target.resolveFallHeading = () => (
          Number.isFinite(rec.corridorFallHeading) ? rec.corridorFallHeading : null
        );
        target.setDamageLevel = (level) => {
          foliage.setDamageLevel?.(rec.speciesId, rec.instanceIndex, level);
        };
        target.setDamaged = (damaged) => {
          foliage.setDamaged?.(rec.speciesId, rec.instanceIndex, Boolean(damaged));
        };
      }
    }
  }

  _registerTramMischiefTarget(tram, modelId, transitIndex) {
    const { group, item } = tram;
    const size = new THREE.Vector3(
      modelId === 'e-class-tram' ? 16.5 : 13.9,
      modelId === 'e-class-tram' ? 3.60 : 3.28,
      modelId === 'e-class-tram' ? 2.65 : 2.67,
    );
    const key = `tram:${transitIndex}:${item.axis}`;
    const label = furnitureLabel(modelId, key);
    const pickProxy = this._makeMischiefPickProxy(key, group.position, size, { kind: 'tram', label });
    // Authored livery kit in mischief.js — GLB AABBs read as one grey box.
    const syncPick = () => {
      pickProxy.position.set(group.position.x, group.position.y + size.y / 2, group.position.z);
      pickProxy.rotation.copy(group.rotation);
    };
    const linePose = (progress) => {
      const along = item.from + (item.to - item.from) * progress;
      const position = item.axis === 'v'
        ? new THREE.Vector3(item.x, 0.16, along)
        : new THREE.Vector3(along, 0.16, item.z);
      const quaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        (item.axis === 'v' ? 90 : 0) * DEG,
      );
      return { position, quaternion };
    };
    const target = {
      key,
      kind: 'tram',
      renderBinding: { group },
      model: modelId,
      label,
      size,
      voxelKit: null,
      pickProxy,
      linePose,
      syncPick,
      getPose: () => ({
        position: group.position.clone(),
        quaternion: group.quaternion.clone(),
      }),
      setStopped: (on) => { tram.mischiefStopped = on; },
      setOriginal: ({
        visible = group.visible, scale = group.scale.x, slide = tram.mischiefSlide ?? 0,
        swayX = 0, swayZ = 0,
      } = {}) => {
        group.visible = visible;
        group.scale.setScalar(scale);
        tram.mischiefSlide = slide;
        // Tram animation writes heading (Y) each frame and leaves X/Z alone.
        group.rotation.x = swayX;
        group.rotation.z = swayZ;
        syncPick();
      },
      setVariant: (variant) => {
        const tint = new THREE.Color(variant % 2 ? '#d3c262' : '#ffffff');
        group.traverse((child) => {
          if (!child.isMesh || !child.material?.color) return;
          const base = child.material.userData.mischiefBaseColour;
          child.material.color.copy(base ?? WHITE).multiply(tint);
        });
      },
    };
    tram.mischiefTarget = target;
    syncPick();
    this.mischiefTargets.push(target);
  }

  _registerBusMischiefTargets() {
    const fleet = this.interchangeBusFleet;
    const buses = fleet?.buses ?? this.interchangeBuses ?? [];
    for (let i = 0; i < buses.length; i += 1) {
      const bus = buses[i];
      const mesh = bus?.mesh;
      if (!mesh) continue;
      const size = new THREE.Vector3(2.64, 3.37, 8.60);
      const key = `bus:interchange:${bus.civicId ?? i}`;
      const label = furnitureLabel('route-bus', key);
      const pickProxy = this._makeMischiefPickProxy(key, mesh.position, size, { kind: 'bus', label });
      const syncPick = () => {
        pickProxy.position.set(mesh.position.x, mesh.position.y + size.y / 2, mesh.position.z);
        pickProxy.rotation.copy(mesh.rotation);
      };
      const target = {
        key,
        kind: 'bus',
        renderBinding: { group: mesh },
        model: 'route-bus',
        label,
        size,
        voxelKit: null,
        pickProxy,
        syncPick,
        getPose: () => ({
          position: mesh.position.clone(),
          quaternion: mesh.quaternion.clone(),
        }),
        setStopped: (on) => { bus.mischiefStopped = on; },
        setOriginal: ({
          visible = mesh.visible, scale = 1, slide = bus.mischiefSlide ?? 0,
          swayX = 0, swayZ = 0,
        } = {}) => {
          mesh.visible = visible;
          mesh.scale.setScalar(Math.max(0.001, visible ? scale : 0.001));
          bus.mischiefSlide = slide;
          bus.mischiefSwayX = swayX;
          bus.mischiefSwayZ = swayZ;
          syncPick();
        },
        setVariant: () => {},
      };
      bus.mischiefTarget = target;
      bus.mischiefStopped = false;
      bus.mischiefSlide = 0;
      bus.mischiefSwayX = 0;
      bus.mischiefSwayZ = 0;
      syncPick();
      this.mischiefTargets.push(target);
    }
  }

  // --- state-driven overlays ------------------------------------------------

  /**
   * A plinth under every parcel: quiet when unowned, amber or blue when held.
   * Quiet and loud layers are separate meshes (instance colour cannot vary opacity);
   * an instance is scaled to zero in the layer it does not belong to.
   * R2: both layers are opaque with depthWrite so they never ghost façades.
   * Quiet unowned pads stay very thin and low so default city reads solid.
   */
  _buildOwnershipOverlay() {
    if (this.plinthQuiet) {
      this.root.remove(this.plinthQuiet, this.plinthOwned);
      this.plinthQuiet.geometry.dispose();
      // Library materials are shared — MaterialLibrary.dispose owns them.
      if (!isSharedLibraryMaterial(this.plinthQuiet.material)) this.plinthQuiet.material.dispose();
      if (!isSharedLibraryMaterial(this.plinthOwned.material)) this.plinthOwned.material.dispose();
    }
    this.parcelIndex.clear();
    const ids = this._order();
    // R16: taller owned plinth so amber/blue token pads read under street-oblique.
    const geometry = new THREE.BoxGeometry(1, 0.36, 1);
    const makeLayer = (variant, receiveShadow) => {
      // Opaque concrete — colour is instance-driven. No transparent:true (R1 ghosting).
      const mat = this.materials.get('concrete', {
        variant: `plinth-owner-${variant}-r15`,
        color: '#ffffff',
        roughness: 0.62,
        metalness: 0.08,
      });
      mat.depthWrite = true;
      mat.transparent = false;
      const mesh = new THREE.InstancedMesh(
        geometry,
        mat,
        ids.length,
      );
      mesh.receiveShadow = receiveShadow;
      mesh.castShadow = variant === 'owned';
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      this.root.add(mesh);
      return mesh;
    };

    this.plinthQuiet = makeLayer('quiet', false);
    this.plinthOwned = makeLayer('owned', true);
    // Ownership is outlined by EventOverlayLayer; no full-pad draw or shadow instances.
    this.plinthOwned.count = 0;
    // Unowned pads are hidden in default view — ownership colour only when held.
    // Avoids a semi-transparent city carpet under every building (critic R1).
    this.plinthQuiet.visible = false;
    this.plinthScales = [];

    ids.forEach((id, index) => {
      const parcel = this._parcel(id);
      // groundFootprint is already expressed in world axes, so no swap here.
      const [fx, fz] = parcel.groundFootprint ?? parcel.footprint;
      // Proud of footprint so the ownership rim peeks past façades (board-token read).
      this.plinthScales.push(new THREE.Vector3(fx * TILE - 0.45, 1, fz * TILE - 0.45));
      this.parcelIndex.set(id, index);
      this.plinthQuiet.setColorAt(index, OWNER_COLOURS.none);
      this.plinthOwned.setColorAt(index, OWNER_COLOURS.player);
    });
    this._writePlinths(null);
  }

  /** Place each parcel in exactly one plinth layer; the other gets a zero-scale slot. */
  _writePlinths(state) {
    const matrix = new THREE.Matrix4();
    const zero = new THREE.Vector3(0, 0, 0);
    const rotation = new THREE.Quaternion();
    this._order().forEach((id, index) => {
      const parcel = this._parcel(id);
      const owner = state ? viewerOwner(state, id, this.viewerSeatId) : null;
      // Lift owned pads so amber/blue rims clear the road kerb.
      const position = new THREE.Vector3(parcel.centre.x, owner ? 0.2 : 0.055, parcel.centre.z);
      const scale = this.plinthScales[index];

      matrix.compose(position, rotation, owner ? zero : scale);
      this.plinthQuiet.setMatrixAt(index, matrix);
      matrix.compose(position, rotation, owner ? scale : zero);
      this.plinthOwned.setMatrixAt(index, matrix);
      if (owner) this.plinthOwned.setColorAt(index, OWNER_COLOURS[owner]);
    });
    for (const mesh of [this.plinthQuiet, this.plinthOwned]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Invisible pick volumes as one InstancedMesh (unit box + per-instance scale).
   * Raycast hits carry instanceId → pickRecords[kind,id]. Tests may still inject
   * plain Mesh proxies into pickTargets; pickLayers supports both paths.
   */
  _buildPickTargets() {
    if (this.pickGroup) {
      this.root.remove(this.pickGroup);
      this.pickGroup.traverse((child) => {
        child.geometry?.dispose();
        if (child.material && !isSharedLibraryMaterial(child.material)) {
          child.material.dispose();
        }
      });
    }
    this.pickTargets = [];
    this.pickRecords = [];
    const records = [];
    const push = (kind, id, entity, width, depth, height) => {
      records.push({
        kind,
        id,
        x: entity.centre.x,
        y: height / 2,
        z: entity.centre.z,
        sx: width,
        sy: height,
        sz: depth,
      });
    };
    for (const id of this._order()) {
      const parcel = this._parcel(id);
      const [fx, fz] = parcel.groundFootprint ?? parcel.footprint;
      push(
        'parcel',
        id,
        parcel,
        fx * TILE - 0.6,
        fz * TILE - 0.6,
        Math.max(4, parcel.storeys * STOREY),
      );
    }
    for (const civic of this.city.civicUses ?? []) {
      const [fx, fz] = civic.groundFootprint ?? civic.footprint;
      push(
        'civic',
        civic.id,
        civic,
        fx * TILE - 0.6,
        fz * TILE - 0.6,
        Math.max(4, civic.storeys * STOREY),
      );
    }
    if (this.city.reserve) {
      push('reserve', this.city.reserve.id, this.city.reserve, BLOCK, BLOCK, 8);
    }

    const group = new THREE.Group();
    group.name = 'pick';
    if (!records.length) {
      this.pickRecords = [];
      this.root.add(group);
      this.pickGroup = group;
      return;
    }

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ visible: false });
    const mesh = new THREE.InstancedMesh(geometry, material, records.length);
    mesh.name = 'pick:strategic';
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.userData.pickInstanced = true;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    records.forEach((rec, index) => {
      position.set(rec.x, rec.y, rec.z);
      scale.set(rec.sx, rec.sy, rec.sz);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = records.length;
    group.add(mesh);
    this.root.add(group);
    this.pickGroup = group;
    this.pickRecords = records.map(({ kind, id }) => ({ kind, id }));
    this.pickTargets = [mesh];
  }

  _buildSelection() {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(TILE * 0.52, TILE * 0.56, 48),
      new THREE.MeshBasicMaterial({
        color: '#c5a15f', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    ring.name = 'vfx:selection-ring';
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.3;
    ring.visible = false;
    ring.renderOrder = 5;
    // Keep the authored footprint/pulse; cap the inward fill at six CSS pixels.
    // Derivatives follow the actual draw projection, including the capped post target.
    const renderToCss = { value: new THREE.Vector2(1, 1) };
    const viewport = new THREE.Vector4();
    const cssSize = new THREE.Vector2();
    const beforeRender = ring.onBeforeRender;
    ring.onBeforeRender = function(renderer, scene, camera, geometry, material, group) {
      const result = beforeRender.call(this, renderer, scene, camera, geometry, material, group);
      renderer.getCurrentViewport(viewport);
      renderer.getSize(cssSize);
      renderToCss.value.set(viewport.z / Math.max(1, cssSize.x), viewport.w / Math.max(1, cssSize.y));
      return result;
    };
    const beforeCompile = ring.material.onBeforeCompile;
    const beforeCacheKey = ring.material.customProgramCacheKey;
    const insert = (source, anchor, addition) => {
      const at = source.indexOf(anchor);
      if (at < 0 || source.indexOf(anchor, at + anchor.length) >= 0) {
        throw new Error('Selection ring shader seam changed: ' + anchor);
      }
      return source.replace(anchor, anchor + '\n' + addition);
    };
    ring.material.onBeforeCompile = function(shader, renderer) {
      const result = beforeCompile.call(this, shader, renderer);
      shader.uniforms.uDdSelectionRenderToCss = renderToCss;
      shader.vertexShader = insert(shader.vertexShader, '#include <common>', 'varying float vDdSelectionInset;');
      shader.vertexShader = insert(shader.vertexShader, '#include <begin_vertex>',
        `vDdSelectionInset = max(0.0, ${(TILE * 0.56).toFixed(8)} - length(position.xy));`);
      shader.fragmentShader = insert(shader.fragmentShader, '#include <common>',
        'varying float vDdSelectionInset;\nuniform vec2 uDdSelectionRenderToCss;');
      shader.fragmentShader = insert(shader.fragmentShader, '#include <clipping_planes_fragment>', `
        vec2 ddInsetPerCssPixel = vec2(dFdx(vDdSelectionInset), dFdy(vDdSelectionInset)) * uDdSelectionRenderToCss;
        if (vDdSelectionInset > 6.0 * length(ddInsetPerCssPixel)) discard;
      `);
      return result;
    };
    ring.material.customProgramCacheKey = function() {
      return beforeCacheKey.call(this) + '|dd-selection-screen-width-r1';
    };
    // R14: selection ring only — beam was washing architecture as a hot pink bloom column.
    this.selectionRing = ring;
    this.root.add(ring);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 60, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: '#f0d9a8', transparent: true, opacity: 0.16, depthWrite: false }),
    );
    beam.position.y = 30;
    beam.visible = false;
    this.selectionBeam = beam;
    this.root.add(beam);
  }

  /**
   * Two instanced draws total: a ground ring at each contributing emitter and one thin
   * leader from the selected receiver. Hidden entirely under reduced motion.
   */
  _buildAmenityAffordance() {
    if (this.amenityMarkers) {
      for (const mesh of [this.amenityMarkers, this.amenityLeaders]) {
        this.root.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
    const capacity = Math.max(
      1,
      ...this._order().map((id) => this._parcel(id).amenityMarkers?.length ?? 0),
    );
    const markerGeometry = new THREE.RingGeometry(1.8, 2.7, 24);
    markerGeometry.rotateX(-Math.PI / 2);
    const leaderGeometry = new THREE.BoxGeometry(1, 0.045, 1);
    const material = new THREE.MeshBasicMaterial({
      color: '#ddd4c0',
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    this.amenityMarkers = new THREE.InstancedMesh(markerGeometry, material, capacity);
    this.amenityLeaders = new THREE.InstancedMesh(leaderGeometry, material.clone(), capacity);
    for (const mesh of [this.amenityMarkers, this.amenityLeaders]) {
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      this.root.add(mesh);
    }
  }

  _drawAmenityAffordance(parcel) {
    if (!this.amenityMarkers || !this.amenityLeaders) return;
    const entries = parcel?.amenityMarkers ?? [];
    const visible = this.activeLens === 'amenity' && !this.reducedMotion && entries.length > 0;
    this.amenityMarkers.visible = visible;
    this.amenityLeaders.visible = visible;
    this.amenityMarkers.count = visible ? entries.length : 0;
    this.amenityLeaders.count = visible ? entries.length : 0;
    if (!visible) return;

    const matrix = new THREE.Matrix4();
    const neutral = new THREE.Quaternion();
    entries.forEach((entry, index) => {
      matrix.compose(
        new THREE.Vector3(entry.x, 0.37, entry.z),
        neutral,
        new THREE.Vector3(1, 1, 1),
      );
      this.amenityMarkers.setMatrixAt(index, matrix);

      const dx = entry.x - parcel.centre.x;
      const dz = entry.z - parcel.centre.z;
      const length = Math.max(0.01, Math.hypot(dx, dz));
      const rotation = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.atan2(dx, dz),
      );
      matrix.compose(
        new THREE.Vector3(
          (entry.x + parcel.centre.x) / 2,
          0.35,
          (entry.z + parcel.centre.z) / 2,
        ),
        rotation,
        new THREE.Vector3(0.16, 1, length),
      );
      this.amenityLeaders.setMatrixAt(index, matrix);
    });
    this.amenityMarkers.instanceMatrix.needsUpdate = true;
    this.amenityLeaders.instanceMatrix.needsUpdate = true;
  }

  _buildCorridors() {
    this.corridorGroup = new THREE.Group();
    this.corridorGroup.name = 'corridors';
    this.root.add(this.corridorGroup);

    // A corridor is the whole point of the game, and it was being communicated by a
    // one-pixel line. It is now a ribbon on the ground with a soft falloff across its
    // width, plus a marker on every unowned parcel that would extend one.
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.34, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.66, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    this.ribbonTexture = new THREE.CanvasTexture(canvas);
    this.ribbonGeometry = new THREE.PlaneGeometry(1, 1);
    this.ribbonGeometry.rotateX(-Math.PI / 2);

    this.extendGroup = new THREE.Group();
    this.extendGroup.name = 'corridor-invitations';
    this.root.add(this.extendGroup);
    this.extendGeometry = new THREE.RingGeometry(TILE * 0.30, TILE * 0.37, 4, 1);
    this.extendMaterial = new THREE.MeshBasicMaterial({
      color: '#d8a24a', transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false,
    });
  }

  /** Parcels that are not yours but sit beside one that is: the next move, marked. */
  _drawInvitations(state) {
    if (!this.extendGroup) return;
    for (const child of this.extendGroup.children.slice()) this.extendGroup.remove(child);
    if (this.activeLens !== 'corridor') return;
    const candidates = new Set();
    for (const [id, holding] of Object.entries(state.holdings)) {
      if (holding.ownerSeatId !== this.viewerSeatId) continue;
      for (const neighbour of this._adjacency(id)) {
        if (!state.holdings[neighbour]) candidates.add(neighbour);
      }
    }
    for (const id of candidates) {
      const parcel = this._parcel(id);
      if (!parcel) continue;
      const ring = new THREE.Mesh(this.extendGeometry, this.extendMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.rotation.z = Math.PI / 4;
      ring.position.set(parcel.centre.x, 0.20, parcel.centre.z);
      ring.scale.setScalar(Math.max(...(parcel.groundFootprint ?? parcel.footprint)));
      ring.renderOrder = 3;
      this.extendGroup.add(ring);
    }
  }

  /** Markers over the parcels the rival has announced it will take. */
  _buildRivalMarkers() {
    this.rivalGroup = new THREE.Group();
    this.rivalGroup.name = 'rival-intent';
    this.root.add(this.rivalGroup);
    this.rivalMarkerGeometry = new THREE.RingGeometry(TILE * 0.30, TILE * 0.40, 4);
    // R13: quiet diamonds — architecture must win the plate; intent still readable.
    this.rivalMarkerMaterial = new THREE.MeshBasicMaterial({
      color: rivalColours().ring, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false,
    });
  }

  setRivalIntent(parcelIds = []) {
    if (!this.rivalGroup) return;
    this.rivalMarkerMaterial.color.set(rivalColours().ring);
    for (const child of this.rivalGroup.children.slice()) this.rivalGroup.remove(child);
    parcelIds.forEach((id, order) => {
      const parcel = this._parcel(id);
      if (!parcel) return;
      const marker = new THREE.Mesh(this.rivalMarkerGeometry, this.rivalMarkerMaterial);
      marker.rotation.x = -Math.PI / 2;
      marker.rotation.z = Math.PI / 4;
      marker.position.set(parcel.centre.x, 0.34, parcel.centre.z);
      marker.scale.setScalar(Math.max(...(parcel.groundFootprint ?? parcel.footprint)) * 0.85);
      marker.renderOrder = 4;
      this.rivalGroup.add(marker);

      // First move only gets a pip; later targets stay diamond-only (ordered plan).
      if (order === 0) {
        const pip = new THREE.Mesh(
          new THREE.RingGeometry(0.7, 1.4, 16),
          new THREE.MeshBasicMaterial({
            color: rivalColours().ring,
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        pip.rotation.x = -Math.PI / 2;
        pip.position.set(parcel.centre.x, 0.36, parcel.centre.z);
        pip.renderOrder = 5;
        this.rivalGroup.add(pip);
      }
    });
  }

  /** Every resolving event gets a board-space forecast before settlement. */
  _buildEventMarkers() {
    this.eventGroup = new THREE.Group();
    this.eventGroup.name = 'event-forecasts';
    this.root.add(this.eventGroup);
    this.eventRingGeometry = new THREE.RingGeometry(TILE * 0.34, TILE * 0.48, 32);
    this.eventPinGeometry = new THREE.ConeGeometry(1.4, 4.6, 12);
  }

  setEventForecasts(events) {
    if (!this.eventGroup) return;
    for (const child of this.eventGroup.children.slice()) {
      child.material?.dispose();
      this.eventGroup.remove(child);
    }
    const visible = [...(events?.order ?? [])].sort()
      .map((id) => events.byId[id])
      .filter((event) =>
        event.status !== 'resolved'
        && event.status !== 'cancelled'
        && event.forecast?.decal);
    for (const event of visible) {
      for (const parcelId of [...event.anchorIds].sort()) {
        const parcel = this._parcel(parcelId);
        if (!parcel) continue;
        const colour = event.type === 'auction'
          ? '#f2b84b'
          : ['fire', 'flash-flood'].includes(event.type) ? '#ed6a5a' : '#b08cff';
        const material = new THREE.MeshBasicMaterial({
          color: colour,
          transparent: true,
          opacity: 0.82,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(this.eventRingGeometry, material);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(parcel.centre.x, 0.39, parcel.centre.z);
        ring.scale.setScalar(Math.max(...(parcel.groundFootprint ?? parcel.footprint)));
        ring.renderOrder = 6;
        ring.userData.eventId = event.id;
        this.eventGroup.add(ring);
        const pin = new THREE.Mesh(this.eventPinGeometry, material.clone());
        pin.position.set(parcel.centre.x, 6.5, parcel.centre.z);
        pin.rotation.z = Math.PI;
        pin.renderOrder = 6;
        pin.userData.eventId = event.id;
        this.eventGroup.add(pin);
      }
    }
  }

  _conditionTint(id, condition) {
    const colour = tintFor(id);
    const factors = [0.76, 1, 1.10];
    colour.multiplyScalar(factors[condition] ?? 1);
    return colour;
  }

  /**
   * `archetypeId` is the archetype being DRAWN. It defaults to the parcel's own, which is what
   * every caller before V3.71 assumed — but `_createBuildingGroup` is handed the post-redevelop
   * id by `_syncDynamicBuildings`, and it is that model, not the one the parcel was dealt, whose
   * span and yaw this transform has to describe.
   */
  _buildingPlacement(id, archetypeId = undefined, slot = undefined) {
    const parcel = this._parcel(id) ?? this._baseParcel(id);
    const view = slot
      ? (slotParcelView(this.city, this.lastState, id, slot) ?? parcel)
      : parcel;
    const place = parcelBuildingTransform(view, archetypeId ?? view?.archetypeId ?? parcel?.archetypeId);
    return placement(
      view.centre.x + place.modelOffset.x,
      0,
      view.centre.z + place.modelOffset.z,
      place.rotation,
      place.modelScale,
    );
  }

  _createBuildingGroup(id, archetypeId, condition, storeys = null, signText = null, slot = null) {
    const parcel = (slot
      ? slotParcelView(this.city, this.lastState, id, slot)
      : null)
      ?? this._parcel(id)
      ?? this._baseParcel(id);
    // This is the path a renovation actually travels: `_syncDynamicBuildings` disposes and
    // rebuilds a building whose condition has changed, so the tier has to reach the kit here or
    // the new group is the old geometry with a fresh tint on it.
    const isIndustrial = INDUSTRIAL_KIT_IDS.has(archetypeId);
    // Same derivation the placement below uses, so the model is built to the span the yaw was
    // chosen against. Taking these from two places is the V3.71 Lane E fault in miniature.
    const lotSpan = parcelBuildingTransform(parcel, archetypeId).lotSpan;
    const conditionTier = isIndustrial
      ? tierFromCondition(condition, this._renovationStarted(id))
      : null;
    const kitStoreys = storeys
      ?? (archetypeId === 'hammerbarn' && this.lastState && levelOf(this.lastState, id) >= 1
        ? 2
        : null);
    const hand = HANDED_SHOPS.has(archetypeId) ? handForParcel(parcel) : null;
    const model = this._modelFor(
      archetypeId,
      parcel?.districtId,
      deterministicFacade(id),
      lotSpan,
      conditionTier,
      hand,
      kitStoreys,
      signText,
    ) ?? this.registry.get(archetypeId);
    const group = new THREE.Group();
    group.name = slot
      ? `succession:building:${id}:${slot}:${archetypeId}`
      : `succession:building:${id}:${archetypeId}`;
    if (!model) {
      // Silent here means an invisible building on the board, which is the worst way for this to
      // fail: nothing errors, the parcel simply goes empty. Say it once, with the inputs, so the
      // cause is in the console rather than in a bug report.
      console.error(
        `[board] no model for dynamic building ${id} (${archetypeId})`,
        { districtId: parcel?.districtId ?? null, lotSpan, conditionTier },
      );
      return group;
    }
    const tint = this._conditionTint(id, condition);
    for (const part of model.parts) {
      // Incomplete kit parts cannot render; cut them rather than aborting the
      // entire approved building (or inventing a placeholder material).
      if (!part.geometry || !part.material) continue;
      // ATLAS-PATCHED MATERIALS ARE USED AS THEY ARE. THEY MUST NOT BE CLONED.
      //
      // This is the actual cause of "the building disappears on renovation and the landscaping
      // never appears", found by driving a real renovation on the live board and reading the
      // console rather than by reasoning about the code:
      //
      //   THREE.WebGLProgram: Shader Error - VALIDATE_STATUS false
      //   Material Name: dd-mat:painted_metal / dd-mat:concrete / dd-mat:glass
      //   Vertex shader is not compiled.
      //
      // The industrial atlas patches a material through `onBeforeCompile` plus a
      // `customProgramCacheKey`. A clone does not carry those own properties, so copying them
      // across was tried — and the resulting material still fails to compile, with or without a
      // distinct cache key. The clone is simply not a valid subject for that patch. Its meshes
      // therefore had no working program and drew nothing, which is why the parcel went empty
      // and the planting inside the same group was never seen.
      //
      // So a patched material is used directly. The cost is the per-building condition TINT on
      // those surfaces, and it is a cost worth paying: the tier already changes the geometry —
      // cleared yard, no security fencing, an upgraded boundary, landscaping, rooftop plant —
      // which is a far stronger read than a multiplier on albedo ever was. Unpatched materials
      // still clone and still tint, exactly as before.
      //
      // Shared materials are safe from `_disposeVisualGroup`: it only disposes materials flagged
      // `successionClone`, and this path deliberately does not set that flag.
      const patched = Boolean(part.material.customProgramCacheKey || part.material.onBeforeCompile);
      let material = part.material;
      if (!patched) {
        material = part.material.clone();
        material.userData.successionClone = true;
        material.userData.sharedLibrary = false;
        if (material.color) material.color.multiply(tint);
        const hospitality = this.lastState?.holdings?.[id]?.hospitality?.kind;
        if (hospitality === 'hotel' && material.color) material.color.multiply(new THREE.Color('#e0b45a'));
        if (hospitality === 'luxe' && material.color) material.color.multiply(new THREE.Color('#f0d080'));
        if ('roughness' in material) {
          material.roughness = Math.max(0.28, Math.min(1, material.roughness + (1 - condition) * 0.10));
        }
      }
      // AN INSTANCED MESH OF COUNT ONE, NOT A PLAIN MESH — AND THIS IS THE ACTUAL BUG.
      //
      // The board draws every building through `buildInstanced`, so the industrial atlas shader
      // is authored, patched and compiled against an INSTANCED draw. `_createBuildingGroup` built
      // plain `THREE.Mesh`es, which compiles the same material without the instancing attributes
      // the patch expects, and the vertex shader fails to build:
      //
      //   THREE.WebGLProgram: Shader Error - VALIDATE_STATUS false
      //   Material Name: dd-mat:painted_metal / dd-mat:concrete / dd-mat:glass
      //   Vertex shader is not compiled.
      //
      // Measured on the live board: zero shader errors at baseline, these errors the moment a
      // real renovation completes. The renovated building's materials had no valid program, so
      // its meshes drew nothing — the parcel went empty and the planting in the same group was
      // never seen. That is the "disappears on renovation" the owner reported three times, and
      // neither the empty-group guard, the cache-key change nor the sync ordering touched it.
      //
      // Drawing it as an `InstancedMesh` of one puts the material back in the draw it was built
      // for. It also gives the condition tint somewhere to live: `instanceColor`, which is how
      // the instanced path has always tinted, rather than a material clone that cannot carry the
      // atlas patch.
      const mesh = new THREE.InstancedMesh(part.geometry, material, 1);
      mesh.setMatrixAt(0, new THREE.Matrix4());
      mesh.instanceMatrix.needsUpdate = true;
      if (patched) {
        mesh.setColorAt(0, tint);
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    const hospitality = this.lastState?.holdings?.[id]?.hospitality?.kind;
    if (hospitality === 'hotel' || hospitality === 'luxe') {
      const signMat = new THREE.MeshStandardMaterial({
        color: hospitality === 'hotel' ? 0xc9a227 : 0xd4af37,
        roughness: 0.38,
        metalness: 0.55,
      });
      signMat.userData.successionClone = true;
      const sign = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.38, 0.12), signMat, 1);
      sign.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 7.2, 4.2));
      sign.instanceMatrix.needsUpdate = true;
      sign.castShadow = true;
      group.add(sign);
    }
    const p = this._buildingPlacement(id, archetypeId, slot);
    group.position.copy(p.position);
    group.quaternion.copy(p.quaternion);
    group.scale.copy(p.scale);
    group.userData.baseScale = p.scale.clone();
    group.userData.baseQuaternion = p.quaternion.clone();
    this.root.add(group);
    return group;
  }

  _disposeVisualGroup(group) {
    if (!group) return;
    this.root.remove(group);
    group.traverse((child) => {
      if (child.userData?.ownsGeometry) child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (material?.userData?.successionClone) material.dispose();
      }
    });
  }

  _writeStaticBuildings(state) {
    const matrix = new THREE.Matrix4();
    const zero = new THREE.Vector3(0, 0, 0);
    const changedMeshes = new Set();
    for (const [id, record] of this.staticBuildings) {
      const activeSite = this._activeParcelForComponent(id);
      const activeId = activeSite?.id ?? id;
      const holding = state?.holdings?.[activeId];
      const status = state?.parcelStatus?.[activeId];
      const activeArchetype = activeSite ? archetypeIdOf(this.city, state, activeId) : null;
      const changed = activeSite?.consolidated
        ? status?.builtArchetypeId !== null
        : activeArchetype && activeArchetype !== record.archetypeId;
      const animated = this.demolitionAnimations.has(activeId)
        || this.demolitionStrikeAnimations.has(activeId)
        || this.completionAnimations.has(activeId);
      // `dynamicBuildings` is the ONLY reason the renovated exterior never appeared.
      //
      // A tier change promotes a parcel to a dynamic building, which is the path that rebuilds
      // geometry. But `changed` is false when the archetype has not changed — a renovation keeps
      // the same archetype — so the INSTANCED copy stayed visible and drew the old yard, the old
      // fencing and the old lean-to straight over the top of the new group. Both were in the
      // scene; the one with the junk on it is the one that was seen.
      // The dynamic record only counts if it actually put something in the scene.
      //
      // `_createBuildingGroup` returns an EMPTY group, unadded, when the model does not resolve.
      // The first version of this hid the instanced copy on `dynamicBuildings.has(id)` alone, so
      // any failure to resolve the renovated model hid the working building and drew nothing in
      // its place — the building disappeared on renovation, and the landscaping that was supposed
      // to replace its yard never appeared either, because both live in the group that was never
      // built. Hiding a thing must be conditional on the replacement existing, never on the
      // intention to replace it.
      const replacement = this.dynamicBuildings.get(id)
        ?? this.dynamicBuildings.get(`${id}:A`)
        ?? this.dynamicBuildings.get(`${id}:B`);
      const replaced = Boolean(replacement?.group?.children?.length)
        || Boolean(this.dynamicBuildings.get(`${id}:A`)?.group?.children?.length)
        || Boolean(this.dynamicBuildings.get(`${id}:B`)?.group?.children?.length);
      const hidden = Boolean(
        holding?.construction || holding?.siteCleared || changed || animated || replaced,
      );
      const condition = status?.condition
        ?? holding?.condition
        ?? this._baseParcel(id).condition;
      const strikes = Math.max(0, Math.min(10, holding?.demolition?.strikes ?? 0));
      const ruinedScale = record.placement.scale.clone();
      ruinedScale.y *= 1 - (strikes / 10) * 0.34;
      const ruinedRotation = record.placement.quaternion.clone();
      if (strikes > 0) {
        ruinedRotation.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
          (strikes / 10) * 0.025,
          0,
          -(strikes / 10) * 0.045,
        )));
      }
      matrix.compose(
        record.placement.position,
        ruinedRotation,
        hidden ? zero : ruinedScale,
      );
      for (const mesh of record.meshes) {
        mesh.setMatrixAt(record.index, matrix);
        mesh.setColorAt(record.index, this._conditionTint(id, condition));
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        changedMeshes.add(mesh);
      }
    }
    // State changes can hide, restore, compress or lean an individual building.
    // Refresh each shared batch once after all its instances have been written.
    // Animation-frame updates do not rebuild these bounds.
    for (const mesh of changedMeshes) {
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    }
  }

  _syncDynamicBuildings(state) {
    const wanted = new Map();
    for (const id of [...this._order()].sort()) {
      const parcel = this._parcel(id);
      const holding = state.holdings[id];
      const original = parcel.consolidated ? null : this._baseParcel(id)?.archetypeId;
      const activeArchetype = archetypeIdOf(this.city, state, id);
      // A RENOVATION THAT DOES NOT CHANGE THE ARCHETYPE STILL CHANGES AN INDUSTRIAL EXTERIOR.
      //
      // The clause below skips any parcel still holding its original archetype, which is right
      // for every id whose condition only drives an instance tint. It is wrong for the industrial
      // kit, where the tier is geometry: renovating a bond store clears its yard and takes down
      // its security fencing, and neither of those can be expressed by tinting the instance it
      // already has. So an industrial parcel whose CURRENT tier differs from the tier it was
      // batched at gets promoted to a dynamic building, which is the only path that rebuilds
      // geometry. Everything else keeps the cheap instanced path exactly as before.
      const baseCondition = this._baseParcel(id)?.condition;
      const liveCondition = state.parcelStatus[id]?.condition
        ?? holding?.condition
        ?? baseCondition;
      // The tier a building is CURRENTLY batched at is the no-works tier, because that is what
      // `_buildParcelBuildings` computed before any renovation existed. So the comparison is
      // "what should it be now" against "what it was built as".
      const industrialTierChanged = INDUSTRIAL_KIT_IDS.has(activeArchetype)
        && tierFromCondition(liveCondition, this._renovationStarted(id))
          !== tierFromCondition(baseCondition, false);
      // Venture branding is state, not archetype content. Rebuild the live shop model when a
      // venture appears or its brand changes, and let the static shell return when it exits.
      const ventureSign = holding?.venture?.brand
        ? `${holding.venture.brand}.ai`
        : null;
      // Whole-site works suppress the two-storey barn fast path. A job on one
      // pad slot must still leave its standing neighbour visible below.
      if ((holding?.construction && !holding.construction.slot) || holding?.siteCleared) continue;
      const barnStoreys = activeArchetype === 'hammerbarn' && levelOf(state, id) >= 1 ? 2 : null;
      if (barnStoreys) {
        wanted.set(id, {
          archetypeId: activeArchetype,
          condition: state.parcelStatus[id].condition,
          storeys: barnStoreys,
          signText: ventureSign,
          demolitionStrikes: holding?.demolition?.strikes ?? 0,
        });
        continue;
      }
      const hospitality = holding?.hospitality?.kind ?? null;
      const slotPlacements = standingPadSlotPlacements(this.city, state, id);
      if (slotPlacements.length) {
        for (const row of slotPlacements) {
          wanted.set(`${id}:${row.slot}`, {
            parcelId: id,
            slot: row.slot,
            archetypeId: row.archetypeId,
            condition: state.parcelStatus[id].condition,
            hospitality,
            signText: ventureSign,
            demolitionStrikes: holding?.demolition?.strikes ?? 0,
          });
        }
        continue;
      }
      if (
        (parcel.consolidated && state.parcelStatus[id].builtArchetypeId === null)
        || holding?.construction
        || holding?.siteCleared
        || (original && activeArchetype === original
          && !industrialTierChanged && !hospitality && !ventureSign)
        || !activeArchetype
        || this.completionAnimations.has(id)
      ) continue;
      wanted.set(id, {
        parcelId: id,
        archetypeId: activeArchetype,
        condition: state.parcelStatus[id].condition,
        hospitality,
        signText: ventureSign,
        demolitionStrikes: holding?.demolition?.strikes ?? 0,
      });
    }

    for (const [id, record] of this.dynamicBuildings) {
      const desired = wanted.get(id);
      if (
        desired
        && desired.archetypeId === record.archetypeId
        && desired.condition === record.condition
        && desired.hospitality === record.hospitality
        && desired.signText === record.signText
        && desired.demolitionStrikes === record.demolitionStrikes
        && (desired.storeys ?? null) === (record.storeys ?? null)
        && (desired.slot ?? null) === (record.slot ?? null)
      ) continue;
      this._disposeVisualGroup(record.group);
      this.dynamicBuildings.delete(id);
    }
    for (const [id, desired] of wanted) {
      if (this.dynamicBuildings.has(id)) continue;
      const group = this._createBuildingGroup(
        desired.parcelId ?? id,
        desired.archetypeId,
        desired.condition,
        desired.storeys,
        desired.signText,
        desired.slot ?? null,
      );
      this._settleDemolitionDamage(group, desired.demolitionStrikes);
      this.dynamicBuildings.set(id, {
        ...desired,
        group,
      });
    }
    for (const [id, animation] of this.demolitionStrikeAnimations) {
      const replacement = this.dynamicBuildings.get(id)?.group ?? null;
      if (!replacement) continue;
      replacement.visible = false;
      animation.replacement = replacement;
    }
  }

  _setEnvelopeInstances(mesh, index, parcel, height, y) {
    const w = parcel.placement?.envelopeMetres?.x ?? parcel.groundFootprint[0] * TILE - 1;
    const d = parcel.placement?.envelopeMetres?.z ?? parcel.groundFootprint[1] * TILE - 1;
    const matrix = new THREE.Matrix4();
    const north = new THREE.Quaternion();
    const east = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 2,
    );
    const entries = [
      [0, -d / 2, north, w],
      [0, d / 2, north, w],
      [-w / 2, 0, east, d],
      [w / 2, 0, east, d],
    ];
    entries.forEach(([dx, dz, rotation, width], side) => {
      matrix.compose(
        new THREE.Vector3(parcel.centre.x + dx, y, parcel.centre.z + dz),
        rotation,
        new THREE.Vector3(width, height, 1),
      );
      mesh.setMatrixAt(index * 4 + side, matrix);
    });
  }

  _cloneSiteModel(modelId, name) {
    const model = this.registry.get(modelId);
    if (!model || model.source === 'runtime-procedural') return null;
    const group = new THREE.Group();
    group.name = name;
    for (const part of model.parts) {
      const material = part.material.clone();
      material.userData.successionClone = true;
      const mesh = new THREE.Mesh(part.geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    group.userData.modelSize = model.size.clone();
    return group;
  }

  _syncCommissionedSiteKits(sites, craneSites, proceduralHoardingSites = []) {
    const wanted = new Set(sites.map(([id]) => id));
    const craneIds = new Set(craneSites.map(([id]) => id));
    const proceduralHoardingIds = new Set(proceduralHoardingSites.map(([id]) => id));
    for (const [id, record] of this.siteKits) {
      const holding = sites.find(([siteId]) => siteId === id)?.[1];
      const changed = (
        !wanted.has(id)
        || record.toArchetype !== holding?.construction?.toArchetype
        || record.withCrane !== craneIds.has(id)
        || record.withHoarding !== !proceduralHoardingIds.has(id)
      );
      if (!changed) continue;
      this._disposeVisualGroup(record.group);
      this.siteKits.delete(id);
    }

    for (const [id, holding] of sites) {
      if (this.siteKits.has(id)) continue;
      const parcel = this._worksParcel(id, holding);
      const w = parcel.placement?.envelopeMetres?.x ?? parcel.groundFootprint[0] * TILE - 1;
      const d = parcel.placement?.envelopeMetres?.z ?? parcel.groundFootprint[1] * TILE - 1;
      const group = new THREE.Group();
      group.name = `succession:commissioned-site:${id}`;
      group.position.set(parcel.centre.x, 0, parcel.centre.z);

      const withHoarding = !proceduralHoardingIds.has(id);
      if (withHoarding) {
        const sides = [
          { x: 0, z: -d / 2, rotation: 0, length: w },
          { x: 0, z: d / 2, rotation: 0, length: w },
          { x: -w / 2, z: 0, rotation: Math.PI / 2, length: d },
          { x: w / 2, z: 0, rotation: Math.PI / 2, length: d },
        ];
        sides.forEach((side, index) => {
          const hoarding = this._cloneSiteModel(
            'site-hoarding',
            `succession:site-hoarding:${id}:${index}`,
          );
          if (!hoarding) return;
          const sourceLength = hoarding.userData.modelSize.x;
          hoarding.position.set(side.x, 0, side.z);
          hoarding.rotation.y = side.rotation;
          hoarding.scale.x = side.length / sourceLength;
          group.add(hoarding);
        });
      }

      const spoil = this._cloneSiteModel('spoil-heap', `succession:spoil-heap:${id}`);
      if (spoil) {
        spoil.position.set(2.3, 0, -1.8);
        group.add(spoil);
      }

      const withCrane = craneIds.has(id);
      if (withCrane) {
        const crane = this._cloneSiteModel('tower-crane', `succession:tower-crane:${id}`);
        if (crane) {
          crane.position.set(4, 0, 3);
          group.add(crane);
        }
      }
      this.root.add(group);
      this.siteKits.set(id, {
        group,
        withCrane,
        withHoarding,
        toArchetype: holding.construction.toArchetype,
      });
    }
  }

  _syncSiteSheds(sites) {
    const wanted = new Set(sites.map(([id]) => id));
    for (const [id, group] of this.siteSheds) {
      if (wanted.has(id)) continue;
      this._disposeVisualGroup(group);
      this.siteSheds.delete(id);
    }
    for (const [id, holding] of sites) {
      if (this.siteSheds.has(id)) continue;
      const parcel = this._worksParcel(id, holding);
      const model = this.registry.get('signal-cabinet');
      const group = new THREE.Group();
      group.name = `succession:site-shed:${id}`;
      for (const part of model?.parts ?? []) {
        const material = part.material.clone();
        material.userData.successionClone = true;
        const mesh = new THREE.Mesh(part.geometry, material);
        mesh.castShadow = true;
        group.add(mesh);
      }
      group.position.set(parcel.centre.x - 3.6, 0, parcel.centre.z + 3.2);
      group.scale.setScalar(1.8);
      group.userData.toArchetype = holding.construction.toArchetype;
      this.root.add(group);
      this.siteSheds.set(id, group);
    }
  }

  _syncConstructionStageModels(sites, state) {
    const wanted = new Set(sites.map(([id]) => id));
    for (const [id, record] of this.constructionStages) {
      if (wanted.has(id)) continue;
      this._disposeVisualGroup(record.group);
      this.constructionStages.delete(id);
    }
    for (const [id, holding] of sites) {
      const construction = holding.construction;
      if (!construction) continue;
      const stageIndex = constructionStageIndex(construction, state.quarter);
      const existing = this.constructionStages.get(id);
      const accident = Boolean(construction.accidentOccurred);
      const same = existing
        && existing.stageIndex === stageIndex
        && existing.toArchetype === construction.toArchetype
        && existing.completionQuarter === construction.completionQuarter
        && existing.accident === accident;
      if (same) {
        requestSiteWorkCycle(existing.group, state.quarter);
        continue;
      }
      if (existing) this._disposeVisualGroup(existing.group);
      const parcel = this._worksParcel(id, holding);
      const parcelId = holding._parcelId ?? id;
      const archetypeId = construction.toArchetype;
      const lotSpan = parcelBuildingTransform(parcel, archetypeId).lotSpan;
      const facade = deterministicFacade(parcelId);
      const hand = HANDED_SHOPS.has(archetypeId) ? handForParcel(parcel) : null;
      const key = finishedKey(archetypeId, facade, lotSpan, hand, parcel?.districtId);
      if (!this._constructionFits.has(key)) {
        // Match _createBuildingGroup's recipe for the completed commission, including pad slots.
        const completedCondition = RULES.maxCondition
          - (construction.defectRoll < construction.defectChanceBp ? 1 : 0);
        const conditionTier = INDUSTRIAL_KIT_IDS.has(archetypeId)
          ? tierFromCondition(completedCondition, this._renovationStarted(parcelId))
          : null;
        const kitStoreys = archetypeId === 'hammerbarn' && construction.nextLevel >= 1 ? 2 : null;
        const signText = holding.venture?.brand ? `${holding.venture.brand}.ai` : null;
        const model = this._modelFor(archetypeId, parcel?.districtId, facade, lotSpan,
          conditionTier, hand, kitStoreys, signText) ?? this.registry.get(archetypeId);
        const footprint = ARCHETYPES[archetypeId]?.footprint ?? [1, 1];
        const lot = { w: (lotSpan?.spanX ?? footprint[0]) * TILE,
          d: (lotSpan?.spanZ ?? footprint[1]) * TILE };
        this._constructionFits.set(key, measureFinishedForLot(model, lot, key));
      }
      // Cached dimensions are local to the model; placement is specific to this parcel/slot.
      const finished = finishedFit(this._constructionFits.get(key),
        this._buildingPlacement(parcelId, archetypeId, holding._padSlot), parcel.centre);
      const group = createConstructionStageGroup({
        parcel,
        construction,
        quarter: state.quarter,
        materials: this.materials,
        finished,
      });
      this.root.add(group);
      this.constructionStages.set(id, {
        group,
        stageIndex,
        toArchetype: construction.toArchetype,
        completionQuarter: construction.completionQuarter,
        accident: Boolean(construction.accidentOccurred),
      });
    }
  }

  _syncRenovationScaffoldModels(renovations, state) {
    const wanted = new Set(renovations.map(([id]) => id));
    for (const [id, record] of this.renovationScaffolds) {
      if (wanted.has(id)) continue;
      this._disposeVisualGroup(record.group);
      this.renovationScaffolds.delete(id);
    }
    for (const [id] of renovations) {
      const storeys = ARCHETYPES[archetypeIdOf(this.city, state, id)]?.storeys
        ?? this._parcel(id)?.storeys
        ?? 2;
      const existing = this.renovationScaffolds.get(id);
      if (existing && existing.storeys === storeys) {
        requestSiteWorkCycle(existing.group, state.quarter);
        continue;
      }
      if (existing) this._disposeVisualGroup(existing.group);
      const parcel = this._parcel(id);
      const group = createRenovationScaffoldGroup({
        parcel,
        materials: this.materials,
        storeys,
        quarter: state.quarter,
      });
      this.root.add(group);
      this.renovationScaffolds.set(id, { group, storeys });
    }
  }

  _worksParcel(id, holding = null) {
    const parcelId = holding?._parcelId ?? id;
    const slot = holding?._padSlot;
    if (slot) {
      return slotParcelView(this.city, this.lastState, parcelId, slot) ?? this._parcel(parcelId);
    }
    return this._parcel(parcelId);
  }

  _drawSuccessionState(state) {
    const sites = [];
    for (const [id, holding] of Object.entries(state.holdings)) {
      const jobs = livePadWorksJobs(holding);
      if (!jobs.length) continue;
      for (const job of jobs) {
        const key = job.slot ? `${id}:${job.slot}` : id;
        sites.push([key, {
          ...holding,
          construction: job.construction,
          _padSlot: job.slot,
          _parcelId: id,
        }]);
      }
    }
    const renovations = Object.entries(state.holdings)
      .filter(([, holding]) => holding.renovation && !holding.construction);
    // Residential staged builds use procedural stage models (demo/slab/frame/lock-up).
    // Non-residential keeps the lighter hoarding / crane kit path.
    const stagedSites = sites.filter(([, holding]) =>
      holding.construction.residentialBuild
      || (holding.construction.durationQuarters ?? 1) >= 4
      || ARCHETYPES[holding.construction.toArchetype]?.sector === 'residential');
    const simpleSites = sites.filter(([id]) => !stagedSites.some(([sid]) => sid === id));
    const matrix = new THREE.Matrix4();
    const neutral = new THREE.Quaternion();
    const commissionedSiteKit = ['site-hoarding', 'spoil-heap', 'tower-crane'].every((id) => {
      const model = this.registry.get(id);
      return model && model.source !== 'runtime-procedural';
    });
    const craneSites = sites.filter(([, holding]) =>
      (ARCHETYPES[holding.construction.toArchetype]?.storeys ?? 0) >= 3);
    const fallbackCraneSites = simpleSites.filter(([, holding]) =>
      (ARCHETYPES[holding.construction.toArchetype]?.storeys ?? 0) >= 3);

    this._syncConstructionStageModels(stagedSites, state);
    this._syncRenovationScaffoldModels(renovations, state);

    if (commissionedSiteKit) {
      // The commissioned hoarding, materials and crane kit now marks every live job from its
      // first quarter; staged residential jobs were previously excluded by `simpleSites`.
      this._syncCommissionedSiteKits(sites, craneSites, stagedSites);
    } else {
      simpleSites.forEach(([id, holding], index) => {
        const parcel = this._worksParcel(id, holding);
        this._setEnvelopeInstances(this.hoarding, index, parcel, 2.4, 1.2);
        matrix.compose(
          new THREE.Vector3(parcel.centre.x + 2.3, 0.9, parcel.centre.z - 1.8),
          neutral,
          new THREE.Vector3(1, 1, 1),
        );
        this.spoil.setMatrixAt(index, matrix);
      });
    }
    // Legacy wireframe scaffold planes retired for renovations (solid groups above).
    if (!commissionedSiteKit) {
      fallbackCraneSites.forEach(([id, holding], index) => {
        const parcel = this._worksParcel(id, holding);
        const height = Math.max(11, (ARCHETYPES[holding.construction.toArchetype]?.storeys ?? 3) * STOREY + 4);
        matrix.compose(
          new THREE.Vector3(parcel.centre.x + 4, height / 2, parcel.centre.z + 3),
          neutral,
          new THREE.Vector3(1, height, 1),
        );
        this.craneMasts.setMatrixAt(index, matrix);
        matrix.compose(
          new THREE.Vector3(parcel.centre.x, height, parcel.centre.z + 3),
          neutral,
          new THREE.Vector3(10, 1, 1),
        );
        this.craneBooms.setMatrixAt(index, matrix);
      });
    }

    this.hoarding.count = commissionedSiteKit ? 0 : simpleSites.length * 4;
    this.spoil.count = commissionedSiteKit ? 0 : simpleSites.length;
    this.scaffold.count = 0;
    this.craneMasts.count = commissionedSiteKit ? 0 : fallbackCraneSites.length;
    this.craneBooms.count = commissionedSiteKit ? 0 : fallbackCraneSites.length;
    for (const mesh of [
      this.hoarding, this.spoil, this.scaffold, this.craneMasts, this.craneBooms,
    ]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = mesh.count > 0;
    }
    this._syncSiteSheds(sites);
  }

  beginDemolition(id, archetypeId) {
    const old = this.demolitionAnimations.get(id);
    if (old) this._disposeVisualGroup(old.group);
    if (this.reducedMotion) {
      this.demolitionAnimations.delete(id);
      return;
    }
    const holding = this.lastState?.holdings?.[id];
    const condition = holding?.condition
      ?? this._parcel(id)?.condition
      ?? this._baseParcel(id)?.condition
      ?? 1;
    const group = this._createBuildingGroup(id, archetypeId, condition);
    this.demolitionAnimations.set(id, {
      group,
      t: 0,
      duration: 0.7,
      baseScale: group.scale.clone(),
      baseRotation: group.rotation.y,
    });
  }

  _settleDemolitionDamage(group, strikes) {
    if (!group) return;
    const progress = Math.max(0, Math.min(1, (strikes ?? 0) / 10));
    const baseScale = group.userData?.baseScale ?? group.scale;
    group.scale.set(baseScale.x, baseScale.y * (1 - progress * 0.34), baseScale.z);
    // A north-facing quaternion decomposes to XYZ Euler X/Z = pi, Y = 0.
    // Clearing those X/Z values flips an undamaged replacement by 180 degrees.
    // Compose the same local damage tilt as the static instance path instead.
    const baseQuaternion = group.userData.baseQuaternion ??= group.quaternion.clone();
    group.quaternion.copy(baseQuaternion).multiply(new THREE.Quaternion().setFromEuler(
      new THREE.Euler(progress * 0.025, 0, -progress * 0.045),
    ));
  }

  pulseDemolitionStrike(id, strikes, total = 10) {
    const previous = this.demolitionStrikeAnimations.get(id);
    if (previous) this._disposeVisualGroup(previous.group);
    this.demolitionStrikeAnimations.delete(id);
    if (strikes >= total || this.reducedMotion) return;
    const holding = this.lastState?.holdings?.[id];
    const archetypeId = archetypeIdOf(this.city, this.lastState, id);
    if (!archetypeId) return;
    const condition = holding?.condition
      ?? this._parcel(id)?.condition
      ?? this._baseParcel(id)?.condition
      ?? 1;
    const group = this._createBuildingGroup(id, archetypeId, condition);
    const replacement = this.dynamicBuildings.get(id)?.group ?? null;
    if (replacement) replacement.visible = false;
    const baseScale = group.userData.baseScale?.clone() ?? group.scale.clone();
    const before = Math.max(0, strikes - 1) / total;
    const after = strikes / total;
    group.scale.set(baseScale.x, baseScale.y * (1 - before * 0.34), baseScale.z);
    this.demolitionStrikeAnimations.set(id, {
      group,
      replacement,
      t: 0,
      duration: 0.28,
      basePosition: group.position.clone(),
      baseRotation: group.rotation.clone(),
      baseScale,
      fromScaleY: 1 - before * 0.34,
      toScaleY: 1 - after * 0.34,
      targetTiltX: after * 0.025,
      targetTiltZ: -after * 0.045,
    });
    if (this.lastState) this._writeStaticBuildings(this.lastState);
  }

  setFootprintGhost(model = null) {
    if (this.footprintGhost) this._disposeVisualGroup(this.footprintGhost);
    this.footprintGhost = null;
    if (!model) return;
    const legal = Boolean(model.fits);
    const group = new THREE.Group();
    group.name = 'site-works:footprint-ghost';
    group.userData = {
      footprintGhost: true,
      parcelId: model.parcelId ?? null,
      archetypeId: model.archetypeId ?? null,
      fits: legal,
      blocked: !legal,
    };
    const makePlate = (w, d, y, colour, opacity) => {
      const material = new THREE.MeshBasicMaterial({
        color: colour,
        transparent: true,
        opacity,
        depthWrite: false,
      });
      material.userData.successionClone = true;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), material);
      plate.position.set(model.cx, y, model.cz);
      plate.userData.ownsGeometry = true;
      plate.renderOrder = 5;
      return plate;
    };
    // Renderer equivalents of the HUD's --gain / --chrome-ink tokens. The plate is
    // an instrument under the real building ghost, never a cream replacement model.
    group.add(makePlate(
      model.lotW,
      model.lotD,
      0.09,
      legal ? '#5fa878' : '#8f322c',
      legal ? 0.18 : 0.32,
    ));
    group.add(makePlate(
      model.bldgW,
      model.bldgD,
      0.16,
      legal ? '#0c0b09' : '#4b1512',
      legal ? 0.38 : 0.52,
    ));

    const parcel = model.parcelId ? this._parcel(model.parcelId) : null;
    const archetypeId = model.archetypeId;
    if (parcel && archetypeId) {
      const lotSpan = parcelBuildingTransform(parcel, archetypeId).lotSpan;
      const source = this._modelFor(
        archetypeId,
        parcel.districtId,
        deterministicFacade(model.parcelId),
        lotSpan,
      ) ?? this.registry?.get?.(archetypeId);
      const cloneable = source?.parts?.length && source.parts.every((part) => {
        const materials = Array.isArray(part.material) ? part.material : [part.material];
        return Boolean(part.geometry)
          && materials.length > 0
          && materials.every((material) => typeof material?.clone === 'function');
      });
      if (cloneable) {
        const silhouette = new THREE.Group();
        silhouette.name = `site-works:building-ghost:${model.parcelId}:${archetypeId}`;
        silhouette.userData = {
          buildingGhost: true,
          parcelId: model.parcelId,
          archetypeId,
          blocked: !legal,
        };
        for (const part of source.parts) {
          const cloneGhostMaterial = (sourceMaterial) => {
            const material = sourceMaterial.clone();
            material.transparent = true;
            material.opacity = legal ? 0.28 : 0.46;
            material.depthWrite = false;
            if (!legal && material.color?.isColor) {
              material.color.lerp(new THREE.Color('#cf4f45'), 0.72);
            }
            material.userData = {
              ...(material.userData ?? {}),
              successionClone: true,
              ghostSourceMaterial: sourceMaterial?.uuid ?? null,
            };
            material.needsUpdate = true;
            return material;
          };
          const material = Array.isArray(part.material)
            ? part.material.map(cloneGhostMaterial)
            : cloneGhostMaterial(part.material);
          const mesh = new THREE.Mesh(part.geometry, material);
          mesh.frustumCulled = false;
          mesh.renderOrder = 6;
          mesh.userData.buildingGhost = true;
          silhouette.add(mesh);
        }
        const placement = this._buildingPlacement(model.parcelId, archetypeId);
        if (Number.isFinite(model.cx) && Number.isFinite(model.cz)) {
          silhouette.position.set(model.cx, placement.position.y, model.cz);
        } else {
          silhouette.position.copy(placement.position);
        }
        silhouette.quaternion.copy(placement.quaternion);
        silhouette.scale.copy(placement.scale);
        group.add(silhouette);
      }
    }
    this.root.add(group);
    this.footprintGhost = group;
  }

  _completionHoarding(id, archetypeId) {
    const parcel = this._parcel(id);
    const group = new THREE.Group();
    group.name = `succession:completion-site:${id}`;
    const material = new THREE.MeshBasicMaterial({
      color: '#b89a65',
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    material.userData.successionClone = true;
    const w = parcel.placement?.envelopeMetres?.x ?? parcel.groundFootprint[0] * TILE - 1;
    const d = parcel.placement?.envelopeMetres?.z ?? parcel.groundFootprint[1] * TILE - 1;
    for (const [x, z, ry, width] of [
      [0, -d / 2, 0, w], [0, d / 2, 0, w],
      [-w / 2, 0, Math.PI / 2, d], [w / 2, 0, Math.PI / 2, d],
    ]) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      plane.position.set(x, 1.2, z);
      plane.rotation.y = ry;
      plane.scale.set(width, 2.4, 1);
      plane.userData.ownsGeometry = true;
      group.add(plane);
    }
    if ((ARCHETYPES[archetypeId]?.storeys ?? 0) >= 3) {
      const craneMaterial = material.clone();
      craneMaterial.color.set('#d5ae3f');
      craneMaterial.userData.successionClone = true;
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.45, 14, 0.45), craneMaterial);
      mast.position.set(4, 7, 3);
      mast.userData.ownsGeometry = true;
      const boom = new THREE.Mesh(new THREE.BoxGeometry(10, 0.34, 0.34), craneMaterial);
      boom.position.set(0, 14, 3);
      boom.userData.ownsGeometry = true;
      group.add(mast, boom);
    }
    group.position.set(parcel.centre.x, 0, parcel.centre.z);
    this.root.add(group);
    return group;
  }

  beginCompletion(id, archetypeId) {
    const old = this.completionAnimations.get(id);
    if (old) {
      this._disposeVisualGroup(old.group);
      this._disposeVisualGroup(old.site);
    }
    if (this.reducedMotion) {
      this.completionAnimations.delete(id);
      return;
    }
    const condition = 2;
    const group = this._createBuildingGroup(id, archetypeId, condition);
    const baseScale = group.scale.clone();
    group.scale.y = Math.max(0.001, baseScale.y * 0.001);
    this.completionAnimations.set(id, {
      group,
      site: this._completionHoarding(id, archetypeId),
      archetypeId,
      condition,
      t: 0,
      duration: 0.9,
      baseScale,
    });
  }

  _syncTopology(state) {
    const version = state.topology?.version ?? 0;
    if (version === this.topologyVersion) {
      this.lastState = state;
      return;
    }
    const selected = this.selectedSelection;
    this.lastState = state;
    this.topologyVersion = version;
    this._buildOwnershipOverlay();
    this._buildPickTargets();
    this._buildAmenityAffordance();
    if (selected?.kind === 'parcel') {
      const resolved = resolveCurrentParcelId(this.city, state, selected.id);
      this.setSelection(resolved ? { kind: 'parcel', id: resolved } : null);
    } else {
      this.setSelection(selected);
    }
  }

  // --- public API -----------------------------------------------------------

  setSelection(selection) {
    let target = typeof selection === 'string' ? { kind: 'parcel', id: selection } : selection;
    if (target?.kind === 'parcel' && !this._parcel(target.id) && this.lastState) {
      const resolved = resolveCurrentParcelId(this.city, this.lastState, target.id);
      target = resolved ? { kind: 'parcel', id: resolved } : null;
    }
    const entity = target?.kind === 'parcel'
      ? this._parcel(target.id)
      : target?.kind === 'civic'
        ? this.city.civicUses?.find((civic) => civic.id === target.id)
        : target?.kind === 'reserve' && this.city.reserve?.id === target.id
          ? this.city.reserve
          : null;
    this.selectedSelection = entity ? target : null;
    this.selectionRing.visible = Boolean(entity);
    // R14: never show the vertical selection beam — it blooms into a pink column.
    this.selectionBeam.visible = false;
    this._drawAmenityAffordance(target?.kind === 'parcel' ? entity : null);
    if (!entity) return;
    const [fx, fz] = target.kind === 'reserve'
      ? [TILES_PER_BLOCK, TILES_PER_BLOCK]
      : (entity.groundFootprint ?? entity.footprint);
    this.selectionBaseScale = Math.max(fx, fz);
    this.selectionRing.scale.setScalar(this.selectionBaseScale);
    this.selectionRing.position.set(entity.centre.x, 0.3, entity.centre.z);
    this.selectionBeam.position.set(entity.centre.x, 30, entity.centre.z);
  }

  setReducedMotion(on) {
    this.reducedMotion = on;
    this._drawAmenityAffordance(
      this.selectedSelection?.kind === 'parcel'
        ? this._parcel(this.selectedSelection.id)
        : null,
    );
  }

  setLens(lens) {
    if (!BOARD_LENSES.includes(lens) || lens === this.activeLens) return this.activeLens;
    this.activeLens = lens;
    this._applyLens();
    this._drawAmenityAffordance(
      this.selectedSelection?.kind === 'parcel'
        ? this._parcel(this.selectedSelection.id)
        : null,
    );
    if (this.lastState) this._drawInvitations(this.lastState);
    return this.activeLens;
  }

  _applyLens() {
    for (const ribbon of this.corridorGroup?.children ?? []) {
      const owner = ribbon.userData.owner;
      ribbon.material.opacity = corridorOpacityFor(this.activeLens, owner);
      ribbon.material.blending = this.activeLens === 'corridor'
        ? THREE.AdditiveBlending
        : THREE.NormalBlending;
      ribbon.material.needsUpdate = true;
    }
    // Keep the full-pad layer empty under every lens, including shadow-proxy snapshots.
    if (this.plinthOwned) this.plinthOwned.count = 0;
    if (this.plinthQuiet) this.plinthQuiet.visible = false;
    if (this.extendGroup) this.extendGroup.visible = this.activeLens === 'corridor';
  }

  corridorLensSnapshot() {
    const opacities = { player: [], rival: [] };
    for (const ribbon of this.corridorGroup?.children ?? []) {
      opacities[ribbon.userData.owner]?.push(ribbon.material.opacity);
    }
    return {
      lens: this.activeLens,
      opacities,
      invitationsVisible: Boolean(this.extendGroup?.visible),
    };
  }

  /** Repaint the ownership plinths and redraw corridor links from run state. */
  syncOwnership(state, viewerSeatId = 'P1') {
    syncFarms(this, state);
    this.viewerSeatId = viewerSeatId;
    this._syncTopology(state);
    // DYNAMIC BEFORE STATIC, AND THE ORDER IS THE WHOLE BUG.
    //
    // `_writeStaticBuildings` hides the instanced copy of any parcel that has a dynamic group
    // standing in for it. Running it FIRST meant that on the very frame a renovation completes,
    // the group does not exist yet, so nothing is hidden — and then `_syncDynamicBuildings` adds
    // the renovated building on top of the working one. Both are drawn, occupying the same
    // volume, and the older model wins because it carries the yard clutter, the fencing and the
    // lean-to that the new one deleted. `syncOwnership` only runs on a state change, so that
    // stalemate held for a whole quarter and read exactly like "the renovation did nothing".
    //
    // Building the replacement first means the hide is evaluated against a group that already
    // exists, so the swap happens in one pass. Nothing in `_syncDynamicBuildings` reads anything
    // `_writeStaticBuildings` writes — it works off city, state and the model cache — so the
    // dependency only ever pointed one way.
    this._syncDynamicBuildings(state);
    this._writeStaticBuildings(state);
    syncCybercabDepot(this, state);
    this._syncBuildingOpenings(state);
    this._drawSuccessionState(state);
    this._writePlinths(state);
    this._drawCorridors(state);
    this._drawInvitations(state);
    this._syncUnlockedTramLivery(state);
    this.setRivalIntent(rivalBoardTargets(state));
    this.lastState = state;
  }

  _syncUnlockedTramLivery(state) {
    const unlocked = (state.intel?.finds ?? []).some((find) =>
      find.id === 'tram-ticket-from-nowhere' && find.unlockedLivery === 'blue-gold');
    const blue = new THREE.Color('#244f78');
    const gold = new THREE.Color('#e0b43f');
    for (const tram of this.trams) {
      let partIndex = 0;
      tram.group.traverse((child) => {
        if (!child.isMesh || !child.material?.color) return;
        const base = child.material.userData.dogFindBaseColour;
        if (!unlocked) child.material.color.copy(base ?? WHITE);
        else if (partIndex % 4 === 0) child.material.color.copy(gold);
        else if (partIndex % 2 === 0) child.material.color.copy(blue);
        else child.material.color.copy(base ?? WHITE).lerp(blue, 0.22);
        partIndex += 1;
      });
    }
  }

  _drawCorridors(state) {
    for (const child of this.corridorGroup.children.slice()) {
      child.geometry?.dispose();
      child.material?.dispose();
      this.corridorGroup.remove(child);
    }
    const seen = new Set();
    for (const id of Object.keys(state.holdings)) {
      const ownerSeatId = state.holdings[id].ownerSeatId;
      const owner = viewerOwner(state, id, this.viewerSeatId);
      for (const neighbour of this._adjacency(id)) {
        // Adjacency is grouped by real seat identity, not the display label below —
        // two different non-viewer seats (e.g. P2 and R1) both read 'rival' under the
        // legacy label and must never be mistaken for one shared corridor.
        if (state.holdings[neighbour]?.ownerSeatId !== ownerSeatId) continue;
        const key = [id, neighbour].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const a = this._parcel(id).centre;
        const b = this._parcel(neighbour).centre;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const length = Math.hypot(dx, dz);
        const ribbon = new THREE.Mesh(this.ribbonGeometry, new THREE.MeshBasicMaterial({
          map: this.ribbonTexture,
          color: owner === 'player' ? '#f0c97a' : rivalColours().ribbon,
          transparent: true,
          opacity: corridorOpacityFor(this.activeLens, owner),
          depthWrite: false,
          blending: this.activeLens === 'corridor'
            ? THREE.AdditiveBlending
            : THREE.NormalBlending,
        }));
        ribbon.userData.owner = owner;
        // The link IS the shared boundary between two parcels, not a line drawn through
        // their middles. A wide bridge across that edge reads as geography; a thin
        // centre-to-centre wire reads as a graph.
        ribbon.position.set((a.x + b.x) / 2, 0.26, (a.z + b.z) / 2);
        ribbon.rotation.y = Math.atan2(dx, dz);
        ribbon.scale.set(TILE * 0.72, 1, Math.min(length * 0.82, TILE * 0.85));
        ribbon.renderOrder = 3;
        this.corridorGroup.add(ribbon);
      }
    }
    this._applyLens();
  }

  /** Raycast every strategic category; SceneView owns the one six-level resolver. */
  pickLayers(raycaster) {
    const hits = raycaster.intersectObjects(this.pickTargets, false);
    const layers = { parcel: null, civic: null, reserve: null, ground: null };
    const resolveHit = (hit) => {
      // Instanced strategic volumes (board-built).
      if (hit.object?.userData?.pickInstanced && this.pickRecords?.length) {
        const rec = this.pickRecords[hit.instanceId];
        if (rec) return { kind: rec.kind, id: rec.id, distance: hit.distance };
      }
      // Plain Mesh proxies (tests inject these; keep the userData path).
      const kind = hit.object?.userData?.pickKind;
      const id = hit.object?.userData?.pickId;
      if (kind && id) return { kind, id, distance: hit.distance };
      return null;
    };
    const resolved = hits.map(resolveHit).filter(Boolean);
    for (const kind of ['parcel', 'civic', 'reserve']) {
      const candidates = resolved
        .filter((hit) => hit.kind === kind)
        .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
      layers[kind] = candidates[0] ?? null;
    }

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, point)) return layers;
    const distance = raycaster.ray.origin.distanceTo(point);
    const selection = this.selectionAt(point.x, point.z);
    if (selection && !layers[selection.kind]) {
      layers[selection.kind] = { ...selection, distance };
    }
    layers.ground = { kind: 'ground', distance };
    return layers;
  }

  pickHit(raycaster) {
    const layers = this.pickLayers(raycaster);
    return layers.parcel ?? layers.civic ?? layers.reserve ?? layers.ground;
  }

  pick(raycaster) {
    return this.pickHit(raycaster)?.id ?? null;
  }

  /** Grid maths, not geometry: which parcel covers this world position. */
  parcelAt(x, z) {
    const selection = this.selectionAt(x, z);
    return selection?.kind === 'parcel' ? selection.id : null;
  }

  /** Grid maths fallback for thin geometry and the selectable reserve lawn. */
  selectionAt(x, z) {
    const bx = Math.floor(x / PITCH);
    const bz = Math.floor(z / PITCH);
    if (bx < 0 || bz < 0 || bx >= this.city.blocksX || bz >= this.city.blocksZ) return null;
    const localX = x - bx * PITCH - ROAD;
    const localZ = z - bz * PITCH - ROAD;
    if (localX < 0 || localZ < 0) return null;
    const tx = Math.floor(localX / TILE);
    const tz = Math.floor(localZ / TILE);
    if (tx >= TILES_PER_BLOCK || tz >= TILES_PER_BLOCK) return null;
    const tileId = `p${bx}${bz}${tx}${tz}`;
    return strategicSelectionAtTile(this.city, tileId, this.lastState);
  }

  prepareWorld() {
    // The port joins the scene a few frames after the board; stop looking after 600 frames on a scene without one.
    if (!this._surfaceRolesReady && (this._surfaceRoleTries = (this._surfaceRoleTries ?? 0) + 1) <= 600) {
      this._surfaceRolesReady = tagPortSurfaces(this.root.parent);
    }
  }

  update(dt, elapsed) {
    this.prepareWorld();
    const wet = wetRoadFactor(weatherOf(this.lastState));
    updateWetRoadMaterial(this._roadMaterial, wet);
    this.coreLayer?.step(dt);
    // Signal lamps share the traffic red/amber/green clock.
    this.streetscape?.update?.(elapsed ?? 0);
    for (const [id, animation] of this.demolitionStrikeAnimations) {
      animation.t += dt;
      const k = Math.min(1, animation.t / animation.duration);
      const settle = 1 - Math.pow(1 - k, 3);
      const jolt = Math.sin(k * Math.PI * 5) * (1 - k);
      animation.group.position.set(
        animation.basePosition.x + jolt * 0.34,
        animation.basePosition.y + Math.abs(jolt) * 0.08,
        animation.basePosition.z - jolt * 0.18,
      );
      animation.group.scale.set(
        animation.baseScale.x,
        animation.baseScale.y * THREE.MathUtils.lerp(
          animation.fromScaleY,
          animation.toScaleY,
          settle,
        ),
        animation.baseScale.z,
      );
      animation.group.rotation.set(
        THREE.MathUtils.lerp(animation.baseRotation.x, animation.targetTiltX, settle),
        animation.baseRotation.y + jolt * 0.045,
        THREE.MathUtils.lerp(animation.baseRotation.z, animation.targetTiltZ, settle)
          - jolt * 0.075,
      );
      if (k >= 1) {
        this._disposeVisualGroup(animation.group);
        if (animation.replacement?.parent) animation.replacement.visible = true;
        this.demolitionStrikeAnimations.delete(id);
        if (this.lastState) this._writeStaticBuildings(this.lastState);
      }
    }
    for (const [id, animation] of this.demolitionAnimations) {
      animation.t += dt;
      const k = Math.min(1, animation.t / animation.duration);
      const eased = k * k;
      animation.group.scale.set(
        animation.baseScale.x * (1 - eased * 0.12),
        animation.baseScale.y * Math.max(0.001, 1 - eased),
        animation.baseScale.z * (1 - eased * 0.12),
      );
      animation.group.rotation.y = animation.baseRotation + eased * 0.14;
      if (k >= 1) {
        this._disposeVisualGroup(animation.group);
        this.demolitionAnimations.delete(id);
        if (this.lastState) this._writeStaticBuildings(this.lastState);
      }
    }
    for (const [id, animation] of this.completionAnimations) {
      animation.t += dt;
      const k = Math.min(1, animation.t / animation.duration);
      const eased = 1 - Math.pow(1 - k, 3);
      animation.group.scale.set(
        animation.baseScale.x,
        animation.baseScale.y * Math.max(0.001, eased),
        animation.baseScale.z,
      );
      animation.site.traverse((child) => {
        if (child.material?.opacity !== undefined) child.material.opacity = 0.9 * (1 - k);
      });
      animation.site.position.y = k * 4;
      if (k >= 1) {
        this._disposeVisualGroup(animation.site);
        this._disposeVisualGroup(animation.group);
        this.completionAnimations.delete(id);
        if (this.lastState) {
          this._writeStaticBuildings(this.lastState);
          this._syncDynamicBuildings(this.lastState);
        }
      }
    }

    // Trams run the reservation centreline. Longitudinal control lives in vehicles/tram.js.
    for (const tram of this.trams) {
      const { item } = tram;
      const span = Math.max(1, item.to - item.from);
      let along = item.from + span * tram.t;
      const canStep = !tram.mischiefStopped && !(this.reducedMotion && tram.placed);
      if (canStep) {
        tram.placed = true;
        const nose = tram.halfLength ?? 7;
        const probe = along + (tram.dir >= 0 ? 1 : -1) * nose;
        const px = item.axis === 'v' ? item.x : probe;
        const pz = item.axis === 'v' ? probe : item.z;
        const heading = item.axis === 'v'
          ? (tram.dir > 0 ? 0 : Math.PI)
          : (tram.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        const signal = this.traffic && typeof this.traffic.signalStateAt === 'function'
          ? this.traffic.signalStateAt(px, pz, heading, elapsed)
          : null;
        const nearDist = this.traffic && typeof this.traffic.junctionDistanceAt === 'function'
          ? this.traffic.junctionDistanceAt(px, pz)
          : null;
        const signalDist = Number.isFinite(nearDist)
          ? Math.max(0, nearDist - 9.6)
          : undefined;
        const stepped = stepTram(tram, dt, {
          signal, signalDist, trams: this.trams,
        });
        along = stepped.along;
        tram.t = (along - item.from) / span;
      } else {
        tram.speed = 0;
      }
      updateTramDoors(tram, TRAM_DWELL);
      // Double-ended: the hull stays on the reservation heading. Only travel
      // flips, otherwise the 14 m body pirouettes a half/full turn at the stop.
      tram.visualRot = tramReservationYaw(item);
      const travel = tramTravelForward(item.axis, tram.dir);
      tram.fwdX = travel.x;
      tram.fwdZ = travel.z;
      tram.yaw = Math.atan2(tram.fwdX, tram.fwdZ);
      const slide = tram.mischiefSlide ?? 0;
      const slideYaw = tram.visualRot * DEG;
      const slideX = Math.sin(slideYaw) * slide;
      const slideZ = Math.cos(slideYaw) * slide;
      if (item.axis === 'v') {
        tram.group.position.set(item.x + slideX, 0.16, along + slideZ);
      } else {
        tram.group.position.set(along + slideX, 0.16, item.z + slideZ);
      }
      tram.group.rotation.y = tram.visualRot * DEG;
      tram.mischiefTarget?.syncPick();
    }

    // Route buses. The fleet owns signals, following, tram yield, doors and body motion;
    // the board only hands it the clock and the two layers it has to see.
    this.interchangeBusFleet?.update(dt, {
      elapsed,
      traffic: this.traffic ?? null,
      trams: this.trams,
      reducedMotion: this.reducedMotion,
    });

    if (this.selectionRing.visible && !this.reducedMotion) {
      const pulse = 1 + Math.sin(elapsed * 3.2) * 0.05;
      this.selectionRing.scale.setScalar((this.selectionBaseScale ?? 1) * pulse);
    }
  }

  dispose() {
    this._tramObstacleUnsub?.();
    this._tramObstacleUnsub = null;
    globalThis.window?.removeEventListener(BOARD_LENS_EVENT, this._onLensChange);
    for (const animation of this.demolitionStrikeAnimations.values()) {
      this._disposeVisualGroup(animation.group);
    }
    for (const animation of this.demolitionAnimations.values()) {
      this._disposeVisualGroup(animation.group);
    }
    for (const animation of this.completionAnimations.values()) {
      this._disposeVisualGroup(animation.group);
      this._disposeVisualGroup(animation.site);
    }
    for (const record of this.dynamicBuildings.values()) this._disposeVisualGroup(record.group);
    for (const group of this.siteSheds.values()) this._disposeVisualGroup(group);
    for (const record of this.siteKits.values()) this._disposeVisualGroup(record.group);
    for (const record of this.constructionStages.values()) this._disposeVisualGroup(record.group);
    for (const record of this.renovationScaffolds.values()) this._disposeVisualGroup(record.group);
    for (const parcelId of new Set(
      [...(this.buildingOpenings?.values() ?? [])].map((record) => record.parcelId),
    )) this._removeBuildingOpenings(parcelId);
    if (this.footprintGhost) this._disposeVisualGroup(this.footprintGhost);
    this.footprintGhost = null;
    this.demolitionStrikeAnimations.clear();
    this.demolitionAnimations.clear();
    this.completionAnimations.clear();
    this.dynamicBuildings.clear();
    this.siteSheds.clear();
    this.siteKits.clear();
    this.constructionStages.clear();
    this._constructionFits?.clear();
    this.renovationScaffolds.clear();
    this._rematerialized.clear();
    for (const target of this.mischiefTargets) target.setOriginal({ visible: true, scale: 1 });
    this.root.traverse((child) => {
      if (child.isMesh || child.isLine) {
        const g = child.geometry;
        // Kit marks userData.kitDisposed after its own dispose; skip re-entry.
        if (g && !g.userData?.kitDisposed && !g.userData?.streetscapeDisposed && !g.userData?.p1Shared) {
          g.dispose();
        }
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          // Shared library materials + their maps are owned by MaterialLibrary.
          if (isSharedLibraryMaterial(material)) continue;
          if (material?.userData?.p1Shared) continue;
          if (material?.userData?.reserveLeafAtlasCopy || material?.userData?.pondLeafOwnedMap) {
            material.map?.dispose();
          }
          material?.dispose?.();
        }
      }
    });
    // Bus textures are not reachable from the traverse above: three materials never
    // dispose their own maps, so the fleet releases its canvases itself.
    this.interchangeBusFleet?.dispose();
    this.interchangeBusFleet = null;
    this.interchangeBuses = [];
    // Clear kit / streetscape caches (geometry already released by traverse, or
    // dispose remaining unattached procedural car parts).
    this.streetscape?.dispose();
    this.streetscape = null;
    this.buildingKit?.dispose();
    this.buildingKit = null;
    this.materials?.dispose();
    this.materials = null;
    this.mischiefPickGeometry.dispose();
    this.mischiefPickMaterial.dispose();
  }
}

export { OWNER_COLOURS };
