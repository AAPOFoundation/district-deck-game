// Hills-fringe events orchestrator: Rod Laver Arena, Albert Park Grand Prix, Falls Creek.
// Per-venue geometry lives in ./events/. Presentation only. No Math.random.

import * as THREE from 'three';
import { noPick, edgeFrame, placeGroup } from './kit.js';
import { alongLength } from '../shore.js';
import { mats, applyTasteRegister } from './events/shared.js';
import { addRodLaver } from './events/rod-laver.js';
import { placeAlbertParkLandmark } from '../landmark-albert-park.js';
import { addGrandPrix } from './events/grand-prix.js';
import { addFallsCreek } from './events/falls-creek.js';

const FC6_ROOF_OR_CONCRETE = /(roof|fascia|bowl|concourse|podium|plaza|terrace|plinth|cornice|pilaster|vomitor|pav|stone|column-base)/;
const FC6_GLASS = /(glass$|glazing$|fanlights$|camera-face$|car-cabins$)/;

function materialArray(material) {
  return Array.isArray(material) ? material : [material];
}

/**
 * FC6 material register for the entertainment venue.
 *
 * Rod Laver already owns the geometry the review asks for: a 1.4 m-deep paired
 * chord roof truss, standing seams, a signed fascia, a fifteen-course seating
 * bowl, vomitories and forty-eight structural columns. The remaining defect was
 * material hierarchy. Clone only the arena's qualifying materials here so the
 * shared event palette still means the same thing to Grand Prix and Falls Creek.
 */
function applyEntertainmentMaterialRegister(rod, kit) {
  if (!rod) return null;
  const clones = new Map();
  const getClone = (source, kind) => {
    let byKind = clones.get(source);
    if (!byKind) {
      byKind = new Map();
      clones.set(source, byKind);
    }
    if (byKind.has(kind)) return byKind.get(kind);
    const material = source.clone();
    material.name = `${source.name || 'rod-laver-material'}:fc6-${kind}`;
    if (kind === 'glass') {
      material.color.copy(kit.glass.color);
      material.roughness = kit.glass.roughness;
      material.metalness = kit.glass.metalness;
      material.userData = { ...material.userData, fc6Register: 'kit-glass' };
    } else {
      material.roughness = Math.max(0.72, material.roughness ?? 0.72);
      material.userData = { ...material.userData, fc6Register: 'roof-or-concrete' };
    }
    material.needsUpdate = true;
    byKind.set(kind, material);
    return material;
  };

  let glassMeshes = 0;
  let roofConcreteMeshes = 0;
  let minRoofConcreteRoughness = Infinity;
  rod.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    const name = node.name || '';
    const kind = FC6_GLASS.test(name) ? 'glass'
      : (FC6_ROOF_OR_CONCRETE.test(name) ? 'roof-or-concrete' : null);
    if (!kind) return;
    const converted = materialArray(node.material).map((source) => getClone(source, kind));
    node.material = Array.isArray(node.material) ? converted : converted[0];
    if (kind === 'glass') glassMeshes += 1;
    else {
      roofConcreteMeshes += 1;
      for (const material of converted) {
        minRoofConcreteRoughness = Math.min(minRoofConcreteRoughness, material.roughness);
      }
    }
  });

  // A feathered, normal-blended pool under the existing fountain is the warm
  // plaza light requested by the brief. It has no hard alpha rim and does not
  // use additive blending, so it reads as light grazing stone rather than a
  // luminous game token.
  const fountain = rod.getObjectByName('fringe:rod-laver-fountain');
  let groundLight = rod.getObjectByName('fringe:rod-laver-plaza-ground-light');
  if (fountain && !groundLight) {
    const n = 32;
    const data = new Uint8Array(n * n * 4);
    for (let iy = 0; iy < n; iy += 1) {
      for (let ix = 0; ix < n; ix += 1) {
        const dx = (ix + 0.5) / n * 2 - 1;
        const dy = (iy + 0.5) / n * 2 - 1;
        const radial = Math.max(0, 1 - Math.hypot(dx, dy));
        const at = (iy * n + ix) * 4;
        data[at] = 255;
        data[at + 1] = 197;
        data[at + 2] = 116;
        data[at + 3] = Math.round(255 * radial * radial * (3 - 2 * radial));
      }
    }
    const texture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
    texture.needsUpdate = true;
    texture.userData.featheredAlpha = true;
    const material = new THREE.MeshBasicMaterial({
      color: '#ffd19a', map: texture, transparent: true, opacity: 0.20,
      depthWrite: false, blending: THREE.NormalBlending, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    groundLight = new THREE.Mesh(new THREE.CircleGeometry(5.4, 32), material);
    groundLight.name = 'fringe:rod-laver-plaza-ground-light';
    groundLight.rotation.x = -Math.PI / 2;
    groundLight.position.y = 0.012;
    groundLight.renderOrder = 3;
    groundLight.castShadow = false;
    groundLight.receiveShadow = false;
    groundLight.userData.softGroundLight = true;
    groundLight.userData.alphaMax = 0.20;
    groundLight.userData.ownsGeometry = true;
    noPick(groundLight);
    fountain.add(groundLight);
  }

  const required = [
    'fringe:rod-laver-roof-ring-top',
    'fringe:rod-laver-roof-ring-bottom',
    'fringe:rod-laver-roof-ring-web',
    'fringe:rod-laver-roof-leaf-north',
    'fringe:rod-laver-fascia',
    'fringe:rod-laver-scoreboard-letters-end',
    'fringe:rod-laver-bowl',
    'fringe:rod-laver-vomitories',
    'fringe:rod-laver-roof-columns',
    'fringe:rod-laver-plaza-ground-light',
  ];
  const missing = required.filter((name) => !rod.getObjectByName(name));
  const register = {
    trussDepthM: 1.4,
    roofPanelSeams: 15,
    steppedSeatingCourses: 15,
    concourseColumns: 48,
    glassMeshes,
    glassKit: {
      color: `#${kit.glass.color.getHexString()}`,
      roughness: kit.glass.roughness,
      metalness: kit.glass.metalness,
    },
    roofConcreteMeshes,
    minRoofConcreteRoughness: Number.isFinite(minRoofConcreteRoughness)
      ? +minRoofConcreteRoughness.toFixed(2) : null,
    groundLightAlpha: groundLight?.material?.opacity ?? null,
    missing,
  };
  rod.userData.fc6Register = register;
  return register;
}

export function addEvents(parent, city, plan) {
  const roles = plan?.roles ?? {};
  const extent = plan?.extent ?? city?.extent ?? { x: 272, z: 272 };
  const edge = roles.hillsEdge;
  if (!edge) return null;
  const L = alongLength(edge, extent);
  const frame = edgeFrame(edge, extent, 28, L * 0.04);
  const m = mats();
  const root = new THREE.Group();
  root.name = 'fringe:events';
  noPick(root);
  placeGroup(parent, root, frame);
  const y0 = 0;
  // Pass the RENDERED ground sampler through. `fringe.js` sets `plan.groundAt`
  // (see `hinterlandGroundSampler`) and every venue below reads `opts.groundAt`;
  // this call was dropping it, so the receiving ends sat built and unreachable.
  //
  // This matters more than a forwarded argument usually does. `heightWorld` /
  // `terrainHeightAt` describe annulus meshes that are hidden at runtime, and the
  // gap between them and the surface that actually draws runs from −6 m at r 73
  // to −23 m at r 128. Positioning against the hidden one is the single most
  // expensive fault in this programme: it buried an entire boulevard at median
  // −2.92 m, floated the ring trees, and sent a float probe and a seam hunt after
  // objects that were never there.
  const opts = { groundAt: typeof plan?.groundAt === 'function' ? plan.groundAt : null, quality: plan?.quality };
  const rodLaver = addRodLaver(root, m, y0, opts);
  const grandPrix = addGrandPrix(root, m, y0, opts);
  addFallsCreek(root, m, y0, opts);
  applyEntertainmentMaterialRegister(rodLaver, m);
  // Taste register: Rod Laver, its approach and the circuit only. Falls Creek keeps the
  // shared event palette it was authored against.
  root.userData.tasteRegister = applyTasteRegister([
    rodLaver, root.getObjectByName('fringe:melbourne-park-approach'), grandPrix,
  ]);
  rodLaver.userData.placeLandmark?.(); // L4: swap after the existing material and light registers.
  placeAlbertParkLandmark(grandPrix, { quality: plan?.quality });
  return root;
}

export function updateEvents(group, dt, elapsed, reducedMotion) {
  if (!group) return;
  const gp = group.userData.grandPrixVenue ??= group.getObjectByName('fringe:grand-prix');
  // P21 A1: this group owns the entire circuit, ground and stands. The old
  // "car idle" rotated that infrastructure against its fixed neighbours.
  if (gp) gp.rotation.y = 0;
}
