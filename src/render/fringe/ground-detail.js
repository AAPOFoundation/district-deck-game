// taste-r1 W14-C: ground surface detail for the hinterland sheet. One luminance pack (`ground`), read as
// `token * lum`, never as colour: the hue stays on the paddock palette and only the value moves.
//
// The method is Pocket Reserve's `sampleSurf` (`src/view/civ7/terrain-splat.ts:317-330`), already inside
// `ddCoastLum` (two lookups of the pack, one warped and one turned, chosen by a value noise). Two layers:
// a near one at a 16 m repeat that fades out between 300 and 500 m from the camera (station 18 looks from
// about 230 m, station 19 from over 450 m), and a macro one at 96 m held to 500 m and gone by 800 m.
//
// It composes AFTER the worked palette writes `diffuseColor` and after the venue ground, at
// `roughnessmap_fragment`, exactly where `attachVenueGround` composes (tests/t15-venue-ground.test.mjs).
import { COAST_DETAIL_GLSL, loadCoastPack } from '../coast-textures.js';
import { COAST_RIM_SAND, COAST_RIM_SAND_GLSL } from './coast-rim.js';
import { LANDFORM_TRIAL } from '../edge-massing.js';
import { GROUND_SURFACE, GS, groundSurfaceCommonGlsl, groundSurfaceKey } from '../ground-surface.js';

export const GROUND_DETAIL = Object.freeze({
  nearRepeatM: 16,
  macroRepeatM: 96,
  nearAmp: 0.30,
  /** The meadow channel carries clover heads; its near amplitude is held at this (0.06 in the brief read SD 2.5 at station 18). */
  meadowNearAmp: 0.21,
  macroAmp: 0.14,
  nearFade: Object.freeze([300, 500]),
  macroFade: Object.freeze([500, 800]),
  /** Stored normal y under this leans the channel toward earth (terrain-splat.ts:390-400). */
  steepY: 0.90,
});

/**
 * taste-r1 W19-B: relief and surface kinds (Pocket Reserve terrain-splat / island-body, read as material only).
 * `amount` is the switch: 0 restores the previous frame exactly (the block is not compiled in).
 */
export const GROUND_RELIEF = Object.freeze({
  amount: 1,
  /** Height (m) of a hollow against its ring at 17 m that reads as full (tanh). */
  curvM: 0.35,
  /** Crown and hollow value and hue. */
  curvVal: 0.17,
  curvHue: 0.08,
  /** Broad turf / straw variation, 30 to 80 m. */
  broadVal: 0.20,
  broadHue: 0.09,
  /** Slope (|n.xz|, tan of the angle) where soil and then rock take over, before the edge noise. */
  soil: Object.freeze([0.12, 0.25]),
  rock: Object.freeze([0.30, 0.46]),
  /** Most of a slope soil can cover (streaks and patches, not a sheet), and the soil / rock value against the turf. */
  soilCover: 0.55,
  soilVal: 0.66,
  rockVal: 0.80,
  /** Normal bend, metres of relief for the 13 m and 41 m noises; fades 250 to 700 m. */
  bendM: 2.0,
  /**
   * taste-r1 (W20-D): soil only on real slope, torn and streaked down the fall line. 1 is on; 0 restores the W19 soft
   * soil patches (thresholds `soil` above). `soilTorn[0]` is the slope under which no soil shows at all, `soilTorn[1]`
   * the slope where the drive reaches full.
   */
  soilTorn: 1,
  soilTornSlope: Object.freeze([0.10, 0.26]),
  /** Blue of soil and rock is held to this share of their green, and their green to their red (shade goes brown). */
  earthBlueMax: 0.80,
  /**
   * taste-r1 (W20-D): in deep shade the sky reflection (env specular, 0.28 of the sky) outweighs the albedo, so a dark
   * hollow lit (4, 19, 52) reads navy or plum. Where the diffuse light is low the indirect specular is warmed toward brown
   * by this multiplier. [1, 1, 1] switches it off.
   */
  shadeWarm: Object.freeze([1.0, 0.70, 0.40]),
  /** taste-r1 (W21 review): multiplier on the sky's diffuse share in deep shade (warm and lifted). [1, 1, 1] is off. */
  shadeLift: Object.freeze([2.1, 1.45, 0.70]),
  /**
   * taste-r1 (W22-B): rock ledges on a real scarp. `ledge` is the switch (0 is off); it is also only compiled in while the
   * trial landform is on (`LANDFORM_TRIAL.gain > 0`), so the trial-off frame is unchanged. Strata are the true height over
   * `ledgeM` metres, warped by a noise stretched along the contour; a riser is a rock face, a tread keeps turf, and the
   * faces are cut into broken outcrop by a noise stretched down the fall line. `ledgeSlope` is the slope band that brings them in.
   */
  ledge: 1,
  ledgeM: 3.0,
  ledgeSlope: Object.freeze([0.34, 0.50]),
  /** Share of a strata period that is a rock face, how much of the scarp's face is rock at most, and its colour range against the turf. */
  ledgeRiser: 0.42,
  ledgeCover: 0.85,
  ledgeDark: 0.92,
  ledgeLight: 1.7,
  /** Normal bend out on a face and up on a tread (view-independent, along the fall line). */
  ledgeBend: Object.freeze([0.03, 0.20]),
  /**
   * taste-r1 (W23-B): irregular outcrop in place of the strata. `outcrop` is the switch (0 keeps the W22 ledges; it needs `ledge` above 0
   * and the trial landform on). Rock shows in patches chosen by a two-scale noise stretched along the contour (about 11 by 7 m and 4 by 3 m,
   * the second turned), more on the steepest ground and near the crest, none where the ground is concave at the foot; each patch has a lighter
   * lip along its upper edge and a shade on the turf below it. `outcropRock` is the rock's value against the turf around it.
   */
  outcrop: 1,
  outcropSlope: Object.freeze([0.14, 0.28]),
  outcropThr: 0.50,
  /** Metres from the crest line to the foot of the scarp where the ridge is at full width (the trial's scarp run). */
  outcropRun: 52,
  outcropCover: 0.92,
  outcropRock: 1.22,
  outcropLip: 0.32,
  outcropUnder: 0.74,
  outcropBend: Object.freeze([0.10, 0.10]),
});

/**
 * taste-r1 (W25): ground form, the landform the hinterland already has made readable from the overview. No height changes: two
 * albedo terms read from the same height texture as the relief block, at the broad scale the 17 m relief ring cannot see.
 * `amount` is the switch (0 restores the previous shader text; the block is not compiled in). Browser: `?groundForm=0`; node:
 * `DD_GROUND_FORM=0`.
 *  1. Slope shade: the height gradient over `slopeM` metres dotted with the sun's horizontal direction (the key light, which also
 *     casts the shadows), as an albedo gain of `slopeGain * tanh(slope / slopeRef)`: 5 degrees toward the sun +10%, away -10%,
 *     15 degrees +-20% (the brief's 7% and 18% read as nothing at station 01, where the ground is mostly under 3 degrees). The dark side is warmed (`darkWarm`, a brown share) and its blue is never raised.
 *  2. Form tone: crest against hollow over a `ringM` metre ring, the relief block's crown tone at about half its strength
 *     (`curvVal` 0.17, `curvHue` 0.08): crests paler and drier, hollows greener and a little darker.
 * Both hold to `fade[0]` metres from the camera (station 01 looks from 740 m along the axis, and its hinterland ground lies 600 to
 * 1000 m out, where the fine relief has gone) and are gone by `fade[1]`.
 */
const GROUND_FORM_ON = (typeof process !== 'undefined' && process?.env?.DD_GROUND_FORM !== undefined)
  ? Number(process.env.DD_GROUND_FORM) > 0 ? 1 : 0
  : (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('groundForm') === '0' ? 0 : 1);
export const GROUND_FORM = Object.freeze({
  amount: GROUND_FORM_ON,
  /** Height step (m) the gradient is taken over, centred on the point, and the slope (tan) at which the gain is 0.76 of its top. */
  slopeM: 36,
  slopeRef: 0.18,
  /** Top albedo gain of the slope shade (tanh keeps a scarp from going harsh), and the least value form may leave (no dark blobs). */
  slopeGain: 0.22,
  floor: 0.80,
  /** How much of a brown the dark side takes (the blue falls most), at full shade. */
  darkWarm: Object.freeze([1.04, 1.0, 0.90]),
  /** Ring (m), height of a hollow against its ring that reads as full (tanh), and crest and hollow value and hue (half of curvVal, curvHue). */
  ringM: 55,
  curvM: 1.6,
  curvVal: 0.085,
  curvHue: 0.04,
  /** Metres from the camera where the terms start to fade and where they are gone. */
  fade: Object.freeze([1250, 1950]),
});

/**
 * taste-r1 (W27, PADDOCK_TUFTS): GLSL for a function `ddFormGain(vec3 form, vec2 sunW)` that gives the albedo gain GROUND_FORM applies at a
 * point, for objects that stand on the ground and must follow its tone. `form` is (dh/dx, dh/dz, crest) with the heights taken over the same
 * `slopeM` and `ringM` as the shader above (crest = -tanh((ring mean - height) / curvM), +1 on a crest); `sunW` is the key light's horizontal
 * vector in world space. Returns vec3(1) when GROUND_FORM is off.
 */
export function groundFormGainGlsl() {
  const FM = GROUND_FORM;
  if (!(FM.amount > 0)) return 'vec3 ddFormGain(vec3 form, vec2 sunW) { return vec3(1.0); }';
  return `vec3 ddFormGain(vec3 form, vec2 sunW) {
  float gfSunH = length(sunW);
  vec2 gfS = sunW / max(gfSunH, 1e-3);
  float gfFace = -(form.x * gfS.x + form.y * gfS.y);
  float gfT = tanh(gfFace / ${FM.slopeRef.toFixed(3)}) * smoothstep(0.05, 0.25, gfSunH);
  float gfDark = clamp(-gfT, 0.0, 1.0);
  float gfHy = ${FM.curvHue.toFixed(3)} * form.z;
  float gfV = max(${FM.floor.toFixed(2)}, (1.0 + ${FM.slopeGain.toFixed(3)} * gfT) * (1.0 + ${FM.curvVal.toFixed(3)} * form.z));
  vec3 gfF = gfV * vec3(1.0 + gfHy, 1.0 + 0.35 * gfHy, 1.0 - 0.25 * abs(gfHy)) * mix(vec3(1.0), vec3(${FM.darkWarm.map(v => v.toFixed(2)).join(', ')}), gfDark);
  gfF.b = min(gfF.b, gfF.g);
  return gfF;
}`;
}

/** taste-r1 (W23-B): the outcrop field at frame coordinates `q` (a GLSL vec2 expression), about 0.5 on average and spread 0.2 to 0.8. */
function outcropFieldGlsl(q) {
  return `(0.5 + 1.7 * (0.55 * (ddCoastNoise(vec2((${q}).x / 11.0, (${q}).y / 7.0) + vec2(5.1, 2.7)) - 0.5)
    + 0.30 * (ddCoastNoise(mat2(0.8776, 0.4794, -0.4794, 0.8776) * vec2((${q}).x / 4.2, (${q}).y / 3.0) + vec2(1.3, 9.4)) - 0.5)
    + 0.15 * (ddCoastNoise(vec2((${q}).x / 27.0, (${q}).y / 19.0) + vec2(8.2, 3.6)) - 0.5)))`;
}

/**
 * taste-r1 (W20-D): low scrub and tussock between tree size and field size, in clumps of 3 to 10 m. `amount` is the
 * switch (0 is off and the block is not compiled in). It gathers on moderate slopes and in hollows, in patches picked
 * by 60 to 120 m noises, and fades to its mean past `fade[1]` so nothing tiles at the overview.
 */
export const GROUND_SCRUB = Object.freeze({
  // taste-r1 (W20 review): held at 0. As a darker noise on the sheet the scrub read as smoke-dark smudges on shaded hillsides (station 18) and as grey stains
  // over worked soil (station 11), even after its tones were brought to 0.86 / 0.72; scrub wants real tufts, not a tint. 1 switches it on.
  amount: 0,
  /** Slope (|n.xz|) band the scrub gathers on: full between the two inner numbers, none outside the outer two. The merged hinterland reads 0.2 to 0.3 over most hillsides (measured with a slope visualisation at stations 18 and 19). */
  slope: Object.freeze([0.03, 0.06, 0.27, 0.38]),
  /** Hollows (crown value under this goes from 0 to full at the second) hold scrub whatever the slope. */
  hollow: Object.freeze([-0.2, -0.8]),
  /** Density on flat ground inside a patch (sparse clumps in a paddock), against 1 on a moderate slope. */
  flat: 0.62,
  /** Clump noises, metres: body, lobe, fleck. */
  clumpM: Object.freeze([7.0, 3.6, 1.7]),
  /** Patch noises, metres, and the share of ground one of them leaves bare of scrub. */
  patchM: Object.freeze([97.0, 61.0]),
  /** Albedo of the body against the paddock luminance, its darker core and its lit rim. */
  // taste-r1 (W20 review): body 0.68, core 0.46, rim 0.95 read as smoke-dark smudges on a shaded hillside (station 18); scrub is a little darker than pasture, never a stain.
  body: 0.86,
  core: 0.72,
  rim: 1.05,
  /** How much darker the side away from the sun is. */
  shade: 0.10,
  /** Normal tilt per unit of clump height (the real light shades each clump); 0 leaves the clumps flat. */
  bump: 0.9,
  /** Dusty olive (taste foliage and accent olive, unit luminance), linear. */
  hue: Object.freeze([0.86, 1.07, 0.52]),
  /** Where the clump contrast fades to the mean (metres from the camera). */
  fade: Object.freeze([340, 480]),
  /** The mean cover of a full-density patch, which is what a far pixel shows. */
  meanCover: 0.55,
});

/**
 * Chain a ground-detail pass onto `material`. `opts.near` false drops the near layer (low quality).
 * The uniform `uGroundDetail` (material.userData.groundDetail.value, default 1) switches the whole pass
 * off at 0 so its cost can be measured against itself.
 */
export function attachGroundDetail(material, opts = {}) {
  if (!material) return material;
  if (opts.grain) return attachGroundGrain(material, opts);
  const { texture, ready } = loadCoastPack('ground');
  const coastPack = loadCoastPack('coast');
  const nearOn = opts.near === false ? 0 : 1;
  const R = GROUND_RELIEF;
  const FM = GROUND_FORM;
  // taste W78 (GROUND_SURFACE, ground-surface.js): with the switch on the module's statement owns the ground's value and hue. Here that takes out
  // both sides of GROUND_FORM, the relief's broad hue, its crown and hollow and its soil on slope (rock, the trial's ledges and the normal bend stay),
  // moves the grain's fades to the module's and ties the grain's temperature to its value.
  const gsOn = GROUND_SURFACE.on > 0;
  const GF = gsOn ? GS.grain : GROUND_DETAIL;
  const formOn = FM.amount > 0 && !gsOn ? 1 : 0;
  const reliefOn = R.amount > 0 ? 1 : 0;
  const tornOn = reliefOn && R.soilTorn > 0 ? 1 : 0;
  const SC = GROUND_SCRUB;
  const scrubOn = reliefOn && SC.amount > 0 ? 1 : 0;
  const scrubFull = scrubOn && nearOn ? 1 : 0;
  // The venue region mask (non-local venue ground on this same material) keeps the scrub off mown turf.
  const vg = material.userData.venueGround;
  const regionOn = scrubOn && vg && !vg.local ? 1 : 0;
  const rockPack = loadCoastPack('rock');
  const ledgeOn = reliefOn && R.ledge > 0 && LANDFORM_TRIAL.gain > 0 ? 1 : 0;
  const reliefColourOn = reliefOn && (!gsOn || ledgeOn) ? 1 : 0; // the colour block; the normal bend below follows reliefOn
  const control = material.userData.groundDetail ?? (material.userData.groundDetail = { value: 1 });
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey?.() ?? '';
  const G = GROUND_DETAIL;
  material.onBeforeCompile = (shader, renderer) => {
    if (typeof previous === 'function') previous(shader, renderer);
    shader.uniforms.uGdPack = { value: texture };
    shader.uniforms.uGdReady = ready;
    shader.uniforms.uGroundDetail = control;
    shader.uniforms.uGdCoast = { value: coastPack.texture };
    shader.uniforms.uGdCoastReady = coastPack.ready;
    shader.uniforms.uGdRimSand = { value: COAST_RIM_SAND };
    shader.uniforms.uGdRock = { value: rockPack.texture };
    shader.uniforms.uGdRockReady = rockPack.ready;
    shader.uniforms.uGroundRelief = { value: R.amount };
    shader.uniforms.uGroundScrub = { value: SC.amount };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uGdPack;
uniform float uGdReady;
uniform float uGroundDetail;
uniform sampler2D uGdCoast;
uniform float uGdCoastReady;
uniform vec3 uGdRimSand;
uniform sampler2D uGdRock;
uniform float uGdRockReady;
uniform float uGroundRelief;
uniform float uGroundScrub;
${COAST_DETAIL_GLSL}
${gsOn ? groundSurfaceCommonGlsl() : ''}float gdBendField(vec2 p) {
  const mat2 R1 = mat2(0.8660254, 0.5, -0.5, 0.8660254);
  const mat2 R2 = mat2(0.6, -0.8, 0.8, 0.6);
  return 0.6 * ddCoastNoise(R1 * p / 13.0 + vec2(3.1, 8.7)) + 0.4 * ddCoastNoise(R2 * p / 41.0 + vec2(19.3, 4.1));
}
${scrubOn ? `
// taste-r1 (W20-D): the clump height of the scrub (0..1), body 7 m, lobe 3.6 m, fleck 1.7 m.
float gdScrubV(vec2 p) {
  const mat2 R2 = mat2(0.6, -0.8, 0.8, 0.6);
  float v = ${scrubFull ? `0.52 * ddCoastNoise(p / ${SC.clumpM[0].toFixed(1)} + vec2(4.1, 9.7)) + 0.31 * ddCoastNoise(R2 * p / ${SC.clumpM[1].toFixed(1)} + vec2(12.3, 1.9)) + 0.17 * ddCoastNoise(p / ${SC.clumpM[2].toFixed(1)} + vec2(7.7, 3.3))` : `0.70 * ddCoastNoise(p / ${SC.clumpM[0].toFixed(1)} + vec2(4.1, 9.7)) + 0.30 * ddCoastNoise(R2 * p / ${SC.clumpM[1].toFixed(1)} + vec2(12.3, 1.9))`};
  return v;
}` : ''}
${COAST_RIM_SAND_GLSL}`)
      .replace('#include <roughnessmap_fragment>', `
float rimCover = 0.0;
vec3 gdLedgeBump = vec3(0.0);
${scrubFull ? 'vec3 scBump = vec3(0.0); // xz gradient of the scrub height and its weight' : ''}
{
  // taste-r1 W15-C1: beside a cove the grass thins over sand in the last five or six metres before the brow
  // (the ribbon starts as sand at qm -3), through a warp of two noises so the edge wanders by metres and
  // is never a line. The warp closes to nothing at qm -3, so the ribbon's landward edge meets sand, not grass.
  if (ringBwCache > 0.02 && ringQmCache > -9.0) {
    float rwA = ddCoastNoise(vRingWorld.xz / 4.3 + vec2(5.3, 1.7));
    float rwB = ddCoastNoise(vRingWorld.xz / 13.0 + vec2(2.9, 8.1));
    float rwC = ddCoastNoise(vRingWorld.xz / 41.0 + vec2(9.4, 3.3));
    float rimWarp = ((rwA - 0.5) * 0.25 + (rwB - 0.5) * 5.0 + (rwC - 0.5) * 6.0) * smoothstep(-3.0, -6.5, ringQmCache);
    // The coast band is valid only to about -10 m (the bake marks texels beyond it as off the coast and its cove weight
    // drops to 0 there), so the cover is brought to nothing by -9.6 whatever the warp, and never ends on a texel edge.
    rimCover = smoothstep(-8.8, -3.3, ringQmCache + rimWarp) * smoothstep(-9.6, -8.0, ringQmCache) * ringBwCache;
  }
  if (rimCover > 0.0) {
    vec3 rimSandC = uGdRimSand * ddRimSandLum(uGdCoast, uGdCoastReady, vRingWorld.xz);
    diffuseColor.rgb = mix(diffuseColor.rgb, rimSandC, rimCover);
  }
}
if (uGroundDetail > 0.0 && uGdReady > 0.5) {
  float gdDist = length(vViewPosition);
  float gdNear = ${nearOn.toFixed(1)} * (1.0 - smoothstep(${GF.nearFade[0].toFixed(1)}, ${GF.nearFade[1].toFixed(1)}, gdDist));
  float gdMacro = 1.0 - smoothstep(${GF.macroFade[0].toFixed(1)}, ${GF.macroFade[1].toFixed(1)}, gdDist);
  if (gdMacro > 0.0) {
    // Which channel: read off the colour that is already there. Green pasture is meadow, straw is
    // pastureDry, brown is earth, and steep ground leans toward earth.
${gsOn ? `    // taste W79 (GROUND_SURFACE, G2b): the channel is the parcel's (written by the paddock statement), not read off the colour that is there.
    float gdMeadow = gsChannel.y;
    float gdEarth = gsChannel.z;
` : `    vec3 gdC = diffuseColor.rgb;
    float gdRatio = gdC.g / max(gdC.r, 1e-4);
    float gdMeadow = smoothstep(0.95, 1.20, gdRatio);
    float gdEarth = smoothstep(0.72, 0.62, gdRatio);
`}    gdEarth = max(gdEarth, smoothstep(${(G.steepY + 0.03).toFixed(2)}, ${(G.steepY - 0.02).toFixed(2)}, ringNCache.y));
    gdMeadow *= 1.0 - gdEarth;
    float gdDry = max(0.0, 1.0 - gdMeadow - gdEarth);
    vec3 gdCh = vec3(gdDry, gdMeadow, gdEarth);
    float gdNearAmp = mix(${G.nearAmp.toFixed(2)}, ${G.meadowNearAmp.toFixed(2)}, gdMeadow);
    float gdScale = 1.0;
    if (gdNear > 0.0) {
      float lumNear = ddCoastLum(uGdPack, gdCh, vRingWorld.xz, ${G.nearRepeatM.toFixed(1)});
      gdScale *= mix(1.0, lumNear, gdNear * gdNearAmp * 5.0);
    }
    float lumMacro = ddCoastLum(uGdPack, gdCh, vRingWorld.xz, ${G.macroRepeatM.toFixed(1)});
    gdScale *= mix(1.0, lumMacro, gdMacro * ${(G.macroAmp * 5).toFixed(2)});
    ${gsOn ? 'diffuseColor.rgb *= gsTemper(mix(1.0, gdScale, clamp(uGroundDetail, 0.0, 1.0) * (1.0 - rimCover)));' : 'diffuseColor.rgb *= mix(1.0, gdScale, clamp(uGroundDetail, 0.0, 1.0) * (1.0 - rimCover));'}
  }
}
${reliefColourOn ? `if (uGroundRelief > 0.0) {
  float rfd = 1.0 - smoothstep(700.0, 900.0, length(vViewPosition));
  float rAmt = clamp(uGroundRelief, 0.0, 1.0) * rfd * (1.0 - rimCover);
  if (rAmt > 0.0) {
    vec2 rwp = vRingWorld.xz;
    vec2 rhUv = (rwp - uRingHOrigin) / uRingHSpan;
    float rst = 3.0 * uRingHTexel;
    float rhc = ringHAt(rhUv);
    float rhm = 0.25 * (ringHAt(rhUv + vec2(rst, 0.0)) + ringHAt(rhUv - vec2(rst, 0.0)) + ringHAt(rhUv + vec2(0.0, rst)) + ringHAt(rhUv - vec2(0.0, rst)));
    // crown +1, hollow -1
    float rCrown = -tanh((rhm - rhc) / ${R.curvM.toFixed(3)});
    float rBa = ddCoastNoise(mat2(0.8660254, 0.5, -0.5, 0.8660254) * rwp / 53.0 + vec2(11.7, 2.3));
    float rBb = ddCoastNoise(mat2(0.6, -0.8, 0.8, 0.6) * rwp / 31.0 + vec2(5.9, 14.1));
    float rBc = ddCoastNoise(rwp / 77.0 + vec2(23.3, 9.6));
    float rBroad = clamp((0.45 * rBa + 0.30 * rBb + 0.25 * rBc - 0.5) * 3.0, -1.0, 1.0);
    vec3 rc = diffuseColor.rgb;
    float rVal = max(0.82, 1.0 + ${(gsOn ? 0 : R.curvVal).toFixed(3)} * rCrown + ${(gsOn ? 0 : R.broadVal).toFixed(3)} * rBroad); // taste-r1 (W19 review): floor, so a shaded hollow is not darkened into the blue of the hill shade
    float rHy = ${(gsOn ? 0 : R.curvHue).toFixed(3)} * rCrown + ${(gsOn ? 0 : R.broadHue).toFixed(3)} * rBroad;
    // taste-r1 (W19 review): blue falls on crowns and in hollows alike (it rose in hollows, and shaded gully floors went purple).
    rc *= rVal * vec3(1.0 + rHy, 1.0 + 0.35 * rHy, 1.0 - 0.25 * abs(rHy));
    // Soil on the steeper faces and rock on the steepest, thresholds moved by an irregular noise (no dither).
    float rSl = length(ringNCache.xz);
    float rEd = (ddCoastNoise(rwp / 9.0 + vec2(1.9, 6.2)) - 0.5) * 0.045 + (ddCoastNoise(rwp / 23.0 + vec2(8.1, 3.3)) - 0.5) * 0.06;
    float rRockT = smoothstep(${R.rock[0].toFixed(3)}, ${R.rock[1].toFixed(3)}, rSl + rEd);
    float rLum = dot(rc, vec3(0.2126, 0.7152, 0.0722));
    ${tornOn ? `// taste-r1 (W20-D): no soil under a slope of ${R.soilTornSlope[0].toFixed(2)}; where it shows, its edge is torn by 1 to 3 m noise and streaked down the fall line.
    vec2 rFall = ringNCache.xz / max(rSl, 1e-4);
    vec2 rAcr = vec2(-rFall.y, rFall.x);
    vec2 rSq = vec2(dot(rwp, rAcr), dot(rwp, rFall));
    float rStrA = ddCoastNoise(vec2(rSq.x / 3.4, rSq.y / 8.0) + vec2(3.7, 1.3)); // taste-r1 (W20 review): 2.2 by 9 m and 1.5 by 5 m drew combed hair lines
    float rStrB = ddCoastNoise(vec2(rSq.x / 2.3, rSq.y / 4.6) + vec2(8.3, 5.1));
    float rTear = ddCoastNoise(rwp / 1.6 + vec2(6.1, 2.2));
    float rDrive = (rSl - ${R.soilTornSlope[0].toFixed(3)}) / ${(R.soilTornSlope[1] - R.soilTornSlope[0]).toFixed(3)};
    float rSoilE = rDrive + (rStrA - 0.5) * 0.9 + (rStrB - 0.5) * 0.45 + (rTear - 0.5) * 0.35;
    float rSoilT = smoothstep(0.42, 0.68, rSoilE) * smoothstep(${(R.soilTornSlope[0] - 0.02).toFixed(3)}, ${R.soilTornSlope[0].toFixed(3)}, rSl);
    float rSoilPatch = 1.0;` : `float rSoilT = smoothstep(${R.soil[0].toFixed(3)}, ${R.soil[1].toFixed(3)}, rSl + rEd);
    float rSoilN = ddCoastNoise(rwp / 6.5 + vec2(13.1, 4.7)) * 0.6 + ddCoastNoise(rwp / 17.0 + vec2(2.2, 7.7)) * 0.4;
    float rSoilPatch = smoothstep(0.38, 0.62, rSoilN);`}
    float rSoilGrain = uGdReady > 0.5 ? ddCoastLum(uGdPack, vec3(0.0, 0.0, 1.0), rwp, ${G.nearRepeatM.toFixed(1)}) : 1.0;
    vec3 rSoil = vec3(rLum * ${R.soilVal.toFixed(2)}) * vec3(1.16, 0.97, 0.62) * (0.92 + 0.16 * ddCoastNoise(rwp / 2.7 + vec2(4.4, 9.9))) * mix(1.0, rSoilGrain, 0.8);
    float rRockL = uGdRockReady > 0.5 ? ddCoastLum(uGdRock, vec3(0.0, 1.0, 0.0), rwp, 7.0) : 1.0;
    vec3 rRock = vec3(rLum * ${R.rockVal.toFixed(2)}) * vec3(1.08, 0.99, 0.70) * mix(1.0, rRockL, 0.8); // taste-r1 (W19 review): warm grey-brown; a neutral rock read blue-purple under sky light in shaded hollows
    // taste-r1 (W19 review): hollows hold grass, not bare earth; soil and rock thin out as the ground turns concave.
    float rOpen = mix(0.2, 1.0, smoothstep(-0.7, -0.1, rCrown));
    float rSoilW = rSoilT * mix(0.35, 1.0, rSoilPatch) * ${(gsOn ? 0 : R.soilCover).toFixed(2)} * rOpen;
    float rRockW = rRockT * 0.65 * rOpen;
    ${ledgeOn && R.outcrop > 0 ? `// taste-r1 (W23-B): broken outcrop on the steep scarp: patches of rock with a lit lip and a shade below, grass tongues between.
    float lSteep = smoothstep(${R.outcropSlope[0].toFixed(3)}, ${R.outcropSlope[1].toFixed(3)}, rSl);
    float rLedgeW = 0.0;
    vec3 oCol = vec3(0.0);
    float oUnder = 0.0;
    if (lSteep > 0.0) {
      vec2 lFall = ringNCache.xz / max(rSl, 1e-4);
      vec2 lAx = vec2(${LANDFORM_TRIAL.ax.toFixed(4)}, ${LANDFORM_TRIAL.az.toFixed(4)});
      vec2 lC = vec2(${LANDFORM_TRIAL.cx.toFixed(1)}, ${LANDFORM_TRIAL.cz.toFixed(1)});
      vec2 lQ = vec2(dot(rwp - lC, lAx), dot(rwp - lC, vec2(-lAx.y, lAx.x)));
      vec2 lQu = vec2(dot(rwp - lFall * 1.8 - lC, lAx), dot(rwp - lFall * 1.8 - lC, vec2(-lAx.y, lAx.x)));
      // how far down the scarp this point is: 0 at the crest line (which wanders along the ridge as trialRidgeAt does), 1 at the foot
      float lU = (lQ.x + ${LANDFORM_TRIAL.half.toFixed(1)}) / ${(2 * LANDFORM_TRIAL.half).toFixed(1)};
      float lWs = 0.55 + 0.45 * smoothstep(0.0, 0.23, lU) * (1.0 - smoothstep(0.80, 1.0, lU));
      float lWd = ${LANDFORM_TRIAL.wander.toFixed(1)} * (0.8 * sin(lU * 8.2 + 0.6) + 0.35 * sin(lU * 19.0 + 2.0));
      float lDrop = (lQ.y - lWd) / (${R.outcropRun.toFixed(1)} * lWs);
      float lUp = (1.0 - smoothstep(0.62, 0.92, lDrop)) * smoothstep(-0.04, 0.06, lDrop);
      float lMod = 0.30 * (lSteep - 0.5) + 0.30 * (0.55 - lDrop);
      float lPv = ${outcropFieldGlsl('lQ')} + lMod;
      float lPu = ${outcropFieldGlsl('lQu')} + lMod;
      float lF = smoothstep(${R.outcropThr.toFixed(3)}, ${(R.outcropThr + 0.07).toFixed(3)}, lPv);
      float lFu = smoothstep(${R.outcropThr.toFixed(3)}, ${(R.outcropThr + 0.07).toFixed(3)}, lPu);
      float lGate = smoothstep(0.0, 0.45, lSteep) * lUp;
      lF *= lGate; lFu *= lGate;
      float lLip = clamp(lF - lFu, 0.0, 1.0);
      float lUnder = clamp(lFu - lF, 0.0, 1.0);
      rLedgeW = lF * ${R.outcropCover.toFixed(2)};
      float lVar = 0.88 + 0.24 * ddCoastNoise(lQ / 2.3 + vec2(2.2, 6.1));
      float lTone = ${R.outcropRock.toFixed(2)} * lVar + ${R.outcropLip.toFixed(2)} * lLip;
      float lGrain = uGdRockReady > 0.5 ? ddCoastLum(uGdRock, vec3(0.0, 1.0, 0.0), rwp, 3.4) : 1.0;
      vec3 lCol = vec3(rLum * lTone) * vec3(1.16, 0.99, 0.62) * mix(1.0, lGrain, 0.85);
      oCol = lCol;
      oUnder = lUnder * (1.0 - lF);
      gdLedgeBump = vec3(lFall, (rLedgeW * ${R.outcropBend[0].toFixed(2)} - lUnder * ${R.outcropBend[1].toFixed(2)}) * rAmt);
    }
    rRockW *= 1.0 - 0.65 * lSteep;` : ledgeOn ? `// taste-r1 (W22-B): the steep scarp is turf with rock ledges, not one rock tone.
    float lSteep = smoothstep(${R.ledgeSlope[0].toFixed(3)}, ${R.ledgeSlope[1].toFixed(3)}, rSl);
    float rLedgeW = 0.0;
    if (lSteep > 0.0) {
      vec2 lFall = ringNCache.xz / max(rSl, 1e-4);
      // a fixed frame on the ridge axis: a frame turned by the local fall line moves the noise by metres per degree at 400 m from the origin
      vec2 lAx = vec2(${LANDFORM_TRIAL.ax.toFixed(4)}, ${LANDFORM_TRIAL.az.toFixed(4)});
      vec2 lQ = vec2(dot(rwp - vec2(${LANDFORM_TRIAL.cx.toFixed(1)}, ${LANDFORM_TRIAL.cz.toFixed(1)}), lAx), dot(rwp - vec2(${LANDFORM_TRIAL.cx.toFixed(1)}, ${LANDFORM_TRIAL.cz.toFixed(1)}), vec2(-lAx.y, lAx.x)));
      // levels wander by a few tenths of a period, slowly along the contour and quickly across it
      float lWarp = (ddCoastNoise(vec2(lQ.x / 13.0, lQ.y / 24.0) + vec2(2.3, 7.1)) - 0.5) * 0.9 + (ddCoastNoise(vec2(lQ.x / 5.5, lQ.y / 10.0) + vec2(9.1, 3.7)) - 0.5) * 0.30;
      float lS = rhc / ${R.ledgeM.toFixed(2)} + lWarp * 1.5 + (ddCoastNoise(vec2(lQ.x / 8.0, lQ.y / 19.0) + vec2(3.3, 12.4)) - 0.5) * 1.6;
      float lF = fract(lS);
      float lRiserF = ${R.ledgeRiser.toFixed(3)} * (0.65 + 0.7 * ddCoastNoise(vec2(lQ.x / 23.0, lQ.y / 31.0) + vec2(6.6, 2.1)));
      float lRiser = smoothstep(0.0, 0.05, lF) * (1.0 - smoothstep(lRiserF - 0.04, lRiserF, lF));
      float lQr = clamp(lF / lRiserF, 0.0, 1.0);
      // grass tongues run down the fall line between the faces; more rock the steeper it is
      float lTongue = ddCoastNoise(vec2(lQ.x / 5.2, lQ.y / 12.0) + vec2(4.4, 1.2)) * 0.6 + ddCoastNoise(vec2(lQ.x / 2.1, lQ.y / 5.0) + vec2(1.1, 8.8)) * 0.4;
      // each level gets its own run pattern, so the faces are short broken runs and the levels do not read as terraces
      float lLevel = floor(lS);
      float lRun = ddCoastNoise(vec2(lQ.x / 6.5 + lLevel * 3.17, lLevel * 5.31 + 0.7)) * 0.65 + ddCoastNoise(vec2(lQ.x / 2.4 + lLevel * 1.9, lLevel * 2.3)) * 0.35;
      float lCov = smoothstep(0.30 - 0.12 * lSteep, 0.40 - 0.12 * lSteep, lTongue + (lSteep - 0.5) * 0.25) * smoothstep(0.50, 0.60, lRun + (lSteep - 0.5) * 0.12);
      float lBroad = smoothstep(0.12, 0.38, ddCoastNoise(rwp / 31.0 + vec2(14.2, 3.9)));
      rLedgeW = lSteep * lRiser * lCov * lBroad * ${R.ledgeCover.toFixed(2)};
      float lTread = lSteep * (1.0 - lRiser) * 0.6;
      // dark under the face's foot, a lit lip at its top
      float lTone = mix(${R.ledgeDark.toFixed(2)}, ${R.ledgeLight.toFixed(2)}, smoothstep(0.0, 0.14, lQr)) + 0.30 * smoothstep(0.80, 0.97, lQr);
      float lGrain = uGdRockReady > 0.5 ? ddCoastLum(uGdRock, vec3(0.0, 1.0, 0.0), rwp, 3.4) : 1.0;
      vec3 lCol = vec3(rLum * lTone) * vec3(1.18, 1.02, 0.68) * mix(1.0, lGrain, 0.85);
      rc = mix(rc, lCol, rLedgeW * rOpen);
      gdLedgeBump = vec3(lFall, (rLedgeW * ${R.ledgeBend[0].toFixed(2)} - lTread * (1.0 - rLedgeW) * ${R.ledgeBend[1].toFixed(2)}) * rAmt);
    }
    rRockW *= 1.0 - 0.65 * lSteep;` : ''}
    rc = mix(rc, rSoil, rSoilW);
    rc = mix(rc, rRock, rRockW);
    ${ledgeOn && R.outcrop > 0 ? `// taste-r1 (W23-B): the outcrop goes on last, over the soil and the rock tone, so it is not diluted by them.
    rc *= mix(1.0, ${R.outcropUnder.toFixed(2)}, oUnder);
    rc = mix(rc, oCol, rLedgeW);` : ''}
    ${scrubOn ? `if (uGroundScrub > 0.0) {
      // taste-r1 (W20-D): low scrub and tussock. Density from moderate slope and hollows, chosen by wide patches.
      vec3 sc0 = diffuseColor.rgb;
      float scRatio = sc0.g / max(sc0.r, 1e-4);
      float scLum = dot(sc0, vec3(0.2126, 0.7152, 0.0722));
      float scPasture = smoothstep(0.70, 0.82, scRatio) * (1.0 - smoothstep(0.065, 0.095, scLum));
      ${regionOn ? 'scPasture *= 1.0 - venueRegion(vVenueWorld.xz) * uVenueMix;' : ''}
      float scSlope = smoothstep(${SC.slope[0].toFixed(3)}, ${SC.slope[1].toFixed(3)}, rSl) * (1.0 - smoothstep(${SC.slope[2].toFixed(3)}, ${SC.slope[3].toFixed(3)}, rSl));
      float scHollow = clamp((rCrown - ${SC.hollow[0].toFixed(2)}) / ${(SC.hollow[1] - SC.hollow[0]).toFixed(2)}, 0.0, 1.0);
      float scPatch = smoothstep(0.34, 0.56, 0.55 * ddCoastNoise(rwp / ${SC.patchM[0].toFixed(1)} + vec2(31.1, 7.3)) + 0.45 * ddCoastNoise(mat2(0.8660254, 0.5, -0.5, 0.8660254) * rwp / ${SC.patchM[1].toFixed(1)} + vec2(2.7, 19.9)));
      float scD = clamp(max(max(scSlope, 0.85 * scHollow), ${SC.flat.toFixed(2)}) * scPatch, 0.0, 1.0) * scPasture * (1.0 - rSoilW * 1.5) * (1.0 - rRockW * 2.0);
      scD = clamp(scD, 0.0, 1.0) * clamp(uGroundScrub, 0.0, 1.0);
      if (scD > 0.003) {
        float scFar = smoothstep(${SC.fade[0].toFixed(0)}.0, ${SC.fade[1].toFixed(0)}.0, length(vViewPosition));
        float scV = gdScrubV(rwp);
        float scThr = 0.74 - 0.30 * scD;
        float scCov = smoothstep(scThr, scThr + 0.06, scV);
        float scCore = smoothstep(scThr + 0.12, scThr + 0.30, scV);
        ${scrubFull ? `#if NUM_DIR_LIGHTS > 0
        vec2 scSun = (vec4(directionalLights[0].direction, 0.0) * viewMatrix).xz;
        #else
        vec2 scSun = vec2(0.5, 0.5);
        #endif
        scSun = scSun / max(length(scSun), 1e-3);
        float scRim = clamp((scV - gdScrubV(rwp + scSun * 1.5)) * 7.0, -1.0, 1.0);
        float scFleck = (0.86 + 0.28 * ddCoastNoise(rwp / 0.7 + vec2(5.5, 2.5))) * (uGdReady > 0.5 ? mix(1.0, ddCoastLum(uGdPack, vec3(0.0, 1.0, 0.0), rwp + vec2(41.0, 17.0), 3.5), 0.85) : 1.0);` : `float scRim = 0.0; float scFleck = 1.0;`}
        float scTone = mix(${SC.body.toFixed(2)}, ${SC.core.toFixed(2)}, scCore) + (max(scRim, 0.0) * ${(SC.rim - SC.body).toFixed(2)} + min(scRim, 0.0) * ${SC.shade.toFixed(2)}) * (1.0 - 0.5 * scCore);
        scTone *= mix(scFleck, 1.0, smoothstep(40.0, 140.0, length(vViewPosition)));
        float scMeanTone = ${SC.body.toFixed(2)};
        float scW = mix(scCov, ${SC.meanCover.toFixed(2)} * scD, scFar) * mix(1.0, 0.0, 0.0);
        float scT = mix(scTone, scMeanTone, scFar);
        vec3 scCol = vec3(rLum * scT) * vec3(${SC.hue[0].toFixed(2)}, ${SC.hue[1].toFixed(2)}, ${SC.hue[2].toFixed(2)});
        rc = mix(rc, scCol, scW);
        ${scrubFull ? `{
          float scBw = scCov * scD * (1.0 - scFar) * ${SC.bump.toFixed(2)};
          if (scBw > 0.002) {
            vec2 scE = vec2(1.0, 0.0);
            vec2 scG = vec2(gdScrubV(rwp + scE.xy) - gdScrubV(rwp - scE.xy), gdScrubV(rwp + scE.yx) - gdScrubV(rwp - scE.yx));
            scG *= min(1.0, 0.16 / max(length(scG), 1e-4));
            scBump = vec3(scG, scBw);
          }
        }` : ''}
      }
    }` : ''}
    // taste-r1 (W20-D): shade goes brown, never mauve. Where soil or rock shows, the blue is held to a share of the
    // green and the green to the red.
    float rEarthW = clamp(rSoilW * 1.6 + rRockW * 1.4, 0.0, 1.0);
    rc.g = min(rc.g, mix(rc.g, max(rc.r, rc.g * 0.96), rEarthW));
    rc.b = min(rc.b, mix(rc.b, ${R.earthBlueMax.toFixed(2)} * rc.g, rEarthW));
    diffuseColor.rgb = mix(diffuseColor.rgb, rc, rAmt);
  }
}` : ''}${formOn ? `
{
  // taste-r1 (W25): ground form (see GROUND_FORM). Independent of the relief block's 700 to 900 m fade: the broad landform is what the overview reads.
  float gfA = (1.0 - smoothstep(${FM.fade[0].toFixed(1)}, ${FM.fade[1].toFixed(1)}, length(vViewPosition))) * (1.0 - rimCover);
  if (gfA > 0.0) {
    vec2 gfP = (vRingWorld.xz - uRingHOrigin) / uRingHSpan;
    #if NUM_DIR_LIGHTS > 0
    vec2 gfSun = (vec4(directionalLights[0].direction, 0.0) * viewMatrix).xz;
    #else
    vec2 gfSun = vec2(0.0);
    #endif
    float gfSunH = length(gfSun);
    vec2 gfS = gfSun / max(gfSunH, 1e-3);
    // slope toward the sun (tan of the angle) over ${FM.slopeM.toFixed(0)} m; the same sun as the cast shadows
    vec2 gfStep = gfS * (${(FM.slopeM * 0.5).toFixed(1)} / uRingHSpan);
    float gfFace = (ringHAt(gfP - gfStep) - ringHAt(gfP + gfStep)) / ${FM.slopeM.toFixed(1)};
    float gfT = tanh(gfFace / ${FM.slopeRef.toFixed(3)}) * smoothstep(0.05, 0.25, gfSunH);
    float gfDark = clamp(-gfT, 0.0, 1.0);
    // crest +1, hollow -1 over the ${FM.ringM.toFixed(0)} m ring
    float gfR = ${FM.ringM.toFixed(1)} / uRingHSpan;
    float gfH = ringHAt(gfP);
    float gfRm = 0.25 * (ringHAt(gfP + vec2(gfR, 0.0)) + ringHAt(gfP - vec2(gfR, 0.0)) + ringHAt(gfP + vec2(0.0, gfR)) + ringHAt(gfP - vec2(0.0, gfR)));
    float gfCr = -tanh((gfRm - gfH) / ${FM.curvM.toFixed(3)});
    float gfHy = ${FM.curvHue.toFixed(3)} * gfCr;
    float gfV = max(${FM.floor.toFixed(2)}, (1.0 + ${FM.slopeGain.toFixed(3)} * gfT) * (1.0 + ${FM.curvVal.toFixed(3)} * gfCr));
    vec3 gfF = gfV * vec3(1.0 + gfHy, 1.0 + 0.35 * gfHy, 1.0 - 0.25 * abs(gfHy)) * mix(vec3(1.0), vec3(${FM.darkWarm.map(v => v.toFixed(2)).join(', ')}), gfDark);
    gfF.b = min(gfF.b, gfF.g); // the form never raises the blue against the green
    diffuseColor.rgb *= mix(vec3(1.0), gfF, gfA);
  }
}` : ''}
#include <roughnessmap_fragment>`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
${reliefOn && (R.shadeWarm[1] < 1 || R.shadeWarm[2] < 1) ? `{
  // taste-r1 (W20-D): shade goes brown, never mauve (see GROUND_RELIEF.shadeWarm).
  float gdLitL = dot(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3(0.2126, 0.7152, 0.0722));
  float gdShade = (1.0 - smoothstep(0.015, 0.09, gdLitL)) * clamp(uGroundRelief, 0.0, 1.0);
  reflectedLight.indirectSpecular *= mix(vec3(1.0), vec3(${R.shadeWarm.map(v => v.toFixed(2)).join(', ')}), gdShade);
  // taste-r1 (W21 review): on a real scarp the face away from the sun is lit by the sky alone and read navy (5, 19, 46); the sky's share is warmed and lifted in deep shade.
  reflectedLight.indirectDiffuse *= mix(vec3(1.0), vec3(${R.shadeLift.map(v => v.toFixed(2)).join(', ')}), gdShade);
}` : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
${scrubFull ? `normal = normalize(normal + (viewMatrix * vec4(-scBump.x, 0.0, -scBump.y, 0.0)).xyz * scBump.z);` : ''}
${ledgeOn ? `normal = normalize(normal + (viewMatrix * vec4(gdLedgeBump.x, 0.0, gdLedgeBump.y, 0.0)).xyz * gdLedgeBump.z);` : ''}
${reliefOn ? `{
  float bnF = uGroundRelief * (1.0 - smoothstep(250.0, 700.0, length(vViewPosition))) * ${R.bendM.toFixed(2)};
  if (bnF > 0.0) {
    vec2 bp = vRingWorld.xz;
    float bgx = gdBendField(bp + vec2(1.5, 0.0)) - gdBendField(bp - vec2(1.5, 0.0));
    float bgz = gdBendField(bp + vec2(0.0, 1.5)) - gdBendField(bp - vec2(0.0, 1.5));
    normal = normalize(normal + (viewMatrix * vec4(-bgx, 0.0, -bgz, 0.0)).xyz * bnF * 0.33);
  }
}` : ''}`);
  };
  material.customProgramCacheKey = () => `${key}|ground-detail-w15c1-v3-${nearOn}-w19b${reliefOn}-w20d${tornOn}${scrubOn}${scrubFull}${regionOn}${R.shadeWarm.join('_')}-${R.shadeLift.join('_')}${ledgeOn ? `-w22bl${R.ledgeM}${R.outcrop > 0 ? `-w23b${R.outcropThr}${R.outcropRun}${R.outcropRock}${R.outcropSlope.join('_')}${R.outcropCover}${R.outcropLip}${R.outcropUnder}${R.outcropBend.join('_')}` : ''}` : ''}${gsOn ? groundSurfaceKey() : ''}${formOn ? `-w25f${FM.slopeM}_${FM.slopeRef}_${FM.slopeGain}_${FM.floor}_${FM.darkWarm.join('_')}_${FM.ringM}_${FM.curvM}_${FM.curvVal}_${FM.curvHue}_${FM.fade.join('_')}` : ''}`;
  material.needsUpdate = true;
  return material;
}

/**
 * taste W28 (CRUST_GRAIN, edge-massing.js): the hinterland's own luminance grain on a material that is not the hinterland sheet, the
 * outer land's crust. Past r 624 the sheet ends and the crust shows a painted map at metres a texel with no grain, so the surface
 * went soft at the join. This is the pass above reduced to its two grain terms and nothing else (no relief, scrub, ledge or form): the
 * same pack (`loadCoastPack('ground')`, so the same texture and the same `uGdReady`), the same `ddCoastLum`, the same channel read off
 * the colour that is there, the same amplitudes and the same fades with view distance (`GROUND_DETAIL`: near 16 m gone between 300 and
 * 500 m, macro 96 m gone between 500 and 800 m). Luminance only. The gate is the crust's own radius, `from - ramp` to `from` metres from
 * the ring centre, so it is whole at r `from` (under the sheet below that) and the grain is the same on both sides of the join.
 * `opts.grain` = { from, ramp }; the crust material needs `attachRingAlbedo` with a height texture (it declares `uRingHOrigin`).
 */
export function attachGroundGrain(material, opts = {}) {
  if (!material) return material;
  const { texture, ready } = loadCoastPack('ground');
  const nearOn = opts.near === false ? 0 : 1;
  const { from = 624, ramp = 8 } = opts.grain ?? {};
  const G = GROUND_DETAIL;
  const gsOn = GROUND_SURFACE.on > 0; // taste W79 (GROUND_SURFACE, G2b): the crust's grain wears the module's fades and reads the far ring's channel
  const GF = gsOn ? GS.grain : G;
  const f1 = (v) => v.toFixed(1);
  const previous = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    if (typeof previous === 'function') previous(shader, renderer);
    shader.uniforms.uGdPack = { value: texture };
    shader.uniforms.uGdReady = ready;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uGdPack;
uniform float uGdReady;
${COAST_DETAIL_GLSL}${gsOn ? `\n${groundSurfaceCommonGlsl()}` : ''}`)
      .replace('#include <roughnessmap_fragment>', `{
  // taste W28 (CRUST_GRAIN): the hinterland's grain and macro terms (attachGroundDetail), from r ${f1(from)} outward.
  float cgGate = smoothstep(${f1(from - ramp)}, ${f1(from)}, length(vRingWorld.xz - (uRingHOrigin + vec2(uRingHSpan * 0.5))));
  if (cgGate > 0.0 && uGdReady > 0.5) {
    float cgDist = length(vViewPosition);
    float cgNear = ${nearOn.toFixed(1)} * (1.0 - smoothstep(${f1(GF.nearFade[0])}, ${f1(GF.nearFade[1])}, cgDist));
    float cgMacro = 1.0 - smoothstep(${f1(GF.macroFade[0])}, ${f1(GF.macroFade[1])}, cgDist);
    if (cgMacro > 0.0) {
${gsOn ? `      // taste W79 (GROUND_SURFACE, G2b): the channel is the far ring's (the field's mean, sand as dry), not read off the colour that is there.
      float cgMeadow = gsChannel.y;
      float cgEarth = gsChannel.z;
` : `      vec3 cgC = diffuseColor.rgb;
      float cgRatio = cgC.g / max(cgC.r, 1e-4);
      float cgMeadow = smoothstep(0.95, 1.20, cgRatio);
      float cgEarth = smoothstep(0.72, 0.62, cgRatio);
`}      cgEarth = max(cgEarth, smoothstep(${(G.steepY + 0.03).toFixed(2)}, ${(G.steepY - 0.02).toFixed(2)}, ringNCache.y));
      cgMeadow *= 1.0 - cgEarth;
      float cgDry = max(0.0, 1.0 - cgMeadow - cgEarth);
      vec3 cgCh = vec3(cgDry, cgMeadow, cgEarth);
      float cgNearAmp = mix(${G.nearAmp.toFixed(2)}, ${G.meadowNearAmp.toFixed(2)}, cgMeadow);
      float cgScale = 1.0;
      if (cgNear > 0.0) {
        float cgLumNear = ddCoastLum(uGdPack, cgCh, vRingWorld.xz, ${f1(G.nearRepeatM)});
        cgScale *= mix(1.0, cgLumNear, cgNear * cgNearAmp * 5.0);
      }
      float cgLumMacro = ddCoastLum(uGdPack, cgCh, vRingWorld.xz, ${f1(G.macroRepeatM)});
      cgScale *= mix(1.0, cgLumMacro, cgMacro * ${(G.macroAmp * 5).toFixed(2)});
      ${gsOn ? 'diffuseColor.rgb *= gsTemper(mix(1.0, cgScale, cgGate));' : 'diffuseColor.rgb *= mix(1.0, cgScale, cgGate);'}
    }
  }
}
#include <roughnessmap_fragment>`);
  };
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|crust-grain-w28-1-${nearOn}-${from}-${ramp}${gsOn ? groundSurfaceKey() : ''}`;
  material.needsUpdate = true;
  // taste W88 (GROUND_SURFACE crustWarm): the sheet's warm-sky block on the crust. A separate layer, chained only when it is on, so the grain pass above is the
  // same source text off (the default program key of a material is the text of its last onBeforeCompile).
  if (gsOn && GROUND_SURFACE.crustWarm > 0) attachCrustWarm(material, { from, ramp, k: GROUND_SURFACE.crustWarm });
  return material;
}

/**
 * taste W88 (GROUND_SURFACE `crustWarm`, `?groundSurfaceCrustWarm=` / `DD_GROUND_SURFACE_CRUST_WARM`, 0 to 1): the sheet's `#include <lights_fragment_end>` block
 * (`attachGroundDetail`: `GROUND_RELIEF.shadeWarm` on the indirect specular and `shadeLift` on the sky's diffuse share, each by gdShade = 1 - smoothstep(0.015, 0.09,
 * luma of the lit diffuse)) on the crust, with the same coefficients and the same law. On the sheet the block ends with the sheet at r 624 and the crust took the sky
 * light unwarmed (its blue 12 % higher against its red), a step of about 11 % in the land's saturation within 2 m. The crust's weight is the grain's gate,
 * `smoothstep(from - ramp, from, r)` from the ring centre (616 to 624): whole at r 624, where the sheet's own block ends. Between 616 and 624 the sheet is drawn over the
 * crust (the same polygon offset, the sheet seated on the crust to centimetres under ONE_GROUND, the crust discarded inside 616), so there the crust shows only where
 * the sheet has no quad, at a weight under 1. The knob rides a uniform (`uCrustWarm`, knob x `GROUND_RELIEF.amount`); at 0 the layer is not chained and the crust's
 * text and key are W87's.
 */
export function attachCrustWarm(material, { from = 624, ramp = 8, k = 1 } = {}) {
  const R = GROUND_RELIEF;
  const on = k > 0 && R.amount > 0 && (R.shadeWarm[1] < 1 || R.shadeWarm[2] < 1);
  if (!material || !on) return material;
  const f1 = (v) => v.toFixed(1);
  const previous = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    if (typeof previous === 'function') previous(shader, renderer);
    shader.uniforms.uCrustWarm = { value: k * Math.min(1, Math.max(0, R.amount)) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uCrustWarm;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  // taste W88 (GROUND_SURFACE crustWarm): the sheet's block (attachGroundDetail) with GROUND_RELIEF's coefficients, ramped in over r ${f1(from - ramp)} to ${f1(from)}.
  float gdLitL = dot(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3(0.2126, 0.7152, 0.0722));
  float cwGate = smoothstep(${f1(from - ramp)}, ${f1(from)}, length(vRingWorld.xz - (uRingHOrigin + vec2(uRingHSpan * 0.5))));
  float gdShade = (1.0 - smoothstep(0.015, 0.09, gdLitL)) * clamp(uCrustWarm, 0.0, 1.0) * cwGate;
  reflectedLight.indirectSpecular *= mix(vec3(1.0), vec3(${R.shadeWarm.map(v => v.toFixed(2)).join(', ')}), gdShade);
  reflectedLight.indirectDiffuse *= mix(vec3(1.0), vec3(${R.shadeLift.map(v => v.toFixed(2)).join(', ')}), gdShade);
}`);
  };
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|crust-warm-w88-${from}-${ramp}-${R.shadeWarm.join('_')}-${R.shadeLift.join('_')}`;
  material.needsUpdate = true;
  return material;
}
