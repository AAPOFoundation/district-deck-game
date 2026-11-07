// District Deck — coastal tap physics (presentation only).
// Owner seat: INTERACT. Contract: ./contract.js — read it before editing.
//
// A tap on the bay or the beach is one event: mass, friction, a damped spring,
// an expanding ring, and a spray of droplets or grains. Energy leaks if the
// player stops. Kept tapping on the same patch stacks energy until mischief
// (a bigger splash, a deeper crater, a thrown spray).
//
// Hard rules inherited from the coast contract:
//   1. No Math.random / Date.now. Impulses are seeded; time is the capture clock.
//   2. Wave troughs still never go through WATER_FLOOR_Y — the vertex clamp stays.
//   3. Nothing writes simulation state. This is renderer-local, like sway.js.
//   4. No backticks inside the GLSL template literal.

import * as THREE from 'three';
import { WATER_FACE, WATER_FLOOR_Y, WATER_Y } from './contract.js';

export const TAP_CAPACITY = 8;
export const TAP_KIND = Object.freeze({ water: 0, sand: 1 });

/** Rest thresholds — below these a slot is recycled. */
const REST_ENERGY = 0.008;
const REST_AMP = 0.0012;
const FIXED_DT = 1 / 60;
const MERGE_M = 5.4;

/**
 * Per-surface oscillator. Units: omega rad/s, zeta dimensionless, impulse
 * (energy units per tap), mass (heavier = slower rise), friction 1/s,
 * decay 1/s extra energy leak, radius metres of influence.
 *
 * Water is heavy and slow — a slap that sloshes and rings out.
 * Sand is heavier still, more friction, a thud that settles quickly.
 */
export const TAP_PROFILES = Object.freeze({
  water: Object.freeze({
    omega: 4.15,
    zeta: 0.18,
    impulse: 0.40,
    energyHit: 0.38,
    mass: 1.05,
    friction: 0.46,
    decay: 0.62,
    radius: 10.2,
    celerity: 4.6,
    maxEnergy: 1,
    mischiefEnergy: 0.80,
    mischiefHits: 5,
  }),
  sand: Object.freeze({
    omega: 7.40,
    zeta: 0.34,
    impulse: 0.28,
    energyHit: 0.30,
    mass: 1.70,
    friction: 0.78,
    decay: 1.12,
    radius: 4.4,
    celerity: 2.05,
    maxEnergy: 1,
    mischiefEnergy: 0.76,
    mischiefHits: 6,
  }),
});

function emptyTap() {
  return {
    kind: TAP_KIND.water,
    along: 0,
    front: 0,
    worldX: 0,
    worldY: WATER_Y,
    worldZ: 0,
    energy: 0,
    amp: 0,
    vel: 0,
    phase: 0,
    age: 0,
    hits: 0,
    mischief: 0,
    scar: 0,
    live: false,
    burst: 0,
  };
}

export function createCoastField() {
  return {
    taps: Array.from({ length: TAP_CAPACITY }, emptyTap),
    cursor: 0,
    reducedMotion: false,
  };
}

export function resetCoastField(field) {
  for (const tap of field.taps) Object.assign(tap, emptyTap());
  field.cursor = 0;
  return field;
}

/** JS mirror of contract ddCoastLine — keep in step or the tap lands off the join. */
export function coastLineAt(along, t, waterFace = WATER_FACE) {
  let m = Math.sin(along * 0.0080) * 2.10
    + Math.sin(along * 0.0191 + 1.7) * 1.15
    + Math.sin(along * 0.0413 + 0.55) * 0.52;
  m += Math.sin(along * 0.0110 - t * 0.14) * 0.55
    + Math.sin(along * 0.0281 + t * 0.21 + 1.1) * 0.32;
  return waterFace + m;
}

/**
 * World XZ -> shore frame. Matches contract ddAlong / ddShoreDist exactly.
 * @param {{x:number,z:number}} world
 * @param {{origin: THREE.Vector3, normal: THREE.Vector3}} frame
 */
export function worldToShore(world, frame) {
  const n = frame.normal;
  const origin = frame.origin;
  const along = world.x * n.z - world.z * n.x;
  const shore = (world.x - origin.x) * n.x + (world.z - origin.z) * n.z;
  return { along, shore };
}

export function shoreToWorld(along, shore, frame, y = WATER_Y) {
  const n = frame.normal;
  // Inverse of ddAlong on the origin, plus seaward offset.
  // along = w.x * n.z - w.z * n.x
  // A point on the wall face with this along:
  const alongVecX = n.z;
  const alongVecZ = -n.x;
  // Origin's along-coordinate.
  const originAlong = originAlongOf(frame);
  const dAlong = along - originAlong;
  return {
    x: frame.origin.x + alongVecX * dAlong + n.x * shore,
    y,
    z: frame.origin.z + alongVecZ * dAlong + n.z * shore,
  };
}

function originAlongOf(frame) {
  return frame.origin.x * frame.normal.z - frame.origin.z * frame.normal.x;
}

export function profileForKind(kind) {
  return kind === TAP_KIND.sand ? TAP_PROFILES.sand : TAP_PROFILES.water;
}

function kindName(kind) {
  return kind === TAP_KIND.sand ? 'sand' : 'water';
}

/**
 * Seeded unit in [0, 1). Deterministic substitute for Math.random.
 * @param {number} a
 * @param {number} b
 * @param {number} c
 */
export function tapHash(a, b, c = 0) {
  let n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  n -= Math.floor(n);
  return n;
}

function findMergeSlot(field, kind, along, front) {
  let best = -1;
  let bestD = MERGE_M;
  for (let i = 0; i < TAP_CAPACITY; i += 1) {
    const tap = field.taps[i];
    if (!tap.live || tap.kind !== kind) continue;
    const d = Math.hypot(tap.along - along, tap.front - front);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function allocSlot(field) {
  let dead = field.taps.findIndex((t) => !t.live);
  if (dead >= 0) return dead;
  let oldest = 0;
  for (let i = 1; i < TAP_CAPACITY; i += 1) {
    if (field.taps[i].age > field.taps[oldest].age) oldest = i;
  }
  return oldest;
}

/**
 * Add a tap impulse. Nearby live taps of the same kind merge so a drumroll on
 * one patch is one oscillator getting louder, not eight overlapping rings.
 *
 * @param {ReturnType<typeof createCoastField>} field
 * @param {{
 *   kind: number,
 *   along: number,
 *   front: number,
 *   worldX?: number,
 *   worldY?: number,
 *   worldZ?: number,
 * }} hit
 */
export function impulseCoast(field, hit) {
  if (field.reducedMotion) return { slot: -1, tap: null, merged: false, mischief: false };
  const kind = hit.kind === TAP_KIND.sand ? TAP_KIND.sand : TAP_KIND.water;
  const profile = profileForKind(kind);
  const along = hit.along;
  const front = hit.front;
  const mergedAt = findMergeSlot(field, kind, along, front);
  const slot = mergedAt >= 0 ? mergedAt : allocSlot(field);
  const tap = field.taps[slot];
  const merged = mergedAt >= 0;

  if (!merged) {
    Object.assign(tap, emptyTap());
    tap.kind = kind;
    tap.along = along;
    tap.front = front;
    tap.worldX = hit.worldX ?? 0;
    tap.worldY = hit.worldY ?? WATER_Y;
    tap.worldZ = hit.worldZ ?? 0;
    tap.phase = tapHash(along, front, kind) * Math.PI * 2;
  } else {
    // Walk the centre a little toward the new hit so a sliding drumroll tracks.
    tap.along = tap.along * 0.62 + along * 0.38;
    tap.front = tap.front * 0.62 + front * 0.38;
    tap.worldX = tap.worldX * 0.62 + (hit.worldX ?? tap.worldX) * 0.38;
    tap.worldZ = tap.worldZ * 0.62 + (hit.worldZ ?? tap.worldZ) * 0.38;
  }

  const boost = 1 + Math.min(0.95, tap.energy * 0.85);
  const impulse = profile.impulse * boost / profile.mass;
  tap.vel += impulse;
  tap.amp += impulse * 0.16;
  tap.energy = Math.min(
    profile.maxEnergy,
    tap.energy + profile.energyHit * (0.72 + tapHash(along + tap.hits, front, 2.1) * 0.28),
  );
  tap.hits += 1;
  // Merged drumroll must NOT rewind the ring. Age is travel time; a slap that
  // keeps restarting at r=0 is a blob on contact and a halo after you stop.
  if (!merged) tap.age = 0;
  tap.live = true;
  tap.burst = 1;
  tap.scar = Math.min(1, tap.scar + (kind === TAP_KIND.sand ? 0.78 : 0.55));

  const crossed = tap.mischief < 1
    && (tap.energy >= profile.mischiefEnergy || tap.hits >= profile.mischiefHits);
  if (crossed) {
    tap.mischief = 1;
    tap.energy = 1;
    tap.vel += profile.impulse * 1.35;
    tap.burst = 2;
  }

  field.cursor = slot;
  return { slot, tap, merged, mischief: crossed };
}

function integrateTap(tap, dt) {
  const profile = profileForKind(tap.kind);
  const omega = profile.omega;
  const twoZetaOmega = 2 * profile.zeta * omega;
  // theta'' + 2 zeta omega theta' + omega^2 theta = 0, plus Coulomb-ish friction
  const acc = -omega * omega * tap.amp - twoZetaOmega * tap.vel;
  tap.vel += acc * dt;
  tap.vel *= Math.max(0, 1 - profile.friction * dt * 0.35);
  tap.amp += tap.vel * dt;
  tap.phase += omega * dt;
  tap.age += dt;
  tap.energy = Math.max(0, tap.energy - profile.decay * dt);
  tap.burst = Math.max(0, tap.burst - dt * 1.28);
  if (tap.mischief > 0) tap.mischief = Math.max(0, tap.mischief - dt * 0.72);
  tap.scar = Math.max(0, tap.scar - dt * (tap.kind === TAP_KIND.sand ? 0.085 : 0.42));

  const still = Math.abs(tap.amp) < REST_AMP
    && Math.abs(tap.vel) < REST_AMP
    && tap.energy < REST_ENERGY
    && tap.scar < REST_ENERGY
    && tap.age > 0.35;
  if (still) {
    Object.assign(tap, emptyTap());
  }
}

/**
 * Fixed-step damped springs. Reduced motion snaps every slot off.
 */
export function stepCoast(field, dt) {
  if (field.reducedMotion) {
    resetCoastField(field);
    return field;
  }
  let remaining = Math.min(0.05, Math.max(0, dt));
  while (remaining > 1e-6) {
    const step = Math.min(FIXED_DT, remaining);
    remaining -= step;
    for (const tap of field.taps) {
      if (tap.live) integrateTap(tap, step);
    }
  }
  return field;
}

export function fieldEnergy(field) {
  let e = 0;
  for (const tap of field.taps) if (tap.live) e += tap.energy;
  return e;
}

export function liveTaps(field) {
  return field.taps.filter((t) => t.live);
}

/** Shared GPU uniforms. Water and sand MUST hold the same objects. */
export function createInteractUniforms() {
  return {
    uTapAlong: { value: new Float32Array(TAP_CAPACITY) },
    uTapFront: { value: new Float32Array(TAP_CAPACITY) },
    uTapEnergy: { value: new Float32Array(TAP_CAPACITY) },
    uTapAmp: { value: new Float32Array(TAP_CAPACITY) },
    uTapAge: { value: new Float32Array(TAP_CAPACITY) },
    uTapPhase: { value: new Float32Array(TAP_CAPACITY) },
    uTapKind: { value: new Float32Array(TAP_CAPACITY) },
    uTapHits: { value: new Float32Array(TAP_CAPACITY) },
    uTapMischief: { value: new Float32Array(TAP_CAPACITY) },
    uTapScar: { value: new Float32Array(TAP_CAPACITY) },
    uTapBurst: { value: new Float32Array(TAP_CAPACITY) },
  };
}

export function writeInteractUniforms(field, uniforms) {
  for (let i = 0; i < TAP_CAPACITY; i += 1) {
    const tap = field.taps[i];
    uniforms.uTapAlong.value[i] = tap.along;
    uniforms.uTapFront.value[i] = tap.front;
    uniforms.uTapEnergy.value[i] = tap.live ? tap.energy : 0;
    uniforms.uTapAmp.value[i] = tap.live ? tap.amp : 0;
    uniforms.uTapAge.value[i] = tap.age;
    uniforms.uTapPhase.value[i] = tap.phase;
    uniforms.uTapKind.value[i] = tap.kind;
    uniforms.uTapHits.value[i] = tap.hits;
    uniforms.uTapMischief.value[i] = tap.mischief;
    uniforms.uTapScar.value[i] = tap.scar;
    uniforms.uTapBurst.value[i] = tap.live ? tap.burst : 0;
  }
}

/**
 * GLSL sample. Injected into the water program and the sand material.
 * Returns displacement, extra foam, crater, scatter, wetness, energy, mischief.
 *
 * Prefix ddTap so it cannot collide with three.js chunks or the other seats.
 */
export const INTERACT_GLSL = /* glsl */ `
  #ifndef DD_INTERACT
  #define DD_INTERACT

  #define DD_TAP_N 8

  uniform float uTapAlong[DD_TAP_N];
  uniform float uTapFront[DD_TAP_N];
  uniform float uTapEnergy[DD_TAP_N];
  uniform float uTapAmp[DD_TAP_N];
  uniform float uTapAge[DD_TAP_N];
  uniform float uTapPhase[DD_TAP_N];
  uniform float uTapKind[DD_TAP_N];
  uniform float uTapHits[DD_TAP_N];
  uniform float uTapMischief[DD_TAP_N];
  uniform float uTapScar[DD_TAP_N];
  uniform float uTapBurst[DD_TAP_N];

  struct DDTap {
    float height;
    float foam;
    float crater;
    float scatter;
    float wet;
    float energy;
    float mischief;
    float ring;
  };

  DDTap ddTapSample(float along, float front) {
    DDTap o;
    o.height = 0.0;
    o.foam = 0.0;
    o.crater = 0.0;
    o.scatter = 0.0;
    o.wet = 0.0;
    o.energy = 0.0;
    o.mischief = 0.0;
    o.ring = 0.0;

    for (int i = 0; i < DD_TAP_N; i++) {
      float e = uTapEnergy[i];
      float scar = uTapScar[i];
      float live = max(e, scar);
      if (live < 0.004) continue;
      float da = along - uTapAlong[i];
      float df = front - uTapFront[i];
      float sand = uTapKind[i];
      float water = 1.0 - sand;
      float age = uTapAge[i];
      float mischief = uTapMischief[i];
      float burst = uTapBurst[i];
      float phase = uTapPhase[i];
      // Water: dark trough at the finger, then a HEIGHT swell that travels.
      // Tap foam is lace only. A filled disc is the ice / milk cloud.
      float distS = length(vec2(da, df));
      float dist = distS;
      float radius = mix(13.5, 6.4, sand) * (0.58 + 0.50 * live);
      float fall = exp(-dist * dist / max(radius * radius, 0.20));
      if (fall < 0.0012) continue;

      float angS = atan(df, da);
      float sway = sin(phase) * uTapAmp[i];
      float grown = 1.0 - exp(-age * mix(2.40, 3.60, sand));
      float young = exp(-age * mix(1.05, 2.80, sand));
      float punch = max(burst, young);
      float liveFoam = smoothstep(0.10, 0.32, punch);

      // R49: WEIGHT = dent + crown height. Ring is a taller travelling annulus.
      float slapCore = exp(-(da * da) / 9.0) * exp(-(df * df) / 9.0);
      float cres = 0.90 + 0.10 * pow(clamp(df / max(distS, 0.18), 0.0, 1.0), 0.85);
      float tear = 0.58 + 0.42 * pow(abs(sin(angS * 2.05 + phase * 0.18)), 0.48);
      float gaps = smoothstep(0.10, 0.58, ddValueNoise(vec2(angS * 1.55, phase)));
      float ringR = 1.70 + age * 7.2 * (0.84 + 0.16 * e);
      ringR *= 1.0 - smoothstep(0.55, 0.95, age);
      float ringBand = exp(-pow((distS - ringR) / 0.55, 2.0));
      float ring = ringBand * cres * tear * gaps;
      float dent = slapCore * punch * (1.0 - smoothstep(0.12, 0.30, age));
      float crown = exp(-pow((distS - 1.55) / 0.50, 2.0)) * cres * tear * punch;
      o.height += water * (-min(dent, 1.0) * 0.52 + crown * 0.48 + ring * 0.40);
      o.foam += 0.0;
      o.crater += water * min(dent, 1.0) * 0.18;
      o.wet += water * (dent * 0.12 * punch + ring * 0.62);
      o.ring = max(o.ring, ring * 0.98);

      // R49: r47 placement (heap beside a linear trench) without the tent or pond.
      float slumpK = 1.0 - clamp(burst * 2.0 + e * 1.6, 0.0, 1.0);
      float trenchLive = clamp(burst * 0.95 + e * 0.58, 0.0, 1.0);
      float trenchAmt = max(trenchLive, scar * slumpK * 0.64);
      float heapDig = clamp(burst * 0.55 * (1.0 - mischief), 0.0, 1.0);
      float heapThrow = clamp(mischief * max(burst, 0.20), 0.0, 1.0);
      float heapSlump = scar * slumpK * 0.96;
      float heapAmt = max(max(heapDig, heapThrow), heapSlump);
      float trench = exp(-(da * da) / 0.30 - (df * df) / 4.80);
      float pinch = exp(-pow(da - 0.52, 2.0) / 0.10) * exp(-(df * df) / 3.40);
      float hx = da - 1.22;
      float hz = df - 0.06;
      float heapA = exp(-(hx * hx) / mix(0.62, 1.05, slumpK) - (hz * hz) / mix(0.52, 0.88, slumpK));
      float heapB = exp(-pow(hx - 0.48, 2.0) / 0.34 - pow(hz + 0.32, 2.0) / 0.28);
      float heap = max(heapA * 0.88, heapB * mix(0.50, 0.30, slumpK));

      o.height += sand * (
        - trench * trenchAmt * 0.44
        + pinch * trenchAmt * 0.14
        + heap * heapAmt * 0.42
      );
      o.crater += sand * trench * trenchAmt;
      o.scatter += sand * (pinch * trenchAmt * 0.28 + heap * heapAmt);
      o.wet += sand * trench * trenchAmt * 0.04;
      o.energy += e * fall;
      o.mischief += mischief * fall;
    }

    o.foam = clamp(o.foam, 0.0, 1.45);
    o.crater = clamp(o.crater, 0.0, 1.0);
    o.scatter = clamp(o.scatter, 0.0, 1.0);
    o.wet = clamp(o.wet, 0.0, 1.0);
    o.mischief = clamp(o.mischief, 0.0, 1.0);
    o.energy = clamp(o.energy, 0.0, 1.6);
    return o;
  }

  #endif
`;

const SPRAY_WATER = 192;
const SPRAY_SAND = 192;

function dropletTexture() {
  const size = 32;
  const canvas = (typeof document !== 'undefined' && document.createElement)
    ? document.createElement('canvas')
    : null;
  if (!canvas || typeof canvas.getContext !== 'function') {
    const data = new Uint8Array([255, 255, 255, 200]);
    const texture = new THREE.DataTexture(data, 1, 1);
    texture.needsUpdate = true;
    return texture;
  }
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.92)');
  g.addColorStop(0.22, 'rgba(236,246,248,0.55)');
  g.addColorStop(0.55, 'rgba(220,236,240,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function grainTexture() {
  const size = 16;
  const canvas = (typeof document !== 'undefined' && document.createElement)
    ? document.createElement('canvas')
    : null;
  if (!canvas || typeof canvas.getContext !== 'function') {
    const data = new Uint8Array([210, 160, 90, 255]);
    const texture = new THREE.DataTexture(data, 1, 1);
    texture.needsUpdate = true;
    return texture;
  }
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(110,78,36,1)';
  ctx.beginPath();
  ctx.ellipse(size / 2, size / 2, 2.4, 1.5, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(58,42,22,1)';
  ctx.fillRect(6, 7, 3, 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Pooled spray: water droplets and sand grains. Deterministic from the tap
 * identity. Presentation only — never writes sim state.
 */
export class CoastSpray {
  /**
   * @param {THREE.Object3D} parent
   */
  constructor(parent) {
    this.parent = parent;
    this.root = new THREE.Group();
    this.root.name = 'nature:coast-spray';
    this._texture = dropletTexture();
    this._grainTexture = grainTexture();
    this._waterMat = new THREE.PointsMaterial({
      map: this._texture,
      color: 0x1e4a52,
      size: 1.42,
      transparent: true,
      depthWrite: false,
      opacity: 0.90,
      sizeAttenuation: true,
    });
    this._sandMat = new THREE.PointsMaterial({
      map: this._grainTexture,
      color: 0xc49a58,
      size: 0.95,
      transparent: true,
      depthWrite: false,
      opacity: 1.0,
      sizeAttenuation: true,
    });
    this._waterPos = new Float32Array(SPRAY_WATER * 3);
    this._sandPos = new Float32Array(SPRAY_SAND * 3);
    this._waterGeo = new THREE.BufferGeometry();
    this._sandGeo = new THREE.BufferGeometry();
    this._waterGeo.setAttribute('position', new THREE.BufferAttribute(this._waterPos, 3));
    this._sandGeo.setAttribute('position', new THREE.BufferAttribute(this._sandPos, 3));
    this._waterPts = new THREE.Points(this._waterGeo, this._waterMat);
    this._sandPts = new THREE.Points(this._sandGeo, this._sandMat);
    this._waterPts.frustumCulled = false;
    this._sandPts.frustumCulled = false;
    this._waterPts.renderOrder = 8;
    this._sandPts.renderOrder = 7;
    this.root.add(this._waterPts, this._sandPts);
    parent.add(this.root);

    this._water = Array.from({ length: SPRAY_WATER }, () => this._emptyBody());
    this._sand = Array.from({ length: SPRAY_SAND }, () => this._emptyBody());
    this._waterCursor = 0;
    this._sandCursor = 0;
    this.reducedMotion = false;
  }

  _emptyBody() {
    return {
      x: 0, y: -20, z: 0, vx: 0, vy: 0, vz: 0, life: 0, fade: 1, ground: WATER_Y,
    };
  }

  /**
   * @param {{ worldX:number, worldY:number, worldZ:number, kind:number, energy:number, mischief:number, hits:number, along:number, front:number }} tap
   * @param {{x:number,y:number,z:number}} seaward
   */
  burst(tap, seaward) {
    if (this.reducedMotion) return;
    const sand = tap.kind === TAP_KIND.sand;
    const pool = sand ? this._sand : this._water;
    const n = sand
      ? Math.round(3 + tap.energy * 3 + tap.mischief * 4)
      : Math.round(4 + tap.energy * 2 + tap.mischief * 6);
    const speed = sand
      ? 1.6 + tap.energy * 1.1 + tap.mischief * 1.4
      : 2.6 + tap.energy * 1.4 + tap.mischief * 1.8;
    const lift = sand
      ? 1.1 + tap.energy * 0.5 + tap.mischief * 0.7
      : 3.4 + tap.energy * 1.3 + tap.mischief * 1.8;
    const seaAng = Math.atan2(seaward.z, seaward.x);
    const spoilAz = tapHash(tap.along, tap.front, 3.17) * Math.PI * 2;
    for (let i = 0; i < n; i += 1) {
      const h = tapHash(tap.along, tap.front, tap.hits * 17.3 + i);
      const h2 = tapHash(tap.front, tap.along, tap.hits * 9.1 + i + 4);
      // Sand throws to one azimuth. A full circle is a bagel of grains.
      // Water is a seaward cone. Full-circle spray is a hoop of droplets.
      const alongAng = seaAng + Math.PI * 0.50;
      const ang = sand
        ? alongAng + (h - 0.5) * Math.PI * 0.42
        : seaAng + (h - 0.5) * Math.PI * 0.42;
      const elev = sand ? 0.58 + h2 * 0.82 : 0.72 + h2 * 0.90;
      const launch = speed * (0.58 + h * 0.50);
      const cursor = sand ? this._sandCursor : this._waterCursor;
      const body = pool[cursor];
      if (sand) this._sandCursor = (cursor + 1) % pool.length;
      else this._waterCursor = (cursor + 1) % pool.length;
      const rad = sand
        ? 1.55 + h2 * 2.10 + tap.mischief * 0.95
        : 0.22 + h2 * 0.90;
      body.x = tap.worldX + Math.cos(ang) * rad;
      body.y = (tap.worldY ?? WATER_Y) + 0.18 + h * 0.22;
      body.z = tap.worldZ + Math.sin(ang) * rad;
      body.vx = Math.cos(ang) * launch * elev + seaward.x * launch * (sand ? 0.10 : 0.38);
      body.vy = lift * (0.88 + h2 * 0.48);
      body.vz = Math.sin(ang) * launch * elev + seaward.z * launch * (sand ? 0.10 : 0.38);
      body.life = 1;
      body.fade = sand ? 0.62 + h * 0.18 : 3.40 + h * 0.40;
      body.ground = sand ? (tap.worldY ?? 0.06) : WATER_Y;
    }
  }

  update(dt) {
    if (this.reducedMotion) {
      for (const body of this._water) body.life = 0;
      for (const body of this._sand) body.life = 0;
    } else {
      this._stepPool(this._water, dt, {
        gravity: -22,
        restitution: 0.22,
        friction: 0.62,
        drag: 0.18,
      });
      this._stepPool(this._sand, dt, {
        gravity: -28,
        restitution: 0.08,
        friction: 0.84,
        drag: 0.42,
      });
    }
    this._write(this._water, this._waterPos, this._waterGeo);
    this._write(this._sand, this._sandPos, this._sandGeo);
  }

  _stepPool(pool, dt, { gravity, restitution, friction, drag }) {
    const remainingCap = Math.min(0.05, Math.max(0, dt));
    for (const body of pool) {
      if (body.life <= 0) continue;
      let remaining = remainingCap;
      while (remaining > 1e-6) {
        const step = Math.min(FIXED_DT, remaining);
        remaining -= step;
        body.vy += gravity * step;
        body.vx *= Math.max(0, 1 - drag * step);
        body.vz *= Math.max(0, 1 - drag * step);
        body.x += body.vx * step;
        body.y += body.vy * step;
        body.z += body.vz * step;
        if (body.y <= body.ground && body.vy <= 0) {
          body.y = body.ground;
          body.vy = -body.vy * restitution;
          body.vx *= friction;
          body.vz *= friction;
          if (Math.abs(body.vy) < 0.35) {
            body.vy = 0;
            body.vx *= 0.35;
            body.vz *= 0.35;
            // Landed grains stay on the beach; water specks die on contact.
            body.fade = Math.min(body.fade, restitution < 0.12 ? 0.045 : 4.2);
          }
        }
      }
      body.life -= dt * body.fade;
    }
  }

  _write(pool, positions, geometry) {
    for (let i = 0; i < pool.length; i += 1) {
      const body = pool[i];
      const o = i * 3;
      if (body.life > 0) {
        positions[o] = body.x;
        positions[o + 1] = body.y;
        positions[o + 2] = body.z;
      } else {
        positions[o] = 0;
        positions[o + 1] = -40;
        positions[o + 2] = 0;
      }
    }
    geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    if (this.root.parent) this.root.parent.remove(this.root);
    this._waterGeo.dispose();
    this._sandGeo.dispose();
    this._waterMat.dispose();
    this._sandMat.dispose();
    this._texture.dispose?.();
    this._grainTexture.dispose?.();
  }
}

export default {
  TAP_CAPACITY,
  TAP_KIND,
  TAP_PROFILES,
  createCoastField,
  resetCoastField,
  impulseCoast,
  stepCoast,
  fieldEnergy,
  liveTaps,
  createInteractUniforms,
  writeInteractUniforms,
  INTERACT_GLSL,
  CoastSpray,
  worldToShore,
  shoreToWorld,
  coastLineAt,
  WATER_FLOOR_Y,
  kindName,
};
