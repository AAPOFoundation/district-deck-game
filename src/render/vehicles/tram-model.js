// S3: board-metre W/E hull for synchronous fringe builders and failed GLB loads.
// Long axis X; nine material batches, deterministic geometry, no texture downloads.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import document from '../style/liveries.json' with { type: 'json' };
import { classMaterial, resolveColour, freezeTree } from '../style/material-classes.js';
import { LIVERY_SWITCHES, LIVERY_SPECS, liveryAtlas, metreToAtlasUV } from '../style/livery.js';
import { tagRegions, regionsFromMaterialNames, REGION_IDS } from './body-kit.js';

// Whole named primitives already carry the factory bands. Never tag shared iron,
// glazing or interior timber. E roof grey also serves pantograph insulators.
export const TRAM_MATERIAL_REGIONS = freezeTree({
  'w-class-tram': {
    'V233 heritage green': 'side', 'V233 warm cream': 'side',
    'V233 blackwood': 'none', 'V233 smoked glass': 'none',
    'V233 lining gold': 'side', 'V233 roof grey': 'roof',
    'V233 dark iron': 'none', 'V233 white lens': 'none',
  },
  'e-class-tram': {
    'V233 PTV green': 'side', 'V233 modern white': 'side',
    'V233 black': 'none', 'V233 smoked glass': 'none',
    'V233 safety yellow': 'front', 'V233 dark iron': 'none',
    'V233 roof grey': 'none', 'V233 white lens': 'none',
  },
});
const GLB_COLOURS = freezeTree({
  'V233 heritage green': 'tram-w-green', 'V233 warm cream': 'tram-w-cream',
  'V233 lining gold': 'tram-w-gold', 'V233 roof grey': 'tram-roof-grey',
  'V233 PTV green': 'tram-e-green', 'V233 modern white': 'tram-e-white',
  'V233 safety yellow': 'tram-safety-yellow',
});
const FALLBACK_COLOURS = freezeTree({
  'w-class-tram': ['tram-w-green','tram-w-cream','tram-roof-grey',null,null,null,null,'tram-w-cream',null],
  'e-class-tram': ['tram-e-green','tram-e-white','tram-roof-grey',null,null,'tram-trim',null,'tram-e-white',null],
});

/** Join the existing hull to P13a/b once, before per-tram colour clones. */
export function applyTramLivery(model, id, { enabled = LIVERY_SWITCHES.tram } = {}) {
  if (!enabled || model.tramLivery) return model;
  const names = TRAM_MATERIAL_REGIONS[id];
  if (!names) throw new Error(`Unknown tram livery: ${id}`);
  model.parts.forEach((part, index) => {
    const colour = model.fallback ? FALLBACK_COLOURS[id][index]
      : names[part.material.name] && names[part.material.name] !== 'none' ? GLB_COLOURS[part.material.name] : null;
    if (!colour) return;
    const eShell = !model.fallback && id === 'e-class-tram' && part.material.name === 'V233 modern white';
    if (eShell) {
      // E is authored along X. Its ground-normalised green hull starts at
      // y=0.137500 m (0.319355 board metres); the white shell crosses its bands.
      const body = model.parts.find(p => p.material.name === 'V233 PTV green').geometry;
      if (!body.boundingBox) body.computeBoundingBox();
      const fit = tramFactoryScale(model, id);
      part.geometry = part.geometry.clone();
      tagRegions(part.geometry, { lengthAxis: 'x', sillY: body.boundingBox.min.y, enabled: true });
      // Keep positions/normals byte-identical. The imported hull's non-uniform
      // board scale belongs in its metre UVs, before livery's atlas transform.
      const metres = part.geometry.getAttribute('uvMetre'), regions = part.geometry.getAttribute('regionId');
      for (let i = 0; i < metres.count; i++) {
        const region = regions.getX(i);
        metres.setXY(i, metres.getX(i) * (region >= REGION_IDS.front ? fit.z : fit.x),
          metres.getY(i) * (region === REGION_IDS.roof ? fit.z : fit.y));
      }
    } else if (model.fallback) tagRegions(part.geometry, { lengthAxis: 'x', sillY: 0, enabled: true });
    else {
      const mesh = new THREE.Mesh(part.geometry, part.material);
      regionsFromMaterialNames(mesh, names, { enabled: true });
      part.geometry = mesh.geometry;
    }
    const swatch = resolveColour(colour);
    part.material = classMaterial(swatch.className, colour, { source: part.material });
    // Board clones bypass legacy paint only for these assigned materials.
    part.material.userData.tramLivery = true;
    // E's white GLB shell and fallback lower hull cross colour bands.
    // All other GLB materials retain their authored bands and shader features.
    if (eShell || (model.fallback && id === 'e-class-tram' && index === 0)) {
      const geometry = part.geometry, regions = geometry.getAttribute('regionId');
      const metres = geometry.getAttribute('uvMetre');
      const specName = 'tram-e', spec = LIVERY_SPECS[specName];
      const keys = Object.keys(REGION_IDS), uv = new Float32Array(regions.count * 2);
      for (let i = 0; i < regions.count; i++) {
        // The fallback lower panel keeps green on its roof/underside. The GLB
        // uses every tagged region, with unassigned undersides left white.
        const region = eShell ? keys[regions.getX(i) || REGION_IDS.side]
          : regions.getX(i) >= REGION_IDS.front ? keys[regions.getX(i)] : 'side';
        const [width, height] = spec.sizeMetres[region];
        const u = Math.max(0, Math.min(width, metres.getX(i)));
        const v = Math.max(0, Math.min(height, eShell
          ? regions.getX(i) === REGION_IDS.none ? height : metres.getY(i)
          : geometry.attributes.position.getY(i)));
        uv.set(metreToAtlasUV(specName, region, u, v), i * 2);
      }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      part.material.color.set(document.tramFallback.atlasTint);
      part.material.map = liveryAtlas().map;
    }
  });
  model.tramLivery = true;
  return model;
}
// Share the already-loaded V2.33 registry hull with synchronous fringe builders.
// Geometry only: no simulation state or second asset fetch.
const factoryTrams = new Map();
export function registerFactoryTram(id, model) { factoryTrams.set(id, model); }
export function forgetFactoryTram(id, model) { if(factoryTrams.get(id)===model)factoryTrams.delete(id); }
export function factoryTram(id) { return factoryTrams.get(id) ?? null; }

/** REAL_DIMENSIONS describes the roof, not the raised current collector. */
export function tramFactoryScale(model,id) {
  const modern=id.startsWith('e-class'), height=modern?3.60:3.28;
  let roofTop=0;
  for(const part of model.parts??[]) if(/roof/i.test(part.material?.name??'')) {
    if(!part.geometry.boundingBox)part.geometry.computeBoundingBox();
    roofTop=Math.max(roofTop,part.geometry.boundingBox.max.y);
  }
  return {x:(modern?16.5:13.9)/model.size.x,y:height/(roofTop||model.size.y),
    z:(modern?2.65:2.67)/model.size.z};
}
/** The imported W cream envelope sits proud of its green body. Restore the
 * exposed lower side panels without replacing the cab, doors, windows or trim. */
export function exposeFactoryTramLivery(model,id) {
  if(model.fallback || id!=='w-class-tram') return applyTramLivery(model,id);
  const paint=model.parts.find(p=>/heritage green/i.test(p.material?.name??''));
  if(!paint)return model;
  const fit=tramFactoryScale(model,id),pieces=[];
  for(const side of [-1,1])for(const x of [-3.225,3.225]) {
    const g=new THREE.BoxGeometry(4.55,.62,.024);
    g.translate(x,1.15,side*1.347);g.scale(1/fit.x,1/fit.y,1/fit.z);pieces.push(g);
  }
  const geometry=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());
  model.parts.push({geometry,material:paint.material.clone()});
  model.drawParts=model.parts.length;
  return applyTramLivery(model,id);
}

export function tramCollectorHeight(id) {
  const model=factoryTram(id);
  return model ? model.size.y*tramFactoryScale(model,id).y : (id.startsWith('e-class')?3.6:3.28)+1.39;
}

/** Bevelled box using core Three geometry (the vendored addon set is deliberately small). */
export function tramBevelBox(w,h,d,r=.025) {
  const b=Math.min(r,w*.24,h*.24,d*.24), shape=new THREE.Shape();
  const x=w/2-b,y=h/2-b;
  shape.moveTo(-x,-y);shape.lineTo(x,-y);shape.lineTo(x,y);shape.lineTo(-x,y);shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth:d-2*b,steps:1,bevelEnabled:true,
    bevelThickness:b,bevelSize:b,bevelSegments:1,curveSegments:1});
  g.translate(0,0,-(d-2*b)/2);return g;
}

export function buildTramModel(id = 'w-class-tram', { livery = false } = {}) {
  const modern = id.startsWith('e-class');
  const L = modern ? 16.5 : 13.9, W = 2.65, H = modern ? 3.6 : 3.28;
  // Stationary fringe users remain legacy; the board asset-load hook opts in.
  const specs = document.tramFallback.materials;
  const buckets = specs.map(() => []);
  const box = (m, x, y, z, w, h, d, bevel = 0) => {
    const g = bevel ? tramBevelBox(w,h,d,bevel) : new THREE.BoxGeometry(w,h,d);
    g.translate(x,y,z); buckets[m].push(g);
  };
  const rod = (m, a, b, radius = .035) => {
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b), delta = bv.clone().sub(av);
    const g = new THREE.CylinderGeometry(radius,radius,delta.length(),6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
    g.translate(...av.add(bv).multiplyScalar(.5).toArray()); buckets[m].push(g);
  };
  box(3,0,.46,0,L-.35,.3,W-.22,.07);
  box(0,0,1.05,0,L,.93,W,.13);
  box(1,0,2.05,0,L-.18,1.13,W-.12,.12);
  box(2,0,H-.16,0,L+.06,.34,W+.10,.15);
  box(6,0,1.51,0,L+.025,.055,W+.025);
  box(1,0,2.78,0,L-.04,.19,W+.025,.035);
  for (const side of [-1,1]) {
    const z = side*(W/2+.006);
    for (let i=0;i<12;i++) {
      const x = -L/2+.78+i*(L-1.56)/11;
      box(5,x,2.13,z,.82,1.03,.055);
      box(4,x,2.13,z+side*.033,.65,.86,.032);
      box(8,x-.21,2.23,z+side*.052,.045,.65,.012);
      box(6,x,1.67,z+side*.04,.88,.045,.04);
    }
    // Centre drop doors, recessed glass and step; E has three articulated sections.
    for (const x of modern ? [-4.9,0,4.9] : [0]) {
      box(3,x,1.24,z+side*.06,1.25,1.77,.05);
      for (const dx of [-.3,.3]) {
        box(5,x+dx,1.24,z+side*.085,.55,1.66,.04);
        box(4,x+dx,1.7,z+side*.11,.4,.58,.025);
      }
      box(3,x,.35,z+side*.17,1.35,.13,.4);
    }
  }
  for (const end of [-1,1]) {
    for (const z of [-.67,0,.67]) box(4,end*(L/2-.02),2.12,z,.06,.82,.54);
    box(3,end*(L/2+.025),2.70,0,.07,.26,1.55);
    // Raised ivory route strokes on the black destination roller.
    for (let i=0;i<7;i++) box(7,end*(L/2+.065),2.7,-.57+i*.19,.018,.12,.10);
    box(3,end*(L/2+.07),.54,0,.2,.2,W-.18,.05);
    for (const z of [-.79,.79]) box(7,end*(L/2+.07),.99,z,.09,.18,.18,.03);
  }
  for (const x of [-L*.31,L*.31]) {
    box(3,x,.39,0,2.0,.35,1.75,.06);
    for (const dx of [-.66,.66]) for (const side of [-1,1]) {
      const g = new THREE.CylinderGeometry(.34,.34,.18,12); g.rotateX(Math.PI/2);
      g.translate(x+dx,.34,side*.79); buckets[3].push(g);
      box(6,x+dx,.34,side*.90,.16,.16,.025);
    }
  }
  for (const x of [-4,-2,2,4]) {
    box(2,x,H+.03,0,.72,.24,.63,.06);
    for (const dx of [-.22,0,.22]) box(3,x+dx,H+.16,0,.045,.025,.5);
  }
  const top = H+1.35;
  for (const z of [-.36,.36]) {
    rod(3,[-1,H,z],[0,H+.67,z]); rod(3,[0,H+.67,z],[-1,top,z]);
    rod(3,[-1,H,z],[-2,H+.67,z]); rod(3,[-2,H+.67,z],[-1,top,z]);
  }
  box(3,-1,top,0,.12,.08,1.45);
  if (modern) for (const x of [-L/6,L/6]) {
    for (let k=0;k<4;k++) box(3,x+(k-1.5)*.10,1.62,0,.055,2.35,W+.04);
  }
  const parts = buckets.map((gs,i) => {
    const triangles = gs.map(g => g.index ? g.toNonIndexed() : g);
    const geometry = mergeGeometries(triangles);
    triangles.forEach((g,i)=>{ if(g!==gs[i])g.dispose(); });
    gs.forEach(g=>g.dispose());
    // Preserve the legacy Standard surface exactly when the pilot is off.
    const material = classMaterial('painted-steel', 'tram-w-cream').clone();
    material.setValues(specs[i]);
    return {geometry, material};
  });
  return applyTramLivery({parts,size:new THREE.Vector3(L,H,W),fallback:true,source:'s3-detailed-tram'}, id, { enabled: livery });
}
