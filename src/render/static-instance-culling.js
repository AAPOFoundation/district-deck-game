import { WORLD_CURVE_STATE } from './world-curve.js';

/**
 * For fixed or explicitly refreshed instance matrices. Three computes bounds in mesh-local
 * space, so moving/rotating parents remain supported without rebuilding bounds.
 * The shared shader bends vertices at far zoom; those undeformed bounds are then
 * unsafe, so retain the previous no-culling behavior until curvature returns to 0.
 * Every later matrix write must recompute both bounds before rendering. Venue
 * clipping and Board's state-driven building writes do this; continuously moving
 * props and foliage must keep their existing no-culling path.
 */
export function enableStaticInstanceCulling(mesh) {
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  let allowed = true;
  Object.defineProperty(mesh, 'frustumCulled', {
    configurable: true,
    enumerable: true,
    get() { return allowed && WORLD_CURVE_STATE.uWorldCurve.value === 0; },
    set(value) { allowed = Boolean(value); },
  });
  return mesh;
}
