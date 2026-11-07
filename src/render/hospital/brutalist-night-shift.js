// District Deck — Hospital B / Brutalist Night Shift.
// Frontage is +Z. All coordinates are deterministic and remain inside one 1×2 civic site.

import * as THREE from 'three';
import { MaterialLibrary } from '../materials.js';

const PREFIX = 'hospital-b-';

function finish(geometry, name) {
  geometry.name = `${PREFIX}${name}`;
  MaterialLibrary.ensureUv2(geometry);
  return geometry;
}

/** Bevelled/chamfered mass. `y` is the base datum. */
function box(w, h, d, x, y, z, name, { yaw = 0, pitch = 0, roll = 0, edge = 0.055 } = {}) {
  // Fine rails, road paint and louvres do not need a closed cuboid. A two-sided four-triangle
  // plate keeps them visible from every review station at one third of the triangle cost.
  // Elements at or below 120 mm project as a single face at the locked game camera. Keeping
  // them as two-sided authored plates preserves their silhouette and face colour while avoiding
  // eight invisible edge/back-wall triangles per rail, mullion, road mark and room fixture.
  if (Math.min(w, h, d) <= 0.12) {
    const thinAxis = w <= h && w <= d ? 'x' : h <= d ? 'y' : 'z';
    const planeW = thinAxis === 'x' ? d : w;
    const planeH = thinAxis === 'y' ? d : h;
    const positions = new Float32Array([
      -planeW / 2, -planeH / 2, 0, planeW / 2, -planeH / 2, 0,
      planeW / 2, planeH / 2, 0, -planeW / 2, planeH / 2, 0,
      -planeW / 2, -planeH / 2, 0, planeW / 2, -planeH / 2, 0,
      planeW / 2, planeH / 2, 0, -planeW / 2, planeH / 2, 0,
    ]);
    const normals = new Float32Array([
      0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
      0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    ]);
    const uv = new Float32Array([
      0, 0, 1, 0, 1, 1, 0, 1,
      0, 0, 1, 0, 1, 1, 0, 1,
    ]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
    if (thinAxis === 'x') geometry.rotateY(Math.PI / 2);
    else if (thinAxis === 'y') geometry.rotateX(-Math.PI / 2);
    if (pitch) geometry.rotateX(pitch);
    if (roll) geometry.rotateZ(roll);
    if (yaw) geometry.rotateY(yaw);
    geometry.translate(x, y + h / 2, z);
    return finish(geometry, name);
  }
  // Only silhouette-defining masses carry a chamfer. Layered heads, piers and canopy fascias
  // already create edge depth, so bevel tessellation there is redundant at board scale.
  if (edge < 0.12) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    if (pitch) geometry.rotateX(pitch);
    if (roll) geometry.rotateZ(roll);
    if (yaw) geometry.rotateY(yaw);
    geometry.translate(x, y + h / 2, z);
    return finish(geometry, name);
  }
  const e = Math.max(0.008, Math.min(edge, w * 0.12, h * 0.12, d * 0.12));
  const c = Math.max(e * 1.2, Math.min(w, h) * 0.035);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + c, -h / 2);
  shape.lineTo(w / 2 - c, -h / 2);
  shape.lineTo(w / 2, -h / 2 + c);
  shape.lineTo(w / 2, h / 2 - c);
  shape.lineTo(w / 2 - c, h / 2);
  shape.lineTo(-w / 2 + c, h / 2);
  shape.lineTo(-w / 2, h / 2 - c);
  shape.lineTo(-w / 2, -h / 2 + c);
  shape.closePath();
  const depth = Math.max(0.01, d - e * 2);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: e,
    bevelThickness: e,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  if (pitch) geometry.rotateX(pitch);
  if (roll) geometry.rotateZ(roll);
  if (yaw) geometry.rotateY(yaw);
  geometry.translate(x, y + h / 2, z);
  return finish(geometry, name);
}

/** Two-faced authored polygon for localized water/dirt stories; never random speckle. */
function patch(points, x, y, z, name, normalZ = 1) {
  const contour = points.map(([px, py]) => new THREE.Vector2(px, py));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const positions = [];
  const normals = [];
  const uv = [];
  const minX = Math.min(...points.map(([px]) => px));
  const maxX = Math.max(...points.map(([px]) => px));
  const minY = Math.min(...points.map(([, py]) => py));
  const maxY = Math.max(...points.map(([, py]) => py));
  for (const faceNormal of [normalZ, -normalZ]) {
    for (const [px, py] of points) {
      positions.push(px, py, 0);
      normals.push(0, 0, faceNormal);
      uv.push((px - minX) / Math.max(0.001, maxX - minX),
        (py - minY) / Math.max(0.001, maxY - minY));
    }
  }
  const indices = [];
  for (const [a, b, c] of faces) {
    const front = normalZ > 0 ? [a, b, c] : [c, b, a];
    const offset = points.length;
    indices.push(...front, offset + front[2], offset + front[1], offset + front[0]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.translate(x, y, z);
  return finish(geometry, name);
}

/**
 * Lock one piece of amber geometry to a single texel in the scoped three-value exposure map.
 * UV survives the BuildingKit merge, so one material can carry three genuinely separated warm
 * luminance bands without spending two additional draw calls/material slots.
 */
function lockUvToValueTexel(geometry, band = 0, bandCount = 3) {
  const uv = geometry.getAttribute('uv');
  if (!uv) return;
  const sampleX = (THREE.MathUtils.clamp(band, 0, bandCount - 1) + 0.5) / bandCount;
  for (let index = 0; index < uv.count; index += 1) uv.setXY(index, sampleX, 0.5);
  uv.needsUpdate = true;
}

function cylinder(radius, h, x, y, z, name, sides = 12, axis = 'y') {
  // Preserve octagonal hero wheels and roof coolers; sub-150 mm posts, stems, pipes, cages,
  // staff figures and service cylinders resolve identically as hexagons at the locked camera.
  const heroOctagon = (name.startsWith('ambulance-wheel-') && !name.includes('-hub-'))
    || name.startsWith('plant-medium-cooler');
  const geometry = new THREE.CylinderGeometry(radius, radius, h,
    heroOctagon ? Math.max(6, Math.min(sides, 8)) : 6, 1, false);
  if (axis === 'x') geometry.rotateZ(Math.PI / 2);
  if (axis === 'z') geometry.rotateX(Math.PI / 2);
  geometry.translate(x, axis === 'y' ? y + h / 2 : y, z);
  return finish(geometry, name);
}

function sphere(radius, x, y, z, name, segments = 10) {
  void segments;
  const geometry = new THREE.OctahedronGeometry(radius, 0);
  geometry.translate(x, y, z);
  return finish(geometry, name);
}

function octagon(radius, h, x, y, z, name) {
  const geometry = new THREE.CylinderGeometry(radius, radius, h, 8, 1, false);
  geometry.rotateY(Math.PI / 8);
  geometry.translate(x, y + h / 2, z);
  return finish(geometry, name);
}

function ring(inner, outer, x, y, z, name, start = 0, length = Math.PI * 2) {
  // Sixteen sides remain round at board scale and align cleanly with the octagonal deck below.
  const geometry = new THREE.RingGeometry(inner, outer, 16, 1, start, length);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(x, y, z);
  return finish(geometry, name);
}

function wheelArch(radius, tube, x, y, z, name) {
  const geometry = new THREE.TorusGeometry(radius, tube, 3, 4, Math.PI);
  geometry.rotateY(Math.PI / 2);
  geometry.translate(x, y, z);
  return finish(geometry, name);
}

function makePalette(materials) {
  const concrete = materials.get('concrete', {
    variant: 'hospital-b-board-concrete-v4',
    color: '#978d80', roughness: 0.92, metalness: 0,
  });
  const brick = materials.get('brick', {
    variant: 'hospital-b-dark-red-brick-v3',
    color: '#754238', roughness: 0.94, metalness: 0,
  });
  const glass = materials.get('glass', {
    variant: 'hospital-b-recessed-night-glass-v3',
    color: '#214a52', opacity: 0.48, roughness: 0.34, metalness: 0.05,
  });
  const steel = materials.get('painted_metal', {
    variant: 'hospital-b-blackened-steel-v4',
    color: '#66706e', roughness: 0.82, metalness: 0.16,
  });
  // Dark structure and mid-value pane frames share one steel material. The first texel restores
  // the accepted blackened value; the second makes each 10-14px window frame independently
  // visible without adding pale concrete area or another material/draw call.
  if (!steel.userData.hospitalSteelValueMap) {
    const steelValueMap = new THREE.DataTexture(new Uint8Array([
      80, 84, 84, 255,
      250, 250, 242, 255,
    ]), 2, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    steelValueMap.name = 'hospital-b-two-band-blackened-steel';
    steelValueMap.colorSpace = THREE.SRGBColorSpace;
    steelValueMap.magFilter = THREE.NearestFilter;
    steelValueMap.minFilter = THREE.NearestFilter;
    steelValueMap.generateMipmaps = false;
    steelValueMap.needsUpdate = true;
    steel.userData.hospitalSteelValueMap = steelValueMap;
  }
  steel.map = steel.userData.hospitalSteelValueMap;
  steel.needsUpdate = true;
  const red = materials.get('painted_metal', {
    variant: 'hospital-b-emergency-red-v3',
    color: '#a93228', roughness: 0.7, metalness: 0.05,
  });
  red.emissive?.set('#330301');
  red.emissiveIntensity = 0.26;
  const amber = materials.get('painted_metal', {
    variant: 'hospital-b-night-amber-v3',
    color: '#c5aa78', roughness: 0.66, metalness: 0.01,
  });
  amber.emissive?.set('#3a2411');
  amber.emissiveIntensity = 0.22;
  // One material, three authored hospital-night exposure values. The RGB/luminance steps remain
  // visibly distinct after the glass layer while all other amber wayfinding samples texel zero.
  if (!amber.userData.hospitalExposureMap) {
    const exposureMap = new THREE.DataTexture(new Uint8Array([
      255, 242, 210, 255,
      170, 128, 76, 255,
      90, 52, 24, 255,
    ]), 3, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    exposureMap.name = 'hospital-b-three-band-amber-exposure';
    exposureMap.colorSpace = THREE.SRGBColorSpace;
    exposureMap.magFilter = THREE.NearestFilter;
    exposureMap.minFilter = THREE.NearestFilter;
    exposureMap.generateMipmaps = false;
    exposureMap.needsUpdate = true;
    amber.userData.hospitalExposureMap = exposureMap;
  }
  amber.map = amber.userData.hospitalExposureMap;
  amber.emissiveMap = amber.userData.hospitalExposureMap;
  amber.needsUpdate = true;
  // The painted-metal family carries clearcoat for clean contemporary assets. This model is
  // forty years of repaints and maintenance wear, so its scoped variants lose that plastic skim.
  for (const material of [steel, red, amber]) {
    material.clearcoat = 0;
    material.clearcoatRoughness = 1;
    material.userData.envIntensityBase = material === steel ? 0.92 : 0.8;
  }
  // Concrete gets authored macro wear below; disable its noisy albedo/AO while retaining a
  // restrained form-tie normal. Brick keeps the real bond texture, but both materials lose the
  // high-frequency normal/AO crush that disappears into dark speckle at the game camera.
  concrete.map = null;
  concrete.roughnessMap = null;
  concrete.aoMap = null;
  concrete.aoMapIntensity = 0;
  concrete.normalScale?.set(0.14, 0.14);
  brick.aoMapIntensity = 0.34;
  // B14 removes the inherited family-wide albedo wash. Bond depth stays in the restrained
  // normal map; all visible macro grime is authored below as exactly three causal stories.
  brick.map = null;
  brick.roughnessMap = null;
  brick.aoMap = null;
  brick.bumpMap = null;
  brick.aoMapIntensity = 0;
  brick.normalScale?.set(0.16, 0.16);
  steel.aoMapIntensity = 0.25;
  steel.normalScale?.set(0.16, 0.16);
  glass.userData.envIntensityBase = 1.08;
  glass.emissive?.set('#06191c');
  glass.emissiveIntensity = 0.06;
  return { concrete, brick, glass, steel, red, amber };
}

function addAmbulance(emit, p, { x, y, z }) {
  // 5.76 × 1.92 × 2.42 m: full emergency-van profile, correctly below the canopy.
  emit(box(1.92, 1.82, 3.72, x, y + 0.42, z - 1.05, 'ambulance-patient-body',
    { edge: 0.12 }), p.concrete);
  emit(box(1.82, 1.38, 1.42, x, y + 0.42, z + 1.43, 'ambulance-cab',
    { edge: 0.14 }), p.concrete);
  emit(box(1.7, 0.68, 0.74, x, y + 0.42, z + 2.48, 'ambulance-bonnet',
    { edge: 0.11 }), p.concrete);
  emit(box(1.58, 0.82, 0.08, x, y + 1.24, z + 2.12, 'ambulance-sloped-windscreen',
    { pitch: -0.38, edge: 0.012 }), p.glass);
  for (const [suffix, px] of [['west', x - 0.76], ['centre', x], ['east', x + 0.76]]) {
    emit(box(0.1, 0.82, 0.14, px, y + 1.27, z + 2.21,
      `ambulance-windscreen-${suffix}-pillar`, { edge: 0.018 }), p.concrete);
  }
  emit(box(1.7, 0.12, 0.16, x, y + 1.96, z + 2.2,
    'ambulance-windscreen-header', { edge: 0.018 }), p.concrete);
  for (const side of [-1, 1]) {
    emit(box(0.07, 0.58, 0.74, x + side * 0.94, y + 1.3, z + 1.43,
      `ambulance-${side < 0 ? 'west' : 'east'}-cab-window`), p.glass);
    emit(box(0.07, 0.32, 5.0, x + side * 0.98, y + 1.03, z - 0.3,
      `ambulance-${side < 0 ? 'west' : 'east'}-red-stripe`), p.red);
    emit(box(0.075, 0.78, 0.24, x + side * 0.992, y + 1.12, z - 0.92,
      `ambulance-${side < 0 ? 'west' : 'east'}-medical-cross-stem`), p.red);
    emit(box(0.075, 0.24, 0.78, x + side * 0.994, y + 1.39, z - 0.92,
      `ambulance-${side < 0 ? 'west' : 'east'}-medical-cross-bar`), p.red);
    emit(box(0.07, 0.11, 5.22, x + side * 0.985, y + 0.88, z - 0.27,
      `ambulance-${side < 0 ? 'west' : 'east'}-reflective-stripe`), p.amber);
    for (let panel = 0; panel < 4; panel += 1) {
      emit(box(0.075, 0.23, 0.42, x + side * 0.99, y + 1.39, z - 0.88 + panel * 0.58,
        `ambulance-${side < 0 ? 'west' : 'east'}-checker-${panel + 1}`),
      panel % 2 ? p.amber : p.red);
    }
    for (const wz of [z - 1.82, z + 1.62]) {
      emit(cylinder(0.36, 0.2, x + side * 0.99, y + 0.38, wz,
        `ambulance-wheel-${side < 0 ? 'west' : 'east'}-${wz < z ? 'rear' : 'front'}`,
        12, 'x'), p.steel);
      emit(wheelArch(0.46, 0.1, x + side * 1.005, y + 0.39, wz,
        `ambulance-wheel-arch-${side < 0 ? 'west' : 'east'}-${wz < z ? 'rear' : 'front'}`),
      p.concrete);
      emit(cylinder(0.15, 0.225, x + side * 1.105, y + 0.38, wz,
        `ambulance-wheel-hub-${side < 0 ? 'west' : 'east'}-${wz < z ? 'rear' : 'front'}`,
        8, 'x'), p.concrete);
    }
    emit(box(0.035, 0.62, 1.16, x + side * 0.996, y + 1.34, z - 1.12,
      `ambulance-${side < 0 ? 'west' : 'east'}-patient-door-window`,
      { edge: 0.005 }), p.glass);
    for (const [index, seamZ] of [z - 2.24, z - 0.12].entries()) {
      emit(box(0.035, 1.52, 0.11, x + side * 0.998, y + 0.58, seamZ,
        `ambulance-${side < 0 ? 'west' : 'east'}-door-seam-${index + 1}`,
        { edge: 0.005 }), p.steel);
    }
  }
  emit(box(1.36, 0.15, 0.32, x, y + 2.28, z + 0.42, 'ambulance-lightbar-base'), p.steel);
  emit(box(0.58, 0.18, 0.3, x - 0.37, y + 2.41, z + 0.42, 'ambulance-lightbar-red'), p.red);
  emit(box(0.58, 0.18, 0.3, x + 0.37, y + 2.41, z + 0.42, 'ambulance-lightbar-amber'), p.amber);
  emit(box(1.42, 0.24, 0.88, x, y + 2.22, z - 0.62, 'ambulance-roof-equipment-pod',
    { edge: 0.075 }), p.concrete);
  emit(box(1.12, 0.08, 0.62, x, y + 2.46, z - 0.62, 'ambulance-roof-pod-fluorescent-panel',
    { edge: 0.015 }), p.amber);
  for (const hx of [-0.54, 0.54]) {
    emit(sphere(0.12, x + hx, y + 0.73, z + 2.88,
      `ambulance-headlamp-${hx < 0 ? 'west' : 'east'}`), p.amber);
  }
  emit(box(1.02, 0.32, 0.035, x, y + 0.64, z + 2.88,
    'ambulance-front-grille', { edge: 0.005 }), p.steel);
  emit(box(1.58, 0.18, 0.22, x, y + 0.45, z + 2.92,
    'ambulance-front-bumper'), p.steel);
  emit(box(0.38, 0.92, 0.08, x, y + 1.18, z - 2.94, 'ambulance-rear-cross-vertical'), p.red);
  emit(box(0.92, 0.38, 0.08, x, y + 1.45, z - 2.94, 'ambulance-rear-cross-horizontal'), p.red);
  emit(box(1.72, 1.56, 0.035, x, y + 0.52, z - 2.99,
    'ambulance-rear-chevron-field', { edge: 0.006 }), p.steel);
  for (let stripe = -2; stripe <= 2; stripe += 1) {
    emit(box(0.28, 1.78, 0.035, x + stripe * 0.32, y + 0.43, z - 3.015,
      `ambulance-rear-chevron-${stripe + 3}`, { roll: stripe % 2 ? -0.72 : 0.72, edge: 0.006 }),
    stripe % 2 ? p.red : p.amber);
  }
  for (const side of [-1, 1]) {
    for (let stripe = 0; stripe < 3; stripe += 1) {
      emit(box(0.035, 0.18, 0.72, x + side * 1.015, y + 0.66 + stripe * 0.28,
        z - 2.12 + stripe * 0.12,
        `ambulance-${side < 0 ? 'west' : 'east'}-rear-quarter-chevron-${stripe + 1}`,
        { pitch: stripe % 2 ? -0.6 : 0.6, edge: 0.006 }), stripe % 2 ? p.red : p.amber);
    }
  }
}

function addHelideck(emit, p, { x, y, z, high }) {
  emit(octagon(3.25, 0.5, x, y, z, 'helideck-raised-plinth'), p.concrete);
  emit(octagon(3.02, 0.28, x, y + 0.5, z, 'helideck-second-step'), p.steel);
  emit(octagon(2.82, 0.12, x, y + 0.78, z, 'helideck-flight-surface'), p.concrete);
  emit(ring(2.12, 2.3, x, y + 0.91, z, 'helideck-landing-ring'), p.amber);
  // Clear top-down H made from construction geometry, not a texture or floating label.
  for (const side of [-1, 1]) {
    emit(box(0.34, 0.075, 2.2, x + side * 0.68, y + 0.9, z,
      `helideck-h-upright-${side < 0 ? 'west' : 'east'}`, { edge: 0.018 }), p.amber);
  }
  emit(box(1.7, 0.075, 0.36, x, y + 0.9, z, 'helideck-h-crossbar',
    { edge: 0.018 }), p.amber);

  const railRadius = 3.18;
  for (let i = 0; i < 8; i += 1) {
    const a = Math.PI / 8 + i * Math.PI / 4;
    const px = x + Math.cos(a) * railRadius;
    const pz = z + Math.sin(a) * railRadius;
    emit(cylinder(0.075, 0.68, px, y + 0.9, pz, `helideck-guard-post-${i + 1}`, 8), p.steel);
    // Depth is the thin axis, producing a genuinely vertical 0.18m rail plate. The previous
    // square 0.12m section collapsed to a horizontal plate and read as a one-pixel wire.
    emit(box(2.3, 0.18, 0.1, x + Math.cos(a) * 2.93, y + 1.46,
      z + Math.sin(a) * 2.93, `helideck-guard-rail-${i + 1}`,
      { yaw: -a + Math.PI / 2, edge: 0.012 }), p.steel);
    emit(cylinder(0.06, 0.24, px, y + 1.5, pz, `helideck-beacon-stem-${i + 1}`, 8), p.steel);
    emit(sphere(0.14, px, y + 1.82, pz, `helideck-red-beacon-${i + 1}`, 8), p.red);
  }
  if (high) {
    for (let i = 0; i < 8; i += 1) {
      const a = i * Math.PI / 4;
      emit(box(0.13, 0.04, 0.46, x + Math.cos(a) * 2.55, y + 0.91,
        z + Math.sin(a) * 2.55, `helideck-rim-marker-${i + 1}`,
        { yaw: -a, edge: 0.008 }), p.red);
    }
  }
}

function addPlant(emit, p, { wardTop, wardZ, wardW, high, mid }) {
  // Large scale: a proper louvred plant penthouse.
  const largeX = wardW * 0.14;
  const largeZ = wardZ - 1.75;
  emit(box(2.72, 1.72, 2.12, largeX, wardTop + 0.2, largeZ, 'plant-large-penthouse',
    { edge: 0.1 }), p.brick);
  emit(box(2.96, 1.58, 0.15, largeX, wardTop + 0.32, largeZ + 1.14,
    'plant-large-screen'), p.steel);
  const louvres = high ? 9 : mid ? 6 : 4;
  for (let i = 0; i < louvres; i += 1) {
    emit(box(2.6, 0.055, 0.075, largeX, wardTop + 0.46 + i * (1.28 / louvres),
      largeZ + 1.23, `plant-large-louvre-${i + 1}`, { edge: 0.008 }), p.concrete);
  }
  // Medium scale: two cooling units with pronounced fan caps.
  for (const [index, x] of [[1, wardW * 0.06], [2, wardW * 0.18]]) {
    emit(cylinder(0.58, 1.08, x, wardTop + 0.24, wardZ + 2.45,
      `plant-medium-cooler-${index}`, 10), p.steel);
    emit(cylinder(0.72, 0.16, x, wardTop + 1.3, wardZ + 2.45,
      `plant-medium-cooler-cap-${index}`, 10), p.concrete);
    emit(cylinder(0.36, 0.08, x, wardTop + 1.47, wardZ + 2.45,
      `plant-medium-cooler-fan-${index}`, 10), p.steel);
  }
  emit(box(1.9, 0.58, 0.62, 0, wardTop + 0.48, largeZ - 1.35,
    'plant-main-duct-run', { edge: 0.075 }), p.steel);
  emit(box(0.68, 0.92, 0.68, 1.08, wardTop + 0.48, largeZ - 1.35,
    'plant-main-duct-riser', { edge: 0.075 }), p.steel);
  // Small scale: clustered exhausts remain legible without becoming the asset's tallest mass.
  for (const [index, x, h] of [[1, largeX - 0.75, 1.08], [2, largeX, 1.32], [3, largeX + 0.75, 0.94]]) {
    emit(cylinder(0.14, h, x, wardTop + 0.46, largeZ - 0.25,
      `plant-small-exhaust-${index}`, 10), p.steel);
    emit(cylinder(0.22, 0.12, x, wardTop + 0.46 + h, largeZ - 0.25,
      `plant-small-exhaust-cap-${index}`, 10), p.red);
  }
}

function addServiceYard(emit, p, { siteW, siteD, base, high, mid }) {
  const rear = -siteD / 2;
  const annexX = -2.55;
  const annexZ = rear + 4.65;
  emit(box(6.6, 3.1, 4.35, annexX, base + 0.42, annexZ, 'service-loading-annex',
    { edge: 0.1 }), p.brick);
  const rearFace = annexZ - 2.175;
  // Loading door, canopy and staff entry.
  emit(box(3.3, 2.58, 0.1, annexX - 0.62, base + 0.48, rearFace + 0.08,
    'service-loading-recess-void'), p.steel);
  emit(box(3.02, 2.34, 0.18, annexX - 0.62, base + 0.58, rearFace - 0.03,
    'service-loading-door'), p.steel);
  for (const side of [-1, 1]) {
    emit(box(0.25, 2.66, 0.3, annexX - 0.62 + side * 1.64, base + 0.48,
      rearFace - 0.16, `service-loading-portal-${side < 0 ? 'west' : 'east'}-jamb`), p.concrete);
    emit(sphere(0.12, annexX - 0.62 + side * 1.28, base + 2.92, rearFace - 0.28,
      `service-loading-amber-light-${side < 0 ? 'west' : 'east'}`, 8), p.amber);
  }
  emit(box(3.52, 0.26, 0.3, annexX - 0.62, base + 2.88, rearFace - 0.16,
    'service-loading-portal-head'), p.concrete);
  for (let i = 0; i < 8; i += 1) {
    emit(box(2.78, 0.045, 0.07, annexX - 0.62, base + 0.78 + i * 0.25,
      rearFace - 0.17, `service-loading-door-rib-${i + 1}`, { edge: 0.007 }), p.concrete);
  }
  emit(box(3.72, 0.25, 1.18, annexX - 0.62, base + 2.96, rearFace - 0.38,
    'service-loading-canopy', { edge: 0.06 }), p.steel);
  for (const side of [-1, 1]) {
    emit(box(0.32, 0.44, 0.16, annexX - 0.62 + side * 1.16, base + 0.46,
      rearFace - 0.28, `service-dock-bumper-${side < 0 ? 'west' : 'east'}`), p.amber);
  }
  const staffX = annexX + 2.25;
  emit(box(1.28, 2.36, 0.1, staffX, base + 0.52, rearFace + 0.08,
    'service-staff-entry-recess-void'), p.steel);
  emit(box(1.05, 2.14, 0.16, staffX, base + 0.62, rearFace - 0.03,
    'service-staff-entry-door'), p.steel);
  for (const side of [-1, 1]) {
    emit(box(0.18, 2.42, 0.34, staffX + side * 0.63, base + 0.5,
      rearFace - 0.1, `service-staff-entry-${side < 0 ? 'west' : 'east'}-jamb`), p.concrete);
  }
  emit(box(1.34, 0.2, 0.74, staffX, base + 2.75, rearFace - 0.24,
    'service-staff-entry-hood'), p.concrete);
  emit(box(0.08, 0.46, 0.08, staffX + 0.28, base + 1.34, rearFace - 0.18,
    'service-staff-door-pull'), p.amber);
  // Rear wall louvre bank.
  emit(box(1.55, 1.18, 0.14, annexX - 2.25, base + 1.42, rearFace - 0.08,
    'service-louvre-bank'), p.steel);
  const louvreCount = high ? 7 : 5;
  for (let i = 0; i < louvreCount; i += 1) {
    emit(box(1.34, 0.05, 0.07, annexX - 2.25, base + 1.56 + i * 0.13,
      rearFace - 0.17, `service-louvre-slat-${i + 1}`, { edge: 0.007 }), p.concrete);
  }

  // Marked apron and dock hatching.
  emit(box(7.75, 0.045, 3.0, annexX, base + 0.13, rear + 1.58,
    'service-marked-apron', { edge: 0.012 }), p.steel);
  for (let i = 0; i < 6; i += 1) {
    emit(box(0.09, 0.025, 2.2, annexX - 2.6 + i * 1.02, base + 0.19,
      rear + 1.58, `service-apron-hatch-${i + 1}`, { yaw: -0.48, edge: 0.006 }), p.amber);
  }
  for (const x of [annexX - 3.55, annexX + 3.55]) {
    emit(box(0.1, 0.025, 2.72, x, base + 0.19, rear + 1.58,
      `service-apron-edge-${x < annexX ? 'west' : 'east'}`, { edge: 0.006 }), p.amber);
  }
  emit(box(3.18, 0.22, 0.66, annexX - 0.62, base + 0.4, rearFace - 0.5,
    'service-loading-threshold', { edge: 0.04 }), p.concrete);

  if (!mid) return;
  // Generator cage: solid equipment within an explicit blackened-steel enclosure.
  const genX = 3.25;
  const genZ = rear + 1.7;
  emit(box(2.3, 0.88, 1.42, genX, base + 0.34, genZ, 'service-generator-body',
    { edge: 0.08 }), p.steel);
  emit(box(2.5, 0.12, 1.62, genX, base + 0.24, genZ, 'service-generator-plinth'), p.concrete);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      emit(cylinder(0.045, 1.72, genX + sx * 1.27, base + 0.24, genZ + sz * 0.84,
        `service-generator-cage-post-${sx < 0 ? 'w' : 'e'}-${sz < 0 ? 'r' : 'f'}`, 8), p.steel);
    }
  }
  for (const zOff of [-0.84, 0.84]) {
    for (const level of [0.7, 1.34]) {
      emit(box(2.54, 0.055, 0.055, genX, base + level, genZ + zOff,
        `service-generator-cage-rail-${zOff < 0 ? 'rear' : 'front'}-${level}`, { edge: 0.007 }), p.steel);
    }
  }
  // Oxygen bottle cage at a distinct intermediate scale.
  const oxyX = 0.92;
  const oxyZ = rear + 1.45;
  emit(box(1.62, 0.12, 1.45, oxyX, base + 0.24, oxyZ, 'service-oxygen-cage-base'), p.concrete);
  for (let i = 0; i < 4; i += 1) {
    emit(cylinder(0.17, 1.42, oxyX - 0.54 + i * 0.36, base + 0.36, oxyZ,
      `service-oxygen-cylinder-${i + 1}`, 10), p.concrete);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      emit(cylinder(0.04, 1.68, oxyX + sx * 0.82, base + 0.24, oxyZ + sz * 0.74,
        `service-oxygen-cage-post-${sx < 0 ? 'w' : 'e'}-${sz < 0 ? 'r' : 'f'}`, 8), p.steel);
    }
  }
  // Screened waste at the rear-west corner.
  const wasteX = -siteW / 2 + 1.18;
  const wasteZ = rear + 1.55;
  emit(box(1.82, 1.42, 1.7, wasteX, base + 0.25, wasteZ, 'service-screened-waste'), p.steel);
  emit(box(1.96, 0.14, 1.82, wasteX, base + 1.65, wasteZ, 'service-waste-screen-cap'), p.concrete);
  for (let i = 0; i < 6; i += 1) {
    emit(box(1.54, 0.05, 0.07, wasteX, base + 0.42 + i * 0.18, wasteZ + 0.89,
      `service-waste-screen-slat-${i + 1}`, { edge: 0.007 }), p.concrete);
  }
}

/**
 * Build Hospital B. The returned metadata is diagnostic only; the caller owns the parts.
 */
export function addBrutalistNightShiftHospital(ctx) {
  const {
    push, materials, bodyW, bodyD, bodyY, bodyH, groundY, storeyH, quality,
  } = ctx;
  if (typeof push !== 'function' || !materials?.get) {
    throw new TypeError('addBrutalistNightShiftHospital requires push() and materials.get()');
  }
  void bodyY; void bodyH;
  const high = quality === 'high';
  const mid = quality !== 'low';
  const ground = Number.isFinite(groundY) ? groundY : -0.02;
  const base = ground + 0.08;
  const siteW = THREE.MathUtils.clamp((bodyW || 14) * 1.015, 13.8, 14.34);
  const siteD = THREE.MathUtils.clamp((bodyD || 28) * 1.075, 28.6, 30.18);
  const visualStorey = THREE.MathUtils.clamp((storeyH || 3.2) * 0.61, 1.82, 2.02);
  const wardW = siteW - 0.82;
  const wardD = 8.0;
  const wardZ = -0.35;
  const wardBase = base + 2.72;
  const wardH = visualStorey * 2.72;
  const wardTop = wardBase + wardH;
  const p = makePalette(materials);
  let partCount = 0;
  const emit = (geometry, material) => {
    if (!geometry?.name?.startsWith(PREFIX)) throw new Error('Hospital B geometry name drift');
    for (const attribute of Object.values(geometry.attributes ?? {})) {
      const values = attribute.array;
      for (let i = 0; i < values.length; i += 1) {
        if (!Number.isFinite(values[i])) throw new Error(`Non-finite geometry: ${geometry.name}`);
      }
    }
    if (material === p.amber) {
      const exposure = /amber-value-([123])$/.exec(geometry.name);
      lockUvToValueTexel(geometry, exposure ? Number(exposure[1]) - 1 : 0, 3);
    } else if (material === p.steel) {
      const isPaneFrame = /ward-front-ribbon-\d-pane-\d-(?:west|east)-frame$/.test(geometry.name)
        || /ward-front-ribbon-\d-pane-\d-(?:sill|head)-frame$/.test(geometry.name);
      lockUvToValueTexel(geometry, isPaneFrame ? 1 : 0, 2);
    }
    push(geometry, material);
    partCount += 1;
  };

  // Grounded campus: full civic tray, solid podium plate, and three visibly stepped masses.
  emit(box(siteW, 0.12, siteD, 0, ground, 0, 'site-tray', { edge: 0.035 }), p.steel);
  emit(box(siteW - 0.28, 0.46, 21.2, 0, base, -0.35, 'solid-campus-podium',
    { edge: 0.1 }), p.concrete);
  // This thin authored surface sits above the generic civic base and turns the entire site
  // into one operational apron rather than a clean display plinth.
  emit(box(siteW - 0.3, 0.035, siteD - 0.48, 0, base + 0.395, 0,
    'campus-operational-apron-surface', { edge: 0.008 }), p.concrete);
  for (let index = 0; index < 8; index += 1) {
    const z = -12 + index * 3;
    emit(box(siteW - 0.62, 0.025, 0.055, 0, base + 0.43, z,
      `campus-apron-expansion-joint-${index + 1}`, { edge: 0.006 }), p.steel);
  }
  emit(box(0.055, 0.025, siteD - 0.82, 0.55, base + 0.43, 0,
    'campus-apron-longitudinal-joint', { edge: 0.006 }), p.steel);
  for (const z of [-10.7, 10.05]) {
    emit(box(siteW - 0.44, 0.2, 0.28, 0, base + 0.42, z,
      `campus-podium-${z < 0 ? 'rear' : 'front'}-kerb`), p.concrete);
  }

  // Ground/rear spine seats the ward over most of its footprint; only the deliberate ED bay
  // remains open. A diagnostic wing and public clinic create two lower roof levels.
  emit(box(wardW * 0.5, 2.72, 4.6, wardW * 0.25, base + 0.44, -2.05,
    'grounded-podium-east-spine', { edge: 0.1 }), p.brick);
  emit(box(0.78, 2.72, 4.6, -wardW / 2 + 0.39, base + 0.44, -2.05,
    'grounded-podium-west-buttress', { edge: 0.09 }), p.concrete);
  emit(box(9.15, 4.72, 6.55, -1.45, base + 0.44, -6.7, 'stepped-diagnostic-rear-wing',
    { edge: 0.12 }), p.brick);
  emit(box(5.45, 3.42, 4.65, 3.65, base + 0.44, 2.58, 'stepped-public-clinic-wing',
    { edge: 0.11 }), p.brick);
  emit(box(9.38, 0.32, 6.78, -1.45, base + 5.1, -6.7, 'diagnostic-wing-roof-cap'), p.concrete);
  emit(box(5.66, 0.3, 4.86, 3.65, base + 3.72, 2.58, 'public-clinic-roof-cap'), p.concrete);
  const diagnosticRear = -6.7 - 6.55 / 2;
  for (const [index, x] of [-4.38, -1.45, 1.48].entries()) {
    emit(box(2.08, 0.92, 0.1, x, base + 3.72, diagnosticRear - 0.08,
      `diagnostic-rear-window-${index + 1}`), index === 1 ? p.amber : p.glass);
    emit(box(2.34, 0.18, 0.36, x, base + 3.58, diagnosticRear - 0.18,
      `diagnostic-rear-window-sill-${index + 1}`), p.concrete);
    emit(box(0.22, 1.32, 0.32, x - 1.18, base + 3.5, diagnosticRear - 0.17,
      `diagnostic-rear-window-pier-${index + 1}`), p.concrete);
  }
  // Punched clinic flank prevents the low public wing becoming a blank red service wall.
  const clinicEastX = 3.65 + 5.45 / 2;
  for (const [index, z] of [1.15, 2.58, 4.0].entries()) {
    emit(box(0.1, 1.18, 0.86, clinicEastX + 0.08, base + 1.34, z,
      `public-clinic-east-window-${index + 1}`), index === 1 ? p.amber : p.glass);
    emit(box(0.28, 0.18, 1.08, clinicEastX + 0.16, base + 1.2, z,
      `public-clinic-east-window-sill-${index + 1}`), p.concrete);
  }
  for (let course = 0; course < 7; course += 1) {
    emit(box(0.055, 0.04, 4.1, clinicEastX + 0.13, base + 0.78 + course * 0.38,
      2.58, `public-clinic-east-brick-course-${course + 1}`, { edge: 0.006 }), p.steel);
  }

  // Primary bar: 13.5m wide and 6.4m visible height (ratio > 2.0), with no blank end walls.
  emit(box(wardW, wardH, wardD, 0, wardBase, wardZ, 'primary-ward-dark-brick-bar',
    { edge: 0.13 }), p.brick);
  const frontZ = wardZ + wardD / 2;
  const rearZ = wardZ - wardD / 2;
  // The front ribbon yields before the identity blade: all eight bays on all three floors remain
  // independently countable, including their right-hand frames, in the locked front camera.
  const ribbonW = wardW * 0.85;
  const frontRibbonX = -0.5;
  const ribbonH = visualStorey * 0.54;
  for (let row = 0; row < 3; row += 1) {
    // The first ward floor clears both arrival canopies in the front camera; this makes all
    // twenty-four panes countable while reading as a deliberate clinical floor over a service
    // mezzanine. Upper floors retain the accepted structural datums.
    const y = wardBase + (row === 0 ? 1.24 : 0.52 + row * visualStorey * 0.93);
    // Eight bays per floor create exactly twenty-four hero panes. Every pane is individually
    // glazed and separated by a board-scale reveal; there is no continuous teal backing card.
    const roomBayW = ribbonW / 8;
    const glassH = ribbonH * 0.68;
    // Front: a deliberately oversized dark reveal remains visible around every pane. The
    // concrete/brick frame front is +0.45m, glazing +0.28m and the void +0.01m. At the locked
    // review camera the 0.17m frame-to-glass setback holds an 8-12px clean shadow line.
    emit(box(ribbonW + 0.52, ribbonH + 0.36, 0.035, frontRibbonX, y - 0.14, frontZ + 0.012,
      `ward-front-ribbon-${row + 1}-deep-void`), p.steel);
    for (let bay = 0; bay < 8; bay += 1) {
      const paneX = frontRibbonX - ribbonW / 2 + roomBayW * (bay + 0.5);
      // 0.72m glass is a 46-50px run in the locked front camera; the dark reveal occupies the
      // remainder of the 1.49m bay, so no glazing run can exceed the 75px contract.
      emit(box(0.72, glassH, 0.035, paneX, y + 0.1, frontZ + 0.28,
        `ward-front-ribbon-${row + 1}-glass-pane-${bay + 1}`), p.glass);
      // Each pane receives its own structural perimeter, rather than relying on a continuous
      // ribbon frame. A 0.14m clear dark reveal sits between the 0.82m glass and 0.20m frame;
      // those authored spans resolve to 8-12px and 10-14px respectively in the locked camera.
      for (const side of [-1, 1]) {
        emit(box(0.22, glassH + 0.38, 0.34,
          paneX + side * 0.65, y - 0.1, frontZ + 0.4,
          `ward-front-ribbon-${row + 1}-pane-${bay + 1}-${side < 0 ? 'west' : 'east'}-frame`,
          { edge: 0.012 }), p.steel);
      }
      emit(box(1.48, 0.22, 0.34, paneX, y - 0.12, frontZ + 0.4,
        `ward-front-ribbon-${row + 1}-pane-${bay + 1}-sill-frame`, { edge: 0.012 }), p.steel);
      emit(box(1.48, 0.22, 0.34, paneX, y + glassH + 0.12, frontZ + 0.4,
        `ward-front-ribbon-${row + 1}-pane-${bay + 1}-head-frame`, { edge: 0.012 }), p.steel);
    }
    emit(box(ribbonW + 0.72, 0.3, 0.82, frontRibbonX, y - 0.28, frontZ + 0.45,
      `ward-front-ribbon-${row + 1}-concrete-sill`), p.concrete);
    emit(box(ribbonW + 0.66, 0.42, 0.82, frontRibbonX, y + ribbonH - 0.1, frontZ + 0.45,
      `ward-front-ribbon-${row + 1}-brick-spandrel-head`), p.brick);
    for (const side of [-1, 1]) {
      emit(box(0.38, ribbonH + 0.34, 0.86, frontRibbonX + side * (ribbonW / 2 + 0.21),
        y - 0.08, frontZ + 0.44,
        `ward-front-ribbon-${row + 1}-${side < 0 ? 'west' : 'east'}-deep-jamb`), p.concrete);
    }
    // Exactly eight of twenty-four rooms are occupied (33%). All practicals share the one
    // physically coherent amber material; three authored exposure values come from fixture
    // aperture and setback (bright / working / night-dim), preserving the seven-material cap.
    // No pane receives a luminous back card. Four recognizable, multi-part silhouettes rotate:
    // bed, nurses' station, equipment/IV and chair.
    const occupiedBays = [[1, 4, 7], [0, 5], [2, 5, 7]][row];
    for (const [index, bayIndex] of occupiedBays.entries()) {
      const roomX = frontRibbonX - ribbonW / 2 + roomBayW * (bayIndex + 0.5);
      const roomW = roomBayW * 0.72;
      const occupiedIndex = row === 0 ? index : row === 1 ? index + 3 : index + 5;
      const archetype = [0, -1, 1, 2, -1, 3, -1, -1][occupiedIndex];
      // Exactly eight room-sized back walls: 3 top / 2 middle / 3 lower. Exposure bands are
      // explicit and differ by >=20 luma; there are no other front amber cards.
      const exposure = [0, 1, 2, 0, 1, 2, 0, 1][occupiedIndex];
      emit(box(roomW * 0.88, glassH * 0.82, 0.04,
        roomX, y + glassH * 0.12, frontZ + 0.06,
        `ward-front-ribbon-${row + 1}-room-${bayIndex + 1}-amber-value-${exposure + 1}`,
        { edge: 0.005 }), p.amber);
      if (archetype === 0) {
        emit(box(roomW * 0.72, 0.15, 0.06, roomX, y + 0.17, frontZ + 0.1,
          `ward-front-ribbon-${row + 1}-room-${bayIndex + 1}-bed-frame`), p.steel);
        emit(box(roomW * 0.66, 0.2, 0.07, roomX + roomW * 0.02, y + 0.28,
          frontZ + 0.12, `ward-front-ribbon-${row + 1}-room-${bayIndex + 1}-bed-mattress`), p.concrete);
        emit(sphere(0.15, roomX - roomW * 0.2, y + 0.44, frontZ + 0.14,
          `ward-front-ribbon-${row + 1}-room-${bayIndex + 1}-bed-patient-head`), p.concrete);
        emit(box(roomW * 0.38, 0.2, 0.06, roomX + roomW * 0.06, y + 0.38,
          frontZ + 0.14, `ward-front-ribbon-${row + 1}-room-${bayIndex + 1}-bed-patient-body`), p.steel);
      } else if (archetype === 1) {
        emit(box(roomW * 0.74, 0.2, 0.07, roomX, y + 0.21, frontZ + 0.1,
          `ward-front-ribbon-${row + 1}-room-${bayIndex + 1}-nurses-counter`), p.concrete);
        emit(box(0.32, 0.3, 0.055, roomX + roomW * 0.18, y + 0.43,
          frontZ + 0.13, `ward-front-ribbon-${row + 1}-room-${bayIndex + 1}-monitor`), p.concrete);
        emit(box(0.055, 0.2, 0.055, roomX + roomW * 0.18, y + 0.31,
          frontZ + 0.12, `ward-front-ribbon-${row + 1}-room-${bayIndex + 1}-monitor-stem`), p.steel);
      } else if (archetype === 2) {
        emit(box(roomW * 0.74, 0.15, 0.07, roomX, y + 0.44, frontZ + 0.1,
          `ward-front-ribbon-${row + 1}-room-${bayIndex + 1}-trolley-top`), p.steel);
        emit(box(roomW * 0.66, 0.12, 0.07, roomX, y + 0.2, frontZ + 0.11,
          `ward-front-ribbon-${row + 1}-room-${bayIndex + 1}-trolley-shelf`), p.concrete);
        for (const side of [-1, 1]) {
          emit(box(0.08, 0.42, 0.06, roomX + side * roomW * 0.26, y + 0.12,
            frontZ + 0.12, `ward-front-ribbon-${row + 1}-room-${bayIndex + 1}-trolley-leg-${side}`), p.steel);
        }
      } else {
        if (archetype === 3) {
          emit(box(roomW * 0.34, glassH * 0.82, 0.06, roomX - roomW * 0.26,
            y + 0.12, frontZ + 0.1,
            `ward-front-ribbon-${row + 1}-room-${bayIndex + 1}-curtain`), p.concrete);
          emit(box(roomW * 0.46, 0.18, 0.08, roomX + roomW * 0.18, y + 0.2,
            frontZ + 0.11, `ward-front-ribbon-${row + 1}-room-${bayIndex + 1}-chair-seat`), p.steel);
          emit(box(roomW * 0.46, 0.42, 0.07, roomX + roomW * 0.18, y + 0.34,
            frontZ + 0.12, `ward-front-ribbon-${row + 1}-room-${bayIndex + 1}-chair-back`), p.concrete);
        }
      }
    }
    // Rear elevation carries the same floor logic, but at a quieter service density.
    emit(box(ribbonW * 0.84, ribbonH * 0.86, 0.035, -0.12, y + 0.04, rearZ - 0.012,
      `ward-rear-ribbon-${row + 1}-deep-void`), p.steel);
    emit(box(ribbonW * 0.82, ribbonH * 0.78, 0.035, -0.12, y + 0.1, rearZ - 0.39,
      `ward-rear-ribbon-${row + 1}-glass`), p.glass);
    emit(box(ribbonW * 0.88, 0.25, 0.62, -0.12, y - 0.17, rearZ - 0.44,
      `ward-rear-ribbon-${row + 1}-band`), p.concrete);
    emit(box(ribbonW * 0.88, 0.26, 0.62, -0.12, y + ribbonH * 0.78,
      rearZ - 0.44, `ward-rear-ribbon-${row + 1}-head`), p.concrete);
    for (const side of [-1, 1]) {
      emit(box(0.27, ribbonH * 0.88, 0.62,
        -0.12 + side * ribbonW * 0.42, y + 0.02, rearZ - 0.44,
        `ward-rear-ribbon-${row + 1}-${side < 0 ? 'west' : 'east'}-deep-jamb`), p.concrete);
    }
    const rearRoomW = ribbonW * 0.82 / 9;
    const rearOccupied = [[0, 4, 7], [2, 5, 8], [1, 3, 6]][row];
    for (const [index, bayIndex] of rearOccupied.entries()) {
      const roomX = -0.12 - ribbonW * 0.41 + rearRoomW * (bayIndex + 0.5);
      const warmW = rearRoomW * 0.68;
      const archetype = (row + index + 1) % 3;
      emit(box(warmW * 0.62, 0.09, 0.04, roomX, y + ribbonH * 0.58,
        rearZ - 0.09, `ward-rear-ribbon-${row + 1}-room-${bayIndex + 1}-amber-task-light`,
        { edge: 0.005 }), p.amber);
      if (archetype === 0) {
        emit(box(warmW * 0.76, 0.11, 0.055, roomX, y + 0.18, rearZ - 0.2,
          `ward-rear-ribbon-${row + 1}-room-${bayIndex + 1}-bed-frame`), p.steel);
        emit(box(warmW * 0.64, 0.15, 0.055, roomX, y + 0.27, rearZ - 0.25,
          `ward-rear-ribbon-${row + 1}-room-${bayIndex + 1}-bed-mattress`), p.concrete);
      } else if (archetype === 1) {
        emit(box(warmW * 0.66, 0.13, 0.055, roomX, y + 0.22, rearZ - 0.2,
          `ward-rear-ribbon-${row + 1}-room-${bayIndex + 1}-counter`), p.concrete);
        emit(cylinder(0.085, ribbonH * 0.38, roomX - warmW * 0.2, y + 0.18,
          rearZ - 0.28, `ward-rear-ribbon-${row + 1}-room-${bayIndex + 1}-staff`, 8), p.steel);
      } else {
        emit(box(warmW * 0.3, ribbonH * 0.5, 0.055, roomX - warmW * 0.18,
          y + 0.14, rearZ - 0.2,
          `ward-rear-ribbon-${row + 1}-room-${bayIndex + 1}-equipment-rack`), p.concrete);
        emit(cylinder(0.035, ribbonH * 0.58, roomX + warmW * 0.24, y + 0.14,
          rearZ - 0.28, `ward-rear-ribbon-${row + 1}-room-${bayIndex + 1}-iv-pole`, 8), p.steel);
      }
    }
  }
  // Four chunky piers sit exactly on alternate bay boundaries. They retain the accepted 18-22px
  // brutalist rhythm without masking any glass pane or turning the ribbon into a dark run.
  const frontPierXs = [1, 3, 5, 7]
    .map((boundary) => frontRibbonX - ribbonW / 2 + (ribbonW / 8) * boundary);
  for (const [index, x] of frontPierXs.entries()) {
    // 0.36m resolves to 18-22px in the locked front capture.
    emit(box(0.36, wardH * 0.92, 0.76, x, wardBase + 0.16, frontZ + 0.34,
      `ward-front-chunky-pier-${index + 1}`, { edge: 0.075 }), p.concrete);
  }
  // A compact brick identity blade makes the medical cross unmissable without swallowing the
  // eighth window bay. Its 1.16m cross resolves to 65+/-5px; the 1.70m field stays under 17% of
  // the facade and under 125px in the locked 1500x1000 hero capture.
  // Together with the brick shell, three brick spandrels and clinic podium, brick occupies
  // 42-48% of the visible upper front; pale concrete remains below 27%. The 0.94m projection
  // exceeds the ten-pixel depth test.
  const identityW = 1.7;
  const identityX = siteW / 2 - identityW / 2 - 0.08;
  emit(box(identityW, wardH * 0.94, 0.94, identityX, wardBase + 0.08, frontZ + 0.5,
    'front-brick-hospital-identity-blade', { edge: 0.1 }), p.brick);
  emit(box(0.36, 1.18, 0.22, identityX, wardBase + wardH * 0.5,
    frontZ + 1.08, 'front-hospital-cross-vertical', { edge: 0.065 }), p.red);
  emit(box(1.16, 0.36, 0.22, identityX, wardBase + wardH * 0.5 + 0.41,
    frontZ + 1.08, 'front-hospital-cross-horizontal', { edge: 0.065 }), p.red);
  emit(box(wardW + 0.26, 0.42, wardD + 0.28, 0, wardBase - 0.18, wardZ,
    'ward-heavy-transfer-course', { edge: 0.08 }), p.concrete);
  emit(box(wardW + 0.3, 0.44, wardD + 0.34, 0, wardTop - 0.16, wardZ,
    'ward-roof-parapet-course', { edge: 0.08 }), p.concrete);
  // A dark operational roof membrane covers the broad interior of the pale perimeter course.
  // This is one two-sided four-triangle plate, paid for by the removed redundant front apron
  // joint above, and keeps roof/service values at least 30% darker than the civic deck.
  emit(box(wardW - 0.72, 0.055, wardD - 0.72, 0, wardTop + 0.285, wardZ,
    'ward-dark-operational-roof-deck', { edge: 0.008 }), p.steel);
  for (const [index, x] of [-0.36, 0, 0.36].entries()) {
    emit(box(0.38, wardH * 0.86, 0.62, x * wardW, wardBase + 0.24, rearZ - 0.3,
      `ward-rear-structural-pier-${index + 1}`, { edge: 0.065 }), p.concrete);
  }
  for (const [suffix, x] of [['west', -wardW * 0.47], ['east', wardW * 0.47]]) {
    emit(cylinder(0.1, wardH * 0.88, x, wardBase + 0.18, frontZ + 0.48,
      `ward-front-${suffix}-downpipe`, 10), p.steel);
    emit(box(0.28, 0.16, 0.52, x, wardBase + 0.08, frontZ + 0.58,
      `ward-front-${suffix}-downpipe-shoe`, { edge: 0.025 }), p.steel);
  }

  // Articulated flank elevations: three side ribbons, wrap bands, brick piers, and occupancy.
  if (mid) {
    for (const side of [-1, 1]) {
      const sx = side * (wardW / 2 + 0.53);
      for (let row = 0; row < 3; row += 1) {
        const y = wardBase + 0.58 + row * visualStorey * 0.93;
        emit(box(0.035, ribbonH * 0.9, wardD * 0.72,
          side * (wardW / 2 + 0.012), y - 0.04, wardZ,
          `ward-${side < 0 ? 'west' : 'east'}-ribbon-${row + 1}-deep-void`), p.steel);
        emit(box(0.035, ribbonH * 0.78, wardD * 0.68, sx, y, wardZ,
          `ward-${side < 0 ? 'west' : 'east'}-ribbon-${row + 1}`), p.glass);
        emit(box(0.62, 0.24, wardD * 0.78, side * (wardW / 2 + 0.44), y - 0.18, wardZ,
          `ward-${side < 0 ? 'west' : 'east'}-wrap-band-${row + 1}`), p.concrete);
        const sideInteriorX = side * (wardW / 2 + 0.025);
        const occupiedZ = wardZ + (row % 2 ? -0.85 : 0.92);
        emit(box(0.035, ribbonH * 0.48, wardD * 0.22, sideInteriorX,
          y + 0.06, occupiedZ,
          `ward-${side < 0 ? 'west' : 'east'}-occupied-interior-${row + 1}`), p.amber);
        if (row === (side < 0 ? 0 : 2)) {
          emit(box(0.04, ribbonH * 0.42, 0.2,
            side * (wardW / 2 + 0.055), y + 0.08, occupiedZ + 0.12,
            `ward-${side < 0 ? 'west' : 'east'}-occupied-silhouette-${row + 1}`), p.steel);
        }
      }
      for (const [index, z] of [-2.72, -0.35, 2.1].entries()) {
        emit(box(0.62, wardH * 0.88, 0.35, side * (wardW / 2 + 0.44),
          wardBase + 0.2, z, `ward-${side < 0 ? 'west' : 'east'}-side-pier-${index + 1}`,
          { edge: 0.06 }), p.concrete);
      }
    }
  }

  // ED arrival: two clear lanes, a deep black canopy, visible vehicle, road geometry and
  // chunky edge supports. It is separate from the public lobby to the east.
  const driveX = -siteW * 0.25;
  const driveW = siteW * 0.48;
  emit(box(driveW, 0.055, 11.3, driveX, base + 0.46, 5.15, 'ed-two-lane-drive'), p.steel);
  const edLaneW = driveW * 0.46;
  for (const offset of [-driveW * 0.25, driveW * 0.25]) {
    const suffix = offset < 0 ? 'ambulance' : 'clear';
    const laneX = driveX + offset;
    emit(box(edLaneW, 0.28, 4.72, laneX, base + 2.98, 5.82,
      `ed-${suffix}-bay-dark-soffit`, { edge: 0.08 }), p.steel);
    emit(box(edLaneW + 0.16, 0.34, 4.94, laneX, base + 3.25, 5.82,
      `ed-${suffix}-bay-concrete-cap`, { edge: 0.09 }), p.concrete);
    emit(box(edLaneW + 0.24, 0.48, 0.34, laneX, base + 3.05, 8.28,
      `ed-${suffix}-bay-front-fascia`, { edge: 0.065 }), p.steel);
    emit(box(edLaneW * 0.72, 0.13, 0.12, laneX, base + 3.2, 8.48,
      `ed-${suffix}-bay-red-marker`), p.red);
    emit(box(edLaneW * 0.92, 0.46, 0.52, laneX, base + 2.88, frontZ + 0.18,
      `ed-${suffix}-recessed-opening-head`, { edge: 0.07 }), p.concrete);
  }
  emit(box(0.22, 0.62, 0.42, driveX, base + 2.76, 8.28,
    'ed-twin-bay-hanging-divider'), p.red);
  for (const [suffix, x] of [['west', driveX - driveW / 2 + 0.28], ['east', driveX + driveW / 2 - 0.28]]) {
    emit(box(0.64, 3.0, 0.78, x, base + 0.48, 4.02, `ed-chunky-${suffix}-support`,
      { edge: 0.085 }), p.concrete);
  }
  for (const offset of [-0.09, 0.09]) {
    emit(box(0.075, 0.025, 7.4, driveX + offset, base + 0.53, 8.05,
      `ed-lane-divider-${offset < 0 ? 'west' : 'east'}`, { edge: 0.006 }), p.amber);
  }
  for (const x of [driveX - driveW / 2 + 0.12, driveX + driveW / 2 - 0.12]) {
    emit(box(0.22, 0.2, 8.4, x, base + 0.5, 8.4,
      `ed-yellow-curb-${x < driveX ? 'west' : 'east'}`, { edge: 0.025 }), p.amber);
  }
  // Two clean operational lanes: raised thresholds at the bay mouths and one approach arrow
  // per lane. The previous nested arcs/hatching read as spaghetti from the board camera.
  for (const [suffix, laneX] of [
    ['ambulance', driveX - driveW * 0.25],
    ['clear', driveX + driveW * 0.25],
  ]) {
    emit(box(edLaneW * 0.82, 0.13, 0.34, laneX, base + 0.5, 8.62,
      `ed-${suffix}-raised-threshold`, { edge: 0.065 }), p.amber);
    emit(box(0.12, 0.028, 1.02, laneX, base + 0.55, 11.72,
      `ed-${suffix}-approach-arrow-stem`, { edge: 0.005 }), p.amber);
    emit(box(0.11, 0.028, 0.72, laneX - 0.22, base + 0.55, 11.18,
      `ed-${suffix}-approach-arrow-west-head`, { yaw: -0.68, edge: 0.005 }), p.amber);
    emit(box(0.11, 0.028, 0.72, laneX + 0.22, base + 0.55, 11.18,
      `ed-${suffix}-approach-arrow-east-head`, { yaw: 0.68, edge: 0.005 }), p.amber);
  }
  for (const [index, x] of [driveX - driveW / 2 - 0.25, driveX + driveW / 2 + 0.25].entries()) {
    emit(cylinder(0.11, 0.82, x, base + 0.48, 9.05, `ed-bollard-${index + 1}`, 10), p.amber);
  }
  // Only the rear quarter remains beneath the canopy; >75% of the authored vehicle length is
  // unobscured in the front/three-quarter board cameras.
  addAmbulance(emit, p, { x: driveX - driveW * 0.25, y: base + 0.48, z: 9.68 });

  // Public arrival: warm interior behind real glazing, paired doors, deep canopy, steps,
  // accessible ramp, restrained steel handrail and planted concrete boxes.
  const lobbyX = siteW * 0.27;
  const lobbyW = siteW * 0.34;
  const lobbyD = 3.25;
  const lobbyZ = 6.1;
  emit(box(lobbyW, 2.66, lobbyD, lobbyX, base + 0.52, lobbyZ,
    'public-lobby-glazed-volume', { edge: 0.11 }), p.glass);
  const lobbyFront = lobbyZ + lobbyD / 2;
  emit(box(lobbyW * 0.42, 1.56, 0.035, lobbyX - lobbyW * 0.08, base + 0.86,
    lobbyFront - 0.55,
    'public-lobby-warm-interior-wall'), p.amber);
  emit(box(lobbyW * 0.78, 0.1, lobbyD * 0.72, lobbyX, base + 0.62, lobbyZ,
    'public-lobby-warm-floor'), p.amber);
  emit(box(lobbyW - 0.22, 2.48, 0.1, lobbyX, base + 0.63, lobbyFront + 0.08,
    'public-lobby-glazed-front'), p.glass);
  // Warm occupancy is bounded to roughly 27% of the glazed frontage. Counter, desk monitor
  // and paired waiting seats occupy the middle depth layer, not the outer glass plane.
  emit(box(lobbyW * 0.48, 0.52, 0.06, lobbyX - lobbyW * 0.12, base + 0.78,
    lobbyFront - 0.32, 'public-lobby-reception-counter'), p.concrete);
  emit(box(0.56, 0.42, 0.055, lobbyX - lobbyW * 0.05, base + 1.42,
    lobbyFront - 0.3, 'public-lobby-reception-monitor'), p.steel);
  for (const side of [-1, 1]) {
    emit(box(0.62, 0.18, 0.055, lobbyX + side * 0.78, base + 0.86,
      lobbyFront - 0.28, `public-lobby-waiting-seat-${side < 0 ? 'west' : 'east'}`), p.concrete);
    emit(box(0.62, 0.58, 0.055, lobbyX + side * 0.78, base + 0.98,
      lobbyFront - 0.3, `public-lobby-waiting-back-${side < 0 ? 'west' : 'east'}`), p.steel);
  }
  for (const x of [lobbyX - lobbyW / 2, lobbyX - 0.82, lobbyX, lobbyX + 0.82, lobbyX + lobbyW / 2]) {
    emit(box(0.14, 2.6, 0.2, x, base + 0.55, lobbyFront + 0.12,
      `public-lobby-frame-${String(x - lobbyX).replace('.', '-')}`), p.steel);
  }
  emit(box(lobbyW + 0.72, 0.23, lobbyD + 1.0, lobbyX, base + 3.04, lobbyZ + 0.42,
    'public-canopy-dark-coffered-soffit', { edge: 0.075 }), p.steel);
  emit(box(lobbyW + 0.78, 0.36, lobbyD + 0.72, lobbyX, base + 3.25, lobbyZ + 0.32,
    'public-heavy-concrete-canopy-cap', { edge: 0.1 }), p.concrete);
  emit(box(lobbyW + 0.84, 0.42, 0.3, lobbyX, base + 3.12, lobbyZ + lobbyD * 0.5 + 0.78,
    'public-canopy-deep-front-edge', { edge: 0.06 }), p.concrete);
  for (const side of [-1, 1]) {
    emit(box(0.34, 3.08, 0.34, lobbyX + side * (lobbyW / 2 + 0.28), base + 0.51,
      lobbyZ + 1.48, `public-canopy-${side < 0 ? 'west' : 'east'}-column`, { edge: 0.06 }), p.concrete);
  }
  for (const side of [-1, 1]) {
    emit(box(0.08, 0.66, 0.08, lobbyX + side * 0.52, base + 1.22, lobbyFront + 0.2,
      `public-door-pull-${side < 0 ? 'west' : 'east'}`), p.amber);
  }
  for (let i = 0; i < 3; i += 1) {
    emit(box(3.28 + i * 0.26, 0.11, 0.55, lobbyX - 0.28, base + 0.52 + i * 0.08,
      lobbyFront + 0.48 + i * 0.42, `public-entry-step-${i + 1}`, { edge: 0.025 }), p.concrete);
  }
  emit(box(1.42, 0.18, 4.2, 5.78, base + 0.64, 8.8, 'public-access-ramp',
    { pitch: -0.065, edge: 0.035 }), p.concrete);
  for (const side of [-1, 1]) {
    const x = 5.78 + side * 0.62;
    emit(box(0.055, 0.055, 4.0, x, base + 1.15, 8.8,
      `public-ramp-steel-rail-${side < 0 ? 'west' : 'east'}`, { edge: 0.008 }), p.steel);
    for (const z of [7.05, 8.8, 10.55]) {
      emit(cylinder(0.04, 0.62, x, base + 0.62, z,
        `public-ramp-steel-post-${side < 0 ? 'west' : 'east'}-${String(z).replace('.', '-')}`, 8), p.steel);
    }
  }
  for (const [suffix, x] of [['west', 1.0], ['east', 6.22]]) {
    emit(box(1.35, 0.48, 1.15, x, base + 0.48, 10.55,
      `public-planter-${suffix}`, { edge: 0.07 }), p.concrete);
    for (const dx of [-0.32, 0, 0.32]) {
      emit(sphere(0.28, x + dx, base + 1.06, 10.55,
        `public-planter-${suffix}-shrub-${String(dx).replace('.', '-')}`, 8), p.steel);
    }
  }

  // Rear-right six-storey stair/lift tower, secondary to the broad bar and integrated by a
  // supported circulation bridge. Board joints, brick spine and windows break every face.
  const towerW = 4.28;
  const towerD = 5.28;
  const towerX = siteW / 2 - towerW / 2 - 0.35;
  const towerZ = -7.18;
  const towerH = visualStorey * 5.0;
  const towerTop = base + 0.44 + towerH;
  emit(box(towerW, towerH, towerD, towerX, base + 0.44, towerZ,
    'rear-right-lift-tower', { edge: 0.14 }), p.concrete);
  const towerFront = towerZ + towerD / 2;
  emit(box(1.12, towerH * 0.92, 0.18, towerX - 1.15, base + 0.78,
    towerFront + 0.11, 'tower-front-brick-stair-spine'), p.brick);
  for (let floor = 1; floor < 6; floor += 1) {
    const y = base + 0.44 + floor * (towerH / 6);
    emit(box(towerW * 0.96, 0.075, 0.12, towerX, y, towerFront + 0.13,
      `tower-board-joint-${floor}`, { edge: 0.01 }), p.steel);
    emit(box(0.45, 0.78, 0.1, towerX - 1.15, y - 0.5,
      towerFront + 0.22, `tower-stair-slot-${floor}`), floor % 2 ? p.amber : p.glass);
  }
  const crossPanelY = wardTop + 0.02;
  const crossPanelH = Math.max(1.82, towerTop - crossPanelY - 0.24);
  emit(box(towerW * 0.9, crossPanelH, 0.24, towerX, crossPanelY,
    towerFront + 0.16, 'tower-cross-resolved-brick-panel', { edge: 0.07 }), p.brick);
  for (const side of [-1, 1]) {
    emit(box(0.22, crossPanelH + 0.12, 0.36, towerX + side * towerW * 0.43,
      crossPanelY - 0.06, towerFront + 0.22,
      `tower-cross-panel-${side < 0 ? 'west' : 'east'}-frame`), p.concrete);
  }
  emit(box(towerW * 0.92, 0.24, 0.36, towerX, crossPanelY + crossPanelH - 0.18,
    towerFront + 0.22, 'tower-cross-panel-head'), p.concrete);
  const crossBase = wardTop + 0.34;
  emit(box(0.68, 1.58, 0.3, towerX, crossBase, towerFront + 0.46,
    'tower-flat-cross-vertical', { edge: 0.075 }), p.red);
  emit(box(3.28, 0.68, 0.3, towerX, crossBase + 0.45,
    towerFront + 0.46, 'tower-flat-cross-horizontal', { edge: 0.075 }), p.red);
  emit(box(towerW + 0.28, 0.4, towerD + 0.28, towerX, base + 0.44 + towerH - 0.16,
    towerZ, 'tower-blackened-crown', { edge: 0.08 }), p.steel);
  // East-face stair windows and landings articulate the visible three-quarter flank.
  if (mid) {
    const eastX = towerX + towerW / 2;
    for (let floor = 0; floor < 6; floor += 1) {
      const y = base + 0.82 + floor * (towerH / 6);
      emit(box(0.1, 0.76, 1.06, eastX + 0.08, y, towerZ + (floor % 2 ? 0.7 : -0.7),
        `tower-east-stair-window-${floor + 1}`), floor === 4 ? p.amber : p.glass);
      emit(box(0.38, 0.14, 1.54, eastX + 0.18, y - 0.12,
        towerZ + (floor % 2 ? 0.7 : -0.7), `tower-east-landing-${floor + 1}`), p.steel);
    }
  }
  // The rear broad face is a working stair tower, not a blank slab.
  const towerRear = towerZ - towerD / 2;
  emit(box(1.34, towerH * 0.88, 0.16, towerX + 0.38, base + 0.82,
    towerRear - 0.1, 'tower-rear-brick-service-spine'), p.brick);
  for (let floor = 0; floor < 6; floor += 1) {
    const y = base + 0.92 + floor * (towerH / 6);
    emit(box(0.62, 0.72, 0.1, towerX + 0.38, y, towerRear - 0.2,
      `tower-rear-stair-window-${floor + 1}`), floor === 2 || floor === 5 ? p.amber : p.glass);
    emit(box(2.75, 0.09, 0.26, towerX + 0.38, y - 0.16,
      towerRear - 0.23, `tower-rear-landing-line-${floor + 1}`), p.steel);
  }
  // Circulation bridge occupies the structural seam between ward and tower.
  const linkZ = rearZ - 0.36;
  const linkD = 1.16;
  const linkW = 5.35;
  const linkX = towerX - linkW * 0.48;
  const linkY = wardTop + 0.34;
  emit(box(linkW, 1.42, linkD, linkX, linkY, linkZ,
    'supported-circulation-link-glass', { edge: 0.07 }), p.glass);
  emit(box(linkW + 0.3, 0.25, linkD + 0.24, linkX, linkY - 0.16, linkZ,
    'supported-circulation-link-sill'), p.concrete);
  emit(box(linkW + 0.3, 0.28, linkD + 0.24, linkX, linkY + 1.32, linkZ,
    'supported-circulation-link-roof'), p.steel);
  for (let i = 1; i < 6; i += 1) {
    emit(box(0.08, 1.18, 0.1, linkX - linkW / 2 + (linkW * i) / 6,
      linkY + 0.08, linkZ + linkD * 0.48, `circulation-link-mullion-${i}`), p.steel);
  }
  for (const side of [-1, 1]) {
    emit(box(0.32, linkY - (base + 5.48), 0.32, linkX + side * 1.92,
      base + 5.48, linkZ, `circulation-link-support-${side < 0 ? 'west' : 'east'}`,
      { edge: 0.04 }), p.concrete);
  }

  // Large aviation silhouette and three plant scales finish the roof as an operational deck.
  addHelideck(emit, p, {
    x: -2.25, y: wardTop + 0.32, z: wardZ - 0.15, high,
  });
  addPlant(emit, p, { wardTop, wardZ, wardW, high, mid });

  // Rear operations are a complete working service edge, not decorative clutter.
  addServiceYard(emit, p, { siteW, siteD, base, high, mid });

  // Exactly three localized causal grime stories. Each story is a connected union of three
  // irregular value layers over 25-35% of its bounded local field; clean facade separates all
  // three. No family-wide colour wash or repeated speckle remains.
  if (high) {
    // Story 1: runoff begins directly below a boxed parapet scupper and short downpipe.
    const runoffX = 4.2;
    emit(box(0.62, 0.3, 0.46, runoffX, wardTop - 0.12, frontZ + 0.56,
      'grime-zone-1-scupper-source'), p.steel);
    emit(box(0.18, 0.68, 0.2, runoffX, wardTop - 0.58, frontZ + 0.58,
      'grime-zone-1-downpipe-source'), p.steel);
    for (const [layer, dx, scale] of [[1, 0, 1], [2, -0.16, 0.72], [3, 0.14, 0.5]]) {
      emit(patch([
        [-0.36 * scale, 0], [0.3 * scale, 0], [0.24 * scale, -0.34 * scale],
        [0.18 * scale, -0.82 * scale], [-0.18 * scale, -0.94 * scale],
        [-0.3 * scale, -0.62 * scale], [-0.24 * scale, -0.24 * scale],
      ], runoffX + dx, wardTop - 0.8, frontZ + 0.872 + layer * 0.001,
      `grime-zone-1-parapet-runoff-layer-${layer}`), layer === 2 ? p.steel : p.brick);
    }
    // Story 2: a low tire/kerb splash rises from the ambulance-lane outer curb.
    for (const [layer, dx, scale] of [[1, 0, 1], [2, -0.18, 0.72], [3, 0.2, 0.5]]) {
      emit(patch([
        [-0.7 * scale, 0], [0.72 * scale, 0], [0.55 * scale, 0.12 * scale],
        [0.16 * scale, 0.28 * scale], [-0.12 * scale, 0.22 * scale],
        [-0.45 * scale, 0.32 * scale], [-0.66 * scale, 0.1 * scale],
      ], -4.15 + dx, base + 0.52, frontZ + 0.205 + layer * 0.001,
      `grime-zone-2-ed-kerb-tire-splash-layer-${layer}`), layer === 2 ? p.steel : p.brick);
    }
    // Story 3: rear soot begins at a modeled louvred exhaust outlet above the service dock.
    const serviceRearFace = -siteD / 2 + 2.475;
    const exhaustX = -4.78;
    emit(box(1.18, 0.7, 0.22, exhaustX, base + 2.26, serviceRearFace - 0.18,
      'grime-zone-3-rear-louvred-exhaust-source'), p.steel);
    for (let blade = 0; blade < 3; blade += 1) {
      emit(box(0.94, 0.07, 0.06, exhaustX, base + 2.4 + blade * 0.17,
        serviceRearFace - 0.31, `grime-zone-3-exhaust-louvre-blade-${blade + 1}`), p.concrete);
    }
    for (const [layer, dx, scale] of [[1, 0, 1], [2, 0.16, 0.7], [3, -0.15, 0.48]]) {
      emit(patch([
        [-0.46 * scale, 0], [0.42 * scale, 0], [0.5 * scale, 0.26 * scale],
        [0.24 * scale, 0.68 * scale], [-0.14 * scale, 0.8 * scale],
        [-0.4 * scale, 0.58 * scale], [-0.5 * scale, 0.26 * scale],
      ], exhaustX + dx, base + 2.76, serviceRearFace - 0.322 - layer * 0.001,
      `grime-zone-3-rear-exhaust-soot-layer-${layer}`, -1), layer === 2 ? p.steel : p.brick);
    }
  }

  return {
    id: 'brutalist-night-shift',
    materialCount: 6,
    partCount,
    envelope: { width: siteW, depth: siteD, height: towerH + 0.84 },
  };
}
