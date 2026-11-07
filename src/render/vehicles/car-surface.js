// District Deck V3.11 R40-CAR — procedural car surface: overlay + wear atlas, paint and glass.
//
// The fleet is instanced, so every car shares one geometry per body family and one material
// per surface class. Per-car identity comes from `instanceColor`. That rules out per-car UV
// sets and rules out unwrapping the merged prism kit by hand, so surface detail is projected
// in the shader from the car's own local space instead: three box projections (side / top /
// end) into one 2x2 atlas, blended by the surface normal. The atlas is drawn on a canvas at
// load — no network, no Math.random, no Date.now — and is identical on every cold load.
//
// Two maps:
//   overlay  RGBA sRGB   RGB = the colour laid over the paint, A = how much of it lands.
//                        Shut lines, door handles, number plate, badge, road film, brake dust.
//   wear     RGB linear  R = roughness added, G = clearcoat kept (1 clean, 0 killed),
//                        B = ambient darkening (1 clean, <1 in crevices and under the sills).
//
// Both are ~5 MB together against the 320 MB V3.10 §2 texture budget.

import * as THREE from 'three';
import liveries from '../style/liveries.json' with { type: 'json' };
import { classMaterial, freezeTree } from '../style/material-classes.js';
import { LIVERY_SWITCHES } from '../style/livery.js';

export const CAR_PAINT_FAMILY = freezeTree(liveries.car.paintFamily);

/** One physical carrier per TrafficLayer; instanceColor owns the private-car paint. */
export function createCarPaintMaterial({ livery = LIVERY_SWITCHES.car } = {}) {
  const source = classMaterial('identity-paint', 'car-navy').clone();
  source.name = '';
  source.setValues(liveries.car.paintMaterial);
  if (!livery) return source;
  const material = classMaterial('identity-paint', 'car-navy', { source });
  // Retain the untinted carrier so the registered per-instance wheel is not multiplied by navy.
  material.color.copy(source.color);
  material.userData.carPaintFamily = 'car';
  source.dispose();
  return material;
}


/** Overlay atlas edge in pixels; each of the four tiles is a quarter of it. */
const OVERLAY_SIZE = 1024;
/** Wear atlas edge. Wear is low-frequency, so it does not need the overlay's resolution. */
const WEAR_SIZE = 512;

// Tile origins in UV space, for reading the GLSL below: canvas row 0 is the TOP of the image
// and therefore the HIGH v half, so side = (0, 0.5), top = (0.5, 0.5), front = (0, 0),
// rear = (0.5, 0). They are written literally in `PROJECT_BODY` rather than held here,
// because a uniform-free constant in the shader is one fewer thing to keep in step.

/** True when a 2D canvas is reachable. Node test runs construct TrafficLayer headless. */
function hasCanvas() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

/** FNV-1a → uint32. Same string, same pixels, every load. */
function hash32(text) {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/** xorshift32. Visual only — never the simulation RNG. */
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/**
 * Run `draw` in tile-local coordinates: (0,0) bottom-left, (1,1) top-right, y pointing up
 * like a UV space rather than down like a canvas.
 */
function tile(ctx, col, row, size, draw) {
  const x0 = col * size;
  const y0 = row * size;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, size, size);
  ctx.clip();
  ctx.setTransform(size, 0, 0, -size, x0, y0 + size);
  draw(ctx);
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/**
 * Text in tile space, drawn upright despite the flipped tile transform.
 *
 * The tile transform is scaled by the tile edge in pixels, so a font size given in that
 * space would be multiplied by 512. The scale is undone here and `pxHeight` is device pixels,
 * which is the only unit a font size is meaningful in.
 */
function tileText(ctx, text, x, y, pxHeight, tileSize, { colour = liveries.car.surfaceInk.text, letterSpacing = 0 } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 / tileSize, -1 / tileSize);
  ctx.fillStyle = colour;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${pxHeight}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  if (letterSpacing && 'letterSpacing' in ctx) ctx.letterSpacing = `${letterSpacing}px`;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Soft elliptical smudge — road film, brake dust, exhaust soot. */
function smudge(ctx, x, y, rx, ry, rgba, inner = 0) {
  const grad = ctx.createRadialGradient(x, y, Math.max(1e-4, rx * inner), x, y, Math.max(rx, ry));
  grad.addColorStop(0, rgba);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / Math.max(1e-4, rx));
  ctx.translate(-x, -y);
  ctx.fillStyle = grad;
  ctx.fillRect(x - rx * 1.4, y - rx * 1.4, rx * 2.8, rx * 2.8);
  ctx.restore();
}

/** Panel shut line: a dark core with a lighter highlight on the lower lip. */
function shutLine(ctx, x0, y0, x1, y1, width = 0.007) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(12,13,16,0.82)';
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(210,220,232,0.16)';
  ctx.lineWidth = width * 0.55;
  ctx.beginPath();
  ctx.moveTo(x0 + width * 0.75, y0);
  ctx.lineTo(x1 + width * 0.75, y1);
  ctx.stroke();
}

/**
 * Grain so the film does not read as an airbrush gradient. Deliberately fine: the first cut
 * used 4-12 mm blobs, which at board scale read as hail damage rather than as road dirt.
 */
function speckle(ctx, rng, count, alpha, spread) {
  for (let i = 0; i < count; i += 1) {
    const x = rng();
    const y = spread(rng());
    const r = 0.0012 + rng() * 0.0032;
    ctx.fillStyle = `rgba(58,50,42,${(alpha * (0.3 + rng() * 0.7)).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- overlay atlas ------------------------------------------------------------------------

// Tile coordinates below are derived from CAR_FRAME in traffic.js: u = z / 3.8 + 0.5 on the
// side, v = y / 1.70 everywhere the vertical is the vertical. Landmarks: sill v 0.153,
// belt v 0.618, axle line v 0.247, front axle u 0.789, rear axle u 0.232.

function drawSideOverlay(ctx, rng) {
  // Road film climbing off the sill, heavier at the rear where the wake drags it up.
  const film = ctx.createLinearGradient(0, 0.14, 0, 0.44);
  film.addColorStop(0, 'rgba(46,40,32,0.26)');
  film.addColorStop(0.4, 'rgba(58,52,42,0.11)');
  film.addColorStop(1, 'rgba(64,58,48,0)');
  ctx.fillStyle = film;
  ctx.fillRect(0, 0.12, 1, 0.34);
  const rearWash = ctx.createLinearGradient(0, 0, 0.26, 0);
  rearWash.addColorStop(0, 'rgba(46,40,32,0.15)');
  rearWash.addColorStop(1, 'rgba(70,62,52,0)');
  ctx.fillStyle = rearWash;
  ctx.fillRect(0, 0.12, 0.26, 0.42);
  speckle(ctx, rng, 420, 0.20, (t) => 0.13 + t * t * 0.28);

  // Brake dust thrown back off each arch onto the paint behind it.
  smudge(ctx, 0.700, 0.255, 0.085, 0.075, 'rgba(62,45,33,0.30)');
  smudge(ctx, 0.150, 0.255, 0.078, 0.070, 'rgba(58,42,32,0.26)');

  // Shut lines: door leading and trailing edge, and the tailgate.
  shutLine(ctx, 0.637, 0.170, 0.637, 0.610, 0.0055);
  shutLine(ctx, 0.337, 0.170, 0.337, 0.610, 0.0055);
  shutLine(ctx, 0.145, 0.190, 0.145, 0.600, 0.0045);
  ctx.fillStyle = 'rgba(78,70,58,0.16)';
  for (const u of [0.637, 0.337, 0.145]) ctx.fillRect(u - 0.009, 0.170, 0.018, 0.18);

  // Door handle: recessed dark pull with a lit top edge, on the geometry that carries one.
  ctx.fillStyle = 'rgba(16,18,22,0.72)';
  ctx.beginPath();
  ctx.roundRect(0.474 - 0.042, 0.487, 0.084, 0.026, 0.012);
  ctx.fill();
  ctx.fillStyle = 'rgba(224,232,240,0.34)';
  ctx.fillRect(0.474 - 0.040, 0.510, 0.080, 0.005);

  // Worn sheen just under the belt line.
  const sheen = ctx.createLinearGradient(0, 0.55, 0, 0.62);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.07)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0.55, 1, 0.07);
}

function drawTopOverlay(ctx, rng) {
  // u = across the car (x / 1.84 + 0.5), v = rear (0) to nose (1) (z / 3.8 + 0.5).
  // Bonnet shut line at the scuttle plus its two wing gaps; tailgate line at the rear.
  shutLine(ctx, 0.16, 0.774, 0.84, 0.774, 0.0055);
  shutLine(ctx, 0.165, 0.774, 0.165, 0.960, 0.0045);
  shutLine(ctx, 0.835, 0.774, 0.835, 0.960, 0.0045);
  shutLine(ctx, 0.17, 0.126, 0.83, 0.126, 0.0055);

  // Dust that has settled and been rained on: heaviest at the rear and in the gaps.
  const settle = ctx.createLinearGradient(0, 0, 0, 0.30);
  settle.addColorStop(0, 'rgba(88,80,68,0.22)');
  settle.addColorStop(1, 'rgba(88,80,68,0)');
  ctx.fillStyle = settle;
  ctx.fillRect(0, 0, 1, 0.30);
  ctx.fillStyle = 'rgba(84,76,64,0.14)';
  ctx.fillRect(0.16, 0.762, 0.68, 0.022);
  ctx.fillRect(0.17, 0.114, 0.66, 0.022);
  speckle(ctx, rng, 320, 0.16, (t) => t);

  // Long soft sheen down the centre — the highlight a clearcoat gives a horizontal panel.
  const sheen = ctx.createLinearGradient(0.40, 0, 0.60, 0);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0.38, 0.02, 0.24, 0.96);
}

/** Number plate, drawn where the plate face geometry sits: PLATE.y in traffic.js. */
function plate(ctx, cx, cy, w, h, text, tileSize) {
  ctx.save();
  ctx.fillStyle = 'rgba(232,234,228,1)';
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h * 0.16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,32,36,0.9)';
  ctx.lineWidth = h * 0.10;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h * 0.16);
  ctx.stroke();
  tileText(ctx, text, cx, cy, Math.round(h * tileSize * 0.62), tileSize,
    { colour: liveries.car.surfaceInk.plate, letterSpacing: 1 });
  ctx.restore();
}

function drawFrontOverlay(ctx, rng, tileSize) {
  // u = across (x / 1.84 + 0.5), v = ground (0) to roof (1) (y / 1.70).
  plate(ctx, 0.5, 0.401, 0.250, 0.062, 'DD 001', tileSize);
  // Bug strike and road film across the nose, worst at the leading edge.
  const film = ctx.createLinearGradient(0, 0.14, 0, 0.46);
  film.addColorStop(0, 'rgba(72,64,52,0.30)');
  film.addColorStop(1, 'rgba(84,76,64,0)');
  ctx.fillStyle = film;
  ctx.fillRect(0, 0.12, 1, 0.34);
  speckle(ctx, rng, 260, 0.18, (t) => 0.13 + t * 0.30);
}

function drawRearOverlay(ctx, rng, tileSize) {
  plate(ctx, 0.5, 0.401, 0.250, 0.062, 'DD 001', tileSize);
  // Tailgate joint across the tail panel.
  shutLine(ctx, 0.17, 0.560, 0.83, 0.560, 0.0050);
  ctx.fillStyle = 'rgba(24,27,32,0.45)';
  ctx.beginPath();
  ctx.ellipse(0.5, 0.475, 0.028, 0.017, 0, 0, Math.PI * 2);
  ctx.fill();

  // The rear gets the dirtiest — wake film plus exhaust soot on one quarter.
  const film = ctx.createLinearGradient(0, 0.12, 0, 0.52);
  film.addColorStop(0, 'rgba(66,58,48,0.40)');
  film.addColorStop(0.45, 'rgba(80,72,60,0.17)');
  film.addColorStop(1, 'rgba(90,82,70,0)');
  ctx.fillStyle = film;
  ctx.fillRect(0, 0.10, 1, 0.44);
  speckle(ctx, rng, 340, 0.22, (t) => 0.11 + t * t * 0.34);
  smudge(ctx, 0.290, 0.185, 0.090, 0.055, 'rgba(24,22,20,0.36)');
}

// --- wear atlas ---------------------------------------------------------------------------
// R roughness added · G clearcoat kept · B ambient darkening. Clean paint is (0, 1, 1).

function wearBase(ctx) {
  ctx.fillStyle = 'rgb(0,255,255)';
  ctx.fillRect(0, 0, 1, 1);
}

/** Paint a grime band: additive roughness, clearcoat loss and darkening in one stroke. */
function grimeBand(ctx, x, y, w, h, strength, vertical = true) {
  const grad = vertical
    ? ctx.createLinearGradient(0, y, 0, y + h)
    : ctx.createLinearGradient(x, 0, x + w, 0);
  const r = Math.round(255 * strength);
  const g = Math.round(255 * (1 - strength * 0.9));
  const b = Math.round(255 * (1 - strength * 0.42));
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(1, 'rgba(0,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
}

function drawSideWear(ctx, rng) {
  wearBase(ctx);
  grimeBand(ctx, 0, 0.12, 1, 0.32, 0.62);
  smudge(ctx, 0.700, 0.255, 0.09, 0.08, 'rgba(255,40,150,0.55)');
  smudge(ctx, 0.150, 0.255, 0.085, 0.075, 'rgba(255,50,160,0.48)');
  // Shut lines read as crevice occlusion, not just a dark line.
  for (const u of [0.637, 0.337, 0.145]) {
    const grad = ctx.createLinearGradient(u - 0.016, 0, u + 0.016, 0);
    grad.addColorStop(0, 'rgba(0,255,255,0)');
    grad.addColorStop(0.5, 'rgba(120,150,120,1)');
    grad.addColorStop(1, 'rgba(0,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(u - 0.016, 0.17, 0.032, 0.44);
  }
  speckle(ctx, rng, 90, 0.07, (t) => 0.13 + t * 0.3);
}

function drawTopWear(ctx, rng) {
  wearBase(ctx);
  grimeBand(ctx, 0, 0, 1, 0.30, 0.48);
  for (const v of [0.774, 0.126]) {
    const grad = ctx.createLinearGradient(0, v - 0.016, 0, v + 0.016);
    grad.addColorStop(0, 'rgba(0,255,255,0)');
    grad.addColorStop(0.5, 'rgba(130,150,130,1)');
    grad.addColorStop(1, 'rgba(0,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0.14, v - 0.016, 0.72, 0.032);
  }
  speckle(ctx, rng, 90, 0.06, (t) => t);
}

function drawFrontWear(ctx, rng) {
  wearBase(ctx);
  grimeBand(ctx, 0, 0.12, 1, 0.32, 0.55);
  // The plate is matte plastic: rough, no clearcoat.
  ctx.fillStyle = 'rgb(200,10,225)';
  ctx.fillRect(0.373, 0.368, 0.254, 0.066);
  speckle(ctx, rng, 60, 0.07, (t) => 0.13 + t * 0.30);
}

function drawRearWear(ctx, rng) {
  wearBase(ctx);
  grimeBand(ctx, 0, 0.10, 1, 0.40, 0.70);
  ctx.fillStyle = 'rgb(200,10,225)';
  ctx.fillRect(0.373, 0.368, 0.254, 0.066);
  smudge(ctx, 0.290, 0.185, 0.10, 0.06, 'rgba(255,30,90,0.60)');
  speckle(ctx, rng, 70, 0.09, (t) => 0.11 + t * t * 0.36);
}

// --- atlas assembly -----------------------------------------------------------------------

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function makeTexture(canvas, srgb) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  texture.userData.procedural = true;
  return texture;
}

let sharedMaps = null;

/**
 * The overlay + wear atlas pair, built once and shared by every car material.
 * Returns null where no canvas exists (Node test runs), and every consumer degrades to
 * untextured paint rather than throwing.
 */
export function carSurfaceMaps() {
  if (sharedMaps !== null) return sharedMaps;
  if (!hasCanvas()) {
    sharedMaps = null;
    return null;
  }
  const overlay = makeCanvas(OVERLAY_SIZE);
  const oc = overlay.getContext('2d');
  if (!oc || typeof oc.roundRect !== 'function') {
    sharedMaps = null;
    return null;
  }
  oc.clearRect(0, 0, OVERLAY_SIZE, OVERLAY_SIZE);
  const oTile = OVERLAY_SIZE / 2;
  tile(oc, 0, 0, oTile, (c) => drawSideOverlay(c, makeRng(hash32('dd-car-side'))));
  tile(oc, 1, 0, oTile, (c) => drawTopOverlay(c, makeRng(hash32('dd-car-top'))));
  tile(oc, 0, 1, oTile, (c) => drawFrontOverlay(c, makeRng(hash32('dd-car-front')), oTile));
  tile(oc, 1, 1, oTile, (c) => drawRearOverlay(c, makeRng(hash32('dd-car-rear')), oTile));

  const wear = makeCanvas(WEAR_SIZE);
  const wc = wear.getContext('2d');
  const wTile = WEAR_SIZE / 2;
  tile(wc, 0, 0, wTile, (c) => drawSideWear(c, makeRng(hash32('dd-wear-side'))));
  tile(wc, 1, 0, wTile, (c) => drawTopWear(c, makeRng(hash32('dd-wear-top'))));
  tile(wc, 0, 1, wTile, (c) => drawFrontWear(c, makeRng(hash32('dd-wear-front'))));
  tile(wc, 1, 1, wTile, (c) => drawRearWear(c, makeRng(hash32('dd-wear-rear'))));

  sharedMaps = {
    overlay: makeTexture(overlay, true),
    wear: makeTexture(wear, false),
  };
  return sharedMaps;
}

export function disposeCarSurfaceMaps() {
  if (!sharedMaps) return;
  sharedMaps.overlay.dispose();
  sharedMaps.wear.dispose();
  sharedMaps = null;
}

// --- shader plumbing ----------------------------------------------------------------------

const PROJECT_DECL = /* glsl */`
uniform sampler2D uCarOverlay;
uniform sampler2D uCarWear;
uniform vec3 uCarBounds;
uniform float uCarGrime;
varying vec3 vCarPos;
varying vec3 vCarNrm;
vec2 ddCarTile(vec2 t, vec2 origin) {
  return origin + clamp(t, vec2(0.007), vec2(0.993)) * 0.5;
}
`;

const PROJECT_BODY = /* glsl */`
vec3 ddN = normalize(vCarNrm);
float ddX = clamp(vCarPos.x / (2.0 * uCarBounds.x) + 0.5, 0.0, 1.0);
float ddY = clamp(vCarPos.y / uCarBounds.y, 0.0, 1.0);
float ddZ = clamp(vCarPos.z / (2.0 * uCarBounds.z) + 0.5, 0.0, 1.0);
// The end tiles carry the number plate, and they are only meaningful on the nose and the
// tail. The lower body is built from slices, and every internal slice boundary leaves a
// sliver of end cap whose normal points along Z — without this mask those slivers sample
// the plate and the flank rasterises as a row of readable number plates.
float ddEnds = smoothstep(0.60, 0.84, abs(ddZ - 0.5) * 2.0);
vec3 ddW = pow(abs(ddN), vec3(4.0));
ddW.z *= ddEnds;
ddW += vec3(0.02, 0.01, 0.0);
ddW /= max(1e-4, ddW.x + ddW.y + ddW.z);
bool ddIsNose = ddN.z >= 0.0;
vec2 ddEndOrigin = ddIsNose ? vec2(0.0, 0.0) : vec2(0.5, 0.0);
// The tail is seen from the other side, so its horizontal runs the other way. Without the
// flip the number plate on the tailgate reads backwards.
float ddEndU = ddIsNose ? ddX : 1.0 - ddX;
vec2 ddUvSide = ddCarTile(vec2(ddZ, ddY), vec2(0.0, 0.5));
vec2 ddUvTop = ddCarTile(vec2(ddX, ddZ), vec2(0.5, 0.5));
vec2 ddUvEnd = ddCarTile(vec2(ddEndU, ddY), ddEndOrigin);
vec4 ddOverlay = texture2D(uCarOverlay, ddUvSide) * ddW.x
  + texture2D(uCarOverlay, ddUvTop) * ddW.y
  + texture2D(uCarOverlay, ddUvEnd) * ddW.z;
vec3 ddWear = texture2D(uCarWear, ddUvSide).rgb * ddW.x
  + texture2D(uCarWear, ddUvTop).rgb * ddW.y
  + texture2D(uCarWear, ddUvEnd).rgb * ddW.z;
diffuseColor.rgb = mix(diffuseColor.rgb, ddOverlay.rgb, clamp(ddOverlay.a, 0.0, 1.0));
diffuseColor.rgb *= mix(1.0, ddWear.b, uCarGrime);
float ddRough = ddWear.r * 0.62 * uCarGrime;
float ddClear = mix(1.0, ddWear.g, uCarGrime);
// I4: continuous road film in model space survives atlas minification on the board.
// Keep the upper paint clean and put warm dirt where spray reaches the lower doors.
float ddRoadFilm = (1.0 - smoothstep(0.30, 0.72, vCarPos.y))
  * (0.72 + 0.28 * sin(vCarPos.z * 19.0 + vCarPos.y * 31.0)) * uCarGrime;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.075, 0.059, 0.041), ddRoadFilm * 0.38);
ddRough += ddRoadFilm * 0.24;
ddClear *= 1.0 - ddRoadFilm * 0.48;
`;

const PROJECT_APPLY = /* glsl */`
material.roughness = clamp(material.roughness + ddRough, 0.025, 1.0);
#ifdef USE_CLEARCOAT
material.clearcoat = clamp(material.clearcoat * ddClear, 0.0, 1.0);
material.clearcoatRoughness = clamp(material.clearcoatRoughness + ddRough * 0.7, 0.02, 1.0);
#endif
`;

/**
 * Install the box-projected overlay + wear on a paint material.
 * @param {THREE.Material} material
 * @param {{halfWidth:number, height:number, halfLength:number}} bounds car-local extents (m)
 * @param {number} grime 0 showroom, 1 the full authored film
 */
export function applyCarPaintSurface(material, bounds, grime = 1) {
  material.roughness = 0.30;
  material.metalness = 0.10;
  material.clearcoatRoughness = 0.30; // W3-A: was 0.12; spreads the sun glint off roofs (see traffic.js paintMat)
  const maps = carSurfaceMaps();
  if (!maps) return material;
  const uniforms = {
    uCarOverlay: { value: maps.overlay },
    uCarWear: { value: maps.wear },
    uCarBounds: {
      value: new THREE.Vector3(bounds.halfWidth, bounds.height, bounds.halfLength),
    },
    uCarGrime: { value: grime },
  };
  material.userData.carSurface = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vCarPos;\nvarying vec3 vCarNrm;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCarPos = position;\nvCarNrm = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PROJECT_DECL}`)
      // After <color_fragment> so instanceColor is already folded in and the plate can
      // override the paint instead of being tinted by it.
      .replace('#include <color_fragment>', `#include <color_fragment>\n${PROJECT_BODY}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${PROJECT_APPLY}`);
  };
  material.customProgramCacheKey = () => 'dd-car-paint-i4';
  return material;
}

const GLASS_DECL = /* glsl */`
uniform vec3 uCarBounds;
varying vec3 vCarPos;
varying vec3 vCarNrm;
`;

const GLASS_BODY = /* glsl */`
float ggY = clamp(vCarPos.y / uCarBounds.y, 0.0, 1.0);
float ggZ = clamp(vCarPos.z / (2.0 * uCarBounds.z) + 0.5, 0.0, 1.0);
// Ceramic frit: the black dot band screen-printed round every edge of an automotive glazing.
float frit = smoothstep(0.80, 0.99, ggY);
frit = max(frit, smoothstep(0.24, 0.02, ggY));
frit = max(frit, smoothstep(0.86, 0.99, ggZ));
frit = max(frit, smoothstep(0.14, 0.01, ggZ));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.020, 0.022, 0.026), frit * 0.92);
diffuseColor.a = mix(diffuseColor.a, 1.0, frit * 0.95);
// A low-contrast sky band supplements the real environment reflection. It is anchored
// to the glass height, stays neutral, and cannot bleach the window to body-paint value.
float ggSky = smoothstep(0.65, 0.99, ggY) * (1.0 - frit * 0.65);
diffuseColor.rgb += vec3(0.018, 0.021, 0.024) * ggSky;
`;

/**
 * Glazing: a frit band round the aperture edges, so the greenhouse reads as glass set into
 * a rubber and ceramic surround rather than a tinted block. The specular sweep across the
 * screen is the real one — clearcoat plus the scene environment, not a painted highlight.
 */
export function applyCarGlassSurface(material, bounds) {
  const uniforms = {
    uCarBounds: {
      value: new THREE.Vector3(bounds.halfWidth, bounds.height, bounds.halfLength),
    },
  };
  material.userData.carGlass = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vCarPos;\nvarying vec3 vCarNrm;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCarPos = position;\nvCarNrm = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLASS_DECL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${GLASS_BODY}`);
  };
  material.customProgramCacheKey = () => 'dd-car-glass-i4';
  return material;
}

export default { carSurfaceMaps, applyCarPaintSurface, applyCarGlassSurface, disposeCarSurfaceMaps };
