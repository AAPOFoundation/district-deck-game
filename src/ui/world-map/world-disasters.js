// Voxel-register disaster FX. Driven only by world.disasters / disaster log rows.

import * as THREE from 'three';
import {
  DISASTER_ANIMATION_MS,
  DISASTER_CONCURRENCY_CAP,
  liveDisasters,
} from '../../core/world/disasters.js';
import { GLOBE_RADIUS, latLonToVector } from './world-globe.js';

const yUp = new THREE.Vector3(0, 1, 0);
const dummy = new THREE.Object3D();

function warningMarker(THREERef, materials) {
  const group = new THREE.Group();
  group.name = 'disaster warning';
  const mark = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    materials?.hold ?? new THREE.MeshStandardMaterial({
      color: 0x8c2418, emissive: 0x310600, emissiveIntensity: 0.35, roughness: 0.82,
    }),
  );
  mark.scale.set(0.034, 0.05, 0.034);
  mark.position.y = 0.03;
  group.add(mark);
  return group;
}

export class WorldDisasterLayer {
  constructor(globe, { land = null, reducedMotion = false, materials = null } = {}) {
    this.globe = globe;
    this.land = land;
    this.reducedMotion = Boolean(reducedMotion);
    this.materials = materials;
    this.root = new THREE.Group();
    this.root.name = 'world-disasters';
    globe?.add(this.root);
    this.live = [];
    this.landBase = null;
    if (land?.instanceMatrix) {
      this.landBase = new Float32Array(land.instanceMatrix.array);
    }
    this.unitBox = new THREE.BoxGeometry(1, 1, 1);
    this.surgeMat = new THREE.MeshStandardMaterial({
      color: 0x6ec4d4, roughness: 0.28, metalness: 0.18,
      transparent: true, opacity: 0.55, depthWrite: false,
      emissive: 0x2a6a7a, emissiveIntensity: 0.55,
    });
    this.ashMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a28, roughness: 0.92, transparent: true, opacity: 0.7, depthWrite: false,
    });
    this.dustMat = new THREE.MeshStandardMaterial({
      color: 0xcbb892, roughness: 0.88, transparent: true, opacity: 0.55, depthWrite: false,
    });
    this.flashMat = new THREE.MeshBasicMaterial({
      color: 0xf4e6c4, transparent: true, opacity: 0.85, depthWrite: false,
    });
    this.floodMat = new THREE.MeshStandardMaterial({
      color: 0x2f6e86, roughness: 0.4, transparent: true, opacity: 0.38, depthWrite: false,
    });
    this.scarMat = new THREE.MeshStandardMaterial({
      color: 0x4a2218, roughness: 0.9, transparent: true, opacity: 0.5, depthWrite: false,
    });
  }

  setReducedMotion(on) {
    this.reducedMotion = Boolean(on);
  }

  sync(world, nowMs) {
    const live = liveDisasters(world);
    const seen = new Set(this.live.map((item) => item.id));
    for (const row of live) {
      if (row.type === 'fire') continue;
      if (seen.has(row.id)) continue;
      if (this.live.length >= DISASTER_CONCURRENCY_CAP) break;
      this.live.push(this._spawn(row, nowMs));
    }
    const liveIds = new Set(live.map((row) => row.id));
    this.live = this.live.filter((item) => {
      const windowMs = DISASTER_ANIMATION_MS[item.type] ?? 3000;
      const aged = nowMs - item.bornMs;
      const keep = liveIds.has(item.id) && aged < windowMs + (item.type === 'asteroid' ? 8000 : 0);
      if (!keep) this._retire(item);
      return keep;
    });
  }

  _spawn(row, nowMs) {
    const group = new THREE.Group();
    group.name = `${row.type} fx`;
    const point = latLonToVector(row.lat, row.lon, GLOBE_RADIUS + 0.02);
    group.position.set(point.x, point.y, point.z);
    group.quaternion.setFromUnitVectors(yUp, group.position.clone().normalize());
    const item = {
      id: row.id,
      type: row.type,
      deskId: row.deskId,
      bornMs: nowMs,
      lat: row.lat,
      lon: row.lon,
      group,
      parts: [],
    };
    if (this.reducedMotion) {
      group.add(warningMarker(THREE, this.materials));
    } else if (row.type === 'tsunami') {
      const ring = new THREE.Mesh(this.unitBox, this.surgeMat);
      ring.scale.set(0.12, 0.01, 0.12);
      ring.position.y = 0.006;
      group.add(ring);
      item.parts.push(ring);
    } else if (row.type === 'earthquake') {
      for (let i = 0; i < 10; i += 1) {
        const mote = new THREE.Mesh(this.unitBox, this.dustMat);
        mote.scale.setScalar(0.008);
        mote.position.set((i % 3) * 0.012 - 0.012, 0.01, Math.floor(i / 3) * 0.01 - 0.01);
        group.add(mote);
        item.parts.push(mote);
      }
    } else if (row.type === 'volcano') {
      for (let i = 0; i < 8; i += 1) {
        const voxel = new THREE.Mesh(this.unitBox, this.ashMat);
        voxel.scale.set(0.012, 0.012, 0.012);
        voxel.position.set(0.004 * i, 0.02 + i * 0.016, -0.006 * i);
        group.add(voxel);
        item.parts.push(voxel);
      }
    } else if (row.type === 'asteroid') {
      const streak = new THREE.Mesh(this.unitBox, this.flashMat);
      streak.scale.set(0.01, 0.08, 0.01);
      streak.position.set(0.04, 0.12, 0);
      group.add(streak);
      const flash = new THREE.Mesh(this.unitBox, this.flashMat);
      flash.scale.set(0.05, 0.05, 0.05);
      group.add(flash);
      const scar = new THREE.Mesh(this.unitBox, this.scarMat);
      scar.scale.set(0.05, 0.006, 0.05);
      scar.position.y = 0.002;
      group.add(scar);
      item.parts.push(streak, flash, scar);
    } else if (row.type === 'flood') {
      const tint = new THREE.Mesh(this.unitBox, this.floodMat);
      tint.scale.set(0.09, 0.01, 0.09);
      tint.position.y = 0.004;
      group.add(tint);
      item.parts.push(tint);
    }
    this.root.add(group);
    return item;
  }

  _retire(item) {
    this.root.remove(item.group);
  }

  tick(nowMs, world) {
    this.sync(world, nowMs);
    if (this.land && this.landBase) {
      this.land.instanceMatrix.array.set(this.landBase);
    }
    for (const item of this.live) {
      const windowMs = DISASTER_ANIMATION_MS[item.type] ?? 3000;
      const u = Math.max(0, Math.min(1, (nowMs - item.bornMs) / windowMs));
      if (this.reducedMotion) continue;
      if (item.type === 'tsunami' && item.parts[0]) {
        const s = 0.12 + u * 0.38;
        item.parts[0].scale.set(s, 0.01, s);
        item.parts[0].material.opacity = 0.55 * (1 - u);
      } else if (item.type === 'earthquake') {
        this._shakeLand(item, u);
        item.parts.forEach((mote, i) => {
          mote.position.y = 0.01 + u * 0.05 + ((i % 3) * 0.004);
          mote.material.opacity = 0.55 * (1 - u);
        });
      } else if (item.type === 'volcano') {
        item.parts.forEach((voxel, i) => {
          voxel.position.x = 0.004 * i + u * 0.04;
          voxel.position.y = 0.02 + i * 0.016 + u * 0.03;
          voxel.material.opacity = 0.7 * (1 - u * 0.6);
        });
      } else if (item.type === 'asteroid') {
        const [streak, flash, scar] = item.parts;
        if (streak) {
          streak.position.set(0.08 * (1 - u), 0.16 * (1 - u), 0);
          streak.visible = u < 0.35;
        }
        if (flash) flash.material.opacity = u < 0.4 ? 0.85 * (1 - u / 0.4) : 0;
        if (scar) scar.material.opacity = 0.5 * (1 - u);
      } else if (item.type === 'flood' && item.parts[0]) {
        item.parts[0].scale.set(0.09 + u * 0.04, 0.01 + u * 0.008, 0.09 + u * 0.04);
        item.parts[0].material.opacity = 0.38 * (1 - u * 0.5);
      }
    }
    if (this.land) {
      this.land.instanceMatrix.needsUpdate = true;
    }
  }

  _shakeLand(item, u) {
    if (!this.land || !this.landBase) return;
    const array = this.land.instanceMatrix.array;
    const amp = (1 - u) * 0.004;
    const n = this.land.count;
    const step = Math.max(1, Math.floor(n / 1800));
    const origin = latLonToVector(item.lat, item.lon, GLOBE_RADIUS);
    for (let i = 0; i < n; i += step) {
      dummy.matrix.fromArray(this.landBase, i * 16);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
      const dx = dummy.position.x - origin.x;
      const dy = dummy.position.y - origin.y;
      const dz = dummy.position.z - origin.z;
      if ((dx * dx + dy * dy + dz * dz) > 0.09) continue;
      dummy.position.x += Math.sin((i + u * 40) * 0.7) * amp;
      dummy.position.z += Math.cos((i + u * 40) * 0.7) * amp;
      dummy.updateMatrix();
      dummy.matrix.toArray(array, i * 16);
    }
  }

  dispose() {
    if (this.land && this.landBase) {
      this.land.instanceMatrix.array.set(this.landBase);
      this.land.instanceMatrix.needsUpdate = true;
    }
    this.root.clear();
    this.unitBox.dispose();
    for (const mat of [
      this.surgeMat, this.ashMat, this.dustMat, this.flashMat, this.floodMat, this.scarMat,
    ]) mat.dispose();
  }
}
