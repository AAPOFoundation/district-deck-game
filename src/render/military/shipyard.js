// P14 M3 — dry-dock hull stages and launch. Reads world.shipyard; never writes storage.

import * as THREE from 'three';
import { NAVY_BUILD_BEATS } from '../../core/world/catalog.js';
import {
  WORLD_RUN_KEY,
  inspectWorldRun,
  worldStoreGet,
} from '../../core/world/envelope.js';
import { addBox, addCyl, addSphere, addToyLetters, noPick, WATER_Y } from '../fringe/kit.js';
import { createCityFringeMaterial } from '../materials.js';
function std(color, extra) { return createCityFringeMaterial(color, extra, 'military/shipyard.js'); }
import { addCraftHull, chamferBox, deckhouse } from '../fringe/ships.js';
import { HULL_WEATHER, addWarshipSternGear, hullWearMap } from './warship-dress.js';
import {
  clamp01,
  easeInOutCubic,
  samplePolyline,
} from '../port/logistics-anim.js';
import { addReflectionSources } from '../outer-ocean.js';
import {
  addPlanCollar,
  addPlanShade,
  addSternWake,
  foamGapAt,
  groundStamp,
  makeContactPatch,
  planRingMesh,
  readKeyLight,
  findKeyLight,
  waterFoamMaterial,
} from './units.js';
import { dressShipyardMaterials } from '../port-wear.js';
import { separateUnpairedFigures } from '../figures.js';
import { createI4FigureGroup } from '../fringe/port.js';

const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _sailStartRotation = new THREE.Quaternion();
const _sailEndRotation = new THREE.Quaternion();
const _sailRootRotation = new THREE.Quaternion();
const _launchPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.08);
const _sailYaw = new THREE.Euler();
const _wakeWorldPosition = new THREE.Vector3();
const _wakeWorldScale = new THREE.Vector3();
const _wakeForward = new THREE.Vector3();
const _wakeWorldRotation = new THREE.Quaternion();
const _wakeWorldMatrix = new THREE.Matrix4();

/** MC2 F11 — the camera azimuths the identity plates are cut to face. */
export const SHIPYARD_AZIMUTH = 148;
export const RAID_AZIMUTH = 38;
export const SEAFIGHT_AZIMUTH = 340.73;
export const PORT_NAME = 'PORT OF MELBOURNE';
/** Quay walking surface beside the slipway (ships.js APRON_TOP). */
export const APRON_STAND_Y = 0.34;
/**
 * M12 item 1 — the launch cradle's measured plan, in the legacy cradle frame.
 * The five stations register with the hull's keel and the M9 contact stamps.
 */
export const SHIPYARD_CRADLE = Object.freeze({
  stations: Object.freeze([-5.8, -2.9, 0, 2.9, 5.8]),
  wayGaugeM: 3.0,
  wayLengthM: 13.4,
  keelTopM: 1.04,
  shorePairs: 4,
  shoreLeanDeg: 25,
  chainLinksPerSide: 24,
});
/** M14 item 4 — the transient water wash is fully gone after this many seconds. */
export const SHIPYARD_WASH_LIFETIME_S = 2;
/** Peak alpha of the single normal-blended launch wash. */
export const SHIPYARD_WASH_MAX_ALPHA = 0.46;
/** Only this much of each fixed way remains visible below the waterline. */
export const SHIPYARD_SUBMERGED_WAY_MAX_M = 2.2;
/** Cross-ties end on the dry side of the waterline. */
export const SHIPYARD_TIE_WATER_CLEARANCE_M = 0.25;

/** Lean from vertical: a shipwright's shore, not an upright post. */
export function cradleShoreLeanDeg(from, to) {
  const rise = Math.abs((to?.y ?? 0) - (from?.y ?? 0));
  const run = Math.hypot((to?.x ?? 0) - (from?.x ?? 0), (to?.z ?? 0) - (from?.z ?? 0));
  return Math.atan2(run, Math.max(1e-6, rise)) * 180 / Math.PI;
}

/** Deterministic 0..1 from a string + index. This lane has no RNG at all. */
export function yardHash(key, salt = 0) {
  let h = 0x811c9dc5 ^ (salt >>> 0);
  const str = String(key);
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491) >>> 0;
  return (h >>> 8) / 16777216;
}

/**
 * MC3 F5 (STANDING VETO) — "the four central blue workers form the primary
 * straight, near-even clone rank". They were laid on four fixed lanes with a
 * fixed 1.45 m pitch down the slip: a rank, in two colours, all facing within
 * 0.34 rad of each other. Lane A8 confirmed the rank is this crowd, not
 * `addShipyardRig`, so the fix is here.
 *
 * The replacement is two lateral JOB clusters, not a rank: a chock party low
 * on the port flank working the ways, and a line party high on the starboard
 * flank working the falls. Each figure is scattered inside its cluster by a
 * seeded hash, sized and headed by its job — the chock party faces its own
 * work, the line party faces the hull — and stands on its own contact patch.
 *
 * Returned as data so the arrangement can be asserted without a renderer.
 */
export const YARD_CREW_JOBS = Object.freeze([
  Object.freeze({
    id: 'chock', side: -1, count: 5, lane: -2.86, spanZ: 4.9, spread: 1.85,
    heading: 1.15, headingJitter: 0.75, height: 2.42,
  }),
  Object.freeze({
    id: 'lines', side: 1, count: 5, lane: 3.18, spanZ: 5.6, spread: 1.6,
    heading: -1.62, headingJitter: 0.9, height: 2.62,
  }),
]);

export function yardCrewPlaces(dry, jobs = YARD_CREW_JOBS) {
  const out = [];
  for (const job of jobs) {
    for (let i = 0; i < job.count; i += 1) {
      const seed = `${job.id}:${i}`;
      const jx = (yardHash(seed, 1) - 0.5) * job.spread * 2;
      const jz = yardHash(seed, 2) * job.spanZ;
      const jy = yardHash(seed, 3);
      out.push({
        job: job.id,
        i,
        x: job.lane + jx,
        z: dry - jz - (job.side < 0 ? 0.4 : 1.5),
        heading: job.heading + ((yardHash(seed, 4) - 0.5) * job.headingJitter * 2),
        height: job.height + (jy - 0.5) * 0.34,
        radius: 0.4 + jy * 0.1,
        vest: yardHash(seed, 5) > (job.id === 'chock' ? 0.35 : 0.62),
        hat: yardHash(seed, 6) > 0.5,
        pairId: i % 2 === 0 && i + 1 < job.count ? `yard:${job.id}:${i}` : `yard:${job.id}:${i - (i % 2)}`,
      });
    }
  }
  separateUnpairedFigures(out);
  return out;
}

/** Largest count of crew sharing one x lane to within `tol` metres. */
export function widestCrewRank(places, tol = 0.25) {
  let worst = 0;
  for (const a of places) {
    let n = 0;
    for (const b of places) if (Math.abs(a.x - b.x) <= tol) n += 1;
    if (n > worst) worst = n;
  }
  return worst;
}

/** Advance width `addToyLetters` will lay down for `text` at scale `s`. */
export function toyLettersWidth(text, s, gap) {
  const chars = String(text).toUpperCase().split('');
  let cursor = 0;
  for (const ch of chars) {
    if (ch === ' ') cursor += 0.42 * s;
    else cursor += 0.78 * s + gap;
  }
  return Math.max(s, cursor - gap);
}

function worldPos(object, out) {
  object.updateWorldMatrix(true, true);
  const e = object.matrixWorld.elements;
  out.set(e[12], e[13], e[14]);
  return out;
}

/** H1BR5: shared I4 workwear, grounded on the existing slipway crew mounts. */
export function yardCrewFigure(parent, mats, place, name) {
  void mats;
  const options = {
    name,
    identity: 'hi-vis',
    wardrobe: place.vest ? 'work' : 'uniform',
    palette: { upper: place.vest ? '#e07020' : '#1c3a68', lower: '#1c3a68' },
  };
  const fig = createI4FigureGroup({
    ...options,
    pose: place.i % 3 === 1 ? 'kneel' : (place.i % 3 === 2 ? 'point' : 'stand'),
  });
  // Fit stature from the standing rig, so kneeling retains human proportions.
  const standing = createI4FigureGroup({ ...options, pose: 'stand' });
  const top = new THREE.Box3().setFromObject(standing).max.y;
  if (top > 1e-4) fig.scale.setScalar(place.height / top);
  fig.userData.i4Figure.job = place.job;
  parent.add(fig);
  return parent;
}

export const HULL_STAGES = Object.freeze(['keel', 'frames', 'plating', 'superstructure']);

/* ================================================================== *
 * P14 M10 ITEM 3 — THE YARD'S FOAM WAS FIVE OPAQUE WHITE SOLIDS AND
 * TEN UNTEXTURED SPRITES.
 *
 * MC5 pack-e: "water is a matte albedo slab with unshaded splash blobs and no
 * specular/foam breakup". The blobs are nameable and each one is a solid:
 *
 *   `military:shipyard:slip-foam` — four `addBox` solids in `mats.foam`
 *     (`std('#e8f2f6')`, opaque, no map), one 7.2 x 1.35 m band across the slab
 *     and three 1.8 x 2.1 m tongues up the bed. Four white rectangles with
 *     eight straight edges lying where the slab meets the water.
 *   the launch wash's spray — ten `THREE.Sprite`s on a `SpriteMaterial` with
 *     **no map at all**, which three renders as a SOLID QUAD. Ten opaque white
 *     squares, and the M9 note that replaced "0.22 m lit spheres" with them
 *     swapped one hard shape for another.
 *
 * Foam is broken water, so what it needs is a real alpha that dies at every
 * border. `foamAlphaTexture` is three octaves of value noise on a seeded
 * lattice, thresholded so roughly a third of the field is bare, multiplied by a
 * radial feather that is exactly zero on all four edges — so the patch has no
 * boundary anywhere, at any scale, and the material stays LIT (a standard
 * material with an alpha map still takes the key, which is the "unshaded" half
 * of the finding).
 * ================================================================== */
/** Deterministic value noise on a lattice. `yardHash` is this lane's only RNG. */
export function yardNoise2(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const at = (i, j) => yardHash(`n${i},${j}`, seed);
  const a = at(x0, y0);
  const b = at(x0 + 1, y0);
  const c = at(x0, y0 + 1);
  const d = at(x0 + 1, y0 + 1);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}
/** Share of a foam patch that carries no alpha at all. Asserted, not eyeballed. */
export const FOAM_BARE_THRESHOLD = 0.42;
/**
 * A broken foam alpha. RGBA; the colour channels are white so the same texture
 * serves as `map` for an unlit sprite and as `alphaMap` for a lit patch.
 */
export function foamAlphaTexture(size = 96, seed = 5, opts = {}) {
  const round = opts.round !== false;
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) * 0.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / (size - 1);
      const v = y / (size - 1);
      let n = yardNoise2(u * 5.1, v * 5.1, seed) * 0.55
        + yardNoise2(u * 11.3 + 3.1, v * 11.3 + 1.7, seed + 1) * 0.30
        + yardNoise2(u * 23.7 + 7.3, v * 23.7 + 5.9, seed + 2) * 0.15;
      // A real bare floor: below the threshold the foam is simply not there, so
      // the patch cannot weld into a painted plate.
      n = Math.max(0, (n - FOAM_BARE_THRESHOLD) / (1 - FOAM_BARE_THRESHOLD));
      // The feather is the geometry: zero on every border, by construction.
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const r = round ? Math.min(1, Math.hypot(dx, dy)) : Math.min(1, Math.max(Math.abs(dx), Math.abs(dy)));
      const k = 1 - r;
      const feather = k * k * (3 - 2 * k);
      const a = Math.round(255 * Math.min(1, n * 1.9) * feather);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = a;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return groundStamp(tex);
}
const FOAM_PATCH_TEX = foamAlphaTexture(96, 5, { round: false });
const LAUNCH_WASH_TEX = foamAlphaTexture(96, 17, { round: true });

/* A deterministic alpha field: oil darkens the concrete, not a rectangular
 * decal.  Every edge is zero-alpha and the two lobes break the silhouette. */
function slipOilTexture(size = 96) {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) * 0.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x - c) / c;
      const ny = (y - c) / c;
      const warp = nx + Math.sin(ny * 7.0) * 0.10;
      const a = Math.max(0, 1 - Math.hypot(warp * 1.18, ny * 0.86));
      const lobe = Math.max(0, Math.sin((nx * 5.1) + (ny * 3.7)) * 0.20 + 0.80);
      const edge = Math.min(1, Math.max(0, a * 3.2));
      const alpha = Math.round(176 * edge * edge * lobe);
      const i = (y * size + x) * 4;
      // MeshStandardMaterial.alphaMap samples GREEN, not RGBA alpha.
      data[i] = alpha;
      data[i + 1] = alpha;
      data[i + 2] = alpha;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.colorSpace = THREE.NoColorSpace;
  return groundStamp(tex);
}
const SLIP_OIL_TEX = slipOilTexture();

/* M13: deterministic timber fibres. The map is deliberately directional—
 * every block now has long grain instead of reading as another grey slab. */
export function timberGrainTexture(size = 64) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / Math.max(1, size - 1);
      const v = y / Math.max(1, size - 1);
      const curl = Math.sin((v * 8.4 + Math.sin(u * 6.1) * 0.38) * Math.PI * 2);
      const fine = Math.sin((v * 31.0 + u * 2.7) * Math.PI * 2);
      const knot = Math.max(0, 1 - Math.hypot(u - 0.68, (v - 0.42) * 2.2) * 5.2);
      const value = Math.max(64, Math.min(232, Math.round(170 + curl * 24 + fine * 9 - knot * 56)));
      const i = (y * size + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}
const TIMBER_GRAIN_TEX = timberGrainTexture();

function kit() {
  return {
    keel: std('#2a3036', { roughness: 0.42, metalness: 0.4 }),
    timber: std('#a46a38', { roughness: 0.84, metalness: 0, map: TIMBER_GRAIN_TEX }),
    block: std('#92572d', { roughness: 0.82, metalness: 0, map: TIMBER_GRAIN_TEX }),
    hardwood: std('#65351d', { roughness: 0.76, metalness: 0, map: TIMBER_GRAIN_TEX }),
    shoreTimber: std('#b47a45', { roughness: 0.80, metalness: 0, map: TIMBER_GRAIN_TEX }),
    frame: std('#8a9298', { roughness: 0.36, metalness: 0.48 }),
    /*
     * ── P14 M11 ITEM 1 — THE SHELL IS MATTE AND IT CARRIES A WEAR MAP. ──
     * MC6 pack-g, 3/10: "unbevelled primitive hull with tiled foam and
     * peg-cylinder crew". 0.46 roughness at 0.20 metal is a semi-gloss painted
     * metal and it returned one value over the whole shell under the yard's
     * hard key. Same colour, matte, and `hullWearMap` streaks the roughness
     * down the plating the way water runs.
     */
    plate: std('#2a3848', {
      roughness: HULL_WEATHER.paintedRough,
      metalness: 0.08,
      roughnessMap: hullWearMap(),
    }),
    rust: new THREE.MeshStandardMaterial({
      color: 0x6b3a1e, roughness: 0.97, metalness: 0, transparent: true,
      opacity: 0.55, depthWrite: false,
    }),
    rustDark: new THREE.MeshStandardMaterial({
      color: 0x40230f, roughness: 0.98, metalness: 0, transparent: true,
      opacity: 0.48, depthWrite: false,
    }),
    salt: new THREE.MeshStandardMaterial({
      color: 0xd9dee0, roughness: 0.99, metalness: 0, transparent: true,
      opacity: 0.30, depthWrite: false,
    }),
    skin: std('#c8a184', { roughness: 0.82, metalness: 0.02 }),
    boot2: std('#3c0f12', { roughness: 0.72, metalness: 0.06 }),
    seam: std('#1a222c', { roughness: 0.5, metalness: 0.16 }),
    boot: std('#5a1418', { roughness: 0.6, metalness: 0.12 }),
    wet: std('#c8d0d4', { roughness: 0.3, metalness: 0.2 }),
    deck: std('#3a4046', { roughness: 0.5, metalness: 0.16 }),
    super: std('#d8d4c8', { roughness: 0.70, metalness: 0.04 }),
    window: std('#1a2430', { roughness: 0.28, metalness: 0.35 }),
    funnel: std('#3a4048', { roughness: 0.5, metalness: 0.22 }),
    buntA: std('#c82828', { roughness: 0.55, metalness: 0.04 }),
    buntB: std('#e8d24a', { roughness: 0.5, metalness: 0.04 }),
    buntC: std('#2a6a9a', { roughness: 0.52, metalness: 0.04 }),
    vest: std('#e07020', { roughness: 0.55, metalness: 0.04 }),
    navy: std('#1c3a68', { roughness: 0.6, metalness: 0.06 }),
    shadow: std('#2e2e2c', { roughness: 0.96, metalness: 0.02 }),
    spray: std('#eef4f8', { roughness: 0.78, metalness: 0.04 }),
    spark: new THREE.MeshBasicMaterial({
      color: 0xffcc66, toneMapped: false, transparent: true, opacity: 0.95,
    }),
    // P14 M10 item 3 — still LIT (it takes the key), no longer a solid: the
    // alpha map breaks the patch up and dies to nothing on all four borders.
    foam: std('#e8f2f6', {
      roughness: 0.82,
      metalness: 0.04,
      alphaMap: FOAM_PATCH_TEX,
      transparent: true,
      depthWrite: false,
    }),
    // Opaque, depth-tested — the collar must OCCLUDE the slab edge, not veil it.
    foamWet: std('#9fb4bc', { roughness: 0.62, metalness: 0.06 }),
    rail: std('#34393d', { roughness: 0.27, metalness: 0.76 }),
    railSubmerged: std('#141d22', { roughness: 0.58, metalness: 0.24 }),
    // MC2 F5 — a strake that actually contrasts against `plate` #2a3848.
    strake: std('#59708a', { roughness: 0.4, metalness: 0.26 }),
    wetBand: std('#1a2228', { roughness: 0.34, metalness: 0.14 }),
    wetDeep: std('#101a22', { roughness: 0.3, metalness: 0.16 }),
    grease: std('#8b8f8c', { roughness: 0.10, metalness: 0.88 }),
    slipOil: std('#17191a', {
      roughness: 0.18, metalness: 0.12, alphaMap: SLIP_OIL_TEX,
      transparent: true, opacity: 0.82, depthWrite: false,
    }),
    tyre: std('#2a221c', { roughness: 0.86, metalness: 0.06 }),
    weed: std('#2a3a22', { roughness: 0.92, metalness: 0.02 }),
    chain: std('#4a4640', { roughness: 0.4, metalness: 0.46 }),
    signBoard: std('#233240', { roughness: 0.62, metalness: 0.1 }),
    signLetter: std('#f6f4ec', { roughness: 0.46, metalness: 0.06 }),
  };
}

/**
 * MC2 F3 — where a tilted slipway's top surface crosses the harbour plane, in the
 * slipway's OWN local z. Derived, not guessed: the top face sits `halfThickness`
 * above the slab origin, and every metre along local +z drops `sin(tilt)`.
 */
export function slipwayWaterlineLocalZ(waterY, originY, halfThickness, tilt) {
  const drop = Math.sin(tilt);
  if (!Number.isFinite(drop) || Math.abs(drop) < 1e-5) return 0;
  return ((originY + (halfThickness * Math.cos(tilt))) - waterY) / drop;
}

/** Read a live slipway slab: half width, half length, thickness, waterline z. */
function measureSlipway(slipway, waterY) {
  const geometry = slipway.geometry;
  if (geometry && !geometry.boundingBox) geometry.computeBoundingBox();
  const bb = geometry?.boundingBox;
  const halfW = bb ? (bb.max.x - bb.min.x) * 0.5 : 3.08;
  const halfL = bb ? (bb.max.z - bb.min.z) * 0.5 : 7.75;
  const halfT = bb ? (bb.max.y - bb.min.y) * 0.5 : 0.18;
  const waterlineZ = slipwayWaterlineLocalZ(
    waterY, slipway.position.y, halfT, slipway.rotation.x,
  );
  return {
    halfW,
    halfL,
    halfT,
    topY: bb?.max.y ?? halfT,
    waterlineZ: Math.max(-halfL + 1, Math.min(halfL - 0.6, waterlineZ)),
  };
}

function addChamfer(parent, w, h, d, mat, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(chamferBox(w, h, d, opts.chamfer ?? 0.08), mat);
  mesh.position.set(x, y, z);
  if (opts.rotX) mesh.rotation.x = opts.rotX;
  if (opts.rotY) mesh.rotation.y = opts.rotY;
  if (opts.rotZ) mesh.rotation.z = opts.rotZ;
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  if (opts.name) mesh.name = opts.name;
  noPick(mesh);
  parent.add(mesh);
  return mesh;
}

/** A structural shore named by its endpoints, so it cannot float. */
function addCradleMember(parent, from, to, w, d, mat, name) {
  const a = new THREE.Vector3(from.x, from.y, from.z);
  const b = new THREE.Vector3(to.x, to.y, to.z);
  const dir = b.clone().sub(a);
  const len = dir.length();
  if (len < 1e-4) return null;
  const mesh = addBox(parent, w, len, d, mat,
    (a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5,
    { name });
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

/** A true triangular hardwood wedge, extruded along the keel station. */
function addKeelWedge(parent, x, y, z, flip, mat, name) {
  const w = 0.94;
  const h = SHIPYARD_CRADLE.keelTopM - y;
  const d = 0.54;
  const shape = new THREE.Shape();
  shape.moveTo(-w * 0.5, 0);
  shape.lineTo(w * 0.5, 0);
  shape.lineTo(flip < 0 ? -w * 0.5 : w * 0.5, h);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: d, bevelEnabled: false, steps: 1, curveSegments: 1,
  });
  geometry.translate(0, 0, -d * 0.5);
  geometry.computeVertexNormals();
  const wedge = new THREE.Mesh(geometry, mat);
  wedge.name = name;
  wedge.position.set(x, y, z);
  wedge.castShadow = true;
  wedge.receiveShadow = true;
  wedge.userData.ownsGeometry = true;
  noPick(wedge);
  parent.add(wedge);
  return wedge;
}

/** 0..1 progress across NAVY_BUILD_BEATS maps onto four named stages. */
export function hullStageAt(progress) {
  const u = clamp01(progress);
  const idx = Math.min(HULL_STAGES.length - 1, Math.floor(u * HULL_STAGES.length));
  const local = (u * HULL_STAGES.length) - idx;
  return { index: idx, name: HULL_STAGES[idx], local, progress: u };
}

export function shipyardProgress(row, beat, beatPhase = 0) {
  if (!row) return 0;
  const span = Math.max(1, (row.readyBeat ?? 0) - (row.startedBeat ?? 0)) || NAVY_BUILD_BEATS;
  const raw = ((beat ?? 0) - (row.startedBeat ?? 0)) + clamp01(beatPhase);
  return clamp01(raw / span);
}

function buildHull(mats) {
  const g = new THREE.Group();
  g.name = 'military:shipyard:hull';

  const keel = new THREE.Group();
  keel.name = 'military:shipyard:keel';
  // Keel blocks belong to the launch cradle, not to the ship.  The old five
  // boxes moved with the hull and were the stacked-grey-box read in pack-g.
  addBox(keel, 0.55, 0.7, 14.6, mats.keel, 0, 0.72, 0);
  addBox(keel, 0.7, 0.85, 1.35, mats.keel, 0, 0.85, 6.9);
  addBox(keel, 0.55, 0.55, 1.1, mats.keel, 0, 0.7, -6.95);
  g.add(keel);

  const frames = new THREE.Group();
  frames.name = 'military:shipyard:frames';
  for (let i = 0; i < 8; i += 1) {
    const z = -6.1 + i * 1.72;
    const w = 3.55 - Math.abs(i - 3.5) * 0.22;
    addBox(frames, w, 2.35, 0.1, mats.frame, 0, 1.45, z);
    addBox(frames, w * 0.92, 0.1, 0.1, mats.frame, 0, 2.55, z);
  }
  addBox(frames, 0.1, 2.05, 13.6, mats.frame, -1.55, 1.5, 0);
  addBox(frames, 0.1, 2.05, 13.6, mats.frame, 1.55, 1.5, 0);
  g.add(frames);

  const plating = new THREE.Group();
  plating.name = 'military:shipyard:plating';
  // ── P16-PM2B ITEM 2 — THE HULL ON THE SLIP IS A LOFT. ──
  // What stood here: three chamfered courses for the body, five more for the
  // bow at five different rotX values, and two rotated flare blocks — ten
  // co-axial solids at seven different beams. MC2 F5 fixed the CHAMFERS so the
  // edges stopped reading as razors; it could not fix the fact that you counted
  // boxes instead of reading a hull, which is what "chalky stacked boxes" meant
  // both times the critic said it.
  // The shell is now `craftGrid` — one grid of stations × levels, with the
  // boot, the boot-top band, the topside, the deck edge and the deck cut off it
  // as material bands, a fine entry, a full transom and sheer that lifts to the
  // stem. The hull is built along its own +X and the group is yawed a quarter
  // turn, because this yard lays its ships bow-to-+Z.
  const shell = new THREE.Group();
  shell.name = 'military:shipyard:shell';
  shell.rotation.y = -Math.PI / 2;
  shell.position.z = -0.15;
  noPick(shell);
  plating.add(shell);
  const grid = addCraftHull(shell, mats, {
    L: 14.9, B: 3.62, keelY: 0.26, deckY: 2.28, waterlineY: 0.82,
    hull: mats.plate, boot: mats.boot, band: mats.wet, deck: mats.deck,
    bulwark: 0.28, bulwarkT: 0.11, stations: 16,
    transomK: 0.80, bowFine: 1.95, sheerK: 0.16,
    name: 'military:shipyard:shell',
  });
  // Knuckle and seams, seated on the half-breadth the shell actually has at the
  // station rather than at half the midship beam.
  const hb = grid.hbAtX;
  for (const side of [-1, 1]) {
    addChamfer(plating, 0.3, 0.42, 11.2, mats.strake, side * 1.72, 1.72, -0.55, {
      chamfer: 0.11, name: `military:shipyard:knuckle-${side < 0 ? 'p' : 's'}`,
    });
    for (const z of [-5.9, -4.35, -2.8, -1.25, 0.3, 1.85, 3.2]) {
      const half = hb(z + 0.15, 0.85);
      addBox(plating, 0.12, 1.18, 0.16, mats.seam, side * (half + 0.02), 1.24, z);
    }
  }
  // The bow group survives as a name and as the stem casting the loft cannot
  // carry: a stem bar and its two knee plates, on the shell's own forefoot.
  const bow = new THREE.Group();
  bow.name = 'military:shipyard:bow';
  addChamfer(bow, 0.34, 2.1, 1.5, mats.plate, 0, 1.5, 7.05, { rotX: -0.5, chamfer: 0.11 });
  for (const side of [-1, 1]) {
    addChamfer(bow, 0.16, 0.9, 1.3, mats.seam, side * 0.42, 1.55, 6.35,
      { rotX: -0.42, chamfer: 0.05 });
  }
  // Sonar dome under the forefoot — the one place a hull on a slip shows what a
  // hull in the water never does.
  addChamfer(bow, 1.2, 0.95, 2.4, mats.plate, 0, 0.62, 5.4, { chamfer: 0.3 });
  plating.add(bow);
  // ── P16-PM2B ITEM 2 — WHAT A HULL ON A SLIPWAY ACTUALLY SHOWS. ──
  // The loft carries the shell; the appendages are the reason the shipyard pose
  // is worth having, because they are the parts that are only visible before
  // launch. Every one is a real casting or plate, and every bevel is sized for
  // the shipyard pose (>= 0.16 m ~ 3-4 px at d 52) rather than for a modeller's
  // default.
  const under = new THREE.Group();
  under.name = 'military:shipyard:appendages';
  noPick(under);
  plating.add(under);
  for (const side of [-1, 1]) {
    // Bilge keel: a long shallow fin on the turn of the bilge.
    addChamfer(under, 0.24, 0.62, 6.4, mats.strake, side * 1.42, 0.72, -1.4, { chamfer: 0.18 });
    // A-bracket carrying the shaft out to the propeller.
    addChamfer(under, 0.3, 1.5, 0.62, mats.plate, side * 0.95, 0.72, -5.2,
      { rotZ: side * 0.34, chamfer: 0.2 });
    addCyl(under, 0.17, 0.17, 2.9, 8, mats.keel, side * 0.82, 0.62, -5.0, { rotX: Math.PI / 2 });
    addCyl(under, 0.34, 0.28, 0.55, 8, mats.keel, side * 0.82, 0.62, -6.35,
      { rotX: Math.PI / 2 });
    // Stern-tube bossing: the swelling where the shaft leaves the shell.
    addChamfer(under, 0.72, 0.78, 2.1, mats.plate, side * 0.72, 0.86, -4.0, { chamfer: 0.24 });
  }
  // The launch view exposes the stern: transom, rudder and guarded screws use
  // the same readable kit as the afloat dress, turned onto this +Z hull.
  addWarshipSternGear(under, mats, {
    name: 'military:shipyard:stern-gear',
    axis: 'z',
    stern: -7.12,
    y: 0.56,
    scale: 0.82,
  });
  // Breakwater on the fo'c'sle: the plate that stops green water at the gun.
  addChamfer(plating, 2.4, 0.5, 0.34, mats.strake, 0, 2.5, 4.6, { chamfer: 0.16 });
  /*
   * ── P14 M11 ITEM 1 — THE YARD HULL IS WEATHERED. ──
   *
   * MC6 pack-g, 3/10: "unbevelled primitive hull". The bevels were largely
   * there (PM2B's loft and MC2 F5's chamfers); what was not there is any sign
   * that the thing has been outside. At the shipyard pose the hull draws about
   * 34 px per metre — the closest any military camera gets to a hull — so this
   * is the pose where a rust run and a salt line are legible and where their
   * absence is what reads as a primitive.
   *
   * Three passes on the shell's own half-breadth, so nothing overhangs the
   * plating the way M9 and M10 kept finding:
   *   RUST     runs from the deck edge, at six stations, two tones, dying out
   *            before the boot-top.
   *   SALT     a chalky band in the half-metre above the boot-top.
   *   DRAUGHT  numerals at the stem, on the boot-top's own band.
   */
  const weather = new THREE.Group();
  weather.name = 'military:shipyard:weathering';
  noPick(weather);
  plating.add(weather);
  const RUST_Z = [-6.0, -4.4, -2.4, -0.4, 1.8, 4.0];
  for (let i = 0; i < RUST_Z.length; i += 1) {
    const z = RUST_Z[i];
    const half = hb(z + 0.15, 1);
    const drop = 0.62 + (i % 3) * 0.26;
    const w = 0.10 + (i % 2) * 0.05;
    for (const side of [-1, 1]) {
      const streak = addBox(weather, 0.03, drop, w, i % 2 ? mats.rust : mats.rustDark,
        side * (half + 0.035), 2.24 - drop * 0.5, z, {
          name: `military:shipyard:rust:${i}:${side < 0 ? 'p' : 's'}`,
        });
      streak.castShadow = false;
      streak.receiveShadow = false;
      streak.renderOrder = 2;
      noPick(streak);
    }
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 12; i += 1) {
      const z = -6.6 + i * 1.22;
      const half = hb(z + 0.15, 1);
      const band = addBox(weather, 0.03, 0.34, 1.26, mats.salt,
        side * (half + 0.03), 1.16, z, {
          name: `military:shipyard:salt:${i}:${side < 0 ? 'p' : 's'}`,
        });
      band.castShadow = false;
      band.receiveShadow = false;
      noPick(band);
    }
  }
  for (const side of [-1, 1]) {
    const half = hb(6.2, 1);
    const marks = addToyLetters(weather, '5', mats.super, 0, 0.98, 0, {
      s: 0.30, gap: 0.05, depth: 0.03,
    });
    marks.name = `military:shipyard:draught:${side < 0 ? 'p' : 's'}`;
    marks.position.set(side * (half + 0.05), 0.98, 6.2);
    marks.rotation.y = side * Math.PI / 2;
    noPick(marks);
  }
  // MC2 F5 — deck rails: stanchions and two wires down both sides of the deck.
  const rails = new THREE.Group();
  rails.name = 'military:shipyard:deck-rails';
  // P16-PM2B item 3: 50 mm stanchions and 60-70 mm wires are 0.6 px at the
  // shipyard pose and read as a sparkling wire fence. 130 mm and 90 mm, on the
  // shell's own line rather than at ±1.56.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 11; i += 1) {
      const z = -5.9 + i * 1.16;
      addCyl(rails, 0.065, 0.075, 0.72, 6, mats.rail, side * (hb(z + 0.15, 1) - 0.1), 2.66, z);
    }
    addBox(rails, 0.11, 0.11, 12.4, mats.rail, side * 1.56, 2.98, -0.15);
    addBox(rails, 0.09, 0.09, 12.4, mats.rail, side * 1.56, 2.74, -0.15);
  }
  plating.add(rails);
  g.add(plating);

  const superstructure = new THREE.Group();
  superstructure.name = 'military:shipyard:superstructure';
  // ── P16-PM2B ITEM 2 — ONE ENCLOSED SUPERSTRUCTURE. ──
  // Was a 1.45 m block, a 0.22 m band standing PROUD of it on all four sides,
  // a 1.05 m block on top of that, and two window plates hung on nothing: the
  // same terrace the merchant houses carried. `deckhouse` walls each level from
  // its own floor to its own deck and puts the glass flush on the same plan, so
  // no ray through the house between the levels comes out the far side.
  const superRot = new THREE.Group();
  superRot.rotation.y = -Math.PI / 2;
  superRot.position.set(0, 0, -1.6);
  noPick(superRot);
  superstructure.add(superRot);
  deckhouse(superRot, mats, {
    x: 0, y0: 2.38,
    tiers: [
      { w: 3.85, d: 2.45, h: 1.45, edge: 0.14, mat: mats.super, sill: 0.34, head: 0.76 },
      { w: 2.35, d: 1.6, h: 1.0, edge: 0.12, mat: mats.super, sill: 0.16, head: 0.88, dx: -0.2 },
    ],
    body: mats.super, glass: mats.window, deck: mats.deck, foot: mats.keel,
    name: 'military:shipyard:super-house', stations: 7,
  });
  addCyl(superstructure, 0.42, 0.5, 1.55, 8, mats.funnel, -0.55, 5.86, -1.35);
  addCyl(superstructure, 0.28, 0.35, 0.22, 8, mats.keel, -0.55, 6.69, -1.35);
  addCyl(superstructure, 0.16, 0.16, 3.15, 6, mats.keel, 0.45, 6.46, -1.15);
  addBox(superstructure, 1.15, 0.12, 0.32, mats.frame, 0.45, 7.76, -1.15);
  addSphere(superstructure, 0.28, 8, mats.frame, 0.45, 8.11, -1.15);
  addCyl(superstructure, 0.55, 0.6, 0.45, 10, mats.keel, 0, 2.72, 2.55);
  addCyl(superstructure, 0.1, 0.1, 1.85, 6, mats.keel, 0.95, 2.85, 2.55, { rotZ: Math.PI / 2 });
  g.add(superstructure);

  g.userData.keel = keel;
  g.userData.frames = frames;
  g.userData.plating = plating;
  g.userData.superstructure = superstructure;
  noPick(g);
  return g;
}

function applyStage(hull, stage) {
  hull.userData.keel.visible = stage.index >= 0;
  hull.userData.frames.visible = stage.index >= 1;
  hull.userData.plating.visible = stage.index >= 2;
  hull.userData.superstructure.visible = stage.index >= 3;
  hull.userData.keel.scale.set(1, 1, 1);
  hull.userData.frames.scale.set(1, 1, 1);
  hull.userData.plating.scale.set(1, 1, 1);
  hull.userData.superstructure.scale.set(1, 1, 1);
}

export class MilitaryShipyardLayer {
  constructor(city, { reducedMotion = false } = {}) {
    this.city = city;
    this.reducedMotion = reducedMotion;
    this.root = new THREE.Group();
    this.root.name = 'military-shipyard';
    this.mats = dressShipyardMaterials(kit());
    this.demo = null;
    this.demoLock = false;
    this.time = 0;
    this.hull = null;
    this.sparks = [];
    this.splash = null;
    this.launchWashStarted = false;
    this.wake = null;
    this.cradleDress = null;
    this.phase = 'idle';
    this.stage = hullStageAt(0);
    this.statusSnapshot = { phase: 'idle', stage: this.stage.name, launched: false };
  }

  setDemo(spec) {
    this.demo = spec;
    this.demoLock = Boolean(spec);
    this.time = 0;
    this._sailStartScale = null;
    this.launchWashStarted = false;
    this.phase = 'build';
    if (this.hull) {
      this.hull.position.set(0, 0, 0);
      this.hull.rotation.set(0, 0, 0);
      this.hull.scale.setScalar(1.18);
      this.hull.visible = true;
      const rig = this._rig();
      if (rig?.mount && this.hull.parent !== rig.mount) rig.mount.add(this.hull);
    }
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
    const cached = this._portLookup;
    if (cached?.scene === node
      && (cached.landscape === node || cached.landscape.parent === node && cached.landscape.name === 'fringe:landscape')
      && cached.port.parent === cached.landscape
      && cached.port.name === 'fringe:port') return cached.port;
    // FringeLayer owns the port directly. Validate both attachment edges so
    // rebuilt landscapes and replaced ports cannot leave a stale cached rig.
    // Standalone port labs attach addPort directly to their scene root.
    const landscape = node?.children?.find((child) => child.name === 'fringe:landscape') ?? node;
    const port = landscape?.children.find((child) => child.name === 'fringe:port') ?? null;
    this._portLookup = port ? { scene: node, landscape, port } : null;
    return port;
  }

  _rig() {
    return this._port()?.userData?.logistics?.shipyard ?? null;
  }

  _navyRow(world) {
    if (this.demoLock && this.demo?.shipyard) {
      return {
        id: 'demo-navy',
        kind: 'navy',
        startedBeat: 0,
        readyBeat: NAVY_BUILD_BEATS,
        launched: false,
      };
    }
    return (world?.shipyard ?? []).find((row) => row.kind === 'navy' && !row.launched)
      ?? (world?.shipyard ?? []).find((row) => row.kind === 'navy');
  }

  _ensureHull(rig) {
    if (this.hull) return this.hull;
    const hull = buildHull(this.mats);
    hull.scale.setScalar(1.18);
    const mount = rig?.mount;
    if (mount) mount.add(hull);
    else this.root.add(hull);
    this.hull = hull;
    for (let i = 0; i < 6; i += 1) {
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), this.mats.spark);
      spark.visible = false;
      hull.add(spark);
      this.sparks.push(spark);
    }
    this._dressYard(rig);
    this._dressSlipway(rig);
    this._buildCradle(rig);
    this._groundYard(rig, hull);
    this._sunTrack(rig);
    this._reflectYard(rig);
    return hull;
  }

  /* ================================================================== *
   * P14 M12 ITEM 1 — KEEL BLOCKS, SHORES, SLIDING WAYS AND CHAIN DRAGS.
   *
   * The inherited cradle is ten orthogonal boxes: three crossbars, six
   * upright posts and a flat hazard plate.  It cannot explain how the hull is
   * supported or how it launches.  Keep its named parent (automation and the
   * launch animation both own it), retire only those anonymous placeholder
   * children, and dress that same moving frame with the actual load path.
   * ================================================================== */
  _buildCradle(rig) {
    const cradle = rig?.cradle;
    if (!cradle || cradle.userData.m12Dressed) return this.cradleDress;
    cradle.userData.m12Dressed = true;
    let legacyHidden = 0;
    for (const child of cradle.children) {
      if (child.name) continue;
      child.visible = false;
      child.userData.m12Placeholder = true;
      legacyHidden += 1;
    }

    const g = new THREE.Group();
    g.name = 'military:shipyard:launch-cradle';
    noPick(g);
    cradle.add(g);

    // Two steel sliding ways, with narrow greased runner caps and cross ties.
    for (const side of [-1, 1]) {
      addBox(g, 0.46, 0.24, SHIPYARD_CRADLE.wayLengthM, this.mats.rail,
        side * SHIPYARD_CRADLE.wayGaugeM * 0.5, 0.16, 0, {
          name: `military:shipyard:cradle:sliding-way:${side < 0 ? 'port' : 'starboard'}`,
        });
      addBox(g, 0.30, 0.08, SHIPYARD_CRADLE.wayLengthM - 0.2, this.mats.grease,
        side * SHIPYARD_CRADLE.wayGaugeM * 0.5, 0.32, 0, {
          name: `military:shipyard:cradle:greased-runner:${side < 0 ? 'port' : 'starboard'}`,
        });
    }
    for (let i = 0; i < 9; i += 1) {
      const z = -6.0 + i * 1.5;
      addBox(g, 4.65, 0.18, 0.34, this.mats.timber, 0, 0.13, z, {
        name: `military:shipyard:cradle:cross-tie:${i}`,
      });
    }

    // Each station has a broad bearing block and opposed wedges whose high
    // edges meet under the centreline.  Their top is the measured keel seat.
    for (const [i, z] of SHIPYARD_CRADLE.stations.entries()) {
      addBox(g, 2.25, 0.36, 0.72, this.mats.block, 0, 0.50, z, {
        name: `military:shipyard:cradle:keel-block:${i}`,
      });
      addKeelWedge(g, -0.47, 0.68, z, 1, this.mats.hardwood,
        `military:shipyard:cradle:keel-wedge:${i}:port`);
      addKeelWedge(g, 0.47, 0.68, z, -1, this.mats.hardwood,
        `military:shipyard:cradle:keel-wedge:${i}:starboard`);
    }

    // Paired bilge shores lean 25 degrees from vertical into the hull. Each
    // foot bears on a hardwood sole plate instead of ending in open air.
    const shoreZ = [-4.7, -1.55, 1.55, 4.7];
    // TASTE-R1 W3-B: the heads bore 0.38 m INTO the shell's boot band on the motion sweep (shore-head:N:starboard
    // against shell:boot at t = 0, the hull still on its blocks; 0.32 m after moving them 0.22 m out, so the fault is
    // as much vertical as lateral). The heads now stand 0.32 m further out and 0.15 m lower; the foot is solved from
    // the head so the lean is exactly SHIPYARD_CRADLE.shoreLeanDeg (pinned by p14-city-military).
    const SHORE_OUT = 0.32;
    const shoreFromY = 0.26;
    const shoreToY = 1.35;
    const shoreHeadX = 1.62 + SHORE_OUT;
    const shoreFootX = shoreHeadX
      + Math.tan(SHIPYARD_CRADLE.shoreLeanDeg * Math.PI / 180) * (shoreToY - shoreFromY);
    for (const [i, z] of shoreZ.entries()) {
      for (const side of [-1, 1]) {
        const suffix = side < 0 ? 'port' : 'starboard';
        addBox(g, 0.72, 0.12, 0.64, this.mats.hardwood,
          side * shoreFootX, 0.08, z, {
            name: `military:shipyard:cradle:sole-plate:${i}:${suffix}`,
          });
        addCradleMember(g,
          { x: side * shoreFootX, y: shoreFromY, z },
          { x: side * shoreHeadX, y: shoreToY, z },
          0.22, 0.27, this.mats.shoreTimber,
          `military:shipyard:cradle:bilge-shore:${i}:${suffix}`);
        addBox(g, 0.42, 0.30, 0.48, this.mats.hardwood,
          side * (1.59 + SHORE_OUT), shoreToY + 0.01, z, {
            rotZ: side * -SHIPYARD_CRADLE.shoreLeanDeg * Math.PI / 180,
            name: `military:shipyard:cradle:shore-head:${i}:${suffix}`,
          });
      }
    }

    // Drag chains lie beside the ways and pay out against two anchor blocks.
    const linkGeom = new THREE.TorusGeometry(0.14, 0.04, 5, 8);
    const dummy = new THREE.Object3D();
    for (const side of [-1, 1]) {
      const links = new THREE.InstancedMesh(
        linkGeom, this.mats.chain, SHIPYARD_CRADLE.chainLinksPerSide,
      );
      links.name = `military:shipyard:cradle:chain-drag:${side < 0 ? 'port' : 'starboard'}`;
      for (let i = 0; i < SHIPYARD_CRADLE.chainLinksPerSide; i += 1) {
        const z = -5.55 + i * (11.10 / (SHIPYARD_CRADLE.chainLinksPerSide - 1));
        dummy.position.set(side * (2.42 + Math.sin(i * 1.7) * 0.08), 0.36, z);
        dummy.rotation.set(i % 2 ? 0 : Math.PI / 2, i % 2 ? Math.PI / 2 : 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        links.setMatrixAt(i, dummy.matrix);
      }
      links.instanceMatrix.needsUpdate = true;
      links.castShadow = true;
      links.receiveShadow = true;
      links.userData.ownsGeometry = side < 0;
      noPick(links);
      g.add(links);
      addBox(g, 0.76, 0.58, 0.72, this.mats.chain, side * 2.42, 0.39, -6.15, {
        name: `military:shipyard:cradle:chain-anchor:${side < 0 ? 'port' : 'starboard'}`,
      });
    }
    g.userData.receipt = {
      legacyHidden,
      keelBlocks: SHIPYARD_CRADLE.stations.length,
      wedges: SHIPYARD_CRADLE.stations.length * 2,
      shores: shoreZ.length * 2,
      solePlates: shoreZ.length * 2,
      shoreLeanDeg: +cradleShoreLeanDeg(
        { x: shoreFootX, y: shoreFromY, z: 0 },
        { x: shoreHeadX, y: shoreToY, z: 0 },
      ).toFixed(2),
      ways: 2,
      chainLinks: SHIPYARD_CRADLE.chainLinksPerSide * 2,
    };
    this.cradleDress = g;
    return g;
  }

  /* ================================================================== *
   * P14 M10 ITEM 3 — A SPECULAR TRACK ON THE BASIN.
   *
   * FIRST, THE THING THE BRIEF ASKS TO BE CHECKED, MEASURED. A downward probe
   * beside the slip returns `nature:water:ocean`, a `ShaderMaterial`, at y 0.02
   * (`shots-v56/M10-probe.json` Q2): the shipyard's water IS the harbour sheet —
   * `OuterOcean`'s own polar sheet — and there is no separate slab under the
   * yard. Its sun term therefore already exists, and it is the reason there is
   * nothing to see here: `OCEAN_FRAG`'s specular is computed against the real
   * sun and the real camera, and at the shipyard pose (azimuth 148 deg, a
   * near-overhead board key) the mirror point of that sun falls outside the
   * basin. A correct specular that lands off-frame is still an absent one.
   *
   * What this adds is a LOCAL glitter track on the same sheet, owned by this
   * layer, laid along the key's own ground bearing and broken by the same gap
   * field the hull collars use: additive, vertex-coloured (so the outer rim is
   * black and there is no edge on it anywhere), `toneMapped` off so it rolls
   * off through the post chain like light rather than like paint. `water.js`
   * and `outer-ocean.js` are not this lane's files and neither is touched.
   * ================================================================== */
  /** Length and width of the glitter track, metres. */
  static get TRACK_LEN() { return 46; }
  _sunTrack(rig) {
    if (!rig?.root || rig.root.userData.m10SunTrack) return null;
    rig.root.userData.m10SunTrack = true;
    let node = this.root;
    while (node?.parent) node = node.parent;
    const key = readKeyLight(findKeyLight(node));
    // The key's ground bearing. `readKeyLight` returns the light's own
    // direction; the track runs along its projection on the water.
    const dir = key?.dir ?? { x: -0.62, y: 0.72, z: -0.31 };
    const bearing = Math.atan2(dir.x, dir.z);
    const track = new THREE.Group();
    track.name = 'military:shipyard:sun-track';
    noPick(track);
    const anchor = worldPos(rig.root, _to);
    // On the sheet, in front of the slip, in the yard rig's own frame.
    track.position.set(0, this._waterY() + 0.012 - anchor.y, 24);
    const L = MilitaryShipyardLayer.TRACK_LEN;
    // Three runs at slightly different bearings and phases: one track of light
    // is a bar, three interleaved broken ones is a glitter path.
    /*
     * THE HUE AND THE AMPLITUDE ARE MEASURED OFF THE FRAME, NOT CHOSEN. The
     * first cut ran 0.30 / 0.22 / 0.16 on a [1.04, 1.00, 0.86] tint, and over a
     * #1a3c5a basin an additive that warm at that strength reads as olive scum
     * rather than as light — the 2x basin crop came back with khaki lozenges
     * where the runs are widest. Sunlight on water is the SUN's colour, which
     * on this board is a near-white warm, and a specular track is a highlight,
     * not a wash: two thirds the amplitude and a tint inside 6 % of neutral.
     */
    for (const [i, spec] of [
      [0, { w: 3.1, amp: 0.21, off: 0, skew: 0, seed: 11 }],
      [1, { w: 1.9, amp: 0.15, off: 4.2, skew: 0.09, seed: 19 }],
      [2, { w: 1.2, amp: 0.11, off: -5.6, skew: -0.07, seed: 27 }],
    ]) {
      const n = 44;
      const inner = [];
      const outer = [];
      const vals = [];
      const th = bearing + spec.skew;
      const c = Math.cos(th);
      const s = Math.sin(th);
      // One CLOSED lozenge: the centreline carries the value, both flanks are
      // black, and the loop is walked out along one side and back along the
      // other so `planRingMesh`'s wrap quad closes a tip rather than spanning
      // the basin (the same construction `addSternWake` uses).
      for (const side of [1, -1]) {
        for (let k = 0; k < n; k += 1) {
          const u = side > 0 ? k / (n - 1) : 1 - k / (n - 1);
          const along = (u - 0.5) * L;
          // The track narrows away from the viewer the way a real sun path does.
          const half = spec.w * (0.34 + 0.66 * (1 - Math.abs(u - 0.42) * 1.6));
          const px = along * s + spec.off * c;
          const pz = along * c - spec.off * s;
          inner.push([px, pz]);
          outer.push([px + side * half * c, pz - side * half * s]);
          // Broken along its length AND faded at both ends, so it has no tip.
          const ends = Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
          vals.push(spec.amp * ends * foamGapAt(u * 1.9, spec.seed));
        }
      }
      const mesh = planRingMesh(
        inner, outer,
        (k) => {
          const v = vals[k];
          return [v, v * 0.99, v * 0.94];
        },
        () => [0, 0, 0],
        0, waterFoamMaterial(), 4,
      );
      mesh.name = `military:shipyard:sun-track:run-${i}`;
      track.add(mesh);
    }
    rig.root.add(track);
    this.sunTrack = track;
    return track;
  }

  /* ================================================================== *
   * P14 M9 ITEM 2 — CONTACT DARKENING UNDER EVERY PROP AND THE HULL.
   *
   * MC4 pack-k: "unshadowed fill light with no AO, contact, or water
   * reflection". The probe (`shots-v56/M9-probe.json`, Q1) says the yard is not
   * short of shadow CASTERS — 367 of 389 meshes carry `castShadow` — so the
   * missing signal is the near-field one: a keel block, a bollard, a fender or
   * a chain block is 0.2 to 0.6 m tall, and the board's key shadow map cannot
   * resolve a 0.2 m object's contact at this texel density. That is the same
   * argument `GROUND_CASTER_CLEARANCE_M` makes in `units.js` for the tank's own
   * track plates, and it has the same answer: stamp the contact.
   *
   * Every stamp is the multiply mask, so it darkens the deck it lands on to
   * `HARD_CONTACT_FLOOR` and takes that deck's own hue — the slipway is a
   * mid-grey concrete slab and the apron beside it is a pale one, and a fixed
   * dark hue would be an ink blot on the second.
   * ================================================================== */
  _groundYard(rig, hull) {
    if (!rig?.root || rig.root.userData.m9Grounded) return null;
    rig.root.userData.m9Grounded = true;
    const g = new THREE.Group();
    g.name = 'military:shipyard:contacts';
    noPick(g);
    const floor = (rig.floorY ?? 0) + 0.075;
    // The yard's own furniture: the cradle, the trolley track, the winch house
    // footings. Placed off the rig's measured floor rather than off y = 0.
    const props = [
      { x: 0, z: 6.4, d: 5.2, w: 4.4, id: 'cradle' },
      { x: -3.85, z: -4.2, d: 1.5, w: 1.5, id: 'leg-nw' },
      { x: 3.85, z: -4.2, d: 1.5, w: 1.5, id: 'leg-ne' },
      { x: -3.85, z: 4.2, d: 1.5, w: 1.5, id: 'leg-sw' },
      { x: 3.85, z: 4.2, d: 1.5, w: 1.5, id: 'leg-se' },
    ];
    for (const p of props) {
      const patch = makeContactPatch(p.w, `military:shipyard:contact:${p.id}`, {
        hard: true, depth: p.d,
      });
      patch.position.set(p.x, floor, p.z);
      g.add(patch);
    }
    rig.root.add(g);
    /*
     * The hull ON ITS BLOCKS. This is the one that matters at the yard pose: a
     * 17.6 m hull standing 2.5 m off a slab, with the key at 39.8 deg, throws
     * a shadow the map DOES resolve — but the frame had none, because the
     * faceted white disc was lying over the slab where the shadow lands and
     * taking no shadow itself. With the disc gone the map's own shadow shows;
     * this shade is the ambient occlusion under the keel that a shadow map
     * cannot give you, on the hull's own plan so it moves with the launch.
     */
    if (hull) {
      const shade = addPlanShade(hull, {
        x: 0, z: 0, yaw: -Math.PI / 2, len: 15.4, beam: 3.9,
        y: 0.02, hug: 0.06, width: 1.5, hold: 0.5, step: 1.1, seed: 11,
        tint: [0.58, 0.62, 0.70],
        name: 'military:shipyard:hull-contact',
      });
      // Five keel blocks under the centreline: the hull's weight is on these,
      // and the dark line between them is what says it is not floating.
      for (const [i, z] of [-5.8, -2.9, 0, 2.9, 5.8].entries()) {
        const patch = makeContactPatch(3.0, `military:shipyard:block-contact:${i}`, {
          hard: true, depth: 1.15,
        });
        patch.position.set(0, 0.018, z);
        hull.add(patch);
      }
      hull.userData.m9Shade = shade;
    }
    return g;
  }

  /**
   * P14 M9 item 2 — put the yard's large forms in the harbour reflector's proxy
   * layer. `water.js` walks for reflection sources once, at boot, and this
   * subtree does not exist then: the probe measured `onReflectLayer: 0` of 389.
   * `addReflectionSources` is the registry `outer-ocean.js` grew for exactly
   * this, and it applies the boot walk's own two gates (2.2 m proud, 4.2 m
   * across) so nothing small buys a draw call.
   */
  _reflectYard(rig) {
    if (this.root.userData.m9Reflect) return this.root.userData.m9Reflect;
    const roots = [rig?.root, this.hull, rig?.slipway].filter(Boolean);
    let added = 0;
    let walked = 0;
    let cradleAdded = 0;
    // The shores and ways are low, broad launch hardware.  The normal harbour
    // gate deliberately rejects furniture under 2.2 m, so enrol this one named
    // assembly against its own scale before the general yard walk.
    if (this.cradleDress) {
      for (const res of addReflectionSources(this.cradleDress, {
        minHeight: 0.42, minSpan: 1.0, cap: 16,
      })) {
        cradleAdded += res.added;
        added += res.added;
        walked += res.walked;
      }
    }
    for (const root of roots) {
      for (const res of addReflectionSources(root, { cap: 24 })) {
        added += res.added;
        walked += res.walked;
      }
    }
    const stat = { roots: roots.length, walked, added, cradleAdded };
    this.root.userData.m9Reflect = stat;
    this.reflectStat = stat;
    return stat;
  }

  _dressSlipway(rig) {
    const slipway = rig?.slipway
      ?? this._port()?.getObjectByName?.('fringe:port-shipyard:slipway')
      ?? null;
    if (!slipway || slipway.userData.m5Dressed) return;
    slipway.userData.m5Dressed = true;
    const dress = new THREE.Group();
    dress.name = 'military:shipyard:slipway-dress';
    noPick(dress);
    slipway.add(dress);
    const mats = this.mats;
    // MC2 F3/F5 STANDING VETO — the lip was razor because the wet band and the
    // foam collar sat 4-6 m PAST the real intersection. Measure it instead:
    // the top surface crosses the harbour plane at this local z.
    const geom = measureSlipway(slipway, this._waterY());
    slipway.userData.m5Waterline = geom.waterlineZ;
    const halfW = geom.halfW + 0.10;
    const wl = geom.waterlineZ;
    const endZ = geom.halfL;
    let submergedRuns = 0;
    let longestSubmergedRunM = 0;
    const addWayRun = (x, width, height, start, end, mat, name, y) => {
      const len = end - start;
      if (!(len > 0.08)) return null;
      const run = addBox(dress, width, height, len, mat, x, y, (start + end) * 0.5, { name });
      if (mat === mats.railSubmerged) {
        submergedRuns += 1;
        longestSubmergedRunM = Math.max(longestSubmergedRunM, len);
        run.userData.submergedContinuation = true;
      }
      return run;
    };
    // Thickness skirts down both flanks: the slab reads as a bed with a side,
    // not a sheet of paper laid on the harbour.
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? 'w' : 'e';
      addBox(dress, 0.36, 0.98, geom.halfL * 2 - 0.3, mats.wetBand, side * halfW, -0.4, 0, {
        name: `military:shipyard:slip-skirt-${suffix}`,
      });
      const edgeStart = -geom.halfL + 0.25;
      const edgeDryEnd = Math.min(wl - 0.18, endZ - 0.25);
      const edgeWetStart = Math.max(wl + 0.02, edgeStart);
      const edgeWetEnd = Math.min(endZ - 0.25, wl + SHIPYARD_SUBMERGED_WAY_MAX_M);
      addWayRun(side * (halfW + 0.06), 0.2, 0.34, edgeStart, edgeDryEnd,
        mats.rail, `military:shipyard:slip-edge-rail-${suffix}`, 0.06);
      addWayRun(side * (halfW + 0.06), 0.2, 0.34, edgeWetStart, edgeWetEnd,
        mats.railSubmerged, `military:shipyard:slip-edge-rail-${suffix}:submerged`, 0.06);
    }
    // A recessed, segmented rail bed: two rails on cross-ties inside a sunk
    // trough, so the deck is not one continuous plane running into water.
    addBox(dress, geom.halfW * 1.72, 0.16, geom.halfL * 2 - 1.2, mats.wetBand, 0, 0.1, -0.2, {
      name: 'military:shipyard:slip-bed',
    });
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? 'w' : 'e';
      const wayStart = -geom.halfL + 0.7;
      const wayDryEnd = Math.min(wl - 0.18, endZ - 0.7);
      const wayWetStart = Math.max(wl + 0.02, wayStart);
      const wayWetEnd = Math.min(endZ - 0.7, wl + SHIPYARD_SUBMERGED_WAY_MAX_M);
      addWayRun(side * 1.44, 0.32, 0.26, wayStart, wayDryEnd,
        mats.rail, `military:shipyard:slip-rail-${suffix}`, 0.3);
      addWayRun(side * 1.44, 0.32, 0.26, wayWetStart, wayWetEnd,
        mats.railSubmerged, `military:shipyard:slip-rail-${suffix}:submerged`, 0.3);
    }
    const ties = Math.max(6, Math.round((geom.halfL * 2 - 1.6) / 1.12));
    let lastTieZ = -Infinity;
    let dryTies = 0;
    for (let i = 0; i < ties; i += 1) {
      const z = -geom.halfL + 0.8 + i * 1.12;
      if (z >= wl - SHIPYARD_TIE_WATER_CLEARANCE_M) break;
      addBox(dress, 3.5, 0.22, 0.5, mats.keel, 0, 0.25, z, {
        name: `military:shipyard:slip-tie:${i}`,
      });
      lastTieZ = z;
      dryTies += 1;
    }
    dress.userData.submergedWays = {
      darkRuns: submergedRuns,
      longestRunM: longestSubmergedRunM,
      maxRunM: SHIPYARD_SUBMERGED_WAY_MAX_M,
      dryTies,
      lastTieClearanceM: Number.isFinite(lastTieZ) ? wl - lastTieZ : null,
    };
    slipway.userData.m14SubmergedWays = dress.userData.submergedWays;
    // MC2 F3 STANDING VETO — the single move that kills the razor-lip read is a
    // real silhouette break where the slab enters the water: a sill beam across
    // the full width, standing proud, with its own shadow and end blocks.
    addBox(dress, geom.halfW * 2.24, 0.62, 0.72, mats.keel, 0, 0.42, wl + 0.05, {
      name: 'military:shipyard:slip-sill',
    });
    for (const side of [-1, 1]) {
      addBox(dress, 0.72, 0.86, 0.9, mats.wetBand, side * (geom.halfW * 0.92), 0.5, wl + 0.05);
    }
    // The visible tidal strip: the metre and a half of slab above the line that
    // the water has been over, dark and glossy. Below the line it is water.
    const wetLen = 2.4;
    addBox(dress, geom.halfW * 1.98, 0.13, wetLen, mats.wetBand, 0, 0.15, wl - 1.05, {
      name: 'military:shipyard:slip-wet',
    });
    // Two broken oil blooms on the dry slope.  The alpha field is zero on all
    // four texture edges, so these read as absorbed stains rather than cards.
    for (const [i, stain] of [
      [0, { x: -0.82, z: wl - 3.15, w: 2.55, d: 4.10, yaw: 0.18 }],
      [1, { x: 1.04, z: wl - 5.35, w: 1.75, d: 2.85, yaw: -0.27 }],
    ]) {
      const oil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mats.slipOil);
      oil.name = `military:shipyard:slip-oil-stain:${i}`;
      oil.rotation.set(-Math.PI / 2, 0, stain.yaw);
      oil.position.set(stain.x, geom.topY + 0.018, stain.z);
      oil.scale.set(stain.w, stain.d, 1);
      oil.renderOrder = 2;
      oil.castShadow = false;
      oil.receiveShadow = false;
      oil.userData.ownsGeometry = true;
      noPick(oil);
      dress.add(oil);
    }
    addBox(dress, geom.halfW * 1.98, 0.12, Math.max(0.6, endZ - wl - 0.4), mats.wetDeep,
      0, 0.14, wl + 0.4 + Math.max(0.6, endZ - wl - 0.4) * 0.5);
    // Opaque, depth-tested foam collar ON the intersection — a torus ring plus a
    // filled disc under it, both conformed to the measured waterline.
    // The collar is a narrow band ACROSS the slab on the line, not a disc that
    // runs three metres down-slope. Opaque and depth-tested so it occludes the
    // slab's cut edge instead of veiling it.
    const collar = new THREE.Mesh(
      new THREE.BoxGeometry(geom.halfW * 2.12, 0.22, 1.5), mats.foamWet,
    );
    collar.name = 'military:shipyard:slip-collar';
    collar.position.set(0, 0.18, wl + 0.35);
    collar.castShadow = false;
    collar.receiveShadow = true;
    noPick(collar);
    dress.add(collar);
    // Foam: a broken row of pads on the line, wider than the slab so it laps the
    // skirts, with the surge tongue running a little up the bed.
    // One unmistakable surf band across the slab and over both skirts, with three
    // heavier tongues riding up the bed. Sized for the shipyard pose, where the
    // slab is about 150 px across and anything under half a metre is one pixel.
    const foam = new THREE.Group();
    foam.name = 'military:shipyard:slip-foam';
    noPick(foam);
    addBox(foam, geom.halfW * 2.34, 0.1, 1.35, mats.foam, 0, 0.2, wl - 0.25).castShadow = false;
    for (let i = 0; i < 3; i += 1) {
      const fx = (i - 1) * (geom.halfW * 0.78);
      addBox(foam, geom.halfW * 0.58, 0.09, 2.1 + (i % 2) * 0.6, mats.foam,
        fx, 0.205, wl - 1.15 - (i % 2) * 0.3).castShadow = false;
    }
    dress.add(foam);
    const foamLip = new THREE.Mesh(
      new THREE.BoxGeometry(geom.halfW * 2.4, 0.22, 0.7), mats.foamWet,
    );
    foamLip.name = 'military:shipyard:slip-foam-lip';
    foamLip.position.set(0, 0.2, wl + 0.62);
    foamLip.castShadow = false;
    foamLip.receiveShadow = true;
    noPick(foamLip);
    dress.add(foamLip);
    // The seaward end gets a real cap so no polygon edge shows as a blade.
    addBox(dress, geom.halfW * 2.1, 0.9, 0.6, mats.wetBand, 0, -0.28, endZ - 0.2, {
      name: 'military:shipyard:slip-end',
    });
    // Fenders, bollards, weed at the line, and the chain block on the dry bed.
    for (const side of [-1, 1]) {
      for (const z of [-6.2, -3.6, -1.0, 1.4]) {
        addCyl(dress, 0.24, 0.24, 0.5, 8, mats.tyre, side * (halfW + 0.14), 0.06, z, {
          rotZ: Math.PI / 2,
        });
      }
      addCyl(dress, 0.11, 0.14, 0.72, 8, mats.rail, side * (halfW - 0.22), 0.55, -6.6);
      addCyl(dress, 0.11, 0.14, 0.72, 8, mats.rail, side * (halfW - 0.22), 0.55, -2.2);
      for (const dz of [-1.5, -0.85]) {
        addBox(dress, 0.62, 0.14, 0.5, mats.weed, side * (geom.halfW - 0.55), 0.22, wl + dz);
      }
    }
    addBox(dress, geom.halfW * 1.5, 0.12, 0.42, mats.weed, 0, 0.21, wl - 1.62);
    addCyl(dress, 0.05, 0.05, 2.3, 6, mats.chain, -2.62, 1.3, -1.2);
    addBox(dress, 0.48, 0.36, 0.36, mats.chain, -2.62, 0.34, -1.2, {
      name: 'military:shipyard:slip-block',
    });
    addBox(dress, 0.7, 0.16, 0.3, mats.rail, -2.62, 2.35, -1.2);
  }

  /**
   * MC2 F3 — the harbour plane the player actually sees. `fringe:port` carries a
   * `waterY` of 0.17, but the mesh that renders under the slipway is
   * `nature:water:ocean` at y 0.02 (kit.js WATER_Y). Measuring the wrong one put
   * the M5 foam collar 0.7 m up-slope of the real intersection.
   */
  _waterY() {
    let node = this.root;
    while (node?.parent) node = node.parent;
    const ocean = node?.getObjectByName?.('nature:water:ocean') ?? null;
    if (ocean) {
      ocean.updateWorldMatrix(true, true);
      const y = ocean.matrixWorld.elements[13];
      if (Number.isFinite(y)) return y;
    }
    return WATER_Y;
  }

  _dressYard(rig) {
    if (!rig?.root || rig.root.userData.m4Dressed) return;
    rig.root.userData.m4Dressed = true;
    /*
     * ── P14 M9 ITEM 2 — THE GANTRY SHADOW WAS A PAINTED BOX. ──
     *
     * `new THREE.BoxGeometry(8.6, 0.05, 11.2)` in `std('#2e2e2c')`: an OPAQUE
     * dark rectangle laid on the yard floor, with `receiveShadow` on so it took
     * a second darkening on top of its own. On the pale apron that is a
     * charcoal plate with four straight edges, not a shadow — the same fault
     * MC3 F4 fixed on the tank prints and for the same reason. It is a multiply
     * stamp now: it darkens the deck to `HARD_CONTACT_FLOOR` under the gantry
     * and feathers to no change at the rim, so the deck's own lane paint and
     * coping survive inside it and nothing has an edge.
     */
    const shadow = makeContactPatch(8.6, 'military:shipyard:gantry-shadow', {
      hard: true, depth: 11.2,
    });
    shadow.position.set(0, (rig.floorY ?? 0) + 0.075, -1.2);
    rig.root.add(shadow);
    const bunting = new THREE.Group();
    bunting.name = 'military:shipyard:bunting';
    const flags = [this.mats.buntA, this.mats.buntB, this.mats.buntC];
    for (let i = 0; i < 9; i += 1) {
      const z = -4.2 + i * 1.05;
      addBox(bunting, 0.08, 0.55, 0.35, flags[i % 3], -3.85, 8.35, z, { rotZ: i % 2 ? 0.2 : -0.15 });
      addBox(bunting, 0.08, 0.55, 0.35, flags[(i + 1) % 3], 3.85, 8.35, z, { rotZ: i % 2 ? -0.18 : 0.14 });
    }
    if (rig.gantry) rig.gantry.add(bunting);
    else rig.root.add(bunting);
    // MC2 F11 — the crowd belongs where the combat cameras point. Absolute world
    // placement was wrong: `fringe:port-shipyard` is not positioned in world axes
    // when `_ensureHull` first runs, so a baked world anchor put the crowd at
    // x -215 instead of +206. Parent it to the slipway and use that slab's own
    // local frame, which is stable whatever the port group does later. They line
    // the DRY upper half, outboard of the rails, counter-rotated off the slope.
    const crowd = new THREE.Group();
    crowd.name = 'military:shipyard:crowd';
    const slip = rig?.slipway ?? this._port()?.getObjectByName?.('fringe:port-shipyard:slipway');
    const geom = slip ? measureSlipway(slip, this._waterY()) : null;
    const tilt = slip?.rotation?.x ?? 0;
    const top = geom ? geom.halfT : 0.18;
    const dry = geom ? Math.min(-1.6, geom.waterlineZ - 3.2) : -2.0;
    // A REAL BUG this pass found: `addToyPerson` returns the GROUP it was told
    // to fill, not the figure. The old crowd wrote `person.rotation.y = ...` on
    // that return value, so every heading in ten iterations was applied to the
    // whole crowd and the last one won. The figures never had headings at all,
    // which is most of why the audit read them as clones. Each figure now gets
    // its own group and the heading lands on it.
    for (const place of yardCrewPlaces(dry)) {
      const fig = new THREE.Group();
      fig.name = `military:shipyard:crew:${place.job}:${place.i}`;
      fig.position.set(place.x, top, place.z);
      fig.rotation.x = -tilt;
      fig.rotation.y = place.heading;
      noPick(fig);
      yardCrewFigure(fig, this.mats, place, fig.name);
      crowd.add(fig);
      // MC3 F5 — every figure stands on its own patch, so ten workers on a
      // tilted slab are ten contacts rather than ten floating markers.
      const patch = makeContactPatch(
        place.radius * 3.1,
        `military:shipyard:crew-patch:${place.job}:${place.i}`,
      );
      patch.position.set(place.x, top + 0.012, place.z);
      crowd.add(patch);
    }
    if (slip) slip.add(crowd);
    else this.root.add(crowd);
    this._dressIdentity(rig);
  }

  /* ================================================================== *
   * P14 M9 ITEM 2 — THE FACETED WHITE DISC, NAMED AND REBUILT.
   *
   * MC4 pack-k scored `M8-wip-shipyard-t10` 2/10 on "unshadowed fill light with
   * no AO, contact, or water reflection, plus a faceted white disc floating as
   * a CAD primitive". The disc is `military:shipyard:foam`, and every word of
   * that description is a property of the object it was:
   *
   *   `new THREE.RingGeometry(0.6, 2.4, 18)` — EIGHTEEN radial segments, so the
   *   silhouette is a regular 18-gon with visible straight edges;
   *   in `mats.foam`, `std('#e8f2f6')` — a LIT near-white standard material,
   *   which at the yard's key returns a flat unshaded white;
   *   inside a group scaled `1 + su * 3.4`, i.e. to 4.4x, so the ring's outer
   *   radius reaches 10.56 m and its inner hole 2.64 m: measured against the
   *   hull's own 409 px at this pose (17.6 m => 23.2 px/m) the disc is about
   *   640 px across, which is 40 % of the frame width;
   *   `castShadow` and `receiveShadow` both DEFAULT FALSE on a bare
   *   `THREE.Mesh`, so it takes no shadow from the hull standing over it —
   *   which is most of why the frame has no contact and no AO. One object was
   *   erasing the grounding of everything above it.
   *   And it was never removed: `this.splash` persists, so the disc is still at
   *   4.4x in the t20 frame, ten seconds after the launch it belongs to.
   *
   * What replaces it is one soft, flat, normal-blended water wash. Its RGBA
   * texture dies before every edge, its peak alpha is below 0.5, and a strict
   * two-second clock removes it. `military:shipyard:splash` and
   * `military:shipyard:foam` both keep their names.
   * ================================================================== */
  /** Radius the wash reaches at full expansion, metres. */
  static get WASH_R() { return 6.2; }
  _makeLaunchWash(rig) {
    const splash = new THREE.Group();
    splash.name = 'military:shipyard:splash';
    splash.userData.contactStamp = true;
    splash.userData.startedAt = this.time;
    noPick(splash);
    const foam = new THREE.Group();
    foam.name = 'military:shipyard:foam';
    noPick(foam);
    splash.add(foam);
    const R = MilitaryShipyardLayer.WASH_R;
    const washMat = new THREE.MeshBasicMaterial({
      map: LAUNCH_WASH_TEX,
      color: 0xeef4f8,
      transparent: true,
      opacity: SHIPYARD_WASH_MAX_ALPHA,
      alphaTest: 0.015,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    washMat.userData.owned = true;
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), washMat);
    wash.name = 'military:shipyard:foam:ring-0';
    wash.rotation.x = -Math.PI / 2;
    wash.scale.set(R * 1.65, R * 0.94, 1);
    wash.position.y = 0.006;
    wash.renderOrder = 7;
    wash.castShadow = false;
    wash.receiveShadow = false;
    wash.userData.ownsGeometry = true;
    wash.userData.baseScale = [wash.scale.x, wash.scale.y];
    wash.userData.waterWash = true;
    noPick(wash);
    foam.add(wash);
    this.spray = [];
    splash.position.set(0, WATER_Y, 14);
    splash.userData.receipt = {
      active: true,
      flatMeshes: 1,
      sprites: 0,
      blending: 'normal',
      maxAlpha: SHIPYARD_WASH_MAX_ALPHA,
      lifetimeS: SHIPYARD_WASH_LIFETIME_S,
    };
    this.launchWashStarted = true;
    rig.root.add(splash);
    return splash;
  }

  _tickLaunchWash() {
    const splash = this.splash;
    if (!splash) return;
    const age = Math.max(0, this.time - (splash.userData.startedAt ?? this.time));
    const u = clamp01(age / SHIPYARD_WASH_LIFETIME_S);
    const fade = (1 - u) * (1 - u);
    const wash = splash.getObjectByName('military:shipyard:foam:ring-0');
    if (wash?.material) {
      const [baseX, baseY] = wash.userData.baseScale;
      const growth = this.reducedMotion ? 1 : 1 + easeInOutCubic(u) * 0.12;
      wash.scale.set(baseX * growth, baseY * (this.reducedMotion ? 1 : 1 + u * 0.06), 1);
      wash.material.opacity = SHIPYARD_WASH_MAX_ALPHA * fade;
    }
    splash.userData.receipt = {
      ...splash.userData.receipt,
      ageS: age,
      opacity: wash?.material?.opacity ?? 0,
    };
    if (u >= 1) {
      splash.traverse((ch) => {
        if (ch.material?.userData?.owned) ch.material.dispose?.();
        if (ch.isMesh && ch.userData.ownsGeometry) ch.geometry?.dispose?.();
      });
      splash.parent?.remove(splash);
      this.splash = null;
      this.spray = [];
    }
  }

  /**
   * MC2 F11 — no full, right-reading PORT OF MELBOURNE survived the combat
   * cameras. These are duplicate plates, one per pose, each yawed to face that
   * pose's azimuth. `addToyLetters` builds letters facing local +Z, and a group
   * yawed by the camera azimuth points local +Z straight down the camera axis.
   */
  _dressIdentity(rig) {
    if (this.root.userData.m5Identity) return;
    this.root.userData.m5Identity = true;
    const logistics = this._port()?.userData?.logistics ?? null;
    const yardAnchor = rig?.root ? worldPos(rig.root, _to) : null;
    const berth = this._berthWorld();
    const admin = logistics?.adminWorld ?? null;
    const plates = [];
    if (yardAnchor) {
      plates.push({
        id: 'yard', azimuth: SHIPYARD_AZIMUTH, s: 1.05, y: 6.4,
        x: yardAnchor.x, z: yardAnchor.z, along: -2.0, out: -13.5,
      });
    }
    if (admin) {
      plates.push({
        id: 'raid', azimuth: RAID_AZIMUTH, s: 1.15, y: 7.2,
        x: admin.x, z: admin.z, along: 0, out: 16.5,
      });
    }
    if (berth) {
      plates.push({
        id: 'sea', azimuth: SEAFIGHT_AZIMUTH, s: 1.35, y: 5.6,
        x: berth.x, z: berth.z, along: 4, out: -34,
      });
    }
    for (const plate of plates) {
      const a = (plate.azimuth * Math.PI) / 180;
      const nx = Math.sin(a);
      const nz = Math.cos(a);
      const g = new THREE.Group();
      g.name = `military:port-name:${plate.id}`;
      g.position.set(
        plate.x + (nz * plate.along) + (nx * plate.out),
        plate.y,
        plate.z + (-nx * plate.along) + (nz * plate.out),
      );
      g.rotation.y = a;
      noPick(g);
      const s = plate.s;
      const w = toyLettersWidth(PORT_NAME, s, s * 0.22);
      const h = s * 1.9;
      addBox(g, w + s * 1.1, h, 0.36, this.mats.signBoard, 0, 0, 0, {
        name: `military:port-name:${plate.id}:board`,
      });
      addBox(g, w + s * 1.1, s * 0.16, 0.44, this.mats.buntA, 0, -h * 0.42, 0.02);
      const front = addToyLetters(g, PORT_NAME, this.mats.signLetter, -w * 0.5, -s * 0.5, 0.24, {
        s, gap: s * 0.22, depth: 0.2,
      });
      front.name = `military:port-name:${plate.id}:letters:front`;
      // The opposite camera used to see the back of the same extruded glyphs,
      // hence mirrored PORT. A separately authored back run reverses both the
      // face normal and its start edge; it reads identically from either side.
      const back = addToyLetters(g, PORT_NAME, this.mats.signLetter, w * 0.5, -s * 0.5, -0.24, {
        s, gap: s * 0.22, depth: 0.2, yaw: Math.PI,
      });
      back.name = `military:port-name:${plate.id}:letters:back`;
      g.userData.readableFaces = 2;
      this.root.add(g);
    }
  }

  _berthWorld() {
    const port = this._port();
    const holder = port?.getObjectByName('fringe:ship:warship-a');
    if (!holder) return null;
    holder.getWorldPosition(_from);
    return {
      x: _from.x,
      y: _from.y,
      z: _from.z,
      holder,
    };
  }

  update(dt, elapsed, city = this.city) {
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.time += step;
    this.city = city ?? this.city;
    const world = this._readWorld();
    const rig = this._rig();
    const row = this._navyRow(world);
    if (!row || !rig) {
      if (this.hull) this.hull.visible = false;
      this.phase = 'idle';
      this.statusSnapshot = { phase: 'idle', stage: null, launched: false };
      return;
    }
    const hull = this._ensureHull(rig);
    hull.visible = true;

    const demo = this.demoLock;
    const buildEnd = 7.2;
    const launchEnd = 14.4;
    const sailEnd = 22;
    let progress;
    let launching = false;
    let sailing = false;
    if (demo) {
      if (this.time < buildEnd) {
        progress = this.time / buildEnd;
        this.phase = 'build';
      } else if (this.time < launchEnd) {
        progress = 1;
        launching = true;
        this.phase = 'launch';
      } else {
        progress = 1;
        sailing = true;
        this.phase = this.time >= sailEnd ? 'berthed' : 'sail';
      }
    } else {
      const beatPhase = (elapsed ?? 0) % 1;
      progress = shipyardProgress(row, world?.beat ?? 0, beatPhase);
      launching = Boolean(row.launched) && progress >= 0.99;
      this.phase = row.launched ? 'sail' : 'build';
    }

    this.stage = hullStageAt(progress);
    applyStage(hull, this.stage);

    if (rig.trolley && this.phase === 'build') {
      rig.trolley.position.z = Math.sin(this.time * 0.7) * 3.2;
    }

    for (let i = 0; i < this.sparks.length; i += 1) {
      const spark = this.sparks[i];
      const on = this.phase === 'build' && this.stage.index >= 1
        && Math.sin(this.time * (11 + i) + i * 1.7) > 0.35;
      spark.visible = on && !this.reducedMotion;
      if (on) {
        spark.position.set(
          (i % 2 ? -1.2 : 1.2),
          1.1 + (i % 3) * 0.45,
          -4 + i * 1.3 + Math.sin(this.time * 8 + i) * 0.2,
        );
        spark.material.opacity = 0.5 + Math.abs(Math.sin(this.time * 20 + i)) * 0.5;
      }
    }

    if (rig.cradle) {
      if (launching || sailing) {
        const lu = demo ? clamp01((this.time - buildEnd) / 1.4) : 1;
        rig.cradle.position.y = (rig.floorY ?? rig.cradle.position.y) + 0.52 - easeInOutCubic(lu) * 1.35;
      }
    }

    if (launching && this.hull.parent === rig.mount) {
      const lu = clamp01((this.time - buildEnd) / (launchEnd - buildEnd));
      const start = { x: 0, z: 0 };
      const end = { x: 0, z: 14.5 };
      const pose = samplePolyline([start, end], easeInOutCubic(lu));
      hull.position.set(pose.x, 0.55 - lu * 0.25, pose.z);
      hull.rotation.x = lu * 0.08;
      if (lu > 0.55 && !this.splash && !this.launchWashStarted) {
        this.splash = this._makeLaunchWash(rig);
      }
      if (this.splash) {
        this._tickLaunchWash();
      }
    }

    if (sailing) {
      const su = clamp01((this.time - launchEnd) / (sailEnd - launchEnd));
      const port = this._port();
      const logistics = port?.userData?.logistics;
      const berth = port?.getObjectByName('fringe:ship:warship-a');
      if (hull.parent !== this.root) {
        this.root.attach(hull);
        this._sailStartScale = hull.scale.clone();
      }
      // Continue from the exact authored mount-local end of the launch leg.
      // World-axis offsets jump inland when the port is rotated to another edge.
      rig.mount.localToWorld(_from.set(0, 0.3, 14.5));
      if (berth) berth.getWorldPosition(_to);
      else rig.mount.localToWorld(_to.set(20, 0.3, 38.5));
      _to.y = 0.35;
      const travel = easeInOutCubic(su);
      hull.position.copy(_from).lerp(_to, travel);
      this.root.worldToLocal(hull.position);
      rig.mount.getWorldQuaternion(_sailStartRotation).multiply(_launchPitch);
      _sailEndRotation.setFromEuler(_sailYaw.set(0, Math.atan2(_to.x - _from.x, _to.z - _from.z), 0));
      this.root.getWorldQuaternion(_sailRootRotation).invert();
      hull.quaternion.copy(_sailStartRotation).slerp(_sailEndRotation, travel).premultiply(_sailRootRotation);
      hull.scale.copy(this._sailStartScale ?? hull.scale);
      hull.scale.lerp(_wakeWorldScale.set(1, 1, 1), travel);
      /*
       * ── P14 M9 ITEM 3 — THE LAUNCHED HULL SITS IN THE WATER. ──
       *
       * `addDepartWake(16, 5)` is seven `PlaneGeometry` strips at descending
       * opacity — the straight-edged decal family PM5A's live census found on
       * the port's own pilot boat. `port/port-vehicles.js` is another lane's
       * file and is untouched; this hull no longer calls it. What it carries
       * instead is the same three-part dressing the navy hull and the skiffs
       * carry, on this hull's own plan and heading, plus a tapering stern wake.
       *
       * The dressing is parented to the hull, so it follows the sail leg; the
       * hull is bow-to-+Z like everything this yard lays, so yaw is -PI/2.
       */
      if (!this.wake) {
        const water = new THREE.Group();
        water.name = 'military:shipyard:hull-water';
        noPick(water);
        // Exact inverse-parent compensation below keeps this water dressing
        // horizontal while the launched hull changes pitch, height and scale.
        water.matrixAutoUpdate = false;
        addPlanShade(water, {
          x: 0, z: 0, yaw: -Math.PI / 2, len: 15.4, beam: 3.9,
          y: 0.004, hug: 0.04, width: 2.1, hold: 0.42, step: 1.1, seed: 13,
          name: 'military:shipyard:hull-water:shade',
        });
        addPlanCollar(water, {
          x: 0, z: 0, yaw: -Math.PI / 2, len: 15.4, beam: 3.9,
          y: 0.012, hug: 0.1, width: 0.5, step: 1.0, amp: 0.32, seed: 6,
          name: 'military:shipyard:hull-water:collar',
        });
        addSternWake(water, {
          x: 0, z: -7.8, yaw: -Math.PI / 2, len: 17, beam: 5.0,
          y: 0.014, amp: 0.30, stations: 11, seed: 21,
          name: 'military:shipyard:hull-water:wake',
        });
        hull.add(water);
        this.wake = water;
        // The keel blocks and the on-blocks shade belong to a hull on a slip,
        // not to one under way.
        if (hull.userData.m9Shade) hull.userData.m9Shade.visible = false;
        hull.traverse((ch) => {
          if (/:block-contact:/.test(ch.name ?? '')) ch.visible = false;
        });
      }
      hull.updateWorldMatrix(true, false);
      hull.getWorldPosition(_wakeWorldPosition); _wakeWorldPosition.y = WATER_Y;
      hull.getWorldScale(_wakeWorldScale);
      _wakeForward.set(0, 0, 1).transformDirection(hull.matrixWorld);
      _wakeWorldRotation.setFromEuler(_sailYaw.set(0, Math.atan2(_wakeForward.x, _wakeForward.z), 0));
      _wakeWorldMatrix.compose(_wakeWorldPosition, _wakeWorldRotation, _wakeWorldScale);
      this.wake.matrix.copy(hull.matrixWorld).invert().multiply(_wakeWorldMatrix);
      this.wake.matrixWorldNeedsUpdate = true;
      this.wake.visible = su > 0.02;
      if (su >= 1) {
        hull.position.copy(_to);
        this.root.worldToLocal(hull.position);
        this.phase = 'berthed';
      }
    }

    this.statusSnapshot = {
      phase: this.phase,
      stage: this.stage.name,
      index: this.stage.index,
      progress,
      launched: this.phase === 'sail' || this.phase === 'berthed' || this.phase === 'launch',
      x: hull.position.x,
      z: hull.position.z,
      wash: this.splash?.userData?.receipt ?? {
        active: false,
        spent: this.launchWashStarted,
      },
    };
  }

  status() {
    return this.statusSnapshot;
  }

  subject() {
    const hull = this.hull;
    if (hull?.visible) {
      const p = new THREE.Vector3();
      hull.getWorldPosition(p);
      return { x: p.x, y: p.y + 2, z: p.z };
    }
    const rig = this._rig();
    if (rig && typeof this._port()?.userData?.logistics?.toWorld === 'function') {
      return this._port().userData.logistics.toWorld(rig.x, 3, rig.z);
    }
    return { x: 180, y: 3, z: 40 };
  }

  /** MC3 F1 — the same law as the raid and the seafight: the yard camera has to
   *  see the hull, the dressed slip and the crowd, or it is not the yard shot. */
  sightPoints() {
    const out = [];
    const p = new THREE.Vector3();
    const add = (label, obj, lift) => {
      if (!obj || obj.visible === false) return;
      obj.getWorldPosition(p);
      if (!Number.isFinite(p.x)) return;
      out.push({ label, x: p.x, y: p.y + lift, z: p.z });
    };
    add('hull', this.hull, 3.2);
    const port = this._port();
    add('slip', port?.getObjectByName?.('military:shipyard:slipway-dress') ?? null, 2.4);
    add('crowd', port?.getObjectByName?.('military:shipyard:crowd') ?? null, 1.6);
    return out;
  }

  dispose() {
    this._portLookup = null;
    this.root.parent?.remove(this.root);
    this.hull = null;
  }
}
