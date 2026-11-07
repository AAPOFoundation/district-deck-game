import * as THREE from 'three';
import { MaterialLibrary } from '../materials.js';
import {
  applyHospitalMaterialSurface,
  getHospitalTextureAtlas,
} from './texture-atlas.js';

const PREFIX = 'hospital-a-';

function finishGeometry(geometry, name) {
  geometry.name = name;
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();
  MaterialLibrary.ensureUv2(geometry);
  return geometry;
}

function roundedPrism(w, h, d, radius, x, yBase, z, name) {
  const hw = w * 0.5;
  const hd = d * 0.5;
  const r = Math.min(radius, hw * 0.45, hd * 0.45);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.lineTo(hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.lineTo(hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.lineTo(-hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.lineTo(-hw + r, -hd);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: h,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: false,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(x, yBase, z);
  return finishGeometry(geometry, name);
}

function box(w, h, d, x, yBase, z, name, rotation = null) {
  const dimensions = [w, h, d].sort((a, b) => b - a);
  const useOpenBar = dimensions[0] >= dimensions[1] * 4;
  let geometry;
  if (useOpenBar) {
    const source = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    const sourcePosition = source.attributes.position;
    const sourceNormal = source.attributes.normal;
    const sourceUv = source.attributes.uv;
    const longestAxis = w >= h && w >= d ? 0 : h >= d ? 1 : 2;
    const positions = [];
    const uvs = [];
    for (let vertex = 0; vertex < sourcePosition.count; vertex += 3) {
      const capNormal = Math.abs(longestAxis === 0
        ? sourceNormal.getX(vertex)
        : longestAxis === 1 ? sourceNormal.getY(vertex) : sourceNormal.getZ(vertex));
      if (capNormal > 0.9) continue;
      for (let corner = 0; corner < 3; corner += 1) {
        const index = vertex + corner;
        positions.push(sourcePosition.getX(index), sourcePosition.getY(index),
          sourcePosition.getZ(index));
        uvs.push(sourceUv.getX(index), sourceUv.getY(index));
      }
    }
    source.dispose();
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  } else {
    geometry = new THREE.BoxGeometry(w, h, d);
  }
  if (rotation?.x) geometry.rotateX(rotation.x);
  if (rotation?.y) geometry.rotateY(rotation.y);
  if (rotation?.z) geometry.rotateZ(rotation.z);
  geometry.translate(x, yBase + h * 0.5, z);
  return finishGeometry(geometry, name);
}

function slopedCab(w, h, d, slope, x, yBase, z, name) {
  const geometry = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const localX = position.getX(index);
    const localY = position.getY(index);
    if (localX < -w * 0.49 && localY > 0) {
      position.setX(index, localX + slope * (localY / (h * 0.5)));
    }
  }
  position.needsUpdate = true;
  geometry.translate(x, yBase + h * 0.5, z);
  return finishGeometry(geometry, name);
}

function cylinder(radius, height, x, yBase, z, name, segments = 12, axis = 'y') {
  const lowPolySegments = 6;
  const geometry = new THREE.CylinderGeometry(radius, radius, height, lowPolySegments, 1, false);
  if (axis === 'x') geometry.rotateZ(Math.PI * 0.5);
  if (axis === 'z') geometry.rotateX(Math.PI * 0.5);
  geometry.translate(x, yBase + height * 0.5, z);
  return finishGeometry(geometry, name);
}

function horizontalTorus(radius, tube, x, y, z, name, segments = 24) {
  const radialSegments = 8;
  const outer = radius + tube;
  const inner = Math.max(0.01, radius - tube);
  const halfH = tube * 0.62;
  const positions = [];
  const indices = [];
  for (let segment = 0; segment < radialSegments; segment += 1) {
    const angle = (segment / radialSegments) * Math.PI * 2;
    const nextAngle = ((segment + 1) / radialSegments) * Math.PI * 2;
    const base = positions.length / 3;
    for (const [ringRadius, ringY, ringAngle] of [
      [outer, halfH, angle], [outer, halfH, nextAngle],
      [inner, halfH, angle], [inner, halfH, nextAngle],
      [outer, -halfH, angle], [outer, -halfH, nextAngle],
      [inner, -halfH, angle], [inner, -halfH, nextAngle],
    ]) {
      positions.push(x + Math.cos(ringAngle) * ringRadius, y + ringY,
        z + Math.sin(ringAngle) * ringRadius);
    }
    indices.push(
      base, base + 1, base + 2, base + 1, base + 3, base + 2,
      base + 4, base + 6, base + 5, base + 5, base + 6, base + 7,
      base, base + 4, base + 1, base + 1, base + 4, base + 5,
      base + 2, base + 3, base + 6, base + 3, base + 7, base + 6,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return finishGeometry(geometry, name);
}

function panelXY(w, h, x, yBase, z, name, normal = 1) {
  const geometry = new THREE.PlaneGeometry(w, h);
  if (normal < 0) geometry.rotateY(Math.PI);
  geometry.translate(x, yBase + h * 0.5, z);
  return finishGeometry(geometry, name);
}

function irregularPanelXY(w, h, x, yBase, z, name, normal = 1, profile = 0) {
  const profiles = [
    [[-0.5, 0], [0.5, 0], [0.43, 0.76], [0.18, 1], [-0.11, 0.87], [-0.44, 0.96]],
    [[-0.5, 0.08], [0.5, 0], [0.38, 0.94], [0.08, 0.82], [-0.19, 1], [-0.42, 0.72]],
    [[-0.48, 0], [0.46, 0.12], [0.5, 0.83], [0.24, 1], [-0.16, 0.79], [-0.5, 0.91]],
    [[-0.32, 0], [0.34, 0.08], [0.5, 0.44], [0.24, 0.72], [0.09, 1],
      [-0.18, 0.87], [-0.45, 0.55], [-0.38, 0.2]],
  ];
  const outline = profiles[Math.abs(profile) % profiles.length];
  const positions = [];
  const uvs = [];
  for (const [px, py] of outline) {
    positions.push(x + px * w, yBase + py * h, z);
    uvs.push(px + 0.5, py);
  }
  const indices = [];
  for (let corner = 1; corner < outline.length - 1; corner += 1) {
    if (normal > 0) indices.push(0, corner, corner + 1);
    else indices.push(0, corner + 1, corner);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return finishGeometry(geometry, name);
}

function trapezoidPanelXY(w, h, shoulder, x, yBase, z, name, normal = 1) {
  const halfW = w * 0.5;
  const positions = [
    x - halfW, yBase, z,
    x + halfW, yBase, z,
    x + halfW, yBase + h, z,
    x - halfW + shoulder, yBase + h, z,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 1, 1, shoulder / w, 1,
  ], 2));
  geometry.setIndex(normal > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  return finishGeometry(geometry, name);
}

function panelYZ(d, h, x, yBase, z, name, normal = 1) {
  const geometry = new THREE.PlaneGeometry(d, h);
  geometry.rotateY(normal > 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
  geometry.translate(x, yBase + h * 0.5, z);
  return finishGeometry(geometry, name);
}

function panelXZ(w, d, x, y, z, name, rotationY = 0) {
  const geometry = new THREE.PlaneGeometry(w, d);
  geometry.rotateX(-Math.PI * 0.5);
  if (rotationY) geometry.rotateY(rotationY);
  geometry.translate(x, y, z);
  return finishGeometry(geometry, name);
}

function dioramaReveal(outerW, outerH, innerW, innerH, x, yBase,
  rearZ, frontZ, name) {
  const outerLeft = x - outerW * 0.5;
  const outerRight = x + outerW * 0.5;
  const outerBottom = yBase;
  const outerTop = yBase + outerH;
  const innerLeft = x - innerW * 0.5;
  const innerRight = x + innerW * 0.5;
  const innerBottom = yBase + (outerH - innerH) * 0.5;
  const innerTop = innerBottom + innerH;
  const positions = [];
  const indices = [];
  const quad = (a, b, c, d) => {
    const base = positions.length / 3;
    for (const point of [a, b, c, d]) positions.push(...point);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // Four front bezel faces preserve the 0.27 m (8-12 px) reveal on every side.
  quad([outerLeft, outerBottom, frontZ], [outerRight, outerBottom, frontZ],
    [innerRight, innerBottom, frontZ], [innerLeft, innerBottom, frontZ]);
  quad([innerLeft, innerTop, frontZ], [innerRight, innerTop, frontZ],
    [outerRight, outerTop, frontZ], [outerLeft, outerTop, frontZ]);
  quad([outerLeft, outerBottom, frontZ], [innerLeft, innerBottom, frontZ],
    [innerLeft, innerTop, frontZ], [outerLeft, outerTop, frontZ]);
  quad([innerRight, innerBottom, frontZ], [outerRight, outerBottom, frontZ],
    [outerRight, outerTop, frontZ], [innerRight, innerTop, frontZ]);
  // Four deep return faces make the aperture a real inset diorama at orbit angles.
  quad([innerLeft, innerBottom, rearZ], [innerLeft, innerBottom, frontZ],
    [innerLeft, innerTop, frontZ], [innerLeft, innerTop, rearZ]);
  quad([innerRight, innerBottom, frontZ], [innerRight, innerBottom, rearZ],
    [innerRight, innerTop, rearZ], [innerRight, innerTop, frontZ]);
  quad([innerLeft, innerBottom, rearZ], [innerRight, innerBottom, rearZ],
    [innerRight, innerBottom, frontZ], [innerLeft, innerBottom, frontZ]);
  quad([innerLeft, innerTop, frontZ], [innerRight, innerTop, frontZ],
    [innerRight, innerTop, rearZ], [innerLeft, innerTop, rearZ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return finishGeometry(geometry, name);
}

function arrivalLaneMark(w, x, rearZ, courtZ, dropZ, streetZ,
  courtY, streetY, name) {
  const halfW = w * 0.5;
  const stops = [
    [rearZ, courtY], [courtZ, courtY], [dropZ, streetY], [streetZ, streetY],
  ];
  const positions = [];
  const indices = [];
  for (let segment = 0; segment < stops.length - 1; segment += 1) {
    const [z0, y0] = stops[segment];
    const [z1, y1] = stops[segment + 1];
    const base = positions.length / 3;
    positions.push(
      x - halfW, y0, z0,
      x - halfW, y1, z1,
      x + halfW, y1, z1,
      x + halfW, y0, z0,
    );
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return finishGeometry(geometry, name);
}

/**
 * Variant A: a civic trauma stack derived from the left-hand R22 concept model.
 * The caller owns all geometries and shared MaterialLibrary materials pushed here.
 */
export function addCivicTraumaStackHospital(ctx) {
  const {
    push,
    materials,
    bodyW,
    bodyD,
    bodyY,
    bodyH,
    groundY,
    storeyH,
    quality = 'high',
  } = ctx;

  if (typeof push !== 'function' || !materials?.get) {
    throw new TypeError('addCivicTraumaStackHospital requires push and MaterialLibrary');
  }

  let partIndex = 0;
  const named = (label) => `${PREFIX}${label}-${String(partIndex += 1).padStart(3, '0')}`;
  const add = (geometry, material) => push(geometry, material);
  const addBox = (material, label, w, h, d, x, y, z, rotation) => {
    add(box(w, h, d, x, y, z, named(label), rotation), material);
  };
  const addSlopedCab = (material, label, w, h, d, slope, x, y, z) => {
    add(slopedCab(w, h, d, slope, x, y, z, named(label)), material);
  };
  const chamferedSilhouettes = new Set([
    'site-plinth', 'arrival-court', 'rear-service-apron', 'podium-mass', 'podium-cap',
    'ward-tower', 'ward-shadow-sill', 'ward-crown-edge-cap', 'vertical-trauma-spine',
    'public-lobby-frame', 'emergency-pod', 'emergency-pod-cap', 'emergency-bay-canopy',
    'porte-cochere-roof', 'porte-cochere-coffer', 'ambulance-body', 'ambulance-cab',
    'helipad-deck', 'rear-loading-canopy',
  ]);
  const addRound = (material, label, w, h, d, radius, x, y, z) => {
    const geometry = chamferedSilhouettes.has(label)
      ? roundedPrism(w, h, d, radius, x, y, z, named(label))
      : box(w, h, d, x, y, z, named(label));
    add(geometry, material);
  };
  const addCylinder = (material, label, radius, height, x, y, z, segments, axis) => {
    add(cylinder(radius, height, x, y, z, named(label), segments, axis), material);
  };
  const addTorus = (material, label, radius, tube, x, y, z, segments) => {
    add(horizontalTorus(radius, tube, x, y, z, named(label), segments), material);
  };
  const addPanelXY = (material, label, w, h, x, y, z, normal = 1) => {
    add(panelXY(w, h, x, y, z, named(label), normal), material);
  };
  const addIrregularPanelXY = (material, label, w, h, x, y, z, normal = 1, profile = 0) => {
    add(irregularPanelXY(w, h, x, y, z, named(label), normal, profile), material);
  };
  const addTrapezoidPanelXY = (material, label, w, h, shoulder, x, y, z, normal = 1) => {
    add(trapezoidPanelXY(w, h, shoulder, x, y, z, named(label), normal), material);
  };
  const addPanelYZ = (material, label, d, h, x, y, z, normal = 1) => {
    add(panelYZ(d, h, x, y, z, named(label), normal), material);
  };
  const addPanelXZ = (material, label, w, d, x, y, z, rotationY = 0) => {
    add(panelXZ(w, d, x, y, z, named(label), rotationY), material);
  };
  const addDioramaReveal = (material, label, outerW, outerH, innerW, innerH,
    x, y, rearZ, frontZ) => {
    add(dioramaReveal(outerW, outerH, innerW, innerH,
      x, y, rearZ, frontZ, named(label)), material);
  };
  const addArrivalLane = (material, label, w, x, rearZ, courtZ, dropZ, streetZ,
    courtY, streetY) => {
    add(arrivalLaneMark(w, x, rearZ, courtZ, dropZ, streetZ,
      courtY, streetY, named(label)), material);
  };

  // Seven semantic A17 buckets. The modern shared kit no longer adds a generic civic plinth,
  // so envelope materials can carry the atlas without leaking onto clinical props.
  const envelopeBluestone = materials.get('concrete', {
    variant: 'hospital-a17-envelope-bluestone', color: '#5c5f59', roughness: 0.97,
    metalness: 0.0,
  });
  const envelopeIvory = materials.get('concrete', {
    variant: 'hospital-a17-envelope-ivory', color: '#bfb39d', roughness: 0.98,
    metalness: 0.0,
  });
  const clinicalWhite = materials.get('render', {
    variant: 'hospital-a17-clinical-white-props', color: '#ddd8cc', roughness: 0.86,
    metalness: 0.0,
  });
  const clinicalGlass = materials.get('glass', {
    variant: 'hospital-a17-clinical-glass', color: '#142f36', opacity: 0.67,
    roughness: 0.28, metalness: 0.18,
  });
  const lobbyGlass = clinicalGlass;
  const traumaRed = materials.get('brick', {
    variant: 'hospital-a17-trauma-red', color: '#9f3b2e', roughness: 0.96, metalness: 0.0,
  });
  const emergencyOchre = materials.get('painted_metal', {
    variant: 'hospital-a17-emergency-ochre', color: '#d49331', roughness: 0.74, metalness: 0.06,
  });
  if (emergencyOchre.emissive) {
    emergencyOchre.emissive.set('#632806');
    emergencyOchre.emissiveIntensity = 0.42;
  }
  const serviceSteel = materials.get('painted_metal', {
    variant: 'hospital-a17-service-steel', color: '#282f31', roughness: 0.8, metalness: 0.28,
  });
  // Clear inherited family maps before applying the hospital-local atlas exactly once.
  // Clinical white is deliberately map-free: vehicles, interiors, helipad markings and
  // equipment must never inherit the two weathered envelope surfaces.
  for (const material of [envelopeBluestone, envelopeIvory, clinicalWhite]) {
    material.map = null;
    material.aoMap = null;
    material.normalMap = null;
    material.roughnessMap = null;
    material.bumpMap = null;
    material.displacementMap = null;
    material.needsUpdate = true;
  }

  const siteW = Math.min(14.4, Math.max(14.1, (bodyW || 13.8) * 1.04));
  const siteD = Math.min(30.2, Math.max(29.8, (bodyD || 27.2) * 1.08));
  const sH = Math.max(2.8, Math.min(3.5, storeyH || 3.2));
  const baseY = Number.isFinite(groundY) ? groundY : 0;
  const inheritedY = Number.isFinite(bodyY) ? bodyY : baseY + 0.28;
  const podiumY = Math.max(baseY + 0.22, inheritedY - 0.16);
  const podiumH = sH * 1.9;
  const podiumW = siteW - 0.92;
  const podiumD = siteD * 0.61;
  const podiumZ = -1.35;
  const lowerPodiumH = podiumH * 0.53;
  const upperPodiumH = podiumH * 0.49;
  // The second tier is deliberately pulled back on three sides. At board scale this reads
  // as a built-over civic campus, not one dark extrusion with decorative stripes.
  const upperPodiumW = podiumW * 0.78;
  const upperPodiumD = podiumD * 0.73;
  const upperPodiumZ = podiumZ - 0.9;
  const upperPodiumY = podiumY + podiumH * 0.51;
  // A10 board silhouette: perspective and the deep vertical bays visually narrow the
  // slab, so its authored ratio is deliberately broader than the measured 0.95 target.
  const towerW = podiumW * 0.85;
  const towerH = towerW / 1.15;
  const towerD = Math.min(10.1, podiumD - 5.4);
  const towerZ = -2.45;
  const towerY = podiumY + podiumH - 0.08;
  const roofY = towerY + towerH;
  const frontEdge = siteD * 0.5;
  const rearEdge = -frontEdge;

  // Three compact shader-local wear stories are fixed to modeled sources. They alter only
  // the two envelope buckets; props, vehicle, cross, helipad, interiors and rails stay clean.
  const atlas = getHospitalTextureAtlas(materials);
  const hospitalWear = {
    seed: 0.417,
    zones: [
      {
        kind: 'baseSplash', center: [-podiumW * 0.27, podiumY + 0.66, frontEdge - 4.0],
        radius: [2.45, 0.72, 0.32], normal: [0, 0, 1],
        tint: [0.28, 0.26, 0.23], strength: 0.09, roughness: 0.035, irregularity: 0.62,
      },
      {
        kind: 'parapetRunoff', center: [-towerW * 0.42, roofY - 1.35,
          towerZ + towerD * 0.5 + 0.08],
        radius: [0.62, 1.42, 0.28], normal: [0, 0, 1],
        tint: [0.3, 0.28, 0.25], strength: 0.075, roughness: 0.04, irregularity: 0.68,
      },
      {
        kind: 'serviceExhaust', center: [towerW * 0.235, roofY - 1.45,
          towerZ - towerD * 0.5 - 0.08],
        radius: [0.92, 1.28, 0.32], normal: [0, 0, -1],
        tint: [0.2, 0.19, 0.18], strength: 0.085, roughness: 0.045, irregularity: 0.58,
      },
    ],
  };
  applyHospitalMaterialSurface(envelopeBluestone, atlas, 'agedConcrete', hospitalWear);
  applyHospitalMaterialSurface(envelopeIvory, atlas, 'renderedMasonry', hospitalWear);

  // One-piece miniature tray, curbed arrival court, and restrained ochre wayfinding.
  addRound(envelopeBluestone, 'site-plinth', siteW, 0.24, siteD, 0.48, 0, baseY, 0);
  addRound(serviceSteel, 'arrival-court', siteW - 1.0, 0.1, 12.4, 0.55,
    0, baseY + 0.23, frontEdge - 6.25);
  addRound(serviceSteel, 'rear-service-apron', siteW - 1.3, 0.07, siteD * 0.19, 0.35,
    0, baseY + 0.23, rearEdge + siteD * 0.105 + 0.24);
  for (const side of [-1, 1]) {
    addBox(envelopeBluestone, 'court-curb', 0.28, 0.18, siteD * 0.29,
      side * (siteW * 0.5 - 0.42), baseY + 0.24, frontEdge - siteD * 0.17);
  }
  for (const xOffset of [-2.45, 2.35]) {
    // Flush road markings, not kerbs: the long exposed run survives both ownership
    // elevations while continuing beneath the ambulance without reducing bay clearance.
    // The shared kit's unavoidable 0.46 m civic datum is outside this module, so the
    // markings seat 0.01 m above that finished plane instead of disappearing inside it.
    addArrivalLane(emergencyOchre, 'emergency-parallel-lane-bar', 0.26,
      -podiumW * 0.27 + xOffset, frontEdge - 12.7, frontEdge - 0.55,
      frontEdge - 0.25, frontEdge - 0.1, baseY + 0.345, baseY + 0.255);
  }

  // Heavy dark podium with a projecting mineral cap and expressed block courses.
  addRound(envelopeBluestone, 'podium-mass', podiumW, lowerPodiumH, podiumD,
    0.34, 0, podiumY, podiumZ);
  addRound(envelopeBluestone, 'podium-cap', upperPodiumW, upperPodiumH, upperPodiumD,
    0.28, 0, upperPodiumY, upperPodiumZ);
  for (let course = 1; course < 5; course += 1) {
    const courseY = podiumY + (podiumH * course) / 5;
    const upper = courseY >= upperPodiumY;
    const tierW = upper ? upperPodiumW : podiumW;
    const tierD = upper ? upperPodiumD : podiumD;
    const tierZ = upper ? upperPodiumZ : podiumZ;
    addBox(serviceSteel, 'podium-course-front', tierW - 0.38, 0.13, 0.2,
      0, courseY, tierZ + tierD * 0.5 + 0.08);
    for (const side of [-1, 1]) {
      addBox(serviceSteel, 'podium-course-side', 0.2, 0.13, tierD - 0.38,
        side * (tierW * 0.5 + 0.08), courseY, tierZ);
    }
    if (quality === 'high') {
      addBox(serviceSteel, 'podium-course-rear', tierW - 0.38, 0.13, 0.2,
        0, courseY, tierZ - tierD * 0.5 - 0.08);
    }
  }
  // Staggered, storey-scale masonry joints read as construction in greyscale rather than
  // a flat shader. Each joint terminates at a course, avoiding a decorative line grid.
  const podiumCourseH = podiumH / 5;
  for (let course = 0; course < 5; course += 1) {
    const y = podiumY + course * podiumCourseH + podiumCourseH * 0.1;
    const upper = course >= 3;
    const tierW = upper ? upperPodiumW : podiumW;
    const tierD = upper ? upperPodiumD : podiumD;
    const tierZ = upper ? upperPodiumZ : podiumZ;
    const frontXs = course % 2 === 0
      ? [-0.33, 0, 0.33]
      : [-0.17, 0.17];
    for (const xScale of frontXs) {
      addPanelXY(serviceSteel, 'podium-block-joint-front', 0.11, podiumCourseH * 0.8,
        xScale * tierW, y, tierZ + tierD * 0.5 + 0.285);
    }
    const sideZs = course % 2 === 0 ? [-0.28, 0.08, 0.34] : [-0.4, -0.1, 0.24];
    for (const side of [-1, 1]) {
      for (const zScale of sideZs) {
        addPanelYZ(serviceSteel, 'podium-block-joint-side', 0.11, podiumCourseH * 0.8,
          side * (tierW * 0.5 + 0.285), y, tierZ + tierD * zScale, side);
      }
    }
  }
  // Two occupied levels remain legible even where the arrival volumes do not cover them.
  for (const side of [-1, 1]) {
    for (const level of [0, 1]) {
      const y = podiumY + 0.62 + level * sH * 0.78;
      const tierW = level === 0 ? podiumW : upperPodiumW;
      const tierD = level === 0 ? podiumD : upperPodiumD;
      const tierZ = level === 0 ? podiumZ : upperPodiumZ;
      for (const xScale of [0.19, 0.37]) {
        addPanelXY(clinicalGlass, 'podium-occupied-window', tierW * 0.105, sH * 0.4,
          side * tierW * xScale, y, tierZ + tierD * 0.5 + 0.18);
      }
      addBox(envelopeBluestone, 'podium-side-window-reveal', 0.18, sH * 0.48, tierD * 0.76,
        side * (tierW * 0.5 - 0.06), y - 0.1, tierZ);
      for (const zScale of [-0.3, 0, 0.3]) {
        const z = tierZ + tierD * zScale;
        const occupied = (level * 5 + Math.round((zScale + 0.3) * 10)) % 7 === 3;
        if (occupied) {
          addPanelYZ(emergencyOchre, 'podium-side-occupied-interior', tierD * 0.07,
            sH * 0.28, side * (tierW * 0.5 + 0.045), y + sH * 0.08,
            z + tierD * 0.026, side);
        }
        addPanelYZ(clinicalGlass, 'podium-side-window', tierD * 0.115, sH * 0.4,
          side * (tierW * 0.5 + 0.13), y, z, side);
      }
    }
  }

  // Six-storey pale ward block. Deep glass is inset behind structural piers and floor lips.
  addRound(envelopeIvory, 'ward-tower', towerW, towerH, towerD, 0.3, 0, towerY, towerZ);
  addRound(envelopeBluestone, 'ward-shadow-sill', towerW + 0.32, 0.34, towerD + 0.3, 0.2,
    0, towerY - 0.1, towerZ);
  addRound(envelopeBluestone, 'ward-crown-edge-cap', towerW + 0.26, 0.34, towerD + 0.24, 0.22,
    0, towerY + towerH - 0.1, towerZ);
  const facadeZ = towerZ + towerD * 0.5 + 0.04;
  const rearZ = towerZ - towerD * 0.5 - 0.04;
  const spineW = 0.72;
  // The quiet identity field is capped at fifteen percent of the slab. Its projected
  // 1.5 m cross reads at 49-53 px in the fixed 1500 px ownership camera.
  const identityPanelW = Math.min(1.68, towerW * 0.148);
  const identityBayW = 2.55;
  const bayFieldLeft = -towerW * 0.5 + 0.46;
  // Leave an actual strip of wall between the punched wards, identity core, and red
  // services return. This keeps the cross on a clean clinical bay at street scale.
  const bayFieldW = towerW - identityBayW - spineW - 0.82;
  const bayGap = 0.24;
  const bayW = (bayFieldW - bayGap * 4) / 5;
  const layoutBays = (left, fieldWidth, gap, factors) => {
    const usableWidth = fieldWidth - gap * (factors.length - 1);
    const factorTotal = factors.reduce((sum, factor) => sum + factor, 0);
    let cursor = left;
    return factors.map((factor) => {
      const width = usableWidth * factor / factorTotal;
      const bay = { x: cursor + width * 0.5, width };
      cursor += width + gap;
      return bay;
    });
  };
  const frontBays = layoutBays(bayFieldLeft, bayFieldW, bayGap,
    [1.08, 0.9, 1.04, 0.92, 1.06]);
  const rearFieldLeft = -towerW * 0.5 + 0.44;
  const rearFieldW = towerW - 0.88;
  const rearBays = layoutBays(rearFieldLeft, rearFieldW, bayGap,
    [0.94, 1.08, 0.9, 1.1, 0.98]);
  const floorStep = towerH / 6;
  const glassH = floorStep * 0.42;
  const occupiedRear = new Set(['0-4', '1-1', '1-5', '2-3', '3-0', '3-4', '4-2']);
  const occupiedSide = new Set(['-1-0-0', '-1-2-2', '-1-4-1', '-1-5-0',
    '1-1-1', '1-2-0', '1-3-2', '1-5-1']);
  const privacyProfile = (bay, floor, salt = 0) => ({
    material: emergencyOchre,
    mode: (bay * 3 + floor * 5 + salt) % 2,
  });
  const towerFrontFaceZ = facadeZ - 0.04;
  const tableauWarmZ = towerFrontFaceZ + 0.04;
  const tableauSilhouetteZ = towerFrontFaceZ + 0.24;
  const tableauGlassZ = towerFrontFaceZ + 0.44;
  const addFrontRoomSilhouette = (story, x, y, w, h) => {
    // Each cohesive clinical scene occupies 35-55% of its aperture. Curved/angled bodies,
    // equipment and furniture overlap as one readable room tableau rather than isolated
    // card-like glyphs. Every component stays on the separate middle silhouette plane.
    const z = tableauSilhouetteZ;
    if (story === 'curtain-chair') {
      addIrregularPanelXY(serviceSteel, 'room-privacy-curtain', w * 0.3, h * 0.82,
        x - w * 0.33, y + h * 0.08, z, 1, 1);
      addTrapezoidPanelXY(serviceSteel, 'room-exam-chair-back', w * 0.55, h * 0.56,
        w * 0.1, x + w * 0.17, y + h * 0.23, z);
      addPanelXY(clinicalWhite, 'room-exam-chair-cushion', w * 0.5, h * 0.18,
        x + w * 0.14, y + h * 0.14, z);
      addTrapezoidPanelXY(serviceSteel, 'room-exam-chair-footrest', w * 0.32, h * 0.14,
        w * 0.06, x + w * 0.29, y + h * 0.07, z);
    } else if (story === 'bed-patient') {
      addTrapezoidPanelXY(serviceSteel, 'room-raised-hospital-bed', w * 0.86, h * 0.46,
        w * 0.11, x, y + h * 0.08, z);
      addPanelXY(serviceSteel, 'room-bed-headboard', w * 0.12, h * 0.56,
        x - w * 0.42, y + h * 0.08, z);
      addIrregularPanelXY(clinicalWhite, 'room-reclining-patient-body', w * 0.52, h * 0.28,
        x + w * 0.08, y + h * 0.37, z, 1, 2);
      addIrregularPanelXY(clinicalWhite, 'room-reclining-patient-head', w * 0.19, h * 0.23,
        x - w * 0.23, y + h * 0.4, z, 1, 3);
    } else if (story === 'desk-monitor') {
      addPanelXY(serviceSteel, 'room-vitals-desk', w * 0.85, h * 0.15,
        x, y + h * 0.17, z);
      addTrapezoidPanelXY(serviceSteel, 'room-vitals-monitor-housing', w * 0.54, h * 0.55,
        w * 0.05, x + w * 0.2, y + h * 0.35, z);
      addPanelXY(clinicalWhite, 'room-vitals-waveform-screen', w * 0.35, h * 0.24,
        x + w * 0.2, y + h * 0.51, z);
      addIrregularPanelXY(serviceSteel, 'room-clinician-torso', w * 0.28, h * 0.5,
        x - w * 0.25, y + h * 0.18, z, 1, 3);
      addIrregularPanelXY(clinicalWhite, 'room-clinician-head', w * 0.18, h * 0.2,
        x - w * 0.25, y + h * 0.66, z, 1, 0);
    } else if (story === 'trolley') {
      addTrapezoidPanelXY(serviceSteel, 'room-instrument-trolley-top', w * 0.84, h * 0.16,
        w * 0.06, x, y + h * 0.55, z);
      addPanelXY(serviceSteel, 'room-instrument-trolley-shelf', w * 0.72, h * 0.12,
        x, y + h * 0.23, z);
      for (const offset of [-0.3, 0.3]) {
        addPanelXY(serviceSteel, 'room-instrument-trolley-leg', w * 0.1, h * 0.48,
          x + w * offset, y + h * 0.15, z);
      }
      addIrregularPanelXY(clinicalWhite, 'room-sterile-instrument-tray', w * 0.4, h * 0.26,
        x + w * 0.12, y + h * 0.68, z, 1, 0);
    } else if (story === 'iv-stand') {
      addTrapezoidPanelXY(serviceSteel, 'room-infusion-chair-back', w * 0.56, h * 0.62,
        w * 0.07, x - w * 0.24, y + h * 0.2, z);
      addPanelXY(clinicalWhite, 'room-infusion-chair-seat', w * 0.5, h * 0.18,
        x - w * 0.18, y + h * 0.13, z);
      addPanelXY(serviceSteel, 'room-infusion-pole', w * 0.09, h * 0.82,
        x + w * 0.28, y + h * 0.08, z);
      addPanelXY(serviceSteel, 'room-infusion-hook', w * 0.35, h * 0.09,
        x + w * 0.2, y + h * 0.78, z);
      addIrregularPanelXY(clinicalWhite, 'room-infusion-bag', w * 0.25, h * 0.32,
        x + w * 0.16, y + h * 0.48, z, 1, 2);
      addTrapezoidPanelXY(serviceSteel, 'room-infusion-wheeled-base', w * 0.45, h * 0.1,
        w * 0.08, x + w * 0.28, y + h * 0.05, z);
    }
  };
  const frontRoomStories = new Map([
    ['0-1', 'curtain-chair'], ['1-3', 'bed-patient'], ['2-0', 'desk-monitor'],
    ['3-2', 'trolley'], ['4-5', 'iv-stand'],
  ]);
  for (let bay = 0; bay < 5; bay += 1) {
    const { x, width: frontBayW } = frontBays[bay];
    const { x: rearX, width: rearBayW } = rearBays[bay];
    for (let floor = 0; floor < 6; floor += 1) {
      const y = towerY + floor * floorStep + floorStep * 0.29;
      const roomKey = `${bay}-${floor}`;
      const story = frontRoomStories.get(roomKey);
      const apertureScale = story
        ? 1
        : [0.58, 0.68, 0.54, 0.64, 0.6][(bay + floor * 2) % 5];
      const rearScale = [0.64, 0.55, 0.68, 0.57, 0.61][(bay * 2 + floor) % 5];
      const frontWindowW = story ? 1.68 : frontBayW * apertureScale;
      const frontWindowH = story ? 1.08 : glassH;
      const frontWindowY = story ? y - floorStep * 0.1 : y;
      const rearWindowW = rearBayW * rearScale;
      if (story) {
        // A hollow eight-face bezel and four true return planes run from the warm rear
        // wall to the glass line. The 0.27 m border projects to 8-12 px on every side.
        addDioramaReveal(envelopeBluestone, 'clinical-tableau-reveal', frontWindowW + 0.54,
          frontWindowH + 0.54, frontWindowW, frontWindowH, x, frontWindowY - 0.27,
          tableauWarmZ - 0.01, tableauGlassZ + 0.015);
      } else {
        addPanelXY(envelopeBluestone, 'ward-window-reveal-front', frontWindowW + 0.5,
          glassH + 0.46, x, y - 0.23, facadeZ + 0.015);
      }
      if (story) {
        addPanelXY(emergencyOchre, 'clinical-tableau-warm-room-wall',
          frontWindowW, frontWindowH, x, frontWindowY, tableauWarmZ);
        addPanelXZ(clinicalWhite, 'clinical-tableau-room-floor', frontWindowW,
          tableauGlassZ - tableauWarmZ, x, frontWindowY + 0.015,
          (tableauWarmZ + tableauGlassZ) * 0.5);
        addFrontRoomSilhouette(story, x, frontWindowY, frontWindowW, frontWindowH);
      }
      addPanelXY(clinicalGlass, 'ward-window-front', frontWindowW, frontWindowH,
        x, frontWindowY, story ? tableauGlassZ : facadeZ + 0.085);
      if (quality !== 'low') {
        addPanelXY(envelopeBluestone, 'ward-window-reveal-rear', rearWindowW + 0.5,
          glassH + 0.46, rearX, y - 0.23, rearZ - 0.015, -1);
        if (occupiedRear.has(`${bay}-${floor}`)) {
          const privacy = privacyProfile(bay, floor, 1);
          addPanelXY(privacy.material, 'ward-warm-full-pane-rear',
            rearWindowW, glassH,
            rearX, y, rearZ - 0.031, -1);
        }
        addPanelXY(clinicalGlass, 'ward-window-rear', rearWindowW, glassH,
          rearX, y, rearZ - 0.055, -1);
      }
    }
    addBox(envelopeIvory, 'ward-deep-pier', 0.28, towerH - 0.44, 0.44,
      x - frontBayW * 0.5 - bayGap * 0.5, towerY + 0.12, facadeZ + 0.1);
  }
  addBox(envelopeIvory, 'ward-deep-pier-end', 0.32, towerH - 0.44, 0.44,
    bayFieldLeft + bayFieldW + 0.08, towerY + 0.12, facadeZ + 0.1);
  for (let floor = 1; floor < 6; floor += 1) {
    const y = towerY + floor * floorStep - 0.13;
    addBox(envelopeBluestone, 'ward-floor-lip-front', bayFieldW + 0.3, 0.23, 0.32,
      bayFieldLeft + bayFieldW * 0.5, y, facadeZ + 0.06);
    for (const side of [-1, 1]) {
      addPanelYZ(serviceSteel, 'ward-floor-joint-side', towerD - 0.5, 0.18,
        side * (towerW * 0.5 + 0.2), y + 0.03, towerZ, side);
    }
    if (quality === 'high') {
      addBox(envelopeBluestone, 'ward-floor-lip-rear', towerW - 0.5, 0.18, 0.44,
        0, y, rearZ - 0.08);
    }
  }

  // Side punched windows give the tower true occupied depth at orbit angles.
  if (quality !== 'low') {
    for (const side of [-1, 1]) {
      for (const [sideIndex, zOffset] of [-0.29, 0.3].entries()) {
        const z = towerZ + zOffset * towerD;
        const sideBayD = towerD * [0.15, 0.18, 0.145][sideIndex];
        for (let floor = 0; floor < 6; floor += 1) {
          const y = towerY + floor * floorStep + floorStep * 0.29;
          const sideWindowD = sideBayD
            * [0.54, 0.66, 0.57, 0.7, 0.52, 0.62][(floor + sideIndex) % 6];
          addPanelYZ(envelopeBluestone, 'ward-window-reveal-side', sideWindowD + 0.5,
            glassH + 0.46, side * (towerW * 0.5 + 0.015), y - 0.23, z, side);
          if (occupiedSide.has(`${side}-${floor}-${sideIndex}`)) {
            const privacy = privacyProfile(sideIndex, floor, side < 0 ? 2 : 4);
            addPanelYZ(privacy.material, 'ward-warm-full-pane-side',
              sideWindowD, glassH,
              side * (towerW * 0.5 + 0.031), y,
              z, side);
          }
          addPanelYZ(clinicalGlass, 'ward-window-side', sideWindowD, glassH,
            side * (towerW * 0.5 + 0.055), y, z, side);
        }
      }
    }
  }

  // Authored precast joints break the remaining pale returns.
  // The side elevations already carry deep apertures and floor joints; the four former
  // vertical return joints are spent on the identity bay below, where blank-field risk is higher.
  for (const xScale of [-0.31, 0, 0.31]) {
    addPanelXY(serviceSteel, 'ward-precast-joint-rear', 0.12, towerH * 0.9,
      towerW * xScale, towerY + towerH * 0.05, rearZ - 0.185, -1);
  }
  // The source hardware stays modeled; its soft runoff is supplied only by the bounded
  // atlas wear zone above, with no hard-edged stain card on the facade.
  const drainX = -towerW * 0.42;
  addBox(serviceSteel, 'parapet-scupper', 0.54, 0.38, 0.52,
    drainX, roofY - 0.26, facadeZ + 0.05);
  addBox(serviceSteel, 'parapet-downpipe', 0.22, towerH * 0.16, 0.24,
    drainX, roofY - towerH * 0.16 - 0.27, facadeZ + 0.06);
  if (quality === 'high') {
    // The rear outlet likewise remains the physical cause for its soft atlas exhaust story.
    const exhaustX = towerW * 0.235;
    addBox(serviceSteel, 'rear-exhaust-outlet', 0.86, 0.48, 0.58,
      exhaustX, roofY - 0.56, rearZ - 0.28);
    for (let blade = 0; blade < 3; blade += 1) {
      addPanelXY(clinicalWhite, 'rear-exhaust-louvre-blade', 0.68, 0.08,
        exhaustX, roofY - 0.5 + blade * 0.13, rearZ - 0.585, -1);
    }
  }

  // Rust-red services spine is a separate return; the cross belongs wholly to a quiet
  // warm-precast identity panel with joints and gravity-led staining.
  const spineX = towerW * 0.5 - spineW * 0.56;
  addRound(traumaRed, 'vertical-trauma-spine', spineW, towerH + 0.28, towerD + 0.38,
    0.16, spineX, towerY - 0.08, towerZ + 0.06);
  for (let floor = 0; floor < 6; floor += 1) {
    addPanelXY(clinicalGlass, 'spine-slot', 0.26, floorStep * 0.38, spineX,
      towerY + floor * floorStep + floorStep * 0.33, facadeZ + 0.435);
  }
  const panelX = towerW * 0.5 - spineW - identityBayW * 0.5 - 0.04;
  const panelY = towerY + towerH * 0.14;
  const panelH = towerH * 0.7;
  // A 2.55 m (roughly 91 px) dark mineral/metal bay completely masks the pale shell.
  // Both field planes sit in front of the tower; the two asymmetric 0.28-0.30 m cuts
  // project to 8-12 px and remain darker than the clean mineral inset.
  addPanelXY(serviceSteel, 'identity-bay-deep-shadow', identityBayW, panelH + 0.26,
    panelX, panelY - 0.13, towerFrontFaceZ + 0.05);
  addPanelXY(envelopeBluestone, 'identity-bay-recessed-mineral-plane',
    identityBayW - 0.16, panelH,
    panelX, panelY, towerFrontFaceZ + 0.06);
  addIrregularPanelXY(serviceSteel, 'identity-irregular-shadow-cut', identityBayW * 0.76, 0.28,
    panelX - identityBayW * 0.04, panelY + panelH * 0.18,
    towerFrontFaceZ + 0.065, 1, 1);
  addIrregularPanelXY(serviceSteel, 'identity-irregular-shadow-cut', identityBayW * 0.68, 0.3,
    panelX + identityBayW * 0.07, panelY + panelH * 0.76,
    towerFrontFaceZ + 0.065, 1, 3);
  const crossW = identityPanelW * 0.9;
  const crossStemH = panelH * 0.46;
  const crossBaseY = panelY + panelH * 0.24;
  addBox(traumaRed, 'cross-vertical', crossW * 0.3, crossStemH, 0.18,
    panelX, crossBaseY, facadeZ + 0.23);
  addBox(traumaRed, 'cross-horizontal', crossW, crossStemH * 0.3, 0.18,
    panelX, crossBaseY + crossStemH * 0.35, facadeZ + 0.23);

  // Separate glazed public lobby and a low red/ochre emergency department pod.
  const lobbyW = podiumW * 0.48;
  const lobbyX = podiumW * 0.24;
  const lobbyZ = podiumZ + podiumD * 0.5 + 1.8;
  addRound(envelopeBluestone, 'public-lobby-frame', lobbyW + 0.55, 0.46, 3.75,
    0.25, lobbyX, podiumY + podiumH * 0.7, lobbyZ);
  // Warm back wall, inner curtain plane, and projecting vestibule are three distinct
  // depth reads. Amber remains behind glass rather than becoming opaque facade cards.
  addBox(emergencyOchre, 'public-lobby-warm-setback-wall', lobbyW - 0.55, podiumH * 0.58, 0.08,
    lobbyX, podiumY + 0.5, lobbyZ + 0.28);
  addBox(emergencyOchre, 'public-lobby-interior-ceiling', lobbyW - 0.7, 0.24, 1.4,
    lobbyX, podiumY + podiumH * 0.64, lobbyZ + 1.34);
  addPanelXZ(emergencyOchre, 'public-lobby-interior-floor', lobbyW - 0.62, 2.48,
    lobbyX, podiumY + 0.4, lobbyZ + 1.48);
  addBox(lobbyGlass, 'public-lobby-inner-glass', lobbyW - 0.35, podiumH * 0.66, 0.12,
    lobbyX, podiumY + 0.42, lobbyZ + 1.72);
  addPanelXY(clinicalWhite, 'public-lobby-reception-counter',
    lobbyW * 0.42, podiumH * 0.18,
    lobbyX - lobbyW * 0.12, podiumY + 0.48, lobbyZ + 1.54);
  addPanelXY(serviceSteel, 'public-lobby-reception-worktop', lobbyW * 0.48, 0.2,
    lobbyX - lobbyW * 0.12, podiumY + podiumH * 0.18, lobbyZ + 1.56);
  addPanelXY(serviceSteel, 'public-lobby-chair-back', lobbyW * 0.12, podiumH * 0.22,
    lobbyX + lobbyW * 0.27, podiumY + 0.46, lobbyZ + 1.5);
  addPanelXY(clinicalWhite, 'public-lobby-chair-seat', lobbyW * 0.17, podiumH * 0.08,
    lobbyX + lobbyW * 0.27, podiumY + podiumH * 0.17, lobbyZ + 1.52);
  for (const mullion of [-0.38, -0.13, 0.13, 0.38]) {
    addBox(serviceSteel, 'public-lobby-mullion', 0.12, podiumH * 0.68, 0.22,
      lobbyX + mullion * lobbyW, podiumY + 0.38, lobbyZ + 2.02);
  }
  const vestibuleW = lobbyW * 0.58;
  const vestibuleD = 1.35;
  const vestibuleZ = lobbyZ + 2.42;
  addRound(serviceSteel, 'public-lobby-vestibule-roof', vestibuleW + 0.34, 0.26,
    vestibuleD + 0.16, 0.16, lobbyX, podiumY + podiumH * 0.64, vestibuleZ);
  for (const side of [-1, 1]) {
    addBox(clinicalGlass, 'public-lobby-vestibule-side-glass', 0.09,
      podiumH * 0.5, vestibuleD, lobbyX + side * vestibuleW * 0.5,
      podiumY + 0.32, vestibuleZ);
    addBox(serviceSteel, 'public-lobby-vestibule-corner-post', 0.16,
      podiumH * 0.54, 0.16, lobbyX + side * vestibuleW * 0.5,
      podiumY + 0.28, vestibuleZ + vestibuleD * 0.5);
  }
  addBox(clinicalGlass, 'public-lobby-vestibule-front-glass', vestibuleW - 0.2,
    podiumH * 0.5, 0.1, lobbyX, podiumY + 0.32, vestibuleZ + vestibuleD * 0.5);
  addBox(serviceSteel, 'public-lobby-door-left-stile', 0.14, podiumH * 0.45, 0.12,
    lobbyX - 0.19, podiumY + 0.32, vestibuleZ + vestibuleD * 0.5 + 0.08);
  addBox(serviceSteel, 'public-lobby-door-right-stile', 0.14, podiumH * 0.45, 0.12,
    lobbyX + 0.19, podiumY + 0.32, vestibuleZ + vestibuleD * 0.5 + 0.08);
  addBox(emergencyOchre, 'public-lobby-door-transom', vestibuleW + 0.12, 0.2, 0.2,
    lobbyX, podiumY + podiumH * 0.57, vestibuleZ + vestibuleD * 0.5 + 0.05);
  for (let step = 0; step < 3; step += 1) {
    addRound(envelopeBluestone, 'public-lobby-arrival-step',
      lobbyW * (0.58 + step * 0.08),
      0.13, 0.54 + step * 0.36, 0.12, lobbyX, baseY + 0.28 + step * 0.1,
      lobbyZ + 2.25 + step * 0.24);
  }

  const edW = podiumW * 0.46;
  const edX = -podiumW * 0.27;
  const edH = podiumH * 0.78;
  const edZ = lobbyZ + 0.2;
  const edD = 5.1;
  const edFront = edZ + edD * 0.5;
  // The red pod is a deep rear volume rather than a solid facade card. Its projecting
  // roof and long jambs form a genuinely open treatment bay ahead of the warm back wall.
  const edRearD = 3.0;
  const edRearZ = edZ - edD * 0.5 + edRearD * 0.5;
  addRound(traumaRed, 'emergency-pod', edW, edH, edRearD,
    0.34, edX, podiumY + 0.04, edRearZ);
  addRound(emergencyOchre, 'emergency-pod-cap', edW + 0.3, 0.36, edD + 0.24, 0.28,
    edX, podiumY + edH - 0.02, edZ);
  addBox(emergencyOchre, 'emergency-bay-warm-floor', edW * 0.74, 0.24, 2.2,
    edX, podiumY + 0.18, edFront - 0.78);
  addPanelXY(emergencyOchre, 'emergency-bay-lit-interior', edW * 0.56, edH * 0.48,
    edX - edW * 0.06, podiumY + 0.4, edFront - 2.42);
  addPanelXZ(clinicalWhite, 'emergency-bay-ceiling-light', edW * 0.52, 1.7,
    edX - edW * 0.04, podiumY + edH * 0.61, edFront - 0.92);
  addPanelXY(lobbyGlass, 'emergency-bay-mouth-glass', edW * 0.52, edH * 0.49,
    edX, podiumY + 0.34, edFront + 0.16);
  for (const side of [-1, 1]) {
    addBox(emergencyOchre, 'emergency-bay-jamb', 0.34, edH * 0.7, 2.2,
      edX + side * edW * 0.36, podiumY + 0.14, edFront - 0.82);
    addBox(lobbyGlass, 'emergency-side-return-glass', 0.1, edH * 0.42, 2.1,
      edX + side * (edW * 0.5 + 0.08), podiumY + 0.46, edFront - 0.95);
  }
  addRound(emergencyOchre, 'emergency-bay-canopy', edW * 0.9, 0.34, 1.45,
    0.2, edX, podiumY + edH * 0.72, edFront + 0.54);
  // Bonded brick bed courses make the ED read as masonry, not a red painted card. The
  // family normal map supplies perpendicular joints; the authored beds survive board scale.
  const edBrickFaceZ = edRearZ + edRearD * 0.5 + 0.19;
  for (let course = 0; course < 5; course += 1) {
    const courseY = podiumY + 0.5 + course * edH * 0.14;
    addBox(envelopeBluestone, 'emergency-brick-bed-joint', edW * 0.88, 0.1, 0.1,
      edX, courseY, edBrickFaceZ);
  }
  // The apron curb and court supply the causal contact for the atlas-only base splash;
  // no opaque stain plate is layered over the ED or ambulance.

  // Two leaves share one civic datum while a full-scale air gap preserves public/ED
  // semantics. The right leaf protects the glass vestibule; the left leaf owns the hatch.
  const canopyY = podiumY + podiumH * 0.69;
  const canopyZ = (lobbyZ + 0.2 + frontEdge - 0.72) * 0.5;
  const canopyD = frontEdge - 0.72 - (lobbyZ + 0.2);
  const lobbyCanopyW = lobbyW * 0.88;
  const edCanopyW = edW * 1.04;
  const canopyW = edCanopyW;
  const canopyX = edX;
  addRound(serviceSteel, 'porte-cochere-roof', lobbyCanopyW, 0.72, canopyD,
    0.38, lobbyX, canopyY, canopyZ);
  addRound(envelopeBluestone, 'porte-cochere-coffer', edCanopyW, 0.58,
    canopyD * 0.93,
    0.24, edX, canopyY, canopyZ + 0.04);
  for (const [x, z] of [
    [edX - edCanopyW * 0.49, canopyZ + canopyD * 0.08],
    [edX + edCanopyW * 0.49, canopyZ + canopyD * 0.08],
    [lobbyX - lobbyCanopyW * 0.43, canopyZ + canopyD * 0.38],
    [lobbyX + lobbyCanopyW * 0.43, canopyZ + canopyD * 0.38],
  ]) {
    const isEdPost = x < 0;
    addRound(serviceSteel, 'porte-cochere-post', isEdPost ? 0.3 : 0.46,
      canopyY - baseY, isEdPost ? 0.3 : 0.46,
      0.13, x, baseY + 0.27, z);
    addRound(envelopeBluestone, 'porte-cochere-post-foot', isEdPost ? 0.4 : 0.58,
      0.24, isEdPost ? 0.4 : 0.58,
      0.14, x, baseY + 0.24, z);
  }
  addBox(emergencyOchre, 'porte-cochere-edge', edCanopyW * 0.96, 0.25, 0.16,
    edX, canopyY + 0.46, canopyZ + canopyD * 0.49);

  // A protected kerb and impact bollards make the ED court operationally separate.
  addBox(envelopeBluestone, 'emergency-apron-curb', edW * 1.08, 0.22, 0.26,
    edX, baseY + 0.26, frontEdge - 0.72);
  for (const x of [edX - edW * 0.46, edX + edW * 0.46]) {
    for (const z of [edZ + 2.42, frontEdge - 0.94]) {
      addCylinder(emergencyOchre, 'emergency-impact-bollard', 0.13, 0.86,
        x, baseY + 0.28, z, 8);
    }
  }

  // Board-readable ambulance parked across the treatment apron. The broad side profile
  // exposes the patient box, stepped cab, glazing, both axles and roof light at street scale.
  const ambulanceX = edX;
  const ambulanceZ = frontEdge - 3.0;
  const ambulanceY = baseY + 0.35;
  const ambulanceBodyX = ambulanceX + 0.65;
  const ambulanceCabX = ambulanceX - 0.85;
  addRound(clinicalWhite, 'ambulance-body', 2.05, 2.28, 1.9, 0.27,
    ambulanceBodyX, ambulanceY, ambulanceZ);
  addSlopedCab(clinicalWhite, 'ambulance-cab', 1.0, 1.88, 1.82, 0.44,
    ambulanceCabX, ambulanceY, ambulanceZ);
  const ambulanceBonnetX = ambulanceCabX - 0.71;
  addRound(clinicalWhite, 'ambulance-separated-bonnet', 0.42, 0.72, 1.82, 0.14,
    ambulanceBonnetX, ambulanceY, ambulanceZ);
  for (const side of [-1, 1]) {
    addTrapezoidPanelXY(clinicalGlass, 'ambulance-sloped-windscreen', 0.82, 0.92, 0.26,
      ambulanceCabX - 0.03, ambulanceY + 0.7, ambulanceZ + side * 0.925, side);
  }
  for (const side of [-1, 1]) {
    addBox(traumaRed, 'ambulance-uninterrupted-side-livery', 3.32, 0.44, 0.14,
      (ambulanceBodyX + ambulanceCabX) * 0.5,
      ambulanceY + 0.6, ambulanceZ + side * 0.97);
    addPanelXY(traumaRed, 'ambulance-side-cross-stem', 0.38, 1.14,
      ambulanceBodyX + 0.28, ambulanceY + 0.4,
      ambulanceZ + side * 0.981, side);
    addPanelXY(traumaRed, 'ambulance-side-cross-bar', 1.08, 0.38,
      ambulanceBodyX + 0.28, ambulanceY + 0.78,
      ambulanceZ + side * 0.984, side);
    for (const x of [ambulanceCabX - 0.03, ambulanceBodyX + 0.5]) {
      addCylinder(serviceSteel, 'ambulance-wheel', 0.46, 0.34,
        x, baseY + 0.64, ambulanceZ + side * 0.94, 10, 'z');
      addCylinder(clinicalWhite, 'ambulance-wheel-hub', 0.16, 0.12,
        x, baseY + 0.75, ambulanceZ + side * 1.12, 10, 'z');
    }
  }
  addBox(traumaRed, 'ambulance-light-bar', 0.78, 0.32, 1.96,
    ambulanceCabX, ambulanceY + 2.22, ambulanceZ);
  for (const side of [-1, 1]) {
    addBox(emergencyOchre, 'ambulance-headlamp', 0.2, 0.46, 0.5,
      ambulanceBonnetX - 0.2, ambulanceY + 0.14, ambulanceZ + side * 0.58);
  }

  // The raised helipad occupies half the visible roof and carries a full ring, large H,
  // raised rim, four red beacons, and a human-height perimeter rather than token rails.
  const helipadX = -towerW * 0.08;
  const helipadZ = towerZ + towerD * 0.17;
  const helipadW = towerW * 0.75;
  const helipadD = towerD * 0.67;
  addRound(serviceSteel, 'helipad-deck', helipadW, 0.34, helipadD,
    0.72, helipadX, roofY + 0.12, helipadZ);
  addCylinder(serviceSteel, 'helipad-disc', Math.min(helipadW, helipadD) * 0.42, 0.12,
    helipadX, roofY + 0.45, helipadZ, 32);
  addTorus(clinicalWhite, 'helipad-landing-ring', Math.min(helipadW, helipadD) * 0.34,
    0.2, helipadX, roofY + 0.61, helipadZ, 32);
  addTorus(serviceSteel, 'helipad-raised-rim', Math.min(helipadW, helipadD) * 0.47,
    0.22, helipadX, roofY + 0.67, helipadZ, 32);
  addBox(clinicalWhite, 'helipad-h-left', 0.5, 0.2, 3.15,
    helipadX - 0.82, roofY + 0.57, helipadZ);
  addBox(clinicalWhite, 'helipad-h-right', 0.5, 0.2, 3.15,
    helipadX + 0.82, roofY + 0.57, helipadZ);
  addBox(clinicalWhite, 'helipad-h-bar', 2.06, 0.2, 0.5,
    helipadX, roofY + 0.57, helipadZ);
  for (const sideX of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      const x = helipadX + sideX * helipadW * 0.42;
      const z = helipadZ + sideZ * helipadD * 0.42;
      addCylinder(serviceSteel, 'helipad-beacon-post', 0.18, 0.46,
        x, roofY + 0.46, z, 8);
      addCylinder(traumaRed, 'helipad-red-beacon', 0.24, 0.26,
        x, roofY + 0.92, z, 10);
    }
  }

  // Three purposeful plant scales sit behind a real open louvred screen. Short stacks
  // remain subordinate to the air handlers and do not dominate the hospital silhouette.
  const plantZ = towerZ - towerD * 0.34;
  const plantSpecs = [
    [-towerW * 0.29, 2.1, 1.05, 1.7],
    [0, 2.35, 1.48, 1.85],
    [towerW * 0.29, 1.72, 0.86, 1.52],
  ];
  for (const [x, w, h, d] of plantSpecs) {
    addRound(serviceSteel, 'roof-plant-unit', w, h, d, 0.2, x, roofY + 0.28, plantZ);
    addBox(serviceSteel, 'roof-plant-unit-cap', w * 0.84, 0.2, d * 0.78,
      x, roofY + 0.28 + h, plantZ);
    addCylinder(serviceSteel, 'roof-plant-fan', Math.min(w, d) * 0.25, 0.18,
      x, roofY + 0.5 + h, plantZ, 12);
  }
  const screenZ = plantZ + 1.18;
  for (const x of [-towerW * 0.43, -towerW * 0.14, towerW * 0.14, towerW * 0.43]) {
    addBox(serviceSteel, 'roof-louvre-screen-post', 0.28, 2.2, 0.28,
      x, roofY + 0.24, screenZ);
  }
  for (let louvre = 0; louvre < 6; louvre += 1) {
    addBox(serviceSteel, 'roof-louvre-screen-blade', towerW * 0.88, 0.2, 0.34,
      0, roofY + 0.42 + louvre * 0.23, screenZ, { x: -0.2 });
  }
  for (const x of [-towerW * 0.19, towerW * 0.18]) {
    addCylinder(serviceSteel, 'roof-secondary-exhaust', 0.19, 1.28,
      x, roofY + 1.78, plantZ - 0.16, 10);
    addCylinder(serviceSteel, 'roof-secondary-exhaust-cap', 0.26, 0.12,
      x, roofY + 3.0, plantZ - 0.16, 10);
  }

  const railBottomY = roofY + 0.48;
  const railTopY = roofY + 1.02;
  for (const side of [-1, 1]) {
    for (const railY of [railBottomY, railTopY]) {
      addBox(serviceSteel, 'roof-safety-rail-long', 0.3, 0.3, towerD - 0.62,
        side * (towerW * 0.5 - 0.24), railY, towerZ);
      addBox(serviceSteel, 'roof-safety-rail-short', towerW - 0.62, 0.3, 0.3,
        0, railY, towerZ + side * (towerD * 0.5 - 0.24));
    }
  }
  const postCount = 4;
  for (let i = 0; i < postCount; i += 1) {
    const t = postCount === 1 ? 0.5 : i / (postCount - 1);
    const x = -towerW * 0.45 + t * towerW * 0.9;
    const z = towerZ - towerD * 0.45 + t * towerD * 0.9;
    for (const edgeZ of [towerZ - towerD * 0.47, towerZ + towerD * 0.47]) {
      addBox(serviceSteel, 'roof-safety-post-front-back', 0.3, 1.12, 0.3,
        x, roofY + 0.16, edgeZ);
    }
    for (const edgeX of [-towerW * 0.47, towerW * 0.47]) {
      addBox(serviceSteel, 'roof-safety-post-sides', 0.3, 1.12, 0.3,
        edgeX, roofY + 0.16, z);
    }
  }

  // Rear operations elevation: recessed loading, personnel access, louvres and three
  // distinct screened services fill the former blank wall without ornamental clutter.
  const rearPodiumFace = podiumZ - podiumD * 0.5;
  const loadingZ = rearPodiumFace - 0.08;
  const loadingW = podiumW * 0.39;
  const loadingX = -podiumW * 0.16;
  // A pale datum, deep framed openings and mineral reveals keep this operational face
  // legible under the rear studio light; none of the apertures are represented as voids.
  addBox(envelopeIvory, 'rear-service-datum-band', podiumW * 0.91, 0.34, 0.3,
    0, podiumY + podiumH * 0.76, rearPodiumFace - 0.12);
  const rearUpperPanelW = podiumW * 0.166;
  for (let panel = 0; panel < 5; panel += 1) {
    const panelX = -podiumW * 0.38 + panel * podiumW * 0.19;
    addRound(envelopeIvory, 'rear-upper-precast-bay', rearUpperPanelW, 0.72, 0.34,
      0.1, panelX, podiumY + podiumH * 0.82, rearPodiumFace - 0.12);
    addPanelXY(serviceSteel, 'rear-upper-precast-joint', 0.12, 0.5,
      panelX + (panel % 2 === 0 ? -1 : 1) * rearUpperPanelW * 0.22,
      podiumY + podiumH * 0.84, rearPodiumFace - 0.347, -1);
  }
  addRound(envelopeBluestone, 'rear-loading-recess', loadingW + 0.5,
    podiumH * 0.61, 0.38,
    0.16, loadingX, podiumY + 0.16, loadingZ);
  addRound(emergencyOchre, 'rear-loading-warm-depth', loadingW * 0.64, podiumH * 0.35, 0.46,
    0.12, loadingX, podiumY + 0.34, loadingZ - 0.24);
  for (const side of [-1, 1]) {
    addRound(envelopeIvory, 'rear-loading-frame-jamb', 0.34, podiumH * 0.64, 0.5,
      0.1, loadingX + side * (loadingW * 0.5 + 0.14), podiumY + 0.12, loadingZ - 0.04);
  }
  addRound(envelopeIvory, 'rear-loading-frame-head', loadingW + 0.62, 0.38, 0.5,
    0.12, loadingX, podiumY + podiumH * 0.7, loadingZ - 0.04);
  addBox(serviceSteel, 'rear-loading-shutter', loadingW * 0.76, podiumH * 0.48, 0.16,
    loadingX, podiumY + 0.28, loadingZ - 0.2);
  for (let rib = 0; rib < 7; rib += 1) {
    addPanelXY(clinicalWhite, 'rear-loading-rib', loadingW * 0.68, 0.11,
      loadingX, podiumY + 0.38 + rib * podiumH * 0.057, loadingZ - 0.345, -1);
  }
  const rearCanopyD = 2.7;
  addRound(serviceSteel, 'rear-loading-canopy', loadingW * 1.14, 0.4, rearCanopyD,
    0.22, loadingX, podiumY + podiumH * 0.7, rearPodiumFace - rearCanopyD * 0.46);
  for (const x of [loadingX - loadingW * 0.48, loadingX + loadingW * 0.48]) {
    addRound(serviceSteel, 'rear-loading-canopy-post', 0.28, podiumH * 0.68, 0.28,
      0.1, x, podiumY + 0.04, rearPodiumFace - rearCanopyD * 0.82);
  }
  const staffX = podiumW * 0.23;
  addRound(envelopeIvory, 'rear-staff-door-surround', podiumW * 0.16,
    podiumH * 0.58, 0.38,
    0.12, staffX, podiumY + 0.1, loadingZ - 0.02);
  addBox(envelopeBluestone, 'rear-staff-door-reveal', podiumW * 0.125,
    podiumH * 0.5, 0.24,
    staffX, podiumY + 0.14, loadingZ - 0.03);
  addBox(serviceSteel, 'rear-staff-door', podiumW * 0.11, podiumH * 0.46, 0.16,
    staffX, podiumY + 0.2, loadingZ - 0.2);
  addBox(lobbyGlass, 'rear-staff-vision', podiumW * 0.035, podiumH * 0.16, 0.08,
    staffX, podiumY + podiumH * 0.3, loadingZ - 0.31);

  const louvreX = podiumW * 0.39;
  addRound(envelopeIvory, 'rear-louvre-bank-surround', podiumW * 0.22,
    podiumH * 0.5, 0.36,
    0.12, louvreX, podiumY + podiumH * 0.18, loadingZ - 0.02);
  addBox(serviceSteel, 'rear-louvre-bank-backing', podiumW * 0.19,
    podiumH * 0.43, 0.2,
    louvreX, podiumY + podiumH * 0.22, loadingZ - 0.04);
  for (let louvre = 0; louvre < 6; louvre += 1) {
    addPanelXY(serviceSteel, 'rear-louvre-bank-blade', podiumW * 0.17, 0.22,
      louvreX, podiumY + podiumH * (0.25 + louvre * 0.058), loadingZ - 0.325, -1);
  }
  addRound(traumaRed, 'rear-service-riser', 0.62, podiumH * 0.62, 0.54,
    0.12, podiumW * 0.46, podiumY + 0.08, loadingZ - 0.12);

  const serviceRowZ = rearEdge + 1.75;
  const generatorX = podiumW * 0.25;
  addRound(serviceSteel, 'rear-generator', 2.55, 1.5, 1.55,
    0.2, generatorX, baseY + 0.32, serviceRowZ);
  for (let louvre = 0; louvre < 6; louvre += 1) {
    addPanelXY(clinicalWhite, 'rear-generator-louvre', 2.1, 0.13,
      generatorX, baseY + 0.5 + louvre * 0.18, serviceRowZ - 0.855, -1);
  }
  for (const x of [generatorX - 1.45, generatorX + 1.45]) {
    for (const z of [serviceRowZ - 0.94, serviceRowZ + 0.94]) {
      addBox(serviceSteel, 'rear-generator-cage-post', 0.24, 1.86, 0.24,
        x, baseY + 0.28, z);
    }
  }
  for (const y of [baseY + 0.58, baseY + 1.78]) {
    for (const z of [serviceRowZ - 0.94, serviceRowZ + 0.94]) {
      addBox(serviceSteel, 'rear-generator-cage-rail', 3.02, 0.22, 0.22,
        generatorX, y, z);
    }
  }
  const binX = podiumW * 0.42;
  for (const offset of [-0.42, 0.42]) {
    addRound(serviceSteel, 'rear-screened-bin', 0.72, 0.94, 1.05,
      0.12, binX + offset, baseY + 0.3, serviceRowZ + 0.04);
  }
  for (const x of [binX - 1.04, binX + 1.04]) {
    addBox(serviceSteel, 'rear-bin-screen-post', 0.22, 1.62, 0.22,
      x, baseY + 0.28, serviceRowZ - 0.7);
  }
  for (let slat = 0; slat < 7; slat += 1) {
    addPanelXY(serviceSteel, 'rear-bin-screen-slat', 2.22, 0.2,
      binX, baseY + 0.45 + slat * 0.18, serviceRowZ - 0.785, -1);
  }

  const oxygenX = -podiumW * 0.43;
  for (const offset of [-0.34, 0, 0.34]) {
    addCylinder(clinicalWhite, 'rear-oxygen-cylinder', 0.2, 1.32,
      oxygenX + offset, baseY + 0.3, serviceRowZ, 10);
    addCylinder(serviceSteel, 'rear-oxygen-cylinder-cap', 0.12, 0.18,
      oxygenX + offset, baseY + 1.62, serviceRowZ, 8);
  }
  for (const x of [oxygenX - 0.75, oxygenX + 0.75]) {
    addBox(serviceSteel, 'rear-oxygen-cage-post', 0.24, 1.78, 0.24,
      x, baseY + 0.28, serviceRowZ - 0.58);
  }
  for (const y of [baseY + 0.55, baseY + 1.72]) {
    addBox(serviceSteel, 'rear-oxygen-cage-rail', 1.62, 0.22, 0.22,
      oxygenX, y, serviceRowZ - 0.58);
  }

  addPanelXZ(emergencyOchre, 'rear-loading-stop-line', loadingW * 0.9, 0.12,
    loadingX, baseY + 0.34, rearPodiumFace - 3.4);
  for (const side of [-1, 1]) {
    addPanelXZ(emergencyOchre, 'rear-loading-guide-line', 0.11, 3.0,
      loadingX + side * loadingW * 0.42, baseY + 0.34, rearPodiumFace - 1.85);
  }
  for (const x of [-podiumW * 0.43, podiumW * 0.43]) {
    addCylinder(emergencyOchre, 'rear-bollard', 0.13, 0.82, x, baseY + 0.29,
      rearEdge + 1.5, 8);
  }

}
