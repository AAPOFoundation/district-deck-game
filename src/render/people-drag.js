// District Deck — pick up and drop an ambient pedestrian.
// Presentation only: no sim/reducer writes, no action stream, no economy.
//
// Pickup is the city's ambient-life crowd. Site crews and fringe landmark
// figures are not in that set. A hold arms on pointer-down and commits after
// 160 ms or 4 px so an ordinary parcel click is still a parcel click.

import * as THREE from 'three';
import {
  PITCH, ROAD, TILE, TILES_PER_BLOCK, parcelId, parseParcelId, tileCentre,
} from '../core/grid.js';
import { SHORE, alongLength, boardEdgeOrigin, edgeAxes } from './shore.js';
import { compensatePickRay } from './world-curve.js';
import { isPickablePerson } from './ambient-life.js';

/** Pointer-down must last this long, or move this far, before the figure lifts. */
export const HOLD_MS = 160;
export const HOLD_PX = 4;
/**
 * Capture-phase window bind so the hook sees the pointer before the canvas-bubble
 * camera rig. Tests inject `view.pointerRoot` to pin the same path without a DOM.
 */
export const POINTER_BIND = Object.freeze({ capture: true, target: 'window' });
/** Held figure scale. Design: gentle ~1.15. */
export const LIFT_SCALE = 1.15;
/** Slight rise off the ground plane while held, metres. */
export const LIFT_Y = 0.42;
/** Blocked-drop return duration. */
export const RETURN_MS = 400;
/** Red-tint pulse on a refused drop, seconds. */
export const BLOCKED_PULSE_S = 0.22;

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _ground = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _scratchRay = new THREE.Raycaster();

function easeOutCubic(t) {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - (1 - u) ** 3;
}

function nowOf(event, fallback) {
  if (event && Number.isFinite(event.timeStamp)) return event.timeStamp;
  if (Number.isFinite(fallback)) return fallback;
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function wallNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** EventTarget people-drag actually binds to. Window capture beats the canvas-bubble camera. */
export function pointerEventTarget(view) {
  if (view?.pointerRoot?.addEventListener) return view.pointerRoot;
  const canvas = view?.canvas ?? null;
  const win = canvas?.ownerDocument?.defaultView
    ?? (typeof globalThis.window !== 'undefined' ? globalThis.window : null);
  if (win?.addEventListener) return win;
  return canvas;
}

export function clientToNdc(clientX, clientY, rect) {
  const left = rect?.left ?? 0;
  const top = rect?.top ?? 0;
  const width = Math.max(1e-6, rect?.width || 1);
  const height = Math.max(1e-6, rect?.height || 1);
  return {
    x: ((clientX - left) / width) * 2 - 1,
    y: -((clientY - top) / height) * 2 + 1,
  };
}

/**
 * HUD chrome keeps its own clicks. Missing target (unit tests, some synthetic
 * events) and the canvas / document / game root still go through.
 */
export function isBoardPointerEvent(event, canvas) {
  if (!canvas || event?.target == null) return true;
  const target = event.target;
  if (target === canvas) return true;
  if (typeof canvas.contains === 'function' && canvas.contains(target)) return true;
  const tag = target.tagName;
  if (!tag || tag === 'HTML' || tag === 'BODY' || tag === 'MAIN') return true;
  return false;
}

export function samePointerId(event, pointerId) {
  if (pointerId == null || event?.pointerId == null) return true;
  return event.pointerId === pointerId;
}

/**
 * Hold elapsed across three clocks: accumulated tick dt (step() / rAF),
 * wall clock (a still wait with no frames), and event.timeStamp deltas.
 * Mixing clocks is how the live hold never armed — tick(dt) used t0 as "now".
 */
export function elapsedHoldMs(pending, event, now) {
  if (!pending) return 0;
  const held = Number.isFinite(pending.heldMs) ? pending.heldMs : 0;
  const stamp = event && Number.isFinite(event.timeStamp) && Number.isFinite(pending.t0)
    ? event.timeStamp - pending.t0
    : 0;
  // Wall clock only when the caller did not pass a test/game `now`. Mixing
  // performance.now() with event.timeStamp 0 is how a short click would lift.
  const wall = Number.isFinite(pending.wall0) && !Number.isFinite(now)
    ? wallNow() - pending.wall0
    : 0;
  const fromNow = Number.isFinite(now) && Number.isFinite(pending.t0)
    ? now - pending.t0
    : 0;
  return Math.max(held, stamp, wall, fromNow);
}

/**
 * Crews are work-bound; fringe figures are held landmark files.
 * Ambient pedestrians are the only pickable set.
 */
export { isPickablePerson };

/** Resolve an InstancedMesh ray hit to an ambient actor index. */
export function actorIndexFromInstanceHit(hit, { per = 1 } = {}) {
  if (hit == null || !Number.isFinite(hit.instanceId)) return -1;
  if (hit.object?.userData?.ambientPick) return hit.instanceId;
  const stride = Math.max(1, per);
  return Math.floor(hit.instanceId / stride);
}

export function actorFromInstanceHit(hit, actors, { per = 1 } = {}) {
  const index = actorIndexFromInstanceHit(hit, { per });
  const actor = actors?.[index] ?? null;
  return isPickablePerson(actor) ? actor : null;
}

/** Holding-level building-site predicate (synthetic fixtures welcome). */
export function isBuildingSiteHolding(holding) {
  if (!holding) return false;
  if (holding.construction) return true;
  if (holding.siteCleared) return true;
  if (holding.demolition) return true;
  const slots = holding.padSlots;
  if (slots && typeof slots === 'object') {
    for (const id of ['A', 'B']) {
      const slot = slots[id];
      if (!slot) continue;
      if (slot.status === 'works' || slot.works) return true;
    }
  }
  return false;
}

function tileIdAtWorld(x, z, city) {
  const blocksX = city?.blocksX;
  const blocksZ = city?.blocksZ;
  if (!Number.isFinite(blocksX) || !Number.isFinite(blocksZ)) return null;
  const bx = Math.floor(x / PITCH);
  const bz = Math.floor(z / PITCH);
  if (bx < 0 || bz < 0 || bx >= blocksX || bz >= blocksZ) return null;
  const localX = x - bx * PITCH - ROAD;
  const localZ = z - bz * PITCH - ROAD;
  if (localX < 0 || localZ < 0) return null;
  const tx = Math.floor(localX / TILE);
  const tz = Math.floor(localZ / TILE);
  if (tx >= TILES_PER_BLOCK || tz >= TILES_PER_BLOCK) return null;
  return parcelId(bx, bz, tx, tz);
}

export function tileContainsPoint(tileId, x, z) {
  if (!tileId) return false;
  let parsed;
  try {
    parsed = parseParcelId(tileId);
  } catch {
    return false;
  }
  const c = tileCentre(parsed.bx, parsed.bz, parsed.tx, parsed.tz);
  return Math.abs(x - c.x) <= TILE / 2 && Math.abs(z - c.z) <= TILE / 2;
}

function parcelAtWorld(city, x, z) {
  if (!city?.parcels) return null;
  const tileId = tileIdAtWorld(x, z, city);
  if (!tileId) return null;
  const direct = city.parcels[tileId];
  if (direct) return direct;
  const order = city.order ?? Object.keys(city.parcels);
  for (const id of order) {
    const parcel = city.parcels[id];
    if (parcel?.tiles?.includes(tileId)) return parcel;
  }
  return null;
}

/**
 * World-point building-site test.
 * Construction / demolition-in-progress / siteCleared block the whole parcel.
 * A pad slot in `works` blocks only that pad's tile footprint.
 */
export function isBuildingSiteAt(x, z, city, state) {
  if (state?.holdings && city?.parcels) {
    const parcel = parcelAtWorld(city, x, z);
    if (!parcel) return false;
    const holding = state.holdings[parcel.id];
    if (!holding) return false;
    if (holding.construction) return true;
    if (holding.siteCleared) return true;
    if (holding.demolition && !holding.siteCleared) return true;
    const slots = holding.padSlots;
    if (slots && typeof slots === 'object') {
      let anyWorks = false;
      for (const id of ['A', 'B']) {
        const slot = slots[id];
        if (!slot || (slot.status !== 'works' && !slot.works)) continue;
        anyWorks = true;
        const tileId = slot.tileId
          ?? parcel.tiles?.[id === 'A' ? 0 : 1]
          ?? null;
        if (tileId) {
          if (tileContainsPoint(tileId, x, z)) return true;
        } else {
          return true;
        }
      }
      if (anyWorks) return false;
    }
    return false;
  }
  return isBuildingSiteHolding(state);
}

function seawardDistance(x, z, city) {
  const edge = city?.waterEdge;
  const extent = city?.extent;
  if (!edge || !extent) return 0;
  const { seaward } = edgeAxes(edge);
  const origin = boardEdgeOrigin(edge, extent);
  return (x - origin.x) * seaward.x + (z - origin.z) * seaward.z;
}

/** True when the point is past the dry beach, on the water sheet. */
export function isSeawardWater(x, z, city) {
  const waterFrom = SHORE.wallOffset + SHORE.waterFromWall;
  return seawardDistance(x, z, city) > waterFrom;
}

/**
 * Nearest point on the water-facing shore line (dry sand at the waterline).
 * Water is ambiguous in the user order — a water drop never floats and is
 * never refused; it lands on this line.
 */
export function nearestShorePoint(x, z, city) {
  const edge = city?.waterEdge ?? 'south';
  const extent = city?.extent ?? { x: 0, z: 0 };
  const { seaward, along } = edgeAxes(edge);
  const origin = boardEdgeOrigin(edge, extent);
  const seawardM = SHORE.wallOffset + SHORE.sandSeaward;
  const ox = origin.x + seaward.x * seawardM;
  const oz = origin.z + seaward.z * seawardM;
  const half = alongLength(edge, extent) / 2;
  const t = (x - ox) * along.x + (z - oz) * along.z;
  const clamped = Math.max(-half, Math.min(half, t));
  return { x: ox + along.x * clamped, z: oz + along.z * clamped };
}

/**
 * Drop rules: building sites refuse; water snaps to shore; otherwise the point stands.
 * Never writes `state`.
 */
export function resolvePersonDrop(x, z, { city, state, waterHit = null } = {}) {
  if (isBuildingSiteAt(x, z, city, state)) {
    return { ok: false, reason: 'site', x, z };
  }
  const onWater = waterHit === 'water' || (!waterHit && isSeawardWater(x, z, city));
  if (onWater) {
    const shore = nearestShorePoint(x, z, city);
    return { ok: true, x: shore.x, z: shore.z, snapped: 'shore' };
  }
  return { ok: true, x, z };
}

/**
 * Resume wandering from the drop. Story routes are dropped so the figure
 * does not teleport back onto its old errand. `state` is accepted only so
 * callers can pass the live snapshot — it is never read for writes.
 */
export function relocateAmbientActor(actor, x, z, _city = null, _state = null) {
  if (!actor) return actor;
  actor.x = x;
  actor.z = z;
  actor.homeX = x;
  actor.homeZ = z;
  actor._px = x;
  actor._pz = z;
  actor._lastX = x;
  actor._lastZ = z;
  actor._route = null;
  actor.clock = 0;
  actor._clock = 0;
  // Mid-leg of pingPong is a zero offset, so the first pose is the drop itself.
  actor.phase = 0.5;
  actor.kind = 'stroll';
  actor.lifeMode = 'street';
  actor.strollAmp = Math.max(actor.strollAmp ?? 0, 1.8);
  actor.dragHold = null;
  void _city;
  void _state;
  return actor;
}

function createRingShadow() {
  const geometry = new THREE.RingGeometry(0.28, 0.78, 32);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0x1a1612,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    depthTest: true,
    fog: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'v310:people-drag-ring';
  mesh.renderOrder = 6;
  mesh.visible = false;
  mesh.frustumCulled = false;
  return mesh;
}

function groundPointAt(view, clientX, clientY) {
  const canvas = view?.canvas;
  const camera = view?.camera;
  const rect = canvas?.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 1, height: 1 };
  const ndc = clientToNdc(clientX, clientY, rect);
  _ndc.set(ndc.x, ndc.y);
  if (!camera) return { point: null, raycaster: null, ndc, rect };
  const raycaster = view.raycaster ?? _scratchRay;
  raycaster.setFromCamera(_ndc, camera);
  try {
    compensatePickRay(raycaster, camera);
  } catch {
    // World-curve compensation is optional for unit tests without a rig.
  }
  const point = raycaster.ray.intersectPlane(GROUND, _ground) ? _ground.clone() : null;
  return { point, raycaster, ndc, rect };
}

/**
 * Raw client-pixel path the bound handlers call. Raycast first; NDC proximity
 * is the fallback when the instanced pick mesh misses (stale sphere / backface).
 */
export function pickFromClient(view, clientX, clientY) {
  const { point, raycaster, ndc, rect } = groundPointAt(view, clientX, clientY);
  const life = view?.ambientLife;
  let actor = life?.pickPersonAt?.(raycaster) ?? null;
  let via = isPickablePerson(actor) ? 'ray' : null;
  if (!via && typeof life?.pickPersonNearNdc === 'function') {
    actor = life.pickPersonNearNdc(ndc, view?.camera, rect);
    via = isPickablePerson(actor) ? 'ndc' : null;
  }
  if (!isPickablePerson(actor)) actor = null;
  const actorIndex = actorIndexOf(life, actor);
  return { actor, actorIndex, point, raycaster, ndc, rect, via };
}

/** Pick-mesh index i is actors[i]; `pickIndex` is the explicit map written on sync. */
function actorIndexOf(life, actor) {
  if (!actor || !Array.isArray(life?.actors)) return -1;
  const mapped = actor.pickIndex;
  if (Number.isInteger(mapped) && life.actors[mapped] === actor) return mapped;
  return life.actors.indexOf(actor);
}

function syncLifePickMesh(life) {
  life?._syncPickMesh?.();
}

function suppressRigPointer(rig, pointerId) {
  if (!rig?.pointers) return;
  rig.pointers.delete(pointerId);
  if (rig.pointers.size === 0) {
    rig.dragging = null;
    rig.pinch = null;
    rig.panGrab = null;
  } else if (rig.pointers.size === 1 && rig.dragging === 'gesture') {
    rig.dragging = 'pan';
    rig.pinch = null;
  }
}

function writeHold(actor, {
  x, z, groundY = 0, liftY = LIFT_Y, scale = LIFT_SCALE, returning = false,
}) {
  actor.dragHold = {
    x,
    z,
    groundY,
    liftY,
    scale,
    returning: Boolean(returning),
  };
  actor._lastX = x;
  actor._lastZ = z;
}

export class PeopleDrag {
  constructor(view) {
    this.view = view ?? null;
    this.pending = null;
    this.active = null;
    this.cameraSuppressed = false;
    this._consumedPointerId = null;
    this._pulse = 0;
    this._bound = false;
    this._boundTarget = null;
    this._holdTimer = null;
    this.ring = null;
    this._onDown = (event) => this.onPointerDown(event);
    this._onMove = (event) => this.onPointerMove(event);
    this._onUp = (event) => this.onPointerUp(event);
    if (view?.scene) {
      this.ring = createRingShadow();
      view.scene.add(this.ring);
    }
    if (view?.ambientLife) {
      view.ambientLife._dragTick = (dt) => this.tick(dt);
    }
  }

  get isDragging() {
    return Boolean(this.active && !this.active.returning);
  }

  bind(target) {
    const el = target ?? pointerEventTarget(this.view);
    if (!el?.addEventListener || this._bound) return this;
    const capture = POINTER_BIND.capture;
    el.addEventListener('pointerdown', this._onDown, capture);
    el.addEventListener('pointermove', this._onMove, capture);
    el.addEventListener('pointerup', this._onUp, capture);
    el.addEventListener('pointercancel', this._onUp, capture);
    this._boundTarget = el;
    this._bound = true;
    this._attachDebugConsole();
    return this;
  }

  reducedMotion() {
    return Boolean(this.view?.reducedMotion || this.view?.ambientLife?.reducedMotion);
  }

  onPointerDown(event) {
    if (event?.button != null && event.button !== 0) return false;
    this._consumedPointerId = null;
    if (this.active || this.pending) return false;
    if (!isBoardPointerEvent(event, this.view?.canvas)) return false;
    const picked = pickFromClient(this.view, event.clientX, event.clientY);
    const actor = picked.actor;
    if (!isPickablePerson(actor)) return false;
    const pickup = {
      x: actor._lastX ?? actor.x,
      z: actor._lastZ ?? actor.z,
      y: actor.poseY ?? actor.baseY ?? 0,
    };
    this.pending = {
      pointerId: event.pointerId,
      actor,
      x0: event.clientX,
      y0: event.clientY,
      t0: nowOf(event),
      wall0: wallNow(),
      heldMs: 0,
      pickup,
      ground: picked.point,
    };
    this._armHoldTimer();
    return true;
  }

  onPointerMove(event) {
    if (this.pending && samePointerId(event, this.pending.pointerId) && !this.active) {
      event?.stopImmediatePropagation?.();
      const dx = event.clientX - this.pending.x0;
      const dy = event.clientY - this.pending.y0;
      const moved = Math.hypot(dx, dy);
      const held = elapsedHoldMs(this.pending, event) >= HOLD_MS;
      if (moved >= HOLD_PX || held) this._commitHold(event);
      return true;
    }
    if (this.active && samePointerId(event, this.active.pointerId) && !this.active.returning) {
      event?.stopImmediatePropagation?.();
      this._follow(event);
      return true;
    }
    return false;
  }

  onPointerUp(event) {
    if (this.pending && samePointerId(event, this.pending.pointerId) && !this.active) {
      const dx = (event.clientX ?? this.pending.x0) - this.pending.x0;
      const dy = (event.clientY ?? this.pending.y0) - this.pending.y0;
      const moved = Math.hypot(dx, dy);
      const held = elapsedHoldMs(this.pending, event) >= HOLD_MS;
      if (held || moved >= HOLD_PX) {
        event?.stopImmediatePropagation?.();
        this._commitHold(event);
        this._consumedPointerId = event?.pointerId ?? this.active?.pointerId;
        this._drop(event);
        return true;
      }
      this._clearHoldTimer();
      this.pending = null;
      return false;
    }
    if (this.active && samePointerId(event, this.active.pointerId)) {
      event?.stopImmediatePropagation?.();
      this._consumedPointerId = event?.pointerId ?? this.active.pointerId;
      this._drop(event);
      return true;
    }
    return false;
  }

  /** Safety net for main.js bubble pointerup if capture stop is skipped. */
  consumePointerUp(event) {
    if (this._consumedPointerId == null) return false;
    const match = event?.pointerId == null || event.pointerId === this._consumedPointerId;
    this._consumedPointerId = null;
    return match;
  }

  tick(dt, now) {
    if (this.pending && !this.active) {
      this.pending.heldMs = (this.pending.heldMs ?? 0) + Math.max(0, Number(dt) || 0) * 1000;
      if (elapsedHoldMs(this.pending, null, now) >= HOLD_MS) {
        this._commitHold({ pointerId: this.pending.pointerId });
      }
    }
    if (this.active?.returning) {
      this._tickReturn(dt);
    }
    if (this._pulse > 0) {
      this._pulse = Math.max(0, this._pulse - dt);
      this._tintRing(this._pulse > 0);
    }
  }

  _commitHold(event) {
    const pending = this.pending;
    if (!pending) return;
    this._clearHoldTimer();
    this.pending = null;
    const actor = pending.actor;
    if (!isPickablePerson(actor)) return;
    const pointerId = event?.pointerId ?? pending.pointerId;
    this.active = {
      pointerId,
      actor,
      pickup: pending.pickup,
      current: { x: pending.pickup.x, z: pending.pickup.z, y: pending.pickup.y },
      returning: false,
      t: 0,
      from: null,
      to: null,
    };
    this.cameraSuppressed = true;
    suppressRigPointer(this.view?.rig, pointerId);
    try {
      this.view?.canvas?.setPointerCapture?.(pointerId);
    } catch {
      // Capture is best-effort; the capture-phase listeners still own the pointer.
    }
    const instant = this.reducedMotion();
    writeHold(actor, {
      x: pending.pickup.x,
      z: pending.pickup.z,
      groundY: pending.pickup.y,
      liftY: instant ? LIFT_Y : LIFT_Y,
      scale: LIFT_SCALE,
    });
    this._showRing(pending.pickup.x, pending.pickup.z);
    syncLifePickMesh(this.view?.ambientLife);
    if (event?.clientX != null) this._follow(event);
  }

  _follow(event) {
    if (!this.active || this.active.returning) return;
    const { point, raycaster } = groundPointAt(this.view, event.clientX, event.clientY);
    if (!point) return;
    const waterHit = this.view?.water?.pickAt?.(raycaster)?.kind ?? null;
    this.active.waterHit = waterHit;
    this.active.current = { x: point.x, z: point.z, y: 0 };
    writeHold(this.active.actor, {
      x: point.x,
      z: point.z,
      groundY: 0,
      liftY: LIFT_Y,
      scale: LIFT_SCALE,
    });
    const blocked = isBuildingSiteAt(point.x, point.z, this.view?.city, this.view?.state);
    this._showRing(point.x, point.z);
    this._tintRing(blocked);
    syncLifePickMesh(this.view?.ambientLife);
  }

  _drop(event) {
    const active = this.active;
    if (!active) return;
    this.cameraSuppressed = false;
    suppressRigPointer(this.view?.rig, active.pointerId);
    try {
      this.view?.canvas?.releasePointerCapture?.(active.pointerId);
    } catch {
      // ignore
    }
    const { point, raycaster } = event?.clientX != null
      ? groundPointAt(this.view, event.clientX, event.clientY)
      : { point: active.current, raycaster: this.view?.raycaster };
    const x = point?.x ?? active.current.x;
    const z = point?.z ?? active.current.z;
    const waterHit = this.view?.water?.pickAt?.(raycaster)?.kind
      ?? active.waterHit
      ?? null;
    const resolved = resolvePersonDrop(x, z, {
      city: this.view?.city,
      state: this.view?.state,
      waterHit,
    });
    if (!resolved.ok) {
      this._pulse = BLOCKED_PULSE_S;
      this._tintRing(true);
      this._beginReturn(active.current, active.pickup);
      return;
    }
    relocateAmbientActor(
      active.actor,
      resolved.x,
      resolved.z,
      this.view?.city,
      this.view?.state,
    );
    this.active = null;
    this._hideRing();
    syncLifePickMesh(this.view?.ambientLife);
  }

  _beginReturn(from, to) {
    if (!this.active) return;
    if (this.reducedMotion()) {
      writeHold(this.active.actor, {
        x: to.x, z: to.z, groundY: to.y ?? 0, liftY: 0, scale: 1,
      });
      this.active.actor.dragHold = null;
      this.active = null;
      this._hideRing();
      syncLifePickMesh(this.view?.ambientLife);
      return;
    }
    this.active.returning = true;
    this.active.t = 0;
    this.active.from = { x: from.x, z: from.z, y: from.y ?? 0 };
    this.active.to = { x: to.x, z: to.z, y: to.y ?? 0 };
  }

  _tickReturn(dt) {
    const active = this.active;
    if (!active?.returning) return;
    active.t += dt;
    const u = Math.min(1, active.t / (RETURN_MS / 1000));
    const k = easeOutCubic(u);
    const x = active.from.x + (active.to.x - active.from.x) * k;
    const z = active.from.z + (active.to.z - active.from.z) * k;
    writeHold(active.actor, {
      x,
      z,
      groundY: active.to.y ?? 0,
      liftY: LIFT_Y * (1 - k),
      scale: 1 + (LIFT_SCALE - 1) * (1 - k),
      returning: true,
    });
    this._showRing(x, z);
    if (u >= 1) {
      active.actor.dragHold = null;
      this.active = null;
      this._hideRing();
    }
    syncLifePickMesh(this.view?.ambientLife);
  }

  _showRing(x, z) {
    if (!this.ring) return;
    this.ring.visible = true;
    this.ring.position.set(x, 0.03, z);
  }

  _hideRing() {
    if (!this.ring) return;
    this.ring.visible = false;
    this._tintRing(false);
  }

  _tintRing(blocked) {
    const material = this.ring?.material;
    if (!material?.color) return;
    if (blocked) {
      material.color.setHex(0xb43a2a);
      material.opacity = 0.55;
    } else {
      material.color.setHex(0x1a1612);
      material.opacity = 0.38;
    }
  }

  _armHoldTimer() {
    this._clearHoldTimer();
    const pending = this.pending;
    if (!pending) return;
    // Node unit tests have no document; live play.html does. A wall timer is
    // the still-hold path when the harness waits without calling step().
    if (typeof document === 'undefined') return;
    this._holdTimer = setTimeout(() => {
      this._holdTimer = null;
      if (this.pending && !this.active) {
        this._commitHold({ pointerId: this.pending.pointerId });
      }
    }, HOLD_MS);
  }

  _clearHoldTimer() {
    if (this._holdTimer != null) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }
  }

  /**
   * Live probe for the orchestrator. `{ hit, actorIndex, ndc }` plus `via`
   * so a miss can tell raycast-vs-NDC without guessing internals.
   */
  debugPickPerson(clientX, clientY) {
    const picked = pickFromClient(this.view, clientX, clientY);
    return {
      hit: Boolean(picked.actor),
      actorIndex: Number.isInteger(picked.actorIndex) ? picked.actorIndex : -1,
      ndc: picked.ndc ?? null,
      via: picked.via ?? null,
      actorId: picked.actor?.id ?? null,
    };
  }

  _attachDebugConsole() {
    const win = typeof globalThis.window !== 'undefined' ? globalThis.window : null;
    if (!win) return;
    const fn = (clientX, clientY) => this.debugPickPerson(clientX, clientY);
    // Do not create `window.dd` — a stub here would block hero-camera from
    // aliasing dd to the QA handle. Attach only to objects that already exist.
    if (win.dd && typeof win.dd === 'object') win.dd.debugPickPerson = fn;
    if (win.__districtDeck && typeof win.__districtDeck === 'object') {
      win.__districtDeck.debugPickPerson = fn;
    }
  }

  dispose() {
    this._clearHoldTimer();
    const el = this._boundTarget ?? pointerEventTarget(this.view);
    if (this._bound && el?.removeEventListener) {
      const capture = POINTER_BIND.capture;
      el.removeEventListener('pointerdown', this._onDown, capture);
      el.removeEventListener('pointermove', this._onMove, capture);
      el.removeEventListener('pointerup', this._onUp, capture);
      el.removeEventListener('pointercancel', this._onUp, capture);
    }
    this._bound = false;
    this._boundTarget = null;
    if (this.view?.ambientLife?._dragTick) this.view.ambientLife._dragTick = null;
    if (this.ring) {
      this.ring.parent?.remove(this.ring);
      this.ring.geometry?.dispose?.();
      this.ring.material?.dispose?.();
      this.ring = null;
    }
    if (this.active?.actor) this.active.actor.dragHold = null;
    if (this.pending?.actor) this.pending.actor.dragHold = null;
    this.pending = null;
    this.active = null;
    this.cameraSuppressed = false;
  }
}

export default PeopleDrag;
