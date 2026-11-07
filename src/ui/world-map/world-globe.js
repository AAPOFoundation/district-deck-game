// Voxel Earth occupancy from the baked Natural Earth 110m mask.

import { GLOBE_COLS, GLOBE_LAND_B64, GLOBE_ROWS } from './world-land-mask.js';
import { P1_OCEAN } from '../../render/v4-p1-polish.js';

export { P1_OCEAN };
// P14-M9: the ocean's shelf texture is registered to this lattice, so the
// lattice travels with the module that defines the geography rather than being
// re-imported from the mask beside it.
export { GLOBE_COLS, GLOBE_ROWS };

export const GLOBE_RADIUS = 1.298;
/** G1 physical atmosphere and distant-terrain filtering contract. */
export const ATMOSPHERE_LIMB = Object.freeze({
  radiusFraction: 0.05,
  shellScale: 1.05,
  fresnelPower: 2.15,
  dayAt: 0.34,
  nightAt: -0.30,
  dayGain: 1,
  nightGain: 0.24,
});
export const TERRAIN_FILTER = Object.freeze({
  paletteBlend: 0.64,
  horizonKeep: 0.82,
  edgeSoftnessPx: 1.15,
});
// V4.1 Wave 1b: 137859 occupied at 960×480; 10% headroom → 151700.
export const GLOBE_LAND_LIMIT = 151700;
export const MIN_LAND_LAT = -90;
export const LAND_HEIGHT = 0.0045;
export const ICE_HEIGHT = 0.008;

let decodedBits = null;

function decodeLandBits() {
  if (decodedBits) return decodedBits;
  const binary = atob(GLOBE_LAND_B64);
  decodedBits = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) decodedBits[i] = binary.charCodeAt(i);
  return decodedBits;
}

export function isLandCell(column, row) {
  const bits = decodeLandBits();
  const index = (row * GLOBE_COLS) + column;
  const bit = bits[index >> 3];
  if (bit == null) return false;
  return ((bit >> (7 - (index & 7))) & 1) === 1;
}

export function latLonToCell(lat, lon) {
  const wrapped = ((lon + 540) % 360) - 180;
  const column = Math.max(0, Math.min(GLOBE_COLS - 1, Math.floor(((wrapped + 180) / 360) * GLOBE_COLS)));
  const row = Math.max(0, Math.min(GLOBE_ROWS - 1, Math.floor(((90 - lat) / 180) * GLOBE_ROWS)));
  return { column, row };
}

export function cellToLatLon(column, row) {
  const lon = ((column + 0.5) / GLOBE_COLS) * 360 - 180;
  const lat = 90 - ((row + 0.5) / GLOBE_ROWS) * 180;
  return { lat, lon };
}

export function latLonToVector(lat, lon, radius = GLOBE_RADIUS) {
  const latRad = lat * (Math.PI / 180);
  const lonRad = lon * (Math.PI / 180);
  const latitudeRadius = radius * Math.cos(latRad);
  return {
    x: latitudeRadius * Math.cos(lonRad),
    y: radius * Math.sin(latRad),
    // Negative Z so east is east when viewed from outside (Three.js right-hand).
    z: -latitudeRadius * Math.sin(lonRad),
  };
}

function mixHex(a, b, t) {
  const u = Math.min(1, Math.max(0, t));
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + ((br - ar) * u));
  const g = Math.round(ag + ((bg - ag) * u));
  const bch = Math.round(ab + ((bb - ab) * u));
  return (r << 16) | (g << 8) | bch;
}

function multiplyHex(hex, factor) {
  const f = Math.min(1.25, Math.max(0, factor));
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return (r << 16) | (g << 8) | b;
}

export function isPolarIce(lat) {
  return lat <= -60 || lat >= 74;
}

/** Smooth latitude wash. Ice at both poles. No continent boxes. */
export function landColorFor(lat, lon) {
  if (isPolarIce(lat)) {
    const polar = lat < 0 ? (-60 - lat) / 30 : (lat - 74) / 16;
    return mixHex(0xdce6f0, 0xf7fafc, Math.min(1, Math.max(0, polar)));
  }
  const abs = Math.abs(lat);
  let colour;
  if (abs < 18) colour = mixHex(0x3f7a38, 0x6a9144, abs / 18);
  else if (abs < 42) colour = mixHex(0x6a9144, 0x8a9a58, (abs - 18) / 24);
  else colour = mixHex(0x8a9a58, 0xc5cec0, (abs - 42) / 32);
  const shade = 0.5 + (0.5 * Math.sin((lon * Math.PI) / 120));
  return mixHex(colour, mixHex(colour, 0x2a3a22, 0.12), shade * 0.08);
}

export function voxelHeightFor(lat) {
  return isPolarIce(lat) ? ICE_HEIGHT : LAND_HEIGHT;
}

/* ================================================================== *
 * P14 M10 ITEM 2 — RELIEF, IN THE VOXEL REGISTER.
 *
 * MC5 pack-h/pack-i, 4/10 each: "voxel continents collapse planetary scale to
 * toy-Minecraft tiles"; "cuboid-extruded continents read as toy bricks, not
 * relief, against a smooth ocean sphere". The register is the world map's own
 * design and stays. What was missing under it is measurable and it is two
 * things, both about the TOPS, because at this projection there are almost no
 * sides to see:
 *
 *   a land cell draws **2.67 px** across (`GLOBE_RADIUS * 0.375 deg` of chord at
 *     314.9 px per world unit) and stands **1.42 px** proud (`LAND_HEIGHT`
 *     0.0045). An extrusion an eighth as tall as it is wide, seen from above,
 *     is a TILE — the sides are a pixel and a half and carry nothing;
 *   and every one of the 137,859 tiles takes its colour from `landColorFor`,
 *     which is a function of LATITUDE AND LONGITUDE ONLY. Two cells at the same
 *     latitude are the same colour whether one is the Ganges delta and the
 *     other is the Tibetan plateau. 649 distinct colours over 137,859 cells,
 *     and all 649 of them are bands of latitude (M10 probe Q4).
 *
 * So the land is given an ALTITUDE, and the altitude is given to both the tint
 * and the geometry: coast / plain / upland / alpine / snow bands on the tops,
 * and a second and third tier of voxels stacked on the high cells so the
 * silhouette at the limb is stepped instead of smooth.
 *
 * WHAT THE ALTITUDE IS, STATED PLAINLY. There is no elevation raster in this
 * repository — the only baked geography is the 960 x 480 Natural Earth land
 * MASK — so this is a synthesised field, not measured topography, and it is
 * built from the two things the mask does know:
 *
 *   the distance to the nearest coast, which `coastDistanceCells` already
 *     computes for the ocean shelf (so the relief costs no second transform),
 *     because a continental interior is on average higher than its own margin;
 *   and a ridged multi-octave value noise on the lat/lon lattice, which is what
 *     turns a smooth inland dome into belts and basins.
 *
 * It is deterministic (a hashed lattice, no `Math.random`), it is stable across
 * reloads, and it makes no claim to name a real mountain. The register is a
 * painted board game's globe; the requirement is that the land READS as terrain
 * at the sighting pose, and that is what is measured.
 *
 * `rasterizeGlobeVoxels` is NOT re-shaped by any of this: its occupancy, its
 * per-voxel `height` and its cell count are pinned by `v41-wave-1b`
 * (`land.occupied === MEASURED_LAND`) and by `world-map-nav` (`every height is
 * LAND_HEIGHT or ICE_HEIGHT`), and those pins hold. Only the per-voxel COLOUR
 * moves, and the extra tiers are a separate raster on a separate mesh.
 * ================================================================== */
/** Cells inland at which the interior term saturates. 22 cells ~ 8.4 deg. */
export const RELIEF_INLAND_CELLS = 26;
/** Altitude at which a cell earns a second voxel, and a third. */
export const RELIEF_TIER_1 = 0.44;
export const RELIEF_TIER_2 = 0.72;
/** How much of the altitude band tint is mixed over the latitude wash. */
export const RELIEF_TINT_MIX = 0.62;
export const RELIEF_LIMIT = 60000;
/** Coast, plain, upland, alpine rock, snow. */
export const RELIEF_TINTS = Object.freeze({
  coast: 0x9aa86e,
  plain: 0x5d8140,
  upland: 0x8a7f52,
  alpine: 0x8e8578,
  snow: 0xeaf1f6,
});
/** G2 sighting-scale material families: fields, cut upland, shelf, and ice. */
export const LAND_SURFACE = Object.freeze({
  lowlandDark: 0x172a0d,
  lowlandLight: 0xf2fab4,
  uplandLow: 0x20262c,
  uplandHigh: 0x625b4e,
  shelfWet: 0xe5dab6,
  shelfDry: 0xfaf3dc,
  iceEdge: 0xd8e8f2,
  iceCore: 0xf5f9fc,
  uplandAt: 0.42,
});
/** M12 per-column occlusion: only higher cardinal neighbours close a valley. */
export const LAND_VALLEY_AO = Object.freeze({ floor: 0.68, reliefGain: 0.72, wallGain: 0.035 });

/** Deterministic 0..1 lattice hash. No RNG anywhere on this page. */
function reliefHash(i, j, seed) {
  let h = Math.imul(i + 0x1f83d9ab, 0x9e3779b1) ^ Math.imul(j + 0x5be0cd19, 0x85ebca6b);
  h ^= Math.imul(seed + 0x243f6a88, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  return (h >>> 8) / 16777216;
}
/** Bilinear value noise on that lattice, longitude wrapped at `GLOBE_COLS`. */
export function reliefNoise(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = reliefHash(x0, y0, seed);
  const b = reliefHash(x0 + 1, y0, seed);
  const c = reliefHash(x0, y0 + 1, seed);
  const d = reliefHash(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * sx;
  const bot = c + (d - c) * sx;
  return top + (bot - top) * sy;
}

/** Broad field parcels overlaid with a finer forest/furrow cadence. */
export function lowlandMottleAt(column, row) {
  const fields = reliefNoise(column / 7.5, row / 7.5, 71);
  const forest = reliefNoise(column / 2.8 + 4.3, row / 3.2 + 1.7, 89);
  const furrows = 0.5 + 0.5 * Math.sin(column * 0.73 + row * 0.31);
  return Math.max(0, Math.min(1, fields * 0.48 + forest * 0.34 + furrows * 0.18));
}
/**
 * Synthesised altitude, 0 at the waterline and 1 at the highest ground.
 *
 * `1 - |2n - 1|` is the ridged form: it folds the noise about its midpoint so
 * the maxima are CRESTS rather than domes, which is what makes a range read as
 * a range. Three octaves, and the interior term multiplies rather than adds, so
 * a ridge that runs out to a coast is cut off by the coast the way a real one
 * is by its own continental shelf.
 */
/**
 * Memo. The altitude is read twice per land cell — once by the tint in
 * `rasterizeGlobeVoxels` and once by `rasterizeLandRelief` — and the raster was
 * measured at 202 ms with it recomputed against 30 ms before the field existed.
 * One `Float32Array` over the lattice halves that back.
 */
let altField = null;
export function landAltitudeAt(column, row) {
  const idx = row * GLOBE_COLS + column;
  if (!altField) altField = new Float32Array(GLOBE_COLS * GLOBE_ROWS).fill(-1);
  const memo = altField[idx];
  if (memo >= 0) return memo;
  const v = computeLandAltitude(column, row);
  altField[idx] = v;
  return v;
}

/**
 * 1 on an exposed ridge, darker toward LAND_VALLEY_AO.floor where higher
 * cardinal neighbours surround a cell.  This is baked into instance colour,
 * while the material shader handles the independent top/side sun response.
 */
export function valleyOcclusionAt(column, row) {
  const c = ((column % GLOBE_COLS) + GLOBE_COLS) % GLOBE_COLS;
  const r = Math.max(0, Math.min(GLOBE_ROWS - 1, row));
  const { lat, lon } = cellToLatLon(c, r);
  if (!isLandCell(c, r) || isCanalWater(lat, lon)) return 1;
  const centre = landAltitudeAt(c, r);
  let relief = 0;
  let walls = 0;
  let samples = 0;
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nc = (c + dc + GLOBE_COLS) % GLOBE_COLS;
    const nr = r + dr;
    if (nr < 0 || nr >= GLOBE_ROWS) continue;
    const ll = cellToLatLon(nc, nr);
    if (!isLandCell(nc, nr) || isCanalWater(ll.lat, ll.lon)) continue;
    const rise = Math.max(0, landAltitudeAt(nc, nr) - centre);
    relief += rise;
    if (rise > 0.055) walls += 1;
    samples += 1;
  }
  if (!samples) return 1;
  const dark = (relief / samples) * LAND_VALLEY_AO.reliefGain
    + walls * LAND_VALLEY_AO.wallGain;
  return Math.max(LAND_VALLEY_AO.floor, Math.min(1, 1 - dark));
}

/**
 * Directional top-face slope value. The same altitude field that raises the
 * terrace supplies its east/west and north/south gradient, so the ochre-grey
 * upland reads as cut ground before its one-pixel voxel sides become visible.
 */
export function landSlopeShadeAt(column, row) {
  const c = ((column % GLOBE_COLS) + GLOBE_COLS) % GLOBE_COLS;
  const r = Math.max(0, Math.min(GLOBE_ROWS - 1, row));
  const centre = landAltitudeAt(c, r);
  const sample = (dc, dr) => {
    const nc = (c + dc + GLOBE_COLS) % GLOBE_COLS;
    const nr = r + dr;
    if (nr < 0 || nr >= GLOBE_ROWS) return centre;
    const ll = cellToLatLon(nc, nr);
    if (!isLandCell(nc, nr) || isCanalWater(ll.lat, ll.lon)) return centre;
    return landAltitudeAt(nc, nr);
  };
  const east = sample(1, 0) - sample(-1, 0);
  const north = sample(0, -1) - sample(0, 1);
  const steep = Math.min(1, Math.hypot(east, north) * 4.6);
  const facing = Math.max(-1, Math.min(1, east * -2.8 + north * 1.9));
  return Math.max(0.78, Math.min(1.08, 1.02 - steep * 0.20 + facing * 0.10));
}

/** One deterministic surface decision shared by base land and raised tiers. */
export function landSurfaceColor(column, row, lat, lon, alt, coast = false) {
  const mottle = lowlandMottleAt(column, row);
  if (isPolarIce(lat)) {
    const polar = lat < 0 ? (-60 - lat) / 24 : (lat - 74) / 16;
    return mixHex(LAND_SURFACE.iceEdge, LAND_SURFACE.iceCore, Math.max(0, Math.min(1, polar)));
  }
  if (coast) {
    return mixHex(LAND_SURFACE.shelfWet, LAND_SURFACE.shelfDry,
      Math.max(0.18, Math.min(0.82, mottle)));
  }
  if (alt < LAND_SURFACE.uplandAt) {
    const fieldMix = Math.max(0, Math.min(1, (mottle - 0.292) / 0.384));
    const field = fieldMix * fieldMix * (3 - 2 * fieldMix);
    const furrowShade = 0.94 + 0.12 * (0.5 + 0.5 * Math.sin(column * 1.13 - row * 0.47));
    return multiplyHex(mixHex(LAND_SURFACE.lowlandDark, LAND_SURFACE.lowlandLight, field), furrowShade);
  }
  const high = Math.max(0, Math.min(1, (alt - LAND_SURFACE.uplandAt) / (1 - LAND_SURFACE.uplandAt)));
  return multiplyHex(
    mixHex(LAND_SURFACE.uplandLow, LAND_SURFACE.uplandHigh, high * 0.72 + mottle * 0.18),
    landSlopeShadeAt(column, row),
  );
}
function computeLandAltitude(column, row) {
  const d = inlandDistanceCells()[row * GLOBE_COLS + column] ?? 0;
  const inland = Math.min(1, d / RELIEF_INLAND_CELLS);
  const interior = inland * inland * (3 - 2 * inland);
  const u = column;
  const v = row;
  const ridged = (x, y, s) => 1 - Math.abs(2 * reliefNoise(x, y, s) - 1);
  const belt = ridged(u / 62, v / 62, 11) * 0.52
    + ridged(u / 23 + 3.7, v / 23 + 1.9, 23) * 0.31
    + ridged(u / 9 + 7.1, v / 9 + 5.3, 37) * 0.17;
  // Three ridged octaves summed have a mean near 0.5 and a standard deviation
  // near 0.15 — the central limit flattens them — so the raw sum spans 0.2 to
  // 0.8 and NOTHING reaches the tiers. Re-centred and stretched, the upper half
  // of that distribution is spread across the full range, and the exponent then
  // pulls the bulk back down: a first cut without it put 47.7 % of all land
  // above the first tier and snow in the Amazon. The four constants are chosen
  // against the measured distribution, not by eye — 16.0 % of land above the
  // first tier and 6.2 % above the second, which is the right order for Earth
  // (about a quarter of land over 1,000 m, a tenth over 2,000).
  const beltN = Math.max(0, Math.min(1, (belt - RELIEF_SHAPE.centre) / RELIEF_SHAPE.stretch));
  // The belt alone would put a range down the middle of every delta; the
  // interior term keeps margins low without erasing coastal ranges entirely.
  const alt = Math.max(0, Math.min(1,
    Math.pow(beltN, RELIEF_SHAPE.power) * (RELIEF_SHAPE.base + (1 - RELIEF_SHAPE.base) * interior)));
  return alt * alt * (3 - 2 * alt);
}
/** Measured against the land distribution; see `landAltitudeAt`. */
export const RELIEF_SHAPE = Object.freeze({
  centre: 0.47, stretch: 0.40, power: 2.2, base: 0.45,
});
/**
 * The snow line: high ground, and lower the further from the equator.
 *
 * The fall is a SQUARE, not a straight line, and the difference is measurable
 * on the frame. Linear (0.98 - a/90 * 0.66) puts the line at 0.80 by 25 deg,
 * which snow-tints 5.10 % of all land and left white blobs across southern
 * China and the Australian interior in the first M10 sighting crop. Squared,
 * the subtropical line is 0.95 and the share is 2.46 % — snow where a
 * continent's high belts reach it, and nowhere a reader would call wrong.
 */
export const SNOW_LINE = Object.freeze({ base: 0.99, span: 0.55, power: 2 });
export function snowLineAt(lat) {
  const a = Math.min(90, Math.abs(lat)) / 90;
  return Math.max(0.34, SNOW_LINE.base - (a ** SNOW_LINE.power) * SNOW_LINE.span);
}
/** Coast -> plain -> upland -> alpine -> snow, as one hex. */
export function altitudeTint(alt, lat) {
  const snow = snowLineAt(lat);
  if (alt >= snow) {
    // The ramp spans the whole band ABOVE the line, so the highest ground is
    // full snow at every latitude. A fixed 0.08 floor on the denominator (the
    // first cut) capped the equatorial band at a quarter of the way to white,
    // because the tropical snow line is 0.98 and there is only 0.02 above it.
    return mixHex(RELIEF_TINTS.alpine, RELIEF_TINTS.snow,
      Math.min(1, (alt - snow) / Math.max(1e-3, 1 - snow)));
  }
  if (alt < 0.16) return mixHex(RELIEF_TINTS.coast, RELIEF_TINTS.plain, alt / 0.16);
  if (alt < 0.46) return mixHex(RELIEF_TINTS.plain, RELIEF_TINTS.upland, (alt - 0.16) / 0.30);
  return mixHex(RELIEF_TINTS.upland, RELIEF_TINTS.alpine,
    Math.min(1, (alt - 0.46) / Math.max(0.08, snow - 0.46)));
}
/**
 * The second and third tiers. One voxel per high cell per tier, stacked
 * outward by `LAND_HEIGHT`, slightly narrower than the cell below it so the
 * step reads as a shoulder rather than as a taller brick.
 */
export function rasterizeLandRelief() {
  decodeLandBits();
  const voxels = [];
  const dLon = 360 / GLOBE_COLS;
  const dLat = 180 / GLOBE_ROWS;
  const chord = GLOBE_RADIUS * (dLon * Math.PI / 180);
  let tier1 = 0;
  let tier2 = 0;
  for (let row = 0; row < GLOBE_ROWS; row += 1) {
    const { lat } = cellToLatLon(0, row);
    const latScale = Math.max(0.18, Math.cos(lat * Math.PI / 180));
    for (let column = 0; column < GLOBE_COLS; column += 1) {
      if (voxels.length >= RELIEF_LIMIT) {
        return { voxels, occupied: voxels.length, tier1, tier2, columns: GLOBE_COLS, rows: GLOBE_ROWS };
      }
      const { lon } = cellToLatLon(column, row);
      if (!isLandCell(column, row) || isCanalWater(lat, lon)) continue;
      const polar = isPolarIce(lat);
      // The polar caps are drawn on a half lattice by `rasterizeGlobeVoxels`
      // (`(column + row) % 2`), so stacking there would comb the ice.
      if (polar) continue;
      const alt = landAltitudeAt(column, row);
      if (alt < RELIEF_TIER_1) continue;
      const tiers = alt >= RELIEF_TIER_2 ? 2 : 1;
      if (tiers === 2) tier2 += 1; else tier1 += 1;
      for (let k = 0; k < tiers; k += 1) {
        const radius = GLOBE_RADIUS + 0.006 + LAND_HEIGHT * (k + 1);
        const position = latLonToVector(lat, lon, radius);
        /*
         * THE TIERS MUST OVERLAP THEIR OWN NEIGHBOURS, and the first cut did
         * not. The base raster lays each cell at 1.12x its lattice spacing, so
         * neighbours overlap by 12 %; tiers at 0.94 and 0.84 of that are 1.053
         * and 0.941 of the spacing — the SECOND tier leaves a 6 % gap, so its
         * cells stand as isolated 2.5 px blocks with the darker base land
         * showing between them. Measured on the sighting crop, that is the
         * whole of the stipple the 3x crop showed: with the four shader terms
         * all zeroed the mean |high-pass| over the upland is 12.59 against
         * 13.85, and with the tier mesh HIDDEN it is 8.57. The geometry made
         * the noise, not the shading. At 1.00 and 0.96 both tiers still overlap
         * (1.120 and 1.075 of the spacing) and the only sides left visible are
         * the ones at a plateau's own edge, which is the terrace.
         */
        const shrink = 1.00 - k * 0.04;
        voxels.push({
          ...position,
          lat,
          lon,
          column,
          row,
          alt,
          tier: k + 1,
          width: chord * latScale * 1.12 * shrink,
          height: LAND_HEIGHT,
          depth: GLOBE_RADIUS * (dLat * Math.PI / 180) * 1.12 * shrink,
          color: landSurfaceColor(
            column, row, lat, lon, Math.min(1, alt + 0.10 * (k + 1)), false,
          ),
        });
      }
    }
  }
  return { voxels, occupied: voxels.length, tier1, tier2, columns: GLOBE_COLS, rows: GLOBE_ROWS };
}

/** Open water that 110m land often fills: Suez isthmus, Gulf of Suez, Red Sea axis, Bab-el-Mandeb. */
export function isCanalWater(lat, lon) {
  if (lat > 29.75 && lat < 31.50 && lon > 32.12 && lon < 32.78) return true;
  if (lat > 27.55 && lat < 29.95 && lon > 32.25 && lon < 34.05) {
    const mid = 32.55 + ((lat - 28.7) * 0.18);
    if (Math.abs(lon - mid) < 0.62) return true;
  }
  if (lat > 12.35 && lat < 28.05 && lon > 33.8 && lon < 43.4) {
    const mid = 38.15 - ((lat - 20) * 0.14);
    if (Math.abs(lon - mid) < 1.42) return true;
  }
  if (lat > 11.45 && lat < 13.85 && lon > 42.25 && lon < 44.25) return true;
  if (lat > 31.28 && lat < 32.55 && lon > 31.45 && lon < 33.15) {
    const mid = 32.2;
    if (Math.abs(lon - mid) < 0.85) return true;
  }
  return false;
}

function cellHasLandNeighbor(column, row) {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dc, dr] of dirs) {
    const c = (column + dc + GLOBE_COLS) % GLOBE_COLS;
    const r = row + dr;
    if (r < 0 || r >= GLOBE_ROWS) continue;
    const { lat, lon } = cellToLatLon(c, r);
    if (isLandCell(c, r) && !isCanalWater(lat, lon)) return true;
  }
  return false;
}

function cellHasWaterNeighbor(column, row) {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dc, dr] of dirs) {
    const c = (column + dc + GLOBE_COLS) % GLOBE_COLS;
    const r = row + dr;
    if (r < 0 || r >= GLOBE_ROWS) continue;
    const { lat, lon } = cellToLatLon(c, r);
    if (!isLandCell(c, r) || isCanalWater(lat, lon)) return true;
  }
  return false;
}

export function rasterizeGlobeVoxels() {
  decodeLandBits();
  const voxels = [];
  const dLon = 360 / GLOBE_COLS;
  const dLat = 180 / GLOBE_ROWS;
  const chord = GLOBE_RADIUS * (dLon * Math.PI / 180);

  for (let row = 0; row < GLOBE_ROWS; row += 1) {
    const { lat } = cellToLatLon(0, row);
    const latScale = Math.max(0.18, Math.cos(lat * Math.PI / 180));
    for (let column = 0; column < GLOBE_COLS; column += 1) {
      const { lon } = cellToLatLon(column, row);
      const land = isLandCell(column, row);
      const polar = lat <= -60 || lat >= 74;
      const arcticPack = !land && lat >= 78 && ((column + row) % 3 === 0);
      if (!land && !arcticPack) continue;
      if (polar && land && ((column + row) % 2 !== 0)) continue;
      if (land && isCanalWater(lat, lon)) continue;
      const position = latLonToVector(lat, lon, GLOBE_RADIUS + 0.006);
      let color = landColorFor(lat, lon);
      // ── P14 M10 item 2 — the tint carries the altitude, not the latitude
      // alone. `landColorFor` is a pure function of (lat, lon), so the Ganges
      // delta and the Tibetan plateau came out the same colour; the band tint
      // is mixed over it at RELIEF_TINT_MIX so the latitude wash still governs
      // the hue family (tropics green, mid-latitude khaki, high pale) and the
      // altitude governs the value inside it. Polar cells keep the ice wash.
      const alt = (land && !polar) ? landAltitudeAt(column, row) : 0;
      if (land) {
        color = landSurfaceColor(
          column, row, lat, lon, alt, land && !polar && cellHasWaterNeighbor(column, row),
        );
      }
      if (land && !polar) {
        color = multiplyHex(color, valleyOcclusionAt(column, row));
      }
      voxels.push({
        ...position,
        lat,
        lon,
        column,
        row,
        alt,
        width: chord * latScale * 1.12,
        height: voxelHeightFor(lat),
        depth: GLOBE_RADIUS * (dLat * Math.PI / 180) * 1.12,
        color,
        coast: land && !polar && cellHasWaterNeighbor(column, row),
      });
    }
  }

  if (voxels.length > GLOBE_LAND_LIMIT) {
    throw new RangeError(`Globe land budget exceeded: ${voxels.length}/${GLOBE_LAND_LIMIT}.`);
  }

  return {
    voxels,
    columns: GLOBE_COLS,
    rows: GLOBE_ROWS,
    occupied: voxels.length,
  };
}

/** One-voxel beach/foam rim on the water side of every coast cell. Stay voxel. */
export function rasterizeCoastFoam() {
  decodeLandBits();
  const voxels = [];
  const dLon = 360 / GLOBE_COLS;
  const dLat = 180 / GLOBE_ROWS;
  const chord = GLOBE_RADIUS * (dLon * Math.PI / 180);
  for (let row = 0; row < GLOBE_ROWS; row += 1) {
    const { lat } = cellToLatLon(0, row);
    if (lat <= -62 || lat >= 76) continue;
    const latScale = Math.max(0.18, Math.cos(lat * Math.PI / 180));
    for (let column = 0; column < GLOBE_COLS; column += 1) {
      if (voxels.length >= P1_OCEAN.foamLimit) {
        return { voxels, occupied: voxels.length, columns: GLOBE_COLS, rows: GLOBE_ROWS };
      }
      const { lon } = cellToLatLon(column, row);
      if (isLandCell(column, row) && !isCanalWater(lat, lon)) continue;
      if (!cellHasLandNeighbor(column, row)) continue;
      const position = latLonToVector(lat, lon, GLOBE_RADIUS + 0.0015);
      const foamMix = ((column * 13 + row * 7) % 10) / 10;
      voxels.push({
        ...position,
        lat,
        lon,
        column,
        row,
        width: chord * latScale * 1.05,
        height: P1_OCEAN.foamHeight,
        depth: GLOBE_RADIUS * (dLat * Math.PI / 180) * 1.05,
        color: mixHex(P1_OCEAN.beachColor, P1_OCEAN.foamColor, 0.35 + foamMix * 0.45),
      });
    }
  }
  return { voxels, occupied: voxels.length, columns: GLOBE_COLS, rows: GLOBE_ROWS };
}

/* ================================================================== *
 * P14 M9 ITEM 1 — THE SEA HAS A SHELF, AND THE COASTS HAVE A BEACH.
 *
 * MC4 pack-i / pack-j: "voxel continents sit as extruded Lego on a featureless
 * billiard-ball sea, no coastal fit, no water shading, no atmospheric staging."
 * The measurement behind the first half of that (`shots-v56/M9-probe.json`, Q5)
 * is arithmetic and it is decisive:
 *
 *   the ocean sphere's surface sits at `GLOBE_RADIUS - 0.012` = 1.286
 *   a land voxel's BOTTOM face sits at `GLOBE_RADIUS + 0.006 - LAND_HEIGHT/2`
 *     = 1.30175
 *   so every continent floats 0.01575 world units clear of the sea, which at
 *     the world map's own projection (314.9 px per world unit; the globe draws
 *     817 px across) is 4.96 PIXELS of daylight under every coastline
 *   and the existing coast rim, `rasterizeCoastFoam`, is `P1_OCEAN.foamHeight`
 *     = 0.0025 tall, i.e. 0.79 px — a third of the gap it was meant to close,
 *     which is why it does not read at all
 *
 * A plate hovering five pixels over a flat sheet with a hard tonal cut at its
 * edge IS extruded Lego. Two things follow, and this is the second one: a
 * lighter, WIDER voxel skirt under every coast cell, tall enough to bridge the
 * gap from the sea surface to the land's underside and proud enough of the land
 * plan to read as a beach terrace rather than as a shadow line.
 * ================================================================== */
/** Skirt geometry, in world units. Bridges sea surface -> land underside. */
export const COAST_SKIRT = Object.freeze({
  /** Radius of the skirt box CENTRE, relative to GLOBE_RADIUS. */
  centre: -0.0035,
  /** Box height. Spans 1.2865 -> 1.3025 at GLOBE_RADIUS 1.298. */
  height: 0.016,
  /** Plan scale against the land cell's own footprint. */
  spread: 1.34,
  /** Sand, and the surf tone the wetted edge of it carries. */
  sand: 0xc9b48a,
  foam: 0xdfe7dc,
  limit: 12000,
});
/**
 * One lighter, wider voxel under every land cell that touches water. Same
 * lat/lon lattice as the land raster, so a skirt is exactly under its own
 * continent edge and the two can never drift apart.
 */
export function rasterizeCoastSkirt() {
  decodeLandBits();
  const voxels = [];
  const dLon = 360 / GLOBE_COLS;
  const dLat = 180 / GLOBE_ROWS;
  const chord = GLOBE_RADIUS * (dLon * Math.PI / 180);
  for (let row = 0; row < GLOBE_ROWS; row += 1) {
    const { lat } = cellToLatLon(0, row);
    const latScale = Math.max(0.18, Math.cos(lat * Math.PI / 180));
    for (let column = 0; column < GLOBE_COLS; column += 1) {
      if (voxels.length >= COAST_SKIRT.limit) {
        return { voxels, occupied: voxels.length, columns: GLOBE_COLS, rows: GLOBE_ROWS };
      }
      const { lon } = cellToLatLon(column, row);
      if (!isLandCell(column, row) || isCanalWater(lat, lon)) continue;
      if (!cellHasWaterNeighbor(column, row)) continue;
      const polar = isPolarIce(lat);
      const position = latLonToVector(lat, lon, GLOBE_RADIUS + COAST_SKIRT.centre);
      // A beach is not one tone: the wetted strip is paler than the dry sand,
      // and which of the two a cell gets walks with the lattice.
      const wet = ((column * 11 + row * 5) % 10) / 10;
      const base = polar ? 0xe8eef4 : COAST_SKIRT.sand;
      voxels.push({
        ...position,
        lat,
        lon,
        column,
        row,
        width: chord * latScale * 1.12 * COAST_SKIRT.spread,
        height: COAST_SKIRT.height,
        depth: GLOBE_RADIUS * (dLat * Math.PI / 180) * 1.12 * COAST_SKIRT.spread,
        color: mixHex(base, COAST_SKIRT.foam, 0.18 + wet * 0.42),
      });
    }
  }
  return { voxels, occupied: voxels.length, columns: GLOBE_COLS, rows: GLOBE_ROWS };
}

/* ------------------------------------------------------------------ *
 * The depth-tinted shelf. The brief asks for a lighter shelf 30-60 px around
 * every coast; at the world map's own projection 30 px is 4.21 degrees of arc
 * and 60 px is 8.41 (Q5 again), and the mask lattice is 2.667 cells per degree,
 * so the shelf runs from the coast out to between 11 and 22 CELLS.
 *
 * A chamfer distance transform on the land mask gives that in two passes over
 * 460,800 cells: forward over the causal half of a 3x3 neighbourhood, backward
 * over the anti-causal half, with longitude wrapped and latitude clamped. It is
 * exact to a few per cent for Euclidean distance, which is far inside what a
 * tonal ramp needs.
 * ------------------------------------------------------------------ */
export const SHELF_CELLS_INNER = 11;
export const SHELF_CELLS_OUTER = 22;
/**
 * M12 ocean-material depth register.  Coast and shelf are two shallow tones;
 * upper and lower slope are the two bathymetry tones beneath them.
 */
export const BATHYMETRY_BANDS = Object.freeze({
  land: 0,
  coast: 1,
  shelf: 2,
  upperDepth: 3,
  lowerDepth: 4,
  deep: 5,
  coastMax: 4.5,
  shelfMax: SHELF_CELLS_INNER,
  upperDepthMax: 16.5,
  lowerDepthMax: SHELF_CELLS_OUTER,
});
let shelfField = null;
let inlandField = null;
/**
 * P14 M10 item 2 — the MIRROR of the shelf transform: how far a LAND cell is
 * from the nearest water, in cells.
 *
 * `coastDistanceCells` seeds its transform on land and measures water, which is
 * what a depth shelf needs and is useless to relief: every land cell reads 0.
 * The first cut of `landAltitudeAt` read it anyway and the whole interior term
 * evaluated to zero, which is why the first relief raster returned 0 voxels of
 * 60,000 and the altitude never passed 0.212. Same two-pass chamfer, same wrap
 * and clamp, seeded on WATER.
 */
export function inlandDistanceCells() {
  if (inlandField) return inlandField;
  inlandField = chamferField(false);
  return inlandField;
}
export function coastDistanceCells() {
  if (shelfField) return shelfField;
  shelfField = chamferField(true);
  return shelfField;
}
export function coastDistanceAt(column, row) {
  const c = ((column % GLOBE_COLS) + GLOBE_COLS) % GLOBE_COLS;
  const r = Math.max(0, Math.min(GLOBE_ROWS - 1, row));
  return coastDistanceCells()[r * GLOBE_COLS + c];
}
export function bathymetryBandAt(column, row) {
  const d = coastDistanceAt(column, row);
  if (!(d > 0)) return BATHYMETRY_BANDS.land;
  if (d <= BATHYMETRY_BANDS.coastMax) return BATHYMETRY_BANDS.coast;
  if (d <= BATHYMETRY_BANDS.shelfMax) return BATHYMETRY_BANDS.shelf;
  if (d <= BATHYMETRY_BANDS.upperDepthMax) return BATHYMETRY_BANDS.upperDepth;
  if (d <= BATHYMETRY_BANDS.lowerDepthMax) return BATHYMETRY_BANDS.lowerDepth;
  return BATHYMETRY_BANDS.deep;
}

/** The vertical meridian's deterministic 10-degree graduation plan. */
export const MERIDIAN_GRADUATIONS = Object.freeze({ count: 36, majorEvery: 3 });
export function meridianTickAt(index, count = MERIDIAN_GRADUATIONS.count) {
  const i = ((index % count) + count) % count;
  const major = i % MERIDIAN_GRADUATIONS.majorEvery === 0;
  return Object.freeze({
    index: i,
    angle: (i / count) * Math.PI * 2,
    major,
    length: major ? 0.050 : 0.029,
  });
}
/** Two-pass chamfer distance transform. `seedOnLand` picks which set is zero. */
function chamferField(seedOnLand) {
  decodeLandBits();
  const N = GLOBE_COLS * GLOBE_ROWS;
  const d = new Float32Array(N);
  const BIG = 1e6;
  for (let row = 0; row < GLOBE_ROWS; row += 1) {
    const { lat } = cellToLatLon(0, row);
    for (let column = 0; column < GLOBE_COLS; column += 1) {
      const { lon } = cellToLatLon(column, row);
      const land = isLandCell(column, row) && !isCanalWater(lat, lon);
      const seed = seedOnLand ? land : !land;
      d[row * GLOBE_COLS + column] = seed ? 0 : BIG;
    }
  }
  const D1 = 1;
  const D2 = Math.SQRT2;
  const wrap = (c) => ((c % GLOBE_COLS) + GLOBE_COLS) % GLOBE_COLS;
  for (let row = 0; row < GLOBE_ROWS; row += 1) {
    const base = row * GLOBE_COLS;
    const up = row > 0 ? (row - 1) * GLOBE_COLS : -1;
    for (let column = 0; column < GLOBE_COLS; column += 1) {
      const i = base + column;
      let v = d[i];
      if (v === 0) continue;
      const l = base + wrap(column - 1);
      if (d[l] + D1 < v) v = d[l] + D1;
      if (up >= 0) {
        const a = up + column;
        const b = up + wrap(column - 1);
        const c = up + wrap(column + 1);
        if (d[a] + D1 < v) v = d[a] + D1;
        if (d[b] + D2 < v) v = d[b] + D2;
        if (d[c] + D2 < v) v = d[c] + D2;
      }
      d[i] = v;
    }
  }
  for (let row = GLOBE_ROWS - 1; row >= 0; row -= 1) {
    const base = row * GLOBE_COLS;
    const dn = row < GLOBE_ROWS - 1 ? (row + 1) * GLOBE_COLS : -1;
    for (let column = GLOBE_COLS - 1; column >= 0; column -= 1) {
      const i = base + column;
      let v = d[i];
      if (v === 0) continue;
      const r = base + wrap(column + 1);
      if (d[r] + D1 < v) v = d[r] + D1;
      if (dn >= 0) {
        const a = dn + column;
        const b = dn + wrap(column - 1);
        const c = dn + wrap(column + 1);
        if (d[a] + D1 < v) v = d[a] + D1;
        if (d[b] + D2 < v) v = d[b] + D2;
        if (d[c] + D2 < v) v = d[c] + D2;
      }
      d[i] = v;
    }
  }
  return d;
}
/**
 * 1 hard on a coast, 0 in the deep. The ramp is a smoothstep between the two
 * shelf radii, so the shallow tint holds across the shelf and lets go over the
 * slope rather than falling off linearly from the beach.
 */
export function shelfWeightAt(column, row) {
  const d = coastDistanceCells();
  const v = d[row * GLOBE_COLS + column];
  if (!(v > 0)) return 1;
  if (v >= SHELF_CELLS_OUTER) return 0;
  const k = 1 - ((v - SHELF_CELLS_INNER) / (SHELF_CELLS_OUTER - SHELF_CELLS_INNER));
  const t = Math.min(1, Math.max(0, k));
  return t * t * (3 - 2 * t);
}

export function greatCircle(from, to, steps = 18) {
  const a = latLonToVector(from.lat, from.lon, 1);
  const b = latLonToVector(to.lat, to.lon, 1);
  const dot = Math.min(1, Math.max(-1, (a.x * b.x) + (a.y * b.y) + (a.z * b.z)));
  const angle = Math.acos(dot);
  const denominator = Math.sin(angle);
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const fromWeight = denominator > 0.00001 ? Math.sin((1 - t) * angle) / denominator : 1 - t;
    const toWeight = denominator > 0.00001 ? Math.sin(t * angle) / denominator : t;
    const x = (a.x * fromWeight) + (b.x * toWeight);
    const y = (a.y * fromWeight) + (b.y * toWeight);
    const z = (a.z * fromWeight) + (b.z * toWeight);
    const length = Math.hypot(x, y, z) || 1;
    const lat = Math.asin(Math.min(1, Math.max(-1, y / length))) * 180 / Math.PI;
    const lon = -Math.atan2(z, x) * 180 / Math.PI;
    points.push({ lat, lon });
  }
  return points;
}
