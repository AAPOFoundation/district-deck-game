// P20 I2: civic-hall sheet look, routed through town-hall-melbourne.
// The historical notes and legacy recipe below are retained for provenance.
// Current geometry is buildCivicSheet; dimensions derive from TOWN_HALL_ENVELOPE.
// District Deck V3.70 — LANDMARKS lane · THE MELBOURNE TOWN HALL.
//
// Subject: Reed & Barnes' 1867–70 town hall on the Swanston / Collins corner, in TASMANIAN
// freestone, Second Empire over a Renaissance-revival body, with the giant Corinthian portico
// added later on the Collins front.
//
// THE TOWER'S HEIGHT IS DERIVED, NOT QUOTED. The widely repeated "103 m" figure is uncorroborated
// and the reference seat declined to use it; nothing here is anchored to it. The proportion comes
// from the reference plates and from the portico's own bay rhythm: the shaft stands 3.3 times its
// own width to the cornice, the mansard and lantern add another third above that, and the whole
// tower is 2.3 times the body's cornice height — which is what the plate reads as.
//
// WHAT A PLAYER SORTS IT BY. The brief names two and they are the right two:
//   1. The MANSARD-ROOFED CORNER CLOCK TOWER WITH A LANTERN. It stands on the street corner, not
//      on the axis, and its crown is a concave-sided mansard with an open lantern above it — the
//      one silhouette in this programme that says Second Empire from four hundred metres.
//   2. The GIANT CORINTHIAN PORTICO over the main entrance, standing two storeys through the
//      elevation on a stepped podium, with its own entablature and balustrade.
// Then, in order: the RUSTICATED GROUND STOREY with round-arched openings, PAIRED PILASTERS
// through the upper storeys, and the HEAVY MODILLIONED CORNICE with a BALUSTRADE over it.
//
// THE OPENING COUNT IS THE ELEVATION'S, NOT A BUDGET'S. This subject punches 60+ apertures
// because a three-storey civic palace on a 25 m frontage with two street elevations has that
// many, and §3.4's allowance follows the count rather than the count following the allowance.
// The census is printed by `mvp/tests/lm-probe.mjs` and reported in the round's report.

import * as THREE from 'three';
import { restyleColour } from '../style/restyle.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { applyBuildingGlassFinish } from '../materials.js';
import {
  LM_METRICS, part, box, slab, rotBox, cyl, taper, extrude, remapUvY,
  hole, archedHole, volume, openWall, plinthCourse, stringCourse, corniceRun, balustrade,
  mansardRoof, downpipe, boardPlate, lawn, paverRun, shrubMass, hedgeRun, canopyTree,
  bench, lampPost, inst, roundArchProfile,
} from './kit.js';
import {
  roundHeadHoles, roundArchWindow, sashHoles, sashWindow, doorLeaves, casementLeaf,
  clockFace, faceFrame,
} from './openings.js';
// THE SHARED TEXT FACILITY, CONSUMED RATHER THAN RE-INVENTED. The signage seat landed
// `render/signage/` mid-round with two renderers over one alphabet; `reliefLetters` is the route
// for a building at its nine-bucket cap, because the letters are applied metal on a bucket the
// building already owns and cost NO new material. `wordCost` prices the word before it is built
// and `assessLabel` gives it a verdict at a station, which is how this lane knows — rather than
// hopes — that the inscription is a close-orbit reward and not a board-zoom one.
import { reliefLetters, wordCost, assessLabel } from '../signage/index.js';

export const TOWN_HALL_ENVELOPE = Object.freeze({
  footprint: [2, 2],
  storeys: 3,
  bodyW: 25.0,
  bodyD: 17.0,
  frontZ: 10.0,
  backZ: -7.0,
  rustH: 5.4,
  nobileH: 5.0,
  atticH: 4.2,
  bayGap: 2.95,
  towerW: 7.2,
  towerX: 8.9,
  towerZ: 7.2,
  towerH: 23.6,
  porticoX: -4.6,
  porticoW: 10.0,
  porticoProudZ: 3.4,
  columns: 4,
});

export default function buildTownHall(ctx) {
  return buildCivicSheet(ctx);
}

// Retained historical palace recipe for provenance; the I2 sheet is the current look authority.
function buildLegacyTownHall(ctx) {
  const e = ctx.env;
  const g = e.groundY;
  const rustTop = g + e.rustH;
  const nobileTop = rustTop + e.nobileH;
  const wallTop = nobileTop + e.atticH;
  const levels = { g, rustTop, nobileTop, wallTop };

  lot(ctx, levels);
  const bays = bayPlan(ctx);
  body(ctx, bays, levels);
  order(ctx, bays, levels);
  portico(ctx, levels);
  tower(ctx, levels);
}

/** I2: one hall, axial clock tower and pedimented portico, within the existing kit envelope. */
function buildCivicSheet(ctx) {
  const { env: e, p } = ctx;
  const g = e.groundY, W = e.bodyW, D = e.bodyD, F = e.frontZ, B = e.backZ;
  const H = g + e.rustH + e.nobileH, C = (F + B) / 2;
  // P17-W2B round 2: a small wall lift aims above the V71.76 median; the final
  // wall/trim shader below bounds the painted-tile tail without lowering midtones.
  const palette = { wall: restyleColour('#555652', '#e3e4dc', { id: 'civic:town-hall-melbourne.wall' }),
    wallAlt: restyleColour('#393e39', '#d2e5d2', { id: 'civic:town-hall-melbourne.wallAlt' }), roof: '#4a5553',
    trim: restyleColour('#b9a98a', '#ddcaa5', { id: 'civic:town-hall-melbourne.trim' }),
    metal: '#797766', accent: '#70503c', glass: '#111916', ground: restyleColour('#7c796e', '#aeaa9a', { id: 'civic:town-hall-melbourne.ground' }), garden: '#48512a' };
  const roles = { wall: 'wall', wallAlt: 'plinth', roof: 'roof', trim: 'trim', metal: 'metal',
    accent: 'joinery', glass: 'glass', ground: 'ground', garden: 'planting' };
  for (const [key, colour] of Object.entries(palette)) {
    const m = p[key];
    m.userData.i2Role = roles[key];
    m.color.set(colour); m.vertexColors = true;
    // Existing normals, roughness and spatial weather remain. Albedo is authored in one
    // place; a tinted slate photograph must not turn the sheet's grey-green metal cobalt.
    m.map = null;
    if (key === 'garden') m.side = THREE.DoubleSide;
    if (key === 'roof') m.normalScale?.set(.18,.18);
    if (key === 'trim' || key === 'metal') m.normalScale?.set(.10,.10);
    if (key === 'glass') {
      // The shared finish is installed here so its spatial room-cell light can be reduced
      // for a continuous civic window before the outer dispatcher reuses the same material.
      applyBuildingGlassFinish(m, `i2-civic-hall-f${e.facade}`);
      m.userData.buildingGlassFinish.litRoomStrengthUniform.value = .025;
    }
    if (!m.userData.i2Sheet) {
      m.userData.i2Sheet = true;
      const previous = m.onBeforeCompile, cache = m.customProgramCacheKey.bind(m);
      m.onBeforeCompile = (shader, renderer) => {
        previous?.(shader, renderer);
        if (key === 'wall' || key === 'wallAlt') {
          shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
            #include <color_fragment>
            vec3 i2N = abs(cross(dFdx(ddLmW), dFdy(ddLmW)));
            float i2U = i2N.x > i2N.z ? ddLmW.z : ddLmW.x;
            float i2Row = floor(ddLmW.y / 0.62);
            vec2 i2Q = vec2(i2U / 1.18 + mod(i2Row, 2.0) * 0.5, ddLmW.y / 0.62);
            vec2 i2J = min(fract(i2Q), 1.0 - fract(i2Q));
            float i2Mortar = 1.0 - smoothstep(0.014, 0.045, min(i2J.x, i2J.y));
            float i2Block = ddLmHash(vec3(floor(i2Q), 2.0));
            diffuseColor.rgb *= mix(0.73 + 0.5 * i2Block, 1.42, i2Mortar);
          `);
        }
        if (key === 'roof') shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
          #include <color_fragment>
          float i2Rust = smoothstep(0.64, 0.86, ddLmNoise(vec3(ddLmW.x*2.7,ddLmW.y*.37,ddLmW.z*2.7)));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.24,.72,.43), i2Rust*.54);
        `);
        if (key === 'glass') shader.fragmentShader = shader.fragmentShader.replace(
          'diffuseColor.rgb = mix(ddLmSill, ddLmHead, ddLmRamp);',
          'diffuseColor.rgb *= mix(0.50, 1.12, ddLmRamp);');
      };
      m.customProgramCacheKey = () => `${cache()}-i2-civic-${key}`;
    }
    m.needsUpdate = true;
  }
  const features = [], counts = { building: 0, lot: 0 }, offsets = {};
  let site = false, roofRotation = null;
  const put = (geo, key, name = geo.name, tint = 1) => {
    if (roofRotation) {
      geo.translate(-roofRotation.x,0,-roofRotation.z);geo.rotateY(Math.PI/2);geo.translate(roofRotation.x,0,roofRotation.z);
    }
    geo.name = `i2-${name}`;
    const pos = geo.attributes.position, colour = new Float32Array(pos.count * 3);
    const drift = tint * (0.94 + inst(ctx, name, features.length) * 0.12);
    for (let i = 0; i < pos.count; i++) colour.set([drift, drift, drift], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colour, 3));
    geo.computeBoundingBox();
    const vertices = geo.index?.count ?? pos.count;
    features.push({ name: geo.name, role: roles[key], site, vertexStart: offsets[key] ?? 0,
      vertexCount: vertices, min: geo.boundingBox.min.toArray(), max: geo.boundingBox.max.toArray() });
    offsets[key] = (offsets[key] ?? 0) + vertices;
    counts[site ? 'lot' : 'building'] += vertices / 3;
    ctx.push(geo, p[key]);
  };
  const accept = parts => { for (const item of parts) put(item.geometry,
    Object.keys(palette).find(key => p[key] === item.material)); };
  const cube = (w,h,d,x,y,z,key,name,tint=1) => put(box(w,h,d,x,y,z,name),key,name,tint);
  const beam = (a,b,r,key,name) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const geo = new THREE.CylinderGeometry(r,r,delta.length(),4,1,false);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
    geo.translate(...start.add(end).multiplyScalar(.5).toArray()); put(geo,key,name);
  };
  // Closed clipped-corner tile: lower sidewall, actual sloping bevel, light paving cap.
  const tile = (w,d,y,h,bevel,key,name) => {
    const ring = (ww,dd,yy) => [[-ww/2+.65,yy,-dd/2],[ww/2-.65,yy,-dd/2],
      [ww/2,yy,-dd/2+.65],[ww/2,yy,dd/2-.65],[ww/2-.65,yy,dd/2],
      [-ww/2+.65,yy,dd/2],[-ww/2,yy,dd/2-.65],[-ww/2,yy,-dd/2+.65]];
    const low=ring(w,d,y),high=ring(w-bevel*2,d-bevel*2,y+h), v=[];
    const tri=(a,b,c)=>v.push(...a,...b,...c);
    for(let i=0;i<8;i++){const j=(i+1)%8;tri(low[i],high[i],low[j]);tri(low[j],high[i],high[j]);}
    for(let i=1;i<7;i++){tri(high[0],high[i+1],high[i]);tri(low[0],low[i],low[i+1]);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
    geo.computeVertexNormals();put(geo,key,name);
  };
  site=true;
  tile(e.lotW,e.lotD,-.58,.70,0,'wallAlt','lot-sidewall');
  tile(e.lotW,e.lotD,.12,.18,.18,'wallAlt','lot-bevel');
  tile(e.lotW-.36,e.lotD-.36,.30,.04,0,'ground','lot-cap');
  accept(paverRun(ctx,{x0:-e.lotW/2+.7,x1:e.lotW/2-.7,z0:F+3.65,z1:e.lotD/2-.55,unit:1.6,joint:.07,name:'front-path'}));
  const gardenX = -(W/2 + e.lotW/2) / 2;
  accept(paverRun(ctx,{x0:gardenX-.48,x1:gardenX+.48,z0:B,z1:F+3.65,unit:1.6,joint:.07,name:'gate-path'}));
  for(const sign of [-1,1]) {
    const x=sign*(W/2+.85);
    cube(1.5,.10,D-.8,x,g+.01,C,'garden','side-lawn');
    cube(W*.27,.10,2.4,sign*W*.35,g+.01,F+1.65,'garden','front-lawn');
    for(let i=0;i<12;i++) {
      const tx=sign*(W*.27+inst(ctx,'tufts',i)*W*.19),tz=F+.45+inst(ctx,'tuft-z',i)*2.7;
      for(let k=0;k<3;k++) {
        const dx=Math.sin(k*2.1)*.08,dz=Math.cos(k*2.1)*.08,geo=new THREE.BufferGeometry();
        geo.setAttribute('position',new THREE.Float32BufferAttribute([tx-dx,g,tz-dz,tx+dx,g,tz+dz,tx+dx*2,g+.30+inst(ctx,'blade',i)*.28,tz+dz*2],3));
        geo.computeVertexNormals();put(geo,'garden','grass-blade');
      }
    }
    for(let i=0;i<5;i++) accept(shrubMass(ctx,{x:sign*(W*.28+i*.65),z:F+1.4+(i%2)*.5,r:.62,lobes:2,salt:83+i,name:`front-shrub-${sign}-${i}`}));
  }
  // A branching crown of crossed leaf diamonds: readable gaps and leaf edges, no solid spheres.
  const tx=-W/2-.7,tz=C-.6,th=10.0;
  beam([tx,g,tz],[tx+.18,g+th*.70,tz],.15,'accent','tree-trunk');
  for(let limb=0;limb<6;limb++) {
    const a=limb*2.4,end=[tx+Math.sin(a)*.70,g+th*(.56+limb*.065),tz+Math.cos(a)*.70];
    beam([tx,g+th*.35,tz],end,.06,'accent','tree-branch');
    for(let leaf=0;leaf<18;leaf++) {
      const a2=leaf*2.399,rad=.15+inst(ctx,`leaf-${limb}`,leaf)*.65;
      const x=end[0]+Math.sin(a2)*rad,y=end[1]+(inst(ctx,'leaf-y',leaf+limb*20)-.35)*1.6,z=end[2]+Math.cos(a2)*rad;
      const vertices=[x-.35,y,z,x,y+.43,z+.18,x+.35,y,z,x,y-.22,z-.18,
        x,y,z-.35,x+.18,y+.43,z,x,y,z+.35,x-.18,y-.22,z];
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex([0,1,2,0,2,3,4,5,6,4,6,7]);geo.computeVertexNormals();
      put(geo,'garden','tree-leaf',.62+inst(ctx,'leaf-colour',leaf+limb*20)*.7);
    }
  }
  const fencePosts=new Set();
  const fence = (x0,z0,x1,z1,gate=false) => {
    const length=Math.hypot(x1-x0,z1-z0),n=Math.max(1,Math.round(length/.60)),dx=(x1-x0)/length,dz=(z1-z0)/length;
    for(const y of [g+.42,g+1.30]) beam([x0,y,z0],[x1,y,z1],.065,'trim',gate?'gate-rail':'fence-rail');
    for(let i=0;i<=n;i++) {
      const x=x0+dx*length*i/n,z=z0+dz*length*i/n;
      put(extrude([[-.05,0],[.05,0],[.05,1.40],[0,1.56],[-.05,1.40]],
        {depth:.10,x,y:g,z,name:gate?'gate-picket':'fence-picket'}),'trim');
    }
    for(const t of [0,1]) {
      const x=x0+(x1-x0)*t,z=z0+(z1-z0)*t;
      const postKey=`${x.toFixed(4)}|${z.toFixed(4)}`;
      if(fencePosts.has(postKey)) continue;
      fencePosts.add(postKey);
      cube(.36,1.62,.36,x,g+.81,z,'trim','fence-post');cube(.48,.12,.48,x,g+1.68,z,'trim','post-cap');
    }
    if(gate){beam([x0,g+.45,z0],[x1,g+1.30,z1],.055,'metal','gate-brace');cube(.20,.10,.17,x1-.14,g+1,z1+.10,'metal','gate-latch');}
  };
  for(let i=0;i<8;i++) {
    const x=(i%2===0?-1:1)*(W*.29+inst(ctx,'flower-x',i)*2.1),z=F+1.4+inst(ctx,'flower-z',i)*.9;
    const flower=new THREE.TetrahedronGeometry(.105);flower.translate(x,g+.64,z);put(flower,'trim','flower-head');
    const stem=new THREE.BufferGeometry();stem.setAttribute('position',new THREE.Float32BufferAttribute([x-.02,g,z,x+.02,g,z,x,g+.64,z],3));
    stem.computeVertexNormals();put(stem,'garden','flower-stem');
  }
  const fenceZ=F+3.2;
  fence(-e.lotW/2+.6,B-.8,-e.lotW/2+.6,fenceZ);
  fence(-e.lotW/2+.6,fenceZ,gardenX-.55,fenceZ);
  fence(gardenX-.55,fenceZ,gardenX+.55,fenceZ,true);
  fence(gardenX+.55,fenceZ,-e.porticoW/2-.55,fenceZ);
  fence(e.porticoW/2+.55,fenceZ,e.lotW/2-.6,fenceZ);
  site=false;
  cube(W+.3,1.1,D+.3,0,g+.55,C,'wallAlt','base-course');
  cube(W+.48,.18,D+.48,0,g+1.13,C,'trim','base-course-cap');
  const windowY=g+2.0,windowW=2.5,windowH=H-windowY-1.25, spring=windowH-windowW/2;
  const faces=[['front',F,'x',1,0,W,[-W*.37,-W*.23,0,W*.23,W*.37]],
    ['back',B,'x',-1,0,W,[-W*.32,0,W*.32]],
    ['left',-W/2,'z',-1,C,D,[B+D*.2,B+D*.5,B+D*.8]],
    ['right',W/2,'z',1,C,D,[B+D*.2,B+D*.5,B+D*.8]]];
  for(const [facing,plane,axis,face,centre,run,us] of faces) {
    const punches=[];
    for(const u of us) {
      const door=facing==='front'&&u===0, y=door?g+1.35:windowY, h=door?windowH+.65:windowH;
      const s=h-windowW/2, tag=`${facing}-${u}`;
      // The exact same polygon cuts the wall and describes the pane/surround. No stepped
      // aperture mismatch or solid wall behind a painted window.
      punches.push(roundArchProfile({halfW:windowW/2,spring:s,segs:5}).map(([x,yy])=>[x+u,yy+y]));
      const frame=faceFrame(facing,plane), loc=frame.pos(u,y,-.36);
      put(remapUvY(extrude(roundArchProfile({halfW:windowW/2+.015,spring:s,base:-.015,segs:5}),
        {depth:.08,axis:frame.axis,x:loc[0],y:loc[1],z:loc[2],name:`${tag}-pane`})), 'glass');
      const inner=roundArchProfile({halfW:windowW/2,spring:s,segs:5});
      const outer=roundArchProfile({halfW:windowW/2+.23,spring:s,base:-.18,segs:5});
      const pos=frame.pos(u,y,.06);
      put(extrude(outer,{depth:.24,axis:frame.axis,x:pos[0],y:pos[1],z:pos[2],holes:[inner],name:`${tag}-arch-surround`}), 'trim');
      for(const offset of [-windowW/2+.08,0,windowW/2-.08]) {
        if(door && offset===0) continue;
        const at=frame.pos(u+offset,y+s/2,-.22);
        cube(...frame.dims(.14,s,.17),...at,'accent',`${tag}-mullion`);
      }
      for(const yy of [y+.10,y+s*.48,y+s]) {
        if(door && yy<y+4.45) continue;
        const at=frame.pos(u,yy,-.22);cube(...frame.dims(windowW,.15,.17),...at,'accent',`${tag}-transom`);
      }
      const at=frame.pos(u,y-.15,.12);cube(...frame.dims(windowW+.5,.24,.48),...at,'trim',`${tag}-sill`);
      ctx.countAperture(tag);
    }
    const frontProfile=[[centre-run/2,g+1.2],[centre+run/2,g+1.2],[centre+run/2,H],[centre-run/2,H]];
    // extrude's X-axis transform mirrors local u; pre-mirror only flank profiles.
    const mirror=pts=>axis==='z'?pts.map(([u,y])=>[-u,y]).reverse():pts;
    const at=axis==='x'?{z:plane-face*.22}:{x:plane-face*.22};
    put(extrude(mirror(frontProfile),{depth:.44,axis:axis==='x'?'z':'x',...at,holes:punches.map(mirror),name:`wall-${facing}`}), 'wall');
  }
  cube(W-.9,.15,D-.9,0,g+1.23,C,'wallAlt','interior-floor');
  for(const [yy,hh,proud,key] of [[H-.60,.20,.2,'trim'],[H-.18,.32,.4,'trim'],[H+.13,.20,.55,'metal']])
    cube(W+proud,hh,D+proud,0,yy,C,key,'cornice');
  for(let x=-W/2+.4;x<W/2;x+=.72) cube(.25,.27,.32,x,H-.40,F+.19,'trim','dentil');
  const roof=(x,z,w,d,y,rise,ridge,name,alongZ=false)=>{
    if(alongZ) roofRotation={x,z};
    const corners=[[x-w/2,y,z-d/2],[x+w/2,y,z-d/2],[x+w/2,y,z+d/2],[x-w/2,y,z+d/2]];
    const left=[x-ridge/2,y+rise,z],right=[x+ridge/2,y+rise,z];
    const polys=[[corners[0],left,right,corners[1]],[corners[1],right,corners[2]],
      [corners[2],right,left,corners[3]],[corners[3],left,corners[0]]];
    for(const [side,poly] of polys.entries()) {
      const v=[],tri=(a,b,c)=>v.push(...a,...b,...c),under=poly.map(a=>[a[0],a[1]-.12,a[2]]);
      for(let i=1;i<poly.length-1;i++){tri(poly[0],poly[i],poly[i+1]);tri(under[0],under[i+1],under[i]);}
      for(let i=0;i<poly.length;i++){const j=(i+1)%poly.length;tri(poly[i],under[i],poly[j]);tri(poly[j],under[i],under[j]);}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.computeVertexNormals();put(geo,'roof',`${name}-sheet-${side}`);
      // Raised seams interpolate ON the authored slope, including the hip triangles.
      const a=poly[0],b=poly[poly.length-1],n=Math.max(2,Math.round(new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b))/1.35));
      for(let i=1;i<n;i++) {
        const t=i/n,lo=a.map((q,k)=>q+(b[k]-q)*t);
        // Parallel standing seams stop at the hip line; they do not fan into the apex.
        const slopeT=side%2===0?Math.min(1,(w/2-Math.abs(lo[0]-x))/((w-ridge)/2))
          :1-Math.abs(lo[2]-z)/(d/2);
        const hi=side%2===0?[lo[0],y+rise*slopeT,lo[2]+(z-lo[2])*slopeT]
          :[lo[0]+(x+(side===1?ridge/2:-ridge/2)-lo[0])*slopeT,y+rise*slopeT,lo[2]];
        beam([lo[0],lo[1]+.05,lo[2]],[hi[0],hi[1]+.05,hi[2]],.043,'metal',`${name}-seam`);
      }
    }
    for(let i=0;i<4;i++) beam(corners[i],i===0||i===3?left:right,.07,'metal',`${name}-hip-cap`);
    if(ridge>0) beam(left,right,.08,'metal',`${name}-ridge-cap`);
    roofRotation=null;
  };
  for(const wing of [-1,0,1]) roof(wing*W/3,C,D+1.0,W/3+.40,H+.24,3.1,D*.48,`hall-roof-${wing}`,true);
  // Portico datums use the kit's own width and projection. Stairs terminate at its podium.
  const PW=e.porticoW,PZ=F+e.porticoProudZ-.35,PY=g+1.35,ent=H-1.25;
  cube(PW+.8,1.35,e.porticoProudZ,0,g+.675,F+e.porticoProudZ/2,'wallAlt','portico-podium');
  for(let i=0;i<6;i++) cube(PW+.7,(i+1)*.225,.48,0,g+(i+1)*.1125,PZ+1.75-i*.37,'ground','entry-step');
  for(let i=0;i<e.columns;i++) {
    const x=-PW*.43+i*(PW*.86/(e.columns-1)),base=PY+.20,top=ent-.5;
    cube(1.25,.30,1.25,x,PY+.05,PZ,'trim','column-plinth');
    put(cyl(.55,.18,x,base+.08,PZ,'y','column-torus',12),'trim');
    put(taper(.43,.34,top-base-.30,x,base+.17,PZ,'column-shaft',12),'trim');
    put(taper(.35,.61,.40,x,top-.2,PZ,'column-capital',8),'trim');
    cube(1.27,.20,1.27,x,top+.28,PZ,'trim','column-abacus');
    for(let k=0;k<4;k++) put(taper(.12,.05,.35,x+Math.sin(k*Math.PI/2)*.40,top-.08,PZ+Math.cos(k*Math.PI/2)*.40,'capital-leaf',4),'trim');
  }
  cube(PW+1.2,.75,e.porticoProudZ+.65,0,ent+.15,F+e.porticoProudZ/2,'trim','portico-entablature');
  const pedY=ent+.58,pedRise=2.7,pedW=PW+1.5;
  put(extrude([[-pedW/2,pedY],[pedW/2,pedY],[0,pedY+pedRise]],{depth:.35,z:PZ+.65,name:'portico-pediment'}),'wall');
  for(const s of [-1,1]) beam([s*pedW/2,pedY,PZ+.88],[0,pedY+pedRise,PZ+.88],.14,'trim','pediment-rake');
  cube(pedW+.2,.18,.30,0,pedY,PZ+.88,'trim','pediment-base');
  // Gabled portico roof closes the pediment to the wall and meets the main hip.
  const slope=Math.atan2(pedRise,pedW/2),len=Math.hypot(pedRise,pedW/2);
  for(const s of [-1,1]) {
    put(rotBox(len,.14,e.porticoProudZ+1.0,s*pedW/4,pedY+pedRise/2,F+e.porticoProudZ/2,{z:-s*slope},'portico-roof'),'roof');
    for(let j=0;j<5;j++) beam([s*pedW/2,pedY+.10,F-.5+j*(e.porticoProudZ+.9)/4],[0,pedY+pedRise+.10,F-.5+j*(e.porticoProudZ+.9)/4],.045,'metal','portico-seam');
  }
  const TW=e.towerW,TZ=F-TW/2,TY=Math.min(g+e.towerH,H+TW*1.12);
  cube(TW,TY-H,TW,0,(TY+H)/2,TZ,'wall','clock-tower');
  for(const y of [H+2.0,TY-.5,TY+.10]) cube(TW+.6,.28,TW+.6,0,y,TZ,'trim','tower-cornice');
  for(const s of [-1,1]) for(const t of [-1,1]) cube(.44,TY-H,.44,s*(TW/2-.12),(TY+H)/2,TZ+t*(TW/2-.12),'trim','tower-quoin');
  // One merged dial mesh: shallow convex glass, radial hour marks and pivoted hands.
  {
    const r = TW*.27, cy = TY-3.1, cz = F+.08, pieces = [];
    const domeZ = (x,y) => cz + .085*Math.sqrt(Math.max(0,1-(x*x+y*y)/(r*r)));
    const add = (geo, colour) => {
      const flat = geo.index ? geo.toNonIndexed() : geo;
      if (flat !== geo) geo.dispose();
      const c = new THREE.Color(colour), a = new Float32Array(flat.attributes.position.count*3);
      // Compensate only the shared trim multiplier; preserve its physical lighting.
      for(let i=0;i<a.length;i+=3) a.set([c.r/p.trim.color.r,c.g/p.trim.color.g,c.b/p.trim.color.b],i);
      flat.setAttribute('color',new THREE.BufferAttribute(a,3));pieces.push(flat);
    };
    const dial = new THREE.CircleGeometry(r,48), dp = dial.attributes.position;
    for(let i=0;i<dp.count;i++) dp.setZ(i,domeZ(dp.getX(i),dp.getY(i))-cz);
    dial.computeVertexNormals();dial.translate(0,cy,cz);add(dial,'#d9cfaf');
    const quad = (x0,y0,x1,y1,width,colour) => {
      const dx=x1-x0,dy=y1-y0,l=Math.hypot(dx,dy),ux=-dy/l*width/2,uy=dx/l*width/2;
      const points=[[x0+ux,y0+uy],[x0-ux,y0-uy],[x1-ux,y1-uy],[x1+ux,y1+uy]];
      const xyz=[];for(const i of [0,1,2,0,2,3]){const [x,y]=points[i];xyz.push(x,cy+y,domeZ(x,y)+.008);}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
      geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(12),2));geo.computeVertexNormals();add(geo,colour);
    };
    for(let i=0;i<12;i++) {
      const a=i*Math.PI/6,major=i%3===0;
      quad(Math.sin(a)*r*(major?.70:.77),Math.cos(a)*r*(major?.70:.77),Math.sin(a)*r*.88,Math.cos(a)*r*.88,major?.10:.065,'#252925');
    }
    // 10:10, each hand begins at the centre rather than crossing the entire dial.
    for(const [a,len,w] of [[-Math.PI/3,r*.52,.13],[Math.PI/3,r*.72,.085]])
      quad(0,0,Math.sin(a)*len,Math.cos(a)*len,w,'#202721');
    // Glazed dome crescent: a small directional highlight, not a third hand.
    for(let i=0;i<8;i++) {
      const a=-1.1+i*.065,b=a+.065;
      quad(Math.sin(a)*r*.92,Math.cos(a)*r*.92,Math.sin(b)*r*.92,Math.cos(b)*r*.92,.045,'#f4f0db');
    }
    const mesh=mergeGeometries(pieces,false), colours=mesh.attributes.color;
    put(mesh,'trim','clock-glazed-dial');mesh.setAttribute('color',colours);
    // Physical glazing only on the convex dial; the shared stone trim stays matte.
    if (!p.trim.userData.kitmat2Dial) {
      p.trim.userData.kitmat2Dial = true;
      const previous = p.trim.onBeforeCompile, previousKey = p.trim.customProgramCacheKey.bind(p.trim);
      p.trim.onBeforeCompile = (shader, renderer) => {
        previous?.(shader, renderer);
        shader.uniforms.kitmat2Dial = { value: new THREE.Vector4(cy, cz, r, 0.12) };
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vKitmat2Dial;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKitmat2Dial = position;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vKitmat2Dial;\nuniform vec4 kitmat2Dial;')
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            float kitmat2Glaze = (1.0-step(kitmat2Dial.z, length(vec2(vKitmat2Dial.x,vKitmat2Dial.y-kitmat2Dial.x))))
              * (1.0-step(kitmat2Dial.w,abs(vKitmat2Dial.z-kitmat2Dial.y)));
            roughnessFactor = mix(roughnessFactor,0.08,kitmat2Glaze);
          `);
      };
      p.trim.customProgramCacheKey = () => `${previousKey()}|kitmat2-glazed-clock`;
      p.trim.needsUpdate = true;
    }
    pieces.forEach(geo=>geo.dispose());
  }
  roof(0,TZ,TW+.65,TW+.65,TY+.27,3.0,.55,'tower-roof');
  put(taper(.22,.06,1.35,0,TY+3.26,TZ,'tower-finial',6),'metal');
  for(const x of [-W/2+.6,W/2-.6]) {
    cube(.85,1.5,.85,x,H+1.0,B+.7,'wall','chimney');cube(1.12,.22,1.12,x,H+1.86,B+.7,'trim','chimney-cap');
    beam([x,H-.2,F+.45],[x,g+.25,F+.45],.08,'metal','downpipe');
  }
  // Preserve the existing gameplay IDs. Moving leaves are separate from the merged shell,
  // so opening the door does not leave an identical closed leaf behind it. The deep fixed
  // pane is an unlit interior backer. Pick coordinates are relative to the hinge, as board.js
  // adds the pivot when constructing its proxy. Merge within each moving assembly/material.
  counts.openingTriangles=0;
  const moving=(id,label,pivot,pick,items,kind)=>{
    const buckets=new Map();
    for(const [geo,key] of items){
      const colour=new Float32Array(geo.attributes.position.count*3);colour.fill(1);
      geo.setAttribute('color',new THREE.BufferAttribute(colour,3));
      const tris=(geo.index?.count??geo.attributes.position.count)/3;
      counts.building+=tris;counts.openingTriangles+=tris;
      if(!buckets.has(key)) buckets.set(key,[]);buckets.get(key).push(geo);
    }
    const parts=[];
    for(const [key,geos] of buckets){
      const geometry=mergeGeometries(geos,false);geometry.name=`i2-${id}-${roles[key]}`;
      geometry.computeBoundingBox();geometry.computeBoundingSphere();
      for(const geo of geos) geo.dispose();
      features.push({name:geometry.name,role:roles[key],site:false,dynamic:true,
        vertexStart:0,vertexCount:geometry.index?.count??geometry.attributes.position.count,
        min:geometry.boundingBox.min.toArray(),max:geometry.boundingBox.max.toArray()});
      parts.push({geometry,material:p[key]});
    }
    ctx.addOpening({id,label,kind,pivot,axis:'y',openAngle:-Math.PI*.36,parts,pick});
  };
  const DY=g+1.35,doorItems=[];
  for(const sign of [-1,1]){
    const x=sign*.60;
    doorItems.push([box(1.16,4.45,.12,x,DY+2.225,F-.23,'door-leaf'),'accent']);
    for(const t of [.25,.70]) doorItems.push([box(.87,1.28,.06,x,DY+4.45*t,F-.145,'door-panel'),'accent']);
    doorItems.push([box(.065,.32,.08,sign*.15,DY+2.1,F-.08,'door-handle'),'metal']);
  }
  moving('town-hall-door','Town Hall entrance',{x:-1.2,y:DY,z:F-.23},
    {cx:1.2,cy:2.225,cz:.12,w:2.4,h:4.45,d:.5},doorItems,'door');
  const SX=W*.37+.62,SY=windowY+1.36,SW=1.02,SH=2.35,sash=[];
  for(const sign of [-1,1]){
    sash.push([box(.10,SH,.10,SX+sign*(SW/2-.05),SY,F-.23,'casement-stile'),'accent']);
    sash.push([box(SW,.10,.10,SX,SY+sign*(SH/2-.05),F-.23,'casement-rail'),'accent']);
  }
  sash.push([box(SW-.18,SH-.18,.05,SX,SY,F-.265,'casement-glass'),'glass']);
  moving('town-hall-casement','Council chamber window',{x:SX-SW/2,y:SY-SH/2,z:F-.23},
    {cx:SW/2,cy:SH/2,cz:0,w:SW,h:SH,d:.4},sash,'casement');
  // Ruling 80 / round-2 owners: wall clusters reach V97-98, trim stays below V90.
  // Lower only the wall cap to leave headroom in the calibrated ambient pass.
  // A small wall albedo lift clears the exact V71.76 median; the cap retains hue.
  for (const role of ['wall', 'trim']) {
    const peak = restyleColour('#ffffff', role === 'wall' ? '#ececec' : '#f2f2f2', { id: `civic:town-hall-melbourne.${role}-peak` });
    if (peak === '#ffffff') continue;
    const lift = role === 'wall' ? restyleColour(new THREE.Color(1, 1, 1),
      new THREE.Color(1.015, 1.015, 1.015), { id: 'civic:town-hall-melbourne.wall-lift' }).r : 1;
    const material = p[role], previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey.bind(material);
    const limit = new THREE.Color(peak).r;
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      shader.uniforms.p17TownHallPeak = { value: limit };
      shader.uniforms.p17TownHallLift = { value: lift };
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
        '#include <common>\nuniform float p17TownHallPeak;\nuniform float p17TownHallLift;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', `
diffuseColor.rgb *= p17TownHallLift;
float p17TownHallMax = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
diffuseColor.rgb *= min(1.0, p17TownHallPeak / max(p17TownHallMax, 0.000001));
#include <lights_physical_fragment>`);
    };
    material.customProgramCacheKey = () => `${previousKey()}|p17-town-hall-peak`;
  }
  ctx.i2={counts,features,palette,roles,apertureDepth:.32,wallThickness:.44,
    envelope:{bodyW:W,bodyD:D,wallTop:H,towerTop:TY,lotW:e.lotW,lotD:e.lotD},
    access:{doorX:0,stairX:0,gateX:gardenX,gateZ:fenceZ,pathX:gardenX},
    signals:['board-plinth','deep-openings','plinth-course','seamed-roof','grunge','planting','pavers','pickets','clock-tower','portico']};
}

/* ─────────────────────────────────── the bay plan ─────────────────────────────────── */

function bayPlan(ctx) {
  const e = ctx.env;
  const halfW = e.bodyW / 2;
  const halfD = e.bodyD / 2;
  const zc = (e.frontZ + e.backZ) / 2;
  const towerL = e.towerX - e.towerW / 2;
  const towerF = e.towerZ + e.towerW / 2;
  const towerB = e.towerZ - e.towerW / 2;

  // Front: a bay centre is placed ON the portico axis, so the doorway, the portico's own centre
  // and the pediment above all agree instead of being three separate numbers.
  const front = [];
  for (let k = -4; k <= 4; k += 1) {
    const x = e.porticoX + k * e.bayGap;
    if (x < -halfW + 1.3 || x > towerL - 0.8) continue;
    front.push(Number(x.toFixed(3)));
  }
  const right = [];
  for (let z = zc - halfD + 1.6; z < towerB - 0.8; z += 3.25) right.push(Number(z.toFixed(3)));
  const left = [];
  for (let z = zc - halfD + 1.6; z < zc + halfD - 1.3; z += 3.45) left.push(Number(z.toFixed(3)));
  const back = [];
  for (let x = -halfW + 2.1; x < halfW - 1.6; x += 4.2) back.push(Number(x.toFixed(3)));
  void towerF;
  return { front, right, left, back };
}

/* ────────────────────────────────────── the lot ───────────────────────────────────── */

/**
 * A town hall stands ON the street, so its lot is a paved civic forecourt rather than a garden —
 * but §2.6 still binds, and the planting it gets is the planting the real corner has: street
 * trees in the pavement, a bed against the rear wall, and clipped hedging along the side return.
 */
function lot(ctx, { g }) {
  const e = ctx.env;
  const halfW = e.lotW / 2;
  const halfD = e.lotD / 2;

  ctx.add(boardPlate(ctx, { width: e.lotW, depth: e.lotD }));

  // The footpath: individual flags, front and both returns, because that is what the building
  // meets the ground on.
  ctx.add(paverRun(ctx, {
    x0: -halfW + 0.6, x1: halfW - 0.6, z0: e.frontZ + 0.2, z1: halfD - 0.6,
    unit: 1.85, joint: 0.10, flat: true, name: 'path-front',
  }));
  ctx.add(paverRun(ctx, {
    x0: e.bodyW / 2 + 0.2, x1: halfW - 0.6, z0: e.backZ - 0.4, z1: e.frontZ + 0.2,
    unit: 1.85, joint: 0.10, flat: true, name: 'path-right',
  }));
  ctx.add(paverRun(ctx, {
    x0: -halfW + 0.6, x1: -e.bodyW / 2 - 0.2, z0: e.backZ - 0.4, z1: e.frontZ + 0.2,
    unit: 1.85, joint: 0.10, flat: true, name: 'path-left',
  }));
  // The service yard behind.
  ctx.add(paverRun(ctx, {
    x0: -halfW + 0.8, x1: halfW - 0.8, z0: -halfD + 0.8, z1: e.backZ - 0.4,
    unit: 2.7, joint: 0.10, flat: true, name: 'yard',
  }));
  ctx.add(lawn(ctx, {
    x: 0, z: (-halfD + 1.2 + e.backZ - 1.2) / 2, w: e.bodyW * 0.72,
    d: Math.max(1.6, (e.backZ - 1.2) - (-halfD + 1.2)), tufts: 10, salt: 24,
  }));

  // Street trees in the pavement, with a real grate-sized surround rather than a trunk in stone.
  // Crowns are clamped inside the pad: a leaf clump reaches about 1.1 x its own radius past its
  // placement, and the first draft put a street tree's crown 0.74 m over the plate edge — the
  // probe's envelope check found it, not the eye.
  // Coordinates derive from the measured lot for the §3.6 reason recorded in `old-arts.js`.
  const fx = (t) => (t / 15.5) * halfW;
  const fz = (t) => (t / 15.5) * halfD;
  for (const [tx, tz, h, r] of [[fx(-11.6), halfD - fz(2.2), 6.6, Math.min(2.2, halfW * 0.15)],
    [fx(1.4), halfD - fz(2.2), 6.0, Math.min(2.0, halfW * 0.13)],
    [halfW - 2.9, fz(-3.4), 6.2, Math.min(2.0, halfW * 0.13)]]) {
    ctx.add(canopyTree(ctx, { x: tx, z: tz, h, r, salt: 63 }));
    ctx.push(slab(1.5, 0.06, 1.5, tx, g + 0.03, tz, 'tree-grate'), ctx.p.metal);
  }
  ctx.add(hedgeRun(ctx, {
    x0: -e.bodyW / 2 - 1.2, x1: -e.bodyW / 2 - 1.2, z0: e.backZ, z1: e.frontZ - 3.0, h: 0.85,
  }));
  for (const [sx, sz, r] of [[fx(-9.0), fz(-9.6), 0.95], [fx(7.6), fz(-9.8), 0.85],
    [-halfW + 1.8, fz(6.0), 0.8]]) {
    ctx.add(shrubMass(ctx, { x: sx, z: sz, r, lobes: 3, salt: 44 }));
  }
  ctx.add(bench(ctx, { x: fx(-11.0), z: halfD - fz(3.6), w: 2.1 }));
  ctx.add(lampPost(ctx, { x: fx(3.4), z: halfD - 1.5, h: 4.6 }));
  ctx.add(lampPost(ctx, { x: halfW - 1.5, z: -2.4, h: 4.6 }));
  // Bollards along the kerb, because a civic frontage has them and they read at board zoom.
  for (let i = 0; i < 5; i += 1) {
    const bx = -halfW + 2.4 + i * ((e.lotW - 4.8) / 4);
    ctx.push(taper(0.16, 0.13, 0.92, bx, g, halfD - 1.0, 'bollard', 6), ctx.p.metal);
    ctx.push(taper(0.10, 0.02, 0.16, bx, g + 0.92, halfD - 1.0, 'bollard-cap', 5), ctx.p.metal);
  }
}

/* ─────────────────────────────────── the body mass ────────────────────────────────── */

function body(ctx, bays, { g, rustTop, nobileTop, wallTop }) {
  const e = ctx.env;
  const p = ctx.p;
  const M = LM_METRICS;
  const zc = (e.frontZ + e.backZ) / 2;
  const halfW = e.bodyW / 2;

  const front = [];
  const back = [];
  const left = [];
  const right = [];

  // ── ground storey: round-arched openings in the rusticated wall ──────────────────────
  const archW = 1.85;
  const archH = e.rustH - 1.55;
  const archY = g + 0.95;
  const doorW = 3.1;
  const doorH = e.rustH - 0.95;
  for (const x of bays.front) {
    if (Math.abs(x - e.porticoX) < 0.01) {
      front.push(...archedHole(x, g, doorW, doorH, {
        headFrac: 0.34, steps: 3, tag: 'th-door', pointed: false,
      }));
      ctx.countAperture('entrance');
    } else {
      front.push(...roundHeadHoles(x, archY, archW, archH, `gf@${x}`));
      ctx.countAperture(`front-ground@${x}`);
    }
  }
  for (const z of bays.right) {
    right.push(...roundHeadHoles(z, archY, archW, archH, `gr@${z}`));
    ctx.countAperture(`right-ground@${z}`);
  }
  for (const z of bays.left) {
    left.push(...roundHeadHoles(z, archY, archW, archH, `gl@${z}`));
    ctx.countAperture(`left-ground@${z}`);
  }
  for (const x of bays.back) {
    back.push(...sashHoles(x, archY, 1.5, archH - 0.4, `gb@${x}`));
    ctx.countAperture(`rear-ground@${x}`);
  }

  // ── upper storeys: square-headed sashes, pedimented on the piano nobile ──────────────
  const nobW = 1.65;
  const nobH = e.nobileH - 2.05;
  const nobY = rustTop + 0.95;
  const attW = 1.50;
  const attH = e.atticH - 1.95;
  const attY = nobileTop + 0.80;
  const upper = [[nobY, nobW, nobH, 'nob'], [attY, attW, attH, 'att']];
  for (const [y, w, h, tag] of upper) {
    for (const x of bays.front) { front.push(...sashHoles(x, y, w, h, `${tag}f@${x}`)); ctx.countAperture(`front-${tag}@${x}`); }
    for (const z of bays.right) { right.push(...sashHoles(z, y, w, h, `${tag}r@${z}`)); ctx.countAperture(`right-${tag}@${z}`); }
    for (const z of bays.left) { left.push(...sashHoles(z, y, w, h, `${tag}l@${z}`)); ctx.countAperture(`left-${tag}@${z}`); }
    for (const x of bays.back) { back.push(...sashHoles(x, y, w * 0.9, h, `${tag}b@${x}`)); ctx.countAperture(`rear-${tag}@${x}`); }
  }

  // ── the mass ─────────────────────────────────────────────────────────────────────────
  ctx.add(plinthCourse(ctx, {
    x: 0, z: zc, w: e.bodyW, d: e.bodyD, yBase: g - 0.02, h: 0.85, proud: 0.20,
    material: p.wallAlt,
  }));
  ctx.add(volume(ctx, {
    x: 0, zFront: e.frontZ, zBack: e.backZ, width: e.bodyW, y0: g, y1: wallTop,
    front, back, left, right, name: 'body',
  }));

  // ── rustication ──────────────────────────────────────────────────────────────────────
  // The ground storey is banded ashlar with a recessed joint at every course, and the bands are
  // built as REAL COURSES over the punched wall rather than as a texture: at board zoom the
  // storey reads as one dark band under a pale field, and at a close orbit each joint has its
  // own shadow. Front and right return only, which are the two street elevations.
  const courses = 5;
  const courseH = e.rustH / courses;
  for (let i = 0; i < courses; i += 1) {
    const y0 = g + i * courseH;
    const y1 = y0 + courseH - 0.09;
    const set = i % 2 === 0 ? 0 : 0.055;
    ctx.add(openWall(p.wallAlt, {
      axis: 'x', face: 1, plane: e.frontZ + 0.075, centre: 0, run: e.bodyW, y0, y1,
      depth: 0.13, set, openings: front, name: 'rust-front',
    }));
    ctx.add(openWall(p.wallAlt, {
      axis: 'z', face: 1, plane: halfW + 0.075, centre: zc, run: e.bodyD, y0, y1,
      depth: 0.13, set, openings: right, name: 'rust-right',
    }));
  }

  // ── window dressing ──────────────────────────────────────────────────────────────────
  for (const x of bays.front) {
    if (Math.abs(x - e.porticoX) < 0.01) continue;
    ctx.add(roundArchWindow(ctx, {
      facing: 'front', plane: e.frontZ, u: x, y: archY, w: archW, h: archH, name: `gf${x}`,
    }));
  }
  for (const z of bays.right) {
    ctx.add(roundArchWindow(ctx, {
      facing: 'right', plane: halfW, u: z, y: archY, w: archW, h: archH, name: `gr${z}`,
    }));
  }
  for (const z of bays.left) {
    ctx.add(roundArchWindow(ctx, {
      facing: 'left', plane: -halfW, u: z, y: archY, w: archW, h: archH, voussoirs: 3,
      name: `gl${z}`,
    }));
  }
  // Piano nobile: alternating triangular and segmental pediments, which is what the elevation
  // does and what separates the storey without a colour change.
  bays.front.forEach((x, i) => {
    ctx.add(sashWindow(ctx, {
      facing: 'front', plane: e.frontZ, u: x, y: nobY, w: nobW, h: nobH,
      pediment: i % 2 === 0 ? 'triangular' : 'segmental', name: `nf${i}`,
    }));
    ctx.add(sashWindow(ctx, {
      facing: 'front', plane: e.frontZ, u: x, y: attY, w: attW, h: attH,
      pediment: 'none', name: `af${i}`,
    }));
  });
  bays.right.forEach((z, i) => {
    ctx.add(sashWindow(ctx, {
      facing: 'right', plane: halfW, u: z, y: nobY, w: nobW, h: nobH,
      pediment: i % 2 === 0 ? 'triangular' : 'segmental', name: `nr${i}`,
    }));
    ctx.add(sashWindow(ctx, {
      facing: 'right', plane: halfW, u: z, y: attY, w: attW, h: attH,
      pediment: 'none', name: `ar${i}`,
    }));
  });
  bays.left.forEach((z, i) => {
    ctx.add(sashWindow(ctx, {
      facing: 'left', plane: -halfW, u: z, y: nobY, w: nobW, h: nobH,
      pediment: 'none', bars: false, name: `nl${i}`,
    }));
    ctx.add(sashWindow(ctx, {
      facing: 'left', plane: -halfW, u: z, y: attY, w: attW, h: attH,
      pediment: 'none', bars: false, name: `al${i}`,
    }));
  });
  // Rear: pane, sill and head only. A service elevation does not carry consoles and pediments,
  // and pretending otherwise spends the budget where nobody is looking.
  for (const x of bays.back) {
    for (const [y, w, h] of [[archY, 1.5, archH - 0.4], [nobY, nobW * 0.9, nobH], [attY, attW * 0.9, attH]]) {
      ctx.push(box(w - 0.18, h - 0.16, 0.06, x, y + h / 2, e.backZ + M.reveal + 0.05, 'rear-pane'), p.glass);
      ctx.push(box(w + 0.34, 0.15, 0.30, x, y - 0.09, e.backZ - 0.10, 'rear-sill'), p.trim);
      ctx.push(box(w + 0.34, 0.18, 0.28, x, y + h + 0.11, e.backZ - 0.09, 'rear-head'), p.trim);
    }
  }

  // The entrance doors, under the portico, and one street casement that opens (§3.5).
  const doors = doorLeaves(ctx, {
    id: 'town-hall-door', label: 'Town Hall entrance', facing: 'front', plane: e.frontZ,
    u: e.porticoX, y: g, w: doorW, h: doorH * 0.80, name: 'th-door',
  });
  ctx.addOpening(doors.opening);
  const caseX = bays.front[bays.front.length - 1];
  ctx.add(casementLeaf(ctx, {
    id: 'town-hall-casement', label: 'Council chamber window', facing: 'front', plane: e.frontZ,
    u: caseX, y: nobY + 0.15, w: nobW - 0.12, h: nobH * 0.5, name: 'th-case',
  }));

  // Rainwater goods.
  for (const x of [-halfW + 0.30, halfW - 0.30]) {
    ctx.add(downpipe(ctx, { x, z: e.backZ - 0.18, y0: g, y1: wallTop - 0.4 }));
  }
}

/* ──────────────────────── the order — pilasters, cornice, balustrade ──────────────── */

function order(ctx, bays, { g, rustTop, nobileTop, wallTop }) {
  const e = ctx.env;
  const p = ctx.p;
  const zc = (e.frontZ + e.backZ) / 2;
  const halfW = e.bodyW / 2;
  const halfD = e.bodyD / 2;

  // String course over the rustication — the line the giant order stands on.
  ctx.add(stringCourse(ctx, {
    x: 0, z: zc, w: e.bodyW, d: e.bodyD, y: rustTop - 0.16, thick: 0.30, proud: 0.22,
  }));
  ctx.add(stringCourse(ctx, {
    x: 0, z: zc, w: e.bodyW, d: e.bodyD, y: nobileTop - 0.12, thick: 0.20, proud: 0.14,
  }));

  // PAIRED PILASTERS through the two upper storeys, on the bay boundaries. Paired, not single:
  // the doubling is the Renaissance-revival signature and it is what gives the elevation its
  // vertical beat between the windows.
  const pilH = wallTop - rustTop - 0.20;
  const pilasterAt = (facing, u, plane) => {
    const f = faceFrame(facing, plane);
    for (const s of [-1, 1]) {
      const uu = u + s * 0.34;
      const [bx, by, bz] = f.pos(uu, rustTop + 0.10, 0.11);
      ctx.push(box(...f.dims(0.60, 0.30, 0.22), bx, by, bz, 'pil-base'), p.trim);
      const [sx, sy, sz] = f.pos(uu, rustTop + 0.10 + pilH / 2, 0.09);
      ctx.push(box(...f.dims(0.54, pilH, 0.18), sx, sy, sz, 'pil-shaft'), p.wall);
      const [cx, cy, cz] = f.pos(uu, rustTop + pilH - 0.06, 0.13);
      ctx.push(box(...f.dims(0.68, 0.34, 0.26), cx, cy, cz, 'pil-cap'), p.trim);
    }
  };
  const frontEdges = [];
  for (let i = 0; i < bays.front.length - 1; i += 1) {
    frontEdges.push((bays.front[i] + bays.front[i + 1]) / 2);
  }
  frontEdges.push(bays.front[0] - e.bayGap / 2);
  for (const u of frontEdges) pilasterAt('front', u, e.frontZ);
  const rightEdges = [];
  for (let i = 0; i < bays.right.length - 1; i += 1) {
    rightEdges.push((bays.right[i] + bays.right[i + 1]) / 2);
  }
  for (const u of rightEdges) pilasterAt('right', u, halfW);

  // THE CORNICE, and it is the heavy one §2 asks for: bed mould, a run of real modillion blocks
  // with real gaps, corona and drip.
  ctx.add(corniceRun(ctx, {
    x: 0, z: zc, w: e.bodyW, d: e.bodyD, y: wallTop, faces: 'fr', pitch: 1.20, drop: 0.46,
    proud: 0.40, name: 'cornice',
  }));
  const balY = wallTop + 1.05;
  // THE BALUSTRADE over it, front and right return.
  ctx.add(balustrade(ctx, {
    x0: -halfW - 0.2, x1: halfW + 0.2, z0: e.frontZ + 0.4, z1: e.frontZ + 0.4,
    y: balY, h: 1.15, pitch: 1.55, name: 'bal-front',
  }));
  ctx.add(balustrade(ctx, {
    x0: halfW + 0.4, x1: halfW + 0.4, z0: zc - halfD, z1: e.frontZ + 0.4,
    y: balY, h: 1.15, pitch: 1.55, name: 'bal-right',
  }));
  // ── THE BODY TAKES A MANSARD, AND THAT IS THE ROUND'S BIGGEST IDENTITY FIX. ──
  //
  // r1 put two shallow pitched planes behind the balustrade, and
  // `plates/r1/town-hall-melbourne--three-quarter.png` shows exactly what that was worth: a flat
  // blue sheet standing above the parapet with a gap between it and the front wall, reading as a
  // tarpaulin. [MEASURED by looking] `_reference-landmarks/mp-townhall-three-quarter.png` — the
  // reference roofs the WHOLE body in mansard, not only the tower, and the steep dark band over
  // the cornice is half of what makes the silhouette Second Empire. A Second Empire town hall
  // with a flat roof is a bank.
  //
  // The batten pitch is 2.30 rather than the tower's 1.15 for a stated reason: 25 m of frontage
  // at 1.15 is 22 battens a face and the subject is inside a triangle allowance, not outside one.
  // The wall head is closed before the mansard goes on it, for the reason recorded in
  // `kit.js` `seamGable` — an open ring between the wall top and the roof base is a hole through
  // the envelope that only the board station sees.
  ctx.push(slab(e.bodyW + 0.2, 0.24, e.bodyD + 0.2, 0, wallTop - 0.12, zc, 'body-ceiling'), p.shadow);
  ctx.add(mansardRoof(ctx, {
    x: 0, z: zc, w: e.bodyW - 0.5, d: e.bodyD - 0.5, y: wallTop + 0.55,
    lowerH: 3.1, upperH: 0.9, inset: 1.5, deckInset: 2.2, seamPitch: 2.30, name: 'body-mansard',
  }));
  void g;
}

/* ─────────────────────────────────── the portico ──────────────────────────────────── */

/**
 * The giant Corinthian portico. Two storeys of column on a stepped podium, an architrave, frieze
 * and modillioned cornice over it, and a balustrade above that.
 *
 * A Corinthian capital here is a bell, an abacus and volutes rather than carved acanthus, because
 * acanthus at 7 px/m is noise and at a close orbit the bell-and-volute silhouette is what the eye
 * actually reads as Corinthian. What it is NOT is a Doric cushion or a plain box, which is the
 * shortcut that would make the portico generic.
 */
function portico(ctx, { g, rustTop, nobileTop }) {
  const e = ctx.env;
  const p = ctx.p;
  const zFace = e.frontZ;
  const zCol = zFace + e.porticoProudZ - 0.9;
  const podiumY = g;
  const podiumH = 1.05;
  const colBase = podiumY + podiumH;
  const colH = nobileTop - colBase - 0.30;
  const halfW = e.porticoW / 2;

  // Podium and steps. Every tread is a real tread with a nosing, and the flight lands on the
  // pavement rather than hanging over it.
  ctx.push(slab(e.porticoW + 2.2, podiumH, e.porticoProudZ + 1.0,
    e.porticoX, podiumY, zFace + (e.porticoProudZ + 1.0) / 2 - 0.5, 'port-podium'), p.wallAlt);
  // The flight's tread depth is derived from the room the LOT leaves in front of the portico, not
  // authored flat. [MEASURED] `lm-probe.mjs`'s parcel sweep: on a 2 x 1 parcel a 0.42 m tread put
  // the bottom step at z 8.45 against a 7.78 limit, because the podium's projection scales with
  // the lot and the four treads beyond it did not.
  const stepRoom = ctx.env.lotD / 2 - 0.7 - (zFace + e.porticoProudZ + 0.55);
  const tread = Math.max(0.16, Math.min(0.42, stepRoom / 4));
  for (let i = 0; i < 4; i += 1) {
    ctx.push(slab(e.porticoW + 2.2 - i * 0.30, podiumH / 4, tread,
      e.porticoX, podiumY + (3 - i) * (podiumH / 4),
      zFace + e.porticoProudZ + 0.55 + i * tread, 'port-step'), p.ground);
  }

  // Columns.
  const n = Math.max(2, e.columns | 0);
  const pitch = e.porticoW / (n - 1);
  for (let i = 0; i < n; i += 1) {
    const cx = e.porticoX - halfW + i * pitch;
    column(ctx, { x: cx, z: zCol, yBase: colBase, h: colH });
  }
  // Antae against the wall, so the entablature lands on masonry at both ends rather than in air.
  for (const s of [-1, 1]) {
    const ax = e.porticoX + s * (halfW + 0.55);
    ctx.push(box(0.75, colH + 0.30, 0.42, ax, colBase + (colH + 0.30) / 2, zFace + 0.21, 'port-anta'), p.wall);
    ctx.push(box(0.92, 0.34, 0.54, ax, colBase + colH + 0.32, zFace + 0.27, 'port-anta-cap'), p.trim);
  }

  // Entablature: architrave, frieze, then the modillioned cornice.
  const entY = colBase + colH + 0.20;
  const entW = e.porticoW + 2.4;
  const entD = e.porticoProudZ + 0.5;
  const entZ = zFace + entD / 2 - 0.25;
  ctx.push(slab(entW, 0.42, entD, e.porticoX, entY, entZ, 'port-architrave'), p.trim);
  ctx.push(slab(entW - 0.14, 0.62, entD - 0.14, e.porticoX, entY + 0.42, entZ, 'port-frieze'), p.wall);
  ctx.add(corniceRun(ctx, {
    x: e.porticoX, z: entZ, w: entW - 0.30, d: entD - 0.30, y: entY + 1.04, faces: 'f',
    pitch: 1.05, drop: 0.34, proud: 0.30, name: 'port-cornice',
  }));
  // Balustrade over the portico, echoing the main one.
  ctx.add(balustrade(ctx, {
    x0: e.porticoX - entW / 2, x1: e.porticoX + entW / 2,
    z0: entZ + entD / 2 - 0.1, z1: entZ + entD / 2 - 0.1,
    y: entY + 1.90, h: 1.00, pitch: 1.45, name: 'port-bal',
  }));
  // THE INSCRIPTION. `TOWN HALL` cut into the frieze in applied gilt letters, which is what a
  // civic frieze carries and where it carries it.
  //
  // [MEASURED] `wordCost('TOWN HALL', {cap: 0.44})` = 27 segments, 270 triangles, 2.88 m wide on
  // a 12.3 m frieze. [MEASURED] `assessLabel` at the board station, using the CORRECTED per-axis
  // scales — 6.47 px/m along a wall and 4.97 px/m up it, not the 7.33 perpendicular figure, which
  // over-reads a wall's vertical by 47 % — returns **blank-plate**: capPx 2.19, strokePx 0.35.
  // (The uncorrected figures returned the same verdict, so nothing here was built on the wrong
  // number; the numbers quoted are the corrected ones.) That
  // is reported rather than fixed, and it is not a defect: this subject's board-zoom identity is
  // the tower and the portico, both of which measure in the hundreds of pixels, and the frieze
  // is a reward for the close orbit. Sizing the letters to pass a board-zoom gate would put a
  // 2 m cap on a 0.6 m frieze, which is a shopfront, not a town hall.
  ctx.add(reliefLetters({
    text: 'TOWN HALL',
    x: e.porticoX, y: entY + 0.70, z: entZ + entD / 2 - 0.06,
    cap: 0.44, maxWidth: e.porticoW - 1.6, axis: 'z', facing: 1,
    depth: 0.055, embed: 0.030, material: p.accent, name: 'port-inscription',
  }));

  // The portico ceiling, so the underside is a soffit with coffers rather than open sky.
  ctx.push(box(e.porticoW + 1.4, 0.24, e.porticoProudZ - 0.2,
    e.porticoX, entY - 0.12, zFace + (e.porticoProudZ - 0.2) / 2, 'port-soffit'), p.shadow);
  for (let i = 0; i < 3; i += 1) {
    ctx.push(box((e.porticoW + 1.0) / 3.4, 0.10, e.porticoProudZ - 0.9,
      e.porticoX - (e.porticoW / 3) + i * (e.porticoW / 3), entY - 0.28,
      zFace + (e.porticoProudZ - 0.2) / 2, 'port-coffer'), p.trim);
  }
  void rustTop;
}

/** One Corinthian column: plinth, torus base, tapered shaft, bell, volutes, abacus. */
function column(ctx, { x, z, yBase, h }) {
  const p = ctx.p;
  const r = 0.56;
  ctx.push(box(r * 2.5, 0.30, r * 2.5, x, yBase + 0.15, z, 'col-plinth'), p.trim);
  ctx.push(taper(r * 1.35, r * 1.08, 0.34, x, yBase + 0.30, z, 'col-base', 8), p.trim);
  const shaftH = h - 0.30 - 0.34 - 0.95;
  ctx.push(taper(r, r * 0.86, shaftH, x, yBase + 0.64, z, 'col-shaft', 8), p.trim);
  // The capital: a bell that flares outward, four volutes at the corners, and a square abacus.
  const capY = yBase + 0.64 + shaftH;
  ctx.push(taper(r * 0.86, r * 1.24, 0.70, x, capY, z, 'col-bell', 8), p.trim);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      ctx.push(cyl(0.15, 0.20, x + sx * r * 1.12, capY + 0.60, z + sz * r * 1.12, 'y',
        'col-volute', 5), p.trim);
    }
  }
  ctx.push(box(r * 2.9, 0.25, r * 2.9, x, capY + 0.82, z, 'col-abacus'), p.trim);
}

/* ───────────────────────────── the corner tower and lantern ───────────────────────── */

function tower(ctx, { g, rustTop, nobileTop, wallTop }) {
  const e = ctx.env;
  const p = ctx.p;
  const tx = e.towerX;
  const tz = e.towerZ;
  const halfT = e.towerW / 2;
  const top = g + e.towerH;

  const front = [];
  const back = [];
  const left = [];
  const right = [];
  // Two stair lights and a louvred stage per face. A tower's own openings are what stop it
  // reading as a chimney with a clock on it.
  const stairY = rustTop + 1.0;
  front.push(...sashHoles(tx, stairY, 1.5, 2.6, 'twr-stair-f'));
  ctx.countAperture('tower-stair-front');
  right.push(...sashHoles(tz, stairY, 1.5, 2.6, 'twr-stair-r'));
  ctx.countAperture('tower-stair-right');
  const louvreY = nobileTop + 1.4;
  const louvreH = 3.1;
  for (const [key, list, u] of [['front', front, tx], ['back', back, tx],
    ['left', left, tz], ['right', right, tz]]) {
    list.push(...archedHole(u, louvreY, 1.85, louvreH, {
      headFrac: 0.36, steps: 2, tag: `twr-louvre-${key}`, pointed: false,
    }));
    ctx.countAperture(`tower-louvre-${key}`);
  }

  ctx.add(volume(ctx, {
    x: tx, zFront: tz + halfT, zBack: tz - halfT, width: e.towerW, y0: g, y1: top,
    front, back, left, right, name: 'twr',
  }));
  ctx.add(plinthCourse(ctx, {
    x: tx, z: tz, w: e.towerW, d: e.towerW, yBase: g - 0.02, h: 0.85, proud: 0.24,
    material: p.wallAlt,
  }));

  // The tower's own rustication at the base, tying it to the ground storey it grows out of.
  for (let i = 0; i < 5; i += 1) {
    const y0 = g + i * (e.rustH / 5);
    const y1 = y0 + e.rustH / 5 - 0.09;
    const set = i % 2 === 0 ? 0 : 0.055;
    ctx.add(openWall(p.wallAlt, {
      axis: 'x', face: 1, plane: tz + halfT + 0.075, centre: tx, run: e.towerW, y0, y1,
      depth: 0.13, set, openings: front, name: 'twr-rust-f',
    }));
    ctx.add(openWall(p.wallAlt, {
      axis: 'z', face: 1, plane: tx + halfT + 0.075, centre: tz, run: e.towerW, y0, y1,
      depth: 0.13, set, openings: right, name: 'twr-rust-r',
    }));
  }

  for (const y of [rustTop - 0.16, nobileTop - 0.12, top - 4.9]) {
    ctx.add(stringCourse(ctx, {
      x: tx, z: tz, w: e.towerW, d: e.towerW, y, thick: 0.26, proud: 0.20,
    }));
  }
  // Quoins up the two exposed corners — the vertical accent that separates a corner tower from a
  // box, and the reason the tower still reads as masonry when the clock stage is in shadow.
  for (const [qx, qz] of [[tx + halfT, tz + halfT], [tx - halfT, tz + halfT], [tx + halfT, tz - halfT]]) {
    const n = Math.round((top - g) / 1.15);
    for (let i = 0; i < n; i += 2) {
      ctx.push(box(1.05, 0.62, 1.05, qx, g + 0.4 + i * 1.15, qz, 'twr-quoin'), p.trim);
    }
  }

  // Louvre blades in the belfry stage.
  for (const [key, plane, u] of [['front', tz + halfT, tx], ['back', tz - halfT, tx],
    ['right', tx + halfT, tz], ['left', tx - halfT, tz]]) {
    const f = faceFrame(key, plane);
    for (let i = 0; i < 4; i += 1) {
      const by = louvreY + 0.30 + i * (louvreH * 0.68) / 4;
      const [bx, byy, bz] = f.pos(u, by, -(LM_METRICS.reveal - 0.05));
      ctx.push(rotBox(...f.dims(1.70, 0.16, 0.22), bx, byy, bz,
        f.axis === 'z' ? { x: 0.42 } : { z: 0.42 }, 'twr-louvre-blade'), p.metal);
    }
  }
  // Stair-window dressing on the two street faces.
  ctx.add(sashWindow(ctx, {
    facing: 'front', plane: tz + halfT, u: tx, y: stairY, w: 1.5, h: 2.6,
    pediment: 'segmental', name: 'twr-sf',
  }));
  ctx.add(sashWindow(ctx, {
    facing: 'right', plane: tx + halfT, u: tz, y: stairY, w: 1.5, h: 2.6,
    pediment: 'segmental', name: 'twr-sr',
  }));

  // ── the clock stage ──────────────────────────────────────────────────────────────────
  const clockY = top - 2.5;
  for (const [key, plane, u] of [['front', tz + halfT, tx], ['back', tz - halfT, tx],
    ['right', tx + halfT, tz], ['left', tx - halfT, tz]]) {
    ctx.add(clockFace(ctx, { facing: key, plane, u, y: clockY, r: 1.75, name: `twr-clock-${key}`, hours: true }));
  }

  // ── the crown: cornice, mansard, lantern ─────────────────────────────────────────────
  ctx.add(corniceRun(ctx, {
    x: tx, z: tz, w: e.towerW, d: e.towerW, y: top - 0.30, faces: 'fr', pitch: 1.05,
    drop: 0.42, proud: 0.40, name: 'twr-cornice',
  }));
  // Corner urns on the cornice — small, but they are the thing that makes the crown Second
  // Empire rather than a flat cap.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const ux = tx + sx * (halfT + 0.22);
      const uz = tz + sz * (halfT + 0.22);
      ctx.push(box(0.62, 0.26, 0.62, ux, top + 0.85, uz, 'twr-urn-base'), p.trim);
      ctx.push(taper(0.30, 0.17, 0.72, ux, top + 0.98, uz, 'twr-urn', 6), p.trim);
      ctx.push(taper(0.20, 0.05, 0.28, ux, top + 1.70, uz, 'twr-urn-cap', 5), p.trim);
    }
  }
  const mansY = top + 0.95;
  ctx.add(mansardRoof(ctx, {
    x: tx, z: tz, w: e.towerW + 0.3, d: e.towerW + 0.3, y: mansY,
    lowerH: 3.5, upperH: 1.15, inset: 1.05, deckInset: 1.5, name: 'twr-mansard',
  }));
  // Dormers in the mansard, one per street face.
  for (const [key, sign] of [['front', 1], ['right', 1]]) {
    const isFront = key === 'front';
    const dx = isFront ? tx : tx + sign * (halfT - 0.55);
    const dz = isFront ? tz + sign * (halfT - 0.55) : tz;
    ctx.push(box(1.15, 1.20, 1.15, dx, mansY + 1.15, dz, 'twr-dormer'), p.trim);
    ctx.push(box(0.62, 0.70, 0.62, dx, mansY + 1.15, dz + (isFront ? 0.35 : 0), 'twr-dormer-pane'), p.glass);
    ctx.push(taper(0.85, 0.05, 0.75, dx, mansY + 1.78, dz, 'twr-dormer-cap', 4), p.roof);
  }

  // THE LANTERN. Open, columned, and crowned with a small dome and a finial — the last 5 m of the
  // silhouette and the reason the tower does not read as a mansard-topped box.
  const lanY = mansY + 4.65 + 1.15;
  const lr = 1.55;
  ctx.push(slab(lr * 2.3, 0.28, lr * 2.3, tx, lanY - 0.20, tz, 'lan-base'), p.trim);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      ctx.push(taper(0.20, 0.17, 2.05, tx + sx * lr * 0.82, lanY + 0.08, tz + sz * lr * 0.82,
        'lan-col', 6), p.trim);
    }
  }
  ctx.push(box(lr * 1.35, 1.85, lr * 1.35, tx, lanY + 1.05, tz, 'lan-drum'), p.glass);
  ctx.push(slab(lr * 2.1, 0.26, lr * 2.1, tx, lanY + 2.13, tz, 'lan-cornice'), p.trim);
  ctx.push(taper(lr * 1.02, lr * 0.30, 1.15, tx, lanY + 2.39, tz, 'lan-dome', 8), p.roof);
  ctx.push(taper(0.22, 0.05, 1.25, tx, lanY + 3.54, tz, 'lan-finial', 6), p.accent);
  void wallTop;
}
