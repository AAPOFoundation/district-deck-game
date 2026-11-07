// P14 M3 — drone raid and Bass Strait sea fight. Replay of threat rows only.

import * as THREE from 'three';
import { PITCH, ROAD, cityExtent } from '../../core/grid.js';
import {
  WORLD_RUN_KEY,
  inspectWorldRun,
  worldStoreGet,
} from '../../core/world/envelope.js';
import { beatDeliveries } from '../../core/world/deliveries.js';
import { liveFacilityDamage, liveThreats } from '../../core/world/threats.js';
import { addBox, addCyl, addSphere, addToyPerson, noPick, std, WATER_Y } from '../fringe/kit.js';
import { chamferBox, slabCentreAt } from '../fringe/ships.js';
import { planEdgeMassing } from '../edge-massing.js';
import {
  HULL_WAKE,
  addReflectionSources,
  clearOceanWakeHulls,
  oceanSurfaceYAt,
  oceanWakeFieldAt,
  setOceanWakeHulls,
} from '../outer-ocean.js';
import {
  clamp01,
  containerApproachWaypoints,
  easeInOutCubic,
  easeOutCubic,
  samplePolyline,
  shipDepartPose,
} from '../port/logistics-anim.js';
import {
  HullRide,
  addBowWave,
  addPlanCollar,
  addPlanShade,
  addSternWake,
  findKeyLight,
  foamGapAt,
  groundStamp,
  makeContactPatch,
  makeMultiplyStamp,
  planRingMesh,
  seaHullFrame,
  waterFoamMaterial,
  waterShadeMaterial,
  militaryCameraPose,
  orbitEye,
  parseBlockId,
  padPoseForBlock,
  readKeyLight,
  segmentHitsBox,
} from './units.js';
import {
  HULL_WEATHER,
  dressWarship,
  hullWearMap,
  tickWarshipDress,
} from './warship-dress.js';

/**
 * The navy hull's own ends, in the dress frame. `HULL_PLAN` runs -14.60 at the
 * transom to +13.40 at the stem and its widest half-breadth is 3.46 amidships;
 * the ride samples the sea AT those stations rather than amidships.
 */
export const NAVY_HALF_LEN_M = 14.0;
export const NAVY_HALF_BEAM_M = 3.46;

/** M11 item 5 — the wetness band on the pier edge, metres above still water. */
export const RAID_WET_BAND_M = 0.40;
/** The port's own quay pile pitch (`fringe:port-cope:piles`), metres. */
export const RAID_PILE_PITCH_M = 5.4;
/** How much of the edge the raid dresses, centred on the apron. */
export const RAID_EDGE_SPAN_M = 64;
/** M12 item 4 — three broken runs, long enough to read in the raid camera. */
export const RAID_SUN_TRACK = Object.freeze({ runs: 3, lengthM: 31, maxWidthM: 2.6 });
const _raidBox = new THREE.Box3();

export const RAID_ENTRY_ALT_M = 18;
/** MC2 F9 — raid actors at the raid pose. Was 2.7/2.55 with a hairline body. */
export const RAID_ACTOR_SCALE = 3.1;
/** MC2 F9 — the whole engagement lives inside this radius of the target. */
export const RAID_ENGAGE_R = 6.2;
/**
 * MC3 F9 — a hit flash is a flash. M5 stretched it to 1.35 s so the strike would
 * "carry the whole fall", and the audit read the result as one cauliflower of
 * actor-plus-effect. Back to a real flash; the fall now reads on the airframe.
 */
export const RAID_HIT_FLASH_S = 0.30;
/** MC3 F9 — the apron detonation is the same flash, on the same clock. */
export const RAID_BOOM_S = 0.30;
/** M8 (M7 residual 9) — a fireball, not a building-sized orange disc. */
export const RAID_BOOM_R0 = 1.4;
export const RAID_BOOM_R1 = 4.6;

/**
 * MC3 F9 — actor and effect must separate by value. The smoke is the darkest
 * thing on the apron; the top plates of both sides are the palest. `hexLuma`
 * is Rec.709 on the raw sRGB bytes, the same measure the audit used on pixels.
 */
export function hexLuma(hex) {
  const v = typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex;
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}
export const RAID_SMOKE_HEX = 0x2a2826;
export const RAID_ATTACKER_PLATE_HEX = '#e2d2a8';
export const RAID_INTERCEPTOR_PLATE_HEX = '#dcE6ee';
/** The gap the audit asked for between an actor's top plate and the smoke. */
export const RAID_PLATE_LUMA_GAP = 60;
/**
 * MC3 F9 — the column drifts downwind instead of standing on the wreckage. The
 * wind runs with the raid's own entry heading (in off the north-west), so the
 * smoke leans away from the apron the actors and debris occupy.
 */
export const RAID_WIND_XZ = Object.freeze([Math.SQRT1_2, Math.SQRT1_2]);
/*
 * M8 — the lean, measured off the first sprite capture. At 6.4 m of base drift
 * the top billow was carried 9.6 m while it rose 11.6, a 40 deg lean; the raid
 * camera looks DOWN, which compresses the rise and exaggerates the lean, and
 * the plume read as a horizontal smudge over the quay rather than a column
 * standing on a burn. Less drift, more height.
 */
export const RAID_SMOKE_DRIFT_M = 3.0;
/* ------------------------------------------------------------------ *
 * M7 item 1 — the smoke column has a value.
 *
 * M6 carried it as a residual in its own words: "the smoke column reads as
 * pale haze rather than smoke … because a dark translucent cylinder over
 * bright water loses its value". Two things made that true. It was ONE lit
 * `MeshStandardMaterial` cylinder, so the key washed a dark grey up to the
 * background's own luma and there was nothing left to read; and a cylinder has
 * no silhouette — smoke is billows, and a smooth taper reads as vapour.
 *
 * The column is now an unlit stack whose single-card billows bake a warm lit
 * shoulder and a cool shadow side into the same texture. Unlit is the whole
 * point — the value is authored, not negotiated with the rig.
 * ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ *
 * M8 item 1 — and a hard-edged sphere at 0.95 opacity is not smoke either.
 *
 * M7's stack had the VALUE the brief asked for (core 50.7 against an apron of
 * 147.6) and the wrong FORM: opaque unlit spheres read on frame as two
 * clusters of flat black discs, which is a paint splat, not a plume. The fault
 * is the alpha profile, not the colour. A sphere at opacity 0.95 has an edge
 * one pixel wide — the silhouette is a circle and the eye reads a solid.
 *
 * Smoke is soft-alpha: the density falls off over a wide band and the
 * silhouette is broken by noise, so no two billows share an outline. Each
 * billow is now a camera-facing sprite carrying a procedurally built RGBA map
 * — a radial falloff whose EDGE is displaced by two octaves of seeded value
 * noise, times a density term from the same noise. Peak opacity is 0.58 and it
 * thins with height, because the top of a plume
 * is the oldest, most diluted smoke.
 * ------------------------------------------------------------------ */
export const RAID_COLUMN_BILLOWS = 8;
/**
 * The core: dark enough to hold under the grade against a ~150-luma apron.
 * Measured on the first M7 capture: `#3a3835` (hex luma 56.2) came back at
 * **94.6** on frame — the post chain's exposure and contrast lift a flat unlit
 * grey by about 38. The authored value therefore has to be under the target by
 * that much, not at it. M8 tilts it a shade cool (`26` blue against `22` red):
 * with the rim warm on the key side, the two together give the billow a lit
 * side and a shadow side instead of one flat tone.
 */
export const RAID_SMOKE_CORE_HEX = '#26282d';
/**
 * The rim: the sunward shoulder of each billow, and the part that carries the
 * plume over dark water.
 *
 * Measured on the first M8 capture: with the rim held behind a smaller core,
 * the whole stack read as a grey smear, because the crash site is on the quay
 * with the NAVY SEA behind the top of the column. A dark core over dark water
 * is nothing — the same fault M6 reported in reverse. Real smoke over a dark
 * sea reads as a PALE plume with a dark underside, so the rim is now larger
 * than its core rather than smaller: it draws first and stands out all round as
 * a lit halo, brightest on the key side where it is also offset. The core then
 * sits inside it as the shadowed heart of the billow, which is what keeps the
 * core's own value under the apron's.
 */
export const RAID_SMOKE_RIM_HEX = '#ded0b6';
export const RAID_SMOKE_CORE_OPACITY = 0.58;
/** How much thinner the top billow is than the base one. */
export const RAID_SMOKE_THIN = 0.78;
export const RAID_RIM_SCALE = 1.0;
export const RAID_RIM_OFFSET = 0.30;
export const RAID_RIM_OPACITY = 0.58;
export const RAID_COLUMN_H_M = 8.4;
export const RAID_COLUMN_BASE_R = 0.50;
export const RAID_COLUMN_TOP_R = 2.0;
export const RAID_SMOKE_PUFF_START_M = 1.0;
export const RAID_SMOKE_PUFF_END_M = 4.0;
export const RAID_SMOKE_PUFF_LIFETIME_S = 3.2;
export const RAID_SMOKE_PUFF_RISE_M = 7.2;
export const RAID_PIER_REGION_M2 = RAID_EDGE_SPAN_M * 20;
/** Trail, hit and blast events use the same bounded small-puff language. */
export const RAID_EFFECT_PUFFS = 6;
export const RAID_EFFECT_MAX_ALPHA = 0.58;
export const RAID_EMBER_COUNT = 9;
export const RAID_EMBER_RISE_M = 6.2;
export const RAID_EMBER_S = 2.1;
/** The soot fan: how far downwind of the burn the blown soot reaches. */
export const RAID_SOOT_FAN_LEN = 9.4;
export const RAID_SOOT_FLOOR = 0.62;
/**
 * M7 — how far the burn sits off the deck it is printed on. The same buried-
 * stamp bug the contact prints had: the scorch sat at the apron's own y + 0.04,
 * and a downward probe puts the ground it is printed on within a few
 * centimetres of that, so the depth test threw most of the disc away. Measured
 * on the first capture that shipped it: only 5,794 of the disc's 28,000 px
 * changed when the scorch was toggled, and the burn read **3.9 luma** darker
 * than the apron against the 40 the brief asks for.
 */
export const RAID_SCORCH_LIFT_M = 0.10;
export const RAID_SOOT_LIFT_M = 0.085;
/**
 * MC3 F1 — candidate crash sites, in the port's local frame, nearest the admin
 * block first. The first that has something solid under it wins.
 */
export const RAID_SCORCH_R = 3.6;
export const RAID_APRON_RING = Object.freeze([
  Object.freeze([1, 0]), Object.freeze([-1, 0]),
  Object.freeze([0, 1]), Object.freeze([0, -1]),
  Object.freeze([0.707, 0.707]), Object.freeze([-0.707, -0.707]),
  Object.freeze([0.707, -0.707]), Object.freeze([-0.707, 0.707]),
]);
/**
 * M7 item 2 — the scorch still touched the quay edge (M6 residual 5). The ring
 * probe kept the disc on deck, which is where M6 left it, but "on deck" and "on
 * the apron the camera is looking at" are not the same thing: a candidate whose
 * scorch ring just clears the coping still puts the burn, the column and the
 * debris half over the water. The anchor is now walked INBOARD, away from
 * whatever is not solid, until a clearance ring this much wider than the scorch
 * is solid all the way round.
 */
export const RAID_APRON_INBOARD_M = 8.5;
export const RAID_APRON_INBOARD_STEP_M = 1.0;
export const RAID_APRON_CLEAR_R = RAID_SCORCH_R + RAID_APRON_INBOARD_M;
/**
 * What counts as the port's own deck. `fringe:port-*` covers the apron, the
 * quay, the container zone and the terminal roads; the raid is a raid on the
 * port and it lands there, not on the first solid thing the ray happens to hit.
 */
export const RAID_APRON_SURFACE = /^fringe:port/;
/** A deck this far under the water plane drawn over it is still a deck. */
export const RAID_WATER_TOLERANCE_M = 0.45;
/** Above this is a roof, a shed or a gantry beam, not an apron. */
export const RAID_APRON_MAX_Y = 3.0;
/** A neighbour taller than this inside 22 m makes a site too crowded to shoot. */
export const RAID_APRON_CLEAR_SKY_M = 8.0;
export const RAID_APRON_CLEAR_SKY_R = 22.0;
const RAID_APRON_CLEAR_SKY_R2 = RAID_APRON_CLEAR_SKY_R * RAID_APRON_CLEAR_SKY_R;
/** A port mesh has to be at least this tall and this big to hide a crash site. */
export const RAID_BLOCKER_MIN_SPAN_M = 3.0;
/** Names a sightline may pass through: the ground itself, water, wakes, us. */
export const SIGHT_TRANSPARENT = /^military[:-]|^nature:water|^nature:ground|^board$|^board:|^ground:|^fringe:water|:wake(:|$)|^pick:|foam|bow-wave|wet-collar|^presentation:/;
/** The widening spiral the apron search falls back on, in metres from admin. */
export const RAID_APRON_SPIRAL_R = Object.freeze([8, 12, 16, 21, 26, 32, 38]);
/** Sixteen compass points, for finding which way "inboard" is. */
export const RAID_COMPASS_16 = Object.freeze(
  Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return Object.freeze([+Math.cos(a).toFixed(6), +Math.sin(a).toFixed(6)]);
  }),
);
/**
 * The direction to walk to get clear of `open` (the compass indices that came
 * back as water or nothing): the sum of the blocked bearings, reversed. Pure,
 * so the walk can be asserted without a scene.
 */
export function inboardDirection(open, compass = RAID_COMPASS_16) {
  let x = 0;
  let z = 0;
  for (const i of open) {
    const v = compass[i % compass.length];
    x -= v[0];
    z -= v[1];
  }
  const len = Math.hypot(x, z);
  if (!(len > 1e-6)) return null;
  return [x / len, z / len];
}
export const RAID_APRON_CANDIDATES = Object.freeze([
  Object.freeze([-14, 7.2]),
  Object.freeze([-10, 2.0]),
  Object.freeze([-6, 10.0]),
  Object.freeze([-2, 4.0]),
  Object.freeze([-18, 12.0]),
  Object.freeze([2, 12.0]),
  Object.freeze([-22, 2.0]),
  Object.freeze([6, 6.0]),
  Object.freeze([-8, 18.0]),
  Object.freeze([10, 16.0]),
  Object.freeze([-26, 16.0]),
  Object.freeze([14, 4.0]),
]);
export const RAID_SPEED_MPS = 22;
export const SWARM_PER_STRENGTH = 3;
export const SEA_SKIFF_COUNT = 3;
/**
 * MC2 F2 — the skiff echelon. `SKIFF_AXIS_XZ` is the line they sit on; the
 * seafight camera derives its azimuth from that line so the three hulls always
 * spread across the frame instead of stacking down the view axis.
 */
export const SKIFF_AXIS_XZ = Object.freeze([0.944, 0.330]);
export const SKIFF_BASE_XZ = Object.freeze([-2, 21]);
export const SKIFF_STEP_M = 15.5;
export const SKIFF_STAGGER_M = 4.2;
/** MC2 F5 — the navy hull must not eat more than this share of frame width. */
export const SEA_HULL_FRAME_SHARE = 0.45;

/** M7 item 1 — the blown-soot mask: a multiply stamp, feathered to nothing. */
const SOOT_STAMP = makeMultiplyStamp(
  64,
  [RAID_SOOT_FLOOR, RAID_SOOT_FLOOR + 0.02, RAID_SOOT_FLOOR + 0.05],
  0.62,
);
const SOOT_GEOM = new THREE.PlaneGeometry(1, 1);
const EMBER_GEOM = new THREE.SphereGeometry(1, 5, 4);
// One horizontal sheet keeps the alpha-feathered foam honest: a shallow box
// exposed four opaque side faces at the close raid angle and read as a decal.
const RAID_FOAM_GEOM = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/* ================================================================== *
 * P14 M10 ITEM 4 — THE APRON AT PLAY SCALE.
 *
 * MC5 pack-a, 3/10: "ground/water mip-filter into undifferentiated soup with no
 * PBR response." Three separate things were measured at the raid pose
 * (`shots-v56/M10-probe.json` Q3) before anything was written, and only two of
 * them are this lane's:
 *
 *   1. THE DECAL FILTERING WAS WRONG, and it is ours. Every `DataTexture` in
 *      `units.js` and here defaulted to `NearestFilter` on both filters with no
 *      mip chain — three's documented default. Fixed at the source in
 *      `units.js: groundStamp`, which every stamp now passes through.
 *   2. THE APRON ITSELF CARRIES NO MAP. The deck under the raid is
 *      `fringe:port-terminal` (the probe names it), a flat `MeshPhysicalMaterial`
 *      with no colour, roughness or normal map at all, in another lane's file.
 *      Anisotropy is moot on a material with nothing to filter, and the 218
 *      mapped materials within 70 m of the apron already run trilinear at
 *      anisotropy 4-8 of a device maximum of 16. So the "soup" is not a sampler
 *      setting on the deck: it is an untextured deck.
 *      What this lane can put on it without writing `port.js` is a DECAL, and
 *      that is `military:raid:apron-grain`: a multiply-blended aggregate over
 *      the raid's own clear radius, feathered to no change at its rim, drawn
 *      UNDER the scorch and the soot so both keep their edges.
 *   3. THE DOF IS NOT THE CAUSE. `uMaxCoc` measures 1.4769 px at this pose and
 *      the shader early-outs below 0.75, so the post chain can blur the apron by
 *      at most a pixel and a half. `post.js` is out of bounds and did not need
 *      to be in bounds.
 * ================================================================== */
/*
 * THE SIZE IS DERIVED FROM THE POSE, NOT CHOSEN. The first cut laid a 26 m
 * radius — a 52 m square — and at the raid pose that projects to 2,065 x 1,493
 * px, 129 % of frame width, so a 256-texel map ran at 8 px per texel and its
 * finest term landed at a 43 px cycle. Measured on the A/B, it darkened the
 * crop by 7.2 luma and moved the local detail the WRONG way (mean |high-pass|
 * 1.935 -> 1.880): a broad tint, not a surface. It also reached past the deck
 * and multiplied the sea.
 *
 * `military:raid:scorch` measures 249 px for its 7.2 m diameter at this pose,
 * i.e. **34.6 px per metre**. A 15 m radius is 30 m across — inside the port's
 * own 202 x 37 m deck, and covering `RAID_APRON_CLEAR_R` (11.6 m) with margin —
 * and at 512 texels that is 2.0 px per texel, so the map is MAGNIFIED on screen
 * and its detail survives the sampler entirely.
 */
export const RAID_GRAIN_R = 15;
/** How dark the aggregate gets at its strongest. A multiply, so 1 = no change. */
export const RAID_GRAIN_FLOOR = 0.80;
export const RAID_GRAIN_LIFT_M = 0.055;
/** Concrete bays across the decal. 30 m / 9 is a 3.3 m bay, ~115 px at the pose. */
export const RAID_GRAIN_BAYS = 9;
/** Deterministic value noise on a hashed lattice. No RNG in this file. */
export function grainNoise2(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const at = (i, j) => hash01(((i * 73856093) ^ (j * 19349663) ^ (seed * 83492791)) >>> 8);
  const a = at(x0, y0);
  const b = at(x0 + 1, y0);
  const c = at(x0, y0 + 1);
  const d = at(x0 + 1, y0 + 1);
  const top = a + (b - a) * sx;
  const bot = c + (d - c) * sx;
  return top + (bot - top) * sy;
}
/**
 * A container apron, as a multiply: cast concrete BAYS with darker joints, a
 * per-bay tone, a mottle of wear across them and a fine aggregate speckle,
 * cool-biased the way wet apron concrete is, ramped to 1.0 (no change) over the
 * outer fifth of the radius so the decal has no boundary anywhere.
 *
 * The bay grid is the term that carries the read. A 3.3 m bay is 115 px at the
 * raid pose and a 0.07 m joint is 2.4 px — both above the sampler's reach,
 * which the fine noise alone was not.
 */
export function makeGrainStamp(size = 512, seed = 7) {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) * 0.5;
  const bays = RAID_GRAIN_BAYS;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      // Which bay, and how close to its joint.
      const bx = Math.floor(u * bays);
      const by = Math.floor(v * bays);
      const fx = u * bays - bx;
      const fy = v * bays - by;
      const jd = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy));
      // A pour joint is a groove: dark on its own line, gone within 3 % of a bay.
      const joint = 1 - Math.min(1, jd / 0.035);
      // Each bay was poured on a different day.
      const bayTone = grainNoise2(bx + 0.5, by + 0.5, seed + 5);
      const stain = grainNoise2(u * 3.4, v * 3.4, seed);
      const mottle = grainNoise2(u * 17.0 + 5.5, v * 17.0 + 2.1, seed + 1);
      const grit = grainNoise2(u * 71.0 + 11.7, v * 71.0 + 3.3, seed + 2);
      const n = bayTone * 0.30 + stain * 0.26 + mottle * 0.26 + grit * 0.18;
      const r = Math.min(1, Math.hypot((x - c) / c, (y - c) / c));
      const k = Math.min(1, Math.max(0, (1 - r) / 0.20));
      const edge = k * k * (3 - 2 * k);
      // n in [0,1] -> factor in [FLOOR, 1]; the joint takes it below the floor
      // on its own line only; then everything feathers back to 1 at the rim.
      const base = RAID_GRAIN_FLOOR + (1 - RAID_GRAIN_FLOOR) * n;
      const withJoint = base * (1 - joint * 0.16);
      const f = 1 - (1 - withJoint) * edge;
      const i = (y * size + x) * 4;
      data[i] = Math.round(255 * f);
      data[i + 1] = Math.round(255 * Math.min(1, f + (1 - f) * 0.10));
      data[i + 2] = Math.round(255 * Math.min(1, f + (1 - f) * 0.28));
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return groundStamp(tex);
}
const GRAIN_STAMP = makeGrainStamp(512, 7);
const GRAIN_GEOM = new THREE.PlaneGeometry(1, 1);
const GRAIN_MAT = new THREE.MeshBasicMaterial({
  map: GRAIN_STAMP,
  transparent: true,
  opacity: 1,
  blending: THREE.MultiplyBlending,
  premultipliedAlpha: true,
  depthWrite: false,
  depthTest: true,
  toneMapped: false,
  side: THREE.DoubleSide,
});

/* ------------------------------------------------------------------ *
 * P14 M9 item 4 — THE SCORCH IS A BURN, NOT AN 18-GON PLATE.
 *
 * What it was: `new THREE.CircleGeometry(RAID_SCORCH_R, 18)` in an OPAQUE lit
 * `MeshStandardMaterial` at #1a120c, `receiveShadow` on. Three faults in one
 * object, and all three are visible in `M8-wip-raid-t8`:
 *   the SILHOUETTE is a regular polygon with eighteen straight edges, which at
 *   the raid pose is about 250 px across and reads as a drawn ellipse;
 *   the VALUE is painted rather than multiplied, so the apron's own coping,
 *   lane paint and expansion joints all disappear under it — the burn hides
 *   the deck instead of darkening it;
 *   and it CATCHES THE KEY, because a lit near-black surface still returns a
 *   specular lobe, which is why the disc has a sheen along its up-sun side.
 *
 * What it is now: two vertex-coloured multiply rings on a BROKEN radius. Every
 * station's outer radius is displaced by two incommensurate seeded terms, so
 * the boundary walks in and out by up to 28 % of the radius; the inner ring
 * holds the burn at `RAID_SCORCH_FLOOR` and the outer ring ramps it to white,
 * i.e. to no change at all, so there is no edge anywhere on it. The apron's own
 * markings survive inside the burn at a lower level, which is what a burn does.
 * ------------------------------------------------------------------ */
/**
 * How far off the deck a raid contact stamp sits. The M8 probe's height scan
 * under the roster tank found six distinct surfaces inside 16 m, the highest at
 * y 0.441, and a stamp under one of them is discarded by the depth test — which
 * is why `PRINT_LIFT_M` is 0.075 rather than the 0.018 M6 used. The apron deck
 * the raid now lands on tops out at y 0.452 against a 0.020 road, so the raid's
 * own stamps get the same clearance the units' prints get.
 */
export const RAID_DEBRIS_CONTACT_LIFT_M = 0.075;
/** Darkest multiply the burn applies. 0.40 on a 147-luma apron is luma 59. */
export const RAID_SCORCH_FLOOR = 0.40;
/** Fraction of the radius the burn holds before it starts letting go. */
export const RAID_SCORCH_HOLD = 0.52;
/** Peak-to-peak swing of the broken boundary, as a fraction of the radius. */
export const RAID_SCORCH_BREAK = 0.28;
/** Stations round the burn. 44 at 3.6 m is a 0.51 m step — under a pixel. */
export const RAID_SCORCH_STATIONS = 44;
/** The broken outer radius at perimeter parameter `u`, in units of R. */
export function scorchEdgeAt(u, seed = 13) {
  const a = Math.sin(u * Math.PI * 2 * 3.0 + seed * 0.7);
  const b = Math.sin(u * Math.PI * 2 * 7.0 + seed * 1.9);
  const c = Math.sin(u * Math.PI * 2 * 13.0 + seed * 0.31);
  const n = (a * 0.5 + b * 0.34 + c * 0.16);
  return 1 - RAID_SCORCH_BREAK * (0.5 - n * 0.5);
}
function scorchRing(r0Fn, r1Fn, colIn, colOut, y, mat) {
  const n = RAID_SCORCH_STATIONS;
  const inner = [];
  const outer = [];
  for (let i = 0; i < n; i += 1) {
    const u = i / n;
    const th = u * Math.PI * 2;
    const cx = Math.cos(th);
    const cz = Math.sin(th);
    inner.push([cx * r0Fn(u), cz * r0Fn(u)]);
    outer.push([cx * r1Fn(u), cz * r1Fn(u)]);
  }
  return planRingMesh(inner, outer, colIn, colOut, y, mat, 3);
}
/**
 * The burn, as a group of two multiply rings on the ground plane. `radius` is
 * the mean outer radius; the boundary is broken about it.
 */
export function addScorchDecal(parent, radius, name, seed = 13) {
  const g = new THREE.Group();
  g.name = name;
  g.userData.contactStamp = true;
  noPick(g);
  // Its OWN material instance, not the shared water shade. The facility-damage
  // repair fade walks its group and writes `opacity`, and the shared multiply
  // is on every hull collar in the venue — one repair would have faded the
  // wetted band under every ship in the port.
  const mat = waterShadeMaterial().clone();
  mat.userData.scorchDecal = true;
  const f = RAID_SCORCH_FLOOR;
  // Cool-biased, the same way the track prints are: soot on wet concrete reads
  // bluer than the concrete round it.
  const core = [f, f + 0.015, f + 0.045];
  const hold = RAID_SCORCH_HOLD;
  const edge = (u) => scorchEdgeAt(u, seed) * radius;
  const inner = (u) => Math.max(0.04, edge(u) * hold);
  const tintAt = (i) => {
    // The burn is not one value: it is deepest where the fireball sat and
    // patchier out towards the rim.
    const m = 0.94 + 0.06 * Math.cos((i / RAID_SCORCH_STATIONS) * Math.PI * 6 + seed);
    return [core[0] * m, core[1] * m, core[2] * m];
  };
  const a = scorchRing(() => 0.05, inner, tintAt, tintAt, 0, mat);
  const b = scorchRing(inner, edge, tintAt, () => [1, 1, 1], 0, mat);
  a.userData.ownsMaterial = true;
  g.add(a);
  g.add(b);
  parent.add(g);
  return g;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _seaBox = new THREE.Box3();

/** Centroid of `pts` plus the half-width that contains them, with a margin. */
export function focusFit(pts, margin = 0) {
  if (!pts?.length) return { x: 0, z: 0, spread: margin };
  let sx = 0;
  let sz = 0;
  for (const [x, z] of pts) {
    sx += x;
    sz += z;
  }
  const cx = sx / pts.length;
  const cz = sz / pts.length;
  let spread = 0;
  for (const [x, z] of pts) {
    const d = Math.hypot(x - cx, z - cz);
    if (d > spread) spread = d;
  }
  return { x: cx, z: cz, spread: spread + margin };
}

/** Of `deg` and `deg + 180`, the one nearer `prefer`. Both look across the axis. */
export function pickAzimuth(deg, prefer) {
  const wrap = (v) => ((v % 360) + 360) % 360;
  const gap = (v) => {
    const d = Math.abs(wrap(v) - wrap(prefer));
    return d > 180 ? 360 - d : d;
  };
  const a = wrap(deg);
  const b = wrap(deg + 180);
  return gap(a) <= gap(b) ? a : b;
}

/* MC3 F1 — the combat camera's occlusion machinery lives beside
 * `militaryCameraPose` in `units.js` (attacks.js already imports that module, so
 * defining it here would close an import cycle). Re-exported so the combat seat
 * can reach it from the file the combat lives in. */
export {
  chooseClearPose,
  clearPoseCandidates,
  collectSightOccluders,
  orbitEye,
  segmentHitsBox,
  sightIgnored,
  SIGHT_AZ_STEPS,
  SIGHT_DIST_STEPS,
  SIGHT_IGNORE,
  SIGHT_POLAR_MAX,
  SIGHT_POLAR_STEPS,
} from './units.js';

export function kit() {
  return {
    body: std('#1a1210', { roughness: 0.48, metalness: 0.22 }),
    red: std('#8a1c18', { roughness: 0.46, metalness: 0.14 }),
    rotor: std('#2a1c1c', { roughness: 0.4, metalness: 0.18 }),
    rotorBlur: new THREE.MeshStandardMaterial({
      color: 0xb8bcc4, roughness: 0.5, metalness: 0.1,
      transparent: true, opacity: 0.42, depthWrite: false,
    }),
    tracer: new THREE.MeshBasicMaterial({
      color: 0xffc070, toneMapped: false, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
    flash: new THREE.MeshStandardMaterial({
      color: 0xfff0c0, emissive: 0xffe080, emissiveIntensity: 8,
      toneMapped: false, roughness: 0.25,
    }),
    flashAdd: new THREE.MeshBasicMaterial({
      color: 0xfff4c0, toneMapped: false, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
    // MC3 F9 — the smoke sits BEHIND the actor cluster in depth. It stops
    // writing depth, so an airframe drawn after it still passes the depth test
    // and reads through the column instead of being swallowed by it.
    smoke: new THREE.MeshStandardMaterial({
      color: RAID_SMOKE_HEX, roughness: 0.96, metalness: 0.02,
      transparent: true, opacity: 0.58, depthWrite: false,
    }),
    smokeTrail: new THREE.MeshStandardMaterial({
      color: 0x3a3834, roughness: 0.94, metalness: 0.02,
      transparent: true, opacity: 0.55, depthWrite: false,
    }),
    // M7 item 1 — unlit, so the key cannot wash the column out. A lit dark
    // grey over bright water is a pale grey; an unlit dark grey is smoke.
    // M8 — these two are now the column's PALETTE rather than its materials:
    // `addSmokeColumn` reads their colours and builds one `SpriteMaterial` per
    // puff, because a soft-alpha billow needs a per-billow opacity (a plume
    // thins as it rises) and a shared material cannot carry one.
    smokeCore: new THREE.MeshBasicMaterial({
      color: RAID_SMOKE_CORE_HEX,
      transparent: true, opacity: RAID_SMOKE_CORE_OPACITY, depthWrite: false,
    }),
    smokeRim: new THREE.MeshBasicMaterial({
      color: RAID_SMOKE_RIM_HEX,
      transparent: true, opacity: RAID_RIM_OPACITY, depthWrite: false,
    }),
    ember: new THREE.MeshBasicMaterial({
      color: 0xff9a3c, toneMapped: false, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
    // The soot fan darkens the apron it is blown across rather than painting a
    // fixed hue on it — the same multiply discipline as the contact prints.
    soot: new THREE.MeshBasicMaterial({
      map: SOOT_STAMP,
      transparent: true, opacity: 1,
      blending: THREE.MultiplyBlending, premultipliedAlpha: true,
      depthWrite: false, depthTest: true, toneMapped: false,
      side: THREE.DoubleSide,
    }),
    scorch: new THREE.MeshStandardMaterial({
      color: 0x1a120c, roughness: 0.96, metalness: 0.02,
    }),
    fire: new THREE.MeshStandardMaterial({
      color: 0xff6a18, emissive: 0xff4a10, emissiveIntensity: 3.6,
      roughness: 0.4, toneMapped: false,
    }),
    navRed: new THREE.MeshStandardMaterial({
      color: 0xff3030, emissive: 0xff1010, emissiveIntensity: 3.2,
      roughness: 0.3, toneMapped: false,
    }),
    navBlue: new THREE.MeshStandardMaterial({
      color: 0x80d0ff, emissive: 0x2088ff, emissiveIntensity: 2.8,
      roughness: 0.3, toneMapped: false,
    }),
    // MC3 F9 — the top deck plates are what the raid camera looks at. Both
    // sides read at a value far off the smoke, and the side identity moves to a
    // chevron on the plate rather than the plate itself.
    attackerPlate: std(RAID_ATTACKER_PLATE_HEX, { roughness: 0.44, metalness: 0.14 }),
    interceptorPlate: std(RAID_INTERCEPTOR_PLATE_HEX, { roughness: 0.42, metalness: 0.16 }),
    pale: std('#e8e0c4', { roughness: 0.42, metalness: 0.16 }),
    paleStripe: std('#f0c24a', { roughness: 0.46, metalness: 0.1 }),
    wreck: std('#2a2420', { roughness: 0.86, metalness: 0.08 }),
    skiff: std('#48515a', {
      roughness: HULL_WEATHER.paintedRough,
      metalness: 0.10,
      roughnessMap: hullWearMap(),
    }),
    skiffDeck: std('#303832', { roughness: 0.94, metalness: 0.02 }),
    skiffBoot: std('#171d22', { roughness: 0.88, metalness: 0.04 }),
    skiffSalt: new THREE.MeshStandardMaterial({
      color: 0xd7dcda, roughness: 0.96, metalness: 0,
      transparent: true, opacity: 0.24, depthWrite: false,
    }),
    skiffRust: new THREE.MeshStandardMaterial({
      color: 0x6b361c, roughness: 0.98, metalness: 0,
      transparent: true, opacity: 0.58, depthWrite: false,
    }),
    skiffDraft: std('#d8d9d2', { roughness: 0.82, metalness: 0.02 }),
    pennant: std('#a82820', { roughness: 0.48, metalness: 0.06 }),
    boom: new THREE.MeshBasicMaterial({
      color: 0xff7a20, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false,
    }),
    scaffold: std('#c9a21a', { roughness: 0.5, metalness: 0.12 }),
    vest: std('#e07020', { roughness: 0.6, metalness: 0.04 }),
    foam: new THREE.MeshStandardMaterial({
      color: 0xe8f2f6, roughness: 0.82, metalness: 0.04,
    }),
    /*
     * P14 M11 item 5. Wet stone is not a different COLOUR, it is a different
     * ROUGHNESS: the wall over it runs about 0.9 and returns nothing, this
     * runs 0.20 and picks up the sky, which is the whole read. A touch darker
     * as well, because a wet surface absorbs more of what falls on it.
     */
    pierWet: std('#2b3138', { roughness: 0.20, metalness: 0.06 }),
    /*
     * Contact foam, additive so it can never print as a plate over the water,
     * `toneMapped` off so it rolls through the post chain like light. The
     * seeded puff alpha feathers every patch; `foamGapAt` breaks the quay run.
     */
    quayFoam: new THREE.MeshBasicMaterial({
      color: 0xdfeaf0,
      transparent: true,
      opacity: 0.38,
      // `PUFF_TEX` carries its falloff in RGBA alpha; `alphaMap` samples the
      // green channel and would therefore turn this white texture into a box.
      map: PUFF_TEX[0],
      alphaTest: 0.025,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
    wake: std('#d0d8de', { roughness: 0.7, metalness: 0.04 }),
    crew: std('#3a2a24', { roughness: 0.7, metalness: 0.04 }),
  };
}

export function swarmCount(strength) {
  const n = Number.isInteger(strength) ? strength : 1;
  return Math.max(3, Math.min(9, SWARM_PER_STRENGTH * Math.max(1, Math.min(3, n))));
}

export function leftoverAttackers(strength, interceptors) {
  const s = Number.isInteger(strength) ? strength : 0;
  const n = Array.isArray(interceptors) ? interceptors.length : Number(interceptors) || 0;
  return Math.max(0, s - n);
}

export function bassSeaFightEligible(row) {
  if (!row) return false;
  const kind = row.kind ?? row.cause;
  const bass = row.basinId === 'bass' || row.targetBook?.includes?.('hobart')
    || row.book === 'beer-hobart-melbourne';
  const strike = row.cause === 'threat-strike' || row.type === 'threat-repelled'
    || row.type === 'threat-loss' || row.outcome === 'repelled' || row.outcome === 'loss';
  return (kind === 'pirates' || row.kind === 'pirates') && bass && strike;
}

function hash01(seed) {
  let n = (Math.imul((seed >>> 0) + 1, 0x45d9f3b) >>> 0);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b) >>> 0;
  return n / 4294967296;
}

/* ------------------------------------------------------------------ *
 * M8 item 1 — the alpha profile that makes a sprite read as smoke.
 *
 * Two functions, both pure, so the edge law can be asserted in a unit test
 * without a renderer and the texture is byte-identical on every machine.
 *
 * `valueNoise2` is lattice value noise with a smoothstep interpolant, seeded
 * off the same `hash01` the rest of this lane uses — there is no RNG anywhere
 * in this file and there is not one here either.
 *
 * `smokeAlphaAt` is the profile itself. The noise does not tint the sprite, it
 * DISPLACES ITS EDGE: `edge` is where the falloff starts, and it moves in and
 * out by up to 0.23 of the radius as you walk round the disc. That is what
 * breaks the circle. Everything past `edge` ramps to zero over the rest of the
 * radius through a smoothstep, so the alpha gradient is spread over 15-60 % of
 * the sprite instead of over the one pixel a sphere's silhouette gives you.
 * ------------------------------------------------------------------ */
export function valueNoise2(x, y, freq, seed = 0) {
  const fx = x * freq;
  const fy = y * freq;
  const xi = Math.floor(fx);
  const yi = Math.floor(fy);
  const xf = fx - xi;
  const yf = fy - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const at = (a, b) => hash01(seed + (a & 1023) * 1741 + (b & 1023) * 3671);
  const n00 = at(xi, yi);
  const n10 = at(xi + 1, yi);
  const n01 = at(xi, yi + 1);
  const n11 = at(xi + 1, yi + 1);
  const a = n00 + (n10 - n00) * sx;
  const b = n01 + (n11 - n01) * sx;
  return a + (b - a) * sy;
}
/** How far in from the rim the falloff starts, at its narrowest and widest. */
export const SMOKE_EDGE_MID = 0.62;
export const SMOKE_EDGE_SWING = 0.22;
export function smokeAlphaAt(dx, dy, seed = 0) {
  const r = Math.hypot(dx, dy);
  if (r >= 1) return 0;
  const u = dx * 0.5 + 0.5;
  const v = dy * 0.5 + 0.5;
  const n = valueNoise2(u, v, 3, seed) * 0.62 + valueNoise2(u, v, 7, seed + 37) * 0.38;
  const edge = SMOKE_EDGE_MID + (n - 0.5) * 2 * SMOKE_EDGE_SWING;
  if (r >= 1) return 0;
  const k = r <= edge ? 1 : Math.max(0, 1 - (r - edge) / Math.max(1e-4, 1 - edge));
  const soft = k * k * (3 - 2 * k);
  // The density term keeps the middle from being a flat plate: the same noise
  // that moves the edge also mottles the body, so overlapping billows do not
  // stack into one even grey.
  return soft * (0.66 + 0.34 * n);
}
export const SMOKE_PUFF_SIZE = 96;
/** A soft-alpha puff with its lit and shadow sides baked into the RGB map. */
export function makeSmokePuff(size = SMOKE_PUFF_SIZE, seed = 0) {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) * 0.5;
  const shadow = [0x26, 0x28, 0x2d];
  const light = [0xde, 0xd0, 0xb6];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const a = smokeAlphaAt(dx, dy, seed);
      // One sprite carries both sides of the puff. Rotation points this warm
      // shoulder toward the key; the opposite half remains the smoke shadow.
      const shoulder = clamp01((0.34 - dx + dy * 0.12) / 1.18);
      const lit = shoulder * shoulder * (3 - 2 * shoulder);
      data[i] = Math.round(shadow[0] + (light[0] - shadow[0]) * lit);
      data[i + 1] = Math.round(shadow[1] + (light[1] - shadow[1]) * lit);
      data[i + 2] = Math.round(shadow[2] + (light[2] - shadow[2]) * lit);
      data[i + 3] = Math.round(255 * a);
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  // M10 item 4 — was `LinearFilter` on the min filter with no mip chain, so a
  // 96 px puff minified to 30 px on screen sampled one texel in ten and the
  // column's edge crawled between frames. `groundStamp` is the one place the
  // sampler for every decal in this lane is decided.
  return groundStamp(tex);
}
/** Three seeded puffs, so no two billows in a stack share a silhouette. */
const PUFF_TEX = [makeSmokePuff(SMOKE_PUFF_SIZE, 3), makeSmokePuff(SMOKE_PUFF_SIZE, 91),
  makeSmokePuff(SMOKE_PUFF_SIZE, 617)];

/**
 * M7 item 2 — deterministic sample points across the port's own footprint,
 * nearest `near` first. `RAID_APRON_GRID` is the number of samples a side; the
 * box is inset so the samples sit on deck rather than on the quay edge or on
 * the water past it. Pure apart from the world box it is handed.
 */
export const RAID_APRON_GRID = 19;
/** M8 — the deck's own grid. Its box is 202 x 37 m, so it can be denser. */
export const RAID_APRON_DECK_GRID = 25;
export const RAID_APRON_GRID_INSET = 0.10;
/** The grid is clipped to this radius of the raid's own target before sorting. */
export const RAID_APRON_GRID_REACH_M = 130;
export function apronGridPoints(box, near, n = RAID_APRON_GRID, inset = RAID_APRON_GRID_INSET) {
  if (!box || !Number.isFinite(box.minX) || !Number.isFinite(box.maxX)) return [];
  const spanX = box.maxX - box.minX;
  const spanZ = box.maxZ - box.minZ;
  if (!(spanX > 1) || !(spanZ > 1)) return [];
  const x0 = box.minX + spanX * inset;
  const z0 = box.minZ + spanZ * inset;
  const dx = (spanX * (1 - 2 * inset)) / Math.max(1, n - 1);
  const dz = (spanZ * (1 - 2 * inset)) / Math.max(1, n - 1);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const x = x0 + dx * i;
      const z = z0 + dz * j;
      out.push({ x, y: 0.14, z, d2: ((x - near.x) ** 2) + ((z - near.z) ** 2) });
    }
  }
  // Nearest the raid's own target first, then a stable tie-break on position,
  // so the same layout always produces the same crash site. Points more than
  // `RAID_APRON_GRID_REACH_M` away are dropped: `fringe:port` includes the
  // harbour and the breakwater, so its box is 1300 x 750 m and most of the grid
  // is open water a quarter of a board away from the raid.
  const reach2 = RAID_APRON_GRID_REACH_M * RAID_APRON_GRID_REACH_M;
  out.sort((a, b) => (a.d2 - b.d2) || (a.x - b.x) || (a.z - b.z));
  return out.filter((p) => p.d2 <= reach2);
}
/**
 * NaN-safe world box. `Box3.setFromObject` poisons the whole box if any child
 * carries a NaN vertex, and this scene has four of them (the standing
 * `computeBoundingSphere(): radius is NaN` warnings M3 first logged). One bad
 * mesh under `fringe:port` therefore returned an unusable box and the grid came
 * back empty with nothing to say about it.
 */
function safeWorldBoxXZ(root) {
  root.updateWorldMatrix?.(true, true);
  const b = new THREE.Box3();
  const out = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, n: 0 };
  root.traverse((ch) => {
    if (!ch.isMesh || !ch.geometry || ch.visible === false) return;
    if (!ch.geometry.boundingBox) ch.geometry.computeBoundingBox();
    const bb = ch.geometry.boundingBox;
    if (!bb || !Number.isFinite(bb.min.x) || !Number.isFinite(bb.max.x)) return;
    b.copy(bb).applyMatrix4(ch.matrixWorld);
    if (!Number.isFinite(b.min.x) || !Number.isFinite(b.max.z)) return;
    if (b.min.x < out.minX) out.minX = b.min.x;
    if (b.max.x > out.maxX) out.maxX = b.max.x;
    if (b.min.z < out.minZ) out.minZ = b.min.z;
    if (b.max.z > out.maxZ) out.maxZ = b.max.z;
    out.n += 1;
  });
  return out.n ? out : null;
}
/* ------------------------------------------------------------------ *
 * M8 item 2 — the apron is reachable. It was never the water.
 *
 * M7 concluded that `fringe:port` ground was unreachable because "the apron is
 * at deck zero with the bay's foam and ocean planes drawn a few centimetres
 * over the top of it", and built a water-tolerance rule on that reading. The
 * reading was wrong and the M8 probe says so with two numbers:
 *
 *   - The apron deck slab under `fringe:port-terminal` spans world
 *     x[66.9, 268.9] z[-38.5, -1.9] with its **top face at y 0.452**. The
 *     ocean plane the probe kept returning is at **y 0.02** — 43 cm BELOW it.
 *     The water is not over the apron; the apron is simply not in the hit list.
 *   - `fringe:port` carries **8,236 meshes and 8,124 of them have had
 *     `raycast` replaced with a no-op** by `noPick` (kit.js line 8, called from
 *     `addSlab` on every slab in the port). A scene raycast cannot hit the port
 *     at all. `solidUnder` was never going to find it, at any tolerance.
 *
 * So the apron is sampled by NAME instead of by scene raycast: collect the flat
 * wide slabs under the port's named deck subtrees, and intersect them with the
 * shared `Mesh.prototype.raycast` called directly — which is the method
 * `noPick` shadowed, not removed. Nothing in `fringe/**` is touched and no
 * mesh's own `raycast` is restored; the picking behaviour the rest of the game
 * depends on is exactly as it was.
 * ------------------------------------------------------------------ */
/** The named subtrees a raid may land on. */
export const RAID_APRON_DECK_NAMES = Object.freeze([
  'fringe:port-terminal', 'fringe:port-roads', 'fringe:port-yard',
  'fringe:port-zone:container', 'fringe:port-zone:oil',
]);
/** A deck candidate has to be at least this many square metres of flat top. */
export const RAID_APRON_DECK_MIN_AREA = 300;
/** And its top face has to sit in the band an apron can occupy. */
export const RAID_APRON_DECK_MIN_Y = 0.05;
/** How far above the deck the sampling ray starts. */
export const RAID_APRON_RAY_TOP_M = 30;
const _meshRaycast = THREE.Mesh.prototype.raycast;
/**
 * The port's own deck slabs, as `{ mesh, top, box }`. Pure apart from the
 * scene graph it walks; the caller caches it for a whole crash-site search.
 */
export function collectApronDecks(port, names = RAID_APRON_DECK_NAMES) {
  if (!port?.traverse) return [];
  const roots = [];
  for (const nm of names) {
    const o = port.getObjectByName?.(nm) ?? (port.name === nm ? port : null);
    if (o) roots.push(o);
  }
  if (!roots.length) return [];
  const out = [];
  const seen = new Set();
  const b = new THREE.Box3();
  for (const root of roots) {
    root.updateWorldMatrix?.(true, true);
    root.traverse((c) => {
      if (!c.isMesh || !c.geometry || c.visible === false) return;
      if (seen.has(c)) return;
      seen.add(c);
      if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
      const bb = c.geometry.boundingBox;
      if (!bb || !Number.isFinite(bb.min.x) || !Number.isFinite(bb.max.y)) return;
      b.copy(bb).applyMatrix4(c.matrixWorld);
      if (!Number.isFinite(b.min.x) || !Number.isFinite(b.max.z)) return;
      const top = b.max.y;
      if (top > RAID_APRON_MAX_Y || top < RAID_APRON_DECK_MIN_Y) return;
      const area = (b.max.x - b.min.x) * (b.max.z - b.min.z);
      if (area < RAID_APRON_DECK_MIN_AREA) return;
      out.push({
        mesh: c,
        top,
        area,
        box: { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z },
      });
    });
  }
  out.sort((p, q) => q.area - p.area);
  return out;
}
/** The XZ box the collected decks between them cover. */
export function apronDeckBox(decks) {
  if (!decks?.length) return null;
  const out = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, n: 0 };
  for (const d of decks) {
    if (d.box.minX < out.minX) out.minX = d.box.minX;
    if (d.box.maxX > out.maxX) out.maxX = d.box.maxX;
    if (d.box.minZ < out.minZ) out.minZ = d.box.minZ;
    if (d.box.maxZ > out.maxZ) out.maxZ = d.box.maxZ;
    out.n += 1;
  }
  return out.n ? out : null;
}
/**
 * Straight down onto the named decks, from `RAID_APRON_RAY_TOP_M` above the
 * tallest one. Returns the deck surface and the named ancestor it belongs to,
 * or null if the point is off the apron.
 */
export function apronUnder(decks, x, z, ray = new THREE.Raycaster()) {
  if (!decks?.length) return null;
  ray.set(
    new THREE.Vector3(x, RAID_APRON_MAX_Y + RAID_APRON_RAY_TOP_M, z),
    new THREE.Vector3(0, -1, 0),
  );
  ray.far = RAID_APRON_RAY_TOP_M + RAID_APRON_MAX_Y + 40;
  let best = null;
  const hits = [];
  for (const d of decks) {
    if (x < d.box.minX || x > d.box.maxX || z < d.box.minZ || z > d.box.maxZ) continue;
    hits.length = 0;
    // `noPick` shadowed `raycast` on the instance; the prototype method it
    // shadowed is still there and is what this calls.
    _meshRaycast.call(d.mesh, ray, hits);
    for (const h of hits) {
      if (h.point.y > RAID_APRON_MAX_Y) continue;
      if (!best || h.point.y > best.y) {
        let node = d.mesh;
        while (node && !node.name) node = node.parent;
        best = { y: h.point.y, name: node?.name ?? 'fringe:port-terminal' };
      }
    }
  }
  return best;
}
/**
 * M8 — the port's tall furniture as world boxes: sheds, cranes, gantries,
 * container stacks, tanks. These are `noPick` like everything else in the port,
 * so a scene raycast walks straight through them and both the sightline test
 * and the crowding test used to call a site behind a shed "open". Boxes are
 * cheap and a shed is a box; a segment test against them is exact enough to
 * choose a camera site with.
 */
export function collectPortBlockers(port, minY = RAID_APRON_CLEAR_SKY_M) {
  if (!port?.traverse) return [];
  const out = [];
  const b = new THREE.Box3();
  port.updateWorldMatrix?.(true, true);
  port.traverse((c) => {
    if (!c.isMesh || !c.geometry || c.visible === false) return;
    if (/^military[:-]/.test(c.name ?? '')) return;
    if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
    const bb = c.geometry.boundingBox;
    if (!bb || !Number.isFinite(bb.min.x) || !Number.isFinite(bb.max.y)) return;
    b.copy(bb).applyMatrix4(c.matrixWorld);
    if (!Number.isFinite(b.min.x) || !Number.isFinite(b.max.z)) return;
    if (b.max.y < minY) return;
    if ((b.max.x - b.min.x) < RAID_BLOCKER_MIN_SPAN_M
      && (b.max.z - b.min.z) < RAID_BLOCKER_MIN_SPAN_M) return;
    out.push({
      minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z,
    });
  });
  return out;
}
function apronGrid(port, near) {
  if (!port || !near) return [];
  // The terminal is the deck; `fringe:port` also carries the harbour, the
  // breakwater and the open water past it.
  const deck = port.getObjectByName?.('fringe:port-terminal') ?? port;
  const box = safeWorldBoxXZ(deck) ?? safeWorldBoxXZ(port);
  if (!box) return [];
  return apronGridPoints(box, near);
}

/* ------------------------------------------------------------------ *
 * M7 item 1 — the column, as data first.
 *
 * `columnBillowPlan` is the shape of the plume: where each billow sits, how
 * wide it is, how far downwind it has been carried by the time it got there,
 * and the seeded wobble that stops four spheres reading as a bead string. Pure
 * and hash-seeded (this lane has no RNG), so the stack can be asserted in a
 * unit test without a renderer, which is how the value gap below is checked.
 * ------------------------------------------------------------------ */
export function columnBillowPlan(seed = 0, n = RAID_COLUMN_BILLOWS, scale = 1) {
  const out = [];
  const count = Math.max(1, n | 0);
  for (let i = 0; i < count; i += 1) {
    const u = count > 1 ? i / (count - 1) : 0;
    const diameter = (RAID_SMOKE_PUFF_START_M
      + (RAID_SMOKE_PUFF_END_M - RAID_SMOKE_PUFF_START_M) * u) * scale;
    out.push({
      i,
      u,
      diameter,
      r: diameter * 0.5,
      y: (0.90 + u * RAID_SMOKE_PUFF_RISE_M) * scale,
      drift: RAID_SMOKE_DRIFT_M * (0.12 + u * 0.88) * scale,
      sway: (hash01(seed + i * 7 + 1) - 0.5) * 1.45 * scale,
      squash: 0.82 + hash01(seed + i * 5 + 3) * 0.20,
      spin: hash01(seed + i * 3 + 5) * Math.PI,
      phase: hash01(seed + i * 11 + 2) * Math.PI * 2,
      alpha: RAID_SMOKE_CORE_OPACITY * (1 - RAID_SMOKE_THIN * u),
      lifeOffset: u * RAID_SMOKE_PUFF_LIFETIME_S,
      tex: i % 3,
    });
  }
  return out;
}

/**
 * M8 — one soft-alpha billow. A `Sprite` faces the camera by construction, so
 * the plume has no silhouette that turns with the orbit and no polygon edge to
 * catch the eye; the whole shape lives in the alpha map.
 */
function addPuff(g, name, tex, hex, opacity, owned) {
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: hex,
    transparent: true,
    opacity: Math.min(0.6, Math.max(0, opacity)),
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    sizeAttenuation: true,
  });
  const s = new THREE.Sprite(mat);
  s.name = name;
  s.userData.ownsMaterial = true;
  s.castShadow = false;
  s.receiveShadow = false;
  s.raycast = () => {};
  owned.push(mat);
  g.add(s);
  return s;
}

/**
 * Build the stack. `keyDir` is the direction toward the sun (unit length); the
 * rim sits on that shoulder of each billow, which is what gives the billow a
 * lit side against its own cool core.
 */
export function addSmokeColumn(parent, mats, name, {
  seed = 0, scale = 1, wind = RAID_WIND_XZ, keyDir = null, rimOpacity = RAID_RIM_OPACITY,
} = {}) {
  const g = new THREE.Group();
  g.name = name;
  const plan = columnBillowPlan(seed, RAID_COLUMN_BILLOWS, scale);
  const owned = [];
  const coreHex = mats.smokeCore?.color?.getHex?.() ?? 0x22242a;
  const rimHex = mats.smokeRim?.color?.getHex?.() ?? 0xc2ac8e;
  // Keep the old semantic trunk/rim/lobe names as non-rendering anchors. The
  // visible effect is exactly eight two-tone sprites, not nineteen overlapping
  // cards that can unite into one pier-wide veil.
  const trunk = new THREE.Object3D();
  trunk.name = `${name}:trunk`;
  trunk.position.set(0, 0.65 * scale, 0);
  g.add(trunk);
  const billows = [];
  const across = [-wind[1], wind[0]];
  const keyAngle = keyDir ? Math.atan2(keyDir.z, keyDir.x) : 0;
  for (const b of plan) {
    const x = wind[0] * b.drift + across[0] * b.sway;
    const z = wind[1] * b.drift + across[1] * b.sway;
    const rim = new THREE.Object3D();
    rim.name = `${name}:rim:${b.i}`;
    rim.position.set(
      x + (keyDir ? keyDir.x * b.r * RAID_RIM_OFFSET : 0),
      b.y + (keyDir ? keyDir.y * b.r * RAID_RIM_OFFSET * 0.7 : 0),
      z + (keyDir ? keyDir.z * b.r * RAID_RIM_OFFSET : 0),
    );
    rim.renderOrder = -2;
    rim.userData.mergedInto = `${name}:core:${b.i}`;
    g.add(rim);
    const core = addPuff(g, `${name}:core:${b.i}`, PUFF_TEX[b.tex], 0xffffff,
      Math.min(RAID_SMOKE_CORE_OPACITY, b.alpha, rimOpacity), owned);
    core.scale.set(b.diameter, b.diameter * b.squash, 1);
    core.position.set(x, b.y, z);
    core.material.rotation = keyAngle;
    core.renderOrder = -1;
    core.userData.twoTone = { shadow: coreHex, light: rimHex };
    const lobe = new THREE.Object3D();
    lobe.name = `${name}:lobe:${b.i}`;
    lobe.userData.mergedInto = core.name;
    lobe.position.copy(core.position);
    g.add(lobe);
    billows.push({
      core,
      rim,
      lobe,
      plan: b,
      across,
      wind,
      keyDir,
      keyAngle,
      scale,
    });
  }
  noPick(g);
  parent.add(g);
  g.userData.billows = billows;
  g.userData.trunk = trunk;
  g.userData.ownedMaterials = owned;
  g.userData.receipt = smokeColumnCensus(g);
  return g;
}

/** Conservative alpha-area receipt over the 64 x 20 m pier audit region. */
export function smokeColumnCensus(g) {
  let sprites = 0;
  let maxAlpha = 0;
  let maxBillboardM = 0;
  let alphaArea = 0;
  g?.traverse?.((node) => {
    if (!node.isSprite || !node.material) return;
    sprites += 1;
    const opacity = Math.min(1, Math.max(0, node.material.opacity ?? 1));
    const width = Math.abs(node.scale.x);
    const height = Math.abs(node.scale.y);
    maxAlpha = Math.max(maxAlpha, opacity);
    maxBillboardM = Math.max(maxBillboardM, width, height);
    alphaArea += width * height * opacity;
  });
  return {
    sprites,
    maxAlpha,
    maxBillboardM,
    pierMeanAlphaUpperBound: alphaArea / RAID_PIER_REGION_M2,
  };
}

/** Aggregate only currently visible raid clusters over the same pier region. */
export function smokeEffectsCensus(groups) {
  const receipt = {
    clusters: 0,
    sprites: 0,
    maxAlpha: 0,
    maxBillboardM: 0,
    pierMeanAlphaUpperBound: 0,
  };
  for (const group of groups ?? []) {
    if (!group || group.visible === false) continue;
    const row = smokeColumnCensus(group);
    receipt.clusters += 1;
    receipt.sprites += row.sprites;
    receipt.maxAlpha = Math.max(receipt.maxAlpha, row.maxAlpha);
    receipt.maxBillboardM = Math.max(receipt.maxBillboardM, row.maxBillboardM);
    receipt.pierMeanAlphaUpperBound += row.pierMeanAlphaUpperBound;
  }
  return receipt;
}

/**
 * Roil: seeded breathing plus a slow rise, and a slow spin on each puff so the
 * noise silhouette turns instead of sitting as a fixed stencil. Skipped
 * entirely under reduced motion.
 */
export function tickSmokeColumn(g, t, reduced = false) {
  const billows = g?.userData?.billows;
  if (!billows) return;
  for (const b of billows) {
    const age = reduced
      ? b.plan.u
      : ((Math.max(0, t) + b.plan.lifeOffset) % RAID_SMOKE_PUFF_LIFETIME_S)
        / RAID_SMOKE_PUFF_LIFETIME_S;
    const eased = reduced ? age : age * age * (3 - 2 * age);
    const diameter = (RAID_SMOKE_PUFF_START_M
      + (RAID_SMOKE_PUFF_END_M - RAID_SMOKE_PUFF_START_M) * eased) * b.scale;
    const drift = RAID_SMOKE_DRIFT_M * (0.12 + age * 0.88) * b.scale;
    const x = b.wind[0] * drift + b.across[0] * b.plan.sway;
    const z = b.wind[1] * drift + b.across[1] * b.plan.sway;
    b.core.scale.set(diameter, diameter * b.plan.squash, 1);
    b.core.position.set(x, (0.90 + age * RAID_SMOKE_PUFF_RISE_M) * b.scale, z);
    b.core.material.opacity = RAID_SMOKE_CORE_OPACITY * (1 - RAID_SMOKE_THIN * age);
    // Keep the baked warm shoulder registered to the key; the alpha/noise
    // silhouette supplies variation without spinning the lighting around it.
    b.core.material.rotation = b.keyAngle;
    b.rim.position.set(
      x + (b.keyDir ? b.keyDir.x * diameter * RAID_RIM_OFFSET * 0.5 : 0),
      b.core.position.y + (b.keyDir ? b.keyDir.y * diameter * RAID_RIM_OFFSET * 0.35 : 0),
      z + (b.keyDir ? b.keyDir.z * diameter * RAID_RIM_OFFSET * 0.5 : 0),
    );
    b.lobe.position.copy(b.core.position);
  }
  g.userData.receipt = smokeColumnCensus(g);
}

/**
 * M14 item 1 — a short-lived trail/hit/blast cluster. Each effect keeps its
 * stable parent name while replacing the old cylinder or high-alpha sphere
 * with six independently feathered, two-tone cards.
 */
export function addRaidPuffCluster(parent, name, {
  seed = 0,
  color = 0xffffff,
  opacity = RAID_EFFECT_MAX_ALPHA,
  spread = 1,
  renderOrder = 7,
} = {}) {
  const g = new THREE.Group();
  g.name = name;
  const owned = [];
  const puffs = [];
  for (let i = 0; i < RAID_EFFECT_PUFFS; i += 1) {
    const puff = addPuff(g, `${name}:puff:${i}`, PUFF_TEX[(seed + i) % PUFF_TEX.length],
      color, opacity * (1 - i * 0.045), owned);
    const angle = hash01(seed + i * 17 + 5) * Math.PI * 2;
    const radius = (0.18 + hash01(seed + i * 11 + 3) * 0.82) * spread;
    const rise = (0.65 + hash01(seed + i * 7 + 9) * 0.75) * spread;
    puff.position.set(Math.cos(angle) * radius * 0.16, 0.12, Math.sin(angle) * radius * 0.16);
    puff.scale.setScalar(RAID_SMOKE_PUFF_START_M);
    puff.renderOrder = renderOrder;
    puff.userData.twoTone = true;
    puffs.push({ puff, angle, radius, rise, opacity: puff.material.opacity });
  }
  noPick(g);
  parent.add(g);
  g.userData.puffs = puffs;
  g.userData.ownedMaterials = owned;
  g.userData.receipt = smokeColumnCensus(g);
  return g;
}

export function tickRaidPuffCluster(g, ageS, lifetimeS, reduced = false) {
  const puffs = g?.userData?.puffs;
  if (!puffs) return;
  const u = clamp01(Math.max(0, ageS) / Math.max(0.001, lifetimeS));
  const eased = u * u * (3 - 2 * u);
  const diameter = reduced
    ? RAID_SMOKE_PUFF_START_M
    : RAID_SMOKE_PUFF_START_M
      + (RAID_SMOKE_PUFF_END_M - RAID_SMOKE_PUFF_START_M) * eased;
  for (const p of puffs) {
    const travel = reduced ? 0.16 : 0.16 + eased * 0.84;
    p.puff.scale.setScalar(diameter);
    p.puff.position.set(
      Math.cos(p.angle) * p.radius * travel,
      reduced ? 0.12 : 0.12 + p.rise * eased,
      Math.sin(p.angle) * p.radius * travel,
    );
    p.puff.material.opacity = p.opacity * (1 - u);
    p.puff.visible = u < 1;
  }
  g.visible = u < 1;
  g.userData.receipt = smokeColumnCensus(g);
}

/** Embers off the burn: seeded, additive, and looping on their own clock. */
export function addEmbers(parent, mats, name, apronY = 0) {
  const g = new THREE.Group();
  g.name = name;
  for (let i = 0; i < RAID_EMBER_COUNT; i += 1) {
    const m = new THREE.Mesh(EMBER_GEOM, mats.ember);
    m.name = `${name}:${i}`;
    m.scale.setScalar(0.11 + hash01(i * 13 + 7) * 0.11);
    m.position.y = apronY;
    m.renderOrder = 7;
    m.castShadow = false;
    noPick(m);
    g.add(m);
  }
  noPick(g);
  parent.add(g);
  return g;
}

export function tickEmbers(g, t, wind = RAID_WIND_XZ, reduced = false) {
  if (!g) return;
  for (let i = 0; i < g.children.length; i += 1) {
    const m = g.children[i];
    const phase = hash01(i * 17 + 3);
    const u = reduced ? 0.42 : ((t * (0.42 + phase * 0.3) + phase) % 1);
    const rise = u * RAID_EMBER_RISE_M;
    const spread = 0.9 + u * 2.6;
    const a = phase * Math.PI * 2;
    m.position.set(
      Math.cos(a) * spread + wind[0] * rise * 0.42,
      0.35 + rise,
      Math.sin(a) * spread + wind[1] * rise * 0.42,
    );
    m.visible = u < 0.92;
  }
}

/**
 * MC2 F9 — a raid actor has to be a body, not four hairline rotor discs. Both
 * sides get a chunky fuselage, a full-width contrast band, a large nav light and
 * an offset tail so heading reads. Attacker = dark body + red; interceptor =
 * pale body + blue.
 */
function addRaidAirframe(parent, mats, name, scale, side) {
  const attacker = side === 'attacker';
  const body = attacker ? mats.body : mats.skiff;
  // MC3 F9 — the plate is the read. It is pale on BOTH sides, because a red
  // plate at luma 51 and smoke at luma 40 are the same mark at raid distance.
  const plate = attacker ? mats.attackerPlate : mats.interceptorPlate;
  const mark = attacker ? mats.red : mats.navBlue;
  const stripe = attacker ? mats.red : mats.paleStripe;
  const lamp = attacker ? mats.navRed : mats.navBlue;
  const g = new THREE.Group();
  g.name = name;
  addBox(g, 0.86 * scale, 0.34 * scale, 1.24 * scale, body, 0, 0.2 * scale, 0);
  // The raid camera looks DOWN on these. What reads is the top face, so the top
  // face is a full-width plate at a value the smoke can never reach, with the
  // side's identity carried by a chevron laid across it.
  const deck = addBox(g, 0.96 * scale, 0.12 * scale, 1.14 * scale, plate, 0, 0.41 * scale, 0.04 * scale);
  deck.name = `${name}:plate`;
  deck.renderOrder = 2;
  addBox(g, 0.62 * scale, 0.04 * scale, 0.20 * scale, mark, 0, 0.48 * scale, 0.24 * scale);
  addBox(g, 0.20 * scale, 0.04 * scale, 0.62 * scale, mark, 0, 0.48 * scale, -0.16 * scale);
  addBox(g, 0.34 * scale, 0.12 * scale, 1.34 * scale, body, 0, 0.49 * scale, 0);
  addBox(g, 0.24 * scale, 0.42 * scale, 0.5 * scale, plate, 0, 0.46 * scale, -0.66 * scale);
  addBox(g, 1.62 * scale, 0.09 * scale, 0.22 * scale, stripe, 0, 0.3 * scale, 0.12 * scale);
  addSphere(g, 0.21 * scale, 7, lamp, 0, 0.58 * scale, 0.22 * scale);
  addSphere(g, 0.15 * scale, 6, lamp, 0, 0.24 * scale, 0.72 * scale);
  for (const [dx, dz] of [[-0.62, -0.55], [0.62, -0.55], [-0.62, 0.55], [0.62, 0.55]]) {
    addBox(g, 0.13 * scale, 0.1 * scale, 0.52 * scale, plate,
      dx * 0.55 * scale, 0.26 * scale, dz * 0.55 * scale);
    addCyl(g, 0.16 * scale, 0.16 * scale, 0.12 * scale, 8, body, dx * scale, 0.3 * scale, dz * scale);
    // Thin, pale discs: a blur, not four dark saucers that swallow the airframe.
    addCyl(g, 0.3 * scale, 0.3 * scale, 0.03 * scale, 10, mats.rotorBlur,
      dx * scale, 0.44 * scale, dz * scale);
  }
  // The actor cluster draws after the smoke so it is never inside it.
  g.traverse((ch) => { if (ch.isMesh && !ch.renderOrder) ch.renderOrder = 2; });
  noPick(g);
  parent.add(g);
  return g;
}

function addAttackDrone(parent, mats, name, scale = 1) {
  return addRaidAirframe(parent, mats, name, scale, 'attacker');
}

function addInterceptorDrone(parent, mats, name, scale = 1) {
  return addRaidAirframe(parent, mats, name, scale, 'interceptor');
}

/**
 * P14 M10 item 1 — the height of the skiff's authored origin over the still
 * sheet. `_tickSea` has parked these boats at y 0.22 since M4 and the whole
 * composition of the seafight frames is built on it, so the ride is expressed
 * as a displacement OF that datum rather than as a new one: at
 * `oceanSurfaceYAt == WATER_Y` the boat returns to 0.22 exactly.
 */
export const SKIFF_FREEBOARD = 0.22 - WATER_Y;
/** Half-length and half-beam of the skiff's own hull box, metres. */
export const SKIFF_HALF_LEN_M = 3.2;
export const SKIFF_HALF_BEAM_M = 1.075;

/** A centred chamfered plate; `chamferBox` itself uses the port slab origin. */
function addSkiffPlate(parent, w, h, d, material, x, y, z, chamfer, name = '') {
  const mesh = new THREE.Mesh(chamferBox(w, h, d, chamfer), material);
  mesh.position.set(x, slabCentreAt(w, h, d, chamfer, y), z);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  noPick(mesh);
  parent.add(mesh);
  return mesh;
}

function addSkiff(parent, mats, name) {
  const g = new THREE.Group();
  g.name = name;
  /*
   * P14 M10 item 1 — the hull hangs off a TILT group, not off `g`.
   *
   * `g` carries the heading (`rotation.y`) and the heave; the tilt carries the
   * pitch and the roll the swell gradient asks for, and the sinking attitude
   * the `repelled` outcome asks for. Keeping them apart is what lets the water
   * decals below stay flat on the sea while the boat works on it — inverting
   * `g`'s own quaternion would cancel the heading with the tilt.
   */
  const tilt = new THREE.Group();
  tilt.name = `${name}:tilt`;
  noPick(tilt);
  g.add(tilt);
  g.userData.tilt = tilt;
  /*
   * M11 item 1 — the skiffs share the warship's material language. The three
   * plates that make their silhouette now have real 60–80 mm edge breaks;
   * the hull carries the same deterministic roughness field, a boot-top and
   * salt/rust witnesses instead of one smooth charcoal box.
   */
  const keelCore = addBox(tilt, 2.15, 0.55, 6.4, mats.skiffBoot, 0, 0.42, 0,
    { name: `${name}:hull:keel-core` });
  keelCore.scale.set(0.92, 0.76, 0.94);
  keelCore.position.y = 0.30;
  addSkiffPlate(tilt, 2.15, 0.55, 6.4, mats.skiff, 0, 0.42, 0, 0.08,
    `${name}:hull:weathered`);
  addSkiffPlate(tilt, 1.55, 0.28, 5.6, mats.skiffDeck, 0, 0.78, -0.2, 0.06,
    `${name}:deck:non-slip`);
  addSkiffPlate(tilt, 1.15, 0.72, 1.85, mats.skiff, 0, 1.05, -1.55, 0.08,
    `${name}:house:weathered`);
  addSkiffPlate(tilt, 2.17, 0.14, 6.34, mats.skiffBoot, 0, 0.22, 0, 0.04,
    `${name}:boot-top`);
  addBox(tilt, 2.18, 0.24, 6.1, mats.skiffSalt, 0, 0.37, -0.04,
    { name: `${name}:salt-bloom` });
  for (const [side, z] of [[-1, -1.55], [1, 0.42], [-1, 2.35]]) {
    addBox(tilt, 0.026, 0.30, 0.18, mats.skiffRust,
      side * 1.086, 0.43, z, { name: `${name}:rust:${side}:${z}` });
  }
  for (let i = 0; i < 3; i += 1) {
    addBox(tilt, 0.028, 0.025, 0.24 + i * 0.08, mats.skiffDraft,
      1.09, 0.24 + i * 0.065, -2.55, { name: `${name}:draught:${i}` });
  }
  addBox(tilt, 0.08, 1.55, 0.08, mats.skiff, 0.22, 1.85, 2.15);
  addBox(tilt, 0.78, 0.48, 0.06, mats.pennant, 0.62, 2.42, 2.15);
  addCyl(tilt, 0.14, 0.16, 0.55, 8, mats.skiff, 0, 0.42, -3.15);
  addBox(tilt, 0.22, 0.35, 0.55, mats.steel ?? mats.skiff, 0, 0.72, -3.35);
  // At this scale an empty working deck reads more honestly than two peg crew.
  /*
   * ── P14 M9 ITEM 3 — THE SKIFF'S WAKE WAS A 1.35 x 3.15 m BOX. ──
   *
   * An axis-aligned rectangle in `mats.wake` (#d0d8de, lit, opaque) laid on the
   * water astern of a pointed hull, with four square corners and a hard edge on
   * all four sides. At seafight-t6 the three skiffs each carry one and they are
   * the pale patches MC4 pack-a read as "painted foam with no contact".
   *
   * The hull now carries the same three rings the navy hull does — a plan shade
   * under it, a broken collar on the plating, a bow wave off the stem — plus a
   * tapering stern wake that keeps the `${name}:wake` NAME so every lookup that
   * reaches for it (the sink tick here, `logistics-anim`'s `${prefix}:wake`)
   * still resolves. The skiff is built bow-to-+Z, so the plan is laid at
   * yaw = -PI/2.
   */
  const SKIFF_YAW = -Math.PI / 2;
  const water = new THREE.Group();
  water.name = `${name}:water`;
  noPick(water);
  g.add(water);
  /*
   * ── P14 M10 ITEM 1 — WHERE THE SKIFF'S WATER DECALS ACTUALLY WERE. ──
   *
   * These three rings are laid at local y 0.028 / 0.036 / 0.042 in a group whose
   * origin `_tickSea` parks at y **0.22**, so they render at world 0.248-0.262
   * against `nature:water:ocean` at 0.02: a quarter of a metre of daylight, and
   * at the seafight pose (23.2 px/m) about **5 px** of visible gap under every
   * foam ring. "Hulls float on painted foam" is a literal description of a foam
   * ring floating five pixels over the sea.
   *
   * `SKIFF_FREEBOARD` is the height of that authored origin over the still sheet
   * (0.22 - WATER_Y), and it is the ONE number that ties the model to the water:
   * the ride puts the origin at `seaY + SKIFF_FREEBOARD`, which reproduces 0.22
   * exactly at still water, and the decal groups are pulled down by the same
   * amount so they land on the sampled surface at every phase. They are
   * siblings of the tilt group, not children, so they take the heave and the
   * yaw and refuse the pitch and the roll — foam lies ON the water.
   */
  water.position.y = -SKIFF_FREEBOARD;
  addPlanShade(water, {
    x: 0, z: 0, yaw: SKIFF_YAW, len: 6.4, beam: 2.15, y: 0.028,
    hug: 0.02, width: 1.35, hold: 0.42, step: 0.55, seed: 6,
    name: `${name}:water:shade`,
  });
  addPlanCollar(water, {
    x: 0, z: 0, yaw: SKIFF_YAW, len: 6.4, beam: 2.15, y: 0.036,
    hug: 0.06, width: 0.34, step: 0.5, amp: 0.30, seed: 2,
    name: `${name}:water:collar`,
  });
  addBowWave(water, {
    x: 0, z: 0, yaw: SKIFF_YAW, len: 6.4, beam: 2.15, y: 0.042,
    amp: 0.40, run: 0.8, stations: 9, seed: 3,
    name: `${name}:water:bow-wave`,
  });
  const wake = new THREE.Group();
  wake.name = `${name}:wake`;
  wake.position.y = -SKIFF_FREEBOARD;
  noPick(wake);
  addSternWake(wake, {
    x: 0, z: -3.2, yaw: SKIFF_YAW, len: 7.5, beam: 2.6, y: 0.034,
    amp: 0.30, stations: 10, seed: 8, name: `${name}:wake:strip`,
  });
  g.add(wake);
  /*
   * ── P14 M11 ITEM 2 — THE DECAL WAKE AND THE DECAL BOW WAVE ARE OFF. ──
   *
   * MC6 pack-k, 2/10: "a flat billboard wake that never displaces the sea".
   * Both of these are exactly that, and both are now the OCEAN's job: the
   * shader's `ddHullWake` raises real crests behind this hull and a real crest
   * at its stem, driven by the position and heading `_feedSeaWake` hands it.
   *
   * They are HIDDEN and not deleted. `military:skiff:N:wake`,
   * `:wake:strip` and `:water:bow-wave` all still resolve by name, which is
   * the brief's law, and the builders are kept so the A/B can put the old
   * decal back beside the new displacement in one line.
   */
  wake.visible = false;
  const bowDecal = water.getObjectByName(`${name}:water:bow-wave`);
  if (bowDecal) bowDecal.visible = false;
  g.userData.bowDecal = bowDecal ?? null;
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), mats.flash);
  muzzle.name = `${name}:muzzle`;
  muzzle.position.set(0.15, 1.15, 2.55);
  muzzle.visible = false;
  noPick(muzzle);
  tilt.add(muzzle);
  g.userData.muzzle = muzzle;
  g.userData.wake = wake;
  g.userData.water = water;
  noPick(g);
  parent.add(g);
  return g;
}

/**
 * Release the per-shot geometries and per-puff materials a replay allocated.
 * M8 — sprites are not meshes, and the column is fifteen of them with a
 * material each, so the `isMesh` gate this used to open with leaked every one.
 */
function disposeOwned(root) {
  root.traverse((child) => {
    if (!child.isMesh && !child.isSprite) return;
    if (child.userData.ownsGeometry) child.geometry?.dispose?.();
    if (child.userData.ownsMaterial) child.material?.dispose?.();
  });
}

const _tracerAxis = new THREE.Vector3(0, 0, 1);
const _tracerDir = new THREE.Vector3();

function addTracer(parent, mats) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1), mats.tracer);
  mesh.userData.ownsGeometry = true;
  noPick(mesh);
  parent.add(mesh);
  return mesh;
}

export class MilitaryAttacksLayer {
  constructor(city, { reducedMotion = false } = {}) {
    this.city = city;
    this.reducedMotion = reducedMotion;
    this.root = new THREE.Group();
    this.root.name = 'military-attacks';
    this.mats = kit();
    this.demo = null;
    this.demoLock = false;
    this.time = 0;
    this.raid = null;
    this.sea = null;
    this.damage = new Map();
    this.lastBeat = null;
    this.statusSnapshot = { raid: null, sea: null };
    this._warshipRest = null;
    this._wake = null;
    /*
     * P14 M10 item 1 — the RENDER clock, kept apart from `this.time`.
     *
     * `this.time` is the layer's own accumulator and it is what the replay is
     * choreographed on; the ocean's vertex program is driven by `elapsed`
     * (`water.js: this._ocean.update(reducedMotion ? OCEAN.freezeTime : elapsed)`).
     * The two are not the same number — the capture harness steps `v.step(0.03,
     * performance.now()/1000)` in a tight loop, so they diverge by minutes — and
     * a hull sampled on the wrong one rides a sea that is not the drawn one.
     */
    this.seaClock = 0;
    this._seaDt = 0;
    this._oceanPlan = null;
    this._oceanPlanCity = null;
    this._rides = new Map();
    this._speeds = new Map();
    this._wakeFeed = [];
    this._seaFrame = { h: 0, gx: 0, gz: 0 };
  }

  /**
   * The edge-massing plan, hoisted. `oceanSurfaceYAt` plans it on every call it
   * is not handed one — measured 17.5 us cold against 4.0 us hoisted (M10 probe
   * Q1) — and the seafight makes twelve calls a frame.
   */
  _plan(city) {
    const use = city ?? this.city;
    if (this._oceanPlan && this._oceanPlanCity === use) return this._oceanPlan;
    this._oceanPlan = planEdgeMassing(use ?? { extent: { x: 272, z: 272 } });
    this._oceanPlanCity = use;
    return this._oceanPlan;
  }

  /** The drawn sea surface at a world point, on the render clock. */
  _seaAt(x, z) {
    return oceanSurfaceYAt(x, z, this.seaClock, this.city, this._plan(this.city));
  }

  _ride(key) {
    let r = this._rides.get(key);
    if (!r) { r = new HullRide(); this._rides.set(key, r); }
    return r;
  }

  /**
   * ── P14 M11 ITEM 2 — THE SPEED AND THE TRACK, BOTH MEASURED. ──
   *
   * Nothing authors either. The navy hull is driven along a waypoint list by
   * `shipDepartPose` and the skiffs by an echelon formula, so the only honest
   * numbers are the ones the positions give — and the walk in `M11-probe.json`
   * says why both of them have to be TREATED rather than passed straight
   * through:
   *
   *   SPEED  the departure covers 107 m in 4.2 s and peaks at 70 m/s of
   *          frame-to-frame travel. That is the replay's pace, not a ship's,
   *          so it is capped at `HULL_WAKE.speedCap` before the field sees it,
   *          and the low pass is ASYMMETRIC — 0.20 s on, 2.6 s off — because a
   *          wake outlives the way that made it. Without the release the hull
   *          parks at t = 4.8 and the V vanishes between one frame and the
   *          next, which is not what water does.
   *   TRACK  `holder.rotation.y` is PI for the whole departure while the hull
   *          travels on a bearing of -114 degrees: the seafight leg never
   *          yaws the warship onto its own course. That is another concern's
   *          fault and this lane leaves it, but a V laid on the model's yaw
   *          would point somewhere the ship has not been. A wake follows the
   *          TRACK, so the heading is taken from the smoothed velocity and
   *          falls back to the model's yaw only when the hull is stopped.
   */
  _hullMotion(key, x, z, fallbackHeading) {
    let rec = this._speeds.get(key);
    if (!rec) {
      rec = { x, z, v: 0, hx: Math.cos(fallbackHeading), hz: Math.sin(fallbackHeading) };
      this._speeds.set(key, rec);
    }
    const dt = this._seaDt;
    if (dt > 0) {
      const dx = x - rec.x;
      const dz = z - rec.z;
      const raw = Math.hypot(dx, dz) / dt;
      const target = Math.min(raw, HULL_WAKE.speedCap);
      const tau = target > rec.v ? HULL_WAKE.tauAttack : HULL_WAKE.tauRelease;
      rec.v += (target - rec.v) * (1 - Math.exp(-dt / tau));
      if (raw > 0.25) {
        // Blend the track in on the attack constant, so a turn sweeps the V
        // round rather than snapping it.
        const inv = 1 / Math.hypot(dx, dz);
        const a = 1 - Math.exp(-dt / HULL_WAKE.tauAttack);
        rec.hx += (dx * inv - rec.hx) * a;
        rec.hz += (dz * inv - rec.hz) * a;
      }
      rec.x = x;
      rec.z = z;
    }
    const len = Math.hypot(rec.hx, rec.hz) || 1;
    return {
      speed: rec.v,
      heading: rec.v > 0.4 ? Math.atan2(rec.hz / len, rec.hx / len) : fallbackHeading,
    };
  }

  setDemo(spec) {
    this.demo = spec;
    this.demoLock = Boolean(spec);
    this.time = 0;
    this._clearRaid();
    this._clearSea();
    return spec;
  }

  _readWorld() {
    try {
      const inspected = inspectWorldRun(worldStoreGet(WORLD_RUN_KEY));
      if (inspected.status !== 'valid') return null;
      return inspected.world;
    } catch {
      return null;
    }
  }

  _port() {
    let node = this.root;
    while (node?.parent) node = node.parent;
    return node?.getObjectByName?.('fringe:port') ?? null;
  }

  _facilityPoint(facilityKey, city = this.city) {
    const extent = city?.extent ?? cityExtent(4, 4);
    if (!facilityKey || facilityKey === 'port') {
      const port = this._port();
      const logistics = port?.userData?.logistics;
      if (logistics?.adminWorld) return { x: logistics.adminWorld.x, y: 4, z: logistics.adminWorld.z };
      if (typeof logistics?.toWorld === 'function') {
        const p = logistics.toWorld(logistics.admin?.x ?? 0, 4, logistics.admin?.z ?? 0);
        return { x: p.x, y: 4, z: p.z };
      }
      return { x: extent.x * 0.92, y: 4, z: extent.z * 0.42 };
    }
    const form = (city?.parcels ?? []).find((p) => p.archetypeId === facilityKey || p.formId === facilityKey);
    if (form?.centre) return { x: form.centre.x, y: 3, z: form.centre.z };
    const core = (city?.blockCores ?? []).find((c) => c.useId === facilityKey);
    if (core?.centre) return { x: core.centre.x, y: 3, z: core.centre.z };
    return { x: extent.x * 0.55, y: 3, z: extent.z * 0.45 };
  }

  _nwEntry(city = this.city) {
    return { x: -18, y: RAID_ENTRY_ALT_M, z: -18 };
  }

  /**
   * MC3 F1 — the crash site has to be on the ground the camera can see.
   *
   * The M5 apron was `admin - 14, +7.2` in the port's local frame, taken on
   * faith. A downward probe at that point returns `nature:water:ocean`: the
   * raid was landing in the harbour, half a quay behind the shed, which is why
   * raid-t8 could look straight at it and still show only a roof. This walks a
   * ring of candidates around the admin block and takes the first that stands
   * on something solid.
   */
  _groundedApron(base) {
    const scene = this._scene();
    if (!scene || !base) return base;
    const port = this._port();
    const logistics = port?.userData?.logistics;
    // M7 — the candidate table was read in two frames at once. `dx` was added
    // to `admin.x` (a local coordinate) while `dz` was passed as an ABSOLUTE
    // local z, so every candidate probed a line 24-40 m off the admin block in
    // z. A downward probe at all twelve returns `nature:water:beach-foam` over
    // `nature:water:ocean`: not one of them was ever on land, the loop always
    // fell through to `base`, and the grounding M6 reported was never running.
    // Both offsets are offsets.
    const toWorld = typeof logistics?.toWorld === 'function' && logistics.admin
      ? (dx, dz) => logistics.toWorld(logistics.admin.x + dx, 0.14, logistics.admin.z + dz)
      : null;
    const ray = new THREE.Raycaster();
    ray.far = 240;
    const from = new THREE.Vector3();
    const down = new THREE.Vector3(0, -1, 0);
    /**
     * M8 item 2 — the port's own deck, by name.
     *
     * `solidUnder` below walks the scene, and the scene cannot see the port:
     * 8,124 of `fringe:port`'s 8,236 meshes carry a `noPick` stub in place of
     * `raycast`. `apronUnder` intersects the named deck slabs with the
     * prototype method that stub shadows, so `fringe:port-terminal` at y 0.452
     * is reachable — and the ocean plane at 0.02 that every previous round kept
     * returning is 43 cm under it, not over it.
     */
    const decks = collectApronDecks(port);
    const deckRay = new THREE.Raycaster();
    const onDeck = (x, z) => apronUnder(decks, x, z, deckRay);
    this.apronDecks = decks.length;
    /**
     * M7 — the water plane is a SURFACE, not an occluder, and treating it as
     * one is why no probe in M6 or the first three M7 passes ever found the
     * port deck.
     *
     * A downward probe at the port's own apron workers, its container zone and
     * its gantry all return `nature:water:beach-foam` at y 0.04 or
     * `nature:water:ocean` at y 0.02. The workers are visibly standing on
     * concrete in every frame: the apron is at about deck zero and the bay's
     * foam and ocean planes are drawn a few centimetres over the top of it. M6
     * returned `null` the moment it saw water, so `fringe:port` ground was
     * unreachable by construction — the loop always fell through to the
     * un-probed base point, and the "grounding" it reported never ran.
     *
     * The rule is now: water sets a floor, it does not end the probe. A solid
     * surface within `RAID_WATER_TOLERANCE_M` of the water it is drawn under is
     * still a deck; anything further below it is genuinely the sea bed, and
     * anything above `RAID_APRON_MAX_Y` is a roof or a gantry, not an apron.
     */
    const solidUnder = (x, z) => {
      from.set(x, 90, z);
      ray.set(from, down);
      const hits = ray.intersectObject(scene, true);
      let waterY = null;
      for (const h of hits) {
        let node = h.object;
        while (node && !node.name) node = node.parent;
        const nm = node?.name ?? '';
        if (/^military[:-]|^pick:/.test(nm)) continue;
        if (h.object.material?.colorWrite === false) continue;
        if (/^nature:water|^fringe:water|:wake(:|$)|foam|bow-wave|wet-collar/.test(nm)) {
          if (waterY === null) waterY = h.point.y;
          continue;
        }
        if (h.point.y > RAID_APRON_MAX_Y) return null;
        if (waterY !== null && h.point.y < waterY - RAID_WATER_TOLERANCE_M) return null;
        return { y: h.point.y, name: nm };
      }
      return null;
    };
    // M8 — one probe for the whole search, so the apron pass and the fallback
    // passes agree about what the ground is. On the apron pass the named decks
    // answer first and the scene ray is not consulted at all.
    const groundAt = (x, z, apronOnly) => {
      const d = onDeck(x, z);
      if (d) return d;
      return apronOnly ? null : solidUnder(x, z);
    };
    // The crash site is a disc, not a point: probe a ring at the scorch radius
    // too, so the whole burn sits on deck instead of half-hanging over the quay.
    // The scorch disc has to sit on deck at every compass point of its own
    // radius. That is M6's test and it stays the hard gate.
    const scorchOk = (x, z, y, apronOnly) => {
      for (const [rx, rz] of RAID_APRON_RING) {
        const r = groundAt(x + rx * RAID_SCORCH_R, z + rz * RAID_SCORCH_R, apronOnly);
        if (!r || Math.abs(r.y - y) > 1.6) return false;
      }
      return true;
    };
    // M7 item 2 — and the clearance ring says how much apron is around it.
    // `open` is the bearings that came back water or nothing; empty means the
    // whole burn, its column and its debris are inboard of the quay edge.
    const openBearings = (x, z, y, apronOnly) => {
      const open = [];
      for (let i = 0; i < RAID_COMPASS_16.length; i += 1) {
        const [rx, rz] = RAID_COMPASS_16[i];
        const r = groundAt(x + rx * RAID_APRON_CLEAR_R, z + rz * RAID_APRON_CLEAR_R, apronOnly);
        if (!r || Math.abs(r.y - y) > 1.6) open.push(i);
      }
      return open;
    };
    /**
     * M7 item 2 — and the last condition, which is the one the frames kept
     * failing on: **the raid camera has to be able to see the crash site.**
     *
     * Grounding alone put the aftermath on a city street with an apartment
     * block between it and every raid azimuth, and `chooseClearPose` could not
     * swing out of it — 240 candidates, `clear: false`, and raid-t8 was a
     * photograph of a brick wall. The camera's own search runs on world AABBs
     * and under-reports; a real ray from the raid pose's eye does not. A
     * candidate that cannot be seen is not a crash site.
     */
    /**
     * M7 item 2 — and one more: an aftermath needs room around it.
     *
     * A sightline test alone is satisfied by a point tucked against a tower:
     * the ray reaches it, and the raid camera at 56 m then fills half the frame
     * with brickwork. `crowded` rejects any site with a tall neighbour inside
     * `RAID_APRON_CLEAR_SKY_R`, which is what pushes the crash onto open deck.
     */
    /**
     * M8 — and the port's own furniture counts. The scene raycast cannot see a
     * crane, a shed or a stack of containers for the same reason it could not
     * see the deck: they are `noPick`. Their world boxes are collected once
     * here and both the crowding test and the sightline test consult them, so
     * "open deck" now means open deck rather than "open as far as a ray that
     * cannot see the port is concerned".
     */
    const portBoxes = collectPortBlockers(port);
    this.apronBlockers = portBoxes.length;
    const tallNear = (x, z) => {
      for (const b of portBoxes) {
        if (b.maxY <= RAID_APRON_CLEAR_SKY_M) continue;
        const dx = Math.max(b.minX - x, 0, x - b.maxX);
        const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
        if ((dx * dx) + (dz * dz) < RAID_APRON_CLEAR_SKY_R2) return true;
      }
      for (const r of [12, 22]) {
        for (const [rx, rz] of RAID_COMPASS_16) {
          from.set(x + rx * r, 90, z + rz * r);
          ray.set(from, down);
          const hits = ray.intersectObject(scene, true);
          for (const h of hits) {
            let node = h.object;
            while (node && !node.name) node = node.parent;
            const nm = node?.name ?? '';
            if (/^military[:-]|^pick:/.test(nm)) continue;
            if (h.object.material?.colorWrite === false) continue;
            if (h.point.y > RAID_APRON_CLEAR_SKY_M) return true;
            break;
          }
        }
      }
      return false;
    };
    const raidPose = militaryCameraPose('raid');
    const seenFromRaid = (x, y, z) => {
      const eye = orbitEye({ x, y, z }, raidPose.azimuth, raidPose.polar, raidPose.distance);
      // M8 — the port's own sheds and cranes first, off their world boxes,
      // because a scene ray cannot reach them.
      const target = { x, y: y + 0.4, z };
      for (const b of portBoxes) {
        if (segmentHitsBox(eye, target, b, 1.6)) return false;
      }
      _v1.set(eye.x, eye.y, eye.z);
      _v2.set(x - eye.x, (y + 0.4) - eye.y, z - eye.z);
      const dist = _v2.length();
      if (!(dist > 1)) return true;
      ray.set(_v1, _v2.normalize());
      const hits = ray.intersectObject(scene, true);
      for (const h of hits) {
        if (h.distance > dist - 1.2) return true;
        let node = h.object;
        while (node && !node.name) node = node.parent;
        const nm = node?.name ?? '';
        if (SIGHT_TRANSPARENT.test(nm)) continue;
        const m = h.object.material;
        if (m?.colorWrite === false) continue;
        if (m?.transparent && (m.opacity ?? 1) < 0.35) continue;
        if (m?.depthWrite === false && m?.transparent) continue;
        return false;
      }
      return true;
    };
    // The authored table first, then a deterministic spiral. A hand-typed list
    // of twelve points is a preference, not a guarantee: if the port's own
    // frame moves under it the raid must still land on deck, so the search
    // widens rather than giving up.
    const candidates = [...RAID_APRON_CANDIDATES];
    for (const r of RAID_APRON_SPIRAL_R) {
      for (const [cx, cz] of RAID_COMPASS_16) {
        candidates.push([cx * r, cz * r]);
      }
    }
    // M7 — and world points taken off the port's own footprint.
    //
    // Everything above is anchored on `logistics.admin`, and at this layout
    // that anchor has no port deck anywhere near it: a 7 x 12 downward scan of
    // the admin frame returns `nature:water:ocean` at every seaward offset and
    // `ground:road-straight` at every landward one, with no `fringe:port`
    // surface anywhere in the grid. A candidate table cannot fix an anchor that
    // is in the wrong place. `apronGrid` samples the port group's own world box
    // instead, nearest the raid's target first, so the crash lands on the port
    // whatever the logistics frame says.
    const worldPoints = apronGrid(port, base);
    // M8 — and the deck's OWN box, which is 202 x 37 m of apron rather than the
    // 1300 x 750 m harbour `fringe:port` reports. Sampled first, nearest the
    // raid's target, so the crash lands where the port's frames are shot.
    const deckBox = apronDeckBox(decks);
    const deckPoints = deckBox ? apronGridPoints(deckBox, base, RAID_APRON_DECK_GRID, 0.06) : [];
    this.apronSearch = {
      grid: worldPoints.length, deckGrid: deckPoints.length, decks: decks.length,
      blockers: portBoxes.length, tried: 0, apronHits: 0,
    };
    // M7 — a raid on the PORT lands on the port. With the frame bug fixed the
    // search started passing, and the first point it passed on was
    // `ground:road-straight`: a city street a block inland, with an apartment
    // block between it and every raid azimuth. "Solid" was never the test —
    // the apron is the test. The port's own deck is tried first at every
    // candidate and every step of the inboard walk; any solid ground is only
    // the fallback if the port has none.
    const onApron = (g) => Boolean(g) && RAID_APRON_SURFACE.test(g.name ?? '');
    for (const pass of ['apron', 'open', 'any']) {
    const apronOnly = pass === 'apron';
    const wants = (g) => (apronOnly ? onApron(g) : Boolean(g));
    // The deck's own grid leads on the apron pass — those points are the port
    // deck by construction, so the search stops guessing at it.
    const points = apronOnly
      ? [
        ...deckPoints.map((w) => ({ world: w })),
        ...candidates.map((c) => ({ local: c })),
        ...worldPoints.map((w) => ({ world: w })),
      ]
      : [
        ...candidates.map((c) => ({ local: c })),
        ...worldPoints.map((w) => ({ world: w })),
      ];
    for (const entry of points) {
      const p = entry.world ?? (toWorld
        ? toWorld(entry.local[0], entry.local[1])
        : { x: base.x + entry.local[0], y: 0.14, z: base.z + entry.local[1] });
      const ground = groundAt(p.x, p.z, apronOnly);
      this.apronSearch.tried += 1;
      if (onApron(ground)) this.apronSearch.apronHits += 1;
      if (!wants(ground)) continue;
      if (!scorchOk(p.x, p.z, ground.y, apronOnly)) continue;
      if (!seenFromRaid(p.x, ground.y, p.z)) continue;
      if (pass !== 'any' && tallNear(p.x, p.z)) continue;
      // Walk inboard, a metre at a time, away from whatever is not apron. Each
      // step has to keep the scorch ring on deck, so the walk can only ever
      // improve the shot; it stops as soon as the clearance ring is clean.
      let x = p.x;
      let z = p.z;
      let y = ground.y;
      let moved = 0;
      let open = openBearings(x, z, y, apronOnly);
      const steps = Math.round(RAID_APRON_INBOARD_M / RAID_APRON_INBOARD_STEP_M);
      for (let s = 0; s < steps && open.length; s += 1) {
        const dir = inboardDirection(open);
        if (!dir) break;
        const nx = x + dir[0] * RAID_APRON_INBOARD_STEP_M;
        const nz = z + dir[1] * RAID_APRON_INBOARD_STEP_M;
        const g = groundAt(nx, nz, apronOnly);
        if (!wants(g) || Math.abs(g.y - y) > 1.6) break;
        if (!scorchOk(nx, nz, g.y, apronOnly)) break;
        if (!seenFromRaid(nx, g.y, nz)) break;
        x = nx;
        z = nz;
        y = g.y;
        moved += RAID_APRON_INBOARD_STEP_M;
        open = openBearings(x, z, y, apronOnly);
      }
      return {
        x,
        y: y + 0.04,
        z,
        on: ground.name,
        pass,
        inboardM: +moved.toFixed(2),
        openBearings: open.length,
      };
    }
    }
    return base;
  }

  _scene() {
    let node = this.root;
    while (node?.parent) node = node.parent;
    return node ?? null;
  }

  _apronPoint(city = this.city) {
    const port = this._port();
    const logistics = port?.userData?.logistics;
    if (typeof logistics?.toWorld === 'function' && logistics.admin) {
      // M7 — same frame bug as the candidate table: `7.2` was an absolute local
      // z beside a relative x, which put the un-grounded fallback in the water.
      return logistics.toWorld(logistics.admin.x - 14, 0.14, logistics.admin.z + 7.2);
    }
    if (logistics?.adminWorld) {
      return {
        x: logistics.adminWorld.x - 8,
        y: 0.14,
        z: logistics.adminWorld.z + 16,
      };
    }
    const roof = this._facilityPoint('port', city);
    return { x: roof.x - 8, y: 0.14, z: roof.z + 14 };
  }

  _ensureRaid(row, city, unitsLayer) {
    if (this.raid && this.raid.id === row.id) return this.raid;
    this._clearRaid();
    const strength = row.strength ?? 3;
    const interceptors = row.interceptors ?? [];
    const leftover = leftoverAttackers(strength, interceptors);
    const n = swarmCount(strength);
    const target = this._facilityPoint(row.targetFacility ?? 'port', city);
    const entry = this._nwEntry(city);
    const group = new THREE.Group();
    group.name = 'military:raid';
    this.root.add(group);
    const attackers = [];
    for (let i = 0; i < n; i += 1) {
      const drone = addAttackDrone(group, this.mats, `military:raid:drone:${i}`, RAID_ACTOR_SCALE);
      const ox = (hash01(i * 17 + 3) - 0.5) * 1.6;
      const oz = (hash01(i * 29 + 5) - 0.5) * 1.4;
      drone.position.set(entry.x + ox, RAID_ENTRY_ALT_M, entry.z + oz);
      attackers.push({
        mesh: drone,
        i,
        ox,
        oz,
        combatant: i < strength,
        willDown: i < interceptors.length,
        state: 'inbound',
        tDown: null,
        wreck: null,
      });
    }
    const interceptCount = interceptors.length;
    const interceptorsVisual = [];
    const roster = unitsLayer?.status?.()?.units ?? [];
    const dronePads = roster.filter((u) => u.kind === 'drone');
    const tankPads = roster.filter((u) => u.kind === 'tank');
    const launchN = interceptors.filter((it) => it.kind === 'drone').length;
    for (let i = 0; i < Math.max(launchN, dronePads.length ? 1 : 0); i += 1) {
      const pad = dronePads[i % Math.max(1, dronePads.length)];
      const mesh = addInterceptorDrone(group, this.mats, `military:raid:interceptor:${i}`, RAID_ACTOR_SCALE);
      const origin = pad
        ? { x: pad.x, z: pad.z }
        : padPoseForBlock(0, 2, 0);
      mesh.position.set(origin.x, 2.2, origin.z);
      interceptorsVisual.push({ mesh, origin, i });
    }
    const tracers = [addTracer(group, this.mats), addTracer(group, this.mats), addTracer(group, this.mats)];
    tracers.forEach((tr) => { tr.visible = false; });
    this.raid = {
      id: row.id,
      row,
      group,
      attackers,
      interceptors: interceptorsVisual,
      tanks: tankPads,
      tracers,
      target,
      entry,
      leftover,
      interceptCount,
      strength,
      boom: null,
      apron: this._groundedApron(this._apronPoint(city)),
      phase: 'inbound',
    };
    this._dressRaidWater(this.raid);
    return this.raid;
  }

  /* ================================================================== *
   * P14 M11 ITEM 5 — THE RAID'S WATER AND ITS PIER EDGE.
   *
   * MC6 pack-h, 3/10: "water is a tiled gradient with no contact foam,
   * refraction, or pier-edge wetness". Three separate absences, and the first
   * job was to find out WHERE, because the raid does not happen at the
   * container quay: `M11-raidprobe` puts the apron at world (79.0, -26.3)
   * while `fringe:port-terminal` sits at (213.8, -32.0) with its cope line at
   * z -38.5 running x 153.8 to 273.8. The nearest water edge to the raid is
   * `fringe:verge-face:north` at 24 m, which is the board's own north edge
   * treatment — a wall standing in the bay, not the berth face. That is the
   * edge in the frame and that is the edge this dresses.
   *
   * All three pieces are `military:raid:*` and live in the raid group, because
   * `fringe/**` is another lane's and the edge itself is theirs:
   *
   *   WETNESS  a 0.4 m band on the vertical face above the still-water level,
   *            darker and much glossier than the concrete over it. Wet stone
   *            is not a different colour, it is a different ROUGHNESS: 0.20
   *            against the wall's own 0.9, so the band picks up the sky.
   *   FOAM     a broken additive ribbon at the waterline hugging the wall, on
   *            the same seeded gate `foamGapAt` gives the hull collars, so
   *            about a third of the run carries none and it cannot weld into
   *            a painted line.
   *   PILES    a collar at every pile station. The port's own quay uses a
   *            5.4 m pile pitch (`fringe:port-cope:piles`), so this uses the
   *            same pitch and the foam is loudest between them.
   * ================================================================== */
  _dressRaidWater(raid) {
    if (!raid?.group || raid.water) return null;
    const apron = raid.apron;
    if (!apron) return null;
    const edge = this._nearestWaterEdge(apron);
    if (!edge) return null;
    const g = new THREE.Group();
    g.name = 'military:raid:water';
    noPick(g);
    raid.group.add(g);
    const { cx, cz, ux, uz, nx, nz, span } = edge;
    const yaw = Math.atan2(ux, uz);
    const at = (along, out) => [
      cx + ux * along + nx * out,
      cz + uz * along + nz * out,
    ];
    const wetLo = WATER_Y - 0.06;
    const wetHi = WATER_Y + RAID_WET_BAND_M;
    const [wx, wz] = at(0, 0.05);
    const wet = addBox(g, span, wetHi - wetLo, 0.10, this.mats.pierWet,
      wx, (wetLo + wetHi) * 0.5, wz, {
        rotY: yaw, name: 'military:raid:pier-wet',
      });
    wet.castShadow = false;
    wet.receiveShadow = true;
    noPick(wet);
    const foam = new THREE.Group();
    foam.name = 'military:raid:quay-foam';
    noPick(foam);
    g.add(foam);
    const n = Math.max(8, Math.round(span / 3.2));
    let lit = 0;
    for (let i = 0; i < n; i += 1) {
      const u = i / (n - 1);
      // Two incommensurate rates, MAXed rather than multiplied: the product
      // of two gates lit 3 of 20 slots on the first run (M11-wip-status
      // raidWater.foamLit), which is a wall with three dabs on it. The max
      // keeps the zeros — about a third of the run carries none, which is what
      // stops a continuous painted rim — and lights the rest.
      const gate = Math.max(foamGapAt(u * 2.7 + 0.21, 4), foamGapAt(u * 1.1 + 0.63, 9));
      if (gate < 0.30) continue;
      lit += 1;
      const w = 1.6 + gate * 2.4;
      const d = 0.55 + gate * 0.85;
      const [fx, fz] = at((u - 0.5) * span, 0.10 + d * 0.5);
      const strip = new THREE.Mesh(RAID_FOAM_GEOM, this.mats.quayFoam);
      strip.name = `military:raid:quay-foam:${i}`;
      strip.position.set(fx, WATER_Y + 0.035, fz);
      strip.scale.set(w, 1, d);
      strip.rotation.y = yaw;
      foam.add(strip);
      strip.castShadow = false;
      strip.renderOrder = 6;
      noPick(strip);
    }
    const piles = new THREE.Group();
    piles.name = 'military:raid:piles';
    noPick(piles);
    g.add(piles);
    const pileN = Math.max(4, Math.round(span / RAID_PILE_PITCH_M));
    for (let i = 0; i < pileN; i += 1) {
      const along = (-0.5 + (i + 0.5) / pileN) * span;
      const [px, pz] = at(along, 0.42);
      const pile = addBox(piles, 0.46, 2.6, 0.42, this.mats.pierWet,
        px, WATER_Y - 0.95, pz, { rotY: yaw, name: `military:raid:pile:${i}` });
      pile.castShadow = false;
      pile.receiveShadow = true;
      noPick(pile);
      const [qx, qz] = at(along, 0.46);
      const collar = new THREE.Mesh(RAID_FOAM_GEOM, this.mats.quayFoam);
      collar.name = `military:raid:pile-foam:${i}`;
      collar.position.set(qx, WATER_Y + 0.042, qz);
      collar.scale.set(1.35, 1, 1.05);
      collar.rotation.y = yaw;
      piles.add(collar);
      collar.castShadow = false;
      collar.renderOrder = 6;
      noPick(collar);
    }
    /*
     * M12 — a local sun path on the SAME harbour sheet.  The outer ocean owns
     * the reflector and its physical sun lobe, but at this camera the mirror
     * point sits off-frame.  These three vertex-faded lozenges follow the live
     * key's ground bearing, are forced onto the water side of the measured
     * quay edge, and use the same deterministic gaps as hull foam.  Their
     * outer vertices are black, so no rectangular decal edge can appear.
     */
    if (!this._keyRef) this._keyRef = findKeyLight(this.root);
    const key = readKeyLight(this._keyRef);
    let dx = key?.dir?.x ?? nx;
    let dz = key?.dir?.z ?? nz;
    let dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;
    if (dx * nx + dz * nz < 0) { dx *= -1; dz *= -1; }
    dx = dx * 0.74 + nx * 0.26;
    dz = dz * 0.74 + nz * 0.26;
    dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;
    const pxDir = dz;
    const pzDir = -dx;
    const sunTrack = new THREE.Group();
    sunTrack.name = 'military:raid:sun-track';
    noPick(sunTrack);
    g.add(sunTrack);
    for (const [run, spec] of [
      [0, { offset: 0, width: 2.6, amp: 0.19, skew: 0.00, seed: 14 }],
      [1, { offset: -3.2, width: 1.7, amp: 0.14, skew: 0.06, seed: 23 }],
      [2, { offset: 4.1, width: 1.15, amp: 0.10, skew: -0.05, seed: 31 }],
    ]) {
      const ca = Math.cos(spec.skew);
      const sa = Math.sin(spec.skew);
      const rx = dx * ca + pxDir * sa;
      const rz = dz * ca + pzDir * sa;
      const sx = rz;
      const sz = -rx;
      const inner = [];
      const outer = [];
      const values = [];
      const samples = 32;
      for (const side of [1, -1]) {
        for (let k = 0; k < samples; k += 1) {
          const u = side > 0 ? k / (samples - 1) : 1 - k / (samples - 1);
          const along = 1.2 + u * RAID_SUN_TRACK.lengthM;
          const half = spec.width * (0.28 + 0.72 * Math.sin(Math.PI * u));
          const lateral = spec.offset;
          const x = cx + nx * 0.65 + rx * along + sx * lateral;
          const z = cz + nz * 0.65 + rz * along + sz * lateral;
          inner.push([x, z]);
          outer.push([x + side * sx * half, z + side * sz * half]);
          const ends = Math.sin(Math.PI * u);
          values.push(spec.amp * ends * foamGapAt(u * 2.15 + run * 0.13, spec.seed));
        }
      }
      const strip = planRingMesh(
        inner, outer,
        (i) => {
          const v = values[i];
          return [v * 0.92, v * 0.97, v];
        },
        () => [0, 0, 0],
        WATER_Y + 0.018, waterFoamMaterial(), 5,
      );
      strip.name = `military:raid:sun-track:run-${run}`;
      sunTrack.add(strip);
    }
    /*
     * And the raid site goes into the harbour reflector's proxy layer. W6's
     * planar reflector walks the port subtree ONCE at build time; the raid
     * group is created later, so nothing it puts on the quay was in the
     * mirrored render and the water beside a burning terminal reflected an
     * empty wharf. `addReflectionSources` is the registry M9 added for exactly
     * this — a late subtree enrolling itself.
     */
    const enrolled = addReflectionSources(raid.group, { cap: 16 });
    raid.water = {
      edge, foamLit: lit, foamSlots: n, piles: pileN, enrolled,
      sunTrackRuns: RAID_SUN_TRACK.runs,
      sunDirection: [dx, dz],
    };
    return raid.water;
  }

  /**
   * ── WHERE THE PIER EDGE ACTUALLY IS, MEASURED WITH A RAY. ──
   *
   * The first cut walked the scene for meshes named like an edge and took the
   * nearest: it returned `fringe:verge-face:north` at x 47-111, z -2.22 — a
   * ROAD verge 24 m from the apron and nowhere near the water — and dressed
   * that. Two measurements settle it instead:
   *
   *   `oceanCoversPoint` is true 2 m from the apron on every bearing, because
   *   the port deck is built OVER the water field; it cannot find a deck edge.
   *   A ray straight DOWN can: on this pose it hits `nature:water:ocean` or
   *   `nature:water:beach-foam` at 12 m on all eight bearings, so the raid
   *   stands on a narrow finger and its edge is inside that.
   *
   * So the edge is found by marching outward on twelve bearings and taking the
   * first metre at which the ray stops hitting the PORT and starts hitting
   * nothing (i.e. water). The two nearest edge points give the bearing of the
   * edge line; the band is laid along it. Ray budget: 12 x 26 casts against
   * the port subtree, once per raid build.
   */
  _nearestWaterEdge(apron) {
    let root = this.root;
    while (root?.parent) root = root.parent;
    const port = root?.getObjectByName?.('fringe:port');
    if (!port) return null;
    const ray = new THREE.Raycaster();
    ray.far = 200;
    const decks = collectApronDecks(port);
    const deckRay = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const from = new THREE.Vector3();
    const onDeck = (x, z) => {
      from.set(x, 40, z);
      ray.set(from, down);
      const hits = ray.intersectObject(port, true);
      for (const h of hits) {
        if (!h.object.visible) continue;
        if (h.point.y < WATER_Y + 0.25) continue;
        return true;
      }
      // Nearly every authored port slab has `noPick`, so its instance raycast
      // is intentionally a no-op. Use the same prototype-ray fallback that
      // grounds the raid apron; otherwise a real deck reports as open water.
      return Boolean(apronUnder(decks, x, z, deckRay));
    };
    const pts = [];
    for (let i = 0; i < 12; i += 1) {
      const ang = (i / 12) * Math.PI * 2;
      const cx = Math.cos(ang);
      const cz = Math.sin(ang);
      if (!onDeck(apron.x + cx * 2, apron.z + cz * 2)) continue;
      for (let r = 3; r <= 28; r += 1) {
        if (onDeck(apron.x + cx * r, apron.z + cz * r)) continue;
        pts.push({ x: apron.x + cx * (r - 0.5), z: apron.z + cz * (r - 0.5), r });
        break;
      }
    }
    if (pts.length < 2) return null;
    pts.sort((a, b) => a.r - b.r);
    const near = pts.slice(0, Math.min(4, pts.length));
    // Bearing of the edge: the line through the two closest edge points.
    const a = near[0];
    const b = near[near.length - 1];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len = Math.hypot(ex, ez);
    if (!(len > 1)) return null;
    const ux = ex / len;
    const uz = ez / len;
    // Seaward is away from the apron, perpendicular to the edge.
    const mx = (a.x + b.x) * 0.5;
    const mz = (a.z + b.z) * 0.5;
    let nx = -uz;
    let nz = ux;
    if ((mx - apron.x) * nx + (mz - apron.z) * nz < 0) { nx = -nx; nz = -nz; }
    return {
      d: a.r,
      cx: mx,
      cz: mz,
      ux,
      uz,
      nx,
      nz,
      span: Math.min(RAID_EDGE_SPAN_M, Math.max(14, len * 1.8)),
      points: pts.length,
    };
  }

  _clearRaid() {
    if (this.raid?.group) {
      disposeOwned(this.raid.group);
      this.raid.group.parent?.remove(this.raid.group);
    }
    this.raid = null;
  }

  _tickRaid(t, city, unitsLayer) {
    const raid = this.raid;
    if (!raid) return;
    const arrive = 1.8;
    const fight = 3.6;
    const dive = 5.0;
    const settle = 6.5;
    const target = raid.target;
    const entry = raid.entry;
    let phase = 'inbound';
    if (t >= dive) phase = t >= settle ? 'smoke' : 'dive';
    else if (t >= fight) phase = 'fight';
    else if (t >= arrive) phase = 'intercept';
    raid.phase = phase;

    for (const a of raid.attackers) {
      const weave = Math.sin(t * 1.7 + a.i * 0.9) * 0.7;
      const bob = Math.sin(t * 2.4 + a.i) * 0.35;
      if (a.state === 'wreck') {
        if (a.wreck) {
          a.wreck.rotation.z += 0.02;
          if (t - a.tDown > 2.4) a.wreck.visible = t - a.tDown < 3.2;
        }
        continue;
      }
      if (a.willDown && t >= fight + a.i * 0.18) {
        a.state = 'tumble';
        const u = clamp01((t - (fight + a.i * 0.18)) / 1.1);
        const px = a.mesh.position.x;
        const pz = a.mesh.position.z;
        const land = raid.apron ?? target;
        const apronX = land.x + (hash01(a.i * 13 + 2) - 0.5) * 5.5;
        const apronZ = land.z + (hash01(a.i * 9 + 4) - 0.5) * 4.2;
        a.mesh.position.x = px + (apronX - px) * easeOutCubic(u);
        a.mesh.position.z = pz + (apronZ - pz) * easeOutCubic(u);
        a.mesh.position.y = a.mesh.position.y + (0.35 - a.mesh.position.y) * easeOutCubic(u);
        a.mesh.rotation.x = u * 2.4;
        a.mesh.rotation.z = u * 1.6;
        if (!a.trail) {
          a.trail = addRaidPuffCluster(raid.group, `military:raid:trail:${a.i}`, {
            seed: 71 + a.i * 13,
            opacity: 0.48,
            spread: 0.72,
            renderOrder: -1,
          });
          a.trailT0 = t;
        }
        // MC3 F9 — the trail hangs downwind of the airframe, not over it.
        a.trail.position.set(
          a.mesh.position.x + RAID_WIND_XZ[0] * 1.5,
          a.mesh.position.y + 1.1,
          a.mesh.position.z + RAID_WIND_XZ[1] * 1.5,
        );
        tickRaidPuffCluster(a.trail, t - (a.trailT0 ?? t), 1.1, this.reducedMotion);
        if (u >= 0.1 && !a.hitFlash) {
          a.hitFlash = addRaidPuffCluster(raid.group, `military:raid:hit:${a.i}`, {
            seed: 131 + a.i * 17,
            color: 0xffb464,
            opacity: RAID_EFFECT_MAX_ALPHA,
            spread: 0.66,
            renderOrder: 8,
          });
          a.hitFlash.position.copy(a.mesh.position);
          a.hitT0 = t;
        }
        if (a.hitFlash) {
          const age = t - (a.hitT0 ?? t);
          a.hitFlash.position.copy(a.mesh.position);
          tickRaidPuffCluster(a.hitFlash, age, RAID_HIT_FLASH_S, this.reducedMotion);
        }
        if (u >= 1 && a.state !== 'wreck') {
          a.state = 'wreck';
          a.tDown = t;
          a.mesh.visible = false;
          if (a.trail) a.trail.visible = false;
          const wreck = new THREE.Group();
          wreck.name = `military:raid:wreck:${a.i}`;
          addBox(wreck, 0.85, 0.22, 0.55, this.mats.wreck, 0, 0.14, 0);
          addBox(wreck, 0.35, 0.16, 0.7, this.mats.wreck, 0.4, 0.12, 0.25, { rotY: 0.6 });
          addBox(wreck, 0.22, 0.12, 0.4, this.mats.body, -0.35, 0.1, -0.2, { rotZ: 0.4 });
          // M9 item 4 — the downed airframe grounds on its own contact patch.
          const wpatch = makeContactPatch(2.1, `military:raid:wreck:${a.i}:contact`, {
            hard: true, depth: 1.5,
          });
          wpatch.position.set(0.05, RAID_DEBRIS_CONTACT_LIFT_M, 0.05);
          wreck.add(wpatch);
          wreck.position.set(apronX, 0.08, apronZ);
          wreck.rotation.y = a.i * 0.7;
          raid.group.add(wreck);
          a.wreck = wreck;
        }
        continue;
      }
      const u = clamp01(t / arrive);
      const eased = easeInOutCubic(u);
      let x = entry.x + (target.x - entry.x) * eased + weave + a.ox * (1 - eased);
      let z = entry.z + (target.z - entry.z) * eased + a.oz * (1 - eased);
      let y = RAID_ENTRY_ALT_M + bob;
      if (phase === 'fight' || phase === 'intercept') {
        // MC2 F9 — one readable cluster over the roof, not a ring wider than the shed.
        const orbit = (t * 1.4) + (a.i * 0.68);
        const ring = RAID_ENGAGE_R - (a.i % 3) * 0.75;
        x = target.x + Math.cos(orbit) * ring + weave * 0.14;
        z = target.z + Math.sin(orbit) * ring * 0.88;
        y = 7.2 + (a.i % 3) * 0.55 + bob;
        a.mesh.rotation.z = Math.cos(orbit) * 0.35;
        a.mesh.rotation.y = orbit + Math.PI / 2;
      }
      if ((phase === 'dive' || phase === 'smoke') && a.combatant && !a.willDown) {
        const du = clamp01((t - dive) / 1.6);
        const k = easeInOutCubic(du);
        const land = raid.apron ?? target;
        x = a.mesh.position.x + (land.x - a.mesh.position.x) * k;
        z = a.mesh.position.z + (land.z - a.mesh.position.z) * k;
        y = 14 + (0.45 - 14) * k;
        a.mesh.rotation.x = du * 0.55;
      }
      if (phase === 'smoke' && !a.willDown) a.mesh.visible = false;
      a.mesh.position.set(x, y, z);
      if (phase === 'inbound' || phase === 'intercept') {
        const yaw = Math.atan2(target.x - entry.x, target.z - entry.z);
        a.mesh.rotation.y = yaw;
        a.mesh.rotation.z = Math.sin(t * 1.7 + a.i) * 0.22;
      }
    }

    for (const it of raid.interceptors) {
      const meetT = 1.6;
      const u = clamp01((t - 1.1) / Math.max(0.2, meetT));
      // MC2 F9 — the interceptor joins the attackers' own orbit on the far side,
      // so both forces occupy the same pixels instead of two empty halves.
      const counter = (-t * 1.35) + Math.PI + (it.i * 1.1);
      const ring = RAID_ENGAGE_R + 1.4;
      const mid = {
        x: target.x + Math.cos(counter) * ring,
        z: target.z + Math.sin(counter) * ring * 0.88,
      };
      if (t < 1.1) {
        it.mesh.position.set(it.origin.x, 2.2 + t * 12, it.origin.z);
        it.mesh.rotation.x = -0.45;
      } else {
        const poseU = easeInOutCubic(u);
        const x = it.origin.x + (mid.x - it.origin.x) * poseU;
        const z = it.origin.z + (mid.z - it.origin.z) * poseU;
        const y = 12 + ((8.4 - 12) * poseU) + Math.sin(t * 3 + it.i) * 0.4;
        it.mesh.position.set(x, y, z);
        it.mesh.rotation.y = counter + Math.PI / 2;
        it.mesh.rotation.z = Math.sin(t * 2.1) * 0.28;
      }
      if (t > fight + 2) it.mesh.visible = t < settle;
    }

    const tanks = unitsLayer?.units;
    if (tanks) {
      for (const rec of tanks.values()) {
        if (rec.kind !== 'tank' || !rec.mesh?.userData?.turret) continue;
        const parsed = parseBlockId(rec.blockId);
        const tParsed = parseBlockId('3,1');
        const range = parsed
          ? Math.abs(parsed.bx - (tParsed?.bx ?? 3)) + Math.abs(parsed.bz - (tParsed?.bz ?? 1))
          : 2;
        if (range > 2 && rec.blockId) {
          const bx = parsed.bx;
          const bz = parsed.bz;
          const portBx = Math.floor(((target.x - ROAD) / PITCH));
          const portBz = Math.floor(((target.z - ROAD) / PITCH));
          if (Math.abs(bx - portBx) + Math.abs(bz - portBz) > 2) continue;
        }
        const turret = rec.mesh.userData.turret;
        const aim = Math.atan2(target.x - rec.visual.x, target.z - rec.visual.z) - rec.visual.yaw;
        turret.rotation.y = aim;
        if (phase === 'intercept' || phase === 'fight') {
          const kick = Math.sin(t * 22) > 0.65 ? 0.12 : 0;
          turret.position.z = -0.15 - kick;
        }
      }
    }

    for (let i = 0; i < raid.tracers.length; i += 1) {
      const tr = raid.tracers[i];
      const live = phase === 'intercept' || phase === 'fight';
      tr.visible = live && Math.sin(t * 18 + i) > 0.15;
      if (!tr.visible) continue;
      const a = raid.attackers[i % raid.attackers.length];
      const it = raid.interceptors[i % Math.max(1, raid.interceptors.length)];
      const from = it?.mesh.position ?? raid.entry;
      const to = a?.mesh.position ?? target;
      const fx = from.x ?? 0;
      const fy = from.y ?? 12;
      const fz = from.z ?? 0;
      const tx = to.x ?? 0;
      const ty = to.y ?? 12;
      const tz = to.z ?? 0;
      const len = Math.hypot(tx - fx, ty - fy, tz - fz);
      if (!Number.isFinite(len) || len < 0.35) {
        tr.visible = false;
        continue;
      }
      tr.position.set((fx + tx) * 0.5, (fy + ty) * 0.5, (fz + tz) * 0.5);
      tr.scale.set(1, 1, len);
      _tracerDir.set(tx - fx, ty - fy, tz - fz).normalize();
      tr.quaternion.setFromUnitVectors(_tracerAxis, _tracerDir);
    }

    if (phase === 'dive' || phase === 'smoke') {
      if (!raid.boom) {
        const apron = raid.apron ?? this._apronPoint(city);
        raid.apron = apron;
        const boom = addRaidPuffCluster(raid.group, 'military:raid:boom', {
          seed: 211,
          color: 0xff9a4c,
          opacity: RAID_EFFECT_MAX_ALPHA,
          spread: 0.88,
          renderOrder: 7,
        });
        boom.position.set(apron.x, apron.y + 0.55, apron.z);
        raid.boom = boom;
        // M10 item 4 — the aggregate under everything else. It draws FIRST
        // (renderOrder 1 against the scorch's 5 and the soot's 3), so the burn
        // and the blown soot multiply on top of it and keep their own edges.
        const grain = new THREE.Mesh(GRAIN_GEOM, GRAIN_MAT);
        grain.name = 'military:raid:apron-grain';
        grain.rotation.x = -Math.PI / 2;
        grain.scale.set(RAID_GRAIN_R * 2, RAID_GRAIN_R * 2, 1);
        grain.position.set(apron.x, apron.y + RAID_GRAIN_LIFT_M, apron.z);
        grain.renderOrder = 1;
        grain.castShadow = false;
        grain.receiveShadow = false;
        grain.userData.contactStamp = true;
        noPick(grain);
        raid.group.add(grain);
        raid.grain = grain;
        // M9 item 4 — a broken-edged multiply burn, not an opaque 18-gon.
        const scorch = addScorchDecal(raid.group, RAID_SCORCH_R, 'military:raid:scorch', 13);
        scorch.position.set(apron.x, apron.y + RAID_SCORCH_LIFT_M, apron.z);
        raid.scorch = scorch;
        // M7 item 1 — the soot fan. A burn on an apron in wind does not stop at
        // the edge of its own crater; the blown soot is what says which way the
        // wind is running, and it ties the disc to the column standing over it.
        const fan = new THREE.Mesh(SOOT_GEOM, this.mats.soot);
        fan.name = 'military:raid:soot-fan';
        fan.rotation.set(-Math.PI / 2, 0, -Math.atan2(RAID_WIND_XZ[1], RAID_WIND_XZ[0]));
        fan.scale.set(RAID_SOOT_FAN_LEN, RAID_SCORCH_R * 2.1, 1);
        fan.position.set(
          apron.x + RAID_WIND_XZ[0] * RAID_SOOT_FAN_LEN * 0.32,
          apron.y + RAID_SOOT_LIFT_M,
          apron.z + RAID_WIND_XZ[1] * RAID_SOOT_FAN_LEN * 0.32,
        );
        fan.renderOrder = 3;
        fan.castShadow = false;
        fan.receiveShadow = false;
        noPick(fan);
        raid.group.add(fan);
        raid.sootFan = fan;
        // MC3 F9 — the column stands downwind of the apron the actors and the
        // debris occupy, and draws before them, so it is never the thing between
        // the camera and an actor. M7 item 1 — and it is now a stacked, seeded,
        // unlit billow column with a lit rim, not a translucent lit cylinder.
        if (!this._keyRef) this._keyRef = findKeyLight(this.root);
        const key = readKeyLight(this._keyRef);
        const col = addSmokeColumn(raid.group, this.mats, 'military:raid:column', {
          seed: 11, wind: RAID_WIND_XZ, keyDir: key?.dir ?? null,
        });
        col.position.set(apron.x, apron.y, apron.z);
        raid.column = col;
        raid.embers = addEmbers(raid.group, this.mats, 'military:raid:embers', 0);
        raid.embers.position.set(apron.x, apron.y, apron.z);
        const debris = new THREE.Group();
        debris.name = 'military:raid:debris';
        for (let i = 0; i < 5; i += 1) {
          const ox = (hash01(i * 7 + 1) - 0.5) * 5.2;
          const oz = (hash01(i * 5 + 3) - 0.5) * 4.4;
          const w = 0.55 + hash01(i) * 0.4;
          const yaw = hash01(i + 4) * 1.4;
          addBox(debris, w, 0.16, 0.4, this.mats.wreck, ox, 0.1, oz, { rotY: yaw });
          // M9 item 4 — MC4 pack-c: "ambient-flat lighting with no contact
          // shadows". A 0.16 m plate on the deck is inside the shadow map's
          // resolving limit whatever its `castShadow` says (this lane's own
          // `GROUND_CASTER_CLEARANCE_M` turns those casters off for exactly
          // that reason), so the contact has to be stamped. One multiply patch
          // per fragment at 1.8x its own plan, on its own heading.
          const patch = makeContactPatch(w * 1.9, `military:raid:debris:contact:${i}`, {
            hard: true, depth: 0.4 * 2.2,
          });
          patch.position.set(ox, RAID_DEBRIS_CONTACT_LIFT_M, oz);
          patch.rotation.z = -yaw;
          debris.add(patch);
        }
        debris.position.set(apron.x, apron.y, apron.z);
        raid.group.add(debris);
        raid.debris = debris;
        // The burning-site mass did not exist during the first late-subtree
        // walk.  Enrol it now; visibility synchronisation makes the short boom
        // disappear from the reflection when it disappears from the scene.
        if (raid.water && !raid.water.enrolledLate) {
          raid.water.enrolledLate = addReflectionSources(raid.group, {
            minHeight: 0.25, minSpan: 0.45, cap: 12,
          });
        }
      }
      tickRaidPuffCluster(raid.boom, t - dive, RAID_BOOM_S, this.reducedMotion);
      if (raid.column) {
        raid.column.visible = true;
        tickSmokeColumn(raid.column, t, this.reducedMotion);
      }
      if (raid.embers) {
        raid.embers.visible = true;
        tickEmbers(raid.embers, t, RAID_WIND_XZ, this.reducedMotion);
      }
    }
  }

  _ensureSea(row) {
    if (this.sea && this.sea.id === row.id) return this.sea;
    this._clearSea();
    const port = this._port();
    const logistics = port?.userData?.logistics;
    const holder = port?.getObjectByName('fringe:ship:warship-a') ?? null;
    const group = new THREE.Group();
    group.name = 'military:seafight';
    this.root.add(group);
    const approach = logistics?.containerBerth
      ? containerApproachWaypoints(logistics.containerBerth.x, logistics.containerBerth.z)
      : containerApproachWaypoints(40, 22);
    holder?.updateWorldMatrix?.(true, true);
    const origin = holder
      ? { x: holder.position.x, y: holder.position.y, z: holder.position.z }
      : { x: 200, y: 0.2, z: 40 };
    const skiffs = [];
    for (let i = 0; i < SEA_SKIFF_COUNT; i += 1) {
      const s = addSkiff(group, this.mats, `military:skiff:${i}`);
      skiffs.push({ mesh: s, i, origin });
    }
    if (holder && !this._warshipRest) {
      this._warshipRest = {
        x: holder.position.x,
        y: holder.position.y,
        z: holder.position.z,
      };
    }
    if (holder) dressWarship(holder);
    this.sea = {
      id: row.id,
      row,
      group,
      skiffs,
      holder,
      logistics,
      approach,
      origin,
      outcome: row.outcome ?? 'repelled',
      phase: 'approach',
      wake: null,
    };
    return this.sea;
  }

  _clearSea() {
    // P14 M11 item 2 — the shader must not keep a V behind a hull that has
    // been torn down. Only this layer's own slot is cleared.
    clearOceanWakeHulls('military:sea');
    this._speeds.clear();
    if (this.sea?.group) {
      disposeOwned(this.sea.group);
      this.sea.group.parent?.remove(this.sea.group);
    }
    const holder = this.sea?.holder;
    if (holder && this._warshipRest) {
      holder.position.set(this._warshipRest.x, this._warshipRest.y, this._warshipRest.z);
      holder.userData.driven = false;
    }
    this.sea = null;
  }

  _tickSea(t) {
    const sea = this.sea;
    if (!sea) return;
    const approachT = 2.4;
    const gunsT = 5.2;
    const endT = 9.0;
    const logistics = sea.logistics;
    const toWorld = logistics?.toWorld?.bind(logistics);
    const wp = sea.approach;
    sea.phase = t < approachT ? 'approach' : t < gunsT ? 'guns' : t < endT ? 'resolve' : 'done';
    const origin = sea.origin ?? { x: 200, y: 0.2, z: 40 };
    const holder = sea.holder;
    let hx = origin.x;
    let hz = origin.z;
    if (holder && toWorld) {
      holder.userData.driven = true;
      const u = clamp01((t - 0.6) / 4.2);
      const pose = shipDepartPose(u, wp, 4.2);
      const w = toWorld(pose.x, 0, pose.z);
      holder.position.set(w.x, w.y + pose.y, w.z);
      hx = holder.position.x;
      hz = holder.position.z;
      const bob = holder.children?.[0];
      /*
       * ── P14 M10 ITEM 1 — THE HULL IS PUT ON THE SEA, NOT NEAR IT. ──
       *
       * `holder.position.y` is whatever the logistics frame returns (measured
       * -0.0549 at the seafight), so the dress's waterline datum — local
       * `WATER_Y` — landed at -0.0349 while the drawn surface over it was at
       * +0.072. Ten centimetres under, which put every water decal the hull
       * carries UNDER `nature:water:ocean` at 0.02 and `nature:water:beach-foam`
       * at 0.038, where the depth test discards them.
       *
       * `bob.position.y` is solved so the datum lands ON the sampled surface:
       *     world waterline = holder.y + bob.y + WATER_Y = seaY
       * which is exact by construction and needs no tuning constant. The heave
       * is low-passed (tau 0.28 s) so it reads as displacement rather than as a
       * per-frame jitter, and the attitude comes from the surface gradient
       * measured on a 6 m arm — the hull LIES ALONG the water instead of
       * holding a fixed tilt.
       */
      const ride = this._ride('navy');
      // The hull's OWN ends: HULL_PLAN runs -14.60 to +13.40 about the dress
      // origin, so 14.0 m of half-length, and the maximum half-beam is 3.46.
      const frame = seaHullFrame(
        (x, z) => this._seaAt(x, z), hx, hz, holder.rotation.y ?? 0,
        NAVY_HALF_LEN_M, NAVY_HALF_BEAM_M, this._seaFrame,
      );
      ride.step({
        h: frame.h, pitch: frame.pitch, roll: frame.roll,
        dt: this._seaDt, reduced: this.reducedMotion, meanY: WATER_Y,
      });
      sea.ride = {
        y: ride.y, pitch: ride.pitch, roll: ride.roll, sample: frame.h,
        bow: frame.bow, stern: frame.stern,
      };
      if (bob) {
        bob.position.y = ride.y - WATER_Y - holder.position.y;
        // `pose.pitch` is the departure trim the logistics pose asks for; the
        // swell's own pitch is added to it, not substituted for it.
        bob.rotation.z = pose.pitch + ride.pitch;
        bob.rotation.x = ride.roll;
      }
      const flashOn = sea.phase === 'guns' && Math.sin(t * 26) > 0.35;
      const recoil = flashOn ? 1 : 0;
      const lead = sea.skiffs[0]?.mesh;
      const aimYaw = lead
        ? Math.atan2(lead.position.x - hx, lead.position.z - hz)
        : 0;
      // M9 item 3 — the hull's own tapering stern wake, off `warship-dress`,
      // instead of `addDepartWake`'s seven stacked rectangular strips.
      tickWarshipDress(holder, {
        flashOn,
        recoil,
        time: t,
        reducedMotion: this.reducedMotion,
        aimYaw,
        underway: u > 0.08,
        // The collar, the plan shade, the bow wave and the wake take the heave
        // (they are inside `bob`) and refuse the pitch and the roll.
        level: bob ?? null,
      });
      sea.wake = holder.userData?.dress?.wake ?? null;
    }

    for (const s of sea.skiffs) {
      const u = clamp01((t - s.i * 0.28) / 4.6);
      // MC2 F2 — one echelon on a known axis, stepped by SKIFF_STEP_M, with a
      // small along-view stagger so they read as three boats and not one bar.
      const lane = 1 - s.i;
      const drift = this.reducedMotion ? 0 : Math.sin(t * 0.9 + s.i * 1.3) * 1.6;
      const x = hx + SKIFF_BASE_XZ[0]
        + (lane * SKIFF_STEP_M * SKIFF_AXIS_XZ[0])
        + (SKIFF_STAGGER_M * (s.i % 2 ? 1 : -1) * -SKIFF_AXIS_XZ[1]);
      const z = hz + SKIFF_BASE_XZ[1]
        + (lane * SKIFF_STEP_M * SKIFF_AXIS_XZ[1])
        + (SKIFF_STAGGER_M * (s.i % 2 ? 1 : -1) * SKIFF_AXIS_XZ[0])
        + drift;
      // Heading: every skiff is turned toward the hull it is attacking. The M4
      // code carried an orbit angle here; the echelon has no orbit, so the
      // bearing is taken from the geometry.
      const ang = Math.atan2(hx - x, hz - z);
      s.mesh.visible = true;
      /*
       * ── P14 M10 ITEM 1 — THE SKIFF RIDES THE SAME SEA. ──
       *
       * `0.22 + sin(t * 2.2 + i) * 0.1` was a hand-authored bob: a 0.2 m
       * sinusoid at 0.35 Hz with no relation to the water under it, on a boat
       * whose foam rings were a quarter of a metre in the air. The heave is the
       * sampled surface now, and the tilt is its gradient; the authored datum
       * survives as `SKIFF_FREEBOARD`, so at still water the boat is back at
       * 0.22 and the M9 composition is unchanged.
       */
      const ride = this._ride(`skiff${s.i}`);
      // The skiff is built bow-to-+Z, so its heading in the sampler's frame is
      // `ang - PI/2`; the hull box is 6.4 m long and 2.15 across.
      const frame = seaHullFrame(
        (px, pz) => this._seaAt(px, pz), x, z, ang - Math.PI / 2,
        SKIFF_HALF_LEN_M, SKIFF_HALF_BEAM_M, this._seaFrame,
      );
      ride.step({
        h: frame.h, pitch: frame.pitch, roll: frame.roll,
        dt: this._seaDt, reduced: this.reducedMotion, meanY: WATER_Y,
      });
      const floatY = ride.y + SKIFF_FREEBOARD;
      const tilt = s.mesh.userData.tilt ?? s.mesh;
      /*
       * ── THE SKIFF IS BUILT BOW-TO-+Z, SO ITS PITCH IS ROTATION.X. ──
       *
       * The first cut copied the warship's mapping (`rotation.z = pitch`,
       * `rotation.x = roll`), which is right for a hull built bow-to-+X and
       * exactly wrong for one built bow-to-+Z: rotation about the bow axis is a
       * ROLL. The burst caught it as a standing anti-symmetric error — skiff 0
       * read **-0.57 m at the bow and +0.58 m at the stern** on every frame,
       * the right magnitude tipped the wrong way — while skiff 2, on a
       * different heading, read ±0.13. Same numbers, correct axes:
       *   bow-up is a NEGATIVE rotation about +X (Rx maps +Z to (0,-sin,cos));
       *   the port side is local +X, and lifting it is a POSITIVE rotation
       *   about +Z (Rz maps +X to (cos,sin,0)).
       * The sinking attitude keeps its own authored terms on their own axes.
       */
      const ridePitchX = -ride.pitch;
      const rideRollZ = ride.roll;
      if (sea.outcome === 'repelled' && t >= gunsT + s.i * 0.45) {
        const sink = clamp01((t - (gunsT + s.i * 0.45)) / 1.8);
        s.mesh.position.set(x, floatY - sink * 1.55, z);
        tilt.rotation.z = rideRollZ + sink * 0.95;
        tilt.rotation.x = ridePitchX + sink * 0.55;
        s.mesh.rotation.y = ang;
        // M11 item 2 — the strip stays hidden; the shader wake drops out for
        // this hull the moment `_feedSeaWake` sees it going under.
        if (s.mesh.userData.wake) s.mesh.userData.wake.visible = false;
        if (s.mesh.userData.muzzle) s.mesh.userData.muzzle.visible = false;
      } else if (sea.outcome === 'loss' && t >= gunsT) {
        const scatter = clamp01((t - gunsT) / 2);
        s.mesh.position.set(x + (s.i - 1) * 6 * scatter, floatY, z + scatter * 10);
        tilt.rotation.z = rideRollZ;
        tilt.rotation.x = ridePitchX;
        s.mesh.rotation.y = ang + scatter * (s.i - 1);
      } else {
        s.mesh.position.set(x, floatY, z);
        tilt.rotation.z = rideRollZ;
        tilt.rotation.x = ridePitchX;
        s.mesh.rotation.y = ang;
        if (s.mesh.userData.muzzle) {
          s.mesh.userData.muzzle.visible = sea.phase === 'guns' && Math.sin(t * 18 + s.i) > 0.25;
        }
      }
      // The decal groups hang off `g`, so they already take the heave and the
      // heading. They must also refuse the tilt, and `g` has no tilt of its own
      // to invert — which is exactly why the hull got its own tilt group.
      if (s.mesh.userData.water) s.mesh.userData.water.quaternion.identity();
      if (s.mesh.userData.wake) s.mesh.userData.wake.quaternion.identity();
      s.ride = { y: ride.y, pitch: ride.pitch, roll: ride.roll, sample: frame.h };
    }

    if (sea.phase === 'guns' && !this.reducedMotion) {
      if (!sea.splashes) {
        sea.splashes = [];
        for (let i = 0; i < 3; i += 1) {
          const splash = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5), this.mats.foam);
          splash.name = `military:navy:splash:${i}`;
          sea.group.add(splash);
          sea.splashes.push(splash);
        }
        sea.seaTracers = [addTracer(sea.group, this.mats), addTracer(sea.group, this.mats)];
      }
      for (let i = 0; i < sea.splashes.length; i += 1) {
        const sk = sea.skiffs[i]?.mesh;
        const on = Math.sin(t * 14 + i) > 0.1;
        sea.splashes[i].visible = on && Boolean(sk);
        if (sk) {
          // P14 M10 item 1 — a shell splash stands IN the water, so its foot is
          // the sampled surface beside the boat it is aimed at, not y 0.35.
          const base = sea.skiffs[i]?.ride?.y ?? WATER_Y;
          sea.splashes[i].position.set(
            sk.position.x + Math.sin(t * 9 + i) * 1.2,
            base + 0.33 + Math.abs(Math.sin(t * 20 + i)) * 0.8,
            sk.position.z + 0.6,
          );
          sea.splashes[i].scale.setScalar(0.8 + Math.abs(Math.sin(t * 20 + i)));
        }
      }
      for (let i = 0; i < sea.seaTracers.length; i += 1) {
        const tr = sea.seaTracers[i];
        const sk = sea.skiffs[i]?.mesh;
        tr.visible = Boolean(sk) && Math.sin(t * 22 + i) > 0.2;
        if (!tr.visible || !sk || !holder) continue;
        const fx = hx + 6;
        const fy = 2.6;
        const fz = hz;
        const tx = sk.position.x;
        const ty = sk.position.y + 0.8;
        const tz = sk.position.z;
        const len = Math.hypot(tx - fx, ty - fy, tz - fz);
        if (!Number.isFinite(len) || len < 0.4) {
          tr.visible = false;
          continue;
        }
        tr.position.set((fx + tx) * 0.5, (fy + ty) * 0.5, (fz + tz) * 0.5);
        tr.scale.set(1, 1, len);
        _tracerDir.set(tx - fx, ty - fy, tz - fz).normalize();
        tr.quaternion.setFromUnitVectors(_tracerAxis, _tracerDir);
      }
    } else if (sea.splashes) {
      for (const splash of sea.splashes) splash.visible = false;
      for (const tr of sea.seaTracers ?? []) tr.visible = false;
    }

    if (sea.outcome === 'loss') this._burntBay(true);
    else this._burntBay(false);
    this._feedSeaWake(sea, holder, t);
  }

  /**
   * ── P14 M11 ITEM 2 — THE HULLS THE OCEAN SHADER IS TOLD ABOUT. ──
   *
   * Four entries at most (navy plus three skiffs) inside an eight-slot array.
   * Everything here is measured off the pose the frame is about to draw:
   *
   *   heading   the smoothed TRACK (see `_hullMotion`), falling back to the
   *             model's own bow axis when the hull is stopped. A warship is
   *             built bow-to-+X, so `rotation.y = yaw` puts forward at
   *             `(cos yaw, -sin yaw)`; a skiff is built bow-to-+Z, so forward
   *             is `(sin ang, cos ang)`. Both are turned into the shader's
   *             `atan2(fz, fx)` bearing here rather than guessed there.
   *   speed     `_hullMotion`, differentiated, capped and low-passed.
   *   span      the hull's own half-length and half-beam, the same two numbers
   *             `seaHullFrame` samples the ride at.
   *
   * A sinking or scattered skiff drops out: a boat 1.55 m under the surface is
   * not making a wake, and leaving it in put a V behind a hull that was gone.
   */
  _feedSeaWake(sea, holder, t) {
    const feed = this._wakeFeed;
    feed.length = 0;
    if (!this.reducedMotion && holder && sea.phase !== 'done') {
      const yaw = holder.rotation.y ?? 0;
      const m = this._hullMotion(
        'navy', holder.position.x, holder.position.z,
        Math.atan2(-Math.sin(yaw), Math.cos(yaw)),
      );
      feed.push({
        x: holder.position.x,
        z: holder.position.z,
        heading: m.heading,
        speed: m.speed,
        halfLen: NAVY_HALF_LEN_M,
        halfBeam: NAVY_HALF_BEAM_M,
      });
    }
    if (!this.reducedMotion) {
      for (const s of sea.skiffs ?? []) {
        const mesh = s.mesh;
        if (!mesh?.visible) continue;
        const afloat = (s.ride?.y ?? WATER_Y) - mesh.position.y + SKIFF_FREEBOARD;
        // `floatY = ride.y + SKIFF_FREEBOARD`, so a boat still on its ride
        // measures 0 here and a sinking one measures its own submergence.
        if (afloat > 0.35) continue;
        const ang = mesh.rotation.y ?? 0;
        const mo = this._hullMotion(
          `skiff${s.i}`, mesh.position.x, mesh.position.z,
          Math.atan2(Math.cos(ang), Math.sin(ang)),
        );
        feed.push({
          x: mesh.position.x,
          z: mesh.position.z,
          heading: mo.heading,
          speed: mo.speed,
          halfLen: SKIFF_HALF_LEN_M,
          halfBeam: SKIFF_HALF_BEAM_M,
        });
      }
    }
    this.wakeStats = {
      t,
      fed: feed.length,
      live: setOceanWakeHulls('military:sea', feed).length,
    };
    return this.wakeStats;
  }

  _burntBay(on) {
    const port = this._port();
    const holder = port?.getObjectByName('fringe:ship:container');
    const bob = holder?.children?.[0] ?? holder;
    if (!bob) return;
    let mark = bob.getObjectByName('military:burnt-bay');
    if (!on) {
      if (mark) mark.visible = false;
      return;
    }
    if (!mark) {
      mark = new THREE.Group();
      mark.name = 'military:burnt-bay';
      addBox(mark, 4.4, 2.2, 3.2, this.mats.wreck, 2.4, 3.1, 0.4);
      addBox(mark, 4.4, 0.12, 3.2, this.mats.scorch, 2.4, 2.05, 0.4);
      addSphere(mark, 1.1, 8, this.mats.smoke, 2.4, 4.4, 0.4);
      bob.add(mark);
    }
    mark.visible = true;
    const smoke = mark.children.find((ch) => ch.isMesh && ch.geometry?.type === 'SphereGeometry');
    if (smoke) {
      smoke.position.y = 4.4 + Math.sin(this.time * 1.6) * 0.25;
      smoke.material.opacity = 0.35 + Math.abs(Math.sin(this.time * 1.3)) * 0.15;
    }
  }

  _tickDamage(world, city, elapsed) {
    const damaged = world?.facilities?.damaged ?? {};
    const beat = world?.beat ?? 0;
    const keys = new Set(Object.keys(damaged));
    if (this.demoLock && this.demo?.raid?.outcome === 'damage') keys.add(this.demo.raid.targetFacility ?? 'port');
    for (const key of keys) {
      const live = this.demoLock || liveFacilityDamage(world, key, beat);
      let rec = this.damage.get(key);
      if (!live) {
        if (rec) this._playRepair(rec);
        continue;
      }
      if (!rec) {
        rec = this._makeDamage(key, city);
        this.damage.set(key, rec);
      }
      rec.repairing = false;
      rec.group.visible = true;
      if (rec.column) tickSmokeColumn(rec.column, elapsed, this.reducedMotion);
      if (rec.licks) {
        for (let i = 0; i < rec.licks.length; i += 1) {
          const lick = rec.licks[i];
          lick.visible = true;
          lick.scale.y = 0.7 + Math.abs(Math.sin(elapsed * 9 + i)) * 0.8;
          lick.position.y = rec.scorch.position.y + 0.55 + Math.abs(Math.sin(elapsed * 9 + i)) * 0.35;
        }
      }
    }
    const fire = this._findCityFire();
    if (fire && keys.size) {
      const pt = this._facilityPoint([...keys][0], city);
      fire.visible = true;
      fire.position.set(pt.x, pt.y, pt.z);
    }
  }

  _findCityFire() {
    let node = this.root;
    while (node?.parent) node = node.parent;
    const cached = this._cityFireLookup;
    if (cached?.scene === node && cached.owner.parent === node
      && cached.owner.name === 'world-deliveries' && cached.fire.parent === cached.owner
      && cached.fire.name === 'city-fire') return cached.fire;
    // WorldDeliveriesLayer owns this direct child. Missing effects must not
    // trigger a recursive walk of the city, nor be cached across late creation.
    const owner = node?.children?.find((child) => child.name === 'world-deliveries');
    const fire = owner?.children.find((child) => child.name === 'city-fire') ?? null;
    this._cityFireLookup = fire ? { scene: node, owner, fire } : null;
    return fire;
  }

  _makeDamage(key, city) {
    const pt = this._facilityPoint(key, city);
    const g = new THREE.Group();
    g.name = `military:damage:${key}`;
    g.position.set(pt.x, 0, pt.z);
    // M9 item 4 — same burn, same reason: the facility scorch was a 16-gon.
    const scorch = addScorchDecal(g, 5.4, `military:damage:${key}:scorch`, 29);
    scorch.position.y = Math.max(0.08, pt.y + 0.05);
    // MC3 F9 — the facility column is the other half of the raid-t1/t4 mass the
    // audit read as one cauliflower. Same law: downwind, and drawn first.
    // M7 item 1 — and the same billow stack as the crash column, at 0.78 scale
    // and with a quieter rim, because at t1/t4 this one shares the frame with
    // the actors whose plates the F9 value gap protects.
    if (!this._keyRef) this._keyRef = findKeyLight(this.root);
    const dmgKey = readKeyLight(this._keyRef);
    const col = addSmokeColumn(g, this.mats, `military:damage:${key}:column`, {
      seed: 29, scale: 0.78, wind: RAID_WIND_XZ, keyDir: dmgKey?.dir ?? null, rimOpacity: 0.62,
    });
    col.position.set(0, pt.y, 0);
    const licks = [];
    for (let i = 0; i < 4; i += 1) {
      const lick = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.85, 0.18), this.mats.fire);
      lick.position.set((i - 1.5) * 0.7, pt.y + 0.7, (i % 2 ? 0.4 : -0.35));
      noPick(lick);
      g.add(lick);
      licks.push(lick);
    }
    this.root.add(g);
    return { key, group: g, column: col, scorch, licks, repairing: false, repairT: 0, scaffold: null };
  }

  _playRepair(rec) {
    if (!rec.scaffold) {
      const sc = new THREE.Group();
      sc.name = `military:repair:${rec.key}`;
      addBox(sc, 8.4, 0.18, 8.4, this.mats.scaffold, 0, 0.4, 0);
      addBox(sc, 0.22, 6.2, 0.22, this.mats.scaffold, -3.6, 3.2, -3.6);
      addBox(sc, 0.22, 6.2, 0.22, this.mats.scaffold, 3.6, 3.2, -3.6);
      addBox(sc, 0.22, 6.2, 0.22, this.mats.scaffold, -3.6, 3.2, 3.6);
      addBox(sc, 0.22, 6.2, 0.22, this.mats.scaffold, 3.6, 3.2, 3.6);
      addToyPerson(sc, this.mats.vest, -1.4, 0, 1.1, { h: 2.4, r: 0.4 });
      addToyPerson(sc, this.mats.vest, 1.6, 0, -0.8, { h: 2.4, r: 0.4 });
      rec.group.add(sc);
      rec.scaffold = sc;
      rec.repairT = this.time;
    }
    const u = clamp01((this.time - rec.repairT) / 2.2);
    rec.group.traverse((ch) => {
      if (!ch.isMesh || !ch.material) return;
      const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
      for (const m of mats) {
        if ('opacity' in m) {
          m.transparent = true;
          const burn = m === this.mats.scorch || m.userData?.scorchDecal;
          m.opacity = (burn ? 0.72 : 0.9) * (1 - u);
        }
      }
    });
    if (u >= 1) {
      rec.group.parent?.remove(rec.group);
      this.damage.delete(rec.key);
    }
  }

  _ingest(world, city, unitsLayer) {
    if (this.demoLock && this.demo) {
      if (!this.raid) {
        this._ensureRaid({
          id: 'demo-raid',
          kind: 'drones',
          strength: this.demo.raid.strength,
          interceptors: this.demo.raid.interceptors,
          targetFacility: this.demo.raid.targetFacility,
          outcome: this.demo.raid.outcome,
        }, city, unitsLayer);
      }
      if (!this.sea) {
        this._ensureSea({
          id: 'demo-sea',
          kind: 'pirates',
          basinId: 'bass',
          outcome: this.demo.sea.outcome,
          interceptors: this.demo.sea.interceptors,
        });
      }
      return;
    }
    if (!world) return;
    const rows = [...beatDeliveries(world)];
    const drone = rows.find((r) => r.cause === 'threat-strike' && r.kind === 'drones')
      ?? liveThreats(world).find((r) => r.kind === 'drones' && r.outcome);
    if (drone) this._ensureRaid(drone, city, unitsLayer);
    const pirate = rows.find((r) => bassSeaFightEligible(r))
      ?? liveThreats(world).find((r) => r.kind === 'pirates' && r.basinId === 'bass' && r.outcome);
    if (pirate) this._ensureSea(pirate);
  }

  update(dt, elapsed, city = this.city, state = null, unitsLayer = null) {
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.time += step;
    this._seaDt = step;
    // Under `reducedMotion` the ocean holds `OCEAN.freezeTime`; the hulls do not
    // ride a frozen sea, they sit at the mean — `HullRide.step` reads the flag.
    this.seaClock = Number.isFinite(elapsed) ? elapsed : this.time;
    this.city = city ?? this.city;
    const world = this._readWorld();
    this._ingest(world, city, unitsLayer);
    if (this.raid) this._tickRaid(this.time, city, unitsLayer);
    if (this.sea) this._tickSea(this.time);
    this._tickDamage(world, city, elapsed ?? this.time);
    this.statusSnapshot = {
      raid: this.raid
        ? {
          phase: this.raid.phase,
          strength: this.raid.strength,
          interceptors: this.raid.interceptCount,
          leftover: this.raid.leftover,
          swarm: this.raid.attackers.length,
          smoke: smokeEffectsCensus([
            this.raid.column,
            this.raid.boom,
            ...this.raid.attackers.flatMap((row) => [row.trail, row.hitFlash]),
          ]),
          water: this.raid.water
            ? {
              foamLit: this.raid.water.foamLit,
              foamSlots: this.raid.water.foamSlots,
              piles: this.raid.water.piles,
              sunTrackRuns: this.raid.water.sunTrackRuns,
              reflected: [...(this.raid.water.enrolled ?? []),
                ...(this.raid.water.enrolledLate ?? [])]
                .reduce((sum, row) => sum + (row.added ?? 0), 0),
            }
            : null,
        }
        : null,
      sea: this.sea
        ? { phase: this.sea.phase, outcome: this.sea.outcome, skiffs: this.sea.skiffs.length }
        : null,
    };
  }

  status() {
    return this.statusSnapshot;
  }

  /**
   * M5 — the pose a combat camera should take: centroid of everything that must
   * be in frame, the half-width it spans (`spread`), and an `azimuth` that looks
   * ACROSS the action rather than down its axis. `militaryCameraPose` turns the
   * spread into a distance. Exported as `combatFocusPoint` for the camera seat.
   */
  subject(phase) {
    if (phase === 'raid' && this.raid) {
      const land = this.raid.apron ?? this.raid.target;
      const pts = [];
      for (const a of this.raid.attackers) {
        if (a.mesh?.visible === false) continue;
        pts.push([a.mesh.position.x, a.mesh.position.z]);
      }
      for (const it of this.raid.interceptors) {
        if (it.mesh?.visible === false) continue;
        pts.push([it.mesh.position.x, it.mesh.position.z]);
      }
      pts.push([land.x, land.z]);
      const fit = focusFit(pts, 12);
      return { x: fit.x, y: 3.4, z: fit.z, spread: fit.spread };
    }
    if (phase === 'seafight' && this.sea) {
      const holder = this.sea.holder;
      const pts = [];
      let hullHalf = 0;
      if (holder) {
        holder.getWorldPosition(_v1);
        pts.push([_v1.x, _v1.z]);
        // Measure the dressed topside, not the holder box — that one carries the
        // wake and the splash meshes and reads 49 m for a 28 m ship.
        const topside = holder.getObjectByName('military:navy:topside') ?? holder;
        _seaBox.setFromObject(topside);
        hullHalf = Math.max(
          _seaBox.max.x - _seaBox.min.x,
          _seaBox.max.z - _seaBox.min.z,
        ) * 0.5;
      }
      let kx = 0;
      let kz = 0;
      let kn = 0;
      for (const row of this.sea.skiffs ?? []) {
        if (!row?.mesh) continue;
        row.mesh.getWorldPosition(_v2);
        pts.push([_v2.x, _v2.z]);
        kx += _v2.x;
        kz += _v2.z;
        kn += 1;
      }
      const fit = focusFit(pts, 10 + hullHalf * 0.35);
      // The skiff echelon axis is known; look across it. Of the two candidate
      // azimuths take the one that puts the camera on the raiders' side, so the
      // hull is the near mass and the quay stays in the background.
      const cross = (Math.atan2(-SKIFF_AXIS_XZ[1], SKIFF_AXIS_XZ[0]) * 180) / Math.PI;
      const towardRaiders = kn
        ? (Math.atan2((kx / kn) - _v1.x, (kz / kn) - _v1.z) * 180) / Math.PI
        : 118;
      const azimuth = pickAzimuth(cross, towardRaiders);
      // MC2 F5 — hold the hull under SEA_HULL_FRAME_SHARE of frame width by
      // never letting the fitted spread drop below the hull's own half-length.
      const spread = Math.max(fit.spread, hullHalf / SEA_HULL_FRAME_SHARE);
      return { x: fit.x, y: 1.2, z: fit.z, spread, azimuth };
    }
    const extent = this.city?.extent ?? cityExtent(4, 4);
    return { x: extent.x * 0.85, y: 2, z: extent.z * 0.4 };
  }

  combatFocusPoint(phase) {
    return this.subject(phase);
  }

  /**
   * MC3 F1 — the points a camera on this phase has to be able to see. The raid
   * list is the audit's own: the admin roof the swarm works over, the drone
   * cluster, the interceptors' pad and the apron debris. Every one is lifted
   * clear of its own footprint so a sightline that only grazes the ground it
   * sits on still counts as clear.
   */
  sightPoints(phase) {
    const out = [];
    const push = (label, x, y, z, weight = 1) => {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      out.push({ label, x, y, z, weight });
    };
    if (phase === 'raid' && this.raid) {
      const raid = this.raid;
      push('admin', raid.target.x, (raid.target.y ?? 4) + 1.2, raid.target.z);
      let cx = 0;
      let cz = 0;
      let cy = 0;
      let n = 0;
      for (const a of raid.attackers) {
        if (!a.mesh || a.mesh.visible === false) continue;
        cx += a.mesh.position.x;
        cy += a.mesh.position.y;
        cz += a.mesh.position.z;
        n += 1;
      }
      if (n) push('swarm', cx / n, (cy / n) + 0.8, cz / n);
      for (const it of raid.interceptors) {
        if (!it.mesh || it.mesh.visible === false) continue;
        push('interceptor', it.mesh.position.x, it.mesh.position.y + 0.8, it.mesh.position.z);
        break;
      }
      // The pad only counts while there is something on it to see. After the
      // interceptors have gone home it is a rooftop 200 m away across the city,
      // and requiring it would swing the camera off the burning apron to look
      // at an empty block.
      if (!out.some((p) => p.label === 'interceptor')
        && raid.interceptors[0]?.origin
        && raid.phase !== 'smoke') {
        const o = raid.interceptors[0].origin;
        push('pad', o.x, 3.2, o.z);
      }
      // MC3 F1 — the apron point is the DEBRIS, at debris height. M5 sampled
      // 1.6 m above the apron, which cleared the shed roof while everything
      // actually on the ground stayed behind it: the camera could pass its own
      // test and still show nothing but corrugated iron.
      const apron = raid.apron ?? raid.target;
      push('apron', apron.x, (apron.y ?? 0) + 0.35, apron.z, 2);
      if (raid.scorch?.visible) {
        push('scorch', raid.scorch.position.x, raid.scorch.position.y + 0.25, raid.scorch.position.z, 2);
      }
      if (raid.debris?.visible) {
        push('debris', raid.debris.position.x, raid.debris.position.y + 0.35, raid.debris.position.z, 2);
      }
      for (const a of raid.attackers) {
        if (a.wreck?.visible) {
          push('wreck', a.wreck.position.x, a.wreck.position.y + 0.5, a.wreck.position.z, 1);
          break;
        }
      }
      return out;
    }
    if (phase === 'seafight' && this.sea) {
      const holder = this.sea.holder;
      if (holder) {
        holder.getWorldPosition(_v1);
        push('hull', _v1.x, _v1.y + 4.5, _v1.z);
      }
      for (const row of this.sea.skiffs ?? []) {
        if (!row?.mesh) continue;
        row.mesh.getWorldPosition(_v2);
        push(row.mesh.name ?? 'skiff', _v2.x, _v2.y + 1.8, _v2.z);
      }
      return out;
    }
    return out;
  }

  dispose() {
    this._cityFireLookup = null;
    this._clearRaid();
    this._clearSea();
    this.root.parent?.remove(this.root);
  }
}
