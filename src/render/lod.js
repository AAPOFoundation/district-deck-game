// P19 X6 — distance LOD, textured impostors, topology-preserving simplify.
// Kill switch: ?lod=off / ?lod=on. Default OFF until the visual receipt passes.
// Deterministic: no RNG, no clock.

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y } from './water/contract.js';

export const LOD_NEAR_M = 360;
export const LOD_MID_M = 520;
export const LOD_RATIOS = Object.freeze([1, 0.4, 0.1]);
// Graded poses are 40–300 m views (shroud is 300 m) — keep the real mesh inside that frustum.
export const IMPOSTOR_TREE_M = 420;
export const IMPOSTOR_FIGURE_M = 420;
export const HARDWARE_CULL_M = 420;
export const CANOPY_CLUSTER_M = 420;
export const SHADOW_LAYER = 2;
export const TRIANGLE_BUDGET = 3_500_000;
export const DRAW_CALL_BUDGET = 2500;
export const POST_PASS_BUDGET = 5;
export const MIN_SIMPLIFY_TRIS = 2000;
export const MAX_SIMPLIFY_ERROR_M = 0.05;
export const MAX_SIMPLIFY_TRIS_IN = 20000;
export const LOD_HYSTERESIS_M = 16;
export const IMPOSTOR_MAX_WIDTH_M = 10;
export const IMPOSTOR_MAX_HEIGHT_M = 16;
export const WATER_LOD_MID_M = 800;
export const WATER_LOD_FAR_M = 1200;
/** Default OFF so the game is whole; flip to true only after the ON vs OFF receipt. */
export const LOD_DEFAULT = false;

const HARDWARE_RE = /bolt|cable|lashing|twistlock|hardware|rivet|cleat-bolt|wire-rope|spreader-lock/;
const TREE_LEAF_RE = /nature:foliage:[^:]+:(trunk|canopy|canopy-drop)|:pine:|:conifer:/;
const TREE_SKIP_RE = /pit-lawn|pit-paved|foliage:contact|foliage:debris|foliage:shed/;
const FIGURE_RE = /^(v303:people|v303:auction-crowd)|v303:people|v303:auction-crowd|token-person|toy-person/;
const CANOPY_RE = /awning|umbrella/;
const SKIP_RE = /nature:water:reflect|lod:shadow|succession:|opening:|site-works:|ship|barge|tug|boat|vessel|tanker|hull/;

const _v = new THREE.Vector3();
const _b = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const geoCache = new Map();
const impostorGeoCache = new Map();

let _impostorTreeMat = null;
let _impostorFigureMat = null;
let _shadowMat = null;
let _lodCamKey = '';

export function isLodEnabled(search) {
  const rawSearch = search ?? (typeof location === 'undefined' ? '' : (location.search || ''));
  const q = rawSearch.startsWith('?') ? rawSearch : (rawSearch ? `?${rawSearch}` : '');
  const raw = new URLSearchParams(q).get('lod');
  if (raw === 'off' || raw === '0' || raw === 'false') return false;
  if (raw === 'on' || raw === '1' || raw === 'true') return true;
  return LOD_DEFAULT;
}

function triangleCountOf(geometry) {
  if (!geometry) return 0;
  const idx = geometry.index;
  const pos = geometry.attributes?.position;
  if (idx) return Math.floor(idx.count / 3);
  if (pos) return Math.floor(pos.count / 3);
  return 0;
}

function triArea2(ax, ay, az, bx, by, bz, cx, cy, cz) {
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  return nx * nx + ny * ny + nz * nz;
}

/** Zero-area / collapsed-index triangles plus edges used by > 2 faces. */
export function censusDegenerateTriangles(geometry, minArea = 1e-16) {
  if (!geometry?.attributes?.position) return { tris: 0, degenerate: 0, nonManifold: 0 };
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const n = index ? index.count : pos.count;
  const tris = Math.floor(n / 3);
  let degenerate = 0;
  const edgeUses = new Map();
  const bump = (a, b) => {
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    const k = `${lo},${hi}`;
    edgeUses.set(k, (edgeUses.get(k) || 0) + 1);
  };
  const get = (i) => (index ? index.getX(i) : i);
  for (let t = 0; t < tris; t += 1) {
    const ia = get(t * 3);
    const ib = get(t * 3 + 1);
    const ic = get(t * 3 + 2);
    if (ia === ib || ib === ic || ic === ia) {
      degenerate += 1;
      continue;
    }
    const ax = pos.getX(ia);
    const ay = pos.getY(ia);
    const az = pos.getZ(ia);
    const bx = pos.getX(ib);
    const by = pos.getY(ib);
    const bz = pos.getZ(ib);
    const cx = pos.getX(ic);
    const cy = pos.getY(ic);
    const cz = pos.getZ(ic);
    if (triArea2(ax, ay, az, bx, by, bz, cx, cy, cz) < minArea) degenerate += 1;
    bump(ia, ib);
    bump(ib, ic);
    bump(ic, ia);
  }
  let nonManifold = 0;
  for (const uses of edgeUses.values()) {
    if (uses > 2) nonManifold += 1;
  }
  return { tris, degenerate, nonManifold };
}

function rebuildPrimitive(geometry, ratio) {
  const p = geometry.parameters;
  if (!p || typeof geometry.type !== 'string') return null;
  const type = geometry.type;
  if (type === 'BoxGeometry') {
    return new THREE.BoxGeometry(
      p.width, p.height, p.depth,
      Math.max(1, Math.round((p.widthSegments || 1) * ratio)),
      Math.max(1, Math.round((p.heightSegments || 1) * ratio)),
      Math.max(1, Math.round((p.depthSegments || 1) * ratio)),
    );
  }
  if (type === 'PlaneGeometry') {
    return new THREE.PlaneGeometry(
      p.width, p.height,
      Math.max(1, Math.round((p.widthSegments || 1) * ratio)),
      Math.max(1, Math.round((p.heightSegments || 1) * ratio)),
    );
  }
  if (type === 'CircleGeometry') {
    return new THREE.CircleGeometry(
      p.radius,
      Math.max(3, Math.round((p.segments || 8) * ratio)),
      p.thetaStart ?? 0,
      p.thetaLength ?? Math.PI * 2,
    );
  }
  if (type === 'CylinderGeometry') {
    return new THREE.CylinderGeometry(
      p.radiusTop, p.radiusBottom, p.height,
      Math.max(3, Math.round((p.radialSegments || 8) * ratio)),
      Math.max(1, Math.round((p.heightSegments || 1) * ratio)),
      Boolean(p.openEnded),
      p.thetaStart ?? 0,
      p.thetaLength ?? Math.PI * 2,
    );
  }
  if (type === 'ConeGeometry') {
    return new THREE.ConeGeometry(
      p.radius, p.height,
      Math.max(3, Math.round((p.radialSegments || 8) * ratio)),
      Math.max(1, Math.round((p.heightSegments || 1) * ratio)),
      Boolean(p.openEnded),
      p.thetaStart ?? 0,
      p.thetaLength ?? Math.PI * 2,
    );
  }
  if (type === 'SphereGeometry') {
    return new THREE.SphereGeometry(
      p.radius,
      Math.max(3, Math.round((p.widthSegments || 8) * ratio)),
      Math.max(2, Math.round((p.heightSegments || 6) * ratio)),
      p.phiStart ?? 0,
      p.phiLength ?? Math.PI * 2,
      p.thetaStart ?? 0,
      p.thetaLength ?? Math.PI,
    );
  }
  return null;
}

function addPlaneQuadric(q, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return;
  nx /= len;
  ny /= len;
  nz /= len;
  const d = -(nx * ax + ny * ay + nz * az);
  // 10 unique entries of nn^T for n = [nx, ny, nz, d]
  q[0] += nx * nx;
  q[1] += nx * ny;
  q[2] += nx * nz;
  q[3] += nx * d;
  q[4] += ny * ny;
  q[5] += ny * nz;
  q[6] += ny * d;
  q[7] += nz * nz;
  q[8] += nz * d;
  q[9] += d * d;
}

function quadricAt(q, x, y, z) {
  // v^T Q v with v = [x, y, z, 1]
  return q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x
    + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y
    + q[7] * z * z + 2 * q[8] * z
    + q[9];
}

/**
 * Boundary-preserving edge collapse. Stops when the next collapse would
 * exceed maxError metres (quadric cost at the midpoint). Never stride-drops
 * triangles — that was the shard / torn-hull path.
 */
function quadricSimplify(geometry, ratio, maxError = MAX_SIMPLIFY_ERROR_M) {
  const want = Math.min(1, Math.max(0.05, Number(ratio) || 1));
  let g;
  try {
    g = mergeVertices(geometry.clone(), 1e-4);
  } catch {
    return geometry;
  }
  const pos = g.attributes.position;
  if (!g.index) {
    const n = pos.count;
    const Ctor = n > 65535 ? Uint32Array : Uint16Array;
    const raw = new Ctor(n);
    for (let i = 0; i < n; i += 1) raw[i] = i;
    g.setIndex(new THREE.BufferAttribute(raw, 1));
  }
  const idx = g.index;
  const nV = pos.count;
  const nT = Math.floor(idx.count / 3);
  const target = Math.max(4, Math.floor(nT * want));
  if (nT <= target) return g;
  if (nT > MAX_SIMPLIFY_TRIS_IN) return g;

  const px = new Float64Array(nV);
  const py = new Float64Array(nV);
  const pz = new Float64Array(nV);
  for (let i = 0; i < nV; i += 1) {
    px[i] = pos.getX(i);
    py[i] = pos.getY(i);
    pz[i] = pos.getZ(i);
  }

  const faces = [];
  const edgeUses = new Map();
  const edgeKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  for (let t = 0; t < nT; t += 1) {
    const a = idx.getX(t * 3);
    const b = idx.getX(t * 3 + 1);
    const c = idx.getX(t * 3 + 2);
    if (a === b || b === c || c === a) continue;
    faces.push(a, b, c);
    const e0 = edgeKey(a, b);
    const e1 = edgeKey(b, c);
    const e2 = edgeKey(c, a);
    edgeUses.set(e0, (edgeUses.get(e0) || 0) + 1);
    edgeUses.set(e1, (edgeUses.get(e1) || 0) + 1);
    edgeUses.set(e2, (edgeUses.get(e2) || 0) + 1);
  }
  const boundary = new Uint8Array(nV);
  for (const [k, uses] of edgeUses) {
    if (uses !== 1) continue;
    const comma = k.indexOf(',');
    boundary[Number(k.slice(0, comma))] = 1;
    boundary[Number(k.slice(comma + 1))] = 1;
  }

  const Q = new Float64Array(nV * 10);
  const faceN = faces.length / 3;
  for (let t = 0; t < faceN; t += 1) {
    const a = faces[t * 3];
    const b = faces[t * 3 + 1];
    const c = faces[t * 3 + 2];
    const qa = a * 10;
    const qb = b * 10;
    const qc = c * 10;
    addPlaneQuadric(Q.subarray(qa, qa + 10), px[a], py[a], pz[a], px[b], py[b], pz[b], px[c], py[c], pz[c]);
    addPlaneQuadric(Q.subarray(qb, qb + 10), px[a], py[a], pz[a], px[b], py[b], pz[b], px[c], py[c], pz[c]);
    addPlaneQuadric(Q.subarray(qc, qc + 10), px[a], py[a], pz[a], px[b], py[b], pz[b], px[c], py[c], pz[c]);
  }

  const maxErrSq = maxError * maxError;
  const candidates = [];
  for (const [k, uses] of edgeUses) {
    if (uses < 1) continue;
    const comma = k.indexOf(',');
    const a = Number(k.slice(0, comma));
    const b = Number(k.slice(comma + 1));
    if (boundary[a] || boundary[b]) continue;
    const mx = (px[a] + px[b]) * 0.5;
    const my = (py[a] + py[b]) * 0.5;
    const mz = (pz[a] + pz[b]) * 0.5;
    const qsum = new Float64Array(10);
    for (let i = 0; i < 10; i += 1) qsum[i] = Q[a * 10 + i] + Q[b * 10 + i];
    const cost = quadricAt(qsum, mx, my, mz);
    if (!(cost <= maxErrSq)) continue;
    const dx = px[a] - px[b];
    const dy = py[a] - py[b];
    const dz = pz[a] - pz[b];
    if (dx * dx + dy * dy + dz * dz > maxErrSq * 4) continue;
    candidates.push({ a, b, cost });
  }
  candidates.sort((x, y) => x.cost - y.cost);

  const remap = new Uint32Array(nV);
  for (let i = 0; i < nV; i += 1) remap[i] = i;
  const find = (i) => {
    let x = i;
    while (remap[x] !== x) x = remap[x];
    let y = i;
    while (remap[y] !== y) {
      const p = remap[y];
      remap[y] = x;
      y = p;
    }
    return x;
  };

  const collapsed = new Uint8Array(nV);
  let remaining = faceN;
  for (let ci = 0; ci < candidates.length && remaining > target; ci += 1) {
    const a0 = find(candidates[ci].a);
    const b0 = find(candidates[ci].b);
    if (a0 === b0 || collapsed[a0] || collapsed[b0]) continue;
    if (boundary[a0] || boundary[b0]) continue;
    px[a0] = (px[a0] + px[b0]) * 0.5;
    py[a0] = (py[a0] + py[b0]) * 0.5;
    pz[a0] = (pz[a0] + pz[b0]) * 0.5;
    for (let i = 0; i < 10; i += 1) Q[a0 * 10 + i] += Q[b0 * 10 + i];
    remap[b0] = a0;
    collapsed[b0] = 1;
    remaining -= 1;
  }

  const nextIdx = [];
  for (let t = 0; t < faceN; t += 1) {
    const a = find(faces[t * 3]);
    const b = find(faces[t * 3 + 1]);
    const c = find(faces[t * 3 + 2]);
    if (a === b || b === c || c === a) continue;
    if (triArea2(px[a], py[a], pz[a], px[b], py[b], pz[b], px[c], py[c], pz[c]) < 1e-16) continue;
    nextIdx.push(a, b, c);
  }
  if (nextIdx.length < 3) return g;

  const compact = new Map();
  const outP = [];
  const outI = [];
  for (let i = 0; i < nextIdx.length; i += 1) {
    const src = nextIdx[i];
    let dst = compact.get(src);
    if (dst === undefined) {
      dst = compact.size;
      compact.set(src, dst);
      outP.push(px[src], py[src], pz[src]);
    }
    outI.push(dst);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(outP, 3));
  const Ctor = outP.length / 3 > 65535 ? Uint32Array : Uint16Array;
  out.setIndex(new THREE.BufferAttribute(new Ctor(outI), 1));
  out.computeVertexNormals();
  out.computeBoundingSphere();
  out.computeBoundingBox();
  const check = censusDegenerateTriangles(out);
  if (check.degenerate > 0 || check.nonManifold > 0) return geometry;
  return out;
}

export function simplifyGeometry(geometry, ratio) {
  if (!geometry?.attributes?.position) return geometry;
  const want = Math.min(1, Math.max(0.05, Number(ratio) || 1));
  if (want >= 0.999) return geometry;
  const rebuilt = rebuildPrimitive(geometry, want);
  if (rebuilt) return rebuilt;
  const tris = triangleCountOf(geometry);
  if (tris < MIN_SIMPLIFY_TRIS) return geometry;
  return quadricSimplify(geometry, want, MAX_SIMPLIFY_ERROR_M);
}

function lazyPack(geometry) {
  const tris = triangleCountOf(geometry);
  const canSimplify = Boolean(geometry.parameters) || tris >= MIN_SIMPLIFY_TRIS;
  const pack = { full: geometry, tris, _mid: null, _far: null };
  Object.defineProperty(pack, 'mid', {
    enumerable: true,
    get() {
      if (!canSimplify) return geometry;
      if (!this._mid) this._mid = simplifyGeometry(geometry, LOD_RATIOS[1]);
      return this._mid;
    },
  });
  Object.defineProperty(pack, 'far', {
    enumerable: true,
    get() {
      if (!canSimplify) return geometry;
      if (!this._far) this._far = simplifyGeometry(geometry, LOD_RATIOS[2]);
      return this._far;
    },
  });
  return pack;
}

export function lodGeometriesFor(geometry) {
  if (!geometry) return null;
  const hit = geoCache.get(geometry.uuid);
  if (hit) return hit;
  const pack = lazyPack(geometry);
  geoCache.set(geometry.uuid, pack);
  return pack;
}

function familyFromName(name) {
  if (!name) return 'generic';
  if (HARDWARE_RE.test(name)) return 'hardware';
  if (TREE_SKIP_RE.test(name)) return 'generic';
  if (TREE_LEAF_RE.test(name)) return 'tree';
  if (FIGURE_RE.test(name)) return 'figure';
  if (CANOPY_RE.test(name)) return 'canopy';
  if (name.startsWith('nature:water')) return 'water';
  return 'generic';
}

function familyOf(mesh) {
  if (mesh.userData?.lodFamily) return mesh.userData.lodFamily;
  let node = mesh;
  while (node) {
    const n = typeof node.name === 'string' ? node.name : '';
    const fam = familyFromName(n);
    if (fam !== 'generic') return fam;
    node = node.parent;
  }
  return 'generic';
}

function shouldSkip(mesh) {
  if (!mesh?.isMesh || !mesh.geometry) return true;
  if (mesh.userData?.lodShadow) return true;
  if (mesh.isSkinnedMesh) return true;
  if (mesh.morphTargetInfluences?.length) return true;
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (mat && (mat.isShaderMaterial || mat.isRawShaderMaterial) && !mesh.userData?.waterLodGeos) {
    return true;
  }
  let node = mesh;
  while (node) {
    const n = typeof node.name === 'string' ? node.name : '';
    if (SKIP_RE.test(n)) return true;
    node = node.parent;
  }
  return false;
}

function silhouetteTexture(kind) {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const v = y / (size - 1);
    for (let x = 0; x < size; x += 1) {
      const u = x / (size - 1);
      const i = (y * size + x) * 4;
      let a = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      if (kind === 'tree') {
        let canopy = Infinity;
        for (let k = 0; k < 7; k += 1) {
          const angle = k * 2.399;
          const cx = 0.50 + Math.cos(angle) * (k ? 0.22 : 0);
          const cy = 0.64 + Math.sin(angle) * 0.17;
          const dx = (u - cx) / (0.19 + 0.025 * Math.sin(k));
          const dy = (v - cy) / 0.20;
          canopy = Math.min(canopy, dx * dx + dy * dy);
        }
        const rim = 1 + 0.09 * Math.sin(u * 211) * Math.sin(v * 193);
        const trunk = Math.abs(u - 0.5) < 0.035 && v < 0.57;
        const branch = v > 0.25 && v < 0.58 && Math.abs(Math.abs(u - 0.5) - (v - 0.25) * 0.55) < 0.018;
        if (canopy < rim) {
          a = 255;
          const shade = 0.50 + 0.50 * v + 0.20 * Math.min(1, canopy);
          r = Math.round(88 * shade); g = Math.round(124 * shade); b = Math.round(57 * shade);
        } else if (trunk || branch) {
          a = 255; r = 78; g = 58; b = 38;
        }
      } else {
        const head = ((u - 0.5) / 0.13) ** 2 + ((v - 0.82) / 0.12) ** 2;
        const body = Math.abs(u - 0.5) < 0.16 && v > 0.28 && v < 0.72;
        const legL = Math.abs(u - 0.40) < 0.07 && v < 0.32;
        const legR = Math.abs(u - 0.60) < 0.07 && v < 0.32;
        if (head < 1 || body || legL || legR) {
          a = 255;
          r = 108;
          g = 92;
          b = 74;
        }
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  return tex;
}

function cardGeometry(width, height, yOffset) {
  const key = `${width.toFixed(3)}x${height.toFixed(3)}@${yOffset.toFixed(3)}`;
  const hit = impostorGeoCache.get(key);
  if (hit) return hit;
  const g = new THREE.PlaneGeometry(width, height);
  g.translate(0, yOffset, 0);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  impostorGeoCache.set(key, g);
  return g;
}

export function impostorSizeForGeometry(geometry, family, mesh) {
  if (!geometry) {
    return family === 'figure'
      ? { width: 0.55, height: 1.6, yOffset: 0.8, worldWidth: 0.55, worldHeight: 1.6 }
      : { width: 2, height: 4, yOffset: 2, worldWidth: 2, worldHeight: 4 };
  }
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  let sx = 1;
  let sy = 1;
  let sz = 1;
  if (mesh?.matrixWorld) {
    const e = mesh.matrixWorld.elements;
    sx = Math.hypot(e[0], e[1], e[2]) || 1;
    sy = Math.hypot(e[4], e[5], e[6]) || 1;
    sz = Math.hypot(e[8], e[9], e[10]) || 1;
  }
  const worldW0 = Math.max((bb.max.x - bb.min.x) * sx, (bb.max.z - bb.min.z) * sz, 0.2);
  const worldH0 = Math.max((bb.max.y - bb.min.y) * sy, 0.4);
  const maxW = family === 'figure' ? 1.2 : IMPOSTOR_MAX_WIDTH_M;
  const maxH = family === 'figure' ? 2.4 : IMPOSTOR_MAX_HEIGHT_M;
  const minW = family === 'figure' ? 0.35 : 0.6;
  const minH = family === 'figure' ? 0.9 : 1.2;
  const worldWidth = Math.min(maxW, Math.max(minW, worldW0));
  const worldHeight = Math.min(maxH, Math.max(minH, worldH0));
  const width = worldWidth / Math.max(Math.max(sx, sz), 1e-6);
  const height = worldHeight / Math.max(sy, 1e-6);
  const yOffset = ((bb.min.y + bb.max.y) * 0.5);
  return { width, height, yOffset, worldWidth, worldHeight };
}

function impostorMaterial(family) {
  if (family === 'figure') {
    if (!_impostorFigureMat) {
      _impostorFigureMat = new THREE.MeshStandardMaterial({
        map: silhouetteTexture('figure'),
        color: 0xffffff,
        roughness: 0.86,
        metalness: 0.04,
        side: THREE.DoubleSide,
        alphaTest: 0.45,
        transparent: false,
        depthWrite: true,
        depthTest: true,
      });
    }
    return _impostorFigureMat;
  }
  if (!_impostorTreeMat) {
    _impostorTreeMat = new THREE.MeshStandardMaterial({
      map: silhouetteTexture('tree'),
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.02,
      side: THREE.DoubleSide,
      alphaTest: 0.45,
      transparent: false,
      depthWrite: true,
      depthTest: true,
    });
  }
  return _impostorTreeMat;
}

function shadowMaterial() {
  if (!_shadowMat) {
    _shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  }
  return _shadowMat;
}

function worldRadius(mesh) {
  const g = mesh.geometry;
  if (g && !g.boundingSphere) g.computeBoundingSphere();
  const r = g?.boundingSphere?.radius ?? 0.5;
  const e = mesh.matrixWorld.elements;
  const sx = Math.hypot(e[0], e[1], e[2]);
  const sy = Math.hypot(e[4], e[5], e[6]);
  const sz = Math.hypot(e[8], e[9], e[10]);
  return r * Math.max(sx, sy, sz);
}

function localRadius(mesh) {
  const g = mesh.geometry;
  if (g && !g.boundingSphere) g.computeBoundingSphere();
  return g?.boundingSphere?.radius ?? 0.5;
}

/**
 * Tag a mesh so prepareSceneLod will attach full / 40% / 10% geos.
 * Safe to call at builder time (matrixWorld need not be current).
 */
export function registerLodVersions(mesh, family) {
  if (!mesh?.isMesh) return mesh;
  mesh.userData.lodRegistered = true;
  if (family) mesh.userData.lodFamily = family;
  else if (!mesh.userData.lodFamily) mesh.userData.lodFamily = familyOf(mesh);
  return mesh;
}

/** Walk a built subtree and tag meshes. No look change. */
export function registerSubtreeLod(root, family = 'generic') {
  if (!root) return root;
  root.traverse((o) => {
    if (o.isMesh) registerLodVersions(o, o.userData.lodFamily || family);
  });
  return root;
}

function attachShadowMesh(source, pack, owned) {
  if (!source.castShadow || source.userData.lodShadow) return null;
  if (source.userData.shadowMesh) return source.userData.shadowMesh;
  const far = pack?.far || source.geometry;
  if (far === source.geometry) return null;
  let shadow;
  if (source.isInstancedMesh) {
    shadow = new THREE.InstancedMesh(far, shadowMaterial(), source.count);
    shadow.instanceMatrix = source.instanceMatrix;
    shadow.count = source.count;
  } else {
    shadow = new THREE.Mesh(far, shadowMaterial());
  }
  shadow.name = source.name ? `lod:shadow:${source.name}` : 'lod:shadow';
  shadow.userData.lodShadow = true;
  shadow.userData.shadowSource = source;
  shadow.castShadow = true;
  shadow.receiveShadow = false;
  shadow.frustumCulled = true;
  shadow.matrixAutoUpdate = false;
  shadow.layers.set(SHADOW_LAYER);
  source.add(shadow);
  shadow.position.set(0, 0, 0);
  shadow.quaternion.identity();
  shadow.scale.set(1, 1, 1);
  shadow.updateMatrix();
  source.castShadow = false;
  source.userData.shadowMesh = shadow;
  source.userData.shadowMovedToLod = true;
  owned.push(shadow);
  return shadow;
}

export function installShadowLod(light) {
  if (!light?.shadow?.camera) return;
  light.shadow.camera.layers.enable(0);
  light.shadow.camera.layers.enable(SHADOW_LAYER);
}

export function prepareSceneLod(scene, { quality = 'high' } = {}) {
  if (scene.userData.lodState) return scene.userData.lodState;
  const enabled = isLodEnabled();
  const stats = {
    tagged: 0, simplified: 0, shadows: 0, hardware: 0, trees: 0, figures: 0, canopy: 0, quality, enabled,
  };
  if (!enabled) {
    const state = { records: [], owned: [], stats, enabled: false };
    scene.userData.lodState = state;
    return state;
  }
  scene.updateMatrixWorld(true);
  const records = [];
  const owned = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (shouldSkip(o)) return;
    // City-wide InstancedMesh (foliage canopy/trunk, traffic, crowd) shares one
    // geometry. Swapping it for a card sized to the instance bounding sphere was
    // X1C's giant green/black plane. Per-instance LOD is not this lane.
    if (o.isInstancedMesh) return;
    const ud0 = o.userData || {};
    if (ud0.p17FigureCard || ud0.p17FigureMid || ud0.p17FigurePart || ud0.p17FigureKeep) return;
    const family = familyOf(o);
    const batchStatic = Boolean(o.userData?.batchStatic);
    const pack = o.userData.waterLodGeos
      ? { full: o.userData.waterLodGeos[0], mid: o.userData.waterLodGeos[1], far: o.userData.waterLodGeos[2], tris: triangleCountOf(o.geometry) }
      : (batchStatic
        ? { full: o.geometry, mid: o.geometry, far: o.geometry, tris: triangleCountOf(o.geometry) }
        : lodGeometriesFor(o.geometry));
    const card = (family === 'tree' || family === 'figure')
      ? impostorSizeForGeometry(o.geometry, family, o)
      : null;
    const rec = {
      mesh: o,
      family,
      geos: pack,
      level: 0,
      hidden: false,
      impostor: false,
      instanced: Boolean(o.isInstancedMesh),
      prevMat: null,
      prevQuat: null,
      radius: worldRadius(o),
      localR: localRadius(o),
      card,
    };
    o.userData.lod = rec;
    records.push(rec);
    stats.tagged += 1;
    if (family === 'hardware') stats.hardware += 1;
    if (family === 'tree') stats.trees += 1;
    if (family === 'figure') stats.figures += 1;
    if (family === 'canopy') stats.canopy += 1;
    // Far-geo shadow siblings force-build simplified copies at near cameras
    // and change the shadow silhouette vs LOD-off. Leave the colour mesh as
    // the caster; cheap shadows only kick in when the colour mesh itself is far.
    rec.wantsShadowLod = false;
  });
  const state = { records, owned, stats, enabled: true };
  scene.userData.lodState = state;
  return state;
}

function pickLevel(dist, family, rec, current) {
  // P1C owns figure meshes (lod-card / lod-mid / lod-part). Do not hide or
  // swap them at 80 m — that was a second LOD fighting the figure lane.
  const hyst = current === undefined || current === null ? 0 : LOD_HYSTERESIS_M;
  const hold = (threshold, isOn) => {
    if (isOn) return dist > threshold - hyst;
    return dist > threshold;
  };
  if (rec.instanced) return 0;
  if (family === 'hardware' && hold(HARDWARE_CULL_M, current === 'hide')) return 'hide';
  const worldW = rec.card?.worldWidth ?? rec.card?.width ?? 0;
  const worldH = rec.card?.worldHeight ?? rec.card?.height ?? 0;
  const canCard = (family === 'tree' || family === 'figure') && rec.card
    && worldW <= IMPOSTOR_MAX_WIDTH_M + 0.01
    && worldH <= IMPOSTOR_MAX_HEIGHT_M + 0.01
    && rec.radius <= IMPOSTOR_MAX_HEIGHT_M;
  if (canCard) {
    const gate = family === 'tree' ? IMPOSTOR_TREE_M : IMPOSTOR_FIGURE_M;
    if (hold(gate, current === 'impostor')) return 'impostor';
  }
  // Trees/figures inside the impostor gate stay on the source mesh — mid/far
  // decimate was the torn-canopy / figure-slab path.
  if (family === 'tree' || family === 'figure') return 0;
  if (rec.mesh?.userData?.batchStatic) return 0;
  if (rec.localR < 0.45 && hold(420, current === 'hide')) return 'hide';
  if (rec.localR < 1.2 && hold(520, current === 'hide')) return 'hide';
  if (current === 2 && dist < LOD_MID_M - hyst) {
    return dist < LOD_NEAR_M - hyst ? 0 : 1;
  }
  if (current === 1 && dist < LOD_NEAR_M - hyst) return 0;
  if (dist < LOD_NEAR_M) return 0;
  if (dist < LOD_MID_M) return 1;
  return 2;
}

function setHidden(mesh, rec, hidden) {
  if (rec.hidden === hidden) return;
  rec.hidden = hidden;
  mesh.visible = !hidden;
  if (mesh.userData.shadowMesh) mesh.userData.shadowMesh.visible = !hidden;
}

function setImpostor(mesh, rec, on) {
  if (rec.impostor === on) return;
  if (mesh.isInstancedMesh) return;
  rec.impostor = on;
  if (on) {
    rec.prevMat = mesh.material;
    rec.prevGeo = mesh.geometry;
    rec.prevQuat = mesh.quaternion.clone();
    const card = rec.card || impostorSizeForGeometry(rec.prevGeo, rec.family, mesh);
    mesh.geometry = cardGeometry(card.width, card.height, card.yOffset);
    mesh.material = impostorMaterial(rec.family);
    rec.level = 'impostor';
  } else {
    if (rec.prevGeo) mesh.geometry = rec.prevGeo;
    if (rec.prevMat) mesh.material = rec.prevMat;
    if (rec.prevQuat) mesh.quaternion.copy(rec.prevQuat);
    rec.prevMat = null;
    rec.prevGeo = null;
    rec.prevQuat = null;
    mesh.updateMatrix();
  }
}

function orientImpostor(mesh, camera) {
  _origin.setFromMatrixPosition(mesh.matrixWorld);
  mesh.lookAt(camera.position.x, _origin.y, camera.position.z);
  mesh.updateMatrix();
}

export function applyLod(scene, camera) {
  const state = scene.userData.lodState;
  if (!state || !camera) return;
  if (!isLodEnabled() || !state.enabled) {
    if (state.applied) restoreLodMeshes(state);
    return;
  }
  const cx = camera.position.x;
  const cy = camera.position.y;
  const cz = camera.position.z;
  const list = state.records;
  for (let i = 0; i < list.length; i += 1) {
    const rec = list[i];
    if (rec.impostor && rec.mesh && !rec.mesh.isInstancedMesh) {
      orientImpostor(rec.mesh, camera);
    }
  }
  const camKey = `${cx >> 3}:${cy >> 3}:${cz >> 3}`;
  if (camKey === _lodCamKey && state.applied) return;
  _lodCamKey = camKey;
  state.applied = true;
  for (let i = 0; i < list.length; i += 1) {
    const rec = list[i];
    const mesh = rec.mesh;
    if (!mesh || !mesh.parent) continue;
    const e = mesh.matrixWorld.elements;
    const dx = e[12] - cx;
    const dy = e[13] - cy;
    const dz = e[14] - cz;
    let r = rec.radius;
    if (mesh.isInstancedMesh && mesh.boundingSphere) {
      r = mesh.boundingSphere.radius;
    }
    const centreDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const rUse = mesh.isInstancedMesh ? Math.min(r, LOD_NEAR_M) : r;
    const dist = centreDist - rUse;
    const d = dist < 0 ? 0 : dist;

    if (mesh.userData.waterLodGeos || mesh.userData.waterLodBuild) {
      const camD = Math.hypot(cx - 136, cz - 136);
      const level = camD > WATER_LOD_FAR_M ? 2 : camD > WATER_LOD_MID_M ? 1 : 0;
      const next = mesh.userData.waterLodBuild
        ? mesh.userData.waterLodBuild(level)
        : (mesh.userData.waterLodGeos[level] || mesh.userData.waterLodGeos[0]);
      if (next && mesh.geometry !== next) mesh.geometry = next;
      rec.level = level;
      continue;
    }

    const want = pickLevel(d, rec.family, rec, rec.level);
    if (want === 'hide') {
      setImpostor(mesh, rec, false);
      setHidden(mesh, rec, true);
      rec.level = 'hide';
      continue;
    }
    setHidden(mesh, rec, false);
    if (want === 'impostor') {
      setImpostor(mesh, rec, true);
      orientImpostor(mesh, camera);
      continue;
    }
    setImpostor(mesh, rec, false);
    const pack = rec.geos;
    if (!pack) continue;
    const geo = want === 0 ? pack.full : want === 1 ? pack.mid : pack.far;
    if (geo && mesh.geometry !== geo) mesh.geometry = geo;
    rec.level = want;
    if (rec.wantsShadowLod && want === 0 && !mesh.userData.shadowMesh) {
      const sh = attachShadowMesh(mesh, pack, state.owned);
      if (sh) state.stats.shadows += 1;
    }
    const shadow = mesh.userData.shadowMesh;
    if (shadow) {
      shadow.visible = want === 0;
      if (mesh.isInstancedMesh) shadow.count = mesh.count;
      if (want !== 0) {
        mesh.castShadow = !rec.hidden && !mesh.userData.shadowCulledSize;
      }
    }
  }
}

function restoreLodMeshes(state) {
  if (!state?.records) return;
  for (const rec of state.records) {
    const mesh = rec.mesh;
    if (!mesh) continue;
    if (rec.impostor) setImpostor(mesh, rec, false);
    if (rec.hidden) setHidden(mesh, rec, false);
    if (rec.geos?.full && mesh.geometry !== rec.geos.full) mesh.geometry = rec.geos.full;
  }
  state.applied = false;
  _lodCamKey = '';
}

/**
 * True when the still-water plane is visible in the lower half of the view.
 * Used to skip the planar harbour reflector.
 */
export function waterInFrustumLowerHalf(camera, waterY = WATER_Y) {
  if (!camera) return false;
  camera.updateMatrixWorld();
  _origin.setFromMatrixPosition(camera.matrixWorld);
  const samples = [
    [-0.95, -0.95], [0, -0.95], [0.95, -0.95],
    [-0.7, -0.45], [0, -0.45], [0.7, -0.45],
    [-0.4, -0.08], [0, -0.08], [0.4, -0.08],
  ];
  for (let i = 0; i < samples.length; i += 1) {
    const [nx, ny] = samples[i];
    _v.set(nx, ny, 0.5).unproject(camera);
    _dir.copy(_v).sub(_origin);
    if (Math.abs(_dir.y) < 1e-8) continue;
    const t = (waterY - _origin.y) / _dir.y;
    if (t <= 0 || t > camera.far) continue;
    const ix = _origin.x + _dir.x * t;
    const iz = _origin.z + _dir.z * t;
    if (ix > -500 && ix < 900 && iz > -500 && iz < 900) return true;
  }
  return false;
}

export function censusLodHeap(scene) {
  const seen = new Set();
  let geometryBytes = 0;
  let geometries = 0;
  let lodCopies = 0;
  let impostorMats = 0;
  scene?.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    if (seen.has(g.uuid)) return;
    seen.add(g.uuid);
    geometries += 1;
    const pos = g.attributes?.position;
    if (pos?.array) geometryBytes += pos.array.byteLength;
    const idx = g.index;
    if (idx?.array) geometryBytes += idx.array.byteLength;
    const nrm = g.attributes?.normal;
    if (nrm?.array) geometryBytes += nrm.array.byteLength;
    const uv = g.attributes?.uv;
    if (uv?.array) geometryBytes += uv.array.byteLength;
  });
  for (const pack of geoCache.values()) {
    if (pack._mid && pack._mid !== pack.full) lodCopies += 1;
    if (pack._far && pack._far !== pack.full && pack._far !== pack._mid) lodCopies += 1;
  }
  if (_impostorTreeMat) impostorMats += 1;
  if (_impostorFigureMat) impostorMats += 1;
  return {
    geometries,
    geometryBytes,
    geometryMB: geometryBytes / (1024 * 1024),
    lodCopies,
    cacheSize: geoCache.size,
    impostorMats,
    jsHeapMB: (typeof performance !== 'undefined' && performance.memory)
      ? performance.memory.usedJSHeapSize / (1024 * 1024)
      : null,
  };
}

export function disposeSceneLod(scene) {
  const state = scene.userData.lodState;
  if (!state) return;
  for (const rec of state.records) {
    const mesh = rec.mesh;
    if (!mesh) continue;
    if (rec.impostor) setImpostor(mesh, rec, false);
    if (rec.hidden) setHidden(mesh, rec, false);
    if (rec.geos?.full && mesh.geometry !== rec.geos.full) mesh.geometry = rec.geos.full;
    if (mesh.userData.shadowMovedToLod) mesh.castShadow = true;
    const shadow = mesh.userData.shadowMesh;
    if (shadow?.parent) shadow.parent.remove(shadow);
    mesh.userData.shadowMesh = null;
    mesh.userData.lod = null;
  }
  scene.userData.lodState = null;
  _lodCamKey = '';
  geoCache.clear();
}
