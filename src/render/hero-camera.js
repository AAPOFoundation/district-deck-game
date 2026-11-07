// Gauntlet P-wave 1 — authored hero capture presets.
// Render-only. Node-safe: no DOM, no WebGL. Camera tween lives on IsoCameraRig.

import { fogRangeForExtent, contactDiscScale, P1_FOG, P1_HIGHLIGHT } from './v4-p1-polish.js';

export { fogRangeForExtent, contactDiscScale, P1_FOG, P1_HIGHLIGHT };

export const HERO_TWEEN_SECONDS = 1;
export const HERO_CANON_EXTENT = Object.freeze({ x: 272, z: 272 });
export const HERO_PRESET_NAMES = Object.freeze([
  'skyline',
  'landmark',
  'street',
  'event',
  'board',
]);

/**
 * Authored on the canonical 4×4 board (272 m). `composeHeroPreset` scales XZ to the
 * live extent, then searches a fixed candidate grid around the subject. Scoring is
 * occlusion-aware when `ctx.scene` / `ctx.castRay` is present (on-demand, not per frame).
 *
 * Each pose keeps one subject, a clear depth path, and no foreground roof occluding
 * the play space (low-angle, never top-down).
 */
export const HERO_PRESETS = Object.freeze({
  skyline: Object.freeze({
    // Approach swung SW and raised after the R1 reshoot: the old line pulled
    // the port's crane cables across the sky as bare streaks.
    position: Object.freeze({ x: 16, y: 26, z: 88 }),
    target: Object.freeze({ x: 96, y: 14, z: 148 }),
    fov: 32,
  }),
  landmark: Object.freeze({
    // Shorter, higher approach: the old offset put a foreground shed roof
    // across the left third of the Town Hall frame.
    position: Object.freeze({ x: 78, y: 29, z: 60 }),
    target: Object.freeze({ x: 128, y: 16, z: 118 }),
    fov: 34,
  }),
  street: Object.freeze({
    position: Object.freeze({ x: 58, y: 4.15, z: 44 }),
    target: Object.freeze({ x: 86, y: 3.4, z: 102 }),
    fov: 46,
  }),
  event: Object.freeze({
    position: Object.freeze({ x: 72, y: 12.8, z: 58 }),
    target: Object.freeze({ x: 120, y: 6.5, z: 112 }),
    fov: 36,
  }),
  board: Object.freeze({
    position: Object.freeze({ x: 31.1, y: 92.7, z: 240.9 }),
    target: Object.freeze({ x: 136, y: 8, z: 136 }),
    fov: 36,
  }),
});

const LANDMARK_USE_IDS = Object.freeze([
  'town-hall-melbourne',
  'university-old-arts',
  'stock-exchange',
  'hospital-district',
  'transport-interchange',
]);

/** Matches `grid.js` without importing core. Corridor junctions sit on this lattice. */
const GRID_PITCH = 64;
const FOOTPATH_LOW = 1.5;
const FOOTPATH_HIGH = 14.5;

/**
 * Fixed 10-pose search around the authored offset. Azimuth sweep ± the authored
 * direction, two heights, two distances. Index 0 is always the authored pose.
 * No Math.random — same subject + offset → same grid.
 */
export const HERO_CANDIDATE_GRID = Object.freeze([
  Object.freeze({ az: 0, h: 1.00, d: 1.00 }),
  Object.freeze({ az: -0.26, h: 1.00, d: 1.00 }),
  Object.freeze({ az: 0.26, h: 1.00, d: 1.00 }),
  Object.freeze({ az: -0.46, h: 0.88, d: 1.00 }),
  Object.freeze({ az: 0.46, h: 0.88, d: 1.00 }),
  Object.freeze({ az: -0.26, h: 1.14, d: 1.18 }),
  Object.freeze({ az: 0.26, h: 1.14, d: 1.18 }),
  Object.freeze({ az: 0, h: 0.88, d: 1.18 }),
  Object.freeze({ az: -0.46, h: 1.14, d: 1.00 }),
  Object.freeze({ az: 0.46, h: 1.14, d: 1.00 }),
]);

export const HERO_RAYS_PER_CANDIDATE = 8;
export const HERO_MAX_RAYS = 90;

export const HERO_SCORE_WEIGHTS = Object.freeze({
  /** Centre ray hits nearer than 70% of subject distance (crane / cable / shed). */
  occluderReject: -1000,
  /** Centre ray clips the subject (70–95% of distance). */
  occluderClip: -120,
  /** Each flanking ray that hits a nearer occluder. */
  flankOccluder: -28,
  /** Subject sits near the board edge (frame looks off the city). */
  edge: -40,
  /** Clear path to ≥ 1.6× subject distance. */
  depthClear: 50,
  /** Partial credit for a ray that travels past the subject but not to 1.6×. */
  depthPartial: 22,
  /** Centre ray reaches the subject without a nearer hit. */
  centreClear: 30,
  /** Left/right flanks clear: one structure line owns the frame. */
  singleSubject: 24,
  /** Both flanks hit nearer masses — tower competing with the corner. */
  competingMass: -36,
  /** Stay near the authored azimuth when occlusion is equal. */
  authoredFidelity: 8,
  /** Street: prefer looking down a corridor (world-axis azimuth). */
  corridorAlign: 16,
  /** A mid-distance ray into the lower frame hits close geometry — a
   * foreground roof/plane is filling the bottom of the shot. Per hit. */
  foregroundFill: -80,
  /** Any probe hit inside 12% of subject distance: clutter against the
   * lens (crane column, cable bundle). Reject-scale. */
  nearClutter: -1000,
});

const OCCLUDER_NEAR = 0.7;
const DEPTH_CLEAR_MUL = 1.6;
const FLANK_FRAME = 0.20;
const DEFAULT_ASPECT = 16 / 9;

const PITCH_BAND = Object.freeze({
  skyline: Object.freeze([0.4, 14]),
  landmark: Object.freeze([2, 18]),
  street: Object.freeze([0.15, 6]),
  event: Object.freeze([1, 16]),
  board: Object.freeze([20.5, 39.5]),
});

const WORKS_NAME = /crane|scaffold|construction|hoarding|spoil|tower-crane|site-kit/i;
const IGNORE_HIT_NAME = /^(nature:sky|presentation:table|p1-contact|globe:|v303:people|v303:auction-crowd|v310:ambient-life)/i;

export function listHeroPresets() {
  return HERO_PRESET_NAMES.slice();
}

export function cloneHeroPreset(preset) {
  return {
    position: { x: preset.position.x, y: preset.position.y, z: preset.position.z },
    target: { x: preset.target.x, y: preset.target.y, z: preset.target.z },
    fov: preset.fov,
  };
}

export function poseFromVectors(position, target) {
  const tx = Number(target?.x);
  const ty = Number(target?.y) || 0;
  const tz = Number(target?.z);
  const px = Number(position?.x);
  const py = Number(position?.y);
  const pz = Number(position?.z);
  const dx = px - tx;
  const dy = py - ty;
  const dz = pz - tz;
  const horiz = Math.hypot(dx, dz);
  const distance = Math.hypot(horiz, py);
  const polar = Math.atan2(py, Math.max(1e-6, horiz));
  const azimuth = Math.atan2(dx, dz);
  const pitchDeg = Math.atan2(dy, Math.max(1e-6, horiz)) * (180 / Math.PI);
  return { dx, dy, dz, horiz, distance, polar, azimuth, pitchDeg, lookHeight: ty };
}

export function heroPitchDeg(preset) {
  return poseFromVectors(preset.position, preset.target).pitchDeg;
}

function scalePresetToExtent(preset, extent) {
  const out = cloneHeroPreset(preset);
  const sx = (Number(extent?.x) || HERO_CANON_EXTENT.x) / HERO_CANON_EXTENT.x;
  const sz = (Number(extent?.z) || HERO_CANON_EXTENT.z) / HERO_CANON_EXTENT.z;
  out.position.x *= sx;
  out.position.z *= sz;
  out.target.x *= sx;
  out.target.z *= sz;
  return out;
}

function retarget(preset, centre, height) {
  const ox = preset.position.x - preset.target.x;
  const oy = preset.position.y - preset.target.y;
  const oz = preset.position.z - preset.target.z;
  const y = Number.isFinite(height) ? height : preset.target.y;
  return {
    position: { x: centre.x + ox, y: y + oy, z: centre.z + oz },
    target: { x: centre.x, y, z: centre.z },
    fov: preset.fov,
  };
}

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

function pitchBandFor(name, authoredPitch) {
  const band = PITCH_BAND[name];
  if (band) return band;
  return [Math.max(0.2, authoredPitch - 6), authoredPitch + 6];
}

function applyPitchBand(position, target, minDeg, maxDeg) {
  const dx = position.x - target.x;
  const dz = position.z - target.z;
  const horiz = Math.hypot(dx, dz);
  if (horiz < 1e-4) return;
  const pitch = Math.atan2(position.y - target.y, horiz) * (180 / Math.PI);
  if (pitch >= minDeg && pitch <= maxDeg) return;
  const want = clamp(pitch, minDeg, maxDeg) * (Math.PI / 180);
  position.y = target.y + Math.tan(want) * horiz;
}

/**
 * 10 deterministic poses around `base` (already retargeted at the subject).
 * Height/distance scale the authored offset; azimuth sweeps ± that offset.
 */
export function generateHeroCandidates(base, { name = '' } = {}) {
  const authored = poseFromVectors(base.position, base.target);
  const [minPitch, maxPitch] = pitchBandFor(name, authored.pitchDeg);
  const ox = base.position.x - base.target.x;
  const oy = base.position.y - base.target.y;
  const oz = base.position.z - base.target.z;
  const horiz0 = Math.hypot(ox, oz);
  const az0 = Math.atan2(ox, oz);
  const out = [];
  for (let i = 0; i < HERO_CANDIDATE_GRID.length; i += 1) {
    const step = HERO_CANDIDATE_GRID[i];
    const az = az0 + step.az;
    const horiz = Math.max(4, horiz0 * step.d);
    const position = {
      x: base.target.x + Math.sin(az) * horiz,
      y: base.target.y + oy * step.h,
      z: base.target.z + Math.cos(az) * horiz,
    };
    const target = { x: base.target.x, y: base.target.y, z: base.target.z };
    applyPitchBand(position, target, minPitch, maxPitch);
    out.push({
      position,
      target,
      fov: base.fov,
      index: i,
    });
  }
  return out;
}

function collectPeoplePositions(ctx) {
  const out = [];
  const records = ctx.people?.records;
  if (records && typeof records.values === 'function') {
    for (const rec of records.values()) {
      const x = rec.lastX ?? rec.x;
      const z = rec.lastZ ?? rec.z;
      if (Number.isFinite(x) && Number.isFinite(z)) out.push({ x, z });
    }
  }
  const actors = ctx.ambientLife?.actors;
  if (Array.isArray(actors)) {
    for (const actor of actors) {
      const x = actor._lastX ?? actor.x;
      const z = actor._lastZ ?? actor.z;
      if (Number.isFinite(x) && Number.isFinite(z)) out.push({ x, z });
    }
  }
  if (Array.isArray(ctx.peoplePositions)) {
    for (const p of ctx.peoplePositions) {
      if (Number.isFinite(p?.x) && Number.isFinite(p?.z)) out.push({ x: p.x, z: p.z });
    }
  }
  return out;
}

function pushJunctionCorners(out, vi, hi) {
  const x0 = vi * GRID_PITCH;
  const z0 = hi * GRID_PITCH;
  out.push(
    { x: x0 + FOOTPATH_LOW, z: z0 + FOOTPATH_LOW },
    { x: x0 + FOOTPATH_HIGH, z: z0 + FOOTPATH_LOW },
    { x: x0 + FOOTPATH_LOW, z: z0 + FOOTPATH_HIGH },
    { x: x0 + FOOTPATH_HIGH, z: z0 + FOOTPATH_HIGH },
  );
}

function routeCorners(ctx) {
  const corridors = ctx.corridors;
  const out = [];
  const seen = new Set();
  const add = (vi, hi) => {
    const key = `${vi}:${hi}`;
    if (seen.has(key)) return;
    seen.add(key);
    pushJunctionCorners(out, vi, hi);
  };
  if (corridors?.vertical && corridors?.horizontal) {
    const tramV = corridors.vertical.filter((c) => c.tram);
    const tramH = corridors.horizontal.filter((c) => c.tram);
    const vList = tramV.length ? tramV : [];
    const hList = tramH.length ? tramH : [];
    for (const v of vList) {
      for (const h of corridors.horizontal) add(v.index, h.index);
    }
    for (const h of hList) {
      for (const v of corridors.vertical) add(v.index, h.index);
    }
    if (!out.length) {
      for (const v of corridors.vertical) {
        for (const h of corridors.horizontal) add(v.index, h.index);
      }
    }
  }
  if (!out.length && Array.isArray(ctx.transit)) {
    for (const stop of ctx.transit) {
      if (stop?.kind !== 'stop') continue;
      if (Number.isFinite(stop.x) && Number.isFinite(stop.z)) {
        out.push({ x: stop.x, z: stop.z });
      }
    }
  }
  return out;
}

function authoredStreetCorner(extent) {
  const cx = (extent.x ?? HERO_CANON_EXTENT.x) * 0.21;
  const cz = (extent.z ?? HERO_CANON_EXTENT.z) * 0.16;
  return { x: cx + 28, z: cz + 58 };
}

/**
 * Camera on the corridor line, one junction back from the target junction,
 * at eye height. Prefers a tram corridor. Null when no corridors exist.
 */
export function corridorStreetPose(ctx, extent) {
  const corridors = ctx?.corridors;
  const ex = Number(extent?.x) || HERO_CANON_EXTENT.x;
  const ez = Number(extent?.z) || HERO_CANON_EXTENT.z;
  const vert = corridors?.vertical ?? [];
  const horiz = corridors?.horizontal ?? [];
  const pick = (list) => list.find((c) => c.tram) ?? list[0] ?? null;
  const v = pick(vert);
  const h = pick(horiz);
  // Proven kerb pose (R1 frame): camera right-of-centre angled gently in,
  // eye 3.2, from the first junction. Corridor CHOICE handles the critic's
  // near-facade note: two flank rays per candidate pick the junction with
  // open frontages instead of an apartment wall against the lens.
  const eye = 3.2;
  const look = 3.0;
  const candidates = [];
  for (const c of vert) {
    if (!Number.isFinite(c.index)) continue;
    const x = c.index * GRID_PITCH + (FOOTPATH_LOW + FOOTPATH_HIGH) * 0.5;
    const zA = Math.min(ez - GRID_PITCH, GRID_PITCH);
    candidates.push({
      tram: !!c.tram,
      position: { x: x + 3.5, y: eye, z: zA },
      target: { x: x + 1.5, y: look, z: Math.min(ez, zA + GRID_PITCH * 2) },
      flanks: [
        { x: x + 14, y: 4, z: zA + 12 },
        { x: x - 8, y: 4, z: zA + 12 },
      ],
    });
  }
  for (const c of horiz) {
    if (!Number.isFinite(c.index)) continue;
    const z = c.index * GRID_PITCH + (FOOTPATH_LOW + FOOTPATH_HIGH) * 0.5;
    const xA = Math.min(ex - GRID_PITCH, GRID_PITCH);
    candidates.push({
      tram: !!c.tram,
      position: { x: xA, y: eye, z: z + 3.5 },
      target: { x: Math.min(ex, xA + GRID_PITCH * 2), y: look, z: z + 1.5 },
      flanks: [
        { x: xA + 12, y: 4, z: z + 14 },
        { x: xA + 12, y: 4, z: z - 8 },
      ],
    });
  }
  if (!candidates.length) return null;
  const canCast = typeof ctx?.castRay === 'function' || (ctx?.scene && ctx?.raycaster);
  let best = candidates[0];
  let bestScore = -Infinity;
  for (let i = 0; i < candidates.length; i += 1) {
    const cand = candidates[i];
    let score = cand.tram ? 2 : 0;
    if (canCast) {
      for (const flank of cand.flanks) {
        const d = Math.hypot(
          cand.position.x - flank.x,
          cand.position.y - flank.y,
          cand.position.z - flank.z,
        );
        const hit = probeRay(ctx, cand.position, flank, d, 'corridor');
        if (hit && hit.distance < d * 0.6) score -= 3;
      }
    }
    if (score > bestScore) { bestScore = score; best = cand; }
  }
  return { position: best.position, target: best.target };
}

function pickStreetSubject(ctx, extent) {
  const fallback = authoredStreetCorner(extent);
  const corners = routeCorners(ctx);
  if (!corners.length) return fallback;
  const people = collectPeoplePositions(ctx);
  if (!people.length) return fallback;
  let best = fallback;
  let bestScore = -Infinity;
  for (let i = 0; i < corners.length; i += 1) {
    const corner = corners[i];
    let nearby = 0;
    let minD = Infinity;
    for (const person of people) {
      const d = Math.hypot(person.x - corner.x, person.z - corner.z);
      if (d < 14) nearby += 1;
      if (d < minD) minD = d;
    }
    const toAuthored = Math.hypot(corner.x - fallback.x, corner.z - fallback.z);
    const score = nearby * 100 - minD - toAuthored * 0.04 - i * 1e-4;
    if (score > bestScore) {
      bestScore = score;
      best = corner;
    }
  }
  return best;
}

function worldPoint(obj) {
  obj.updateWorldMatrix?.(true, false);
  const mw = obj.matrixWorld?.elements;
  if (mw && mw.length >= 15) {
    return { x: mw[12], y: mw[13], z: mw[14] };
  }
  const p = obj.position;
  if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
    return { x: p.x, y: Number(p.y) || 0, z: p.z };
  }
  return null;
}

function resolveWorksSubject(ctx, loc) {
  const scene = ctx.scene;
  if (!scene || typeof scene.traverse !== 'function') {
    return { x: loc.x, y: 6.5, z: loc.z };
  }
  let best = null;
  let bestD = Infinity;
  scene.traverse((obj) => {
    const name = obj?.name;
    if (!name || !WORKS_NAME.test(name)) return;
    const wp = worldPoint(obj);
    if (!wp) return;
    const d = Math.hypot(wp.x - loc.x, wp.z - loc.z);
    if (d > 48 || d >= bestD) return;
    bestD = d;
    best = wp;
  });
  if (!best) return { x: loc.x, y: 6.5, z: loc.z };
  return {
    x: (best.x + loc.x) * 0.5,
    y: Math.max(6.5, Math.min(14, (Number(best.y) || 0) * 0.45 + 6)),
    z: (best.z + loc.z) * 0.5,
  };
}

function isIgnorableHit(hit) {
  let obj = hit?.object;
  while (obj) {
    const name = obj.name || '';
    if (IGNORE_HIT_NAME.test(name)) return true;
    obj = obj.parent;
  }
  if (hit?.object?.isSprite) return true;
  return false;
}

function sceneCast(ctx, origin, dest, far) {
  const raycaster = ctx.raycaster;
  const scene = ctx.scene;
  if (!raycaster?.ray || !scene || typeof raycaster.intersectObject !== 'function') return null;
  const dx = dest.x - origin.x;
  const dy = dest.y - origin.y;
  const dz = dest.z - origin.z;
  const len = Math.hypot(dx, dy, dz) || 1e-6;
  const prevNear = raycaster.near;
  const prevFar = raycaster.far;
  raycaster.ray.origin.set(origin.x, origin.y, origin.z);
  raycaster.ray.direction.set(dx / len, dy / len, dz / len);
  raycaster.near = 0.08;
  raycaster.far = Number.isFinite(far) ? far : len;
  if (raycaster.params?.Line) raycaster.params.Line.threshold = 1.25;
  let hits;
  try {
    hits = raycaster.intersectObject(scene, true);
  } finally {
    raycaster.near = prevNear;
    raycaster.far = prevFar;
  }
  if (!Array.isArray(hits)) return null;
  for (const hit of hits) {
    if (isIgnorableHit(hit)) continue;
    if (!Number.isFinite(hit.distance)) continue;
    return { distance: hit.distance };
  }
  return null;
}

function probeRay(ctx, origin, dest, far, kind) {
  const budget = ctx._rayBudget;
  if (budget) {
    if (budget.used >= HERO_MAX_RAYS) return null;
    budget.used += 1;
  }
  if (typeof ctx.castRay === 'function') {
    const hit = ctx.castRay({ origin, dest, far, kind });
    return hit && Number.isFinite(hit.distance) ? hit : null;
  }
  return sceneCast(ctx, origin, dest, far);
}

function edgeFactor(subject, extent) {
  const w = Number(extent?.x) || HERO_CANON_EXTENT.x;
  const d = Number(extent?.z) || HERO_CANON_EXTENT.z;
  const mx = Math.min(subject.x, w - subject.x) / w;
  const mz = Math.min(subject.z, d - subject.z) / d;
  const m = Math.min(mx, mz);
  if (m >= 0.12) return 0;
  return (0.12 - m) / 0.12;
}

function axisAlign(azimuth) {
  const halfPi = Math.PI / 2;
  const wrapped = Math.abs(azimuth) % halfPi;
  const dist = Math.min(wrapped, halfPi - wrapped);
  return 1 - dist / (Math.PI / 4);
}

function flankingPoints(position, subject, fov, aspect) {
  const fx = subject.x - position.x;
  const fy = subject.y - position.y;
  const fz = subject.z - position.z;
  const dist = Math.hypot(fx, fy, fz) || 1e-6;
  const inv = 1 / dist;
  const fwdX = fx * inv;
  const fwdY = fy * inv;
  const fwdZ = fz * inv;
  let rightX = fwdZ;
  let rightY = 0;
  let rightZ = -fwdX;
  const rLen = Math.hypot(rightX, rightZ) || 1e-6;
  rightX /= rLen;
  rightZ /= rLen;
  const upX = rightY * fwdZ - rightZ * fwdY;
  const upY = rightZ * fwdX - rightX * fwdZ;
  const upZ = rightX * fwdY - rightY * fwdX;
  const halfH = Math.tan(((fov || 36) * Math.PI) / 360) * dist;
  const halfW = halfH * (Number(aspect) > 0.2 ? aspect : DEFAULT_ASPECT);
  const oW = FLANK_FRAME * 2 * halfW;
  const oH = FLANK_FRAME * 2 * halfH;
  return [
    { x: subject.x + rightX * oW, y: subject.y, z: subject.z + rightZ * oW },
    { x: subject.x - rightX * oW, y: subject.y, z: subject.z - rightZ * oW },
    { x: subject.x + upX * oH, y: subject.y + upY * oH, z: subject.z + upZ * oH },
    { x: subject.x - upX * oH, y: subject.y - upY * oH, z: subject.z - upZ * oH },
  ];
}

/**
 * Two lower-frame probe points at 45% of subject distance: the failure the
 * flanks cannot see is a near roof plane filling the bottom of the shot.
 */
export function foregroundPoints(position, subject, fov, aspect) {
  const fx = subject.x - position.x;
  const fy = subject.y - position.y;
  const fz = subject.z - position.z;
  const dist = Math.hypot(fx, fy, fz) || 1e-6;
  const inv = 1 / dist;
  const fwdX = fx * inv;
  const fwdY = fy * inv;
  const fwdZ = fz * inv;
  let rightX = fwdZ;
  let rightZ = -fwdX;
  const rLen = Math.hypot(rightX, rightZ) || 1e-6;
  rightX /= rLen;
  rightZ /= rLen;
  const upX = -rightZ * fwdY;
  const upY = rightZ * fwdX - rightX * fwdZ;
  const upZ = rightX * fwdY;
  const mid = dist * 0.45;
  const halfH = Math.tan(((fov || 36) * Math.PI) / 360) * mid;
  const halfW = halfH * (Number(aspect) > 0.2 ? aspect : DEFAULT_ASPECT);
  const cx = position.x + fwdX * mid;
  const cy = position.y + fwdY * mid;
  const cz = position.z + fwdZ * mid;
  const drop = 0.7 * halfH;
  const side = 0.3 * halfW;
  return [
    { x: cx + rightX * side - upX * drop, y: cy - upY * drop, z: cz + rightZ * side - upZ * drop },
    { x: cx - rightX * side - upX * drop, y: cy - upY * drop, z: cz - rightZ * side - upZ * drop },
  ];
}

/**
 * Score one candidate. Higher is better. Centre-ray occluders take a reject-scale
 * penalty rather than being dropped, so a pose is always returned.
 */
export function scoreHeroCandidate(candidate, ctx = {}) {
  const W = HERO_SCORE_WEIGHTS;
  const subject = ctx.subject ?? candidate.target;
  const extent = ctx.extent ?? HERO_CANON_EXTENT;
  const pos = candidate.position;
  const dist = Math.hypot(pos.x - subject.x, pos.y - subject.y, pos.z - subject.z);
  if (dist < 1) return W.occluderReject;
  let score = 0;
  const index = candidate.index ?? 0;
  score += W.authoredFidelity * (1 - Math.min(1, Math.abs(HERO_CANDIDATE_GRID[index]?.az ?? 0) / 0.46));
  score += W.edge * edgeFactor(subject, extent);

  if (ctx.presetName === 'street') {
    const az = Math.atan2(pos.x - subject.x, pos.z - subject.z);
    score += W.corridorAlign * axisAlign(az);
  }

  const hasCaster = typeof ctx.castRay === 'function' || (ctx.scene && ctx.raycaster);
  if (!hasCaster) return score;

  const centreHit = probeRay(ctx, pos, subject, dist, 'centre');
  if (centreHit && centreHit.distance < dist * 0.12) {
    score += W.nearClutter;
  } else if (centreHit && centreHit.distance < dist * OCCLUDER_NEAR) {
    score += W.occluderReject;
  } else if (centreHit && centreHit.distance < dist * 0.95) {
    score += W.occluderClip;
  } else {
    score += W.centreClear;
  }

  const flanks = flankingPoints(pos, subject, candidate.fov, ctx.aspect);
  let nearFlanks = 0;
  for (let i = 0; i < flanks.length; i += 1) {
    const flank = flanks[i];
    const fDist = Math.hypot(pos.x - flank.x, pos.y - flank.y, pos.z - flank.z);
    const hit = probeRay(ctx, pos, flank, fDist, 'flank');
    if (hit && hit.distance < fDist * 0.12) {
      score += W.nearClutter;
    } else if (hit && hit.distance < fDist * OCCLUDER_NEAR) {
      score += W.flankOccluder;
      nearFlanks += 1;
    }
  }
  for (const fg of foregroundPoints(pos, subject, candidate.fov, ctx.aspect)) {
    const fgDist = Math.hypot(pos.x - fg.x, pos.y - fg.y, pos.z - fg.z);
    const fgHit = probeRay(ctx, pos, fg, fgDist, 'foreground');
    if (fgHit && fgHit.distance < fgDist * 0.55) score += W.foregroundFill;
  }
  if (nearFlanks === 0 && !(centreHit && centreHit.distance < dist * OCCLUDER_NEAR)) {
    score += W.singleSubject;
  } else if (nearFlanks >= 2) {
    score += W.competingMass;
  }

  const depthFar = dist * DEPTH_CLEAR_MUL;
  const depthHit = probeRay(ctx, pos, subject, depthFar, 'depth');
  if (!depthHit || depthHit.distance >= depthFar - 1e-3) {
    score += W.depthClear;
  } else if (depthHit.distance > dist * 1.02) {
    const t = (depthHit.distance / dist - 1) / (DEPTH_CLEAR_MUL - 1);
    score += W.depthPartial * clamp(t, 0, 1);
  }

  return score;
}

export function pickHeroPose(candidates, ctx = {}) {
  if (!candidates?.length) return null;
  const budget = ctx._rayBudget ?? { used: 0 };
  const scoredCtx = ctx._rayBudget ? ctx : { ...ctx, _rayBudget: budget };
  let best = candidates[0];
  let bestScore = -Infinity;
  let bestIndex = best.index ?? 0;
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const score = scoreHeroCandidate(candidate, scoredCtx);
    const index = candidate.index ?? i;
    if (score > bestScore || (score === bestScore && index < bestIndex)) {
      bestScore = score;
      best = candidate;
      bestIndex = index;
    }
  }
  return {
    position: { x: best.position.x, y: best.position.y, z: best.position.z },
    target: { x: best.target.x, y: best.target.y, z: best.target.z },
    fov: best.fov,
  };
}

function searchAround(base, ctx, name) {
  const candidates = generateHeroCandidates(base, { name });
  return pickHeroPose(candidates, {
    ...ctx,
    presetName: name,
    subject: {
      x: base.target.x,
      y: base.target.y,
      z: base.target.z,
    },
  }) ?? base;
}

function pickLandmark(ctx) {
  const list = ctx?.landmarks ?? ctx?.civicUses ?? [];
  if (!Array.isArray(list) || !list.length) return null;
  for (const id of LANDMARK_USE_IDS) {
    const hit = list.find((civic) => civic?.useId === id || civic?.id === id);
    if (hit?.centre) return hit;
  }
  return list.find((civic) => civic?.centre) ?? null;
}

function pickTallSubject(ctx) {
  const parcels = ctx?.parcels;
  if (!parcels || typeof parcels !== 'object') return null;
  let best = null;
  for (const parcel of Object.values(parcels)) {
    const storeys = Number(parcel?.storeys ?? parcel?.placement?.storeys ?? 0);
    if (!parcel?.centre) continue;
    if (!best || storeys > best.storeys) best = { centre: parcel.centre, storeys };
  }
  return best;
}

function parcelCentre(ctx, parcelId) {
  if (!parcelId) return null;
  const parcel = ctx?.parcels?.[parcelId];
  return parcel?.centre ?? null;
}

/**
 * Works ledger / live event / construction accident → a world point.
 * Returns null when nothing authored is on the board (caller falls back to skyline).
 */
export function resolveHeroEventLocation(ctx = {}) {
  const events = ctx.events;
  if (events?.order && events?.byId) {
    for (let i = events.order.length - 1; i >= 0; i -= 1) {
      const event = events.byId[events.order[i]];
      if (!event || event.status === 'resolved' || event.status === 'cancelled') continue;
      const id = event.anchorIds?.[0] ?? event.parcelId ?? event.id;
      const centre = parcelCentre(ctx, id);
      if (centre) return { x: centre.x, z: centre.z, source: 'event' };
    }
  }
  const ledger = ctx.ledger;
  if (Array.isArray(ledger) && ledger.length) {
    const row = ledger[ledger.length - 1];
    const completion = row?.completions?.[0] ?? row?.renovationCompletions?.[0];
    const accident = row?.constructionAccidents?.[0];
    // R2 walk: generic property events (arrears etc.) have no visible
    // subject on the board — only works read as an event on camera.
    const id = completion?.parcelId ?? accident?.parcelId;
    const centre = parcelCentre(ctx, id);
    if (centre) return { x: centre.x, z: centre.z, source: 'ledger' };
  }
  const holdings = ctx.holdings;
  if (holdings && typeof holdings === 'object') {
    for (const [id, holding] of Object.entries(holdings)) {
      if (!holding?.construction) continue;
      const centre = parcelCentre(ctx, id);
      if (centre) return { x: centre.x, z: centre.z, source: 'works' };
    }
  }
  if (Number.isFinite(ctx.lastEvent?.x) && Number.isFinite(ctx.lastEvent?.z)) {
    return { x: ctx.lastEvent.x, z: ctx.lastEvent.z, source: 'explicit' };
  }
  return null;
}

export function composeHeroPreset(name, ctx = {}) {
  const key = String(name ?? '').trim();
  if (!HERO_PRESETS[key]) return null;
  const extent = ctx.extent ?? HERO_CANON_EXTENT;
  const scaled = scalePresetToExtent(HERO_PRESETS[key], extent);
  const searchCtx = { ...ctx, extent };

  if (key === 'event') {
    const loc = resolveHeroEventLocation(ctx);
    if (!loc) return composeHeroPreset('skyline', ctx);
    const works = resolveWorksSubject(ctx, loc);
    return searchAround(retarget(scaled, works, works.y), searchCtx, key);
  }

  if (key === 'landmark') {
    const civic = pickLandmark(ctx);
    if (civic?.centre) {
      const height = Number(civic.storeys) > 0 ? civic.storeys * 3.2 * 0.55 : 16;
      return searchAround(retarget(scaled, civic.centre, height), searchCtx, key);
    }
  }

  if (key === 'skyline') {
    const tall = pickTallSubject(ctx);
    if (tall?.centre) {
      const height = Math.max(12, (tall.storeys || 4) * 3.2 * 0.7);
      return searchAround(retarget(scaled, tall.centre, height), searchCtx, key);
    }
    return searchAround(scaled, searchCtx, key);
  }

  if (key === 'street') {
    // Corridor-aligned by construction: the candidate search kept
    // converging into facades at street level (every ray signal ties in
    // dense fabric). Camera sits on the road line at eye height looking
    // down the SAME corridor one junction ahead — the road is the depth
    // path, buildings flank naturally, no search required.
    const lane = corridorStreetPose(ctx, extent);
    if (lane) return { position: lane.position, target: lane.target, fov: scaled.fov };
    const corner = pickStreetSubject(ctx, extent);
    return searchAround(retarget(scaled, corner, 3.4), searchCtx, key);
  }

  if (key === 'board') {
    const cx = (extent.x ?? HERO_CANON_EXTENT.x) * 0.5;
    const cz = (extent.z ?? HERO_CANON_EXTENT.z) * 0.5;
    return searchAround(retarget(scaled, { x: cx, z: cz }, 8), searchCtx, key);
  }

  return searchAround(scaled, searchCtx, key);
}

export function applyHeroPreset(rig, camera, preset, { duration = HERO_TWEEN_SECONDS } = {}) {
  if (!rig || !preset) return null;
  const pose = poseFromVectors(preset.position, preset.target);
  if (typeof rig.tweenToPose === 'function') {
    rig.tweenToPose({
      target: preset.target,
      azimuth: pose.azimuth,
      polar: pose.polar,
      distance: pose.distance,
      lookHeight: pose.lookHeight,
      fov: preset.fov,
    }, { duration });
  } else {
    rig.target?.set?.(preset.target.x, 0, preset.target.z);
    rig.azimuth = pose.azimuth;
    rig.polar = pose.polar;
    rig.distance = pose.distance;
    if (rig.lookHeight !== undefined) rig.lookHeight = pose.lookHeight;
    if (camera && Number.isFinite(preset.fov)) {
      camera.fov = preset.fov;
      camera.updateProjectionMatrix?.();
    }
    rig.update?.(1);
  }
  return pose;
}

export function heroContextFromView(view) {
  const city = view?.city;
  const state = view?.state;
  return {
    extent: city?.extent,
    waterEdge: city?.waterEdge,
    landmarks: city?.civicUses,
    parcels: city?.parcels,
    events: state?.events,
    ledger: state?.ledger,
    holdings: state?.holdings,
    corridors: city?.corridors,
    transit: city?.transit,
    scene: view?.scene,
    raycaster: view?.raycaster,
    people: view?.people,
    ambientLife: view?.ambientLife,
    aspect: view?.camera?.aspect,
  };
}

export function applyHeroFromView(view, name) {
  if (name == null || name === '') return listHeroPresets();
  const preset = composeHeroPreset(name, heroContextFromView(view));
  if (!preset) return listHeroPresets();
  const duration = view?.reducedMotion ? 0 : HERO_TWEEN_SECONDS;
  applyHeroPreset(view?.rig, view?.camera, preset, { duration });
  return preset;
}

export function registerHeroCamera(dd, view) {
  if (!dd || typeof dd !== 'object') return dd;
  dd.hero = (name) => applyHeroFromView(view, name);
  dd.heroList = () => listHeroPresets();
  return dd;
}

function isHeroStub(obj) {
  if (!obj || typeof obj !== 'object') return true;
  const keys = Object.keys(obj);
  return keys.length === 0 || keys.every((key) => key === 'hero' || key === 'heroList');
}

export function bindHeroCameraConsole(view) {
  const host = typeof globalThis === 'undefined' ? null : globalThis;
  if (!host) return;
  const win = host.window ?? host;
  const attach = (obj) => {
    if (obj && typeof obj === 'object') registerHeroCamera(obj, view);
  };

  const install = (obj) => {
    if (obj && typeof obj === 'object') {
      attach(obj);
      if (!win.dd || isHeroStub(win.dd) || win.dd === obj) win.dd = obj;
      else attach(win.dd);
    } else {
      win.dd = win.dd && typeof win.dd === 'object' ? win.dd : {};
      attach(win.dd);
    }
  };

  install(win.__districtDeck ?? win.dd);

  try {
    let current = win.__districtDeck;
    Object.defineProperty(win, '__districtDeck', {
      configurable: true,
      enumerable: true,
      get() { return current; },
      set(value) {
        current = value;
        install(value);
      },
    });
  } catch {
    attach(win.dd);
  }
}
