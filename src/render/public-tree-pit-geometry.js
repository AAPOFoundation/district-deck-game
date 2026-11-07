// Owned public-pit meshes and world-space rectangle cuts.
// Registry buffers are read and never written. Cut results are new geometries.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PUBLIC_PIT_LEVELS } from './public-tree-pits.js';

const OUTER_HALF = 0.92;
const OPENING_HALF = 0.76;
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

export function pitsTouchingRect(layout, rect) {
  const pits = layout?.pits;
  if (!pits?.length || !rect) return [];
  const hits = [];
  const seen = new Set();
  const take = (pit) => {
    if (!pit || seen.has(pit.index)) return;
    const rim = pit.rim;
    if (!rim) return;
    if (rim.minX < rect.maxX && rect.minX < rim.maxX && rim.minZ < rect.maxZ && rect.minZ < rim.maxZ) {
      seen.add(pit.index);
      hits.push(pit);
    }
  };
  const cells = layout.lookup?.cells;
  const cell = layout.lookup?.cell;
  if (!cells || !cell) {
    for (let i = 0; i < pits.length; i += 1) take(pits[i]);
    return hits;
  }
  const x0 = Math.floor(rect.minX / cell);
  const x1 = Math.floor(rect.maxX / cell);
  const z0 = Math.floor(rect.minZ / cell);
  const z1 = Math.floor(rect.maxZ / cell);
  for (let x = x0; x <= x1; x += 1) {
    for (let z = z0; z <= z1; z += 1) {
      const ids = cells[`${x}:${z}`];
      if (!ids) continue;
      for (let i = 0; i < ids.length; i += 1) take(pits[ids[i]]);
    }
  }
  return hits;
}

export function placementWorldRect(placement) {
  const hx = placement.scale.x * 0.5;
  const hz = placement.scale.z * 0.5;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const x of [-hx, hx]) {
    for (const z of [-hz, hz]) {
      _v.set(x, 0, z).applyQuaternion(placement.quaternion).add(placement.position);
      if (_v.x < minX) minX = _v.x;
      if (_v.x > maxX) maxX = _v.x;
      if (_v.z < minZ) minZ = _v.z;
      if (_v.z > maxZ) maxZ = _v.z;
    }
  }
  return { minX, maxX, minZ, maxZ };
}

function lerpChannel(a, b, t, out) {
  if (!a || !b) return null;
  for (let i = 0; i < a.length; i += 1) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

function lerpVertex(a, b, t) {
  const p = [
    a.p[0] + (b.p[0] - a.p[0]) * t,
    a.p[1] + (b.p[1] - a.p[1]) * t,
    a.p[2] + (b.p[2] - a.p[2]) * t,
  ];
  const n = [
    a.n[0] + (b.n[0] - a.n[0]) * t,
    a.n[1] + (b.n[1] - a.n[1]) * t,
    a.n[2] + (b.n[2] - a.n[2]) * t,
  ];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  n[0] /= len;
  n[1] /= len;
  n[2] /= len;
  return {
    p,
    n,
    uv: lerpChannel(a.uv, b.uv, t, [0, 0]),
    uv2: lerpChannel(a.uv2, b.uv2, t, [0, 0]),
    color: a.color && b.color ? lerpChannel(a.color, b.color, t, [0, 0, 0]) : null,
  };
}

function clipKeep(poly, keep, axis, value) {
  const out = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ain = keep(a.p[axis]);
    const bin = keep(b.p[axis]);
    if (ain && bin) out.push(b);
    else if (ain && !bin) {
      const d = b.p[axis] - a.p[axis];
      out.push(lerpVertex(a, b, d === 0 ? 0 : (value - a.p[axis]) / d));
    } else if (!ain && bin) {
      const d = b.p[axis] - a.p[axis];
      out.push(lerpVertex(a, b, d === 0 ? 0 : (value - a.p[axis]) / d));
      out.push(b);
    }
  }
  return out;
}

/** Outside pieces of one AABB. Inside remainder is dropped. Each outside region is emitted once. */
function subtractHole(poly, hole) {
  const planes = [
    { axis: 0, value: hole.minX, inside: (v) => v >= hole.minX, outside: (v) => v < hole.minX },
    { axis: 0, value: hole.maxX, inside: (v) => v <= hole.maxX, outside: (v) => v > hole.maxX },
    { axis: 2, value: hole.minZ, inside: (v) => v >= hole.minZ, outside: (v) => v < hole.minZ },
    { axis: 2, value: hole.maxZ, inside: (v) => v <= hole.maxZ, outside: (v) => v > hole.maxZ },
  ];
  let inside = poly;
  const pieces = [];
  for (let i = 0; i < planes.length; i += 1) {
    if (inside.length < 3) break;
    const plane = planes[i];
    const outside = clipKeep(inside, plane.outside, plane.axis, plane.value);
    inside = clipKeep(inside, plane.inside, plane.axis, plane.value);
    if (outside.length >= 3) pieces.push(outside);
  }
  return pieces;
}

function polygonOverlaps(poly, hole) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i].p;
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[2] < minZ) minZ = p[2];
    if (p[2] > maxZ) maxZ = p[2];
  }
  return minX < hole.maxX && maxX > hole.minX && minZ < hole.maxZ && maxZ > hole.minZ;
}

function subtractHoles(poly, holes) {
  let parts = [poly];
  for (let h = 0; h < holes.length; h += 1) {
    const hole = holes[h];
    const next = [];
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (!polygonOverlaps(part, hole)) {
        next.push(part);
        continue;
      }
      const outside = subtractHole(part, hole);
      for (let k = 0; k < outside.length; k += 1) next.push(outside[k]);
    }
    parts = next;
    if (!parts.length) break;
  }
  return parts;
}

function pushVertex(buckets, vertex) {
  buckets.position.push(vertex.p[0], vertex.p[1], vertex.p[2]);
  buckets.normal.push(vertex.n[0], vertex.n[1], vertex.n[2]);
  if (buckets.uv) buckets.uv.push(vertex.uv[0], vertex.uv[1]);
  if (buckets.uv2) buckets.uv2.push(vertex.uv2[0], vertex.uv2[1]);
  if (buckets.color) buckets.color.push(vertex.color[0], vertex.color[1], vertex.color[2]);
}

function emitPolygon(buckets, poly) {
  for (let i = 1; i < poly.length - 1; i += 1) {
    pushVertex(buckets, poly[0]);
    pushVertex(buckets, poly[i]);
    pushVertex(buckets, poly[i + 1]);
  }
}

function readVertex(pos, normal, uv, uv2, color, index, matrix, normalMatrix) {
  _v.fromBufferAttribute(pos, index).applyMatrix4(matrix);
  if (normal) _n.fromBufferAttribute(normal, index).applyMatrix3(normalMatrix);
  else _n.set(0, 1, 0);
  const len = Math.hypot(_n.x, _n.y, _n.z) || 1;
  return {
    p: [_v.x, _v.y, _v.z],
    n: [_n.x / len, _n.y / len, _n.z / len],
    uv: uv ? [uv.getX(index), uv.getY(index)] : null,
    uv2: uv2 ? [uv2.getX(index), uv2.getY(index)] : null,
    color: color ? [color.getX(index), color.getY(index), color.getZ(index)] : null,
  };
}

/**
 * Copy `geometry` into world space and remove `holes` (XZ rectangles) from every triangle.
 * Intersecting triangles are partitioned. Vertical triangles are kept when they fall outside.
 * The source geometry is not modified.
 */
export function clipGeometryToWorld(geometry, matrix, holes) {
  const pos = geometry?.attributes?.position;
  if (!pos || !holes?.length) return null;
  const normal = geometry.attributes.normal ?? null;
  const uv = geometry.attributes.uv ?? null;
  const uv2 = geometry.attributes.uv2 ?? null;
  const color = geometry.attributes.color ?? null;
  const index = geometry.index;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const buckets = {
    position: [],
    normal: [],
    uv: uv ? [] : null,
    uv2: uv2 ? [] : null,
    color: color ? [] : null,
  };
  const triCount = index ? index.count / 3 : pos.count / 3;
  const corner = (slot, which) => {
    const vertexIndex = index ? index.getX(slot * 3 + which) : slot * 3 + which;
    return readVertex(pos, normal, uv, uv2, color, vertexIndex, matrix, normalMatrix);
  };
  for (let t = 0; t < triCount; t += 1) {
    const poly = [corner(t, 0), corner(t, 1), corner(t, 2)];
    let hit = false;
    for (let h = 0; h < holes.length; h += 1) {
      if (polygonOverlaps(poly, holes[h])) {
        hit = true;
        break;
      }
    }
    const parts = hit ? subtractHoles(poly, holes) : [poly];
    for (let i = 0; i < parts.length; i += 1) emitPolygon(buckets, parts[i]);
  }
  if (buckets.position.length < 9) return null;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(buckets.position, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(buckets.normal, 3));
  if (buckets.uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(buckets.uv, 2));
  if (buckets.uv2) out.setAttribute('uv2', new THREE.Float32BufferAttribute(buckets.uv2, 2));
  if (buckets.color) out.setAttribute('color', new THREE.Float32BufferAttribute(buckets.color, 3));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  out.userData.ownsPitClip = true;
  return out;
}

function paintBox(geometry, hex) {
  const color = new THREE.Color(hex);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function band(x, y, z, sx, sy, sz, hex) {
  const geometry = new THREE.BoxGeometry(sx, sy, sz);
  geometry.translate(x, y, z);
  return paintBox(geometry, hex);
}

/** One shared corridor-aligned pit. Rim and grate stay outside the 0.76 m opening. */
export function publicPitGeometry() {
  const soilTop = PUBLIC_PIT_LEVELS.soil;
  const grateTop = PUBLIC_PIT_LEVELS.grate;
  const rimTop = PUBLIC_PIT_LEVELS.rim;
  const parts = [
    band(0, soilTop - 0.02, 0, OPENING_HALF * 2, 0.04, OPENING_HALF * 2, '#2a2218'),
  ];
  const wallBottom = soilTop;
  const wallTop = 0.25;
  const wallH = wallTop - wallBottom;
  const wallY = (wallBottom + wallTop) * 0.5;
  const span = OUTER_HALF - OPENING_HALF;
  const outerW = OUTER_HALF * 2;
  parts.push(
    band(0, wallY, OPENING_HALF + span * 0.5, outerW, wallH, span, '#8f8a82'),
    band(0, wallY, -(OPENING_HALF + span * 0.5), outerW, wallH, span, '#8f8a82'),
    band(OPENING_HALF + span * 0.5, wallY, 0, span, wallH, OPENING_HALF * 2, '#8f8a82'),
    band(-(OPENING_HALF + span * 0.5), wallY, 0, span, wallH, OPENING_HALF * 2, '#8f8a82'),
  );
  const inset = 0.02;
  const grateInner = OPENING_HALF + inset;
  const grateOuter = OUTER_HALF - inset;
  const grateSpan = grateOuter - grateInner;
  const grateH = grateTop - wallTop;
  const grateY = (wallTop + grateTop) * 0.5;
  parts.push(
    band(0, grateY, (grateInner + grateOuter) * 0.5, grateOuter * 2, grateH, grateSpan, '#3a332c'),
    band(0, grateY, -(grateInner + grateOuter) * 0.5, grateOuter * 2, grateH, grateSpan, '#3a332c'),
    band((grateInner + grateOuter) * 0.5, grateY, 0, grateSpan, grateH, grateInner * 2, '#3a332c'),
    band(-(grateInner + grateOuter) * 0.5, grateY, 0, grateSpan, grateH, grateInner * 2, '#3a332c'),
  );
  const lipH = rimTop - wallTop;
  const lipY = (wallTop + rimTop) * 0.5;
  parts.push(
    band(0, lipY, OPENING_HALF + inset * 0.5, outerW, lipH, inset, '#b3ada3'),
    band(0, lipY, -(OPENING_HALF + inset * 0.5), outerW, lipH, inset, '#b3ada3'),
    band(OPENING_HALF + inset * 0.5, lipY, 0, inset, lipH, OPENING_HALF * 2, '#b3ada3'),
    band(-(OPENING_HALF + inset * 0.5), lipY, 0, inset, lipH, OPENING_HALF * 2, '#b3ada3'),
    band(0, lipY, OUTER_HALF - inset * 0.5, outerW, lipH, inset, '#b3ada3'),
    band(0, lipY, -(OUTER_HALF - inset * 0.5), outerW, lipH, inset, '#b3ada3'),
    band(OUTER_HALF - inset * 0.5, lipY, 0, inset, lipH, OPENING_HALF * 2, '#b3ada3'),
    band(-(OUTER_HALF - inset * 0.5), lipY, 0, inset, lipH, OPENING_HALF * 2, '#b3ada3'),
  );
  const merged = mergeGeometries(parts, false);
  for (let i = 0; i < parts.length; i += 1) parts[i].dispose();
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  merged.userData.ownsPitClip = true;
  merged.userData.publicPit = Object.freeze({
    outerHalf: OUTER_HALF,
    openingHalf: OPENING_HALF,
    soil: soilTop,
    grate: grateTop,
    rim: rimTop,
  });
  return merged;
}
