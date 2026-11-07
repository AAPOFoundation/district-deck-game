// P19 AB-B: terrace sheet construction. Dimensions come only from the residential envelope.
// Nine merged buckets; colour varies per dwelling/stone/course without additional draws.
import * as THREE from 'three';
import { restyleColour, restyleColours, readRestyle } from '../style/restyle.js';
import { box, slab, rotBox, hip, cyl } from './core.js';

const COLOURS = Object.freeze({
  wall: '#9e6950', wallAlt: '#bdae8e', trim: '#e1ceb0', roof: '#657078',
  iron: '#444438', glass: '#18201e', shadow: '#4b4842', ground: '#969084', foliage: '#657244',
});
const PAINT = ['#7d8060', '#535c59', '#8c5143'];
const CANOPY = ['#adb099', '#7c8586', '#b27863'];
const FACADE = ['#c5b18b', '#bbb6a6', '#ceb385'];
const SIGNALS = {
  'lot-bevel': 'p17-b7-lot-plinth-bevel', 'base-course': 'p17-b7-plinth-course',
  'window-frame': 'p17-b7-opening-frame', 'lace': 'p17-b7-lace-member',
  'canopy-seam': 'p17-b7-verandah-seam', 'coping': 'p17-b7-parapet-coping',
};

/** Convex eight-corner board tile with a genuine sloping upper edge and cut corners. */
function tileGeometry(w, d, z, bottom, top, bevel, name) {
  const ring = (inset, y) => {
    const x=w/2-inset, q=d/2-inset, c=.32;
    return [[-x+c,y,z-q],[x-c,y,z-q],[x,y,z-q+c],[x,y,z+q-c],
      [x-c,y,z+q],[-x+c,y,z+q],[-x,y,z+q-c],[-x,y,z-q+c]];
  };
  const rings=[ring(0,bottom),ring(0,top-bevel),ring(bevel,top)];
  const positions=[];const triangle=(a,b,c)=>positions.push(...a,...b,...c);
  for(let r=0;r<2;r++)for(let i=0;i<8;i++){
    const j=(i+1)%8;triangle(rings[r][i],rings[r+1][i],rings[r][j]);
    triangle(rings[r][j],rings[r+1][i],rings[r+1][j]);
  }
  for(let i=1;i<7;i++){triangle(rings[2][0],rings[2][i+1],rings[2][i]);triangle(rings[0][0],rings[0][i],rings[0][i+1]);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(positions.flatMap((_,i)=>i%3===0?[positions[i]/w,positions[i+2]/d]:[]),2));
  g.computeVertexNormals();g.name=name;return g;
}

function buildTerrace(ctx) {
  // P17: the white material bypasses the atlas snap; these vertex palettes own albedo.
  const id = `building:${ctx.archetypeId}`;
  const restyle = readRestyle(globalThis.location?.search ?? '').enabled;
  const colours = { ...COLOURS,
    ground: restyleColour(COLOURS.ground, '#bcb5a6', { id: `${id}.ground` }),
    trim: restyleColour(COLOURS.trim, '#c6b59b', { id: `${id}.trim` }),
    iron: restyleColour(COLOURS.iron, '#1a1a15', { id: `${id}.iron` }),
  };
  const facades = restyleColours(FACADE, ['#b9a683', '#b0ab9c', '#c1a87d'], { id: `${id}.facade` });
  const paints = restyleColours(PAINT, ['#363729', '#222624', '#3d231d'], { id: `${id}.paint` });
  const canopies = restyleColours(CANOPY, ['#4d4f44', '#363a3a', '#50362c'], { id: `${id}.canopy` });
  const {bodyW:W,wallH:H,storeyH:floorH,units,backZ,frontZ,lotW,lotD,facade}=ctx.env;
  const U=W/units, y0=.14, porchD=1.34, front=frontZ-porchD, D=front-backZ, cz=(front+backZ)/2;
  const roofY=y0+H, roofH=1.58, balconyY=y0+floorH, canopyFront=roofY-.45, canopyBack=roofY-.08;
  const signals=new Set(),features=[],offsets={},counts={building:0,lot:0,openings:0,gates:0};
  let site=false;
  // Existing atlas maps, normals and the chained building-weather shader remain active.
  // Geometry carries the look palette so three roof/paint tones still use one material.
  for(const key of Object.keys(COLOURS)) {
    const mat=ctx.p[key];mat.userData.abbRole=key;mat.color.set('#ffffff');mat.vertexColors=true;mat.needsUpdate=true;
    if(key!=='glass'){mat.roughness=.92;mat.metalness=0;}
    if(key==='foliage') mat.side=THREE.DoubleSide;
    // The legacy shader reapplies its pre-vertex-colour target and doubles the tint.
    // Preserve atlas/wear hooks while letting this sheet's vertex palette own albedo.
    if(mat.userData.abbPalette) continue;
    mat.userData.abbPalette=true;
    const previous=mat.onBeforeCompile;
    mat.onBeforeCompile=(shader,renderer)=>{
      previous?.(shader,renderer);
      shader.fragmentShader=shader.fragmentShader
        .replace('diffuseColor.rgb *= ddResidentialTargetRatio;', '')
        .replace('diffuseColor *= sampledDiffuseColor;', 'diffuseColor *= vec4(vec3(dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), sampledDiffuseColor.a);');
      if(key==='glass' && shader.uniforms.ddResidentialShadowFloor) shader.uniforms.ddResidentialShadowFloor.value=.008;
      if(key==='glass') shader.fragmentShader=shader.fragmentShader.replace(
        'diffuseColor.rgb = mix( ddPaneSill, ddPaneHead, smoothstep( 0.05, 0.95, ddPane ) );',
        'diffuseColor.rgb *= mix(0.65, 1.2, smoothstep(0.05, 0.95, ddPane));');
    };
    const oldKey=mat.customProgramCacheKey.bind(mat);
    mat.customProgramCacheKey=()=>`${oldKey()}-abb-vertex-albedo-${key}`;
    if (restyle && ctx.archetypeId === 'terrace-carlton-heritage' && key === 'wallAlt') {
      // R3: lift the capped vertex field; limit only its bright albedo tail after
      // inherited texture/weather terms and physical-material setup, before lighting.
      const previousCompile = mat.onBeforeCompile, previousKey = mat.customProgramCacheKey;
      mat.onBeforeCompile = function (shader, renderer) {
        previousCompile.call(this, shader, renderer);
        const anchor = '#include <lights_fragment_begin>';
        if (shader.fragmentShader.split(anchor).length !== 2) throw new Error('Carlton render lighting anchor missing or ambiguous');
        shader.fragmentShader = shader.fragmentShader.replace(anchor,
          'material.diffuseColor *= min(1.0, 0.88 / max(max(material.diffuseColor.r, material.diffuseColor.g), max(material.diffuseColor.b, 0.000001)));\n' + anchor);
        // Round 2: B's only render owner is this wallAlt. The kit finish's
        // paint shoulder compresses the vertex lift; recover V66-67 towards77
        // after that shoulder, then contain the retained painted-tile tail.
        const output = '#include <tonemapping_fragment>';
        if (shader.fragmentShader.split(output).length !== 2) throw new Error('Carlton render output anchor missing or ambiguous');
        shader.fragmentShader = shader.fragmentShader.replace(output,
          'gl_FragColor.rgb *= 1.42;\n' +
          'gl_FragColor.rgb *= min(1.0, 0.88 / max(max(gl_FragColor.r, gl_FragColor.g), max(gl_FragColor.b, 0.000001)));\n' + output);
      };
      mat.customProgramCacheKey = () => `${previousKey()}|p17-carlton-render|p17-w2a-carlton-r2`;
    }
  }
  const put=(g,key,name=g.name,colour=colours[key],salt=0)=>{
    g.name=`abb-${name}`;
    if(site && /paver|picket|fence-post|entry-step|entry-landing|lawn/.test(name) && g.type==='BoxGeometry' && g.index) {
      const ix=Array.from(g.index.array);g.setIndex(ix.filter((_,i)=>i<18||i>=24));
    }
    const pos=g.attributes.position, c=new THREE.Color(colour), colours=[];
    if (ctx.archetypeId === 'terrace-single' && key === 'ground') {
      // Ruling 78: all res-ground vertices, including the lot field, V74-75 -> V66.
      c.copy(restyleColour(c, c.clone().multiplyScalar(0.76), { id: `${id}.groundResponse` }));
    }
    const drift=(1+(ctx.v.unit(470+salt%100)-.5)*.10) * ({wallAlt:2.5,roof:1.3,foliage:2.8,ground:1.15}[key]??1);
    for(let i=0;i<pos.count;i++){
      // Tonal drift and rising damp are attached to masonry, never floating decal cards.
      const y=pos.getY(i),x=pos.getX(i),z=pos.getZ(i);
      const damp=(key==='wall'||key==='wallAlt') ? .74+.26*Math.min(1,Math.max(0,(y-y0)/.85)):1;
      const mottled=(key==='wall'||key==='wallAlt') ? .96+.04*Math.sin(x*1.7+z*.8+y*2.3):1;
      if (restyle && key === 'wallAlt') {
        const tone = c.clone().multiplyScalar(drift*damp*mottled);
        // R72: raise the low render field, but keep the exposed upper/parapet
        // vertices at linear 0.72; Carlton's R3 lift and tail bound are applied separately.
        const peak = Math.max(tone.r, tone.g, tone.b);
        // Ruling 78: owner median V66 -> V77, x1.415 linear over R3.
        const lift = ctx.archetypeId === 'terrace-carlton-heritage' ? 1.91 : 1;
        const selected = restyleColour(tone, tone.clone().multiplyScalar(lift * Math.min(1.36, .72 / Math.max(peak, 1e-6))),
          { id: `${id}.renderResponse` });
        colours.push(selected.r, selected.g, selected.b);
      } else colours.push(c.r*drift*damp*mottled,c.g*drift*damp*mottled,c.b*drift*damp*mottled);
    }
    g.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
    const tris=(g.index?.count??pos.count)/3;counts[site?'lot':'building']+=tris;
    g.computeBoundingBox();
    features.push({name:g.name,role:key,vertexStart:offsets[key]??0,vertexCount:tris*3,triangles:tris,site,bounds:[g.boundingBox.min.toArray(),g.boundingBox.max.toArray()]});
    offsets[key]=(offsets[key]??0)+tris*3;
    for(const [token,signal] of Object.entries(SIGNALS))if(name.includes(token))signals.add(signal);
    // Push directly: the shared context remaps antique warm-room cards, whereas this builder
    // constructs a room light behind its own opaque, recessed glass body.
    ctx.parts.push({geometry:g,material:ctx.p[key]});return g;
  };
  const b=(w,h,d,x,y,z,key,name,colour,salt)=>put(slab(w,h,d,x,y,z),key,name,colour,salt);
  const rod=(a,bp,t,key,name,colour)=>{
    const aV=new THREE.Vector3(...a),bV=new THREE.Vector3(...bp),delta=bV.clone().sub(aV);
    const g=new THREE.BoxGeometry(t,delta.length(),t);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));g.translate(...aV.add(bV).multiplyScalar(.5).toArray());put(g,key,name,colour);
  };
  const ring=(x,y,z,rx,ry,key,name,colour,segments=8)=>{
    // A continuous triangular-section casting: closed openwork, six triangles per
    // segment instead of twelve for overlapping capped boxes.
    const positions=[];
    const point=(i,k)=>{
      const a=i*Math.PI*2/segments, cross=k*Math.PI*2/3;
      const offset=Math.cos(cross)*.026;
      return [x+Math.cos(a)*(rx+offset),y+Math.sin(a)*(ry+offset),z+Math.sin(cross)*.026];
    };
    for(let i=0;i<segments;i++)for(let k=0;k<3;k++){
      const a=point(i,k),b=point(i+1,k),c=point(i,(k+1)%3),d=point(i+1,(k+1)%3);
      positions.push(...a,...b,...c,...b,...d,...c);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));g.computeVertexNormals();put(g,key,name,colour);
  };
  const roofPlane=(w,t,x,z0,yA,z1,yB,key,name,colour)=>{
    // Positive X rotation drops +Z. core.skillion's opposite pitch would invert the canopy.
    put(rotBox(w,t,Math.hypot(z1-z0,yA-yB),x,(yA+yB)/2,(z0+z1)/2,{x:Math.atan2(yA-yB,z1-z0)}),key,name,colour);
  };
  const opening=(x,y,w,h,door,paint)=>{
    counts.openings++;
    const reveal=.34, gz=front-reveal, frame=.12;
    b(w,h,.05,x,y,gz-.03,'shadow','room-back');
    b(w-.08,h-.08,.065,x,y+.04,gz,'glass','window-glass');
    for(const s of [-1,1]){
      b(.08,h,reveal,x+s*(w/2-.04),y,front-reveal/2,'shadow','reveal-return');
      b(frame,h+.12,.20,x+s*(w/2+.01),y-.03,front-.055,'trim','window-frame');
    }
    b(w+.24,frame,.24,x,y+h-.03,front-.02,'trim','window-frame-head');
    b(w+.30,.13,.34,x,y-.07,front+.025,'trim','window-frame-sill');
    if(door){
      b(w-.16,h-.1,.06,x,y+.04,gz+.055,'iron','door-leaf',paint);
      for(const py of [.30,1.1])b(w-.38,.55,.055,x,y+py,gz+.10,'iron','door-panel',paint);
      b(.055,.055,.06,x+w*.25,y+.95,gz+.15,'trim','door-knob','#b59d63');
    }else{
      b(.065,h-.1,.065,x,y+.05,gz+.10,'iron','window-mullion',paint);
      b(w-.1,.075,.065,x,y+h*.53,gz+.10,'iron','window-transom',paint);
      // Restrained amber interior strips occupy only a fraction of each dark pane.
      b(w*.13,h*.70,.014,x-w*.28,y+h*.13,gz+.04,'glass','warm-lit-interior','#7a5225');
      b(w*.13,h*.45,.014,x+w*.28,y+h*.33,gz+.04,'glass','warm-lit-interior','#a06b30');
    }
    return {x,y,w,h};
  };
  const shell=(x,width,holes,colour)=>{
    const ys=[y0,roofY,...holes.flatMap(o=>[o.y,o.y+o.h])].sort((a,b)=>a-b);
    for(let yi=0;yi<ys.length-1;yi++){
      const lo=ys[yi],hi=ys[yi+1];if(hi-lo<.001)continue;
      const gaps=holes.filter(o=>o.y<(lo+hi)/2&&o.y+o.h>(lo+hi)/2).sort((a,b)=>a.x-b.x);
      let left=x-width/2;
      for(const o of [...gaps,{x:x+width/2,w:0}]){
        const right=o.x-o.w/2;
        if(right-left>.005)b(right-left,hi-lo,.43,(right+left)/2,lo,front-.215,'wallAlt','facade-panel',colour,yi);
        left=o.x+o.w/2;
      }
    }
  };

  // Rear and side envelopes meet the front shell; no solid box behind the glazing.
  b(W,H,.24,0,y0,backZ+.12,'wall','rear-wall');
  for(const side of [-1,1])b(.24,H,D,side*(W/2-.12),y0,cz,'wall','brick-party-wall');
  b(W,.14,D,0,y0,cz,'shadow','ground-room-floor');
  b(W,.12,D,0,balconyY-.12,cz,'shadow','upper-room-floor');
  // Dark masonry wraps all elevations and has a slightly proud drip course.
  for(const z of [front+.025,backZ-.02])b(W+.12,.37,.13,0,y0,z,'shadow','base-course');
  for(const side of [-1,1])b(.13,.37,D,side*(W/2+.025),y0,cz,'shadow','base-course');
  b(W,.07,.16,0,y0+.37,front+.045,'ground','base-course-cap');

  for(let unit=0;unit<units;unit++){
    const ux=-W/2+U*(unit+.5),tone=(unit+facade)%3,paint=paints[tone],wall=facades[tone];
    const doorX=ux-U*.25,winX=ux+U*.19;
    const holes=[opening(doorX,y0+.12,.88,2.25,true,paint),opening(winX,y0+.60,Math.min(1.38,U*.33),1.70,false,paint)];
    for(const off of [-.23,.23])holes.push(opening(ux+U*off,balconyY+.52,Math.min(1.13,U*.27),1.80,false,paint));
    shell(ux,U-.02,holes,wall);
    if(unit) b(.18,H,D,ux-U/2,y0,cz,'wall','internal-party-wall');

    // A narrow hipped slate roof per dwelling, with its long ridge along the lot depth.
    const rw=U-.08,rd=D+.12,ridge=rd*.58;
    const hipG=hip(rd,rw,roofH,ridge,0,roofY,0,'slate-hip');hipG.rotateY(Math.PI/2);hipG.translate(ux,0,cz);put(hipG,'roof','slate-hip');
    const pitch=Math.atan2(roofH,rw/2),n=ctx.q==='low'?5:8;
    for(const side of [-1,1])for(let row=0;row<n;row++){
      const f=(row+.5)/n,xx=ux+side*rw/2*(1-f),yy=roofY+roofH*f;
      const len=rd-(rd-ridge)*f;
      put(rotBox(.052,.035,len,xx,yy+.025,cz,{z:side*pitch}),'roof','slate-course',undefined,row);
    }
    b(.16,.13,ridge,ux,roofY+roofH-.035,cz,'trim','ridge-cap','#aa9580');
    // Paired terracotta pots on a masonry shaft, visibly above the ridge.
    const chimneyX=ux-U*.36,chimneyZ=cz-D*.08,chimneyBase=roofY+.32,ch=1.96;
    b(.50,ch,.65,chimneyX,chimneyBase,chimneyZ,'wallAlt','chimney-shaft',restyleColour('#baaa8e', '#afa085', { id: `${id}.chimney` }));
    for(const [dy,w] of [[0,.58],[.10,.68]])b(w,.10,.77,chimneyX,chimneyBase+ch+dy,chimneyZ,'trim','chimney-coping');
    for(const s of [-1,1]){
      const pot=cyl(.10,.38,chimneyX+s*.15,chimneyBase+ch+.39,chimneyZ,'y','chimney-pot',6);put(pot,'wall','chimney-pot','#ae7046');
      put(cyl(.12,.07,chimneyX+s*.15,chimneyBase+ch+.59,chimneyZ,'y','pot-rim',6),'wall','chimney-pot-rim','#885131');
      const hole=new THREE.CircleGeometry(.073,6);hole.rotateX(-Math.PI/2);hole.translate(chimneyX+s*.15,chimneyBase+ch+.633,chimneyZ);put(hole,'shadow','chimney-pot-hole','#25221d');
    }
    // Three-step parapet, dentils and a small segmental crown, all seated on masonry.
    b(U-.10,.66,.30,ux,roofY-.13,front+.04,'wallAlt','parapet',wall);
    for(const [dy,h,dep] of [[-.12,.13,.43],[.04,.10,.37],[.43,.12,.48]])b(U-.04,h,dep,ux,roofY+dy,front+.10,'trim','coping');
    for(let k=0;k<Math.floor(U/.36);k++)b(.11,.12,.14,ux-U/2+.16+k*.36,roofY-.05,front+.30,'trim','parapet-dentil');
    b(U*.34,.30,.24,ux,roofY+.50,front+.05,'wallAlt','parapet-tablet',wall);
    const crown=new THREE.Shape();const cw=U*.22; crown.moveTo(-cw,0);crown.lineTo(cw,0);for(let k=0;k<=8;k++){const a=k*Math.PI/8;crown.lineTo(Math.cos(a)*cw,Math.sin(a)*.24);}crown.closePath();
    const cg=new THREE.ExtrudeGeometry(crown,{depth:.20,bevelEnabled:false,steps:1,curveSegments:8});cg.translate(ux,roofY+.79,front-.05);put(cg,'trim','parapet-crown');

    const left=ux-U/2+.16,right=ux+U/2-.16,pz=frontZ-.08;
    b(U-.08,.16,porchD,ux,balconyY,front+porchD/2,'ground','balcony-deck');
    b(U-.08,.10,porchD,ux,y0,front+porchD/2,'ground','verandah-deck');
    for(const px of [left,ux,right]){
      b(.085,canopyFront-y0,.085,px,y0,pz,'iron','verandah-post',paint);
      for(const yy of [y0,balconyY,canopyFront-.18])b(.15,.10,.15,px,yy,pz,'iron','post-collar',paint);
    }
    for(const yy of [balconyY-.15,canopyFront-.12]){
      b(right-left,.14,.14,(left+right)/2,yy,pz,'iron','verandah-beam',paint);
      const cells=Math.min(6,Math.floor((right-left)/.54));
      for(let k=0;k<cells;k++){
        const x=left+(right-left)*(k+.5)/cells;
        ring(x,yy-.17,pz+.025,.16,.13,'iron','lace-frieze',paint,6);
        b(.032,.19,.04,x,yy-.36,pz+.025,'iron','lace-drop',paint);
      }
      for(const px of [left,right])rod([px,yy-.44,pz],[px+(px===left?.43:-.43),yy,pz],.045,'iron','lace-bracket',paint);
    }
    const railY=balconyY+.19;
    for(const yy of [railY,railY+.80])b(right-left,.065,.075,ux,yy,pz+.05,'iron','lace-rail',paint);
    const balN=Math.floor((right-left)/.48);
    for(let k=0;k<balN;k++){
      const x=left+(right-left)*(k+.5)/balN;
      ring(x,railY+.40,pz+.05,.18,.34,'iron','lace-balustrade',paint,8);
      b(.035,.78,.05,x,railY+.045,pz+.05,'iron','lace-standard',paint);
    }
    // Standing seams are raised boxes on exactly the same plane as the canopy sheet.
    roofPlane(U-.10,.085,ux,front-.06,canopyBack,frontZ+.12,canopyFront,'iron','canopy-sheet',canopies[tone]);
    const seamN=Math.round(U/.48);
    for(let k=0;k<=seamN;k++)roofPlane(.036,.065,ux-(U-.15)/2+(U-.15)*k/seamN,front-.04,canopyBack+.068,frontZ+.10,canopyFront+.068,'iron','canopy-seam',canopies[tone]);
    b(U-.08,.14,.12,ux,canopyFront-.10,frontZ+.14,'iron','canopy-gutter',paint);
    for(const px of [left,right]){
      b(.18,roofY+.58-y0,.22,px,y0,front+.13,'trim','party-pilaster');
      b(.30,.10,.34,px,roofY+.58,front+.13,'trim','party-pilaster-cap');
    }
    b(.07,canopyFront-y0,.07,right,y0,frontZ+.10,'iron','downpipe',paint);

    site=true;
    const boundary=lotD/2-.06, entryZ=frontZ+.08;
    // Each door gets its own made path and gate. No shared central entrance.
    for(let row=0;row<Math.ceil((boundary-entryZ)/.38);row++)for(const s of [-1,1])b(.43,.045,.35,doorX+s*.23,.15,entryZ+.19+row*.38,'ground','paver',undefined,row+unit*11);
    b(1.03,.12,.30,doorX,.14,frontZ+.12,'ground','entry-step');
    b(1.00,.06,porchD,doorX,.245,front+porchD/2,'ground','entry-landing');
    const fence=(a,q,z,gate=false)=>{
      if(q-a<.08)return;
      for(const yy of [.35,.93])b(q-a,.065,.07,(a+q)/2,yy,z,'iron',gate?'gate-rail':'fence-rail',paint);
      const n=Math.max(2,Math.round((q-a)/.18));
      for(let k=0;k<n;k++){
        const x=a+(q-a)*(k+.5)/n;
        b(.095,.87,.052,x,.19,z+.035,'iron',gate?'gate-picket':'fence-picket',paint);
        const cap=new THREE.ConeGeometry(.067,.12,4,1,true);cap.rotateY(Math.PI/4);cap.scale(1,1,.55);cap.translate(x,1.12,z+.035);put(cap,'iron','picket-cap',paint);
      }
    };
    const lotL=ux-U/2+.09,lotR=ux+U/2-.09,gapL=doorX-.53,gapR=doorX+.53;
    fence(lotL,gapL-.09,boundary);fence(gapR+.09,lotR,boundary);fence(gapL+.06,gapR-.06,boundary,true);counts.gates++;
    b(.045,.15,.07,gapR-.10,.77,boundary+.07,'trim','gate-latch','#bba979');
    for(const x of [lotL,gapL-.05,gapR+.05,lotR]){
      b(.20,1.09,.22,x,.14,boundary,'ground','fence-post');
      b(.26,.07,.28,x,1.23,boundary,'trim','fence-post-cap');
      const cap=new THREE.ConeGeometry(.19,.13,4);cap.rotateY(Math.PI/4);cap.translate(x,1.365,boundary);put(cap,'trim','fence-post-weather-cap');
    }
    // Raised tufted beds occupy the space beside each path, clear of the gate corridor.
    const gardenX=ux+U*.19,gardenZ=(boundary+frontZ)/2;
    b(Math.max(.7,U*.47),.05,Math.max(.4,boundary-frontZ-.18),gardenX,.13,gardenZ,'foliage','lawn','#657144');
    const leaf=(x,y,z,r,salt)=>{
      const positions=[];
      // Four ridged leaf diamonds in crossing planes; silhouette has leaf tips and gaps.
      for(let k=0;k<4;k++){
        const a=k*2.399+salt*.7,dx=Math.cos(a)*r,dz=Math.sin(a)*r;
        const root=[x,y-.10,z],tip=[x+dx,y+r*.65,z+dz];
        const l=[x+dx*.45-dz*.38,y+r*.42,z+dz*.45+dx*.38];
        const q=[x+dx*.45+dz*.38,y+r*.22,z+dz*.45-dx*.38];
        positions.push(...root,...l,...tip,...root,...tip,...q);
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));g.computeVertexNormals();put(g,'foliage','leaf-cluster',undefined,salt);
    };
    for(let n=0;n<7;n++){
      const x=gardenX+(ctx.v.unit(620+n+unit*7)-.5)*U*.39,z=gardenZ+(ctx.v.unit(660+n)-.5)*.75;
      leaf(x,.37+ctx.v.unit(644+n)*.28,z,.20+ctx.v.unit(650+n)*.14,n+unit*9);
      // Blades stand above the lawn; flower spikes are sparse muted ochre tips.
      for(let k=0;k<2;k++){
        const blade=new THREE.BufferGeometry();blade.setAttribute('position',new THREE.Float32BufferAttribute([x+k*.08-.025,.18,z,x+k*.08+.025,.18,z,x+k*.08+.06,.43,z+.04],3));
        blade.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,.5,1],2));blade.computeVertexNormals();put(blade,'foliage','grass-tuft','#899265');
      }
    }
    const tx=gardenX+U*.07,tz=gardenZ-.06;
    rod([tx,.18,tz],[tx-.08,1.78,tz],.075,'wall','tree-trunk','#756046');
    for(let k=0;k<5;k++){
      const angle=k*2.399,xx=tx+Math.cos(angle)*.46,zz=tz+Math.sin(angle)*.30,yy=1.15+k*.19;
      rod([tx,yy-.42,tz],[xx,yy,zz],.035,'wall','tree-branch','#756046');
      for(let j=0;j<3;j++)leaf(xx+(j-1)*.17,yy+j*.10,zz,.22,k*13+j+unit*9);
    }
    site=false;
  }
  site=true;
  const tileD=lotD+1.0,tileZ=.36;
  put(tileGeometry(lotW+.45,tileD,tileZ,-.60,.11,.18,'lot-bevel'),'shadow','lot-bevel','#464741');
  put(tileGeometry(lotW+.11,tileD-.27,tileZ,.08,.15,.04,'lot-surface'),'ground','lot-surface',restyleColour('#979185', '#beb6a7', { id: `${id}.lot` }));
  // Individually laid footpath flags with a visible mortar gap.
  for(let i=0;i<Math.floor(lotW/.55);i++)for(let row=0;row<2;row++)b(.525,.055,.36,-lotW/2+.30+i*.55,.15,lotD/2+.18+row*.385,'ground','footpath-paver',undefined,i+row*17);
  ctx.abb={signals:[...signals],counts,features,units,unitWidth:U,wallFront:front,reveal:.34,canopyTones:canopies};
}

export const TERRACE_BUILDERS = Object.freeze({
  'terrace-single': buildTerrace,
  'terrace-double': buildTerrace,
  'terrace-carlton-heritage': buildTerrace,
});
