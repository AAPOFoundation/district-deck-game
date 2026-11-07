// Public footpath, kerb, gutter and joint-bed finish.
// World metres through the instance and model transforms, so rotated
// corridors and vertical faces share one surface scale. No owned textures.
// Library maps stay allocated; only this material drops its references.

import { tagSurface } from './style/restyle.js';
import { TASTE } from './taste-tokens.js';
import { DRY_CAST, DRY_CAST_GLSL } from './wet-road.js';

const ROLE = Object.freeze({
  paving: 0,
  kerb: 1,
  gutter: 2,
  edge: 3,
  joint: 4,
});

// The warm key lifts paving saturation on screen (S 12 and over at the 2026-10-05 key); the paving
// albedo carries 30% less chroma than the token so the lit pixel stays a neutral (S at most 12).
function desaturate(hex, amount) {
  const c = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const luma = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return `#${c.map((v) => Math.round(v + (luma - v) * amount).toString(16).padStart(2, '0')).join('')}`;
}

const FINISH = Object.freeze({
  // W4-B: paving and kerb come from the built tokens (concrete #A8A49A, kerb #B8B3A6).
  paving: { color: desaturate(TASTE.built.concrete, 0.3), roughness: 0.94 },
  kerb: { color: TASTE.built.kerb, roughness: 0.93 },
  gutter: { color: '#646864', roughness: 0.84 },
  edge: { color: '#a8a39b', roughness: 0.95 },
  joint: { color: '#6a6762', roughness: 0.97 },
});

const VERSION = 'p43-public-concrete-v6-w8b-flags';
const LINEAR_GAIN = 0.25;
const VISIBLE_CYCLES_PER_METRE = 7;

function detachSharedMaps(material) {
  for (const key of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'bumpMap', 'metalnessMap']) {
    if (key in material) material[key] = null;
  }
  if (typeof material.aoMapIntensity === 'number') material.aoMapIntensity = 0;
}

/**
 * Concrete response for one local public surface.
 * Call after getCityMaterial: that helper quantises colour and resets roughness.
 * Upstream onBeforeCompile and cache keys stay in front of this hook.
 * Low tier keeps one visible-scale tone sample and skips fine normal relief.
 */
export function applyPublicPavingSurface(material, { role = 'paving', quality = 'high', originAttribute = false } = {}) {
  if (!material) return material;
  material.userData = material.userData || {};
  if (material.userData.publicPavingSurface) return material;

  const roleName = ROLE[role] != null ? role : 'paving';
  const roleId = ROLE[roleName];
  const fine = quality === 'low' ? 0 : 1;
  const finish = FINISH[roleName];
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;

  if (material.color?.set) {
    material.color.set(finish.color);
    material.color.multiplyScalar?.(LINEAR_GAIN);
  }
  if (typeof material.roughness === 'number') material.roughness = finish.roughness;
  if (typeof material.metalness === 'number') material.metalness = 0;
  detachSharedMaps(material);

  material.userData.publicPavingSurface = {
    version: VERSION,
    role: roleName,
    quality,
    fine,
    color: finish.color,
    roughness: finish.roughness,
    linearGain: LINEAR_GAIN,
    visibleCyclesPerMetre: VISIBLE_CYCLES_PER_METRE,
    visibleCorrelationM: 1 / VISIBLE_CYCLES_PER_METRE,
    linearColor: material.color ? {
      r: material.color.r,
      g: material.color.g,
      b: material.color.b,
    } : null,
  };
  if (originAttribute) material.userData.publicPavingSurface.originAttribute = true;

  material.onBeforeCompile = function onPublicPaving(shader, renderer) {
    if (typeof previous === 'function') previous.call(this, shader, renderer);
    shader.uniforms.p43Role = { value: roleId };
    shader.uniforms.p43Fine = { value: fine };
    shader.uniforms.ddDryCast = DRY_CAST;
    const originDecl = originAttribute ? 'attribute vec3 p43Origin;\n' : '';
    const originAssign = originAttribute ? '\np43O = p43Origin;' : '';
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n${originDecl}varying vec3 vP43W;\nvarying vec3 vP43N;\nvarying vec3 vP43O;\nvarying vec3 vP43Hd;\nvarying vec3 vP43An;`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vec3 p43N = vec3(normal);
vec3 p43O = vec3(0.0);
vec4 p43P = vec4(transformed, 1.0);
vec3 p43Sc = vec3(1.0);
#ifdef USE_INSTANCING
mat3 p43Im = mat3(instanceMatrix);
p43Sc = vec3(length(p43Im[0]), length(p43Im[1]), length(p43Im[2]));
p43N /= vec3(dot(p43Im[0], p43Im[0]), dot(p43Im[1], p43Im[1]), dot(p43Im[2], p43Im[2]));
p43N = p43Im * p43N;
p43O = instanceMatrix[3].xyz;${originAssign}
p43P = instanceMatrix * p43P;
#endif
// W8-B: metres from this point to each face plane of a unit box (kerb, gutter and edge boxes), and the face axis.
vP43Hd = (0.5 - abs(transformed)) * p43Sc;
vP43An = abs(normal);
vP43N = normalize(mat3(modelMatrix) * p43N);
vP43O = (modelMatrix * vec4(p43O, 1.0)).xyz;
vP43W = (modelMatrix * p43P).xyz;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vP43W;
varying vec3 vP43N;
varying vec3 vP43O;
varying vec3 vP43Hd;
varying vec3 vP43An;
uniform float p43Role;
uniform float p43Fine;
uniform float ddDryCast;
float p43Hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float p43Noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(p43Hash(i), p43Hash(i + vec2(1.0, 0.0)), u.x),
    mix(p43Hash(i + vec2(0.0, 1.0)), p43Hash(i + vec2(1.0, 1.0)), u.x),
    u.y);
}
float p43Fade(float pixel, float freq) {
  return 1.0 - smoothstep(0.28, 0.72, pixel * freq);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec3 p43Nw = normalize(vP43N);
float p43Up = abs(p43Nw.y);
float p43Flat = smoothstep(0.42, 0.78, p43Up);
vec3 p43Ref = p43Up > 0.85 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
vec3 p43T = normalize(cross(p43Ref, p43Nw));
vec3 p43B = cross(p43Nw, p43T);
vec2 p43Uv = vec2(dot(vP43W, p43T), dot(vP43W, p43B));
float p43Pixel = max(fwidth(p43Uv.x), fwidth(p43Uv.y));
float p43Seed = fract(sin(dot(floor(vP43O * 200.0 + 0.5), vec3(127.1, 311.7, 74.7))) * 43758.5453);
float p43Mottle = p43Noise(p43Uv * 1.35 + p43Seed * 3.0) * 0.65 + p43Noise(p43Uv * 0.42) * 0.35;
float p43VisF = ${VISIBLE_CYCLES_PER_METRE.toFixed(1)};
float p43Vis = p43Noise(p43Uv * p43VisF + 19.0);
float p43VisW = p43Fade(p43Pixel, p43VisF);
float p43ToneAmp = p43Role < 0.5 ? 0.045 : (p43Role < 1.5 ? 0.02 : 0.012);
float p43Tone = (p43Seed - 0.5) * p43ToneAmp * mix(0.35, 1.0, p43Flat);
vec3 p43Mineral = vec3(0.0);
float p43Agg = 0.5;
float p43Broom = 0.0;
if (p43Fine > 0.5) {
  float p43CoarseF = 26.0;
  float p43FineF = 62.0;
  float p43Coarse = p43Noise(p43Uv * p43CoarseF + 11.0);
  float p43Grit = p43Noise(p43Uv * p43FineF + 2.7);
  float p43CoarseW = p43Fade(p43Pixel, p43CoarseF);
  float p43GritW = p43Fade(p43Pixel, p43FineF);
  p43Agg = 0.5 + (p43Coarse - 0.5) * 0.62 * p43CoarseW + (p43Grit - 0.5) * 0.38 * p43GritW;
  p43Mineral = vec3(0.018, 0.012, 0.004) * (p43Coarse - 0.5) * p43CoarseW
    + vec3(-0.006, -0.004, 0.008) * (p43Grit - 0.5) * p43GritW;
  float p43BroomF = 78.0;
  // W8-B: the broom stripes come and go in patches (0.35 to 1 over 0.5 m) instead of one even scanline field.
  p43Broom = sin(p43Uv.y * 6.28318 * p43BroomF) * p43Fade(p43Pixel, p43BroomF) * (0.35 + 0.65 * p43Noise(p43Uv * 2.0 + 5.0));
}
float p43LocalX = mod(vP43W.x, 64.0);
float p43LocalZ = mod(vP43W.z, 64.0);
float p43Kerb = min(min(abs(p43LocalX - 3.0), abs(p43LocalX - 13.0)), min(abs(p43LocalZ - 3.0), abs(p43LocalZ - 13.0)));
float p43Near = (1.0 - smoothstep(0.05, 0.72, p43Kerb)) * p43Flat * (1.0 - step(3.5, p43Role));
float p43WearN = p43Noise(p43Uv * 0.85 + 6.0);
float p43Wear = smoothstep(0.68, 0.9, p43WearN) * p43Near;
float p43VerticalPanel = (1.0 - p43Flat) * (step(p43Role, 0.25) + step(2.5, p43Role) * step(p43Role, 3.5));
float p43VisRole = 1.0 - step(3.5, p43Role) * 0.65;
float p43VisAmp = 0.15 * p43VisW * p43VisRole * (1.0 - p43VerticalPanel * 0.8);
vec3 p43Albedo = diffuseColor.rgb * (1.0 + p43Tone + (p43Mottle - 0.5) * 0.115 + (p43Vis - 0.5) * p43VisAmp);
p43Albedo += vec3(0.008, 0.005, 0.001) * (p43Vis - 0.5) * p43VisW * p43VisRole * (1.0 - p43VerticalPanel);
p43Albedo += p43Mineral * mix(0.35, 1.0, p43Flat) * (1.0 - p43VerticalPanel * 0.65);
p43Albedo *= 1.0 - p43Wear * 0.055;
// W8-B: individual flags. A 1.455 m slab breaks into 3 x 3 flags of 0.485 m about the slab centre (the instance
// origin, so cut slabs and pit fragments keep their grid): +-5% value per flag, a recessed joint with a chamfer
// (lit on its sun side by the bump below), the odd cracked or replaced flag, grime along the property line.
float p43ExtraH = 0.0;
float p43Lod = 1.0 - smoothstep(0.045, 0.12, p43Pixel);
if (p43Role < 0.5) {
  vec3 p43D = vP43W - vP43O;
  vec2 p43Q = vec2(dot(p43D, p43T), dot(p43D, p43B)) / 0.485 + 0.5;
  vec2 p43Fi = floor(p43Q);
  vec2 p43Fq = fract(p43Q) - 0.5;
  float p43Fd = (0.5 - max(abs(p43Fq.x), abs(p43Fq.y))) * 0.485;
  float p43Fh = p43Hash(p43Fi * 1.37 + p43Seed * 61.0 + 3.1);
  float p43Fh2 = p43Hash(p43Fi * 2.11 + p43Seed * 29.0 + 17.7);
  float p43Fh3 = p43Hash(p43Fi * 0.73 + p43Seed * 13.0 + 41.3);
  float p43FlagW = 1.0 - smoothstep(0.14, 0.40, p43Pixel);
  float p43Rep = step(0.96, p43Fh2);
  float p43Cracked = step(0.90, p43Fh2) * step(p43Fh2, 0.935);
  float p43Ang = p43Fh3 * 3.14159;
  vec2 p43Fm = p43Fq * 0.485;
  float p43Cd = abs(dot(p43Fm, vec2(cos(p43Ang), sin(p43Ang))) - (p43Fh - 0.5) * 0.18 + (p43Noise(p43Fm * 9.0 + p43Fi * 5.0) - 0.5) * 0.03);
  float p43Crack = p43Cracked * (1.0 - smoothstep(0.004, 0.011 + p43Pixel * 0.4, p43Cd)) * p43Lod * p43Flat;
  float p43Jw = 0.010;
  float p43Jaa = max(p43Pixel * 0.75, 0.004);
  float p43Joint = (1.0 - smoothstep(p43Jw - p43Jaa, p43Jw + p43Jaa, p43Fd)) * p43Flat * p43Lod;
  float p43Arris = smoothstep(p43Jw, p43Jw + p43Jaa, p43Fd) * (1.0 - smoothstep(p43Jw + 0.006, p43Jw + 0.026 + p43Jaa, p43Fd)) * p43Flat * p43Lod;
  p43Albedo *= (1.0 + ((p43Fh - 0.5) * 0.10 + p43Rep * 0.04) * p43FlagW * p43Flat) * (1.0 - 0.40 * p43Joint) * (1.0 + 0.07 * p43Arris) * (1.0 - 0.32 * p43Crack);
  p43ExtraH = -0.0045 * (1.0 - smoothstep(0.0, 0.032, p43Fd)) * p43Flat * p43Lod - 0.0006 * p43Crack;
  // Grime gathers along the property line (wall and fence bases) in clumps, with a darker crease at the very edge.
  float p43InCx = step(p43LocalX, 16.0);
  float p43InCz = step(p43LocalZ, 16.0);
  float p43OnX = p43InCx * (1.0 - p43InCz);
  float p43OnZ = p43InCz * (1.0 - p43InCx);
  float p43Dp = p43OnX * min(p43LocalX, 16.0 - p43LocalX) + p43OnZ * min(p43LocalZ, 16.0 - p43LocalZ) + (1.0 - p43OnX - p43OnZ) * 9.0;
  float p43Along = p43OnX * vP43W.z + (1.0 - p43OnX) * vP43W.x;
  float p43Clump = 0.35 + 0.65 * p43Noise(vec2(p43Along / 2.6, p43Dp * 1.7) + 9.0);
  float p43Base = (1.0 - smoothstep(0.04, 0.60, p43Dp)) * p43Clump + (1.0 - smoothstep(0.0, 0.10, p43Dp)) * 0.5;
  p43Albedo *= 1.0 - 0.15 * clamp(p43Base, 0.0, 1.0) * p43Flat;
}
// Kerb: the face is 15% under the top, darkest in the dirt line at the gutter, every box edge has a worn
// arris, and a 4.5 cm rounded chamfer (bump below) catches the sun along the top.
if (p43Role > 0.5 && p43Role < 1.5) {
  float p43De = min(min(vP43Hd.x + 9.0 * vP43An.x, vP43Hd.y + 9.0 * vP43An.y), vP43Hd.z + 9.0 * vP43An.z);
  p43Albedo *= 1.0 - 0.15 * (1.0 - p43Flat);
  p43Albedo *= 1.0 - 0.30 * (1.0 - p43Flat) * (1.0 - smoothstep(0.04, 0.10, vP43W.y));
  p43Albedo *= 1.0 + 0.07 * (1.0 - smoothstep(0.0, 0.022, p43De)) * (0.4 + 0.6 * p43Lod);
  float p43Kb = clamp(1.0 - p43De / 0.045, 0.0, 1.0);
  p43ExtraH = -0.0225 * p43Kb * p43Kb * p43Lod;
}
// Gutter strip: dirt packs against both long edges, and clumps along its length.
if (p43Role > 1.5 && p43Role < 2.5) {
  float p43Gd = min(vP43Hd.x + 9.0 * vP43An.x, vP43Hd.z + 9.0 * vP43An.z);
  float p43Gl = (1.0 - smoothstep(0.012, 0.075, p43Gd)) * p43Flat * (0.35 + 0.65 * p43Lod);
  p43Albedo *= 0.98 * (1.0 - 0.22 * p43Gl) * (1.0 - 0.12 * p43Noise(p43Uv * 0.45 + 3.0) * p43Flat);
}
// W6-A: trim against the warm clear key so the lit paving reads a neutral (see wet-road.js DRY_CAST).
// W8-B: a vertical face is mostly lit by the sky, not the warm key the trim answers, so it takes 35% of the trim,
// and a face turned from the sun (lit by the blue sky fill alone) is warmed back toward neutral (shaded kerb sides were navy).
#if NUM_DIR_LIGHTS > 0
float p43Sun = dot(normalize(mat3(viewMatrix) * vP43N), directionalLights[0].direction);
#else
float p43Sun = 1.0;
#endif
float p43Shade = (1.0 - smoothstep(-0.10, 0.30, p43Sun)) * (1.0 - p43Flat) * ddDryCast;
p43Albedo *= mix(vec3(1.0), vec3(1.16, 1.0, 0.78), p43Shade);
p43Albedo *= mix(vec3(1.0), ${DRY_CAST_GLSL}, ddDryCast * mix(0.35, 1.0, p43Flat));
diffuseColor.rgb = max(p43Albedo, vec3(0.0));
float p43Relief = mix(step(0.5, p43Role) * step(p43Role, 1.5), 1.0, p43Flat) * (1.0 - step(3.5, p43Role));
float p43Height = p43Relief * ((p43Agg - 0.5) * 0.0011 + p43Broom * 0.00085 * mix(0.55, 1.0, p43Flat));
p43Height += p43Fine * p43Relief * (p43Vis - 0.5) * p43VisW * 0.0032;
p43Height += p43ExtraH;
if (p43Role > 1.5 && p43Role < 2.5) p43Height *= 0.45;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (p43Fine > 0.5) {
  vec3 p43View = (viewMatrix * vec4(vP43W, 1.0)).xyz;
  vec3 p43Sx = dFdx(p43View);
  vec3 p43Sy = dFdy(p43View);
  vec2 p43Dh = vec2(dFdx(p43Height), dFdy(p43Height));
  vec3 p43R1 = cross(p43Sy, normal);
  vec3 p43R2 = cross(normal, p43Sx);
  float p43Det = dot(p43Sx, p43R1) * faceDirection;
  vec3 p43Grad = sign(p43Det) * (p43Dh.x * p43R1 + p43Dh.y * p43R2);
  normal = normalize(abs(p43Det) * normal - p43Grad);
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
float p43Rough = (p43Agg - 0.5) * 0.05 + (p43Mottle - 0.5) * 0.03 + p43Wear * 0.025 + (p43Vis - 0.5) * 0.04 * p43VisW * p43VisRole;
if (p43Role > 1.5 && p43Role < 2.5) {
  roughnessFactor = clamp(roughnessFactor - 0.045 + p43Rough * 0.35, 0.78, 0.9);
} else if (p43Role > 3.5) {
  roughnessFactor = clamp(roughnessFactor + p43Rough * 0.25, 0.94, 1.0);
} else {
  roughnessFactor = clamp(roughnessFactor + p43Rough, 0.88, 1.0);
}`);
  };

  material.customProgramCacheKey = function publicPavingKey() {
    const base = typeof previousKey === 'function' ? previousKey.call(this) : '';
    return `${base}|${VERSION}:${roleId}:${fine}${originAttribute ? ':origin' : ''}`;
  };
  if ('needsUpdate' in material) material.needsUpdate = true;
  tagSurface(material, roleName === 'kerb' ? 'kerb' : roleName === 'edge' ? 'footpath-edge'
    : roleName === 'gutter' || roleName === 'joint' ? 'tram-gutter'
    : material.userData.variant?.startsWith('s3-tram-street-') ? 'tram-paving' : 'footpath');
  return material;
}
