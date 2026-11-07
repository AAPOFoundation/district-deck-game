// District Deck V3.10 — W2-ARCH streetscape layer (R9 product-read refinement).
//
// Raised L-section kerbs, white stop lines, complete interior-junction zebra coverage,
// Bollards, tram shelters and straight-post avenue lighting.
// R8B: axis-correct parked cars with product-part batches; fat black/yellow junction
// bollards and signal heads; Melbourne tram-stop signs and complete zebra coverage remain.
// Renderer-local only: pure function of city layout + city.seed hash.

import { tagSurface } from './style/restyle.js';
import * as THREE from 'three';
import { tramBevelBox } from './vehicles/tram-model.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  TILE, SETBACK, ROAD, PITCH, BLOCK, CORRIDOR,
} from '../core/grid.js';
import { MaterialLibrary, CITY_FINISHES, getCityMaterial } from './materials.js';
import { TASTE } from './taste-tokens.js';
import { applyPublicPavingSurface } from './public-paving.js';
import {
  tramStopKitEnabled, tramFlagModel, tramFlagPlate, stopNumberText, InstanceRouter, TRAM_STOP_DIMENSIONS,
} from './tram-stop-kit.js';
import { subtractRectangle } from './public-tree-pits.js';
import { pitsTouchingRect, placementWorldRect } from './public-tree-pit-geometry.js';
import {
  CAR_TRUE_SCALE,
  makeP17EntertainmentPlateCamera,
  p17EntertainmentPlateContains,
  roadCellKind,
  sharedSignalPhase,
  travelAxisFromYaw,
} from './traffic.js';
import { moderneEntranceLocal } from './residential/walkup-heritage.js';

/**
 * FNV-1a style hash for deterministic placement. Does not touch the sim RNG stream.
 * @param {string} s
 */
function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function unit(h, salt) {
  return ((h ^ Math.imul(salt | 0, 0x9e3779b9)) >>> 0) / 0x100000000;
}

/** P17 B3 board-scale dimensions for the public/private residential frontage junction. */
export const P17_FRONTAGE = Object.freeze({
  boundaryContactH: 0.045,
  boundaryContactD: 0.18,
  postW: 0.56,
  postFootW: 0.64,
  railH: 0.48,
  railD: 0.34,
  fenceH: 1.12,
  gateW: 1.4,
  crossingH: 0.10,
  kerbRampD: 0.9,
});

const P17_BOUNDARY_SUPPLEMENTS = new Set(['walkup-beaux-arts', 'walkup-moderne']);

function mixedUnit(h, salt) {
  let v = (h ^ Math.imul(salt | 0, 0x9e3779b9)) >>> 0;
  v ^= v >>> 16;
  v = Math.imul(v, 0x85ebca6b);
  v ^= v >>> 13;
  v = Math.imul(v, 0xc2b2ae35);
  v ^= v >>> 16;
  return (v >>> 0) / 0x100000000;
}

function facadeIndex(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 4;
}

function frontagePoint(parcel, x, z) {
  const a = (parcel.rotation ?? 0) * Math.PI / 180;
  return {
    x: parcel.centre.x + x * Math.cos(a) + z * Math.sin(a),
    z: parcel.centre.z - x * Math.sin(a) + z * Math.cos(a),
  };
}

/**
 * Garage axes are repeated here only for the public footpath extension. The private driveway,
 * fence break and garage remain authored by the residential kit. This keeps the two builders on
 * one deterministic axis without importing (or mutating) residential geometry.
 */
function residentialDriveways(parcel, lotW) {
  const id = parcel.archetypeId;
  const facade = facadeIndex(parcel.id);
  const district = parcel.districtId ?? '';
  const seed = hash32(`v350|${id}|${district}|f${facade}`);
  const shift = (mixedUnit(seed, 4255) - 0.5) * 0.9;
  if (id === 'townhouse-modern-brick') {
    const width = lotW * 0.88 * (1 + (facade - 1.5) * 0.014);
    const units = 3;
    const unitW = width / units;
    const entryHand = mixedUnit(seed, 4225) < 0.5 ? -1 : 1;
    const phase = Math.floor(mixedUnit(seed, 4218) * 3);
    return Array.from({ length: units }, (_, index) => {
      const centre = -width / 2 + (index + 0.5) * unitW;
      const left = centre - unitW / 2;
      const hand = entryHand * (((index + phase) % 2 === 0) ? 1 : -1);
      const garageW = 1.86;
      const baseX = hand > 0
        ? left + 0.30 + garageW / 2
        : left + unitW - 0.30 - garageW / 2;
      return { x: baseX + shift, width: 2.30, garage: index };
    });
  }
  if (id === 'townhouse-modern-render') {
    const width = lotW * 0.84 * (1 + (facade - 1.5) * 0.014);
    const unitW = width / 2;
    const entryHand = mixedUnit(seed, 4225) < 0.5 ? -1 : 1;
    return [{ x: -entryHand * unitW * 0.36 + shift, width: 3.0, garage: 0 }];
  }
  return [];
}

/**
 * Pure seed-stable frontage plan used by both renderer and Node census tests.
 * Returned coordinates are plain numbers so two plans can be deep-compared byte for byte.
 */
export function planResidentialFrontages(city) {
  const getParcel = (id) => (city.parcels instanceof Map
    ? city.parcels.get(id)
    : city.parcels?.[id]);
  const plans = [];
  for (const id of city.order ?? Object.keys(city.parcels ?? {})) {
    const parcel = getParcel(id);
    if (!parcel || parcel.sector !== 'residential' || !parcel.centre) continue;
    const span = parcel.groundFootprint ?? parcel.footprint ?? [1, 1];
    const quarterTurn = Math.abs(Math.round((parcel.rotation ?? 0) / 90)) % 2 === 1;
    const localTilesW = quarterTurn ? span[1] : span[0];
    const localTilesD = quarterTurn ? span[0] : span[1];
    const lotW = Math.max(TILE - SETBACK * 2, localTilesW * TILE - SETBACK * 2);
    const lotD = Math.max(TILE - SETBACK * 2, localTilesD * TILE - SETBACK * 2);
    const boundaryZ = lotD * 0.5 - 0.06;
    const kerbZ = localTilesD * TILE * 0.5 + CORRIDOR.kerbLow;
    const h = hash32(`p17-frontage|${city.seed ?? 0}|${parcel.id}`);
    const supplementBoundary = P17_BOUNDARY_SUPPLEMENTS.has(parcel.archetypeId);
    // Beaux keeps the centred closed gate. Moderne's opening is the heritage door axis
    // for this parcel's facade hash, and the structural gap is that clear width plus the
    // post foot, so the foot's inner face sits outside the 1.63 m corridor.
    const moderneEntrance = parcel.archetypeId === 'walkup-moderne'
      ? moderneEntranceLocal(facadeIndex(parcel.id))
      : null;
    const gateShoulder = 0.04;
    const gateX = moderneEntrance
      ? moderneEntrance.x
      : supplementBoundary
        ? 0
        : Math.max(-lotW * 0.28, Math.min(lotW * 0.28, (unit(h, 17) - 0.5) * 2.0));
    const gateW = moderneEntrance
      ? moderneEntrance.clearWidth + P17_FRONTAGE.postFootW + gateShoulder * 2
      : supplementBoundary ? P17_FRONTAGE.gateW : 1.24;
    const addressSide = unit(h, 31) < 0.5 ? -1 : 1;
    const driveways = residentialDriveways(parcel, lotW).map((drive) => {
      const localZ = (boundaryZ + kerbZ) * 0.5;
      const world = frontagePoint(parcel, drive.x, localZ);
      const kerb = frontagePoint(parcel, drive.x, kerbZ);
      return {
        ...drive,
        localZ,
        depth: kerbZ - boundaryZ,
        world,
        kerb,
      };
    });
    plans.push({
      parcelId: parcel.id,
      archetypeId: parcel.archetypeId,
      rotation: parcel.rotation ?? 0,
      lotW,
      lotD,
      boundaryZ,
      kerbZ,
      gate: moderneEntrance
        ? { x: gateX, width: gateW, clearWidth: moderneEntrance.clearWidth }
        : { x: gateX, width: gateW },
      letterbox: { x: gateX + addressSide * (gateW * 0.5 + 0.38), z: boundaryZ - 0.1 },
      bins: { x: addressSide * (lotW * 0.5 - 0.72), z: -lotD * 0.5 + 0.78 },
      boundary: frontagePoint(parcel, 0, boundaryZ),
      supplementBoundary,
      driveways,
    });
  }
  return plans;
}

function placement(x, y, z, rotationDeg, scale = 1) {
  const s = typeof scale === 'number' ? { x: scale, y: scale, z: scale } : scale;
  return {
    position: new THREE.Vector3(x, y, z),
    quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationDeg * Math.PI / 180, 0)),
    scale: new THREE.Vector3(s.x, s.y, s.z),
  };
}

/** Unit paint decal with a shallow bevel: rounded/chipped edge rather than razor-edged cuboid. */
function roadPaintGeometry({ arrow = false } = {}) {
  const shape = new THREE.Shape();
  if (arrow) {
    shape.moveTo(-0.16, -0.5);
    shape.lineTo(0.16, -0.5);
    shape.lineTo(0.16, 0.08);
    shape.lineTo(0.46, 0.08);
    shape.lineTo(0, 0.5);
    shape.lineTo(-0.46, 0.08);
    shape.lineTo(-0.16, 0.08);
    shape.closePath();
  } else {
    const r = 0.12;
    shape.moveTo(-0.5 + r, -0.5);
    shape.lineTo(0.5 - r, -0.5);
    shape.quadraticCurveTo(0.5, -0.5, 0.5, -0.5 + r);
    shape.lineTo(0.5, 0.5 - r);
    shape.quadraticCurveTo(0.5, 0.5, 0.5 - r, 0.5);
    shape.lineTo(-0.5 + r, 0.5);
    shape.quadraticCurveTo(-0.5, 0.5, -0.5, 0.5 - r);
    shape.lineTo(-0.5, -0.5 + r);
    shape.quadraticCurveTo(-0.5, -0.5, -0.5 + r, -0.5);
    shape.closePath();
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.045,
    bevelThickness: 0.08,
    curveSegments: 3,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const sx = 1 / Math.max(1e-6, box.max.x - box.min.x);
  const sy = 1 / Math.max(1e-6, box.max.y - box.min.y);
  const sz = 1 / Math.max(1e-6, box.max.z - box.min.z);
  geometry.translate(
    -(box.min.x + box.max.x) * 0.5,
    -(box.min.y + box.max.y) * 0.5,
    -(box.min.z + box.max.z) * 0.5,
  );
  geometry.scale(sx, sy, sz);
  geometry.computeVertexNormals();
  MaterialLibrary.ensureUv2(geometry);
  return geometry;
}

function buildInstanced(model, placements, { castShadow = false, receiveShadow = true } = {}) {
  const group = new THREE.Group();
  if (!model?.parts?.length || !placements.length) return { group, meshes: [] };
  const matrix = new THREE.Matrix4();
  const meshes = [];
  for (const part of model.parts) {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, placements.length);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.frustumCulled = false;
    placements.forEach((p, i) => {
      matrix.compose(p.position, p.quaternion, p.scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = placements.length;
    group.add(mesh);
    meshes.push(mesh);
  }
  return { group, meshes };
}

/** Opaque cabin block — solid Monopoly token glass, not hollow NFS rake. */
function solidCabinGeometry(w, h, d, y, z, name = 'car-cabin-solid') {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, y + h / 2, z);
  g.name = name;
  g.computeBoundingBox();
  MaterialLibrary.ensureUv2(g);
  return g;
}

/**
 * Thin procedural car massing when the car-sedan GLB is absent.
 * Body + cabin + wheels; colours assigned per instance batch.
 * @param {import('./materials.js').MaterialLibrary} materials
 * @param {string} [bodyColor]
 */
/**
 * Parked cars match moving traffic scale. CAR-1: true size (1) unless `?carTrue=0` restores the
 * 0.94 toy token. The authored mass is already 4.5 m, about a true sedan. (P23 removed parked
 * cars, so nothing places this model today; the figure is kept consistent for when it returns.)
 */
const CAR_HERO_SCALE = CAR_TRUE_SCALE ? 1 : 0.94;

export function proceduralCarModel(materials, bodyColor = '#e53935') {
  // Monopoly Plus toy sedan: closed plastic mass — no NFS rake / open chassis.
  const bodyMat = materials.get('painted_metal', {
    variant: `car-body-toy:${bodyColor}`,
    color: bodyColor,
    roughness: 0.42,
    metalness: 0.22,
  });
  const glassMat = materials.get('painted_metal', {
    variant: 'car-cabin-toy-opaque',
    color: '#1a2838',
    roughness: 0.28,
    metalness: 0.35,
  });
  const wheelMat = materials.get('asphalt', { variant: 'car-tyre-toy', color: '#0a0a0c' });
  const darkDetailMat = materials.get('painted_metal', {
    variant: 'car-trim-toy', color: '#1a1c20', roughness: 0.7, metalness: 0.25,
  });
  const rimMat = materials.get('painted_metal', {
    variant: 'car-rim-toy', color: '#e8eef2', roughness: 0.22, metalness: 0.75,
  });
  const headLampMat = materials.get('painted_metal', {
    variant: 'car-headlamp-toy', color: '#ffffff', roughness: 0.12, metalness: 0.1,
  });
  const tailLampMat = materials.get('painted_metal', {
    variant: 'car-taillamp-toy', color: '#ff2634', roughness: 0.16, metalness: 0.1,
  });
  if (headLampMat.emissive) {
    headLampMat.emissive.set('#ffffff');
    headLampMat.emissiveIntensity = 1.2;
    headLampMat.toneMapped = false;
  }
  if (tailLampMat.emissive) {
    tailLampMat.emissive.set('#ff1028');
    tailLampMat.emissiveIntensity = 1.0;
    tailLampMat.toneMapped = false;
  }
  // Body / cabin / wheel plus lamp buckets, batched by part.
  const bodyGeos = [];
  const glassGeos = [];
  const wheelGeos = [];
  const darkDetailGeos = [];
  const rimGeos = [];
  const headLampGeos = [];
  const tailLampGeos = [];
  const add = (w, h, d, y, z, bucket, name, x = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y + h / 2, z);
    g.name = name;
    g.computeBoundingBox();
    MaterialLibrary.ensureUv2(g);
    bucket.push(g);
  };
  // Closed toy sedan (+Z forward): solid body block + shoulder + bonnet + boot.
  add(1.78, 0.52, 4.2, 0.0, 0.0, bodyGeos, 'car-body');
  add(1.68, 0.28, 3.9, 0.48, -0.05, bodyGeos, 'car-shoulder');
  add(1.55, 0.22, 1.55, 0.48, 1.25, bodyGeos, 'car-bonnet');
  add(1.5, 0.18, 1.05, 0.48, -1.55, bodyGeos, 'car-boot');
  add(1.82, 0.1, 3.6, 0.0, 0, darkDetailGeos, 'car-rocker');
  add(1.7, 0.12, 0.28, 0.12, 2.12, bodyGeos, 'car-front-bumper');
  add(1.65, 0.12, 0.24, 0.12, -2.08, bodyGeos, 'car-rear-bumper');
  add(0.48, 0.16, 0.14, 0.22, 2.18, headLampGeos, 'car-headlamp-L', -0.52);
  add(0.48, 0.16, 0.14, 0.22, 2.18, headLampGeos, 'car-headlamp-R', 0.52);
  add(0.46, 0.16, 0.12, 0.28, -2.12, tailLampGeos, 'car-tail-L', -0.52);
  add(0.46, 0.16, 0.12, 0.28, -2.12, tailLampGeos, 'car-tail-R', 0.52);
  add(0.14, 0.1, 0.22, 0.58, 0.4, bodyGeos, 'car-mirror-L', -0.92);
  add(0.14, 0.1, 0.22, 0.58, 0.4, bodyGeos, 'car-mirror-R', 0.92);
  // Opaque cabin block (plastic glass token) + roof cap.
  glassGeos.push(solidCabinGeometry(1.42, 0.52, 1.85, 0.48, -0.12, 'car-cabin-solid'));
  add(1.28, 0.1, 1.7, 0.98, -0.12, glassGeos, 'car-roof');
  add(0.06, 0.08, 1.9, 0.58, -0.12, rimGeos, 'car-chrome-belt-L', -0.78);
  add(0.06, 0.08, 1.9, 0.58, -0.12, rimGeos, 'car-chrome-belt-R', 0.78);
  add(1.2, 0.07, 0.07, 0.12, 2.2, rimGeos, 'car-chrome-bumper-front');
  add(1.12, 0.06, 0.06, 0.14, -2.16, rimGeos, 'car-chrome-bumper-rear');
  for (const [x, z] of [[-0.8, 1.24], [0.8, 1.24], [-0.8, -1.24], [0.8, -1.24]]) {
    const tyre = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 12, 1);
    tyre.rotateZ(Math.PI / 2);
    tyre.translate(x, 0.34, z);
    tyre.name = 'car-tyre';
    MaterialLibrary.ensureUv2(tyre);
    wheelGeos.push(tyre);
    const hub = new THREE.CylinderGeometry(0.16, 0.16, 0.3, 10, 1);
    hub.rotateZ(Math.PI / 2);
    hub.translate(x, 0.34, z);
    hub.name = 'car-hub';
    MaterialLibrary.ensureUv2(hub);
    rimGeos.push(hub);
  }
  // Merge bucket into one non-indexed buffer.
  const mergeBucket = (geos) => {
    if (!geos.length) {
      const empty = new THREE.BoxGeometry(0.01, 0.01, 0.01);
      MaterialLibrary.ensureUv2(empty);
      return empty;
    }
    const prepared = geos.map((g) => (g.index ? g.toNonIndexed() : g.clone()));
    for (const g of prepared) {
      for (const name of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      }
      if (!g.attributes.normal) g.computeVertexNormals();
    }
    let vertCount = 0;
    for (const g of prepared) vertCount += g.attributes.position.count;
    const pos = new Float32Array(vertCount * 3);
    const nrm = new Float32Array(vertCount * 3);
    const uv = new Float32Array(vertCount * 2);
    let o = 0;
    for (const g of prepared) {
      const p = g.attributes.position.array;
      const n = g.attributes.normal.array;
      const u = g.attributes.uv?.array;
      const c = g.attributes.position.count;
      pos.set(p, o * 3);
      nrm.set(n, o * 3);
      if (u) uv.set(u, o * 2);
      o += c;
    }
    for (const g of geos) g.dispose();
    for (const g of prepared) g.dispose();
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.computeBoundingBox();
    MaterialLibrary.ensureUv2(out);
    return out;
  };
  return {
    parts: [
      { geometry: mergeBucket(bodyGeos), material: bodyMat },
      { geometry: mergeBucket(glassGeos), material: glassMat },
      { geometry: mergeBucket(wheelGeos), material: wheelMat },
      { geometry: mergeBucket(darkDetailGeos), material: darkDetailMat },
      { geometry: mergeBucket(rimGeos), material: rimMat },
      {
        geometry: mergeBucket(headLampGeos),
        material: headLampMat,
      },
      {
        geometry: mergeBucket(tailLampGeos),
        material: tailLampMat,
      },
    ],
    // Authored mass ≈4.5 m long (+Z) × 1.72 m wide (+X); placement multiplies by CAR_HERO_SCALE.
    size: new THREE.Vector3(1.9, 0.95, 4.5),
    source: 'streetscape-procedural',
    fallback: true,
    heroScale: CAR_HERO_SCALE,
  };
}

/** A compact rounded vehicle shell: continuous lofted mass, never a box primitive. */
function streetVehicleLoft(length, width, height, { baseY = 0.08, taper = 0.88 } = {}) {
  const profile = [
    [-0.42, 0.02], [-0.5, 0.22], [-0.5, 0.68], [-0.34, 0.98],
    [0.34, 0.98], [0.5, 0.68], [0.5, 0.22], [0.42, 0.02],
  ];
  const stations = [-0.5, -0.44, 0.42, 0.5];
  const positions = [];
  const uvs = [];
  for (let s = 0; s < stations.length; s += 1) {
    const zUnit = stations[s];
    const endTaper = (s === 0 || s === stations.length - 1) ? taper : 1;
    for (let p = 0; p < profile.length; p += 1) {
      positions.push(
        profile[p][0] * width * endTaper,
        baseY + profile[p][1] * height,
        zUnit * length,
      );
      uvs.push(p / profile.length, s / (stations.length - 1));
    }
  }
  const index = [];
  const ring = profile.length;
  for (let s = 0; s < stations.length - 1; s += 1) {
    for (let p = 0; p < ring; p += 1) {
      const q = (p + 1) % ring;
      const a = s * ring + p;
      const b = s * ring + q;
      const c = (s + 1) * ring + q;
      const d = (s + 1) * ring + p;
      index.push(a, b, c, a, c, d);
    }
  }
  for (let p = 1; p < ring - 1; p += 1) {
    index.push(0, p + 1, p);
    const end = (stations.length - 1) * ring;
    index.push(end, end + p, end + p + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  MaterialLibrary.ensureUv2(geometry);
  return geometry;
}

function mergeStreetVehicleParts(parts) {
  const prepared = parts.map((geometry) => {
    const clone = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (!clone.attributes.normal) clone.computeVertexNormals();
    if (!clone.attributes.uv) {
      clone.setAttribute('uv', new THREE.Float32BufferAttribute(
        new Float32Array(clone.attributes.position.count * 2), 2,
      ));
    }
    return clone;
  });
  const merged = mergeGeometries(prepared, false);
  for (const geometry of parts) geometry.dispose();
  for (const geometry of prepared) geometry.dispose();
  merged.computeBoundingBox();
  MaterialLibrary.ensureUv2(merged);
  return merged;
}

/** Maximum centre-to-centre gap allowed by the entertainment-plate kerb law. */
export const P17_KERB_DRESSING_SPACING_M = 12;
/**
 * Parked-car centre to the kerb face (m). Sedan half-width is 0.88 m, so this
 * sits the flank on the kerb rather than in the travel-lane centre (4.5 m).
 * The P19 census allows ± PARK_KERB_TOLERANCE_M of this offset.
 */
export const PARK_KERB_OFFSET_M = 0.85;
/** Allowed drift of a parked centre from PARK_KERB_OFFSET_M / kerb-parallel heading. */
export const PARK_KERB_TOLERANCE_M = 0.4;

/**
 * Visible pieces of each real block-side kerb, sampled through the published capture frustum,
 * plus a ≤12 m chain of alternating car/furniture anchors along every piece. The anchors keep
 * separate carriageway and footpath poses while sharing one kerb coordinate for the receipt.
 */
export function planEntertainmentKerbDressings(city) {
  const camera = makeP17EntertainmentPlateCamera();
  const segments = [];
  const slots = [];
  const { blocksX = 4, blocksZ = 4 } = city;

  const addSegment = ({ axis, corridor, block, side, fixed, from, to }) => {
    let visibleFrom = null;
    let visibleTo = null;
    for (let along = from; along <= to + 1e-6; along += 1) {
      const point = axis === 'z'
        ? { x: fixed, y: 0.5, z: along }
        : { x: along, y: 0.5, z: fixed };
      if (!p17EntertainmentPlateContains(point, camera)) continue;
      if (visibleFrom == null) visibleFrom = along;
      visibleTo = along;
    }
    if (visibleFrom == null || visibleTo - visibleFrom < P17_KERB_DRESSING_SPACING_M) return;

    const id = `${axis}:${corridor}:${block}:${side}`;
    const length = visibleTo - visibleFrom;
    const count = Math.max(1, Math.ceil(length / P17_KERB_DRESSING_SPACING_M));
    const spacing = length / count;
    const segmentSlots = [];
    for (let index = 0; index < count; index += 1) {
      const along = visibleFrom + spacing * (index + 0.5);
      const corridorEdge = corridor * PITCH;
      const low = side === 'low';
      const carFixed = corridorEdge + (low
        ? CORRIDOR.kerbLow + PARK_KERB_OFFSET_M
        : CORRIDOR.kerbHigh - PARK_KERB_OFFSET_M);
      const furnitureFixed = corridorEdge + (low
        ? CORRIDOR.footpathCentreLow
        : CORRIDOR.footpathCentreHigh);
      const car = axis === 'z'
        ? { x: carFixed, z: along, rotation: 0 }
        : { x: along, z: carFixed, rotation: 90 };
      const furniture = axis === 'z'
        ? { x: furnitureFixed, z: along, rotation: low ? 0 : 180 }
        : { x: along, z: furnitureFixed, rotation: low ? 90 : 270 };
      const dressKind = ((hash32(id) + index) & 1) === 0 ? 'car' : 'furniture';
      const slot = {
        id: `${id}:${index}`,
        segmentId: id,
        axis,
        along,
        dressKind,
        footprintM: dressKind === 'car' ? 3.71 : 3.2,
        car,
        furniture,
      };
      slots.push(slot);
      segmentSlots.push(slot.id);
    }
    segments.push({
      id,
      axis,
      corridor,
      block,
      side,
      fixed,
      from: visibleFrom,
      to: visibleTo,
      length,
      spacing,
      slots: segmentSlots,
    });
  };

  for (let i = 0; i <= blocksX; i += 1) {
    for (let block = 0; block < blocksZ; block += 1) {
      const from = ROAD + block * PITCH;
      const to = from + BLOCK;
      for (const side of ['low', 'high']) {
        addSegment({
          axis: 'z', corridor: i, block, side,
          fixed: i * PITCH + (side === 'low' ? CORRIDOR.kerbLow : CORRIDOR.kerbHigh),
          from, to,
        });
      }
    }
  }
  for (let j = 0; j <= blocksZ; j += 1) {
    for (let block = 0; block < blocksX; block += 1) {
      const from = ROAD + block * PITCH;
      const to = from + BLOCK;
      for (const side of ['low', 'high']) {
        addSegment({
          axis: 'x', corridor: j, block, side,
          fixed: j * PITCH + (side === 'low' ? CORRIDOR.kerbLow : CORRIDOR.kerbHigh),
          from, to,
        });
      }
    }
  }
  return { segments, slots };
}

/** Pure seed-stable kerb parking plan used by renderer and P17 census tests. */
export function planParkedVehicles() {
  // P23 owner deletion: no parked vehicles or contact decals at any quality tier.
  return [];
}

function kerbHeadingDelta(rotation, axis) {
  const yaw = ((rotation ?? 0) * Math.PI) / 180;
  const along = axis === 'v' ? Math.abs(Math.cos(yaw)) : Math.abs(Math.sin(yaw));
  return Math.acos(Math.min(1, Math.max(0, along)));
}

/**
 * A parked car is lawful when it sits in a kerb slot: parallel (retail 24° angle
 * parking still counts), centre within PARK_KERB_TOLERANCE_M of PARK_KERB_OFFSET_M
 * from the kerb, not on a crossing, not in a travel-lane centre.
 */
export function classifyParkedVehicle(record) {
  if (!record || !Number.isFinite(record.x) || !Number.isFinite(record.z)) {
    return { random: true, reason: 'unposed' };
  }
  const cell = roadCellKind(record.x, record.z);
  if (cell.kind === 'lot') return { random: true, reason: 'lot', cell };
  if (cell.kind === 'junction') return { random: true, reason: 'crossing', cell };
  if (cell.kind === 'footpath') return { random: true, reason: 'footpath', cell };
  if (cell.kind === 'tram') return { random: true, reason: 'tram', cell };
  const kerb = Math.min(
    Math.abs(cell.local - CORRIDOR.kerbLow),
    Math.abs(cell.local - CORRIDOR.kerbHigh),
  );
  if (Math.abs(kerb - PARK_KERB_OFFSET_M) > PARK_KERB_TOLERANCE_M) {
    return { random: true, reason: 'kerb-offset', cell, kerb };
  }
  const dA = Math.abs(cell.local - (CORRIDOR.carriagewayA[0] + CORRIDOR.carriagewayA[1]) / 2);
  const dB = Math.abs(cell.local - (CORRIDOR.carriagewayB[0] + CORRIDOR.carriagewayB[1]) / 2);
  if (Math.min(dA, dB) < 0.5) return { random: true, reason: 'in-lane', cell };
  const heading = kerbHeadingDelta(record.rotation ?? 0, cell.axis);
  if (heading > (30 * Math.PI) / 180) {
    return { random: true, reason: 'not-parallel', cell, heading };
  }
  return { random: false, reason: 'kerb-slot', cell, kerb };
}

export function censusParkedVehicles(city, opts) {
  const plan = planParkedVehicles(city, opts);
  const random = [];
  for (const record of plan) {
    const row = classifyParkedVehicle(record);
    if (row.random) random.push({ ...record, ...row });
  }
  return { total: plan.length, random, plan };
}

/** Pure municipal-prop plan: every record is grounded at y=0 and large enough for board view. */
export function planStreetFurniture(city, { plateScale = true } = {}) {
  const plan = [];
  // P23: delete the outreach-arm streetlights; straight building-kit posts remain.
  for (const [index, stop] of (city.transit ?? []).filter((item) => item.kind === 'stop').entries()) {
    // P23: S3 already supplies the footpath shelter. Delete the perpendicular duplicate.
    plan.push({
      id: `bin:stop:${index}`, kind: 'bin', x: stop.x + (index % 2 ? 1.45 : -1.45),
      z: stop.z + (index % 2 ? -1.15 : 1.15), rotation: 0,
    });
  }

  const cafes = (city.civicUses ?? []).filter((item) => item.useId === 'cafe-corner');
  cafes.forEach((cafe, cafeIndex) => {
    for (const [tableIndex, localX] of [-1.9, 1.9].entries()) {
      const at = frontagePoint(cafe, localX, 9.15);
      plan.push({
        id: `cafe:${cafeIndex}:${tableIndex}`, kind: 'cafe', x: at.x, z: at.z,
        rotation: cafe.rotation ?? 0,
      });
    }
    const bin = frontagePoint(cafe, -5.1, 9.15);
    plan.push({ id: `bin:cafe:${cafeIndex}`, kind: 'bin', x: bin.x, z: bin.z, rotation: cafe.rotation ?? 0 });
  });

  if (plateScale) {
    const camera = makeP17EntertainmentPlateCamera();
    const getParcel = (id) => (city.parcels instanceof Map
      ? city.parcels.get(id)
      : city.parcels?.[id]);
    const visibleRetail = [];
    for (const id of city.order ?? []) {
      const parcel = getParcel(id);
      if (!parcel?.centre || parcel.sector !== 'retail') continue;
      const awningAt = frontagePoint(parcel, 0, TILE * 0.5 + 0.55);
      if (!p17EntertainmentPlateContains({ ...awningAt, y: 2.8 }, camera)) continue;
      visibleRetail.push(parcel);
    }

    // A table-and-umbrella beat outside each readable north-city shopfront. Existing café-corner
    // beats remain untouched; these are the ones the entertainment plate can actually resolve.
    for (const [index, parcel] of visibleRetail.entries()) {
      const at = frontagePoint(parcel, index % 2 === 0 ? -2.3 : 2.3, TILE * 0.5 + 1.45);
      plan.push({
        id: `cafe:plate:${parcel.id}`,
        kind: 'cafe',
        x: at.x,
        z: at.z,
        rotation: parcel.rotation ?? 0,
        p17PlateScale: true,
      });
    }

  }
  // P21 D1: blank signs, empty kiosks/pots, repeated pot-and-rod groups and
  // freestanding duplicate awnings/queue rails are unfinished dressing. Keep
  // only bins and cafe furniture here; S3 supplies the retained shelters.
  return plan;
}

/**
 * W4-B real-size road paint, metres (taste bible scale law): lane line 0.14, edge line 0.12,
 * hold line 0.30, lane arrow 2.4 x 0.9, zebra bar 0.5. The P17 plate drew these 2 to 3 times
 * oversize so they would read at the entertainment plate; the bible now asks for real size.
 */
export const ROAD_PAINT_M = Object.freeze({
  lane: 0.14, edge: 0.12, hold: 0.30, arrowLength: 2.4, arrowWidth: 0.9, zebra: 0.5,
});
/** Linear gain on the marking token so lit paint stays under V 90 on screen (measured at the 2026-10-05 key). */
const ROAD_PAINT_GAIN = 0.8;
/** Lane-mark width of the P17 plate camera, now the real 0.14 m. */
export const P17_PLATE_MARKING_WIDTH_M = ROAD_PAINT_M.lane;

/** Pure road-feature plan used by the renderer and the headless bare-asphalt receipt. */
export function planRoadMarkings(city, { quality = 'high', plateScale = true } = {}) {
  const records = [];
  const { blocksX = 4, blocksZ = 4 } = city;
  const dashLen = 2.8;
  const dashGap = quality === 'high' ? 5.6 : 7.2;
  const dashWidth = plateScale ? P17_PLATE_MARKING_WIDTH_M : 0.1;
  const edgeWidth = plateScale ? ROAD_PAINT_M.edge : 0.1;

  const line = (id, axis, x, z, length, width, kind = 'lane-line') => records.push({
    id, kind, axis, x, z, length, width,
  });
  for (let i = 0; i <= blocksX; i += 1) {
    const x = i * PITCH + ROAD / 2;
    for (let block = 0; block < blocksZ; block += 1) {
      const from = ROAD + block * PITCH;
      const to = from + BLOCK;
      let index = 0;
      for (let z = from + 1.5; z < to - 1.5; z += dashLen + dashGap) {
        line(`lane:v:${i}:${block}:${index}`, 'z', x, z + dashLen / 2, dashLen, dashWidth);
        index += 1;
      }
    }
    if (quality === 'high') {
      for (const [sideIndex, side] of [
        CORRIDOR.carriagewayA[0] + 0.35,
        CORRIDOR.carriagewayB[1] - 0.35,
      ].entries()) {
        for (let block = 0; block < blocksZ; block += 2) {
          line(
            `edge:v:${i}:${block}:${sideIndex}`,
            'z', x - ROAD / 2 + side, ROAD + block * PITCH + 4, 1.2, edgeWidth, 'edge-line',
          );
        }
      }
    }
  }
  for (let j = 0; j <= blocksZ; j += 1) {
    const z = j * PITCH + ROAD / 2;
    for (let block = 0; block < blocksX; block += 1) {
      const from = ROAD + block * PITCH;
      const to = from + BLOCK;
      let index = 0;
      for (let x = from + 1.5; x < to - 1.5; x += dashLen + dashGap) {
        line(`lane:h:${j}:${block}:${index}`, 'x', x + dashLen / 2, z, dashLen, dashWidth);
        index += 1;
      }
    }
  }

  for (let i = 0; i <= blocksX; i += 1) {
    const x = i * PITCH + ROAD / 2 - 3.5;
    for (let block = 0; block < blocksZ; block += 1) {
      records.push({
        id: `arrow:v:${i}:${block}`, kind: 'arrow', axis: 'z',
        x, z: ROAD + block * PITCH + BLOCK * 0.68, length: ROAD_PAINT_M.arrowLength, width: ROAD_PAINT_M.arrowWidth, rotation: 0,
      });
    }
  }
  for (let j = 0; j <= blocksZ; j += 1) {
    const z = j * PITCH + ROAD / 2 - 3.5;
    for (let block = 0; block < blocksX; block += 1) {
      records.push({
        id: `arrow:h:${j}:${block}`, kind: 'arrow', axis: 'x',
        x: ROAD + block * PITCH + BLOCK * 0.68, z, length: ROAD_PAINT_M.arrowLength, width: ROAD_PAINT_M.arrowWidth, rotation: 90,
      });
    }
  }

  if (plateScale) {
    const tracks = [
      (CORRIDOR.carriagewayA[0] + CORRIDOR.carriagewayA[1]) / 2,
      (CORRIDOR.carriagewayB[0] + CORRIDOR.carriagewayB[1]) / 2,
    ];
    for (let i = 0; i <= blocksX; i += 1) {
      for (let block = 0; block < blocksZ; block += 1) {
        for (const [lane, offset] of tracks.entries()) {
          records.push({
            id: `wear:v:${i}:${block}:${lane}`, kind: 'wear-track', axis: 'z',
            x: i * PITCH + offset,
            z: ROAD + block * PITCH + BLOCK * 0.5,
            length: 18,
            width: 0.72,
            darkerLuma: 8,
          });
        }
      }
    }
    for (let j = 0; j <= blocksZ; j += 1) {
      for (let block = 0; block < blocksX; block += 1) {
        for (const [lane, offset] of tracks.entries()) {
          records.push({
            id: `wear:h:${j}:${block}:${lane}`, kind: 'wear-track', axis: 'x',
            x: ROAD + block * PITCH + BLOCK * 0.5,
            z: j * PITCH + offset,
            length: 18,
            width: 0.72,
            darkerLuma: 8,
          });
        }
      }
    }
  }
  return records;
}

/**
 * Interior junctions that survive the entertainment plate: each must carry a zebra, a stop
 * bar ≥ 0.3 m, and a lane arrow ≥ 0.3 m. Positions match `_buildStopLinesAndZebras`.
 */
export function censusEntertainmentIntersections(city, { plateScale = true } = {}) {
  const camera = makeP17EntertainmentPlateCamera();
  const { blocksX = 4, blocksZ = 4 } = city;
  const arrows = planRoadMarkings(city, { quality: 'high', plateScale })
    .filter((record) => record.kind === 'arrow' && record.width >= 0.3);
  const rows = [];
  for (let i = 1; i < blocksX; i += 1) {
    for (let j = 1; j < blocksZ; j += 1) {
      const x = i * PITCH + ROAD / 2;
      const z = j * PITCH + ROAD / 2;
      const zebraSouth = { x, y: 0.06, z: z - ROAD / 2 - 2 };
      const zebraWest = { x: x - ROAD / 2 - 2, y: 0.06, z };
      const stopSouth = { x, y: 0.06, z: z - ROAD / 2 - 0.6 };
      const visible = [
        { x, y: 0.06, z }, zebraSouth, zebraWest, stopSouth,
      ].some((point) => p17EntertainmentPlateContains(point, camera));
      if (!visible) continue;
      const hasArrow = arrows.some((arrow) => Math.hypot(arrow.x - x, arrow.z - z) <= PITCH * 0.6);
      rows.push({
        i, j, x, z,
        crossing: true,
        crossingWidth: ROAD_PAINT_M.zebra,
        stopLine: true,
        stopLineWidth: ROAD_PAINT_M.hold,
        arrow: hasArrow,
        complete: hasArrow,
      });
    }
  }
  return {
    visibleIntersections: rows.length,
    completeIntersections: rows.filter((row) => row.complete).length,
    rows,
  };
}

/** Headless receipt for readable road features and continuous unmarked runs at the fixed plate. */
export function censusEntertainmentRoadFeatures(city, { plateScale = true } = {}) {
  const camera = makeP17EntertainmentPlateCamera();
  const markings = planRoadMarkings(city, { quality: 'high', plateScale });
  const readable = markings.filter((record) => record.width >= 0.12
    && p17EntertainmentPlateContains({ x: record.x, y: 0.06, z: record.z }, camera));
  const kerbs = planEntertainmentKerbDressings(city).segments;
  const roads = new Map();
  for (const segment of kerbs) {
    const key = `${segment.axis}:${segment.corridor}:${segment.block}`;
    const current = roads.get(key);
    if (!current) {
      roads.set(key, {
        id: key,
        axis: segment.axis,
        corridor: segment.corridor,
        block: segment.block,
        from: segment.from,
        to: segment.to,
      });
    } else {
      current.from = Math.min(current.from, segment.from);
      current.to = Math.max(current.to, segment.to);
    }
  }

  const runs = [];
  for (const road of roads.values()) {
    const centre = road.corridor * PITCH + ROAD / 2;
    const intervals = readable
      .filter((record) => record.axis === road.axis
        && Math.abs((road.axis === 'z' ? record.x : record.z) - centre) <= 4.2)
      .map((record) => {
        const along = road.axis === 'z' ? record.z : record.x;
        return [
          Math.max(road.from, along - record.length * 0.5),
          Math.min(road.to, along + record.length * 0.5),
        ];
      })
      .filter(([from, to]) => to >= from)
      .sort((a, b) => a[0] - b[0]);
    let cursor = road.from;
    let longest = 0;
    for (const [from, to] of intervals) {
      longest = Math.max(longest, from - cursor);
      cursor = Math.max(cursor, to);
    }
    longest = Math.max(longest, road.to - cursor);
    runs.push({ ...road, longestBareM: longest, featureCount: intervals.length });
  }
  return {
    readableMarkings: readable.length,
    visibleRoadSegments: runs.length,
    bareRuns25m: runs.filter((run) => run.longestBareM >= 25).length,
    longestBareM: Math.max(0, ...runs.map((run) => run.longestBareM)),
    runs,
  };
}

/** Before/after-capable kerb receipt; S2 records carry slot ids, S1 records are spatially matched. */
export function censusEntertainmentKerbDressings(city, { plateScale = true } = {}) {
  const law = planEntertainmentKerbDressings(city);
  const records = [
    ...planParkedVehicles(city, { plateScale }),
    ...planStreetFurniture(city, { plateScale }),
  ];
  const segmentRows = law.segments.map((segment) => {
    const centres = records.flatMap((record) => {
      if (record.kerbSlotId) {
        const slot = law.slots.find((candidate) => candidate.id === record.kerbSlotId);
        return slot?.segmentId === segment.id ? [slot.along] : [];
      }
      const fixed = segment.axis === 'z' ? record.x : record.z;
      const along = segment.axis === 'z' ? record.z : record.x;
      return Number.isFinite(fixed) && Number.isFinite(along)
        && Math.abs(fixed - segment.fixed) <= 2.2
        && along >= segment.from && along <= segment.to
        ? [along]
        : [];
    }).sort((a, b) => a - b);
    let cursor = segment.from;
    let longest = 0;
    for (const along of centres) {
      longest = Math.max(longest, along - cursor);
      cursor = along;
    }
    longest = Math.max(longest, segment.to - cursor);
    return { ...segment, dressingCount: centres.length, longestGapM: longest };
  });
  return {
    totalSegments: segmentRows.length,
    dressedSegments: segmentRows.filter((row) => row.dressingCount > 0).length,
    lawfulSegments: segmentRows.filter((row) => row.longestGapM <= P17_KERB_DRESSING_SPACING_M + 1e-6).length,
    longestGapM: Math.max(0, ...segmentRows.map((row) => row.longestGapM)),
    segments: segmentRows,
  };
}

/**
 * Streetscape builder. Call `build(root)` once after ground is in the scene.
 */
export class Streetscape {
  /**
   * @param {object} city
   * @param {import('./materials.js').MaterialLibrary} materials
   * @param {import('./assets.js').AssetRegistry | null} registry
   * @param {{ quality?: 'high'|'medium'|'low', plateScaleDensity?: boolean }} [opts]
   */
  constructor(city, materials, registry = null, { quality = 'high', plateScaleDensity = true, publicTreePits = null } = {}) {
    this.city = city;
    this.materials = materials;
    this.registry = registry;
    this.quality = quality;
    this.publicTreePits = publicTreePits;
    this.plateScaleDensity = plateScaleDensity !== false;
    this.root = new THREE.Group();
    this.root.name = 'streetscape';
    /** @type {THREE.BufferGeometry[]} */
    this._ownedGeometry = [];
    this._disposed = false;
    this.stats = {
      kerbs: 0, markings: 0, cars: 0, bollards: 0, crossings: 0, signals: 0,
      residentialFrontages: 0, frontageFootings: 0, boundarySupplements: 0,
      driveways: 0, rearBins: 0, streetFurniture: 0,
    };
    /** @type {{ x:number, z:number, rotation:number }[]} */
    this.signalPlacements = [];
    /** @type {{ x:number, z:number, rotation:number, model:string }[]} */
    this.bollardPlacements = [];
    /** @type {THREE.InstancedMesh[]} pole / head / lamp meshes for mischief hide+tint */
    this.signalMeshes = [];
    /** @type {('ns'|'ew')[]} travel axis each signal head governs, indexed like signalPlacements */
    this._signalAxes = [];
    /** @type {{phase:string, attribute:THREE.InstancedBufferAttribute, off:THREE.Color}[]|null} */
    this._signalLamps = null;
    /** Last `${ns}|${ew}` phase pair written to the lamp switches. */
    this._signalPhaseKey = null;
    /** @type {THREE.InstancedMesh[]} black/yellow bollard meshes for mischief */
    this.bollardMeshes = [];
    /** Parked cars (if enabled) for click-to-name. */
    this.carPlacements = [];
    this.carMeshes = [];
    this.carBatches = [];
    this.vehiclePlacements = [];
    this.furnitureBatches = [];
    this.furniturePlacements = [];
    this.roadMarkingPlan = [];
    /** Tram corridor flags for click-to-name. */
    this.flagPlacements = [];
    this.flagMeshes = [];
  }

  /** Attach streetscape meshes under the board root. */
  build() {
    if (this._disposed) return this.root;
    this._buildKerbs();
    this._buildResidentialFrontageInterfaces();
    this._buildMarkings();
    this._buildStopLinesAndZebras();
    if (this.quality !== 'low') this._buildP17ParkedVehicles();
    if (this.quality !== 'low') this._buildBollardsAndTramFlags();
    if (this.quality !== 'low') this._buildP17StreetFurniture();
    // Junction product-read is structural, not a quality-tier decoration.
    this._buildTrafficSignals();
    this._buildJunctionCivil();
    return this.root;
  }

  _own(geometry) {
    MaterialLibrary.ensureUv2(geometry);
    this._ownedGeometry.push(geometry);
    return geometry;
  }

  /**
   * Complete the municipal half of residential frontages. Private fences, gates, bins and
   * driveways live in the residential kit; this adds their founded contact marks and carries
   * garage drives over the remaining public footpath into a visibly dipped kerb.
   */
  _buildResidentialFrontageInterfaces() {
    const plans = planResidentialFrontages(this.city);
    if (!plans.length) return;
    const contactMat = this.materials.get('asphalt', {
      variant: 'p17-frontage-contact', color: '#262421', roughness: 0.98, metalness: 0.01,
    });
    tagSurface(contactMat, 'road');
    const pavingMat = getCityMaterial(this.materials, 'concrete', {
      variant: 'p17-driveway-crossing', color: '#aaa59b', roughness: 0.94, metalness: 0.01,
    });
    tagSurface(pavingMat, 'driveway');
    const rampMat = getCityMaterial(this.materials, 'concrete', {
      variant: 'p17-kerb-cut-ramp', color: '#8f8c84', roughness: 0.96, metalness: 0.01,
    });
    tagSurface(rampMat, 'driveway');
    const boundaryMat = this.materials.get('painted_metal', {
      variant: 'p17-walkup-boundary', color: '#263b34', roughness: 0.72, metalness: 0.24,
    });
    const binMat = this.materials.get('painted_metal', {
      variant: 'p17-rear-bin', color: '#315947', roughness: 0.82, metalness: 0.08,
    });
    const unitGeom = this._own(new THREE.BoxGeometry(1, 1, 1));
    const rampGeom = this._own(new THREE.BoxGeometry(1, 0.1, 1));
    rampGeom.rotateX(-Math.atan2(0.18, P17_FRONTAGE.kerbRampD));
    rampGeom.translate(0, 0.17, 0);
    rampGeom.computeBoundingBox();
    MaterialLibrary.ensureUv2(rampGeom);

    const boundaryContacts = [];
    const publicCrossings = [];
    const kerbRamps = [];
    const cutShadows = [];
    const boundaryKit = [];
    const rearBins = [];
    const rearBinLids = [];

    for (const plan of plans) {
      const parcel = this.city.parcels instanceof Map
        ? this.city.parcels.get(plan.parcelId)
        : this.city.parcels?.[plan.parcelId];
      if (!parcel) continue;
      // Break the contact course at every vehicle opening. The private kit already splits its
      // fence there; a continuous dark strip would put the visual equivalent of a rail back
      // across the driveway this layer is completing.
      const edge = plan.lotW * 0.5 - 0.16;
      const gaps = plan.driveways
        .map((drive) => [drive.x - drive.width * 0.5 - 0.12, drive.x + drive.width * 0.5 + 0.12]);
      if (plan.gate.clearWidth > 0) {
        gaps.push([
          plan.gate.x - plan.gate.clearWidth * 0.5,
          plan.gate.x + plan.gate.clearWidth * 0.5,
        ]);
      }
      gaps.sort((a, b) => a[0] - b[0]);
      let cursor = -edge;
      for (const [rawLo, rawHi] of gaps) {
        const lo = Math.max(-edge, rawLo);
        const hi = Math.min(edge, rawHi);
        if (lo - cursor > 0.32) {
          const point = frontagePoint(parcel, (cursor + lo) * 0.5, plan.boundaryZ);
          boundaryContacts.push(placement(point.x, 0.135, point.z, plan.rotation, {
            x: lo - cursor,
            y: P17_FRONTAGE.boundaryContactH,
            z: P17_FRONTAGE.boundaryContactD,
          }));
        }
        cursor = Math.max(cursor, hi);
      }
      if (edge - cursor > 0.32) {
        const point = frontagePoint(parcel, (cursor + edge) * 0.5, plan.boundaryZ);
        boundaryContacts.push(placement(point.x, 0.135, point.z, plan.rotation, {
          x: edge - cursor,
          y: P17_FRONTAGE.boundaryContactH,
          z: P17_FRONTAGE.boundaryContactD,
        }));
      }

      if (plan.supplementBoundary) {
        const toPlacement = (x, y, z, scale) => {
          const point = frontagePoint(parcel, x, z);
          return placement(point.x, y, point.z, plan.rotation, scale);
        };
        const gateLo = plan.gate.x - plan.gate.width * 0.5;
        const gateHi = plan.gate.x + plan.gate.width * 0.5;
        const runs = [[-edge, gateLo], [gateHi, edge]];
        for (const [lo, hi] of runs) {
          const width = hi - lo;
          if (width <= 0.3) continue;
          const centre = (lo + hi) * 0.5;
          boundaryKit.push(toPlacement(centre, 0.14, plan.boundaryZ, {
            x: width, y: 0.16, z: 0.34,
          }));
          for (const y of [0.43, 0.9]) {
            boundaryKit.push(toPlacement(centre, y, plan.boundaryZ, {
              x: width, y: P17_FRONTAGE.railH, z: P17_FRONTAGE.railD,
            }));
          }
          const postCount = Math.max(1, Math.ceil(width / 2.6));
          for (let post = 0; post <= postCount; post += 1) {
            const x = lo + width * (post / postCount);
            boundaryKit.push(toPlacement(x, 0.14, plan.boundaryZ, {
              x: P17_FRONTAGE.postFootW, y: 0.14, z: P17_FRONTAGE.postFootW,
            }));
            boundaryKit.push(toPlacement(x, 0.14 + P17_FRONTAGE.fenceH * 0.5,
              plan.boundaryZ, {
                x: P17_FRONTAGE.postW,
                y: P17_FRONTAGE.fenceH,
                z: P17_FRONTAGE.postW,
              }));
          }
        }
        // A closed leaf would fill the opening. Moderne leaves the gap empty; Beaux
        // still hangs the centred gate.
        if (!(plan.gate.clearWidth > 0)) {
          for (const y of [0.43, 0.9]) {
            boundaryKit.push(toPlacement(plan.gate.x, y, plan.boundaryZ + 0.03, {
              x: plan.gate.width, y: P17_FRONTAGE.railH, z: P17_FRONTAGE.railD,
            }));
          }
          for (const x of [gateLo + 0.1, gateHi - 0.1]) {
            boundaryKit.push(toPlacement(x, 0.68, plan.boundaryZ + 0.03, {
              x: P17_FRONTAGE.postW, y: 1.0, z: P17_FRONTAGE.postW,
            }));
          }
          boundaryKit.push(toPlacement(gateHi - 0.18, 0.78, plan.boundaryZ + 0.2, {
            x: 0.48, y: 0.32, z: 0.48,
          }));
        }
        // Post-mounted letterbox: broad enough to read as an address object, not a hairline.
        boundaryKit.push(toPlacement(plan.letterbox.x, 0.5, plan.letterbox.z, {
          x: P17_FRONTAGE.postW, y: 0.72, z: P17_FRONTAGE.postW,
        }));
        boundaryKit.push(toPlacement(plan.letterbox.x, 0.93, plan.letterbox.z, {
          x: 0.68, y: 0.5, z: 0.48,
        }));
        boundaryKit.push(toPlacement(plan.letterbox.x, 0.14, plan.letterbox.z, {
          x: 0.62, y: 0.14, z: 0.62,
        }));

        // The two street-wall walkups deliberately omit private services; put paired wheelie
        // bins on a rear pad where they cannot become frontage clutter.
        for (const offset of [-0.4, 0.4]) {
          rearBins.push(toPlacement(plan.bins.x + offset, 0.62, plan.bins.z, {
            x: 0.72, y: 0.96, z: 0.72,
          }));
          rearBinLids.push(toPlacement(plan.bins.x + offset, 1.12, plan.bins.z - 0.02, {
            x: 0.8, y: 0.14, z: 0.78,
          }));
        }
      }

      for (const drive of plan.driveways) {
        publicCrossings.push(placement(
          drive.world.x, 0.105, drive.world.z, plan.rotation,
          { x: drive.width + 0.22, y: P17_FRONTAGE.crossingH, z: drive.depth + 0.34 },
        ));
        kerbRamps.push(placement(
          drive.kerb.x, 0, drive.kerb.z, plan.rotation,
          { x: drive.width + 0.48, y: 1, z: P17_FRONTAGE.kerbRampD },
        ));
        const shadow = frontagePoint(parcel, drive.x, plan.kerbZ + 0.5);
        cutShadows.push(placement(shadow.x, 0.035, shadow.z, plan.rotation, {
          x: drive.width + 0.42, y: 0.045, z: 0.16,
        }));
      }
    }

    const add = (items, material, name, geometry = unitGeom) => {
      if (!items.length) return;
      const { group, meshes } = buildInstanced(
        { parts: [{ geometry, material }] },
        items,
        { castShadow: false, receiveShadow: true },
      );
      group.name = name;
      for (const mesh of meshes) mesh.name = `${name}:mesh`;
      this.root.add(group);
    };
    add(boundaryContacts, contactMat, 'street:p17-residential-boundary-contact');
    add(boundaryKit, boundaryMat, 'street:p17-boundary-posts-rails-gates-letterboxes');
    add(rearBins, binMat, 'street:p17-rear-bin-bodies');
    add(rearBinLids, contactMat, 'street:p17-rear-bin-lids');
    add(publicCrossings, pavingMat, 'street:p17-driveway-footpath-crossings');
    add(kerbRamps, rampMat, 'street:p17-driveway-kerb-ramps', rampGeom);
    add(cutShadows, contactMat, 'street:p17-driveway-kerb-cuts');

    this.stats.residentialFrontages = plans.length;
    this.stats.frontageFootings = boundaryContacts.length;
    this.stats.boundarySupplements = plans.filter((plan) => plan.supplementBoundary).length;
    this.stats.driveways = publicCrossings.length;
    this.stats.rearBins = rearBins.length;
  }

  /**
   * Raised L-section kerb: vertical face + horizontal tread.
   * Segmented per block run so kerbs TERMINATE at junction corners —
   * never a continuous bar through the crossroads.
   */
  _buildKerbs() {
    const kerbMat = getCityMaterial(this.materials, 'concrete', {
      variant: 'kerb-r4-high-value',
      color: '#c8c3bb',
      roughness: 0.92,
    });
    const pathEdgeMat = getCityMaterial(this.materials, 'concrete', {
      variant: 'footpath-edge-r4-high-value',
      color: '#a39e96',
      roughness: 0.94,
    });
    applyPublicPavingSurface(kerbMat, { role: 'kerb', quality: this.quality });
    applyPublicPavingSurface(pathEdgeMat, { role: 'edge', quality: this.quality });

    const unitGeom = this._own(new THREE.BoxGeometry(1, 1, 1));
    const facePlacements = [];
    const treadPlacements = [];
    const pathPlacements = [];

    const { blocksX, blocksZ } = this.city;
    const faceH = 0.18;
    const faceW = 0.13;
    const treadH = 0.07;
    const treadW = 0.30;
    const pathH = 0.055;
    const pathW = 0.58;
    // Mid-block kerb length — ends at block edges only (gap = full ROAD junction).
    const runLen = BLOCK;
    // Short L-returns at corners: perpendicular stubs so kerbs meet without
    // co-axial penetration of the junction carriageway (was ~7 m stubs).
    const cornerReturn = 0.9; // 0.5–1.2 m band

    // Vertical corridors (run along Z) — one segment per block, not full city height.
    for (let i = 0; i <= blocksX; i += 1) {
      const corridorX = i * PITCH + ROAD / 2;
      for (const localX of [CORRIDOR.kerbLow, CORRIDOR.kerbHigh]) {
        const x = corridorX - ROAD / 2 + localX;
        const outward = localX < ROAD / 2 ? -1 : 1;
        for (let bz = 0; bz < blocksZ; bz += 1) {
          // Segment centre mid-block; length = block only (gap at each ROAD junction).
          const z0 = bz * PITCH + ROAD + BLOCK / 2;
          const len = runLen - 0.35;
          facePlacements.push(placement(x - outward * faceW * 0.15, faceH / 2 + 0.02, z0, 0, {
            x: faceW,
            y: faceH,
            z: len,
          }));
          treadPlacements.push(placement(x + outward * treadW * 0.25, faceH + treadH / 2 + 0.01, z0, 0, {
            x: treadW,
            y: treadH,
            z: len,
          }));
          pathPlacements.push(placement(x + outward * 0.5, pathH / 2 + 0.03, z0, 0, {
            x: pathW,
            y: pathH,
            z: len,
          }));
          // L-returns at both ends: short stubs perpendicular (along X) so the
          // kerb turns the corner without continuing co-axially into the junction.
          const half = len / 2;
          for (const zEnd of [z0 - half, z0 + half]) {
            facePlacements.push(placement(
              x + outward * cornerReturn * 0.5 - outward * faceW * 0.15,
              faceH / 2 + 0.02,
              zEnd,
              0,
              { x: cornerReturn, y: faceH, z: faceW },
            ));
            treadPlacements.push(placement(
              x + outward * cornerReturn * 0.5 + outward * treadW * 0.25,
              faceH + treadH / 2 + 0.01,
              zEnd,
              0,
              { x: cornerReturn, y: treadH, z: treadW },
            ));
          }
        }
      }
    }

    // Horizontal corridors (run along X) — segmented per block.
    for (let j = 0; j <= blocksZ; j += 1) {
      const corridorZ = j * PITCH + ROAD / 2;
      for (const localZ of [CORRIDOR.kerbLow, CORRIDOR.kerbHigh]) {
        const z = corridorZ - ROAD / 2 + localZ;
        const outward = localZ < ROAD / 2 ? -1 : 1;
        for (let bx = 0; bx < blocksX; bx += 1) {
          const x0 = bx * PITCH + ROAD + BLOCK / 2;
          const len = runLen - 0.35;
          facePlacements.push(placement(x0, faceH / 2 + 0.02, z - outward * faceW * 0.15, 0, {
            x: len,
            y: faceH,
            z: faceW,
          }));
          treadPlacements.push(placement(x0, faceH + treadH / 2 + 0.01, z + outward * treadW * 0.25, 0, {
            x: len,
            y: treadH,
            z: treadW,
          }));
          pathPlacements.push(placement(x0, pathH / 2 + 0.03, z + outward * 0.5, 0, {
            x: len,
            y: pathH,
            z: pathW,
          }));
          // L-returns at both ends: short stubs perpendicular (along Z).
          const half = len / 2;
          for (const xEnd of [x0 - half, x0 + half]) {
            facePlacements.push(placement(
              xEnd,
              faceH / 2 + 0.02,
              z + outward * cornerReturn * 0.5 - outward * faceW * 0.15,
              0,
              { x: faceW, y: faceH, z: cornerReturn },
            ));
            treadPlacements.push(placement(
              xEnd,
              faceH + treadH / 2 + 0.01,
              z + outward * cornerReturn * 0.5 + outward * treadW * 0.25,
              0,
              { x: treadW, y: treadH, z: cornerReturn },
            ));
          }
        }
      }
    }

    const addLayer = (placements, material, name) => {
      if (!placements.length) return;
      const { group } = buildInstanced(
        { parts: [{ geometry: unitGeom, material }] },
        placements,
        { castShadow: false, receiveShadow: true },
      );
      group.name = name;
      this.root.add(group);
    };

    addLayer(facePlacements, kerbMat, 'streetscape:kerb-faces');
    addLayer(treadPlacements, kerbMat, 'streetscape:kerb-treads');
    addLayer(pathPlacements, pathEdgeMat, 'streetscape:footpath-edges');
    this.stats.kerbs = facePlacements.length + treadPlacements.length;
    this._buildTramStreet();
  }

  /** S3: full-width jointed paving and founded stop kits, all in metres. */
  _buildTramStreet() {
    const cube = this._own(new THREE.BoxGeometry(1, 1, 1));
    const paver = this._own(tramBevelBox(1, 1, 1, 0.025));
    const surfaces = {
      paving: ['#a39e96', 0.94], joints: ['#77776e', 0.96],
      gutter: ['#5c615e', 0.92], metal: ['#303d36', 0.48],
      tactile: ['#c6a751', 0.83], glass: ['#59716f', 0.24],
      bench: ['#826647', 0.76], roof: ['#727c70', 0.63],
    };
    const rows = Object.fromEntries(Object.keys(surfaces).map(k => [k, []]));
    const put = (kind, x, y, z, w, h, d, rotation = 0) =>
      rows[kind].push(placement(x, y, z, rotation, {x:w,y:h,z:d}));
    // Both sides of every block face. Gaps expose the darker joint bed, never asphalt.
    for (const axis of ['v', 'h']) {
      const across = axis === 'v' ? this.city.blocksX : this.city.blocksZ;
      const along = axis === 'v' ? this.city.blocksZ : this.city.blocksX;
      const point = (fixed, at) => axis === 'v' ? [fixed, at] : [at, fixed];
      const rot = axis === 'v' ? 0 : 90;
      for (let i = 0; i <= across; i++) for (const side of [-1, 1]) {
        const kerb = i*PITCH + (side < 0 ? CORRIDOR.kerbLow : CORRIDOR.kerbHigh);
        const centre = kerb + side*1.5;
        for (let b = 0; b < along; b++) {
          const start = b*PITCH+ROAD;
          const [x,z] = point(centre,start+BLOCK/2);
          put('joints',x,.16,z,2.94,.1,BLOCK-.2,rot);
          for (let j=0;j<BLOCK/1.5;j++) for (const row of [-.75,.75]) {
            const [px,pz] = point(centre+row,start+j*1.5+.75);
            put('paving',px,.225,pz,1.455,.10,1.455,rot);
          }
          for (let j=0;j<BLOCK/1.5;j++) {
            const [kx,kz] = point(kerb,start+j*1.5+.75);
            put('paving',kx,.18,kz,.28,.23,1.455,rot);
          }
          const [gx,gz] = point(kerb-side*.28,start+BLOCK/2);
          put('gutter',gx,.035,gz,.43,.028,BLOCK-.35,rot);
          // Crossings retain clear carriageways; tactile panels stay behind the kerb.
          for (const at of [start+.85,start+BLOCK-.85]) {
            const [tx,tz] = point(kerb+side*.62,at);
            put('tactile',tx,.289,tz,.85,.03,1.35,rot);
            for (let q=0;q<5;q++) {
              const [dx,dz] = point(kerb+side*.62,at-.5+q*.25);
              put('joints',dx,.31,dz,.65,.025,.035,rot);
            }
          }
        }
      }
    }
    // Preserve the corridor census after removing overhead from tram reservations.
    const corridors = [
      ...(this.city.corridors?.vertical ?? []).filter(c=>c.tram).map(c=>({...c,axis:'v'})),
      ...(this.city.corridors?.horizontal ?? []).filter(c=>c.tram).map(c=>({...c,axis:'h'})),
    ];
    // P22-P1: trams run without visible overhead; cut poles, bases, arms and wires.
    const poleCount = 0;
    const signBackings = [];
    // F1: the procedural stop kit (board.js `_buildTransit`) draws the whole stop.
    const stopKit = tramStopKitEnabled();
    for (const stop of (stopKit ? [] : (this.city.transit ?? []).filter(s=>s.kind==='stop'))) {
      const vertical = stop.rotation === 90;
      const rot = vertical ? 90 : 0;
      const point = (x,z) => vertical ? [stop.x+z,stop.z-x] : [stop.x+x,stop.z+z];
      const part = (kind,x,y,z,w,h,d) => { const [px,pz]=point(x,z); put(kind,px,y,pz,w,h,d,rot); };
      part('paving',0,.34,0,6.2,.14,2.6);
      part('roof',0,3.02,0,4.6,.20,2.35);
      for (const x of [-2,2]) for (const z of [-.9,.9]) part('metal',x,1.72,z,.13,2.75,.13);
      part('glass',0,1.85,.93,3.9,1.65,.07);
      for (const x of [-1.2,1.2]) part('metal',x,.64,.5,.12,.54,.55);
      part('bench',0,.93,.5,2.8,.14,.58);
      part('bench',0,1.27,.77,2.8,.46,.09);
      part('tactile',0,.425,-1.08,5.7,.025,.32);
      for (let x=-2.6;x<2.7;x+=.26) part('joints',x,.447,-1.08,.06,.022,.24);
      part('metal',2.7,1.86,.75,.12,3.0,.12);
      const [signX, signZ] = point(2.7, .75);
      signBackings.push(placement(signX, 3.14, signZ, rot, { x: .65, y: .55, z: .10 }));
      part('metal',2.7,3.14,.685,.41,.25,.025);
    }
    const pitCuts = this._excavatePublicPits(rows);
    for (const [kind, list] of Object.entries(rows)) {
      if (!list.length) continue;
      const [color,roughness] = surfaces[kind];
      const material = this.materials.get(kind === 'metal' ? 'painted_metal' : 'concrete', {
        variant: `s3-tram-street-${kind}`, color, roughness, metalness: kind === 'metal' ? .35 : 0,
      });
      if (kind === 'paving') applyPublicPavingSurface(material, { role: 'paving', quality: this.quality });
      if (kind === 'gutter') applyPublicPavingSurface(material, { role: 'gutter', quality: this.quality });
      if (kind === 'joints') applyPublicPavingSurface(material, { role: 'joint', quality: this.quality });
      const {group} = buildInstanced({parts:[{geometry:kind==='paving'?paver:cube,material}]},list,
        {castShadow:kind==='metal'||kind==='roof',receiveShadow:true});
      group.name = `streetscape:s3-${kind}`;
      this.root.add(group);
    }
    if (signBackings.length) {
      const signBacking = getCityMaterial(this.materials, 'concrete', {
        variant: 's3-tram-street-sign-backing',
        color: '#e4dfd6',
        roughness: 0.84,
        metalness: 0,
      });
      signBacking.color.set('#e4dfd6');
      signBacking.roughness = 0.84;
      signBacking.metalness = 0;
      for (const key of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'bumpMap', 'metalnessMap']) {
        if (key in signBacking) signBacking[key] = null;
      }
      if (typeof signBacking.aoMapIntensity === 'number') signBacking.aoMapIntensity = 0;
      const { group } = buildInstanced(
        { parts: [{ geometry: paver, material: signBacking }] },
        signBackings,
        { castShadow: false, receiveShadow: true },
      );
      group.name = 'streetscape:s3-sign-backing';
      this.root.add(group);
    }
    this._addPitFragments(pitCuts);
    this.root.userData.s3 = {corridors:corridors.length,poles:poleCount,
      stops:(this.city.transit??[]).filter(s=>s.kind==='stop').length,pavers:rows.paving.length};
  }

  _sameRect(a, b) {
    return Math.abs(a.minX - b.minX) < 1e-6 && Math.abs(a.maxX - b.maxX) < 1e-6
      && Math.abs(a.minZ - b.minZ) < 1e-6 && Math.abs(a.maxZ - b.maxZ) < 1e-6;
  }

  _isFootpathSlab(item) {
    return Math.abs(item.position.y - 0.225) < 1e-4
      && Math.abs(item.scale.y - 0.10) < 1e-4
      && Math.abs(item.scale.x - 1.455) < 1e-3
      && Math.abs(item.scale.z - 1.455) < 1e-3;
  }

  _isJointBed(item) {
    const across = Math.min(item.scale.x, item.scale.z);
    const along = Math.max(item.scale.x, item.scale.z);
    return Math.abs(item.position.y - 0.16) < 1e-4
      && Math.abs(item.scale.y - 0.1) < 1e-4
      && Math.abs(across - 2.94) < 1e-3
      && along > 10;
  }

  _cutPlacements(list, admit) {
    const kept = [];
    const fragments = [];
    let cut = 0;
    const layout = this.publicTreePits;
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (!admit(item) || !layout?.pits?.length) {
        kept.push(item);
        continue;
      }
      const rect = placementWorldRect(item);
      const holes = pitsTouchingRect(layout, rect).map((pit) => pit.rim);
      if (!holes.length) {
        kept.push(item);
        continue;
      }
      let parts = [rect];
      for (let h = 0; h < holes.length; h += 1) {
        const next = [];
        for (let p = 0; p < parts.length; p += 1) {
          const pieces = subtractRectangle(parts[p], holes[h]);
          for (let k = 0; k < pieces.length; k += 1) next.push(pieces[k]);
        }
        parts = next;
      }
      if (parts.length === 1 && this._sameRect(parts[0], rect)) {
        kept.push(item);
        continue;
      }
      cut += 1;
      for (let p = 0; p < parts.length; p += 1) {
        const part = parts[p];
        const width = part.maxX - part.minX;
        const depth = part.maxZ - part.minZ;
        if (!(width > 0) || !(depth > 0)) continue;
        const fragment = placement(
          (part.minX + part.maxX) * 0.5,
          item.position.y,
          (part.minZ + part.maxZ) * 0.5,
          0,
          { x: width, y: item.scale.y, z: depth },
        );
        fragment.origin = item.position;
        fragments.push(fragment);
      }
    }
    return { kept, fragments, cut };
  }

  _excavatePublicPits(rows) {
    if (!this.publicTreePits?.pits?.length) {
      return { pavingFragments: [], jointFragments: [], pavingCut: 0, jointCut: 0 };
    }
    const paving = this._cutPlacements(rows.paving, (item) => this._isFootpathSlab(item));
    const joints = this._cutPlacements(rows.joints, (item) => this._isJointBed(item));
    rows.paving = paving.kept;
    rows.joints = joints.kept;
    this.root.userData.publicPitCuts = {
      pavingSlabsCut: paving.cut,
      pavingFragments: paving.fragments.length,
      jointBedsCut: joints.cut,
      jointFragments: joints.fragments.length,
    };
    return {
      pavingFragments: paving.fragments,
      jointFragments: joints.fragments,
      pavingCut: paving.cut,
      jointCut: joints.cut,
    };
  }

  _addPitFragments(cuts) {
    const add = (name, role, fragments) => {
      if (!fragments.length) return;
      const [color, roughness] = role === 'joint'
        ? ['#77776e', 0.96]
        : ['#a39e96', 0.94];
      const material = this.materials.get('concrete', {
        variant: `s3-tram-street-${role}-pit-fragment`,
        color,
        roughness,
        metalness: 0,
      });
      applyPublicPavingSurface(material, { role, quality: this.quality, originAttribute: true });
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      MaterialLibrary.ensureUv2(geometry);
      geometry.userData.boardOwnedPitFragment = true;
      const origins = new Float32Array(fragments.length * 3);
      for (let i = 0; i < fragments.length; i += 1) {
        const origin = fragments[i].origin;
        origins[i * 3] = origin.x;
        origins[i * 3 + 1] = origin.y;
        origins[i * 3 + 2] = origin.z;
      }
      geometry.setAttribute('p43Origin', new THREE.InstancedBufferAttribute(origins, 3));
      const { group } = buildInstanced(
        { parts: [{ geometry, material }] },
        fragments,
        { castShadow: false, receiveShadow: true },
      );
      group.name = name;
      this.root.add(group);
    };
    add('streetscape:s3-paving-pit-fragments', 'paving', cuts?.pavingFragments ?? []);
    add('streetscape:s3-joint-pit-fragments', 'joint', cuts?.jointFragments ?? []);
  }

  /**
   * Centreline dashes and edge lane ticks as thin meshes.
   */
  _buildMarkings() {
    const markMat = this.materials.get('concrete', {
      variant: 'road-marking',
      color: TASTE.built.marking,
      roughness: 0.95,
    });
    // W4-B: worn paint at about 85% opacity over the asphalt, not an opaque decal.
    markMat.transparent = true;
    markMat.opacity = 0.85;
    markMat.depthWrite = false;
    markMat.color.multiplyScalar(ROAD_PAINT_GAIN);
    const geom = this._own(roadPaintGeometry());
    const dashH = 0.03;
    const y = 0.055;
    const planned = planRoadMarkings(this.city, {
      quality: this.quality,
      plateScale: this.plateScaleDensity,
    });
    const lineRecords = planned.filter((record) => record.kind === 'lane-line' || record.kind === 'edge-line');
    const dashes = lineRecords.map((record) => placement(record.x, y, record.z, 0, {
      x: record.axis === 'x' ? record.length : record.width,
      y: dashH,
      z: record.axis === 'z' ? record.length : record.width,
    }));
    this.roadMarkingPlan = planned;
    if (!dashes.length) return;
    const { group } = buildInstanced(
      { parts: [{ geometry: geom, material: markMat }] },
      dashes,
      { castShadow: false, receiveShadow: false },
    );
    group.name = 'street:p17:worn-lane-lines';
    this.root.add(group);
    this.stats.markings = dashes.length;

    // Asphalt-coloured chips are the deterministic wear map. They sit one paint-film above the
    // decal and cut irregular gaps into every fifth dash without a unique texture or draw per mark.
    const wearMat = this.materials.get('asphalt', {
      variant: 'p17-road-marking-wear', color: '#4a4944', roughness: 0.88, metalness: 0.02,
    });
    tagSurface(wearMat, 'road');
    const wear = dashes.filter((_, index) => index % 5 === 2).map((dash, index) => {
      const longX = dash.scale.x > dash.scale.z;
      const direction = index % 2 === 0 ? -1 : 1;
      return placement(
        dash.position.x + (longX ? direction * dash.scale.x * 0.18 : 0),
        y + dashH * 0.58,
        dash.position.z + (longX ? 0 : direction * dash.scale.z * 0.18),
        0,
        {
          x: longX ? dash.scale.x * 0.27 : dash.scale.x * 0.72,
          y: dashH * 0.32,
          z: longX ? dash.scale.z * 0.72 : dash.scale.z * 0.27,
        },
      );
    });
    if (wear.length) {
      const wearBatch = buildInstanced(
        { parts: [{ geometry: geom, material: wearMat }] },
        wear,
        { castShadow: false, receiveShadow: false },
      );
      wearBatch.group.name = 'street:p17:marking-wear-map';
      this.root.add(wearBatch.group);
    }

    const arrowRecords = planned.filter((record) => record.kind === 'arrow');
    const arrows = arrowRecords.map((record) => placement(
      record.x, y, record.z, record.rotation ?? 0,
      { x: record.width, y: dashH, z: record.length },
    ));
    if (arrows.length) {
      const arrowGeom = this._own(roadPaintGeometry({ arrow: true }));
      const arrowBatch = buildInstanced(
        { parts: [{ geometry: arrowGeom, material: markMat }] },
        arrows,
        { castShadow: false, receiveShadow: false },
      );
      arrowBatch.group.name = 'street:p17:worn-lane-arrows';
      this.root.add(arrowBatch.group);
    }

    // The separate plate-scale wear slabs read as hard black strips at low quality.
    // Retire only their mounted batch; keep the deterministic marking plan and
    // all high/medium street geometry byte-identical.
    const trackRecords = this.quality === 'low' ? [] : planned.filter((record) => record.kind === 'wear-track');
    const tracks = trackRecords.map((record) => placement(record.x, 0.052, record.z, 0, {
      x: record.axis === 'x' ? record.length : record.width,
      y: 0.018,
      z: record.axis === 'z' ? record.length : record.width,
    }));
    if (tracks.length) {
      const trackMat = this.materials.get('asphalt', {
        // Board road #474b51 -> #3f4349: eight authored luma points, above the six-point law.
        variant: 'p17-plate-wheel-wear', color: '#3f4349', roughness: 0.96, metalness: 0,
      });
      tagSurface(trackMat, 'wheel-track');
      const trackBatch = buildInstanced(
        { parts: [{ geometry: geom, material: trackMat }] },
        tracks,
        { castShadow: false, receiveShadow: false },
      );
      trackBatch.group.name = 'street:p17:asphalt-wear-tracks';
      this.root.add(trackBatch.group);
    }
    this.stats.markingWear = wear.length;
    this.stats.arrows = arrows.length;
    this.stats.roadWearTracks = tracks.length;
    this.stats.markingMinWidth = Math.min(...planned.map((record) => record.width));
    this.stats.markings += arrows.length + tracks.length;
  }

  /** White stop lines at block approaches + zebras at every interior junction. */
  _buildStopLinesAndZebras() {
    const whiteMat = this.materials.get('concrete', {
      variant: 'road-marking-pure-white-r4',
      color: TASTE.built.marking,
      roughness: 0.74,
    });
    // W4-B: hold lines and zebra bars in the marking token at about 85% opacity, never pure white.
    whiteMat.transparent = true;
    whiteMat.opacity = 0.85;
    whiteMat.depthWrite = false;
    whiteMat.color.multiplyScalar(ROAD_PAINT_GAIN);
    const geom = this._own(roadPaintGeometry());
    const placements = [];
    const { blocksX, blocksZ } = this.city;
    const y = 0.058;
    const stopH = 0.028;

    // Stop lines: solid bar across each carriageway approach into a junction.
    // Vertical corridors — stop just before each horizontal junction.
    for (let i = 0; i <= blocksX; i += 1) {
      const corridorX = i * PITCH + ROAD / 2;
      for (let j = 0; j <= blocksZ; j += 1) {
        const junctionZ = j * PITCH + ROAD / 2;
        // Northbound approach (south of junction).
        if (j > 0 || blocksZ > 0) {
          const z = junctionZ - ROAD / 2 - 0.6;
          if (z > 0.5) {
            for (const side of [
              (CORRIDOR.carriagewayA[0] + CORRIDOR.carriagewayA[1]) / 2,
              (CORRIDOR.carriagewayB[0] + CORRIDOR.carriagewayB[1]) / 2,
            ]) {
              const x = corridorX - ROAD / 2 + side;
              placements.push(placement(x, y, z, 0, {
                x: 2.4,
                y: stopH,
                z: ROAD_PAINT_M.hold,
              }));
            }
          }
        }
        // Southbound approach (north of junction).
        const zN = junctionZ + ROAD / 2 + 0.6;
        const extentZ = blocksZ * PITCH + ROAD;
        if (zN < extentZ - 0.5) {
          for (const side of [
            (CORRIDOR.carriagewayA[0] + CORRIDOR.carriagewayA[1]) / 2,
            (CORRIDOR.carriagewayB[0] + CORRIDOR.carriagewayB[1]) / 2,
          ]) {
            const x = corridorX - ROAD / 2 + side;
            placements.push(placement(x, y, zN, 0, {
              x: 2.4,
              y: stopH,
              z: ROAD_PAINT_M.hold,
            }));
          }
        }
      }
    }

    // Horizontal corridors — stop just before each vertical junction.
    for (let j = 0; j <= blocksZ; j += 1) {
      const corridorZ = j * PITCH + ROAD / 2;
      for (let i = 0; i <= blocksX; i += 1) {
        const junctionX = i * PITCH + ROAD / 2;
        const xW = junctionX - ROAD / 2 - 0.6;
        if (xW > 0.5) {
          for (const side of [
            (CORRIDOR.carriagewayA[0] + CORRIDOR.carriagewayA[1]) / 2,
            (CORRIDOR.carriagewayB[0] + CORRIDOR.carriagewayB[1]) / 2,
          ]) {
            const z = corridorZ - ROAD / 2 + side;
            placements.push(placement(xW, y, z, 0, {
              x: ROAD_PAINT_M.hold,
              y: stopH,
              z: 2.4,
            }));
          }
        }
        const xE = junctionX + ROAD / 2 + 0.6;
        const extentX = blocksX * PITCH + ROAD;
        if (xE < extentX - 0.5) {
          for (const side of [
            (CORRIDOR.carriagewayA[0] + CORRIDOR.carriagewayA[1]) / 2,
            (CORRIDOR.carriagewayB[0] + CORRIDOR.carriagewayB[1]) / 2,
          ]) {
            const z = corridorZ - ROAD / 2 + side;
            placements.push(placement(xE, y, z, 0, {
              x: ROAD_PAINT_M.hold,
              y: stopH,
              z: 2.4,
            }));
          }
        }
      }
    }

    // Product-read contract: every interior junction gets both crossing axes.
    const candidates = [];
    for (let i = 1; i < blocksX; i += 1) {
      for (let j = 1; j < blocksZ; j += 1) {
        candidates.push({ i, j });
      }
    }
    const seen = new Set();
    let zebraStripes = 0;
    const tyrePolish = [];
    for (const c of candidates) {
      const key = `${c.i},${c.j}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const jx = c.i * PITCH + ROAD / 2;
      const jz = c.j * PITCH + ROAD / 2;
      // Kerb-to-kerb span (carriageway pack between opposite kerbs).
      // Critic: prior stripe pack only spanned ~6.16 m; must be kerbHigh - kerbLow = 10 m.
      const kerbSpan = CORRIDOR.kerbHigh - CORRIDOR.kerbLow;
      const kerbMid = (CORRIDOR.kerbLow + CORRIDOR.kerbHigh) / 2;
      const stripeCount = 7;
      const stripeW = 0.5; // short axis of each bar
      const stripeGap = 0.38;
      const walkWidth = stripeCount * stripeW + (stripeCount - 1) * stripeGap;

      // Cross N–S road (walk E–W): bars long in X across corridor, short in Z,
      // arrayed in Z for walk width. South approach of the junction.
      const xCentreNS = jx - ROAD / 2 + kerbMid;
      const zPack0 = jz - ROAD / 2 - 0.4 - walkWidth;
      for (let s = 0; s < stripeCount; s += 1) {
        const z = zPack0 + s * (stripeW + stripeGap) + stripeW / 2;
        placements.push(placement(xCentreNS, y, z, 0, {
          x: kerbSpan,
          y: stopH,
          z: stripeW,
        }));
        zebraStripes += 1;
      }
      const zPackCentre = zPack0 + walkWidth * 0.5;
      for (const laneX of [xCentreNS - 3.5, xCentreNS + 3.5]) {
        tyrePolish.push(placement(laneX, y + stopH * 0.62, zPackCentre, 0, {
          x: 0.56, y: stopH * 0.24, z: walkWidth,
        }));
      }

      // Cross E–W road (walk N–S): bars long in Z across corridor, short in X,
      // arrayed in X for walk width. West approach of the junction.
      const zCentreEW = jz - ROAD / 2 + kerbMid;
      const xPack0 = jx - ROAD / 2 - 0.4 - walkWidth;
      for (let s = 0; s < stripeCount; s += 1) {
        const x = xPack0 + s * (stripeW + stripeGap) + stripeW / 2;
        placements.push(placement(x, y, zCentreEW, 0, {
          x: stripeW,
          y: stopH,
          z: kerbSpan,
        }));
        zebraStripes += 1;
      }
      const xPackCentre = xPack0 + walkWidth * 0.5;
      for (const laneZ of [zCentreEW - 3.5, zCentreEW + 3.5]) {
        tyrePolish.push(placement(xPackCentre, y + stopH * 0.62, laneZ, 0, {
          x: walkWidth, y: stopH * 0.24, z: 0.56,
        }));
      }
    }
    this.stats.crossings = seen.size;

    if (!placements.length) return;
    const { group } = buildInstanced(
      { parts: [{ geometry: geom, material: whiteMat }] },
      placements,
      { castShadow: false, receiveShadow: false },
    );
    group.name = 'street:p17:worn-stop-zebra';
    this.root.add(group);
    if (tyrePolish.length) {
      const polishMat = this.materials.get('asphalt', {
        variant: 'p17-zebra-tyre-polish', color: '#26282a', roughness: 0.42, metalness: 0.04,
      });
      tagSurface(polishMat, 'road');
      const polishBatch = buildInstanced(
        { parts: [{ geometry: geom, material: polishMat }] },
        tyrePolish,
        { castShadow: false, receiveShadow: false },
      );
      polishBatch.group.name = 'street:p17:zebra-tyre-polish';
      this.root.add(polishBatch.group);
    }
    this.stats.markings += placements.length;
    this.stats.tyrePolish = tyrePolish.length;
    this.stats.stopLines = placements.length - zebraStripes;
    this.stats.zebraStripes = zebraStripes;
  }

  /** P17 kerb population: low-draw rounded vehicle families plus deterministic shop/transit beats. */
  _buildP17ParkedVehicles() {
    // Compatibility entry point for older callers; deliberately creates no geometry.
    this.stats.cars = 0;
    this.stats.parkedByType = { sedan: 0, van: 0, truck: 0, bus: 0 };
  }

  /** Batched street furniture: retained bins and café sets. */
  _buildP17StreetFurniture() {
    const plan = planStreetFurniture(this.city, { plateScale: this.plateScaleDensity });
    if (!plan.length) return;
    const metal = getCityMaterial(this.materials, 'painted_metal', {
      variant: 'p21-city-steel', ...CITY_FINISHES.paintedSteel,
    });
    const dark = this.materials.get('asphalt', {
      variant: 'p17-prop-contact', color: '#1b1a18', roughness: 1,
    });
    tagSurface(dark, 'road');
    const timber = getCityMaterial(this.materials, 'timber', {
      variant: 'p21-city-timber', ...CITY_FINISHES.timber,
    });
    const canvas = getCityMaterial(this.materials, 'painted_metal', {
      variant: 'p17-cafe-umbrella', color: '#bd3d32', roughness: 0.88, metalness: 0,
    });
    const box = (w, h, d, x = 0, y = h / 2, z = 0) => {
      const geometry = new THREE.BoxGeometry(w, h, d);
      geometry.translate(x, y, z);
      return geometry;
    };
    const cylinder = (r, h, x = 0, y = h / 2, z = 0, sides = 10) => {
      const geometry = new THREE.CylinderGeometry(r, r, h, sides, 1);
      geometry.translate(x, y, z);
      return geometry;
    };
    const merge = (parts, name) => {
      const geometry = mergeStreetVehicleParts(parts);
      geometry.name = name;
      return this._own(geometry);
    };
    const contactDisc = (radius, name) => {
      const geometry = new THREE.CircleGeometry(radius, 18);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, 0.018, 0);
      geometry.name = name;
      return this._own(geometry);
    };

    const binBody = merge([
      cylinder(0.4, 0.96), cylinder(0.46, 0.11, 0, 1.015, 0),
    ], 'p17-street-bin');
    const binContact = contactDisc(0.52, 'p17-bin-contact');
    const cafeFurniture = [];
    cafeFurniture.push(cylinder(0.075, 0.78));
    cafeFurniture.push(cylinder(0.82, 0.1, 0, 0.8, 0, 20));
    for (const [x, z, yaw] of [[-1.12, 0, 0], [1.12, 0, 0], [0, -1.12, 90], [0, 1.12, 90]]) {
      const seat = box(0.48, 0.1, 0.48, x, 0.48, z);
      seat.rotateY(yaw * Math.PI / 180);
      cafeFurniture.push(seat, cylinder(0.045, 0.48, x, 0.24, z));
    }
    const cafeTable = merge(cafeFurniture, 'p17-cafe-table-and-chairs');
    const umbrellaPole = this._own(cylinder(0.045, 2.42));
    const umbrella = new THREE.ConeGeometry(1.35, 0.42, 18, 1, true);
    umbrella.translate(0, 2.32, 0);
    umbrella.name = 'p17-cafe-umbrella-canopy';
    this._own(umbrella);
    const cafeContact = contactDisc(1.52, 'p17-cafe-contact');

    const models = {
      bin: { parts: [{ geometry: binBody, material: metal }, { geometry: binContact, material: dark }] },
      cafe: { parts: [
        { geometry: cafeTable, material: timber }, { geometry: umbrellaPole, material: metal },
        { geometry: umbrella, material: canvas }, { geometry: cafeContact, material: dark },
      ] },
    };

    this.furnitureBatches = [];
    for (const [kind, model] of Object.entries(models)) {
      const records = plan.filter((record) => record.kind === kind);
      if (!records.length) continue;
      const placements = records.map((record) => placement(record.x, 0, record.z, record.rotation ?? 0));
      const { group, meshes } = buildInstanced(model, placements, {
        castShadow: this.quality === 'high', receiveShadow: true,
      });
      group.name = `street:p17:${kind}`;
      this.root.add(group);
      this.furnitureBatches.push({ kind, records, placements, meshes });
    }
    this.furniturePlacements = plan;
    this.stats.streetFurniture = plan.length;
    this.stats.streetFurnitureByKind = Object.fromEntries(
      Object.keys(models).map((kind) => [kind, plan.filter((record) => record.kind === kind).length]),
    );
  }

  /**
   * Parked car blocks on corridor edges. Density from quality; positions from city.seed.
   * R8B: one shared instanced batch per semantic product part (paint, greenhouse,
   * tyres, arch/rocker, rims, headlamps, taillamps). No per-colour draw multiplication.
   */
  _buildParkedCars() {
    this._buildP17ParkedVehicles();
  }

  /**
   * Bollards + Melbourne tram-stop signs on tram corridors (footpath edge).
   * PTV-style: black pole + blue square blade + white tram mark (not a red fabric flag).
   */
  _buildBollardsAndTramFlags() {
    // R19k: dark cast bollard only — no yellow collars (chess-piece confetti major).
    const bollardMat = this.materials.get('painted_metal', {
      variant: 'bollard-r19k-dark',
      color: '#1a1e22',
      roughness: 0.55,
      metalness: 0.38,
    });
    const bollardBandMat = this.materials.get('painted_metal', {
      variant: 'bollard-r19k-dark-band',
      color: '#2a2e34',
      roughness: 0.5,
      metalness: 0.4,
    });
    const poleMat = this.materials.get('painted_metal', {
      variant: 'tram-stop-pole-melb',
      color: '#141618',
      roughness: 0.42,
      metalness: 0.45,
    });
    // PTV / Melbourne tram stop blue.
    const signBlueMat = this.materials.get('painted_metal', {
      variant: 'tram-stop-sign-blue-melb',
      color: '#0077c8',
      roughness: 0.42,
      metalness: 0.08,
    });
    const signWhiteMat = this.materials.get('painted_metal', {
      variant: 'tram-stop-sign-white-melb',
      color: '#f4f7fa',
      roughness: 0.55,
      metalness: 0.04,
    });
    const signDarkMat = this.materials.get('painted_metal', {
      variant: 'tram-stop-sign-dark-melb',
      color: '#0a2a48',
      roughness: 0.5,
      metalness: 0.05,
    });

    // R19k: slim dark bollard (not fat gold-collar chess piece).
    const bollardPlinth = this._own(new THREE.CylinderGeometry(0.18, 0.22, 0.1, 10, 1));
    bollardPlinth.translate(0, 0.05, 0);
    bollardPlinth.name = 'bollard-plinth';
    MaterialLibrary.ensureUv2(bollardPlinth);
    const bollardGeom = this._own(new THREE.CylinderGeometry(0.1, 0.14, 1.15, 10, 1));
    bollardGeom.translate(0, 0.7, 0);
    bollardGeom.name = 'bollard';
    MaterialLibrary.ensureUv2(bollardGeom);
    // Dark ring only (same material family as body).
    const bollardBandGeom = this._own(new THREE.CylinderGeometry(0.12, 0.13, 0.1, 10, 1));
    bollardBandGeom.translate(0, 0.45, 0);
    bollardBandGeom.name = 'bollard-band';
    MaterialLibrary.ensureUv2(bollardBandGeom);
    const bollardUpperBandGeom = this._own(new THREE.CylinderGeometry(0.11, 0.12, 0.08, 10, 1));
    bollardUpperBandGeom.translate(0, 1.05, 0);
    bollardUpperBandGeom.name = 'bollard-upper-band';
    MaterialLibrary.ensureUv2(bollardUpperBandGeom);
    const bollardCapGeom = this._own(new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55));
    bollardCapGeom.translate(0, 1.32, 0);
    bollardCapGeom.name = 'bollard-cap';
    MaterialLibrary.ensureUv2(bollardCapGeom);

    // —— Melbourne tram stop sign kit (pole + bracket + blue blade + white mark) ——
    const poleGeom = this._own(new THREE.CylinderGeometry(0.05, 0.07, 3.35, 10, 1));
    poleGeom.translate(0, 1.68, 0);
    poleGeom.name = 'tram-stop-pole';
    MaterialLibrary.ensureUv2(poleGeom);
    // Flat cap (not sphere finial — municipal pole).
    const poleCap = this._own(new THREE.CylinderGeometry(0.07, 0.055, 0.06, 10, 1));
    poleCap.translate(0, 3.38, 0);
    poleCap.name = 'tram-stop-pole-cap';
    MaterialLibrary.ensureUv2(poleCap);
    // Horizontal arm holding the blade off the pole.
    const armGeom = this._own(new THREE.BoxGeometry(0.36, 0.06, 0.06));
    armGeom.translate(0.22, 3.05, 0);
    armGeom.name = 'tram-stop-arm';
    MaterialLibrary.ensureUv2(armGeom);

    // Blue square face (Melbourne / PTV stop blade) — local +X side of pole.
    const bladeY = 3.05;
    const bladeX = 0.55;
    const signBlueGeom = this._own(new THREE.BoxGeometry(0.06, 0.72, 0.72));
    signBlueGeom.translate(bladeX, bladeY, 0);
    signBlueGeom.name = 'tram-stop-blade-blue';
    MaterialLibrary.ensureUv2(signBlueGeom);
    // White rim + tram pictogram + TRAM strip (merged for one white draw).
    const whiteRimGeoms = [];
    {
      const top = new THREE.BoxGeometry(0.05, 0.05, 0.78);
      top.translate(bladeX + 0.01, bladeY + 0.365, 0);
      MaterialLibrary.ensureUv2(top);
      whiteRimGeoms.push(top);
      const bot = new THREE.BoxGeometry(0.05, 0.05, 0.78);
      bot.translate(bladeX + 0.01, bladeY - 0.365, 0);
      MaterialLibrary.ensureUv2(bot);
      whiteRimGeoms.push(bot);
      const left = new THREE.BoxGeometry(0.05, 0.72, 0.05);
      left.translate(bladeX + 0.01, bladeY, 0.365);
      MaterialLibrary.ensureUv2(left);
      whiteRimGeoms.push(left);
      const right = new THREE.BoxGeometry(0.05, 0.72, 0.05);
      right.translate(bladeX + 0.01, bladeY, -0.365);
      MaterialLibrary.ensureUv2(right);
      whiteRimGeoms.push(right);
    }
    const whiteMarkGeoms = [];
    {
      const body = new THREE.BoxGeometry(0.04, 0.22, 0.42);
      body.translate(bladeX + 0.04, bladeY - 0.02, 0);
      MaterialLibrary.ensureUv2(body);
      whiteMarkGeoms.push(body);
      const roof = new THREE.BoxGeometry(0.04, 0.08, 0.36);
      roof.translate(bladeX + 0.04, bladeY + 0.12, 0);
      MaterialLibrary.ensureUv2(roof);
      whiteMarkGeoms.push(roof);
      const pan = new THREE.BoxGeometry(0.03, 0.1, 0.04);
      pan.translate(bladeX + 0.04, bladeY + 0.2, 0);
      MaterialLibrary.ensureUv2(pan);
      whiteMarkGeoms.push(pan);
      for (const wz of [-0.14, 0.0, 0.14]) {
        const win = new THREE.BoxGeometry(0.035, 0.1, 0.09);
        win.translate(bladeX + 0.055, bladeY + 0.02, wz);
        MaterialLibrary.ensureUv2(win);
        whiteMarkGeoms.push(win);
      }
      for (const wz of [-0.14, 0.14]) {
        const wheel = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 8, 1);
        wheel.rotateZ(Math.PI / 2);
        wheel.translate(bladeX + 0.05, bladeY - 0.16, wz);
        MaterialLibrary.ensureUv2(wheel);
        whiteMarkGeoms.push(wheel);
      }
      const strip = new THREE.BoxGeometry(0.035, 0.07, 0.38);
      strip.translate(bladeX + 0.05, bladeY - 0.26, 0);
      MaterialLibrary.ensureUv2(strip);
      whiteMarkGeoms.push(strip);
    }
    const darkWinGeoms = [];
    for (const wz of [-0.14, 0.0, 0.14]) {
      const win = new THREE.BoxGeometry(0.03, 0.08, 0.07);
      win.translate(bladeX + 0.065, bladeY + 0.02, wz);
      MaterialLibrary.ensureUv2(win);
      darkWinGeoms.push(win);
    }

    const mergeKit = (geoms, name) => {
      const prepared = geoms.map((g) => (g.index ? g.toNonIndexed() : g.clone()));
      let vertCount = 0;
      for (const g of prepared) {
        if (!g.attributes.normal) g.computeVertexNormals();
        vertCount += g.attributes.position.count;
      }
      const pos = new Float32Array(vertCount * 3);
      const nrm = new Float32Array(vertCount * 3);
      const uv = new Float32Array(vertCount * 2);
      let o = 0;
      for (const g of prepared) {
        const c = g.attributes.position.count;
        pos.set(g.attributes.position.array, o * 3);
        nrm.set(g.attributes.normal.array, o * 3);
        if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
        o += c;
      }
      for (const g of geoms) g.dispose();
      for (const g of prepared) g.dispose();
      const out = this._own(new THREE.BufferGeometry());
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      out.name = name;
      MaterialLibrary.ensureUv2(out);
      return out;
    };
    const signWhiteGeom = mergeKit([...whiteRimGeoms, ...whiteMarkGeoms], 'tram-stop-white');
    const signDarkGeom = mergeKit(darkWinGeoms, 'tram-stop-windows');

    const bollardPlacements = [];
    const polePlacements = [];
    const flagPlacements = [];
    // F1 kit: flags face one convention (+z local away from the road, x along it), carry
    // their stop number. Local offsets put them beside the canopy while keeping the
    // original key coordinates and indices; pick proxies follow the visible flags.
    const stopKit = tramStopKitEnabled();
    const flagMeta = [];
    const stopKeys = new Set((this.city.transit ?? []).filter((s) => s.kind === 'stop')
      .map((s) => `${(+s.x).toFixed(2)}:${(+s.z).toFixed(2)}`));
    const pushFlag = (x, z, rot, kitRot, along) => {
      const atStop = stopKit && stopKeys.has(`${x.toFixed(2)}:${z.toFixed(2)}`);
      const r = stopKit ? kitRot : rot;
      polePlacements.push(placement(x, 0, z, r, 1));
      flagPlacements.push(placement(x, 0, z, r, 1));
      flagMeta.push({ atStop, number: stopNumberText(along) });
    };

    const { blocksX, blocksZ, corridors } = this.city;
    const tramCorridors = [
      ...(corridors?.vertical ?? []).filter((c) => c.tram).map((c) => ({ ...c, axis: 'v' })),
      ...(corridors?.horizontal ?? []).filter((c) => c.tram).map((c) => ({ ...c, axis: 'h' })),
    ];

    // Bollards ONLY at pavement / junction corners (no mid-block corridor rows).
    // Sit on the footpath pad outside the carriageway at each interior cross.
    const footpathInset = ROAD / 2 + 1.35;
    for (let i = 1; i < blocksX; i += 1) {
      for (let j = 1; j < blocksZ; j += 1) {
        const jx = i * PITCH + ROAD / 2;
        const jz = j * PITCH + ROAD / 2;
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const x = jx + sx * footpathInset;
            const z = jz + sz * footpathInset;
            bollardPlacements.push(placement(x, 0, z, 0, 1));
            this.bollardPlacements.push({ x, z, rotation: 0, model: 'cast-street-bollard' });
          }
        }
      }
    }

    // Melbourne tram-stop signs: one per block mid, single footpath side (not dual/random).
    // Avenue bins sit beside these signs only — one bin per block.
    for (const c of tramCorridors) {
      if (c.axis === 'v') {
        const corridorX = c.index * PITCH + ROAD / 2;
        // Alternate footpath side by corridor index so both sides of a dual-track
        // city still get stops without stamping every mid-block twice.
        const localX = (c.index % 2 === 0)
          ? CORRIDOR.footpathCentreLow
          : CORRIDOR.footpathCentreHigh;
        const x = corridorX - ROAD / 2 + localX;
        const rot = localX < ROAD / 2 ? 180 : 0;
        for (let bz = 0; bz < blocksZ; bz += 1) {
          const z = ROAD + bz * PITCH + BLOCK / 2;
          pushFlag(x, z, rot, localX < ROAD / 2 ? 270 : 90, bz);
        }
      } else {
        const corridorZ = c.index * PITCH + ROAD / 2;
        const localZ = (c.index % 2 === 0)
          ? CORRIDOR.footpathCentreLow
          : CORRIDOR.footpathCentreHigh;
        const z = corridorZ - ROAD / 2 + localZ;
        const rot = localZ < ROAD / 2 ? 270 : 90;
        for (let bx = 0; bx < blocksX; bx += 1) {
          const x = ROAD + bx * PITCH + BLOCK / 2;
          pushFlag(x, z, rot, localZ < ROAD / 2 ? 180 : 0, bx);
        }
      }
    }

    if (stopKit) {
      // The historical flags cover only one footpath per corridor. Append missing
      // shelter-side flags after all legacy indices; existing keys stay stable.
      const placed = new Set(polePlacements.map((p) => `${p.position.x.toFixed(2)}:${p.position.z.toFixed(2)}`));
      for (const stop of (this.city.transit ?? []).filter((t) => t.kind === 'stop')) {
        if (placed.has(`${stop.x.toFixed(2)}:${stop.z.toFixed(2)}`)) continue;
        const along = ((stop.rotation === 90 ? stop.z : stop.x) - ROAD - BLOCK / 2) / PITCH;
        pushFlag(stop.x, stop.z, stop.rotation, stop.rotation, along);
      }
    }

    if (bollardPlacements.length) {
      const { group, meshes } = buildInstanced(
        {
          parts: [
            { geometry: bollardPlinth, material: bollardMat },
            { geometry: bollardGeom, material: bollardMat },
            { geometry: bollardBandGeom, material: bollardBandMat },
            { geometry: bollardUpperBandGeom, material: bollardBandMat },
            { geometry: bollardCapGeom, material: bollardMat },
          ],
        },
        bollardPlacements,
        { castShadow: false, receiveShadow: true },
      );
      group.name = 'streetscape:bollards';
      this.root.add(group);
      // Mischief registration uses these meshes + bollardPlacements indices 1:1.
      this.bollardMeshes = meshes.slice();
    }
    if (polePlacements.length && stopKit) {
      this._buildKitTramFlags(polePlacements, flagMeta);
    } else if (polePlacements.length) {
      const poles = buildInstanced(
        {
          parts: [
            { geometry: poleGeom, material: poleMat },
            { geometry: poleCap, material: poleMat },
            { geometry: armGeom, material: poleMat },
          ],
        },
        polePlacements,
        { castShadow: false, receiveShadow: true },
      );
      poles.group.name = 'streetscape:tram-stop-poles';
      this.root.add(poles.group);
      const blades = buildInstanced(
        { parts: [{ geometry: signBlueGeom, material: signBlueMat }] },
        flagPlacements,
        { castShadow: false, receiveShadow: false },
      );
      blades.group.name = 'streetscape:tram-stop-blades';
      this.root.add(blades.group);
      const whites = buildInstanced(
        { parts: [{ geometry: signWhiteGeom, material: signWhiteMat }] },
        flagPlacements,
        { castShadow: false, receiveShadow: false },
      );
      whites.group.name = 'streetscape:tram-stop-marks';
      this.root.add(whites.group);
      const darks = buildInstanced(
        { parts: [{ geometry: signDarkGeom, material: signDarkMat }] },
        flagPlacements,
        { castShadow: false, receiveShadow: false },
      );
      darks.group.name = 'streetscape:tram-stop-windows';
      this.root.add(darks.group);
      // Pick/name uses pole placements 1:1 with sign instances.
      this.flagPlacements = polePlacements.slice();
      this.flagMeshes = [
        ...(poles.meshes ?? []),
        ...(blades.meshes ?? []),
        ...(whites.meshes ?? []),
        ...(darks.meshes ?? []),
      ];
    }
    this.stats.bollards = bollardPlacements.length + polePlacements.length;
  }

  /** Shared procedural flags; local offsets preserve every original mischief index. */
  _buildKitTramFlags(polePlacements, flagMeta) {
    const model = tramFlagModel(this.materials, { ensureUv2: (g) => MaterialLibrary.ensureUv2(g) });
    for (const part of model.parts) this._own(part.geometry);
    const { flagX, stopBaseWorld, apronTop, footpathTopWorld } = TRAM_STOP_DIMENSIONS;
    const offsets = flagMeta.map((m) => new THREE.Matrix4().makeTranslation(
      m.atStop ? flagX : 0, m.atStop ? stopBaseWorld + apronTop - footpathTopWorld : 0, 0));
    const matrices = polePlacements.map((p) => new THREE.Matrix4().compose(p.position, p.quaternion, p.scale));
    const drawn = polePlacements.map((p, i) => {
      const shifted = { position: p.position.clone(), quaternion: p.quaternion.clone(), scale: p.scale.clone() };
      matrices[i].clone().multiply(offsets[i]).decompose(shifted.position, shifted.quaternion, shifted.scale);
      return shifted;
    });
    const kit = buildInstanced(model, drawn, { castShadow: true, receiveShadow: true });
    kit.group.name = 'streetscape:tram-stop-flags';
    kit.group.userData.tramStopKit = true;
    this.root.add(kit.group);
    const meshes = kit.meshes.map((mesh) => {
      const router = new InstanceRouter(polePlacements.length);
      router.geometry = mesh.geometry;
      router.material = mesh.material;
      drawn.forEach((p, i) => router.route(i, mesh, i, new THREE.Matrix4().compose(p.position, p.quaternion, p.scale)));
      return router;
    });
    const router = new InstanceRouter(polePlacements.length);
    const byNumber = new Map();
    flagMeta.forEach((meta, index) => {
      if (!byNumber.has(meta.number)) byNumber.set(meta.number, []);
      byNumber.get(meta.number).push(index);
    });
    let numberMeshes = 0;
    for (const [number, indices] of byNumber) {
      const plate = tramFlagPlate(this.materials, number);
      if (!plate) break;
      this._own(plate.geometry);
      const { group, meshes: nm } = buildInstanced({ parts: [plate] }, indices.map((i) => drawn[i]),
        { castShadow: false, receiveShadow: true });
      group.name = `streetscape:tram-stop-flag-number-${number}`;
      this.root.add(group);
      numberMeshes += 1;
      indices.forEach((flagIndex, local) => {
        const p = drawn[flagIndex];
        router.route(flagIndex, nm[0], local, new THREE.Matrix4().compose(p.position, p.quaternion, p.scale));
      });
    }
    if (numberMeshes) meshes.push(router);
    this.flagPlacements = polePlacements.slice();
    this.flagDrawPlacements = drawn;
    this.flagMeshes = meshes;
    this.root.userData.tramStopKit = {
      flags: polePlacements.length,
      flagsAtStops: flagMeta.filter((m) => m.atStop).length,
      numbers: byNumber.size,
      numberMeshes,
    };
  }

  /**
   * Four traffic signals at every interior junction. Shared traffic phase drives
   * high-value red / amber / green emissive cups.
   */
  _buildTrafficSignals() {
    const { blocksX, blocksZ } = this.city;
    const poleMat = this.materials.get('painted_metal', {
      variant: 'signal-pole-r11-fat',
      color: '#111317',
      roughness: 0.46,
      metalness: 0.48,
    });
    const headMat = this.materials.get('painted_metal', {
      variant: 'signal-head-r11-three-cup-black',
      color: '#030405',
      roughness: 0.42,
      metalness: 0.28,
    });
    const headRimMat = this.materials.get('painted_metal', {
      variant: 'signal-head-r11-product-rim',
      color: '#33383d',
      roughness: 0.5,
      metalness: 0.54,
    });
    const signalBandMat = this.materials.get('painted_metal', {
      variant: 'signal-pole-band-r19j',
      color: '#4a4e54',
      roughness: 0.5,
      metalness: 0.35,
    });
    const lampMat = this.materials.get('painted_metal', {
      variant: 'signal-lamp-green-r19s',
      color: '#2a9a48',
      roughness: 0.5,
      metalness: 0.06,
    });
    // R19s: restrained green — no neon balloon bloom next to civic arrivals.
    if (lampMat.emissive) {
      lampMat.emissive.set('#1a6030');
      lampMat.emissiveIntensity = 0.55;
      lampMat.toneMapped = true;
    }

    // R19j: slim black signal — vertical post + rectangular head (not gold-collar chess piece).
    const S = 0.48;
    const poleH = 5.8 * S;
    const poleGeom = this._own(new THREE.CylinderGeometry(0.08, 0.1, poleH, 8, 1));
    poleGeom.translate(0, poleH * 0.5, 0);
    // Thin grey band only (no fat gold collar).
    const signalBandGeom = this._own(new THREE.CylinderGeometry(0.09, 0.095, 0.18, 8, 1));
    signalBandGeom.translate(0, 0.9 * S, 0);
    // Amber centre; red above / green below with a clear air gap between discs.
    const LAMP_R = 0.105;
    const LAMP_GAP = 0.05; // slight gap between red–amber and amber–green edges
    const lampPitch = 2 * LAMP_R + LAMP_GAP;
    const amberY = 4.6 * S;
    const redY = amberY + lampPitch;
    const greenY = amberY - lampPitch;
    // Slightly taller head so the spread lenses still sit inside the housing.
    const headH = 1.42;
    const headRimGeom = this._own(new THREE.BoxGeometry(0.55, headH + 0.12, 0.38));
    headRimGeom.translate(0.22, amberY, 0);
    const headGeom = this._own(new THREE.BoxGeometry(0.48, headH, 0.42));
    headGeom.translate(0.28, amberY, 0);
    // Round bezel rings + round lenses (axis along +X, facing the approach).
    const makeLampBezel = (y) => {
      const geom = this._own(new THREE.TorusGeometry(LAMP_R + 0.018, 0.022, 8, 20));
      geom.rotateY(Math.PI / 2);
      geom.translate(0.48, y, 0);
      return geom;
    };
    const redBezelGeom = makeLampBezel(redY);
    const amberBezelGeom = makeLampBezel(amberY);
    const greenBezelGeom = makeLampBezel(greenY);
    // Round green lens (cylinder disc facing traffic).
    const lampGeom = this._own(new THREE.CylinderGeometry(LAMP_R, LAMP_R, 0.07, 32, 1));
    lampGeom.rotateZ(Math.PI / 2);
    lampGeom.translate(0.52, greenY, 0.0);

    const poles = [];
    const heads = [];
    const lamps = [];
    // Interior junctions only — never mid-block footpath. R19g thins to every other
    // junction so signals don't dominate civic arrival cones.
    const candidates = [];
    for (let i = 1; i < blocksX; i += 1) {
      for (let j = 1; j < blocksZ; j += 1) {
        if ((i + j) % 2 === 0) continue;
        candidates.push({ i, j });
      }
    }
    // Footpath corner of the ROAD×ROAD junction square — never over parcel land.
    // Carriageway kerb is ~5 m from centre; outer road edge is ROAD/2 = 8 m.
    // Mid-footpath is CORRIDOR.footpathCentreHigh − ROAD/2 = 6.5 m from centre.
    // Stay inside that band so poles sit on public footpath at the junction only.
    const cornerK = CORRIDOR.footpathCentreHigh - ROAD / 2; // 6.5 m
    for (const { i, j } of candidates) {
      // One pole per cardinal approach at the four junction footpath corners.
      // Lamp faces local +X; Y-rot aims each head at its inbound traffic.
      const cx = i * PITCH + ROAD / 2;
      const cz = j * PITCH + ROAD / 2;
      const corners = [
        // SE corner — serves south approach (faces south / −Z).
        { x: cx + cornerK, z: cz - cornerK, rot: 90 },
        // NW corner — serves north approach (faces north / +Z).
        { x: cx - cornerK, z: cz + cornerK, rot: 270 },
        // SW corner — serves west approach (faces west / −X).
        { x: cx - cornerK, z: cz - cornerK, rot: 180 },
        // NE corner — serves east approach (faces east / +X).
        { x: cx + cornerK, z: cz + cornerK, rot: 0 },
      ];
      for (const c of corners) {
        poles.push(placement(c.x, 0, c.z, c.rot, 1));
        heads.push(placement(c.x, 0, c.z, c.rot, 1));
        lamps.push(placement(c.x, 0, c.z, c.rot, 1));
        this.signalPlacements.push({ x: c.x, z: c.z, rotation: c.rot });
        // The axis this head governs, derived from where it points rather than declared
        // a second time. A Y-rotation of `rot` sends the head's local +X — the face the
        // lenses look out of — to (cos rot, −sin rot) in (x, z); read through the cars'
        // own `atan2(dx, dz)` convention that is exactly the axis its stop line carries.
        // SE/NW come out 'ns', SW/NE 'ew', which is the four cardinal approaches.
        const facing = (c.rot * Math.PI) / 180;
        this._signalAxes.push(
          travelAxisFromYaw(Math.atan2(Math.cos(facing), -Math.sin(facing))),
        );
      }
    }
    if (!poles.length) return;
    const poleBatch = buildInstanced(
      { parts: [{ geometry: poleGeom, material: poleMat }] },
      poles,
      { castShadow: false, receiveShadow: true },
    );
    poleBatch.group.name = 'streetscape:signal-poles';
    this.root.add(poleBatch.group);
    const signalBandBatch = buildInstanced(
      { parts: [{ geometry: signalBandGeom, material: signalBandMat }] },
      poles,
      { castShadow: false, receiveShadow: false },
    );
    signalBandBatch.group.name = 'streetscape:signal-pole-safety-bands';
    this.root.add(signalBandBatch.group);
    const headRimBatch = buildInstanced(
      { parts: [
        { geometry: headRimGeom, material: headRimMat },
        { geometry: redBezelGeom, material: headMat },
        { geometry: amberBezelGeom, material: headMat },
        { geometry: greenBezelGeom, material: headMat },
      ] },
      heads,
      { castShadow: false, receiveShadow: false },
    );
    headRimBatch.group.name = 'streetscape:signal-head-rims';
    this.root.add(headRimBatch.group);
    const headBatch = buildInstanced(
      { parts: [{ geometry: headGeom, material: headMat }] },
      heads,
      { castShadow: false, receiveShadow: false },
    );
    headBatch.group.name = 'streetscape:signal-heads';
    this.root.add(headBatch.group);
    // Three lamp cups (red top / amber mid / green bottom) — clearly spaced.
    // Matte disc lenses; the same geometry stays visible through every phase.
    const redMat = this.materials.get('painted_metal', {
      variant: 'signal-lamp-red-r19s',
      color: '#c02830',
      roughness: 0.55,
      metalness: 0.05,
    });
    if (redMat.emissive) {
      redMat.emissive.set('#501010');
      redMat.emissiveIntensity = 0.35;
      redMat.toneMapped = true;
    }
    const amberMat = this.materials.get('painted_metal', {
      variant: 'signal-lamp-amber-r19s',
      color: '#c88820',
      roughness: 0.55,
      metalness: 0.05,
    });
    if (amberMat.emissive) {
      amberMat.emissive.set('#503010');
      amberMat.emissiveIntensity = 0.3;
      amberMat.toneMapped = true;
    }
    // Round red / amber lenses — same disc construction as green (shared LAMP_R / pitch).
    const redGeom = this._own(new THREE.CylinderGeometry(LAMP_R, LAMP_R, 0.07, 32, 1));
    redGeom.rotateZ(Math.PI / 2);
    redGeom.translate(0.52, redY, 0);
    const amberGeom = this._own(new THREE.CylinderGeometry(LAMP_R, LAMP_R, 0.07, 32, 1));
    amberGeom.rotateZ(Math.PI / 2);
    amberGeom.translate(0.52, amberY, 0);
    const redBatch = buildInstanced(
      { parts: [{ geometry: redGeom, material: redMat }] },
      lamps,
      { castShadow: false, receiveShadow: false },
    );
    redBatch.group.name = 'streetscape:signal-lamps-red';
    this.root.add(redBatch.group);
    const amberBatch = buildInstanced(
      { parts: [{ geometry: amberGeom, material: amberMat }] },
      lamps,
      { castShadow: false, receiveShadow: false },
    );
    amberBatch.group.name = 'streetscape:signal-lamps-amber';
    this.root.add(amberBatch.group);
    const lampBatch = buildInstanced(
      { parts: [{ geometry: lampGeom, material: lampMat }] },
      lamps,
      { castShadow: false, receiveShadow: false },
    );
    lampBatch.group.name = 'streetscape:signal-lamps';
    this.root.add(lampBatch.group);
    // All signal parts share instance indices with signalPlacements for mischief hide/tint.
    this.signalMeshes = [
      poleBatch.meshes[0],
      signalBandBatch.meshes[0],
      ...headRimBatch.meshes,
      headBatch.meshes[0],
      lampBatch.meshes[0],
      redBatch.meshes[0],
      amberBatch.meshes[0],
    ].filter(Boolean);
    // Junction positions for traffic layer stop logic (shared light cycle).
    this.signalJunctions = candidates.map(({ i, j }) => ({
      x: i * PITCH + ROAD / 2,
      z: j * PITCH + ROAD / 2,
    }));
    this.stats.signals = poles.length;

    // --- per-head phase (R41) ---------------------------------------------------------
    //
    // Every head in the city used to display `sharedSignalPhase(elapsed)` with no axis
    // argument — the north-south phase — so half of them contradicted the traffic in front
    // of them: an east-west car pulling up correctly on its own red while every lamp in the
    // shot showed green. The axis was never missing information, only unused; each pole
    // serves one approach and the corner it stands on already fixes which carriageway that
    // is (see `_signalAxes` above).
    //
    // The only part that needs machinery is per-instance emissive, because one material is
    // shared by every lens of a colour. Each lamp material therefore keeps its LIT emissive
    // permanently and one patched line multiplies `totalEmissiveRadiance` by a per-instance
    // `signalLamp` attribute, which turns that attribute into a lamp switch. Batching,
    // instance ordering and the mischief index mapping above are all untouched, which is
    // what lets the lamps stay in `signalMeshes` and be hidden with the pole rather than
    // left floating over a tipped signal.
    //
    // The switch is a private attribute rather than `instanceColor` on purpose, and this was
    // measured rather than assumed: driven through `instanceColor`, every head read LIT.
    // `scene.js:586` updates the board and `:596` the mischief layer, and `mischief.js:863`
    // calls `setOriginal` on every registered target every frame, whose `write()`
    // (`board.js:5302`) stamps `state.tint` — white — into `instanceColor` at that index on
    // every mesh in `signalMeshes`. Anything this layer writes there is overwritten later in
    // the same frame. A dedicated attribute is outside that path entirely.
    const asSwitchedLamp = (material, on, off) => {
      const lit = new THREE.Color(on.color).multiplyScalar(on.intensity);
      const unlit = new THREE.Color(off.color).multiplyScalar(off.intensity);
      material.emissive.set(on.color);
      material.emissiveIntensity = on.intensity;
      material.toneMapped = true;
      material.userData.signalLampSwitch = true;
      const previousCompile = material.onBeforeCompile;
      const previousKey = material.customProgramCacheKey;
      material.onBeforeCompile = (shader, renderer) => {
        if (previousCompile) previousCompile.call(material, shader, renderer);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>',
            '#include <common>\nattribute vec3 signalLamp;\nvarying vec3 vLampSwitch;')
          .replace('#include <begin_vertex>',
            '#include <begin_vertex>\nvLampSwitch = signalLamp;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>',
            '#include <common>\nvarying vec3 vLampSwitch;')
          .replace('vec3 totalEmissiveRadiance = emissive;',
            'vec3 totalEmissiveRadiance = emissive * vLampSwitch;')
          .replace('#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vLampSwitch;');
      };
      material.customProgramCacheKey = () => {
        const base = typeof previousKey === 'function' ? previousKey.call(material) : '';
        return `${base}|dd-signal-lamp-switch-x2`;
      };
      material.needsUpdate = true;
      // The unlit switch value reproduces exactly what this lens used to show when the phase
      // was not its own, so nothing about the dark state changes — it is the same emissive
      // product, reached by a multiply instead of by rewriting the material.
      return new THREE.Color(
        lit.r > 1e-6 ? unlit.r / lit.r : 0,
        lit.g > 1e-6 ? unlit.g / lit.g : 0,
        lit.b > 1e-6 ? unlit.b / lit.b : 0,
      );
    };
    const switchedLamp = (batch, phase, material, on, off) => {
      const mesh = batch.meshes[0];
      if (!mesh) return null;
      const attribute = new THREE.InstancedBufferAttribute(
        new Float32Array(lamps.length * 3), 3,
      );
      attribute.setUsage(THREE.DynamicDrawUsage);
      mesh.geometry.setAttribute('signalLamp', attribute);
      return { phase, attribute, off: asSwitchedLamp(material, on, off) };
    };
    // P22 T1: overdriving these small discs at 8× fed the post chain's square
    // eight-tap bloom footprint. Keep the light on the lens, inside its bezel;
    // no halo geometry or phase-dependent silhouette is needed.
    this._signalLamps = [
      switchedLamp(redBatch, 'red', redMat,
        { color: '#ff2028', intensity: 0.9 }, { color: '#6b1218', intensity: 0.72 }),
      switchedLamp(amberBatch, 'amber', amberMat,
        { color: '#ffc020', intensity: 0.9 }, { color: '#765210', intensity: 0.68 }),
      switchedLamp(lampBatch, 'green', lampMat,
        { color: '#48ff68', intensity: 0.9 }, { color: '#12652a', intensity: 0.72 }),
    ].filter(Boolean);
    // Write once here so a frame rendered before the first `update()` is already correct.
    this._writeSignalLamps(0);
  }

  /**
   * Light each head for the phase on the axis it governs.
   * @param {number} elapsed
   */
  _writeSignalLamps(elapsed) {
    if (!this._signalLamps?.length) return;
    const ns = sharedSignalPhase(elapsed, 'ns');
    const ew = sharedSignalPhase(elapsed, 'ew');
    // Only four phase pairs exist in a cycle, so the buffers move on a phase edge and not
    // once a frame.
    const key = `${ns}|${ew}`;
    if (key === this._signalPhaseKey) return;
    this._signalPhaseKey = key;
    const phases = { ns, ew };
    const axes = this._signalAxes;
    for (const lamp of this._signalLamps) {
      const array = lamp.attribute.array;
      const count = Math.min(axes.length, array.length / 3);
      for (let i = 0; i < count; i += 1) {
        const on = phases[axes[i]] === lamp.phase;
        array[i * 3] = on ? 1 : lamp.off.r;
        array[i * 3 + 1] = on ? 1 : lamp.off.g;
        array[i * 3 + 2] = on ? 1 : lamp.off.b;
      }
      lamp.attribute.needsUpdate = true;
    }
  }

  /**
   * Per-head lit colours at `elapsed`. A head is one-hot when exactly one of
   * red/amber/green has switch value 1.
   */
  sampleSignalLamps(elapsed = 0) {
    this._writeSignalLamps(elapsed);
    const ns = sharedSignalPhase(elapsed, 'ns');
    const ew = sharedSignalPhase(elapsed, 'ew');
    const heads = [];
    const lamps = this._signalLamps ?? [];
    const axes = this._signalAxes ?? [];
    for (let i = 0; i < axes.length; i += 1) {
      const lit = [];
      for (const lamp of lamps) {
        const on = (lamp.attribute.array[i * 3] ?? 0) > 0.85;
        if (on) lit.push(lamp.phase);
      }
      heads.push({
        index: i,
        axis: axes[i],
        lit,
        expected: axes[i] === 'ns' ? ns : ew,
      });
    }
    return { ns, ew, heads };
  }

  /**
   * Junction civil kit: manhole covers, gully drains, tactile pads and corner
   * radius fillets so crossroads read as finished civil engineering, not raw kerbs.
   */
  _buildJunctionCivil() {
    const { blocksX, blocksZ } = this.city;
    const iron = this.materials.get('painted_metal', {
      variant: 'junction-iron-r10-cover',
      color: '#777067',
      roughness: 0.58,
      metalness: 0.48,
    });
    // Mid-grey only — pure charcoal discs read as ink blots at mid-zoom.
    const ironDark = this.materials.get('painted_metal', {
      variant: 'junction-iron-r10-recess',
      color: '#17191c',
      roughness: 0.72,
      metalness: 0.28,
    });
    // Cover-only finishes: gullies retain the original shared iron materials.
    // The family factory clamps painted-metal roughness and adds clearcoat; these
    // two unique variants intentionally override that glossy architectural finish.
    const coverFrame = this.materials.get('painted_metal', {
      variant: 'm15-utility-cover-frame', color: '#51534d',
      roughness: 0.90, metalness: 0.08, envBase: 0.30,
    });
    const coverFace = this.materials.get('painted_metal', {
      variant: 'm15-utility-cover-face', color: '#373b38',
      roughness: 0.92, metalness: 0.06, envBase: 0.30,
    });
    for (const [material, roughness] of [[coverFrame, 0.90], [coverFace, 0.92]]) {
      material.roughness = roughness;
      material.clearcoat = 0;
      material.clearcoatRoughness = 1;
      material.specularIntensity = 0.12;
      // The shared pack is cream paint with a smooth roughness range. Reinterpret
      // its existing grain only for these two cover variants; never mutate maps.
      if (!material.userData.m15CastIronResponse) {
        const previous = material.onBeforeCompile;
        const previousKey = material.customProgramCacheKey;
        material.onBeforeCompile = function (shader, renderer) {
          previous.call(this, shader, renderer);
          const colorPoint = '#include <map_fragment>';
          const roughPoint = '#include <roughnessmap_fragment>';
          const normalPoint = '#include <normal_fragment_maps>';
          const worldPoint = '#include <worldpos_vertex>';
          const commonPoint = '#include <common>';
          if (shader.fragmentShader.split(colorPoint).length !== 2
              || shader.fragmentShader.split(roughPoint).length !== 2
              || shader.fragmentShader.split(normalPoint).length !== 2
              || shader.vertexShader.split(worldPoint).length !== 2
              || shader.vertexShader.split(commonPoint).length !== 2
              || shader.fragmentShader.split(commonPoint).length !== 2) {
            throw new Error('Utility cover material composition changed');
          }
          shader.fragmentShader = shader.fragmentShader.replace(colorPoint,
            `${colorPoint}
// Cover-only neutral grain; vertex/instance colors still apply afterwards.
float m15IronTone = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
diffuseColor.rgb = vec3(m15IronTone);`);
          shader.fragmentShader = shader.fragmentShader.replace(roughPoint,
            `${roughPoint}
// Interpret painted-map grain as rough oxidised metal, before GGX setup.
roughnessFactor = 0.86 + 0.10 * clamp(roughnessFactor, 0.0, 1.0);`);
          shader.vertexShader = shader.vertexShader.replace(commonPoint,
            `${commonPoint}
varying vec3 vM15IronWorld;`);
          shader.fragmentShader = shader.fragmentShader.replace(commonPoint,
            `${commonPoint}
varying vec3 vM15IronWorld;`);
          shader.vertexShader = shader.vertexShader.replace(worldPoint,
            `${worldPoint}
vec4 m15IronPosition = vec4(transformed, 1.0);
#ifdef USE_BATCHING
m15IronPosition = batchingMatrix * m15IronPosition;
#endif
#ifdef USE_INSTANCING
m15IronPosition = instanceMatrix * m15IronPosition;
#endif
vM15IronWorld = (modelMatrix * m15IronPosition).xyz;`);
          shader.fragmentShader = shader.fragmentShader.replace(normalPoint,
            `${normalPoint}
// Small casting pits in world metres, not a stretched cylinder/torus UV texture.
vec2 m15CastQ = vM15IronWorld.xz / 0.055;
vec2 m15CastCell = floor(m15CastQ);
vec2 m15CastSeed = fract(sin(vec2(dot(m15CastCell, vec2(127.1,311.7)),
  dot(m15CastCell,vec2(269.5,183.3)))) * 43758.5453);
vec2 m15CastCentre = vec2(0.35) + 0.30 * m15CastSeed;
// Uneven casting depressions, not a regularly punched dimple grid. The
// ellipse remains inside each jittered cell, so value/slope vanish at seams.
vec2 m15CastShape = mix(vec2(0.82,1.16),vec2(1.16,0.82),m15CastSeed.y);
float m15CastPit = (1.0 - smoothstep(0.06,0.18+0.08*m15CastSeed.y,
  length((fract(m15CastQ)-m15CastCentre)*m15CastShape)))
  * step(0.40,m15CastSeed.x);
float m15CastFootprint = max(length(dFdx(m15CastQ)),length(dFdy(m15CastQ)));
float m15CastFilter = 1.0-smoothstep(0.18,0.36,m15CastFootprint);
vec3 m15CastWorldNormal = inverseTransformDirection(nonPerturbedNormal,viewMatrix);
float m15CastTop = smoothstep(0.65,0.95,m15CastWorldNormal.y);
float m15CastCoverage = m15CastPit*m15CastFilter*m15CastTop;
// Shading relief only: no vertex movement, contact or shadow displacement.
float m15CastHeight = -(0.00065+0.00035*m15CastSeed.y)*m15CastPit;
vec3 m15CastDx = dFdx(-vViewPosition),m15CastDy = dFdy(-vViewPosition);
vec3 m15CastR1 = cross(m15CastDy,normal),m15CastR2 = cross(normal,m15CastDx);
float m15CastDet = dot(m15CastDx,m15CastR1);
vec3 m15CastGradient = sign(m15CastDet)*(dFdx(m15CastHeight)*m15CastR1+dFdy(m15CastHeight)*m15CastR2);
if(abs(m15CastDet)>0.0000000001){
  normal = normalize(abs(m15CastDet)*normal-m15CastGradient*(m15CastFilter*m15CastTop));
}
diffuseColor.rgb *= 1.0-0.22*m15CastCoverage;
roughnessFactor = min(0.96,roughnessFactor+0.012*m15CastCoverage);`);

        };
        material.customProgramCacheKey = function () {
          return `${previousKey.call(this)}|m15-cover-cast-iron-r5`;
        };
        material.userData.m15CastIronResponse = true;
        material.needsUpdate = true;
      }
    }
    // Existing GLB reservation top is .052; the authored zebra paint top is .072.
    // This is a seated overlay, not a road cutout. Native contact/occlusion still
    // needs matched capture verification; no road or crossing geometry is changed.
    const centreSeatY = 0.052;
    const approachSeatY = 0.072;
    // Approach lids cross gaps in the paint. Their solid body extends down to
    // the continuous reservation, while the top clears the highest paint film.
    const approachBaseY = centreSeatY - 0.002;
    const approachTopY = approachSeatY + 0.006;
    const ringFlattenY = 0.075;
    const concrete = this.materials.get('concrete', {
      variant: 'junction-tactile-r26',
      color: '#e0b83f',
      roughness: 0.88,
    });
    const tactileStud = this.materials.get('concrete', {
      variant: 'junction-tactile-stud-r26',
      color: '#f2cf55',
      roughness: 0.82,
    });
    const radiusConcrete = this.materials.get('concrete', {
      variant: 'junction-radius-r26',
      color: '#cbc4b8',
      roughness: 0.9,
    });
    const rampConcrete = this.materials.get('concrete', {
      variant: 'p17-crossing-kerb-ramp',
      color: '#aaa59a',
      roughness: 0.94,
      metalness: 0.01,
    });

    const manholes = [];
    const manholeRings = [];
    const manholeInsets = [];
    const manholeBars = [];
    const approachManholes = [];
    const approachManholeRings = [];
    const approachManholeBars = [];
    const gullies = [];
    const gullySlots = [];
    const tactiles = [];
    const tactileStuds = [];
    const radiusArcs = [];
    const crossingRamps = [];
    const crossingRampDepth = 0.92;

    const pushTactile = (cx, cz, axis) => {
      const alongX = axis === 'x';
      tactiles.push(placement(cx, 0.05, cz, 0, {
        x: alongX ? 1.8 : 0.95,
        y: 0.06,
        z: alongX ? 0.95 : 1.8,
      }));
      for (const u of [-0.48, 0, 0.48]) {
        for (const v of [-0.32, 0, 0.32]) {
          tactileStuds.push(placement(
            cx + (alongX ? u : v),
            0.105,
            cz + (alongX ? v : u),
            0,
            { x: 0.11, y: 0.055, z: 0.11 },
          ));
        }
      }
    };

    for (let i = 0; i <= blocksX; i += 1) {
      for (let j = 0; j <= blocksZ; j += 1) {
        // Skip outer fringe corners (less visible / half-off board).
        if (i === 0 || j === 0 || i === blocksX || j === blocksZ) continue;
        const jx = i * PITCH + ROAD / 2;
        const jz = j * PITCH + ROAD / 2;
        // A shallow frame surrounds the solid inset face; the old torus keeps
        // its XZ silhouette but its tube is compressed into low rim relief.
        const mx = jx;
        const mz = jz;
        manholes.push(placement(mx, centreSeatY + 0.002, mz, 0, { x: 1.58, y: 0.008, z: 1.58 }));
        manholeRings.push(placement(mx, centreSeatY + 0.006, mz, 0, { x: 1, y: ringFlattenY, z: 1 }));
        manholeInsets.push(placement(mx, centreSeatY + 0.005, mz, 0, { x: 1.08, y: 0.004, z: 1.08 }));
        manholeBars.push(placement(mx, centreSeatY + 0.008, mz, 0, { x: 1.04, y: 0.002, z: 0.11 }));
        manholeBars.push(placement(mx, centreSeatY + 0.008, mz, 0, { x: 0.11, y: 0.002, z: 1.04 }));

        // A smaller service plate sits just behind each of the two authored zebra
        // approaches (south and west). These carry the civil read into the crossing
        // plate without moving or enlarging the held centre-junction cover.
        const approachOffset = ROAD / 2 + 2.25;
        for (const [ax, az] of [
          [jx, jz - approachOffset],
          [jx - approachOffset, jz],
        ]) {
          approachManholes.push(placement(ax, (approachBaseY + approachTopY) / 2, az, 0, { x: 1.2, y: approachTopY - approachBaseY, z: 1.2 }));
          approachManholeRings.push(placement(ax, approachSeatY + 0.006, az, 0, { x: 0.78, y: ringFlattenY, z: 0.78 }));
          approachManholeBars.push(placement(ax, approachSeatY + 0.007, az, 0, { x: 0.78, y: 0.002, z: 0.1 }));
        }

        // Four kerb-aligned gully grates: paired at the two authored zebra approaches,
        // where drainage hardware reads alongside the white bars rather than as
        // ambiguous dots at the junction corners.
        for (const [dx, dz, rot] of [
          [-ROAD / 2 + 2.75, -ROAD / 2 - 0.38, 0],
          [ROAD / 2 - 2.75, -ROAD / 2 - 0.38, 0],
          [-ROAD / 2 - 0.38, -ROAD / 2 + 2.75, 90],
          [-ROAD / 2 - 0.38, ROAD / 2 - 2.75, 90],
        ]) {
          const gx = jx + dx;
          const gz = jz + dz;
          gullies.push(placement(gx, 0.035, gz, rot, { x: 1.52, y: 0.065, z: 0.68 }));
          for (const slot of [-0.48, -0.24, 0, 0.24, 0.48]) {
            const a = rot * Math.PI / 180;
            gullySlots.push(placement(
              gx + Math.cos(a) * slot,
              0.073,
              gz - Math.sin(a) * slot,
              rot,
              { x: 0.12, y: 0.026, z: 0.5 },
            ));
          }
        }

        // Four complete kerb-ramp approaches align with the two authored zebra packs (south
        // and west of the conflict box). Each wedge rises from road level toward its footpath;
        // the stud field sits immediately behind it on the same crossing axis.
        const walkWidth = 7 * 0.5 + 6 * 0.38;
        const zebraCentreOffset = ROAD / 2 + 0.4 + walkWidth * 0.5;
        const kerbHalfSpan = (CORRIDOR.kerbHigh - CORRIDOR.kerbLow) * 0.5;
        const crossingRampOffset = kerbHalfSpan + crossingRampDepth * 0.5;
        const tactileOffset = kerbHalfSpan + crossingRampDepth + 0.48;
        crossingRamps.push(
          placement(jx - crossingRampOffset, 0.02, jz - zebraCentreOffset, -90, {
            x: walkWidth, y: 1, z: crossingRampDepth,
          }),
          placement(jx + crossingRampOffset, 0.02, jz - zebraCentreOffset, 90, {
            x: walkWidth, y: 1, z: crossingRampDepth,
          }),
          placement(jx - zebraCentreOffset, 0.02, jz - crossingRampOffset, 180, {
            x: walkWidth, y: 1, z: crossingRampDepth,
          }),
          placement(jx - zebraCentreOffset, 0.02, jz + crossingRampOffset, 0, {
            x: walkWidth, y: 1, z: crossingRampDepth,
          }),
        );
        pushTactile(jx - tactileOffset, jz - zebraCentreOffset, 'z');
        pushTactile(jx + tactileOffset, jz - zebraCentreOffset, 'z');
        pushTactile(jx - zebraCentreOffset, jz - tactileOffset, 'x');
        pushTactile(jx - zebraCentreOffset, jz + tactileOffset, 'x');

        // Quarter-annulus kerb radii replace the former full asphalt discs.
        const r = 1.9;
        for (const [sx, sz, rot] of [[1, 1, 0], [-1, 1, -90], [-1, -1, 180], [1, -1, 90]]) {
          radiusArcs.push(placement(
            jx + sx * (ROAD / 2 - r),
            0.115,
            jz + sz * (ROAD / 2 - r),
            rot,
            { x: r, y: r, z: r },
          ));
        }
      }
    }

    const unitGeom = this._own(new THREE.BoxGeometry(1, 1, 1));
    const discGeom = this._own(new THREE.CylinderGeometry(0.5, 0.5, 1, 12));
    const manholeRingGeom = this._own(new THREE.TorusGeometry(0.69, 0.08, 6, 20));
    manholeRingGeom.rotateX(Math.PI / 2);
    const studGeom = this._own(new THREE.CylinderGeometry(0.5, 0.5, 1, 8));
    const radiusGeom = this._own(new THREE.RingGeometry(0.82, 1, 12, 1, 0, Math.PI / 2));
    radiusGeom.rotateX(Math.PI / 2);
    const crossingRampGeom = this._own(new THREE.BoxGeometry(1, 1, 1));
    const rampPositions = crossingRampGeom.attributes.position;
    for (let index = 0; index < rampPositions.count; index += 1) {
      const z = rampPositions.getZ(index);
      rampPositions.setY(index, rampPositions.getY(index) > 0
        ? 0.03 + (z + 0.5) * 0.15
        : 0);
    }
    rampPositions.needsUpdate = true;
    crossingRampGeom.computeVertexNormals();
    crossingRampGeom.computeBoundingBox();
    crossingRampGeom.name = 'p17-crossing-kerb-ramp-wedge';
    MaterialLibrary.ensureUv2(crossingRampGeom);
    const add = (items, material, name, geom = unitGeom) => {
      if (!items.length) return;
      const { group } = buildInstanced(
        { parts: [{ geometry: geom, material }] },
        items,
        { castShadow: false, receiveShadow: true },
      );
      group.name = name;
      this.root.add(group);
    };
    add(manholes, coverFrame, 'streetscape:manholes', discGeom);
    add(manholeRings, coverFrame, 'streetscape:manhole-rings', manholeRingGeom);
    add(manholeInsets, coverFace, 'streetscape:manhole-insets', discGeom);
    add(manholeBars, coverFrame, 'streetscape:manhole-bars');
    add(approachManholes, coverFace, 'streetscape:zebra-approach-manholes', discGeom);
    add(approachManholeRings, coverFrame, 'streetscape:zebra-approach-manhole-rings', manholeRingGeom);
    add(approachManholeBars, coverFrame, 'streetscape:zebra-approach-manhole-bars');
    add(gullies, iron, 'streetscape:gullies');
    add(gullySlots, ironDark, 'streetscape:gully-slots');
    add(tactiles, concrete, 'streetscape:tactile-pads');
    add(tactileStuds, tactileStud, 'streetscape:tactile-studs', studGeom);
    add(radiusArcs, radiusConcrete, 'streetscape:kerb-radii', radiusGeom);
    add(crossingRamps, rampConcrete, 'street:p17:crossing-kerb-ramps', crossingRampGeom);
    this.stats.junctionCivil = manholes.length + manholeRings.length + manholeInsets.length + manholeBars.length
      + approachManholes.length + approachManholeRings.length + approachManholeBars.length
      + gullies.length + gullySlots.length + tactiles.length + tactileStuds.length
      + radiusArcs.length + crossingRamps.length;
    this.stats.crossingRamps = crossingRamps.length;
  }

  /**
   * Drive signal lamp emissives from the same shared phase as TrafficLayer, per head and
   * per axis. Red holds stop cars; green is free-flow; amber brief transition.
   */
  update(elapsed = 0) {
    if (this._disposed) return;
    this._writeSignalLamps(elapsed);
  }

  dispose() {
    if (this._disposed) return;
    for (const g of this._ownedGeometry) {
      if (!g || g.userData?.streetscapeDisposed) continue;
      g.userData.streetscapeDisposed = true;
      g.dispose();
    }
    this._ownedGeometry.length = 0;
    this._signalLamps = null;
    this._signalPhaseKey = null;
    this.root.clear();
    this._disposed = true;
  }
}
