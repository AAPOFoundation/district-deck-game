import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCybercabModel, cybercabContext } from '../vehicles/cybercab.js';

export function buildCybercabDepot() {
  const bins=new Map();
  const mat=(name,color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.86,...extra});m.name=`cybercab-depot:${name}`;return m;};
  const brick=mat('brick','#785448'),concrete=mat('concrete','#817e73'),steel=mat('lift-charge','#353e42',{metalness:.3,roughness:.44});
  const cyan=mat('charge-display','#56d8e0',{emissive:'#2aafb9',emissiveIntensity:.5});
  const glazing=mat('workshop-glazing','#33494d',{metalness:.1,roughness:.3});
  brick.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 cabWall; varying vec3 cabNormal;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\ncabWall=position; cabNormal=normal;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 cabWall; varying vec3 cabNormal;')
      .replace('#include <color_fragment>',`#include <color_fragment>
        float across=abs(cabNormal.x)>.5?cabWall.z:cabWall.x;
        vec2 uv=vec2(across/.42+mod(floor(cabWall.y/.18),2.)*.5,cabWall.y/.18);
        vec2 edge=min(fract(uv),1.-fract(uv)),aa=max(fwidth(uv),vec2(.008));
        float mortar=1.-smoothstep(.045-aa.x,.045+aa.x,edge.x)*smoothstep(.06-aa.y,.06+aa.y,edge.y);
        float tone=fract(sin(dot(floor(uv),vec2(12.91,78.21)))*43758.54);
        diffuseColor.rgb*=mix(.78,1.18,tone);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.19,.18,.16),mortar*.65);
        diffuseColor.rgb*=.86+.14*smoothstep(0.,1.8,cabWall.y);
      `);
  };
  brick.customProgramCacheKey=()=> 'cybercab-depot-brick-v1';
  const add=(w,h,d,m,x,y,z,angle=0)=>{
    const g=new THREE.BoxGeometry(w,h,d);g.rotateZ(angle);g.translate(x,y,z);
    if(!bins.has(m)) bins.set(m,[]);bins.get(m).push(g);
  };
  // Open service bay, enclosed workshop wing and a ground-level forecourt within 15 m.
  add(14,.12,14,concrete,0,.02,0);
  // High workshop lights sit in actual wall apertures, behind thick masonry reveals.
  // The main wall is recessed 10 cm behind full-height piers and a continuous plinth.
  const facade=(axis,plane,start,end,openings,piers,depth=.3)=>{
    const out=Math.sign(plane);
    const panel=(w,h,d,material,t,y,offset=0)=>{
      if(axis==='x') add(d,h,w,material,plane+out*offset,y,t);
      else add(w,h,d,material,t,y,plane+out*offset);
    };
    let cursor=start;
    for(const o of openings) {
      const lo=o.at-o.w/2,hi=o.at+o.w/2,height=o.top-o.bottom;
      if(lo>cursor) panel(lo-cursor,5.2,depth,brick,(lo+cursor)/2,2.6);
      if(o.bottom>0) panel(o.w,o.bottom,depth,brick,o.at,o.bottom/2);
      panel(o.w,5.2-o.top,depth,brick,o.at,(5.2+o.top)/2);
      panel(o.w+.24,.22,.50,concrete,o.at,o.top+.11);
      if(o.kind!=='door') {
        panel(o.w+.24,.16,.50,concrete,o.at,o.bottom-.08);
        panel(o.w,height,.055,glazing,o.at,(o.bottom+o.top)/2,-.12);
        for(const t of [lo+.05,hi-.05]) panel(.10,height,.10,steel,t,(o.bottom+o.top)/2,-.015);
        for(const y of [o.bottom+.05,o.top-.05]) panel(o.w,.10,.10,steel,o.at,y,-.015);
        for(const f of [1/3,2/3]) panel(.07,height,.08,steel,lo+o.w*f,(o.bottom+o.top)/2,-.025);
        panel(o.w,.07,.08,steel,o.at,o.bottom+height*.52,-.025);
      } else {
        for(const t of [lo-.07,hi+.07]) panel(.14,height,.50,concrete,t,(o.bottom+o.top)/2,-.025);
      }
      cursor=hi;
    }
    if(cursor<end) panel(end-cursor,5.2,depth,brick,(cursor+end)/2,2.6);
    // Plinth stops at the staff doorway; it does not become a raised threshold.
    const door=openings.find(o=>o.kind==='door');
    const runs=door?[[start,door.at-door.w/2],[door.at+door.w/2,end]]:[[start,end]];
    for(const [lo,hi] of runs) panel(hi-lo,.32,.38,concrete,(lo+hi)/2,.24,.06);
    for(const t of piers) panel(.55,5.2,.40,brick,t,2.6,.05);
  };
  const lights=(positions,width)=>positions.map(at=>({at,w:width,bottom:2.25,top:4.3}));
  for(const side of [-1,1]) facade('x',side*6.75,-6.95,.55,lights([-4.9,-1.35],2.15),[-6.6,-3.15,.2]);
  facade('z',-6.75,-6.8,6.8,lights([-4.35,0,4.35],2.7),[-6.5,-2.15,2.15,6.5]);
  facade('z',.35,1.8,6.8,[{at:4.2,w:1.3,bottom:.04,top:2.64,kind:'door'},...lights([5.7],1.0)],[2.1,6.525],.4);
  add(8.6,.85,.45,brick,-2.5,4.77,.35);
  add(14,.3,7.8,concrete,0,5.25,-3.2);
  for(const x of [-6.8,6.8]) add(.35,.4,7.8,brick,x,5.58,-3.2);
  add(13.6,.4,.35,brick,0,5.58,-6.9);
  for(const x of [-6.4,1.7]) add(.23,4.4,.26,steel,x,2.2,.55);
  add(8.3,.22,.3,steel,-2.35,4.25,.55);
  // Lift rails sit on paired scissor supports anchored to the floor.
  for(const x of [-4.6,-2.6]) {
    add(.48,.18,4.8,steel,x,1.24,-3.2);add(.6,.12,4.8,steel,x,.14,-3.2);
    for(const sign of [-1,1]) {
      const g=new THREE.BoxGeometry(.16,.16,3.25);g.rotateX(sign*.34);g.translate(x,.69,-3.2);
      bins.get(steel).push(g);
    }
  }
  for(const x of [-3.7,3.6]) {
    // Charge pads are inset in the paved forecourt, with attached charging bollards.
    add(2.9,.025,4.8,steel,x,.093,3.7);
    for(const sx of [-1.35,1.35]) add(.045,.012,4.55,cyan,x+sx,.113,3.7);
    add(.58,1.5,.4,steel,x+1.8,.82,1.8);add(.38,.46,.025,cyan,x+1.8,1.20,2.012);
  }
  // Closed workshop door is recessed into the right wing.
  add(1.3,2.6,.10,steel,4.2,1.34,.29);
  // Recessed sheet-metal cap distinguishes the workshop roof from its concrete forecourt.
  // Existing slab, parapets and service-bay clearance remain the supporting envelope.
  add(13.1,.05,7.05,steel,0,5.425,-3.15);
  for(const x of [-4.4,-2.2,0,2.2,4.4]) add(.12,.07,7.05,steel,x,5.485,-3.15);
  // Metal coping covers the existing brick parapets; the accepted deck and seams stay intact.
  for(const x of [-6.8,6.8]) add(.4,.06,7.8,steel,x,5.81,-3.2);
  add(13.6,.06,.4,steel,0,5.81,-6.9);
  // Two rear rainwater drops run beside the outer window bays, clear of the repair approach.
  for(const x of [-5.98,5.98]) {
    add(.14,5.2,.14,steel,x,2.87,-6.98);
    add(.28,.28,.24,steel,x,5.59,-6.98);
    add(.22,.28,.20,steel,x,.22,-6.98);
  }
  // Keep the original four part/material identities in their established order.
  const windowGeometries=bins.get(glazing);bins.delete(glazing);bins.set(glazing,windowGeometries);
  const parts=[];
  for(const [material,geometries] of bins) {
    const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());parts.push({geometry,material});
  }
  return {id:'cybercab-depot',representation:'procedural',parts};
}

export function depotParcel(city,business) {
  const parcels=Object.values(city.parcels??{});
  return parcels.find(p=>p.id===business?.depot?.parcelId)
    ?? parcels.filter(p=>p.districtId===business?.depot?.districtId && /warehouse|industrial/.test(p.archetypeId??''))
      .sort((a,b)=>a.id.localeCompare(b.id))[0] ?? null;
}

export function syncCybercabDepot(board,state) {
  const context=cybercabContext(board.city);context.state=state;
  const parcel=depotParcel(board.city,state.cybercab);
  if(!parcel) return;
  context.depotParcelId=parcel.id;
  context.depot=parcel.centre;
  let scene=board.root;while(scene.parent)scene=scene.parent;
  const terminal=scene.getObjectByName('fringe:port-terminal');
  if(terminal?.userData.cabBay) {
    terminal.updateWorldMatrix(true,false);
    const b=terminal.userData.cabBay;
    context.yardBays=(terminal.userData.cabBays ?? [b]).map(bay=>{
      const p=terminal.localToWorld(new THREE.Vector3(bay.x,bay.y,bay.z));
      const forward=new THREE.Vector3(Math.sin(bay.yaw??0),0,Math.cos(bay.yaw??0)).transformDirection(terminal.matrixWorld);
      return {x:p.x,y:p.y,z:p.z,yaw:Math.atan2(forward.x,forward.z)};
    });
    context.yard=context.yardBays[0];
    const aisle=terminal.userData.cabYardAisle;
    context.yardAisle=aisle?terminal.localToWorld(new THREE.Vector3(aisle.x,aisle.y,aisle.z)):null;
    const gate=terminal.userData.rig?.truckGate;
    // The rig anchor is the booth centre. Its adjacent vehicle lane is clear
    // of the booth's 3.6 m plinth and the portal's supported outer column.
    if(gate) context.yardGate=terminal.localToWorld(new THREE.Vector3(gate.x+3.2,b.y,gate.z));
  }
  if(!board.cybercabDepot) {
    const model=buildCybercabDepot(),cab=buildCybercabModel();
    board.registry?.models?.set('cybercab-depot',model);board.registry?.models?.set('cybercab',cab);
    const group=new THREE.Group();group.name='fringe:cybercab-depot';group.userData.card={kind:'cybercab'};
    group.userData.parcelId=parcel.id;
    for(const part of model.parts) {const mesh=new THREE.Mesh(part.geometry,part.material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
    group.position.set(parcel.centre.x,0,parcel.centre.z);
    group.rotation.y=Math.PI; // The accepted north-edge parcel opens directly toward its road.
    board.root.add(group);
    board.cybercabDepot={group,model,parcelId:parcel.id};
  }
  // Existing parcel batching remains the owner: hide only the parcel replaced by this shop.
  for(const [id,record] of board.staticBuildings??[]) {
    if(id!==parcel.id) continue;
    for(const mesh of record.meshes??[]) {mesh.setMatrixAt(record.index,new THREE.Matrix4().makeScale(0,0,0));mesh.instanceMatrix.needsUpdate=true;}
  }
  const replacement=board.dynamicBuildings?.get(parcel.id)?.group;
  if(replacement) replacement.visible=false;
  if(globalThis.window && !context.tapListener) {
    context.tapListener=event=>{
      const view=window.__districtDeck?.view,canvas=view?.renderer?.domElement;
      if(event.target!==canvas || event.button!==0 || view.rig.wasDrag()) return;
      const rect=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),view.camera);
      const objects=[board.cybercabDepot.group,...[...context.records.values()].map(r=>r.group)];
      const hit=ray.intersectObjects(objects,true)[0];if(!hit) return;
      let target=hit.object;while(target && !target.userData.card) target=target.parent;
      event.stopImmediatePropagation();event.preventDefault();
      window.dispatchEvent(new CustomEvent('district-deck:card-open',{detail:target.userData.card}));
    };
    window.addEventListener('pointerup',context.tapListener,true);
    board.root.addEventListener('removed',()=>{window.removeEventListener('pointerup',context.tapListener,true);context.tapListener=null;});
  }
}
