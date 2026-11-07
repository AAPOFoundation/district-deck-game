// P13b load-time adapter. Coordinates are local metres; Y is up and front is -lengthAxis.
// Nothing in the game imports this module yet. Atlas transforms belong to the livery module.
import { BufferAttribute } from 'three';

export const VEHICLE_KIT_ENABLED = new URLSearchParams(
  globalThis.location?.search ?? globalThis.window?.location?.search ?? '',
).get('vehicleKit') === '1';

export const REGION_IDS = Object.freeze({ none: 0, side: 1, roof: 2, front: 3, rear: 4 });
const EXCLUDED = /bog(?:ie|ey)|pole|pantograph|interior/i;

function optionsFor({ sillY = 0, lengthAxis = 'z' } = {}) {
  if (!Number.isFinite(sillY) || !['x', 'z'].includes(lengthAxis)) {
    throw new TypeError('Body kit requires a finite sillY and lengthAxis x or z');
  }
  return { sillY, length: lengthAxis === 'x' ? 0 : 2, across: lengthAxis === 'x' ? 2 : 0 };
}

function layout(geometry) {
  const position = geometry.getAttribute('position');
  const count = geometry.index?.count ?? position?.count;
  if (!position || position.itemSize !== 3 || count % 3 !== 0) {
    throw new TypeError('Body kit requires triangle geometry with position triples');
  }
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < position.count; i++) for (let axis = 0; axis < 3; axis++) {
    const value = position.getComponent(i, axis);
    if (!Number.isFinite(value)) throw new TypeError('Body kit positions must be finite');
    minimum[axis] = Math.min(minimum[axis], value);
    maximum[axis] = Math.max(maximum[axis], value);
  }
  const indices = Array.from({ length: count }, (_, i) => geometry.index?.getX(i) ?? i);
  if (indices.some(i => !Number.isInteger(i) || i < 0 || i >= position.count)) {
    throw new RangeError('Body kit index is outside the position attribute');
  }
  return { position, indices, minimum, maximum };
}

// An explicit material slot supplies authoritative cap membership, never inferred from
// group order or a particular hull's dimensions. Without it, keep generic face tagging.
function authoredCaps(geometry, count, materialIndex) {
  if (materialIndex === undefined) return undefined;
  if (!Number.isInteger(materialIndex) || materialIndex < 0) throw new TypeError('Invalid capMaterialIndex');
  const groups = geometry.groups.filter(group => group.materialIndex === materialIndex);
  if (!groups.length) throw new RangeError('Authored cap material slot has no groups');
  const caps = new Uint8Array(count / 3);
  for (const group of groups) {
    if (!Number.isInteger(group.start) || !Number.isInteger(group.count) || group.start < 0 ||
        group.count <= 0 || group.start % 3 || group.count % 3 || group.start + group.count > count) {
      throw new RangeError('Authored cap groups must contain whole triangles');
    }
    caps.fill(1, group.start / 3, (group.start + group.count) / 3);
  }
  return caps;
}

function faceRegion(position, a, b, c, options, cap) {
  const ax = position.getX(a), ay = position.getY(a), az = position.getZ(a);
  const bx = position.getX(b) - ax, by = position.getY(b) - ay, bz = position.getZ(b) - az;
  const cx = position.getX(c) - ax, cy = position.getY(c) - ay, cz = position.getZ(c) - az;
  const normal = [by * cz - bz * cy, bz * cx - bx * cz, bx * cy - by * cx];
  const across = Math.abs(normal[options.across]), along = Math.abs(normal[options.length]);
  if (cap !== undefined) {
    if (cap) {
      // Degenerate triangles remain on their authored end even without a face normal.
      const direction = normal[options.length] ||
        (position.getComponent(a, options.length) + position.getComponent(b, options.length) +
          position.getComponent(c, options.length)) / 3 - options.lengthMid;
      return direction < 0 ? 3 : 4;
    }
    // Authored hull mode covers every non-cap, including the floor and curved shoulders.
    return Math.abs(normal[1]) >= across ? 2 : 1;
  }
  if (Math.hypot(...normal) === 0 || (ay + position.getY(b) + position.getY(c)) / 3 < options.sillY) return 0;
  if (Math.abs(normal[1]) >= Math.max(across, along)) return normal[1] > 0 ? 2 : 0;
  if (along >= across) return normal[options.length] < 0 ? 3 : 4;
  return 1;
}

function copiedAttribute(source, sources) {
  const array = new source.array.constructor(sources.length * source.itemSize);
  const stride = source.isInterleavedBufferAttribute ? source.data.stride : source.itemSize;
  const offset = source.isInterleavedBufferAttribute ? source.offset : 0;
  for (let i = 0; i < sources.length; i++) for (let k = 0; k < source.itemSize; k++) {
    array[i * source.itemSize + k] = source.array[sources[i] * stride + offset + k];
  }
  const target = source.isInterleavedBufferAttribute
    ? new BufferAttribute(array, source.itemSize, source.normalized) : source.clone();
  target.array = array;
  target.count = sources.length;
  target.name = source.name;
  target.setUsage(source.isInterleavedBufferAttribute ? source.data.usage : source.usage);
  return target;
}

function reportFor(geometry, verticesBefore) {
  const verticesAfter = geometry.getAttribute('position').count;
  return { geometry, triangles: (geometry.index?.count ?? verticesAfter) / 3,
    verticesBefore, verticesAfter, addedVertices: verticesAfter - verticesBefore };
}

// One source vertex per distinct region/projection. Never triangulate or flatten the mesh.
function applyRegions(geometry, data, plans, writeUV = plans.some(plan => plan.metreUV)) {
  const { position, indices, minimum } = data;
  const sources = Array.from({ length: position.count }, (_, i) => i);
  const choices = Array.from({ length: position.count }, () => new Map());
  const regions = Array(position.count).fill(0), uv = Array(position.count * 2).fill(0);
  const nextIndices = indices.slice();
  for (let t = 0; t < plans.length; t++) {
    const { region, options, metreUV } = plans[t];
    const key = region === 0 ? 'none' : metreUV ? `${region}/${options.length}/${options.sillY}` : `${region}`;
    for (let corner = 0; corner < 3; corner++) {
      const offset = t * 3 + corner, source = indices[offset], variants = choices[source];
      let target = variants.get(key);
      if (target === undefined) {
        target = variants.size ? sources.length : source;
        if (variants.size) sources.push(source);
        variants.set(key, target);
        regions[target] = region;
        let u = 0, v = 0;
        if (region !== 0 && metreUV) {
          const along = position.getComponent(source, options.length) - minimum[options.length];
          const across = position.getComponent(source, options.across) - minimum[options.across];
          u = region === 3 || region === 4 ? across : along;
          v = region === 2 ? across : position.getY(source) - options.sillY;
        }
        uv[target * 2] = u; uv[target * 2 + 1] = v;
      }
      nextIndices[offset] = target;
    }
  }
  if (sources.length !== position.count) {
    const attributes = Object.entries(geometry.attributes).filter(([name]) => name !== 'regionId' && !(writeUV && name === 'uvMetre'));
    const morphs = Object.values(geometry.morphAttributes).flat();
    if ([...attributes.map(([, attr]) => attr), ...morphs].some(attr => attr.count !== position.count)) {
      throw new TypeError('Body kit requires matching per-vertex attribute counts');
    }
    for (const [name, attr] of attributes) geometry.setAttribute(name, copiedAttribute(attr, sources));
    for (const [name, attrs] of Object.entries(geometry.morphAttributes)) {
      geometry.morphAttributes[name] = attrs.map(attr => copiedAttribute(attr, sources));
    }
    // BufferGeometry chooses the index width, including promotion beyond 65,535 vertices.
    geometry.setIndex(nextIndices);
  }
  geometry.setAttribute('regionId', new BufferAttribute(new Uint8Array(regions), 1));
  if (writeUV) {
    geometry.setAttribute('uvMetre', new BufferAttribute(new Float32Array(uv), 2));
  }
  return reportFor(geometry, position.count);
}

/**
 * Mutate one hull at load when vehicleKit=1; otherwise return its unchanged counts.
 * Face winding must point outwards. By default, below-sill and downward faces remain none.
 * Optional capMaterialIndex selects the hull's authored end-cap material groups (bus: 1).
 * In that mode only caps become front/rear; every other triangle becomes side or roof by
 * |normal.lateral| vs |normal.up|, including downward faces and those below the sill.
 * Side UV = (length from minimum, height from sill); roof = (length, width from minimum);
 * ends = (width from minimum, height from sill). No atlas transform or material writes.
 * Region boundaries follow existing triangles: only shared corners with differing regions
 * are split. The return value reports triangles, verticesBefore/After and addedVertices.
 */
export function tagRegions(geometry, options = {}) {
  if (!(options.enabled ?? VEHICLE_KIT_ENABLED)) return reportFor(geometry, geometry.getAttribute('position').count);
  const projection = optionsFor(options), data = layout(geometry), plans = [];
  const caps = authoredCaps(geometry, data.indices.length, options.capMaterialIndex);
  projection.lengthMid = (data.minimum[projection.length] + data.maximum[projection.length]) / 2;
  for (let i = 0; i < data.indices.length; i += 3) {
    const region = faceRegion(data.position, ...data.indices.slice(i, i + 3), projection, caps?.[i / 3]);
    plans.push({ region, options: projection, metreUV: true });
  }
  return applyRegions(geometry, data, plans, true);
}

function materialPlan(value) {
  if (value === undefined) return { region: 0, options: optionsFor() };
  const descriptor = typeof value === 'object' && value !== null ? value : { region: value };
  const options = optionsFor(descriptor);
  // An explicit {sillY, lengthAxis} descriptor marks a primitive crossed by a band.
  // Only that primitive uses normal/height classification; named regions remain uniform.
  if (!Object.hasOwn(descriptor, 'region')) {
    if (!Object.hasOwn(descriptor, 'sillY')) throw new TypeError('Band primitives require sillY');
    return { region: null, options, metreUV: true };
  }
  const region = typeof descriptor.region === 'string' ? REGION_IDS[descriptor.region] : descriptor.region;
  if (!Number.isInteger(region) || region < 0 || region > 4) throw new TypeError('Unknown body-kit region');
  return { region, options, metreUV: Object.hasOwn(descriptor, 'sillY') };
}

function excluded(node) {
  for (let current = node; current; current = current.parent) if (EXCLUDED.test(current.name ?? '')) return true;
  return false;
}

/**
 * Exact material-name map (Map or own properties of an object). Values are region names/IDs.
 * A descriptor with sillY opts a band-crossing primitive into metre UVs: add region
 * to keep its named region, or omit region to classify its faces by normal and height.
 * Plain name/ID mappings tag whole primitives without adding a UV attribute (ruling 53).
 * Unmapped names and excluded node/material names get region 0. Mesh material arrays use
 * existing geometry groups; gaps remain 0 and overlapping groups are rejected.
 * Local geometry is assumed to be authored in metres (bake asset scale before calling).
 * Clone each mesh geometry to prevent tags leaking through shared GLB geometry. Materials,
 * groups, transforms and triangle counts stay intact. Returns one count report per mesh.
 */
export function regionsFromMaterialNames(object, map, { enabled = VEHICLE_KIT_ENABLED } = {}) {
  if (!enabled) return [];
  const entries = map instanceof Map ? [...map.entries()] : Object.entries(map);
  const mappings = new Map(entries.map(([name, value]) => [name, materialPlan(value)]));
  const none = materialPlan(undefined), reports = [];
  object.traverse(node => {
    if (!node.isMesh || !node.geometry) return;
    const data = layout(node.geometry), plans = Array(data.indices.length / 3).fill(none);
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const groups = Array.isArray(node.material) ? node.geometry.groups
      : [{ start: 0, count: data.indices.length, materialIndex: 0 }];
    const visited = new Set(), skip = excluded(node);
    for (const group of groups) {
      if (!Number.isInteger(group.start) || !Number.isInteger(group.count) || group.start < 0 ||
          group.count < 0 || group.start % 3 || group.count % 3 || group.start + group.count > data.indices.length) {
        throw new RangeError('Body kit material groups must contain whole triangles');
      }
      const name = materials[group.materialIndex]?.name ?? '';
      const plan = skip || EXCLUDED.test(name) ? none : mappings.get(name) ?? none;
      for (let i = group.start; i < group.start + group.count; i += 3) {
        const t = i / 3;
        if (visited.has(t)) throw new RangeError('Body kit material groups overlap');
        visited.add(t);
        plans[t] = plan.region === null
          ? { region: faceRegion(data.position, ...data.indices.slice(i, i + 3), plan.options), options: plan.options, metreUV: true }
          : plan;
      }
    }
    const geometry = node.geometry.clone();
    reports.push(applyRegions(geometry, data, plans));
    node.geometry = geometry;
  });
  return reports;
}
