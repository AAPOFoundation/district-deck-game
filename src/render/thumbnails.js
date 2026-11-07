// District Deck V3.00 — property-card thumbnails.
// The card shows the ACTUAL runtime model, not a drawn illustration: one offscreen
// render per archetype, taken once with the game's own renderer, cached as a data URL.
// One WebGL context, eight renders, zero per-open cost.

import * as THREE from 'three';

const SIZE = 384;

export class ThumbnailMaker {
  constructor(renderer, registry) {
    this.renderer = renderer;
    this.registry = registry;
    this.cache = new Map();

    this.scene = new THREE.Scene();
    this.scene.background = null;

    const hemi = new THREE.HemisphereLight('#dbe8f4', '#2e2a24', 1.5);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight('#ffe8c4', 2.6);
    key.position.set(24, 34, 18);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#7fa6c8', 0.8);
    rim.position.set(-22, 14, -20);
    this.scene.add(rim);

    this.holder = new THREE.Group();
    this.scene.add(this.holder);

    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 400);
    this.target = new THREE.WebGLRenderTarget(SIZE, SIZE, {
      colorSpace: THREE.SRGBColorSpace,
      samples: 4,
    });
    this.pixels = new Uint8Array(SIZE * SIZE * 4);

    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d');
  }

  /** Render one archetype and return a PNG data URL. Cached after the first call. */
  make(archetypeId) {
    if (this.cache.has(archetypeId)) return this.cache.get(archetypeId);
    const model = this.registry.get(archetypeId);
    if (!model) return null;

    for (const child of this.holder.children.slice()) this.holder.remove(child);
    const box = new THREE.Box3();
    for (const part of model.parts) {
      const mesh = new THREE.Mesh(part.geometry, part.material);
      this.holder.add(mesh);
      box.union(new THREE.Box3().setFromBufferAttribute(part.geometry.attributes.position));
    }

    const size = new THREE.Vector3();
    const centre = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(centre);
    const radius = Math.max(size.x, size.y, size.z) * 0.72 + 1;
    const distance = radius / Math.tan((this.camera.fov * Math.PI) / 360) * 1.28;

    this.camera.position.set(
      centre.x + distance * 0.62,
      centre.y + size.y * 0.35 + distance * 0.44,
      centre.z + distance * 0.66,
    );
    this.camera.lookAt(centre.x, centre.y + size.y * 0.12, centre.z);
    this.camera.updateProjectionMatrix();

    const previousTarget = this.renderer.getRenderTarget();
    const previousClear = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(this.target);
    this.renderer.setClearColor(0x121820, 1);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.readRenderTargetPixels(this.target, 0, 0, SIZE, SIZE, this.pixels);
    this.renderer.setRenderTarget(previousTarget);
    this.renderer.setClearAlpha(previousClear);

    // WebGL reads bottom-up; flip into the 2D canvas.
    const image = this.ctx.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y += 1) {
      const src = (SIZE - 1 - y) * SIZE * 4;
      const dst = y * SIZE * 4;
      image.data.set(this.pixels.subarray(src, src + SIZE * 4), dst);
    }
    this.ctx.putImageData(image, 0, 0);
    const url = this.canvas.toDataURL('image/png');
    this.cache.set(archetypeId, url);
    return url;
  }

  makeAll(ids) {
    for (const id of ids) this.make(id);
    return this.cache;
  }

  dispose() {
    this.target.dispose();
    this.cache.clear();
  }
}
