// District Deck — stamped shipping containers (P13 port logistics).
//
// Every container in the game carries the SAME pixel art the world map uses for
// the good (`item-icons.js`), stamped on both long faces, with the good's label.
// Textures are drawn once per good into a canvas and cached. Deterministic: no
// Math.random, no clock. Node-safe: without a DOM every factory returns painted
// hue materials so the headless fringe tests still build the port.
//
// Consumers:
//   fringe/port.js       — static yard stacks + ship deck stacks (per-good instanced meshes)
//   render/port/*        — animated containers on the crane, conveyor, trucks, wagons
//
// Container module. `fringe/port.js` BOX_W/BOX_H/BOX_D must equal these three
// numbers; `p13-port-layout.test.mjs` pins the equality.

import * as THREE from 'three';
import { createCityFringeMaterial } from '../materials.js';
function containerMaterial(params) {
  const material = createCityFringeMaterial(undefined, params, 'port/container-stamps.js');
  material.userData.citySurfaceFamily = 'paintedSteel';
  return material;
}
import { registerLodVersions } from '../lod.js';
import {
  CARGO_HUE,
  ITEM_LABEL,
  hasItemIcon,
  itemIconGrid,
} from '../../ui/world-map/item-icons.js';

/**
 * ── P16-PM4 — ONE SCALE. THIS IS THE ONLY PLACE THE MODULE IS TYPED. ──
 *
 * A 20 ft ISO container is 6.058 × 2.438 × 2.591 m. The venue draws it at
 * `CONTAINER_SCALE`, and every consumer — the yard cell pitch, the stack tier,
 * the ship's stow, the spreader, the conveyor slot, the truck bed, the straddle
 * clearance, the twist-locks, the corner castings and the texel density of the
 * stamps themselves — derives from the three numbers below rather than carrying
 * a literal of its own.
 *
 * The scale used to be per-axis and wrong: 0.4719 along, 0.5902 across, 0.5019
 * up (2.86 × 1.44 × 1.30). Read against the rest of the venue that made a
 * shipping container SHORTER THAN A HATCHBACK — a port worker measured 2.87 m
 * tall against the box he was standing beside, and a city car 7.86 m long. The
 * board's two other object classes are a person at 77 % of life
 * (`PROPORTIONS.height` = 1.353 m) and a car at life size (3.71 m). taste-r1 W8-E: the person is now the 1.70 m adult the
 * bible's scale law fixes (the port apron worker stands 1.67 m), so the box rose to 0.95: a 2.46 m box is 5.76 × 2.46 × 2.32 m,
 * a real one is 2.59 m high, and a worker is 68 % of it (it was 92 % of the 1.81 m box at 0.70). The stacks still read at the
 * play camera. The figure and the car do not move — the box does.
 */
// taste-r1 W8-E: 0.70 -> 0.95. A 1.70 m worker against a 2.46 m box is 69 % of it (a real 20 ft box is 2.59 m, so 66 %);
// at 0.70 the box was 1.81 m and the worker 92 % of it. The ship's cargo run is re-spaced in `ships.js` for the wider box.
export const CONTAINER_SCALE = 0.95;
const ISO_20FT = Object.freeze({ length: 6.058, width: 2.438, height: 2.591 });
/** Real metres of a 20 ft box on each venue axis, so the plant can quote specs. */
export const CONTAINER_REAL = ISO_20FT;
const round2 = (v) => Math.round(v * 100) / 100;
export const CONTAINER_BOX = Object.freeze({
  w: round2(ISO_20FT.length * CONTAINER_SCALE),   // 4.24 along
  h: round2(ISO_20FT.height * CONTAINER_SCALE),   // 1.81 up
  d: round2(ISO_20FT.width * CONTAINER_SCALE),    // 1.71 across
});
/** A 40 ft box is two modules end to end, and the venue says so out loud. */
export const CONTAINER_40FT_W = CONTAINER_BOX.w * 2;

/**
 * ── P16-PM4 item 4 — THE STAMPS ARE RE-RASTERISED, NOT STRETCHED. ──
 *
 * The art was drawn for a 256 × 116 canvas against the OLD face (2.86 × 1.30),
 * which is 89.5 texels per venue metre. Growing the box without growing the
 * raster would have thrown that away, and simply scaling the old bitmap would
 * have blurred pixel art. The raster is now DERIVED from the face at a fixed
 * texel density and every draw call is re-executed into it through a transform,
 * so the vector work (bands, stencil plate, label, weathering) is resampled at
 * the higher resolution and the 16 × 16 icon is laid down in whole device
 * pixels (see `drawIconGrid`).
 *
 * Isotropy is the property that matters and it holds to 0.2 %: the raster's
 * aspect follows the face's, so a circle drawn on the stamp is a circle on the
 * box. The old pair was 6 % anisotropic against a REAL container, because the
 * old module was not one scale.
 */
export const STAMP_TEXELS_PER_M = 90;
const q4 = (v) => Math.max(4, Math.round(v / 4) * 4);
const q2 = (v) => Math.max(2, Math.round(v / 2) * 2);
export const STAMP_TEX_W = q4(CONTAINER_BOX.w * STAMP_TEXELS_PER_M);
export const STAMP_TEX_H = q2(STAMP_TEX_W * CONTAINER_BOX.h / CONTAINER_BOX.w);
/** The canvas the stamp art was authored for. Every draw call is in these units. */
export const STAMP_DESIGN_W = 256;
export const STAMP_DESIGN_H = 116;
/** Icon pixels × this = stamp plate pixels, in DESIGN units. */
export const STAMP_ICON_SCALE = 4;
/**
 * The end face is `d × h` and the canvas is the LONG face's, so design pixels
 * are not square there. Multiply a height by this to get the width that reads
 * square on a container door.
 */
export const END_SQUEEZE = (
  (CONTAINER_BOX.h * STAMP_DESIGN_W) / (CONTAINER_BOX.d * STAMP_DESIGN_H)
);
export const END_CASTING_W = Math.round(17 * END_SQUEEZE);

/**
 * Goods that turn up as containers in the static yard and on the ship's deck.
 * Yard-class and warehouse-class containers only — no tank goods (oil / lng go
 * to the tank farm), no passengers.
 */
export const STAMP_YARD_GOODS = Object.freeze([
  'fittings', 'modular', 'furniture', 'tiles', 'timber', 'chips', 'robots',
  'food', 'biotech', 'coffee', 'copper', 'cocoa', 'autos', 'wine', 'machinery',
  'turbines', 'beer', 'compute', 'iron', 'lithium', 'steel', 'nickel', 'aluminium',
  'ceramics', 'castings', 'materials', 'pulp', 'paper', 'magnets', 'windings',
]);

const TEX_CACHE = new Map();
const MAT_CACHE = new Map();
const GEOM_CACHE = new Map();

function hasCanvas() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function hash32(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // FNV-1a alone barely moves the high bits for a one-character change
  // ("0:a:0" … "0:a:2" landed within 0.008 of each other), so finish with a
  // murmur3 avalanche before the value is scaled into an index.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Deterministic unit in [0,1) from a string key. */
export function stampUnit(key) {
  return hash32(String(key)) / 4294967296;
}

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl({ r, g, b }) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
  else if (max === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  return { h: h / 6, s, l };
}

function hslToRgb({ h, s, l }) {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t0) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: hue(h + 1 / 3) * 255, g: hue(h) * 255, b: hue(h - 1 / 3) * 255 };
}

/**
 * Container paint for a good: the world-map cargo hue, pulled into a paintable
 * band (lightness 0.36–0.54, saturation ≥ 0.42) so graphite does not become a
 * black box and platinum does not become a white one.
 */
export function containerPaintHex(good, variant = 0) {
  const base = CARGO_HUE[good] ?? '#6a5a48';
  const hsl = rgbToHsl(hexToRgb(base));
  // Variants: a shade darker (1) or lighter (2) than the canonical paint.
  hsl.l += variant === 1 ? -0.045 : variant === 2 ? 0.045 : 0;
  // Near-greys (graphite, platinum, aluminium) stay grey paint; only real hues
  // are pushed into the saturated band.
  const s = hsl.s < 0.2
    ? Math.max(0.05, Math.min(0.16, hsl.s))
    : Math.max(0.42, Math.min(0.82, hsl.s));
  const l = Math.max(0.36, Math.min(0.54, hsl.l));
  return rgbToHex(hslToRgb({ h: hsl.h, s, l }));
}

function shadeHex(hex, delta) {
  const hsl = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb({ h: hsl.h, s: hsl.s, l: Math.max(0, Math.min(1, hsl.l + delta)) }));
}

/** Sun-chalked paint: lighter AND desaturated (a roof that has faced the sky for years). */
function chalkHex(hex, lightDelta, satScale) {
  const hsl = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb({
    h: hsl.h,
    s: Math.max(0, Math.min(1, hsl.s * satScale)),
    l: Math.max(0, Math.min(1, hsl.l + lightDelta)),
  }));
}

export function stampLabel(good) {
  return String(ITEM_LABEL[good] ?? good).toUpperCase();
}

/**
 * ── P16-PM4 item 4 — RE-RASTERISE, NEVER STRETCH. ──
 *
 * Every `draw*` below is written in DESIGN units (256 × 116). The canvas is the
 * size the container module asks for, so the context is scaled once and the
 * whole drawing is re-executed at the new density: bands, plates, glyphs and
 * gradients come out resampled, not blown up. Node's recording stub in
 * `p13-port-layout` has no `setTransform`, and there design units are device
 * units, which is what its rect assertions read.
 */
function scaleToTexture(context) {
  if (typeof context.setTransform !== 'function') return false;
  context.setTransform(STAMP_TEX_W / STAMP_DESIGN_W, 0, 0, STAMP_TEX_H / STAMP_DESIGN_H, 0, 0);
  return true;
}

/**
 * The good's icon is PIXEL ART and the rest of the stamp is not, so it is the
 * one thing that must not go through a fractional transform: a 4 px cell at
 * ×1.41 lands on half-pixels and the canvas antialiases the grid into mush.
 * Laid down in whole DEVICE pixels, centred on the stencil plate, at the
 * largest integer cell the raster can carry — the world-map icon parity law is
 * about the grid, and the grid is untouched.
 */
function drawIconGrid(context, good, plateX, plateY, plateW, plateH) {
  const grid = itemIconGrid(hasItemIcon(good) ? good : 'modular');
  const rows = grid.length || 16;
  const cols = grid[0]?.length ?? rows;
  const canTransform = typeof context.setTransform === 'function';
  const sx = canTransform ? STAMP_TEX_W / STAMP_DESIGN_W : 1;
  const sy = canTransform ? STAMP_TEX_H / STAMP_DESIGN_H : 1;
  const cell = Math.max(1, Math.round(STAMP_ICON_SCALE * Math.min(sx, sy)));
  const ox = Math.round((plateX + plateW * 0.5) * sx - cols * cell * 0.5);
  const oy = Math.round((plateY + plateH * 0.5) * sy - rows * cell * 0.5);
  if (canTransform) context.setTransform(1, 0, 0, 1, 0, 0);
  for (let y = 0; y < rows; y += 1) {
    const row = grid[y];
    for (let x = 0; x < row.length; x += 1) {
      if (!row[x]) continue;
      context.fillStyle = row[x];
      context.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    }
  }
  if (canTransform) scaleToTexture(context);
}

/**
 * Draw the long-face stamp: corrugated paint field, a bone stencil plate with
 * the 16×16 pixel icon at ×4, the label in stencil caps, a corner-post band,
 * and seeded rust specks so no two goods weather identically.
 */
function drawStamp(context, good, W, H, variant = 0) {
  // Per-variant wear key: three boxes of one good never share a weathering map.
  const wearKey = variant ? `${good}#${variant}` : good;
  const paint = containerPaintHex(good, variant);
  const dark = shadeHex(paint, -0.12);
  const light = shadeHex(paint, 0.08);
  const ink = '#14120f';
  const bone = '#ece6da';
  context.imageSmoothingEnabled = false;
  context.fillStyle = paint;
  context.fillRect(0, 0, W, H);
  // Corrugation: vertical ribs on a per-variant pitch, one dark and one light edge.
  const pitch = variant === 1 ? 6 : variant === 2 ? 10 : 8;
  for (let x = 0; x < W; x += pitch) {
    context.fillStyle = dark;
    context.fillRect(x, 0, 2, H);
    context.fillStyle = light;
    context.fillRect(x + 4, 0, 1, H);
  }
  // Corner posts and rails.
  context.fillStyle = ink;
  context.fillRect(0, 0, 6, H);
  context.fillRect(W - 6, 0, 6, H);
  context.fillRect(0, 0, W, 5);
  context.fillRect(0, H - 5, W, 5);
  // Stencil plate for the icon.
  const iconPx = 16 * STAMP_ICON_SCALE;
  const plateW = iconPx + 12;
  const plateH = iconPx + 12;
  const plateX = 22;
  const plateY = Math.floor((H - plateH) / 2);
  context.fillStyle = bone;
  context.fillRect(plateX, plateY, plateW, plateH);
  context.fillStyle = ink;
  context.fillRect(plateX, plateY, plateW, 2);
  context.fillRect(plateX, plateY + plateH - 2, plateW, 2);
  context.fillRect(plateX, plateY, 2, plateH);
  context.fillRect(plateX + plateW - 2, plateY, 2, plateH);
  drawIconGrid(context, good, plateX, plateY, plateW, plateH);
  // Label in stencil caps to the right of the plate.
  const label = stampLabel(good);
  const textX = plateX + plateW + 12;
  const maxTextW = W - textX - 14;
  let size = 26;
  context.font = `900 ${size}px "Menlo", "Courier New", monospace`;
  while (size > 12 && context.measureText(label).width > maxTextW) {
    size -= 2;
    context.font = `900 ${size}px "Menlo", "Courier New", monospace`;
  }
  context.textBaseline = 'middle';
  context.textAlign = 'left';
  context.fillStyle = ink;
  context.fillText(label, textX + 2, H * 0.5 + 2);
  context.fillStyle = bone;
  context.fillText(label, textX, H * 0.5);
  // A small owner code under the label, the way real boxes carry one.
  context.font = '700 11px "Menlo", "Courier New", monospace';
  context.fillStyle = bone;
  const code = `PMB ${String(hash32(good) % 900000 + 100000)}`;
  context.fillText(code, textX, H * 0.5 + Math.max(14, size * 0.72));
  // ── Weathering (critic R1: "clean matte blocks"). Every box ages differently,
  // seeded by the good so a yard of the same good still varies by instance
  // through the per-good hue, not by texture — and no two goods share a wear map.
  const age = stampUnit(`${wearKey}:age`);
  // Faded / repainted panels. R5 fault 4: at native size the old 6–14 % panels vanished,
  // so they are now MACRO wear — three to five panels up to a third of the face, at
  // 14–32 % opacity, so a stack reads as individually weathered steel at board distance.
  const panels = 3 + Math.floor(stampUnit(`${wearKey}:panels`) * 3);
  for (let i = 0; i < panels; i += 1) {
    const kx = stampUnit(`${wearKey}:panel:x:${i}`);
    const ky = stampUnit(`${wearKey}:panel:y:${i}`);
    const kw = stampUnit(`${wearKey}:panel:w:${i}`);
    const kd = stampUnit(`${wearKey}:panel:d:${i}`);
    const px = 6 + Math.floor(kx * (W - 90));
    const py = 4 + Math.floor(ky * (H - 40));
    const pw = 34 + Math.floor(kw * 80);
    const ph = 16 + Math.floor(kd * 36);
    context.fillStyle = kd > 0.5
      ? `rgba(255, 244, 220, ${0.14 + age * 0.14})`
      : `rgba(20, 16, 12, ${0.14 + age * 0.18})`;
    context.fillRect(px, py, pw, ph);
  }
  // Rust weeps from the top rail and the corner castings.
  const weeps = 4 + Math.floor(age * 6);
  for (let i = 0; i < weeps; i += 1) {
    const kx = stampUnit(`${wearKey}:weep:x:${i}`);
    const kl = stampUnit(`${wearKey}:weep:l:${i}`);
    const wx = 10 + Math.floor(kx * (W - 20));
    const wl = 6 + Math.floor(kl * (H * 0.5 * (0.4 + age)));
    context.fillStyle = `rgba(96, 52, 24, ${0.28 + age * 0.3})`;
    context.fillRect(wx, 5, 1 + Math.floor(kl * 2), wl);
    context.fillStyle = `rgba(150, 82, 36, ${0.18 + age * 0.2})`;
    context.fillRect(wx + 1, 5, 1, Math.floor(wl * 0.6));
  }
  // Dust and scuff band along the bottom, deeper on older boxes.
  const dustH = 12 + Math.floor(age * 18);
  const dust = context.createLinearGradient(0, H - dustH, 0, H - 4);
  dust.addColorStop(0, 'rgba(70, 58, 42, 0)');
  dust.addColorStop(1, `rgba(70, 58, 42, ${0.38 + age * 0.4})`);
  context.fillStyle = dust;
  context.fillRect(4, H - dustH, W - 8, dustH - 4);
  // Seeded rust specks along the bottom rail and one door-side streak.
  const specks = 14 + Math.floor(age * 12);
  for (let i = 0; i < specks; i += 1) {
    const k = stampUnit(`${wearKey}:speck:${i}`);
    const k2 = stampUnit(`${wearKey}:speck2:${i}`);
    const sx = 8 + k * (W - 16);
    const sy = H - 6 - k2 * 9;
    context.fillStyle = k > 0.5 ? '#6b3a1e' : '#4a2a16';
    context.fillRect(Math.floor(sx), Math.floor(sy), 2 + Math.floor(k2 * 3), 1 + Math.floor(k * 2));
  }
  const streakX = W - 22 + Math.floor(stampUnit(`${wearKey}:streak`) * 8);
  context.fillStyle = 'rgba(88, 48, 24, 0.55)';
  context.fillRect(streakX, 8, 2, Math.floor(H * 0.42));
}

/**
 * ── P13-A10 item 5 — THE END FACE. ──
 *
 * MC3 fault 11: "container ends and roofs still collapse into pastel blocks at
 * native scale", and the brief's note is blunter — "the container ends are
 * unchanged". They were. `stampedContainerMaterials` gave the ±x faces a flat
 * shaded colour and a roughness map, and `drawRoughness`'s `end` branch drew
 * the locking bars into the SPECULAR only, so under this venue's low key the
 * door hardware existed and could not be seen. An end face with no albedo is a
 * pastel block by construction.
 *
 * This is the albedo it was missing: two door leaves at different values with a
 * seam between them, four locking bars each with its own shadow line, the four
 * corner castings, the top and bottom rails, and the owner code + serial the
 * doors of a real box carry. Everything here is drawn at the SAME fractions of
 * W the roughness map uses (bars at 0.30 / 0.48 / 0.62) so albedo and specular
 * describe one object.
 *
 * The canvas is the long face's, and the END is a different shape, so texture
 * space is squeezed horizontally: a design pixel is `d / DESIGN_W` metres across
 * and `h / DESIGN_H` metres up. Anything that must read SQUARE on the box is
 * drawn `END_SQUEEZE` times wider than it is tall, and the stencil is condensed,
 * which is what a real door stencil looks like anyway. It was a typed 2:1 (right
 * for the old 1.44 × 1.30 face, 18 % wrong for this one); it is derived now.
 *
 * The macro terms (leaf split, seam, castings, bottom rail) are the ones that
 * survive mipping at board distance; that is the half of fault 11 that matters.
 */
function drawEndStamp(context, good, W, H, variant = 0) {
  const boxKey = variant ? `${good}#${variant}` : good;
  const wearKey = `${boxKey}:end`;
  const age = stampUnit(`${boxKey}:age`);
  const paint = containerPaintHex(good, variant);
  // The end sits a clear step darker than the field — BA2 fault 11's macro
  // separation — and the two leaves differ from each other so the doors read as
  // two panels and not one plate.
  const doorBase = shadeHex(paint, -0.16 - age * 0.05);
  const leafL = shadeHex(doorBase, 0.035);
  const leafR = shadeHex(doorBase, -0.045);
  const ink = '#14120f';
  const bone = '#ece6da';
  const steel = shadeHex(doorBase, -0.3);
  context.imageSmoothingEnabled = false;
  context.fillStyle = doorBase;
  context.fillRect(0, 0, W, H);
  const seamX = Math.floor(W * 0.48);
  context.fillStyle = leafL;
  context.fillRect(0, 0, seamX, H);
  context.fillStyle = leafR;
  context.fillRect(seamX, 0, W - seamX, H);
  // Shallow door corrugation: the leaves are pressed, not flat.
  const pitch = variant === 1 ? 14 : variant === 2 ? 20 : 17;
  for (let x = 6; x < W - 6; x += pitch) {
    context.fillStyle = shadeHex(doorBase, -0.07);
    context.fillRect(x, 8, 2, H - 16);
    context.fillStyle = shadeHex(doorBase, 0.05);
    context.fillRect(x + 3, 8, 1, H - 16);
  }
  // Corner posts, top rail, bottom rail — the frame the doors hang in.
  context.fillStyle = ink;
  context.fillRect(0, 0, 9, H);
  context.fillRect(W - 9, 0, 9, H);
  context.fillRect(0, 0, W, 6);
  context.fillRect(0, H - 7, W, 7);
  // The centre seam: a dark gap with a light catch on the leading leaf's edge.
  context.fillStyle = ink;
  context.fillRect(seamX - 2, 6, 5, H - 13);
  context.fillStyle = shadeHex(doorBase, 0.14);
  context.fillRect(seamX + 3, 6, 2, H - 13);
  // ── Locking bars. Four of them, two per leaf, each with the shadow it throws
  // on the door behind it — which is the whole reason the bars were invisible.
  const barXs = [0.16, 0.30, 0.62, 0.80].map((f) => Math.floor(W * f));
  for (const bx of barXs) {
    context.fillStyle = 'rgba(12,10,8,0.5)';
    context.fillRect(bx + 5, 10, 5, H - 22);
    context.fillStyle = steel;
    context.fillRect(bx, 9, 5, H - 20);
    context.fillStyle = shadeHex(steel, 0.22);
    context.fillRect(bx, 9, 2, H - 20);
    // Cam keepers top and bottom, and the handle with its retainer at mid height.
    context.fillStyle = ink;
    context.fillRect(bx - 3, 14, 11, 7);
    context.fillRect(bx - 3, H - 24, 11, 7);
    context.fillStyle = steel;
    context.fillRect(bx - 8, Math.floor(H * 0.46), 18, 6);
    context.fillStyle = 'rgba(12,10,8,0.45)';
    context.fillRect(bx - 8, Math.floor(H * 0.46) + 6, 18, 3);
  }
  // ── Corner castings, stretched by `END_SQUEEZE` so they read SQUARE on the box.
  const cw = END_CASTING_W;
  for (const cx of [0, W - cw]) {
    for (const cy of [0, H - 17]) {
      context.fillStyle = ink;
      context.fillRect(cx, cy, cw, 17);
      context.fillStyle = shadeHex(doorBase, -0.34);
      context.fillRect(cx + 3, cy + 3, cw - 6, 11);
      // The oval hole every casting carries, and a light catch on its lip.
      context.fillStyle = '#0b0a09';
      context.fillRect(cx + Math.round(cw * 0.35), cy + 6, Math.round(cw * 0.32), 5);
      context.fillStyle = 'rgba(236,230,218,0.35)';
      context.fillRect(cx + 12, cy + 5, 11, 1);
    }
  }
  // ── Owner code, serial and check digit, then the size/type code under it.
  // A real box carries these on the right-hand door leaf, stencilled.
  const owner = 'PMBU';
  const serial = String(hash32(`${boxKey}:serial`) % 900000 + 100000);
  const check = String(hash32(`${boxKey}:check`) % 10);
  const stencilX = seamX + 12;
  context.font = '900 17px "Menlo", "Courier New", monospace';
  context.textBaseline = 'middle';
  context.textAlign = 'left';
  context.fillStyle = 'rgba(12,10,8,0.75)';
  context.fillText(`${owner} ${serial} ${check}`, stencilX + 1, H * 0.30 + 1);
  context.fillStyle = bone;
  context.fillText(`${owner} ${serial} ${check}`, stencilX, H * 0.30);
  context.font = '700 12px "Menlo", "Courier New", monospace';
  context.fillStyle = bone;
  context.fillText('22G1  MAX 30480 KG', stencilX, H * 0.30 + 15);
  // A consignee plate on the left leaf, the way a box carries its label holder.
  context.fillStyle = bone;
  context.fillRect(14, Math.floor(H * 0.62), 46, 22);
  context.fillStyle = ink;
  context.fillRect(14, Math.floor(H * 0.62), 46, 2);
  context.fillRect(14, Math.floor(H * 0.62) + 20, 46, 2);
  for (let i = 0; i < 3; i += 1) {
    context.fillStyle = 'rgba(20,18,15,0.55)';
    context.fillRect(18, Math.floor(H * 0.62) + 5 + i * 5, 38 - i * 9, 2);
  }
  // ── Weathering, keyed to `:end` so the doors never share the sides' map.
  const panels = 2 + Math.floor(stampUnit(`${wearKey}:panels`) * 3);
  for (let i = 0; i < panels; i += 1) {
    const kx = stampUnit(`${wearKey}:panel:x:${i}`);
    const ky = stampUnit(`${wearKey}:panel:y:${i}`);
    const kw = stampUnit(`${wearKey}:panel:w:${i}`);
    const kd = stampUnit(`${wearKey}:panel:d:${i}`);
    context.fillStyle = kd > 0.5
      ? `rgba(255, 244, 220, ${0.12 + age * 0.12})`
      : `rgba(20, 16, 12, ${0.12 + age * 0.16})`;
    context.fillRect(10 + Math.floor(kx * (W - 70)), 8 + Math.floor(ky * (H - 34)),
      26 + Math.floor(kw * 52), 12 + Math.floor(kd * 30));
  }
  // Rust weeps from the castings and the cam keepers — doors rust first.
  const weeps = 5 + Math.floor(age * 7);
  for (let i = 0; i < weeps; i += 1) {
    const kx = stampUnit(`${wearKey}:weep:x:${i}`);
    const kl = stampUnit(`${wearKey}:weep:l:${i}`);
    const wx = 12 + Math.floor(kx * (W - 24));
    const wl = 8 + Math.floor(kl * (H * 0.55 * (0.4 + age)));
    context.fillStyle = `rgba(96, 52, 24, ${0.3 + age * 0.3})`;
    context.fillRect(wx, 6, 1 + Math.floor(kl * 2), wl);
    context.fillStyle = `rgba(150, 82, 36, ${0.2 + age * 0.2})`;
    context.fillRect(wx + 1, 6, 1, Math.floor(wl * 0.6));
  }
  const dustH = 12 + Math.floor(age * 16);
  const dust = context.createLinearGradient(0, H - dustH, 0, H - 6);
  dust.addColorStop(0, 'rgba(70, 58, 42, 0)');
  dust.addColorStop(1, `rgba(70, 58, 42, ${0.4 + age * 0.36})`);
  context.fillStyle = dust;
  context.fillRect(9, H - dustH, W - 18, dustH - 6);
}

const END_CACHE = new Map();

/** Cached door-face texture for a good, or null without a DOM. */
export function stampEndTexture(good, variant = 0) {
  if (!hasCanvas()) return null;
  const key = variant ? `${good}#${variant}` : String(good);
  if (END_CACHE.has(key)) return END_CACHE.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = STAMP_TEX_W;
  canvas.height = STAMP_TEX_H;
  const context = canvas.getContext('2d');
  if (!context) {
    END_CACHE.set(key, null);
    return null;
  }
  scaleToTexture(context);
  drawEndStamp(context, String(good), STAMP_DESIGN_W, STAMP_DESIGN_H, variant);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  END_CACHE.set(key, texture);
  return texture;
}

/**
 * Roughness map for the long faces: MeshStandardMaterial multiplies
 * `roughness` by the map's green channel, so fresh paint (darker = smoother)
 * and rust / dust (lighter = rougher) break the specular the way the critic
 * asked — one flat lambert response across a box is the tell.
 */
function drawRoughness(context, good, W, H, variant = 0, face = 'side') {
  const boxKey = variant ? `${good}#${variant}` : good;
  // One age per box (shared by every face), but the panels, weeps and dust
  // are keyed per face so the top, the doors and the long sides never share
  // one specular (R3 fault 8: "a family of 90° boxes with one roughness").
  const wearKey = face === 'side' ? boxKey : `${boxKey}:${face}`;
  const age = stampUnit(`${boxKey}:age`);
  // Wider range than the first pass (BA1 fault 8: cargo "uniformly clean"): a
  // fresh box sits near 0.45 roughness, an old one near 0.9, and the panels /
  // weeps / dust below swing ±0.25 around that. Tops collect dust and sun
  // chalking, so they sit a step rougher than the sides.
  const base = Math.round(118 + age * 88) + (face === 'top' ? 18 : 0);
  context.fillStyle = `rgb(${base},${base},${base})`;
  context.fillRect(0, 0, W, H);
  // Corrugation valleys hold dust: slightly rougher stripes (tops are flat
  // plate with a few cross-members instead).
  const pitch = face === 'top' ? 24 : 8;
  for (let x = 0; x < W; x += pitch) {
    context.fillStyle = `rgb(${base + 22},${base + 22},${base + 22})`;
    context.fillRect(x, 0, 2, H);
  }
  // Fresh / repainted panels are smoother.
  const panels = 2 + Math.floor(stampUnit(`${wearKey}:panels`) * 3);
  for (let i = 0; i < panels; i += 1) {
    const kx = stampUnit(`${wearKey}:panel:x:${i}`);
    const ky = stampUnit(`${wearKey}:panel:y:${i}`);
    const kw = stampUnit(`${wearKey}:panel:w:${i}`);
    const kd = stampUnit(`${wearKey}:panel:d:${i}`);
    // R4 fault 10: adjacent faces still shared one specular — the repainted panels
    // now sit far smoother (−85) and the chalked ones far rougher (+48) than the base.
    const v = kd > 0.5 ? base - 85 : base + 48;
    context.fillStyle = `rgb(${v},${v},${v})`;
    context.fillRect(8 + Math.floor(kx * (W - 60)), 6 + Math.floor(ky * (H - 30)),
      16 + Math.floor(kw * 40), 10 + Math.floor(kd * 24));
  }
  // Rust weeps and the dust band are rough.
  const weeps = 4 + Math.floor(age * 6);
  for (let i = 0; i < weeps; i += 1) {
    const kx = stampUnit(`${wearKey}:weep:x:${i}`);
    const kl = stampUnit(`${wearKey}:weep:l:${i}`);
    context.fillStyle = 'rgb(235,235,235)';
    context.fillRect(10 + Math.floor(kx * (W - 20)), 5, 2, 6 + Math.floor(kl * (H * 0.5 * (0.4 + age))));
  }
  const dustH = 6 + Math.floor(age * 10);
  context.fillStyle = 'rgb(225,225,225)';
  context.fillRect(4, H - dustH, W - 8, dustH - 4);
  if (face === 'side') {
    // The stencil plate is smooth enamel.
    const iconPx = 16 * STAMP_ICON_SCALE;
    context.fillStyle = 'rgb(95,95,95)';
    context.fillRect(22, Math.floor((H - iconPx - 12) / 2), iconPx + 12, iconPx + 12);
  } else if (face === 'end') {
    // Door hardware: two smooth locking bars and the hinge line.
    context.fillStyle = 'rgb(88,88,88)';
    context.fillRect(Math.floor(W * 0.30), 4, 4, H - 8);
    context.fillRect(Math.floor(W * 0.62), 4, 4, H - 8);
    context.fillRect(Math.floor(W * 0.48), 4, 2, H - 8);
  } else {
    // Roof: a pooled-water stain (smooth) and a scuffed lifting-lug corner (rough).
    const px = stampUnit(`${wearKey}:pool:x`);
    context.fillStyle = 'rgb(105,105,105)';
    context.fillRect(20 + Math.floor(px * (W - 90)), Math.floor(H * 0.35), 48, Math.floor(H * 0.3));
    context.fillStyle = 'rgb(240,240,240)';
    context.fillRect(W - 24, 4, 18, 12);
  }
}

const ROUGH_CACHE = new Map();

/** Cached roughness map for one face family of a good, or null without a DOM. */
export function stampRoughnessTexture(good, variant = 0, face = 'side') {
  if (!hasCanvas()) return null;
  const key = `${variant ? `${good}#${variant}` : String(good)}${face === 'side' ? '' : `:${face}`}`;
  if (ROUGH_CACHE.has(key)) return ROUGH_CACHE.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = STAMP_TEX_W;
  canvas.height = STAMP_TEX_H;
  const context = canvas.getContext('2d');
  if (!context) {
    ROUGH_CACHE.set(key, null);
    return null;
  }
  scaleToTexture(context);
  drawRoughness(context, String(good), STAMP_DESIGN_W, STAMP_DESIGN_H, variant, face);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  ROUGH_CACHE.set(key, texture);
  return texture;
}

/** Cached long-face stamp texture for a good, or null without a DOM. */
export function stampTexture(good, variant = 0) {
  if (!hasCanvas()) return null;
  const key = variant ? `${good}#${variant}` : String(good);
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = STAMP_TEX_W;
  canvas.height = STAMP_TEX_H;
  const context = canvas.getContext('2d');
  if (!context) {
    TEX_CACHE.set(key, null);
    return null;
  }
  scaleToTexture(context);
  drawStamp(context, String(good), STAMP_DESIGN_W, STAMP_DESIGN_H, variant);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  TEX_CACHE.set(key, texture);
  return texture;
}

/**
 * Six materials for a `stampedBoxGeometry` box, in BoxGeometry group order:
 * +x, −x (the ends), +y, −y, +z, −z (the long stamped faces).
 * Ends carry the door bars' dark paint; top and bottom are the field paint.
 */
export function stampedContainerMaterials(good, { normalMap = null, variant = 0 } = {}) {
  const key = `${good}#${variant}|${normalMap ? normalMap.uuid : 'plain'}`;
  if (MAT_CACHE.has(key)) return MAT_CACHE.get(key);
  const paint = containerPaintHex(good, variant);
  const texture = stampTexture(good, variant);
  const roughnessMap = stampRoughnessTexture(good, variant);
  const endRoughnessMap = stampRoughnessTexture(good, variant, 'end');
  const topRoughnessMap = stampRoughnessTexture(good, variant, 'top');
  const wearKey = variant ? `${good}#${variant}` : good;
  // Seeded per-good finish: older boxes are rougher and slightly chalkier so a
  // stack never reads as one lambert response (critic R1, material depth).
  const age = stampUnit(`${wearKey}:age`);
  const baseRough = 0.5 + age * 0.22;
  const field = containerMaterial({
    color: paint, roughness: baseRough, metalness: 0.12, normalMap,
  });
  field.name = `container-field:${good}`;
  // Doors and roof carry their own wear maps (R3 fault 8): with a map the
  // scalar roughness is a multiplier, so it sits at 1.0 and the map carries
  // the range; without a DOM the scalar fallback keeps the old per-face steps.
  // BA2 fault 11: at board distance the wear maps are subpixel, so the faces need
  // MACRO value separation — doors a clear step darker, the roof darker still
  // (sun-chalked and dusty), so a stack reads as boxes, not coloured blocks.
  // P13-A10 item 5: with a door texture the colour goes to white and the map
  // carries the paint, exactly as the long faces already do; without a DOM the
  // old shaded-colour fallback stands so the headless fringe tests are unmoved.
  const endTexture = stampEndTexture(good, variant);
  const end = endTexture
    ? containerMaterial({
      color: 0xffffff,
      map: endTexture,
      roughnessMap: endRoughnessMap,
      roughness: endRoughnessMap ? 1.0 : baseRough + 0.06,
      metalness: 0.1,
      // The corrugation normal stays: it also dresses the chamfer strips, which
      // take the end group, and on a door it reads as the leaf's own pressing.
      normalMap,
    })
    : containerMaterial({
      color: shadeHex(paint, -0.16 - age * 0.05),
      roughnessMap: endRoughnessMap,
      roughness: endRoughnessMap ? 1.0 : baseRough + 0.06,
      metalness: 0.1,
      normalMap,
    });
  end.name = `container-end:${good}`;
  // The roof faces the sky: under this low key it rendered as a dark slate slab whether
  // it was shaded darker or not, so it now reads as chalked paint — lighter and
  // desaturated with age — which also separates it from the doors at board distance.
  const top = containerMaterial({
    color: chalkHex(paint, 0.10 + age * 0.08, 0.55 - age * 0.2),
    roughnessMap: topRoughnessMap,
    roughness: topRoughnessMap ? 1.0 : baseRough + 0.1,
    metalness: 0.08,
    normalMap,
  });
  top.name = `container-top:${good}`;
  const side = texture
    ? containerMaterial({
      color: 0xffffff,
      map: texture,
      roughnessMap,
      // With a roughness map the scalar is a multiplier; 1.0 lets the map
      // carry the 0.35–0.85 range drawn in `drawRoughness`.
      roughness: roughnessMap ? 1.0 : baseRough,
      metalness: 0.12,
    })
    : field;
  side.name = `container-stamp:${good}`;
  const materials = [end, end, top, top, side, side];
  MAT_CACHE.set(key, materials);
  return materials;
}

/** BoxGeometry with the six face groups intact (cached per size). */
// R6 fault 9: at native size a 5.5 cm chamfer vanished; 9 cm reads as a rolled edge on the
// crane-close plate without the boxes losing their proportions.
export function stampedBoxGeometry(w = CONTAINER_BOX.w, h = CONTAINER_BOX.h, d = CONTAINER_BOX.d, chamfer = 0.09) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${chamfer.toFixed(3)}`;
  if (GEOM_CACHE.has(key)) return GEOM_CACHE.get(key);
  const geometry = chamferedStampBox(w, h, d, chamfer);
  GEOM_CACHE.set(key, geometry);
  return geometry;
}

/** Fixed yard bodies only: adjacent faces with the same material share one draw.
 * Keep the six-slot material array and the general-purpose geometry untouched.
 * The independent buffer copy belongs to the existing stamp cache/disposer.
 */
export function stampedYardGeometry(materials, w = CONTAINER_BOX.w, h = CONTAINER_BOX.h, d = CONTAINER_BOX.d) {
  const source = stampedBoxGeometry(w, h, d);
  if (!Array.isArray(materials) || materials.length !== 6
    || materials.some(material => !material || material.transparent)) return source;
  const groups = [];
  for (const group of source.groups) {
    const previous = groups.at(-1);
    if (previous && previous.start + previous.count === group.start
      && materials[previous.materialIndex] === materials[group.materialIndex]) previous.count += group.count;
    else groups.push({ ...group });
  }
  if (groups.length === source.groups.length) return source;
  const key = `yard:${source.uuid}:${groups.map(group => `${group.start},${group.count},${group.materialIndex}`).join('|')}`;
  if (GEOM_CACHE.has(key)) return GEOM_CACHE.get(key);
  const geometry = source.clone();
  geometry.clearGroups();
  for (const group of groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  GEOM_CACHE.set(key, geometry);
  return geometry;
}

/**
 * A box with every edge cut (critic R2 fault 10: "raw ninety-degree container
 * bodies"), keeping BoxGeometry's SIX material groups in the same order
 * (+x, −x, +y, −y, +z, −z) so `stampedContainerMaterials` still maps the stamp
 * onto the two long faces. The bevel strips and corner triangles take the end /
 * top groups, never the stamped ones, so the pixel art stays on flat panels.
 * Face UVs match BoxGeometry's orientation (the −z face reads right from outside).
 */
function chamferedStampBox(w, h, d, chamferIn) {
  const c = Math.max(0.004, Math.min(chamferIn, w * 0.2, h * 0.2, d * 0.2));
  const hx = w / 2; const hy = h / 2; const hz = d / 2;
  const ix = hx - c; const iy = hy - c; const iz = hz - c;
  const positions = [];
  const normals = [];
  const uvs = [];
  const groups = []; // {start, count, materialIndex}
  let cursor = 0;
  const begin = () => cursor;
  const end = (start, materialIndex) => {
    const count = cursor - start;
    if (count > 0) groups.push({ start, count, materialIndex });
  };
  const tri = (a, b, cc, n, ua, ub, uc) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], cc[0], cc[1], cc[2]);
    normals.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
    uvs.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    cursor += 3;
  };
  const quad = (p0, p1, p2, p3, n, u0, u1, u2, u3) => {
    tri(p0, p1, p2, n, u0, u1, u2);
    tri(p0, p2, p3, n, u0, u2, u3);
  };
  const norm = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  // Main inset faces, BoxGeometry order and UV orientation.
  let s = begin();
  quad([hx, -iy, iz], [hx, -iy, -iz], [hx, iy, -iz], [hx, iy, iz], [1, 0, 0],
    [0, 0], [1, 0], [1, 1], [0, 1]);
  end(s, 0);
  s = begin();
  quad([-hx, -iy, -iz], [-hx, -iy, iz], [-hx, iy, iz], [-hx, iy, -iz], [-1, 0, 0],
    [0, 0], [1, 0], [1, 1], [0, 1]);
  end(s, 1);
  s = begin();
  quad([-ix, hy, iz], [ix, hy, iz], [ix, hy, -iz], [-ix, hy, -iz], [0, 1, 0],
    [0, 0], [1, 0], [1, 1], [0, 1]);
  end(s, 2);
  s = begin();
  quad([-ix, -hy, -iz], [ix, -hy, -iz], [ix, -hy, iz], [-ix, -hy, iz], [0, -1, 0],
    [0, 0], [1, 0], [1, 1], [0, 1]);
  end(s, 3);
  s = begin();
  // +z: u grows with +x, v with +y (BoxGeometry convention).
  quad([-ix, -iy, hz], [ix, -iy, hz], [ix, iy, hz], [-ix, iy, hz], [0, 0, 1],
    [0, 0], [1, 0], [1, 1], [0, 1]);
  end(s, 4);
  s = begin();
  // −z: u grows with −x so the stamp reads right from outside.
  quad([ix, -iy, -hz], [-ix, -iy, -hz], [-ix, iy, -hz], [ix, iy, -hz], [0, 0, -1],
    [0, 0], [1, 0], [1, 1], [0, 1]);
  end(s, 5);
  // Bevel strips: twelve edges. Each strip joins two inset faces; its normal is the
  // average of the two face normals. Strips take the end (±x) or top/bottom (±y)
  // group — never a stamped ±z group.
  const edgeUv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const strip = (p0, p1, p2, p3, n, materialIndex) => {
    const st = begin();
    quad(p0, p1, p2, p3, norm(n), ...edgeUv);
    end(st, materialIndex);
  };
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      // Edges along Z between an x face and a y face → top/bottom group.
      const mi = sy > 0 ? 2 : 3;
      const a = [sx * hx, sy * iy, iz]; const b = [sx * hx, sy * iy, -iz];
      const cc = [sx * ix, sy * hy, -iz]; const dd = [sx * ix, sy * hy, iz];
      if (sx * sy > 0) strip(a, b, cc, dd, [sx, sy, 0], mi);
      else strip(b, a, dd, cc, [sx, sy, 0], mi);
    }
    for (const sz of [1, -1]) {
      // Edges along Y between an x face and a z face → end group.
      const mi = sx > 0 ? 0 : 1;
      const a = [sx * hx, -iy, sz * iz]; const b = [sx * hx, iy, sz * iz];
      const cc = [sx * ix, iy, sz * hz]; const dd = [sx * ix, -iy, sz * hz];
      if (sx * sz > 0) strip(a, b, cc, dd, [sx, 0, sz], mi);
      else strip(b, a, dd, cc, [sx, 0, sz], mi);
    }
  }
  for (const sy of [1, -1]) {
    for (const sz of [1, -1]) {
      // Edges along X between a y face and a z face → top/bottom group.
      const mi = sy > 0 ? 2 : 3;
      const a = [-ix, sy * hy, sz * iz]; const b = [ix, sy * hy, sz * iz];
      const cc = [ix, sy * iy, sz * hz]; const dd = [-ix, sy * iy, sz * hz];
      if (sy * sz > 0) strip(b, a, dd, cc, [0, sy, sz], mi);
      else strip(a, b, cc, dd, [0, sy, sz], mi);
    }
  }
  // Corner triangles: eight, joining the three strips that meet at each corner.
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      for (const sz of [1, -1]) {
        const st = begin();
        const px = [sx * hx, sy * iy, sz * iz];
        const py = [sx * ix, sy * hy, sz * iz];
        const pz = [sx * ix, sy * iy, sz * hz];
        const n = norm([sx, sy, sz]);
        // Wind outward: use the sign product to pick the orientation.
        if (sx * sy * sz > 0) tri(px, py, pz, n, [0, 0], [1, 0], [0, 1]);
        else tri(px, pz, py, n, [0, 0], [1, 0], [0, 1]);
        end(st, sy > 0 ? 2 : 3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // Merge same-material runs into BoxGeometry-style groups (six, in order).
  const merged = new Map();
  for (const g of groups) {
    if (!merged.has(g.materialIndex)) merged.set(g.materialIndex, []);
    merged.get(g.materialIndex).push(g);
  }
  // Groups must be contiguous ranges; re-pack the vertex buffers by material.
  const order = [];
  for (let mi = 0; mi < 6; mi += 1) for (const g of merged.get(mi) ?? []) order.push(g);
  const P = []; const N = []; const U = [];
  const packed = [];
  let at = 0;
  for (let mi = 0; mi < 6; mi += 1) {
    const startAt = at;
    for (const g of merged.get(mi) ?? []) {
      for (let v = g.start; v < g.start + g.count; v += 1) {
        P.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
        N.push(normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]);
        U.push(uvs[v * 2], uvs[v * 2 + 1]);
        at += 1;
      }
    }
    packed.push({ start: startAt, count: at - startAt, materialIndex: mi });
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  for (const g of packed) geometry.addGroup(g.start, g.count, g.materialIndex);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Deterministic good for the i-th static container of a seeded yard, drawn
 * from STAMP_YARD_GOODS so the yard reads as a real mixed terminal.
 */
/** Three weathering / paint variants per good (0 canonical, 1 darker+tight ribs, 2 lighter+wide ribs). */
export const STAMP_VARIANTS = 3;

/** Deterministic variant for the i-th container of a seeded group. */
export function stampVariantForIndex(seed, tag, index) {
  return Math.floor(stampUnit(`${seed >>> 0}:${tag}:variant:${index}`) * STAMP_VARIANTS) % STAMP_VARIANTS;
}

export function stampGoodForIndex(seed, tag, index) {
  const n = STAMP_YARD_GOODS.length;
  const k = stampUnit(`${seed >>> 0}:${tag}:${index}`);
  return STAMP_YARD_GOODS[Math.floor(k * n) % n];
}

/**
 * One stamped container as a mesh: box with the material array, castings on
 * the eight corners and two door bars on the +x end. `origin` is the box
 * CENTRE (unlike `addSlab`). Returns the Group.
 */
export function makeStampedContainer(good, {
  w = CONTAINER_BOX.w, h = CONTAINER_BOX.h, d = CONTAINER_BOX.d,
  normalMap = null, castings = true, name = null, variant = 0,
} = {}) {
  const group = new THREE.Group();
  group.name = name ?? `container:${good}`;
  group.userData.good = good;
  group.userData.variant = variant;
  const body = new THREE.Mesh(stampedBoxGeometry(w, h, d), stampedContainerMaterials(good, { normalMap, variant }));
  body.name = `${group.name}:body`;
  body.castShadow = true;
  body.receiveShadow = true;
  registerLodVersions(body, 'port');
  group.add(body);
  if (castings) {
    const dark = containerMaterial({ color: 0x1b1d20, roughness: 0.55, metalness: 0.35 });
    const casting = new THREE.BoxGeometry(0.22, 0.22, 0.22); // R6 fault 9: readable corner posts
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const c = new THREE.Mesh(casting, dark);
          c.position.set(sx * (w * 0.5 - 0.07), sy * (h * 0.5 - 0.07), sz * (d * 0.5 - 0.07));
          c.castShadow = false;
          c.receiveShadow = false;
          group.add(c);
        }
      }
    }
    /* ── P16-PM6 LAW 4 — THE DOOR BARS GO BACK INTO THE PAINT. ──
     * Two 0.05 m rods a box, 12 triangles each: 2.1 px at crane-close and under
     * a pixel at every other pose, so what they draw is a dashed white speckle
     * down the door end rather than a locking bar. PM3 removed the yard's 366
     * of these for the same reason and PM5B's residual 9 left these ten named;
     * the door texture in this file already draws the bars, their keepers and
     * their handles, and it draws them at any distance. */
    // R5: this was a full-footprint 6 cm cap hiding the painted roof; now a roof rib.
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 0.05, 0.09), dark);
    rail.position.y = h * 0.5 + 0.02;
    rail.castShadow = false;
    group.add(rail);
  }
  return group;
}

/** Dispose every cached texture / material / geometry (tests, hot reload). */
export function disposeStampCaches() {
  for (const texture of TEX_CACHE.values()) texture?.dispose?.();
  for (const texture of ROUGH_CACHE.values()) texture?.dispose?.();
  // P13-A10 item 5: the door textures are cached like the other two and have to
  // be released with them, or a venue rebuild leaks one canvas texture per good.
  for (const texture of END_CACHE.values()) texture?.dispose?.();
  END_CACHE.clear();
  ROUGH_CACHE.clear();
  for (const materials of MAT_CACHE.values()) {
    for (const material of new Set(materials)) material.dispose?.();
  }
  for (const geometry of GEOM_CACHE.values()) geometry.dispose?.();
  TEX_CACHE.clear();
  MAT_CACHE.clear();
  GEOM_CACHE.clear();
}
