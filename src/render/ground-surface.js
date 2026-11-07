// taste W78 (GROUND_SURFACE, phase G2a of the hinterland plan): one surface for the open ground's near sheet (r 20 to 560).
//
//   albedo = token(parcel) x form(n, live sun) x grain
//
// written once, with a CPU twin (the functions below the constants) that the node probes and `tests/ground-surface.test.mjs` read.
//   token(parcel)  the parcel id of the 72 m Voronoi (the lattice the furrows, the farm gate and the fences read), one of the three
//                  ground tokens by the parcel's use (`parcelReflectance` in fringe.js, unchanged), flat across the paddock and
//                  changing over `edgeBandM` metres centred on its edge. No 36 m warped blend, no free noise.
//   form           one multiplier on the linear albedo, from fields of the crust's baked height only: the live sun's shade (the same
//                  normal Lambert uses, `gain` wide), the crown/hollow ramps (+-`valuePct`), the crease wash in the hollows, and the
//                  temperature rule (lighter warmer, darker cooler and greener) that the grain follows too.
//   grain          the existing luminance tiles (coast-textures.js), fades set from M0's station medians (`grain` below).
// Off (the default) nothing here is compiled in: shader text, cache keys and positions are today's. Browser `?groundSurface=1`
// (`?groundSurfaceGain=0.22` for the knob), node `DD_GROUND_SURFACE=1` (`DD_GROUND_SURFACE_GAIN`). Judged only with ONE_GROUND on.
// W85 relief knobs (they act only with the switch on): `?groundSurfaceGain=` to 0.6, `?groundSurfaceFaceRef=` (`DD_GROUND_SURFACE_FACE_REF`, 0.03 to 0.3, 0.04 to start: the tilt
// where the shade's tanh reads 0.76; a small value takes more of the gentle ground to the full gain) and `?groundSurfaceFlatGate=1` (`DD_GROUND_SURFACE_FLAT_GATE`, on to start:
// the shade is gated by today's flank slope gate, smoothstep(0.004, 0.03, |n.xz|), so near-flat ground keeps its token at a small faceRef).
// W86 creek rock (acts only with the switch on): `?groundSurfaceCreekRock=` (`DD_GROUND_SURFACE_CREEK_ROCK`, 0 to 1, 1 to start: the fade on). The creek's carve (the valley, bar, thread and levee fields `creekFieldAt`
// cuts with, edge-massing.js `creekCarveFieldAt`) is carved earth, not rock: the rock weight is multiplied by (1 - knob x the carve's weight). The weight is baked into the form texture's blue channel
// (`uGsForm`, 512 x 512 over the 1440 m ring span, bilinear, 2.8 m texels), so the sheet and the crust read it from the texture they already sample. 0 is W85's text and key.
// W86 creek line (acts only with the switch on): `?groundSurfaceCreekLine=` (`DD_GROUND_SURFACE_CREEK_LINE`, 0 to 1, 1 to start: the line kept). The creek's drawn line (thread, bed and margin, painted into the ring albedo map by
// edge-massing.js `bakeRingAlbedo`) was lost under the statement, which replaces the map's colour on the sheet and the crust. With the switch on the bake writes the line's weight (the share of the texel's colour the creek's three
// layers make) into the map's alpha, which was 255 and read by nobody, and the sheet and the crust keep the map's colour by knob x weight over the statement. 0 is the text and key of W86's creek rock.
// W87 far sand (acts only with the switch on): `?groundSurfaceFarSand=` (`DD_GROUND_SURFACE_FAR_SAND`, 0 to 1, 1 to start). The far map's sand (edge-massing.js `bakeCrustFarAlbedo`) rises over a 12 m ramp laid wholly under the
// ribbon's sand (coast coordinate -1 to +11, seaward of the ribbon's landward row at -3, so the map's 5.5 m texel steps never show landward of the ribbon) and closes with the ribbon's own width over r 700 to 772, and its colour
// is the ribbon's dry sand as it reads on screen (`GS.farSand.display` x `beachDry`, in display space).
// Bytes only: no shader text or key changes; 0 is W86's map.
// W88 crust warm (acts only with the switch on): `?groundSurfaceCrustWarm=` (`DD_GROUND_SURFACE_CRUST_WARM`, 0 to 1, 1 to start). The sheet's `#include <lights_fragment_end>` block (fringe/ground-detail.js: the indirect specular
// takes `GROUND_RELIEF.shadeWarm`, the sky's diffuse share `shadeLift`, both by gdShade, 1 - smoothstep(0.015, 0.09, lit diffuse luma)) was not on the crust, so past r 624 the sky light kept its blue and the land's saturation fell about
// 11 % in a step of 2 m (blue only). The crust's grain pass (`attachGroundGrain`) now carries the same block with the same coefficients, its weight ramped over r 616 to 624 (the grain's gate), scaled by the knob (a uniform).
// 0 is W87's crust text and key.
// W87 shore rock (acts only with the switch on): `?groundSurfaceShoreRock=` (`DD_GROUND_SURFACE_SHORE_ROCK`, 0 to 1, 1 to start). The far shore's back slope (the crust's bank to the water, 40 to 60 degrees in the
// crust at r 616 to 811) took the rock tint (luminance x0.80, blue x0.70), a grey-mauve line beside the grass. The rock weight is multiplied by (1 - knob x the shore weight), the weight baked into the form texture's
// alpha (`shoreWeight`: waterness 0.08 to 0.16, from r 600 to 616; the ring height bake carries it as `shoreV`, as it carries the creek's `creekV`). Inside r 616 (the sheet's shore, where the ribbon draws the bluff) and on ground
// with waterness under 0.08 (the hills) the rock stays. 0 is W86's text, key and bytes.
import * as THREE from 'three';
import { TASTE } from './taste-tokens.js';

const envNum = (name, query, fallback) => {
  if (typeof process !== 'undefined' && process?.env?.[name] !== undefined) return Number(process.env[name]);
  if (typeof location !== 'undefined' && location?.search) {
    const v = new URLSearchParams(location.search).get(query);
    if (v !== null && v !== '') return Number(v);
  }
  return fallback;
};
const GAIN_BOUND = Object.freeze([0, 0.6]);
const FACE_REF_BOUND = Object.freeze([0.03, 0.3]);
const FACE_REF_DEFAULT = 0.04;
const CREEK_ROCK_BOUND = Object.freeze([0, 1]);
const CREEK_LINE_BOUND = Object.freeze([0, 1]);
const UNIT_BOUND = Object.freeze([0, 1]);
/** The slope gate today's painted flank uses (fringe.js `flankG`): the shade is 0 on |n.xz| under the first, whole over the second. */
const FLAT_GATE = Object.freeze([0.004, 0.03]);
/** The macro tile's fade with camera distance (m), G2b: from M0's medians (01 675 m, h1 571 m) and the CPU twin's in-parcel spread (see `GS.grain`). */
const MACRO_FADE_DEFAULT = Object.freeze([900, 1300]);

export const GROUND_SURFACE = Object.freeze({
  on: envNum('DD_GROUND_SURFACE', 'groundSurface', 0) > 0 ? 1 : 0,
  /** The form gain: the live sun's shade runs x(1 - gain) to x(1 + gain). Knob `groundSurfaceGain`; 0.45 to start. */
  gain: Math.min(GAIN_BOUND[1], Math.max(GAIN_BOUND[0], envNum('DD_GROUND_SURFACE_GAIN', 'groundSurfaceGain', 0.45))),
  /** The tilt (tan) where the shade's tanh reads 0.76. Knob `groundSurfaceFaceRef`, 0.03 to 0.3; 0.04 to start. */
  faceRef: Math.min(FACE_REF_BOUND[1], Math.max(FACE_REF_BOUND[0], envNum('DD_GROUND_SURFACE_FACE_REF', 'groundSurfaceFaceRef', FACE_REF_DEFAULT))),
  /** 1 gates the shade by `FLAT_GATE` on |n.xz| (near-flat ground keeps its token at a small faceRef). Knob `groundSurfaceFlatGate`; 1 to start. */
  flatGate: envNum('DD_GROUND_SURFACE_FLAT_GATE', 'groundSurfaceFlatGate', 1) > 0 ? 1 : 0,
  /** W86: how much of the creek's carve weight takes the rock off (rock x (1 - creekRock x weight)). Knob `groundSurfaceCreekRock`, 0 to 1; 1 to start, 0 is W85's. */
  creekRock: Math.min(CREEK_ROCK_BOUND[1], Math.max(CREEK_ROCK_BOUND[0], envNum('DD_GROUND_SURFACE_CREEK_ROCK', 'groundSurfaceCreekRock', 1))),
  /** W86: how much of the map's creek line is kept over the statement (kept = statement x (1 - knob x weight) + map x knob x weight, the weight the ring map's alpha). Knob `groundSurfaceCreekLine`, 0 to 1; 1 to start, 0 is the creek rock's text and key. */
  creekLine: Math.min(CREEK_LINE_BOUND[1], Math.max(CREEK_LINE_BOUND[0], envNum('DD_GROUND_SURFACE_CREEK_LINE', 'groundSurfaceCreekLine', 1))),
  /** W86 fix 1: how much of the creek's margin (the riparian band, its weight out to about 50 m) the ring map's alpha carries; the bed and the thread stay whole. Knob `groundSurfaceCreekMargin`, 0 to 1; 0 to start (the orchestrator's pick from `w86-frames/creek-margin.jpg`: at 1, 6d189c8d's alpha, the margin keeps a pale cloud to about 50 m). Bytes only: no text or key changes. */
  creekMargin: Math.min(1, Math.max(0, envNum('DD_GROUND_SURFACE_CREEK_MARGIN', 'groundSurfaceCreekMargin', 0))),
  /** W87: how much of the far map's sand follows the ribbon (its landward row, its width, its on-screen colour) in place of W86's paint. Knob `groundSurfaceFarSand`, 0 to 1; 1 to start, 0 is W86's bytes. */
  farSand: Math.min(UNIT_BOUND[1], Math.max(UNIT_BOUND[0], envNum('DD_GROUND_SURFACE_FAR_SAND', 'groundSurfaceFarSand', 1))),
  /** W87: how much of the shore weight takes the rock off the far shore's back slope (rock x (1 - shoreRock x weight)). Knob `groundSurfaceShoreRock`, 0 to 1; 1 to start, 0 is W86's text, key and bytes. */
  shoreRock: Math.min(UNIT_BOUND[1], Math.max(UNIT_BOUND[0], envNum('DD_GROUND_SURFACE_SHORE_ROCK', 'groundSurfaceShoreRock', 1))),
  /** W88: how much of the sheet's warm-sky light block (fringe/ground-detail.js, GROUND_RELIEF shadeWarm and shadeLift) the crust takes past r 616 to 624. Knob `groundSurfaceCrustWarm`, 0 to 1; 1 to start, 0 is W87's crust text and key. */
  crustWarm: Math.min(UNIT_BOUND[1], Math.max(UNIT_BOUND[0], envNum('DD_GROUND_SURFACE_CRUST_WARM', 'groundSurfaceCrustWarm', 1))),
  /** The macro tile's fade (m of camera distance): knobs `groundSurfaceMacroFrom` / `groundSurfaceMacroTo`. 560 / 900 is G2a's. */
  macroFrom: envNum('DD_GROUND_SURFACE_MACRO_FROM', 'groundSurfaceMacroFrom', MACRO_FADE_DEFAULT[0]),
  macroTo: envNum('DD_GROUND_SURFACE_MACRO_TO', 'groundSurfaceMacroTo', MACRO_FADE_DEFAULT[1]),
  /** The far ring's parcel tone (G2b fix): whole to r `farFrom` (the lattice's built extent, 598 m at both seeds), the field's mean by `farTo` (at least 200 m on). Knobs `groundSurfaceFarFrom` / `groundSurfaceFarTo`. */
  farFrom: envNum('DD_GROUND_SURFACE_FAR_FROM', 'groundSurfaceFarFrom', 600),
  farTo: envNum('DD_GROUND_SURFACE_FAR_TO', 'groundSurfaceFarTo', 800),
});

/** The frozen constants. `tests/ground-surface.test.mjs` pins every number here. */
export const GS = Object.freeze({
  /** The three ground tokens (taste-tokens.js) and the palette scale fringe.js gives them (PADDOCK_GAIN, PADDOCK_TINT). */
  tokens: Object.freeze({ lush: TASTE.ground.grassLush, dry: TASTE.ground.grassDry, soil: TASTE.ground.soil }),
  paddockGain: 0.20,
  paddockTint: Object.freeze([0.92, 1.0, 1.08]),
  /** The lattice: the 72 m Voronoi, and the width of the band over which a parcel's token changes at its edge, centred on the edge. */
  latticeM: 72,
  edgeBandM: 3.0,
  edgeBandRange: Object.freeze([2.0, 4.0]),
  /** The knob's bounds and its default. */
  gainDefault: 0.45,
  gainBound: GAIN_BOUND,
  /** `faceRef` is the knob's default (the live value is `GROUND_SURFACE.faceRef`) and `faceRefBound` its range; `flatGate` the slope gate's edges. */
  faceRefBound: FACE_REF_BOUND, flatGate: FLAT_GATE,
  /** Form gain: the sun-facing tilt (tan) at which tanh reaches 0.76, and the sine of the sun's elevation where it comes in (low sun: Lambert's terminator carries the shape). */
  faceRef: FACE_REF_DEFAULT,
  sunLift: Object.freeze([0.04, 0.42]),
  /** Crown/hollow ramps: ring radius (m) and the ring-against-centre height (m) where tanh reads 0.76, fine and broad; the ramps' share of value. */
  fineRingM: 8.4, fineRefM: 0.35,
  broadRingM: 55, broadRefM: 1.6,
  valuePct: 0.06,
  /** Crease wash: the deepest value lost in a hollow, and the fine hollow (0..1) where it starts. */
  creaseDepth: 0.08, creaseFrom: 0.25,
  /** Temperature with value: multiplier per unit of value change (linear RGB), lighter warmer, darker cooler and greener. */
  temper: Object.freeze({ r: 0.07, g: 0.025, b: 0.085 }),
  /** Rock on ground steeper than this slope (tan), the only slope colour left; value and tint against the turf. */
  rockSlope: Object.freeze([0.30, 0.46]), rockValue: 0.80, rockTint: Object.freeze([1.08, 0.99, 0.70]),
  /**
   * W86: the creek's carve weight is smoothstep(0, `creekFull`, v), v = the largest of the valley, bar, thread and levee fields of `creekFieldAt` (each already gated by the
   * board clearance and the dry ground the carve itself uses). The carve's walls (thread, bar and the levee's two faces) sit at v 0.35 to 1; 0.15 is whole by the valley's outer 80 m.
   */
  creekFull: 0.15, creekRockBound: CREEK_ROCK_BOUND, creekRockDefault: 1, creekLineBound: CREEK_LINE_BOUND, creekLineDefault: 1,
  /**
   * W87: the shore's rise, where the rock tint comes off. The weight is smoothstep(`wv`) of the waterness (0.08 to 0.16: the far bank stands at 0.15 to 0.57, the hills at under 0.02) times smoothstep(`r`) of the
   * radius from the board's centre (600 to 616: the crust's own; the sheet stands inside 624 and keeps its rock). Baked into the form texture's alpha as 255 - 255 x weight, so 255 is "no fade".
   */
  shore: Object.freeze({ wv: Object.freeze([0.08, 0.16]), r: Object.freeze([600, 616]) }),
  /**
   * W87: the far map's sand. The landward edge ramps over coast coordinate `landward` (the ribbon's landward row stands at -3; the ramp's centre is 1 m behind it), the amount closes with the ribbon's own width
   * over `COAST_FAR.width` (r 700 to 772, the ribbon's `gateR`), the colour is `beachDry` scaled in display space by `display` (the beach's on-screen read against the raw paint, median over c1, c2 and c3 of
   * `w87/far-sand/beachratio.py`: R 0.883, G 0.858, B 0.802), whole from `colourR` outward.
   */
  farSand: Object.freeze({ ramp: Object.freeze([-1, 11]), display: Object.freeze([0.883, 0.858, 0.802]), colourR: Object.freeze([616, 624]) }),
  /** The grain's fades with distance from the camera (m), from M0's medians: 01 675, h1 571, 19 477, h4 383, c1 251, c3 211, g2 94, f1 51. */
  grain: Object.freeze({
    nearFade: Object.freeze([260, 520]),
    // G2b: the macro tile used to go out over 560 to 900 m, so the far parcels (01 median 675 m, h1 571 m) were flat: in-parcel spread at p5 0.055 at 01 (CPU twin).
    // Out over 900 to 1,300 m it is 0.100 at 01 and 0.102 at h1 (700 to 1,100 gives 0.091 and 0.091, on the 0.09 floor). Knobs above.
    macroFade: Object.freeze([GROUND_SURFACE.macroFrom, Math.max(GROUND_SURFACE.macroFrom + 1, GROUND_SURFACE.macroTo)]),
  }),
  /**
   * The far ring (G2b): the crust draws the same statement as the sheet (the parcel's token, blended over the same band), whole to `fadeFrom` (the
   * built extent of the lattice's hedges and fences, 598 m at seeds 0 and 1) and faded to the field's mean over at least 200 m to `fadeTo`, the sheet
   * on the same fade (from the board's centre), so the two meet on one palette at the join (r 616 to 624). The form's
   * crown and hollow ramps come from the ring height bake inside `ringIn[0]` (Chebyshev, from the centre) and from the crust's own height raster
   * (11 m texels: the broad ring only, the fine ring set to `fineOfBroad` of it) past `ringIn[1]`.
   */
  far: Object.freeze({ fadeFrom: GROUND_SURFACE.farFrom, fadeTo: Math.max(GROUND_SURFACE.farFrom + 200, GROUND_SURFACE.farTo), ringIn: Object.freeze([680, 716]), fineOfBroad: 0.6, brow: Object.freeze([-7, -1]), browValue: 0.93 }),
  /** The pass: the combined paint (form x ramps x crease, before the grain) p5 to p95, and the share of land under x0.6. */
  paint: Object.freeze({ p5Min: 0.49, p95Max: 1.53, lowAt: 0.6, lowShareMax: 0.27 }),
  /** Per-fragment budget the assembled shader is counted against: colour writers and texture reads. */
  budget: Object.freeze({ writers: 4, reads: 40 }),
});

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const f5 = (v) => v.toFixed(5);
const glslVec3 = (v) => `vec3(${v.map(f5).join(', ')})`;

// ------------------------------------------------------------------------------------------------------------------------
// Fields from the crust's baked height: the crown/hollow rings, baked once per height texture into a bilinear RG texture.
// ------------------------------------------------------------------------------------------------------------------------
/** Decode the height texture (R high byte, G low byte of a 16-bit height; see bakeRingHeight) to metres. */
function decodeHeights(tex) {
  const { size, yMin, ySpan } = tex.userData.ringHeight;
  const src = tex.image.data;
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i += 1) h[i] = (((src[i * 4] << 8) | src[i * 4 + 1]) / 65535) * ySpan + yMin;
  return h;
}

/** Crown (+1) and hollow (-1) at two ring widths, per texel of the height texture: R the fine ring, G the broad ring, as 127.5 + 127.5 x value. */
export function bakeSurfaceForm(heightTex) {
  const meta = heightTex.userData.ringHeight;
  const { size, span } = meta;
  const h = decodeHeights(heightTex);
  const texel = span / size;
  const at = (fx, fy) => { // bilinear at texel coordinates, texel centres at integers, clamped to the edge
    const x = Math.max(0, Math.min(size - 1, fx)), y = Math.max(0, Math.min(size - 1, fy));
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(size - 1, x0 + 1), y1 = Math.min(size - 1, y0 + 1);
    const tx = x - x0, ty = y - y0;
    return (h[y0 * size + x0] * (1 - tx) + h[y0 * size + x1] * tx) * (1 - ty) + (h[y1 * size + x0] * (1 - tx) + h[y1 * size + x1] * tx) * ty;
  };
  const data = new Uint8Array(size * size * 4);
  const creekV = GROUND_SURFACE.creekRock > 0 && meta.creekV?.length === size * size ? meta.creekV : null; // W86: edge-massing.js `bakeRingHeight` carries it with the switch on
  const shoreV = GROUND_SURFACE.shoreRock > 0 && meta.shoreV?.length === size * size ? meta.shoreV : null; // W87: the same, the shore's rise
  const rf = GS.fineRingM / texel, rb = GS.broadRingM / texel;
  const crown = (i, j, r, ref) => {
    const mean = 0.25 * (at(i + r, j) + at(i - r, j) + at(i, j + r) + at(i, j - r));
    return -Math.tanh((mean - h[j * size + i]) / ref);
  };
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const p = (j * size + i) * 4;
      data[p] = Math.round(127.5 + 127.5 * crown(i, j, rf, GS.fineRefM));
      data[p + 1] = Math.round(127.5 + 127.5 * crown(i, j, rb, GS.broadRefM));
      data[p + 2] = creekV ? Math.round(255 * creekWeight(creekV[j * size + i])) : 0; // W86: the creek's carve weight (0 with the knob at 0, and where the bake carries none)
      data[p + 3] = shoreV ? 255 - Math.round(255 * shoreV[j * size + i]) : 255; // W87: 255 is "no shore fade"
    }
  }
  return { data, size, originX: meta.originX, originZ: meta.originZ, span };
}

/** The twin of the shader's `texture(uGsForm, uv).rg * 2 - 1`: hardware bilinear (8-bit unorm), crown +1 / hollow -1. */
export function sampleSurfaceForm(bake, x, z) {
  const { size, span, originX, originZ, data } = bake;
  const fx = Math.max(0, Math.min(size - 1, ((x - originX) / span) * size - 0.5));
  const fy = Math.max(0, Math.min(size - 1, ((z - originZ) / span) * size - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(size - 1, x0 + 1), y1 = Math.min(size - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0, out = [0, 0];
  for (let c = 0; c < 2; c += 1) {
    const v = (data[(y0 * size + x0) * 4 + c] * (1 - tx) + data[(y0 * size + x1) * 4 + c] * tx) * (1 - ty)
      + (data[(y1 * size + x0) * 4 + c] * (1 - tx) + data[(y1 * size + x1) * 4 + c] * tx) * ty;
    out[c] = (v / 255) * 2 - 1;
  }
  return out;
}

/** W86: the twin of the shader's `texture(uGsForm, uv).b`: the creek's carve weight, hardware bilinear of the 8-bit bake (0 to 1). */
export function sampleCreekWeight(bake, x, z) {
  const { size, span, originX, originZ, data } = bake;
  const fx = Math.max(0, Math.min(size - 1, ((x - originX) / span) * size - 0.5));
  const fy = Math.max(0, Math.min(size - 1, ((z - originZ) / span) * size - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(size - 1, x0 + 1), y1 = Math.min(size - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0, c = 2;
  const v = (data[(y0 * size + x0) * 4 + c] * (1 - tx) + data[(y0 * size + x1) * 4 + c] * tx) * (1 - ty)
    + (data[(y1 * size + x0) * 4 + c] * (1 - tx) + data[(y1 * size + x1) * 4 + c] * tx) * ty;
  return v / 255;
}

/** W87: the twin of the shader's `1 - texture(uGsForm, uv).a`: the shore weight, hardware bilinear of the 8-bit bake (0 to 1). */
export function sampleShoreWeight(bake, x, z) {
  const { size, span, originX, originZ, data } = bake;
  const fx = Math.max(0, Math.min(size - 1, ((x - originX) / span) * size - 0.5));
  const fy = Math.max(0, Math.min(size - 1, ((z - originZ) / span) * size - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(size - 1, x0 + 1), y1 = Math.min(size - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0, c = 3;
  const v = (data[(y0 * size + x0) * 4 + c] * (1 - tx) + data[(y0 * size + x1) * 4 + c] * tx) * (1 - ty)
    + (data[(y1 * size + x0) * 4 + c] * (1 - tx) + data[(y1 * size + x1) * 4 + c] * tx) * ty;
  return 1 - v / 255;
}

const formTextures = new WeakMap();
/** The form texture for a height texture, baked on first use and shared by every material that reads it. */
export function surfaceFormTexture(heightTex) {
  let t = formTextures.get(heightTex);
  if (t) return t;
  const bake = bakeSurfaceForm(heightTex);
  t = new THREE.DataTexture(bake.data, bake.size, bake.size, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  t.needsUpdate = true;
  t.userData.groundSurfaceForm = bake;
  formTextures.set(heightTex, t);
  return t;
}

// ------------------------------------------------------------------------------------------------------------------------
// The CPU twin of the statement.
// ------------------------------------------------------------------------------------------------------------------------
/** Token hex to linear RGB (what a material colour holds), scaled by the palette gain and tint fringe.js gives the paddock tokens. */
export function tokenLinearScaled(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b].map((v, i) => v * GS.paddockGain * GS.paddockTint[i]);
}

/** The twin of `workedHash` and the Voronoi of `attachWorkedPaddock` (and `farmFieldAt`, core/city.js): sites, warp, nearest and runner-up. */
export function makeParcelLattice(seed) {
  const WS = seed % 997;
  const hash = (x, z) => { const h = ((x * 127 + z * 311 + WS * 17) % 997 + 997) % 997; return ((h * h * 13) % 997) / 997; };
  const site = (ix, iz) => [(ix + 0.18 + hash(ix, iz) * 0.64) * 72, (iz + 0.18 + hash(ix + 37, iz - 19) * 0.64) * 72];
  const eN = (t, s) => { s %= 997; return 2 * Math.sin(t * 0.1570796327 + s) + Math.sin(t * 0.3141592654 + s * 1.7 + 2.3); };
  const country = (x, z) => {
    let qx = x + 9 * Math.sin(z / 115 + WS), qz = z + 11 * Math.sin(x / 137 - WS);
    const rx = 0.9323273456 * qx - 0.3616154320 * qz, rz = 0.3616154320 * qx + 0.9323273456 * qz;
    qx = rx; qz = rz; qx += eN(qz, WS); qz += eN(qx, WS + 31);
    return [qx, qz];
  };
  /** The parcel at a world point: its id, the runner-up's id, and the distance (in the lattice's own metres) to the bisector between them. */
  const at = (x, z) => {
    const [qx, qz] = country(x, z);
    const cx = Math.floor(qx / 72), cz = Math.floor(qz / 72);
    let d1 = Infinity, d2 = Infinity, id = null, runner = null, sN = null, sR = null;
    for (let i = -1; i <= 1; i += 1) for (let j = -1; j <= 1; j += 1) {
      const s = site(cx + i, cz + j), d = (qx - s[0]) ** 2 + (qz - s[1]) ** 2;
      if (d < d1) { d2 = d1; runner = id; sR = sN; d1 = d; id = [cx + i, cz + j]; sN = s; }
      else if (d < d2) { d2 = d; runner = [cx + i, cz + j]; sR = s; }
    }
    const boundary = (d2 - d1) / Math.max(2 * Math.hypot(sR[0] - sN[0], sR[1] - sN[1]), 0.001);
    return { id, runner, boundary, tone: hash(id[0] + 71, id[1] + 43), country: [qx, qz] };
  };
  return { at, hash, site, country };
}

/** The twin of `parcelReflectance` (fringe.js) before its square root: a parcel's flat linear albedo by its use. Pasture 78%, plough 7%, dry 15%. */
export function parcelLinear(lattice, id) {
  const lush = tokenLinearScaled(GS.tokens.lush), dry = tokenLinearScaled(GS.tokens.dry), soil = tokenLinearScaled(GS.tokens.soil);
  const tone = lattice.hash(id[0] + 71, id[1] + 43);
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  if (tone < 0.778) {
    const pt = lattice.hash(id[0] + 149, id[1] + 67);
    if (pt < 0.25) return lush;
    if (pt < 0.50) return lush.map((v) => v * 0.88);
    if (pt < 0.75) return mix(lush, dry, 0.35);
    return mix(lush, dry, 0.15).map((v) => v * 1.06);
  }
  if (tone < 0.850) return soil.map((v) => v * (0.92 + (1.05 - 0.92) * ((tone - 0.778) / 0.072)));
  return dry.map((v) => v * (0.94 + (1.04 - 0.94) * ((tone - 0.850) / 0.150)));
}

/**
 * The grain's channel of a parcel (dry, meadow, earth; sums to 1), by its token: pasture is meadow, with the two drier variants part dry (0.35 and 0.15
 * of the way to the dry token), plough is earth, dry is dry. Replaces the detail pass's reading of the channel off the colour that is there.
 */
export function parcelChannel(lattice, id) {
  const tone = lattice.hash(id[0] + 71, id[1] + 43);
  if (tone < 0.778) {
    const pt = lattice.hash(id[0] + 149, id[1] + 67);
    const dry = pt < 0.5 ? 0 : (pt < 0.75 ? 0.35 : 0.15);
    return [dry, 1 - dry, 0];
  }
  return tone < 0.850 ? [0, 0, 1] : [1, 0, 0];
}

/** The field's mean channel: parcelChannel averaged over the same odds as `fieldMeanLinear`. */
export function fieldMeanChannel() {
  const meadow = 0.778 * (1 + 1 + 0.65 + 0.85) / 4, dry = 0.778 * (0.35 + 0.15) / 4 + 0.150;
  return [dry, meadow, 0.072];
}

/**
 * The field's mean token (linear RGB): `parcelLinear` averaged over its own odds. Pasture 77.8% (four equal variants), plough 7.2% (its factor
 * runs 0.92 to 1.05), dry 15% (0.94 to 1.04). The far ring's parcel tone is this, whole.
 */
export function fieldMeanLinear() {
  const lush = tokenLinearScaled(GS.tokens.lush), dry = tokenLinearScaled(GS.tokens.dry), soil = tokenLinearScaled(GS.tokens.soil);
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const pasture = [lush, lush.map((v) => v * 0.88), mix(lush, dry, 0.35), mix(lush, dry, 0.15).map((v) => v * 1.06)];
  return [0, 1, 2].map((c) => 0.778 * pasture.reduce((a, v) => a + v[c], 0) / 4 + 0.072 * soil[c] * 0.985 + 0.150 * dry[c] * 0.99);
}

/** The weight of the neighbouring parcel's token at `boundary` metres from the edge: 0.5 on the edge, 0 at half the band, a smoothstep between. */
export function edgeWeight(boundary) {
  return 0.5 * (1 - smooth(0, GS.edgeBandM * 0.5, boundary));
}

/** Temperature with value: the linear RGB multiplier that goes with a value change `s` (1 = none): `s` times a tint that warms the light and cools and greens the dark. */
export function temper(s) {
  const d = Math.max(-0.5, Math.min(0.5, s - 1));
  return [s * (1 + GS.temper.r * d), s * (1 + GS.temper.g * d), s * (1 - GS.temper.b * d)];
}

/**
 * The form multiplier at a point. `n` the unit ground normal (x, y, z), `sun` the unit vector toward the live sun (x, y, z, world),
 * `form` = sampleSurfaceForm(...) (fine, broad), `gain` the knob. Returns { value, rgb, parts }; `value` is the scalar the paint reads.
 */
export function surfaceForm({ n, sun, form, gain = GROUND_SURFACE.gain, faceRef = GROUND_SURFACE.faceRef, flatGate = GROUND_SURFACE.flatGate }) {
  const sunH = Math.hypot(sun[0], sun[2]);
  const w = smooth(GS.sunLift[0], GS.sunLift[1], sun[1]);
  const face = (n[0] * sun[0] + n[2] * sun[2]) / Math.max(sunH, 1e-3) / Math.max(n[1], 0.3);
  const t = Math.tanh(face / faceRef) * w * (flatGate ? smooth(FLAT_GATE[0], FLAT_GATE[1], Math.hypot(n[0], n[2])) : 1);
  const shade = 1 + gain * t;
  const ramp = 1 + GS.valuePct * (0.5 * form[0] + 0.5 * form[1]);
  const crease = 1 - GS.creaseDepth * smooth(GS.creaseFrom, 1, -form[0]);
  const value = shade * ramp * crease;
  return { value, rgb: temper(value), parts: { shade, ramp, crease } };
}

/** Rock weight on steep ground (the only slope colour the module keeps). */
export function rockWeight(n) {
  return smooth(GS.rockSlope[0], GS.rockSlope[1], Math.hypot(n[0], n[2]) / Math.max(n[1], 1e-3));
}

/** W86: the creek's carve weight from `v`, the largest of the valley, bar, thread and levee fields (edge-massing.js `creekCarveFieldAt`): 0 off the creek, 1 from `creekFull` on. */
export function creekWeight(v) {
  return smooth(0, GS.creekFull, v);
}

/** W86: the share of the map's colour kept over the statement where the creek's line weight is `w` (the ring map's alpha, 0 to 1) and the knob `k`: the sheet's `1 - k x w` on the statement, the crust's `k x w` on the map. */
export function creekKeepAt(w, k = GROUND_SURFACE.creekLine) {
  return Math.min(1, Math.max(0, k * w));
}

/** W86: the twin of the keep: the statement's colour (linear RGB) with the map's kept over it by `creekKeepAt`. At weight 1 and knob 1 it is the map's, exactly. */
export function creekKept(statement, map, w, k = GROUND_SURFACE.creekLine) {
  const a = creekKeepAt(w, k);
  return [statement[0] + (map[0] - statement[0]) * a, statement[1] + (map[1] - statement[1]) * a, statement[2] + (map[2] - statement[2]) * a];
}

/** W87: the shore weight at waterness `wv` and radius `r` from the board's centre (0 on the hills and the sheet, 1 on the far bank). */
export function shoreWeight(wv, r) {
  return smooth(GS.shore.wv[0], GS.shore.wv[1], wv) * smooth(GS.shore.r[0], GS.shore.r[1], r);
}

/** W87: `beachDry` (linear RGB, `dry`) as the beach reads on screen: scaled in display (sRGB) space by `GS.farSand.display` per channel, back to linear. `k` 0 to 1 is the share taken (0: `dry` itself). */
export function farSandLinear(dry, k = 1) {
  const enc = (v) => { const c = Math.max(0, Math.min(1, v)); return c <= 0.0031308 ? c * 12.92 : 1.055 * (c ** (1 / 2.4)) - 0.055; };
  const dec = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return dry.map((v, i) => v + (dec(enc(v) * GS.farSand.display[i]) - v) * k);
}

/** W87: the twin of the shader's rock weight on the far shore: the slope's rock weight with the shore's taken off by the knob. `shore` is the baked weight (`sampleShoreWeight`, 0 to 1). */
export function rockWeightShore(n, creek = 0, shore = 0, kCreek = GROUND_SURFACE.creekRock, kShore = GROUND_SURFACE.shoreRock) {
  return rockWeightAt(n, creek, kCreek) * (1 - kShore * shore);
}

/** W86: the twin of the shader's `gsRockW`: the rock weight on carved earth is taken off by the knob. `creek` is the baked weight (`sampleCreekWeight`, 0 to 1), `k` the knob. */
export function rockWeightAt(n, creek = 0, k = GROUND_SURFACE.creekRock) {
  return rockWeight(n) * (1 - k * creek);
}

// ------------------------------------------------------------------------------------------------------------------------
// GLSL.
// ------------------------------------------------------------------------------------------------------------------------
/** Declarations, spliced at `#include <common>` (guarded: the paddock and the detail pass both splice it). */
export function groundSurfaceCommonGlsl() {
  const T = GS.temper;
  const mean = fieldMeanLinear();
  const dry = tokenLinearScaled(GS.tokens.dry);
  return `#ifndef GS_COMMON
#define GS_COMMON
uniform sampler2D uGsForm;
// taste W78 (GROUND_SURFACE): temperature with value. A value change s (1 = none) is lighter and warmer, or darker, cooler and greener.
vec3 gsTemper(float s) {
  float d = clamp(s - 1.0, -0.5, 0.5);
  return s * vec3(1.0 + ${f5(T.r)} * d, 1.0 + ${f5(T.g)} * d, 1.0 - ${f5(T.b)} * d);
}
// taste W79 (GROUND_SURFACE, G2b): the far ring's statement. The field's mean token (linear), the form's multiplier \`mul\`, rock on steep ground, and the dry-grass
// token the brow row carries (the sheet's own brow mix). Returns linear albedo. The sheet fades its paddock statement into it over r ${GS.far.fadeFrom} to ${GS.far.fadeTo}.
const vec3 GS_MEAN = ${glslVec3(mean)};
// The grain's channel (dry, meadow, earth) the detail pass reads in place of the colour's green over red: written by the paddock statement (the parcel's), by the far ring
// (the field's mean, sand as dry); -1 until one of them has.
const vec3 GS_MEAN_CH = ${glslVec3(fieldMeanChannel())};
vec3 gsChannel = vec3(-1.0);
vec3 parcelChannelOf(float tone, float pt) {
  if (tone < 0.778) { float dry = pt < 0.5 ? 0.0 : (pt < 0.75 ? 0.35 : 0.15); return vec3(dry, 1.0 - dry, 0.0); }
  return tone < 0.850 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
}
const vec3 GS_BROW_REFL = ${glslVec3(dry.map((v) => Math.sqrt(v) * GS.far.browValue))};
vec3 gsFarAlbedoOf(vec3 tok, vec3 mul, float rockW, float brow) {
  vec3 r = tok * sqrt(mul);
  r = mix(r, sqrt(vec3(dot(r * r, vec3(0.2126, 0.7152, 0.0722)) * ${f5(GS.rockValue)}) * ${glslVec3(GS.rockTint)}), rockW);
  r = mix(r, GS_BROW_REFL, brow);
  return r * r;
}
vec3 gsFarAlbedo(vec3 mul, float rockW, float brow) { return gsFarAlbedoOf(sqrt(GS_MEAN), mul, rockW, brow); }
#endif
`;
}

/**
 * The form block, spliced inside the paddock statement's braces. Declares `gsSun` (world, toward the live sun), `gsMul` (the linear
 * multiplier on the token) and `gsRockW`. `hasHeight` is false on a material with no baked height (then the crown/hollow ramps read 0).
 */
export function groundSurfaceFormGlsl({ hasHeight, far = false }) {
  const gain = GROUND_SURFACE.gain;
  const creek = GROUND_SURFACE.creekRock > 0 && (hasHeight || far); // W86: the carve weight rides in the form texture's blue channel
  const shore = far && GROUND_SURFACE.shoreRock > 0; // W87: the shore weight rides in its alpha; only the crust's far ring reads it
  const flatGate = GROUND_SURFACE.flatGate ? ` * smoothstep(${f5(FLAT_GATE[0])}, ${f5(FLAT_GATE[1])}, length(ringNCache.xz))` : '';
  // The far ring (the crust): the ring height bake inside r ringIn[0], the crust's own raster (broad ring only) past ringIn[1].
  const crCrust = `${creek || shore ? `  vec4 gsF = texture(uGsForm, (vRingWorld.xz - uRingHOrigin) / uRingHSpan);
  vec2 gsCr = gsF.rg * 2.0 - 1.0;` : '  vec2 gsCr = texture(uGsForm, (vRingWorld.xz - uRingHOrigin) / uRingHSpan).rg * 2.0 - 1.0;'}
  float gsOut = smoothstep(${f5(GS.far.ringIn[0])}, ${f5(GS.far.ringIn[1])}, max(abs(vRingWorld.x - uCrustCentre.x), abs(vRingWorld.z - uCrustCentre.y)));
  if (gsOut > 0.0) {
    vec2 gsW = vRingWorld.xz;
    float gsBroad = -tanh((0.25 * (crustHAt(gsW + vec2(${f5(GS.broadRingM)}, 0.0)) + crustHAt(gsW - vec2(${f5(GS.broadRingM)}, 0.0)) + crustHAt(gsW + vec2(0.0, ${f5(GS.broadRingM)})) + crustHAt(gsW - vec2(0.0, ${f5(GS.broadRingM)}))) - crustHAt(gsW)) / ${f5(GS.broadRefM)});
    gsCr = mix(gsCr, vec2(${f5(GS.far.fineOfBroad)} * gsBroad, gsBroad), gsOut);
  }
  ringNCache = normalize(mix(gsRingN, ringNCache, gsOut)); // the sheet's own (ring) normal inside r ${GS.far.ringIn[0]}, the crust's raster normal past ${GS.far.ringIn[1]}: the slope reads as the sheet's does
`;
  return `  // taste W78 (GROUND_SURFACE): form(n, live sun). One multiplier from the ring normal Lambert uses, the live sun, and the crust's crown/hollow rings.
  #if NUM_DIR_LIGHTS > 0
  vec3 gsSun = (vec4(directionalLights[0].direction, 0.0) * viewMatrix).xyz;
  #else
  vec3 gsSun = vec3(0.0, 1.0, 0.0);
  #endif
${far ? crCrust : (creek && hasHeight ? `  vec4 gsF = texture(uGsForm, (vRingWorld.xz - uRingHOrigin) / uRingHSpan);
  vec2 gsCr = gsF.rg * 2.0 - 1.0;
` : `  vec2 gsCr = ${hasHeight ? 'texture(uGsForm, (vRingWorld.xz - uRingHOrigin) / uRingHSpan).rg * 2.0 - 1.0' : 'vec2(0.0)'};
`)}  float gsFace = dot(ringNCache.xz, gsSun.xz / max(length(gsSun.xz), 1e-3)) / max(ringNCache.y, 0.3);
  float gsShade = 1.0 + ${f5(gain)} * tanh(gsFace / ${f5(GROUND_SURFACE.faceRef)}) * smoothstep(${f5(GS.sunLift[0])}, ${f5(GS.sunLift[1])}, gsSun.y)${flatGate};
  float gsValue = gsShade * (1.0 + ${f5(GS.valuePct)} * (0.5 * gsCr.x + 0.5 * gsCr.y)) * (1.0 - ${f5(GS.creaseDepth)} * smoothstep(${f5(GS.creaseFrom)}, 1.0, -gsCr.x));
  vec3 gsMul = gsTemper(gsValue);
  float gsRockW = smoothstep(${f5(GS.rockSlope[0])}, ${f5(GS.rockSlope[1])}, length(ringNCache.xz) / max(ringNCache.y, 1e-3))${creek ? ` * (1.0 - ${f5(GROUND_SURFACE.creekRock)} * gsF.b${far ? ' * (1.0 - gsOut)' : ''})` : ''}${shore ? ` * (1.0 - ${f5(GROUND_SURFACE.shoreRock)} * (1.0 - gsF.a) * (1.0 - gsOut))` : ''};
`;
}

/**
 * G2b, the crust's far ring: ONE chunk, spliced into the crust's fragment shader (edge-massing.js `attachCrustForm`, after the crust's own normal
 * has been mixed in) with `groundSurfaceFarUniforms(shader)` beside it. It reads the same tokens as the sheet (`GS_MEAN`, the form block, rock,
 * the brow) with the parcel tone faded to the field's mean, and writes `diffuseColor.rgb` once. The crust's far map keeps only the far shore's sand,
 * in its alpha channel (edge-massing.js `bakeCrustFarAlbedo` with the switch on). Needs, from the crust's program: `uCrustMap`, `uCrustGeo`,
 * `uCrustCentre`, `crustHAt`, `ringQmCache`, `ringNCache`, `uRingHOrigin`, `uRingHSpan`.
 */
export function groundSurfaceFarGlsl() {
  return `  {
  // taste W79 (GROUND_SURFACE, G2b): the far ring. The sheet's statement: the parcel's token (the lattice's, blended over the band) faded to the field's mean over r ${GS.far.fadeFrom} to ${GS.far.fadeTo}.
${groundSurfaceFormGlsl({ hasHeight: true, far: true })}  vec2 gswC = gswCountry(vRingWorld.xz);
  vec2 gswCell = floor(gswC / 72.0), gswId = gswCell, gswNear = vec2(0.0), gswRun = vec2(0.0);
  float gswD1 = 1e10, gswD2 = 1e10;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
    vec2 id = gswCell + vec2(float(i), float(j));
    vec2 site = gswSite(id);
    float d = dot(gswC - site, gswC - site);
    if (d < gswD1) { gswD2 = gswD1; gswRun = gswNear; gswD1 = d; gswNear = site; gswId = id; }
    else if (d < gswD2) { gswD2 = d; gswRun = site; }
  }
  vec2 gswRunId = floor(gswRun / 72.0);
  float gswW = 0.5 * (1.0 - smoothstep(0.0, ${f5(GS.edgeBandM * 0.5)}, (gswD2 - gswD1) / max(2.0 * length(gswRun - gswNear), 0.001)));
  float gswFade = smoothstep(${f5(GS.far.fadeFrom)}, ${f5(GS.far.fadeTo)}, length(vRingWorld.xz - uCrustCentre));
  float gswBrow = smoothstep(${f5(GS.far.brow[0])}, ${f5(GS.far.brow[1])}, ringQmCache);
  vec3 gsFarC = mix(gsFarAlbedoOf(mix(gswTokenSqrt(gswId), gswTokenSqrt(gswRunId), gswW), gsMul, gsRockW, gswBrow), gsFarAlbedo(gsMul, gsRockW, gswBrow), gswFade);
  vec4 gsFarMap = texture(uCrustMap, (vRingWorld.xz - uCrustGeo.xy) / uCrustGeo.z);
  diffuseColor.rgb = ${GROUND_SURFACE.creekLine > 0 ? `mix(mix(gsFarC, gsFarMap.rgb * diffuse, gsFarMap.a), diffuseColor.rgb, ${f5(GROUND_SURFACE.creekLine)} * diffuseColor.a * (1.0 - gsOut));` : 'mix(gsFarC, gsFarMap.rgb * diffuse, gsFarMap.a);'}
  gsChannel = mix(mix(mix(gswChannelOf(gswId), gswChannelOf(gswRunId), gswW), GS_MEAN_CH, gswFade), vec3(1.0, 0.0, 0.0), gsFarMap.a);
  }
`;
}

/**
 * The crust's copy of the sheet's parcel lattice (fringe.js `attachWorkedPaddock`: the same warp, sites and hashes), so the far ring keeps each
 * parcel's token where the lattice is built. Prefix `gsw`; one uniform, `uGsSeed`. Needs `parcelChannelOf` (the common block).
 */
export function groundSurfaceLatticeGlsl() {
  const T = (k) => glslVec3(tokenLinearScaled(GS.tokens[k]));
  return `uniform float uGsSeed;
float gswHash(vec2 p) {
  float h = mod(dot(p, vec2(127.0, 311.0)) + uGsSeed * 17.0, 997.0);
  return mod(h * h * 13.0, 997.0) / 997.0;
}
vec2 gswSite(vec2 id) { return (id + 0.18 + vec2(gswHash(id), gswHash(id + vec2(37.0, -19.0))) * 0.64) * 72.0; }
float gswEdgeNoise(float t, float seed) {
  seed = mod(seed, 997.0);
  return 2.0 * sin(t * 0.1570796327 + seed) + sin(t * 0.3141592654 + seed * 1.7 + 2.3);
}
vec2 gswCountry(vec2 p) {
  vec2 q = p + vec2(9.0 * sin(p.y / 115.0 + uGsSeed), 11.0 * sin(p.x / 137.0 - uGsSeed));
  q = mat2(0.9323273456, 0.3616154320, -0.3616154320, 0.9323273456) * q;
  q.x += gswEdgeNoise(q.y, uGsSeed);
  q.y += gswEdgeNoise(q.x, uGsSeed + 31.0);
  return q;
}
vec3 gswTokenSqrt(vec2 id) {
  const vec3 lush = ${T('lush')}, dry = ${T('dry')}, soil = ${T('soil')};
  float tone = gswHash(id + vec2(71.0, 43.0));
  vec3 lin;
  if (tone < 0.778) {
    float pt = gswHash(id + vec2(149.0, 67.0));
    if (pt < 0.25) lin = lush;
    else if (pt < 0.50) lin = lush * 0.88;
    else if (pt < 0.75) lin = mix(lush, dry, 0.35);
    else lin = mix(lush, dry, 0.15) * 1.06;
  } else if (tone < 0.850) {
    lin = soil * mix(0.92, 1.05, (tone - 0.778) / 0.072);
  } else {
    lin = dry * mix(0.94, 1.04, (tone - 0.850) / 0.150);
  }
  return sqrt(lin);
}
vec3 gswChannelOf(vec2 id) { return parcelChannelOf(gswHash(id + vec2(71.0, 43.0)), gswHash(id + vec2(149.0, 67.0))); }
`;
}

/** The uniform the far ring's form block reads, set on the crust's shader (the ring height bake's form texture, shared with the sheet). */
export function groundSurfaceFarUniforms(shader, seed = 0) {
  shader.uniforms.uGsSeed = { value: seed % 997 };
  if (shader.uniforms.uRingHeight?.value) shader.uniforms.uGsForm = { value: surfaceFormTexture(shader.uniforms.uRingHeight.value) };
  return shader;
}

/** Applied to the sqrt-space `reflectance` right after the parcel's token: the multiplier, then rock on the steepest ground. */
export function groundSurfaceApplyGlsl() {
  return `  reflectance *= sqrt(gsMul);
  reflectance = mix(reflectance, sqrt(vec3(dot(reflectance * reflectance, vec3(0.2126, 0.7152, 0.0722)) * ${f5(GS.rockValue)}) * ${glslVec3(GS.rockTint)}), gsRockW);
`;
}

/** The band half-width the paddock statement mixes a parcel's token and its neighbour's over. */
export function groundSurfaceBandHalfM() {
  return GS.edgeBandM * 0.5;
}

/** A short key for the program cache: the switch's state and everything that changes the text. */
export function groundSurfaceKey() {
  return `|gs-w78-${GROUND_SURFACE.gain}-${GS.edgeBandM}-${GS.valuePct}-${GS.creaseDepth}-${GS.grain.nearFade.join('_')}-${GS.grain.macroFade.join('_')}-far${GS.far.fadeFrom}_${GS.far.fadeTo}-fix${GROUND_SURFACE.faceRef === FACE_REF_DEFAULT ? '' : `-fr${GROUND_SURFACE.faceRef}`}${GROUND_SURFACE.flatGate ? '-fg1' : ''}${GROUND_SURFACE.creekRock > 0 ? `-cr${GROUND_SURFACE.creekRock}` : ''}${GROUND_SURFACE.creekLine > 0 ? `-cl${GROUND_SURFACE.creekLine}` : ''}`;
}
