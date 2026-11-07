import * as THREE from 'three';
import { hashSeed } from '../textures.js';

// Owned materials for three surviving static airport palms. Geometry/atlas stay held.
export function airportPalmMaterialGroups(mesh, healthyLeafColor) {
  const geometry = mesh.geometry, bole = mesh.material;
  if (Array.isArray(bole) || geometry.userData.r155Palm?.originalBoleTriangles !== 20
      || geometry.index?.count <= 60 || geometry.groups.length !== 0)
    throw new Error('Complete accepted palm with single held material required');
  const salt = geometry.userData.clusterTree.seed;
  if (typeof salt !== 'string') throw new Error('Original cluster seed salt required');
  const U = i => (hashSeed(`${salt}:${i}`) >>> 0) / 4294967296;
  const crown = bole.clone();
  // Material.clone does not copy compile/cache callbacks. Preserve the receiver path.
  crown.onBeforeCompile = bole.onBeforeCompile;
  crown.customProgramCacheKey = bole.customProgramCacheKey;
  crown.color.copy(healthyLeafColor instanceof THREE.Color ? healthyLeafColor : new THREE.Color(healthyLeafColor));
  crown.color.offsetHSL((U(4) - 0.5) * 0.045, (U(5) - 0.5) * 0.10, (U(6) - 0.5) * 0.055);
  crown.name = `airport-palm-crown:${salt}`;
  geometry.addGroup(0, 60, 0);
  geometry.addGroup(60, geometry.index.count - 60, 1);
  mesh.material = [bole, crown];
  mesh.userData.preserveMaterialGroups = true;
  mesh.userData.r157Palm = { sourceSalt: salt, crownBaseHex: '#4c7a3c',
    seededVariation: 'unchanged addClusterTree U4/U5/U6 HSL offsets',
    ownedMaterials: 2, originalBoleIndexCount: 60, geometryAttributesHeld: true,
    atlasShared: crown.map === bole.map, additionalColourGroup: 1 };
  return [bole, crown];
}
