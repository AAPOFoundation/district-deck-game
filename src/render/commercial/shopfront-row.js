// P20 I2 — shopfront-row sheet grammar. The commercial dispatcher supplies the envelope.
// Four narrow tenancies; nine library-owned buckets, vertex pigment, actual apertures.
import * as THREE from 'three';
import { restyleColour, restyleColours } from '../style/restyle.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mirrorModelX, normaliseHand, isHanded } from './mirror.js';

export const SHOPFRONT_ROW_IDS = Object.freeze(['shop-corner', 'shoptop-mixed', 'shop-corner-victorian']);
const PIGMENT = Object.freeze({
  wall:'#bca37e', roof:'#414b50', trim:'#d8c7a3', plinth:'#50504b',
  joinery:'#333d30', glass:'#111b1b', ground:'#938879', planting:'#697744', metal:'#7b7d69',
});
const FACADES = ['#cbb994','#929d7b','#aa6849','#b99458'];
const AWNINGS = ['#657274','#879078','#9b6550','#b49762'];
const JOINERY = ['#485849','#4c5834','#533b2c','#5b502f'];
const SIGNALS = ['p17-b7-lot-plinth-bevel','p17-b7-plinth-course','p17-b7-opening-frame',
  'p17-b7-dado','p17-b7-awning-seam','p17-b7-parapet-coping'];

function palette(library) {
  return Object.fromEntries(Object.keys(PIGMENT).map(role => {
    const family={wall:'render',roof:'slate',trim:'limestone',plinth:'brick',joinery:'timber',
      glass:'glass',ground:'concrete',planting:'foliage',metal:'corrugated'}[role];
    const m=library.get(family,{variant:`p20-i2-${role}`,color:'#ffffff',roughness:role==='glass'?.32:.88,
      metalness:0,envBase:role==='glass'?.13:.08,opacity:1});
    if(m.userData.i2Role) return [role,m];
    m.userData.i2Role=role;m.vertexColors=true;m.map=null;m.aoMap=null;
    m.clearcoat=0;m.transparent=false;m.depthWrite=true;
    if(m.normalScale)m.normalScale.setScalar(role==='wall'?.12:.08);
    if(['plinth','metal','glass'].includes(role)){m.normalMap=null;m.roughnessMap=null;}
    if(role==='glass'&&m.emissive){m.emissive.set('#3c4a48');m.emissiveIntensity=.10;}
    if(role==='planting')m.side=THREE.DoubleSide;
    // Micro normal/roughness maps and the kit's final weather finish remain in use.
    // The glass has its own local reflection field, rather than the global lit-room grid.
    if(role==='glass')m.userData.buildingGlassFinish={source:'i2-local-glass',skyReflection:true};
    const previous=m.onBeforeCompile;
    m.onBeforeCompile=(shader,renderer)=>{
      previous?.call(m,shader,renderer);
      shader.vertexShader=shader.vertexShader.replace('#include <common>',
        '#include <common>\nattribute float i2Brick; varying float vI2Brick; varying vec3 vI2Pos;');
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvI2Brick=i2Brick; vI2Pos=position;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
        `#include <common>
        varying float vI2Brick; varying vec3 vI2Pos;
        float i2Hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`);
      let finish='';
      if(role==='wall'||role==='plinth'||role==='trim')finish=`
        vec2 q=vec2(vI2Pos.x+vI2Pos.z,vI2Pos.y);
        float grain=i2Hash(floor(q*110.0));
        float streak=pow(0.5+0.5*sin(q.x*27.0+sin(q.x*9.0)),12.0);
        diffuseColor.rgb *= (0.92+grain*0.12)*(1.0-streak*0.14)*(0.75+0.25*smoothstep(0.1,1.1,q.y));
        if(vI2Brick>0.5){
          float row=floor(q.y/0.16);vec2 cell=vec2(q.x/0.34+mod(row,2.0)*0.5,q.y/0.16);
          vec2 f=fract(cell);float mortar=max(step(0.925,f.x),step(0.86,f.y));
          diffuseColor.rgb*=mix(0.79+0.29*i2Hash(floor(cell)),1.28,mortar*0.75);
        }`;
      if(role==='metal'||role==='roof')finish=`
        float streak=pow(0.5+0.5*sin(vI2Pos.x*43.0+sin(vI2Pos.z*0.7)),8.0);
        diffuseColor.rgb*=0.90+0.10*sin(vI2Pos.z*1.8)-streak*0.17;`;
      if(role==='glass')finish=`
        float sky=smoothstep(0.2,1.0,fract(vI2Pos.y/3.2));
        float leaves=pow(0.5+0.5*sin(vI2Pos.x*19.0+sin(vI2Pos.y*11.0))*sin(vI2Pos.y*16.0),4.0);
        diffuseColor.rgb*=0.65+sky*0.7;
        diffuseColor.rgb+=vec3(0.024,0.030,0.016)*leaves+vec3(0.008,0.012,0.014)*sky;`;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n${finish}`);
    };
    m.customProgramCacheKey=()=>`p20-i2-v1-${role}`;
    // Fixed bucket seed: assembly order must not choose the weather for this shared palette.
    library.finishBuildingMaterial?.(m,{descriptor:`p20-i2-${role}`,seedKey:`p20-i2-${role}`});
    return [role,m];
  }));
}

function tile(w,d,bottom=-.42,top=.08,bevel=.18) {
  const ring=(inset,y)=>{const x=w/2-inset,z=d/2-inset,c=.36;return [[-x+c,y,-z],[x-c,y,-z],
    [x,y,-z+c],[x,y,z-c],[x-c,y,z],[-x+c,y,z],[-x,y,z-c],[-x,y,-z+c]];};
  const r=[ring(0,bottom),ring(0,top-bevel),ring(bevel,top)],p=[];
  const tri=(a,b,c)=>p.push(...a,...b,...c);
  for(let k=0;k<2;k++)for(let i=0;i<8;i++){const j=(i+1)%8;
    tri(r[k][i],r[k+1][i],r[k][j]);tri(r[k][j],r[k+1][i],r[k+1][j]);}
  for(let i=1;i<7;i++){tri(r[2][0],r[2][i+1],r[2][i]);tri(r[0][0],r[0][i],r[0][i+1]);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.computeVertexNormals();return g;
}

export function assembleShopfrontRow(library,env,v,opts={}) {
  const {bodyW:W,bodyD:D,wallH:H,frontZ:F,backZ:B,lotW,lotD,facade,storeys,archetypeId}=env;
  // Select the live vertex palettes only for this census entry; sibling rows share the grammar.
  const pigment = archetypeId === 'shop-corner' ? { ...PIGMENT,
    wall: restyleColour(PIGMENT.wall, '#e1c397', { id: 'building:shop-corner.wall' }),
    trim: restyleColour(PIGMENT.trim, '#b8a98b', { id: 'building:shop-corner.trim' }),
    ground: restyleColour(PIGMENT.ground, '#c3b4a0', { id: 'building:shop-corner.ground' }),
    joinery: restyleColour(PIGMENT.joinery, '#a9cb9f', { id: 'building:shop-corner.joinery' }),
  } : PIGMENT;
  const facades = archetypeId === 'shop-corner' ? restyleColours(FACADES,
    ['#f3ddb1', '#afbd94', '#cc7d58', '#deb169'], { id: 'building:shop-corner.facades' }) : FACADES;
  const joinery = archetypeId === 'shop-corner' ? restyleColours(JOINERY,
    ['#d0fed3', '#dbfe96', '#feb587', '#fedf83'], { id: 'building:shop-corner.joinery-palette' }) : JOINERY;
  const p=palette(library),features=[],groups=new Map(),counts={building:0,lot:0,openings:0,gates:1};
  const apertures=[],openings=[],offsets={},n=4,U=W/n,y0=.12,groundHead=2.96,awningBack=3.34;
  const awningFront=2.85,awningZ=Math.min(F+1.35,lotD/2-.42),cz=(F+B)/2;
  let site=false;
  const put=(geometry,role,name,colour=pigment[role],brick=0)=>{
    // These boxes sit on the paved cap: their buried bottom faces cannot be seen.
    if(site && geometry.type==='BoxGeometry' && /paver|plant-bed|door-step/.test(name)){
      const ix=Array.from(geometry.index.array);geometry.setIndex(ix.filter((_,i)=>i<18||i>=24));
    }
    // Transom ends terminate inside the jambs, so their two buried end caps are redundant.
    if(name==='frame-transom' && geometry.index)geometry.setIndex(Array.from(geometry.index.array).slice(12));
    let g=geometry;if(g.index){g=g.toNonIndexed();geometry.dispose();}
    if(!g.attributes.normal)g.computeVertexNormals();
    const a=g.attributes.position,count=a.count,c=new THREE.Color(colour),rgb=[],uv=[];
    for(let i=0;i<count;i++){
      const x=a.getX(i),y=a.getY(i),z=a.getZ(i),drift=1+(v.unit(6600+features.length%103)-.5)*.10;
      const grain=(role==='wall'||role==='planting')? .96+.04*Math.sin(x*3.1+z*4.3+y*2):1;
      const gain={ground:.67,planting:.62,joinery:.55}[role]??1;
      rgb.push(c.r*drift*grain*gain,c.g*drift*grain*gain,c.b*drift*grain*gain);uv.push((x+z)*.38,y*.38);
    }
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    g.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));
    g.setAttribute('i2Brick',new THREE.Float32BufferAttribute(new Float32Array(count).fill(brick),1));
    g.name=`i2-${name}`;g.computeBoundingBox();
    features.push({name:g.name,role,site,vertexStart:offsets[role]??0,vertexCount:count,
      bounds:[g.boundingBox.min.toArray(),g.boundingBox.max.toArray()]});
    offsets[role]=(offsets[role]??0)+count;counts[site?'lot':'building']+=count/3;
    if(!groups.has(role))groups.set(role,[]);groups.get(role).push(g);return g;
  };
  // Boxes use a bottom datum, keeping every support/step relationship explicit.
  const box=(w,h,d,x,y,z,role,name,colour,brick)=>{
    const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y+h/2,z);return put(g,role,name,colour,brick);
  };
  const rod=(a,b,t,role,name,colour)=>{
    const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av);
    const g=new THREE.BoxGeometry(t,delta.length(),t);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
    g.translate(...av.add(bv).multiplyScalar(.5).toArray());return put(g,role,name,colour);
  };
  const slope=(w,t,x,z1,y1,z2,y2,role,name,colour)=>{
    const g=new THREE.BoxGeometry(w,t,Math.hypot(z2-z1,y1-y2));
    g.rotateX(Math.atan2(y1-y2,z2-z1));g.translate(x,(y1+y2)/2,(z1+z2)/2);return put(g,role,name,colour);
  };
  const extrude=(points,depth,x,y,z,role,name,colour)=>{
    const s=new THREE.Shape();points.forEach(([a,b],i)=>i?s.lineTo(a,b):s.moveTo(a,b));s.closePath();
    const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false,steps:1});g.translate(x,y,z);return put(g,role,name,colour);
  };
  const opening=(x,y,w,h,door=false,colour=joinery[0],unit=0)=>{
    const recess=.32,gz=F-recess;
    const pivot={x:x-w/2+.08,y,z:gz},leafParts=[];
    const leaf=(g,role)=>{
      if(!door)return;
      groups.get(role).pop();offsets[role]-=g.attributes.position.count;
      const f=features.at(-1);f.interactive=true;f.vertexStart=null;
      // board.js subtracts the pivot when it creates the hinge; retain building-local vertices.
      leafParts.push({geometry:g,material:p[role]});
    };
    apertures.push({x,y,w,h,wallZ:F,glassFront:gz+.025,door,unit});counts.openings++;
    const backer=new THREE.PlaneGeometry(w,h);backer.translate(x,y+h/2,gz-.07);
    put(backer,'plinth','room-back','#171915');
    for(const s of [-1,1])box(.09,h,.34,x+s*(w/2-.045),y,F-.18,'trim','opening-return');
    box(w,.10,.34,x,y+h-.10,F-.18,'trim','opening-soffit');
    leaf(box(w-.14,h-.14,.04,x,y+.07,gz,'glass','recessed-glass'),'glass');
    for(const s of [-1,1])leaf(box(.085,h,.105,x+s*(w/2-.06),y,gz+.07,'joinery','frame-jamb',colour),'joinery');
    for(const yy of [y,y+h-.09,y+h*.68])leaf(box(w-.12,.085,.10,x,yy,gz+.07,'joinery','frame-transom',colour),'joinery');
    box(w+.24,.14,.32,x,y-.06,F+.02,'trim','opening-sill');
    if(door){
      // The entire glazed door moves about its hinge, exclusively in opening.parts.
      leaf(box(w-.17,.64,.085,x,y+.08,gz+.09,'joinery','door-panel',colour),'joinery');
      leaf(box(.055,.13,.09,x+w*.28,y+1.0,gz+.17,'trim','door-handle','#bd9f64'),'trim');
      openings.push({id:`i2-door-${unit}`,kind:'door',label:`Shop ${unit+1} entrance`,
        pivot,axis:'y',openAngle:-1.05,parts:leafParts,
        pick:{cx:w/2-.08,cy:h/2,cz:.06,w,h,d:.38}});
    }else{
      box(.065,h-.12,.10,x,y+.06,gz+.07,'joinery','sash-mullion',colour);
      // Display mullions and small warm reflected highlights break the dark pane's field.
      if(y<1)for(let k=0;k<3;k++)box(.12,.25+.10*(k%2),.02,x+(k-1)*w*.22,y+.13,gz+.033,
        'glass','display-reflection',['#514228','#75613c','#334137'][k]);
    }
    return {x,y,w,h};
  };
  const shell=(x,width,holes,colour,brick)=>{
    const ys=[y0,H,...holes.flatMap(o=>[o.y,o.y+o.h])].sort((a,b)=>a-b);
    for(let k=0;k<ys.length-1;k++){
      const lo=ys[k],hi=ys[k+1];if(hi-lo<.001)continue;
      const gaps=holes.filter(o=>o.y<(lo+hi)/2&&o.y+o.h>(lo+hi)/2).sort((a,b)=>a.x-b.x);
      let left=x-width/2;
      for(const o of [...gaps,{x:x+width/2,w:0}]){
        const right=o.x-o.w/2;if(right-left>.001)box(right-left,hi-lo,.40,(right+left)/2,lo,F-.20,'wall','facade',colour,brick);
        left=o.x+o.w/2;
      }
    }
  };
  box(W,H-y0,.26,0,y0,B+.13,'wall','rear-wall',facades[0],1);
  box(.26,H-y0,D,W/2-.13,y0,cz,'wall','flank-wall',facades[0],1);
  box(W,.13,D,0,y0,cz,'plinth','interior-floor');
  for(const side of [-1,1])box(.16,.51,D,side*(W/2+.035),y0,cz,'plinth','base-course',undefined,1);
  box(W,.51,.14,0,y0,B-.025,'plinth','base-course',undefined,1);
  for(let i=0;i<n;i++){
    const x=-W/2+U*(i+.5),tone=(i+facade)%4,wall=facades[tone],paint=joinery[tone];
    const doorX=x-U*.29,windowX=x+U*.19,dw=Math.min(.77,U*.28),ww=U*.49;
    const holes=[opening(doorX,y0+.08,dw,2.32,true,paint,i),opening(windowX,y0+.61,ww,1.83,false,paint,i)];
    const upperBase=3.82,upperStep=(H-upperBase)/(storeys-1);
    for(let floor=0;floor<storeys-1;floor++)for(const side of [-1,1]){
      const h=Math.min(1.83,upperStep-.48),y=upperBase+floor*upperStep;
      holes.push(opening(x+side*U*.215,y,U*.245,h,false,paint,i));
      box(U*.245+.19,.17,.16,x+side*U*.215,y+h+.025,F+.04,'trim','stone-lintel');
    }
    shell(x,U,holes,wall,tone>=2?1:0);
    if(i)box(.14,H-y0,D,x-U/2,y0,cz,'wall','party-wall',wall,1);
    box(ww+.12,.52,.17,windowX,y0,F+.025,'plinth','stallboard',undefined,1);
    box(ww+.20,.07,.25,windowX,y0+.52,F+.06,'trim','stallboard-cap','#a59b80');
    // Solid gable on the wall heads, behind the parapet: 0.9 m rise, closed ends, seated stack.
    const half=U*.5-.16,rise=.90,yEave=H-.06,z0=B+.06,z1=F-.30,run=z1-z0;
    const xL=x-half,xR=x+half,yR=yEave+rise,zR=z0+run,P=[
      [xL,yEave,z0],[xR,yEave,z0],[x,yR,z0],[xL,yEave,zR],[xR,yEave,zR],[x,yR,zR]];
    const tri=(a,b,c)=>[...P[a],...P[b],...P[c]];
    const pitch=new THREE.BufferGeometry();
    pitch.setAttribute('position',new THREE.Float32BufferAttribute([
      ...tri(0,2,1),...tri(3,4,5),...tri(0,1,3),...tri(1,4,3),
      ...tri(0,3,2),...tri(3,5,2),...tri(1,2,4),...tri(2,5,4)],3));
    put(pitch,'roof','roof-pitch');
    box(.14,.20,Math.max(.08,run-.08),x,yEave+rise-.14,z0+run*.5,'roof','roof-ridge');
    const pitchSide=i%2===0?-1:1,stackW=.46,stackD=.36,lip=stackW*.5+.06;
    const reach=Math.min(half*.42,Math.max(0,half-lip-.04));
    const xs=x+pitchSide*reach,zc=z0+run*(.24+.13*i);
    const ySurf=yEave+rise*(1-Math.min(.96,(Math.abs(xs-x)+lip)/Math.max(half,.05)));
    const yBot=ySurf-.08,yTop=H+1.30;
    box(stackW+.12,.10,stackD+.10,xs,ySurf-.14,zc,'roof','chimney-saddle');
    box(stackW,Math.max(.24,yTop-yBot),stackD,xs,yBot,zc,'wall','chimney-stack',wall,1);
    box(stackW+.06,.12,stackD+.05,xs,yTop-.04,zc,'trim','chimney-cap');
    box(stackW*.38,.14,stackD*.38,xs,yTop+.04,zc,'metal','chimney-pot');
    for(const side of [-1,1])box(.16,.99,D,x+side*(U/2-.08),H-.98,cz,'wall','roof-party-upstand',wall);
    box(U,1.12,.34,x,H-.12,F-.03,'wall','parapet-field',wall,tone>=2?1:0);
    for(const [dy,h,d] of [[-.18,.12,.49],[-.01,.075,.40],[.95,.10,.47]])
      box(U+.015,h,d,x,H+dy,F+.045,'trim','parapet-cornice');
    const signW=U*.78;
    box(signW,.70,.055,x,H+.08,F+.163,'trim','sign-tablet','#bbaa88');
    for(const s of [-1,1])box(.035,.73,.045,x+s*signW/2,H+.065,F+.201,'joinery','tablet-border','#645a45');
    for(const yy of [H+.065,H+.78])box(signW,.035,.045,x,yy,F+.201,'joinery','tablet-border','#645a45');
    // Alternating segmental, stepped, round and pediment crowns, all seated on the coping.
    const cw=U*.34,base=H+1.04,points=[[-cw,0],[cw,0]];
    if(i%4===0||i%4===2){
      for(let k=0;k<=10;k++){const a=k*Math.PI/10;points.push([Math.cos(a)*cw,Math.sin(a)*(i===2?.53:.28)]);}
    }else if(i%4===1)points.push([cw,.23],[-cw,.23]);
    else points.push([0,.50]);
    extrude(points,.28,x,base,F-.16,'wall','parapet-crown',wall);
    for(let k=1;k<points.length-1;k++)rod([x+points[k][0],base+points[k][1]+.04,F+.16],
      [x+points[k+1][0],base+points[k+1][1]+.04,F+.16],.08,'trim','crown-coping');
    for(const s of [-1,1]){
      const px=x+s*(U/2-.10);
      box(.17,H+.98-groundHead,.24,px,groundHead,F+.08,'wall','pilaster',wall);
      for(const yy of [groundHead,H-.14,H+.96])box(.26,.11,.32,px,yy,F+.12,'trim','pilaster-cap');
    }
    for(let k=0;k<6;k++)box(.085,.09,.13,x-U*.40+k*U*.16,H-.23,F+.25,'trim','dentil');
    // Real sheet / seam clearance and continuous gutter. Brackets take load back to piers.
    slope(U-.05,.075,x,F-.06,awningBack,awningZ,awningFront,'metal','awning-sheet',AWNINGS[tone]);
    const seamLift=.061/Math.cos(Math.atan2(awningBack-awningFront,awningZ-F+.06));
    for(let k=0;k<7;k++)slope(.033,.047,x-U*.46+k*U*.153,F-.06,awningBack+seamLift,
      awningZ,awningFront+seamLift,'metal','awning-seam',AWNINGS[tone]);
    box(U,.13,.14,x,awningFront-.10,awningZ+.045,'metal','gutter',AWNINGS[tone]);
    box(U,.12,.13,x,awningBack-.14,F+.03,'joinery','awning-wallplate',paint);
    for(const s of [-1,1]){
      const px=x+s*(U/2-.10);
      rod([px,2.30,F+.03],[px,awningFront-.08,awningZ-.05],.055,'joinery','awning-bracket',paint);
      box(.08,2.58,.08,px,y0,F+.20,'joinery','downpipe',paint);
      box(.12,.11,.22,px,y0,F+.27,'joinery','downpipe-shoe',paint);
    }
    site=true;
    box(dw+.20,.10,.32,doorX,.10,F+.13,'ground','door-step');
    site=false;
  }
  // The end shop turns the corner: a punched side display and upper sash beneath a return awning.
  // Build in the frontage basis, then rotate the complete assembly together onto the left flank.
  const starts=new Map([...groups].map(([role,geos])=>[role,geos.length])),featureStart=features.length;
  const sideHoles=[opening(F-1.48,y0+.61,1.45,1.83,false,joinery[facade],0),
    opening(F-1.48,3.82,.85,1.83,false,joinery[facade],0)];
  shell(cz,D,sideHoles,facades[facade],facade>=2?1:0);
  const projection=Math.min(1.12,(lotW-W)/2-.30),sx=F-1.385,sideEnd=F+projection;
  slope(2.65,.075,sx,F-.06,awningBack,sideEnd,awningFront,'metal','return-awning',AWNINGS[facade]);
  const returnLift=.061/Math.cos(Math.atan2(awningBack-awningFront,sideEnd-F+.06));
  for(let k=0;k<6;k++)slope(.033,.047,sx-1.25+k*.50,F-.06,awningBack+returnLift,
    sideEnd,awningFront+returnLift,'metal','return-awning-seam',AWNINGS[facade]);
  box(2.65,.13,.14,sx,awningFront-.10,sideEnd+.045,'metal','return-gutter',AWNINGS[facade]);
  for(const u of [sx-1.18,sx+1.18])rod([u,2.30,F+.03],[u,awningFront-.08,sideEnd-.05],.055,
    'joinery','return-bracket',joinery[facade]);
  const transform=new THREE.Matrix4().makeRotationY(-Math.PI/2);
  transform.setPosition(F-W/2,0,0);
  for(const [role,geos] of groups)for(const g of geos.slice(starts.get(role)??0))g.applyMatrix4(transform);
  for(const f of features.slice(featureStart)){
    const bounds=new THREE.Box3(new THREE.Vector3(...f.bounds[0]),new THREE.Vector3(...f.bounds[1])).applyMatrix4(transform);
    f.bounds=[bounds.min.toArray(),bounds.max.toArray()];f.face='left';
  }
  for(const a of apertures.slice(-2)){a.face='left';a.sideWallX=-W/2;a.sideGlassX=-W/2+.295;a.sideZ=a.x;}
  // Splayed corner sheet joins the two awnings continuously, rather than leaving an open elbow.
  const ca=[-W/2+.06,awningBack,F-.06],cb=[-W/2+.06,awningFront,awningZ],
    cc=[-W/2-projection,awningFront,F-.06],corner=[ca,cb,cc],bottom=corner.map(a=>[a[0],a[1]-.075,a[2]]),cp=[];
  const triangle=(a,b,c)=>cp.push(...a,...b,...c);
  triangle(ca,cc,cb);triangle(...bottom);
  for(let i=0;i<3;i++){const j=(i+1)%3;triangle(corner[i],corner[j],bottom[i]);triangle(corner[j],bottom[j],bottom[i]);}
  const cg=new THREE.BufferGeometry();cg.setAttribute('position',new THREE.Float32BufferAttribute(cp,3));
  put(cg,'metal','splayed-awning-corner',AWNINGS[facade]);
  rod([cb[0],cb[1]-.05,cb[2]],[cc[0],cc[1]-.05,cc[2]],.12,'metal','splayed-gutter',AWNINGS[facade]);
  for(const t of [.33,.66])rod([ca[0],ca[1]+.02,ca[2]],
    [cb[0]*(1-t)+cc[0]*t,awningFront+.02,cb[2]*(1-t)+cc[2]*t],.05,'metal','splayed-seam',AWNINGS[facade]);
  // Lot remains within the kit's 15 m pad, including planted side passage and pickets.
  site=true;put(tile(lotW,lotD),'plinth','board-bevel');
  // The paving cap shares the clipped plan; square slab corners would float over the bevel.
  put(tile(lotW-.36,lotD-.36,.065,.13,.025),'ground','paved-cap');
  const pavementStart=F+.32,pavementEnd=lotD/2-.25;
  const rows=Math.max(2,Math.ceil((pavementEnd-pavementStart)/.60)),cols=20;
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const pw=(lotW-1.04)/cols,pd=(pavementEnd-pavementStart)/rows;
    box(pw-.025,.035,pd-.025,-(lotW-1.04)/2+pw*(col+.5),.133,pavementStart+pd*(row+.5),
      'ground','front-paver',undefined);
  }
  const pathX=-(lotW/2+W/2)/2+.08,gardenLeft=-lotW/2+.34,gardenRight=-W/2-.16;
  for(let row=0;row<12;row++)box(.68,.035,.56,pathX,.133,B+.38+row*(F-B)/12,'ground','side-path-paver');
  const leaf=(x,y,z,r,salt)=>{
    const pos=[];
    for(let k=0;k<7;k++){
      const a=k*2.399+salt*.73,dx=Math.cos(a)*r,dz=Math.sin(a)*r;
      const root=[x+dx*.30,y+(k%3)*r*.09,z+dz*.30],tip=[x+dx,y+r*.68,z+dz];
      pos.push(...root,x+dx*.64-dz*.18,y+r*.42,z+dz*.64+dx*.18,...tip,
        ...root,...tip,x+dx*.64+dz*.18,y+r*.30,z+dz*.64-dx*.18);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    // Prune the canopy against its lot boundary; never let leaf tips enter the neighbour.
    const a=g.attributes.position;
    for(let i=0;i<a.count;i++)a.setX(i,Math.max(-lotW/2+.20,Math.min(-W/2-.15,a.getX(i))));
    put(g,'planting','leaf-cluster',salt%3===0?'#89944c':pigment.planting);
  };
  for(let k=0;k<20;k++){
    const x=k%2?gardenLeft+.16:gardenRight-.12,z=B+.3+v.unit(6700+k)*(D-.6);
    box(.30,.06,.48,x,.13,z,'planting','plant-bed','#444b29');
    leaf(x,.32+v.unit(6750+k)*.3,z,.25+v.unit(6760+k)*.15,k);
    for(let j=0;j<3;j++){
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([
        x-.025+j*.06,.18,z,x+.025+j*.06,.18,z,x+.09+j*.06,.43+j*.06,z+.05],3));
      put(g,'planting','grass-tuft','#8d9459');
    }
  }
  for(let tree=0;tree<2;tree++){
    const tx=gardenLeft+.40,tz=B+1.5+tree*3.5,th=3.0+tree*.45;
    rod([tx,.15,tz],[tx+.13,th,tz+.1],.10,'joinery','tree-trunk','#5a4b32');
    for(let k=0;k<6;k++){
      const a=k*2.399,rr=.38+(k%3)*.13,bx=tx+Math.cos(a)*rr,bz=tz+Math.sin(a)*rr,by=th-.65+(k%3)*.35;
      rod([tx+.08,th*.57,tz],[bx,by,bz],.045,'joinery','tree-branch','#5a4b32');
      for(let j=0;j<3;j++)leaf(bx+Math.cos(j*2.1)*.19,by+j*.12,bz+Math.sin(j*2.1)*.19,.40,k+j*3);
    }
  }
  const fenceZ=F+.28,gateW=.83,gateL=pathX-gateW/2,gateR=pathX+gateW/2;
  const fence=(x1,z1,x2,z2,gate=false)=>{
    const len=Math.hypot(x2-x1,z2-z1),num=Math.max(2,Math.floor(len/.17));
    for(const yy of [.40,.96])rod([x1,yy,z1],[x2,yy,z2],.065,'trim',gate?'gate-rail':'fence-rail','#b5af91');
    for(let i=0;i<num;i++){
      const f=(i+.5)/num,x=x1+(x2-x1)*f,z=z1+(z2-z1)*f;
      extrude([[-.04,0],[.04,0],[.04,.88],[0,1.01],[-.04,.88]],.065,x,.19,z-.0325,
        'trim','pointed-picket','#bdb596');
    }
  };
  fence(gardenLeft,fenceZ,gateL-.05,fenceZ);fence(gateR+.05,fenceZ,gardenRight,fenceZ);
  fence(gateL+.05,fenceZ,gateR-.05,fenceZ,true);
  fence(gardenLeft,B+.15,gardenLeft,fenceZ);
  for(const [x,z] of [[gardenLeft,B+.15],[gardenLeft,fenceZ],[gateL-.08,fenceZ],[gateR+.08,fenceZ]]){
    box(.19,1.12,.21,x,.15,z,'wall','garden-post',facades[0]);box(.25,.10,.27,x,1.27,z,'trim','post-cap');
  }
  box(.08,.13,.06,gateR-.11,.81,fenceZ+.07,'joinery','gate-latch');
  // Corner flanks are dressed after every existing put(), so non-flank colour salts stay put.
  // shoptop-mixed never enters: its solid flank and side shell remain exactly as built.
  const dressCornerFlanks=()=>{
    if(archetypeId!=='shop-corner'&&archetypeId!=='shop-corner-victorian')return;
    const victorian=archetypeId==='shop-corner-victorian';
    const pierW=victorian?.28:.32,winW=victorian?1.08:1.16,winH=victorian?1.78:1.72;
    const revealD=.32,lintelH=victorian?.16:.12,wallT=.46,recess=.10;
    const z0=B+.02,z1=F-.18,span=z1-z0,winY=3.92;
    if(span<5.2||H<winY+winH+.20)return;
    const drop=pred=>{
      for(let i=features.length-1;i>=0;i--){
        const f=features[i];
        if(f.interactive||!pred(f))continue;
        const geos=groups.get(f.role);if(!geos)continue;
        let idx=0;
        for(let k=0;k<i;k++)if(features[k].role===f.role&&!features[k].interactive)idx++;
        const g=geos[idx];
        if(!g||g.name!==f.name)continue;
        geos.splice(idx,1);g.dispose();
        counts[f.site?'lot':'building']-=f.vertexCount/3;
        features.splice(i,1);
      }
    };
    drop(f=>f.name==='i2-flank-wall'||(f.face==='left'&&!/return-awning|return-gutter|return-bracket/.test(f.name)));
    for(let i=apertures.length-1;i>=0;i--)if(apertures[i].face==='left'){apertures.splice(i,1);counts.openings--;}
    const clear=(span-pierW*4)/3,yBase=y0+.48,colour=facades[facade],brick=facade>=2?1:0;
    const sillH=.11;
    site=false;
    const flank=(outward)=>{
      const outer=outward>0?W/2:-W/2,cx=outer-outward*wallT/2,mark=features.length;
      const lay=(w,h,d,x,y,z,role,name)=>box(w,h,d,x,y,z,role,name,
        role==='wall'?colour:pigment[role],role==='wall'?brick:0);
      for(let i=0;i<4;i++){
        const zPier=z0+i*(pierW+clear),zEnd=zPier+pierW,neck=F-.36;
        // The front pier used to stop at the pre-R30 inner face. Past the shopfront
        // panes (exterior face F-.30) a 0.46 m return blocks those rays.
        if(zEnd<=neck){
          lay(wallT,H-yBase,pierW,cx,yBase,zPier+pierW/2,'wall','flank-pier');
          continue;
        }
        const rear=neck-zPier;
        if(rear>.015)lay(wallT,H-yBase,rear,cx,yBase,zPier+rear/2,'wall','flank-pier');
        const capT=outward>0?.26:.40,capC=outer-outward*capT/2;
        const cap0=rear>.015?neck-.012:Math.max(zPier,neck),capD=zEnd-cap0;
        if(capD>.015)lay(capT,H-yBase,capD,capC,yBase,cap0+capD/2,'wall','flank-return');
      }
      for(let i=0;i<3;i++){
        const bayL=z0+pierW+i*(pierW+clear),bayR=bayL+clear,mid=(bayL+bayR)/2;
        const cheek=(clear-winW)/2,belowH=winY-yBase,aboveH=H-(winY+winH);
        // Full-depth jambs, sill and soffit. The pane sits 0.32 m behind the outer face.
        lay(wallT,winH+.06,cheek,cx,winY-.03,bayL+cheek/2,'wall','flank-jamb');
        lay(wallT,winH+.06,cheek,cx,winY-.03,bayR-cheek/2,'wall','flank-jamb');
        if(aboveH>.02)lay(wallT,aboveH,clear,cx,winY+winH,mid,'wall','flank-spandrel');
        lay(wallT,.10,winW+.12,cx,winY+winH-.08,mid,'trim','flank-soffit');
        lay(wallT+.02,lintelH,winW+.16,cx+outward*.01,winY+winH-.02,mid,'trim','flank-lintel');
        lay(wallT+.024,sillH,winW+.10,cx+outward*.012,winY-.03,mid,'trim','flank-sill');
        if(i===1&&belowH>2.1){
          const panelH=1.16,panelW=Math.min(1.24,winW-.04),panelY=yBase+.50;
          const leafT=wallT-recess+.008,leafC=outer-outward*wallT+outward*leafT/2;
          const skinC=outer-outward*recess/2,sideW=(clear-panelW)/2;
          lay(leafT,belowH,clear,leafC,yBase,mid,'wall','flank-leaf');
          lay(recess,belowH,sideW,skinC,yBase,bayL+sideW/2,'wall','flank-skin');
          lay(recess,belowH,sideW,skinC,yBase,bayR-sideW/2,'wall','flank-skin');
          const underH=panelY-yBase,overH=winY-(panelY+panelH);
          if(underH>.02)lay(recess,underH,panelW,skinC,yBase,mid,'wall','flank-skin');
          if(overH>.02)lay(recess,overH,panelW,skinC,panelY+panelH,mid,'wall','flank-skin');
        }else lay(wallT,belowH,clear,cx,yBase,mid,'wall','flank-course');
        const paneFace=outer-outward*revealD,glassC=paneFace-outward*.01;
        const glassB=winY+.068,glassT=winY+winH-.068,glassH=glassT-glassB,glassW=winW+.02;
        lay(.02,glassH,glassW,glassC,glassB,mid,'glass','flank-glass');
        // wallZ/glassFront are along the outward normal, so the recess stays positive on both flanks.
        // sideWallX/sideGlassX are world-X surfaces: the outer wall and the exterior pane face, not the centre.
        apertures.push({x:mid,y:winY+.08,w:winW,h:winH-.16,wallZ:outward*outer,glassFront:outward*paneFace,
          door:false,unit:0,face:outward>0?'right':'left',sideWallX:outer,sideGlassX:paneFace,sideZ:mid});
        counts.openings++;
      }
      for(const f of features.slice(mark))f.face=outward>0?'right':'left';
    };
    flank(1);flank(-1);
    const cursor={};
    for(const f of features){
      if(f.interactive){f.vertexStart=null;continue;}
      f.vertexStart=cursor[f.role]??0;cursor[f.role]=f.vertexStart+f.vertexCount;
    }
  };
  dressCornerFlanks();
  const parts=[];
  for(const [role,geos] of groups){
    const geometry=mergeGeometries(geos,false);if(!geometry)throw new Error(`I2 merge failed: ${role}`);
    for(const g of geos)g.dispose();geometry.name=`i2-${role}`;
    geometry.computeBoundingBox();geometry.computeBoundingSphere();parts.push({geometry,material:p[role]});
  }
  for(const opening of openings){
    const byMaterial=new Map();
    for(const part of opening.parts){
      if(!byMaterial.has(part.material))byMaterial.set(part.material,[]);
      byMaterial.get(part.material).push(part.geometry);
    }
    opening.parts=[...byMaterial].map(([material,geos])=>{
      const geometry=mergeGeometries(geos,false);for(const g of geos)g.dispose();
      geometry.computeBoundingBox();geometry.computeBoundingSphere();return {geometry,material};
    });
  }
  const hand=normaliseHand(opts.hand);
  if(hand==='left'&&isHanded(archetypeId))mirrorModelX(parts,openings);
  const bounds=new THREE.Box3();for(const part of parts)bounds.union(part.geometry.boundingBox);
  return {parts,openings,size:bounds.getSize(new THREE.Vector3()),frameBox:bounds.clone(),
    source:'commercial-kit',kit:true,fallback:false,archetypeId,hand,form:'commercial',
    p17B7:{sheet:'shopfront-row',signals:SIGNALS,plinthChamferM:.18,plinthBevelM:.18},
    p17RoofPlant:{kind:'nothing',heightM:0,areaFrac:0,areaM2:0},
    i2:{features,counts,apertures,env,semanticRoles:Object.keys(pigment),awning:{backY:awningBack,frontY:awningFront,
      backZ:F-.06,frontZ:awningZ,seamClearance:0},hand}};
}
