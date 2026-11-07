// Shared garden geometry. Deterministic. No sim. No Math.random.
// Builders in this folder import these instead of inventing another box-leaf.

import * as THREE from 'three';

export function box(group, material, w, h, d, x, y, z, rot = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  if (rot) mesh.rotation.set(rot[0] ?? 0, rot[1] ?? 0, rot[2] ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export function cyl(group, material, rTop, rBottom, h, x, y, z, segs = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segs), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export function ball(group, material, r, x, y, z, segs = 12) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(r, segs, Math.max(6, segs - 2)),
    material,
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** Tapered stem with section. */
export function stem(group, material, {
  x, y, z, h, rTop = 0.012, rBot = 0.018, segs = 8, lean = 0, yaw = 0,
}) {
  const mesh = cyl(group, material, rTop, rBot, h, x, y + h / 2, z, segs);
  mesh.rotation.z = lean;
  mesh.rotation.y = yaw;
  return mesh;
}

/**
 * A leaf: thin extruded diamond/teardrop, not a box. `len` is along +Z before tilt.
 * `tilt` is radians off vertical (0 = standing, ~1.1 = open rosette).
 */
export function leaf(group, material, {
  x, y, z, len, wid, tilt, yaw, thick = 0.012, point = 0.22,
}) {
  const shape = new THREE.Shape();
  const half = wid / 2;
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(half, len * point, half * 0.92, len * 0.55);
  shape.quadraticCurveTo(half * 0.35, len * 0.88, 0, len);
  shape.quadraticCurveTo(-half * 0.35, len * 0.88, -half * 0.92, len * 0.55);
  shape.quadraticCurveTo(-half, len * point, 0, 0);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thick,
    bevelEnabled: true,
    bevelThickness: thick * 0.35,
    bevelSize: thick * 0.4,
    bevelSegments: 1,
    curveSegments: 5,
  });
  geo.center();
  const mesh = new THREE.Mesh(geo, material);
  const reach = len * 0.48;
  mesh.position.set(
    x + Math.sin(yaw) * Math.sin(tilt) * reach,
    y + Math.cos(tilt) * reach,
    z + Math.cos(yaw) * Math.sin(tilt) * reach,
  );
  mesh.rotation.order = 'YXZ';
  mesh.rotation.y = yaw;
  mesh.rotation.x = tilt - Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export function rosette(group, material, {
  x, y, z, count, len, wid, tilt, phase = 0, thick = 0.012,
}) {
  for (let i = 0; i < count; i += 1) {
    const yaw = phase + (i / count) * Math.PI * 2;
    const vary = 0.86 + ((i * 37) % 11) / 40;
    leaf(group, material, {
      x, y, z,
      len: len * vary,
      wid,
      tilt: tilt * (0.9 + ((i * 13) % 7) / 24),
      yaw,
      thick,
    });
  }
}

/** Five-sepal calyx on a fruit. */
export function calyx(group, material, { x, y, z, s = 0.04 }) {
  for (let i = 0; i < 5; i += 1) {
    const yaw = (i / 5) * Math.PI * 2;
    box(
      group, material,
      s * 0.55, s * 0.22, s * 1.15,
      x + Math.sin(yaw) * s * 0.35,
      y + s * 0.12,
      z + Math.cos(yaw) * s * 0.35,
      [0.35, yaw, 0],
    );
  }
}

/** Ribbed pumpkin / marrow: lathe body + 8 shallow ribs. */
export function ribbedOrb(group, material, {
  x, y, z, r, squash = 0.78, ribs = 8, segs = 12,
}) {
  const body = ball(group, material, r, x, y, z, segs);
  body.scale.set(1, squash, 1);
  for (let i = 0; i < ribs; i += 1) {
    const yaw = (i / ribs) * Math.PI * 2;
    const rib = cyl(group, material, r * 0.08, r * 0.08, r * 1.35, x, y, z, 6);
    rib.rotation.z = Math.PI / 2;
    rib.rotation.y = yaw;
    rib.scale.set(1, 1, squash);
  }
  return body;
}

export function latheFruit(group, material, {
  x, y, z, pts, segs = 10, rot = null,
}) {
  const points = pts.map(([px, py]) => new THREE.Vector2(px, py));
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(points, segs), material);
  mesh.position.set(x, y, z);
  if (rot) mesh.rotation.set(rot[0] ?? 0, rot[1] ?? 0, rot[2] ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export function growthStage(t, ripe) {
  if (ripe) return 'ripe';
  if (t < 0.25) return 'sprout';
  if (t < 0.55) return 'leaf';
  return 'bud';
}
