// District Deck — presentation-only city services.
// Ambulance runs after construction accidents; bin day + rubbish truck every 4 quarters.
// Never writes simulation state.

import * as THREE from 'three';
import { CORRIDOR, PITCH, ROAD, TILE } from '../core/grid.js';
import { isBinDay } from '../core/construction-stages.js';
import { activeParcel, activeOrder } from '../core/city.js';
import { ARCHETYPES } from '../core/content.js';
// V3.70 L3 — the hospital dispatches a DRONE to construction accidents. The ambulance below is
// kept only as the no-hospital fallback: a drone launches from a pad, and with no hospital on the
// board there is no pad.
import { spawnMedicalDrone, HOSPITAL_DRONE_PAD } from './civic/medical-drone.js';
import { Kit } from './port/port-models.js';

/**
 * V-SERVICES (model lane): the switch for the services fleet rebuilt on the port Kit. 1 draws the ambulance
 * (a 6.9 m box-module ambulance in a red and yellow Battenburg), the council side-loader (9.6 x 2.5 x 3.5 m)
 * and the 240 L bins with red, yellow and lime lids at true size, smooth-shaded with baked contact occlusion,
 * round wheels that turn at v/r and beacons lit only on a call or while the arm works (emission only at night,
 * through `CityServicesLayer.setNight`). Every vehicle drives along its own +z. 0 restores the box builders and
 * their animation exactly. Browser: `?svcKit=0`; node: `DD_SVC_KIT=0`.
 */
export const SERVICES_KIT = (typeof process !== 'undefined' && process?.env?.DD_SVC_KIT !== undefined)
  ? (Number(process.env.DD_SVC_KIT) > 0 ? 1 : 0)
  : (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('svcKit') === '0' ? 0 : 1);

const svcParams = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
function svcTune(key, fallback, lo, hi) {
  const raw = svcParams.get(key);
  const n = raw === null || raw.trim() === '' ? NaN : Number(raw);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
}

/** Capture controls affect only the new kit; defaults are the round-1 predictions. */
export const SERVICE_TUNING = Object.freeze({
  svcSurfaceS: svcTune('svcSurfaceS', 1, 0.5, 1.6),
  svcAccentS: svcTune('svcAccentS', 0.9, 0.5, 1.2),
  svcEdge: svcTune('svcEdge', 1, 0.5, 1.8),
  svcWear: svcTune('svcWear', 0.16, 0, 0.3),
});

// HSV saturation is measured in sRGB, not Three's linear working space.
function serviceColour(hex, accent = false) {
  const c = new THREE.Color(hex).convertLinearToSRGB();
  const v = Math.max(c.r, c.g, c.b);
  const s = v ? (v - Math.min(c.r, c.g, c.b)) / v : 0;
  const target = accent ? Math.min(0.6, s * SERVICE_TUNING.svcAccentS)
    : Math.max(0.1, Math.min(0.29, s * SERVICE_TUNING.svcSurfaceS));
  const k = s > 0 ? target / s : 0;
  c.setRGB(v - (v - c.r) * k, v - (v - c.g) * k, v - (v - c.b) * k);
  return c.convertSRGBToLinear();
}

/** Kit's venue-sized bevel cutoff is too large for vehicle fittings. Keep this override lane-local. */
class ServiceKit extends Kit {
  strut(key, from, to, w, d, opts = {}) {
    return super.strut(key, from, to, w, d, { bevel: 0.015, ...opts });
  }

  box(key, cx, cy, cz, sx, sy, sz, { bevel, occ = 1 } = {}) {
    const small = Math.min(sx, sy, sz);
    const edge = bevel ?? (small >= 0.05 && Math.max(sx, sy, sz) >= 0.3 ? 0.035 : 0);
    const b = Math.min(edge * SERVICE_TUNING.svcEdge, small * 0.22);
    if (b < 1e-4) return super.box(key, cx, cy, cz, sx, sy, sz, { occ });
    const h = [sx / 2, sy / 2, sz / 2];
    const c = [cx, cy, cz];
    const face = (axis, signs) => signs.map((s, i) => c[i] + s * (h[i] - (axis === i ? 0 : b)));
    const o = { centre: c, occ };
    for (let axis = 0; axis < 3; axis += 1) {
      const u = (axis + 1) % 3; const v = (axis + 2) % 3;
      for (const side of [-1, 1]) {
        this.poly(key, [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, d]) => {
          const s = []; s[axis] = side; s[u] = a; s[v] = d; return face(axis, s);
        }), o);
      }
      for (const a of [-1, 1]) for (const d of [-1, 1]) {
        const lo = []; lo[axis] = a; lo[u] = d; lo[v] = -1;
        const hi = [...lo]; hi[v] = 1;
        this.poly(key, [face(axis, lo), face(axis, hi), face(u, hi), face(u, lo)], o);
      }
    }
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      this.poly(key, [0, 1, 2].map((a) => face(a, [x, y, z])), o);
    }
    return this;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

function hash32(text) {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

function unit(seed, salt) {
  return hash32(`${seed}|city-svc|${salt}`) / 0x100000000;
}

/**
 * The module's one standard-material constructor site (gate ruling 10, 29 Oct 2026): `mat`, `kmat` and the
 * services lab's ground and scale post build through it. The parameters pass straight through, and every
 * call returns a new instance that its caller owns, since `setLens` and the night pulse set colour and emission.
 */
export function serviceStandardMaterial(parameters = {}) {
  return new THREE.MeshStandardMaterial(parameters);
}

function mat(color, opts = {}) {
  return serviceStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.15,
    flatShading: true,
    emissive: opts.emissive ?? '#000000',
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    toneMapped: opts.toneMapped !== false,
  });
}

function boxMesh(w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Front of parcel → kerb / footpath edge for bins and residents. */
export function parcelKerbAnchor(parcel) {
  if (!parcel?.centre) return null;
  const rotDeg = parcel.rotation ?? 0;
  const yaw = (rotDeg * Math.PI) / 180;
  // 0° faces +Z (south). Walk toward the street frontage.
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const half = Math.max(
    4,
    ((parcel.placement?.envelopeMetres?.z
      ?? (parcel.groundFootprint?.[1] ?? 1) * TILE - 2) / 2),
  );
  const dist = half + 1.35;
  return {
    x: parcel.centre.x + fx * dist,
    z: parcel.centre.z + fz * dist,
    doorX: parcel.centre.x + fx * (half * 0.55),
    doorZ: parcel.centre.z + fz * (half * 0.55),
    yaw,
    fx,
    fz,
  };
}

/**
 * Where the drone pad sits in world space. `civicUses` entries carry `rotation` in degrees and a
 * `placement.modelOffset`, which is everything the transform needs — the pad offset is authored in
 * the hospital's own model space and rotates with the building.
 */
function hospitalPad(city) {
  const hospital = (city.civicUses ?? []).find((c) => c.useId === 'hospital-district');
  if (!hospital?.centre) return null;
  const yaw = ((hospital.rotation ?? 0) * Math.PI) / 180;
  const off = hospital.placement?.modelOffset ?? { x: 0, z: 0 };
  const P = HOSPITAL_DRONE_PAD;
  return {
    x: hospital.centre.x + off.x + Math.cos(yaw) * P.x + Math.sin(yaw) * P.z,
    z: hospital.centre.z + off.z - Math.sin(yaw) * P.x + Math.cos(yaw) * P.z,
    y: P.y,
  };
}

function hospitalCentre(city) {
  const hospital = (city.civicUses ?? []).find((c) => c.useId === 'hospital-district');
  return hospital?.centre ?? null;
}

/* ------------------------------------------------------------------ */
/* V-SERVICES: the services fleet on the port Kit (SERVICES_KIT = 1)    */
/* ------------------------------------------------------------------ */

/** Published dimensions each kit builder is held to (metres; L along +z, W across x, H up). */
export const SERVICE_DIMENSIONS = Object.freeze({
  // A Mercedes Sprinter box-module ambulance: 6.9 x 2.0 x 2.8 m over the lightbar, mirrors excluded.
  ambulance: Object.freeze({ L: 6.9, W: 2.0, H: 2.8, wheelR: 0.355 }),
  // A council side-loader on a low-entry cab: about 9.6 x 2.5 x 3.5 m, 22.5 in tyres, mirrors excluded.
  rubbishTruck: Object.freeze({ L: 9.6, W: 2.5, H: 3.5, wheelR: 0.52 }),
  // An AS 4123 240 L mobile garbage bin: 0.58 m wide, 0.73 m deep, 1.07 m to the lid.
  bin: Object.freeze({ L: 0.73, W: 0.58, H: 1.07, wheelR: 0.1 }),
});

/** Beacon lenses: the dim lens and the lit lens (daylight shows a lit lens by its colour; emission waits for night). */
const SVC_LENS = Object.freeze({
  red: Object.freeze({ dim: '#5a2e2a', lit: '#d06a5f' }),
  blue: Object.freeze({ dim: '#2a3a58', lit: '#6587c4' }),
  amber: Object.freeze({ dim: '#6b5632', lit: '#d4a95e' }),
});

/** Paint and trim, held to the plan: paint S 60 or less, metal 0.15 or less bar glass, roughness 0.55-0.95. */
const SVC_PAINT = Object.freeze({
  ambulanceWhite: '#e3d8c8',
  battenburgRed: '#a8524a',
  battenburgYellow: '#c4ad5c',
  cabWhite: '#ddd3c2',
  councilGreen: '#56705a',
  trim: '#3a3832',
  steel: '#7d898f',
  rim: '#9a9386',
  tyre: '#24211e',
  glass: '#1c2226',
  binBody: '#3d4640',
  binWheel: '#27251f',
  // Victorian lids: red general waste, yellow recycling, lime garden organics.
  binLids: Object.freeze(['#a8524a', '#c4ad5c', '#8ca055']),
});

function kmat(name, color, { roughness = 0.7, metalness = 0.04 } = {}) {
  const accent = /battenburg|marker|beacon|bin-lid/.test(name);
  const tuned = serviceColour(color, accent);
  const m = serviceStandardMaterial({
    color: tuned, roughness, metalness, vertexColors: true, emissive: '#000000', emissiveIntensity: 0,
  });
  m.name = `svc:${name}`;
  m.userData.serviceSurface = accent ? 'accent' : 'built';
  return m;
}

function emitSvcKit(parent, kit, mats, name, { shared = false } = {}) {
  const out = [];
  for (const [key, geo] of kit.geometries()) {
    const material = mats[key];
    if (!material) throw new Error(`city-services kit: no material '${key}' for ${name}`);
    // Road film stays in the lower body; no texture, new material or daytime light is required.
    if (['white', 'cab', 'body'].includes(key)) {
      const pos = geo.getAttribute('position');
      const col = geo.getAttribute('color');
      for (let i = 0; i < pos.count; i += 1) {
        const low = 1 - THREE.MathUtils.smoothstep(pos.getY(i), 0.3, 1.5);
        const film = 1 - SERVICE_TUNING.svcWear * low;
        col.setXYZ(i, col.getX(i) * film, col.getY(i) * film, col.getZ(i) * film);
      }
    }
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `${name}:${key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (shared) mesh.userData.sharedGeometry = true;
    parent.add(mesh);
    out.push(mesh);
  }
  return out;
}

const SVC_WHEEL_GEO = new Map();

/**
 * One wheel's geometry (keys `tyre`, `rim`), axle along x with the outer face at +x, centred on the axle. A dual
 * rear pair is one lathe with a groove down the middle. Five dark slots in the rim make the spin visible. No
 * height occlusion is baked, since the wheel turns.
 */
function svcWheelGeometries(R, W, { dual = false, seg = 14 } = {}) {
  const id = `${R}|${W}|${dual ? 1 : 0}|${seg}`;
  let geos = SVC_WHEEL_GEO.get(id);
  if (geos) return geos;
  const k = new ServiceKit('wheel', { baseY: 0, fade: 1, floor: 1 });
  const h = W / 2;
  k.push(0, 0, 0, { rz: -Math.PI / 2 });
  const tyre = dual
    ? [[0.66 * R, -h], [R, -0.8 * h], [R, -0.1 * h], [0.94 * R, 0], [R, 0.1 * h], [R, 0.8 * h], [0.66 * R, h]]
    : [[0.66 * R, -h], [R, -0.72 * h], [R, 0.72 * h], [0.66 * R, h]];
  k.lathe('tyre', tyre, 0, 0, 0, seg);
  k.lathe('rim', [[0.66 * R, 0.94 * h], [0.3 * R, 0.52 * h], [0, 0.66 * h]], 0, 0, 0, seg);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const t = 0.055 * R;
    const y = 0.62 * h;
    const r0 = 0.36 * R;
    const r1 = 0.5 * R;
    k.poly('tyre', [
      [c * r0 - s * t, y, s * r0 + c * t], [c * r1 - s * t, y, s * r1 + c * t],
      [c * r1 + s * t, y, s * r1 - c * t], [c * r0 + s * t, y, s * r0 - c * t],
    ], { normal: up });
  }
  k.pop();
  geos = k.geometries();
  SVC_WHEEL_GEO.set(id, geos);
  return geos;
}

/** A turning wheel: a pivot on the axle (it spins about its own x), the wheel meshes inside it. */
function addSvcWheel(group, mats, x, z, R, W, opts = {}) {
  const side = x < 0 ? -1 : 1;
  const pivot = new THREE.Group();
  pivot.name = 'svc-wheel';
  pivot.position.set(x, R, z);
  pivot.userData.radius = R;
  for (const [key, geo] of svcWheelGeometries(R, W, opts)) {
    const mesh = new THREE.Mesh(geo, mats[key]);
    mesh.name = `wheel:${key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.sharedGeometry = true;
    if (side < 0) mesh.rotation.y = Math.PI;
    pivot.add(mesh);
  }
  group.add(pivot);
  group.userData.wheels.push(pivot);
  return pivot;
}

/** Roll every wheel of a kit vehicle by `distance` metres travelled along +z: angle = distance / radius. */
function rollSvcWheels(group, distance) {
  for (const p of group.userData.wheels ?? []) p.rotation.x += distance / p.userData.radius;
}

/** Points of a wheel arch in (z, y), from rear to front over the top, for a side profile. */
function archPoints(zc, yc, r, yBase, forward = true) {
  const t0 = Math.asin(Math.min(1, Math.max(-1, (yBase - yc) / r)));
  const out = [];
  const steps = 7;
  for (let i = 0; i < steps; i += 1) {
    const th = Math.PI - t0 - ((Math.PI - 2 * t0) * i) / (steps - 1);
    out.push([zc + r * Math.cos(th), yc + r * Math.sin(th)]);
  }
  return forward ? out : out.reverse();
}

/** Round the corners at `which` (indices) of a 2D profile with a quadratic curve of `segs` points, `r` metres along each edge. */
function fillet(pts, which, r, segs = 4) {
  r *= SERVICE_TUNING.svcEdge;
  const out = [];
  for (let i = 0; i < pts.length; i += 1) {
    if (!which.includes(i)) { out.push(pts[i]); continue; }
    const P = pts[i];
    const A0 = pts[(i - 1 + pts.length) % pts.length];
    const B0 = pts[(i + 1) % pts.length];
    const la = Math.hypot(A0[0] - P[0], A0[1] - P[1]);
    const lb = Math.hypot(B0[0] - P[0], B0[1] - P[1]);
    const ta = Math.min(r / la, 0.45);
    const tb = Math.min(r / lb, 0.45);
    const A = [P[0] + (A0[0] - P[0]) * ta, P[1] + (A0[1] - P[1]) * ta];
    const B = [P[0] + (B0[0] - P[0]) * tb, P[1] + (B0[1] - P[1]) * tb];
    for (let j = 0; j <= segs; j += 1) {
      const u = j / segs;
      const a = (1 - u) * (1 - u);
      const b = 2 * u * (1 - u);
      const c = u * u;
      out.push([a * A[0] + b * P[0] + c * B[0], a * A[1] + b * P[1] + c * B[1]]);
    }
  }
  return out;
}

/** A flare strip round a wheel arch on both flanks, `x` the flank. */
function archFlare(k, key, zc, yc, r, yBase, x) {
  const pts = archPoints(zc, yc, r + 0.03, yBase);
  for (const s of [-1, 1]) {
    for (let i = 0; i < pts.length - 1; i += 1) {
      k.strut(key, [s * (x + 0.005), pts[i][1], pts[i][0]], [s * (x + 0.005), pts[i + 1][1], pts[i + 1][0]], 0.05, 0.08);
    }
  }
}

/** A flat quad on a flank (x = s * X), from (z0, y0) to (z1, y1), facing out. */
function flankQuad(k, key, s, X, z0, y0, z1, y1) {
  k.poly(key, [[s * X, y0, z0], [s * X, y0, z1], [s * X, y1, z1], [s * X, y1, z0]], { normal: new THREE.Vector3(s, 0, 0) });
}

/** A flat quad on an end face (z = Z, facing `dir` = +1 or -1), from (x0, y0) to (x1, y1). */
function endQuad(k, key, Z, dir, x0, y0, x1, y1) {
  k.poly(key, [[x0, y0, Z], [x1, y0, Z], [x1, y1, Z], [x0, y1, Z]], { normal: new THREE.Vector3(0, 0, dir) });
}

/** Rubber glazing gasket, proud of the paint by millimetres, with a rounded edge near the camera. */
function svcWindow(k, points, normal) {
  k.poly('glass', points, { normal });
  for (let i = 0; i < points.length; i += 1) {
    k.strut('trim', points[i], points[(i + 1) % points.length], 0.03, 0.025);
  }
}

/** Beacon lens state: `lit` 0 or 1; emission only at night. */
function setLens(material, lens, lit, night) {
  material.color.copy(serviceColour(lit ? lens.lit : lens.dim, true));
  material.emissive.copy(serviceColour(lens.lit, true));
  material.emissiveIntensity = lit && night > 0 ? 1.1 * night : 0;
}

function buildAmbulanceKit() {
  const D = SERVICE_DIMENSIONS.ambulance;
  const group = new THREE.Group();
  group.name = 'city-services:ambulance';
  group.userData.svcKit = true;
  group.userData.wheels = [];
  const mats = {
    white: kmat('ambulance-white', SVC_PAINT.ambulanceWhite, { roughness: 0.6 }),
    red: kmat('battenburg-red', SVC_PAINT.battenburgRed, { roughness: 0.62 }),
    yellow: kmat('battenburg-yellow', SVC_PAINT.battenburgYellow, { roughness: 0.62 }),
    trim: kmat('trim', SVC_PAINT.trim, { roughness: 0.82 }),
    glass: kmat('glass', SVC_PAINT.glass, { roughness: 0.55, metalness: 0.1 }),
    tyre: kmat('tyre', SVC_PAINT.tyre, { roughness: 0.92, metalness: 0 }),
    rim: kmat('rim', SVC_PAINT.rim, { roughness: 0.62, metalness: 0.12 }),
    beaconRed: kmat('beacon-red', SVC_LENS.red.dim, { roughness: 0.55 }),
    beaconBlue: kmat('beacon-blue', SVC_LENS.blue.dim, { roughness: 0.55 }),
  };
  const R = D.wheelR;
  const zF = 2.35;
  const zR = -1.98;
  const k = new ServiceKit('ambulance', { baseY: 0, fade: 0.95, floor: 0.66 });

  // Cab: one side profile with the front arch, nose, bonnet and raked windscreen.
  {
    const nose = [[3.36, 0.42], [3.42, 0.98], [3.2, 1.16], [2.3, 1.38], [1.3, 2.22], [1.05, 2.33], [0.85, 2.34]];
    k.prism('white', [[0.85, 0.42], ...archPoints(zF, R, 0.48, 0.42), ...fillet(nose, [1, 2, 3, 4, 5], 0.16, 3)], 'x', -1.0, 1.0);
  }
  // Box module, chamfered along its roof edges, and the skirt under it with the rear arch.
  k.prism('white', fillet([[-1.0, 0.95], [1.0, 0.95], [1.0, 2.62], [-1.0, 2.62]], [2, 3], 0.16, 4), 'z', -3.45, 0.85);
  // The module's rear vertical corners carry rubbing strips, which also hide the prism's hard corner.
  for (const s of [-1, 1]) k.stand('trim', s * 0.985, 0.95, -3.43, 0.05, 1.55, 0.05);
  k.prism('white', [[-3.45, 0.45], ...archPoints(zR, R, 0.48, 0.45), [0.85, 0.45], [0.85, 0.96], [-3.45, 0.96]], 'x', -0.98, 0.98);
  archFlare(k, 'trim', zF, R, 0.48, 0.42, 1.0);
  archFlare(k, 'trim', zR, R, 0.48, 0.45, 0.98);

  // Glass: windscreen on the rake, cab side windows, the module's side and rear windows.
  {
    const n = new THREE.Vector3(0, 0.766, 0.643);
    const P = (t) => [2.3 - t * 1.0 + 0.008 * 0.643, 1.38 + t * 0.84 + 0.008 * 0.766];
    const [a, b] = [P(0.06), P(0.93)];
    svcWindow(k, [[-0.88, a[1], a[0]], [0.88, a[1], a[0]], [0.84, b[1], b[0]], [-0.84, b[1], b[0]]], n);
  }
  for (const s of [-1, 1]) {
    svcWindow(k, [[s * 1.004, 1.45, 0.95], [s * 1.004, 1.45, 2.12], [s * 1.004, 2.15, 1.29], [s * 1.004, 2.15, 0.95]], new THREE.Vector3(s, 0, 0));
    svcWindow(k, [[s * 1.004, 1.82, -0.5], [s * 1.004, 1.82, 0.35], [s * 1.004, 2.28, 0.35], [s * 1.004, 2.28, -0.5]], new THREE.Vector3(s, 0, 0));
    // Battenburg: two rows of alternating red and yellow along the module and one row on the cab door.
    const cols = 8;
    const z0 = -3.4;
    const w = (0.8 - z0) / cols;
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < 2; r += 1) {
        flankQuad(k, (c + r) % 2 ? 'yellow' : 'red', s, 1.004, z0 + c * w, 1.0 + r * 0.3, z0 + (c + 1) * w, 1.3 + r * 0.3);
      }
    }
    for (let c = 0; c < 3; c += 1) flankQuad(k, c % 2 ? 'red' : 'yellow', s, 1.004, 0.92 + c * 0.42, 1.0, 1.34 + c * 0.42, 1.3);
    flankQuad(k, 'red', s, 1.004, -3.4, 2.3, 0.8, 2.4);
    // Door seams, the module's locker outlines, handles and the scene light.
    for (const z of [0.92, 2.12]) k.stand('trim', s * 1.004, 0.55, z, 0.008, 0.85, 0.02);
    for (const z of [-0.55, 0.4]) k.stand('trim', s * 1.004, 0.98, z, 0.008, 1.52, 0.02);
    for (const z of [-2.2, -1.25]) k.stand('trim', s * 1.004, 1.62, z, 0.008, 0.6, 0.02);
    k.stand('trim', s * 1.004, 2.22, -1.72, 0.008, 0.02, 0.98);
    k.stand('trim', s * 1.012, 1.42, 1.85, 0.03, 0.04, 0.16);
    k.stand('trim', s * 1.012, 1.55, 0.2, 0.03, 0.04, 0.16);
    k.stand('rim', s * 1.0, 2.44, -0.9, 0.04, 0.09, 0.55, { bevel: 0.01 });
    // Side step under the door, mudflaps behind the wheels, the indicator repeater on the cab.
    k.stand('trim', s * 0.9, 0.32, -0.08, 0.22, 0.05, 1.0);
    k.stand('trim', s * 0.84, 0.1, zR - 0.62, 0.24, 0.32, 0.02);
    k.stand('trim', s * 0.84, 0.1, zF - 0.6, 0.24, 0.3, 0.02);
    k.stand('yellow', s * 1.005, 0.95, 2.75, 0.01, 0.05, 0.1);
  }
  // Nose: bumper, grille, headlamps, grille beacons and the bonnet's badge-free face.
  k.stand('trim', 0, 0.26, 3.36, 2.0, 0.42, 0.26, { bevel: 0.06 });
  k.stand('trim', 0, 0.68, 3.43, 1.1, 0.3, 0.04);
  for (let i = 0; i < 4; i += 1) k.stand('rim', 0, 0.71 + i * 0.065, 3.452, 1.0, 0.018, 0.012);
  for (const s of [-1, 1]) {
    k.stand('rim', s * 0.7, 0.9, 3.33, 0.44, 0.16, 0.12, { bevel: 0.02 });
    k.cyl('rim', s * 0.72, 0.4, 3.49, 0.05, 0.05, 0.02, 10, { axis: 'z' });
    k.strut('trim', [s * 0.05, 1.43, 2.25], [s * 0.62, 1.47, 2.2], 0.02, 0.02);
  }
  k.stand('rim', 0, 0.3, 3.495, 0.52, 0.12, 0.01);
  k.stand('beaconRed', -0.3, 0.74, 3.455, 0.16, 0.06, 0.02);
  k.stand('beaconBlue', 0.3, 0.74, 3.455, 0.16, 0.06, 0.02);
  // Tail: doors with their split and windows, tail lamps, step bumper, roof-corner beacons.
  for (const s of [-1, 1]) {
    endQuad(k, 'glass', -3.454, -1, s * 0.12, 1.82, s * 0.78, 2.3);
    endQuad(k, 'red', -3.454, -1, s * 0.84, 1.0, s * 0.96, 1.72);
    for (let r = 0; r < 2; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        endQuad(k, (c + r) % 2 ? 'red' : 'yellow', -3.454, -1, s * (0.12 + c * 0.24), 1.0 + r * 0.3, s * (0.36 + c * 0.24), 1.3 + r * 0.3);
      }
    }
    k.stand('trim', s * 0.5, 1.62, -3.47, 0.14, 0.04, 0.04);
  }
  k.stand('trim', 0, 0.98, -3.456, 0.02, 1.6, 0.012);
  for (const s of [-1, 1]) {
    for (const y of [1.1, 1.75, 2.35]) k.stand('trim', s * 0.93, y, -3.47, 0.06, 0.1, 0.03);
    k.strut('trim', [s * 0.985, 1.0, -3.49], [s * 0.985, 2.2, -3.49], 0.025, 0.025);
    for (const z of [-3.1, -2.2, -1.0, 0.1]) k.stand('yellow', s * 1.004, 0.99, z, 0.01, 0.05, 0.07);
  }
  k.cyl('trim', 0.55, 0.28, -3.3, 0.04, 0.04, 0.4, 8, { axis: 'z' });
  k.stand('trim', 0, 0.3, -3.47, 1.96, 0.22, 0.14, { bevel: 0.04 });
  k.stand('trim', 0, 0.36, -3.53, 1.2, 0.05, 0.12);
  k.stand('beaconRed', -0.8, 2.62, -3.32, 0.22, 0.1, 0.14);
  k.stand('beaconBlue', 0.8, 2.62, -3.32, 0.22, 0.1, 0.14);
  // Roof: the air conditioner on the module and the lightbar on its front edge.
  k.stand('white', 0, 2.62, -1.8, 1.2, 0.16, 1.3, { bevel: 0.05 });
  k.stand('trim', 0, 2.62, 0.55, 1.56, 0.06, 0.34, { bevel: 0.02 });
  for (let i = 0; i < 6; i += 1) {
    k.stand(i < 3 ? 'beaconRed' : 'beaconBlue', -0.65 + i * 0.26, 2.68, 0.55, 0.24, 0.12, 0.3, { bevel: 0.02 });
  }
  for (const s of [-1, 1]) k.stand('trim', s * 0.8, 2.66, 0.55, 0.06, 0.14, 0.32);
  // Roof rails on the module, a vent pair on the conditioner.
  for (const s of [-1, 1]) {
    k.strut('trim', [s * 0.72, 2.7, -3.2], [s * 0.72, 2.7, 0.3], 0.03, 0.03);
    for (const z of [-3.1, -1.4, 0.2]) k.stand('trim', s * 0.72, 2.62, z, 0.04, 0.08, 0.04);
  }
  for (let i = 0; i < 4; i += 1) k.stand('trim', 0, 2.78, -2.3 + i * 0.32, 0.9, 0.012, 0.06);
  k.cyl('trim', 0.3, 2.34, 1.0, 0.008, 0.012, 0.3, 4);
  // Undertray between the wheels, so the gap reads as shadow and never as sky.
  k.stand('trim', 0, 0.16, 0.2, 1.44, 0.28, 5.8);
  emitSvcKit(group, k, mats, 'ambulance');

  // Mirrors stand outside the declared width, so they sit in their own kit (same material).
  const m = new ServiceKit('ambulance-mirrors', { baseY: 0, fade: 0.95, floor: 0.66 });
  for (const s of [-1, 1]) {
    m.strut('trim', [s * 0.99, 1.95, 2.05], [s * 1.16, 1.98, 2.1], 0.04, 0.04);
    m.stand('trim', s * 1.19, 1.62, 2.1, 0.06, 0.42, 0.2, { bevel: 0.02 });
  }
  for (const mesh of emitSvcKit(group, m, mats, 'ambulance-mirrors')) mesh.userData.outsideDeclared = true;

  for (const [x, z] of [[-0.86, zF], [0.86, zF], [-0.86, zR], [0.86, zR]]) addSvcWheel(group, mats, x, z, R, 0.235);

  const lenses = { red: mats.beaconRed, blue: mats.beaconBlue };
  group.userData.mats = mats;
  // On a call the bar alternates red and blue; daylight shows it by the lit lens alone.
  group.userData.beacons = (elapsed, night = 0, on = true) => {
    const phase = Math.sin(elapsed * 10) > 0;
    setLens(lenses.red, SVC_LENS.red, on && phase, night);
    setLens(lenses.blue, SVC_LENS.blue, on && !phase, night);
  };
  // The casualty is walked from the kerb-side door to the rear doors.
  group.userData.load = { from: [1.45, 0, 0.3], to: [0, 0.35, -3.8] };
  group.userData.roll = (d) => rollSvcWheels(group, d);
  return group;
}

function buildRubbishTruckKit() {
  const D = SERVICE_DIMENSIONS.rubbishTruck;
  const group = new THREE.Group();
  group.name = 'city-services:rubbish-truck';
  group.userData.svcKit = true;
  group.userData.wheels = [];
  const mats = {
    cab: kmat('cab-white', SVC_PAINT.cabWhite, { roughness: 0.6 }),
    body: kmat('council-green', SVC_PAINT.councilGreen, { roughness: 0.66 }),
    trim: kmat('trim', SVC_PAINT.trim, { roughness: 0.82 }),
    steel: kmat('steel', SVC_PAINT.steel, { roughness: 0.6, metalness: 0.12 }),
    red: kmat('marker-red', SVC_PAINT.battenburgRed, { roughness: 0.62 }),
    glass: kmat('glass', SVC_PAINT.glass, { roughness: 0.55, metalness: 0.1 }),
    tyre: kmat('tyre', SVC_PAINT.tyre, { roughness: 0.92, metalness: 0 }),
    rim: kmat('rim', SVC_PAINT.rim, { roughness: 0.62, metalness: 0.12 }),
    beacon: kmat('beacon-amber', SVC_LENS.amber.dim, { roughness: 0.55 }),
  };
  const R = D.wheelR;
  const zF = 3.9;
  const zR = [-1.2, -2.55];
  const k = new ServiceKit('rubbish-truck', { baseY: 0, fade: 1.1, floor: 0.64 });

  // Low-entry cab: side profile with the front arch, the near-upright windscreen and the roof.
  k.prism('cab', [
    [2.45, 0.62], ...archPoints(zF, R, 0.66, 0.62),
    ...fillet([[4.7, 0.62], [4.74, 1.55], [4.66, 2.8], [4.5, 3.0], [2.45, 3.0]], [1, 2, 3, 4], 0.14, 3),
  ], 'x', -1.25, 1.25);
  archFlare(k, 'trim', zF, R, 0.66, 0.62, 1.25);
  {
    const n = new THREE.Vector3(0, 0.064, 0.998);
    svcWindow(k, [[-1.08, 1.62, 4.736], [1.08, 1.62, 4.736], [1.08, 2.74, 4.666], [-1.08, 2.74, 4.666]], n);
  }
  k.stand('trim', 0, 0.8, 4.72, 1.7, 0.6, 0.06);
  for (let i = 0; i < 5; i += 1) k.stand('steel', 0, 0.85 + i * 0.1, 4.756, 1.4, 0.022, 0.016);
  for (const s of [-1, 1]) k.strut('trim', [s * 0.1, 1.66, 4.744], [s * 0.85, 1.72, 4.74], 0.025, 0.025);
  for (const s of [-1, 1]) k.stand('rim', s * 0.96, 0.84, 4.72, 0.36, 0.2, 0.08, { bevel: 0.02 });
  k.stand('trim', 0, 0.3, 4.62, 2.46, 0.4, 0.32, { bevel: 0.06 });
  k.stand('cab', 0, 2.98, 3.5, 2.3, 0.1, 1.6, { bevel: 0.04 });
  for (const s of [-1, 1]) {
    // Glazed kerb door behind the front wheel, the side glass over the arch, steps and grab rail.
    svcWindow(k, [[s * 1.254, 1.05, 2.58], [s * 1.254, 1.05, 3.12], [s * 1.254, 2.78, 3.12], [s * 1.254, 2.78, 2.58]], new THREE.Vector3(s, 0, 0));
    svcWindow(k, [[s * 1.254, 1.92, 3.3], [s * 1.254, 1.92, 4.48], [s * 1.254, 2.78, 4.48], [s * 1.254, 2.78, 3.3]], new THREE.Vector3(s, 0, 0));
    for (const z of [2.5, 3.2]) k.stand('trim', s * 1.254, 0.65, z, 0.008, 2.3, 0.02);
    k.stand('trim', s * 1.18, 0.3, 2.85, 0.16, 0.05, 0.6);
    k.stand('steel', s * 1.27, 1.2, 2.47, 0.03, 1.3, 0.03);
    k.stand('beacon', s * 0.95, 3.08, 2.62, 0.18, 0.14, 0.18, { bevel: 0.03 });
    k.stand('red', s * 1.255, 0.92, 4.3, 0.01, 0.06, 0.14);
  }

  // Chassis: rails, cross members, the offside fuel tank, battery box and the side underrun guards.
  for (const s of [-1, 1]) k.stand('trim', s * 0.5, 0.72, -1.0, 0.18, 0.3, 7.2);
  for (const z of [-4.1, -3.2, -0.3, 1.2]) k.stand('trim', 0, 0.76, z, 0.84, 0.18, 0.16);
  k.cyl('steel', -1.0, 0.82, 0.9, 0.28, 0.28, 1.2, 12, { axis: 'z' });
  k.stand('trim', 1.0, 0.55, 0.2, 0.42, 0.45, 0.7, { bevel: 0.03 });
  for (const s of [-1, 1]) {
    for (const y of [0.42, 0.66]) k.stand('steel', s * 1.18, y, -0.55, 0.05, 0.1, 0.9);
  }
  for (const z of zR) k.box('trim', 0, R, z, 1.4, 0.16, 0.16);
  k.box('trim', 0, R, zF, 1.8, 0.14, 0.14);

  // Compactor body: chamfered section, ribbed flanks, hopper mouth and the lifting-arm housing.
  k.prism('body', fillet([[-1.2, 1.1], [1.2, 1.1], [1.2, 3.5], [-1.2, 3.5]], [2, 3], 0.34, 5), 'z', -4.15, 1.75);
  // Marker lamps along the body's foot, every metre or so.
  for (const s of [-1, 1]) {
    for (let z = -3.6; z <= 1.3; z += 1.22) k.stand('beacon', s * 1.205, 1.18, z, 0.012, 0.06, 0.1);
  }
  for (const s of [-1, 1]) {
    for (let z = -3.8; z <= 0.9; z += 0.67) k.stand('body', s * 1.215, 1.16, z, 0.03, 1.98, 0.09);
    k.stand('trim', s * 1.215, 1.12, -0.9, 0.03, 0.1, 6.4);
    k.stand('red', s * 1.206, 1.3, -3.95, 0.012, 0.05, 0.3);
  }
  // Hopper: a raised mouth at the body's front, open on top, its throat dark.
  k.stand('body', 0, 3.3, 1.38, 2.3, 0.26, 0.74, { bevel: 0.04 });
  k.poly('trim', [[-0.6, 3.565, 1.1], [0.95, 3.565, 1.1], [0.95, 3.565, 1.66], [-0.6, 3.565, 1.66]], { normal: new THREE.Vector3(0, 1, 0) });
  // The arm's bay between cab and body: a back wall and the column's mount.
  k.stand('trim', 0, 1.1, 1.8, 2.2, 1.6, 0.1);
  k.stand('steel', 0, 3.5, -1.2, 1.6, 0.04, 0.08);
  for (const s of [-1, 1]) k.stand('beacon', s * 0.85, 3.5, -4.0, 0.16, 0.12, 0.16);

  // Tailgate: rounded top, hinge, rams, lamps, rear markings in red and white and the underrun bar.
  k.prism('body', [[-4.15, 1.0], [-4.15, 3.5], [-4.45, 3.46], [-4.68, 3.2], [-4.8, 2.6], [-4.8, 1.0]], 'x', -1.18, 1.18);
  k.cyl('steel', 0, 3.47, -4.15, 0.07, 0.07, 2.3, 10, { axis: 'x' });
  for (const s of [-1, 1]) {
    k.strut('steel', [s * 1.235, 1.45, -3.7], [s * 1.235, 3.15, -4.12], 0.06, 0.1);
    k.stand('red', s * 0.95, 1.12, -4.805, 0.24, 0.2, 0.01);
  }
  for (let i = 0; i < 10; i += 1) {
    const x0 = -1.15 + i * 0.23;
    const key = i % 2 ? 'cab' : 'red';
    k.poly(key, [[x0, 1.4, -4.803], [x0 + 0.23, 1.4, -4.803], [x0 + 0.38, 1.75, -4.803], [x0 + 0.15, 1.75, -4.803]], { normal: new THREE.Vector3(0, 0, -1) });
  }
  k.stand('steel', 0, 0.42, -4.72, 2.3, 0.15, 0.14);
  for (const s of [-1, 1]) {
    k.stand('trim', s * 0.93, 0.18, -3.3, 0.6, 0.42, 0.02);
    k.stand('trim', s * 0.93, 1.06, -1.875, 0.66, 0.06, 2.75);
  }
  emitSvcKit(group, k, mats, 'rubbish-truck');

  const m = new ServiceKit('rubbish-truck-mirrors', { baseY: 0, fade: 1.1, floor: 0.64 });
  for (const s of [-1, 1]) {
    m.strut('trim', [s * 1.24, 2.5, 4.4], [s * 1.42, 2.55, 4.6], 0.05, 0.05);
    m.stand('trim', s * 1.45, 2.0, 4.6, 0.07, 0.6, 0.24, { bevel: 0.02 });
  }
  for (const mesh of emitSvcKit(group, m, mats, 'rubbish-truck-mirrors')) mesh.userData.outsideDeclared = true;

  // Side-lift arm behind the cab: root (mirrored to the bin's side), boom about z, telescopic reach, claw.
  const armRoot = new THREE.Group();
  armRoot.name = 'arm';
  armRoot.position.set(0.3, 1.15, 2.1);
  const base = new ServiceKit('arm-base', { baseY: -1.15, fade: 1.1, floor: 0.64 });
  base.stand('steel', 0.05, -0.15, 0, 0.3, 0.55, 0.5, { bevel: 0.04 });
  base.cyl('trim', 0.15, 0.32, 0, 0.12, 0.12, 0.56, 12, { axis: 'z' });
  emitSvcKit(armRoot, base, mats, 'arm-base');
  const boom = new THREE.Group();
  boom.name = 'boom';
  boom.position.set(0.15, 0.32, 0);
  const boomKit = new ServiceKit('arm-boom', { baseY: -1.5, fade: 1, floor: 1 });
  boomKit.stand('steel', 0.35, -0.12, 0, 0.7, 0.24, 0.26, { bevel: 0.03 });
  boomKit.cyl('trim', 0.3, -0.2, 0, 0.05, 0.05, 0.5, 8, { axis: 'x' });
  emitSvcKit(boom, boomKit, mats, 'arm-boom');
  const reach = new THREE.Group();
  reach.name = 'reach';
  const reachKit = new ServiceKit('arm-reach', { baseY: -1.5, fade: 1, floor: 1 });
  reachKit.stand('trim', 0.62, -0.09, 0, 0.65, 0.18, 0.2);
  reachKit.stand('steel', 0.95, -0.2, 0, 0.16, 0.36, 0.66, { bevel: 0.02 });
  emitSvcKit(reach, reachKit, mats, 'arm-reach');
  const claw = new THREE.Group();
  claw.name = 'claw';
  claw.position.set(1.05, -0.18, 0);
  for (const s of [-1, 1]) {
    const finger = new THREE.Group();
    finger.name = s < 0 ? 'finger-a' : 'finger-b';
    finger.position.set(0, 0, s * 0.3);
    const fk = new ServiceKit('arm-finger', { baseY: -1.5, fade: 1, floor: 1 });
    fk.stand('steel', 0.02, -0.6, 0, 0.06, 0.6, 0.05);
    fk.stand('trim', 0.1, -0.5, -s * 0.03, 0.18, 0.16, 0.05);
    emitSvcKit(finger, fk, mats, 'arm-finger');
    claw.add(finger);
  }
  reach.add(claw);
  boom.add(reach);
  armRoot.add(boom);
  group.add(armRoot);

  addSvcWheel(group, mats, -1.03, zF, R, 0.3);
  addSvcWheel(group, mats, 1.03, zF, R, 0.3);
  for (const z of zR) {
    addSvcWheel(group, mats, -0.93, z, R, 0.6, { dual: true });
    addSvcWheel(group, mats, 0.93, z, R, 0.6, { dual: true });
  }

  group.userData.mats = mats;
  group.userData.beacons = (elapsed, night = 0, on = false) => {
    setLens(mats.beacon, SVC_LENS.amber, on && Math.sin(elapsed * 8) > 0, night);
  };
  group.userData.roll = (d) => rollSvcWheels(group, d);
  /** Pose the arm for `lift` 0..1 on `side` (+1 kerb side +x, -1 the other); returns the claw object. */
  group.userData.poseArm = (lift, side = 1) => {
    armRoot.position.x = side * 0.3;
    armRoot.rotation.y = side < 0 ? Math.PI : 0;
    const out = lift <= 0 || lift >= 1 ? 0 : Math.min(1, lift / 0.22, (1 - lift) / 0.1);
    const raise = lift < 0.3 ? 0 : lift < 0.6 ? (lift - 0.3) / 0.3 : lift < 0.72 ? 1 : lift < 0.9 ? 1 - (lift - 0.72) / 0.18 : 0;
    const ease = (x) => x * x * (3 - 2 * x);
    reach.position.x = -0.45 + ease(Math.max(0, out)) * 1.3;
    boom.rotation.z = ease(raise) * 1.85 + (lift > 0.6 && lift < 0.72 ? Math.sin(lift * 160) * 0.04 : 0);
    const grip = lift > 0.22 && lift < 0.92 ? 1 : 0;
    for (const f of claw.children) f.rotation.x = (f.name === 'finger-a' ? 1 : -1) * (1 - grip) * 0.35;
    return { claw, raise: ease(raise), out };
  };
  group.userData.poseArm(0, 1);
  return group;
}

const SVC_BIN_GEO = new Map();
let SVC_BIN_MATS = null;

function svcBinMats() {
  if (SVC_BIN_MATS) return SVC_BIN_MATS;
  SVC_BIN_MATS = {
    body: kmat('bin-body', SVC_PAINT.binBody, { roughness: 0.74 }),
    wheel: kmat('bin-wheel', SVC_PAINT.binWheel, { roughness: 0.9, metalness: 0 }),
    lids: SVC_PAINT.binLids.map((c, i) => kmat(`bin-lid-${i}`, c, { roughness: 0.7 })),
  };
  return SVC_BIN_MATS;
}

/** A 240 L bin: tapered body, rim, rear wheels on an axle, handle, lift lip; the lid hinges at the back. */
function svcBinGeometries() {
  if (SVC_BIN_GEO.size) return SVC_BIN_GEO;
  const D = SERVICE_DIMENSIONS.bin;
  const k = new ServiceKit('bin', { baseY: 0, fade: 0.5, floor: 0.7 });
  const y0 = 0.05;
  const y1 = 1.01;
  const b = { x: 0.24, zf: 0.24, zb: -0.3 };
  const t = { x: 0.28, zf: 0.32, zb: -0.31 };
  const v = [
    [-b.x, y0, b.zb], [b.x, y0, b.zb], [b.x, y0, b.zf], [-b.x, y0, b.zf],
    [-t.x, y1, t.zb], [t.x, y1, t.zb], [t.x, y1, t.zf], [-t.x, y1, t.zf],
  ];
  const C = [0, 0.5, 0.02];
  for (const f of [[0, 1, 2, 3], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) k.poly('body', f.map((i) => v[i]), { centre: C });
  k.stand('body', 0, y1 - 0.04, 0.015, 0.6, 0.05, 0.7);
  k.stand('body', 0, 0.8, t.zf - 0.01, 0.46, 0.08, 0.06);
  k.stand('body', 0, 0.97, -0.355, 0.5, 0.04, 0.05);
  for (const s of [-1, 1]) k.stand('body', s * 0.23, 0.89, -0.34, 0.04, 0.12, 0.05);
  k.cyl('wheel', 0, D.wheelR, -0.28, 0.02, 0.02, 0.5, 6, { axis: 'x' });
  for (const s of [-1, 1]) k.cyl('wheel', s * 0.255, D.wheelR, -0.28, D.wheelR, D.wheelR, 0.05, 12, { axis: 'x' });
  for (const [key, geo] of k.geometries()) SVC_BIN_GEO.set(key, geo);
  // The lid, in the hinge's frame (hinge on the back edge at the rim's top).
  const lid = new ServiceKit('bin-lid', { baseY: -1, fade: 1, floor: 1 });
  lid.stand('lid', 0, 0, 0.345, 0.6, 0.06, 0.7);
  lid.stand('lid', 0, -0.06, 0.69, 0.56, 0.06, 0.03);
  for (const [key, geo] of lid.geometries()) SVC_BIN_GEO.set(`lid:${key}`, geo);
  return SVC_BIN_GEO;
}

function buildBinKit(lidIndex = 0) {
  const geos = svcBinGeometries();
  const mats = svcBinMats();
  const group = new THREE.Group();
  group.name = 'city-services:bin';
  group.userData.svcKit = true;
  for (const key of ['body', 'wheel']) {
    const mesh = new THREE.Mesh(geos.get(key), mats[key]);
    mesh.name = `bin:${key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.sharedGeometry = true;
    group.add(mesh);
  }
  const lid = new THREE.Group();
  lid.name = 'lid';
  lid.position.set(0, 1.01, -0.34);
  const lidMesh = new THREE.Mesh(geos.get('lid:lid'), mats.lids[((lidIndex % 3) + 3) % 3]);
  lidMesh.name = 'bin:lid';
  lidMesh.castShadow = true;
  lidMesh.receiveShadow = true;
  lidMesh.userData.sharedGeometry = true;
  lid.add(lidMesh);
  group.add(lid);
  return group;
}

/** The services builders, for the vehicle lab and the census. `kit` defaults to the switch. */
export function buildAmbulanceGroup({ kit = SERVICES_KIT } = {}) {
  return kit ? buildAmbulanceKit() : buildAmbulanceGroupLegacy();
}

export function buildRubbishTruckGroup({ kit = SERVICES_KIT } = {}) {
  return kit ? buildRubbishTruckKit() : buildRubbishTruckGroupLegacy();
}

export function buildBinMesh(color = '#2d6b3a', { kit = SERVICES_KIT, lidIndex = 0 } = {}) {
  return kit ? buildBinKit(lidIndex) : buildBinMeshLegacy(color);
}

function buildAmbulanceGroupLegacy() {
  // R19q: board-readable ambulance — horizontal lightbar, NO emissive sphere orbs.
  const group = new THREE.Group();
  group.name = 'city-services:ambulance';
  const white = mat('#f4f6f8', { roughness: 0.55, metalness: 0.08 });
  const red = mat('#c42828', { roughness: 0.55, metalness: 0.08 });
  const dark = mat('#0a0a0c', { roughness: 0.92 });
  const glass = mat('#152028', { roughness: 0.35, metalness: 0.12 });
  const barBase = mat('#1a1c1e', { roughness: 0.6, metalness: 0.2 });
  const blue = mat('#1a4a9a', { roughness: 0.5, metalness: 0.1 });
  // Soft pulse only — never sphere bloom (was emissiveIntensity 2.8 orbs).
  const lightRed = mat('#c42828', {
    roughness: 0.45, metalness: 0.1,
    emissive: '#801010', emissiveIntensity: 0.55, toneMapped: true,
  });
  const lightBlue = mat('#1a4a9a', {
    roughness: 0.45, metalness: 0.1,
    emissive: '#102060', emissiveIntensity: 0.55, toneMapped: true,
  });

  const body = boxMesh(2.7, 1.35, 1.55, red);
  body.position.y = 0.95;
  group.add(body);
  const cabin = boxMesh(1.15, 1.1, 1.48, white);
  cabin.position.set(1.05, 1.15, 0);
  group.add(cabin);
  const stripe = boxMesh(2.5, 0.28, 1.58, white);
  stripe.position.y = 1.15;
  group.add(stripe);
  // Large side cross
  const crossH = boxMesh(0.75, 0.18, 0.1, white);
  crossH.position.set(-0.2, 1.35, 0.8);
  group.add(crossH);
  const crossV = boxMesh(0.18, 0.75, 0.1, white);
  crossV.position.set(-0.2, 1.35, 0.8);
  group.add(crossV);
  const windscreen = boxMesh(0.1, 0.65, 1.2, glass);
  windscreen.position.set(1.62, 1.3, 0);
  group.add(windscreen);
  // Horizontal lightbar base + red/blue segments (beacon for pulse find).
  const beacon = boxMesh(1.35, 0.16, 0.38, barBase);
  beacon.position.set(0.15, 1.75, 0);
  beacon.name = 'beacon';
  group.add(beacon);
  const segR = boxMesh(0.38, 0.2, 0.32, lightRed);
  segR.position.set(-0.25, 1.82, 0);
  group.add(segR);
  const segB = boxMesh(0.38, 0.2, 0.32, lightBlue);
  segB.position.set(0.55, 1.82, 0);
  group.add(segB);
  // Fat grounded wheels (box tyres — clear wheelbase).
  for (const [x, z] of [[-0.85, 0.72], [-0.85, -0.72], [0.95, 0.72], [0.95, -0.72]]) {
    const wheel = boxMesh(0.55, 0.55, 0.32, dark);
    wheel.position.set(x, 0.32, z);
    group.add(wheel);
  }
  return group;
}

function buildRubbishTruckGroupLegacy() {
  const group = new THREE.Group();
  group.name = 'city-services:rubbish-truck';
  const bodyCol = mat('#2f6b4f', { roughness: 0.52, metalness: 0.28 });
  const cabCol = mat('#1f4f38', { roughness: 0.48, metalness: 0.22 });
  const dark = mat('#1a1c20', { roughness: 0.75 });
  const chrome = mat('#c8d0d4', { roughness: 0.28, metalness: 0.72 });
  const amber = mat('#e0a020', {
    roughness: 0.35,
    emissive: '#c88810',
    emissiveIntensity: 0.8,
    toneMapped: false,
  });

  const hopper = boxMesh(3.55, 1.85, 1.65, bodyCol);
  hopper.position.set(-0.4, 1.2, 0);
  group.add(hopper);
  // Hopper rib lines
  for (const z of [-0.55, 0, 0.55]) {
    const rib = boxMesh(3.4, 0.08, 0.08, chrome);
    rib.position.set(-0.4, 1.85, z);
    group.add(rib);
  }
  const cab = boxMesh(1.45, 1.45, 1.58, cabCol);
  cab.position.set(1.65, 1.1, 0);
  group.add(cab);
  const glass = mat('#1a2830', { roughness: 0.15, metalness: 0.35 });
  const windscreen = boxMesh(0.08, 0.7, 1.25, glass);
  windscreen.position.set(2.4, 1.3, 0);
  group.add(windscreen);
  const beacon = boxMesh(0.35, 0.16, 0.45, amber);
  beacon.position.set(1.65, 1.95, 0);
  group.add(beacon);
  // Rear loader cradle
  const loader = boxMesh(0.6, 1.2, 1.45, chrome);
  loader.position.set(-2.25, 1.05, 0);
  loader.name = 'loader';
  group.add(loader);
  const arms = boxMesh(0.14, 1.55, 1.3, chrome);
  arms.position.set(-2.45, 1.45, 0);
  arms.name = 'arms';
  group.add(arms);
  // Grab forks
  const forkL = boxMesh(0.5, 0.1, 0.12, chrome);
  forkL.position.set(-2.75, 0.7, 0.35);
  forkL.name = 'forkL';
  group.add(forkL);
  const forkR = boxMesh(0.5, 0.1, 0.12, chrome);
  forkR.position.set(-2.75, 0.7, -0.35);
  forkR.name = 'forkR';
  group.add(forkR);
  for (const [x, z] of [[-1.3, 0.65], [-1.3, -0.65], [0.35, 0.65], [0.35, -0.65], [1.6, 0.58], [1.6, -0.58]]) {
    const wheel = boxMesh(0.52, 0.52, 0.26, dark);
    wheel.position.set(x, 0.32, z);
    group.add(wheel);
  }
  return group;
}

function buildBinMeshLegacy(color = '#2d6b3a') {
  const group = new THREE.Group();
  const plastic = mat(color, { roughness: 0.68, metalness: 0.06 });
  const lidCol = mat('#1a3d28', { roughness: 0.62 });
  const body = boxMesh(0.58, 0.9, 0.5, plastic);
  body.position.y = 0.48;
  group.add(body);
  // Handle bar
  const handle = boxMesh(0.08, 0.55, 0.08, mat('#222', { roughness: 0.5, metalness: 0.4 }));
  handle.position.set(-0.22, 1.0, 0);
  group.add(handle);
  const top = boxMesh(0.62, 0.1, 0.54, lidCol);
  top.position.y = 0.98;
  top.name = 'lid';
  group.add(top);
  const wheels = mat('#1a1a1a', { roughness: 0.8 });
  for (const z of [-0.18, 0.18]) {
    const w = boxMesh(0.14, 0.14, 0.09, wheels);
    w.position.set(-0.22, 0.09, z);
    group.add(w);
  }
  return group;
}

function buildResidentMesh(skin = '#dca57d', cloth = '#3a5f7a') {
  const group = new THREE.Group();
  const bodyMat = mat(cloth, { roughness: 0.62 });
  const skinMat = mat(skin, { roughness: 0.72 });
  const pants = mat('#2c3540', { roughness: 0.7 });
  const body = boxMesh(0.44, 0.72, 0.3, bodyMat);
  body.position.y = 0.95;
  group.add(body);
  const head = boxMesh(0.3, 0.3, 0.3, skinMat);
  head.position.y = 1.48;
  group.add(head);
  const legL = boxMesh(0.15, 0.58, 0.15, pants);
  legL.position.set(-0.11, 0.32, 0);
  group.add(legL);
  const legR = boxMesh(0.15, 0.58, 0.15, pants);
  legR.position.set(0.11, 0.32, 0);
  group.add(legR);
  // Arm cue for bin push
  const arm = boxMesh(0.12, 0.45, 0.12, bodyMat);
  arm.position.set(0.28, 0.95, 0.1);
  arm.rotation.z = -0.5;
  group.add(arm);
  return group;
}

/**
 * Simple road path from site to hospital using corridor-aligned waypoints.
 */
function pathToHospital(from, hospital, city) {
  if (!hospital) {
    return [
      { x: from.x, z: from.z },
      { x: from.x + 8, z: from.z },
    ];
  }
  // Pull out to nearest corridor centreline, then L toward hospital.
  const a = (CORRIDOR.carriagewayA[0] + CORRIDOR.carriagewayA[1]) / 2;
  // Snap to outer-ish road ring for a readable run.
  const roadX = Math.round(from.x / PITCH) * PITCH + a;
  const roadZ = Math.round(from.z / PITCH) * PITCH + a;
  const hx = hospital.x;
  const hz = hospital.z;
  return [
    { x: from.x, z: from.z },
    { x: roadX, z: from.z },
    { x: roadX, z: roadZ },
    { x: hx, z: roadZ },
    { x: hx, z: hz },
  ];
}

function samplePath(points, t) {
  if (!points.length) return { x: 0, z: 0, yaw: 0 };
  if (points.length === 1) return { x: points[0].x, z: points[0].z, yaw: 0 };
  // Arc-length approximate
  let total = 0;
  const segs = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const dx = points[i + 1].x - points[i].x;
    const dz = points[i + 1].z - points[i].z;
    const len = Math.hypot(dx, dz) || 0.001;
    segs.push({ i, len, dx, dz });
    total += len;
  }
  let dist = Math.max(0, Math.min(1, t)) * total;
  for (const seg of segs) {
    if (dist <= seg.len) {
      const u = dist / seg.len;
      const p0 = points[seg.i];
      return {
        x: p0.x + seg.dx * u,
        z: p0.z + seg.dz * u,
        yaw: Math.atan2(seg.dx, seg.dz),
      };
    }
    dist -= seg.len;
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  return {
    x: last.x,
    z: last.z,
    yaw: Math.atan2(last.x - prev.x, last.z - prev.z),
  };
}

export class CityServicesLayer {
  constructor(city, { quality = 'high', reducedMotion = false } = {}) {
    this.city = city;
    this.quality = quality;
    this.reducedMotion = Boolean(reducedMotion);
    this.root = new THREE.Group();
    this.root.name = 'v310:city-services';
    this.state = null;
    this.elapsed = 0;
    this.ambulanceRuns = [];
    this.playedAccidents = new Set();
    this.binDayKey = null;
    this.binSites = [];
    this.truck = null;
    this.truckProgress = 0;
    this.truckRoute = [];
    this.truckActive = false;
    this._binRoot = new THREE.Group();
    this._binRoot.name = 'city-services:bins';
    this._peopleRoot = new THREE.Group();
    this._peopleRoot.name = 'city-services:bin-people';
    // 0 day, 1 night: beacons emit only at night (V-SERVICES). The scene sets it through setNight.
    this.night = 0;
    this.droneRuns = [];
    this._droneRoot = new THREE.Group();
    this._droneRoot.name = 'city-services:medical-drones';
    this._ambulanceRoot = new THREE.Group();
    this._ambulanceRoot.name = 'city-services:ambulances';
    this._truckRoot = new THREE.Group();
    this._truckRoot.name = 'city-services:trucks';
    this.root.add(this._binRoot, this._peopleRoot, this._ambulanceRoot, this._truckRoot, this._droneRoot);
  }

  /** Night factor 0..1 for the kit beacons' emission; daylight keeps it at 0. */
  setNight(value = 0) {
    this.night = Math.max(0, Math.min(1, Number(value) || 0));
  }

  syncState(state) {
    this.state = state;
    this._syncAccidents(state);
    this._syncBinDay(state);
  }

  _syncAccidents(state) {
    if (!state) return;
    const hospital = hospitalCentre(this.city);
    for (const [id, holding] of Object.entries(state.holdings ?? {})) {
      const job = holding.construction;
      if (!job?.accidentOccurred || job.accidentQuarter == null) continue;
      const key = `${id}:q${job.accidentQuarter}`;
      if (this.playedAccidents.has(key)) continue;
      this.playedAccidents.add(key);
      const parcel = activeParcel(this.city, state, id);
      if (!parcel?.centre) continue;
      this._spawnAmbulance(parcel, hospital, key);
    }
    // Also catch settle-event accidents already in ledger for current view.
    const last = state.ledger?.at(-1);
    for (const accident of last?.constructionAccidents ?? []) {
      const key = `${accident.parcelId}:q${last.quarter}`;
      if (this.playedAccidents.has(key)) continue;
      this.playedAccidents.add(key);
      const parcel = activeParcel(this.city, state, accident.parcelId);
      if (!parcel?.centre) continue;
      this._spawnAmbulance(parcel, hospital, key);
    }
    for (const hit of state.crossingAccidents ?? []) {
      const key = hit.id ?? `xing:${hit.quarter}:${hit.x}:${hit.z}`;
      if (this.playedAccidents.has(key)) continue;
      this.playedAccidents.add(key);
      const site = {
        centre: { x: hit.x, z: hit.z },
        placement: null,
      };
      this._spawnAmbulance(site, hospital, key);
    }
  }

  _spawnAmbulance(parcel, hospital, key) {
    if (this.reducedMotion) return;
    const site = parcelKerbAnchor(parcel) ?? {
      x: parcel.centre.x, z: parcel.centre.z, yaw: 0,
    };
    const pad = hospitalPad(this.city);
    if (pad) {
      const run = spawnMedicalDrone({
        pad,
        site,
        patient: buildResidentMesh('#c99570', '#ffb703'),
      });
      run.key = key;
      this._droneRoot.add(run.group);
      this.droneRuns.push(run);
      return;
    }
    const path = pathToHospital(site, hospital, this.city);
    const group = buildAmbulanceGroup();
    const injured = buildResidentMesh('#c99570', '#ffb703');
    injured.scale.setScalar(0.85);
    injured.position.set(0.2, 0, 0.55);
    if (group.userData.svcKit) injured.position.fromArray(group.userData.load.from);
    injured.visible = false;
    group.add(injured);
    group.position.set(site.x, 0, site.z);
    if (group.userData.svcKit) {
      const approach = path[1] ?? path[0];
      group.position.set(approach.x, 0, approach.z);
    }
    this._ambulanceRoot.add(group);
    this.ambulanceRuns.push({
      key,
      group,
      injured,
      path,
      phase: 'arrive', // arrive → load → depart → done
      t: 0,
      site,
    });
  }

  _syncBinDay(state) {
    const quarter = state?.quarter ?? 0;
    const active = isBinDay(quarter);
    const key = active ? `bin-day:${quarter}` : 'off';
    if (key === this.binDayKey) return;
    this.binDayKey = key;
    this._clearBins();
    this.truckActive = false;
    this.truckProgress = 0;
    if (this.truck) {
      this._truckRoot.remove(this.truck);
      this.truck = null;
    }
    if (!active || !state) return;

    const sites = [];
    const order = activeOrder(this.city, state);
    for (const id of order) {
      const parcel = activeParcel(this.city, state, id);
      if (!parcel || parcel.sector !== 'residential') continue;
      // Occupied homes more likely; still seed some vacant for life on the street.
      const occupied = state.parcelStatus?.[id]?.occupancy === 'tenant'
        || state.holdings?.[id];
      const roll = unit(state.seed, `bin-site:${id}:q${quarter}`);
      if (!occupied && roll > 0.35) continue;
      if (occupied && roll > 0.72) continue;
      const kerb = parcelKerbAnchor(parcel);
      if (!kerb) continue;
      sites.push({ id, parcel, kerb, emptied: false, emptyT: 0 });
    }
    // Cap presentation load
    sites.sort((a, b) => a.id.localeCompare(b.id));
    this.binSites = sites.slice(0, this.quality === 'low' ? 18 : 40);

    for (const site of this.binSites) {
      const bin = buildBinMesh(
        ['#2d6b3a', '#1f4d8c', '#5a5a5a'][hash32(site.id) % 3],
        { lidIndex: hash32(site.id) % 3 },
      );
      bin.position.set(site.kerb.x, 0, site.kerb.z);
      bin.rotation.y = site.kerb.yaw;
      site.bin = bin;
      this._binRoot.add(bin);

      const person = buildResidentMesh(
        ['#f3c9a7', '#dca57d', '#b87852'][hash32(`${site.id}|skin`) % 3],
        ['#3a5f7a', '#8b3a3a', '#4a6741'][hash32(`${site.id}|cloth`) % 3],
      );
      person.position.set(site.kerb.doorX, 0, site.kerb.doorZ);
      person.rotation.y = site.kerb.yaw;
      site.person = person;
      site.personPhase = 0; // 0 door → 1 kerb with bin → 2 idle
      this._peopleRoot.add(person);
    }

    // Truck route: visit kerbs in a rough street order.
    this.truckRoute = this.binSites.map((s) => ({
      x: s.kerb.x + s.kerb.fx * 2.2,
      z: s.kerb.z + s.kerb.fz * 2.2,
      site: s,
    }));
    if (this.truckRoute.length) {
      // Start slightly before first stop.
      const first = this.truckRoute[0];
      this.truckRoute.unshift({
        x: first.x - 12,
        z: first.z - 4,
        site: null,
      });
      this.truck = buildRubbishTruckGroup();
      if (this.truck.userData.svcKit) this.truck.position.set(this.truckRoute[0].x, 0, this.truckRoute[0].z);
      this._truckRoot.add(this.truck);
      this.truckActive = true;
      this.truckProgress = 0;
    }
  }

  _clearBins() {
    while (this._binRoot.children.length) {
      const c = this._binRoot.children.pop();
      c.traverse?.((ch) => {
        if (ch.geometry && !ch.userData.sharedGeometry) ch.geometry.dispose?.();
      });
    }
    while (this._peopleRoot.children.length) {
      this._peopleRoot.children.pop();
    }
    for (const site of this.binSites) {
      site.bin = null;
      site.person = null;
    }
    this.binSites = [];
  }

  update(dt, elapsed = 0) {
    this.elapsed = elapsed;
    this._updateAmbulances(dt);
    for (let i = this.droneRuns.length - 1; i >= 0; i -= 1) {
      if (this.droneRuns[i].update(dt, elapsed)) {
        this._droneRoot.remove(this.droneRuns[i].group);
        this.droneRuns[i].dispose?.();
        this.droneRuns.splice(i, 1);
      }
    }
    this._updateBinDay(dt, elapsed);
  }

  _updateAmbulances(dt) {
    const speed = this.reducedMotion ? 0.35 : 0.22;
    for (let i = this.ambulanceRuns.length - 1; i >= 0; i -= 1) {
      const run = this.ambulanceRuns[i];
      run.t += dt * speed;
      const { group, injured, path, site } = run;
      const kit = Boolean(group.userData.svcKit);
      const x0 = group.position.x;
      const z0 = group.position.z;

      if (run.phase === 'arrive') {
        // Slide in from 14 m out on the road approach.
        const u = Math.min(1, run.t / 1.4);
        const approach = path[1] ?? path[0];
        group.position.x = approach.x + (site.x - approach.x) * u;
        group.position.z = approach.z + (site.z - approach.z) * u;
        group.rotation.y = Math.atan2(site.x - approach.x, site.z - approach.z);
        // Soft lightbar pulse (segments only — never sphere bloom).
        if (kit) {
          group.userData.beacons(this.elapsed, this.night, true);
        } else {
          const pulseA = 0.35 + Math.sin(this.elapsed * 10) * 0.25;
          for (const c of group.children) {
            if (c.material?.emissive && c.name !== 'beacon') c.material.emissiveIntensity = pulseA;
          }
        }
        if (u >= 1) {
          run.phase = 'load';
          run.t = 0;
          injured.visible = true;
          if (kit) injured.position.fromArray(group.userData.load.from);
          else injured.position.set(0.15, 0.15, 0.7);
        }
      } else if (run.phase === 'load') {
        // Injured tradesperson is gathered to the rear doors.
        const u = Math.min(1, run.t / 1.1);
        if (kit) {
          const { from, to } = group.userData.load;
          group.userData.beacons(this.elapsed, this.night, true);
          const along = Math.min(1, u / 0.75);
          const across = Math.max(0, (u - 0.75) / 0.25);
          injured.position.set(
            from[0] + (to[0] - from[0]) * across,
            from[1] + (to[1] - from[1]) * u,
            from[2] + (to[2] - from[2]) * along,
          );
        } else {
          injured.position.set(
            0.15 * (1 - u) - 0.9 * u,
            0.15 + 0.4 * Math.sin(u * Math.PI),
            0.7 * (1 - u),
          );
        }
        injured.scale.setScalar(0.85 * (1 - u * 0.3));
        if (u >= 1) {
          injured.visible = false;
          run.phase = 'depart';
          run.t = 0;
        }
      } else if (run.phase === 'depart') {
        const u = Math.min(1, run.t / 5.5);
        // Start after first point (site) → hospital
        const pos = samplePath(path, u);
        group.position.set(pos.x, 0, pos.z);
        group.rotation.y = pos.yaw;
        if (kit) {
          group.userData.beacons(this.elapsed, this.night, true);
        } else {
          const pulseD = 0.4 + Math.sin(this.elapsed * 12) * 0.3;
          for (const c of group.children) {
            if (c.material?.emissive && c.name !== 'beacon') c.material.emissiveIntensity = pulseD;
          }
        }
        if (u >= 1) {
          run.phase = 'done';
          this._ambulanceRoot.remove(group);
          this.ambulanceRuns.splice(i, 1);
        }
      }
      // Kit wheels turn with the distance covered: angle = distance / radius.
      if (kit) group.userData.roll(Math.hypot(group.position.x - x0, group.position.z - z0));
    }
  }

  _updateBinDay(dt, elapsed) {
    if (!this.binSites.length) return;

    // Residents walk bins to kerb over the first ~6s of the bin-day presentation.
    for (const site of this.binSites) {
      if (!site.person || !site.bin) continue;
      site.personPhase = Math.min(1, (site.personPhase ?? 0) + dt * 0.18);
      const u = site.personPhase;
      const ease = u * u * (3 - 2 * u);
      site.person.position.x = site.kerb.doorX + (site.kerb.x - site.kerb.doorX) * ease;
      site.person.position.z = site.kerb.doorZ + (site.kerb.z - site.kerb.doorZ) * ease;
      site.person.rotation.y = site.kerb.yaw + Math.sin(elapsed * 3 + hash32(site.id)) * 0.05;
      // Bin rolls with resident then stays at kerb.
      if (u < 1) {
        site.bin.position.x = site.person.position.x + site.kerb.fx * 0.45;
        site.bin.position.z = site.person.position.z + site.kerb.fz * 0.45;
        site.bin.rotation.y = site.kerb.yaw;
      } else {
        site.bin.position.x = site.kerb.x;
        site.bin.position.z = site.kerb.z;
        // Resident steps back slightly.
        site.person.position.x = site.kerb.x - site.kerb.fx * 0.9;
        site.person.position.z = site.kerb.z - site.kerb.fz * 0.9;
      }
      if (site.emptied && !site.bin.userData.svcKit) {
        site.emptyT = Math.min(1, site.emptyT + dt * 1.2);
        const lid = site.bin.getObjectByName('lid');
        if (lid) lid.rotation.x = -site.emptyT * 1.1;
        site.bin.scale.y = 1 - site.emptyT * 0.15;
        site.bin.position.y = site.emptyT * 0.15;
      }
    }

    if (!this.truckActive || !this.truck || this.truckRoute.length < 2) return;
    // Progress along multi-stop route; pause at each bin for mechanical lift.
    const stops = this.truckRoute.length - 1;
    const cycle = 2.8; // seconds per leg including lift
    this.truckProgress += dt / (cycle * stops);
    const t = Math.min(this.truck.userData.svcKit ? 1 : 0.999, this.truckProgress);
    const f = t * stops;
    const i = Math.min(stops - 1, Math.floor(f));
    const local = f - i;
    const a = this.truckRoute[i];
    const b = this.truckRoute[Math.min(i + 1, this.truckRoute.length - 1)];

    // Cruise for first 70% of leg, hold and lift last 30%.
    let x;
    let z;
    let lift = 0;
    if (local < 0.7) {
      const u = local / 0.7;
      x = a.x + (b.x - a.x) * u;
      z = a.z + (b.z - a.z) * u;
    } else {
      x = b.x;
      z = b.z;
      lift = (local - 0.7) / 0.3;
      if (b.site && !b.site.emptied && lift > 0.35) {
        b.site.emptied = true;
        b.site.emptyT = 0;
      }
    }
    if (this.truck.userData.svcKit) {
      this._poseKitTruck(x, z, a, b, lift, elapsed);
      if (this.truckProgress >= 1) this.truckActive = false;
      if (b.site?.person && lift > 0.5) b.site.person.visible = false;
      return;
    }
    this.truck.position.set(x, 0, z);
    this.truck.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) || this.truck.rotation.y;
    const arms = this.truck.getObjectByName('arms');
    const loader = this.truck.getObjectByName('loader');
    if (arms) {
      arms.rotation.z = -lift * 1.2;
      arms.position.y = 1.45 + lift * 0.85;
    }
    if (loader) {
      loader.position.y = 1.05 + lift * 0.55;
      loader.rotation.z = -lift * 0.4;
    }
    const forkL = this.truck.getObjectByName('forkL');
    const forkR = this.truck.getObjectByName('forkR');
    if (forkL) {
      forkL.position.y = 0.7 + lift * 1.1;
      forkL.rotation.z = -lift * 0.8;
    }
    if (forkR) {
      forkR.position.y = 0.7 + lift * 1.1;
      forkR.rotation.z = -lift * 0.8;
    }
    // Lift bin visually when forking
    if (b.site?.bin && lift > 0.2 && lift < 0.85) {
      b.site.bin.position.y = (lift - 0.2) * 1.6;
      b.site.bin.rotation.z = -lift * 0.5;
    }

    // Hide residents once truck has passed their stop.
    if (b.site?.person && lift > 0.5) {
      b.site.person.visible = false;
    }
  }

  /**
   * The kit side-loader at a stop: the wheels roll by the distance moved, the arm reaches to the bin's side,
   * grips it, lifts and tips it over the hopper with the lid falling open, then sets it back on its kerb spot.
   */
  _poseKitTruck(x, z, a, b, lift, elapsed) {
    const truck = this.truck;
    const d = Math.hypot(x - truck.position.x, z - truck.position.z);
    truck.position.set(x, 0, z);
    if (b.x !== a.x || b.z !== a.z) truck.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    truck.userData.roll(d);
    truck.updateMatrixWorld(true);
    const working = lift > 0 && lift < 1;
    // A bin still in the claw when its leg ended goes back to its kerb spot.
    const prev = a.site;
    if (prev?.carried && prev.bin) {
      prev.bin.position.set(prev.kerb.x, 0, prev.kerb.z);
      prev.bin.quaternion.setFromAxisAngle(UP, prev.kerb.yaw);
      const pl = prev.bin.getObjectByName('lid');
      if (pl) pl.rotation.x = 0;
      prev.carried = false;
    }
    truck.userData.beacons(elapsed, this.night, working);
    const bin = b.site?.bin;
    let side = 1;
    if (bin) {
      const local = truck.worldToLocal(_p.set(b.site.kerb.x, 0, b.site.kerb.z));
      side = local.x < 0 ? -1 : 1;
    }
    const { claw, raise } = truck.userData.poseArm(working ? lift : 0, side);
    if (!bin || !b.site.kerb) return;
    const kerb = b.site.kerb;
    const lid = bin.getObjectByName('lid');
    const rest = _q.setFromAxisAngle(UP, kerb.yaw);
    if (!working || lift < 0.2) {
      if (b.site.carried) {
        bin.position.set(kerb.x, 0, kerb.z);
        bin.quaternion.copy(rest);
        if (lid) lid.rotation.x = 0;
        b.site.carried = false;
      }
      return;
    }
    b.site.carried = true;
    truck.updateMatrixWorld(true);
    const grip = claw.getWorldPosition(new THREE.Vector3());
    const gq = claw.getWorldQuaternion(new THREE.Quaternion())
      .multiply(new THREE.Quaternion().setFromAxisAngle(UP, -Math.PI / 2));
    const carried = grip.add(new THREE.Vector3(0, -0.62, 0).applyQuaternion(gq));
    // Blend in over the grip and back out over the set-down so the bin never jumps.
    const w = lift < 0.3 ? (lift - 0.2) / 0.1 : lift > 0.9 ? Math.max(0, (1 - lift) / 0.1) : 1;
    bin.position.set(kerb.x + (carried.x - kerb.x) * w, Math.max(0, carried.y * w), kerb.z + (carried.z - kerb.z) * w);
    bin.quaternion.copy(rest).slerp(gq, w);
    if (lid) lid.rotation.x = -Math.min(1, Math.max(0, (raise - 0.6) / 0.4)) * 1.7;
  }

  dispose() {
    this._clearBins();
    for (const run of this.ambulanceRuns) {
      this._ambulanceRoot.remove(run.group);
    }
    this.ambulanceRuns = [];
    if (this.truck) this._truckRoot.remove(this.truck);
    this.root.clear();
  }
}
