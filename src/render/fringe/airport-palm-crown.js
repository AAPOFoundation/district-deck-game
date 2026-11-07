import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildSpeciesGeometry } from '../foliage.js';
import { palmCrownDiameter, radialCrownDiameter } from '../authored-scale.js';

// Geometry owned by this venue mesh only. No street material, cache or gameplay owner
// is acquired; both keep/drop partitions are standing healthy crown geometry here.
export function airportPalmCrown(source, worldMatrix, quality = 'high') {
  const sourcePosition = source.attributes.position;
  let top = -Infinity, cap = null, radius = Infinity;
  for (let i = 0; i < 34; i++) top = Math.max(top, sourcePosition.getY(i));
  for (let i = 0; i < 34; i++) if (sourcePosition.getY(i) === top) {
    const r = Math.hypot(sourcePosition.getX(i), sourcePosition.getZ(i));
    if (r < radius) { radius = r; cap = [sourcePosition.getX(i), top, sourcePosition.getZ(i)]; }
  }
  if (!cap || radius > 1e-8) throw new Error('Original bole top cap centre absent');
  const built = buildSpeciesGeometry('palm', quality);
  const anchor = built.leaf.userData.r145Palm.fronds[0].anchor;
  const crownClones = [built.leaf.clone(), built.leafDrop.clone()];
  const crown = mergeGeometries(crownClones);
  crownClones.forEach(g => g.dispose()); // source buffers are never edited or attached to airport disposal.
  // This public generator allocates fresh geometry on every call; these temporary
  // outputs belong to this adapter, unlike the street layer's retained geometries.
  for (const g of new Set([built.wood, built.leaf, built.leafDrop])) g.dispose();
  const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), axes = new THREE.Vector3();
  worldMatrix.decompose(position, rotation, axes);
  if ([axes.x, axes.y, axes.z].some(x => !Number.isFinite(x) || x <= 0)) throw new Error('Positive world axes required');
  const clearStem = new THREE.Vector3(...cap).applyMatrix4(worldMatrix).y - position.y;
  const diameter = palmCrownDiameter(clearStem), authoredDiameter = radialCrownDiameter(crown.attributes.position, anchor);
  const uniformWorldScale = diameter / authoredDiameter;
  crown.translate(-anchor[0], -anchor[1], -anchor[2]);
  crown.scale(uniformWorldScale / axes.x, uniformWorldScale / axes.y, uniformWorldScale / axes.z);
  crown.translate(...cap);
  const bole = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(source.attributes))
    bole.setAttribute(name, new THREE.BufferAttribute(a.array.slice(0, 34 * a.itemSize), a.itemSize, a.normalized));
  bole.setIndex(new THREE.BufferAttribute(source.index.array.slice(0, 60), 1));
  const result = mergeGeometries([bole, crown]);
  // Retain the original index component type as well as bole index values.
  if (result.index.array.constructor !== source.index.array.constructor)
    result.setIndex(new THREE.BufferAttribute(new source.index.array.constructor(result.index.array), 1));
  bole.dispose(); crown.dispose();
  result.computeBoundingBox(); result.computeBoundingSphere();
  result.userData.clusterTree = { ...source.userData.clusterTree, airportPalm: true, quality, triangles: result.index.count / 3 };
  result.userData.r155Palm = { quality, fronds: 17, keepFronds: 15, dropFronds: 2, originalBoleTriangles: 20,
    originalBoleVertices: 34, legacyForksReplaced: true, anchor: cap, sourceAnchor: anchor,
    anchorMeasurement: 'highest retained bole vertices; centre of top cap',
    clearStem, crownDiameter: diameter, radialDefinition: 'twice maximum horizontal radius about frond attachment',
    sourceDiameter: authoredDiameter, uniformWorldScale, effectiveWorldAxes: axes.toArray(),
    crownFirstVertex: 34, sourceTriangles: built.leaf.index.count / 3 + built.leafDrop.index.count / 3,
    sourceVertexColourAndOpaqueUVPreserved: true, materialHeld: true, staticAirportWind: true };
  return result;
}
