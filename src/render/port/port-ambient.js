// District Deck — P13 Lane C5 ambient port life between beats.
// Deterministic: seeded index maths only. No clock reads outside `dt`.
// Yields to beat choreography via `beatResourceLocks`. Pooled: no per-frame `new`.

import * as THREE from 'three';
import {
  GATE_BOOM_DEG,
  GATE_BOOM_SECONDS,
  PERSON_BOB_AMP,
  PERSON_BOB_HZ,
  beatResourceLocks,
  clamp01,
  easeInOutCubic,
  easeInOutQuad,
  polylineLength,
  samplePolyline,
  smoothstep,
} from './logistics-anim.js';
import {
  addDepartWake,
  addLightEngine,
  addPalletCrate,
  addPortGull,
  addTerminalTractor,
  disposeVehicle,
} from './port-vehicles.js';
import { CONTAINER_BOX as BOX } from './container-stamps.js';
import { updateI4Strollers } from '../fringe/port.js';
import { CONTAINER_DECK_WALK } from '../fringe/ships.js';

export const AMBIENT_TRACTOR_SEP_M = 20;
export const AMBIENT_GATE_PAUSE = 1.2;
export const AMBIENT_TURN_RADIUS = 6;
export const AMBIENT_TRACTOR_SPEED = 7;
export const AMBIENT_FORKLIFT_PERIOD = 40;
export const AMBIENT_STACKER_PERIOD = 60;
export const AMBIENT_GANTRY_PERIOD = 90;
export const AMBIENT_CLIPBOARD_PERIOD = 15;
export const AMBIENT_RIGGER_PERIOD = 25;
export const AMBIENT_PILOT_PERIOD = 70;
export const AMBIENT_DREDGER_PERIOD = 40;
export const AMBIENT_RAIL_PERIOD = 120;
export const AMBIENT_DECK_CRANE_PERIOD = 50;
export const AMBIENT_DECK_WALK_PERIOD = 36;
export const AMBIENT_GULL_PERIOD_A = 22;
export const AMBIENT_GULL_PERIOD_B = 28;
export const AMBIENT_PATROL_PERIOD = 18;
export const AMBIENT_DECK_CRANE_SWING = (20 * Math.PI) / 180;
const GATE_BOOM_RAD = (GATE_BOOM_DEG * Math.PI) / 180;
const TWO_PI = Math.PI * 2;

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _haulPts = [];
const _gateS = [0, 0];
const EMPTY_LOCKS = beatResourceLocks(null, 0);

export function ambientUnit(seed, index) {
  let n = Math.imul(((seed >>> 0) ^ 0x9e3779b9) >>> 0, (index + 1) | 0) >>> 0;
  n ^= n >>> 16;
  n = Math.imul(n, 0x7feb352d) >>> 0;
  n ^= n >>> 15;
  n = Math.imul(n, 0x846ca68b) >>> 0;
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

export function ambientPhase(seed, index, period) {
  return ambientUnit(seed, index) * (period || 1);
}

function wrap01(t) {
  const x = t - Math.floor(t);
  return x < 0 ? x + 1 : x;
}

function modTime(t, period) {
  const p = period || 1;
  let x = t % p;
  if (x < 0) x += p;
  return x;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function pulse(t, period, phase, on) {
  const local = modTime(t - phase, period);
  return local < on;
}

/**
 * Racetrack on the haul road. Straights at z = haulZ ± radius; 180° caps of
 * `radius` metres so a tractor never pivots in place.
 */
function loopPoint(out, n, x, z) {
  let p = out[n];
  if (!p) {
    p = { x: 0, z: 0 };
    out[n] = p;
  }
  p.x = x;
  p.z = z;
  return n + 1;
}

export function fillHaulLoop(out, cx, haulZ, xWest, xEast, radius = AMBIENT_TURN_RADIUS) {
  const r = radius;
  const step = 5;
  let n = 0;
  for (let x = xWest; x <= xEast + 1e-6; x += step) {
    n = loopPoint(out, n, x, haulZ + r);
  }
  const nArc = 10;
  for (let i = 1; i < nArc; i += 1) {
    const a = Math.PI / 2 - (Math.PI * i) / nArc;
    n = loopPoint(out, n, xEast + r * Math.cos(a), haulZ + r * Math.sin(a));
  }
  for (let x = xEast; x >= xWest - 1e-6; x -= step) {
    n = loopPoint(out, n, x, haulZ - r);
  }
  for (let i = 1; i < nArc; i += 1) {
    const a = -Math.PI / 2 - (Math.PI * i) / nArc;
    n = loopPoint(out, n, xWest + r * Math.cos(a), haulZ + r * Math.sin(a));
  }
  n = loopPoint(out, n, xWest, haulZ + r);
  out.length = n;
  return out;
}

export function nearestLoopS(pts, x, z) {
  let bestS = 0;
  let bestD = Infinity;
  let acc = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const dx = pts[i].x - pts[i - 1].x;
    const dz = pts[i].z - pts[i - 1].z;
    const seg = Math.hypot(dx, dz);
    const inv = seg < 1e-6 ? 0 : 1 / (seg * seg);
    const u = clamp01(((x - pts[i - 1].x) * dx + (z - pts[i - 1].z) * dz) * inv);
    const px = pts[i - 1].x + dx * u;
    const pz = pts[i - 1].z + dz * u;
    const d = Math.hypot(x - px, z - pz);
    if (d < bestD) {
      bestD = d;
      bestS = acc + u * seg;
    }
    acc += seg;
  }
  return bestS;
}

/**
 * Distance along a loop with 1.2 s stops at each gate station. `phase` is a
 * time offset so two tractors can sit on opposite sides of the same schedule.
 */
export function loopDistanceAt(time, phase, length, speed, gates, pause = AMBIENT_GATE_PAUSE) {
  const v = Math.max(0.1, speed);
  const L = Math.max(1e-3, length);
  const g0 = gates[0] ?? 0;
  const g1 = gates[1] ?? g0;
  const a = Math.min(g0, g1);
  const b = Math.max(g0, g1);
  const lapT = L / v + 2 * pause;
  let local = modTime(time + phase, lapT);
  const d0 = a / v;
  if (local < d0) return local * v;
  local -= d0;
  if (local < pause) return a;
  local -= pause;
  const d1 = (b - a) / v;
  if (local < d1) return a + local * v;
  local -= d1;
  if (local < pause) return b;
  local -= pause;
  return Math.min(L, b + local * v);
}

export function tractorPairFromLoop(time, seed, pts, length, gates) {
  const L = Math.max(1e-3, length);
  const phase0 = ambientPhase(seed, 0, L / AMBIENT_TRACTOR_SPEED);
  const s0 = loopDistanceAt(time, phase0, L, AMBIENT_TRACTOR_SPEED, gates);
  const s1 = (s0 + L * 0.5) % L;
  const a = samplePolyline(pts, s0 / L);
  const b = samplePolyline(pts, s1 / L);
  const g0 = gates[0] ?? 0;
  const g1 = gates[1] ?? 0;
  const atGate = (s) => {
    const d0 = Math.abs(s - g0);
    const d1 = Math.abs(s - g1);
    const d0b = Math.abs(s - g0 - L);
    return Math.min(d0, d1, d0b) < 1.25;
  };
  const along = Math.min(Math.abs(s0 - s1), L - Math.abs(s0 - s1));
  return {
    a: { x: a.x, z: a.z, yaw: a.yaw, s: s0, loaded: true, atGate: atGate(s0) },
    b: { x: b.x, z: b.z, yaw: b.yaw, s: s1, loaded: false, atGate: atGate(s1) },
    sep: along,
    euclid: Math.hypot(a.x - b.x, a.z - b.z),
    length: L,
  };
}

export function tractorPairAt(time, seed, cx = 38.92, haulZ = -12, gateX = null) {
  fillHaulLoop(_haulPts, cx, haulZ, cx - 22, cx + 78, AMBIENT_TURN_RADIUS);
  const L = polylineLength(_haulPts);
  const gx = gateX ?? cx + 61;
  _gateS[0] = nearestLoopS(_haulPts, gx, haulZ + AMBIENT_TURN_RADIUS);
  _gateS[1] = nearestLoopS(_haulPts, gx, haulZ - AMBIENT_TURN_RADIUS);
  return tractorPairFromLoop(time, seed, _haulPts, L, _gateS);
}

export function forkliftPoseAt(localT, drum, door) {
  const T = AMBIENT_FORKLIFT_PERIOD;
  const t = modTime(localT, T);
  const from = drum ?? { x: 0, z: 0 };
  const to = door ?? { x: 8, z: 0 };
  const yawGo = Math.atan2(to.x - from.x, to.z - from.z);
  const yawBack = yawGo + Math.PI;
  let x = from.x;
  let z = from.z;
  let yaw = yawGo;
  let mast = 0;
  let carrying = false;
  let phase = 'lift';
  if (t < 5) {
    mast = easeInOutCubic(t / 5);
    carrying = true;
    phase = 'lift';
  } else if (t < 8) {
    const u = (t - 5) / 3;
    const back = 2.4 * easeInOutQuad(u);
    x = from.x - Math.sin(yawGo) * back;
    z = from.z - Math.cos(yawGo) * back;
    yaw = yawGo;
    mast = 1;
    carrying = true;
    phase = 'reverse';
  } else if (t < 12) {
    const u = easeInOutCubic((t - 8) / 4);
    yaw = yawGo + u * Math.PI * 0.08;
    x = from.x;
    z = from.z;
    mast = 1;
    carrying = true;
    phase = 'turn';
  } else if (t < 24) {
    const u = easeInOutCubic((t - 12) / 12);
    x = lerp(from.x, to.x, u);
    z = lerp(from.z, to.z, u);
    yaw = yawGo;
    mast = 1;
    carrying = true;
    phase = 'drive';
  } else if (t < 28) {
    x = to.x;
    z = to.z;
    yaw = yawGo;
    mast = 1 - easeInOutCubic((t - 24) / 4);
    carrying = t < 26.4;
    phase = 'lower';
  } else if (t < 32) {
    const u = (t - 28) / 4;
    const back = 2.2 * easeInOutQuad(u);
    x = to.x - Math.sin(yawBack) * back;
    z = to.z - Math.cos(yawBack) * back;
    yaw = yawBack;
    mast = 0;
    carrying = false;
    phase = 'reverse';
  } else {
    const u = easeInOutCubic((t - 32) / 8);
    x = lerp(to.x, from.x, u);
    z = lerp(to.z, from.z, u);
    yaw = yawBack;
    mast = 0;
    carrying = false;
    phase = 'return';
  }
  return { x, z, yaw, mast, carrying, phase };
}

export function stackerCycleAt(localT, home, from, to) {
  const T = AMBIENT_STACKER_PERIOD;
  const t = modTime(localT, T);
  const h = home ?? { x: 0, z: 0, yaw: 0 };
  const d = from ?? h;
  const e = to ?? h;
  const segs = [
    { t0: 0, t1: 8, ax: h.x, az: h.z, bx: d.x, bz: d.z, carry: false, act: 'to-d' },
    { t0: 8, t1: 16, ax: d.x, az: d.z, bx: d.x, bz: d.z, carry: true, act: 'pick' },
    { t0: 16, t1: 30, ax: d.x, az: d.z, bx: e.x, bz: e.z, carry: true, act: 'to-e' },
    { t0: 30, t1: 38, ax: e.x, az: e.z, bx: e.x, bz: e.z, carry: false, act: 'drop' },
    { t0: 38, t1: 52, ax: e.x, az: e.z, bx: h.x, bz: h.z, carry: false, act: 'return' },
    { t0: 52, t1: 60, ax: h.x, az: h.z, bx: h.x, bz: h.z, carry: false, act: 'idle' },
  ];
  let seg = segs[segs.length - 1];
  for (let i = 0; i < segs.length; i += 1) {
    if (t < segs[i].t1 || i === segs.length - 1) {
      seg = segs[i];
      break;
    }
  }
  const u = clamp01((t - seg.t0) / Math.max(1e-6, seg.t1 - seg.t0));
  const k = easeInOutCubic(u);
  const x = lerp(seg.ax, seg.bx, k);
  const z = lerp(seg.az, seg.bz, k);
  const moving = Math.hypot(seg.bx - seg.ax, seg.bz - seg.az) > 0.4;
  const yaw = moving ? Math.atan2(seg.bx - seg.ax, seg.bz - seg.az) : (h.yaw ?? 0);
  const boom = seg.act === 'pick' || seg.act === 'drop'
    ? 0.35 + 0.55 * Math.sin(u * Math.PI)
    : 0.55;
  return { x, z, yaw, carry: seg.carry, phase: seg.act, boom };
}

// Integrate a smoothstep velocity ramp: two seconds accelerating, a steady
// traverse, then two seconds braking. Position and velocity are continuous.
function gantryTraverseAt(t, start, end) {
  const duration = end - start;
  const ramp = 2;
  const elapsed = Math.max(0, Math.min(duration, t - start));
  const rampDistance = (seconds) => {
    const u = seconds / ramp;
    return ramp * u * u * u * (1 - u * 0.5);
  };
  if (elapsed < ramp) return rampDistance(elapsed) / (duration - ramp);
  if (elapsed > duration - ramp) return 1 - rampDistance(duration - elapsed) / (duration - ramp);
  return (elapsed - ramp * 0.5) / (duration - ramp);
}

export function gantryIdleAt(localT, landZ, tipZ, hangPark = 4.2, hangRaised = 3.4) {
  const T = AMBIENT_GANTRY_PERIOD;
  const t = modTime(localT, T);
  const land = landZ ?? -3.35;
  const tip = tipZ ?? 28.55;
  let trolleyZ = land;
  let hang = hangPark;
  let phase = 'park';
  // Two-second hoists and 40-second traverses join at zero velocity. The
  // built hold rig spans 35.4 m: peak travel is 0.015527 m per 60 Hz frame.
  if (t < 4) {
    trolleyZ = land;
    hang = lerp(hangPark, hangRaised, smoothstep(2, 4, t));
    phase = 'park';
  } else if (t < 44) {
    const u = gantryTraverseAt(t, 4, 44);
    trolleyZ = lerp(land, tip, u);
    hang = hangRaised;
    phase = 'out';
  } else if (t < 46) {
    trolleyZ = tip;
    hang = hangRaised;
    phase = 'tip';
  } else if (t < 86) {
    const u = gantryTraverseAt(t, 46, 86);
    trolleyZ = lerp(tip, land, u);
    hang = hangRaised;
    phase = 'back';
  } else {
    trolleyZ = land;
    hang = lerp(hangRaised, hangPark, smoothstep(86, 88, t));
    phase = 'park';
  }
  return { trolleyZ, hang, phase };
}

export function railPoseAt(localT, enterX, headX) {
  const T = AMBIENT_RAIL_PERIOD;
  const t = modTime(localT, T);
  const enter = enterX ?? 140;
  const head = headX ?? 90;
  let x = enter;
  let moving = false;
  let phase = 'idle';
  if (t < 12) {
    x = enter;
    phase = 'idle';
  } else if (t < 48) {
    x = lerp(enter, head, easeInOutCubic((t - 12) / 36));
    moving = true;
    phase = 'in';
  } else if (t < 58) {
    x = head;
    phase = 'dwell';
  } else if (t < 94) {
    x = lerp(head, enter, easeInOutCubic((t - 58) / 36));
    moving = true;
    phase = 'out';
  } else {
    x = enter;
    phase = 'idle';
  }
  return { x, moving, phase };
}

function setHangLocal(gantry, hang) {
  if (!gantry?.spreader) return;
  const h = Math.max(gantry.hangMin ?? 1.2, Math.min(gantry.hangMax ?? 28, hang));
  gantry.spreader.position.y = -h;
  const falls = gantry.falls ?? [];
  for (let i = 0; i < falls.length; i += 1) {
    const fall = falls[i];
    if (!fall) continue;
    fall.scale.y = h;
    fall.position.y = -0.4 - h * 0.5;
  }
}

function findByName(root, name) {
  return root?.getObjectByName?.(name) ?? null;
}

function workerKey(node) {
  const n = String(node?.name ?? '');
  const m = n.match(/^fringe:port-apron-worker:(\d+):([^:]+)/);
  if (!m) return null;
  return { index: Number(m[1]), job: m[2], node };
}

export class PortAmbientLoop {
  constructor(options = {}) {
    this.reducedMotion = Boolean(options.reducedMotion);
    this.seed = (options.seed ?? 0) >>> 0;
    this.time = 0;
    this.attached = false;
    this.port = null;
    this.director = null;
    this.logistics = null;
    this.root = null;
    this.tractors = [null, null];
    this.pallet = null;
    this.engine = null;
    this.gulls = [null, null];
    this.pilotWake = null;
    this.forklift = null;
    this.forkRest = [];
    this.mastRest = [];
    this.stacker2 = null;
    this.stacker2Home = null;
    this.stacker2Cargo = null;
    this.hold = null;
    this.gateBoom = null;
    this.gateBoomRest = 0;
    this.workers = {
      watch: null,
      clipboard: null,
      clipboardMesh: null,
      clipboardRest: 0,
      rigger: null,
      riggerY: 0,
      riggerRotX: 0,
      patrolA: null,
      patrolB: null,
      patrolA0: null,
      patrolB0: null,
      signal: null,
      signalArm: null,
      signalArmQ: null,
    };
    this.pilot = null;
    this.pilotRest = null;
    this.dredger = null;
    this.ladderPivot = null;
    this.ladderRest = 0;
    this.pierce = [];
    this.pierceScale = [];
    this.deckWalker = null;
    this.deckWalker0 = null;
    this.deckCrane = null;
    this.deckCraneRest = 0;
    this.apronY = 0;
    this.cx = 38.92;
    this.haulZ = -12;
    this.gateX = 99.92;
    this.haulLoop = [];
    this.haulLen = 1;
    this.haulGateS = [0, 0];
    this._msRing = new Float64Array(48);
    this._msSort = new Float64Array(48);
    this._msI = 0;
    this._msN = 0;
    this._locks = EMPTY_LOCKS;
    this.statusSnapshot = {
      time: 0,
      seed: 0,
      reducedMotion: false,
      locks: EMPTY_LOCKS,
      tractors: [
        { x: 0, z: 0, yaw: 0, loaded: true, atGate: false },
        { x: 0, z: 0, yaw: 0, loaded: false, atGate: false },
      ],
      separation: 0,
      forklift: { x: 0, z: 0, mast: 0, phase: 'idle' },
      stacker2: { x: 0, z: 0, phase: 'idle' },
      gantry: { trolleyZ: 0, hang: 0, phase: 'park', idle: false },
      crews: { clipboard: false, rigger: false, patrol: false, signal: false, watch: false },
      harbour: { pilotX: 0, pilotZ: 0, ladder: 0, gullYaw: 0 },
      rail: { x: 0, phase: 'idle' },
      deck: { walkX: 0, craneYaw: 0 },
      msP50: 0,
    };
  }

  attach(port, director) {
    this.port = port ?? null;
    this.director = director ?? null;
    this.logistics = port?.userData?.logistics ?? director?.logistics ?? null;
    if (!this.port || !this.logistics) return false;
    const terminal = this.port.getObjectByName('fringe:port-terminal') ?? this.port;
    if (!this.root) {
      this.root = new THREE.Group();
      this.root.name = 'fringe:port-ambient';
      terminal.add(this.root);
    }
    this.cx = this.logistics.containerBerth?.x ?? 38.92;
    this.haulZ = this.logistics.truckGate?.haulRoadZ ?? -12;
    this.gateX = this.logistics.truckGate?.x ?? this.cx + 61;
    fillHaulLoop(this.haulLoop, this.cx, this.haulZ, this.cx - 22, this.cx + 78, AMBIENT_TURN_RADIUS);
    this.haulLen = polylineLength(this.haulLoop);
    this.haulGateS[0] = nearestLoopS(this.haulLoop, this.gateX, this.haulZ + AMBIENT_TURN_RADIUS);
    this.haulGateS[1] = nearestLoopS(this.haulLoop, this.gateX, this.haulZ - AMBIENT_TURN_RADIUS);
    this.hold = this.logistics.gantries?.find((g) => g.id === 'hold')
      ?? this.logistics.gantries?.[0]
      ?? null;
    this.gateBoom = this.logistics.truckGate?.boom
      ?? findByName(this.port, 'fringe:port-gate:boom');
    if (this.gateBoom) this.gateBoomRest = this.gateBoom.rotation?.z ?? 0;

    this.forklift = findByName(this.port, 'fringe:port-forklift:0');
    this.apronY = this.forklift?.position.y ?? 0;
    this.forkliftHome = this.forklift
      ? { x: this.forklift.position.x, z: this.forklift.position.z, yaw: this.forklift.rotation.y }
      : null;
    this.forkRest = [];
    this.mastRest = [];
    if (this.forklift) {
      const fl = findByName(this.forklift, 'fringe:port-forklift:0:fork-left');
      const fr = findByName(this.forklift, 'fringe:port-forklift:0:fork-right');
      const ml = findByName(this.forklift, 'fringe:port-forklift:0:mast-left');
      const mr = findByName(this.forklift, 'fringe:port-forklift:0:mast-right');
      for (const n of [fl, fr]) {
        if (n) this.forkRest.push({ mesh: n, y: n.position.y });
      }
      for (const n of [ml, mr]) {
        if (n) this.mastRest.push({ mesh: n, y: n.position.y, sy: n.scale.y });
      }
    }

    this.stacker2 = findByName(this.port, 'fringe:port-stacker:2');
    if (this.stacker2) {
      this.stacker2Home = {
        x: this.stacker2.position.x,
        z: this.stacker2.position.z,
        yaw: this.stacker2.rotation.y,
      };
      this.stacker2Cargo = findByName(this.stacker2, 'fringe:port-stacker:2:cargo')
        ?? this.stacker2.userData?.cargo
        ?? null;
      this.stacker2Spreader = findByName(this.stacker2, 'fringe:port-stacker:2:spreader');
      /* ── P16-PM4 — THE CARRY POSE IS THE ONE THE MACHINE WAS BUILT WITH. ──
       * This cycle re-parents the box to the spreader and then typed its local
       * y as −1.55, which was a hand-fitted number for a 1.30 m box on the OLD
       * spreader. At the P16-PM4 module the box hung half a metre above where
       * `addReachStacker` puts it and the animation census read it inside the
       * machine's own fly boom on eleven samples out of twelve. Captured at
       * bind time instead, so the carry pose can never disagree with the build. */
      this.stacker2CarryY = this.stacker2Cargo ? this.stacker2Cargo.position.y : -1.55;
    }

    this._bindWorkers(terminal);
    this.pilot = findByName(this.port, 'fringe:port-pilot');
    if (this.pilot) {
      this.pilotRest = {
        x: this.pilot.position.x,
        y: this.pilot.position.y,
        z: this.pilot.position.z,
        yaw: this.pilot.rotation.y,
      };
    }
    this.dredger = findByName(this.port, 'fringe:port-dredger');
    this._bindLadder();
    this._bindPierce();
    this._bindDeck();
    this._spawnCast();
    this.attached = true;
    this._eval(0, EMPTY_LOCKS);
    return true;
  }

  _bindWorkers(terminal) {
    const found = [];
    terminal.traverse((ch) => {
      if (found.length > 24) return;
      const row = workerKey(ch);
      if (row && ch.parent && !found.some((f) => f.node === ch)) found.push(row);
    });
    const byJob = (job) => found.find((f) => f.job === job)?.node ?? null;
    const w = this.workers;
    w.watch = byJob('chassis-pin') ?? byJob('fork-guide');
    w.clipboard = byJob('spreader-watch') ?? byJob('hook-tally') ?? byJob('gate-log');
    w.rigger = byJob('stack-rigger') ?? byJob('twistlock') ?? byJob('rail-sweep');
    w.patrolA = byJob('line-tender') ?? byJob('bollard-watch');
    w.patrolB = byJob('yard-check') ?? byJob('yard-plan');
    w.signal = byJob('hook-signal');
    if (w.clipboard) {
      let clip = null;
      w.clipboard.traverse((ch) => {
        if (clip || !ch.isMesh || !ch.geometry) return;
        const p = ch.geometry.parameters;
        if (!p || p.width == null) return;
        if (p.width < 0.45 && p.height > 0.25 && p.depth < 0.7) clip = ch;
      });
      w.clipboardMesh = clip;
      w.clipboardRest = clip?.rotation.z ?? 0;
    }
    if (w.rigger) {
      w.riggerY = w.rigger.position.y;
      w.riggerRotX = w.rigger.rotation.x;
    }
    if (w.patrolA) {
      w.patrolA0 = { x: w.patrolA.position.x, y: w.patrolA.position.y, z: w.patrolA.position.z };
    }
    if (w.patrolB) {
      w.patrolB0 = { x: w.patrolB.position.x, y: w.patrolB.position.y, z: w.patrolB.position.z };
    }
    if (w.signal) {
      w.signalArm = findByName(w.signal, 'fringe:port-apron-worker:0:hook-signal:pointing-arm')
        ?? w.signal.getObjectByName?.(`${w.signal.name.replace(/:heading$/, '')}:pointing-arm`)
        ?? null;
      if (!w.signalArm) {
        w.signal.traverse((ch) => {
          if (w.signalArm) return;
          if (/pointing-arm$/.test(String(ch.name ?? ''))) w.signalArm = ch;
        });
      }
      if (w.signalArm) {
        w.signalArmQ = w.signalArm.quaternion.clone();
      }
    }
    if (w.watch) w.watchRestYaw = w.watch.rotation.y;
  }

  _bindLadder() {
    this.ladderPivot = null;
    if (!this.dredger) return;
    const kids = [];
    for (let i = 0; i < this.dredger.children.length; i += 1) {
      const ch = this.dredger.children[i];
      if (ch.position.x > 7.2 && Math.abs(ch.position.z) < 2.4) kids.push(ch);
    }
    if (!kids.length) return;
    const pivot = new THREE.Group();
    pivot.name = 'fringe:port-dredger:ladder-pivot';
    pivot.position.set(8.4, 1.85, 0);
    this.dredger.add(pivot);
    for (let i = 0; i < kids.length; i += 1) {
      pivot.attach(kids[i]);
    }
    this.ladderPivot = pivot;
    this.ladderRest = 0;
  }

  _bindPierce() {
    this.pierce = [];
    this.pierceScale = [];
    if (!this.dredger) return;
    this.dredger.getWorldPosition(_v1);
    const yaw = this.dredger.rotation.y;
    const px = _v1.x + Math.cos(yaw) * 13.6;
    const pz = _v1.z - Math.sin(yaw) * 13.6;
    const harbour = this.dredger.parent;
    harbour?.traverse((ch) => {
      if (!ch.isMesh || this.pierce.length > 6) return;
      if (ch.parent === this.dredger || this.dredger.children.includes(ch)) return;
      ch.getWorldPosition(_v2);
      if (_v2.y > 1.2 || _v2.y < -0.4) return;
      if (Math.hypot(_v2.x - px, _v2.z - pz) > 4.5) return;
      this.pierce.push(ch);
      this.pierceScale.push({ x: ch.scale.x, y: ch.scale.y, z: ch.scale.z });
    });
  }

  _bindDeck() {
    const bob = this.logistics?.containerBerth?.bob
      ?? this.logistics?.containerBerth?.holder?.children?.[0]
      ?? null;
    this.deckWalker = findByName(this.port, 'fringe:ship:container-deck-worker:0:heading')
      ?? findByName(bob, 'fringe:ship:container-deck-worker:0:heading')
      ?? null;
    if (!this.deckWalker && bob) {
      bob.traverse((ch) => {
        if (this.deckWalker) return;
        if (/container-deck-worker:0/.test(String(ch.name ?? '')) && /heading$/.test(ch.name)) {
          this.deckWalker = ch;
        }
      });
    }
    if (this.deckWalker) {
      this.deckWalker0 = {
        x: this.deckWalker.position.x,
        y: this.deckWalker.position.y,
        z: this.deckWalker.position.z,
        yaw: this.deckWalker.rotation.y,
      };
    }
    this.deckCrane = findByName(this.port, 'fringe:ship:tanker:deck-crane');
    if (this.deckCrane) this.deckCraneRest = this.deckCrane.rotation.y;
  }

  _spawnCast() {
    if (!this.tractors[0]) {
      const loaded = addTerminalTractor('timber', { id: 'ambient-0', loaded: true });
      const empty = addTerminalTractor(null, { id: 'ambient-1', loaded: false });
      this.root.add(loaded);
      this.root.add(empty);
      this.tractors[0] = loaded;
      this.tractors[1] = empty;
    }
    if (!this.pallet) {
      this.pallet = addPalletCrate({ id: 0, good: 'timber' });
      this.root.add(this.pallet);
    }
    if (!this.engine) {
      this.engine = addLightEngine({ id: 'ambient' });
      this.root.add(this.engine);
    }
    if (!this.gulls[0]) {
      const a = addPortGull(0);
      const b = addPortGull(1);
      this.root.add(a);
      this.root.add(b);
      this.gulls[0] = a;
      this.gulls[1] = b;
    }
    if (this.pilot && !this.pilotWake) {
      this.pilotWake = addDepartWake(10, 3.2);
      this.pilot.add(this.pilotWake);
      this.pilotWake.position.set(-3.2, 0.08, 0);
    }
  }

  setSeed(seed) {
    this.seed = (seed ?? 0) >>> 0;
  }

  setReducedMotion(on) {
    this.reducedMotion = Boolean(on);
    if (this.attached) this._eval(this.time, this._locks);
  }

  update(dt, director, seed) {
    if (!this.attached) return;
    if (director) this.director = director;
    if (seed != null) this.seed = seed >>> 0;
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    if (!this.reducedMotion) this.time += step;
    let scene = this.port;
    while (scene.parent) scene = scene.parent;
    updateI4Strollers(this.time, scene, this.reducedMotion);
    const locks = director?.resourceLocks?.()
      ?? beatResourceLocks(director?.plan, director?.time, { gateOpen: director?._gateOpen });
    this._locks = locks;
    const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
    this._eval(this.time, locks);
    if (t0) {
      const took = (performance.now() - t0);
      this._msRing[this._msI] = took;
      this._msI = (this._msI + 1) % this._msRing.length;
      if (this._msN < this._msRing.length) this._msN += 1;
    }
  }

  _eval(t, locks) {
    const frozen = this.reducedMotion;
    const time = frozen ? 0 : t;
    const seed = this.seed;
    const L = this.logistics;
    const cx = this.cx;
    const haulZ = this.haulZ;

    const pair = this.haulLoop.length
      ? tractorPairFromLoop(time, seed, this.haulLoop, this.haulLen, this.haulGateS)
      : tractorPairAt(time, seed, cx, haulZ, this.gateX);
    const yieldTractor = Boolean(locks.tractor && locks.truckPhase && locks.truckPhase !== 'city');
    if (this.tractors[0] && this.tractors[1]) {
      const poses = [pair.a, pair.b];
      for (let i = 0; i < 2; i += 1) {
        const tr = this.tractors[i];
        const pose = poses[i];
        if (frozen || yieldTractor) {
          const parkX = i === 0 ? cx - 22 : cx + 78;
          const parkZ = haulZ + (i === 0 ? AMBIENT_TURN_RADIUS : -AMBIENT_TURN_RADIUS);
          if (frozen) {
            tr.position.set(pose.x, this.apronY, pose.z);
            tr.rotation.y = pose.yaw;
          } else {
            tr.position.x = lerp(tr.position.x, parkX, 0.08);
            tr.position.z = lerp(tr.position.z, parkZ, 0.08);
            tr.position.y = this.apronY;
          }
        } else {
          tr.position.set(pose.x, this.apronY, pose.z);
          tr.rotation.y = pose.yaw;
        }
        tr.visible = true;
        poses[i].x = tr.position.x;
        poses[i].z = tr.position.z;
      }
    }

    const boomHeld = Boolean(locks.gate);
    const atGate = !yieldTractor && !frozen && (pair.a.atGate || pair.b.atGate);
    if (this.gateBoom && !boomHeld) {
      const want = atGate ? 1 : 0;
      const cur = (this.gateBoom.rotation.z - this.gateBoomRest) / (GATE_BOOM_RAD || -1);
      const next = want > 0.5
        ? Math.min(1, cur + (1 / Math.max(0.12, GATE_BOOM_SECONDS)) * 0.016 * 2.2)
        : Math.max(0, cur - (1 / Math.max(0.12, GATE_BOOM_SECONDS)) * 0.016 * 2.2);
      const u = want > 0.5 ? 1 : (atGate ? 1 : next);
      this.gateBoom.rotation.z = this.gateBoomRest + (atGate ? 1 : Math.max(0, Math.min(1, u))) * GATE_BOOM_RAD;
      if (frozen) this.gateBoom.rotation.z = this.gateBoomRest;
    }

    const drum = { x: cx + 6.5, z: -18.4 };
    const door = { x: cx + 18.9, z: -15.4 };
    const forkPhase = ambientPhase(seed, 3, AMBIENT_FORKLIFT_PERIOD);
    const fork = forkliftPoseAt(time + forkPhase, drum, door);
    if (this.forklift) {
      if (frozen && this.forkliftHome) {
        this.forklift.position.x = this.forkliftHome.x;
        this.forklift.position.z = this.forkliftHome.z;
        this.forklift.rotation.y = this.forkliftHome.yaw;
      } else if (!frozen) {
        this.forklift.position.x = fork.x;
        this.forklift.position.z = fork.z;
        this.forklift.rotation.y = fork.yaw;
      }
      const mast = frozen ? 0 : fork.mast;
      for (let i = 0; i < this.forkRest.length; i += 1) {
        const row = this.forkRest[i];
        row.mesh.position.y = row.y + mast * 1.35;
      }
      for (let i = 0; i < this.mastRest.length; i += 1) {
        const row = this.mastRest[i];
        row.mesh.position.y = row.y + mast * 0.55;
      }
    }
    if (this.pallet) {
      if (this.forklift && fork.carrying && !frozen) {
        if (this.pallet.parent !== this.forklift) this.forklift.attach(this.pallet);
        this.pallet.position.set(0, 0.28 + fork.mast * 1.35, 1.32);
        this.pallet.rotation.set(0, 0, 0);
        this.pallet.visible = true;
      } else {
        if (this.pallet.parent !== this.root) this.root.attach(this.pallet);
        const drop = fork.carrying ? drum : (fork.phase === 'lower' || fork.phase === 'return' || fork.phase === 'reverse' ? door : drum);
        const restAt = fork.phase === 'return' || fork.phase === 'idle' || frozen ? drum : drop;
        this.pallet.position.set(restAt.x, this.apronY + 0.06, restAt.z);
        this.pallet.rotation.set(0, 0, 0);
        this.pallet.visible = true;
      }
    }

    const stHome = this.stacker2Home ?? { x: cx + 56, z: -12.2, yaw: Math.PI };
    const blockD = { x: cx + 56, z: -19 };
    const blockE = { x: cx + 94, z: -19 };
    const stPhase = ambientPhase(seed, 4, AMBIENT_STACKER_PERIOD);
    const st = stackerCycleAt(time + stPhase, stHome, blockD, blockE);
    if (this.stacker2 && frozen && this.stacker2Home) {
      this.stacker2.position.x = this.stacker2Home.x;
      this.stacker2.position.z = this.stacker2Home.z;
      this.stacker2.rotation.y = this.stacker2Home.yaw;
    } else if (this.stacker2 && !frozen) {
      this.stacker2.position.x = st.x;
      this.stacker2.position.z = st.z;
      this.stacker2.rotation.y = st.yaw;
    }
    if (this.stacker2Cargo) {
      const spreader = this.stacker2Spreader ?? this.stacker2Cargo.parent;
      if (st.carry && spreader && this.stacker2Cargo.parent !== spreader) {
        spreader.attach(this.stacker2Cargo);
        this.stacker2Cargo.position.set(0, this.stacker2CarryY ?? -1.55, 0);
      }
      /* Set down on the deck, half a module up — 1.45 was the old box's own
         half-height plus the apron and is not a number this file may keep. */
      const groundY = this.apronY + 0.10 + BOX.h * 0.5 + 0.045;
      /* The box is set down IN FRONT of the machine, not on the spot the machine
         itself stops at. `blockD` / `blockE` are the stacker's travel targets and
         the box's rest position was the same point, so the machine parked inside
         its own load — at the old module the box was short enough to hide in the
         chassis and at 4.24 m it is 0.88 m through it. The machine's parked yaw
         is π and it reaches toward −z, which is where the box now goes. */
      const reachZ = 5.6;
      if (!st.carry && st.phase === 'drop') {
        if (this.stacker2Cargo.parent !== this.root) this.root.attach(this.stacker2Cargo);
        this.stacker2Cargo.position.set(blockE.x, groundY, blockE.z - reachZ);
      }
      if (!st.carry && (st.phase === 'idle' || st.phase === 'to-d' || st.phase === 'return')) {
        if (this.stacker2Cargo.parent !== this.root) this.root.attach(this.stacker2Cargo);
        this.stacker2Cargo.position.set(blockD.x, groundY, blockD.z - reachZ);
      }
      this.stacker2Cargo.visible = true;
    }

    const craneIdle = !locks.playing && !locks.crane && this.hold?.trolley;
    const gPhase = ambientPhase(seed, 5, AMBIENT_GANTRY_PERIOD);
    const landZ = this.hold?.landZ ?? -3.35;
    const tipZ = Math.min(this.hold?.trolleyMaxZ ?? Infinity,
      (this.hold?.seaZ ?? 3.55) + (this.hold?.boomSea ?? 25));
    const gi = gantryIdleAt(time + gPhase, landZ, tipZ);
    if (craneIdle && !frozen) {
      this.hold.trolley.position.z = gi.trolleyZ;
      setHangLocal(this.hold, gi.hang);
    }

    this._evalCrews(time, seed, frozen, pair);
    this._evalHarbour(time, seed, frozen);
    this._evalRail(time, seed, frozen, locks);
    this._evalDeck(time, seed, frozen);

    const snap = this.statusSnapshot;
    snap.time = t;
    snap.seed = seed;
    snap.reducedMotion = frozen;
    snap.locks = locks;
    snap.tractors[0].x = pair.a.x;
    snap.tractors[0].z = pair.a.z;
    snap.tractors[0].yaw = pair.a.yaw;
    snap.tractors[0].loaded = true;
    snap.tractors[0].atGate = pair.a.atGate;
    snap.tractors[1].x = pair.b.x;
    snap.tractors[1].z = pair.b.z;
    snap.tractors[1].yaw = pair.b.yaw;
    snap.tractors[1].loaded = false;
    snap.tractors[1].atGate = pair.b.atGate;
    snap.separation = pair.sep;
    snap.forklift.x = fork.x;
    snap.forklift.z = fork.z;
    snap.forklift.mast = fork.mast;
    snap.forklift.phase = fork.phase;
    snap.stacker2.x = st.x;
    snap.stacker2.z = st.z;
    snap.stacker2.phase = st.phase;
    snap.gantry.trolleyZ = craneIdle ? gi.trolleyZ : (this.hold?.trolley?.position.z ?? 0);
    snap.gantry.hang = craneIdle ? gi.hang : 0;
    snap.gantry.phase = gi.phase;
    snap.gantry.idle = Boolean(craneIdle);
    snap.msP50 = this._msP50();
  }

  _msP50() {
    const n = this._msN;
    if (!n) return 0;
    const src = this._msRing;
    const dst = this._msSort;
    for (let i = 0; i < n; i += 1) dst[i] = src[i];
    for (let i = 1; i < n; i += 1) {
      const v = dst[i];
      let j = i - 1;
      while (j >= 0 && dst[j] > v) {
        dst[j + 1] = dst[j];
        j -= 1;
      }
      dst[j + 1] = v;
    }
    return dst[n >> 1];
  }

  _evalCrews(time, seed, frozen, pair) {
    const w = this.workers;
    const clipOn = !frozen && pulse(time, AMBIENT_CLIPBOARD_PERIOD, ambientPhase(seed, 6, AMBIENT_CLIPBOARD_PERIOD), 2.2);
    let rigOn = !frozen && pulse(time, AMBIENT_RIGGER_PERIOD, ambientPhase(seed, 7, AMBIENT_RIGGER_PERIOD), 4.0);
    if (clipOn && rigOn) rigOn = false;
    const patrolOn = !frozen;
    let watchOn = false;
    let signalOn = false;

    if (w.clipboardMesh) {
      w.clipboardMesh.rotation.z = w.clipboardRest + (clipOn ? -0.55 : 0);
    }
    if (w.rigger) {
      w.rigger.position.y = w.riggerY + (rigOn ? 0.38 : 0);
      w.rigger.rotation.x = w.riggerRotX + (rigOn ? -0.28 : 0);
    }
    if (w.watch) {
      const rest = w.watchRestYaw ?? 0;
      if (frozen) {
        w.watch.rotation.y = rest;
      } else {
        const tx = pair.a.x;
        const tz = pair.a.z;
        const dx = tx - w.watch.position.x;
        const dz = tz - w.watch.position.z;
        const dist = Math.hypot(dx, dz);
        watchOn = dist < 16;
        const want = watchOn ? Math.atan2(dx, dz) : rest;
        const cur = w.watch.rotation.y;
        let dYaw = want - cur;
        while (dYaw > Math.PI) dYaw -= TWO_PI;
        while (dYaw < -Math.PI) dYaw += TWO_PI;
        w.watch.rotation.y = cur + dYaw * 0.12;
      }
    }
    if (w.patrolA && w.patrolA0 && patrolOn) {
      const u = wrap01((time + ambientPhase(seed, 8, AMBIENT_PATROL_PERIOD)) / AMBIENT_PATROL_PERIOD);
      const ping = u < 0.5 ? u * 2 : 1 - (u - 0.5) * 2;
      const e = easeInOutQuad(ping);
      w.patrolA.position.x = w.patrolA0.x;
      w.patrolA.position.z = w.patrolA0.z - e * 8.5;
      w.patrolA.position.y = w.patrolA0.y + PERSON_BOB_AMP * Math.sin(time * PERSON_BOB_HZ * TWO_PI);
      w.patrolA.rotation.y = ping < 0.5 ? Math.PI : 0;
    } else if (w.patrolA && w.patrolA0 && frozen) {
      w.patrolA.position.set(w.patrolA0.x, w.patrolA0.y, w.patrolA0.z);
    }
    if (w.patrolB && w.patrolB0 && patrolOn) {
      const u = wrap01((time + ambientPhase(seed, 9, AMBIENT_PATROL_PERIOD)) / AMBIENT_PATROL_PERIOD);
      const ping = u < 0.5 ? u * 2 : 1 - (u - 0.5) * 2;
      const e = easeInOutQuad(ping);
      w.patrolB.position.x = w.patrolB0.x;
      w.patrolB.position.z = w.patrolB0.z + e * 8.5;
      w.patrolB.position.y = w.patrolB0.y + PERSON_BOB_AMP * Math.sin(time * PERSON_BOB_HZ * TWO_PI + 1.1);
      w.patrolB.rotation.y = ping < 0.5 ? 0 : Math.PI;
    } else if (w.patrolB && w.patrolB0 && frozen) {
      w.patrolB.position.set(w.patrolB0.x, w.patrolB0.y, w.patrolB0.z);
    }
    if (w.signalArm && w.signalArmQ) {
      const spreader = this.hold?.spreader;
      if (spreader && w.signal && !frozen) {
        spreader.getWorldPosition(_v1);
        w.signal.getWorldPosition(_v2);
        signalOn = Math.hypot(_v1.x - _v2.x, _v1.z - _v2.z) < 14;
      }
      if (signalOn) {
        _q2.setFromAxisAngle(_v1.set(0, 0, 1), -0.85);
        w.signalArm.quaternion.copy(w.signalArmQ).multiply(_q2);
      } else {
        w.signalArm.quaternion.copy(w.signalArmQ);
      }
    }
    const crews = this.statusSnapshot.crews;
    crews.clipboard = clipOn;
    crews.rigger = rigOn;
    crews.patrol = patrolOn;
    crews.signal = signalOn;
    crews.watch = watchOn;
  }

  _evalHarbour(time, seed, frozen) {
    const cx = this.cx;
    if (this.pilot && this.pilotRest) {
      if (frozen) {
        this.pilot.position.set(this.pilotRest.x, this.pilotRest.y, this.pilotRest.z);
        this.pilot.rotation.y = this.pilotRest.yaw;
        if (this.pilotWake) this.pilotWake.visible = false;
      } else {
        // ── P16-PM2 ITEM 2 — THE PILOT'S LAP IS A LANE, NOT A CIRCLE. ──
        // The shipped lap was centred at local (cx + 22, 48) with radii 18 × 14,
        // and the P16 census walked it: it passed straight through the barge's
        // hull and through tug:0 twice a circuit — 88 s of a 30 s-visible pose
        // in which a pilot cutter drives through a moored barge. The lap now
        // fits the pocket between the barge, tug:0 and the working cluster, and
        // its clearance is stated in `WATER_PLAN.lanes.pilot` in port.js: 5.9 m
        // to the nearest hull at every point of the ellipse.
        const per = AMBIENT_PILOT_PERIOD;
        const u = wrap01((time + ambientPhase(seed, 10, per)) / per);
        const ang = u * TWO_PI;
        const rx = 6;
        const rz = 4;
        const px = cx + 59 + Math.cos(ang) * rx;
        const pz = 70 + Math.sin(ang) * rz;
        this.pilot.position.x = px;
        this.pilot.position.z = pz;
        this.pilot.position.y = this.pilotRest.y;
        const tx = cx + 59 + Math.cos(ang + 0.08) * rx;
        const tz = 70 + Math.sin(ang + 0.08) * rz;
        // The cutter's bow is its local +x (addCraftHull), so the heading is atan2(-dz, dx); the old
        // atan2(dx, dz) pointed local +z along the lap and drove the 8.2 m hull sideways round it.
        this.pilot.rotation.y = Math.atan2(-(tz - pz), tx - px);
        if (this.pilotWake) this.pilotWake.visible = true;
      }
      // W22-R2 boat transform hook: the route owns XZ/yaw, water owns heave/tilt.
      this.pilot.userData.applyOceanBuoyancy?.(time);
    }
    if (this.ladderPivot) {
      const u = frozen ? 0 : Math.sin(((time + ambientPhase(seed, 11, AMBIENT_DREDGER_PERIOD)) / AMBIENT_DREDGER_PERIOD) * TWO_PI);
      this.ladderPivot.rotation.z = this.ladderRest + u * 0.22;
    }
    const foam = frozen ? 1 : 0.82 + 0.28 * Math.abs(Math.sin((time / AMBIENT_DREDGER_PERIOD) * TWO_PI));
    for (let i = 0; i < this.pierce.length; i += 1) {
      const mesh = this.pierce[i];
      const rest = this.pierceScale[i];
      if (!mesh || !rest) continue;
      mesh.scale.set(rest.x * foam, rest.y, rest.z * foam);
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (mat && mat.opacity != null && mat.transparent) {
        if (mat.userData && mat.userData.ambOp == null) mat.userData.ambOp = mat.opacity;
        const base = mat.userData?.ambOp ?? mat.opacity;
        mat.opacity = frozen ? base : base * (0.65 + 0.35 * foam);
      }
    }
    const copeZ = 6.5;
    for (let i = 0; i < 2; i += 1) {
      const gull = this.gulls[i];
      if (!gull) continue;
      const per = i === 0 ? AMBIENT_GULL_PERIOD_A : AMBIENT_GULL_PERIOD_B;
      const u = wrap01((time + ambientPhase(seed, 12 + i, per)) / per);
      const ang = u * TWO_PI + (i === 0 ? 0 : Math.PI);
      const r = 16 + i * 4;
      const y = 10.5 + i * 2.4;
      gull.position.set(cx + Math.cos(ang) * r, frozen ? y : y + Math.sin(time * 1.4 + i) * 0.35, copeZ + Math.sin(ang) * (r * 0.45));
      gull.rotation.y = ang + Math.PI / 2;
      const flap = frozen ? 0.12 : 0.38 * Math.sin(time * 11 + i);
      if (gull.userData.wingL) gull.userData.wingL.rotation.x = flap;
      if (gull.userData.wingR) gull.userData.wingR.rotation.x = -flap;
    }
    const h = this.statusSnapshot.harbour;
    h.pilotX = this.pilot?.position.x ?? 0;
    h.pilotZ = this.pilot?.position.z ?? 0;
    h.ladder = this.ladderPivot?.rotation.z ?? 0;
    h.gullYaw = this.gulls[0]?.rotation.y ?? 0;
  }

  _evalRail(time, seed, frozen, locks) {
    const rh = this.logistics?.railHead;
    const enterX = rh?.enterX ?? this.cx + 105;
    const headX = rh?.x ?? this.cx + 50;
    const z = rh?.spurZ ?? rh?.z ?? -28.4;
    const phase = ambientPhase(seed, 14, AMBIENT_RAIL_PERIOD);
    const pose = railPoseAt(time + phase, enterX, headX);
    if (this.engine) {
      const hold = Boolean(locks.rail);
      const x = frozen || hold ? enterX : pose.x;
      this.engine.position.set(x, 0, z);
      this.engine.rotation.y = 0;
      this.engine.visible = true;
    }
    this.statusSnapshot.rail.x = this.engine?.position.x ?? enterX;
    this.statusSnapshot.rail.phase = locks.rail ? 'yield' : pose.phase;
  }

  _evalDeck(time, seed, frozen) {
    if (this.deckWalker && this.deckWalker0) {
      if (frozen) {
        this.deckWalker.position.x = this.deckWalker0.x;
        this.deckWalker.position.y = this.deckWalker0.y;
        this.deckWalker.position.z = this.deckWalker0.z;
        this.deckWalker.rotation.y = this.deckWalker0.yaw;
      } else {
        const per = AMBIENT_DECK_WALK_PERIOD;
        const u = wrap01((time + ambientPhase(seed, 15, per)) / per);
        const ping = u < 0.5 ? u * 2 : 1 - (u - 0.5) * 2;
        const e = easeInOutQuad(ping);
        this.deckWalker.position.x = lerp(CONTAINER_DECK_WALK.x0, CONTAINER_DECK_WALK.x1, e);
        this.deckWalker.position.z = this.deckWalker0.z;
        this.deckWalker.position.y = this.deckWalker0.y
          + PERSON_BOB_AMP * Math.sin(time * PERSON_BOB_HZ * TWO_PI);
        this.deckWalker.rotation.y = ping < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
    if (this.deckCrane) {
      if (frozen) {
        this.deckCrane.rotation.y = this.deckCraneRest;
      } else {
        const per = AMBIENT_DECK_CRANE_PERIOD;
        const u = wrap01((time + ambientPhase(seed, 16, per)) / per);
        this.deckCrane.rotation.y = this.deckCraneRest
          + AMBIENT_DECK_CRANE_SWING * 0.5 * (1 - Math.cos(u * TWO_PI));
      }
    }
    this.statusSnapshot.deck.walkX = this.deckWalker?.position.x ?? 0;
    this.statusSnapshot.deck.craneYaw = this.deckCrane?.rotation.y ?? 0;
  }

  status() {
    return this.statusSnapshot;
  }

  dispose() {
    if (this.ladderPivot && this.dredger) {
      const kids = this.ladderPivot.children.slice();
      for (let i = 0; i < kids.length; i += 1) this.dredger.attach(kids[i]);
      this.ladderPivot.parent?.remove(this.ladderPivot);
      this.ladderPivot = null;
    }
    if (this.pilot && this.pilotRest) {
      this.pilot.position.set(this.pilotRest.x, this.pilotRest.y, this.pilotRest.z);
      this.pilot.rotation.y = this.pilotRest.yaw;
    }
    if (this.pilotWake) {
      this.pilotWake.parent?.remove(this.pilotWake);
      disposeVehicle(this.pilotWake);
      this.pilotWake = null;
    }
    if (this.gateBoom) this.gateBoom.rotation.z = this.gateBoomRest;
    if (this.stacker2 && this.stacker2Home) {
      this.stacker2.position.x = this.stacker2Home.x;
      this.stacker2.position.z = this.stacker2Home.z;
      this.stacker2.rotation.y = this.stacker2Home.yaw;
    }
    if (this.forklift && this.forkRest) {
      for (let i = 0; i < this.forkRest.length; i += 1) {
        this.forkRest[i].mesh.position.y = this.forkRest[i].y;
      }
    }
    for (const tr of this.tractors) {
      if (!tr) continue;
      tr.parent?.remove(tr);
      disposeVehicle(tr);
    }
    this.tractors[0] = null;
    this.tractors[1] = null;
    if (this.pallet) {
      this.pallet.parent?.remove(this.pallet);
      disposeVehicle(this.pallet);
      this.pallet = null;
    }
    if (this.engine) {
      this.engine.parent?.remove(this.engine);
      disposeVehicle(this.engine);
      this.engine = null;
    }
    for (const g of this.gulls) {
      if (!g) continue;
      g.parent?.remove(g);
    }
    this.gulls[0] = null;
    this.gulls[1] = null;
    if (this.root) {
      this.root.parent?.remove(this.root);
      this.root = null;
    }
    this.attached = false;
    this.port = null;
    this.director = null;
    this.logistics = null;
  }
}
