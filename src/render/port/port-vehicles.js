// District Deck — P13 Lane C port vehicles.
// Terminal tractor and a short diesel consist in the same language as
// `addTerminalTruck` / `addWagons` in fringe/port.js. Presentation only.

import * as THREE from 'three';
import { addBox, addCyl, addSphere, noPick, std } from '../fringe/kit.js';
import { featherQuadGeometry, portTextures, waterOrder } from '../fringe/ships.js';
import { CONTAINER_BOX, CONTAINER_REAL, makeStampedContainer } from './container-stamps.js';

const BOX = CONTAINER_BOX;

/**
 * ── P16-PM4 item 3 — THE TERMINAL TRACTOR IS ON THE CONTAINER MODULE. ──
 *
 * This machine carries a stamped container down the corridor, so it is measured
 * in the same metre the container is. `PLANT_K` in `fringe/port.js` states the
 * law; the same three factors are rebuilt here from the same module rather than
 * imported, because `port.js` imports this file and not the other way round.
 * Below, a number is a PUBLISHED metre through `pAlong` / `pAcross` / `pUp`,
 * or it is a fitting with no scale.
 */
const K = {
  along: BOX.w / CONTAINER_REAL.length,
  across: BOX.d / CONTAINER_REAL.width,
  up: BOX.h / CONTAINER_REAL.height,
};
const pAlong = (m) => m * K.along;
const pAcross = (m) => m * K.across;
const pUp = (m) => m * K.up;

function kit() {
  return {
    cladBlue: std('#3d5c7a', { roughness: 0.42, metalness: 0.18 }),
    cladRed: std('#8a2e22', { roughness: 0.46, metalness: 0.12 }),
    yellow: std('#d4a012', { roughness: 0.4, metalness: 0.16 }),
    yellowDark: std('#9a7010', { roughness: 0.48, metalness: 0.2 }),
    steelDark: std('#2a3036', { roughness: 0.38, metalness: 0.42 }),
    steelPale: std('#8a9298', { roughness: 0.32, metalness: 0.46 }),
    rustDark: std('#4a3228', { roughness: 0.62, metalness: 0.18 }),
    glass: std('#1a2830', { roughness: 0.16, metalness: 0.34 }),
    tyre: std('#1a1c20', { roughness: 0.82, metalness: 0.1 }),
    beacon: std('#e07020', {
      roughness: 0.35, metalness: 0.08, emissive: 0xff6a00, emissiveIntensity: 0.85,
    }),
    hazard: std('#c9a21a', { roughness: 0.44, metalness: 0.12 }),
    foam: new THREE.MeshBasicMaterial({
      color: 0xe8f2f6,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      toneMapped: false,
    }),
  };
}

function addWheels(group, mat, xs, zs, r, width) {
  for (const x of xs) {
    for (const z of zs) {
      addCyl(group, r, r, width, 10, mat, x, r, z, { rotZ: Math.PI / 2 });
    }
  }
}

/**
 * ── P16-PM7 item 3 — THE CONTACT BLOB HAD A HARD RIM. ──
 *
 * `CircleGeometry(1, 20)` at `#101820` and opacity 0.38 is a dark ellipse with a
 * razor boundary: no straight edge, but no fade either, which is the same fault
 * one shape along and the reason LAW 3R found three of these under the shunter
 * and its wagons on the first run of the runtime census. The disc carries its
 * fade in its own vertices now — full value at the hub, alpha zero all round the
 * rim — which is `foamPatchGeometry`'s contract in polar form, and it is the
 * form the lint's `feathered()` reads.
 *
 * The buffer is shared and therefore NOT owned: `disposeVehicle` walks
 * `userData.ownsGeometry`, and one tractor being retired must not take the disc
 * out from under every other vehicle in the venue.
 */
const BLOB_GEO = { geo: null };
function groundBlobGeometry() {
  if (BLOB_GEO.geo) return BLOB_GEO.geo;
  const N = 20;
  const verts = [0, 0, 0];
  const uvs = [0.5, 0.5];
  const cols = [1, 1, 1, 1];
  for (let i = 0; i <= N; i += 1) {
    const a2 = (i / N) * Math.PI * 2;
    const x = Math.cos(a2);
    const y = Math.sin(a2);
    verts.push(x, y, 0);
    uvs.push(x * 0.5 + 0.5, y * 0.5 + 0.5);
    cols.push(1, 1, 1, 0);
  }
  const idx = [];
  for (let i = 1; i <= N; i += 1) idx.push(0, i, i + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 4));
  geo.setIndex(idx);
  BLOB_GEO.geo = geo;
  return geo;
}

function addGroundBlob(group, w, d) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0x101820,
    transparent: true,
    opacity: 0.44,
    depthWrite: false,
    toneMapped: false,
    vertexColors: true,
  });
  const mesh = new THREE.Mesh(groundBlobGeometry(), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.scale.set(w, d, 1);
  mesh.renderOrder = 2;
  mesh.userData.ownsGeometry = false;
  noPick(mesh);
  group.add(mesh);
  return mesh;
}

/**
 * Terminal tractor carrying one stamped container. Cab-over, skeletal chassis,
 * fifth-wheel plate, hazard stripe. Container sits on `userData.cargoMount`.
 */
export function addTerminalTractor(good, { id = 0, loaded = true } = {}) {
  const mats = kit();
  const t = new THREE.Group();
  t.name = `fringe:port-tractor:${id}`;
  /* Terberg-class terminal tractor + 20 ft skeletal trailer: 11.0 m over the
     bumpers, 2.50 m wide, 2.90 m to the cab roof, 1.00 m wheels, deck at 1.30.
     The trailer runs down the machine's +z, so the box lies ALONG the chassis —
     it used to be laid across it, `BOX.w` on the local x, which put a 2.86 m
     container broadside on a 1.5 m rail. */
  const wheelR = pUp(1.00) * 0.5;
  const railTop = pUp(1.30);
  const cabZ = -pAlong(2.70);
  const bedZ = pAlong(3.30);
  addBox(t, pAcross(2.50), pUp(1.55), pAlong(2.60), mats.cladBlue, 0, pUp(2.12), cabZ);
  addBox(t, pAcross(2.20), pUp(1.05), pAlong(0.12), mats.glass, 0, pUp(2.30),
    cabZ - pAlong(1.34));
  addBox(t, pAcross(0.12), pUp(0.92), pAlong(1.60), mats.glass, pAcross(1.24), pUp(2.24), cabZ);
  addBox(t, pAcross(2.60), pUp(0.38), pAlong(3.60), mats.steelDark, 0, railTop - pUp(0.55),
    cabZ + pAlong(0.10));
  addBox(t, pAcross(1.95), pUp(0.46), pAlong(7.80), mats.steelDark, 0, railTop - pUp(0.23),
    pAlong(2.40));
  /* Bolsters, with their TOP faces on the deck line the box stands on — a
     cross-member centred on `railTop` puts half its own depth through the load
     (0.12 m, which the PM4 animation census read as an interpenetration). */
  for (const dz of [pAlong(0.20), pAlong(6.10)]) {
    addBox(t, pAcross(2.45), pUp(0.24), pAlong(0.52), mats.steelPale, 0,
      railTop - pUp(0.12), dz);
  }
  addBox(t, pAcross(1.20), pUp(0.38), pAlong(0.62), mats.steelPale, 0, pUp(2.55),
    cabZ - pAlong(1.42));
  addBox(t, pAcross(2.02), pUp(0.10), pAlong(7.90), mats.hazard, 0, railTop - pUp(0.05),
    pAlong(2.40));
  addWheels(t, mats.tyre, [-pAcross(1.05), pAcross(1.05)],
    [-pAlong(4.10), -pAlong(1.20), pAlong(4.60), pAlong(5.90)], wheelR, pAcross(0.40));
  addSphere(t, pUp(0.14), 6, mats.beacon, 0, pUp(3.02), cabZ);
  // `addGroundBlob` takes HALF-extents (it scales a unit-radius circle).
  addGroundBlob(t, pAcross(1.55), pAlong(5.60));

  const mount = new THREE.Group();
  mount.name = `fringe:port-tractor:${id}:cargo-mount`;
  mount.position.set(0, railTop, bedZ);
  t.add(mount);
  let cargo = null;
  if (loaded && good && good !== 'overflow') {
    cargo = makeStampedContainer(good, { name: `container:tractor:${id}` });
    // Length down the chassis, and standing ON the deck rather than half in it.
    cargo.rotation.y = Math.PI / 2;
    cargo.position.y = BOX.h * 0.5;
    mount.add(cargo);
  }
  t.userData.cargoMount = mount;
  t.userData.cargo = cargo;
  t.userData.wheelRadius = wheelR;
  t.traverse((ch) => {
    if (ch.isMesh) {
      ch.castShadow = true;
      ch.receiveShadow = true;
    }
  });
  return t;
}

function addShunter(mats, id) {
  const s = new THREE.Group();
  s.name = `fringe:port-shunter:${id}`;
  addBox(s, 7.2, 2.2, 2.7, mats.yellow, 0, 2.15, 0);
  addBox(s, 7.4, 0.28, 2.85, mats.yellowDark, 0, 3.32, 0);
  addBox(s, 2.4, 1.6, 2.5, mats.cladBlue, 2.1, 3.4, 0);
  addBox(s, 0.08, 1.0, 2.1, mats.glass, 3.32, 3.5, 0);
  addBox(s, 2.1, 0.9, 0.08, mats.glass, 2.1, 3.55, 1.28);
  addBox(s, 6.8, 0.55, 2.5, mats.steelDark, 0, 0.95, 0);
  addBox(s, 1.4, 1.1, 2.4, mats.steelPale, -3.1, 2.6, 0);
  addCyl(s, 0.22, 0.28, 0.7, 8, mats.steelDark, -2.2, 3.7, 0);
  addSphere(s, 0.1, 6, mats.beacon, 2.1, 4.35, 0);
  for (const dx of [-2.2, 2.0]) {
    for (const dz of [-1.05, 1.05]) {
      addCyl(s, 0.42, 0.42, 0.22, 10, mats.rustDark, dx, 0.42, dz, { rotZ: Math.PI / 2 });
    }
  }
  addGroundBlob(s, 4.2, 1.8);
  return s;
}

function addFlatWagon(mats, id, good) {
  const w = new THREE.Group();
  w.name = `fringe:port-wagon:${id}`;
  addBox(w, 8.4, 0.5, 2.7, mats.steelDark, 0, 1.02, 0);
  for (const dx of [-2.9, 2.9]) {
    addBox(w, 2.0, 0.4, 2.2, mats.rustDark, dx, 0.6, 0);
    for (const wx of [-0.7, 0.7]) {
      for (const dz of [-0.95, 0.95]) {
        addCyl(w, 0.34, 0.34, 0.14, 10, mats.rustDark, dx + wx, 0.36, dz, { rotZ: Math.PI / 2 });
      }
    }
  }
  addBox(w, 8.5, 0.08, 0.12, mats.hazard, 0, 1.3, 1.28);
  addBox(w, 8.5, 0.08, 0.12, mats.hazard, 0, 1.3, -1.28);
  const mount = new THREE.Group();
  mount.name = `fringe:port-wagon:${id}:cargo-mount`;
  mount.position.set(0, 1.32, 0);
  w.add(mount);
  let cargo = null;
  if (good && good !== 'overflow') {
    cargo = makeStampedContainer(good, { name: `container:wagon:${id}` });
    cargo.position.y = BOX.h * 0.5;
    mount.add(cargo);
  }
  w.userData.cargoMount = mount;
  w.userData.cargo = cargo;
  addGroundBlob(w, 4.6, 1.7);
  return w;
}

/**
 * Shunter + two flat wagons. Wagons carry stamped containers for the given
 * goods (index 0 and 1). Pitch matches `addWagons` (9.4 m).
 */
export function addRailConsist(goods = [], { id = 0 } = {}) {
  const mats = kit();
  const consist = new THREE.Group();
  consist.name = `fringe:port-consist:${id}`;
  const shunter = addShunter(mats, id);
  shunter.position.x = 0;
  consist.add(shunter);
  const wagons = [];
  const pair = [goods[0] ?? null, goods[1] ?? null];
  for (let i = 0; i < 2; i += 1) {
    const wagon = addFlatWagon(mats, `${id}:${i}`, pair[i]);
    wagon.position.x = -(i + 1) * 9.4;
    consist.add(wagon);
    wagons.push(wagon);
  }
  consist.userData.wagons = wagons;
  consist.userData.shunter = shunter;
  consist.userData.pitch = 9.4;
  consist.traverse((ch) => {
    if (ch.isMesh) {
      ch.castShadow = true;
      ch.receiveShadow = true;
    }
  });
  return consist;
}

/**
 * Light engine (shunter only) for the ambient spur shuttle. No wagons.
 */
export function addLightEngine({ id = 'ambient' } = {}) {
  const mats = kit();
  const consist = new THREE.Group();
  consist.name = `fringe:port-light-engine:${id}`;
  const shunter = addShunter(mats, `ambient:${id}`);
  consist.add(shunter);
  consist.userData.shunter = shunter;
  consist.userData.wagons = [];
  consist.traverse((ch) => {
    if (ch.isMesh) {
      ch.castShadow = true;
      ch.receiveShadow = true;
    }
  });
  return consist;
}

/**
 * Drum-store pallet + crate the ambient forklift can carry. Opaque, named
 * so C3 cargo-ghost rules treat it as cargo (never faded).
 */
export function addPalletCrate({ id = 0, good = 'timber' } = {}) {
  const mats = kit();
  const g = new THREE.Group();
  g.name = `container:ambient-pallet:${id}`;
  addBox(g, 1.15, 0.12, 0.95, mats.rustDark, 0, 0.06, 0);
  addBox(g, 0.08, 0.12, 0.95, mats.steelDark, -0.48, 0.06, 0);
  addBox(g, 0.08, 0.12, 0.95, mats.steelDark, 0.48, 0.06, 0);
  /* P16-PM4: the crate is a CRATE, sized to the pallet it stands on, not 0.42
     of whatever the container module happens to be — at 0.42 the new module
     overhung the pallet by 0.32 m at each end. */
  const crate = makeStampedContainer(good, { name: `container:ambient-crate:${id}` });
  const crateScale = (1.15 * 0.92) / BOX.w;
  crate.scale.setScalar(crateScale);
  crate.position.y = 0.12 + BOX.h * crateScale * 0.5;
  g.add(crate);
  g.userData.crate = crate;
  g.traverse((ch) => {
    if (ch.isMesh) {
      ch.castShadow = true;
      ch.receiveShadow = true;
    }
  });
  return g;
}

const GULL_BODY = new THREE.BoxGeometry(0.28, 0.1, 0.12);
const GULL_WING = new THREE.BoxGeometry(0.62, 0.025, 0.16);
const GULL_BEAK = new THREE.BoxGeometry(0.1, 0.035, 0.035);
const GULL_MAT = new THREE.MeshStandardMaterial({
  color: 0xf4f1ea, roughness: 0.62, metalness: 0.04,
});
const GULL_DARK = new THREE.MeshStandardMaterial({
  color: 0x3a4248, roughness: 0.55, metalness: 0.06,
});

/**
 * Four-box silver gull for the port kit. Wings are children so the ambient
 * loop can flap them. Shared geometry; disposeVehicle keeps the shared pool.
 */
export function addPortGull(id = 0) {
  const g = new THREE.Group();
  g.name = `fringe:port-gull:${id}`;
  const body = new THREE.Mesh(GULL_BODY, GULL_MAT);
  body.position.y = 0;
  noPick(body);
  g.add(body);
  const beak = new THREE.Mesh(GULL_BEAK, GULL_DARK);
  beak.position.set(0.18, 0.02, 0);
  noPick(beak);
  g.add(beak);
  const left = new THREE.Mesh(GULL_WING, GULL_DARK);
  left.position.set(0, 0.02, 0.28);
  left.name = `fringe:port-gull:${id}:wing-l`;
  noPick(left);
  g.add(left);
  const right = new THREE.Mesh(GULL_WING, GULL_DARK);
  right.position.set(0, 0.02, -0.28);
  right.name = `fringe:port-gull:${id}:wing-r`;
  noPick(right);
  g.add(right);
  g.userData.wingL = left;
  g.userData.wingR = right;
  g.userData.ownsSharedGeometry = null;
  g.scale.setScalar(1.15);
  return g;
}

/**
 * ── P16-PM7 item 3 — THE DEPARTURE WAKE IS NOT SEVEN RECTANGLES. ──
 *
 * This builder laid seven `PlaneGeometry(1, 1)` quads at descending opacity on
 * open water behind a departing hull: four straight opaque edges each, exactly
 * the class LAW 3 of `p16-port-lint.test.mjs` polices, and PM5A residual 3 /
 * PM6 residual 6 both named it and left it. It survived two lanes because it is
 * a RUNTIME builder — `logistics-anim` parents it to a moving hull about
 * twenty-five seconds into the beat — so a census taken on the built scene
 * never sees it. The lint walks the animation now (`RUNTIME_STOPS` in that
 * file), and this is the geometry it finds when it gets there.
 *
 * `featherQuadGeometry` is `ships.js`'s nine-vertex plate: white everywhere,
 * vertex ALPHA zero on the eight border vertices, so the plate dies out at its
 * own boundary and has no edge to find. The seven bands keep their descending
 * opacity and widening plan — that is the plume — and two narrow diverging arms
 * give the Kelvin V a shape a soft plume alone does not have.
 */
export function addDepartWake(len = 28, spread = 9) {
  const mats = kit();
  // Reuse the venue's finished froth texture: an untextured vertex feather
  // becomes a chain of white diamonds once it actually clears the sea pass.
  const foamAlpha = portTextures().foam;
  const g = new THREE.Group();
  g.name = 'fringe:port-anim-wake';
  const geom = featherQuadGeometry();
  const plate = (w, d, px, pz, opacity, yaw = 0) => {
    const m = new THREE.Mesh(geom, mats.foam.clone());
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = yaw;
    m.position.set(px, 0.05, pz);
    m.scale.set(w, d, 1);
    m.material.opacity = opacity;
    // Stable authored alpha survives the holder's per-frame hull fade.
    m.userData.departWakeOpacity = opacity;
    m.userData.departWakeDistance = Math.max(0, -px - 1.4);
    m.material.vertexColors = true;
    m.material.alphaMap = foamAlpha;
    m.renderOrder = waterOrder(5);
    m.material.needsUpdate = true;
    m.userData.ownsGeometry = false;
    noPick(m);
    g.add(m);
    return m;
  };
  for (let i = 0; i < 7; i += 1) {
    const t = i / 6;
    const d = 1.4 + t * len;
    const w = 2.2 + t * spread;
    plate(Math.max(6, w * 1.2), w * 0.45, -d, 0, 0.5 * (1 - t * 0.85));
  }
  // The two arms of the V, feathered like the bands and laid on the divergence
  // a hull of this size actually throws (about 19°, the Kelvin half-angle).
  for (const side of [-1, 1]) {
    plate(len * 0.92, 2.6, -len * 0.5, side * (2.2 + spread * 0.34), 0.30,
      side * 0.33);
  }
  // The plate geometry is shared and cached in `ships.js`; this group must not
  // dispose it, so nothing is declared owned here.
  g.userData.ownsSharedGeometry = null;
  return g;
}

export function disposeVehicle(root) {
  if (!root) return;
  const geos = new Set();
  const mats = new Set();
  root.traverse((ch) => {
    if (ch.userData?.ownsGeometry && ch.geometry) geos.add(ch.geometry);
    const list = Array.isArray(ch.material) ? ch.material : [ch.material];
    for (const m of list) if (m) mats.add(m);
  });
  if (root.userData?.ownsSharedGeometry) geos.add(root.userData.ownsSharedGeometry);
  for (const g of geos) g.dispose?.();
  for (const m of mats) m.dispose?.();
}
