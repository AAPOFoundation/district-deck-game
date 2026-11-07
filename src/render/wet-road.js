/**
 * W6-A clear-sky cast trim, shared by the carriageway and the public paving.
 *
 * The clear key is warm (about R 1.0, G 0.92, B 0.77 at the review hour), so a neutral grey albedo
 * lit by it reads S 19-22 at the 150 m overview where the bible caps neutrals at S 12. The albedo is
 * trimmed against that key; the trim fades to nothing as the road wets, because the rain key is
 * already a neutral grey and a trimmed albedo would turn the rain pavements blue.
 * `value` is 1 in dry weather and 0 once rain has taken the road (wetRoadFactor 0.7 and over).
 */
export const DRY_CAST = { value: 1 };
export const DRY_CAST_GLSL = 'vec3(0.90, 1.04, 1.10)';

/**
 * W8-B carriageway surface. Everything is a function of world metres, so no texture repeats and a
 * junction square shares its structure with the street that runs into it. The corridor model is the
 * city grid (PITCH 64, kerbs at 3 and 13, lane centres at 4.5 and 11.5, tram reservation between).
 * Needs ddLawnH / ddLawnN (LAWN_FIELD_GLSL) declared above it.
 */
export const ROAD_SURFACE_COMMON_GLSL = `
// x: metres across the corridor, y: world metres along the road, z: 1 on a straight street (0 in a junction), w: 1 when the street runs along z
vec4 ddRoadFrame(vec2 w) {
  vec2 c = mod(w, 64.0);
  float inX = step(2.8, c.x) * step(c.x, 13.2);
  float inZ = step(2.8, c.y) * step(c.y, 13.2);
  float zRoad = inX * (1.0 - inZ);
  float xRoad = inZ * (1.0 - inX);
  return vec4(mix(c.y, c.x, zRoad), mix(w.x, w.y, zRoad), zRoad + xRoad, zRoad);
}
// Low ground for standing water: wheel-path ruts, the gutter along each kerb and slow basins, 0 to 1.
float ddRoadDip(vec2 w) {
  vec4 f = ddRoadFrame(w);
  float laneC = min(abs(f.x - 4.5), abs(f.x - 11.5));
  float rut = 1.0 - smoothstep(0.10, 0.40, abs(laneC - 0.8));
  float runs = 0.45 + 0.55 * ddLawnN(vec2(f.y / 7.0, laneC * 1.3) + 3.7);
  float gutter = 1.0 - smoothstep(0.05, 0.50, min(abs(f.x - 3.1), abs(f.x - 12.9)));
  float basin = ddLawnN(w / 5.5 + vec2(11.3, 4.1));
  return clamp(f.z * (rut * runs * 0.75 + gutter * 0.55) + 0.40 * basin, 0.0, 1.0);
}
// Repair rectangle along a lane: x = fill, y = sealed border (a thin line just inside the edge).
vec2 ddRoadPatch(float seed, float fi, float aloc, float x, float laneCentre) {
  float s = seed + fi * 3.7;
  float h0 = ddLawnH(vec2(s, 1.7 + fi));
  float h1 = ddLawnH(vec2(s, 8.3 + fi));
  float h2 = ddLawnH(vec2(s, 3.1 + fi));
  float h3 = ddLawnH(vec2(s, 5.9 + fi));
  float h4 = ddLawnH(vec2(s, 11.3 + fi));
  float a0 = 18.0 + fi * 22.0 + h0 * 12.0;
  float len = 4.5 + h1 * 8.5;
  float hw = 0.55 + h2 * 0.5;
  float cc = laneCentre + (h3 - 0.5) * 1.0;
  float on = step(0.50 + fi * 0.08, h4);
  float outer = smoothstep(0.0, 0.04, aloc - a0) * (1.0 - smoothstep(0.0, 0.04, aloc - a0 - len))
    * (1.0 - smoothstep(hw - 0.04, hw, abs(x - cc)));
  float inner = smoothstep(0.0, 0.04, aloc - a0 - 0.09) * (1.0 - smoothstep(0.0, 0.04, aloc - a0 - len + 0.09))
    * (1.0 - smoothstep(hw - 0.13, hw - 0.09, abs(x - cc)));
  return on * vec2(outer, max(outer - inner, 0.0));
}
`;

/**
 * Main-body insert for the carriageway (after the r7 wear block). Albedo: three to five octaves of value
 * noise from 8.5 m down to 4 cm (each one fades before its wavelength reaches two pixels, so nothing
 * shimmers), lighter polished wheel paths, an oil drip band down each lane centre, long repair
 * rectangles with a sealed border, sealed transverse and longitudinal cracks, and dirt and leaf litter
 * in the 0.4 m beside each kerb. It also leaves `ddRoadRoughOff` for the wet response: polished paths
 * and patches smoother, aggregate and litter rougher.
 * `plate` is the p17 wear slab, which is lifted back to the carriageway at its rim so only its core stays dark.
 */
export function roadSurfaceBodyGlsl({ fine = true, plate = false } = {}) {
  return `
// W8-B: carriageway structure in world metres (wet-road.js ROAD_SURFACE).
float ddRoadRoughOff = 0.0;
{
  vec2 w8P = vR7Road;
  float w8Px = max(fwidth(w8P.x), fwidth(w8P.y));
  vec4 w8F = ddRoadFrame(w8P);
  float w8X = w8F.x;
  float w8A = w8F.y;
  float w8St = w8F.z;
  float w8Z = w8F.w;
  float w8Lane = step(8.0, w8X);
  float w8LaneC = mix(4.5, 11.5, w8Lane);
  float w8Dc = abs(w8X - w8LaneC);
  float w8Big = ddLawnN(w8P / 8.5 + vec2(31.7, 12.3));
  float w8Md = ddLawnN(w8P / 1.9 + vec2(7.9, 41.5));
  // taste gate: at 0.20 / 0.25 / 0.27 the isotropic octaves read as smoke over the carriageway at the 50 m
  // camera. Asphalt varies along its lanes and in patches; the cloud is held to a hint.
  float w8Tone = 1.01 + (w8Big - 0.5) * 0.10 + (w8Md - 0.5) * 0.15 * (1.0 - smoothstep(0.48, 1.1, w8Px))
    + (ddLawnN(w8P / 0.85 + vec2(47.3, 5.9)) - 0.5) * 0.20 * (1.0 - smoothstep(0.20, 0.52, w8Px));
  float w8Rough = (w8Md - 0.5) * 0.10;
  float w8Patch = 0.0;
  float w8Seal = 0.0;
  float w8Leaf = 0.0;
  // Polished wheel paths 0.8 m either side of each lane centre, in runs, and the oil drip band between them.
  float w8Wheel = exp(-pow2((w8Dc - 0.80) / 0.20)) * w8St * (0.55 + 0.45 * ddLawnN(vec2(w8A / 6.0, w8Dc * 2.0) + 5.9));
  float w8Oil = exp(-pow2(w8Dc / 0.17)) * w8St * (0.30 + 0.70 * smoothstep(0.38, 0.78, ddLawnN(vec2(w8A / 2.6, w8X * 2.0) + 17.0)));
  w8Tone *= 1.0 + 0.055 * w8Wheel - 0.06 * w8Oil;
  w8Rough += -0.14 * w8Wheel - 0.05 * w8Oil;
  // Dirt packs the 0.4 m beside the kerb in clumps along its length.
  float w8Dk = min(abs(w8X - 3.1), abs(w8X - 12.9));
  float w8Dirt = (1.0 - smoothstep(0.0, 0.42, w8Dk)) * (0.40 + 0.60 * ddLawnN(vec2(w8A / 3.3, w8Dk * 4.0) + 41.0)) * w8St;
  w8Tone *= 1.0 - 0.15 * w8Dirt;
  w8Rough += 0.10 * w8Dirt;
${fine ? `
  float w8Sml = ddLawnN(w8P / 0.42 + vec2(19.3, 3.1));
  float w8Cl = ddLawnN(w8P / 0.17 + vec2(2.3, 27.7));
  float w8Gn = ddLawnN(w8P / 0.085 + vec2(5.1, 13.9)) * 0.6 + ddLawnN(w8P / 0.043 + vec2(23.7, 8.2)) * 0.4;
  float w8Bright = smoothstep(0.80, 0.93, ddLawnN(w8P / 0.095 + vec2(61.0, 9.7)));
  float w8Dark = smoothstep(0.82, 0.94, ddLawnN(w8P / 0.12 + vec2(3.7, 71.0)));
  float w8F042 = 1.0 - smoothstep(0.105, 0.25, w8Px);
  float w8F017 = 1.0 - smoothstep(0.043, 0.10, w8Px);
  float w8F009 = 1.0 - smoothstep(0.021, 0.050, w8Px);
  float w8F004 = 1.0 - smoothstep(0.011, 0.026, w8Px);
  float w8Agg = (w8Sml - 0.5) * 0.24 * w8F042 + (w8Cl - 0.5) * 0.20 * w8F017
    + (w8Gn - 0.5) * 0.20 * mix(w8F004, w8F009, 0.6) + (w8Bright * 0.11 - w8Dark * 0.13) * w8F009;
  w8Rough += (w8Gn - 0.5) * 0.10 * w8F009;
  // Long repair rectangles: fresh, darker, smoother, finer-grained, edged with a sealant line.
  float w8Aloc = mod(w8A, 64.0);
  vec2 w8Id = floor(w8P / 64.0);
  float w8Seed = mix(w8Id.y, w8Id.x, w8Z) * 5.0 + mix(w8Id.x, w8Id.y, w8Z) * 23.0 + w8Lane * 11.0 + w8Z * 37.0;
  vec2 w8PA = ddRoadPatch(w8Seed, 0.0, w8Aloc, w8X, w8LaneC);
  vec2 w8PB = ddRoadPatch(w8Seed, 1.0, w8Aloc, w8X, w8LaneC);
  w8Patch = max(w8PA.x, w8PB.x) * w8St;
  w8Seal = max(w8PA.y, w8PB.y) * w8St;
  w8Agg *= 1.0 - 0.45 * w8Patch;
  w8Tone *= 1.0 - 0.075 * w8Patch - 0.07 * w8Seal;
  w8Rough += -0.10 * w8Patch;
  // Sealed cracks: one transverse every few metres across part of a lane, and a wandering longitudinal one.
  float w8Cf = 1.0 - smoothstep(0.06, 0.16, w8Px);
  float w8Cw = 0.020 + 0.5 * w8Px;
  float w8Cc = w8A / 9.0 + ddLawnH(vec2(w8Seed, 13.1));
  float w8Ci = floor(w8Cc);
  float w8Ch = ddLawnH(vec2(w8Ci * 3.1 + w8Seed, 21.7));
  float w8Ca = (ddLawnH(vec2(w8Ci + w8Seed, 7.7)) - 0.5) * 1.4;
  float w8Cl2 = 0.8 + ddLawnH(vec2(w8Ci, w8Seed + 2.0)) * 1.4;
  float w8Cx = w8X - (w8LaneC + w8Ca);
  float w8Cp = (fract(w8Cc) - 0.5) * 9.0 + (ddLawnN(vec2(w8X * 2.6, w8Ci * 5.0)) - 0.5) * 0.30 + w8Cx * 0.20 * (w8Ch - 0.5);
  float w8Tr = step(0.55, w8Ch) * (1.0 - smoothstep(w8Cw * 0.6, w8Cw * 1.7, abs(w8Cp)))
    * (1.0 - smoothstep(w8Cl2 * 0.5 - 0.15, w8Cl2 * 0.5, abs(w8Cx)));
  float w8Side = ddLawnH(vec2(w8Seed, 29.3)) > 0.5 ? 1.0 : -1.0;
  float w8Lc = w8LaneC + w8Side * 1.35 + (ddLawnN(vec2(w8A / 4.5, 9.0 + w8Seed * 0.3)) - 0.5) * 0.55;
  float w8Lg = smoothstep(0.58, 0.70, ddLawnN(vec2(w8A / 17.0, w8Seed * 0.7 + 5.0))) * (1.0 - smoothstep(w8Cw * 0.6, w8Cw * 1.7, abs(w8X - w8Lc)));
  float w8Crack = max(w8Tr, w8Lg) * w8St * w8Cf;
  w8Tone *= 1.0 - 0.13 * w8Crack;
  w8Rough += -0.10 * w8Crack;
  // Leaf litter: warm dark flecks in the dirt band, clumped along the kerb.
  w8Leaf = (1.0 - smoothstep(0.10, 0.55, w8Dk)) * w8St * smoothstep(0.55, 0.72, ddLawnN(w8P / 0.23 + vec2(3.3, 8.8)))
    * smoothstep(0.35, 0.65, ddLawnN(vec2(w8A / 6.0, 2.0) + w8Seed)) * (1.0 - smoothstep(0.10, 0.28, w8Px));
  w8Tone *= 1.0 + w8Agg;
` : ''}
  diffuseColor.rgb *= w8Tone * mix(vec3(1.0), vec3(0.88, 0.82, 0.70), w8Leaf * 0.85) * mix(1.0, 0.82, w8Leaf);
  ddRoadRoughOff = clamp(w8Rough + 0.10 * w8Leaf, -0.22, 0.16);
  roughnessFactor = clamp(roughnessFactor + ddRoadRoughOff, 0.55, 1.0);
${plate ? `
  // The wear slab sits 2 cm proud with a hard edge. Lifted back to the carriageway at its rim (0.30 m
  // each side, 3 m at the ends of its 18 m run), only the core stays 21% darker, as a soft tyre band.
  // In rain the road takes the wet response and the slab does not, so the slab is dropped and the wet road shows through.
  if (ddDryCast < 0.5) discard;
  float w8Pe = clamp((9.0 - abs(mod(w8A, 64.0) - 40.0)) / 3.0, 0.0, 1.0);
  float w8Ps = clamp((0.36 - w8Dc) / 0.30, 0.0, 1.0);
  diffuseColor.rgb *= mix(1.27, 1.0, w8Pe * w8Ps);
` : ''}
}
`;
}

/**
 * P2D-ROAD: the puddle mask's value noise, declared by the wet-road chunk itself. It used to call
 * `ddCloudVN` from lighting.js, which exists only where SceneView has run `installCloudMottle` (play.html),
 * so the road program failed to compile on index.html, people-lab.html and hero.js. The maths is
 * ddCloudHash / ddCloudVN's line for line (phone-p2d-road.test.mjs evaluates both), so the rain
 * picture on play.html is unchanged.
 */
export const WET_ROAD_NOISE_GLSL = `
#ifndef DD_WET_ROAD_NOISE
#define DD_WET_ROAD_NOISE
float ddWetRoadHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float ddWetRoadVN( vec2 p ) {
	vec2 i = floor( p ); vec2 f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( ddWetRoadHash( i ), ddWetRoadHash( i + vec2( 1.0, 0.0 ) ), u.x ),
		mix( ddWetRoadHash( i + vec2( 0.0, 1.0 ) ), ddWetRoadHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
#endif
`;

/** Board-owned city road only. Painted wear and other asphalt stay unchanged. */
export function attachWetRoadUniform(material) {
  if (material?.userData?.variant !== 'road-asphalt-r5-worn') {
    throw new Error('Wet-road finish requires the owned city road material');
  }
  if (material.userData.uWetRoad) return material.userData.uWetRoad;
  const wet = { value: 0 };
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.userData.uWetRoad = wet;
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.uniforms.uWetRoad = wet;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uWetRoad;\n${WET_ROAD_NOISE_GLSL}`)
      // Rain state (TASTE-BIBLE section 3): carriageway at roughness 0.30 with a puddle mask, two
      // octaves of value noise at 2.5 m and 1.1 m, feathered over about a metre and thresholded to
      // about 7% coverage, at roughness 0.05 and a darker albedo (the carriageway itself is 26%
      // darker than dry). The sky reflection is Fresnel only (Schlick, F0 0.02), so from the 44 to
      // 64 degree camera a puddle is a dark patch with a faint sheen that builds toward glancing
      // angles, never a pale one; the sky is the rain gradient (#B9BEC4 horizon to #9CA5AE zenith).
      // `ddWetRoadVN` is this chunk's own value noise (WET_ROAD_NOISE_GLSL), so the road compiles on pages without lighting.js's cloud mottle.
      // W8-B: the mask leans toward low ground (`ddRoadDip`: wheel-path ruts, the kerb gutter, slow basins) so
      // water stands where it would, and the wet roughness keeps the surface structure (`ddRoadRoughOff`:
      // polished wheel paths and repairs glossier, aggregate and litter duller).
      .replace('#include <color_fragment>', `#include <color_fragment>
        float ddWetAmt = clamp(uWetRoad, 0.0, 1.0);
        vec3 ddPudW = transpose( mat3( viewMatrix ) ) * ( - vViewPosition - viewMatrix[ 3 ].xyz );
        float ddPudN = 0.65 * ddWetRoadVN( ddPudW.xz / 2.5 ) + 0.35 * ddWetRoadVN( ddPudW.xz / 1.1 + vec2( 4.7, 9.1 ) ) + 0.22 * ( ddRoadDip( ddPudW.xz ) - 0.30 );
        float ddPud = ddWetAmt * smoothstep( 0.685, 0.79, ddPudN ) * ( 1.0 - 0.75 * smoothstep( 90.0, 380.0, length( vViewPosition ) ) );
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.74, 0.74, 0.74), ddWetAmt);
        diffuseColor.rgb *= mix( 1.0, 0.45, ddPud );
        float ddPudNV = clamp( dot( normalize( viewMatrix[ 1 ].xyz ), normalize( vViewPosition ) ), 0.0, 1.0 );
        vec3 ddPudSky = mix( vec3( 0.495, 0.510, 0.527 ), vec3( 0.340, 0.368, 0.397 ), ddPudNV );
        float ddPudFres = 0.02 + 0.98 * pow( 1.0 - ddPudNV, 5.0 );
        totalEmissiveRadiance += ddPudSky * ddPud * ddPudFres * 2.4;`)
      // The packed roughness assignment and road dry floor have both run here.
      .replace('#include <lights_physical_fragment>', `
        roughnessFactor = mix(roughnessFactor, mix( 0.30, 0.05, ddPud ), ddWetAmt);
        roughnessFactor = clamp( roughnessFactor + ddWetAmt * ( 1.0 - ddPud ) * ddRoadRoughOff, 0.08, 1.0 );
        #include <lights_physical_fragment>`);
  };
  material.customProgramCacheKey = function () {
    return `${previousKey.call(this)}|dd-wet-road-v14-puddles-w4c`;
  };
  material.needsUpdate = true;
  return wet;
}

export function updateWetRoadMaterial(material, value) {
  if (!material?.userData?.uWetRoad || material.userData.variant !== 'road-asphalt-r5-worn') return;
  const wet = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  material.userData.uWetRoad.value = wet;
  DRY_CAST.value = Math.max(0, 1 - wet * 1.5);
  // Native physical specular is already active; these are uniform updates only.
  material.specularIntensity = 0.5 * wet;
}
