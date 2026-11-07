import * as THREE from 'three';

// P16-0: provisional linear levels relative to each surface's existing effective albedo.
// Rulings 67/68: candidate shipping light; defaults remain unchanged without ?restyle=1.
export const SURFACE_ROLES = Object.freeze([
  'road', 'wheel-track', 'footpath', 'kerb', 'footpath-edge', 'tram-paving', 'tram-gutter',
  'driveway', 'port-apron', 'quay-concrete', 'quay-cope', 'venue-tarmac', 'venue-paving',
  'reserve-flat', 'beach-pad',
]);
const asphalt = (30 / 17) ** 2.2;
const paving = 4 * (64 / 65.5) ** 2.2;
const linearV = v => {const s = v / 100; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;};
const retune = (level, measured, target) => level * linearV(target) / linearV(measured);
export const SURFACE_LEVELS = Object.freeze({
  // Levelled from the switch-off measurement (17.3, 14.9) once batching kept every hook (orchestrator, 5 Nov).
  road: retune(1, 17.3, 30),
  'wheel-track': retune(1, 14.9, 30),
  footpath: paving,
  kerb: 4 * (64 / 72.2) ** 2.2,
  'footpath-edge': 4 * (64 / 65.9) ** 2.2,
  'tram-paving': paving,
  // Dark drainage/joint beds, measured V50.2 at this level; not pale concrete flags.
  'tram-gutter': 8,
  // V63 quantised tint is multiplied by genConcrete's roughly V60 map.
  driveway: retune((64 / 66.7) ** 2.2, 36.1, 64),
  // R1 port clones lost their level hook. Reapply once, after the final wear pass.
  // The apron's chroma trim (0.25) lowers V as well, so the level is retuned from the round 2 reading (33.7).
  'port-apron': retune(retune(1, 17.3, 30), 33.7, 30),
  // Damp #c3bfb7 x0.57, then the #bdb9af apron map; R1's V10 mixed non-ground uses.
  'quay-concrete': retune(linearV(64) / (linearV(76.5) * .57 * linearV(74.1)), 56.5, 64),
  'quay-cope': retune((64 / 76.5) ** 2.2, 43.5, 64),
  'venue-tarmac': retune(asphalt, 57.3, 30),
  'venue-paving': (64 / 76.5) ** 2.2,
  // Mixed ROW formation, soil, reserve bed edges and play surfacing: retain its tint range.
  'reserve-flat': (64 / 67.8) ** 2.2,
  'beach-pad': (64 / 60.4) ** 2.2,
});
export const SURFACE_BANDS = Object.freeze(Object.fromEntries(SURFACE_ROLES.map(role => [role,
  Object.freeze(['road','wheel-track','port-apron','venue-tarmac'].includes(role) ? [28,32]
    : role === 'tram-gutter' ? [46,54] : role === 'reserve-flat' ? [32,42] : [62,70]),
])));

// P18-1: world levels picked from p18-sweep-2/3 by eye against today's fields and bay (ruling 84):
// 01-overview sea 36 -> 56 against the roof at 77, open bay 28 -> 54, fields 25 -> 45.
export const WORLD_ROLES = Object.freeze(['sea', 'hinterland', 'far-crust', 'river']);
export const WORLD_LEVELS = Object.freeze({ sea: 3.6, hinterland: 3.5, 'far-crust': 3.5, river: 3 });
// Albedo tail cap for the land roles (linear, brightest channel, hue kept), after the level: pale straw paddocks
// clipped at V 94 once lifted (19-hinterland-west V94 share 0.0043 at sRGB V 72, 0.0024 at 0.40, 0.0013 at 0.33).
// 0.35 is sRGB V 63. Same kind as the beaux 0.88 albedo cap (ruling 80); rulings 84-85.
export const WORLD_CAPS = Object.freeze({ hinterland: 0.35, 'far-crust': 0.35 });

// P16-1, rulings 67–69: target sRGB mean; omitted families (including brick and
// foliage) retain their existing maps. Means are measured from the generated maps,
// never copied from the historical gain comments or pooled across atlas regions.
export const ATLAS_RESTYLE_LEVELS = Object.freeze({
  render: 1, concrete: 1, corrugated: 1, painted_metal: 1,
});

function readLevels(params, name, defaults, maximum) {
  const overrides = params.getAll(name);
  if (overrides.length !== 1 || !overrides[0]) return defaults;
  const levels = { ...defaults }, seen = new Set();
  for (const entry of overrides[0].split(',')) {
    const match = /^([a-z_-]+):((?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+))$/.exec(entry);
    if (!match) return defaults;
    const [, role, raw] = match, level = Number(raw);
    if (!Object.hasOwn(defaults, role) || seen.has(role) || !(level > 0 && level <= maximum)) return defaults;
    seen.add(role);
    levels[role] = level;
  }
  return Object.freeze(levels);
}

/** Each override table is atomic and independent of the other tables. */
export function readRestyle(search = '') {
  const params = new URLSearchParams(typeof search === 'string' ? search : '');
  return Object.freeze({
    enabled: params.getAll('restyle').length === 1 && params.get('restyle') === '1',
    levels: readLevels(params, 'restyleSurface', SURFACE_LEVELS, 8),
    worldLevels: readLevels(params, 'restyleWorld', WORLD_LEVELS, 8),
    worldCaps: readLevels(params, 'restyleWorldCap', WORLD_CAPS, 1),
    atlasLevels: readLevels(params, 'restyleAtlas', ATLAS_RESTYLE_LEVELS, 2),
  });
}

/** Apply after colour-writing hooks, before clones; river callers reset colour before reapplying. */
export function applyWorldRestyle(material, role, config = readRestyle(globalThis.location?.search ?? '')) {
  if (!material || !config.enabled) return material;
  if (!WORLD_ROLES.includes(role)) throw new Error('Unknown world role: ' + role);
  const level = config.worldLevels[role];
  if (role === 'river') {
    material.color.multiplyScalar(level);
    return material;
  }
  // Terrain palettes overwrite diffuse; their profile tints also get copied between owners.
  // The ocean's existing uWaterGain affects foam too. Level only its completed body,
  // before weather/swell shading, reflections, glints and foam are composed.
  const anchor = role === 'sea'
    ? 'if (uAquaWeather.x > 0.0) water.rgb = ddWaterWeather(water.rgb, uAquaWeather.x);'
    : '#include <lights_physical_fragment>';
  const target = role === 'sea' ? 'water.rgb' : 'diffuseColor.rgb';
  const previous = material.onBeforeCompile;
  // three's default key is onBeforeCompile's source, so it is read before the hook is replaced.
  const key = material.customProgramCacheKey();
  const uniform = { value: level };
  const cap = Object.hasOwn(WORLD_CAPS, role) ? { value: config.worldCaps?.[role] ?? WORLD_CAPS[role] } : null;
  material.defines = { ...material.defines, DD_RESTYLE_WORLD: 1 };
  material.onBeforeCompile = function onWorldRestyle(shader, renderer) {
    previous.call(this, shader, renderer);
    if (!shader.fragmentShader.includes(anchor) || !shader.fragmentShader.includes('#include <common>')) {
      throw new Error('World albedo boundary missing: ' + role);
    }
    shader.uniforms.p18WorldLevel = uniform;
    if (cap) shader.uniforms.p18WorldCap = cap;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n#ifdef DD_RESTYLE_WORLD\nuniform float p18WorldLevel;\n${cap ? 'uniform float p18WorldCap;\n' : ''}#endif`)
      .replace(anchor, `#ifdef DD_RESTYLE_WORLD\n${target} *= p18WorldLevel;\n${cap ? `{ float p18Max = max(max(${target}.r, ${target}.g), ${target}.b); if (p18Max > p18WorldCap) ${target} *= p18WorldCap / p18Max; }\n` : ''}#endif\n${anchor}`);
  };
  material.customProgramCacheKey = () => `${key}|p18-world-v2`;
  material.needsUpdate = true;
  return material;
}

// P17: ids use "<census entry>.<role>" (for example civic:community-recreation.wall).
// Kept outside materials: colour selection adds no shader hook, define or cache key.
export const restyleColourRegistry = new Map();
export function restyledIds(entryId) {
  return [...restyleColourRegistry.keys()].filter(id => id.startsWith(`${entryId}.`)).sort();
}
const colourSnapshot = value => value?.isColor ? value.clone() : value;
function selectedColour(base, restyled) {
  if (base?.isColor) return base.clone().set(restyled);
  if (typeof base === typeof restyled && ['string', 'number'].includes(typeof base)) return restyled;
  const colour = new THREE.Color(restyled);
  if (typeof base === 'string') return '#' + colour.getHexString();
  if (typeof base === 'number') return colour.getHex();
  throw new TypeError('Restyle colour must be a hex string, number or THREE.Color');
}
function requireColourId(config) {
  if (typeof config.id !== 'string' || !config.id.trim()) throw new TypeError('Restyle colour requires an id');
}
/** Options: { id, enabled? }; omitted enabled reads the live ?restyle=1 switch. */
export function restyleColour(base, restyled, config = readRestyle(globalThis.location?.search ?? '')) {
  if (!(config.enabled ?? readRestyle(globalThis.location?.search ?? '').enabled)) return base;
  requireColourId(config);
  const result = selectedColour(base, restyled);
  restyleColourRegistry.set(config.id, { base: colourSnapshot(base), restyled: colourSnapshot(restyled) });
  return result;
}
/** A vertex palette registers once; its elements retain their respective input kinds. */
export function restyleColours(baseArray, restyledArray, config = readRestyle(globalThis.location?.search ?? '')) {
  if (baseArray.length !== restyledArray.length) throw new RangeError('Restyle palette length mismatch');
  if (!(config.enabled ?? readRestyle(globalThis.location?.search ?? '').enabled)) return baseArray;
  requireColourId(config);
  const result = baseArray.map((base, index) => selectedColour(base, restyledArray[index]));
  restyleColourRegistry.set(config.id, {
    base: baseArray.map(colourSnapshot), restyled: restyledArray.map(colourSnapshot),
  });
  return result;
}

const concreteMaps = new WeakSet();
/** Identify the base TextureLibrary map without changing texture/material metadata. */
export function recordAtlasConcreteMap(map, setId) {
  if (setId === 'concrete') concreteMaps.add(map);
}
const atlasMeans = new WeakMap();
const toLinear = s => s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;

/** wu-family-gain method: mean sRGB channels in the sampled rectangle, then decode.
 * Runs once per generated image/region at shader build time, never per frame/instance.
 * Canvas rows run down; atlas offsets run up while flipY is enabled.
 */
export function measureAtlasAlbedo(map, region = null) {
  const image = map?.image, W = image?.width, H = image?.height;
  if (!(W > 0 && H > 0)) return null;
  const w = region ? Math.max(1, Math.round(region.scale[0] * W)) : W;
  const h = region ? Math.max(1, Math.round(region.scale[1] * H)) : H;
  const x = region ? Math.round(region.offset[0] * W) : 0;
  const y = region ? Math.round(map.flipY ? H - region.offset[1] * H - h : region.offset[1] * H) : 0;
  if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || x + w > W || y + h > H) return null;
  let cache = atlasMeans.get(map);
  if (!cache || cache.image !== image || cache.version !== map.version || cache.space !== map.colorSpace) {
    cache = { image, version: map.version, space: map.colorSpace, regions: new Map() };
    atlasMeans.set(map, cache);
  }
  const key = [x, y, w, h].join(',');
  if (cache.regions.has(key)) return cache.regions.get(key);
  const pixels = image.data;
  const canvasPixels = pixels ? null : image.getContext?.('2d', { willReadFrequently: true })
    ?.getImageData(x, y, w, h).data;
  if (!pixels && !canvasPixels) return null;
  const sums = [0, 0, 0];
  for (let row = 0; row < h; row++) for (let col = 0; col < w; col++) {
    const index = pixels ? ((y + row) * W + x + col) * 4 : (row * w + col) * 4;
    for (let c = 0; c < 3; c++) sums[c] += (pixels ?? canvasPixels)[index + c] / 255;
  }
  const srgbMean = sums.map(sum => sum / (w * h));
  const channels = map.colorSpace === THREE.SRGBColorSpace ? srgbMean.map(toLinear) : srgbMean;
  const mean = .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  const result = Object.freeze({ srgbMean: Object.freeze(srgbMean), mean });
  cache.regions.set(key, result);
  return result;
}

function atlasScale(material, shader, levels) {
  // Match paintedAlbedoGain's recorded-gain predicate. Both the atlas and base
  // concrete finishers already cancelled this gain in material colour.
  const finishes = material.userData;
  if (finishes?.r7bPaintedTile && [finishes.kitRoofEdgeFinished?.gain, finishes.kitDarkWalls?.baseGain]
    .some(gain => Array.isArray(gain) && gain.length === 3
      && [0, 1, 2].every(index => Number.isFinite(gain[index]) && gain[index] >= 0 && gain[index] <= 1))) return 1;
  const map = material.map;
  let family, region = null;
  if (map?.userData?.residentialAtlas) {
    family = material.userData.residentialAtlasFamily ?? material.userData.residentialAtlas?.family;
    if (!Object.hasOwn(levels, family)) return 1;
    const offset = shader.uniforms.ddResidentialAtlasFragOffset?.value;
    const scale = shader.uniforms.ddResidentialAtlasFragScale?.value;
    if (!offset || !scale) return 1;
    region = { offset: [offset.x, offset.y], scale: [scale.x, scale.y] };
  } else if (finishes?.r7bPaintedTile) {
    // Ruling 71: ordinary kit maps use the authored material family. Port roofs
    // have no family tag, so use their existing painted-tile record instead.
    family = finishes.family ?? finishes.r7bPaintedTile.family;
    if (!Object.hasOwn(levels, family)) return 1;
  } else if (concreteMaps.has(map) && material.userData?.family === 'concrete') {
    family = 'concrete';
  } else return 1;
  // Painted tiles retain a cached, decoded sample mean. Cancel that exact gain,
  // not the separate full-resolution mean used by the unpainted map path.
  const gain = shader.uniforms.r7bBaseGain?.value;
  const mean = gain ? .2126 * gain.x + .7152 * gain.y + .0722 * gain.z
    : measureAtlasAlbedo(map, region)?.mean;
  return mean > 0 ? toLinear(levels[family]) / mean : 1;
}

const atlasHooked = new WeakSet();
/** Read at the shared kit sampling boundary, outside the raw-colour authoring files.
 * All kit families keep the same shader shape/key partition. Untargeted maps use 1.
 * The painted pass replaces the atlas sample: scale its existing gain instead of
 * multiplying the discarded sample or the later colour/lighting/finish operations.
 */
export function applyAtlasRestyle(material, config = readRestyle(globalThis.location?.search ?? '')) {
  if (!material || !config.enabled || atlasHooked.has(material)) return material;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  const inheritedKey = previousKey === Object.getPrototypeOf(material).customProgramCacheKey
    ? previousKey.call(material) : null;
  const levels = config.atlasLevels;
  const token = Object.keys(ATLAS_RESTYLE_LEVELS).map(family => levels[family]).join(',');
  material.onBeforeCompile = function onAtlasRestyle(shader, renderer) {
    previous?.call(this, shader, renderer);
    const scale = atlasScale(this, shader, levels);
    shader.uniforms.p16AtlasLevel = { value: scale };
    const gain = shader.uniforms.r7bBaseGain?.value;
    if (gain) {
      // Preserve downstream string contracts and never mutate the cached Vector3
      // shared by painted materials. This also reaches the deco roof grain pass.
      shader.uniforms.r7bBaseGain = { value: gain.clone().multiplyScalar(scale) };
      return;
    }
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      '#include <common>\nuniform float p16AtlasLevel;');
    const atlas = 'vec4 sampledDiffuseColor = ddResidentialAtlasSample( map );';
    if (shader.fragmentShader.includes(atlas)) {
      shader.fragmentShader = shader.fragmentShader.replace(atlas,
        atlas + '\n\tsampledDiffuseColor.rgb *= p16AtlasLevel;');
    } else {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
        THREE.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;',
          'sampledDiffuseColor.rgb *= p16AtlasLevel;\n\tdiffuseColor *= sampledDiffuseColor;'));
    }
  };
  // A whole gain set identifies the preview, never a family, material or instance.
  material.customProgramCacheKey = function atlasRestyleKey() {
    return `${inheritedKey ?? previousKey?.call(this) ?? ''}|p16-atlas-v1:${token}`;
  };
  atlasHooked.add(material);
  material.needsUpdate = true;
  return material;
}

// Weak state deliberately is not serialised into userData: three.js clones tags but not hooks.
const hooked = new WeakMap();

/** Tag at the owner site. Off changes metadata only; on adds one final-diffuse uniform. */
export function tagSurface(material, role, config = readRestyle(globalThis.location?.search ?? '')) {
  if (!material) return material;
  // A ground material cloned for a different use has metadata but no inherited compile hook.
  if (role === null) {
    if (hooked.has(material)) throw new Error('Cannot clear an active surface level');
    delete material.userData?.surfaceRole;
    return material;
  }
  if (!SURFACE_ROLES.includes(role)) throw new Error('Unknown surface role: ' + role);
  material.userData ??= {};
  material.userData.surfaceRole = role;
  if (!config.enabled) return material;
  const level = config.levels[role];
  const existing = hooked.get(material);
  if (existing) {
    if (existing.value !== level) { existing.value = level; material.needsUpdate = true; }
    return material;
  }
  const uniform = { value: level };
  const chroma = { value: role === 'port-apron' ? 0.25 : 1 };
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey?.() ?? '';
  material.onBeforeCompile = function onSurfaceRestyle(shader, renderer) {
    previous?.call(this, shader, renderer);
    const anchor = '#include <lights_physical_fragment>';
    if (!shader.fragmentShader.includes(anchor)) throw new Error('Surface diffuse-lighting boundary missing');
    shader.uniforms.p16SurfaceLevel = uniform;
    shader.uniforms.p16SurfaceChroma = chroma;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float p16SurfaceLevel;\nuniform float p16SurfaceChroma;')
      .replace(anchor, 'float p16SurfacePeak = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));\n'
        + 'diffuseColor.rgb = mix(vec3(p16SurfacePeak), diffuseColor.rgb, p16SurfaceChroma);\n'
        + 'diffuseColor.rgb *= p16SurfaceLevel;\n' + anchor);
  };
  // Role is metadata, never a define/key. Existing different shaders still keep their own keys.
  material.customProgramCacheKey = () => `${key}|p16-surface-v1:${uniform.value}`;
  hooked.set(material, uniform);
  material.needsUpdate = true;
  return material;
}

// Record authored identities at the existing factory. Clones retain metadata, never stale hooks.
const PORT_SOURCES = Object.freeze({
  '#b9b5ab':'concrete', '#8e8a80':'concreteDark', '#b4b0a6':'concreteWork',
  '#c6c2b7':'cope', '#3b4247':'apronDark', '#4a5157':'apronMid',
});
export function recordPortSurfaceSource(material, colour, owner) {
  if (owner !== 'fringe/ships.js') return;
  const hex = typeof colour === 'number' ? '#' + colour.toString(16).padStart(6, '0') : colour;
  const source = PORT_SOURCES[hex];
  if (source) {
    material.userData.portSurfaceSource = source;
    material.userData.portSurfaceAuthored = hex;
  }
}

/** Port material references are shared by ground, buildings and boats. Select their ground uses. */
export function portSurfaceRole(mesh, material) {
  const source = material?.userData?.portSurfaceSource;
  if (!source || material.userData.portMatRoof || material.userData.portWear?.klass === 'painted-steel') return null;
  const name = mesh.name ?? '';
  if (/^fringe:port-(?:cope|far-wharf):coping-stone:/.test(name)) {
    return source === 'cope' ? 'quay-cope' : 'quay-concrete';
  }
  if (name === 'fringe:port-far-wharf:deck') return 'quay-concrete';
  // Only the thin, horizontal apron and its ground markings. Quay faces, breakwater,
  // shed walls, roofs, ships, piles and machinery are separate structural surfaces.
  let terminal = false;
  for (let parent = mesh.parent; parent; parent = parent.parent) {
    if (/^fringe:ship:/.test(parent.name)) return null;
    if (parent.name === 'fringe:port-terminal') terminal = true;
  }
  if (!terminal || mesh.isInstancedMesh || !mesh.geometry) return null;
  mesh.updateMatrix();
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix);
  const size = box.getSize(new THREE.Vector3());
  if (box.max.y > 0.8 || box.min.y < 0 || size.y > 0.35 || Math.max(size.x, size.z) < 1) return null;
  return source.startsWith('apron') ? 'port-apron' : source === 'cope' ? 'quay-cope' : 'quay-concrete';
}

// Board.update runs before the first static bake. Work on final wear/cloned materials.
export function tagPortSurfaces(scene, config = readRestyle(globalThis.location?.search ?? '')) {
  const port = scene?.getObjectByName('fringe:port');
  if (!port) return false;
  const uses = new Map();
  port.traverse(mesh => {
    if (!mesh.isMesh) return;
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material, index) => {
      // Port roofs bypass applyKitAO; attach after their final wear/cloning pass.
      if (material?.userData?.r7bPaintedTile) applyAtlasRestyle(material, config);
      if (!material?.userData?.portSurfaceSource) return;
      const slots = uses.get(material) ?? [];
      slots.push({mesh, index, role:portSurfaceRole(mesh, material)}); uses.set(material, slots);
    });
  });
  for (const [material, slots] of uses) {
    const roles = new Set(slots.map(slot => slot.role));
    for (const role of roles) {
      if (!role) continue;
      // With the switch off nothing is cloned: a material shared by several roles keeps one object and the role is
      // recorded on each owning mesh, so ?albedoGain and every other material walk see today's objects.
      if (!config.enabled && roles.size > 1) {
        for (const {mesh,role:ownerRole} of slots) if (ownerRole === role) mesh.userData.surfaceRole = role;
        continue;
      }
      // Isolate ground uses without changing any colour, map, hook or cache key.
      const target = roles.size === 1 ? material : material.clone();
      if (target !== material) {
        target.userData = {...material.userData};
        target.onBeforeCompile = material.onBeforeCompile;
        target.customProgramCacheKey = material.customProgramCacheKey;
      }
      tagSurface(target, role, config);
      for (const {mesh,index,role:ownerRole} of slots) if (ownerRole === role) {
        if (Array.isArray(mesh.material)) {mesh.material = [...mesh.material]; mesh.material[index] = target;}
        else mesh.material = target;
      }
    }
  }
  return true;
}

// P18-2, rulings 82 c and 83: the airport buildings' near-white surfaces clip under the candidate light.
// airport.js sits under the touched-file rule (rulings 34, 53), so the cap is applied after the build,
// as tagPortSurfaces does: opaque, non-emissive, non-glass colours above V 77 on these buildings are
// scaled in sRGB to the aim (hue and S kept), on clones, so aircraft, vehicles and runway keep theirs.
export const AIRPORT_RESTYLE_GROUPS = Object.freeze([
  ['fringe:tullamarine-terminal', 'airport:terminal'], ['fringe:tullamarine-t2', 'airport:terminal-2'],
  ['fringe:tullamarine-car-park', 'airport:car-park'], ['fringe:tullamarine-jetbridge', 'airport:jet-bridge'],
  ['fringe:tullamarine-hotel', 'airport:hotel'],
]);
// The airport clips in today's look too (neighbours-sun 0.0214); its walls (V 72-81, vertex-coloured) reach V 94
// in sun. Aim 62 from p18-sweep-3 (neighbours-sun 0.0210 at 70, 0.0022 at 62); `restyleAirportAim` (50-90) tunes it.
export const AIRPORT_WALL_AIM = 62;
export function airportAim(search = globalThis.location?.search ?? '') {
  const raw = new URLSearchParams(typeof search === 'string' ? search : '').get('restyleAirportAim');
  const n = raw == null || raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 50 && n <= 90 ? n : AIRPORT_WALL_AIM;
}
export function cappedSrgbHex(hex, aim) {
  const ch = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)), v = Math.max(...ch) / 2.55;
  return v > aim ? '#' + ch.map(c => Math.round(c * aim / v).toString(16).padStart(2, '0')).join('') : hex;
}
// Vertex colours multiply material.color, so scaling the colour caps the product as well.
function airportCappable(m, mesh) {
  if (!m?.color?.isColor || m.transparent || (m.metalness ?? 0) > 0.5) return false;
  if (/glass|lamp|light|beacon|letters|digit|board/i.test(`${m.name ?? ''} ${mesh.name ?? ''}`)) return false;
  return !(m.emissive && m.emissive.getHex() !== 0 && (m.emissiveIntensity ?? 1) > 0);
}
export function restyleAirport(root, config = readRestyle(globalThis.location?.search ?? ''), aim = airportAim()) {
  if (!root || !config.enabled) return 0;
  const clones = new Map();
  let capped = 0;
  root.traverse(group => {
    const match = AIRPORT_RESTYLE_GROUPS.find(([prefix]) => group.name === prefix || group.name?.startsWith(prefix + '-') || group.name?.startsWith(prefix + ':'));
    if (!match || group.userData.p18AirportCapped) return;
    group.userData.p18AirportCapped = true;
    group.traverse(mesh => {
      mesh.userData.p18AirportCapped = true;
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = list.map(m => {
        if (!airportCappable(m, mesh)) return m;
        if (clones.has(m)) return clones.get(m);
        const base = '#' + m.color.getHexString(), target = cappedSrgbHex(base, aim);
        if (target === base) { clones.set(m, m); return m; }
        const role = (m.name || mesh.name.replace(/^fringe:tullamarine-/, '') || 'surface').replace(/[^a-z0-9-]+/gi, '-');
        const clone = m.clone();
        clone.color.set(restyleColour(base, target, { ...config, id: `${match[1]}.${role}` }));
        clones.set(m, clone); capped++;
        return clone;
      });
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
    });
  });
  return capped;
}
