import { tagSurface } from '../style/restyle.js';
import * as THREE from 'three';
import { BOARD_EDGE } from '../board.js';
import { GP_SHIFT_X } from './events/shared.js';
import { COAST_DETAIL_GLSL, loadCoastPack } from '../coast-textures.js';
import { COAST_SPINE_GLSL } from '../coast-spine.js';
import { LAND_EDGE, LAND_EDGE_UNIFORMS_GLSL, LAND_EDGE_UNIFORM_NAMES, landFieldUniforms, landWeightAt } from '../land-edge.js';

// R3: the city-facing land boundary is expressed in the venue's shore frame.
// Cut surface triangles at that boundary; reject a dressing instance in full
// when any part of its footprint crosses it. Never relocate rejected objects.
// `extraDressing` is an opt-in RegExp of further instanced families that must be
// rejected whole when they cross the line (trunks, canopies, paving wear). The
// airport and the station call this with four arguments and keep the original set.
export function clipVenueCityEdge(root, frame, minZ, groundMaterials = [], extraDressing = null) {
  root.updateWorldMatrix(true, true);
  frame.updateWorldMatrix(true, false);
  // Terrain was seated before trimming the city-facing fringe. Preserve that
  // measured anchor in local space: deleting dressing must not move the hill.
  if (!root.userData.venueTerrainAnchor) {
    const centre = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
    root.userData.venueTerrainAnchor = root.worldToLocal(centre).toArray();
  }
  const inverse = frame.matrixWorld.clone().invert();
  const census = { boundary: minZ, meshes: 0, triangles: 0, instances: 0, byBuilder: {} };
  const candidates = [];
  root.traverse((node) => {
    if (!node.isMesh) return;
    const dressing = /(?:rocks|rubble|litter|tuft|tussock|shrub|hedge|leaf-cluster-tree|rim-fence|turf-fine|turf-wide|turf-feather|boulders)/.test(node.name)
      || (extraDressing !== null && extraDressing.test(node.name));
    const ground = groundMaterials.includes(node.material)
      || /(?:estate$|batter|bank$|soil|ground|edge:|apron:service-|rim-kerb|road|footpath|paving-wear)/.test(node.name);
    if (dressing || ground) candidates.push({ node, dressing });
  });
  for (const { node, dressing } of candidates) {
    const geo = node.geometry, pos = geo?.attributes.position;
    if (!pos) continue;
    const transform = inverse.clone().multiply(node.matrixWorld);
    geo.computeBoundingBox();
    const count = node.isInstancedMesh ? node.count : 1;
    let kept = 0, removed = 0;
    const matrix = new THREE.Matrix4(), full = new THREE.Matrix4();
    if (node.isInstancedMesh || dressing) {
      for (let i = 0; i < count; i++) {
        if (node.isInstancedMesh) node.getMatrixAt(i, matrix); else matrix.identity();
        full.multiplyMatrices(transform, matrix);
        const bounds = geo.boundingBox.clone().applyMatrix4(full);
        if (bounds.min.z < minZ - 1e-5) { removed++; continue; }
        if (node.isInstancedMesh && kept !== i) {
          node.setMatrixAt(kept, matrix);
          if (node.instanceColor) {
            const color = new THREE.Color(); node.getColorAt(i, color); node.setColorAt(kept, color);
          }
        }
        kept++;
      }
      if (removed) {
        if (node.isInstancedMesh) {
          node.count = kept; node.instanceMatrix.needsUpdate = true;
          if (node.instanceColor) node.instanceColor.needsUpdate = true;
          node.computeBoundingBox(); node.computeBoundingSphere();
        } else node.removeFromParent();
        census.instances += removed;
      }
    } else if (geo.boundingBox.clone().applyMatrix4(transform).min.z < minZ - 1e-5) {
      const attributes = Object.entries(geo.attributes);
      const output = Object.fromEntries(attributes.map(([name]) => [name, []]));
      const index = geo.index;
      const vertex = (i) => {
        const data = Object.fromEntries(attributes.map(([name, a]) => [name,
          Array.from({ length: a.itemSize }, (_, k) => a.getComponent(i, k))]));
        data.distance = new THREE.Vector3(...data.position).applyMatrix4(transform).z - minZ;
        return data;
      };
      let changed = 0;
      for (let i = 0; i < (index?.count ?? pos.count); i += 3) {
        const polygon = [0, 1, 2].map((j) => vertex(index ? index.getX(i + j) : i + j));
        if (polygon.some((v) => v.distance < -1e-5)) changed++;
        const clipped = [];
        for (let j = 0; j < polygon.length; j++) {
          const a = polygon[j], b = polygon[(j + 1) % polygon.length];
          if (a.distance >= 0) clipped.push(a);
          if ((a.distance >= 0) !== (b.distance >= 0)) {
            const t = a.distance / (a.distance - b.distance);
            clipped.push(Object.fromEntries(attributes.map(([name]) => [name,
              a[name].map((v, k) => v + (b[name][k] - v) * t)])));
          }
        }
        for (let j = 1; j + 1 < clipped.length; j++) {
          for (const v of [clipped[0], clipped[j], clipped[j + 1]]) {
            for (const [name] of attributes) output[name].push(...v[name]);
          }
        }
      }
      if (changed) {
        const clipped = new THREE.BufferGeometry();
        for (const [name, a] of attributes) clipped.setAttribute(name,
          new THREE.Float32BufferAttribute(output[name], a.itemSize));
        clipped.computeBoundingBox(); clipped.computeBoundingSphere();
        node.geometry = clipped; node.userData.ownsGeometry = true;
        census.triangles += changed; removed = changed;
      }
    }
    if (removed) {
      census.meshes++;
      census.byBuilder[node.name || '(unnamed ground)'] = (census.byBuilder[node.name || '(unnamed ground)'] ?? 0) + removed;
    }
  }
  root.userData.cityEdgeClip = census;
  return census;
}

export function useCityGroundPalette(materials) {
  for (const [name, material] of Object.entries(materials)) {
    const color = /^(asphalt|tarmac)$/.test(name) ? BOARD_EDGE.asphalt
      : /^(kerb|paving)$/.test(name) ? BOARD_EDGE.footpath
      : /^(grass|grassShade|grassAlt|grassDeep|turf.*|batterCrown|batterToe.*)$/.test(name) ? BOARD_EDGE.ground : null;
    if (!color || !material?.color) continue;
    material.color.set(color); material.metalness = 0;
    material.roughness = color === BOARD_EDGE.asphalt ? 0.94 : 0.92;
    if (/^(asphalt|tarmac)$/.test(name)) tagSurface(material, 'venue-tarmac');
    if (/^(kerb|paving)$/.test(name)) tagSurface(material, 'venue-paving');
  }
}

// T15: precinct maintenance ends before the worked country. World metres keep
// patches stable across tessellation, camera motion and instancing.
export function venueGroundRegions(extent) {
  // taste-r1 W79 (L2): under LAND_EDGE the rectangles (seed-0 coordinates, wholly water on seed 1) are only carried for the old uniform slots; the weight is the land edge's.
  const regions = [new THREE.Vector4(-165, 30, -12, extent.z - 8),
    new THREE.Vector4(-20, extent.z + 12, extent.x - 18, extent.z + 145)];
  regions.landExtent = extent;
  return regions;
}

export function venueGroundWeight(x, z, regions) {
  if (LAND_EDGE.readers.venue && regions.landExtent) return landWeightAt(x, z, regions.landExtent);
  const smooth = (v) => { const t = Math.max(0, Math.min(1, v / 12)); return t * t * (3 - 2 * t); };
  return Math.max(...regions.map((r) => smooth(Math.min(x - r.x, z - r.y, r.z - x, r.w - z))));
}

export function venueGroundPaths(extent) {
  // Outside the terminal apron and stadium hardscape: gate-to-parking links,
  // with a service path following the rail verge. Never cross the airside slab.
  return [new THREE.Vector4(-77, 132, -57, 178),
    new THREE.Vector4(-57, 178, -60, 238),
    new THREE.Vector4(-57, 178, -35, 174),
    new THREE.Vector4(30, extent.z + 30, 42, extent.z + 63),
    new THREE.Vector4(42, extent.z + 63, 15, extent.z + 98),
    // The last link is the circuit's own service path and moves with the circuit.
    new THREE.Vector4(174 + GP_SHIFT_X, extent.z + 31, 185 + GP_SHIFT_X, extent.z + 83)];
}

export function distanceToVenuePath(x, z, paths) {
  return Math.min(...paths.map((p) => {
    const dx = p.z - p.x, dz = p.w - p.y;
    const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.y) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - p.x - t * dx, z - p.y - t * dz);
  }));
}

export function recessVenuePaths(geometry, extent) {
  const paths = venueGroundPaths(extent), regions = venueGroundRegions(extent);
  const positions = geometry.attributes.position;
  let recessed = 0;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    if (venueGroundWeight(x,z,regions) < 0.95) continue;
    const d = distanceToVenuePath(x,z,paths);
    if (d >= 0.8) continue;
    positions.setY(i, positions.getY(i) - 0.04 * (1 - (d/0.8)**2));
    recessed++;
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return recessed;
}

// Round two options, both opt-in so the airport and the station keep their look:
//   dry       hex of the dry-grass token; local lawns then wear toward it (sqrt-space mix at 0.8
//             over the same 20% wear mask) instead of the fixed warm nudge.
//   earthGain multiplier on the hard-coded earth and soil tones, which are albedo-bright for a
//             venue lit this hot (the lit result reads V 70+); Rod Laver passes the display transfer.
//   join      taste-r1 (W20-C): `{ table, worn, near }` joins a venue's lawn to the country around it (local mode,
//             not soil). `table` is 96 floats, the precinct radius (venue-local metres) at bearing k / 96 of a
//             turn (x = sin a, z = cos a), filled by the venue once its radius function exists; the lawn's outer
//             stretch wears into `worn` (an albedo hex, the paddock's colour) in tongues and patches; and the
//             turf carries the paddock's grass grain from the ground pack (`near` false drops the 16 m layer).
//             Null leaves the shader as it was.
export const VENUE_JOIN_BANDS = Object.freeze({
  /** Wear starts this far inside the precinct edge (m) and is complete this far outside it. */
  from: -15.0,
  to: 2.0,
  /** Metres the wear edge wanders: patches at 5.5 m, tongues at 16 m, a fine break at 1.9 m. */
  wobble: Object.freeze([7.0, 9.0, 2.0]),
  /** Grain: near layer repeat and amplitude (the paddock's meadow channel), macro layer repeat and strength. */
  nearRepeatM: 16,
  nearAmp: 1.05,
  macroRepeatM: 96,
  macroAmp: 0.7,
  /** Broad turf variation at about half the paddock relief's strength (30 to 80 m). */
  broadVal: 0.10,
  broadHue: 0.045,
  /** A grassed batter shows this share of the exposed-soil tone (the bank discs that once covered it are not built). */
  batterSoil: 0.3,
});

/** taste-r1 (W20-D): 1 gives the hinterland sheet's worn straw small torn patches near the turf's value; 0 restores the soft hay blobs. */
export const VENUE_WEAR_TORN = 1;

export function attachVenueGround(material, { extent = { x: 272, z: 272 }, seed = 0, local = false, soil = false, dry = null, earthGain = 1, join = null, reach = 0, ribbon = false } = {}) {
  if (material.userData.venueGround) return material;
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  const joinOn = !!(join && local && !soil);
  const landOn = !!(LAND_EDGE.readers.venue && !local);
  const wearOn = joinOn && Array.isArray(join.table);
  // taste-r1 (W27-strip): a ribbon grown by `reach` is painted as the venue lawn it leads to, so it takes no wear of its own: the
  // hinterland's torn straw (0.17, 0.17, 0.085) read as brown patches on the band (L* 43-52, hue 103 against the lawn's 116).
  // W79 fix 4 (L2): under the venue reader the tray ribbon (`ribbon`) is painted by the weight (the apron), grown by no reach, and takes no torn wear either.
  const joined = (reach > 0 || (ribbon && landOn)) && !local && !dry && !soil;
  const tornWear = VENUE_WEAR_TORN > 0 && !local && !dry && !soil && !joined;
  const J = VENUE_JOIN_BANDS;
  const jPack = joinOn ? loadCoastPack('ground') : null;
  // taste-r1 (W26-venue): `reach` metres grows each region outward on all four sides, so a ribbon that lies in the 12 m
  // before the region begins (the tray band at the city edge) is painted as the lawn it leads to. 0 is the old rectangle.
  const regions = venueGroundRegions(extent);
  if (reach > 0) for (const r of regions) { r.x -= reach; r.y -= reach; r.z += reach; r.w += reach; }
  const state = { mix: { value: 1 }, regions, paths: venueGroundPaths(extent),
    patchMetres: [6, 20], patchLuma: 6, mowingLuma: 2.5, pathWidth: 1.6, local, soil, dry, earthGain, join };
  material.userData.venueGround = state;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    if (joinOn) {
      if (wearOn) {
        const w = new THREE.Color(join.worn);
        shader.uniforms.uVjTable = { value: join.table };
        shader.uniforms.uVjWorn = { value: new THREE.Vector3(Math.sqrt(w.r), Math.sqrt(w.g), Math.sqrt(w.b)) };
      }
      shader.uniforms.uVjPack = { value: jPack.texture };
      shader.uniforms.uVjReady = jPack.ready;
    }
    if (landOn) {
      const lu = landFieldUniforms(extent);
      for (const k of Object.keys(lu)) shader.uniforms[k] = lu[k];
    }
    shader.uniforms.uVenueMix = state.mix;
    shader.uniforms.uVenueRegions = { value: state.regions };
    shader.uniforms.uVenuePaths = { value: state.paths };
    shader.uniforms.uVenueSeed = { value: seed % 997 };
    shader.uniforms.uVenueEarth = { value: earthGain };
    shader.uniforms.uVenueDry = { value: dry ? (() => { const c = new THREE.Color(dry); return new THREE.Vector3(Math.sqrt(c.r), Math.sqrt(c.g), Math.sqrt(c.b)); })() : new THREE.Vector3() };
    shader.uniforms.uVenueExtent = { value: new THREE.Vector2(extent.x, extent.z) };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 vVenueWorld;${joinOn ? '\nvarying vec3 vVenueLocal;' : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
      vec4 venuePosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        venuePosition = instanceMatrix * venuePosition;
      #endif
      vVenueWorld = (modelMatrix * venuePosition).xyz;${joinOn ? '\n      vVenueLocal = venuePosition.xyz;' : ''}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vVenueWorld;
${joinOn ? `varying vec3 vVenueLocal;
uniform sampler2D uVjPack;
uniform float uVjReady;
${COAST_DETAIL_GLSL}` : ''}
${wearOn ? `uniform vec4 uVjTable[24];
uniform vec3 uVjWorn;
float venueEdgeR(float a) {
  float u = fract(a / 6.2831853) * 96.0;
  float i0 = floor(u);
  int k0 = int(i0);
  int k1 = (k0 + 1) % 96;
  float r0 = uVjTable[k0 >> 2][k0 & 3];
  float r1 = uVjTable[k1 >> 2][k1 & 3];
  return mix(r0, r1, u - i0);
}` : ''}${landOn ? `\n${COAST_SPINE_GLSL}\n${LAND_EDGE_UNIFORMS_GLSL}` : ''}
uniform float uVenueMix, uVenueSeed, uVenueEarth;
uniform vec3 uVenueDry;
uniform vec2 uVenueExtent;
uniform vec4 uVenueRegions[2], uVenuePaths[6];
float venueHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uVenueSeed) * 43758.5453); }
float venueNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(venueHash(i), venueHash(i + vec2(1, 0)), f.x),
    mix(venueHash(i + vec2(0, 1)), venueHash(i + vec2(1)), f.x), f.y);
}
float venueRegion(vec2 p) {${landOn ? '\n  return ddPrecinctWeightAt(p);\n}\nfloat venueRegionRects(vec2 p) {' : ''}
  float mask = 0.0;
  for (int i = 0; i < 2; i++) {
    vec4 r = uVenueRegions[i];
    mask = max(mask, smoothstep(0.0, 12.0, min(min(p.x-r.x,p.y-r.y),min(r.z-p.x,r.w-p.y))));
  }
  return mask;
}
float venuePathDistance(vec2 p) {
  float distanceToPath = 1e5;
  for (int i = 0; i < 6; i++) {
    vec4 path = uVenuePaths[i]; vec2 d = path.zw - path.xy;
    float t = clamp(dot(p-path.xy,d)/dot(d,d),0.0,1.0);
    distanceToPath = min(distanceToPath,length(p-path.xy-t*d));
  }
  return distanceToPath;
}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
{
  vec2 p = vVenueWorld.xz;
  float mask = ${local ? '1.0' : 'venueRegion(p)'} * uVenueMix;
  float patchTone = (venueNoise(p / 20.0 + venueNoise(p / 6.0)) - 0.5) * 2.0;
  float fine = venueNoise(p * 2.1) - 0.5;
  float distanceToPath = venuePathDistance(p);
  float path = 1.0 - smoothstep(0.55, 0.8 + fwidth(distanceToPath), distanceToPath);
  float verge = 1.0 - smoothstep(1.3, 4.2, distanceToPath);
  float roadVerge = ${landOn ? '0.0' : `max((1.0 - smoothstep(2.0, 6.0, abs(p.x + 27.0)))
    * step(30.0, p.y) * step(p.y, uVenueExtent.y),
    (1.0 - smoothstep(2.0, 6.0, abs(p.y - uVenueExtent.y - 25.0)))
    * step(0.0,p.x) * step(p.x,uVenueExtent.x))`};
  verge = max(verge, roadVerge);
  float mowing = sin(p.y * 1.256637 + sin(p.x / 43.0) * 0.3)
    * max(0.0, 1.0 - fwidth(p.y / 5.0));
  vec3 grass = ${local ? 'sqrt(max(diffuseColor.rgb,vec3(0.001)))' : 'vec3(0.09, 0.14, 0.055)'};
  grass += vec3(patchTone * (4.0 / 255.0) + mowing * (0.75 / 255.0) + fine * 0.012);
  // Sparse dry roots sit inside the broad patches, never an all-over checker.
  ${tornWear ? `// taste-r1 (W20-D): the hinterland's worn straw is a few small torn patches close to the turf in value, not soft hay blobs.
  float wearN = venueNoise(p / 8.0 + patchTone) + (venueNoise(p / 2.3 + 6.0) - 0.5) * 0.28 + (venueNoise(p / 0.9 + 3.0) - 0.5) * 0.14;
  float wear = smoothstep(0.69, 0.75, wearN);
  grass = mix(grass, vec3(0.17, 0.17, 0.085), wear * 0.42);` : `float wear = smoothstep(0.58, 0.77, venueNoise(p / 8.0 + patchTone));
  grass = mix(grass, ${dry ? 'uVenueDry' : (local ? 'grass + vec3(0.04, 0.025, 0.005)' : 'vec3(0.22, 0.19, 0.11)')}, wear * ${dry ? '0.8' : joined ? '0.0' : '0.55'});`}
  grass *= 1.0 - verge * (0.13 + fine * 0.06);
  grass = mix(grass, vec3(0.36, 0.31, 0.21) + fine * 0.025, path * ${local ? '0.0' : '0.88'});
  ${wearOn ? `{
    // W20-C: the outer stretch of the precinct turf wears into the paddock's colour in tongues and patches.
    vec2 jl = vVenueLocal.xz;
    float jEdge = length(jl) - venueEdgeR(atan(jl.x, jl.y));
    float jWob = (venueNoise(p / 5.5 + 4.0) - 0.5) * ${J.wobble[0].toFixed(1)} + (venueNoise(p / 16.0 + 9.0) - 0.5) * ${J.wobble[1].toFixed(1)}
      + (venueNoise(p / 1.9 + 2.0) - 0.5) * ${J.wobble[2].toFixed(1)};
    float jWear = smoothstep(${J.from.toFixed(1)}, ${J.to.toFixed(1)}, jEdge + jWob);
    vec3 jWorn = uVjWorn + vec3(patchTone * (3.0 / 255.0) + fine * 0.012);
    grass = mix(grass, jWorn, jWear);
  }` : ''}
  // Exposed batters carry soil/rock rather than a vertical wall of green.
  float bank = 1.0 - abs(normalize(cross(dFdx(vVenueWorld), dFdy(vVenueWorld))).y);
  float soilFace = smoothstep(0.16, 0.52, bank)${joinOn ? ` * ${J.batterSoil.toFixed(2)}` : ''};
  vec3 earth = mix(vec3(0.23, 0.18, 0.12), vec3(0.36, 0.31, 0.23), venueNoise(p * 1.6));
  earth *= (0.86 + 0.14 * sin(vVenueWorld.y * 8.0 + patchTone * 2.0)) * uVenueEarth;
  grass = mix(grass, earth, soilFace);
  // W9-A: the hinterland sheet inside the maintained region carried only patchTone (+/-4/255 over 20 m) and
  // fine (+/-0.006), which read SD 1.5 over 64 px at the airport-link paddock in rain and clear alike. Three
  // octaves of grain, as a multiplier on the sqrt albedo; the 3.2 m and 1.25 m octaves take more depth in rain,
  // where the key is low. Local venue turf (airfield, station, Rod Laver) carries its own variation and is untouched.
  ${local ? '' : `{
    float rainOct = clamp(uDDCloud.x, 0.0, 1.0);
    float tuftC = venueNoise(p / 9.0 + 2.0) - 0.5;
    float tuftA = venueNoise(p / 3.2 + 11.0) - 0.5;
    float tuftB = venueNoise(p / 1.25 + 5.0) - 0.5;
    // The grain fades along the rail and road verges, whose base is already 13 per cent darker: a full-depth
    // grain there pushed pasture under V 22 (near-black green) at station 15.
    float tuft = (tuftC * 0.16 + tuftA * 0.14 * (1.0 + 1.1 * rainOct) + tuftB * (0.10 + 0.08 * rainOct)) * (1.0 - 0.9 * verge);
    grass *= 1.0 + 0.04 * (1.0 - verge) + tuft;
  }`}
  ${soil ? `grass = mix(vec3(0.24, 0.185, 0.12), vec3(0.34, 0.29, 0.21), venueNoise(p * 1.6 + vVenueWorld.y * 2.0));
  grass *= (0.85 + 0.15 * sin(vVenueWorld.y * 9.0 + patchTone * 2.0)) * uVenueEarth;` : ''}
  diffuseColor.rgb = mix(diffuseColor.rgb, grass * grass, mask);
  ${joinOn ? `{
    // W20-C: the paddock's grass grain (ground pack, meadow channel) and a broad turf variation at half strength.
    float jBr = clamp((0.45 * venueNoise(p / 53.0 + 11.7) + 0.30 * venueNoise(p / 31.0 + 5.9) + 0.25 * venueNoise(p / 77.0 + 23.3) - 0.5) * 3.0, -1.0, 1.0);
    diffuseColor.rgb *= (1.0 + ${J.broadVal.toFixed(3)} * jBr) * vec3(1.0 + ${J.broadHue.toFixed(3)} * jBr, 1.0 + 0.35 * ${J.broadHue.toFixed(3)} * jBr, 1.0 - 0.25 * ${J.broadHue.toFixed(3)} * abs(jBr));
    if (uVjReady > 0.5) {
      float jD = length(vViewPosition);
      float jNear = ${join.near === false ? '0.0' : '1.0'} * (1.0 - smoothstep(300.0, 500.0, jD));
      float jMacro = 1.0 - smoothstep(500.0, 800.0, jD);
      float jScale = 1.0;
      if (jNear > 0.0) jScale *= mix(1.0, ddCoastLum(uVjPack, vec3(0.0, 1.0, 0.0), p, ${J.nearRepeatM.toFixed(1)}), jNear * ${J.nearAmp.toFixed(2)});
      jScale *= mix(1.0, ddCoastLum(uVjPack, vec3(0.0, 1.0, 0.0), p, ${J.macroRepeatM.toFixed(1)}), jMacro * ${J.macroAmp.toFixed(2)});
      diffuseColor.rgb *= mix(1.0, jScale, mask);
    }
  }` : ''}
}
#include <roughnessmap_fragment>`);
  };
  material.customProgramCacheKey = () => `${key}|venue-ground-t15-v2-w9a-${local}-${soil}-${dry ?? 'x'}-${earthGain}${tornWear ? '-w20d' : ''}${joined ? '-w27j' : ''}${joinOn ? `-w20c${join.near === false ? 'n0' : 'n1'}${wearOn ? 'w' : 'g'}` : ''}${landOn ? '-w79land' : ''}`;
  material.needsUpdate = true;
  return material;
}
