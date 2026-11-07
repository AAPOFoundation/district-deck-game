// District Deck — water/wave/sand module contract (W-AAA programme).
//
// This file is the SHARED FOUNDATION for the coastal render. It is owned by the
// integration seat. Module authors (waves.js / surface.js / foam.js / sand.js)
// READ it and code against it; they do not edit it. If you need something added
// here, say so in your report rather than editing — a silent change here breaks
// three other modules that compile into the same program.
//
// ─────────────────────────────────────────────────────────────────────────────
// COORDINATE FRAME
// ─────────────────────────────────────────────────────────────────────────────
// The coast is a straight line in world XZ (which edge depends on city.waterEdge).
// Every module works in TWO scalars derived from a world position:
//
//   shore  = metres seaward of the seawall face  (0 at wall, + out to sea)
//   along  = metres along the shore from board centre (signed)
//
// and one derived scalar:
//
//   front  = shore - coastLine(along, t)   // 0 at the meandered waterline
//
// `front` is what everything visual keys off: negative = up the beach,
// positive = out to sea. Never key foam or colour off raw `shore` — the
// waterline meanders and a straight-line key is the #1 cause of ruler bands.
//
// ─────────────────────────────────────────────────────────────────────────────
// GLSL INTERFACE (what each module must define)
// ─────────────────────────────────────────────────────────────────────────────
// waves.js   → WAVES_GLSL defines:
//                DDWave ddWaves(vec2 p, float front, float depth, float t)
//              where `p` is the FLAT position in the shore frame, (along, shore)
//              in metres, and struct DDWave {
//                vec3  offset;    // Gerstner XZ+Y displacement, metres
//                vec3  normal;    // analytic world-space surface normal
//                float steep;     // 0..1 wave-face steepness
//                float crest;     // 0..1 crest proximity
//                float fold;      // 0..1 folding / plunging amount (breaking)
//                float shoal;     // 0..1 how much this sample is a shore wave
//              }
//              + WAVES_UNIFORMS(quality) → plain object of THREE uniforms
//
// surface.js → SURFACE_GLSL defines:
//                vec4 ddSurface(DDSurfaceIn si)
//              struct DDSurfaceIn {
//                vec3 world; vec3 flatWorld; vec3 normal; vec3 viewDir;
//                float front; float depth; float height;
//                float crest; float steep; float fold; float shoal; float t;
//              }
//              returns premultiplied-free rgb + alpha for the water body
//              (foam is composited on top by water.js, do not add foam here)
//              + SURFACE_UNIFORMS(quality)
//
// foam.js    → FOAM_GLSL defines:
//                DDFoam ddFoam(DDFoamIn fi)
//              struct DDFoam { float cover; vec3 color; float alpha; }
//              struct DDFoamIn {
//                vec3 world; vec3 flatWorld; float front; float depth;
//                float crest; float steep; float fold; float shoal;
//                float along; float t;
//              }
//              + float ddSwashWet(float along, float front, float t)  // 0..1
//                ALSO CONSUMED BY sand.js — the wet band on the beach must be
//                the same function as the water's swash, or the join lies.
//              + FOAM_UNIFORMS(quality)
//
// sand.js    → makeSandMaterial(opts) / buildSandRelief(opts). Standard-material
//              based (onBeforeCompile), NOT part of the water program. It imports
//              SHORE_COMMON_GLSL + FOAM_GLSL's ddSwashWet only.
//
// ─────────────────────────────────────────────────────────────────────────────
// VARYINGS (vertex → fragment, fixed names, do not rename)
// ─────────────────────────────────────────────────────────────────────────────
//   vWorld vFlatWorld vWaveNormal vFront vAlong vDepth vHeight
//   vSteep vCrest vFold vShoal
//
// ─────────────────────────────────────────────────────────────────────────────
// HARD CONSTRAINTS (any module that breaks one has failed, however pretty)
// ─────────────────────────────────────────────────────────────────────────────
//  1. No Math.random / Date.now anywhere. Animation is driven by the `elapsed`
//     the capture harness steps, so plates are reproducible.
//  2. Wave troughs must never dip below WATER_FLOOR_Y — the presentation table
//     cloth lives at y ≈ -0.95 and a trough through it is a hole in the board.
//  3. Nothing may render over the playable board. All coastal geometry is
//     seaward of SHORE.wallOffset.
//  4. Presentation only. No sim state reads, no writes to state, no network.
//  5. Must compile on ANGLE/Metal WebGL2 with no extensions beyond derivatives.

import { SHORE } from '../shore.js';

/** Plane extent seaward (metres of open water past the coast). */
export const WATER_EXTENT = 420;
/** Mean still-water level. */
export const WATER_Y = 0.02;
/** Absolute floor for wave troughs (table cloth is at ≈ -0.95). */
export const WATER_FLOOR_Y = -0.55;
/** Beach shelf plane Y (board, water and stairs all share this). */
export const SAND_Y = SHORE.sandY ?? 0.06;
/** Shore-distance of the mean waterline, measured from the seawall face. */
export const WATER_FACE = SHORE.waterFromWall;
/** Dry beach depth seaward of the wall. */
export const SAND_SEAWARD = SHORE.sandSeaward;

/**
 * Bathymetry: how deep the water is at a given `front` distance.
 * A gentle beach ramp, a shallow offshore bar at ~55 m (waves feel it and
 * begin to steepen there), then the open-bay basin.
 * Units: metres. Shared by waves (shoaling), surface (colour) and foam (break).
 */
export const BATHY = Object.freeze({
  /** Depth reached at the far edge of the shelf. */
  maxDepth: 9.0,
  /** Distance over which the beach ramps to maxDepth. */
  rampLength: 165,
  /** Offshore sand-bar centre / half-width / rise (metres). */
  barAt: 55,
  barWidth: 26,
  barRise: 1.35,
  /** Depth at which a wave is treated as fully broken. */
  breakDepth: 1.25,
});

/**
 * The static meander of source A (`ddCoastLine` below and `coastLineAt` in interact.js): three fixed sines, [frequency, phase, amplitude].
 * The two moving sines of those functions are not here. Exported for the coast spine (wave 74); the shader text and the other
 * mirrors are untouched, and `tests/coast-spine.test.mjs` pins this table against both.
 */
export const COAST_MEANDER_STATIC = Object.freeze([
  Object.freeze({ freq: 0.0080, phase: 0, amp: 2.10 }),
  Object.freeze({ freq: 0.0191, phase: 1.7, amp: 1.15 }),
  Object.freeze({ freq: 0.0413, phase: 0.55, amp: 0.52 }),
]);

/** Metres of static meander at an along coordinate (the shader's three fixed sines, no time term). */
export function coastMeanderStaticAt(along) {
  const [a, b, c] = COAST_MEANDER_STATIC;
  return Math.sin(along * a.freq + a.phase) * a.amp
    + Math.sin(along * b.freq + b.phase) * b.amp
    + Math.sin(along * c.freq + c.phase) * c.amp;
}

/**
 * One Hoskins hash for the shore shaders and the CPU chop twin.
 * GLSL `mod` / `fract` stay in range for negative coordinates; JS `%` does not.
 * Float64 here is the same formula, not a claim of float32 pixel parity.
 */
export const DD_HASH = Object.freeze({
  period: 8192,
  mul: 0.1031,
  lift: 33.33,
});

/** GLSL `mod(x, m)` — result in [0, m) when m > 0. */
export function glslMod(x, m) {
  return x - m * Math.floor(x / m);
}

/** GLSL `fract`. */
export function glslFract(x) {
  return x - Math.floor(x);
}

/** CPU twin of `ddHash21`. Same constants as the shader string below. */
export function ddHash21(x, y) {
  const qx = glslMod(x, DD_HASH.period);
  const qy = glslMod(y, DD_HASH.period);
  const p3x = glslFract(qx * DD_HASH.mul);
  const p3y = glslFract(qy * DD_HASH.mul);
  const p3z = glslFract(qx * DD_HASH.mul);
  const dot = p3x * (p3y + DD_HASH.lift)
    + p3y * (p3z + DD_HASH.lift)
    + p3z * (p3x + DD_HASH.lift);
  return glslFract(((p3x + dot) + (p3y + dot)) * (p3z + dot));
}

/** CPU twin of `ddValueNoise`. */
export function ddValueNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = ddHash21(ix, iy);
  const b = ddHash21(ix + 1, iy);
  const c = ddHash21(ix, iy + 1);
  const d = ddHash21(ix + 1, iy + 1);
  const ab = a + (b - a) * ux;
  const cd = c + (d - c) * ux;
  return ab + (cd - ab) * uy;
}

/**
 * Shared GLSL: shore frame, bathymetry, hash/noise/fbm.
 * Injected ONCE into each program — every module may call these freely.
 * All functions are prefixed `dd` so they cannot collide with three.js chunks.
 */
export const SHORE_COMMON_GLSL = /* glsl */ `
  #ifndef DD_SHORE_COMMON
  #define DD_SHORE_COMMON

  uniform vec3  uShoreOrigin;   // world point on the seawall face
  uniform vec3  uShoreNormal;   // unit seaward vector (XZ)
  uniform float uWaterFace;     // shore-dist of the mean waterline
  uniform float uBathyMaxDepth;
  uniform float uBathyRamp;
  uniform float uBathyBarAt;
  uniform float uBathyBarWidth;
  uniform float uBathyBarRise;

  float ddShoreDist(vec3 w) { return dot(w - uShoreOrigin, uShoreNormal); }
  float ddAlong(vec3 w) { return dot(w.xz, vec2(uShoreNormal.z, -uShoreNormal.x)); }

  /**
   * Precision-safe 2D hash.
   *
   * The previous construction multiplied the raw argument by 233/852 before the
   * first fract(). Callers sample this in board metres — the coast runs to
   * several hundred — at band frequencies up to ~50x, so the product reached
   * 1e5–1e6, where a float32 has almost no fractional bits left. fract() then
   * returned one of a few dozen values and the "noise" became a regular
   * lattice: the SAND seat found it as a hard woven diagonal hatch across the
   * whole beach (sand-r3), and it was silently degrading every other caller's
   * fbm at high frequency too.
   *
   * Fixed by bounding the domain before any multiply and keeping every
   * intermediate small (Hoskins-style). The 8192-unit wrap is far larger than
   * any frame these callers appear in, so the period is not observable.
   */
  float ddHash21(vec2 p) {
    vec2 q = mod(p, ${DD_HASH.period.toFixed(1)});
    vec3 p3 = fract(vec3(q.x, q.y, q.x) * ${DD_HASH.mul});
    p3 += dot(p3, p3.yzx + ${DD_HASH.lift});
    return fract((p3.x + p3.y) * p3.z);
  }

  float ddValueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = ddHash21(i);
    float b = ddHash21(i + vec2(1.0, 0.0));
    float c = ddHash21(i + vec2(0.0, 1.0));
    float d = ddHash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float ddFbm(vec2 p, const int oct) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 6; i++) {
      if (i >= oct) break;
      v += a * ddValueNoise(p);
      p = p * 2.03 + vec2(19.7, 7.3);
      a *= 0.5;
    }
    return v;
  }

  // ── Coastline meander ──────────────────────────────────────────────────────
  // The waterline is not a ruler. Keep the amplitude small (±~3 m): large bays
  // produced sand tongues that read as offshore channels in earlier rounds.
  // Time terms are slow — this is the tide breathing, not a wave.
  float ddCoastLine(float along, float t) {
    float m = sin(along * 0.0080) * 2.10
            + sin(along * 0.0191 + 1.7) * 1.15
            + sin(along * 0.0413 + 0.55) * 0.52;
    m += sin(along * 0.0110 - t * 0.14) * 0.55
       + sin(along * 0.0281 + t * 0.21 + 1.1) * 0.32;
    return uWaterFace + m;
  }

  /** Signed distance seaward of the meandered waterline. */
  float ddFront(vec3 w, float t) { return ddShoreDist(w) - ddCoastLine(ddAlong(w), t); }

  // ── Bathymetry ─────────────────────────────────────────────────────────────
  /** Still-water depth (metres, >= 0) at a given front distance. */
  float ddDepth(float front) {
    float x = max(front, 0.0);
    // Beach ramp: concave so the first metres are very shallow.
    float ramp = pow(clamp(x / uBathyRamp, 0.0, 1.0), 0.78) * uBathyMaxDepth;
    // Offshore bar lifts the bed — waves trip on it and start to feel bottom.
    float d = (x - uBathyBarAt) / uBathyBarWidth;
    float bar = uBathyBarRise * exp(-d * d);
    return max(ramp - bar, 0.02);
  }

  /** 0 at the open bay → 1 in the surf zone. Drives shoaling and break foam. */
  float ddShoalEnv(float depth) {
    return 1.0 - smoothstep(0.6, 5.2, depth);
  }

  #endif
`;

/** Uniform block every water program needs (shore frame + bathymetry). */
export function shoreCommonUniforms(frame) {
  return {
    uShoreOrigin: { value: frame.origin.clone() },
    uShoreNormal: { value: frame.normal.clone() },
    uWaterFace: { value: WATER_FACE },
    uBathyMaxDepth: { value: BATHY.maxDepth },
    uBathyRamp: { value: BATHY.rampLength },
    uBathyBarAt: { value: BATHY.barAt },
    uBathyBarWidth: { value: BATHY.barWidth },
    uBathyBarRise: { value: BATHY.barRise },
  };
}

/** JS mirror of ddDepth — for geometry grading and any CPU-side placement. */
export function depthAt(front) {
  const x = Math.max(front, 0);
  const ramp = (x / BATHY.rampLength) ** 0.78 * BATHY.maxDepth;
  const d = (x - BATHY.barAt) / BATHY.barWidth;
  const bar = BATHY.barRise * Math.exp(-d * d);
  return Math.max(ramp - bar, 0.02);
}

/** Varying declarations shared by the water vertex + fragment shaders. */
export const WATER_VARYINGS_GLSL = /* glsl */ `
  varying vec3  vWorld;
  varying vec3  vFlatWorld;
  varying vec3  vWaveNormal;
  varying float vFront;
  varying float vAlong;
  varying float vDepth;
  varying float vHeight;
  varying float vSteep;
  varying float vCrest;
  varying float vFold;
  varying float vShoal;
`;

export default {
  WATER_EXTENT,
  WATER_Y,
  WATER_FLOOR_Y,
  SAND_Y,
  WATER_FACE,
  SAND_SEAWARD,
  BATHY,
  SHORE_COMMON_GLSL,
  WATER_VARYINGS_GLSL,
  shoreCommonUniforms,
  depthAt,
};
