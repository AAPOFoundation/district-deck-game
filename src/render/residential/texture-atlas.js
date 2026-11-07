// District Deck V3.20 — residential surface atlas.
//
// This is deliberately separate from render/textures.js. The latter is the shared W1 pack
// used by the whole board; this pack is only attached by the residential palette. One atlas
// image per map keeps the texture count and draw contract flat while each material gets its
// own atlas region through a shader UV transform.

import * as THREE from 'three';
import {
  TEXTURE_GENERATORS,
  hashSeed,
  sobelNormalFromHeight,
} from '../textures.js';

const FAMILY_SOURCE = Object.freeze({
  brick: 'brick',
  // Clinker stays in the existing wallAlt material bucket; only its atlas response differs.
  clinker: 'brick',
  render: 'render',
  weatherboard: 'weatherboard',
  slate: 'slate',
  corrugated: 'corrugation',
  tile: 'slate',
  painted_metal: 'painted_metal',
  timber: 'timber',
  joinery: 'painted_metal',
  foliage: 'foliage',
});

const FAMILY_ORDER = Object.freeze(Object.keys(FAMILY_SOURCE));
const COLUMNS = 4;
const ROWS = Math.ceil(FAMILY_ORDER.length / COLUMNS);
const GUTTER = 2;

// The 4 x 3 grid holds eleven families, so one cell is spare. It used to be left at zero —
// transparent black — which cost nothing while the atlas had no mip chain, because no region
// rect points at it. With a chain it costs something: the spare cell is the vertical neighbour
// of `painted_metal` and the horizontal neighbour of `foliage`, and at the deepest levels a
// bilinear tap at a tile seam can reach half a texel across a cell boundary. Black bleeding
// into cast iron is a defect that would have been very hard to trace. The cell carries a copy
// of the family above it instead.
const SPARE_CELL_FAMILY = 'painted_metal';

// Levels 0..2 — one family cell reduces 256 -> 128 -> 64. THREE, and the number is arithmetic
// rather than taste.
//
// Each region rect is inset by GUTTER = 2 texels of LEVEL 0, and that inset is a fixed distance
// in normalised UV, so at level L the sampled window starts only 2/2^L texels inside the cell.
// A bilinear tap at a wrapped tile seam reaches half a texel outward, so the weight it can steal
// from the NEIGHBOURING FAMILY is max(0, 0.5 - 2/2^L): zero at levels 0, 1 and 2, a quarter of a
// texel row at level 3, three eighths at level 4. Three levels is therefore the deepest chain
// these rects support without a family bleeding into its neighbour, and the ceiling moves only
// if GUTTER moves — which would change the region rects, and a region-rect change is what shipped
// r25 with every family sampling its neighbour.
//
// This was not reasoned into place, it was seen: at MIP_LEVELS = 5 the `?mode=atlas` sheet shot
// at 480x320 — roughly twelve texels to the pixel, deeper than any hero station — put a grey line
// down the middle of the foliage quad at its tile seam, which is the spare cell's painted-metal
// grey arriving through exactly that arithmetic.
//
// Three levels covers 4x minification and everything past it clamps to level 2 at 64 texels per
// tile, against the point sampling the whole atlas did before this round. The hero station needs
// about LOD 2.3 on the far hip of `bungalow-californian`, so this covers the plates that are
// graded. `texStorage2D` is allocated to exactly this many levels, so the texture is complete and
// the clamp is the driver's rather than a sample of an undefined level.
const MIP_LEVELS = 3;

// Anchors. `configureResidentialAtlasShader` replaces three's own <map_fragment> and
// <roughnessmap_fragment> with textureGrad bodies, and it runs BEFORE the wear pass because the
// wear pass wraps it as `previousCompile`. Without a marker left in its place, the wear pass's
// `.replace('#include <map_fragment>', …)` would match nothing and return the shader unchanged
// — silently, because a failed replace is not an error, which is exactly how §2.7's last two
// dead code paths came about.
const DD_MAP_SENTINEL = '// dd-residential-atlas-map-fragment';
const DD_ROUGHNESS_SENTINEL = '// dd-residential-atlas-roughnessmap-fragment';

/**
 * Insert after whichever anchor this shader actually carries, and SAY SO if it carries none.
 * A failed `String.replace` returns the subject unchanged and reports nothing, which is how
 * `configureResidentialShadowFloor` sat dead across a three.js chunk rename for thirty rounds
 * and how `applySharedWear` became a no-op nobody noticed. This runs inside `onBeforeCompile`,
 * so it must not throw — a throw there takes the frame, not the feature.
 */
function insertAfterAnchor(source, anchors, code, label) {
  for (const anchor of anchors) {
    if (source.includes(anchor)) return source.replace(anchor, `${anchor}\n${code}`);
  }
  console.error(`Residential atlas: no ${label} anchor in this shader — wear pass not applied`);
  return source;
}

// Geometry UVs are normalised per authored primitive, so repeating the family tile here is
// what keeps the authored module at board scale instead of stretching one 256 px tile over a
// whole elevation. Masonry uses the world-space projection below: its repeat is derived per
// surface as [surfaceWidth / 0.230, surfaceHeight / 0.076], so one stretcher is 230 mm and one
// course is 76 mm whatever the caller's UVs did. The family repeat for masonry is intentionally
// one tile in atlas-proof mode; it is not allowed to compete with the measured world module.
//
// Repeats were also texel-density budgets while the atlas had no mip chain, and that caveat is
// now out of date: `canvasTexture` builds a five-level chain by hand and the shader samples it
// with `textureGrad`, so a repeat that puts three or four texels under one screen pixel softens
// rather than sparkling. The numbers below are not raised on the strength of that, because they
// were also chosen as CADENCE — v320 could carry 7.0 only because the repeat was inert, and a
// hero roof plane at 7.0 measured roughly 3.6 texels per pixel with a rib count no Monopoly-Plus
// plate has. These hold the hero plate near 1.5 texels per pixel, which is the chunkier cadence
// the reference reads at, and the chain is what keeps that cadence honest at the far hip.
const FAMILY_REPEAT = Object.freeze({
  brick: [1.0, 1.0],
  clinker: [1.0, 1.0],
  render: [3.0, 3.0],
  weatherboard: [3.0, 1.35],
  slate: [2.2, 2.2],
  // Ten authored ribs per tile at four repeats is forty ribs of RELIEF across an authored roof
  // plane, under a modelled rib in federation.js that runs at about twenty. The albedo no longer
  // paints a rib at either pitch (see `decorate`), so what this repeat now sets is the pitch of
  // a shallow normal-map undulation and of the sheet lap, not a second visible corrugation.
  corrugated: [4.0, 1.8],
  tile: [3.0, 1.3],
  painted_metal: [2.0, 2.0],
  timber: [2.0, 2.0],
  joinery: [6.0, 1.0],
  foliage: [2.0, 2.0],
});

// Sobel strength per family, in height units per texel. The corrugated sheet used to sit at
// 0.65 — the weakest entry in the table, on the family whose entire identity is relief — while
// a smooth render wall sat at the 2.5 default and turned a two-texel stipple into normal noise.
// Relief now goes where the material has relief.
const NORMAL_STRENGTH = Object.freeze({
  brick: 2.2,
  clinker: 2.2,
  render: 1.0,
  weatherboard: 3.8,
  slate: 2.8,
  // Corrugated and tile both now have their rhythm modelled in federation.js, so these two
  // supply a shallow undulation under the geometry rather than a second relief on top of it.
  corrugated: 0.85,
  tile: 1.6,
  painted_metal: 1.6,
  timber: 2.0,
  joinery: 1.4,
  foliage: 2.5,
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

/** Remove generator grain from the render family while retaining broad deterministic drift. */
function softenRenderMaps(maps, size) {
  const channels = ['albedo', 'roughness', 'height'];
  const output = {};
  const taps = [-24, 0, 24];
  for (const channel of channels) {
    const source = maps[channel];
    const target = new Uint8ClampedArray(source.length);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let r = 0; let g = 0; let b = 0;
        for (const oy of taps) {
          for (const ox of taps) {
            const sx = ((x + ox) % size + size) % size;
            const sy = ((y + oy) % size + size) % size;
            const i = pixelIndex(size, sx, sy);
            r += source[i]; g += source[i + 1]; b += source[i + 2];
          }
        }
        const i = pixelIndex(size, x, y);
        target[i] = clampByte(r / 9);
        target[i + 1] = clampByte(g / 9);
        target[i + 2] = clampByte(b / 9);
        target[i + 3] = source[i + 3];
      }
    }
    output[channel] = target;
  }
  output.ao = maps.ao;
  return output;
}

// Masonry module authored into one family tile: eight stretchers across, sixteen courses
// down. `ddResidentialAtlasBrickProjection` maps that tile onto BRICK_MODULE_M of real wall,
// so one drawn brick is 230 x 76 mm however the caller authored its UVs.
const BRICKS_ACROSS = 8;
const COURSES_DOWN = 16;

function decorate(family, maps, size, seed) {
  const { albedo, roughness, height } = maps;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = pixelIndex(size, x, y);
      // There is deliberately no per-texel hash in scope any more. Every family's breakup is
      // now cell-scale or smooth — brick per brick, slate per slate, tile per tile, iron per
      // sheet block — because a texel-scale hash is grain, it is the first thing to alias when
      // a surface is minified, and this register is graded against a game render rather than a
      // photograph. `low` is a 16-texel block, which is the finest term left.
      const low = pixelHash(seed ^ 0x9e3779b9, Math.floor(x / 16), Math.floor(y / 16));
      const u = x / size;
      const v = y / size;

      if (family === 'brick' || family === 'clinker') {
        // Long-period block drift keeps a large flank from reading as one repeated salmon
        // stamp. The generator already owns the stretcher bond and recessed mortar.
        const block = 0.94 + low * 0.12;
        albedo[i] = clampByte(albedo[i] * block);
        albedo[i + 1] = clampByte(albedo[i + 1] * block);
        albedo[i + 2] = clampByte(albedo[i + 2] * block);
        roughness[i] = roughness[i + 1] = roughness[i + 2] = clampByte(roughness[i] + (low - 0.5) * 8);
        {
          const brickW = size / BRICKS_ACROSS;
          const brickH = size / COURSES_DOWN;
          const row = Math.floor(y / brickH);
          const offset = (row & 1) ? brickW * 0.5 : 0;
          const localX = (x + offset) % brickW;
          const localY = y % brickH;
          // One joint per shared edge, not one on each side of it. The previous test wrote a
          // joint on all four edges of every brick, so between two courses the mortar band was
          // doubled and 62% of the tile was mortar — which is why a flank read as an even
          // salmon fill with a faint grid rather than as brick. A 14 mm joint on the 76 mm bed
          // and on the 230 mm perpend is one band per edge and holds the same width in world
          // units either way.
          const bed = Math.max(1, Math.round(size / 88));
          const perp = Math.max(1, Math.round(size / 128));
          const inBed = localY < bed;
          const inPerp = localX < perp;
          if (inBed || inPerp) {
            // Warm grey mortar is a value lift, not a violet/blue stripe. The joint is raked
            // back, so its own upper edge sits in the shadow of the brick above it: that pair
            // of values is what stops a joint reading as a drawn line.
            const raked = (inBed && localY < bed * 0.5) || (inPerp && localX < perp * 0.5)
              ? 0.80 : 1.0;
            albedo[i] = clampByte(196 * raked);
            albedo[i + 1] = clampByte(188 * raked);
            albedo[i + 2] = clampByte(172 * raked);
            roughness[i] = roughness[i + 1] = roughness[i + 2] = 236;
            height[i] = height[i + 1] = height[i + 2] = 54;
          } else {
            const column = Math.floor((x + offset) / brickW);
            const cell = pixelHash(seed ^ 0x61c88647, column, row);
            const kiln = pixelHash(seed ^ 0x13c9a7f5, column, row);
            // Brick to brick value range. Clinker is a period-defining material precisely
            // because it is not uniform: it carries over-burnt headers that sit well below
            // the field, where common red brick keeps a tighter range.
            // Clinker is the authored +/-12% per-brick spread. Six over-fired bricks in forty
            // are handled by the deterministic kiln branch below, not by widening the normal
            // field until the base becomes visual noise.
            const spread = family === 'clinker' ? 0.24 : 0.19;
            const value = 1 + (cell - 0.5) * spread;
            const burnt = family === 'clinker' && kiln > 0.86 ? 0.74
              : family === 'clinker' && kiln < 0.07 ? 1.10 : 1.0;
            // One brick, one colour, with a light ramp down its own face. The generator's body
            // carries per-texel fbm and a salt-bloom band, and with the wrap fixed those became
            // pale dashes that sparkled under minification — texel-scale hash is grain, and
            // grain is the wrong answer for this register at any distance. Every reference
            // plate paints a brick as one confident value that differs from its neighbour.
            const lit = 1 + (0.5 - localY / brickH) * 0.055;
            const face = value * burnt * block * lit;
            // Keep the atlas albedo neutral. The material bucket owns the authored brick hue;
            // a red map multiplied by a red bucket was the source of the lane's neon orange
            // base and fence. The clinker colour itself is supplied by core.js as #8C4A38,
            // while this map contributes the course, perpend and deterministic kiln spread.
            albedo[i] = clampByte(255 * face);
            albedo[i + 1] = clampByte(255 * face);
            albedo[i + 2] = clampByte(255 * face);
            roughness[i] = roughness[i + 1] = roughness[i + 2]
              = clampByte(198 - (cell - 0.5) * 22);
            height[i] = height[i + 1] = height[i + 2] = clampByte(172 + (cell - 0.5) * 16);
          }
        }
      } else if (family === 'slate') {
        // Coursed slate. The generator supplies the bond and the joint; this pass supplies the
        // three things that make a slate roof read as slate rather than as a dark plane — a
        // hard head shadow under the course above, a lit lower arris on every slate, and real
        // value difference slate to slate and course to course.
        const SLATES_ACROSS = 6;
        const SLATES_DOWN = 10;
        const row = Math.floor(v * SLATES_DOWN);
        const sv = (v * SLATES_DOWN) % 1;
        const acrossRaw = u * SLATES_ACROSS + ((row & 1) ? 0.5 : 0);
        const su = acrossRaw % 1;
        const column = Math.floor(acrossRaw);
        const head = sv < 0.10 ? 1 - sv / 0.10 : 0;
        const arris = sv > 0.85 ? (sv - 0.85) / 0.15 : 0;
        const perpend = su < 0.040 ? 1 - su / 0.040 : 0;
        const cell = pixelHash(seed ^ 0x3ab512c9, column, row);
        const courseTone = pixelHash(seed ^ 0x76b1f0e5, 0, row);
        const tone = 1 - head * 0.30 + arris * 0.17 - perpend * 0.22
          + (cell - 0.5) * 0.17 + (courseTone - 0.5) * 0.09;
        // Lichen collects along the lower edge of a slate and in the vertical valley. Chosen
        // per SLATE rather than per texel: a texel-level threshold put a green fleck on every
        // slate at once and sparkled under minification instead of marking a few of them.
        const mossy = pixelHash(seed ^ 0x5f2ab19d, column, row);
        const lichen = mossy > 0.72
          ? Math.max(arris, perpend) * (mossy - 0.72) * 2.4 : 0;
        albedo[i] = clampByte(albedo[i] * tone + lichen * 34);
        albedo[i + 1] = clampByte(albedo[i + 1] * tone + lichen * 42);
        albedo[i + 2] = clampByte(albedo[i + 2] * tone - lichen * 12);
        roughness[i] = roughness[i + 1] = roughness[i + 2]
          = clampByte(roughness[i] + lichen * 28 + head * 16 - arris * 12);
        height[i] = height[i + 1] = height[i + 2]
          = clampByte(150 + arris * 52 - head * 96 - perpend * 70 - lichen * 12);
      } else if (family === 'corrugated') {
        // Galvanised iron. Ten ribs per family tile at the region's 4.0 u-repeat puts forty
        // ribs across an authored roof plane, and the amplitude here is deliberately quiet.
        //
        // THE RHYTHM IS NOT THIS MAP'S JOB ANY MORE. federation.js now authors the rib in
        // geometry (`addGableCorrugation` / `addHipCorrugation`), and two rhythms at slightly
        // different pitches on one surface is a moiré, so what the map contributes is a
        // sheet-scale breakup underneath the modelled rib rather than a competing corrugation:
        // a shallow cross-slope undulation, the end lap, a slow value drift and rust in the
        // troughs of one band of sheets. An amplitude that would carry the roof on its own
        // would beat against the geometry and would also be the thing that aliases.
        //
        // Authored for a normal scale of roughly 0.30–0.45. The height excursion is +/-38 of
        // 255 through a Sobel strength of 0.85, which is about 40% of what this family carried
        // at the start of the round; at `ROOF_RESPONSE.normal = 0.06` it contributes nothing
        // measurable, and that number can come up to 0.35 or so against this map without
        // returning to the salt-and-pepper the FEDERATION seat measured at 0.90.
        const RIBS = 10;
        const ribPhase = (u * RIBS) % 1;
        const theta = ribPhase * Math.PI * 2;
        const crest = Math.cos(theta);
        const sheetLapEdge = Math.min(v, 1 - v);
        const sheetLap = 1 - Math.min(1, sheetLapEdge / 0.030);
        // Every modulation on this family is smooth and periodic or sheet-scale. A texel-level
        // hash averages to noise the moment the roof is minified, and the far hip of a hipped
        // roof is always minified: the r1 plate came back with the sunlit plane reading well
        // and the far plane reading as sparkle, and the sparkle was the fixing/rust hash.
        const sheetBlock = pixelHash(seed ^ 0x2ad4b17f, Math.floor(x / 64), Math.floor(y / 64));
        const quietDrift = 0.988 + (sheetBlock - 0.5) * 0.026
          + Math.sin(v * Math.PI * 2 + seed * 0.000001) * 0.010;
        // THE RIB IS OUT OF THE ALBEDO. It was `1 - flank*0.085 + max(0,crest)*0.030 -
        // max(0,-crest)*0.018` — a ten-cycle value rhythm which, at this region's 4.0 u-repeat,
        // painted FORTY ribs across a roof plane while `federation.js` models about twenty in
        // geometry. Two rhythms at half each other's pitch on one surface is a beat, and the
        // measurement is in the r1 critic report: anisotropy 2.49 on the near plane of
        // `bungalow-californian` collapsing to 1.24 on the far hip, which is the rib rhythm
        // being replaced by isotropic noise. That noise is the roof speckle.
        //
        // The relief is NOT removed with it: `crest` still drives `height`, so the normal map
        // keeps the shallow undulation `ROOF_RESPONSE.normal` is calibrated against, and it now
        // filters properly because this atlas has a real mip chain. What leaves is the second
        // painted rhythm on top of the modelled one.
        // Rust sits in the troughs on one band of sheets, not on every fixing on the roof.
        const rustBand = Math.max(0, Math.sin(v * Math.PI * 3.0 + sheetBlock * 4.0) - 0.72) * 3.4;
        const rust = rustBand * Math.max(0, -crest) * 0.7;
        const base = 158 * quietDrift * (1 - sheetLap * 0.10);
        // Silver-grey, not the warm pewter the v320 map carried and not a dead cold grey.
        albedo[i] = clampByte(base + rust * 22);
        albedo[i + 1] = clampByte(base * 0.996 + rust * 9);
        albedo[i + 2] = clampByte(Math.min(base * 0.988 - rust * 6, albedo[i + 1] * 1.01));
        // Roughness is flat across the rib on purpose. Dropping it at the crest sharpened the
        // specular lobe exactly where the normal swings hardest, and a narrow moving glint on
        // a narrow feature is the one thing guaranteed to alias into a dotted line.
        roughness[i] = roughness[i + 1] = roughness[i + 2]
          = clampByte(196 + (sheetBlock - 0.5) * 14 + rust * 14);
        const corrugationHeight = 128 + crest * 38 - sheetLap * 14;
        height[i] = height[i + 1] = height[i + 2] = clampByte(corrugationHeight);
      } else if (family === 'tile') {
        // Marseille roll-and-pan terracotta. What names this roof at board altitude is the
        // course rhythm, and the course rhythm is a hard shadow line under every head lap with
        // the lit nose of the course below immediately under it. v320 authored that lap two
        // and a half percent of a course wide — under a pixel once the plate was framed — so
        // the villa's largest surface arrived as a smooth orange plane.
        // Seven courses of six tiles, not ten of eight. core.js overrides this family's repeat
        // to [3.0, 3.8] for `heritage-federation-villa`, so the authored course count is
        // multiplied by nearly four on the archetype whose largest surface this is; at ten it
        // put a course every 105 mm of slope, which is below the plate's own resolution.
        const COURSES = 7;
        const TILES = 6;
        const courseRow = Math.floor(v * COURSES);
        const cv = (v * COURSES) % 1;
        const tileColumn = Math.floor(u * TILES);
        const cu = (u * TILES) % 1;
        // The course lap is held well below the weight it would need to name the roof on its
        // own. `terracottaCourses` in federation.js emits modelled courses again — it had been
        // filtered out of the villa's bundle by name and was emitting nothing at all — so the
        // rhythm is geometry and the map's lap is a shading cue that sits under it. Tile-to-
        // tile and course-to-course value, the roll and the perpend tick are the parts that do
        // not compete with a modelled course, so those keep their weight.
        const lap = cv < 0.115 ? 1 : cv < 0.155 ? 1 - (cv - 0.115) / 0.040 : 0;
        const nose = cv >= 0.155 && cv < 0.30 ? 1 - (cv - 0.155) / 0.145 : 0;
        // The roll runs down one edge of each tile; the rest of the tile is the shallow pan.
        const roll = Math.exp(-Math.pow((cu - 0.16) / 0.155, 2));
        const perpend = cu < 0.035 ? 1 - cu / 0.035 : 0;
        const cell = pixelHash(seed ^ 0x51ab3f2d, tileColumn, courseRow);
        const courseTone = pixelHash(seed ^ 0x2f9d1b17, 0, courseRow);
        // THE ALBEDO NO LONGER PAINTS A COURSE, AND THIS IS THE OTHER HALF OF THE TWO-RHYTHM
        // FINDING. `federation.js` now models terracotta courses on both tile archetypes, so a
        // painted lap on top of them is a second rhythm at a different pitch. On
        // `bungalow-brighton` the map's own cell is enormous — its roof takes a [3.0, 1.3]
        // repeat, which is six tiles by seven courses times three by one point three, so the
        // per-tile and per-course value blocks land at roughly 50 x 40 px on the hero plate and
        // paint a chequerboard of flat rectangles across the modelled courses. That is the
        // "diagonal stripe texture that reads as corrugated cardboard" a blind critic named.
        //
        // The lap is not deleted — a lane outside this seat's scope may put a tile roof on an
        // archetype with no modelled course, and deleting the feature to remove the beat is the
        // mistake §6 rule 4 was written after. It is held to a third of its weight in albedo
        // while keeping its FULL weight in height and roughness, so the relief and the sheen
        // break still describe a lapped course and the mip chain can now filter them. The roll
        // and the perpend keep their weight because they run across the course rather than with
        // it and cannot beat against it.
        const pan = 1 - lap * 0.045 + nose * 0.020 + roll * 0.085 - perpend * 0.055
          + (cell - 0.5) * 0.032 + (courseTone - 0.5) * 0.022;
        // The palette supplies terracotta hue. Keep the shared map near-neutral so the
        // colour is not multiplied twice into the neon red seen in fed-atlas01.
        albedo[i] = clampByte(216 * pan + (low - 0.5) * 5);
        albedo[i + 1] = clampByte(205 * pan + (low - 0.5) * 4);
        albedo[i + 2] = clampByte(193 * pan + (low - 0.5) * 4);
        roughness[i] = roughness[i + 1] = roughness[i + 2]
          = clampByte(196 + low * 28 + lap * 22 - roll * 14);
        const tileHeight = 108 + roll * 78 - lap * 44 - perpend * 16 + nose * 8;
        height[i] = height[i + 1] = height[i + 2] = clampByte(tileHeight);
      } else if (family === 'painted_metal') {
        // Neutral near-black/paint response. Material colour supplies the chosen heritage
        // paint; this map only supplies sheen breakup and small worn-value changes.
        // The breakup is brush-scale, not per-texel: a texel hash here is photographic grain
        // on cast iron, and grain is the wrong answer for this register at any distance.
        const brush = 0.955 + 0.030 * Math.sin(v * Math.PI * 9 + Math.sin(u * 5.1) * 1.3)
          + 0.055 * low;
        albedo[i] = albedo[i + 1] = albedo[i + 2] = clampByte(186 * brush);
        roughness[i] = roughness[i + 1] = roughness[i + 2] = clampByte(94 + low * 46);
        height[i] = height[i + 1] = height[i + 2] = clampByte(126 + (low - 0.5) * 16);
      } else if (family === 'foliage') {
        // Leaf-scale colour breakup prevents the existing low-poly planting from becoming a
        // single green sphere under the atlas map.
        const leaf = pixelHash(seed ^ 0xa341316c, Math.floor(x / 5), Math.floor(y / 5));
        albedo[i] = clampByte(albedo[i] * (0.82 + leaf * 0.32));
        albedo[i + 1] = clampByte(albedo[i + 1] * (0.80 + leaf * 0.36));
        albedo[i + 2] = clampByte(albedo[i + 2] * (0.84 + leaf * 0.28));
        roughness[i] = roughness[i + 1] = roughness[i + 2] = clampByte(224 - leaf * 22);
      } else if (family === 'weatherboard') {
        // Measured 137 mm exposed course, laid the way a board actually sits: the lower arris
        // of each board stands proud, catches the key, and throws a narrow hard shadow across
        // the top of the board below it. That shadow-over-highlight pair is the whole of what
        // makes weatherboard read as weatherboard from across a street, and v320 had them the
        // wrong way round — a wide flat dark band with the highlight buried inside it, so the
        // wall read as ruled lines on a flat plane.
        const BOARDS = 18;
        const boardRow = Math.floor(v * BOARDS);
        const localBoard = (v * BOARDS) % 1;
        const boardDrift = 0.985 + pixelHash(seed ^ 0x77ab31d1, 0, boardRow) * 0.030;
        // Hard-edged, narrow, deep. A soft ramp of a shadow averages away at board altitude
        // and leaves the ruled-line read the reference does not have.
        const shadow = localBoard < 0.055 ? 1
          : localBoard < 0.105 ? 1 - (localBoard - 0.055) / 0.050 : 0;
        const arris = localBoard > 0.90 ? (localBoard - 0.90) / 0.10 : 0;
        const face = 1.015 - localBoard * 0.045;
        const longitudinalGrain = 0.995 + Math.sin(u * Math.PI * 14) * 0.005;
        const ramp = face - shadow * 0.42 + arris * 0.12;
        const boardValue = 223 * boardDrift * ramp * longitudinalGrain;
        albedo[i] = albedo[i + 1] = albedo[i + 2] = clampByte(boardValue);
        // Height climbs across the face to the proud lower edge and then steps hard back at
        // the lap, which is what the Sobel pass turns into a real shadow-side normal.
        const boardHeight = localBoard < 0.085
          ? 96 + (localBoard / 0.085) * 46
          : 142 + ((localBoard - 0.085) / 0.915) * 78;
        height[i] = height[i + 1] = height[i + 2] = clampByte(boardHeight);
        roughness[i] = roughness[i + 1] = roughness[i + 2]
          = clampByte(196 + shadow * 20 - arris * 10);
      } else if (family === 'render') {
        // Smooth-set render, and only smooth-set render. The terrace's stucco and the
        // bungalows' roughcast used to share this one region and one smooth response, so two
        // materials that should look nothing alike looked identical. The aggregate now lives
        // in the wear program, where it can be sized in metres and switched per archetype;
        // what is left here is the trowel-float story of a smooth-set wall.
        //
        // The 220-cycle stipple this replaced had a two-texel period, which is grain — it
        // aliased into noise at every distance and gave the normal pass nothing to shade.
        const patch = 0.97 + low * 0.06 + Math.sin(u * 5.3 + v * 2.7) * 0.022;
        const float = 0.96 + Math.sin(u * 9.1 + v * 4.3) * 0.012
          + Math.sin(v * 12.7 - u * 3.1) * 0.008;
        const wash = patch * float;
        albedo[i] = clampByte(albedo[i] * wash);
        albedo[i + 1] = clampByte(albedo[i + 1] * wash);
        albedo[i + 2] = clampByte(albedo[i + 2] * wash);
        const renderHeight = 128 + Math.sin(u * Math.PI * 13 + Math.sin(v * 9.3) * 1.2) * 7
          + (low - 0.5) * 10;
        height[i] = height[i + 1] = height[i + 2] = clampByte(renderHeight);
      } else if (family === 'joinery') {
        // Painted joinery has no isotropic aggregate. Material colour supplies the paint;
        // this family contributes only a quiet two-percent directional grain.
        const streak = 0.98 + (0.5 + 0.5 * Math.sin(v * Math.PI * 32)) * 0.02;
        albedo[i] = albedo[i + 1] = albedo[i + 2] = clampByte(224 * streak);
        roughness[i] = roughness[i + 1] = roughness[i + 2] = clampByte(176 + Math.sin(v * Math.PI * 32) * 4);
        height[i] = height[i + 1] = height[i + 2] = clampByte(128 + Math.sin(v * Math.PI * 32) * 3);
      } else if (family === 'timber') {
        // Joinery gets a warmer, directional grain without changing its authored colour tint.
        // The breakup term is board-scale, not texel-scale: a per-texel hash on a pergola beam
        // or a gate rail is grain, and it sparkles as soon as the part is small in frame.
        const grain = 0.95 + Math.sin(u * 97 + v * 4) * 0.035 + (low - 0.5) * 0.035;
        albedo[i] = clampByte(albedo[i] * grain);
        albedo[i + 1] = clampByte(albedo[i + 1] * grain);
        albedo[i + 2] = clampByte(albedo[i + 2] * grain);
      }
    }
  }
}

/* ───────────────────────────── the hand-built mip chain ──────────────────────────────
 *
 * sRGB decode / encode tables. The albedo atlas is an sRGB texture, and averaging four sRGB
 * bytes is not averaging four colours: a black-and-white pair averages to 128 in sRGB and to
 * 188 in light. Reducing the albedo in the encoded space would therefore darken every family
 * as it minifies, and the one measurement this programme takes most often is the L* of a roof
 * — a roof that loses ten points of lightness as the camera pulls back would be a new defect
 * introduced by the fix for an old one. Roughness and normal carry no transfer function and
 * are reduced raw.
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
 * One 2x2 box reduction of a square tile.
 *
 * A 2x2 block never straddles a cell boundary while the cell size is even, so reducing the
 * family's own tile is exactly what a wrap-aware reduction of that tile would produce — the
 * seam correctness the tile needs is a property of the kernel width, not of the atlas layout.
 * Normals are reduced without renormalising on purpose: two opposed slopes averaging toward
 * (0.5, 0.5) is relief retiring itself as the surface minifies, which is the behaviour the
 * corrugated and tile families want and the one they could not have while there was no chain.
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
      target[o + 3] = Math.round((source[a + 3] + source[b + 3]
        + source[c + 3] + source[d + 3]) * 0.25);
    }
  }
  return target;
}

/**
 * The two-pixel gutter, unchanged in behaviour at level 0 so the region rects stay valid.
 * r25 shipped this file with every family sampling its neighbour after a region-rect change,
 * so the rects and the inset they assume are left exactly where they were and the chain is
 * built to fit them rather than the other way round.
 */
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

/** Lay one level's family tiles into the 4 x 3 grid and re-gutter every cell. */
function assembleLevel(tiles, cell) {
  const atlasWidth = COLUMNS * cell;
  const atlasHeight = ROWS * cell;
  const target = new Uint8ClampedArray(atlasWidth * atlasHeight * 4);
  const gutter = Math.max(1, Math.min(GUTTER, Math.floor(cell / 8)));
  for (let index = 0; index < COLUMNS * ROWS; index += 1) {
    const family = FAMILY_ORDER[index] ?? SPARE_CELL_FAMILY;
    const tile = tiles[family];
    const originX = (index % COLUMNS) * cell;
    const originY = Math.floor(index / COLUMNS) * cell;
    for (let y = 0; y < cell; y += 1) {
      const from = y * cell * 4;
      target.set(tile.subarray(from, from + cell * 4),
        ((originY + y) * atlasWidth + originX) * 4);
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
 * `generateMipmaps` is false and `mipmaps` carries every level, so three.js allocates the
 * texture with `texStorage2D(levels = mipmaps.length)` and uploads each one; the texture is
 * complete at exactly MIP_LEVELS levels and anything more minified clamps to the last rather
 * than sampling an undefined level. This is also why the v320 note's `LinearMipmapLinearFilter`
 * experiment came back byte-for-byte identical — there was no chain to select from, and the
 * NPOT 1024x768 image had no automatic one either.
 */
function atlasTexture(levels, colorSpace) {
  const canvases = levels.map((level) => canvasFromRGBA(level.data, level.width, level.height));
  const texture = new THREE.CanvasTexture(canvases[0]);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // THE CHAIN, AND WHY IT IS BUILT BY HAND RATHER THAN FLIPPED ON.
  //
  // v320 shipped `minFilter = LinearFilter` on the belief that trilinear would pull a
  // neighbouring family's cell into a region. That premise was wrong and r1 said so: cells sit
  // at multiples of 256 in a 1024 px image, so no box-filtered level averages across a cell
  // boundary until a cell is one texel.
  //
  // But r1 also measured that simply flipping the filter buys nothing —
  // `LinearMipmapLinearFilter` with anisotropy 16 on `bungalow-californian--detail` returned a
  // far plane that was byte-for-byte identical. Two causes, and both are answered here rather
  // than argued about. (a) The atlas is 1024x768 and 768 is not a power of two, so nothing
  // could be relied on to build the chain; it is now built explicitly, level by level, and
  // uploaded through `texture.mipmaps`. (b) The wrap happens per fragment, and the screen-space
  // derivative of a WRAPPED coordinate is meaningless on any quad straddling a tile seam —
  // which on a minified surface is most of them — so the hardware's own LOD selection was
  // unusable exactly where it was needed. `configureResidentialAtlasShader` now samples with
  // `textureGrad` and takes the gradients from the UNWRAPPED tile coordinate.
  //
  // The two halves only work together. The flag without the gradients is what r1 captured and
  // it changed nothing; the gradients without a chain would select a level that does not exist.
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.mipmaps = canvases;
  // Left at 8, which is what this file already asked for. Anisotropy did nothing before because
  // there was no chain to sample; now that there is one, 8:1 covers a roof plane well past the
  // grazing angle the hero station reaches, and holding the number still keeps the chain and
  // the gradients the only two things that changed this round.
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  texture.userData.procedural = true;
  texture.userData.residentialAtlas = true;
  texture.userData.residentialAtlasLevels = levels.map((level) => [level.width, level.height]);
  return texture;
}

function makeAtlas(size) {
  const atlasWidth = COLUMNS * size;
  const atlasHeight = ROWS * size;
  const regions = {};
  // Per-family tiles, kept whole rather than copied straight into the grid, because every mip
  // level is reduced from the family's own tile. Reducing from the assembled grid would work
  // for the same reason (a 2x2 block cannot straddle a cell boundary), but reducing from the
  // tile keeps the gutter out of the chain instead of propagating it down every level.
  const tiles = { albedo: {}, roughness: {}, normal: {} };

  for (let index = 0; index < FAMILY_ORDER.length; index += 1) {
    const family = FAMILY_ORDER[index];
    const sourceId = FAMILY_SOURCE[family];
    const source = TEXTURE_GENERATORS[sourceId];
    if (!source) throw new Error(`Missing residential atlas source: ${sourceId}`);
    const generatedMaps = source(size, hashSeed(`v320-residential-atlas:${family}:${size}`));
    const sourceMaps = family === 'render' ? softenRenderMaps(generatedMaps, size) : generatedMaps;
    decorate(family, sourceMaps, size, hashSeed(`v320-residential-detail:${family}:${size}`));
    tiles.albedo[family] = sourceMaps.albedo;
    tiles.roughness[family] = sourceMaps.roughness;
    tiles.normal[family] = sobelNormalFromHeight(sourceMaps.height, size,
      NORMAL_STRENGTH[family] ?? 2.5);

    const originX = (index % COLUMNS) * size;
    const originY = Math.floor(index / COLUMNS) * size;
    // CanvasTexture keeps flipY=true. Convert the authored top-left row to the WebGL
    // bottom-left origin before exposing the rect; otherwise row 0 samples row 1 (slate →
    // foliage was the visible r25 failure). These rects are unchanged this round — the chain
    // was built to fit them rather than the other way round.
    regions[family] = Object.freeze({
      offset: [(originX + GUTTER) / atlasWidth,
        (atlasHeight - originY - size + GUTTER) / atlasHeight],
      scale: [(size - GUTTER * 2) / atlasWidth, (size - GUTTER * 2) / atlasHeight],
      repeat: FAMILY_REPEAT[family] ?? [2.0, 2.0],
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

export class ResidentialTextureAtlas {
  constructor({ quality = 'high' } = {}) {
    // A 256 px family tile is enough for the board-scale miniature, while the three shared
    // 1024×512 maps stay comfortably below the authorised ~66 MB headroom.
    this.tileSize = quality === 'low' ? 128 : quality === 'medium' ? 192 : 256;
    const atlas = makeAtlas(this.tileSize);
    Object.assign(this, atlas);
    this.id = `residential-atlas-v320-${quality}`;
    this.disposed = false;
  }

  textureBytes() {
    // Measured off the chain that is actually uploaded rather than multiplied by a nominal
    // 1.34. Five levels of a 4:3 grid sum to 1.332 of the base, so the number moves by less
    // than a tenth of a percent and is now a reading instead of an estimate.
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
 * Attach one atlas to a MaterialLibrary. The library owns it, so a board teardown releases
 * the three GPU textures with the rest of its materials. This function is residential-only.
 */
export function getResidentialTextureAtlas(materials) {
  if (!materials || typeof materials.registerTexturePack !== 'function') {
    throw new TypeError('Residential texture atlas requires a MaterialLibrary');
  }
  if (materials.userData?.residentialAtlas) return materials.userData.residentialAtlas;
  const atlas = new ResidentialTextureAtlas({ quality: materials.quality });
  materials.userData ??= {};
  materials.userData.residentialAtlas = atlas;
  materials.registerTexturePack(atlas);
  return atlas;
}

/** Apply one atlas region to a residential material without cloning the texture. */
export function applyResidentialAtlas(material, family, atlas) {
  const region = atlas?.regions?.[family];
  if (!material || !region) return false;
  material.map = atlas.albedo;
  material.roughnessMap = atlas.roughness;
  material.normalMap = atlas.normal;
  material.aoMap = null;
  material.userData.residentialAtlas = { family, atlas: atlas.id };
  material.needsUpdate = true;
  return true;
}

/** Shader hook for the one shared atlas texture. All map channels use the same region UV. */
export function configureResidentialAtlasShader(
  material, atlas, family, repeatOverride = null, worldSpaceBrick = false,
) {
  const region = atlas?.regions?.[family];
  if (!material || !region) return;
  const previousCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previousCompile) previousCompile(shader, renderer);
    shader.uniforms.ddResidentialAtlasOffset = { value: new THREE.Vector2(...region.offset) };
    shader.uniforms.ddResidentialAtlasScale = { value: new THREE.Vector2(...region.scale) };
    const repeat = Array.isArray(repeatOverride) ? repeatOverride
      : Array.isArray(region.repeat) ? region.repeat : [region.repeat ?? 2.0, region.repeat ?? 2.0];
    shader.uniforms.ddResidentialAtlasRepeat = { value: new THREE.Vector2(...repeat) };
    shader.uniforms.ddResidentialAtlasWorldBrick = {
      value: worldSpaceBrick && (family === 'brick' || family === 'clinker') ? 1 : 0,
    };
    // Deliberately not named ddResidentialAtlasOffset/Scale: core.js declares those two names
    // in the FRAGMENT shader for the two archetypes that carry the legacy roof-colour
    // compensation, and a second declaration of the same name is a compile error there.
    shader.uniforms.ddResidentialAtlasFragOffset = {
      value: new THREE.Vector2(...region.offset),
    };
    shader.uniforms.ddResidentialAtlasFragScale = {
      value: new THREE.Vector2(...region.scale),
    };
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
uniform vec2 ddResidentialAtlasRepeat;
uniform float ddResidentialAtlasWorldBrick;
varying vec2 ddResidentialAtlasTile;
// One family tile carries ${BRICKS_ACROSS} stretchers and ${COURSES_DOWN} courses, so the tile
// spans this much real wall and one drawn brick lands at 230 x 76 mm. The previous divisor was
// the single-brick module, which crushed the tile's whole ${BRICKS_ACROSS}x${COURSES_DOWN} bond
// into one brick: 29 mm of drawn brick per brick, under two pixels on a hero flank, which is
// the "coursing so low in contrast it reads as a texture on a fill" the r1 brief opens with.
// The bond's own course stagger is authored into the tile, so no second shader-side stagger is
// applied over it. Sixteen courses per tile is even, so the stagger stays in phase across a
// vertical tile boundary.
const vec2 ddBrickModule = vec2(${(BRICKS_ACROSS * 0.230).toFixed(4)}, ${(COURSES_DOWN * 0.076).toFixed(4)});
// Read from the attributes rather than from a varying: three.js runs <uv_vertex> before
// <begin_vertex>, so anything assigned alongside \`transformed\` is not yet written when the
// UV is built here.
vec2 ddResidentialAtlasBrickProjection() {
  vec3 ddAbsNormal = abs(normalize(normal + vec3(0.0, 1e-5, 0.0)));
  vec2 ddPlane = ddAbsNormal.y > 0.55
    ? position.xz
    : ddAbsNormal.x > ddAbsNormal.z
      ? position.zy : position.xy;
  return ddPlane / ddBrickModule;
}
// The UNWRAPPED tile coordinate. Both branches are affine in the vertex attributes, so
// interpolating this across a triangle is exact and the wrap can be taken per fragment.
vec2 ddResidentialAtlasTileCoord() {
  vec2 ddAuthored = uv * ddResidentialAtlasRepeat;
  vec2 ddWorldBrick = ddResidentialAtlasBrickProjection();
  return mix(ddAuthored, ddWorldBrick, ddResidentialAtlasWorldBrick);
}`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
	ddResidentialAtlasTile = ddResidentialAtlasTileCoord();`,
    );

    // The wrap has to happen per FRAGMENT. It used to happen per vertex, and residential
    // primitives are `BoxGeometry(w, h, d)` — one quad per face, four vertices — so `fract`
    // was evaluated at the corners and then linearly interpolated between them. A repeat of
    // 4.0 gave fract(0)=0 and fract(4)=0, which is a constant: the family tile was not tiled
    // four times across the face, it was thrown away and the face sampled a single column of
    // the region. Every repeat in FAMILY_REPEAT was inert, and every whole-number repeat
    // rendered as a flat fill. That is the mechanism behind "the two largest surfaces in
    // every plate answer light with nothing", and `?mode=atlas` shows it exactly: on the
    // pre-fix sheet every family whose repeat was a whole number — slate 4.0, corrugated 7.0,
    // timber 2.0, joinery 6.0, foliage 2.0, painted_metal 2.0 — rendered as flat colour, while
    // weatherboard at 1.35 showed fract(1.35) x 18 = 6 boards and tile at 1.3 showed
    // fract(1.3) x 10 = 3 courses. Both counts are exact, which is what identified the cause.
    //
    // The redirect is a #define placed after <uv_pars_fragment>, so the varyings three.js
    // declares in that chunk are untouched and every later use of them resolves to the wrapped
    // region UV instead.
    //
    // THE GRADIENTS ARE THE OTHER HALF OF THE MIP FIX, and they are the half that cannot be
    // done with a #define. `fract()` steps from 1 to 0 across a tile seam, so `dFdx` of the
    // sampled UV at that quad is roughly the whole region rather than one texel — the hardware
    // reads that as extreme minification and takes the coarsest level it has. On a surface
    // carrying several tiles that happens at every seam, which is why r1 measured a filter flip
    // as buying nothing. `ddResidentialAtlasTile` is the UNWRAPPED coordinate and is affine in
    // the vertex attributes, so its derivative is exact and continuous everywhere, seam or not;
    // scaled by the region size it is exactly the footprint the sampler needs.
    //
    // `vNormalMapUv` is deliberately NOT the wrapped UV. Its only remaining reader is
    // `getTangentFrame()` in <normal_fragment_begin>, which differentiates the coordinate to
    // build the tangent basis — hand it a wrapped coordinate and every seam quad gets a
    // garbage frame and a normal pointing somewhere arbitrary, which is its own speckle source.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <uv_pars_fragment>',
      `#include <uv_pars_fragment>
uniform vec2 ddResidentialAtlasFragOffset;
uniform vec2 ddResidentialAtlasFragScale;
varying vec2 ddResidentialAtlasTile;
vec2 ddResidentialAtlasSampleUv() {
  return ddResidentialAtlasFragOffset + fract(ddResidentialAtlasTile) * ddResidentialAtlasFragScale;
}
vec4 ddResidentialAtlasSample( sampler2D ddAtlasMap ) {
  return textureGrad( ddAtlasMap, ddResidentialAtlasSampleUv(),
    dFdx( ddResidentialAtlasTile ) * ddResidentialAtlasFragScale,
    dFdy( ddResidentialAtlasTile ) * ddResidentialAtlasFragScale );
}
#define vMapUv ddResidentialAtlasSampleUv()
#define vRoughnessMapUv ddResidentialAtlasSampleUv()
#define vNormalMapUv ( ddResidentialAtlasTile * ddResidentialAtlasFragScale )`,
    );

    // Three chunk bodies, rewritten so the three atlas maps are sampled with those gradients.
    // Only the sampler call changes; everything else is three r185's own chunk text, kept
    // verbatim including the branches these materials do not currently take, so a material that
    // later turns on object-space or packed normals still behaves. A MeshBasicMaterial — the
    // `?mode=atlas` proof quad — has no roughness or normal chunk and simply does not match.
    //
    // Each replacement leaves a sentinel behind because `configureResidentialWearShader` below
    // anchors its own patch on `#include <map_fragment>`, and that string no longer exists once
    // this runs. Losing that anchor silently would drop the whole wear pass, which is the
    // failure mode §2.7 has already been through twice.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
	vec4 sampledDiffuseColor = ddResidentialAtlasSample( map );
	diffuseColor *= sampledDiffuseColor;
#endif
${DD_MAP_SENTINEL}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = ddResidentialAtlasSample( roughnessMap );
	roughnessFactor *= texelRoughness.g;
#endif
${DD_ROUGHNESS_SENTINEL}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = ddResidentialAtlasSample( normalMap ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = ddResidentialAtlasSample( normalMap ).xyz * 2.0 - 1.0;
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
  // The source is identical for every region; the offset/scale are uniforms. One cache key
  // keeps the atlas from paying a program per surface family.
  material.customProgramCacheKey = () => 'residential-atlas-v320';
  material.userData.residentialAtlasFamily = family;
  material.needsUpdate = true;
}

/**
 * Add the residential wear story to the shared material program.
 *
 * Wear belongs in the surface response, not in a second skin of coplanar geometry. The
 * position varying is the authored building-space position (the residential primitives bake
 * their measured coordinates into the geometry), so these masks remain tied to the building
 * datum while the atlas itself can stay one shared texture and one draw bucket.
 *
 * `profile` is made from the residential `unitFrom` path by core.js. It is deliberately a
 * handful of uniforms rather than per-pixel noise: long-period drift survives the plate
 * downsample and the same seed always produces the same house.
 */
export function configureResidentialWearShader(material, family, profile = {}) {
  if (!material) return;

  const previousCompile = material.onBeforeCompile;
  const isWall = family === 'brick' || family === 'render'
    || family === 'weatherboard' || family === 'concrete';
  const isRoof = family === 'slate' || family === 'corrugated' || family === 'tile';
  const isMasonry = family === 'brick' || family === 'render' || family === 'concrete';
  const isSlate = family === 'slate' || family === 'tile';
  // Roughcast is render thrown over the wall with the aggregate left standing. It belongs to
  // the two bungalows and to the villa's bay, and it is the reason the terrace's smooth-set
  // stucco and a bungalow wall must not share one response. It rides a uniform rather than a
  // second atlas region because every residential atlas material compiles to one program: a
  // source-level branch here would be shared by whichever material happened to compile first.
  const isRoughcast = family === 'render' && (
    profile.archetypeId === 'bungalow-californian'
    || profile.archetypeId === 'bungalow-brighton'
    || profile.archetypeId === 'heritage-federation-villa');
  // V3.40 — the Brighton roof pin is gone.
  //
  // This forced `roughness = 0.72` and `specularIntensity = 0.25` on any roof family whenever the
  // archetype was `bungalow-brighton`, overriding whatever the palette had authored. It was
  // written for the stashed Lane B, whose Brighton roof was authored somewhere this file
  // disagreed with.
  //
  // The V3.40 SURFACES seat authored Brighton's terracotta at 0.90 / 0.30, deliberately identical
  // to the villa's so the two tile roofs answer light the same way, and reported that this pin
  // silently won. A second colour-and-response authority inside a shared shader is exactly the
  // class of fault the houses lane was built to escape, so the pin is removed rather than tuned:
  // `house-surfaces.js` is now the only thing that decides how a Brighton roof responds.
  //
  // Safe for the other lanes: both lines were keyed on an archetype id that only the houses lane
  // owns. The terrace, walk-up and contemporary lanes never reached them.
  const forcedRoofRoughness = null;
  const forcedRoofSpecular = null;

  // Two downpipe stations per building, taken off the same deterministic seed the rest of the
  // profile comes from. They are stations rather than a periodic function on purpose: §2.7's
  // whole complaint about this file is that a sine of x puts the same mark at even intervals
  // across every elevation, which is the definition of a filter. Two numbers put two downpipes
  // somewhere, and the eye reads two marks in unequal places as a building that has weathered.
  const seed = profile.seed ?? 0.5;
  const dropA = -3.15 + seed * 1.30;
  const dropB = 2.05 + ((seed * 7.13) % 1) * 1.40;
  // The gutter line, metres above the lot datum. Gutter-joint rust and flashing moss both hang
  // off it, so a wrong number puts two marks in the wrong band on every elevation.
  //
  // Only archetypes this file has a measured number for get one; everything else takes 0 and the
  // head-band marks switch themselves off rather than land at a guessed height on a lane this
  // file does not own.
  //
  // V3.40 — `profile.eavesY` was added, and the four constants were re-measured.
  //
  // The constants were 2.86 / 2.78 / 3.34 / 2.94, taken off the stashed Lane B's envelope. V3.40's
  // `ENVELOPE` puts `floorY + wallH` at 3.47 / 3.53 / 3.95 / 3.22, so every one of them was
  // 0.28–0.75 m low and the SURFACES seat found it — correctly reporting rather than routing
  // around it, since its only alternative was to pass an unknown id and switch both marks off.
  //
  // Two changes rather than one, because re-measuring alone would leave the same trap for the
  // next envelope change: a caller may now pass its own `eavesY` and the constants are the
  // fallback. The houses lane knows `floorY + wallH` exactly and should pass it.
  const head = profile.eavesY != null ? profile.eavesY
    : profile.archetypeId === 'bungalow-californian' ? 3.47
      : profile.archetypeId === 'bungalow-brighton' ? 3.53
        : profile.archetypeId === 'heritage-federation-villa' ? 3.95
          : profile.archetypeId === 'cottage-federation' ? 3.22 : 0.0;

  material.onBeforeCompile = (shader, renderer) => {
    if (previousCompile) previousCompile(shader, renderer);
    if (forcedRoofRoughness !== null && shader.uniforms.roughness) {
      shader.uniforms.roughness.value = forcedRoofRoughness;
    }
    if (forcedRoofSpecular !== null && shader.uniforms.specularIntensity) {
      shader.uniforms.specularIntensity.value = forcedRoofSpecular;
    }
    const target = profile.targetColor ? new THREE.Color(profile.targetColor) : null;
    const authored = material.color ? material.color.clone() : new THREE.Color('#ffffff');
    shader.uniforms.ddResidentialTargetRatio = { value: target ? new THREE.Vector3(
      target.r / Math.max(authored.r, 1e-4),
      target.g / Math.max(authored.g, 1e-4),
      target.b / Math.max(authored.b, 1e-4),
    ) : new THREE.Vector3(1, 1, 1) };
    shader.uniforms.ddResidentialWearRoughcast = { value: isRoughcast ? 1 : 0 };
    shader.uniforms.ddResidentialWearSeed = { value: profile.seed ?? 0.5 };
    shader.uniforms.ddResidentialWearSoil = { value: profile.soil ?? 1.0 };
    shader.uniforms.ddResidentialWearStorey = { value: profile.storey ?? 3.2 };
    shader.uniforms.ddResidentialWearPatchX = { value: profile.patchX ?? 0.0 };
    shader.uniforms.ddResidentialWearPatchY = { value: profile.patchY ?? 1.15 };
    shader.uniforms.ddResidentialWearPatchWidth = { value: profile.patchWidth ?? 1.2 };
    shader.uniforms.ddResidentialWearMode = {
      value: profile.archetypeId === 'bungalow-californian' ? 1
        : profile.archetypeId === 'bungalow-brighton' ? 2
          : profile.archetypeId === 'heritage-federation-villa' ? 3
            : profile.archetypeId === 'cottage-federation' ? 4 : 0,
    };
    shader.uniforms.ddResidentialWearWall = { value: isWall ? 1 : 0 };
    shader.uniforms.ddResidentialWearMasonry = { value: isMasonry ? 1 : 0 };
    shader.uniforms.ddResidentialWearRoof = { value: isRoof ? 1 : 0 };
    shader.uniforms.ddResidentialWearSlate = { value: isSlate ? 1 : 0 };
    shader.uniforms.ddResidentialWearDropA = { value: dropA };
    shader.uniforms.ddResidentialWearDropB = { value: dropB };
    shader.uniforms.ddResidentialWearHead = { value: head };

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 ddResidentialPosition;\nvarying vec3 ddResidentialNormal;',
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
	ddResidentialPosition = transformed;
	ddResidentialNormal = objectNormal;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 ddResidentialPosition;
varying vec3 ddResidentialNormal;
uniform float ddResidentialWearSeed;
uniform float ddResidentialWearSoil;
uniform float ddResidentialWearStorey;
uniform float ddResidentialWearPatchX;
uniform float ddResidentialWearPatchY;
uniform float ddResidentialWearPatchWidth;
uniform int ddResidentialWearMode;
uniform float ddResidentialWearWall;
uniform float ddResidentialWearMasonry;
uniform float ddResidentialWearRoof;
uniform float ddResidentialWearSlate;
uniform float ddResidentialWearRoughcast;
uniform float ddResidentialWearDropA;
uniform float ddResidentialWearDropB;
uniform float ddResidentialWearHead;
uniform vec3 ddResidentialTargetRatio;

/** One deterministic unit value per integer cell. No clock, no per-frame state. */
vec2 ddResidentialCellHash(vec2 cell) {
  vec2 ddH = fract(cell * vec2(0.1031, 0.11369));
  ddH += dot(ddH, ddH.yx + 33.33);
  return fract(vec2((ddH.x + ddH.y) * (ddH.x + 19.19 * ddH.y),
    (ddH.x + ddH.y) * 37.719));
}`,
    );

    shader.fragmentShader = insertAfterAnchor(shader.fragmentShader,
      [DD_MAP_SENTINEL, '#include <map_fragment>'],
      `
  diffuseColor.rgb *= ddResidentialTargetRatio;
  float ddY = ddResidentialPosition.y;
  float ddX = ddResidentialPosition.x;
  float ddZ = ddResidentialPosition.z;
  float ddStorey = max(2.4, ddResidentialWearStorey);
  float ddPhase = fract((ddY - 0.14) / ddStorey);
  float ddSillBand = 1.0 - smoothstep(0.018, 0.105, abs(ddPhase - 0.16));
  float ddBalconyBand = 1.0 - smoothstep(0.018, 0.085, min(ddPhase, 1.0 - ddPhase));
  float ddGroundBand = 1.0 - smoothstep(0.0, 0.40, max(ddY - 0.14, 0.0));
  if (ddResidentialWearMode == 1) {
    // Californian wear is a restrained water path: the plinth and the real outlet columns
    // darken, while the old evenly spaced pale scratches remain absent.
    ddGroundBand = 1.0 - smoothstep(0.82, 1.20, ddY);
  }
  float ddLongDrift = 0.88 + 0.12 * sin(ddX * 0.46 + ddZ * 0.21 + ddResidentialWearSeed * 17.0);
  float ddSoiling = ddResidentialWearWall * ddResidentialWearSoil * ddLongDrift
    * (ddSillBand * 0.060 + ddBalconyBand * 0.048 + ddGroundBand * 0.080);

  // Rainwater darkens below outlets and brackets as a broad, rust-tinged wash. The sine is
  // deliberately long-period: it suggests several outlets across an elevation without a
  // repeated stripe or a pasted decal.
  float ddOutlet = pow(max(0.0, sin(ddX * 1.42 + ddResidentialWearSeed * 13.0)), 9.0);
  float ddGutterWash = ddResidentialWearWall * ddOutlet
    * smoothstep(0.38, 0.96, clamp(ddY / 7.5, 0.0, 1.0))
    * (ddResidentialWearMode == 1 ? 0.085
      : ddResidentialWearMode == 2 ? 0.085
        : ddResidentialWearMode == 3 ? 0.070 : 0.042);
  float ddRust = ddGutterWash * (0.72 + 0.28 * sin(ddY * 2.1 + ddX * 0.32));
  float ddShoeRust = ddResidentialWearWall
    * smoothstep(0.12, 0.20, ddY) * (1.0 - smoothstep(0.70, 0.82, ddY))
    * pow(max(0.0, sin(ddX * 1.42 + ddResidentialWearSeed * 13.0)), 9.0) * 0.22;
  if (ddResidentialWearMode == 1) ddShoeRust = 0.0;
  diffuseColor.rgb *= 1.0 - ddSoiling - ddGutterWash * 0.50;
  // Water streaks are darker than the paint. The tiny warm term is kept below the value shift
  // so it cannot become a row of orange decals at board distance.
  diffuseColor.rgb *= 1.0 - (ddRust + ddShoeRust) * 0.060;

  // One deterministic repointed patch on a masonry band. It is a value lift, not a raised
  // stripe, and its centre is selected once from unitFrom for this building material.
  float ddPatchX = 1.0 - smoothstep(0.0, ddResidentialWearPatchWidth,
    abs(ddX - ddResidentialWearPatchX));
  float ddPatchY = 1.0 - smoothstep(0.0, 0.42, abs(ddY - ddResidentialWearPatchY));
  float ddPatch = ddResidentialWearMasonry * ddPatchX * ddPatchY * 0.035;
  float ddDampLift = ddResidentialWearMasonry * ddGroundBand * 0.12;
  if (ddResidentialWearMode == 1) ddDampLift = 0.0;
  diffuseColor.rgb *= 1.0 + ddPatch - ddDampLift;

  // The sun-facing elevation gets a small value lift while the opposing face drops. Lighting
  // still owns the actual direction and shadow; this only restores the broad albedo split the
  // miniature reference retains after tone mapping.
  vec2 ddFaceNormal = normalize(ddResidentialNormal.xz + vec2(0.0001));
  float ddSunFace = dot(ddFaceNormal, normalize(vec2(-0.34, 0.94)));
  float ddSunResponse = ddResidentialWearMode == 1 ? -0.040
    : ddResidentialWearMode == 2 ? 0.060
      : ddResidentialWearMode == 3 ? 0.120
        : ddResidentialWearMode == 4 ? 0.120 : 0.042;
  diffuseColor.rgb *= 1.0 + ddSunFace * ddResidentialWearWall * ddSunResponse;

  // Slate keeps a quiet green-grey trace at the ridge lee and the hip valleys. It is kept well
  // below the brick/lichen reference's saturation so the roof remains a roof, not foliage.
  float ddRidgeMoss = ddResidentialWearRoof
    * smoothstep(0.78, 0.98, sin(ddZ * 0.72 + ddResidentialWearSeed * 9.0) * 0.5 + 0.5)
    * exp(-abs(ddX) * 1.15) * 0.030;
  diffuseColor.rgb *= 1.0 - ddRidgeMoss * 2.0;
  diffuseColor.rgb += vec3(0.006, 0.012, 0.002) * ddRidgeMoss;
  float ddCaliFixingRust = ddResidentialWearMode == 1 && ddResidentialWearRoof > 0.5
    ? pow(max(0.0, sin(ddX * 3.1 + ddResidentialWearSeed * 19.0)), 18.0) * 0.08 : 0.0;
  diffuseColor.rgb *= 1.0 - ddCaliFixingRust;

  // Roof planes carry the same broad albedo split the walls do. A hip that steps round four
  // ways reads as one orange or one grey lid when every plane sits at the same value, and the
  // reference plate separates its planes plainly before any rib or course is legible.
  diffuseColor.rgb *= 1.0 + ddSunFace * ddResidentialWearRoof * 0.055;

  // Roughcast. A coarse aggregate coat sized in metres rather than in texels, so it is the
  // same size on a bay window and on a flank and it never collapses into the photographic
  // grain the atlas map used to carry. Each cell holds one lit pebble: a dome for the body and
  // a side term so the key side of every pebble lifts and its lee drops.
  float ddRoughcast = 0.0;
  if (ddResidentialWearRoughcast > 0.5) {
    vec3 ddRcAbs = abs(normalize(ddResidentialNormal + vec3(0.0, 1e-5, 0.0)));
    vec2 ddRcPlane = ddRcAbs.y > 0.55 ? ddResidentialPosition.xz
      : ddRcAbs.x > ddRcAbs.z ? ddResidentialPosition.zy : ddResidentialPosition.xy;
    // Two coats at an incommensurate ratio, each pebble jittered across nearly its whole cell
    // and given its own radius. One coat on a tight lattice reads as a printed dot screen —
    // which is what the first pass produced — and roughcast is thrown, not printed.
    vec2 ddRcUvA = ddRcPlane / 0.050;
    vec2 ddRcUvB = ddRcPlane / 0.091 + vec2(0.37, 0.61);
    vec2 ddRandA = ddResidentialCellHash(floor(ddRcUvA));
    vec2 ddRandB = ddResidentialCellHash(floor(ddRcUvB) + vec2(37.0, 11.0));
    vec2 ddDeltaA = fract(ddRcUvA) - (0.14 + ddRandA * 0.72);
    vec2 ddDeltaB = fract(ddRcUvB) - (0.16 + ddRandB * 0.68);
    // Pebbles nearly fill their cell and overlap the next one. A small dome inside a large cell
    // is a dot on a lattice however far it is jittered, and a 4x amplitude probe plate showed
    // exactly that — a printed dot screen rather than a thrown coat.
    float ddRadA = 0.34 + ddRandA.y * 0.26;
    float ddRadB = 0.30 + ddRandB.x * 0.24;
    float ddDomeA = 1.0 - smoothstep(ddRadA * 0.30, ddRadA, length(ddDeltaA));
    float ddDomeB = 1.0 - smoothstep(ddRadB * 0.30, ddRadB, length(ddDeltaB));
    float ddSideA = dot(normalize(ddDeltaA + vec2(1e-4)), vec2(-0.60, 0.80));
    float ddSideB = dot(normalize(ddDeltaB + vec2(1e-4)), vec2(-0.60, 0.80));
    // The aggregate has no mip chain of its own, so it has to retire itself. Once a cell is
    // smaller than a pixel this term is per-pixel noise, which is the grain this register is
    // graded against; fade it out on the screen-space cell size instead of shipping sparkle to
    // the board view.
    float ddRcCell = max(fwidth(ddRcUvA.x), fwidth(ddRcUvA.y));
    float ddRcLod = 1.0 - smoothstep(0.30, 1.10, ddRcCell);
    // A slow float coat under the aggregate: the wall was thrown by hand, not printed.
    float ddFloatCoat = sin(ddX * 3.1 + ddY * 1.7 + ddResidentialWearSeed * 5.0) * 0.016;
    ddRoughcast = ddRcLod * (ddDomeA * (0.150 * ddSideA - 0.052)
      + ddDomeB * (0.105 * ddSideB - 0.036)) + ddFloatCoat;
    diffuseColor.rgb *= 1.0 + ddRoughcast;
  }

  /* ─────────────────────────── §2.7 — directed wear ────────────────────────────
   *
   * Everything above this line is a function of height or of face direction alone, which is
   * why §2.7 has never scored above 2.1 on any archetype: a term that is the same everywhere
   * on an elevation is a filter, and the spec says in as many words that a filter scores
   * zero. What follows is directed — it goes to five named places and nowhere else, and each
   * one is a place the FEDERATION seat had already sited in geometry before discovering that
   * §2.7 wants it in material response.
   *
   * ddAlong is the coordinate that runs ACROSS whichever elevation this fragment sits on,
   * so a station placed at 1.9 m along puts a downpipe near the same corner on the front and
   * on the flank rather than only on the two faces that happen to use x.
   */
  vec3 ddFaceAbs = abs(normalize(ddResidentialNormal + vec3(0.0, 1e-5, 0.0)));
  float ddAlong = ddFaceAbs.x > ddFaceAbs.z ? ddZ : ddX;
  float ddVertical = 1.0 - smoothstep(0.35, 0.62, ddFaceAbs.y);
  float ddUpFace = smoothstep(0.55, 0.80, ddFaceAbs.y);

  // 1. THE DOWNPIPE COLLAR. Two stations, not a sine: a collar at about 1.75 m throws a
  //    narrow oxide streak that widens and fades on its way to the plinth. Water leaves a
  //    downpipe collar as a line, so this is 70 mm wide at the collar and 190 mm at the foot.
  float ddCollarY = 1.0 - smoothstep(0.10, 0.62, abs(ddY - 1.72));
  float ddRunY = smoothstep(1.80, 1.62, ddY) * smoothstep(0.10, 0.42, ddY);
  float ddSpread = 0.035 + 0.060 * clamp((1.72 - ddY) / 1.55, 0.0, 1.0);
  float ddPipeA = 1.0 - smoothstep(0.0, ddSpread, abs(ddAlong - ddResidentialWearDropA));
  float ddPipeB = 1.0 - smoothstep(0.0, ddSpread, abs(ddAlong - ddResidentialWearDropB));
  float ddCollarRust = ddResidentialWearWall * ddVertical
    * max(ddPipeA, ddPipeB) * max(ddCollarY * 0.55, ddRunY);

  // 2. THE GUTTER JOINT, above the same two stations. A joint leaks where the run is made up,
  //    and the run is made up over a downpipe. Gated to the four archetypes whose eaves height
  //    this seat has measured on a plate; on everything else the head band is left alone
  //    rather than sited at a guessed height on a lane this seat does not own.
  float ddJointRust = 0.0;
  if (ddResidentialWearMode != 0) {
    float ddJointY = 1.0 - smoothstep(0.06, 0.46, abs(ddY - ddResidentialWearHead));
    ddJointRust = ddResidentialWearWall * ddVertical
      * max(ddPipeA, ddPipeB) * ddJointY
      * smoothstep(ddResidentialWearHead + 0.10, ddResidentialWearHead - 0.55, ddY);
  }
  float ddOxide = clamp(ddCollarRust * 0.85 + ddJointRust * 0.70, 0.0, 1.0);
  // Oxide is a warm loss, not an orange decal: red holds, green and blue give way.
  diffuseColor.rgb *= vec3(1.0 - ddOxide * 0.055, 1.0 - ddOxide * 0.115,
    1.0 - ddOxide * 0.165);

  // 3. THE GRIME BAND ABOVE THE PLINTH. Splash-back stops where the rain stops bouncing, so
  //    it has a top edge — a wavering tide line at roughly 0.44 m, not a gradient that fades
  //    out somewhere. The wander is long-period in world metres so it is the same size on a
  //    bay and on a flank, and it is what separates a band from a vignette.
  float ddTide = 0.44 + 0.055 * sin(ddAlong * 1.9 + ddResidentialWearSeed * 23.0)
    + 0.030 * sin(ddAlong * 5.3 - ddResidentialWearSeed * 7.0);
  float ddSplash = ddResidentialWearWall * ddVertical
    * smoothstep(ddTide, ddTide - 0.20, ddY) * smoothstep(0.10, 0.20, ddY)
    * (0.62 + 0.38 * pow(max(0.0, sin(ddAlong * 3.7 + ddResidentialWearSeed * 5.0)), 2.0));
  diffuseColor.rgb *= 1.0 - ddSplash * ddResidentialWearSoil * 0.085;

  // 4. SOOT ON THE CHIMNEY CAP. The only masonry with an upward face above 3.4 m on any of
  //    these houses is a cap slab or a corbel course, and a flue deposits on its own cap. Kept
  //    to the cap: a wash down the shaft would need to know where the shaft is, and on a
  //    two-storey terrace "vertical masonry above 3.9 m" is the whole first floor.
  float ddSoot = ddResidentialWearMasonry * ddUpFace
    * smoothstep(3.40, 3.95, ddY)
    * (0.70 + 0.30 * sin(ddX * 6.1 + ddZ * 4.7 + ddResidentialWearSeed * 11.0));
  diffuseColor.rgb *= 1.0 - ddSoot * 0.20;
  diffuseColor.rgb -= vec3(0.008, 0.009, 0.008) * ddSoot;

  // 5. MOSS AT THE FLASHING JUNCTION. Moss grows where a roof plane runs into something and
  //    stays damp — the eaves course and the flashing angle — and it grows on the plane the
  //    sun does not reach. Both terms are needed: shade alone would paint a whole pitch.
  float ddFlashMoss = 0.0;
  if (ddResidentialWearMode != 0) {
    ddFlashMoss = ddResidentialWearRoof
      * (1.0 - smoothstep(ddResidentialWearHead - 0.30, ddResidentialWearHead + 0.85, ddY))
      * (1.0 - smoothstep(-0.20, 0.35, ddSunFace))
      * smoothstep(0.30, 0.78, 0.5 + 0.5 * sin(ddAlong * 1.15
        + ddResidentialWearSeed * 15.0)) * 0.9;
  }
  diffuseColor.rgb *= 1.0 - ddFlashMoss * 0.055;
  diffuseColor.rgb += vec3(0.004, 0.011, 0.003) * ddFlashMoss;

  // 6. CHALKING ON THE SUN ELEVATION. Paint and render bloom pale where the sun hits them,
  //    and they bloom in patches with soft edges rather than evenly. Sized in metres so a
  //    fence panel and a flank chalk at the same scale, and held to a five percent lift so it
  //    reads as a dry wall rather than as a light leak.
  float ddChalkField = 0.5 + 0.5 * sin(ddAlong * 0.62 + ddY * 0.41
    + ddResidentialWearSeed * 9.0)
    * cos(ddAlong * 0.29 - ddY * 0.78 + ddResidentialWearSeed * 3.0);
  float ddChalk = ddResidentialWearWall * ddVertical
    * smoothstep(0.18, 0.70, ddSunFace)
    * smoothstep(0.35, 0.72, ddChalkField)
    * smoothstep(0.55, 1.60, ddY);
  diffuseColor.rgb *= 1.0 + ddChalk * 0.048;
`, 'map_fragment');

    shader.fragmentShader = insertAfterAnchor(shader.fragmentShader,
      [DD_ROUGHNESS_SENTINEL, '#include <roughnessmap_fragment>'],
      `
  float ddRoughWear = ddResidentialWearWall * ddResidentialWearSoil * (
    ddGroundBand * 0.090 + ddSillBand * 0.070 + ddBalconyBand * 0.055
  ) + ddGutterWash * 0.80 + ddShoeRust * 0.60 + ddPatch * 0.65 + ddRidgeMoss * 0.55
    + ddResidentialWearRoughcast * 0.055 - ddRoughcast * 0.30;
  // Directed wear changes how a surface answers light, not only what colour it is. Oxide,
  // splash grime, soot and moss are all matte; chalking is the one mark that goes the other
  // way only slightly, because a chalked wall is dry rather than polished.
  ddRoughWear += ddOxide * 0.22 + ddSplash * 0.16 + ddSoot * 0.18
    + ddFlashMoss * 0.20 + ddChalk * 0.06;
  roughnessFactor = clamp(roughnessFactor + ddRoughWear, 0.0, 1.0);
`, 'roughnessmap_fragment');
  };

  // The atlas still has one program for every residential family. Non-atlas brick keeps its
  // existing family key; the wear uniforms do not add a material bucket or a draw call.
  if (material.userData?.residentialAtlas) {
    material.customProgramCacheKey = () => 'residential-atlas-v320';
  } else {
    material.customProgramCacheKey = () => `residential-wear-v320-${family}`;
  }
  material.needsUpdate = true;
}

export const RESIDENTIAL_ATLAS_FAMILIES = FAMILY_ORDER;
