// District Deck V3.02 / V3.10 W2-PHYS — renderer-local street-furniture mischief.
// This module never receives run state. Its only deterministic input is the city seed,
// forked once per pickable prop, and its only outputs are renderer transforms and effects.
// Tips use a short tumble settle plus seed-forked dust; restore remains authoritative.

import * as THREE from 'three';
import { stream } from '../core/rng.js';
import {
  createSway, impulseSway, profileFor, resetSway, stepSway, swayAmplitude, swayKindFor,
  treeFallHeading,
} from './sway.js';

// Hits 1–3 rock the live mesh. Stage 1 tips at 4, peel at 8, scatter at 13.
// The extra headroom is the tap-sway window: energy decays if the player stops.
export const MISCHIEF_THRESHOLDS = Object.freeze([4, 8, 13]);
export const MISCHIEF_REPAIR_DELAY = 10;
export const MISCHIEF_REPAIR_DURATION = 0.85;
export const MISCHIEF_MAX_DAMAGED = 10;
/** Tumble settle after a stage tip (seconds). */
export const MISCHIEF_TUMBLE_DURATION = 0.55;
/** Stage-3 scatter fall duration before pieces rest. */
export const MISCHIEF_SCATTER_FALL = 0.72;
/** Stage-2 peel duration — upper pieces drop before full collapse. */
export const MISCHIEF_PEEL_FALL = 0.42;
/** Live tree (bole + crown) tip-over. Longer than furniture tumble so height reads. */
export const TREE_FALL_DURATION = 1.12;
/** Rest angle once the live tree is on the grate — just past flat. */
export const TREE_FALL_ANGLE = 88 * Math.PI / 180;

const DEG = Math.PI / 180;
// Dense model-derived voxel kits (info stands, avenue lamps, cars) need headroom.
/**
 * Cap on parts in a kit *derived* from a live model by `finaliseVoxelKit`. Unchanged at 24: every
 * prop on the board has had its damaged silhouette tuned against this number, and raising it
 * would give them all more and smaller pieces.
 */
const MAX_COMPONENTS = 24;

/**
 * Cap on parts in a kit an author *writes by hand*, and the number the runtime pools and slices
 * against.
 *
 * Split from `MAX_COMPONENTS` in V3.31. The esplanade planter's damaged state reads correctly as
 * it peels — soil and planting come out as soil and planting — but the standing half was one flat
 * panel per face, which at a 38° lean shows unlit inner faces and reads as dark slabs rather than
 * as a tub. Fixing that needs board courses in the standing half, which did not fit in 24
 * alongside the planting. The planters seat declined to move a shared constant late in a round,
 * which was the right call, so the two caps are now separate: an authored kit gets the headroom,
 * and every derived kit keeps the sizing it was tuned against.
 *
 * The cost is one instanced pool: 10 damaged props × 32 + 32 = 352 boxes at 12 triangles, against
 * 264 before — about a thousand triangles on a board that draws millions.
 */
const MAX_AUTHORED_COMPONENTS = 32;

const BODY_CAPACITY = MISCHIEF_MAX_DAMAGED * MAX_AUTHORED_COMPONENTS + MAX_AUTHORED_COMPONENTS;
const HAZARD_CAPACITY = 4;
const BODY_TRIANGLES = 12; // BoxGeometry(1, 1, 1)
const HAZARD_TRIANGLES = 48; // SphereGeometry(1, 6, 4)
/**
 * Shaped-part pools, added in V3.31 so an authored kit can keep planting looking like
 * planting through damage. They cost two draw calls for the whole board, not two per
 * prop, and they stay empty unless a kit part declares a `shape` — no existing kit does,
 * so no existing damaged silhouette moves.
 */
const LEAF_CAPACITY = MISCHIEF_MAX_DAMAGED * 8 + 8;
const BLADE_CAPACITY = MISCHIEF_MAX_DAMAGED * 4 + 4;
const LEAF_TRIANGLES = 20;   // IcosahedronGeometry(0.5, 0)
const BLADE_TRIANGLES = 6;   // ConeGeometry(0.5, 1, 3)
const STAGE_TILT = Object.freeze([0, 12 * DEG, 38 * DEG, 92 * DEG]);
/** Single tree type for foliage + mischief (trunk + crown blob). */
const TREE_SPECIES_SLUGS = Object.freeze(['tree']);

const WHITE = new THREE.Color(1, 1, 1);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function treeSpeciesSlug(_model) {
  return 'tree';
}

function treeVariantIndex(_model) {
  return 0;
}

/** Ice-cream van: stages 1–2 slide the live mesh; stage 3 scatters cone kits. */
function isIceCreamTarget(target) {
  const id = mischiefKindOf(target);
  return id.includes('ice-cream') || id.includes('icecream');
}

/** Builders own the semantic tag; legacy adapters are classified once at the boundary. */
export function mischiefKindOf(target) {
  const tag = target?.userData?.mischief ?? target?.pickProxy?.userData?.mischief;
  if (typeof tag === 'string') return tag;
  if (tag?.kind) return tag.kind;
  const id = String(target?.model ?? target?.key ?? '');
  for (const [kind, pattern] of [
    ['umbrella', /umbrella/], ['car', /traffic-car|car-body|parked-(sedan|van|truck|bus)|^car$/],
    ['ice-cream', /ice-cream|icecream/], ['bench', /bench/], ['picnic', /picnic/],
    ['bike-hoop', /bike-hoop/], ['bollard', /bollard/], ['tram-stop', /tram-stop|tram-flag/],
    ['signal', /signal|traffic/], ['lifeguard', /lifeguard/], ['tree-guard', /tree-guard/],
    ['esplanade-planter', /esplanade-planter/], ['bin', /bin/], ['fountain', /fountain/],
  ]) if (pattern.test(id)) return kind;
  return id;
}

/** Stage-based lateral slide (metres) for the live ice-cream van. */
function iceCreamSlideFor(record, stage) {
  if (stage <= 0) return 0;
  // Park offset grows with stage; wobble makes it read as "side to side".
  const park = stage === 1 ? 0.75 : stage === 2 ? 1.55 : 0;
  const dir = (record.variant % 2) ? 1 : -1;
  let slide = dir * park;
  if (record.tumble && record.tumble.duration > 0) {
    const k = Math.min(1, record.tumble.t / record.tumble.duration);
    const fromPark = stage === 1 ? 0 : 0.75;
    slide = dir * (fromPark + (park - fromPark) * easeTumble(k));
  }
  if (!record.repairing && stage >= 1 && stage < 3) {
    const amp = stage === 1 ? 0.45 : 0.85;
    const rate = stage === 1 ? 9.5 : 12.5;
    slide += Math.sin(record.stageAge * rate) * amp * dir;
  }
  return slide;
}

/**
 * Sideways nudge off the reservation / carriageway. Stage 3 keeps the last
 * park so the scatter kit sits where the hull was shoved, not back on the rails.
 */
function railSlideFor(record, stage) {
  if (stage <= 0) return 0;
  const park = stage >= 2 ? 1.15 : 0.55;
  const dir = (record.variant % 2) ? 1 : -1;
  let slide = dir * park;
  if (record.tumble && record.tumble.duration > 0 && stage < 3) {
    const k = Math.min(1, record.tumble.t / record.tumble.duration);
    const fromPark = stage === 1 ? 0 : 0.55;
    slide = dir * (fromPark + (park - fromPark) * easeTumble(k));
  }
  if (!record.repairing && stage >= 1 && stage < 3) {
    const amp = stage === 1 ? 0.16 : 0.32;
    const rate = stage === 1 ? 7.0 : 9.2;
    slide += Math.sin(record.stageAge * rate) * amp * dir;
  }
  return slide;
}

function isRailTarget(target) {
  return target?.kind === 'tram' || target?.kind === 'bus';
}

function stageForHits(hits, target = null) {
  // Ice-cream: first tap starts sliding; cones at 5 taps (easier easter-egg payoff).
  if (target && isIceCreamTarget(target)) {
    if (hits >= 5) return 3;
    if (hits >= 3) return 2;
    if (hits >= 1) return 1;
    return 0;
  }
  if (hits >= MISCHIEF_THRESHOLDS[2]) return 3;
  if (hits >= MISCHIEF_THRESHOLDS[1]) return 2;
  if (hits >= MISCHIEF_THRESHOLDS[0]) return 1;
  return 0;
}

function easeOutBack(k) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
}

/** Overshooting ease for a readable toy tumble that settles. */
function easeTumble(k) {
  if (k >= 1) return 1;
  // Cubic ease-out with a single overshoot lobe, then settle to 1.
  const overshoot = Math.sin(k * Math.PI) * (1 - k) * 0.38;
  return Math.min(1.35, (1 - Math.pow(1 - k, 3)) + overshoot);
}

function stagedTreeFallHeading(record, swayX, swayZ) {
  const resolved = record.target.resolveFallHeading?.();
  if (Number.isFinite(resolved)) return resolved;
  return treeFallHeading(swayX, swayZ, record.sway.heading - Math.PI / 2);
}

/** Dust / ring origin: pit for a knock, offset toward the landing for a shed or fall. */
function treeFxOrigin(record, position) {
  const height = Math.max(2.4, record.target.size?.y ?? 5.2);
  const heading = record.stage >= 3
    ? (record.fallHeading ?? record.sway.heading - Math.PI / 2)
    : record.stage >= 2
      ? (record.sway.heading + Math.PI / 2)
      : (record.sway.heading - Math.PI / 2);
  const reach = record.stage >= 3 ? height * 0.42 : height * 0.20;
  return {
    x: position.x + Math.cos(heading) * reach,
    y: record.stage >= 3 ? 0.32 : Math.min(2.1, height * 0.20),
    z: position.z + Math.sin(heading) * reach,
  };
}

/** Tall-tree fall: hold-creak, slam, one ground bounce. */
function easeTreeFall(k) {
  if (k >= 1) return 1;
  if (k <= 0) return 0;
  const creak = 0.20;
  if (k < creak) return 0.07 * (k / creak) ** 2;
  const u = (k - creak) / (1 - creak);
  const slam = 0.07 + 0.93 * (1 - (1 - u) ** 3);
  const bounce = k > 0.74 ? Math.sin(((k - 0.74) / 0.26) * Math.PI) * (1 - k) * 0.14 : 0;
  return slam + bounce;
}

function stageTilt(stage) {
  return STAGE_TILT[Math.max(0, Math.min(3, stage))] ?? 0;
}

function colour(value) {
  return new THREE.Color(value);
}

/**
 * A kit part.
 *
 * `shape` selects which pooled geometry draws it and defaults to `'box'`, which is every
 * kit written before V3.31 and every kit derived from a live model. An authored kit may
 * ask for `'leaf'` (a rounded lump) or `'blade'` (a strap leaf) so that a damaged planted
 * prop still shows planting rather than substituting a cuboid for every shrub — the first
 * thing the round-1 planter plates gave away.
 */
function part(x, y, z, sx, sy, sz, tint, rotation = null, shape = 'box') {
  return {
    position: new THREE.Vector3(x, y, z),
    scale: new THREE.Vector3(sx, sy, sz),
    colour: colour(tint),
    rotation,
    shape,
  };
}

function partVolume(p) {
  return Math.abs(p.scale.x * p.scale.y * p.scale.z);
}

function materialTint(mat) {
  if (!mat) return '#888888';
  if (mat.color?.isColor) return `#${mat.color.getHexString()}`;
  if (typeof mat.color === 'string') return mat.color;
  if (mat.emissive?.isColor && mat.emissiveIntensity > 0.2) {
    return `#${mat.emissive.getHexString()}`;
  }
  return '#888888';
}

/**
 * Finalise a raw AABB list into a mischief voxel kit: volume cap, sparse split,
 * bottom-up order so peel stages drop upper pieces first.
 */
function finaliseVoxelKit(raw, { maxParts = MAX_COMPONENTS, minParts = 6 } = {}) {
  if (!raw?.length) return null;
  raw.sort((a, b) => partVolume(b) - partVolume(a));
  let kit = raw.slice(0, maxParts);

  const splitLargest = () => {
    kit.sort((a, b) => partVolume(b) - partVolume(a));
    const big = kit[0];
    if (!big || partVolume(big) < 0.04) return false;
    const dims = [
      { axis: 'x', v: big.scale.x },
      { axis: 'y', v: big.scale.y },
      { axis: 'z', v: big.scale.z },
    ].sort((a, b) => b.v - a.v);
    const axis = dims[0].axis;
    if (dims[0].v < 0.18) return false;
    const half = dims[0].v * 0.5;
    const a = {
      position: big.position.clone(),
      scale: big.scale.clone(),
      colour: big.colour.clone(),
      rotation: big.rotation?.clone?.() ?? null,
    };
    const b = {
      position: big.position.clone(),
      scale: big.scale.clone(),
      colour: big.colour.clone(),
      rotation: big.rotation?.clone?.() ?? null,
    };
    a.scale[axis] = half;
    b.scale[axis] = half;
    a.position[axis] -= half * 0.5;
    b.position[axis] += half * 0.5;
    kit = [a, b, ...kit.slice(1)];
    return true;
  };
  let guard = 0;
  while (kit.length < Math.min(minParts, maxParts) && guard < 12) {
    if (!splitLargest()) break;
    guard += 1;
    if (kit.length > maxParts) {
      kit.sort((a, b) => partVolume(b) - partVolume(a));
      kit = kit.slice(0, maxParts);
    }
  }
  kit.sort((a, b) => a.position.y - b.position.y || partVolume(b) - partVolume(a));
  return kit;
}

function aabbPartFromGeometry(geo, mat) {
  if (!geo?.isBufferGeometry) return null;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb || bb.isEmpty()) return null;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bb.getSize(size);
  bb.getCenter(center);
  if (size.x < 0.025 && size.y < 0.025 && size.z < 0.025) return null;
  if (size.x * size.y * size.z < 1e-5) return null;
  return part(
    center.x,
    center.y,
    center.z,
    Math.max(0.05, size.x),
    Math.max(0.05, size.y),
    Math.max(0.05, size.z),
    materialTint(mat),
  );
}

/**
 * Build a voxel AABB kit from a procedural/GLB model so mischief pieces match
 * the live prop silhouette (not a generic stub). Caps at MAX_COMPONENTS by volume.
 * Sparse kits are subdivided so stage peel/scatter has enough pieces.
 */
export function voxelKitFromModel(model, opts = {}) {
  if (!model?.parts?.length) return null;
  const raw = [];
  for (const entry of model.parts) {
    const p = aabbPartFromGeometry(entry?.geometry, entry?.material);
    if (p) raw.push(p);
  }
  return finaliseVoxelKit(raw, opts);
}

/**
 * Same as voxelKitFromModel, but from InstancedMesh / Mesh part list
 * (streetscape signals, bollards, parked cars often register empty model.parts).
 */
export function authoredKitFromGroup(group) {
  group.updateWorldMatrix(true, true);
  const pose = new THREE.Matrix4().compose(group.position, group.quaternion, new THREE.Vector3(1, 1, 1));
  if (group.parent) pose.premultiply(group.parent.matrixWorld);
  const inverse = pose.invert();
  const parts = [];
  const add = (mesh, geometry, material, owned = false) => {
    if (!material?.color || material.transparent) return;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const centre = box.getCenter(new THREE.Vector3());
    const extent = box.getSize(new THREE.Vector3()).max(new THREE.Vector3(0.001, 0.001, 0.001));
    const transform = inverse.clone().multiply(mesh.matrixWorld)
      .multiply(new THREE.Matrix4().makeTranslation(centre.x, centre.y, centre.z))
      .multiply(new THREE.Matrix4().makeScale(extent.x, extent.y, extent.z));
    const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
    transform.decompose(position, rotation, scale);
    parts.push({ position, rotation, scale, colour: material.color.clone(),
      sourceGeometry: geometry, centre, extent, sourceMaterial: material, owned });
  };
  group.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!Array.isArray(mesh.material)) { add(mesh, mesh.geometry, mesh.material); return; }
    // Split the authored striped canopy along radial seams, retaining its
    // curved cloth, rolled hem and ribs rather than substituting flat boxes.
    const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const p = source.attributes.position;
    for (const range of source.groups) {
      const wedges = Array.from({ length: 16 }, () => []);
      for (let i = range.start; i < range.start + range.count; i += 3) {
        const x = p.getX(i) + p.getX(i + 1) + p.getX(i + 2);
        const z = p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2);
        const wedge = Math.floor((Math.atan2(x, z) + Math.PI) / (Math.PI * 2) * 16) % 16;
        wedges[wedge].push(i, i + 1, i + 2);
      }
      for (const indices of wedges) {
        if (!indices.length) continue;
        const geometry = new THREE.BufferGeometry();
        for (const [name, attr] of Object.entries(source.attributes)) {
          const values = new Float32Array(indices.length * attr.itemSize);
          indices.forEach((i, j) => { for (let k = 0; k < attr.itemSize; k++) values[j * attr.itemSize + k] = attr.array[i * attr.itemSize + k]; });
          geometry.setAttribute(name, new THREE.BufferAttribute(values, attr.itemSize));
        }
        add(mesh, geometry, mesh.material[range.materialIndex], true);
      }
    }
    if (source !== mesh.geometry) source.dispose();
  });
  parts.settle = { halfX: 2.4, halfZ: 2.4, height: 2.8, radius: 1.8, depth: 1.8, flatPieces: true };
  return parts;
}

export function voxelKitFromMeshes(meshes, opts = {}) {
  if (!meshes?.length) return null;
  const raw = [];
  for (const mesh of meshes) {
    if (!mesh?.geometry) continue;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const p = aabbPartFromGeometry(mesh.geometry, mat);
    if (p) raw.push(p);
  }
  return finaliseVoxelKit(raw, opts);
}

function propComponents(target, variant) {
  const id = mischiefKindOf(target);
  const timber = variant % 2 ? '#9a6138' : '#5e3b26';
  const metal = '#343a3d';
  // Voxel-style block furniture — clean AABB pieces tip/scatter for AAA mischief.
  if (id.includes('bench')) {
    return [
      part(0, 0.62, 0, 2.45, 0.18, 0.66, timber),
      part(0, 1.24, -0.29, 2.45, 0.16, 0.16, timber),
      part(0, 0.96, -0.33, 2.45, 0.16, 0.16, timber),
      part(-1.00, 0.31, 0, 0.14, 0.62, 0.50, metal),
      part(1.00, 0.31, 0, 0.14, 0.62, 0.50, metal),
      part(-1.00, 0.91, -0.31, 0.13, 0.74, 0.13, metal),
      part(1.00, 0.91, -0.31, 0.13, 0.74, 0.13, metal),
    ];
  }
  if (id.includes('picnic')) {
    // Picnic table: top + two side benches + four legs + brace.
    return [
      part(0, 0.78, 0, 1.9, 0.1, 1.15, timber),
      part(0, 0.48, 0.72, 1.9, 0.1, 0.32, timber),
      part(0, 0.48, -0.72, 1.9, 0.1, 0.32, timber),
      part(-0.72, 0.38, 0, 0.1, 0.76, 0.1, metal),
      part(0.72, 0.38, 0, 0.1, 0.76, 0.1, metal),
      part(-0.72, 0.24, 0.72, 0.1, 0.48, 0.1, metal),
      part(0.72, 0.24, 0.72, 0.1, 0.48, 0.1, metal),
      part(-0.72, 0.24, -0.72, 0.1, 0.48, 0.1, metal),
      part(0.72, 0.24, -0.72, 0.1, 0.48, 0.1, metal),
      part(0, 0.42, 0, 1.4, 0.08, 0.08, metal),
    ];
  }
  if (id.includes('bike-hoop')) {
    return [
      part(-0.48, 0.68, 0, 0.12, 1.36, 0.12, metal),
      part(0.48, 0.68, 0, 0.12, 1.36, 0.12, metal),
      part(0, 1.34, 0, 1.08, 0.12, 0.12, metal),
    ];
  }
  if (id.includes('bollard')) {
    return [
      part(0, 0.48, 0, 0.28, 0.96, 0.28, '#f0ebe0'),
      part(0, 1.02, 0, 0.32, 0.14, 0.32, '#d8d2c6'),
      part(0, 0.08, 0, 0.36, 0.12, 0.36, '#3a3834'),
    ];
  }
  // R30k beach umbrella — volumetric dome petals (not flat pink slabs), pole, base.
  if (id.includes('umbrella') || id.includes('beach-umbrella')) {
    const cloth = ['#e34a38', '#2d78bd', '#f0c631', '#ed795b'][variant % 4];
    const accent = ['#f6f0e4', '#1a4a78', '#fff6c8', '#fff0e8'][variant % 4];
    const tilt = (deg) => new THREE.Quaternion().setFromAxisAngle(X_AXIS, deg * DEG);
    const yaw = (deg) => new THREE.Quaternion().setFromAxisAngle(UP, deg * DEG);
    const petal = (ang, r, y, w, h, d, tint) => {
      const q = yaw(ang).multiply(tilt(22));
      const x = Math.sin(ang * DEG) * r;
      const z = Math.cos(ang * DEG) * r;
      return part(x, y, z, w, h, d, tint, q);
    };
    return [
      part(0, 0.05, 0, 0.7, 0.12, 0.7, '#2a2824'), // base plate
      part(0, 0.16, 0, 0.32, 0.14, 0.32, metal), // collar
      part(0, 1.15, 0, 0.11, 2.2, 0.11, metal), // pole
      part(0, 2.42, 0, 0.24, 0.18, 0.24, metal), // ferrule
      part(0, 2.32, 0, 0.85, 0.28, 0.85, cloth), // crown block
      part(0, 2.18, 0, 1.35, 0.22, 1.35, accent), // mid volume
      petal(0, 0.95, 2.05, 1.05, 0.22, 0.7, cloth),
      petal(45, 0.95, 2.05, 1.05, 0.22, 0.7, accent),
      petal(90, 0.95, 2.05, 1.05, 0.22, 0.7, cloth),
      petal(135, 0.95, 2.05, 1.05, 0.22, 0.7, accent),
      petal(180, 0.95, 2.05, 1.05, 0.22, 0.7, cloth),
      petal(225, 0.95, 2.05, 1.05, 0.22, 0.7, accent),
      petal(270, 0.95, 2.05, 1.05, 0.22, 0.7, cloth),
      petal(315, 0.95, 2.05, 1.05, 0.22, 0.7, accent),
      part(0, 1.95, 0, 2.05, 0.16, 2.05, cloth), // rim ring volume
    ];
  }
  // R30u car — sedan mass with waist, greenhouse rake, tyre lips, lamps.
  if (id.includes('traffic-car') || id.includes('car-body') || id === 'car') {
    const livery = target.carColours ?? {};
    const body = livery.body ?? ['#e53935', '#1e88e5', '#fdd835', '#43a047'][variant % 4];
    const kit = [
      part(0, 0.36, 0, 1.82, 0.52, 4.25, body), // lower hull
      part(0, 0.78, 0.04, 1.68, 0.24, 3.55, body), // waist / shoulder
      part(0, 1.02, -0.1, 1.48, 0.48, 1.95, livery.glass ?? '#152230'), // greenhouse
      part(0, 1.32, -0.12, 1.22, 0.12, 1.55, body), // roof
      part(0, 0.68, 1.82, 1.62, 0.26, 0.62, body), // nose
      part(0, 0.66, -1.92, 1.58, 0.22, 0.48, body), // boot
      part(0, 0.46, 2.14, 1.55, 0.12, 0.16, livery.trim ?? '#eef6f8'), // bumper
      part(0, 0.48, -2.16, 1.48, 0.1, 0.14, livery.trim ?? '#c8d0d4'),
      part(-0.9, 0.28, 1.22, 0.36, 0.52, 0.52, livery.tyre ?? '#0a0a0c'),
      part(0.9, 0.28, 1.22, 0.36, 0.52, 0.52, livery.tyre ?? '#0a0a0c'),
      part(-0.9, 0.28, -1.28, 0.36, 0.52, 0.52, livery.tyre ?? '#0a0a0c'),
      part(0.9, 0.28, -1.28, 0.36, 0.52, 0.52, livery.tyre ?? '#0a0a0c'),
      part(0.52, 0.7, 2.1, 0.26, 0.14, 0.12, livery.headLamp ?? '#ffffff'),
      part(-0.52, 0.7, 2.1, 0.26, 0.14, 0.12, livery.headLamp ?? '#ffffff'),
      part(0.52, 0.72, -2.14, 0.24, 0.12, 0.1, livery.tailLamp ?? '#ff2634'),
      part(-0.52, 0.72, -2.14, 0.24, 0.12, 0.1, livery.tailLamp ?? '#ff2634'),
      part(0.78, 0.58, 0.05, 0.08, 0.1, 2.4, livery.trim ?? '#f0f6f8'), // chrome strip
      part(-0.78, 0.58, 0.05, 0.08, 0.1, 2.4, livery.trim ?? '#f0f6f8'),
    ];
    // Keep the scattered panels in the road plane instead of burying them
    // under a tipped root and leaving only a vertical hull slab visible.
    kit.settle = { halfX: 2.6, halfZ: 2.6, height: 1.4, radius: 2.2, depth: 2.2, flatPieces: true };
    return kit;
  }
  if (id.includes('tram-stop') || id.includes('tram-flag') || id === 'tram-flag') {
    // Melbourne tram stop: pole + blue blade + white mark.
    return [
      part(0, 1.7, 0, 0.12, 3.4, 0.12, '#141618'),
      part(0.22, 3.05, 0, 0.36, 0.08, 0.08, '#141618'),
      part(0.55, 3.05, 0, 0.08, 0.72, 0.72, '#0077c8'),
      part(0.6, 3.05, 0, 0.05, 0.5, 0.5, '#f4f7fa'),
      part(0.62, 3.08, 0, 0.04, 0.14, 0.28, '#0a2a48'),
      part(0, 0.08, 0, 0.28, 0.12, 0.28, '#1a1e22'),
    ];
  }
  if (id.includes('signal') || id.includes('traffic')) {
    // Round-ish lamp voxels with a clear gap between red / amber / green.
    return [
      part(0, 2.2, 0, 0.22, 4.4, 0.22, '#1c1d20'),
      part(0.22, 4.15, 0, 0.42, 1.25, 0.28, '#121214'),
      part(0.42, 4.52, 0, 0.14, 0.14, 0.14, '#e22a1a'),
      part(0.42, 4.1, 0, 0.14, 0.14, 0.14, '#f0c020'),
      part(0.42, 3.68, 0, 0.14, 0.14, 0.14, '#3ad46a'),
      part(0, 0.12, 0, 0.45, 0.18, 0.45, '#2a2c30'),
    ];
  }
  // Ice-cream truck stage-3 easter egg: scatter ice cream on cones (not chassis bits).
  // Stages 1–2 slide the live van mesh instead — see Mischief.update.
  if (id.includes('ice-cream') || id.includes('icecream')) {
    const waffle = '#d4a060';
    const cherry = '#c43a2a';
    const scoops = ['#fff6f0', '#ffb6c8', '#8b5a2b', '#f0e68c', '#98d8c8', '#e8a0bf', '#f5d0a9', '#c4e0f0'];
    // Fewer larger cone assemblies so they read clearly in the scatter field.
    const slots = [
      [-1.1, 0.1, -0.55], [-0.2, 0.1, -0.5], [0.7, 0.12, -0.45],
      [-0.85, 0.1, 0.4], [0.15, 0.12, 0.45], [1.05, 0.1, 0.35],
    ];
    const out = [];
    slots.forEach(([x, y, z], i) => {
      const s0 = scoops[i % scoops.length];
      const s1 = scoops[(i + 3) % scoops.length];
      // Waffle cone (point down) — larger for board readability
      out.push(part(x, y + 0.42, z, 0.32, 0.9, 0.32, waffle));
      // Lower scoop
      out.push(part(x, y + 1.0, z, 0.55, 0.48, 0.55, s0));
      // Upper scoop
      out.push(part(x, y + 1.38, z, 0.46, 0.42, 0.46, s1));
      if (i % 2 === 0) {
        out.push(part(x, y + 1.68, z, 0.16, 0.16, 0.16, cherry));
      }
    });
    return out;
  }
  // Lifeguard tower — elevated lookout: stilts, open cabin, red roof, stairs, flag.
  if (id.includes('lifeguard')) {
    const timberLg = '#8a6238';
    const cabin = '#e8b84a';
    const roof = '#c43a2a';
    const metalLg = '#4a4a48';
    return [
      part(-0.85, 1.4, -0.7, 0.18, 2.75, 0.18, timberLg),
      part(0.85, 1.4, -0.7, 0.18, 2.75, 0.18, timberLg),
      part(-0.85, 1.4, 0.85, 0.18, 2.75, 0.18, timberLg),
      part(0.85, 1.4, 0.85, 0.18, 2.75, 0.18, timberLg),
      part(0, 2.8, 0.08, 2.15, 0.14, 2.0, timberLg), // deck
      part(0, 2.85, 1.25, 2.05, 0.1, 0.55, timberLg), // view lip
      part(0, 3.55, -0.85, 1.85, 1.35, 0.12, cabin), // cabin back
      part(-0.9, 3.55, -0.05, 0.12, 1.35, 1.55, cabin),
      part(0.9, 3.55, -0.05, 0.12, 1.35, 1.55, cabin),
      part(0, 3.1, 0.78, 1.75, 0.42, 0.1, cabin), // kick panel
      part(0, 4.35, 0.05, 2.25, 0.14, 2.15, roof), // roof
      part(0, 1.5, -1.35, 0.75, 0.12, 0.7, timberLg), // stairs mass
      part(0, 2.2, -1.05, 0.75, 0.12, 0.65, timberLg),
      part(1.15, 4.5, -0.55, 0.1, 3.2, 0.1, metalLg), // flagpole
      part(1.45, 5.9, -0.55, 0.55, 0.55, 0.08, roof), // flag
      part(-1.35, 0.7, 0.55, 0.25, 0.2, 1.65, cabin), // rescue board
      part(0, 0.06, 0, 1.9, 0.1, 1.9, '#5c4630'),
    ];
  }
  if (id.includes('tree-guard')) {
    return [
      part(-0.52, 0.52, -0.52, 0.10, 1.04, 0.10, metal),
      part(0.52, 0.52, -0.52, 0.10, 1.04, 0.10, metal),
      part(-0.52, 0.52, 0.52, 0.10, 1.04, 0.10, metal),
      part(0.52, 0.52, 0.52, 0.10, 1.04, 0.10, metal),
      part(0, 0.34, -0.52, 1.1, 0.10, 0.10, '#555c60'),
      part(0, 0.70, 0.52, 1.1, 0.10, 0.10, '#555c60'),
    ];
  }
  // V3.31 esplanade planter — a knocked planter must stay legible as a planter.
  //
  // Part ORDER is the whole design here, and `settle` below is the rest of it.
  //
  // Order: the kit declares its own standing line rather than taking the default 45 %,
  // so all thirteen parts of the boarded tub — four seaward courses, the landward and
  // end boards, three cleats and both lengths of capping rail — hold together and lean
  // as one object, while the bed, the loose soil and the whole planting are authored
  // after it and go over the side. Round 1 collapsed each face to a single flat panel to
  // fit the peel line, and at a 38° lean that showed unlit inner faces and read as dark
  // slabs rather than as a tub.
  //
  // Shapes: the five leaf mounds, the bloom clump and the two strap fans draw through
  // the shaped pools, so a leaning planter still has planting in it. Round 1 substituted
  // cuboids and the stage-1 plate read as a tipped crate of ice blocks.
  //
  // Local y = 0 is the deck surface the tub stands on; the live tub is 1.62 × 0.88 and
  // 0.62 high to the top of the cap chamfer, and these follow it course for course.
  if (id.includes('esplanade-planter')) {
    const board = variant % 2 ? '#a4764a' : '#8c6440';
    const boardPale = variant % 2 ? '#bb8c5c' : '#a2764c';
    const boardDamp = variant % 2 ? '#6a4c2e' : '#573c24';
    const cleat = variant % 2 ? '#7d5b39' : '#65482c';
    const capRail = variant % 2 ? '#e8bd85' : '#d8a468';
    const dirt = '#2c1b0d';
    const dirtPale = '#43301f';
    const kit = [
      // — the boarded tub: stays up and leans on its rim (indices 0…12) —
      part(0, 0.036, 0, 1.60, 0.072, 0.86, boardDamp),        // runners / base line
      part(0, 0.124, 0.413, 1.62, 0.104, 0.055, boardDamp),   // seaward boards, damp course
      part(0, 0.247, 0.413, 1.62, 0.104, 0.055, board),
      part(0, 0.370, 0.413, 1.62, 0.104, 0.055, board),
      part(0, 0.493, 0.413, 1.62, 0.104, 0.055, boardPale),   // salt-dry top course
      part(0, 0.310, -0.413, 1.62, 0.470, 0.055, board),      // landward boards
      part(-0.783, 0.310, 0, 0.055, 0.470, 0.88, board),      // end boards
      part(0.783, 0.310, 0, 0.055, 0.470, 0.88, board),
      part(-0.783, 0.310, 0.468, 0.115, 0.473, 0.115, cleat), // corner cleats
      part(0.783, 0.310, 0.468, 0.115, 0.473, 0.115, cleat),
      part(0, 0.310, 0.468, 0.115, 0.473, 0.115, cleat),      // mid cleat
      part(0, 0.571, 0.436, 1.776, 0.052, 0.165, capRail),    // capping rail, seaward
      part(0, 0.571, -0.436, 1.776, 0.052, 0.165, capRail),   // capping rail, landward
      // — the bed and the planting: spills and goes over (indices 13…23) —
      part(0.806, 0.571, 0, 0.165, 0.052, 0.71, capRail),     // sprung end length of rail
      part(0, 0.428, 0, 1.49, 0.110, 0.75, dirt),             // soil bed
      part(-0.30, 0.489, 0.04, 0.44, 0.030, 0.30, dirtPale),  // loose surface soil
      // Leaf mounds — rounded dome geometry through the shaped pool, not cuboids.
      part(-0.62, 0.610, 0.02, 0.44, 0.30, 0.40, '#b6bda6', null, 'leaf'),
      part(-0.29, 0.645, -0.05, 0.46, 0.34, 0.42, '#a8c246', null, 'leaf'),
      part(0.04, 0.620, 0.05, 0.44, 0.32, 0.40, '#5f9c3f', null, 'leaf'),
      part(0.37, 0.645, -0.02, 0.46, 0.34, 0.42, '#2f5c31', null, 'leaf'),
      part(0.66, 0.610, 0.03, 0.42, 0.30, 0.38, '#8d9a4c', null, 'leaf'),
      part(0.16, 0.730, 0.02, 0.17, 0.11, 0.17, '#e8cf3c', null, 'leaf'),   // bloom clump
      part(-0.44, 0.740, 0.03, 0.22, 0.46, 0.20, '#4f9138', null, 'blade'), // strap fan
      part(0.48, 0.720, -0.02, 0.20, 0.44, 0.18, '#4f9138', null, 'blade'),
    ];
    // Ground contract. `halfX` is the half-width the tub rocks over when it tips, so the
    // standing half rides up onto its edge instead of sinking through the boardwalk;
    // `radius` / `depth` keep every loose piece on this tub's own patch of deck, clear of
    // the tub 2.28 m away that shares its bay.
    kit.settle = {
      standing: 13, halfX: 0.888, halfZ: 0.518, height: 0.623, radius: 0.80, depth: 0.46,
    };
    return kit;
  }
  const size = target.size ?? { x: 0.7, y: 1.2, z: 0.5 };
  const width = Math.max(0.28, Math.min(1.35, size.x || 0.7));
  const depth = Math.max(0.22, Math.min(1.0, size.z || 0.5));
  const height = Math.max(0.65, Math.min(4.8, size.y || 1.2));
  const body = id.includes('bin') ? (variant % 2 ? '#3f6757' : '#42505a')
    : id.includes('fountain') ? '#66777d'
      : id.includes('pylon') || id.includes('tram-stop') ? '#4a4e54'
        : variant % 2 ? '#7e684d' : '#4e585d';
  return [
    part(0, height * 0.48, 0, width, height * 0.84, depth, body),
    part(0, height * 0.92, 0, width * 1.08, height * 0.16, depth * 1.08, '#b69a62'),
    part(width * 0.28, height * 0.68, depth * 0.51, width * 0.22, height * 0.18, 0.05, '#d8c98b'),
    part(-width * 0.25, height * 0.22, 0, width * 0.18, height * 0.22, depth * 0.7, metal),
    part(width * 0.25, height * 0.22, 0, width * 0.18, height * 0.22, depth * 0.7, metal),
  ];
}

/**
 * Legacy fallback for a tree with no attached kit.
 *
 * It reproduces the single primitive tree the board shipped before V3.31 — a trunk box and one
 * horizontal oval crown — and it is deliberately left alone rather than improved, because its
 * 2.8 m floor is load-bearing for any caller still declaring a size tuned around it. A lane that
 * has rebuilt its trees should attach a `voxelKit` (see `voxelKitFromMeshes`) and declare its
 * true height; `componentsFor` prefers the kit, and this is then never reached.
 */
function treeComponents(target, _variant) {
  const height = Math.max(2.8, Math.min(12, target.size?.y ?? 5.2));
  const trunkHeight = height * 0.42;
  const trunkW = height * 0.09;
  const halfLen = height * 0.72;
  const halfWid = height * 0.38;
  const halfH = height * 0.28;
  const canopyY = trunkHeight + halfH * 0.92;
  return [
    part(0, trunkHeight / 2, 0, trunkW, trunkHeight, trunkW, '#4a3220'),
    // Long horizontal oval: X length ≫ Y height
    part(0, canopyY, 0, halfLen * 2, halfH * 2, halfWid * 2, '#3a5a32'),
  ];
}

function tramComponents(target, variant) {
  // Authored W / E-class kit matching the live hull's factory Melbourne colours
  // (burgundy/cream W, cream/blue E) — not a single grey AABB.
  const isE = variant % 2 === 1 || String(target.model ?? '').includes('e-class');
  const L = Math.max(11, target.size?.x ?? (isE ? 16.5 : 13.9));
  const H = Math.max(2.8, target.size?.y ?? (isE ? 3.6 : 3.28));
  const W = Math.max(2.3, target.size?.z ?? 2.66);
  const body = isE ? '#c4b49a' : '#8a2428';
  const cream = isE ? '#d8cfc0' : '#e6d2a8';
  const stripe = isE ? '#1e3a5f' : '#e6d2a8';
  const roof = isE ? '#3a3c40' : '#2c241c';
  const skirt = '#2a2c30';
  const glass = '#1a2830';
  const bogie = '#1c1e20';
  const lamp = '#f0c44c';
  const half = L * 0.48;
  const door = isE ? '#1e3a5f' : '#8a2428';
  return [
    part(0, H * 0.07, 0, L * 0.94, H * 0.09, W * 0.80, skirt),
    part(-L * 0.32, H * 0.09, 0, L * 0.15, H * 0.12, W * 0.88, bogie),
    part(0, H * 0.09, 0, L * 0.15, H * 0.12, W * 0.88, bogie),
    part(L * 0.32, H * 0.09, 0, L * 0.15, H * 0.12, W * 0.88, bogie),
    part(-half, H * 0.15, 0, L * 0.07, H * 0.10, W * 0.74, skirt),
    part(half, H * 0.15, 0, L * 0.07, H * 0.10, W * 0.74, skirt),
    part(0, H * 0.34, 0, L * 0.96, H * 0.34, W * 0.92, body),
    part(-L * 0.18, H * 0.36, W * 0.47, L * 0.16, H * 0.38, 0.06, door),
    part(L * 0.18, H * 0.36, W * 0.47, L * 0.16, H * 0.38, 0.06, door),
    part(0, H * 0.54, W * 0.47, L * 0.90, H * 0.06, 0.05, stripe),
    part(0, H * 0.54, -W * 0.47, L * 0.90, H * 0.06, 0.05, stripe),
    part(0, H * 0.72, W * 0.45, L * 0.78, H * 0.26, 0.05, glass),
    part(0, H * 0.72, -W * 0.45, L * 0.78, H * 0.26, 0.05, glass),
    part(-half * 0.96, H * 0.64, 0, 0.06, H * 0.28, W * 0.62, glass),
    part(half * 0.96, H * 0.64, 0, 0.06, H * 0.28, W * 0.62, glass),
    part(0, H * 0.84, 0, L * 0.74, H * 0.22, W * 0.80, cream),
    part(0, H * 0.98, 0, L * 0.70, H * 0.10, W * 0.72, roof),
    part(0, H * 1.10, 0, 0.22, H * 0.16, 0.16, '#4a4e52'),
    part(-half, H * 0.42, W * 0.28, 0.10, 0.12, 0.12, lamp),
    part(-half, H * 0.42, -W * 0.28, 0.10, 0.12, 0.12, lamp),
    part(half, H * 0.42, W * 0.28, 0.10, 0.12, 0.12, lamp),
    part(half, H * 0.42, -W * 0.28, 0.10, 0.12, 0.12, lamp),
  ];
}

function busComponents(target) {
  const L = Math.max(7.2, target.size?.z ?? target.size?.x ?? 8.6);
  const H = Math.max(2.8, target.size?.y ?? 3.37);
  const W = Math.max(2.2, target.size?.x ?? 2.64);
  const amber = '#b4740a';
  const navy = '#142a4c';
  const flash = '#b32d16';
  const glass = '#152230';
  const rubber = '#1c1e20';
  const bumper = '#0e1c33';
  const half = L * 0.46;
  return [
    part(0, H * 0.10, 0, W * 0.92, H * 0.10, L * 0.90, bumper),
    part(-W * 0.38, H * 0.12, -L * 0.28, 0.42, 0.28, 0.42, rubber),
    part(W * 0.38, H * 0.12, -L * 0.28, 0.42, 0.28, 0.42, rubber),
    part(-W * 0.38, H * 0.12, L * 0.28, 0.42, 0.28, 0.42, rubber),
    part(W * 0.38, H * 0.12, L * 0.28, 0.42, 0.28, 0.42, rubber),
    part(0, H * 0.36, 0, W * 0.96, H * 0.38, L * 0.94, amber),
    part(0, H * 0.54, W * 0.49, L * 0.02, H * 0.10, L * 0.88, flash),
    part(0, H * 0.54, -W * 0.49, L * 0.02, H * 0.10, L * 0.88, flash),
    part(0, H * 0.72, 0, W * 0.90, H * 0.32, L * 0.72, navy),
    part(0, H * 0.74, W * 0.46, W * 0.04, H * 0.24, L * 0.58, glass),
    part(0, H * 0.74, -W * 0.46, W * 0.04, H * 0.24, L * 0.58, glass),
    part(0, H * 0.72, -half, W * 0.72, H * 0.28, 0.06, glass),
    part(0, H * 0.96, 0, W * 0.82, H * 0.10, L * 0.70, '#9c650a'),
    part(-W * 0.28, H * 0.42, -half, 0.22, 0.12, 0.10, '#ffeccd'),
    part(W * 0.28, H * 0.42, -half, 0.22, 0.12, 0.10, '#ffeccd'),
    part(-W * 0.28, H * 0.46, half, 0.20, 0.10, 0.08, '#e00a18'),
    part(W * 0.28, H * 0.46, half, 0.20, 0.10, 0.08, '#e00a18'),
  ];
}

function componentsFor(target, variant) {
  if (target.kind === 'tree') {
    // Prefer a measured kit when the foliage layer attached one, exactly as `tram` does below.
    //
    // This path did not exist until V3.31. `treeComponents` hard-codes the single primitive tree
    // the board shipped before that round — a trunk box and one horizontal oval — and was reached
    // unconditionally, so a lane that rebuilt the tree into limbs and separate crown masses had no
    // way to say so, and its damaged state fell back to two boxes at a floored size. The trees
    // seat worked around it by declaring a quarter-height so the floor would clamp to something
    // survivable, which is a workaround for this line rather than a property of trees.
    if (target.voxelKit?.length) return target.voxelKit;
    return treeComponents(target, variant);
  }
  if (target.kind === 'tram') {
    // Always the authored livery kit. A GLB AABB kit is one unlit grey box.
    return tramComponents(target, variant);
  }
  if (target.kind === 'bus') return busComponents(target);
  // Authoritative path: voxel AABB kit extracted from the live procedural/GLB model.
  if (target.voxelKit?.length) return target.voxelKit;
  return propComponents(target, variant);
}

function nextVariant(record) {
  // Props alternate finish only. Trees hold variant 0: since V3.31 the board draws four tree
  // silhouettes, but the species is chosen by the foliage layer's own hash and is a property of
  // the tree rather than of its damage, so cycling a variant here would change which tree it is
  // when it is hit.
  if (record.target.kind === 'tree') return 0;
  if (isRailTarget(record.target)) return record.variant;
  return (record.variant + 1) % 2;
}

function variantLabel(target, variant) {
  if (target.kind === 'tree') {
    return 'tree';
  }
  if (target.kind === 'tram') return variant % 2 ? 'e-class-tram:livery-cream-blue' : 'w-class-tram:livery-red-cream';
  if (target.kind === 'bus') return 'route-bus:livery-amber-navy';
  if (String(target.model).includes('bench')) return variant % 2 ? 'bench:spotted-gum' : 'bench:blackwood';
  if (String(target.model).includes('picnic')) return variant % 2 ? 'picnic:spotted-gum' : 'picnic:blackwood';
  return `${target.model}:finish-${variant % 2}`;
}

/**
 * Renderer-local controller. `targets` are render adapters, never City or Run objects.
 * That narrow constructor is the serialization firewall tested in core.test.mjs.
 */
export class Mischief {
  constructor(scene, targets, {
    seed,
    vfx = null,
    reducedMotion = false,
    canTap = () => true,
    onImpact = () => {},
  } = {}) {
    this.scene = scene;
    this.targets = new Map(targets.map((target) => [target.key, target]));
    this.reducedMotion = reducedMotion;
    this.vfx = vfx;
    this.canTap = canTap;
    this.onImpact = onImpact;
    this.seed = seed;
    this.time = 0;
    this.order = 0;
    this.disposed = false;

    this.records = new Map();
    for (const target of targets) {
      this.records.set(target.key, this._recordFor(target));
    }

    this._buildPools();
    this._writePools();
  }

  _recordFor(target) {
    const rng = stream(this.seed, `mischief:${target.key}`);
    return {
        target,
        rng,
        open: false,
        openK: 0,
        openAnim: null,
        hits: 0,
        stage: 0,
        stageAge: 0,
        damagedOrder: null,
        brokenAt: null,
        repairing: false,
        repairAge: 0,
        tumble: null,
        sway: createSway(profileFor(target), rng, {
          heading: ['lamp', 'prop', 'tree'].includes(swayKindFor(target)) ? 0 : undefined,
        }),
        variant: target.kind === 'tree'
          ? treeVariantIndex(target.model)
          : target.kind === 'tram' && String(target.model).includes('e-class') ? 1 : 0,
        scatter: Array.from({ length: MAX_AUTHORED_COMPONENTS }, () => {
          const angle = rng.range(0, Math.PI * 2);
          const radius = Math.sqrt(rng.unit()) * 1.5;
          return {
            x: Math.cos(angle) * radius,
            z: Math.sin(angle) * radius,
            r: rng.range(-0.7, 0.7),
            // Seeded fall height used when stage 3 scatters pieces.
            launch: rng.range(0.6, 1.6),
          };
        }),
        passing: null,
        fallHeading: null,
      };
  }

  syncTargets(targets) {
    if (this.disposed) return;
    const next = new Map(targets.map((target) => [target.key, target]));
    for (const [key, record] of [...this.records]) {
      const target = next.get(key);
      if (target && target === record.target) continue;
      record.target.setOpen?.(0);
      for (const mesh of record.authoredMeshes ?? []) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      for (const part of record.target.voxelKit ?? []) if (part.owned) part.sourceGeometry.dispose();
      this.records.delete(key);
    }
    this.targets = next;
    for (const target of targets) {
      if (!this.records.has(target.key)) {
        this.records.set(target.key, this._recordFor(target));
      }
    }
    this._writePools();
  }

  _buildPools() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.setAttribute('mischiefDamage', new THREE.InstancedBufferAttribute(new Float32Array(BODY_CAPACITY), 1));
    const material = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.72,
      metalness: 0.02,
      vertexColors: false,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float mischiefDamage;\nvarying float vMischiefDamage;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMischiefDamage = mischiefDamage;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vMischiefDamage;')
        .replace('float roughnessFactor = roughness;', 'float roughnessFactor = clamp(roughness + vMischiefDamage * 0.12, 0.0, 1.0);');
    };
    material.customProgramCacheKey = () => 'district-deck-mischief-roughness-v1';
    this.body = new THREE.InstancedMesh(geometry, material, BODY_CAPACITY);
    this.body.name = 'mischief:pooled-components';
    this.body.count = 0;
    this.body.frustumCulled = false;
    // Damaged voxel pieces cast so tip/scatter seats in the lit diorama.
    this.body.castShadow = true;
    this.body.receiveShadow = false;
    this.scene.add(this.body);

    // Shaped pools. A rounded lump and a strap leaf, so a damaged planted prop keeps its
    // planting instead of substituting a cuboid for every shrub. Spherical normals on the
    // icosahedron for the same reason the live planter uses them: a 20-face solid with
    // per-face normals shades as a cut gem.
    const leafGeometry = new THREE.IcosahedronGeometry(0.5, 0);
    {
      const pos = leafGeometry.attributes.position;
      const nrm = leafGeometry.attributes.normal;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i).normalize();
        nrm.setXYZ(i, v.x, v.y, v.z);
      }
      nrm.needsUpdate = true;
    }
    const shapedMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.88,
      metalness: 0.0,
    });
    this.leafBody = new THREE.InstancedMesh(leafGeometry, shapedMaterial, LEAF_CAPACITY);
    this.leafBody.name = 'mischief:pooled-leaves';
    this.leafBody.count = 0;
    this.leafBody.frustumCulled = false;
    this.leafBody.castShadow = true;
    this.leafBody.receiveShadow = false;
    this.scene.add(this.leafBody);

    this.bladeBody = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.5, 1, 3), shapedMaterial, BLADE_CAPACITY,
    );
    this.bladeBody.name = 'mischief:pooled-blades';
    this.bladeBody.count = 0;
    this.bladeBody.frustumCulled = false;
    this.bladeBody.castShadow = true;
    this.bladeBody.receiveShadow = false;
    this.scene.add(this.bladeBody);

    const hazardGeometry = new THREE.SphereGeometry(1, 6, 4);
    const hazardMaterial = new THREE.MeshBasicMaterial({ color: '#ffb12f' });
    this.hazards = new THREE.InstancedMesh(hazardGeometry, hazardMaterial, HAZARD_CAPACITY);
    this.hazards.name = 'mischief:tram-hazards';
    this.hazards.count = 0;
    this.hazards.frustumCulled = false;
    this.scene.add(this.hazards);
  }

  setGuard(canTap) {
    this.canTap = canTap;
  }

  setImpact(onImpact) {
    this.onImpact = onImpact;
  }

  setReducedMotion(on) {
    this.reducedMotion = on;
  }

  pick(raycaster) {
    const proxies = Array.from(this.targets.values(), (target) => target.pickProxy);
    const hit = raycaster.intersectObjects(proxies, false)[0];
    return hit ? { kind: 'prop', key: hit.object.userData.mischiefKey, distance: hit.distance } : null;
  }

  tap(key) {
    if (this.disposed || !this.canTap()) return { accepted: false, reason: 'guarded' };
    const record = this.records.get(key);
    if (!record || record.repairing) return { accepted: false, reason: 'unavailable' };

    if (record.target.kind === 'opening') {
      record.open = !record.open;
      record.openAnim = {
        from: record.openK ?? 0,
        to: record.open ? 1 : 0,
        t: 0,
        duration: this.reducedMotion ? 0 : 0.38,
      };
      if (this.reducedMotion) {
        record.openK = record.openAnim.to;
        record.target.setOpen?.(record.openK);
        record.openAnim = null;
      }
      this.onImpact();
      return {
        accepted: true,
        key,
        open: record.open,
        kind: 'opening',
        hits: record.hits,
        stage: 0,
      };
    }

    if (record.hits === 0) {
      const damaged = Array.from(this.records.values())
        .filter((item) => item.hits > 0 || item.repairing)
        .sort((a, b) => a.damagedOrder - b.damagedOrder);
      if (damaged.length >= MISCHIEF_MAX_DAMAGED) this._instantRepair(damaged[0]);
      record.damagedOrder = ++this.order;
      if (mischiefKindOf(record.target) === 'car') record.target.setStopped?.(true);
    }

    const previousStage = record.stage;
    record.hits += 1;
    impulseSway(record.sway, profileFor(record.target), record.rng);
    record.stage = stageForHits(record.hits, record.target);
    if (record.stage !== previousStage) {
      record.stageAge = 0;
      if (record.target.kind === 'tree' && record.stage === 3) {
        record.fallHeading = stagedTreeFallHeading(
          record,
          record.sway.thetaX,
          record.sway.thetaZ,
        );
        record.tumble = {
          // Clamp so a tap-storm (no frame between hits) still animates the tip.
          from: Math.min(0.32, swayAmplitude(record.sway)),
          to: TREE_FALL_ANGLE,
          t: 0,
          duration: this.reducedMotion ? 0 : TREE_FALL_DURATION,
        };
      } else if (record.target.kind === 'tree') {
        record.tumble = null;
      } else {
        // Short tumble from the prior lean into the new stage angle.
        record.tumble = {
          from: stageTilt(previousStage),
          to: stageTilt(record.stage),
          t: 0,
          duration: this.reducedMotion ? 0 : MISCHIEF_TUMBLE_DURATION,
        };
      }
    }
    if (record.stage === 3 && previousStage !== 3) {
      record.brokenAt = this.time;
      record.target.setStopped?.(true);
      if (record.target.kind === 'tram') record.passing = { t: 0 };
      // Ice-cream: hide the live van immediately so the cone kit is the only read.
      if (isIceCreamTarget(record.target)) {
        record.target.setOriginal({ visible: false, scale: 1, slide: 0 });
      }
    }

    const position = record.target.getPose().position;
    const intensity = record.stage === 3 ? 1.15
      : record.stage === 2 ? 0.85
        : record.stage === 1 ? 0.6
          : 0.18;
    const isTree = record.target.kind === 'tree';
    const isIce = isIceCreamTarget(record.target);
    const debris = isTree ? '#7a6a48'
      : record.target.kind === 'tram' ? '#d4a020'
        : isIce ? (record.stage >= 3 ? '#ffb6c8' : '#f4a7c0')
          : '#b99a72';
    const fxAt = isTree
      ? treeFxOrigin(record, position)
      : position;
    // Same language as lamps: tip dust, rising motes, ground ring. Trees use
    // leaf-litter / bark, not the lime cubes that used to stand in for a crown.
    if (this.vfx?.tip && record.stage >= 1) {
      this.vfx.tip(fxAt, {
        seed: this.seed,
        eventId: `mischief:${key}:h${record.hits}`,
        colour: debris,
        intensity: isTree ? intensity * 0.92 : intensity,
      });
    }
    if (record.stage >= 1 && !this.reducedMotion) {
      this.vfx?.burst?.(isTree ? { ...fxAt, y: position.y + (record.target.size?.y ?? 5.2) * 0.65 } : fxAt, {
        colour: isTree ? record.target.canopyColour : debris,
        leaf: isTree,
        puff: record.target.kind === 'prop',
        count: record.stage >= 3 ? 22 : record.stage >= 2 ? 14 : 9,
        spread: record.stage >= 3 ? 3.2 : record.stage >= 2 ? 2.4 : 2.0,
      });
      this.vfx?.ring?.(fxAt, {
        colour: record.stage >= 3 ? (isTree ? '#8a6a38' : '#e07040') : debris,
        radius: record.stage >= 3 ? 3.6 : record.stage >= 2 ? 2.8 : 2.4,
        duration: 0.45,
      });
    } else if (record.stage >= 1) {
      this.vfx?.ring?.(fxAt, { colour: debris, radius: 2.2, duration: 0.35 });
    }
    this.onImpact();
    this._poseLive(record, true);
    this._writePools();
    return {
      accepted: true,
      key,
      hits: record.hits,
      stage: record.stage,
      energy: record.sway.energy,
      sway: swayAmplitude(record.sway),
    };
  }

  _instantRepair(record) {
    record.variant = nextVariant(record);
    record.target.setVariant(record.variant);
    resetSway(record.sway);
    record.target.setOriginal({ visible: true, scale: 1, slide: 0, swayX: 0, swayZ: 0 });
    record.target.setSway?.({ x: 0, z: 0, energy: 0 });
    record.target.setStopped?.(false);
    record.hits = 0;
    record.stage = 0;
    record.stageAge = 0;
    record.damagedOrder = null;
    record.brokenAt = null;
    record.repairing = false;
    record.repairAge = 0;
    record.tumble = null;
    record.passing = null;
    record.fallHeading = null;
    if (record.target.kind === 'tree') {
      record.target.setFall?.({ angle: 0, heading: 0 });
      record.target.setDamageLevel?.(0);
    }
  }

  _beginRepair(record) {
    record.repairing = true;
    record.repairAge = 0;
    record.tumble = null;
    record.variant = nextVariant(record);
    record.target.setVariant(record.variant);
    resetSway(record.sway);
    record.target.setOriginal({
      visible: true, scale: this.reducedMotion ? 1 : 0.02, slide: 0, swayX: 0, swayZ: 0,
    });
    record.target.setSway?.({ x: 0, z: 0, energy: 0 });
    record.target.setStopped?.(true);
    record.passing = null;
    record.fallHeading = null;
    if (record.target.kind === 'tree') {
      record.target.setFall?.({ angle: 0, heading: 0 });
      record.target.setDamageLevel?.(0);
    }
    if (this.reducedMotion) this._finishRepair(record);
  }

  _finishRepair(record) {
    resetSway(record.sway);
    record.target.setOriginal({ visible: true, scale: 1, slide: 0, swayX: 0, swayZ: 0 });
    record.target.setSway?.({ x: 0, z: 0, energy: 0 });
    record.target.setFall?.({ angle: 0, heading: 0 });
    record.target.setDamageLevel?.(0);
    record.target.setStopped?.(false);
    record.hits = 0;
    record.stage = 0;
    record.stageAge = 0;
    record.damagedOrder = null;
    record.brokenAt = null;
    record.repairing = false;
    record.repairAge = 0;
    record.tumble = null;
    record.passing = null;
    record.fallHeading = null;
  }

  update(dt) {
    if (this.disposed) return;
    this.time += dt;
    for (const record of this.records.values()) {
      if (record.target.kind === 'opening') {
        if (record.openAnim) {
          record.openAnim.t += dt;
          const u = Math.min(1, record.openAnim.t / Math.max(1e-4, record.openAnim.duration));
          const e = 1 - (1 - u) ** 3;
          record.openK = record.openAnim.from + (record.openAnim.to - record.openAnim.from) * e;
          record.target.setOpen?.(record.openK);
          if (u >= 1) record.openAnim = null;
        }
        continue;
      }
      if (record.hits > 0) record.stageAge += dt;
      if (record.tumble) {
        record.tumble.t += dt;
        if (record.tumble.t >= record.tumble.duration) record.tumble = null;
      }
      if (record.passing) record.passing.t = Math.min(1.08, record.passing.t + dt / 4.8);
      const wasSwaying = record.sway.active;
      stepSway(record.sway, profileFor(record.target), dt, { reducedMotion: this.reducedMotion });
      if (record.stage === 3 && !record.repairing && this.time - record.brokenAt >= MISCHIEF_REPAIR_DELAY) {
        this._beginRepair(record);
      }
      if (record.repairing) {
        record.repairAge += dt;
        const k = Math.min(1, record.repairAge / MISCHIEF_REPAIR_DURATION);
        record.target.setOriginal({
          visible: true, scale: Math.max(0.02, easeOutBack(k)), slide: 0, swayX: 0, swayZ: 0,
        });
        record.target.setSway?.({ x: 0, z: 0, energy: 0 });
        if (k >= 1) this._finishRepair(record);
      } else {
        this._poseLive(record, wasSwaying);
      }
    }
    this._writePools();
  }

  /**
   * Live mesh stays up through the sway window (stage 0). Voxel kits take over
   * at stage 1+. Trees keep the live bole through stages 1–2 and fall it at 3.
   */
  _poseLive(record, wasSwaying) {
    const swayX = record.sway.thetaX;
    const swayZ = record.sway.thetaZ;
    const energy = record.sway.energy;
    if (isIceCreamTarget(record.target)) {
      if (record.stage >= 3) {
        record.target.setOriginal({ visible: false, scale: 1, slide: 0, swayX: 0, swayZ: 0 });
      } else if (record.stage >= 1) {
        record.target.setOriginal({
          visible: true,
          scale: 1,
          slide: iceCreamSlideFor(record, record.stage),
          swayX,
          swayZ,
        });
      } else {
        record.target.setOriginal({ visible: true, scale: 1, slide: 0, swayX, swayZ });
      }
    } else if (isRailTarget(record.target)) {
      // Live hull stays up through the sideways nudge. The kit only appears
      // when the vehicle actually comes apart at stage 3.
      const hide = record.stage >= 3 && !record.repairing;
      const lean = record.stage >= 1 && record.stage < 3
        ? this._tiltAngleFor(record, record.stage)
        : 0;
      record.target.setOriginal({
        visible: !hide,
        scale: 1,
        slide: railSlideFor(record, record.stage),
        swayX: swayX + lean,
        swayZ,
      });
    } else if (record.target.kind === 'tree') {
      // Live bole + crown stay the tree. Stage 3 tips them over about the pit;
      // the pooled box kit is never drawn.
      record.target.setOriginal({
        visible: true,
        scale: 1,
        slide: 0,
        swayX: record.stage >= 3 ? 0 : swayX,
        swayZ: record.stage >= 3 ? 0 : swayZ,
      });
      if (record.target.setDamageLevel) record.target.setDamageLevel(record.stage);
      else record.target.setDamaged?.(record.stage >= 2);
      if (record.stage >= 3) {
        if (record.fallHeading == null) {
          record.fallHeading = stagedTreeFallHeading(record, swayX, swayZ);
        }
        record.target.setFall?.({
          angle: this._treeFallAngle(record),
          heading: record.fallHeading,
        });
      } else {
        record.target.setFall?.({ angle: 0, heading: 0 });
      }
    } else {
      // Stage 0: live mesh rocks. Stage 1+: voxels own the read; hide the intact prop.
      record.target.setOriginal({
        visible: record.stage === 0,
        scale: 1,
        slide: 0,
        swayX,
        swayZ,
      });
    }
    if (wasSwaying || record.sway.active || record.target.kind === 'tree') {
      record.target.setSway?.({ x: swayX, z: swayZ, energy });
    }
  }

  _treeFallAngle(record) {
    if (this.reducedMotion || !record.tumble || record.tumble.duration <= 0) {
      return TREE_FALL_ANGLE;
    }
    const k = Math.min(1, record.tumble.t / record.tumble.duration);
    return record.tumble.from + (record.tumble.to - record.tumble.from) * easeTreeFall(k);
  }

  _tiltAngleFor(record, stage) {
    const base = stageTilt(stage);
    if (record.tumble && record.tumble.duration > 0) {
      const k = Math.min(1, record.tumble.t / record.tumble.duration);
      const eased = easeTumble(k);
      return record.tumble.from + (record.tumble.to - record.tumble.from) * eased;
    }
    // Residual stage-1 rattle so a knock still reads without a full stage change.
    let angle = base;
    if (stage === 1 && !this.reducedMotion && record.stageAge < 0.34) {
      angle += Math.sin(record.stageAge * 76) * (1 - record.stageAge / 0.34) * 2.2 * DEG;
    }
    // Leftover tap-sway keeps a damaged kit from going dead-still.
    if (record.sway && record.sway.active && !this.reducedMotion) {
      angle += record.sway.thetaZ * 0.55;
    }
    return angle;
  }

  _poseForRecord(record) {
    const pose = record.target.getPose();
    if (!record.repairing || record.target.kind !== 'tram') return pose;
    const k = Math.min(1, record.repairAge / MISCHIEF_REPAIR_DURATION);
    const exit = record.target.linePose?.(0) ?? pose;
    return {
      position: pose.position.clone().lerp(exit.position, k),
      quaternion: pose.quaternion.clone(),
    };
  }

  _appendTarget(record, matrices, colours, damages, { passing = false, shaped = null } = {}) {
    const target = record.target;
    const stage = passing ? 0 : record.stage;
    const isIce = isIceCreamTarget(target);
    const pose = passing
      ? (target.linePose?.(record.passing.t) ?? target.getPose())
      : this._poseForRecord(record);
    const components = componentsFor(target, passing ? nextVariant(record) : record.variant);
    /**
     * Ground contract, declared by an authored kit and absent everywhere else.
     *
     * Without it a tipped kit rotates every piece about the prop's origin, so the leading
     * corner of the standing half sinks through whatever the prop stands on and the peeled
     * half is lofted along the tilt into mid-air — on the round-1 planter plates the debris
     * hung above the boardwalk and landed on the neighbouring intact tub. With it, the
     * standing half is lifted so its lowest corner meets the plane it stands on, and every
     * loose piece is placed in the plane's own frame and clamped to the prop's footprint.
     */
    const settle = components.settle ?? null;
    const root = new THREE.Matrix4();
    const tilt = new THREE.Quaternion();
    // Ice-cream cones scatter upright — no 92° root tip (that buried the kit).
    const tiltAngle = isIce ? 0 : this._tiltAngleFor(record, stage);
    tilt.setFromAxisAngle(target.kind === 'tram' ? X_AXIS : Z_AXIS, tiltAngle);
    if (!isIce && record.sway?.active) {
      const extra = new THREE.Quaternion().setFromAxisAngle(X_AXIS, record.sway.thetaX * 0.55);
      tilt.multiply(extra);
    }
    const rootQuaternion = pose.quaternion.clone().multiply(tilt);
    const lift = settle
      ? settle.halfX * Math.abs(Math.sin(tiltAngle))
        + settle.height * Math.max(0, -Math.cos(tiltAngle))
      : 0;
    const rootPosition = lift
      ? pose.position.clone().setY(pose.position.y + lift)
      : pose.position;
    root.compose(rootPosition, rootQuaternion, new THREE.Vector3(1, 1, 1));
    // Loose pieces are authored in the ground plane's frame and then pulled back through
    // the tilt, so a piece placed at rest height 0.06 is 0.06 above the deck whatever the
    // tub is doing above it.
    const tiltInverse = settle ? tilt.clone().invert() : null;
    const toGround = (dx, restY, dz, spin) => {
      const p = new THREE.Vector3(
        Math.max(-settle.halfX * 1.18, Math.min(settle.halfX * 1.18, dx)),
        restY - lift,
        Math.max(-settle.halfZ * 1.30, Math.min(settle.halfZ * 1.30, dz)),
      ).applyQuaternion(tiltInverse);
      const q = new THREE.Quaternion().setFromAxisAngle(UP, spin).premultiply(tiltInverse);
      return { p, q };
    };

    // Stage-3 scatter fall: pieces arc from the body into their rest offsets.
    const fallT = stage === 3 && !this.reducedMotion
      ? Math.min(1, record.stageAge / MISCHIEF_SCATTER_FALL)
      : 1;
    const fallEase = 1 - Math.pow(1 - fallT, 2);

    const n = target.authoredGeometry ? components.length : Math.min(MAX_AUTHORED_COMPONENTS, components.length);
    // Peel threshold: upper ~half of the kit (by sorted y) starts detaching at stage 2.
    // An authored kit may name its own line so the whole boarded body stays up together.
    const peelFrom = settle?.standing
      ? Math.max(1, Math.min(n - 1, settle.standing))
      : Math.max(1, Math.floor(n * 0.45));
    // Stage-2 peel fall: upper pieces drop to the ground near the body.
    const peelT = stage === 2 && !this.reducedMotion
      ? Math.min(1, record.stageAge / MISCHIEF_PEEL_FALL)
      : (stage >= 2 ? 1 : 0);
    const peelEase = 1 - Math.pow(1 - peelT, 2);

    components.slice(0, n).forEach((component, index) => {
      const local = component.position.clone();
      const localRotation = component.rotation?.clone?.() ?? new THREE.Quaternion();
      const scatter = record.scatter[index] ?? record.scatter[0];
      // Stage 1: top pieces crack loose and rattle — kit still reads as the prop.
      if (stage === 1 && !isIce) {
        if (index >= n - 2) {
          local.x += 0.07 * (index % 2 ? 1 : -1);
          local.y += 0.05;
          local.z += 0.04 * (index % 2 ? -1 : 1);
        } else if (index >= peelFrom) {
          local.x += 0.02 * (index % 2 ? 1 : -1);
        }
      }
      // Stage 2: upper half peels off and falls beside the still-standing base.
      if (stage === 2 && !isIce && index >= peelFrom && settle) {
        // Grounded peel: the piece leaves its place on the tub and comes to rest on the
        // deck beside it, inside the tub's own footprint, never above it and never on the
        // neighbour. The loft is added in the ground frame so it decays to nothing.
        const restY = Math.max(component.scale.y * 0.34, 0.05);
        const loft = scatter.launch * 0.42 * Math.sin(peelT * Math.PI) * (1 - peelT * 0.35);
        const dx = component.position.x * (1 - peelEase) + scatter.x * settle.radius * peelEase;
        const dz = component.position.z * (1 - peelEase) + scatter.z * settle.depth * peelEase;
        const startY = Math.max(component.position.y, component.scale.y * 0.5);
        const dy = startY * (1 - peelEase) + restY * peelEase + loft;
        const g = toGround(dx, dy, dz, scatter.r * peelEase * 1.8);
        local.copy(g.p);
        localRotation.copy(g.q);
        const tumble = new THREE.Quaternion().setFromAxisAngle(
          X_AXIS,
          peelEase * (40 * DEG + scatter.r * 0.5),
        );
        localRotation.multiply(tumble);
      } else if (stage === 2 && !isIce && index >= peelFrom) {
        const radius = target.kind === 'tree' ? 1.6 : target.kind === 'tram' ? 1.4 : 1.15;
        const restY = Math.max(component.scale.y * 0.32, 0.06);
        const startY = Math.max(component.position.y, component.scale.y * 0.5);
        const loft = scatter.launch * 0.85 * Math.sin(peelT * Math.PI) * (1 - peelT * 0.35);
        local.x = component.position.x * (1 - peelEase) + scatter.x * radius * peelEase;
        local.z = component.position.z * (1 - peelEase) + scatter.z * radius * peelEase;
        local.y = startY * (1 - peelEase) + restY * peelEase + loft;
        localRotation.setFromAxisAngle(UP, scatter.r * peelEase * 1.8);
        const tumble = new THREE.Quaternion().setFromAxisAngle(
          X_AXIS,
          peelEase * (55 * DEG + scatter.r * 0.6),
        );
        localRotation.multiply(tumble);
      } else if (stage === 2 && !isIce && index < peelFrom) {
        // Base stack shears slightly while the top falls away.
        local.x += (index % 2 ? 0.04 : -0.03);
        local.y += 0.02;
      }
      // Stage 3: full scatter — every piece arcs out into a debris field. A settling kit
      // spreads across the deck it stands on rather than into the air above it, and every
      // piece finishes flat on that deck inside its own footprint.
      if (stage === 3 && settle) {
        const thin = Math.min(component.scale.x, component.scale.y, component.scale.z);
        const restY = settle.flatPieces ? thin * 0.5 + 0.03 : Math.max(component.scale.y * 0.30, 0.05);
        const startY = Math.max(component.position.y, component.scale.y * 0.55);
        const loft = scatter.launch * 0.55 * Math.sin(fallT * Math.PI) * (1 - fallT * 0.28);
        const dx = component.position.x * (1 - fallEase) + scatter.x * settle.radius * 1.25 * fallEase;
        const dz = component.position.z * (1 - fallEase) + scatter.z * settle.depth * 1.15 * fallEase;
        const dy = startY * (1 - fallEase) + restY * fallEase + loft;
        const g = toGround(dx, dy, dz, scatter.r * fallEase * 2.2);
        local.copy(g.p);
        localRotation.copy(g.q);
        if (settle.flatPieces && thin < component.scale.y) {
          localRotation.multiply(new THREE.Quaternion().setFromAxisAngle(
            thin === component.scale.x ? Z_AXIS : X_AXIS, Math.PI * 0.5,
          ));
        }
        if (fallT < 1) {
          const spin = new THREE.Quaternion().setFromAxisAngle(X_AXIS, fallEase * scatter.r * 2.0);
          localRotation.multiply(spin);
        }
      } else if (stage === 3) {
        const radius = isIce ? 2.6 : target.kind === 'tree' ? 2.4 : target.kind === 'tram' ? 2.0 : 1.7;
        // Cones rest standing on the sand (waffle height × 0.5), not flat as dark slabs.
        const restY = isIce
          ? Math.max(component.scale.y * 0.5, 0.2)
          : Math.max(component.scale.y * 0.28, 0.08);
        const startY = Math.max(component.position.y, component.scale.y * 0.55);
        // Toy parabolic drop with wider tree / ice-cream debris field.
        const loft = scatter.launch * (isIce ? 1.8 : 1.35) * Math.sin(fallT * Math.PI) * (1 - fallT * 0.28);
        local.x = component.position.x * (1 - fallEase) + scatter.x * radius * fallEase;
        local.z = component.position.z * (1 - fallEase) + scatter.z * radius * fallEase;
        local.y = startY * (1 - fallEase) + restY * fallEase + loft;
        // Ice cream: gentle spin while falling, then settle upright-ish.
        if (isIce) {
          localRotation.setFromAxisAngle(UP, scatter.r * fallEase * 1.1);
          if (fallT < 1) {
            const spin = new THREE.Quaternion().setFromAxisAngle(X_AXIS, fallEase * scatter.r * 0.8);
            localRotation.multiply(spin);
          }
        } else {
          localRotation.setFromAxisAngle(UP, scatter.r * fallEase * 2.2);
          if (fallT < 1) {
            const spin = new THREE.Quaternion().setFromAxisAngle(X_AXIS, fallEase * scatter.r * 3.2);
            localRotation.multiply(spin);
          }
        }
      }
      let partScale = component.scale.clone();
      if (stage === 1 && index >= n - 2) partScale.multiplyScalar(0.98);
      if (stage === 2) {
        partScale.multiplyScalar(index >= peelFrom ? 0.94 : 0.97);
      }
      if (stage === 3) partScale.multiplyScalar(isIce ? 1.05 : 0.92);
      const localMatrix = new THREE.Matrix4().compose(local, localRotation, partScale);
      const worldMatrix = root.clone().multiply(localMatrix);
      const c = component.colour.clone();
      // Furniture and cars keep their source finish at every damage stage. The
      // old 0.62 multiplier plus HSL subtraction crushed timber/iron to black.
      const keepFinish = target.kind === 'prop';
      const binding = target.renderBinding;
      if (keepFinish && binding?.meshes?.[0]?.instanceColor) {
        c.multiply(new THREE.Color().fromBufferAttribute(binding.meshes[0].instanceColor, binding.index));
      }
      if (stage === 1 && !keepFinish) c.offsetHSL(0, 0, -0.04);
      // Tree/transit damage retains its existing finish; planted furniture keeps
      // its leaf and blade colours along with the built parts above.
      const shape = component.shape ?? 'box';
      const soft = shape !== 'box';
      if (stage === 2 && !keepFinish) {
        if (soft) c.multiplyScalar(0.92);
        else c.multiplyScalar(0.78).offsetHSL(0.02, -0.08, -0.06);
      }
      // Retain the existing tree/transit scatter grade.
      if (stage >= 3 && !isIce && !keepFinish) {
        if (soft) c.multiplyScalar(0.80).offsetHSL(0, -0.05, -0.03);
        else c.multiplyScalar(0.62).offsetHSL(0.04, -0.12, -0.1);
      }
      if (component.sourceGeometry) {
        record.authoredMeshes ??= [];
        let mesh = record.authoredMeshes[index];
        if (!mesh) {
          const geometry = component.sourceGeometry.clone();
          geometry.translate(-component.centre.x, -component.centre.y, -component.centre.z);
          geometry.scale(1 / component.extent.x, 1 / component.extent.y, 1 / component.extent.z);
          mesh = new THREE.Mesh(geometry, component.sourceMaterial.clone());
          mesh.name = `mischief:authored:${target.key}:${index}`;
          mesh.matrixAutoUpdate = false;
          mesh.castShadow = true;
          this.scene.add(mesh);
          record.authoredMeshes[index] = mesh;
        }
        mesh.visible = true;
        mesh.matrix.copy(worldMatrix);
        mesh.matrixWorldNeedsUpdate = true;
        mesh.material.color.copy(c);
        return;
      }
      const sink = soft && shaped ? (shape === 'blade' ? shaped.blade : shaped.leaf) : null;
      if (sink) {
        sink.matrices.push(worldMatrix);
        sink.colours.push(c);
        return;
      }
      matrices.push(worldMatrix);
      colours.push(c);
      damages.push(stage >= 1 ? stage / 3 : 0);
    });
  }

  _writePools() {
    if (!this.body) return;
    const matrices = [];
    const colours = [];
    const damages = [];
    const hazardMatrices = [];
    const shaped = {
      leaf: { matrices: [], colours: [] },
      blade: { matrices: [], colours: [] },
    };
    for (const record of this.records.values()) {
      const showBrokenLeaving = record.repairing && record.target.kind === 'tram';
      for (const mesh of record.authoredMeshes ?? []) mesh.visible = false;
      // Ice-cream: stages 1–2 slide the live van only; cone voxels ONLY at stage 3.
      const isIce = isIceCreamTarget(record.target);
      const showIceCones = isIce && record.stage >= 3 && !record.repairing;
      // Trees keep their own shed/debris language. The pooled boxes read as
      // lime crates around a stripped bole (r1c / this fire's tree-05).
      const showOtherVoxels = !isIce
        && record.target.kind !== 'tree'
        && !(isRailTarget(record.target) && record.stage < 3)
        && record.stage >= 1
        && (!record.repairing || showBrokenLeaving);
      if (showIceCones || showOtherVoxels) {
        this._appendTarget(record, matrices, colours, damages, { shaped });
      }
      if (record.passing && record.passing.t < 1.02) {
        this._appendTarget(record, matrices, colours, damages, { passing: true, shaped });
      }
      if (record.stage === 3 && !record.repairing && record.target.kind === 'tram') {
        const pose = record.target.getPose();
        const flashOn = this.reducedMotion || Math.floor(this.time * 4) % 2 === 0;
        if (flashOn) {
          for (const side of [-1, 1]) {
            const local = new THREE.Matrix4().compose(
              new THREE.Vector3(side * 6.55, 2.0, 1.34),
              new THREE.Quaternion(),
              new THREE.Vector3(0.20, 0.20, 0.20),
            );
            const root = new THREE.Matrix4().compose(pose.position, pose.quaternion, new THREE.Vector3(1, 1, 1));
            hazardMatrices.push(root.multiply(local));
          }
        }
      }
    }

    const count = Math.min(BODY_CAPACITY, matrices.length);
    const damageAttribute = this.body.geometry.getAttribute('mischiefDamage');
    for (let i = 0; i < BODY_CAPACITY; i += 1) {
      this.body.setMatrixAt(i, i < count ? matrices[i] : HIDDEN);
      this.body.setColorAt(i, i < count ? colours[i] : WHITE);
      damageAttribute.setX(i, i < count ? damages[i] : 0);
    }
    this.body.count = count;
    this.body.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    damageAttribute.needsUpdate = true;

    const writeShaped = (mesh, capacity, bucket) => {
      if (!mesh) return;
      const used = Math.min(capacity, bucket.matrices.length);
      for (let i = 0; i < capacity; i += 1) {
        mesh.setMatrixAt(i, i < used ? bucket.matrices[i] : HIDDEN);
        mesh.setColorAt(i, i < used ? bucket.colours[i] : WHITE);
      }
      mesh.count = used;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    writeShaped(this.leafBody, LEAF_CAPACITY, shaped.leaf);
    writeShaped(this.bladeBody, BLADE_CAPACITY, shaped.blade);

    const hazards = Math.min(HAZARD_CAPACITY, hazardMatrices.length);
    for (let i = 0; i < HAZARD_CAPACITY; i += 1) {
      this.hazards.setMatrixAt(i, i < hazards ? hazardMatrices[i] : HIDDEN);
    }
    this.hazards.count = hazards;
    this.hazards.instanceMatrix.needsUpdate = true;
  }

  restoreAll() {
    if (this.disposed) return;
    for (const record of this.records.values()) {
      resetSway(record.sway);
      record.target.setOriginal({ visible: true, scale: 1, slide: 0, swayX: 0, swayZ: 0 });
      record.target.setDamageLevel?.(0);
      record.target.setDamaged?.(false);
      record.target.setSway?.({ x: 0, z: 0, energy: 0 });
      record.target.setFall?.({ angle: 0, heading: 0 });
      record.target.setStopped?.(false);
      record.hits = 0;
      record.stage = 0;
      record.stageAge = 0;
      record.damagedOrder = null;
      record.brokenAt = null;
      record.repairing = false;
      record.repairAge = 0;
      record.tumble = null;
      record.passing = null;
      record.fallHeading = null;
    }
    this._writePools();
  }

  snapshot() {
    // Public diagnostics may be polled during teardown before the app removes
    // its snapshot handle. Disposed pools own no draws, capacity or live items.
    if (this.disposed) return {
      damaged: 0, items: [],
      cost: { drawCalls: 0, trianglesAtCapacity: 0, trianglesNow: 0 },
    };
    const items = Array.from(this.records.values(), (record) => ({
      key: record.target.key,
      kind: record.target.kind,
      model: record.target.model,
      hits: record.hits,
      stage: record.stage,
      repairing: record.repairing,
      energy: record.sway.energy,
      sway: swayAmplitude(record.sway),
      swayX: record.sway.thetaX,
      swayZ: record.sway.thetaZ,
      variant: variantLabel(record.target, record.variant),
    }));
    return {
      damaged: items.filter((item) => item.hits > 0 || item.repairing).length,
      items,
      cost: {
        drawCalls: 4,
        trianglesAtCapacity: BODY_CAPACITY * BODY_TRIANGLES + HAZARD_CAPACITY * HAZARD_TRIANGLES
          + LEAF_CAPACITY * LEAF_TRIANGLES + BLADE_CAPACITY * BLADE_TRIANGLES,
        trianglesNow: this.body.count * BODY_TRIANGLES + this.hazards.count * HAZARD_TRIANGLES
          + (this.leafBody?.count ?? 0) * LEAF_TRIANGLES
          + (this.bladeBody?.count ?? 0) * BLADE_TRIANGLES,
      },
    };
  }

  dispose() {
    if (this.disposed) return;
    this.restoreAll();
    for (const record of this.records.values()) for (const mesh of record.authoredMeshes ?? []) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    for (const target of this.targets.values()) for (const part of target.voxelKit ?? []) {
      if (part.owned) part.sourceGeometry.dispose();
    }
    this.disposed = true;
    this.scene.remove(this.body);
    this.scene.remove(this.hazards);
    this.body.geometry.dispose();
    this.body.material.dispose();
    this.hazards.geometry.dispose();
    this.hazards.material.dispose();
    for (const mesh of [this.leafBody, this.bladeBody]) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    // The two shaped pools share one material; dispose it once.
    this.leafBody?.material?.dispose();
    this.leafBody = null;
    this.bladeBody = null;
    this.body = null;
    this.hazards = null;
  }
}

export { stageForHits, easeOutBack, easeTumble, easeTreeFall, stageTilt };
