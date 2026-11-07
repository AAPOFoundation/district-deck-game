// addShipyardRig owns these fixed structures. MilitaryShipyardLayer animates or
// attaches geometry to the protected branches; never bake any of those to world.
const YARD = 'fringe:port-shipyard';
const PROTECTED = /^fringe:port-shipyard:(cradle|trolley|mount|slipway|crew)(:|$)/;

export function isFixedShipyardStructure(mesh) {
  if (!mesh?.isMesh || mesh.material?.transparent || Array.isArray(mesh.material)) return false;
  for (let node = mesh; node; node = node.parent) {
    const name = node.name ?? '';
    if (PROTECTED.test(name) || name.startsWith('military:')) return false;
    if (name === YARD) return true;
  }
  return false;
}

/** Remove only the incidental ship substring, never a mover suffix or ancestor. */
export function fixedShipyardMotionName(name) {
  return name.replace(/^fringe:port-shipyard(?=:|$)/, 'fringe:port-fixed-yard');
}
