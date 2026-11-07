import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hashSeed } from '../textures.js';

// One authored hotel planting. All crown points are metres in the held airport
// frame, compensated through the complete mesh transform, not legacy shell axes.
export function airportWeepingCrown(source, meshWorld, airportWorld, quality = 'high') {
  const tiers = { high: [5,6,4,96,3150], medium: [4,5,3,64,1954], low: [3,4,2,40,1254] };
  if (!tiers[quality] || source.userData.clusterTree?.kind !== 'weeping') throw Error('Weeping source and known quality required');
  // Static venue clusterTreeGeometry uses foliage.js's local merge helper,
  // which adds aWind=0 when none of its bole/branch/lobe inputs are tagged.
  // Reject a changed deformation contract instead of guessing new weights.
  const names = Object.keys(source.attributes).sort();
  if (names.join(',') !== 'aWind,color,normal,position,uv' || source.attributes.aWind.itemSize !== 1 || source.attributes.aWind.array.some(v => v !== 0)) throw Error('Static venue zero-wind attribute contract changed');
  const p = source.attributes.position, colour = source.attributes.color;
  let top = -Infinity, cap;
  for (let i=0;i<34;i++) top=Math.max(top,p.getY(i));
  for (let i=0;i<34;i++) if(p.getY(i)===top&&Math.hypot(p.getX(i),p.getZ(i))<1e-8) cap=[p.getX(i),top,p.getZ(i)];
  if(!cap || source.index.count<60) throw Error('Retained bole top cap absent');
  const airportInverse=airportWorld.clone().invert(),toAirport=airportInverse.clone().multiply(meshWorld),toMesh=meshWorld.clone().invert().multiply(airportWorld);
  const planted=new THREE.Vector3().applyMatrix4(toAirport),anchor=new THREE.Vector3(...cap).applyMatrix4(toAirport),stem=anchor.y-planted.y;
  const salt=source.userData.clusterTree.seed,U=i=>(hashSeed(`R158:${salt}:${i}`)>>>0)/4294967296;
  const [mainRadial,mainSegments,secondaryPerBough,totalTwigs,totalLeafAttempts]=tiers[quality],parts=[],connections=[],leaves=[],woodRuns=[];let nextWoodVertex=34;
  const absolute=(x,y,z)=>new THREE.Vector3(planted.x+x,planted.y+y,planted.z+z),wood=[colour.getX(0),colour.getY(0),colour.getZ(0)];
  // Unequal low arching supports: the canopy's apex belongs to foliage,
  // not four bare forks. All coordinates below are metres above planted support.
  const ends=[[2.28,5.60,-.86],[1.74,5.82,1.61],[-.52,5.71,-1.78],[-1.47,5.51,.73]];
  const highControls=[[.83,5.94,-.24],[.61,6.02,.72],[-.16,5.98,-.62],[-.69,5.81,.21]];
  const windows=[{x:-.30,z:-.55,radius:.27},{x:1.43,z:.64,radius:.30}];
  function tube(curve,radial,segments,r0,r1) {
    const centers=[],positions=[],normals=[],uv=[],colors=[],indices=[],up=new THREE.Vector3(0,1,0),side=new THREE.Vector3(),across=new THREE.Vector3();
    for(let i=0;i<=segments;i++) {const t=i/segments,c=curve.getPoint(t),tangent=curve.getTangent(t).normalize();side.crossVectors(Math.abs(tangent.y)>.92?new THREE.Vector3(1,0,0):up,tangent).normalize();across.crossVectors(tangent,side).normalize();const r=THREE.MathUtils.lerp(r0,r1,t);centers.push(c.clone());
      for(let j=0;j<radial;j++){const theta=j*Math.PI*2/radial,n=side.clone().multiplyScalar(Math.cos(theta)).addScaledVector(across,Math.sin(theta)),v=c.clone().addScaledVector(n,r);positions.push(...v.toArray());normals.push(...n.toArray());uv.push(.125,.5);colors.push(...wood);}
    }
    for(let i=0;i<segments;i++)for(let j=0;j<radial;j++){const a=i*radial+j,b=i*radial+(j+1)%radial,c=(i+1)*radial+j,d=(i+1)*radial+(j+1)%radial;indices.push(a,b,c,b,d,c);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);parts.push(g);woodRuns.push({firstVertex:nextWoodVertex,vertexCount:positions.length/3,radial,segments,centerline:centers.map(p=>p.toArray()),radii:[r0,r1]});nextWoodVertex+=positions.length/3;return centers;
  }
  const samplePath=(points,t)=>{const n=t*(points.length-1),i=Math.min(points.length-2,Math.floor(n));return points[i].clone().lerp(points[i+1],n-i);};
  // Bough bases overlap the actual cap disc. No second bole or floating collar.
  let capRadius=Infinity;for(let i=0;i<34;i++)if(p.getY(i)===top){const a=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(toAirport);if(a.distanceTo(anchor)>1e-5)capRadius=Math.min(capRadius,Math.hypot(a.x-anchor.x,a.z-anchor.z));}
  const baseRadius=Math.min(.11,capRadius*.65);
  const leafPositions=[],leafNormals=[],leafUV=[],leafColors=[],leafIndices=[];
  function leaf(start,length,width,yaw,lean,key,upper) {
    const down=new THREE.Vector3(Math.sin(yaw)*lean,-1,Math.cos(yaw)*lean).normalize();
    const side=new THREE.Vector3(Math.cos(yaw),(.5-U(key+1))*.32,-Math.sin(yaw));side.addScaledVector(down,-side.dot(down)).normalize();
    const normal=new THREE.Vector3().crossVectors(side,down).normalize(),middle=start.clone().addScaledVector(down,length*.45),points=[start,middle.clone().addScaledVector(side,width*.5),start.clone().addScaledVector(down,length),middle.clone().addScaledVector(side,-width*.5)],at=leafPositions.length/3,tone=.78+U(key)*.20;
    // Whole attached leaves are omitted at the two authored interior windows;
    // no vertex clipping, detached cloud, or hidden envelope fit.
    if(points.some(p=>windows.some(w=>p.y>planted.y+3.75&&Math.hypot(p.x-planted.x-w.x,p.z-planted.z-w.z)<w.radius))) return;
    for(let i=0;i<4;i++){leafPositions.push(...points[i].toArray());leafNormals.push(...normal.toArray());leafUV.push(.125,.5);const k=i===2?.91:i===0?.86:1;leafColors.push(tone*k,tone*k,tone*k);}leafIndices.push(at,at+1,at+2,at,at+2,at+3);leaves.push({attachment:start.toArray(),length,width,upper});return true;
  }
  let twigId=0,upperTwigCount=0,secondaryId=0;
  for(let b=0;b<4;b++) {
    const control=absolute(...highControls[b]),end=absolute(...ends[b]),first=anchor.clone().add(new THREE.Vector3(b===3?-.14:.12,.70,b===1?.14:-.06)),curve=new THREE.CubicBezierCurve3(anchor.clone(),first,control,end);
    const mainPath=tube(curve,mainRadial,mainSegments,baseRadius,.029),mainRun=woodRuns.length-1;connections.push({kind:'primary',start:anchor.toArray(),end:end.toArray(),run:mainRun});
    for(let j=0;j<secondaryPerBough;j++,secondaryId++) {
      const t=.31+j*(.63/(secondaryPerBough-1)),start=samplePath(mainPath,t),yaw=b*1.24+j*1.79+U(300+secondaryId)*.35,reach=.44+U(600+secondaryId)*.44;
      const end=start.clone().add(new THREE.Vector3(Math.sin(yaw)*reach,.27+U(900+secondaryId)*.27,Math.cos(yaw)*reach));
      end.x=THREE.MathUtils.clamp(end.x,planted.x-1.34,planted.x+2.35);end.z=THREE.MathUtils.clamp(end.z,planted.z-1.70,planted.z+1.69);end.y=Math.min(planted.y+6.12,end.y);
      const one=start.clone().lerp(end,.33);one.y=start.y+.21;const two=start.clone().lerp(end,.73);two.y=end.y+.10;
      const segments=quality==='high'?3:2,secondary=tube(new THREE.CubicBezierCurve3(start,one,two,end),3,segments,.027,.009),secondaryRun=woodRuns.length-1;connections.push({kind:'secondary',parentRun:mainRun,parentT:t,start:start.toArray(),end:end.toArray(),run:secondaryRun});
      const amount=Math.floor((secondaryId+1)*totalTwigs/(secondaryPerBough*4))-Math.floor(secondaryId*totalTwigs/(secondaryPerBough*4));
      for(let k=0;k<amount;k++,twigId++) {
        const upper=twigId%3!==2,t=.12+((k+.6)/(amount+.4))*.84,start=samplePath(secondary,t),yaw=twigId*2.399+U(1200+twigId)*.6,reach=.48+U(1500+twigId)*.40;
        const end=start.clone().add(new THREE.Vector3(Math.sin(yaw)*reach,0,Math.cos(yaw)*reach));end.x=THREE.MathUtils.clamp(end.x,planted.x-1.40,planted.x+2.45);end.z=THREE.MathUtils.clamp(end.z,planted.z-1.76,planted.z+1.73);
        if(upper){upperTwigCount++;const x=end.x-planted.x-.4,z=end.z-planted.z;end.y=planted.y+6.62-.10*(x*x)-.065*(z*z)+(U(1800+twigId)-.5)*.07;}
        else{end.y=planted.y+3.64+U(1800+twigId)*1.12;}
        const one=start.clone().lerp(end,.38),two=start.clone().lerp(end,.77);one.y=upper?start.y+.18:start.y+.03;two.y=upper?end.y-.03:end.y+.32;
        const twig=tube(new THREE.CubicBezierCurve3(start,one,two,end),3,2,.014,.003),run=woodRuns.length-1;connections.push({kind:'twig',upper,parentRun:secondaryRun,parentT:t,start:start.toArray(),end:end.toArray(),run});
        const leavesHere=Math.floor((twigId+1)*totalLeafAttempts/totalTwigs)-Math.floor(twigId*totalLeafAttempts/totalTwigs);
        for(let n=0;n<leavesHere;n++) {
          const t=.02+((n+.45+U(2000+twigId*50+n)*.10)/leavesHere)*.975,at=samplePath(twig,t),yaw=n*2.399+U(6000+twigId*50+n)*.8,length=.30+U(10000+twigId*50+n)*.15,width=.09+U(14000+twigId*50+n)*.05,lean=upper?.85+U(18000+twigId*50+n)*.85:.20+U(18000+twigId*50+n)*.45;
          if(leaf(at,length,width,yaw,lean,22000+twigId*50+n,upper)){leaves.at(-1).parentRun=run;leaves.at(-1).parentT=t;}
        }
      }
    }
  }
  const foliage=new THREE.BufferGeometry();foliage.setAttribute('position',new THREE.Float32BufferAttribute(leafPositions,3));foliage.setAttribute('normal',new THREE.Float32BufferAttribute(leafNormals,3));foliage.setAttribute('uv',new THREE.Float32BufferAttribute(leafUV,2));foliage.setAttribute('color',new THREE.Float32BufferAttribute(leafColors,3));foliage.setIndex(leafIndices);parts.push(foliage);
  for (const part of parts) part.setAttribute('aWind', new THREE.Float32BufferAttribute(new Float32Array(part.attributes.position.count), 1));
  const crown=mergeGeometries(parts);parts.forEach(g=>g.dispose());crown.applyMatrix4(toMesh);
  const bole=new THREE.BufferGeometry();for(const[name,a]of Object.entries(source.attributes))bole.setAttribute(name,new THREE.BufferAttribute(a.array.slice(0,34*a.itemSize),a.itemSize,a.normalized));bole.setIndex(new THREE.BufferAttribute(source.index.array.slice(0,60),1));
  const result=mergeGeometries([bole,crown]);bole.dispose();crown.dispose();if(result.index.array.constructor!==source.index.array.constructor)result.setIndex(new THREE.BufferAttribute(new source.index.array.constructor(result.index.array),1));result.computeBoundingBox();result.computeBoundingSphere();
  result.userData.clusterTree={kind:'weeping',seed:salt,airportWeeping:true,quality,clusters:0,rimCards:0,hedge:false,ring:false,triangles:result.index.count/3};
  result.userData.r158Weeping={quality,originalBoleVertices:34,originalBoleTriangles:20,measuredCap:cap,capAirportLocal:anchor.toArray(),plantedAirportLocal:planted.toArray(),clearStem:stem,primaryBoughs:4,secondarySupports:secondaryPerBough*4,twigPaths:totalTwigs,upperTwigPaths:upperTwigCount,curtainTwigPaths:totalTwigs-upperTwigCount,leafAttempts:totalLeafAttempts,upperLeaves:leaves.filter(l=>l.upper).length,curtainLeaves:leaves.filter(l=>!l.upper).length,leafCount:leaves.length,windows,connections,woodRuns,leafFirstVertex:nextWoodVertex,leafAttachments:leaves,sourceTriangles:source.index.count/3,sourceLegacy:{...source.userData.clusterTree},materialHeld:true,geometryMetres:'airport-local metre paths compensated by inverse full mesh world transform',staticVenue:true,windPolicy:"all-zero source venue weights held; no new wind shader or animation"};
  return result;
}

// Preserve venue clipping: this adoption cannot recreate an absent source owner.
export function adaptAirportHotelWeeping(root, quality = 'high') {
  const owner = root.getObjectByName('fringe:tullamarine-tree:weeping:436:170:4');
  const mesh = owner?.getObjectByName('leaf-cluster-tree:weeping');
  if (!mesh) return false;
  const source = mesh.geometry;
  mesh.geometry = airportWeepingCrown(source, mesh.matrixWorld, root.matrixWorld, 'high');
  mesh.userData.r158DensityFloor = { requestedQuality: quality, geometryQuality: 'high', owner: owner.name };
  mesh.userData.clusterTree = mesh.geometry.userData.clusterTree;
  source.dispose();
  return true;
}
