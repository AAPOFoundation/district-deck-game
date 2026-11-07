// District Deck V3.32 — industrial surface atlas.
//
// Deliberately separate from `render/textures.js`: that is the shared W1 pack the whole board
// uses, and this pack is attached only by the industrial palette. One atlas image per map
// keeps the texture count and the draw contract flat while each family gets its own region
// through a shader UV transform.
//
// Built from the SHARED generators in `../textures.js` wherever a generator already fits, and
// decorated procedurally where it does not — `decorate()` below is where a family stops being
// a generic noise field and becomes bond-store brick, precast concrete or deep-rib sheet.
//
// Nothing here writes a file, runs a build step, or calls a procedural-image library. Every
// texel is computed in-engine at runtime, exactly as `textures.js` already does (V332 §3).
//
// ─────────────────────────────────────────────────────────────────────────────────────
// WEAR LIVES HERE.
//
// V332 §2c: "wear is the dimension these subjects can actually win", and the rule it inherits
// from V320 §2.7 is that wear lives in MATERIAL RESPONSE, not in geometry cards, and that
// uniform dirt everywhere is a filter which scores zero. So this file carries a DIRECTED wear
// program that the palette configures per surface and a lane can amend through `requestWear`:
//
//   rustBleed   oxide streaking below a fixing line and a gutter joint, at two stations
//   grimeBand   the band a truck's mirror and a forklift's mast leave, ~1.0–1.7 m, with a
//               wavering top edge, on vertical faces only
//   tyreScrub   arcs of rubber on the apron, on UP-facing faces only, near the dock
//   oilBloom    a drip blotch where a trailer stands, also up-facing only
//   chalk       paint and render blooming pale on the sun elevation, in soft patches
//   saltBloom   efflorescence rising out of the plinth, with a tide line
//   mossValley  green in the shaded roof valley, where a plane runs into something
//
// Every one of those is keyed to a PLACE — a station, a height band, a face direction, a
// distance from the dock. None of them is a function of the whole surface. That distinction
// is the entire difference between §2c scoring and §2c scoring zero.
//
// AMPLITUDES AND GAINS — raised 2026-08-11 by the CORE REPAIR seat, and worth stating why.
//
// Both lanes reported wear as their weakest cell and both were already driving the directives
// at 0.85–1.0, so there was nothing left for a lane to ask for: the ceiling was a set of hard
// constants in this file, and they were far too quiet. At directive 1.0 the grime band darkened
// a wall by 10.5 %, salt bloom added 0.030 of linear lift, oxide took 7.5/15/21 % out of RGB.
// Those are at or under the level a viewer reads as rendering noise, which is how a programme
// records thirty rounds of wear never scoring above 2.1 (V320 §2.7) while §2c says wear is the
// dimension these subjects can actually win.
//
// TWO LEVERS, AND THEY DO DIFFERENT THINGS, WHICH IS THE POINT.
//
//   * The amplitude constants below are raised so a lane driving a directive at 1.0 gets a mark
//     that is unmistakable at hero distance.
//   * `<mark>Gain` — `rustGain`, `grimeGain`, `tyreGain`, `oilGain`, `chalkGain`, `saltGain`,
//     `mossGain` — is a per-bucket multiplier on the AMPLITUDE, requestable through
//     `requestWear`, defaulting to 1.0. A subject whose stack throws soot down one elevation
//     asks for `grimeGain: 2.2` on that bucket and gets a deeper tide line in the same place.
//
// THE GAIN MULTIPLIES THE AMPLITUDE, NEVER THE MASK, AND THAT IS NOT A DETAIL. The mask is the
// 0–1 field that says WHERE — the station, the tide line, the dock falloff — and it saturates.
// Scaling the mask pushes it to 1 over a wider and wider area, which makes the whole surface
// dirty: precisely the filter §2c scores zero. Scaling the amplitude deepens the mark inside its
// own footprint and leaves the clean ground clean, which is what "directed" means.
//
// Alongside the raise, the along-elevation modulation floors were dropped — grime from
// 0.58 + 0.42·f to 0.34 + 0.66·f, salt from 0.6 + 0.4·f to 0.42 + 0.58·f — so that raising the
// ceiling raises the STREAKS rather than the field. Between streaks the new floor lands at
// roughly the old ceiling, so nothing on either lane got cleaner and the contrast went up.
// ─────────────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import {
  TEXTURE_GENERATORS,
  hashSeed,
  sobelNormalFromHeight,
} from '../textures.js';

/**
 * Family → shared generator. Where no generator fits, the closest smooth base is taken and
 * `decorate()` does the work: `rust` is painted metal eaten back to oxide, and `glass_wired`
 * is a smooth base with a Georgian wire grid drawn into it.
 */
const FAMILY_SOURCE = Object.freeze({
  brick: 'brick',
  render: 'render',
  concrete: 'concrete',
  corrugated: 'corrugation',
  painted_metal: 'painted_metal',
  rust: 'painted_metal',
  asphalt: 'asphalt',
  timber: 'timber',
  glass_wired: 'render',
});

const FAMILY_ORDER = Object.freeze(Object.keys(FAMILY_SOURCE));
const COLUMNS = 3;
const ROWS = Math.ceil(FAMILY_ORDER.length / COLUMNS);
const GUTTER = 2;

// Nine families in a 3 × 3 grid, so there is no spare cell and none of the residential atlas's
// spare-cell bleed problem exists here. If a tenth family is ever added, the grid becomes 4 × 3
// with two spares and those spares must be filled with a copy of a neighbour rather than left
// at zero — transparent black bleeding into cast iron at a deep mip level is a defect that is
// very hard to trace, and the residential file paid for finding it.

// Levels 0..2 — one family cell reduces 256 → 128 → 64. THREE, and the number is arithmetic
// rather than taste, exactly as in the residential atlas.
//
// Each region rect is inset by GUTTER = 2 texels of LEVEL 0, and that inset is a fixed distance
// in normalised UV, so at level L the sampled window starts only 2/2^L texels inside the cell.
// A bilinear tap at a wrapped tile seam reaches half a texel outward, so the weight it can
// steal from the NEIGHBOURING FAMILY is max(0, 0.5 − 2/2^L): zero at levels 0, 1 and 2, a
// quarter of a texel row at level 3, three eighths at level 4. Three levels is therefore the
// deepest chain these rects support without a family bleeding into its neighbour, and the
// ceiling moves only if GUTTER moves — which changes the region rects, and a region-rect change
// is what once shipped every residential family sampling its neighbour.
const MIP_LEVELS = 3;

// Anchors. `configureIndustrialAtlasShader` replaces three's own <map_fragment> and
// <roughnessmap_fragment> with textureGrad bodies and runs BEFORE the wear pass, because the
// wear pass wraps it as `previousCompile`. Without a marker left in its place the wear pass's
// `.replace('#include <map_fragment>', …)` would match nothing and return the shader unchanged
// — silently, because a failed replace is not an error, which is exactly how two residential
// wear paths sat dead for thirty rounds.
const DD_MAP_SENTINEL = '// dd-industrial-atlas-map-fragment';
const DD_ROUGHNESS_SENTINEL = '// dd-industrial-atlas-roughnessmap-fragment';

/**
 * Insert after whichever anchor this shader actually carries, and SAY SO if it carries none.
 * Runs inside `onBeforeCompile`, so it must not throw — a throw there takes the frame, not the
 * feature.
 */
function insertAfterAnchor(source, anchors, code, label) {
  for (const anchor of anchors) {
    if (source.includes(anchor)) return source.replace(anchor, `${anchor}\n${code}`);
  }
  console.error(`Industrial atlas: no ${label} anchor in this shader — wear pass not applied`);
  return source;
}

/**
 * FAMILY REPEAT IS IN TILES PER METRE, NOT TILES PER PRIMITIVE.
 *
 * `industrial/core.js` writes every UV in metres of building space (see its header note), so a
 * repeat of 0.5435 for brick means one family tile every 1.84 m — which is exactly eight
 * 230 mm stretchers, so a drawn brick is a real brick on a plinth, on a pilaster and on a
 * parapet alike, and the coursing lines up ACROSS parts.
 *
 * The residential kit reaches the same place with a world-space projection in the vertex
 * shader, because its primitives carry normalised UVs and cannot say anything about metres.
 * Doing it on the CPU is one branch cheaper per vertex and, more usefully, it means a lane can
 * read a repeat here and know what physical module it will get.
 */
const TILE_METRES = Object.freeze({
  brick: [1.840, 1.216],   // 8 stretchers × 16 courses at 230 × 76 mm
  render: [2.000, 2.000],
  concrete: [2.400, 2.400], // one precast lift
  corrugated: [4.200, 2.400], // 10 ribs at 420 mm; sheet lap every 2.4 m down the slope
  painted_metal: [1.600, 1.600],
  rust: [1.600, 1.600],
  asphalt: [4.000, 4.000],
  timber: [0.840, 0.840],
  glass_wired: [0.600, 0.600], // 12 wires per tile → 50 mm Georgian mesh
});

const FAMILY_REPEAT = Object.freeze(Object.fromEntries(
  Object.entries(TILE_METRES).map(([family, [w, h]]) => [family, [1 / w, 1 / h]]),
));

/**
 * Sobel strength per family, in height units per texel.
 *
 * Relief goes where the material HAS relief. Corrugated sits low on purpose: the rib is
 * modelled in `core.js: corrugatedPanel`, and a second relief rhythm at a different pitch on
 * the same surface is a moiré — the residential roofs lost a round to exactly that.
 */
const NORMAL_STRENGTH = Object.freeze({
  brick: 2.4,
  render: 1.0,
  concrete: 1.5,
  corrugated: 0.85,
  painted_metal: 1.5,
  rust: 2.2,
  asphalt: 2.0,
  timber: 2.2,
  glass_wired: 0.9,
});

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function pixelHash(seed, x, y) {
  let h = (seed ^ Math.imul(x + 1, 0x45d9f3b) ^ Math.imul(y + 1, 0x119de1f3)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return (h >>> 0) / 0x100000000;
}

function pixelIndex(size, x, y) {
  return (y * size + x) * 4;
}

// Masonry module authored into one family tile: eight stretchers across, sixteen courses down,
// matched to TILE_METRES.brick above. Change one and the other is wrong.
const BRICKS_ACROSS = 8;
const COURSES_DOWN = 16;

/**
 * Turn a generic generator output into an industrial family.
 *
 * Every modulation here is CELL-SCALE or smooth — per brick, per panel, per sheet, per board.
 * There is deliberately no per-texel hash left in scope: texel-scale noise is photographic
 * grain, it is the first thing to alias under minification, and this register is graded
 * against a stylised board render rather than a photograph.
 */
function decorate(family, maps, size, seed) {
  const { albedo, roughness, height } = maps;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = pixelIndex(size, x, y);
      const low = pixelHash(seed ^ 0x9e3779b9, Math.floor(x / 16), Math.floor(y / 16));
      const u = x / size;
      const v = y / size;

      if (family === 'brick') {
        // Bond-store brick with REAL COURSING. The generator owns the stretcher bond; this
        // pass owns the joint geometry, the per-brick value spread and the over-burnt headers
        // that make a nineteenth-century stock brick look fired rather than printed.
        const brickW = size / BRICKS_ACROSS;
        const brickH = size / COURSES_DOWN;
        const row = Math.floor(y / brickH);
        const offset = (row & 1) ? brickW * 0.5 : 0;
        const localX = (x + offset) % brickW;
        const localY = y % brickH;
        // One joint per SHARED edge, not one on each side of it. Writing a joint on all four
        // edges of every brick doubles the mortar band between courses and takes 62 % of the
        // tile to mortar, which renders as an even salmon fill with a faint grid on it.
        const bed = Math.max(1, Math.round(size / 88));
        const perp = Math.max(1, Math.round(size / 128));
        const inBed = localY < bed;
        const inPerp = localX < perp;
        const block = 0.94 + low * 0.12;
        if (inBed || inPerp) {
          // Raked joint: its own upper edge sits in the shadow of the brick above it, and that
          // pair of values is what stops a joint reading as a drawn line.
          const raked = (inBed && localY < bed * 0.5) || (inPerp && localX < perp * 0.5) ? 0.78 : 1.0;
          albedo[i] = clampByte(198 * raked);
          albedo[i + 1] = clampByte(190 * raked);
          albedo[i + 2] = clampByte(174 * raked);
          roughness[i] = roughness[i + 1] = roughness[i + 2] = 238;
          height[i] = height[i + 1] = height[i + 2] = 52;
        } else {
          const column = Math.floor((x + offset) / brickW);
          const cell = pixelHash(seed ^ 0x61c88647, column, row);
          const kiln = pixelHash(seed ^ 0x13c9a7f5, column, row);
          // A bond store is laid from whatever the kiln produced that week. The over-burnt
          // header sitting well below the field is the single most characteristic thing about
          // Melbourne industrial brickwork and it is a per-brick decision, never a noise field.
          // One brick in fourteen is over-burnt and one in twenty is a pale under-fired header.
          // Held there on plate evidence: at one in ten and a 0.70 multiplier the first flank
          // came back reading as blotched rather than as laid, because a burnt header is a
          // per-brick event and ten per cent of a wall is a pattern.
          const burnt = kiln > 0.928 ? 0.76 : kiln < 0.052 ? 1.10 : 1.0;
          const lit = 1 + (0.5 - localY / brickH) * 0.055;
          const face = (1 + (cell - 0.5) * 0.21) * burnt * block * lit;
          // Keep the atlas albedo NEUTRAL. The material bucket owns the brick hue; a red map
          // multiplied by a red bucket is how a wall arrives neon.
          albedo[i] = albedo[i + 1] = albedo[i + 2] = clampByte(255 * face);
          roughness[i] = roughness[i + 1] = roughness[i + 2] = clampByte(200 - (cell - 0.5) * 22);
          height[i] = height[i + 1] = height[i + 2] = clampByte(174 + (cell - 0.5) * 16);
        }
      } else if (family === 'concrete') {
        // Precast, with the two marks that name it: the LIFT LINE where one pour met the next,
        // and the FORM-TIE holes left by the through-bolts. A precast panel without ties is a
        // grey rectangle, and a grey rectangle is what §2.4 fails.
        const panelV = v * 1.0;
        const lift = Math.abs(panelV - 0.5) < 0.010 ? 1 - Math.abs(panelV - 0.5) / 0.010 : 0;
        const tieU = [0.22, 0.78];
        const tieV = [0.26, 0.74];
        let tie = 0;
        for (const tu of tieU) {
          for (const tv of tieV) {
            const d = Math.hypot((u - tu) * 1.0, (v - tv) * 1.0);
            tie = Math.max(tie, d < 0.022 ? 1 - d / 0.022 : 0);
          }
        }
        // Board-marks from the form face, and a slow blotch from the cure. Both are smooth.
        const boardMark = 0.985 + Math.sin(u * Math.PI * 11 + Math.sin(v * 4.1) * 0.7) * 0.010;
        const cure = 0.97 + low * 0.06 + Math.sin(u * 3.7 + v * 2.3) * 0.016;
        const wash = boardMark * cure * (1 - lift * 0.10) * (1 - tie * 0.22);
        albedo[i] = clampByte(albedo[i] * wash);
        albedo[i + 1] = clampByte(albedo[i + 1] * wash);
        albedo[i + 2] = clampByte(albedo[i + 2] * wash);
        roughness[i] = roughness[i + 1] = roughness[i + 2]
          = clampByte(206 + lift * 16 + tie * 20 + (low - 0.5) * 12);
        height[i] = height[i + 1] = height[i + 2]
          = clampByte(150 - lift * 54 - tie * 92 + Math.sin(u * Math.PI * 11) * 6);
      } else if (family === 'corrugated') {
        // Deep rib. The RHYTHM is not this map's job — `core.js: corrugatedPanel` models it,
        // and two rhythms at different pitches on one surface is a beat. What this contributes
        // is what sits UNDER a modelled rib: the end lap, a slow sheet-to-sheet drift, and the
        // rust that collects in a trough on one band of sheets rather than on all of them.
        const RIBS = 10;
        const ribPhase = (u * RIBS) % 1;
        const crest = Math.cos(ribPhase * Math.PI * 2);
        const lapEdge = Math.min(v, 1 - v);
        const sheetLap = 1 - Math.min(1, lapEdge / 0.028);
        const sheetBlock = pixelHash(seed ^ 0x2ad4b17f, Math.floor(x / 64), Math.floor(y / 64));
        const drift = 0.986 + (sheetBlock - 0.5) * 0.030 + Math.sin(v * Math.PI * 2) * 0.010;
        const troughRust = Math.max(0, Math.sin(v * Math.PI * 3.0 + sheetBlock * 4.0) - 0.70) * 3.2
          * Math.max(0, -crest) * 0.8;
        const base = 172 * drift * (1 - sheetLap * 0.11);
        albedo[i] = clampByte(base + troughRust * 26);
        albedo[i + 1] = clampByte(base * 0.994 + troughRust * 10);
        albedo[i + 2] = clampByte(base * 0.984 - troughRust * 8);
        // Roughness stays flat across the rib. Dropping it at the crest sharpens the specular
        // lobe exactly where the normal swings hardest, and a narrow moving glint on a narrow
        // feature is the one thing guaranteed to alias into a dotted line.
        roughness[i] = roughness[i + 1] = roughness[i + 2]
          = clampByte(190 + (sheetBlock - 0.5) * 14 + troughRust * 18);
        height[i] = height[i + 1] = height[i + 2] = clampByte(128 + crest * 34 - sheetLap * 16);
      } else if (family === 'rust') {
        // Not "brown paint". Oxide is scale — it lifts, it flakes, and the metal shows through
        // where the flake has gone. Cell-scale so it survives minification as a mottle rather
        // than dissolving into grain.
        const flake = pixelHash(seed ^ 0x51ab3f2d, Math.floor(x / 9), Math.floor(y / 9));
        const bloom = pixelHash(seed ^ 0x2f9d1b17, Math.floor(x / 34), Math.floor(y / 34));
        const scale = 0.55 + bloom * 0.55;
        const bare = flake > 0.86 ? (flake - 0.86) * 6.0 : 0;
        albedo[i] = clampByte(196 * scale + bare * 40);
        albedo[i + 1] = clampByte(150 * scale + bare * 44);
        albedo[i + 2] = clampByte(118 * scale + bare * 46);
        roughness[i] = roughness[i + 1] = roughness[i + 2] = clampByte(232 - bare * 60);
        height[i] = height[i + 1] = height[i + 2] = clampByte(120 + bloom * 60 - bare * 44);
      } else if (family === 'painted_metal') {
        // Neutral paint response. The material colour supplies the chosen paint; this map only
        // supplies sheen breakup at BRUSH scale — a texel hash here is photographic grain on a
        // gutter, and grain is the wrong answer for this register at any distance.
        const brush = 0.955 + 0.030 * Math.sin(v * Math.PI * 9 + Math.sin(u * 5.1) * 1.3) + 0.055 * low;
        albedo[i] = albedo[i + 1] = albedo[i + 2] = clampByte(188 * brush);
        roughness[i] = roughness[i + 1] = roughness[i + 2] = clampByte(96 + low * 44);
        height[i] = height[i + 1] = height[i + 2] = clampByte(126 + (low - 0.5) * 16);
      } else if (family === 'asphalt') {
        // Yard asphalt: aggregate at a size the eye can read, plus the crack network that says
        // the surface has been down for thirty years. The patch REPAIRS are geometry in
        // `hardstandSlab`; what lives here is the fabric between them.
        const grit = pixelHash(seed ^ 0x7a3b19c5, Math.floor(x / 4), Math.floor(y / 4));
        const crackField = Math.sin(u * 9.3 + Math.sin(v * 6.1) * 2.4)
          * Math.cos(v * 7.7 - Math.sin(u * 4.3) * 1.8);
        const crack = Math.abs(crackField) < 0.035 ? 1 - Math.abs(crackField) / 0.035 : 0;
        const tone = (0.90 + grit * 0.20) * (1 - crack * 0.26);
        albedo[i] = clampByte(albedo[i] * tone);
        albedo[i + 1] = clampByte(albedo[i + 1] * tone);
        albedo[i + 2] = clampByte(albedo[i + 2] * tone);
        roughness[i] = roughness[i + 1] = roughness[i + 2] = clampByte(238 - grit * 26 + crack * 12);
        height[i] = height[i + 1] = height[i + 2] = clampByte(140 + (grit - 0.5) * 42 - crack * 70);
      } else if (family === 'timber') {
        // Pallet and crate softwood: sawn grain along the board, and a board-to-board value
        // step, because a pallet is many boards and a stack of pallets that is one colour reads
        // as a foam block.
        const BOARDS = 7;
        const boardRow = Math.floor(v * BOARDS);
        const boardTone = 0.90 + pixelHash(seed ^ 0x77ab31d1, 0, boardRow) * 0.22;
        const grain = 0.955 + Math.sin(u * 83 + boardRow * 2.7) * 0.030
          + Math.sin(u * 197 + boardRow) * 0.014;
        const gap = (v * BOARDS) % 1 < 0.045 ? 1 : 0;
        const tone = boardTone * grain * (1 - gap * 0.34);
        albedo[i] = clampByte(albedo[i] * tone);
        albedo[i + 1] = clampByte(albedo[i + 1] * tone);
        albedo[i + 2] = clampByte(albedo[i + 2] * tone);
        roughness[i] = roughness[i + 1] = roughness[i + 2] = clampByte(224 + gap * 18);
        height[i] = height[i + 1] = height[i + 2] = clampByte(150 - gap * 66 + Math.sin(u * 83) * 8);
      } else if (family === 'glass_wired') {
        // Georgian wired glass — the industrial pane. The wire grid is what tells a viewer this
        // is a factory window and not a shopfront, and it is drawn as a value grid rather than
        // as relief because a wire is INSIDE the glass, not on it.
        const WIRES = 12;
        const gu = (u * WIRES) % 1;
        const gv = (v * WIRES) % 1;
        const wire = Math.max(
          gu < 0.055 ? 1 - gu / 0.055 : 0,
          gv < 0.055 ? 1 - gv / 0.055 : 0,
        );
        const pane = 0.86 + low * 0.10 + Math.sin(u * 3.1 + v * 2.3) * 0.04;
        albedo[i] = clampByte(232 * pane + wire * 26);
        albedo[i + 1] = clampByte(238 * pane + wire * 26);
        albedo[i + 2] = clampByte(236 * pane + wire * 22);
        roughness[i] = roughness[i + 1] = roughness[i + 2] = clampByte(52 + wire * 90 + low * 18);
        height[i] = height[i + 1] = height[i + 2] = clampByte(128 + wire * 22);
      } else if (family === 'render') {
        // Smooth-set render on a rendered name-band or a painted parapet. Trowel-float story
        // only; the aggregate coat belongs to a roughcast wall, which these subjects do not have.
        const patch = 0.97 + low * 0.06 + Math.sin(u * 5.3 + v * 2.7) * 0.022;
        const float = 0.96 + Math.sin(u * 9.1 + v * 4.3) * 0.012 + Math.sin(v * 12.7 - u * 3.1) * 0.008;
        const wash = patch * float;
        albedo[i] = clampByte(albedo[i] * wash);
        albedo[i + 1] = clampByte(albedo[i + 1] * wash);
        albedo[i + 2] = clampByte(albedo[i + 2] * wash);
        height[i] = height[i + 1] = height[i + 2]
          = clampByte(128 + Math.sin(u * Math.PI * 13 + Math.sin(v * 9.3) * 1.2) * 7 + (low - 0.5) * 10);
      }
    }
  }
}

/* ───────────────────────────── the hand-built mip chain ──────────────────────────────
 *
 * sRGB decode / encode tables. The albedo atlas is an sRGB texture, and averaging four sRGB
 * bytes is not averaging four colours: a black-and-white pair averages to 128 in sRGB and to
 * 188 in light. Reducing the albedo in the encoded space would darken every family as it
 * minifies, and the measurement this programme takes most often is the L* of a surface — a wall
 * losing ten points of lightness as the camera pulls back would be a new defect introduced by
 * the fix for an old one. Roughness and normal carry no transfer function and are reduced raw.
 */
const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i += 1) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function linearToSrgbByte(value) {
  const c = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return clampByte(c * 255);
}

/**
 * One 2×2 box reduction of a square tile.
 *
 * A 2×2 block never straddles a cell boundary while the cell size is even, so reducing the
 * family's own tile is exactly what a wrap-aware reduction of that tile would produce.
 * Normals are reduced WITHOUT renormalising on purpose: two opposed slopes averaging toward
 * (0.5, 0.5) is relief retiring itself as the surface minifies, which is the behaviour the
 * corrugated and brick families want.
 */
function reduceTile(source, size, srgb) {
  const half = size >> 1;
  const target = new Uint8ClampedArray(half * half * 4);
  for (let y = 0; y < half; y += 1) {
    for (let x = 0; x < half; x += 1) {
      const a = ((y * 2) * size + x * 2) * 4;
      const b = a + 4;
      const c = ((y * 2 + 1) * size + x * 2) * 4;
      const d = c + 4;
      const o = (y * half + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        target[o + channel] = srgb
          ? linearToSrgbByte((SRGB_TO_LINEAR[source[a + channel]]
            + SRGB_TO_LINEAR[source[b + channel]]
            + SRGB_TO_LINEAR[source[c + channel]]
            + SRGB_TO_LINEAR[source[d + channel]]) * 0.25)
          : Math.round((source[a + channel] + source[b + channel]
            + source[c + channel] + source[d + channel]) * 0.25);
      }
      target[o + 3] = Math.round((source[a + 3] + source[b + 3] + source[c + 3] + source[d + 3]) * 0.25);
    }
  }
  return target;
}

/** The two-texel gutter. Region rects assume this inset; changing it invalidates them. */
function applyCellGutter(target, atlasWidth, originX, originY, cell, gutter) {
  for (let g = 1; g <= gutter; g += 1) {
    for (let x = 0; x < cell; x += 1) {
      const top = ((originY + g) * atlasWidth + originX + x) * 4;
      const bottom = ((originY + cell - 1 - g) * atlasWidth + originX + x) * 4;
      const topEdge = ((originY) * atlasWidth + originX + x) * 4;
      const bottomEdge = ((originY + cell - 1) * atlasWidth + originX + x) * 4;
      target.copyWithin(topEdge, top, top + 4);
      target.copyWithin(bottomEdge, bottom, bottom + 4);
    }
    for (let y = 0; y < cell; y += 1) {
      const left = ((originY + y) * atlasWidth + originX + g) * 4;
      const right = ((originY + y) * atlasWidth + originX + cell - 1 - g) * 4;
      const leftEdge = ((originY + y) * atlasWidth + originX) * 4;
      const rightEdge = ((originY + y) * atlasWidth + originX + cell - 1) * 4;
      target.copyWithin(leftEdge, left, left + 4);
      target.copyWithin(rightEdge, right, right + 4);
    }
  }
}

/** Lay one level's family tiles into the 3 × 3 grid and re-gutter every cell. */
function assembleLevel(tiles, cell) {
  const atlasWidth = COLUMNS * cell;
  const atlasHeight = ROWS * cell;
  const target = new Uint8ClampedArray(atlasWidth * atlasHeight * 4);
  const gutter = Math.max(1, Math.min(GUTTER, Math.floor(cell / 8)));
  for (let index = 0; index < COLUMNS * ROWS; index += 1) {
    const family = FAMILY_ORDER[index] ?? FAMILY_ORDER[FAMILY_ORDER.length - 1];
    const tile = tiles[family];
    const originX = (index % COLUMNS) * cell;
    const originY = Math.floor(index / COLUMNS) * cell;
    for (let y = 0; y < cell; y += 1) {
      const from = y * cell * 4;
      target.set(tile.subarray(from, from + cell * 4), ((originY + y) * atlasWidth + originX) * 4);
    }
    applyCellGutter(target, atlasWidth, originX, originY, cell, gutter);
  }
  return { data: target, width: atlasWidth, height: atlasHeight };
}

function canvasFromRGBA(rgba, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: false });
  const image = context.createImageData(width, height);
  image.data.set(rgba);
  context.putImageData(image, 0, 0);
  return canvas;
}

/**
 * One atlas map, with its chain.
 *
 * `generateMipmaps` is false and `mipmaps` carries every level, so three.js allocates with
 * `texStorage2D(levels = mipmaps.length)` and uploads each one; the texture is complete at
 * exactly MIP_LEVELS and anything more minified clamps to the last rather than sampling an
 * undefined level.
 */
function atlasTexture(levels, colorSpace) {
  const canvases = levels.map((level) => canvasFromRGBA(level.data, level.width, level.height));
  const texture = new THREE.CanvasTexture(canvases[0]);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // The chain and the gradients are two halves of one fix and neither works alone. The flag
  // without `textureGrad` selects a level from the derivative of a WRAPPED coordinate, which is
  // meaningless on any quad straddling a tile seam — and on a minified surface that is most of
  // them. `configureIndustrialAtlasShader` takes its gradients from the UNWRAPPED tile
  // coordinate for exactly that reason.
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.mipmaps = canvases;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  texture.userData.procedural = true;
  texture.userData.industrialAtlas = true;
  return texture;
}

function makeAtlas(size) {
  const atlasWidth = COLUMNS * size;
  const atlasHeight = ROWS * size;
  const regions = {};
  const tiles = { albedo: {}, roughness: {}, normal: {} };

  for (let index = 0; index < FAMILY_ORDER.length; index += 1) {
    const family = FAMILY_ORDER[index];
    const sourceId = FAMILY_SOURCE[family];
    const source = TEXTURE_GENERATORS[sourceId];
    if (!source) throw new Error(`Missing industrial atlas source: ${sourceId}`);
    const generated = source(size, hashSeed(`v332-industrial-atlas:${family}:${size}`));
    decorate(family, generated, size, hashSeed(`v332-industrial-detail:${family}:${size}`));
    tiles.albedo[family] = generated.albedo;
    tiles.roughness[family] = generated.roughness;
    tiles.normal[family] = sobelNormalFromHeight(generated.height, size, NORMAL_STRENGTH[family] ?? 2.0);

    const originX = (index % COLUMNS) * size;
    const originY = Math.floor(index / COLUMNS) * size;
    // CanvasTexture keeps flipY = true. Convert the authored top-left row to the WebGL
    // bottom-left origin before exposing the rect; otherwise row 0 samples row 1, which in the
    // residential kit rendered slate as foliage and took a round to find.
    regions[family] = Object.freeze({
      offset: [(originX + GUTTER) / atlasWidth, (atlasHeight - originY - size + GUTTER) / atlasHeight],
      scale: [(size - GUTTER * 2) / atlasWidth, (size - GUTTER * 2) / atlasHeight],
      repeat: FAMILY_REPEAT[family] ?? [0.5, 0.5],
    });
  }

  const chain = { albedo: [], roughness: [], normal: [] };
  const level = { albedo: tiles.albedo, roughness: tiles.roughness, normal: tiles.normal };
  let cell = size;
  for (let l = 0; l < MIP_LEVELS && cell >= 8 && cell % 2 === 0; l += 1) {
    for (const channel of ['albedo', 'roughness', 'normal']) {
      chain[channel].push(assembleLevel(level[channel], cell));
    }
    if (l + 1 >= MIP_LEVELS) break;
    const next = { albedo: {}, roughness: {}, normal: {} };
    for (const family of FAMILY_ORDER) {
      next.albedo[family] = reduceTile(level.albedo[family], cell, true);
      next.roughness[family] = reduceTile(level.roughness[family], cell, false);
      next.normal[family] = reduceTile(level.normal[family], cell, false);
    }
    level.albedo = next.albedo;
    level.roughness = next.roughness;
    level.normal = next.normal;
    cell >>= 1;
  }

  return {
    width: atlasWidth,
    height: atlasHeight,
    levels: chain.albedo.map((entry) => [entry.width, entry.height]),
    regions: Object.freeze(regions),
    albedo: atlasTexture(chain.albedo, THREE.SRGBColorSpace),
    roughness: atlasTexture(chain.roughness, THREE.NoColorSpace),
    normal: atlasTexture(chain.normal, THREE.NoColorSpace),
  };
}

export class IndustrialTextureAtlas {
  constructor({ quality = 'high' } = {}) {
    this.tileSize = quality === 'low' ? 128 : quality === 'medium' ? 192 : 256;
    Object.assign(this, makeAtlas(this.tileSize));
    this.id = `industrial-atlas-v332-${quality}`;
    this.disposed = false;
  }

  textureBytes() {
    const perMap = (this.levels ?? [[this.width, this.height]])
      .reduce((sum, [w, h]) => sum + w * h * 4, 0);
    return Math.round(perMap * 3);
  }

  dispose() {
    if (this.disposed) return;
    this.albedo.dispose();
    this.roughness.dispose();
    this.normal.dispose();
    this.disposed = true;
  }
}

/**
 * Attach one atlas to a MaterialLibrary. The library owns it, so a board teardown releases the
 * three GPU textures with the rest of its materials.
 *
 * RETURNS NULL RATHER THAN THROWING when there is no DOM or no real MaterialLibrary. That is
 * not defensive padding: `mvp/tests/industrial-product.test.mjs` assembles both subjects in
 * plain node with a five-line materials stub and no `document`, and the industrial kit is the
 * only kit that node test reaches. A hard throw here would take the product contract with it,
 * and a kit that cannot be tested outside a browser is a kit whose contract stops being
 * checked. Every consumer below already treats a missing atlas as "no atlas".
 */
export function getIndustrialTextureAtlas(materials) {
  if (!materials || typeof materials.registerTexturePack !== 'function') return null;
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  if (materials.userData?.industrialAtlas) return materials.userData.industrialAtlas;
  const atlas = new IndustrialTextureAtlas({ quality: materials.quality });
  materials.userData ??= {};
  materials.userData.industrialAtlas = atlas;
  materials.registerTexturePack(atlas);
  return atlas;
}

/** Apply one atlas region to an industrial material without cloning the texture. */
export function applyIndustrialAtlas(material, family, atlas) {
  const region = atlas?.regions?.[family];
  if (!material || !region) return false;
  material.map = atlas.albedo;
  material.roughnessMap = atlas.roughness;
  material.normalMap = atlas.normal;
  material.aoMap = null;
  material.userData.industrialAtlas = { family, atlas: atlas.id };
  material.needsUpdate = true;
  return true;
}

/**
 * Shader hook for the one shared atlas texture. All map channels use the same region UV.
 *
 * The wrap has to happen per FRAGMENT. Doing it per vertex is why a whole-number repeat once
 * rendered as flat colour across the residential set: box primitives are one quad per face, so
 * `fract` was evaluated at the four corners and interpolated between them, and `fract(0)` and
 * `fract(4)` are both zero — a constant. The family tile was not tiled four times across the
 * face, it was thrown away and the face sampled a single column of the region.
 *
 * `vNormalMapUv` is deliberately NOT the wrapped UV. Its only remaining reader differentiates
 * the coordinate to build the tangent basis; hand it a wrapped coordinate and every seam quad
 * gets a garbage frame and a normal pointing somewhere arbitrary.
 */
export function configureIndustrialAtlasShader(material, atlas, family, repeatOverride = null) {
  const region = atlas?.regions?.[family];
  if (!material || !region) return;

  // RE-ENTRANCY — THE SAME GUARD `configureIndustrialWearShader` ALREADY CARRIES, AND IT IS
  // MISSING HERE FOR NO REASON OTHER THAN THAT NOTHING RE-ENTERED UNTIL RENOVATION DID.
  //
  // `MaterialLibrary.get()` caches on family::variant::overrides and `assembleIndustrial` keys
  // its palette WITHOUT the condition tier, so the `renovated` warehouse is dressed with the
  // very same material objects the `standard` one is already using. Assembling the second tier
  // therefore runs `dressSurface` over materials that have already been patched. The wear
  // installer notices and updates its uniforms; this one used to wrap `onBeforeCompile` again,
  // so the shader declared `ddIndAtlasRepeat`, `ddIndAtlasTile`, `ddIndAtlasOffset`,
  // `ddIndAtlasScale` and the bodies of `ddIndAtlasSampleUv` / `ddIndAtlasSample` TWICE, and
  // the program failed to link with `'X' : redefinition`.
  //
  // A failed link is silent in the worst possible way: the draw call is still issued and the
  // triangles are still counted, so the group looks alive from JS — in the scene, visible, nine
  // children, correct transform — while WebGL logs `useProgram: program not valid` and
  // rasterises nothing. That is the whole of "the renovated warehouse never appears, and the
  // landscaping never shows": the landscaping is emitted into the same group.
  //
  // The originals kept drawing because their program was already compiled and cached under
  // `industrial-atlas-v332`, and three never rebuilds a cached key. Only the dynamic clone,
  // which asks for a key of its own, ever compiled the doubled source — which is why this read
  // as a renovation bug rather than as the material bug it is.
  //
  // A repeat call now updates the region and repeat in place, exactly as the wear guard updates
  // its uniforms, so a later call with a different override still takes effect.
  const configured = material.userData.industrialAtlasShader;
  if (configured) {
    configured.region = region;
    configured.repeat = Array.isArray(repeatOverride) ? repeatOverride : region.repeat;
    material.needsUpdate = true;
    return;
  }
  const configuration = {
    region,
    repeat: Array.isArray(repeatOverride) ? repeatOverride : region.repeat,
  };
  material.userData.industrialAtlasShader = configuration;

  const previousCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previousCompile) previousCompile(shader, renderer);
    const { repeat } = configuration;
    shader.uniforms.ddIndAtlasRepeat = { value: new THREE.Vector2(repeat[0], repeat[1]) };
    shader.uniforms.ddIndAtlasOffset = { value: new THREE.Vector2(...configuration.region.offset) };
    shader.uniforms.ddIndAtlasScale = { value: new THREE.Vector2(...configuration.region.scale) };

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
uniform vec2 ddIndAtlasRepeat;
varying vec2 ddIndAtlasTile;`,
    );
    // The UNWRAPPED tile coordinate, affine in the vertex attributes, so interpolating it
    // across a triangle is exact and its derivative is continuous at a seam. Industrial UVs are
    // already in METRES of building space (see `core.js: applyMetreUv`), so this is
    // metres × tiles-per-metre = tiles, and no world-space projection is needed in the shader.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
	ddIndAtlasTile = uv * ddIndAtlasRepeat;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <uv_pars_fragment>',
      `#include <uv_pars_fragment>
uniform vec2 ddIndAtlasOffset;
uniform vec2 ddIndAtlasScale;
varying vec2 ddIndAtlasTile;
vec2 ddIndAtlasSampleUv() {
  return ddIndAtlasOffset + fract(ddIndAtlasTile) * ddIndAtlasScale;
}
vec4 ddIndAtlasSample( sampler2D ddAtlasMap ) {
  return textureGrad( ddAtlasMap, ddIndAtlasSampleUv(),
    dFdx( ddIndAtlasTile ) * ddIndAtlasScale,
    dFdy( ddIndAtlasTile ) * ddIndAtlasScale );
}
#define vMapUv ddIndAtlasSampleUv()
#define vRoughnessMapUv ddIndAtlasSampleUv()
#define vNormalMapUv ( ddIndAtlasTile * ddIndAtlasScale )`,
    );

    // Three chunk bodies rewritten so the atlas maps are sampled with those gradients. Only the
    // sampler call changes; everything else is three r185's own chunk text, kept verbatim
    // including the branches these materials do not currently take.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
	vec4 sampledDiffuseColor = ddIndAtlasSample( map );
	diffuseColor *= sampledDiffuseColor;
#endif
${DD_MAP_SENTINEL}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = ddIndAtlasSample( roughnessMap );
	roughnessFactor *= texelRoughness.g;
#endif
${DD_ROUGHNESS_SENTINEL}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = ddIndAtlasSample( normalMap ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = ddIndAtlasSample( normalMap ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,
    );
  };
  // The SOURCE is identical for every region — offsets, scales and repeats are uniforms — so
  // one cache key is correct rather than merely convenient, and the atlas pays one program
  // instead of one per family. three computes the key BEFORE `onBeforeCompile` runs, so
  // anything baked into the source and varying per material MUST reach this string; nothing
  // here does.
  material.customProgramCacheKey = () => 'industrial-atlas-v332';
  material.userData.industrialAtlasFamily = family;
  material.needsUpdate = true;
}

/**
 * The directed wear program (V332 §2c).
 *
 * `directive` is the per-surface request described in this file's header. It rides UNIFORMS
 * rather than being interpolated into the shader source, for two reasons that are the same
 * reason: the source stays byte-identical so every industrial material can share one program,
 * and a lane can amend a surface's wear after `palette()` has returned by calling
 * `requestWear` — three refreshes uniforms per material, so two materials sharing a program
 * keep their own values.
 *
 * `shadowFloor` is in LINEAR outgoing radiance, clamped before tone mapping. It exists because
 * the post chain lifts shadows by about twelve points, so a dark bucket needs an albedo deep
 * enough to survive the lift AND a floor to stop a face turned off the key returning literally
 * zero. A clipped wall at zero is not a shadow.
 */
export function configureIndustrialWearShader(material, family, directive = {}) {
  if (!material) return;

  const isWall = family === 'brick' || family === 'render' || family === 'concrete';
  const isSheet = family === 'corrugated' || family === 'painted_metal' || family === 'rust';
  const isGround = family === 'asphalt' || family === 'concrete';

  // Re-entrancy. `materials.get()` caches on `family::variant::overrides`, so a second
  // `palette()` call for one key hands back the SAME material object; without this guard the
  // patch below would declare its uniforms twice at global scope and the program would fail to
  // link — on the wall, the cladding and the ground at once, which is every large surface an
  // industrial subject has. A repeat call updates values instead of re-patching.
  const existing = material.userData.industrialWear;
  if (existing) {
    applyDirective(existing.uniforms, family, directive, { isWall, isSheet, isGround });
    material.needsUpdate = true;
    return;
  }

  const uniforms = {
    ddIndWearSeed: { value: 0.5 },
    ddIndWearRust: { value: 0.0 },
    ddIndWearGrime: { value: 0.0 },
    ddIndWearTyre: { value: 0.0 },
    ddIndWearOil: { value: 0.0 },
    ddIndWearChalk: { value: 0.0 },
    ddIndWearSalt: { value: 0.0 },
    ddIndWearMoss: { value: 0.0 },
    ddIndWearDropA: { value: -2.6 },
    ddIndWearDropB: { value: 2.9 },
    ddIndWearHead: { value: 8.0 },
    ddIndWearPlinth: { value: 0.9 },
    ddIndWearDockZ: { value: 0.0 },
    ddIndWearVertical: { value: 1.0 },
    ddIndWearHorizontal: { value: 0.0 },
    ddIndShadowFloor: { value: 0.050 },
    // Per-mark amplitude gains. 1.0 is the authored ceiling; a lane pushes one mark on one
    // bucket without touching the others, and without widening the mark's footprint.
    ddIndGainRust: { value: 1.0 },
    ddIndGainGrime: { value: 1.0 },
    ddIndGainTyre: { value: 1.0 },
    ddIndGainOil: { value: 1.0 },
    ddIndGainChalk: { value: 1.0 },
    ddIndGainSalt: { value: 1.0 },
    ddIndGainMoss: { value: 1.0 },
  };
  applyDirective(uniforms, family, directive, { isWall, isSheet, isGround });
  material.userData.industrialWear = { family, uniforms };

  const previousCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previousCompile) previousCompile(shader, renderer);
    for (const [name, uniform] of Object.entries(uniforms)) shader.uniforms[name] = uniform;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 ddIndPosition;\nvarying vec3 ddIndNormal;',
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
	ddIndPosition = transformed;
	ddIndNormal = objectNormal;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 ddIndPosition;
varying vec3 ddIndNormal;
uniform float ddIndWearSeed;
uniform float ddIndWearRust;
uniform float ddIndWearGrime;
uniform float ddIndWearTyre;
uniform float ddIndWearOil;
uniform float ddIndWearChalk;
uniform float ddIndWearSalt;
uniform float ddIndWearMoss;
uniform float ddIndWearDropA;
uniform float ddIndWearDropB;
uniform float ddIndWearHead;
uniform float ddIndWearPlinth;
uniform float ddIndWearDockZ;
uniform float ddIndWearVertical;
uniform float ddIndWearHorizontal;
uniform float ddIndShadowFloor;
uniform float ddIndGainRust;
uniform float ddIndGainGrime;
uniform float ddIndGainTyre;
uniform float ddIndGainOil;
uniform float ddIndGainChalk;
uniform float ddIndGainSalt;
uniform float ddIndGainMoss;

/** One deterministic unit value per integer cell. No clock, no per-frame state. */
vec2 ddIndCellHash(vec2 cell) {
  vec2 h = fract(cell * vec2(0.1031, 0.11369));
  h += dot(h, h.yx + 33.33);
  return fract(vec2((h.x + h.y) * (h.x + 19.19 * h.y), (h.x + h.y) * 37.719));
}`,
    );

    shader.fragmentShader = insertAfterAnchor(shader.fragmentShader,
      [DD_MAP_SENTINEL, '#include <map_fragment>'],
      `
  float ddX = ddIndPosition.x;
  float ddY = ddIndPosition.y;
  float ddZ = ddIndPosition.z;
  vec3 ddFaceAbs = abs(normalize(ddIndNormal + vec3(0.0, 1e-5, 0.0)));
  // \`ddAlong\` runs ACROSS whichever elevation this fragment sits on, so a station placed at
  // 1.9 m along puts a downpipe near the same corner on the front and on the flank rather than
  // only on the two faces that happen to use x. Without it, every directed mark is a mark on
  // two of the four elevations, which reads as a texturing bug rather than as weather.
  float ddAlong = ddFaceAbs.x > ddFaceAbs.z ? ddZ : ddX;
  float ddVertical = (1.0 - smoothstep(0.35, 0.62, ddFaceAbs.y)) * ddIndWearVertical;
  float ddUpFace = smoothstep(0.55, 0.82, ddFaceAbs.y) * ddIndWearHorizontal;
  vec2 ddFaceNormal = normalize(ddIndNormal.xz + vec2(0.0001));
  float ddSunFace = dot(ddFaceNormal, normalize(vec2(-0.34, 0.94)));

  // 1. RUST BLEED, at two stations rather than on a sine. §2.7's whole complaint about wear is
  //    that a periodic function puts the same mark at even intervals across every elevation,
  //    which is the definition of a filter. Two numbers put two fixings somewhere, and the eye
  //    reads two marks in unequal places as a building that has weathered.
  //    The streak leaves a collar as a line and widens on its way down, because water does.
  float ddSpread = 0.045 + 0.085 * clamp((ddIndWearHead - ddY) / max(1.0, ddIndWearHead), 0.0, 1.0);
  float ddPipeA = 1.0 - smoothstep(0.0, ddSpread, abs(ddAlong - ddIndWearDropA));
  float ddPipeB = 1.0 - smoothstep(0.0, ddSpread, abs(ddAlong - ddIndWearDropB));
  float ddStation = max(ddPipeA, ddPipeB);
  float ddJointY = 1.0 - smoothstep(0.10, 0.70, abs(ddY - ddIndWearHead));
  float ddRunY = smoothstep(ddIndWearHead + 0.20, ddIndWearHead - 3.2, ddY)
    * smoothstep(0.06, 0.55, ddY);
  float ddOxide = clamp(ddVertical * ddIndWearRust * ddStation
    * max(ddJointY, ddRunY * 0.72), 0.0, 1.0);
  // Oxide is a warm loss, not an orange decal: red holds, green and blue give way. The three
  // constants are the DEPTH of the streak inside its own two stations, never its width — the
  // width is ddSpread and the gain does not touch it.
  vec3 ddOxideCut = clamp(vec3(0.16, 0.34, 0.46) * ddOxide * ddIndGainRust, 0.0, 0.94);
  diffuseColor.rgb *= 1.0 - ddOxideCut;

  // 2. THE GRIME BAND at truck-mirror and forklift-mast height. It has a TOP EDGE — a wavering
  //    tide line, not a gradient that fades out somewhere — because that edge is what separates
  //    a band from a vignette, and a vignette is the filter §2c scores zero.
  float ddTide = 1.62 + 0.10 * sin(ddAlong * 1.35 + ddIndWearSeed * 23.0)
    + 0.06 * sin(ddAlong * 4.1 - ddIndWearSeed * 7.0);
  //    The along-elevation term's floor is 0.34 rather than 0.58 so that raising the ceiling
  //    raises the STREAKS and not the field: between streaks the band now lands about where the
  //    whole band used to sit, and in a streak it goes three times deeper.
  float ddGrime = ddVertical * ddIndWearGrime
    * smoothstep(ddTide, ddTide - 0.42, ddY) * smoothstep(0.05, 0.30, ddY)
    * (0.34 + 0.66 * pow(max(0.0, sin(ddAlong * 2.6 + ddIndWearSeed * 5.0)), 2.0));
  diffuseColor.rgb *= 1.0 - clamp(ddGrime * 0.30 * ddIndGainGrime, 0.0, 0.90);

  // 3. SALT BLOOM out of the plinth. Efflorescence is a PALE lift, the opposite direction from
  //    grime, and it stops at a tide line of its own where the wall dries.
  float ddSalt = ddVertical * ddIndWearSalt
    * smoothstep(ddIndWearPlinth + 0.30, ddIndWearPlinth - 0.55, ddY)
    * smoothstep(0.02, 0.22, ddY)
    * (0.42 + 0.58 * max(0.0, sin(ddAlong * 1.8 + ddIndWearSeed * 11.0)));
  diffuseColor.rgb += vec3(0.105, 0.101, 0.091) * clamp(ddSalt * ddIndGainSalt, 0.0, 2.0);

  // 4. TYRE SCRUB AND OIL BLOOM, on UP-FACING faces only and concentrated where the trailer
  //    stands. This is the mark these subjects can actually win on: a house has nowhere for it
  //    and an apron has nothing else. Both terms fall off with distance from the dock so the
  //    far corner of a yard stays clean, which is what makes the near corner read as used.
  float ddDock = 1.0 - smoothstep(0.0, 9.0, abs(ddZ - ddIndWearDockZ));
  float ddScrubField = sin(ddX * 0.62 + ddIndWearSeed * 4.0) * cos(ddZ * 0.41 - ddIndWearSeed * 2.0);
  float ddScrub = ddUpFace * ddIndWearTyre * ddDock
    * smoothstep(0.15, 0.85, 0.5 + 0.5 * ddScrubField);
  diffuseColor.rgb *= 1.0 - clamp(ddScrub * 0.30 * ddIndGainTyre, 0.0, 0.88);
  vec2 ddOilCell = floor(vec2(ddX, ddZ) / 2.6);
  vec2 ddOilRand = ddIndCellHash(ddOilCell + vec2(11.0, 3.0));
  vec2 ddOilDelta = fract(vec2(ddX, ddZ) / 2.6) - (0.20 + ddOilRand * 0.60);
  float ddOil = ddUpFace * ddIndWearOil * ddDock * step(0.62, ddOilRand.x)
    * (1.0 - smoothstep(0.10, 0.34, length(ddOilDelta)));
  diffuseColor.rgb *= 1.0 - clamp(ddOil * 0.44 * ddIndGainOil, 0.0, 0.92);

  // 5. CHALKING on the sun elevation. Paint and render bloom pale where the sun hits, in
  //    patches with soft edges rather than evenly, sized in metres so a sign plate and a flank
  //    chalk at the same scale.
  float ddChalkField = 0.5 + 0.5 * sin(ddAlong * 0.55 + ddY * 0.36 + ddIndWearSeed * 9.0)
    * cos(ddAlong * 0.26 - ddY * 0.71 + ddIndWearSeed * 3.0);
  float ddChalk = ddVertical * ddIndWearChalk
    * smoothstep(0.18, 0.70, ddSunFace)
    * smoothstep(0.35, 0.72, ddChalkField)
    * smoothstep(0.70, 2.20, ddY);
  diffuseColor.rgb *= 1.0 + clamp(ddChalk * 0.15 * ddIndGainChalk, 0.0, 0.65);

  // 6. MOSS IN THE NORTH VALLEY. Moss grows where a plane runs into something and stays damp,
  //    on the side the sun does not reach. Both terms are needed: shade alone paints a pitch.
  float ddMoss = ddIndWearMoss * ddUpFace
    * (1.0 - smoothstep(-0.25, 0.30, ddSunFace))
    * smoothstep(0.30, 0.80, 0.5 + 0.5 * sin(ddAlong * 1.05 + ddIndWearSeed * 15.0));
  float ddMossAmp = clamp(ddMoss * ddIndGainMoss, 0.0, 2.0);
  diffuseColor.rgb *= 1.0 - clamp(ddMossAmp * 0.17, 0.0, 0.80);
  diffuseColor.rgb += vec3(0.012, 0.036, 0.010) * ddMossAmp;
`, 'map_fragment');

    shader.fragmentShader = insertAfterAnchor(shader.fragmentShader,
      [DD_ROUGHNESS_SENTINEL, '#include <roughnessmap_fragment>'],
      `
  // Directed wear changes how a surface ANSWERS LIGHT, not only what colour it is. Oxide,
  // grime, salt, scrub and moss are all matte; oil goes the other way, because a fresh drip is
  // the one wet thing on a yard; chalking is dry rather than polished, so it lifts a little.
  // The gains ride here too. A mark that got three times deeper in albedo and answered light
  // exactly as it did before reads as a decal printed on the surface rather than as the surface
  // having changed, which is the same failure as a filter wearing a different hat.
  float ddRoughWear = ddOxide * 0.24 * ddIndGainRust
    + ddGrime * 0.17 * ddIndGainGrime
    + ddSalt * 0.20 * ddIndGainSalt
    + ddScrub * 0.14 * ddIndGainTyre
    + ddMoss * 0.22 * ddIndGainMoss
    + ddChalk * 0.07 * ddIndGainChalk
    - ddOil * 0.46 * ddIndGainOil;
  roughnessFactor = clamp(roughnessFactor + ddRoughWear, 0.02, 1.0);
`, 'roughnessmap_fragment');

    // Keep the dark buckets off zero after the studio grade. Both chunk names are attempted:
    // `<output_fragment>` was renamed to `<opaque_fragment>` in three r152 and this project is
    // on r185, and a `String.replace` that matches nothing reports nothing — which is exactly
    // how the residential equivalent sat dead across a three.js rename for thirty rounds.
    for (const chunk of ['#include <opaque_fragment>', '#include <output_fragment>']) {
      if (!shader.fragmentShader.includes(chunk)) continue;
      shader.fragmentShader = shader.fragmentShader.replace(
        chunk,
        `outgoingLight = max( outgoingLight, vec3( ddIndShadowFloor ) );\n${chunk}`,
      );
      break;
    }
  };

  // One key for the whole atlas: the source is byte-identical for every family because every
  // family difference above is a uniform. A material that never reached the atlas keeps its own
  // key so it cannot share a program with one that did.
  material.customProgramCacheKey = material.userData?.industrialAtlas
    ? () => 'industrial-atlas-v332'
    : () => `industrial-wear-v332-${family}`;
  material.needsUpdate = true;
}

/** Fold a directive into a uniform set. Shared by the first call and by `requestWear`. */
function applyDirective(uniforms, family, directive, flags) {
  const set = (name, value) => {
    if (value === undefined || value === null || !Number.isFinite(value)) return;
    uniforms[name].value = value;
  };
  set('ddIndWearSeed', directive.seed);
  set('ddIndWearRust', directive.rustBleed);
  set('ddIndWearGrime', directive.grimeBand);
  set('ddIndWearTyre', directive.tyreScrub);
  set('ddIndWearOil', directive.oilBloom);
  set('ddIndWearChalk', directive.chalk);
  set('ddIndWearSalt', directive.saltBloom);
  set('ddIndWearMoss', directive.mossValley);
  set('ddIndWearDropA', directive.dropA);
  set('ddIndWearDropB', directive.dropB);
  set('ddIndWearHead', directive.headY);
  set('ddIndWearPlinth', directive.plinthY);
  set('ddIndWearDockZ', directive.dockZ);
  set('ddIndShadowFloor', directive.shadowFloor);
  // Per-mark amplitude gains. Absent means 1.0 means the authored ceiling, so a directive that
  // predates these keys is unchanged by them.
  set('ddIndGainRust', directive.rustGain);
  set('ddIndGainGrime', directive.grimeGain);
  set('ddIndGainTyre', directive.tyreGain);
  set('ddIndGainOil', directive.oilGain);
  set('ddIndGainChalk', directive.chalkGain);
  set('ddIndGainSalt', directive.saltGain);
  set('ddIndGainMoss', directive.mossGain);
  // `wearGain` is the blunt form: one number that lifts every mark on the bucket at once. It is
  // applied only where a specific gain was not asked for, so the two can be mixed.
  if (Number.isFinite(directive.wearGain)) {
    for (const [key, specific] of [
      ['ddIndGainRust', directive.rustGain], ['ddIndGainGrime', directive.grimeGain],
      ['ddIndGainTyre', directive.tyreGain], ['ddIndGainOil', directive.oilGain],
      ['ddIndGainChalk', directive.chalkGain], ['ddIndGainSalt', directive.saltGain],
      ['ddIndGainMoss', directive.mossGain],
    ]) {
      if (!Number.isFinite(specific)) uniforms[key].value = directive.wearGain;
    }
  }
  // A family that is never vertical must not pay for the vertical marks, and a family that is
  // never horizontal must not pay for the apron marks. These are the family gates, and they are
  // uniforms so the shader SOURCE stays identical across families.
  if (directive.verticalOnly !== undefined) {
    uniforms.ddIndWearVertical.value = directive.verticalOnly ? 1 : 0;
  } else {
    uniforms.ddIndWearVertical.value = flags.isWall || flags.isSheet || family === 'timber' ? 1 : 0.55;
  }
  if (directive.horizontalOnly !== undefined) {
    uniforms.ddIndWearHorizontal.value = directive.horizontalOnly ? 1 : 0;
  } else {
    uniforms.ddIndWearHorizontal.value = flags.isGround || flags.isSheet ? 1 : 0.4;
  }
}

/**
 * Amend one bucket's wear after `palette()` has returned.
 *
 * A lane calls this when its subject wants a mark the default profile does not carry — a
 * factory whose stack throws soot down one elevation, a bond store whose north valley holds
 * more moss than a shed's. It updates uniforms, so it is safe before or after the first
 * compile, and it is idempotent.
 *
 * IT AFFECTS EVERY PART IN THAT BUCKET. Wear is a per-surface request, and a "surface" here is
 * a material bucket — that is the whole point of a nine-bucket contract. A lane that wants two
 * different wear stories on one family needs two buckets, and it does not have two to spend.
 *
 * `patch` takes the seven directive strengths, the metre/station values, and — added by the
 * CORE REPAIR seat — the seven amplitude gains `rustGain` / `grimeGain` / `tyreGain` /
 * `oilGain` / `chalkGain` / `saltGain` / `mossGain`, plus `wearGain` as a shorthand for all
 * seven at once. A strength says HOW MUCH of the mark's own field is switched on and saturates
 * at 1.0; a gain says how deep the mark cuts inside that field and has no ceiling of its own.
 * A lane that has run its strengths to 1.0 and still wants more asks for a gain, and the mark
 * gets deeper rather than wider — which is the difference between weather and a filter.
 */
export function requestWear(material, patch = {}) {
  const held = material?.userData?.industrialWear;
  if (!held) return false;
  const family = held.family;
  applyDirective(held.uniforms, family, patch, {
    isWall: family === 'brick' || family === 'render' || family === 'concrete',
    isSheet: family === 'corrugated' || family === 'painted_metal' || family === 'rust',
    isGround: family === 'asphalt' || family === 'concrete',
  });
  material.needsUpdate = true;
  return true;
}

export const INDUSTRIAL_ATLAS_FAMILIES = FAMILY_ORDER;
export { FAMILY_REPEAT as INDUSTRIAL_ATLAS_REPEAT, TILE_METRES as INDUSTRIAL_ATLAS_TILE_METRES };
