// W19: a metric material band on the actual wall/hull, before lighting/post.
import * as THREE from 'three';
import { WATER_Y, WATER_FLOOR_Y } from './contract.js';
import { PAINTED } from '../outer-ocean.js';
import { SHORE } from '../shore.js';
import { SURF } from './surf.js';

export function installWaterlineBands(root, enabled, oceanUniforms = null) {
  const entries = [];
  const clones = new Map();
  const protectedWalls = [];
  const box = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry || Array.isArray(mesh.material)
      || !mesh.material?.isMeshStandardMaterial
      || !/hull|boot|quay|wharf|seawall|battered-wall|tide-band|port-cope:coping-stone/i.test(mesh.name)
      || /water|foam|wake|reflection|aircraft|plane/i.test(mesh.name)) return;
    box.setFromObject(mesh);
    if (box.min.y > WATER_Y + 0.6 || box.max.y < WATER_Y - PAINTED.portDrop - 0.1) return;
    const isHull = /hull|boot/i.test(mesh.name);
    const original = mesh.material;
    const cloneKey = `${original.uuid}:${isHull}`;
    let material = clones.get(cloneKey);
    if (!material) {
      material = original.clone();
      const previous = original.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        previous.call(original, shader, renderer);
        shader.uniforms.uW19Wet = enabled;
        const origins = ['uBayOrigin', 'uBayNormal', 'uPortOrigin', 'uPortNormal', 'uInlandOrigin', 'uInlandNormal'];
        if (oceanUniforms) for (const name of origins) shader.uniforms[name] = oceanUniforms[name];
        shader.vertexShader = 'varying float vW19Height;\n'
          + (oceanUniforms ? origins.map((name) => `uniform vec3 ${name};`).join('\n') + '\n' : '')
          + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
          vec4 w19Position = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            w19Position = instanceMatrix * w19Position;
          #endif
          vec3 w19World = (modelMatrix * w19Position).xyz;
          float w19Surface = ${WATER_Y.toFixed(3)};
          ${oceanUniforms ? `
          float w19Port = dot(w19World - uPortOrigin, uPortNormal);
          float w19Bay = dot(w19World - uBayOrigin, uBayNormal);
          float w19Inland = dot(w19World - uInlandOrigin, uInlandNormal);
          float w19Quay = (1.0 - smoothstep(0.0, ${PAINTED.portFeather.toFixed(1)}, abs(w19Port - ${(SHORE.wallDeep * 0.35).toFixed(2)})))
            * smoothstep(0.40, 0.85, smoothstep(-10.0, 10.0, w19Port - w19Bay));
          float w19Wrap = smoothstep(-8.0, 6.0, w19Inland)
            * (1.0 - smoothstep(8.0, ${PAINTED.airportFeatherIn.toFixed(1)}, w19Inland))
            * smoothstep(-10.0, 4.0, w19Port)
            * (1.0 - smoothstep(6.0, ${PAINTED.airportFeatherPort.toFixed(1)}, w19Port));
          // taste-r1 (W14-B): the band keys to the sheet that is DRAWN. In the
          // basin the drawn sheet is SURF.basinSheetY (the vertex clip keeps it
          // there); the old key sat portDrop (0.30 m) lower, so a band of
          // -0.18 to +0.46 m lay almost entirely under water and no hull wore one.
          w19Surface = mix(w19Surface, ${SURF.basinSheetY.toFixed(3)}, clamp(max(w19Quay, w19Wrap), 0.0, 1.0));
          ` : ''}
          vW19Height = w19World.y - w19Surface;
          #include <project_vertex>`);
        shader.fragmentShader = 'varying float vW19Height;\nuniform float uW19Wet;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
          #include <color_fragment>
          float w19Wet = (1.0 - smoothstep(${isHull ? "0.46, 0.60" : "0.46, 0.66"}, vW19Height))
            * smoothstep(-0.18, -0.04, vW19Height);
          diffuseColor.rgb *= 1.0 - 0.88 * w19Wet * uW19Wet;`);
      };
      material.customProgramCacheKey = () => `${original.customProgramCacheKey()}|w14b-drawn-sheet-waterline-${isHull ? "0.60m" : "0.66m"}`;
      clones.set(cloneKey, material);
    }
    mesh.material = material;
    entries.push([mesh, original, material]);
  });
  // Scene batching fingerprints omit material hooks, and instance-colour
  // clones discard onBeforeCompile. Own the static wall instances here so
  // their local waterline shader survives that later batching pass.
  if (oceanUniforms) {
    const buckets = new Map();
    for (const [mesh, , material] of entries) {
      if (mesh.isInstancedMesh || !/port-cope:(coping-stone|tide-band|continuous-battered-wall)/.test(mesh.name)) continue;
      let visible = mesh.visible;
      for (let ancestor = mesh.parent; ancestor && ancestor !== root; ancestor = ancestor.parent) visible &&= ancestor.visible;
      if (!visible) continue;
      const geometry = mesh.geometry;
      const shape = geometry.type === 'BoxGeometry' ? JSON.stringify(geometry.parameters) : geometry.uuid;
      const key = `${shape}|${material.uuid}|${mesh.layers.mask}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(mesh);
    }
    const inverseRoot = root.matrixWorld.clone().invert();
    const instance = new THREE.Matrix4();
    for (const meshes of buckets.values()) {
      const source = meshes[0];
      const draw = new THREE.InstancedMesh(source.geometry, source.material, meshes.length);
      draw.name = `nature:water:wet-wall:${protectedWalls.length}`;
      draw.castShadow = source.castShadow; draw.receiveShadow = source.receiveShadow;
      draw.renderOrder = source.renderOrder; draw.layers.mask = source.layers.mask;
      const visibility = meshes.map((mesh, index) => {
        draw.setMatrixAt(index, instance.multiplyMatrices(inverseRoot, mesh.matrixWorld));
        const visible = mesh.visible; mesh.visible = false; return visible;
      });
      draw.instanceMatrix.needsUpdate = true;
      draw.computeBoundingSphere(); root.add(draw);
      protectedWalls.push({ draw, meshes, visibility });
    }
  }
  return { count: entries.length, wallDraws: protectedWalls.length, dispose() {
    for (const { draw, meshes, visibility } of protectedWalls) {
      draw.removeFromParent(); draw.dispose();
      meshes.forEach((mesh, index) => { mesh.visible = visibility[index]; });
    }
    for (const [mesh, original, material] of entries) if (mesh.material === material) mesh.material = original;
    for (const material of clones.values()) material.dispose();
  } };
}
