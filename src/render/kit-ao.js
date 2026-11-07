// P20: deterministic local surface-voxel hemisphere bake. No topology changes or draws.
import { Float32BufferAttribute } from 'three';
import { applyAtlasRestyle, readRestyle } from './style/restyle.js';

const CELL = 0.4;
const baked = new WeakSet();
const directions = [[0, 0], [0.65, 0], [-0.65, 0], [0, 0.65], [0, -0.65]];

// Bounded, geometry-verified archetype cache. A façade key alone is unsafe: lot spans,
// handedness and storey overrides can change the geometry within the same archetype.
const archetypeBakes = new Map();
let cachedBytes = 0, worker = null, nextJob = 0;
const jobs = new Map();
export const kitAOStats = { requests: 0, hits: 0, misses: 0, bakeMilliseconds: 0, wearMilliseconds: 0, workerMilliseconds: 0, mainMilliseconds: 0 };
function geometryKey(model, quality) {
  let hash = 2166136261, second = 5381;
  for (const part of model.parts) {
    const g = part.geometry;
    for (const a of [g.attributes.position, g.attributes.normal, g.index]) {
      if (!a) continue;
      const bytes = new Uint8Array(a.array.buffer, a.array.byteOffset, a.array.byteLength);
      for (let i = 0; i < bytes.length; i++) {
        hash = Math.imul(hash ^ bytes[i], 16777619); second = Math.imul(second, 33) ^ bytes[i];
      }
    }
  }
  return `${model.archetypeId ?? 'geometry'}:${model.facade ?? ''}:${quality}:${hash >>> 0}:${second >>> 0}:`
    + model.parts.map(p => `${p.geometry.attributes.position.count}/${p.material?.userData?.family ?? ''}`).join(',');
}
function attachBake(model, entry, start, hit) {
  model.parts.forEach((p, i) => {
    p.geometry.setAttribute('kitAO', entry.attributes[i][0]);
    p.geometry.setAttribute('kitCause', entry.attributes[i][1]);
  });
  model.kitAO = { ...entry.metrics, cacheHit: hit, pending: false,
    milliseconds: hit ? performance.now() - start : entry.metrics.milliseconds,
    wearMilliseconds: hit ? 0 : entry.metrics.wearMilliseconds,
    totalMilliseconds: hit ? performance.now() - start : entry.metrics.totalMilliseconds };
  baked.add(model);
}
function rememberBake(key, model) {
  const attributes = model.parts.map(p => [p.geometry.attributes.kitAO, p.geometry.attributes.kitCause]);
  const bytes = attributes.reduce((sum, a) => sum + a[0].array.byteLength + a[1].array.byteLength, 0);
  const entry = { attributes, metrics: model.kitAO, bytes };
  while (cachedBytes + bytes > 32 * 1024 * 1024 && archetypeBakes.size) {
    const oldest = archetypeBakes.keys().next().value;
    cachedBytes -= archetypeBakes.get(oldest).bytes; archetypeBakes.delete(oldest);
  }
  if (bytes <= 32 * 1024 * 1024) { archetypeBakes.set(key, entry); cachedBytes += bytes; }
  kitAOStats.bakeMilliseconds += model.kitAO.milliseconds;
  kitAOStats.wearMilliseconds += model.kitAO.wearMilliseconds ?? 0;
  kitAOStats.workerMilliseconds += model.kitAO.totalMilliseconds ?? model.kitAO.milliseconds;
  return entry;
}
export function bakeKitAO(model, quality = 'high') {
  if (!model?.parts?.length || baked.has(model)) return model;
  classifyFootBand(model);
  const start = performance.now(), key = geometryKey(model, quality);
  kitAOStats.requests++;
  const cached = archetypeBakes.get(key);
  if (cached) { kitAOStats.hits++; attachBake(model, cached, start, true); }
  else { kitAOStats.misses++; computeKitAO(model); rememberBake(key, model); }
  kitAOStats.mainMilliseconds += performance.now() - start;
  return model;
}

/** One lazy worker, no per-building worker startup or transferable live geometry buffers. */
export function scheduleKitAO(model, quality = 'high') {
  if (typeof Worker === 'undefined') return bakeKitAO(model, quality);
  if (!model?.parts?.length || baked.has(model) || model.kitAO?.pending) return model;
  classifyFootBand(model);
  const start = performance.now(), key = geometryKey(model, quality);
  kitAOStats.requests++;
  const cached = archetypeBakes.get(key);
  if (cached) { kitAOStats.hits++; attachBake(model, cached, start, true); }
  else {
    const pending = [...jobs.values()].find(job => job.key === key);
    if (pending) { kitAOStats.hits++; pending.models.push(model); }
    else {
      try {
        if (!worker) {
          const source = `const CELL = ${CELL}; const baked = new WeakSet();
            const directions = ${JSON.stringify(directions)};
            class Float32BufferAttribute { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; } }
            const attribute = (array, size) => ({array, count: array.length / size,
              getX(i) { return array[i*size]; }, getY(i) { return array[i*size+1]; }, getZ(i) { return array[i*size+2]; }});
            ${kitWearSegments.toString().replace('export ', '')}
            ${kitSegmentDistance.toString().replace('export ', '')}
            ${bakeWearDistance.toString()}
            ${computeKitAO.toString()}
            onmessage = ({data}) => {
              const model = {parts:data.parts.map(p => ({material:{userData:{family:p.family}}, geometry:{
                attributes:{position:attribute(p.position,3),normal:p.normal ? attribute(p.normal,3) : null},
                index:p.index ? attribute(p.index,1) : null, boundingBox:p.bounds,
                setAttribute(k,a) { this.attributes[k]=a; }
              }}))};
              computeKitAO(model);
              const arrays=model.parts.map(p=>[p.geometry.attributes.kitAO.array,p.geometry.attributes.kitCause.array]);
              postMessage({id:data.id,arrays,metrics:model.kitAO},arrays.flat().map(a=>a.buffer));
            };`;
          const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
          worker = new Worker(url); URL.revokeObjectURL(url);
          worker.onmessage = ({ data }) => {
            const job = jobs.get(data.id); if (!job) return;
            const first = job.models[0];
            data.arrays.forEach((a, i) => {
              first.parts[i].geometry.setAttribute('kitAO', new Float32BufferAttribute(a[0], 1));
              first.parts[i].geometry.setAttribute('kitCause', new Float32BufferAttribute(a[1], 1));
            });
            first.kitAO = data.metrics;
            const entry = rememberBake(job.key, first);
            job.models.forEach((m, i) => attachBake(m, entry, performance.now(), i > 0));
            jobs.delete(data.id);
          };
          worker.onerror = () => {
            worker.terminate(); worker = null;
            for (const job of jobs.values()) for (const m of job.models) {
              computeKitAO(m); rememberBake(job.key, m);
            }
            jobs.clear();
          };
        }
        const id = ++nextJob;
        const parts = model.parts.map(p => {
          const g = p.geometry; if (!g.boundingBox) g.computeBoundingBox();
          return { position:g.attributes.position.array, normal:g.attributes.normal?.array,
            index:g.index?.array, bounds:g.boundingBox, family:p.material?.userData?.family };
        });
        jobs.set(id, { key, models: [model] }); worker.postMessage({ id, parts }); kitAOStats.misses++;
      } catch {
        computeKitAO(model); rememberBake(key, model);
      }
    }
    if (!baked.has(model)) {
      model.kitAO = { pending: true };
      for (const {geometry:g} of model.parts) {
        g.setAttribute('kitAO', new Float32BufferAttribute(new Float32Array(g.attributes.position.count), 1));
        g.setAttribute('kitCause', new Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(100), 1));
      }
    }
  }
  kitAOStats.mainMilliseconds += performance.now() - start;
  return model;
}
export async function whenKitAOReady() {
  while (jobs.size) await new Promise(resolve => setTimeout(resolve, 10));
}

/** Actual boundary/crease segments (coplanar triangulation diagonals are excluded). */
export function kitWearSegments(parts) {
  const edges = new Map();
  const pointKey = a => a.map(x => x.toFixed(4)).join(',');
  for (const part of parts) {
    if (['glass','foliage','water'].includes(part.material?.userData?.family)) continue;
    const g = part.geometry, p = g.attributes.position, ix = g.index, count = ix?.count ?? p.count;
    for (let t=0;t<count;t+=3) {
      const v=[0,1,2].map(k=>{const i=ix?ix.getX(t+k):t+k;return [p.getX(i),p.getY(i),p.getZ(i)];});
      const a=v[1].map((x,i)=>x-v[0][i]),b=v[2].map((x,i)=>x-v[0][i]);
      const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]], len=Math.hypot(...n);
      if(len<1e-8)continue;for(let i=0;i<3;i++)n[i]/=len;
      for(let k=0;k<3;k++) {
        const a=v[k],b=v[(k+1)%3],ka=pointKey(a),kb=pointKey(b),key=ka<kb?ka+'|'+kb:kb+'|'+ka;
        const edge=edges.get(key);
        if(!edge)edges.set(key,{a,b,n,count:1,crease:false});
        else {edge.count++;if(Math.abs(n.reduce((sum,x,i)=>sum+x*edge.n[i],0))<.85)edge.crease=true;}
      }
    }
  }
  return [...edges.values()].filter(e=>e.count===1||e.crease);
}
export function kitSegmentDistance(p,e) {
  const d=e.b.map((x,i)=>x-e.a[i]),l=d.reduce((sum,x)=>sum+x*x,0);
  const t=Math.max(0,Math.min(1,d.reduce((sum,x,i)=>sum+x*(p[i]-e.a[i]),0)/(l||1)));
  return Math.hypot(...p.map((x,i)=>x-e.a[i]-t*d[i]));
}
function bakeWearDistance(parts) {
  const pointKey = a => a.map(x => x.toFixed(4)).join(',');
  const edgeKey = (a,b) => { const ka=pointKey(a),kb=pointKey(b);return ka<kb?ka+'|'+kb:kb+'|'+ka; };
  const edges = new Map(kitWearSegments(parts).map(e=>[edgeKey(e.a,e.b),e]));
  for(const part of parts){
    const g=part.geometry,p=g.attributes.position,ix=g.index,count=ix?.count??p.count;
    const distances=new Float32Array(p.count);
    if (['glass','foliage','water'].includes(part.material?.userData?.family)) {
      distances.fill(100);g.setAttribute('kitCause',new Float32BufferAttribute(distances,1));continue;
    }
    for(let t=0;t<count;t+=3){
      const ids=[0,1,2].map(k=>ix?ix.getX(t+k):t+k),v=ids.map(i=>[p.getX(i),p.getY(i),p.getZ(i)]);
      const centre=[0,1,2].map(i=>(v[0][i]+v[1][i]+v[2][i])/3);
      let best=null,near=Infinity;
      // Only this surface's own true crease/boundary edges are eligible. No proximity
      // search over unrelated detail and no false cause at a triangulation diagonal.
      for(let k=0;k<3;k++) {
        const e=edges.get(edgeKey(v[k],v[(k+1)%3]));if(!e)continue;
        const d=kitSegmentDistance(centre,e);if(d<near){near=d;best=e;}
      }
      // One common cause per triangle. Distance to a segment is convex, so interpolated
      // endpoint distance is an upper bound everywhere on this triangle. Max across
      // indexed neighbours preserves that proof without splitting or moving vertices.
      const ground=v.map(a=>Math.abs(a[1])),edge=best?v.map(a=>kitSegmentDistance(a,best)):[100,100,100];
      const chosen=Math.max(...ground)<Math.max(...edge)?ground:edge;
      ids.forEach((id,i)=>{distances[id]=Math.max(distances[id],Math.min(100,chosen[i]+.00001));});
    }
    g.setAttribute('kitCause',new Float32BufferAttribute(distances,1));
  }
}

/** Rasterize the lot's own triangle surfaces, then sample a five-ray outward hemisphere.
 * Quantized surface occupancy is an approximation: it deliberately does not fill mesh bounds.
 * All coordinates are kit-local (the assembler has already baked part transforms).
 */
function computeKitAO(model) {
  if (!model?.parts?.length || baked.has(model)) return model;
  const start = performance.now();
  const parts = model.parts.filter(p => p.geometry?.attributes?.position);
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  for (const { geometry: g } of parts) {
    if (!g.boundingBox) g.computeBoundingBox();
    for (const [i, axis] of ['x', 'y', 'z'].entries()) {
      low[i] = Math.min(low[i], Math.floor(g.boundingBox.min[axis] / CELL) - 5);
      high[i] = Math.max(high[i], Math.ceil(g.boundingBox.max[axis] / CELL) + 5);
    }
  }
  const sx = high[0] - low[0] + 1, sy = high[1] - low[1] + 1, sz = high[2] - low[2] + 1;
  const volume = sx * sy * sz;
  // Ordinary kit envelopes use a compact dense grid; oversized lots retain sparse storage.
  const grid = volume <= 16_000_000 ? new Uint8Array(volume) : null;
  const sparse = grid ? null : new Set();
  const key = (x, y, z) => (Math.floor(x / CELL) - low[0])
    + (Math.floor(y / CELL) - low[1]) * sx + (Math.floor(z / CELL) - low[2]) * sx * sy;
  const occupied = {
    add(k) { if (grid) grid[k] = 1; else sparse.add(k); },
    has(k) { return grid ? grid[k] === 1 : sparse.has(k); },
  };
  for (const part of parts) {
    if (['glass', 'foliage', 'water'].includes(part.material?.userData?.family)) continue;
    const g = part.geometry, p = g.attributes.position, index = g.index;
    const count = index?.count ?? p.count;
    for (let t = 0; t < count; t += 3) {
      const a = index ? index.getX(t) : t, b = index ? index.getX(t + 1) : t + 1;
      const c = index ? index.getX(t + 2) : t + 2;
      const ax = p.getX(a), ay = p.getY(a), az = p.getZ(a);
      const bx = p.getX(b) - ax, by = p.getY(b) - ay, bz = p.getZ(b) - az;
      const cx = p.getX(c) - ax, cy = p.getY(c) - ay, cz = p.getZ(c) - az;
      const steps = Math.max(1, Math.ceil(Math.max(Math.sqrt(bx * bx + by * by + bz * bz), Math.sqrt(cx * cx + cy * cy + cz * cz)) / CELL));
      for (let u = 0; u <= steps; u++) for (let v = 0; v <= steps - u; v++) {
        occupied.add(key(ax + (bx * u + cx * v) / steps,
          ay + (by * u + cy * v) / steps, az + (bz * u + cz * v) / steps));
      }
    }
  }
  const rasterMilliseconds = performance.now() - start;
  let vertices = 0;
  const cache = new Map();
  for (const part of parts) {
    const g = part.geometry, p = g.attributes.position, n = g.attributes.normal;
    const ao = new Float32Array(p.count), cause = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const nx = n?.getX(i) ?? 0, ny = n?.getY(i) ?? 1, nz = n?.getZ(i) ?? 0;
      const cacheKey = key(x, y, z) * 125 + (Math.round(nx * 2) + 2) * 25
        + (Math.round(ny * 2) + 2) * 5 + Math.round(nz * 2) + 2;
      let result = cache.get(cacheKey);
      if (result === undefined) {
        const tx = Math.abs(ny) < 0.9 ? nz : 1, ty = 0, tz = Math.abs(ny) < 0.9 ? -nx : 0;
        const tl = Math.sqrt(tx * tx + tz * tz) || 1;
        const ux = tx / tl, uz = tz / tl;
        const vx = ny * uz, vy = nz * ux - nx * uz, vz = -ny * ux;
        let hits = 0, near = y >= -0.05 && y <= 0.4 ? 1 : 0;
        for (const [a, b] of directions) {
          const dx = nx + ux * a + vx * b, dy = ny + ty * a + vy * b, dz = nz + uz * a + vz * b;
          const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          for (const distance of [0.5, 0.95]) {
            if (occupied.has(key(x + dx / dl * distance, y + dy / dl * distance, z + dz / dl * distance))) {
              hits++; near = 1; break;
            }
          }
        }
        result = Math.min(0.45, hits / directions.length * 0.45 + Math.max(0, 1 - Math.abs(y) / 0.4) * 0.18) + near * 2;
        cache.set(cacheKey, result);
      }
      cause[i] = result >= 2 ? 1 : 0; ao[i] = result - cause[i] * 2;
    }
    g.setAttribute('kitAO', new Float32BufferAttribute(ao, 1));
    g.setAttribute('kitCause', new Float32BufferAttribute(cause, 1));
    vertices += p.count;
  }
  const aoMilliseconds = performance.now() - start;
  const wearStart = performance.now();
  bakeWearDistance(parts);
  model.kitAO = { milliseconds: aoMilliseconds, wearMilliseconds: performance.now() - wearStart,
    totalMilliseconds: performance.now() - start, rasterMilliseconds, vertices, gridBytes: grid?.byteLength ?? sparse.size * 8, cellMetres: CELL, maxMultiply: 0.45 };
  baked.add(model);
  return model;
}

// W8-C building finish: wall-base occlusion, world-space grime on walls and roofs, roof streaks, and an
// edge catch-light, all in one post-lighting multiply that rides the kit AO path (no geometry, no draw).
// KIT_FINISH.enabled = false restores the previous shader text and program cache key exactly;
// kitFinishStrength.value = 0 turns the pass off live without a recompile (A/B captures).
export const KIT_FINISH = Object.freeze({
  enabled: true,
  baseDrop: 0.92, baseHeight: 2.4,        // wall foot: lowest 2.4 m, darkest at the footing (W9-B: 1.2 m was gone before the first storey line read; the output compresses a linear drop to about its 0.3 power)
  valueVariation: 0.55, valueScale: 1.4,   // wall value drift at about 1.4 m (W9-B: 0.08 at 3.1 m added under 1 luminance SD to a 64 px crop)
  roofVariation: 0.16,                     // roof value drift (same noise, gentler)
  streak: 0.2,                             // vertical wall streaks below sills, roof streaks down the slope
  lichen: 0.35, fade: 0.35,                // roof lichen on slate and tile, faded patches on iron
  edge: 0.14,                              // catch-light on plinth tops
  roofEdge: 0.55,                          // catch-light on coping, fascia and gutters: +25% on every face, +55% on up-facing ones
  // The cap runs before the tone map, where 0.55 landed lit terracotta at S 37 to 44 on screen and washed it to
  // salmon. 0.72 here lands it near the bible's S 55 on screen and keeps the tile reading as terracotta.
  roofSat: 0.60, paintValue: 0.80,         // bible caps: roof saturation, coloured paint and brick value (display proxy)
  footFloor: 0.008,                         // the foot shade never pushes a wall pixel below this peak linear level (about V 12 on screen after tone map and grade); darker pixels are left alone
  paintKnee: 0.60,                         // brick and paint value is compressed softly above this, towards paintValue (a hard cap flattened lit walls and cost them SD)
  tileHigh: 0.76,                          // coloured roofs: highlights pulled down to this factor (display proxy) so lit terracotta lands under V 80 on screen
});
export const kitFinishStrength = { value: 1 };
globalThis.__kitFinish = kitFinishStrength;

/**
 * 1 wall, 2 roof, 3 plinth and ground contact, 4 roof edge trim, 5 wall-adjacent trim (foot shade only);
 * 0 leaves the material alone. W9-B: trim, joinery, timber and steel parts carry no weather-overlay role, so
 * they were kind 0 and covered most of the visible wall foot (18% of the low pixels on a terrace were wall).
 */
const KF_SKIP = /glass|interior|void|shadow|room|lawn|grass|landscape|foliage|garden|planting|tree|eucalypt|water/;
function kitFinishKind(material) {
  const d = material.userData ?? {};
  if (d.family === 'glass' || d.family === 'foliage' || KF_SKIP.test(d.variant ?? '')) return 0;
  if (d.kitRoofEdge || d.kitRoofEdgeFinished) return 4;
  const role = d.buildingWeatherOverlay?.role;
  return role === 'roof' ? 2 : role === 'contact' ? 3 : role === 'facade' ? 1 : 5;
}
const kitFinishFamily = family => family === 'corrugated' || family === 'painted_metal' ? 1
  : family === 'tile' ? 2 : family === 'slate' ? 3 : 0;
const f2 = x => x.toFixed(3);
const KF_COMMON = `uniform float kfKind;
uniform float kfFamily;
uniform float kfStrength;
float kfHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float kfNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(kfHash(i), kfHash(i + vec2(1.0, 0.0)), f.x), mix(kfHash(i + vec2(0.0, 1.0)), kfHash(i + vec2(1.0, 1.0)), f.x), f.y); }`;
const kitFinishBody = () => `
if (kfKind > 0.5 && kfStrength > 0.0) {
  vec3 kfN = normalize(cross(dFdx(vKfWorld), dFdy(vKfWorld)));
  float kfUp = abs(kfN.y);
  float kfWallW = 1.0 - smoothstep(0.25, 0.55, kfUp);
  float kfRoofW = 1.0 - kfWallW;
  float kfH = max(vKfWorld.y - vKfBaseY, 0.0);
  float kfShade = 1.0;
  vec3 kfTint = vec3(1.0);
  if (kfKind < 1.5 || kfKind > 2.5 && kfKind < 3.5 || kfKind > 4.5) {
    // Foot of every wall: darkest at the footing, gone by ${f2(KIT_FINISH.baseHeight)} m.
    float kfFoot = 1.0 - smoothstep(0.0, ${f2(KIT_FINISH.baseHeight)}, kfH);
    kfShade *= 1.0 - ${f2(KIT_FINISH.baseDrop)} * kfWallW * pow(kfFoot, 1.2);
  }
  if (kfKind < 1.5) {
    vec2 kfAlong = vec2(dot(vKfWorld.xz, vec2(-kfN.z, kfN.x)), kfH);
    float kfV = kfNoise(kfAlong / ${f2(KIT_FINISH.valueScale)} + 7.3) * 0.65 + kfNoise(kfAlong / 0.6 + 3.1) * 0.35;
    kfShade *= 1.0 + ${f2(KIT_FINISH.valueVariation * 2)} * (kfV - 0.5) * kfWallW;
    // Rain streaks hang from sill-height sources on the 3 m storey rhythm, 0.7 m columns, 0.8-2.2 m long.
    float kfCol = floor(kfAlong.x / 0.7);
    float kfStorey = ceil((kfH - 1.0) / 3.0);
    float kfDrop = (kfStorey - (kfH - 1.0) / 3.0) * 3.0;
    float kfR = kfHash(vec2(kfCol, kfStorey + 11.0));
    float kfLen = 0.8 + 1.4 * kfHash(vec2(kfCol + 5.0, kfStorey));
    float kfWob = (kfNoise(vec2(kfAlong.x * 2.3, kfH * 0.7)) - 0.5) * 0.12;
    float kfLine = 1.0 - smoothstep(0.07, 0.19, abs(fract(kfAlong.x / 0.7) - 0.5) * 0.7 + kfWob);
    float kfS = step(0.62, kfR) * kfLine * (1.0 - smoothstep(0.0, kfLen, kfDrop)) * smoothstep(0.0, 0.1, kfDrop);
    kfShade *= 1.0 - ${f2(KIT_FINISH.streak)} * kfS * kfWallW * smoothstep(1.2, 2.2, kfH);
  } else if (kfKind < 2.5) {
    float kfV = kfNoise(vKfWorld.xz / 3.1 + 2.9) * 0.65 + kfNoise(vKfWorld.xz / 1.2 + 9.4) * 0.35;
    kfShade *= 1.0 + ${f2(KIT_FINISH.roofVariation * 2)} * (kfV - 0.5) * kfRoofW;
    float kfPitch = 1.0 - smoothstep(0.90, 0.985, kfUp);
    vec2 kfSlope = kfPitch > 0.01 ? normalize(kfN.xz) : vec2(0.0, 1.0);
    float kfAcross = dot(vKfWorld.xz, vec2(-kfSlope.y, kfSlope.x));
    float kfDown = dot(vKfWorld.xz, kfSlope);
    float kfCol = floor(kfAcross / 0.55);
    float kfRun = step(0.58, kfHash(vec2(kfCol, floor(kfDown / 7.0)))) * (0.45 + 0.55 * kfNoise(vec2(kfCol * 5.1, kfDown / 1.7)));
    float kfLine = 1.0 - smoothstep(0.05, 0.14, abs(fract(kfAcross / 0.55) - 0.5) * 0.55);
    kfShade *= 1.0 - ${f2(KIT_FINISH.streak)} * kfRun * kfLine * kfRoofW * (0.4 + 0.6 * kfPitch);
    float kfPatch = kfNoise(vKfWorld.xz / 1.4 + 31.7) * 0.7 + kfNoise(vKfWorld.xz / 0.5 + 4.4) * 0.3;
    if (kfFamily > 1.5) {
      kfTint = mix(vec3(1.0), vec3(0.90, 0.97, 0.76), ${f2(KIT_FINISH.lichen)} * smoothstep(0.60, 0.80, kfPatch) * kfRoofW);
    } else if (kfFamily > 0.5) {
      float kfF = smoothstep(0.56, 0.82, kfNoise(vKfWorld.xz / 3.7 + 17.1) * 0.75 + kfNoise(vKfWorld.xz / 1.3) * 0.25);
      float kfLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
      kfTint = mix(vec3(1.0), vec3(kfLum) / max(outgoingLight, vec3(0.002)) * 1.05, ${f2(KIT_FINISH.fade)} * kfF * kfRoofW);
    }
  } else if (kfKind > 3.5 && kfKind < 4.5) {
    kfShade *= 1.0 + ${f2(KIT_FINISH.roofEdge)} * (0.45 + 0.55 * smoothstep(0.55, 0.95, kfUp));
  } else if (kfKind > 4.5) {
    // Up-facing trim above the ground floor (cornice, coping and fascia tops, sill caps) catches the key.
    kfShade *= 1.0 + ${f2(KIT_FINISH.roofEdge)} * 0.65 * smoothstep(0.85, 0.98, kfUp) * smoothstep(2.0, 3.5, kfH);
  }
  if (kfKind > 2.5 && kfKind < 3.5) {
    // Plinth tops: up-facing steps a little above the footing catch the key.
    kfShade *= 1.0 + ${f2(KIT_FINISH.edge)} * smoothstep(0.85, 0.98, kfUp) * smoothstep(0.2, 0.4, kfH) * (1.0 - smoothstep(0.8, 1.2, kfH));
  }
  kfShade = clamp(kfShade, 0.12, kfKind > 3.5 && kfKind < 4.5 ? 1.7 : 1.35);
  float kfPeak = max(outgoingLight.r, max(outgoingLight.g, outgoingLight.b)) * (1.0 - clamp(vKitAO, 0.0, 0.45));
  kfShade = max(kfShade, min(1.0, ${KIT_FINISH.footFloor.toFixed(4)} / max(kfPeak, 1e-5)));
  outgoingLight *= mix(vec3(1.0), kfTint * kfShade, kfStrength);
  // Caps on a display-space proxy (gamma 2.2): hue is kept, only chroma or brightness is pulled in.
  vec3 kfD = pow(max(outgoingLight, vec3(0.0)), vec3(0.4545455));
  float kfMx = max(kfD.r, max(kfD.g, kfD.b));
  float kfSat = (kfMx - min(kfD.r, min(kfD.g, kfD.b))) / max(kfMx, 1e-4);
  if (kfKind > 1.5 && kfKind < 2.5 && kfSat > ${f2(KIT_FINISH.roofSat)}) {
    kfD = kfMx - (kfMx - kfD) * (${f2(KIT_FINISH.roofSat)} / kfSat);
    outgoingLight = mix(outgoingLight, pow(kfD, vec3(2.2)), kfStrength);
  } else if (kfKind < 1.5 && kfSat > 0.2 && kfMx > ${f2(KIT_FINISH.paintKnee)}) {
    float kfRoom = ${f2(KIT_FINISH.paintValue - KIT_FINISH.paintKnee)};
    kfD *= (${f2(KIT_FINISH.paintKnee)} + kfRoom * (1.0 - exp(-(kfMx - ${f2(KIT_FINISH.paintKnee)}) / kfRoom))) / kfMx;
    outgoingLight = mix(outgoingLight, pow(kfD, vec3(2.2)), kfStrength);
  }
  if (kfKind > 1.5 && kfKind < 2.5) {
    // Coloured roofs (terracotta tile and painted iron): lit terracotta was S 56 V 88 on screen. Pull the highlights down by
    // chroma so neutral grey roofs are left alone, and leave the shade side as it was.
    outgoingLight = mix(outgoingLight, outgoingLight * pow(${f2(KIT_FINISH.tileHigh)}, 2.2 * smoothstep(0.30, 0.60, kfSat) * smoothstep(0.20, 0.50, kfMx)), kfStrength);
  }
}`;

// Ruling 73a: kit parts already contain their transforms in building coordinates.
// The shader subtracts the building origin, not each part's bounding-box minimum.
// Share the uniform across all uses, including later models using a cached material.
const footBands = new WeakMap(), footClassified = new WeakSet();
function footBand(material) {
  let band = footBands.get(material);
  if (!band) {
    band = { inside: true, uniform: { value: KIT_FINISH.baseDrop } };
    footBands.set(material, band);
  }
  return band;
}
function classifyFootBand(model) {
  if (!readRestyle(globalThis.location?.search ?? '').enabled || footClassified.has(model)) return;
  const parts = model.openingSourceGeometries?.length
    ? [...model.parts, ...model.openings.flatMap(opening => opening.parts)] : model.parts;
  const inside = new Map();
  for (const part of parts) {
    const position = part.geometry?.attributes?.position;
    let below = !!position?.count;
    for (let i = 0; below && i < position.count; i++) {
      // NaN/unknown positions fail conservatively; the band is strictly below its top.
      below = Number.isFinite(position.getY(i)) && position.getY(i) < KIT_FINISH.baseHeight;
    }
    for (const material of [part.material].flat()) {
      if (material) inside.set(material, (inside.get(material) ?? true) && below);
    }
  }
  for (const [material, below] of inside) {
    const band = footBand(material);
    band.inside &&= below;
    band.uniform.value = band.inside ? .40 : KIT_FINISH.baseDrop;
  }
  footClassified.add(model);
}
function applyFootRestyle(material, kind) {
  if (!kind || !readRestyle(globalThis.location?.search ?? '').enabled) return material;
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
  // Keep the common finish program shared with roof/edge kinds, where the foot
  // branch is inactive and the original drop remains the conservative default.
  const uniform = [1, 3, 5].includes(kind) ? footBand(material).uniform : { value: KIT_FINISH.baseDrop };
  material.onBeforeCompile = function onFootRestyle(shader, renderer) {
    previous.call(this, shader, renderer);
    shader.uniforms.p17FootBaseDrop = uniform;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      '#include <common>\nuniform float p17FootBaseDrop;').replace(
      `1.0 - ${f2(KIT_FINISH.baseDrop)} * kfWallW`, '1.0 - p17FootBaseDrop * kfWallW');
  };
  material.customProgramCacheKey = function footRestyleKey() {
    return `${previousKey.call(this)}|p17-foot-band-v1`;
  };
  return material;
}

/** Chain after authored shaders, preserving vertex colours and the architectural matte floor. */
export function applyKitAO(material) {
  if (!material || material.userData?.kitAO) return material;
  material.userData.kitAO = true;
  material.defaultAttributeValues = { ...material.defaultAttributeValues, kitAO: [0], kitCause: [100] };
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
  const finishKind = KIT_FINISH.enabled ? kitFinishKind(material) : 0;
  const finishFamily = kitFinishFamily(material.userData?.family);
  if (finishKind) material.userData.kitFinish = { kind: finishKind, family: finishFamily };
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    if (finishKind) {
      shader.uniforms.kfKind = { value: finishKind };
      shader.uniforms.kfFamily = { value: finishFamily };
      shader.uniforms.kfStrength = kitFinishStrength;
    }
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
attribute float kitAO;
attribute float kitCause;
varying float vKitAO;
varying float vKitCause;${finishKind ? `
varying vec3 vKfWorld;
varying float vKfBaseY;` : ''}`).replace('#include <begin_vertex>', `#include <begin_vertex>
vKitAO = kitAO;
#ifdef USE_INSTANCING
mat4 p20CauseModel = modelMatrix * instanceMatrix;
#else
mat4 p20CauseModel = modelMatrix;
#endif
// Operator-norm upper bound for the kit's rotation + axis-scale placements.
float p20CauseScale = max(length(p20CauseModel[0].xyz), max(length(p20CauseModel[1].xyz), length(p20CauseModel[2].xyz)));
vKitCause = kitCause * p20CauseScale;${finishKind ? `
vKfWorld = (p20CauseModel * vec4(transformed, 1.0)).xyz;
vKfBaseY = (p20CauseModel * vec4(0.0, 0.0, 0.0, 1.0)).y;` : ''}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying float vKitAO;
varying float vKitCause;${finishKind ? `
varying vec3 vKfWorld;
varying float vKfBaseY;
${KF_COMMON}` : ''}`).replace('#include <opaque_fragment>', `${finishKind ? kitFinishBody() : ''}
outgoingLight *= 1.0 - clamp(vKitAO, 0.0, 0.45);
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${previousKey?.call(material) ?? ''}|p20-kit-ao-v2-distance${finishKind ? '|w8c-finish-v1' : ''}`;
  material.needsUpdate = true;
  return applyAtlasRestyle(applyFootRestyle(material, finishKind));
}
