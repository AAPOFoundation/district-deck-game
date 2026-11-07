// Modeled vinyl supermarket playset. Geometry only — game loop stays in supermarket-td.js.

import * as THREE from 'three';

export const VIEW = 5.15;

export const PATHS = [
  [{ x: -3.25, z: -4.25 }, { x: -3.25, z: -1.8 }, { x: -3.25, z: 0.55 }, { x: -3.25, z: 2.95 }],
  [{ x: 0, z: -4.25 }, { x: 0, z: -1.8 }, { x: 0, z: 0.55 }, { x: 0, z: 2.95 }],
  [{ x: 3.25, z: -4.25 }, { x: 3.25, z: -1.8 }, { x: 3.25, z: 0.55 }, { x: 3.25, z: 2.95 }],
];
// Walk the mint floor; bays sit to +x of each path.

function mat(color, extras = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: extras.roughness ?? 0.36,
    metalness: extras.metalness ?? 0.06,
    emissive: extras.emissive ?? 0x000000,
    emissiveIntensity: extras.emissiveIntensity ?? 0,
    map: extras.map ?? null,
    envMapIntensity: extras.envMapIntensity ?? 0.8,
  });
}

function box(parent, w, h, d, material, x, y, z, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cyl(parent, rt, rb, h, segs, material, x, y, z, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segs), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function sphere(parent, r, segs, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, segs, segs), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function posePlaysetCamera(camera, aspect) {
  camera.left = -VIEW * aspect;
  camera.right = VIEW * aspect;
  camera.top = VIEW;
  camera.bottom = -VIEW;
  camera.position.set(7.6, 9.4, 7.6);
  camera.lookAt(0, 0.35, 0.2);
  camera.updateProjectionMatrix();
}

function prepMap(map, rx = 2.2, ry = 2.2) {
  if (!map) return null;
  const next = map.clone();
  next.wrapS = THREE.RepeatWrapping;
  next.wrapT = THREE.RepeatWrapping;
  next.repeat.set(rx, ry);
  next.colorSpace = THREE.SRGBColorSpace;
  next.needsUpdate = true;
  return next;
}

export function setLaneFills(fills, counts, capPerLane) {
  const room = Math.max(1, capPerLane);
  for (const mesh of fills ?? []) {
    const t = Math.min(1, (counts[mesh.userData.lane] ?? 0) / room);
    mesh.scale.z = Math.max(0.05, t);
    mesh.position.z = mesh.userData.z0 + (mesh.userData.len * (mesh.scale.z - 1)) / 2;
    const hot = t >= 0.72;
    mesh.material.color.set(hot ? '#ef5b5b' : '#ffd23a');
    mesh.material.emissive.set(hot ? '#7a1010' : '#6a4a08');
    mesh.material.emissiveIntensity = 0.35 + t * 0.4;
  }
}

export function setTillBars(bars, cashiers) {
  for (const mesh of bars ?? []) {
    const till = cashiers[mesh.userData.till];
    if (!till) continue;
    const t = Math.max(0.04, till.hp / till.max);
    mesh.scale.x = t;
    mesh.material.color.set(till.broken ? '#ef5b5b' : t < 0.4 ? '#ff8a2a' : '#6ad14a');
  }
}

export function buildPlayset(scene, maps = {}) {
  const mint = mat('#86d8a6', { map: prepMap(maps.mint, 2.4, 2.1), roughness: 0.4 });
  const mintWell = mat('#6cbc88', { map: prepMap(maps.mint, 1.8, 1.6), roughness: 0.46 });
  const cream = mat('#f4e4b0', { map: prepMap(maps.cream, 2.6, 1.4), roughness: 0.38 });
  const purple = mat('#a14dd6', { map: prepMap(maps.purple, 1.6, 3.2), roughness: 0.32 });
  const grape = mat('#542078', { map: prepMap(maps.grape, 1.2, 2.4), roughness: 0.44 });
  const orange = mat('#ff8c2a', { map: prepMap(maps.orange, 1.4, 1.1), roughness: 0.3 });
  const banana = mat('#ffd445', { roughness: 0.28 });
  const wood = mat('#24150f', { roughness: 0.78 });
  const plum = mat('#7a3aa8', { roughness: 0.34, emissive: '#3a1858', emissiveIntensity: 0.22 });
  const sweets = ['#ff5ba0', '#ffd23a', '#5ec8ff', '#7ed34a', '#ff8a2a', '#fff4d2', '#ff7ad1'];

  const root = new THREE.Group();
  scene.add(root);

  box(root, 28, 0.38, 22, wood, 0, -0.92, 0, false);

  // Mint injection tray. Cream is only a thin underside skirt, not the silhouette.
  box(root, 15.6, 1.05, 12.5, mint, 0, 0.02, 0);
  box(root, 15.9, 0.28, 12.8, cream, 0, -0.52, 0, false);
  box(root, 14.2, 0.16, 11.1, mintWell, 0, 0.52, 0, false);
  for (const [x, z] of [[-7.4, -5.9], [7.4, -5.9], [-7.4, 5.9], [7.4, 5.9]]) {
    cyl(root, 0.42, 0.42, 0.85, 14, mint, x, -0.05, z, false);
    cyl(root, 0.16, 0.16, 0.14, 10, cream, x, 0.42, z, false);
  }

  // One standing bay per route: a single purple tray with 5 open pockets.
  // Shoppers walk the mint at PATHS.x; the bay sits to +x.
  for (const x of [-3.25, 0, 3.25]) {
    const bx = x + 1.18;
    box(root, 1.85, 1.05, 8.15, purple, bx, 0.98, -0.7);
    for (let cell = 0; cell < 5; cell += 1) {
      const z = -3.55 + cell * 1.52;
      box(root, 1.35, 0.28, 1.12, grape, bx, 1.42, z, false);
      for (let n = 0; n < 2; n += 1) {
        const color = sweets[(cell + n + Math.round(x + 4)) % sweets.length];
        box(
          root,
          0.34,
          0.2,
          0.28,
          mat(color, { roughness: 0.24 }),
          bx - 0.28 + n * 0.5,
          1.58,
          z,
          false,
        );
      }
    }
    const stamp = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), plum);
    stamp.position.set(bx, 0.62, 3.3);
    root.add(stamp);
  }

  const fills = [];
  const tillBars = [];
  for (let i = 0; i < 3; i += 1) {
    const x = [-3.25, 0, 3.25][i];
    const len = 7.1;
    const fill = box(root, 0.52, 0.07, len, mat('#ffd23a', { emissive: '#6a4a08', emissiveIntensity: 0.35 }), x, 0.56, -0.55, false);
    fill.userData.lane = i;
    fill.userData.len = len;
    fill.userData.z0 = -0.55;
    fill.scale.z = 0.05;
    fills.push(fill);
  }

  // Orange sausage checkouts + yellow register + HP nib.
  for (let i = 0; i < 3; i += 1) {
    const x = [-3.25, 0, 3.25][i];
    box(root, 1.7, 0.48, 1.22, orange, x, 0.52, 3.62);
    const capL = cyl(root, 0.24, 0.24, 1.22, 14, orange, x - 0.85, 0.52, 3.62);
    capL.rotation.x = Math.PI / 2;
    const capR = cyl(root, 0.24, 0.24, 1.22, 14, orange, x + 0.85, 0.52, 3.62);
    capR.rotation.x = Math.PI / 2;
    box(root, 0.52, 0.46, 0.46, banana, x + 0.48, 0.92, 3.72);
    box(root, 0.16, 0.08, 0.16, mat('#ef4d4d'), x + 0.52, 1.18, 3.58, false);
    for (const dx of [-0.28, 0, 0.28]) {
      sphere(root, 0.07, 8, plum, x + dx, 0.78, 4.08);
    }
    const bar = box(root, 1.1, 0.07, 0.1, mat('#6ad14a'), x - 0.2, 0.82, 3.12, false);
    bar.userData.till = i;
    tillBars.push(bar);
  }

  // Paw flap lies on the left lip, same plane as the tray (boot-hero).
  const flap = new THREE.Group();
  flap.position.set(-8.15, 0.58, -0.1);
  flap.rotation.x = -Math.PI / 2;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.28, 1.32, 0.26, 24), mint);
  pad.castShadow = true;
  flap.add(pad);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.28, 16), plum);
  inner.position.y = 0.02;
  flap.add(inner);
  for (const [x, z] of [[-0.72, -0.42], [-0.86, 0], [-0.72, 0.42], [-0.42, 0.7]]) {
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), plum);
    toe.position.set(x, 0.06, z);
    toe.castShadow = true;
    flap.add(toe);
  }
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.85, 10), cream);
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(1.15, 0, 0);
  flap.add(hinge);
  root.add(flap);

  return { root, fills, tillBars };
}
