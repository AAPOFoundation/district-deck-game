// @ts-check
/**
 * The water law (TASTE-BIBLE section 6) in one place.
 *
 * Every body of water answers depth and weather through these numbers: the open
 * ocean, the port basin, the beach shelf and shore, the Apostles bay, and later
 * the park pond, the Grand Prix lake and the farm dams. A body changes only its
 * wave preset (`WATER_LAW.waves`); the depth ramp, the foam rule and the weather
 * response are shared. Colours come from `taste-tokens.js`, never retyped here.
 *
 *   GLSL   `waterLawGlsl()`  -> ddWaterRamp(depth), ddWaterFogMix(dist), ddWaterWeather(...)
 *   CPU    `waterRampHex(depth)`, `waterRampLinear(depth)` for vertex colours and tests
 *
 * Pure data plus helpers; no three.js import, so node tests and the browser share it.
 */
import { TASTE, TASTE_RAIN } from '../taste-tokens.js';

export const WATER_LAW = Object.freeze({
  /** [depth m, hex] stops: 0.5 m shallow, 2 m mid, 6 m midDeep, 15 m deep. */
  ramp: TASTE.water.ramp,
  foam: TASTE.water.foam,
  /** Absorption exp(-depth / absorptionDepth) sets how long the bed shows through. */
  absorptionDepth: TASTE.water.absorptionDepth,
  /**
   * Beyond `near` metres the ramp tints toward the fog colour, reaching half at `half`.
   * The bible's curve is 250 / 900, shared with the scene fog. The land does not take that
   * fog yet, and a sea hazed on a curve the land ignores reads as a grey sheet beside a
   * crisp coast at the overview camera. Until the scene fog lands, the sea keeps its depth
   * ramp out to the overview distance; set this back to 250 / 900 in the same change that
   * fogs the land.
   */
  fog: Object.freeze({ colour: TASTE.fog, near: 400, half: 2600 }),
  /**
   * Wave shape (TASTE-BIBLE section 6, as amended by the round-one gate, ruling 1).
   * Swell is three directional components; each runs at its deep-water speed
   * c = sqrt(g L / 2 pi), so omega = sqrt(g k). Headings are degrees off the
   * prevailing direction. The sum is multiplied by `envelope`: two octaves of
   * value noise (90 m and 220 m features) drifting ONSHORE at 3.0 m/s (taste-r1 W14-A: a swell group travels at its group speed, not 0.4 m/s out to sea) and mapped to
   * 0.45-1.0, so swell arrives in groups and never as one stripe. Chop is two
   * components at +35 and -35 degrees off the swell. Presets scale amplitude only.
   * Amplitudes are effective metres; `outer-ocean.js` divides by uWaveScale.
   */
  waves: Object.freeze({
    /** The bay's own onshore heading; the swell headings are offsets from it. */
    prevailingDeg: 8,
    /** taste-r1 (W14-A): share of the wind host weight a clear sky carries (rain is 1). Whitecaps are "wind state" only. */
    clearWind: 0.9,
    envelope: Object.freeze({ octaves: Object.freeze([90, 220]), weights: Object.freeze([0.58, 0.42]), drift: 3.0, min: 0.45, max: 1.0 }),
    ocean: Object.freeze({
      // taste-r1 (W15 fix): the swell was one heading, one spacing and one amplitude (24, 28 and 13 m at -25, -12 and -35: a 23 degree fan, 0.95 of
      // the 8-33 m energy in one 40 degree sector), which read as corduroy at the bay and satin folds at 21. Now two main trains 24 degrees apart
      // (the 24 m carrier, unchanged, which the swash and breaker clock read, and a 31 m train) and a third 20 degrees further round, shorter (14 m)
      // and the lightest in amplitude; the three are read in their own frames for finite crests (SURF_OPEN.crestScale / travelScale in water/surf.js).
      // Crest sum stays 0.28 m. taste-r1 (W15 re-check): two near-equal trains 24 degrees apart crossed into a diamond lattice at the
      // 240 m camera, so the carrier now leads (0.146) and the other two are about half of it (0.073, 0.061); with the lower group floor
      // (SURF_OPEN.envMin 0.30; 0.15 from W16) crests end instead of crossing everywhere.
      swell: Object.freeze([
        Object.freeze({ len: 24, headingDeg: -25, amp: 0.146 }),
        Object.freeze({ len: 31, headingDeg: -1, amp: 0.073 }),
        Object.freeze({ len: 14, headingDeg: 19, amp: 0.061 }),
      ]),
      chop: Object.freeze([
        Object.freeze({ len: 3, headingDeg: 35, amp: 0.04 }),
        Object.freeze({ len: 2.3, headingDeg: -35, amp: 0.025 }),
      ]),
      swellScale: 1,
      chopScale: 1,
      // taste-r1 (W17-A): shade-only components. The three geometric trains above are three sharp lines in the spectrum; from the 240 m and 480 m
      // cameras the shade (which is the slope, not the height) read as repeated ribs, a crossing lattice and scalloped cells. These six add slope
      // to the SHADE only, in the fragment stage (water/sea.js ddSeaShadeGrad, read by water/aqua.js bandSlope): no hull, no height and no CPU twin
      // of the height field moves. Wavelengths 9.5 to 38 m, none a multiple of 24, 31 or 14; headings (degrees off the prevailing one) spread over
      // 69 degrees and at least 8 degrees from each geometric train (-25, -1, 19); `slope` is the peak slope (the strongest train, 24 m, is 0.038, so
      // no component exceeds a third of it); `crestM` / `travelM` are the group envelope's scales in its own frame (60 to 200 m), `seed` places the noise.
      // `gain` scales every slope (0 switches the effect off with the code left in); the components fade in between `fadeFrom` and `fadeTo` metres from
      // the shore (they do not refract as the trains do), and are off at low quality. `wanderRad` / `wander2Rad` are two octaves of phase wander (radians at `wanderM` / `wander2M` metres), so no
      // component holds one spacing, and `trainShare` is the share of its slope the three geometric trains keep in the shade where the components are on. Undo: gain 0.
      shadeTrains: Object.freeze({
        // taste-r1 (W17 review): off. With the components carrying most of the shade and a strong phase wander the sea read as tangled
        // wood grain at the 240 m and 480 m cameras (the orchestrator and the outside reviewer both said drop). The code stays for a
        // version whose components keep under a third of a train's slope and wander less than one radian.
        gain: 0,
        fadeFrom: 20,
        fadeTo: 60,
        envMin: 0.12,
        envLo: 0.30,
        envHi: 0.68,
        wanderRad: 3.5,
        wanderM: 45,
        wander2Rad: 4,
        wander2M: 18,
        trainShare: 0.45,
        items: Object.freeze([
          Object.freeze({ len: 38, headingDeg: -17, slope: 0.0218, crestM: 150, travelM: 200, seed: 1 }),
          Object.freeze({ len: 27, headingDeg: 30, slope: 0.0261, crestM: 110, travelM: 170, seed: 2 }),
          Object.freeze({ len: 21, headingDeg: -12, slope: 0.0261, crestM: 90, travelM: 150, seed: 3 }),
          Object.freeze({ len: 17, headingDeg: 8, slope: 0.0249, crestM: 75, travelM: 130, seed: 4 }),
          Object.freeze({ len: 11.5, headingDeg: -33, slope: 0.0218, crestM: 65, travelM: 100, seed: 5 }),
          Object.freeze({ len: 9.5, headingDeg: 36, slope: 0.0186, crestM: 60, travelM: 90, seed: 6 }),
        ]),
      }),
    }),
    basin: Object.freeze({ swell: null, chop: null, swellScale: 0, chopScale: 0.5 }),
    pond: Object.freeze({ swell: null, chop: Object.freeze([Object.freeze({ len: 0.6, headingDeg: 35, amp: 0.04 })]), swellScale: 0, chopScale: 0.25 }),
  }),
  /** Deep-water phase speed of the 24 m component, metres per second (c = sqrt(g L / 2 pi)). */
  swellSpeed: 6.1,
  /**
   * Specular micro-structure (the sparkle). A 0.35-0.7 m detail field animated at 0.6 Hz and
   * advected with the swell feeds the specular lobe only: it modulates roughness between
   * `glint` on glint centres and `trough` in the troughs, and never reaches the diffuse,
   * refraction or Fresnel colour. The weight is multiplied by a smoothstep of the swell slope
   * toward the sun, so sparkle gathers on sun-facing crest flanks in groups, and it fades to
   * zero between `fadeFrom` and `fadeTo` metres from the camera.
   */
  sparkle: Object.freeze({
    cellM: 0.52,
    hz: 0.6,
    /**
     * Drift of the detail field along the swell heading. The swell itself runs at its deep-water
     * 6 m/s; the glint field follows it slowly because a 0.5 m speck moving 6 m/s smears into a
     * dash through the temporal resolve at low frame rates.
     */
    advectMps: 1.2,
    roughness: Object.freeze({ glint: 0.06, trough: 0.25 }),
    fadeFrom: 400,
    fadeTo: 600,
    /**
     * W6-A near-field cap. A 0.3 m speck that reads as a 2 px sparkle at 240 m is a 5 px white
     * confetti dot at 85 m (shallow high-pass SD 11.9-15 against a limit of 4.5). Inside `nearTo`
     * metres the glint weight falls to `nearWeight` and the speck radius to `nearSize` of its far
     * value, both on the square of a smoothstep from `nearFrom`, so the field is whole at 120 m and
     * a faint scatter of pin-points by 60 m.
     */
    nearFrom: 60,
    nearTo: 120,
    nearWeight: 0.12,
    nearSize: 0.5,
  }),
  /** Sea in rain (ruling 2): the numbers live in TASTE_RAIN.sea. */
  rainSea: TASTE_RAIN.sea,
  /**
   * Radiance per unit token. The graded display runs at about 6.5 display-linear
   * per unit of shader radiance in the dark end of the range (measured with the
   * gain sweep in the report), so a token reaches the screen near itself at about 0.12 once the 0.3 desaturation is applied.
   */
  bodyGain: 0.12,
  /** Pre-tonemap desaturation of the ramp: the AgX toe turns dark teal into ink blue. */
  bodyDesat: 0.35,
  /** Neutral radiance floor that lifts the red and green channels out of the toe. */
  bodyFloor: 0.002,
  /** Share of the sky mirror kept. At full weight the sky out-shone the whole ramp. */
  mirrorGain: 0.25,
  /** Radiance per unit token for the foam layer and rock-base foam (white must stay under V 93). */
  foamGain: 0.14,
  /** GGX roughness on crests and in troughs, plus the sparkle gain and ceiling (radiance). */
  specular: Object.freeze({ crest: 0.08, trough: 0.25, gain: 0.6, cap: 0.20 }),
  /** Shoreline foam: a band where the water is shallower than maxDepth. */
  shoreFoam: Object.freeze({
    maxDepth: 0.4,
    bandMin: 2,
    bandMax: 4,
    noiseM: 1.5,
    hz: 0.3,
    opacity: 0.7,
  }),
  /** Rain may dim and slightly desaturate the body. It never turns the sea grey. */
  weather: Object.freeze({
    // The round-one amendment renamed the token (desaturateMax -> desaturate, 0.08).
    desaturateMax: TASTE_RAIN.desaturate,
    /** Body gain at full cloud. The sun term is already gone from the radiance. */
    bodyGainOvercast: 0.86,
  }),
});

// Explicit sRGB transfer, independent of THREE.ColorManagement: a THREE.Color built
// from a hex is already linear when colour management is on, and converting it
// again darkens it twice (the existing surfaceUniforms palette carries that error).
const decode = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const encode = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** Linear-light RGB of an sRGB hex token. */
export function tokenLinear(hex) {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => decode(v / 255));
}

const smooth01 = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** CPU twin of `ddWaterRamp`: linear RGB of the column colour at `depth` metres. */
export function waterRampLinear(depth) {
  const stops = WATER_LAW.ramp.map(([d, hex]) => [d, tokenLinear(hex)]);
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  let c = stops[0][1];
  for (let i = 1; i < stops.length; i += 1) {
    c = mix(c, stops[i][1], smooth01(stops[i - 1][0], stops[i][0], depth));
  }
  return c;
}

/** sRGB hex of the ramp at `depth`. For vertex colours, decals and tests. */
export function waterRampHex(depth) {
  const hex = waterRampLinear(depth)
    .map((v) => Math.round(Math.min(1, Math.max(0, encode(v))) * 255).toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}`;
}

/** Fraction of the bed that still shows through `depth` metres of water. */
export function bedVisibility(depth) {
  return Math.exp(-Math.max(0, depth) / WATER_LAW.absorptionDepth);
}

/** CPU twin of `ddWaterFogMix`: 0 inside fog.near, 0.5 at fog.half, rising on the fog curve. */
export function waterFogMix(distance) {
  const { near, half } = WATER_LAW.fog;
  const k = Math.LN2 / (half - near);
  return 1 - Math.exp(-k * Math.max(0, distance - near));
}

const vec3 = ([r, g, b]) => `vec3(${r.toFixed(5)}, ${g.toFixed(5)}, ${b.toFixed(5)})`;

/**
 * GLSL for the shared law. Declares `ddWaterRamp`, `ddWaterFogMix` and
 * `ddWaterWeather`. Needs no uniforms of its own; the fog colour is passed in.
 */
export function waterLawGlsl() {
  const stops = WATER_LAW.ramp.map(([d, hex]) => [d, tokenLinear(hex)]);
  const f = (n) => n.toFixed(2);
  const { near, half } = WATER_LAW.fog;
  const k = Math.LN2 / (half - near);
  return /* glsl */ `
    #ifndef DD_WATER_LAW
    #define DD_WATER_LAW
    const vec3 DD_RAMP0 = ${vec3(stops[0][1])};
    const vec3 DD_RAMP1 = ${vec3(stops[1][1])};
    const vec3 DD_RAMP2 = ${vec3(stops[2][1])};
    const vec3 DD_RAMP3 = ${vec3(stops[3][1])};
    const vec3 DD_FOAM = ${vec3(tokenLinear(WATER_LAW.foam))};
    // Radiance per unit token, calibrated so the graded screen colour of the
    // water in a clear frame lands on the token (see report for the samples).
    const float DD_WATER_GAIN = ${WATER_LAW.bodyGain.toFixed(3)};
    // One depth-to-colour ramp. Each mix starts exactly on the previous token.
    vec3 ddWaterRamp(float d) {
      vec3 c = mix(DD_RAMP0, DD_RAMP1, smoothstep(${f(stops[0][0])}, ${f(stops[1][0])}, d));
      c = mix(c, DD_RAMP2, smoothstep(${f(stops[1][0])}, ${f(stops[2][0])}, d));
      return mix(c, DD_RAMP3, smoothstep(${f(stops[2][0])}, ${f(stops[3][0])}, d));
    }
    // Fog curve shared with the scene: 0 inside ${near} m, 0.5 at ${half} m.
    float ddWaterFogMix(float dist) {
      return 1.0 - exp(-${k.toFixed(6)} * max(dist - ${f(near)}, 0.0));
    }
    // Rain dims the body a little and removes at most desaturateMax of its chroma.
    vec3 ddWaterWeather(vec3 body, float cloud) {
      float grey = dot(body, vec3(0.2126, 0.7152, 0.0722));
      body = mix(body, vec3(grey), ${WATER_LAW.weather.desaturateMax.toFixed(3)} * clamp(cloud, 0.0, 1.0));
      return body * mix(1.0, ${WATER_LAW.weather.bodyGainOvercast.toFixed(3)}, clamp(cloud, 0.0, 1.0));
    }
    #endif
  `;
}

export default { WATER_LAW, waterRampLinear, waterRampHex, bedVisibility, waterFogMix, waterLawGlsl, tokenLinear };
