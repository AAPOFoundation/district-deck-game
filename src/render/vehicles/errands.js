// Presentation errands: at most two cars leave a legal loop, dwell at a civic kerb, rejoin.
// Seed-hash only. Not simulation state. Roles are school-run (hatch) and delivery (ute).
// Assignment picks the nearest loop that can host a bay, not the first matching body type.

import * as THREE from 'three';
import { ROAD } from '../../core/grid.js';

export const ERRAND_SCHOOL = 'school';
export const ERRAND_DELIVERY = 'delivery';

export const PEEL_SECONDS = 2.4;
export const MERGE_SECONDS = 2.1;
export const SCHOOL_DWELL = 8.0;
export const DELIVERY_DWELL = 10.0;
export const COOLDOWN = 38;
export const BAY_OFFSET = 3.15;
export const PEEL_WINDOW = 9.0;
/** Skip vertices inside a junction box plus margin so a dwelling car cannot own the crossing. */
export const JUNCTION_KEEP = ROAD * 0.5 + 1.8 + 4.0;
export const REJOIN_GAP = 6.8;
export const MERGE_WAIT_MAX = 8.0;
/** Interior belts can sit a block away from a civic; pick the nearest legal loop, not 48 m. */
export const MAX_BAY_RANGE = 220;

/** Board-readable school token (metres). */
export const SCHOOL_MARK = Object.freeze({ w: 0.74, h: 0.38, d: 0.62 });
/** Delivery crate in the ute tray (metres). */
export const CRATE_MARK = Object.freeze({ w: 0.85, h: 0.42, d: 0.70 });

function wrap(d, len) {
  return ((d % len) + len) % len;
}

function forwardDelta(from, to, length) {
  return wrap(to - from, length);
}

function nearestJunctionDist(x, z, junctions) {
  let best = Infinity;
  for (const j of junctions ?? []) {
    const d = Math.hypot(x - j.x, z - j.z);
    if (d < best) best = d;
  }
  return best;
}

function pointAt(loop, dist) {
  const pts = loop.points;
  const cum = loop.cum;
  if (!pts?.length || !cum?.length) return null;
  const d = wrap(dist, loop.length);
  let i = 1;
  while (i < cum.length && cum[i] < d) i += 1;
  const i0 = Math.max(1, i) - 1;
  const i1 = Math.min(pts.length - 1, i0 + 1);
  const seg = Math.max(1e-6, cum[i1] - cum[i0]);
  const u = (d - cum[i0]) / seg;
  return {
    x: pts[i0].x + (pts[i1].x - pts[i0].x) * u,
    z: pts[i0].z + (pts[i1].z - pts[i0].z) * u,
    yaw: Math.atan2(pts[i1].x - pts[i0].x, pts[i1].z - pts[i0].z),
    along: d,
  };
}

/** Nearest mid-block sample to a civic that is not inside a junction, offset onto the footpath. */
export function kerbBayFromLoop(loop, civicX, civicZ, options = {}) {
  if (!loop?.points?.length || !loop.cum?.length) return null;
  const junctions = options.junctions ?? [];
  const keep = options.junctionKeep ?? JUNCTION_KEEP;
  const maxRange = options.maxRange ?? MAX_BAY_RANGE;
  const step = 3;
  let best = null;
  for (let d = 0; d < loop.length; d += step) {
    const p = pointAt(loop, d);
    if (!p) continue;
    const approach = Math.hypot(p.x - civicX, p.z - civicZ);
    if (approach > maxRange) continue;
    const junctionDist = junctions.length ? nearestJunctionDist(p.x, p.z, junctions) : Infinity;
    if (junctions.length && junctionDist < keep) continue;
    if (!best || approach < best.approach) best = { ...p, approach, junctionDist };
  }
  if (!best) return null;
  const fwdX = Math.sin(best.yaw);
  const fwdZ = Math.cos(best.yaw);
  let lx = -fwdZ;
  let lz = fwdX;
  if ((civicX - best.x) * lx + (civicZ - best.z) * lz < 0) {
    lx = -lx;
    lz = -lz;
  }
  return {
    x: best.x + lx * BAY_OFFSET,
    z: best.z + lz * BAY_OFFSET,
    yaw: best.yaw,
    along: best.along,
    approach: best.approach,
    junctionDist: best.junctionDist,
  };
}

function civicOf(city, useId) {
  return (city?.civicUses ?? []).find((c) => c.useId === useId) ?? null;
}

/**
 * Attach at most two errands. Prefers the car whose loop is nearest the civic.
 * @returns {number} assigned count
 */
export function assignErrands(fleet, city, options = {}) {
  const junctions = options.junctions ?? [];
  const loops = options.loops ?? [];
  const school = civicOf(city, 'school-primary');
  const shop = civicOf(city, 'supermarket-strip') ?? civicOf(city, 'cafe-corner');
  const used = new Set();
  let n = 0;

  const loopPool = loops.length
    ? loops.map((loop, id) => ({ loop, id }))
    : [...new Map((fleet ?? []).map((c) => [c.loop, c.loopId])).entries()]
      .filter(([loop]) => loop)
      .map(([loop, id]) => ({ loop, id }));

  const take = (wantType, civic, role, dwell) => {
    if (!civic?.centre || n >= 2) return;
    let best = null;
    for (const entry of loopPool) {
      const bay = kerbBayFromLoop(entry.loop, civic.centre.x, civic.centre.z, { junctions });
      if (!bay) continue;
      if (!best || bay.approach < best.bay.approach) best = { ...entry, bay };
    }
    if (!best) return;
    const car = (fleet ?? []).find((c) => !used.has(c) && c.bodyType === wantType && c.loop === best.loop)
      ?? (fleet ?? []).find((c) => !used.has(c) && c.bodyType === wantType)
      ?? (fleet ?? []).find((c) => !used.has(c));
    if (!car) return;
    car.bodyType = wantType;
    car.loop = best.loop;
    car.loopId = best.id;
    // Both cars start inside the peel window. Stagger is short so the second
    // car cannot drive past the bay during cooldown (5 m/s × 7 s > 9 m).
    car.distance = best.bay.along - 5.8;
    if (car.color?.set) {
      if (role === ERRAND_SCHOOL) car.color.set('#e8b000');
      if (role === ERRAND_DELIVERY) car.color.set('#3f6f2e');
    }
    car.errand = {
      role,
      phase: 'cruise',
      dwell,
      bay: best.bay,
      u: 0,
      timer: 0,
      mergeWait: 0,
      cooldownUntil: 0.35 + n * 0.55,
      fromX: 0,
      fromZ: 0,
      fromYaw: 0,
    };
    car.errandAway = false;
    used.add(car);
    n += 1;
  };

  take('hatch', school, ERRAND_SCHOOL, SCHOOL_DWELL);
  take('ute', shop, ERRAND_DELIVERY, DELIVERY_DWELL);
  return n;
}

/** True when the frozen chainage has a gap on the same loop. */
export function rejoinClear(car, fleet) {
  const job = car?.errand;
  const loop = car?.loop;
  if (!job || !loop || !fleet) return true;
  const along = job.frozenAlong ?? job.bay.along;
  const len = loop.length;
  const here = wrap(along, len);
  for (const other of fleet) {
    if (other === car || other.loop !== loop || other.mischiefHidden) continue;
    const otherMod = Number.isFinite(other.mod) ? other.mod : wrap(other.distance ?? 0, len);
    const gap = Math.min(forwardDelta(here, otherMod, len), forwardDelta(otherMod, here, len));
    if (gap < REJOIN_GAP) return false;
  }
  return true;
}

/**
 * Advance one car's errand. When away, overrides world pose and freezes loop distance.
 * Call after sampleLoop in pass 1; returns true if pass 3 must not advance the loop.
 */
export function stepErrand(car, dt, elapsed, fleet) {
  const job = car.errand;
  if (!job || car.crashed || car.mischiefHidden) {
    car.errandAway = false;
    return false;
  }
  const loop = car.loop;
  const len = loop.length;
  const ahead = forwardDelta(car.mod, job.bay.along, len);

  if (job.phase === 'cruise') {
    if (elapsed >= (job.cooldownUntil ?? 0)
      && ahead > 0.4 && ahead < PEEL_WINDOW
      && !(car.nextStop && car.nextStop.ahead < 12 && car.nextStop.ahead < ahead)) {
      job.phase = 'peel';
      job.u = 0;
      job.fromX = car.worldX;
      job.fromZ = car.worldZ;
      job.fromYaw = car.pathYaw;
      job.frozenAlong = car.distance;
      car.errandAway = true;
      car.committedKey = null;
      car.commitTurning = false;
      car.junctionKey = null;
      car.inBox = false;
      car.nextStop = null;
    } else {
      car.errandAway = false;
      return false;
    }
  }

  car.errandAway = true;
  car.heldAtLine = false;
  car.committedKey = null;
  car.inBox = false;
  if (job.phase === 'peel') {
    const next = Math.max(0, car.speed - 1.8 * Math.max(dt, 1e-4));
    car.accel = dt > 0 ? (next - car.speed) / dt : 0;
    car.speed = next;
  } else if (job.phase === 'dwell') {
    car.accel = 0;
    car.speed = 0;
  } else {
    car.accel = 1.2;
    car.speed = Math.min(2.8, car.speed + 1.2 * Math.max(dt, 1e-4));
  }

  if (job.phase === 'peel') {
    job.u = Math.min(1, job.u + dt / PEEL_SECONDS);
    const t = job.u * job.u * (3 - 2 * job.u);
    car.worldX = job.fromX + (job.bay.x - job.fromX) * t;
    car.worldZ = job.fromZ + (job.bay.z - job.fromZ) * t;
    car.yaw = job.fromYaw + Math.atan2(
      Math.sin(job.bay.yaw - job.fromYaw),
      Math.cos(job.bay.yaw - job.fromYaw),
    ) * t;
    car.pathYaw = car.yaw;
    car.fwdX = Math.sin(car.yaw);
    car.fwdZ = Math.cos(car.yaw);
    if (job.u >= 1) {
      car.worldX = job.bay.x;
      car.worldZ = job.bay.z;
      car.yaw = job.bay.yaw;
      car.pathYaw = job.bay.yaw;
      car.fwdX = Math.sin(job.bay.yaw);
      car.fwdZ = Math.cos(job.bay.yaw);
      if (car.speed > 0.15) return true;
      job.phase = 'dwell';
      job.timer = job.dwell;
    }
    return true;
  }

  if (job.phase === 'dwell') {
    car.worldX = job.bay.x;
    car.worldZ = job.bay.z;
    car.yaw = job.bay.yaw;
    car.pathYaw = job.bay.yaw;
    car.fwdX = Math.sin(job.bay.yaw);
    car.fwdZ = Math.cos(job.bay.yaw);
    car.speed = 0;
    job.timer -= dt;
    if (job.timer <= 0) {
      job.phase = 'merge';
      job.u = 0;
      job.mergeWait = 0;
      job.fromX = job.bay.x;
      job.fromZ = job.bay.z;
      job.fromYaw = job.bay.yaw;
    }
    return true;
  }

  if (job.phase === 'merge') {
    if (!rejoinClear(car, fleet)) {
      job.mergeWait = (job.mergeWait ?? 0) + dt;
      car.worldX = job.bay.x;
      car.worldZ = job.bay.z;
      car.yaw = job.bay.yaw;
      car.pathYaw = job.bay.yaw;
      car.fwdX = Math.sin(job.bay.yaw);
      car.fwdZ = Math.cos(job.bay.yaw);
      car.speed = 0;
      car.accel = 0;
      return true;
    }
    job.u = Math.min(1, job.u + dt / MERGE_SECONDS);
    const t = job.u * job.u * (3 - 2 * job.u);
    // The odometer can include several laps. Segment lookup needs wrapped chainage;
    // otherwise the last segment is extrapolated and the car rejoins across the road.
    const along = wrap(job.frozenAlong ?? job.bay.along, len);
    const pts = loop.points;
    let i = 1;
    while (i < loop.cum.length && loop.cum[i] < along) i += 1;
    const i0 = Math.max(1, i) - 1;
    const i1 = Math.min(pts.length - 1, i0 + 1);
    const seg = Math.max(1e-6, loop.cum[i1] - loop.cum[i0]);
    const u = (along - loop.cum[i0]) / seg;
    const rx = pts[i0].x + (pts[i1].x - pts[i0].x) * u;
    const rz = pts[i0].z + (pts[i1].z - pts[i0].z) * u;
    const ryaw = Math.atan2(pts[i1].x - pts[i0].x, pts[i1].z - pts[i0].z);
    car.worldX = job.fromX + (rx - job.fromX) * t;
    car.worldZ = job.fromZ + (rz - job.fromZ) * t;
    car.yaw = job.fromYaw + Math.atan2(Math.sin(ryaw - job.fromYaw), Math.cos(ryaw - job.fromYaw)) * t;
    car.pathYaw = car.yaw;
    car.fwdX = Math.sin(car.yaw);
    car.fwdZ = Math.cos(car.yaw);
    car.distance = job.frozenAlong ?? job.bay.along; // Preserve the multi-lap odometer.
    car.mod = wrap(along, len);
    if (job.u >= 1) {
      job.phase = 'cruise';
      job.cooldownUntil = elapsed + COOLDOWN;
      car.errandAway = false;
    }
    return true;
  }

  return false;
}

/** Roof mark (school) or tray crate (delivery). Visible only while the car is off-cruise. */
export function buildErrandMarkers() {
  const root = new THREE.Group();
  root.name = 'v311:traffic:errands';
  const pip = new THREE.Mesh(
    new THREE.BoxGeometry(SCHOOL_MARK.w, SCHOOL_MARK.h, SCHOOL_MARK.d),
    new THREE.MeshStandardMaterial({
      color: '#f2b400',
      roughness: 0.42,
      metalness: 0.10,
      emissive: '#c48400',
      emissiveIntensity: 0.22,
    }),
  );
  pip.name = 'errand-school-pip';
  pip.castShadow = true;
  pip.visible = false;
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.10, 0.56, 0.44),
    new THREE.MeshStandardMaterial({
      color: '#1a3a8a',
      roughness: 0.48,
      metalness: 0.08,
      emissive: '#142a66',
      emissiveIntensity: 0.18,
    }),
  );
  plate.name = 'errand-school-plate';
  plate.castShadow = true;
  plate.visible = false;
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(CRATE_MARK.w, CRATE_MARK.h, CRATE_MARK.d),
    new THREE.MeshStandardMaterial({
      color: '#c45a28',
      roughness: 0.72,
      metalness: 0.04,
    }),
  );
  crate.name = 'errand-delivery-crate';
  crate.castShadow = true;
  crate.visible = false;
  root.add(pip, plate, crate);
  return { root, pip, plate, crate };
}

function activeErrand(job) {
  return job && job.phase && job.phase !== 'cruise';
}

export function poseErrandMarkers(markers, fleet) {
  if (!markers) return;
  markers.pip.visible = false;
  if (markers.plate) markers.plate.visible = false;
  markers.crate.visible = false;
  for (const car of fleet ?? []) {
    const job = car.errand;
    if (!activeErrand(job) || car.mischiefHidden) continue;
    const yaw = car.yaw ?? 0;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    if (job.role === ERRAND_SCHOOL) {
      markers.pip.visible = true;
      markers.pip.position.set(car.worldX, 1.62, car.worldZ);
      markers.pip.rotation.y = yaw;
      if (markers.plate) {
        markers.plate.visible = true;
        markers.plate.position.set(car.worldX, 1.92, car.worldZ);
        markers.plate.rotation.y = yaw;
      }
    }
    if (job.role === ERRAND_DELIVERY) {
      // Ute tray is local −Z (rear). World rear is −forward.
      markers.crate.visible = true;
      markers.crate.position.set(
        car.worldX - fx * 1.14,
        0.95,
        car.worldZ - fz * 1.14,
      );
      markers.crate.rotation.y = yaw;
    }
  }
}
