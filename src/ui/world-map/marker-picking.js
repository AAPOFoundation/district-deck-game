/** Raycasting ignores Object3D.visible; exclude hidden ancestors and the far side. */
export function firstVisibleMarkerHit(hits, semanticKey, centre, camera) {
  const vx = camera.x - centre.x;
  const vy = camera.y - centre.y;
  const vz = camera.z - centre.z;
  for (const hit of hits) {
    const point = hit.point;
    if (!point || (point.x - centre.x) * vx + (point.y - centre.y) * vy
      + (point.z - centre.z) * vz <= 0) continue;
    let marker = null;
    let hidden = false;
    for (let object = hit.object; object; object = object.parent) {
      if (object.visible === false) hidden = true;
      if (!marker && object.userData?.[semanticKey] != null) marker = object;
    }
    if (marker && !hidden) return marker;
  }
  return null;
}
