// District Deck V3.03 Batch 5 / V3.10 W2-CROWD / V3.32 — renderer-only people and crowds.
// Core records own quarter anchors. This adapter owns records, the navmesh gate, pick proxies,
// interpolation phase and the spend toast; no method writes through to the supplied state.
// Actors walk only on the render navmesh (I-29 hard gate: no centre inside a building).
//
// V3.32 split the figure itself out into `render/people/`, one file per lane, so seats can work
// on silhouette, head, wardrobe, gait, materials and cast identity concurrently without editing
// the same source. What stays here is the adapter: records, navmesh, picking, the state
// boundary, the auction crowd and the budget gate. Geometry, materials and pose maths are
// `people/figure.js`, `people/head.js`, `people/wardrobe.js`, `people/materials.js`,
// `people/cast.js` and `people/rig.js`; the batch and the pose → matrix write are
// `people/index.js`. See `docs/next-phase/V332-HUMAN-AAA-SPEC.md` §5.

import * as THREE from 'three';
import { NavMesh } from './navmesh.js';
import {
  FIGURE_SCALE, IDENTITY, PROPORTIONS, geometryTriangles, instanced, mergeParts, profileSolid,
  unitFrom, HIDDEN_SCALE, UP,
} from './people/core.js';
import {
  buildContactGeometry, buildFootGeometry, buildForearmGeometry, buildLimbSegmentGeometry,
  buildNeckGeometry, buildPelvisGeometry, buildTrunkGeometry, buildUpperArmGeometry,
} from './people/figure.js';
import { buildHairGeometry, buildHeadGeometry } from './people/head.js';
import { createFigureMaterials, disposeFigureMaterials } from './people/materials.js';
import { styleForPerson } from './people/cast.js';
import {
  PeopleFigureBatch, PERSON_CAPACITY, SITE_CREW_CAPACITY, SITE_CREW_SITE_CAP,
  STREET_PERSON_CAPACITY, matrixAlongPath, pathLengthOf, pathPosition, poseFigure, yawAlongPath,
} from './people/index.js';
import { activeParcel } from '../core/city.js';
import { TILE } from '../core/grid.js';
import {
  clearVehicleHulls, pushOutOfBuildings, resolveSurfaceStep, trafficYield,
} from './people/city-physics.js';
import { buildCityWorld, isCarriageway } from './people/city-surface.js';
import { WALK_SPEED } from './people/city-wander.js';

export const PEOPLE_RENDER_BUDGET = Object.freeze({
  // V3.32 §3. A lane that spends this must show the measured `stats()` in the same commit as
  // the geometry that needed it.
  //
  // Raised 18 → 26 on 2026-08-11. The 18 was authored before any family was built and was a
  // guess, not a measurement; the wardrobe lane spent it exactly, which would have blocked the
  // quadruped slot set behind a reclaim invented by the spec rather than required by the
  // renderer. An InstancedMesh is one draw whatever its instance count, and 26 draws for the
  // entire population of a board is not a cost worth contorting the geometry around.
  // Triangles remain the real constraint and are unchanged at 220 000.
  drawCalls: 26,
  triangles: 220_000,
});

/**
 * Seconds for one full idle beat — the breath, weight-shift and look-about cycle a standing
 * figure runs between moves. Long on purpose: a fast idle reads as fidgeting at board altitude.
 */
const IDLE_BEAT_SECONDS = 6.5;

/** People-layer site workers share one bounded beat per site and simulation quarter. */
export const SITE_CREW_WORK_CYCLE_SECONDS = IDLE_BEAT_SECONDS;

export function advanceSiteCrewWorkCycle(cycle, quarter, dt = 0, reducedMotion = false) {
  const q = Math.max(0, Math.floor(Number(quarter) || 0));
  const fresh = !cycle || cycle.quarter !== q;
  const before = fresh ? 0 : Math.min(1, Math.max(0, Number(cycle.progress) || 0));
  const progress = reducedMotion
    ? 1
    : Math.min(1, before + Math.max(0, Number(dt) || 0) / SITE_CREW_WORK_CYCLE_SECONDS);
  return Object.freeze({
    quarter: q,
    progress,
    running: progress < 1,
    complete: progress >= 1,
    runsOnce: true,
  });
}

/**
 * Where the spend label sits above an avatar. A head's clearance over the crown, derived, because
 * it was 4.1 — a hand's breadth over the r01 figure's 3.72 crown, and more than two whole figures
 * up in the air once stature moved. The sprite's own 7.2 x 2.7 m does NOT move with it: that is a
 * screen-legibility affordance read at play altitude rather than a thing the figure wears. g03.
 */
const TOAST_RISE = PROPORTIONS.height + PROPORTIONS.headHeight;

export const CROWD_RENDER_BUDGET = Object.freeze({
  // V3.32 §3, crowd row. **Draws 4 → 10; triangles unchanged.**
  //
  // The 4 was authored while a bidder was `CapsuleGeometry(0.52, 0.48, 2, 6)` with a box for a
  // paddle, which is the same position the ambient row was in before the infrastructure seat
  // corrected it: a budget written against a placeholder, not against a figure. A human is ten
  // families — the sheet below is the ambient street's own, family for family, because the
  // crowd is the same animal and three systems with three anatomies is the defect this
  // programme keeps finding in other guises. The tenth family is the auction paddle, and it
  // costs nothing extra: it takes the slot the street spends on a shoulder bag.
  //
  // Triangles do NOT move, and that is the reclaim. Measured at forty instances the sheet is
  // 56 640 against the standing 60 000 — 1 416 a figure, where the cast is 2 502 and the street
  // 1 198 — so the whole rebuild is paid for out of headroom the capsules were not using.
  // `mvp/tests/_crowd-lod-probe.mjs` is the measurement.
  drawCalls: 10,
  /**
   * **Corrected 2026-08-17, V3.70 CROWD, and the comment it replaces was false in both
   * directions.** The line above it read "triangles unchanged" while the constant carried
   * 66 000; `mvp/tests/_crowd-lod-probe.mjs` measured the sheet at **1 496 a figure, 59 840 at
   * forty** — 6 160 of slack nobody had spent and a comment claiming the opposite. The 66 000
   * was authored against a 63 680 measurement taken before the figure-mass round came back down,
   * and was never re-measured after.
   *
   * What is here now is measured on the shipped sheet, this round, at the capacity the spec
   * states rather than at whatever an auction happens to draw:
   *
   * | build | tris/figure | @40 |
   * |---|---:|---:|
   * | before this round, two prop slots | 1 496 | 59 840 |
   * | **shipped: four prop slots** | **1 592** | **63 680** |
   *
   * The 96 are the paddle's grip and the flat cap's brim, taken as two more instances of the one
   * prop shell rather than as two more families, so §3's draw budget does not move. The gate is
   * held 820 above the measure — enough that a ring count may be nudged without an edit here,
   * not enough to hide a family in.
   */
  triangles: 64_500,
  capacity: 40,
});

/**
 * Salt namespace 800–899, V3.32 §5.
 *
 * `core.js`'s `SALT` table is another lane's file this round, so the crowd declares its own block
 * here rather than editing that table. The numbers are clear of everything in it — CORE 0,
 * FIGURE 100, HEAD 200, WARDROBE 300, RIG 400, MATERIALS 500, CAST 600, AMBIENT 700 — so no
 * lane's variation is re-rolled by this one. One salt per axis, so adding an axis later never
 * shifts an existing one.
 */
const CROWD_SALT = Object.freeze({
  BUILD: 800,
  GIRTH: 801,
  BEAT: 802,
  GARMENT: 803,
  LOWER: 804,
  SKIN: 805,
  HAIR_TONE: 806,
  HAIR_STYLE: 807,
  SHOE: 808,
  BID: 809,
  HAT: 810,
  PADDLE: 811,
  // V3.70 CROWD. One salt per axis, so adding an axis never re-rolls an existing one.
  CARRY: 812,
  ARM_L: 813,
  ARM_R: 814,
  LOOK: 815,
  CRANE: 816,
  TILT: 817,
});

/**
 * The ring counts a bidder is built at, against the cast's own (`figure.js` `RING_COUNTS`,
 * `head.js` `HEAD_RING_COUNTS`) and the street's (`ambient-life.js` `AMBIENT_LOD`).
 *
 * Measured by `mvp/tests/_crowd-lod-probe.mjs`, at forty instances:
 *
 * | build | tris/figure | @40 |
 * |---|---:|---:|
 * | the street's counts | 1 198 | 47 920 |
 * | **this table** | **1 416** | **56 640** |
 * | ears back on, two-step limb caps | 1 732 | 69 280 |
 * | the cast's counts on every mass | 2 394 | 95 760 |
 *
 * Richer than the street and poorer than the cast, which is where the crowd stands: forty
 * figures clustered inside a 26 m subject box (`people-lab.js` `STATIONS.crowd`) are seen at
 * about half the distance the reserve is graded at, and the budget has the room. It is still a
 * *sampling* difference from the cast rather than a shape one — an eight-sided thigh and a
 * ten-sided thigh are the same thigh — so a bidder and a consultant are one species.
 *
 * `ears` and `locks` are off and the hair's back-and-sides mass with them; the crown cap starts
 * at `capFrom` 0.50 instead of 0.62 so the occiput is still closed at every angle.
 */
const CROWD_LOD = Object.freeze({
  trunk: 10,
  limb: 8,
  limbCapSteps: 1,
  hand: 6,
  handCapSteps: 1,
  foot: 7,
  footLast: 5,
  contact: 10,
  skull: 10,
  nose: 5,
  ears: false,
  neck: 6,
  hair: 9,
  capFrom: 0.50,
  sides: false,
  locks: false,
  gear: 6,
});

/**
 * The ten families a bidder draws, back to front. One geometry and one material each; a slot is
 * one instance of one.
 *
 * Seven of the cast's twenty-six families are not here and each is a decision rather than an
 * omission, taken for the same reasons `ambient-life.js` takes them: `torso` is swept into
 * `chest` by `buildTrunkGeometry`, `neck` is merged into the head, `face` is dropped because
 * eyes and a mouth are under a pixel at this station, `handL`/`handR` are drawn by the forearm
 * the way the cast draws them, and the eight wardrobe families and the five quadruped families
 * have no bidder to hang on.
 */
const CROWD_FAMILIES = Object.freeze([
  { key: 'contact', slots: ['contact'], material: 'contact', order: 2 },
  { key: 'pelvis', slots: ['pelvis'], material: 'legGarment', shadow: true },
  {
    key: 'limb',
    slots: ['thighL', 'thighR', 'shinL', 'shinR'],
    material: 'legGarment',
    shadow: true,
  },
  { key: 'foot', slots: ['footL', 'footR'], material: 'shoe' },
  { key: 'trunk', slots: ['chest'], material: 'torsoGarment', shadow: true },
  { key: 'upperArm', slots: ['upperArmL', 'upperArmR'], material: 'sleeve' },
  { key: 'forearm', slots: ['forearmL', 'forearmR'], material: 'skin' },
  { key: 'head', slots: ['head'], material: 'skin', shadow: true },
  { key: 'hair', slots: ['hair'], material: 'hair' },
  /**
   * **Four slots, one shell, one draw — and the two new ones are the flat-card fix.**
   *
   * §2.2 objects to a flat card standing in for a modelled thing, and the r2 critic's crowd list
   * carries the paddle under exactly that heading. A card is flat because it is *only* a card:
   * no grip, no section, nothing to say a hand is holding it rather than it hovering. So the
   * paddle is now a board **and a grip**, and the flat cap a crown **and a brim** — both taken
   * as further instances of the one prop shell at different scales, which is the segmentation §3
   * asks for before a family is spent. Draws do not move. Measured cost is 96 triangles a
   * figure, 3 840 at forty, and `CROWD_RENDER_BUDGET` above carries the re-measurement.
   */
  {
    key: 'prop',
    slots: ['prop:paddle', 'prop:handle', 'prop:hat', 'prop:brim'],
    material: 'prop',
    shadow: true,
  },
]);

/**
 * The crowd's own wardrobe, and it is deliberately not the street's.
 *
 * A Saturday auction is coats and jackets standing still on a nature strip, not the beach and
 * promenade palette `ambient-life.js` seeds; the tables are stated here rather than imported
 * because that file publishes neither, and because a bidding crowd that came out the same colour
 * as the passers-by behind it would lose the one thing that separates the two groups on the
 * plate. Values are authored at the saturation §2.9 grades rather than clamped at write time.
 */
const CROWD_OUTER = Object.freeze([
  '#2b4a6b', '#8f4234', '#b3842c', '#2f6a55', '#5b4a72', '#cdbfa2', '#39424e', '#a4523f',
  '#31607e', '#6c6f4a',
]);
const CROWD_LOWER = Object.freeze([
  '#22303e', '#3a3630', '#2c3a34', '#41352f', '#2a2f3a', '#4a4034',
]);
const CROWD_SKIN = Object.freeze(['#f3c9a7', '#dca57d', '#b87852', '#815035', '#5a3426']);
const CROWD_HAIR = Object.freeze(['#201915', '#4b2e21', '#85532c', '#d5a84e', '#923f28', '#342b3d']);
const CROWD_SHOE = Object.freeze(['#241f1d', '#2f2822', '#3a2b22', '#1e2228', '#4a3a2c']);
/** Gold and cream: the auction signal colour, and the one high-chroma note on the plate. */
const CROWD_PADDLE = Object.freeze(['#f6d070', '#fff0cc', '#efc25a']);

/** Hair mass per style, as an instance scale on the one cap. Bald hides the slot. */
const CROWD_HAIR_STYLES = Object.freeze({
  'short-cap': { x: 1.0, y: 1.0, z: 1.0, drop: 0 },
  bob: { x: 1.07, y: 1.04, z: 1.07, drop: 0.030 },
  'long-bob': { x: 1.10, y: 1.14, z: 1.12, drop: 0.075 },
  bald: null,
});
const CROWD_HAIR_STYLE_KEYS = Object.freeze(Object.keys(CROWD_HAIR_STYLES));

/**
 * How far the merged neck stub is stretched below the jaw. `ambient-life.js` states the whole
 * reasoning; the short of it is that the head holds level while the chest bobs under it, so a
 * neck of natural length rigid to the head bares a ring of sky at the collar on the low beat.
 */
const NECK_STRETCH = 1.6;

/** Which hand the paddle is in. One side for the whole crowd: forty mirrored arms read as noise. */
const PADDLE_SIDE = 'R';
/**
 * Which way a foot turns about the figure's own lateral axis to lift the heel and plant the toe.
 *
 * Measured rather than reasoned: `mvp/tests/v370-crowd-figure.mjs` reports, for both signs, which
 * end of the foot ends up the low one. `+1` puts the toe down and the heel up, which is standing
 * on your toes; `−1` is a person rocking back on their heels, which is a different gesture and
 * not the one the back of a crowd makes.
 */
const CRANE_SIGN = 1;
/**
 * The paddle, as a board on a grip rather than as a card in the air.
 *
 * **What changed and why.** The r2 critic's crowd list carries the paddle under §2.2's flat-card
 * objection, and it was right: a slab 0.40 wide by 0.52 tall by **0.045** thick is 11 per cent as
 * deep as it is broad, held in a fist that has nothing to hold. Two changes, and the second is
 * the one that does the work:
 *
 * 1. The board is thicker and shorter — 0.085 against 0.045, 0.46 against 0.52 — so its edge has
 *    a section a raking light can find, and its proportion is a bidding number rather than a
 *    ping-pong bat.
 * 2. It has a **grip**, `PADDLE_GRIP`, running down out of the board and into the fist. That is
 *    the whole of the "a person is holding this" read, and it is what a card cannot have.
 *
 * The rise is still short on purpose: the board's lower edge has to reach back down past the
 * knuckles or it reads as floating, which is the fault the old box floating two body-heights over
 * a capsule was. With the grip below it the hand is now *on* the object rather than under it.
 *
 * Stated as the g02 seat measured them, on the r01 figure, and carried across on `FIGURE_SCALE`:
 * a card is a thing a person holds and it is the same fraction of that person at any stature. g03.
 */
const PADDLE_RISE = 0.30 * FIGURE_SCALE;
const PADDLE_SIZE = Object.freeze({
  w: 0.40 * FIGURE_SCALE, h: 0.46 * FIGURE_SCALE, d: 0.085 * FIGURE_SCALE,
});
const PADDLE_GRIP = Object.freeze({
  w: 0.090 * FIGURE_SCALE, h: 0.30 * FIGURE_SCALE, d: 0.090 * FIGURE_SCALE,
  /** How far the grip's centre sits below the board's. Enough to overlap and not to float. */
  drop: 0.30 * FIGURE_SCALE,
});
/** The grip is timber, not painted board: the one value break on the object. */
const CROWD_GRIP = Object.freeze(['#6b4a2c', '#4c3423', '#7d6142']);

/**
 * The flat cap, as a crown and a brim.
 *
 * Same argument as the paddle one step down in importance: a pillbox on a head is a hat-shaped
 * absence. The brim is the same shell again, wide and thin, pushed forward of the crown and
 * dropped to the browline, and it is what makes the silhouette read as headwear at board zoom
 * rather than as a lighter patch of hair.
 */
const CROWD_BRIM = Object.freeze({ w: 1.34, h: 0.09, d: 1.46, forward: 0.30, drop: 0.30 });

/**
 * **Arm carriages — the answer to "one pose replicated forty times".**
 *
 * The r2 critic's crowd finding, in its own words: *"six of the ten legible bidders share one
 * shoulder line, one stance, one right-arm-up paddle angle and one trouser."* The stance was
 * never the problem — `rig.js` `solveIdle` already hashes weight side, stance width, toe-out,
 * breath and look off the figure id, and a bidder gets a different id from every other. What was
 * identical was the **carriage**: every arm hung, or one arm went up at 130°, and there was no
 * third thing a person standing at an auction does with their arms.
 *
 * There is no bidding carriage in `rig.js` and inventing one there would be a second solver in
 * another lane's file. So each entry below is a rigid turn of the solved arm about its own two
 * joints, exactly as `_raiseArm` already turns the paddle arm: the shoulder is read back out of
 * the slot the rig wrote, the whole chain turns about it, then the forearm and hand turn about
 * the elbow. **Segments cannot leave their sockets under a rigid rotation about the socket** —
 * that is a property of the construction rather than a hope — so the only thing left to measure
 * is whether a forearm ends up inside a chest, and `mvp/tests/v370-crowd-figure.mjs` measures it
 * on the shipped write path at every beat.
 *
 * Angles, all radians:
 *  - `pitch` — positive swings the arm forward and up about the figure's own lateral axis.
 *  - `abduct` — **positive tucks the elbow in toward the body**, on a hanging arm. The same
 *    expression on `_raiseArm`'s *raised* arm takes it away instead, and that is geometry rather
 *    than a slip: a rotation about the sagittal axis moves a hand that is below its shoulder and
 *    a hand that is above it to opposite sides. The first cut of this table assumed the raised
 *    arm's reading and every carriage spread outward — measured on the shipped write path, a
 *    folded pair's forearms ended 1.32 m apart, which is a shrug. The numbers below were fitted
 *    against measured wrist positions on a 1.56 m build, landmarks head 1.700, shoulder 1.380,
 *    chest 1.296, pelvis 0.936.
 *  - `flex` — the elbow, positive bringing the hand forward and up.
 */
const CROWD_ARM_CARRIAGE = Object.freeze({
  /** The rig's own hang, untouched. Wrist x ±0.45, y 0.87. Baseline trunk clearance 8.9 mm. */
  down: { pitch: 0, abduct: 0, flex: 0 },
  /** Elbows softly bent, hands a little forward of the seam. 14.2 mm. */
  atEase: { pitch: -0.18, abduct: 0, flex: 0.69 },
  /** Forearms up and forward, hands in front of the chest — the catalogue-and-coffee stand. 9.3 mm. */
  front: { pitch: 0.72, abduct: 0.22, flex: 1.00 },
  /** Hands at the waist with the elbows carried back and out. 8.5 mm. */
  hips: { pitch: -0.78, abduct: 0.05, flex: 1.70 },
  /** Hands behind the back — the only carriage with the wrist at a negative z, −0.28. 8.7 mm. */
  behind: { pitch: -0.90, abduct: 0.26, flex: 0.46 },
  /** Phone at the ear: wrist up at y 1.52 and back at z 0.07, beside the jaw. 9.9 mm. */
  phone: { pitch: 1.30, abduct: 0.30, flex: 2.55 },
  /** A hand up at the jaw, watching the bidding. y 1.57. 9.6 mm. */
  chin: { pitch: 1.10, abduct: 0.24, flex: 2.35 },
});

/** What the free arm does when the other one is holding a paddle. */
const CROWD_FREE_ARM = Object.freeze([
  ['down', 20], ['atEase', 20], ['front', 14], ['hips', 12], ['behind', 12], ['chin', 12],
  ['phone', 10],
]);
/** What both arms do together when neither is holding anything. */
const CROWD_BOTH_ARMS = Object.freeze([
  ['front', 22], ['hips', 14], ['behind', 14], ['split', 50],
]);
/** Where the paddle arm is. `rest` leaves the card at the waist; the other two are raises. */
const CROWD_PADDLE_STATE = Object.freeze([['rest', 52], ['shoulder', 20], ['high', 28]]);

/** Weighted pick from `[[key, weight], ...]`, by a salted unit. Deterministic, order-stable. */
function pickWeighted(table, key, salt) {
  const total = table.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = unitFrom(key, salt) * total;
  for (const [name, weight] of table) {
    roll -= weight;
    if (roll < 0) return name;
  }
  return table[table.length - 1][0];
}

/** Pick from a frozen list by a named salt. */
function pickFrom(list, key, salt) {
  return list[Math.floor(unitFrom(key, salt) * list.length) % list.length];
}

/** The joint at a posed segment's parent end, recovered from the slot the rig wrote. */
function jointTop(slot, natural, target = new THREE.Vector3()) {
  const axis = UP.clone().applyQuaternion(slot.quaternion);
  return target.copy(slot.position).addScaledVector(axis, slot.scale.y * natural * 0.5);
}

function toVectorPath(points) {
  return points.map((point) => new THREE.Vector3(point.x, 0, point.z));
}

/**
 * Bounded instanced draws for all named people and the avatar. Instance colours carry
 * archetype identity; the figure itself is assembled by `people/index.js`.
 */
function raycastVisiblePersonProxy(raycaster, hits) {
  // Three's Mesh.raycast does not honor Object3D.visible by itself.
  for (let node = this; node; node = node.parent) if (!node.visible) return;
  THREE.Mesh.prototype.raycast.call(this, raycaster, hits);
}

export class PeopleLayer {
  constructor(city, { camera = null } = {}) {
    this.city = city;
    this.camera = camera;
    this.navmesh = new NavMesh(city);
    this.root = new THREE.Group();
    this.root.name = 'v303:people';
    this.records = new Map();
    this.pickTargets = [];
    this.duration = 8;
    this.phase = 1;
    this.beat = 0;
    this.siteCrewCycles = new Map();
    this.reducedMotion = false;
    this.state = null;
    this.diagnostics = new Set();
    this.spendToasts = [];
    this.roadUsers = [];
    this.signalElapsed = 0;
    this.world = buildCityWorld(city);

    // The cast batch. Its meshes are added to this layer's root directly rather than to a
    // group of their own, because the render-purity fixture counts instanced children here.
    this.figures = new PeopleFigureBatch({ capacity: PERSON_CAPACITY });
    this.meshy = null;
    this.root.add(...this.figures.meshes);
    // Named aliases kept so anything reaching for a family by name still finds it.
    this.body = this.figures.body;
    this.shoulders = this.figures.shoulders;
    this.head = this.figures.head;
    this.hair = this.figures.hair;
    this.legs = this.figures.legs;
    this.arms = this.figures.arms;
    this.badge = this.figures.badge;
    this.contact = this.figures.contact;
    this.accessory = this.figures.accessory;

    // The click target, sized off the figure rather than off a remembered number. It was a
    // hard-coded 1.6 x 4.2 x 1.6 box — the r01 comment in `core.js` cited that 4.2 as the reason
    // world scale could not move — so at 1.84 m stature it would have been a two-and-a-quarter
    // figure-height column of pick volume standing over every consultant on the board. Half a
    // metre of shoulder-and-a-bit either side, and a head of headroom over the crown. g03.
    this.pickGeometry = new THREE.BoxGeometry(
      PROPORTIONS.width.shoulder * 2, PROPORTIONS.height * 1.13, PROPORTIONS.width.shoulder * 2,
    );
    this.pickMaterial = new THREE.MeshBasicMaterial({ visible: false });
  }

  attachMeshy(pool) {
    this.meshy = pool ?? null;
  }

  _ensureNav() {
    this.navmesh.ensure(this.city);
    return this.navmesh;
  }

  _targetRecord(id, archetypeId, fromAnchor, toAnchor, state, pickable, pendingOutcome = null, identityId = 0) {
    // V3.32: per-person, not per-archetype — this is what carries the family child's
    // separate height into the board. Reading ARCHETYPE_STYLE directly here meant the
    // child only existed in lab modes routed through castFigure.
    const [, height, width] = styleForPerson(id, archetypeId);
    const prior = this.records.get(id);
    const nav = this._ensureNav();
    let path = toVectorPath(nav.routeFor(fromAnchor, toAnchor, state, id));
    let routeHidden = false;
    if (!path.length) {
      const fromKey = `${fromAnchor?.kind ?? 'unknown'}:${fromAnchor?.id ?? '?'}`;
      const toKey = `${toAnchor?.kind ?? 'unknown'}:${toAnchor?.id ?? '?'}`;
      const diagnostic = `NO_DISPLAY_ROUTE:${fromKey}:${toKey}`;
      if (import.meta.env?.PROD !== true) throw new Error(diagnostic);
      routeHidden = true;
      const safePoint = prior
        ? pathPosition(prior.path, this.phase, new THREE.Vector3(), nav)
        : (() => {
          const stand = nav.standPosition(fromAnchor, state, id);
          return new THREE.Vector3(stand.x, 0, stand.z);
        })();
      path = [safePoint];
      if (!this.diagnostics.has(diagnostic)) {
        this.diagnostics.add(diagnostic);
        console.error(diagnostic);
      }
    }
    // Absolute hard gate on every authored sample.
    path = path.map((point) => {
      const safe = nav.enforceWalkable(point.x, point.z);
      return new THREE.Vector3(safe.x, 0, safe.z);
    });
    const proxy = prior?.proxy ?? (pickable
      ? new THREE.Mesh(this.pickGeometry, this.pickMaterial)
      : null);
    if (proxy) {
      proxy.name = `v303:person-pick:${id}`;
      proxy.userData.personId = id;
      proxy.userData.pickKind = 'person';
      proxy.raycast = raycastVisiblePersonProxy;
      if (!prior?.proxy) {
        this.root.add(proxy);
        this.pickTargets.push(proxy);
      }
    }
    const sameTrip = prior
      && prior.fromAnchor?.kind === fromAnchor?.kind
      && prior.fromAnchor?.id === fromAnchor?.id
      && prior.toAnchor?.kind === toAnchor?.kind
      && prior.toAnchor?.id === toAnchor?.id;
    if (prior && !sameTrip && !this.reducedMotion && prior.path?.length) {
      const cur = pathPosition(prior.path, prior.travelPhase ?? 0, new THREE.Vector3(), nav);
      const start = path[0];
      if (start && Math.hypot(start.x - cur.x, start.z - cur.z) > 0.8) {
        path = [new THREE.Vector3(cur.x, 0, cur.z), ...path];
      }
    }
    const length = pathLengthOf(path);
    const walkSeconds = length < 0.4 ? 0.01 : Math.max(0.8, length / WALK_SPEED);
    return {
      id,
      archetypeId,
      identityId,
      pendingOutcome,
      fromAnchor: { ...fromAnchor },
      toAnchor: { ...toAnchor },
      path,
      height,
      width,
      routeHidden,
      walkSeconds,
      travelPhase: this.reducedMotion ? 1 : (sameTrip ? (prior.travelPhase ?? 0) : 0),
      lookYaw: sameTrip ? prior.lookYaw : null,
      lastX: sameTrip ? prior.lastX : undefined,
      lastZ: sameTrip ? prior.lastZ : undefined,
      mischief: sameTrip ? prior.mischief ?? null : null,
      // Renderer-owned compatibility evidence for the Batch 5 purity fixture.
      // Motion uses `path`; these matrices are endpoint snapshots only.
      previousMatrix: matrixAlongPath(path, 0, height, width, new THREE.Matrix4(), nav),
      nextMatrix: matrixAlongPath(path, 1, height, width, new THREE.Matrix4(), nav),
      proxy,
    };
  }

  _siteCrewRecord(parcel, crewIndex) {
    const robot = crewIndex === 2;
    const archetypeId = robot ? 'site-robot' : 'cheap-builder';
    const role = robot ? 'robot' : `human-${crewIndex + 1}`;
    const id = `site-crew:${parcel.id}:${role}`;
    const [, height, width] = styleForPerson(id, archetypeId);
    // A broad triangle inside the authored envelope reads as a working crew, not a queue at the
    // gate. Rotate the triangle with the parcel's authored frontage.
    const envelopeW = parcel.placement?.envelopeMetres?.x
      ?? (parcel.groundFootprint?.[0] ?? 1) * TILE - 1;
    const envelopeD = parcel.placement?.envelopeMetres?.z
      ?? (parcel.groundFootprint?.[1] ?? 1) * TILE - 1;
    const spreadX = Math.min(
      Math.max(0.8, envelopeW / 2 - 0.9),
      Math.max(2.6, envelopeW * 0.28),
    );
    const frontZ = Math.min(
      Math.max(0.8, envelopeD / 2 - 0.9),
      Math.max(2.2, envelopeD * 0.23),
    );
    const rearZ = Math.min(
      Math.max(0.8, envelopeD / 2 - 0.9),
      Math.max(1.8, envelopeD * 0.19),
    );
    const local = [
      { x: -spreadX, z: frontZ },
      { x: 0, z: -rearZ },
      { x: spreadX, z: frontZ * 0.72 },
    ][crewIndex];
    const rotation = (Number(parcel.rotation) || 0) * Math.PI / 180;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const centre = parcel.centre ?? { x: 0, y: 0, z: 0 };
    const position = new THREE.Vector3(
      centre.x + local.x * cos + local.z * sin,
      (centre.y ?? 0) + 0.02,
      centre.z - local.x * sin + local.z * cos,
    );
    const entryLocal = { x: 0, z: frontZ + 0.9 };
    const entryPosition = new THREE.Vector3(
      centre.x + entryLocal.x * cos + entryLocal.z * sin,
      (centre.y ?? 0) + 0.02,
      centre.z - entryLocal.x * sin + entryLocal.z * cos,
    );
    const siteYaw = Math.atan2(centre.x - position.x, centre.z - position.z);
    const scale = new THREE.Vector3(width, height, width);
    const matrix = new THREE.Matrix4().compose(position, IDENTITY, scale);
    return {
      id,
      archetypeId,
      identityId: crewIndex,
      fromAnchor: { kind: 'parcel', id: parcel.id },
      toAnchor: { kind: 'parcel', id: parcel.id },
      path: [position.clone()],
      height,
      width,
      routeHidden: false,
      walkSeconds: 0,
      travelPhase: 1,
      lookYaw: null,
      lastX: position.x,
      lastY: position.y,
      lastZ: position.z,
      mischief: null,
      previousMatrix: matrix.clone(),
      nextMatrix: matrix,
      proxy: null,
      siteCrew: true,
      siteParcelId: parcel.id,
      sitePosition: position,
      siteEntryPosition: entryPosition,
      siteYaw,
      crewRole: role,
    };
  }

  _nearestConstructionSites(state) {
    const camera = this.camera?.position ?? null;
    return Object.keys(state.holdings ?? {})
      .filter((parcelId) => Boolean(state.holdings[parcelId]?.construction))
      .map((parcelId) => activeParcel(this.city, state, parcelId))
      .filter(Boolean)
      .map((parcel) => ({
        parcel,
        distance: camera
          ? (parcel.centre.x - camera.x) ** 2 + (parcel.centre.z - camera.z) ** 2
          : 0,
      }))
      .sort((left, right) => left.distance - right.distance
        || left.parcel.id.localeCompare(right.parcel.id))
      .slice(0, SITE_CREW_SITE_CAP)
      .map(({ parcel }) => parcel);
  }

  syncState(state) {
    this._ensureNav();
    const nextRecords = new Map();
    for (const id of [...(state.people?.order ?? [])].sort()) {
      const person = state.people.byId[id];
      nextRecords.set(id, this._targetRecord(
        id,
        person.archetypeId,
        person.fromAnchor,
        person.toAnchor,
        state,
        true,
        person.pendingOutcome,
        person.identityId ?? 0,
      ));
    }
    for (const avatarId of Object.keys(state.avatars ?? {}).sort()) {
      const avatar = state.avatars[avatarId];
      const id = `avatar:${avatarId}`;
      nextRecords.set(id, this._targetRecord(
        id,
        'avatar',
        avatar.fromAnchor,
        avatar.destination,
        state,
        false,
      ));
    }
    const crewSites = this._nearestConstructionSites(state);
    const nextSiteCrewCycles = new Map();
    this.activeCrewSiteIds = crewSites.map(({ id }) => id);
    for (const parcel of crewSites) {
      nextSiteCrewCycles.set(parcel.id, advanceSiteCrewWorkCycle(
        this.siteCrewCycles.get(parcel.id),
        state.quarter,
        0,
        this.reducedMotion,
      ));
      for (let crewIndex = 0; crewIndex < 3; crewIndex += 1) {
        const record = this._siteCrewRecord(parcel, crewIndex);
        nextRecords.set(record.id, record);
      }
    }
    this.siteCrewCycles = nextSiteCrewCycles;
    this.root.userData.siteCrewCycles = Object.freeze(Object.fromEntries(nextSiteCrewCycles));
    for (const [id, record] of this.records) {
      if (nextRecords.has(id)) continue;
      if (record.proxy) {
        this.root.remove(record.proxy);
        const index = this.pickTargets.indexOf(record.proxy);
        if (index >= 0) this.pickTargets.splice(index, 1);
      }
    }
    this.records = nextRecords;
    this.state = state;
    this.phase = this.reducedMotion ? 1 : 0;
    this.update(0);
  }

  /**
   * Sample every record along its path, gate it against the navmesh, and hand the resulting
   * world placements to the figure batch. Nothing about the figure itself is decided here.
   */
  update(dt) {
    const step = this.reducedMotion ? 0 : Math.min(0.05, Math.max(0, dt));
    if (!this.reducedMotion) this.phase = Math.min(1, this.phase + step / this.duration);
    else this.phase = 1;
    // V3.32: interpolation phase pins at 1 the moment a figure arrives, so an idle solved from
    // it froze the whole cast into statues between moves — §2.7 fails that outright. `beat` is a
    // separate free-running clock, advanced by the caller's dt exactly as `phase` is, so breath,
    // weight shift and look-about continue after arrival. Reduced motion holds it still.
    if (!this.reducedMotion) this.beat = (this.beat + step / IDLE_BEAT_SECONDS) % 1;
    if (this.state) {
      for (const [parcelId, cycle] of this.siteCrewCycles) {
        this.siteCrewCycles.set(parcelId, advanceSiteCrewWorkCycle(
          cycle,
          this.state.quarter,
          step,
          this.reducedMotion,
        ));
      }
      this.root.userData.siteCrewCycles = Object.freeze(Object.fromEntries(this.siteCrewCycles));
    }
    const nav = this._ensureNav();
    const ordered = [...this.records.values()].sort((left, right) =>
      left.id.localeCompare(right.id));
    const records = [
      ...ordered.filter((record) => !record.siteCrew).slice(0, STREET_PERSON_CAPACITY),
      ...ordered.filter((record) => record.siteCrew).slice(0, SITE_CREW_CAPACITY),
    ];

    // A record outside the draw capacity (or explicitly hidden) has no live cue.
    // Navigation's lastXYZ stays separate from this visual-only snapshot.
    for (const record of this.records.values()) {
      record.renderedAnchor = null;
      if (record.proxy) record.proxy.visible = false;
    }
    const base = new THREE.Matrix4();
    const figures = records.map((record) => {
      const position = new THREE.Vector3();
      const scale = new THREE.Vector3();
      if (record.siteCrew) {
        const cycle = this.siteCrewCycles.get(record.siteParcelId)
          ?? advanceSiteCrewWorkCycle(null, this.state?.quarter ?? 0, 0, this.reducedMotion);
        const walkAlpha = Math.min(1, cycle.progress / 0.24);
        const walkEase = walkAlpha * walkAlpha * (3 - 2 * walkAlpha);
        position.lerpVectors(record.siteEntryPosition, record.sitePosition, walkEase);
        scale.set(record.width, record.height, record.width);
        record.lastX = position.x;
        record.lastY = position.y;
        record.lastZ = position.z;
        return {
          id: record.id,
          archetypeId: record.archetypeId,
          identityId: record.identityId ?? 0,
          position,
          scale,
          yaw: record.siteYaw,
          faceYaw: record.siteYaw,
          lookYaw: null,
          yielding: false,
          lean: 0,
          leanHeading: 0,
          routeHidden: false,
          pendingOutcome: null,
          moving: false,
          beat: cycle.progress,
          siteWorkProgress: cycle.progress,
          siteCrew: true,
          record,
        };
      }
      if (record.travelPhase == null) record.travelPhase = this.phase;
      matrixAlongPath(record.path, record.travelPhase, record.height, record.width, base, nav);
      base.decompose(position, new THREE.Quaternion(), scale);
      // Hard gate every drawn frame (I-29). A lattice snap across a block is a teleport.
      const safe = nav.enforceWalkable(position.x, position.z);
      const snap = Math.hypot(safe.x - position.x, safe.z - position.z);
      if (snap > 1.25 && record.lastX != null) {
        position.x = record.lastX;
        position.z = record.lastZ;
      } else {
        position.x = safe.x;
        position.z = safe.z;
      }
      const cleared = pushOutOfBuildings(
        position.x, position.z, this.world?.footprints, { maxDepth: 0 },
      );
      if (cleared.hit) {
        const push = Math.hypot(
          cleared.x - (record.lastX ?? position.x),
          cleared.z - (record.lastZ ?? position.z),
        );
        if (push > 1.25 && record.lastX != null) {
          position.x = record.lastX;
          position.z = record.lastZ;
        } else {
          position.x = cleared.x;
          position.z = cleared.z;
        }
      }
      if (record.lastX != null && step > 0) {
        const dx = position.x - record.lastX;
        const dz = position.z - record.lastZ;
        const d = Math.hypot(dx, dz);
        const maxStep = WALK_SPEED * step + 0.12;
        if (d > maxStep) {
          position.x = record.lastX + (dx / d) * maxStep;
          position.z = record.lastZ + (dz / d) * maxStep;
        }
      }
      const prevX = record.lastX ?? position.x;
      const prevZ = record.lastZ ?? position.z;
      const prevY = record.lastY ?? 0;
      record.lastX = position.x;
      record.lastZ = position.z;
      const pathYaw = record.routeHidden ? 0 : yawAlongPath(record.path, record.travelPhase);
      const decision = record.routeHidden
        ? { yield: false, lookYaw: pathYaw }
        : trafficYield({
          x: position.x,
          z: position.z,
          hx: Math.sin(pathYaw),
          hz: Math.cos(pathYaw),
        }, this.roadUsers, this.world?.crossings, {
          elapsed: this.signalElapsed,
          seed: this.city?.seed,
          id: record.id,
        });
      if (record.mischief && record.mischief.energy > 0.02) {
        record.mischief.t += step;
        record.mischief.energy = Math.max(0, record.mischief.energy - step * 1.15);
      } else if (record.mischief) {
        record.mischief.energy = 0;
      }
      const stumbling = (record.mischief?.energy ?? 0) > 0.08;
      if (this.reducedMotion) {
        record.travelPhase = 1;
      } else if (!decision.yield && !stumbling) {
        const seconds = record.walkSeconds || this.duration;
        record.travelPhase = Math.min(1, record.travelPhase + step / seconds);
        record.lookYaw = null;
      } else {
        record.lookYaw = decision.lookYaw;
      }
      const hull = clearVehicleHulls(position.x, position.z, this.roadUsers);
      if (hull.hit) {
        position.x = hull.x;
        position.z = hull.z;
      }
      const stepped = resolveSurfaceStep(
        prevX, prevZ, prevY, position.x, position.z, this.world,
      );
      position.x = stepped.x;
      position.z = stepped.z;
      position.y = stepped.y;
      if (stepped.blocked && !this.reducedMotion) {
        record.travelPhase = Math.max(0, (record.travelPhase ?? 0) - step / (record.walkSeconds || this.duration));
      }
      record.lastX = position.x;
      record.lastZ = position.z;
      record.lastY = position.y;
      if (record.routeHidden) scale.copy(HIDDEN_SCALE);
      const misch = record.mischief;
      const energy = misch?.energy ?? 0;
      if (energy > 0.02) {
        const h = misch.heading ?? 0;
        position.x += Math.cos(h) * Math.sin(misch.t * 14) * energy * 0.22;
        position.z += Math.sin(h) * Math.sin(misch.t * 14) * energy * 0.22;
      }
      const faceYaw = pathYaw;
      const travelled = Math.hypot(position.x - prevX, position.z - prevZ);
      const moving = !this.reducedMotion
        && !record.routeHidden
        && !decision.yield
        && !stumbling
        && travelled > 0.004
        && (record.walkSeconds ?? 0) > 0.4;
      return {
        id: record.id,
        archetypeId: record.archetypeId,
        identityId: record.identityId ?? 0,
        position,
        scale,
        yaw: faceYaw + (energy > 0 ? Math.sin(misch.t * 16) * energy * 0.55 : 0),
        faceYaw,
        lookYaw: decision.yield ? decision.lookYaw : null,
        yielding: Boolean(decision.yield),
        lean: energy * 0.38,
        leanHeading: misch?.heading ?? 0,
        routeHidden: record.routeHidden,
        pendingOutcome: record.pendingOutcome,
        moving,
        record,
      };
    });

    if (this.meshy) {
      const liveMeshy = new Set();
      for (const figure of figures) {
        if (figure.siteCrew) continue;
        const shellId = this.meshy.shellIdForPerson(figure);
        if (!shellId) continue;
        const walking = Boolean(figure.moving);
        const wander = !walking && !figure.routeHidden && !this.reducedMotion
          && !figure.yielding;
        const key = `person:${figure.id}`;
        const placed = this.meshy.place(key, shellId, {
          x: figure.position.x,
          y: figure.position.y,
          z: figure.position.z,
          yaw: figure.faceYaw,
          dt: step,
          walking,
          wander,
          lookYaw: figure.lookYaw,
          hidden: figure.routeHidden,
        });
        if (!placed) continue;
        figure.scale.copy(HIDDEN_SCALE);
        figure.meshyPlaced = true;
        figure.meshyAnchor = this.meshy.groundAnchorOf(key);
        liveMeshy.add(key);
        const sin = Math.sin(figure.faceYaw);
        const cos = Math.cos(figure.faceYaw);
        for (const extra of this.meshy.familyExtras(figure)) {
          const extraKey = `${key}:${extra.id}`;
          if (this.meshy.place(extraKey, extra.id, {
            x: figure.position.x + extra.dx * cos + extra.dz * sin,
            y: figure.position.y,
            z: figure.position.z - extra.dx * sin + extra.dz * cos,
            yaw: figure.faceYaw + (extra.facing ?? 0),
            dt: step,
            walking,
            wander,
            lookYaw: null,
            hidden: figure.routeHidden,
          })) liveMeshy.add(extraKey);
        }
      }
      this.meshy.prunePrefix('person:', liveMeshy);
    }

    this.figures.write(figures, {
      phase: this.phase, reducedMotion: this.reducedMotion, beat: this.beat,
    });

    for (const figure of figures) {
      const { proxy } = figure.record;
      const anchor = figure.routeHidden ? null : figure.meshyPlaced
        ? (figure.meshyAnchor ? this.root.worldToLocal(figure.meshyAnchor.clone()) : null)
        : figure.position.clone();
      figure.record.renderedAnchor = anchor;
      if (!proxy) continue;
      proxy.visible = Boolean(anchor);
      if (!anchor) continue;
      // The proxy box is centred on its own origin, so it is lifted half its own height.
      proxy.position.copy(anchor)
        .add(new THREE.Vector3(0, PROPORTIONS.height * 1.13 * 0.5, 0));
      proxy.updateMatrixWorld();
    }

    for (const toast of [...this.spendToasts]) {
      toast.elapsed += dt;
      const point = this.positionOf(toast.avatarRecordId);
      if (point) {
        toast.sprite.position.copy(this.root.worldToLocal(point));
        toast.sprite.position.y += TOAST_RISE + Math.min(1.2, toast.elapsed * 0.8);
      }
      toast.sprite.material.opacity = Math.max(0, 1 - Math.max(0, toast.elapsed - 1.5) / 0.5);
      if (toast.elapsed < 2) continue;
      this.root.remove(toast.sprite);
      toast.sprite.material.map.dispose();
      toast.sprite.material.dispose();
      this.spendToasts.splice(this.spendToasts.indexOf(toast), 1);
    }
  }

  showSpendToast(event) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = '800 56px "Helvetica Neue", Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 8;
    context.strokeStyle = 'rgba(10, 12, 14, 0.94)';
    context.fillStyle = '#e9b45a';
    const label = `−$${event.amount}`;
    context.strokeText(label, canvas.width / 2, canvas.height / 2);
    context.fillText(label, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.name = `v304:avatar-spend:${event.avatarId}`;
    sprite.renderOrder = 20;
    sprite.scale.set(7.2, 2.7, 1);
    sprite.userData.avatarSpend = {
      amount: event.amount,
      venueClass: event.venueClass,
      label,
    };
    const point = this.positionOf(`avatar:${event.avatarId}`);
    if (point) sprite.position.copy(this.root.worldToLocal(point)).add(new THREE.Vector3(0, TOAST_RISE, 0));
    this.root.add(sprite);
    this.spendToasts.push({
      avatarRecordId: `avatar:${event.avatarId}`,
      elapsed: 0,
      sprite,
    });
    return sprite;
  }

  setRoadUsers(users) {
    this.roadUsers = Array.isArray(users) ? users : [];
  }

  setSignalClock(elapsed, seed = null) {
    this.signalElapsed = Number(elapsed) || 0;
    if (this.world) {
      this.world.signalElapsed = this.signalElapsed;
      this.world.signalSeed = seed ?? this.city?.seed ?? null;
    }
  }

  queryCrossingPeds() {
    const out = [];
    for (const [id, record] of this.records) {
      if (record.siteCrew) continue;
      if (!Number.isFinite(record.lastX) || !Number.isFinite(record.lastZ)) continue;
      if (!isCarriageway(record.lastX, record.lastZ)) continue;
      const yaw = record.lookYaw ?? 0;
      out.push({
        id,
        x: record.lastX,
        z: record.lastZ,
        hx: Math.sin(yaw),
        hz: Math.cos(yaw),
      });
    }
    return out;
  }

  /** Latest rendered ground anchor in world coordinates; never advances a route. */
  positionOf(personId) {
    const record = this.records.get(personId);
    if (!record || record.routeHidden) return null;
    for (let node = this.root; node; node = node.parent) if (!node.visible) return null;
    if (record.renderedAnchor !== undefined) {
      return record.renderedAnchor ? this.root.localToWorld(record.renderedAnchor.clone()) : null;
    }
    // Before the first update there is no drawn sample yet. Preserve the route/site
    // fallback for callers preparing a view; after update, omitted records return null.
    const point = record.siteCrew ? record.sitePosition.clone() : pathPosition(
      record.path, record.travelPhase ?? this.phase, new THREE.Vector3(), this.navmesh,
    );
    return this.root.localToWorld(point);
  }

  destinationOf(personId) {
    const record = this.records.get(personId);
    if (!record) return null;
    if (record.siteCrew) return record.sitePosition.clone();
    const end = record.path.at(-1);
    const safe = this.navmesh.enforceWalkable(end.x, end.z);
    return new THREE.Vector3(safe.x, 0, safe.z);
  }

  mischiefTap(id) {
    const record = this.records.get(id);
    if (!record) return false;
    const taps = (record.mischief?.taps ?? 0) + 1;
    const salt = unitFrom(this.city?.seed ?? 0, `person-mischief:${id}:${taps}`);
    record.mischief = {
      energy: Math.min(1, (record.mischief?.energy ?? 0) + 0.72),
      heading: salt * Math.PI * 2,
      t: 0,
      taps,
    };
    return true;
  }

  setReducedMotion(on) {
    this.reducedMotion = Boolean(on);
    if (this.reducedMotion) this.phase = 1;
    this.update(0);
  }

  stats() {
    const records = [...this.records.values()];
    const streetCount = Math.min(
      STREET_PERSON_CAPACITY,
      records.filter((record) => !record.siteCrew).length,
    );
    const crewCount = Math.min(
      SITE_CREW_CAPACITY,
      records.filter((record) => record.siteCrew).length,
    );
    return this.figures.stats(Math.min(PERSON_CAPACITY, streetCount + crewCount));
  }

  dispose() {
    for (const toast of this.spendToasts) {
      this.root.remove(toast.sprite);
      toast.sprite.material.map.dispose();
      toast.sprite.material.dispose();
    }
    this.spendToasts = [];
    this.figures.dispose();
    this.pickGeometry.dispose();
    this.pickMaterial.dispose();
    this.navmesh.dispose();
    this.records.clear();
    this.pickTargets.length = 0;
  }
}

/**
 * The auction ring: up to forty bidders standing around the property, ten instanced draws
 * whether the auction has six of them or forty.
 *
 * **A bidder is the cast's own anatomy at a reduced ring count, not a third figure.** What was
 * here until V3.32 was `CapsuleGeometry(0.52, 0.48, 2, 6)` in pale sand with a box floating two
 * body-heights above it, and a critic reading the r01 plate wrote down exactly that: no legs, no
 * arms. Every mass below comes out of `people/figure.js` and `people/head.js` through the ring
 * counts those lanes parameterised for a cheaper build, and every pose comes out of
 * `people/rig.js` `poseFigure` — the same solver the consultants stand in — so a bidder breathes,
 * shifts its weight and looks about instead of freezing, and cannot drift into a different
 * species from the cast between rounds.
 *
 * Presentation only. It reads an auction event and draws it: no pick proxies, no sim coupling,
 * no state writes. Deterministic — every axis of variation is a `hash32` / `unitFrom` stream in
 * the 800 block.
 */
export class AuctionCrowdLayer {
  constructor(city) {
    this.city = city;
    this.navmesh = new NavMesh(city);
    this.root = new THREE.Group();
    this.root.name = 'v303:auction-crowd';
    this.count = 0;
    this.eventId = null;
    this.beat = 0;
    this.reducedMotion = false;
    this.proportions = PROPORTIONS;
    this.bidders = [];

    this.materials = createFigureMaterials();
    this.geometries = buildCrowdSheet(this.proportions, CROWD_LOD);

    this.meshes = [];
    this.families = [];
    /** slot name → { mesh, offset, per } so the write loop is one pass over the pose. */
    this.slotIndex = new Map();
    for (const family of CROWD_FAMILIES) {
      const mesh = instanced(
        this.geometries[family.key],
        this.materials[family.material] ?? this.materials.skin,
        CROWD_RENDER_BUDGET.capacity * family.slots.length,
        `v303:crowd:${family.key}`,
        { castShadow: Boolean(family.shadow) },
      );
      if (family.order != null) mesh.renderOrder = family.order;
      this[family.key] = mesh;
      this.meshes.push(mesh);
      this.families.push({ mesh, per: family.slots.length, key: family.key });
      family.slots.forEach((slotName, offset) => {
        this.slotIndex.set(slotName, { mesh, offset, per: family.slots.length });
      });
    }
    this.root.add(...this.meshes);
    // Names the file has always exposed, kept pointing at the nearest family so nothing reaching
    // for one by name finds `undefined`.
    this.body = this.trunk;
    this.placard = this.prop;

    // §3 is measured rather than assumed, and it is measured at the capacity the spec states
    // rather than at whatever this seed's auction happens to have drawn, so a geometry change
    // that breaches the budget fails on the first board instead of on the one crowded event.
    assertCrowdRenderBudget(this.stats(CROWD_RENDER_BUDGET.capacity));

    // The foot's own bounding box, once, as eight corners. `_soleDrop` walks these through a
    // posed slot's matrix to find how far a craning figure has to rise; reading the geometry
    // rather than estimating from `segment.foot` keeps the answer right whatever yaw and roll
    // the stance solve happened to give that foot.
    this.geometries.foot.computeBoundingBox();
    const fb = this.geometries.foot.boundingBox;
    this._footCorners = [];
    for (const x of [fb.min.x, fb.max.x]) {
      for (const y of [fb.min.y, fb.max.y]) {
        for (const z of [fb.min.z, fb.max.z]) this._footCorners.push(new THREE.Vector3(x, y, z));
      }
    }

    this._scratch = {
      matrix: new THREE.Matrix4(),
      position: new THREE.Vector3(),
      scale: new THREE.Vector3(),
      point: new THREE.Vector3(),
      joint: new THREE.Vector3(),
      pivot: new THREE.Vector3(),
      axis: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      lift: new THREE.Quaternion(),
      figure: {
        id: '',
        archetypeId: 'avatar',
        position: new THREE.Vector3(),
        scale: new THREE.Vector3(),
        yaw: 0,
        phase: undefined,
        beat: 0,
        path: null,
      },
    };
  }

  /**
   * Adopt the live auction, seed a bidder per stand, and draw them once.
   *
   * The event scan and the crowd-size clamp are unchanged: the first unresolved auction on the
   * board, its first anchor parcel, its `crowdSize` capped at the capacity.
   */
  syncState(state) {
    this.navmesh.ensure(this.city);
    const event = [...(state.events?.order ?? [])].sort()
      .map((id) => state.events.byId[id])
      .find((entry) =>
        entry.type === 'auction'
        && entry.status !== 'resolved'
        && entry.status !== 'cancelled');
    const parcel = event ? this.city.parcels[event.anchorIds[0]] : null;
    this.eventId = parcel ? event.id : null;
    this.count = parcel
      ? Math.min(CROWD_RENDER_BUDGET.capacity, event.payload.crowdSize)
      : 0;
    this.bidders = parcel ? this._seedBidders(parcel, event.id) : [];
    this.update(0);
  }

  /**
   * One bidder per stand: where it faces, how it is built, what it is wearing, and whether its
   * paddle is up. Resolved once per sync rather than per frame — forty figures at a dozen
   * colours each is five hundred allocations that have no business in a write loop.
   */
  _seedBidders(parcel, eventId) {
    const stands = this.navmesh.crowdPositions(parcel, this.count, eventId);
    const bidders = [];
    for (let index = 0; index < this.count; index += 1) {
      const stand = stands[index];
      const key = `${eventId}|bidder|${index}`;
      const outer = new THREE.Color(pickFrom(CROWD_OUTER, key, CROWD_SALT.GARMENT));
      // **Who is holding a number, and where they are holding it.** Not everybody at an auction
      // has a paddle and not everybody with one has it up: forty raised cards is a salute and
      // forty lowered ones is a queue, and forty of anything is the finding this round is about.
      const hasPaddle = unitFrom(key, CROWD_SALT.CARRY) < 0.66;
      const paddleState = hasPaddle
        ? pickWeighted(CROWD_PADDLE_STATE, key, CROWD_SALT.BID)
        : 'none';
      // The free arm, and — when both are free — a carriage that uses the pair.
      let armL = 'down';
      let armR = 'down';
      if (hasPaddle) {
        armL = pickWeighted(CROWD_FREE_ARM, key, CROWD_SALT.ARM_L);
        // A raised card wants the other hand quiet; a lowered one leaves it free.
        if (paddleState !== 'rest' && (armL === 'phone' || armL === 'chin')) armL = 'atEase';
        armR = paddleState === 'rest' ? 'atEase' : 'down';
      } else {
        const both = pickWeighted(CROWD_BOTH_ARMS, key, CROWD_SALT.CARRY + 1);
        if (both === 'split') {
          armL = pickWeighted(CROWD_FREE_ARM, key, CROWD_SALT.ARM_L);
          armR = pickWeighted(CROWD_FREE_ARM, key, CROWD_SALT.ARM_R);
        } else { armL = both; armR = both; }
      }
      bidders.push({
        id: `crowd:${eventId}:${index}`,
        x: stand.x,
        z: stand.z,
        // `crowdPositions` reports the bearing from the stand to whatever this bidder is looking
        // at; the rig's yaw is measured the other way round, from +Z.
        yaw: Math.PI / 2 - stand.facing,
        height: stand.height,
        width: 1.02 * (0.90 + unitFrom(key, CROWD_SALT.GIRTH) * 0.24),
        beat: unitFrom(key, CROWD_SALT.BEAT),
        outer,
        // The sleeve sits a shade under the trunk, the way the street knocks a jacket down.
        sleeve: outer.clone().multiplyScalar(0.82),
        lower: new THREE.Color(pickFrom(CROWD_LOWER, key, CROWD_SALT.LOWER)),
        skin: new THREE.Color(pickFrom(CROWD_SKIN, key, CROWD_SALT.SKIN)),
        hair: new THREE.Color(pickFrom(CROWD_HAIR, key, CROWD_SALT.HAIR_TONE)),
        shoe: new THREE.Color(pickFrom(CROWD_SHOE, key, CROWD_SALT.SHOE)),
        paddle: new THREE.Color(pickFrom(CROWD_PADDLE, key, CROWD_SALT.PADDLE)),
        grip: new THREE.Color(pickFrom(CROWD_GRIP, key, CROWD_SALT.PADDLE + 1)),
        hairStyle: pickFrom(CROWD_HAIR_STYLE_KEYS, key, CROWD_SALT.HAIR_STYLE),
        hasPaddle,
        paddleState,
        armL,
        armR,
        // The lift varies a little either side of 130°, so the raised arms are not one arm
        // stamped forty times round a ring. A shoulder-height card is a different carriage
        // again, and it is the one that reads as somebody still deciding.
        raise: paddleState === 'high'
          ? 2.30 + unitFrom(`${key}|r`, CROWD_SALT.BID) * 0.36
          : 1.16 + unitFrom(`${key}|r`, CROWD_SALT.BID) * 0.30,
        // The card is held, so it hangs at whatever angle the hand that holds it chose.
        tilt: (unitFrom(key, CROWD_SALT.TILT) - 0.5) * 0.44,
        cant: (unitFrom(`${key}|c`, CROWD_SALT.TILT) - 0.5) * 0.30,
        // Where the head is pointing, on top of where the body is. Forty heads on one bearing is
        // the same defect as forty bodies on one bearing, one segment up.
        lookYaw: (unitFrom(key, CROWD_SALT.LOOK) - 0.5) * 1.30,
        lookPitch: (unitFrom(`${key}|p`, CROWD_SALT.LOOK) - 0.5) * 0.26,
        // **The people at the back go up on their toes**, which is the one thing a crowd does
        // that a ring never had a reason to. `rank` is 0 at the front of the fan and 1 at the
        // back; only the back half cranes, and only some of them.
        crane: (stand.rank ?? 0) > 0.42
          && unitFrom(key, CROWD_SALT.CRANE) < 0.34
          ? 0.20 + unitFrom(`${key}|t`, CROWD_SALT.CRANE) * 0.14
          : 0,
        rank: stand.rank ?? 0,
        hasHat: unitFrom(key, CROWD_SALT.HAT) < 0.18,
      });
    }
    return bidders;
  }

  /**
   * Solve and write every bidder. `dt` advances the shared idle beat; a caller that never ticks
   * still gets forty figures at forty different moments of the breath, because `rig.js` offsets
   * the beat by a hash of the figure id before it solves.
   */
  update(dt = 0) {
    if (!this.reducedMotion && Number.isFinite(dt)) {
      this.beat = (this.beat + dt / IDLE_BEAT_SECONDS) % 1;
    }
    const count = Math.min(this.bidders.length, CROWD_RENDER_BUDGET.capacity);
    for (const { mesh, per } of this.families) mesh.count = count * per;

    const s = this._scratch;
    for (let index = 0; index < count; index += 1) {
      const bidder = this.bidders[index];
      const figure = s.figure;
      figure.id = bidder.id;
      figure.position.set(bidder.x, 0, bidder.z);
      figure.scale.set(bidder.width, bidder.height, bidder.width);
      figure.yaw = bidder.yaw;
      figure.beat = (bidder.beat + this.beat) % 1;
      // No path and no cycle: `rig.js` reads that as standing, and solves the idle — breath,
      // weight shift, look-about — rather than a walk frozen at one sample.
      figure.path = null;
      figure.phase = undefined;

      const pose = poseFigure(figure, { reducedMotion: this.reducedMotion });
      const mul = { width: bidder.width, height: bidder.height / 1.55 };
      // Order matters and each step reads the one before it. The arms move first, then the
      // head, then the whole body rises onto its toes, and only then are the props hung off the
      // hand and the skull the earlier steps left behind.
      this._carriage(pose, bidder);
      this._raiseArm(pose, bidder);
      this._look(pose, bidder);
      this._crane(pose, bidder);
      this._props(pose, bidder, mul);

      for (const [slotName, entry] of this.slotIndex) {
        const slot = pose[slotName];
        const at = index * entry.per + entry.offset;
        if (!slot) {
          s.matrix.compose(figure.position, IDENTITY, HIDDEN_SCALE);
          entry.mesh.setMatrixAt(at, s.matrix);
          continue;
        }
        if (slotName === 'hair') {
          const style = CROWD_HAIR_STYLES[bidder.hairStyle];
          if (!style) {
            s.matrix.compose(figure.position, IDENTITY, HIDDEN_SCALE);
            entry.mesh.setMatrixAt(at, s.matrix);
            continue;
          }
          s.scale.set(slot.scale.x * style.x, slot.scale.y * style.y, slot.scale.z * style.z);
          s.position.copy(slot.position);
          s.position.y -= style.drop * this.proportions.headHeight * mul.height;
          s.matrix.compose(s.position, slot.quaternion, s.scale);
        } else {
          s.matrix.compose(slot.position, slot.quaternion, slot.scale);
        }
        entry.mesh.setMatrixAt(at, s.matrix);
        const tone = slot.colour ?? this._tone(bidder, slotName);
        if (tone) entry.mesh.setColorAt(at, tone);
      }
    }

    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Turn one arm into a carriage — a rigid rotation of the solved chain about its own shoulder,
   * then of the forearm and hand about the elbow the shoulder rotation left them at.
   *
   * The elbow is recovered *after* the shoulder turn rather than before it, which is the only
   * subtle part: `jointTop` reads the joint back out of the slot the rig wrote, so reading it
   * first would flex the forearm about where the elbow used to be and open the joint. Read
   * second, the two rotations compose and the arm stays one arm.
   */
  _armCarriage(pose, bidder, side, carriage) {
    const spec = CROWD_ARM_CARRIAGE[carriage];
    if (!spec || (!spec.pitch && !spec.abduct && !spec.flex)) return;
    const upper = pose[`upperArm${side}`];
    if (!upper) return;
    const s = this._scratch;
    const chain = [`upperArm${side}`, `forearm${side}`, `hand${side}`];
    const turn = (names, joint, angle, axisX, axisZ) => {
      if (!angle) return;
      s.axis.set(axisX, 0, axisZ);
      s.quaternion.setFromAxisAngle(s.axis, angle);
      for (const name of names) {
        const slot = pose[name];
        if (!slot) continue;
        slot.position.sub(joint).applyQuaternion(s.quaternion).add(joint);
        slot.quaternion.premultiply(s.quaternion);
      }
    };
    // The figure's own lateral axis, so the arm swings in the sagittal plane of the person
    // rather than of the world; and its own forward axis for the abduction.
    const lateralX = Math.cos(bidder.yaw);
    const lateralZ = -Math.sin(bidder.yaw);
    const forwardX = Math.sin(bidder.yaw);
    const forwardZ = Math.cos(bidder.yaw);
    const shoulder = jointTop(upper, this.proportions.natural.upperArm, s.joint);
    turn(chain, shoulder, -spec.pitch, lateralX, lateralZ);
    turn(chain, shoulder, side === 'R' ? -spec.abduct : spec.abduct, forwardX, forwardZ);
    const fore = pose[`forearm${side}`];
    if (!fore || !spec.flex) return;
    const elbow = jointTop(fore, this.proportions.natural.forearm, s.pivot);
    turn([`forearm${side}`, `hand${side}`], elbow, -spec.flex, lateralX, lateralZ);
  }

  /** Both arms, in a fixed order so the result is a pure function of the bidder. */
  _carriage(pose, bidder) {
    this._armCarriage(pose, bidder, 'L', bidder.armL);
    this._armCarriage(pose, bidder, 'R', bidder.armR);
  }

  /**
   * Where the head is pointing, on top of where the body is.
   *
   * Rotated about the base of the skull rather than about the head's own centre, so the jaw
   * swings and the crown stays where the neck put it. Hair rides the same transform — `rig.js`
   * hands head and hair one slot for exactly this reason — and the pitch is kept small because
   * the crowd's head carries a stretched neck stub merged into it, and a big pitch would swing
   * that stub out of the collar.
   */
  _look(pose, bidder) {
    if (!bidder.lookYaw && !bidder.lookPitch) return;
    const head = pose.head;
    if (!head) return;
    const s = this._scratch;
    s.axis.copy(UP).applyQuaternion(head.quaternion);
    const pivot = s.pivot.copy(head.position)
      .addScaledVector(s.axis, -this.proportions.headHeight * 0.46 * (bidder.height / 1.55));
    s.quaternion.setFromAxisAngle(UP, bidder.lookYaw);
    s.axis.set(Math.cos(bidder.yaw), 0, -Math.sin(bidder.yaw));
    s.lift.setFromAxisAngle(s.axis, -bidder.lookPitch);
    s.quaternion.premultiply(s.lift);
    for (const name of ['head', 'face', 'hair']) {
      const slot = pose[name];
      if (!slot) continue;
      slot.position.sub(pivot).applyQuaternion(s.quaternion).add(pivot);
      slot.quaternion.premultiply(s.quaternion);
    }
  }

  /**
   * The people at the back go up on their toes to see over the ones in front.
   *
   * **The heel comes up and the toe stays planted, and that is a measurement rather than an
   * intention.** Both feet turn about their own ankle origin — the slot position `rig.js` writes
   * — which drops the toe below the pavement; the figure then rises by exactly the depth the
   * lowest sole point went under, so the toe returns to ground level and every joint above it
   * travels the same distance and stays attached. The lift is read off the foot geometry's own
   * transformed bounding box each frame rather than from a trigonometric estimate, because the
   * foot carries a yaw and a heel-to-toe roll from the stance solve and the estimate would be
   * wrong by whatever those happen to be.
   *
   * `contact` is deliberately left on the ground: it is the shadow puddle, and a shadow does not
   * rise with the body casting it.
   */
  _crane(pose, bidder) {
    if (!bidder.crane) return;
    const s = this._scratch;
    s.axis.set(Math.cos(bidder.yaw), 0, -Math.sin(bidder.yaw));
    s.quaternion.setFromAxisAngle(s.axis, CRANE_SIGN * bidder.crane);
    let lift = 0;
    for (const name of ['footL', 'footR']) {
      const slot = pose[name];
      if (!slot) continue;
      slot.quaternion.premultiply(s.quaternion);
      lift = Math.max(lift, this._soleDrop(slot));
    }
    if (lift <= 0) return;
    for (const [name, slot] of Object.entries(pose)) {
      if (name === 'contact' || name === 'geometryContract' || !slot?.position) continue;
      slot.position.y += lift;
    }
  }

  /**
   * How far below the pavement a posed foot's lowest point sits, in world metres.
   *
   * Eight corners of the foot geometry's own bounding box through the slot's own matrix. The box
   * is the pessimistic read — it can only over-state how far down the sole reaches — so a lift
   * taken from it never leaves a toe underground.
   */
  _soleDrop(slot) {
    const s = this._scratch;
    s.matrix.compose(slot.position, slot.quaternion, slot.scale);
    let lowest = Infinity;
    for (const corner of this._footCorners) {
      s.point.copy(corner).applyMatrix4(s.matrix);
      lowest = Math.min(lowest, s.point.y);
    }
    return Math.max(0, -lowest);
  }

  /**
   * Put the paddle arm up, as a rigid turn of the solved arm about its own shoulder.
   *
   * `rig.js` is the gait lane's file and solves a stand, a walk and an idle; there is no bidding
   * carriage in it and inventing one here would be a second solver. This is a transform of what
   * that lane produced instead — the shoulder joint is read back out of the slot it wrote, and
   * the upper arm, the forearm and the wrist turn about it together — so the elbow keeps the
   * flexion the idle gave it and the arm is the same arm, lifted.
   *
   * **`raise` is now two carriages, not one.** `high` is the old 2.30–2.66 rad salute; `shoulder`
   * is 1.16–1.46, a card held up at the shoulder rather than over the head, which is what
   * somebody still deciding does with it. `_carriage` has already run on this arm and left it at
   * `down`, so the two transforms do not stack.
   */
  _raiseArm(pose, bidder) {
    if (bidder.paddleState !== 'high' && bidder.paddleState !== 'shoulder') return;
    const upper = pose[`upperArm${PADDLE_SIDE}`];
    if (!upper) return;
    const s = this._scratch;
    const joint = jointTop(upper, this.proportions.natural.upperArm, s.joint);
    // The figure's own sagittal axis, so the arm goes up in front of the bidder rather than
    // toward whichever way the world happens to be pointing.
    s.axis.set(Math.cos(bidder.yaw), 0, -Math.sin(bidder.yaw));
    s.lift.setFromAxisAngle(s.axis, -bidder.raise);
    // A touch of abduction on top, so a raised card clears the ear rather than grazing it.
    s.axis.set(Math.sin(bidder.yaw), 0, Math.cos(bidder.yaw));
    s.quaternion.setFromAxisAngle(s.axis, PADDLE_SIDE === 'R' ? -0.16 : 0.16)
      .multiply(s.lift);
    for (const name of [`upperArm${PADDLE_SIDE}`, `forearm${PADDLE_SIDE}`, `hand${PADDLE_SIDE}`]) {
      const slot = pose[name];
      if (!slot) continue;
      slot.position.sub(joint).applyQuaternion(s.quaternion).add(joint);
      slot.quaternion.premultiply(s.quaternion);
    }
  }

  /**
   * The paddle, and the flat cap a few of them wear.
   *
   * The card rides above the hand rather than along the arm's own axis, which is what makes one
   * placement work for both carriages: on a raised arm the hand is already at head height and
   * the card clears the crown, and on an arm at rest it sits at the waist in front, held the way
   * anyone holds a number they are not currently bidding with.
   */
  _props(pose, bidder, mul) {
    const p = this.proportions;
    const s = this._scratch;
    const hand = pose[`hand${PADDLE_SIDE}`];
    if (bidder.hasPaddle && hand) {
      // The board rides above the fist, canted the way a held thing is rather than square to the
      // world. Two angles: `tilt` rolls it in the hand, `cant` pitches its top away. Forty cards
      // at one angle catch the key light identically and read as one card stamped forty times,
      // which is the §2.5 half of the same finding the carriages answer.
      s.axis.set(Math.cos(bidder.yaw), 0, -Math.sin(bidder.yaw));
      const hold = new THREE.Quaternion().setFromAxisAngle(UP, bidder.yaw);
      hold.premultiply(new THREE.Quaternion().setFromAxisAngle(s.axis, bidder.cant));
      s.axis.set(Math.sin(bidder.yaw), 0, Math.cos(bidder.yaw));
      hold.premultiply(new THREE.Quaternion().setFromAxisAngle(s.axis, bidder.tilt));
      // Up the object's own axis, so a canted paddle's grip stays in the fist.
      const along = UP.clone().applyQuaternion(hold);
      const grip = hand.position.clone().addScaledVector(
        s.axis.set(Math.sin(bidder.yaw), 0, Math.cos(bidder.yaw)),
        0.10 * FIGURE_SCALE * mul.width,
      );
      pose['prop:paddle'] = {
        position: grip.clone().addScaledVector(along, PADDLE_RISE * mul.height),
        quaternion: hold.clone(),
        scale: new THREE.Vector3(
          PADDLE_SIZE.w * mul.width, PADDLE_SIZE.h * mul.height, PADDLE_SIZE.d * mul.width,
        ),
        colour: bidder.paddle,
      };
      pose['prop:handle'] = {
        position: grip.clone().addScaledVector(
          along, (PADDLE_RISE - PADDLE_GRIP.drop) * mul.height,
        ),
        quaternion: hold,
        scale: new THREE.Vector3(
          PADDLE_GRIP.w * mul.width, PADDLE_GRIP.h * mul.height, PADDLE_GRIP.d * mul.width,
        ),
        colour: bidder.grip,
      };
    }
    if (bidder.hasHat && pose.head) {
      s.point.set(0, p.headHeight * 0.44 * mul.height, -p.headDepth * 0.02 * mul.width)
        .applyQuaternion(pose.head.quaternion);
      const crown = pose.head.position.clone().add(s.point);
      pose['prop:hat'] = {
        position: crown,
        quaternion: pose.head.quaternion.clone(),
        scale: new THREE.Vector3(
          p.headWidth * 1.22 * mul.width,
          p.headHeight * 0.40 * mul.height,
          p.headDepth * 1.20 * mul.width,
        ),
        colour: bidder.lower,
      };
      // The brim: forward of the crown and down at the browline, so the cap has a front.
      s.point.set(
        0,
        -p.headHeight * CROWD_BRIM.drop * 0.40 * mul.height,
        p.headDepth * CROWD_BRIM.forward * mul.width,
      ).applyQuaternion(pose.head.quaternion);
      pose['prop:brim'] = {
        position: crown.clone().add(s.point),
        quaternion: pose.head.quaternion.clone(),
        scale: new THREE.Vector3(
          p.headWidth * CROWD_BRIM.w * mul.width,
          p.headHeight * CROWD_BRIM.h * mul.height,
          p.headDepth * CROWD_BRIM.d * mul.width,
        ),
        colour: bidder.lower,
      };
    }
  }

  /** Which instance colour each drawn slot takes. The cast's own value ladder, §2.9. */
  _tone(bidder, slot) {
    switch (slot) {
      case 'pelvis':
      case 'thighL': case 'thighR': case 'shinL': case 'shinR':
        return bidder.lower;
      case 'chest':
        return bidder.outer;
      case 'upperArmL': case 'upperArmR':
        return bidder.sleeve;
      case 'footL': case 'footR':
        return bidder.shoe;
      // The forearm carries the hand, so it is skin and the sleeve ends at the elbow above it.
      case 'forearmL': case 'forearmR':
      case 'head':
        return bidder.skin;
      case 'hair':
        return bidder.hair;
      default:
        return null;
    }
  }

  setReducedMotion(on) {
    this.reducedMotion = Boolean(on);
    this.update(0);
  }

  /** Measured, not assumed — `assertPeopleRenderBudget` reads exactly this. */
  stats(instances = this.count) {
    return {
      drawCalls: instances ? this.families.length : 0,
      triangles: Math.round(this.families.reduce(
        (sum, { mesh, per }) => sum + geometryTriangles(mesh.geometry) * instances * per, 0,
      )),
      instances,
    };
  }

  dispose() {
    for (const mesh of this.meshes) mesh.geometry.dispose();
    disposeFigureMaterials(this.materials);
    this.meshes = [];
    this.families = [];
    this.slotIndex.clear();
    this.bidders = [];
    this.navmesh.dispose();
  }
}

/**
 * The head with lane A's neck merged into it, so the crowd spends nine body families rather than
 * ten. Stretched below the jaw for the reason `ambient-life.js` states: §2.7 holds the head level
 * while the chest breathes under it, so the gap between the two opens and closes and a rigid neck
 * of natural length would bare a ring of sky at the collar.
 */
function buildCrowdHeadGeometry(p, lod) {
  const skull = buildHeadGeometry(p, undefined, {
    segments: lod.skull, noseSegments: lod.nose, ears: lod.ears,
  });
  const neck = buildNeckGeometry(p, { segments: lod.neck });
  const width = p.segment.neck.width;
  neck.scale(width, NECK_STRETCH, width);
  neck.translate(
    0,
    p.y.neckCentre - p.y.headCentre - (NECK_STRETCH - 1) * p.natural.neck * 0.5,
    // The head sits 38 mm forward of the spine and the neck 22 mm, so the stub leans back out of
    // the head by the difference rather than running up the middle.
    // Both are r01 metres and take `FIGURE_SCALE` with the bind pose they mirror. g03.
    (0.022 - 0.038) * FIGURE_SCALE,
  );
  return mergeParts([skull, neck], skull);
}

/**
 * The one shape the paddle and the hat share: a chamfered slab at unit diameter, closed at both
 * ends, so an instance scale makes a bidding card of it at one aspect and a flat cap at another.
 *
 * **The chamfer is 8 per cent, not 26, and that is the g02 plate's correction.** The first pass
 * took the street's `buildGearGeometry` profile unaltered — a rounded shell, which is right for
 * a sun hat and a satchel and wrong for a card. Held at 0.34 m it read as a bread roll in the
 * fist on every raised arm. A card is flat-topped and flat-sided with the corners knocked off,
 * and the hat it also has to serve is a flat cap, which is a pillbox rather than a dome.
 */
function buildCrowdPropGeometry(lod) {
  return profileSolid([
    { y: -0.5, w: 0.88, d: 0.88 },
    { y: -0.42, w: 1.0, d: 1.0 },
    { y: 0.42, w: 1.0, d: 1.0 },
    { y: 0.5, w: 0.88, d: 0.88 },
  ], lod.gear);
}

/** Every geometry the crowd draws, keyed by family. Measured by `stats()`, never assumed. */
function buildCrowdSheet(p, lod) {
  return {
    contact: buildContactGeometry(p, { segments: lod.contact }),
    pelvis: buildPelvisGeometry(p, { segments: lod.trunk }),
    trunk: buildTrunkGeometry(p, { segments: lod.trunk }),
    limb: buildLimbSegmentGeometry(p, { segments: lod.limb, capSteps: lod.limbCapSteps }),
    foot: buildFootGeometry(p, { segments: lod.foot, lastSegments: lod.footLast }),
    upperArm: buildUpperArmGeometry(p, { segments: lod.limb, capSteps: lod.limbCapSteps }),
    forearm: buildForearmGeometry(p, {
      segments: lod.limb,
      capSteps: lod.limbCapSteps,
      handSegments: lod.hand,
      handCapSteps: lod.handCapSteps,
    }),
    head: buildCrowdHeadGeometry(p, lod),
    hair: buildHairGeometry(p, undefined, {
      segments: lod.hair, locks: lod.locks, sides: lod.sides, capFrom: lod.capFrom,
    }),
    prop: buildCrowdPropGeometry(lod),
  };
}

/**
 * The crowd half of §3, thrown at construction on the full-capacity sheet.
 *
 * `assertPeopleRenderBudget` is the published gate and still owns the runtime check against a
 * live `stats()`; this is the same pair of numbers applied to the geometry itself, so a ring
 * count that breaches the budget fails on the first board that builds a crowd rather than on the
 * one seed whose auction happened to draw forty bidders.
 */
function assertCrowdRenderBudget(stats, budget = CROWD_RENDER_BUDGET) {
  if (stats.drawCalls > budget.drawCalls) {
    throw new Error(
      `people.js: crowd draws ${stats.drawCalls} against a budget of ${budget.drawCalls}`,
    );
  }
  if (stats.triangles > budget.triangles) {
    throw new Error(
      `people.js: crowd measures ${stats.triangles} triangles at ${stats.instances} instances `
      + `against a budget of ${budget.triangles}. Reduce a ring count in CROWD_LOD before `
      + 'spending a family.',
    );
  }
  return stats;
}

export function assertPeopleRenderBudget(stats) {
  if (stats.people.drawCalls > PEOPLE_RENDER_BUDGET.drawCalls) {
    throw new Error(`people draw budget exceeded: ${stats.people.drawCalls}`);
  }
  if (stats.people.triangles > PEOPLE_RENDER_BUDGET.triangles) {
    throw new Error(`people triangle budget exceeded: ${stats.people.triangles}`);
  }
  if (stats.crowd.drawCalls > CROWD_RENDER_BUDGET.drawCalls) {
    throw new Error(`crowd draw budget exceeded: ${stats.crowd.drawCalls}`);
  }
  if (stats.crowd.triangles > CROWD_RENDER_BUDGET.triangles) {
    throw new Error(`crowd triangle budget exceeded: ${stats.crowd.triangles}`);
  }
  return stats;
}
