// District Deck lane F1 (tram-stop rebuild). One procedural Yarra Trams kerbside stop.
//
// The stop used to be three overlapping builds: box primitives in streetscape.js
// `_buildTramStreet`, the PTV flag kit in `_buildBollardsAndTramFlags`, and a one- or
// two-part slice of `modern-tram-stop-pylon.glb` (metal 0.76) in board.js `_buildTransit`.
// This module replaces all three with one kit drawn in two instanced models:
//
//   tramStopModel()  the shelter at a city.transit stop: concrete apron (the contact stain),
//                    tactile boarding strip, three-bay shelter with sloped canopy, 0.3 m fascia
//                    and roof overhang, framed glazing, an opaque back panel (map case), a
//                    timber bench with cast ends, a blank PIDS plate, and the stop's own flag
//                    beyond the downstream end of the canopy.
//   tramFlagModel()  numbered flags at shelters and the far-side stops of two-way streets.
//                    Board shelters omit their embedded flag; streetscape instances the
//                    same kit flags separately so their original mischief keys remain live.
//
// LOCAL FRAME. x runs along the street, y is up, +z points away from the kerb (toward the
// building line). The kerb face is at z = -1.5 (CORRIDOR.footpathCentre +/- 1.5) and nothing
// in either model passes z = -1.40, so no part stands over the carriageway (owner, 8 Sep).
// The stop model's y = 0 is the stop placement height (world 0.16, board.js `_buildTransit`);
// the flag model's y = 0 is world 0 (streetscape.js flag placements).
//
// DIMENSIONS. Based on Stoddart Evo drawing 01 Evo 01-01, revision A, 23 July 2015:
// https://res.cloudinary.com/hyggzlxrb/raw/upload/v1719226519/media/spai-19.pdf
// Overall 4.110 x 1.700 x 2.550 m, internal 3.740 m, seat 2.400 m. Manufacturer
// identifies the Evo on the Yarra Trams network. The cast-end bench and 0.30 m fascia
// follow this lane's brief; this is an adaptation, not a copy of its cantilever seat.
//
// SWITCH. `?tramStopKit=0` restores the previous picture exactly (old boxes, PTV flag kit and
// the pylon GLB slice). The kit is on by default.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { signPlate } from './signage/index.js';
import { std } from './fringe/kit.js';
import { restyleColour } from './style/restyle.js';

export const TRAM_STOP_KIT_PARAM = 'tramStopKit';

// Round-one capture controls; bounded independently of the rollback switch.
export const TRAM_STOP_TUNE = Object.freeze({
  tramStopS: 19,             // non-accent built HSV saturation, percent
  tramStopV: 1,              // painted field value multiplier
  tramStopContactV: 17,      // apron value drop from #a39e96 paving, points
});
export function tramStopTune(search = globalThis.location?.search ?? '') {
  const q = new URLSearchParams(search);
  const read = (key, lo, hi) => {
    const raw = q.get(key);
    const n = raw?.trim() ? Number(raw) : NaN;
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : TRAM_STOP_TUNE[key];
  };
  return { tramStopS: read('tramStopS', 10, 29), tramStopV: read('tramStopV', 0.65, 1.25),
    tramStopContactV: read('tramStopContactV', 5, 30) };
}

function tunedColour(hex, saturation, value) {
  const c = new THREE.Color(hex).getRGB({}, THREE.SRGBColorSpace);
  const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
  const v = Math.min(0.9, Math.max(0.1, value ?? max));
  const channel = (n) => v * (1 - saturation / 100 * (max - n) / (max - min || 1));
  return new THREE.Color().setRGB(channel(c.r), channel(c.g), channel(c.b), THREE.SRGBColorSpace);
}

/** True unless the URL carries `tramStopKit=0`. Outside a browser it is on. */
export function tramStopKitEnabled(search = null) {
  let query = search;
  if (query == null) {
    try {
      query = typeof location !== 'undefined' && location?.search ? location.search : '';
    } catch {
      query = '';
    }
  }
  if (!query) return true;
  try {
    return new URLSearchParams(query).get(TRAM_STOP_KIT_PARAM) !== '0';
  } catch {
    return true;
  }
}

/**
 * The kit's finishes. Built surfaces sit at HSV saturation 10-29; `accent` marks the two
 * saturated parts the plan allows (tactile yellow, tram-route green), each under 4 m2 in projected area per stop.
 * Metal stays at or under 0.15 and roughness in 0.55-0.95.
 */
export const TRAM_STOP_FINISHES = Object.freeze({
  frame:   Object.freeze({ family: 'painted_metal', color: '#383f37', roughness: 0.62, metalness: 0.12 }),
  roof:    Object.freeze({ family: 'painted_metal', color: '#7a8274', roughness: 0.70, metalness: 0.10 }),
  fascia:  Object.freeze({ family: 'painted_metal', color: '#bdb6a4', roughness: 0.70, metalness: 0.05 }),
  glass:   Object.freeze({ family: 'glass', color: '#5d7270', roughness: 0.55, metalness: 0, opacity: 0.38, glass: true }),
  timber:  Object.freeze({ family: 'timber', color: '#7a6a58', roughness: 0.80, metalness: 0 }),
  tactile: Object.freeze({ family: 'concrete', color: '#bfa35a', roughness: 0.85, metalness: 0, accent: true }),
  apron:   Object.freeze({ family: 'concrete', color: '#827b70', roughness: 0.95, metalness: 0 }),
  flag:    Object.freeze({ family: 'painted_metal', color: '#5e8f3c', roughness: 0.60, metalness: 0.05, accent: true }),
});

/** Stop-number and route plate colours (atlas cells; no new material). */
export const FLAG_PLATE_INK = '#26332b';
export const FLAG_PLATE_GROUND = '#efebe1';
export const FLAG_ROUTE_INK = '#efebe1';
export const FLAG_ROUTE_GROUND = '#5e8f3c';

export const TRAM_STOP_DIMENSIONS = Object.freeze({
  apronTop: 0.122,          // local y; world 0.282, 7 mm over the footpath pavers
  bayLength: 1.25,
  bays: 3,
  shelterLength: 3.75,
  shelterDepth: 1.25,       // front posts z -0.30, back posts z +0.95
  frontEave: 2.46,
  backEave: 2.34,
  canopy: Object.freeze({ length: 4.11, depth: 1.70, thickness: 0.06 }),
  fascia: 0.30,
  seatHeight: 0.45,
  flagX: 3.0,               // the stop's own flag, beyond the canopy's +x end
  flagZ: -0.9,
  flagHeight: 3.1,
  bladeSize: Object.freeze({ w: 0.46, h: 0.78 }),
  footpathTopWorld: 0.275,
  stopBaseWorld: 0.16,
});

const D = TRAM_STOP_DIMENSIONS;

function prep(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  }
  g.clearGroups();
  return g;
}

class Bucket {
  constructor() { this.parts = new Map(); }
  add(key, geometry) {
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(prep(geometry));
  }
  /** Box centred at (x, y, z), optionally turned about x then y (radians). */
  box(key, w, h, d, x, y, z, rx = 0, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.add(key, g);
  }
  /** Vertical cylinder from y0 to y1. */
  post(key, r0, r1, y0, y1, x, z, seg = 10) {
    const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, 1);
    g.translate(x, (y0 + y1) / 2, z);
    this.add(key, g);
  }
  merged() {
    const out = new Map();
    for (const [key, list] of this.parts) {
      const g = mergeGeometries(list, false);
      for (const part of list) part.dispose();
      g.name = `tram-stop-kit:${key}`;
      g.computeBoundingBox();
      g.computeBoundingSphere();
      out.set(key, g);
    }
    return out;
  }
}

/** Side elevation of a cast bench end (u = z across the seat, v = y), extruded 50 mm. */
function castEndGeometry(seatY) {
  const s = seatY / 0.45;
  const shape = new THREE.Shape();
  shape.moveTo(0.36, 0);
  shape.lineTo(0.45, 0);
  shape.quadraticCurveTo(0.47, 0.22 * s, 0.53, 0.37 * s);
  shape.lineTo(0.73, 0.37 * s);
  shape.quadraticCurveTo(0.76, 0.18 * s, 0.74, 0);
  shape.lineTo(0.83, 0);
  shape.quadraticCurveTo(0.85, 0.30 * s, 0.86, 0.43 * s);
  shape.quadraticCurveTo(0.90, 0.66 * s, 0.94, 0.90 * s);
  shape.lineTo(0.88, 0.92 * s);
  shape.quadraticCurveTo(0.84, 0.70 * s, 0.80, 0.48 * s);
  shape.lineTo(0.39, 0.48 * s);
  shape.quadraticCurveTo(0.34, 0.47 * s, 0.34, 0.41 * s);
  shape.quadraticCurveTo(0.37, 0.20 * s, 0.36, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false, curveSegments: 5 });
  g.rotateY(-Math.PI / 2); // shape x -> local z, extrusion -> local -x
  return g;
}

/** The free-standing flag: pole, collar, cap, two brackets and a double-sided green blade. */
function addFlag(b, { x, z, base }) {
  const top = base + D.flagHeight;
  b.post('frame', 0.075, 0.07, base - 0.03, base + 0.06, x, z, 12);           // cast collar
  b.post('frame', 0.04, 0.038, base - 0.05, top, x, z, 10);                   // 76 mm pole
  b.post('frame', 0.046, 0.046, top, top + 0.04, x, z, 10);                   // cap
  const bladeZ = z + 0.04 + D.bladeSize.w / 2;
  const bladeY = top - 0.06 - D.bladeSize.h / 2;
  for (const dy of [-0.26, 0.26]) b.box('frame', 0.05, 0.04, 0.09, x, bladeY + dy, z + 0.055);
  b.box('flag', 0.04, D.bladeSize.h, D.bladeSize.w, x, bladeY, bladeZ);
  b.box('frame', 0.046, 0.025, D.bladeSize.w + 0.01, x, bladeY + D.bladeSize.h / 2 + 0.012, bladeZ); // top rail
  return { bladeY, bladeZ };
}

/** Stop shelter geometry, merged one buffer per finish. Pure; runs in node. */
export function buildTramStopGeometry({ includeFlag = true } = {}) {
  const b = new Bucket();
  const F = D.apronTop;
  const half = D.shelterLength / 2;
  const zf = 0.95 - D.shelterDepth;
  const zb = 0.95;
  const yf = F + D.frontEave;
  const yb = F + D.backEave;
  const slope = Math.atan2(yf - yb, zb - zf);
  const roofAt = (z) => yf - (z - zf) * Math.tan(slope);

  // Apron: the contact stain, 13 V under the pavers. It runs past the flag.
  b.box('apron', 6.1, 0.04, 2.7, 0.3, F - 0.02, 0.05);
  // Tactile boarding strip at the berth centre, studs on a 150 mm grid.
  b.box('tactile', 5.4, 0.025, 0.30, 0, F - 0.004, -1.2);
  for (let i = 0; i < 36; i += 1) {
    for (const dz of [-0.09, 0, 0.09]) {
      b.box('tactile', 0.035, 0.008, 0.035, -2.625 + i * 0.15, F + 0.012, -1.2 + dz);
    }
  }

  // Posts: two front corners, four back (bay lines). 100 mm square sections on base plates.
  const posts = [[-half, zf], [half, zf]];
  for (let i = 0; i <= D.bays; i += 1) posts.push([-half + i * D.bayLength, zb]);
  for (const [x, z] of posts) {
    const topY = roofAt(z) - D.canopy.thickness / 2 - 0.16;
    b.box('frame', 0.10, topY - F, 0.10, x, (F + topY) / 2, z);
    b.box('frame', 0.20, 0.012, 0.20, x, F + 0.006, z);
  }
  // Beams under the canopy: front and back runs, two sloped side beams.
  for (const z of [zf, zb]) {
    const y = roofAt(z) - D.canopy.thickness / 2 - 0.08;
    b.box('frame', D.shelterLength + 0.1, 0.16, 0.12, 0, y, z);
  }
  const sideLen = Math.hypot(zb - zf, yf - yb);
  for (const x of [-half, half]) {
    b.box('frame', 0.12, 0.14, sideLen, x, (roofAt(zf) + roofAt(zb)) / 2 - D.canopy.thickness / 2 - 0.07,
      (zf + zb) / 2, slope);
  }

  // Canopy: sloped plate, overhang 0.18 m at the ends, 0.30 m front, 0.15 m back.
  const c0 = zf - 0.30;
  const c1 = zb + 0.15;
  const cz = (c0 + c1) / 2;
  const cLen = Math.hypot(c1 - c0, (c1 - c0) * Math.tan(slope));
  b.box('roof', D.canopy.length, D.canopy.thickness, cLen, 0, roofAt(cz), cz, slope);
  // Fascia: 0.30 m band at the front and ends standing 30 mm proud of the plate; 0.20 m at back.
  const fy = roofAt(c0) + 0.03 - D.fascia / 2;
  b.box('fascia', D.canopy.length + 0.08, D.fascia, 0.04, 0, fy, c0 - 0.02);
  b.box('fascia', D.canopy.length + 0.08, 0.20, 0.04, 0, roofAt(c1) + 0.03 - 0.10, c1 + 0.02);
  for (const x of [-D.canopy.length / 2 - 0.02, D.canopy.length / 2 + 0.02]) {
    b.box('fascia', 0.04, D.fascia, cLen + 0.04, x, roofAt(cz) + 0.03 - D.fascia / 2, cz, slope);
  }

  // Back wall: glazed outer bays, an opaque panel (map case) in the middle bay.
  const railLo = F + 0.12;
  const railHi = F + 2.15;
  b.box('frame', D.shelterLength, 0.06, 0.06, 0, railLo, zb);
  b.box('frame', D.shelterLength, 0.06, 0.06, 0, railHi, zb);
  const paneH = railHi - railLo - 0.06;
  const paneY = (railLo + railHi) / 2;
  for (const bay of [0, 2]) {
    const x = -half + (bay + 0.5) * D.bayLength;
    b.box('glass', D.bayLength - 0.10, paneH, 0.012, x, paneY, zb);
  }
  // The panel shares the fascia finish: one draw (and one shadow draw) fewer a stop.
  b.box('fascia', D.bayLength - 0.10, paneH, 0.09, 0, paneY, zb);
  for (const side of [-1, 1]) b.box('frame', 0.05, paneH, 0.10, side * (D.bayLength - 0.10) / 2, paneY, zb);
  b.box('frame', D.bayLength - 0.10, 0.05, 0.10, 0, paneY + paneH / 2 - 0.02, zb);
  b.box('frame', D.bayLength - 0.10, 0.05, 0.10, 0, paneY - paneH / 2 + 0.02, zb);
  // End screens: half-depth glazed panels at both ends, framed.
  const ez0 = 0.10;
  const ezLen = zb - ez0;
  for (const x of [-half, half]) {
    b.box('glass', 0.012, paneH, ezLen - 0.05, x, paneY, (ez0 + zb) / 2);
    b.box('frame', 0.06, paneH + 0.06, 0.06, x, paneY, ez0);
    b.box('frame', 0.06, 0.06, ezLen, x, railLo, (ez0 + zb) / 2);
    b.box('frame', 0.06, 0.06, ezLen, x, railHi, (ez0 + zb) / 2);
  }

  // Bench in bays one and two: three seat slats, two back slats, two cast ends.
  const seatY = F + D.seatHeight;
  const benchX = -0.55;
  const benchLen = 2.4;
  for (const z of [0.45, 0.59, 0.73]) b.box('timber', benchLen, 0.035, 0.11, benchX, seatY - 0.018, z);
  for (const y of [0.64, 0.80]) {
    const zz = 0.80 + (y - 0.45) * 0.18;
    b.box('timber', benchLen, 0.11, 0.03, benchX, F + y, zz, 0.18);
  }
  for (const x of [benchX - benchLen / 2 + 0.12, benchX + benchLen / 2 - 0.12]) {
    const end = castEndGeometry(D.seatHeight);
    end.translate(x + 0.025, F, 0);
    b.add('frame', end);
  }

  // Blank PIDS plate hung from the front beam: housing in frame, blank faces both sides.
  const pidsX = 1.25;
  const beamUnder = roofAt(zf) - D.canopy.thickness / 2 - 0.16;
  const pidsY = beamUnder - 0.12 - 0.18;
  for (const dx of [-0.38, 0.38]) b.box('frame', 0.025, 0.12, 0.025, pidsX + dx, beamUnder - 0.06, zf);
  b.box('frame', 1.04, 0.36, 0.08, pidsX, pidsY, zf);
  // Blank faces: a recessed bezel line in the housing finish (no screen, no emission).
  for (const s of [-1, 1]) b.box('frame', 0.94, 0.26, 0.006, pidsX, pidsY, zf + s * 0.042);

  // The stop's own flag, beyond the canopy's +x end, clear of the tactile strip.
  if (includeFlag) addFlag(b, { x: D.flagX, z: D.flagZ, base: F });
  return b.merged();
}

/** Free-standing flag geometry (flag frame, y 0 = world 0). */
export function buildTramFlagGeometry() {
  const b = new Bucket();
  const base = D.footpathTopWorld;
  addFlag(b, { x: 0, z: D.flagZ, base });
  // Contact: a dark base plate round the collar (frame finish; no extra draw).
  b.post('frame', 0.16, 0.16, base - 0.01, base + 0.006, 0, D.flagZ, 14);
  return b.merged();
}

/** Where a flag's blade sits in the model's own frame (for the signPlate faces). */
export function flagBladeFrame(kind = 'flag') {
  const base = kind === 'stop' ? D.apronTop : D.footpathTopWorld;
  const top = base + D.flagHeight;
  return {
    x: kind === 'stop' ? D.flagX : 0,
    bladeY: top - 0.06 - D.bladeSize.h / 2,
    bladeZ: D.flagZ + 0.04 + D.bladeSize.w / 2,
    halfThick: 0.02,
  };
}

/** Melbourne numbers a stop by its place along the route, both directions sharing it. */
export function stopNumberText(alongIndex) {
  return String(Math.max(1, Math.round(alongIndex) + 1));
}

/** Apply a finish exactly; library families clamp painted metal roughness to 0.5. */
export function applyFinish(material, finish, key, tune = tramStopTune()) {
  material.color.set(finish.color);
  if (!finish.accent && !finish.glass) {
    const c = new THREE.Color(finish.color).getRGB({}, THREE.SRGBColorSpace);
    const value = key === 'apron' ? 163 / 255 - tune.tramStopContactV / 100
      : Math.max(c.r, c.g, c.b) * tune.tramStopV;
    material.color.copy(tunedColour(finish.color, tune.tramStopS, value));
  }
  // P17-W2B / ruling 80: round-3 roof gain x1.2; orchestrator: fascia (painted-steel median owner) to V 68; frame stays held.
  const gain = { apron: 5.974892, timber: 3.969476, roof: 5.016246, fascia: 1.318592 }[key];
  if (gain) material.color.copy(restyleColour(material.color, material.color.clone().multiplyScalar(gain),
    { id: `furniture:tram-stop-pylon.${key}` }));
  material.roughness = finish.roughness;
  material.metalness = finish.metalness;
  if (finish.glass) {
    material.transparent = true;
    material.opacity = finish.opacity ?? 0.38;
    material.depthWrite = false;
  }
  if (material.emissive) material.emissive.set(0x000000);
  if ('emissiveIntensity' in material) material.emissiveIntensity = 0;
  material.userData.tramStopKit = true;
  return material;
}

/** Kit materials from the board's MaterialLibrary (or a stand-in in node). */
export function tramStopMaterials(materials, keys) {
  const out = new Map();
  for (const key of keys) {
    const finish = TRAM_STOP_FINISHES[key];
    let material;
    if (materials?.get) {
      material = materials.get(finish.family, {
        variant: `f1-tram-stop-${key}`,
        color: finish.color,
        roughness: finish.roughness,
        metalness: finish.metalness,
        ...(finish.glass ? { opacity: finish.opacity, transparent: true } : {}),
      });
    } else {
      // Three's defaults (white, roughness 1, metal 0) through the shared fringe kit site (gate ruling 10).
      material = std(0xffffff, { roughness: 1, metalness: 0 });
    }
    out.set(key, applyFinish(material, finish, key));
  }
  return out;
}

function modelFrom(geometries, materials, source, size, ensureUv2) {
  const mats = tramStopMaterials(materials, [...geometries.keys()]);
  const parts = [];
  for (const [key, geometry] of geometries) {
    if (ensureUv2) ensureUv2(geometry);
    parts.push({ geometry, material: mats.get(key), key, castShadow: !TRAM_STOP_FINISHES[key].glass });
  }
  return { parts, size, source, procedural: true };
}

/** The shelter model for board.js `_buildTransit`. */
export function tramStopModel(materials, { ensureUv2 = null, includeFlag = true } = {}) {
  const model = modelFrom(buildTramStopGeometry({ includeFlag }), materials, 'procedural-yarra-trams-kerbside-stop',
    new THREE.Vector3(), ensureUv2);
  model.size.fromArray(kitStats(model).size);
  return model;
}

/** Two faces each for number and route, merged into one atlas draw per number. */
export function tramFlagPlate(materials, number, kind = 'flag') {
  const f = flagBladeFrame(kind);
  const parts = [];
  for (const facing of [-1, 1]) {
    for (const [text, ink, ground, y, w, h] of [
      [number, FLAG_PLATE_INK, FLAG_PLATE_GROUND, f.bladeY + 0.22, D.bladeSize.w - 0.08, 0.20],
      ['TRAM', FLAG_ROUTE_INK, FLAG_ROUTE_GROUND, f.bladeY - 0.12, D.bladeSize.w - 0.06, 0.14],
    ]) parts.push(...signPlate(materials, { text, ink, ground, x: f.x + facing * f.halfThick,
      y, z: f.bladeZ, w, h, axis: 'x', facing, proud: 0.004, capFrac: 0.66, name: 'tram-flag-plate' }));
  }
  if (!parts.length) return null;
  const geometry = mergeGeometries(parts.map((p) => p.geometry), false);
  for (const p of parts) p.geometry.dispose();
  parts[0].material.emissiveIntensity = 0;
  return { geometry, material: parts[0].material, castShadow: false };
}

/** The free-standing flag model for streetscape.js. */
export function tramFlagModel(materials, { ensureUv2 = null } = {}) {
  return modelFrom(buildTramFlagGeometry(), materials, 'procedural-yarra-trams-flag',
    new THREE.Vector3(0.9, 3.5, 0.9), ensureUv2);
}

/** Triangles, materials and bounds of a model (node audit). */
export function kitStats(model) {
  let triangles = 0;
  const box = new THREE.Box3();
  for (const part of model.parts) {
    const g = part.geometry;
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    g.computeBoundingBox();
    box.union(g.boundingBox);
  }
  const size = box.getSize(new THREE.Vector3());
  return {
    triangles,
    materials: new Set(model.parts.map((p) => p.material)).size,
    min: box.min.toArray().map((v) => +v.toFixed(3)),
    max: box.max.toArray().map((v) => +v.toFixed(3)),
    size: size.toArray().map((v) => +v.toFixed(3)),
  };
}

/**
 * Routes a mischief write for flag `index` to the per-number plate mesh that draws it, so a
 * knocked flag takes its stop number with it. Exposes the two members
 * `writeInstancePoseIfChanged` reads: `setMatrixAt` and `instanceMatrix.array`.
 */
export class InstanceRouter {
  constructor(count) {
    this.routes = new Array(count).fill(null);
    this.instanceMatrix = { array: new Float32Array(count * 16), needsUpdate: false };
    this.instanceColor = { array: new Float32Array(count * 3).fill(1), needsUpdate: false };
    this.count = count;
    this.isInstanceRouter = true;
  }
  route(index, mesh, local, matrix, offset = null) {
    this.routes[index] = { mesh, local, offset };
    matrix.toArray(this.instanceMatrix.array, index * 16);
  }
  setMatrixAt(index, matrix) {
    matrix.toArray(this.instanceMatrix.array, index * 16);
    const r = this.routes[index];
    if (!r) return;
    r.mesh.setMatrixAt(r.local, r.offset ? matrix.clone().multiply(r.offset) : matrix);
    r.mesh.instanceMatrix.needsUpdate = true;
  }
  getMatrixAt(index, matrix) {
    return matrix.fromArray(this.instanceMatrix.array, index * 16);
  }
  setColorAt(index, color) {
    color.toArray(this.instanceColor.array, index * 3);
    const r = this.routes[index];
    if (!r) return;
    r.mesh.setColorAt(r.local, color);
    r.mesh.instanceColor.needsUpdate = true;
  }
}
