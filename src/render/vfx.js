// District Deck V3.00 / V3.10 W2-PHYS — gameplay VFX.
// Framework §6.3 / MengTo create-game-vfx: pooled, capped, idempotent cleanup, and a
// reduced-motion equivalent for every effect. Meaning before spectacle: each effect
// says what happened, it does not decorate.
//
// W2-PHYS adds Monopoly-Plus toy physics presentation: volumetric-ish dust, sparks,
// and settling debris boxes. All trajectories are deterministic from seed + eventId.
// Presentation only — never writes simulation state.
//
// Required hooks (prefer main / scene callers; board may stay free of VFX imports):
//   view.vfx.demolition(worldPoint, { seed, eventId })  — redevelop / rival redevelop
//   view.vfx.construction(worldPoint, { seed, eventId }) — works complete / renovate dust
//   view.vfx.tip(worldPoint, { seed, eventId, intensity }) — mischief tip / knock

import * as THREE from 'three';
import {
  physStream,
  spawnDebris,
  spawnDust,
  spawnSpark,
  stepDebris,
  stepDust,
  stepSpark,
  GROUND_Y,
} from './physics.js';

const MAX_RINGS = 12;
const MAX_MOTES = 160;
const MAX_DUST = 220;
const MAX_SPARKS = 96;
const MAX_DEBRIS = 56;

const _colour = new THREE.Color();
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();

function softDiscTexture() {
  const size = 64;
  const canvas = (typeof document !== 'undefined' && document.createElement)
    ? document.createElement('canvas')
    : null;
  // Node / headless: fall back to a solid DataTexture so dispose paths stay valid.
  if (!canvas || typeof canvas.getContext !== 'function') {
    const data = new Uint8Array([255, 255, 255, 200]);
    const texture = new THREE.DataTexture(data, 1, 1);
    texture.needsUpdate = true;
    return texture;
  }
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.12)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export class Vfx {
  constructor(scene) {
    this.scene = scene;
    this.reducedMotion = false;
    this.time = 0;

    this.ringPool = [];
    this.activeRings = [];
    const ringGeometry = new THREE.RingGeometry(0.5, 0.62, 40);
    for (let i = 0; i < MAX_RINGS; i += 1) {
      const mesh = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({
        transparent: true, side: THREE.DoubleSide, depthWrite: false,
      }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 6;
      scene.add(mesh);
      this.ringPool.push(mesh);
    }

    // One reusable translucent quad marks a district's block footprint (V3.39 item 15).
    this.shadeMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: '#e9b45a', transparent: true, opacity: 0.22, depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.shadeMesh.rotation.x = -Math.PI / 2;
    this.shadeMesh.visible = false;
    this.shadeMesh.renderOrder = 5;
    scene.add(this.shadeMesh);
    this.shadeUntil = 0;

    // A single pooled point cloud carries every rising mote; no per-frame allocation.
    const positions = new Float32Array(MAX_MOTES * 3);
    const colours = new Float32Array(MAX_MOTES * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    this.motes = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: 1.1, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
      sizeAttenuation: true,
    }));
    this.motes.frustumCulled = false;
    scene.add(this.motes);
    this.moteState = Array.from({ length: MAX_MOTES }, () => ({ life: 0 }));
    this.moteCursor = 0;
    geometry.setDrawRange(0, 0);

    // --- W2-PHYS: dust / sparks / debris ------------------------------------
    this.dustTexture = softDiscTexture();
    const dustPositions = new Float32Array(MAX_DUST * 3);
    const dustColours = new Float32Array(MAX_DUST * 3);
    const dustSizes = new Float32Array(MAX_DUST);
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    dustGeometry.setAttribute('color', new THREE.BufferAttribute(dustColours, 3));
    dustGeometry.setAttribute('size', new THREE.BufferAttribute(dustSizes, 1));
    dustGeometry.setDrawRange(0, 0);
    this.dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
      map: this.dustTexture,
      size: 2.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
    }));
    this.dust.name = 'vfx:dust';
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 7;
    scene.add(this.dust);
    this.dustState = Array.from({ length: MAX_DUST }, () => ({ life: 0 }));
    this.dustCursor = 0;

    const sparkPositions = new Float32Array(MAX_SPARKS * 3);
    const sparkColours = new Float32Array(MAX_SPARKS * 3);
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    sparkGeometry.setAttribute('color', new THREE.BufferAttribute(sparkColours, 3));
    sparkGeometry.setDrawRange(0, 0);
    this.sparks = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({
      size: 0.55,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    }));
    this.sparks.name = 'vfx:sparks';
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 8;
    scene.add(this.sparks);
    this.sparkState = Array.from({ length: MAX_SPARKS }, () => ({ life: 0 }));
    this.sparkCursor = 0;

    const debrisGeom = new THREE.BoxGeometry(1, 1, 1);
    // Unlit toy debris: readable at board zoom without depending on the light rig.
    const debrisMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 1,
    });
    this.debris = new THREE.InstancedMesh(debrisGeom, debrisMat, MAX_DEBRIS);
    this.debris.name = 'vfx:debris';
    this.debris.count = 0;
    this.debris.frustumCulled = false;
    this.debris.castShadow = false;
    this.debris.receiveShadow = false;
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.debris);
    this.debrisState = Array.from({ length: MAX_DEBRIS }, () => ({ life: 0 }));
    this.debrisCursor = 0;
    this._hideDebrisSlot(0);
  }

  _takeRing() {
    if (this.activeRings.length >= MAX_RINGS) {
      const oldest = this.activeRings.shift();
      oldest.mesh.visible = false;
      return oldest.mesh;
    }
    return this.ringPool[this.activeRings.length];
  }

  /** Expanding ground ring — the "this happened here" cue. */
  ring(position, { colour = '#d8a24a', radius = 12, duration = 0.85 } = {}) {
    const mesh = this._takeRing();
    mesh.material.color.set(colour);
    mesh.material.opacity = 0.85;
    mesh.position.set(position.x, 0.35, position.z);
    mesh.scale.setScalar(1);
    mesh.visible = true;
    if (this.reducedMotion) {
      // Reduced motion still marks the parcel — it simply does not travel.
      mesh.scale.setScalar(radius * 0.5);
      this.activeRings.push({ mesh, t: 0, duration: 0.5, radius: radius * 0.5, still: true });
      return;
    }
    this.activeRings.push({ mesh, t: 0, duration, radius, still: false });
  }

  /**
   * Golden translucent footprint over a world-space rect — the district's block shade.
   * One quad, timed out by the existing update tick; no allocation, no extra loop.
   */
  shade(rect, { colour = '#e9b45a', duration = 2.6, opacity = 0.22 } = {}) {
    if (!rect || !Number.isFinite(rect.minX)) return;
    const w = Math.max(2, rect.maxX - rect.minX);
    const d = Math.max(2, rect.maxZ - rect.minZ);
    this.shadeMesh.material.color.set(colour);
    this.shadeMesh.material.opacity = opacity;
    this.shadeMesh.scale.set(w, d, 1);
    this.shadeMesh.position.set((rect.minX + rect.maxX) / 2, 0.22, (rect.minZ + rect.maxZ) / 2);
    this.shadeMesh.visible = true;
    this.shadeUntil = this.time + duration;
  }

  /** Rising motes — money moving. Capped and pooled. */
  burst(position, { colour = '#d8a24a', count = 14, spread = 5 } = {}) {
    if (this.reducedMotion) return;
    const c = new THREE.Color(colour);
    const positions = this.motes.geometry.attributes.position;
    const colours = this.motes.geometry.attributes.color;
    for (let i = 0; i < count; i += 1) {
      const index = this.moteCursor;
      this.moteCursor = (this.moteCursor + 1) % MAX_MOTES;
      const state = this.moteState[index];
      state.life = 1;
      state.speed = 6 + (i % 5);
      state.x = position.x + (i / count - 0.5) * spread;
      state.z = position.z + ((i * 7) % 5 - 2) * (spread / 5);
      state.y = 1.5;
      positions.setXYZ(index, state.x, state.y, state.z);
      colours.setXYZ(index, c.r, c.g, c.b);
    }
    positions.needsUpdate = true;
    colours.needsUpdate = true;
    this.motes.geometry.setDrawRange(0, MAX_MOTES);
  }

  /**
   * Full demolition presentation: ground ring + dust plume + sparks + debris boxes.
   * Deterministic from seed + eventId so a replay collapses the same way.
   */
  demolition(position, {
    seed = 'dd',
    eventId = 'demolition',
    colour = '#a9977c',
    radius = 12,
    height = 5.5,
    intensity = 1,
  } = {}) {
    const origin = { x: position.x, y: 0, z: position.z };
    this.ring(origin, { colour: '#d0b07a', radius, duration: 0.95 });
    if (this.reducedMotion) {
      this.burst(origin, { colour, count: 10, spread: 6 });
      return;
    }
    const rng = physStream(seed, eventId);
    const dustCount = Math.round(36 * intensity);
    const sparkCount = Math.round(22 * intensity);
    const debrisCount = Math.round(14 * intensity);
    this._emitDust(origin, rng, {
      count: dustCount,
      colour,
      spread: 5.5 * intensity,
      lift: 4.2,
      height: height * 0.45,
    });
    this._emitSparks(origin, rng, {
      count: sparkCount,
      spread: 4.5,
      speed: 12,
      height: height * 0.55,
    });
    this._emitDebris(origin, rng, {
      count: debrisCount,
      height,
      spread: 6.5,
      speed: 10,
      colour: '#8a7360',
    });
    // Secondary loft so the plume reads volumetric rather than a flat disc.
    this._emitDust(origin, rng, {
      count: Math.round(18 * intensity),
      colour: '#c4b49a',
      spread: 3.2,
      lift: 5.5,
      height: height * 0.7,
    });
  }

  /**
   * Construction / completion plume: lighter dust, a few sparks, small settle chips.
   */
  construction(position, {
    seed = 'dd',
    eventId = 'construction',
    colour = '#c9b896',
    radius = 10,
    height = 3.5,
    intensity = 0.75,
  } = {}) {
    const origin = { x: position.x, y: 0, z: position.z };
    this.ring(origin, { colour: '#e9b45a', radius, duration: 0.8 });
    if (this.reducedMotion) {
      this.burst(origin, { colour, count: 8, spread: 4 });
      return;
    }
    const rng = physStream(seed, eventId);
    this._emitDust(origin, rng, {
      count: Math.round(22 * intensity),
      colour,
      spread: 3.8,
      lift: 3.4,
      height: height * 0.4,
    });
    this._emitSparks(origin, rng, {
      count: Math.round(10 * intensity),
      spread: 2.8,
      speed: 8,
      height: height * 0.35,
    });
    this._emitDebris(origin, rng, {
      count: Math.round(6 * intensity),
      height: height * 0.55,
      spread: 3.5,
      speed: 5.5,
      colour: '#9a8870',
      sizeMin: 0.18,
      sizeMax: 0.42,
    });
  }

  /**
   * Short tip / knock dust for street-furniture mischief. Small, local, readable.
   */
  tip(position, {
    seed = 'dd',
    eventId = 'tip',
    colour = '#b99a72',
    intensity = 0.55,
  } = {}) {
    const origin = {
      x: position.x,
      y: position.y ?? 0,
      z: position.z,
    };
    if (this.reducedMotion) {
      this.ring(origin, { colour: '#c8a477', radius: 2.2, duration: 0.35 });
      return;
    }
    const rng = physStream(seed, eventId);
    this._emitDust(origin, rng, {
      count: Math.round(10 * intensity + 4),
      colour,
      spread: 1.4 + intensity,
      lift: 1.8 + intensity,
      height: 0.8 + intensity * 0.6,
    });
    if (intensity > 0.7) {
      this._emitSparks(origin, rng, {
        count: 4,
        spread: 1.2,
        speed: 5,
        height: 1.1,
      });
    }
  }

  _emitDust(origin, rng, {
    count = 20,
    colour = '#a9977c',
    spread = 4,
    lift = 3.2,
    height = 1.2,
  } = {}) {
    _colour.set(colour);
    const positions = this.dust.geometry.attributes.position;
    const colours = this.dust.geometry.attributes.color;
    const sizes = this.dust.geometry.attributes.size;
    for (let i = 0; i < count; i += 1) {
      const index = this.dustCursor;
      this.dustCursor = (this.dustCursor + 1) % MAX_DUST;
      const body = spawnDust(rng, origin, { spread, lift, height });
      const state = this.dustState[index];
      Object.assign(state, body);
      positions.setXYZ(index, state.x, state.y, state.z);
      // Warm dusty variance without breaking determinism (index-based, not random).
      const shade = 0.85 + (i % 5) * 0.03;
      colours.setXYZ(index, _colour.r * shade, _colour.g * shade, _colour.b * shade);
      sizes.setX(index, state.size);
    }
    positions.needsUpdate = true;
    colours.needsUpdate = true;
    sizes.needsUpdate = true;
    this.dust.geometry.setDrawRange(0, MAX_DUST);
  }

  _emitSparks(origin, rng, {
    count = 12,
    spread = 3.5,
    speed = 11,
    height = 2,
  } = {}) {
    const positions = this.sparks.geometry.attributes.position;
    const colours = this.sparks.geometry.attributes.color;
    for (let i = 0; i < count; i += 1) {
      const index = this.sparkCursor;
      this.sparkCursor = (this.sparkCursor + 1) % MAX_SPARKS;
      const body = spawnSpark(rng, origin, { spread, speed, height });
      const state = this.sparkState[index];
      Object.assign(state, body);
      positions.setXYZ(index, state.x, state.y, state.z);
      // Hot → cool along the spawn index so the burst reads as a spark shower.
      const hot = 1 - (i % 4) * 0.08;
      colours.setXYZ(index, 1.0 * hot, 0.72 * hot, 0.28 * hot);
    }
    positions.needsUpdate = true;
    colours.needsUpdate = true;
    this.sparks.geometry.setDrawRange(0, MAX_SPARKS);
  }

  _emitDebris(origin, rng, {
    count = 12,
    height = 5,
    spread = 6,
    speed = 9,
    colour = '#8a7360',
    sizeMin = 0.28,
    sizeMax = 0.85,
  } = {}) {
    _colour.set(colour);
    for (let i = 0; i < count; i += 1) {
      const index = this.debrisCursor;
      this.debrisCursor = (this.debrisCursor + 1) % MAX_DEBRIS;
      const body = spawnDebris(rng, origin, {
        height, spread, speed, sizeMin, sizeMax,
      });
      const state = this.debrisState[index];
      Object.assign(state, body);
      state.cr = _colour.r * (0.88 + (i % 4) * 0.04);
      state.cg = _colour.g * (0.88 + (i % 3) * 0.04);
      state.cb = _colour.b * (0.88 + (i % 5) * 0.03);
      this._writeDebrisMatrix(index, state);
      if (this.debris.setColorAt) {
        this.debris.setColorAt(index, _colour.setRGB(state.cr, state.cg, state.cb));
      }
    }
    this.debris.count = MAX_DEBRIS;
    this.debris.instanceMatrix.needsUpdate = true;
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
  }

  _writeDebrisMatrix(index, state) {
    if (state.life <= 0) {
      this._hideDebrisSlot(index);
      return;
    }
    _position.set(state.x, state.y, state.z);
    _euler.set(state.rx, state.ry, state.rz);
    _quaternion.setFromEuler(_euler);
    const fade = state.settled ? Math.max(0.15, state.life) : 1;
    _scale.set(state.sx * fade, state.sy * fade, state.sz * fade);
    _matrix.compose(_position, _quaternion, _scale);
    this.debris.setMatrixAt(index, _matrix);
  }

  _hideDebrisSlot(index) {
    _matrix.makeScale(0, 0, 0);
    this.debris.setMatrixAt(index, _matrix);
  }

  update(dt) {
    if (this.shadeMesh?.visible && this.time >= this.shadeUntil) this.shadeMesh.visible = false;
    this.time += dt;

    for (let i = this.activeRings.length - 1; i >= 0; i -= 1) {
      const ring = this.activeRings[i];
      ring.t += dt;
      const k = Math.min(1, ring.t / ring.duration);
      if (!ring.still) ring.mesh.scale.setScalar(1 + k * ring.radius);
      ring.mesh.material.opacity = 0.85 * (1 - k);
      if (k >= 1) {
        ring.mesh.visible = false;
        this.activeRings.splice(i, 1);
      }
    }

    const positions = this.motes.geometry.attributes.position;
    let alive = false;
    for (let i = 0; i < MAX_MOTES; i += 1) {
      const state = this.moteState[i];
      if (state.life <= 0) continue;
      alive = true;
      state.life -= dt * 0.9;
      state.y += state.speed * dt;
      state.speed *= 0.965;
      positions.setXYZ(i, state.x, state.y, state.z);
      if (state.life <= 0) positions.setXYZ(i, 0, -9999, 0);
    }
    positions.needsUpdate = true;
    this.motes.material.opacity = alive ? 0.9 : 0;

    this._updateDust(dt);
    this._updateSparks(dt);
    this._updateDebris(dt);
  }

  _updateDust(dt) {
    const positions = this.dust.geometry.attributes.position;
    const sizes = this.dust.geometry.attributes.size;
    let alive = false;
    let maxLife = 0;
    for (let i = 0; i < MAX_DUST; i += 1) {
      const state = this.dustState[i];
      if (state.life <= 0) {
        positions.setXYZ(i, 0, -9999, 0);
        continue;
      }
      alive = true;
      stepDust(state, dt);
      if (state.life <= 0) {
        positions.setXYZ(i, 0, -9999, 0);
        continue;
      }
      maxLife = Math.max(maxLife, state.life);
      positions.setXYZ(i, state.x, state.y, state.z);
      sizes.setX(i, state.size * Math.max(0.2, state.life));
    }
    positions.needsUpdate = true;
    sizes.needsUpdate = true;
    this.dust.material.opacity = alive ? 0.55 + maxLife * 0.25 : 0;
  }

  _updateSparks(dt) {
    const positions = this.sparks.geometry.attributes.position;
    let alive = false;
    for (let i = 0; i < MAX_SPARKS; i += 1) {
      const state = this.sparkState[i];
      if (state.life <= 0) {
        positions.setXYZ(i, 0, -9999, 0);
        continue;
      }
      alive = true;
      stepSpark(state, dt);
      if (state.life <= 0) {
        positions.setXYZ(i, 0, -9999, 0);
        continue;
      }
      positions.setXYZ(i, state.x, state.y, state.z);
    }
    positions.needsUpdate = true;
    this.sparks.material.opacity = alive ? 1 : 0;
  }

  _updateDebris(dt) {
    let alive = false;
    for (let i = 0; i < MAX_DEBRIS; i += 1) {
      const state = this.debrisState[i];
      if (state.life <= 0) continue;
      alive = true;
      stepDebris(state, dt);
      if (state.life <= 0 || (state.settled && state.settleAge > 2.8)) {
        state.life = 0;
        this._hideDebrisSlot(i);
        continue;
      }
      this._writeDebrisMatrix(i, state);
    }
    if (alive) {
      this.debris.instanceMatrix.needsUpdate = true;
      this.debris.material.opacity = 1;
    } else {
      this.debris.material.opacity = 0;
    }
  }

  /** Idempotent: reset, death and pause must not be able to leak an effect. */
  clear() {
    for (const ring of this.activeRings) ring.mesh.visible = false;
    this.activeRings.length = 0;
    const positions = this.motes.geometry.attributes.position;
    for (let i = 0; i < MAX_MOTES; i += 1) {
      this.moteState[i].life = 0;
      positions.setXYZ(i, 0, -9999, 0);
    }
    positions.needsUpdate = true;

    const dustPos = this.dust.geometry.attributes.position;
    for (let i = 0; i < MAX_DUST; i += 1) {
      this.dustState[i].life = 0;
      dustPos.setXYZ(i, 0, -9999, 0);
    }
    dustPos.needsUpdate = true;
    this.dust.material.opacity = 0;

    const sparkPos = this.sparks.geometry.attributes.position;
    for (let i = 0; i < MAX_SPARKS; i += 1) {
      this.sparkState[i].life = 0;
      sparkPos.setXYZ(i, 0, -9999, 0);
    }
    sparkPos.needsUpdate = true;
    this.sparks.material.opacity = 0;

    for (let i = 0; i < MAX_DEBRIS; i += 1) {
      this.debrisState[i].life = 0;
      this._hideDebrisSlot(i);
    }
    this.debris.instanceMatrix.needsUpdate = true;
    this.debris.material.opacity = 0;
  }

  dispose() {
    this.clear();
    for (const mesh of this.ringPool) {
      this.scene.remove(mesh);
      mesh.material.dispose();
    }
    this.ringPool[0]?.geometry.dispose();
    this.scene.remove(this.motes);
    this.motes.geometry.dispose();
    this.motes.material.dispose();

    this.scene.remove(this.dust);
    this.dust.geometry.dispose();
    this.dust.material.dispose();
    this.dustTexture?.dispose?.();

    this.scene.remove(this.sparks);
    this.sparks.geometry.dispose();
    this.sparks.material.dispose();

    this.scene.remove(this.debris);
    this.debris.geometry.dispose();
    this.debris.material.dispose();
  }
}

// Re-export pool caps for QA / budget probes.
export const VFX_CAPS = Object.freeze({
  MAX_RINGS,
  MAX_MOTES,
  MAX_DUST,
  MAX_SPARKS,
  MAX_DEBRIS,
  GROUND_Y,
});
