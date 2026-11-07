// District Deck V3.02 — camera rig.
// Ground-plane projection keeps the point under the pointer fixed through pan and zoom.

import * as THREE from 'three';

const DEG = Math.PI / 180;

/**
 * Zoom-out / pan reach for the fringe ring (Falls Creek included).
 * `panPad` is added to the rig's `bounds` so `_targetLimits` and the
 * existing camera-test helper (`bounds.x + 40 + distance * 0.25`) stay
 * in lockstep. Playable-board centre is stored separately.
 */
export const CAMERA_RING = Object.freeze({
  maxDistanceFloor: 760,
  maxDistanceMul: 2.85,
  panPad: 260,
});

export function cameraMaxDistanceForBounds(bounds) {
  const span = Math.max(Number(bounds?.x) || 272, Number(bounds?.z) || 272);
  return Math.max(CAMERA_RING.maxDistanceFloor, span * CAMERA_RING.maxDistanceMul);
}
// P19 X4: measured subject-depth centroids at the graded camera poses (seed 0).
// Rows: name, target xyz, orbit distance, pitch/azimuth degrees, focus/range metres.
// Calibrated from a depth-tested 800×500 subject mask; range holds the 75th
// percentile of absolute depth deviations inside the <=1 output-pixel CoC band.
export const DOF_POSE_FOCUS = Object.freeze([
  Object.freeze(["user-corner", 262, 0.02, -18, 150, 42, 140, 157.382, 92.024]),
  Object.freeze(["corner-close", 270, 0.02, -14, 70, 38, 150.0, 77.221, 59.005]),
  Object.freeze(["oil-zone", 244, 0.02, -22, 95, 34, 320, 90.902, 83.323]),
  Object.freeze(["oil-sea", 247, 0.02, -36, 92, 28, 150.0, 100.342, 93.819]),
  Object.freeze(["container-zone", 168, 0.02, -30, 135, 30.0, 125.0, 150.185, 128.142]),
  Object.freeze(["crane-close", 177, 0.02, -38, 64, 26.0, 150.0, 59.15, 42.624]),
  Object.freeze(["quay-hero", 150, 0.02, -40, 140, 24, 260, 145.39, 138.972]),
  Object.freeze(["beach-corner", 278, 0.02, -10, 60, 36, 200, 65.944, 51.22]),
  Object.freeze(["shed-lane", 150, 0.02, -18, 74, 34, 200, 78.605, 63.219]),
  Object.freeze(["shed-lane-b", 150, 0.02, -18, 74, 34, 230.0, 77.183, 55.55]),
  Object.freeze(["live-stack", 166, 0.02, -16, 78, 36, 250.0, 82.809, 53.183]),
  Object.freeze(["gate-road", 116, 0.02, 2, 64, 32, 320, 50.205, 51.2]),
  Object.freeze(["rail-head", 122, 0.02, -6, 70, 34, 230.0, 76.826, 53.121]),
  Object.freeze(["city-baseline", 136, 0.02, 190, 110, 32, 320, 107.443, 100.068]),
  Object.freeze(["mid-beach", 300, 0.02, 200, 70, 36, 140, 83.124, 52.794]),
  Object.freeze(["coast-high", 310, 0.02, -90, 390, 54, 145, 446.92, 89.969]),
  Object.freeze(["port-waterline", 150, 1, -30, 150, 34, 168, 164.442, 121.425]),
  Object.freeze(["port-waterline-tight", 140, 0.5, -20, 78, 30.0, 172, 83.228, 71.328]),
  Object.freeze(["entertainment-landmass", 110, 2, 250, 210, 32, 195, 200.615, 130.943]),
  Object.freeze(["transport-landmass", -20, 2, 150, 200, 33, 285.0, 248.406, 154.766]),
  Object.freeze(["apostles-ocean", 330, 1, 250, 175, 28, 118, 215.889, 192.853]),
  Object.freeze(["shroud-void", 40, 2, 420, 300, 30.0, 200, 314.365, 265.221]),
  Object.freeze(["falls-foliage", 50, 8, 500, 230, 28, 205, 236.29, 155.387]),
  Object.freeze(["board-wide", 136, 0, 200, 470, 30.0, 200, 441.19, 286.434]),
 ]);

// X4B: these plates include terrain as a focal subject. Keep this list shared
// with the capture tools; live views use the same rule above the
// lowest board-plate altitude (the tight port view is 39 m above its target).
export const DOF_TERRAIN_POSES = Object.freeze([
  'shroud-void', 'transport-landmass', 'board-wide', 'falls-foliage',
  'apostles-ocean', 'entertainment-landmass', 'port-waterline', 'port-waterline-tight',
]);

export function cameraDofFocus(target, distance, polar, azimuth, lookHeight = 8) {
  const angle = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const row = DOF_POSE_FOCUS.find((p) => Math.hypot(target.x - p[1], target.y - p[2], target.z - p[3]) < 0.1
    && Math.abs(distance - p[4]) < 0.1
    && angle(polar, p[5] * DEG) < 0.001 && angle(azimuth, p[6] * DEG) < 0.001);
  const focus = Math.hypot(Math.cos(polar) * distance,
    target.y + Math.sin(polar) * distance - lookHeight);
  const terrainFocus = DOF_TERRAIN_POSES.includes(row?.[0]) || Math.sin(polar) * distance >= 39 - 1e-6;
  // The published distance/range remain the fallback when the reticle sees sky.
  // Post resolves terrainFocus against the rendered centre depth (including the
  // world curve), so moving over ground or a building requires no CPU readback.
  return row ? { pose: row[0], focusDistance: row[7], focalRange: row[8], calibrated: true, terrainFocus }
    : { pose: null, focusDistance: focus, focalRange: Math.max(16, focus), calibrated: false, terrainFocus };
}

const ROTATION_DEAD_ZONE = 8 * DEG;
const GROUND_DY_EPSILON = 0.08;
const GROUND_DY_RESUME_EPSILON = 0.09;
const INERTIA_STOP_METRES_PER_SECOND = 0.4;
const AUTO_FRAME_GRACE_MS = 400;
// Per-second retain of release velocity. update() multiplies by this^dt.
const INERTIA_DECAY_PER_SECOND = 0.0025;
// k in v(t) = v0·decay^t = v0·e^{−kt}. Continuous coast distance is v0/k.
const INERTIA_DECAY_RATE = -Math.log(INERTIA_DECAY_PER_SECOND);
// Half of a 60 Hz frame. A shorter gap does not separate two measured poses.
const INERTIA_MIN_WINDOW_MS = 1000 / 120;
// Recent release window: twelve of those intervals, exactly 100 ms. An 80 ms
// drag sampled every 2 ms stays inside it; a count cap of three events does not.
const INERTIA_WINDOW_MS = 100;
// High-rate moves sum into the open slot. Memory stays one slot per minimum
// interval, not one entry per event, and update() does not walk this history.
const INERTIA_SLOT_MS = INERTIA_MIN_WINDOW_MS;
const INERTIA_MAX_SAMPLES = 16;

function normaliseAngle(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

export class IsoCameraRig {
  constructor(camera, domElement, bounds) {
    this.camera = camera;
    this.dom = domElement;
    this.playable = { x: bounds.x, z: bounds.z };
    // Inflated so pan/_clamp reach the fringe ring. camera.test.mjs reads
    // `rig.bounds.x` for its clamp helper, so the pad lives on bounds itself.
    this.bounds = {
      x: bounds.x + CAMERA_RING.panPad,
      z: bounds.z + CAMERA_RING.panPad,
    };

    this.target = new THREE.Vector3(this.playable.x / 2, 0, this.playable.z / 2);
    this.smoothTarget = this.target.clone();

    this.azimuth = -45 * DEG;
    this.polar = 42 * DEG;
    this.distance = 190;

    this.smoothAzimuth = this.azimuth;
    this.smoothPolar = this.polar;
    this.smoothDistance = this.distance;

    this.minPolar = 22 * DEG;
    this.maxPolar = 68 * DEG;
    this.minDistance = 38;
    this.maxDistance = cameraMaxDistanceForBounds(this.playable);

    this.reducedMotion = false;
    this.enabled = true;
    this.dragging = null;
    this.pointers = new Map();
    this.pinch = null;
    this.panGrab = null;
    this.movedSinceDown = 0;
    this.wheelDevice = 'mouse';
    this.panSamples = [];
    this.inertia = new THREE.Vector2();
    this.autoFrameSuppressedUntil = 0;
    this.groundProjectionAvailable = true;
    this.programmaticFocus = false;
    this.onFrameAll = null;
    this.lookHeight = 0;
    this.smoothLookHeight = 0;
    this.easeRate = 9;
    this._heroTween = false;
    this._polarFloor = null;
    this._distanceFloor = null;
    this._fovTarget = null;
    // Phone round P1 (L1, contract section 6): null on the wide class, so the desktop path is the path it always was. The phone layer
    // (src/ui/phone-fit.js) sets workFrame to { rect, plate, curve } so that Frame city fits the plate into the room the HUD leaves, and
    // fitMaxDistance to the farthest a fit may stand; maxDistance, and with it the world curve's ramp, is left alone. lastFit is the
    // pose the last fitWindow() left, which fitIsHome() compares with.
    this.workFrame = null;
    this.fitMaxDistance = null;
    this.lastFit = null;

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.ndc = new THREE.Vector2();
    this.projectionCamera = camera.clone();

    this._bind();
    this.update(1);
  }

  _bind() {
    const dom = this.dom;
    this.onPointerDown = (event) => {
      if (!this.enabled) return;
      this._clearHeroOverride();
      this.cancelInertia();
      this._suppressAutoFrame();
      dom.setPointerCapture?.(event.pointerId);
      this.pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        time: event.timeStamp,
      });
      this.movedSinceDown = 0;
      this.panSamples = [];

      if (this.pointers.size === 1) {
        this.dragging = event.button === 2 || event.shiftKey || event.altKey ? 'orbit' : 'pan';
        if (this.dragging === 'pan') this.panGrab = this._groundHit(event.clientX, event.clientY).point;
      } else if (this.pointers.size === 2) {
        this.dragging = 'gesture';
        const state = this._pinchState();
        this.pinch = {
          ...state,
          startDistance: state.distance,
          startAngle: state.angle,
          startCameraDistance: this.distance,
          startAzimuth: this.azimuth,
          rotationEngaged: false,
        };
        this.panGrab = this._groundHit(state.cx, state.cy).point;
      }
    };

    this.onPointerMove = (event) => {
      if (!this.pointers.has(event.pointerId)) return;
      const prev = this.pointers.get(event.pointerId);
      const dx = event.clientX - prev.x;
      const dy = event.clientY - prev.y;
      this.pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        time: event.timeStamp,
      });
      this.movedSinceDown += Math.abs(dx) + Math.abs(dy);
      this._suppressAutoFrame();

      if (this.dragging === 'orbit') {
        this.cancelInertia();
        this.azimuth -= dx * 0.005;
        this.polar = THREE.MathUtils.clamp(this.polar + dy * 0.004, this.minPolar, this.maxPolar);
        this._refreshGrabPoint(event.clientX, event.clientY);
      } else if (this.dragging === 'pan') {
        this._panGrabTo(event.clientX, event.clientY, dx, dy, event.timeStamp - prev.time, event.timeStamp);
      } else if (this.dragging === 'gesture' && this.pointers.size === 2 && this.pinch) {
        const next = this._pinchState();
        this._panGrabTo(
          next.cx, next.cy, next.cx - this.pinch.cx, next.cy - this.pinch.cy,
          event.timeStamp - prev.time, event.timeStamp,
        );

        const nextDistance = THREE.MathUtils.clamp(
          this.pinch.startCameraDistance * (this.pinch.startDistance / Math.max(1, next.distance)),
          this.minDistance,
          this._zoomCapFrom(this.pinch.startCameraDistance),
        );
        const distanceChanged = Math.abs(nextDistance - this.distance) > 0.0001;
        if (distanceChanged) this._setDistanceAnchored(nextDistance, next.cx, next.cy);

        const angleDelta = normaliseAngle(next.angle - this.pinch.startAngle);
        if (this.pinch.rotationEngaged || Math.abs(angleDelta) >= ROTATION_DEAD_ZONE) {
          this.pinch.rotationEngaged = true;
          this.azimuth = this.pinch.startAzimuth - angleDelta;
        }
        if (distanceChanged || this.pinch.rotationEngaged) this._refreshGrabPoint(next.cx, next.cy);
        this.pinch.cx = next.cx;
        this.pinch.cy = next.cy;
      }
    };

    this.onPointerUp = (event) => {
      // Pointer release is observed on window so a canvas drag can finish
      // outside it. Releases from UI controls do not belong to this rig.
      if (!this.pointers.has(event.pointerId)) return;
      const endedMode = this.dragging;
      const cancelled = event.type === 'pointercancel';
      this.pointers.delete(event.pointerId);
      if (this.pointers.size === 1) {
        const remaining = Array.from(this.pointers.values())[0];
        this.dragging = 'pan';
        this.pinch = null;
        this.panGrab = this._groundHit(remaining.x, remaining.y).point;
        // The remaining finger starts a new pan. Pinch velocity is not its fling.
        this.panSamples = [];
      } else if (this.pointers.size === 0) {
        this.dragging = null;
        this.pinch = null;
        this.panGrab = null;
        this._suppressAutoFrame();
        if (!cancelled && (endedMode === 'pan' || endedMode === 'gesture')) {
          this._beginInertia(event.timeStamp);
        } else {
          this.cancelInertia();
        }
      }
    };

    this.onWheel = (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      this._clearHeroOverride();
      this.cancelInertia();
      this._suppressAutoFrame();

      if (
        this.wheelDevice !== 'trackpad'
        && (event.deltaX !== 0 || !Number.isInteger(event.deltaY) || Math.abs(event.deltaY) < 12)
      ) {
        this.wheelDevice = 'trackpad';
      }

      // Scroll / wheel always zooms (mouse and trackpad). Pan only when the
      // gesture is clearly horizontal or the user holds Shift.
      const panDominant = event.shiftKey
        || (Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.15 && Math.abs(event.deltaX) > 0.5);
      if (panDominant) {
        this.panByScreen(-event.deltaX, event.deltaY !== 0 && event.shiftKey ? -event.deltaY : 0,
          event.clientX, event.clientY);
        return;
      }
      const modeScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1;
      // Pixel-mode trackpad deltas are small — boost so two-finger scroll zooms well.
      const boost = event.deltaMode === 0 ? 1.85 : 1;
      this.zoomBy(
        Math.exp(event.deltaY * modeScale * boost * 0.0012),
        event.clientX,
        event.clientY,
      );
    };

    this.onContextMenu = (event) => event.preventDefault();

    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('contextmenu', this.onContextMenu);
  }

  _pinchState() {
    const [a, b] = Array.from(this.pointers.values());
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
    };
  }

  /** Publish a depth-tested subject census for a moving pose (for example combat).
   * The calibration belongs to this pose only; moving the camera invalidates it.
   * The game and capture tools use this rig API, never separate post overrides.
   */
  setDofSubjectDepths(depths, pose = 'subject-census') {
    const valid = depths.filter((z) => Number.isFinite(z) && z > this.camera.near && z < this.camera.far);
    if (!valid.length) return false;
    const focusDistance = valid.reduce((sum, z) => sum + z, 0) / valid.length;
    const deviations = valid.map((z) => Math.abs(z - focusDistance)).sort((a, b) => a - b);
    const focalRange = Math.max(16, deviations[Math.min(valid.length - 1, Math.floor(valid.length * 0.75))] * Math.sqrt(6));
    this._dofSubjectCensus = {
      matrix: this.camera.matrixWorld.clone(),
      projection: this.camera.projectionMatrix.clone(),
      focus: { pose, focusDistance, focalRange, calibrated: true, subjectPixels: valid.length },
    };
    this.dofFocus = this._dofSubjectCensus.focus;
    this.camera.userData.dofFocus = this.dofFocus;
    return true;
  }

  _poseCamera(camera, target, azimuth, polar, distance, lookHeight = this.smoothLookHeight) {
    const horizontal = Math.cos(polar) * distance;
    camera.position.set(
      target.x + Math.sin(azimuth) * horizontal,
      target.y + Math.sin(polar) * distance,
      target.z + Math.cos(azimuth) * horizontal,
    );
    camera.lookAt(target.x, lookHeight, target.z);
    camera.updateMatrixWorld();
    // Publish on the actual camera: live game and capture rigs consume the same focus.
    if (camera === this.camera) {
      const census = this._dofSubjectCensus;
      const samePose = census && camera.matrixWorld.elements.every((v, i) => Math.abs(v - census.matrix.elements[i]) < 1e-6)
        && camera.projectionMatrix.elements.every((v, i) => Math.abs(v - census.projection.elements[i]) < 1e-6);
      camera.userData.dofFocus = samePose ? census.focus : cameraDofFocus(target, distance, polar, azimuth, lookHeight);
      if (!samePose) this._dofSubjectCensus = null;
      this.dofFocus = camera.userData.dofFocus;
    }
  }

  _targetProjectionCamera(
    target = this.target,
    azimuth = this.azimuth,
    polar = this.polar,
    distance = this.distance,
  ) {
    this.projectionCamera.copy(this.camera, false);
    this.projectionCamera.aspect = this.camera.aspect;
    this.projectionCamera.fov = this.camera.fov;
    this.projectionCamera.near = this.camera.near;
    this.projectionCamera.far = this.camera.far;
    this.projectionCamera.updateProjectionMatrix();
    this._poseCamera(this.projectionCamera, target, azimuth, polar, distance);
    return this.projectionCamera;
  }

  _viewportPoint(clientX, clientY) {
    const rect = this.dom.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      rect,
      ndcX: ((clientX - rect.left) / rect.width) * 2 - 1,
      ndcY: -((clientY - rect.top) / rect.height) * 2 + 1,
    };
  }

  _groundHit(
    clientX,
    clientY,
    target = this.target,
    distance = this.distance,
    azimuth = this.azimuth,
    polar = this.polar,
  ) {
    const viewport = this._viewportPoint(clientX, clientY);
    if (!viewport) return { point: null, nearParallel: false };
    this.ndc.set(viewport.ndcX, viewport.ndcY);
    this.raycaster.setFromCamera(
      this.ndc,
      this._targetProjectionCamera(target, azimuth, polar, distance),
    );
    const absoluteDy = Math.abs(this.raycaster.ray.direction.y);
    const threshold = this.groundProjectionAvailable
      ? GROUND_DY_EPSILON
      : GROUND_DY_RESUME_EPSILON;
    if (absoluteDy < threshold) {
      this.groundProjectionAvailable = false;
      return { point: null, nearParallel: true };
    }
    this.groundProjectionAvailable = true;
    const point = new THREE.Vector3();
    return {
      point: this.raycaster.ray.intersectPlane(this.groundPlane, point) ? point : null,
      nearParallel: false,
    };
  }

  _fallbackAnchorPoint(
    clientX,
    clientY,
    target = this.target,
    distance = this.distance,
    azimuth = this.azimuth,
    polar = this.polar,
  ) {
    const viewport = this._viewportPoint(clientX, clientY);
    if (!viewport) return null;
    const projectionCamera = this._targetProjectionCamera(target, azimuth, polar, distance);
    const elements = projectionCamera.matrixWorld.elements;
    const right = new THREE.Vector3(elements[0], 0, elements[2]).normalize();
    const up = new THREE.Vector3(elements[4], 0, elements[6]);
    if (up.lengthSq() < 1e-8) {
      up.set(-Math.sin(azimuth), 0, -Math.cos(azimuth));
    } else {
      up.normalize();
    }
    const verticalSpan = distance * Math.tan((projectionCamera.fov * DEG) / 2);
    return target.clone()
      .addScaledVector(right, viewport.ndcX * verticalSpan * projectionCamera.aspect)
      .addScaledVector(
        up,
        viewport.ndcY * verticalSpan / Math.max(Math.sin(polar), GROUND_DY_EPSILON),
      );
  }

  _interactionAnchor(
    clientX,
    clientY,
    target = this.target,
    distance = this.distance,
    azimuth = this.azimuth,
    polar = this.polar,
  ) {
    const hit = this._groundHit(clientX, clientY, target, distance, azimuth, polar);
    return hit.point ?? this._fallbackAnchorPoint(
      clientX,
      clientY,
      target,
      distance,
      azimuth,
      polar,
    );
  }

  _panGrabTo(clientX, clientY, fallbackDx, fallbackDy, elapsedMs, timeStamp = null) {
    if (!this.panGrab) {
      this.panGrab = this._groundHit(clientX - fallbackDx, clientY - fallbackDy).point;
    }
    const hit = this._groundHit(clientX, clientY);
    const beforeX = this.target.x;
    const beforeZ = this.target.z;
    if (this.panGrab && hit.point) {
      this.target.x += this.panGrab.x - hit.point.x;
      this.target.z += this.panGrab.z - hit.point.z;
      const clamped = this._clampTarget();
      if (clamped.any) {
        // The target boundary rejected part of this drag. Commit the reachable pose and
        // make it the new grab origin so the rejected residual cannot rubber-band.
        this.panGrab = this._groundHit(clientX, clientY).point;
      }
    } else if (!this.panGrab && hit.point) {
      // Recovery can cross from the near-parallel fallback into a valid projection.
      // The first projected frame establishes a zero-delta grab; it must never no-op
      // while retaining an older, incompatible frame of reference.
      this.panGrab = hit.point;
    } else if (hit.nearParallel || !hit.point) {
      this._panFallback(fallbackDx, fallbackDy);
    }
    this._recordPanVelocity(this.target.x - beforeX, this.target.z - beforeZ, elapsedMs, timeStamp);
  }

  _recordPanVelocity(dx, dz, elapsedMs, timeStamp = null) {
    // Metres of target travel and the interval that produced them.
    // Velocity is not stored here: a sub-millisecond stamp must not become m/s yet.
    // The grounded pan has already been applied. A clock that cannot time the
    // move still keeps that pan; it only drops the release-velocity window.
    if (!Number.isFinite(dx) || !Number.isFinite(dz)) return;
    const dt = Number(elapsedMs);
    const hasStamp = timeStamp !== null && timeStamp !== undefined;
    const t = hasStamp ? Number(timeStamp) : null;
    const last = this.panSamples.length ? this.panSamples[this.panSamples.length - 1] : null;
    const stampOk = !hasStamp || Number.isFinite(t);
    const orderOk = !hasStamp || !last || !Number.isFinite(last.t) || t >= last.t;
    // Backwards or non-finite clocks make every stored interval unusable.
    // Do not keep this move's displacement to be divided by some other sample's time.
    if (!stampOk || !orderOk || !Number.isFinite(dt) || dt < 0) {
      this.panSamples = [];
      return;
    }
    // Duplicate stamps share the open interval. No invented 1 ms duration.
    if (!(dt > 0)) {
      if (last) {
        last.x += dx;
        last.z += dz;
        if (hasStamp) last.t = t;
      }
      return;
    }
    const slot = hasStamp ? Math.floor(t / INERTIA_SLOT_MS) : null;
    const lastSlot = last && Number.isFinite(last.t) ? Math.floor(last.t / INERTIA_SLOT_MS) : null;
    if (last && slot != null && slot === lastSlot) {
      last.x += dx;
      last.z += dz;
      last.dt += dt;
      last.t = t;
    } else {
      this.panSamples.push({ x: dx, z: dz, dt, t });
    }
    this._trimPanSamples(hasStamp ? t : null);
  }

  _trimPanSamples(newestT) {
    if (Number.isFinite(newestT)) {
      const horizon = newestT - INERTIA_WINDOW_MS;
      while (
        this.panSamples.length
        && Number.isFinite(this.panSamples[0].t)
        && this.panSamples[0].t <= horizon
      ) {
        this.panSamples.shift();
      }
      const oldest = this.panSamples[0];
      if (oldest && Number.isFinite(oldest.t) && oldest.dt > 0) {
        const start = oldest.t - oldest.dt;
        if (start < horizon && oldest.t > horizon) {
          const keep = oldest.t - horizon;
          const scale = keep / oldest.dt;
          oldest.x *= scale;
          oldest.z *= scale;
          oldest.dt = keep;
        }
      }
    }
    // Safety cap. Pair-merge keeps displacement and duration; it does not run
    // for a normal 100 ms window, which holds at most ~13 slots.
    while (this.panSamples.length > INERTIA_MAX_SAMPLES && this.panSamples.length >= 2) {
      const a = this.panSamples[0];
      const b = this.panSamples[1];
      this.panSamples.splice(0, 2, {
        x: a.x + b.x,
        z: a.z + b.z,
        dt: a.dt + b.dt,
        t: Number.isFinite(b.t) ? b.t : a.t,
      });
    }
  }

  /**
   * Release speed in m/s. v(t) = v0·decay^t travels v0/k, and each update()
   * step adds exactly v·(1−decay^dt)/k, so the cap is the distance the
   * discrete coast actually covers: half the ground span now in frame.
   */
  _inertiaSpeedLimit() {
    const fovDeg = Number(this.camera?.fov);
    const aspect = Number(this.camera?.aspect);
    const fov = (Number.isFinite(fovDeg) && fovDeg > 0 ? fovDeg : 36) * DEG;
    const spanAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
    const polar = Math.max(Math.sin(this.polar), GROUND_DY_EPSILON);
    const groundHeight = 2 * this.distance * Math.tan(fov / 2) / polar;
    const visible = Math.max(groundHeight, groundHeight * spanAspect);
    return visible * 0.5 * INERTIA_DECAY_RATE;
  }

  _beginInertia(releaseStamp) {
    if (this.reducedMotion || !this.panSamples.length) {
      this.cancelInertia();
      return;
    }
    let dx = 0;
    let dz = 0;
    let windowMs = 0;
    let lastT = null;
    for (const sample of this.panSamples) {
      const duration = sample.dt;
      const stamp = sample.t;
      // A contaminated sample invalidates the window. Skipping only its
      // duration would assign its displacement to the remaining intervals.
      if (
        !Number.isFinite(sample.x) || !Number.isFinite(sample.z)
        || !Number.isFinite(duration) || !(duration > 0)
        || (stamp != null && !Number.isFinite(stamp))
        || (stamp != null && lastT != null && stamp < lastT)
      ) {
        this.cancelInertia();
        return;
      }
      dx += sample.x;
      dz += sample.z;
      windowMs += duration;
      if (stamp != null) lastT = stamp;
    }
    // Tiny or zero-length history is not a rate. Drop the fling.
    if (!(windowMs >= INERTIA_MIN_WINDOW_MS)) {
      this.cancelInertia();
      return;
    }
    // A stamped drag needs a release at or after its last sample. NaN, Infinity,
    // or an earlier stamp has no trustworthy age; clamping that gap to zero
    // would launch the full velocity. Unstamped history keeps the hold helper.
    if (lastT != null && !(Number.isFinite(releaseStamp) && releaseStamp >= lastT)) {
      this.cancelInertia();
      return;
    }
    const seconds = windowMs / 1000;
    let vx = dx / seconds;
    let vz = dz / seconds;
    const speed = Math.hypot(vx, vz);
    const limit = this._inertiaSpeedLimit();
    if (Number.isFinite(speed) && Number.isFinite(limit) && speed > limit && limit > 0) {
      const scale = limit / speed;
      vx *= scale;
      vz *= scale;
    }
    // Same decay as the coast: a held pause spends the momentum before release.
    let holdS = 0;
    if (lastT != null && Number.isFinite(releaseStamp)) holdS = Math.max(0, (releaseStamp - lastT) / 1000);
    const retained = Math.pow(INERTIA_DECAY_PER_SECOND, holdS);
    if (!Number.isFinite(vx) || !Number.isFinite(vz) || !Number.isFinite(retained)) {
      this.cancelInertia();
      return;
    }
    this.inertia.set(vx * retained, vz * retained);
    if (this.inertia.length() < INERTIA_STOP_METRES_PER_SECOND) this.cancelInertia();
  }

  cancelInertia() {
    this.inertia.set(0, 0);
    this.panSamples = [];
  }

  _panFallback(dx, dy) {
    const scale = this.distance * 0.0022;
    const sin = Math.sin(this.azimuth);
    const cos = Math.cos(this.azimuth);
    this.target.x -= (dx * cos - dy * sin) * scale;
    this.target.z -= (dx * sin + dy * cos) * scale;
    this._clampTarget();
  }

  panByScreen(dx, dy, clientX = null, clientY = null) {
    this.cancelInertia();
    const rect = this.dom.getBoundingClientRect();
    const x = clientX ?? rect.left + rect.width / 2;
    const y = clientY ?? rect.top + rect.height / 2;
    const from = this._groundHit(x, y);
    const to = this._groundHit(x + dx, y + dy);
    if (from.point && to.point) {
      this.target.x += from.point.x - to.point.x;
      this.target.z += from.point.z - to.point.z;
      this._clampTarget();
    } else {
      this._panFallback(dx, dy);
    }
    this._refreshGrabPoint(x + dx, y + dy);
  }

  _setDistanceAnchored(nextDistance, clientX, clientY) {
    const startDistance = this.distance;
    const requestedDistance = THREE.MathUtils.clamp(
      nextDistance,
      this.minDistance,
      this._zoomCapFrom(startDistance),
    );
    const startTarget = this.target.clone();
    const anchor = this._interactionAnchor(clientX, clientY, startTarget, startDistance);
    if (!anchor) {
      this.distance = requestedDistance;
      this._clampTarget();
      return { anchorError: null, appliedDistance: this.distance };
    }

    const solve = (distance) => {
      const projected = this._interactionAnchor(clientX, clientY, startTarget, distance);
      if (!projected) return null;
      const target = startTarget.clone().add(anchor).sub(projected);
      target.y = 0;
      return {
        distance,
        target,
        feasible: this._targetWithinLimits(target, distance),
      };
    };

    let solution = solve(requestedDistance);
    if (!solution?.feasible) {
      // Along a wheel/pinch step the current pose is feasible and the requested pose is
      // not. Keep the furthest feasible point on that segment instead of clamping away
      // the anchor correction.
      let lower = 0;
      let upper = 1;
      solution = solve(startDistance);
      for (let iteration = 0; iteration < 48; iteration += 1) {
        const ratio = (lower + upper) / 2;
        const candidate = solve(
          startDistance + (requestedDistance - startDistance) * ratio,
        );
        if (candidate?.feasible) {
          lower = ratio;
          solution = candidate;
        } else {
          upper = ratio;
        }
      }
    }

    if (solution) {
      this.distance = solution.distance;
      this.target.copy(solution.target);
      this._clampTarget();
    }
    const after = this._interactionAnchor(clientX, clientY);
    return {
      anchorError: after ? anchor.distanceTo(after) : null,
      appliedDistance: this.distance,
    };
  }

  zoomBy(factor, clientX = null, clientY = null) {
    this.cancelInertia();
    const rect = this.dom.getBoundingClientRect();
    const x = clientX ?? rect.left + rect.width / 2;
    const y = clientY ?? rect.top + rect.height / 2;
    const result = this._setDistanceAnchored(this.distance * factor, x, y);
    this._refreshGrabPoint(x, y);
    return result;
  }

  orbitBy(degrees) {
    this.cancelInertia();
    this.azimuth += degrees * DEG;
    this._refreshActiveGrab();
  }

  resetNorth() {
    this.cancelInertia();
    this.azimuth = -45 * DEG;
    this._refreshActiveGrab();
  }

  _refreshActiveGrab() {
    if (!this.pointers.size) return;
    if (this.pointers.size === 2) {
      const pinch = this._pinchState();
      this._refreshGrabPoint(pinch.cx, pinch.cy);
    } else {
      const pointer = Array.from(this.pointers.values())[0];
      this._refreshGrabPoint(pointer.x, pointer.y);
    }
  }

  _refreshGrabPoint(clientX, clientY) {
    if (!this.pointers.size) return;
    this.panGrab = this._groundHit(clientX, clientY).point;
  }

  _targetLimits(distance = this.distance) {
    const margin = 40 + distance * 0.25;
    const pad = this.bounds.x - (this.playable?.x ?? this.bounds.x);
    return {
      minX: -margin - pad,
      maxX: this.bounds.x + margin,
      minZ: -margin - pad,
      maxZ: this.bounds.z + margin,
    };
  }

  _targetWithinLimits(target, distance = this.distance) {
    const limits = this._targetLimits(distance);
    const epsilon = 1e-12;
    return target.x >= limits.minX - epsilon
      && target.x <= limits.maxX + epsilon
      && target.z >= limits.minZ - epsilon
      && target.z <= limits.maxZ + epsilon;
  }

  _clampTarget() {
    const limits = this._targetLimits();
    const beforeX = this.target.x;
    const beforeZ = this.target.z;
    this.target.x = THREE.MathUtils.clamp(this.target.x, limits.minX, limits.maxX);
    this.target.z = THREE.MathUtils.clamp(this.target.z, limits.minZ, limits.maxZ);
    this.target.y = 0;
    return {
      x: Math.abs(this.target.x - beforeX) > 1e-9,
      z: Math.abs(this.target.z - beforeZ) > 1e-9,
      get any() { return this.x || this.z; },
    };
  }

  _suppressAutoFrame() {
    this.autoFrameSuppressedUntil = performance.now() + AUTO_FRAME_GRACE_MS;
  }

  isGestureActive() {
    return this.pointers.size > 0
      || this.dragging !== null
      || this.inertia.length() >= INERTIA_STOP_METRES_PER_SECOND;
  }

  canAutoFrame() {
    return !this.isGestureActive() && performance.now() >= this.autoFrameSuppressedUntil;
  }

  nudgeScreen(dx, dy) {
    this.cancelInertia();
    this.panByScreen(-dx, -dy);
    this.smoothTarget.copy(this.target);
  }

  _clearHeroOverride() {
    this._heroTween = false;
    this.easeRate = 9;
    this._polarFloor = null;
    this._distanceFloor = null;
    this._fovTarget = null;
    if (this.polar < this.minPolar) this.polar = this.minPolar;
    if (this.distance < this.minDistance) this.distance = this.minDistance;
    this.lookHeight = 0;
    this.smoothLookHeight = 0;
  }

  /**
   * Ease the iso rig toward an authored {azimuth, polar, distance, lookHeight, fov} pose.
   * `duration` 1 ≈ 95% in one second (rate 3). duration 0 snaps.
   */
  tweenToPose({
    target, azimuth, polar, distance, lookHeight = 0, fov = null,
  } = {}, { duration = 1 } = {}) {
    this.cancelInertia();
    this.programmaticFocus = true;
    this._heroTween = true;
    this.easeRate = this.reducedMotion || !duration ? 1e6 : 3 / Math.max(1e-3, duration);
    this._polarFloor = Math.min(this.minPolar, polar);
    this._distanceFloor = Math.min(this.minDistance, distance);
    this.lookHeight = Number.isFinite(lookHeight) ? lookHeight : 0;
    if (this.reducedMotion || !duration) this.smoothLookHeight = this.lookHeight;
    if (target) this.target.set(target.x, 0, target.z);
    if (Number.isFinite(azimuth)) this.azimuth = azimuth;
    const polarMin = this._polarFloor ?? this.minPolar;
    if (Number.isFinite(polar)) {
      this.polar = THREE.MathUtils.clamp(polar, polarMin, this.maxPolar);
    }
    const distMin = this._distanceFloor ?? this.minDistance;
    if (Number.isFinite(distance)) {
      this.distance = THREE.MathUtils.clamp(distance, distMin, this.maxDistance);
    }
    this._fovTarget = Number.isFinite(fov) ? fov : null;
    this._clampTarget();
    this._refreshActiveGrab();
  }

  focus(point, { distance = null } = {}) {
    this.cancelInertia();
    this._heroTween = false;
    this.easeRate = 9;
    this.programmaticFocus = true;
    this.lookHeight = 0;
    this.target.set(point.x, 0, point.z);
    if (distance !== null) {
      this.distance = THREE.MathUtils.clamp(distance, this.minDistance, this.maxDistance);
    }
    this._clampTarget();
    this._refreshActiveGrab();
  }

  frameAll() {
    this.cancelInertia();
    this._clearHeroOverride();
    this.programmaticFocus = false;
    // Camera-only: do not call onFrameAll for world mutation (mischief restore used
    // to run here and left pick/feel broken after Frame city).
    this.movedSinceDown = 0;
    this.dragging = null;
    this.pointers.clear();
    this.panGrab = null;
    this.pinch = null;
    // Phone round P1 (L1): on the phone classes the plate is fitted into the room the HUD leaves (workFrame is null everywhere else).
    if (this.workFrame && this._frameInWorkFrame()) {
      this._refreshActiveGrab();
      return;
    }
    const cx = (this.playable?.x ?? this.bounds.x) / 2;
    const cz = (this.playable?.z ?? this.bounds.z) / 2;
    this.target.set(cx, 0, cz);
    const vFov = this.camera.fov * DEG;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    // Include the bay / port / hills fringe so Frame city (F) shows the landmass.
    const span = Math.hypot(this.bounds.x, this.bounds.z) * 0.82;
    const needed = Math.max(span / Math.tan(hFov / 2), span / Math.tan(vFov / 2));
    this.distance = THREE.MathUtils.clamp(needed, this.minDistance, this.maxDistance);
    // Snap smooth camera so the next pick uses the framed pose immediately.
    this.smoothTarget.copy(this.target);
    this.smoothDistance = this.distance;
    this.smoothAzimuth = this.azimuth;
    this.smoothPolar = this.polar;
    this._poseCamera(
      this.camera,
      this.smoothTarget,
      this.smoothAzimuth,
      this.smoothPolar,
      this.smoothDistance,
    );
    this._refreshActiveGrab();
  }

  /**
   * The farthest the player's own zoom (wheel, buttons, pinch) may take the camera from `distance`: maxDistance; and, on the phone classes (fitMaxDistance set),
   * the farther of where the camera stands and where Frame city last put it, up to fitMaxDistance. So the first zoom after Frame city continues from where the
   * camera stands and does not snap in to maxDistance, and a player who zooms in from the framed city can zoom back out to it. With fitMaxDistance null (the wide
   * class, every taste station) this is maxDistance, the clamp it always was.
   */
  _zoomCapFrom(distance) {
    if (this.fitMaxDistance == null) return this.maxDistance;
    const framed = this.lastFit?.kind === 'frame' ? this.lastFit.distance : 0;
    return Math.min(this.fitMaxDistance, Math.max(this.maxDistance, distance, framed));
  }

  /**
   * Phone round P1 (L1, contract section 6): fit a subject into a rectangle of the window by distance and target slide, at the held azimuth and polar. This is
   * Pocket Reserve's solve(): eight passes that scale the distance until the subject's projected box fills the rectangle, and slide the target so the subject lands
   * on the rectangle's centre, through the ground under the two screen points. There is no view offset (the planar reflection, the depth-of-field reticle and the
   * tilt-shift centre all read the principal point as the screen centre), nothing is read in update() or _poseCamera, and the call is event-driven: the phone
   * layer makes it at the opening, on a layout change and on a resize, and Frame city makes it through workFrame.
   *
   * subject  { x, z, width }   a ground segment of `width` metres across the camera's right axis, centred on (x, z): it fills the rectangle's width and its
   *                            centre lands on the rectangle's centre (the phone opening: ?phoneFitW= metres of ground across the room);
   *          { points }        [{x, y, z}] or [[x, y, z]]: the points' screen box is contained in the rectangle less `pad`, and its centre lands on the
   *                            rectangle's centre (Frame city: the plate's corners at the ground and at a building allowance).
   * rect     { left, top, right, bottom } in the window's px (client coordinates of the canvas).
   * opts     pad      px kept free on each side (default 0 for a segment; for points 3 % of the smaller side, 2 to 12 px)
   *          polar, azimuth   radians; default the rig's own (held)
   *          curve    (distance) => curvature k of the world bend about the target, so that the box is the bent plate; default none
   *          snap     copy the pose to the smoothed pose and draw it at once (default true); false lets update() ease there
   *          kind     a label kept in lastFit ('opening', 'frame')
   *          passes   default 8
   * Returns { distance, target: {x, z}, azimuth, polar, box: [x0, y0, x1, y1] (px, projected, after the last pass), capped, passes }.
   */
  fitWindow(subject, rect, opts = {}) {
    const dom = this.dom.getBoundingClientRect();
    const rw = rect.right - rect.left;
    const rh = rect.bottom - rect.top;
    if (!(dom.width > 0 && dom.height > 0 && rw > 0 && rh > 0)) return null;
    const azimuth = Number.isFinite(opts.azimuth) ? opts.azimuth : this.azimuth;
    const polar = THREE.MathUtils.clamp(Number.isFinite(opts.polar) ? opts.polar : this.polar, this.minPolar, this.maxPolar);
    const segment = subject.points == null;
    const pad = Number.isFinite(opts.pad)
      ? Math.max(0, opts.pad)
      : (segment ? 0 : Math.max(2, Math.min(12, 0.03 * Math.min(rw, rh))));
    const aw = Math.max(1, rw - 2 * pad);
    const ah = Math.max(1, rh - 2 * pad);
    const cap = Math.max(this.maxDistance, this.fitMaxDistance ?? 0);
    const curve = typeof opts.curve === 'function' ? opts.curve : null;
    const aspect = dom.width / dom.height;
    const cam = this.projectionCamera;
    const rectCx = (rect.left + rect.right) / 2;
    const rectCy = (rect.top + rect.bottom) / 2;
    const rightX = Math.cos(azimuth);
    const rightZ = -Math.sin(azimuth);
    const base = segment
      ? [[subject.x - (subject.width / 2) * rightX, 0, subject.z - (subject.width / 2) * rightZ],
        [subject.x + (subject.width / 2) * rightX, 0, subject.z + (subject.width / 2) * rightZ]]
      : subject.points.map((p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]));

    const v = new THREE.Vector3();
    const place = (tx, tz, distance) => {
      this._targetProjectionCamera({ x: tx, y: 0, z: tz }, azimuth, polar, distance);
      if (cam.aspect !== aspect) {
        cam.aspect = aspect;
        cam.updateProjectionMatrix();
      }
    };
    // The subject's screen box (px of the window) at a pose, or null when a point is behind the camera.
    const boxAt = (tx, tz, distance) => {
      const k = curve ? curve(distance) : 0;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const p of base) {
        const dx = p[0] - tx;
        const dz = p[2] - tz;
        v.set(p[0], p[1] - k * (dx * dx + dz * dz), p[2]);
        const depth = v.clone().applyMatrix4(cam.matrixWorldInverse).z;
        if (depth >= -cam.near) return null;
        v.project(cam);
        const px = dom.left + ((v.x + 1) / 2) * dom.width;
        const py = dom.top + ((1 - v.y) / 2) * dom.height;
        x0 = Math.min(x0, px);
        x1 = Math.max(x1, px);
        y0 = Math.min(y0, py);
        y1 = Math.max(y1, py);
      }
      return [x0, y0, x1, y1];
    };
    // Where the ray through a screen point meets the ground (y = 0), on the pose placed last; null at or above the horizon.
    const groundAt = (px, py) => {
      v.set(((px - dom.left) / dom.width) * 2 - 1, -((py - dom.top) / dom.height) * 2 + 1, 0.5).unproject(cam);
      const dx = v.x - cam.position.x;
      const dy = v.y - cam.position.y;
      const dz = v.z - cam.position.z;
      if (!(dy < -1e-6)) return null;
      const t = -cam.position.y / dy;
      return { x: cam.position.x + dx * t, z: cam.position.z + dz * t };
    };

    let tx = this.target.x;
    let tz = this.target.z;
    let distance = THREE.MathUtils.clamp(this.distance, this.minDistance, cap);
    const passes = Number.isFinite(opts.passes) ? opts.passes : 8;
    let box = null;
    let used = 0;
    for (let pass = 0; pass < passes; pass += 1) {
      used = pass + 1;
      place(tx, tz, distance);
      box = boxAt(tx, tz, distance);
      if (!box) { // a point behind the camera: stand farther back and try again
        distance = Math.min(cap, distance * 1.5);
        continue;
      }
      const scale = Math.max((box[2] - box[0]) / aw, (box[3] - box[1]) / ah);
      if (!(scale > 0) || !Number.isFinite(scale)) break;
      distance = THREE.MathUtils.clamp(distance * scale, this.minDistance, cap);
      place(tx, tz, distance);
      box = boxAt(tx, tz, distance);
      if (!box) continue;
      // Slide: the ground under the box's centre (the segment's own centre for a segment) is brought under the rectangle's centre.
      const held = segment ? { x: subject.x, z: subject.z } : groundAt((box[0] + box[2]) / 2, (box[1] + box[3]) / 2);
      const want = groundAt(rectCx, rectCy);
      let moved = 0;
      if (held && want) {
        const sx = held.x - want.x;
        const sz = held.z - want.z;
        tx += sx;
        tz += sz;
        moved = Math.hypot(sx, sz);
      }
      if (Math.abs(scale - 1) < 1e-6 && moved < 1e-4) break;
    }

    // Apply: the same resets frameAll() makes, then the pose, drawn at once unless the caller wants the ease.
    this.cancelInertia();
    this._clearHeroOverride();
    this.programmaticFocus = false;
    this.azimuth = azimuth;
    this.polar = polar;
    this.distance = distance;
    this.target.set(tx, 0, tz);
    this._clampTarget();
    if (opts.snap !== false) {
      this.smoothTarget.copy(this.target);
      this.smoothDistance = this.distance;
      this.smoothAzimuth = this.azimuth;
      this.smoothPolar = this.polar;
      this._poseCamera(this.camera, this.smoothTarget, this.smoothAzimuth, this.smoothPolar, this.smoothDistance, this.smoothLookHeight);
    }
    this.lastFit = {
      kind: opts.kind ?? null,
      target: this.target.clone(),
      distance: this.distance,
      azimuth: this.azimuth,
      polar: this.polar,
    };
    this._refreshActiveGrab();
    return {
      distance: this.distance,
      target: { x: this.target.x, z: this.target.z },
      azimuth: this.azimuth,
      polar: this.polar,
      box,
      capped: distance >= cap - 1e-6,
      passes: used,
    };
  }

  /**
   * Phone round P2a (B): the pose the player's view stands at, to put back later (the settlement presenter's dismissal). The pose is the rig's own target, distance,
   * azimuth and polar, not the eased ones, so a camera that is still easing returns to where it was going.
   */
  poseState() {
    return {
      x: this.target.x, z: this.target.z, distance: this.distance, azimuth: this.azimuth, polar: this.polar,
    };
  }

  /**
   * Put a poseState() back at once (the same resets and the same apply as fitWindow, which leaves lastFit alone: a camera that stood at the fit still stands at
   * it, and one the player had moved is still theirs). Returns false for a pose that is not numbers.
   */
  restorePose(pose) {
    if (!pose || ![pose.x, pose.z, pose.distance, pose.azimuth, pose.polar].every(Number.isFinite)) return false;
    this.cancelInertia();
    this._clearHeroOverride();
    this.programmaticFocus = false;
    const cap = Math.max(this.maxDistance, this.fitMaxDistance ?? 0);
    this.azimuth = pose.azimuth;
    this.polar = THREE.MathUtils.clamp(pose.polar, this.minPolar, this.maxPolar);
    this.distance = THREE.MathUtils.clamp(pose.distance, this.minDistance, cap);
    this.target.set(pose.x, 0, pose.z);
    this._clampTarget();
    this.smoothTarget.copy(this.target);
    this.smoothDistance = this.distance;
    this.smoothAzimuth = this.azimuth;
    this.smoothPolar = this.polar;
    this._poseCamera(this.camera, this.smoothTarget, this.smoothAzimuth, this.smoothPolar, this.smoothDistance, this.smoothLookHeight);
    this._refreshActiveGrab();
    return true;
  }

  /** True while the camera stands where the last fitWindow() left it: the player has not panned, zoomed, turned or selected since. */
  fitIsHome() {
    const f = this.lastFit;
    if (!f) return false;
    const turn = (a, b) => Math.abs(normaliseAngle(a - b));
    return this.target.distanceTo(f.target) < 0.5
      && Math.abs(this.distance - f.distance) <= 0.005 * f.distance + 0.05
      && turn(this.azimuth, f.azimuth) < 0.5 * DEG
      && turn(this.polar, f.polar) < 0.5 * DEG;
  }

  /** Frame city on the phone classes: the plate (its corners at the ground and at a building allowance) in the room. Returns false when there is nothing to fit. */
  _frameInWorkFrame() {
    const wf = this.workFrame;
    const plate = wf?.plate;
    if (!wf?.rect || !plate) return false;
    const rise = Number.isFinite(plate.rise) ? plate.rise : 24;
    const points = [];
    for (const y of [0, rise]) {
      points.push([plate.x0, y, plate.z0], [plate.x1, y, plate.z0], [plate.x1, y, plate.z1], [plate.x0, y, plate.z1]);
    }
    return !!this.fitWindow({ points }, wf.rect, { curve: wf.curve ?? null, kind: 'frame' });
  }

  update(dt) {
    if (!this.reducedMotion && this.inertia.length() >= INERTIA_STOP_METRES_PER_SECOND) {
      const step = Number(dt);
      if (Number.isFinite(step) && step > 0) {
        // v·dt before decay overshoots ∫ v·decay^t. This step is that integral,
        // (v − v·decay^dt)/k, so any sequence of frame deltas stays within v0/k.
        const decay = Math.pow(INERTIA_DECAY_PER_SECOND, step);
        const travel = (1 - decay) / INERTIA_DECAY_RATE;
        this.target.x += this.inertia.x * travel;
        this.target.z += this.inertia.y * travel;
        const clamped = this._clampTarget();
        if (clamped.x) this.inertia.x = 0;
        if (clamped.z) this.inertia.y = 0;
        this.inertia.multiplyScalar(decay);
      }
      if (this.inertia.length() < INERTIA_STOP_METRES_PER_SECOND) this.cancelInertia();
    } else if (this.reducedMotion && this.inertia.lengthSq() > 0) {
      this.cancelInertia();
    }

    const rate = this.easeRate ?? 9;
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * rate);
    this.smoothTarget.lerp(this.target, k);
    this.smoothAzimuth += normaliseAngle(this.azimuth - this.smoothAzimuth) * k;
    this.smoothPolar += (this.polar - this.smoothPolar) * k;
    this.smoothDistance += (this.distance - this.smoothDistance) * k;
    this.smoothLookHeight += (this.lookHeight - this.smoothLookHeight) * k;
    this._poseCamera(
      this.camera,
      this.smoothTarget,
      this.smoothAzimuth,
      this.smoothPolar,
      this.smoothDistance,
      this.smoothLookHeight,
    );
    if (this._fovTarget != null && this.camera) {
      this.camera.fov += (this._fovTarget - this.camera.fov) * k;
      this.camera.updateProjectionMatrix();
    }
    const arrived = this.smoothTarget.distanceTo(this.target) < 0.025
      && Math.abs(this.smoothDistance - this.distance) < 0.025
      && Math.abs(this.smoothPolar - this.polar) < 0.002
      && Math.abs(this.smoothLookHeight - this.lookHeight) < 0.05;
    if (this.programmaticFocus && arrived) {
      this.programmaticFocus = false;
      if (this._heroTween) {
        this._heroTween = false;
        this.easeRate = 9;
        if (this._fovTarget != null && this.camera) {
          this.camera.fov = this._fovTarget;
          this.camera.updateProjectionMatrix();
          this._fovTarget = null;
        }
      }
    }
  }

  isFocusing() {
    return this.programmaticFocus;
  }

  wasDrag() {
    return this.movedSinceDown > 6;
  }

  dispose() {
    const dom = this.dom;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    dom.removeEventListener('wheel', this.onWheel);
    dom.removeEventListener('contextmenu', this.onContextMenu);
  }
}
