// One instanced draw for small solid contacts outside the hull registry.
// R5B: one narrow contact shadow; no expanding decorative rings.
import * as THREE from 'three';
import { installWaterlineBands } from './wet-line.js';
import { WORLD_CURVE_GLSL, shareWorldCurveUniforms } from '../world-curve.js';
import { WATER_Y } from './contract.js';

export function collectPaintedRingContacts(root) {
  const contacts = [];
  const seen = new Set();
  const local = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  const box = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry || !/buoy|pile|piling|dolphin/i.test(obj.name)) return;
    if (/cap|rail|deck|foam|wake|water|reflection/i.test(obj.name)) return;
    for (let p = obj; p; p = p.parent) if (!p.visible) return;
    obj.geometry.computeBoundingBox();
    const count = obj.isInstancedMesh ? obj.count : 1;
    for (let i = 0; i < count; i += 1) {
      if (obj.isInstancedMesh) {
        obj.getMatrixAt(i, local);
        world.multiplyMatrices(obj.matrixWorld, local);
      } else world.copy(obj.matrixWorld);
      box.copy(obj.geometry.boundingBox).applyMatrix4(world);
      if (box.min.y > WATER_Y + 1.2 || box.max.y < WATER_Y - 0.5) continue;
      const x = (box.min.x + box.max.x) * 0.5;
      const z = (box.min.z + box.max.z) * 0.5;
      const radius = Math.max(0.12, Math.min(1.5,
        Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.5));
      const key = `${Math.round(x * 2)}:${Math.round(z * 2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      contacts.push({ x, z, radius, name: obj.name, instance: i });
    }
  });
  return contacts;
}

export class PaintedContactRings {
  constructor(parent, ocean) {
    // R5B: retire cope wash BEFORE static batching copies its child geometry.
    // An onBeforeRender hide only affects the retired stubs, not the batch.
    this.retiredWash = [];
    parent.traverse((node) => {
      // R5C: reef ledges own rock, but their unnamed broad foam rings are
      // water decals. Retire those before batching; the ocean's SDF remains.
      const m = node.material;
      if (node.isMesh && m?.isMeshStandardMaterial && m.transparent
        && m.vertexColors && m.roughness === 0.45 && !m.depthWrite) {
        for (let p = node.parent; p; p = p.parent) {
          if (p.name !== 'fringe:apostles:reef-platform') continue;
          this.retiredWash.push({ object: node, visible: node.visible });
          node.visible = false;
          break;
        }
      }
      if (node.name !== 'fringe:port-cope:wall-wash') return;
      node.traverse((child) => {
        this.retiredWash.push({ object: child, visible: child.visible });
        child.visible = false;
      });
    });
    this.contacts = collectPaintedRingContacts(parent);
    this.wetLines = installWaterlineBands(parent, ocean.uniforms.uW19Wet, ocean.uniforms);
    const geometry = new THREE.PlaneGeometry(2, 2);
    geometry.rotateX(-Math.PI / 2);
    const radii = new Float32Array(this.contacts.length);
    geometry.setAttribute('contactRadius', new THREE.InstancedBufferAttribute(radii, 1));
    const uniforms = {
      uTime: ocean.uniforms.uTime,
      uW19Foam: ocean.uniforms.uW19Foam,
      uW19Ready: ocean.uniforms.uW19Ready,
      uW18WaterAmt: ocean.uniforms.uW18WaterAmt,
      uW18Receipt: ocean.uniforms.uW18Receipt,
    };
    shareWorldCurveUniforms(uniforms);
    const material = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false,
      blending: THREE.NormalBlending,
      vertexShader: `${WORLD_CURVE_GLSL}
        attribute float contactRadius;
        varying vec2 ringLocal;
        varying float ringRadius;
        void main() {
          ringRadius = contactRadius;
          ringLocal = position.xz * (contactRadius + 0.35);
          vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(ddBendWorld(world.xyz), 1.0);
        }`,
      fragmentShader: `
        uniform float uTime;
        uniform sampler2D uW19Foam;
        uniform float uW19Ready;
        uniform float uW18WaterAmt;
        uniform float uW18Receipt;
        varying vec2 ringLocal;
        varying float ringRadius;
        void main() {
          float gap = length(ringLocal) - ringRadius;
          if (gap < 0.0 || gap > 0.35 || uW18Receipt > 0.5) discard;
          float contact = smoothstep(0.0, 0.04, gap)
            * (1.0 - smoothstep(0.08, 0.35, gap));
          gl_FragColor = vec4(vec3(0.015, 0.045, 0.048), contact * 0.24 * uW18WaterAmt);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, this.contacts.length);
    this.mesh.name = 'nature:water:painted-contact-rings';
    this.mesh.renderOrder = 6;
    this.mesh.frustumCulled = false;
    const matrix = new THREE.Matrix4();
    this.contacts.forEach((c, i) => {
      const span = c.radius + 0.35;
      matrix.makeScale(span, 1, span).setPosition(c.x, WATER_Y + 0.055, c.z);
      this.mesh.setMatrixAt(i, matrix);
      radii[i] = c.radius;
    });
    parent.add(this.mesh);
  }
  dispose() {
    for (const entry of this.retiredWash) entry.object.visible = entry.visible;
    this.retiredWash.length = 0;
    this.wetLines.dispose();
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
