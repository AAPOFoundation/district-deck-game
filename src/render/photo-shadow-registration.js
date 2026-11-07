import { ShaderChunk } from 'three';

// Register the material at its first draw, before WebGLRenderer chooses a
// program. This also covers late assets and cloned materials without walking
// the complete city graph on every animation frame.
export function registerPhotoMaterial(material, csm, originals) {
  if (!material || originals.has(material)) return;
  if (!(material.isMeshStandardMaterial || material.isMeshPhongMaterial || material.isMeshLambertMaterial || material.lights)) return;
  const before = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey;
  csm.setupMaterial(material);
  const cascadeCompile = material.onBeforeCompile;
  material.onBeforeCompile = function(shader, renderer) {
    before.call(this, shader, renderer);
    cascadeCompile.call(this, shader, renderer);
    // Water consumes the shadow mask directly. Choose its cascade by view
    // depth instead of multiplying the near and far maps together.
    if (shader.fragmentShader.includes('#include <shadowmask_pars_fragment>')) {
      shader.vertexShader = 'varying float vPhotoShadowDepth;\n' + shader.vertexShader.replace('#include <shadowmap_vertex>', '#include <shadowmap_vertex>\nvPhotoShadowDepth = -(viewMatrix * worldPosition).z;');
      const mask = ShaderChunk.shadowmask_pars_fragment.replace('shadow *= receiveShadow ? getShadow', 'shadow *= (vPhotoShadowDepth >= CSM_cascades[ i ].x * shadowFar && vPhotoShadowDepth < CSM_cascades[ i ].y * shadowFar) && receiveShadow ? getShadow');
      shader.fragmentShader = 'varying float vPhotoShadowDepth;\nuniform vec2 CSM_cascades[CSM_CASCADES];\nuniform float shadowFar;\n' + shader.fragmentShader.replace('#include <shadowmask_pars_fragment>', mask);
    }
  };
  material.customProgramCacheKey = function() { return cacheKey.call(this) + '|photo-csm' + csm.cascades; };
  originals.set(material, { before, cacheKey });
  material.needsUpdate = true;
}

export function classifyPhotoCaster(object, classified, tiny) {
  if (!object?.isMesh || classified.has(object)) return;
  classified.add(object);
  // Aggregate bounds cannot tell us the size of individual batch members.
  if (object.isInstancedMesh || object.isBatchedMesh) return;
  let figureOrBuoy = false;
  for (let parent = object; parent; parent = parent.parent) {
    if (/people|figure|walker|human|crowd|buoy/i.test(parent.name)) figureOrBuoy = true;
  }
  const geometry = object.geometry;
  if (geometry && !geometry.boundingSphere) geometry.computeBoundingSphere();
  const diameter = (geometry?.boundingSphere?.radius ?? Infinity) * 2 * object.matrixWorld.getMaxScaleOnAxis();
  if (figureOrBuoy || diameter < 1.5) tiny.add(object);
}
