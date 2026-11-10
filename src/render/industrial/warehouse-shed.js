// P20 I2: the warehouse-shed sheet maps to content's "Brick sawtooth warehouse".
// The catalogue's footprint/storeys own dimensions; this builder owns only warehouse-brick.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE, SETBACK, STOREY } from '../../core/grid.js';

export function assembleWarehouseShed(materials, opts, spec) {
  const facade = Math.max(0, Math.min(3, opts.facade | 0));
  let seed = 2166136261;
  for (const ch of `warehouse-brick|${opts.districtId ?? 'none'}|${facade}`) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  const rand = salt => { let n = Math.imul(seed ^ salt, 2246822519); n = Math.imul(n ^ n >>> 13, 3266489917); return ((n ^ n >>> 16) >>> 0) / 4294967296; };
  // P21 M3: board and cache already supply the surveyed lot span. The compact
  // return keeps full-size openings and four northlights on a shallower shed.
  const lotW = (opts.lotSpan?.spanX ?? spec.footprint[0]) * TILE - 2 * SETBACK;
  const lotD = (opts.lotSpan?.spanZ ?? spec.footprint[1]) * TILE - 2 * SETBACK;
  const compact = lotD < 2 * TILE - 2 * SETBACK;
  const w = lotW * .70, d = lotD * (compact ? .60 : .70), cx = .7, cz = compact ? -1.6 : -2.7;
  const left = cx - w / 2, right = cx + w / 2, front = cz + d / 2, back = cz - d / 2;
  const g = .24, h = spec.storeys * STOREY, rise = 2.15, pitch = d / 4;
  const roles = {
    wall: ['brick', '#b36340'], roof: ['corrugated', '#7d7e78'], trim: ['limestone', '#ece0bc'],
    plinth: ['concrete', '#4d5150'], joinery: ['timber', '#958572'], glass: ['glass', '#20322b'],
    ground: ['concrete', '#9b9180'], planting: ['painted_metal', '#607338'], metal: ['painted_metal', '#495d4b'],
  };
  const buckets = {}, features = [], counts = { building: 0, lot: 0, openings: 0, teeth: 4, gates: 1 };
  for (const [role, [family, color]] of Object.entries(roles)) {
    const material = materials.get(family, { variant: `i2-shed-${role}-${facade}`, color,
      roughness: role === 'glass' ? .3 : .9, metalness: role === 'glass' ? .12 : 0,
      opacity: 1, transparent: false });
    material.vertexColors = true; material.userData.i2Role = role;
    if (role === 'planting') material.side = THREE.DoubleSide;
    if ((role === 'wall' || role === 'roof') && !material.userData.i2Surface) {
      material.userData.i2Surface = true;
      // Albedo is authored here in metres; retain the library's fine normal/roughness maps.
      material.map = null;
      if (material.normalScale) material.normalScale.setScalar(.16);
      const previous = material.onBeforeCompile, oldKey = material.customProgramCacheKey.bind(material);
      material.onBeforeCompile = (shader, renderer) => {
        previous?.call(material, shader, renderer);
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vI2Position; varying vec3 vI2Normal;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvI2Position = position; vI2Normal = normal;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vI2Position; varying vec3 vI2Normal;');
        const detail = role === 'wall' ? `
          float across = abs(vI2Normal.x) > .5 ? vI2Position.z : vI2Position.x;
          float row = floor(vI2Position.y / .19);
          vec2 brickUv = vec2(across / .46 + mod(row, 2.) * .5, vI2Position.y / .19);
          vec2 cell = floor(brickUv), phase = fract(brickUv);
          vec2 aa = max(fwidth(brickUv), vec2(.008));
          float mortar = max(1. - smoothstep(.035-aa.x, .035+aa.x, min(phase.x,1.-phase.x)),
            1. - smoothstep(.055-aa.y, .055+aa.y, min(phase.y,1.-phase.y)));
          float tone = fract(sin(dot(cell,vec2(12.91,78.21))) * 43758.54);
          diffuseColor.rgb *= mix(.73, 1.23, tone);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.23,.19,.135), mortar*.60);
          float damp = 1. - smoothstep(.25,2.3,vI2Position.y);
          float streak = pow(.5+.5*sin(across*9.1+sin(across*3.4)),12.);
          diffuseColor.rgb *= 1. - damp*.17 - streak*.09;
        ` : `
          float streak = pow(.5+.5*sin(vI2Position.x*13.1 + sin(vI2Position.x*3.2)),8.);
          float sheet = floor(vI2Position.x/.56);
          float drift = fract(sin(sheet*12.91)*43758.54);
          diffuseColor.rgb *= mix(.78,1.04,drift) * (1. - streak*.16);
        `;
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n{'+detail+'}');
      };
      material.customProgramCacheKey = () => `${oldKey()}|i2-metre-${role}`;
    }
    buckets[role] = { material, geometries: [], vertices: 0 };
  }
  // Metre UVs keep masonry course scale independent of panel dimensions. Vertex drift
  // complements the shared library's atlas normals and weather response, without stain cards.
  function emit(geometry, role, name, lot = false, tint = 1) {
    const geo = geometry.index ? geometry.toNonIndexed() : geometry;
    if (geo !== geometry) geometry.dispose();
    geo.computeBoundingBox();
    const pos = geo.attributes.position, normal = geo.attributes.normal;
    const uv = new Float32Array(pos.count * 2), colors = new Float32Array(pos.count * 3);
    const tone = tint * (.91 + rand(features.length + 700) * .15);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i));
      uv[i * 2] = (nx > .6 ? z : x) / 3; uv[i * 2 + 1] = (ny > .6 ? z : y) / 3;
      const damp = role === 'wall' ? .75 + .25 * Math.min(1, Math.max(0, (y - g) / 2)) : 1;
      colors.set([tone * damp, tone * damp, tone * damp], i * 3);
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const bucket = buckets[role], tris = pos.count / 3;
    features.push({ name, role, lot, triangles: tris, vertexStart: bucket.vertices, vertexCount: pos.count,
      bounds: [geo.boundingBox.min.toArray(), geo.boundingBox.max.toArray()] });
    bucket.vertices += pos.count; bucket.geometries.push(geo); counts[lot ? 'lot' : 'building'] += tris;
  }
  function box(name, role, x, y, z, a, b, c, lot = false, rot = null, tint = 1) {
    const geo = new THREE.BoxGeometry(a, b, c);
    // Only buried bottoms are omitted; pavers keep their top and four joint faces.
    if (lot && /paver|cobble|soil|picket|fence-post|entry-step/.test(name)) {
      geo.setIndex(Array.from(geo.index.array).filter((_, i) => i < 18 || i >= 24));
    }
    if (rot) geo.rotateX(rot.x ?? 0).rotateY(rot.y ?? 0).rotateZ(rot.z ?? 0);
    geo.translate(x, y, z); emit(geo, role, name, lot, tint);
  }
  function beam(name, role, a, b, radius, lot = false) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from);
    const geo = new THREE.CylinderGeometry(radius * .8, radius, delta.length(), 5);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    geo.translate(...from.add(to).multiplyScalar(.5).toArray()); emit(geo, role, name, lot);
  }
  // Clipped-corner base with a real sloping shoulder; never a flat grass rectangle.
  function tile(y, inset) {
    const x = lotW / 2 - inset, z = lotD / 2 - inset, c = .6;
    return [[-x+c,y,-z],[x-c,y,-z],[x,y,-z+c],[x,y,z-c],[x-c,y,z],[-x+c,y,z],[-x,y,z-c],[-x,y,-z+c]];
  }
  const rings = [tile(-.65, 0), tile(-.04, 0), tile(.19, .18)], vertices = [];
  for (let r = 0; r < 2; r++) for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8, a = rings[r][i], b = rings[r][j], c = rings[r+1][j], e = rings[r+1][i];
    vertices.push(...a,...e,...b,...b,...e,...c);
  }
  for (let i = 1; i < 7; i++) vertices.push(...rings[2][0],...rings[2][i+1],...rings[2][i]);
  const base = new THREE.BufferGeometry(); base.setAttribute('position', new THREE.Float32BufferAttribute(vertices,3)); base.computeVertexNormals(); emit(base,'plinth','i2-lot-bevel',true);
  const capShape = new THREE.Shape();
  tile(0,.23).forEach(([x,,z],i) => i ? capShape.lineTo(x,z) : capShape.moveTo(x,z));capShape.closePath();
  const capGeo = new THREE.ExtrudeGeometry(capShape,{depth:.05,bevelEnabled:false});
  capGeo.rotateX(Math.PI/2).translate(0,.24,0);emit(capGeo,'ground','i2-paved-cap',true);
  // The shell uses an extruded shape with true arched holes. Wall thickness is the reveal.
  function archPath(path, u, bottom, width, height) {
    const r = width / 2, spring = bottom + height - r * .42;
    path.moveTo(u-r,bottom);path.lineTo(u+r,bottom);path.lineTo(u+r,spring);
    for(let i=1;i<=10;i++){const a=Math.PI*i/10;path.lineTo(u+Math.cos(a)*r,spring+Math.sin(a)*r*.42);}
    path.lineTo(u-r,bottom);
  }
  function wall(along, plane, normal, min, max, openings, name) {
    const shape = new THREE.Shape();shape.moveTo(min,g);shape.lineTo(max,g);shape.lineTo(max,g+h);shape.lineTo(min,g+h);shape.closePath();
    for(const o of openings){const path=new THREE.Path();if(o.arch)archPath(path,o.u,o.y,o.w,o.h);else{path.moveTo(o.u-o.w/2,o.y);path.lineTo(o.u+o.w/2,o.y);path.lineTo(o.u+o.w/2,o.y+o.h);path.lineTo(o.u-o.w/2,o.y+o.h);path.closePath();}shape.holes.push(path);}
    const geo=new THREE.ExtrudeGeometry(shape,{depth:.42,bevelEnabled:false,curveSegments:10});
    const setGeometry = geom => {
      if(along==='z')geom.rotateY(-Math.PI/2).translate(plane+(normal>0?0:.42),0,0);
      else geom.translate(0,0,plane+(normal>0?-.42:0));
      return geom;
    };
    emit(setGeometry(geo),'wall',name);
    function localBox(n,role,u,y,offset,a,b,c,tint=1){
      if(along==='z')box(n,role,plane+normal*offset,y,u,c,b,a,false,null,tint);
      else box(n,role,u,y,plane+normal*offset,a,b,c,false,null,tint);
    }
    // Dark masonry foot stops at each actual ground-level entrance.
    const footCuts=openings.filter(o=>o.y<g+1).sort((a,b)=>a.u-b.u);let start=min;
    for(const o of [...footCuts,{u:max,w:0}]){const end=o.u-o.w/2;if(end>start){localBox('i2-base-course','plinth',(start+end)/2,g+.43,.015,end-start,.86,.5);localBox('i2-base-cap','ground',(start+end)/2,g+.88,.04,end-start,.13,.54);}start=o.u+o.w/2;}
    localBox('i2-string-course','trim',(min+max)/2,g+h-.78,.025,max-min,.22,.47,.82);
    for(const o of openings){
      counts.openings++;
      const cy=o.y+o.h/2;
      localBox(o.dock?'i2-dock-interior':'i2-window-glass',o.dock?'plinth':o.door?'joinery':'glass',o.u,cy,o.dock?-2.3:-.39,o.w-.04,o.h-.04,.065);
      if(o.dock){
        const shutterH=o.h*.48;
        localBox('i2-roller-shutter','metal',o.u,o.y+o.h-shutterH/2,-.12,o.w-.12,shutterH,.11);
        for(let y=o.y+o.h-shutterH;y<o.y+o.h;y+=.12)localBox('i2-shutter-slat','metal',o.u,y,-.047,o.w-.16,.035,.055,.72);
        for(const s of [-1,1])localBox('i2-loading-jamb','trim',o.u+s*(o.w/2+.12),cy,.055,.24,o.h+.28,.6,.76);
        localBox('i2-loading-lintel','trim',o.u,o.y+o.h+.12,.08,o.w+.5,.3,.66,.8);
      }else{
        for(const s of [-1,1])localBox('i2-window-frame','joinery',o.u+s*(o.w/2-.06),cy-.1,-.12,.12,o.h-.18,.2);
        localBox('i2-window-sill','trim',o.u,o.y-.04,.06,o.w+.3,.16,.65,.86);
        if(o.arch){
          const r=o.w/2,sy=o.y+o.h-r*.42;
          for(let i=0;i<10;i++){
            const a=Math.PI*i/10,b=Math.PI*(i+1)/10;
            const shape=new THREE.Shape();shape.moveTo(o.u+Math.cos(a)*r,sy+Math.sin(a)*r*.42);shape.lineTo(o.u+Math.cos(b)*r,sy+Math.sin(b)*r*.42);shape.lineTo(o.u+Math.cos(b)*(r+.22),sy+Math.sin(b)*(r*.42+.22));shape.lineTo(o.u+Math.cos(a)*(r+.22),sy+Math.sin(a)*(r*.42+.22));shape.closePath();
            const brick=new THREE.ExtrudeGeometry(shape,{depth:.49,bevelEnabled:false});emit(setGeometry(brick),'wall','i2-arch-voussoir',false,.87+(i%3)*.06);
          }
        }
        if(!o.door){
          for(const u of [-.28,0,.28])localBox('i2-window-mullion','joinery',o.u+o.w*u,cy-.08,-.19,.045,o.h-.30,.09);
          for(const y of [.28,.56,.79])localBox('i2-window-transom','joinery',o.u,o.y+o.h*y,-.18,o.w-.12,.055,.09);
        }else{
          localBox('i2-door-panel','metal',o.u,cy-.45,-.32,o.w-.3,.8,.12);
          localBox('i2-door-vision','glass',o.u,cy+.5,-.31,o.w-.4,.7,.08);
          localBox('i2-door-handle','trim',o.u+.32,cy,-.17,.045,.25,.055);
        }
      }
    }
  }
  const dockZ=-1.3,dockW=4.4,dockY=g+.76,dockH=3.95;
  const windows=(compact ? [-4.7,1.7] : [-11,-6.8,4.5]).map(u=>({u,y:g+1.7,w:1.5,h:2.7,arch:true}));
  wall('z',left,-1,back,front,[...windows,{u:dockZ,y:dockY,w:dockW,h:dockH,dock:true}],'i2-west-punched-wall');
  wall('z',right,1,back,front,(compact ? [-4.5,-1.6,1.3] : [-10,-5,0,5]).map(u=>({u,y:g+1.7,w:1.5,h:2.7,arch:true})),'i2-east-punched-wall');
  const doorX=-1.8;
  wall('x',front,1,left,right,[{u:doorX,y:g+.12,w:1.35,h:2.65,door:true},{u:2.2,y:g+1.7,w:1.5,h:2.7,arch:true}],'i2-front-punched-wall');
  wall('x',back,-1,left,right,[{u:0,y:g+1.7,w:1.5,h:2.7,arch:true}],'i2-back-punched-wall');
  box('i2-interior-floor','ground',cx,g+.1,cz,w-.5,.18,d-.5);
  // Repeated northlight teeth: long metal slope, dark divided vertical light, solid end wedges.
  for(let t=0;t<4;t++){
    const z0=back+t*pitch,z1=z0+pitch, low=g+h, high=low+rise, slope=Math.atan2(rise,pitch);
    box('i2-roof-sheet','roof',cx,(low+high)/2,(z0+z1)/2,w+.4,.14,Math.hypot(pitch,rise),false,{x:-slope});
    for(let x=left-.08;x<right+.12;x+=.56)box('i2-roof-standing-seam','roof',x,(low+high)/2+.12,(z0+z1)/2,.055,.11,Math.hypot(pitch,rise),false,{x:-slope},.83);
    box('i2-clerestory-glass','glass',cx,low+rise*.5,z1-.18,w-.28,rise-.25,.07);
    for(let x=left+.10;x<right;x+=.54)box('i2-clerestory-mullion','joinery',x,low+rise*.5,z1-.06,.065,rise-.18,.16);
    for(const y of [low+.07,low+rise*.5,high-.05])box('i2-clerestory-rail','joinery',cx,y,z1-.04,w,.09,.20);
    box('i2-ridge-capping','roof',cx,high+.05,z1,w+.6,.22,.42,false,null,.7);
    box('i2-valley-gutter','metal',cx,low-.08,z0,w+.5,.18,.25);
    for(const x of [left-.03,right+.03]){
      const shape=new THREE.Shape();shape.moveTo(z0,low);shape.lineTo(z1,low);shape.lineTo(z1,high);shape.closePath();
      const wedge=new THREE.ExtrudeGeometry(shape,{depth:.24,bevelEnabled:false});wedge.rotateY(-Math.PI/2).translate(x+.12,0,0);emit(wedge,'wall','i2-roof-end-wedge');
      box('i2-raking-fascia','roof',x,(low+high)/2,(z0+z1)/2,.28,.25,Math.hypot(pitch,rise),false,{x:-slope},.63);
      box('i2-brick-pilaster','wall',x,g+h/2,z0,.48,h,.48,false,null,.84);
      box('i2-pilaster-foot','plinth',x,g+.5,z0,.58,1,.6);
      box('i2-pilaster-cap','trim',x,low-.05,z0,.62,.25,.65,false,null,.8);
      beam('i2-downpipe','metal',[x-.23,g+.15,z0-.15],[x-.23,low-.06,z0-.15],.066);
    }
  }
  // Tall square chimney, with an open four-post crown instead of a capped solid rod.
  const stackX=right-.64,stackZ=back+1.0,stackH=h+rise+2.0;
  box('i2-chimney-foot','plinth',stackX,g+.6,stackZ,1.4,1.2,1.45);
  box('i2-chimney-shaft','wall',stackX,g+stackH/2,stackZ,.94,stackH,.94);
  box('i2-chimney-neck','trim',stackX,g+stackH-.07,stackZ,1.12,.2,1.12,false,null,.8);
  box('i2-chimney-soot','glass',stackX,g+stackH+.04,stackZ,.82,.08,.82);
  for(const x of [-.38,.38])for(const z of [-.38,.38])box('i2-chimney-crown-post','wall',stackX+x,g+stackH+.35,stackZ+z,.18,.62,.18);
  box('i2-chimney-crown','roof',stackX,g+stackH+.68,stackZ,1.25,.19,1.25,false,null,.58);
  // Supported door canopy and the paved route share the door centreline.
  box('i2-entry-step','ground',doorX,g+.075,front+.5,1.8,.15,1.05,true);
  const canopyZ=front+.75;
  box('i2-entry-canopy','metal',doorX,g+3.0,canopyZ,2.3,.13,1.6,false,{x:.17});
  for(let x=doorX-1.05;x<doorX+1.1;x+=.42)box('i2-entry-canopy-seam','metal',x,g+3.085,canopyZ,.04,.07,1.6,false,{x:.17},.75);
  for(const x of [doorX-1,doorX+1]){beam('i2-canopy-post','metal',[x,g,front+1.35],[x,g+2.89,front+1.35],.045);beam('i2-canopy-bracket','metal',[x,g+2.3,front+.12],[x,g+2.92,front+1.1],.05);}
  // Loading platform, open bay contents and safety blocks are attached to the actual west wall.
  box('i2-loading-dock','plinth',left-.72,g+.35,dockZ,1.42,.7,dockW+.65,true);
  for(let z=dockZ-dockW/2;z<dockZ+dockW/2;z+=.56){box('i2-dock-paver','ground',left-.71,dockY-.045,z,1.35,.10,.53,true);box('i2-dock-hazard','trim',left-1.445,g+.63,z,.08,.18,.27,true,null,.7);}
  for(let k=0;k<3;k++)for(let j=0;j<4;j++)box('i2-pallet-slat','joinery',left-.60,g+.85+k*.16,dockZ+.55+j*.22,1.12,.075,.17);
  for(const z of [dockZ+.65,dockZ+1.22])box('i2-pallet-runner','joinery',left-.6,g+.89,z,.98,.22,.12);
  for(const z of [dockZ+.63,dockZ+1.17])box('i2-dock-crate','joinery',left-.65,g+1.5,z,.72,.65,.47,false,null,1.5);
  for (const z of [dockZ-.65,dockZ+.15]) {
    box('i2-interior-crate','joinery',left+.8,g+1.24,z,.82,.9,.7,false,null,1.7);
    for(const y of [g+.9,g+1.54])box('i2-crate-batten','ground',left+.36,y,z,.06,.09,.76,false,null,.64);
  }
  beam('i2-lamp-bracket','metal',[left-.05,g+5.4,dockZ],[left-.65,g+5.4,dockZ],.045);
  const lamp=new THREE.ConeGeometry(.26,.23,8);lamp.translate(left-.65,g+5.28,dockZ);emit(lamp,'metal','i2-loading-lamp');
  // Individual stone path and apron units. The rest of the site retains a paved cap.
  const gardenEnd=lotD/2-.8;
  for(let z=front+1.1;z<gardenEnd;z+=.57)for(let k=0;k<2;k++)box('i2-entry-paver','ground',doorX+(k-.5)*.69,.29,z,.665,.09,.54,true,null,.89+rand(900+k+Math.floor(z*8))*.2);
  for(let z=back;z<front;z+=1.0)for(let k=0;k<2;k++)box('i2-yard-cobble','ground',left-1.76-k*.5,.272,z+(k%2)*.34,.47,.06,.94,true,null,.76+rand(1000+k+Math.floor(z*17))*.35);
  // Small garden: visible stems, lobed shrubs, individual leaf diamonds and grass blades.
  function foliage(x,y,z,r,salt,lot=true){
    for(let l=0;l<3;l++){
      const a=l*2.4+rand(salt),rr=r*(.38+rand(salt+l+1)*.33);
      const geo=new THREE.OctahedronGeometry(rr,0);geo.scale(1,.75,1);geo.translate(x+Math.cos(a)*r*.5,y+(l%2)*r*.24,z+Math.sin(a)*r*.5);emit(geo,'planting','i2-shrub-lobe',lot,.65+rand(salt+l+7)*.5);
    }
  }
  for(const side of [-1,1]){
    const bx=doorX+side*1.95;
    box('i2-garden-soil','ground',bx,.265,(front+gardenEnd)/2,2.2,.075,gardenEnd-front-.4,true,null,.23);
    for(let i=0;i<6;i++){const x=bx+(rand(1200+i+side*20)-.5)*1.65,z=front+.6+rand(1250+i+side*20)*(gardenEnd-front-1);foliage(x,.46,z,.30+rand(1300+i)*.18,1400+i*6);}
    for(let i=0;i<20;i++){
      const x=bx+(rand(1500+i+side*40)-.5)*2,z=front+.4+rand(1600+i+side*40)*(gardenEnd-front-.8);
      for(let j=0;j<3;j++){
        const a=j*2.1,geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([x-.055*Math.cos(a),.29,z-.055*Math.sin(a),x+.055*Math.cos(a),.29,z+.055*Math.sin(a),x+.13*Math.cos(a),.55+rand(1700+i)*.18,z+.13*Math.sin(a)],3));geo.computeVertexNormals();emit(geo,'planting','i2-grass-blade',true,1.2);
      }
    }
  }
  const tx=doorX-2.35,tz=front+2.5;
  beam('i2-tree-trunk','joinery',[tx,.28,tz],[tx+.14,3.6,tz],.12,true);
  for(let k=0;k<6;k++){
    const a=k*2.4, x=tx+Math.cos(a)*1.1,z=tz+Math.sin(a)*1.0,y=2.7+(k%3)*.42;
    beam('i2-tree-branch','joinery',[tx+.1,1.5+k*.18,tz],[x,y,z],.045,true);
    for(let j=0;j<16;j++){
      const aa=rand(1800+k*30+j)*6.28,rr=Math.sqrt(rand(2100+k*30+j))*.66,px=x+Math.cos(aa)*rr,pz=z+Math.sin(aa)*rr,py=y+(rand(2400+k*30+j)-.5)*.8;
      const r=.22+rand(2700+j)*.13,geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([-r,0,0,0,.12,0,r,0,0,-r,0,0,r,0,0,0,-.12,0,0,0,-r,0,.14,0,0,0,r,0,0,-r,0,0,r,0,-.14,0],3));geo.computeVertexNormals();geo.rotateY(aa);geo.translate(px,py,pz);emit(geo,'planting','i2-tree-leaf-cluster',true,.75+rand(2800+k*30+j)*.55);
    }
  }
  // Pale, individually pointed pickets and capped posts; one central metal gate.
  const fenceZ=gardenEnd+.16,gateW=1.7,fenceMin=doorX-3.15,fenceMax=doorX+3.15;
  function fence(x0,z0,x1,z1){
    const len=Math.hypot(x1-x0,z1-z0),yaw=Math.atan2(z1-z0,x1-x0),n=Math.floor(len/.29);
    for(const y of [.55,1.05])box('i2-fence-rail','trim',(x0+x1)/2,y,(z0+z1)/2,len,.09,.09,true,{y:-yaw},.7);
    for(let i=0;i<=n;i++){
      const x=x0+(x1-x0)*i/n,z=z0+(z1-z0)*i/n;
      box('i2-picket','trim',x,.78,z,.12,.92,.09,true,{y:-yaw},.88);
      const cap=new THREE.ConeGeometry(.085,.16,4);cap.rotateY(Math.PI/4-yaw);cap.translate(x,1.32,z);emit(cap,'trim','i2-picket-point',true,.88);
    }
    for(let i=0;i<=Math.ceil(len/1.7);i++){
      const t=i/Math.ceil(len/1.7),x=x0+(x1-x0)*t,z=z0+(z1-z0)*t;
      box('i2-fence-post','trim',x,.89,z,.24,1.23,.24,true,null,.76);
      const cap=new THREE.ConeGeometry(.23,.18,4);cap.rotateY(Math.PI/4);cap.translate(x,1.58,z);emit(cap,'trim','i2-post-cap',true);
    }
  }
  fence(fenceMin,fenceZ,doorX-gateW/2,fenceZ);fence(doorX+gateW/2,fenceZ,fenceMax,fenceZ);
  fence(fenceMin,front+.3,fenceMin,fenceZ);fence(fenceMax,front+.3,fenceMax,fenceZ);
  for(const y of [.4,1.25])box('i2-gate-rail','metal',doorX,y,fenceZ,gateW,.085,.09,true);
  for(let x=doorX-gateW/2;x<=doorX+gateW/2+.01;x+=gateW/8)box('i2-gate-bar','metal',x,.83,fenceZ,.045,.86,.045,true);
  box('i2-gate-latch','joinery',doorX+.6,1.06,fenceZ+.07,.21,.045,.10,true);
  const parts=Object.entries(buckets).map(([role,b])=>{const geometry=mergeGeometries(b.geometries,false);geometry.name=`i2-shed-${role}`;for(const geo of b.geometries)geo.dispose();return {geometry,material:b.material};});
  const bounds=new THREE.Box3();for(const p of parts){p.geometry.computeBoundingBox();p.geometry.computeBoundingSphere();bounds.union(p.geometry.boundingBox);}
  return {parts,size:bounds.getSize(new THREE.Vector3()),source:'industrial-kit',kit:true,fallback:false,archetypeId:'warehouse-brick',form:'industrial',
    i2:{counts,features,lotW,lotD,wallLeft:left,wallFront:front,doorX,facade},
    p17B7:{signals:['p17-b7-lot-plinth-bevel','p17-b7-plinth-course','p17-b7-opening-frame']}};
}
