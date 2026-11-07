// District Deck V4.8 P3 — visual-only globe curvature at far zoom.
// Cities-Skylines-style vertex bend: y -= curvature * d² from the camera target.
// One shared uniform pair per frame. No material clones, no per-mesh allocations.

import * as THREE from 'three';

/** Ramp and magnitude. Tests pin these. */
export const WORLD_CURVE = Object.freeze({
  /** Board-fit distance = max(extent) * this. Matches hero `_frameHeroWorld`. */
  FIT_DISTANCE_MUL: 1.18,
  /** Curvature stays 0 until the rig is this multiple of the fit distance. */
  RAMP_START_MUL: 1.3,
  /** Camera `maxDistance` uses the same pair as IsoCameraRig. */
  MAX_DISTANCE_MUL: 1.9,
  MAX_DISTANCE_FLOOR: 320,
  /**
   * Metres of drop per metre² of horizontal offset from the look-at.
   * Capped so an uncompensated corner tap stays near one parcel (16 m); pick
   * rays are still warped through the paraboloid so far-zoom parcels land.
   */
  CURVATURE_MAX: 2.8e-4,
});

/** Shared GPU state. Every compiled program points at these two objects. */
export const WORLD_CURVE_STATE = {
  uWorldCurve: { value: 0 },
  uWorldCurveTarget: { value: new THREE.Vector2() },
};

export const WORLD_CURVE_GLSL = /* glsl */ `
#ifndef DD_WORLD_CURVE
#define DD_WORLD_CURVE
uniform float uWorldCurve;
uniform vec2 uWorldCurveTarget;
vec3 ddBendWorld(vec3 world) {
  vec2 ddOff = world.xz - uWorldCurveTarget;
  world.y -= uWorldCurve * dot(ddOff, ddOff);
  return world;
}
#endif
`;

const PROJECT_VERTEX = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
vec4 ddWorld = modelMatrix * mvPosition;
ddWorld.xyz = ddBendWorld(ddWorld.xyz);
mvPosition = viewMatrix * ddWorld;
gl_Position = projectionMatrix * mvPosition;
`;

const WORLDPOS_VERTEX = /* glsl */ `
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
	worldPosition.xyz = ddBendWorld(worldPosition.xyz);
#endif
`;

let _installed = false;

export function fitDistanceForExtent(extent) {
  const board = Math.max(Number(extent?.x) || 272, Number(extent?.z) || 272);
  return board * WORLD_CURVE.FIT_DISTANCE_MUL;
}

export function maxDistanceForExtent(extent) {
  const board = Math.max(Number(extent?.x) || 272, Number(extent?.z) || 272);
  return Math.max(WORLD_CURVE.MAX_DISTANCE_FLOOR, board * WORLD_CURVE.MAX_DISTANCE_MUL);
}

function smoothstep01(t) {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

/**
 * Curvature for the current rig distance.
 * 0 at and below the board-fit distance; still 0 until ~1.3× fit;
 * authored max at max zoom-out. Smoothstep — no pop.
 */
export function curvatureForDistance(distance, fitDistance, maxDistance) {
  const d = Number(distance) || 0;
  const fit = Math.max(1e-3, Number(fitDistance) || 1);
  const maxD = Math.max(fit + 1e-3, Number(maxDistance) || fit + 1);
  const start = Math.min(fit * WORLD_CURVE.RAMP_START_MUL, fit + (maxD - fit) * 0.92);
  if (d <= fit || d <= start) return 0;
  if (d >= maxD) return WORLD_CURVE.CURVATURE_MAX;
  const t = (d - start) / Math.max(1e-6, maxD - start);
  return WORLD_CURVE.CURVATURE_MAX * smoothstep01(t);
}

/** CPU twin of the vertex bend. d is horizontal metres from the look-at. */
export function bendWorldPoint(x, y, z, targetX, targetZ, curvature) {
  const dx = x - targetX;
  const dz = z - targetZ;
  const drop = (Number(curvature) || 0) * (dx * dx + dz * dz);
  return { x, y: y - drop, z, drop };
}

export function shareWorldCurveUniforms(uniforms) {
  if (!uniforms) return uniforms;
  uniforms.uWorldCurve = WORLD_CURVE_STATE.uWorldCurve;
  uniforms.uWorldCurveTarget = WORLD_CURVE_STATE.uWorldCurveTarget;
  return uniforms;
}

function patchChunks(three) {
  const chunk = three.ShaderChunk;
  if (!chunk?.common || chunk.project_vertex?.includes('ddBendWorld')) return;
  if (!chunk.common.includes('ddBendWorld')) {
    chunk.common += `\n${WORLD_CURVE_GLSL}\n`;
  }
  chunk.project_vertex = PROJECT_VERTEX;
  chunk.worldpos_vertex = WORLDPOS_VERTEX;
}

function patchUniformsClone(three) {
  const utils = three.UniformsUtils;
  if (!utils?.clone || utils.clone.__ddWorldCurve) return;
  const orig = utils.clone.bind(utils);
  const patched = function cloneWorldCurveUniforms(src) {
    const dst = orig(src);
    if (dst && typeof dst === 'object') shareWorldCurveUniforms(dst);
    return dst;
  };
  patched.__ddWorldCurve = true;
  utils.clone = patched;
}

function injectShaderLib(three) {
  const lib = three.ShaderLib;
  if (!lib) return;
  for (const shader of Object.values(lib)) {
    if (shader?.uniforms) shareWorldCurveUniforms(shader.uniforms);
  }
}

/**
 * Idempotent. Call once before the first compile (SceneView constructor).
 * Patches the shared vertex prologue so every ShaderLib material bends
 * with the same uniforms — including the shadow depth program.
 */
export function installWorldCurve(three = THREE) {
  if (_installed) return;
  _installed = true;
  patchChunks(three);
  injectShaderLib(three);
  patchUniformsClone(three);
}

export function updateWorldCurve(curvature, targetX, targetZ) {
  WORLD_CURVE_STATE.uWorldCurve.value = Math.max(0, Number(curvature) || 0);
  WORLD_CURVE_STATE.uWorldCurveTarget.value.set(
    Number(targetX) || 0,
    Number(targetZ) || 0,
  );
}

export function updateWorldCurveFromRig(rig, extent) {
  const fit = fitDistanceForExtent(extent);
  const maxD = rig?.maxDistance ?? maxDistanceForExtent(extent);
  const distance = rig?.smoothDistance ?? rig?.distance ?? fit;
  const target = rig?.smoothTarget ?? rig?.target;
  const k = curvatureForDistance(distance, fit, maxD);
  updateWorldCurve(k, target?.x ?? 0, target?.z ?? 0);
  return k;
}

/**
 * Intersect ray with the bent ground y = −k ((x−tx)² + (z−tz)²).
 * Returns null when the ray misses the paraboloid in front of the camera.
 */
export function intersectBentGround(ray, target, curvature) {
  const k = Number(curvature) || 0;
  if (k <= 1e-12 || !ray?.origin || !ray?.direction) return null;
  const ox = ray.origin.x - target.x;
  const oz = ray.origin.z - target.z;
  const dx = ray.direction.x;
  const dy = ray.direction.y;
  const dz = ray.direction.z;
  const a = k * (dx * dx + dz * dz);
  const b = k * 2 * (ox * dx + oz * dz) + dy;
  const c = k * (ox * ox + oz * oz) + ray.origin.y;
  let t = -1;
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) < 1e-12) return null;
    t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const root = Math.sqrt(disc);
    const t0 = (-b - root) / (2 * a);
    const t1 = (-b + root) / (2 * a);
    const front = t0 > 1e-4 && t1 > 1e-4 ? Math.min(t0, t1)
      : t0 > 1e-4 ? t0
        : t1 > 1e-4 ? t1
          : -1;
    t = front;
  }
  if (!(t > 1e-4) || !Number.isFinite(t)) return null;
  return {
    x: ray.origin.x + ray.direction.x * t,
    y: ray.origin.y + ray.direction.y * t,
    z: ray.origin.z + ray.direction.z * t,
    t,
  };
}

/**
 * Far-zoom parcel taps aim at the bent visual. Redirect the ray so it
 * strikes the matching unbent ground cell. No-op while curvature is 0.
 */
export function compensatePickRay(raycaster, camera) {
  const k = WORLD_CURVE_STATE.uWorldCurve.value;
  if (!(k > 1e-12) || !raycaster?.ray || !camera?.position) return false;
  const target = WORLD_CURVE_STATE.uWorldCurveTarget.value;
  const hit = intersectBentGround(raycaster.ray, { x: target.x, z: target.y }, k);
  if (!hit) return false;
  const origin = camera.position;
  raycaster.ray.origin.copy(origin);
  raycaster.ray.direction.set(hit.x - origin.x, -origin.y, hit.z - origin.z);
  const len = raycaster.ray.direction.length();
  if (len < 1e-8) return false;
  raycaster.ray.direction.multiplyScalar(1 / len);
  return true;
}

/**
 * Screen-project a parcel centre with and without the bend, then measure how
 * far an unbent y=0 ray through the bent pixel misses the true centre.
 */
export function measurePickDrift({
  parcelX,
  parcelZ,
  targetX,
  targetZ,
  curvature,
  camera,
}) {
  const bent = bendWorldPoint(parcelX, 0, parcelZ, targetX, targetZ, curvature);
  const unbent = new THREE.Vector3(parcelX, 0, parcelZ);
  const bentVec = new THREE.Vector3(bent.x, bent.y, bent.z);
  unbent.project(camera);
  bentVec.project(camera);
  const ndcDx = bentVec.x - unbent.x;
  const ndcDy = bentVec.y - unbent.y;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(bentVec.x, bentVec.y), camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const ok = raycaster.ray.intersectPlane(plane, hit);
  const worldDrift = ok ? Math.hypot(hit.x - parcelX, hit.z - parcelZ) : Infinity;
  return {
    drop: bent.drop,
    ndcDx,
    ndcDy,
    worldDrift,
    hitX: ok ? hit.x : null,
    hitZ: ok ? hit.z : null,
  };
}

export function poseOverviewCamera(extent, {
  polarDeg = 32,
  azimuthDeg = -45,
  aspect = 16 / 9,
  fov = 32,
} = {}) {
  const camera = new THREE.PerspectiveCamera(fov, aspect, 1, 2000);
  const target = new THREE.Vector3(
    (extent?.x ?? 272) * 0.5,
    0,
    (extent?.z ?? 272) * 0.5,
  );
  const distance = maxDistanceForExtent(extent);
  const polar = polarDeg * Math.PI / 180;
  const azimuth = azimuthDeg * Math.PI / 180;
  const horizontal = Math.cos(polar) * distance;
  camera.position.set(
    target.x + Math.sin(azimuth) * horizontal,
    target.y + Math.sin(polar) * distance,
    target.z + Math.cos(azimuth) * horizontal,
  );
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return { camera, target, distance, polar, azimuth };
}
