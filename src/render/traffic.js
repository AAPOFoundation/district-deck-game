// District Deck V3.11 R40-CAR — carriageway traffic: the road cars, their surfaces, their manners.
//
// Deterministic fleet on predetermined carriageway loops (corridor lanes only — never across a
// block). Longitudinal control is a continuous car-following law (IDM) run against whichever is
// nearest of: the vehicle ahead in world space, the vehicle ahead round the same loop, the stop
// line, and the junction reservation. Cars, buses and trams are one obstacle population —
// foreign road users publish themselves through `registerObstacleProvider` and are followed
// exactly as another car is, so nothing on the carriageway is invisible to anything else.
//
// Bodies come off one parametric kit per family (sedan / hatch / ute): a slice-built lower
// body with real arch openings, a wheel-house cavity behind each one, a painted cabin shell
// with near-black glass panels set into it, and one instanced mesh per surface class.
//
// Surface detail — shut lines, door handle, number plate, tail badge, road film, brake dust —
// is projected in the fragment shader from the car's own local space (see
// `vehicles/car-surface.js`), because the fleet is instanced and so cannot carry per-car UV
// sets. Proportion follows the toy register in `assets/img/target/v311-vehicles/` rather than
// a scale model: short, tall, big wheels deep in the arches, and unpainted grey plastic
// bumpers, flares and rocker against saturated paint.
//
// Seed-hash only; no simulation state is read or written here.

import * as THREE from 'three';
import { updateCybercabs, poseCybercabs, disposeCybercabs } from './vehicles/cybercab.js';
import { CORRIDOR, PITCH, ROAD } from '../core/grid.js';
import { isCarriageway } from './people/city-surface.js';
import { applyCarGlassSurface, applyCarPaintSurface, disposeCarSurfaceMaps, CAR_PAINT_FAMILY, createCarPaintMaterial } from './vehicles/car-surface.js';
import {
  stepErrand,
} from './vehicles/errands.js';

/**
 * CAR-1 true-scale kit switch. On by default; `?carTrue=0` (or `DD_CAR_TRUE=0` under node)
 * restores the 0.94 toy kit exactly — every true-mode factor below collapses to 1 or to the
 * legacy literal, so the legacy geometry is byte-identical.
 *
 * True mode draws the kit at TRAFFIC_SCALE 1 on 0.33 m tyres, authored to the style plan's
 * vehicle figures (section 2, category 5): sedan 4.4 x 1.8 x 1.45 m, hatch 4.1, wagon 4.7,
 * ute 5.3 x 1.86 x 1.8, van 5.3 x 1.95 x 2.0, taxi 4.9 x 1.84 x 1.48 (body; the roof sign
 * stands above it). Widths are body over the arch flares, mirrors excluded.
 */
export const CAR_TRUE_SCALE = (() => {
  try {
    const qs = typeof location !== 'undefined' && location?.search
      ? new URLSearchParams(location.search) : null;
    if (qs?.get('carTrue') === '0') return false;
    if (typeof process !== 'undefined' && process?.env?.DD_CAR_TRUE === '0') return false;
  } catch { /* no location: default on */ }
  return true;
})();
/** The true figures the kit is fitted to (m): length, width over flares, height. */
export const CAR_TRUE_FIGURES = Object.freeze({
  sedan: Object.freeze({ L: 4.40, W: 1.80, H: 1.45 }),
  hatch: Object.freeze({ L: 4.10, W: 1.78, H: 1.48 }),
  ute: Object.freeze({ L: 5.30, W: 1.86, H: 1.80 }),
  wagon: Object.freeze({ L: 4.70, W: 1.80, H: 1.50 }),
  van: Object.freeze({ L: 5.30, W: 1.95, H: 2.00 }),
  taxi: Object.freeze({ L: 4.90, W: 1.84, H: 1.48 }),
});
/** Fleet mean of the true lengths (m): the nominal car length for gaps and give-way. */
const TRUE_CAR_LENGTH = 4.80;

/**
 * W3-A, taste bible section 2 (vehicles: S at most 60, V 30 to 85). Body paint comes from the
 * written list only: white, silver, charcoal, navy, maroon, olive, plus taxi gold on the taxi
 * family. No orange, purple, lime or cyan car exists any more. The wheel is weighted the way a
 * street is: pale and grey bodies dominate, the three colours are the occasional exception.
 */
// Named family in liveries.json; one shared material, with paint held per instance.
const CAR_PAINT = CAR_PAINT_FAMILY;
const CAR_PAINT_WHEEL = Object.freeze([
  CAR_PAINT.white, CAR_PAINT.silver, CAR_PAINT.charcoal, CAR_PAINT.navy,
  CAR_PAINT.white, CAR_PAINT.silver, CAR_PAINT.maroon, CAR_PAINT.charcoal,
  CAR_PAINT.olive, CAR_PAINT.white, CAR_PAINT.silver, CAR_PAINT.navy,
]);
const VAN_PAINT_WHEEL = Object.freeze([
  CAR_PAINT.white, CAR_PAINT.white, CAR_PAINT.silver, CAR_PAINT.white, CAR_PAINT.charcoal,
]);
/** Body paint for car `index` of body family `bodyType`; deterministic, no random draw. */
function carPaintFor(bodyType, index) {
  if (bodyType === 'taxi') return CAR_PAINT.taxi;
  const wheel = bodyType === 'van' ? VAN_PAINT_WHEEL : CAR_PAINT_WHEEL;
  return wheel[index % wheel.length];
}


// The eleven fully-arbitrated cars remain the simulation fleet. P17 adds a cheaper,
// deterministic board-distance flow behind them so the arterial network reads as occupied
// without duplicating the O(n²) junction-reservation pass.
export const TRAFFIC_CAR_COUNT = 11;
export const TRAFFIC_DENSITY_SPACING_M = 60;

/**
 * The fixed owner plate used by P17 S2. Keep this beside the moving population it measures so
 * Node tests and the renderer cannot quietly disagree about FOV, look height or polar convention.
 * `polar` is degrees above the horizon; `capture-board.mjs` publishes the same seven values.
 */
export const P17_ENTERTAINMENT_PLATE = Object.freeze({
  targetX: 110,
  targetY: 2,
  targetZ: 250,
  lookY: 8,
  distance: 210,
  polarDeg: 32,
  azimuthDeg: 195,
  fovDeg: 32,
  width: 1600,
  height: 1000,
});

/** Twelve cars stay on real carriageways wholly inside the entertainment plate's ground frustum. */
export const P17_PLATE_FLOW_CARS = 12;

/** Exact Three camera for the fixed entertainment-landmass projection. */
export function makeP17EntertainmentPlateCamera() {
  const p = P17_ENTERTAINMENT_PLATE;
  const polar = THREE.MathUtils.degToRad(p.polarDeg);
  const azimuth = THREE.MathUtils.degToRad(p.azimuthDeg);
  const horizontal = Math.cos(polar) * p.distance;
  const camera = new THREE.PerspectiveCamera(p.fovDeg, p.width / p.height, 0.1, 2000);
  camera.position.set(
    p.targetX + Math.sin(azimuth) * horizontal,
    p.targetY + Math.sin(polar) * p.distance,
    p.targetZ + Math.cos(azimuth) * horizontal,
  );
  camera.lookAt(p.targetX, p.lookY, p.targetZ);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

/** Point/frustum test shared by the deterministic street, people and receipt planners. */
export function p17EntertainmentPlateContains(point, camera = makeP17EntertainmentPlateCamera()) {
  const projected = new THREE.Vector3(
    Number(point?.x) || 0,
    Number(point?.y) || 0,
    Number(point?.z) || 0,
  ).project(camera);
  return projected.z >= -1 && projected.z <= 1
    && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1;
}

/** Screen width in pixels of a ground footprint at the published entertainment plate. */
export function p17EntertainmentPlateFootprintPx(
  point,
  widthM,
  camera = makeP17EntertainmentPlateCamera(),
) {
  const x = Number(point?.x) || 0;
  const y = Number(point?.y) || 0.5;
  const z = Number(point?.z) || 0;
  const width = Number(widthM) || 0;
  const alongX = new THREE.Vector3(x + width / 2, y, z).project(camera)
    .distanceTo(new THREE.Vector3(x - width / 2, y, z).project(camera));
  const alongZ = new THREE.Vector3(x, y, z + width / 2).project(camera)
    .distanceTo(new THREE.Vector3(x, y, z - width / 2).project(camera));
  return Math.max(alongX, alongZ) * (P17_ENTERTAINMENT_PLATE.width / 2);
}

/** Seed-independent road-user target; trams and the interchange bus are moving vehicles too. */
export function planTrafficDensity(city, { plateScale = true } = {}) {
  const extentX = Number(city?.extent?.x) || ((city?.blocksX ?? 4) * PITCH + ROAD);
  const extentZ = Number(city?.extent?.z) || ((city?.blocksZ ?? 4) * PITCH + ROAD);
  const roadMetres = ((city?.blocksZ ?? 4) + 1) * extentX
    + ((city?.blocksX ?? 4) + 1) * extentZ;
  const trams = (city?.transit ?? []).filter((item) => item?.kind === 'tram').length;
  const buses = (city?.civicUses ?? []).some((item) => item?.useId === 'transport-interchange') ? 1 : 0;
  const minimumVehicles = Math.ceil(roadMetres / TRAFFIC_DENSITY_SPACING_M);
  // R2: sparse city traffic; the extra plate-only loop crowded the same carriageway.
  const baselineCars = TRAFFIC_CAR_COUNT; // Keep the fully arbitrated fleet; cut cheap background traffic.
  const plateFlowCars = 0;
  const cars = baselineCars + plateFlowCars;
  return Object.freeze({
    roadMetres,
    minimumVehicles,
    baselineCars,
    plateFlowCars,
    cars,
    trams,
    buses,
    movingVehicles: cars + trams + buses,
    metresPerVehicle: roadMetres / Math.max(1, cars + trams + buses),
  });
}
/**
 * Cars arrive in platoons rather than spread evenly round their loop.
 *
 * This is the answer to a specific evidence gap, not a taste change. The iconic board frame —
 * `assets/img/target/v311-vehicles/ref-toy-street-signal.png` — is three cars queued at a red
 * with their brake lamps lit, and R40's harness could not capture it at all: no signalised
 * junction on the board held two stopped cars simultaneously in 600 s. The obvious lever is
 * more cars, and it is closed: the fleet is 11 because the owner asked for half of 22.
 *
 * So the queue has to come from arrival pattern and signal timing instead. Eleven cars spread
 * evenly over eight loops is one car every 120 m, which can only ever meet a light alone.
 * Grouped three to a loop at 13.5 m spacing, on the interior belts where the signal heads
 * actually stand, the same eleven cars reach a stop line together.
 */
const PLATOON_SIZE = 3;
/** Spacing between platoon members at spawn (path metres) — a queue, not a convoy. */
// CAR-1: true mode keeps the 9.8 m bumper gap of the toy fleet behind a 4.80 m nominal car.
const PLATOON_SPACING = CAR_TRUE_SCALE ? 13.5 + (TRUE_CAR_LENGTH - 3.95 * 0.94) : 13.5;
/**
 * Amber duration (s). Also the phase functions' own amber window, so the exported constant
 * and the behaviour cannot drift apart.
 */
export const LIGHT_STOP_DURATION = 1.5;
/**
 * Full signal cycle (s), both axes.
 *
 * R41 lengthened this 8.0 → 13.0 on the reasoning that a longer red is what lets a platoon
 * stack behind a leader. R42 tested that as a game decision rather than accepting it, because
 * a longer wait is a real cost to a board that should feel alive. Six seeds x 300 s, current
 * build, queue counted as cars stopped within 15 m of one signalised stop line:
 *
 *   cycle  platoon   peak queue   frames with >=2 queued   stopped share   crossings   mean wait
 *    8.0     3 @13.5m     3               6,624               0.0572          477        3.94 s
 *   10.0     3 @13.5m     3               1,512               0.0245          505        2.75 s
 *   13.0     3 @13.5m     3               1,238               0.0378          501        3.05 s
 *    8.0     4 @10.0m     3               1,291               0.0246          542        1.93 s
 *   10.0     4 @10.0m     3               2,357               0.0251          539        2.76 s
 *
 * Zero red-light crossings at every setting. The peak queue is three cars at every setting,
 * so the frame does not depend on the cycle at all — it depends on the platooning and the
 * interior-belt routing, exactly as the R41 critique argued.
 *
 * On that table 13.0 is dominated by 10.0 on every column — fewer queued frames, MORE time
 * spent stopped, a longer mean wait, fewer stop-line crossings, and a worst-case red of 6.5 s
 * against 5.0 — so this was changed to 10.0.
 *
 * THE CHANGE WAS THEN REVERTED, and the reason is worth more than the table. The sweep above
 * runs `TrafficLayer` headless, which means it runs with NO BUS. In the full app the bus is a
 * registered obstacle that reshapes every arrival pattern, and at 10.0 the harness could not
 * capture `junction-queue` AT ALL: `capture-vehicles.mjs` returned NEVER OCCURRED after 600 s
 * on seed 0, and the minimum car-bus body gap fell 2.428 m -> 0.802 m. A car-only model
 * predicted the opposite of what the board did.
 *
 * So the honest position is: on car-only metrics the extra three seconds buy nothing, and the
 * queue frame comes from platooning and interior-belt routing rather than from the cycle,
 * exactly as the R41 critique argued. But 13.0 is the setting under which the frame is
 * actually capturable in the shipped scene, and losing an evidence plate to win a metric is
 * the trade this programme has already been caught making. It stays at 13.0 until the same
 * sweep can be run with the bus in the scene. That is the BUS lane's harness, not this one's.
 *
 * P19-X2: the live board still has to show a readable lamp cycle — amber 1.5 s and each
 * red/green hold ≥ 8 s — which a 13 s cycle cannot do (half-window 6.5 s). 19 s gives
 * green 8.0 + amber 1.5 on the owning axis and 9.5 s of red on the other.
 *
 * `streetscape.js` reads the phase through `sharedSignalPhase()`, so its lamp heads follow.
 */
export const LIGHT_CYCLE = 19.0;

/** Seconds a crossing stays held after the last pedestrian leaves it. */
// H1A: four safe 50 ms ticks after the capsule has cleared; an empty zebra
// must not add almost a second to every bounded pedestrian crossing.
export const PEDESTRIAN_CLEAR_HOLD = 0.2;
/** Deceleration ceiling (m/s²) while yielding to a pedestrian occupancy. */
export const PEDESTRIAN_YIELD_DECEL = 3.0;
/** A moving car this close to a kerb waiter owns the box; walkers must not step off. */
export const PEDESTRIAN_KERB_YIELD_M = 8;

/**
 * Deterministic signal phase from elapsed seconds.
 * R30h: true mutual exclusion — NS owns [0, half), EW owns [half, cycle).
 * Within an axis window: green then amber; outside the window = red.
 * Orthogonal approaches never share green (Codex T2).
 * @param {number} elapsed
 * @param {'ns'|'ew'} [axis='ns']
 */
export function sharedSignalPhase(elapsed, axis = 'ns') {
  const t = (((elapsed % LIGHT_CYCLE) + LIGHT_CYCLE) % LIGHT_CYCLE);
  const half = LIGHT_CYCLE * 0.5;
  const owns = axis === 'ns' ? t < half : t >= half;
  if (!owns) return 'red';
  const local = axis === 'ns' ? t : t - half;
  const amberLen = LIGHT_STOP_DURATION;
  const greenLen = Math.max(1.2, half - amberLen);
  if (local < greenLen) return 'green';
  return 'amber';
}

/**
 * Seconds until the phase on `axis` changes.
 *
 * A driver needs this, not just the current colour. Amber here is LIGHT_STOP_DURATION, which at cruise is
 * shorter than the distance a car needs to pull up in — so a decision taken only once amber
 * shows leaves a dilemma zone where the car can neither stop comfortably nor clear the
 * junction, and the stop-line clamp has to catch it with a snap. Reading the green-out lets
 * the decision be taken early enough that the zone closes.
 * @param {number} elapsed
 * @param {'ns'|'ew'} [axis='ns']
 */
export function signalPhaseRemaining(elapsed, axis = 'ns') {
  const t = (((elapsed % LIGHT_CYCLE) + LIGHT_CYCLE) % LIGHT_CYCLE);
  const half = LIGHT_CYCLE * 0.5;
  const owns = axis === 'ns' ? t < half : t >= half;
  const local = axis === 'ns' ? t : t - half;
  const amberLen = LIGHT_STOP_DURATION;
  const greenLen = Math.max(1.2, half - amberLen);
  // R41 bug fix: the not-owned branch returned `half - local`, which is negative for the
  // whole of NS's red window (local runs past `half` there) and overshoots by a full half
  // for EW's. A negative "seconds until my phase changes" is worse than no answer at all,
  // because `bus.js` takes its stop-or-go decision from this number across the §2 contract:
  // a bus reading −0.02 s to green treats a red it has just arrived at as already over.
  if (!owns) return axis === 'ns' ? LIGHT_CYCLE - t : half - t;
  return local < greenLen ? greenLen - local : half - local;
}

/** Travel axis from yaw (atan2(dx,dz)): dominant |sin| → EW, else NS. */
/** True when inDir→outDir is a 90° clockwise (right) turn in XZ — Melbourne far turn. */
export function isMelbourneRightTurn(inX, inZ, outX, outZ) {
  const inLen = Math.hypot(inX, inZ) || 1;
  const outLen = Math.hypot(outX, outZ) || 1;
  const ix = inX / inLen;
  const iz = inZ / inLen;
  const ox = outX / outLen;
  const oz = outZ / outLen;
  const turn = Math.acos(Math.max(-1, Math.min(1, ix * ox + iz * oz)));
  const signed = ix * oz - iz * ox;
  return turn > 1.15 && turn < 1.95 && signed > 0.35;
}

export function travelAxisFromYaw(yaw) {
  return Math.abs(Math.sin(yaw)) > Math.abs(Math.cos(yaw)) ? 'ew' : 'ns';
}

function corridorStripKind(local) {
  if (local < CORRIDOR.footpathA[1]) return 'footpath';
  if (local < CORRIDOR.carriagewayA[1]) return 'carriageway';
  if (local < CORRIDOR.tramReservation[1]) return 'tram';
  if (local < CORRIDOR.carriagewayB[1]) return 'carriageway';
  return 'footpath';
}

/**
 * Road-network cell for a ground point. A corridor crossing is its own kind so an
 * east-west car in the 16×16 junction square is not scored as "on the NS footpath".
 */
export function roadCellKind(x, z) {
  const cx = ((x % PITCH) + PITCH) % PITCH;
  const cz = ((z % PITCH) + PITCH) % PITCH;
  const inV = cx < ROAD;
  const inH = cz < ROAD;
  if (inV && inH) {
    return { kind: 'junction', axis: null, local: null, cx, cz };
  }
  if (inV) {
    return { kind: corridorStripKind(cx), axis: 'v', local: cx, cx, cz };
  }
  if (inH) {
    return { kind: corridorStripKind(cz), axis: 'h', local: cz, cx, cz };
  }
  return { kind: 'lot', axis: null, local: null, cx, cz };
}

const LANE_CENTRE_A = (CORRIDOR.carriagewayA[0] + CORRIDOR.carriagewayA[1]) / 2;
const LANE_CENTRE_B = (CORRIDOR.carriagewayB[0] + CORRIDOR.carriagewayB[1]) / 2;

/**
 * A moving car is "random" when its centre is off the carriageway network: on a
 * footpath, verge, lot, tram reservation, or (while stopped) inside a crossing.
 * Junction squares are roadway. Errand cars that have left the loop are excluded.
 */
export function classifyMovingVehicle(car) {
  if (!car || car.mischiefHidden) return { random: false, reason: 'hidden' };
  if (car.errandAway) return { random: false, reason: 'errand' };
  const x = car.worldX ?? car.x;
  const z = car.worldZ ?? car.z;
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    return { random: true, reason: 'unposed' };
  }
  const cell = roadCellKind(x, z);
  const speed = car.speed ?? 0;
  const stopped = speed < 0.25;
  if (cell.kind === 'lot') return { random: true, reason: 'lot', cell };
  if (cell.kind === 'junction') {
    // A committed car is clearing the box; a stopped uncommitted car is sitting on the zebra.
    if (stopped && !car.committedKey && !car.yieldingToPed) {
      return { random: true, reason: 'stopped-on-crossing', cell };
    }
    return { random: false, reason: 'junction', cell };
  }
  if (cell.kind === 'footpath') return { random: true, reason: 'footpath', cell };
  if (cell.kind === 'tram') return { random: true, reason: 'tram', cell };
  const dA = Math.abs(cell.local - LANE_CENTRE_A);
  const dB = Math.abs(cell.local - LANE_CENTRE_B);
  const laneOffset = Math.min(dA, dB);
  if (laneOffset > 1.35) return { random: true, reason: 'off-lane', cell, laneOffset };
  const yaw = car.yaw ?? car.pathYaw ?? 0;
  const hx = Math.sin(yaw);
  const hz = Math.cos(yaw);
  const along = cell.axis === 'v' ? Math.abs(hz) : Math.abs(hx);
  if (along < 0.55) return { random: true, reason: 'heading', cell, along };
  return { random: false, reason: 'lane', cell, laneOffset };
}

export function censusMovingVehicles(traffic) {
  const random = [];
  for (const car of traffic?.vehicles ?? traffic?.fleet ?? []) {
    const row = classifyMovingVehicle(car);
    if (row.random) random.push({ id: car.bodyType, loopId: car.loopId, ...row, x: car.worldX, z: car.worldZ });
  }
  return { total: (traffic?.vehicles ?? traffic?.fleet ?? []).length, random };
}
/** Board-token scale applied to the whole authored kit. */
const TRAFFIC_SCALE = CAR_TRUE_SCALE ? 1 : 0.94;
/**
 * How far past the authored end plane the body actually reaches (m).
 *
 * `lowerBodySlices` grows every slice by `overlap` on each side so consecutive slices cover
 * each other's end caps, which means the first and last slices stand `overlap` proud of
 * `rearZ` / `frontZ`. A lamp placed relative to the authored plane and not to the built one
 * is a lamp buried inside the car — see `buildTailLampGeometry`.
 */
const BODY_END_OVERHANG = 0.022;
/** Authored tyre radius (m, pre-scale). Wheel spin is derived from this, never from a guess. */
const TYRE_RADIUS = CAR_TRUE_SCALE ? 0.33 : 0.42;
/** The toy kit's tyre, which the legacy spec's arch and wheel figures were authored against. */
const LEGACY_TYRE_RADIUS = 0.42;
const LEGACY_TYRE_HALF_WIDTH = 0.152;
/** Half the tyre's tread width (m, pre-scale). Also the steer envelope's cosine term. */
const TYRE_HALF_WIDTH = CAR_TRUE_SCALE ? 0.114 : 0.152;
/** Tyre profile x factor: 1 on the toy kit, 0.75 (a 228 mm section) at true size. */
const TYRE_WIDTH_K = TYRE_HALF_WIDTH / LEGACY_TYRE_HALF_WIDTH;
/** Where the tyre's sidewall ends and the rim begins (m, pre-scale). */
// True mode: a 16-inch rim (0.62 of the tyre radius) in place of the toy's 0.56.
const RIM_RADIUS = TYRE_RADIUS * (CAR_TRUE_SCALE ? 0.62 : 0.56);
/** Car length used for gap / give-way (board metres). */
const CAR_LENGTH = CAR_TRUE_SCALE ? TRUE_CAR_LENGTH : 3.95 * TRAFFIC_SCALE;
const CAR_HALF_LEN = CAR_LENGTH * 0.5;
const CAR_HALF_WIDTH = CAR_TRUE_SCALE ? 0.90 : 0.92 * TRAFFIC_SCALE;
// The box other lanes are told to keep out of, via `queryVehicles()`. Deliberately larger
// than the internal figures: the longest family (sedan, 3.80 m) plus its bumpers plus a
// 0.25 m margin each end, and the widest (ute, 1.84 m) plus its arch flares. The R40
// telemetry measured the rendered car at 4.28 × 1.64 m against a published 3.71 × 1.73 m,
// which is a publisher understating its own length by half a metre to the vehicle following
// it. A conservative envelope costs a little smoothness and cannot cause a body overlap.
// CAR-1: in true mode the figures are derived from `CAR_BODY_BOX` (see after it): the longest
// family's half-length plus 0.25 m and the widest family's half-width plus 0.10 m.
const LEGACY_PUBLISHED_HALF_LEN = 2.20;
const LEGACY_PUBLISHED_HALF_WIDTH = 1.02;

// --- car-following (Intelligent Driver Model) ---------------------------------------------
// One continuous law covers cruise, approach, queue and stop. The old two-branch
// target-speed switch stamped between 0 and cruise; IDM eases in and creeps forward.
/** Bumper-to-bumper standstill gap (m). Comfort gap; the hard floor is QUEUE_STANDSTILL_GAP. */
const IDM_MIN_GAP = 2.5;
/** Desired time headway (s). */
const IDM_HEADWAY = 1.15;
/**
 * P19-X2B queue law: nose-to-tail ≥ 1.2 m at rest, ≥ 1.0 s·speed when moving.
 * Braking is anticipatory (Gipps against leader / stop line / occupied crossing) and
 * never exceeds FOLLOW_DECEL — the X2 yield plate showed a follower inside the leader
 * because the flow fleet braked late at 4.8 m/s² and could not see the other loop.
 */
export const QUEUE_STANDSTILL_GAP = 1.2;
export const QUEUE_TIME_GAP = 1.0;
export const FOLLOW_DECEL = 3.5;
/** Straight-lane centre tolerance (m). Turns are scored on the junction path, not this. */
export const LANE_KEEP_M = 0.3;
/** Comfortable acceleration / deceleration (m/s²). */
const IDM_ACCEL = 2.5;
const IDM_BRAKE = FOLLOW_DECEL;
/**
 * Ceiling on deceleration in ordinary driving (m/s²).
 *
 * IDM's interaction term is unbounded: a constraint that appears suddenly — a phase change,
 * a junction grant flipping to the other axis — asks for 40 or 50 m/s² and gets whatever the
 * floor allows. R40's floor was 9.5 m/s² for every case, so every routine stop at a
 * light ended in a snap, and the position clamp then doubled it (see pass 3). P19-X2B
 * caps the whole controller at FOLLOW_DECEL (3.5) and starts the stop earlier instead.
 */
const IDM_COMFORT_BRAKE = FOLLOW_DECEL;
/** Hard ceiling on deceleration (m/s²). Same as comfort: X2B forbids a harsher snap. */
const IDM_EMERGENCY = FOLLOW_DECEL;
/** Clear-air gap below which a car is allowed to use the emergency ceiling (m). */
const EMERGENCY_GAP = 1.25;
/** Half-width of the corridor slot a leader has to be in to count as ahead of us (m). */
const LANE_HALF_WIDTH = 2.4;
/** Forward scan for leaders and obstacles (m). */
const LEADER_SCAN = 42;

// --- junctions ------------------------------------------------------------------------------
/** Half-extent of the conflict box at a crossing (m). ROAD is the corridor width. */
const JUNCTION_BOX = ROAD * 0.5 + 1.8;
/** Stop line set back from the junction centre so the nose halts before the box (m). */
const STOP_SETBACK = ROAD * 0.5 + 1.6;
/** Where a halted car's NOSE settles relative to the stop line (m). */
const STOP_NOSE_GAP = 0.30;
/** Distance at which a car starts claiming the junction it is approaching (m). */
const JUNCTION_APPROACH = 26.0;
/** Clearance past the junction centre before a reservation is released (m). */
const JUNCTION_CLEAR = ROAD * 0.5 + 3.5;
/** Comfortable stopping deceleration used for the amber stop-or-go decision (m/s²). */
const AMBER_DECEL = 2.6;
/** Driver reaction distance folded into the amber decision (s). */
const AMBER_REACTION = 0.45;
/** How long before the phase changes a driver starts deciding (s). */
const DECISION_HORIZON = 3.2;

// --- last-resort safety net -----------------------------------------------------------------
// Avoidance above is the mechanism. Everything below is the airbag: if it fires, avoidance
// has a hole in it. `mvp/tests/traffic-physics.test.mjs` asserts zero car-car contacts across
// a five-seed × 120 s matrix, and `mvp/tests/car-headless-verify.mjs` runs the longer
// eight-seed × 300 s sweep and writes its result to disk. R41 note: the previous header
// claimed a 300 s / four-seed probe that never existed on disk — the numbers here are the
// ones the two files actually assert.
/** World-space contact radius (board metres) — cars closer than this have touched. */
const CRASH_GAP = CAR_LENGTH * 0.62;
/** Hold time after contact (seconds). */
const CRASH_HOLD = 4.4;
/** Separation applied on contact — full body half plus margin each side. */
const CRASH_SEPARATION = CAR_TRUE_SCALE ? TRUE_CAR_LENGTH + 2.1 : 5.8;
/** Same-pair contact cooldown after recovery (seconds). */
const CRASH_PAIR_COOLDOWN = 16.0;
/** Path advance on contact so the pair leaves the corridor on different phases. */
const CRASH_PATH_KICK_A = 6.8;
const CRASH_PATH_KICK_B = 2.4;
const UP = new THREE.Vector3(0, 1, 0);

/** The instanced meshes each body family carries, in the order they are written each frame. */
const PACK_SLOTS = Object.freeze([
  'body', 'darkDetails', 'wheelHouses', 'trim',
  'headlamps', 'taillamps', 'indicatorsL', 'indicatorsR', 'cabin',
]);

// Lamp instance colours. The lamp materials are unlit, so these values ARE the lamp output.
//
// R41 authored the brake lens at 3.20 linear red, past display white, on the stated grounds
// that the value "can run past 1 to give the bloom threshold something to catch", and then
// argued that the pale salmon it renders as is the board's post chain and therefore not this
// lane's problem. The mechanism is downstream — that part was right and the R41 critique
// verified it four ways. The conclusion did not follow, and R42 settled it by sweep rather
// than by argument. `mvp/tests/car-material-probe.mjs --modes red-sweep`, masked to the tail
// lens, ute at 3/4 rear, studio backdrop:
//
//   authored R   off-channel   rendered (with post)   sat    luma   halo   pre-post
//   0.8          0.035         (215,136,124)          0.423  151.9  56.5   (231, 53, 48)
//   1.2          0.035         (226,149,135)          0.403  164.4  56.6   (255, 53, 48)
//   1.6          0.035         (234,158,145)          0.380  173.2  56.6   (255, 53, 48)
//   2.4          0.035         (244,172,159)          0.348  186.4  56.7   (255, 53, 48)
//   3.2          0.035         (250,182,168)          0.328  195.4  56.8   (255, 53, 48)
//   0.8          0.004         (216,126,112)          0.481  144.1  56.7   (211, 21, 20)
//   1.2          0.004         (226,141,127)          0.438  158.1  56.6   (235, 20, 19)
//   1.6          0.004         (234,153,139)          0.406  169.2  56.7   (235, 20, 19)
//   2.4          0.004         (244,169,155)          0.365  183.9  56.6   (235, 20, 19)
//   3.2          0.004         (250,180,165)          0.340  193.8  56.9   (235, 20, 19)
//
// Three findings, none of them arguable from the table:
//
//  1. Saturation is NOT flat above the knee. It recovers monotonically as the authored value
//     comes down — 0.328 to 0.481 across the sweep. The in-lane lever was never exhausted.
//  2. The off-channels are a lever of their own. An authored linear green of 0.035 is sRGB 53
//     before any tone curve runs; at 0.004 it is 20. That single change buys +0.05 saturation
//     at the same red and it costs nothing.
//  3. The bloom justification is false. `post.js:366` sets `bloomThreshold` 1.40 with
//     `bloomStrength` 0.14, and the measured halo around the lens is 56.5 to 56.9 across the
//     WHOLE sweep — an 0.4-unit spread out of 255. Authoring at 3.2 for the bloom buys
//     nothing the eye or the probe can find.
//
// So the lamp is authored at the knee: 1.2 is the lowest value at which the lens still
// reaches its own maximum output before the post chain (the pre-post column is identical from
// 1.2 upward), and it recovers a third of the lost saturation against 3.2. Below 1.2 the lamp
// gives up real output for a diminishing return. The post-chain finding still stands and is
// still the owner's — it is worth more with this table attached than without it.
const WHITE = new THREE.Color(1, 1, 1);
const TAILLAMP_IDLE = new THREE.Color(0.030, 0.0035, 0.0030);
const TAILLAMP_BRAKE = new THREE.Color(1.20, 0.0040, 0.0034);
const INDICATOR_ON = new THREE.Color(1.32, 0.196, 0.0035);
const INDICATOR_OFF = new THREE.Color(0.026, 0.011, 0.0030);

/** Exported for regression probes (contact matrix, junction geometry). */
export const TRAFFIC_PHYSICS = Object.freeze({
  CAR_LENGTH,
  CAR_HALF_WIDTH,
  CRASH_GAP,
  CRASH_HOLD,
  CRASH_SEPARATION,
  CRASH_PAIR_COOLDOWN,
  JUNCTION_APPROACH,
  JUNCTION_BOX,
  STOP_SETBACK,
  IDM_MIN_GAP,
  IDM_HEADWAY,
  QUEUE_STANDSTILL_GAP,
  QUEUE_TIME_GAP,
  FOLLOW_DECEL,
  LANE_KEEP_M,
});

/**
 * Declare a material's authored environment response so the lighting rig keeps it.
 *
 * `lighting.js` `applyEnvironmentToScene` walks the graph and rewrites `envMapIntensity` on
 * every standard/physical material from a family guess — metalness > 0.45 gets 1.35,
 * roughness < 0.35 gets 1.20, everything else 0.92 — multiplied by the solar profile. A
 * number written at construction here is therefore thrown away unless the rig is told it was
 * authored. `userData.envIntensityBase` is the documented way to say so, and it survives the
 * rig's time-of-day retune because the retune re-derives from the same base.
 *
 * The car lane depends on this more than most: the sky reflection is the single largest
 * achromatic term on paint, and an override from 0.05 to 0.64 is the difference between
 * saturated board plastic and cream.
 *
 * @param {THREE.Material} material
 * @param {number} base authored family response, pre-profile
 */
function applyEnvIntensityBase(material, base) {
  material.userData.envIntensityBase = base;
  return material;
}

function hash32(text) {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

function unit(seed, salt) {
  return hash32(`${seed}|traffic-r40|${salt}`) / 0x100000000;
}

/** Signed shortest angle from a to b, in (-π, π]. */
function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Intelligent Driver Model acceleration.
 * @param {number} v own speed (m/s)
 * @param {number} v0 desired speed (m/s)
 * @param {number} gap clear distance to the obstacle ahead (m); Infinity for open road
 * @param {number} dv closing speed (own minus leader, m/s)
 */
function idmAccel(v, v0, gap, dv) {
  const free = 1 - (v / Math.max(0.5, v0)) ** 4;
  // R42: the open-road branch used to return `IDM_ACCEL * free` UNFLOORED, and IDM's free
  // term is a fourth power — a car at 8.3 m/s handed a desired speed of 2.6 asks for
  // −361 m/s². It never fired while `v0` was a constant cruise per car, because `v` can only
  // exceed `v0` by the 10% the integrator allows. The corner speed limit makes `v0` a
  // variable, so it fires the moment a car meets a tight arc, and the regression probe
  // caught it at 29.8 m/s² before this line existed. Slowing for a corner is comfortable
  // braking by definition; there is no obstacle to be urgent about.
  if (!Number.isFinite(gap)) return Math.max(-IDM_COMFORT_BRAKE, IDM_ACCEL * free);
  const s = Math.max(0.05, gap);
  const desired = IDM_MIN_GAP
    + Math.max(0, v * IDM_HEADWAY + (v * dv) / (2 * Math.sqrt(IDM_ACCEL * IDM_BRAKE)));
  const interaction = (desired / s) ** 2;
  // "Genuinely close" is a time, not a distance. A queued car sits 2.5 m off its leader all
  // day and is in no danger at all; a car 8 m off a leader it is closing on at 9 m/s is a
  // second from contact. Gating the emergency ceiling on distance alone put every creeping
  // queue member permanently into emergency braking, which is where R40's telemetry peak
  // came from once the double-application was removed.
  const ttc = dv > 0.2 ? gap / dv : Infinity;
  const urgent = gap < EMERGENCY_GAP || ttc < 1.1;
  const floor = urgent ? -IDM_EMERGENCY : -IDM_COMFORT_BRAKE;
  return Math.max(floor, IDM_ACCEL * (free - interaction));
}

function geometryTriangles(geometry) {
  return geometry.index
    ? geometry.index.count / 3
    : geometry.attributes.position.count / 3;
}

function mergeParts(geometries) {
  const prepared = geometries.map((g) => (g.index ? g.toNonIndexed() : g.clone()));
  for (const g of prepared) {
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
  }
  let vertCount = 0;
  for (const g of prepared) vertCount += g.attributes.position.count;
  const pos = new Float32Array(vertCount * 3);
  const nrm = new Float32Array(vertCount * 3);
  const uv = new Float32Array(vertCount * 2);
  let o = 0;
  for (const g of prepared) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += c;
  }
  for (const g of geometries) g.dispose();
  for (const g of prepared) g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingBox();
  return out;
}

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return g;
}

/**
 * Split shared vertices and rebuild normals per face.
 *
 * Every solid on the car is authored as an eight-corner prism. Indexed, those eight vertices
 * are shared by three faces each, so `computeVertexNormals` averages them and the whole prism
 * shades as one smooth blob. The surface atlas is projected by the normal, so a smoothed
 * prism does not merely shade wrong — it samples the wrong atlas tile everywhere, and the
 * number plate ends up washed across the bonnet. Flat normals are the fix and the reason.
 */
function flatShaded(geometry) {
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  flat.computeBoundingBox();
  geometry.dispose();
  return flat;
}

/**
 * Box with every edge and corner radiused, by the exact Minkowski construction: clamp each
 * vertex into the inner box, then push it out along the direction it was clamped from.
 * The toy register has no sharp corner anywhere on it, and a chamfer does not read as one.
 */
function roundedBox(w, h, d, r, x, y, z, segments = 3) {
  const radius = Math.max(0.001, Math.min(r, w / 2 - 0.005, h / 2 - 0.005, d / 2 - 0.005));
  const g = new THREE.BoxGeometry(w, h, d, segments, segments, segments);
  const pos = g.attributes.position;
  const hx = w / 2 - radius;
  const hy = h / 2 - radius;
  const hz = d / 2 - radius;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    c.set(
      Math.max(-hx, Math.min(hx, v.x)),
      Math.max(-hy, Math.min(hy, v.y)),
      Math.max(-hz, Math.min(hz, v.z)),
    );
    v.sub(c);
    if (v.lengthSq() > 1e-12) v.setLength(radius);
    v.add(c);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  g.translate(x, y + h / 2, z);
  return g;
}

/**
 * Eight-corner prism with an independent half-width at the bottom and at the top, plus an
 * inset on each end of the upper face. Every solid volume on the car is one of these: it
 * gives section (tuck-under, shoulder) and plan (nose and tail pinch) in one primitive, so
 * nothing on the body is a coplanar axis-aligned box stack.
 */
function taperedBlock(halfBottom, halfTop, h, d, x, y, z, {
  frontInset = 0,
  rearInset = 0,
} = {}) {
  const rear = z - d / 2;
  const front = z + d / 2;
  const positions = new Float32Array([
    x - halfBottom, y, rear,
    x + halfBottom, y, rear,
    x + halfBottom, y, front,
    x - halfBottom, y, front,
    x - halfTop, y + h, rear + rearInset,
    x + halfTop, y + h, rear + rearInset,
    x + halfTop, y + h, front - frontInset,
    x - halfTop, y + h, front - frontInset,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  // Counter-clockwise seen from OUTSIDE. The inherited winding was inverted on all six
  // faces: with backface culling on, the flanks of every prism on the car were discarded
  // and what the camera saw through the gap was the inside of the far flank. It read as a
  // washed-out body with pale wedges across it, which is exactly what it was.
  geometry.setIndex([
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 5, 1, 0, 4, 5,
    1, 6, 2, 1, 5, 6,
    2, 7, 3, 2, 6, 7,
    3, 4, 0, 3, 7, 4,
  ]);
  return flatShaded(geometry);
}

/**
 * Prism whose bottom face is a ramp: independent bottom height at the rear and front edges,
 * one flat top.
 *
 * This exists to cut the wheel arch. `taperedBlock` has a single bottom height, so a body
 * sliced along Z can only follow a curved arch as a staircase — each slice's bottom sits at
 * the lower of its two edges, and the step between neighbours is a slot straight into the
 * dark wheel house. At board distance that reads as a comb of slats cut through the flank,
 * which is exactly what the R40 plates show ahead of and behind every arch. A ramped bottom
 * follows the circle instead: consecutive slices meet edge-to-edge on the arch line and the
 * opening is one continuous curve.
 */
function rampedBlock(halfBottom, halfTop, yRear, yFront, yTop, d, x, z) {
  const rear = z - d / 2;
  const front = z + d / 2;
  const positions = new Float32Array([
    x - halfBottom, yRear, rear,
    x + halfBottom, yRear, rear,
    x + halfBottom, yFront, front,
    x - halfBottom, yFront, front,
    x - halfTop, yTop, rear,
    x + halfTop, yTop, rear,
    x + halfTop, yTop, front,
    x - halfTop, yTop, front,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  // Same winding as taperedBlock: counter-clockwise seen from outside.
  geometry.setIndex([
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 5, 1, 0, 4, 5,
    1, 6, 2, 1, 5, 6,
    2, 7, 3, 2, 6, 7,
    3, 4, 0, 3, 7, 4,
  ]);
  return flatShaded(geometry);
}

/**
 * Vehicle family kit. Local +Z forward, y = 0 on the road, +X the car's right flank.
 * Six families share the game-scale wheel/road envelope and surface batches.
 * Wagon rails, a closed tall van and taxi sign retain their silhouette at every quality.
 */
const BODY_TYPES = Object.freeze(['sedan', 'hatch', 'ute', 'wagon', 'van', 'taxi']);

/**
 * The local-space frame the surface atlas is projected through. Every family shares it, so
 * the plate, handles and shut lines authored in `vehicles/car-surface.js` land on the same
 * features whichever body is instanced. Changing these numbers moves the artwork.
 */
/**
 * CAR-1 fit factors per family (x across, y up, z along, a the extra axle spread), mapping
 * the toy spec onto the true figures in `CAR_TRUE_FIGURES` at TRAFFIC_SCALE 1. The arch keeps
 * its 4.5 cm clearance round the smaller tyre and the tyre keeps its inset from the flank;
 * `mvp/tests/traffic-physics.test.mjs` holds the built box within 3 % of the figures.
 */
const TRUE_FIT = Object.freeze({
  sedan: Object.freeze({ x: 0.945, y: 0.924, z: 1.124, a: 1.05 }),
  hatch: Object.freeze({ x: 0.950, y: 0.881, z: 1.203, a: 1.05 }),
  ute: Object.freeze({ x: 0.957, y: 1.059, z: 1.322, a: 1.05 }),
  wagon: Object.freeze({ x: 0.945, y: 0.926, z: 1.190, a: 1.05 }),
  van: Object.freeze({ x: 1.024, y: 1.026, z: 1.342, a: 1.05 }),
  taxi: Object.freeze({ x: 0.966, y: 0.943, z: 1.241, a: 1.05 }),
});
const UNIT_FIT = Object.freeze({ x: 1, y: 1, z: 1, a: 1 });
// True mode moves the frame with the sedan's own fit, so the plate, handles and shut lines
// land on the sedan exactly where they land on the toy sedan today.
const CAR_FRAME = CAR_TRUE_SCALE
  ? Object.freeze({ halfWidth: 0.92 * TRUE_FIT.sedan.x, height: 1.70 * TRUE_FIT.sedan.y,
    halfLength: 1.90 * TRUE_FIT.sedan.z })
  : Object.freeze({ halfWidth: 0.92, height: 1.70, halfLength: 1.90 });

/** Local z of the door handle centres, matching the handle marks in the side atlas tile. */
const HANDLE_Z = -0.10;
/** Local y of the handle centres, matching the same tile. */
const HANDLE_Y = 0.86;
/** Height of the grey bumper bar's underside. Kept clear of the plate above it. */
const BUMPER_Y = 0.30;

/**
 * Toy proportion, not a scale model shrunk.
 *
 * The reference register (`assets/img/target/v311-vehicles/ref-toy-car-hero-3q.png`) is short
 * in plan, tall in section, with wheels close to half the body height and set deep in cut
 * arches. R40's first cut was a 4.3 m body with a 1.13 m roof — a real car's proportion at
 * board scale, which is why it read as a slab. These numbers are the toy: 3.7 m long,
 * 1.70 m tall, 0.84 m wheels, small overhangs.
 */
// R41: the sedan and the hatch were the same car. Both ran a ~2.1 m cabin ending ~0.4 m
// short of the tail, so both read as one two-box shape and the fleet delivered two
// silhouettes for three geometry sets. They are now separated on the two axes a player can
// actually see at board distance — length and height:
//
//   R2 sedan 3.80 m long, shell roof 1.57 m — lower three-box silhouette
//   R2 hatch 3.26 m long, shell roof 1.68 m — compact two-box silhouette
//
// The arch radius also came down from 0.55 to 0.48 against a 0.42 m tyre, because a 13 cm
// gap between tyre and arch lip is what made the flares read as hoops standing off the body
// rather than as wells the wheel sits in.
const LEGACY_BODY_SPEC = Object.freeze({
  sedan: {
    halfW: 0.90, rearZ: -1.92, frontZ: 1.88,
    axleF: 1.14, axleR: -1.06, archR: 0.465, wheelX: 0.685,
    sillY: 0.26, beltY: 1.02, shoulderH: 0.13,
    bonnet: { z: 1.46, d: 0.84, h: 0.10, w: 1.68 },
    cabin: { w: 1.56, h: 0.44, d: 1.74, z: 0.02, roofCrown: 0.07 },
    boot: { z: -1.38, d: 1.06, h: 0.12 },
  },
  hatch: {
    halfW: 0.885, rearZ: -1.60, frontZ: 1.66,
    axleF: 0.98, axleR: -0.90, archR: 0.462, wheelX: 0.67,
    sillY: 0.27, beltY: 1.00, shoulderH: 0.13,
    bonnet: { z: 1.30, d: 0.62, h: 0.09, w: 1.60 },
    cabin: { w: 1.55, h: 0.56, d: 2.02, z: -0.40, roofCrown: 0.08 },
  },
  ute: {
    halfW: 0.92, rearZ: -1.98, frontZ: 1.88,
    axleF: 1.10, axleR: -1.10, archR: 0.472, wheelX: 0.70,
    sillY: 0.27, beltY: 1.06, shoulderH: 0.13,
    bonnet: { z: 1.48, d: 0.76, h: 0.10, w: 1.68 },
    cabin: { w: 1.60, h: 0.53, d: 1.30, z: 0.44, roofCrown: 0.07 },
    tray: { z: -1.14, d: 1.52, wallH: 0.34 },
  },
  wagon: {
    halfW: 0.90, rearZ: -1.92, frontZ: 1.88,
    axleF: 1.14, axleR: -1.06, archR: 0.465, wheelX: 0.685,
    sillY: 0.26, beltY: 1.02, shoulderH: 0.13,
    bonnet: { z: 1.46, d: 0.84, h: 0.10, w: 1.68 },
    cabin: { w: 1.56, h: 0.49, d: 2.52, z: -0.36, roofCrown: 0.07 },
  },
  van: {
    halfW: 0.90, rearZ: -1.92, frontZ: 1.88,
    axleF: 1.14, axleR: -1.06, archR: 0.465, wheelX: 0.685,
    sillY: 0.26, beltY: 1.02, shoulderH: 0.13,
    bonnet: { z: 1.46, d: 0.84, h: 0.10, w: 1.68 },
    cabin: { w: 1.62, h: 0.82, d: 2.60, z: -0.40, roofCrown: 0.07 },
    panelVan: true,
  },
  taxi: {
    halfW: 0.90, rearZ: -1.92, frontZ: 1.88,
    axleF: 1.14, axleR: -1.06, archR: 0.465, wheelX: 0.685,
    sillY: 0.26, beltY: 1.02, shoulderH: 0.13,
    bonnet: { z: 1.46, d: 0.84, h: 0.10, w: 1.68 },
    cabin: { w: 1.56, h: 0.44, d: 1.74, z: 0.02, roofCrown: 0.07 },
    boot: { z: -1.38, d: 1.06, h: 0.12 },
    taxiSign: true,
  },
});

/**
 * One family's spec fitted to its true figures. Every authored length scales with its axis;
 * the arch keeps its clearance round the tyre (archR − tyre radius) and the tyre keeps the toy's
 * inset from the flank, so the opening and the stance survive the smaller wheel.
 */
function fitSpec(s, f) {
  const X = v => v * f.x, Y = v => v * f.y, Z = v => v * f.z;
  const halfW = X(s.halfW);
  const inset = (s.halfW - s.wheelX - LEGACY_TYRE_HALF_WIDTH * 0.94) * f.x;
  const out = {
    ...s,
    halfW, rearZ: Z(s.rearZ), frontZ: Z(s.frontZ),
    axleF: Z(s.axleF) * f.a, axleR: Z(s.axleR) * f.a,
    archR: TYRE_RADIUS + (s.archR - LEGACY_TYRE_RADIUS),
    wheelX: halfW - inset - TYRE_HALF_WIDTH * 0.94,
    sillY: Y(s.sillY), beltY: Y(s.beltY), shoulderH: Y(s.shoulderH),
    bonnet: { z: Z(s.bonnet.z), d: Z(s.bonnet.d), h: Y(s.bonnet.h), w: X(s.bonnet.w) },
    cabin: { w: X(s.cabin.w), h: Y(s.cabin.h), d: Z(s.cabin.d), z: Z(s.cabin.z),
      roofCrown: Y(s.cabin.roofCrown) },
    k: f,
  };
  if (s.boot) out.boot = { z: Z(s.boot.z), d: Z(s.boot.d), h: Y(s.boot.h) };
  if (s.tray) out.tray = { z: Z(s.tray.z), d: Z(s.tray.d), wallH: Y(s.tray.wallH) };
  return Object.freeze(out);
}

const BODY_SPEC = Object.freeze(Object.fromEntries(Object.entries(LEGACY_BODY_SPEC).map(
  ([type, s]) => [type, CAR_TRUE_SCALE ? fitSpec(s, TRUE_FIT[type]) : Object.freeze({ ...s, k: UNIT_FIT })],
)));

function spec(type) {
  return BODY_SPEC[type] ?? BODY_SPEC.sedan;
}

/** Belt-line height: the top of the shoulder, where paint meets glass. */
function beltTop(s) {
  return s.beltY + s.shoulderH;
}

/** Centre height of the wheel-arch circle: the axle line, so the opening is a true arch. */
function archCentreY() {
  return TYRE_RADIUS;
}

/** Arch roof height at local z, or 0 where this slice is clear of both openings. */
function archProfile(s, z) {
  let top = 0;
  for (const axle of [s.axleF, s.axleR]) {
    const dz = Math.abs(z - axle);
    if (dz < s.archR) top = Math.max(top, archCentreY() + Math.sqrt(s.archR ** 2 - dz * dz));
  }
  return top;
}

/**
 * Flank half-width. Constant along the car by design.
 *
 * A plan taper was tried and removed: the lower body is built as slices, and a taper makes
 * every slice a different width, which exposes a sliver of each slice's own end cap. Those
 * caps face along Z, so the surface projection samples the end tile on them and the flank
 * lights up as a picket fence of number-plate white. Plan interest comes from the rounded
 * shoulder and the arch flares instead, where it costs nothing.
 */
function flankHalfWidth(s) {
  return s.halfW;
}

/** Arch-flare band: section width across the flank, and how far outboard its centre sits. */
const FLARE_SECTION = 0.062;
const FLARE_CENTRE = 0.021;
/** Outer face of the arch flare, measured from the car centreline. */
function flareOuter(s) {
  return flankHalfWidth(s) + FLARE_CENTRE + FLARE_SECTION / 2;
}

/**
 * Largest steer angle at which the front tyre still sits inside its own wheel arch (rad).
 *
 * R42 — M1. This is derived rather than chosen, because the previous ±0.62 rad clamp was
 * chosen, and the arithmetic it implied was never checked against the body. A wheel yawed by
 * θ about its centre reaches
 *
 *     x(θ) = wheelX + halfTread·cos θ + tyreRadius·sin θ
 *          = wheelX + hypot(halfTread, tyreRadius) · sin(θ + atan2(halfTread, tyreRadius))
 *
 * outboard of the centreline: the tread half-width swings in as the cosine, and the tyre's
 * own RADIUS swings out as the sine — the second term is the large one, and it is the one
 * the old clamp ignored. At 0.62 rad on the hatch that put the tyre at 1.038 m against an
 * 0.885 m flank, so the front wheel stood 15 cm outside the bodywork: the black slab hanging
 * off `car-hatch-3q-front.png`. Measured over 60 s of seed 0 before this round, 6.6% of all
 * car-frames had a tyre outboard of its own flank.
 *
 * The ceiling here is the angle at which the tyre's outer shoulder reaches the outer face of
 * the arch flare, less 8 mm. It comes out at 16.93° on the sedan and hatch and 17.73° on the
 * ute, a little more than the 16.1° that a 6.5 m block-corner arc asks of a 1.88 m wheelbase
 * (`CAR_STEER_ENVELOPE` carries the exact figures) — so a normal
 * corner steers to its geometric answer and only the belt hairpin saturates, which is what
 * saturation is for. `mvp/tests/traffic-physics.test.mjs` asserts the envelope directly.
 */
function maxSteerFor(s) {
  const halfTread = TYRE_HALF_WIDTH * 0.94;
  const reach = Math.hypot(halfTread, TYRE_RADIUS);
  const phase = Math.atan2(halfTread, TYRE_RADIUS);
  const room = flareOuter(s) - 0.008 - s.wheelX;
  if (room >= reach) return 0.62;
  return Math.max(0, Math.asin(Math.max(-1, Math.min(1, room / reach))) - phase);
}

/**
 * The steer envelope, exported so a probe can assert it rather than trust this comment.
 * `outboard` is where the tyre's outer shoulder reaches at `maxSteer`; `flareOuter` is what
 * the body offers it.
 */
export const CAR_STEER_ENVELOPE = Object.freeze(Object.fromEntries(BODY_TYPES.map((type) => {
  const s = BODY_SPEC[type] ?? BODY_SPEC.sedan;
  const maxSteer = maxSteerFor(s);
  const halfTread = TYRE_HALF_WIDTH * 0.94;
  return [type, Object.freeze({
    maxSteer,
    maxSteerDeg: (maxSteer * 180) / Math.PI,
    outboardAtLock: s.wheelX + halfTread * Math.cos(maxSteer) + TYRE_RADIUS * Math.sin(maxSteer),
    flareOuter: flareOuter(s),
    flankHalfWidth: s.halfW,
    // CAR-1: the tyre figures the envelope was solved with, so a probe never hard-codes them.
    tyreRadius: TYRE_RADIUS,
    halfTread,
  })];
})));

/**
 * The rendered body box, per family, derived from the kit that draws it (board metres).
 *
 * R42 — the critique's standing minor: `telemetry.json` called body contact "anything under
 * ~4.3 m", `car-headless-verify.mjs` gated contact on `CRASH_GAP` = 2.302 m, and
 * `PUBLISHED_HALF_LEN/WIDTH` published a third figure. Three numbers for one car, and seeds 3
 * and 7 fell between two of them, so the fleet could be touching or not depending on which
 * artefact was read. This is the one number: computed from `BODY_SPEC`, the bumper depth and
 * the arch flare, so it cannot drift from the geometry it describes. `PUBLISHED_HALF_*` stays
 * deliberately larger — it is the keep-out box handed to other lanes, not a measurement.
 *
 * Two boxes at arbitrary relative heading cannot be separated by a centre distance at all, so
 * the harness tests oriented-box separation and this supplies the extents it does it with.
 */
export const CAR_BODY_BOX = Object.freeze(Object.fromEntries(BODY_TYPES.map((type) => {
  const s = BODY_SPEC[type] ?? BODY_SPEC.sedan;
  // Bumperette face: bar centre ± its own depth, on the outermost of the two ends.
  const noseReach = Math.max(s.frontZ + BODY_END_OVERHANG, (s.frontZ - 0.06) + 0.22 / 2);
  const tailReach = Math.max(-(s.rearZ - BODY_END_OVERHANG), -((s.rearZ + 0.06) - 0.22 / 2));
  return [type, Object.freeze({
    halfLength: Number((Math.max(noseReach, tailReach) * TRAFFIC_SCALE).toFixed(4)),
    halfWidth: Number((flareOuter(s) * TRAFFIC_SCALE).toFixed(4)),
  })];
})));

/** Longest and widest built family (m): the ute is 2.6676 long, the van 0.9736 wide. */
const MAX_BODY_HALF_LEN = Math.max(...Object.values(CAR_BODY_BOX).map(b => b.halfLength));
const MAX_BODY_HALF_WIDTH = Math.max(...Object.values(CAR_BODY_BOX).map(b => b.halfWidth));
// CAR-1: the true-mode keep-out box is the built extremes plus the toy's margins, 0.25 m each
// end and 0.10 m each flank (2.9176 x 1.0736 m), so the margin cannot drift from the geometry.
const PUBLISHED_HALF_LEN = CAR_TRUE_SCALE ? MAX_BODY_HALF_LEN + 0.25 : LEGACY_PUBLISHED_HALF_LEN;
const PUBLISHED_HALF_WIDTH = CAR_TRUE_SCALE
  ? MAX_BODY_HALF_WIDTH + 0.10 : LEGACY_PUBLISHED_HALF_WIDTH;
/**
 * How far behind `STOP_SETBACK` a loop's stop line sits (m). The toy kit used its one nominal
 * half-length. At true size the families differ by 0.62 m in half-length, so the line sits a
 * longest-family half-length back: every family's nose then halts at least STOP_SETBACK +
 * STOP_NOSE_GAP from the junction centre, outside the conflict box as the toy sedan's did.
 */
const LINE_SETBACK = CAR_TRUE_SCALE ? MAX_BODY_HALF_LEN : CAR_HALF_LEN;

/** Published keep-out half-extents (m), for probes that check it contains `CAR_BODY_BOX`. */
export const CAR_PUBLISHED_BOX = Object.freeze({
  halfLength: PUBLISHED_HALF_LEN, halfWidth: PUBLISHED_HALF_WIDTH,
});

/**
 * CAR-1: the fit each family's kit was built with (`k`, unit on the toy kit) and the authored
 * planes and centres the fascia hardware hangs from, so geometry probes written on the toy
 * sedan can be carried to the fitted coordinates instead of hard-coding either set.
 */
export const CAR_FIT = Object.freeze(Object.fromEntries(BODY_TYPES.map((type) => {
  const s = spec(type);
  return [type, Object.freeze({
    k: s.k,
    frontZ: s.frontZ,
    rearZ: s.rearZ,
    headLampX: 0.57 * s.k.x,
    headLampY: lampY(s) - (type === 'sedan' ? 0.08 : 0.10),
    tailLampX: 0.65 * s.k.x,
    tailLampY: toyLampY(s) * (CAR_TRUE_SCALE ? s.k.y : 1),
    bumperY: BUMPER_Y * s.k.y,
  })];
})));

/** Authored body extents for a fleet car, or a published obstacle's own box. */
function bodyBoxFor(car) {
  if (Number.isFinite(car?.halfLength)) {
    return {
      halfLength: car.halfLength,
      halfWidth: Number.isFinite(car.halfWidth) ? car.halfWidth : CAR_HALF_WIDTH,
    };
  }
  return CAR_BODY_BOX[car?.bodyType] ?? { halfLength: CAR_HALF_LEN, halfWidth: CAR_HALF_WIDTH };
}

/** Nose-to-tail gap the controller must keep at this speed (m). */
export function desiredFollowGap(speed) {
  return Math.max(QUEUE_STANDSTILL_GAP, QUEUE_TIME_GAP * Math.max(0, Number(speed) || 0));
}

/**
 * Gipps safe speed (m/s): the fastest we may travel and still stop at `gap` leaving the
 * standstill floor, given the leader's speed and a deceleration ceiling.
 */
function gippsSafeSpeed(gap, leaderSpeed, decel = FOLLOW_DECEL) {
  if (!Number.isFinite(gap)) return Infinity;
  const room = Math.max(0, gap - QUEUE_STANDSTILL_GAP);
  const vL = Math.max(0, Number(leaderSpeed) || 0);
  return Math.sqrt(Math.max(0, vL * vL + 2 * Math.max(0.35, decel) * room));
}

/**
 * Lower body, built as slices along the car so the wheel arches are real openings rather than
 * a lip laid over a closed prism. A slice clear of both arches is a barrel section — two
 * stacked tapered blocks, narrow at the sill, full at the waist, drawn back in at the
 * shoulder. A slice across an arch keeps only the core, inboard of the tyre, plus the thin
 * outer skin above the arch line. Where the tyre sits there is nothing: a hole.
 */
function lowerBodySlices(s) {
  const parts = [];
  const bottom = s.sillY;
  const top = s.beltY;
  const mid = bottom + (top - bottom) * 0.45;
  const coreHalf = Math.max(0.34, s.wheelX - 0.19);
  // Slice boundaries: coarse along the body, fine across each arch. A uniform slicing fine
  // enough for the arch shoulders — where the circle climbs fastest — would be wasted along
  // the flat flanks, and a uniform slicing cheap enough for the flanks leaves the arch edge
  // stepping in visible saw teeth.
  const edges = new Set();
  const coarse = 20;
  for (let i = 0; i <= coarse; i += 1) {
    edges.add(s.rearZ + (s.frontZ - s.rearZ) * (i / coarse));
  }
  for (const axle of [s.axleF, s.axleR]) {
    const fine = 26;
    for (let i = 0; i <= fine; i += 1) {
      const z = axle - s.archR + (2 * s.archR * i) / fine;
      if (z > s.rearZ && z < s.frontZ) edges.add(z);
    }
  }
  const doorFront = Math.min(s.axleF - s.archR - 0.025, 0.62 * s.k.z);
  const doorRear = Math.max(s.axleR + s.archR + 0.025, -0.63 * s.k.z);
  const seams = [doorRear, doorFront, ...(s.tray ? [] : [(doorRear + doorFront) / 2])];
  for (const z of seams) { edges.add(z - 0.014); edges.add(z + 0.014); }
  const bounds = [...edges].sort((a, b) => a - b);
  // Each slice is grown a few millimetres past its own boundaries so consecutive slices
  // overlap. Butt-jointed slices leave their end caps exactly coplanar and uncovered, and
  // those caps face along Z: the surface projection samples the end tile on them and, seen
  // edge-on from the kerb, the flank rasterises as a picket fence of number-plate white.
  const overlap = 0.022;
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const za = bounds[i];
    const zb = bounds[i + 1];
    if (zb - za < 1e-4) continue;
    const zc = (za + zb) / 2;
    const isSeam = seams.some(z => Math.abs(zc - z) < 0.014);
    const nearSeam = isSeam || seams.some(z => Math.abs(za - z) < 0.015 || Math.abs(zb - z) < 0.015);
    const d = (zb - za) + (nearSeam ? 0 : overlap * 2);
    const halfW = flankHalfWidth(s) - (isSeam ? 0.026 : 0);
    // Both edges of the *grown* slice, so a slice's ramp meets its neighbour's on the arch
    // line rather than a few millimetres off it.
    const cutRear = archProfile(s, za - overlap);
    const cutFront = archProfile(s, zb + overlap);
    // The upper flank is a VERTICAL plane — same half-width top and bottom — and that is
    // load-bearing, not tidiness. A slice whose top is narrower than its bottom presents a
    // slanted, non-planar quad on the flank, so `flatShaded` gives its two triangles two
    // different normals; with 26 fine slices across each arch the result is a fan of thin
    // shading bands radiating out of every wheel opening, which the R41 hero plates show as
    // corduroy across the whole rear quarter. Held vertical, all four flank triangles of a
    // slice share the ±X normal and consecutive slices shade identically. The section the
    // taper used to give is still there: the tuck-under below the waist keeps its draw-in,
    // and the shoulder cap in `buildBodyGeometry` rolls the belt line over.
    if (cutRear <= bottom + 0.01 && cutFront <= bottom + 0.01) {
      parts.push(taperedBlock(halfW * 0.86, halfW, mid - bottom, d, 0, bottom, zc));
      parts.push(taperedBlock(halfW, halfW, top - mid, d, 0, mid, zc));
      continue;
    }
    parts.push(taperedBlock(coreHalf * 0.9, coreHalf, top - bottom, d, 0, bottom, zc));
    const yRear = Math.max(bottom, cutRear);
    const yFront = Math.max(bottom, cutFront);
    if (Math.min(yRear, yFront) < top - 0.015) {
      parts.push(rampedBlock(halfW, halfW, yRear, yFront, top, d, 0, zc));
    }
  }
  return parts;
}

/**
 * The sedan's bonnet, shoulder and rear deck are one continuous painted skin. The cross
 * sections stay inside the old body envelope and overlap the unchanged lower slices at
 * y=.955; there is no full-length cap underneath a second bonnet or boot lid. A narrow
 * shoulder roll meets the cabin base, then the top falls toward the nose and tail.
 */
function sedanUpperSkin(s) {
  // z, outer half-width, deck half-width, deck height, optional rear shoulder seat.
  // The rear seat lifts only the painted surface directly behind the fixed lamp/trim
  // margins; the central deck heights and every front station remain unchanged.
  // CAR-1: the stations are authored on the toy sedan and carried by its fit (s.k); the end
  // stations are the spec's own planes. Legacy k is 1, so the toy skin is unchanged.
  const { x: kx, y: ky, z: kz } = s.k;
  const stations = [
    [s.rearZ, 0.87, 0.46, 1.08, 0.82, 1.16],
    [-1.78 * kz, 0.88, 0.62, 1.12, 0.82, 1.145],
    [-1.20 * kz, 0.89, 0.73, 1.16],
    [-0.88 * kz, 0.89, 0.73, 1.17],
    [0.74 * kz, 0.89, 0.73, 1.18],
    [0.94 * kz, 0.89, 0.73, 1.19],
    [1.12 * kz, 0.88, 0.72, 1.21],
    [1.43 * kz, 0.85, 0.70, 1.22],
    [1.72 * kz, 0.82, 0.68, 1.16],
    [s.frontZ, 0.78, 0.64, 1.09],
  ].map(([z, outer, deck, top, seatX, seatY]) => [z, outer * kx, deck * kx, top * ky,
    seatX === undefined ? undefined : seatX * kx, seatY === undefined ? undefined : seatY * ky]);
  const vertices = [], indices = [];
  for (const [z, outer, deck, top, seatX, seatY] of stations) {
    const shoulder = seatX ?? Math.min(outer - 0.015, deck + 0.105);
    const section = [
      [-outer + 0.018, 0.955 * ky], [outer - 0.018, 0.955 * ky],
      [outer, 1.025 * ky], [shoulder, seatY ?? top - 0.035], [deck, top],
      [-deck, top], [-shoulder, seatY ?? top - 0.035], [-outer, 1.025 * ky],
    ];
    for (const [x, y] of section) vertices.push(x, y, z);
  }
  for (let station = 0; station < stations.length - 1; station++) {
    const a = station * 8, b = (station + 1) * 8;
    for (let edge = 0; edge < 8; edge++) {
      const next = (edge + 1) % 8;
      indices.push(a + edge, a + next, b + edge,
        a + next, b + next, b + edge);
    }
  }
  const front = (stations.length - 1) * 8;
  // The raised rear lamp shoulders make the end outline concave at the central deck.
  // A fan from the bottom corner crosses that recess; clip convex ears in the section
  // plane so every rear face stays inside the outline and faces outward (−Z).
  const rear = [...Array(8).keys()];
  const cross = (a, b, c) => {
    const ax = vertices[a * 3], ay = vertices[a * 3 + 1];
    return (vertices[b * 3] - ax) * (vertices[c * 3 + 1] - ay)
      - (vertices[b * 3 + 1] - ay) * (vertices[c * 3] - ax);
  };
  while (rear.length > 3) {
    let clipped = false;
    for (let i = 0; i < rear.length; i++) {
      const a = rear[(i + rear.length - 1) % rear.length];
      const b = rear[i];
      const c = rear[(i + 1) % rear.length];
      if (cross(a, b, c) <= 1e-8) continue;
      const occupied = rear.some((p) => p !== a && p !== b && p !== c
        && cross(a, b, p) >= -1e-8 && cross(b, c, p) >= -1e-8
        && cross(c, a, p) >= -1e-8);
      if (occupied) continue;
      indices.push(a, c, b);
      rear.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) throw new Error('Sedan rear skin cap cannot be triangulated');
  }
  indices.push(rear[0], rear[2], rear[1]);
  for (let i = 1; i < 7; i++) {
    indices.push(front, front + i, front + i + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Painted shell. Body-colour only: hull, shoulder, bonnet, nose cap, cabin, roof ribs,
 * mirrors, plate faces. Bumpers, arch flares and rocker are grey plastic and live on the
 * trim mesh, because that value break is what carries the toy at board distance.
 */
function buildBodyGeometry(type) {
  const s = spec(type);
  const belt = beltTop(s);
  const length = s.frontZ - s.rearZ;
  const centreZ = (s.frontZ + s.rearZ) / 2;
  const cabinTop = belt + s.cabin.h;
  const parts = [
    ...lowerBodySlices(s),
    ...(type === 'sedan' ? [sedanUpperSkin(s)] : [
    // Shoulder: a rounded slab capping the slices and rolling the belt line over.
    roundedBox(s.halfW * 1.98, s.shoulderH + 0.12, length - 0.10, 0.18, 0, s.beltY - 0.06, centreZ),
    // Bonnet and the nose cap falling away in front of it.
    roundedBox(s.bonnet.w, s.bonnet.h + 0.12, s.bonnet.d, 0.10, 0, belt - 0.09, s.bonnet.z),
    roundedBox(s.bonnet.w * 0.94, 0.14, s.frontZ - (s.bonnet.z + s.bonnet.d / 2) + 0.04, 0.06,
      0, belt - 0.13, (s.frontZ + s.bonnet.z + s.bonnet.d / 2) / 2 + 0.02),
    // Scuttle: the wedge that carries the bonnet up into the base of the windscreen. Without
    // it the cabin reads as a case set down on a deck.
    taperedBlock(s.cabin.w * 0.46, s.cabin.w * 0.48, 0.13,
      Math.max(0.12, (s.bonnet.z - s.bonnet.d / 2) - (s.cabin.z + s.cabin.d / 2) + 0.22), 0,
      belt - 0.12, ((s.cabin.z + s.cabin.d / 2) + (s.bonnet.z - s.bonnet.d / 2)) / 2),
    ]),
    taperedBlock(s.cabin.w / 2, s.cabin.w / 2 - 0.13,
      s.cabin.h + s.cabin.roofCrown, s.cabin.d, 0, belt - 0.09, s.cabin.z,
      { frontInset: 0.30, rearInset: s.boot ? 0.30 : 0.10 }),
    // R2B: cut the projecting plate slabs; the body atlas retains the markings.
  ];
  if (s.taxiSign) parts.push(roundedBox(0.65, 0.20, 0.26, 0.04,
    0, cabinTop + s.cabin.roofCrown - 0.09, s.cabin.z));
  // R2B: the continuous shoulder already closes the boot. Cut the stacked lid and lip.
  // Mirrors: a stalk and a housing. A bare sphere reads as a ball on a stick at any
  // distance; a rounded shell wider than it is deep reads as a mirror.
  for (const side of [-1, 1]) {
    const mz = s.cabin.z + s.cabin.d * 0.44;
    parts.push(box(0.085, 0.045, 0.055, side * (s.halfW + 0.04), belt - 0.03, mz));
    parts.push(roundedBox(0.075, 0.115, 0.145, 0.045,
      side * (s.halfW + 0.105), belt - 0.045, mz + 0.01));
  }
  if (s.tray) {
    parts.push(roundedBox(s.halfW * 1.86, 0.10, s.tray.d, 0.04, 0, s.beltY, s.tray.z));
    parts.push(roundedBox(0.11, s.tray.wallH, s.tray.d, 0.045,
      -(s.halfW - 0.06), s.beltY + 0.06, s.tray.z));
    parts.push(roundedBox(0.11, s.tray.wallH, s.tray.d, 0.045,
      s.halfW - 0.06, s.beltY + 0.06, s.tray.z));
    parts.push(roundedBox(s.halfW * 1.9, s.tray.wallH, 0.11, 0.045,
      0, s.beltY + 0.06, s.tray.z - s.tray.d / 2));
  }
  return mergeParts(parts);
}

/**
 * Glazing: flat panels set INTO the painted cabin shell rather than a glass volume wrapped
 * round it. Near-black and hard-glossed, so what a player sees is one specular sweep and a
 * dark aperture, which is what the toy register does. Nothing is legible behind it, which is
 * why there is no interior mesh to be seen through a gap.
 */
/** Glass panel centred on the origin, optionally raked, then placed. */
function glassPanel(sx, sy, sz, radius, rotX, x, y, z) {
  const g = roundedBox(sx, sy, sz, radius, 0, -sy / 2, 0);
  if (rotX) g.rotateX(rotX);
  g.translate(x, y, z);
  return g;
}

/**
 * Glazing: four flat panels set into the faces of the painted cabin, each poking a couple of
 * centimetres proud of the paint. Near-black and hard-glossed, so what a player sees is a dark
 * aperture with one specular sweep across it — the toy register's whole glass language.
 *
 * A single band wrapped round the cabin was tried first and cannot work: the rounded-box
 * radius is clamped by the band's own height, so the band turns into a black tube and reads
 * as a rubbing strip. Panels leave the A, B and C pillars in body colour for free, because
 * the paint between them is simply not covered.
 */
function buildCabinGeometry(type) {
  const s = spec(type);
  const base = beltTop(s) - 0.09;
  const h = s.cabin.h + s.cabin.roofCrown;
  const halfW = s.cabin.w / 2;
  const front = s.cabin.z + s.cabin.d / 2;
  const rear = s.cabin.z - s.cabin.d / 2;
  const rearInset = s.boot ? 0.30 : 0.10;
  const parts = [];
  // Finite-thickness panes follow the tapered shell, leaving painted A/B/C pillars.
  const pane = (points) => {
    const vertices = points.map(p => new THREE.Vector3(...p));
    const normal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize();
    const centre = vertices.reduce((v, p) => v.add(p), new THREE.Vector3()).multiplyScalar(0.25);
    if (normal.x * centre.x + normal.z * (centre.z - s.cabin.z) < 0) {
      vertices.reverse(); normal.negate();
    }
    const all = [...vertices, ...vertices.map(v => v.clone().addScaledVector(normal, -0.022))];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(all.flatMap(v => v.toArray()), 3));
    g.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
      0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2,
      2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
    return flatShaded(g);
  };
  const lo = 0.13, hi = 0.86;
  for (const end of [1, -1]) {
    if (s.panelVan && end < 0) continue;
    const zAt = t => end > 0 ? front - 0.30 * t + 0.008 : rear + rearInset * t - 0.008;
    const wAt = t => halfW - 0.13 * t - 0.075;
    parts.push(pane([
      [-wAt(lo), base + h * lo, zAt(lo)], [wAt(lo), base + h * lo, zAt(lo)],
      [wAt(hi), base + h * hi, zAt(hi)], [-wAt(hi), base + h * hi, zAt(hi)],
    ]));
  }
  const ranges = s.tray ? [[0.10, 0.89]] : s.panelVan ? [[0.64, 0.92]]
    : s.rails ? [[0.07, 0.30], [0.35, 0.59], [0.64, 0.92]] : [[0.09, 0.46], [0.52, 0.91]];
  for (const side of [-1, 1]) {
    for (const [a, b] of ranges) {
      const at = (u, t) => [side * (halfW - 0.13 * t + 0.008), base + h * t,
        rear + rearInset * t + (s.cabin.d - (rearInset + 0.30) * t) * u];
      parts.push(pane([at(a, lo), at(b, lo), at(b, hi), at(a, hi)]));
    }
  }
  return mergeParts(parts);
}

/** Lamp height on the nose and tail — low on the face, above the bumper bar. */
function lampY(s) {
  return s.beltY - 0.18;
}

/**
 * Round lens facing along local ±Z.
 *
 * An ellipsoid, not a disc on a stub. R40 used a short cylinder, which presents a flat
 * circular face to the camera and — on the unlit basic material the lamps used to share —
 * rendered as a plain white dot with no lens, no depth and no bezel. That is the "lamps are
 * flat discs" finding. A domed lens has curvature for the sun to run across, and it is
 * buried far enough into the panel that the bezel ring on the trim mesh reads as a recess.
 */
function lens(radius, depth, x, y, z) {
  const g = new THREE.SphereGeometry(radius, 14, 10);
  g.scale(1, 0.94, Math.max(0.18, depth / Math.max(1e-4, radius)));
  g.translate(x, y, z);
  return g;
}


function buildHeadLampGeometry(type) {
  const s = spec(type);
  if (type === 'sedan') {
    // One shallow lens in each finite fascia aperture. The outer face is nearly flush with
    // its four-sided trim frame instead of projecting past a thick solid bezel block.
    return mergeParts([-1, 1].map(side => roundedBox(0.30, 0.19, 0.055, 0.028,
      side * 0.57 * s.k.x, lampY(s) - 0.08, s.frontZ + 0.007, 3)));
  }
  // Set back from the BUILT face so the ellipsoid's cap fills the bezel hole (0.122 m radius)
  // exactly. R41 sat 0.055 back from the authored plane, which left a 0.060 m cap in a
  // 0.122 m ring: the "small bright dot inside a big grey donut" every hero plate shows.
  const z = s.frontZ + BODY_END_OVERHANG - 0.044;
  return mergeParts([
    roundedBox(0.34, 0.23, 0.09, 0.035, -0.57 * s.k.x, lampY(s) - 0.10, z + 0.05, 3),
    roundedBox(0.34, 0.23, 0.09, 0.035, 0.57 * s.k.x, lampY(s) - 0.10, z + 0.05, 3),
  ]);
}

/**
 * Tail lamps.
 *
 * R41 placed these at `rearZ + 0.045` with a 0.062 m half-depth, so the lens reached
 * `rearZ - 0.017` — 5 mm SHORT of the body's own rear face at `rearZ - 0.022`. The lamp was
 * therefore sealed inside the bodywork and could not be seen from any angle, which is why
 * `seq-red-approach` shows two grey bezel rings filled with body colour on a car whose
 * `braking` flag, instance colour and material were all measured correct
 * (2.60/0.16/0.14 written on every frame of the approach). A brake light that is right in
 * the controller and invisible in the geometry is still a brake light that never lights.
 *
 * At `rearZ + 0.010` the cap silhouette at the body face is 0.084 m, which is exactly the
 * bezel's inner hole, so the lens fills its ring and stands ~30 mm proud of the panel.
 */
/**
 * CAR-1: the tail-lamp row (lenses, their bezels and the rear indicators) is carried by the
 * family's fit as one affine piece. It is authored at the toy anchors (x ±0.65, the toy lamp
 * line) and scaled across and up by k, so it keeps the margins R98b seated it in against the
 * rear deck, which scales the same way. Hung from the moved lamp line at its toy size, the
 * bezel's inboard top stood 3 mm above the painted cap. The toy kit is not transformed at all.
 */
function toyLampY(s) {
  return s.beltY / s.k.y - 0.18;
}
function rearFit(s, g) {
  if (CAR_TRUE_SCALE) g.scale(s.k.x, s.k.y, 1);
  return g;
}

function buildTailLampGeometry(type) {
  const s = spec(type);
  const z = s.rearZ - BODY_END_OVERHANG + 0.032;
  return mergeParts([
    rearFit(s, roundedBox(0.22, 0.25, 0.075, 0.025, -0.65, toyLampY(s), z - 0.04, 3)),
    rearFit(s, roundedBox(0.22, 0.25, 0.075, 0.025, 0.65, toyLampY(s), z - 0.04, 3)),
  ]);
}

/**
 * One flank's indicators — nose corner, side repeater, tail corner — as a single mesh, so a
 * turn signal can light one side of the car and a hazard can light both.
 * @param {string} type
 * @param {-1|1} side local X sign. A turn that increases yaw goes toward local +X.
 */
function buildIndicatorGeometry(type, side) {
  const s = spec(type);
  // Same burial as the tail lamps, and worse: a 0.040 m half-depth set 0.030 inboard reached
  // `frontZ + 0.010` against a body face at `frontZ + 0.022`, so both indicators sat 12 mm
  // inside the panel. The flash logic, the two-flank instanced split and the hazard state
  // were all working on lamps no camera could see.
  return mergeParts([
    lens(0.050, 0.040, side * 0.72 * s.k.x, lampY(s) + 0.14, s.frontZ + BODY_END_OVERHANG - 0.016),
    rearFit(s, lens(0.047, 0.038, side * 0.66, toyLampY(s) - 0.02,
      s.rearZ - BODY_END_OVERHANG + 0.016)),
  ]);
}

/**
 * The wheel-house cavity behind each arch opening: a half-barrel liner plus a back wall.
 *
 * This is what makes the tyre read as sitting *in* the car — the double-sided liner shows the
 * inside of the arch roof through the opening, and that is the shadow the eye uses to judge
 * that a wheel is recessed. R42 split it onto its own material (`wheelHouseMat`), because the
 * underbody it used to share one with wants the opposite treatment: the underbody should be
 * black, and the cavity should not.
 */
function buildWheelHouseGeometry(type) {
  const s = spec(type);
  const parts = [];
  for (const axle of [s.axleF, s.axleR]) {
    for (const side of [-1, 1]) {
      const outer = flankHalfWidth(s);
      const depth = 0.26;
      const house = new THREE.CylinderGeometry(s.archR - 0.03, s.archR - 0.03, depth,
        16, 1, true, 0, Math.PI);
      house.rotateZ(Math.PI / 2);
      house.translate(side * (outer - depth / 2), archCentreY(), axle);
      parts.push(house);
      // Back wall, so the arch does not look straight through the car.
      //
      // R41: this used to start at y = 0.02 and run 0.95 m tall by 2·archR deep, which put
      // a 5 cm black blade 14 cm BELOW the underbody and a metre long fore-and-aft. Seen
      // from a low board camera it hangs under the sill and past the bumper with nothing
      // joining it to the car — the "bumper prongs into the road" and "comb slats under the
      // sill" in the R40 critique are both this one box, on the front and rear axles. It
      // now spans the arch opening only, and its underside stops at the sill.
      const wallBottom = s.sillY - 0.02;
      const wallTop = archCentreY() + s.archR - 0.02;
      parts.push(box(0.045, Math.max(0.08, wallTop - wallBottom), s.archR * 1.62,
        side * (outer - depth - 0.02), wallBottom, axle));
    }
  }
  return mergeParts(parts);
}

/**
 * Everything else that is dark: the underbody slab, the grille, the wipers and the exhaust.
 * These genuinely want to stay near-black — the underbody IS the car's contact shadow.
 */
function buildDarkDetailGeometry(type) {
  const s = spec(type);
  const parts = [];
  parts.push(box(s.halfW * 1.35, 0.10, (s.frontZ - s.rearZ) * 0.84, 0, s.sillY - 0.10,
    (s.frontZ + s.rearZ) / 2));
  if (type === 'sedan') {
    // The atlas plate occupies x≈±0.23, y≈0.63–0.73 on the painted nose. Seat the
    // intake above that whole footprint, between the lamp frames, without moving the plate.
    parts.push(roundedBox(0.66 * s.k.x, 0.10, 0.035, 0.025, 0,
      lampY(s) - 0.08, s.frontZ + 0.021));
  } else {
    parts.push(roundedBox(0.86 * s.k.x, 0.14, 0.06, 0.05, 0, lampY(s) - 0.025, s.frontZ + 0.035));
  }
  const cabinBase = beltTop(s) - 0.09;
  const cabinH = s.cabin.h + s.cabin.roofCrown;
  const screenBase = s.cabin.z + s.cabin.d / 2 - 0.30 * 0.16 + 0.016;
  for (const side of [-1, 1]) {
    parts.push(box(0.47 * s.k.x, 0.020, 0.018, side * 0.28 * s.k.x, cabinBase + cabinH * 0.16, screenBase));
    // Thin dark reveals rooted in the side panel: full door perimeter, with the sill
    // providing the lower edge. Width is authored in game metres, independent of atlas.
    const x = side * (flankHalfWidth(s) - 0.017);
    const doorFront = Math.min(s.axleF - s.archR - 0.025, 0.62 * s.k.z);
    const doorRear = Math.max(s.axleR + s.archR + 0.025, -0.63 * s.k.z);
    for (const z of [doorRear, doorFront, ...(s.tray ? [] : [(doorRear + doorFront) / 2])]) {
      parts.push(box(0.014, s.beltY - 0.42 * s.k.y, 0.022, x, 0.42 * s.k.y, z));
    }
    parts.push(box(0.014, 0.022, doorFront - doorRear, x, 0.42 * s.k.y, (doorFront + doorRear) / 2));
    // Upper panel van cargo-door outline follows the raked sidewall.
    if (s.panelVan) {
      for (const t of [0.14, 0.86]) parts.push(box(0.022, 0.018, 1.32 * s.k.z,
        side * (s.cabin.w / 2 - 0.13 * t), cabinBase + cabinH * t, s.cabin.z - 0.30 * s.k.z));
      for (const z of [s.cabin.z - 0.96 * s.k.z, s.cabin.z + 0.36 * s.k.z]) {
        const edge = box(0.022, cabinH * 0.72, 0.018, 0, -cabinH * 0.36, 0);
        edge.rotateZ(side * Math.atan(0.13 / cabinH));
        edge.translate(side * (s.cabin.w / 2 - 0.065 + 0.008), cabinBase + cabinH * 0.50, z);
        parts.push(edge);
      }
    }
    if (s.rails) parts.push(box(0.055, 0.055, 1.56 * s.k.z,
      side * 0.53 * s.k.x, cabinBase + cabinH + 0.08, s.cabin.z - 0.15 * s.k.z));
    // Visible mirror backing attached to the housing's rear face.
    parts.push(box(0.068, 0.080, 0.015, side * (s.halfW + 0.105),
      beltTop(s) - 0.03, s.cabin.z + s.cabin.d * 0.44 - 0.065));
  }
  // Exhaust stub. R42 — M7: it was 0.18 m long centred 0.02 m BEHIND the tail panel, so
  // 110 mm of pipe stood out past the rear of the car with nothing behind it. A tailpipe
  // shows its last few centimetres under the valance: 0.14 m long, seated so 40 mm shows.
  const pipe = new THREE.CylinderGeometry(0.05, 0.05, 0.14, 8, 1);
  pipe.rotateX(Math.PI / 2);
  pipe.translate(-0.44 * s.k.x, s.sillY - 0.04, s.rearZ + 0.03);
  parts.push(pipe);
  return mergeParts(parts);
}

/**
 * Grey plastic. Bumpers with their bumperettes, the rocker strip along the sill, the arch
 * flares, door handles and lamp bezels.
 *
 * This is the single biggest thing separating the toy register from a coloured lump: a hard
 * value break between saturated paint and unpainted grey plastic, carried on the parts a
 * real car has in unpainted plastic. It reads at board distance where no amount of surface
 * detail does.
 */
function buildTrimGeometry(type) {
  const s = spec(type);
  const parts = [];
  // Arch flares.
  //
  // R40 built these as a torus of tube radius 0.078 sitting 12 mm outboard of the flank, so
  // the lip stood 90 mm proud of the body as a round pipe, with 130 mm of daylight between
  // pipe and tyre. Every R40 plate reads it the same way: a grey hoop bolted beside a wheel,
  // which the critique called the single most damaging read in the frame. A flare is not a
  // pipe. It is a rectangular lip rooted *in* the flank, standing a few centimetres proud
  // and following the opening — so it is built here as a swept band with a rectangular
  // section: buried 25 mm into the flank, 42 mm proud of it, 85 mm deep radially.
  //
  // R41 swept 19 segments of a 26 mm-radius rounded box, which at a 62 mm section width is
  // the maximum the clamp allows — i.e. a capsule. Nineteen overlapping capsules read as
  // nineteen beads, and the hero side plates show the flare as a bicycle chain laid round
  // the wheel rather than as a lip. The section is squarer now (10 mm radius) and the sweep
  // finer, so consecutive segments merge into one band; a 26-sided arc is smooth at board
  // distance and the flat facets carry the light better than domes did. Coarser box
  // subdivision pays for the extra segments: this is ~11k triangles per family against
  // ~23k before.
  // R42: the band's centre moves from `halfW + 0.0085` to `halfW + FLARE_CENTRE`, so it
  // stands 52 mm proud instead of 39.5 and stays 10 mm rooted in the flank. That extra
  // 12.5 mm is not styling — it is the room a steered front tyre needs. See `maxSteerFor`.
  const flareSegments = 26;
  const flareArc = Math.PI + 0.44;
  const flareStart = -0.22;
  for (const axle of [s.axleF, s.axleR]) {
    for (const side of [-1, 1]) {
      const radius = s.archR + 0.012;
      const chord = (flareArc / flareSegments) * radius * 1.45;
      for (let i = 0; i < flareSegments; i += 1) {
        const theta = flareStart + flareArc * ((i + 0.5) / flareSegments);
        const seg = box(FLARE_SECTION, 0.078, chord, 0, -0.039, 0);
        // Local +Y becomes the radial direction, local +Z the tangent.
        seg.rotateX(Math.PI / 2 - theta);
        seg.translate(
          side * (flankHalfWidth(s) + FLARE_CENTRE),
          archCentreY() + radius * Math.sin(theta),
          axle + radius * Math.cos(theta),
        );
        parts.push(seg);
      }
    }
  }
  // Rocker strip joining the two arches along the sill.
  //
  // R41 ran it 155 mm tall from `sillY - 0.02`, so its top edge landed at 0.405 m against a
  // 0.42 m tyre radius — the strip sat at hub height and stood 85 mm off the flank, which in
  // both side plates reads as a nerf bar bolted between the wheels rather than as a sill.
  // A rocker belongs UNDER the door and hard against the body: 105 mm tall, topping out
  // below the sill line, and 18 mm proud instead of 42.
  // R42 — M7. The strip ran `rockerD + 0.34` at 18 mm proud, which does reach both arch
  // openings on the arithmetic, but the flare beside it now stands 52 mm proud, so the join
  // sat 34 mm inboard of the lip and read from the kerb as a strip stopping in daylight. It
  // runs further into both openings and stands 28 mm proud, still under the door line and
  // still well outboard of the tyre (0.865 m against a tread edge at 0.813 m), so nothing
  // intersects.
  const rockerD = (s.axleF - s.archR) - (s.axleR + s.archR);
  for (const side of [-1, 1]) {
    parts.push(roundedBox(0.048, 0.105, Math.max(0.2, rockerD + 0.46), 0.020,
      side * (s.halfW + 0.004), s.sillY - 0.055, (s.axleF + s.axleR) / 2));
  }
  // Bumpers: a bar across the face with two vertical bumperettes standing on it. The bar is
  // as wide as the body so its ends die into the corner radius rather than stopping short.
  //
  // R42 — M7. The bumperette was 0.30 m tall seated 0.01 m below a 0.26 m bar, so it stood
  // 10 mm proud below the bar and 30 mm proud above it: a peg crossing the bumper rather
  // than a rib on it, which is the "two vertical pegs hanging below the front bumper" of the
  // blind read. It is now 0.20 m tall seated 0.03 m up, 30 mm inside the bar top and bottom.
  // The 0.22 m depth against the bar's 0.20 stays — standing proud of the bar FACE is what a
  // bumperette is for.
  for (const [z, w] of [[s.frontZ - 0.06, s.halfW * 2.02], [s.rearZ + 0.06, s.halfW * 1.98]]) {
    if (type === 'sedan' && z > 0) {
      // A single lower bar with short returns seated into the front quarters. The old two
      // vertical bumperettes divided its face into separate pegs at this viewing scale.
      parts.push(roundedBox(s.halfW * 2.00, 0.22, 0.18, 0.065,
        0, BUMPER_Y * s.k.y, s.frontZ - 0.043));
      for (const side of [-1, 1]) parts.push(roundedBox(0.14, 0.22, 0.28, 0.035,
        side * 0.82 * s.k.x, BUMPER_Y * s.k.y, s.frontZ - 0.093));
      continue;
    }
    parts.push(roundedBox(w, 0.26, 0.20, 0.09, 0, BUMPER_Y * s.k.y, z));
    for (const side of [-1, 1]) {
      parts.push(roundedBox(0.13, 0.20, 0.22, 0.055, side * (w * 0.34), BUMPER_Y * s.k.y + 0.03, z));
    }
  }
  // Lamp bezels: a ring standing proud of the nose so the lens sits in a recess.
  for (const side of [-1, 1]) {
    if (type === 'sedan') {
      const x = side * 0.57 * s.k.x, y = lampY(s) - 0.08, z = s.frontZ + 0.018;
      // Four real sides leave the pale lens exposed; no black slab sits behind it.
      for (const edge of [-1, 1]) {
        parts.push(box(0.035, 0.235, 0.040, x + edge * 0.166, y - 0.022, z));
        parts.push(box(0.37, 0.035, 0.040, x,
          edge < 0 ? y - 0.018 : y + 0.19 - 0.017, z));
      }
    } else {
      parts.push(roundedBox(0.40, 0.29, 0.06, 0.04,
        side * 0.57 * s.k.x, lampY(s) - 0.13, s.frontZ + 0.032, 3));
    }
    parts.push(rearFit(s, roundedBox(0.28, 0.31, 0.06, 0.035,
      side * 0.65, toyLampY(s) - 0.03, s.rearZ - 0.027, 3)));
  }
  if (type !== 'sedan') for (const y of [lampY(s) + 0.01, lampY(s) + 0.065]) {
    parts.push(box(0.78 * s.k.x, 0.018, 0.018, 0, y, s.frontZ + 0.072));
  }
  // Door handles, at the local z and y the side atlas tile draws them.
  for (const side of [-1, 1]) {
    parts.push(roundedBox(0.05, 0.055, 0.22, 0.022,
      side * (flankHalfWidth(s) + 0.016), HANDLE_Y * s.k.y - 0.028, HANDLE_Z * s.k.z));
  }
  return mergeParts(parts);
}

/**
 * Single tyre at origin (axis = local X); positioned per-wheel in update.
 *
 * A ring, not a drum. R40 built the tyre as a solid capped cylinder, which means the rim
 * lived entirely inside it and the only part a camera could ever see was the few
 * millimetres of hub that poked past the face — a flat pale dot on a black disc, which is
 * precisely the "wheels are buttons" finding. An open tread with annulus sidewalls leaves a
 * real hole for the rim to sit in, and the rim's dish then has somewhere to be seen.
 */
/** Tread shoulder radius: the toy literal on the legacy kit, the same 24 mm roll at true size. */
const TYRE_SHOULDER_R = CAR_TRUE_SCALE ? TYRE_RADIUS - 0.024 : 0.396;

function buildSingleTyreGeometry() {
  const parts = [];
  const profile = [
    [-0.143, TYRE_SHOULDER_R], [-0.125, TYRE_RADIUS], [-0.055, TYRE_RADIUS],
    [-0.043, TYRE_RADIUS - 0.022], [-0.025, TYRE_RADIUS - 0.022], [-0.013, TYRE_RADIUS],
    [0.013, TYRE_RADIUS], [0.025, TYRE_RADIUS - 0.022], [0.043, TYRE_RADIUS - 0.022],
    [0.055, TYRE_RADIUS], [0.125, TYRE_RADIUS], [0.143, TYRE_SHOULDER_R],
  ].map(([x, r]) => new THREE.Vector2(r, x * TYRE_WIDTH_K));
  const tread = new THREE.LatheGeometry(profile, 24);
  tread.rotateZ(Math.PI / 2);
  parts.push(tread);
  // Shoulder relief: a slightly smaller, slightly NARROWER ring so the tread edge is not
  // square. R42: it used to be `TYRE_HALF_WIDTH * 2`, i.e. 9 mm WIDER than the tread it is
  // relieving, at a 24 mm smaller radius — a ring standing proud of the tyre's own sides at
  // hub height, which is a lip rather than a shoulder. It also set the tyre's true half
  // width to 0.152 rather than the tread's 0.143, and that figure is load-bearing: it is
  // what `maxSteerFor` has to fit inside the arch flare.
  const shoulder = new THREE.CylinderGeometry(TYRE_RADIUS - 0.024, TYRE_RADIUS - 0.024,
    TYRE_HALF_WIDTH * 1.72, 20, 1, true);
  shoulder.rotateZ(Math.PI / 2);
  parts.push(shoulder);
  for (const side of [-1, 1]) {
    const wall = new THREE.RingGeometry(RIM_RADIUS, TYRE_RADIUS - 0.020, 24, 8);
    const wp = wall.attributes.position;
    for (let i = 0; i < wp.count; i++) {
      const u = (Math.hypot(wp.getX(i), wp.getY(i)) - RIM_RADIUS)
        / (TYRE_RADIUS - 0.020 - RIM_RADIUS);
      // Moulded sidewall bead: the tread is under the arch in a side view, so keep
      // a second recessed material break on the exposed sidewall itself.
      wp.setZ(i, u > 0.48 && u < 0.76 ? -0.014 : 0);
    }
    wall.computeVertexNormals();
    wall.rotateY(side * Math.PI / 2);
    wall.translate(side * TYRE_HALF_WIDTH, 0, 0);
    parts.push(wall);
  }
  return mergeParts(parts);
}

/**
 * Dished wheel: rim well, a lip standing at each outboard edge, a raised hub cap and five
 * spokes across the face. Symmetric about the axle, because one geometry serves both flanks
 * and an asymmetric rim would present its back face to every wheel on the left of the car.
 *
 * R40's rim was a full-width drum with a flat end face, which is why every plate shows a
 * pale button rather than a wheel. Depth is what makes a rim read at board distance — the
 * step from lip to dish to hub gives the light three planes to do different things on.
 */
function buildSingleRimGeometry() {
  const rOut = RIM_RADIUS + 0.006;
  const rWell = rOut * 0.78;
  const faceX = TYRE_HALF_WIDTH - 0.012;
  const parts = [];
  const barrel = new THREE.CylinderGeometry(rWell, rWell, faceX * 2 - 0.02, 16, 1);
  barrel.rotateZ(Math.PI / 2);
  parts.push(barrel);
  for (const side of [-1, 1]) {
    const lip = new THREE.TorusGeometry(rOut, 0.028, 6, 16);
    lip.rotateY(Math.PI / 2);
    lip.translate(side * (faceX - 0.010), 0, 0);
    parts.push(lip);
    // Wide at the lip, narrow inboard: the dish. rotateZ(π/2) sends the cylinder's top
    // radius to −X, so the radii swap with the side.
    const dish = side > 0
      ? new THREE.CylinderGeometry(rWell, rOut, 0.070, 16, 1)
      : new THREE.CylinderGeometry(rOut, rWell, 0.070, 16, 1);
    dish.rotateZ(Math.PI / 2);
    dish.translate(side * (faceX - 0.042), 0, 0);
    parts.push(dish);
    const cap = new THREE.SphereGeometry(rOut * 0.40, 10, 6);
    cap.scale(0.42, 1, 1);
    cap.translate(side * (faceX + 0.010), 0, 0);
    parts.push(cap);
    for (let i = 0; i < 5; i += 1) {
      const spoke = new THREE.BoxGeometry(0.040, 0.055, rOut * 0.80);
      spoke.translate(0, 0, rOut * 0.50);
      spoke.rotateX((i / 5) * Math.PI * 2 + 0.15);
      spoke.translate(side * (faceX - 0.018), 0, 0);
      parts.push(spoke);
    }
  }
  return mergeParts(parts);
}

/**
 * Wheel local offsets [x, y, z] by body type, derived from the body spec so the tyres cannot
 * drift out of their arches. y is the tyre radius, which is what puts the contact patch on
 * the road; x is inboard of the flank, which is what puts the tyre inside the opening.
 */
export const WHEEL_OFFSETS = Object.freeze(Object.fromEntries(BODY_TYPES.map((type) => {
  const s = spec(type);
  return [type, [
    [-s.wheelX, TYRE_RADIUS, s.axleF],
    [s.wheelX, TYRE_RADIUS, s.axleF],
    [-s.wheelX, TYRE_RADIUS, s.axleR],
    [s.wheelX, TYRE_RADIUS, s.axleR],
  ]];
})));

function wrapDist(d, length) {
  return ((d % length) + length) % length;
}

function forwardDelta(from, to, length) {
  return wrapDist(to - from, length);
}

function laneCentreA() {
  return (CORRIDOR.carriagewayA[0] + CORRIDOR.carriagewayA[1]) / 2;
}

function laneCentreB() {
  return (CORRIDOR.carriagewayB[0] + CORRIDOR.carriagewayB[1]) / 2;
}

/**
 * Closed loops that ONLY travel on corridor carriageways (real roads).
 * Outer ring uses edge corridors; inner belts use interior corridors.
 * Each point sits at a carriageway centreline — never through a block core.
 */
function buildRoadLoops(city) {
  const { blocksX, blocksZ } = city;
  const a = laneCentreA();
  const b = laneCentreB();
  const loops = [];
  const junctions = cityJunctions(city);

  // Outer clockwise: southbound on west B? Use consistent left-hand feel.
  // N-bound on west corridor lane B (x high in corridor 0), E-bound on north lane A,
  // S-bound on east corridor lane A, W-bound on south lane B.
  {
    const xW = 0 * PITCH + b; // west NS road
    const xE = blocksX * PITCH + a; // east NS road
    const zN = 0 * PITCH + a; // north EW road
    const zS = blocksZ * PITCH + b; // south EW road
    // Margin: stay out of junction centres slightly by using kerb-to-kerb run ends.
    const z0 = zN;
    const z1 = zS;
    const x0 = xW;
    const x1 = xE;
    const corners = [
      { x: x0, z: z0 },
      { x: x1, z: z0 },
      { x: x1, z: z1 },
      { x: x0, z: z1 },
    ];
    loops.push(closeLoop(corners, 1, junctions));
  }

  // Counter-clockwise outer twin on opposite lanes.
  {
    const xW = 0 * PITCH + a;
    const xE = blocksX * PITCH + b;
    const zN = 0 * PITCH + b;
    const zS = blocksZ * PITCH + a;
    loops.push(closeLoop([
      { x: xW, z: zN },
      { x: xW, z: zS },
      { x: xE, z: zS },
      { x: xE, z: zN },
    ], 1, junctions));
  }

  // Interior NS belt loops using corridor i (1..blocksX-1) paired with EW 0 and blocksZ.
  for (let i = 1; i < blocksX; i += 1) {
    const xA = i * PITCH + a;
    const xB = i * PITCH + b;
    const zN = 0 * PITCH + a;
    const zS = blocksZ * PITCH + b;
    loops.push(closeLoop([
      { x: xA, z: zN },
      { x: xA, z: zS },
      { x: xB, z: zS },
      { x: xB, z: zN },
    ], i % 2 === 0 ? 1 : -1, junctions));
  }

  // Interior EW belt loops using corridor j.
  for (let j = 1; j < blocksZ; j += 1) {
    const zA = j * PITCH + a;
    const zB = j * PITCH + b;
    const xW = 0 * PITCH + a;
    const xE = blocksX * PITCH + b;
    loops.push(closeLoop([
      { x: xW, z: zA },
      { x: xE, z: zA },
      { x: xE, z: zB },
      { x: xW, z: zB },
    ], j % 2 === 0 ? -1 : 1, junctions));
  }

  return loops.filter((loop) => loop.length > 40);
}

/**
 * A compact four-corridor circuit whose complete centreline projects inside the fixed
 * entertainment-landmass plate. It is still a real road loop: two north-city vertical
 * carriageways joined by the j=3 and perimeter j=4 horizontal carriageways. Keeping the whole
 * circuit in-frustum makes the "at any time" traffic law structural instead of a seed-0 snapshot.
 */
function buildEntertainmentPlateLoop(city) {
  if ((city?.blocksX ?? 0) < 2 || (city?.blocksZ ?? 0) < 4) return null;
  const a = laneCentreA();
  const b = laneCentreB();
  return closeLoop([
    { x: PITCH + b, z: PITCH * 3 + b },
    { x: PITCH * 2 + a, z: PITCH * 3 + b },
    { x: PITCH * 2 + a, z: PITCH * 4 + a },
    { x: PITCH + b, z: PITCH * 4 + a },
  ], 1, cityJunctions(city));
}

/**
 * Every corridor crossing on the board, perimeter included, each tagged with whether a signal
 * head actually stands there. `streetscape._buildTrafficSignals` poles interior junctions on
 * the odd (i+j) diagonal only; those are the ones cars obey a phase at. The rest are
 * unsignalised give-way crossings — a car still has to yield there, it just is not waiting
 * for a light that does not exist.
 */
function cityJunctions(city) {
  const { blocksX, blocksZ } = city;
  const junctions = [];
  for (let i = 0; i <= blocksX; i += 1) {
    for (let j = 0; j <= blocksZ; j += 1) {
      const interior = i >= 1 && i < blocksX && j >= 1 && j < blocksZ;
      const x = i * PITCH + ROAD / 2;
      const z = j * PITCH + ROAD / 2;
      junctions.push({
        x,
        z,
        signalised: interior && ((i + j) % 2 === 1),
        key: `${Math.round(x)}:${Math.round(z)}`,
      });
    }
  }
  return junctions;
}

function closeLoop(corners, dir = 1, junctions = []) {
  const ordered = dir > 0 ? corners : [...corners].reverse();
  // Sample quarter-circle arcs at corners so cars steer instead of crabbing.
  //
  // R42 — THE CORNER RADIUS MUST FIT BETWEEN ITS OWN TWO LEGS, and until this round it did
  // not. `cornerR` was a flat 6.5 m, applied to every corner of every loop. The interior belt
  // loops are hairpins: `buildRoadLoops` runs them down carriageway A and back up carriageway
  // B of the SAME corridor, and the two lane centres are 7 m apart (`CORRIDOR.carriagewayA/B`
  // → 4.5 and 11.5). So the short leg of the hairpin is 7 m while each of its two corners
  // wanted 6.5 m of run-in and 6.5 m of run-out — 13 m of arc on a 7 m leg.
  //
  // Measured on seed 0, loop 4 (the hero plate's loop), before the fix: points [13] and [14]
  // are (197.00, 267.50) and (203.00, 267.50) — a single 6.00 m polyline segment running
  // EAST while every segment either side of it runs WEST. The path folded back on itself
  // and re-traversed 6 m of its own length, twice per hairpin, three times per lap, on all
  // four interior belts. Cars did not merely steer oddly there; they reversed direction on
  // the board.
  //
  // Everything M1 describes follows from that fold. `car.turnNear` — the heading delta to a
  // probe 6 m ahead — measured 2.73 rad (156°) at the hero pose, curvature 0.455 /m, and the
  // steer clamp saturated at 0.612 rad (35.1°), which threw the front tyre 15 cm outboard of
  // an 0.885 m flank. That is the black slab in `car-hatch-3q-front.png`.
  //
  // The radius is now the largest that both adjacent legs can carry, so a hairpin becomes a
  // real 3.15 m U-turn arc and a block corner keeps its 6.5 m. Arc resolution scales with the
  // angle turned, so a 180° corner is not sampled as coarsely as a 90° one.
  const raw = ordered.map((p) => new THREE.Vector3(p.x, 0, p.z));
  const pts = [];
  const n = raw.length;
  const legLength = (i) => raw[i].distanceTo(raw[(i + 1) % n]);
  for (let i = 0; i < n; i += 1) {
    const prev = raw[(i - 1 + n) % n];
    const curr = raw[i];
    const next = raw[(i + 1) % n];
    // 0.45 rather than 0.5 of the shorter leg: two adjacent corners each taking half of the
    // leg between them would leave no straight at all, and the stop-line projection wants a
    // segment it can land on.
    const cornerR = Math.min(6.5, ROAD * 0.42,
      0.45 * Math.min(legLength((i - 1 + n) % n), legLength(i)));
    const inDir = new THREE.Vector3().subVectors(curr, prev).normalize();
    const outDir = new THREE.Vector3().subVectors(next, curr).normalize();
    const turn = Math.abs(Math.acos(Math.max(-1, Math.min(1, inDir.dot(outDir)))));
    const arcSteps = Math.max(5, Math.min(14, Math.round(turn / 0.22)));
    const enter = curr.clone().addScaledVector(inDir, -cornerR);
    const leave = curr.clone().addScaledVector(outDir, cornerR);
    pts.push(enter.clone());
    // Arc around corner: lerp between enter→curr→leave with offset toward outside.
    for (let s = 1; s <= arcSteps; s += 1) {
      const t = s / (arcSteps + 1);
      const a = enter.clone().lerp(curr, t);
      const b = curr.clone().lerp(leave, t);
      const p = a.lerp(b, t);
      const bis = inDir.clone().add(outDir).normalize();
      if (bis.lengthSq() > 0.1) p.addScaledVector(bis, -cornerR * 0.18 * Math.sin(t * Math.PI));
      pts.push(p);
    }
    pts.push(leave.clone());
  }
  pts.push(pts[0].clone());
  let length = 0;
  const cum = [0];
  for (let i = 1; i < pts.length; i += 1) {
    length += pts[i].distanceTo(pts[i - 1]);
    cum.push(length);
  }
  // Every pass this loop makes at every junction gets its own stop line. A belt loop runs the
  // same corridor twice (once per lane), so a single global nearest point — what R30 did —
  // gave a corridor one stop line where it needed two, and left the second pass unpoliced.
  const stops = [];
  for (const junc of junctions) {
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const len2 = abx * abx + abz * abz;
      if (len2 < 1e-6) continue;
      // Project onto the segment, not onto its endpoints: a straight leg is a single
      // 250 m segment with no interior vertices, so a vertex-only scan misses every
      // mid-block crossing on it. That miss was R40's remaining collision source.
      const t = ((junc.x - a.x) * abx + (junc.z - a.z) * abz) / len2;
      if (t < 0 || t >= 1) continue; // half-open, so a shared vertex is claimed once
      const px = a.x + abx * t;
      const pz = a.z + abz * t;
      if (Math.hypot(junc.x - px, junc.z - pz) > ROAD * 0.75) continue;
      const centreAlong = cum[i - 1] + Math.sqrt(len2) * t;
      const along = centreAlong - STOP_SETBACK - LINE_SETBACK;
      if (along <= 1 || along >= length - 1) continue;
      stops.push({
        along,
        centreAlong,
        key: junc.key,
        x: junc.x,
        z: junc.z,
        signalised: junc.signalised,
        axis: travelAxisFromYaw(Math.atan2(abx, abz)),
      });
    }
  }
  stops.sort((a, b) => a.along - b.along);
  // A corner arc is many short segments, so one junction can project onto several of them.
  // Keep the first stop of each run — the loop still gets two stops where it genuinely
  // passes a junction twice, because those are a lap apart.
  const deduped = [];
  for (const s of stops) {
    const previous = deduped.length ? deduped[deduped.length - 1] : null;
    if (previous && previous.key === s.key && s.centreAlong - previous.centreAlong < 6) {
      continue;
    }
    deduped.push(s);
  }
  stops.length = 0;
  stops.push(...deduped);
  return { points: pts, cum, length: Math.max(1, length), stops };
}

function sampleLoop(loop, distance, outPos, outYaw) {
  const d = wrapDist(distance, loop.length);
  let i = 1;
  while (i < loop.cum.length && loop.cum[i] < d) i += 1;
  const i0 = Math.max(1, i) - 1;
  const i1 = Math.min(loop.points.length - 1, i0 + 1);
  const segLen = Math.max(1e-6, loop.cum[i1] - loop.cum[i0]);
  const t = (d - loop.cum[i0]) / segLen;
  const a = loop.points[i0];
  const b = loop.points[i1];
  outPos.set(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t);
  outYaw.y = Math.atan2(b.x - a.x, b.z - a.z);
  return outPos;
}

const headingProbe = new THREE.Vector3();
const headingYaw = { y: 0 };

/**
 * Circular mean of the path heading over a window of `span` metres centred on `distance`.
 *
 * `sampleLoop` reports a segment's heading, so its yaw is piecewise CONSTANT: it holds a
 * value for the whole of a segment and then jumps. A curvature taken as the difference
 * between two such samples is therefore a step function, and it steps by the whole corner
 * angle the instant a probe crosses a vertex. Averaging several samples across a window
 * moves the estimate by one sample's worth at a time instead, so the steer angle is
 * continuous along the path.
 *
 * Averaged as unit vectors, not as angles, so the wrap at ±π cannot produce a heading that
 * points backwards.
 */
function pathHeading(loop, distance, span, samples = 4) {
  let sx = 0;
  let sz = 0;
  for (let i = 0; i < samples; i += 1) {
    const at = distance + span * ((i + 0.5) / samples - 0.5);
    sampleLoop(loop, at, headingProbe, headingYaw);
    sx += Math.sin(headingYaw.y);
    sz += Math.cos(headingYaw.y);
  }
  return Math.atan2(sx, sz);
}

/**
 * Sharpest curvature (rad/m) anywhere in the next `reach` metres.
 *
 * Steering is a local quantity — the front wheels answer to the arc they are standing on —
 * but SPEED is not. A driver slows for a corner because the corner is visible from further
 * back than the bonnet, and a car that reads only its own local curvature arrives at a
 * hairpin at cruise and slows inside it, which is the shape of a skid rather than of a
 * driver. Measured before this existed: peak lateral acceleration 9.03 m/s², i.e. 0.92 g on
 * a board-game car.
 */
function previewCurvature(loop, distance, reach = 15) {
  let worst = 0;
  for (let at = 2.5; at <= reach; at += 4.0) {
    const gradient = Math.abs(angleDelta(
      pathHeading(loop, distance + at - 2.0, 1.6, 3),
      pathHeading(loop, distance + at + 2.0, 1.6, 3),
    )) / 4.0;
    if (gradient > worst) worst = gradient;
  }
  return worst;
}

/** Baseline (m) the curvature gradient is measured over, and the window each end averages. */
const CURVATURE_BASELINE = 5.0;
const CURVATURE_WINDOW = 2.2;
/** How far ahead of the car centre the gradient is centred (m) — roughly the front axle. */
const CURVATURE_LEAD = 1.2;
/** Time constant of the curvature lag (1/s). Steering is a hand on a wheel, not a switch. */
const CURVATURE_LAG = 6.5;
/**
 * Lateral acceleration a car will accept in a corner (m/s²).
 *
 * The belt hairpin is a genuine U-turn — 7 m between the two lane centres — and taken at a
 * 6.9 m/s cruise it asks for well over 1 g, which reads as a car sliding sideways round the
 * end of the board. A driver slows for it. This is the only speed term that is not IDM's.
 */
const CORNER_LATERAL = 2.6;
/** Floor on the corner speed limit (m/s), so a tight arc slows a car rather than parking it. */
const CORNER_SPEED_FLOOR = 2.4;

/**
 * Nearest stop line ahead on the loop torus.
 * @returns {{stop: object, ahead: number} | null} `ahead` is path metres from `mod` to the line.
 */
function stopAhead(loop, mod) {
  if (!loop.stops.length) return null;
  let best = loop.stops[0];
  let bestAhead = Infinity;
  for (const s of loop.stops) {
    let ahead = forwardDelta(mod, s.along, loop.length);
    // A line a couple of metres BEHIND still governs, as a small negative. Without this a
    // car halted exactly on the line falls off the far side of the modular wrap by one
    // float ulp, the next line 60 m away becomes "nearest", and the hold it was under
    // silently lets go — which is how a stationary car creeps over a red.
    if (ahead > loop.length - 2.5) ahead -= loop.length;
    if (ahead < bestAhead) {
      bestAhead = ahead;
      best = s;
    }
  }
  return { stop: best, ahead: bestAhead };
}

/**
 * Most recently passed stop line, and how far past it we are.
 *
 * This exists because the stop line sits ~2 m short of the conflict box, so a car that has
 * crossed the line but not yet reached the box occupies neither and claims nothing. R40's
 * first cut left that band unpoliced and every remaining contact happened in it: one car
 * stalled there, the cross axis was granted the empty-looking box, and they met in the
 * middle. A car is committed from the line until it is clear of the far side.
 *
 * @returns {{stop: object, passed: number} | null}
 */
function stopBehind(loop, mod) {
  if (!loop.stops.length) return null;
  let best = loop.stops[0];
  let bestBack = Infinity;
  for (const s of loop.stops) {
    const back = forwardDelta(s.along, mod, loop.length);
    if (back < bestBack) {
      bestBack = back;
      best = s;
    }
  }
  return { stop: best, passed: bestBack };
}

/**
 * Moving traffic: multi-body fleet (sedan / hatch / ute) on carriageway loops
 * with car-following, lights and spinning wheels.
 */
export class TrafficLayer {
  constructor(city, { quality = 'high', reducedMotion = false, plateScaleDensity = true } = {}) {
    this.city = city;
    this.quality = quality;
    this.reducedMotion = Boolean(reducedMotion);
    this.elapsed = 0;
    this.root = new THREE.Group();
    this.root.name = 'v310:traffic';
    /** @type {Map<string, number>} junction key → elapsed when the 0.8 s hold expires */
    this._crossingClearAt = new Map();
    this.densityPlan = planTrafficDensity(city, { plateScale: plateScaleDensity });
    this.capacity = this.densityPlan.cars;

    // One material per surface class, shared by all three body families — same paint, same
    // glass, same rubber on every car, per-car identity carried by instanceColor.
    //
    // Paint is MeshPhysicalMaterial with clearcoat: a board-game token still wants the
    // two-layer read of a lacquered panel, a broad diffuse under a tight specular, and flat
    // MeshStandard cannot give both at once. Eleven instances of it is affordable.
    //
    // R41 — the pale-paint defect, measured rather than reasoned about.
    // `applyEnvIntensityBase` below is load-bearing: `lighting.js:177 envIntensityFor()`
    // OVERWRITES `envMapIntensity` on every standard/physical material it finds, and only
    // honours the authored figure when `userData.envIntensityBase` is set. Without the
    // stamp, R40's carefully-chosen 0.42 was silently replaced by 0.92 × profile = 0.637,
    // so the compensation that round believed it had applied never reached the GPU.
    //
    // With the plate camera reproduced and only the painted shell masked, mean paint
    // saturation on the #f9a825 sedan measured: shipped R40 0.370; overlay atlas disabled
    // 0.363 (i.e. the overlay is NOT the bleach, contrary to the R40 critique); clearcoat
    // off 0.406; env off 0.589; dielectric specular off 0.441; post chain bypassed 0.609;
    // material stripped AND post bypassed 0.851, which is the authored hue exactly. So the
    // achromatic lift splits roughly half to this material and half to the board's post
    // chain. This half is fixed here. The other half is `post.js` and is not ours.
    //
    // The shape of the fix is "one hard highlight, not a broad wash": a near-mirror
    // clearcoat carries the sun as a tight sweep on the crown, while the sky reflection
    // that used to sit over the whole panel is turned almost off.
    const paintMat = applyCarPaintSurface(createCarPaintMaterial(), CAR_FRAME, 1.0);
    applyEnvIntensityBase(paintMat, 0.07);
    // Glazing: near-black, opaque, carrying ONE soft specular sweep.
    //
    // R42 — M2/M3. R41 turned the sky off for the paint (base 0.07) and left it at full
    // strength on the glass (base 1.10, i.e. fifteen times the paint's) with
    // `clearcoatRoughness` 0.03. That is a mirror pointed at a bright sky, and it produced
    // two findings at once: the glazing rendered BRIGHTER than the paint it is set into —
    // masked measurement on the studio framings before this edit gave glass 86.4 against
    // paint 65.6 on the ute, 97.1 against 77.6 on the hatch, 126.2 against 113.3 on the
    // sedan — and, because the glazing panels are low-segment, each facet mirrored a
    // different part of the environment and the seams read as the hard-edged grey bracket
    // the critique named the moustache. It changed shape with view angle because it was a
    // reflection, never a texture.
    //
    // The fix is one lever pulled two ways: the environment comes down by 8.5x so the sky is
    // a dim wash rather than a mirror, and both roughnesses come up so what is left of it is
    // a blur. The clearcoat stays at 1.0 and its roughness stays low enough for the sun to
    // draw one legible sweep across the screen, which is what the FORM bar shows.
    //
    // R42, second pass — the target the critique set is not the one its own reference plate
    // carries, and this is measured on the bar itself. Patch means on
    // `assets/img/target/v311-vehicles/ref-toy-car-hero-3q.png`:
    //
    //   flank paint          luma 76.8   saturation 0.923
    //   bonnet paint         luma 97.7   saturation 0.821
    //   windscreen mid       luma 68.2   saturation 0.080
    //   side window          luma 84.4   saturation 0.043
    //   arch cladding        luma 31.3   saturation 0.038
    //   bumper bar           luma 41.7   saturation 0.189
    //
    // The reference's glazing is 0.89 to 1.10 of its flank paint's LUMINANCE. It is not a
    // quarter of it, and it is not near-black. What separates glass from paint on the bar is
    // CHROMA — 0.04 to 0.08 against 0.82 to 0.92 — not value. R41's glass failed on exactly
    // that axis and the round measured it without reading it: glass saturation 0.38 to 0.55,
    // because a mirror at `envMapIntensity` 1.10 was showing it a blue sky.
    //
    // So the lever is an achromatic base rather than a darker one: a neutral dark grey lifts
    // the value toward the bar and pushes saturation DOWN, where turning the environment up
    // would do the opposite. The environment stays low, which is what keeps the reflection a
    // soft sweep instead of the hard-edged bracket.
    const glassMat = applyCarGlassSurface(new THREE.MeshPhysicalMaterial({
      color: '#1a1d21',
      roughness: 0.20,
      metalness: 0.0,
      clearcoat: 0.82,
      clearcoatRoughness: 0.075,
      envMapIntensity: 0.06,
    }), CAR_FRAME);
    applyEnvIntensityBase(glassMat, 0.32);
    // Underbody, grille, wipers, exhaust. Genuinely dark, and meant to be: this is the shadow
    // a car sits in. The wheel house used to share it and no longer does — see below.
    const darkDetailMat = new THREE.MeshStandardMaterial({
      color: '#1d2128',
      roughness: 0.84,
      metalness: 0.06,
      envMapIntensity: 0.17,
    });
    applyEnvIntensityBase(darkDetailMat, 0.25);
    // Wheel house.
    //
    // R42 — M4. The comment on the old shared material claimed "a wheel arch should read as
    // shadow, not as a hole cut through the car", and the render did not deliver it: the
    // critique measured the cavity at luminance 10.6 against a flank of 110, and the masked
    // probe put the dark-detail tenth percentile at 7.4 on the hatch side framing. A
    // double-sided near-black inside a closed half-barrel receives essentially no light, so
    // no amount of environment response can lift it — the barrel occludes its own interior.
    //
    // So the lift is authored rather than lit: a mid-grey base with a low emissive floor,
    // which is what a bounce card does in a photograph and what an artist paints into a
    // wheel well. It is a cheat and it is written down as one. Double-sided because the face
    // that matters is the inside of the arch roof, seen through the opening from outside.
    const wheelHouseMat = new THREE.MeshStandardMaterial({
      color: '#1c2026',
      roughness: 0.94,
      metalness: 0.0,
      emissive: '#242a32',
      emissiveIntensity: 0.14,
      envMapIntensity: 0.22,
      side: THREE.DoubleSide,
    });
    applyEnvIntensityBase(wheelHouseMat, 0.30);
    // Head lamps are LIT, not unlit: a MeshBasic dome renders as a flat disc of one value
    // whatever its normals do, which is exactly the "flat white circle" the R40 critique
    // saw. A near-black glass dome with a mirror clearcoat reads as a lens because the sky
    // and the sun land on it in the right places. Nothing about a head lamp is per-car, so
    // it loses nothing by not being instance-coloured.
    const headLampMat = new THREE.MeshPhysicalMaterial({
      color: '#1b2128',
      roughness: 0.05,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      emissive: '#fff4de',
      emissiveIntensity: 0.30,
      envMapIntensity: 1.15,
    });
    applyEnvIntensityBase(headLampMat, 1.30);
    headLampMat.userData.styleLamp = 'head'; // style W1 L3: a lamp head, turned down by day under ?styleEmit=1
    // style W1 L3: the dome is a lens, and its mesh name (v311:traffic:headlamps:<kind>) holds no word the surface rule reads, so the
    // material says it: the metal and roughness rules leave it at its authored 0.05 and clearcoat 1, as they leave the glazing beside it.
    headLampMat.userData.styleSurface = 'glass';
    // Tails and indicators stay unlit and unmapped: their brightness IS the instance colour,
    // so a brake lamp goes from a dark lens to a hot one without a second material or draw.
    const tailLampMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const indicatorMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    // Unpainted grey plastic: bumpers, arch flares, rocker, handles, bezels. The value break
    // between saturated paint and this grey is what carries the toy at board distance —
    // further than any amount of surface detail does. It only works if the grey stays put
    // under the same sky that was bleaching the paint, hence its own base stamp.
    //
    // R42: the grey was `#464c54`, which rendered at 127 to 146 against paint at 140 to 174 —
    // a ratio of 0.84 to 0.91, i.e. barely a value break at all. The FORM bar's own plastic
    // sits at 0.41 (arch cladding) to 0.54 (bumper bar) of its flank paint. Since the value
    // break between paint and plastic is the thing this material exists for, it is authored
    // to the bar's ratio rather than to a grey that looked right in isolation.
    //
    // Second pass, from the plates rather than the numbers: the first darkening used
    // `#2f343b`, a cool grey, and the flares and rocker came back NAVY. Lowering a dielectric's
    // albedo raises the environment's share of what is left, and the environment here is a
    // blue sky — so a cool grey at half value reads as blue where the same grey at full value
    // reads as grey. The plastic is authored faintly warm and its environment response cut
    // with it, which holds the value break without handing the hue to the sky. Same correction
    // on the rims and tyres, which were `#6b737c` at metalness 0.45 and `#101114`.
    const trimMat = new THREE.MeshStandardMaterial({
      color: '#3a3835',
      roughness: 0.80,
      metalness: 0.04,
      envMapIntensity: 0.09,
    });
    applyEnvIntensityBase(trimMat, 0.13);
    this.materials = {
      paint: paintMat,
      glass: glassMat,
      darkDetail: darkDetailMat,
      wheelHouse: wheelHouseMat,
      headLamp: headLampMat,
      tailLamp: tailLampMat,
      indicator: indicatorMat,
      trim: trimMat,
    };

    // One InstancedMesh per surface class per body family; fleet rows pick a family.
    const slot = (geometry, material, name, { shadow = false, order = 0 } = {}) => {
      const mesh = new THREE.InstancedMesh(geometry, material, this.capacity + 1);
      mesh.name = name;
      mesh.count = 0;
      mesh.frustumCulled = true;
      mesh.castShadow = shadow && quality !== 'low';
      mesh.renderOrder = order;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(mesh);
      return mesh;
    };
    this.byType = {};
    for (const type of BODY_TYPES) {
      const pack = {
        body: slot(buildBodyGeometry(type), paintMat, `v311:traffic:body:${type}`, { shadow: true }),
        darkDetails: slot(buildDarkDetailGeometry(type), darkDetailMat,
          `v311:traffic:underbody-grille:${type}`),
        wheelHouses: slot(buildWheelHouseGeometry(type), wheelHouseMat,
          `v311:traffic:wheelhouse:${type}`),
        trim: slot(buildTrimGeometry(type), trimMat,
          `v311:traffic:plastic-bumpers-arches-rocker:${type}`),
        headlamps: slot(buildHeadLampGeometry(type), headLampMat, `v311:traffic:headlamps:${type}`),
        taillamps: slot(buildTailLampGeometry(type), tailLampMat, `v311:traffic:taillamps:${type}`),
        // Split by flank so a turn signal lights one side and a hazard lights both.
        indicatorsL: slot(buildIndicatorGeometry(type, -1), indicatorMat,
          `v311:traffic:indicators-left:${type}`),
        indicatorsR: slot(buildIndicatorGeometry(type, 1), indicatorMat,
          `v311:traffic:indicators-right:${type}`),
        cabin: slot(buildCabinGeometry(type), glassMat, `v311:traffic:glazing:${type}`),
      };
      this.byType[type] = pack;
    }

    // Independent wheels (capacity × 4) so they can spin about the axle and steer.
    this.wheels = new THREE.InstancedMesh(
      buildSingleTyreGeometry(),
      applyEnvIntensityBase(new THREE.MeshStandardMaterial({
        color: '#171614',
        roughness: 0.94,
        metalness: 0.02,
        envMapIntensity: 0.08,
      }), 0.11),
      (this.capacity + 1) * 4,
    );
    this.wheels.name = 'v311:traffic:tyres';
    this.wheels.count = 0;
    this.wheels.frustumCulled = true;
    this.wheels.castShadow = false; // R2B: the opaque body supplies the car shadow.
    this.wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(this.wheels);

    // The rim read as a flat pale button in every R40 plate, and the cause was exposure, not
    // modelling: metalness 0.55 put it in the rig's 1.35 family, so its environment response
    // was rewritten to ~0.93 and the hub blew to a white disc that swallowed its own dish.
    this.rims = new THREE.InstancedMesh(
      buildSingleRimGeometry(),
      applyEnvIntensityBase(new THREE.MeshStandardMaterial({
        color: '#7b7770',
        roughness: 0.44,
        metalness: 0.34,
        envMapIntensity: 0.16,
      }), 0.24),
      (this.capacity + 1) * 4,
    );
    this.rims.name = 'v311:traffic:spinning-rims';
    this.rims.count = 0;
    this.rims.frustumCulled = true;
    this.rims.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(this.rims);

    // R2B: no translucent contact stamp; cars cast their own body shadow.

    /** Foreign road users (buses, trams) published by other layers — see §2 of the round spec. */
    this._obstacleProviders = [];
    this._obstacles = [];
    this.pedestrians = [];
    this._crossingClearAt = this._crossingClearAt ?? new Map();

    this._buildFleet();
    this.update(0);
  }

  _buildFleet() {
    const seed = this.city.seed ?? 'DD';
    const loops = buildRoadLoops(this.city);
    this._loops = loops;
    // Board-game plastics. R40 deepened this set as a compensation for what it believed was
    // a colour-space bug in the overlay shader; that bug does not exist (the atlas uploads
    // as SRGB8_ALPHA8 and the sampler decodes in hardware — measured, see the paint material
    // above), so the compensation is withdrawn.
    //
    // What survives from that round is the *shape* of the constraint, which is real: the
    // board adds a roughly constant achromatic term to everything, and a constant addition
    // costs a light hue far more of its identity than a mid-value one. So the rule here is
    // maximum chroma at middle value — no pale yellows, no chalky olives, nothing that
    // starts life close to the lift it is about to receive.
    // W3-A: the board-game primaries that stood here (red, blue, orange, green, purple, cyan,
    // lime, magenta) are retired; paint comes from `carPaintFor` at the top of this file.
    this.fleet = [];
    // The perimeter loops pass only perimeter crossings, and `cityJunctions` only signalises
    // INTERIOR ones — so a car assigned to loop 0 or 1 never meets a signal head in its life.
    // Platoons go on the interior belts for that reason; scattering them across all loops is
    // how R40 ended up with 55 stop-line crossings and no queue.
    const interiorStart = loops.length > 2 ? 2 : 0;
    const beltCount = Math.max(1, loops.length - interiorStart);
    for (let i = 0; i < TRAFFIC_CAR_COUNT; i += 1) {
      const platoon = Math.floor(i / PLATOON_SIZE);
      const rank = i % PLATOON_SIZE;
      const loopId = interiorStart + (platoon % beltCount);
      const loop = loops[loopId];
      // The platoon leader is dropped at a seeded point on its loop; the rest queue behind
      // it. Trailing cars start slightly further back than the standstill gap so the IDM
      // opens them out to a natural headway rather than starting them interpenetrated.
      const lead = unit(seed, platoon * 31 + 11) * loop.length;
      const startOffset = lead - rank * PLATOON_SPACING;
      const bodyType = BODY_TYPES[Math.floor(unit(seed, i * 29 + 7) * BODY_TYPES.length)];
      this.fleet.push({
        loop,
        loopId,
        bodyType,
        phase: unit(seed, i * 17 + 3),
        lightPhase: unit(seed, i * 41 + 9),
        // Cruise speed is a platoon property with a small per-car delta: give three cars
        // three different desired speeds and the platoon strings out over one lap.
        desiredSpeed: 6.4 + unit(seed, platoon * 23 + 5) * 1.9 + unit(seed, i * 7 + 1) * 0.35,
        speed: 0,
        accel: 0,
        distance: startOffset,
        wheelSpin: 0,
        color: new THREE.Color(carPaintFor(bodyType, i)),
        // pose state — steer, body attitude, suspension
        yaw: 0,
        yawSeeded: false,
        pathYaw: 0,
        steer: 0,
        roll: 0,
        pitch: 0,
        heave: 0,
        heaveVel: 0,
        // driving state
        worldX: 0,
        worldZ: 0,
        fwdX: 0,
        fwdZ: 1,
        mod: 0,
        travelAxis: 'ns',
        nextStop: null,
        turnSign: 0,
        braking: false,
        leaderLimited: false,
        blockedByLeader: false,
        amberKey: null,
        amberStop: false,
        junctionKey: null,
        junctionArrival: null, // elapsed when we first claimed the junction ahead
        // last-resort contact recovery (see the safety-net constants)
        crashed: false,
        crashTimer: 0,
        crashNudgeX: 0,
        crashNudgeZ: 0,
        pairCooldown: {},
        lastCrashAt: -999,
      });
    }

    // Cheap arterial flow: same real car kit and road loops, linear-time control. The eleven
    // cars above retain collision recovery, errands and junction arbitration; these background
    // cars fill the P17 board-camera census without multiplying that controller's pair scans.
    this.flowFleet = [];
    const flowCount = Math.max(0, this.densityPlan.baselineCars - this.fleet.length);
    const pushFlowCar = (i, loop, loopId, distance, { plate = false } = {}) => {
      const bodyType = BODY_TYPES[Math.floor(unit(seed, i * 37 + 1907) * BODY_TYPES.length)];
      this.flowFleet.push({
        loop,
        loopId,
        bodyType,
        p17Flow: true,
        p17PlateFlow: plate,
        phase: unit(seed, i * 43 + 1913),
        lightPhase: unit(seed, i * 47 + 1931),
        desiredSpeed: 5.8 + unit(seed, i * 53 + 1951) * 1.45,
        speed: 2.6 + unit(seed, i * 59 + 1973) * 0.7,
        accel: 0,
        distance,
        wheelSpin: 0,
        color: new THREE.Color(carPaintFor(bodyType, i + TRAFFIC_CAR_COUNT)),
        yaw: 0,
        yawSeeded: false,
        pathYaw: 0,
        steer: 0,
        roll: 0,
        pitch: 0,
        heave: 0,
        heaveVel: 0,
        worldX: 0,
        worldZ: 0,
        fwdX: 0,
        fwdZ: 1,
        mod: wrapDist(distance, loop.length),
        travelAxis: 'ns',
        nextStop: null,
        turnSign: 0,
        braking: false,
        leaderLimited: false,
        blockedByLeader: false,
      });
    };
    for (let i = 0; i < flowCount; i += 1) {
      const loopId = i % loops.length;
      const rank = Math.floor(i / loops.length);
      const ranksOnLoop = Math.ceil((flowCount - loopId) / loops.length);
      const loop = loops[loopId];
      const phase = unit(seed, `p17-flow-${loopId}`);
      const distance = loop.length * ((rank + 0.24 + phase * 0.42) / Math.max(1, ranksOnLoop));
      pushFlowCar(i, loop, loopId, distance);
    }

    this._plateLoop = buildEntertainmentPlateLoop(this.city);
    const plateCount = this._plateLoop ? this.densityPlan.plateFlowCars : 0;
    for (let i = 0; i < plateCount; i += 1) {
      const distance = this._plateLoop.length * ((i + 0.5) / plateCount);
      pushFlowCar(flowCount + i, this._plateLoop, loops.length, distance, { plate: true });
    }
    this.vehicles = [...this.fleet, ...this.flowFleet];
    for (const car of this.vehicles) car.userData = { ...car.userData, mischief: { kind: 'car' } };
    this._junctions = cityJunctions(this.city);
    this._junctionByKey = new Map(this._junctions.map((j) => [j.key, j]));
    this._separateSpawnOverlaps();
    // R2B: cut the optional errand detours and floating job-marker geometry.
  }

  /**
   * Plate-flow cars share interior belt carriageways with the foreground fleet but sit
   * on a different loop id, so IDM never saw them. Drop each flow car back along its
   * path until its body box is clear of every other vehicle by the standstill gap.
   */
  _separateSpawnOverlaps() {
    const position = new THREE.Vector3();
    const yaw = { y: 0 };
    const pose = (car, seedYaw) => {
      sampleLoop(car.loop, car.distance, position, yaw);
      car.worldX = position.x;
      car.worldZ = position.z;
      car.pathYaw = yaw.y;
      if (seedYaw) {
        car.yaw = yaw.y;
        car.yawSeeded = true;
      }
      car.fwdX = Math.sin(yaw.y);
      car.fwdZ = Math.cos(yaw.y);
      car.mod = wrapDist(car.distance, car.loop.length);
    };
    for (const car of this.fleet ?? []) pose(car, false);
    for (const car of this.flowFleet ?? []) pose(car, true);
    // Same-loop flow cars: keep a body + standstill gap along the path so even
    // spacing cannot collapse when a later pass shuffles world positions.
    const byLoop = new Map();
    for (const car of this.flowFleet ?? []) {
      if (!byLoop.has(car.loop)) byLoop.set(car.loop, []);
      byLoop.get(car.loop).push(car);
    }
    for (const group of byLoop.values()) {
      group.sort((a, b) => a.mod - b.mod);
      const len = group[0].loop.length;
      for (let i = 0; i < group.length; i += 1) {
        const prev = group[(i - 1 + group.length) % group.length];
        const car = group[i];
        const along = forwardDelta(prev.mod, car.mod, len);
        const need = bodyBoxFor(prev).halfLength + bodyBoxFor(car).halfLength
          + QUEUE_STANDSTILL_GAP + 0.5;
        if (along < need && along > 1e-4) {
          car.distance += need - along;
          pose(car, true);
        }
      }
    }
    for (let pass = 0; pass < 12; pass += 1) {
      let moved = false;
      for (const car of this.flowFleet ?? []) {
        const mine = bodyBoxFor(car);
        for (const other of this.vehicles ?? []) {
          if (other === car || other.mischiefHidden) continue;
          const dx = (other.worldX ?? 0) - (car.worldX ?? 0);
          const dz = (other.worldZ ?? 0) - (car.worldZ ?? 0);
          const dist = Math.hypot(dx, dz);
          const theirs = bodyBoxFor(other);
          const need = mine.halfLength + theirs.halfLength + QUEUE_STANDSTILL_GAP + 0.4;
          if (dist >= need) continue;
          car.distance -= Math.max(0.7, need - dist);
          pose(car, true);
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  /**
   * Board-distance flow cars visibly steer, follow any same-lane leader (every fleet,
   * buses, trams) and brake for stop lines / occupied crossings. No overtaking; the
   * Gipps ceiling plus a nose-to-tail clamp is what keeps queued bodies from stacking.
   */
  _updateFlowFleet(step) {
    if (!this.flowFleet?.length) return;
    const position = new THREE.Vector3();
    const yaw = { y: 0 };
    const probe = new THREE.Vector3();
    const probeYaw = { y: 0 };

    // Publish one coherent frame before any car chooses a speed.
    for (const car of this.flowFleet) {
      sampleLoop(car.loop, car.distance, position, yaw);
      car.worldX = position.x;
      car.worldZ = position.z;
      car.pathYaw = yaw.y;
      car.yaw = yaw.y;
      car.yawSeeded = true;
      car.fwdX = Math.sin(yaw.y);
      car.fwdZ = Math.cos(yaw.y);
      car.travelAxis = travelAxisFromYaw(yaw.y);
      car.mod = wrapDist(car.distance, car.loop.length);
      car.nextStop = stopAhead(car.loop, car.mod);
    }

    for (const car of this.flowFleet) {
      const mine = bodyBoxFor(car);
      let target = car.desiredSpeed;
      let stopDistance = Infinity;
      car.yieldingToPed = false;
      const hit = car.nextStop;
      const behind = stopBehind(car.loop, car.mod);
      const justPassed = Boolean(behind && behind.passed > 0.3
        && behind.passed < STOP_SETBACK + LINE_SETBACK + JUNCTION_CLEAR);
      if (hit) {
        const phase = hit.stop.signalised
          ? sharedSignalPhase(this.elapsed, hit.stop.axis)
          : 'green';
        const crossing = this._isCrossingHeld(hit.stop.key);
        car.yieldingToPed = Boolean(crossing) && !justPassed;
        let pedGap = Infinity;
        for (const ped of this.pedestrians ?? []) {
          if (!Number.isFinite(ped?.x) || !Number.isFinite(ped?.z)) continue;
          const kind = roadCellKind(ped.x, ped.z).kind;
          if (kind !== 'junction' && kind !== 'carriageway' && kind !== 'tram') continue;
          const dx = ped.x - car.worldX;
          const dz = ped.z - car.worldZ;
          const ahead = dx * car.fwdX + dz * car.fwdZ;
          const lat = Math.abs(dx * car.fwdZ - dz * car.fwdX);
          if (ahead <= 0.4 || ahead > LEADER_SCAN || lat > 1.55) continue;
          pedGap = Math.min(pedGap, Math.max(0, ahead - mine.halfLength - 0.85));
          car.yieldingToPed = true;
        }
        if (!justPassed && (phase === 'red' || phase === 'amber' || crossing) && hit.ahead < LEADER_SCAN) {
          stopDistance = Math.max(0, hit.ahead - mine.halfLength - STOP_NOSE_GAP);
        }
        if (Number.isFinite(pedGap) && pedGap < LEADER_SCAN) {
          stopDistance = Math.min(stopDistance, pedGap);
        }
        // A hold on the junction we are physically in, even if nextStop has already
        // moved on to the next crossing (the X2 yield plate's stacked-in-box case).
        const near = this._nearestJunction(car.worldX, car.worldZ);
        if (near && this._isCrossingHeld(near.key) && !justPassed) {
          const local = car.loop.stops.find((s) => s.key === near.key);
          if (local) {
            let ahead = forwardDelta(car.mod, local.along, car.loop.length);
            if (ahead > car.loop.length - 2.5) ahead -= car.loop.length;
            if (ahead < JUNCTION_APPROACH) {
              stopDistance = Math.min(
                stopDistance,
                Math.max(0, ahead - mine.halfLength - STOP_NOSE_GAP),
              );
              car.yieldingToPed = true;
            }
          }
        }
        // Cross traffic: occupant of the box wins; at unsignalised crossings the
        // closer car goes and EW yields a tie, so two empty approaches cannot T-bone.
        const junc = this._junctionByKey?.get(hit.stop.key);
        if (junc && hit.ahead < JUNCTION_APPROACH) {
          const myDist = Math.hypot(car.worldX - junc.x, car.worldZ - junc.z);
          const meIn = myDist < JUNCTION_BOX;
          const considerCross = (ox, oz, oYaw) => {
            const oAxis = travelAxisFromYaw(oYaw);
            if (oAxis === car.travelAxis) return;
            const d = Math.hypot(ox - junc.x, oz - junc.z);
            if (d > JUNCTION_APPROACH + 6) return;
            const otherIn = d < JUNCTION_BOX;
            let yieldTo = false;
            if (otherIn && !meIn) yieldTo = true;
            else if (!otherIn && !meIn && !junc.signalised) {
              if (d + 0.6 < myDist) yieldTo = true;
              else if (Math.abs(d - myDist) <= 0.6 && car.travelAxis === 'ew') yieldTo = true;
            }
            if (yieldTo) {
              stopDistance = Math.min(
                stopDistance,
                Math.max(0, hit.ahead - mine.halfLength - STOP_NOSE_GAP),
              );
            }
          };
          for (const other of this.vehicles ?? []) {
            if (other === car || other.mischiefHidden || other.errandAway) continue;
            considerCross(other.worldX, other.worldZ, other.yaw ?? other.pathYaw ?? 0);
          }
          for (const item of this._obstacles ?? []) {
            considerCross(item.x, item.z, item.yaw ?? 0);
          }
        }
      }

      let leaderGap = Infinity;
      let leaderSpeed = 0;
      const takeLeader = (ahead, lat, halfLength, halfWidth, speed, aligned) => {
        if (ahead <= 1e-3 || ahead > LEADER_SCAN) return;
        if (!aligned && speed > 0.4) return;
        if (lat > LANE_HALF_WIDTH + Math.max(0, halfWidth - mine.halfWidth * 0.5)) return;
        const clear = ahead - mine.halfLength - halfLength;
        if (clear < leaderGap) {
          leaderGap = clear;
          leaderSpeed = speed;
        }
      };
      for (const other of this.vehicles ?? []) {
        if (other === car || other.errandAway || other.mischiefHidden) continue;
        const dx = (other.worldX ?? 0) - car.worldX;
        const dz = (other.worldZ ?? 0) - car.worldZ;
        const ahead = dx * car.fwdX + dz * car.fwdZ;
        const lat = Math.abs(dx * car.fwdZ - dz * car.fwdX);
        const box = bodyBoxFor(other);
        const aligned = car.fwdX * (other.fwdX ?? 0) + car.fwdZ * (other.fwdZ ?? 1) > 0.2;
        takeLeader(ahead, lat, box.halfLength, box.halfWidth, other.crashed ? 0 : (other.speed ?? 0), aligned);
        if (other.loop === car.loop) {
          const along = forwardDelta(car.mod, wrapDist(other.distance, car.loop.length), car.loop.length);
          if (along > 1e-3 && along <= LEADER_SCAN) {
            takeLeader(along, 0, box.halfLength, box.halfWidth, other.crashed ? 0 : (other.speed ?? 0), true);
          }
        }
        // Crossing / stacked: a body that close is an obstacle even if headings disagree.
        // Parallel opposite lanes sit ~7 m off and must not register (lat gate).
        const dist = Math.hypot(dx, dz);
        const clear = dist - mine.halfLength - box.halfLength;
        if (ahead > -0.8 && lat < 3.2 && clear < QUEUE_STANDSTILL_GAP + 3.5 && clear < leaderGap) {
          leaderGap = clear;
          leaderSpeed = Math.min(leaderSpeed, other.crashed ? 0 : (other.speed ?? 0));
        }
      }
      for (const item of this._obstacles ?? []) {
        const dx = item.x - car.worldX;
        const dz = item.z - car.worldZ;
        const ahead = dx * car.fwdX + dz * car.fwdZ;
        const lat = Math.abs(dx * car.fwdZ - dz * car.fwdX);
        const aligned = car.fwdX * (item.fwdX ?? 0) + car.fwdZ * (item.fwdZ ?? 1) > 0.2;
        const tramAligned = item.kind === 'tram' && aligned && lat > 2.85;
        if (tramAligned) continue;
        takeLeader(ahead, lat, item.halfLength, item.halfWidth, item.speed ?? 0, aligned);
      }

      const cap = car.yieldingToPed ? PEDESTRIAN_YIELD_DECEL : FOLLOW_DECEL;
      if (Number.isFinite(leaderGap)) {
        target = Math.min(target, gippsSafeSpeed(leaderGap, leaderSpeed, cap));
      }
      if (Number.isFinite(stopDistance)) {
        target = Math.min(target, gippsSafeSpeed(stopDistance, 0, cap));
      }
      const nowInBox = this._nearestJunction(car.worldX, car.worldZ);
      if (nowInBox && nowInBox.dist < JUNCTION_BOX
        && !car.yieldingToPed
        && (!Number.isFinite(leaderGap) || leaderGap > 2.2)) {
        target = Math.max(target, 1.35);
      }

      sampleLoop(car.loop, car.distance + 4.5, probe, probeYaw);
      const turn = angleDelta(car.pathYaw, probeYaw.y);
      const cornerTarget = Math.abs(turn) > 0.18 ? 2.9 : car.desiredSpeed;
      target = Math.min(target, cornerTarget);
      const before = car.speed;
      car.accel = Math.max(-cap, Math.min(IDM_ACCEL, (target - before) * 1.9));
      if (step > 0) {
        let speed = Math.max(0, Math.min(car.desiredSpeed, before + car.accel * step));
        speed = Math.min(speed, target);
        speed = Math.max(0, Math.min(speed, before + IDM_ACCEL * step), before - cap * step);
        const followRoom = Number.isFinite(leaderGap)
          ? Math.max(0, leaderGap - QUEUE_STANDSTILL_GAP)
          : Infinity;
        const lineRoom = Number.isFinite(stopDistance) ? Math.max(0, stopDistance) : Infinity;
        const advance = Math.min(speed * step, followRoom, lineRoom);
        car.speed = speed;
        car.accel = (speed - before) / step;
        car.distance += advance;
        car.wheelSpin += advance / (TYRE_RADIUS * TRAFFIC_SCALE);
      }
      car.heldAtLine = Number.isFinite(stopDistance) && stopDistance < 8;
      car.leaderLimited = Number.isFinite(leaderGap) && leaderGap < 26;
      car.blockedByLeader = Number.isFinite(leaderGap) && leaderGap < 14 && leaderSpeed < 1.2;
      car.turnNear = turn;
      car.turnFar = turn;
      car.turnSign = Math.abs(turn) > 0.25 ? Math.sign(turn) : 0;
      car.curvature = turn / 4.5;
      car.cornerSpeed = cornerTarget;

      sampleLoop(car.loop, car.distance, position, yaw);
      car.worldX = position.x;
      car.worldZ = position.z;
      car.pathYaw = yaw.y;
      car.fwdX = Math.sin(yaw.y);
      car.fwdZ = Math.cos(yaw.y);
      car.travelAxis = travelAxisFromYaw(yaw.y);
      car.mod = wrapDist(car.distance, car.loop.length);
      const afterBox = this._nearestJunction(car.worldX, car.worldZ);
      if (afterBox && afterBox.dist < JUNCTION_BOX) car.committedKey = afterBox.key;
      else if (car.committedKey && (!hit || hit.ahead > 2)) car.committedKey = null;
    }
  }

  /** Nearest corridor crossing to a world point, or null when the point is mid-block. */
  _nearestJunction(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const j of this._junctions ?? []) {
      const d = Math.hypot(j.x - x, j.z - z);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (!best || bestD > ROAD * 1.4) return null;
    return {
      key: best.key, x: best.x, z: best.z, dist: bestD, signalised: best.signalised,
    };
  }

  /** Metres to the nearest corridor crossing, or null mid-block. */
  junctionDistanceAt(x, z) {
    const near = this._nearestJunction(x, z);
    return near && Number.isFinite(near.dist) ? near.dist : null;
  }

  // --- cross-lane contract (vehicles-aaa round spec §2) --------------------------------
  // Cars are not the only things on the carriageway. Anything that publishes itself here is
  // followed, yielded to and reserved against exactly as another car is.

  /**
   * Publish non-car road users (buses, trams) for the cars to see.
   * @param {() => Array<{x:number, z:number, yaw:number, halfLength:number, halfWidth:number,
   *   speed:number, kind:string}>} fn world metres; called once per frame
   * @returns {() => void} unregister
   */
  registerObstacleProvider(fn) {
    if (typeof fn !== 'function') return () => {};
    if (!this._obstacleProviders.includes(fn)) this._obstacleProviders.push(fn);
    return () => this.unregisterObstacleProvider(fn);
  }

  unregisterObstacleProvider(fn) {
    const at = this._obstacleProviders.indexOf(fn);
    if (at >= 0) this._obstacleProviders.splice(at, 1);
  }

  /**
   * The cars, in the same shape providers publish, so other vehicles can follow them.
   * @returns {Array<{x:number, z:number, yaw:number, halfLength:number, halfWidth:number,
   *   speed:number, kind:'car'}>}
   */
  setPedestrians(list) {
    this.pedestrians = Array.isArray(list) ? list : [];
  }

  /**
   * Occupied zebra / junction box, plus PEDESTRIAN_CLEAR_HOLD after the last walker leaves.
   * Cars stop at the stop line for a held key; they do not treat footpath strollers as a hold.
   */
  _refreshCrossingHold() {
    const now = this.elapsed;
    const occupied = new Set();
    for (const ped of this.pedestrians ?? []) {
      if (!Number.isFinite(ped?.x) || !Number.isFinite(ped?.z)) continue;
      const cell = roadCellKind(ped.x, ped.z);
      const onBox = cell.kind === 'junction'
        || cell.kind === 'carriageway'
        || cell.kind === 'tram'
        || ped.intent === 'cross' && (cell.kind === 'junction' || cell.kind === 'carriageway');
      if (!onBox) continue;
      const near = this._nearestJunction(ped.x, ped.z);
      if (!near || near.dist > ROAD * 1.05) continue;
      occupied.add(near.key);
    }
    if (!this._crossingClearAt) this._crossingClearAt = new Map();
    for (const key of occupied) this._crossingClearAt.set(key, now + PEDESTRIAN_CLEAR_HOLD);
    for (const [key, until] of this._crossingClearAt) {
      if (until <= now && !occupied.has(key)) this._crossingClearAt.delete(key);
    }
    this._crossingOccupied = occupied;
  }

  _isCrossingHeld(key) {
    if (!key) return false;
    if (this._crossingOccupied?.has(key)) return true;
    const until = this._crossingClearAt?.get(key);
    return Number.isFinite(until) && until > this.elapsed;
  }

  queryVehicles() {
    const out = [];
    for (const car of this.vehicles ?? this.fleet ?? []) {
      if (car.mischiefHidden) continue;
      // Published boxes are the envelope a foreign vehicle must keep out of, so they are the
      // authored body plus its bumpers plus a margin — never the tightest fit. Understating
      // a car's length here means the bus lane plans its clearances against a car smaller
      // than the one on screen, and its "just clear" becomes a body overlap.
      out.push({
        x: car.worldX ?? 0,
        z: car.worldZ ?? 0,
        yaw: car.yaw ?? 0,
        halfLength: PUBLISHED_HALF_LEN,
        halfWidth: PUBLISHED_HALF_WIDTH,
        speed: car.speed ?? 0,
        kind: 'car',
      });
    }
    return out;
  }

  /**
   * Signal state a vehicle at this pose should obey.
   * @param {number} x
   * @param {number} z
   * @param {number} yaw heading, atan2(dx, dz) — the same convention the cars use
   * @param {number} [elapsed] defaults to the layer clock
   * @returns {'green'|'amber'|'red'|null} null where no signal governs this point
   */
  signalStateAt(x, z, yaw, elapsed = null) {
    const near = this._nearestJunction(x, z);
    if (!near || !near.signalised) return null;
    const clock = elapsed != null && Number.isFinite(elapsed) ? elapsed : this.elapsed;
    return sharedSignalPhase(clock, travelAxisFromYaw(yaw));
  }

  /** Run every provider once and flatten, tolerating a provider that throws or misbehaves. */
  _collectObstacles() {
    const out = [];
    for (const provider of this._obstacleProviders ?? []) {
      let batch = null;
      try {
        batch = provider();
      } catch {
        batch = null;
      }
      if (!Array.isArray(batch)) continue;
      for (const item of batch) {
        if (!item || !Number.isFinite(item.x) || !Number.isFinite(item.z)) continue;
        const yaw = Number.isFinite(item.yaw) ? item.yaw : 0;
        out.push({
          x: item.x,
          z: item.z,
          yaw,
          halfLength: Number.isFinite(item.halfLength) ? item.halfLength : CAR_HALF_LEN,
          halfWidth: Number.isFinite(item.halfWidth) ? item.halfWidth : CAR_HALF_WIDTH,
          speed: Number.isFinite(item.speed) ? item.speed : 0,
          kind: typeof item.kind === 'string' ? item.kind : 'vehicle',
          fwdX: Math.sin(yaw),
          fwdZ: Math.cos(yaw),
          axis: travelAxisFromYaw(yaw),
        });
      }
    }
    this._obstacles = out;
    return out;
  }

  setReducedMotion(on) {
    this.reducedMotion = Boolean(on);
    this.update(0, this.elapsed);
  }

  /**
   * One frame of traffic, in four passes.
   *
   *  1. Pose read — where every car is on its loop right now, its heading, the curvature it
   *     is about to meet, and the next stop line ahead of it.
   *  2. Junction arbitration — one axis owns each conflict box at a time. Occupancy sets the
   *     owner; among waiting claimants the earliest arrival wins, subject to a green phase at
   *     signalised crossings. Cars, buses and trams all count as occupants.
   *  3. Longitudinal control — one IDM response against the nearest binding constraint:
   *     the leader ahead, the stop line, the junction hold. Continuous, so a car eases into a
   *     queue and creeps forward with it instead of switching between stopped and cruise.
   *  4. Pose write — steer, roll, pitch, heave, wheel spin, lamps, instance matrices.
   *
   * Deciding from this frame's own positions rather than last frame's is what lets a car
   * brake for something that has only just moved in front of it.
   *
   * @param {number} dt seconds
   * @param {number} [elapsed] authoritative clock (shared with the streetscape signal lamps)
   */
  update(dt, elapsed = null) {
    // Consume the accumulated 20 Hz tick in safe slices. Dropping everything above
    // 50 ms made cars crawl as frame time rose, while signals kept wall-clock time.
    if (dt > 0.050001) {
      const total = Math.min(0.25, dt);
      const end = Number.isFinite(elapsed) ? elapsed : this.elapsed + total;
      const slices = Math.ceil(total / 0.05);
      for (let i = 1; i <= slices; i += 1) {
        this.update(total / slices, end - total + total * i / slices);
      }
      return;
    }
    if (elapsed != null && Number.isFinite(elapsed)) {
      this.elapsed = elapsed;
    } else {
      this.elapsed += dt;
    }
    // Reduced motion removes cosmetic sway, never road simulation or safety.
    const step = Math.min(0.05, Math.max(0, dt));
    updateCybercabs(this, step);
    const count = this.fleet.length;
    const renderCount = this.vehicles?.length ?? count;
    const obstacles = this._collectObstacles();
    this._refreshCrossingHold();

    // R2B: reuse pose scratch across safe integration slices.
    const { position, probe, yawHolder, probeYaw, bodyQuat, yawQuat, steerQuat, spinQuat, wheelQuat, euler, spinAxis, scale, hidden, matrix, wheelMatrix, localWheel, colour } = this._poseScratch ??= {
      position: new THREE.Vector3(),
      probe: new THREE.Vector3(),
      yawHolder: { y: 0 },
      probeYaw: { y: 0 },
      bodyQuat: new THREE.Quaternion(),
      yawQuat: new THREE.Quaternion(),
      steerQuat: new THREE.Quaternion(),
      spinQuat: new THREE.Quaternion(),
      wheelQuat: new THREE.Quaternion(),
      euler: new THREE.Euler(0, 0, 0, 'YXZ'),
      spinAxis: new THREE.Vector3(1, 0, 0),
      scale: new THREE.Vector3(TRAFFIC_SCALE, TRAFFIC_SCALE, TRAFFIC_SCALE),
      hidden: new THREE.Vector3(0, 0, 0),
      matrix: new THREE.Matrix4(),
      wheelMatrix: new THREE.Matrix4(),
      localWheel: new THREE.Vector3(),
      colour: new THREE.Color(),
    };

    for (const type of BODY_TYPES) {
      const pack = this.byType[type];
      for (const key of PACK_SLOTS) pack[key].count = 0;
    }
    this.wheels.count = renderCount * 4;
    this.rims.count = renderCount * 4;

    // --- pass 1: read the world -------------------------------------------------------
    for (let index = 0; index < count; index += 1) {
      const car = this.fleet[index];
      const loop = car.loop;
      if (car.crashed) {
        car.crashTimer = Math.max(0, (car.crashTimer ?? 0) - step);
        if (car.crashTimer <= 0) {
          car.crashed = false;
          car.speed = 0;
          // Keep residual separation; the pair cooldown is still running.
          car.distance += 2.4 + (car.phase ?? 0) * 1.6;
          car.crashNudgeX = (car.crashNudgeX ?? 0) * 0.55;
          car.crashNudgeZ = (car.crashNudgeZ ?? 0) * 0.55;
          car.junctionArrival = null;
          car.junctionKey = null;
        }
      }
      sampleLoop(loop, car.distance, position, yawHolder);
      car.worldX = position.x + (car.crashNudgeX ?? 0);
      car.worldZ = position.z + (car.crashNudgeZ ?? 0);
      car.pathYaw = yawHolder.y;
      car.fwdX = Math.sin(yawHolder.y);
      car.fwdZ = Math.cos(yawHolder.y);
      car.travelAxis = travelAxisFromYaw(yawHolder.y);
      car.mod = wrapDist(car.distance, loop.length);
      car.nextStop = stopAhead(loop, car.mod);
      // Committed: past a stop line, and released by distance from the junction rather than
      // by distance travelled. A belt loop turns back on itself at the board edge and can
      // spend 30 m of path inside one box; a path-length release let go of the box halfway
      // through that turn and handed it to the cross axis.
      const behind = stopBehind(loop, car.mod);
      if (behind && behind.passed > 0.25
        && behind.passed < STOP_SETBACK + LINE_SETBACK + JUNCTION_CLEAR) {
        if (car.committedKey !== behind.stop.key) {
          car.committedKey = behind.stop.key;
          // The axis a car ENTERED on, held for the whole crossing. A belt loop turns back
          // on itself inside a box, so its live travel axis flips halfway through — and a
          // box that reads as owned by the axis the car is about to cut across is worse
          // than no reservation at all.
          car.commitAxis = car.travelAxis;
          car.commitYaw = car.pathYaw;
          car.commitTurning = false;
        }
        // Turning is measured from the heading actually swung since entering, not from a
        // look-ahead. A look-ahead sees the next corner from half a block away and would
        // lock every box on the board.
        if (Math.abs(angleDelta(car.commitYaw ?? car.pathYaw, car.pathYaw)) > 0.5) {
          car.commitTurning = true;
        }
      }
      if (car.committedKey) {
        const held = this._junctionByKey.get(car.committedKey);
        if (!held
          || Math.hypot(car.worldX - held.x, car.worldZ - held.z) > JUNCTION_CLEAR
            // CAR-1: released once its own tail is clear, not a nominal car's.
            + (CAR_TRUE_SCALE ? bodyBoxFor(car).halfLength : CAR_HALF_LEN)) {
          car.committedKey = null;
          car.commitTurning = false;
        }
      }
      sampleLoop(loop, car.distance + 6, probe, probeYaw);
      car.turnNear = angleDelta(car.pathYaw, probeYaw.y);
      sampleLoop(loop, car.distance + 18, probe, probeYaw);
      car.turnFar = angleDelta(car.pathYaw, probeYaw.y);
      // Path curvature (rad/m) — steering, roll, the corner speed limit and the turn signal
      // all read from this one number, so it has to be continuous.
      //
      // R42: it was `turnNear / 6`, a two-point forward difference against a piecewise-
      // constant heading, which made it a step function on a polyline. Measured on seed 0
      // over 60 s: 331 single-frame jumps above 0.02 /m, the largest 0.483 /m in one 33 ms
      // tick, which through `atan(wheelbase · κ)` is 40° of steering lock applied in a
      // frame. It is now a smoothed central gradient over a 5 m baseline centred on the
      // front axle, each end a 4-sample circular mean, then lagged in time. `turnNear` and
      // `turnFar` are unchanged and still drive the indicators, where a step is wanted.
      const gradient = angleDelta(
        pathHeading(loop, car.distance + CURVATURE_LEAD - CURVATURE_BASELINE / 2,
          CURVATURE_WINDOW),
        pathHeading(loop, car.distance + CURVATURE_LEAD + CURVATURE_BASELINE / 2,
          CURVATURE_WINDOW),
      ) / CURVATURE_BASELINE;
      if (!car.curvatureSeeded) {
        car.curvature = gradient;
        car.curvatureSeeded = true;
      } else {
        car.curvature += (gradient - car.curvature)
          * (1 - Math.exp(-Math.max(step, 1e-4) * CURVATURE_LAG));
      }
      // A driver eases off for a tight arc, and starts easing off before reaching it. The
      // limit is taken from the sharpest curvature within 15 m, not from the curvature under
      // the front axle, so the car arrives at the hairpin already slow.
      const ahead = Math.max(Math.abs(car.curvature), previewCurvature(loop, car.distance));
      car.cornerSpeed = ahead > 1e-3
        ? Math.max(CORNER_SPEED_FLOOR, Math.sqrt(CORNER_LATERAL / ahead))
        : Infinity;
      car.turnSign = 0;
      if (Math.abs(car.turnFar) > 0.5 || Math.abs(car.turnNear) > 0.25) {
        car.turnSign = Math.sign(Math.abs(car.turnFar) > 0.25 ? car.turnFar : car.turnNear);
      }
      stepErrand(car, step, this.elapsed, this.vehicles);
    }

    // Pose the flow fleet before IDM so the eleven cars can see plate/belt traffic
    // that shares their carriageway on a different loop id.
    for (const car of this.flowFleet ?? []) {
      if (car.errandAway) continue;
      sampleLoop(car.loop, car.distance, position, yawHolder);
      car.worldX = position.x;
      car.worldZ = position.z;
      car.pathYaw = yawHolder.y;
      if (!car.yawSeeded) {
        car.yaw = yawHolder.y;
        car.yawSeeded = true;
      }
      car.fwdX = Math.sin(car.yaw ?? yawHolder.y);
      car.fwdZ = Math.cos(car.yaw ?? yawHolder.y);
      car.travelAxis = travelAxisFromYaw(car.yaw ?? yawHolder.y);
      car.mod = wrapDist(car.distance, car.loop.length);
      car.nextStop = stopAhead(car.loop, car.mod);
    }

    // --- pass 2: junction arbitration -------------------------------------------------
    // A box is owned by an axis, not by a car, so a platoon crosses together while cross
    // traffic waits. Occupancy wins; otherwise the earliest arrival on a permitted axis.
    // 2a. Occupancy first, from every vehicle physically inside a box. This has to complete
    // before any claim is looked at, or an approaching car can stamp its own axis onto a box
    // that something is already crossing — which is precisely how a T-bone happens.
    const occupiedAxis = new Map(); // key -> 'ns' | 'ew'
    const exclusive = new Map(); // key -> fleet index of a vehicle turning inside the box
    for (const item of obstacles) {
      const near = this._nearestJunction(item.x, item.z);
      if (near && near.dist < JUNCTION_BOX) {
        occupiedAxis.set(near.key, item.axis);
        exclusive.set(near.key, -1); // a foreign vehicle in the box stops everything else
      }
    }
    for (let index = 0; index < count; index += 1) {
      const car = this.fleet[index];
      car.inBox = false;
      if (car.mischiefHidden || car.errandAway) continue;
      const near = this._nearestJunction(car.worldX, car.worldZ);
      const key = car.committedKey ?? (near && near.dist < JUNCTION_BOX ? near.key : null);
      if (!key) continue;
      car.inBox = true;
      car.junctionKey = key;
      if (car.junctionArrival == null) car.junctionArrival = this.elapsed;
      if (!occupiedAxis.has(key)) occupiedAxis.set(key, car.commitAxis ?? car.travelAxis);
      // A vehicle that changes direction inside the box crosses both axes, so it holds the
      // box against everything, not merely against the other axis.
      if (car.commitTurning && !exclusive.has(key)) exclusive.set(key, index);
    }
    for (const car of this.flowFleet ?? []) {
      if (car.mischiefHidden || car.errandAway) continue;
      const near = this._nearestJunction(car.worldX, car.worldZ);
      if (!near || near.dist >= JUNCTION_BOX) continue;
      if (!occupiedAxis.has(near.key)) occupiedAxis.set(near.key, car.travelAxis);
    }
    for (const ped of this.pedestrians ?? []) {
      if (!Number.isFinite(ped.x) || !Number.isFinite(ped.z)) continue;
      const near = this._nearestJunction(ped.x, ped.z);
      if (!near || near.dist > JUNCTION_BOX) continue;
      const onRoad = Math.hypot(ped.x - near.x, ped.z - near.z) < ROAD * 0.55;
      if (!onRoad) continue;
      const axis = Math.abs(ped.hx ?? 0) >= Math.abs(ped.hz ?? 0) ? 'ns' : 'ew';
      occupiedAxis.set(near.key, axis);
    }

    // 2b. Then the claims, from cars still short of their stop line.
    const claims = new Map(); // key -> [{ index, arrival, axis }]
    for (let index = 0; index < count; index += 1) {
      const car = this.fleet[index];
      if (car.inBox) continue;
      if (car.mischiefHidden || car.errandAway) {
        car.junctionKey = null;
        car.junctionArrival = null;
        continue;
      }
      const hit = car.nextStop;
      if (!car.crashed && hit && hit.ahead < JUNCTION_APPROACH) {
        car.junctionKey = hit.stop.key;
        if (car.junctionArrival == null) car.junctionArrival = this.elapsed;
        // A car stuck behind something else does not get to hold a junction it cannot
        // use — that is how a four-way turns into a deadlock.
        if (!car.blockedByLeader) {
          if (!claims.has(hit.stop.key)) claims.set(hit.stop.key, []);
          claims.get(hit.stop.key).push({
            index, arrival: car.junctionArrival, axis: car.travelAxis,
          });
        }
        continue;
      }
      car.junctionKey = null;
      car.junctionArrival = null;
    }

    // 2c. Grant the box to one axis: whoever is in it, else the earliest arrival that the
    // signal permits.
    const grantedAxis = new Map(occupiedAxis);
    for (const [key, list] of claims) {
      if (grantedAxis.has(key)) continue;
      const junction = this._junctionByKey.get(key);
      list.sort((a, b) => (a.arrival - b.arrival) || (a.index - b.index));
      for (const claim of list) {
        if (junction?.signalised) {
          const phase = sharedSignalPhase(this.elapsed, claim.axis);
          if (phase === 'red') continue;
        }
        grantedAxis.set(key, claim.axis);
        break;
      }
    }

    // --- pass 3: longitudinal control -------------------------------------------------
    for (let index = 0; index < count; index += 1) {
      const car = this.fleet[index];
      const loop = car.loop;
      const len = loop.length;
      if (car.errandAway) continue;
      // CAR-1: at true size the families differ by 1.2 m in length, so the follower measures
      // the gap from its own nose and the leader's own tail. The toy kit keeps the one figure.
      const selfHalf = CAR_TRUE_SCALE ? bodyBoxFor(car).halfLength : CAR_HALF_LEN;

      let gap = Infinity;
      let closing = 0;
      let leaderSpeed = 0;
      const consider = (dx, dz, oFwdX, oFwdZ, halfLength, halfWidth, speed) => {
        const ahead = dx * car.fwdX + dz * car.fwdZ;
        if (ahead <= 0 || ahead > LEADER_SCAN) return;
        // A vehicle standing still has a heading but no travel direction, and the heading of
        // a bus dwelling at a kerb or waiting to turn says nothing about whether it is in the
        // way. R41: the heading gate now only rejects MOVING traffic that is going somewhere
        // else — anything stationary in our corridor is a leader whatever way it points.
        // (The BUS lane found and fixed the mirror image of this in its own scan, R40-BUS.)
        const movingWithUs = car.fwdX * oFwdX + car.fwdZ * oFwdZ > 0.2;
        if (!movingWithUs && speed > 0.4) return;
        const lat = Math.abs(dx * car.fwdZ - dz * car.fwdX);
        // Corridor overlap, not centre offset: a 2.4 m-wide bus whose centre is 3 m off our
        // line still has a metre of body in our lane.
        if (lat > LANE_HALF_WIDTH + Math.max(0, halfWidth - CAR_HALF_WIDTH * 0.5)) return;
        const clear = ahead - selfHalf - halfLength;
        if (clear < gap) {
          gap = clear;
          closing = car.speed - speed;
          leaderSpeed = speed;
        }
      };

      // Crossing and oncoming traffic is not a leader — it is a conflict. Project both
      // paths forward, and where they meet inside two seconds the vehicle without priority
      // stops short of the meeting point. This is the layer that holds when a reservation
      // has not resolved yet: a corner merge, a bus on an unsignalised crossing.
      let conflictGap = Infinity;
      const conflict = (ox, oz, oFwdX, oFwdZ, speed, halfLength, giveWay) => {
        if (!giveWay) return;
        const dx = ox - car.worldX;
        const dz = oz - car.worldZ;
        if (Math.hypot(dx, dz) > 28) return;
        if (car.fwdX * oFwdX + car.fwdZ * oFwdZ > 0.2) return; // the leader scan owns this
        const rvx = car.fwdX * car.speed - oFwdX * speed;
        const rvz = car.fwdZ * car.speed - oFwdZ * speed;
        const rel2 = rvx * rvx + rvz * rvz;
        const radius = selfHalf + halfLength;
        const tStar = rel2 > 1e-4 ? (dx * rvx + dz * rvz) / rel2 : -1;
        const near = tStar > 0 && tStar < 2.4
          ? Math.hypot(dx - rvx * tStar, dz - rvz * tStar)
          : Math.hypot(dx, dz);
        if (near > radius * 1.05) return;
        const ahead = dx * car.fwdX + dz * car.fwdZ;
        const stopAt = Math.max(0, ahead - radius - IDM_MIN_GAP);
        if (stopAt < conflictGap) conflictGap = stopAt;
      };
      /** Antisymmetric priority: in the box first, then earliest arrival, then fleet order. */
      const yieldsTo = (other, j) => {
        if (car.inBox !== other.inBox) return other.inBox;
        const mine = car.junctionArrival ?? Infinity;
        const theirs = other.junctionArrival ?? Infinity;
        if (mine !== theirs) return theirs < mine;
        return j < index;
      };

      if (!car.mischiefHidden) {
        for (let j = 0; j < count; j += 1) {
          if (j === index) continue;
          const other = this.fleet[j];
          if (other.mischiefHidden) continue;
          const otherHalf = CAR_TRUE_SCALE ? bodyBoxFor(other).halfLength : CAR_HALF_LEN;
          consider(other.worldX - car.worldX, other.worldZ - car.worldZ,
            other.fwdX, other.fwdZ, otherHalf, CAR_HALF_WIDTH, other.crashed ? 0 : other.speed);
          conflict(other.worldX, other.worldZ, other.fwdX, other.fwdZ,
            other.crashed ? 0 : other.speed, otherHalf,
            other.crashed ? true : yieldsTo(other, j));
        }
        for (const other of this.flowFleet ?? []) {
          if (other.mischiefHidden || other.errandAway) continue;
          const box = bodyBoxFor(other);
          consider(other.worldX - car.worldX, other.worldZ - car.worldZ,
            other.fwdX, other.fwdZ, box.halfLength, box.halfWidth, other.speed ?? 0);
          conflict(other.worldX, other.worldZ, other.fwdX, other.fwdZ,
            other.speed ?? 0, box.halfLength, true);
        }
        for (const item of obstacles) {
          const bdx = item.x - car.worldX;
          const bdz = item.z - car.worldZ;
          const lat = Math.abs(bdx * (-car.fwdZ) + bdz * car.fwdX);
          // Parallel/oncoming reservation (~3.5 m off the lane). Do not use lat alone —
          // a crossing tram 4 m along its track still occupies the box.
          const tramAligned = Math.abs(car.fwdX * item.fwdX + car.fwdZ * item.fwdZ) > 0.55;
          const tramReservation = item.kind === 'tram' && tramAligned && lat > 2.85;
          if (tramReservation) continue;
          consider(item.x - car.worldX, item.z - car.worldZ,
            item.fwdX, item.fwdZ, item.halfLength, item.halfWidth, item.speed);
          conflict(item.x, item.z, item.fwdX, item.fwdZ, item.speed, item.halfLength, true);
          const reach = selfHalf + item.halfLength + 1.2;
          if (!tramReservation && Math.hypot(bdx, bdz) < reach) {
            const ahead = bdx * car.fwdX + bdz * car.fwdZ;
            if (ahead > -selfHalf) {
              conflictGap = Math.min(conflictGap, Math.max(0, ahead - reach + 1.2));
            }
          }
        }
        for (const ped of this.pedestrians ?? []) {
          if (!Number.isFinite(ped.x) || !Number.isFinite(ped.z)) continue;
          // A kerb walker is not a stopped car. Treating every footpath
          // stroller as a speed-0 leader is how a person next to a car
          // parked the whole lane.
          if (!isCarriageway(ped.x, ped.z)) continue;
          const crossing = this._nearestJunction(ped.x, ped.z);
          if (!crossing || crossing.dist > ROAD * .75) continue;
          consider(ped.x - car.worldX, ped.z - car.worldZ,
            0, 0, 0.35, 0.35, 0);
          conflict(ped.x, ped.z, 0, 0, 0, 0.35, true);
        }
        // Round the corner the world-space cone cannot see: the next car along this loop.
        for (const other of this.vehicles ?? this.fleet) {
          if (other === car || other.loop !== car.loop || other.mischiefHidden || other.errandAway) continue;
          const along = forwardDelta(car.mod, wrapDist(other.distance, len), len);
          if (along <= 1e-3 || along > LEADER_SCAN) continue;
          const box = bodyBoxFor(other);
          const clear = along - bodyBoxFor(car).halfLength - box.halfLength;
          if (clear < gap) {
            gap = clear;
            closing = car.speed - (other.crashed ? 0 : other.speed);
            leaderSpeed = other.crashed ? 0 : other.speed;
          }
        }
      }
      car.leaderLimited = Number.isFinite(gap) && gap < 26;
      car.blockedByLeader = Number.isFinite(gap) && gap < 14 && leaderSpeed < 1.2;
      if (conflictGap < gap) {
        gap = conflictGap;
        closing = car.speed;
        leaderSpeed = 0;
      }

      // Stop line: red, an amber the car can pull up for, a junction it has not been
      // granted, or a queue that would leave it standing in the box.
      const hit = car.nextStop;
      let hardStop = false;
      car.heldAtLine = false;
      car.yieldingToPed = false;
      if (hit && !car.crashed && !car.mischiefHidden) {
        const stop = hit.stop;
        const toLine = hit.ahead - selfHalf;
        // CAR-1: the signal is cleared by the centre at true size. A nose-only test let a
        // 5.3 m van that had entered on amber and slowed in the box put most of its body over
        // the line on red (seeds 2 and 7). The toy kit keeps its nose test.
        const clearAhead = CAR_TRUE_SCALE ? hit.ahead : toLine;
        let mustStop = false;
        // A car already committed to this junction clears it. A phase change does not
        // strand a vehicle in the middle of a crossing.
        if (stop.signalised && car.committedKey !== stop.key) {
          const phase = sharedSignalPhase(this.elapsed, stop.axis);
          const left = signalPhaseRemaining(this.elapsed, stop.axis);
          // The decision window opens before amber does: a green with less than
          // DECISION_HORIZON to run is already a decision.
          const deciding = phase === 'amber'
            || (phase === 'green' && left < DECISION_HORIZON);
          if (deciding) {
            if (car.amberKey !== stop.key) {
              // Decide once, then hold it. Stop if that can be done without standing on
              // the brakes; go only if the line will actually be cleared before red.
              const comfortable = car.speed * AMBER_REACTION
                + (car.speed * car.speed) / (2 * AMBER_DECEL);
              const clearsInTime = clearAhead / Math.max(0.5, car.speed) + 0.15
                < left + (phase === 'green' ? LIGHT_STOP_DURATION : 0);
              car.amberKey = stop.key;
              car.amberStop = toLine > comfortable || !clearsInTime;
            }
            mustStop = car.amberStop;
          } else if (phase === 'red') {
            // A car that lawfully committed on amber and is already on the line clears it
            // rather than being stopped dead across the stop line.
            const committedToGo = car.amberKey === stop.key && car.amberStop === false;
            mustStop = !(committedToGo && clearAhead < 1.0);
          } else {
            car.amberKey = null;
          }
        }
        // A car already committed to this box owns it; it is never held by its own
        // reservation, which matters because a turner's live axis stops matching the axis
        // it entered on.
        if (car.committedKey !== stop.key) {
          const held = exclusive.get(stop.key);
          const granted = grantedAxis.get(stop.key);
          if (held != null && held !== index) mustStop = true;
          else if (granted != null && granted !== car.travelAxis) mustStop = true;
          if (this._isCrossingHeld(stop.key)) {
            mustStop = true;
            car.yieldingToPed = true;
          }
        }
        // Keep the box clear: do not enter behind a leader that has not moved far enough
        // past the crossing for this car to fit through it.
        if (!mustStop && leaderSpeed < 1.2 && gap < toLine + JUNCTION_BOX + CAR_LENGTH) {
          mustStop = true;
        }
        // A hold that arrives too late to obey is not a hold, it is a teleport.
        //
        // The unsignalised give-way crossings can withdraw a grant while a car's nose is
        // already over the line, and R40's position clamp then froze it on the spot: the
        // 300 s sweep caught one or two frames per seed at 35 and 116 m/s², which is the
        // "snap, not a stop" the critique described, surviving in the one place the brake
        // ramp could not reach. A driver in that position clears the junction; the conflict
        // layer and the airbag below are what keep it from touching anything while it does.
        // A settled red is the exception — nothing may cross one — and the amber decision
        // opens early enough (DECISION_HORIZON) that this case does not arise there.
        const stopDistance = toLine - STOP_NOSE_GAP;
        const onRed = stop.signalised
          && sharedSignalPhase(this.elapsed, stop.axis) !== 'green';
        // CAR-1: at true size the test is the room the hard stop below actually leaves, the
        // centre's distance to the line (the nose is then still outside the conflict box,
        // see LINE_SETBACK). Measured against the nose gap, a car that had crept the last
        // 0.3 m at walking pace counted as unable to stop and was let into an occupied box:
        // seed 0 at 74.6 s, a wagon released at 1.3 m/s into a box a sedan was crossing.
        const brakeRoom = CAR_TRUE_SCALE ? hit.ahead : stopDistance;
        const cannotStop = brakeRoom <= 0.05
          || (car.speed * car.speed) / (2 * brakeRoom) > IDM_EMERGENCY;
        if (mustStop && cannotStop && !onRed && car.speed > 0.5) mustStop = false;
        if (mustStop && toLine < 70) {
          hardStop = true;
          // IDM's own standstill term is IDM_MIN_GAP, which is the bumper-to-bumper space a
          // driver leaves behind ANOTHER CAR. A painted line is not a car, and leaving 2.5 m
          // of it is why R40 measured `closestHaltToSignalisedStopLineMetres = 4.187` — the
          // nose settling 2.3 m short of the line, which reads as hesitant rather than as
          // stopped at a light. Feeding the constraint pre-loaded by that same term makes the
          // equilibrium land the nose STOP_NOSE_GAP short instead.
          const lineGap = toLine + IDM_MIN_GAP - STOP_NOSE_GAP;
          if (lineGap < gap) {
            gap = Math.max(0, lineGap);
            closing = car.speed;
          }
          // Held on the approach: a driver's foot is on the brake for the whole of this,
          // not only while the speed is still falling.
          car.heldAtLine = toLine < 14;
        }
      }

      // The speed this car wants right now: its own cruise, held down by the corner it is
      // in, then by a Gipps ceiling against the leader / stop so braking starts in time
      // to stay inside FOLLOW_DECEL.
      const cap = car.yieldingToPed ? PEDESTRIAN_YIELD_DECEL : FOLLOW_DECEL;
      if (car.cabStopDistance != null) {
        const cabGap = car.cabStopDistance + IDM_MIN_GAP;
        if (cabGap < gap) { gap = cabGap; leaderSpeed = 0; closing = car.speed; }
      }
      const wantSpeed = Math.min(
        car.desiredSpeed,
        car.cornerSpeed ?? Infinity,
        gippsSafeSpeed(gap, leaderSpeed, cap),
      );
      let accel = car.crashed || car.mischiefHidden
        ? -cap
        : idmAccel(car.speed, wantSpeed, gap, closing);
      accel = Math.max(-cap, Math.min(IDM_ACCEL, accel));
      // Airbag layer: something is about to be touched that the rules above did not catch.
      if (!car.crashed && Number.isFinite(gap) && gap < QUEUE_STANDSTILL_GAP) accel = -cap;

      if (!car.crashed) {
        const before = car.speed;
        let speed = Math.max(0, Math.min(car.desiredSpeed * 1.1, car.speed + accel * step));
        speed = Math.min(speed, wantSpeed);
        speed = Math.max(0, Math.min(speed, before + IDM_ACCEL * step), before - cap * step);
        let advance = speed * step;
        if (car.cabHold) { speed = 0; advance = 0; }
        const followRoom = Number.isFinite(gap)
          ? Math.max(0, gap - QUEUE_STANDSTILL_GAP)
          : Infinity;
        if (advance > followRoom) advance = followRoom;
        if (hardStop && hit) {
          // Do not cross the line; do not derive a new speed from the leftover centimetres
          // (that is the 19 m/s² snap). Gipps already lowered `speed`; this only clips
          // the step so a discrete tick cannot overshoot.
          const room = Math.max(0, hit.ahead);
          if (advance > room) advance = room;
        }
        car.speed = speed;
        car.accel = step > 0 ? (speed - before) / step : accel;
        car.distance += advance;
        car.wheelSpin += advance / (TYRE_RADIUS * TRAFFIC_SCALE);
      } else {
        car.accel = accel;
        car.speed = car.crashed
          ? 0
          : Math.max(0, Math.min(car.desiredSpeed * 1.1, car.speed + accel * step));
      }
    }

    this._updateFlowFleet(step);

    // --- pass 4: pose ------------------------------------------------------------------
    const typeCursor = Object.fromEntries(BODY_TYPES.map(type => [type, 0]));
    const flashOn = (Math.floor(this.elapsed * 2.8) % 2) === 0;
    for (let index = 0; index < renderCount; index += 1) {
      const car = this.vehicles?.[index] ?? this.fleet[index];
      const loop = car.loop;
      if (car.errandAway) {
        position.set(car.worldX, 0, car.worldZ);
        yawHolder.y = car.yaw ?? car.pathYaw ?? 0;
      } else {
        sampleLoop(loop, car.distance, position, yawHolder);
      }
      if (car._drawnX != null && Number.isFinite(car._drawnX)) {
        const jump = Math.hypot(position.x - car._drawnX, position.z - car._drawnZ);
        const maxJump = Math.max(1.15, (car.speed + 2.5) * Math.max(step, 1e-4) + 0.55);
        if (jump > maxJump) {
          const u = maxJump / jump;
          position.x = car._drawnX + (position.x - car._drawnX) * u;
          position.z = car._drawnZ + (position.z - car._drawnZ) * u;
        }
      }
      car._drawnX = position.x;
      car._drawnZ = position.z;
      if (car.crashed) {
        car.crashNudgeX = (car.crashNudgeX ?? 0) * 0.992;
        car.crashNudgeZ = (car.crashNudgeZ ?? 0) * 0.992;
      } else {
        car.crashNudgeX = (car.crashNudgeX ?? 0) * 0.94;
        car.crashNudgeZ = (car.crashNudgeZ ?? 0) * 0.94;
      }
      position.x += car.crashNudgeX ?? 0;
      position.z += car.crashNudgeZ ?? 0;
      car.worldX = position.x;
      car.worldZ = position.z;

      // Heading follows the path through a first-order lag, so the sampled arc reads as a
      // steered curve rather than a sequence of segment snaps.
      let targetYaw = yawHolder.y;
      if (car.crashed) targetYaw += (car.phase - 0.5) * 0.65;
      if (car.errandAway) {
        car.yawSeeded = true;
      } else if (!car.yawSeeded) {
        car.yaw = targetYaw;
        car.yawSeeded = true;
      } else {
        car.yaw += angleDelta(car.yaw, targetYaw) * (1 - Math.exp(-Math.max(step, 1e-4) * 14));
      }

      // Steer angle from path curvature: tan(steer) = wheelbase * curvature, capped at the
      // angle this body's own wheel arch can contain (`maxSteerFor`, derived from the spec —
      // the old ±0.62 rad was a chosen number and it put the tyre 15 cm through the flank).
      const s = spec(car.bodyType ?? 'sedan');
      const wheelbase = s.axleF - s.axleR;
      const lock = CAR_STEER_ENVELOPE[car.bodyType ?? 'sedan']?.maxSteer ?? 0.28;
      const steerTarget = Math.max(-lock, Math.min(lock, Math.atan(wheelbase * car.curvature)));
      car.steer += (steerTarget - car.steer) * (1 - Math.exp(-Math.max(step, 1e-4) * 10));
      // Lateral acceleration rolls the body away from the corner; longitudinal acceleration
      // pitches it; both feed one damped heave so a car nods and settles when it stops.
      const latAcc = car.speed * car.speed * car.curvature;
      const rollTarget = Math.max(-0.085, Math.min(0.085, latAcc * 0.009));
      const pitchTarget = Math.max(-0.045, Math.min(0.065, -car.accel * 0.011));
      car.roll += (rollTarget - car.roll) * (1 - Math.exp(-Math.max(step, 1e-4) * 8));
      car.pitch += (pitchTarget - car.pitch) * (1 - Math.exp(-Math.max(step, 1e-4) * 9));
      car.heaveVel += (-car.heave * 58 - car.heaveVel * 9.2 - car.accel * 0.0075) * step;
      car.heave = Math.max(-0.05, Math.min(0.05, car.heave + car.heaveVel * step));

      euler.set(
        this.reducedMotion ? 0 : car.pitch + (car.mischiefSwayX ?? 0),
        car.yaw,
        this.reducedMotion ? 0 : car.roll + (car.mischiefSwayZ ?? 0),
      );
      bodyQuat.setFromEuler(euler);
      yawQuat.setFromAxisAngle(UP, car.yaw);
      const drawScale = car.mischiefHidden || car.cabId ? hidden : scale;
      position.y = this.reducedMotion ? 0 : car.heave;
      matrix.compose(position, bodyQuat, drawScale);
      position.y = 0;

      const type = car.bodyType ?? 'sedan';
      const slot = typeCursor[type];
      typeCursor[type] += 1;
      const pack = this.byType[type];
      for (const key of PACK_SLOTS) {
        pack[key].count = slot + 1;
        pack[key].setMatrixAt(slot, matrix);
      }
      pack.body.setColorAt(slot, colour.copy(car.color));
      pack.cabin.setColorAt(slot, WHITE);
      pack.darkDetails.setColorAt(slot, WHITE);
      pack.wheelHouses.setColorAt(slot, WHITE);
      pack.trim.setColorAt(slot, WHITE);

      // Brake lamps come off the actual deceleration, not off a speed threshold: a car
      // cruising slowly is not braking, and a car hauling down from cruise is.
      //
      // R41: the threshold was −0.8 m/s², which a free-flowing IDM fleet rarely reaches, and
      // it had no term for a car ALREADY STOPPED at a red — whose deceleration is zero by
      // definition and whose brake lamps are, in every reference photograph of a junction,
      // the brightest thing in the frame. `ref-toy-street-signal.png` is three queued cars
      // reading as braking from full board distance; that is the standard, and neither of
      // the two states it depends on used to light the lamp. Both are covered now: any real
      // lift-off deceleration, and the whole time a car is held on a stop-line approach.
      const job = car.errand;
      const dwelling = job && job.phase === 'dwell';
      const peeling = job && (job.phase === 'peel' || job.phase === 'merge');
      car.braking = !car.mischiefHidden
        && (car.accel < -0.35
          || car.heldAtLine
          || dwelling
          || (car.speed < 0.6 && (car.leaderLimited || car.blockedByLeader || car.crashed)));
      pack.headlamps.setColorAt(slot, WHITE);
      pack.taillamps.setColorAt(slot, car.braking ? TAILLAMP_BRAKE : TAILLAMP_IDLE);
      const hazard = car.crashed || dwelling;
      let left = hazard || car.turnSign < 0;
      let right = hazard || car.turnSign > 0;
      if (peeling && job.bay) {
        const side = (job.bay.x - car.worldX) * car.fwdZ - (job.bay.z - car.worldZ) * car.fwdX;
        const towardKerb = job.phase === 'peel';
        if (side > 0.04) {
          if (towardKerb) left = true;
          else right = true;
        } else if (side < -0.04) {
          if (towardKerb) right = true;
          else left = true;
        }
      }
      pack.indicatorsL.setColorAt(slot, left && flashOn ? INDICATOR_ON : INDICATOR_OFF);
      pack.indicatorsR.setColorAt(slot, right && flashOn ? INDICATOR_ON : INDICATOR_OFF);

      // Wheels ride the road, not the body: they take yaw only, plus steer on the front
      // axle and spin from the distance actually travelled.
      const offsets = WHEEL_OFFSETS[type] ?? WHEEL_OFFSETS.sedan;
      spinQuat.setFromAxisAngle(spinAxis, car.wheelSpin);
      steerQuat.setFromAxisAngle(UP, car.steer);
      for (let w = 0; w < 4; w += 1) {
        const [lx, ly, lz] = offsets[w];
        localWheel.set(lx * TRAFFIC_SCALE, ly * TRAFFIC_SCALE, lz * TRAFFIC_SCALE)
          .applyQuaternion(yawQuat)
          .add(position);
        if (w < 2) wheelQuat.copy(yawQuat).multiply(steerQuat).multiply(spinQuat);
        else wheelQuat.copy(yawQuat).multiply(spinQuat);
        wheelMatrix.compose(localWheel, wheelQuat, drawScale);
        const wi = index * 4 + w;
        this.wheels.setMatrixAt(wi, wheelMatrix);
        this.wheels.setColorAt(wi, WHITE);
        this.rims.setMatrixAt(wi, wheelMatrix);
        this.rims.setColorAt(wi, WHITE);
      }


    }

    poseCybercabs(this);
    // --- last-resort contact recovery (world-space) ---
    // This is the airbag, not the brakes. Avoidance above is meant to make it unreachable.
    // `mvp/tests/traffic-physics.test.mjs` asserts zero contacts across five seeds × 120 s
    // and `mvp/tests/car-headless-verify.mjs` across eight seeds × 300 s; if this block
    // fires, avoidance has a hole and the fix belongs upstream of here, not in it.
    if (step > 0) {
      for (let i = 0; i < count; i += 1) {
        const a = this.fleet[i];
        if (a.crashed || a.mischiefHidden) continue;
        for (let j = i + 1; j < count; j += 1) {
          const b = this.fleet[j];
          if (b.crashed || b.mischiefHidden) continue;
          const dx = (a.worldX ?? 0) - (b.worldX ?? 0);
          const dz = (a.worldZ ?? 0) - (b.worldZ ?? 0);
          const dist = Math.hypot(dx, dz);
          const pairKey = i < j ? `${i}:${j}` : `${j}:${i}`;
          const coolA = a.pairCooldown?.[pairKey] ?? 0;
          const coolB = b.pairCooldown?.[pairKey] ?? 0;
          // Soft separation while in cooldown: push apart without re-arming crash.
          if (coolA > this.elapsed || coolB > this.elapsed) {
            if (dist < CAR_LENGTH * 1.05 && dist > 1e-4) {
              const nx = dx / dist;
              const nz = dz / dist;
              const push = (CAR_LENGTH * 1.1 - dist) * 0.5;
              a.crashNudgeX = (a.crashNudgeX ?? 0) + nx * push;
              a.crashNudgeZ = (a.crashNudgeZ ?? 0) + nz * push;
              b.crashNudgeX = (b.crashNudgeX ?? 0) - nx * push;
              b.crashNudgeZ = (b.crashNudgeZ ?? 0) - nz * push;
            }
            continue;
          }
          if (dist < CRASH_GAP && (a.speed > 0.25 || b.speed > 0.25 || dist < CAR_HALF_LEN)) {
            a.crashed = true;
            b.crashed = true;
            a.crashTimer = CRASH_HOLD;
            b.crashTimer = CRASH_HOLD;
            a.speed = 0;
            b.speed = 0;
            a.lastCrashAt = this.elapsed;
            b.lastCrashAt = this.elapsed;
            a.pairCooldown = a.pairCooldown ?? {};
            b.pairCooldown = b.pairCooldown ?? {};
            a.pairCooldown[pairKey] = this.elapsed + CRASH_PAIR_COOLDOWN;
            b.pairCooldown[pairKey] = this.elapsed + CRASH_PAIR_COOLDOWN;
            // Separate along contact normal past full body half-length each side.
            const nx = dist > 1e-3 ? dx / dist : 1;
            const nz = dist > 1e-3 ? dz / dist : 0;
            const need = Math.max(CRASH_SEPARATION, CAR_LENGTH + 1.2 - dist);
            a.crashNudgeX = (a.crashNudgeX ?? 0) + nx * need * 0.55;
            a.crashNudgeZ = (a.crashNudgeZ ?? 0) + nz * need * 0.55;
            b.crashNudgeX = (b.crashNudgeX ?? 0) - nx * need * 0.55;
            b.crashNudgeZ = (b.crashNudgeZ ?? 0) - nz * need * 0.55;
            // Asymmetric path kicks leave the contact corridor on different phases.
            a.distance += CRASH_PATH_KICK_A + (a.phase ?? 0) * 2.4;
            b.distance += CRASH_PATH_KICK_B + (b.phase ?? 0) * 1.5;
            a.junctionArrival = null;
            b.junctionArrival = null;
            a.junctionKey = null;
            b.junctionKey = null;
          }
        }
      }
    }

    for (const type of BODY_TYPES) {
      const pack = this.byType[type];
      for (const key of PACK_SLOTS) {
        pack[key].instanceMatrix.needsUpdate = true;
        pack[key].computeBoundingSphere(); // Moving instances need fresh culling bounds.
        if (pack[key].instanceColor) pack[key].instanceColor.needsUpdate = true;
      }
    }
    this.wheels.instanceMatrix.needsUpdate = true;
    this.wheels.computeBoundingSphere();
    if (this.wheels.instanceColor) this.wheels.instanceColor.needsUpdate = true;
    this.rims.instanceMatrix.needsUpdate = true;
    this.rims.computeBoundingSphere();
    if (this.rims.instanceColor) this.rims.instanceColor.needsUpdate = true;
  }

  stats() {
    const n = this.vehicles?.length ?? this.fleet?.length ?? 0;
    let tris = (geometryTriangles(this.wheels.geometry)
      + geometryTriangles(this.rims.geometry)) * n * 4;
    let draws = n ? 2 : 0; // tyres + spinning rims
    for (const type of BODY_TYPES) {
      const pack = this.byType[type];
      const c = pack.body.count;
      if (!c) continue;
      draws += PACK_SLOTS.length;
      for (const key of PACK_SLOTS) tris += geometryTriangles(pack[key].geometry) * c;
    }
    return {
      drawCalls: draws,
      triangles: Math.round(tris),
      instances: n,
      cars: n,
      physicsCars: this.fleet?.length ?? 0,
      flowCars: this.flowFleet?.length ?? 0,
      plateFlowCars: this.flowFleet?.filter((car) => car.p17PlateFlow).length ?? 0,
      loopsOccupied: new Set((this.vehicles ?? []).map((car) => car.loopId)).size,
      roadMetres: this.densityPlan?.roadMetres ?? 0,
      movingVehicles: this.densityPlan?.movingVehicles ?? n,
      metresPerVehicle: this.densityPlan?.metresPerVehicle ?? 0,
    };
  }

  dispose() {
    disposeCybercabs(this);
    for (const type of BODY_TYPES) {
      const pack = this.byType[type];
      for (const key of PACK_SLOTS) pack[key].geometry.dispose();
    }
    // Materials are shared across the three families, so they are disposed once here.
    for (const material of Object.values(this.materials ?? {})) material.dispose();
    this.wheels.geometry.dispose();
    this.wheels.material.dispose();
    this.rims.geometry.dispose();
    this.rims.material.dispose();
    disposeCarSurfaceMaps();
    this._obstacleProviders = [];
    this._obstacles = [];
    this.fleet = [];
    this.flowFleet = [];
    this.vehicles = [];
    this._plateLoop = null;
  }
}

export default TrafficLayer;
