// District Deck — construction kit.
// Shared primitives, palette, deterministic hash. Scripts enforce; plates judge.
// No Math.random / Date.now. Does not import board.js.

import * as THREE from 'three';
import { ARCHETYPES } from '../../core/content.js';

export const TILE = 16;
export const CYCLE_SECONDS = 16;

export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function unit(seed, salt) {
  return hash32(`${seed}:${salt}`) / 0x100000000;
}

export function envelopeSize(parcel) {
  const w = parcel.placement?.envelopeMetres?.x
    ?? (parcel.groundFootprint?.[0] ?? 1) * TILE - 2.4;
  const d = parcel.placement?.envelopeMetres?.z
    ?? (parcel.groundFootprint?.[1] ?? 1) * TILE - 2.4;
  return { w: Math.max(7.5, w), d: Math.max(7.5, d) };
}

export function targetHeight(toArchetype) {
  const storeys = ARCHETYPES[toArchetype]?.storeys ?? 2;
  return Math.max(5.4, storeys * 3.05);
}

export function storeyCount(toArchetype) {
  return Math.max(1, Math.min(6, ARCHETYPES[toArchetype]?.storeys ?? 2));
}

/** L2/L3 planning-finish forms (apartments), not L1 townhouse / cottage lock-up. */
export function isApartmentFinish(toArchetype) {
  const id = String(toArchetype ?? '');
  if (id.startsWith('apartment')) return true;
  return (ARCHETYPES[id]?.storeys ?? 0) >= 5;
}

export function createPalette(materials) {
  const M = (family, variant, color, extra = {}) => materials.get(family, {
    variant, color, ...extra,
  });
  return Object.freeze({
    timber: M('timber', 'cs-timber', '#d7b077', { roughness: 0.82 }),
    pine: M('timber', 'cs-pine', '#e4c48a', { roughness: 0.78 }),
    plate: M('timber', 'cs-plate', '#b48a52', { roughness: 0.86 }),
    plywood: M('timber', 'cs-ply', '#c9a66a', { roughness: 0.88 }),
    brick: M('brick', 'cs-brick', '#b25a42', { roughness: 0.86 }),
    brickDark: M('brick', 'cs-brick-d', '#8a4030', { roughness: 0.88 }),
    concrete: M('concrete', 'cs-conc', '#b8b3ac', { roughness: 0.88 }),
    slab: M('concrete', 'cs-slab', '#c6c1ba', { roughness: 0.78 }),
    wet: M('concrete', 'cs-wet', '#9aa4aa', { roughness: 0.28, metalness: 0.08 }),
    dirt: M('sand', 'cs-dirt', '#8a6e4c', { roughness: 0.94 }),
    dirtWet: M('sand', 'cs-dirt-w', '#6e5640', { roughness: 0.92 }),
    mud: M('sand', 'cs-mud', '#5a4a38', { roughness: 0.93 }),
    yellow: M('painted_metal', 'cs-yel', '#e6b01a', { roughness: 0.38, metalness: 0.36 }),
    yellowDark: M('painted_metal', 'cs-yel-d', '#c48e10', { roughness: 0.42, metalness: 0.34 }),
    orange: M('painted_metal', 'cs-org', '#e85d04', { roughness: 0.46, metalness: 0.22 }),
    skip: M('painted_metal', 'cs-skip', '#ef6a12', { roughness: 0.44, metalness: 0.34 }),
    pump: M('painted_metal', 'cs-pump', '#d02424', { roughness: 0.4, metalness: 0.36 }),
    plastic: M('painted_metal', 'cs-loo', '#1574d6', { roughness: 0.42, metalness: 0.08 }),
    looDoor: M('painted_metal', 'cs-loo-d', '#eef3f7', { roughness: 0.52 }),
    cabin: M('painted_metal', 'cs-cab', '#ef7a1a', { roughness: 0.48, metalness: 0.22 }),
    steel: M('painted_metal', 'cs-stl', '#c5ced2', { roughness: 0.34, metalness: 0.55 }),
    steelDark: M('asphalt', 'cs-stl-d', '#2a2e32', { roughness: 0.62, metalness: 0.28 }),
    track: M('asphalt', 'cs-trk', '#1a1b1e', { roughness: 0.88 }),
    glass: M('glass', 'cs-gls', '#152028', { roughness: 0.08, metalness: 0.16, opacity: 0.55 }),
    glassCab: M('glass', 'cs-cab-g', '#0c1822', { roughness: 0.10, metalness: 0.22, opacity: 0.78 }),
    rebar: M('painted_metal', 'cs-rebar', '#8a3a28', { roughness: 0.4, metalness: 0.58 }),
    hazard: M('painted_metal', 'cs-haz', '#f0c400', { roughness: 0.42, metalness: 0.2 }),
    hazardBlk: M('asphalt', 'cs-haz-b', '#1c1c1e', { roughness: 0.82 }),
    netting: M('painted_metal', 'cs-net', '#2f6a3a', { roughness: 0.86, metalness: 0.02, opacity: 0.42, transparent: true }),
    render: M('render', 'cs-rend', '#eee6d8', { roughness: 0.84 }),
    weather: M('weatherboard', 'cs-wb', '#d8c4a0', { roughness: 0.8 }),
    roof: M('slate', 'cs-roof', '#5a6570', { roughness: 0.52, metalness: 0.28 }),
    cladding: M('timber', 'cs-clad', '#a07f58', { roughness: 0.82 }),
    white: M('render', 'cs-wht', '#f2efe8', { roughness: 0.62 }),
    black: M('asphalt', 'cs-blk', '#1a1a1c', { roughness: 0.86 }),
    safety: M('painted_metal', 'cs-saf', '#ffc400', { roughness: 0.46, metalness: 0.2 }),
    scaffoldBase: M('painted_metal', 'cs-sbase', '#e6b400', { roughness: 0.48, metalness: 0.28 }),
    firstAid: M('painted_metal', 'cs-aid', '#c0392b', { roughness: 0.46 }),
  });
}

function mark(mesh) {
  mesh.userData.ownsGeometry = true;
  mesh.castShadow = mesh.userData.cast !== false;
  mesh.receiveShadow = mesh.userData.receive !== false;
  return mesh;
}

export function addMesh(group, geo, mat, x, y, z, {
  rotX = 0, rotY = 0, rotZ = 0, cast = true, receive = true, name = '',
} = {}) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rotX, rotY, rotZ);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  mesh.userData.ownsGeometry = true;
  if (name) mesh.name = name;
  group.add(mesh);
  return mesh;
}

export function box(group, w, h, d, mat, x, y, z, opts = {}) {
  return addMesh(group, new THREE.BoxGeometry(w, h, d), mat, x, y, z, opts);
}

export function cyl(group, rTop, rBot, h, segs, mat, x, y, z, opts = {}) {
  return addMesh(group, new THREE.CylinderGeometry(rTop, rBot, h, segs), mat, x, y, z, opts);
}

export function sphere(group, r, segs, mat, x, y, z, opts = {}) {
  return addMesh(group, new THREE.SphereGeometry(r, segs, Math.max(4, segs - 1)), mat, x, y, z, opts);
}

export function cone(group, r, h, segs, mat, x, y, z, opts = {}) {
  return addMesh(group, new THREE.ConeGeometry(r, h, segs), mat, x, y, z, opts);
}

/** Capsule — the Monopoly Plus toy-stick (boom, stud, ram). */
export function capsule(group, r, length, segs, mat, x, y, z, opts = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (opts.rotX) g.rotation.x = opts.rotX;
  if (opts.rotY) g.rotation.y = opts.rotY;
  if (opts.rotZ) g.rotation.z = opts.rotZ;
  const mid = Math.max(0.02, length - r * 2);
  cyl(g, r, r, mid, segs, mat, 0, 0, 0, { cast: opts.cast, receive: opts.receive });
  sphere(g, r, segs, mat, 0, mid / 2, 0, { cast: opts.cast, receive: false });
  sphere(g, r, segs, mat, 0, -mid / 2, 0, { cast: opts.cast, receive: false });
  group.add(g);
  return g;
}

export class SiteContext {
  constructor({
    group, w, d, height, storeys, materials, seed, stageIndex, toArchetype, fit = null,
  }) {
    this.group = group;
    this.fit = fit;
    this.w = w;
    this.d = d;
    this.height = height;
    this.storeys = storeys;
    this.materials = materials;
    this.palette = createPalette(materials);
    this.seed = seed ?? 'site';
    this.stageIndex = stageIndex;
    this.toArchetype = toArchetype;
    this.anims = [];
    this.taps = [];
    this.rigs = {};
    this.layers = new Map();
  }

  u(salt) {
    return unit(this.seed, salt);
  }

  layer(name) {
    if (this.layers.has(name)) return this.layers.get(name);
    const g = new THREE.Group();
    g.name = `cs:${name}`;
    this.group.add(g);
    this.layers.set(name, g);
    return g;
  }

  // Only the building layers enter this frame. Site plant keeps the parcel envelope.
  fitLayer(name) {
    const layer = this.layer(name);
    if (!this.fit) return layer;
    if (!this.fitGroup) {
      this.fitGroup = new THREE.Group();
      this.fitGroup.name = 'cs:fit';
      this.fitGroup.position.set(this.fit.cx, 0, this.fit.cz);
      this.fitGroup.rotation.y = this.fit.yaw;
      this.group.add(this.fitGroup);
    }
    this.fitGroup.add(layer);
    return layer;
  }

  box(w, h, d, mat, x, y, z, opts) {
    return box(this.group, w, h, d, mat, x, y, z, opts);
  }

  cyl(rTop, rBot, h, segs, mat, x, y, z, opts) {
    return cyl(this.group, rTop, rBot, h, segs, mat, x, y, z, opts);
  }

  cone(r, h, segs, mat, x, y, z, opts) {
    return cone(this.group, r, h, segs, mat, x, y, z, opts);
  }

  sphere(r, segs, mat, x, y, z, opts) {
    return sphere(this.group, r, segs, mat, x, y, z, opts);
  }

  capsule(r, length, segs, mat, x, y, z, opts) {
    return capsule(this.group, r, length, segs, mat, x, y, z, opts);
  }

  /**
   * Register a tap-sway member. `node` is the object that rotates;
   * `pivot` is the world-local point it rocks about (usually the base).
   */
  tap(node, kind, { label = kind } = {}) {
    const record = { node, kind, label, taps: 0 };
    this.taps.push(record);
    node.userData.constructionTap = record;
    node.userData.constructionKind = kind;
    return record;
  }

  anim(fn) {
    this.anims.push(fn);
    return fn;
  }

  rig(name, value) {
    this.rigs[name] = value;
    return value;
  }
}

export { mark };

/** Roof coordinates: u along the measured ridge, v across it. */
export function fitRoof(fit) {
  const along = fit.axis === 'x' ? fit.w : fit.d;
  const across = fit.axis === 'x' ? fit.d : fit.w;
  const ridgeHalf = fit.form === 'hip' ? Math.max(0, along - across) / 2 : along / 2;
  const point = (u, y, v) => fit.axis === 'x' ? [u, y, v] : [v, y, u];
  return { along, across, ridgeHalf, point };
}

export function fitBeam(parent, a, b, thickness, material, name = '') {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const delta = end.clone().sub(start);
  const mid = start.add(end).multiplyScalar(0.5);
  const mesh = box(parent, thickness, Math.max(0.01, delta.length()), thickness, material, mid.x, mid.y, mid.z);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  mesh.name = name;
  return mesh;
}
