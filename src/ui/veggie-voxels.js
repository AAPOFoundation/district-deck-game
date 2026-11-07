// District Deck V3.70 L7 — the veggie patch as a model.
//
// WHY THIS FILE EXISTS. The lane was opened by "block centres needs model improvement" and
// r1 answered two thirds of it with CSS: `crit-canvas.mjs` measured zero canvases, zero SVG
// and zero images in the veggie overlay. A veggie-growing game that never shows a vegetable
// is a spreadsheet with a green ramp. This is the vegetable.
//
// Geometry only, and pure: no simulation state is read or written, no clock, no Math.random.
// A patch record in produces the same meshes out, on every machine — which is what lets a
// probe count them instead of a human squinting at them.
//
// Authored in GARDEN-LOCAL METRES with the gravel at y = 0 and bed soil at y = SOIL_Y. Four
// beds in a 2 x 2, four plots per bed in a 2 x 2, indexed the way the side rail reads them:
// plot = bed * 4 + i, i laid out (-x,-z) (+x,-z) (-x,+z) (+x,+z). The same order the HTML
// grid used, so the keyboard cursor still means what it meant.
//
// Palette, V370 §2.9 / §2.10 and §5.2. Nine value bands are deliberate and separated:
// shadowed soil, worked soil, mulch, deep foliage, mid foliage, timber, light foliage,
// gravel, and the bone-white plot tags. Two neutral families (bluestone edging, galvanised
// tank and steel) are there to put achromatic pixels in a frame that had none. Nothing is
// authored below sRGB luma 35.

import * as THREE from 'three';
import {
  BEDS,
  PLOTS_PER_BED,
  cropOf,
  plotIsRipe,
} from '../core/veggie-patch.js';
import {
  galvTexture,
  gravelTexture,
  leafTexture,
  paintTexture,
  paverTexture,
  renderTexture,
  soilTexture,
  surfaced,
  timberTexture,
  turfTexture,
} from './minigame-textures.js';
import { CROPS_A } from './veggie-pieces/crops-a.js';
import { CROPS_B } from './veggie-pieces/crops-b.js';
import {
  buildGround as buildGroundAAA,
  buildBedFrame as buildBedFrameAAA,
  buildFence as buildFenceAAA,
  buildOrchard as buildOrchardAAA,
} from './veggie-pieces/ground.js';
import {
  buildTank as buildTankAAA,
  buildShed as buildShedAAA,
  buildCompostCrate as buildCompostCrateAAA,
  setCompostVisual as setCompostVisualAAA,
  buildPottingBench as buildPottingBenchAAA,
  buildTableTools as buildTableToolsAAA,
  buildSprinkler as buildSprinklerAAA,
  buildHoe as buildHoeAAA,
  buildSeedTray as buildSeedTrayAAA,
  buildTumbler as buildTumblerAAA,
  buildHarvestCrate as buildHarvestCrateAAA,
} from './veggie-pieces/kit.js';
import { buildActionFx as buildActionFxAAA } from './veggie-pieces/fx.js';

export const FARM_W = 22;
export const FARM_D = 18;
export const SOIL_Y = 0.34;
export const BED_W = 3.0;
export const BED_D = 2.0;
export const BED_GAP = 0.92;
export const PLOT_W = (BED_W - 0.28) / 2;
export const PLOT_D = (BED_D - 0.28) / 2;

const BED_CX = BED_W / 2 + BED_GAP / 2;
const BED_CZ = BED_D / 2 + BED_GAP / 2;
/** Plants are authored at true scale and then given room. See `buildPlot`. */
const PLANT_SCALE = 1.48;

/** Garden-local centre of a bed. */
export function bedCentre(bed) {
  return {
    x: (bed % 2 === 0 ? -1 : 1) * BED_CX,
    z: (bed < 2 ? -1 : 1) * BED_CZ,
  };
}

/** Garden-local centre of a plot, at soil level. The label layer projects these. */
export function plotAnchor(index) {
  const bed = Math.floor(index / PLOTS_PER_BED);
  const i = index % PLOTS_PER_BED;
  const centre = bedCentre(bed);
  return {
    x: centre.x + (i % 2 === 0 ? -1 : 1) * (PLOT_W / 2 + 0.02),
    y: SOIL_Y,
    z: centre.z + (i < 2 ? -1 : 1) * (PLOT_D / 2 + 0.02),
  };
}

// --- material families -------------------------------------------------------
// Nine buckets, and each family owns one. Named so the report can quote them.

function M() {
  return {
    soil: surfaced(soilTexture('dry'), { rough: 0.96, repeat: 1.6 }),
    soilRich: surfaced(soilTexture('rich'), { rough: 0.97, repeat: 1.6 }),
    soilWet: surfaced(soilTexture('wet'), { rough: 0.88, repeat: 1.6 }),
    gravel: surfaced(gravelTexture(), { rough: 0.98, repeat: 5 }),
    turf: surfaced(turfTexture(), { rough: 0.95, repeat: 4 }),
    stone: surfaced(paverTexture('bluestone'), { rough: 0.86 }),
    timber: surfaced(timberTexture('bed'), { rough: 0.88 }),
    timberPale: surfaced(timberTexture('pale'), { rough: 0.86 }),
    timberDark: surfaced(timberTexture('dark'), { rough: 0.9 }),
    galv: surfaced(galvTexture(), { rough: 0.42, metal: 0.62 }),
    render: surfaced(renderTexture('#cdc2a8'), { rough: 0.94 }),
    leafDeep: surfaced(leafTexture('#3f5c2e'), { rough: 0.84 }),
    leafMid: surfaced(leafTexture('#5c8a44'), { rough: 0.82 }),
    leafLight: surfaced(leafTexture('#8fb45e'), { rough: 0.80 }),
    leafGrey: surfaced(leafTexture('#7d9472'), { rough: 0.84 }),
    leafDry: surfaced(leafTexture('#96966a'), { rough: 0.90 }),
    weed: surfaced(leafTexture('#a3bd63'), { rough: 0.86 }),
    terracotta: surfaced(paintTexture('#b06a45'), { rough: 0.92 }),
    tomato: surfaced(paintTexture('#d43528'), { rough: 0.48 }),
    pumpkin: surfaced(paintTexture('#e88922'), { rough: 0.58 }),
    radish: surfaced(paintTexture('#d42a5a'), { rough: 0.48 }),
    tuber: surfaced(paintTexture('#d8b878'), { rough: 0.82 }),
    pod: surfaced(paintTexture('#b8d44a'), { rough: 0.62 }),
    marrow: surfaced(paintTexture('#4f6f2c'), { rough: 0.56 }),
    tag: surfaced(renderTexture('#e2dcc8'), { rough: 0.9 }),
    paintBlue: surfaced(paintTexture('#5b7f96'), { rough: 0.6 }),
    paintGreen: surfaced(paintTexture('#4f7a34'), { rough: 0.62 }),
  };
}

let MATS = null;
function mats() {
  if (!MATS) MATS = M();
  return MATS;
}

/** Rebuild the material set — used by a probe that swapped the texture cache. */
export function resetVeggieMaterials() {
  MATS = null;
}

// --- primitives --------------------------------------------------------------

function box(group, material, w, h, d, x, y, z, rot = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  if (rot) mesh.rotation.set(rot[0] ?? 0, rot[1] ?? 0, rot[2] ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function cyl(group, material, rTop, rBottom, h, x, y, z, segs = 10) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segs), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function ball(group, material, r, x, y, z, segs = 8) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, segs, Math.max(4, segs - 2)), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/**
 * One leaf, as a thin tapered slab leaning out from a crown. `tilt` is the angle off
 * vertical, so a droughted plant is the same leaf with a bigger tilt — which is how a real
 * plant wilts, and cheaper than a second mesh.
 */
function blade(group, material, {
  x, y, z, len, wid, tilt, yaw, thick = 0.018,
}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(wid, thick, len), material);
  mesh.position.set(
    x + Math.sin(yaw) * Math.sin(tilt) * len * 0.5,
    y + Math.cos(tilt) * len * 0.5,
    z + Math.cos(yaw) * Math.sin(tilt) * len * 0.5,
  );
  mesh.rotation.order = 'YXZ';
  mesh.rotation.y = yaw;
  mesh.rotation.x = tilt - Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** A rosette: `count` blades fanned around a crown, deterministic by index. */
function rosette(group, material, { x, y, z, count, len, wid, tilt, phase = 0 }) {
  for (let i = 0; i < count; i += 1) {
    const yaw = phase + (i / count) * Math.PI * 2;
    const vary = 0.86 + ((i * 37) % 11) / 40;
    blade(group, material, {
      x, y, z, len: len * vary, wid, tilt: tilt * (0.9 + ((i * 13) % 7) / 24), yaw,
    });
  }
}

// --- the eight crops ---------------------------------------------------------
// Each takes the plot's growth fraction and its condition and returns geometry that a
// gardener would name without reading the label. Fruit only appears when the plot is ripe,
// because the fruit IS the readout: "is it ready" must be answerable from the model.

function foliageFor(m, plot, healthy, dry) {
  return plot.thirst > 0 ? m.leafDry : (plot.weeds > 0 ? dry : healthy);
}

function buildRadish(group, m, a, t, plot) {
  const leaf = foliageFor(m, plot, m.leafLight, m.leafMid);
  rosette(group, leaf, {
    x: a.x, y: a.y, z: a.z, count: 6, len: 0.16 + 0.16 * t, wid: 0.10, tilt: 1.02, phase: 0.3,
  });
  if (plotIsRipe(plot)) {
    ball(group, m.radish, 0.07, a.x, a.y + 0.035, a.z, 8);
    ball(group, m.radish, 0.055, a.x + 0.16, a.y + 0.03, a.z + 0.10, 8);
  }
}

function buildSilverbeet(group, m, a, t, plot) {
  const leaf = foliageFor(m, plot, m.leafMid, m.leafDeep);
  const h = 0.20 + 0.34 * t;
  for (let i = 0; i < 3; i += 1) {
    const ox = (i - 1) * 0.20;
    box(group, m.tag, 0.030, h * 0.5, 0.030, a.x + ox, a.y + h * 0.25, a.z);
    rosette(group, leaf, {
      x: a.x + ox, y: a.y + h * 0.42, z: a.z, count: 5, len: h * 0.72, wid: 0.13, tilt: 0.72, phase: i,
    });
  }
}

function buildBroadBean(group, m, a, t, plot) {
  const leaf = foliageFor(m, plot, m.leafGrey, m.leafDeep);
  const h = 0.26 + 0.46 * t;
  for (let i = 0; i < 3; i += 1) {
    const ox = (i - 1) * 0.19;
    box(group, m.leafDeep, 0.035, h, 0.035, a.x + ox, a.y + h / 2, a.z);
    for (let k = 1; k <= 3; k += 1) {
      const ly = a.y + (h * k) / 3.4;
      box(group, leaf, 0.20, 0.016, 0.09, a.x + ox, ly, a.z, [0, 0.4 * k, 0]);
    }
    if (plotIsRipe(plot)) {
      box(group, m.pod, 0.035, 0.16, 0.035, a.x + ox + 0.06, a.y + h * 0.55, a.z + 0.05, [0.3, 0, 0.2]);
    }
  }
}

function buildPotato(group, m, a, t, plot) {
  const leaf = foliageFor(m, plot, m.leafDeep, m.leafDry);
  box(group, m.soilWet, PLOT_W * 0.68, 0.09, PLOT_D * 0.62, a.x, a.y + 0.045, a.z);
  const h = 0.16 + 0.30 * t;
  for (let i = 0; i < 9; i += 1) {
    const ang = (i / 9) * Math.PI * 2;
    const r = 0.06 + (i % 3) * 0.06;
    box(
      group, leaf, 0.17, 0.055, 0.13,
      a.x + Math.cos(ang) * r, a.y + 0.09 + h * (0.35 + (i % 4) * 0.16), a.z + Math.sin(ang) * r,
      [0, ang, 0.16],
    );
  }
  if (plotIsRipe(plot)) {
    ball(group, m.tuber, 0.055, a.x - 0.20, a.y + 0.10, a.z + 0.16, 6);
    ball(group, m.tuber, 0.045, a.x - 0.11, a.y + 0.09, a.z + 0.21, 6);
  }
}

function buildGarlic(group, m, a, t, plot) {
  const leaf = foliageFor(m, plot, m.leafGrey, m.leafDeep);
  for (let i = 0; i < 5; i += 1) {
    const ox = (i - 2) * 0.11;
    rosette(group, leaf, {
      x: a.x + ox, y: a.y, z: a.z + ((i % 2) - 0.5) * 0.14,
      count: 4, len: 0.20 + 0.34 * t, wid: 0.045, tilt: 0.42, phase: i * 0.7,
    });
  }
  if (plotIsRipe(plot)) {
    ball(group, m.tag, 0.05, a.x + 0.22, a.y + 0.03, a.z - 0.14, 6);
  }
}

function buildZucchini(group, m, a, t, plot) {
  const leaf = foliageFor(m, plot, m.leafDeep, m.leafDry);
  const s = 0.5 + 0.5 * t;
  const droop = plot.thirst > 0 ? 0.9 : 0.42;
  // Held-up leaves on their own petioles. A flat plate lying on the soil reads as a green
  // card from the board camera, which is the §2.2 fault arrived at from the planting side.
  for (let i = 0; i < 5; i += 1) {
    const ang = (i / 5) * Math.PI * 2 + 0.4;
    const lift = 0.20 * s + (i % 2) * 0.08 * s;
    box(group, m.leafDeep, 0.028, lift, 0.028,
      a.x + Math.cos(ang) * 0.07, a.y + lift / 2, a.z + Math.sin(ang) * 0.07, [0, 0, Math.cos(ang) * 0.3]);
    box(
      group, leaf, 0.30 * s, 0.024, 0.26 * s,
      a.x + Math.cos(ang) * 0.20, a.y + lift, a.z + Math.sin(ang) * 0.20,
      [droop * 0.5, ang, droop],
    );
  }
  if (plotIsRipe(plot)) {
    const fruit = cyl(group, m.marrow, 0.048, 0.058, 0.26, a.x + 0.14, a.y + 0.06, a.z + 0.04, 8);
    fruit.rotation.set(0, 0.5, Math.PI / 2.1);
  }
}

function buildTomato(group, m, a, t, plot) {
  const leaf = foliageFor(m, plot, m.leafMid, m.leafDry);
  const h = 0.34 + 0.50 * t;
  box(group, m.timberPale, 0.030, h + 0.12, 0.030, a.x - 0.05, a.y + (h + 0.12) / 2, a.z - 0.04);
  box(group, m.leafDeep, 0.032, h, 0.032, a.x, a.y + h / 2, a.z);
  for (let k = 0; k < 4; k += 1) {
    const ly = a.y + 0.10 + (h - 0.10) * (k / 4);
    rosette(group, leaf, {
      x: a.x, y: ly, z: a.z, count: 4, len: 0.17, wid: 0.075, tilt: 1.16, phase: k * 0.8,
    });
  }
  if (plotIsRipe(plot)) {
    ball(group, m.tomato, 0.042, a.x + 0.09, a.y + h * 0.58, a.z + 0.03, 8);
    ball(group, m.tomato, 0.038, a.x - 0.07, a.y + h * 0.44, a.z - 0.05, 8);
    ball(group, m.tomato, 0.034, a.x + 0.02, a.y + h * 0.72, a.z + 0.07, 8);
  }
}

function buildPumpkin(group, m, a, t, plot) {
  const leaf = foliageFor(m, plot, m.leafDeep, m.leafDry);
  const s = 0.55 + 0.45 * t;
  const droop = plot.thirst > 0 ? 0.85 : 0.36;
  for (let i = 0; i < 6; i += 1) {
    const ang = (i / 6) * Math.PI * 2 + 0.9;
    const r = 0.12 + (i % 2) * 0.13;
    const lift = 0.16 * s + (i % 3) * 0.06 * s;
    box(group, m.leafDeep, 0.030, lift, 0.030,
      a.x + Math.cos(ang) * (r * 0.5), a.y + lift / 2, a.z + Math.sin(ang) * (r * 0.5));
    box(
      group, leaf, 0.34 * s, 0.024, 0.30 * s,
      a.x + Math.cos(ang) * r, a.y + lift, a.z + Math.sin(ang) * r,
      [droop * 0.6, ang, droop],
    );
  }
  box(group, m.leafDeep, 0.50 * s, 0.026, 0.030, a.x, a.y + 0.05, a.z + 0.12, [0, 0.3, 0]);
  if (plotIsRipe(plot)) {
    ball(group, m.pumpkin, 0.13, a.x + 0.16, a.y + 0.11, a.z - 0.10, 10).scale.set(1, 0.78, 1);
    box(group, m.timberPale, 0.03, 0.07, 0.03, a.x + 0.16, a.y + 0.22, a.z - 0.10);
  }
}

const CROP_BUILDERS = Object.freeze({
  ...CROPS_A,
  ...CROPS_B,
});

// --- plot dressing -----------------------------------------------------------

function buildWeeds(group, m, a, count) {
  for (let i = 0; i < count; i += 1) {
    const ox = (i % 2 === 0 ? -1 : 1) * (PLOT_W / 2 - 0.10);
    const oz = (i < 2 ? -1 : 1) * (PLOT_D / 2 - 0.09);
    rosette(group, m.weed, {
      x: a.x + ox, y: a.y, z: a.z + oz, count: 5, len: 0.15, wid: 0.030, tilt: 1.24, phase: i,
    });
    box(group, m.tag, 0.030, 0.030, 0.030, a.x + ox, a.y + 0.13, a.z + oz);
  }
}

/** A written plot tag, so an empty bed still reads as somebody's allotment. */
function buildTag(group, m, a, planted) {
  box(group, m.timberPale, 0.022, 0.13, 0.022,
    a.x - PLOT_W / 2 + 0.07, a.y + 0.065, a.z - PLOT_D / 2 + 0.07);
  box(group, planted ? m.tag : m.timberPale, 0.11, 0.055, 0.010,
    a.x - PLOT_W / 2 + 0.07, a.y + 0.145, a.z - PLOT_D / 2 + 0.07, [0, 0.3, 0]);
}

function buildPlot(group, m, index, plot) {
  const a = plotAnchor(index);
  const compost = Math.min(2, plot.compost ?? 0);
  // The bed surface itself is the readout for compost and for a legume's legacy.
  const surface = compost > 0 ? m.soilRich : (plot.enriched ? m.soilWet : m.soil);
  box(group, surface, PLOT_W - 0.03, 0.05, PLOT_D - 0.03, a.x, a.y - 0.015, a.z);
  if (compost > 0) {
    for (let i = 0; i < compost * 3; i += 1) {
      const ang = (i / (compost * 3)) * Math.PI * 2;
      box(group, m.timberDark, 0.09, 0.022, 0.06,
        a.x + Math.cos(ang) * 0.26, a.y + 0.022, a.z + Math.sin(ang) * 0.16, [0, ang, 0]);
    }
  }
  const crop = cropOf(plot.crop);
  if (crop) {
    const t = Math.max(0, Math.min(1, crop.quarters ? plot.ticks / crop.quarters : 1));
    // Built at the anchor, then scaled about it. Authoring every crop 30 % larger by hand
    // would have meant thirty edits and a second round of trigonometry; the plant is the
    // subject of this screen and it should fill its plot.
    const plant = new THREE.Group();
    (CROP_BUILDERS[crop.id] ?? buildSilverbeet)(plant, m, { x: 0, y: 0, z: 0 }, t, plot);
    plant.scale.setScalar(PLANT_SCALE);
    plant.position.set(a.x, a.y, a.z);
    group.add(plant);
  } else if (plot.enriched) {
    // Bean stubble. The bed that fed the next crop shows what it was.
    for (let i = 0; i < 3; i += 1) {
      box(group, m.timberPale, 0.026, 0.07, 0.026, a.x + (i - 1) * 0.17, a.y + 0.035, a.z + 0.04);
    }
  }
  if (plot.weeds > 0) buildWeeds(group, m, a, Math.min(2, plot.weeds));
  buildTag(group, m, a, Boolean(crop));
}

// --- the fixed garden --------------------------------------------------------

function buildBedFrame(group, m, bed) {
  const c = bedCentre(bed);
  const t = 0.12;
  const h = SOIL_Y;
  // Sleepers with a proud capping rail — §2.4's "member with section", at allotment scale.
  box(group, m.timber, BED_W, h, t, c.x, h / 2, c.z - BED_D / 2 + t / 2);
  box(group, m.timber, BED_W, h, t, c.x, h / 2, c.z + BED_D / 2 - t / 2);
  box(group, m.timber, t, h, BED_D - t * 2, c.x - BED_W / 2 + t / 2, h / 2, c.z);
  box(group, m.timber, t, h, BED_D - t * 2, c.x + BED_W / 2 - t / 2, h / 2, c.z);
  box(group, m.timberPale, BED_W + 0.06, 0.035, t + 0.05, c.x, h + 0.017, c.z - BED_D / 2 + t / 2);
  box(group, m.timberPale, BED_W + 0.06, 0.035, t + 0.05, c.x, h + 0.017, c.z + BED_D / 2 - t / 2);
  box(group, m.timberPale, t + 0.05, 0.035, BED_D - 0.02, c.x - BED_W / 2 + t / 2, h + 0.017, c.z);
  box(group, m.timberPale, t + 0.05, 0.035, BED_D - 0.02, c.x + BED_W / 2 - t / 2, h + 0.017, c.z);
  for (const px of [-1, 1]) {
    for (const pz of [-1, 1]) {
      box(group, m.timberDark, 0.17, h + 0.14, 0.17,
        c.x + px * (BED_W / 2 - 0.06), (h + 0.14) / 2, c.z + pz * (BED_D / 2 - 0.06));
    }
  }
  // Fill, one value below the plot surfaces so the plots read as separate units.
  box(group, m.soilWet, BED_W - t * 2, h - 0.06, BED_D - t * 2, c.x, (h - 0.06) / 2 + 0.02, c.z);
}

function buildTank(group, m, x, z) {
  cyl(group, m.galv, 0.62, 0.62, 1.62, x, 0.81, z, 16);
  for (const y of [0.34, 0.86, 1.38]) cyl(group, m.galv, 0.65, 0.65, 0.05, x, y, z, 16);
  cyl(group, m.galv, 0.30, 0.62, 0.20, x, 1.72, z, 16);
  box(group, m.stone, 1.50, 0.12, 1.50, x, 0.06, z);
  // Downpipe, tap and a bucket under it: the water in this game is a real constraint.
  cyl(group, m.galv, 0.055, 0.055, 1.70, x + 0.60, 0.85, z + 0.30, 8);
  box(group, m.paintGreen, 0.10, 0.09, 0.09, x + 0.52, 0.36, z + 0.56);
  cyl(group, m.paintBlue, 0.16, 0.13, 0.24, x + 0.52, 0.12, z + 0.80, 10);
}

function buildCompostCrate(group, m, x, z) {
  const w = 1.10;
  const d = 0.86;
  for (let i = 0; i < 3; i += 1) {
    const y = 0.10 + i * 0.20;
    box(group, m.timberDark, w, 0.15, 0.06, x, y, z - d / 2);
    box(group, m.timberDark, w, 0.15, 0.06, x, y, z + d / 2);
    box(group, m.timberDark, 0.06, 0.15, d, x - w / 2, y, z);
    box(group, m.timberDark, 0.06, 0.15, d, x + w / 2, y, z);
  }
  box(group, m.soilRich, w - 0.12, 0.16, d - 0.12, x, 0.56, z);
  box(group, m.weed, 0.28, 0.05, 0.16, x + 0.16, 0.65, z - 0.10, [0, 0.5, 0.1]);
  box(group, m.leafDry, 0.22, 0.04, 0.14, x - 0.18, 0.64, z + 0.12, [0, 1.1, 0.08]);
}

function buildPottingBench(group, m, x, z) {
  const w = 1.60;
  const d = 0.62;
  box(group, m.timberPale, w, 0.07, d, x, 0.82, z);
  box(group, m.timber, w, 0.06, d - 0.16, x, 0.36, z);
  for (const px of [-1, 1]) {
    for (const pz of [-1, 1]) {
      box(group, m.timber, 0.08, 0.82, 0.08, x + px * (w / 2 - 0.07), 0.41, z + pz * (d / 2 - 0.07));
    }
  }
  for (let i = 0; i < 3; i += 1) {
    cyl(group, m.terracotta, 0.11, 0.085, 0.17, x - 0.5 + i * 0.30, 0.94, z - 0.06, 10);
  }
  box(group, m.galv, 0.34, 0.10, 0.24, x + 0.48, 0.90, z + 0.04);
  // Watering can — neutral metal, and the tank's argument in object form.
  cyl(group, m.galv, 0.11, 0.13, 0.24, x + 0.18, 0.99, z + 0.16, 10);
  cyl(group, m.galv, 0.022, 0.022, 0.34, x + 0.34, 1.02, z + 0.16, 6).rotation.set(0, 0, 1.1);
}

/**
 * The shed roof, §2.4 — the one element the r2 critic named as unfinished, and the tank three
 * metres away is the reason: it shows proud hoop bands with their own shadow while the roof
 * was a single flat sheet with no seams, no battens, no gutter and no fascia section.
 *
 * A skillion in corrugated steel, built in the roof's OWN tilted frame so the seams stay on
 * the plane instead of being pitched by hand: six standing seams raised proud of the deck,
 * a fascia board with section at the low eave, a half-round gutter on brackets, and a
 * downpipe that runs to the ground — which is also where the tank's water comes from.
 */
function buildShedRoof(group, m, x, y, z, w, d, pitch) {
  const roof = new THREE.Group();
  roof.position.set(x, y, z);
  roof.rotation.z = pitch;
  // Deck, then the seams: raised members with their own shadow, not a texture.
  box(roof, m.galv, w, 0.055, d, 0, 0, 0);
  const seams = 6;
  for (let i = 0; i < seams; i += 1) {
    const ox = (-(seams - 1) / 2 + i) * (w / seams);
    box(roof, m.galv, 0.05, 0.085, d + 0.02, ox, 0.062, 0);
  }
  // Ridge capping at the high edge and a fascia board with section at the low eave.
  box(roof, m.galv, 0.12, 0.10, d + 0.04, -w / 2 + 0.06, 0.06, 0);
  box(roof, m.timberDark, 0.07, 0.16, d + 0.04, w / 2 - 0.02, -0.06, 0);
  // Half-round gutter on two brackets, hung off the fascia.
  const gutter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, d + 0.02, 8, 1, false, 0, Math.PI),
    m.galv,
  );
  gutter.rotation.set(Math.PI / 2, 0, Math.PI);
  gutter.position.set(w / 2 + 0.06, -0.06, 0);
  gutter.castShadow = true;
  roof.add(gutter);
  for (const bz of [-d / 2 + 0.22, d / 2 - 0.22]) {
    box(roof, m.galv, 0.20, 0.035, 0.035, w / 2 + 0.02, -0.10, bz);
  }
  group.add(roof);
  // Downpipe from the gutter outlet to the ground, outside the roof frame.
  const dropX = x + (w / 2) * Math.cos(pitch) + 0.06;
  cyl(group, m.galv, 0.045, 0.045, y - 0.10, dropX, (y - 0.10) / 2, z + d / 2 - 0.24, 8);
  box(group, m.galv, 0.10, 0.05, 0.10, dropX, 0.02, z + d / 2 - 0.24);
}

function buildShed(group, m, x, z) {
  box(group, m.render, 1.90, 1.70, 1.30, x, 0.85, z);
  buildShedRoof(group, m, x, 1.76, z, 2.10, 1.50, 0.10);
  box(group, m.timberDark, 0.62, 1.34, 0.05, x - 0.30, 0.67, z + 0.66);
  box(group, m.galv, 0.06, 0.06, 0.06, x - 0.06, 0.74, z + 0.69);
  box(group, m.stone, 2.10, 0.12, 1.50, x, 0.06, z);
  for (let i = 0; i < 3; i += 1) {
    cyl(group, m.terracotta, 0.13, 0.10, 0.20, x + 0.72, 0.22, z + 0.30 + i * 0.34, 10);
    rosette(group, m.leafMid, {
      x: x + 0.72, y: 0.32, z: z + 0.30 + i * 0.34, count: 5, len: 0.20, wid: 0.06, tilt: 0.9, phase: i,
    });
  }
}

function buildGround(group, m) {
  const w = FARM_W;
  const d = FARM_D;
  // A real paddock, not a floating tile: deep earth under turf, then the worked gravel yard.
  box(group, m.soilWet, w + 8, 1.4, d + 8, 0, -0.78, 0.2);
  box(group, m.turf, w + 6.4, 0.18, d + 6.4, 0, -0.08, 0.2);
  box(group, m.gravel, w * 0.72, 0.10, d * 0.62, 0, 0.01, 0.15);
  box(group, m.stone, 1.15, 0.06, d * 0.58, 0, 0.05, 0.15);
  box(group, m.stone, w * 0.62, 0.06, 0.95, 0, 0.05, 0.15);
}

function buildFence(group, m) {
  const halfW = FARM_W / 2;
  const halfD = FARM_D / 2;
  const y0 = 0.02;
  const postH = 1.15;
  const railY = [0.38, 0.78];
  const post = (x, z) => {
    box(group, m.timberDark, 0.13, postH, 0.13, x, y0 + postH / 2, z);
    box(group, m.timberPale, 0.16, 0.06, 0.16, x, y0 + postH + 0.02, z);
  };
  const rail = (x, z, w, d) => {
    for (const y of railY) box(group, m.timber, w, 0.07, d, x, y, z);
  };
  const step = 2.15;
  for (let x = -halfW; x <= halfW + 0.01; x += step) {
    post(x, -halfD);
    post(x, halfD);
  }
  for (let z = -halfD + step; z < halfD - 0.4; z += step) {
    post(-halfW, z);
    post(halfW, z);
  }
  rail(0, -halfD, FARM_W, 0.07);
  rail(0, halfD, FARM_W * 0.38, 0.07);
  rail(-FARM_W * 0.32, halfD, FARM_W * 0.28, 0.07);
  rail(FARM_W * 0.32, halfD, FARM_W * 0.28, 0.07);
  rail(-halfW, 0, 0.07, FARM_D);
  rail(halfW, 0, 0.07, FARM_D);
  // Gate on the near side, slightly open.
  box(group, m.timberPale, 1.55, 1.02, 0.07, 0.72, 0.58, halfD + 0.18, [0, -0.32, 0]);
  box(group, m.timberPale, 1.55, 1.02, 0.07, -0.72, 0.58, halfD + 0.18, [0, 0.32, 0]);
}

function buildOrchard(group, m) {
  for (let i = 0; i < 5; i += 1) {
    const x = -FARM_W / 2 + 1.4 + i * 1.55;
    const z = -FARM_D / 2 + 1.35;
    cyl(group, m.timberDark, 0.09, 0.13, 0.85, x, 0.48, z, 8);
    ball(group, m.leafDeep, 0.55, x, 1.15, z, 8);
    ball(group, m.leafMid, 0.38, x + 0.18, 1.28, z + 0.10, 7);
  }
}

function buildSprinkler(group, m, x, z) {
  cyl(group, m.galv, 0.05, 0.05, 0.72, x, 0.36, z, 8);
  cyl(group, m.paintGreen, 0.12, 0.12, 0.08, x, 0.76, z, 10);
  for (let i = 0; i < 4; i += 1) {
    const ang = (i / 4) * Math.PI * 2;
    box(group, m.galv, 0.42, 0.03, 0.04, x + Math.cos(ang) * 0.18, 0.78, z + Math.sin(ang) * 0.18, [0, ang, 0]);
  }
}

function buildHoe(group, m, x, z) {
  box(group, m.timberPale, 0.05, 1.05, 0.05, x, 0.62, z, [0, 0, 0.35]);
  box(group, m.galv, 0.28, 0.04, 0.18, x + 0.22, 0.18, z);
}

function buildSeedTray(group, m, x, z) {
  box(group, m.timberPale, 0.72, 0.07, 0.48, x, 0.18, z);
  box(group, m.soilRich, 0.64, 0.05, 0.40, x, 0.23, z);
  for (let i = 0; i < 6; i += 1) {
    const ox = ((i % 3) - 1) * 0.18;
    const oz = (i < 3 ? -1 : 1) * 0.11;
    cyl(group, m.terracotta, 0.055, 0.045, 0.08, x + ox, 0.28, z + oz, 8);
    rosette(group, m.leafLight, {
      x: x + ox, y: 0.32, z: z + oz, count: 4, len: 0.08, wid: 0.03, tilt: 0.7, phase: i,
    });
  }
}

function buildTumbler(group, m, x, z) {
  cyl(group, m.paintGreen, 0.32, 0.32, 0.72, x, 0.58, z, 12).rotation.set(0, 0, Math.PI / 2);
  cyl(group, m.timberDark, 0.04, 0.04, 0.70, x - 0.38, 0.38, z, 8);
  cyl(group, m.timberDark, 0.04, 0.04, 0.70, x + 0.38, 0.38, z, 8);
  box(group, m.galv, 0.10, 0.10, 0.10, x, 0.90, z);
  box(group, m.soilRich, 0.18, 0.08, 0.18, x, 0.28, z + 0.22);
}

function buildHarvestCrate(group, m, x, z) {
  box(group, m.timberPale, 0.70, 0.08, 0.50, x, 0.10, z);
  box(group, m.timber, 0.70, 0.28, 0.06, x, 0.26, z - 0.22);
  box(group, m.timber, 0.70, 0.28, 0.06, x, 0.26, z + 0.22);
  box(group, m.timber, 0.06, 0.28, 0.50, x - 0.32, 0.26, z);
  box(group, m.timber, 0.06, 0.28, 0.50, x + 0.32, 0.26, z);
  ball(group, m.tomato, 0.07, x - 0.12, 0.22, z, 8);
  ball(group, m.pumpkin, 0.09, x + 0.12, 0.22, z + 0.04, 8).scale.set(1, 0.78, 1);
}

function addKitPiece(group, id, builder, x, z, m) {
  const piece = new THREE.Group();
  piece.name = `kit-${id}`;
  piece.userData.equipment = id;
  builder(piece, m, x, z);
  group.add(piece);
}

/** Bought kit, rebuilt when the tin buys something. */
export function buildVeggieKit(patch) {
  const m = mats();
  const group = new THREE.Group();
  group.name = 'veggie-kit';
  const kit = patch?.kit ?? {};
  if (kit.tray) addKitPiece(group, 'tray', buildSeedTrayAAA, BED_CX - 0.15, BED_CZ + BED_D / 2 + 0.55, m);
  if (kit.sprinkler) addKitPiece(group, 'sprinkler', buildSprinklerAAA, 0, BED_CZ + BED_D / 2 + 0.15, m);
  if (kit.hoe) addKitPiece(group, 'hoe', buildHoeAAA, BED_CX + BED_W / 2 + 0.45, 0.25, m);
  if (kit.tumbler) addKitPiece(group, 'tumbler', buildTumblerAAA, -(BED_CX + BED_W / 2) + 0.25, BED_CZ + BED_D / 2 + 0.95, m);
  if (kit.crate) addKitPiece(group, 'crate', buildHarvestCrateAAA, BED_CX + 0.55, BED_CZ + BED_D / 2 + 0.55, m);
  return group;
}

/** Short-lived Three.js glyph for the tool just used. */
export function buildActionFx(tool, x, y, z) {
  return buildActionFxAAA(tool, x, y, z);
}

export function setCompostVisual(root, amount) {
  setCompostVisualAAA(root, amount);
}

// --- assembly ----------------------------------------------------------------

/**
 * The whole garden for a patch record. Returns a group in garden-local metres.
 * `fixtures: false` builds only the plants, which is what an incremental repaint needs.
 */
export function buildVeggieGarden(patch, { fixtures = true } = {}) {
  const m = mats();
  const root = new THREE.Group();
  root.name = 'veggie-garden';
  if (fixtures) {
    buildGroundAAA(root, m);
    buildFenceAAA(root, m);
    buildOrchardAAA(root, m);
    for (let bed = 0; bed < BEDS; bed += 1) buildBedFrameAAA(root, m, bed);
    const halfZ = BED_CZ + BED_D / 2;
    buildTankAAA(root, m, -(BED_CX + BED_W / 2) - 0.05, -halfZ - 0.85);
    buildShedAAA(root, m, BED_CX + BED_W / 2 - 0.35, -halfZ - 1.05);
    buildCompostCrateAAA(root, m, -(BED_CX + BED_W / 2) + 0.25, halfZ + 0.85, patch?.compost ?? 2);
    buildPottingBenchAAA(root, m, 0.15, halfZ + 1.48);
    buildTableToolsAAA(root, m, 0.15, halfZ + 1.48);
  }
  const plants = new THREE.Group();
  plants.name = 'veggie-plants';
  const plots = patch?.plots ?? [];
  for (let i = 0; i < plots.length; i += 1) buildPlot(plants, m, i, plots[i]);
  root.add(plants);
  return root;
}

/** Just the plants, for the repaint path — cheaper than rebuilding the shed every click. */
export function buildVeggiePlants(patch) {
  const m = mats();
  const group = new THREE.Group();
  group.name = 'veggie-plants';
  const plots = patch?.plots ?? [];
  for (let i = 0; i < plots.length; i += 1) buildPlot(group, m, i, plots[i]);
  return group;
}

/** The brass marker under the keyboard/pointer cursor. */
export function buildPlotCursor() {
  const group = new THREE.Group();
  group.name = 'veggie-cursor';
  const material = new THREE.MeshBasicMaterial({
    color: '#e8c069', transparent: true, opacity: 0.9, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(PLOT_W * 0.40, PLOT_W * 0.46, 20), material);
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);
  return group;
}

/** Bounds a camera needs to frame the whole garden. */
export const GARDEN_EXTENT = Object.freeze({
  w: FARM_W,
  d: FARM_D,
});

/** Four beds, paths, and the kit that sits on their shoulders — not the orchard fence. */
export const BED_FRAME = Object.freeze({
  w: BED_W * 2 + BED_GAP + 3.4,
  d: BED_D * 2 + BED_GAP + 3.4,
});
