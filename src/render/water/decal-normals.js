// Lit wake patches share the feathered foam geometry, originally authored for
// unlit additive materials. A lit clone needs normals even at very low alpha:
// a zero normal makes the BRDF non-finite and poisons the blended water pixel.
export function repairWaterDecalNormals(mesh) {
  const material = mesh?.material;
  const geometry = mesh?.geometry;
  if (!mesh?.isMesh || !material?.isMeshStandardMaterial || !material.transparent
    || !geometry?.attributes?.position || geometry.attributes.normal
    || !geometry.attributes.uv || !geometry.attributes.color) return false;
  let water = false;
  for (let node = mesh; node; node = node.parent) {
    if (/harbour|water|wake|foam/.test(node.name ?? '')) { water = true; break; }
  }
  if (!water) return false;
  geometry.computeVertexNormals();
  return true;
}
