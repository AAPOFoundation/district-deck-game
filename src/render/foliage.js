// District Deck V3.31 — street trees (commercial/landscape lane C).
//
// Six instanced street/park forms: plane, eucalyptus, Norfolk pine, jacaranda,
// pencil cypress and staked sapling. Shore palms and shared shrub helpers retain
// their existing forms. Street crowns use layered leaf sprays on visible forks,
// barked and flared boles, planted pits and painted ground contact.
//
// Everything here is presentation. No sim state, no third-party network, no clock,
// no Math.random. Plane and jacaranda read one bundled local compact atlas.
// Per-instance variation comes from hashSeed / unitFromKey and nothing else, and the
// pre-existing `tree-age:` / `tree-yaw:` sequences are consumed in their original order
// so an existing board keeps its existing tree sizes and rotations.

import * as THREE from 'three';
import { BLOCK, ROAD, CORRIDOR, PITCH, TILE } from '../core/grid.js';
import { hashSeed, makeRng } from './textures.js';
import { treeFallLift } from './sway.js';
import { PUBLIC_PIT_LEVELS, publicPitSupportAt } from './public-tree-pits.js';
import { publicPitGeometry } from './public-tree-pit-geometry.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** City model id → one of the five batched silhouettes. */
const MODEL_TO_SPECIES = Object.freeze({
  'plane-tree-london': 'plane',
  'australian-eucalyptus': 'eucalypt',
  'australian-jacaranda': 'plane', // W3-C variety law: jacaranda streets are plane streets
  'australian-bottlebrush': 'bottlebrush',
  'melbourne-beach-palm': 'palm',
});

// ---------------------------------------------------------------------------
// Species library
//
// `height` and `crownRadius` on the `tree` entry are read by board.js when it lays out
// street furniture (crown envelopes keep benches out from under a canopy). They are the
// same numbers they have always been and must not drift from a foliage change.
//
// Form is authored in unit-tree space: the geometry is built with the ground at y = 0 and
// the crown reaching roughly y = `top`, then instanced at scale `height * instanceScale`.
// ---------------------------------------------------------------------------

const SHARED = { height: 5.2, crownRadius: 1.15 };

// R1 plate correction. The first pass authored boles at baobab girth: on
// `r1a-trees-close.png` the bole filled its own tree pit and the cast-iron grate was
// entirely inside the trunk. Radii below are authored at drawing girth and taken down to
// street-tree proportion here, so one number tunes the whole library.
const BOLE_GIRTH = 0.44;
const LIMB_GIRTH = 0.54;

/**
 * @typedef {object} LimbSpec
 * @property {number} az     azimuth in radians
 * @property {number} reach  horizontal reach in unit-tree space
 * @property {number} rise   vertical gain over the limb
 * @property {number} droop  downward curve applied as t²
 * @property {number} r      radius at the fork
 * @property {number} tipR   radius at the tip
 */

// R2, critic D5. The four forms did not separate in the avenue row: they shared one crown
// vocabulary and differed only in scale, lean and yaw. What separates a tree line at board
// altitude is the *envelope* — how much bare bole there is before the first fork, how wide
// the crown is against how tall, and how many masses it is built from. Those three now
// differ per species by a wide margin: the eucalypt is 1.24 tall on a 0.66 bole with six
// small masses, the jacaranda is 0.94 tall on a 0.28 bole with a 0.96 spread, and the
// bottlebrush is a 0.70 bush. `blades` is the leaf-card count per mass and is the other
// lever — an open eucalypt mass is sparser than a plane's.
//
// `twigs` is gone. Free-ending twigs were the cause of critic D7 ("limbs stop in mid-air");
// the secondary ramification is now generated per leaf mass in `buildSpeciesGeometry`, so
// every branch terminates inside foliage and every mass sits on a fork instead of on a
// tube end. That is more secondary structure than the authored list carried, not less.
// I4 sheet forms use the game's existing unit-tree scale, never sheet pixels.
function uprightStreetForm(id, label, top, spread, boleTop, clusters) {
  return {
    id, label, top, spread, boleTop, boleR: id === 'sapling' ? 0.031 : 0.065,
    boleTopR: 0.014, boleLean: [0.009, -0.008], boleFlare: 0.65,
    bark: id === 'sapling' ? '#998367' : '#796344', barkMode: 'fibrous',
    blades: 36, leafBias: [0.82, 0.98, 0.72],
    limbs: [0, 2.1, 4.2].map(az => ({az, reach: spread * 0.18, rise: top * 0.16,
      droop: 0.01, r: 0.021, tipR: 0.008})),
    stub: {az: 1.4, reach: 0.04, rise: 0.02, droop: 0, r: 0.012, tipR: 0.007},
    stubFrom: boleTop * 0.6, clusters,
    shed: {x: spread * 0.3, y: top * 0.55, z: 0.04, yaw: 1, scale: 0.6},
    debris: {x: 0.3, y: 0, z: 0.2, yaw: 1, scale: 0.6},
  };
}
export const STREET_TREE_VARIANTS = Object.freeze(['plane', 'eucalypt', 'norfolk', 'jacaranda', 'cypress', 'sapling']);

export const SPECIES_FORM = Object.freeze({
  norfolk: uprightStreetForm('norfolk', 'Norfolk pine', 1.16, 0.66, 1.08,
    Array.from({length: 8}, (_, i) => ({x: 0, y: 0.29 + i * 0.12, z: 0,
      r: 0.35 - i * 0.042, flat: 0.24, tone: 0.84 + i * 0.045}))),
  cypress: uprightStreetForm('cypress', 'Pencil cypress', 1.35, 0.27, 0.36,
    Array.from({length: 8}, (_, i) => ({x: Math.sin(i * 2.4) * 0.025,
      y: 0.42 + i * 0.12, z: Math.cos(i * 2.4) * 0.022,
      r: 0.16 - i * 0.015, flat: 1.8, tone: 0.83 + i * 0.045}))),
  sapling: uprightStreetForm('sapling', 'Staked sapling', 0.58, 0.36, 0.27,
    Array.from({length: 5}, (_, i) => ({x: Math.sin(i * 2.4) * 0.10,
      y: 0.34 + i * 0.042, z: Math.cos(i * 2.4) * 0.08,
      r: 0.095 - i * 0.004, flat: 0.75, tone: 0.85 + i * 0.07}))),
  // London plane — the archetypal avenue tree. Straight bole, high fork, broad dome,
  // camouflage bark.
  plane: {
    id: 'plane',
    label: 'London plane',
    top: 1.04,
    spread: 0.80,
    boleTop: 0.46,
    boleR: 0.104,
    boleTopR: 0.055,
    boleLean: [0.018, -0.012],
    boleFlare: 0.72,
    bark: '#8d7a5c',
    barkMode: 'mottle',
    blades: 66,
    leafBias: [0.88, 0.94, 0.62],
    limbs: [
      { az: 2.55, reach: 0.22, rise: 0.22, droop: 0.05, r: 0.046, tipR: 0.015 },
      { az: 0.35, reach: 0.20, rise: 0.24, droop: 0.04, r: 0.044, tipR: 0.014 },
      { az: 4.55, reach: 0.16, rise: 0.26, droop: 0.03, r: 0.041, tipR: 0.013 },
    ],
    // A snapped limb: short, held against the bole, torn tip. Never a free limb in air.
    stub: { az: 1.45, reach: 0.115, rise: 0.05, droop: 0.02, r: 0.033, tipR: 0.024 },
    stubFrom: 0.50,
    clusters: [
      { x: -0.34, y: 0.84, z: 0.16, r: 0.245, flat: 0.84, tone: 0.96 },
      { x: -0.05, y: 1.00, z: -0.12, r: 0.255, flat: 0.82, tone: 1.18 },
      { x: 0.30, y: 0.90, z: 0.19, r: 0.235, flat: 0.84, tone: 1.08 },
      { x: 0.36, y: 0.70, z: -0.22, r: 0.210, flat: 0.88, tone: 0.76 },
      { x: -0.38, y: 0.68, z: -0.24, r: 0.215, flat: 0.88, tone: 0.68 },
      { x: 0.02, y: 0.75, z: 0.40, r: 0.205, flat: 0.90, tone: 0.84 },
    ],
    shed: { x: -0.34, y: 0.72, z: -0.30, yaw: 2.4, scale: 1.0 },
    debris: { x: -0.62, y: 0.0, z: -0.52, yaw: 2.4, scale: 0.92 },
  },

  // Eucalypt — tall, slim, high open crown with real sky through it, pale ribboned bark.
  eucalypt: {
    id: 'eucalypt',
    label: 'Eucalypt',
    top: 1.26,
    spread: 0.48,
    boleTop: 0.66,
    boleR: 0.086,
    boleTopR: 0.042,
    boleLean: [-0.03, 0.024],
    boleFlare: 0.54,
    bark: '#a49b8a',
    barkMode: 'ribbon',
    blades: 72,
    leafBias: [0.92, 1.0, 1.02],
    limbs: [
      { az: 1.15, reach: 0.26, rise: 0.40, droop: 0.02, r: 0.040, tipR: 0.012 },
      { az: 3.85, reach: 0.24, rise: 0.44, droop: 0.02, r: 0.038, tipR: 0.011 },
      { az: 5.65, reach: 0.18, rise: 0.36, droop: 0.05, r: 0.031, tipR: 0.010 },
    ],
    stub: { az: 4.70, reach: 0.100, rise: -0.02, droop: 0.02, r: 0.026, tipR: 0.018 },
    stubFrom: 0.72,
    clusters: [
      { x: 0.22, y: 1.12, z: 0.08, r: 0.180, flat: 0.88, tone: 1.12 },
      { x: -0.20, y: 1.15, z: -0.10, r: 0.170, flat: 0.90, tone: 0.98 },
      { x: 0.02, y: 1.24, z: 0.03, r: 0.158, flat: 0.86, tone: 1.22 },
      { x: -0.29, y: 0.96, z: 0.20, r: 0.158, flat: 0.94, tone: 0.72 },
      { x: 0.30, y: 0.91, z: -0.19, r: 0.152, flat: 0.95, tone: 0.78 },
    ],
    shed: { x: 0.28, y: 0.94, z: -0.16, yaw: 5.4, scale: 0.82 },
    debris: { x: 0.58, y: 0.0, z: -0.44, yaw: 5.4, scale: 0.84 },
  },

  // Jacaranda — low fork, limbs that spread nearly flat, a wide layered umbrella.
  jacaranda: {
    id: 'jacaranda',
    label: 'Jacaranda',
    top: 1.16,
    spread: 0.70,
    boleTop: 0.36,
    boleR: 0.102,
    boleTopR: 0.064,
    boleLean: [0.026, 0.020],
    boleFlare: 0.82,
    bark: '#7d6849',
    barkMode: 'fine',
    blades: 60,
    leafBias: [1.0, 0.98, 1.03],
    limbs: [
      { az: 0.55, reach: 0.50, rise: 0.30, droop: 0.10, r: 0.048, tipR: 0.014 },
      { az: 2.35, reach: 0.48, rise: 0.26, droop: 0.11, r: 0.046, tipR: 0.013 },
      { az: 3.95, reach: 0.44, rise: 0.32, droop: 0.08, r: 0.043, tipR: 0.013 },
      { az: 5.35, reach: 0.40, rise: 0.24, droop: 0.11, r: 0.039, tipR: 0.012 },
    ],
    stub: { az: 3.05, reach: 0.105, rise: 0.02, droop: 0.02, r: 0.030, tipR: 0.021 },
    stubFrom: 0.34,
    clusters: [
      { x: 0.312, y: 0.750, z: 0.130, r: 0.198, flat: 0.725, tone: 1.02 },
      { x: -0.234, y: 0.712, z: 0.273, r: 0.192, flat: 0.750, tone: 0.82 },
      { x: -0.338, y: 0.787, z: -0.117, r: 0.194, flat: 0.725, tone: 1.08 },
      { x: 0.117, y: 0.825, z: -0.305, r: 0.187, flat: 0.750, tone: 0.78 },
      { x: 0.013, y: 1.000, z: 0.000, r: 0.202, flat: 0.700, tone: 1.20 },
      { x: 0.221, y: 0.663, z: 0.254, r: 0.167, flat: 0.800, tone: 0.66 },
    ],
    shed: { x: -0.50, y: 0.62, z: -0.16, yaw: 2.1, scale: 0.98 },
    debris: { x: -0.66, y: 0.0, z: 0.48, yaw: 2.1, scale: 0.95 },
  },

  // Bottlebrush — multi-stem, low and dense. Also carries the shore planting at small scale.
  bottlebrush: {
    id: 'bottlebrush',
    label: 'Bottlebrush',
    top: 0.72,
    spread: 0.52,
    boleTop: 0.15,
    boleR: 0.085,
    boleTopR: 0.058,
    boleLean: [0.012, 0.014],
    boleFlare: 0.62,
    bark: '#6a5138',
    barkMode: 'fibrous',
    blades: 54,
    leafBias: [0.95, 1.0, 0.90],
    limbs: [
      { az: 0.40, reach: 0.24, rise: 0.34, droop: 0.03, r: 0.040, tipR: 0.014 },
      { az: 2.05, reach: 0.22, rise: 0.38, droop: 0.02, r: 0.038, tipR: 0.013 },
      { az: 3.60, reach: 0.26, rise: 0.30, droop: 0.04, r: 0.037, tipR: 0.013 },
      { az: 5.15, reach: 0.18, rise: 0.36, droop: 0.02, r: 0.034, tipR: 0.012 },
    ],
    stub: { az: 5.90, reach: 0.085, rise: 0.02, droop: 0.01, r: 0.024, tipR: 0.017 },
    stubFrom: 0.18,
    clusters: [
      { x: 0.22, y: 0.50, z: 0.12, r: 0.190, flat: 0.86, tone: 1.04 },
      { x: -0.19, y: 0.53, z: -0.15, r: 0.182, flat: 0.86, tone: 0.86 },
      { x: 0.01, y: 0.63, z: -0.02, r: 0.180, flat: 0.82, tone: 1.18 },
      { x: -0.26, y: 0.39, z: 0.21, r: 0.158, flat: 0.90, tone: 0.68 },
      { x: 0.27, y: 0.37, z: -0.19, r: 0.152, flat: 0.92, tone: 0.74 },
    ],
    shed: { x: 0.18, y: 0.50, z: 0.10, yaw: 0.7, scale: 0.70 },
    debris: { x: 0.44, y: 0.0, z: 0.34, yaw: 0.7, scale: 0.70 },
  },

  // Beach palm — a curved clean stem with six petiole-supported, flattened masses.
  // They are stretched along six different headings below, so the crown has volume
  // without falling back to the crossed-billboard palm called out by the blind critic.
  palm: {
    id: 'palm',
    label: 'Beach palm',
    top: 1.24,
    spread: 0.68,
    boleTop: 0.86,
    boleR: 0.074,
    boleTopR: 0.050,
    boleLean: [0.055, -0.026],
    boleFlare: 0.46,
    bark: '#8a6847',
    barkMode: 'fibrous',
    blades: 42,
    leafBias: [0.84, 1.04, 0.74],
    limbs: [
      { az: 0.10, reach: 0.43, rise: 0.10, droop: 0.14, r: 0.031, tipR: 0.009 },
      { az: 1.18, reach: 0.45, rise: 0.08, droop: 0.16, r: 0.030, tipR: 0.009 },
      { az: 2.30, reach: 0.42, rise: 0.12, droop: 0.13, r: 0.030, tipR: 0.008 },
      { az: 3.40, reach: 0.46, rise: 0.06, droop: 0.17, r: 0.029, tipR: 0.008 },
      { az: 4.50, reach: 0.40, rise: 0.13, droop: 0.12, r: 0.028, tipR: 0.008 },
      { az: 5.55, reach: 0.44, rise: 0.09, droop: 0.15, r: 0.028, tipR: 0.008 },
    ],
    stub: { az: 2.82, reach: 0.10, rise: -0.04, droop: 0.03, r: 0.024, tipR: 0.016 },
    stubFrom: 0.78,
    clusters: [
      { x: 0.40, y: 0.98, z: 0.04, r: 0.190, flat: 0.42, tone: 1.04, sx: 1.42, sz: 0.54, yaw: 0.10 },
      { x: 0.16, y: 1.01, z: 0.42, r: 0.184, flat: 0.42, tone: 0.92, sx: 1.40, sz: 0.54, yaw: 1.18 },
      { x: -0.30, y: 1.05, z: 0.34, r: 0.180, flat: 0.40, tone: 1.10, sx: 1.38, sz: 0.54, yaw: 2.30 },
      { x: -0.42, y: 0.96, z: -0.10, r: 0.188, flat: 0.44, tone: 0.76, sx: 1.44, sz: 0.52, yaw: 3.40 },
      { x: -0.08, y: 1.10, z: -0.40, r: 0.176, flat: 0.40, tone: 1.16, sx: 1.36, sz: 0.54, yaw: 4.50 },
      { x: 0.31, y: 0.99, z: -0.30, r: 0.182, flat: 0.42, tone: 0.84, sx: 1.40, sz: 0.52, yaw: 5.55 },
    ],
    shed: { x: -0.42, y: 0.96, z: -0.10, yaw: 3.4, scale: 0.86 },
    debris: { x: -0.56, y: 0, z: -0.36, yaw: 3.4, scale: 0.82 },
  },
});

/**
 * Public species table. Every id resolves to a real silhouette; `height` and `crownRadius`
 * are shared so the board's furniture-exclusion envelopes are unchanged by this file.
 */
function speciesEntry(formId) {
  const form = SPECIES_FORM[formId];
  return Object.freeze({
    id: form.id,
    label: form.label,
    form: formId,
    height: SHARED.height,
    crownRadius: SHARED.crownRadius,
    trunkRatio: form.boleTop,
    canopy: 'clusters',
    trunkColor: form.bark,
    leafColor: '#5c6a38',
    leafColorB: '#3e4a28',
  });
}

const SPECIES_ENTRIES = Object.freeze({
  norfolk: speciesEntry('norfolk'),
  cypress: speciesEntry('cypress'),
  sapling: speciesEntry('sapling'),
  plane: speciesEntry('plane'),
  eucalypt: speciesEntry('eucalypt'),
  jacaranda: speciesEntry('jacaranda'),
  bottlebrush: speciesEntry('bottlebrush'),
  palm: speciesEntry('palm'),
});

export const FOLIAGE_SPECIES = Object.freeze({
  norfolk: SPECIES_ENTRIES.norfolk,
  cypress: SPECIES_ENTRIES.cypress,
  sapling: SPECIES_ENTRIES.sapling,
  tree: SPECIES_ENTRIES.plane,
  plane: SPECIES_ENTRIES.plane,
  eucalypt: SPECIES_ENTRIES.eucalypt,
  jacaranda: SPECIES_ENTRIES.jacaranda,
  bottlebrush: SPECIES_ENTRIES.bottlebrush,
  palm: SPECIES_ENTRIES.palm,
  hedge: SPECIES_ENTRIES.bottlebrush,
  shrub: SPECIES_ENTRIES.bottlebrush,
});

const SPECIES_ORDER = Object.freeze(['plane', 'eucalypt', 'jacaranda', 'bottlebrush', 'palm', 'norfolk', 'cypress', 'sapling']);

// W3-C size law (bible section 4): crown-top height in metres, lowest and tallest of the four size
// classes, applied as one uniform scale to the unchanged mesh. `squeeze` narrows the crown for
// species whose mesh is wider than the law; the plane and eucalypt tops stop where the root flare
// still fits a public tree pit (0.76 m half-opening). Measured against the built mesh, so a crown rebuild keeps its size.
const STREET_SIZE_LAW = Object.freeze({
  plane: { top: [9, 12.3], squeeze: 0.76 },
  sapling: { top: [3, 5], squeeze: 1 },
  cypress: { top: [12, 16], squeeze: 1 },
  eucalypt: { top: [11, 15], squeeze: 0.74 },
  norfolk: { top: [18, 24], squeeze: 0.60 },
  palm: { top: [7, 9.5], squeeze: 0.72 },
});

/** Public form-library census, including axial conifer whorls and retained shrubs. */
export const FOLIAGE_FORM_CENSUS = Object.freeze(Object.fromEntries(
  SPECIES_ORDER.map((id) => {
    const form = SPECIES_FORM[id];
    return [id, Object.freeze({
      lobes: form.clusters.length,
      forks: form.limbs.length,
      maxPlanOffset: Math.max(...form.clusters.map((c) => Math.hypot(c.x, c.z))),
    })];
  }),
));

/** Mild seasonal bias per district — multiplies leaf colour, never random at runtime. */
const DISTRICT_TINT = Object.freeze({
  'brighton-reach': { h: 0.04, s: 1.05, l: 1.06 },
  'docklands-quay': { h: -0.02, s: 0.92, l: 0.96 },
  'fitzroy-north': { h: 0.0, s: 1.08, l: 0.98 },
  'carlton-east': { h: 0.02, s: 1.02, l: 1.0 },
  'richmond-flat': { h: -0.01, s: 1.0, l: 0.97 },
  'brunswick-rise': { h: 0.03, s: 1.04, l: 1.02 },
});

/** Per-instance leaf base. Widened in V3.31 so a tree line separates from the lawn. */
export const INSTANCE_LEAF_PALETTE = Object.freeze([
  '#5a6e3c',
  '#52663a', // W3-C: was #4a5c32 and #3e502c, which read near-black once canopies grew to building scale
  '#6a7a44',
  '#4e6034',
  '#627440',
  '#546636',
]);

/** Autumn is a world-state read, not a uniform orange wash over every tree. */
export const AUTUMN_LEAF_PALETTE = Object.freeze([
  // W3-C: the leaf.autumn family (#B5873E, H37 S66 V71) once the broadleaf bias has cut the blue,
  // where the old rust entries read as saturated orange.
  '#b38760',
  '#a9805a',
  '#bf9462',
  '#97814f',
]);

export const WINTER_LEAF_PALETTE = Object.freeze([
  // W3-C: lifted toward leaf.green.a and leaf.grey; at building scale the old near-black entries
  // filled whole canopies.
  '#5b6648',
  '#52603f',
  '#66704f',
  '#5f6247',
]);

export const FOLIAGE_SIZE_CLASS = Object.freeze([0.58, 0.82, 1.08, 1.38]);

// Five alternating crown proportions. The spatial class changes across an 8 m lattice,
// so neighbouring plantings cannot land on the same silhouette even when their hash
// rolls happen to be close; the small hashed term below keeps classes from looking tiled.
const INSTANCE_FORM_SCALE = Object.freeze([
  Object.freeze([0.86, 1.05, 1.14]),
  Object.freeze([0.94, 1.13, 0.88]),
  Object.freeze([1.08, 0.93, 0.96]),
  Object.freeze([1.15, 0.82, 1.02]),
  Object.freeze([0.90, 1.22, 0.98]),
]);

export function spatialFormClass(x, z) {
  const raw = Math.round(x / 8) + Math.round(z / 8) * 2;
  return ((raw % INSTANCE_FORM_SCALE.length) + INSTANCE_FORM_SCALE.length)
    % INSTANCE_FORM_SCALE.length;
}

/** Per-instance bark base, keyed off the species bark colour and a hash. */
export const BARK_VALUE_SPREAD = 0.16;

/** Damaged trees on screen at once. Mischief itself caps concurrent damage at ten. */
const DEBRIS_CAPACITY = 12;
const REGROW_DURATION = 0.85;
/** Stage-1 flank: live drop masses leave the crown and land on the grate. */
const DROP_FALL_DURATION = 0.48;
/** Stage-2 remainder: the rest of the live crown follows onto the opposite side. */
const KEEP_FALL_DURATION = 0.62;
const DROP_FALL_ANGLE = 84 * DEG;
// S3 footpath pavers: centre ± (0.75 + 1.455/2), box y=0.225 h=0.10, top 0.275.
// Lawn and the tree anchor stay at y=0. Not a kerb, wall, or building test.
const BROADLEAF_PAVER_HALF = 0.75 + 1.455 / 2;
const BROADLEAF_PAVER_TOP = PUBLIC_PIT_LEVELS.paver;
const BROADLEAF_LAWN_Y = PUBLIC_PIT_LEVELS.lawn;
const BROADLEAF_PILE_HEIGHT = 0.42;
const BROADLEAF_PILE_FOOT = 1.55;
const BROADLEAF_PILE_OFFSET = 0.55;
const BROADLEAF_FALL_ARC = 0.28;
const _pileCenter = new THREE.Vector3();
const _pileScale = new THREE.Vector3();
const _pileQuat = new THREE.Quaternion();
const _pileOffset = new THREE.Vector3();
const _pilePos = new THREE.Vector3();
const _pileUp = new THREE.Vector3(0, 1, 0);
const _pileLocal = new THREE.Matrix4();
const _pileWorld = new THREE.Matrix4();

export function speciesForModel(modelId) {
  return MODEL_TO_SPECIES[modelId] ?? 'plane';
}

const STREET_SPECIES_MODEL = Object.freeze({
  boulevard: 'plane-tree-london',
  residential: 'australian-jacaranda',
  beachfront: 'melbourne-beach-palm',
  fringe: 'australian-eucalyptus',
  local: 'australian-bottlebrush',
});

function waterEdgeDistance(city, tree) {
  if (city.waterEdge === 'north') return tree.z;
  if (city.waterEdge === 'south') return city.extent.z - tree.z;
  if (city.waterEdge === 'west') return tree.x;
  return city.extent.x - tree.x;
}

function nonWaterFringeDistance(city, tree) {
  const rows = [
    ['north', tree.z],
    ['south', city.extent.z - tree.z],
    ['west', tree.x],
    ['east', city.extent.x - tree.x],
  ];
  return Math.min(...rows.filter(([edge]) => edge !== city.waterEdge).map(([, d]) => d));
}

function nearestStreetCorridor(city, tree) {
  let best = null;
  const visit = (corridor, coordinate) => {
    for (const offset of [CORRIDOR.footpathCentreLow, CORRIDOR.footpathCentreHigh]) {
      const distance = Math.abs(coordinate - (corridor.index * PITCH + offset));
      if (!best || distance < best.distance) best = { corridor, distance };
    }
  };
  for (const corridor of city.corridors?.vertical ?? []) visit(corridor, tree.x);
  for (const corridor of city.corridors?.horizontal ?? []) visit(corridor, tree.z);
  return best;
}

function nearestParcelSector(city, tree) {
  let sector = null;
  let bestDistance = Infinity;
  for (const id of city.order ?? []) {
    const parcel = city.parcels?.[id];
    if (!parcel?.centre) continue;
    const distance = (parcel.centre.x - tree.x) ** 2 + (parcel.centre.z - tree.z) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      sector = parcel.sector ?? null;
    }
  }
  return sector;
}

/**
 * Renderer-only street-tree plan. The core roster keeps its stable positions and order;
 * only its presentation species is reclassified by the street it actually stands on.
 */
export function planBoardFoliage(city) {
  const edgeBand = CORRIDOR.footpathCentreHigh + 3.5;
  return (city.trees ?? []).map((tree) => {
    const nearest = nearestStreetCorridor(city, tree);
    let streetType = 'local';
    if (tree.role === 'reserve-avenue') {
      streetType = 'boulevard';
    } else if (tree.role === 'core-pocket-park') {
      streetType = 'residential';
    } else if (waterEdgeDistance(city, tree) <= edgeBand) {
      streetType = 'beachfront';
    } else if (nonWaterFringeDistance(city, tree) <= edgeBand) {
      streetType = 'fringe';
    } else if (nearest?.corridor?.tram) {
      streetType = 'boulevard';
    } else if (nearestParcelSector(city, tree) === 'residential') {
      streetType = 'residential';
    }
    return Object.freeze({
      ...tree,
      // P10a: retain roster indices until all salted and neighbouring choices are made.
      stopClear: (city.transit ?? []).some(stop => {
        if (stop.kind !== 'stop') return false;
        const a = (stop.rotation ?? 0) * DEG;
        const dx = tree.x - stop.x, dz = tree.z - stop.z;
        return Math.abs(dx * Math.cos(a) - dz * Math.sin(a)) <= 6.2 / 2 + 1.5
          && Math.abs(dx * Math.sin(a) + dz * Math.cos(a)) <= 2.6 / 2 + 1.0;
      }),
      sourceModel: tree.model,
      model: STREET_SPECIES_MODEL[streetType],
      streetType,
      corridorId: nearest?.corridor?.id ?? null,
    });
  });
}

/** Fill residential verge cells through existing street batches, preserving core IDs. */
export function planResidentialVergeInfill(city, existing = planBoardFoliage(city)) {
  const additions = [];
  for (const [axis, corridors] of [['v', city.corridors?.vertical ?? []], ['h', city.corridors?.horizontal ?? []]]) {
    const extent = axis === 'v' ? city.extent.z : city.extent.x;
    for (const corridor of corridors) {
      if (corridor.tram) continue;
      for (const offset of [CORRIDOR.footpathCentreLow, CORRIDOR.footpathCentreHigh]) {
        const across = corridor.index * PITCH + offset;
        for (let start = ROAD; start + BLOCK <= extent; start += PITCH) {
          for (let cell = 0; cell < 3; cell += 1) {
            const along = start + 8 + cell * 16;
            const point = axis === 'v' ? { x: across, z: along } : { x: along, z: across };
            if (nearestParcelSector(city, point) !== 'residential') continue;
            if (waterEdgeDistance(city, point) < 18 || nonWaterFringeDistance(city, point) < 18) continue;
            const occupied = [...existing, ...additions].some(t => {
              const lateral = axis === 'v' ? Math.abs(t.x - across) : Math.abs(t.z - across);
              const longitudinal = axis === 'v' ? Math.abs(t.z - along) : Math.abs(t.x - along);
              return lateral < 2 && longitudinal <= 8;
            });
            if (occupied) continue;
            // Stay within this 16 m planting cell and clear existing furniture.
            for (const shift of [0, -2, 2, -4, 4]) {
              const p = axis === 'v' ? { x: across, z: along + shift } : { x: along + shift, z: across };
              if ((city.props ?? []).some(prop => Math.hypot(prop.x - p.x, prop.z - p.z) < 1.8)) continue;
              additions.push({ ...p, id: `r7-verge:${axis}:${corridor.index}:${offset}:${start}:${cell}`,
                model: STREET_SPECIES_MODEL.residential, streetType: 'residential',
                corridorId: corridor.id, rotation: axis === 'v' ? 90 : 0, r7Verge: true });
              break;
            }
          }
        }
      }
    }
  }
  return additions;
}

/** Stable 0..1 from a string — visual only. */
function unitFromKey(key) {
  return (hashSeed(key) >>> 0) / 4294967296;
}

/** Deterministic 0..1 from up to three floats. Build-time geometry noise, never a clock. */
function wob(a, b = 0, c = 0) {
  const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

function easeOutBack(k) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Tag aWind vertex attribute (0 = static bole, 1 = full canopy flutter). */
function tagWind(geometry, amount) {
  const n = geometry.attributes.position.count;
  const wind = new Float32Array(n);
  wind.fill(amount);
  geometry.setAttribute('aWind', new THREE.BufferAttribute(wind, 1));
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  return geometry;
}

/** Wind that ramps with height so a bole never moves and a limb tip does. */
function tagWindRamp(geometry, base, top, yTop) {
  const pos = geometry.attributes.position;
  const wind = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i += 1) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / Math.max(0.001, yTop), 0, 1);
    wind[i] = base + (top - base) * t * t;
  }
  geometry.setAttribute('aWind', new THREE.BufferAttribute(wind, 1));
  return geometry;
}

/** Flat colour attribute with a deterministic per-vertex value jitter. */
function paint(geometry, hex, jitter = 0) {
  const pos = geometry.attributes.position;
  const base = new THREE.Color(hex);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const k = jitter
      ? 1 + (wob(pos.getX(i) * 17.3, pos.getY(i) * 23.1, pos.getZ(i) * 19.7) - 0.5) * 2 * jitter
      : 1;
    colors[i * 3] = base.r * k;
    colors[i * 3 + 1] = base.g * k;
    colors[i * 3 + 2] = base.b * k;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  return geometry;
}

/**
 * Cast-iron tree grate: a square plate with a round hole, built as a radial fan of
 * separately-coloured sectors so the spokes read as spokes.
 *
 * `sectors` must be a multiple of eight so a sector edge lands on each corner of the
 * square and every outer edge is a straight chord.
 */
function squareGrateGeometry(half, holeR, sectors, hex) {
  const base = new THREE.Color(hex);
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  const boundary = (a) => half / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
  for (let i = 0; i < sectors; i += 1) {
    const a0 = (i / sectors) * TAU;
    const a1 = ((i + 1) / sectors) * TAU;
    const d0 = boundary(a0);
    const d1 = boundary(a1);
    // Alternating bar and slot. The slot is very nearly black — this is where a real
    // grate shows the shadowed pit under it, and it is the whole reason the reference
    // grate measures 0.60 of value below its paving.
    const bar = i % 2 === 0;
    const k = bar ? 1.45 : 0.30;
    const rust = 0.92 + wob(i * 3.1, 1.7) * 0.30;
    const c = [base.r * k * rust, base.g * k * rust * 0.95, base.b * k * rust * 0.88];
    const v = positions.length / 3;
    const quad = [
      [Math.cos(a0) * holeR, Math.sin(a0) * holeR],
      [Math.cos(a1) * holeR, Math.sin(a1) * holeR],
      [Math.cos(a1) * d1, Math.sin(a1) * d1],
      [Math.cos(a0) * d0, Math.sin(a0) * d0],
    ];
    for (const [x, z] of quad) {
      positions.push(x, bar ? 0.006 : 0, z);
      normals.push(0, 1, 0);
      colors.push(c[0], c[1], c[2]);
    }
    indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * A tapered tube swept along a polyline. This is the whole branch system: bole, primary
 * limbs, secondary twigs and the deadwood stub all come out of it.
 */
function limbGeometry(points, radii, radial, {
  flare = 0, flareLobes = 3, flarePhase = 0, ridge = 0.055, capTip = true, frame = 'axis',
} = {}) {
  const rings = points.length;
  const positions = [];
  const normals = [];
  const indices = [];
  const up = new THREE.Vector3(0, 1, 0);
  const sideRef = new THREE.Vector3(1, 0, 0);
  const tangent = new THREE.Vector3();
  const bi = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const carriedBi = new THREE.Vector3();
  const carriedNrm = new THREE.Vector3();
  let carried = false;

  for (let i = 0; i < rings; i += 1) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(rings - 1, i + 1)];
    tangent.subVectors(next, prev);
    if (tangent.lengthSq() < 1e-9) tangent.set(0, 1, 0);
    tangent.normalize();
    if (frame === 'transport' && carried) {
      bi.copy(carriedBi).addScaledVector(tangent, -carriedBi.dot(tangent));
      if (bi.lengthSq() < 1e-10) bi.crossVectors(Math.abs(tangent.x) < 0.9 ? sideRef : up, tangent);
      bi.normalize();
      nrm.crossVectors(tangent, bi).normalize();
      if (carriedNrm.dot(nrm) < 0) { bi.negate(); nrm.negate(); }
    } else {
      const ref = Math.abs(tangent.y) > 0.92 ? sideRef : up;
      bi.crossVectors(ref, tangent).normalize();
      nrm.crossVectors(tangent, bi).normalize();
    }
    if (frame === 'transport') { carried = true; carriedBi.copy(bi); carriedNrm.copy(nrm); }
    const t = rings > 1 ? i / (rings - 1) : 0;
    for (let j = 0; j < radial; j += 1) {
      const theta = (j / radial) * TAU;
      let r = radii[i];
      r *= 1 + ridge * Math.cos(theta * 5 + i * 0.8);
      if (flare > 0) {
        const lobe = Math.max(0, Math.cos(theta * flareLobes + flarePhase));
        r *= 1 + flare * Math.pow(lobe, 1.5) * Math.pow(1 - t, 3.4);
      }
      dir.set(0, 0, 0)
        .addScaledVector(bi, Math.cos(theta))
        .addScaledVector(nrm, Math.sin(theta));
      positions.push(p.x + dir.x * r, p.y + dir.y * r, p.z + dir.z * r);
      normals.push(dir.x, dir.y, dir.z);
    }
  }
  for (let i = 0; i < rings - 1; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      indices.push(a, b, c, b, d, c);
    }
  }
  if (capTip && rings > 1) {
    const centre = positions.length / 3;
    const tip = points[rings - 1];
    positions.push(tip.x, tip.y, tip.z);
    tangent.subVectors(points[rings - 1], points[rings - 2]).normalize();
    normals.push(tangent.x, tangent.y, tangent.z);
    const base = (rings - 1) * radial;
    for (let j = 0; j < radial; j += 1) {
      indices.push(base + j, base + ((j + 1) % radial), centre);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

/** Sample a limb's centreline; used to build it and to hang twigs and masses off it. */
function limbCentreline(origin, spec, segments) {
  const points = [origin.clone()];
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments;
    points.push(new THREE.Vector3(
      origin.x + Math.cos(spec.az) * spec.reach * t,
      origin.y + spec.rise * t - spec.droop * t * t,
      origin.z + Math.sin(spec.az) * spec.reach * t,
    ));
  }
  return points;
}

function taperRadii(points, r0, r1) {
  const out = [];
  for (let i = 0; i < points.length; i += 1) {
    const t = points.length > 1 ? i / (points.length - 1) : 0;
    out.push(r0 + (r1 - r0) * Math.pow(t, 0.78));
  }
  return out;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Leaf value, written per blade rather than per hull vertex.
 *
 * Vertex colour multiplies albedo in linear space, so an authored range of 0.6–1.3 arrives
 * on screen as a range of about 1.3 — which is why every canopy on `r1a-trees-avenue.png`
 * read as one flat pistachio. The curve below is written in linear terms and the per-mass
 * `tone` is gamma-expanded.
 *
 * `lit` is the blade's own facing, and because every blade in a mass faces somewhere
 * different, this is the leaf-scale value break the R1 critic measured as absent (mean
 * absolute Laplacian 5.2 against the reference's 21.8: our contrast was facet-scale, one
 * value step per 40-pixel polygon).
 */
function leafValue(nyBlade, tone, jitter, warm, bias, out) {
  const up = THREE.MathUtils.clamp(nyBlade * 0.5 + 0.5, 0, 1);
  const lit = Math.pow(up, 1.3);
  // R2a plate correction. The first blade pass carried the R1 hull's value curve, which was
  // authored to pull a *hull* apart and put its floor at 0.10; on a shell of individual
  // blades that produced a crown of near-black chips over dark olive, against a reference
  // that is a confident yellow-green with darker shade masses under it. The floor is up, the
  // tone exponent is down from 1.9 to 1.35 so the darkest undermass stops collapsing, and
  // the per-blade jitter is narrower because the blade normals now supply most of the break.
  let v = (0.58 + lit * 0.94) * Math.pow(tone, 1.35);
  // R2c plate correction. With the blade tilt narrowed the sunlit top of every mass filled
  // with up-facing blades at nearly the same value, and `trees-r2c-trees-street.png` shows
  // the result: a smooth pale-green dome inside the fringe, which is the topiary blob the
  // reference pack rejects. The per-blade value spread is wider, and `warm` gives each blade
  // its own hue as well as its own value — the reference's crowns are yellow-green and
  // blue-green leaf by leaf, not one green at several brightnesses.
  v *= 0.70 + jitter * 0.60;
  v = THREE.MathUtils.clamp(v, 0.30, 1.66);
  out[0] = v * (0.88 + lit * 0.16) * bias[0] * (0.86 + warm * 0.12);
  out[1] = v * bias[1] * (0.94 + warm * 0.05);
  out[2] = v * (0.78 - lit * 0.16) * bias[2] * (1.08 - warm * 0.18);
  return out;
}

/**
 * A single leaf mass, built the way the reference pack builds one: a small dark core with
 * a shell of chunky leaf blades standing off it at hash-scattered radii and tilts.
 *
 * R1 built this as a displaced sphere, and the critic scored *penetration* 3.0 on it —
 * `r1c-trees-canopy-plan.png` had no hole through the crown anywhere and the silhouette at
 * 7x was three straight chords over 200 native pixels. A hull cannot fix that at any
 * triangle count, because the defect is that it is a hull. Blades give three things a hull
 * cannot: sky between them, a ragged fringe at the rim, and one value per blade.
 *
 * The core is deliberately dark: it is the interstitial shade the reference shows between
 * blades, and it is what a gap in the fringe shows instead of the backdrop.
 */
export function leafClusterGeometry(r = 1, flat = 1, salt = 0, tone = 1, bias = [1, 1, 1], segments = 8) {
  // F2: 64 smooth shell triangles + three two-triangle silhouette cards.
  // Leave a real fringe beyond the interior shell instead of burying it in the hull.
  const shell = new THREE.SphereGeometry(r * 0.84, Math.max(3, segments), segments < 4 ? 2 : segments < 8 ? 4 : 5);
  shell.scale(1, flat, 1);
  shell.rotateY(salt * TAU);
  const p = shell.attributes.position;
  const col = [];
  for (let i = 0; i < p.count; i += 1) {
    const up = p.getY(i) / Math.max(0.001, r * flat) * 0.5 + 0.5;
    const ao = (0.30 + 0.70 * up * up) * tone;
    col.push(ao * bias[0], ao * bias[1], ao * bias[2]);
    shell.attributes.uv.setX(i, 0.04 + shell.attributes.uv.getX(i) * 0.39);
  }
  shell.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const parts = [shell];
  for (let i = 0; i < (segments < 3 ? 1 : 3); i += 1) {
    const a = salt * TAU + i * TAU / 3;
    const card = new THREE.PlaneGeometry(r * 1.65, r * flat * 1.65);
    const uv = card.attributes.uv;
    for (let j = 0; j < uv.count; j += 1) uv.setX(j, 0.5 + uv.getX(j) * 0.5);
    card.rotateY(-a);
    card.translate(Math.sin(a) * r * 0.98, r * flat * 0.08, Math.cos(a) * r * 0.98);
    paint(card, '#ffffff');
    const c = card.attributes.color;
    for (let j = 0; j < c.count; j += 1) {
      const k = (j < 2 ? 0.92 : 0.40) * tone;
      c.setXYZ(j, bias[0] * k, bias[1] * k, bias[2] * k);
    }
    parts.push(card);
  }
  const result = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  result.userData.leafCluster = { shells: 1, rimCards: 3, triangles: result.index.count / 3 };
  return result;
}

let clusterAtlas;
export function leafClusterAtlas() {
  if (clusterAtlas) return clusterAtlas;
  const w = 128, h = 64, data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const u = (x - 64) / 63, v = y / 63;
    let leaf = x < 60;
    for (let k = 0; k < 45 && !leaf; k += 1) {
      const cx = 0.5 + Math.sin(k * 2.4) * 0.42;
      const cy = 0.08 + (k % 15) * 0.06;
      const a = k * 1.71, dx = u - cx, dy = v - cy;
      const lx = dx * Math.cos(a) + dy * Math.sin(a);
      const ly = -dx * Math.sin(a) + dy * Math.cos(a);
      leaf = (lx / 0.025) ** 2 + (ly / 0.055) ** 2 < 1;
    }
    const o = (y * w + x) * 4;
    const mottling = x < 60 ? 0.60 + 0.40 * Math.sin(x * 0.55 + Math.sin(y * 0.72)) ** 2 : 1;
    data[o] = data[o + 1] = data[o + 2] = Math.round(255 * mottling);
    data[o + 3] = leaf ? 255 : 0;
  }
  clusterAtlas = new THREE.DataTexture(data, w, h);
  clusterAtlas.magFilter = THREE.LinearFilter;
  clusterAtlas.minFilter = THREE.LinearMipmapLinearFilter;
  clusterAtlas.generateMipmaps = true;
  clusterAtlas.needsUpdate = true;
  return clusterAtlas;
}

export function clusterLeafMaterial(color = '#ffffff') {
  const material = new THREE.MeshStandardMaterial({ color, vertexColors: true,
    map: leafClusterAtlas(), alphaTest: 0.45, side: THREE.DoubleSide,
    roughness: 0.94, metalness: 0, flatShading: false });
  material.userData.leafCluster = true;
  return material;
}

/** Shared whole crown for static venues, ring instances and lot planting. */
export function clusterTreeGeometry(kind = 'round', seed = 0, { hedge = false, ring: ringRegister = false } = {}) {
  const U = (i) => unitFromKey(`F2:${kind}:${seed}:${i}`);
  const parts = [];
  const count = ringRegister ? 5 : 5 + Math.floor(U(0) * 3);
  const narrow = /pine|cypress/.test(kind);
  const palm = kind === 'palm';
  const spread = (narrow ? 0.22 : palm ? 0.38 : 0.29) * (0.60 + U(1) * 0.85);
  const phase = U(2) * TAU;
  const fork = palm ? 0.73 : 0.40;
  if (!hedge) {
    const wood = new THREE.CylinderGeometry(0.018, 0.036, fork, 5, 1, ringRegister);
    wood.translate(0, fork / 2, 0);
    paint(wood, '#695345');
    if (ringRegister) for (let j = 0; j < wood.attributes.color.count; j += 1) wood.attributes.color.setXYZ(j, 1.85, 0.55, 1.05);
    for (let j = 0; j < wood.attributes.uv.count; j += 1) wood.attributes.uv.setXY(j, 0.125, 0.5);
    parts.push(wood);
    for (let i = 0; i < 3; i += 1) {
      const a = phase + i * TAU / 3;
      const end = new THREE.Vector3(Math.cos(a) * spread * 0.75, fork + 0.23, Math.sin(a) * spread * 0.75);
      const start = new THREE.Vector3(0, fork * 0.76, 0);
      const axis = end.clone().sub(start);
      const branch = new THREE.CylinderGeometry(0.009, 0.018, axis.length(), 4, 1, ringRegister);
      branch.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize()));
      branch.translate(...start.add(end).multiplyScalar(0.5).toArray());
      paint(branch, '#695345');
      if (ringRegister) for (let j = 0; j < branch.attributes.color.count; j += 1) branch.attributes.color.setXYZ(j, 1.85, 0.55, 1.05);
      for (let j = 0; j < branch.attributes.uv.count; j += 1) branch.attributes.uv.setXY(j, 0.125, 0.5);
      parts.push(branch);
    }
  }
  for (let i = 0; i < count; i += 1) {
    const a = phase + i * 2.399;
    const ring = i === 0 ? 0 : spread * (0.25 + U(10 + i) * 0.85);
    const radius = (narrow ? 0.15 : 0.21) * (0.65 + U(30 + i) * 0.65);
    const flat = hedge ? 0.68 : palm ? 0.24 : kind === 'umbrella' ? 0.50 : kind === 'weeping' ? 1.35 : 0.83;
    // Five six-sided clusters retain rounded leaf masses within 260 triangles.
    // Ring branch ends sit inside the canopy/ground and do not need cap faces.
    const lobe = leafClusterGeometry(radius, flat * (0.65 + U(110 + i) * 0.85), U(50 + i), (ringRegister ? 1.10 : 0.76) + U(70 + i) * 0.34, [1, 1, 1], ringRegister ? 6 : 8);
    lobe.scale(0.65 + U(130 + i) * 0.80, 1, 0.65 + U(150 + i) * 0.80);
    const x = hedge ? (i / (count - 1) - 0.5) * 0.78 : Math.cos(a) * ring;
    const y = hedge ? 0 : narrow ? 0.42 + i / count * 0.50 : fork + 0.14 + U(90 + i) * 0.34;
    const z = Math.sin(a) * ring * (hedge ? 0.25 : 1);
    // Occlusion on the inward-facing side of each shell, as well as its underside.
    const p = lobe.attributes.position, c = lobe.attributes.color;
    for (let j = 0; j < p.count; j += 1) {
      const inward = Math.max(0, -(p.getX(j) * x + p.getZ(j) * z) / Math.max(0.001, radius * spread));
      const k = 1 - 0.43 * Math.min(1, inward);
      c.setXYZ(j, c.getX(j) * k, c.getY(j) * k, c.getZ(j) * k);
    }
    lobe.translate(x, y, z);
    parts.push(lobe);
  }
  const result = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  // Ring trees must remain asymmetric at board scale, even in the roundest seeded layout.
  if (ringRegister) result.scale(1.45, 1, 1);
  result.computeBoundingSphere();
  result.userData.clusterTree = { kind, seed, clusters: count, rimCards: count * 3, hedge, ring: ringRegister,
    triangles: result.index.count / 3 };
  return result;
}

export function addClusterTree(parent, { kind = 'round', x = 0, y = 0, z = 0, height = 4, seed = 0, color = '#66884b', hedge = false, width = 1, depth = 1 } = {}) {
  const salt = `${seed}:${x}:${z}`;
  const mesh = new THREE.Mesh(clusterTreeGeometry(kind, salt, { hedge }), clusterLeafMaterial(color));
  const U = (i) => unitFromKey(`${salt}:${i}`);
  mesh.position.set(x, y, z);
  mesh.scale.set(hedge ? width : height * (0.65 + U(1) * 0.70), height * (0.91 + U(2) * 0.18), hedge ? depth : height * (0.65 + U(3) * 0.70));
  mesh.material.color.offsetHSL((U(4) - 0.5) * 0.045, (U(5) - 0.5) * 0.10, (U(6) - 0.5) * 0.055);
  mesh.name = hedge ? 'leaf-cluster-hedge' : `leaf-cluster-tree:${kind}`;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.clusterTree = mesh.geometry.userData.clusterTree;
  parent.add(mesh);
  return mesh;
}

const canopyKitMaterials = new WeakSet();
// Kit palettes have a nine-bucket cap. Reserve UVs above 16384 for leaf clusters so
// their atlas/alpha applies only to tree vertices in the existing garden bucket.
function canopyKitMaterial(material) {
  if (!material.isMaterial) return material; // Geometry-only kit census palettes.
  if (canopyKitMaterials.has(material)) return material;
  canopyKitMaterials.add(material);
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  const key = previousKey();
  material.onBeforeCompile = function(shader, renderer) {
    previous.call(this, shader, renderer);
    shader.uniforms.f2CanopyAtlas = { value: leafClusterAtlas() };
    shader.vertexShader = 'varying vec2 vF2CanopyUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvF2CanopyUv = uv;');
    shader.fragmentShader = 'uniform sampler2D f2CanopyAtlas;\nvarying vec2 vF2CanopyUv;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      if (vF2CanopyUv.x >= 16384.0) {
        vec4 leaf = texture2D(f2CanopyAtlas, vec2(vF2CanopyUv.x - 16384.0, vF2CanopyUv.y));
        if (leaf.a < 0.45) discard;
        diffuseColor.rgb *= leaf.rgb;
      } else {
        #include <map_fragment>
      }`);
  };
  material.customProgramCacheKey = () => `${key}:F2B-canopy-uv`;
  material.side = THREE.DoubleSide;
  material.needsUpdate = true;
  return material;
}

/** F2B: retain a caller's canopy envelope/name while sharing the leaf atlas and rim. */
export function clusterCanopyPart(value, kit = true) {
  if (Array.isArray(value)) return value.map(p => clusterCanopyPart(p, kit));
  const source = value.geometry;
  source.computeBoundingBox();
  const center = source.boundingBox.getCenter(new THREE.Vector3());
  const size = source.boundingBox.getSize(new THREE.Vector3());
  const salt = `${source.name}:${center.toArray()}:${size.toArray()}`;
  const sourceTriangles = (source.index?.count ?? source.attributes.position.count) / 3;
  const geometry = leafClusterGeometry(1, 1, unitFromKey(salt), 1, [1, 1, 1], sourceTriangles <= 8 ? 2 : sourceTriangles <= 12 ? 3 : 6);
  // Fit an asymmetric crown, not a rotated copy of the same ellipsoid. Apply the
  // same continuous deformation to shell and leaf rims before envelope fitting.
  const rolls = Array.from({ length: 7 }, (_, i) => unitFromKey(`${salt}:crown:${i}`));
  const U = i => rolls[i];
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const taper = 1 + (U(0) - 0.5) * y * 0.80;
    position.setXYZ(i,
      x * taper + (U(1) - 0.5) * y * 1.1 + Math.sin(y * 2.4 + U(2) * TAU) * 0.22,
      y + (U(3) - 0.5) * x * 0.75 + Math.sin(z * 2.1 + U(4) * TAU) * 0.18,
      z * (1 + (U(5) - 0.5) * y * 0.80) + (U(6) - 0.5) * y * 1.1);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const extent = geometry.boundingBox.getSize(new THREE.Vector3());
  const mid = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-mid.x, -mid.y, -mid.z);
  geometry.scale(size.x / extent.x, size.y / extent.y, size.z / extent.z);
  geometry.translate(center.x, center.y, center.z);
  geometry.name = source.name;
  geometry.userData = { ...source.userData, leafCluster: true };
  const material = kit ? canopyKitMaterial(value.material) : clusterLeafMaterial(value.material.color);
  if (kit) {
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) + 16384);
  }
  source.dispose();
  return { ...value, geometry, material };
}

/** One-line kit call adapter: convert only the new leaf bucket entries. */
export function clusterKitPlanting(ctx, bucket, build, ...args) {
  const start = ctx.buckets.get(bucket)?.length ?? 0;
  const result = build(...args);
  const geometries = ctx.buckets.get(bucket) ?? [];
  for (let i = start; i < geometries.length; i++) {
    const source = geometries[i];
    const geometry = clusterCanopyPart({ geometry: source, material: ctx.palette[bucket] }).geometry;
    // Bucket merges require exactly the existing attribute schema.
    for (const key of Object.keys(geometry.attributes)) if (!source.attributes[key]) geometry.deleteAttribute(key);
    for (const [key, attr] of Object.entries(source.attributes)) if (!geometry.attributes[key]) {
      geometry.setAttribute(key, new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * attr.itemSize), attr.itemSize));
    }
    geometries[i] = source.index ? geometry : geometry.toNonIndexed();
  }
  return result;
}

export function clusterKitTree(ctx, x, z, opts = {}) {
  return clusterKitPlanting(ctx, opts.bucket ?? 'foliage', () => ctx.leafTree(x, z, opts));
}

/** Canopy-only field: keeps original placements and batching, with a seeded lobe per entry. */
export function addClusterCanopyField(parent, source, material, items, name, opts = {}) {
  if (!items.length) return null;
  const parts = [], census = [];
  const dummy = new THREE.Object3D();
  for (const [i, it] of items.entries()) {
    const original = source.clone(); original.name = `${name}:${i}:${it.x}:${it.z}`;
    const part = clusterCanopyPart({ geometry: original, material }, false);
    const color = new THREE.Color(it.color ?? material.color);
    const colors = part.geometry.attributes.color;
    for (let j = 0; j < colors.count; j++) colors.setXYZ(j, colors.getX(j) * color.r, colors.getY(j) * color.g, colors.getZ(j) * color.b);
    dummy.position.set(it.x, it.y, it.z);
    dummy.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ');
    const s = it.s ?? 1; dummy.scale.set(it.sx ?? s, it.sy ?? s, it.sz ?? s); dummy.updateMatrix();
    part.geometry.applyMatrix4(dummy.matrix); parts.push(part.geometry); part.material.dispose();
    census.push({ x: it.x, y: it.y, z: it.z, triangles: part.geometry.index.count / 3, seed: original.name });
  }
  const geometry = mergeGeometries(parts); parts.forEach(g => g.dispose());
  const mesh = new THREE.Mesh(geometry, clusterLeafMaterial());
  mesh.name = name; mesh.castShadow = opts.cast !== false; mesh.receiveShadow = opts.receive !== false;
  mesh.userData.clusterCanopy = census; mesh.raycast = () => {}; parent.add(mesh); return mesh;
}

/** Leaf-only mesh adapter; trunks and alpine snow remain owned by their tree helper. */
export function clusterCanopyMesh(mesh) {
  const part = clusterCanopyPart(mesh, false);
  mesh.geometry = part.geometry; mesh.material = part.material;
  mesh.userData.leafCluster = true;
  return mesh;
}

// Accepted street atlas for eucalypt, sapling, Norfolk and cypress. Plane and
// jacaranda do not sample it.
let streetAtlas;
function streetLeafAtlas() {
  if (streetAtlas) return streetAtlas;
  const size = 128, data = new Uint8Array(size * size * 4);
  const marks = Array.from({length: 95}, (_, i) => ({
    x: 0.5 + Math.sin(i * 2.399963) * (0.16 + (i % 7) * 0.047),
    y: 0.5 + Math.cos(i * 2.399963) * (0.16 + (i % 7) * 0.047),
    a: i * 1.71,
  }));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let value = 0;
    for (const m of marks) {
      const dx = x / (size - 1) - m.x, dy = y / (size - 1) - m.y;
      const u = dx * Math.cos(m.a) + dy * Math.sin(m.a);
      const v = -dx * Math.sin(m.a) + dy * Math.cos(m.a);
      const q = (u / 0.051) ** 2 + (v / 0.093) ** 2;
      if (q < 1) value = Math.max(value, 0.58 + 0.42 * (1 - q));
    }
    const o = (y * size + x) * 4;
    data[o] = data[o+1] = data[o+2] = Math.round(value * 255);
    data[o+3] = value ? 255 : 0;
  }
  streetAtlas = new THREE.DataTexture(data, size, size);
  streetAtlas.magFilter = THREE.LinearFilter;
  streetAtlas.minFilter = THREE.LinearMipmapLinearFilter;
  streetAtlas.generateMipmaps = true; streetAtlas.needsUpdate = true;
  return streetAtlas;
}

// Layered folded leaf sprays: each diamond has a raised spine and four faces.
// No spherical core, cone, camera-facing billboard, or per-instance geometry.
// Eucalypt, sapling, Norfolk and cypress only. Plane and jacaranda use streetBroadleafMass.
function r149SaplingLeaves(c,quality,salt,tone,bias,terminal,lobe){
  const pos=[],colors=[],uv=[],index=[],shoots=[],leaves=[],count=quality==='low'?2:3,pointCount=quality==='high'?3:2,stations=quality==='medium'?2:3,uc=.45703125,vc=.12109375,ur=.01953125;
  const unit=(i,k)=>r41Unit(i+salt,k),vertex=(p,u,v,seed)=>{const n=pos.length/3,up=Math.max(0,Math.min(1,p.y/(c.r*c.flat)*.62+.5)),shade=(.16+1.05*up*up)*tone*(.93+.07*Math.sin(seed*7+salt));pos.push(p.x,p.y,p.z);colors.push(shade*bias[0],shade*bias[1],shade*bias[2]);uv.push(u,v);return n;};
  for(let j=0;j<count;j++){
    const az=j*2.399963+salt*TAU,reach=c.r*(.31+.18*unit(j,3)),end=new THREE.Vector3(Math.cos(az)*reach,c.r*((unit(j,7)-.35)*.32),Math.sin(az)*reach),points=[];
    for(let k=0;k<pointCount;k++){const t=k/(pointCount-1),p=end.clone().multiplyScalar(t);p.y+=Math.sin(t*Math.PI)*c.r*.045;points.push(p);}
    const base=pos.length/3,radius=.0018;for(let k=0;k<pointCount;k++){const tangent=points[Math.min(k+1,pointCount-1)].clone().sub(points[Math.max(0,k-1)]).normalize(),across=new THREE.Vector3(-tangent.z,0,tangent.x).normalize(),up=new THREE.Vector3().crossVectors(tangent,across).normalize(),r=radius*(1-.6*k/(pointCount-1));for(let side=0;side<3;side++){const a=side*TAU/3,p=points[k].clone().addScaledVector(across,Math.cos(a)*r).addScaledVector(up,Math.sin(a)*r);vertex(p,uc+(side-1)*.0006,vc+(k/(pointCount-1)-.5)*.02,j);}}
    for(let k=0;k<pointCount-1;k++)for(let side=0;side<3;side++){const a=base+k*3+side,b=base+k*3+(side+1)%3,d=base+(k+1)*3+side,e=base+(k+1)*3+(side+1)%3;index.push(a,d,b,b,d,e);}
    shoots.push({id:j,points:points.map(p=>p.toArray()),radius,vertexStart:base,vertexCount:pointCount*3});
    for(let station=0;station<stations;station++)for(const side of[-1,1]){
      if(quality==='high'&&station===2&&side<0)continue;
      const t=(quality==='medium'?.34+station*.44:.22+station*.31)+(side<0?.035:0),f=t*(pointCount-1),segment=Math.min(pointCount-2,Math.floor(f)),segmentU=f-segment,root=points[segment].clone().lerp(points[segment+1],segmentU),tangent=points[segment+1].clone().sub(points[segment]).normalize(),seed=j*17+station*5+(side<0?2:0),yaw=Math.atan2(tangent.z,tangent.x)+side*(.55+.35*unit(seed,5)),pitch=.12+.48*unit(seed,9),dir=new THREE.Vector3(Math.cos(yaw)*Math.cos(pitch),Math.sin(pitch),Math.sin(yaw)*Math.cos(pitch)),across=new THREE.Vector3(-dir.z,0,dir.x).normalize(),up=new THREE.Vector3().crossVectors(dir,across).normalize(),roll=side*(.12+.24*unit(seed,11));across.applyAxisAngle(dir,roll);up.applyAxisAngle(dir,roll);
      const length=c.r*(.60+.20*unit(seed,13)),halfWidth=c.r*(.15+.075*unit(seed,15)),sections=quality==='high'?[[.24,.72],[.62,1],[.86,.58]]:[[.34,.94],[.74,.82]],start=pos.length/3;vertex(root,uc,vc-ur,seed);
      for(const[a,width]of sections)for(const edge of[-1,1]){const p=root.clone().addScaledVector(dir,length*a).addScaledVector(across,edge*halfWidth*width+Math.sin(a*Math.PI)*c.r*.04*(unit(seed,17)-.5)).addScaledVector(up,Math.sin(a*Math.PI)*c.r*.045);vertex(p,uc+edge*width*ur,vc+(a-.5)*2*ur,seed);}
      const tip=root.clone().addScaledVector(dir,length);vertex(tip,uc,vc+ur,seed);index.push(start,start+2,start+1);for(let k=0;k<sections.length-1;k++){const a=start+1+k*2,b=a+1,d=a+2,e=a+3;index.push(a,b,d,b,e,d);}const last=start+1+(sections.length-1)*2;index.push(last,last+1,pos.length/3-1);
      leaves.push({shoot:j,station,side,root:root.toArray(),segment,segmentU,length,halfWidth,vertexStart:start,vertexCount:2+sections.length*2});
    }
  }
  // Keep this young tree within its original small crown envelope; no new mature spread.
  const legacy=streetLeafMass(c.r,c.flat,salt,tone,bias,quality,'sapling');legacy.computeBoundingBox();const box=legacy.boundingBox;let sx=1,sy=1,sz=1;for(let i=0;i<pos.length;i+=3){if(pos[i]>box.max.x)sx=Math.min(sx,box.max.x/pos[i]);if(pos[i]<box.min.x)sx=Math.min(sx,box.min.x/pos[i]);if(pos[i+1]>box.max.y)sy=Math.min(sy,box.max.y/pos[i+1]);if(pos[i+1]<box.min.y)sy=Math.min(sy,box.min.y/pos[i+1]);if(pos[i+2]>box.max.z)sz=Math.min(sz,box.max.z/pos[i+2]);if(pos[i+2]<box.min.z)sz=Math.min(sz,box.min.z/pos[i+2]);}legacy.dispose();for(let i=0;i<pos.length;i+=3){pos[i]*=sx;pos[i+1]*=sy;pos[i+2]*=sz;}for(const s of shoots)for(const point of s.points){point[0]*=sx;point[1]*=sy;point[2]*=sz;}for(const leaf of leaves){leaf.root[0]*=sx;leaf.root[1]*=sy;leaf.root[2]*=sz;}
  const g=new THREE.BufferGeometry();for(const[name,array,size]of[['position',pos,3],['color',colors,3],['uv',uv,2]])g.setAttribute(name,new THREE.Float32BufferAttribute(array,size));g.setIndex(index);g.computeVertexNormals();g.userData.r149Sapling={lobe,centre:[c.x,c.y,c.z],terminal,shoots,leaves,envelopeScale:[sx,sy,sz],uvCentre:[uc,vc],uvRadius:ur};return g;
}

function streetLeafMass(r, flat, salt, tone, bias, quality, species) {
  const count = species === 'norfolk' || species === 'cypress' ? 10 : quality === 'low' ? 8 : quality === 'medium' ? 10 : 12;
  const pos = [], colors = [], uv = [], index = [];
  for (let i = 0; i < count; i += 1) {
    const a = i * 2.399963 + salt * TAU;
    const layer = i % 3;
    const ring = layer === 2 ? 0.30 : 0.62;
    const cx = Math.cos(a) * r * ring, cz = Math.sin(a) * r * ring;
    const cy = (layer - 1) * r * flat * 0.48;
    const reach = r * (species === 'norfolk' ? 0.62 : 0.57);
    const wide = reach * (species === 'eucalypt' ? 0.37 : 0.68);
    const verts = [[0, r * flat * 0.26, 0], [reach, 0, 0],
      [0, -r * flat * 0.18, wide], [-reach * 0.8, 0, 0], [0, -r * flat * 0.18, -wide]];
    const base = pos.length / 3;
    for (let j = 0; j < verts.length; j += 1) {
      const [x,y,z] = verts[j], yy = cy + y;
      pos.push(cx + x * Math.cos(a) - z * Math.sin(a), yy, cz + x * Math.sin(a) + z * Math.cos(a));
      const up = Math.max(0, Math.min(1, yy / (r * flat) * 0.62 + 0.5));
      const v = (0.16 + 1.05 * up * up) * tone * (0.93 + 0.07 * Math.sin(i * 7 + salt));
      colors.push(v * bias[0], v * bias[1], v * bias[2]);
      const leafUV = [[0.75,0.5],[1,0.5],[0.75,1],[0.5,0.5],[0.75,0]][j];
      uv.push((leafUV[0] - 0.5) * 2, leafUV[1]);
    }
    for (let j = 1; j <= 4; j += 1) index.push(base, base + j, base + (j === 4 ? 1 : j + 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index); g.computeVertexNormals();
  g.userData.streetLeafSprays = count;
  return g;
}

function streetBroadleafMass(r, flat, salt, tone, bias, quality, species) {
  const flowering = species === 'jacaranda';
  const sprays = quality === 'low' ? 15 : quality === 'medium' ? 24 : 36;
  const shell = r * 1.19;
  const primaries = 15;
  const yMag = r * Math.max(flat, 0.20) * 0.72;
  const ySpan = Math.max(0.08, shell * 0.9);
  const pos = [], colors = [], uv = [], index = [];
  const rows = [
    { u: 0.00, arch: 0.05, w: 0.62 },
    { u: 0.46, arch: 1.00, w: 1.00 },
    { u: 1.00, arch: 0.20, w: 0.48 },
  ];
  const unit = (i, k) => {
    const x = Math.sin(i * 12.9898 + salt * 78.233 + k * 43.758) * 43758.5453;
    return x - Math.floor(x);
  };
  const hostPitch = (host) => {
    const band = unit(host, 4);
    const h = unit(host, 1);
    if (band < 0.30) return -0.22 - h * 0.46;
    if (band < 0.70) return 0.10 + h * 0.40;
    return 0.42 + h * 0.36;
  };
  for (let i = 0; i < sprays; i += 1) {
    const primary = i < primaries;
    const host = primary ? i : i % primaries;
    const h1 = unit(i, 1);
    const h2 = unit(i, 2);
    const h3 = unit(i, 3);
    const pitch = hostPitch(host) + (primary ? 0 : (h1 - 0.5) * 0.50);
    const roll = (unit(host, 2) - 0.5) * (primary ? 0.85 : 1.25) + (primary ? 0 : (h2 - 0.5) * 0.35);
    const azimuth = salt * TAU + host * 2.399963 + (primary ? 0 : (h2 - 0.5) * 0.32);
    const len = shell * (primary ? 0.68 + 0.12 * unit(host, 3) : 0.46 + 0.08 * h3);
    const centreR = shell * (primary ? 0.12 : 0.22);
    const halfW = len * 0.25;
    const cy = (unit(host, 6) * 2 - 1) * yMag * 0.40 + (primary ? 0 : (h1 - 0.5) * yMag * 0.10);
    const archH = len * (0.12 + 0.06 * h3);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dirx = Math.cos(azimuth), dirz = Math.sin(azimuth);
    const lx = dirx * cp, ly = sp, lz = dirz * cp;
    let wx = -dirz, wy = 0, wz = dirx;
    let ax = ly * wz - lz * wy, ay = lz * wx - lx * wz, az = lx * wy - ly * wx;
    const am = Math.hypot(ax, ay, az) || 1;
    ax /= am; ay /= am; az /= am;
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const nwx = wx * cr + ax * sr, nwy = wy * cr + ay * sr, nwz = wz * cr + az * sr;
    wx = nwx; wy = nwy; wz = nwz;
    ax = ly * wz - lz * wy; ay = lz * wx - lx * wz; az = lx * wy - ly * wx;
    const am2 = Math.hypot(ax, ay, az) || 1;
    ax /= am2; ay /= am2; az /= am2;
    const half = flowering ? 1 : 0;
    const flipV = unit(host, 8) > 0.5;
    const crop = 0.94 + 0.06 * unit(i, 9);
    const verts = [];
    const uvs = [];
    for (let row = 0; row < 3; row += 1) {
      for (const side of [-1, 1]) {
        const spec = rows[row];
        const across = side * spec.w * halfW * (side < 0 ? 1 : 0.92);
        const twist = side * spec.u * (h3 - 0.5) * archH * 0.65;
        const arch = spec.arch * archH * (side < 0 ? 1 : 0.68) + twist;
        verts.push([
          dirx * centreR + lx * spec.u * len + wx * across + ax * arch,
          cy + ly * spec.u * len + wy * across + ay * arch,
          dirz * centreR + lz * spec.u * len + wz * across + az * arch,
        ]);
        const uLocal = Math.max(0, Math.min(1, 0.5 + (across / halfW) * 0.5));
        const alongC = 0.5 + (spec.u - 0.5) * crop;
        const uC = 0.5 + (uLocal - 0.5) * crop;
        const outer = 0.012;
        const seam = 0.010;
        const u0 = half * 0.5 + outer;
        const u1 = half * 0.5 + 0.5 - seam;
        const v0 = outer;
        const v1 = 1 - outer;
        let vv = v0 + Math.max(0, Math.min(1, alongC)) * (v1 - v0);
        if (flipV) vv = v0 + v1 - vv;
        uvs.push([u0 + Math.max(0, Math.min(1, uC)) * (u1 - u0), vv]);
      }
    }
    const e1x = verts[2][0] - verts[0][0], e1y = verts[2][1] - verts[0][1], e1z = verts[2][2] - verts[0][2];
    const e2x = verts[1][0] - verts[0][0], e2y = verts[1][1] - verts[0][1], e2z = verts[1][2] - verts[0][2];
    const wound = (e1y * e2z - e1z * e2y) * ax + (e1z * e2x - e1x * e2z) * ay + (e1x * e2y - e1y * e2x) * az < 0;
    const base = pos.length / 3;
    for (let k = 0; k < 6; k += 1) {
      const p = verts[k];
      pos.push(p[0], p[1], p[2]);
      const yn = Math.max(0, Math.min(1, p[1] / ySpan * 0.5 + 0.5));
      const lit = (0.84 + 0.18 * yn) * tone * (primary ? 1 : 0.96);
      const flowerish = flowering && unit(host, 7) > 0.62;
      const shade = flowerish ? lit * 0.94 : lit;
      colors.push(
        shade * bias[0] * (flowerish ? 1.03 : 1),
        shade * bias[1] * (flowerish ? 0.97 : 1),
        shade * bias[2] * (flowerish ? 1.04 : 1),
      );
      uv.push(uvs[k][0], uvs[k][1]);
    }
    const tris = wound
      ? [[0, 1, 2], [1, 3, 2], [2, 3, 4], [3, 5, 4]]
      : [[0, 2, 1], [1, 2, 3], [2, 4, 3], [3, 4, 5]];
    for (let t = 0; t < 4; t += 1) index.push(base + tris[t][0], base + tris[t][1], base + tris[t][2]);
  }
  const built = new THREE.BufferGeometry();
  built.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  built.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  built.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  built.setIndex(index);
  built.computeVertexNormals();
  built.userData.streetLeafSprays = sprays;
  built.userData.streetLeafPrimaries = primaries;
  return built;
}

const STREET_BROADLEAF_SHA256 = '2039c26a563918e34fd2f90db46a50b27768ad15fd3c225132965e2dcd5a397c';
const streetBroadleafRecord = {
  status: 'pending',
  source: 'mvp/assets/materials/generated/compact-foliage-r41.png',
  provenanceSource: 'mvp/assets/materials/generated/compact-foliage-r41.provenance.json',
  expectedSha256: STREET_BROADLEAF_SHA256,
  sha256: null,
  pngSha256: null,
  provenanceSha256: null,
  shaMatch: null,
  href: null,
  provenance: null,
  provenanceError: null,
  width: null,
  height: null,
  colorSpace: 'NoColorSpace',
  alphaTest: 0.40,
  mipPolicy: 'box-average-alpha; alpha-weighted-rgb; base-alpha-unchanged',
  multiplier: '0.36+0.64*pow(byte/255,0.90)',
  error: null,
};
const streetBroadleafMaterials = [];
let streetBroadleafMap = null;

export function streetBroadleafAtlasState() {
  return streetBroadleafRecord;
}

function bindStreetBroadleafMaterial(material) {
  streetBroadleafMaterials.push(material);
  material.map = streetBroadleafMap;
  material.name = 'nature:foliage:street-broadleaf-r39d';
  material.userData.streetBroadleafAtlas = streetBroadleafRecord;
  material.addEventListener('dispose', () => {
    const index = streetBroadleafMaterials.indexOf(material);
    if (index >= 0) streetBroadleafMaterials.splice(index, 1);
  });
}

function broadleafMultiplier(byte) {
  const lifted = 0.36 + 0.64 * (byte / 255) ** 0.90;
  return Math.max(0, Math.min(255, Math.round(lifted * 255)));
}

function prepareBroadleafPixels(src, w, h) {
  const data = new Uint8Array(w * h * 4);
  const opaque = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const p = i * 4;
    const a = src[p + 3];
    data[p + 3] = a;
    if (a >= 102) {
      opaque[i] = 1;
      data[p] = broadleafMultiplier(src[p]);
      data[p + 1] = broadleafMultiplier(src[p + 1]);
      data[p + 2] = broadleafMultiplier(src[p + 2]);
    }
  }
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const i = y * w + x;
    if (opaque[i]) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (let oy = -3; oy <= 3; oy += 1) {
      const yy = y + oy;
      if (yy < 0 || yy >= h) continue;
      for (let ox = -3; ox <= 3; ox += 1) {
        if (ox * ox + oy * oy > 10) continue;
        const xx = x + ox;
        if (xx < 0 || xx >= w || !opaque[yy * w + xx]) continue;
        const q = (yy * w + xx) * 4;
        r += data[q]; g += data[q + 1]; b += data[q + 2]; n += 1;
      }
    }
    const p = i * 4;
    if (n) {
      data[p] = Math.round(r / n);
      data[p + 1] = Math.round(g / n);
      data[p + 2] = Math.round(b / n);
    } else data[p] = data[p + 1] = data[p + 2] = 220;
  }
  return data;
}

function boxAlphaMips(base, width, height) {
  const levels = [{ data: base, width, height }];
  let src = base, w = width, h = height;
  while (w > 1 || h > 1) {
    const nw = Math.max(1, Math.floor(w / 2));
    const nh = Math.max(1, Math.floor(h / 2));
    const dst = new Uint8Array(nw * nh * 4);
    for (let y = 0; y < nh; y += 1) {
      const y0 = (y * h) / nh;
      const y1 = ((y + 1) * h) / nh;
      for (let x = 0; x < nw; x += 1) {
        const x0 = (x * w) / nw;
        const x1 = ((x + 1) * w) / nw;
        let r = 0, g = 0, b = 0, aSum = 0, aw = 0, cover = 0;
        const iy0 = Math.floor(y0);
        const iy1 = Math.min(h - 1, Math.ceil(y1) - 1);
        const ix0 = Math.floor(x0);
        const ix1 = Math.min(w - 1, Math.ceil(x1) - 1);
        for (let yy = iy0; yy <= iy1; yy += 1) {
          const yWeight = Math.min(y1, yy + 1) - Math.max(y0, yy);
          if (yWeight <= 0) continue;
          for (let xx = ix0; xx <= ix1; xx += 1) {
            const weight = yWeight * (Math.min(x1, xx + 1) - Math.max(x0, xx));
            if (weight <= 0) continue;
            const p = (yy * w + xx) * 4;
            const ai = src[p + 3];
            cover += weight;
            aSum += ai * weight;
            if (ai > 0) {
              r += src[p] * ai * weight;
              g += src[p + 1] * ai * weight;
              b += src[p + 2] * ai * weight;
              aw += ai * weight;
            }
          }
        }
        const o = (y * nw + x) * 4;
        dst[o + 3] = Math.max(0, Math.min(255, Math.round(cover > 0 ? aSum / cover : 0)));
        if (aw > 0) {
          dst[o] = Math.max(0, Math.min(255, Math.round(r / aw)));
          dst[o + 1] = Math.max(0, Math.min(255, Math.round(g / aw)));
          dst[o + 2] = Math.max(0, Math.min(255, Math.round(b / aw)));
        } else dst[o] = dst[o + 1] = dst[o + 2] = 220;
      }
    }
    levels.push({ data: dst, width: nw, height: nh });
    src = dst; w = nw; h = nh;
  }
  return levels;
}

function textureFromLevels(levels, label) {
  const base = levels[0];
  const texture = new THREE.DataTexture(base.data, base.width, base.height);
  texture.mipmaps = levels;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = true;
  texture.name = label;
  texture.needsUpdate = true;
  texture.userData.streetBroadleafSource = streetBroadleafRecord.source;
  texture.userData.expectedSha256 = STREET_BROADLEAF_SHA256;
  return texture;
}

function makeFallbackBroadleafAtlas() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  // Same GL rectangles as the loaded atlas after flipY (v = 1 is the PNG top).
  const cells = [
    [0.007974, 0.493620, 0.537480, 0.992026],
    [0.537480, 0.501595, 0.992026, 0.952153],
    [0.007974, 0.007974, 0.521531, 0.493620],
    [0.521531, 0.021531, 0.992026, 0.493620],
  ];
  const stamp = (cx, cy, rx, ry) => {
    for (let row = 0; row < size; row += 1) for (let col = 0; col < size; col += 1) {
      const u = col / (size - 1);
      const v = 1 - row / (size - 1);
      const dx = (u - cx) / rx, dy = (v - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const p = (row * size + col) * 4;
      data[p] = data[p + 1] = data[p + 2] = 198;
      data[p + 3] = 255;
    }
  };
  for (let c = 0; c < cells.length; c += 1) {
    const [u0, v0, u1, v1] = cells[c];
    const cu = (u0 + u1) * 0.5, cv = (v0 + v1) * 0.5;
    for (let i = 0; i < 10; i += 1) {
      const a = i * 2.399963 + c;
      stamp(cu + Math.cos(a) * (u1 - u0) * 0.22, cv + Math.sin(a) * (v1 - v0) * 0.22, (u1 - u0) * 0.12, (v1 - v0) * 0.16);
    }
  }
  return textureFromLevels(boxAlphaMips(data, size, size), 'compact-foliage-r41-fallback');
}

function applyStreetBroadleafMap(texture) {
  const previous = streetBroadleafMap;
  streetBroadleafMap = texture;
  for (const material of streetBroadleafMaterials) {
    material.map = texture;
    material.needsUpdate = true;
  }
  if (previous && previous !== texture) previous.dispose();
}

function streetBroadleafSha256(buffer) {
  return crypto.subtle.digest('SHA-256', buffer).then((digest) => {
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < bytes.length; i += 1) hex += bytes[i].toString(16).padStart(2, '0');
    return hex;
  });
}

function beginStreetBroadleafAtlas() {
  streetBroadleafMap = makeFallbackBroadleafAtlas();
  const noteFallbackSize = () => {
    streetBroadleafRecord.width = streetBroadleafMap.image.width;
    streetBroadleafRecord.height = streetBroadleafMap.image.height;
  };
  const canDecode = typeof document !== 'undefined'
    && typeof document.createElement === 'function'
    && typeof Image === 'function'
    && typeof Blob === 'function'
    && typeof URL !== 'undefined'
    && typeof URL.createObjectURL === 'function'
    && typeof URL.revokeObjectURL === 'function'
    && typeof fetch === 'function'
    && typeof AbortController === 'function';
  if (!canDecode) {
    streetBroadleafRecord.status = 'fallback';
    streetBroadleafRecord.error = 'image-decoder-absent';
    noteFallbackSize();
    return Promise.resolve(streetBroadleafRecord);
  }
  if (typeof crypto === 'undefined' || !crypto.subtle || typeof crypto.subtle.digest !== 'function') {
    streetBroadleafRecord.status = 'fallback';
    streetBroadleafRecord.error = 'digest-unavailable';
    noteFallbackSize();
    return Promise.resolve(streetBroadleafRecord);
  }
  return new Promise((resolve) => {
    let settled = false;
    let objectUrl = null;
    let image = null;
    const controller = new AbortController();
    const releaseDecode = () => {
      if (image) {
        image.onload = null;
        image.onerror = null;
        image.src = '';
        image = null;
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };
    const settle = (status, error, detail) => {
      const loser = detail && detail.texture;
      if (settled) {
        if (loser) loser.dispose();
        return;
      }
      settled = true;
      clearTimeout(timer);
      controller.abort();
      releaseDecode();
      const pngSha256 = detail && typeof detail.pngSha256 === 'string' ? detail.pngSha256 : null;
      const provenanceSha256 = detail && typeof detail.provenanceSha256 === 'string' ? detail.provenanceSha256 : null;
      if (pngSha256) {
        streetBroadleafRecord.sha256 = pngSha256;
        streetBroadleafRecord.pngSha256 = pngSha256;
      }
      if (detail && Object.prototype.hasOwnProperty.call(detail, 'provenanceSha256')) {
        streetBroadleafRecord.provenanceSha256 = provenanceSha256;
      }
      if (detail && detail.provenance) streetBroadleafRecord.provenance = detail.provenance;
      if (detail && detail.provenanceError) streetBroadleafRecord.provenanceError = detail.provenanceError;
      const verified = status === 'loaded'
        && loser
        && pngSha256 === STREET_BROADLEAF_SHA256
        && provenanceSha256 === pngSha256;
      if (verified) {
        streetBroadleafRecord.status = 'loaded';
        streetBroadleafRecord.error = null;
        streetBroadleafRecord.shaMatch = true;
        streetBroadleafRecord.width = loser.image.width;
        streetBroadleafRecord.height = loser.image.height;
        applyStreetBroadleafMap(loser);
      } else {
        if (loser) loser.dispose();
        streetBroadleafRecord.status = 'fallback';
        streetBroadleafRecord.error = error || 'load-failed';
        streetBroadleafRecord.shaMatch = pngSha256 || provenanceSha256 ? false : streetBroadleafRecord.shaMatch;
        noteFallbackSize();
      }
      resolve(streetBroadleafRecord);
    };
    const timer = setTimeout(() => settle('fallback', 'load-timeout'), 8000);
    const href = new URL('../../assets/materials/generated/compact-foliage-r41.png', import.meta.url);
    const prov = new URL('../../assets/materials/generated/compact-foliage-r41.provenance.json', import.meta.url);
    streetBroadleafRecord.href = href.href;
    const fetchInit = { signal: controller.signal, credentials: 'omit' };
    const pngTask = fetch(href.href, fetchInit).then((response) => {
      if (!response.ok) throw new Error(`png-http-${response.status}`);
      return response.arrayBuffer();
    });
    const provenanceTask = fetch(prov.href, fetchInit).then((response) => {
      if (!response.ok) throw new Error(`provenance-http-${response.status}`);
      return response.json();
    });
    Promise.allSettled([pngTask, provenanceTask]).then(async ([pngOutcome, provenanceOutcome]) => {
      if (settled) return;
      const detail = {};
      if (provenanceOutcome.status === 'fulfilled') {
        detail.provenance = provenanceOutcome.value;
        detail.provenanceSha256 = typeof provenanceOutcome.value?.sha256 === 'string'
          ? provenanceOutcome.value.sha256
          : null;
      } else if (provenanceOutcome.reason && provenanceOutcome.reason.name !== 'AbortError') {
        const reason = provenanceOutcome.reason;
        detail.provenanceError = String(reason && reason.message ? reason.message : reason);
        detail.provenanceSha256 = null;
      }
      if (pngOutcome.status !== 'fulfilled') {
        if (settled) return;
        if (pngOutcome.reason && pngOutcome.reason.name === 'AbortError') return;
        settle('fallback', 'png-fetch-failed', detail);
        return;
      }
      let pngSha256 = null;
      try {
        pngSha256 = await streetBroadleafSha256(pngOutcome.value);
      } catch (err) {
        if (settled) return;
        settle('fallback', `digest-failed:${err && err.message ? err.message : err}`, detail);
        return;
      }
      if (settled) return;
      detail.pngSha256 = pngSha256;
      if (pngSha256 !== STREET_BROADLEAF_SHA256) {
        settle('fallback', 'png-digest-mismatch', detail);
        return;
      }
      if (provenanceOutcome.status !== 'fulfilled' || detail.provenanceSha256 == null) {
        settle('fallback', 'provenance-missing', detail);
        return;
      }
      if (detail.provenanceSha256 !== pngSha256) {
        settle('fallback', 'provenance-mismatch', detail);
        return;
      }
      if (settled) return;
      const blob = new Blob([pngOutcome.value], { type: 'image/png' });
      objectUrl = URL.createObjectURL(blob);
      image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (settled) return;
        let texture = null;
        try {
          const w = image.naturalWidth || image.width;
          const h = image.naturalHeight || image.height;
          if (settled) return;
          if (!w || !h) throw new Error('empty-image');
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) throw new Error('canvas-unavailable');
          if (settled) return;
          ctx.drawImage(image, 0, 0);
          if (settled) return;
          const pixels = ctx.getImageData(0, 0, w, h).data;
          if (settled) return;
          const prepared = prepareBroadleafPixels(pixels, w, h);
          if (settled) return;
          const levels = boxAlphaMips(prepared, w, h);
          if (settled) return;
          texture = textureFromLevels(levels, 'compact-foliage-r41');
          if (settled) {
            texture.dispose();
            return;
          }
          settle('loaded', null, { ...detail, texture });
        } catch (err) {
          if (texture) texture.dispose();
          if (settled) return;
          settle('fallback', `decode-failed:${err && err.message ? err.message : err}`, detail);
        }
      };
      image.onerror = () => {
        if (settled) return;
        settle('fallback', 'image-decode-failed', detail);
      };
      if (settled) {
        releaseDecode();
        return;
      }
      image.src = objectUrl;
    }).catch((err) => {
      if (settled) return;
      settle('fallback', `load-failed:${err && err.message ? err.message : err}`);
    });
  });
}

export const streetBroadleafAtlasReady = beginStreetBroadleafAtlas();

/**
 * W3-C variety law (bible section 5), spatial and deterministic: plane is the street tree and one in ten
 * is a sapling (a young plane); eucalypt keeps the city fringe and the pocket parks, cypress the reserve
 * avenue, and norfolk is an esplanade hero once per 100 m, never beside the fringe row. Autumn colour is
 * thinned so no autumn tree has another within 28 m.
 */
export function mixStreetSpecies(placements, seed = 0) {
  const rows = placements.filter(p => STREET_TREE_VARIANTS.includes(p.speciesId) || p.speciesId === 'bottlebrush')
    .slice().sort((a,b) => Number(Boolean(a.r7Verge)) - Number(Boolean(b.r7Verge)) || a.x - b.x || a.z - b.z);
  const offset = hashSeed(`w3c-sapling:${seed}`) % 10;
  const fringe = placements.filter(p => p.streetType === 'fringe'), heroes = [];
  const apart = placements.filter(p => p.streetType === 'fringe' || p.role || p.speciesId === 'palm');
  let plain = 0;
  for (const p of rows) {
    if (p.streetType === 'fringe' || p.role === 'core-pocket-park') p.speciesId = 'eucalypt';
    else if (p.role === 'reserve-avenue') p.speciesId = 'cypress';
    else {
      // Saplings stay 48 m clear of every other form, so no block shows more than three.
      const free = !apart.some(q => Math.hypot(p.x - q.x, p.z - q.z) < 48);
      if (free) plain += 1;
      p.speciesId = free && (plain + offset) % 10 === 0 ? 'sapling' : 'plane';
    }
  }
  const esplanade = placements.filter(p => p.speciesId === 'palm' && p.role !== 'shore-palm').sort((a, b) => a.x - b.x || a.z - b.z);
  for (const p of esplanade) {
    const near = (q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
    if (fringe.some(q => near(q, 48)) || heroes.some(q => near(q, 100))) continue;
    p.speciesId = 'norfolk'; heroes.push(p);
  }
  const autumn = [];
  for (const p of placements.slice().sort((a, b) => a.x - b.x || a.z - b.z)) {
    if (p.season !== 'autumn') continue;
    if (autumn.some(q => Math.hypot(p.x - q.x, p.z - q.z) < 28)) p.season = 'green'; else autumn.push(p);
  }
  return placements;
}

/**
 * W7-A crown fit (bible section 4): no crown reaches more than 1.2 m into a building, so soft foliage may brush
 * a wall but never pass through it. Every street pit stands about 2 m off a facade and the size law makes a
 * crown 5 to 9 m across, so leaf used to reach up to 3.3 m into a wall. `fitCrowns` runs after the variety law and before batching. It measures the built
 * crown (the farthest leaf vertex in each of 48 compass sectors and eight height bands, read from the mesh so
 * a crown rebuild keeps its fit), poses it with the instance loop's own transform, and steps one uniform
 * scale down from 100% in 2% steps until no sampled vertex lies more than `cap` inside a footprint below
 * its roof. That scale is `p.fit`, applied in the instance loop. A plane or eucalypt that the fit would take
 * under `floor` metres is swapped to cypress if its block still shows three species or fewer, and only
 * as a last resort to a young plane, of which the city keeps at most `maxSapling`; otherwise it keeps its
 * species and shrinks to its fitted height. Swaps are decided on the high-tier crown so every tier plants the
 * same species; the scale is fitted to the tier's own mesh. No random number is drawn: every input is a keyed hash.
 */
const CROWN_FIT = Object.freeze({ cap: 1.2, floor: 6.5, minK: 0.3, step: 0.02, sectors: 48, bands: 8, maxSpecies: 3, maxSapling: 20 });

/** One placement's size-law height, girth and lean: height is uniform, the form class only nudges width. */
export function treeFrame(p, speciesId, unitTop) {
  const law = STREET_SIZE_LAW[speciesId];
  const h = law ? (law.top[0] + (law.top[1] - law.top[0]) * (p.sizeClass ?? 1) / 3) / unitTop
    : (SPECIES_ENTRIES[speciesId] ?? SPECIES_ENTRIES.plane).height * p.scale;
  const profile = INSTANCE_FORM_SCALE[p.formClass] ?? INSTANCE_FORM_SCALE[0];
  // Under the size law height is one uniform scale and the form class only nudges the width.
  const form = (k) => (law ? law.squeeze * (1 + (k - 1) * 0.4) : k);
  return {
    h,
    girthX: form(profile[0]) * (0.92 + unitFromKey(`${p.salt}:${p.x}:${p.z}:p17-width-x`) * 0.16),
    stretch: law ? 1 : profile[1] * (0.92 + unitFromKey(`${p.salt}:${p.x}:${p.z}:p17-stretch`) * 0.16),
    girthZ: form(profile[2]) * (0.92 + unitFromKey(`${p.salt}:${p.x}:${p.z}:p17-width-z`) * 0.16),
    leanAmt: (1.2 + unitFromKey(`p17-tree-lean:${speciesId}:${p.salt}`) * 4.0) * DEG,
    leanDir: unitFromKey(`v331-tree-lean-dir:${speciesId}:${p.salt}`) * TAU,
  };
}

/** Building footprints as the walk graph sees them: envelope about the parcel centre plus its model offset. */
function treeFootprints(city) {
  return [...Object.values(city?.parcels ?? {}), ...(city?.civicUses ?? [])].map((b) => {
    const o = b.placement?.modelOffset ?? { x: 0, z: 0 };
    const e = b.placement?.envelopeMetres ?? { x: (b.groundFootprint?.[0] ?? 1) * TILE - 1, z: (b.groundFootprint?.[1] ?? 1) * TILE - 1 };
    const x = b.centre.x + o.x;
    const z = b.centre.z + o.z;
    return { minX: x - e.x / 2, maxX: x + e.x / 2, minZ: z - e.z / 2, maxZ: z + e.z / 2, roof: (b.storeys ?? 3) * 3.2 + 2 };
  });
}

function fitCrowns(placements, city, builtFor, quality) {
  const boxes = treeFootprints(city);
  const reach = new Map();
  const crown = (id, tier) => {
    const key = `${tier}:${id}`;
    if (reach.has(key)) return reach.get(key);
    const leaf = (tier === quality ? builtFor(id) : buildSpeciesGeometry(id, tier)).leaf;
    leaf.computeBoundingBox();
    const top = leaf.boundingBox.max.y;
    const P = leaf.attributes.position;
    const best = new Map();
    for (let i = 0; i < P.count; i += 1) {
      const x = P.getX(i);
      const y = P.getY(i);
      const z = P.getZ(i);
      const r = x * x + z * z;
      const sector = Math.floor((Math.atan2(z, x) + Math.PI) / TAU * CROWN_FIT.sectors) % CROWN_FIT.sectors;
      const band = Math.max(0, Math.min(CROWN_FIT.bands - 1, Math.floor(y / top * CROWN_FIT.bands)));
      const key = sector * CROWN_FIT.bands + band;
      if (!best.has(key) || r > best.get(key).r) best.set(key, { x, y, z, r });
    }
    const c = { top, pts: [...best.values()] };
    reach.set(key, c);
    return c;
  };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const lean = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  /** Largest uniform scale in (0, 1] at which this placement's crown clears every footprint, and its crown top then. */
  const fitFor = (p, id, tier = quality) => {
    const c = crown(id, tier);
    const f = treeFrame(p, id, c.top);
    euler.y = p.yaw;
    q.setFromEuler(euler).premultiply(lean.setFromAxisAngle(v.set(Math.cos(f.leanDir), 0, Math.sin(f.leanDir)), f.leanAmt));
    m.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(f.h * f.girthX, f.h * f.stretch, f.h * f.girthZ));
    const pts = c.pts.map((u) => { v.set(u.x, u.y, u.z).applyMatrix4(m); return { dx: v.x - p.x, dz: v.z - p.z, y: v.y }; });
    const far = Math.max(...pts.map((o) => Math.hypot(o.dx, o.dz)));
    const near = boxes.filter((b) => Math.max(b.minX - p.x, p.x - b.maxX, b.minZ - p.z, p.z - b.maxZ) < far);
    const deepest = (k) => {
      let d = 0;
      for (const o of pts) {
        for (const b of near) {
          if (o.y * k > b.roof) continue;
          const x = p.x + o.dx * k;
          const z = p.z + o.dz * k;
          d = Math.max(d, Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z));
        }
      }
      return d;
    };
    let k = 1;
    while (near.length && k > CROWN_FIT.minK + 1e-9 && deepest(k) > CROWN_FIT.cap) k = Math.round((k - CROWN_FIT.step) * 1000) / 1000;
    return { fit: k, top: f.h * c.top * k };
  };

  const blocks = new Map();
  const blockOf = (p) => `${Math.round((p.x - (ROAD + BLOCK / 2)) / PITCH)},${Math.round((p.z - (ROAD + BLOCK / 2)) / PITCH)}`;
  const tally = (p, d) => {
    const here = blocks.get(blockOf(p)) ?? new Map();
    here.set(p.speciesId, (here.get(p.speciesId) ?? 0) + d);
    if (here.get(p.speciesId) <= 0) here.delete(p.speciesId);
    blocks.set(blockOf(p), here);
  };
  const pending = [];
  for (const p of placements) {
    tally(p, 1);
    const r = fitFor(p, p.speciesId);
    p.fit = r.fit;
    // Species are decided on the high-tier crown, so every tier plants the same species on the same site.
    const ref = quality === 'high' ? r : fitFor(p, p.speciesId, 'high');
    if ((p.speciesId === 'plane' || p.speciesId === 'eucalypt') && ref.top < CROWN_FIT.floor) pending.push(p);
  }
  const swaps = { cypress: 0, sapling: 0 };
  let young = placements.filter((p) => p.speciesId === 'sapling').length;
  for (const p of pending) {
    for (const to of ['cypress', 'sapling']) {
      const here = blocks.get(blockOf(p));
      if (!here.has(to) && here.size >= CROWN_FIT.maxSpecies) continue;
      if (to === 'sapling' && young >= CROWN_FIT.maxSapling) continue;
      if (to === 'sapling') young += 1;
      tally(p, -1);
      p.speciesId = to;
      tally(p, 1);
      if (to === 'cypress' && p.season === 'autumn') p.season = 'green';
      p.fit = fitFor(p, to).fit;
      swaps[to] += 1;
      break;
    }
  }
  return {
    cap: CROWN_FIT.cap,
    floor: CROWN_FIT.floor,
    trees: placements.length,
    shrunk: placements.filter((p) => p.fit < 1).length,
    swapped: swaps.cypress + swaps.sapling,
    swappedToCypress: swaps.cypress,
    swappedToSapling: swaps.sapling,
    heldBelowFloor: pending.length - swaps.cypress - swaps.sapling,
  };
}

function leafMassGeometry(r, flat, blades, salt, tone, bias, coreSeg = 5) {
  return leafClusterGeometry(r, flat, salt, tone, bias);
}

/**
 * Short dark bevel on the cone waist. r25 torus was a lime saucer —
 * this is a thicker, more vertical, darker bead that barely peeks.
 */
function leafRimGeometry(major, tube, flat, tone, bias, segs = 16) {
  const geo = new THREE.TorusGeometry(major, tube, 8, segs);
  geo.rotateX(Math.PI / 2);
  geo.scale(1, flat, 1);
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const rgb = [0, 0, 0];
  for (let i = 0; i < pos.count; i += 1) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const jitter = wob(px * 9.1, py * 7.3, pz * 5.7);
    const warm = wob(pz * 4.1, px * 3.3, 2.2);
    leafValue(nrm.getY(i), tone * (py < 0 ? 0.55 : 0.72), jitter * 0.18 + 0.20, warm, bias, rgb);
    colors[i * 3] = rgb[0];
    colors[i * 3 + 1] = rgb[1];
    colors[i * 3 + 2] = rgb[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.deleteAttribute('uv');
  geo.computeVertexNormals();
  return geo;
}

/** One toy cone. Darker base is the hem — no second orb. */
function leafConeGeometry(radius, height, tone, bias, segs = 10) {
  const geo = new THREE.ConeGeometry(radius, height, segs, 1, false);
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const rgb = [0, 0, 0];
  const half = height * 0.5;
  for (let i = 0; i < pos.count; i += 1) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const t = (py + half) / Math.max(0.001, height);
    const jitter = wob(px * 8.1, py * 6.3, pz * 4.7);
    const warm = wob(pz * 3.1, px * 2.7, 1.4);
    const k = t < 0.20 ? 0.40 : 0.58 + t * 0.48;
    leafValue(nrm.getY(i), tone * k, jitter * 0.18 + 0.22, warm, bias, rgb);
    colors[i * 3] = rgb[0];
    colors[i * 3 + 1] = rgb[1];
    colors[i * 3 + 2] = rgb[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.deleteAttribute('uv');
  geo.computeVertexNormals();
  return geo;
}

/**
 * Bark value. Base soil splash, species-specific figure, and a vertical grain so a bole
 * answers light as bark rather than as a painted dowel.
 */
function paintBark(geometry, mode) {
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const theta = Math.atan2(z, x);
    // R2, critic D3: "no bark at any distance, the bole is a featureless tan tube".
    //
    // The R1 figure was not too weak, it was sampled at frequencies the mesh could not
    // carry. A bole is 0.046 units across in unit-tree space, so a term in `x * 9.4`
    // varies by four hundredths of a cycle across the whole trunk, and with five rings of
    // nine the surviving pattern was two soft bands. The figure below is written against
    // the two coordinates a tube actually has — angle round it and height up it — and the
    // bole is now built at nine rings of ten so there are vertices to carry it.
    const u = (theta + Math.PI) / TAU;
    // Splash and staining at the bole foot, gone by knee height.
    let v = 1 - 0.34 * Math.exp(-y * 11);
    if (mode === 'mottle') {
      // Plane camouflage: quantised patches of pale cream over olive-grey, each patch a
      // few vertices across, plus a fine grain inside them.
      const patch = wob(Math.floor(u * 7) * 1.7, Math.floor(y * 24) * 2.3, 0.7);
      const drift = wob(Math.floor(u * 7 + 3) * 0.9, Math.floor(y * 24 + 5) * 1.3, 3.1);
      v *= patch > 0.64 ? 1.26 : (patch < 0.36 ? 0.62 : 0.94);
      v *= 0.92 + drift * 0.18;
      v *= 1 + Math.sin(u * TAU * 3 + y * 21) * 0.06;
    } else if (mode === 'ribbon') {
      // Eucalypt: long vertical ribbons peeling, so the figure runs up not round.
      const ribbon = wob(Math.floor(u * 9) * 2.9, 0.4, 1.9);
      v *= 0.72 + ribbon * 0.66;
      v *= 1 + Math.sin(y * 26 + ribbon * 9) * 0.13;
      v *= 0.94 + wob(Math.floor(u * 9) * 1.1, Math.floor(y * 12) * 2.7, 5.5) * 0.16;
    } else if (mode === 'fibrous') {
      // Bottlebrush: shaggy vertical fibre, high frequency round the bole.
      v *= 1 + Math.sin(u * TAU * 11 + y * 6) * 0.19;
      v *= 0.84 + wob(Math.floor(u * 12) * 1.3, Math.floor(y * 30) * 0.9, 2.2) * 0.34;
    } else {
      // Jacaranda: fine even fissure, shallow value range.
      v *= 1 + Math.sin(u * TAU * 8 + y * 13) * 0.12;
      v *= 0.88 + wob(Math.floor(u * 8) * 2.1, Math.floor(y * 18) * 1.7, 4.4) * 0.26;
    }
    // Same linear-space expansion as the leaf: without it the bark figure arrives on the
    // plate as a 1.3 range and a bole reads as smooth putty.
    v = THREE.MathUtils.clamp(Math.pow(v, 1.85), 0.20, 1.46);
    colors[i * 3] = v;
    colors[i * 3 + 1] = v * 0.985;
    colors[i * 3 + 2] = v * 0.965;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function mergeGeometries(geometries) {
  let totalVerts = 0;
  let totalIdx = 0;
  let hasIndex = true;
  for (const g of geometries) {
    totalVerts += g.attributes.position.count;
    if (!g.index) hasIndex = false;
    totalIdx += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(totalVerts * 3);
  const nrm = new Float32Array(totalVerts * 3);
  const col = new Float32Array(totalVerts * 3).fill(1);
  const wind = new Float32Array(totalVerts);
  const uv = new Float32Array(totalVerts * 2);
  let hasFlower = false;
  for (const g of geometries) if (g.attributes.aFlower) hasFlower = true;
  const flower = hasFlower ? new Float32Array(totalVerts) : null;
  const idx = hasIndex ? new Uint32Array(totalIdx) : null;
  let vOffset = 0;
  let iOffset = 0;
  for (const g of geometries) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const c = g.attributes.color;
    const w = g.attributes.aWind;
    for (let i = 0; i < p.count; i += 1) {
      pos[(vOffset + i) * 3] = p.getX(i);
      pos[(vOffset + i) * 3 + 1] = p.getY(i);
      pos[(vOffset + i) * 3 + 2] = p.getZ(i);
      if (n) {
        nrm[(vOffset + i) * 3] = n.getX(i);
        nrm[(vOffset + i) * 3 + 1] = n.getY(i);
        nrm[(vOffset + i) * 3 + 2] = n.getZ(i);
      }
      if (c) {
        col[(vOffset + i) * 3] = c.getX(i);
        col[(vOffset + i) * 3 + 1] = c.getY(i);
        col[(vOffset + i) * 3 + 2] = c.getZ(i);
      }
      wind[vOffset + i] = w ? w.getX(i) : 0;
      if (flower) flower[vOffset + i] = g.attributes.aFlower ? g.attributes.aFlower.getX(i) : 0;
      uv[(vOffset + i) * 2] = g.attributes.uv?.getX(i) ?? 0.125;
      uv[(vOffset + i) * 2 + 1] = g.attributes.uv?.getY(i) ?? 0.5;
    }
    if (idx && g.index) {
      const src = g.index.array;
      for (let i = 0; i < src.length; i += 1) idx[iOffset + i] = src[i] + vOffset;
      iOffset += src.length;
    } else if (idx) {
      for (let i = 0; i < p.count; i += 1) idx[iOffset + i] = vOffset + i;
      iOffset += p.count;
    }
    vOffset += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aWind', new THREE.BufferAttribute(wind, 1));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (flower) out.setAttribute('aFlower', new THREE.BufferAttribute(flower, 1));
  if (idx) out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// `boleRings` and `bole` (radial) exist so the bark figure has vertices to live on — see
// paintBark. `bladeScale` trims the leaf-card count on the cheaper tiers.
const QUALITY_TIERS = Object.freeze({
  low: {
    bole: 5, boleRings: 4, limb: 4, twig: 3, branch: 3,
    bladeScale: 0.45, core: 4, pit: 8,
  },
  medium: {
    bole: 5, boleRings: 4, limb: 4, twig: 3, branch: 3,
    bladeScale: 0.72, core: 5, pit: 12,
  },
  high: {
    bole: 5, boleRings: 4, limb: 4, twig: 3, branch: 3,
    bladeScale: 1, core: 5, pit: 16,
  },
});

function tierFor(quality) {
  return QUALITY_TIERS[quality] ?? QUALITY_TIERS.high;
}

// Compact atlas cells in texture UV space. flipY is true, so v = 1 is the PNG top.
// Rectangles are the measured alphaTest 0.40 bounds, not the uneven half-grid.
const R41_UV = Object.freeze({
  planeA: [0.007974, 0.493620, 0.537480, 0.992026],
  planeB: [0.537480, 0.501595, 0.992026, 0.952153],
  leaf: [0.007974, 0.007974, 0.521531, 0.493620],
  flower: [0.521531, 0.021531, 0.992026, 0.493620],
});

const R41_WOOD = Object.freeze({
  low: { boleRings: 3, boleSides: 5, flareSides: 3, primRings: 3, primSides: 4, primCap: false, secRings: 3, secSides: 3, stubRings: 2, stubSides: 3, spikes: 4 },
  medium: { boleRings: 4, boleSides: 5, flareSides: 3, primRings: 3, primSides: 4, primCap: true, secRings: 3, secSides: 3, stubRings: 3, stubSides: 3, spikes: 5 },
  high: { boleRings: 5, boleSides: 6, flareSides: 4, primRings: 4, primSides: 5, primCap: true, secRings: 3, secSides: 4, stubRings: 3, stubSides: 4, spikes: 6 },
});

function r41Unit(i, k) {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function r41Curve(a, b, bow, lift, steps) {
  const mid = a.clone().lerp(b, 0.5);
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  mid.x += (-dz / len) * bow;
  mid.z += (dx / len) * bow;
  mid.y += lift;
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps, u = 1 - t;
    points.push(new THREE.Vector3(
      u * u * a.x + 2 * u * t * mid.x + t * t * b.x,
      u * u * a.y + 2 * u * t * mid.y + t * t * b.y,
      u * u * a.z + 2 * u * t * mid.z + t * t * b.z,
    ));
  }
  return points;
}

const R41_LOBES = Object.freeze({
  plane: Object.freeze([
    { x: -0.20, y: 0.84, z: 0.04, rx: 0.36, ry: 0.30, rz: 0.32, tone: 0.94 },
    { x: 0.24, y: 0.78, z: -0.10, rx: 0.34, ry: 0.28, rz: 0.30, tone: 1.04 },
    { x: 0.02, y: 0.98, z: 0.02, rx: 0.32, ry: 0.26, rz: 0.30, tone: 1.14 },
    { x: -0.04, y: 0.68, z: 0.22, rx: 0.30, ry: 0.24, rz: 0.28, tone: 0.76 },
    { x: 0.12, y: 0.72, z: -0.26, rx: 0.28, ry: 0.22, rz: 0.26, tone: 0.86 },
  ]),
  jacaranda: Object.freeze([
    { x: 0.30, y: 0.72, z: 0.08, rx: 0.34, ry: 0.20, rz: 0.28, tone: 0.98 },
    { x: -0.28, y: 0.68, z: 0.10, rx: 0.32, ry: 0.18, rz: 0.28, tone: 0.86 },
    { x: 0.02, y: 0.90, z: -0.14, rx: 0.30, ry: 0.18, rz: 0.32, tone: 1.08 },
    { x: -0.02, y: 0.60, z: 0.24, rx: 0.32, ry: 0.16, rz: 0.26, tone: 0.74 },
    { x: 0.10, y: 0.76, z: -0.30, rx: 0.28, ry: 0.16, rz: 0.26, tone: 0.92 },
  ]),
});

function r109HighJacarandaCards(lobe, quality, species, salt, bias, flowerBudget, lobeIndex) {
  const flowering = species === 'jacaranda';
  // High and medium still share the i/96 shell prefix. Low is not that prefix:
  // 36 shell sprays cover the same reach span, plus 12 interior sprays, at 1.2×
  // leaf length. Five lobes × 48 sprays × 4 triangles = 960.
  // Jacaranda redistributes each lobe's triangle budget across three shorter,
  // separate atlas-cut leaf groups at fewer branchlet stations.
  // Plane's exact accepted station sequence and geometry stay untouched.
  const shellN = flowering
    ? (quality === 'low' ? 28 : quality === 'medium' ? 44 : 72)
    : (quality === 'low' ? 36 : quality === 'medium' ? 56 : 96);
  const interiorN = flowering
    ? (quality === 'low' ? 4 : quality === 'medium' ? 4 : 8)
    : (quality === 'low' ? 12 : quality === 'medium' ? 16 : 24);
  const cards = shellN + interiorN;
  const leafRect = flowering ? R41_UV.leaf : null;
  const planeRects = [R41_UV.planeA, R41_UV.planeB];
  const span = Math.min(lobe.rx, lobe.rz);
  const pos = [], colors = [], uv = [], flower = [], index = [];
  const rotateAround = (vx, vy, vz, ax, ay, az, angle) => {
    const c = Math.cos(angle), s = Math.sin(angle);
    const dot = ax * vx + ay * vy + az * vz;
    const cx = ay * vz - az * vy, cy = az * vx - ax * vz, cz = ax * vy - ay * vx;
    return [
      vx * c + cx * s + ax * dot * (1 - c),
      vy * c + cy * s + ay * dot * (1 - c),
      vz * c + cz * s + az * dot * (1 - c),
    ];
  };
  const pushSpray = (cx, cy, cz, yaw, pitch, roll, len, blossom, cluster) => {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const ax = Math.cos(yaw) * cp, ay = sp, az = Math.sin(yaw) * cp;
    let sx = -az, sy = 0, sz = ax;
    let sl = Math.hypot(sx, sy, sz);
    if (sl < 1e-5) { sx = 1; sy = 0; sz = 0; sl = 1; }
    sx /= sl; sy /= sl; sz /= sl;
    let ux = ay * sz - az * sy, uy = az * sx - ax * sz, uz = ax * sy - ay * sx;
    [sx, sy, sz] = rotateAround(sx, sy, sz, ax, ay, az, roll);
    [ux, uy, uz] = rotateAround(ux, uy, uz, ax, ay, az, roll);
    const rect = blossom ? R41_UV.flower : (leafRect || planeRects[(salt + index.length) % 2]);
    const insetU = (rect[2] - rect[0]) * 0.04;
    const insetV = (rect[3] - rect[1]) * 0.04;
    if (species === 'plane') {
      // The two leaves share a twig direction, but each has its own spread and
      // tilt. Four triangles still replace exactly one four-triangle spray.
      // Keep the same atlas choice and authored height-dependent palette.
      const shade = cluster * lobe.tone;
      for (const side of [-1, 1]) {
        const base = pos.length / 3;
        const start = side < 0 ? 0.04 : 0.39;
        const spread = side * 0.29;
        const tilt = side * 0.23;
        const [dx, dy, dz] = rotateAround(ax, ay, az, ux, uy, uz, spread);
        const [ex, ey, ez] = rotateAround(sx, sy, sz, ax, ay, az, tilt);
        const leafLen = len * (quality === 'medium' ? 0.70 : quality === 'low' ? 0.72 : 0.57);
        const halfW = len * (quality === 'medium' ? 0.37 : quality === 'low' ? 0.385 : 0.245);
        const rootX = cx + ax * len * start + sx * side * len * 0.115;
        const rootY = cy + ay * len * start + sy * side * len * 0.115;
        const rootZ = cz + az * len * start + sz * side * len * 0.115;
        for (const [along, across] of [[0, -0.62], [0, 0.62], [1, -0.90], [1, 0.90]]) {
          const width = across * halfW;
          const lift = Math.sin(along * Math.PI * 0.72) * len * 0.15;
          const px = rootX + dx * leafLen * along + ex * width + ux * lift;
          const py = rootY + dy * leafLen * along + ey * width + uy * lift;
          const pz = rootZ + dz * leafLen * along + ez * width + uz * lift;
          pos.push(px, py, pz);
          const height = 0.72 + 0.42 * (0.5 + py / (lobe.ry + 0.001));
          colors.push(shade * height * bias[0], shade * height * bias[1], shade * height * bias[2]);
          uv.push(
            rect[0] + insetU + (0.5 + across * 0.46) * (rect[2] - rect[0] - insetU * 2),
            rect[1] + insetV + (0.05 + along * 0.90) * (rect[3] - rect[1] - insetV * 2),
          );
          flower.push(0);
        }
        index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
      return;
    }
    if (flowering) {
      // The atlas leaf cell is itself a cut-out compound spray. Three smaller
      // two-triangle groups follow one notional radial rachis, with staggered
      // origins and different cant so a broad joined sheet cannot reappear.
      // A selected blossom still contributes four flower triangles: the two
      // side groups flower, while the terminal group remains leaf-bearing.
      const groups = [
        { along: 0.16, side: -0.22, turn: -0.67, cant: -0.29, scale: 0.64 },
        { along: 0.43, side: 0.20, turn: 0.62, cant: 0.25, scale: 0.63 },
        { along: 0.67, side: 0.01, turn: 0.08, cant: 0.10, scale: 0.66 },
      ];
      for (let gi = 0; gi < groups.length; gi += 1) {
        const group = groups[gi];
        const [dx, dy, dz] = rotateAround(ax, ay, az, ux, uy, uz, group.turn);
        const [ex, ey, ez] = rotateAround(sx, sy, sz, dx, dy, dz, group.cant + (r41Unit(salt + index.length + gi, 13) - 0.5) * 0.20);
        const leafletLen = len * group.scale;
        const halfWidth = len * (quality === 'low' ? (gi === 2 ? 0.29 : 0.30) : (gi === 2 ? 0.30 : 0.31));
        const rootX = cx + ax * len * group.along + sx * len * group.side;
        const rootY = cy + ay * len * group.along + sy * len * group.side;
        const rootZ = cz + az * len * group.along + sz * len * group.side;
        const isFlower = blossom && gi < 2;
        const cell = isFlower ? R41_UV.flower : R41_UV.leaf;
        // The source cell has transparent guard pixels. A 1% inset leaves its
        // measured alphaTest boundary transparent; the old 4% inset clipped
        // visible leaf tips on the top/right edge of small cards.
        const du = (cell[2] - cell[0]) * 0.01, dv = (cell[3] - cell[1]) * 0.01;
        const shade = (isFlower ? 0.50 : cluster) * lobe.tone;
        const base = pos.length / 3;
        for (const [along, across] of [[0, -1], [0, 1], [1, -1], [1, 1]]) {
          const lift = along * leafletLen * 0.11;
          const px = rootX + dx * leafletLen * along + ex * across * halfWidth + ux * lift;
          const py = rootY + dy * leafletLen * along + ey * across * halfWidth + uy * lift;
          const pz = rootZ + dz * leafletLen * along + ez * across * halfWidth + uz * lift;
          pos.push(px, py, pz);
          const height = 0.72 + 0.42 * (0.5 + py / (lobe.ry + 0.001));
          colors.push(shade * height * bias[0], shade * height * bias[1], shade * height * bias[2]);
          uv.push(cell[0] + du + (across + 1) * 0.5 * (cell[2] - cell[0] - du * 2),
            cell[1] + dv + along * (cell[3] - cell[1] - dv * 2));
          flower.push(isFlower ? 1 : 0);
        }
        index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
      return;
    }
    const rows = [0.05, 0.5, 0.95];
    const widths = [0.58, 1, 0.64];
    const halfW = len * 0.56;
    const arch = len * 0.42;
    const base = pos.length / 3;
    const shade = (blossom ? 0.50 : cluster) * lobe.tone;
    for (let row = 0; row < 3; row += 1) {
      const along = rows[row];
      const twist = (along - 0.5) * 0.85;
      const [s2x, s2y, s2z] = rotateAround(sx, sy, sz, ax, ay, az, twist);
      const [u2x, u2y, u2z] = rotateAround(ux, uy, uz, ax, ay, az, twist);
      const lift = Math.sin(along * Math.PI) * arch;
      for (const side of [-1, 1]) {
        const across = side * widths[row] * halfW;
        const px = cx + ax * along * len + s2x * across + u2x * lift;
        const py = cy + ay * along * len + s2y * across + u2y * lift;
        const pz = cz + az * along * len + s2z * across + u2z * lift;
        pos.push(px, py, pz);
        const height = 0.72 + 0.42 * (0.5 + py / (lobe.ry + 0.001));
        colors.push(shade * height * bias[0], shade * height * bias[1], shade * height * bias[2]);
        uv.push(
          rect[0] + insetU + (0.5 + side * widths[row] * 0.46) * (rect[2] - rect[0] - insetU * 2),
          rect[1] + insetV + along * (rect[3] - rect[1] - insetV * 2),
        );
        flower.push(blossom ? 1 : 0);
      }
    }
    index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3, base + 2, base + 4, base + 3, base + 3, base + 4, base + 5);
  };
  let flowersLeft = flowerBudget;
  for (let i = 0; i < shellN; i += 1) {
    const yaw = r41Unit(i + salt, 1) * TAU;
    const up = species === 'plane'
      ? 1 - Math.pow(r41Unit(i + salt, 2), 0.62) * 1.5
      : (r41Unit(i + salt, 2) - 0.38) * 1.65;
    const yN = Math.max(-1, Math.min(1, up));
    const ring = Math.sqrt(Math.max(0, 1 - yN * yN));
    const reach = (flowering ? 0.94 : 0.97) - (i / (flowering ? shellN : quality === 'low' ? 36 : 96)) * 0.22;
    // Lobes 0–1 flower inside the shared low shell. Later lobes flower only on
    // the shell ring their tier adds, so the low outer sprays stay identical.
    const flowerShell = lobeIndex < 2 ? 4 : lobeIndex < 4 ? 24 : 56;
    const blossom = flowering && flowersLeft > 0 && i === flowerShell;
    if (blossom) flowersLeft -= 1;
    const cluster = 0.84 + r41Unit(i + salt, 9) * 0.24;
    pushSpray(
      Math.cos(yaw) * ring * lobe.rx * reach,
      yN * lobe.ry * reach,
      Math.sin(yaw) * ring * lobe.rz * reach,
      yaw + (r41Unit(i + salt, 4) - 0.5) * 2.4,
      (species === 'plane' ? 0.28 : 0.02) + (r41Unit(i + salt, 5) - 0.5) * 1.7,
      (r41Unit(i + salt, 6) - 0.5) * Math.PI,
      span * (blossom ? 0.18 : (0.35 + r41Unit(i + salt, 7) * 0.10) * (quality === 'low' ? 1.2 : 1)),
      blossom,
      cluster,
    );
  }
  for (let i = 0; i < interiorN; i += 1) {
    const yaw = r41Unit(i + salt + 200, 1) * TAU;
    const yN = (r41Unit(i + salt + 200, 2) - 0.48) * 1.35;
    const ring = Math.sqrt(Math.max(0, 1 - Math.min(1, yN * yN)));
    const reach = 0.18 + r41Unit(i + salt + 200, 3) * 0.38;
    const cluster = 0.78 + r41Unit(i + salt + 200, 9) * 0.20;
    pushSpray(
      Math.cos(yaw) * ring * lobe.rx * reach,
      Math.max(-1, Math.min(1, yN)) * lobe.ry * reach,
      Math.sin(yaw) * ring * lobe.rz * reach,
      yaw + (r41Unit(i + salt + 200, 4) - 0.5) * 2.8,
      (r41Unit(i + salt + 200, 5) - 0.5) * 2.2,
      (r41Unit(i + salt + 200, 6) - 0.5) * Math.PI,
      span * (0.30 + r41Unit(i + salt + 200, 7) * 0.08) * (quality === 'low' ? 1.2 : 1),
      false,
      cluster,
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aFlower', new THREE.Float32BufferAttribute(flower, 1));
  g.setIndex(index);
  g.computeVertexNormals();
  const position = g.attributes.position;
  const normal = g.attributes.normal;
  for (let v = 0; v < position.count; v += 1) {
    const px = position.getX(v), py = position.getY(v), pz = position.getZ(v);
    let gx = normal.getX(v), gy = normal.getY(v), gz = normal.getZ(v);
    const gl = Math.hypot(gx, gy, gz) || 1;
    gx /= gl; gy /= gl; gz /= gl;
    let vx = px / (lobe.rx * lobe.rx);
    let vy = py / (lobe.ry * lobe.ry);
    let vz = pz / (lobe.rz * lobe.rz);
    const vl = Math.hypot(vx, vy, vz) || 1;
    vx /= vl; vy /= vl; vz /= vl;
    if (gx * vx + gy * vy + gz * vz < 0) { vx = -vx; vy = -vy; vz = -vz; }
    let nx = gx * 0.45 + vx * 0.55;
    let ny = gy * 0.45 + vy * 0.55;
    let nz = gz * 0.45 + vz * 0.55;
    const nl = Math.hypot(nx, ny, nz);
    if (!(nl > 1e-6)) normal.setXYZ(v, gx, gy, gz);
    else normal.setXYZ(v, nx / nl, ny / nl, nz / nl);
  }
  g.userData.r41Cards = cards;
  g.userData.r41Flowers = flowerBudget - flowersLeft;
  return g;
}

function r41LobeCards(lobe, quality, species, salt, bias, flowerBudget, lobeIndex) {
  if (species === 'jacaranda' && quality === 'high')
    return r109HighJacarandaCards(lobe, quality, species, salt, bias, flowerBudget, lobeIndex);
  const flowering = species === 'jacaranda';
  // High and medium still share the i/96 shell prefix. Low is not that prefix:
  // 36 shell sprays cover the same reach span, plus 12 interior sprays, at 1.2×
  // leaf length. Five lobes × 48 sprays × 4 triangles = 960.
  const shellN = quality === 'low' ? 36 : quality === 'medium' ? 56 : 96;
  const interiorN = quality === 'low' ? 12 : quality === 'medium' ? 16 : 24;
  const cards = shellN + interiorN;
  const leafRect = flowering ? R41_UV.leaf : null;
  const planeRects = [R41_UV.planeA, R41_UV.planeB];
  const span = Math.min(lobe.rx, lobe.rz);
  const pos = [], colors = [], uv = [], flower = [], index = [];
  const rotateAround = (vx, vy, vz, ax, ay, az, angle) => {
    const c = Math.cos(angle), s = Math.sin(angle);
    const dot = ax * vx + ay * vy + az * vz;
    const cx = ay * vz - az * vy, cy = az * vx - ax * vz, cz = ax * vy - ay * vx;
    return [
      vx * c + cx * s + ax * dot * (1 - c),
      vy * c + cy * s + ay * dot * (1 - c),
      vz * c + cz * s + az * dot * (1 - c),
    ];
  };
  const pushSpray = (cx, cy, cz, yaw, pitch, roll, len, blossom, cluster) => {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const ax = Math.cos(yaw) * cp, ay = sp, az = Math.sin(yaw) * cp;
    let sx = -az, sy = 0, sz = ax;
    let sl = Math.hypot(sx, sy, sz);
    if (sl < 1e-5) { sx = 1; sy = 0; sz = 0; sl = 1; }
    sx /= sl; sy /= sl; sz /= sl;
    let ux = ay * sz - az * sy, uy = az * sx - ax * sz, uz = ax * sy - ay * sx;
    [sx, sy, sz] = rotateAround(sx, sy, sz, ax, ay, az, roll);
    [ux, uy, uz] = rotateAround(ux, uy, uz, ax, ay, az, roll);
    const rect = blossom ? R41_UV.flower : (leafRect || planeRects[(salt + index.length) % 2]);
    const insetU = (rect[2] - rect[0]) * 0.04;
    const insetV = (rect[3] - rect[1]) * 0.04;
    if (species === 'plane') {
      // The two leaves share a twig direction, but each has its own spread and
      // tilt. Four triangles still replace exactly one four-triangle spray.
      // Keep the same atlas choice and authored height-dependent palette.
      const shade = cluster * lobe.tone;
      for (const side of [-1, 1]) {
        const base = pos.length / 3;
        const start = side < 0 ? 0.04 : 0.39;
        const spread = side * 0.29;
        const tilt = side * 0.23;
        const [dx, dy, dz] = rotateAround(ax, ay, az, ux, uy, uz, spread);
        const [ex, ey, ez] = rotateAround(sx, sy, sz, ax, ay, az, tilt);
        const leafLen = len * (quality === 'medium' ? 0.70 : quality === 'low' ? 0.72 : 0.57);
        const halfW = len * (quality === 'medium' ? 0.37 : quality === 'low' ? 0.385 : 0.245);
        const rootX = cx + ax * len * start + sx * side * len * 0.115;
        const rootY = cy + ay * len * start + sy * side * len * 0.115;
        const rootZ = cz + az * len * start + sz * side * len * 0.115;
        for (const [along, across] of [[0, -0.62], [0, 0.62], [1, -0.90], [1, 0.90]]) {
          const width = across * halfW;
          const lift = Math.sin(along * Math.PI * 0.72) * len * 0.15;
          const px = rootX + dx * leafLen * along + ex * width + ux * lift;
          const py = rootY + dy * leafLen * along + ey * width + uy * lift;
          const pz = rootZ + dz * leafLen * along + ez * width + uz * lift;
          pos.push(px, py, pz);
          const height = 0.72 + 0.42 * (0.5 + py / (lobe.ry + 0.001));
          colors.push(shade * height * bias[0], shade * height * bias[1], shade * height * bias[2]);
          uv.push(
            rect[0] + insetU + (0.5 + across * 0.46) * (rect[2] - rect[0] - insetU * 2),
            rect[1] + insetV + (0.05 + along * 0.90) * (rect[3] - rect[1] - insetV * 2),
          );
          flower.push(0);
        }
        index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
      return;
    }
    const rows = [0.05, 0.5, 0.95];
    const widths = [0.58, 1, 0.64];
    const halfW = len * 0.56;
    const arch = len * 0.42;
    const base = pos.length / 3;
    const shade = (blossom ? 0.50 : cluster) * lobe.tone;
    for (let row = 0; row < 3; row += 1) {
      const along = rows[row];
      const twist = (along - 0.5) * 0.85;
      const [s2x, s2y, s2z] = rotateAround(sx, sy, sz, ax, ay, az, twist);
      const [u2x, u2y, u2z] = rotateAround(ux, uy, uz, ax, ay, az, twist);
      const lift = Math.sin(along * Math.PI) * arch;
      for (const side of [-1, 1]) {
        const across = side * widths[row] * halfW;
        const px = cx + ax * along * len + s2x * across + u2x * lift;
        const py = cy + ay * along * len + s2y * across + u2y * lift;
        const pz = cz + az * along * len + s2z * across + u2z * lift;
        pos.push(px, py, pz);
        const height = 0.72 + 0.42 * (0.5 + py / (lobe.ry + 0.001));
        colors.push(shade * height * bias[0], shade * height * bias[1], shade * height * bias[2]);
        uv.push(
          rect[0] + insetU + (0.5 + side * widths[row] * 0.46) * (rect[2] - rect[0] - insetU * 2),
          rect[1] + insetV + along * (rect[3] - rect[1] - insetV * 2),
        );
        flower.push(blossom ? 1 : 0);
      }
    }
    index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3, base + 2, base + 4, base + 3, base + 3, base + 4, base + 5);
  };
  let flowersLeft = flowerBudget;
  for (let i = 0; i < shellN; i += 1) {
    const yaw = r41Unit(i + salt, 1) * TAU;
    const up = species === 'plane'
      ? 1 - Math.pow(r41Unit(i + salt, 2), 0.62) * 1.5
      : (r41Unit(i + salt, 2) - 0.38) * 1.65;
    const yN = Math.max(-1, Math.min(1, up));
    const ring = Math.sqrt(Math.max(0, 1 - yN * yN));
    const reach = 0.97 - (i / (quality === 'low' ? 36 : 96)) * 0.22;
    // Lobes 0–1 flower inside the shared low shell. Later lobes flower only on
    // the shell ring their tier adds, so the low outer sprays stay identical.
    const flowerShell = lobeIndex < 2 ? 4 : lobeIndex < 4 ? 24 : 56;
    const blossom = flowering && flowersLeft > 0 && i === flowerShell;
    if (blossom) flowersLeft -= 1;
    const cluster = 0.84 + r41Unit(i + salt, 9) * 0.24;
    pushSpray(
      Math.cos(yaw) * ring * lobe.rx * reach,
      yN * lobe.ry * reach,
      Math.sin(yaw) * ring * lobe.rz * reach,
      yaw + (r41Unit(i + salt, 4) - 0.5) * 2.4,
      (species === 'plane' ? 0.28 : 0.02) + (r41Unit(i + salt, 5) - 0.5) * 1.7,
      (r41Unit(i + salt, 6) - 0.5) * Math.PI,
      span * (blossom ? 0.18 : (0.35 + r41Unit(i + salt, 7) * 0.10) * (quality === 'low' ? 1.2 : 1)),
      blossom,
      cluster,
    );
  }
  for (let i = 0; i < interiorN; i += 1) {
    const yaw = r41Unit(i + salt + 200, 1) * TAU;
    const yN = (r41Unit(i + salt + 200, 2) - 0.48) * 1.35;
    const ring = Math.sqrt(Math.max(0, 1 - Math.min(1, yN * yN)));
    const reach = 0.18 + r41Unit(i + salt + 200, 3) * 0.38;
    const cluster = 0.78 + r41Unit(i + salt + 200, 9) * 0.20;
    pushSpray(
      Math.cos(yaw) * ring * lobe.rx * reach,
      Math.max(-1, Math.min(1, yN)) * lobe.ry * reach,
      Math.sin(yaw) * ring * lobe.rz * reach,
      yaw + (r41Unit(i + salt + 200, 4) - 0.5) * 2.8,
      (r41Unit(i + salt + 200, 5) - 0.5) * 2.2,
      (r41Unit(i + salt + 200, 6) - 0.5) * Math.PI,
      span * (0.30 + r41Unit(i + salt + 200, 7) * 0.08) * (quality === 'low' ? 1.2 : 1),
      false,
      cluster,
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aFlower', new THREE.Float32BufferAttribute(flower, 1));
  g.setIndex(index);
  g.computeVertexNormals();
  const position = g.attributes.position;
  const normal = g.attributes.normal;
  for (let v = 0; v < position.count; v += 1) {
    const px = position.getX(v), py = position.getY(v), pz = position.getZ(v);
    let gx = normal.getX(v), gy = normal.getY(v), gz = normal.getZ(v);
    const gl = Math.hypot(gx, gy, gz) || 1;
    gx /= gl; gy /= gl; gz /= gl;
    let vx = px / (lobe.rx * lobe.rx);
    let vy = py / (lobe.ry * lobe.ry);
    let vz = pz / (lobe.rz * lobe.rz);
    const vl = Math.hypot(vx, vy, vz) || 1;
    vx /= vl; vy /= vl; vz /= vl;
    if (gx * vx + gy * vy + gz * vz < 0) { vx = -vx; vy = -vy; vz = -vz; }
    let nx = gx * 0.45 + vx * 0.55;
    let ny = gy * 0.45 + vy * 0.55;
    let nz = gz * 0.45 + vz * 0.55;
    const nl = Math.hypot(nx, ny, nz);
    if (!(nl > 1e-6)) normal.setXYZ(v, gx, gy, gz);
    else normal.setXYZ(v, nx / nl, ny / nl, nz / nl);
  }
  g.userData.r41Cards = cards;
  g.userData.r41Flowers = flowerBudget - flowersLeft;
  return g;
}

function r148CompoundAtlas(){
  const size=256,data=new Uint8Array(size*size*4),coverage=new Float32Array(size*size),tone=new Float32Array(size*size);
  const raster=(cx,cy,rx,ry,angle,value)=>{const c=Math.cos(angle),s=Math.sin(angle),reach=Math.max(rx,ry)+.006;for(let y=Math.max(0,Math.floor((cy-reach)*size));y<Math.min(size,Math.ceil((cy+reach)*size));y++)for(let x=Math.max(0,Math.floor((cx-reach)*size));x<Math.min(size,Math.ceil((cx+reach)*size));x++){const dx=(x+.5)/size-cx,dy=(y+.5)/size-cy,u=(dx*c+dy*s)/rx,v=(-dx*s+dy*c)/ry,a=Math.max(0,Math.min(1,(1-Math.sqrt(u*u+v*v))*size*Math.min(rx,ry)+.5)),i=y*size+x;if(a>coverage[i]){coverage[i]=a;tone[i]=value;}}};
  const shoot=(x0,y0,x1,y1,width,value)=>{const steps=Math.ceil(Math.hypot(x1-x0,y1-y0)*size);for(let i=0;i<=steps;i++){const t=i/Math.max(1,steps);raster(x0+(x1-x0)*t,y0+(y1-y0)*t,width,width,0,value);}};
  shoot(.5,.025,.5,.97,.009,.54);
  for(let i=0;i<7;i++)for(const side of[-1,1]){
    const y=.075+i*.126+(side<0?.034:0)+(r41Unit(i+side,6)-.5)*.014;
    const reach=(.18+.14*Math.sin(Math.PI*(.16+.77*y)))*(.87+.13*r41Unit(i+side,3));
    const x1=.5+side*reach,y1=Math.min(.974,y+.095+.045*r41Unit(i+side,2));
    const curve=(t)=>({x:.5+(x1-.5)*t,y:y+(y1-y)*t+.017*Math.sin(t*Math.PI)});
    let last=curve(0);for(let k=1;k<=12;k++){const next=curve(k/12);shoot(last.x,last.y,next.x,next.y,.007,.57);last=next;}
    const n=5+(i%2),dx=x1-.5,dy=y1-y,axis=Math.hypot(dx,dy),ax=dx/axis,ay=dy/axis;
    for(let j=0;j<n;j++){
      const t=(j+.48)/(n+.25),root=curve(t);
      for(const flank of[-1,1]){
        const len=(.033+.010*(1-t))*(.84+.16*r41Unit(i+j+side,9));
        const ex=ax*.43-ay*flank*.90,ey=ay*.43+ax*flank*.90,e=Math.hypot(ex,ey),ux=ex/e,uy=ey/e;
        shoot(root.x,root.y,root.x+ux*len*.72,root.y+uy*len*.72,.0035,.60);
        raster(root.x+ux*len*.65,root.y+uy*len*.65,.0160*(1-.17*t),len*.62,Math.atan2(-ux,uy),.59+.12*r41Unit(i*7+j+flank,7));
      }
    }
    raster(x1,y1,.012,.027,Math.atan2(-ax,ay),.66);
  }
  raster(.5,.965,.016,.031,0,.67);
  for(let i=0;i<coverage.length;i++){const k=i*4,v=Math.round(tone[i]*255);data[k]=v;data[k+1]=v;data[k+2]=v;data[k+3]=Math.round(coverage[i]*255);}
  const texture=new THREE.DataTexture(data,size,size);texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;texture.name='r148-jacaranda-compound-spray';return texture;
}

function r148JacarandaLobe(lobe,quality,salt,bias,lobeIndex,terminal,legacy){
  const pos=[],col=[],uv=[],flower=[],idx=[],carriers=[],sprays=[],n=quality==='high'?6:5,stations=quality==='medium'?3:4,rows=quality==='low'?3:4;
  const centre=new THREE.Vector3(lobe.x,lobe.y,lobe.z),root=new THREE.Vector3().fromArray(terminal.point).sub(centre);
  const vertex=(p,u,v,shade)=>{const i=pos.length/3;pos.push(p.x,p.y,p.z);col.push(shade*bias[0],shade*bias[1],shade*bias[2]);uv.push(u+2,v);flower.push(0);return i;};
  const at=(points,t)=>{const f=t*(points.length-1),segment=Math.min(points.length-2,Math.floor(f)),segmentU=f-segment;return{p:points[segment].clone().lerp(points[segment+1],segmentU),segment,segmentU};};
  for(let j=0;j<n;j++){
    const yaw=j*2.399963+salt*.18,reach=.30+.20*r41Unit(j+salt,5),end=new THREE.Vector3(Math.cos(yaw)*lobe.rx*reach,((j%3)-1)*lobe.ry*.36,Math.sin(yaw)*lobe.rz*reach);
    if(lobeIndex===2&&j===0)end.y=lobe.ry*.86;
    const points=[];for(let k=0;k<(quality==='high'?4:3);k++){const t=k/(quality==='high'?3:2),p=root.clone().lerp(end,t);p.y+=Math.sin(t*Math.PI)*.018;p.z+=Math.sin(t*Math.PI)*.016*Math.sin(yaw);points.push(p);}
    const carrier={id:j,points:points.map(p=>p.toArray()),radius:.0045,root:root.toArray(),terminal:terminal.point};carriers.push(carrier);
    const base=pos.length/3;
    for(let k=0;k<points.length;k++){
      const tangent=points[Math.min(k+1,points.length-1)].clone().sub(points[Math.max(0,k-1)]).normalize(),side=new THREE.Vector3(-tangent.z,0,tangent.x).normalize(),up=new THREE.Vector3().crossVectors(tangent,side).normalize(),r=.0045*(1-.66*k/(points.length-1));
      for(let s=0;s<3;s++){const angle=s*Math.PI*2/3,p=points[k].clone().addScaledVector(side,Math.cos(angle)*r).addScaledVector(up,Math.sin(angle)*r);vertex(p,.497+s*.003,.40+.15*k/(points.length-1),.74);}
    }
    for(let k=0;k<points.length-1;k++)for(let s=0;s<3;s++){const a=base+k*3+s,b=base+k*3+(s+1)%3,c=base+(k+1)*3+s,d=base+(k+1)*3+(s+1)%3;idx.push(a,c,b,b,c,d);}
    for(let station=0;station<stations;station++)for(const side of[-1,1]){
      const t=(quality==='high'?.24+station*.22:quality==='low'&&station===3?.42:.27+station*.30)+(side<0?.014:0),sample=at(points,t),tangent=points[sample.segment+1].clone().sub(points[sample.segment]).normalize(),az=Math.atan2(tangent.z,tangent.x)+side*(.53+.08*r41Unit(j+station+salt,4)),pitch=.15+.15*r41Unit(j+station+salt,9),dir=new THREE.Vector3(Math.cos(az)*Math.cos(pitch),Math.sin(pitch),Math.sin(az)*Math.cos(pitch));
      const across=new THREE.Vector3(-dir.z,0,dir.x).normalize(),up=new THREE.Vector3().crossVectors(dir,across).normalize(),roll=side*(.08+.13*r41Unit(j+station+salt,7));across.applyAxisAngle(dir,roll);up.applyAxisAngle(dir,roll);
      const len=(.195+.055*r41Unit(j*(quality==='low'?3:stations)+station+salt,2))*(quality==='low'?1.07:1),halfW=.085+.025*r41Unit(j+station+salt,3),start=pos.length/3,shade=Math.max(.70,Math.min(1.00,lobe.tone*(.86+.10*r41Unit(j+station+salt,6))));
      for(let k=0;k<rows;k++){const a=k/(rows-1),width=halfW*(k===0?.028:k===rows-1?.22:1),lift=Math.sin(a*Math.PI)*.018;for(const edge of[-1,1]){const p=sample.p.clone().addScaledVector(dir,len*a).addScaledVector(across,edge*width).addScaledVector(up,lift);vertex(p,(edge+1)/2,.025+a*.95,shade*(.96+.04*a));}}
      for(let k=0;k<rows-1;k++){const a=start+k*2,b=a+1,c=a+2,d=a+3;idx.push(a,b,c,b,d,c);}
      sprays.push({carrier:j,station,side,segment:sample.segment,segmentU:sample.segmentU,root:sample.p.toArray(),vertexStart:start,vertexCount:rows*2,length:len});
    }
  }
  // Fit only the upper lobe about its real wooden attachment, retaining accepted height.
  if(lobeIndex===2){let max=-Infinity;for(let i=1;i<pos.length;i+=3)max=Math.max(max,pos[i]);const top=({high:1.1833508014678955,medium:1.1644138097763062,low:1.1676675081253052})[quality]-lobe.y,scale=(top-root.y)/(max-root.y);for(let i=1;i<pos.length;i+=3)pos[i]=root.y+(pos[i]-root.y)*scale;for(const c of carriers)for(const point of c.points)point[1]=root.y+(point[1]-root.y)*scale;for(const s of sprays)s.root[1]=root.y+(s.root[1]-root.y)*scale;}
  const g=new THREE.BufferGeometry();for(const[name,array,size]of[['position',pos,3],['color',col,3],['uv',uv,2],['aFlower',flower,1]])g.setAttribute(name,new THREE.Float32BufferAttribute(array,size));g.setIndex(idx);g.computeVertexNormals();tagWind(g,.28);
  const kept=new Set();for(let i=0;i<legacy.index.count;i+=3){const ids=[legacy.index.getX(i),legacy.index.getX(i+1),legacy.index.getX(i+2)];if(ids.every(k=>legacy.attributes.aFlower.getX(k)===1))for(const k of ids)kept.add(k);}
  const selected=[...kept].sort((a,b)=>a-b),f=new THREE.BufferGeometry(),map=new Map(selected.map((k,i)=>[k,i]));for(const[name,a]of Object.entries(legacy.attributes)){const values=[];for(const k of selected)for(let c=0;c<a.itemSize;c++)values.push(a.array[k*a.itemSize+c]);f.setAttribute(name,new THREE.Float32BufferAttribute(values,a.itemSize));}const fi=[];for(let i=0;i<legacy.index.count;i+=3){const ids=[legacy.index.getX(i),legacy.index.getX(i+1),legacy.index.getX(i+2)];if(ids.every(k=>kept.has(k)))fi.push(...ids.map(k=>map.get(k)));}f.setIndex(fi);
  const result=mergeGeometries(fi.length?[g,f]:[g]);result.userData.r148Jacaranda={lobe:lobeIndex,lobeCentre:centre.toArray(),terminal,carriers,sprays,flowerVertices:kept.size,flowerTriangles:fi.length/3};g.dispose();f.dispose();legacy.dispose();return result;
}

function buildConnectedBroadleaf(formId, quality) {
  const form = SPECIES_FORM[formId];
  const tier = R41_WOOD[quality] ?? R41_WOOD.high;
  const wood = [];
  const boleRings = tier.boleRings;
  const bolePts = [];
  for (let i = 0; i < boleRings; i += 1) {
    const t = i / (boleRings - 1);
    bolePts.push(new THREE.Vector3(
      form.boleLean[0] * t * t,
      form.boleTop * t,
      form.boleLean[1] * t * t,
    ));
  }
  const boleR = form.boleR * BOLE_GIRTH;
  const boleTopR = form.boleTopR * BOLE_GIRTH;
  const carried = { frame: 'transport' };
  wood.push(limbGeometry(bolePts, bolePts.map((_, i) => {
    const t = i / (boleRings - 1);
    return boleR + (boleTopR - boleR) * Math.pow(t, 0.62);
  }), tier.boleSides, { flare: form.boleFlare, flareLobes: 3, flarePhase: 0.4, ridge: 0.06, capTip: false, ...carried }));
  for (let i = 0; i < 3; i += 1) {
    const az = 0.4 + (i / 3) * TAU;
    wood.push(limbGeometry([
      new THREE.Vector3(0, 0.045, 0),
      new THREE.Vector3(Math.cos(az) * boleR * 1.7, 0.008, Math.sin(az) * boleR * 1.7),
    ], [boleR * 0.7, boleR * 0.28], tier.flareSides, { ridge: 0.08, capTip: false, ...carried }));
  }
  const lobes = R41_LOBES[formId];
  const fork = bolePts[bolePts.length - 1];
  const primaryLines = [];
  const jacarandaTerminals = [];
  for (let i = 0; i < 3; i += 1) {
    const lobe = lobes[i];
    const center = new THREE.Vector3(lobe.x, lobe.y, lobe.z);
    const tip = fork.clone().lerp(center, 0.42);
    const bow = (i % 2 === 0 ? 1 : -1) * (formId === 'jacaranda' ? 0.08 : 0.05);
    const lift = formId === 'jacaranda' ? -0.05 : 0.02;
    const pts = r41Curve(fork, tip, bow, lift, tier.primRings - 1);
    primaryLines.push(pts);
    const spec = form.limbs[Math.min(i, form.limbs.length - 1)];
    wood.push(limbGeometry(pts, taperRadii(pts, spec.r * LIMB_GIRTH * 1.15, spec.tipR * LIMB_GIRTH), tier.primSides, { ridge: 0.045, capTip: tier.primCap, ...carried }));
  }
  for (let ci = 0; ci < lobes.length; ci += 1) {
    const lobe = lobes[ci];
    const center = new THREE.Vector3(lobe.x, lobe.y, lobe.z);
    const buried = fork.clone().lerp(center, 0.58);
    let from = primaryLines[0][1];
    let best = Infinity;
    for (const line of primaryLines) {
      const p = line[Math.min(line.length - 1, 1)];
      const d = p.distanceToSquared(buried);
      if (d < best) { best = d; from = p; }
    }
    const bow = (ci % 2 === 0 ? 0.04 : -0.04);
    const pts = r41Curve(from.clone(), buried, bow, -lobe.ry * 0.15, tier.secRings - 1);
    const r0 = 0.010 + Math.min(lobe.rx, lobe.rz) * 0.012;
    if(formId==='jacaranda')jacarandaTerminals.push({point:pts.at(-1).toArray(),radius:r0*.42,ringVertex:wood.reduce((n,g)=>n+g.attributes.position.count,0)+(pts.length-1)*tier.secSides,sides:tier.secSides});
    wood.push(limbGeometry(pts, taperRadii(pts, r0, r0 * 0.42), tier.secSides, { ridge: 0.04, capTip: false, ...carried }));
  }
  const stubAt = new THREE.Vector3(form.boleLean[0] * 0.8, form.stubFrom, form.boleLean[1] * 0.8);
  const stubPts = limbCentreline(stubAt, form.stub, tier.stubRings - 1);
  wood.push(limbGeometry(stubPts, taperRadii(stubPts, form.stub.r * LIMB_GIRTH, form.stub.tipR * LIMB_GIRTH), tier.stubSides, { ridge: 0.1, capTip: false, ...carried }));
  const stubTip = stubPts[stubPts.length - 1];
  const stubDir = stubTip.clone().sub(stubPts[Math.max(0, stubPts.length - 2)]).normalize();
  const splinter = new THREE.BufferGeometry();
  const sPos = [stubTip.x, stubTip.y, stubTip.z];
  const sIdx = [];
  const axis = Math.abs(stubDir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-stubDir.z, 0, stubDir.x).normalize();
  const bit = new THREE.Vector3().crossVectors(stubDir, axis).normalize();
  for (let i = 0; i <= tier.spikes; i += 1) {
    const a = (i / tier.spikes) * TAU;
    const reach = i % 2 ? 0.028 : 0.012;
    sPos.push(
      stubTip.x + (Math.cos(a) * axis.x + Math.sin(a) * bit.x) * 0.02 + stubDir.x * reach,
      stubTip.y + (Math.cos(a) * axis.y + Math.sin(a) * bit.y) * 0.02 + stubDir.y * reach,
      stubTip.z + (Math.cos(a) * axis.z + Math.sin(a) * bit.z) * 0.02 + stubDir.z * reach,
    );
  }
  for (let i = 0; i < tier.spikes; i += 1) sIdx.push(0, i + 1, i + 2);
  splinter.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
  splinter.setIndex(sIdx);
  splinter.computeVertexNormals();
  const sc = new Float32Array(splinter.attributes.position.count * 3);
  for (let i = 0; i < sc.length; i += 3) { sc[i] = 1.35; sc[i + 1] = 1.22; sc[i + 2] = 0.96; }
  splinter.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  for (const g of wood) {
    paintBark(g, form.barkMode);
    const bark = g.attributes.color;
    for (let i = 0; i < bark.count; i += 1) bark.setXYZ(i, bark.getX(i) * 0.62, bark.getY(i) * 0.56, bark.getZ(i) * 0.50);
  }
  wood.push(splinter);
  const woodGeometry = mergeGeometries(wood);
  tagWindRamp(woodGeometry, 0, 0.13, form.top);
  woodGeometry.userData.barkColor = `#${new THREE.Color(form.bark).getHexString()}`;
  woodGeometry.userData.r41WoodTriangles = woodGeometry.index.count / 3;

  const shedP = new THREE.Vector3(form.shed.x, form.shed.y, form.shed.z);
  const ranked = lobes.map((c, i) => ({
    i, d: (c.x - shedP.x) ** 2 + (c.y - shedP.y) ** 2 + (c.z - shedP.z) ** 2,
  })).sort((a, b) => a.d - b.d);
  const dropIdx = new Set(ranked.slice(0, 2).map((row) => row.i));
  const flowerTotal = formId === 'jacaranda' ? (quality === 'low' ? 2 : quality === 'medium' ? 4 : 5) : 0;
  const keepLeaves = [], dropLeaves = [];
  const jacarandaProof={keep:[],drop:[]};
  for (let i = 0; i < lobes.length; i += 1) {
    let g = r41LobeCards(lobes[i], quality, formId, i * 17 + 3, form.leafBias, i < flowerTotal ? 1 : 0, i);
    if(formId==='jacaranda'){g=r148JacarandaLobe(lobes[i],quality,i*17+3,form.leafBias,i,jacarandaTerminals[i],g);const key=dropIdx.has(i)?'drop':'keep',list=dropIdx.has(i)?dropLeaves:keepLeaves;jacarandaProof[key].push({...g.userData.r148Jacaranda,vertexBase:list.reduce((n,g)=>n+g.attributes.position.count,0)});}
    g.translate(lobes[i].x, lobes[i].y, lobes[i].z);
    tagWind(g, 0.28);
    (dropIdx.has(i) ? dropLeaves : keepLeaves).push(g);
  }
  const leafGeometry = mergeGeometries(keepLeaves);
  const leafDropGeometry = dropLeaves.length ? mergeGeometries(dropLeaves) : null;
  leafGeometry.userData.r41PartBounds = r41PartBounds(leafGeometry);
  if (leafDropGeometry) leafDropGeometry.userData.r41PartBounds = r41PartBounds(leafDropGeometry);
  if(formId==='jacaranda'){leafGeometry.userData.r148Jacaranda={lobes:jacarandaProof.keep};leafDropGeometry.userData.r148Jacaranda={lobes:jacarandaProof.drop};}
  const leafTris = leafGeometry.index.count / 3 + (leafDropGeometry ? leafDropGeometry.index.count / 3 : 0);
  leafGeometry.userData.r41LeafDropTriangles = leafTris;
  if (leafDropGeometry) leafDropGeometry.userData.r41LeafDropTriangles = leafTris;
  const fused = lobes.map((c, i) => ({ x: c.x, y: c.y, z: c.z, drop: dropIdx.has(i) }));
  const dropClusters = fused.filter((c) => c.drop);
  const keepClusters = fused.filter((c) => !c.drop);
  const dropHeading = canopyFallHeading(form, dropClusters);
  const keepHeading = dropHeading + Math.PI;
  return {
    wood: woodGeometry,
    leaf: leafGeometry,
    leafDrop: leafDropGeometry,
    shedLocal: new THREE.Matrix4().compose(
      new THREE.Vector3(form.shed.x, form.shed.y, form.shed.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), form.shed.yaw),
      new THREE.Vector3(form.shed.scale, form.shed.scale, form.shed.scale),
    ),
    debrisLocal: new THREE.Matrix4().compose(
      new THREE.Vector3(form.debris.x, form.debris.y, form.debris.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), form.debris.yaw),
      new THREE.Vector3(form.debris.scale, form.debris.scale, form.debris.scale),
    ),
    dropLocal: makeDropGroundLocal(form, dropClusters, { heading: dropHeading }),
    keepLocal: makeDropGroundLocal(form, keepClusters, { heading: keepHeading }),
    dropHeading,
    keepHeading,
    form,
  };
}

/**
 * Bole + limbs + twigs + one deadwood stub, and the separate leaf masses that the limbs
 * carry. Built in unit-tree space with the ground at y = 0.
 */
/** R145: connected feather surfaces share the standing and shed crown owners. */
function buildR145PalmCrown(stemParts, form, quality) {
  for (const g of stemParts) paintBark(g, form.barkMode);
  const wood = mergeGeometries(stemParts);
  tagWindRamp(wood, 0, 0.13, form.top);
  wood.userData.barkColor = `#${new THREE.Color(form.bark).getHexString()}`;
  const base = new THREE.Vector3(form.boleLean[0], form.boleTop, form.boleLean[1]);
  const pairs = quality === 'high' ? 16 : quality === 'low' ? 8 : 12;
  const stations = quality === 'high' ? 8 : quality === 'low' ? 5 : 6;
  const keep = [], drop = [], proof = [];
  function geometry(vertices, faces, tone) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flatMap(p => p.toArray()), 3));
    g.setIndex(faces); g.computeVertexNormals();
    const colors = new Float32Array(vertices.length * 3), uv = new Float32Array(vertices.length * 2), rgb = [];
    for (let i = 0; i < vertices.length; i++) {
      leafValue(g.attributes.normal.getY(i), tone, 0.53, 0.48, form.leafBias, rgb);
      colors.set(rgb, i * 3);
      // Geometry defines the feather edge. The held atlas's opaque guard strip
      // supplies its surface value; no alpha-cut foliage cell trims these blades.
      uv[i * 2] = 0; uv[i * 2 + 1] = 0;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return tagWind(g, 0.28);
  }
  function outward(vertices, faces, inside) {
    const result = [];
    for (const [a,b,c] of faces) {
      const centre = vertices[a].clone().add(vertices[b]).add(vertices[c]).multiplyScalar(1/3);
      const normal = vertices[b].clone().sub(vertices[a]).cross(vertices[c].clone().sub(vertices[a]));
      result.push(...(normal.dot(centre.sub(inside)) < 0 ? [a,c,b] : [a,b,c]));
    }
    return result;
  }
  // Long lower fronds, a rising middle tier and four subordinate inner spears.
  // Angles use a non-repeating phyllotactic sequence, with local sweep and length.
  for (let i = 0; i < 17; i++) {
    const tier = i < 7 ? 0 : i < 13 ? 1 : 2;
    const salt = r41Unit(i + 71, 3), az = i * 2.399963 + (salt - .5) * .22;
    const forward = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
    const across = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
    const reach = tier === 0 ? .58 + salt * .10 : tier === 1 ? .43 + salt * .12 : .19 + salt * .095;
    const rise = tier === 0 ? .15 + salt * .07 : tier === 1 ? .24 + salt * .07 : .23 + salt * .04;
    const endY = tier === 0 ? -.25 + salt * .06 : tier === 1 ? -.035 + salt * .08 : .20 + salt * .035;
    const sweep = (r41Unit(i + 71, 5) - .5) * .19;
    const point = t => base.clone().addScaledVector(forward, reach * t)
      .addScaledVector(across, sweep * t * t)
      .add(new THREE.Vector3(0, Math.sin(Math.PI*t)*rise + endY*t, 0));
    const centres = Array.from({length:stations}, (_, j) => point(j/(stations-1)));
    const sample = t => {
      const f = Math.min(stations-1-1e-9, Math.max(0,t)*(stations-1)), j = Math.floor(f);
      return centres[j].clone().lerp(centres[j+1], f-j);
    };
    const parts = [], shaftVertices = [], shaftFaces = [];
    for (let j = 0; j < stations; j++) {
      const t = j/(stations-1), tangent = centres[Math.min(stations-1,j+1)].clone().sub(centres[Math.max(0,j-1)]).normalize();
      const normal = new THREE.Vector3().crossVectors(tangent, across).normalize();
      const radius = .0075 * (1-t) + .0018;
      for (let k=0;k<3;k++) shaftVertices.push(centres[j].clone()
        .addScaledVector(across, Math.cos(k*TAU/3)*radius)
        .addScaledVector(normal, Math.sin(k*TAU/3)*radius));
    }
    for (let j=0;j<stations-1;j++) for (let k=0;k<3;k++) {
      const a=j*3+k,b=j*3+(k+1)%3,c=(j+1)*3+k,d=(j+1)*3+(k+1)%3;
      shaftFaces.push(...outward(shaftVertices, [[a,b,d],[a,d,c]], centres[j].clone().lerp(centres[j+1],.5)));
    }
    shaftFaces.push(...outward(shaftVertices,[[0,1,2]],centres[1]));
    const end=(stations-1)*3;
    shaftFaces.push(...outward(shaftVertices,[[end,end+1,end+2]],centres[stations-2]));
    parts.push(geometry(shaftVertices,shaftFaces,.80 + salt * .08));
    const blades = [], roots = [];
    // Broad attached roots meet the actual piecewise shaft, and adjacent folded
    // blades overlap in projection. The feather remains readable below fine-detail scale.
    for (let pair=0;pair<pairs;pair++) for (const sign of [-1,1]) {
      const t = .09 + .85 * pair/(pairs-1), dt = .85/(pairs-1);
      const rootA=sample(t-dt*.48), rootB=sample(t+dt*.48), root=sample(t);
      const length=(tier===2?.095:tier===1?.19:.255) * (.34 + .66*Math.sin(Math.PI*Math.pow(t,.8)));
      const direction=across.clone().multiplyScalar(sign).addScaledVector(forward,.38 + .16*t).normalize();
      const tip=root.clone().addScaledVector(direction,length).add(new THREE.Vector3(0,-length*(.17+.35*t),0));
      const width=(tier===2?.026:tier===1?.043:.049)*(1-.34*t)*(quality==='low'?1.12:1);
      const mid=root.clone().lerp(tip,.43);
      const left=mid.clone().addScaledVector(forward,-width);
      const right=root.clone().lerp(tip,.62).addScaledVector(forward,width);
      const tangent=rootB.clone().sub(rootA).normalize(), bladeAxis=tip.clone().sub(root).normalize();
      const fold=new THREE.Vector3().crossVectors(tangent,bladeAxis).normalize();
      if(fold.y<0)fold.negate();
      const ridge=mid.clone().addScaledVector(fold,.010 + length*.055);
      const underside=mid.clone().addScaledVector(fold,-.0025);
      const vertices=[rootA,left,tip,right,rootB,ridge,underside], faces=[];
      for(let k=0;k<5;k++)faces.push([k,(k+1)%5,5],[(k+1)%5,k,6]);
      parts.push(geometry(vertices,outward(vertices,faces,mid), .86 + salt*.16 - tier*.018));
      roots.push(rootA.toArray(),rootB.toArray());
      blades.push({root:root.toArray(),rootA:rootA.toArray(),rootB:rootB.toArray(),tip:tip.toArray(),length,width});
    }
    // A short folded terminal blade closes the shaft tip without a bare wire end.
    const terminalRoot=centres.at(-1).clone(), tangent=terminalRoot.clone().sub(centres.at(-2)).normalize();
    const terminalTip=terminalRoot.clone().addScaledVector(tangent,tier===2?.055:.070), mid=terminalRoot.clone().lerp(terminalTip,.45);
    const v=[terminalRoot,mid.clone().addScaledVector(across,.014),terminalTip,mid.clone().addScaledVector(across,-.014),mid.clone().add(new THREE.Vector3(0,.004,0)),mid.clone().add(new THREE.Vector3(0,-.002,0))];
    const faces=[[0,1,4],[1,2,4],[2,3,4],[3,0,4],[1,0,5],[2,1,5],[3,2,5],[0,3,5]];
    parts.push(geometry(v,outward(v,faces,mid),.87 + salt*.13));
    const frond=mergeGeometries(parts);parts.forEach(g=>g.dispose());
    const isDrop=i===3||i===4; (isDrop?drop:keep).push(frond);
    proof.push({index:i,tier,drop:isDrop,anchor:base.toArray(),rachis:centres.map(p=>p.toArray()),leafletRoots:roots,blades,
      terminalRoot:terminalRoot.toArray(),terminalTip:terminalTip.toArray(),reach,rise,endY,sweep,triangles:frond.index.count/3});
  }
  const leaf=mergeGeometries(keep),leafDrop=mergeGeometries(drop);[...keep,...drop].forEach(g=>g.dispose());
  leaf.userData.r145Palm={fronds:proof.filter(p=>!p.drop),pairs};
  leafDrop.userData.r145Palm={fronds:proof.filter(p=>p.drop),pairs};
  function fall(g,heading) {
    const m=makeDropGroundLocal(form,[],{heading}),p=new THREE.Vector3();m.elements[13]=0;let minY=Infinity;
    for(let i=0;i<g.attributes.position.count;i++)minY=Math.min(minY,p.fromBufferAttribute(g.attributes.position,i).applyMatrix4(m).y);
    m.elements[13]=.045-minY;return m;
  }
  const dropHeading=form.clusters[3].yaw+.4,keepHeading=dropHeading+Math.PI;
  const local=spec=>new THREE.Matrix4().compose(new THREE.Vector3(spec.x,spec.y,spec.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),spec.yaw),new THREE.Vector3(spec.scale,spec.scale,spec.scale));
  return{wood,leaf,leafDrop,shedLocal:local(form.shed),debrisLocal:local(form.debris),
    dropLocal:fall(leafDrop,dropHeading),keepLocal:fall(leaf,keepHeading),dropHeading,keepHeading,form};
}

// A local monochrome conifer-spray patch: vertex and instance palettes supply green.
// One connected axial shoot supports irregular lateral branchlets and attached scales.
function cypressBranchAtlas() {
  const size=256,data=new Uint8Array(size*size*4);
  function stroke(ax,ay,bx,by,width,value){
    const dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;
    const x0=Math.max(0,Math.floor((Math.min(ax,bx)-width-.006)*size)),x1=Math.min(size-1,Math.ceil((Math.max(ax,bx)+width+.006)*size));
    const y0=Math.max(0,Math.floor((Math.min(ay,by)-width-.006)*size)),y1=Math.min(size-1,Math.ceil((Math.max(ay,by)+width+.006)*size));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const px=(x+.5)/size,py=(y+.5)/size,t=THREE.MathUtils.clamp(((px-ax)*dx+(py-ay)*dy)/den,0,1);
      const d=Math.hypot(px-ax-t*dx,py-ay-t*dy),a=THREE.MathUtils.clamp((width-d)*size+.6,0,1),o=(y*size+x)*4;
      if(a*255>data[o+3]){const tone=Math.round(value*255);data[o]=data[o+1]=data[o+2]=tone;data[o+3]=Math.round(a*255);}
    }
  }
  stroke(.5,0,.5,1,.011,.82);
  for(let i=0;i<22;i++)for(const sign of[-1,1]){
    const y=.055+i*.039+(sign<0?.009:0),w=(.16+.20*Math.sin(Math.PI*y))*(.9+.10*r41Unit(i,7));
    const tipX=.5+sign*w,tipY=Math.min(.975,y+.055+.045*r41Unit(i,2));
    stroke(.5,y,tipX,tipY,.006,.84+.06*r41Unit(i,8));
    for(let j=1;j<=10;j++){
      const t=j/11,x=.5+(tipX-.5)*t,v=y+(tipY-y)*t,len=.026+.015*(1-t);
      for(const s of[-1,1]){const ex=x+sign*(.016+.006*r41Unit(i+j,3)),ey=v+s*len;
        stroke(x,v,ex,ey,.0105,.88+.10*r41Unit(i+j,6));}
    }
  }
  const texture=new THREE.DataTexture(data,size,size);texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  texture.name='r146b-cypress-branch-spray';return texture;
}

/** R146B: buried support and overlapping cutout conifer branch fans. */
function buildR146CypressCrown(wood, form, quality, fused) {
  const sectors = quality === 'high' ? 10 : quality === 'low' ? 8 : 9;
  const levels = quality === 'high' ? 11 : quality === 'low' ? 7 : 9;
  const sprayCount = quality === 'high' ? 144 : quality === 'low' ? 72 : 108;
  const top = 1.33326, floor = .22992;
  const uvCentre = [.5, .035], uvRadius = .001;
  const keep = [], drop = [], proof = [];
  const dropHeading = canopyFallHeading(form, fused.filter(c => c.drop));
  const keepHeading = dropHeading + Math.PI;
  const profile = t => .0042 + .0372 * Math.pow(Math.sin(Math.PI * t), .80) * (1.13 - .47 * t);
  const centre = y => new THREE.Vector3(form.boleLean[0] + .008*Math.sin(y*7), y, form.boleLean[1] + .006*Math.sin(y*9));
  const radius = (t, az) => profile(t) * (.94 + .07*Math.sin(az*3 + t*8) + .035*Math.sin(az*7 - t*5));
  const dropSector = sector => sector === 0 || sector === 1;
  const phase = dropHeading - Math.PI/sectors;
  function finish(vertices, faces, normals, tone, salt) {
    const position=[], normal=[], color=[], uv=[], index=[], rgb=[];
    for(const [a,b,c,outer] of faces){
      const ids=[a,b,c], faceNormal=vertices[b].clone().sub(vertices[a]).cross(vertices[c].clone().sub(vertices[a])).normalize();
      for(let j=0;j<3;j++){
        const id=ids[j],n=outer?normals[id]:faceNormal;
        position.push(...vertices[id].toArray());normal.push(...n.toArray());
        leafValue(n.y,tone,.48 + .05*r41Unit(id+salt,3),.38,form.leafBias,rgb);color.push(...rgb);
        const triangleUV=[[-1,-1],[1,-1],[0,1]][j];
        uv.push(uvCentre[0]+triangleUV[0]*uvRadius,uvCentre[1]+triangleUV[1]*uvRadius);
        index.push(index.length);
      }
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(color,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);
    return tagWind(g,.28);
  }
  // Closed neighbouring radial sectors form one supporting body at rest. Only
  // exterior normals are shared analytically; buried partition caps cannot round its rim.
  for(let sector=0;sector<sectors;sector++){
    const vertices=[],normals=[],faces=[],az0=phase+sector*TAU/sectors,az1=phase+(sector+1)*TAU/sectors;
    for(let j=0;j<levels;j++){
      const t=j/(levels-1),y=floor + t*(top-.045-floor),base=centre(y);vertices.push(base);normals.push(new THREE.Vector3(0,1,0));
      for(const az of[az0,az1]){
        const r=radius(t,az),dr=(radius(Math.min(1,t+.001),az)-radius(Math.max(0,t-.001),az))/.002/(top-.045-floor);
        vertices.push(base.clone().add(new THREE.Vector3(Math.cos(az)*r,0,Math.sin(az)*r)));
        normals.push(new THREE.Vector3(Math.cos(az),-dr,Math.sin(az)).normalize());
      }
    }
    for(let j=0;j<levels-1;j++){
      const a=j*3,b=a+1,c=a+2,d=a+3,e=a+4,f=a+5;
      faces.push([b,c,e,true],[c,f,e,true],[a,b,d,false],[b,e,d,false],[c,a,f,false],[a,d,f,false]);
    }
    faces.push([0,2,1,false]);const n=(levels-1)*3;faces.push([n,n+1,n+2,false]);
    for(const face of faces)[face[1],face[2]]=[face[2],face[1]];
    const g=finish(vertices,faces,normals,.80,sector*17);(dropSector(sector)?drop:keep).push(g);
    proof.push({kind:'support-sector',sector,drop:dropSector(sector),az0,az1,levels,triangles:g.index.count/3});
  }
  // Curved upward fans overlap radially and vertically. Their local cutout map
  // carries one continuous shoot and attached scale branchlets, not detached cards.
  for(let i=0;i<sprayCount;i++){
    const t=.015+.945*(i+.35*r41Unit(i,4))/sprayCount,y=floor+t*(top-.13-floor);
    const az=phase+i*GOLDEN_ANGLE+(r41Unit(i,5)-.5)*.22,coreR=radius(t,az),base=centre(y);
    const forward=new THREE.Vector3(Math.cos(az),0,Math.sin(az)),side=new THREE.Vector3(-Math.sin(az),0,Math.cos(az));
    const root=base.clone().addScaledVector(forward,coreR*.55);
    const rise=(.17+.085*r41Unit(i,2))*(1-.42*t),reach=(.102+.048*r41Unit(i,7))*(1-.66*t);
    const halfWidth=(.058+.018*r41Unit(i,11))*(1-.66*t),roll=(r41Unit(i,12)-.5)*.65;
    side.applyAxisAngle(forward,roll); const position=[],uv=[],color=[],index=[],rgb=[],points=[];
    for(let j=0;j<4;j++){
      const u=j/3,cp=root.clone().addScaledVector(forward,reach*(.7*u+.3*Math.sin(u*Math.PI*.5))).add(new THREE.Vector3(0,rise*u,0)).addScaledVector(side,Math.sin(u*Math.PI)*(r41Unit(i,9)-.5)*.015);
      points.push(cp.toArray());
      for(const sign of[-1,1]){position.push(...cp.clone().addScaledVector(side,sign*halfWidth).toArray());uv.push(sign<0?0:1,u);leafValue(.58,.91+.10*r41Unit(i,13),.50,.38,form.leafBias,rgb);color.push(...rgb);}
    }
    for(let j=0;j<3;j++){const a=j*2;index.push(a,a+1,a+2,a+1,a+3,a+2);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(color,3));g.setIndex(index);g.computeVertexNormals();tagWind(g,.28);
    const wrapped=((az-phase)%TAU+TAU)%TAU,sector=Math.floor(wrapped/TAU*sectors),isDrop=dropSector(sector);
    (isDrop?drop:keep).push(g);proof.push({kind:'branch-fan',index:i,drop:isDrop,sector,root:root.toArray(),coreCentre:base.toArray(),coreRadius:coreR,points,halfWidth,reach,rise,triangles:6});
  }
  // A small leader continues the support body into the retained original tree height.
  const base=centre(top-.115),tip=centre(top);tip.x=base.x;tip.z=base.z;
  const raw=limbGeometry([base,base.clone().lerp(tip,.50),tip],[.0063,.0039,.001],4,{capTip:true});
  const vertices=[],normals=[];for(let i=0;i<raw.attributes.position.count;i++){vertices.push(new THREE.Vector3().fromBufferAttribute(raw.attributes.position,i));normals.push(new THREE.Vector3().fromBufferAttribute(raw.attributes.normal,i).normalize());}
  const faces=[];for(let i=0;i<raw.index.count;i+=3)faces.push([raw.index.getX(i),raw.index.getX(i+1),raw.index.getX(i+2),true]);const cap=vertices.length;vertices.push(base);normals.push(new THREE.Vector3(0,-1,0));for(let k=0;k<4;k++)faces.push([cap,(k+1)%4,k,false]);
  const leader=finish(vertices,faces,normals,1.02,119);raw.dispose();keep.push(leader);proof.push({kind:'leader',drop:false,root:base.toArray(),tip:tip.toArray(),triangles:leader.index.count/3});
  const leaf=mergeGeometries(keep),leafDrop=mergeGeometries(drop);[...keep,...drop].forEach(g=>g.dispose());
  leaf.userData.r146Cypress={parts:proof.filter(p=>!p.drop),uvCentre,uvRadius,top,floor};
  leafDrop.userData.r146Cypress={parts:proof.filter(p=>p.drop),uvCentre,uvRadius,top,floor};
  const local=spec=>new THREE.Matrix4().compose(new THREE.Vector3(spec.x,spec.y,spec.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),spec.yaw),new THREE.Vector3(spec.scale,spec.scale,spec.scale));
  function ground(g,heading){const m=makeDropGroundLocal(form,[],{heading}),v=new THREE.Vector3();m.elements[13]=0;let min=Infinity;for(let i=0;i<g.attributes.position.count;i++)min=Math.min(min,v.fromBufferAttribute(g.attributes.position,i).applyMatrix4(m).y);m.elements[13]=.045-min;return m;}
  return{wood,leaf,leafDrop,shedLocal:local(form.shed),debrisLocal:local(form.debris),dropLocal:ground(leafDrop,dropHeading),keepLocal:ground(leaf,keepHeading),dropHeading,keepHeading,form};
}

// A local monochrome Norfolk short-needle patch: vertex and instance palettes supply green.
// One connected axial shoot supports irregular lateral branchlets and attached scales.
function norfolkNeedleAtlas() {
  const size=256,data=new Uint8Array(size*size*4);
  function stroke(ax,ay,bx,by,width,value){
    const dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;
    const x0=Math.max(0,Math.floor((Math.min(ax,bx)-width-.006)*size)),x1=Math.min(size-1,Math.ceil((Math.max(ax,bx)+width+.006)*size));
    const y0=Math.max(0,Math.floor((Math.min(ay,by)-width-.006)*size)),y1=Math.min(size-1,Math.ceil((Math.max(ay,by)+width+.006)*size));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const px=(x+.5)/size,py=(y+.5)/size,t=THREE.MathUtils.clamp(((px-ax)*dx+(py-ay)*dy)/den,0,1);
      const d=Math.hypot(px-ax-t*dx,py-ay-t*dy),a=THREE.MathUtils.clamp((width-d)*size+.6,0,1),o=(y*size+x)*4;
      if(a*255>data[o+3]){const tone=Math.round(value*255);data[o]=data[o+1]=data[o+2]=tone;data[o+3]=Math.round(a*255);}
    }
  }
  // Nine legible comb groups per side leave large cuts in the fan boundary.
  // Forks remain attached to each group, and groups share a continuous axial shoot.
  stroke(.5,0,.5,1,.018,.82);
  for(let i=0;i<9;i++)for(const sign of[-1,1]){
    const y=.065+i*.102+(sign<0?.023:0)+(r41Unit(i,4)-.5)*.010;
    const w=(.17+.13*Math.sin(Math.PI*y))*(.80+.20*r41Unit(i+(sign<0?17:0),7));
    const tipX=.5+sign*w,tipY=Math.min(.975,y+.017+.015*r41Unit(i,2));
    stroke(.5,y,tipX,tipY,.010,.86+.06*r41Unit(i,8));
    const forks=4+(i%2);
    for(let j=0;j<forks;j++){
      const t=(j+.5)/(forks+.15),x=.5+(tipX-.5)*t,v=y+(tipY-y)*t;
      const length=.014+.007*(1-t),dx=sign*(.024+.012*r41Unit(i+j,3));
      for(const side of[-1,1]){
        const ex=x+dx,ey=v+side*length;
        stroke(x,v,ex,ey,.0085,.91+.08*r41Unit(i+j,6));
        stroke(ex,ey,ex+sign*.013,ey+side*.006,.005,.94);
      }
    }
  }
  const texture=new THREE.DataTexture(data,size,size);texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  texture.name='r147c-norfolk-comb-spray';return texture;
}

/** R152: irregular whorled boughs with overlapping inner and outer needle shoots. */
function buildR147NorfolkCrown(baseWood,form,quality,bolePts){
 const tiers=[.285,.405,.548,.664,.802,.941,1.042],counts=[5,6,5,5,4,4,3],top=1.13994562625885;
 const outerSprigs=quality==='high'?4:quality==='medium'?3:2,sprigs=outerSprigs+2,sides=quality==='high'?5:quality==='medium'?4:3;
 const baseVertices=baseWood.reduce((n,g)=>n+g.attributes.position.count,0),baseIndices=baseWood.reduce((n,g)=>n+g.index.count,0),wood=[...baseWood],keep=[],drop=[],boughs=[],proof=[];
 const ranked=form.clusters.map((c,i)=>({i,d:(c.x-form.shed.x)**2+(c.y-form.shed.y)**2+(c.z-form.shed.z)**2})).sort((a,b)=>a.d-b.d),oldDrop=new Set(ranked.slice(0,2).map(r=>r.i)),fused=form.clusters.map((c,i)=>({...c,drop:oldDrop.has(i)}));
 const dropHeading=canopyFallHeading(form,fused.filter(c=>c.drop)),keepHeading=dropHeading+Math.PI;
 const boleAt=y=>{const f=THREE.MathUtils.clamp(y/form.boleTop,0,1)*(bolePts.length-1),i=Math.min(bolePts.length-2,Math.floor(f));return bolePts[i].clone().lerp(bolePts[i+1],f-i);};
 for(let tier=0;tier<tiers.length;tier++)for(let j=0;j<counts[tier];j++){
  const id=boughs.length,nominalAz=tier*.49+j*TAU/counts[tier]+(r41Unit(id,4)-.5)*.17,az=nominalAz+(r41Unit(id,20)-.5)*.26;
  const length=(.356-.044*tier)*(.78+.34*r41Unit(id,3)),y=tiers[tier]+(r41Unit(id,8)-.5)*.050;
  const root=boleAt(y),forward=new THREE.Vector3(Math.cos(az),0,Math.sin(az)),side=new THREE.Vector3(-Math.sin(az),0,Math.cos(az));
  const points=[root,root.clone().addScaledVector(forward,length*.52).addScaledVector(side,(r41Unit(id,2)-.5)*length*.22).add(new THREE.Vector3(0,-.013-.013*r41Unit(id,21),0)),root.clone().addScaledVector(forward,length).addScaledVector(side,(r41Unit(id,22)-.5)*length*.18).add(new THREE.Vector3(0,.012+.039*r41Unit(id,7),0))];
  const radii=[.0095*(1-tier*.065),.0068*(1-tier*.065),.0032];
  const g=limbGeometry(points,radii,sides,{capTip:true,ridge:.04,frame:'transport'});wood.push(g);boughs.push({id,tier,az,nominalAz,length,points,radii,forward,side,triangles:g.index.count/3});
 }
 // Whole dropped sprays are chosen on two named mid-crown flank boughs. The
 // permanent bough remains with the trunk, preserving the existing leaf-loss state.
 const nearest=tier=>boughs.filter(b=>b.tier===tier).sort((a,b)=>Math.abs(Math.atan2(Math.sin(a.nominalAz-dropHeading),Math.cos(a.nominalAz-dropHeading)))-Math.abs(Math.atan2(Math.sin(b.nominalAz-dropHeading),Math.cos(b.nominalAz-dropHeading))))[0].id;
 const dropped=new Set([nearest(2),nearest(3)]);
 for(const b of boughs){
  for(let s=0;s<sprigs;s++){
   const inner=s>=outerSprigs,local=inner?s-outerSprigs:s;
   // Rooted inner shoots interrupt the central ladder intermittently. Outer
   // shoots retain a feathery taper, with uneven reach rather than equal rails.
   const t=inner?.065+local*.13+(r41Unit(b.id+local,24)-.5)*.032:.26+.62*s/(outerSprigs-1)+(r41Unit(b.id+s,14)-.5)*.056;
   const seg=t<=.52?0:1,u=seg===0?t/.52:(t-.52)/.48,root=b.points[seg].clone().lerp(b.points[seg+1],u),sign=(s+b.id)%2?1:-1;
   const direction=b.forward.clone().multiplyScalar(inner?.48:.72).addScaledVector(b.side,sign*(inner?.80:.50)+sign*.18*r41Unit(b.id+s,5)).normalize();
   let length=(inner?Math.min(b.length*.78,.136):Math.min(b.length*.71,.184))*(inner?1:.98-.09*s)*(.82+.32*r41Unit(b.id+s,9));
   let halfWidth=Math.min(inner?.049:.050,b.length*(inner?.31:.25))*(inner?1:1-.045*s);
   const initialAcross=new THREE.Vector3(-direction.z,0,direction.x),rise=inner?.018+.031*r41Unit(b.id+s,10):-.005+.033*r41Unit(b.id+s,10),arch=(inner?.016:.010)*(.7+.6*r41Unit(b.id+s,25)),sections=inner?2:quality==='high'?3:2;
   const surfaces=inner?1:2,rollBase=(r41Unit(b.id+s,6)-.5)*1.15+(inner?(b.id%3-1)*.47:.30);
   let envelopeScale=1;
   for(let surface=0;surface<surfaces;surface++){
    const roll=rollBase+surface*(1.30+.24*r41Unit(b.id,26)),axis=initialAcross.clone().applyAxisAngle(direction,roll);
    for(const v of[0,1])for(const side of[-1,1]){
     const delta=direction.clone().multiplyScalar(length*v).addScaledVector(axis,side*halfWidth);
     for(const coordinate of['x','z'])if(Math.abs(delta[coordinate])>1e-12)envelopeScale=Math.min(envelopeScale,((delta[coordinate]>0?.434:-.434)-root[coordinate])/delta[coordinate]);
    }
   }
   length*=envelopeScale;halfWidth*=envelopeScale;
   for(let surface=0;surface<surfaces;surface++){
    const roll=rollBase+surface*(1.30+.24*r41Unit(b.id,26)),across=initialAcross.clone().applyAxisAngle(direction,roll);
    const position=[],colors=[],uv=[],index=[],rgb=[],points=[];
    for(let k=0;k<=sections;k++){
     const v=k/sections,cp=root.clone().addScaledVector(direction,length*v).add(new THREE.Vector3(0,rise*v+arch*Math.sin(Math.PI*v),0));points.push(cp.toArray());
     for(const side of[-1,1]){position.push(...cp.clone().addScaledVector(across,side*halfWidth).toArray());uv.push(side<0?0:1,v);leafValue(.68,.88+.11*r41Unit(b.id,13),.50,.38,form.leafBias,rgb);colors.push(...rgb);}
    }
    for(let k=0;k<sections;k++){const a=k*2;index.push(a,a+1,a+2,a+1,a+3,a+2);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(index);g.computeVertexNormals();tagWind(g,.28);const isDrop=dropped.has(b.id);(isDrop?drop:keep).push(g);
    proof.push({kind:'needle-spray',region:inner?'inner':'outer',branchlet:b.id*sprigs+s,surface,roll,envelopeScale,bough:b.id,tier:b.tier,drop:isDrop,t,segment:seg,segmentU:u,root:root.toArray(),points,halfWidth,length,triangles:sections*2});
   }
  }
 }
 // A narrow live leader continues the original bole to the retained model height.
 const leaderRoot=boleAt(form.boleTop),tip=leaderRoot.clone();tip.y=top;
 wood.push(limbGeometry([leaderRoot,tip],[form.boleTopR*BOLE_GIRTH,.001],sides,{capTip:true,frame:'transport'}));
 for(const g of wood)paintBark(g,form.barkMode);
 const woodGeometry=mergeGeometries(wood);tagWindRamp(woodGeometry,0,.13,form.top);woodGeometry.userData.barkColor=`#${new THREE.Color(form.bark).getHexString()}`;
 const leader=new THREE.BufferGeometry();leader.setAttribute('position',new THREE.Float32BufferAttribute([tip.x-.006,top-.05,tip.z,tip.x+.006,top-.05,tip.z,tip.x,top,tip.z],3));leader.setAttribute('uv',new THREE.Float32BufferAttribute([.43,.12,.57,.12,.5,1],2));const rgb=[];leafValue(.6,.99,.5,.38,form.leafBias,rgb);leader.setAttribute('color',new THREE.Float32BufferAttribute([...rgb,...rgb,...rgb],3));leader.setIndex([0,1,2]);leader.computeVertexNormals();tagWind(leader,.28);keep.push(leader);proof.push({kind:'leader',drop:false,triangles:1});
 const leaf=mergeGeometries(keep),leafDrop=mergeGeometries(drop);[...keep,...drop].forEach(g=>g.dispose());
 const boughProof=boughs.map(b=>({id:b.id,tier:b.tier,az:b.az,length:b.length,root:b.points[0].toArray(),points:b.points.map(p=>p.toArray()),radii:b.radii,triangles:b.triangles}));
 const meta={baseVertices,baseIndices,tiers,counts,boughs:boughProof,top,droppedBoughs:[...dropped],r152Architecture:{outerSprigs,innerSprigs:2,innerSurfacesPerBough:2,outerSurfacesPerBough:outerSprigs*2}};woodGeometry.userData.r147Norfolk=meta;leaf.userData.r147Norfolk={...meta,sprays:proof.filter(p=>!p.drop)};leafDrop.userData.r147Norfolk={...meta,sprays:proof.filter(p=>p.drop)};
 const local=spec=>new THREE.Matrix4().compose(new THREE.Vector3(spec.x,spec.y,spec.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),spec.yaw),new THREE.Vector3(spec.scale,spec.scale,spec.scale));
 function ground(g,heading){const m=makeDropGroundLocal(form,[],{heading}),v=new THREE.Vector3();m.elements[13]=0;let min=Infinity;for(let i=0;i<g.attributes.position.count;i++)min=Math.min(min,v.fromBufferAttribute(g.attributes.position,i).applyMatrix4(m).y);m.elements[13]=.045-min;return m;}
 return{wood:woodGeometry,leaf,leafDrop,shedLocal:local(form.shed),debrisLocal:local(form.debris),dropLocal:ground(leafDrop,dropHeading),keepLocal:ground(leaf,keepHeading),dropHeading,keepHeading,form};
}

export function buildSpeciesGeometry(formId, quality = 'high') {
  if (formId === 'plane' || formId === 'jacaranda') return buildConnectedBroadleaf(formId, quality);
  const form = SPECIES_FORM[formId];
  const tier = tierFor(quality);
  const street = STREET_TREE_VARIANTS.includes(formId);
  const wood = [];

  // --- bole, with a root flare and a slight bend ---------------------------------
  const boleRings = tier.boleRings + (street ? 2 : 0);
  const bolePts = [];
  for (let i = 0; i < boleRings; i += 1) {
    const t = i / (boleRings - 1);
    bolePts.push(new THREE.Vector3(
      form.boleLean[0] * t * t,
      form.boleTop * t,
      form.boleLean[1] * t * t,
    ));
  }
  const boleR = form.boleR * BOLE_GIRTH;
  const boleTopR = form.boleTopR * BOLE_GIRTH;
  const boleRadii = bolePts.map((_, i) => {
    const t = i / (boleRings - 1);
    return boleR + (boleTopR - boleR) * Math.pow(t, 0.62);
  });
  wood.push(limbGeometry(bolePts, boleRadii, tier.bole, {
    flare: form.boleFlare,
    flareLobes: 3,
    flarePhase: 0.4,
    ridge: 0.07,
    capTip: false,
  }));

  // Root buttress: the flare continues into three short spurs that meet the pit.
  for (let i = 0; i < 3; i += 1) {
    const az = 0.4 + (i / 3) * TAU;
    const spur = [
      new THREE.Vector3(0, 0.055, 0),
      new THREE.Vector3(Math.cos(az) * boleR * 1.75, 0.010, Math.sin(az) * boleR * 1.75),
    ];
    wood.push(limbGeometry(spur, [boleR * 0.72, boleR * 0.30], tier.twig, {
      ridge: 0.1, capTip: false,
    }));
  }

  if (formId === 'palm') return buildR145PalmCrown(wood, form, quality);
  if (formId === 'norfolk') return buildR147NorfolkCrown(wood, form, quality, bolePts);

  // --- primary limbs -------------------------------------------------------------
  const forkAt = new THREE.Vector3(
    form.boleLean[0] * 0.92,
    form.boleTop * 0.94,
    form.boleLean[1] * 0.92,
  );
  const limbLines = [];
  const saplingTerminals = [];
  for (const [li, spec] of form.limbs.slice(0, formId === 'norfolk' ? 0 : 3).entries()) {
    const cluster = form.clusters[li];
    const target = new THREE.Vector3(cluster.x, cluster.y, cluster.z);
    const mid = forkAt.clone().lerp(target, 0.52); mid.y -= 0.035;
    const pts = street ? [forkAt.clone(), mid, target] : limbCentreline(forkAt, spec, 3);
    limbLines.push(pts);
    wood.push(limbGeometry(
      pts,
      taperRadii(pts, spec.r * LIMB_GIRTH, spec.tipR * LIMB_GIRTH),
      tier.limb,
      { ridge: 0.05 },
    ));
  }

  // Rest crown is the authored species clusters — separate rounded masses
  // with sky between them. The tap-sway loop fused this to one cone/hat
  // (triangular lollipop). Physics is unchanged; only the leaf layout returns.
  // Stage 1 takes the one or two masses nearest the shed limb and lays them
  // on the grate — they leave the crown, they do not vanish.
  const shedP = new THREE.Vector3(form.shed.x, form.shed.y, form.shed.z);
  const ranked = form.clusters
    .map((c, i) => ({
      i,
      d: (c.x - shedP.x) ** 2 + (c.y - shedP.y) ** 2 + (c.z - shedP.z) ** 2,
    }))
    .sort((a, b) => a.d - b.d);
  const dropCount = form.clusters.length >= 6 ? 2 : 1;
  const dropIdx = new Set(ranked.slice(0, dropCount).map((row) => row.i));
  const fused = form.clusters.map((c, i) => ({ ...c, drop: dropIdx.has(i) }));

  // --- secondary ramification: one branch per fused mass ---------------------------
  const candidates = [];
  for (const line of limbLines) {
    for (let k = 1; k < line.length; k += 1) candidates.push(line[k]);
  }
  if (!candidates.length) candidates.push(forkAt);

  for (let ci = 0; ci < (street ? fused.length : Math.min(2, fused.length)); ci += 1) {
    const c = fused[ci];
    if (c.rim || (!street && c.drop)) continue;
    const target = new THREE.Vector3(c.x, c.y, c.z);
    let from = candidates[0];
    let bestD = Infinity;
    for (const p of candidates) {
      const d = p.distanceToSquared(target);
      if (d < bestD) {
        bestD = d;
        from = p;
      }
    }
    if (formId === 'norfolk') {
      // Two opposing woody tier arms meet the central leader under each leaf whorl.
      const az = ci * 2.4, dx = Math.cos(az) * c.r * 0.76, dz = Math.sin(az) * c.r * 0.76;
      for (const sign of [-1, 1]) wood.push(limbGeometry([
        new THREE.Vector3(0, c.y - 0.035, 0), new THREE.Vector3(dx * sign, c.y, dz * sign),
      ], [0.009, 0.004], tier.branch, {capTip: false}));
      continue;
    }
    const dir = target.clone().sub(from);
    const len = Math.max(0.001, dir.length());
    const end = street ? target : from.clone().addScaledVector(dir, 1 - (c.r * 0.55) / len);
    const mid = from.clone().lerp(end, 0.52);
    mid.y -= len * 0.08;
    const r0 = 0.016 * LIMB_GIRTH * (0.9 + c.r * 1.6);
    if(formId==='sapling')saplingTerminals[ci]={point:end.toArray(),radius:r0*.45,ringVertex:wood.reduce((n,g)=>n+g.attributes.position.count,0)+2*tier.branch,sides:tier.branch};
    wood.push(limbGeometry(
      [from.clone(), mid, end],
      [r0, r0 * 0.72, r0 * 0.45],
      tier.branch,
      { ridge: 0.05, capTip: false },
    ));
  }

  // --- deadwood stub: a short snapped limb held against the bole, torn tip ----------
  const stubAt = new THREE.Vector3(
    form.boleLean[0] * 0.8,
    form.stubFrom,
    form.boleLean[1] * 0.8,
  );
  const stubPts = limbCentreline(stubAt, form.stub, 2);
  const stubTipR = form.stub.tipR * LIMB_GIRTH;
  wood.push(limbGeometry(
    stubPts,
    taperRadii(stubPts, form.stub.r * LIMB_GIRTH, stubTipR),
    tier.twig,
    { ridge: 0.12, capTip: false },
  ));
  // Splintered break face. R1 capped this with a flat hexagon and the critic read it at 3x
  // as a blunt saw cut; the tip is now a ring of alternating long and short splinters.
  const stubTip = stubPts[stubPts.length - 1];
  const stubDir = stubTip.clone().sub(stubPts[stubPts.length - 2]).normalize();
  const splinter = [];
  const sAxisA = new THREE.Vector3(-stubDir.z, 0, stubDir.x).normalize();
  const sAxisB = new THREE.Vector3().crossVectors(stubDir, sAxisA).normalize();
  const spikes = Math.max(4, tier.twig + 2);
  for (let i = 0; i <= spikes; i += 1) {
    const a = (i / spikes) * TAU;
    const reach = i % 2 ? 0.030 : 0.011;
    splinter.push(new THREE.Vector3(
      stubTip.x + (Math.cos(a) * sAxisA.x + Math.sin(a) * sAxisB.x) * stubTipR * 0.92
        + stubDir.x * reach,
      stubTip.y + (Math.cos(a) * sAxisA.y + Math.sin(a) * sAxisB.y) * stubTipR * 0.92
        + stubDir.y * reach,
      stubTip.z + (Math.cos(a) * sAxisA.z + Math.sin(a) * sAxisB.z) * stubTipR * 0.92
        + stubDir.z * reach,
    ));
  }
  const splinterGeo = new THREE.BufferGeometry();
  const sPos = [stubTip.x, stubTip.y, stubTip.z];
  const sIdx = [];
  for (const p of splinter) sPos.push(p.x, p.y, p.z);
  for (let i = 0; i < spikes; i += 1) sIdx.push(0, i + 1, i + 2);
  splinterGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
  splinterGeo.setIndex(sIdx);
  splinterGeo.computeVertexNormals();
  // Raw wood inside a break is paler than the bark round it, and vertex colour multiplies
  // the per-instance bark tint, so this has to sit above 1 to read as exposed timber.
  {
    const n = splinterGeo.attributes.position.count;
    const sc = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      const j = 1.52 + (wob(i * 3.7, 9.1) - 0.5) * 0.34;
      sc[i * 3] = j * 1.06;
      sc[i * 3 + 1] = j * 0.97;
      sc[i * 3 + 2] = j * 0.80;
    }
    splinterGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  }
  wood.push(splinterGeo);

  for (const g of wood) {
    // The splinter face carries its own pale break colour and must not be over-painted.
    if (g === splinterGeo) continue;
    paintBark(g, form.barkMode);
  }
  // Stake and two green ties share the wood batch: no per-sapling draw call.
  if (formId === 'sapling') {
    const stake = new THREE.BoxGeometry(0.019, 0.31, 0.019);
    stake.translate(-0.065, 0.155, 0); paint(stake, '#cfac73', 0.12); wood.push(stake);
    for (const y of [0.21, 0.26]) {
      const tie = new THREE.BoxGeometry(0.084, 0.009, 0.026);
      tie.translate(-0.028, y, 0); paint(tie, '#416749'); wood.push(tie);
    }
  }
  const woodGeometry = mergeGeometries(wood);
  tagWindRamp(woodGeometry, 0, 0.13, form.top);
  const woodPainted = new THREE.Color(form.bark);
  woodGeometry.userData.barkColor = `#${woodPainted.getHexString()}`;
  if (formId === 'cypress') return buildR146CypressCrown(woodGeometry, form, quality, fused);

  // --- leaf masses ----------------------------------------------------------------
  //
  // Every mass is built individually rather than cloned from one unit hull: the blade
  // scatter is salted per mass, so no two masses in a crown share a fringe, and the crown
  // stops reading as a heap of the same chip.
  // r16: keep and drop are separate instances so stage 1 can lose a named flank.
  const blades = Math.max(18, Math.round(form.blades * tier.bladeScale * 1.45));
  const crownLow = fused.reduce((m, c) => Math.min(m, c.y), Infinity);
  const crownHigh = fused.reduce((m, c) => Math.max(m, c.y), -Infinity);
  const crownSpan = Math.max(0.001, crownHigh - crownLow);
  const keepLeaves = [];
  const dropLeaves = [];
  const saplingProof={keep:[],drop:[]};
  for (let ki = 0; ki < fused.length; ki += 1) {
    const c = fused[ki];
    const hk = (c.y - crownLow) / crownSpan;
    const tone = c.tone * (0.80 + hk * 0.34);
    const g = formId==='sapling' ? r149SaplingLeaves(c,quality,ki * 0.137 + form.top * 0.41,tone,form.leafBias,saplingTerminals[ki],ki) : street
      ? (formId === 'plane' || formId === 'jacaranda'
        ? streetBroadleafMass(c.r, c.flat, ki * 0.137 + form.top * 0.41, tone, form.leafBias, quality, formId)
        : streetLeafMass(c.r, c.flat, ki * 0.137 + form.top * 0.41, tone, form.leafBias, quality, formId))
      : leafMassGeometry(c.r, c.flat, blades, ki * 0.137 + form.top * 0.41, tone, form.leafBias, tier.core);
    if(formId==='sapling'){const key=c.drop?'drop':'keep',list=c.drop?dropLeaves:keepLeaves;saplingProof[key].push({...g.userData.r149Sapling,vertexBase:list.reduce((n,g)=>n+g.attributes.position.count,0)});}
    const positions = g.attributes.position, colors = g.attributes.color;
    const outward = Math.max(0.001, Math.hypot(c.x, c.z) * c.r);
    for (let vi = 0; vi < positions.count; vi += 1) {
      const inward = Math.max(0, -(positions.getX(vi) * c.x + positions.getZ(vi) * c.z) / outward);
      const ao = 1 - 0.40 * Math.min(1, inward);
      colors.setXYZ(vi, colors.getX(vi) * ao, colors.getY(vi) * ao, colors.getZ(vi) * ao);
    }
    if (c.sx || c.sz) g.scale(c.sx ?? 1, 1, c.sz ?? 1);
    if (c.yaw) g.rotateY(c.yaw);
    g.translate(c.x, c.y, c.z);
    tagWind(g, 0.28);
    (c.drop ? dropLeaves : keepLeaves).push(g);
  }
  const leafGeometry = mergeGeometries(keepLeaves);
  const leafDropGeometry = dropLeaves.length ? mergeGeometries(dropLeaves) : null;
  if(formId==='sapling'){leafGeometry.userData.r149Sapling={groups:saplingProof.keep};leafDropGeometry.userData.r149Sapling={groups:saplingProof.drop};}

  const shedLocal = new THREE.Matrix4().compose(
    new THREE.Vector3(form.shed.x, form.shed.y, form.shed.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), form.shed.yaw),
    new THREE.Vector3(form.shed.scale, form.shed.scale, form.shed.scale),
  );
  const debrisLocal = new THREE.Matrix4().compose(
    new THREE.Vector3(form.debris.x, form.debris.y, form.debris.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), form.debris.yaw),
    new THREE.Vector3(form.debris.scale, form.debris.scale, form.debris.scale),
  );

  const dropClusters = fused.filter((c) => c.drop);
  const keepClusters = fused.filter((c) => !c.drop);
  const dropHeading = canopyFallHeading(form, dropClusters);
  const keepHeading = dropHeading + Math.PI;
  const dropLocal = makeDropGroundLocal(form, dropClusters, { heading: dropHeading });
  const keepLocal = makeDropGroundLocal(form, keepClusters, { heading: keepHeading });
  return {
    wood: woodGeometry,
    leaf: leafGeometry,
    leafDrop: leafDropGeometry,
    shedLocal,
    debrisLocal,
    dropLocal,
    keepLocal,
    dropHeading,
    keepHeading,
    form,
  };
}

/**
 * Unit-tree pose that lays the shed flank on the grate.
 * Rotation is about the pit so the same masses that left the crown land beside it.
 */
export function canopyFallHeading(form, clusters = []) {
  if (!clusters.length) return Math.atan2(form.shed.z, form.shed.x);
  let cx = 0;
  let cz = 0;
  for (const c of clusters) {
    cx += c.x;
    cz += c.z;
  }
  cx /= clusters.length;
  cz /= clusters.length;
  if (Math.hypot(cx, cz) <= 1e-4) return Math.atan2(form.shed.z, form.shed.x);
  return Math.atan2(cz, cx);
}

function r41PartBounds(geometry) {
  const a = geometry.attributes.position.array;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < a.length; i += 3) {
    const x = a[i], y = a[i + 1], z = a[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return {
    cx: (minX + maxX) * 0.5, cy: (minY + maxY) * 0.5, cz: (minZ + maxZ) * 0.5,
    sx: maxX - minX, sy: maxY - minY, sz: maxZ - minZ,
  };
}

function finiteBlockCount(city, axis) {
  const direct = city?.[`blocks${axis}`];
  if (Number.isFinite(direct) && direct >= 0) return direct;
  const extent = city?.extent?.[axis === 'X' ? 'x' : 'z'];
  if (!Number.isFinite(extent)) return null;
  const blocks = (extent - ROAD) / PITCH;
  return Number.isFinite(blocks) && blocks >= 0 ? blocks : null;
}

function cacheBroadleafGround(city, pitPlan = null) {
  const blocksX = finiteBlockCount(city, 'X');
  const blocksZ = finiteBlockCount(city, 'Z');
  const platforms = [];
  for (const stop of city?.transit ?? []) {
    if (stop?.kind !== 'stop') continue;
    if (!Number.isFinite(stop.x) || !Number.isFinite(stop.z)) continue;
    platforms.push(Object.freeze({
      x: stop.x,
      z: stop.z,
      vertical: stop.rotation === 90,
      halfX: 6.2 / 2,
      halfZ: 2.6 / 2,
      top: PUBLIC_PIT_LEVELS.platform,
    }));
  }
  const record = {
    blocksX,
    blocksZ,
    platforms: Object.freeze(platforms),
    pitPlan: pitPlan ?? null,
  };
  return Object.freeze(record);
}

function onBoundedPaver(ground, x, z) {
  if (!ground || ground.blocksX == null || ground.blocksZ == null) return false;
  if (x < 0 || z < 0) return false;
  const ix = Math.floor(x / PITCH);
  const iz = Math.floor(z / PITCH);
  const lx = x - ix * PITCH;
  const lz = z - iz * PITCH;
  const inV = ix <= ground.blocksX && lx < ROAD;
  const inH = iz <= ground.blocksZ && lz < ROAD;
  if (inV === inH) return false;
  const local = inV ? lx : lz;
  const along = inV ? z : x;
  const alongBlocks = inV ? ground.blocksZ : ground.blocksX;
  if (along < ROAD) return false;
  const block = Math.floor((along - ROAD) / PITCH);
  if (block < 0 || block >= alongBlocks) return false;
  const segmentStart = block * PITCH + ROAD;
  if (along < segmentStart || along >= segmentStart + BLOCK) return false;
  const band = Math.min(
    Math.abs(local - CORRIDOR.footpathCentreLow),
    Math.abs(local - CORRIDOR.footpathCentreHigh),
  );
  return band <= BROADLEAF_PAVER_HALF;
}

function broadleafCorridorFallHeading(city, x, z, role) {
  if (role) return null;
  if (!Number.isFinite(x) || !Number.isFinite(z) || x < 0 || z < 0) return null;
  const reserve = city?.reserve?.centre;
  if (reserve && Number.isFinite(reserve.x) && Number.isFinite(reserve.z)
    && Math.hypot(x - reserve.x, z - reserve.z) < 28) return null;
  const blocksX = finiteBlockCount(city, 'X');
  const blocksZ = finiteBlockCount(city, 'Z');
  if (blocksX == null || blocksZ == null) return null;
  const ix = Math.floor(x / PITCH);
  const iz = Math.floor(z / PITCH);
  const lx = x - ix * PITCH;
  const lz = z - iz * PITCH;
  const inV = ix <= blocksX && lx < ROAD;
  const inH = iz <= blocksZ && lz < ROAD;
  if (inV === inH) return null;
  const corridors = inV ? city?.corridors?.vertical : city?.corridors?.horizontal;
  const corridorIndex = inV ? ix : iz;
  const corridorAxis = inV ? 'v' : 'h';
  const corridor = Array.isArray(corridors)
    ? corridors.find((item) => item
      && Number.isFinite(item.index)
      && item.index === corridorIndex
      && item.axis === corridorAxis)
    : null;
  if (!corridor) return null;
  const local = inV ? lx : lz;
  const along = inV ? z : x;
  const alongBlocks = inV ? blocksZ : blocksX;
  if (along < ROAD) return null;
  const block = Math.floor((along - ROAD) / PITCH);
  if (block < 0 || block >= alongBlocks) return null;
  const segmentStart = block * PITCH + ROAD;
  if (along < segmentStart || along >= segmentStart + BLOCK) return null;
  const lowD = Math.abs(local - CORRIDOR.footpathCentreLow);
  const highD = Math.abs(local - CORRIDOR.footpathCentreHigh);
  const foot = CORRIDOR.kerbLow - CORRIDOR.footpathCentreLow;
  const low = lowD < foot && lowD < highD;
  const high = highD < foot && highD < lowD;
  if (!low && !high) return null;
  if (inV) return low ? 0 : Math.PI;
  return low ? Math.PI / 2 : -Math.PI / 2;
}

function onStopPlatform(platform, x, z) {
  const dx = x - platform.x;
  const dz = z - platform.z;
  const localX = platform.vertical ? -dz : dx;
  const localZ = platform.vertical ? dx : dz;
  return Math.abs(localX) <= platform.halfX && Math.abs(localZ) <= platform.halfZ;
}

function broadleafSupportScan(array, elements, ground) {
  let minY = Infinity;
  let support = BROADLEAF_LAWN_Y;
  const platforms = ground?.platforms ?? [];
  for (let i = 0; i < array.length; i += 3) {
    const x = array[i], y = array[i + 1], z = array[i + 2];
    const wx = elements[0] * x + elements[4] * y + elements[8] * z + elements[12];
    const wy = elements[1] * x + elements[5] * y + elements[9] * z + elements[13];
    const wz = elements[2] * x + elements[6] * y + elements[10] * z + elements[14];
    if (wy < minY) minY = wy;
    const pitHit = ground?.pitPlan ? publicPitSupportAt(ground.pitPlan, wx, wz) : null;
    if (pitHit?.ownership === 'soil' || pitHit?.ownership === 'rim-grate') {
      support = Math.max(support, pitHit.level);
    } else if (onBoundedPaver(ground, wx, wz)) {
      support = Math.max(support, BROADLEAF_PAVER_TOP);
    }
    for (let p = 0; p < platforms.length; p += 1) {
      if (onStopPlatform(platforms[p], wx, wz)) support = Math.max(support, platforms[p].top);
    }
  }
  return { minY, support };
}

function broadleafDetachedMatrix(geometry, x, z, yaw, heading, ground) {
  const b = geometry.userData.r41PartBounds;
  const sy = b.sy > 1e-5 ? BROADLEAF_PILE_HEIGHT / b.sy : 1;
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  const span = Math.max(c * b.sx + s * b.sz, s * b.sx + c * b.sz);
  const sh = span > 1e-5 ? Math.min(1, BROADLEAF_PILE_FOOT / span) : 1;
  _pileQuat.setFromAxisAngle(_pileUp, yaw);
  _pileOffset.set(Math.cos(heading), 0, Math.sin(heading)).applyQuaternion(_pileQuat);
  _pileLocal.makeTranslation(-b.cx, -b.cy, -b.cz);
  _pileWorld.compose(
    _pilePos.set(x + _pileOffset.x * BROADLEAF_PILE_OFFSET, 0, z + _pileOffset.z * BROADLEAF_PILE_OFFSET),
    _pileQuat,
    _pileScale.set(sh, sy, sh),
  ).multiply(_pileLocal);
  const scan = broadleafSupportScan(geometry.attributes.position.array, _pileWorld.elements, ground);
  _pileWorld.elements[13] += scan.support - scan.minY;
  return _pileWorld.clone();
}

export function makeDropGroundLocal(form, drops = [], { heading: headingOverride } = {}) {
  const list = drops.length ? drops : [{ x: form.shed.x, y: form.shed.y, z: form.shed.z, r: 0.16 }];
  let cx = 0;
  let cz = 0;
  let r = 0.12;
  for (const c of list) {
    cx += c.x;
    cz += c.z;
    r = Math.max(r, c.r ?? 0.12);
  }
  const n = list.length;
  cx /= n;
  cz /= n;
  const heading = Number.isFinite(headingOverride)
    ? headingOverride
    : (Math.hypot(cx, cz) > 1e-4
      ? Math.atan2(cz, cx)
      : Math.atan2(form.shed.z, form.shed.x));
  const axis = new THREE.Vector3(Math.sin(heading), 0, -Math.cos(heading));
  const quat = new THREE.Quaternion().setFromAxisAngle(axis, DROP_FALL_ANGLE);
  // Masses already sit on the shed side, so a pit-pivot puts them below the grate
  // unless we lift by the lowest point after the tip.
  const scratch = new THREE.Vector3();
  let minY = Infinity;
  for (const c of list) {
    scratch.set(c.x, c.y, c.z).applyQuaternion(quat);
    minY = Math.min(minY, scratch.y - (c.r ?? r) * (c.flat ?? 1) * 0.55);
  }
  const lift = 0.045 - Math.min(0, minY);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(0, lift, 0),
    quat,
    new THREE.Vector3(1, 1, 1),
  );
}

/**
 * The limb that comes down. Two leaf masses and the twig that carries them, authored
 * about its own attachment point so it can be scaled back on from nothing during repair.
 */
function buildShedGeometry(quality = 'high') {
  const tier = tierFor(quality);
  const parts = [];
  const masses = [
    { x: -0.09, y: 0.02, z: 0.0, r: 0.19, flat: 0.92, tone: 1.02 },
    { x: 0.11, y: 0.09, z: 0.06, r: 0.14, flat: 0.94, tone: 0.82 },
    { x: 0.02, y: -0.06, z: -0.09, r: 0.11, flat: 0.96, tone: 0.66 },
  ];
  for (let i = 0; i < masses.length; i += 1) {
    const m = masses[i];
    const g = leafMassGeometry(
      m.r, m.flat, Math.max(10, Math.round(26 * tier.bladeScale)),
      i * 0.31 + 0.77, m.tone, [1, 1, 1], tier.core,
    );
    g.translate(m.x, m.y, m.z);
    tagWind(g, 0.38);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

/**
 * What is on the ground once a limb has come down: the snapped limb, its leaf mass
 * flattened against the kerb, and a scatter of leaf litter. Wood and leaf colour both
 * ride in the vertex colour so the whole thing is one instanced draw.
 */
function buildDebrisGeometry(quality = 'high') {
  const tier = tierFor(quality);
  const parts = [];
  const BRANCH = '#6a563e';
  const BREAK = '#c3ae86';

  const limbPts = [
    new THREE.Vector3(-0.20, 0.030, -0.05),
    new THREE.Vector3(0.02, 0.038, 0.02),
    new THREE.Vector3(0.24, 0.030, 0.10),
  ];
  const limb = limbGeometry(limbPts, [0.036, 0.028, 0.016], tier.twig, { ridge: 0.1 });
  paint(limb, BRANCH, 0.12);
  tagWind(limb, 0);
  parts.push(limb);

  // Pale splintered break face at the thick end.
  const breakFace = new THREE.CylinderGeometry(0.036, 0.030, 0.02, tier.twig + 2);
  breakFace.rotateZ(Math.PI / 2);
  breakFace.translate(-0.21, 0.030, -0.05);
  paint(breakFace, BREAK, 0.1);
  tagWind(breakFace, 0);
  parts.push(breakFace);

  const fallen = [
    { x: 0.28, y: 0.09, z: 0.12, r: 0.17, flat: 0.52, tone: 0.86 },
    { x: 0.10, y: 0.07, z: -0.14, r: 0.11, flat: 0.50, tone: 0.74 },
  ];
  for (let i = 0; i < fallen.length; i += 1) {
    const m = fallen[i];
    const g = leafMassGeometry(
      m.r, m.flat, Math.max(8, Math.round(22 * tier.bladeScale)),
      i * 0.53 + 2.19, m.tone, [0.94, 0.92, 0.72], tier.core,
    );
    g.translate(m.x, m.y, m.z);
    tagWind(g, 0.12);
    parts.push(g);
  }

  // Leaf litter thrown clear of the limb.
  for (let i = 0; i < 7; i += 1) {
    const a = wob(i * 3.7, 1.3) * TAU;
    const r = 0.16 + wob(i * 5.1, 2.9) * 0.30;
    const chip = new THREE.PlaneGeometry(0.055, 0.038);
    chip.rotateX(-Math.PI / 2);
    chip.rotateY(a * 2.1);
    chip.translate(Math.cos(a) * r, 0.006, Math.sin(a) * r);
    paint(chip, i % 3 === 0 ? '#7d7434' : '#5f6b2c', 0.16);
    tagWind(chip, 0);
    parts.push(chip);
  }
  return mergeGeometries(parts);
}

/**
 * Kerbside tree pit: stone surround, recessed bed, cast-iron grate with proud ribs, a
 * grime halo on the paving and a little leaf litter. Authored in world metres.
 */
function pavedPitGeometry(quality = 'high') {
  const tier = tierFor(quality);
  const seg = tier.pit;
  const parts = [];
  // R2, critic D6. Measured off the plates: our footpath sat at L 0.662, our pit surround
  // at L 0.574 but reading *brighter* than the paving, and the grate was dark-on-dark
  // against an L 0.374 fill. The reference puts the grate at L 0.154 against paving at
  // L 0.750 — a 0.60 separation, the strongest value contrast in the whole plate — and it
  // is square, it fills its paving unit, and the joints run to it. So: the grate is now
  // square and near-black, the light raised surround is gone, and the surround is a ring
  // of jointed bluestone slabs a stop *below* the footpath instead of a stop above it.
  // The reference keeps the pit's paving at footpath value and lets the grate carry the
  // whole contrast, so the slabs sit just under our measured footpath L 0.662 rather than
  // above it, and the joints and the grate are the dark things at the tree base.
  const SLAB = '#9d988d';
  const JOINT = '#3a3733';
  const IRON = '#3a332c';
  const SOIL = '#2a2218';
  const RUST = '#6d3a1c';

  const half = 0.92;
  const bar = 0.22;
  const hgt = 0.016;      // flush, not a kerb round the tree
  const inner = half - bar;

  // --- jointed slab surround -------------------------------------------------------
  // Eight slabs with dark joints between them, so paving joints run to the grate. The
  // footpath itself belongs to another lane, so this is the only paving field the pit can
  // bring with it; it is deliberately laid out as slabs and not as one plate.
  const slabs = [
    [-0.69, half - bar / 2, 0.44, bar], [-0.23, half - bar / 2, 0.44, bar],
    [0.23, half - bar / 2, 0.44, bar], [0.69, half - bar / 2, 0.44, bar],
    [-0.69, -(half - bar / 2), 0.44, bar], [-0.23, -(half - bar / 2), 0.44, bar],
    [0.23, -(half - bar / 2), 0.44, bar], [0.69, -(half - bar / 2), 0.44, bar],
    [half - bar / 2, 0.35, bar, 0.68], [half - bar / 2, -0.35, bar, 0.68],
    [-(half - bar / 2), 0.35, bar, 0.68], [-(half - bar / 2), -0.35, bar, 0.68],
  ];
  // Joint bed: one dark plate under the slabs, so the gaps between them read as joints.
  const bedPlate = new THREE.BoxGeometry(half * 2, 0.008, half * 2);
  bedPlate.translate(0, 0.004, 0);
  paint(bedPlate, JOINT, 0.06);
  parts.push(bedPlate);
  for (let i = 0; i < slabs.length; i += 1) {
    const [dx, dz, sx, sz] = slabs[i];
    const g = new THREE.BoxGeometry(sx - 0.028, hgt, sz - 0.028);
    g.translate(dx, 0.008 + hgt / 2, dz);
    // Tonal slab-to-slab variation, and a wet stain banked on one flank of the pit.
    const wet = dx > 0.2 ? 0.80 : 1.0;
    const k = (0.90 + wob(i * 5.3, 2.7) * 0.20) * wet;
    const c = new THREE.Color(SLAB).multiplyScalar(k);
    paint(g, `#${c.getHexString()}`, 0.05);
    parts.push(g);
  }

  // Soil bed, seen through the hole in the middle of the grate. Silt, not clean earth.
  const bed = new THREE.BoxGeometry(inner * 2, 0.02, inner * 2);
  bed.translate(0, 0.014, 0);
  paint(bed, SOIL, 0.22);
  parts.push(bed);

  // --- cast-iron grate --------------------------------------------------------------
  // A square plate with a round hole for the root flare, filling the pit rather than a
  // narrow annulus lost inside it. Built as a radial fan with its own vertices per sector
  // so the spokes are crisp: an R1 lesson repeated here is that a value pattern written
  // across four shared vertices interpolates into a smear, and the spokes have to be
  // carried by the mesh rather than asserted by a painter.
  const grate = squareGrateGeometry(inner, 0.28, 24, IRON);
  grate.translate(0, 0.026, 0);
  parts.push(grate);

  // Inner collar round the hole, so the plate has a thickness at the flare.
  const collar = new THREE.CylinderGeometry(0.28, 0.28, 0.030, Math.min(10, seg), 1, true);
  collar.translate(0, 0.016, 0);
  paint(collar, IRON, 0.1);
  parts.push(collar);

  // Proud ribs across the plate so the grate has relief and catches the key light,
  // rather than being a pattern painted on a flat disc.
  for (let i = 0; i < 2; i += 1) {
    const a = (i / 2) * Math.PI + 0.25;
    for (const side of [-1, 1]) {
      const rib = new THREE.BoxGeometry(inner * 0.62, 0.014, 0.042);
      rib.translate(side * inner * 0.60, 0.037, 0);
      rib.rotateY(a);
      paint(rib, IRON, 0.18);
      parts.push(rib);
    }
  }
  // Rust bloom at the four corner fixings — directed wear, where water sits on iron.
  for (const [fx, fz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const boss = new THREE.CylinderGeometry(0.055, 0.062, 0.020, 4);
    boss.translate(fx * inner * 0.80, 0.034, fz * inner * 0.80);
    paint(boss, RUST, 0.22);
    parts.push(boss);
    const bloom = new THREE.PlaneGeometry(0.19, 0.19);
    bloom.rotateX(-Math.PI / 2);
    bloom.translate(fx * inner * 0.80, 0.029, fz * inner * 0.80);
    paint(bloom, '#4a2c17', 0.2);
    parts.push(bloom);
  }

  // Grime halo, directed rather than uniform: water sheets off one flank of the grate and
  // stains the paving there. §2.7 scores uniform dirt at zero, so this is a crescent.
  for (let i = 0; i < 5; i += 1) {
    const a = -0.5 + (i / 5) * 1.9;
    const stain = new THREE.PlaneGeometry(0.30, 0.42);
    stain.rotateX(-Math.PI / 2);
    stain.rotateY(a);
    stain.translate(Math.cos(a) * 1.02, 0.010, Math.sin(a) * 1.02);
    paint(stain, '#4f4b44', 0.16);
    parts.push(stain);
  }

  // Leaf litter and grit banked on the downwind flank, not scattered evenly round.
  for (let i = 0; i < 7; i += 1) {
    const a = 0.35 + wob(i * 7.3, 4.1) * 1.7;
    const r = 0.70 + wob(i * 2.7, 8.3) * 0.46;
    const chip = new THREE.PlaneGeometry(0.075, 0.05);
    chip.rotateX(-Math.PI / 2);
    chip.rotateY(a * 1.7);
    chip.translate(Math.cos(a) * r, 0.036, Math.sin(a) * r);
    paint(chip, i % 3 === 0 ? '#8a7c38' : '#5c5528', 0.2);
    parts.push(chip);
  }

  const merged = mergeGeometries(parts);
  tagWind(merged, 0);
  return merged;
}

/** Lawn and shore planting: a mulch ring, a mown collar, litter. */
function lawnPitGeometry(quality = 'high') {
  const tier = tierFor(quality);
  const seg = Math.max(8, tier.pit - 2);
  const parts = [];
  const MULCH = '#3a2c1e';
  const COLLAR = '#4d6b38';

  const mound = new THREE.CylinderGeometry(0.50, 0.74, 0.055, seg);
  mound.translate(0, 0.026, 0);
  paint(mound, MULCH, 0.2);
  parts.push(mound);

  const collar = new THREE.RingGeometry(0.74, 1.04, seg, 1);
  collar.rotateX(-Math.PI / 2);
  collar.translate(0, 0.008, 0);
  paint(collar, COLLAR, 0.15);
  parts.push(collar);

  for (let i = 0; i < 6; i += 1) {
    const a = wob(i * 4.9, 6.7) * TAU;
    const r = 0.44 + wob(i * 3.3, 1.9) * 0.44;
    const chip = new THREE.PlaneGeometry(0.062, 0.04);
    chip.rotateX(-Math.PI / 2);
    chip.rotateY(a * 2.3);
    chip.translate(Math.cos(a) * r, 0.018, Math.sin(a) * r);
    paint(chip, i % 3 === 0 ? '#7d7434' : '#4f5f28', 0.18);
    parts.push(chip);
  }

  const merged = mergeGeometries(parts);
  tagWind(merged, 0);
  return merged;
}

/**
 * Feathered multiply contact copied from the ring-tree contract: centre, 0.6-radius
 * shoulder, pure-white rim. The rim is a no-op, so the six-sided boundary cannot read
 * as a planted disc; its far half stretches into the fixed key-light shadow direction.
 */
const CONTACT_SUN = Object.freeze([0.433, -0.901]);

function treeContactGeometry() {
  const positions = [0, 0, 0];
  const normals = [0, 1, 0];
  const colors = [0.88, 0.88, 0.89];
  const indices = [];
  const seg = 6;
  const mid = 1 - (1 - 0.88) * 0.45;
  for (let ring = 0; ring < 2; ring += 1) {
    const ringScale = ring === 0 ? 0.60 : 1;
    for (let i = 0; i < seg; i += 1) {
      const a = (i / seg) * TAU;
      const sx = Math.sin(a);
      const sz = Math.cos(a);
      const away = Math.max(0, -(sx * CONTACT_SUN[0] + sz * CONTACT_SUN[1]));
      const radius = ringScale * (ring === 0 ? 1 : 1 + away * 0.24);
      positions.push(sx * radius, 0, sz * radius);
      normals.push(0, 1, 0);
      const value = ring === 0 ? mid : 1;
      colors.push(value, value, ring === 0 ? Math.min(1, value * 1.01) : 1);
    }
  }
  const inner = 1;
  const outer = 1 + seg;
  for (let i = 0; i < seg; i += 1) {
    const next = (i + 1) % seg;
    indices.push(0, inner + i, inner + next);
    indices.push(inner + i, outer + i, outer + next);
    indices.push(inner + i, outer + next, inner + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.userData.foliageContact = { centre: 0.88, shoulderRadius: 0.60, rim: 1 };
  return geometry;
}

function treeContactMaterial() {
  const material = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    vertexColors: true,
    transparent: true,
    opacity: 1,
    premultipliedAlpha: true,
    blending: THREE.MultiplyBlending,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  material.userData.natureFoliageContact = true;
  return material;
}

/**
 * The damaged tree's own voxel kit, in world metres about the bole.
 *
 * `componentsFor` in mischief.js prefers an attached kit for `kind === 'tree'`, and until
 * V3.31 R2 it did not, so a damaged tree fell back to `treeComponents` — a trunk box and
 * one horizontal oval crown, floored at 2.8 m. That is what the R1 critic found on plate as
 * "a translucent glass crate round the tree" and "a 2 m untextured grey cube intersecting
 * the kerb", and no work inside this file could reach it.
 *
 * Two things the critic asked for are structural here rather than incidental:
 *
 * - **The crown loses part of itself and keeps the rest.** `_appendTarget` peels the kit
 *   from index `floor(n * 0.45)` upward at stage 2, so the masses are ordered low to high
 *   and the four or five lowest stay on the tree while the upper crown comes down. Both R1
 *   anchors were all-or-nothing in opposite directions.
 * - **Debris inherits bark and leaf colour.** Every piece carries this instance's own leaf
 *   colour, biased by the mass's authored tone, and the snapped limb carries its bark.
 *   R1's debris was the pool default and read as broken polystyrene and concrete.
 *
 * The kit is the crown only and is not drawn. Stages 1–2 keep the live bole up
 * and shed canopy; stage 3 falls the live bole and remaining crown about the pit.
 */
function damagedCrownKit(form, sx, sy, sz, leafColor, barkColor, season = 'green') {
  const ordered = season === 'bare'
    ? []
    : [...form.clusters].sort((a, b) => a.y - b.y);
  const kit = [];
  for (const c of ordered) {
    const tone = THREE.MathUtils.clamp(0.58 + c.tone * 0.46, 0.55, 1.30);
    kit.push({
      position: new THREE.Vector3(c.x * sx, c.y * sy, c.z * sz),
      scale: new THREE.Vector3(
        c.r * (c.sx ?? 1) * 1.76 * sx,
        c.r * c.flat * 1.76 * sy,
        c.r * (c.sz ?? 1) * 1.76 * sz,
      ),
      colour: leafColor.clone().multiplyScalar(tone),
      rotation: null,
    });
  }
  // The snapped limb, last so it always leaves with the upper crown.
  kit.push({
    position: new THREE.Vector3(form.shed.x * sx * 0.78, form.shed.y * sy, form.shed.z * sz * 0.78),
    scale: new THREE.Vector3(0.44 * sx, 0.085 * sy, 0.085 * sz),
    colour: barkColor.clone(),
    rotation: new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0), form.shed.yaw,
    ),
  });
  return kit;
}

function windMaterial(baseColor, { quality = 'high', reducedMotion = false } = {}) {
  const material = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: 0.82,
    metalness: 0.02,
    flatShading: false,
  });
  material.userData.natureFoliage = true;
  material.userData.envIntensityBase = 0.18;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = { value: 0 };
    shader.uniforms.uWindAmp = { value: reducedMotion ? 0 : 1 };
    material.userData.windUniforms = shader.uniforms;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        attribute float aWind;
        attribute float aTap;
        uniform float uWindTime;
        uniform float uWindAmp;
        `,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        {
          float w = aWind * uWindAmp;
          float t = uWindTime;
          float tap = aTap;
          // Two frequencies: broad sway + higher-frequency flutter on outer canopy.
          // r7: any per-vertex offset unbinds the four masses (leaf-bomb).
          // Rest rustle and tap rock both live on the instance matrix only.
          transformed.x += 0.0 * w * tap;
          transformed.z += 0.0 * w * t;
        }
        `,
      );
  };
  // Ensure three recompiles when we toggle reduced motion amp via needsUpdate.
  material.customProgramCacheKey = () => 'nature-foliage-wind-v6';
  return material;
}

function tintColor(hex, districtId) {
  const color = new THREE.Color(hex);
  const tint = DISTRICT_TINT[districtId];
  if (!tint) return color;
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(
    (hsl.h + tint.h + 1) % 1,
    THREE.MathUtils.clamp(hsl.s * tint.s, 0, 1),
    THREE.MathUtils.clamp(hsl.l * tint.l, 0, 1),
  );
  return color;
}

export function seasonForPlacement(speciesId, salt) {
  const roll = unitFromKey(`t12-season:${speciesId}:${salt}`);
  if (roll < 0.33) return 'autumn';
  if (roll < 0.64) return 'winter';
  return 'green';
}

function nearestDistrictId(city, x, z) {
  const parcels = city.parcels;
  if (!parcels) return null;
  let best = null;
  let bestD = Infinity;
  const order = city.order ?? Object.keys(parcels);
  // Cap the search so a large city does not O(n) every tree twice.
  const step = Math.max(1, Math.floor(order.length / 80));
  for (let i = 0; i < order.length; i += step) {
    const p = parcels[order[i]];
    if (!p?.centre) continue;
    const dx = p.centre.x - x;
    const dz = p.centre.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = p.districtId ?? null;
    }
  }
  return best;
}

const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Instanced foliage layer. Hides board `trees:*` groups so wind silhouettes own the read.
 */
export class FoliageLayer {
  /**
   * @param {THREE.Scene|THREE.Object3D} parent
   * @param {object} city
   * @param {{
   *   quality?: string,
   *   reducedMotion?: boolean,
   *   boardRoot?: THREE.Object3D|null,
   * }} [options]
   */
  constructor(parent, city, {
    quality = 'high',
    reducedMotion = false,
    boardRoot = null,
    publicTreePits = null,
  } = {}) {
    this.parent = parent;
    this.city = city;
    this.publicTreePits = publicTreePits ?? boardRoot?.userData?.publicTreePits ?? null;
    this._broadleafGround = cacheBroadleafGround(city, this.publicTreePits);
    this.quality = quality;
    this.reducedMotion = reducedMotion;
    this.root = new THREE.Group();
    this.root.name = 'nature:foliage';
    this._elapsed = 0;
    this._hidden = [];
    this._meshes = [];
    this._swayMat = new THREE.Matrix4();
    this._swayEuler = new THREE.Euler(0, 0, 0, 'XZY');
    this._swayQuat = new THREE.Quaternion();
    this._swayPos = new THREE.Vector3();
    this._treeMat = new THREE.Matrix4();
    this._fallAxis = new THREE.Vector3();
    this._fallQuat = new THREE.Quaternion();
    this._materials = [];
    this._geometries = [];
    this._entries = new Map();
    this._regrowing = [];
    this._dropping = [];
    this._shedding = [];
    this._dropPosA = new THREE.Vector3();
    this._dropPosB = new THREE.Vector3();
    this._dropQuatA = new THREE.Quaternion();
    this._dropQuatB = new THREE.Quaternion();
    this._dropSclA = new THREE.Vector3();
    this._dropSclB = new THREE.Vector3();
    this._dropMat = new THREE.Matrix4();
    this._debrisOwners = new Array(DEBRIS_CAPACITY).fill(null);
    this._debrisCursor = 0;

    this._hideBoardTrees(boardRoot);

    /** @type {Array<object>} */
    const placements = [];
    const seed = city.seed ?? 0;

    const coreTrees = boardRoot?.userData?.foliagePlacements ?? planBoardFoliage(city);
    const vergeTrees = planResidentialVergeInfill(city, coreTrees);
    const cityTrees = [...coreTrees, ...vergeTrees];
    const publicByIndex = new Map();
    for (const pit of this.publicTreePits?.pits ?? []) publicByIndex.set(pit.index, pit);
    this.root.userData.r7Planting = { core: coreTrees.length, infill: vergeTrees.length, cellMetres: 16 };
    for (const [index, tree] of cityTrees.entries()) {
      // The two salts below are consumed in their original order so an existing board
      // keeps the tree sizes and rotations it already had.
      const age = unitFromKey(`tree-age:${seed}:${index}`);
      const yawJ = (unitFromKey(`tree-yaw:${seed}:${index}`) - 0.5) * 1.2;
      const formClass = spatialFormClass(tree.x, tree.z);
      const sizeClass = Math.floor(unitFromKey(`t12-size:${seed}:${index}:${age}`) * 4) % 4;
      const speciesId = speciesForModel(tree.model);
      const salt = `${seed}:t${index}`;
      placements.push({
        speciesId,
        x: tree.x,
        z: tree.z,
        r7Verge: Boolean(tree.r7Verge),
        yaw: ((tree.rotation ?? 0) * Math.PI) / 180 + yawJ + formClass * 0.37,
        scale: FOLIAGE_SIZE_CLASS[sizeClass],
        sizeClass,
        season: seasonForPlacement(speciesId, salt),
        formClass,
        districtId: nearestDistrictId(city, tree.x, tree.z),
        // A tree knows where it stands: footpath planting gets a paved pit with a grate,
        // reserve and pocket-park planting gets a mulch ring in the lawn.
        pit: tree.role ? 'lawn' : (publicByIndex.has(index) ? 'public' : 'paved'),
        streetType: tree.streetType ?? 'local',
        role: tree.role ?? null,
        salt: `${seed}:t${index}`,
        stopClear: tree.stopClear === true,
      });
    }
    this._seedShoreShrubs(city, placements);

    for (let i = 0; i < placements.length; i += 1) {
      const a = placements[i];
      if (a.sizeClass == null) a.sizeClass = 1;
      if (!a.season) a.season = seasonForPlacement(a.speciesId, a.salt ?? `${i}`);
      for (let j = 0; j < i; j += 1) {
        const b = placements[j];
        if (Math.hypot(a.x - b.x, a.z - b.z) >= 20) continue;
        if (a.speciesId === b.speciesId && a.sizeClass === b.sizeClass && a.season === b.season) {
          a.season = a.season === 'green' ? 'autumn' : a.season === 'autumn' ? 'winter' : 'green';
          if (a.speciesId === b.speciesId && a.sizeClass === b.sizeClass && a.season === b.season) {
            a.sizeClass = (a.sizeClass + 1) % 4;
            a.scale = FOLIAGE_SIZE_CLASS[a.sizeClass];
          }
        }
      }
    }

    mixStreetSpecies(placements, seed);
    // W7-A: one crown geometry per species, measured by the fit pass and then built into its batch.
    const builtCache = new Map();
    const builtFor = (id) => {
      if (!builtCache.has(id)) builtCache.set(id, buildSpeciesGeometry(id, quality));
      return builtCache.get(id);
    };
    this.root.userData.crownFit = fitCrowns(placements, city, builtFor, quality);
    // Mischief seeds motion from its key: preserve the original per-species index
    // before stop exclusions compact the render buffers (P10a A1, ruling 22).
    const mischiefCounts = new Map();
    for (const p of placements) {
      p.mischiefIndex = mischiefCounts.get(p.speciesId) ?? 0;
      mischiefCounts.set(p.speciesId, p.mischiefIndex + 1);
    }
    // Keep the full roster through season, species and fit passes; only instances disappear.
    for (let i = placements.length - 1; i >= 0; i -= 1) {
      if (placements[i].stopClear) placements.splice(i, 1);
    }
    const batches = new Map();
    for (const id of SPECIES_ORDER) batches.set(id, []);
    for (const p of placements) {
      const list = batches.get(p.speciesId) ?? batches.get('plane');
      list.push(p);
    }

    /** @type {Map<string, THREE.InstancedMesh>} */
    this._speciesMeshes = new Map();
    /** @type {Array<object>} */
    this.mischiefTreeRecords = [];

    const total = placements.length;
    const pavedCount = placements.filter((p) => p.pit === 'paved').length;
    const publicCount = placements.filter((p) => p.pit === 'public').length;
    const lawnCount = placements.filter((p) => p.pit === 'lawn').length;

    // --- shared batches: shed limb, ground debris, two pit treatments ---------------
    const leafMat = windMaterial(new THREE.Color('#ffffff'), { quality, reducedMotion });
    leafMat.vertexColors = true;
    leafMat.map = leafClusterAtlas();
    leafMat.alphaTest = 0.45;
    leafMat.roughness = 0.94;
    leafMat.envMapIntensity = 0.22;
    leafMat.userData.envIntensityBase = 0.22;
    // The canopy is leaf cards from R2 onward, and a card is only half a surface: without
    // this, every blade whose back is to the camera disappears and the crown reads as a
    // handful of floating chips.
    leafMat.side = THREE.DoubleSide;
    // ...but the shadow pass does not need both faces of a card. Without this, three uses
    // DoubleSide for the depth pass too and the canopy costs twice what it needs to in the
    // pass that V3.31 R2 just switched it into.
    leafMat.shadowSide = THREE.FrontSide;
    const barkMat = windMaterial(new THREE.Color('#ffffff'), { quality, reducedMotion });
    barkMat.vertexColors = true;
    barkMat.roughness = 0.96;
    barkMat.userData.envIntensityBase = 0.16;
    const streetBarkMat = windMaterial(new THREE.Color('#ffffff'), {quality, reducedMotion});
    streetBarkMat.vertexColors = true; streetBarkMat.roughness = 0.96;
    streetBarkMat.userData.envIntensityBase = 0.16;
    const compileBarkWind = streetBarkMat.onBeforeCompile;
    streetBarkMat.onBeforeCompile = (shader) => {
      compileBarkWind(shader);
      shader.vertexShader = 'varying vec3 vI4Bark;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvI4Bark = position;');
      shader.fragmentShader = 'varying vec3 vI4Bark;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        float angle = atan(vI4Bark.z, vI4Bark.x);
        float ribbon = sin(angle * 13.0 + sin(vI4Bark.y * 8.0) * 1.8);
        float fissure = smoothstep(0.68, 0.96, ribbon);
        float barkPatch = sin(angle * 5.0 + floor(vI4Bark.y * 18.0) * 2.4);
        float grain = 0.88 + 0.20 * smoothstep(-0.2, 0.7, barkPatch) - 0.34 * fissure;
        diffuseColor.rgb *= grain;
      `);
    };
    streetBarkMat.customProgramCacheKey = () => 'nature-i4-bark-v1';
    const groundMat = windMaterial(new THREE.Color('#ffffff'), { quality, reducedMotion });
    groundMat.vertexColors = true;
    groundMat.roughness = 0.93;
    groundMat.userData.envIntensityBase = 0.14;
    const debrisMat = windMaterial(new THREE.Color('#ffffff'), { quality, reducedMotion });
    debrisMat.vertexColors = true;
    debrisMat.roughness = 0.92;
    debrisMat.userData.envIntensityBase = 0.16;
    const contactMat = treeContactMaterial();
    const streetLeafMat = windMaterial(new THREE.Color('#ffffff'), {quality, reducedMotion});
    streetLeafMat.vertexColors = true; streetLeafMat.map = streetLeafAtlas();
    streetLeafMat.alphaTest = 0.40; streetLeafMat.roughness = 0.94;
    streetLeafMat.side = THREE.DoubleSide; streetLeafMat.shadowSide = THREE.FrontSide;
    streetLeafMat.envMapIntensity = 0.22; streetLeafMat.userData.envIntensityBase = 0.22;
    const cypressMat = windMaterial(new THREE.Color('#ffffff'), {quality, reducedMotion});
    cypressMat.vertexColors=true;cypressMat.map=cypressBranchAtlas();cypressMat.alphaTest=.40;cypressMat.roughness=.94;
    cypressMat.side=THREE.DoubleSide;cypressMat.shadowSide=THREE.FrontSide;cypressMat.envMapIntensity=.22;cypressMat.userData.envIntensityBase=.22;
    cypressMat.name='r146b-cypress-branch-fans';cypressMat.customProgramCacheKey=()=> 'nature-foliage-wind-v6:r146b-cypress';
    this._materials.push(cypressMat);this._cypressAtlas=cypressMat.map;
    const norfolkMat = windMaterial(new THREE.Color('#ffffff'), {quality, reducedMotion});
    norfolkMat.vertexColors=true;norfolkMat.map=norfolkNeedleAtlas();norfolkMat.alphaTest=.40;norfolkMat.roughness=.94;
    norfolkMat.side=THREE.DoubleSide;norfolkMat.shadowSide=THREE.FrontSide;norfolkMat.envMapIntensity=.22;norfolkMat.userData.envIntensityBase=.22;
    norfolkMat.name='r147c-norfolk-comb-sprays';norfolkMat.customProgramCacheKey=()=> 'nature-foliage-wind-v6:r147c-norfolk';
    this._materials.push(norfolkMat);this._norfolkAtlas=norfolkMat.map;
    const streetBroadleafMat = windMaterial(new THREE.Color('#ffffff'), {quality, reducedMotion});
    streetBroadleafMat.vertexColors = true;
    streetBroadleafMat.alphaTest = 0.40; streetBroadleafMat.roughness = 0.94;
    streetBroadleafMat.side = THREE.DoubleSide; streetBroadleafMat.shadowSide = THREE.FrontSide;
    streetBroadleafMat.envMapIntensity = 0.22; streetBroadleafMat.userData.envIntensityBase = 0.22;
    bindStreetBroadleafMaterial(streetBroadleafMat);
    const compileBroadleaf = streetBroadleafMat.onBeforeCompile;
    streetBroadleafMat.onBeforeCompile = (shader) => {
      compileBroadleaf(shader);
      shader.vertexShader = 'attribute float aFlower;\nvarying float vFlower;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvFlower = aFlower;');
      shader.fragmentShader = 'varying float vFlower;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        float foliageLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 blossom = vec3(0.46, 0.32, 0.58) * (0.42 + foliageLuma * 0.50);
        diffuseColor.rgb = mix(diffuseColor.rgb, blossom, clamp(vFlower, 0.0, 1.0));
      `);
    };
    streetBroadleafMat.customProgramCacheKey = () => 'nature-foliage-wind-v6-r41b-flower';
    // Jacaranda keeps the original flower map and tint response; only leaf sprays use the local compound patch.
    const jacarandaAtlas=r148CompoundAtlas(),jacarandaMat=windMaterial(new THREE.Color('#ffffff'),{quality,reducedMotion});
    jacarandaMat.vertexColors=true;jacarandaMat.alphaTest=.40;jacarandaMat.roughness=.94;jacarandaMat.side=THREE.DoubleSide;jacarandaMat.shadowSide=THREE.FrontSide;jacarandaMat.envMapIntensity=.22;jacarandaMat.userData.envIntensityBase=.22;
    bindStreetBroadleafMaterial(jacarandaMat);
    const jacarandaWind=jacarandaMat.onBeforeCompile;
    const jacarandaVertex=shader=>{shader.vertexShader='attribute float aFlower;\nvarying float vFlower;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFlower = aFlower;');};
    const jacarandaMap=shader=>{shader.uniforms.j148CompoundAtlas={value:jacarandaAtlas};shader.fragmentShader='uniform sampler2D j148CompoundAtlas;\nvarying float vFlower;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`if(vFlower < 0.5){diffuseColor *= texture2D(j148CompoundAtlas,vec2(vMapUv.x-2.0,vMapUv.y));}else{\n#include <map_fragment>\n}`);};
    jacarandaMat.onBeforeCompile=shader=>{jacarandaWind(shader);jacarandaVertex(shader);jacarandaMap(shader);shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float foliageLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 blossom = vec3(0.46, 0.32, 0.58) * (0.42 + foliageLuma * 0.50);
        diffuseColor.rgb = mix(diffuseColor.rgb, blossom, clamp(vFlower, 0.0, 1.0));`);};
    jacarandaMat.name='r148-jacaranda-compound-crown';jacarandaMat.customProgramCacheKey=()=> 'nature-foliage-wind-v6:r148-jacaranda';jacarandaMat.userData.r148CompoundAtlas=jacarandaAtlas;
    const jacarandaDepth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,alphaTest:.40,side:THREE.FrontSide});bindStreetBroadleafMaterial(jacarandaDepth);jacarandaDepth.onBeforeCompile=shader=>{jacarandaVertex(shader);jacarandaMap(shader);};jacarandaDepth.customProgramCacheKey=()=> 'r148-jacaranda-compound-depth';
    this._materials.push(jacarandaMat,jacarandaDepth);this._jacarandaCompoundAtlas=jacarandaAtlas;
    this._materials.push(leafMat, streetLeafMat, streetBroadleafMat, barkMat, streetBarkMat, groundMat, debrisMat, contactMat);

    const shedGeometry = buildShedGeometry(quality);
    const debrisGeometry = buildDebrisGeometry(quality);
    const pavedGeometry = pavedPitGeometry(quality);
    const publicGeometry = publicCount ? tagWind(publicPitGeometry(), 0) : null;
    const lawnGeometry = lawnPitGeometry(quality);
    const contactGeometry = treeContactGeometry();
    this._geometries.push(
      shedGeometry, debrisGeometry, pavedGeometry, lawnGeometry, contactGeometry,
    );
    if (publicGeometry) this._geometries.push(publicGeometry);

    shedGeometry.setAttribute('aTap', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, total)), 1));
    debrisGeometry.setAttribute('aTap', new THREE.InstancedBufferAttribute(new Float32Array(DEBRIS_CAPACITY), 1));
    pavedGeometry.setAttribute('aTap', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, pavedCount)), 1));
    if (publicGeometry) {
      publicGeometry.setAttribute('aTap', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, publicCount)), 1));
    }
    lawnGeometry.setAttribute('aTap', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, lawnCount)), 1));
    this._shedMesh = new THREE.InstancedMesh(shedGeometry, leafMat, Math.max(1, total));
    this._shedMesh.name = 'nature:foliage:shed';
    this._shedMesh.castShadow = quality !== 'low';
    this._shedMesh.receiveShadow = true;
    for (let i = 0; i < this._shedMesh.count; i += 1) {
      this._shedMesh.setMatrixAt(i, HIDDEN_MATRIX);
    }

    this._debrisMesh = new THREE.InstancedMesh(debrisGeometry, debrisMat, DEBRIS_CAPACITY);
    this._debrisMesh.name = 'nature:foliage:debris';
    this._debrisMesh.castShadow = quality !== 'low';
    this._debrisMesh.receiveShadow = true;
    this._debrisMesh.frustumCulled = false;
    for (let i = 0; i < DEBRIS_CAPACITY; i += 1) this._debrisMesh.setMatrixAt(i, HIDDEN_MATRIX);
    this._debrisMesh.count = DEBRIS_CAPACITY;

    this._publicMesh = publicCount
      ? new THREE.InstancedMesh(publicGeometry, groundMat, publicCount)
      : null;
    if (this._publicMesh) {
      this._publicMesh.name = 'nature:foliage:pit-public';
      this._publicMesh.castShadow = false;
      this._publicMesh.receiveShadow = true;
    }
    this._pavedMesh = pavedCount
      ? new THREE.InstancedMesh(pavedGeometry, groundMat, pavedCount)
      : null;
    if (this._pavedMesh) {
      this._pavedMesh.name = 'nature:foliage:pit-paved';
      this._pavedMesh.castShadow = false;
      this._pavedMesh.receiveShadow = true;
    }
    this._lawnMesh = lawnCount
      ? new THREE.InstancedMesh(lawnGeometry, groundMat, lawnCount)
      : null;
    if (this._lawnMesh) {
      this._lawnMesh.name = 'nature:foliage:pit-lawn';
      this._lawnMesh.castShadow = false;
      this._lawnMesh.receiveShadow = true;
    }
    this._contactMesh = new THREE.InstancedMesh(contactGeometry, contactMat, Math.max(1, total));
    this._contactMesh.count = total;
    this._contactMesh.name = 'nature:foliage:contact';
    this._contactMesh.castShadow = false;
    this._contactMesh.receiveShadow = false;
    this._contactMesh.frustumCulled = false;
    this._contactMesh.renderOrder = 2;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const leanQuat = new THREE.Quaternion();
    const leanAxis = new THREE.Vector3();
    const scaleV = new THREE.Vector3();
    const identityQuat = new THREE.Quaternion();
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const leafColor = new THREE.Color();
    const barkColor = new THREE.Color();
    const leafHsl = { h: 0, s: 0, l: 0 };

    let shedCursor = 0;
    let pavedCursor = 0;
    let publicCursor = 0;
    let lawnCursor = 0;
    let contactCursor = 0;

    for (const [speciesId, batch] of batches) {
      const count = batch.length;
      if (!count) continue;
      const built = builtFor(speciesId);
      this._geometries.push(built.wood, built.leaf);
      if (built.leafDrop) this._geometries.push(built.leafDrop);
      built.leaf.computeBoundingBox();
      const unitTop = built.leaf.boundingBox.max.y;

      const woodMesh = new THREE.InstancedMesh(built.wood, STREET_TREE_VARIANTS.includes(speciesId) ? streetBarkMat : barkMat, count);
      woodMesh.name = `nature:foliage:${speciesId}:trunk`;
      woodMesh.castShadow = quality !== 'low';
      woodMesh.receiveShadow = true;
      woodMesh.geometry.setAttribute('aTap', new THREE.InstancedBufferAttribute(new Float32Array(count), 1));

      const broadleafSpecies = speciesId === 'plane' || speciesId === 'jacaranda';
      const canopyMat = speciesId === 'jacaranda' ? jacarandaMat : speciesId === 'norfolk' ? norfolkMat : speciesId === 'cypress' ? cypressMat : broadleafSpecies
        ? streetBroadleafMat
        : STREET_TREE_VARIANTS.includes(speciesId) ? streetLeafMat : leafMat;
      const leafMesh = new THREE.InstancedMesh(built.leaf, canopyMat, count);
      leafMesh.geometry.setAttribute('aTap', new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
      leafMesh.name = `nature:foliage:${speciesId}:canopy`;
      const leafDropMesh = built.leafDrop
        ? new THREE.InstancedMesh(built.leafDrop, canopyMat, count)
        : null;
      if (leafDropMesh) {
        leafDropMesh.geometry.setAttribute('aTap', new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
        leafDropMesh.name = `nature:foliage:${speciesId}:canopy-drop`;
      }
      if(speciesId==='jacaranda'){leafMesh.customDepthMaterial=jacarandaDepth;if(leafDropMesh)leafDropMesh.customDepthMaterial=jacarandaDepth;}
      // V3.31 R2, critic D1 — the biggest single item on the board.
      //
      // R1 inherited `castShadow = false` here from an R5 finding that canopy shadows
      // became soft ink-blot PCF discs on asphalt at mid-zoom. That workaround was stale:
      // `lighting.js` records the *source* fix for the same defect in the same critic
      // round — soft PCF radius plus a raking key was the cause, and it now runs
      // `shadow.radius = 0`, `normalBias = 0.42`, `bias = -0.00015`. The cause was fixed
      // in the light and the canopy was never switched back on, so on
      // `r1c-trees-canopy-plan.png` a lamp post, a bench and two bollards all threw crisp
      // shadows while the largest object in frame threw none. The reference drops paving
      // from L 0.788 to L 0.542 under a canopy; ours dropped it by zero.
      //
      // Both are on. `receiveShadow` is half of critic D8 as well: it is what lets one
      // mass shade another instead of every mass reading as the same green.
      leafMesh.castShadow = quality !== 'low';
      leafMesh.receiveShadow = true;
      if (leafDropMesh) {
        leafDropMesh.castShadow = quality !== 'low';
        leafDropMesh.receiveShadow = true;
      }

      const speciesBark = new THREE.Color(SPECIES_FORM[speciesId].bark);
      const leafBias = SPECIES_FORM[speciesId].leafBias;

      for (let i = 0; i < count; i += 1) {
        const p = batch[i];
        const season = p.season ?? seasonForPlacement(speciesId, p.salt);

        // --- per-instance colour ---------------------------------------------------
        const mix = unitFromKey(`leaf-instance-mix:${speciesId}:${p.salt}`);
        const palette = season === 'autumn' ? AUTUMN_LEAF_PALETTE
          : season === 'winter' ? WINTER_LEAF_PALETTE
            : INSTANCE_LEAF_PALETTE;
        const hex = palette[
          Math.floor(mix * palette.length) % palette.length
        ];
        leafColor.copy(tintColor(hex, p.districtId));
        leafColor.getHSL(leafHsl);
        leafColor.setHSL(
          (leafHsl.h + (unitFromKey(`leaf-hue:${speciesId}:${p.salt}`) - 0.5) * 0.045 + 1) % 1,
          THREE.MathUtils.clamp(
            leafHsl.s * (0.90 + unitFromKey(`leaf-sat:${speciesId}:${p.salt}`) * 0.20),
            0,
            1,
          ),
          THREE.MathUtils.clamp(
            leafHsl.l * (0.88 + unitFromKey(`leaf-light:${speciesId}:${p.salt}`) * 0.24),
            0.08,
            0.82,
          ),
        );
        leafColor.setRGB(
          leafColor.r * leafBias[0],
          leafColor.g * leafBias[1],
          leafColor.b * leafBias[2],
        );
        // Foliage keeps the seasonal instance tint. Jacaranda lavender is the flower
        // attribute on the shared broadleaf shader, not a whole-canopy recolour.
        if (speciesId === 'eucalypt') leafColor.lerp(new THREE.Color('#809078'), 0.50);
        if (speciesId === 'norfolk' || speciesId === 'cypress') leafColor.lerp(new THREE.Color('#536637'), 0.65).multiplyScalar(0.86 + mix * 0.28);
        leafMesh.setColorAt(i, leafColor);
        if (leafDropMesh) leafDropMesh.setColorAt(i, leafColor);
        this._shedMesh.setColorAt(shedCursor, leafColor);

        const barkMix = unitFromKey(`bark:${speciesId}:${p.salt}`);
        const barkK = 1 - BARK_VALUE_SPREAD * 0.5 + barkMix * BARK_VALUE_SPREAD;
        barkColor.setRGB(speciesBark.r * barkK, speciesBark.g * barkK, speciesBark.b * barkK);
        woodMesh.setColorAt(i, barkColor);

        // --- per-instance transform -------------------------------------------------
        const law = STREET_SIZE_LAW[speciesId];
        // W7-A: `fit` is the crown-fit scale (1 where no footprint is within reach), applied to all three axes.
        const frame = treeFrame(p, speciesId, unitTop);
        const h = frame.h * (p.fit ?? 1);
        const { girthX, stretch, girthZ, leanAmt, leanDir } = frame;

        position.set(p.x, 0, p.z);
        euler.y = p.yaw;
        quaternion.setFromEuler(euler);
        leanAxis.set(Math.cos(leanDir), 0, Math.sin(leanDir));
        leanQuat.setFromAxisAngle(leanAxis, leanAmt);
        quaternion.premultiply(leanQuat);
        scaleV.set(h * girthX, h * stretch, h * girthZ);
        matrix.compose(position, quaternion, scaleV);
        woodMesh.setMatrixAt(i, matrix);
        leafMesh.setMatrixAt(i, season === 'bare' ? HIDDEN_MATRIX : matrix);
        if (leafDropMesh) leafDropMesh.setMatrixAt(i, season === 'bare' ? HIDDEN_MATRIX : matrix);

        const baseMatrix = matrix.clone();
        const shedMatrix = baseMatrix.clone().multiply(built.shedLocal);
        this._shedMesh.setMatrixAt(shedCursor, HIDDEN_MATRIX);

        // Debris rests on the ground beside the bole, upright, unaffected by the lean.
        const groundMatrix = new THREE.Matrix4().compose(
          position,
          new THREE.Quaternion().setFromEuler(euler),
          scaleV,
        );
        const debrisMatrix = groundMatrix.multiply(built.debrisLocal);

        // --- pit ---------------------------------------------------------------------
        const pitR = THREE.MathUtils.clamp(0.52 + p.scale * 0.52, 0.62, 1.12);
        const pitYaw = unitFromKey(`v331-tree-pit:${speciesId}:${p.salt}`) * TAU;
        const pitMatrix = new THREE.Matrix4().compose(
          new THREE.Vector3(p.x, 0.004, p.z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pitYaw),
          new THREE.Vector3(pitR, 1, pitR),
        );
        if (p.pit === 'public' && this._publicMesh) {
          this._publicMesh.setMatrixAt(publicCursor, new THREE.Matrix4().compose(
            new THREE.Vector3(p.x, 0, p.z),
            identityQuat,
            new THREE.Vector3(1, 1, 1),
          ));
          publicCursor += 1;
        } else if (p.pit === 'paved' && this._pavedMesh) {
          this._pavedMesh.setMatrixAt(pavedCursor, pitMatrix);
          pavedCursor += 1;
        } else if (this._lawnMesh) {
          this._lawnMesh.setMatrixAt(lawnCursor, pitMatrix);
          lawnCursor += 1;
        }

        const contactR = THREE.MathUtils.clamp(
          h * SPECIES_FORM[speciesId].spread * 0.22,
          0.72,
          law ? 2.4 : 1.25,
        );
        matrix.compose(
          new THREE.Vector3(p.x, 0.052, p.z),
          identityQuat,
          new THREE.Vector3(contactR, 1, contactR),
        );
        this._contactMesh.setMatrixAt(contactCursor, matrix);
        contactCursor += 1;

        const entry = {
          speciesId,
          index: i,
          shedIndex: shedCursor,
          baseScaleY: scaleV.y,
          baseMatrix,
          woodMesh,
          leafMesh,
          leafDropMesh,
          shedMatrix,
          shedLocal: built.shedLocal.clone(),
          debrisMatrix,
          dropGroundMatrix: (speciesId === 'plane' || speciesId === 'jacaranda') && leafDropMesh
            ? broadleafDetachedMatrix(leafDropMesh.geometry, p.x, p.z, p.yaw, built.dropHeading ?? 0, this._broadleafGround)
            : new THREE.Matrix4().compose(
              position,
              new THREE.Quaternion().setFromEuler(euler),
              scaleV,
            ).multiply(built.dropLocal),
          keepGroundMatrix: (speciesId === 'plane' || speciesId === 'jacaranda')
            ? broadleafDetachedMatrix(leafMesh.geometry, p.x, p.z, p.yaw, built.keepHeading ?? Math.PI, this._broadleafGround)
            : new THREE.Matrix4().compose(
              position,
              new THREE.Quaternion().setFromEuler(euler),
              scaleV,
            ).multiply(built.keepLocal),
          broadleafDetached: speciesId === 'plane' || speciesId === 'jacaranda',
          dropFall: 1,
          keepFall: 1,
          dropHeading: built.dropHeading ?? 0,
          keepHeading: built.keepHeading ?? Math.PI,
          damaged: false,
          damageLevel: 0,
          regrow: 1,
          swayX: 0,
          swayZ: 0,
          tapEnergy: 0,
          swayActive: false,
          fallAngle: 0,
          fallHeading: 0,
          corridorFallHeading: (speciesId === 'plane' || speciesId === 'jacaranda')
            ? broadleafCorridorFallHeading(city, p.x, p.z, p.role)
            : null,
          fallActive: false,
          debrisSlot: null,
          season,
          streetType: p.streetType,
          r7Verge: Boolean(p.r7Verge),
        };
        this._entries.set(`${speciesId}:${i}`, entry);
        shedCursor += 1;

        const reserve = city?.reserve;
        const onReserve = reserve?.centre
          && Math.hypot(p.x - reserve.centre.x, p.z - reserve.centre.z) < 28;
        this.mischiefTreeRecords.push({
          key: `${onReserve ? 'tree:reserve' : 'tree:foliage'}:${speciesId}:${p.mischiefIndex}:${p.x}:${p.z}`,
          speciesId,
          modelId: speciesId,
          x: p.x,
          z: p.z,
          rotation: p.yaw,
          season,
          streetType: p.streetType,
          r7Verge: Boolean(p.r7Verge),
          // R1 declared `h * 0.26` because `treeComponents()` floored the pooled crown box
          // at 2.8 m and a true height would have put a 7.9 m slab over the tree. With a
          // kit attached that path is never reached, so the tree can declare what it is.
          height: h,
          voxelKit: damagedCrownKit(
            SPECIES_FORM[speciesId],
            scaleV.x, scaleV.y, scaleV.z,
            leafColor, barkColor, season,
          ),
          scale: p.scale,
          instanceIndex: i,
          zone: onReserve ? 'reserve' : 'street',
          corridorFallHeading: entry.corridorFallHeading,
          mesh: this._makeDamageBridge(speciesId, count, baseMatrix, i),
          trunkMesh: null,
          baseMatrix,
        });
      }

      woodMesh.instanceMatrix.needsUpdate = true;
      leafMesh.instanceMatrix.needsUpdate = true;
      if (woodMesh.instanceColor) woodMesh.instanceColor.needsUpdate = true;
      if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
      this.root.add(woodMesh, leafMesh);
      this._meshes.push(woodMesh, leafMesh);
      if (leafDropMesh) {
        leafDropMesh.instanceMatrix.needsUpdate = true;
        if (leafDropMesh.instanceColor) leafDropMesh.instanceColor.needsUpdate = true;
        this.root.add(leafDropMesh);
        this._meshes.push(leafDropMesh);
      }
      this._speciesMeshes.set(speciesId, leafMesh);
    }

    this._shedMesh.instanceMatrix.needsUpdate = true;
    if (this._shedMesh.instanceColor) this._shedMesh.instanceColor.needsUpdate = true;
    this._debrisMesh.instanceMatrix.needsUpdate = true;
    if (this._publicMesh) this._publicMesh.instanceMatrix.needsUpdate = true;
    if (this._pavedMesh) this._pavedMesh.instanceMatrix.needsUpdate = true;
    if (this._lawnMesh) this._lawnMesh.instanceMatrix.needsUpdate = true;
    this._contactMesh.instanceMatrix.needsUpdate = true;

    if (this._publicMesh) {
      this.root.add(this._publicMesh);
      this._meshes.push(this._publicMesh);
    }
    if (this._pavedMesh) {
      this.root.add(this._pavedMesh);
      this._meshes.push(this._pavedMesh);
    }
    if (this._lawnMesh) {
      this.root.add(this._lawnMesh);
      this._meshes.push(this._lawnMesh);
    }
    this.root.add(this._contactMesh);
    this._meshes.push(this._contactMesh);
    this.root.add(this._shedMesh, this._debrisMesh);
    this._meshes.push(this._shedMesh, this._debrisMesh);

    parent.add(this.root);
  }

  /**
   * Board.js drives foliage mischief by writing an instance matrix: the authored matrix
   * when the tree is whole and a zero-scale matrix when it is not. A real InstancedMesh
   * on that path can only make the whole tree vanish, which is why a tap used to replace
   * a tree with two boxes. This adapter reads the same two signals and turns them into a
   * damaged tree instead: the limb on one flank leaves the canopy, the snapped limb and
   * its litter appear at the bole, and repair grows the limb back onto the exact matrix
   * it left. It duck-types only what board.js touches.
   */
  _makeDamageBridge(speciesId, count, baseMatrix, index) {
    const layer = this;
    const key = `${speciesId}:${index}`;
    return {
      isFoliageDamageBridge: true,
      count,
      instanceMatrix: { needsUpdate: false },
      instanceColor: null,
      getMatrixAt(_i, target) {
        target.copy(baseMatrix);
        return target;
      },
      setMatrixAt(_i, m) {
        const e = m.elements;
        const sy = Math.hypot(e[4], e[5], e[6]);
        const entry = layer._entries.get(key);
        if (!entry) return;
        layer._setDamaged(entry, sy <= entry.baseScaleY * 0.004);
      },
    };
  }

  _setDamaged(entry, damaged) {
    this._setDamageLevel(entry, damaged ? 2 : 0);
  }

  _setDamageLevel(entry, level) {
    const next = Math.max(0, Math.min(3, Number(level) || 0));
    const prev = entry.damageLevel;
    if (prev === next) return;
    entry.damageLevel = next;
    entry.damaged = next >= 2;
    if (next < 3 && entry.fallActive) {
      entry.fallAngle = 0;
      entry.fallActive = false;
    }
    if (next >= 1 && prev < 1) {
      entry.dropFall = this.reducedMotion ? 1 : 0;
      if (!this.reducedMotion && !this._dropping.includes(entry)) this._dropping.push(entry);
    } else if (next < 1) {
      entry.dropFall = 1;
      const di = this._dropping.indexOf(entry);
      if (di >= 0) this._dropping.splice(di, 1);
    }
    if (next >= 2 && prev < 2) {
      entry.keepFall = this.reducedMotion ? 1 : 0;
      if (!this.reducedMotion && !this._shedding.includes(entry)) this._shedding.push(entry);
    } else if (next < 2) {
      entry.keepFall = next < 1 ? 1 : entry.keepFall;
      const si = this._shedding.indexOf(entry);
      if (si >= 0) this._shedding.splice(si, 1);
    }
    if (next >= 2) {
      this._attachDebris(entry);
    } else if (next < 1) {
      this._detachDebris(entry);
      if (!this.reducedMotion && entry.regrow < 1) {
        entry.regrow = 0;
        if (!this._regrowing.includes(entry)) this._regrowing.push(entry);
      } else {
        entry.regrow = 1;
      }
    }
    this._writeLiveTree(entry);
  }

  _composeTreeMatrix(entry, extraScale = 1) {
    const m = this._treeMat.copy(entry.baseMatrix);
    const fall = entry.fallAngle || 0;
    const falling = fall > 1e-4;
    const swayX = falling ? 0 : entry.swayX;
    const swayZ = falling ? 0 : entry.swayZ;
    if (swayX || swayZ || falling) {
      // World planted rock / fall about the pit. Local multiply after yaw made
      // thetaX lean toward the camera on most street trees (r8 leaf-bomb).
      this._swayPos.set(m.elements[12], m.elements[13], m.elements[14]);
      m.elements[12] = 0;
      m.elements[13] = 0;
      m.elements[14] = 0;
      if (falling) {
        // +angle about (sin h, 0, −cos h) sends +Y toward heading.
        this._fallAxis.set(Math.sin(entry.fallHeading), 0, -Math.cos(entry.fallHeading));
        this._fallQuat.setFromAxisAngle(this._fallAxis, fall);
        this._swayMat.makeRotationFromQuaternion(this._fallQuat);
      } else {
        this._swayEuler.set(swayX, 0, swayZ, 'XZY');
        this._swayQuat.setFromEuler(this._swayEuler);
        this._swayMat.makeRotationFromQuaternion(this._swayQuat);
      }
      this._swayMat.multiply(m);
      this._swayMat.elements[12] += this._swayPos.x;
      this._swayMat.elements[13] += this._swayPos.y + (falling ? treeFallLift(fall, entry.baseScaleY) : 0);
      this._swayMat.elements[14] += this._swayPos.z;
      m.copy(this._swayMat);
    }
    if (extraScale !== 1) {
      m.multiply(new THREE.Matrix4().makeScale(extraScale, extraScale, extraScale));
    }
    return m.clone();
  }

  // Burst-only colour: read the crown tint into a fresh value without adding VFX
  // metadata to the serialised tree records or sharing a crown material/atlas.
  getCanopyColour(speciesId, index) {
    const entry = this._entries.get(`${speciesId}:${index}`);
    if (!entry) return undefined;
    const colour = new THREE.Color();
    entry.leafMesh.getColorAt(index, colour);
    return colour.multiply(entry.leafMesh.material.color);
  }

  setDamaged(speciesId, index, damaged) {
    this.setDamageLevel(speciesId, index, damaged ? 2 : 0);
  }

  setDamageLevel(speciesId, index, level) {
    const entry = this._entries.get(`${speciesId}:${index}`);
    if (!entry) return;
    this._setDamageLevel(entry, level);
  }

  setFall(speciesId, index, { angle = 0, heading = 0 } = {}) {
    const entry = this._entries.get(`${speciesId}:${index}`);
    if (!entry) return;
    const next = Number.isFinite(angle) ? angle : 0;
    const still = Math.abs(next) < 1e-4;
    if (still && !entry.fallActive && entry.fallAngle === 0) return;
    entry.fallAngle = still ? 0 : next;
    entry.fallHeading = Number.isFinite(heading) ? heading : 0;
    entry.fallActive = !still;
    this._writeLiveTree(entry);
  }

  setTapSway(speciesId, index, { x = 0, z = 0, energy = 0 } = {}) {
    const entry = this._entries.get(`${speciesId}:${index}`);
    if (!entry) return;
    const still = Math.abs(x) < 1e-4 && Math.abs(z) < 1e-4 && energy < 1e-3;
    if (still && !entry.swayActive) return;
    entry.swayX = x;
    entry.swayZ = z;
    entry.tapEnergy = energy;
    entry.swayActive = !still;
    this._writeLiveTree(entry);
    const tap = 0;
    const woodTap = entry.woodMesh?.geometry.getAttribute('aTap');
    const leafTap = entry.leafMesh?.geometry.getAttribute('aTap');
    const dropTap = entry.leafDropMesh?.geometry.getAttribute('aTap');
    if (woodTap) {
      woodTap.setX(entry.index, tap);
      woodTap.needsUpdate = true;
    }
    if (leafTap) {
      leafTap.setX(entry.index, tap);
      leafTap.needsUpdate = true;
    }
    if (dropTap) {
      dropTap.setX(entry.index, tap);
      dropTap.needsUpdate = true;
    }
  }

  _writeLiveTree(entry) {
    const live = this._composeTreeMatrix(entry, 1);
    if (entry.woodMesh) {
      entry.woodMesh.setMatrixAt(entry.index, live);
      entry.woodMesh.instanceMatrix.needsUpdate = true;
    }
    if (entry.season === 'bare') {
      this._writeCanopy(entry, 0);
      this._writeDrop(entry, 0);
      this._writeShed(entry, 0);
      return;
    }
    const level = entry.damageLevel ?? (entry.damaged ? 2 : 0);
    if (level >= 3) {
      // Bole goes over. Both canopy piles stay on the grate.
      this._writeCanopyFallen(entry);
      this._writeDropFallen(entry);
      this._writeShed(entry, 0);
    } else if (level >= 2) {
      // Remaining live crown leaves the bole and lands opposite the first flank.
      this._writeCanopyFallen(entry);
      this._writeDropFallen(entry);
      this._writeShed(entry, 0);
    } else if (level >= 1) {
      // Standing crown stays full. The named flank is the same mesh, on the grate.
      this._writeCanopy(entry, 1);
      this._writeDropFallen(entry);
      this._writeShed(entry, 0);
    } else {
      const k = entry.regrow >= 1 ? 1 : Math.max(0.02, entry.regrow);
      this._writeCanopy(entry, k);
      this._writeDrop(entry, k);
      this._writeShed(entry, 0);
    }
  }

  _writeDrop(entry, k) {
    const mesh = entry.leafDropMesh;
    if (!mesh) return;
    if (entry.season === 'bare' || k <= 0) mesh.setMatrixAt(entry.index, HIDDEN_MATRIX);
    else mesh.setMatrixAt(entry.index, this._composeTreeMatrix(entry, k >= 1 ? 1 : k));
    mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * The shed flank is the live drop mesh, not a substitute. It tears off the
   * swaying crown and lands on the grate beside the pit.
   */
  _writeDropFallen(entry) {
    this._writeFallenInstance(
      entry.leafDropMesh,
      entry.index,
      entry.dropGroundMatrix,
      this.reducedMotion ? 1 : Math.min(1, entry.dropFall ?? 1),
      entry,
    );
  }

  /** Remaining keep-crown masses — same live mesh, opposite side of the pit. */
  _writeCanopyFallen(entry) {
    this._writeFallenInstance(
      entry.leafMesh,
      entry.index,
      entry.keepGroundMatrix,
      this.reducedMotion ? 1 : Math.min(1, entry.keepFall ?? 1),
      entry,
      0.14,
    );
  }

  _writeFallenInstance(mesh, index, dest, k, entry, loft = 0.10) {
    if (!mesh) return;
    if (entry.season === 'bare' || !dest) {
      mesh.setMatrixAt(index, HIDDEN_MATRIX);
      mesh.instanceMatrix.needsUpdate = true;
      return;
    }
    if (k >= 1) {
      mesh.setMatrixAt(index, dest);
    } else {
      const live = this._composeTreeMatrix(entry, 1);
      live.decompose(this._dropPosA, this._dropQuatA, this._dropSclA);
      dest.decompose(this._dropPosB, this._dropQuatB, this._dropSclB);
      const e = 1 - (1 - k) ** 3;
      this._dropPosA.lerp(this._dropPosB, e);
      this._dropPosA.y += Math.sin(k * Math.PI) * (entry.broadleafDetached
        ? BROADLEAF_FALL_ARC
        : entry.baseScaleY * loft);
      this._dropQuatA.slerp(this._dropQuatB, e);
      this._dropSclA.lerp(this._dropSclB, e);
      this._dropMat.compose(this._dropPosA, this._dropQuatA, this._dropSclA);
      if (entry.broadleafDetached) {
        const scan = broadleafSupportScan(mesh.geometry.attributes.position.array, this._dropMat.elements, this._broadleafGround);
        if (scan.minY < scan.support) this._dropMat.elements[13] += scan.support - scan.minY;
      }
      mesh.setMatrixAt(index, this._dropMat);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  _writeShed(entry, k) {
    if (!this._shedMesh) return;
    if (entry.season === 'bare' || k <= 0) {
      this._shedMesh.setMatrixAt(entry.shedIndex, HIDDEN_MATRIX);
    } else {
      const live = this._composeTreeMatrix(entry, k >= 1 ? 1 : k);
      if (entry.shedLocal) live.multiply(entry.shedLocal);
      else live.copy(entry.shedMatrix);
      this._shedMesh.setMatrixAt(entry.shedIndex, live);
    }
    this._shedMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * The leaf masses ride the live instance matrix. Stage 2 thins them about the
   * crown; stage 3 keeps that remainder and falls it with the bole. Pooled voxel
   * kits stay off this path — they read as crates around a stripped stem.
   */
  _writeCanopy(entry, k, { aboutCrown = false, crownY = 0.64, sx = null, sy = null, sz = null } = {}) {
    const mesh = entry.leafMesh;
    if (!mesh) return;
    if (entry.season === 'bare' || k <= 0) {
      mesh.setMatrixAt(entry.index, HIDDEN_MATRIX);
    } else if (aboutCrown && (k < 0.999 || sx != null)) {
      const live = this._composeTreeMatrix(entry, 1);
      // Species meshes are authored near unit height. Instance scale lives
      // in baseMatrix — do not multiply by baseScaleY or the pivot flies
      // tens of metres up and the crown vanishes (r5-tree-05).
      const cy = crownY;
      const ax = sx ?? k;
      const ay = sy ?? k;
      const az = sz ?? k;
      live.multiply(new THREE.Matrix4().makeTranslation(0, cy, 0));
      live.multiply(new THREE.Matrix4().makeScale(ax, ay, az));
      live.multiply(new THREE.Matrix4().makeTranslation(0, -cy, 0));
      mesh.setMatrixAt(entry.index, live);
    } else {
      mesh.setMatrixAt(entry.index, this._composeTreeMatrix(entry, k >= 1 ? 1 : k));
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  _attachDebris(entry) {
    // Plane and jacaranda already have detached leaf piles and a live falling
    // trunk. Do not take a generic debris slot for them.
    if (entry.broadleafDetached) return;
    if (!this._debrisMesh || entry.debrisSlot !== null) return;
    let slot = this._debrisOwners.indexOf(null);
    if (slot < 0) {
      slot = this._debrisCursor % DEBRIS_CAPACITY;
      this._debrisCursor += 1;
      const previous = this._debrisOwners[slot];
      if (previous) previous.debrisSlot = null;
    }
    this._debrisOwners[slot] = entry;
    entry.debrisSlot = slot;
    this._debrisMesh.setMatrixAt(slot, entry.debrisMatrix);
    this._debrisMesh.instanceMatrix.needsUpdate = true;
  }

  _detachDebris(entry) {
    if (!this._debrisMesh || entry.debrisSlot === null) return;
    this._debrisMesh.setMatrixAt(entry.debrisSlot, HIDDEN_MATRIX);
    this._debrisMesh.instanceMatrix.needsUpdate = true;
    this._debrisOwners[entry.debrisSlot] = null;
    entry.debrisSlot = null;
  }

  _seedShoreShrubs(city, placements) {
    const edge = city.waterEdge;
    if (!edge) return;
    const { extent } = city;
    // The beach front gets a true volumetric palm batch; its six flattened masses and
    // petiole forks replace the old small bottlebrush stand-ins.
    const rng = makeRng(hashSeed(`shore-trees:${city.seed ?? 0}:${edge}`));
    const count = 18;
    for (let i = 0; i < count; i += 1) {
      const t = (i + 0.5) / count;
      let x;
      let z;
      const jitter = (rng() - 0.5) * 4;
      // Dry beach past boardwalk seaward face (~9 m+) — not on road or deck.
      const inland = -(10 + rng() * 14);
      if (edge === 'north') {
        x = extent.x * t + jitter;
        z = inland;
      } else if (edge === 'south') {
        x = extent.x * t + jitter;
        z = extent.z - inland;
      } else if (edge === 'west') {
        x = inland;
        z = extent.z * t + jitter;
      } else {
        x = extent.x - inland;
        z = extent.z * t + jitter;
      }
      // Draw order matches the pre-V3.31 layer exactly — scale then rotation — so the
      // shore planting keeps the sizes and headings it already had.
      const sizeClass = Math.floor(rng() * 4) % 4;
      const formClass = spatialFormClass(x, z);
      const yaw = rng() * Math.PI * 2 + formClass * 0.37;
      const salt = `${city.seed ?? 0}:s${i}`;
      placements.push({
        speciesId: 'palm',
        x,
        z,
        yaw,
        scale: FOLIAGE_SIZE_CLASS[sizeClass],
        sizeClass,
        season: seasonForPlacement('palm', salt),
        formClass,
        districtId: nearestDistrictId(city, x, z),
        pit: 'lawn',
        streetType: 'beachfront',
        role: 'shore-palm',
        salt: `${city.seed ?? 0}:s${i}`,
      });
    }
  }

  _hideBoardTrees(boardRoot) {
    if (!boardRoot) return;
    boardRoot.traverse((child) => {
      const name = child.name || '';
      if (name.startsWith('trees:')) {
        this._hidden.push({ object: child, wasVisible: child.visible });
        child.visible = false;
      }
    });
  }

  setReducedMotion(on) {
    this.reducedMotion = on;
    for (const material of this._materials) {
      const uniforms = material.userData.windUniforms;
      if (uniforms) uniforms.uWindAmp.value = on ? 0 : 1;
    }
  }

  update(dt, elapsed) {
    this._elapsed = elapsed;
    if (this._dropping.length) {
      for (let i = this._dropping.length - 1; i >= 0; i -= 1) {
        const entry = this._dropping[i];
        if ((entry.damageLevel ?? 0) < 1) {
          this._dropping.splice(i, 1);
          continue;
        }
        entry.dropFall = Math.min(1, (entry.dropFall ?? 0) + (dt || 0) / DROP_FALL_DURATION);
        this._writeDropFallen(entry);
        if (entry.dropFall >= 1) this._dropping.splice(i, 1);
      }
    }
    if (this._shedding.length) {
      for (let i = this._shedding.length - 1; i >= 0; i -= 1) {
        const entry = this._shedding[i];
        if ((entry.damageLevel ?? 0) < 2) {
          this._shedding.splice(i, 1);
          continue;
        }
        entry.keepFall = Math.min(1, (entry.keepFall ?? 0) + (dt || 0) / KEEP_FALL_DURATION);
        this._writeCanopyFallen(entry);
        if (entry.keepFall >= 1) this._shedding.splice(i, 1);
      }
    }
    if (this._regrowing.length) {
      for (let i = this._regrowing.length - 1; i >= 0; i -= 1) {
        const entry = this._regrowing[i];
        if (entry.damaged) {
          this._regrowing.splice(i, 1);
          continue;
        }
        entry.regrow = Math.min(1, entry.regrow + (dt || 0) / REGROW_DURATION);
        const k = entry.regrow >= 1 ? 1 : Math.max(0.02, easeOutBack(entry.regrow));
        this._writeShed(entry, k);
        this._writeCanopy(entry, k);
        this._writeDrop(entry, k);
        if (entry.regrow >= 1) this._regrowing.splice(i, 1);
      }
    }
    if (this.reducedMotion) return;
    for (const material of this._materials) {
      const uniforms = material.userData.windUniforms;
      if (uniforms) uniforms.uWindTime.value = elapsed;
    }
  }

  stats() {
    let instances = 0;
    let triangles = 0;
    for (const mesh of this._meshes) {
      instances += mesh.count;
      const geom = mesh.geometry;
      const tris = geom.index
        ? geom.index.count / 3
        : geom.attributes.position.count / 3;
      triangles += tris * mesh.count;
    }
    return {
      drawCalls: this._meshes.length,
      instances,
      triangles: Math.round(triangles),
      species: this._meshes.map((m) => m.name),
    };
  }

  broadleafReceiverMeshes() {
    const names = new Set([
      'nature:foliage:plane:canopy',
      'nature:foliage:plane:canopy-drop',
      'nature:foliage:jacaranda:canopy',
      'nature:foliage:jacaranda:canopy-drop',
    ]);
    return this._meshes.filter((mesh) => names.has(mesh?.name));
  }

  dispose() {
    for (const entry of this._hidden) {
      if (entry.object) entry.object.visible = entry.wasVisible;
    }
    this._hidden.length = 0;
    if (this.root.parent) this.root.parent.remove(this.root);
    for (const mesh of this._meshes) {
      this.root.remove(mesh);
    }
    for (const geometry of this._geometries) geometry.dispose();
    for (const material of this._materials) material.dispose();
    this._cypressAtlas?.dispose();this._cypressAtlas=null;
    this._norfolkAtlas?.dispose();this._norfolkAtlas=null;
    this._jacarandaCompoundAtlas?.dispose();this._jacarandaCompoundAtlas=null;
    this._meshes.length = 0;
    this._geometries.length = 0;
    this._materials.length = 0;
    this._entries.clear();
    this._regrowing.length = 0;
    this._dropping.length = 0;
    this._shedding.length = 0;
    this._shedMesh = null;
    this._debrisMesh = null;
    this._pavedMesh = null;
    this._lawnMesh = null;
    this._contactMesh = null;
  }
}
