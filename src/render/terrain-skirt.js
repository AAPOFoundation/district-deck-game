import * as THREE from 'three';

// The boundary is extracted from the rendered sheet, including its snapped
// coastline. Interior triangle edges never produce a wall. Weld the azimuth
// seam by position so its duplicate vertices cannot create an internal face.
export function buildTerrainSkirt(source, isCoast, bottom = -4.02) {
  const p = source.getAttribute('position');
  const index = source.index;
  const edges = new Map();
  const key = i => [p.getX(i), p.getY(i), p.getZ(i)].map(v => v.toFixed(4)).join(',');
  for (let i = 0; i < index.count; i += 3) {
    const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    for (let j = 0; j < 3; j++) {
      const a = tri[j], b = tri[(j + 1) % 3];
      const ka = key(a), kb = key(b);
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const edge = edges.get(k);
      if (edge) edge.count++; else edges.set(k, { a, b, count: 1 });
    }
  }
  const vertices = [];
  for (const { a, b, count } of edges.values()) {
    if (count !== 1 || !isCoast((p.getX(a) + p.getX(b)) / 2, (p.getZ(a) + p.getZ(b)) / 2)) continue;
    if (Math.max(p.getY(a), p.getY(b)) <= bottom) continue;
    const A = [p.getX(a), p.getY(a), p.getZ(a)];
    const B = [p.getX(b), p.getY(b), p.getZ(b)];
    const C = [p.getX(a), bottom, p.getZ(a)];
    const D = [p.getX(b), bottom, p.getZ(b)];
    vertices.push(...A, ...C, ...B, ...B, ...C, ...D);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
