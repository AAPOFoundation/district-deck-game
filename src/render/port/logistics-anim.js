// District Deck — P13 Lane C port cargo choreography.
// Pure schedule + a Three.js director that drives the Lane A rig.
// Deterministic: seeded index maths only. No clock reads outside `dt`.

import * as THREE from 'three';
import { PITCH, ROAD, cityExtent } from '../../core/grid.js';
import { portStorageClass } from '../../core/world/port-storage.js';
import { addToyPerson, noPick, std } from '../fringe/kit.js';
import { CONTAINER_BOX, makeStampedContainer } from './container-stamps.js';
import { CONTAINER_DECK_STOW, cloneShipWithFittings, deckCargoGeometry } from '../fringe/ships.js';
import {
  addDepartWake,
  addRailConsist,
  addTerminalTractor,
  disposeVehicle,
} from './port-vehicles.js';

const BOX = CONTAINER_BOX;
const _headQ = new THREE.Quaternion();
const _Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * Spreader origin → the CENTRE of the box it is holding. `addGantry` publishes
 * `cargoDrop` off the container module (P16-PM4); the fallback rebuilds it from
 * the same module so a rig built by an older path still hangs its box under the
 * tines instead of through them.
 */
export function cargoDropOf(gantry) {
  return gantry?.cargoDrop ?? (0.78 + BOX.h * 0.5);
}

/** Hoisted scratch — the update loop must not `new` vectors, matrices, or geometry. */
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q1 = new THREE.Quaternion();
const _s1 = new THREE.Vector3();
const _dropList = new Array(32);
const PUFF_GEOM = new THREE.CircleGeometry(1, 12);
const PUFF_MAT = new THREE.MeshBasicMaterial({
  color: 0xc4b48a,
  transparent: true,
  opacity: 0.42,
  depthWrite: false,
  toneMapped: false,
  side: THREE.DoubleSide,
});
const GATE_PLATE_GEOM = new THREE.BoxGeometry(3.6, 0.12, 0.55);
const GATE_PLATE_MAT = new THREE.MeshStandardMaterial({
  color: 0xc9a21a,
  roughness: 0.44,
  metalness: 0.12,
});
const LAMP_RED = new THREE.Color(0xc62828);
const LAMP_GREEN = new THREE.Color(0x2e7d32);
const LAMP_EMISSIVE_RED = new THREE.Color(0xff2020);
const LAMP_EMISSIVE_GREEN = new THREE.Color(0x1b5e20);

export const CRANE_CYCLE_MIN = 4.5;
export const CRANE_CYCLE_MAX = 6.5;
export const CONVEYOR_SHIFT_SECONDS = 1.2;
export const STACKER_ROUND_TRIP_MAX = 9;
export const SHIP_ARRIVE_MIN = 6;
export const SHIP_ARRIVE_MAX = 9;
export const SHIP_DEPART_MIN = 5;
export const SHIP_DEPART_MAX = 7;
export const TRUCK_SPEED_MIN = 9;
export const TRUCK_SPEED_MAX = 12;
export const TRUCK_DRIVE_MIN = 8;
export const TRUCK_DRIVE_MAX = 16;
export const GATE_PAUSE_SECONDS = 0.8;
export const HAUL_SECONDS = 3.2;
export const RAIL_ENTRY_SECONDS = 6;
export const BEAT_MAX_SECONDS = 40;
export const CLASS_OVERFLOW_MAX = 12;
// taste-r1 W8-E: the middle of three bays (was 3 of 5), centred on the hold gantry's x; see CONTAINER_DECK_STOW in ships.js.
export const HOLD_BAY = CONTAINER_DECK_STOW.holdBay;
export const LIVE_TIER_CAP = 4;
export const KEEP_LEFT_M = 3.5;
export const DOOR_SECONDS = 0.45;
export const BOX_RIDE_SECONDS = 3.2;
export const FIRST_MOTION_AT = 0.16;
// taste-r1 W7-B: the loading arms' stowed pose. The old pair (-0.15, 0.45) left the outboard limb pointing down at deck
// height, so the coupling touched the tanker's deck and manifold the moment the hull was alongside (0.02 m, then 0 m
// as the arms lowered). (-0.30, 0.30) holds the limb level and 0.57 m clear of the tanker at rest.
const ARM_STOW_INBOARD = -0.30;
const ARM_STOW_OUTBOARD = 0.30;
export const PORT_FULL_PLATE_SECONDS = 4;
export const LANE_SLOT_COUNT = 14;
export const STERN_SQUAT_METRES = 0.25;
export const STERN_SQUAT_SECONDS = 3;
export const ARRIVE_SETTLE_METRES = 0.15;
export const ARRIVE_SETTLE_SECONDS = 1.5;
export const COLLAR_SPEED_SCALE = 1.6;
export const SPREADER_SWING_DEG = 2;
export const SPREADER_SWING_DAMP = 1.2;
export const PERSON_BOB_AMP = 0.06;
export const PERSON_BOB_HZ = 2.2;
export const LANE_PUFF_SECONDS = 0.55;
// P16-PM2 (critic C9): the hawser section is 140 mm, not 55 mm — a 55 mm rope
// is 1.3 px at the play camera and cannot anti-alias. `_cacheMooring` matches
// the built cylinders on THIS radius, so the two numbers must move together or
// the slack-and-let-go mechanic silently stops finding any line at all.
export const MOORING_LINE_RADIUS = 0.14;
export const MOORING_SLACK_DROP = 0.4;
export const MOORING_SAG_MUL = 2;
/** Outbound hull stays opaque until it is this far from the cope. */
export const SHIP_FADE_BEYOND_M = 90;
/** Inbound hull is fully opaque once inside this radius of the cope. */
export const SHIP_OPAQUE_WITHIN_M = 120;
export const SHIP_FADE_SPAN_M = 16;
export const GATE_BOOM_DEG = -70;
export const GATE_BOOM_SECONDS = GATE_PAUSE_SECONDS;
const GATE_BOOM_RAD = (GATE_BOOM_DEG * Math.PI) / 180;
export const PORT_CAMERA_SEA_AZIMUTH = 150;
export const PORT_CAMERA = Object.freeze({
  load: Object.freeze({ azimuth: 150, polar: 30, distance: 56 }),
  depart: Object.freeze({ azimuth: 150, polar: 24, distance: 72 }),
  arrive: Object.freeze({ azimuth: 150, polar: 26, distance: 70 }),
  unload: Object.freeze({ azimuth: 150, polar: 28, distance: 58 }),
  truck: Object.freeze({ azimuth: 320, polar: 32, distance: 48 }),
  rail: Object.freeze({ azimuth: 230, polar: 34, distance: 62 }),
  tanker: Object.freeze({ azimuth: 150, polar: 28, distance: 92 }),
});

/** Phases of one crane cycle. Sum is 5.20 s; scaled to craneCycleSeconds(i). */
export const CRANE_PHASES = Object.freeze({
  trolleyTo: 0.70,
  down: 0.90,
  lock: 0.35,
  lift: 0.90,
  trolleyAcross: 0.85,
  lower: 0.90,
  release: 0.60,
});

const CRANE_PHASE_SUM = Object.values(CRANE_PHASES).reduce((a, b) => a + b, 0);

export const RAIL_GOODS = Object.freeze(['food', 'grain', 'timber', 'fittings', 'materials']);
const RAIL_SET = new Set(RAIL_GOODS);

export function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function smoothstep(low, high, value) {
  const t = clamp01((value - low) / Math.max(1e-6, high - low));
  return t * t * (3 - 2 * t);
}

export function easeInOutCubic(t) {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
}

export function easeOutCubic(t) {
  const x = clamp01(t);
  return 1 - ((1 - x) ** 3);
}

export function easeInOutQuad(t) {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2;
}

/** Lifted-box swing: ±2° then damps. `t` is 0..1 over the lift. */
export function swingDamp(t, ampDeg = 2) {
  const x = clamp01(t);
  return (ampDeg * Math.PI) / 180 * Math.sin(x * Math.PI * 3.2) * Math.exp(-3.1 * x);
}

/** Set-down dip of 4 cm then settle. `t` is 0..1 over the release. */
export function setDownDip(t, depth = 0.04) {
  const x = clamp01(t);
  if (x < 0.4) return -depth * Math.sin((x / 0.4) * Math.PI);
  return -depth * 0.18 * (1 - (x - 0.4) / 0.6) * Math.sin((x - 0.4) * Math.PI * 2);
}

export function craneCycleSeconds(index = 0) {
  const slot = Math.max(0, Math.floor(index));
  const span = CRANE_CYCLE_MAX - CRANE_CYCLE_MIN;
  return CRANE_CYCLE_MIN + (slot % 5) * (span / 4);
}

export function shipArriveSeconds(index = 0) {
  const slot = Math.max(0, Math.floor(index));
  const span = SHIP_ARRIVE_MAX - SHIP_ARRIVE_MIN;
  return SHIP_ARRIVE_MIN + (slot % 4) * (span / 3);
}

export function shipDepartSeconds(index = 0) {
  const slot = Math.max(0, Math.floor(index));
  const span = SHIP_DEPART_MAX - SHIP_DEPART_MIN;
  return SHIP_DEPART_MIN + (slot % 3) * (span / 2);
}

export function truckSpeed(index = 0) {
  const slot = Math.max(0, Math.floor(index));
  return TRUCK_SPEED_MIN + (slot % (TRUCK_SPEED_MAX - TRUCK_SPEED_MIN + 1));
}

export function truckTravelSeconds(pathLength, index = 0) {
  const speed = truckSpeed(index);
  const raw = (Number.isFinite(pathLength) ? pathLength : 0) / Math.max(1, speed);
  return Math.max(TRUCK_DRIVE_MIN, Math.min(TRUCK_DRIVE_MAX, raw));
}

export function stackerRoundTripSeconds(index = 0) {
  const slot = Math.max(0, Math.floor(index));
  return 7.2 + (slot % 3) * 0.5;
}

export function isRailAdmissionGood(good) {
  return RAIL_SET.has(good);
}

export function cranePhaseAt(localT, duration) {
  const scale = (duration || CRANE_PHASE_SUM) / CRANE_PHASE_SUM;
  let acc = 0;
  const order = [
    'trolleyTo', 'down', 'lock', 'lift', 'trolleyAcross', 'lower', 'release',
  ];
  const t = Math.max(0, localT);
  for (const name of order) {
    const len = CRANE_PHASES[name] * scale;
    if (t < acc + len || name === 'release') {
      return { name, u: clamp01((t - acc) / Math.max(1e-6, len)), t0: acc, duration: len };
    }
    acc += len;
  }
  return { name: 'release', u: 1, t0: acc, duration: 0 };
}

/**
 * ── P16-PM2 ITEM 2 — THE FAIRWAY IS CHECKED AGAINST THE BASIN. ──
 *
 * The shipped lane ran `cx + 8` at z 60 and `cx + 30` at z 90, which put a 42 m
 * hull with a 9.6 m beam 1.2 m from the barge's hull on every departure and
 * 6.1 m from the breakwater. Both are inside the lane's own half-width
 * (`WATER_PLAN.laneHalfWidth`, 7.8 m = half beam + 3 m). The line now leaves
 * the berth almost square, turns up-quay outside the barge's station and passes
 * the breakwater's landward head with 8.1 m in hand. Clearance to every slot
 * and station in `portWaterPlan()` is asserted in `p13-port-anim.test.mjs`.
 */
export function containerApproachWaypoints(cx, berthZ = 22) {
  return Object.freeze([
    Object.freeze({ x: cx, z: berthZ }),
    Object.freeze({ x: cx + 1.65, z: 56 }),
    Object.freeze({ x: cx + 33, z: 88 }),
    Object.freeze({ x: cx + 44, z: 120 }),
  ]);
}

/**
 * ── TASTE-R1 LANE 3 — A SHIP TURNS OUT OF ITS BERTH; IT DOES NOT CRAB. ──
 *
 * The shipped fairway moved the 42 m hull along `containerApproachWaypoints` with
 * its heading frozen, so the hull slid sideways through the barge, the push tug,
 * the Spirit and the breakwater (the motion sweep read 1.9 to 2.4 m of
 * interpenetration at each) and the point-path clearance test that "passed" it
 * never saw a 42 m bar. A real departure is bow-first: the hull stays parallel to
 * the quay while it pulls clear, then swings onto the fairway. The lane is that
 * car-like path: the hull's heading `h` (the harbour-local direction of its bow,
 * `(cos h, -sin h)` in x, z) ramps from the berthed heading to `turnDeg` over
 * `turnLen` metres of travel on a smoothstep, and the centre follows the heading.
 * The arrival plays the same lane backwards (the hull backs in, tug-assisted).
 *
 * The numbers were found by `route-lab4.mjs` (lane3 folder): they keep every
 * station, slot, the breakwater and the quay at least 1.5 m clear of the swept hull.
 */
export const SHIP_LANE = Object.freeze({
  container: Object.freeze({ turnDeg: -70, turnLen: 34, length: 112 }),
  tanker: Object.freeze({ turnDeg: -125, turnLen: 36, length: 112 }),
});

/** Dense lane polyline `{x, z, h}` every `step` metres from the berth centre `(x0, z0)`. */
export function shipLane(kind, x0, z0, step = 1) {
  const spec = SHIP_LANE[kind] ?? SHIP_LANE.container;
  const hf = (spec.turnDeg * Math.PI) / 180;
  const pts = [];
  let x = x0;
  let z = z0;
  for (let s = 0; s <= spec.length + 1e-9; s += step) {
    const t = Math.max(0, Math.min(1, s / spec.turnLen));
    const h = hf * t * t * (3 - 2 * t);
    pts.push({ x, z, h });
    x += Math.cos(h) * step;
    z -= Math.sin(h) * step;
  }
  return Object.freeze(pts);
}

export function containerApproachLane(cx, berthZ = 22) {
  return shipLane('container', cx, berthZ);
}

export function tankerApproachLane(tx, berthZ = 24) {
  return shipLane('tanker', tx, berthZ);
}

export function polylineLength(pts) {
  const list = Array.isArray(pts) ? pts : [];
  let len = 0;
  for (let i = 1; i < list.length; i += 1) {
    len += Math.hypot(list[i].x - list[i - 1].x, list[i].z - list[i - 1].z);
  }
  return len;
}

export function samplePolyline(pts, t) {
  const list = Array.isArray(pts) && pts.length ? pts : [{ x: 0, z: 0 }];
  const u = clamp01(t);
  const total = polylineLength(list);
  if (total < 1e-6) {
    return { x: list[0].x, z: list[0].z, yaw: 0, s: 0, remaining: 0 };
  }
  let d = u * total;
  for (let i = 1; i < list.length; i += 1) {
    const seg = Math.hypot(list[i].x - list[i - 1].x, list[i].z - list[i - 1].z);
    if (d <= seg || i === list.length - 1) {
      const k = seg < 1e-6 ? 1 : Math.max(0, Math.min(1, d / seg));
      const x = list[i - 1].x + (list[i].x - list[i - 1].x) * k;
      const z = list[i - 1].z + (list[i].z - list[i - 1].z) * k;
      const yaw = Math.atan2(list[i].x - list[i - 1].x, list[i].z - list[i - 1].z);
      // A lane point may carry the hull's heading `h` (see `shipLane`); carry it through.
      if (list[i].h !== undefined && list[i - 1].h !== undefined) {
        return { x, z, yaw, h: list[i - 1].h + (list[i].h - list[i - 1].h) * k, s: u * total, remaining: total * (1 - u) };
      }
      return { x, z, yaw, s: u * total, remaining: total * (1 - u) };
    }
    d -= seg;
  }
  const last = list[list.length - 1];
  return { x: last.x, z: last.z, yaw: 0, s: total, remaining: 0 };
}

export function distFromCope(pose, waypoints) {
  const origin = waypoints?.[0] ?? { x: 0, z: 0 };
  return Math.hypot((pose?.x ?? 0) - origin.x, (pose?.z ?? 0) - origin.z);
}

/** Fade only past the breakwater. Depart: 1 until 90 m, 0 by 90+16 m. Arrive: 1 inside 120 m. */
export function hullFadeForDistance(dist, mode = 'depart') {
  const d = Number.isFinite(dist) ? dist : 0;
  if (mode === 'arrive') {
    return d <= SHIP_OPAQUE_WITHIN_M
      ? 1
      : clamp01(1 - (d - SHIP_OPAQUE_WITHIN_M) / SHIP_FADE_SPAN_M);
  }
  if (d <= SHIP_FADE_BEYOND_M) return 1;
  return clamp01(1 - (d - SHIP_FADE_BEYOND_M) / SHIP_FADE_SPAN_M);
}

export function shipDepartPose(t, waypoints, duration = SHIP_DEPART_MIN) {
  const u = easeInOutCubic(t);
  const pose = samplePolyline(waypoints, u);
  const elapsed = clamp01(t) * Math.max(1e-6, duration);
  const squat = elapsed < STERN_SQUAT_SECONDS
    ? STERN_SQUAT_METRES * Math.sin((elapsed / STERN_SQUAT_SECONDS) * Math.PI)
    : 0;
  const dist = distFromCope(pose, waypoints);
  const fade = hullFadeForDistance(dist, 'depart');
  const pitch = squat / 18;
  const speed01 = Math.sin(clamp01(t) * Math.PI);
  return { ...pose, y: -squat * 0.35, opacity: fade, squat, pitch, speed01, dist };
}

// Grow the existing decal chain from the stern as water is traversed. Finish
// fading before the holder's cull threshold, so re-berthing removes zero alpha.
export function departureWakeAlpha(distance, behind = 0) {
  return smoothstep(behind, behind + 6, distance)
    * (1 - smoothstep(SHIP_FADE_BEYOND_M, SHIP_FADE_BEYOND_M + 14, distance));
}

export function shipArrivePose(t, waypoints, duration = SHIP_ARRIVE_MIN) {
  const u = easeInOutCubic(t);
  const pose = samplePolyline(waypoints, 1 - u);
  const dist = distFromCope(pose, waypoints);
  const fade = hullFadeForDistance(dist, 'arrive');
  const dur = Math.max(1e-6, duration);
  const settleStart = Math.max(0, 1 - ARRIVE_SETTLE_SECONDS / dur);
  let y = 0;
  let squat = 0;
  if (t >= settleStart) {
    const since = (t - settleStart) * dur;
    const bob = arriveBerthBob(since);
    y = bob;
    squat = -bob;
  }
  const speed01 = Math.sin(clamp01(t) * Math.PI);
  return { ...pose, y, opacity: fade, squat, pitch: 0, speed01, dist };
}

export function portCameraPose(phase) {
  const key = phase === 'road' ? 'truck' : phase;
  return PORT_CAMERA[key] ?? PORT_CAMERA.load;
}

/** 1.5 s damped bob that settles 0.15 m on berth. `since` is seconds after contact. */
export function arriveBerthBob(since, amp = ARRIVE_SETTLE_METRES, window = ARRIVE_SETTLE_SECONDS) {
  const s = Math.max(0, Number.isFinite(since) ? since : 0);
  const settle = -amp * (1 - Math.exp(-s * 2.8));
  const bob = s < window * 2
    ? amp * Math.exp(-s * 2.2) * Math.sin(s * Math.PI * 2.4)
    : 0;
  return settle + bob;
}

export function collarScaleForSpeed(speed01) {
  const u = clamp01(speed01);
  return 1 + (COLLAR_SPEED_SCALE - 1) * u;
}

/** Travel-direction lean, then 1.2 s damped decay after the trolley stops. */
export function swingAfterStop(timeSinceStop, lastAmp, damp = SPREADER_SWING_DAMP) {
  const t = Math.max(0, Number.isFinite(timeSinceStop) ? timeSinceStop : 0);
  const a = Number.isFinite(lastAmp) ? lastAmp : 0;
  return a * Math.exp((-3 * t) / Math.max(0.2, damp)) * Math.cos(t * Math.PI * 0.9);
}

export function corridorCentres(extent) {
  const ex = extent?.x ?? cityExtent(4, 4).x;
  const ez = extent?.z ?? cityExtent(4, 4).z;
  const xs = [];
  const zs = [];
  for (let x = ROAD * 0.5; x <= ex + 1e-6; x += PITCH) xs.push(x);
  for (let z = ROAD * 0.5; z <= ez + 1e-6; z += PITCH) zs.push(z);
  return { xs, zs };
}

function nearestValue(values, v) {
  let best = values[0] ?? 0;
  let dist = Infinity;
  for (const x of values) {
    const d = Math.abs(x - v);
    if (d < dist) {
      dist = d;
      best = x;
    }
  }
  return best;
}

export function keepLeftOffset(dx, dz, metres = KEEP_LEFT_M) {
  const len = Math.hypot(dx, dz) || 1;
  return { x: (-dz / len) * metres, z: (dx / len) * metres };
}

function pushPoint(out, x, z) {
  const last = out[out.length - 1];
  if (!last || Math.hypot(x - last.x, z - last.z) > 0.04) out.push({ x, z });
}

/**
 * Building → nearest corridor centreline → Manhattan along corridors →
 * north-edge road (z = ROAD/2) → gate. Keep-left on corridor segments only.
 */
export function manhattanCorridorPath(from, to, extent) {
  const { xs, zs } = corridorCentres(extent);
  const northZ = zs[0] ?? ROAD * 0.5;
  const raw = [];
  pushPoint(raw, from.x, from.z);
  const fromCx = nearestValue(xs, from.x);
  const fromCz = nearestValue(zs, from.z);
  if (Math.abs(from.x - fromCx) >= Math.abs(from.z - fromCz)) {
    pushPoint(raw, fromCx, from.z);
    pushPoint(raw, fromCx, fromCz);
  } else {
    pushPoint(raw, from.x, fromCz);
    pushPoint(raw, fromCx, fromCz);
  }
  pushPoint(raw, fromCx, northZ);
  const gateCx = nearestValue(xs, to.x);
  pushPoint(raw, gateCx, northZ);
  pushPoint(raw, to.x, northZ);
  pushPoint(raw, to.x, to.z);

  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    const p = raw[i];
    const n = raw[i + 1];
    const isEnd = i === 0 || i === raw.length - 1;
    if (isEnd || !n) {
      out.push({ x: p.x, z: p.z });
      continue;
    }
    const off = keepLeftOffset(n.x - p.x, n.z - p.z);
    out.push({ x: p.x + off.x, z: p.z + off.z });
  }
  return out;
}

/**
 * ── TASTE-R1 LANE 3 — A LOOSE BOX SITS ON ITS HATCH COVER, NOT IN IT. ──
 * A ground-tier cell's centre is the height the ship's own STOWED boxes are seated at, which buries their feet
 * 0.45 m in the hatch-cover slab (they are static, so nothing minds). A box the crane lowers into the cell is a
 * mover and the sweep reads that 0.45 m as interpenetration; 0.2 m of seat lift leaves 0.25 m, under the 0.3 m
 * tolerance, and costs nothing visible. Upper tiers stand on boxes, not on the cover, and are unchanged.
 */
const SEAT_LIFT_M = 0.2;
export function seatY(cell) {
  return (cell?.y ?? 0) + ((cell?.tier ?? 1) === 0 ? SEAT_LIFT_M : 0);
}

export function nextFreeBay3Cells(deckSlots, count) {
  const n = Math.max(0, Math.floor(count));
  const bay = (deckSlots ?? []).filter((s) => s.bay === HOLD_BAY);
  const rows = [...new Set(bay.map((s) => s.row))].sort((a, b) => a - b);
  const free = [];
  for (const row of rows) {
    const tiers = bay.filter((s) => s.row === row).sort((a, b) => a.tier - b.tier);
    for (const cell of tiers) {
      if (!cell.occupied) free.push(cell);
    }
  }
  return free.slice(0, n);
}

export function inboundBay3Cells(deckSlots, count) {
  const n = Math.max(0, Math.floor(count));
  const bay = (deckSlots ?? []).filter((s) => s.bay === HOLD_BAY)
    .slice()
    .sort((a, b) => a.row - b.row || a.tier - b.tier);
  // taste-r1 W8-E: the boxes are SEATED bottom-up (a box needs a box or the deck under it), but the crane takes them
  // top-down within a row. The hold bay now stands under the gantry, so a spreader that lifted the bottom box of a stack first
  // carried it up through the boxes still standing on it (0.45 to 0.49 m on the motion sweep at t = 24.5 s).
  return bay.slice(0, n).sort((a, b) => a.row - b.row || b.tier - a.tier);
}

export function nextFreeLiveCells(cells, count, cap = LIVE_TIER_CAP) {
  const n = Math.max(0, Math.floor(count));
  const ranked = (cells ?? []).map((c, i) => ({ cell: c, i, tier: c.tier ?? 0 }))
    .sort((a, b) => a.tier - b.tier || a.i - b.i);
  const out = [];
  const used = ranked.map((r) => r.tier);
  for (let k = 0; k < ranked.length && out.length < n; k += 1) {
    if (used[k] < cap) {
      out.push({
        ...ranked[k].cell,
        index: ranked[k].i,
        placeTier: used[k],
      });
      used[k] += 1;
    }
  }
  return out;
}

export function collapseClassOverflow(items, max = CLASS_OVERFLOW_MAX) {
  const list = Array.isArray(items) ? [...items] : [];
  if (list.length <= max) return list;
  const head = list.slice(0, Math.max(0, max - 1));
  const overflow = list.length - head.length;
  const last = list[max - 1];
  head.push({
    ...last,
    overflow,
    overflowOf: overflow,
    row: last.row
      ? { ...last.row, overflow, cause: last.row.cause }
      : last.row,
  });
  return head;
}

function causeOf(row) {
  return row?.cause ?? null;
}

export function classifyBeatRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const buckets = {
    exports: [],
    harvestShip: [],
    harvestTank: [],
    harvestPassenger: [],
    cityRoad: [],
    cityRail: [],
    exportShipment: [],
    process: [],
    other: [],
  };
  const byClass = { yard: [], warehouse: [], tank: [], passenger: [] };
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i];
    const cls = portStorageClass(row?.good);
    const item = { row, index: i, cls, good: row?.good ?? null };
    if (byClass[cls]) byClass[cls].push(item);
    const cause = causeOf(row);
    if (cause === 'export-departure') {
      if (cls !== 'tank' && cls !== 'passenger') buckets.exports.push(item);
    } else if (cause === 'harvest' && (row?.via === 'ship' || !row?.via)) {
      if (cls === 'tank') buckets.harvestTank.push(item);
      else if (cls === 'passenger') buckets.harvestPassenger.push(item);
      else buckets.harvestShip.push(item);
    } else if (cause === 'city-admission' || cause === 'city-ledger') {
      if (isRailAdmissionGood(row?.good)) buckets.cityRail.push(item);
      else if (cls === 'yard' || cls === 'warehouse') buckets.cityRoad.push(item);
      else buckets.other.push(item);
    } else if (cause === 'export' || cause === 'export-shipment') {
      buckets.exportShipment.push(item);
    } else if (typeof cause === 'string' && cause.startsWith('process')) {
      buckets.process.push(item);
    } else {
      buckets.other.push(item);
    }
  }
  return { ...buckets, byClass, list };
}

function freezeEvent(event) {
  return Object.freeze({ ...event });
}

function windowsOverlap(windows) {
  const s = windows.slice().sort((a, b) => a.t0 - b.t0);
  for (let i = 1; i < s.length; i += 1) {
    if (s[i].t0 < s[i - 1].t1 - 1e-6) return true;
  }
  return false;
}

export function resourceWindows(events, resource) {
  return (events ?? [])
    .filter((e) => e.resource === resource && !e.queued)
    .map((e) => ({ id: e.id, t0: e.t0, t1: e.t1 }));
}

/**
 * Live beat holds the ambient loop must yield. Crane/stacker are tagged
 * `resource`; tractor/gate/rail are inferred from the live event kind.
 * While `playing` the director writes the hold gantry every frame, so ambient
 * idle on that crane only runs when playing is false.
 */
export function beatResourceLocks(plan, time, extra = {}) {
  const t = Number.isFinite(time) ? time : 0;
  const events = plan?.events ?? [];
  const live = (pred) => events.some((e) => !e.queued && t >= e.t0 && t < e.t1 && pred(e));
  const truck = events.find((e) => e.kind === 'truck' && !e.queued && t >= e.t0 && t < e.t1) ?? null;
  let truckPhase = null;
  if (truck) {
    const driveEnd = truck.t0 + (truck.drive ?? 0);
    const pauseEnd = driveEnd + (truck.pause ?? GATE_PAUSE_SECONDS);
    const haulEnd = pauseEnd + (truck.haulSeconds ?? HAUL_SECONDS);
    if (t < driveEnd) truckPhase = 'city';
    else if (t < pauseEnd) truckPhase = 'gate';
    else if (t < haulEnd) truckPhase = 'haul';
    else truckPhase = 'leave';
  }
  const playing = Boolean(plan) && t >= 0 && t < (plan.playableDuration ?? 0) + 1;
  const gateOpen = Number(extra.gateOpen) || 0;
  return {
    crane: live((e) => e.resource === 'crane'),
    stacker: live((e) => e.resource === 'stacker'),
    tractor: Boolean(truck),
    gate: truckPhase === 'gate' || truckPhase === 'haul' || gateOpen > 0.02,
    rail: live((e) => e.kind === 'rail'),
    truckPhase,
    playing,
  };
}

export function spreaderOverlaps(events) {
  return windowsOverlap(resourceWindows(events, 'crane'));
}

export function stackerOverlaps(events) {
  return windowsOverlap(resourceWindows(events, 'stacker'));
}

export function cellsExclusive(assignments) {
  const seen = new Set();
  for (const a of assignments ?? []) {
    const key = `${a.kind}:${a.x}:${a.z}:${a.tier ?? 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function laneHead(logistics) {
  return logistics?.transferLane?.headSlot
    ?? { x: (logistics?.containerBerth?.x ?? 38.92) - 1.5, z: -7 };
}

function laneSlots(logistics) {
  const slots = logistics?.transferLane?.slots;
  if (Array.isArray(slots) && slots.length) return slots;
  const cx = logistics?.containerBerth?.x ?? 38.92;
  const z = -7;
  const out = [];
  for (let i = 0; i < LANE_SLOT_COUNT; i += 1) {
    out.push({ x: cx + 1.5 + i * BOX.w, z });
  }
  return out;
}

function lastLaneSlot(logistics) {
  const slots = laneSlots(logistics);
  return slots[slots.length - 1] ?? laneHead(logistics);
}

/**
 * Deterministic beat schedule. Crane and stacker are exclusive. Jobs that
 * would start after the 40 s cap are marked `queued` and do not play.
 */
export function scheduleBeat(rows, logistics = {}, options = {}) {
  const city = options.city;
  const extent = city?.extent ?? cityExtent(city?.blocksX ?? 4, city?.blocksZ ?? 4);
  const classified = classifyBeatRows(rows);
  const byClass = {
    yard: collapseClassOverflow(classified.byClass.yard),
    warehouse: collapseClassOverflow(classified.byClass.warehouse),
    tank: collapseClassOverflow(classified.byClass.tank),
    passenger: collapseClassOverflow(classified.byClass.passenger),
  };
  const keep = new Set();
  for (const cls of Object.keys(byClass)) {
    for (const item of byClass[cls]) keep.add(item.index);
  }
  const take = (list) => list.filter((item) => keep.has(item.index));

  const exports = take(classified.exports);
  const harvestShip = take(classified.harvestShip);
  const harvestTank = take(classified.harvestTank);
  const harvestPassenger = take(classified.harvestPassenger);
  const cityRoad = take(classified.cityRoad);
  const cityRail = take(classified.cityRail);
  const exportShipment = classified.exportShipment;

  const cx = logistics?.containerBerth?.x ?? 38.92;
  const berthZ = logistics?.containerBerth?.z ?? 22;
  const waypoints = containerApproachLane(cx, berthZ);
  const deckSlots = logistics?.containerBerth?.deckSlots ?? [];
  const liveCells = logistics?.liveStack?.cells ?? [];
  const exportCells = nextFreeBay3Cells(deckSlots, exports.length);
  const inboundCells = inboundBay3Cells(deckSlots, harvestShip.length);
  const yardHarvest = harvestShip.filter((item) => item.cls === 'yard');
  const stackCells = nextFreeLiveCells(liveCells, yardHarvest.length);

  const events = [];
  const assignments = [];
  let craneT = 0;
  let craneIndex = 0;
  let stackerT = 0;
  let stackerIndex = 0;
  let firstMotion = Infinity;
  const markMotion = (t) => {
    if (t < firstMotion) firstMotion = t;
  };

  const queueIfLate = (event) => {
    if (event.t0 >= BEAT_MAX_SECONDS - 0.5) {
      events.push(freezeEvent({ ...event, queued: true }));
      return true;
    }
    events.push(freezeEvent({ ...event, queued: false }));
    return false;
  };

  // ── 1. Load exports then depart ──
  markMotion(FIRST_MOTION_AT);
  if (exports.length) {
    queueIfLate({
      id: 'door-out',
      kind: 'door',
      t0: FIRST_MOTION_AT,
      t1: FIRST_MOTION_AT + DOOR_SECONDS,
      open: true,
    });
  }
  let loadDone = FIRST_MOTION_AT;
  // TASTE-R1 L3: the head of the lane takes one box at a time. The second export box used to ride in 0.85 s behind
  // the first and arrive while the first was still sitting at the head waiting for the spreader (two boxes 1.6 m
  // inside one another on the sweep). A box now arrives only after the crane has the previous one clear of the head.
  let headFreeAt = 0;
  for (let i = 0; i < exports.length; i += 1) {
    const item = exports[i];
    const cycle = craneCycleSeconds(craneIndex);
    const rideT1 = Math.max(FIRST_MOTION_AT + DOOR_SECONDS * 0.4 + i * 0.85 + BOX_RIDE_SECONDS, headFreeAt + 0.2);
    const emergeT0 = rideT1 - BOX_RIDE_SECONDS;
    const t0 = Math.max(craneT, rideT1);
    const t1 = t0 + cycle;
    headFreeAt = t0 + 0.5 * cycle;
    const cell = exportCells[i] ?? null;
    if (cell) {
      assignments.push({
        kind: 'ship', id: item.row?.id, x: cell.x, z: cell.z, tier: cell.tier, bay: HOLD_BAY,
      });
    }
    queueIfLate({
      id: `export-ride:${i}`,
      kind: 'box-ride',
      t0: emergeT0,
      t1: rideT1,
      dir: 'to-crane',
      boxId: item.row?.id ?? `export:${i}`,
      good: item.good,
      cls: item.cls,
      index: item.index,
    });
    const queued = queueIfLate({
      id: `crane-load:${i}`,
      kind: 'crane-load',
      resource: 'crane',
      t0,
      t1,
      boxId: item.row?.id ?? `export:${i}`,
      good: item.good,
      cell,
      index: item.index,
      craneIndex,
    });
    if (!queued) {
      craneT = t1;
      craneIndex += 1;
      loadDone = t1;
    }
  }
  if (exports.length) {
    queueIfLate({
      id: 'door-close-load',
      kind: 'door',
      t0: loadDone,
      t1: loadDone + DOOR_SECONDS,
      open: false,
    });
  }

  const departDur = shipDepartSeconds(0);
  const departT0 = exports.length ? loadDone + 0.2 : 0;
  const departT1 = departT0 + departDur;
  if (exports.length || harvestShip.length) {
    queueIfLate({
      id: 'ship-depart',
      kind: 'ship-depart',
      t0: departT0,
      t1: departT1,
      waypoints,
      duration: departDur,
    });
  }

  // ── TASTE-R1 LANE 3 — ONE FAIRWAY, ONE HULL AT A TIME. ──
  // The inbound hull used to leave the far end of the lane while the outbound
  // was still on it, so the two passed through each other head-on (2.2 m of
  // interpenetration on the motion sweep at t = 18.8 s). The outbound is faded
  // out by the end of its run; the inbound starts then. 40 m of separation at a
  // crossing is satisfied trivially because there is never a second hull.
  const arriveDur = shipArriveSeconds(0);
  const arriveT0 = harvestShip.length
    ? Math.max(departT1 + 0.4, FIRST_MOTION_AT)
    : Infinity;
  const arriveT1 = harvestShip.length ? arriveT0 + arriveDur : 0;
  const arriveStart = harvestShip.length ? arriveT1 - arriveDur : 0;
  if (harvestShip.length) {
    queueIfLate({
      id: 'ship-arrive',
      kind: 'ship-arrive',
      t0: arriveStart,
      t1: arriveT1,
      waypoints,
      duration: arriveDur,
      goods: harvestShip.map((item) => item.good),
    });
    markMotion(Math.min(FIRST_MOTION_AT, arriveStart));
  }

  // ── 2. Unload harvest ──
  let unloadT = harvestShip.length ? arriveT1 + 0.35 : craneT;
  craneT = Math.max(craneT, unloadT);
  let lastSetDown = unloadT;
  for (let i = 0; i < harvestShip.length; i += 1) {
    const item = harvestShip[i];
    const cycle = craneCycleSeconds(craneIndex);
    const t0 = craneT;
    const t1 = t0 + cycle;
    const cell = inboundCells[i] ?? null;
    const scale = cycle / CRANE_PHASE_SUM;
    const releaseT0 = t0 + (CRANE_PHASE_SUM - CRANE_PHASES.release) * scale;
    if (cell) {
      assignments.push({
        kind: 'ship-in', id: item.row?.id, x: cell.x, z: cell.z, tier: cell.tier, bay: HOLD_BAY,
      });
    }
    const queued = queueIfLate({
      id: `crane-unload:${i}`,
      kind: 'crane-unload',
      resource: 'crane',
      t0,
      t1,
      boxId: item.row?.id ?? `import:${i}`,
      good: item.good,
      cls: item.cls,
      cell,
      index: item.index,
      craneIndex,
      chipAt: releaseT0,
    });
    if (queued) continue;
    craneT = t1;
    craneIndex += 1;
    lastSetDown = releaseT0;
    queueIfLate({
      id: `chip-import:${i}`,
      kind: 'chip',
      t0: releaseT0,
      t1: releaseT0 + 0.05,
      boxId: item.row?.id,
      delivery: item.row,
      at: 'lane-head',
    });
    queueIfLate({
      id: `shift:${i}`,
      kind: 'conveyor-shift',
      t0: releaseT0,
      t1: releaseT0 + CONVEYOR_SHIFT_SECONDS,
    });
    if (item.cls === 'yard') {
      const stack = stackCells[yardHarvest.indexOf(item)] ?? null;
      const trip = Math.min(STACKER_ROUND_TRIP_MAX, stackerRoundTripSeconds(stackerIndex));
      const slots = laneSlots(logistics);
      const travelSlots = slots.length;
      const atLast = releaseT0 + CONVEYOR_SHIFT_SECONDS * travelSlots;
      const st0 = Math.max(stackerT, atLast);
      const st1 = st0 + trip;
      if (stack) {
        assignments.push({
          kind: 'stack', id: item.row?.id, x: stack.x, z: stack.z, tier: stack.placeTier,
        });
      }
      const sq = queueIfLate({
        id: `stacker:${i}`,
        kind: 'stacker',
        resource: 'stacker',
        t0: st0,
        t1: st1,
        boxId: item.row?.id ?? `import:${i}`,
        good: item.good,
        cell: stack,
        index: item.index,
      });
      if (!sq) {
        stackerT = st1;
        stackerIndex += 1;
      }
    } else if (item.cls === 'warehouse') {
      const slots = laneSlots(logistics);
      const atTurn = releaseT0 + CONVEYOR_SHIFT_SECONDS * slots.length + 0.4;
      queueIfLate({
        id: `shed-in:${i}`,
        kind: 'shed-in',
        t0: atTurn,
        t1: atTurn + 2.4,
        boxId: item.row?.id ?? `import:${i}`,
        good: item.good,
      });
    }
  }

  // ── Tanker ──
  if (harvestTank.length) {
    const tArrive = FIRST_MOTION_AT;
    const tBerth = tArrive + arriveDur;
    queueIfLate({
      id: 'tanker-arrive',
      kind: 'tanker-arrive',
      t0: tArrive,
      t1: tBerth,
      waypoints: tankerApproachLane(
        logistics?.tankerBerth?.x ?? -33,
        logistics?.tankerBerth?.z ?? 24,
      ),
    });
    markMotion(tArrive);
    const armDown0 = tBerth + 0.3;
    queueIfLate({
      id: 'arms-down',
      kind: 'arms',
      t0: armDown0,
      t1: armDown0 + 1.6,
      down: true,
    });
    let gaugeT = armDown0 + 1.6;
    for (let i = 0; i < harvestTank.length; i += 1) {
      queueIfLate({
        id: `gauge:${i}`,
        kind: 'gauge',
        t0: gaugeT,
        t1: gaugeT + 0.8,
        step: 1,
        good: harvestTank[i].good,
        delivery: harvestTank[i].row,
        chipAt: gaugeT + 0.4,
      });
      gaugeT += 0.85;
    }
    queueIfLate({
      id: 'arms-up',
      kind: 'arms',
      t0: gaugeT,
      t1: gaugeT + 1.4,
      down: false,
    });
    const td0 = gaugeT + 1.5;
    queueIfLate({
      id: 'tanker-depart',
      kind: 'tanker-depart',
      t0: td0,
      t1: td0 + departDur,
      waypoints: tankerApproachLane(
        logistics?.tankerBerth?.x ?? -33,
        logistics?.tankerBerth?.z ?? 24,
      ),
    });
  }

  // ── Passengers ──
  for (let i = 0; i < harvestPassenger.length; i += 1) {
    // One party on the walk at a time (TASTE-R1 L3): two groups sharing the 1.4 m of promenade walked through each other.
    const t0 = FIRST_MOTION_AT + i * 8.9;
    queueIfLate({
      id: `pax:${i}`,
      kind: 'people',
      t0,
      t1: t0 + 8.5,
      count: 3 + (i % 3),
      good: harvestPassenger[i].good,
    });
    markMotion(t0);
  }

  // ── Road ──
  const gateWorld = logistics?.truckGate?.gateWorld
    ?? { x: extent.x * 0.5, y: 0, z: 8 };
  for (let i = 0; i < cityRoad.length; i += 1) {
    const item = cityRoad[i];
    const start = options.resolveEndpoint?.(item.row, item.cls, i)
      ?? { x: gateWorld.x, z: gateWorld.z + 40 };
    const path = manhattanCorridorPath(start, gateWorld, extent);
    const haul = [
      { x: logistics?.truckGate?.x ?? cx + 61, z: logistics?.truckGate?.z ?? -25.1 },
      { x: logistics?.truckGate?.x ?? cx + 61, z: logistics?.truckGate?.haulRoadZ ?? -12 },
      { x: logistics?.shed?.doorWest?.x ?? cx + 41.1, z: logistics?.truckGate?.haulRoadZ ?? -12 },
      { x: logistics?.shed?.doorWest?.x ?? cx + 41.1, z: logistics?.shed?.doorWest?.z ?? -15.4 },
    ];
    const drive = truckTravelSeconds(polylineLength(path), i);
    const t0 = FIRST_MOTION_AT + i * 1.1;
    const tGate = t0 + drive;
    const tHaul = tGate + GATE_PAUSE_SECONDS;
    const tSpur = tHaul + HAUL_SECONDS;
    const trip = Math.min(STACKER_ROUND_TRIP_MAX, stackerRoundTripSeconds(stackerIndex));
    const st0 = Math.max(stackerT, tSpur);
    queueIfLate({
      id: `truck:${i}`,
      kind: 'truck',
      t0,
      t1: tSpur + trip + 6,
      boxId: item.row?.id ?? `road:${i}`,
      good: item.good,
      cls: item.cls,
      path,
      haul,
      drive,
      pause: GATE_PAUSE_SECONDS,
      haulSeconds: HAUL_SECONDS,
      start,
      gate: gateWorld,
      index: item.index,
    });
    markMotion(t0);
    const sq = queueIfLate({
      id: `stacker-road:${i}`,
      kind: 'stacker',
      resource: 'stacker',
      t0: st0,
      t1: st0 + trip,
      boxId: item.row?.id ?? `road:${i}`,
      good: item.good,
      from: 'tractor',
      to: 'turntable',
      index: item.index,
    });
    if (!sq) {
      stackerT = st0 + trip;
      stackerIndex += 1;
    }
  }

  // ── Rail ──
  if (cityRail.length) {
    const t0 = FIRST_MOTION_AT + 0.4;
    const tHead = t0 + RAIL_ENTRY_SECONDS;
    queueIfLate({
      id: 'rail-in',
      kind: 'rail',
      t0,
      t1: tHead + cityRail.length * 8 + RAIL_ENTRY_SECONDS,
      goods: cityRail.map((item) => item.good),
      enterX: logistics?.railHead?.enterX,
      headX: logistics?.railHead?.x,
      spurZ: logistics?.railHead?.spurZ ?? -28.4,
    });
    markMotion(t0);
    for (let i = 0; i < cityRail.length; i += 1) {
      const trip = Math.min(STACKER_ROUND_TRIP_MAX, stackerRoundTripSeconds(stackerIndex));
      const st0 = Math.max(stackerT, tHead + 0.6 + i * trip);
      const sq = queueIfLate({
        id: `stacker-rail:${i}`,
        kind: 'stacker',
        resource: 'stacker',
        t0: st0,
        t1: st0 + trip,
        boxId: cityRail[i].row?.id ?? `rail:${i}`,
        good: cityRail[i].good,
        from: 'wagon',
        to: 'lane',
        wagon: i % 2,
        index: cityRail[i].index,
      });
      if (!sq) {
        stackerT = st0 + trip;
        stackerIndex += 1;
      }
    }
  }

  // ── Export cash at admin ──
  for (let i = 0; i < exportShipment.length; i += 1) {
    const t0 = FIRST_MOTION_AT + 0.8 + i * 0.35;
    queueIfLate({
      id: `chip-export:${i}`,
      kind: 'chip',
      t0,
      t1: t0 + 0.05,
      delivery: exportShipment[i].row,
      at: 'admin',
    });
  }

  const holds = options.holds ?? [];
  if (holds.length) {
    queueIfLate({
      id: 'port-full-plate',
      kind: 'plate',
      t0: FIRST_MOTION_AT,
      t1: FIRST_MOTION_AT + PORT_FULL_PLATE_SECONDS,
      copy: holds[0]?.body ?? 'PORT FULL',
    });
    queueIfLate({
      id: 'held-ship',
      kind: 'held-ship',
      t0: FIRST_MOTION_AT,
      t1: BEAT_MAX_SECONDS,
      waypoints: containerApproachWaypoints(cx, 140),
    });
    markMotion(FIRST_MOTION_AT);
  }

  if (options.reducedMotion) {
    for (let i = 0; i < events.length; i += 1) {
      const e = events[i];
      if (e.kind === 'chip' || e.kind === 'plate' || e.kind === 'gauge') continue;
      events[i] = freezeEvent({
        ...e,
        kind: e.kind === 'crane-unload' || e.kind === 'crane-load' || e.kind === 'stacker'
          || e.kind === 'shed-in' || e.kind === 'box-ride'
          ? 'reduced-fade'
          : e.kind === 'ship-arrive' || e.kind === 'ship-depart' || e.kind === 'tanker-arrive'
            ? 'reduced-ship'
            : e.kind,
        t0: Math.min(e.t0, 0.4),
        t1: Math.min(e.t1, 1.2),
      });
    }
  }

  const playable = events.filter((e) => !e.queued);
  const duration = playable.reduce((m, e) => Math.max(m, e.t1), 0);
  const playableDuration = Math.min(BEAT_MAX_SECONDS, duration);
  if (firstMotion === Infinity) firstMotion = 0;

  return Object.freeze({
    events: Object.freeze(events),
    assignments: Object.freeze(assignments),
    exports,
    harvestShip,
    harvestTank,
    harvestPassenger,
    cityRoad,
    cityRail,
    exportShipment,
    firstMotion,
    duration,
    playableDuration,
    queued: Object.freeze(events.filter((e) => e.queued)),
    waypoints,
    cx,
    berthZ,
    exclusive: {
      spreader: !spreaderOverlaps(events),
      stacker: !stackerOverlaps(events),
      cells: cellsExclusive(assignments),
    },
  });
}

export function demoBeatRows() {
  return Object.freeze([
    Object.freeze({
      id: 'h-yard-0', good: 'timber', dir: 'in', via: 'ship', cause: 'harvest',
    }),
    Object.freeze({
      id: 'h-yard-1', good: 'steel', dir: 'in', via: 'ship', cause: 'harvest',
    }),
    Object.freeze({
      id: 'h-wh-0', good: 'chips', dir: 'in', via: 'ship', cause: 'harvest',
    }),
    Object.freeze({
      id: 'h-wh-1', good: 'robots', dir: 'in', via: 'ship', cause: 'harvest',
    }),
    Object.freeze({
      id: 'h-tank-0', good: 'oil', dir: 'in', via: 'ship', cause: 'harvest',
    }),
    Object.freeze({
      id: 'h-tank-1', good: 'lng', dir: 'in', via: 'ship', cause: 'harvest',
    }),
    Object.freeze({
      id: 'h-pax-0', good: 'people', dir: 'in', via: 'ship', cause: 'harvest',
    }),
    Object.freeze({
      id: 'h-pax-1', good: 'tourists', dir: 'in', via: 'ship', cause: 'harvest',
    }),
    Object.freeze({
      id: 'x-0', good: 'wine', dir: 'out', via: 'ship', cause: 'export-departure',
    }),
    Object.freeze({
      id: 'x-1', good: 'machinery', dir: 'out', via: 'ship', cause: 'export-departure',
    }),
    Object.freeze({
      id: 'road-0', good: 'modular', dir: 'in', via: 'road', cause: 'city-admission',
    }),
    Object.freeze({
      id: 'rail-0', good: 'timber', dir: 'in', via: 'road', cause: 'city-admission',
    }),
    Object.freeze({
      id: 'wire-0', good: 'wine', dir: 'out', via: 'ship', cause: 'export-shipment',
    }),
  ]);
}

export function packedBeatRows() {
  const rows = [];
  const yard = ['timber', 'steel', 'copper', 'iron', 'nickel', 'aluminium'];
  const warehouse = ['chips', 'robots', 'food', 'wine'];
  for (let i = 0; i < 8; i += 1) {
    rows.push({
      id: `imp-y-${i}`, good: yard[i % yard.length], dir: 'in', via: 'ship', cause: 'harvest',
    });
  }
  for (let i = 0; i < 4; i += 1) {
    rows.push({
      id: `imp-w-${i}`, good: warehouse[i % warehouse.length], dir: 'in', via: 'ship', cause: 'harvest',
    });
  }
  for (let i = 0; i < 4; i += 1) {
    rows.push({
      id: `exp-${i}`, good: warehouse[i % warehouse.length], dir: 'out', via: 'ship',
      cause: 'export-departure',
    });
  }
  rows.push(
    { id: 'rd-0', good: 'modular', dir: 'in', via: 'road', cause: 'city-admission' },
    { id: 'rd-1', good: 'furniture', dir: 'in', via: 'road', cause: 'city-admission' },
    { id: 'rd-2', good: 'tiles', dir: 'in', via: 'road', cause: 'city-admission' },
    { id: 'rl-0', good: 'timber', dir: 'in', via: 'road', cause: 'city-admission' },
    { id: 'rl-1', good: 'food', dir: 'in', via: 'road', cause: 'city-admission' },
  );
  return rows;
}

export function phaseAtTime(plan, time) {
  const t = Number.isFinite(time) ? time : 0;
  const kinds = (kind) => (plan?.events ?? []).filter((e) => e.kind === kind && !e.queued);
  const active = (kind) => kinds(kind).some((e) => t >= e.t0 && t < e.t1);
  if (t <= 0) return 'idle';
  if (active('ship-depart')) return 'depart';
  if (active('ship-arrive') || active('tanker-arrive')) return 'arrive';
  if (active('crane-load') || active('box-ride')) return 'load';
  if (active('crane-unload') || active('conveyor-shift') || active('stacker') || active('shed-in')) {
    return 'unload';
  }
  if (active('truck')) return 'road';
  if (active('rail')) return 'rail';
  if (active('people')) return 'passenger';
  if (active('plate') || active('held-ship')) return 'port-full';
  const maxT = plan?.playableDuration ?? 0;
  if (t >= maxT) return 'done';
  return 'idle';
}

export function isCargoName(name) {
  const n = String(name ?? '');
  return n.startsWith('container:') || n.startsWith('anim-box:');
}

function cargoOwned(node) {
  let o = node;
  let hops = 0;
  while (o && hops < 8) {
    if (isCargoName(o.name)) return true;
    o = o.parent;
    hops += 1;
  }
  return false;
}

/** First-touch authored material state. Never recache after a fade. */
const _matBase = new WeakMap();

function snapshotMatBase(m) {
  return {
    transparent: Boolean(m.transparent),
    opacity: Number.isFinite(m.opacity) ? m.opacity : 1,
    depthWrite: m.depthWrite !== false,
    depthTest: m.depthTest !== false,
    alphaTest: Number.isFinite(m.alphaTest) ? m.alphaTest : 0,
    blending: m.blending,
  };
}

function cacheMatBase(m) {
  if (!m || _matBase.has(m)) return;
  _matBase.set(m, snapshotMatBase(m));
}

function restoreMatBase(m) {
  const base = _matBase.get(m);
  if (!m || !base) return;
  m.transparent = base.transparent;
  m.opacity = base.opacity;
  m.depthWrite = base.depthWrite;
  m.depthTest = base.depthTest;
  m.alphaTest = base.alphaTest;
  m.blending = base.blending;
}

function applyFadeToMat(m, fade) {
  if (!m) return;
  cacheMatBase(m);
  const base = _matBase.get(m);
  const f = clamp01(fade);
  if (f >= 0.999) {
    restoreMatBase(m);
    return;
  }
  m.opacity = base.opacity * f;
  // Authored alpha masks stay transparent at every f. Never write blending/alphaTest.
  m.transparent = base.transparent || f < 0.999;
  if (base.transparent === true && base.opacity < 0.999) m.transparent = true;
  m.depthWrite = Boolean(base.depthWrite) && f >= 0.999;
}

export function uniquifyMaterials(root) {
  if (!root) return;
  root.traverse((ch) => {
    if (!ch.isMesh || !ch.material) return;
    ch.material = Array.isArray(ch.material)
      ? ch.material.map((m) => m.clone())
      : ch.material.clone();
    const list = Array.isArray(ch.material) ? ch.material : [ch.material];
    for (const m of list) cacheMatBase(m);
  });
}

function pinCargoOpaque(ch) {
  const list = Array.isArray(ch.material) ? ch.material : [ch.material];
  for (const m of list) {
    if (!m || !(m.opacity < 1)) continue;
    m.opacity = 1;
    m.transparent = false;
    m.depthWrite = true;
  }
}

function restoreCargoOpaque(box) {
  if (!box) return;
  box.traverse((ch) => {
    if (!ch.isMesh) return;
    const list = Array.isArray(ch.material) ? ch.material : [ch.material];
    for (const m of list) {
      if (!m) continue;
      m.transparent = false;
      m.opacity = 1;
      m.depthWrite = true;
    }
  });
  box.visible = true;
}

function dropCargoFrom(root) {
  if (!root || root.userData?.cargoDropped) return 0;
  if (!root.userData) root.userData = {};
  root.userData.cargoDropped = true;
  let n = 0;
  root.traverse((ch) => {
    if (ch === root || !isCargoName(ch.name)) return;
    if (n < _dropList.length) _dropList[n] = ch;
    n += 1;
  });
  const count = Math.min(n, _dropList.length);
  for (let i = 0; i < count; i += 1) {
    const ch = _dropList[i];
    _dropList[i] = null;
    if (!ch) continue;
    restoreCargoOpaque(ch);
    ch.visible = false;
    ch.parent?.remove(ch);
  }
  return count;
}

const DECK_CARGO_NAME = /^fringe:ship:container:cargo(?::|$)/;

function syncDeckCargoGeometry(mesh, opaque) {
  if (!DECK_CARGO_NAME.test(mesh?.name || '')) return;
  const next = deckCargoGeometry(mesh.geometry, opaque);
  if (next && next !== mesh.geometry) mesh.geometry = next;
}

export function setTreeOpacity(root, opacity) {
  const value = clamp01(opacity);
  const deckOpaque = value >= 0.999;
  if (value < 0.999) dropCargoFrom(root);
  root?.traverse((ch) => {
    if (!ch.isMesh) return;
    syncDeckCargoGeometry(ch, deckOpaque);
    if (cargoOwned(ch)) {
      pinCargoOpaque(ch);
      return;
    }
    const list = Array.isArray(ch.material) ? ch.material : [ch.material];
    const mat0 = list[0];
    const multiply = mat0 && mat0.blending === THREE.MultiplyBlending;
    if (multiply) {
      ch.visible = value >= 0.999;
      return;
    }
    for (const m of list) applyFadeToMat(m, value);
  });
  if (root) root.visible = value > 0.02;
}

function meshIsCargoGhost(ch) {
  if (!ch?.isMesh) return false;
  if (!cargoOwned(ch)) return false;
  const list = Array.isArray(ch.material) ? ch.material : [ch.material];
  for (const m of list) {
    if (m && m.opacity < 1) return true;
  }
  return false;
}

/** Meshes named `container:` that are translucent — must be empty after a beat. */
export function cargoGhostsUnder(root) {
  const ghosts = [];
  root?.traverse((ch) => {
    if (meshIsCargoGhost(ch)) ghosts.push(ch);
  });
  return ghosts;
}

export function countCargoGhosts(root) {
  let n = 0;
  root?.traverse((ch) => {
    if (meshIsCargoGhost(ch)) n += 1;
  });
  return n;
}

/**
 * Visible lee/shadow meshes inside the berth footprint at y < 0.5.
 * Empty-berth pin: this list must be empty when no hull is at the cope.
 */
function berthDecalHit(ch, bx, bz, radius) {
  if (!ch?.isMesh || ch.visible === false) return false;
  let named = /lee|shadow/i.test(String(ch.name ?? ''));
  let p = ch.parent;
  while (p) {
    if (p.visible === false) return false;
    if (/lee|shadow/i.test(String(p.name ?? ''))) named = true;
    p = p.parent;
  }
  if (!named) return false;
  const pos = ch.getWorldPosition ? ch.getWorldPosition(_v3) : ch.position;
  const y = pos?.y ?? ch.position?.y ?? 0;
  const x = pos?.x ?? ch.position?.x ?? 0;
  const z = pos?.z ?? ch.position?.z ?? 0;
  if (y >= 0.5) return false;
  return Math.hypot(x - bx, z - bz) <= radius;
}

export function visibleBerthDecals(root, berthWorld, radius = 22) {
  const hits = [];
  const bx = berthWorld?.x ?? 0;
  const bz = berthWorld?.z ?? 0;
  root?.traverse((ch) => {
    if (berthDecalHit(ch, bx, bz, radius)) hits.push(ch);
  });
  return hits;
}

export function countBerthDecals(root, berthWorld, radius = 22) {
  let n = 0;
  const bx = berthWorld?.x ?? 0;
  const bz = berthWorld?.z ?? 0;
  root?.traverse((ch) => {
    if (berthDecalHit(ch, bx, bz, radius)) n += 1;
  });
  return n;
}

function overflowBadgeTexture(count) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#f5e4a7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#18231d';
  ctx.fillRect(0, 0, canvas.width, 8);
  ctx.fillRect(0, canvas.height - 8, canvas.width, 8);
  ctx.font = '900 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`+${count}`, canvas.width * 0.5, canvas.height * 0.53);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function stampBox(good, name, overflow) {
  const raw = name || good || 'box';
  const boxName = isCargoName(raw) ? raw : `container:${raw}`;
  const box = makeStampedContainer(good && good !== 'overflow' ? good : 'timber', { name: boxName });
  uniquifyMaterials(box);
  restoreCargoOpaque(box);
  if (overflow > 0) {
    const tex = overflowBadgeTexture(overflow);
    if (tex) {
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 0.9),
        new THREE.MeshBasicMaterial({
          map: tex, transparent: true, depthWrite: false, toneMapped: false,
        }),
      );
      plate.position.set(0, BOX.h * 0.55, BOX.d * 0.52);
      noPick(plate);
      box.add(plate);
    }
  }
  box.userData.good = good;
  box.castShadow = true;
  return box;
}

function hideBay3Instances(bob) {
  const slots = bob?.userData?.deckSlots ?? [];
  const bay3 = slots.filter((s) => s.bay === HOLD_BAY && s.occupied);
  if (!bay3.length || !bob) return;
  bob.traverse((ch) => {
    if (!ch.isInstancedMesh) return;
    const arr = ch.instanceMatrix.array;
    let dirty = false;
    for (let i = 0; i < ch.count; i += 1) {
      _m4.fromArray(arr, i * 16);
      _m4.decompose(_v1, _q1, _s1);
      for (const cell of bay3) {
        if (Math.hypot(_v1.x - cell.x, _v1.z - cell.z) < 0.55 && Math.abs(_v1.y - cell.y) < 0.8) {
          _s1.set(0, 0, 0);
          _m4.compose(_v1, _q1, _s1);
          _m4.toArray(arr, i * 16);
          dirty = true;
          break;
        }
      }
    }
    if (dirty) ch.instanceMatrix.needsUpdate = true;
  });
  // ── TASTE-R1 LANE 3 — THE BAY'S LASHING RODS GO WITH ITS CARGO. ──
  // Each bay end carries a pair of lashing rods that lean to within 0.10 m of the stowed box's face. With the bay
  // emptied for the beat's inbound boxes, the spreader and each lowered box passed through those rods (0.3 to 0.45 m
  // on the motion sweep); an empty bay has no lashings to take up.
  bob.traverse((ch) => {
    if (!ch.userData?.bayEnd || !Number.isFinite(ch.userData.cargoFaceX)) return;
    for (const cell of bay3) {
      if (Math.abs(ch.userData.cargoFaceX - cell.x) < BOX.w * 0.5 + 0.05) { ch.visible = false; break; }
    }
  });
}

/**
 * ── TASTE-R1 WAVE 3 LANE B — THE LASHING RODS UNDER THE SPREADER GO WITH THE BOX IT LIFTS. ──
 * The inbound boxes are picked at the gantry's own x, which on the berthed hull is local x ~ 0 (bay 2's rods),
 * not at the home cell's x (bay 3, +4.9 m). `hideBay3Instances` hides the rods of bay 3's own faces; the box the
 * crane lifts and swings across the deck at bay 2 passed 0.33 m into bay 2's leaning end rods on the motion sweep
 * (`container:h-yard-0` and `-1` against `lashing-rod:8`, t = 26.3 and 31.7 s). A rod whose span reaches into the
 * lifted box's footprint (plus a 0.2 m keep-out) is hidden on the inbound hull: nothing is lashed against a box
 * that has just been unlocked and is being swung out.
 */
function hideRodsUnderLift(bob, liftX) {
  if (!bob || !Number.isFinite(liftX)) return 0;
  const lo = liftX - BOX.w * 0.5 - 0.2;
  const hi = liftX + BOX.w * 0.5 + 0.2;
  let hidden = 0;
  bob.traverse((ch) => {
    if (!ch.userData?.bayEnd || !Number.isFinite(ch.userData.fromX) || !Number.isFinite(ch.userData.toX)) return;
    const a = Math.min(ch.userData.fromX, ch.userData.toX);
    const b = Math.max(ch.userData.fromX, ch.userData.toX);
    if (b >= lo && a <= hi) { ch.visible = false; hidden += 1; }
  });
  return hidden;
}

function setHang(gantry, hang) {
  if (!gantry?.spreader) return;
  const h = Math.max(gantry.hangMin ?? 1.2, Math.min(gantry.hangMax ?? 28, hang));
  gantry.spreader.position.y = -h;
  for (const fall of gantry.falls ?? []) {
    fall.scale.y = h;
    fall.position.y = -0.4 - h * 0.5;
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function sampleWorldPath(path, u) {
  if (!path?.length) return { x: 0, z: 0, yaw: 0 };
  const pose = samplePolyline(path, easeInOutCubic(u));
  return pose;
}

/**
 * Live director. Binds to `fringe:port` logistics and plays one beat.
 */
export class PortLogisticsDirector {
  constructor(options = {}) {
    this.reducedMotion = Boolean(options.reducedMotion);
    this.onChip = options.onChip ?? null;
    this.resolveEndpoint = options.resolveEndpoint ?? null;
    this.port = null;
    this.logistics = null;
    this.animRoot = null;
    this.stackGroup = null;
    this.plan = null;
    this.time = 0;
    this.playing = false;
    this.demo = false;
    this.fired = new Set();
    this.boxes = new Map();
    this.lane = [];
    this.persistentStack = [];
    this.rest = null;
    this.outbound = null;
    this.inbound = null;
    this.tanker = null;
    this.heldShip = null;
    this.trucks = [];
    this.consist = null;
    this.people = [];
    this.wake = null;
    this.plate = null;
    this.hose = null;
    this.puffs = [];
    this.mooring = [];
    this.gatePlate = null;
    this.gateHasBoom = false;
    this.gateBoom = null;
    this.gateBoomRest = 0;
    this.berthLee = [];
    this.twistLamps = [];
    this.twistLampsNamed = false;
    this._outboundDecor = null;
    this._inboundDecor = null;
    this._tankerDecor = null;
    this._subject = { x: 0, y: 0, z: 0, name: null };
    this._camera = {
      target: { x: 0, y: 0, z: 0 },
      azimuth: PORT_CAMERA_SEA_AZIMUTH,
      polar: 28,
      distance: 58,
      phase: 'idle',
    };
    this.doorRestY = 0;
    this.doorTravel = 3.6;
    this.gaugeRest = [];
    this.armRest = [];
    this.tugRest = null;
    this._craneHang = null;
    this._craneTrolleyZ = null;
    this._swingAmp = 0;
    this._swingTarget = 0;
    this._swingStopT = null;
    this._gateOpen = 0;
    this._collarRest = [];
    this._bobPitch = [];
    this._truckSnap = [];
    this.statusSnapshot = {
      phase: 'idle',
      time: 0,
      liveCounts: { boxes: 0, trucks: 0, wagons: 0, people: 0 },
      trucks: [],
      laneSlots: [],
      stackFill: { occupied: 0, capacity: 0, cells: [] },
      queued: 0,
      firstMotionAt: FIRST_MOTION_AT,
    };
  }

  attach(port) {
    this.port = port ?? null;
    this.logistics = port?.userData?.logistics ?? null;
    if (!this.logistics) return false;
    const terminal = port.getObjectByName('fringe:port-terminal') ?? port;
    if (!this.animRoot) {
      this.animRoot = new THREE.Group();
      this.animRoot.name = 'fringe:port-logistics-anim';
      terminal.add(this.animRoot);
    }
    if (!this.stackGroup) {
      this.stackGroup = new THREE.Group();
      this.stackGroup.name = 'fringe:port-live-anim-stack';
      terminal.add(this.stackGroup);
    }
    const hold = this.logistics.gantries?.find((g) => g.id === 'hold')
      ?? this.logistics.gantries?.[0];
    if (hold?.cargoMount) {
      for (const ch of hold.cargoMount.children) ch.visible = false;
    }
    const door = this.logistics.shed?.doorMesh;
    this.doorRestY = door?.position.y ?? 0;
    // ── P16-PM2 (PM3 hand-off, PM3-RESIDUAL 2) — A LEAF CANNOT TRAVEL FURTHER
    // THAN ITS OWN HEIGHT. ──
    // The lift was a hard-coded 3.6 m on a leaf PM3 has since seated at 3.85 m,
    // and a roller shutter runs up INTO a hood: usable travel is the leaf height
    // less the head clearance the hood needs, about 0.7 · H. At 3.6 m the leaf
    // rose 0.9 m past its own head and only the canopy (2.1 m deep, at the play
    // poses' 26–34° polar) hid it. The clamp is derived from the leaf the scene
    // actually built, so it cannot go stale when the shed is resized.
    let leafH = 0;
    if (door?.geometry) {
      if (!door.geometry.boundingBox) door.geometry.computeBoundingBox();
      const bb = door.geometry.boundingBox;
      if (bb && Number.isFinite(bb.max.y)) leafH = (bb.max.y - bb.min.y) * (door.scale?.y ?? 1);
    }
    this.doorTravel = leafH > 0.2 ? Math.min(3.6, leafH * 0.7) : 3.6;
    this.gaugeRest = (this.logistics.tankFarm?.tanks ?? []).map((tk) => ({
      mesh: tk.gauge,
      y: tk.gauge?.position.y ?? 0,
      sy: tk.gauge?.scale.y ?? 1,
    }));
    this.armRest = (this.logistics.tankFarm?.loadingArms ?? []).map((arm) => ({
      inboard: arm.inboard?.rotation.x ?? 0,
      outboard: arm.outboard?.rotation.x ?? 0,
      arm,
    }));
    const tug = port.getObjectByName('fringe:port-tug:1');
    if (tug) {
      this.tugRest = { obj: tug, x: tug.position.x, z: tug.position.z, y: tug.position.y };
    }
    this._cacheMooring(port);
    this._findSpreaderLamps();
    this._inspectGate(port);
    this._bindBerthLee(port);
    const containerHolder = this.logistics.containerBerth?.holder;
    const tankerHolder = this.logistics.tankerBerth?.holder;
    if (containerHolder) this._outboundDecor = this._bindHullDecor(containerHolder, 'container');
    if (tankerHolder) this._tankerDecor = this._bindHullDecor(tankerHolder, 'tanker');
    const stacker = this.logistics.reachStacker;
    this.rest = {
      trolleyZ: hold?.trolley?.position.z ?? 0,
      // TASTE-R1 L3: the rest hang is the parked hang (upper stop), not the 9 m the rig was built with; a crane op
      // eases down from it and the hoist returns to it between ops.
      hang: hold ? (hold.hangMin ?? 1.2) + 0.1 : 9,
      hold,
      stackerHome: stacker?.home
        ?? { x: stacker?.group?.position.x ?? 0, z: stacker?.group?.position.z ?? 0, yaw: 0 },
      outboundPos: this.logistics.containerBerth?.holder?.position.clone?.() ?? null,
      outboundQuat: this.logistics.containerBerth?.holder?.quaternion.clone?.() ?? null,
      tankerPos: this.logistics.tankerBerth?.holder?.position.clone?.() ?? null,
    };
    return true;
  }

  _toWorld(x, y, z) {
    return this.logistics?.toWorld?.(x, y, z) ?? { x, y, z };
  }

  _setHolderLocal(holder, x, z, yOff = 0, pitch = 0, heading = 0) {
    if (!holder || !this.logistics) return;
    const w = this._toWorld(x, 0, z);
    holder.position.set(w.x, w.y + yOff, w.z);
    // The hull turns about its own centre by `heading` from the berthed pose (the lane's heading, see
    // `shipLane`). Through the QUATERNION, never the Euler y: a holder that has been through
    // `quaternion.copy` reads back as (pi, ~0, pi) and `rotation.y += h` then turns it the wrong way round
    // (the sweep caught the departing hull mirrored through the barge for exactly that reason).
    if (!holder.userData.restQuat) holder.userData.restQuat = holder.quaternion.clone();
    _headQ.setFromAxisAngle(_Y_AXIS, heading);
    holder.quaternion.copy(_headQ).multiply(holder.userData.restQuat);
    const bob = holder.userData?.bob ?? holder.children?.[0];
    if (bob && bob.rotation) bob.rotation.z = pitch;
  }

  _cacheMooring(port) {
    this.mooring = [];
    port?.traverse((ch) => {
      if (!ch.isMesh || !ch.geometry) return;
      const params = ch.geometry.parameters;
      if (ch.geometry.type !== 'CylinderGeometry') return;
      if (Math.abs((params?.radiusTop ?? 0) - MOORING_LINE_RADIUS) > 1e-4) return;
      if (Math.abs((params?.radiusBottom ?? 0) - MOORING_LINE_RADIUS) > 1e-4) return;
      if (ch.position.y < 0.6 || ch.position.y > 5.5) return;
      this.mooring.push({
        mesh: ch,
        restY: ch.position.y,
        restSy: ch.scale.y,
      });
    });
  }

  _inspectGate(port) {
    const gate = port?.getObjectByName('fringe:port-gate');
    const namedBoom = this.logistics?.truckGate?.boom
      ?? port?.getObjectByName('fringe:port-gate:boom')
      ?? gate?.getObjectByName?.('fringe:port-gate:boom')
      ?? null;
    this.gateBoom = namedBoom;
    this.gateHasBoom = Boolean(namedBoom);
    if (!this.gateBoom && gate) {
      gate.traverse((ch) => {
        if (this.gateBoom || ch === gate) return;
        const n = String(ch.name ?? '');
        if (/boom|barrier|arm/i.test(n)) {
          this.gateBoom = ch;
          this.gateHasBoom = true;
        }
      });
    }
    if (this.gateBoom) this.gateBoomRest = this.gateBoom.rotation?.z ?? 0;
  }

  _findSpreaderLamps() {
    this.twistLamps = [];
    this.twistLampsNamed = false;
    const g = this._holdGantry();
    const id = g?.id ?? 'hold';
    const named = [];
    for (let i = 0; i < 2; i += 1) {
      const key = `fringe:port-gantry:${id}:lamp:${i}`;
      const obj = g?.spreader?.getObjectByName(key)
        ?? this.port?.getObjectByName(key)
        ?? null;
      if (obj) named.push(obj);
    }
    const source = named.length ? named : [];
    if (named.length) this.twistLampsNamed = true;
    if (!named.length) {
      g?.spreader?.traverse((ch) => {
        if (!ch.isMesh || !ch.geometry) return;
        const nm = /lamp|twist|lock/i.test(String(ch.name ?? ''));
        const sphere = ch.geometry.type === 'SphereGeometry'
          && Math.abs((ch.geometry.parameters?.radius ?? 0) - 0.11) < 0.03;
        if (!nm && !sphere) return;
        if (nm) this.twistLampsNamed = true;
        source.push(ch);
      });
    }
    for (const ch of source) {
      if (ch.material && !ch.userData.animLampMat) {
        ch.material = Array.isArray(ch.material)
          ? ch.material.map((m) => m.clone())
          : ch.material.clone();
        ch.userData.animLampMat = true;
      }
      this.twistLamps.push(ch);
    }
  }

  _bindHullDecor(holder, shipId) {
    if (!holder) return null;
    const bob = holder.userData?.bob ?? holder.children?.[0] ?? holder;
    const prefix = `fringe:ship:${shipId}`;
    const berth = holder === this.logistics?.tankerBerth?.holder
      ? this.logistics?.tankerBerth
      : holder === this.logistics?.containerBerth?.holder
        ? this.logistics?.containerBerth
        : null;
    const namedShadow = berth?.shadow
      ?? holder.getObjectByName(`${prefix}:shadow`)
      ?? bob.getObjectByName?.(`${prefix}:shadow`)
      ?? null;
    const namedSkin = berth?.skin
      ?? holder.getObjectByName(`${prefix}:skin`)
      ?? bob.getObjectByName?.(`${prefix}:skin`)
      ?? null;
    const namedWake = berth?.wake
      ?? holder.getObjectByName(`${prefix}:wake`)
      ?? bob.getObjectByName?.(`${prefix}:wake`)
      ?? null;
    const shadow = namedShadow ?? this._findMultiplyDecal(bob);
    const skin = namedSkin
      ?? bob.getObjectByName?.(`${prefix}:collar`)
      ?? holder.getObjectByName(`${prefix}:collar`)
      ?? null;
    const wake = namedWake
      ?? holder.getObjectByName('fringe:port-anim-wake')
      ?? bob.getObjectByName?.('fringe:port-anim-wake')
      ?? null;
    for (const node of [shadow, skin, wake]) {
      if (!node || !bob || node === bob || node === holder) continue;
      if (node.parent !== bob) {
        try { bob.attach(node); } catch { /* keep world pose if attach fails */ }
      }
    }
    return {
      holder,
      bob,
      shadow,
      skin,
      wake,
      sx: 0,
      sz: 0,
      hx: 0,
      hz: 0,
      primed: false,
      warned: false,
    };
  }

  _findMultiplyDecal(root) {
    let found = null;
    root?.traverse((ch) => {
      if (found || !ch.isMesh) return;
      const mat = Array.isArray(ch.material) ? ch.material[0] : ch.material;
      if (mat && mat.blending === THREE.MultiplyBlending) found = ch;
    });
    return found;
  }

  _bindBerthLee(port) {
    this.berthLee = [];
    const named = this.logistics?.containerBerth?.lee
      ?? port?.getObjectByName('fringe:port-lee:container')
      ?? null;
    if (named) this.berthLee.push(named);
    const berth = this.logistics?.containerBerth;
    const bw = berth ? this._toWorld(berth.x, 0, berth.z) : { x: 0, y: 0, z: 0 };
    port?.traverse((ch) => {
      if (!ch.isMesh) return;
      const n = String(ch.name ?? '');
      if (!/^fringe:port-lee:/.test(n) && !/lee/i.test(n)) return;
      if (this.berthLee.includes(ch)) return;
      ch.getWorldPosition(_v1);
      if (_v1.y >= 0.5) return;
      if (Math.hypot(_v1.x - bw.x, _v1.z - bw.z) > 28) return;
      this.berthLee.push(ch);
    });
    if (!this.berthLee.length) {
      port?.traverse((ch) => {
        if (!ch.isMesh || !ch.geometry) return;
        const n = String(ch.name ?? '');
        if (n.startsWith('fringe:ship:')) return;
        const ellipse = ch.geometry.type === 'CircleGeometry'
          || ch.geometry.type === 'RingGeometry'
          || (ch.geometry.type === 'PlaneGeometry'
            && Math.abs((ch.scale?.x ?? 1) - (ch.scale?.y ?? 1)) > 2);
        if (!ellipse) return;
        ch.getWorldPosition(_v1);
        if (_v1.y >= 0.5 || _v1.y < -0.5) return;
        if (Math.hypot(_v1.x - bw.x, _v1.z - bw.z) > 22) return;
        this.berthLee.push(ch);
      });
    }
    for (const node of this.berthLee) {
      node.traverse?.((ch) => {
        if (!ch.isMesh || !ch.material || ch.userData.animLeeMat) return;
        ch.material = Array.isArray(ch.material)
          ? ch.material.map((m) => m.clone())
          : ch.material.clone();
        ch.userData.animLeeMat = true;
        const list = Array.isArray(ch.material) ? ch.material : [ch.material];
        for (const m of list) cacheMatBase(m);
      });
    }
  }

  _checkDecorTravel(decor) {
    if (!decor?.holder) return;
    decor.holder.getWorldPosition(_v1);
    if (!decor.primed) {
      decor.hx = _v1.x;
      decor.hz = _v1.z;
      if (decor.shadow?.getWorldPosition) {
        decor.shadow.getWorldPosition(_v2);
        decor.sx = _v2.x;
        decor.sz = _v2.z;
      }
      decor.primed = true;
      return;
    }
    const hdx = _v1.x - decor.hx;
    const hdz = _v1.z - decor.hz;
    if (Math.hypot(hdx, hdz) < 0.45) return;
    decor.hx = _v1.x;
    decor.hz = _v1.z;
    const nodes = [decor.shadow, decor.skin, decor.wake];
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (!node?.getWorldPosition) continue;
      node.getWorldPosition(_v2);
      if (i === 0) {
        const moved = Math.hypot(_v2.x - decor.sx, _v2.z - decor.sz);
        if (moved < 0.2 && !decor.warned) {
          decor.warned = true;
          console.warn('P13 C3: vessel shadow/skin/wake did not travel with hull', node.name || '(unnamed)');
        }
        decor.sx = _v2.x;
        decor.sz = _v2.z;
      }
    }
  }

  _syncBerthLee(occupied) {
    const fade = occupied ? 1 : 0;
    for (const node of this.berthLee) {
      if (!node) continue;
      node.visible = fade > 0.02;
      node.traverse?.((ch) => {
        if (!ch.isMesh) return;
        const mat = Array.isArray(ch.material) ? ch.material[0] : ch.material;
        if (mat && mat.blending === THREE.MultiplyBlending) {
          ch.visible = fade >= 0.999;
          return;
        }
        applyFadeToMat(mat, fade);
      });
    }
  }

  _hullAtBerth(holder) {
    if (!holder || holder.visible === false) return false;
    const berth = this.logistics?.containerBerth;
    if (!berth) return false;
    const w = this._toWorld(berth.x, 0, berth.z);
    return Math.hypot(holder.position.x - w.x, holder.position.z - w.z) < 18;
  }

  _setMooringSlack(slackU) {
    const u = clamp01(slackU);
    for (const row of this.mooring) {
      row.mesh.position.y = row.restY - MOORING_SLACK_DROP * u;
      row.mesh.scale.y = row.restSy * (1 + (MOORING_SAG_MUL - 1) * u);
      // P16-PM2: at full slack the ship has singled up and let go. The lines
      // used to stay strung from the quay to an empty berth for the whole
      // departure — invisible at 55 mm, obvious at 140 mm.
      row.mesh.visible = u < 0.92;
    }
  }

  _setCollarSpeed(holder, speed01) {
    if (!holder) return;
    const s = collarScaleForSpeed(speed01);
    holder.traverse((ch) => {
      if (!ch.isGroup) return;
      if (!/:collar$/.test(ch.name ?? '')) return;
      ch.scale.set(s, 1, s);
    });
  }

  _setTwistLamps(locked) {
    for (const lamp of this.twistLamps) {
      const mat = Array.isArray(lamp.material) ? lamp.material[0] : lamp.material;
      if (!mat) continue;
      mat.color.copy(locked ? LAMP_RED : LAMP_GREEN);
      if (mat.emissive) mat.emissive.copy(locked ? LAMP_EMISSIVE_RED : LAMP_EMISSIVE_GREEN);
      if ('emissiveIntensity' in mat) mat.emissiveIntensity = locked ? 1.05 : 0.7;
    }
  }

  _ensureGatePlate() {
    if (this.gatePlate || this.gateHasBoom || !this.animRoot) return;
    const plate = new THREE.Mesh(GATE_PLATE_GEOM, GATE_PLATE_MAT);
    plate.name = 'fringe:port-anim-gate-plate';
    plate.userData.ownsGeometry = false;
    noPick(plate);
    const gate = this.logistics?.truckGate ?? { x: 100, z: -12 };
    plate.position.set(gate.x, 0.55, gate.haulRoadZ ?? gate.z ?? -12);
    this.animRoot.add(plate);
    this.gatePlate = plate;
  }

  _spawnLanePuff(head) {
    if (!this.animRoot || !head) return;
    const mesh = new THREE.Mesh(PUFF_GEOM, PUFF_MAT.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(head.x, (this.logistics?.transferLane?.bedTopY ?? 1) + 0.04, head.z);
    mesh.renderOrder = 4;
    noPick(mesh);
    this.animRoot.add(mesh);
    this.puffs.push({ mesh, t0: this.time });
  }

  _reparent(obj, parent) {
    if (!obj || !parent) return;
    if (obj.parent === parent) return;
    parent.attach(obj);
  }

  _holdGantry() {
    return this.rest?.hold
      ?? this.logistics?.gantries?.find((g) => g.id === 'hold')
      ?? this.logistics?.gantries?.[0]
      ?? null;
  }

  _cargoMount(g) {
    const id = g?.id ?? 'hold';
    const named = `fringe:port-gantry:${id}:cargo-mount`;
    return g?.cargoMount
      ?? g?.spreader?.getObjectByName?.(named)
      ?? this.port?.getObjectByName(named)
      ?? null;
  }

  _lockBoxToMount(box, mount) {
    if (!box || !mount) return;
    const kids = mount.children;
    for (let i = 0; i < kids.length; i += 1) {
      if (kids[i] !== box) kids[i].visible = false;
    }
    if (box.parent !== mount) this._reparent(box, mount);
    box.userData.owner = 'crane';
    restoreCargoOpaque(box);
    box.position.set(0, 0, 0);
    box.rotation.set(0, 0, 0);
    box.scale.set(1, 1, 1);
    box.visible = true;
  }

  _hangForY(targetY) {
    const g = this._holdGantry();
    if (!g?.trolley) return 8;
    g.trolley.getWorldPosition(_v1);
    return Math.max(g.hangMin ?? 1.2,
      Math.min(g.hangMax ?? 28, _v1.y - targetY - cargoDropOf(g)));
  }

  play(rows, options = {}) {
    if (!this.logistics && options.port) this.attach(options.port);
    if (!this.logistics) return null;
    this.resetLive();
    this.demo = Boolean(options.demo);
    this.reducedMotion = options.reducedMotion ?? this.reducedMotion;
    this.onChip = options.onChip ?? this.onChip;
    this.resolveEndpoint = options.resolveEndpoint ?? this.resolveEndpoint;
    const holds = options.holds ?? [];
    this._findSpreaderLamps();
    this._inspectGate(this.port);
    this._bindBerthLee(this.port);
    this.plan = scheduleBeat(rows, this.logistics, {
      city: options.city,
      holds,
      reducedMotion: this.reducedMotion,
      resolveEndpoint: (row, cls, lane) => this.resolveEndpoint?.(cls, lane, row),
    });
    this.time = 0;
    this.playing = true;
    this.fired = new Set();
    this._mountCast(this.plan, options);
    this._eval(0);
    return this.plan;
  }

  playDemo(options = {}) {
    return this.play(demoBeatRows(), { ...options, demo: true, holds: [] });
  }

  resetLive() {
    for (const box of this.boxes.values()) {
      box.parent?.remove(box);
    }
    this.boxes.clear();
    this.lane = [];
    if (this.inbound) {
      this.inbound.parent?.remove(this.inbound);
      this.inbound = null;
    }
    if (this.heldShip) {
      this.heldShip.parent?.remove(this.heldShip);
      this.heldShip = null;
    }
    if (this.wake) {
      this.wake.parent?.remove(this.wake);
      disposeVehicle(this.wake);
      this.wake = null;
    }
    for (const truck of this.trucks) {
      truck.parent?.remove(truck);
      disposeVehicle(truck);
    }
    this.trucks = [];
    if (this.consist) {
      this.consist.parent?.remove(this.consist);
      disposeVehicle(this.consist);
      this.consist = null;
    }
    for (const p of this.people) p.parent?.remove(p);
    this.people = [];
    for (const puff of this.puffs) {
      puff.mesh.parent?.remove(puff.mesh);
      puff.mesh.material?.dispose?.();
    }
    this.puffs = [];
    if (this.gatePlate) {
      this.gatePlate.position.y = 0.55;
      this.gatePlate.visible = false;
    }
    this._setMooringSlack(0);
    this._syncBerthLee(true);
    if (this.gateBoom) this.gateBoom.rotation.z = this.gateBoomRest;
    const berthHolder = this.logistics?.containerBerth?.holder;
    if (berthHolder) {
      berthHolder.userData.cargoDropped = false;
      this._setCollarSpeed(berthHolder, 0);
    }
    if (this.inbound) this._setCollarSpeed(this.inbound, 0);
    const hold = this._holdGantry();
    if (hold?.spreader) hold.spreader.rotation.x = 0;
    this._setTwistLamps(false);
    this._swingAmp = 0;
    this._swingTarget = 0;
    this._swingStopT = null;
    this._gateOpen = 0;
    if (this.plate) {
      this.plate.parent?.remove(this.plate);
      this.plate = null;
    }
    if (this.hose) {
      this.hose.parent?.remove(this.hose);
      this.hose = null;
    }
    const berth = this.logistics?.containerBerth;
    if (berth?.holder) {
      berth.holder.userData.driven = false;
      berth.holder.visible = true;
      if (!berth.holder.userData.animMats) {
        uniquifyMaterials(berth.holder);
        berth.holder.userData.animMats = true;
      }
      setTreeOpacity(berth.holder, 1);
      if (this.rest?.outboundPos) berth.holder.position.copy(this.rest.outboundPos);
      if (this.rest?.outboundQuat) berth.holder.quaternion.copy(this.rest.outboundQuat);
      const bob = berth.holder.userData?.bob ?? berth.holder.children?.[0];
      if (bob?.rotation) bob.rotation.z = 0;
      this._setCollarSpeed(berth.holder, 0);
    }
    const tanker = this.logistics?.tankerBerth;
    if (tanker?.holder) {
      tanker.holder.userData.driven = false;
      tanker.holder.visible = true;
      if (!tanker.holder.userData.animMats) {
        uniquifyMaterials(tanker.holder);
        tanker.holder.userData.animMats = true;
      }
      setTreeOpacity(tanker.holder, 1);
      if (this.rest?.tankerPos) tanker.holder.position.copy(this.rest.tankerPos);
      if (tanker.holder.userData.restQuat) tanker.holder.quaternion.copy(tanker.holder.userData.restQuat);
    }
    const g = this._holdGantry();
    if (g && this.rest) {
      g.trolley.position.z = this.rest.trolleyZ;
      setHang(g, this.rest.hang);
    }
    const door = this.logistics?.shed?.doorMesh;
    if (door) door.position.y = this.doorRestY;
    const stacker = this.logistics?.reachStacker;
    if (stacker?.group && this.rest?.stackerHome) {
      stacker.group.position.x = this.rest.stackerHome.x;
      stacker.group.position.z = this.rest.stackerHome.z;
      stacker.group.rotation.y = this.rest.stackerHome.yaw;
    }
    if (this.tugRest?.obj) {
      this.tugRest.obj.position.set(this.tugRest.x, this.tugRest.y, this.tugRest.z);
    }
    for (const row of this.armRest) {
      if (row.arm?.inboard) row.arm.inboard.rotation.x = row.inboard;
      if (row.arm?.outboard) row.arm.outboard.rotation.x = row.outboard;
    }
    for (const gRow of this.gaugeRest) {
      if (gRow.mesh) {
        gRow.mesh.position.y = gRow.y;
        gRow.mesh.scale.y = gRow.sy;
      }
    }
    this.outbound = null;
    this.tanker = null;
    this.playing = false;
    this.plan = null;
    this.time = 0;
    this._craneHang = this.rest?.hang ?? null;
    this._craneTrolleyZ = this.rest?.trolleyZ ?? null;
    this._setMooringSlack(0);
  }

  _mountCast(plan) {
    const L = this.logistics;
    const terminal = this.port.getObjectByName('fringe:port-terminal') ?? this.port;
    const bedY = L.transferLane?.bedTopY ?? 1.0;
    const head = laneHead(L);

    const make = (item, overflow) => {
      const box = stampBox(item.good, `container:${item.row?.id ?? item.index}`, overflow);
      box.visible = false;
      this.animRoot.add(box);
      this.boxes.set(item.row?.id ?? `row:${item.index}`, box);
      return box;
    };
    for (const item of plan.exports) make(item, item.overflowOf ?? 0);
    for (const item of plan.harvestShip) make(item, item.overflowOf ?? 0);

    if (plan.harvestShip.length && L.containerBerth?.bob) {
      const holder = L.containerBerth.holder;
      const clone = cloneShipWithFittings(holder);
      clone.name = 'fringe:ship:container-inbound';
      clone.userData = { ...holder.userData, cargoDropped: false, driven: true, animMats: true };
      clone.userData.bob = clone.children[0] ?? clone.userData.bob;
      uniquifyMaterials(clone);
      const bob = clone.children[0];
      hideBay3Instances(bob);
      {
        // The clone sits at the berth pose now and arrives at it, so the berthed x of the spreader is the lift x.
        const lift = this._holdGantry();
        if (lift?.spreader && bob) {
          clone.updateWorldMatrix(true, true);
          lift.spreader.getWorldPosition(_v1);
          bob.worldToLocal(_v2.copy(_v1));
          hideRodsUnderLift(bob, _v2.x);
        }
      }
      const cells = inboundBay3Cells(L.containerBerth.deckSlots, plan.harvestShip.length);
      for (let i = 0; i < plan.harvestShip.length; i += 1) {
        const box = this.boxes.get(plan.harvestShip[i].row?.id ?? `row:${plan.harvestShip[i].index}`);
        const cell = cells[i];
        if (!box || !cell || !bob) continue;
        bob.add(box);
        box.position.set(cell.x, seatY(cell), cell.z);
        box.visible = true;
        box.userData.homeCell = cell;
      }
      this.port.add(clone);
      clone.visible = false;
      this.inbound = clone;
      this._inboundDecor = this._bindHullDecor(clone, 'container');
    }

    if (plan.events.some((e) => e.kind === 'held-ship') && L.containerBerth?.holder) {
      const clone = cloneShipWithFittings(L.containerBerth.holder);
      clone.name = 'fringe:ship:container-held';
      uniquifyMaterials(clone);
      this.port.add(clone);
      this.heldShip = clone;
    }

    const scene = this.port.parent;
    for (const ev of plan.events) {
      if (ev.kind !== 'truck' || ev.queued) continue;
      const tractor = addTerminalTractor(ev.good, { id: ev.index, loaded: true });
      uniquifyMaterials(tractor);
      (scene ?? this.animRoot).add(tractor);
      tractor.visible = false;
      tractor.userData.eventId = ev.id;
      this.trucks.push(tractor);
    }
    const rail = plan.events.find((e) => e.kind === 'rail' && !e.queued);
    if (rail) {
      this.consist = addRailConsist(rail.goods ?? [], { id: 0 });
      terminal.add(this.consist);
      this.consist.visible = false;
    }
    for (const ev of plan.events) {
      if (ev.kind !== 'people' || ev.queued) continue;
      const hues = [0x2f7a28, 0xe2560f, 0x1c62a8, 0xa8d016, 0xc45a1e];
      const group = new THREE.Group();
      group.name = `anim-pax:${ev.id}`;
      group.userData.berth = ev.id.endsWith('1') ? 'cruise' : 'spirit';
      for (let i = 0; i < ev.count; i += 1) {
        const mat = std(hues[i % hues.length], { roughness: 0.7, metalness: 0.04 });
        const p = new THREE.Group();
        addToyPerson(p, mat, 0, 0, 0, {
          h: 2.4, r: 0.38, name: `anim-pax:${ev.id}:${i}`,
        });
        p.userData.fan = (i - (ev.count - 1) * 0.5) * 1.35;
        p.userData.bobPhase = i * 0.85;
        group.add(p);
      }
      terminal.add(group);
      group.visible = false;
      this.people.push(group);
    }
    this._ensureGatePlate();

    void head;
    void bedY;
  }

  _chip(delivery, at, t) {
    if (!delivery || this.fired.has(`chip:${delivery.id}:${at}:${t}`)) return;
    this.fired.add(`chip:${delivery.id}:${at}:${t}`);
    if (!this.onChip) return;
    this.onChip(delivery, at, this.logistics);
  }

  _eval(t) {
    const plan = this.plan;
    if (!plan) return;
    const L = this.logistics;
    const g = this._holdGantry();
    const head = laneHead(L);
    const slots = laneSlots(L);
    const bedY = L.transferLane?.bedTopY ?? 1.0;
    const boxY = bedY + BOX.h * 0.5;
    const turn = L.transferLane?.turntable ?? { x: head.x + 42, z: head.z };
    const door = L.shed?.doorWest ?? { x: turn.x, z: -15.4 };
    const inside = L.shed?.inside ?? door;
    const doorMesh = L.shed?.doorMesh;

    let rollersSpin = 0;
    let hang = this._craneHang ?? this.rest?.hang ?? 9;
    let trolleyZ = this._craneTrolleyZ ?? this.rest?.trolleyZ ?? 0;
    const spreaderBox = { id: null, swing: 0, dip: 0, locked: false };
    let mooringSlack = 0;
    let gateOpen = 0;

    // ── TASTE-R1 LANE 3 — THE LOADING ARMS ARE STOWED UNTIL THE TANKER IS ALONGSIDE. ──
    // They stood at their working pose, aimed at the manifold, for the whole of the tanker's approach, and the
    // hull swung its house through the outboard arm and the hose (0.8 m on the motion sweep at t = 5.4 s). A
    // working arm is slewed clear (up) until the hull has stopped; the 'arms' events lower it and raise it.
    {
      const down0 = plan.events.find((e) => e.kind === 'arms' && e.down && !e.queued)?.t0;
      if (down0 !== undefined && t < down0) {
        for (const row of this.armRest) {
          if (row.arm?.inboard) row.arm.inboard.rotation.x = ARM_STOW_INBOARD;
          if (row.arm?.outboard) row.arm.outboard.rotation.x = ARM_STOW_OUTBOARD;
        }
      }
    }

    for (const ev of plan.events) {
      if (ev.queued) continue;
      if (t < ev.t0) continue;
      const u = clamp01((t - ev.t0) / Math.max(1e-6, ev.t1 - ev.t0));
      const live = t < ev.t1;

      if (ev.kind === 'door' && doorMesh) {
        const openU = ev.open ? easeOutCubic(u) : 1 - easeInOutCubic(u);
        doorMesh.position.y = this.doorRestY + openU * (this.doorTravel ?? 3.6);
      }

      if (ev.kind === 'box-ride') {
        const box = this.boxes.get(ev.boxId);
        // ── TASTE-R1 LANE 3 — A RIDE ENDS WHEN THE CRANE TAKES THE BOX. ──
        // This branch runs every frame after `t0`, and past `t1` it re-attached the
        // box to the lane head and put it back there whatever had happened to it
        // since: the export box the crane had set on the ship's deck at t = 8 s was
        // snapped back to the lane head at t = 9 s and stayed there, so two export
        // boxes lay inside one another at the head for the rest of the beat (1.71 m
        // deep on the motion sweep) and the ship sailed without its cargo. Once the
        // ride is over the box is the crane's (`owner`), and the ride lets go.
        if (box && !(t >= ev.t1 && box.userData.owner)) {
          const path = [
            { x: door.x, y: boxY + 0.4, z: door.z },
            { x: turn.x, y: boxY, z: turn.z },
            { x: head.x, y: boxY, z: head.z },
          ];
          const pose = samplePolyline(
            path.map((p) => ({ x: p.x, z: p.z })),
            easeInOutCubic(u),
          );
          const y = u < 0.18 ? lerp(boxY + 0.55, boxY, u / 0.18) : boxY;
          if (box.parent !== this.animRoot) this.animRoot.attach(box);
          box.position.set(pose.x, y, pose.z);
          box.rotation.set(0, 0, swingDamp(u, 1.2));
          restoreCargoOpaque(box);
          box.visible = true;
          rollersSpin = 1;
        }
      }

      if ((ev.kind === 'crane-load' || ev.kind === 'crane-unload') && g && live) {
        const phase = cranePhaseAt(t - ev.t0, ev.t1 - ev.t0);
        const seaZ = ev.cell ? (L.containerBerth?.z ?? 22) + (ev.cell.z ?? 0) * 0.02 : 22;
        const landZ = head.z;
        const fromZ = ev.kind === 'crane-load' ? landZ : (ev.cell ? 18 + (ev.cell.z ?? 0) * 0.15 : 20);
        const toZ = ev.kind === 'crane-load' ? fromZ : landZ;
        // Load: land → sea over bay 3. Unload: sea → land.
        const aZ = ev.kind === 'crane-load' ? landZ : (18 + (ev.cell?.z ?? 0) * 0.12);
        const bZ = ev.kind === 'crane-load' ? 20 : landZ;
        // taste-r1 W8-E: the box is lowered to the height its cell is actually seated at (`seatY`, the deck offset and the 0.1 m
        // twist-lock gap included). The old `deckY + BOX.h * (tier + 0.5)` ignored both, which was harmless while the box came
        // down 4.9 m beside the hold bay and is 0.4 to 0.5 m into the box below now that the hold bay stands under the spreader.
        const cellY = ev.cell
          ? seatY(ev.cell)
          : (ev.kind === 'crane-load' ? (L.containerBerth?.deckY ?? 2.2) + BOX.h * 0.5 : 4);
        const high = 14;
        if (phase.name === 'trolleyTo') {
          // ── TASTE-R1 LANE 3 — THE SPREADER LEAVES WHERE THE LAST CYCLE LEFT IT, AND RISES BEFORE IT TRAVELS. ──
          // Every cycle after the first began its trolley run from the gantry's PARKED trolley position, not from
          // where the previous box had just been set down: the spreader crossed the 23 m between the lane and the
          // ship in one 0.1 s sample, at the height it had set the box down (1.3 m), straight through the ship's
          // lashing rods (and on the way a 14 m hoist drop into the 'down' phase). It now starts from the previous
          // cycle's end state, hoists to park height over the first 60 % of the phase, and only then runs the trolley.
          const prev = plan.events.reduce((best, e) => (
            !e.queued && (e.kind === 'crane-load' || e.kind === 'crane-unload') && e !== ev && e.t1 <= ev.t0 + 1e-3
              && (!best || e.t1 > best.t1) ? e : best), null);
          const restHang = this.rest?.hang ?? 8;
          let z0 = this.rest?.trolleyZ ?? aZ;
          let h0 = restHang;
          if (prev) {
            const prevLoad = prev.kind === 'crane-load';
            z0 = prevLoad ? 20 : landZ;
            const endY = prevLoad
              ? (prev.cell ? seatY(prev.cell) : (L.containerBerth?.deckY ?? 2.2) + BOX.h * 0.5)
              : boxY;
            h0 = Math.max(restHang, this._hangForY(endY) - 6 * Math.max(0, ev.t0 - prev.t1));
          }
          const lowStart = h0 - restHang > 0.5;
          hang = lerp(h0, restHang, easeInOutCubic(clamp01(phase.u / 0.6)));
          trolleyZ = lerp(z0, aZ, easeInOutCubic(lowStart ? clamp01((phase.u - 0.45) / 0.55) : phase.u));
        } else if (phase.name === 'down') {
          trolleyZ = aZ;
          hang = lerp(this.rest?.hang ?? 8, this._hangForY(ev.kind === 'crane-load' ? boxY : cellY), easeInOutCubic(phase.u));
        } else if (phase.name === 'lock') {
          trolleyZ = aZ;
          hang = this._hangForY(ev.kind === 'crane-load' ? boxY : cellY) + setDownDip(phase.u);
          spreaderBox.dip = setDownDip(phase.u);
          spreaderBox.locked = phase.u > 0.4;
          const box = this.boxes.get(ev.boxId);
          const mount = this._cargoMount(g);
          if (box && phase.u > 0.4) this._lockBoxToMount(box, mount);
        } else if (phase.name === 'lift') {
          trolleyZ = aZ;
          hang = lerp(
            this._hangForY(ev.kind === 'crane-load' ? boxY : cellY),
            this._hangForY(high),
            easeInOutCubic(phase.u),
          );
          spreaderBox.swing = swingDamp(phase.u);
          spreaderBox.locked = true;
          const lifted = this.boxes.get(ev.boxId);
          if (lifted) this._lockBoxToMount(lifted, this._cargoMount(g));
        } else if (phase.name === 'trolleyAcross') {
          trolleyZ = lerp(aZ, bZ, easeInOutCubic(phase.u));
          hang = this._hangForY(high);
          spreaderBox.swing = swingDamp(0.4 + phase.u * 0.4);
          spreaderBox.locked = true;
          const lifted = this.boxes.get(ev.boxId);
          if (lifted) this._lockBoxToMount(lifted, this._cargoMount(g));
        } else if (phase.name === 'lower') {
          trolleyZ = bZ;
          const destY = ev.kind === 'crane-load' ? cellY : boxY;
          hang = lerp(this._hangForY(high), this._hangForY(destY), easeInOutCubic(phase.u));
          spreaderBox.locked = true;
          const lowered = this.boxes.get(ev.boxId);
          if (lowered) this._lockBoxToMount(lowered, this._cargoMount(g));
        } else if (phase.name === 'release') {
          trolleyZ = bZ;
          const destY = ev.kind === 'crane-load' ? cellY : boxY;
          hang = this._hangForY(destY) + setDownDip(phase.u);
          spreaderBox.dip = setDownDip(phase.u);
          spreaderBox.locked = phase.u < 0.55;
          const box = this.boxes.get(ev.boxId);
          if (box && phase.u > 0.55) {
            if (ev.kind === 'crane-load' && ev.cell && L.containerBerth?.bob) {
              this._reparent(box, L.containerBerth.bob);
              restoreCargoOpaque(box);
              box.position.set(ev.cell.x, ev.cell.y, ev.cell.z);
              box.rotation.set(0, 0, 0);
            } else if (ev.kind === 'crane-unload') {
              this._reparent(box, this.animRoot);
              restoreCargoOpaque(box);
              box.position.set(head.x, boxY + spreaderBox.dip, head.z);
              box.rotation.set(0, 0, 0);
              if (!this.lane.includes(box)) this.lane.unshift(box);
              if (!this.fired.has(`puff:${ev.boxId}`)) {
                this.fired.add(`puff:${ev.boxId}`);
                this._spawnLanePuff(head);
              }
            }
          }
        }
        void seaZ;
        void toZ;
      }

      if (ev.kind === 'conveyor-shift' && live) {
        rollersSpin = 1;
        const e = easeInOutCubic(u);
        // ── P16-PM8 ITEM 5 — THIS LOOP COUNTED UP AND TESTED FOR ZERO. ──
        // `i = lane.length - 1; i >= 0; i += 1` never terminates. It walks off
        // the end of `this.lane`, every read after that is `undefined`, the
        // guard on the next line fires `continue`, and the tick spins forever
        // on an index increment. PM7 profiled the hang over `traverse`,
        // `getWorldPosition`, `updateWorldMatrix`, `Material.clone` and
        // `BufferGeometry.clone` and found none of them growing, and PM8's own
        // counter-throw over `Math.*`, `Array.push`, `Set.add/has`, `Map.set`,
        // `RegExp.test`, `Object.keys` and `Vector3.set` never fired either —
        // correctly, because the body of the runaway calls NOTHING. It was
        // named by swapping `plan.events` for a logging iterable
        // (`p16-pm8-ev.mjs`): the last event entered at t = 25.50 s is
        // `conveyor-shift shift:0`, t0 25.055, and the tick never leaves it.
        //
        // The intent is a BACKWARD walk — the tail box moves into the slot the
        // one ahead of it is leaving, so the lane shifts without a box being
        // written over the position another still has to read. `i -= 1`.
        //
        // This is not a harness fault. `_eval` is the live director's own
        // update, so in the browser the first conveyor shift after the beat
        // starts locks the main thread. Nothing in the port renders again.
        for (let i = this.lane.length - 1; i >= 0; i -= 1) {
          const box = this.lane[i];
          if (!box || box.parent !== this.animRoot) continue;
          const from = i === 0 ? head : (slots[i - 1] ?? slots[slots.length - 1]);
          const to = slots[i] ?? lastLaneSlot(L);
          if (!from || !to) continue;
          box.position.set(
            lerp(from.x, to.x, e),
            boxY,
            lerp(from.z, to.z, e),
          );
        }
      }

      if (ev.kind === 'stacker' && live) {
        const rs = L.reachStacker;
        const home = this.rest?.stackerHome ?? rs?.home;
        if (rs?.group && home) {
          const pick = ev.from === 'tractor'
            ? { x: L.shed?.doorWest?.x ?? turn.x, z: L.truckGate?.haulRoadZ ?? -12 }
            : ev.from === 'wagon'
              ? { x: L.railHead?.x ?? 0, z: L.railHead?.spurZ ?? -28.4 }
              : lastLaneSlot(L);
          const drop = ev.cell
            ? { x: ev.cell.x, z: ev.cell.z, y: (ev.cell.placeTier ?? 0) * BOX.h + BOX.h * 0.5 + 1.0 }
            : ev.to === 'turntable'
              ? { x: turn.x, z: turn.z, y: boxY }
              : { x: head.x + 8, z: head.z, y: boxY };
          const segs = [
            { t: 0.00, x: home.x, z: home.z },
            { t: 0.22, x: pick.x, z: pick.z },
            { t: 0.55, x: pick.x, z: pick.z },
            { t: 0.78, x: drop.x, z: drop.z },
            { t: 1.00, x: home.x, z: home.z },
          ];
          let a = segs[0];
          let b = segs[1];
          for (let i = 1; i < segs.length; i += 1) {
            if (u <= segs[i].t) {
              a = segs[i - 1];
              b = segs[i];
              break;
            }
            a = segs[i];
            b = segs[i];
          }
          const su = clamp01((u - a.t) / Math.max(1e-6, b.t - a.t));
          const e = easeInOutCubic(su);
          rs.group.position.x = lerp(a.x, b.x, e);
          rs.group.position.z = lerp(a.z, b.z, e);
          const yaw = Math.atan2(b.x - a.x, b.z - a.z);
          if (Math.hypot(b.x - a.x, b.z - a.z) > 0.2) rs.group.rotation.y = yaw;
          const box = this.boxes.get(ev.boxId);
          if (box && u > 0.22 && u < 0.78) {
            if (box.parent !== rs.spreader) {
              this._reparent(box, rs.spreader);
              restoreCargoOpaque(box);
              box.position.set(0, -1.55, 0);
              box.visible = true;
            }
            box.rotation.z = swingDamp((u - 0.22) / 0.56);
          }
          if (box && u >= 0.78) {
            if (ev.cell && this.stackGroup) {
              this._reparent(box, this.stackGroup);
              const y = 1.0 + BOX.h * ((ev.cell.placeTier ?? 0) + 0.5);
              box.position.set(ev.cell.x, y, ev.cell.z);
              box.rotation.set(0, 0, 0);
              const cell = (L.liveStack?.cells ?? [])[ev.cell.index];
              if (cell) {
                cell.tier = (ev.cell.placeTier ?? cell.tier) + 1;
                cell.occupied = true;
              }
              this.persistentStack.push(box);
              this.boxes.delete(ev.boxId);
            } else if (ev.to === 'turntable') {
              this._reparent(box, this.animRoot);
              box.position.set(turn.x, boxY, turn.z);
            }
            const idx = this.lane.indexOf(box);
            if (idx >= 0) this.lane.splice(idx, 1);
          }
        }
      }

      if (ev.kind === 'shed-in') {
        const box = this.boxes.get(ev.boxId);
        if (box) {
          if (box.parent !== this.animRoot) this.animRoot.attach(box);
          const path = [
            { x: box.position.x, z: box.position.z },
            { x: turn.x, z: turn.z },
            { x: door.x, z: door.z },
            { x: inside.x, z: inside.z },
          ];
          const pose = samplePolyline(path, easeInOutCubic(u));
          box.position.set(pose.x, boxY, pose.z);
          restoreCargoOpaque(box);
          box.visible = u <= 0.84;
          rollersSpin = 1;
          if (doorMesh) {
            const open = u < 0.7 ? easeOutCubic(Math.min(1, u / 0.2)) : 1 - easeInOutCubic((u - 0.7) / 0.3);
            doorMesh.position.y = this.doorRestY + open * (this.doorTravel ?? 3.6);
          }
        }
      }

      if (ev.kind === 'ship-depart' && L.containerBerth?.holder) {
        const holder = L.containerBerth.holder;
        holder.userData.driven = true;
        this.outbound = holder;
        const pose = shipDepartPose(u, ev.waypoints ?? plan.waypoints, ev.duration ?? (ev.t1 - ev.t0));
        this._setHolderLocal(holder, pose.x, pose.z, pose.y, pose.pitch, pose.h);
        if (!holder.userData.animMats) {
          uniquifyMaterials(holder);
          holder.userData.animMats = true;
        }
        if (pose.opacity < 0.999) dropCargoFrom(holder);
        setTreeOpacity(holder, pose.opacity);
        this._setCollarSpeed(holder, pose.speed01);
        this._checkDecorTravel(this._outboundDecor);
        if (live) mooringSlack = Math.max(mooringSlack, 1);
        if (!this.wake) {
          this.wake = addDepartWake();
          this.port.add(this.wake);
          if (this._outboundDecor) this._outboundDecor.wake = this.wake;
        }
        // Water decals follow the stern horizontally, never the hull's squat
        // or pitch (which submerged the old bob-parented chain). The existing
        // plates sit 5 cm above the harbour's 0.17 m surface after their offset.
        holder.getWorldQuaternion(_q1);
        _v2.set(1, 0, 0).applyQuaternion(_q1);
        const wakeYaw = Math.atan2(-_v2.z, _v2.x);
        _q1.setFromAxisAngle(_v2.set(0, 1, 0), wakeYaw);
        _v2.set(-(holder.userData.length ?? 42) * 0.5, 0, 0).applyQuaternion(_q1);
        holder.getWorldPosition(_v1).add(_v2);
        _v1.y = 0.17;
        this.wake.position.copy(this.port.worldToLocal(_v1));
        this.port.getWorldQuaternion(this.wake.quaternion).invert().multiply(_q1);
        for (const plate of this.wake.children) {
          plate.material.opacity = plate.userData.departWakeOpacity
            * departureWakeAlpha(pose.dist, plate.userData.departWakeDistance);
        }
        // ── TASTE-R1 LANE 3 — THE PUSH TUG STAYS ON ITS STATION. ──
        // This block lerped `tug:1` toward `_toWorld(pose.x - 6, 0, pose.z - 4)`.
        // `_toWorld` answers in WORLD metres and the tug is a child of the harbour
        // group, whose frame is yawed 180 degrees and offset, so the tug left its
        // station for a point on the terminal apron (the motion sweep read it at
        // world (84, 2, -4), inside the wagons, with 1.0 to 1.2 m of interpenetration
        // with the shunter, the passengers and a lifted box) and, even with the frame
        // fixed, (pose.x - 6, pose.z - 4) is inside the 9.6 m hull it is meant to
        // push. A tug that lies off its station and does not move cannot hit the
        // lane; `tugRest` is kept only so `resetLive` can still restore it.
      }

      if (ev.kind === 'ship-arrive' && this.inbound) {
        this.inbound.visible = true;
        this.inbound.userData.driven = true;
        const pose = shipArrivePose(u, ev.waypoints ?? plan.waypoints, ev.duration ?? (ev.t1 - ev.t0));
        let yOff = pose.y;
        let speed01 = pose.speed01;
        if (!live) {
          yOff = arriveBerthBob(t - ev.t1);
          speed01 = 0;
        }
        this._setHolderLocal(this.inbound, pose.x, pose.z, yOff, pose.pitch, pose.h);
        if (pose.opacity < 0.999) dropCargoFrom(this.inbound);
        setTreeOpacity(this.inbound, pose.opacity);
        this._setCollarSpeed(this.inbound, speed01);
        this._checkDecorTravel(this._inboundDecor);
      }

      if (ev.kind === 'tanker-arrive' && L.tankerBerth?.holder) {
        const holder = L.tankerBerth.holder;
        holder.userData.driven = true;
        this.tanker = holder;
        const pose = shipArrivePose(u, ev.waypoints);
        this._setHolderLocal(holder, pose.x, pose.z, 0, 0, pose.h);
        if (!holder.userData.animMats) {
          uniquifyMaterials(holder);
          holder.userData.animMats = true;
        }
        setTreeOpacity(holder, pose.opacity);
        this._checkDecorTravel(this._tankerDecor);
      }
      if (ev.kind === 'tanker-depart' && L.tankerBerth?.holder) {
        const holder = L.tankerBerth.holder;
        holder.userData.driven = true;
        const pose = shipDepartPose(u, ev.waypoints ?? tankerApproachLane(
          L.tankerBerth.x, L.tankerBerth.z,
        ));
        this._setHolderLocal(holder, pose.x, pose.z, pose.y, 0, pose.h);
        if (pose.opacity < 0.999) dropCargoFrom(holder);
        setTreeOpacity(holder, pose.opacity);
        this._checkDecorTravel(this._tankerDecor);
      }

      if (ev.kind === 'arms') {
        for (const row of this.armRest) {
          const upIn = ARM_STOW_INBOARD;
          const upOut = ARM_STOW_OUTBOARD;
          const a = ev.down ? { inboard: upIn, outboard: upOut } : { inboard: row.inboard, outboard: row.outboard };
          const b = ev.down ? { inboard: row.inboard, outboard: row.outboard } : { inboard: upIn, outboard: upOut };
          const e = easeInOutCubic(u);
          if (row.arm?.inboard) row.arm.inboard.rotation.x = lerp(a.inboard, b.inboard, e);
          if (row.arm?.outboard) row.arm.outboard.rotation.x = lerp(a.outboard, b.outboard, e);
        }
        if (ev.down && live) this._pulseHose(t);
      }

      if (ev.kind === 'gauge') {
        const tanks = L.tankFarm?.tanks ?? [];
        const tk = tanks[ev.step % Math.max(1, tanks.length)];
        const rest = this.gaugeRest[ev.step % Math.max(1, this.gaugeRest.length)];
        if (tk?.gauge && rest) {
          tk.gauge.scale.y = rest.sy * (1 + 0.18 * easeOutCubic(u));
          tk.gauge.position.y = rest.y + 0.12 * easeOutCubic(u);
        }
        if (ev.chipAt != null && t >= ev.chipAt) this._chip(ev.delivery, 'lane-head', ev.chipAt);
      }

      if (ev.kind === 'truck') {
        const tractor = this.trucks.find((tr) => tr.userData.eventId === ev.id);
        if (tractor) {
          tractor.visible = true;
          const pause = ev.pause ?? GATE_PAUSE_SECONDS;
          const haulSec = ev.haulSeconds ?? HAUL_SECONDS;
          const driveEnd = ev.t0 + ev.drive;
          const pauseEnd = driveEnd + pause;
          const haulEnd = pauseEnd + haulSec;
          let phase = 'city';
          if (t < driveEnd) {
            const driveU = clamp01((t - ev.t0) / Math.max(1e-6, ev.drive));
            const pose = sampleWorldPath(ev.path, driveU);
            tractor.position.set(pose.x, 0, pose.z);
            tractor.rotation.y = pose.yaw;
            phase = 'city';
            const openStart = ev.t0 + ev.drive - GATE_BOOM_SECONDS;
            if (t >= openStart) {
              gateOpen = Math.max(gateOpen, clamp01((t - openStart) / GATE_BOOM_SECONDS));
            }
          } else if (t < pauseEnd) {
            const pose = sampleWorldPath(ev.path, 1);
            tractor.position.set(pose.x, 0, pose.z);
            tractor.rotation.y = pose.yaw;
            phase = 'gate';
            gateOpen = 1;
          } else if (t < haulEnd) {
            const haulU = clamp01((t - pauseEnd) / Math.max(1e-6, haulSec));
            const pose = samplePolyline(ev.haul, easeInOutCubic(haulU));
            const w = this._toWorld(pose.x, 0, pose.z);
            tractor.position.set(w.x, w.y, w.z);
            tractor.rotation.y = pose.yaw + (L.frame?.yaw ?? Math.PI);
            phase = haulU < 0.92 ? 'haul' : 'unload';
            const closeU = clamp01((t - pauseEnd) / GATE_BOOM_SECONDS);
            gateOpen = Math.max(gateOpen, 1 - closeU);
          } else {
            const back = clamp01((t - haulEnd - 2) / Math.max(1e-6, ev.drive));
            if (back <= 0) {
              const pose = samplePolyline(ev.haul, 1);
              const w = this._toWorld(pose.x, 0, pose.z);
              tractor.position.set(w.x, w.y, w.z);
              tractor.rotation.y = pose.yaw + (L.frame?.yaw ?? Math.PI);
              phase = 'unload';
            } else {
              const leave = sampleWorldPath(ev.path, 1 - back);
              tractor.position.set(leave.x, 0, leave.z);
              tractor.rotation.y = leave.yaw + Math.PI;
              if (back > 0) dropCargoFrom(tractor);
              setTreeOpacity(tractor, 1 - back);
              phase = 'leave';
            }
          }
          tractor.userData.phase = phase;
        }
      }

      if (ev.kind === 'rail' && this.consist) {
        this.consist.visible = true;
        const enterX = ev.enterX ?? L.railHead?.enterX ?? 140;
        const headX = ev.headX ?? L.railHead?.x ?? 90;
        const z = ev.spurZ ?? -28.4;
        const inU = clamp01((t - ev.t0) / RAIL_ENTRY_SECONDS);
        const linger = ev.t1 - ev.t0 - RAIL_ENTRY_SECONDS * 2;
        const outT0 = ev.t0 + RAIL_ENTRY_SECONDS + Math.max(2, linger);
        let x = enterX;
        if (t < ev.t0 + RAIL_ENTRY_SECONDS) {
          x = lerp(enterX, headX, easeInOutCubic(inU));
        } else if (t < outT0) {
          x = headX;
        } else {
          const ou = clamp01((t - outT0) / RAIL_ENTRY_SECONDS);
          x = lerp(headX, enterX, easeInOutCubic(ou));
          if (ou > 0) dropCargoFrom(this.consist);
          setTreeOpacity(this.consist, 1 - ou);
        }
        this.consist.position.set(x, 0, z);
        this.consist.rotation.y = 0;
      }

      if (ev.kind === 'people') {
        const group = this.people.find((p) => p.name === `anim-pax:${ev.id}`);
        if (group) {
          group.visible = true;
          const fromCruise = group.userData.berth === 'cruise';
          const start = fromCruise ? { x: -44.5, z: 4 } : { x: 11.1, z: 4 };
          // ── TASTE-R1 LANE 3 — PASSENGERS STAY ON THE QUAY WALK. ──
          // The route cut diagonally from the cope to the truck gate: across the gantry rails, through the
          // conveyor lane (and the export boxes riding it at that moment) and the tractors' haul road, and the
          // sweep read the group inside boxes (1.1 m), the trolley's load (0.4 m) and each other (0.7 m). They
          // now walk the promenade side of the cope, seaward of the gantry legs, to the end of the lane and
          // fade as they pass the admin block, which is where a tourist leaves the working quay.
          const walkEnd = (L.transferLane?.slots?.[L.transferLane.slots.length - 1]?.x ?? 83) + 9;
          const walkZ = 4.9 + (group.userData.berth === 'cruise' ? 0 : 0.25);
          const pose = samplePolyline(
            [start, { x: start.x, z: walkZ }, { x: walkEnd, z: walkZ }],
            easeInOutCubic(u),
          );
          group.position.set(pose.x, 1.0, pose.z);
          group.rotation.y = pose.yaw;
          const n = group.children.length;
          for (let i = 0; i < n; i += 1) {
            const child = group.children[i];
            const fan = (child.userData.fan ?? 0) * (0.35 + 0.85 * u);
            child.position.x = fan;
            child.position.z = (i % 2 === 0 ? -0.35 : 0.55) * u;
            child.position.y = PERSON_BOB_AMP * Math.sin(
              t * PERSON_BOB_HZ * Math.PI * 2 + (child.userData.bobPhase ?? 0),
            );
          }
          if (u > 0.82) setTreeOpacity(group, 1 - (u - 0.82) / 0.18);
        }
      }

      if (ev.kind === 'chip' && t >= ev.t0) {
        this._chip(ev.delivery, ev.at, ev.t0);
      }

      if (ev.kind === 'plate') {
        if (!this.plate) this._makePlate(ev.copy);
        if (this.plate) {
          const rise = easeOutCubic(Math.min(1, u * 2));
          this.plate.position.y = 6 + rise * 4;
          this.plate.visible = true;
          setTreeOpacity(this.plate, u < 0.85 ? 1 : 1 - (u - 0.85) / 0.15);
        }
      }

      if (ev.kind === 'held-ship' && this.heldShip) {
        this.heldShip.visible = true;
        this.heldShip.userData.driven = true;
        const wp = ev.waypoints ?? containerApproachWaypoints(plan.cx, 140);
        const bob = Math.sin(t * 0.7) * 0.35;
        this._setHolderLocal(this.heldShip, wp[wp.length - 1].x, wp[wp.length - 1].z, bob);
      }

      if (ev.kind === 'reduced-fade') {
        const box = this.boxes.get(ev.boxId);
        if (box) {
          restoreCargoOpaque(box);
          box.visible = u < 0.55;
        }
      }
      if (ev.kind === 'reduced-ship') {
        const holder = L.containerBerth?.holder;
        if (holder) {
          holder.userData.driven = true;
          setTreeOpacity(holder, easeOutCubic(u));
          this._setHolderLocal(holder, plan.cx, plan.berthZ);
        }
      }
    }

    // ── TASTE-R1 LANE 3 — THE SPREADER IS HOISTED CLEAR WHENEVER THE CRANE IS NOT WORKING A BOX. ──
    // The last export release left it hanging at deck level over the ship at z = 20 while the 13 m hull and its
    // deck cranes sailed out from under it, and the inbound hull sailed in under the same low spreader (the
    // sweep read the spreader and the lifted box 1.5 m inside the ship's deck crane, and the bible requires the
    // spreader's underside 0.5 m over the highest thing on its path). Between crane events the hoist rises to its
    // upper stop at 6 m/s: that puts the underside about 15 m over the water, 1.6 m over the tallest hull.
    const dtE = Math.max(0, Math.min(0.25, t - (this._lastEvalT ?? t)));
    this._lastEvalT = t;
    if (g && !plan.events.some((e) => !e.queued && (e.kind === 'crane-load' || e.kind === 'crane-unload')
      && t >= e.t0 && t < e.t1)) {
      hang = Math.max((g.hangMin ?? 1.2) + 0.1, hang - 6 * dtE);
    }
    if (g) {
      g.trolley.position.z = trolleyZ;
      setHang(g, hang);
      const dz = trolleyZ - (this._craneTrolleyZ ?? trolleyZ);
      const moving = Math.abs(dz) > 0.002;
      const maxLean = (SPREADER_SWING_DEG * Math.PI) / 180;
      if (moving) {
        this._swingTarget = Math.sign(dz) * maxLean;
        this._swingAmp = this._swingTarget;
        this._swingStopT = null;
      } else {
        if (this._swingStopT == null) this._swingStopT = t;
        this._swingAmp = swingAfterStop(t - this._swingStopT, this._swingTarget);
      }
      if (g.spreader) g.spreader.rotation.x = this._swingAmp;
      this._craneHang = hang;
      this._craneTrolleyZ = trolleyZ;
      if (g.cargoMount) {
        g.cargoMount.rotation.z = spreaderBox.swing;
        // P16-PM4: the drop is the spreader's, published on the rig and derived
        // from the container module. Typed as 0.78 while the box was 1.30 m tall,
        // which put a third of every lifted box inside the frame holding it.
        g.cargoMount.position.y = -cargoDropOf(g) + spreaderBox.dip;
      }
      this._setTwistLamps(spreaderBox.locked);
    }
    const rollers = L.transferLane?.rollers;
    if (rollers?.isInstancedMesh && rollersSpin) {
      rollers.rotation.x = (rollers.rotation.x + 2.8 * 0.016) % (Math.PI * 2);
    }

    this._setMooringSlack(mooringSlack);
    this._gateOpen = gateOpen;
    if (this.gateBoom) {
      this.gateBoom.rotation.z = this.gateBoomRest + gateOpen * GATE_BOOM_RAD;
      if (this.gatePlate) this.gatePlate.visible = false;
    } else if (this.gatePlate) {
      this.gatePlate.visible = true;
      this.gatePlate.position.y = 0.55 + gateOpen * 2.1;
    }
    const berthOccupied = this._hullAtBerth(this.outbound)
      || this._hullAtBerth(this.inbound)
      || this._hullAtBerth(L.containerBerth?.holder);
    this._syncBerthLee(berthOccupied);

    for (let i = this.puffs.length - 1; i >= 0; i -= 1) {
      const puff = this.puffs[i];
      const age = t - puff.t0;
      const pu = clamp01(age / LANE_PUFF_SECONDS);
      puff.mesh.scale.setScalar(0.55 + pu * 2.6);
      puff.mesh.material.opacity = 0.42 * (1 - pu);
      if (pu >= 1) {
        puff.mesh.parent?.remove(puff.mesh);
        puff.mesh.material?.dispose?.();
        this.puffs.splice(i, 1);
      }
    }

    this._writeStatus(t, plan);
  }

  _pulseHose(t) {
    const arms = this.logistics?.tankFarm?.loadingArms ?? [];
    const arm = arms[0];
    if (!arm?.outboard) return;
    if (!this.hose) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x3a2018,
        emissive: 0xc45a18,
        emissiveIntensity: 0.4,
        roughness: 0.45,
        metalness: 0.12,
      });
      this.hose = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 8), mat);
      this.hose.name = 'fringe:port-anim-hose';
      arm.outboard.add(this.hose);
      // TASTE-R1 L3: z 4 -> 2.6. At 4 m along the outboard limb the glow hose sat in the tanker's manifold house
      // (0.46 m on the motion sweep while the arms rose); 2.6 m keeps it on the arm and clear of the deck gear.
      // TASTE-R1 W3-B: z 2.6 -> 2.0 and 1.3 m -> 0.9 m. The far end (3.25 m along the limb) still grazed the manifold
      // house for one triangle at t = 9.9 s (0.51 m) on a later sweep run; it now stops 0.8 m short of that.
      this.hose.position.set(0, 0.0, 2.0);
      this.hose.scale.y = 0.38; // 0.9 m of glow hose: the 2.4 m one hung into the tanker's manifold house
    }
    this.hose.material.emissiveIntensity = 0.35 + Math.abs(Math.sin(t * 7.5)) * 0.85;
  }

  _makePlate(copy) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#c45a18';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#f2c14a';
    ctx.fillRect(8, 8, 496, 112);
    ctx.fillStyle = '#1a1008';
    ctx.font = '900 42px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(copy ?? 'PORT FULL').slice(0, 28), 256, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 3.4),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }),
    );
    mesh.name = 'fringe:port-full-plate';
    const shed = this.logistics?.shed?.inside ?? { x: 70, z: -20 };
    mesh.position.set(shed.x, 8, shed.z);
    mesh.rotation.y = Math.PI * 0.5;
    this.animRoot.add(mesh);
    this.plate = mesh;
  }

  _snapTrucks() {
    if (!this._truckSnap) this._truckSnap = [];
    const n = this.trucks.length;
    while (this._truckSnap.length < n) {
      this._truckSnap.push({ id: '', x: 0, y: 0, z: 0, visible: false, phase: 'city' });
    }
    this._truckSnap.length = n;
    for (let i = 0; i < n; i += 1) {
      const tr = this.trucks[i];
      const row = this._truckSnap[i];
      row.id = tr.userData.eventId ?? tr.name;
      row.x = tr.position.x;
      row.y = tr.position.y;
      row.z = tr.position.z;
      row.visible = tr.visible;
      row.phase = tr.userData.phase ?? 'city';
    }
    return this._truckSnap;
  }

  _writeStatus(t, plan) {
    const cells = this.logistics?.liveStack?.cells ?? [];
    const occupied = cells.reduce((n, c) => n + (c.tier ?? 0), 0);
    const capacity = cells.length * LIVE_TIER_CAP;
    const laneSlotsState = [];
    const slots = laneSlots(this.logistics);
    for (let i = 0; i < slots.length; i += 1) {
      const box = this.lane[i];
      laneSlotsState.push(box?.userData?.good ?? null);
    }
    const phase = phaseAtTime(plan, t);
    this._fillSubject(phase);
    this._fillCamera(phase);
    const berth = this.logistics?.containerBerth;
    const berthWorld = berth ? this._toWorld(berth.x, 0, berth.z) : { x: 0, y: 0, z: 0 };
    const ghosts = countCargoGhosts(this.animRoot);
    const berthEmpty = !this._hullAtBerth(this.outbound)
      && !this._hullAtBerth(this.inbound)
      && !this._hullAtBerth(berth?.holder);
    const decals = berthEmpty
      ? countBerthDecals(this.port, berthWorld)
      : 0;
    this.statusSnapshot = {
      phase,
      time: t,
      liveCounts: {
        boxes: this.boxes.size + this.persistentStack.length,
        trucks: this.trucks.filter((tr) => tr.visible).length,
        wagons: this.consist?.userData?.wagons?.length ?? 0,
        people: this.people.reduce((n, g) => n + g.children.length, 0),
      },
      trucks: this._snapTrucks(),
      gate: {
        hasBoom: this.gateHasBoom,
        open: this._gateOpen,
        plate: Boolean(this.gatePlate),
        boom: Boolean(this.gateBoom),
      },
      lampsNamed: this.twistLampsNamed,
      lampCount: this.twistLamps.length,
      laneSlots: laneSlotsState,
      stackFill: {
        occupied,
        capacity,
        cells: cells.map((c) => ({ x: c.x, z: c.z, tier: c.tier, occupied: c.occupied })),
      },
      crane: {
        hang: this._holdGantry() ? -(this._holdGantry().spreader?.position.y ?? 0) : 0,
        trolleyZ: this._holdGantry()?.trolley?.position.z ?? 0,
        busy: (plan.events ?? []).some((e) => e.resource === 'crane' && !e.queued && t >= e.t0 && t < e.t1),
      },
      ship: {
        outbound: Boolean(this.outbound),
        inbound: Boolean(this.inbound?.visible),
      },
      subject: this._subject,
      camera: this._camera,
      ghostCargo: ghosts,
      emptyBerthClean: !berthEmpty || decals === 0,
      queued: plan.queued?.length ?? 0,
      firstMotionAt: plan.firstMotion,
      demo: this.demo,
      playing: this.playing && t < (plan.playableDuration ?? 0) + 1,
    };
  }

  _fillSubject(phase) {
    const s = this._subject;
    s.x = 0;
    s.y = 0;
    s.z = 0;
    s.name = phase;
    const g = this._holdGantry();
    const take = (obj, name) => {
      if (!obj || obj.visible === false) return false;
      obj.getWorldPosition(_v1);
      s.x = _v1.x;
      s.y = _v1.y;
      s.z = _v1.z;
      s.name = name;
      return true;
    };
    if (phase === 'unload' || phase === 'load') {
      if (g?.cargoMount && g.cargoMount.children.length) {
        if (take(g.cargoMount, 'spreader-cargo')) return;
      }
      if (take(g?.spreader, 'spreader')) return;
    }
    if (phase === 'depart' && take(this.outbound, 'outbound')) return;
    if (phase === 'arrive') {
      if (take(this.inbound, 'inbound')) return;
      if (take(this.logistics?.tankerBerth?.holder, 'tanker')) return;
    }
    if ((phase === 'road' || phase === 'truck') && this.trucks[0] && take(this.trucks[0], 'tractor')) {
      return;
    }
    if (phase === 'rail' && take(this.consist, 'consist')) return;
    if (phase === 'tanker' && take(this.logistics?.tankerBerth?.holder, 'tanker')) return;
    if (take(g?.spreader, 'spreader')) return;
    const berth = this.logistics?.containerBerth;
    if (berth) {
      const w = this._toWorld(berth.x, 4, berth.z);
      s.x = w.x;
      s.y = w.y;
      s.z = w.z;
      s.name = 'berth';
    }
  }

  _fillCamera(phase) {
    const camPhase = phase === 'road' ? 'truck' : phase;
    const spec = portCameraPose(camPhase);
    this._fillSubject(camPhase);
    this._camera.target.x = this._subject.x;
    this._camera.target.y = this._subject.y;
    this._camera.target.z = this._subject.z;
    this._camera.azimuth = spec.azimuth;
    this._camera.polar = spec.polar;
    this._camera.distance = spec.distance;
    this._camera.phase = camPhase;
    return this._camera;
  }

  cameraPose(phase) {
    const p = phase || this.statusSnapshot?.phase || 'load';
    return this._fillCamera(p);
  }

  status() {
    return this.statusSnapshot;
  }

  resourceLocks() {
    if (!this.playing || !this.plan) {
      return beatResourceLocks(null, 0, { gateOpen: 0 });
    }
    return beatResourceLocks(this.plan, this.time, { gateOpen: this._gateOpen });
  }

  update(dt) {
    if (!this.playing || !this.plan) return;
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.time += step;
    this._eval(this.time);
    if (this.time > (this.plan.playableDuration ?? BEAT_MAX_SECONDS) + 2) {
      this.playing = false;
    }
  }

  dispose() {
    this.resetLive();
    if (this.animRoot) {
      this.animRoot.parent?.remove(this.animRoot);
      this.animRoot = null;
    }
    this.port = null;
    this.logistics = null;
  }
}

export function bindPortDemoConsole(layer) {
  const win = globalThis.window;
  if (!win || !layer) return;
  if (!win.dd || typeof win.dd !== 'object') win.dd = {};
  win.dd.portDemo = () => layer.portDemo();
  win.dd.portDemoStatus = () => layer.portDemoStatus();
  win.dd.portCamera = (phase) => layer.portCamera(phase);
  win.dd.portAmbientStatus = () => layer.portAmbientStatus?.() ?? null;
  if (win.__districtDeck && typeof win.__districtDeck === 'object') {
    win.__districtDeck.portDemo = win.dd.portDemo;
    win.__districtDeck.portDemoStatus = win.dd.portDemoStatus;
    win.__districtDeck.portCamera = win.dd.portCamera;
    win.__districtDeck.portAmbientStatus = win.dd.portAmbientStatus;
  }
}
