// District Deck V3.40 — `cottage-federation`, the Federation weatherboard cottage of about 1910.
//
// Governing spec: docs/next-phase/V340-RESIDENTIAL-HOUSES-FROM-SCRATCH-SPEC.md §7
// Module contract: ./CONTRACT.md — §4 (nine buckets), §5 (salts 2100–2199), §6a (Wave A rulings).
//
// P20 I2: the weatherboard sheet supersedes the earlier projecting-gable composition.
// Full-width bullnose verandah and one compact hip retain the
// kit envelope. Real lap boards, punched openings and nine shared surface buckets remain.
// Sheet dimensions are never used to size the model.
//
// Salts: 2100–2199 (CONTRACT.md §5). Variation comes from `ctx.v` and nowhere else.
// This lane supplies a clipped tile; GARDEN supplies lawn, boundary and entrance datums.

import * as THREE from 'three';
import { restyleColour, readRestyle } from '../../style/restyle.js';
import { slab, rotBox } from '../core.js';
import {
  KIT_METRICS,
  floorPlate,
  wallShell,
  hipRoof,
  bullnoseRoof,
  verandahFrame,
  chimney,
  eaves,
} from './house-kit.js';
import {
  doubleHungSash,
  frontDoor,
  windowHood,
  fretworkBracket,
  turnedPost,
  chimneyCap,
  gutterAndDownpipe,
} from './house-detail.js';
import {
  lotSurface,
  path,
  boundary,
  gate,
  letterbox,
  services,
  kerbAndFootpath,
} from './garden.js';

const DEG = Math.PI / 180;

/**
 * Salts owned by this file. 2100–2199, CONTRACT.md §5.
 *
 * Width and depth variation remain in index.js; accents use deterministic local salts.
 */
const SALT = Object.freeze({
  chimneyZ: 2100,
  chimneyX: 2101,
});

/** Kit-space detail sizes; appearance follows the sheet, dimensions follow the envelope. */
const PLAN = Object.freeze({
  /** Verandah depth, wall face to deck edge. */
  verandahD: 1.00,
  /** Bullnose: spring offset from the main wall plate, radius and straight-run fall. */
  bullSpringDrop: -0.23,
  bullDrop: 0.32,
  bullFall: 0.045,
  bullThickness: 0.11,
  /** Verandah beam. Depth is under KIT's 0.38 so the beam clears the bullnose sheet. */
  beamDepth: 0.34,
  beamThickness: 0.22,
  bracketSize: 0.34,
  /** Modelled weatherboard lap. */
  lapProud: 0.030,
  lapLean: 0.09,
  /** Corner board. */
  cornerBoard: 0.15,
});

/* ══════════════════════════════════════ the plan ═══════════════════════════════════════════ */

/**
 * Every line in the building, solved once from `ctx.env`, so nothing downstream re-derives a
 * spring line or a wall face. Pure: same env, same numbers.
 *
 * The hip pitch is solved from the fixed 5.20 m ridge target and the kit body footprint.
 */
function layout(env) {
  const W = env.bodyW;
  const F = env.frontZ;
  const B = env.backZ;
  const springY = env.floorY + env.wallH;
  const overhang = KIT_METRICS.overhang['cottage-federation'] ?? 0.46;
  const targetRise = env.ridgeY - springY;
  const mainFrontZ = F - PLAN.verandahD;
  const mainBackZ = B;
  const hipD = mainFrontZ - B;
  const hipPlanW = W + overhang * 2;
  const hipPlanD = hipD + overhang * 2;
  // Solve pitch from the kit's ridge target and footprint; no sheet-derived dimensions.
  const hipPitchDeg = Math.atan2(targetRise, Math.min(hipPlanW, hipPlanD) / 2) / DEG;
  const ridgeY = env.ridgeY;
  const eaveX = hipPlanW / 2;                   // the eave line, left and right alike
  const hipFrontEaveZ = mainFrontZ + overhang;
  const hipBackEaveZ = mainBackZ - overhang;

  const hipZ = mainFrontZ - hipD / 2;

  // Solve the bullnose and beam from the same roof section.
  const bullSpringY = springY - PLAN.bullSpringDrop;
  const bullBackZ = mainFrontZ - 0.08;
  const bullFrontZ = F + 0.12;
  const bullR = Math.min(PLAN.bullDrop, (bullFrontZ - bullBackZ) * 0.55);
  const sweep = KIT_METRICS.bullnoseSweepDeg * DEG;
  const bullCurveZ = bullFrontZ - bullR * Math.sin(Math.min(sweep, Math.PI / 2));
  const bullStraight = bullCurveZ - bullBackZ;
  const bullCurveY = bullSpringY - bullStraight * PLAN.bullFall;
  const bullLipY = bullCurveY - bullR * (1 - Math.cos(sweep));
  const bullLipZ = bullCurveZ + bullR * Math.sin(sweep);
  const bullLeftX = -W / 2 - 0.12;
  const bullRightX = W / 2 + 0.12;

  // The beam top follows the modelled roof underside directly over it.
  const beamTopY = bullCurveY - PLAN.bullThickness - 0.02;
  const beamY = beamTopY - PLAN.beamDepth;

  const verX = 0;
  const verW = W;
  const verZ = F - PLAN.verandahD / 2;
  const postZ = F - PLAN.beamThickness / 2;
  const postCount = 4;
  const postXs = [];
  const postSpan = verW - 0.72;
  for (let i = 0; i < postCount; i += 1) {
    postXs.push(verX - postSpan / 2 + (postSpan * i) / (postCount - 1));
  }

  return {
    W, F, B, springY, overhang,
    mainFrontZ, mainBackZ, hipD, hipZ, hipPlanW, hipPlanD, ridgeY, hipPitchDeg,
    eaveX, hipFrontEaveZ, hipBackEaveZ,
    bullSpringY, bullBackZ, bullFrontZ, bullLipY, bullLipZ, bullLeftX, bullRightX,
    beamY, beamTopY,
    verX, verW, verZ, postZ, postXs,
  };
}

/* ═════════════════════════════ modelled weatherboard laps ══════════════════════════════════ */

/**
 * Subtract a list of blocked spans from `[u0, u1]`.
 * @returns {Array<[number, number]>}
 */
function clearSpans(u0, u1, blockers) {
  let spans = [[u0, u1]];
  for (const bl of blockers) {
    const next = [];
    for (const [a, b] of spans) {
      if (bl.b <= a || bl.a >= b) { next.push([a, b]); continue; }
      if (bl.a > a) next.push([a, bl.a]);
      if (bl.b < b) next.push([bl.b, b]);
    }
    spans = next;
  }
  return spans;
}

/**
 * The exclusion spans an elevation's openings cast over the laps: the hole plus the architrave
 * that frames it plus its sill and head cap, so a board never crosses a window.
 */
function openingBlockers(openings, face) {
  const alongX = face === 'front' || face === 'back';
  return openings.map((o) => {
    const c = alongX ? o.centre[0] : o.centre[2];
    return {
      a: c - o.w / 2 - 0.30,
      b: c + o.w / 2 + 0.30,
      y0: o.sillY - 0.32,
      y1: o.headY + 0.38,
    };
  });
}

/**
 * Real weatherboard laps on one elevation.
 *
 * BUCKET `wall`. These ARE the wall — the same painted board, standing 30 mm proud of the shell
 * face and leaning 0.09 rad so the butt overhangs the board below and the exposed face turns up
 * toward the key. The shadow under the butt and the highlight along the face are then geometry,
 * and neither depends on what the SURFACES seat does with the normal map.
 *
 * Twelve laps at high quality; six at mid and four at low. Whole-elevation UVs
 * keep the authored weatherboard texture from repeating an entire wall on each lap.
 */
function weatherboardLaps(ctx, spec) {
  const {
    face, plane, u0, u1, yBase, height, openings = [], tag,
  } = spec;
  const material = spec.material ?? ctx.p.wall;
  const out = [];
  const courses = ctx.detail ? 12 : (ctx.mid ? 6 : 4);
  const gauge = height / courses;
  const boardH = gauge * 0.92;
  const capY = yBase + height - KIT_METRICS.wallPlate;
  const thick = PLAN.lapProud;
  const outward = (face === 'front' || face === 'right') ? 1 : -1;
  const alongX = face === 'front' || face === 'back';
  const offset = plane + outward * (thick * 0.5 + 0.004);
  const euler = alongX
    ? { x: -outward * PLAN.lapLean }
    : { z: outward * PLAN.lapLean };
  const blockers = openingBlockers(openings, face);

  for (let i = 0; i < courses; i += 1) {
    const yLo = yBase + gauge * i;
    const yHi = yLo + boardH;
    if (yHi > capY) break;
    const cy = yLo + boardH / 2;
    const spans = clearSpans(u0, u1, blockers.filter((b) => b.y0 < yHi && b.y1 > yLo));
    for (let s = 0; s < spans.length; s += 1) {
      const [a, b] = spans[s];
      const len = b - a;
      if (len < 0.16) continue;
      const cu = (a + b) / 2;
      const name = `${tag}-lap-${i}-${s}`;
      out.push({
        geometry: alongX
          ? rotBox(len, boardH, thick, cu, cy, offset, euler, name)
          : rotBox(thick, boardH, len, offset, cy, cu, euler, name),
        material,
      });
    }
  }
  return out;
}

/**
 * The vertical stop board at an external corner. `detail-weatherboard-corner.png` shows one at
 * every corner of the reference cottage, and it is what stops the lap run dying at an arris.
 *
 * BUCKET `trim` (pale) against the `wall` field either side of it.
 */
function cornerBoards(ctx, corners, yBase, height) {
  const s = PLAN.cornerBoard;
  return corners.map(({ x, z, sx, sz }, i) => ({
    geometry: slab(s, height, s, x + sx * s * 0.24, yBase, z + sz * s * 0.24, `corner-board-${i}`),
    material: ctx.p.trim,
  }));
}

/** Boards on the verandah deck, cut 30 mm into its top face so the joints are real. */
function deckBoards(ctx, L) {
  const out = [];
  if (!ctx.mid) return out;
  const n = ctx.detail ? 16 : 9;
  const pitch = L.verW / n;
  const boardW = pitch - 0.022;
  for (let i = 0; i < n; i += 1) {
    const x = L.verX - L.verW / 2 + pitch * (i + 0.5);
    out.push({
      geometry: slab(boardW, 0.03, PLAN.verandahD - 0.02, x, ctx.env.floorY - 0.03, L.verZ,
        `verandah-deck-board-${i}`),
      material: ctx.p.timber,
    });
  }
  return out;
}

/* ════════════════════════════════════ opening tables ═══════════════════════════════════════ */

/** `wallShell` takes `x` as the offset along the face's own u axis; this converts from world. */
function faceOffset(face, shell, worldU) {
  if (face === 'front') return worldU - shell.x;
  if (face === 'back') return shell.x - worldU;
  if (face === 'right') return shell.z - worldU;
  return worldU - shell.z;
}

/** Turn a world-placed opening spec into the record `wallShell` expects. */
function openings(shell, list) {
  return list.map((o) => ({
    face: o.face,
    x: faceOffset(o.face, shell, o.u),
    y: o.sill,
    w: o.w,
    h: o.h,
    kind: o.kind,
    lights: o.lights,
    hood: o.hood,
  }));
}

/** The yaw of an opening's outward normal, in DETAIL's own convention. */
const yawOf = (outward) => Math.atan2(outward[0], outward[2]);

/**
 * Hang the right joinery in every hole KIT actually punched, reading the published record rather
 * than re-deriving a wall-face point. A sash that recomputes its own datum drifts from the hole.
 */
function fitJoinery(ctx, shell) {
  for (const op of shell.openings) {
    const spec = op.src ?? {};
    if (spec.kind === 'door') {
      ctx.add(frontDoor(ctx, {
        opening: op, fanlight: false, sidelights: false, panels: 4,
      }));
    } else {
      ctx.add(doubleHungSash(ctx, {
        opening: op, lights: spec.lights ?? 0, index: Math.round(op.centre[0] * 4),
      }));
    }
    if (spec.hood) {
      ctx.add(windowHood(ctx, {
        x: op.centre[0],
        y: op.headY + 0.33,
        z: op.centre[2],
        w: op.w,
        facing: yawOf(op.outward),
        projection: 0.62,
        drop: 0.22,
        style: 'skillion',
      }));
    }
  }
}

/* ═══════════════════════════════════════ the build ═════════════════════════════════════════ */

// Semantic vertex colours retain nine materials while separating lawn, foliage, paving,
// metal and masonry. Atlas normals and wear stay active; albedo uses its luminance only.
function paintCottage(ctx) {
  const restyle = readRestyle(globalThis.location?.search ?? '').enabled;
  const colours = {wall:restyleColour(restyle ? new THREE.Color('#d3c7ad') : '#d3c7ad', new THREE.Color('#fff0d1').multiplyScalar(1.56206333 * 1.15), { id: 'building:cottage-federation.wall' }),wallAlt:'#796452',roof:'#7c8990',trim:'#f0e0bd',
    joinery:restyleColour('#646c48', '#a7b478', { id: 'building:cottage-federation.joinery' }),glass:'#0b110f',shadow:restyleColour(restyle ? new THREE.Color('#474744') : '#474744', new THREE.Color('#fefef3').multiplyScalar(1.5), { id: 'building:cottage-federation.shadow' }),timber:restyleColour(restyle ? new THREE.Color('#96724f') : '#96724f', new THREE.Color('#ffc286').multiplyScalar(2.10898331), { id: 'building:cottage-federation.timber' }),garden:'#687746'};
  for (const [role, mat] of Object.entries(ctx.p)) {
    if (!mat?.isMaterial) continue;
    mat.userData.i2Role = role;
    mat.color.set('#ffffff'); mat.vertexColors = true;
    if (role !== 'glass') { mat.roughness = 0.9; mat.metalness = 0; }
    if (role === 'garden') { mat.side = THREE.DoubleSide; mat.normalScale?.set(0.12,0.12); }
    if (role === 'roof') mat.normalScale?.set(0.16,0.16);
    if (mat.userData.i2Paint) continue;
    mat.userData.i2Paint = true;
    const previous = mat.onBeforeCompile, oldKey = mat.customProgramCacheKey.bind(mat);
    mat.onBeforeCompile = (shader, renderer) => {
      previous?.(shader, renderer);
      shader.fragmentShader = shader.fragmentShader
        .replace('diffuseColor.rgb *= ddResidentialTargetRatio;', '')
        .replace('diffuseColor *= sampledDiffuseColor;', 'diffuseColor *= vec4(vec3(dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), sampledDiffuseColor.a);')
        .replace('diffuseColor.rgb = mix( ddPaneSill, ddPaneHead, smoothstep( 0.04, 0.96, ddPane ) );',
          'diffuseColor.rgb *= mix(0.6, 1.3, smoothstep(0.04, 0.96, ddPane));');
    };
    mat.customProgramCacheKey = () => `${oldKey()}-i2-${role}`;
    mat.needsUpdate = true;
  }
  for (const [i, part] of ctx.parts.entries()) {
    const role = part.material.userData.i2Role, g = part.geometry, name = g.name;
    let colour = colours[role] ?? '#888888';
    if (/plinth/.test(name)) colour = '#55534b';
    if (/chimney/.test(name) && role === 'wallAlt') colour = '#a27955';
    if (/gutter|downpipe/.test(name)) colour = restyleColour('#9b744f', '#ffbf82', { id: 'building:cottage-federation.gutter' });
    if (/path-|footpath|kerb/.test(name)) colour = '#a09882';
    if (/i2-paver/.test(name)) colour = restyleColour('#957c64', '#f6cca5', { id: 'building:cottage-federation.paver' });
    if (/lot-lawn/.test(name)) colour = '#929061';
    if (/i2-leaf/.test(name)) colour = '#59633a';
    if (/i2-fruit/.test(name)) colour = '#c4a547';
    const c = new THREE.Color(colour), pos = g.attributes.position, arr = [];
    if (name.startsWith('hip-pitch') && g.attributes.uv) {
      const side=/left|right/.test(name),uv=g.attributes.uv;
      for(let j=0;j<pos.count;j++)uv.setXY(j,
        side ? pos.getZ(j)/ctx.env.bodyD : pos.getX(j)/ctx.env.bodyW,
        side ? pos.getX(j)/ctx.env.bodyW : pos.getZ(j)/ctx.env.bodyD);
    }
    if (role === 'wall' && g.attributes.uv) {
      const uv = g.attributes.uv, normal = g.attributes.normal;
      for (let j=0;j<pos.count;j++) uv.setXY(j,
        (Math.abs(normal.getX(j)) > 0.5 ? pos.getZ(j) : pos.getX(j)) / 3,
        (pos.getY(j)-ctx.env.floorY)/(ctx.env.wallH*1.35));
    }
    const drift = 0.94 + ctx.v.unit(2130 + i % 60) * 0.12;
    const gain = ({wall:1.6,roof:1.45,trim:1.15,joinery:1.5,garden:1.6,timber:1.6}[role] ?? 1.1);
    for (let j=0;j<pos.count;j++) {
      const damp = role === 'wall' ? 0.73 + 0.27 * Math.min(1, Math.max(0,(pos.getY(j)-ctx.env.floorY)/0.8)) : 1;
      const wear = 0.96 + 0.04 * Math.sin(pos.getX(j)*2.3 + pos.getZ(j)*1.7 + pos.getY(j)*3);
      arr.push(c.r*gain*drift*damp*wear,c.g*gain*drift*damp*wear,c.b*gain*drift*damp*wear);
    }
    g.setAttribute('color',new THREE.Float32BufferAttribute(arr,3));
  }
}

// Parallel raised ribs clipped at each hip, with closed triangular sections.
function parallelHipSeams(L) {
  const pos=[],rise=Math.tan(L.hipPitchDeg*DEG),halfD=L.hipPlanD/2;
  const tri=(a,b,c)=>pos.push(...a,...b,...c);
  const rib=(a,b,lateral)=>{
    const start=pos.length;
    const section=p=>[[p[0]-lateral[0]*0.027,p[1]+0.004,p[2]-lateral[2]*0.027],
      [p[0],p[1]+0.042,p[2]],[p[0]+lateral[0]*0.027,p[1]+0.004,p[2]+lateral[2]*0.027]];
    const u=section(a),v=section(b);tri(u[0],u[2],u[1]);tri(v[0],v[1],v[2]);
    for(let k=0;k<3;k++){const j=(k+1)%3;tri(u[k],u[j],v[k]);tri(u[j],v[j],v[k]);}
    if(lateral[2]*(b[0]-a[0])-lateral[0]*(b[2]-a[2])<0) {
      for(let i=start;i<pos.length;i+=9)for(let k=0;k<3;k++)[pos[i+3+k],pos[i+6+k]]=[pos[i+6+k],pos[i+3+k]];
    }
  };
  for(let x=-L.eaveX+0.13;x<L.eaveX-0.1;x+=0.26){
    const run=Math.min(halfD,L.eaveX-Math.abs(x))-0.055;
    if(run<=0.06)continue;
    rib([x,L.springY,L.hipFrontEaveZ],[x,L.springY+run*rise,L.hipFrontEaveZ-run],[1,0,0]);
    rib([x,L.springY,L.hipBackEaveZ],[x,L.springY+run*rise,L.hipBackEaveZ+run],[1,0,0]);
  }
  for(let z=L.hipBackEaveZ+0.13;z<L.hipFrontEaveZ-0.1;z+=0.26){
    const run=halfD-Math.abs(z-L.hipZ)-0.055;
    if(run<=0.06)continue;
    for(const side of [-1,1])rib([side*L.eaveX,L.springY,z],
      [side*(L.eaveX-run),L.springY+run*rise,z],[0,0,1]);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.computeVertexNormals();g.name='i2-roof-standing-seams';return g;
}

function cottageTile(w,d) {
  const ring=(inset,y)=>{
    const x=w/2-inset,z=d/2-inset,c=0.30;
    return [[-x+c,y,-z],[x-c,y,-z],[x,y,-z+c],[x,y,z-c],[x-c,y,z],[-x+c,y,z],[-x,y,z-c],[-x,y,-z+c]];
  };
  const rings=[ring(0,-0.48),ring(0,-0.18),ring(0.18,0)],pos=[];
  const tri=(a,b,c)=>pos.push(...a,...b,...c);
  for(let r=0;r<2;r++)for(let i=0;i<8;i++){
    const j=(i+1)%8;tri(rings[r][i],rings[r+1][i],rings[r][j]);tri(rings[r][j],rings[r+1][i],rings[r+1][j]);
  }
  for(let i=1;i<7;i++){tri(rings[2][0],rings[2][i+1],rings[2][i]);tri(rings[0][0],rings[0][i],rings[0][i+1]);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.computeVertexNormals();g.name='lot-plate-bevel';return g;
}

function makePavers(ctx) {
  const slabPart = ctx.parts.find(p => p.geometry.name === 'path-slab');
  if (!slabPart) return;
  const g = slabPart.geometry; g.computeBoundingBox(); const b = g.boundingBox;
  const rows = Math.max(2,Math.ceil((b.max.z-b.min.z)/0.26)), step = (b.max.z-b.min.z)/rows;
  for (let r=0;r<rows;r++) for(let col=0;col<3;col++) {
    ctx.push(slab((b.max.x-b.min.x)/3-0.018,0.05,step-0.018,
      b.min.x+(col+0.5)*(b.max.x-b.min.x)/3,b.max.y,
      b.min.z+(r+0.5)*step,`i2-paver-${r}-${col}`),ctx.p.trim);
  }
}

// Branching tree with separate leaf diamonds: open canopy silhouette without sphere lobes.
function addLeafGarden(ctx) {
  const rod = (a,b,w,name) => {
    const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av);
    const g=new THREE.BoxGeometry(w,delta.length(),w);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
    g.translate(...av.add(bv).multiplyScalar(0.5).toArray());g.name=name;ctx.push(g,ctx.p.timber);
  };
  const tx=4.4,tz=5.2;
  rod([tx,0,tz],[tx,2.2,tz],0.15,'i2-tree-trunk');
  const leaves=[];
  for(let k=0;k<7;k++) {
    const a=k*2.399, bx=tx+Math.cos(a)*0.85,bz=tz+Math.sin(a)*0.72,by=1.85+(k%3)*0.27;
    rod([tx,1.1,tz],[bx,by,bz],0.065,`i2-tree-branch-${k}`);
    for(let j=0;j<16;j++) {
      const angle=j*2.399+k,rad=0.12+0.48*Math.sqrt((j+0.5)/16);
      const x=bx+Math.cos(angle)*rad,z=bz+Math.sin(angle)*rad,y=by+Math.sin(j*1.9)*0.40;
      const w=0.21,h=0.16,dx=Math.cos(angle)*w,dz=Math.sin(angle)*w;
      leaves.push(x-dx,y,z-dz,x,y+h,z,x+dx,y,z+dz,x,y-h,z,x-dx,y,z-dz,x+dx,y,z+dz);
      if(j===3) ctx.push(slab(0.10,0.13,0.10,x,y-0.15,z,`i2-fruit-${k}`),ctx.p.trim);
    }
  }
  for(let k=0;k<10;k++) {
    const bx=k<6 ? -5.0+k*2.0 : (k%2 ? -6.2 : 6.2),bz=k<6 ? 5.25 : 2.0-(k-6)*1.6;
    if(Math.abs(bx)<0.9)continue;
    for(let j=0;j<18;j++) {
      const a=j*2.399, r=0.12+0.28*Math.sqrt((j+0.5)/18), x=bx+Math.cos(a)*r,z=bz+Math.sin(a)*r;
      const y=0.16+0.31*(0.5+0.5*Math.sin(j*1.7)),dx=Math.cos(a)*0.16,dz=Math.sin(a)*0.16;
      leaves.push(x-dx,y,z-dz,x,y+0.16,z,x+dx,y,z+dz,x,y-0.13,z,x-dx,y,z-dz,x+dx,y,z+dz);
    }
    if(k%2===0)ctx.push(slab(0.12,0.10,0.12,bx,0.38,bz,`i2-flower-${k}`),ctx.p.trim);
  }
  // Small upright blades across the lawn, with the central made path excluded.
  for(let i=0;i<52;i++) {
    const x=ctx.v.range(2130+i%60,-5.6,5.6),z=ctx.v.range(2140+i%50,4.7,6.2);
    if(Math.abs(x)<0.95)continue;
    leaves.push(x-0.06,0.03,z,x,0.22+(i%3)*0.06,z+0.03,x+0.06,0.03,z);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(leaves,3));
  g.computeVertexNormals();g.name='i2-leaf-and-tuft';ctx.push(g,ctx.p.garden);
}

export default function build(ctx) {
  const { env, p, v } = ctx;
  const L = layout(env);

  /* ── 1. the lot. GARDEN owns the plate and the chamfer; kit.lotPlate is never called ────── */

  const gateX = 0;                       // the front door's axis, shared by every lot call
  ctx.add(lotSurface(ctx, { plate: false }));
  ctx.push(cottageTile(env.lotW, env.lotD), p.shadow);
  ctx.add(kerbAndFootpath(ctx, { x: gateX }));
  ctx.add(path(ctx, { x: gateX, deckZ: env.frontZ }));
  ctx.add(boundary(ctx, { x: gateX }));
  ctx.add(gate(ctx, { x: gateX }));
  addLeafGarden(ctx);
  ctx.add(letterbox(ctx, { x: gateX }));
  ctx.add(services(ctx, { bins: false }));
  makePavers(ctx);
  const lotEnd = ctx.parts.length;

  /* ── 2. floor plates. Two, so the verandah stands on its own bearers rather than on a slab
        of brick that would fill the dark void every reference shows under the deck. ───────── */

  ctx.add(floorPlate(ctx, {
    w: L.W, d: L.mainFrontZ - L.B, x: 0, z: (L.mainFrontZ + L.B) / 2, height: env.floorY,
  }));
  /* ── 3. wall shells, with every opening punched through ─────────────────────────────────── */

  const mainShellSpec = { w: L.W, d: L.hipD, x: 0, z: L.hipZ };
  const mainShell = wallShell(ctx, {
    ...mainShellSpec,
    base: env.floorY,
    height: env.wallH,
    material: p.wall,
    // Timber laps supply the wall articulation; no projecting masonry breast.
    articulate: 'none',
    openings: openings(mainShellSpec, [
      { face: 'back', u: -1.5, sill: env.floorY, w: 0.98, h: 1.9, kind: 'door' },
      { face: 'back', u: 1.5, sill: 1.30, w: 1.25, h: 1.35, kind: 'sash' },
      { face: 'front', u: gateX, sill: env.floorY, w: 1.16, h: 2.10, kind: 'door' },
      { face: 'front', u: 2.95, sill: 1.30, w: 1.90, h: 1.35, kind: 'sash', lights: 1 },
      { face: 'front', u: -2.95, sill: 1.30, w: 1.90, h: 1.35, kind: 'sash', lights: 1 },
      { face: 'left', u: L.hipZ + 1.45, sill: 1.30, w: 1.15, h: 1.35, kind: 'sash' },
      { face: 'left', u: L.hipZ - 1.45, sill: 1.30, w: 1.15, h: 1.35, kind: 'sash' },
      { face: 'right', u: L.hipZ + 1.45, sill: 1.30, w: 1.15, h: 1.35, kind: 'sash' },
      { face: 'right', u: L.hipZ - 1.45, sill: 1.30, w: 1.15, h: 1.35, kind: 'sash' },
    ]),
  });
  ctx.add(mainShell);

  /* ── 4. roofs. Three masses, and the ridge lands on env.ridgeY by construction ──────────── */

  const mainRoof = hipRoof(ctx, {
    w: L.W, d: L.hipD, x: 0, z: L.hipZ,
    springY: L.springY,
    pitch: L.hipPitchDeg,
    overhang: L.overhang,
    covering: 'plain',
    material: p.roof,
    // The front edge meets the bullnose; side and rear fascias follow the actual hip edges.
    fascia: false,
  });
  ctx.add(mainRoof);
  ctx.push(parallelHipSeams(L), p.roof);

  // Eaves. Fascia on `joinery`: SURFACES measured the reference fascia at L* 43 against a cream
  // trim at L* 81, and the dark band under the roof is most of what separates roof from wall on
  // this archetype. Soffits stay on `shadow`.
  ctx.add(eaves(ctx, {
    edges: [
      // Left: one continuous fascia along the main hip edge.
      {
        from: [-L.eaveX, L.springY, L.hipFrontEaveZ],
        to: [-L.eaveX, L.springY, L.hipBackEaveZ],
        outward: [-1, 0, 0],
      },
      { from: [-L.eaveX,L.springY,L.hipBackEaveZ], to: [L.eaveX,L.springY,L.hipBackEaveZ], outward: [0,0,-1] },
      // Right: from the verandah's end back to the rear eave.
      {
        from: [L.eaveX, L.springY, L.hipFrontEaveZ],
        to: [L.eaveX, L.springY, L.hipBackEaveZ],
        outward: [1, 0, 0],
      },
    ],
    overhang: L.overhang,
    material: p.joinery,
    soffitMaterial: p.shadow,
  }));
  /* ── 5. the bullnose verandah roof ──────────────────────────────────────────────────────── */

  ctx.add(bullnoseRoof(ctx, {
    segments: 9,
    w: L.bullRightX - L.bullLeftX,
    x: (L.bullRightX + L.bullLeftX) / 2,
    zFront: L.bullFrontZ,
    zBack: L.bullBackZ,
    springY: L.bullSpringY,
    drop: PLAN.bullDrop,
    fall: PLAN.bullFall,
    thickness: PLAN.bullThickness,
    covering: 'corrugated',
    material: p.roof,
    soffitMaterial: p.shadow,
    endMaterial: p.joinery,
    lipMaterial: p.joinery,
  }));

  // The verandah gutter, at the lip and on the dark bucket, which is the line the reference plate
  // reads as the boundary between the curved sheet and the cream beam under it.
  ctx.add(gutterAndDownpipe(ctx, {
    x: (L.bullRightX + L.bullLeftX) / 2,
    y: L.bullLipY,
    z: L.bullLipZ,
    run: L.bullRightX - L.bullLeftX,
    facing: 'front',
    projection: 0.03,
    downpipes: 'none',
    material: p.joinery,
  }));

  /* ── 6. the verandah frame, posts and brackets ──────────────────────────────────── */

  const frame = verandahFrame(ctx, {
    w: L.verW, d: PLAN.verandahD, x: L.verX, z: L.verZ,
    floorY: env.floorY,
    beamY: L.beamY,
    beamDepth: PLAN.beamDepth,
    beamThickness: PLAN.beamThickness,
    posts: L.postXs,
    postStyle: 'none',                    // DETAIL's turnedPost replaces KIT's plain stick
    returns: false,                       // the right-hand side is open; a return would float
    deckMaterial: p.timber,
    beamMaterial: p.trim,
    ceilingMaterial: p.shadow,
  });
  ctx.add(frame);
  ctx.add(deckBoards(ctx, L));

  const postH = L.beamY - env.floorY;
  for (let i = 0; i < L.postXs.length; i += 1) {
    ctx.add(turnedPost(ctx, {
      x: L.postXs[i], z: L.postZ, base: env.floorY, height: postH, index: i,
    }));
  }

  // Brackets face inward at the two end posts and both ways at the interior ones, so no bracket
  // hangs off the end of the beam into open air.
  for (let i = 0; i < L.postXs.length; i += 1) {
    const hands = i === 0 ? [1] : (i === L.postXs.length - 1 ? [-1] : [-1, 1]);
    for (const hand of hands) {
      ctx.add(fretworkBracket(ctx, {
        x: L.postXs[i], y: L.beamY, z: L.postZ + 0.07,
        size: PLAN.bracketSize, facing: 'front', hand,
      }));
    }
  }

  /* ── 8. the chimney: through the roof plane, not perched on it ──────────────────────────── */

  const chimX = -Math.min(L.W / 2 - 1.45, 3.9) + v.range(SALT.chimneyX, -0.25, 0.25);
  const chimZ = L.hipZ + v.range(SALT.chimneyZ, -0.45, 0.45);
  // The head is authored rather than left to KIT's default, which would put it 1.60 above the
  // roof surface and the pot 1.6 m over the ridge. Both reference plates stand the pot about
  // 0.7–0.9 above the ridge, so the shaft stops 0.30 over it and the cap and pot take the rest.
  const chim = chimney(ctx, {
    x: chimX, z: chimZ, base: 0, w: 1.02, d: 0.78,
    top: env.ridgeY + 0.30,
    material: p.wallAlt,
    throughRoof: mainRoof,
    flashingMaterial: p.roof,
  });
  ctx.add(chim);
  ctx.add(chimneyCap(ctx, {
    x: chimX, y: chim.shaft.top, z: chimZ,
    w: 1.02, d: 0.78,
    pots: 2,
    potHeight: 0.32,
    potMaterial: p.wallAlt,               // a red clay pot on a red brick shaft; the roof is grey
    render: true,
  }));
  if (chim.warning) console.warn(`[cottage-federation] chimney: ${chim.warning}`);

  /* ── 9. gutters and downpipes on the two flanks: roof edge → pipe → ground ──────────────── */

  const leftRun = L.hipFrontEaveZ - L.hipBackEaveZ;
  ctx.add(gutterAndDownpipe(ctx, {
    x: -L.W / 2,
    y: L.springY,
    z: (L.hipFrontEaveZ + L.hipBackEaveZ) / 2,
    run: leftRun,
    facing: 'left',
    projection: L.overhang + 0.09,
    downpipes: 'start',
    groundY: 0,
    index: 0,
  }));
  const rightRun = L.hipFrontEaveZ - L.hipBackEaveZ;
  ctx.add(gutterAndDownpipe(ctx, {
    x: L.W / 2,
    y: L.springY,
    z: (L.hipFrontEaveZ + L.hipBackEaveZ) / 2,
    run: rightRun,
    facing: 'right',
    projection: L.overhang + 0.09,
    downpipes: 'end',
    groundY: 0,
    index: 1,
  }));

  /* ── 10. joinery in every punched hole ──────────────────────────────────────────────────── */

  fitJoinery(ctx, mainShell);

  /* ── 11. the weatherboard field, modelled ───────────────────────────────────────────────── */

  const byFace = (shell, face) => shell.openings.filter((o) => o.face === face);

  ctx.add(weatherboardLaps(ctx, {
    face: 'front', plane: L.mainFrontZ,
    u0: -L.W / 2 + 0.10, u1: L.W / 2 - 0.10,
    yBase: env.floorY, height: env.wallH,
    openings: byFace(mainShell, 'front'), tag: 'main-front',
  }));
  ctx.add(weatherboardLaps(ctx, {
    face: 'left', plane: -L.W / 2,
    u0: L.mainBackZ + 0.10, u1: L.mainFrontZ - 0.01,
    yBase: env.floorY, height: env.wallH,
    openings: byFace(mainShell, 'left'), tag: 'main-left',
  }));
  ctx.add(weatherboardLaps(ctx, {
    face: 'right', plane: L.W / 2,
    u0: L.mainBackZ + 0.10, u1: L.mainFrontZ - 0.10,
    yBase: env.floorY, height: env.wallH,
    openings: byFace(mainShell, 'right'), tag: 'main-right',
  }));
  ctx.add(weatherboardLaps(ctx, {
    face: 'back', plane: L.mainBackZ,
    u0: -L.W / 2 + 0.10, u1: L.W / 2 - 0.10,
    yBase: env.floorY, height: env.wallH,
    openings: byFace(mainShell, 'back'), tag: 'main-back',
  }));

  ctx.add(cornerBoards(ctx, [
    { x: -L.W / 2, z: L.mainFrontZ, sx: -1, sz: 1 },
    { x: L.W / 2, z: L.mainFrontZ, sx: 1, sz: 1 },
    { x: -L.W / 2, z: L.mainBackZ, sx: -1, sz: -1 },
    { x: L.W / 2, z: L.mainBackZ, sx: 1, sz: -1 },
  ], env.floorY, env.wallH - KIT_METRICS.wallPlate));
  const triangles = parts => parts.reduce((n, part) => n + (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3, 0);
  ctx.i2 = {
    lotTriangles: triangles(ctx.parts.slice(0, lotEnd)),
    buildingTriangles: triangles(ctx.parts.slice(lotEnd)),
    doorX: gateX, gateX, pathX: gateX, verandahWidth: L.verW, bodyWidth: L.W,
    ridgeY: L.ridgeY, targetRidgeY: env.ridgeY,
    openings: mainShell.openings,
    features: [],
  };
  const offsets = new Map();
  paintCottage(ctx);
  for (const [i, part] of ctx.parts.entries()) {
    const role = part.material.userData.i2Role;
    const count = part.geometry.index?.count ?? part.geometry.attributes.position.count;
    part.geometry.computeBoundingBox();
    ctx.i2.features.push({name: part.geometry.name, role, lot: i < lotEnd,
      vertexStart: offsets.get(role) ?? 0, vertexCount: count,
      min: part.geometry.boundingBox.min.toArray(), max: part.geometry.boundingBox.max.toArray()});
    offsets.set(role, (offsets.get(role) ?? 0) + count);
  }

}
