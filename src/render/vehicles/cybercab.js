import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { kerbBayFromLoop } from './errands.js';
import liveries from '../style/liveries.json' with { type: 'json' };
import { classMaterial, resolveColour } from '../style/material-classes.js';
import { LIVERY_SWITCHES, LIVERY_SPECS } from '../style/livery.js';
import { tagRegions, REGION_IDS } from './body-kit.js';

// W3-A: the bible's cab family (#D8D3C8, S 6) authored a step darker for the board grade, which
// renders a lit pale body about 0.25 above its albedo (vehicle cap is V 85 on screen). The tan
// these replaced read as a mustard coupe under the sun.
export const CYBERCAB_PAINTS = Object.freeze(liveries.cab.legacyPaints);
export const CYBERCAB_TRIANGLE_CEILING = 29340;

// Z is forward. Eight-point sections keep the shoulders rounded without a box cabin.
function shell(sections) {
  const vertices = [], indices = [];
  for (const [z, half, bottom, top] of sections) {
    const h = top - bottom;
    for (const [x, y] of [[-.82,0], [.82,0], [1,.15], [1,.72], [.79,1], [-.79,1], [-1,.72], [-1,.15]]) {
      vertices.push(x * half, bottom + y * h, z);
    }
  }
  for (let s = 1; s < sections.length; s++) for (let i = 0; i < 8; i++) {
    const a = (s - 1) * 8 + i, b = (s - 1) * 8 + (i + 1) % 8, c = s * 8 + i, d = s * 8 + (i + 1) % 8;
    indices.push(a,b,c,b,d,c);
  }
  for (let i = 1; i < 7; i++) { indices.push(0,i+1,i); const e = (sections.length-1)*8; indices.push(e,e+i,e+i+1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.setIndex(indices);
  g.computeVertexNormals(); return g;
}

const CAB_WHEEL_Z = [-1.35, 1.34];
const archHeight = (z, centre, amplitude = centre > 0 ? .40 : .43) => {
  const u = (z - centre) / .50;
  return .44 + amplitude * Math.max(0, 1 - u * u) ** 1.2;
};

// Keep the accepted, six-section bonnet TOP as its own exact surface, with its
// original normals. Only the lower flanks gain arch stations: adding all those
// stations to the top changed normal weights and made transverse highlight bars.
function archedLowerShell(sections) {
  const accepted = shell(sections);
  const topPositions = [], topNormals = [], topIndices = [], remap = new Map();
  const copyTopVertex = id => {
    if (remap.has(id)) return remap.get(id);
    const next = topPositions.length / 3;
    for (const [out, attr] of [[topPositions, accepted.attributes.position],
      [topNormals, accepted.attributes.normal]])
      out.push(attr.getX(id), attr.getY(id), attr.getZ(id));
    remap.set(id, next); return next;
  };
  for (let s = 1; s < sections.length; s++) {
    const first = (s - 1) * 8 * 6 + 4 * 6;
    for (let k = 0; k < 6; k++) topIndices.push(copyTopVertex(accepted.index.getX(first + k)));
  }
  const topSkin = new THREE.BufferGeometry();
  topSkin.setAttribute('position', new THREE.Float32BufferAttribute(topPositions, 3));
  topSkin.setAttribute('normal', new THREE.Float32BufferAttribute(topNormals, 3));
  topSkin.setIndex(topIndices);
  const stops = new Set(sections.map(row => row[0]));
  for (const centre of CAB_WHEEL_Z)
    for (const step of [-.51, -.50, -.48, -.40, -.28, -.14, 0, .14, .28, .40, .48, .50, .51])
      stops.add(centre + step);
  const zList = [...stops].filter(z => z >= sections[0][0] && z <= sections.at(-1)[0]).sort((a, b) => a - b);
  const sample = z => {
    let i = 1; while (i < sections.length - 1 && sections[i][0] < z) i++;
    const a = sections[i - 1], b = sections[i], t = (z - a[0]) / (b[0] - a[0]);
    return [z, ...[1, 2, 3].map(k => a[k] + (b[k] - a[k]) * t)];
  };
  const acceptedNormal = (z, vertex) => {
    let i = 1; while (i < sections.length - 1 && sections[i][0] < z) i++;
    const a = sections[i - 1], b = sections[i], t = (z - a[0]) / (b[0] - a[0]);
    return new THREE.Vector3().fromBufferAttribute(accepted.attributes.normal, (i - 1) * 8 + vertex)
      .lerp(new THREE.Vector3().fromBufferAttribute(accepted.attributes.normal, i * 8 + vertex), t)
      .normalize();
  };
  const arch = z => {
    const centre = CAB_WHEEL_Z.find(c => Math.abs(z - c) <= .50);
    if (centre == null) return null;
    return archHeight(z, centre);
  };
  const vertices = [], indices = [];
  for (const z of zList) {
    const [, half, bottom, top] = sample(z), h = top - bottom;
    const low = Math.max(bottom + .15 * h, arch(z) ?? -Infinity);
    const high = Math.max(bottom + .72 * h, low + .025);
    for (const [x, y] of [[-.82 * half,bottom],[.82 * half,bottom],[half,low],[half,high],
      [.79 * half,top],[-.79 * half,top],[-half,high],[-half,low]]) vertices.push(x,y,z);
  }
  for (let s = 1; s < zList.length; s++) for (let i = 0; i < 8; i++) {
    // The two lower side facets are absent within each wheel opening. The
    // visible side wall above follows the circular cut line at every station.
    const mid = (zList[s - 1] + zList[s]) * .5;
    if (i === 4 || ((i === 1 || i === 7) && CAB_WHEEL_Z.some(c => Math.abs(mid - c) < .50))) continue;
    const a = (s - 1) * 8 + i, b = (s - 1) * 8 + (i + 1) % 8;
    const c = s * 8 + i, d = s * 8 + (i + 1) % 8;
    indices.push(a,b,c,b,d,c);
  }
  for (let i = 1; i < 7; i++) {
    indices.push(0,i+1,i);
    const e = (zList.length - 1) * 8; indices.push(e,e+i,e+i+1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  // The lower shoulder shares the accepted top edge and interpolated accepted
  // normals there, so its join cannot imprint the denser arch tessellation on
  // the unmodified bonnet skin.
  const normals = geometry.attributes.normal;
  for (let s = 0; s < zList.length; s++) for (const vertex of [2, 3, 4, 5, 6, 7]) {
    const n = acceptedNormal(zList[s], vertex);
    normals.setXYZ(s * 8 + vertex, n.x, n.y, n.z);
  }
  normals.needsUpdate = true; accepted.dispose();
  return { geometry, topSkin, sample, zList };
}

function archShoulders(sample, zList) {
  const positions = [], indices = [];
  const push = point => { positions.push(...point); return positions.length / 3 - 1; };
  for (const centre of CAB_WHEEL_Z) for (const side of [-1, 1]) {
    const stops = zList.filter(z => Math.abs(z - centre) <= .50);
    for (let i = 1; i < stops.length; i++) {
      const edge = z => archHeight(z, centre);
      const section = z => sample(z)[1];
      const a = stops[i - 1], b = stops[i], ya = edge(a), yb = edge(b);
      const o0 = push([side * section(a), ya, a]);
      const i0 = push([side * (section(a) - .066), ya + .035, a]);
      const i1 = push([side * (section(b) - .066), yb + .035, b]);
      const o1 = push([side * section(b), yb, b]);
      if (side > 0) indices.push(o0,i0,i1,o0,i1,o1);
      else indices.push(o0,i1,i0,o0,o1,i1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices); g.computeVertexNormals(); return g;
}

function archWells(sample) {
  const positions = [], indices = [];
  for (const centre of CAB_WHEEL_Z) for (const side of [-1, 1]) {
    for (let i = 0; i <= 18; i++) {
      const a = Math.PI * i / 18;
      for (const [radialZ, amplitude] of [[.445,centre > 0 ? .34 : .37],
        [.50,centre > 0 ? .40 : .43]]) {
        const z = centre + radialZ * Math.cos(a);
        positions.push(side * (sample(z)[1] - .12),
          .44 + amplitude * Math.sin(a) ** 2.4, z);
      }
    }
    const first = positions.length / 3 - 38;
    for (let i = 0; i < 18; i++) {
      const a = first + i * 2, b = a + 1, c = a + 2, d = a + 3;
      if (side > 0) indices.push(a,b,c,b,d,c);
      else indices.push(a,c,b,b,c,d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices); g.computeVertexNormals(); return g;
}

function roundedTyre() {
  const profile = [[-.136,.32],[-.12,.39],[-.08,.43],[-.04,.44],
    [.04,.44],[.08,.43],[.12,.39],[.136,.32],[.105,.275],[-.105,.275]];
  const n = 24, positions = [], indices = [];
  for (const [axis, radius] of profile) for (let i = 0; i < n; i++) {
    const a = i * Math.PI * 2 / n;
    positions.push(axis, Math.sin(a) * radius, Math.cos(a) * radius);
  }
  for (let ring = 0; ring < profile.length; ring++) for (let i = 0; i < n; i++) {
    const a = ring * n + i, b = ring * n + (i + 1) % n;
    const next = (ring + 1) % profile.length;
    const c = next * n + i, d = next * n + (i + 1) % n;
    indices.push(a,c,b,b,c,d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices); g.computeVertexNormals(); return g;
}

export function buildCybercabModel(paint = 0, { livery = LIVERY_SWITCHES.cab } = {}) {
  const bins = new Map();
  const material = (name, className, swatchName, color, extra = {}) => {
    const m = classMaterial(className, swatchName).clone();
    // The class supplies the constructor; these values retain the exact legacy Standard surface.
    m.setValues({ color, roughness: .38, metalness: 0, ...extra });
    m.name = `cybercab:${name}`; m.userData.envIntensityBase = .12; return m;
  };
  let paints = material('paint', 'painted-steel', 'cab-light-neutral', CYBERCAB_PAINTS[paint % 2], { roughness: .32, metalness: .35 });
  // dark-glass selects Physical and adds the PHYSICAL program define. Keep the
  // Standard clone: ruling 57 permits only the paint's vertex-colour variant.
  const glass = material('wraparound-glass', 'painted-steel', 'cab-light-neutral', liveries.cab.glass, { roughness: .19, metalness: .15 });
  const rubber = material('tyres-trim', 'rubber-trim', 'fixture-rubber', liveries.cab.rubber, { roughness: .8 });
  const light = material('cyan-strip', 'rubber-trim', 'fixture-rubber', liveries.cab.light, { emissive: liveries.cab.lightEmissive, emissiveIntensity: 1.2 });
  if (livery) {
    const source = paints;
    paints = classMaterial('painted-steel', 'cab-light-neutral', { source });
    paints.color.set(liveries.cab.vertexTint);
    paints.vertexColors = true;
    source.dispose();
  }
  const liveryAreas = { roof: 0, shoulders: 0 };
  const blue = new THREE.Color(resolveColour(LIVERY_SPECS.cab.regions.roof[0].colour).colour);
  const neutral = new THREE.Color(resolveColour(LIVERY_SPECS.cab.regions.side[0].colour).colour);
  const add = (g, m, x=0,y=0,z=0, region='neutral') => {
    g.deleteAttribute('uv'); g.translate(x,y,z);
    if (livery && m === paints) {
      // The body kit splits only region seams; no tessellation, normal or draw changes.
      tagRegions(g, { sillY: 0, lengthAxis: 'z', enabled: true });
      const ids = g.getAttribute('regionId'), colours = new Float32Array(ids.count * 3);
      const regions = new Uint8Array(ids.count);
      for (let i=0;i<ids.count;i++) {
        const blueRegion = region === 'roof' ? 2 : region === 'shoulders' ||
          (region === 'shell' && ids.getX(i) === REGION_IDS.roof) ? 1 : 0;
        regions[i] = blueRegion;
        (blueRegion ? blue : neutral).toArray(colours, i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
      g.setAttribute('cabLiveryRegion', new THREE.BufferAttribute(regions, 1));
      const p=g.attributes.position, a=new THREE.Vector3(), b=new THREE.Vector3(), c=new THREE.Vector3();
      for (let i=0;i<g.index.count;i+=3) {
        const id=g.index.getX(i), r=regions[id];
        if (!r) continue;
        a.fromBufferAttribute(p,id); b.fromBufferAttribute(p,g.index.getX(i+1)); c.fromBufferAttribute(p,g.index.getX(i+2));
        liveryAreas[r === 2 ? 'roof' : 'shoulders'] += b.sub(a).cross(c.sub(a)).length()/2;
      }
    }
    if (!bins.has(m)) bins.set(m, []); bins.get(m).push(g);
  };
  const box = (w,h,d,m,x,y,z) => add(new THREE.BoxGeometry(w,h,d),m,x,y,z);
  // A low two-seat coupe: broad shoulders, a short dark canopy and a tapered nose.
  // The closed canopy replaces the tall taxi roof and roof-mounted sensor stack.
  const lower = archedLowerShell([[-2.16,.88,.30,1.02],[-1.72,1,.28,1.15],[-.55,1,.28,1.02],
    [.82,1,.28,.93],[1.63,.96,.32,.85],[2.14,.78,.36,.76]]);
  add(lower.geometry, paints, 0,0,0, 'shell');
  add(lower.topSkin, paints, 0,0,0, 'shoulders');
  add(archShoulders(lower.sample, lower.zList), paints, 0,0,0, 'shoulders');
  const canopy = shell([[-1.78,.77,1.01,1.13],[-.78,.85,.96,1.48],[-.28,.85,.93,1.60],[.20,.83,.89,1.57],[1.25,.73,.84,.91]]);
  if (livery) {
    // The three top panels stop at the front windscreen. Re-batch the accepted
    // triangles into paint, retaining their sloped positions and authored normals.
    const roofIndices=[], glassIndices=[];
    for(let i=0;i<canopy.index.count;i++) {
      const roof = i < 3*48 && Math.floor((i % 48)/6) === 4;
      (roof ? roofIndices : glassIndices).push(canopy.index.getX(i));
    }
    const roof=canopy.clone(); roof.setIndex(roofIndices); canopy.setIndex(glassIndices);
    add(roof, paints, 0,0,0, 'roof');
  }
  add(canopy, glass);
  box(1.65,.15,3.92,rubber,0,.31,0);
  add(archWells(lower.sample), rubber);
  // Retain the old ground footprint and wheelbase; only the cabin becomes lower.
  box(1.44,.09,.08,rubber,0,.43,2.1292);
  box(1.65,.10,.08,rubber,0,.43,-2.1532);
  for (const x of [-1.005,1.005]) for (const z of [-1.35,1.34]) {
    // Axial profile rounds both tread shoulders, while the full .44 m radius
    // still touches ground at the accepted wheel centre and wheelbase.
    add(roundedTyre(),rubber,x,.44,z);
    // A smaller, shallow aero dish reveals a real sidewall. Its centre is
    // recessed; even the rim stays inside the tyre's outer sidewall.
    const cover = new THREE.CylinderGeometry(.345,.345,.044,24);
    cover.rotateZ(Math.PI/2);
    const p = cover.attributes.position, side = Math.sign(x);
    for (let i=0;i<p.count;i++)
      if (Math.hypot(p.getY(i),p.getZ(i))<.0001 && p.getX(i)*side>0)
        p.setX(i,p.getX(i)-side*.032);
    p.needsUpdate=true; cover.computeVertexNormals();
    add(cover,paints,side*1.083,.44,z);
  }
  // Keep the shared status-light material used by poseCybercabs, without sensor pods.
  box(1.34,.042,.035,light,0,.70,2.145);
  box(1.48,.042,.035,light,0,.96,-2.17);
  // One long, closed door per side. Its flush shutlines sit on the flat painted flank.
  for (const x of [-1.002,1.002]) {
    for (const z of [-.86,.78]) box(.008,.30,.014,rubber,x,.585,z);
    box(.008,.014,1.64,rubber,x,.43,-.04);
  }
  const parts = [];
  for (const [m, geometries] of bins) {
    const g = mergeGeometries(geometries); geometries.forEach(g => g.dispose());
    parts.push({ geometry:g, material:m });
  }
  return { id:'cybercab', representation:'procedural', parts, ...(livery ? { liveryAreas } : {}),
    triangles:parts.reduce((n,p)=>n+(p.geometry.index?.count ?? p.geometry.attributes.position.count)/3,0) };
}

export function cybercabGroup(model) {
  const group = new THREE.Group(); group.name = 'vehicle:cybercab';
  group.userData.card = { kind:'cybercab' };
  for (const p of model.parts) { const mesh = new THREE.Mesh(p.geometry,p.material); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); }
  return group;
}

const contexts = new WeakMap();
export function cybercabContext(city) {
  if (!contexts.has(city)) contexts.set(city, { state:null, people:null, records:new Map(), completed:0, pickups:0 });
  return contexts.get(city);
}

export function cabForwardDistance(car, along) {
  return ((along - car.distance) % car.loop.length + car.loop.length) % car.loop.length;
}

/** A ride request uses the walk solver's existing pose, and only a nearby legal kerb. */
export function cybercabRidePose(city, actor, pose, dt) {
  const context = cybercabContext(city), ride = actor.cabRide;
  if (!ride) return pose;
  if (ride.phase === 'alight') {
    actor.x = ride.destination.footX; actor.z = ride.destination.footZ;
    actor._lastX = actor.x; actor._lastZ = actor.z;
    actor.cabRide = null; actor.cabCooldown = (context.traffic?.elapsed ?? 0) + 30;
    context.people?._resumeLocalWalk(actor);
    return { ...pose, x:actor.x,z:actor.z,moving:false,speed:0,intent:'idle' };
  }
  const target = ride.pickup;
  const x = actor._lastX ?? pose.x, z = actor._lastZ ?? pose.z;
  const distance = Math.hypot(target.footX-x,target.footZ-z);
  const fraction = Math.min(1, Math.max(0,dt)*1.4 / Math.max(.001,distance));
  return { ...pose, x:x+(target.footX-x)*fraction,z:z+(target.footZ-z)*fraction,
    yaw:target.yaw, moving:distance>.08 && ride.phase!=='carry',speed:distance>.08?1.4:0,
    intent:'ride', hx:0,hz:0 };
}

function cabBay(traffic, car, x,z, maxRange) {
  const bay = kerbBayFromLoop(car.loop,x,z,{ junctions:traffic._junctions, maxRange });
  if (!bay) return null;
  // The solver's loop is the lane centre. Foot position is toward the bay's footpath.
  const points = car.loop.points, cum = car.loop.cum;
  let i=1; while(i<cum.length-1 && cum[i]<bay.along) i++;
  const a=points[i-1],b=points[i],u=(bay.along-cum[i-1])/Math.max(.001,cum[i]-cum[i-1]);
  const roadX=a.x+(b.x-a.x)*u,roadZ=a.z+(b.z-a.z)*u;
  const dx=bay.x-roadX,dz=bay.z-roadZ,len=Math.hypot(dx,dz);
  return { ...bay,roadX,roadZ,footX:roadX+dx/len*2.35,footZ:roadZ+dz/len*2.35 };
}

export function cabAgendaBay(traffic, destination) {
  let best = null;
  for (const loop of traffic?._loops ?? []) {
    const bay = cabBay(traffic, {loop}, destination.x, destination.z, Infinity);
    if (!bay) continue;
    const distance = Math.hypot(bay.footX-destination.x, bay.footZ-destination.z);
    if (distance <= 40 && (!best || distance < best.distance)) best = {...bay, loop, distance};
  }
  return best;
}

// Directed graph of the existing lane polylines. Split crossings before searching,
// so a depot job can leave a corridor loop without cutting through a block.
export function cabRoadRoute(traffic, start, finish) {
  const loops=traffic._loops;
  const segments=[];
  for(const loop of loops) for(let i=1;i<loop.points.length;i++) {
    const a=loop.points[i-1],b=loop.points[i];
    if(Math.hypot(b.x-a.x,b.z-a.z)>.001) segments.push({a,b,cuts:[0,1]});
  }
  const cross=(a,b)=>a.x*b.z-a.z*b.x;
  const sub=(a,b)=>({x:a.x-b.x,z:a.z-b.z});
  const point=(s,t)=>({x:s.a.x+(s.b.x-s.a.x)*t,z:s.a.z+(s.b.z-s.a.z)*t});
  for(let i=0;i<segments.length;i++) for(let j=i+1;j<segments.length;j++) {
    const s=segments[i],t=segments[j],u=sub(s.b,s.a),v=sub(t.b,t.a),d=cross(u,v);
    if(Math.abs(d)<1e-8) continue;
    const w=sub(t.a,s.a),a=cross(w,v)/d,b=cross(w,u)/d;
    if(a>=0&&a<=1&&b>=0&&b<=1) {s.cuts.push(a);t.cuts.push(b);}
  }
  const project=p=>{
    let best=null;
    for(const s of segments) {
      const v=sub(s.b,s.a),w=sub(p,s.a),t=Math.max(0,Math.min(1,(v.x*w.x+v.z*w.z)/(v.x*v.x+v.z*v.z)));
      const q=point(s,t),d=Math.hypot(p.x-q.x,p.z-q.z);
      if(!best||d<best.d) best={s,t,q,d};
    }
    // Several route families share a physical lane. Split every coincident
    // segment at the access point so the search sees all legal continuations.
    for(const s of segments) {
      const v=sub(s.b,s.a),w=sub(best.q,s.a),t=(v.x*w.x+v.z*w.z)/(v.x*v.x+v.z*v.z);
      if(t>=0&&t<=1&&Math.hypot(point(s,t).x-best.q.x,point(s,t).z-best.q.z)<.0001)s.cuts.push(t);
    }
    return best.q;
  };
  if(!segments.length) return null;
  const origin=project(start),target=project(finish),nodes=new Map();
  const key=p=>`${p.x.toFixed(4)},${p.z.toFixed(4)}`;
  const node=p=>{const k=key(p);if(!nodes.has(k))nodes.set(k,{p,edges:[],cost:Infinity});return nodes.get(k);};
  for(const s of segments) {
    s.cuts.sort((a,b)=>a-b);
    for(let i=1;i<s.cuts.length;i++) {
      const a=node(point(s,s.cuts[i-1])),b=node(point(s,s.cuts[i]));
      if(a!==b)a.edges.push({to:b,cost:Math.hypot(a.p.x-b.p.x,a.p.z-b.p.z)});
    }
  }
  const first=node(origin),last=node(target);first.cost=0;
  const pending=new Set(nodes.values());
  while(pending.size) {
    let current=null;for(const n of pending)if(!current||n.cost<current.cost)current=n;
    if(!Number.isFinite(current.cost))return null;
    pending.delete(current);if(current===last)break;
    for(const e of current.edges)if(current.cost+e.cost<e.to.cost) {e.to.cost=current.cost+e.cost;e.to.prev=current;}
  }
  const route=[];for(let n=last;n;n=n.prev)route.unshift(n.p);
  return [start,...route,finish].filter((p,i,a)=>!i||Math.hypot(p.x-a[i-1].x,p.z-a[i-1].z)>.001);
}

function cabTripLoop(traffic, points) {
  const cum=[0],stops=[];
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    cum.push(cum[i-1]+len);
    for(const j of traffic._junctions??[]) {
      const t=((j.x-a.x)*dx+(j.z-a.z)*dz)/(len*len);
      if(t<=0||t>1||Math.hypot(a.x+t*dx-j.x,a.z+t*dz-j.z)>9)continue;
      const centreAlong=cum[i-1]+len*t,along=centreAlong-8;
      if(along>0&&!stops.some(s=>s.key===j.key&&Math.abs(s.along-along)<6))
        stops.push({...j,along,centreAlong,axis:Math.abs(dx)>Math.abs(dz)?'ew':'ns'});
    }
  }
  const end=cum.at(-1);
  // A stationary terminal tail keeps the loop sampler from wrapping at the bay.
  points.push({...points.at(-1)});cum.push(end+1000);
  return {points,cum,length:end+1000,stops:stops.sort((a,b)=>a.along-b.along),cabEnd:end};
}

function beginCabTrip(traffic, record, destination, prefix=[]) {
  const car=record.car,start=prefix.at(-1)??{x:car.worldX,z:car.worldZ};
  const road=cabRoadRoute(traffic,start,destination);
  if(!road)return false;
  car.cabHomeLoop??=car.loop;
  car.loop=cabTripLoop(traffic,[...prefix,...road]);car.distance=0;
  car.cabStopDistance=car.loop.cabEnd;car.cabHold=false;car.speed=0;
  car.junctionKey=null;car.committedKey=null;car.junctionArrival=null;
  record.trip=true;record.parked=false;return true;
}

function restoreCabRide(traffic, context, record, cab) {
  if(record.ride||cab.status!=='carry'||!cab.ride)return;
  const car=record.car,loops=traffic._loops;
  let saved=cab.ride.map;
  // Pickup dispatch saves synchronously, before its acknowledgement returns to
  // this renderer. The compact ID carries that initial route; later saves also
  // carry the precise progress attachment. Both use the same reducer ride ID.
  if(!saved&&cab.ride.id.startsWith('m2_')) {
    const fields=cab.ride.id.split('_'),[actorIndex,loopIndex,pick,drop]=fields.slice(-4).map(s=>parseInt(s,36));
    const loop=loops[loopIndex],actor=context.people?.actors[actorIndex];
    if(loop&&actor&&[pick,drop].every(Number.isFinite)) {
      const bay=along=>{
        let i=1;while(i<loop.cum.length-1&&loop.cum[i]<along)i++;
        const a=loop.points[i-1],b=loop.points[i],t=(along-loop.cum[i-1])/(loop.cum[i]-loop.cum[i-1]);
        return cabBay(traffic,{...car,loop},a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);
      };
      const pickup=bay(pick/1000),destination=bay(drop/1000);
      if(pickup&&destination)saved={actorId:actor.id,loopIndex,pickup,destination,metres:0,distance:pickup.along};
    }
  }
  if(!saved)return; // Legacy IDs contain no recoverable passenger or destination.
  const actor=context.people?.actors.find(a=>a.id===saved.actorId);
  if(!actor)return;
  const loop=saved.agendaRoute ? cabTripLoop(traffic,saved.agendaRoute.map(p=>({...p})))
    : saved.loopKey?loops.find(l=>cabLoopKey(l)===saved.loopKey):loops[saved.loopIndex];if(!loop)return;
  if (saved.destination?.loopIndex != null) saved.destination.loop=loops[saved.destination.loopIndex];
  car.loop=loop;car.distance=saved.distance;car._drawnX=null;car._drawnZ=null;
  record.ride={...saved,id:cab.ride.id,actor,phase:'carry',lastDistance:saved.distance};
  actor.cabRide=record.ride;
}

function cabLoopKey(loop) {
  return `${loop.points[0].x.toFixed(3)}:${loop.points[0].z.toFixed(3)}:${loop.length.toFixed(3)}`;
}

function cabRideSnapshot(traffic,ride,car) {
  return {actorId:ride.actor.id,loopKey:cabLoopKey(car.loop),loopIndex:traffic._loops.indexOf(car.loop),
    pickup:ride.pickup,destination:{...ride.destination,loop:undefined,loopIndex:traffic._loops.indexOf(ride.destination.loop)},
    agendaRoute:ride.agendaRoute,agendaDestination:ride.agendaDestination,metres:ride.metres,distance:car.distance};
}

function cabTowVehicle(traffic) {
  const group=new THREE.Group();group.name='vehicle:cybercab-recovery-ute';
  for(const [name,part] of Object.entries(traffic.byType.ute)) {
    const material=part.material.clone();
    if(name==='body')material.color.set(liveries.cab.towPaint);
    const mesh=new THREE.Mesh(part.geometry,material);mesh.castShadow=true;group.add(mesh);
  }
  for(const x of [-.7,.7]) for(const z of [-1.1,1.1]) {
    const wheel=new THREE.Mesh(traffic.wheels.geometry,traffic.wheels.material.clone());
    wheel.position.set(x,.43,z);group.add(wheel);
  }
  group.scale.setScalar(1.15);traffic.root.add(group);return group;
}

/** Bind business inventory to the fully arbitrated fleet; no second traffic simulation. */
export function updateCybercabs(traffic, dt) {
  const context = cybercabContext(traffic.city); context.traffic = traffic;
  let business = context.state?.cybercab;
  if (!business) return;
  const dispatch = context.dispatch ?? (action => globalThis.window?.__districtDeck?.dispatch(action));
  if(context.quarter!==business.quarter) {
    context.quarter=business.quarter;context.beatStart=traffic.elapsed;context.startedBeat=business.beat;
  }
  const dueBeat=Math.min(business.quarter*4,context.startedBeat+Math.floor((traffic.elapsed-context.beatStart)/75));
  if(business.fleet.length && business.beat<dueBeat) {
    dispatch({type:'CYBERCAB_TICK',beat:business.beat+1});
    business=context.state?.cybercab??business;
  }
  for (const cab of business.fleet) {
    if (cab.status === 'shipping') {
      const absent=context.records.get(cab.id);
      if(absent) {absent.group.visible=false;absent.car.cabHold=true;}
      continue;
    }
    let record = context.records.get(cab.id);
    if (!record) {
      let car = traffic.fleet.find(car=>!car.cabId);
      if (!car) {
        car = traffic.flowFleet.find(car=>!car.cabId);
        if (!car && traffic.fleet.length===11) {
          const source=traffic.fleet[0],len=source.loop.length;
          const positions=traffic.fleet.filter(c=>c.loop===source.loop).map(c=>((c.distance%len)+len)%len).sort((a,b)=>a-b);
          let gap=-1,at=0;
          for(let i=0;i<positions.length;i++) {
            const next=i+1<positions.length?positions[i+1]:positions[0]+len;
            if(next-positions[i]>gap) {gap=next-positions[i];at=(positions[i]+next)/2;}
          }
          if(gap<12) continue;
          car={...source,cabId:null,cabHold:false,cabStopDistance:null,distance:at,speed:0,accel:0,
            crashed:false,crashTimer:0,crashNudgeX:0,crashNudgeZ:0,errand:null,errandAway:false,
            _drawnX:null,_drawnZ:null,yawSeeded:false,junctionKey:null,junctionArrival:null,committedKey:null};
          traffic.vehicles.push(car);traffic.capacity++;
        }
        if (!car) continue;
        traffic.flowFleet = traffic.flowFleet.filter(row=>row!==car);traffic.fleet.push(car);
      }
      const model=buildCybercabModel(context.records.size%2),group=cybercabGroup(model);
      // Match the existing solver's 3.713 × 1.7308 m envelope, including sensors/tyres.
      group.scale.set(.77,.88,.85);
      traffic.root.add(group); car.cabId=cab.id; car.userData={card:{kind:'cybercab',cabId:cab.id}};
      record={car,group,model,ride:null}; context.records.set(cab.id,record);
      // New inventory starts on the depot's two existing charge pads. A tiny
      // terminal lane lets the ordinary traffic sampler own its parked pose.
      if (cab.status==='idle' && cab.location==='depot' && context.depot
        && business.ledger.some(row=>row.cabId===cab.id && row.source==='starter-fleet')) {
        const slot=(context.records.size-1)%2;
        const bay={x:context.depot.x+(slot===0?3.7:-3.6),y:.12,z:context.depot.z-3.7};
        car.cabHomeLoop=car.loop;
        car.loop=cabTripLoop(traffic,[bay,{...bay,z:bay.z-.01}]);
        car.distance=0;car.speed=0;car.cabHold=true;car.cabStopDistance=0;
        car.worldX=bay.x;car.worldZ=bay.z;car._drawnX=null;car._drawnZ=null;
        car.junctionKey=null;car.committedKey=null;car.junctionArrival=null;
        record.parked=true;record.parkedAt=traffic.elapsed+6+slot*2;
      }
    }
    const {car,group}=record;
    group.visible=true;
    group.userData.card.cabId=cab.id;
    const previousStatus=record.status,previousLocation=record.location;
    record.halted=cab.haltUntil>business.beat;
    car.cabHold = record.halted || ['yard','service','repair'].includes(cab.status)
      || ['roadside','tow'].includes(cab.location);
    record.status=cab.status; record.location=cab.location;
    restoreCabRide(traffic,context,record,cab);
    if(cab.status==='yard' && context.yard) {
      record.trip=false;record.parked=false;record.returnBay=null;car.speed=0;
      const bay=context.yardBays?.[cab.bay]??context.yard;
      record.yardPose={x:bay.x,y:bay.y,z:bay.z,yaw:bay.yaw??0};
      if(previousStatus!=='yard') {
        car.cabHomeLoop??=car.loop;
        car.loop=cabTripLoop(traffic,[record.yardPose,{x:bay.x+Math.sin(bay.yaw??0)*.01,z:bay.z+Math.cos(bay.yaw??0)*.01}]);
        car.distance=0;car._drawnX=null;car._drawnZ=null;
      }
      car.cabHold=true;
    }
    const needsDepot=['service','repair'].includes(cab.status)||cab.location==='tow'
      || previousStatus==='yard'&&cab.status!=='yard'
      || previousLocation==='roadside'&&cab.location==='depot';
    if(needsDepot&&!record.trip&&!record.parked&&context.depot) {
      const d=context.depot,destination={x:d.x+3.6,y:.09,z:d.z-3.7};
      const gate=context.yardGate,aisle=context.yardAisle;
      const prefix=record.yardPose?[record.yardPose,
        ...(aisle?[{x:record.yardPose.x,y:aisle.y,z:aisle.z},{x:gate?.x??record.yardPose.x,y:aisle.y,z:aisle.z}]:[]),
        {x:aisle?(gate?.x??record.yardPose.x):record.yardPose.x,y:record.yardPose.y,z:gate?.z??4.5},gate??{x:record.yardPose.x,z:4.5},
        {x:gate?.x??record.yardPose.x,z:11.5}]:[];
      if(beginCabTrip(traffic,record,destination,prefix)) {
        record.recovery=cab.location==='tow';
        record.yardPose=null;car._drawnX=null;car._drawnZ=null;
      }
    }
    if(record.trip) {
      car.cabStopDistance=Math.max(0,car.loop.cabEnd-car.distance);
      // A puncture's halt applies to the cab; its recovery vehicle can move.
      car.cabHold=record.halted&&!record.recovery;
      if(car.cabStopDistance<.4&&car.speed<.35) {
        record.trip=false;record.parked=true;record.parkedAt=traffic.elapsed;car.cabHold=true;
        if(record.returnBay) {
          car.loop=record.returnBay.loop;car.distance=record.returnBay.along;
          record.returnBay=null;record.parked=false;car.cabHold=false;car.cabStopDistance=null;
        }
      }
    }
    if(record.parked&&cab.status==='idle'&&cab.location==='depot'&&!record.halted
      &&traffic.elapsed-record.parkedAt>2) {
      let best=null;
      for(const loop of traffic._loops) {
        const bay=cabBay(traffic,{...car,loop},car.worldX,car.worldZ);
        if(!bay)continue;
        const distance=Math.hypot(bay.roadX-car.worldX,bay.roadZ-car.worldZ);
        if(!best||distance<best.distance)best={...bay,loop,distance};
      }
      if(best&&beginCabTrip(traffic,record,{x:best.roadX,z:best.roadZ})) record.returnBay=best;
    }
    if(record.parked)car.cabHold=true;
    if (record.ride && cab.status !== 'carry' && record.ride.phase==='carry') {
      // Incidents cancel the sim ride; release the passenger at the current safe kerb.
      const safe=cabBay(traffic,car,car.worldX,car.worldZ);
      if (safe) { record.ride.destination=safe; record.ride.phase='alight'; }
      record.ride=null;
    }
    if (car.cabHold || record.trip || record.parked) continue;
    if (!record.ride && cab.status==='idle' && traffic.elapsed >= (record.nextDemandAt??0)) {
      record.nextDemandAt = traffic.elapsed + 1;
      const candidates = (context.people?.actors ?? []).filter(a=>!a.cabRide && !a.lockedPose && !a.hasDog
        && a.pedestrianVariant!=='cyclist' && !a.dragHold && !a.tramRide
        && ((a.cabCooldown??0)<=traffic.elapsed
          // Agendas renew a one-second commute-only hold even for cab-mode
          // walkers travelling home in the opening quarter (hours 0–4).
          // Honour their actual destination while retaining the 30 s ride cooldown.
          || (a.agendaNow?.mode==='cybercab' && (a.cabCooldown??0)<=traffic.elapsed+1
            && Math.hypot((a._lastX??a.x)-a.agendaNow.destination.x,
              (a._lastZ??a.z)-a.agendaNow.destination.z)>18)));
      let best=null;
      for (const actor of candidates) {
        const x=actor._lastX??actor.x,z=actor._lastZ??actor.z,pickup=cabBay(traffic,car,x,z);
        if (!pickup || Math.hypot(pickup.footX-x,pickup.footZ-z)>2) continue;
        const ahead=cabForwardDistance(car,pickup.along);
        if (ahead<Math.max(5,car.speed*car.speed/6) || ahead>100) continue;
        // Nearest eligible cab wins, measured by its legal forward route to this kerb.
        if ([...context.records.values()].some(other=>other!==record && other.status==='idle' && !other.ride
          && other.car.loop===car.loop && cabForwardDistance(other.car,pickup.along)<ahead)) continue;
        if (!best || ahead<best.ahead) best={actor,pickup,ahead};
      }
      // Agenda walkers can be on another corridor. Reach their kerb through the
      // same connected road graph used for depot work, then join its lane loop.
      if(!best) for(const loop of traffic._loops) {
        if(loop===car.loop)continue;
        for(const actor of candidates) {
          const x=actor._lastX??actor.x,z=actor._lastZ??actor.z,pickup=cabBay(traffic,{...car,loop},x,z);
          if(!pickup||Math.hypot(pickup.footX-x,pickup.footZ-z)>2)continue;
          const ahead=Math.hypot(pickup.roadX-car.worldX,pickup.roadZ-car.worldZ);
          if(!best||ahead<best.ahead)best={actor,pickup,ahead,loop};
        }
      }
      if (best) {
        const {actor,pickup}=best;
        const dispatchCar=best.loop?{...car,loop:best.loop}:car;
        const agendaDestination=actor.agendaNow?.mode==='cybercab' ? actor.agendaNow.destination : null;
        const destination=agendaDestination ? cabAgendaBay(traffic,agendaDestination)
          : cabBay(traffic,dispatchCar,pickup.roadX+Math.sin(pickup.yaw)*32,pickup.roadZ+Math.cos(pickup.yaw)*32);
        if (!destination || (!agendaDestination && cabForwardDistance({...dispatchCar,distance:pickup.along},destination.along)<20)) continue;
        const agendaRoute=agendaDestination && cabRoadRoute(traffic,
          {x:pickup.roadX,z:pickup.roadZ},{x:destination.roadX,z:destination.roadZ});
        if (agendaDestination && !agendaRoute) continue;
        if(best.loop) {
          if(!beginCabTrip(traffic,record,{x:pickup.roadX,z:pickup.roadZ}))continue;
          record.returnBay={...pickup,loop:best.loop};
        }
        const routeId=[context.people.actors.indexOf(actor),
          traffic._loops.indexOf(dispatchCar.loop),
          Math.round(pickup.along*1000),Math.round(destination.along*1000)].map(n=>n.toString(36)).join('_');
        let serial=0,id; do { id=`m2_${cab.id}_${business.quarter}_${business.beat}_${serial++}_${routeId}`; }
        while(Object.hasOwn(business.seenRides??{},id));
        record.ride={id,actor,pickup,destination,agendaDestination,agendaRoute,phase:'hail',metres:0,lastDistance:car.distance};
        actor.cabRide=record.ride;
        if(record.trip)continue;
      }
    }
    const ride=record.ride;
    if (!ride) { car.cabStopDistance=null; continue; }
    const advanced=Math.max(0,car.distance-ride.lastDistance); ride.lastDistance=car.distance;
    if (ride.phase==='carry') ride.metres+=advanced;
    if(ride.phase==='carry'&&cab.ride?.id===ride.id) {
      // The ordinary canonical save retains this plain, acyclic render attachment.
      // Fare factors and the stable reducer ID remain reducer-owned.
      cab.ride.map=cabRideSnapshot(traffic,ride,car);
    }
    const target=ride.phase==='carry'?ride.destination:ride.pickup;
    car.cabStopDistance=cabForwardDistance(car,target.along);
    if (car.cabStopDistance<.4 && car.speed<.35) {
      car.cabHold=true;
      if (ride.phase==='hail') {
        if (Math.hypot((ride.actor._lastX??0)-target.footX,(ride.actor._lastZ??0)-target.footZ)>.2) continue;
        dispatch({type:'CAB_PICKUP',cabId:cab.id,rideId:ride.id,surge:/rain/.test(context.state?.weather?.state??'')});
        if (context.state?.cybercab?.fleet.find(c=>c.id===cab.id)?.ride?.id!==ride.id) continue;
        ride.phase='carry'; context.pickups++; car.cabHold=false; car.cabStopDistance=null;
        if (ride.agendaRoute) {
          car.cabHomeLoop ??= car.loop;
          car.loop=cabTripLoop(traffic,ride.agendaRoute.map(p=>({...p})));
          car.distance=0; ride.lastDistance=0; ride.destination.returnAlong=ride.destination.along;ride.destination.along=car.loop.cabEnd;
          car.junctionKey=null;car.committedKey=null;car.junctionArrival=null;
        }
        context.state.cybercab.fleet.find(c=>c.id===cab.id).ride.map=cabRideSnapshot(traffic,ride,car);
      } else {
        dispatch({type:'CAB_DROPOFF',cabId:cab.id,rideId:ride.id,distanceM:ride.metres});
        if (context.state?.cybercab?.seenRides?.[ride.id]!=='complete') continue;
        ride.phase='alight'; context.completed++; record.ride=null; car.cabHold=false; car.cabStopDistance=null;
        if (ride.agendaRoute) {
          context.lastAgendaDropoff={destination:ride.agendaDestination,bay:{x:target.footX,z:target.footZ},distanceM:ride.metres};
          car.loop=target.loop;car.distance=target.returnAlong;
        }
      }
    }
  }
  for (const entry of traffic._mischiefProxies??[]) if(entry.car.cabId) entry.proxy.visible=false;
}

export function poseCybercabs(traffic) {
  for (const record of cybercabContext(traffic.city).records.values()) {
    const {car,group,location,yardPose,halted}=record;
    group.position.set(yardPose?.x??car.worldX,yardPose?.y??0,yardPose?.z??car.worldZ);
    if(!yardPose&&(record.trip||record.parked)&&car.loop.cabEnd!=null) {
      let i=1;while(i<car.loop.cum.length-1&&car.loop.cum[i]<car.distance)i++;
      const a=car.loop.points[i-1],b=car.loop.points[i];
      const t=Math.max(0,Math.min(1,(car.distance-car.loop.cum[i-1])/(car.loop.cum[i]-car.loop.cum[i-1])));
      group.position.y=(a.y??0)+((b.y??0)-(a.y??0))*t;
    }
    group.rotation.set(0,yardPose?yardPose.yaw:car.yaw,location==='roadside'?.07:0);
    if(location==='roadside') {
      group.position.x+=Math.cos(car.yaw)*1.7;group.position.z-=Math.sin(car.yaw)*1.7;
    }
    if(record.recovery&&record.trip) {
      record.towGroup??=cabTowVehicle(traffic);
      record.towGroup.visible=true;
      record.towGroup.position.set(car.worldX,0,car.worldZ);
      record.towGroup.rotation.y=car.yaw;
      group.position.x-=Math.sin(car.yaw)*3.9;group.position.z-=Math.cos(car.yaw)*3.9;
      group.position.y=.16;group.rotation.x=-.09;
    } else if(record.towGroup) record.towGroup.visible=false;
    const light=record.model.parts.find(p=>p.material.name==='cybercab:cyan-strip')?.material;
    if(light) {
      const amber=halted||location==='roadside'||location==='tow';
      light.color.set(amber?liveries.cab.amber:liveries.cab.light);light.emissive.set(amber?liveries.cab.amberEmissive:liveries.cab.lightEmissive);
      light.emissiveIntensity=amber?.3+1.5*(.5+.5*Math.sin(traffic.elapsed*7)):1.2;
    }
  }
}

export function disposeCybercabs(traffic) {
  const context=cybercabContext(traffic.city);
  for (const {group,model,towGroup} of context.records.values()) {
    if(towGroup) {towGroup.removeFromParent();towGroup.traverse(p=>p.material?.dispose());}
    group.removeFromParent(); for(const part of model.parts) { part.geometry.dispose();part.material.dispose(); }
  }
  context.records.clear();context.people=null;context.traffic=null;
}
