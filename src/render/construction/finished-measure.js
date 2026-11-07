// Finished-model measurement in model coordinates; the Board caches one result per commission key.
import * as THREE from 'three';

function quantile(values, q) {
  if (!values.length) throw new Error('no qualifying faces');
  values.sort((a, b) => a[0] - b[0]);
  const target = values.reduce((sum, v) => sum + v[1], 0) * q;
  let sum = 0;
  for (const [value, weight] of values) { sum += weight; if (sum >= target) return value; }
  return values.at(-1)[0];
}
const excluded = (m) => /foliage|glass|leaf|leaves|glazing/i.test(`${m?.name ?? ''} ${m?.userData?.family ?? ''}`);

/** Parts are already baked in model coordinates by the registry / building kits. */
export function measureFinished(model) {
  const faces = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (const part of model?.parts ?? []) {
    const geometry = part.geometry;
    const p = geometry?.attributes.position;
    if (!p) continue;
    const index = geometry.index;
    const count = index?.count ?? p.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const group = Array.isArray(part.material) ? geometry.groups.find((g) => i >= g.start && i < g.start + g.count) : null;
      const material = Array.isArray(part.material) ? part.material[group?.materialIndex ?? 0] : part.material;
      if (excluded(material)) continue;
      a.fromBufferAttribute(p, index ? index.getX(i) : i);
      b.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1);
      c.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2);
      ab.subVectors(b, a); ac.subVectors(c, a); ab.cross(ac);
      const area2 = ab.length();
      if (area2 < 1e-8) continue;
      faces.push({ area: area2 / 2, ny: ab.y / area2,
        x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3,
        lo: [Math.min(a.x, b.x, c.x), Math.min(a.y, b.y, c.y), Math.min(a.z, b.z, c.z)],
        hi: [Math.max(a.x, b.x, c.x), Math.max(a.y, b.y, c.y), Math.max(a.z, b.z, c.z)],
        vertices: [a.toArray(), b.toArray(), c.toArray()],
      });
    }
  }
  const walls = faces.filter((f) => Math.abs(f.ny) < 0.15 && f.y >= 1.6 && f.y <= 2.4);
  const lo = [0, 2].map((axis) => quantile(walls.map((f) => [f.lo[axis], f.area]), 0.02));
  const hi = [0, 2].map((axis) => quantile(walls.map((f) => [f.hi[axis], f.area]), 0.98));
  const [w, d] = hi.map((v, i) => v - lo[i]);
  if (!(w > 0 && d > 0)) throw new Error('no measurable wall footprint');
  const inside = (f) => f.y > 2.2 && f.x >= lo[0] - 0.6 && f.x <= hi[0] + 0.6 && f.z >= lo[1] - 0.6 && f.z <= hi[1] + 0.6;
  const pitched = faces.filter((f) => f.ny > 0.25 && f.ny < 0.97 && inside(f));
  const planArea = pitched.reduce((sum, f) => sum + f.area * f.ny, 0);
  const row = { cx: (lo[0] + hi[0]) / 2, cz: (lo[1] + hi[1]) / 2, w, d };
  if (planArea < w * d * 0.35) {
    const decks = faces.filter((f) => f.ny >= 0.97 && inside(f));
    if (!decks.length) throw new Error('no roof faces');
    const height = quantile(decks.map((f) => [f.y, f.area * f.ny]), 0.9);
    return { ...row, eave: height, ridge: height, form: 'flat', axis: w >= d ? 'x' : 'z' };
  }
  const eave = quantile(pitched.map((f) => [f.lo[1], f.area * f.ny]), 0.1);
  const ridge = quantile(pitched.map((f) => [f.hi[1], f.area * f.ny]), 0.99);
  const band = pitched.flatMap((f) => f.vertices.filter((v) => v[1] >= ridge - 0.25 && v[1] <= ridge + 0.05));
  const extent = [0, 2].map((axis) => Math.max(...band.map((v) => v[axis])) - Math.min(...band.map((v) => v[axis])));
  const axis = extent[0] >= extent[1] ? 'x' : 'z';
  const form = Math.max(...extent) < 0.45 * Math.max(w, d) ? 'hip' : 'gable';
  return { ...row, eave, ridge, form, axis };
}

export function finishedKey(id, facade = 0, lotSpan = null, hand = null, districtId = null) {
  return `${id}|f${Math.max(0, Math.min(3, facade | 0))}`
    + (lotSpan ? `|l${lotSpan.spanX}x${lotSpan.spanZ}` : '')
    + (hand ? `|h${hand === 'left' ? 'L' : 'R'}` : '')
    + `|d${JSON.stringify(districtId ?? null)}`;
}

/** A suspect result is cached as null by the Board, so its warning is emitted only once. */
export function measureFinishedForLot(model, lot, key) {
  try {
    const entry = measureFinished(model);
    if (![entry.cx, entry.cz, entry.w, entry.d, entry.eave, entry.ridge].every(Number.isFinite)) {
      throw new Error('non-finite measurement');
    }
    if (entry.w * entry.d < lot.w * lot.d * 0.4) throw new Error('footprint below 40% of lot');
    // Five centimetres tolerates modelling and float noise at the lot boundary.
    if (entry.w > lot.w + 0.05 || entry.d > lot.d + 0.05) throw new Error('footprint exceeds lot');
    if (entry.form !== 'flat' && entry.ridge - entry.eave < 0.3) throw new Error('pitched rise below 0.3 m');
    return entry;
  } catch (error) {
    console.warn(`[construction] suspect finished model ${key}: ${error.message}`);
    return null;
  }
}

/** Transform the measured centre once; lengths stay in the yawed construction frame. */
export function finishedFit(entry, placement, centre) {
  if (!entry) return null;
  const p = new THREE.Vector3(entry.cx, 0, entry.cz).multiply(placement.scale)
    .applyQuaternion(placement.quaternion).add(placement.position);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(placement.quaternion);
  return { cx: p.x - centre.x, cz: p.z - centre.z, yaw: Math.atan2(forward.x, forward.z),
    w: entry.w * placement.scale.x, d: entry.d * placement.scale.z,
    eave: entry.eave * placement.scale.y + placement.position.y,
    ridge: entry.ridge * placement.scale.y + placement.position.y,
    form: entry.form, axis: entry.axis };
}
