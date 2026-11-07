// W19: imagery is the surface authority; normals are a periodic Sobel bake.
import * as THREE from 'three';

export function loadImagenWater(onDone) {
  if (typeof document === 'undefined') { onDone(null); return; }
  const loader = new THREE.TextureLoader();
  const owned = [];
  const load = (name, colour = false) => new Promise((resolve, reject) => {
    loader.load(new URL(`../../../assets/water/w19-${name}.png`, import.meta.url).href,
      (texture) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        owned.push(texture); resolve(texture);
      }, undefined, reject);
  });
  // allSettled ensures a late success cannot leak after an earlier failure.
  Promise.allSettled([load('albedo', true), load('normal'), load('foam')]).then((rows) => {
    if (rows.some((row) => row.status === 'rejected')) {
      owned.forEach((texture) => texture.dispose()); onDone(null); return;
    }
    onDone(rows.map((row) => row.value));
  });
}
