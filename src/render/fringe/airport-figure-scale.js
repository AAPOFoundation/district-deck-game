import * as THREE from 'three';
import { AUTHORED_SCALE } from '../authored-scale.js';

function localBounds(parts) {
  const box=new THREE.Box3(),point=new THREE.Vector3();
  for(const mesh of parts) {
    mesh.updateMatrix();const position=mesh.geometry.attributes.position;
    for(let i=0;i<position.count;i++)box.expandByPoint(point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrix));
  }
  return box;
}
function data(box){return {min:box.min.toArray(),max:box.max.toArray(),size:box.getSize(new THREE.Vector3()).toArray()};}
function scaleOwnedParts(parts,anchor,scale) {
  for(const mesh of parts) {
    // Airport G pool can be shared with vehicles/furniture: only fresh clones change.
    mesh.geometry=mesh.geometry.clone();mesh.scale.multiplyScalar(scale);
    mesh.position.sub(anchor).multiplyScalar(scale).add(anchor);mesh.updateMatrix();
  }
}

export function registerAirportFigure(parent,first,x,y,z,options,applyScale=false) {
  const roles=['legs','torso'];
  if(options.vest)roles.push('vest','vest-band');
  roles.push('head');if(options.hat)roles.push('hat','hat-brim');
  if(options.arm){roles.push('arm');if(options.wand)roles.push('wand');}
  if(options.bag)roles.push('bag','bag-handle');
  const meshes=parent.children.slice(first),index=Number(options.name?.split(':').at(-1));
  if(!Number.isInteger(index)||index<0||meshes.length!==roles.length||meshes.some(m=>!m.isMesh))throw Error('Exact emitted adult assembly required');
  if(meshes[roles.indexOf('torso')].name!==options.name)throw Error('Named torso does not match emitted figure');
  const body=meshes.filter((_,i)=>['legs','torso','vest','vest-band','head'].includes(roles[i]));
  const anchor=new THREE.Vector3(x,y,z),before=localBounds(meshes),bodyBefore=localBounds(body);
  const actualBodyHeadHeight=bodyBefore.max.y-y,target=AUTHORED_SCALE.airport.adult.bodyHeadHeight[index%3];
  if(!(actualBodyHeadHeight>0))throw Error('Positive measured body/head height required');
  const scale=applyScale?target/actualBodyHeadHeight:1;
  const sourceGeometries=meshes.map(m=>m.geometry);
  if(applyScale)scaleOwnedParts(meshes,anchor,scale);
  const after=localBounds(meshes),bodyAfter=localBounds(body);
  const record={name:options.name,index,kind:options.name.includes('crew:')?'crew':options.name.includes('pax')?'passenger':'guest',
    anchor:anchor.toArray(),nominalH:options.h??3.3,nominalRadius:options.r??.54,
    bodyHeadHeightBefore:actualBodyHeadHeight,bodyHeadHeightAfter:bodyAfter.max.y-y,targetBodyHeadHeight:applyScale?target:actualBodyHeadHeight,
    fullHeightBefore:before.max.y-y,fullHeightAfter:after.max.y-y,
    footContactBefore:before.min.y-y,footContactAfter:after.min.y-y,
    before:data(before),after:data(after),scale,applied:applyScale,
    ownership:'Original addWorker emission; cloned geometry per affected mesh, original parent/yaw/anchor held',
    roles,meshes,sourceGeometries};
  parent.userData.airportFigures??=[];parent.userData.airportFigures.push(record);
  for(let i=0;i<meshes.length;i++)meshes[i].userData.airportFigure={owner:record.name,role:roles[i]};
  return record;
}

export function registerAirportSuitcase(mesh,groundY,applyScale=false) {
  if(!mesh.isMesh||!mesh.name.endsWith(':suitcase'))throw Error('Exact separate guest suitcase required');
  const before=localBounds([mesh]),anchor=new THREE.Vector3(mesh.position.x,groundY,mesh.position.z);
  const scale=applyScale?AUTHORED_SCALE.airport.adult.guestSuitcaseHeight/(before.max.y-groundY):1;
  const sourceGeometry=mesh.geometry;if(applyScale)scaleOwnedParts([mesh],anchor,scale);
  const after=localBounds([mesh]);
  mesh.userData.airportSuitcase={name:mesh.name,anchor:anchor.toArray(),scale,before:data(before),after:data(after),
    applied:applyScale,heightBefore:before.max.y-groundY,heightAfter:after.max.y-groundY,
    footContactBefore:before.min.y-groundY,footContactAfter:after.min.y-groundY,
    ownership:'Separately named ground-standing case; original X/Z support centre held',sourceGeometry};
}

export function figureSummary(record) {
  const {meshes,sourceGeometries,...summary}=record;return {...summary,parts:meshes.map((m,i)=>({uuid:m.uuid,name:m.name,role:record.roles[i]}))};
}
