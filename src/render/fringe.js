// District Deck — landscape fringe beyond the playable board.
// Presentation only: hills, Yarra, expansion ghosts, alpine haze. No sim, no Math.random.
//
// WHAT IN THIS FILE ACTUALLY REACHES A PIXEL (measured 2026-09-02, board-AAA lane 2)
// ---------------------------------------------------------------------------------
// Four of the terrain meshes built below are HIDDEN AT RUNTIME by layers that mount
// after this one, and have been since the edge-massing crust landed:
//
//   fringe:annulus-near    hidden by  water.js  (`OCEAN.hiddenNearAnnulus`)
//   fringe:annulus-far     hidden by  edge-massing.js + water.js (`HIDDEN_FRINGE_TERRAIN`)
//   fringe:expansion       hidden by  edge-massing.js + water.js
//   fringe:alpine          hidden by  edge-massing.js + water.js
//   fringe:far-sea-beyond  hidden by  water.js  (`OCEAN.hiddenFarSea`)
//
// So `heightWorld()` / `colorWorld()` describe a surface NOBODY SEES. The ground the
// player and the plates see outside the board is `world:edge-massing:crust`, whose
// height is `surroundHeightAt()` and whose colour is `surroundColorAt()`.
//
// That mismatch was the floating-tree fault: `treePlacements()` grounded 500 ring
// trees on `heightWorld`, which is not the rendered ground. Measured gap of the tree
// base above the rendered crust: median 11.42 m, p95 29.09 m, max 32.35 m, with 213
// of 500 more than 20 m in the air. Two earlier patches in this file (a waterness
// gate, then a numeric keep-out circle at world (60,500) r=120) treated symptoms of
// that same mismatch, which is why the owner reported the fault a third time.
//
// Everything placed on the fringe ring from here on grounds on `hinterlandGroundAt()`,
// which is the crust plus this file's own relief overlay — i.e. the surface that is
// actually rasterised. Do not reintroduce `heightWorld` as a placement height.
// `heightWorld` / `terrainHeightAt` stay exported and unchanged: `fringe.test.mjs`
// pins their profile and the venue modules take `heightAt` from them.

import * as THREE from 'three';
import { applyWorldRestyle } from './style/restyle.js';
import { clusterTreeGeometry, leafClusterGeometry } from './foliage.js';
import { mergeGeometries as mergeLeafParts } from 'three/addons/utils/BufferGeometryUtils.js';
import { hashSeed } from './textures.js';
import { PITCH, ROAD, BLOCK, STOREY } from '../core/grid.js';
import { SHORE, edgeAxes, shorePoint, alongLength } from './shore.js';
// The overlay's outer radius is shared with the crust, which fades its own field
// toward it. It lives in `ring-metrics.js` — a module that imports nothing, so
// neither side can close a cycle and neither side holds a private copy. See that
// file's header for the two occasions this programme paid for the private copy.
import { OVERLAY_OUTER, overlayPitchAt } from './ring-metrics.js';
// HELD-FILE TOUCH (escalated, third explicit user order on ocean/floating
// trees, 2026-09-01): the crust's waterness field gates tree planting.
// Widened 2026-09-02 (board-AAA lane 2) to the crust's height and colour fields
// as well, because the crust IS the visible ground — read-only imports, no edits.
import {
  planEdgeMassing, waternessAt, surroundHeightAt, surroundHeightSheetAt, drawnCrustHeightAt, coastRimAt, surroundColorAt, RING_LAYOUT,
  creekFieldAt, seatBatterAt, seatBankLiftLimitAt, ONE_GROUND,
  bakeRingAlbedo, attachRingAlbedo, stampRingAlbedoLine, RING_ALBEDO,
  bakeRingHeight, EDGE_APRON, ringAlbedoUv, LANDFORM_TRIAL, COAST_FAR, RING_SEAM,
  SHEET_SHORE, bakeSheetShore, attachSheetShore,
} from './edge-massing.js';
import { addPort, updatePort } from './fringe/port.js';
import { updateContainerFittings } from './fringe/ships.js';
import { attachFarmFields } from './fringe/farm.js';
import { surveyedPaddocks } from '../core/city.js';
import { buildCoastRim, buildCoastBoulders, buildRidgeBoulders } from './fringe/coast-rim.js';
import { attachGroundDetail } from './fringe/ground-detail.js';
import { GROUND_SURFACE, GS, groundSurfaceCommonGlsl, groundSurfaceFormGlsl, groundSurfaceApplyGlsl, groundSurfaceBandHalfM, groundSurfaceKey, surfaceFormTexture } from './ground-surface.js';
import {
  makeCattleGeometry, makeSheepGeometry, makeShedGeometry, makeBaleGeometry, makeFenceGeometry, makeRailFenceMaterial, makeWireFenceGeometry, makeGateMaterial, RAIL_FENCE_TONES, RAIL_FENCE_COLOUR,
  makeStoneWallGeometry, makeDamBankGeometry, STOCK_COATS,
} from './fringe/farm-models.js';
import { addAirport, updateAirport } from './fringe/airport.js';
import { restyleAirport } from './style/restyle.js';
import { addStation, updateStation } from './fringe/station.js';
import { addApostles, updateApostles } from './fringe/apostles.js';
import { addEvents, updateEvents } from './fringe/events.js';
import { addRailLink, updateRailLink } from './fringe/rail-link.js';
import { applyGroundShadowFloor } from './fringe/transit.js';
import { LAND_EDGE, landStartRadius, landEdgeForPlan, landEdgeAt, landModelFor, activeLandEdge, setActiveLandEdge, onVenueReach } from './land-edge.js';
import { attachVenueGround, venueGroundRegions, venueGroundWeight, venueGroundPaths, distanceToVenuePath, recessVenuePaths } from './fringe/venue-ground.js';
import { fringeRolesOf, planFringeTerminals, harbourAlongSign } from '../core/fringe-venues.js';
import { TASTE, TASTE_SCALE } from './taste-tokens.js';
import {
  eucalyptForm, cypressForm, scrubForm, tuftForm, TUFT_SHRUB_RATIO, reedForm, duneGrassForm, hedgeRunGeometry, hedgerowFormActive, hedgerowTidyActive, HEDGEROW_TIDY_PARAMS, windbreakRowGeometry,
} from './tree-forms.js';
import { applyFoliageDetail, crownCardDepthMaterial } from './foliage-detail.js'; // W19-A; W21-A
import { crownCardsActive, crownSwitch } from './tree-forms.js';
// taste W33: the formed farm track (W31 and W32) lives in fringe/track-form.js so rail-link.js and farm.js can draw it too.
import {
  TRACK_FORM, setTrackForm, trackFormActive, TRACK_RUT, setTrackRut, trackRutActive, TRACK_KIN, setTrackKin, trackKinActive,
  TRACK_APRON, setTrackApron, trackApronActive, TRACK_ROUTE, setTrackRoute, trackRouteActive, routeFarmTracks,
  TRACK_GATES, setTrackGates, trackGatesActive, trackGateToneActive, TRACK_GATE_BAND, makeTrackBandIndex, bandCuts, fitPanelsToTracks, resolveGateways, pairHalfRuns,
  makeRingPaintMaterial, makeTrackFormMaterial, makeFarmTrackForm, trackBedActive,
} from './fringe/track-form.js';
import { buildTrackGates, collectGateObstacles, segTriDist, sectorDist, GATE_KIT } from './fringe/track-gate.js';
export { TRACK_FORM, setTrackForm, trackFormActive, TRACK_RUT, setTrackRut, trackRutActive, TRACK_KIN, setTrackKin, trackKinActive, TRACK_APRON, setTrackApron, trackApronActive };

const TAU = Math.PI * 2;

/** Token hex to linear working-space RGB (what a material colour and a shader constant hold). */
function tokenLinear(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
const glslVec3 = (v) => `vec3(${v.map((n) => n.toFixed(5)).join(', ')})`;

/**
 * ── TASTE R1: THE VENUE GROUND IS NOT FARMLAND ──
 *
 * Rod Laver and the Grand Prix each own one ground polygon (bible section 8), and
 * the hinterland generates nothing inside it or inside its 10 m blend zone: no farm
 * track, hedge, fence, wall, windbreak, tree, scrub, stock or reed. World metres,
 * taken from the Lane 2 hand-off after the Grand Prix precinct moved east (its
 * ground now stops at x 282, 292 with the blend). The farm dam at x 293-331 stays.
 */
const VENUE_KEEP_OUT = Object.freeze([
  Object.freeze({ x0: 20, x1: 167, z0: 272, z1: 412 }), // Rod Laver
  Object.freeze({ x0: 158, x1: 293, z0: 284, z1: 466 }), // Grand Prix
]);
function inVenueKeepOut(x, z) {
  for (const r of VENUE_KEEP_OUT) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return true;
  }
  return false;
}
/** True if the segment (x0,z0)-(x1,z1) touches a keep-out polygon; sampled every 3 m. */
function segmentInVenueKeepOut(x0, z0, x1, z1) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 3));
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    if (inVenueKeepOut(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return true;
  }
  return false;
}

/**
 * W85 fix 1: the venues' reach (`LAND_EDGE`'s mown apron past each footprint) is venue ground the plan-time pasture check cannot see (it reads a model with no footprints yet). At mesh time
 * the farm is kept off it as off W79's venue ground: weight `REACH_KEEP_WEIGHT` or more on the reach, an item at its centre and a run along its length (every 3 m). The weight is 0.01, a fifth of the
 * pasture's `venueMax` (0.05): 1.5 m further out, where a hedge's, a windbreak's or a shade disc's own width, which reaches 1 to 2 m past its centre line, no longer stands on ground over 0.05.
 * Farm tracks are not items and may cross it. Nothing here when the model has no reach (the switch off, or the reach knob at 0).
 */
const REACH_KEEP_WEIGHT = 0.01;
const REACH_PASTURE_MAX = 0.05; // and the pasture's own `venueMax`: ground W79 left at 0.01 to 0.05 that the reach lifts to venue ground counts as reach
function segmentOnVenueReach(x0, z0, x1, z1, model) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 3));
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    if (onVenueReach(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, model, REACH_KEEP_WEIGHT)) return true;
  }
  return false;
}

export const FRINGE_ASSET_PICK_TARGETS = Object.freeze([
  Object.freeze({ id: 'buy', objectName: 'fringe:tullamarine-apron', pickObjectName: 'fringe:tullamarine-apron', label: 'Tullamarine' }),
  Object.freeze({ id: 'rail-link', objectName: 'fringe:airport-link', pickObjectName: 'fringe:airport-link-shuttle:body', label: 'Airport rail' }),
  Object.freeze({ id: 'rail-link', objectName: 'fringe:southern-cross-hall', pickObjectName: 'fringe:southern-cross-hall', label: 'Southern Cross rail gate' }),
  Object.freeze({ id: 'hotel', objectName: 'fringe:tullamarine-hotel', pickObjectName: 'fringe:tullamarine-hotel-tower', label: 'Airside hotel' }),
  Object.freeze({ id: 'terminal', objectName: 'fringe:tullamarine-terminal', pickObjectName: 'fringe:tullamarine-terminal-shell', label: 'Second terminal' }),
  Object.freeze({ id: 'rod-laver', objectName: 'fringe:rod-laver', pickObjectName: 'fringe:rod-laver-court', label: 'Rod Laver' }),
  Object.freeze({ id: 'grand-prix', objectName: 'fringe:grand-prix', pickObjectName: 'fringe:grand-prix-track', label: 'Grand Prix' }),
  Object.freeze({ id: 'falls-creek', objectName: 'fringe:falls-creek', pickObjectName: 'fringe:falls-creek-lodge', label: 'Falls Creek' }),
  Object.freeze({ id: 'port', objectName: 'fringe:port-terminal', pickObjectName: 'fringe:port-hero-container:lower', label: 'Port of Melbourne' }),
]);

function makeFringePickTargets(root) {
  root.updateWorldMatrix(true, true);
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  });
  const targets = [];
  for (let index = 0; index < FRINGE_ASSET_PICK_TARGETS.length; index += 1) {
    const spec = FRINGE_ASSET_PICK_TARGETS[index];
    const source = root.getObjectByName(spec.objectName);
    const pickSource = root.getObjectByName(spec.pickObjectName);
    // A pick source may be a mesh or a named group. Southern Cross deliberately uses
    // the complete hall group so the whole landmark, not its tiny letter plate, clicks.
    if (!source || !pickSource?.isObject3D) continue;
    pickSource.updateWorldMatrix(true, false);
    const bounds = new THREE.Box3().setFromObject(pickSource);
    if (bounds.isEmpty()) continue;
    const size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3());
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(
        Math.max(1.25, size.x),
        Math.max(1.25, size.y),
        Math.max(1.25, size.z),
      ),
      material,
    );
    proxy.name = `pick:fringe:${spec.id}:${index}`;
    proxy.position.copy(root.worldToLocal(centre));
    proxy.userData.fringeId = spec.id;
    proxy.userData.label = spec.label;
    proxy.userData.sourceName = spec.objectName;
    proxy.userData.sourceMeshName = spec.pickObjectName;
    targets.push(proxy);
    root.add(proxy);
  }
  return targets;
}

function unitFromKey(key) {
  return (hashSeed(String(key)) >>> 0) / 4294967296;
}

function wob(a, b = 0, c = 0) {
  const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Decorrelated unit sample for keys that walk an index or a lattice.
 *
 * `unitFromKey` is FNV over a string, and FNV has poor avalanche between keys
 * that differ by one character. Measured on this file's own key shapes:
 *
 *   walking one lattice row, lag-1 autocorrelation   0.155  (`wob`: 0.005)
 *   low-tail hits per column over a 40x40 block      0, 0, 0, 0, 10, 0, 0, 10,
 *                                                    10, 18, 0, 18, ... — 20 of
 *                                                    40 columns get none and one
 *                                                    gets 19, against 4.4 expected
 *
 * That is not a nicety. It is why the shipped ring trees contain runs marching
 * in exact 1.0 m steps along a straight line, with duplicate positions — the
 * bar's "clone array in a straight line at even spacing" veto, arriving through
 * the random source rather than through the layout code. Every index- or
 * lattice-walked draw in this file now goes through here instead.
 *
 * `unitFromKey` stays for one-shot named keys, where its behaviour is fine.
 */
function idxUnit(salt, a, b = 0, seed = 0) {
  return wob(
    a * 0.9137 + salt * 3.117 + 0.61,
    b * 1.2731 + seed * 0.0173 + 2.13,
    salt * 7.31 + 11,
  );
}

function valueNoise2(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = wob(x0, y0, seed);
  const n10 = wob(x0 + 1, y0, seed);
  const n01 = wob(x0, y0 + 1, seed);
  const n11 = wob(x0 + 1, y0 + 1, seed);
  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}

function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / Math.max(1e-6, e1 - e0));
  return t * t * (3 - 2 * t);
}

function seawardOf(x, z, extent, edge) {
  if (edge === 'south') return z - extent.z;
  if (edge === 'north') return -z;
  if (edge === 'east') return x - extent.x;
  return -x;
}

function alongOf(x, z, extent, edge) {
  if (edge === 'north' || edge === 'south') return x - extent.x * 0.5;
  return z - extent.z * 0.5;
}

function outDist(x, z, extent) {
  return Math.max(-z, z - extent.z, -x, x - extent.x);
}

function boardHalfOf(extent, bay) {
  return ((bay === 'north' || bay === 'south') ? extent.x : extent.z) * 0.5;
}

const HEADLAND_SLOPE_RUN = 40;
const FAR_SHORE_RISE_RUN = 64;

function headlandInnerAlong(sea, extent, bay) {
  const half = boardHalfOf(extent, bay);
  const waterLine = (SHORE.waterFromWall ?? 48) - 2;
  const seaMax = (SHORE.baySeaMax ?? 150) + (SHORE.bayWaterOverlap ?? 68);
  const turn = smoothstep(waterLine, seaMax, sea);
  // The cove opens towards the opposite shore but remains inside the finite
  // water mesh, leaving enough buried water for a clean cliff/water join.
  // W15: scallop the inner edge so the headland is a coastline, not a ruler.
  const scallop = Math.sin(sea * 0.031 + 0.4) * 9.5 + Math.sin(sea * 0.017) * 5.0;
  return lerp(half - 38, half - 6, turn) + scallop;
}

function inCornerWrap(x, z, extent, bay) {
  const sea = seawardOf(x, z, extent, bay);
  const along = Math.abs(alongOf(x, z, extent, bay));
  const half = boardHalfOf(extent, bay);
  const waterLine = (SHORE.waterFromWall ?? 48) - 2;
  const seaMax = (SHORE.baySeaMax ?? 150) + (SHORE.bayWaterOverlap ?? 68);
  if (sea < waterLine || sea > seaMax) return false;
  return along >= headlandInnerAlong(sea, extent, bay)
    && along <= half + (SHORE.cornerWrapR ?? 140);
}

function inBayFootprint(x, z, extent, bay) {
  // Open Port Phillip only. Dry sand, corner wraps, and hinterland stay land.
  const sea = seawardOf(x, z, extent, bay);
  const along = Math.abs(alongOf(x, z, extent, bay));
  const half = boardHalfOf(extent, bay);
  const pad = SHORE.bayWaterAlongPad ?? 8;
  if (sea > (SHORE.baySeaMax ?? 150)) return false;
  if (sea < SHORE.waterFromWall - 2) return false;
  if (along >= half + pad) return false;
  if (inCornerWrap(x, z, extent, bay)) return false;
  return true;
}

function inHarbourFootprint(x, z, extent, roles) {
  const sea = seawardOf(x, z, extent, roles.yarraEdge);
  const along = alongOf(x, z, extent, roles.yarraEdge);
  const run = (roles.yarraEdge === 'north' || roles.yarraEdge === 'south')
    ? extent.x : extent.z;
  const sign = harbourAlongSign(roles);
  const u = along / Math.max(1, run * 0.5);
  const onHarbourEnd = sign > 0 ? u > 0.12 : u < -0.12;
  // Match the port's real basin: the quay/apron is land at ~32 m, then berth
  // water starts around 50 m and runs beneath the ships. Masking from the board
  // edge created the conspicuous grey corner moat this layer is meant to remove.
  const basinStart = SHORE.wallOffset + SHORE.waterFromWall - 2;
  return sea > basinStart && sea < 180 && onHarbourEnd;
}

function harbourLandRiseAt(x, z, extent, roles) {
  const sea = seawardOf(x, z, extent, roles.yarraEdge);
  const along = alongOf(x, z, extent, roles.yarraEdge);
  const run = (roles.yarraEdge === 'north' || roles.yarraEdge === 'south')
    ? extent.x : extent.z;
  const sign = harbourAlongSign(roles);
  const u = along / Math.max(1, run * 0.5);
  const onHarbourEnd = sign > 0 ? u > 0.12 : u < -0.12;
  if (!onHarbourEnd) return 1;
  const basinStart = SHORE.wallOffset + SHORE.waterFromWall - 2;
  return clamp01((basinStart - sea) / HEADLAND_SLOPE_RUN);
}

function headlandProfileAt(x, z, plan) {
  const { extent, roles, seed } = plan;
  const sea = seawardOf(x, z, extent, roles.bay);
  const alongSigned = alongOf(x, z, extent, roles.bay);
  const alongAbs = Math.abs(alongSigned);
  const waterLine = (SHORE.waterFromWall ?? 48) - 2;
  const seaMax = SHORE.baySeaMax ?? 150;
  const inner = headlandInnerAlong(sea, extent, roles.bay);
  const outer = boardHalfOf(extent, roles.bay) + (SHORE.cornerWrapR ?? 140);
  if (sea < -60 || sea > seaMax || alongAbs < inner || alongAbs > outer) return null;
  if (inHarbourFootprint(x, z, extent, roles)) return null;

  // A linear forty-metre rise keeps each eight-metre lattice step below 3 m.
  // The old 12–28 m jump at `inner` was the source of the giant green facets.
  const fromWater = Math.max(0, alongAbs - inner);
  const rise = clamp01(fromWater / HEADLAND_SLOPE_RUN);
  const coastApproach = smoothstep(-60, waterLine, sea);
  const harbourSign = harbourAlongSign(roles);
  const onGorCorner = Math.sign(alongSigned || 1) !== Math.sign(harbourSign || 1);
  const undulation = 0.5 + 0.5 * Math.sin(sea * 0.035 + seed * 0.013)
    + 0.18 * Math.sin(alongSigned * 0.021 + sea * 0.014);
  const browHeight = 10.2 + undulation * 0.8 + (onGorCorner ? 0.6 : 0);
  const harbourRise = harbourLandRiseAt(x, z, extent, roles);
  return {
    height: browHeight * rise * harbourRise * coastApproach,
    rise: Math.min(rise, harbourRise),
  };
}

function hslLand(h, s, l) {
  return new THREE.Color().setHSL(h, s, l, THREE.SRGBColorSpace);
}

function edgeOutAzimuth(edge) {
  if (edge === 'south') return 0;
  if (edge === 'east') return Math.PI / 2;
  if (edge === 'north') return Math.PI;
  return -Math.PI / 2;
}

function angDist(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return Math.abs(d);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

function qualityTier(quality) {
  if (quality === 'low') return 'low';
  if (quality === 'medium') return 'medium';
  return 'high';
}

/** Compass roles relative to the live waterEdge. Pure. */
export function planFringeRoles(city) {
  return fringeRolesOf(city);
}

export { planFringeTerminals };

function rayToSquare(az, hx, hz) {
  const dx = Math.sin(az);
  const dz = Math.cos(az);
  const tx = Math.abs(dx) < 1e-9 ? Infinity : hx / Math.abs(dx);
  const tz = Math.abs(dz) < 1e-9 ? Infinity : hz / Math.abs(dz);
  return Math.min(tx, tz);
}

function roleWeights(az, roles) {
  const hills = Math.max(0, 1 - angDist(az, edgeOutAzimuth(roles.hillsEdge)) / 1.15);
  const yarra = Math.max(0, 1 - angDist(az, edgeOutAzimuth(roles.yarraEdge)) / 1.15);
  const inland = Math.max(0, 1 - angDist(az, edgeOutAzimuth(roles.inlandEdge)) / 1.15);
  const bay = Math.max(0, 1 - angDist(az, edgeOutAzimuth(roles.bay)) / 0.85);
  const alpine = hills * inland;
  return { hills, yarra, inland, bay, alpine };
}

function riverMouth(extent, bay, yarra) {
  const p = new THREE.Vector3();
  p.x = (bay === 'west' || yarra === 'west') ? 0
    : (bay === 'east' || yarra === 'east') ? extent.x : extent.x * 0.5;
  p.z = (bay === 'north' || yarra === 'north') ? 0
    : (bay === 'south' || yarra === 'south') ? extent.z : extent.z * 0.5;
  const baySea = edgeAxes(bay).seaward;
  const yarraSea = edgeAxes(yarra).seaward;
  p.addScaledVector(baySea, 28);
  p.addScaledVector(yarraSea, 18);
  return p;
}

function riverPolyline(city, roles) {
  const { extent } = city;
  const edge = roles.yarraEdge;
  const L = alongLength(edge, extent);
  const mouth = riverMouth(extent, roles.bay, edge);
  const pts = [];
  const n = 20;
  for (let i = 0; i < n; i += 1) {
    const u = i / (n - 1);
    const inland = 1 - u;
    const along = (unitFromKey(`yarra-along`) - 0.5) * 0.1 * L
      + (inland - 0.5) * (L * 0.55)
      + Math.sin(inland * Math.PI * 2.4) * 14;
    const out = 24 + inland * 320;
    const p = shorePoint(edge, extent, out, along);
    p.lerp(mouth, u * u);
    pts.push(p);
  }
  return pts;
}

function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const ax = pts[i].x;
    const az = pts[i].z;
    const bx = pts[i + 1].x - ax;
    const bz = pts[i + 1].z - az;
    const len2 = bx * bx + bz * bz || 1;
    const t = clamp01(((x - ax) * bx + (z - az) * bz) / len2);
    const dx = x - (ax + bx * t);
    const dz = z - (az + bz * t);
    const d = Math.hypot(dx, dz);
    if (d < best) best = d;
  }
  return best;
}

function heightWorld(x, z, plan) {
  const { extent, roles, seed, river } = plan;
  const seaBay = seawardOf(x, z, extent, roles.bay);
  if (inBayFootprint(x, z, extent, roles.bay)) return 0;
  if (inHarbourFootprint(x, z, extent, roles)) return 0;
  const baySeaMax = SHORE.baySeaMax ?? 150;
  const farShore = seaBay > baySeaMax;
  const d = outDist(x, z, extent);
  if (d < 0) return 0;
  const ramp = smoothstep(0, 40, d);
  const n = valueNoise2(x * 0.018, z * 0.018, seed);
  const nFine = valueNoise2(x * 0.055, z * 0.055, seed + 17);
  let h = (0.4 + n * 2.4 + nFine * 0.8) * ramp;
  let landFloor = 0;

  if (farShore) {
    // A postcard-height opposite paddock closes the finite bay. The finite
    // water covers the complete gentle rise, hiding the mesh join.
    const rise = clamp01((seaBay - baySeaMax) / FAR_SHORE_RISE_RUN);
    const berm = 8 + n * 4.2 + nFine * 1.2;
    landFloor = 8 * rise;
    h = Math.min(14, Math.max(landFloor, berm * rise));
  }

  const dHills = seawardOf(x, z, extent, roles.hillsEdge);
  const alongH = alongOf(x, z, extent, roles.hillsEdge);
  const hillsAlongMax = ((roles.hillsEdge === 'north' || roles.hillsEdge === 'south')
    ? extent.x : extent.z) * 0.5 + 20;
  if (seaBay <= 8 && Math.abs(alongH) < hillsAlongMax && dHills > 80 && dHills < 520) {
    const crest = 260 + 50 * Math.sin(alongH * 0.009 + seed * 0.001);
    const band = Math.exp(-((dHills - crest) ** 2) / (2 * 90 * 90));
    const saddle = 0.7 + 0.3 * Math.cos(alongH * 0.007);
    const gate = smoothstep(90, 250, dHills) * (1 - smoothstep(430, 510, dHills));
    h += band * gate * saddle * (36 + n * 8);
  }

  const headland = !farShore ? headlandProfileAt(x, z, plan) : null;
  if (headland) {
    // This terrain is the hill profile itself: allowing the generic noise floor
    // through at rise=0 would recreate a small wall along the waterline.
    landFloor = Math.max(landFloor, headland.height);
    h = headland.height;
  }

  const valley = distToPolyline(x, z, river);
  h -= Math.exp(-(valley * valley) / (2 * 16 * 16)) * Math.min(h, 4.5);

  return Math.max(0, landFloor, h);
}

export function terrainHeightAt(x, z, plan) {
  return heightWorld(x, z, plan);
}

function colorWorld(x, z, plan, haze) {
  const { extent, roles, seed } = plan;
  const d = Math.max(0, outDist(x, z, extent));
  const n = valueNoise2(x * 0.02, z * 0.02, seed + 3);
  const dHills = seawardOf(x, z, extent, roles.hillsEdge);
  const seaBay = seawardOf(x, z, extent, roles.bay);
  const farShore = seaBay > (SHORE.baySeaMax ?? 150);
  const suburb = hslLand(0.285, 0.64, 0.34 + n * 0.035);
  const paddock = hslLand(0.23, 0.58, 0.36 + n * 0.035);
  const ridge = hslLand(0.32, 0.60, 0.30 + n * 0.03);
  const nearGrass = new THREE.Color('#3a7a32');
  nearGrass.offsetHSL(n * 0.018 - 0.009, 0, n * 0.045 - 0.02);
  const farGrass = new THREE.Color('#3a7a32');
  farGrass.offsetHSL(n * 0.012 - 0.006, 0, n * 0.035 - 0.016);
  const headland = !farShore ? headlandProfileAt(x, z, plan) : null;
  const col = suburb.clone();
  const dYarra = seawardOf(x, z, extent, roles.yarraEdge);
  col.lerp(paddock, clamp01(dYarra / 80) * 0.55);
  col.lerp(ridge, clamp01((dHills - 140) / 160) * 0.7);
  if (d <= 120 && !inBayFootprint(x, z, extent, roles.bay)) col.copy(nearGrass);
  if (farShore) col.copy(farGrass);
  if (headland) {
    const ochreToe = new THREE.Color('#88542f');
    const ochreFace = new THREE.Color('#c48648');
    col.copy(ochreToe).lerp(ochreFace, smoothstep(0, 0.7, headland.rise));
    col.lerp(nearGrass, smoothstep(0.68, 1, headland.rise));
  }
  col.lerp(haze, clamp01((d - 420) / 500) * 0.22);
  return col;
}

function expansionBlocks(city, roles, seed) {
  const { extent } = city;
  const edge = roles.inlandEdge;
  const { along } = edgeAxes(edge);
  const L = alongLength(edge, extent);
  const origin = shorePoint(edge, extent, 0, 0);
  const blocks = [];
  const rows = [
    { out: ROAD + BLOCK * 0.5 + 8, count: 12 },
    { out: ROAD + BLOCK * 0.5 + 8 + PITCH, count: 11 },
  ];
  let index = 0;
  for (const row of rows) {
    const count = 10 + Math.floor(unitFromKey(`fringe-exp-n:${seed}:${row.out}`) * 5);
    for (let i = 0; i < count; i += 1) {
      const gap = unitFromKey(`fringe-exp-gap:${seed}:${index}`);
      if (gap < 0.16) {
        index += 1;
        continue;
      }
      const t = (i / Math.max(1, count - 1) - 0.5) * (L - 48);
      const jitter = (unitFromKey(`fringe-exp-j:${seed}:${index}`) - 0.5) * 8;
      const p = origin.clone()
        .addScaledVector(edgeAxes(edge).seaward, row.out)
        .addScaledVector(along, t + jitter);
      const w = 34 + unitFromKey(`fringe-exp-w:${seed}:${index}`) * 12;
      const d = 34 + unitFromKey(`fringe-exp-d:${seed}:${index}`) * 10;
      const storeys = 2 + Math.floor(unitFromKey(`fringe-exp-h:${seed}:${index}`) * 6);
      const sy = storeys * STOREY;
      const ground = heightWorld(p.x, p.z, { extent, roles, seed, river: [] });
      const alongM = alongOf(p.x, p.z, extent, edge);
      const sea = seawardOf(p.x, p.z, extent, edge);
      const hubL = alongLength(edge, extent);
      const inAirport = alongM < -hubL * 0.05 && alongM > -hubL * 0.45 && sea > 8 && sea < 110;
      const inStation = alongM > hubL * 0.06 && alongM < hubL * 0.46 && sea > 8 && sea < 55;
      if (inAirport || inStation) {
        index += 1;
        continue;
      }
      blocks.push({
        x: p.x,
        z: p.z,
        y: ground + sy * 0.5,
        sx: w,
        sy,
        sz: d,
        yaw: Math.atan2(edgeAxes(edge).seaward.x, edgeAxes(edge).seaward.z),
      });
      index += 1;
    }
  }
  return blocks.slice(0, 90);
}

/* ------------------------------------------------------------------ *
 * THE HINTERLAND — worked country on the crust, and the shroud that ends it.
 *
 * The owner's r0 plates show one flat, uniform, unfurnished green plane over
 * ~70% of frame. That is `world:edge-massing:crust` (a held file), whose land
 * colour spans only 1.55x in luminance from p05 to p95 across the whole ring,
 * and which carries no object of any kind outside the seven venue aprons. It
 * is Monopoly-Plus gate 5's stated failure — "an empty coloured plane
 * occupying more than ~25% of the frame" — before any other gate is scored.
 *
 * The reference stills never terminate a diorama with a ring of alpha. They
 * terminate it three ways at once: the world is furnished right up to its
 * edge, a built line reads as the last thing (balustrade, wall, hedge), and
 * haze takes whatever is behind it. So there is no transparent shroud sheet
 * here. Every object below is opaque. The "shroud" is a wooded brow: the land
 * rises to a treed ridge at r ~512 and falls away past it into the crust's own
 * sage haze, which reads as "the country goes on over there" rather than as a
 * mesh boundary.
 *
 * Gate 4 governs the join, so the overlay is built to converge on the crust
 * rather than meet it: its lift and its colour offset are BOTH multiplied by
 * the same mask, which falls to zero at the inner ring, at the outer rim and
 * across the waterline. Where the mask is zero the overlay is the crust, to
 * the metre and to the colour channel — there is no lip to feather because
 * there is no step. `polygonOffset` settles the coincident-depth case.
 * ------------------------------------------------------------------ */

/**
 * The hedge section, in ONE place. It is read by the planner (which writes it on
 * every hedge record), by the strip builder, by the contact ribbon that has to be
 * wider than it, and by the p15-terrain pin. Three of those four used to carry
 * their own literal.
 */
// W7-C: the scale law's hedge, 1.8 m wide and 2.2 m tall; no raised bar is wider.
const HEDGE_SECTION = Object.freeze({ width: TASTE_SCALE.hedge.width, height: TASTE_SCALE.hedge.height });

const HINTERLAND = Object.freeze({
  /** Metres outside the board square where the overlay starts to lift. */
  innerPad: 3.4,
  /** Overlay outer radius. Single-sourced with the crust — see `ring-metrics.js`. */
  outer: OVERLAY_OUTER,
  /**
   * Metres of inner / outer ramp over which the PLACEMENT mask opens and closes.
   *
   * 78 -> 40. The inner ramp is what decided how far out the worked country
   * started, and 78 m put the first hedge, fence and scatter roughly 25 m
   * outside the board square: boundaries need mask >= 0.20 (22 m at 78) and
   * scatter needs 0.30 (26 m). At the board-wide pose that is a 50-90 px band
   * of bare ground immediately outside the city, which is half of what BA2
   * fault 2 read as an exposed map plane — the other half being the un-drawn
   * hairline the draw mask now closes.
   *
   * At 40 the same thresholds land at 11 m and 13 m, so the country reaches the
   * kerb line `world:edge-massing:edge-kerb` stands on. The lift rides the same
   * ramp, but it is band-limited by `hinterlandCarryMaskAt` over ~3 pitches and
   * the pitch near the board is 6.5-7.4 m, so the extra grade is about 1 in 11
   * at its steepest. Measured after the change (`_probe-join.mjs`), the apron
   * join step is reported in the lane note rather than assumed here.
   */
  inRamp: 40,
  outRamp: 90,
  /** The terminating brow: a wooded ridge, not an alpha ring. */
  browR: 512,
  browH: 8.6,
  browWidth: 96,
  /** Rolling relief. Kept modest: the crust already carries a hinterland lift. */
  rollAmp: 3.1,
  fineAmp: 0.85,
  /**
   * Paddock lattice pitch and the low-frequency warp that stops it reading square.
   *
   * 74 -> 110 m, and the reason is a band limit rather than a taste in field
   * sizes. The tint blend ramps over `paddockBlend x overlayPitchAt(r)` metres on
   * each side of a cell edge, so a cell must be wide enough to hold two of those
   * ramps AND still keep a flat interior, or the two ramps meet and the field has
   * no body. At the rim the binding pitch is 20.4 m, so two 2.4-pitch ramps are
   * 98 m: a 74 m cell could not hold them and the blend was being clamped by its
   * own cap exactly where the sampling is coarsest. `paddockSubR` puts the small
   * fields back where they belong — near the board, where they resolve.
   */
  paddock: 110,
  paddockWarp: 46,
  /**
   * Half-size sub-fields inside this radius, for BOUNDARIES ONLY.
   *
   * The r7 near strip could not be furnished because it was essentially one
   * field: at 62 x 72 m it held no internal boundary for a hedge or a hedgeline
   * tree to stand on. Splitting a coarse cell into 2x2 gives that strip four
   * fields and three internal boundaries.
   *
   * The split is decided PER COARSE CELL, from that cell's own centre radius, and
   * never per sample point. That is what keeps it safe: the fine lattice exactly
   * subdivides the coarse one, so there are no slivers and no degenerate cells at
   * the transition, and the transition itself falls on coarse cell edges that
   * already carry a boundary rather than on an arc across open country. The tint
   * does NOT see the sub-lattice — a tint that changed size with radius would put
   * a colour step along that arc, which is the one thing this lane must not add.
   * A hedge dividing two paddocks of the same crop is ordinary country.
   */
  paddockSubR: 560,
  /**
   * Blend half-width of the paddock tint, in multiples of `overlayPitchAt(r)`.
   * 1.6 -> 2.4: at 1.6 the ramp was 1.6 vertices wide and the junction where it
   * meets the cell's flat interior was a curvature spike one vertex across, which
   * is a line. Measured on the built sheet, interior colour Laplacian p99 25.8 /
   * max 54.4 LSB at 1.6.
   */
  paddockBlend: 2.4,
  /** Waterness at which the overlay, and everything standing on it, stops. */
  waterCut: 0.24,
  waterFade: 0.20,
  /** Boundary sampling pitch. Also the hedge segment length. */
  boundaryStep: 8,
});

/**
 * ── T10: THE PADDOCK NEEDED VALUE STRUCTURE, NOT MORE PAINT ──
 *
 * Measured on `plates/r16/bd-transport-landmass.png` over the pixels the
 * hinterland overlay actually renders (mask built by diffing the graded plate
 * against a `hide=fringe:hinterland-fields` shot, 391,147 px): mean luma 108.4,
 * standard deviation 19.4. The board round read the same surface twice, on two
 * different plates, as "untextured Lambert fill on an empty olive plane" and as
 * a flat sheet — and both reads are about VARIANCE, not about hue.
 *
 * The five crop tones are already in the unique albedo and they are already
 * separated (T8 pinned their relative spread). What the ring has none of is
 * relief at the scale the plate resolves: at the graded poses the near ring is
 * about 5.8 px/m and the far ring about 3.7, so anything between 1 and 3 m has a
 * lit face and a shade face on screen and anything painted flat does not.
 *
 * So the structure added here is GEOMETRY that shares the ground's own paint —
 * crop rows, a crowned farm track, stock — rather than a second colour layer.
 * Sharing the albedo is the point: the T9 contact patch was an inverted shadow
 * precisely because it guessed at the colour of the ground it covered, and a
 * ridge that samples the same texel as the soil beside it cannot make that
 * mistake. What differs between a ridge and its own field is the NORMAL.
 */
const HINTERLAND_WORK = Object.freeze({
  /**
   * Crop rows are only drawn where the pitch resolves. At 1.55 m and 5.8 px/m a
   * cycle is 9 px; at the rim's 3.0 px/m it is 4.6 px, which is where a repeat
   * stops being texture and starts being moire under the plate's own filter.
   * 380 m is where `overlayPitchAt` crosses ~12 m and the ring's own sampling is
   * already coarser than the field this rides on.
   */
  cropOuterR: 560,
  /** Along-row station step. The ground is smooth at this scale; a 0.30 m ridge
   *  following it every 12 m has a worst mid-span error well under its height. */
  cropStep: 12,
  /** Pitch and ridge height per crop kind. 1 crop, 3 ploughed — two of five, so
   *  the quilt alternates rowed and unrowed fields rather than becoming corduroy
   *  everywhere. Both pitches sit inside the brief's 1-2 m band. */
  // T12: 3–4 m pitch so the stripe survives a 260–400 m plate as texture
  // (at ~4 px/m a 3.6 m cycle is 14 px). The 1.15–1.90 m T10 rows were
  // sub-pixel at the graded poses.
  cropPitch: [0, 3.6, 0, 3.2, 0, 3.8],
  cropRise: [0, 0.42, 0, 0.30, 0, 0.36],
  /** Stock: small mobs on pasture, rough grazing, and harvested stubble. */
  stockOuterR: 400,
  stockCap: 240,
  /** The terminating treeline. `HINTERLAND.browR` is the wooded ridge the height
   *  field already builds and nothing has ever stood on it. */
  rimWoodCap: 560,
  rimWoodSpread: 46,
});

/** Board-centre polar radius of the board square along `az`. */
function boardRadiusAt(az, extent) {
  return rayToSquare(az, extent.x * 0.5, extent.z * 0.5);
}

/** The overlay sheet's start radius along `az` (and the scatter's keep-clear at `pad` + 12): along the ray today; under LAND_EDGE the radius where the land edge is `pad` m out. */
function sheetR0(az, extent, pad = HINTERLAND.innerPad) {
  return LAND_EDGE.readers.sheet ? landStartRadius(az, extent, pad) : boardRadiusAt(az, extent) + pad;
}

/**
 * How much of the hinterland treatment applies at a point: 0 on the board, on
 * water and past the rim; 1 in the open country between. Lift, colour offset,
 * and every placement gate multiply by this single field, so they can never
 * disagree about where the treatment ends.
 */
/**
 * How clear of the landmark seats a point is. The crust dishes its own height
 * flat under every seat so the venues sit level; lifting ground back up there
 * would bury them. Derived from `crust.seats`, never from a copied radius.
 */
const LANDMARK_SEAT_IDS = new Set(
  Object.values(RING_LAYOUT).filter((v) => v && typeof v.id === 'string').map((v) => v.id),
);

function seatClearAt(x, z, crust) {
  const seats = crust?.seats;
  if (!seats) return 1;
  let m = 1;
  for (let i = 0; i < seats.length; i += 1) {
    const s = seats[i];
    // Only the seven LANDMARK seats. `crust.seats` also carries `inland-gate`,
    // `hills-gate` and two corner hubs — dishes in the crust where roads and
    // rail leave the board, carrying no geometry at all. Clearing those too
    // zeroed the mask across the whole west and hills ring: measured, the
    // treatment reached 17 of 1000 frame cells in the entertainment pose and 0
    // in the transport pose, which are two of the four frames it is judged on.
    // Their ids come from RING_LAYOUT rather than a copied list.
    if (!LANDMARK_SEAT_IDS.has(s.id)) continue;
    const d = Math.hypot(x - s.x, z - s.z);
    const r = s.radius ?? 60;
    // Tight. The live occupancy grid is the real keep-out — it is measured from
    // the venues that exist rather than from an authored radius — so this term
    // only has to reproduce the crust's own seat dish. At r*1.45+20 it was
    // clearing 133 m around Tullamarine and 124 m around the Grand Prix, which
    // between them emptied the entire visible ring in the transport and
    // entertainment poses: 4 and 21 dressing objects inside those frustums.
    m = Math.min(m, smoothstep(r * 0.85, r * 1.15 + 12, d));
    if (m <= 0) return 0;
  }
  return m;
}

function hinterlandMaskAt(x, z, extent, crust) {
  const cx = extent.x * 0.5;
  const cz = extent.z * 0.5;
  const dx = x - cx;
  const dz = z - cz;
  const r = Math.hypot(dx, dz);
  const r0 = sheetR0(Math.atan2(dx, dz), extent);
  if (r <= r0 || r >= HINTERLAND.outer) return 0;
  const inGate = smoothstep(r0, r0 + HINTERLAND.inRamp, r);
  const outGate = 1 - smoothstep(HINTERLAND.outer - HINTERLAND.outRamp, HINTERLAND.outer, r);
  const seat = seatClearAt(x, z, crust);
  if (seat <= 0) return 0;
  const w = waternessAt(x, z, extent, crust);
  const dry = 1 - smoothstep(HINTERLAND.waterCut, HINTERLAND.waterCut + HINTERLAND.waterFade, w);
  // The creek is the crust lane's water and its `creekFieldAt` is the ONE
  // definition of where it runs. Imported, never re-derived: two modules holding
  // private copies of one boundary is how the port and the ocean ended up 34.5 m
  // apart on where the waterline was. Zeroing the mask here does two things at
  // once — it keeps hedges, scrub and planting out of the wet thread, and it drops
  // this file's lift to zero over the channel so the crust's own carve survives
  // instead of being filled back in.
  const out = Math.max(-z, z - extent.z, -x, x - extent.x);
  // The spoil shoulder and stony toe around each landmark pad. `surroundHeightAt`
  // already ADDS the shoulder, so this is not a missing height term — it is a
  // placement gate. RE-MEASURED after the crust reshaped its seats (scree apron,
  // shadow trench, shoulder 0.85 -> 2.4 m): the band is now 12.5% of placeable
  // ground, median slope 0.329 m over an 8 m chord against 0.085 m elsewhere,
  // and walking out from each seat rim this gate blocks 100% of samples from
  // d -12 m to d +30 m — exactly the stretch carrying the 12.93 m worst case,
  // which independently reproduces the crust's own 12.079 m figure. What it lets
  // through peaks at 6.51 m. My earlier note that the effect was smaller than
  // advertised was true of the old gentle rim and is superseded.
  // Zeroing the mask here also stops this file's tint sitting on top of the
  // crust's new gravel toe, which is a colour that should read.
  const batter = seatBatterAt(x, z, crust?.seats);
  const offBatter = 1 - smoothstep(0.10, 0.34, Math.max(batter.shoulder, batter.toe));
  if (offBatter <= 0) return 0;
  const creek = creekFieldAt(x, z, extent, crust, crust?.seats, out, w);
  // Tight: at the first threshold one scrub clump survived at thread 0.070,
  // where the fade still left 87% of the mask. Placement wants a harder edge
  // than lift does, and the wider dry strip this leaves along the channel reads
  // as a riparian margin rather than as a gap.
  const banks = 1 - smoothstep(0.005, 0.09, creek.thread + creek.bar * 0.45);
  return inGate * outGate * dry * seat * banks * offBatter;
}

/**
 * Where the overlay SHEET is allowed to exist. Placement keeps the creek,
 * batter and seat gates (an object is in the channel or it is not). The
 * drawn sheet must not: skipping those quads left polygonal holes (T4 creek
 * lightning-bolt, T5 grey seat voids). Water still punches through so the
 * ocean stays the crust's; landmark dishes are drawn at `surroundHeightAt`
 * (the overlay owns the ring).
 *
 * ── T6B: PRESENCE, NOT A RAMP, AT THE TWO RIMS ──
 *
 * This function used to reuse `hinterlandMaskAt`'s inner and outer RAMPS. That
 * is a category error, and it was measured rather than argued
 * (`plates/T6B-wip/_probe-join.mjs`, calibrated null 357/359 coverage at
 * r0 + 60):
 *
 *   uncovered dry cells inside the crust's clip radius   594
 *   every one of them at r − boardR = 8.6 m, p05 = p95 = max
 *
 * i.e. one un-drawn ring roughly 2.6 m wide following the whole city edge,
 * starting exactly where the 8 m apron ribbon stops. The crust cannot fill it:
 * `EdgeMassingLayer` attaches the albedo with `clipR = OVERLAY_OUTER − 8`, so
 * every crust fragment inside r 616 is DISCARDED. Nothing was drawn there at
 * all — that hairline is BA2 fault 2's "razor island edge", and no colour or
 * kerb work on either side of it could have closed it.
 *
 * The mechanism was the quad test in `makeHinterlandFields`: a quad is dropped
 * when all four corners read ≤ 0.02, and `smoothstep(r0, r0 + 78, r)` is still
 * under 0.02 six metres out — which is the first radial step of the biased
 * walk. So the first quad ring of the sheet was skipped everywhere.
 *
 * Ramping presence was never needed anyway: where the CARRY mask is zero the
 * sheet's lift is zero, so it lies on the crust surface to the metre. Drawing
 * it there costs one quad ring and closes the hole. Water and the outer rim
 * keep their ramps — those are real handovers, to the ocean sheet and to the
 * crust past the clip radius.
 */
function hinterlandDrawMaskAt(x, z, extent, crust) {
  const cx = extent.x * 0.5;
  const cz = extent.z * 0.5;
  const dx = x - cx;
  const dz = z - cz;
  const r = Math.hypot(dx, dz);
  const r0 = sheetR0(Math.atan2(dx, dz), extent);
  if (r < r0 - 0.01 || r >= HINTERLAND.outer) return 0;
  const outGate = 1 - smoothstep(HINTERLAND.outer - HINTERLAND.outRamp, HINTERLAND.outer, r);
  const w = waternessAt(x, z, extent, crust);
  const dry = 1 - smoothstep(HINTERLAND.waterCut, HINTERLAND.waterCut + HINTERLAND.waterFade, w);
  // Presence at the inner rim: the sheet starts at r0, under the apron ribbon.
  // The outer rim keeps its ramp because the crust really does take over there
  // (its albedo clip is OVERLAY_OUTER − 8), and measured, that ramp drops no
  // quads at all before the last ring — at r 611 it still reads 0.044 against
  // the 0.02 floor. It is kept because it is the honest handover, not because
  // it is buying triangles.
  return outGate * dry;
}

// Two rings of four offsets, the outer rotated 45 degrees off the inner, for the
// carry filter below. Deliberately NOT axis-aligned as a set: a plus-shaped
// kernel on a square lattice imprints its own axes, which is the fault this
// filter exists to remove.
const CARRY_RING = Object.freeze([
  [1, 0], [0, 1], [-1, 0], [0, -1],
  [0.7071, 0.7071], [-0.7071, 0.7071], [-0.7071, -0.7071], [0.7071, -0.7071],
]);

/**
 * THE MASK AS THIS SHEET CAN CARRY IT — the fix for six rounds of lineaments.
 *
 * `hinterlandMaskAt` has three gates that were tuned as PLACEMENT gates, where a
 * hard edge is right (an object is either in the creek or it is not), and were
 * then left multiplying the DRAWN surface, where a hard edge is a line. Measured
 * (probe p7): the metric width each takes to go 1 -> 0, against a vertex pitch of
 * 7-20 m over this ring,
 *
 *     banks (creek)   p05 2.9   p50  6.9   p95 29.0 m
 *     offBatter       p05 3.1   p50  3.7   p95  5.2 m
 *     dry (waterline) p05 8.7   p50 10.7   p95 14.5 m
 *
 * All three are at or under ONE PITCH, so to this mesh they are steps. Of the 200
 * steepest one-metre steps in the lift, 119 sat in the creek gate's band, 60 in
 * the batter gate's and 21 at the waterline — NONE outside all three. The same
 * mask multiplies the tint, so each cliff is a colour step of up to ~30 LSB as
 * well as a height step reaching 13.2 m of second difference at the local pitch.
 * `r0` carries no lineaments because this overlay did not exist at r0.
 *
 * The filter is sized by `overlayPitchAt(r)`, never by metres of field, because
 * the pitch runs 6.5 m near the board to 20.4 m at the rim and a scalar is wrong
 * at one end whichever end it is right at.
 *
 * `m * a1 * a2` rather than an average alone: the average is non-zero OUTSIDE the
 * mask's own support and would put the overlay onto water, into the creek bed and
 * over a seat dish. Multiplying by the point value keeps the zero set bit-exact —
 * where the mask is zero the carried mask is zero — while stretching the approach
 * to it from under one pitch to about three.
 *
 * It lives HERE, in the shared analytic function, and not in the mesh builder,
 * because an earlier version of this round put it in the builder and the exported
 * `hinterlandGroundAt` then stood up to 9.33 m ABOVE the surface that was drawn
 * (median 0.53, p95 4.58) — the exact "describes a surface nobody sees" fault
 * this file exists to prevent, re-created in one edit. Measured, not reasoned:
 * the same probe now reads a median of 0.000 m.
 */
function hinterlandCarryMaskAt(x, z, extent, crust, r, base) {
  const s = base ?? ((px, pz) => hinterlandMaskAt(px, pz, extent, crust));
  const m = s(x, z);
  if (m <= 0) return 0;
  const p = overlayPitchAt(r);
  let a1 = 0;
  let a2 = 0;
  for (let k = 0; k < 4; k += 1) {
    const i = CARRY_RING[k];
    const o = CARRY_RING[k + 4];
    a1 += s(x + i[0] * p * 1.25, z + i[1] * p * 1.25);
    a2 += s(x + o[0] * p * 2.5, z + o[1] * p * 2.5);
  }
  return m * (a1 * 0.25) * (a2 * 0.25);
}

/**
 * taste W78 (ONE_GROUND, phase G1 of the hinterland plan): one height for the open ground. 1 makes the overlay's lift zero everywhere
 * (the ring brow of 8.6 m at r 512, the roll and swale, the fine term), so the crust's `surroundHeightBody` is the only height: the sheet
 * mesh `fringe:hinterland-fields` is a finer sampling of it, the shader's normal bake (`bakeRingHeight`, with `terraceFree`) reads the same field less the terrace treads, and
 * trees, props and placement, which call `hinterlandGroundAt`, reground on it. The masks, as they stand with the switch on: the placement
 * mask `hinterlandMaskAt` and the draw mask `hinterlandDrawMaskAt` are untouched and still gate placement and the sheet's draw; neither
 * is a height. The CARRY mask `hinterlandCarryMaskAt` (the band-limited copy of the placement mask) never gated placement: it feeds the
 * lift (here and in the sheet build, the `carry` array and the refined vertices) and `hinterlandColorAt`, which nothing calls. With the
 * switch on the lift returns 0 before it reads the mask, so the carry mask shapes nothing; the sheet build still computes it for every
 * vertex and drops it. The graded bank (`seatBankLiftLimitAt`) returns 0 for a lift of 0, so on this side it adds nothing (its rule
 * lives in the crust). 0 (the default) is today's lift, exactly. Browser: `?oneGround=1`; node: `DD_ONE_GROUND=1`.
 * Pinned by `mvp/tests/one-ground.test.mjs` (run with `DD_ONE_GROUND=1`; with it off the test shows today's lift is not zero).
 */
export { ONE_GROUND };

/** Metres this file adds on top of the crust. Zero wherever the mask is zero. */
function hinterlandLiftAt(x, z, extent, crust, seed, mask) {
  if (ONE_GROUND.on) return 0;
  const m = mask ?? hinterlandCarryMaskAt(
    x, z, extent, crust,
    Math.hypot(x - extent.x * 0.5, z - extent.z * 0.5),
  );
  if (m <= 0) return 0;
  const cx = extent.x * 0.5;
  const cz = extent.z * 0.5;
  const r = Math.hypot(x - cx, z - cz);
  // Relief octaves and the shared band limit. `OVERLAY_PITCH` in `ring-metrics.js`
  // is 10.6 m; the finest term below is 1/0.024, a 41.7 m wavelength, which is
  // 3.9x that pitch and so is carried rather than aliased. Nothing here needs to
  // import the constant — but do not take any octave below ~21 m (2x pitch), and
  // note that the real pitch is not uniform. Measured on the built overlay,
  // all 192 spokes x 46 steps:
  //   radial     ~ 4.2753 + 0.016365 * r   (least squares, rms 0.218 m, max 0.490)
  //   azimuthal  = 2*PI*r / 192            (exact)
  // Azimuthal overtakes radial at r = 270 m and is the binding limit from there
  // out, reaching 19.63 m at r 600 against the scalar's 10.6. Use
  // `overlayPitchAt(r)` in ring-metrics.js, not OVERLAY_PITCH, for any filtering
  // or authoring decision.
  const roll = valueNoise2(x * 0.0072, z * 0.0072, seed + 131);
  const swale = valueNoise2(x * 0.0135 + 3.1, z * 0.0135 + 7.9, seed + 29);
  // FIXED-SIZE AUDIT (standing check: nothing authored finer than the sheet that
  // carries it). Of everything this file authors as a SAMPLED FIELD:
  //   roll     lambda 138.9 m   vs 2x pitch 40.8 at the rim   3.4x margin   ok
  //   swale    lambda  74.1 m   vs 40.8                       1.8x          ok
  //   fine     lambda  41.7 m   vs 40.8                       1.02x         MARGINAL
  //   corduroy tied to pitch                                                ok
  //   tint blend band tied to pitch                                         ok
  //   paddock lattice 74 m -> 3.6 cells across at the rim   flagged for r6
  // `fine` was sitting on Nyquist at the rim, so it is lengthened only where it
  // has to be: identical to its old 41.7 m inside r ~430, stretching to ~61 m at
  // the rim. Instanced objects are not in this audit — they are geometry, not a
  // field the mesh samples, so screen size governs them, not the pitch.
  const fineLambda = Math.max(41.7, 3.0 * overlayPitchAt(Math.hypot(x - cx, z - cz)));
  const fine = valueNoise2(x / fineLambda + 1.7, z / fineLambda + 4.3, seed + 53);
  const brow = Math.exp(-((r - HINTERLAND.browR) ** 2) / (2 * HINTERLAND.browWidth ** 2));
  const relief = HINTERLAND.rollAmp * (roll * 0.78 + swale * 0.46)
    + HINTERLAND.fineAmp * fine
    + HINTERLAND.browH * brow * (0.55 + 0.45 * roll);
  return relief * m;
}

/**
 * The one grounding call for everything this file stands on the fringe ring.
 * Crust height plus this file's own lift — i.e. the surface that rasterises.
 */
export function hinterlandGroundAt(x, z, extent, crust, seed, mask, terraceFree = false) {
  // taste-r1 W14-C: `terraceFree` is for the normal bake only; every placement keeps the terrace.
  const base = surroundHeightSheetAt(x, z, extent, crust, terraceFree);
  // THE GRADED BANK, ON THIS SIDE OF THE SUM. Inside r 616 the crust's
  // fragments are discarded and THIS is what renders, so the crust's own
  // ceiling around a landmark pad is only half a ceiling — measured, the
  // overlay was putting 0.8 m back on top of the bank exactly where the Grand
  // Prix circuit meets the ring. `seatBankLiftLimitAt` returns the lift
  // untouched away from a pad and returns 0 for 0, which is what keeps the two
  // sheets bit-equal where this one lifts nothing.
  const lift = hinterlandLiftAt(x, z, extent, crust, seed, mask);
  return base + seatBankLiftLimitAt(lift, base, x, z, crust?.seats);
}

/**
 * A one-argument ground sampler bound to a plan: `sampler(x, z)` → metres.
 *
 * THIS IS THE SURFACE THAT RENDERS. `terrainHeightAt` / `heightWorld` are not,
 * and the difference has now cost four lanes a round each — floating ring trees
 * here at median 11.42 m, a blind float probe at Falls Creek, the hidden-mesh
 * finding at the crust, and an entertainment boulevard whose carriageway sat
 * 92.8% below ground at median −2.92 m with 121 of a claimed 15,164 road pixels
 * actually visible. Any venue sizing an apron, truncating a plate, or seating an
 * object on the fringe ring wants this, not that.
 *
 * It is the analytic surface — crust plus this file's relief — which is what is
 * available while venues mount, since the overlay mesh is not built until after
 * them. It tracks the rendered triangles to within ~0.2 m; this file's own
 * placements then re-ground on the built geometry for exactness.
 */
export function hinterlandGroundSampler(plan) {
  const extent = plan?.extent ?? { x: 272, z: 272 };
  const crust = plan?.crust ?? null;
  const seed = plan?.seed ?? 0;
  if (!crust) return (x, z) => heightWorld(x, z, plan);
  return (x, z) => hinterlandGroundAt(x, z, extent, crust, seed);
}

/**
 * W79 fix 5 (L2): move the Rod Laver rim collar's instances (hedge, fence posts and rails, tussocks, rocks) by the change in the ground at each one between two land-edge models: they were seated on
 * the ground the `before` model gave (the venue stands first); the knob-state ground, with the harvested lawn outlines, is `after`. The active model is `after` again on return.
 */
function reseatRimCollar(root, plan, before, after) {
  const ground = hinterlandGroundSampler(plan);
  const meshes = [];
  root.traverse((n) => { if (n.isInstancedMesh && /^fringe:melbourne-park-rim-(hedge|fence-posts|fence-rails|tussocks|rocks)$/.test(n.name)) meshes.push(n); });
  if (!meshes.length) return;
  root.updateMatrixWorld(true);
  const m = new THREE.Matrix4(); const p = new THREE.Vector3();
  const at = (n, i) => { n.getMatrixAt(i, m); return p.setFromMatrixPosition(m).applyMatrix4(n.matrixWorld); };
  setActiveLandEdge(before);
  const old = meshes.map((n) => { const a = new Float64Array(n.count); for (let i = 0; i < n.count; i += 1) { at(n, i); a[i] = ground(p.x, p.z); } return a; });
  setActiveLandEdge(after);
  meshes.forEach((n, k) => {
    for (let i = 0; i < n.count; i += 1) {
      at(n, i); const dy = ground(p.x, p.z) - old[k][i];
      if (dy === 0) continue;
      n.getMatrixAt(i, m); m.elements[13] += dy; n.setMatrixAt(i, m);
    }
    n.instanceMatrix.needsUpdate = true;
  });
}

/** Warped square lattice → the paddock a point falls in. Seeded, no randomness. */
function paddockAt(x, z, seed) {
  const S = HINTERLAND.paddock;
  const A = HINTERLAND.paddockWarp;
  const wx = x + (valueNoise2(x * 0.0041, z * 0.0041, seed + 71) - 0.5) * A;
  const wz = z + (valueNoise2(x * 0.0041 + 5.3, z * 0.0041 + 2.7, seed + 71) - 0.5) * A;
  const ux = wx / S;
  const uz = wz / S;
  const ix = Math.floor(ux);
  const iz = Math.floor(uz);
  return { ix, iz, fx: ux - ix, fz: uz - iz };
}

/**
 * The SUB-field a point falls in — boundaries only, never the tint.
 *
 * A coarse cell splits into 2x2 when its own centre sits inside `paddockSubR`,
 * jittered per cell so the transition is a ragged line of field edges rather
 * than a circle. Deciding per cell rather than per point is the whole safety
 * argument: the fine lattice is an exact subdivision of the coarse one, so no
 * cell is ever degenerate and no sliver is ever produced, and the level change
 * lands on coarse edges that already carry a hedge.
 *
 * Ids are the coarse id doubled plus the child offset, so a sub-field's id can
 * never collide with a neighbouring coarse field's.
 */
function paddockSubAt(x, z, seed, extent) {
  const c = paddockAt(x, z, seed);
  const S = HINTERLAND.paddock;
  const rc = Math.hypot((c.ix + 0.5) * S - extent.x * 0.5, (c.iz + 0.5) * S - extent.z * 0.5);
  if (rc >= HINTERLAND.paddockSubR * (0.84 + 0.34 * idxUnit(23, c.ix, c.iz, seed))) {
    return { ix: c.ix * 2, iz: c.iz * 2, size: S, coarse: c };
  }
  return {
    ix: c.ix * 2 + (c.fx < 0.5 ? 0 : 1),
    iz: c.iz * 2 + (c.fz < 0.5 ? 0 : 1),
    size: S * 0.5,
    coarse: c,
  };
}

/** 0 pasture · 1 crop · 2 stubble · 3 ploughed · 4 rough grazing · 5 dry gold. */
function paddockKind(ix, iz, seed) {
  return Math.min(5, Math.floor(idxUnit(20, ix, iz, seed) * 6));
}

/**
 * The crop tone at a world point, or −1 within `insetM` metres of a lattice
 * edge. Exported for the tone instrument only: a per-tone luma census that
 * derives its own lattice is a private copy of the painter's, and this file has
 * paid for private copies twice. Nothing in the render path calls it.
 */
export function paddockKindAt(x, z, seed, extent, insetM = 0) {
  const cell = paddockAt(x, z, seed);
  if (insetM > 0) {
    const f = insetM / HINTERLAND.paddock;
    if (Math.min(cell.fx, 1 - cell.fx) < f || Math.min(cell.fz, 1 - cell.fz) < f) return -1;
  }
  if (extent) {
    const r = Math.hypot(x - extent.x * 0.5, z - extent.z * 0.5);
    if (!Number.isFinite(r)) return -1;
  }
  return paddockKind(cell.ix, cell.iz, seed);
}

// Per-kind offsets against the crust's own colour. Deliberately small: the point
// is to break one flat green into legible fields, not to paint a different world
// on top of a held file. Measured effect is reported in the lane note.
// HELD at the values the r7 plate was shot with. Raising these would buy back the
// lost chroma, and I measured that it works — but the paddock tint is still a
// LIVE SUSPECT for the lineaments, and changing a suspect between captures makes
// the next plate un-diagnostic. Material depth is bought below instead, from a
// continuous within-field term that has no cell boundary and therefore cannot
// draw a line whatever the answer turns out to be.
const PADDOCK_H = [0.005, -0.017, -0.038, -0.060, 0.017, 0.028];
const PADDOCK_S = [0.04, 0.08, -0.09, -0.14, -0.04, 0.10];
const PADDOCK_L = [0.016, 0.045, 0.072, -0.042, -0.021, 0.055];
/**
 * Painted paddock albedos — five crop/pasture tones.
 *
 * ── T6B: THE PALETTE IS THE TONE CONTROL, NOT `landGain` ──
 *
 * T4 recorded that cutting `landGain` 0.78 -> 0.64 moved plate luma about 1 %,
 * and T5's further cut to 0.58 moved the board-wide ring/city-blocks ratio only
 * 1.088 -> 1.033 against a 0.85-0.95 target. Fitted across those two shots the
 * plate responds as luma ∝ albedo^0.50, so a flat gain cut large enough to
 * reach the band would take the ring to a near-neutral dark — which is the
 * "wet asphalt" regression the T6 brief calls out by name.
 *
 * A palette change does the same work without that cost, because it can drop
 * the MEAN while raising the SPREAD and holding chroma. Measured on the baked
 * texture (`_probe-tones.mjs`), old set: per-kind means 27.4 / 37.2 / 36.1 /
 * 17.9 / 22.9 LSB before the 0.18 crust-base mix — a 2.08x spread on a 0.192
 * mean. New set: a 2.75x spread on a 0.141 mean.
 *
 *   0 pasture        cool grazed green, the common tone
 *   1 crop           standing crop — the first warm break
 *   2 stubble        cured stubble — the bright end, warm
 *   3 ploughed       red-brown worked soil — the dark end
 *   4 rough grazing  cool olive, the second common tone
 *
 * The two warm breaks are what keep a darker ring reading as country: chroma
 * is the whole difference between a dark green paddock and a wet road.
 *
 * ── T8: THE SAME QUILT, IN THE SPACE IT IS ACTUALLY READ IN ──
 *
 * Every number above is a byte statistic on `bakeRingAlbedo`'s texture, and
 * that texture declares `SRGBColorSpace` while the bake wrote linear values
 * straight into it (see `albedoByte` in `edge-massing.js`). So the "0.141 mean"
 * these tones were tuned to reached the shader as linear **0.017** — a wet
 * road is exactly what it rendered as, and no rebalance inside the byte domain
 * could have found that.
 *
 * With the encode corrected these values mean what they say: linear
 * reflectances, in the same family as `EDGE_SEAM.cover*`. The quilt is the
 * same quilt — five tones, two warm breaks, the tan stubble at the bright end,
 * the ploughed red-brown at the dark end — lifted to MP-Plus country level and
 * with more chroma in the greens, so a paddock reads as a paddock beside a lit
 * city block rather than as its shadow. Relative per-kind luma spread (the
 * statistic `p15-terrain` gates, and the one that survives tone mapping) goes
 * 0.79 -> 0.89 of the mean; the ABSOLUTE level goes up by 1.35x.
 */
/**
 * ── TASTE R1: THE FIVE CROP TONES ARE NOW THREE GROUND TOKENS ──
 *
 * The bible (section 2) bans the mustard stubble, the blood-red plough and the
 * V < 22 pasture this table used to carry. Every kind below is a mix of the three
 * ground tokens (`grass.lush`, `grass.dry`, `soil`), so a paddock can only be a
 * shade of one of them. The table is linear reflectance, scaled by
 * `PADDOCK_RING_K` so the bake keeps the luma the crust beyond the overlay was
 * tuned against; the overlay itself paints from the same tokens in the shader
 * (`attachWorkedPaddock`, scaled by `PADDOCK_GAIN`).
 */
const PADDOCK_GAIN = 0.20;
/** The warm key and the sky fill push the lit pixel yellow of the token; this pulls it back. */
const PADDOCK_TINT = [0.92, 1.0, 1.08];
const PADDOCK_RING_K = 1.0;
const PADDOCK_RGB = (() => {
  const lush = tokenLinear(TASTE.ground.grassLush);
  const dry = tokenLinear(TASTE.ground.grassDry);
  const soil = tokenLinear(TASTE.ground.soil);
  const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const mulc = (a, s) => a.map((v) => v * s);
  return [
    lush,
    mulc(mixc(lush, dry, 0.5), 1.05),
    dry,
    soil,
    mulc(lush, 0.75),
    mulc(dry, 0.92),
  ].map((c) => c.map((v) => v * PADDOCK_RING_K));
})();

function paddockTint(ix, iz, seed, out) {
  const kind = paddockKind(ix, iz, seed);
  const j = idxUnit(21, ix, iz, seed);
  out[0] = PADDOCK_H[kind] + (j - 0.5) * 0.010;
  out[1] = PADDOCK_S[kind] + (j - 0.5) * 0.030;
  out[2] = PADDOCK_L[kind] + (j - 0.5) * 0.028;
  out[3] = kind;
  out[4] = j;
  return out;
}

const _t00 = [0, 0, 0, 0, 0];
const _t10 = [0, 0, 0, 0, 0];
const _t01 = [0, 0, 0, 0, 0];
const _t11 = [0, 0, 0, 0, 0];

/**
 * THE LINEAMENTS.
 *
 * Seven straight dark lines stood in every plate from r1 to r5 at azimuths
 * 76.7-105.8 deg, stable to a few degrees, and five rounds could not name the
 * term that drew them. This one did it, and the mechanism is here:
 *
 * `paddockAt` uses `floor()`, so the tint was a STEP FUNCTION at every cell
 * boundary. Enumerated over the ring: 360 boundary runs, 88 of them in the
 * reported azimuth band with a lightness step above 0.055, and a maximum
 * possible step of 0.142 — larger than the whole crust's land luminance spread.
 * Their azimuths come out at exactly 90.0 deg where the warp is locally flat and
 * spread to 79.7-99.8 deg where it bends, which is the reported band; their run
 * lengths are 66-78 m against the 74 m lattice.
 *
 * The other candidates are cleared by construction rather than by argument:
 * the three `valueNoise2` relief octaves are smoothstep-interpolated, so they
 * are C1 and cannot produce a step; the ploughing corduroy is per-paddock with a
 * uniformly distributed direction, so it cannot cluster seven lines around 90.
 *
 * The fix is to make the tint CONTINUOUS: bilinear blend between the four
 * neighbouring cells over a band scaled to the local sampling pitch, so the
 * field pattern survives but the discontinuity does not. A field boundary should
 * read because a hedge stands on it, not because the ground has a cliff in its
 * colour.
 */
function hinterlandColorAt(x, z, extent, crust, seed, mask, target) {
  const col = target ?? new THREE.Color();
  col.copy(surroundColorAt(x, z, extent, crust));
  const r = Math.hypot(x - extent.x * 0.5, z - extent.z * 0.5);
  // The CARRIED mask, not the placement mask — see `hinterlandCarryMaskAt`.
  // Height and colour must ride the same field or the two disagree about where
  // the treatment fades, which is a lip in one of them.
  const m = mask ?? hinterlandCarryMaskAt(x, z, extent, crust, r);
  if (m <= 0.02) return col;
  const cell = paddockAt(x, z, seed);
  const { ix, iz } = cell;
  // Blend band, in cell fractions, never below `paddockBlend` x the local
  // sampling pitch: a transition narrower than the mesh can carry is a step
  // again by the time it is sampled. Capped so a field keeps a flat interior to
  // read as one, and so the neighbour identity can never flip at a non-zero
  // weight, which is a hard step in a different costume.
  const e = Math.min(0.44, Math.max(0.10,
    (HINTERLAND.paddockBlend * overlayPitchAt(r)) / HINTERLAND.paddock));
  // The blend is centred on the cell EDGE, not the cell centre. Centring it on
  // the centre leaves full neighbour weight at the boundary and the identity of
  // that neighbour flips as the boundary is crossed — which is a hard step
  // again, measured at 0.135 across one 2 m sample. At the edge both sides see
  // the same pair at 0.5/0.5, so the field is continuous across it.
  const ax = 0.5 * (1 - smoothstep(0, e, Math.min(cell.fx, 1 - cell.fx)));
  const az = 0.5 * (1 - smoothstep(0, e, Math.min(cell.fz, 1 - cell.fz)));
  const jx = cell.fx < 0.5 ? ix - 1 : ix + 1;
  const jz = cell.fz < 0.5 ? iz - 1 : iz + 1;
  paddockTint(ix, iz, seed, _t00);
  paddockTint(jx, iz, seed, _t10);
  paddockTint(ix, jz, seed, _t01);
  paddockTint(jx, jz, seed, _t11);
  const w00 = (1 - ax) * (1 - az);
  const w10 = ax * (1 - az);
  const w01 = (1 - ax) * az;
  const w11 = ax * az;
  const dH = _t00[0] * w00 + _t10[0] * w10 + _t01[0] * w01 + _t11[0] * w11;
  const dS = _t00[1] * w00 + _t10[1] * w10 + _t01[1] * w01 + _t11[1] * w11;
  const dL = _t00[2] * w00 + _t10[2] * w10 + _t01[2] * w01 + _t11[2] * w11;
  // Within-field variation: continuous, seeded, wavelengths 96 m and 58 m — both
  // well above 2x the binding pitch, so they are carried everywhere and, having
  // no cell boundary anywhere in them, they cannot produce a straight locus.
  // This is where material depth comes from now: open-country L sd had fallen
  // 14.75 -> 11.51 and saturation 60.4 -> 52.7 across two rounds of softening.
  const vA = valueNoise2(x / 96, z / 96, seed + 211) - 0.5;
  const vB = valueNoise2(x / 58 + 3.9, z / 58 + 1.4, seed + 223) - 0.5;
  const depth = vA * 0.72 + vB * 0.28;
  col.offsetHSL(
    (dH + depth * 0.014) * m,
    (dS + depth * 0.085) * m,
    (dL + depth * 0.055) * m,
  );
  // ── THE PLOUGHING CORDUROY IS GONE, AND IT IS THE ONE TERM HERE THAT DREW
  //    STRAIGHT PARALLEL EVENLY-SPACED LINES BY DESIGN. ──
  //
  // It was a directional sinusoid at 3.2 x `overlayPitchAt(r)`. That is above
  // Nyquist, which is why it survived the fixed-size audit — and 3.2 samples per
  // cycle is still only just above it: the second difference a piecewise-linear
  // reconstruction leaves on a sine sampled at 3.2 per cycle is 2|cos(2pi/3.2)-1|
  // = 2.77x its amplitude, so a 0.019 L wave arrived at the mesh as roughly
  // 14-25 LSB of curvature standing on straight loci one field wide.
  //
  // Two things it could never be talked out of. Its wavelength is tied to the
  // pitch, so the 3.2 ratio is the same at every radius — there is no distance at
  // which it resolves. And its direction is one uniform draw per field, so a
  // single ploughed paddock produces five to seven PARALLEL EVENLY-SPACED lines
  // all at one bearing. The r7 critic's own words for the falls-foliage plate
  // were "five to six parallel, evenly-spaced dark scratch-lines ... the only
  // feature on an otherwise bare olive plane". A previous round cleared this term
  // by arguing it "cannot cluster seven lines at 90 degrees"; that argument was
  // about the DISTRIBUTION of field directions and missed that ONE field in the
  // right direction supplies a whole cluster on its own.
  //
  // At 7-20 m sampling this ring cannot draw ploughing, the same way it cannot
  // draw a 4 m farm track — a fact this file already accepted once and then
  // reintroduced under another name. Cropland texture is bought below from the
  // continuous within-field octaves instead, which have no straight locus at all.
  return col;
}

/**
 * INTERLOCKED FIELD EDGES.
 *
 * The painted lattice is a warped SQUARE grid, so every tone change sits on a
 * straight 110 m run. With the T6B palette the largest neighbour step is
 * ploughed (luma 0.074) against stubble (0.203) — 2.7x — and at the Apostles
 * pose (9.5 px/m) a 6.5 m ramp across that step is 60 px of straight edge with
 * nothing standing on it. That is the shape BA2 fault 6 reports as a "razor
 * forest-to-paddock polygon boundary", and it is the same defect the crust's
 * own colour path fixed for its cover boundaries with `interlock`.
 *
 * Two changes, both cheap because the fields are already sampled: the ramp is
 * widened to 14 m so it crosses more than one sheet cell everywhere inside
 * r 380, and the ramp's own position is pushed around by a 24 m field so the
 * edge breaks into fingers and outlying patches instead of running straight.
 * A real field boundary is a hedge line with ragged crop either side of it.
 */
function paddockRgbAt(x, z, seed, target) {
  const cell = paddockAt(x, z, seed);
  const { ix, iz } = cell;
  const S = HINTERLAND.paddock;
  // T12: 8 m ramp, not 14 m. The 14 m blend ate the 40–120 m field interiors
  // at plate scale, so the quilt read as one khaki. Interiors stay flat; the
  // hedge on the boundary is what reads as the edge.
  const e = Math.min(0.16, Math.max(0.03, 8 / S));
  const finger = (valueNoise2(x / 24 + 8.1, z / 24 + 2.6, seed + 307) - 0.5) * e * 0.85;
  const ax = 0.5 * (1 - smoothstep(0, e, Math.min(cell.fx, 1 - cell.fx) + finger));
  const az = 0.5 * (1 - smoothstep(0, e, Math.min(cell.fz, 1 - cell.fz) + finger));
  const jx = cell.fx < 0.5 ? ix - 1 : ix + 1;
  const jz = cell.fz < 0.5 ? iz - 1 : iz + 1;
  const k00 = paddockKind(ix, iz, seed);
  const k10 = paddockKind(jx, iz, seed);
  const k01 = paddockKind(ix, jz, seed);
  const k11 = paddockKind(jx, jz, seed);
  const w00 = (1 - ax) * (1 - az);
  const w10 = ax * (1 - az);
  const w01 = (1 - ax) * az;
  const w11 = ax * az;
  const a = PADDOCK_RGB[k00];
  const b = PADDOCK_RGB[k10];
  const c = PADDOCK_RGB[k01];
  const d = PADDOCK_RGB[k11];
  const out = target ?? [0, 0, 0];
  out[0] = a[0] * w00 + b[0] * w10 + c[0] * w01 + d[0] * w11;
  out[1] = a[1] * w00 + b[1] * w10 + c[1] * w01 + d[1] * w11;
  out[2] = a[2] * w00 + b[2] * w10 + c[2] * w01 + d[2] * w11;
  const vA = valueNoise2(x / 96, z / 96, seed + 211) - 0.5;
  const vB = valueNoise2(x / 58 + 3.9, z / 58 + 1.4, seed + 223) - 0.5;
  /**
   * ── T10B: ONE 110 M FIELD FILLED 91.6% OF THE TRANSPORT MASK ──
   *
   * Widening the five field colours therefore moved the mean and almost none of
   * the spread: the probe came back 117.67 / 11.26 (mean / sd) against 107.35 /
   * 19.54 before it.  The visible field needs value WITHIN its boundary.  These
   * are the same continuous, seeded 96 m / 58 m worked bouts this painter already
   * carried, promoted from an additive 0.02–0.04 tint into a bounded exposure.
   * It cannot make a lattice edge because neither source has one.
   *
   * The plate response is measured log-domain, so the balance is in stops.  A
   * first fit suggested a -2-stop trim.  Two normalized live plates then measured
   * 114.61 / 35.90 at -2 and 111.89 / 33.99 at -2.55 (mean / sd).  Their actual
   * response solves to -3.25.  The final live probe reads 108.84 / 31.58 against
   * T9's 108.42 / 18.90: mean +0.40%, spread 1.671x.  Exposure is bounded before
   * the 0.24 ring gain.  The original five crop hues stay untouched and 5% of
   * the live crust still carries geology through them.
   */
  const depth = vA * 0.72 + vB * 0.28;
  // T12: the T10 −3.25-stop crush put 79% of shroud texels on one floor, so
  // the five crop hues never reached the plate. A mild within-field exposure
  // keeps the quilt's identity and still supplies the worked-bout variance.
  const value = Math.max(0.62, Math.min(1.70, 2 ** (depth * 1.85)));
  out[0] *= value;
  out[1] *= value;
  out[2] *= value;
  // Crop stripes at 3–4 m: a sixth readable tone (lit furrow vs shade furrow)
  // that survives as texture at the graded poses. Direction is per coarse cell
  // so a hedge still separates two differently-oriented sets.
  // Every paddock carries a 3.4–4.2 m stripe so the quilt reads at plate
  // scale even when the T11 midground crop sits inside a single 110 m field.
  const pitch = (HINTERLAND_WORK.cropPitch[k00] || 0) > 0
    ? HINTERLAND_WORK.cropPitch[k00]
    : 3.8 + idxUnit(26, ix, iz, seed) * 0.4;
  {
    const ang = idxUnit(24, ix, iz, seed) * Math.PI;
    const along = x * Math.sin(ang) + z * Math.cos(ang);
    const phase = ((along / pitch) % 1 + 1) % 1;
    // taste-r1 W14-C: a soft 10% swell. The hard 0.58 / 1.32 stripe showed through at the
    // r 560 to 616 hand-off as a contour map.
    const stripe = 1 + 0.10 * Math.sin(2 * Math.PI * phase);
    out[0] *= stripe;
    out[1] *= stripe;
    out[2] *= stripe * 0.97;
  }
  return out;
}

const _paddockRgb = [0, 0, 0];
function modulateRingPaddock(x, z, rgb, seed) {
  paddockRgbAt(x, z, seed, _paddockRgb);
  rgb[0] = rgb[0] * 0.05 + _paddockRgb[0] * 0.95;
  rgb[1] = rgb[1] * 0.05 + _paddockRgb[1] * 0.95;
  rgb[2] = rgb[2] * 0.05 + _paddockRgb[2] * 0.95;
}

function finishRingPaddock(x, z, rgb, seed) {
  /**
   * T11: field-scale harvest bouts. The T10 exposure intentionally clamps its
   * deep tail; in the shroud field that left 79% of texels on the same floor,
   * so adding another term inside that clamp could not move a pixel. Apply the
   * field texture after the analytic/crust mix instead. At 13 m and 18 m it
   * survives a 300 m plate, remains much broader than the 1-2 m row relief, and
   * two C1 noise fields make patches rather than straight ploughing corduroy.
   */
  const a = valueNoise2(x / 18 + 2.3, z / 18 + 8.6, seed + 359) - 0.5;
  const b = valueNoise2(x / 13 + 7.1, z / 13 + 4.2, seed + 367) - 0.5;
  const worked = a * 0.58 + b * 0.42;
  const cell = paddockAt(x, z, seed);
  const kind = paddockKind(cell.ix, cell.iz, seed);
  const stops = [3.2, 7.5, 9.0, 8.0, 4.0, 6.4][kind];
  const balance = [-0.05, 0.06, 0.117, 0.08, -0.02, 0.04][kind];
  const factor = Math.max(0.22, Math.min(2.30, 2 ** (worked * stops - balance)));
  rgb[0] *= factor;
  rgb[1] *= factor;
  rgb[2] *= factor;
}

/** Worked albedo on the drawn sheet, after the venue-bank colour bake. The
 * 1.4 m baked texels cannot carry a 0.6 m hedge shadow or clean crop edges.
 * Evaluate these texture marks per fragment in metres; derivatives antialias
 * their edges without changing the camera, lighting or terrain silhouette.
 */
// Integer arithmetic hash: identical in JS and highp GLSL (all intermediates
// below 2^24). The seed sites, palette and dressing share this coordinate field.
function workedHash(x, z, seed) {
  const h = ((x * 127 + z * 311 + (seed % 997) * 17) % 997 + 997) % 997;
  return ((h * h * 13) % 997) / 997;
}
function workedSite(ix, iz, seed) {
  return [(ix + 0.18 + workedHash(ix, iz, seed) * 0.64) * 72,
    (iz + 0.18 + workedHash(ix + 37, iz - 19, seed) * 0.64) * 72];
}
// Two seeded octaves, 40/20 m wavelengths and 3 m total amplitude.
// Sequential shears have an exact inverse, so planting and fragment ownership agree.
function workedEdgeNoise(t, seed) {
  return 2 * Math.sin(t * Math.PI / 20 + seed % 997)
    + Math.sin(t * Math.PI / 10 + (seed % 997) * 1.7 + 2.3);
}
function workedWarp(x, z, seed) {
  const a = x + 9 * Math.sin(z / 115 + seed % 997);
  const b = z + 11 * Math.sin(x / 137 - seed % 997);
  let u = 0.9323273456 * a - 0.3616154320 * b;
  let v = 0.3616154320 * a + 0.9323273456 * b;
  u += workedEdgeNoise(v, seed);
  v += workedEdgeNoise(u, seed + 31);
  return [u, v];
}
function workedUnwarp(x, z, seed) {
  z -= workedEdgeNoise(x, seed + 31);
  x -= workedEdgeNoise(z, seed);
  [x, z] = [0.9323273456 * x + 0.3616154320 * z, -0.3616154320 * x + 0.9323273456 * z];
  let wx = x, wz = z;
  for (let i = 0; i < 7; i += 1) {
    wx = x - 9 * Math.sin(wz / 115 + seed % 997);
    wz = z - 11 * Math.sin(wx / 137 - seed % 997);
  }
  return [wx, wz];
}
export function workedParcelAt(x, z, seed = 0) {
  const p = workedWarp(x, z, seed);
  const ix = Math.floor(p[0] / 72), iz = Math.floor(p[1] / 72);
  let first = Infinity, second = Infinity, winner, runner;
  for (let a = -1; a <= 1; a += 1) for (let b = -1; b <= 1; b += 1) {
    const site = workedSite(ix + a, iz + b, seed);
    const d = (site[0] - p[0]) ** 2 + (site[1] - p[1]) ** 2;
    const item = { ix: ix + a, iz: iz + b, site };
    if (d < first) { second = first; runner = winner; first = d; winner = item; }
    else if (d < second) { second = d; runner = item; }
  }
  return { ...winner, neighbour: runner.site, arable: workedHash(winner.ix + 83, winner.iz + 127, seed) >= 0.5, tone: workedHash(winner.ix + 71, winner.iz + 43, seed),
    boundary: (second - first) / (2 * Math.hypot(winner.site[0] - runner.site[0], winner.site[1] - runner.site[1])) };
}

export function workedBoundaryStyle(x, z, seed = 0) {
  const field = workedParcelAt(x, z, seed), p = workedWarp(x, z, seed);
  const dx = field.neighbour[0] - field.site[0], dz = field.neighbour[1] - field.site[1];
  const norm = Math.hypot(dx, dz);
  const along = ((p[0] - (field.site[0] + field.neighbour[0]) / 2) * -dz
    + (p[1] - (field.site[1] + field.neighbour[1]) / 2) * dx) / norm;
  const gateDistance = Math.abs(((along + 19) % 38 + 38) % 38 - 19);
  return { width: 0.6 + 1.6 * (0.5 + 0.5 * Math.sin(x / 6 + Math.sin(z / 9) * 2)),
    gap: gateDistance < 2.85 };
}

// Clip Voronoi polygons in warped metres, then invert the contour and two-octave warp.
// These actual curved edges also feed the existing hedge/fence/canopy builders.
export function workedParcelBoundaries(extent, seed = 0) {
  const out = [], R = HINTERLAND.outer - 26, step = 4;
  const cx = extent.x / 2, cz = extent.z / 2;
  let edgeId = 0;
  const centre = workedWarp(cx, cz, seed);
  for (let ix = Math.floor((centre[0] - R) / 72) - 1; ix <= Math.ceil((centre[0] + R) / 72) + 1; ix += 1) {
    for (let iz = Math.floor((centre[1] - R) / 72) - 1; iz <= Math.ceil((centre[1] + R) / 72) + 1; iz += 1) {
      const site = workedSite(ix, iz, seed);
      let poly = [[-160, -160], [160, -160], [160, 160], [-160, 160]].map(([x, z]) => [x + site[0], z + site[1]]);
      const neighbours = [];
      for (let a = -2; a <= 2; a += 1) for (let b = -2; b <= 2; b += 1) {
        if (!a && !b) continue;
        const other = workedSite(ix + a, iz + b, seed);
        const nx = other[0] - site[0], nz = other[1] - site[1];
        const c = (other[0] ** 2 + other[1] ** 2 - site[0] ** 2 - site[1] ** 2) / 2;
        neighbours.push({ ix: ix + a, iz: iz + b, nx, nz, c });
        const clipped = [];
        for (let k = 0; k < poly.length; k += 1) {
          const p = poly[k], q = poly[(k + 1) % poly.length];
          const dp = p[0] * nx + p[1] * nz - c, dq = q[0] * nx + q[1] * nz - c;
          if (dp <= 0) clipped.push(p);
          if ((dp <= 0) !== (dq <= 0)) {
            const t = dp / (dp - dq);
            clipped.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
          }
        }
        poly = clipped;
      }
      for (let k = 0; k < poly.length; k += 1) {
        const p = poly[k], q = poly[(k + 1) % poly.length];
        const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
        const other = neighbours.reduce((a, b) => Math.abs(mx * a.nx + mz * a.nz - a.c) / Math.hypot(a.nx, a.nz)
          < Math.abs(mx * b.nx + mz * b.nz - b.c) / Math.hypot(b.nx, b.nz) ? a : b);
        if (other.ix < ix || (other.ix === ix && other.iz < iz)) continue;
        edgeId += 1;
        const run = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / step));
        for (let n = 0; n < run; n += 1) {
          const point = (t) => workedUnwarp(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, seed);
          const a = point(n / run), b = point((n + 1) / run);
          const [x, z] = point((n + 0.5) / run);
          if (Math.hypot(x - cx, z - cz) > R) continue;
          out.push({ x, z, ...workedBoundaryStyle(x, z, seed), yaw: Math.atan2(b[0] - a[0], b[1] - a[1]),
            len: Math.hypot(b[0] - a[0], b[1] - a[1]), gx: edgeId, gz: n, dir: 0,
            run, runPos: n, start: a, end: b,
            kind: Math.floor(workedHash(ix + 71, iz + 43, seed) * 6),
            // W25 (PARCEL_FENCES): the two parcels either side, so the ground shader can find the same edge. Absent with the switch at 0.
            ...(PARCEL_FENCES.on ? { cell: [ix, iz], other: [other.ix, other.iz] } : {}) });
        }
      }
    }
  }
  return out;
}

/**
 * taste-r1 (W22-B): PARCEL_FURROWS gives each worked parcel an edge and a surface. `on` is the switch (0 restores today's parcels,
 * exactly; `?parcelFurrows=1` turns it on in a capture). The 36 m blend between parcels is replaced by a line (`edgeM` of
 * softness) with a headland strip `headlandM` wide inside it; ploughed and drilled parcels carry furrow lines at `pitchM`
 * (0.8 to 1.6 m, along the parcel's own direction) that fade to a grain between `fadeM` metres of view distance and by pixel
 * footprint, and a tone that steps strip to strip (`stripM` wide). Furrow tops are the lighter value; the mean does not drop.
 */
export const PARCEL_FURROWS = {
  // taste-r1 (W22 review): on by default (the parcels read as fields with edges, where they were soft washes); `?parcelFurrows=0` restores the washes.
  on: (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('parcelFurrows') === '0') ? 0 : 1,
  /** Capture aid only: `?parcelFurrows=2` treats every parcel as ploughed. */
  force: (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('parcelFurrows') === '2') ? 1 : 0,
  pitchM: [0.8, 1.6], stripM: 11, headlandM: 4.0, edgeM: 1.6, amp: 0.22, stripAmp: 0.13, fadeM: [90, 250],
};

/**
 * taste-r1 (W25): PARCEL_FENCES gives the worked parcel edges that carry no hedge, wall or windbreak something built: panels of
 * post-and-wire fence (weathered grey posts 1.2 m, a gate gap on long runs) along the edge, and under them, in the ground
 * shader, a stock track 1.5 to 2.5 m wide (paler and rougher than the paddock, torn at both edges, wider at a gate). 0 restores
 * wave twenty-four exactly (no fence mesh, no strip, no extra boundary fields). Browser: `?parcelFences=0`; node: `DD_PARCEL_FENCES=0`.
 */
export const PARCEL_FENCES = {
  on: (typeof process !== 'undefined' && process?.env?.DD_PARCEL_FENCES !== undefined)
    ? (Number(process.env.DD_PARCEL_FENCES) > 0 ? 1 : 0)
    : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('parcelFences') === '0') ? 0 : 1),
  panelM: 8, maskMin: 0.55, maxTriangles: 60000, trayClearM: 26, minSamples: 2, gateRun: 6, stripShare: 0.5,
};

/**
 * taste-r1 (W26): FENCE_CARRY makes the parcel fences hold at distance. (a) Post and wire take the weathered grey-brown tokens
 * (TASTE.built.fenceTimber, fenceWire), baked into the panel's vertex colours so they stand 8 to 12 L* under the lit paddock where
 * W25's pale greys stood level with it. (b) Beside the worn stock strip, on both sides of each fenced edge, the ground shader paints
 * a rank-grass strip (0.8 to 1.4 m wide, darker and slightly greener, torn along its length, broken at gates), whose contrast rises
 * with camera distance between `riseM` metres, so the line of uncut grass carries the boundary when the wire is under a pixel; the
 * worn strip's pale lift eases off over the same range so the two do not cancel. It is never narrower than `minPx` pixels.
 * 0 restores wave twenty-five exactly (the '#a29f94' material over grey vertex colours, no rank strip, the same shader text, the
 * same program key). Browser: `?fenceCarry=0`; node: `DD_FENCE_CARRY=0`. `?parcelFences=0` still restores wave twenty-four.
 */
export const FENCE_CARRY = {
  on: PARCEL_FENCES.on && ((typeof process !== 'undefined' && process?.env?.DD_FENCE_CARRY !== undefined)
    ? (Number(process.env.DD_FENCE_CARRY) > 0 ? 1 : 0)
    : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('fenceCarry') === '0') ? 0 : 1)),
  rankM: [0.8, 1.4], riseM: [150, 400], minPx: 1.6, maxM: 3.2,
  /** Rank-grass darkening of the albedo (sqrt-linear space factor per channel) at the near and far end of the rise. */
  nearTint: [0.90, 0.95, 0.88], farTint: [0.52, 0.66, 0.46],
  /** Share of the worn strip's pale lift that remains at the far end of the rise. */
  wornFar: 0.0,
};

/**
 * taste-r1 (W27): FENCE_EDGES. At stations 17 and 18 the paddock boundaries are all there in the ground paint but hold no fence: the
 * hinterland mask is 0 on every one of them (the landmark seat dishes and spoil shoulders of Tullamarine and the Grand Prix, the sea at
 * 18), so `hinterlandBoundaries` dropped the samples before the planner saw them. With the switch on, those samples ride along as
 * `fenceRest` and the planner fences them like any free edge (the keep-outs still apply: venue pads, tracks, water, boxes within 3 m),
 * and the track keep-out narrows from 6.5 m to `trackM` (a farm fences along its lane, not 6 m off it); two fences of different edges that run within `doubleM` of one another over their middle 60% are drawn once (the later one is
 * dropped). It also scales the post and wire tokens by `timberGain` so the timber stands 8 to 12 L* under the sunlit paddock. 0 restores wave twenty-six exactly (the same 339 panels at the same places, the tokens at full albedo). Browser: `?fenceEdges=0`; node: `DD_FENCE_EDGES=0`.
 */
export const FENCE_EDGES = {
  on: PARCEL_FENCES.on && ((typeof process !== 'undefined' && process?.env?.DD_FENCE_EDGES !== undefined)
    ? (Number(process.env.DD_FENCE_EDGES) > 0 ? 1 : 0)
    : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('fenceEdges') === '0') ? 0 : 1)),
  doubleM: 2, trackM: 3.5,
  /** Albedo scale on the post and wire tokens. The paddock shader paints its tokens at PADDOCK_GAIN 0.20 and they light to L* ~61 in the sun; the
   * fence is a white standard material over vertex colours, and the raw timber token (L* 58) lit to L* 63 on a sunlit post face, level with
   * the paddock and pale. Measured at the 18 close view, post L* 63.0 at gain 1, 29.7 at 0.20 (Y near linear); 0.60 stands about 10 L* under. */
  timberGain: 0.60,
  /** Per-channel share on the post token on top of `timberGain`. A grey-brown albedo under the sky's fill lights to lilac on a post's side faces, so
   * the post is pulled toward a yellower, more saturated brown; the wire keeps the plain gain. */
  postTint: [1.0, 0.80, 0.52],
};

/**
 * Drops each panel that runs within `FENCE_EDGES.doubleM` of one already kept on another edge (`gx`), or of a fence run in `others`
 * ({ x, z, yaw, len }, yaw from +Z), comparing the middle 60% of each at four points; panels of one edge never conflict with each other.
 * Order is the list's order, so the first edge keeps its line. Returns { kept, dropped }.
 */
export function dropDoubleFences(panels, others = []) {
  const T = [0.2, 0.4, 0.6, 0.8], lim = FENCE_EDGES.doubleM * FENCE_EDGES.doubleM;
  const pts = [], cell = 8, grid = new Map();
  const put = (gx, x, z) => {
    const k = `${Math.floor(x / cell)}:${Math.floor(z / cell)}`, e = { gx, x, z };
    pts.push(e); const l = grid.get(k); if (l) l.push(e); else grid.set(k, [e]);
  };
  for (const o of others) for (const t of T) put(null, o.x + Math.sin(o.yaw) * o.len * (t - 0.5), o.z + Math.cos(o.yaw) * o.len * (t - 0.5));
  const near = (gx, x, z) => {
    const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
    for (let i = -1; i <= 1; i += 1) for (let j = -1; j <= 1; j += 1) {
      for (const e of grid.get(`${ci + i}:${cj + j}`) ?? []) if (e.gx !== gx && (e.x - x) ** 2 + (e.z - z) ** 2 < lim) return true;
    }
    return false;
  };
  const kept = [], dropped = [];
  for (const p of panels) {
    const mine = T.map((t) => [p.a[0] + (p.b[0] - p.a[0]) * t, p.a[1] + (p.b[1] - p.a[1]) * t]);
    if (mine.some(([x, z]) => near(p.gx, x, z))) { dropped.push(p); continue; }
    kept.push(p);
    for (const [x, z] of mine) put(p.gx, x, z);
  }
  return { kept, dropped };
}

/**
 * taste W28 (fences): FENCE_HEDGED. (1) A hedged paddock edge carries no fence in W27: the planner treats a hedge as "carried". With the switch
 * on, each run of hedged boundary samples also gets a post-and-wire line `offM` metres off the hedge foot (the hedge axis offset by half its
 * section plus `offM`), on one side per edge (the parity of the edge id), planned by the same panel planner, left open wherever the hedge
 * is (the gateways carry the post-and-rail run, not a hedge) and kept out of every place the other panels are kept out of, checked at nine
 * points along each panel; the new panels fill what remains of `maxTriangles`, nearest the board first. (2) The post and the rank-grass strip
 * carry the line at station 18's distance (see `timberGain`, `postTint`, `rank`). (3) Panels that lie within `nearM` of a post-and-rail run or a
 * wall are dropped (seven on seed 0). 0 restores W27 exactly: the same 434 panels, the same tones, the same shader text. Browser:
 * `?fenceHedged=0`; node: `DD_FENCE_HEDGED=0`.
 */
export const FENCE_HEDGED = {
  on: PARCEL_FENCES.on && FENCE_EDGES.on && ((typeof process !== 'undefined' && process?.env?.DD_FENCE_HEDGED !== undefined)
    ? (Number(process.env.DD_FENCE_HEDGED) > 0 ? 1 : 0)
    : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('fenceHedged') === '0') ? 0 : 1)),
  offM: 1.2, nearM: 2,
  timberGain: FENCE_EDGES.timberGain, postTint: FENCE_EDGES.postTint,
  /** An edge with this many planned panels carries the ground strip (worn track and rank grass) though rails already stand on the rest of it. */
  flagPanels: 4,
  /** The rank-grass strip at distance: it deepens between `riseM` metres (W26: 150 to 400, which at station 18's 230 m is a quarter of the way),
   * to `farTint`, and `fill` is the share of the way it closes on the worn centre line (a single band, not two stripes round a pale track). */
  riseM: [90, 240], farTint: [0.78, 0.85, 0.76], fill: 0.3,
  /** W28 (fences-fix): at distance the strip is at most `widthM` wide in all (worn centre and rank grass each side), its edges are soft and torn, and
   * it fades to nothing over `endM` metres at each end of an edge (the Voronoi vertex) and each side of a gate gap. An edge with fewer than
   * `minPanels` panels in the final list carries no strip. */
  widthM: 3.0, endM: 8, minPanels: 3,
};

/**
 * taste W29 (fences-tidy): FENCE_TIDY. Three faults of wave twenty-eight's fences. (1) Where two flagged paddock edges meet at a corner the ground strip
 * (worn centre and rank grass) faded to nothing over `FENCE_HEDGED.endM` on each edge and left a bare neck of about 16 m: an end whose Voronoi vertex is
 * shared with another flagged edge of either parcel now does not fade, and the strip turns the corner (the ends that meet no flagged edge, and the
 * gate gaps, fade as before). (2) At station 19 a few hedge-side lines read as a faint second line beside the hedge: OPEN (turning each element off, the posts and the wire leave no mark at 480 m and the ground strip leaves about 1,000 pixels; no fix is made).
 * (3) Panels with a point (the two ends and the 1/4, 1/2 and 3/4 points) where venue ground weighs
 * `venueMax` or more (`venueGroundWeight`, the precinct's maintained ground, which no pasture fence belongs on) are dropped, from the post-and-rail
 * planner's panels and from the hedge-side line, before the cap. 0 restores wave twenty-eight exactly (745 panels, 55,130 triangles). Browser:
 * `?fenceTidy=0`; node: `DD_FENCE_TIDY=0`. `?fenceHedged=0` still restores wave twenty-seven (the switch is off with it).
 */
export const FENCE_TIDY = {
  on: PARCEL_FENCES.on && FENCE_HEDGED.on && ((typeof process !== 'undefined' && process?.env?.DD_FENCE_TIDY !== undefined)
    ? (Number(process.env.DD_FENCE_TIDY) > 0 ? 1 : 0)
    : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('fenceTidy') === '0') ? 0 : 1)),
  venueMax: 0.05,
};

/**
 * Copies of the boundary samples `isHedged` picks, with `start`, `end`, `x` and `z` moved `offM` metres to one side of the line (`sideOf(sample)`
 * is +1 or -1; the normal at a shared vertex is the mean of the two samples' normals, so a chain does not kink), marked `rest` and `hedged`.
 */
export function offsetHedgedFields(fields, isHedged, offM, sideOf) {
  const byEdge = new Map(), out = [];
  for (const b of fields) if (isHedged(b)) { const l = byEdge.get(b.gx); if (l) l.push(b); else byEdge.set(b.gx, [b]); }
  const mix = (u, v) => { const x = u[0] + v[0], z = u[1] + v[1], l = Math.hypot(x, z); return l < 0.5 ? u : [x / l, z / l]; };
  for (const list of byEdge.values()) {
    list.sort((a, b) => a.gz - b.gz);
    const nrm = list.map((b) => {
      const dx = b.end[0] - b.start[0], dz = b.end[1] - b.start[1], l = Math.hypot(dx, dz) || 1, s = sideOf(b);
      return [s * dz / l, -s * dx / l];
    });
    list.forEach((b, k) => {
      const prev = list[k - 1]?.gz === b.gz - 1 ? nrm[k - 1] : null, next = list[k + 1]?.gz === b.gz + 1 ? nrm[k + 1] : null;
      const n0 = prev ? mix(prev, nrm[k]) : nrm[k], n1 = next ? mix(nrm[k], next) : nrm[k];
      const start = [b.start[0] + n0[0] * offM, b.start[1] + n0[1] * offM], end = [b.end[0] + n1[0] * offM, b.end[1] + n1[1] * offM];
      out.push({ ...b, start, end, x: (start[0] + end[0]) / 2, z: (start[1] + end[1]) / 2, rest: true, hedged: true });
    });
  }
  return out;
}

/** Shortest distance between the segments pq and rs (all [x, z]). */
export function segmentGap(p, q, r, s) {
  const d1x = q[0] - p[0], d1z = q[1] - p[1], d2x = s[0] - r[0], d2z = s[1] - r[1], wx = r[0] - p[0], wz = r[1] - p[1];
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) > 1e-9) {
    const t = (wx * d2z - wz * d2x) / den, u = (wx * d1z - wz * d1x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  const pd = (a, b, c) => {
    const dx = c[0] - b[0], dz = c[1] - b[1], t = Math.max(0, Math.min(1, ((a[0] - b[0]) * dx + (a[1] - b[1]) * dz) / Math.max(dx * dx + dz * dz, 1e-9)));
    return Math.hypot(a[0] - b[0] - t * dx, a[1] - b[1] - t * dz);
  };
  return Math.min(pd(p, r, s), pd(q, r, s), pd(r, p, q), pd(s, p, q));
}

/**
 * Drops each panel (a, b) whose line lies within `nearM` of a run in `others` ({ x, z, yaw, len }, yaw from +Z, drawn as the segment through
 * its centre). Returns { kept, dropped }.
 */
export function dropNearRuns(panels, others, nearM) {
  const segs = others.map((o) => {
    const hx = Math.sin(o.yaw) * o.len / 2, hz = Math.cos(o.yaw) * o.len / 2;
    return [[o.x - hx, o.z - hz], [o.x + hx, o.z + hz]];
  });
  const kept = [], dropped = [];
  for (const p of panels) (segs.some((sg) => segmentGap(p.a, p.b, sg[0], sg[1]) < nearM) ? dropped : kept).push(p);
  return { kept, dropped };
}

/**
 * Panels for the boundary samples nothing stands on. `fields` are the 4 m boundary samples (workedParcelBoundaries, mask added),
 * `carried(sample, prev, next)` is true where a hedge, wall, windbreak or fence already stands, `blocked(x, z)` where a fence
 * must not (venue pad, track, road, rail corridor, creek, water, tray band). A chain of two or more free samples becomes
 * round(length / 8) panels, each scaled along its length to fit; a panel centred on a gate sample of a run of six or more is
 * left out. Also returns the edges (parcel pair) that are mostly fenced, which the ground shader draws the track under.
 */
export function planParcelFences(fields, { carried, blocked }) {
  const edges = new Map();
  for (const b of fields) {
    const list = edges.get(b.gx);
    if (list) list.push(b); else edges.set(b.gx, [b]);
  }
  const panels = [], flagged = [];
  let freeSamples = 0, gateGaps = 0;
  for (const list of edges.values()) {
    list.sort((a, b) => a.gz - b.gz);
    const fenceable = list.filter((b) => b.rest || b.mask >= PARCEL_FENCES.maskMin).length;
    let fenced = 0, edgePanels = 0;
    const free = list.map((b, k) => (b.rest || b.mask >= PARCEL_FENCES.maskMin)
      && !carried(b, list[k - 1]?.gz === b.gz - 1 ? list[k - 1] : null, list[k + 1]?.gz === b.gz + 1 ? list[k + 1] : null)
      && !blocked(b.x, b.z) && !blocked(b.start[0], b.start[1]) && !blocked(b.end[0], b.end[1]));
    let i = 0;
    while (i < list.length) {
      if (!free[i]) { i += 1; continue; }
      let j = i;
      while (j + 1 < list.length && free[j + 1] && list[j + 1].gz === list[j].gz + 1) j += 1;
      const n = j - i + 1;
      if (n >= PARCEL_FENCES.minSamples) {
        freeSamples += n;
        const pts = [list[i].start], cum = [0];
        for (let k = i; k <= j; k += 1) {
          const e = list[k].end, q = pts[pts.length - 1];
          pts.push(e); cum.push(cum[cum.length - 1] + Math.hypot(e[0] - q[0], e[1] - q[1]));
        }
        const total = cum[cum.length - 1];
        const at = (sd) => {
          let k = 1;
          while (k < cum.length - 1 && cum[k] < sd) k += 1;
          const t = cum[k] > cum[k - 1] ? (sd - cum[k - 1]) / (cum[k] - cum[k - 1]) : 0;
          return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t, k - 1];
        };
        const count = Math.max(1, Math.round(total / PARCEL_FENCES.panelM)), pl = total / count;
        for (let pn = 0; pn < count; pn += 1) {
          const a = at(pn * pl), b = at((pn + 1) * pl), mid = at((pn + 0.5) * pl);
          const s = list[i + mid[2]];
          // a gate every 38 m is a gate in every panel; one gate in three is left open
          if (s.gap && (s.run ?? 1) >= PARCEL_FENCES.gateRun && s.runPos > 0 && s.runPos < s.run - 1 && (s.gx * 31 + (s.gz >> 3)) % 3 === 0) { gateGaps += 1; continue; }
          const dx = b[0] - a[0], dz = b[1] - a[1], chord = Math.hypot(dx, dz);
          if (chord < 1) continue;
          panels.push({ x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, a, b, yaw: Math.atan2(dx, dz), len: chord, gx: s.gx });
          fenced += pl / 4;
          edgePanels += 1;
        }
      }
      i = j + 1;
    }
    if (fenceable && (fenced >= fenceable * PARCEL_FENCES.stripShare || (FENCE_HEDGED.on && edgePanels >= FENCE_HEDGED.flagPanels)) && list[0].cell) {
      const [ca, cb] = list[0].cell, [oa, ob] = list[0].other, da = oa - ca, db = ob - cb;
      if ((da === 1 && db >= -1 && db <= 1) || (da === 0 && db === 1)) flagged.push({ cell: [ca, cb], off: [da, db], gx: list[0].gx, fenceable, fenced });
    }
  }
  return { panels, flagged, freeSamples, gateGaps };
}

/** The parcel-edge flag texture for the ground shader: `flagged` is planParcelFences' list, null gives the empty 1 x 1 texture. Returns [texture, origin x, origin z, size]. */
function parcelFenceTexture(flagged) {
  if (!flagged?.length) {
    const t = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
    t.needsUpdate = true;
    return t;
  }
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const f of flagged) { x0 = Math.min(x0, f.cell[0]); x1 = Math.max(x1, f.cell[0]); z0 = Math.min(z0, f.cell[1]); z1 = Math.max(z1, f.cell[1]); }
  const size = Math.max(x1 - x0, z1 - z0) + 1, data = new Uint8Array(size * size * 4);
  for (const f of flagged) {
    const ch = f.off[0] === 1 ? f.off[1] + 1 : 3; // (1,-1) r, (1,0) g, (1,1) b, (0,1) a
    data[((f.cell[1] - z0) * size + (f.cell[0] - x0)) * 4 + ch] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
  t.userData = { origin: [x0, z0, size] };
  t.needsUpdate = true;
  return t;
}

export function attachWorkedPaddock(material, seed, extent) {
  const gsOn = GROUND_SURFACE.on > 0; // taste W78 (GROUND_SURFACE, ground-surface.js): the one-surface statement replaces the tone blend, the value octaves, the straw drift and the flank shade
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.userData.workedPaddock = { fieldMetres: 72, cropPitch: [1.5, 2.5], minFieldLuma: 70, shadowMetres: 0.6, seed, mix: { value: 1 },
    dam: { value: new THREE.Vector3(0, 0, 0) }, insetBands: 0,
    edgeOctaves: [40, 20], rowLumaPeakToPeak: 2, arableFraction: 0.5,
    // W25 (PARCEL_FENCES): which parcel edges carry a fence. One RGBA texel per parcel (r: edge to the parcel at +1,-1; g: +1,0; b: +1,+1; a: 0,+1).
    ...(PARCEL_FENCES.on ? { fence: { tex: { value: parcelFenceTexture(null) }, org: { value: new THREE.Vector3(0, 0, 0) } } } : {}) };
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    if (PARCEL_FENCES.on) {
      shader.uniforms.uPfFenceTex = material.userData.workedPaddock.fence.tex;
      shader.uniforms.uPfFenceOrg = material.userData.workedPaddock.fence.org;
    }
    shader.uniforms.uWorkedSeed = { value: seed % 997 };
    const gsHasHeight = gsOn && !!shader.uniforms.uRingHeight?.value;
    if (gsOn) shader.uniforms.uGsForm = { value: gsHasHeight ? surfaceFormTexture(shader.uniforms.uRingHeight.value) : material.userData.workedPaddock.fence?.tex?.value ?? parcelFenceTexture(null) };
    shader.uniforms.uWorkedMix = material.userData.workedPaddock.mix;
    shader.uniforms.uWorkedDam = material.userData.workedPaddock.dam;
    shader.uniforms.uWorkedCentre = { value: new THREE.Vector2(extent.x * 0.5, extent.z * 0.5) };
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      `#include <common>
${gsOn ? groundSurfaceCommonGlsl() : ''}uniform float uWorkedSeed;
uniform float uWorkedMix;
uniform vec2 uWorkedCentre;
uniform vec3 uWorkedDam;
${PARCEL_FENCES.on ? `uniform sampler2D uPfFenceTex;
uniform vec3 uPfFenceOrg;
${FENCE_TIDY.on ? `// W29 (fences-tidy): 1 where the edge between parcels ia and ib (any order) carries the strip.
float pfEdgeFlag(vec2 ia, vec2 ib) {
  if (ib.x < ia.x || (ib.x == ia.x && ib.y < ia.y)) { vec2 t = ia; ia = ib; ib = t; }
  vec2 off = ib - ia, cl = ia - uPfFenceOrg.xy;
  if (off.x > 1.5 || abs(off.y) > 1.5 || cl.x < 0.0 || cl.y < 0.0 || cl.x >= uPfFenceOrg.z || cl.y >= uPfFenceOrg.z) return 0.0;
  vec4 tx = texelFetch(uPfFenceTex, ivec2(cl), 0);
  return off.x > 0.5 ? (off.y < -0.5 ? tx.r : (off.y > 0.5 ? tx.b : tx.g)) : (off.y > 0.5 ? tx.a : 0.0);
}
` : ''}` : ''}float workedHash(vec2 p) {
  float h = mod(dot(p, vec2(127.0, 311.0)) + uWorkedSeed * 17.0, 997.0);
  return mod(h * h * 13.0, 997.0) / 997.0;
}
vec2 workedSite(vec2 id) {
  return (id + 0.18 + vec2(workedHash(id), workedHash(id + vec2(37.0, -19.0))) * 0.64) * 72.0;
}
float workedEdgeNoise(float t, float seed) {
  seed = mod(seed, 997.0);
  return 2.0 * sin(t * 0.1570796327 + seed)
    + sin(t * 0.3141592654 + seed * 1.7 + 2.3);
}
vec2 workedCountry(vec2 p) {
  vec2 q = p + vec2(9.0 * sin(p.y / 115.0 + uWorkedSeed),
    11.0 * sin(p.x / 137.0 - uWorkedSeed));
  q = mat2(0.9323273456, 0.3616154320, -0.3616154320, 0.9323273456) * q;
  q.x += workedEdgeNoise(q.y, uWorkedSeed);
  q.y += workedEdgeNoise(q.x, uWorkedSeed + 31.0);
  return q;
}
float workedPath(vec2 p, vec2 start, vec2 end) {
  vec2 d = end - start;
  float t = clamp(dot(p - start, d) / max(dot(d, d), 0.001), 0.0, 1.0);
  vec2 bend = vec2(-d.y, d.x) / max(length(d), 0.001)
    * sin(t * 3.14159265) * sin(t * 6.2831853 + uWorkedSeed) * 1.5;
  float distanceToPath = length(p - mix(start, end, t) - bend);
  return (1.0 - smoothstep(0.25, 0.85 + fwidth(distanceToPath), distanceToPath))
    * smoothstep(0.0, 0.15, t);
}
float workedGrain(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec4 h = fract(sin(vec4(dot(cell, vec2(127.1, 311.7)),
    dot(cell + vec2(1.0, 0.0), vec2(127.1, 311.7)),
    dot(cell + vec2(0.0, 1.0), vec2(127.1, 311.7)),
    dot(cell + vec2(1.0), vec2(127.1, 311.7))) + uWorkedSeed) * 43758.5453);
  return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
}
// TASTE R1: the paddock palette is the three ground tokens, in linear light.
const vec3 PD_LUSH = ${glslVec3(tokenLinear(TASTE.ground.grassLush).map((v, i) => v * PADDOCK_GAIN * PADDOCK_TINT[i]))};
const vec3 PD_DRY = ${glslVec3(tokenLinear(TASTE.ground.grassDry).map((v, i) => v * PADDOCK_GAIN * PADDOCK_TINT[i]))};
const vec3 PD_SOIL = ${glslVec3(tokenLinear(TASTE.ground.soil).map((v, i) => v * PADDOCK_GAIN * PADDOCK_TINT[i]))};
// The parcel's tone, with the game's surveyed-farm override (farm.js feeds uFarmFields).
float parcelTone(vec2 id) {
  float t = workedHash(id + vec2(71.0, 43.0));
  for (int f = 0; f < 2; f++) if (uFarmFields[f].w > 0.5 && distance(id, uFarmFields[f].xy) < 0.1) t = uFarmFields[f].z;
  return t;
}
// A parcel's flat colour, as sqrt(linear albedo). Pasture 78%, plough 7%, dry 15%.
vec3 parcelReflectance(vec2 id) {
  float tone = parcelTone(id);
  vec3 lin;
  if (tone < 0.778) {
    float pt = workedHash(id + vec2(149.0, 67.0));
    if (pt < 0.25) lin = PD_LUSH;
    else if (pt < 0.50) lin = PD_LUSH * 0.88;
    else if (pt < 0.75) lin = mix(PD_LUSH, PD_DRY, 0.35);
    else lin = mix(PD_LUSH, PD_DRY, 0.15) * 1.06;
  } else if (tone < 0.850) {
    lin = PD_SOIL * mix(0.92, 1.05, (tone - 0.778) / 0.072);
  } else {
    lin = mix(PD_DRY * 0.94, PD_DRY * 1.04, (tone - 0.850) / 0.150);
  }
  vec3 r = sqrt(lin);
  // Phase 3 of a surveyed farm: the stubble is worked in, a shade darker.
  for (int f = 0; f < 2; f++) if (uFarmFields[f].w > 3.5 && distance(id, uFarmFields[f].xy) < 0.1) r *= 0.84;
  return r;
}${gsOn ? `
// taste W79 (GROUND_SURFACE, G2b): the parcel's grain channel (dry, meadow, earth) from its token, for the detail pass in place of the colour's green over red.
vec3 parcelChannel(vec2 id) { return parcelChannelOf(parcelTone(id), workedHash(id + vec2(149.0, 67.0))); }` : ''}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
#include <color_fragment>
{
  vec2 country = workedCountry(vRingWorld.xz);
  vec2 cell = floor(country / 72.0), fieldId = cell;
  vec2 nearest = vec2(0.0), runner = vec2(0.0);
  float d1 = 1e10, d2 = 1e10;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
    vec2 id = cell + vec2(float(i), float(j));
    vec2 site = workedSite(id);
    float d = dot(country - site, country - site);
    if (d < d1) { d2 = d1; runner = nearest; d1 = d; nearest = site; fieldId = id; }
    else if (d < d2) { d2 = d; runner = site; }
  }
  float boundary = (d2 - d1) / max(2.0 * length(runner - nearest), 0.001);
  float tone = workedHash(fieldId + vec2(71.0, 43.0));
  // TASTE R1, boundary law (bible section 8): paddock edges blend over 20 m, with
  // the edge pushed about by 3-octave noise at 6 m feature size, so no patch has a
  // hard outline. The three nearest parcel sites are measured from a noise-warped
  // position and weighted by how much farther each is than the nearest; the
  // weights are continuous in sorted distance, so the identity of the nearest
  // site can change anywhere without a step. The painted hedge line below still
  // follows the unwarped boundary, where the planted hedges and fences stand.
${gsOn ? `  vec3 reflectance = mix(parcelReflectance(fieldId), parcelReflectance(floor(runner / 72.0)), 0.5 * (1.0 - smoothstep(0.0, ${groundSurfaceBandHalfM().toFixed(3)}, boundary)));
  vec3 pfBlend = reflectance;
  gsChannel = mix(mix(parcelChannel(fieldId), parcelChannel(floor(runner / 72.0)), 0.5 * (1.0 - smoothstep(0.0, ${groundSurfaceBandHalfM().toFixed(3)}, boundary))), GS_MEAN_CH, smoothstep(${GS.far.fadeFrom.toFixed(1)}, ${GS.far.fadeTo.toFixed(1)}, length(vRingWorld.xz - uWorkedCentre)));` : `  vec2 cb = country
    + (vec2(workedGrain(country / 6.0 + 3.1), workedGrain(country / 6.0 + 9.7)) - 0.5) * 7.0
    + (vec2(workedGrain(country / 13.0 + 1.3), workedGrain(country / 13.0 + 5.9)) - 0.5) * 6.0
    + (vec2(workedGrain(country / 2.7 + 7.3), workedGrain(country / 2.7 + 2.1)) - 0.5) * 1.8;
  vec2 bid0 = fieldId, bid1 = fieldId, bid2 = fieldId;
  float bd0 = 1e5, bd1 = 1e5, bd2 = 1e5;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
    vec2 id = cell + vec2(float(i), float(j));
    float bd = distance(cb, workedSite(id));
    if (bd < bd0) { bd2 = bd1; bid2 = bid1; bd1 = bd0; bid1 = bid0; bd0 = bd; bid0 = id; }
    else if (bd < bd1) { bd2 = bd1; bid2 = bid1; bd1 = bd; bid1 = id; }
    else if (bd < bd2) { bd2 = bd; bid2 = id; }
  }
  // taste-r1 W14-C: 36 m (was 22 m) so no paddock reads as a patch with an outline.
  float bw1 = pow(clamp(1.0 - (bd1 - bd0) / 36.0, 0.0, 1.0), 2.0);
  float bw2 = pow(clamp(1.0 - (bd2 - bd0) / 36.0, 0.0, 1.0), 2.0);
  vec3 reflectance = (parcelReflectance(bid0) + parcelReflectance(bid1) * bw1
    + parcelReflectance(bid2) * bw2) / (1.0 + bw1 + bw2);
  vec3 pfBlend = reflectance;`}
  float angle = workedHash(fieldId + vec2(19.0, 53.0)) * 6.2831853;
  float furrow = dot(country, vec2(cos(angle), sin(angle))) / (1.5 + tone);
  float aa = max(fwidth(furrow), 0.001);
  float stripe = sin(furrow * 6.2831853) * (1.0 - smoothstep(0.12, 0.45, aa));
  float arable = step(0.5, workedHash(fieldId + vec2(83.0, 127.0)));
${gsOn ? `  // taste W78 (GROUND_SURFACE, ground-surface.js): value inside a paddock is keyed on form, not on free noise.
${groundSurfaceFormGlsl({ hasHeight: gsHasHeight })}${groundSurfaceApplyGlsl()}  reflectance += vec3(arable * stripe * (1.0 / 255.0));` : `  // Value structure inside a paddock (bible section 1: no surface over 2 m is one
  // value): three octaves at 31, 9 and 3.2 m, as a multiplier, plus a straw drift
  // in broad blotches. All continuous, none tied to a lattice.
  float gA = workedGrain(country / 31.0 + 4.7), gB = workedGrain(country / 9.0 + 12.3);
  float gC = workedGrain(country / 3.2 + 21.9), gS = workedGrain(country / 47.0 + 17.0);
  // W6-A: in rain the key is 55% and the cloud mottle flattens the far slopes (rain-gate crops read SD
  // 2.1-3.3 against a floor of 3), so the 9 m and 3.2 m octaves take more depth while uDDCloud.x is 1
  // (1 in rain, 0 in clear sky, where the slopes already read SD 7.9-27 and are left alone).
  float ddRainOct = clamp(uDDCloud.x, 0.0, 1.0);
  reflectance *= 1.0 + (gA - 0.5) * 0.30 + (gB - 0.5) * 0.16 * (1.0 + 0.9 * ddRainOct)
    + (gC - 0.5) * 0.07 * (1.0 + 1.4 * ddRainOct);
  reflectance = mix(reflectance, reflectance * vec3(1.10, 1.03, 0.82), smoothstep(0.58, 0.84, gS) * 0.55);
  float grazing = 0.0;
  float drift = clamp(dot(country - nearest, vec2(cos(angle + 1.3), sin(angle + 1.3))) / 48.0,
    -1.0, 1.0) * (6.0 / 255.0);
  reflectance += vec3(grazing + drift + arable * stripe * (1.0 / 255.0));`}
${PARCEL_FURROWS.on ? `{
    // taste-r1 (W22-B): PARCEL_FURROWS. The edge is a line, not a 36 m wash; a headland strip runs inside it; worked parcels carry
    // furrows and strip-to-strip tone, faded by footprint and distance.
    vec2 pfRunnerId = floor(runner / 72.0);
    float pfB = boundary + (workedGrain(country / 5.0 + 7.7) - 0.5) * 1.1;
    float pfMix = 0.5 * (1.0 - smoothstep(0.0, ${PARCEL_FURROWS.edgeM.toFixed(2)}, pfB));
    vec3 pfSharp = mix(parcelReflectance(fieldId), parcelReflectance(pfRunnerId), pfMix);
${gsOn ? '' : '    reflectance *= pfSharp / max(pfBlend, vec3(0.02));\n'}    float pfTone = parcelTone(fieldId);
    float pfWork = ${PARCEL_FURROWS.force ? '1.0' : 'pfTone >= 0.778 && pfTone < 0.850 ? 1.0 : (pfTone >= 0.850 ? 0.55 : arable * 0.30)'};
    // headland: one implement wide, lighter bare turn, with a soft inner edge
    float pfHead = (1.0 - smoothstep(${(PARCEL_FURROWS.headlandM - 0.9).toFixed(2)}, ${PARCEL_FURROWS.headlandM.toFixed(2)}, pfB)) * smoothstep(0.2, 0.9, pfB);
    reflectance *= 1.0 + pfHead * (0.05 + 0.09 * pfWork) * vec3(1.0, 0.98, 0.90);
    vec2 pfDir = vec2(cos(angle), sin(angle));
    vec2 pfW = vRingWorld.xz; // the world, not the warped country: a furrow is straight
    float pfS = dot(pfW, pfDir);
    float pfPitch = mix(${PARCEL_FURROWS.pitchM[0].toFixed(2)}, ${PARCEL_FURROWS.pitchM[1].toFixed(2)}, workedHash(fieldId + vec2(5.0, 91.0)));
    float pfU = pfS / pfPitch;
    float pfDist = length(vViewPosition);
    float pfFade = (1.0 - smoothstep(0.12, 0.40, fwidth(pfU))) * (1.0 - smoothstep(${PARCEL_FURROWS.fadeM[0].toFixed(1)}, ${PARCEL_FURROWS.fadeM[1].toFixed(1)}, pfDist));
    float pfTop = pow(0.5 + 0.5 * sin(pfU * 6.2831853 + 0.45 * workedGrain(vec2(pfU * 0.05, dot(pfW, vec2(-pfDir.y, pfDir.x)) / 40.0))), 1.6);
    reflectance *= 1.0 + ${PARCEL_FURROWS.amp.toFixed(3)} * pfWork * pfFade * (pfTop - 0.35) * (0.75 + 0.5 * workedGrain(country / 3.0 + 5.1));
    float pfStripU = pfS / ${PARCEL_FURROWS.stripM.toFixed(1)};
    float pfStripFade = 1.0 - smoothstep(0.10, 0.45, fwidth(pfStripU));
    float pfStrip = workedHash(vec2(floor(pfStripU), 0.0) + fieldId * 3.0 + vec2(11.0, 29.0));
    float pfEdge = smoothstep(0.0, 0.05, fract(pfStripU)) * (1.0 - smoothstep(0.95, 1.0, fract(pfStripU)));
    reflectance *= 1.0 + (pfStrip - 0.5) * ${PARCEL_FURROWS.stripAmp.toFixed(3)} * pfWork * pfStripFade * mix(0.6, 1.0, pfEdge);
    // beyond the furrows the surface keeps a grain drawn along the parcel's direction
    float pfGrain = workedGrain(vec2(pfS / 1.3, dot(pfW, vec2(-pfDir.y, pfDir.x)) / 9.0) + 31.7);
    reflectance *= 1.0 + (pfGrain - 0.5) * 0.07 * pfWork * (1.0 - pfFade);
  }` : ''}
  // One boundary, no inset access stripe. The gap phase is symmetric between neighbours.
  vec2 normal = normalize(runner - nearest), tangent = vec2(-normal.y, normal.x);
  vec2 midpoint = (nearest + runner) * 0.5;
  float along = dot(country - midpoint, tangent);
  float gatePitch = 38.0;
  float gateDistance = abs(mod(along + gatePitch * 0.5, gatePitch) - gatePitch * 0.5);
  float hedgePresent = smoothstep(2.5, 3.2, gateDistance);
  vec2 gate = midpoint + tangent * (floor(along / gatePitch + 0.5) * gatePitch);
  float stockTrack = max(workedPath(country, nearest, gate),
    workedPath(country, nearest + vec2(cos(angle), sin(angle)) * 14.0, gate));
  stockTrack *= (1.0 - arable) * (1.0 - smoothstep(24.0, 48.0, length(country - gate)));
  if (uWorkedDam.z > 0.0) {
    vec2 dam = uWorkedDam.xy;
    vec2 toDam = vRingWorld.xz - dam;
    float damTrack = 0.0;
    for (int k = 0; k < 3; k++) {
      float heading = float(k) * 2.0943951 + uWorkedSeed;
      vec2 direction = vec2(cos(heading), sin(heading));
      damTrack = max(damTrack, workedPath(vRingWorld.xz, dam + direction * (uWorkedDam.z + 28.0),
        dam + direction * uWorkedDam.z));
    }
    stockTrack = max(stockTrack, damTrack);
  }
  reflectance += vec3(stockTrack * (5.0 / 255.0));
${PARCEL_FENCES.on ? '  float pfFenceStrip = 0.0;\n' : ''}  float edgeAA = max(fwidth(boundary), 0.6); // taste-r1 W14-C: floor 0.6 m (was 0.08), no razor line
  float fieldLuma = dot(reflectance, vec3(0.2126, 0.7152, 0.0722));
  // This is sqrt(linear reflectance), not display sRGB. The pinned lit/post
  // T13D palette floor preserves dark pasture and plough; verify display luma in receipts.
  reflectance *= max(1.0, 0.099 / max(fieldLuma, 0.001));
${PARCEL_FENCES.on ? `{
    // taste-r1 (W25): PARCEL_FENCES. Under a fenced edge (the planner marks it in uPfFenceTex) stock have worn a track 1.5 to 2.5 m wide:
    // a little paler and rougher than the paddock, broken along its length, torn at both edges, wider and barer at a gate.
    vec2 pfOwn = fieldId, pfOth = floor(runner / 72.0);
    if (pfOth.x < pfOwn.x || (pfOth.x == pfOwn.x && pfOth.y < pfOwn.y)) { vec2 pfT = pfOwn; pfOwn = pfOth; pfOth = pfT; }
    vec2 pfOff = pfOth - pfOwn, pfCell = pfOwn - uPfFenceOrg.xy;
    float pfFlag = 0.0;
    if (pfCell.x >= 0.0 && pfCell.y >= 0.0 && pfCell.x < uPfFenceOrg.z && pfCell.y < uPfFenceOrg.z) {
      vec4 pfTex = texelFetch(uPfFenceTex, ivec2(pfCell), 0);
      pfFlag = pfOff.x > 0.5 ? (pfOff.y < -0.5 ? pfTex.r : (pfOff.y > 0.5 ? pfTex.b : pfTex.g)) : (pfOff.y > 0.5 ? pfTex.a : 0.0);
    }
${FENCE_HEDGED.on ? `    // W28 (fences-fix): the strip fades to nothing over the last ${FENCE_HEDGED.endM.toFixed(1)} m at each end of an edge. The ends are where the edge's bisector meets the
    // bisector with each other site of the 3 x 3 (the circumcentres), measured along the edge from this pixel.
    if (pfFlag > 0.5) {
      float pfLo = -1.0e4, pfHi = 1.0e4;${FENCE_TIDY.on ? '\n      vec2 pfIdLo = pfOwn, pfIdHi = pfOwn;' : ''}
      for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
        vec2 pfDs = workedSite(cell + vec2(float(i), float(j))) - nearest;
        float pfA = 2.0 * dot(tangent, pfDs), pfC = dot(pfDs, pfDs) - 2.0 * dot(midpoint - nearest, pfDs);
${FENCE_TIDY.on ? `        if (pfA > 1.0e-3) { if (pfC / pfA < pfHi) { pfHi = pfC / pfA; pfIdHi = cell + vec2(float(i), float(j)); } }
        else if (pfA < -1.0e-3) { if (pfC / pfA > pfLo) { pfLo = pfC / pfA; pfIdLo = cell + vec2(float(i), float(j)); } }` : `        if (pfA > 1.0e-3) pfHi = min(pfHi, pfC / pfA); else if (pfA < -1.0e-3) pfLo = max(pfLo, pfC / pfA);`}
      }
${FENCE_TIDY.on ? `      // W29 (fences-tidy): an end whose vertex is shared with another flagged edge (parcel C against either of this edge's two) does not fade; the strip turns the corner.
      float pfToHi = pfHi - along, pfToLo = along - pfLo;
      if (pfEdgeFlag(pfOwn, pfIdHi) + pfEdgeFlag(pfOth, pfIdHi) > 0.5) pfToHi = 1.0e4;
      if (pfEdgeFlag(pfOwn, pfIdLo) + pfEdgeFlag(pfOth, pfIdLo) > 0.5) pfToLo = 1.0e4;
      pfFlag *= smoothstep(0.0, ${FENCE_HEDGED.endM.toFixed(1)}, max(min(pfToHi, pfToLo), 0.0));` : `      pfFlag *= smoothstep(0.0, ${FENCE_HEDGED.endM.toFixed(1)}, max(min(pfHi - along, along - pfLo), 0.0));`}
    }
` : ''}    float pfWide = mix(1.5, 2.5, workedGrain(vec2(along / 23.0, 7.7))) + 1.8 * (1.0 - hedgePresent);
    float pfTear = (workedGrain(vec2(along / 2.1, boundary / 1.4) + 3.7) - 0.5) * 0.95
      + (workedGrain(vec2(along / 0.9, boundary / 0.8) + 8.1) - 0.5) * 0.45;
    float pfBroken = mix(smoothstep(0.08, 0.34, workedGrain(vec2(along / 13.0, 1.9))), 1.0, 1.0 - hedgePresent);
    pfFenceStrip = pfFlag * (1.0 - smoothstep(pfWide * 0.5 - 0.15 + pfTear, pfWide * 0.5 + 0.30 + pfTear, boundary)) * mix(0.72, 1.0, pfBroken);${FENCE_CARRY.on ? `
    float pfFar = smoothstep(${(FENCE_HEDGED.on ? FENCE_HEDGED : FENCE_CARRY).riseM[0].toFixed(1)}, ${(FENCE_HEDGED.on ? FENCE_HEDGED : FENCE_CARRY).riseM[1].toFixed(1)}, length(vViewPosition));` : ''}
    float pfRough = 1.0 + (workedGrain(country / 0.85 + 4.0) - 0.5) * 0.34 + (workedGrain(country / 0.33 + 9.0) - 0.5) * 0.16;
    reflectance = mix(reflectance, reflectance * vec3(1.34, 1.27, 1.06) * pfRough + vec3(0.055, 0.050, 0.030), pfFenceStrip * 0.92${FENCE_CARRY.on ? ` * (1.0 - ${(1 - FENCE_CARRY.wornFar).toFixed(3)} * pfFar)${FENCE_HEDGED.on ? ' * (1.0 - pfFar)' : ''}` : ''});
${FENCE_CARRY.on ? `    // taste-r1 (W26): FENCE_CARRY. Rank grass beside the worn strip, both sides: uncut, darker and slightly greener, 0.8 to 1.4 m wide,
    // torn along its outer edge, broken in tufts, absent at a gate. Its tint deepens with camera distance (pfFar: 150 to 400 m) and it is
    // never narrower than ${FENCE_CARRY.minPx.toFixed(1)} pixels, so the boundary still reads as a line when the wire is under a pixel.
    float pfFoot = fwidth(boundary);
    float pfAA = max(pfFoot * 0.7, 0.12);
    float pfRankW = mix(${FENCE_CARRY.rankM[0].toFixed(2)}, ${FENCE_CARRY.rankM[1].toFixed(2)}, workedGrain(vec2(along / 17.0, 3.3)));
    float pfRankTear = (workedGrain(vec2(along / 1.9, boundary / 1.2) + 12.3) - 0.5) * 0.55 + (workedGrain(vec2(along / 0.8, boundary / 0.7) + 5.9) - 0.5) * 0.25;
    float pfRankIn = pfWide * 0.5 - 0.25${FENCE_HEDGED.on ? ` - (pfWide * 0.5 - 0.25) * ${FENCE_HEDGED.fill.toFixed(2)} * pfFar` : ''};
    float pfRankOut = pfWide * 0.5 + min(max(pfRankW + pfRankTear, pfFoot * ${FENCE_CARRY.minPx.toFixed(2)}), ${FENCE_CARRY.maxM.toFixed(2)});
    float pfTuft = mix(0.62, 1.0, smoothstep(0.12, 0.45, workedGrain(vec2(along / 9.0, 5.5))));
${FENCE_HEDGED.on ? `    // W28 (fences-fix): at distance no wider than ${FENCE_HEDGED.widthM.toFixed(1)} m in all, edges soft and torn, patchy along its length, and eased out over ${FENCE_HEDGED.endM.toFixed(1)} m on each side of a gate gap
    pfRankOut = mix(pfRankOut, min(pfRankOut, ${(FENCE_HEDGED.widthM * 0.5).toFixed(2)} + pfRankTear * 1.4), pfFar);
    float pfAAo = mix(pfAA, max(pfAA, 0.8), pfFar), pfAAi = mix(pfAA, max(pfAA, 0.45), pfFar);
    float pfPatch = mix(pfTuft, mix(0.62, 1.0, smoothstep(0.10, 0.50, workedGrain(vec2(along / 14.0, 8.8)))), pfFar);
    float pfGate = smoothstep(2.5, ${(2.5 + FENCE_HEDGED.endM).toFixed(1)}, gateDistance);
    float pfRank = pfFlag * smoothstep(pfRankIn - pfAAi, pfRankIn + pfAAi, boundary) * (1.0 - smoothstep(pfRankOut - pfAAo, pfRankOut + pfAAo, boundary))
      * pfPatch * pfGate;` : `    float pfRank = pfFlag * smoothstep(pfRankIn - pfAA, pfRankIn + pfAA, boundary) * (1.0 - smoothstep(pfRankOut - pfAA, pfRankOut + pfAA, boundary))
      * mix(pfTuft, 1.0, pfFar) * hedgePresent;`}
    vec3 pfRankTint = mix(vec3(${FENCE_CARRY.nearTint.map((v) => v.toFixed(3)).join(', ')}), vec3(${(FENCE_HEDGED.on ? FENCE_HEDGED : FENCE_CARRY).farTint.map((v) => v.toFixed(3)).join(', ')}), pfFar);
    pfRankTint *= 1.0 + (workedGrain(country / 1.3 + 6.1) - 0.5) * 0.22 * (1.0 - pfFar);
    reflectance *= mix(vec3(1.0), pfRankTint, pfRank);
` : ''}  }
` : ''}  float hedgeWidth = 0.6 + 1.6 * (0.5 + 0.5 * sin(vRingWorld.x / 6.0 + sin(vRingWorld.z / 9.0) * 2.0));
  float hedge = (1.0 - smoothstep(hedgeWidth * 0.35, hedgeWidth * 0.5 + edgeAA, boundary)) * hedgePresent${PARCEL_FENCES.on ? ' * (1.0 - pfFenceStrip)' : ''};
  // Project toward the actual sun; this puts the cast band only on its far side.
  vec2 towardSun = workedCountry(vRingWorld.xz + ${gsOn ? 'gsSun.xz / max(length(gsSun.xz), 1e-3)' : 'vec2(0.433, -0.901)'} * 0.8);
  float shadowDistance = abs(dot(towardSun - midpoint, normal));
  float shadow = (1.0 - smoothstep(hedgeWidth * 0.5, hedgeWidth * 0.5 + 0.6 + edgeAA,
    shadowDistance)) * (1.0 - hedge) * hedgePresent${PARCEL_FENCES.on ? ' * (1.0 - 0.7 * pfFenceStrip)' : ''};
  reflectance *= 1.0 - shadow * 0.08;
  reflectance = mix(reflectance, reflectance * vec3(0.80, 0.86, 0.74), hedge * 0.22);
  vec2 boardOutside = abs(vRingWorld.xz - uWorkedCentre) - uWorkedCentre;
  float carry = smoothstep(8.0, 20.0, max(boardOutside.x, boardOutside.y))${gsOn ? '; // taste W79 (GROUND_SURFACE, G2b fix): the parcel tone is kept where the lattice is built; the fade to the field\'s mean is below' : `
    * (1.0 - smoothstep(560.0, 616.0, length(vRingWorld.xz - uWorkedCentre)));`}
  // taste-r1 W14-C: over the last 6 m before the coast brow the paddock paint fades to the dry-grass
  // token the ribbon's brow row carries, so no paddock green meets the rock.
  reflectance = mix(reflectance, sqrt(PD_DRY) * 0.93, smoothstep(-7.0, -1.0, ringQmCache)); // W14 fix: 0.93 keeps the brow within 4 L* of the paddock
  // taste-r1 W14-C hill shade: the flank that faces the sun the hedge shadow already uses is
  // lifted and the far flank dropped, by the stored ring normal. Gain 8: a 6 degree flank has
  // n.xz of about 0.1 and would otherwise move 2 L* only. Sqrt space, so the albedo moves twice.
${gsOn ? '' : `  {
    float ddRainSun = clamp(uDDCloud.x, 0.0, 1.0);
    // taste-r1 W15-C2: gain 24 -> 70 through tanh (gentle ground carries the flank sign at a third of the slope, and no clamp corner draws a terminator). A 56 m baseline was tried (it4) and dropped: flank 10 and 7 L*, station 19 slab SD 19 and 22, hinterland V 46.5 and 35. and amplitude
    // 0.34 -> 0.42; both flanks at station 18 sat on 0.2 to 0.5 degree ground and read 6 L* apart.
    // taste-r1 (W15 fix): the shaded flank of the one spur and gully read as a smooth diagonal smear (five-bin 51 % at station 18,
    // 1000,650). Only inside the slope (flankG is 0 on flat ground, so no paddock is mottled): the terminator is moved by a 3.1 m
    // noise so its edge is soft and irregular, the depth of the shade is broken by grain at 3.1 m and 1.7 m so it is mottled
    // rather than one flat tone, and the steepest walls (the gully) take less shade than the gentle flanks, so the strongest
    // line in the frame is the weakest (a narrow band of reduction drew thin dark contour lines, so it is wide and shallow). Switch-off: make flankG 0.0 (the W15-C2 shade comes back exactly).
    vec2 flankDir = vec2(0.433, -0.901);
    float flankSlope = dot(ringNCache.xz, flankDir);
    float flankMag = length(ringNCache.xz);
    float flankG = smoothstep(0.004, 0.03, flankMag);
    float fgB = workedGrain(vRingWorld.xz / 2.3 + 41.3);
    float fgC = workedGrain(vec2(dot(vRingWorld.xz, flankDir), dot(vRingWorld.xz, vec2(flankDir.y, -flankDir.x)) * 0.35) / 1.7 + 3.9);
    float fgD = workedGrain(vRingWorld.xz / 1.1 + 13.7);
    float flank = tanh(flankSlope * 70.0 + flankG * ((fgB - 0.5) * 1.6 + (fgD - 0.5) * 0.8));
    float flankDepth = mix(1.0, 0.45 + 1.0 * (0.45 * fgB + 0.30 * fgC + 0.25 * fgD), flankG * 0.70)
      * (1.0 - 0.40 * smoothstep(0.03, 0.16, flankMag))
      // taste-r1 (W21 review): the painted shade stands in for light on ground too gentle to catch any; on a real scarp (slope over about 0.35) the sun and the
      // cast shadow do the work, and the two together drew a navy pool on the trial ridge. It fades out between 0.34 and 0.55.
      * (1.0 - smoothstep(0.34, 0.55, flankMag));
    reflectance *= 1.0 + 0.42 * flank * flankDepth * carry * mix(1.0, 0.75, ddRainSun);
  }
`}${gsOn ? `  // taste W79 (GROUND_SURFACE, G2b): from r ${GS.far.fadeFrom} the statement fades into the far ring's (ground-surface.js), the one the crust draws on the same fade: one palette across the join (r 616 to 624).
  vec3 gsFarBase = gsFarAlbedo(gsMul, gsRockW, smoothstep(${GS.far.brow[0].toFixed(1)}, ${GS.far.brow[1].toFixed(1)}, ringQmCache));
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(reflectance * reflectance, gsFarBase, smoothstep(${GS.far.fadeFrom.toFixed(1)}, ${GS.far.fadeTo.toFixed(1)}, length(vRingWorld.xz - uWorkedCentre))), uWorkedMix * carry${GROUND_SURFACE.creekLine > 0 ? ` * (1.0 - ${GROUND_SURFACE.creekLine.toFixed(5)} * diffuseColor.a)` : ''});` : `  diffuseColor.rgb = mix(diffuseColor.rgb, reflectance * reflectance, uWorkedMix * carry);`}
}`);
  };
  material.customProgramCacheKey = () => `${previousKey}|worked-paddock-taste-r1-v2-w6a-rain-w14c-w15c2-fix5-w21${PARCEL_FURROWS.on ? `-w22bpf1${PARCEL_FURROWS.force}` : ''}${PARCEL_FENCES.on ? '-w25pf1' : ''}${FENCE_CARRY.on ? '-w26fc1' : ''}${FENCE_HEDGED.on ? '-w28fh1' : ''}${FENCE_TIDY.on ? '-w29ft1' : ''}${gsOn ? groundSurfaceKey() : ''}`;
  attachFarmFields(material, seed);
  material.needsUpdate = true;
  return material;
}

/**
 * Paddock boundaries, found by asking where the tint changes rather than by
 * re-deriving the lattice. Hedges and shelterbelts both read from this
 * one list, so a hedge can never sit in the middle of a field.
 */
function hinterlandBoundaries(extent, crust, seed, rest = null) {
  const all = workedParcelBoundaries(extent, seed).map((b) => ({
    ...b, mask: hinterlandMaskAt(b.x, b.z, extent, crust),
  }));
  // taste-r1 (W27, FENCE_EDGES): the samples the mask drops (landmark seat dishes and spoil shoulders: Tullamarine, the Grand Prix) are
  // handed back in `rest` for the fence planner; the hedges, belts and the rest of the hinterland never see them.
  if (rest) for (const b of all) if (b.mask < 0.20) rest.push({ ...b, rest: true });
  return all.filter((b) => b.mask >= 0.20);
}

/**
 * Tag every boundary sample with the length of the contiguous run it belongs to.
 *
 * A boundary line is contiguous along gz when it was found stepping in +x
 * (`dir` 0) and along gx when it was found stepping in +z (`dir` 1). Without
 * this, a boundary that clips the ring for one or two samples emits one or two
 * lone hedge segments, and a single 8.8 m hexagonal prism lying on open grass
 * does not read as a hedge — it reads as a log. That is exactly what the r1
 * shroud-void plate showed along its right edge: 17 dark blobs in a window that
 * held none in r0, the largest 150x41 px, most of them isolated segments.
 */
function runLengthOf(samples) {
  const lines = new Map();
  for (const s of samples) {
    const key = s.dir === 0 ? `0:${s.gx}` : `1:${s.gz}`;
    const idx = s.dir === 0 ? s.gz : s.gx;
    const list = lines.get(key);
    if (list) list.push([idx, s]); else lines.set(key, [[idx, s]]);
  }
  for (const list of lines.values()) {
    list.sort((a, b) => a[0] - b[0]);
    let i = 0;
    while (i < list.length) {
      let j = i;
      while (j + 1 < list.length && list[j + 1][0] === list[j][0] + 1) j += 1;
      const run = j - i + 1;
      for (let k = i; k <= j; k += 1) {
        list[k][1].run = run;
        list[k][1].runPos = k - i;
      }
      i = j + 1;
    }
  }
  return samples;
}

/**
 * Coarse XZ occupancy of everything already standing on the fringe, built from
 * live world AABBs after the venues mount. This is the keep-out: derived from
 * what is actually there, so a lane that moves its venue moves the keep-out
 * with it. It replaces the numeric circle at world (60, 500) r=120 that a
 * previous session hard-copied out of a screenshot — a measured constant that
 * was already 32 m short of Falls Creek's own bbox corners.
 */
const OCCUPANCY_CELL = 8;
const OCCUPANCY_SPAN_CAP = 220;

function buildOccupancy(root, skipNames) {
  const grid = new Set();
  const box = new THREE.Box3();
  const boxes = [];
  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    if (!node.isMesh) return;
    const name = typeof node.name === 'string' ? node.name : '';
    if (name.startsWith('pick:') || skipNames.has(name)) return;
    box.setFromObject(node);
    if (box.isEmpty()) return;
    const sx = box.max.x - box.min.x;
    const sz = box.max.z - box.min.z;
    // Ground sheets and water bodies are not obstacles; they are the ground.
    if (sx > OCCUPANCY_SPAN_CAP || sz > OCCUPANCY_SPAN_CAP) return;
    boxes.push([box.min.x, box.min.z, box.max.x, box.max.z]);
    const i0 = Math.floor(box.min.x / OCCUPANCY_CELL) - 2;
    const i1 = Math.floor(box.max.x / OCCUPANCY_CELL) + 2;
    const j0 = Math.floor(box.min.z / OCCUPANCY_CELL) - 2;
    const j1 = Math.floor(box.max.z / OCCUPANCY_CELL) + 2;
    for (let i = i0; i <= i1; i += 1) {
      for (let j = j0; j <= j1; j += 1) grid.add(i * 65536 + j);
    }
  });
  const free = (x, z) => !grid.has(
    Math.floor(x / OCCUPANCY_CELL) * 65536 + Math.floor(z / OCCUPANCY_CELL),
  );
  return {
    grid,
    boxes,
    free,
    /**
     * Smoothed clearance in [0,1] over a 40 m window. The overlay's lift
     * multiplies by this so raised ground fades out before it reaches a venue
     * rather than stepping down at a cell edge.
     *
     * ── T6B: THE OLD WINDOW WAS STILL A STAIRCASE ──
     *
     * The 5x5 version sampled `free()` at fixed 8 m offsets from the query
     * point, and `free()` snaps its argument to the cell lattice — so the
     * returned value was piecewise CONSTANT in 8 m cells and jumped by 1/25 at
     * every cell boundary. On the plate that is a 45-degree staircase with 8 m
     * legs following the venue AABBs, which is what BA2 fault 6 reads as a
     * "razor forest-to-paddock polygon boundary" behind the Apostles and what
     * fault 4 reads as a cut-out around the Falls and precinct seats. The
     * carry filter could not remove it: that filter averages the SAME
     * staircase at three radii, which shifts the steps rather than smoothing
     * them.
     *
     * This is the same window evaluated as a proper separable bilinear box:
     * the two boundary columns and rows take the fractional weight of where
     * the query point sits inside its own cell, so the result is continuous in
     * x and z and ramps linearly over 8 m instead of stepping. 36 lookups
     * against 25, and it is a build-time cost only.
     */
    clearance(x, z) {
      const fx = x / OCCUPANCY_CELL - Math.floor(x / OCCUPANCY_CELL);
      const fz = z / OCCUPANCY_CELL - Math.floor(z / OCCUPANCY_CELL);
      let open = 0;
      let total = 0;
      for (let i = -2; i <= 3; i += 1) {
        const wx = i === -2 ? 1 - fx : i === 3 ? fx : 1;
        if (wx <= 0) continue;
        for (let j = -2; j <= 3; j += 1) {
          const wz = j === -2 ? 1 - fz : j === 3 ? fz : 1;
          if (wz <= 0) continue;
          const w = wx * wz;
          total += w;
          if (free(x + i * OCCUPANCY_CELL, z + j * OCCUPANCY_CELL)) open += w;
        }
      }
      return total > 0 ? open / total : 1;
    },
  };
}

/**
 * taste-r1 (W20): the switch for the hinterland groups. 1 plants the ring trees as groups of three to nine (the tallest
 * in the middle, the rim at about 0.6 of it, two to four low shrubs at the feet; about one tree in seven stays single) and
 * the river-bank trees in threes; 0 is the single scatter of W19, placement for placement.
 */
export const HINTERLAND_TREE_GROUPS = 1;

function treePlacements(city, roles, seed, cap, crust) {
  const { extent } = city;
  const trees = [];
  const edge = roles.hillsEdge;
  const L = alongLength(edge, extent);
  // HELD-FILE TOUCH (escalated, logged): 364 of 553 ring trees planted
  // into crust WATER sectors at stale heightWorld elevations — standing
  // in the open sea (user screenshot, port deep) and hanging in the sky
  // behind Falls Creek (trees at z 500-620 elevated over what now
  // renders as sea). The crust's own waterness field is the truth.
  //
  // 2026-09-02, board-AAA lane 2: that patch gated WHERE, and a second patch
  // added a numeric circle for Falls Creek, but neither touched the height,
  // which is where the fault actually lived. Grounding is now
  // `hinterlandGroundAt` — crust + this file's overlay, i.e. the rasterised
  // surface. The numeric circle is gone; the keep-out is the live occupancy
  // grid applied in `_build()`, after the venues exist to be measured.
  const massing = crust ?? planEdgeMassing(city);
  const ground = (x, z) => hinterlandGroundAt(x, z, extent, massing, seed);
  const onWater = (x, z) => waternessAt(x, z, extent, massing) > HINTERLAND.waterCut;
  const offRing = (x, z) => hinterlandMaskAt(x, z, extent, massing) < 0.30;
  let i = 0;
  let attempts = 0;
  const grouped = HINTERLAND_TREE_GROUPS > 0;
  const shrubs = [];
  while (!grouped && trees.length < cap && attempts < cap * 6) {
    attempts += 1;
    const u = idxUnit(1, i, 0, seed);
    const v = idxUnit(2, i, 0, seed);
    i += 1;
    const along = (u - 0.5) * (L - 24);
    const out = 140 + v * 280;
    const p = shorePoint(edge, extent, out, along);
    const az = Math.atan2(p.x - extent.x * 0.5, p.z - extent.z * 0.5);
    const w = roleWeights(az, roles);
    if (w.hills < 0.28 || inBayFootprint(p.x, p.z, extent, roles.bay)) continue;
    if (out < 250 && Math.abs(along) < L * 0.42) continue;
    if (onWater(p.x, p.z) || offRing(p.x, p.z)) continue;
    trees.push({
      x: p.x,
      z: p.z,
      y: ground(p.x, p.z),
      scale: 6 + idxUnit(3, i, 0, seed) * 8,
      yaw: idxUnit(4, i, 0, seed) * TAU,
      hue: idxUnit(5, i, 0, seed),
      kind: Math.min(4, Math.floor(idxUnit(6, i, 0, seed) * 5)),
      role: 'ring',
    });
  }
  if (grouped) {
    // W20-B. `_plantTrees` keeps 55% of the singles by a position hash and every member of a group, so a group budget of 55%
    // of the cap plants about as many trees as the scatter did and the instance count does not rise.
    const budget = Math.ceil(cap * 0.55);
    let load = 0;
    let gid = 0;
    const gate = (p, out, along) => {
      const az = Math.atan2(p.x - extent.x * 0.5, p.z - extent.z * 0.5);
      if (roleWeights(az, roles).hills < 0.28 || inBayFootprint(p.x, p.z, extent, roles.bay)) return false;
      if (out < 250 && Math.abs(along) < L * 0.42) return false;
      return !(onWater(p.x, p.z) || offRing(p.x, p.z));
    };
    while (load < budget && attempts < cap * 6) {
      attempts += 1;
      const u = idxUnit(1, i, 0, seed);
      const v = idxUnit(2, i, 0, seed);
      i += 1;
      const along = (u - 0.5) * (L - 24);
      const out = 140 + v * 280;
      const p = shorePoint(edge, extent, out, along);
      if (!gate(p, out, along)) continue;
      const kind = Math.min(4, Math.floor(idxUnit(6, i, 0, seed) * 5));
      if (idxUnit(401, i, 0, seed) < 1 / 7) {
        trees.push({
          x: p.x, z: p.z, y: ground(p.x, p.z), scale: 6 + idxUnit(3, i, 0, seed) * 8,
          yaw: idxUnit(4, i, 0, seed) * TAU, hue: idxUnit(5, i, 0, seed), kind, role: 'ring',
        });
        load += 0.55;
        continue;
      }
      const n = 3 + Math.min(6, Math.floor(idxUnit(402, i, 0, seed) * 7));
      gid += 1;
      const placed = [];
      for (let m = 0; m < n; m += 1) {
        let mp = p;
        let mo = out;
        let ma = along;
        let rr = 0;
        if (m > 0) {
          // A jittered golden-angle spiral, 5 to 16 m out.
          const ang = m * 2.39996 + (idxUnit(403, i, m, seed) - 0.5) * 0.8;
          rr = Math.max(5, Math.min(16, 5 + 11 * Math.sqrt(m / n) * (0.85 + idxUnit(404, i, m, seed) * 0.3)));
          mo = out + Math.cos(ang) * rr;
          ma = along + Math.sin(ang) * rr;
          mp = shorePoint(edge, extent, mo, ma);
          if (!gate(mp, mo, ma)) continue;
        }
        const size = m === 0 ? 1 : 1 - 0.4 * ((rr - 5) / 11) + (idxUnit(405, i, m, seed) - 0.5) * 0.12;
        placed.push({
          x: mp.x, z: mp.z, y: ground(mp.x, mp.z), scale: 6 + idxUnit(3, i, m, seed) * 8,
          yaw: idxUnit(4, i, m + 40, seed) * TAU, hue: idxUnit(5, i, m + 40, seed), kind,
          role: 'ring', group: gid, size: Math.max(0.55, Math.min(1, size)),
        });
      }
      if (placed.length < 3) continue;
      for (const t of placed) trees.push(t);
      load += placed.length;
      // Two to four low shrubs at the feet, in the existing scrub family.
      const ns = 2 + Math.min(2, Math.floor(idxUnit(406, i, 0, seed) * 3));
      for (let k = 0; k < ns; k += 1) {
        const ang = idxUnit(407, i, k, seed) * TAU;
        const rr = 3 + idxUnit(408, i, k, seed) * 7;
        const mo = out + Math.cos(ang) * rr;
        const ma = along + Math.sin(ang) * rr;
        const sp = shorePoint(edge, extent, mo, ma);
        if (!gate(sp, mo, ma)) continue;
        const w = 2 + idxUnit(409, i, k, seed) * 1.5;
        shrubs.push({
          x: sp.x, z: sp.z, y: ground(sp.x, sp.z), yaw: idxUnit(410, i, k, seed) * TAU,
          len: w, height: 1.0 + idxUnit(411, i, k, seed) * 0.8, width: w * (0.85 + idxUnit(412, i, k, seed) * 0.3),
          hue: idxUnit(413, i, k, seed),
        });
      }
    }
  }
  trees.shrubs = shrubs;
  const bankCap = Math.min(80, Math.floor(cap * 0.18));
  const riverEdge = roles.yarraEdge;
  const riverL = alongLength(riverEdge, extent);
  for (let n = 0; n < bankCap; n += 1) {
    if (grouped && n >= Math.ceil(bankCap * 0.55)) break;
    if (grouped && n % 3 !== 0) continue;
    const u = idxUnit(7, n, 0, seed);
    const along = (u - 0.5) * (riverL * 0.7);
    const out = 40 + idxUnit(8, n, 0, seed) * 280;
    const side = idxUnit(9, n, 0, seed) > 0.5 ? 8 : -8;
    const p = shorePoint(riverEdge, extent, out, along + side);
    if (inHarbourFootprint(p.x, p.z, extent, roles)) continue;
    if (onWater(p.x, p.z) || offRing(p.x, p.z)) continue;
    trees.push({
      x: p.x,
      z: p.z,
      y: ground(p.x, p.z),
      scale: 5 + idxUnit(10, n, 0, seed) * 6,
      yaw: idxUnit(11, n, 0, seed) * TAU,
      hue: idxUnit(12, n, 0, seed),
      // Riverbank planting skews broadleaf; conifers on a river bank read wrong.
      kind: idxUnit(13, n, 0, seed) > 0.35 ? 2 : 0,
      role: 'bank',
      ...(grouped ? { group: 1000 + n, size: 1 } : {}),
    });
    if (grouped) {
      // W20-B: the bank trees come in threes, the two companions 4 to 8 m off along the bank, smaller.
      const kind = idxUnit(13, n, 0, seed) > 0.35 ? 2 : 0;
      for (let m = 1; m <= 2; m += 1) {
        const ang = idxUnit(414, n, m, seed) * TAU;
        const rr = 4 + idxUnit(415, n, m, seed) * 4;
        const q = shorePoint(riverEdge, extent, out + Math.cos(ang) * rr, along + side + Math.sin(ang) * rr);
        if (inHarbourFootprint(q.x, q.z, extent, roles)) continue;
        if (onWater(q.x, q.z) || offRing(q.x, q.z)) continue;
        trees.push({
          x: q.x, z: q.z, y: ground(q.x, q.z), scale: 5 + idxUnit(10, n, m, seed) * 6,
          yaw: idxUnit(11, n, m, seed) * TAU, hue: idxUnit(12, n, m, seed), kind, role: 'bank',
          group: 1000 + n, size: 0.8 - 0.12 * m + (idxUnit(416, n, m, seed) - 0.5) * 0.1,
        });
      }
    }
  }
  return trees;
}

/**
 * taste-r1 (W27): CREST_TREES, the far tier of trees on the crust. The hinterland's trees end where its mask does (r 624), so
 * in a low view the tree cover stopped on an arc and the land out to r 1400 was bare. 1 plants lines of trees along the crests of
 * the crust from r 624 to about r 1000, and small groups on its spurs and in its gullies, thinning outward, as ONE more list
 * (`plan.crestTrees`, `[]` at 0) that `_plantCrestTrees` instances with the hinterland's own two species in a far form (tree-forms.js,
 * tier 'far', 120 triangles or fewer), six meshes and no shadow, with one soft contact-decal mesh under all of them (7 draws). The
 * feather band (r 600 to 724, densest at the arc at 624) is groups of that form joined to the hinterland's own tail, so the cover
 * thins out where the crests take over instead of ending on a ring. `plan.trees` is never touched, so 0 restores today's tree list
 * by construction.
 * Browser: `?crestTrees=0`; node: `DD_CREST_TREES=0`.
 */
/**
 * taste W28: CREST_SHADE, the contact shade of the far trees (`CREST_TREES`). The decal W27 laid was drawn (a capture with its
 * value at 0 shows black feet under every tree) but could not be seen at its own value: it was a 6-sided fan, 0.5 of the tree's
 * HEIGHT in radius with its centre at 0.6 and a first ring at 0.82, so under a crown about 0.35 of the height in half width the
 * part that shows between the trunk and the rim was 0.85 to 1, and the far trees floated. 1 lays one foot per tree sized from the
 * crown itself (`reach` times the form's own half width), full value out to `plateau` of its radius and then a smooth fall to
 * exactly 1 at the rim, over `rings` rings of `seg` sides (no disc edge: the rim is 1 and the fall has no kink).
 * Browser: `?crestShade=0`; node: `DD_CREST_SHADE=0` (0 restores the W27 decal, and with it the W27 triangle count).
 */
export const CREST_SHADE = Object.freeze({
  on: (typeof process !== 'undefined' && process?.env?.DD_CREST_SHADE !== undefined)
    ? (Number(process.env.DD_CREST_SHADE) > 0 ? 1 : 0)
    : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('crestShade') === '0') ? 0 : 1),
  reach: 1.15, // the foot's radius over the crown's half width (the form's bounding box): a foot about one crown wide, soft at the rim
  plateau: 0.4, // the fraction of the radius that holds the full value
  dark: 0.6, // the value over the plateau (a multiply: 0.6 is a visible foot on the mid-tone ground, and two feet that overlap compound to 0.36)
  seg: 8,
  rings: Object.freeze([0.35, 0.6, 0.8, 1.0]), // radius fractions of the rings; the last is the rim
});

// W28 test hook: a numeric query override for the decal's size and value (browser only; the default stands without it).
export const CREST_TREES = {
  on: (typeof process !== 'undefined' && process?.env?.DD_CREST_TREES !== undefined)
    ? (Number(process.env.DD_CREST_TREES) > 0 ? 1 : 0)
    : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('crestTrees') === '0') ? 0 : 1),
  r0: 628, r1: 1000, // radii from the board centre, in metres
  grid: 24, ringCells: 5, // the height grid pitch, and the curvature ring (5 cells = 120 m)
  cMin: 1.1, // a crest is a point that stands this many metres over the mean of the ring about it
  // Far tier: the crest trees are the 'far' form (tree-forms.js, 120 triangles or fewer), a contact decal under each, six meshes + one.
  maxTrees: 600, maxTris: 110000,
  trisEucalypt: 104, trisCypress: 104, trisShade: CREST_SHADE.on ? 8 + 16 * (CREST_SHADE.rings.length - 1) : 18, // measured: formStats of treeForm(.., tier 'far') variants 0 to 2 (max); the decal's fan (W28: the foot, 56 at 4 rings of 8)
  lineShare: 0.55, // of the trees outside the feather band, the rest goes to the groups
  // The feather band: groups of the far form from the hinterland's own tail (it ends at r 597) across the arc at 624 and out to 724,
  // densest at the arc, thinning outward to meet the crest lines.
  feather: { r0: 600, arc: 624, r1: 724, pitch: 40, pArc: 0.92, pJoin: 0.5, pOut: 0.22, max: 220 },
  seat: 0.3, // metres a tree is sunk below the drawn crust at its place
  shade: { k: 0.5, dark: 0.6, lift: 0.15 }, // the contact decal: radius over tree height, the value at its centre, metres over the drawn crust (+0.05 in makeTreeShade = 0.2)
};

function crestTreePlacements(extent, seed, crust, tier) {
  const P = CREST_TREES;
  const trees = [];
  trees.stats = { lines: 0, groups: 0, spurGroups: 0, gullyGroups: 0, tris: 0, eucalypt: 0, cypress: 0 };
  if (!P.on || tier === 'low' || !crust) return trees;
  const cx = extent.x * 0.5;
  const cz = extent.z * 0.5;
  const G = P.grid;
  const K = P.ringCells;
  const half = Math.ceil((P.r1 + K * G * 1.2) / G);
  const N = half * 2 + 1;
  const H = new Float32Array(N * N);
  const W = new Float32Array(N * N);
  const C = new Float32Array(N * N);
  for (let j = 0; j < N; j += 1) for (let i = 0; i < N; i += 1) {
    const x = cx + (i - half) * G;
    const z = cz + (j - half) * G;
    H[j * N + i] = surroundHeightSheetAt(x, z, extent, crust);
    W[j * N + i] = waternessAt(x, z, extent, crust);
  }
  // Curvature: the height over the mean of the LAND points of a ring of eight about 120 to 136 m out.
  const ring = [[K, 0], [-K, 0], [0, K], [0, -K], [K - 1, K - 1], [1 - K, K - 1], [K - 1, 1 - K], [1 - K, 1 - K]];
  const cell = (i, j) => j * N + i;
  for (let j = K; j < N - K; j += 1) for (let i = K; i < N - K; i += 1) {
    let sum = 0;
    let n = 0;
    for (const [di, dj] of ring) {
      const k = cell(i + di, j + dj);
      if (W[k] < 0.2) { sum += H[k]; n += 1; }
    }
    C[cell(i, j)] = n >= 5 ? H[cell(i, j)] - sum / n : 0;
  }
  const bil = (A, x, z) => {
    const fi = (x - cx) / G + half;
    const fj = (z - cz) / G + half;
    const i0 = Math.max(0, Math.min(N - 2, Math.floor(fi)));
    const j0 = Math.max(0, Math.min(N - 2, Math.floor(fj)));
    const tx = Math.max(0, Math.min(1, fi - i0));
    const tz = Math.max(0, Math.min(1, fj - j0));
    const a = A[cell(i0, j0)] * (1 - tx) + A[cell(i0 + 1, j0)] * tx;
    const b = A[cell(i0, j0 + 1)] * (1 - tx) + A[cell(i0 + 1, j0 + 1)] * tx;
    return a * (1 - tz) + b * tz;
  };
  const radius = (x, z) => Math.hypot(x - cx, z - cz);
  // Land only: dry here and 30 m round, off the beach and the dune, out of the creek's valley. (The venue keep-outs and the live
  // occupancy grid are applied in `_buildHinterland`, which owns them.)
  const dryAt = (x, z) => {
    if (waternessAt(x, z, extent, crust) > 0.04) return false;
    if (surroundHeightSheetAt(x, z, extent, crust) < 3.0) return false;
    for (let a = 0; a < 6; a += 1) {
      if (waternessAt(x + Math.sin(a * 1.0472) * 36, z + Math.cos(a * 1.0472) * 36, extent, crust) > 0.16) return false;
    }
    const o = Math.max(-z, z - extent.z, -x, x - extent.x);
    const creek = creekFieldAt(x, z, extent, crust, crust.seats, o, 0);
    return !(creek.thread > 0.002 || creek.bar > 0.10);
  };
  const keep = (r) => smoothstep(P.r0, P.r0 + 30, r) * (1 - 0.45 * smoothstep(P.r0 + 140, P.r1, r));
  // Exact: is a planted tree within `reach` metres (the list is at most `maxTrees` long).
  const crowded = (x, z, reach) => {
    for (const t of trees) if (Math.abs(t.x - x) < reach && Math.abs(t.z - z) < reach && Math.hypot(t.x - x, t.z - z) < reach) return true;
    return false;
  };
  let tris = 0;
  let id = 0;
  let cap = P.maxTrees - P.feather.max; // the lines and groups stop here, the feather band has the rest
  const plant = (x, z, size, kindRoll, role, group) => {
    const kind = kindRoll < 0.2 ? 4 : 0;
    const cost = (kind === 4 ? P.trisCypress : P.trisEucalypt) + P.trisShade;
    if (trees.length >= cap || tris + cost > P.maxTris) return false;
    // Seated on the crust as it is DRAWN: the height of the crust mesh's own triangle at the point (its rings are 30 to 44 m apart out
    // here, so its chord runs metres off the true ground), less 0.3 m for the tree.
    const y = drawnCrustHeightAt(x, z, extent, crust, tier) - P.seat;
    id += 1;
    trees.push({
      x, z, y, scale: 6 + idxUnit(3, id, 7, seed) * 8, yaw: idxUnit(4, id, 7, seed) * TAU, hue: idxUnit(5, id, 7, seed),
      kind, role, group, size,
    });
    tris += cost;
    if (kind === 4) trees.stats.cypress += 1; else trees.stats.eucalypt += 1;
    return true;
  };

  // Seeds: local maxima of the curvature over the crest threshold, nearest first, thinned outward by a position hash.
  const lo = Math.max(K, half - Math.ceil(P.r1 / G) - 2);
  const seeds = [];
  const spurs = [];
  const gullies = [];
  for (let j = lo; j < N - lo; j += 1) for (let i = lo; i < N - lo; i += 1) {
    const x = cx + (i - half) * G;
    const z = cz + (j - half) * G;
    const r = radius(x, z);
    if (r < P.r0 || r > P.r1) continue;
    const c = C[cell(i, j)];
    if (Math.abs(c) < 0.35 * P.cMin || W[cell(i, j)] > 0.04) continue;
    // Non-maximum suppression ACROSS the form: the curvature at a cell against its two neighbours one cell either side along the
    // gradient of the height (a summit, where the gradient is flat, keeps all four compass neighbours).
    const e = G * 1.5;
    const gx = bil(H, x + e, z) - bil(H, x - e, z);
    const gz = bil(H, x, z + e) - bil(H, x, z - e);
    const gl = Math.hypot(gx, gz);
    let top = true;
    let bottom = true;
    const against = (ox, oz) => {
      const o = bil(C, x + ox, z + oz);
      if (o > c) top = false;
      if (o < c) bottom = false;
    };
    if (gl < 0.02) { against(G, 0); against(-G, 0); against(0, G); against(0, -G); }
    else { against(gx / gl * G, gz / gl * G); against(-gx / gl * G, -gz / gl * G); }
    const hash = idxUnit(501, i, j, seed);
    if (hash >= keep(r)) continue;
    const rec = { x: x + (idxUnit(502, i, j, seed) - 0.5) * G, z: z + (idxUnit(503, i, j, seed) - 0.5) * G, r, c, i, j };
    if (top && c >= P.cMin) seeds.push(rec);
    else if (top && c > 0) spurs.push(rec);
    else if (bottom && c <= -0.6 * P.cMin) gullies.push(rec);
  }
  const byRadius = (a, b) => a.r - b.r || a.i - b.i || a.j - b.j;
  seeds.sort(byRadius);
  spurs.sort(byRadius);
  gullies.sort(byRadius);
  trees.stats.seeds = seeds.length;
  trees.stats.spurSites = spurs.length;
  trees.stats.gullySites = gullies.length;

  // Lines: walk the contour (the tangent to the height's gradient) from each seed, both ways, re-centring on the crest at each step.
  const lineMax = Math.floor(cap * P.lineShare);
  for (const s of seeds) {
    if (trees.length >= lineMax) break;
    if (crowded(s.x, s.z, 36) || !dryAt(s.x, s.z)) continue;
    const t = smoothstep(P.r0, P.r1, s.r);
    const want = Math.max(5, Math.round((8 + idxUnit(504, s.i, s.j, seed) * 9) * (1 - 0.3 * t)));
    const pts = [];
    const walk = (sign, count) => {
      let x = s.x;
      let z = s.z;
      let lastOut = 0;
      for (let step = 0; step < count * 3 && pts.length < want; step += 1) {
        const e = 36;
        const gx = (bil(H, x + e, z) - bil(H, x - e, z)) / (2 * e);
        const gz = (bil(H, x, z + e) - bil(H, x, z - e)) / (2 * e);
        const gl = Math.hypot(gx, gz);
        let tx;
        let tz;
        if (gl < 0.01) {
          const a = idxUnit(505, s.i + step, s.j, seed) * TAU;
          tx = Math.sin(a); tz = Math.cos(a);
        } else {
          tx = -gz / gl * sign; tz = gx / gl * sign;
        }
        const d = 17 + idxUnit(506, s.i * 31 + step, s.j * 7 + sign, seed) * 10;
        x += tx * d;
        z += tz * d;
        // Back onto the crest: the best curvature within 28 m either side across the line.
        const nx = -tz;
        const nz = tx;
        let best = -Infinity;
        let bo = 0;
        for (let o = -28; o <= 28; o += 14) {
          const cv = bil(C, x + nx * o, z + nz * o) - Math.abs(o) * 0.01;
          if (cv > best) { best = cv; bo = o; }
        }
        x += nx * bo;
        z += nz * bo;
        const r = radius(x, z);
        if (r < P.r0 || r > P.r1 || best < 0.55 * P.cMin || !dryAt(x, z)) break;
        const roll = idxUnit(507, s.i * 53 + step, s.j * 11 + sign, seed);
        if (roll < 0.2) continue; // a gap
        if (roll < 0.26) { lastOut = 2; continue; }
        if (lastOut > 0) { lastOut -= 1; continue; }
        pts.push({ x: x + nx * (idxUnit(508, step, s.i + s.j, seed) - 0.5) * 8, z: z + nz * (idxUnit(509, step, s.i - s.j, seed) - 0.5) * 8 });
      }
    };
    pts.push({ x: s.x, z: s.z });
    walk(1, Math.ceil(want / 2));
    walk(-1, want);
    if (pts.length < 4) continue;
    trees.stats.lines += 1;
    id += 1000;
    for (let k = 0; k < pts.length; k += 1) {
      plant(pts[k].x, pts[k].z, 0.8 + idxUnit(510, k, id, seed) * 0.3, idxUnit(511, k, id, seed), 'crest', 2000 + trees.stats.lines);
    }
  }

  // Groups: three to eight trees on a jittered spiral 5 to 14 m out, on a spur (a lesser crest) or in a gully (a hollow).
  const groups = (list, which) => {
    for (const s of list) {
      if (trees.length >= cap) break;
      if (idxUnit(512, s.i, s.j, seed) > (which === 'gully' ? 0.85 : 0.95)) continue;
      if (crowded(s.x, s.z, 48) || !dryAt(s.x, s.z)) continue;
      const n = 3 + Math.floor(idxUnit(513, s.i, s.j, seed) * 6);
      const gid = 4000 + trees.stats.groups;
      const before = trees.length;
      const was = { tris, eucalypt: trees.stats.eucalypt, cypress: trees.stats.cypress };
      for (let m = 0; m < n; m += 1) {
        let x = s.x;
        let z = s.z;
        let size = 1;
        if (m > 0) {
          const ang = m * 2.39996 + (idxUnit(514, s.i * 17 + m, s.j, seed) - 0.5) * 0.8;
          const rr = 5 + 9 * Math.sqrt(m / n) * (0.85 + idxUnit(515, s.i * 17 + m, s.j, seed) * 0.3);
          x += Math.cos(ang) * rr;
          z += Math.sin(ang) * rr;
          size = 1 - 0.4 * ((rr - 5) / 9);
          if (!dryAt(x, z)) continue;
        }
        plant(x, z, Math.max(0.55, size) * (which === 'gully' ? 0.9 : 1), idxUnit(516, s.i * 17 + m, s.j, seed), which, gid);
      }
      if (trees.length - before >= 3) {
        trees.stats.groups += 1;
        if (which === 'gully') trees.stats.gullyGroups += 1; else trees.stats.spurGroups += 1;
      } else {
        // Fewer than three survived the land and budget gates: take the group back.
        trees.length = before;
        tris = was.tris;
        trees.stats.eucalypt = was.eucalypt;
        trees.stats.cypress = was.cypress;
      }
    }
  };
  groups(spurs, 'spur');
  groups(gullies, 'gully');

  // Feather band: a jittered grid of cells, a group of two to five trees in a cell with the chance `p(r)`: from `pJoin` at the
  // hinterland's tail (r 600) up to `pArc` at the arc (r 624), then down to `pOut` at r 724. Land only (dryAt), not on a tree that
  // stands already; the venue keep-outs and the occupancy grid are applied in `_buildHinterland` like the rest of the list.
  const F = P.feather;
  cap = P.maxTrees;
  const fcap = trees.length + F.max;
  const pAt = (r) => (r < F.arc
    ? F.pJoin + (F.pArc - F.pJoin) * smoothstep(F.r0, F.arc, r)
    : F.pArc + (F.pOut - F.pArc) * smoothstep(F.arc, F.r1, r));
  const cells = [];
  const nf = Math.ceil(F.r1 / F.pitch) + 1;
  for (let j = -nf; j <= nf; j += 1) for (let i = -nf; i <= nf; i += 1) {
    const x = cx + (i + 0.5 + (idxUnit(520, i, j, seed) - 0.5) * 0.9) * F.pitch;
    const z = cz + (j + 0.5 + (idxUnit(521, i, j, seed) - 0.5) * 0.9) * F.pitch;
    const r = radius(x, z);
    if (r < F.r0 || r > F.r1 || idxUnit(522, i, j, seed) >= pAt(r)) continue;
    cells.push({ x, z, r, i, j });
  }
  cells.sort(byRadius);
  const apart = (x, z, d) => { for (const t of trees) if (Math.abs(t.x - x) < d && Math.abs(t.z - z) < d && Math.hypot(t.x - x, t.z - z) < d) return false; return true; };
  trees.stats.featherSites = cells.length;
  const beforeF = trees.length;
  for (const s of cells) {
    if (trees.length >= fcap) break;
    if (!dryAt(s.x, s.z) || !apart(s.x, s.z, 16)) continue;
    const n = 2 + Math.floor(idxUnit(523, s.i, s.j, seed) * 4);
    const gid = 6000 + trees.stats.groups;
    const was = { n: trees.length, tris, eucalypt: trees.stats.eucalypt, cypress: trees.stats.cypress };
    for (let m = 0; m < n; m += 1) {
      let x = s.x;
      let z = s.z;
      if (m > 0) {
        const ang = m * 2.39996 + (idxUnit(524, s.i * 17 + m, s.j, seed) - 0.5) * 0.9;
        const rr = 7 + 9 * Math.sqrt(m / n) * (0.8 + idxUnit(525, s.i * 17 + m, s.j, seed) * 0.4);
        x += Math.cos(ang) * rr;
        z += Math.sin(ang) * rr;
        if (!dryAt(x, z) || !apart(x, z, 7)) continue;
      }
      plant(x, z, 0.72 + idxUnit(526, s.i * 17 + m, s.j, seed) * 0.34, idxUnit(527, s.i * 17 + m, s.j, seed), 'feather', gid);
    }
    if (trees.length - was.n >= 2) { trees.stats.groups += 1; trees.stats.featherGroups = (trees.stats.featherGroups ?? 0) + 1; } else {
      trees.length = was.n; tris = was.tris; trees.stats.eucalypt = was.eucalypt; trees.stats.cypress = was.cypress;
    }
  }
  trees.stats.feather = trees.length - beforeF;
  trees.stats.tris = tris;
  return trees;
}

/**
 * taste W34 (BROW_PARCEL): the rim brow follows paddock edges. A picture for the owner to choose by, not a new default: 0 (the default)
 * is today's brow, a bank on a circle at `HINTERLAND.browR` with a smooth radial wander; 1 lays the same hedgerow-form bank along the
 * paddock boundaries that lie within `bandM` of that radius, joined into one path per connected stretch of them (the path that keeps
 * closest to the radius, so a boundary that runs outward is left to the paddock and the brow turns along the next), stations every
 * `stepM`, broken where the ground is water as before, the gateways at tracks, roads and venue paths made by the builder as before. The
 * ridge in the height field is untouched and so is every other placement. Browser: `?browParcel=1`; node: `DD_BROW_PARCEL=1`.
 */
export const BROW_PARCEL = {
  on: (typeof process !== 'undefined' && process?.env?.DD_BROW_PARCEL !== undefined)
    ? (Number(process.env.DD_BROW_PARCEL) > 0 ? 1 : 0)
    : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('browParcel') === '1') ? 1 : 0),
  bandM: 40, stepM: 12, minStations: 4,
  /** Cost of a metre of boundary is 1 + radialK x (its offset from the radius / bandM): the path hugs the radius without leaving the edges. */
  radialK: 3,
  /** A path end is trimmed back while it stands further than this share of the band from the radius (a stub that runs outward). */
  trimShare: 0.6,
};

/**
 * Chains of brow stations ({ x, z, yaw, len, hue }, the shape the circle gives) along `bounds` (paddock boundary samples with their
 * `start` and `end`) within BROW_PARCEL.bandM of `R`. Samples on water (`isGround` false) are not used, so a run ends there.
 */
function parcelBrowChains(bounds, cx, cz, R, isGround, seed) {
  const P = BROW_PARCEL;
  const nodes = new Map();
  const node = (p) => {
    const key = `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)}`;
    let n = nodes.get(key);
    if (!n) { n = { x: p[0], z: p[1], adj: [], comp: -1 }; nodes.set(key, n); }
    return n;
  };
  const dev = (x, z) => Math.abs(Math.hypot(x - cx, z - cz) - R);
  for (const b of bounds) {
    if (dev(b.x, b.z) > P.bandM || !isGround(b.x, b.z)) continue;
    const a = node(b.start);
    const c = node(b.end);
    if (a === c) continue;
    const len = Math.hypot(c.x - a.x, c.z - a.z);
    const w = len * (1 + P.radialK * dev(b.x, b.z) / P.bandM);
    a.adj.push({ to: c, w });
    c.adj.push({ to: a, w });
  }
  const all = [...nodes.values()];
  // Angle from the middle of the widest stretch with no boundary in the band (the sea), so a stretch never wraps through zero.
  const angs = all.map((n) => ((Math.atan2(n.x - cx, n.z - cz) % TAU) + TAU) % TAU).sort((p, q) => p - q);
  let a0 = 0;
  let widest = -1;
  for (let i = 0; i < angs.length; i += 1) {
    const gap = (i + 1 < angs.length ? angs[i + 1] : angs[0] + TAU) - angs[i];
    if (gap > widest) { widest = gap; a0 = i + 1 < angs.length ? angs[i + 1] : angs[0]; }
  }
  for (const n of all) n.u = ((((Math.atan2(n.x - cx, n.z - cz) - a0) % TAU) + TAU) % TAU);
  const chains = [];
  let comp = 0;
  let hueIx = 0;
  for (const seedNode of all) {
    if (seedNode.comp >= 0) continue;
    const members = [seedNode];
    seedNode.comp = comp;
    for (let i = 0; i < members.length; i += 1) {
      for (const e of members[i].adj) if (e.to.comp < 0) { e.to.comp = comp; members.push(e.to); }
    }
    comp += 1;
    let lo = members[0];
    let hi = members[0];
    for (const n of members) { if (n.u < lo.u) lo = n; if (n.u > hi.u) hi = n; }
    // Dijkstra from the first node round to the last (a component is small, so a scan for the next node is enough).
    for (const n of members) { n.d = Infinity; n.prev = null; n.done = false; }
    lo.d = 0;
    for (;;) {
      let cur = null;
      for (const n of members) if (!n.done && n.d < Infinity && (!cur || n.d < cur.d)) cur = n;
      if (!cur || cur === hi) break;
      cur.done = true;
      for (const e of cur.adj) if (cur.d + e.w < e.to.d) { e.to.d = cur.d + e.w; e.to.prev = cur; }
    }
    if (hi.d === Infinity) continue;
    const path = [];
    for (let n = hi; n; n = n.prev) path.push(n);
    path.reverse();
    const stubM = P.bandM * P.trimShare;
    while (path.length > 2 && dev(path[0].x, path[0].z) > stubM) path.shift();
    while (path.length > 2 && dev(path[path.length - 1].x, path[path.length - 1].z) > stubM) path.pop();
    const cum = [0];
    for (let i = 1; i < path.length; i += 1) cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
    const total = cum[cum.length - 1];
    const count = Math.round(total / P.stepM);
    if (count < P.minStations) continue;
    const stepLen = total / count;
    let run = [];
    const flush = () => {
      if (run.length >= P.minStations) chains.push(run);
      run = [];
    };
    let seg = 0;
    for (let k = 0; k < count; k += 1) {
      const s = (k + 0.5) * stepLen;
      while (seg < path.length - 2 && cum[seg + 1] < s) seg += 1;
      const p = path[seg];
      const q = path[seg + 1];
      const f = (s - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]);
      const x = p.x + (q.x - p.x) * f;
      const z = p.z + (q.z - p.z) * f;
      hueIx += 1;
      if (!isGround(x, z)) { flush(); continue; }
      run.push({ x, z, yaw: Math.atan2(q.x - p.x, q.z - p.z), len: stepLen, hue: idxUnit(267, hueIx, 0, seed) });
    }
    flush();
  }
  return chains;
}

/**
 * Hedgerows, shelterbelts, dams, sheds and bales, all keyed off the
 * paddock boundaries so the furniture and the tint agree. Nothing here is
 * transparent and nothing here is a clone array at even pitch: every run is
 * broken by seeded gaps and every instance carries its own scale and heading.
 */
function hinterlandPlacements(city, roles, seed, tier, crust) {
  const { extent } = city;
  const empty = {
    fields: [], hedges: [], belts: [], dams: [], damTiers: [0, 0], sheds: [], bales: [],
    scatter: [], scrub: [], windrows: [], fences: [], walls: [], reeds: [], windbreaks: [],
    copses: [], stock: [], rimWoods: [], rimBrow: [], fenceRest: [],
  };
  if (tier === 'low') return empty;
  const medium = tier === 'medium';
  const fenceRest = [];
  const bounds = hinterlandBoundaries(extent, crust, seed, FENCE_EDGES.on ? fenceRest : null);
  const ground = (x, z) => hinterlandGroundAt(x, z, extent, crust, seed);
  const hedges = [];
  const fences = [];
  const walls = [];
  const belts = [];
  const windbreaks = [];
  const step = HINTERLAND.boundaryStep;
  const hedgeCap = medium ? 460 : 1000;
  const beltCap = medium ? 330 : 840;
  const hillsAz = edgeOutAzimuth(roles.hillsEdge);
  const inlandAz = edgeOutAzimuth(roles.inlandEdge);
  let cornerDelta = inlandAz - hillsAz;
  while (cornerDelta > Math.PI) cornerDelta -= TAU;
  while (cornerDelta < -Math.PI) cornerDelta += TAU;
  // Slightly hills-ward of the bisector: this is the open agricultural corner,
  // while the exact bisector carries the Falls seat on the seed-0 layout.
  const receiptAz = hillsAz + cornerDelta * 0.38;
  for (let n = 0; n < bounds.length; n += 1) {
    const b = bounds[n];
    const g = idxUnit(30 + b.dir, b.gx, b.gz, seed);
    /**
     * ── PER-RUN ROLLS, NOT PER-SAMPLE ──
     *
     * `t` decides hedge-versus-fence and `beltRoll` decides windbreak-or-not,
     * and both were drawn from (gx, gz) — which varies ALONG a run. So a
     * boundary of eight contiguous 8 m samples had each member independently
     * kept with p = 0.55, and the run came out as two or three stubs with gaps
     * between them. Measured after the size change and before this fix: mean
     * hedge strip 3.06 segments, i.e. 24 m. That is the same fault the gap roll
     * had and the file already documents one screen above — fixed there for
     * gaps, left in place for the kind choice.
     *
     * The run key is the run's own identity: the constant index across the run
     * (gx for a run found stepping in +x, gz otherwise) and the index of its
     * FIRST member, which `runLengthOf` gives as `idx − runPos`. Every sample in
     * one run therefore draws the same number, and a run is a hedge or a fence
     * as a whole. Neighbouring runs on the same column still differ.
     */
    const runKeyA = b.dir === 0 ? b.gx : b.gz;
    const runKeyB = (b.dir === 0 ? b.gz : b.gx) - (b.runPos ?? 0);
    const t = idxUnit(32 + b.dir, runKeyA, runKeyB, seed);
    const s = idxUnit(34 + b.dir, b.gx, b.gz, seed);
    // A hedge is a LINE. Anything shorter than three segments (~24 m) is a lone
    // prism on open grass and reads as a log, not as a boundary — see
    // `runLengthOf`. Short runs become fenceline instead, which is what a short
    // stretch of boundary actually carries, and which reads correctly at any
    // length because a fence is posts by nature.
    // Measured: 1462 of 1535 boundary samples already sit on runs of 3 or more,
    // so isolation was not what fragmented the r1 hedges — the gap roll was. It
    // applied to EVERY sample, so a run of eight lost ~20% of its members at
    // random interior positions and broke into one- and two-segment pieces.
    // Gaps are now interior-only, on runs of six or more, at 12%.
    const far = Math.hypot(b.x - extent.x * 0.5, b.z - extent.z * 0.5) > 420;
    // Out past 420 m a hedge is under ~40 px. Only long, legible boundaries earn
    // one there; short ones become fenceline, which reads correctly at any length.
    // T6B: 5/7 -> 6/8 segments. "Fewer and longer" — a five-segment run is 40 m,
    // which at the board-wide pose is 150 px of hedge carrying two end caps; a
    // six-segment floor drops the stubbiest tenth of the population into
    // fenceline and lengthens the mean strip without emptying the near ring.
    // TASTE R1: 6 -> 3 inside r 420. The coast cuts the boundary runs of the
    // south-east and east paddocks short, so a floor of six turned every one of
    // them into fenceline and left that side of the ring with a tenth of the
    // hedgerow the west carries (measured within 120 m of the dam: 33 m of hedge
    // against 263 m west of the airport). Three segments is 24 m, still a line.
    const shortRun = (b.run ?? 1) < (far ? 8 : 3);
    const canGap = (b.run ?? 1) >= 6 && b.runPos > 0 && b.runPos < (b.run - 1);
    const yaw = b.yaw;
    const y = ground(b.x, b.z);
    const rr0 = Math.hypot(b.x - extent.x * 0.5, b.z - extent.z * 0.5);
    if (b.gap) {
      // Interior gateway: a short posts-and-wire run, not a hole in the country.
      if (rr0 < 400 && fences.length < (medium ? 220 : 480)) {
        fences.push({
          x: b.x, z: b.z, y, yaw, len: step * 1.05, height: TASTE_SCALE.fence.height, width: 0.22,
        });
      }
      continue;
    }
    // taste-r1 (W32, COAST_FAR): a hedge ends 6 m or more landward of the rim's brow (the rim field, far, at its centre and both ends): the
    // planner's own gates read waterness (0.20 mask, the `dry` term) and never the rim, so hedges stood 1 and 6.5 m seaward of the brow.
    const hedgeInland = !COAST_FAR.on || [0, -0.5, 0.5].every((k) => {
      const q = coastRimAt(b.x + Math.sin(yaw) * b.len * k, b.z + Math.cos(yaw) * b.len * k, extent, crust, undefined, true);
      return !q.valid || q.qm <= -6;
    });
    if (!shortRun && t < 0.55 && hedgeInland && hedges.length < hedgeCap) {
      hedges.push({
        x: b.x,
        z: b.z,
        y,
        yaw,
        len: b.len * 1.02,
        // ── HEDGE SIZE: 0.6 x 0.5 m CANNOT HAVE VOLUME AT THESE POSES ──
        //
        // The T5/T6B brief carries "0.6 m wide, 0.5 m tall merged strips" and
        // "with VOLUME and a shadow side, not lines" in one sentence, and at
        // this ring's viewing distance those two halves contradict each other.
        // The arithmetic, at fov 32 over a 1000 px frame:
        //
        //   shroud-void  dist 300  ->  172.1 m of world height  ->  5.81 px/m
        //   board-wide   dist 470  ->  269.6 m                  ->  3.71 px/m
        //
        // A vertical face at polar 30 projects at cos(30) = 0.866 of its height.
        // So 0.6 x 0.5 m renders 3.5 x 2.5 px at shroud-void and 2.2 x 1.6 px at
        // board-wide. A 2 px mark has no lit face, no shade face and no cast
        // shadow: it is a line, which is the thing the same sentence forbids,
        // and it is what six plates have been reading as "thin dark lines" on
        // the paddock boundaries.
        //
        // 1.7 x 1.9 m is an ordinary farm hedgerow (a stock hedge is laid at
        // 1.5-2.5 m) and renders 9.9 x 9.6 px / 6.3 x 6.1 px. That carries the
        // two-tone strip `makeMergedBankGeometry` already builds and a real
        // shadow on the ground beside it. Reported as a deliberate departure
        // from the brief's figure rather than approximated to fit it; the
        // p15-terrain pin moves with it and carries the same arithmetic.
        //
        // P16 T9: the height comes down 1.9 -> 1.8 to land inside that brief's
        // stated 1.2-1.8 m band. It is the TOP of the band and not the middle,
        // and the reason is the arithmetic above: at 1.5 m the strip renders
        // 4.8 px at board-wide, under the 5 px floor where a mark stops having a
        // lit face and a shade face; 1.8 m renders 5.78 px and keeps it. The
        // ridge jitter comes 0.34 -> 0.30 with it so the run's peak stays inside
        // the same envelope it had.
        height: HEDGE_SECTION.height,
        // Stable clipped end section; T13C's swelling is retained between joins.
        width: HEDGE_SECTION.width,
        interiorWidth: b.width,
        hue: idxUnit(36 + b.dir, b.gx, b.gz, seed),
        dir: b.dir,
        gx: b.gx,
        gz: b.gz,
      });
    } else if ((shortRun || t >= 0.55) && rr0 < 410 && fences.length < (medium ? 220 : 480)) {
      fences.push({
        x: b.x, z: b.z, y, yaw, len: step * 1.08, height: TASTE_SCALE.fence.height, width: 0.20,
      });
    }
    // Dry-stone walls: hills-side rough grazing, thicker than a fence so they
    // read at the graded pose where a 0.08 m rail cannot.
    const seaH = seawardOf(b.x, b.z, extent, roles.hillsEdge);
    if (seaH > 36 && seaH < 260 && (b.kind === 4 || b.kind === 0)
      && idxUnit(37 + b.dir, b.gx, b.gz, seed) < 0.24
      && walls.length < (medium ? 40 : 90)) {
      walls.push({
        x: b.x, z: b.z, y, yaw, len: step * 1.12, height: 0.92 + s * 0.28, width: 0.55,
      });
    }
    // Shelterbelts: trees along a minority of the boundaries, and a dense
    // stand across the brow so the ring terminates in planting rather than in
    // an edge. Both drawn from the same four archetypes as the ring trees, so
    // they cost draw calls of zero.
    const cx = extent.x * 0.5;
    const cz = extent.z * 0.5;
    const r = Math.hypot(b.x - cx, b.z - cz);
    const onBrow = Math.abs(r - HINTERLAND.browR) < HINTERLAND.browWidth * 0.85;
    // Per-run for the same reason as `t`: a windbreak is a ROW, and a row that
    // is diced per 8 m sample is a scatter of three-segment stubs.
    const beltRoll = idxUnit(38 + b.dir, runKeyA, runKeyB, seed);
    if (onBrow && belts.length < beltCap && beltRoll < 0.62) {
      const jx = (idxUnit(40 + b.dir, b.gx, b.gz, seed) - 0.5) * step * 0.8;
      const jz = (idxUnit(42 + b.dir, b.gx, b.gz, seed) - 0.5) * step * 0.8;
      const bx = b.x + jx;
      const bz = b.z + jz;
      const k = idxUnit(44 + b.dir, b.gx, b.gz, seed);
      belts.push({
        x: bx,
        z: bz,
        y: ground(bx, bz),
        scale: 7.5 + k * 5.5,
        yaw: idxUnit(46 + b.dir, b.gx, b.gz, seed) * TAU,
        hue: idxUnit(48 + b.dir, b.gx, b.gz, seed),
        kind: Math.min(4, Math.floor(idxUnit(50 + b.dir, b.gx, b.gz, seed) * 5)),
        role: 'belt',
      });
    } else if (!onBrow && windbreaks.length < beltCap && beltRoll < 0.24
      && (b.run ?? 1) >= 6) {
      // 0.18 -> 0.24 of boundaries, but only on runs of six or more: more
      // windbreak, in fewer and longer rows. A tree row that stops after three
      // segments is a copse wearing a row's name.
      /**
       * ── A MERGED PRISM CANNOT BE A TREE ROW, AND THE PLATE SAID SO ──
       *
       * The first T6B pass took the strip to 4.4 x 6.4 m on the argument that a
       * windbreak needs a crown's width and a crown's worth of ridge jitter. At
       * the shroud-void pose's near field that produced a smooth green worm
       * lying across open ground — one continuous extruded ridge, no crowns,
       * clearly not planting. Magnified before asserting anything: crop
       * `plates/T6B-wip/_x-t6b-brc.png`.
       *
       * A row of trees is trees. So the strip drops back to shelter-belt scale
       * (2.6 x 3.4 m, an understorey bank of scrub under the row) and the ROW
       * itself is pushed into `belts`, which are the same four instanced tree
       * archetypes the copses and the brow already use and therefore cost no
       * extra draw call. Every second 8 m sample carries a tree, which is a
       * real windbreak spacing.
       */
      windbreaks.push({
        x: b.x,
        z: b.z,
        y,
        yaw,
        len: step * 1.15,
        height: 3.4,
        width: 2.6,
        hue: idxUnit(48 + b.dir, b.gx, b.gz, seed),
        dir: b.dir,
        gx: b.gx,
        gz: b.gz,
      });
      if ((b.runPos ?? 0) % 2 === 0 && belts.length < beltCap) {
        const kx = (idxUnit(52 + b.dir, b.gx, b.gz, seed) - 0.5) * 2.2;
        const kz = (idxUnit(54 + b.dir, b.gx, b.gz, seed) - 0.5) * 2.2;
        const tx = b.x + kx;
        const tz = b.z + kz;
        belts.push({
          x: tx,
          z: tz,
          y: ground(tx, tz),
          scale: 6.4 + idxUnit(56 + b.dir, b.gx, b.gz, seed) * 3.6,
          yaw: idxUnit(58 + b.dir, b.gx, b.gz, seed) * TAU,
          hue: idxUnit(60 + b.dir, b.gx, b.gz, seed),
          kind: Math.min(3, Math.floor(idxUnit(62 + b.dir, b.gx, b.gz, seed) * 4)),
          role: 'windbreak',
        });
      }
    }
  }

  /**
   * One long receipt line in the hills–inland corner. Random per-field rolls
   * left the shroud pose's only readable paddock with its nearest windbreak on
   * the bottom row of pixels and no hedge beyond it. The corner comes from the
   * role map, so water-edge rotation rotates the line with the landscape.
  */
  const receiptRun = (radius, az, family) => {
    // The windbreak follows the narrow open wedge radially; the hedge crosses
    // it as a field division. Using one tangent for both left one tree at the
    // seat-clearance pinch instead of a row.
    const yaw = family === 'windbreak' ? az : az + Math.PI * 0.5;
    const out = [];
    for (let k = -4; k <= 4; k += 1) {
      const along = k * step;
      const x = extent.x * 0.5 + Math.sin(az) * radius + Math.sin(yaw) * along;
      const z = extent.z * 0.5 + Math.cos(az) * radius + Math.cos(yaw) * along;
      const y = ground(x, z);
      const hue = idxUnit(310 + family.length, k, Math.round(radius), seed);
      if (family === 'hedge') {
        hedges.push({
          x, z, y, yaw, len: step * 1.26, height: HEDGE_SECTION.height,
          width: HEDGE_SECTION.width, hue, role: 'hills-inland-receipt',
        });
      } else {
        windbreaks.push({
          x, z, y, yaw, len: step * 1.20, height: 3.4, width: 2.6,
          hue, role: 'hills-inland-receipt',
        });
        if (k % 2 === 0 && belts.length < beltCap) {
          belts.push({
            x, z, y, scale: 6.8 + hue * 3.4, yaw: idxUnit(316, k, 0, seed) * TAU,
            hue, kind: Math.min(3, Math.floor(idxUnit(317, k, 0, seed) * 4)),
            role: 'windbreak', receipt: 'hills-inland',
          });
        }
      }
      out.push({ x, z });
    }
    return out;
  };
  // In-field scatter. Boundaries alone leave the paddock INTERIORS empty, and the
  // interiors are most of the frame: measured on the r0 poses, boundary-only
  // dressing left 43.1% of the shroud-void frame and 98.8% of the transport
  // frame as bare ground, against gate 5's ~25% failure line. Isolated paddock
  // trees and scrub clumps are what actually occupies open grazing country, and
  // the trees ride the four archetypes that are already instanced, so they cost
  // no extra draw call.
  const scatter = [];
  const plantedCorners = new Set();
  let treeRun = -1, travelled = 0, nextTree = 0;
  // Parcel albedo reaches dry worked land that the old placement ramp excludes.
  // Follow that actual drawn owner; retain its seat/water guards and live occupancy.
  const plantingBounds = workedParcelBoundaries(extent, seed).map((b) => ({
    ...b, mask: workedGroundAt(b.x, b.z, extent, crust, null),
  }));
  for (const b of plantingBounds) {
    if (treeRun !== b.gx) {
      treeRun = b.gx; travelled = 0;
      nextTree = 25 + workedHash(b.gx, 81, seed) * 35;
    }
    travelled += b.len;
    if (b.mask < 0.40) continue;
    const corner = b.runPos === 0 || b.runPos === b.run - 1;
    const anchor = b.runPos === 0 ? b.start : b.end;
    const key = anchor ? `${Math.round(anchor[0])}:${Math.round(anchor[1])}` : '';
    const clump = corner && anchor && !plantedCorners.has(key);
    if (!clump && travelled < nextTree) continue;
    if (corner && !clump) continue;
    if (clump) plantedCorners.add(key);
    else nextTree = travelled + 25 + workedHash(b.gx, b.gz + 91, seed) * 35;
    const count = clump ? 2 + Math.floor(workedHash(b.gx, b.gz + 17, seed) * 4) : 1;
    for (let j = 0; j < count; j += 1) {
      const theta = workedHash(b.gx + j, b.gz + 11, seed) * TAU;
      const radius = clump ? 1.5 + workedHash(b.gx + j, b.gz + 29, seed) * 4 : 0;
      const x = (clump ? anchor[0] : b.x) + Math.cos(theta) * radius;
      const z = (clump ? anchor[1] : b.z) + Math.sin(theta) * radius;
      if (!workedGroundAt(x, z, extent, crust, null)) continue;
      scatter.push({ x, z, y: ground(x, z),
        scale: 5.0 + workedHash(b.gx + j, b.gz, seed) * 3.0,
        yaw: theta, hue: 0.3, kind: b.gx % 2,
        species: b.gx % 2 ? 'plane' : 'eucalypt', role: 'parcel-hedgerow',
        parcelClump: clump, clumpSize: count });
    }
  }
  const scrub = [];
  // Caps raised with the near pass. They were global, so adding a near lattice
  // under a fixed cap moved dressing inward rather than adding it: object pixels
  // -68% at x1200-1600 y600-900 against +941% in the strip, net -8%.
  const scatterCap = medium ? 660 : 1520;
  const scrubCap = medium ? 380 : 880;
  // Two lattices. The 21 m pass covers the whole ring; a 12 m pass covers only
  // the near ring, where the plate resolves at 7-9 px/m and a 62 x 72 m strip of
  // the most legible ground in the frame was coming out with two objects on it
  // because eleven lattice cells is not enough dice. Density where it resolves.
  const PITCH_LIST = [{ pitch: 21, maxR: Infinity, gain: 1 }, { pitch: 12, maxR: 380, gain: 0.85 }];
  const PITCH_M = 21;
  const cxS = extent.x * 0.5;
  const czS = extent.z * 0.5;
  for (let pass = 0; pass < PITCH_LIST.length; pass += 1) {
  const { pitch: PITCH, maxR, gain } = PITCH_LIST[pass];
  const salt = pass * 40;
  const reach = Math.ceil((Math.min(HINTERLAND.outer, maxR) - 20) / PITCH);
  for (let gi = -reach; gi <= reach; gi += 1) {
    for (let gj = -reach; gj <= reach; gj += 1) {
      if (scatter.length >= scatterCap && scrub.length >= scrubCap) break;
      const jx = (idxUnit(100 + salt, gi, gj, seed) - 0.5) * PITCH * 0.92;
      const jz = (idxUnit(101 + salt, gi, gj, seed) - 0.5) * PITCH * 0.92;
      const x = cxS + gi * PITCH + jx;
      const z = czS + gj * PITCH + jz;
      if (Math.hypot(x - cxS, z - czS) > maxR) continue;
      const mask = hinterlandMaskAt(x, z, extent, crust);
      if (mask < 0.30) continue;
      const roll = idxUnit(102 + salt, gi, gj, seed);
      // Density follows the paddock: grazing country carries scattered trees,
      // cropped and ploughed ground is cleared. That keeps the scatter reading
      // as land use rather than as an even sprinkle.
      // Density follows the SUB-field. The fields a viewer can actually see the
      // edges of are the ones hedges stand on, and those are the sub-lattice's;
      // the tint varies more slowly across them. Keying density to the 110 m tint
      // cell instead made the whole near strip inherit one land use and cost it
      // 45% of its object pixels in a single seed — a lottery, not a design.
      const sub = paddockSubAt(x, z, seed, extent);
      const kind = paddockKind(sub.ix, sub.iz, seed);
      // Raised to recover the ~350 objects removed with the fence archetype and
      // the sub-5 m hedge stubs. Both replacements resolve at this distance
      // where neither of those did: a tree is 20-80 px, a scrub clump 8-19 px.
      // Density graded by distance, because resolution is graded by distance.
      // Measured on the shroud-void plate: the bottom-middle block sits 211-263 m
      // out and resolves at 7.1-8.9 px/m, where a 6 m tree is ~48 px and reads
      // properly — and it held six objects across 84 x 76 m of ground. The far
      // ring resolves at half that, where the same object is a speck. So put the
      // objects where they can be seen. It is also true of real country: planting
      // thickens toward the settled edge.
      const rr = Math.hypot(x - cxS, z - czS);
      // 1.15 -> 1.45, and the second lattice's gain 0.45 -> 0.62. Both are ADDS,
      // not moves: `scatterCap`/`scrubCap` were raised to 1520/880 last round and
      // the build lands at 863/141, so nothing here is competing for a cap and a
      // rate rise cannot pull an object in from the far ring the way it did at r7.
      const near = 1 + 2.0 * (1 - smoothstep(190, 490, rr));
      // Cropland was authored almost treeless, which is agriculturally right and
      // visually wrong: the near strip at (975,735)-(1475,1000) is 77% ploughed
      // and 23% stubble, and it came out with ZERO objects in the most legible
      // ground in the frame. Australian cropped paddocks keep remnant trees; the
      // rates for kinds 1 and 3 are raised to reflect that rather than to fill a
      // metric.
      // Rates raised across the ring rather than only near the board, because
      // this is the one lever here that cannot MOVE an object: the caps are
      // 1520/880 and the build lands well under both, so every extra draw is an
      // add. Scrub was the emptiest class at 134 of an 880 cap and reads at
      // 8-19 px, which is furniture at this distance where a bale is not.
      const treeChance = [0.63, 0.34, 0.38, 0.25, 0.72, 0.40][kind] * mask * near * gain;
      const scrubChance = [0.35, 0.15, 0.27, 0.12, 0.60, 0.22][kind] * mask * near * gain;
      if (roll < treeChance && scatter.length < scatterCap) {
        const k = idxUnit(103 + salt, gi, gj, seed);
        scatter.push({
          x,
          z,
          y: ground(x, z),
          scale: 3.4 + k * 5.6,
          yaw: idxUnit(104 + salt, gi, gj, seed) * TAU,
          hue: idxUnit(105 + salt, gi, gj, seed),
          kind: Math.min(4, Math.floor(idxUnit(106 + salt, gi, gj, seed) * 5)),
          role: 'scatter',
          species: ['eucalypt', 'plane', 'jacaranda', 'bottlebrush'][
            Math.min(3, Math.floor(idxUnit(106 + salt, gi, gj, seed) * 4))
          ],
        });
      } else if (roll < treeChance + scrubChance && scrub.length < scrubCap) {
        const k = idxUnit(107 + salt, gi, gj, seed);
        // Gate on the clump's own extent, not its centre: a 4 m scrub whose
        // middle is dry can still put an end in the creek, and one did.
        const yawS = idxUnit(108 + salt, gi, gj, seed) * TAU;
        const reach = (2.2 + k * 2.0) * 0.5 + 1.0;
        if (hinterlandMaskAt(x + Math.sin(yawS) * reach, z + Math.cos(yawS) * reach, extent, crust) < 0.30
          || hinterlandMaskAt(x - Math.sin(yawS) * reach, z - Math.cos(yawS) * reach, extent, crust) < 0.30) continue;
        scrub.push({
          x,
          z,
          y: ground(x, z),
          yaw: idxUnit(108 + salt, gi, gj, seed) * TAU,
          // Plan aspect near 1: a clump reads as a bush, a 6 m x 2 m prism
          // reads as another dark bar on the grass. Measured at 19 x 8 px in
          // the r2 window, which was the wrong shape for what it is.
          len: 2.2 + k * 2.0,
          height: 0.85 + k * 0.95,
          width: 2.0 + idxUnit(109 + salt, gi, gj, seed) * 2.0,
          hue: idxUnit(110 + salt, gi, gj, seed),
        });
      }
    }
  }
  }

  // Seat clearance makes the mathematically exact corner bisector a poor place
  // to force a line. Snap each receipt radius to the nearest already-approved
  // scatter site, then run tangent through that known-open patch.
  const openReceiptAnchor = (radius, az, reject = null) => {
    const tx = extent.x * 0.5 + Math.sin(az) * radius;
    const tz = extent.z * 0.5 + Math.cos(az) * radius;
    const candidates = scatter.filter((p) => p.role === 'scatter'
      && (!reject || Math.hypot(p.x - reject.x, p.z - reject.z) > 52));
    candidates.sort((a, b) => Math.hypot(a.x - tx, a.z - tz) - Math.hypot(b.x - tx, b.z - tz));
    return candidates[0] ?? null;
  };
  const hedgeAnchor = openReceiptAnchor(330, receiptAz - 0.07);
  if (hedgeAnchor && hedges.length < hedgeCap - 9) {
    receiptRun(
      Math.hypot(hedgeAnchor.x - cxS, hedgeAnchor.z - czS),
      Math.atan2(hedgeAnchor.x - cxS, hedgeAnchor.z - czS),
      'hedge',
    );
  }
  if (hedges.filter((h) => h.role === 'hills-inland-receipt').length < 4) {
    receiptRun(330, receiptAz - 0.07, 'hedge');
  }
  // A field-corner junction is intentional here: the windbreak runs radial
  // through the tangent hedge, leaving the dam's outer field unobstructed.
  const windAnchor = hedgeAnchor ?? openReceiptAnchor(350, receiptAz + 0.03);
  if (windAnchor && windbreaks.length < beltCap - 9) {
    receiptRun(
      Math.hypot(windAnchor.x - cxS, windAnchor.z - czS),
      Math.atan2(windAnchor.x - cxS, windAnchor.z - czS),
      'windbreak',
    );
  }

  // Windrows — cut hay lying in rows across a stubble paddock. Field INTERIORS
  // were the gap: every other archetype here keys off a boundary, so a cropped
  // paddock had furniture only round its edge. A windrow is long, low, pale and
  // parallel, which is legible at the 7-9 px/m of the near ring where a 1.9 m
  // bale is not, and it belongs to exactly the paddock kind that was emptiest.
  const windrows = [];
  const windrowCap = medium ? 90 : 210;
  {
    const seenField = new Set();
    for (let n = 0; n < bounds.length && windrows.length < windrowCap; n += 1) {
      const b = bounds[n];
      // Identity from the SUB-field, land use from the COARSE one. One-per-field
      // furniture has to count the fields a viewer can see edges around, or a
      // larger tint cell silently thins the ring; land use has to come from the
      // cell the ground is actually tinted by, or hay appears on pasture.
      const sub = paddockSubAt(b.x, b.z, seed, extent);
      const cell = sub.coarse;
      if (paddockKind(cell.ix, cell.iz, seed) !== 2) continue;
      const id = `${sub.ix}:${sub.iz}`;
      if (seenField.has(id)) continue;
      seenField.add(id);
      if (idxUnit(120, cell.ix, cell.iz, seed) > 0.80) continue;
      const yaw = idxUnit(121, cell.ix, cell.iz, seed) * Math.PI;
      const rows = 3 + Math.floor(idxUnit(122, cell.ix, cell.iz, seed) * 4);
      const gap = 13 + idxUnit(123, cell.ix, cell.iz, seed) * 9;
      const cxF = b.x + (idxUnit(124, cell.ix, cell.iz, seed) - 0.5) * HINTERLAND.paddock * 0.45;
      const czF = b.z + (idxUnit(125, cell.ix, cell.iz, seed) - 0.5) * HINTERLAND.paddock * 0.45;
      for (let k = 0; k < rows && windrows.length < windrowCap; k += 1) {
        const off = (k - (rows - 1) * 0.5) * gap;
        const wx = cxF + Math.cos(yaw) * off;
        const wz = czF - Math.sin(yaw) * off;
        if (hinterlandMaskAt(wx, wz, extent, crust) < 0.55) continue;
        const len = 22 + idxUnit(126 + k, cell.ix, cell.iz, seed) * 16;
        if (hinterlandMaskAt(wx + Math.sin(yaw) * len * 0.5, wz + Math.cos(yaw) * len * 0.5, extent, crust) < 0.40) continue;
        if (hinterlandMaskAt(wx - Math.sin(yaw) * len * 0.5, wz - Math.cos(yaw) * len * 0.5, extent, crust) < 0.40) continue;
        windrows.push({
          x: wx, z: wz, y: ground(wx, wz), yaw, len,
          height: 0.55 + idxUnit(133 + k, cell.ix, cell.iz, seed) * 0.30,
          width: 1.2 + idxUnit(140 + k, cell.ix, cell.iz, seed) * 0.6,
          hue: idxUnit(147 + k, cell.ix, cell.iz, seed),
        });
      }
    }
  }

  // Paddock-scale furniture: a farm dam, a shed, a stack of bales. Placed on
  // the paddock, not on a grid, so density is irregular by construction.
  const dams = [];
  const damTiers = [0, 0];
  const sheds = [];
  const bales = [];
  const damCap = medium ? 12 : 26;
  const shedCap = medium ? 12 : 28;
  const baleCap = medium ? 60 : 150;
  const cx = extent.x * 0.5;
  const cz = extent.z * 0.5;
  const seenPaddock = new Set();
  for (let n = 0; n < bounds.length; n += 1) {
    const b = bounds[n];
    // As with the windrows: identity and jitter from the SUB-field, land use
    // from the coarse cell the ground is tinted by.
    const sub = paddockSubAt(b.x, b.z, seed, extent);
    const cell = { ix: sub.ix, iz: sub.iz };
    const coarse = sub.coarse;
    const id = `${sub.ix}:${sub.iz}`;
    if (seenPaddock.has(id)) continue;
    seenPaddock.add(id);
    const px = b.x + (idxUnit(60, cell.ix, cell.iz, seed) - 0.5) * sub.size * 0.5;
    const pz = b.z + (idxUnit(61, cell.ix, cell.iz, seed) - 0.5) * sub.size * 0.5;
    if (hinterlandMaskAt(px, pz, extent, crust) < 0.42) continue;
    const roll = idxUnit(62, cell.ix, cell.iz, seed);
    const rr = Math.hypot(px - cx, pz - cz);
    // Dams are gated INWARD as well as away from the creek. The one dam that
    // reached the graded frame sat 523 m from the lens at 3.57 px/m — 67 px
    // across and ~1,232 px of water, against a detector calibrated on the r3/r4
    // positive at 4,090-4,400 px. Correct placement that lands three times too
    // small to find is still not in the picture.
    if (roll < 0.30 && dams.length < damCap && rr < HINTERLAND.browR - 30) {
      // A dam is a pond, and a pond next to a creek is correct — but the crust
      // widened `channelHalf` 13 -> 24 and the creek gate then deleted the only
      // dam in the frame (3,478 px at r3/r4, absent at r5) because it sat 24.1 m
      // from the centreline. Deleting an object to buy a clean keep-out number is
      // paying for the metric with the frame. So: walk the candidate outward
      // until it is clear of the crust's own channel, and only give up if no
      // offset works. The crust owns the width; this only reads it.
      let dx = px;
      let dz = pz;
      let tier = 0;
      // 22-40 m across. The old 11-22 m was small for a farm dam (Australian
      // ones commonly run 20-50 m) AND it was the reason the only one to reach a
      // graded frame carried ~1,232 px against a detector calibrated at
      // 4,090-4,400. Size was the defect, not position: gating dams inward to
      // fix it removed them from the frame altogether, which is worse.
      const damR = 11 + idxUnit(63, cell.ix, cell.iz, seed) * 9;
      // The crust publishes bed +-47.5 m, shingle bar +-64.5, levee bank +-118,
      // and its guidance: >=70 m clears water, >=120 m is flat-clear. I do not
      // copy any of those numbers — I sample its own `creekFieldAt` and add my
      // OWN margin, so the width stays the crust's to change. Measured here, the
      // field's support ends at bed +-35, bar +-53, levee +-99 at a 0.001
      // threshold, i.e. consistently ~80% of the published figures; testing a
      // ring at (damRadius + 24 m) rather than a point covers that difference
      // without either lane holding the other's constant.
      const creekFree = (qx, qz, needFlat) => {
        const probe = (ax, az) => {
          const o = Math.max(-az, az - extent.z, -ax, ax - extent.x);
          return creekFieldAt(ax, az, extent, crust, crust?.seats, o, 0);
        };
        const margin = damR + 24;
        for (let t = 0; t <= 6; t += 1) {
          const ang = (t / 6) * TAU;
          const ax = t === 0 ? qx : qx + Math.sin(ang) * margin;
          const az2 = t === 0 ? qz : qz + Math.cos(ang) * margin;
          const c = probe(ax, az2);
          if (c.thread > 0.001) return false;
          if (needFlat) { if (c.bar > 0.001 || c.valley > 0.001) return false; } else if (c.bar > 0.02) return false;
        }
        return true;
      };
      // Two tiers, preferring flat-clear. A dam on the levee slope is a
      // different defect from a dam in the water, and worth more offsets to avoid.
      for (let want = 0; want < 2 && tier === 0; want += 1) {
        const needFlat = want === 0;
        for (let k = 0; k < 12; k += 1) {
          const ang = (k / 12) * TAU + idxUnit(64, cell.ix, cell.iz, seed) * TAU;
          const reach = k === 0 ? 0 : 18 + k * 11;
          const qx = px + Math.sin(ang) * reach;
          const qz = pz + Math.cos(ang) * reach;
          if (hinterlandMaskAt(qx, qz, extent, crust) < 0.60) continue;
          if (!creekFree(qx, qz, needFlat)) continue;
          dx = qx; dz = qz; tier = needFlat ? 1 : 2; break;
        }
      }
      if (tier === 0) { seenPaddock.add(id); continue; }
      damTiers[tier - 1] += 1;
      dams.push({ x: dx, z: dz, radius: damR, tier });
    } else if (roll < 0.34 && sheds.length < shedCap) {
      sheds.push({
        x: px,
        z: pz,
        y: ground(px, pz),
        yaw: idxUnit(64, cell.ix, cell.iz, seed) * TAU,
        len: 6 + idxUnit(65, cell.ix, cell.iz, seed) * 6,
        width: 4.6 + idxUnit(66, cell.ix, cell.iz, seed) * 1.8,
        height: 3.0 + idxUnit(67, cell.ix, cell.iz, seed) * 1.4,
        tone: idxUnit(68, cell.ix, cell.iz, seed),
      });
      // W7-C: a shed has its hay beside it: 3 to 9 bales, 7 to 9 m off the long wall.
      if (bales.length < baleCap - 10) {
        const sy2 = idxUnit(64, cell.ix, cell.iz, seed) * TAU;
        const count = 3 + Math.floor(idxUnit(72, cell.ix, cell.iz, seed) * 7);
        const bx0 = px + Math.cos(sy2) * 8.0;
        const bz0 = pz - Math.sin(sy2) * 8.0;
        for (let k = 0; k < count; k += 1) {
          const bx = bx0 + Math.sin(sy2) * (Math.floor(k / 2) - (Math.ceil(count / 2) - 1) * 0.5) * 1.8 + Math.cos(sy2) * (k % 2 - 0.5) * 1.8;
          const bz = bz0 + Math.cos(sy2) * (Math.floor(k / 2) - (Math.ceil(count / 2) - 1) * 0.5) * 1.8 - Math.sin(sy2) * (k % 2 - 0.5) * 1.8;
          bales.push({ x: bx, z: bz, y: ground(bx, bz), yaw: sy2 + (idxUnit(78 + k, cell.ix, cell.iz, seed) - 0.5) * 0.2 });
        }
      }
    } else if (roll < 0.52 && bales.length < baleCap - 8
      && (paddockKind(coarse.ix, coarse.iz, seed) === 1 || paddockKind(coarse.ix, coarse.iz, seed) === 2)) {
      // Bales belong on cut crop and stubble, not on pasture. The r1 plate put
      // two isolated tan blocks on open green near the transport frame, at
      // 21-22 px — the same apparent size as the sheep an earlier critic read as
      // snow patches. A 1.9 m bale cannot be made to read at that size, so the
      // answer is to place it where it makes sense and only ever as a stack:
      // five tan lozenges in a row on stubble read as harvest, two on grass do not.
      // W7-C: groups of 3 to 9 bales of 1.5 m, two rows, 1.8 m apart; one bale is a lozenge, a stack is harvest.
      const count = 3 + Math.floor(idxUnit(69, cell.ix, cell.iz, seed) * 7);
      const yaw = idxUnit(70, cell.ix, cell.iz, seed) * TAU;
      for (let k = 0; k < count; k += 1) {
        const off = (Math.floor(k / 2) - (Math.ceil(count / 2) - 1) * 0.5) * 1.8;
        const row = (k % 2 - 0.5) * 1.8;
        const bx = px + Math.sin(yaw) * off + Math.cos(yaw) * row;
        const bz = pz + Math.cos(yaw) * off - Math.sin(yaw) * row;
        bales.push({ x: bx, z: bz, y: ground(bx, bz), yaw: yaw + (idxUnit(78 + k, cell.ix, cell.iz, seed) - 0.5) * 0.2 });
      }
    }
  }


  // Dark water and a pale-crowned access track in the same role-derived corner.
  // Probe the authored ground at the whole footprint, not merely at its centre.
  const receiptSite = (radius, azOffset, footprint) => {
    const valid = (x, z) => {
      for (let k = 0; k < 8; k += 1) {
        const a = (k / 8) * TAU;
        const qx = x + Math.sin(a) * footprint;
        const qz = z + Math.cos(a) * footprint;
        const creek = creekFieldAt(qx, qz, extent, crust, crust?.seats,
          Math.max(-qz, qz - extent.z, -qx, qx - extent.x), 0);
        if (hinterlandMaskAt(qx, qz, extent, crust) < 0.24
          || waternessAt(qx, qz, extent, crust) > 0.20
          || creek.thread > 0.002 || creek.bar > 0.10) return false;
      }
      return true;
    };
    const radial = [0, -24, 24, -48, 48];
    const angular = [0, 0.055, -0.055, 0.11, -0.11];
    for (const dr of radial) {
      for (const da of angular) {
        const az = receiptAz + azOffset + da;
        const x = cx + Math.sin(az) * (radius + dr);
        const z = cz + Math.cos(az) * (radius + dr);
        if (valid(x, z)) return { x, z, az };
      }
    }
    // If the polar ideal falls in seat clearance, walk across one of the two
    // scatter anchors that already passed the same worked-ground gate.
    for (const base of [windAnchor, hedgeAnchor]) {
      if (!base) continue;
      const az = Math.atan2(base.x - cx, base.z - cz);
      for (const off of [-28, -18, 18, 28, 0]) {
        const x = base.x + Math.cos(az) * off;
        const z = base.z - Math.sin(az) * off;
        if (valid(x, z)) return { x, z, az };
      }
    }
    return null;
  };
  if (dams.length < damCap) {
    let site = receiptSite(360, 0.03, 9);
    if (site && dams.some((d) => Math.hypot(d.x - site.x, d.z - site.z) < 70)) site = null;
    if (!site) {
      // The seasonal creek's broad valley crosses this corner. A farm dam may
      // sit on that valley, but never on the live thread: fall back to the
      // nearest high-mask field boundary and test the whole disc for water.
      const tx = cx + Math.sin(receiptAz + 0.03) * 360;
      const tz = cz + Math.cos(receiptAz + 0.03) * 360;
      const candidates = bounds.filter((b) => b.mask > 0.75
        && Math.hypot(b.x - cx, b.z - cz) < 430
        && !dams.some((d) => Math.hypot(d.x - b.x, d.z - b.z) < 70));
      candidates.sort((a, b) => Math.hypot(a.x - tx, a.z - tz) - Math.hypot(b.x - tx, b.z - tz));
      for (const b of candidates) {
        let clearWater = true;
        for (let k = 0; k < 8; k += 1) {
          const a = (k / 8) * TAU;
          const qx = b.x + Math.sin(a) * 12;
          const qz = b.z + Math.cos(a) * 12;
          const creek = creekFieldAt(qx, qz, extent, crust, crust?.seats,
            Math.max(-qz, qz - extent.z, -qx, qx - extent.x), 0);
          if (waternessAt(qx, qz, extent, crust) > 0.20 || creek.thread > 0.02) {
            clearWater = false; break;
          }
        }
        if (clearWater) { site = { x: b.x, z: b.z, az: receiptAz }; break; }
      }
    }
    if (site && !dams.some((d) => Math.hypot(d.x - site.x, d.z - site.z) < 70)) {
      const radius = 11.5 + idxUnit(320, Math.round(site.x), Math.round(site.z), seed) * 3.5;
      dams.push({ x: site.x, z: site.z, radius, tier: 1, role: 'hills-inland-receipt' });
      damTiers[0] += 1;
    }
  }
  if (sheds.length < shedCap) {
    const site = receiptSite(328, -0.08, 9);
    if (site && !sheds.some((s) => Math.hypot(s.x - site.x, s.z - site.z) < 62)) {
      sheds.push({
        x: site.x, z: site.z, y: ground(site.x, site.z), yaw: site.az + Math.PI * 0.5,
        len: 10.5, width: 6.4, height: 3.8, tone: idxUnit(321, Math.round(site.x), Math.round(site.z), seed),
        role: 'hills-inland-receipt',
      });
    }
  }

  // Copses: 3–5 mixed species, never a cone-only cluster. Kinds 0–3 now map
  // onto the foliage kit's eucalypt / plane / jacaranda / bottlebrush
  // silhouettes (low-poly stand-ins — the city kit is hundreds of tris/tree).
  /**
   * T10: 80 -> 150, and the roll below 0.18 -> 0.30.
   *
   * The measurement that drove it: on the shroud plate the 1.55 m crop-row repeat
   * moves the worked band's standard deviation by NOTHING (30.167 with the rows
   * against 30.201 with them hidden), because a 1-2 m repeat at 3-6 px/m under the
   * tilt-shift falloff averages to its own mean. What does survive that filter is
   * anything at 10-60 m — a stand of trees with a shadow, a hedgerow, a dam. So the
   * density is spent there instead.
   */
  const copseCap = medium ? 60 : 150;
  const copses = [];
  {
    const pitch = 52;
    const reach = Math.ceil((HINTERLAND.outer - 40) / pitch);
    for (let gi = -reach; gi <= reach && copses.length < copseCap; gi += 1) {
      for (let gj = -reach; gj <= reach && copses.length < copseCap; gj += 1) {
        if (idxUnit(160, gi, gj, seed) > 0.30) continue;
        const x = cx + gi * pitch + (idxUnit(161, gi, gj, seed) - 0.5) * pitch * 0.7;
        const z = cz + gj * pitch + (idxUnit(162, gi, gj, seed) - 0.5) * pitch * 0.7;
        if (hinterlandMaskAt(x, z, extent, crust) < 0.50) continue;
        const n = 3 + Math.floor(idxUnit(163, gi, gj, seed) * 3);
        const rot = Math.floor(idxUnit(164, gi, gj, seed) * 4);
        /**
         * ── A COPSE IS A STAND, NOT A RING OF TREES ROUND AN EMPTY MIDDLE ──
         *
         * Members were laid at `rad` 3.4–8.9 m on evenly divided headings, which
         * is a circle with a hole in it: at the ring's 3.7–7 px/m a five-member
         * copse came out as five separate trees with paddock showing between
         * them. A stand has a dominant tree, understorey crowded against it, and
         * one shadow. So: member 0 sits AT the centre and is the biggest, the
         * rest crowd in at 1.8–5.4 m, and the whole thing publishes one radius
         * for the shared contact patch `_plantTrees` lays under it.
         */
        let planted = 0;
        let far = 0;
        for (let k = 0; k < n; k += 1) {
          const ang = (k / n) * TAU + idxUnit(165 + k, gi, gj, seed) * 1.6;
          const rad = k === 0 ? 0 : 1.8 + idxUnit(170 + k, gi, gj, seed) * 3.6;
          const tx = x + Math.sin(ang) * rad;
          const tz = z + Math.cos(ang) * rad;
          if (hinterlandMaskAt(tx, tz, extent, crust) < 0.40) continue;
          const kind = (rot + k) % 5;
          const scale = k === 0
            ? 7.0 + idxUnit(175, gi, gj, seed) * 3.4
            : 4.0 + idxUnit(175 + k, gi, gj, seed) * 3.6;
          scatter.push({
            x: tx, z: tz, y: ground(tx, tz),
            scale,
            yaw: idxUnit(180 + k, gi, gj, seed) * TAU,
            hue: idxUnit(185 + k, gi, gj, seed),
            kind,
            species: ['eucalypt', 'plane', 'jacaranda', 'bottlebrush', 'cypress'][kind],
            role: 'copse',
          });
          planted += 1;
          far = Math.max(far, rad + scale * 0.20);
        }
        if (!planted) continue;
        copses.push({
          x, z, r: Math.min(9.0, Math.max(3.2, far + 1.1)), n: planted,
          yaw: idxUnit(164, gi, gj, seed) * TAU,
        });
      }
    }
  }

  // Falls Creek skirt forest: mixed species on the overlay just outside the
  // batter, so the mountain grades into trees instead of sitting on a green disc.
  const falls = crust?.seats?.find?.((s) => s.id === 'falls-creek');
  if (falls) {
    for (let n = 0; n < 70; n += 1) {
      const ang = (n / 70) * TAU + idxUnit(190, n, 0, seed) * 0.4;
      const d = (falls.radius ?? 96) + 22 + idxUnit(191, n, 0, seed) * 64;
      const tx = falls.x + Math.sin(ang) * d;
      const tz = falls.z + Math.cos(ang) * d;
      if (hinterlandMaskAt(tx, tz, extent, crust) < 0.28) continue;
      const kind = n % 4;
      scatter.push({
        x: tx, z: tz, y: ground(tx, tz),
        scale: 5.5 + idxUnit(192, n, 0, seed) * 6.5,
        yaw: idxUnit(193, n, 0, seed) * TAU,
        hue: idxUnit(194, n, 0, seed),
        kind,
        species: ['eucalypt', 'plane', 'jacaranda', 'bottlebrush'][kind],
        role: 'skirt',
      });
    }
  }

  const reeds = [];
  const reedCap = medium ? 80 : 180;
  if (crust?.hills) {
    const edge = crust.hills;
    for (let along = -400; along <= 400 && reeds.length < reedCap; along += 7) {
      for (let sea = 90; sea <= 260; sea += 14) {
        const p = shorePoint(edge, extent, sea, along);
        const out = Math.max(-p.z, p.z - extent.z, -p.x, p.x - extent.x);
        const c = creekFieldAt(p.x, p.z, extent, crust, crust.seats, out, 0);
        if (c.thread < 0.04 || c.thread > 0.42) continue;
        if (idxUnit(200, Math.round(along), Math.round(sea), seed) > 0.55) continue;
        reeds.push({
          x: p.x, z: p.z, y: surroundHeightAt(p.x, p.z, extent, crust),
          yaw: idxUnit(201, Math.round(along), 0, seed) * TAU,
          height: 0.85 + idxUnit(202, Math.round(along), 0, seed) * 0.7,
          scale: 0.55 + idxUnit(203, Math.round(along), 0, seed) * 0.4,
        });
        break;
      }
    }
  }

  /**
   * ── STOCK: SMALL, IN MOBS, ON GRAZING GROUND ──
   *
   * A beast is 1.9 m long, which is 11 px at the near ring and 7 at the far one.
   * Scattered singly at that size it is the fault an earlier critic already
   * reported on this ring — isolated pale specks that read as litter — so they
   * are placed as MOBS of four to nine on a short drift line, which is what a
   * grazing herd looks like from above and what survives minification: a dark
   * dashed cluster with one shadow direction.
   *
   * Kinds 0 (pasture), 2 (harvested stubble), and 4 (rough grazing). Post-harvest
   * stubble is grazing ground; admitting it closes the deterministic blind spot
   * where the shroud pose sees one broad harvested field and no pasture at all.
   * Ploughed and standing-crop tones remain excluded.
   */
  const stock = [];
  {
    const pitch = 46;
    const reach = Math.ceil(HINTERLAND_WORK.stockOuterR / pitch);
    for (let gi = -reach; gi <= reach && stock.length < HINTERLAND_WORK.stockCap; gi += 1) {
      for (let gj = -reach; gj <= reach && stock.length < HINTERLAND_WORK.stockCap; gj += 1) {
        if (idxUnit(230, gi, gj, seed) > 0.44) continue;
        const x = cx + gi * pitch + (idxUnit(231, gi, gj, seed) - 0.5) * pitch * 0.7;
        const z = cz + gj * pitch + (idxUnit(232, gi, gj, seed) - 0.5) * pitch * 0.7;
        const rr = Math.hypot(x - cx, z - cz);
        if (rr > HINTERLAND_WORK.stockOuterR) continue;
        // The worked-ground gate, not `hinterlandMaskAt` — see `workedGroundAt`.
        // At plan time there is no occupancy grid yet; `clear()` in the builder
        // applies it afterwards, which is the same two-stage keep-out every other
        // family on this ring uses.
        if (!workedGroundAt(x, z, extent, crust, null)) continue;
        const cellK = paddockAt(x, z, seed);
        const kind = paddockKind(cellK.ix, cellK.iz, seed);
        if (kind !== 0 && kind !== 2 && kind !== 4 && kind !== 5) continue;
        // W7-C: a mob is 6 to 20 head of one kind at true size: sheep about 1.2 m nose to
        // tail, cattle about 2.4 m (the unit beast is 1.9 m), scattered on a sunflower
        // spiral rather than strung along a line.
        const mob = 6 + Math.floor(idxUnit(233, gi, gj, seed) * 15);
        const sheepMob = idxUnit(229, gi, gj, seed) < 0.55;
        const spacing = sheepMob ? 2.2 : 4.2;
        const drift = idxUnit(234, gi, gj, seed) * TAU;
        for (let k = 0; k < mob; k += 1) {
          const ring = Math.sqrt(k + 0.5) * spacing * (0.85 + idxUnit(235 + k, gi, gj, seed) * 0.30);
          const ang = drift + k * 2.399963;
          const bx = x + Math.sin(ang) * ring;
          const bz = z + Math.cos(ang) * ring;
          if (!workedGroundAt(bx, bz, extent, crust, null)) continue;
          const beastCell = paddockAt(bx, bz, seed);
          const beastKind = paddockKind(beastCell.ix, beastCell.iz, seed);
          if (beastKind !== 0 && beastKind !== 2 && beastKind !== 4 && beastKind !== 5) continue;
          stock.push({
            x: bx,
            z: bz,
            y: ground(bx, bz),
            // Beasts in a mob face roughly one way and graze at their own angle.
            yaw: drift + (idxUnit(248 + k, gi, gj, seed) - 0.5) * 1.5,
            scale: sheepMob ? 0.60 + idxUnit(252 + k, gi, gj, seed) * 0.06 : 1.17 + idxUnit(252 + k, gi, gj, seed) * 0.12,
            sheep: sheepMob,
            tone: idxUnit(256 + k, gi, gj, seed),
          });
        }
      }
    }
  }

  /**
   * ── THE TERMINATING TREELINE ──
   *
   * `HINTERLAND.browR` / `browH` / `browWidth` build a wooded ridge into the
   * height field at r 512 and nothing has ever stood on it, so the world rim has
   * been a bare ramp fading into haze — "world rim dying into an unshaded grey
   * void" on the board-wide plate, where the visible ring runs out at r 447-532
   * with a luma standard deviation of 2.8 over the top 60 rows.
   *
   * A treeline is the cheapest thing that resolves a rim: it rides the four tree
   * archetypes already instanced, so it costs no draw call, and at 2-4 px a tree
   * it reads as one dark textured band rather than as individuals. Scale is held
   * DOWN out here (5.5-9 m) because a tree that resolves individually at the rim
   * would read as a giant beside the city.
   */
  const rimWoods = [];
  {
    const R = HINTERLAND.browR;
    const n = medium ? 150 : HINTERLAND_WORK.rimWoodCap;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * TAU + idxUnit(260, i, 0, seed) * 0.05;
      const rr = R + (idxUnit(261, i, 0, seed) - 0.5) * 2 * HINTERLAND_WORK.rimWoodSpread;
      const tx = cx + Math.sin(a) * rr;
      const tz = cz + Math.cos(a) * rr;
      if (!workedGroundAt(tx, tz, extent, crust, null)) continue;
      const kind = i % 4;
      rimWoods.push({
        x: tx, z: tz, y: ground(tx, tz),
        scale: 5.5 + idxUnit(262, i, 0, seed) * 3.5,
        yaw: idxUnit(263, i, 0, seed) * TAU,
        // Held to the dark half of the hue span: a treeline reads as the value
        // step that terminates the country, not as another paddock tone.
        hue: idxUnit(264, i, 0, seed) * 0.34,
        kind,
        species: ['eucalypt', 'plane', 'jacaranda', 'bottlebrush'][kind],
        role: 'rim-wood',
      });
    }
  }

  /**
   * ── THE BROW ITSELF, AS A LINE ──
   *
   * Scattered trees on the rim are individually 2-4 px at the board-wide pose and
   * the tilt-shift falloff averages them into the haze: measured on the r16 plate,
   * the top 60 rows carry a luma standard deviation of 2.8 and a saturation of
   * 0.075, which is the "world rim dying into an unshaded grey void" the board
   * round named. Specks cannot fix that; a LINE can, because a continuous 6 m
   * band has a lit top and a shade face that survive a blur that erases anything
   * with a gap in it.
   *
   * So the wooded ridge `HINTERLAND.browR/browH/browWidth` has always built into
   * the height field gets the massing it never had: a merged bank following the
   * brow circle, broken wherever the ring runs into water, with the scattered rim
   * trees standing on and around it.
   */
  const rimBrow = [];
  {
    const R = HINTERLAND.browR;
    const step = 12;
    const n = Math.max(24, Math.round((TAU * R) / step));
    let run = [];
    const flush = () => {
      if (run.length >= 4) rimBrow.push(run);
      run = [];
    };
    // taste W28 (hedges-2, HEDGEROW_FORM): the radial wander of 18 m was drawn afresh every 12 m, which is a zigzag with 12 m legs, the dark bars
    // that ran along the low west view. With the switch on it is the same 18 m of wander on knots about 60 m apart, blended smoothly round the ring.
    const browSmooth = !!hedgerowFormActive();
    const knots = Math.max(6, Math.round(n / 5));
    const wander = (i) => {
      if (!browSmooth) return (idxUnit(266, i, 0, seed) - 0.5) * 18;
      const t = ((i / n) * knots) % knots;
      const k0 = Math.floor(t);
      const f = t - k0;
      const e = f * f * (3 - 2 * f);
      return ((idxUnit(266, k0, 0, seed) * (1 - e) + idxUnit(266, (k0 + 1) % knots, 0, seed) * e) - 0.5) * 18;
    };
    // taste W34 (BROW_PARCEL): with the switch on the runs come from the paddock boundaries and the circle is not walked.
    if (BROW_PARCEL.on) {
      for (const chain of parcelBrowChains(bounds, cx, cz, R, (x, z) => workedGroundAt(x, z, extent, crust, null), seed)) rimBrow.push(chain);
    }
    for (let i = 0; i <= (BROW_PARCEL.on ? -1 : n); i += 1) {
      const a = (i / n) * TAU;
      const rr = R + wander(i);
      const x = cx + Math.sin(a) * rr;
      const z = cz + Math.cos(a) * rr;
      if (!workedGroundAt(x, z, extent, crust, null)) { flush(); continue; }
      run.push({
        x,
        z,
        // Tangent to the circle, which is the direction the band runs.
        yaw: a + Math.PI / 2,
        len: step,
        hue: idxUnit(267, i, 0, seed),
      });
    }
    flush();
  }

  // T13B: one or two farm dams per square kilometre of drawn country, rather
  // than one lottery winner every few field boundaries. Keep the receipt site
  // first; the existing seated bank/water geometry and contact clearing remain.
  let fieldAreaKm2 = 0;
  for (let x = cx - HINTERLAND.outer; x < cx + HINTERLAND.outer; x += 20) {
    for (let z = cz - HINTERLAND.outer; z < cz + HINTERLAND.outer; z += 20) {
      if (hinterlandDrawMaskAt(x + 10, z + 10, extent, crust) > 0.35) fieldAreaKm2 += 0.0004;
    }
  }
  const landscapeDamCap = Math.max(1, Math.round(fieldAreaKm2 * 1.5));
  dams.sort((a, b) => Number(b.role === 'hills-inland-receipt') - Number(a.role === 'hills-inland-receipt')
    || idxUnit(323, Math.round(a.x), Math.round(a.z), seed) - idxUnit(323, Math.round(b.x), Math.round(b.z), seed));
  const damCandidates = dams.slice();
  dams.splice(landscapeDamCap);
  damTiers[0] = dams.filter((d) => d.tier === 1).length;
  damTiers[1] = dams.filter((d) => d.tier === 2).length;

  // A dam is a dark, open water disc, not another pad that props up whatever
  // placement happened to win the field boundary lottery first. Clear the
  // centre footprint after every family has been planned so fences, stock and
  // low scatter cannot visibly cross the receipt dam (or any of its peers).
  const clearDamFootprints = (list, pad = 0) => {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (damCandidates.some((dam) => Math.hypot(list[i].x - dam.x, list[i].z - dam.z) < dam.radius + pad)) {
        list.splice(i, 1);
      }
    }
  };
  for (const list of [scatter, scrub, windrows, fences, walls, hedges, windbreaks, belts, sheds, bales, stock, rimWoods]) {
    clearDamFootprints(list, 1.5);
  }

  return {
    fields: bounds, fenceRest, hedges, belts, dams, damCandidates, damTiers, fieldAreaKm2, sheds, bales, scatter, scrub, windrows,
    fences, walls, reeds, windbreaks, copses, stock, rimWoods, rimBrow,
  };
}

/**
 * taste-r1 (W22-A): the switch for the hinterland's low layer. 1 replaces wave twenty-one's smooth scrub scatter and the blob
 * shrubs at the feet of the tree groups with card-built shrubs and tussocks (tree-forms.js `tuftForm`) laid out in gatherings:
 * ragged strips along parcel boundaries and farm tracks, hollows, skirts round tree groups, broad patches and a sparse open
 * scatter. 0 restores wave twenty-one exactly (the old scrub, the blob shrubs, the hashes). Browser: `?scrubTufts=0`; node:
 * `DD_SCRUB_TUFTS=0`; tests may call `setScrubTufts`.
 */
export let HINTERLAND_SCRUB_TUFTS = (typeof process !== 'undefined' && process?.env?.DD_SCRUB_TUFTS !== undefined)
  ? Number(process.env.DD_SCRUB_TUFTS) > 0 ? 1 : 0
  : (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('scrubTufts') === '0' ? 0 : 1);
export function setScrubTufts(v) { HINTERLAND_SCRUB_TUFTS = v ? 1 : 0; }

/**
 * taste W32 (WINDROWS): hay windrows are not drawn (owner, 14 Oct 2026, from a picture of each: off). Wave thirty-one's gates left
 * twelve pieces on the whole map, most of them on tilled ground, and at 95 m they read as pale straps. The plan still lists its
 * rows and the build still filters them, so no other placement or count moves; the mesh, its contact shade and the gate's audit are
 * skipped. 1 restores wave thirty-one's picture exactly. Browser: `?windrows=1`; node: `DD_WINDROWS=1`.
 */
export const WINDROWS = Object.freeze({
  on: (typeof process !== 'undefined' && process?.env?.DD_WINDROWS !== undefined)
    ? (Number(process.env.DD_WINDROWS) > 0 ? 1 : 0)
    : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('windrows') === '1') ? 1 : 0),
});

/**
 * taste W33 (WALL_TRACK): a dry-stone wall is not laid across a farm track. Walls are placed on a paddock boundary by their own roll and
 * were filtered by `clear` (venue ground, the occupancy grid), which does not test tracks, so one 9 m run lay across a track (g2, instance
 * 16 of `fringe:hinterland-walls`). 1 drops a wall whose run (the segment of its length along its yaw) comes within `clearM` plus its half
 * width of a farm-track line (the ring's track lines and every surveyed paddock's access track), as wave thirty-one's windrow gate does
 * for a hay row; only walls change (and their contact ribbon), the other sets are built from the same lists as before. 0 restores wave
 * thirty-two exactly. Browser: `?wallTrack=0`; node: `DD_WALL_TRACK=0`.
 */
export const WALL_TRACK = Object.freeze({ on: crownSwitch('DD_WALL_TRACK', 'wallTrack'), clearM: 1.6 });

/** Distance between segments a0-a1 and b0-b1 in the plane (0 where they cross). */
function segSegDistance(ax0, az0, ax1, az1, bx0, bz0, bx1, bz1) {
  const pt = (px, pz, x0, z0, x1, z1) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const u = Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(px - x0 - u * dx, pz - z0 - u * dz);
  };
  const cr = (ox, oz, px, pz, qx, qz) => (px - ox) * (qz - oz) - (pz - oz) * (qx - ox);
  const d1 = cr(bx0, bz0, bx1, bz1, ax0, az0);
  const d2 = cr(bx0, bz0, bx1, bz1, ax1, az1);
  const d3 = cr(ax0, az0, ax1, az1, bx0, bz0);
  const d4 = cr(ax0, az0, ax1, az1, bx1, bz1);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(pt(ax0, az0, bx0, bz0, bx1, bz1), pt(ax1, az1, bx0, bz0, bx1, bz1), pt(bx0, bz0, ax0, az0, ax1, az1), pt(bx1, bz1, ax0, az0, ax1, az1));
}

/**
 * taste W31 (WINDROW_FORM): hay windrows as raked hay, placed where hay can lie. The first form was a hexagonal rod 0.55 to 0.85 m
 * high (24 triangles a row) laid by row centre and end points only, so a row ran under a hedge, over a track or a tree, across a
 * parcel line, and a row the ground shortened left a 5 m shard. 1 sweeps every row at `stepM` along its length and keeps only the
 * stretches where the swath (its half width plus `clearM`) is clear of every hedge, windbreak, fence, wall, parcel fence, farm
 * track, venue path, rim-brow run, tree trunk, venue ground and water, and stays inside the row's own parcel (the sub-field its
 * centre lies in, in stubble); a kept stretch is cut into unequal pieces with gaps, and a piece under `minPieceM` is dropped. Each
 * piece is then built in world space on the built sheet: a low ragged swath (about `widthM` wide and `heightM` high, three facets a
 * side with a lateral wander, an uneven crown, two straw tones, ends that taper to a tip), at most twice the old triangle total.
 * 0 restores the rod and the old rows exactly. Browser: `?windrowForm=0`; node: `DD_WINDROW_FORM=0`.
 */
export const WINDROW_FORM = Object.freeze({
  on: (typeof process !== 'undefined' && process?.env?.DD_WINDROW_FORM !== undefined)
    ? (Number(process.env.DD_WINDROW_FORM) > 0 ? 1 : 0)
    : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('windrowForm') === '0') ? 0 : 1),
  clearM: 1.5, minPieceM: 6, stepM: 0.5, widthM: 1.3, heightM: 0.35, triGain: 2,
  ringM: 1.2, // the finest spacing of the rings along a piece; it opens out until the pieces fit `triGain` times the old total
});

/**
 * taste-r1 (W23-C): the switch for the tufts' tune: greener colour, larger and touching shrubs, fewer tussocks and a gap-fill
 * of broad patches over bare pasture. 0 restores wave twenty-two's tufts exactly. Browser: `?tuftTune=0`; node:
 * `DD_TUFT_TUNE=0`; tests may call `setTuftTune`.
 */
export let HINTERLAND_TUFT_TUNE = (typeof process !== 'undefined' && process?.env?.DD_TUFT_TUNE !== undefined)
  ? Number(process.env.DD_TUFT_TUNE) > 0 ? 1 : 0
  : (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('tuftTune') === '0' ? 0 : 1);
export function setTuftTune(v) { HINTERLAND_TUFT_TUNE = v ? 1 : 0; }

/**
 * taste W59 (SHRUB_TONE): the scrub shrubs' lit tops come down to the dry grass's register. The shrubs' instance colours are among the darkest of
 * the set, but the key light on the cards' up-tilted faces lifts their tops to 0.36 to 0.38 linear luminance against the dry grass's 0.18 to 0.24
 * (f1 +94%, g2 +39%), and no one colour scale fits both stations. 1 gives the shrub set a material of its own (the tufts' foliage patch, the same
 * colours) whose fragment stage scales the key's diffuse term (`reflectedLight.directDiffuse`, after the shadow) by a ramp on n.l from 1 to `lit`: a face turned
 * to the sun loses most of its lift, a flank only slightly, and one in the key's shade, lit by the sky, fill and rim alone, is not touched. The tussocks and the foot clumps keep
 * the tufts' material. 0 gives the shrub set the shared material, exactly as before. Browser: `?shrubTone=0`; node: `DD_SHRUB_TONE=0`.
 * W61: the settings come from the query; the defaults are sheet column C (the key untouched, the instance colour's value 0.55 and saturation 1.3), so the lift on
 * the cards stays and the colour under it is darker and warmer. `?shrubLit=` (the kept share of the key's diffuse light), `?shrubTint=r,g,b`,
 * `?shrubVal=` (a scale on the shrub instance colour's value) and `?shrubSat=` (a scale on its saturation about its own luminance); a missing or bad one keeps its default.
 */
const shrubQuery = (name) => ((typeof location !== 'undefined' && location?.search) ? new URLSearchParams(location.search).get(name) : null);
const shrubQueryNum = (name, dflt) => { const raw = shrubQuery(name); const v = raw === null || raw === '' ? NaN : Number(raw); return Number.isFinite(v) && v >= 0 ? v : dflt; };
const shrubQueryTint = (dflt) => { const parts = (shrubQuery('shrubTint') ?? '').split(',').map(Number); return parts.length === 3 && parts.every((v) => Number.isFinite(v) && v >= 0) ? parts : dflt; };
export const SHRUB_TONE = Object.freeze({
  on: (typeof process !== 'undefined' && process?.env?.DD_SHRUB_TONE !== undefined)
    ? (Number(process.env.DD_SHRUB_TONE) > 0 ? 1 : 0)
    : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('shrubTone') === '0') ? 0 : 1),
  lit: shrubQueryNum('shrubLit', 1), // the share of the key's diffuse light a face turned full to the key keeps (wave fifty-nine 0.22 read flat grey-olive; wave sixty 0.5 with a warm tint read flat khaki; W61 1, the sun untouched); `?shrubLit=`
  tint: shrubQueryTint([1, 1, 1]), // the warm the kept key light carries (wave sixty [1, 0.85, 0.6]; W61 none); `?shrubTint=r,g,b`
  val: shrubQueryNum('shrubVal', 0.55), // W61: a scale on the shrub instance colour's value, chosen by eye from a sheet of six (f1, g2, 19): the tops warm olive-gold with their sunlit facets; `?shrubVal=`
  sat: shrubQueryNum('shrubSat', 1.3), // W61: a scale on the shrub instance colour's saturation about its own luminance, so the darker colour keeps its straw; `?shrubSat=`
  rampLo: 0.1, rampHi: 0.5, // n.l against the key: a face under rampLo keeps all its light, a face over rampHi keeps `lit` of it
});

/** taste W59 (SHRUB_TONE): chain the key-light scale onto a foliage-patched material (see SHRUB_TONE). The uniform is `material.userData.shrubTone.uShrubLit`. */
function applyShrubTone(material) {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : null;
  const uniforms = { uShrubLit: { value: SHRUB_TONE.lit }, uShrubTint: { value: new THREE.Vector3(...SHRUB_TONE.tint) }, uShrubRamp: { value: new THREE.Vector2(SHRUB_TONE.rampLo, SHRUB_TONE.rampHi) } };
  material.userData.shrubTone = uniforms;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    // The key's diffuse term is scaled by a ramp on n.l against the key (the rig's first directional light): untouched at n.l under `rampLo`, at `lit` times the warm tint over `rampHi`.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uShrubLit;\nuniform vec3 uShrubTint;\nuniform vec2 uShrubRamp;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
reflectedLight.directDiffuse *= mix(vec3(1.0), uShrubLit * uShrubTint, smoothstep(uShrubRamp.x, uShrubRamp.y, dot(normal, directionalLights[0].direction)));
#endif`);
  };
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|shrubTone`;
  material.needsUpdate = true;
  return material;
}

export const TUFT_PARAMS = {
  capHigh: { shrub: 1500, tussock: 2000 },
  capMedium: { shrub: 700, tussock: 900 },
  tuneCapHigh: { shrub: 1500, tussock: 1300 }, // W23-C
  tuneCapMedium: { shrub: 700, tussock: 600 },
  fillCell: 64, // W23-C gap-fill grid (m)
  fillReach: 48, // a cell with fewer than fillMin tufts within this reach gets a patch
  fillMin: 3,
  creekMax: 0.85, // W23-C: creek field value below which a bank may carry scrub
  farFrom: 400, // metres from the board centre where the stable thinning begins
  farTo: 600,
  farKeep: 0.45, // share kept at farTo
  patchCell: 120, // metres of the broad patch noise (and 47 m for the finer one)
  patchLo: 0.36,
  patchHi: 0.66,
  hollowD: 9, // metres of the concavity probe
  hollowLo: 0.0035, // concavity (1/m) where a hollow starts to gather scrub
  hollowHi: 0.012,
};

/**
 * taste W46 (TRUNK_TUFTS): the hinterland eucalypts stand in their own growth. At close range the backdrop-tier trunk meets the ground on a
 * flat seven-sided plate with a dark line round its edge (the flare's cone, and the ambient-occlusion pass at it), which no change of the
 * form removed (W45). 1 lays six of the existing tussocks (`tuftForm`, no shrubs) round the foot of each eucalypt `_plantTrees` plants, in an
 * even spacing jittered within its slots so the whole round is taken (the side the camera sees too), at 0.65 to 0.85 m from the trunk's axis so each
 * clump straddles the plate's ground edge, at 1.7 to 2.2 times the tussock form and 1.3 times taller than wide (a y-scale on the instance, so a
 * clump at the front reaches over the plate's edge at the game camera's pitch). W49: a clump whose centre lies within half its scale plus 0.3 m of a
 * fence line is moved, not dropped: first its own slot at a larger radius (to 1.2 m), then the slot's angle turned away from the fence by up to half
 * a slot; it is dropped only when neither clears the fence. Seated on the built sheet and
 * tinted and shaded as the tufts round them (one instanced set with them: no draw call is added, and `_tuftShrubs`, which feeds the contact
 * patches, is as before). They are cut to a cap
 * of their own by tier (whole trees, in a stable hash order); the low tier builds none. Nothing else moves. 0 gives wave forty-five's sets
 * exactly. Browser: `?trunkTufts=0`; node: `DD_TRUNK_TUFTS=0`.
 */
export const TRUNK_TUFTS = Object.freeze({
  on: (typeof process !== 'undefined' && process?.env?.DD_TRUNK_TUFTS !== undefined)
    ? (Number(process.env.DD_TRUNK_TUFTS) > 0 ? 1 : 0)
    : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('trunkTufts') === '0') ? 0 : 1),
  capHigh: 5500, // instances added at `high` (902 eucalypts at six: at most 5,412, so every tree is covered; was 5,400 at five and three fifths)
  capMedium: 3500, // instances added at `medium` (578 eucalypts at six: at most 3,468; was 3,400)
  rimLo: 0.65, rimHi: 0.85, // metres from the axis the clumps are seated at: the flare's plate runs out to about 0.85, so each clump (half a metre wide or more) straddles its edge
  tussLo: 1.7, tussHi: 2.2, // tussock scale: the clump is about 1 m across, so five of them span the plate's round of about 5.3 m
  fenceM: 0.3, // a clump whose centre lies within half its scale plus this many metres of a fence line is dropped (no wire runs through a clump)
  spread: 0.2, // the angular jitter of a clump, in slots of the even spacing (0.2: a thirtieth of the round at most to either side at six clumps)
  count: 6, // clumps on every tree
  tall: 1.3, // the clump's y-scale over its width scale
  moveMax: 1.2, moveStep: 0.05, // a clump beside a fence is first seated farther out along its own slot, to this many metres from the axis
  turnSteps: 4, // then its angle is turned away from the fence in this many steps up to half a slot
});

/**
 * taste W53 (TUFT_CLEAR): the foot clumps are kept clear of sheds and hedges as W49 kept them clear of fences. At f1-fence-corner one clump's
 * blades cut into a shed's wall and a pale clump covered the end of a hedge. 1 gives the same move-then-turn-then-drop rule two more obstacles,
 * with the clearance `0.5 * scale + clearM` metres: every hinterland shed's footprint (its planned length by width, centred on the shed, the
 * length along (sin yaw, cos yaw); a clump whose centre is inside it is dropped like any other that cannot be moved) and every hedge (its
 * centre line, ends included, with its half-width added). They go into the grid the fence test already uses. 0 leaves the instance list as
 * W49 made it. Browser: `?tuftClear=0`; node: `DD_TUFT_CLEAR=0`.
 */
export const TUFT_CLEAR = Object.freeze({
  on: (typeof process !== 'undefined' && process?.env?.DD_TUFT_CLEAR !== undefined)
    ? (Number(process.env.DD_TUFT_CLEAR) > 0 ? 1 : 0)
    : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('tuftClear') === '0') ? 0 : 1),
  clearM: 0.25, // metres beyond half a clump's scale (and, for a hedge, beyond its half-width)
  hedgeHalfM: 1.7, // the flat half-width a hedge gets when no built profile is given (tests, a caller without the mesh): the lump cap (1.4 m) times the 1.1 foot flare, plus the dome's displacement; the built mesh's p99.9 is 1.66 m, farthest vertex 1.83 m, median only 0.75 m
  profBinM: 0.25, // W55: the along-run width of a hedge profile's bins, metres (W56: 0.25, from 1; each bin keeps its outermost mesh vertex on either side)
  profReachM: 1.5, // W56: a clump is cleared by the distance to the nearest of those vertices within this many metres along the run (W55: the largest half-width within 1 m, which over-cleared); W57: no longer read, see hedgeGapM
  hedgeGapM: 3, // W57: each side's half-width is interpolated linearly between neighbouring rings (the mesh's rings stand about 2 m apart, 90th percentile 2.2 m); farther apart than this (a gateway) the hedge is taken as ending at each ring
  shedClearM: 0, // W56: the margin beyond a shed's ground outline (W53: clearM, 0.25; the f1 shed tree's open-side clump stands 0.83 m off the slab with a fence 2 m beyond, so it cannot keep 0.25)
  shedWallTopM: 1, // W56: a shed's obstacle is the outline of its model's vertices below this height (walls, slab, lean-to; the eaves stand overhead and cannot touch a clump)
});

/** The shed model's form for a planned shed (as the build's three instanced sets split them). */
const shedFormOf = (sh) => (sh.role ? 'gable' : sh.tone < 0.5 ? 'gable' : sh.tone < 0.78 ? 'skillion' : 'leanto');
const shedModelBoxes = {};
/** The model's ground outline in its own x and z, [x0, x1, z0, z1] metres: the box of the vertices below `TUFT_CLEAR.shedWallTopM` (W56: walls, slab and lean-to; the eaves are overhead and left out; it is not centred on the origin). */
function shedModelBox(form) {
  if (!shedModelBoxes[form]) {
    const g = makeShedGeometry(form);
    const p = g.attributes.position.array, top = TUFT_CLEAR.shedWallTopM;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i + 2 < p.length; i += 3) {
      if (p[i + 1] >= top) continue;
      if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i];
      if (p[i + 2] < z0) z0 = p[i + 2]; if (p[i + 2] > z1) z1 = p[i + 2];
    }
    shedModelBoxes[form] = [x0, x1, z0, z1];
    g.dispose();
  }
  return shedModelBoxes[form];
}

/**
 * W55 (TUFT_CLEAR): the built half-width of each hedge item along its run. `hedges` are the planned items ({ x, z, yaw, len }, the centre line
 * along (sin yaw, cos yaw)); `positions` is the hedge mesh's position array (x, y, z, world). Every mesh vertex goes to the nearest item (within
 * 3 m of its line) and keeps, per bin (`TUFT_CLEAR.profBinM` metres along the run) and side, the outermost vertex. Returns one Float32Array per item,
 * four numbers a bin: [across (left side), along, across (right side, positive), along], 0 where no vertex stands (a gateway, the cut ends).
 * W56: the clump's gap is its distance to the nearest of those vertices (negative between the two sides' outermost).
 */
export function hedgeHalfProfiles(hedges, positions) {
  const BIN = TUFT_CLEAR.profBinM, CELL = 8, REACH = 3, PAD = 1; // W57: PAD, the metres past either end of an item that still have bins (the end caps stand there)
  const items = hedges.map((h) => {
    const len = h.len ?? 8, ux = Math.sin(h.yaw), uz = Math.cos(h.yaw);
    return { ax: h.x - ux * len * 0.5, az: h.z - uz * len * 0.5, ux, uz, len, bins: new Float32Array((Math.ceil((len + 2 * PAD) / BIN) + 1) * 4) };
  });
  const grid = new Map();
  items.forEach((it, i) => {
    const bx = it.ax + it.ux * it.len, bz = it.az + it.uz * it.len;
    const x0 = Math.floor((Math.min(it.ax, bx) - REACH) / CELL), x1 = Math.floor((Math.max(it.ax, bx) + REACH) / CELL);
    const z0 = Math.floor((Math.min(it.az, bz) - REACH) / CELL), z1 = Math.floor((Math.max(it.az, bz) + REACH) / CELL);
    for (let cx = x0; cx <= x1; cx += 1) for (let cz = z0; cz <= z1; cz += 1) {
      const key = cx * 100003 + cz, c = grid.get(key);
      if (c) c.push(i); else grid.set(key, [i]);
    }
  });
  for (let v = 0; v + 2 < positions.length; v += 3) {
    const x = positions[v], z = positions[v + 2];
    const c = grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
    if (!c) continue;
    let best = REACH, bi = -1;
    for (const i of c) {
      const it = items[i];
      const u = Math.max(0, Math.min(it.len, (x - it.ax) * it.ux + (z - it.az) * it.uz));
      const d = Math.hypot(x - it.ax - it.ux * u, z - it.az - it.uz * u);
      if (d < best) { best = d; bi = i; }
    }
    if (bi < 0) continue;
    // W57: the vertex goes to its nearest item, and also to any other item it stands within PAD metres past the end of and 2 m across from: a hedge run is
    // planned in items of 4 to 5 m but built as one mesh, whose rings do not stop at the item's end, so a clump past an item's last ring is tested against the next item's first
    for (const i of c) {
      const it = items[i];
      const ru = (x - it.ax) * it.ux + (z - it.az) * it.uz, rv = -(x - it.ax) * it.uz + (z - it.az) * it.ux; // the vertex along and across the run
      if (i !== bi && (Math.abs(rv) > 2 || ru < -PAD || ru > it.len + PAD)) continue;
      const k = Math.floor((Math.max(-PAD, Math.min(it.len + PAD, ru)) + PAD) / BIN) * 4; // W57: a vertex past the item's end keeps its own bin (W56 clamped it into the end bin, which the end cap's narrower ring never won)
      const b = it.bins;
      if (rv > b[k]) { b[k] = rv; b[k + 1] = ru; } else if (-rv > b[k + 2]) { b[k + 2] = -rv; b[k + 3] = ru; }
    }
  }
  return items.map((it) => it.bins);
}

/**
 * W57 (TUFT_CLEAR): a hedge profile's two sides as lists of rings, [along, across] sorted along the run (the bins' outermost vertices; two within 0.3 m of
 * each other, one ring seen in two bins, are merged to the wider). The mesh's rings stand about 2 m apart, so a bin test rarely holds both sides; the
 * built outline between two rings is the straight line joining them, which `hedgeSideAt` reads.
 */
function hedgeSideLists(prof) {
  const nb = prof.length / 4, sides = [[], []];
  for (let k = 0; k < nb; k += 1) {
    if (prof[4 * k] > 0) sides[0].push([prof[4 * k + 1], prof[4 * k]]);
    if (prof[4 * k + 2] > 0) sides[1].push([prof[4 * k + 3], prof[4 * k + 2]]);
  }
  return sides.map((pts) => {
    pts.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const q of pts) {
      const l = out[out.length - 1];
      if (l && q[0] - l[0] < 0.3) { if (q[1] > l[1]) out[out.length - 1] = q; } else out.push(q);
    }
    return out;
  });
}
let hedgeSideW = 0, hedgeSideD = 0; // hedgeSideAt's results: the side's half-width at the point, and the along distance to its span (0 inside it)
/** The side's half-width at `cu` metres along the run (sets `hedgeSideW`, `hedgeSideD`): linear between the two rings either side (gaps to `TUFT_CLEAR.hedgeGapM`), else the nearest ring's. */
function hedgeSideAt(pts, cu) {
  const n = pts.length;
  if (!n) { hedgeSideW = 0; hedgeSideD = Infinity; return; }
  if (cu <= pts[0][0]) { hedgeSideW = pts[0][1]; hedgeSideD = pts[0][0] - cu; return; }
  if (cu >= pts[n - 1][0]) { hedgeSideW = pts[n - 1][1]; hedgeSideD = cu - pts[n - 1][0]; return; }
  let i = 1;
  while (pts[i][0] < cu) i += 1;
  const a = pts[i - 1], b = pts[i], span = b[0] - a[0];
  if (span <= TUFT_CLEAR.hedgeGapM) { hedgeSideW = a[1] + (b[1] - a[1]) * ((cu - a[0]) / Math.max(span, 1e-6)); hedgeSideD = 0; return; }
  if (cu - a[0] <= b[0] - cu) { hedgeSideW = a[1]; hedgeSideD = cu - a[0]; } else { hedgeSideW = b[1]; hedgeSideD = b[0] - cu; }
}

/**
 * The tufts at the foot of each eucalypt in `list` (trees as `_plantTrees` plants them), pure and deterministic; the build seats them.
 * `fenceSegs` ([x0, z0, x1, z1] each: the post-and-rail runs and the parcel fence panels) drops every clump whose centre is within
 * `0.5 * scale + fenceM` metres of a segment, so no fence wire runs through a clump (a coarse grid of 16 m cells keeps it cheap).
 * W53: `obstacles` ({ sheds: [{ x, z, yaw, len, width }], hedges: [{ x, z, yaw, len, width }] }; null leaves W49's list exactly) adds the sheds'
 * footprints and the hedges' bodies to the same grid and the same move, turn and drop, at `0.5 * scale + TUFT_CLEAR.clearM` metres.
 * W55: `obstacles.hedgeHw` (one bin array per hedge, from `hedgeHalfProfiles`) gives each hedge its built half-width where the clump stands, the largest
 * of the mesh's within `TUFT_CLEAR.profReachM` metres along the run; a hedge without a profile keeps the flat `TUFT_CLEAR.hedgeHalfM`.
 */
export function trunkTuftPlacements(list, tier, seed, fenceSegs = [], stats = null, obstacles = null) {
  const P = TRUNK_TUFTS;
  if (!P.on || tier === 'low') return [];
  const CELL = 16;
  const grid = new Map();
  const reach = 0.5 * P.tussHi + P.fenceM + 0.01; // the farthest a clump can be dropped from a fence
  // The obstacles: a fence segment is [x0, z0, x1, z1] (inflation 0, margin fenceM); a hedge is its centre line with `w` its half-width and the
  // margin TUFT_CLEAR.clearM beyond it; a shed is a rectangle whose signed distance is negative inside it.
  const obs = fenceSegs.map((g) => ({ g, w: 0, m: P.fenceM, rect: null }));
  if (obstacles && TUFT_CLEAR.on) {
    (obstacles.hedges ?? []).forEach((h, i) => {
      const hx = Math.sin(h.yaw) * h.len * 0.5, hz = Math.cos(h.yaw) * h.len * 0.5;
      // W55: with the built profile the half-width is the mesh's own where the clump stands (`prof`, in bins along the item); without it, the flat hedgeHalfM
      const prof = obstacles.hedgeHw?.[i] ?? null;
      let wMax = TUFT_CLEAR.hedgeHalfM;
      if (prof) { wMax = 0; for (let k = 0; k < prof.length; k += 2) if (prof[k] > wMax) wMax = prof[k]; }
      if (wMax > 0) obs.push({ g: [h.x - hx, h.z - hz, h.x + hx, h.z + hz], w: wMax, m: TUFT_CLEAR.clearM, rect: null, prof, sides: prof ? hedgeSideLists(prof) : null, len: h.len, ux: Math.sin(h.yaw), uz: Math.cos(h.yaw), mesh: !!prof });
    });
    for (const s of obstacles.sheds ?? []) {
      // the model's own box (12 x 8 m scaled to the planned length and width, off-centre in z) turned by yaw - PI/2: its x along (sin yaw, cos yaw), its z along (-cos yaw, sin yaw)
      const ux = Math.sin(s.yaw), uz = Math.cos(s.yaw), b = s.box ?? [-6, 6, -4, 4];
      const sx = s.len / 12, sz = s.width / 8;
      const hl = (b[1] - b[0]) * 0.5 * sx, hw = (b[3] - b[2]) * 0.5 * sz, mx = (b[0] + b[1]) * 0.5 * sx, mz = (b[2] + b[3]) * 0.5 * sz;
      const rx = s.x + ux * mx - uz * mz, rz = s.z + uz * mx + ux * mz;
      const ext = Math.abs(ux) * hl + Math.abs(uz) * hw, ezz = Math.abs(uz) * hl + Math.abs(ux) * hw; // the rectangle's box
      obs.push({ g: [rx - ext, rz - ezz, rx + ext, rz + ezz], w: 0, m: TUFT_CLEAR.shedClearM, rect: { x: rx, z: rz, ux, uz, hl, hw } });
    }
  }
  for (let i = 0; i < obs.length; i += 1) {
    const { g, w } = obs[i];
    const rr = reach + w;
    const x0 = Math.floor((Math.min(g[0], g[2]) - rr) / CELL), x1 = Math.floor((Math.max(g[0], g[2]) + rr) / CELL);
    const z0 = Math.floor((Math.min(g[1], g[3]) - rr) / CELL), z1 = Math.floor((Math.max(g[1], g[3]) + rr) / CELL);
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cz = z0; cz <= z1; cz += 1) {
        const key = cx * 100003 + cz;
        const cell = grid.get(key);
        if (cell) cell.push(i); else grid.set(key, [i]);
      }
    }
  }
  // the distance from (x, z) to obstacle `o`'s body: to a fence line or a hedge's centre line less its half-width, to a shed's outline (negative inside)
  const gapTo = (o, x, z) => {
    if (o.rect) {
      const r = o.rect;
      const du = Math.abs((x - r.x) * r.ux + (z - r.z) * r.uz) - r.hl, dv = Math.abs((x - r.x) * r.uz - (z - r.z) * r.ux) - r.hw;
      return (du > 0 || dv > 0) ? Math.hypot(Math.max(du, 0), Math.max(dv, 0)) : Math.max(du, dv);
    }
    const g = o.g;
    const dx = g[2] - g[0], dz = g[3] - g[1];
    const u = Math.max(0, Math.min(1, ((x - g[0]) * dx + (z - g[1]) * dz) / Math.max(dx * dx + dz * dz, 1e-6)));
    let w = o.w;
    if (o.sides) { // W57: each side's half-width interpolated between the neighbouring rings; the across distance beyond the nearer side (negative inside), and past the ends the nearest ring's width with the along distance joined on
      const cu = (x - g[0]) * o.ux + (z - g[1]) * o.uz, cv = -(x - g[0]) * o.uz + (z - g[1]) * o.ux;
      hedgeSideAt(o.sides[0], cu);
      const wl = hedgeSideW, dl = hedgeSideD;
      hedgeSideAt(o.sides[1], cu);
      const across = Math.max(cv - wl, -hedgeSideW - cv), dAlong = Math.min(dl, hedgeSideD);
      return dAlong > 0 ? Math.hypot(Math.max(across, 0), dAlong) : across;
    }
    return Math.hypot(x - g[0] - u * dx, z - g[1] - u * dz) - w;
  };
  // is (x, z) within `half` (half the clump's scale) plus the obstacle's own margin of an obstacle
  const nearFence = (x, z, half) => {
    const cell = grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
    if (!cell) return false;
    for (const i of cell) {
      const o = obs[i];
      if (gapTo(o, x, z) < half + o.m) return true;
    }
    return false;
  };
  // the distance from (x, z) to the nearest obstacle within the grid's reach (Infinity when none is near)
  const fenceGap = (x, z) => {
    const cell = grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
    let m = Infinity;
    if (!cell) return m;
    for (const i of cell) m = Math.min(m, gapTo(obs[i], x, z));
    return m;
  };
  const cap = tier === 'high' ? P.capHigh : P.capMedium;
  const order = list.map((t) => ({ t, h: idxUnit(640, Math.round(t.x * 3), Math.round(t.z * 3), seed) })).sort((a, b) => a.h - b.h);
  const out = [];
  const n = P.count;
  const slot = TAU / n;
  for (const { t } of order) {
    const gx = Math.round(t.x * 3); const gz = Math.round(t.z * 3);
    if (out.length + n > cap) continue;
    const a0 = idxUnit(642, gx, gz, seed) * TAU;
    let kept = 0, would = 0; // clumps seated on this tree; clumps the plain drop rule (W47) would have kept
    for (let k = 0; k < n; k += 1) {
      // an even spacing round the whole foot, each clump jittered within its own slot, so no stretch of the round (the front included) is left open
      const ang = a0 + ((k + (idxUnit(645, gx * 7 + k, gz, seed) - 0.5) * P.spread) / n) * TAU;
      const d = P.rimLo + (P.rimHi - P.rimLo) * idxUnit(646, gx * 7 + k, gz, seed);
      const scale = P.tussLo + idxUnit(647, gx * 7 + k, gz, seed) * (P.tussHi - P.tussLo);
      const vu = idxUnit(648, gx * 7 + k, gz, seed);
      const clear = 0.5 * scale; // the obstacles add their own margins (a fence's fenceM, a shed's or hedge's clearM)
      let cx = t.x + Math.cos(ang) * d, cz = t.z + Math.sin(ang) * d;
      if (grid.size && nearFence(cx, cz, clear)) {
        // W49: move it before dropping it. First the slot's own angle at a larger radius, then the angle turned away from the fence (the side whose
        // gap is larger) by up to half a slot at the seating radius; dropped only when neither clears the fence.
        let hit = false;
        for (let dd = d + P.moveStep; dd <= P.moveMax + 1e-6 && !hit; dd += P.moveStep) {
          const x = t.x + Math.cos(ang) * dd, z = t.z + Math.sin(ang) * dd;
          if (!nearFence(x, z, clear)) { cx = x; cz = z; hit = true; }
        }
        if (!hit) {
          const side = fenceGap(t.x + Math.cos(ang + slot * 0.25) * d, t.z + Math.sin(ang + slot * 0.25) * d)
            >= fenceGap(t.x + Math.cos(ang - slot * 0.25) * d, t.z + Math.sin(ang - slot * 0.25) * d) ? 1 : -1;
          for (let s2 = 1; s2 <= P.turnSteps && !hit; s2 += 1) {
            const a = ang + side * slot * 0.5 * (s2 / P.turnSteps);
            const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
            if (!nearFence(x, z, clear)) { cx = x; cz = z; hit = true; }
          }
        }
        if (!hit) { if (stats) stats.fenceDropped = (stats.fenceDropped ?? 0) + 1; continue; }
        if (stats) stats.fenceMoved = (stats.fenceMoved ?? 0) + 1;
      } else would += 1;
      kept += 1;
      out.push({
        x: cx, z: cz, y: t.y, kind: 1, src: 'T',
        variant: vu < 0.6 ? 0 : vu < 0.9 ? 1 : 2, scale, sy: P.tall, // the tussock variants by weight (10, 12 and 14 triangles)
        yaw: idxUnit(649, gx * 7 + k, gz, seed) * TAU, hue: idxUnit(650, gx * 7 + k, gz, seed), val: idxUnit(651, gx * 7 + k, gz, seed),
      });
    }
    if (stats) {
      stats.trees = (stats.trees ?? 0) + 1;
      if (kept < 5) stats.treesUnderFive = (stats.treesUnderFive ?? 0) + 1;
      if (would < 5) stats.treesUnderFiveBefore = (stats.treesUnderFiveBefore ?? 0) + 1; // under the plain drop rule
      stats.dropRuleDropped = (stats.dropRuleDropped ?? 0) + (n - would);
    }
  }
  return out;
}

/**
 * The placements of the low layer, pure and deterministic. Density comes from fields, never from a scatter: see the six
 * generators below. Every instance keeps a minimum spacing from its neighbours (a stable spatial hash) and is rejected on
 * crop rows, venue ground, sand, water, the coast rim and seat batter.
 */
function tuftPlacements({ extent, seed, crust, ground, hinterland, trees, tier }) {
  const T = TUFT_PARAMS;
  const tune = HINTERLAND_TUFT_TUNE > 0;
  const caps = tune ? (tier === 'high' ? T.tuneCapHigh : T.tuneCapMedium) : (tier === 'high' ? T.capHigh : T.capMedium);
  const cx = extent.x * 0.5;
  const cz = extent.z * 0.5;
  const sd = (seed >>> 0) % 9973;
  const out = [];
  const grid = new Map();
  const cellKey = (i, j) => (i + 4096) * 8192 + (j + 4096);
  const SP = 3;
  const crowded = (x, z, r, space = 0.8) => {
    const i0 = Math.floor(x / SP); const j0 = Math.floor(z / SP);
    for (let di = -2; di <= 2; di += 1) {
      for (let dj = -2; dj <= 2; dj += 1) {
        const list = grid.get(cellKey(i0 + di, j0 + dj));
        if (!list) continue;
        for (const o of list) if (Math.hypot(o.x - x, o.z - z) < (o.r + r) * space) return true;
      }
    }
    return false;
  };
  // W23-C: where the placement mask is shut only by a creek bank or a gentle seat batter, the sheet is still there and
  // the ground is pasture: the bank carries scrub (a riparian margin). The channel, the bar, wet ground and the seat
  // slopes stay clear.
  const maskAt = (x, z) => {
    const m = hinterlandMaskAt(x, z, extent, crust);
    if (!tune || m >= 0.5) return m;
    if (Math.max(-z, z - extent.z, -x, x - extent.x) < 14) return m;
    if (hinterlandDrawMaskAt(x, z, extent, crust) < 0.5 || seatClearAt(x, z, crust) < 0.5) return m;
    const w = waternessAt(x, z, extent, crust);
    if (w > 0.12) return m;
    const b = seatBatterAt(x, z, crust?.seats);
    if (Math.max(b.shoulder, b.toe) > 0.1) return m;
    const out = Math.max(-z, z - extent.z, -x, x - extent.x);
    const c = creekFieldAt(x, z, extent, crust, crust?.seats, out, w);
    return c.thread + c.bar * 0.45 < T.creekMax ? 0.6 : m;
  };
  const patchRaw = (x, z) => valueNoise2(x / T.patchCell, z / T.patchCell, sd + 501) * 0.7 + valueNoise2(x / 47, z / 47, sd + 502) * 0.3;
  const patchAt = (x, z) => smoothstep(T.patchLo, T.patchHi, patchRaw(x, z));
  const broadAt = (x, z) => smoothstep(T.patchLo + 0.04, T.patchHi + 0.06, valueNoise2(x / T.patchCell, z / T.patchCell, sd + 501));
  const cropAt = (x, z) => {
    const c = paddockAt(x, z, seed);
    return HINTERLAND_WORK.cropPitch[paddockKind(c.ix, c.iz, seed)] > 0;
  };
  const ok = (x, z, y) => {
    if (inVenueKeepOut(x, z)) return false;
    if (maskAt(x, z) < 0.5) return false;
    if (workedGroundAt(x, z, extent, crust, null) < 0.4) return false;
    if (y < 0.7) return false;
    const rim = coastRimAt(x, z, extent, crust);
    if (rim.valid && rim.gate > 0.35 && rim.qm > -2.5) return false;
    return true;
  };
  let id = 0;
  let src = '';
  /** kind 0 shrub (size = width, m), 1 tussock (size = height, m). `inCrop` allows a crop edge (strips, skirts). */
  const add = (x, z, kind, size, inCrop = false, space = 0.8) => {
    const r = kind === 0 ? size * 0.5 : size * 0.4;
    if (crowded(x, z, r, space)) return false;
    if (!inCrop && (cropAt(x, z) || workedParcelAt(x, z, seed).arable)) return false;
    const y = ground(x, z);
    if (!ok(x, z, y)) return false;
    id += 1;
    const t = {
      x, z, y, kind, src, variant: Math.min(2, Math.floor(idxUnit(560, id, 3, seed) * 3)), scale: size, r,
      yaw: idxUnit(561, id, 5, seed) * TAU, hue: idxUnit(562, id, 7, seed), val: idxUnit(563, id, 11, seed),
    };
    out.push(t);
    const k = cellKey(Math.floor(x / SP), Math.floor(z / SP));
    const list = grid.get(k);
    if (list) list.push(t); else grid.set(k, [t]);
    return true;
  };
  const shrubSize = tune ? (u) => 2.4 + u * 2.1 : (u) => 1.7 + u * 1.7;
  const tussSize = tune ? (u) => 0.7 + u * 0.6 : (u) => 0.5 + u * 0.7;
  /** W23-C: a gathering shrub of 3 m or more takes one or two companions that touch it, so a clump reads as one mass. */
  const clump = (x, z, size, inCrop = false) => {
    if (!add(x, z, 0, size, inCrop, tune ? 0.5 : 0.8)) return false;
    if (!tune || size < 3) return true;
    const last = out[out.length - 1];
    const nn = idxUnit(600, id, 0, seed) < 0.5 ? 1 : 2;
    for (let k = 0; k < nn; k += 1) {
      const ang = idxUnit(601, id, k, seed) * TAU;
      const sz = Math.max(2.4, size * (0.7 + idxUnit(602, id, k, seed) * 0.3));
      const dd = (last.r + sz * 0.5) * (0.55 + idxUnit(603, id, k, seed) * 0.2);
      add(x + Math.cos(ang) * dd, z + Math.sin(ang) * dd, 0, sz, inCrop, 0.4);
    }
    return true;
  };

  src = 'A';
  // (A) Ragged strips along parcel boundaries. Edge by edge: some lines stay clean, each has its own width, and the strip
  // breaks up along its length.
  for (const b of workedParcelBoundaries(extent, seed)) {
    if (Math.hypot(b.x - cx, b.z - cz) > HINTERLAND.outer - 30) continue;
    if (idxUnit(520, b.gx, 0, seed) > 0.58) continue;
    const w = 2 + idxUnit(521, b.gx, 1, seed) * 4;
    const ragged = smoothstep(0.34, 0.60, valueNoise2(b.gz * 0.21 + b.gx * 7.13, b.gx * 3.31, sd + 503));
    if (ragged <= 0) continue;
    const boost = 0.3 + 0.7 * patchAt(b.x, b.z);
    const e = 1.5 * ragged * boost;
    const n = Math.floor(e + idxUnit(522, b.gx, b.gz, seed));
    const ax = Math.sin(b.yaw); const az = Math.cos(b.yaw);
    for (let k = 0; k < n; k += 1) {
      const off = (idxUnit(523, b.gx * 3 + k, b.gz, seed) - 0.5) * w;
      const al = (idxUnit(524, b.gx * 3 + k, b.gz, seed) - 0.5) * 4.4;
      const x = b.x + ax * al + az * off;
      const z = b.z + az * al - ax * off;
      const u = idxUnit(525, b.gx * 3 + k, b.gz, seed);
      if (idxUnit(526, b.gx * 3 + k, b.gz, seed) < 0.42) clump(x, z, shrubSize(u), true);
      else add(x, z, 1, tussSize(u), true);
    }
  }

  src = 'B';
  // (B) Farm-track verges: tussock mostly, in broken runs, outside the 4.8 m bed.
  const sheds = hinterland.sheds ?? [];
  for (let s = 0; s < sheds.length; s += 1) {
    const sh = sheds[s];
    const qx = Math.max(0, Math.min(extent.x, sh.x));
    const qz = Math.max(0, Math.min(extent.z, sh.z));
    const dx = qx - sh.x; const dz = qz - sh.z;
    const len = Math.hypot(dx, dz);
    if (len < 14) continue;
    const ux = dx / len; const uz = dz / len;
    for (let d = 10; d < len - 4; d += 3.6) {
      const ragged = smoothstep(0.38, 0.62, valueNoise2(d * 0.05 + s * 5.3, s * 2.7, sd + 504));
      if (idxUnit(530, s, Math.floor(d), seed) > 0.62 * ragged) continue;
      const side = idxUnit(531, s, Math.floor(d), seed) < 0.5 ? -1 : 1;
      const off = side * (3.1 + idxUnit(532, s, Math.floor(d), seed) * 2.6);
      const x = sh.x + ux * d - uz * off;
      const z = sh.z + uz * d + ux * off;
      const u = idxUnit(533, s, Math.floor(d), seed);
      if (u < 0.3) clump(x, z, shrubSize(idxUnit(534, s, Math.floor(d), seed)), true);
      else add(x, z, 1, tussSize(idxUnit(535, s, Math.floor(d), seed)), true);
    }
  }

  src = 'D';
  // (D) Skirts round the tree groups, to 1.5 crown radii, heavier on one side. Some groups carry none.
  const groves = [];
  for (const t of trees) groves.push(t);
  for (const list of [hinterland.scatter, hinterland.belts, hinterland.rimWoods]) for (const t of list ?? []) groves.push(t);
  for (let i = 0; i < groves.length; i += 1) {
    const t = groves[i];
    const gk = t.group !== undefined ? t.group : Math.round(t.x / 40) * 977 + Math.round(t.z / 40);
    if (idxUnit(540, gk, 0, seed) > 0.36) continue;
    const pa = patchAt(t.x, t.z);
    if (pa < 0.08 && idxUnit(541, gk, 1, seed) > 0.25) continue;
    const crownR = Math.max(1.6, 0.30 * (t.scale ?? 6));
    const lee = idxUnit(542, gk, 2, seed) * TAU;
    const n = idxUnit(543, i, 0, seed) < 0.65 ? 1 : 2;
    for (let k = 0; k < n; k += 1) {
      const ang = lee + (idxUnit(544, i, k, seed) + idxUnit(545, i, k, seed) - 1) * Math.PI * 0.9;
      const dist = crownR * (0.95 + idxUnit(546, i, k, seed) * 0.6);
      const x = t.x + Math.cos(ang) * dist;
      const z = t.z + Math.sin(ang) * dist;
      const u = idxUnit(547, i, k, seed);
      if (idxUnit(548, i, k, seed) < 0.70) clump(x, z, Math.min(tune ? 4.2 : 2.8, shrubSize(u) * (0.8 + crownR * 0.06)), true);
      else add(x, z, 1, tussSize(u), true);
    }
  }

  src = 'C';
  // (C) Hollows and gullies: where the relief is concave. The probe is two curvatures, so a crease and a bowl both count.
  {
    const P = 11;
    const d = T.hollowD;
    const R = HINTERLAND.outer - 24;
    const reach = Math.ceil(R / P);
    for (let gi = -reach; gi <= reach; gi += 1) {
      for (let gj = -reach; gj <= reach; gj += 1) {
        const x = cx + gi * P + (idxUnit(550, gi, gj, seed) - 0.5) * P * 0.9;
        const z = cz + gj * P + (idxUnit(551, gi, gj, seed) - 0.5) * P * 0.9;
        if (Math.hypot(x - cx, z - cz) > R) continue;
        if (maskAt(x, z) < 0.5) continue;
        const pa = patchAt(x, z);
        if (idxUnit(552, gi, gj, seed) > 0.25 + 0.75 * pa) continue;
        const h0 = ground(x, z);
        const lap = (ground(x + d, z) + ground(x - d, z) + ground(x, z + d) + ground(x, z - d) - 4 * h0) / (d * d);
        const w = smoothstep(T.hollowLo, T.hollowHi, lap);
        if (idxUnit(553, gi, gj, seed) > w * 0.95) continue;
        const n = 2 + Math.floor(idxUnit(554, gi, gj, seed) * 4);
        for (let k = 0; k < n; k += 1) {
          const a = idxUnit(555, gi * 7 + k, gj, seed) * TAU;
          const rr = Math.sqrt(idxUnit(556, gi * 7 + k, gj, seed)) * 4.5;
          const px = x + Math.cos(a) * rr; const pz = z + Math.sin(a) * rr;
          const u = idxUnit(557, gi * 7 + k, gj, seed);
          if (u < 0.5) clump(px, pz, shrubSize(idxUnit(558, gi * 7 + k, gj, seed)));
          else add(px, pz, 1, tussSize(idxUnit(559, gi * 7 + k, gj, seed)));
        }
      }
    }
  }

  src = 'E';
  // (E) Broad patches: whole hillsides differ. A patch is a gathering with a dense heart and a ragged rim.
  {
    const P = 36;
    const R = HINTERLAND.outer - 24;
    const reach = Math.ceil(R / P);
    for (let gi = -reach; gi <= reach; gi += 1) {
      for (let gj = -reach; gj <= reach; gj += 1) {
        const x = cx + gi * P + (idxUnit(570, gi, gj, seed) - 0.5) * P * 0.9;
        const z = cz + gj * P + (idxUnit(571, gi, gj, seed) - 0.5) * P * 0.9;
        if (Math.hypot(x - cx, z - cz) > R) continue;
        if (maskAt(x, z) < 0.5) continue;
        const pb = broadAt(x, z);
        if (idxUnit(572, gi, gj, seed) > 0.16 + pb * 0.72) continue;
        const rad = 12 + idxUnit(573, gi, gj, seed) * 18;
        const n = Math.round(rad * rad * 0.34);
        for (let k = 0; k < n; k += 1) {
          const a = idxUnit(574, gi * 31 + k, gj, seed) * TAU;
          const f = Math.sqrt(idxUnit(575, gi * 31 + k, gj, seed));
          const px = x + Math.cos(a) * rad * f; const pz = z + Math.sin(a) * rad * f;
          // holes inside the patch, so it is a gathering and not a disc
          if (valueNoise2(px / 9, pz / 9, sd + 505) < 0.32) continue;
          const heart = 1 - f;
          const u = idxUnit(576, gi * 31 + k, gj, seed);
          if (idxUnit(577, gi * 31 + k, gj, seed) < 0.42 + 0.40 * heart) { if (tune) clump(px, pz, Math.min(4.5, shrubSize(u) * (1 + 0.15 * heart))); else add(px, pz, 0, Math.min(3.6, shrubSize(u) * (1 + 0.3 * heart)), false, heart > 0.4 ? 0.55 : 0.8); }
          else add(px, pz, 1, tussSize(u));
        }
      }
    }
  }

  src = 'F';
  // (F) Open paddock is grazed: only a scattered tussock, more in the patchy country.
  {
    const P = 12;
    const R = HINTERLAND.outer - 24;
    const reach = Math.ceil(R / P);
    for (let gi = -reach; gi <= reach; gi += 1) {
      for (let gj = -reach; gj <= reach; gj += 1) {
        const x = cx + gi * P + (idxUnit(580, gi, gj, seed) - 0.5) * P * 0.95;
        const z = cz + gj * P + (idxUnit(581, gi, gj, seed) - 0.5) * P * 0.95;
        if (Math.hypot(x - cx, z - cz) > R) continue;
        if (idxUnit(582, gi, gj, seed) > 0.15 + 0.30 * patchAt(x, z)) continue;
        if (maskAt(x, z) < 0.5) continue;
        if (idxUnit(584, gi, gj, seed) < 0.22) add(x, z, 0, 1.5 + idxUnit(585, gi, gj, seed) * 0.9);
        else add(x, z, 1, tussSize(idxUnit(583, gi, gj, seed)));
      }
    }
  }

  src = 'G';
  // (G) W23-C gap fill: where a pasture of any size carries almost nothing, one broad patch, so no paddock is bare.
  if (tune) {
    const P = T.fillCell;
    const R = HINTERLAND.outer - 24;
    const reach = Math.ceil(R / P);
    const near = (x, z, rad) => {
      let c = 0;
      for (const o of out) if (Math.abs(o.x - x) < rad && Math.abs(o.z - z) < rad && Math.hypot(o.x - x, o.z - z) < rad) c += 1;
      return c;
    };
    for (let gi = -reach; gi <= reach; gi += 1) {
      for (let gj = -reach; gj <= reach; gj += 1) {
        const x = cx + gi * P + (idxUnit(610, gi, gj, seed) - 0.5) * P * 0.8;
        const z = cz + gj * P + (idxUnit(611, gi, gj, seed) - 0.5) * P * 0.8;
        if (Math.hypot(x - cx, z - cz) > R) continue;
        if (idxUnit(612, gi, gj, seed) > 0.7) continue;
        if (maskAt(x, z) < 0.5) continue;
        if (cropAt(x, z) || workedParcelAt(x, z, seed).arable) continue;
        if (near(x, z, T.fillReach) >= T.fillMin) continue;
        const rad = 9 + idxUnit(613, gi, gj, seed) * 8;
        const n = Math.round(rad * rad * 0.2);
        for (let k = 0; k < n; k += 1) {
          const a = idxUnit(614, gi * 31 + k, gj, seed) * TAU;
          const f = Math.sqrt(idxUnit(615, gi * 31 + k, gj, seed));
          const px = x + Math.cos(a) * rad * f; const pz = z + Math.sin(a) * rad * f;
          if (valueNoise2(px / 9, pz / 9, sd + 506) < 0.34) continue;
          const u = idxUnit(616, gi * 31 + k, gj, seed);
          if (idxUnit(617, gi * 31 + k, gj, seed) < 0.40 + 0.35 * (1 - f)) clump(px, pz, shrubSize(u));
          else add(px, pz, 1, tussSize(u));
        }
      }
    }
  }

  src = 'H';
  // (H) W23-C: the headland margin between a crop paddock and its neighbour carries a broken strip of tussock and shrub, so a crop paddock edge reads
  // as a fenced field edge and not a cut. Strips are ragged by a 38 m noise; some edges stay clean.
  if (tune) {
    const P = 5;
    const R = HINTERLAND.outer - 24;
    const reach = Math.ceil(R / P);
    for (let gi = -reach; gi <= reach; gi += 1) {
      for (let gj = -reach; gj <= reach; gj += 1) {
        if (idxUnit(620, gi, gj, seed) > 0.16) continue;
        const x = cx + gi * P + (idxUnit(621, gi, gj, seed) - 0.5) * P;
        const z = cz + gj * P + (idxUnit(622, gi, gj, seed) - 0.5) * P;
        if (Math.hypot(x - cx, z - cz) > R) continue;
        if (valueNoise2(x / 38, z / 38, sd + 507) < 0.46) continue;
        const c0 = cropAt(x, z);
        const d = 2.5 + idxUnit(623, gi, gj, seed) * 3;
        if (cropAt(x + d, z) === c0 && cropAt(x - d, z) === c0 && cropAt(x, z + d) === c0 && cropAt(x, z - d) === c0) continue;
        const u = idxUnit(624, gi, gj, seed);
        if (idxUnit(625, gi, gj, seed) < 0.30) clump(x, z, shrubSize(u), true);
        else add(x, z, 1, tussSize(u), true);
      }
    }
  }

  // Caps and the far thinning, both by a stable hash of the instance's own place.
  const keep = [];
  for (const t of out) {
    const r = Math.hypot(t.x - cx, t.z - cz);
    const far = smoothstep(T.farFrom, T.farTo, r);
    const h = idxUnit(590, Math.round(t.x * 3), Math.round(t.z * 3), seed);
    if (h > 1 - far * (1 - T.farKeep)) continue;
    keep.push(t);
  }
  const trim = (kind, cap) => {
    const list = keep.filter((t) => t.kind === kind);
    if (list.length <= cap) return list;
    list.sort((a, b) => idxUnit(591, Math.round(a.x * 3), Math.round(a.z * 3), seed) - idxUnit(591, Math.round(b.x * 3), Math.round(b.z * 3), seed));
    return list.slice(0, cap);
  };
  return trim(0, caps.shrub).concat(trim(1, caps.tussock));
}

/**
 * taste-r1 (W27, on by default since W28): the paddock tier. 1 lays groups of scrub on painted pasture (see `paddockTuftPlacements`) with a
 * material of its own that fades out between 550 and 700 m of view distance. 0 builds nothing and leaves the tufts and their shader text
 * as they were at wave twenty-seven. It shipped off in W27, when tussocks alone read as loose pale dots at station 18 and as specks of 2 to
 * 3 px at station 19. W28 gave each group one to three olive shrub anchors (2.4 to 4.5 m across) on a contact shade, with larger tussocks
 * in the anchors' hue, and the pair then read as scrub in rough pasture at both stations (GATE-W28-2026-10-13.md).
 * Browser: `?paddockTufts=0` restores the earlier picture; node: `DD_PADDOCK_TUFTS=0`; tests may call `setPaddockTufts`.
 */
export let PADDOCK_TUFTS = (typeof process !== 'undefined' && process?.env?.DD_PADDOCK_TUFTS !== undefined)
  ? Number(process.env.DD_PADDOCK_TUFTS) > 0 ? 1 : 0
  : (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('paddockTufts') === '0' ? 0 : 1);
export function setPaddockTufts(v) { PADDOCK_TUFTS = v ? 1 : 0; }

/**
 * taste-w19 (W29): the paddock tier's seat and its tussock value. 1: (a) no anchor or tussock stands, or seats a foot, on ground under
 * `seatFloor` (0.9 m; W28 gated the centre at 0.7 and the 4 m anchors then seated their lowest footprint point on the beach edge's 0.4 to 0.7 m);
 * the placement tests the footprint and the build drops any item whose seated height is under the floor, with the tussocks of a group that has
 * lost every anchor; (b) the tussock's colour is the W29 recipe (`tussockGainSeat`, `tussockTintSeat`): its cards, tilted 33 degrees up on every side
 * (`tuftForm`), take the sun and the sky on all sides where an anchor's radial cards keep a shaded flank, so at W28's 0.78 they read paler and greyer.
 * 0 restores wave twenty-eight exactly. Browser: `?paddockSeat=0`; node: `DD_PADDOCK_SEAT=0`; tests may call `setPaddockSeat`.
 */
export let PADDOCK_SEAT = (typeof process !== 'undefined' && process?.env?.DD_PADDOCK_SEAT !== undefined)
  ? Number(process.env.DD_PADDOCK_SEAT) > 0 ? 1 : 0
  : (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('paddockSeat') === '0' ? 0 : 1);
export function setPaddockSeat(v) { PADDOCK_SEAT = v ? 1 : 0; }

export const PADDOCK_TUFT_PARAMS = {
  capHigh: 9000, // clumps; whole groups are dropped to meet it (the triangle ceiling below binds first)
  capMedium: 4000,
  triMax: 90000, // triangles of the whole tier: a tussock form is 10, 12 or 14 (variant 0, 1, 2), a shrub 31, 33 or 35
  cell: 15, // metres of the group seed grid
  gate: 0.55, // share of eligible pasture cells that carry a group (the patch noise moves it about this)
  anchors: [2, 3], // W28: shrub anchors of a group that has company (the scrub shrub's form), touching, of unlike size
  loneShare: 0.30, // of groups: a lone anchor
  anchorW: [2.4, 4.5], // metres across (the form is 1 m across; its height is the width times the variant's ratio, `TUFT_SHRUB_RATIO`)
  anchorGain: 0.42, // W28: value of an anchor against the scrub shrub's recipe: olive, under the paddock and above the crowns (pass 1 at 0.60 read as the paddock's own value)
  tussockGain: 0.78, // a tussock's value against an anchor's (pass 2: its cards face the sun and read pale and grey at 0.42 alongside)
  anchorTint: [0.90, 1.05, 0.92], // linear channel gains: the paddock's light is warm, so olive wants less red and a little more green than leafA
  anchorStraw: 0.05, // the most straw an anchor takes (the low end of the hue roll); the scrub shrub's is 0.18
  tussockStraw: [0.04, 0.16], // a tussock's straw share across the hue roll (the present tussock's is 0.30 to 0.60): the anchors' hue family
  shade: { k: 0.60, dark: 0.75 }, // the contact decal under an anchor (`makeTreeShade`): radius over the anchor's width, value at its centre
  shrubTris: [31, 33, 35], // the shrub form's triangles by variant, cards on (`tuftForm`)
  tussocksN: [4, 10], // W28: tussocks gathered round the anchors; a group that fits fewer is not laid
  gather: 6, // metres from an anchor's centre inside which its tussocks gather
  width: [2.0, 3.6], // a clump's room, metres: only the spacing rule reads it (the placement is as the first build's)
  height: [0.7, 1.3],
  scaleMul: [1.8, 2.5], // the present tussock's size (0.7 to 1.3 m tall) times this (W28: 1.8 and more)
  rushShare: 0, // W28: no darker rush: every tussock is in its anchors' hue family
  hueJit: 0.06, // a clump's hue roll (the tussock recipe's 0..1) against its group's
  valJit: 0.05,
  parcelToneMax: 0.778, // worked-parcel tone under which the shader paints pasture (the rest is plough and dry gold)
  batterMax: [0.6, 0.9], // W28: a pad's spoil shoulder and stony toe above these shut a point out (`workedGroundAt` shuts them at 0.20)
  seatInner: 0.98, // W28: a landmark seat's pad (this times its radius) is shut; from there to `seatOuter` times its radius (the batter's reach) the margin is open
  seatOuter: 1.6, // where the keep-out, the venue ground and the clear filter allow, whatever the batter (the paint reads plain grass there)
  venueMax: 0.05, // W28: venue ground weight at or over which no group stands
  yMin: 0.7, // W28: metres of ground height under which no group stands (the scrub tufts' own `y < 0.7` gate)
  seatFloor: 0.9, // W29 (PADDOCK_SEAT): the floor for the centre, the footprint and the seated foot of every item
  seatRing: [0.46, 0.32], // W29: footprint radius over the item's scale (shrub, tussock): the build's own seating ring
  tussockGainSeat: 0.90, // W29 (PADDOCK_SEAT): tussockGain's replacement. Found in frame (stations 18 and 19, clear): at 0.78 the lit pixels of a tussock sat 3.6 L* under an anchor's at 18 and 1.2 over it at 19, in a hue 4 degrees greener and 7 chroma greyer; the cards' sky fill greys them
  tussockTintSeat: [1.22, 1.0, 0.70], // W29: linear channel gains on a tussock's colour at the seat switch, on top of `anchorTint`: red up and blue down against the sky fill; with the gain, x1.40 x1.15 x0.81 of W28's colour
  creekMax: 0.6, // W28: creek field (thread + 0.45 bar) under which a group may stand: the bank, never the channel (the scrub's is 0.85)
  probe: [312, 347, 150], // x, z, radius: the gate counts in `stats.probe` are taken for group cells within this reach (station 18)
};

/**
 * The paddock tier's placements, pure and deterministic. Groups seed on a jittered grid and are kept with the probability the two patch
 * noises (120 m and 47 m, as the tufts use) give; grazed ground is left between them. A group stands only on painted pasture: a worked
 * parcel whose tone the shader paints as pasture (under `parcelToneMax`) and that is not arable (an arable parcel carries faint furrows).
 * The lattice kind (`paddockKind`) is not asked: its crop rows are never mounted (`_cropRows` is only ever disposed) and the shader paints
 * every parcel from its own tone. Each clump is the present tussock (`tuftForm` kind 'tussock') at 1.2 to 1.8 times its size, with the
 * tussock's own colour recipe (leafA moved toward straw by a hue roll, a value roll) seeded per group and jittered a little per clump; one
 * W28: every group is anchored on one to three shrubs of the scrub shrub's form (2.4 to 4.5 m across, olive), the clumps are tussocks at 1.8 times
 * their size or more in the anchors' hue family, and each anchor stands on a soft contact decal (see the mesh build).
 */
function paddockTuftPlacements({ extent, seed, crust, ground, tier }) {
  const P = PADDOCK_TUFT_PARAMS;
  const T = TUFT_PARAMS;
  const cap = tier === 'high' ? P.capHigh : P.capMedium;
  const cx = extent.x * 0.5;
  const cz = extent.z * 0.5;
  const sd = (seed >>> 0) % 9973;
  const R = HINTERLAND.outer - 24;
  const patchAt = (x, z) => smoothstep(T.patchLo, T.patchHi,
    valueNoise2(x / T.patchCell, z / T.patchCell, sd + 501) * 0.7 + valueNoise2(x / 47, z / 47, sd + 502) * 0.3);
  // W28: one olive family. An anchor is the scrub shrub's recipe (leafA, a little grey-green at the top of the hue roll, at most `anchorStraw`
  // of straw at the bottom) at `anchorGain` of its value: darker than the paddock under it, lighter than the crowns. A tussock is the same
  // leafA with `tussockStraw` of straw across the hue roll (the present tussock's 0.30 to 0.60 read as pale straw at 480 m) and the same value.
  const leafA = tokenLinear(TASTE.foliage.leafA);
  const straw = tokenLinear(TASTE.ground.grassDry);
  const grey = tokenLinear(TASTE.foliage.leafGrey);
  const olive = (hue, val, strawK, greyK, gain, tint2 = null) => {
    const lin = leafA.slice();
    if (hue > 0.7) { const k = (hue - 0.7) / 0.3 * greyK; for (let ch = 0; ch < 3; ch += 1) lin[ch] += (grey[ch] - lin[ch]) * k; }
    for (let ch = 0; ch < 3; ch += 1) lin[ch] += (straw[ch] - lin[ch]) * strawK;
    const vv = TREE_GAIN * TUFT_GAIN_TUNE * (0.85 + val * 0.35) * P.anchorGain * gain;
    return lin.map((v, ch) => v * vv * P.anchorTint[ch] * (tint2 ? tint2[ch] : 1));
  };
  const shrubColour = (hue, val) => olive(hue, val, P.anchorStraw * (1 - hue), 0.15, 1);
  const seatOn = PADDOCK_SEAT > 0; // W29: the floor, the footprint test and the tussock's recipe below; 0 is wave twenty-eight
  const tussockColour = (hue, val) => olive(hue, val, P.tussockStraw[0] + (P.tussockStraw[1] - P.tussockStraw[0]) * (1 - hue), 0.10,
    seatOn ? P.tussockGainSeat : P.tussockGain, seatOn ? P.tussockTintSeat : null);
  const venueRegions = venueGroundRegions(extent);
  // W28: the worked-ground gate (`workedGroundAt`, the paint's own) with one change. It turns away every point a landmark pad's spoil shoulder or
  // stony toe touches above 0.20, a band that reaches 50 m past the pad where the shader paints plain grass; here the pad (0.98 r to 1.06 r + 6 m)
  // and the body of the bank are shut out and the foot of it is not. The draw mask (water, the outer rim) and the board's verge are as there.
  const landmarkSeats = (crust?.seats ?? []).filter((q) => LANDMARK_SEAT_IDS.has(q.id));
  const grassAt = (x, z) => {
    if (hinterlandDrawMaskAt(x, z, extent, crust) < 0.35) return false;
    const dx0 = x - cx;
    const dz0 = z - cz;
    if (Math.hypot(dx0, dz0) < sheetR0(Math.atan2(dx0, dz0), extent, HINTERLAND.innerPad + 12)) return false;
    let margin = false;
    for (const q of landmarkSeats) {
      const d = Math.hypot(x - q.x, z - q.z) / (q.radius ?? 60);
      if (d < P.seatInner) return false;
      if (d < P.seatOuter) margin = true;
    }
    if (margin) return true; // W28: a landmark seat's outer margin is open (the venue gates in `groundOk` and the clear filter at mesh time still apply)
    const b = seatBatterAt(x, z, crust?.seats);
    return b.shoulder <= P.batterMax[0] && b.toe <= P.batterMax[1];
  };
  const groundOk = (x, z) => {
    if (inVenueKeepOut(x, z)) return false;
    if (venueGroundWeight(x, z, venueRegions) >= P.venueMax) return false; // W28: venue ground is not pasture
    if (!grassAt(x, z)) return false;
    if (ground(x, z) < (seatOn ? P.seatFloor : P.yMin)) return false; // the scrub's own floor: below it the ground is the shore, and the frames show nothing standing there
    const rim = coastRimAt(x, z, extent, crust);
    if (rim.valid && rim.gate > 0.35 && rim.qm > -2.5) return false;
    const out = Math.max(-z, z - extent.z, -x, x - extent.x);
    const w = waternessAt(x, z, extent, crust); // wet ground and the creek's channel: the scrub's own bank test (`creekMax` 0.85) tightened, the paint is dark well inside it
    if (w > 0.10) return false;
    const creek = creekFieldAt(x, z, extent, crust, crust?.seats, out, w);
    return creek.thread + creek.bar * 0.45 < P.creekMax;
  };
  // W29: the item's footprint (the build's seating ring, eight points) stands on ground at or over the floor.
  const footOk = (x, z, rr) => {
    for (let q = 0; q < 8; q += 1) {
      if (ground(x + Math.cos(q * Math.PI * 0.25) * rr, z + Math.sin(q * Math.PI * 0.25) * rr) < P.seatFloor) return false;
    }
    return true;
  };
  const pastureAt = (x, z) => {
    const wp = workedParcelAt(x, z, seed);
    if (wp.tone >= P.parcelToneMax) return null; // arable parcels are painted from the same tone (faint furrows only), so they count
    return wp;
  };
  const placed = new Map(); // 4 m buckets of every clump laid, so groups that meet do not stack
  const nearPlaced = (x, z, w) => {
    const bx = Math.floor(x / 4); const bz = Math.floor(z / 4);
    for (let i = -1; i <= 1; i += 1) {
      for (let j = -1; j <= 1; j += 1) {
        const l = placed.get(`${bx + i}|${bz + j}`);
        if (l && l.some((o) => Math.hypot(o.x - x, o.z - z) < (o.w + w) * 0.42)) return true;
      }
    }
    return false;
  };
  const groups = [];
  let eligible = 0;
  const probe = { cells: 0, eligible: 0, wDraw: 0, wVerge: 0, wSeat: 0, wBatter: 0, keepOut: 0, worked: 0, rim: 0, tone: 0, firstKeepOut: 0, firstTone: 0, firstWorked: 0, firstRim: 0, passed: 0 };
  const reach = Math.ceil(R / P.cell);
  for (let gi = -reach; gi <= reach; gi += 1) {
    for (let gj = -reach; gj <= reach; gj += 1) {
      const gx = cx + gi * P.cell + (idxUnit(700, gi, gj, seed) - 0.5) * P.cell * 0.8;
      const gz = cz + gj * P.cell + (idxUnit(701, gi, gj, seed) - 0.5) * P.cell * 0.8;
      if (Math.hypot(gx - cx, gz - cz) > R) continue;
      if (Math.hypot(gx - P.probe[0], gz - P.probe[1]) < P.probe[2]) {
        // Gate counts near the probe point (station 18): each gate asked alone, then the first that turns the cell away.
        probe.cells += 1;
        if (pastureAt(gx, gz) && groundOk(gx, gz)) probe.eligible += 1;
        const gk = inVenueKeepOut(gx, gz); const gw = workedGroundAt(gx, gz, extent, crust, null) < 0.4;
        const gr = (() => { const r = coastRimAt(gx, gz, extent, crust); return r.valid && r.gate > 0.35 && r.qm > -2.5; })();
        const gt = workedParcelAt(gx, gz, seed).tone >= P.parcelToneMax;
        if (gw) { // which part of the worked-ground gate: the draw mask, the board's verge, a landmark seat's pad, a batter
          const dm = hinterlandDrawMaskAt(gx, gz, extent, crust);
          const dxb = gx - cx; const dzb = gz - cz;
          const bt = seatBatterAt(gx, gz, crust?.seats);
          const seatD = (crust?.seats ?? []).filter((q) => LANDMARK_SEAT_IDS.has(q.id)).map((q) => Math.hypot(gx - q.x, gz - q.z) - ((q.radius ?? 60) * 1.06 + 6));
          probe.wDraw += dm < 0.35 ? 1 : 0;
          probe.wVerge += Math.hypot(dxb, dzb) < sheetR0(Math.atan2(dxb, dzb), extent, HINTERLAND.innerPad + 12) ? 1 : 0;
          probe.wSeat += seatD.some((d) => d < 0) ? 1 : 0;
          probe.wBatter += Math.max(bt.shoulder, bt.toe) > 0.20 ? 1 : 0;
        }
        if (gk) probe.keepOut += 1;
        if (gw) probe.worked += 1;
        if (gr) probe.rim += 1;
        if (gt) probe.tone += 1;
        probe[gk ? 'firstKeepOut' : gt ? 'firstTone' : gw ? 'firstWorked' : gr ? 'firstRim' : 'passed'] += 1;
      }
      const wp0 = pastureAt(gx, gz);
      if (!wp0 || !groundOk(gx, gz)) continue;
      eligible += 1;
      if (idxUnit(702, gi, gj, seed) > Math.min(1, P.gate * (0.4 + 1.2 * patchAt(gx, gz)))) continue;
      const gid = gi * 100003 + gj;
      const lone = idxUnit(727, gi, gj, seed) < P.loneShare;
      const na = lone ? 1 : Math.min(P.anchors[1], P.anchors[0] + Math.floor(idxUnit(703, gi, gj, seed) * (P.anchors[1] - P.anchors[0] + 1)));
      const want = Math.round(P.tussocksN[0] + idxUnit(704, gi, gj, seed) * (P.tussocksN[1] - P.tussocksN[0]));
      const hueG = idxUnit(706, gi, gj, seed);
      const valG = idxUnit(708, gi, gj, seed);
      // Unlike sizes: the anchors' widths step round the range by 0.36 of it each, so two of a group never match.
      const u0 = idxUnit(728, gi, gj, seed);
      const widthAt = (n) => P.anchorW[0] + ((u0 + n * 0.36 + 0.03 * idxUnit(729, gi, gj, seed)) % 1) * (P.anchorW[1] - P.anchorW[0]);
      const mine = []; // the anchors, then the tussocks, of this group
      const fits = (x, z, w, rr = 0) => !mine.some((o) => Math.hypot(o.x - x, o.z - z) < (o.w + w) * 0.42) && !nearPlaced(x, z, w) && pastureAt(x, z) && groundOk(x, z)
        && (!seatOn || footOk(x, z, rr));
      // The anchors: the scrub shrub (`tuftForm` 'shrub') at `anchorW` across, its colour recipe; a companion touches one already laid.
      const anchors = [];
      for (let k = 0; k < na * 6 && anchors.length < na; k += 1) {
        const ik = gi * 61 + k;
        const variant = Math.min(2, Math.floor(idxUnit(721, ik, gj, seed) * 3));
        const scale = widthAt(anchors.length); // the form is 1 m across
        const hgt = scale * TUFT_SHRUB_RATIO[variant];
        let x = gx; let z = gz;
        if (anchors.length) {
          const o = anchors[Math.min(anchors.length - 1, Math.floor(idxUnit(731, ik, gj, seed) * anchors.length))];
          const a = idxUnit(722, ik, gj, seed) * TAU;
          const d = (o.w + scale) * (0.43 + 0.10 * idxUnit(723, ik, gj, seed));
          x = o.x + Math.cos(a) * d; z = o.z + Math.sin(a) * d;
        } else if (k > 0) break;
        if (!fits(x, z, scale, P.seatRing[0] * scale)) continue;
        const hue = Math.min(1, Math.max(0, hueG + (idxUnit(724, ik, gj, seed) - 0.5) * 0.3));
        const val = Math.min(1, Math.max(0, valG + (idxUnit(725, ik, gj, seed) - 0.5) * 0.3));
        const anchor = { kind: 'shrub', x, z, y: 0, w: scale, h: hgt, scale, variant, yaw: idxUnit(726, ik, gj, seed) * TAU, col: shrubColour(hue, val), rush: false, group: gid, tris: P.shrubTris[variant] };
        anchors.push(anchor);
        mine.push(anchor);
      }
      if (!anchors.length) continue;
      // The tussocks gather within `gather` metres of an anchor, outside its body.
      const clumps = [];
      for (let k = 0; k < want * 5 && clumps.length < want; k += 1) {
        const ik = gi * 61 + k;
        const o = anchors[Math.min(anchors.length - 1, Math.floor(idxUnit(730, ik, gj, seed) * anchors.length))];
        const a = idxUnit(710, ik, gj, seed) * TAU;
        const lo = Math.min(o.w * 0.4, P.gather - 1);
        const f = lo + Math.sqrt(idxUnit(711, ik, gj, seed)) * (P.gather - lo);
        const x = o.x + Math.cos(a) * f;
        const z = o.z + Math.sin(a) * f;
        const u = idxUnit(712, ik, gj, seed);
        const w = P.width[0] + u * (P.width[1] - P.width[0]);
        const hgt = P.height[0] + Math.min(1, Math.max(0, u * 0.7 + idxUnit(713, ik, gj, seed) * 0.3)) * (P.height[1] - P.height[0]);
        const scale = (0.7 + u * 0.6) * (P.scaleMul[0] + idxUnit(717, ik, gj, seed) * (P.scaleMul[1] - P.scaleMul[0]));
        if (!fits(x, z, w, P.seatRing[1] * scale)) continue;
        const hue = Math.min(1, Math.max(0, hueG + (idxUnit(714, ik, gj, seed) - 0.5) * 2 * P.hueJit));
        const val = Math.min(1, Math.max(0, valG + (idxUnit(715, ik, gj, seed) - 0.5) * 2 * P.valJit));
        const col = tussockColour(hue, val);
        const variant = Math.min(2, Math.floor(idxUnit(718, ik, gj, seed) * 3));
        const clump = { kind: 'tussock', x, z, y: 0, w, h: hgt, scale, variant, yaw: idxUnit(716, ik, gj, seed) * TAU, col, rush: false, group: gid, tris: 10 + 2 * variant };
        clumps.push(clump);
        mine.push(clump);
      }
      if (clumps.length >= P.tussocksN[0]) {
        groups.push({ order: idxUnit(707, gi, gj, seed), items: anchors.concat(clumps) });
        for (const c of mine) {
          const key = `${Math.floor(c.x / 4)}|${Math.floor(c.z / 4)}`;
          if (!placed.has(key)) placed.set(key, []);
          placed.get(key).push(c);
        }
      }
    }
  }
  groups.sort((a, b) => a.order - b.order);
  const out = [];
  let laid = 0;
  let tris = 0;
  let anchorsLaid = 0;
  const nearGroups = new Set();
  const nearItems = { anchors: 0, tussocks: 0 };
  for (const g of groups) {
    const gt = g.items.reduce((n, c) => n + c.tris, 0);
    if (out.length + g.items.length > cap || tris + gt > P.triMax) continue;
    laid += 1;
    tris += gt;
    for (const c of g.items) {
      c.y = ground(c.x, c.z);
      out.push(c);
      if (c.kind === 'shrub') anchorsLaid += 1;
      if (Math.hypot(c.x - P.probe[0], c.z - P.probe[1]) < P.probe[2]) { nearGroups.add(c.group); nearItems[c.kind === 'shrub' ? 'anchors' : 'tussocks'] += 1; }
    }
  }
  out.stats = {
    eligible, groups: groups.length, laid, share: laid / Math.max(1, eligible), tris, anchors: anchorsLaid, tussocks: out.length - anchorsLaid,
    near: { groups: nearGroups.size, ...nearItems }, probe,
  };
  return out;
}

export function planFringe(city, quality = 'high') {
  const tier = qualityTier(quality);
  const roles = planFringeRoles(city);
  const seed = (city.seed ?? 0) >>> 0;
  const extent = city.extent ?? { x: 272, z: 272 };
  const azCount = tier === 'high' ? 256 : tier === 'medium' ? 128 : 64;
  // The bay headlands need short radial diagonals: twelve broad rings could
  // still bridge the forty-metre hill with a >3 m green facet at close range.
  const radCount = tier === 'low' ? 8 : 24;
  const innerPad = 2.2;
  const nearR = 300;
  const farR = 720;
  const treeCap = tier === 'high' ? 500 : tier === 'medium' ? 260 : 0;
  const haze = new THREE.Color('#c5d4de');
  const river = riverPolyline(city, roles);
  const draft = { extent, roles, seed, river };
  const expansion = tier === 'low' ? [] : expansionBlocks(city, roles, seed).map((b) => {
    b.y = heightWorld(b.x, b.z, draft) + b.sy * 0.5;
    return b;
  });
  // `crust` is the edge-massing plan — the height and colour of the ground that
  // actually renders. Built once here and threaded through every placement.
  const crust = planEdgeMassing(city);
  // NOTE: no `.map(t => t.y = heightWorld(...))` here any more. That one line
  // was the floating-tree fault: it silently re-grounded every tree onto the
  // hidden annulus AFTER `treePlacements` had chosen a position, and it also
  // made the `river: []` argument inside `treePlacements` a red herring, since
  // its result never survived. Trees now keep the crust height they were
  // planted at.
  const trees = treePlacements(city, roles, seed, treeCap, crust);
  const crestTrees = crestTreePlacements(extent, seed, crust, tier); // W27: [] at CREST_TREES 0 and at the low tier
  const hinterland = hinterlandPlacements(city, roles, seed, tier, crust);
  if (HINTERLAND_SCRUB_TUFTS > 0 && tier !== 'low') {
    // W22-A: the low layer is card-built tufts in gatherings. It replaces the old scrub scatter and the blob shrubs at the feet of the groups.
    hinterland.scrub = [];
    hinterland.tufts = tuftPlacements({
      extent, seed, crust, hinterland, trees, tier,
      ground: (x, z) => hinterlandGroundAt(x, z, extent, crust, seed),
    });
  } else if (trees.shrubs?.length && tier !== 'low') {
    // W20-B: the shrubs at the feet of the hinterland groups join the existing scrub family (one instanced mesh, no new draw call).
    hinterland.scrub.push(...trees.shrubs);
  }
  if (PADDOCK_TUFTS > 0 && tier !== 'low') {
    // W27: the paddock tier, its own list so the tufts above are untouched.
    hinterland.paddockTufts = paddockTuftPlacements({
      extent, seed, crust, tier,
      ground: (x, z) => hinterlandGroundAt(x, z, extent, crust, seed),
    });
  }
  for (const p of river) p.y = heightWorld(p.x, p.z, draft) + 0.05;
  const hillsAz = edgeOutAzimuth(roles.hillsEdge);
  const inlandAz = edgeOutAzimuth(roles.inlandEdge);
  let azDelta = inlandAz - hillsAz;
  while (azDelta > Math.PI) azDelta -= TAU;
  while (azDelta < -Math.PI) azDelta += TAU;
  const alpine = {
    azimuth: hillsAz + azDelta * 0.5,
    radius: 840,
    peaks: [140, 170, 120],
  };
  const snowMinDist = Math.hypot(
    Math.sin(alpine.azimuth) * alpine.radius,
    Math.cos(alpine.azimuth) * alpine.radius,
  );
  // `tris` / `budget` account the LEGACY terrain plan only — the annulus pair,
  // the expansion ghosts, the alpine band and the far-sea plane, four of which
  // are hidden at runtime. `fringe.test.mjs` pins `budget <= 40_000` against
  // exactly that set, so the hinterland is accounted separately rather than
  // folded in; the honest whole-layer figure is the measured scene census in
  // the lane note, not either of these numbers.
  const tris = {
    annulus: azCount * radCount * 2,
    headlandSlopes: 480,
    verge: 64 * 2,
    farSea: 6,
    alpine: 800,
    river: 400,
    expansion: expansion.length * 12,
    trees: trees.length * 40,
  };
  const budget = Object.values(tris).reduce((s, n) => s + n, 0);
  /**
   * 224 × 34 on high. `OVERLAY_AZ_COUNT` is 224, matching the live overlay so
   * `overlayPitchAt` filters against the pitch that is actually drawn.
   *
   * ── WHY THE RADIAL COUNT COMES DOWN FROM 49 ──
   *
   * The budget is on the two SHEETS and it is 16,665 (T4's 16,544 + 20 %).
   * T4 met it by spending on the overlay and punching seat-clearance HOLES in
   * it; BA2 then vetoed those holes as grey voids, T5 removed the seat gates
   * from the draw mask, and the drawn area roughly doubled at the same
   * tessellation. Measured on the live build with T5's mask, the overlay drew
   * about 10,476 triangles against T4's reported 7,584 — the budget was already
   * about 15 % over before this lane opened. Closing the un-drawn ring at the
   * apron adds one more quad ring (448).
   *
   * The area is not negotiable: the sheet has to cover the seats (BA2 4 and 6)
   * and it has to reach the board (fault 2). So the count comes out of the
   * RADIAL rings, and the walk is re-biased so it comes out of the FAR half
   * only. The old walk was `t = 0.62u + 0.38u²` over 49 rings; this is
   * `t = 0.4301u + 0.5699u²` over 34, which is chosen so that the first ring
   * step is unchanged to three figures:
   *
   *   near  Δt = 0.4301/34 = 0.01265  ==  0.62/49 = 0.01265   (≈ 6.0 m at r 150)
   *   rim   Δt = (0.4301 + 2·0.5699)/34 = 0.0462  vs  0.0282  (21.9 m vs 13.4 m)
   *
   * At the rim the azimuthal pitch is 2π·611/224 = 17.1 m, so radial becomes
   * the binding axis there by about 19 % — `overlayPitchAt` under-reports by
   * that much at r > 560 and nowhere else, and `ring-metrics.js` is outside
   * this lane's edit list so the fit is left as the approximation it already
   * declares itself to be. Inside r 560 the azimuthal axis still binds and it
   * is computed exactly, so every filter sized by `overlayPitchAt` is unchanged
   * where it was already correct.
   *
   * Sheets after: crust 8,960 (T4's, untouched) + overlay ≈ 7,580 = ≈ 16,540.
   */
  const hinterlandAz = tier === 'high' ? 224 : 128;
  const hinterlandRad = tier === 'high' ? 34 : 32;
  const hinterlandTris = tier === 'low' ? 0 : (
    hinterlandAz * hinterlandRad * 2
    + hinterland.hedges.length * 24
    + (hinterland.belts.length + hinterland.scatter.length) * 40
    + hinterland.scrub.length * 24
    + (hinterland.tufts?.length ?? 0) * 24
    + (hinterland.paddockTufts?.reduce((n, c) => n + c.tris, 0) ?? 0)
    + hinterland.windrows.length * 24
    + hinterland.dams.length * 12
    + hinterland.sheds.length * 44
    + hinterland.bales.length * 24
    + (hinterland.stock?.length ?? 0) * 28
    + (hinterland.rimWoods?.length ?? 0) * 180
    + (trees.length + hinterland.belts.length) * 4
  );
  return {
    roles,
    seed,
    extent,
    azCount,
    radCount,
    innerPad,
    nearR,
    farR,
    haze: { r: haze.r, g: haze.g, b: haze.b },
    river,
    expansion,
    trees,
    crestTrees,
    alpine,
    snowMinDist,
    budget,
    tris,
    crust,
    hinterland,
    hinterlandAz,
    hinterlandRad,
    hinterlandTris,
    quality: tier,
  };
}

/**
 * taste-r1 (W27): the paddock tier's material, its own instance so no other fringe shader changes. It is the tussock's recipe (vertex colours,
 * `applyFoliageDetail` with puff and cards: the cards are lit by their own normals, as the scrub tussocks beside them are) and, in the vertex
 * stage after the foliage block, an envelope on the view distance of the instance: full to 550 m, nothing by 700 m. `PADDOCK_TUFT_NEAR`
 * (metres, or null) adds a near fade. The first build's up-lit normal, vertical gradient and ground-form gains are gone: the tussock's cards
 * carry their own tone from foot to tip and light themselves.
 */
export const PADDOCK_TUFT_NEAR = null;
function paddockTuftMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.98, metalness: 0, vertexColors: true });
  mat.name = 'fringe:paddock-tuft';
  const near = PADDOCK_TUFT_NEAR;
  const nearGlsl = near ? `ptEnv *= smoothstep(${near[0].toFixed(1)}, ${near[1].toFixed(1)}, ptD);` : '';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float ptD = length((modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
  float ptEnv = 1.0 - smoothstep(550.0, 700.0, ptD);
  ${nearGlsl}
  transformed *= ptEnv;
}`);
  };
  mat.customProgramCacheKey = () => `paddock-tuft-w27t-${near ? near.join('_') : 'n'}`;
  applyFoliageDetail(mat, { puff: true, cards: true }); // chains: the foliage block runs first, the envelope after it
  return mat;
}

function noPick(mesh) {
  mesh.castShadow = false;
  mesh.raycast = () => {};
}

/**
 * ── T10: THE RING'S PLANTING CASTS AGAIN, AND THE OLD NOTE WAS STALE ──
 *
 * `noPick` does two unrelated jobs in one call — it takes a mesh out of the
 * picking set AND it turns its shadow off — so every family that wanted the
 * first got the second, and the ring's trees, hedges and windbreaks have never
 * thrown a shadow. Two comments in this file justify that as a fact about the
 * rig: "the key light's shadow camera is fitted to the board and does not reach
 * r ~500". That was true when it was written and is not true now.
 * `LightingRig._fitShadow` was changed in P16 to fit the KEY'S SHADOW CAMERA TO
 * THE VIEW FRUSTUM'S GROUND FOOTPRINT rather than to a band around the orbit
 * target, so at any pose that frames the ring the ring is inside the map.
 *
 * The floor was measured before the flag moved rather than assumed: the
 * orchestrator's `noshadow` toggle on the transport plate put shadowed crust at
 * 0.70-0.74 of its own unshadowed value (corridor 78.7 vs 113.2, hinterland
 * 103.9 vs 140.9, city 76.4 vs 111.2). That is a lit shadow, not the crushed
 * pass T9 measured on the OLD crust albedo, so the thing that made T9 turn the
 * shadows off is gone and what remains is a tree standing on grass with no
 * shadow — which is the single loudest "pasted on" cue at this camera height.
 *
 * The multiply contact decals stay. They do a different job: they survive at
 * poses where the shadow map does not reach, and they sit UNDER the canopy where
 * a cast shadow is occluded by the canopy itself.
 */
function noPickCasting(mesh, receive = true) {
  mesh.castShadow = true;
  mesh.receiveShadow = receive;
  mesh.raycast = () => {};
}

function paintAnnulusColors(geo, plan, hazeColor, far) {
  const pos = geo.getAttribute('position');
  const colAttr = geo.getAttribute('color');
  const col = new THREE.Color();
  const haze = hazeColor.clone();
  const { extent } = plan;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    col.copy(colorWorld(x, z, plan, haze));
    if (far) {
      const d = Math.max(0, outDist(x, z, extent));
      col.lerp(haze, clamp01((d - 500) / 400) * 0.18);
    }
    colAttr.setXYZ(i, col.r, col.g, col.b);
  }
  colAttr.needsUpdate = true;
}

function makeAnnulus(plan, far, hazeColor) {
  const { extent, azCount, radCount, innerPad, nearR, farR, roles } = plan;
  const hx = extent.x * 0.5;
  const hz = extent.z * 0.5;
  const cx = hx;
  const cz = hz;
  const r0 = far ? nearR : 0;
  const r1 = far ? farR : nearR;
  const positions = [];
  const colors = [];
  const indices = [];
  const col = new THREE.Color();
  const haze = hazeColor.clone();
  for (let ia = 0; ia <= azCount; ia += 1) {
    const az = (ia / azCount) * TAU - Math.PI;
    const boardR = rayToSquare(az, hx, hz);
    const inner = boardR + innerPad;
    for (let ir = 0; ir <= radCount; ir += 1) {
      const u = ir / radCount;
      const r = lerp(Math.max(inner, r0), r1, u);
      const x = cx + Math.sin(az) * r;
      const z = cz + Math.cos(az) * r;
      const h = heightWorld(x, z, plan);
      positions.push(x, h, z);
      col.copy(colorWorld(x, z, plan, haze));
      if (far) col.lerp(haze, clamp01((Math.max(0, outDist(x, z, extent)) - 500) / 400) * 0.18);
      colors.push(col.r, col.g, col.b);
    }
  }
  const stride = radCount + 1;
  for (let ia = 0; ia < azCount; ia += 1) {
    for (let ir = 0; ir < radCount; ir += 1) {
      const a = ia * stride + ir;
      const b = a + stride;
      const ax = positions[a * 3];
      const az = positions[a * 3 + 2];
      const bx = positions[b * 3];
      const bz = positions[b * 3 + 2];
      const c = a + 1;
      const e = b + 1;
      const cx = positions[c * 3];
      const cz = positions[c * 3 + 2];
      const ex = positions[e * 3];
      const ez = positions[e * 3 + 2];
      if (inBayFootprint(ax, az, extent, roles.bay)
        && inBayFootprint(bx, bz, extent, roles.bay)
        && inBayFootprint(cx, cz, extent, roles.bay)
        && inBayFootprint(ex, ez, extent, roles.bay)) {
        continue;
      }
      if (inHarbourFootprint(ax, az, extent, roles)
        && inHarbourFootprint(bx, bz, extent, roles)
        && inHarbourFootprint(cx, cz, extent, roles)
        && inHarbourFootprint(ex, ez, extent, roles)) {
        continue;
      }
      indices.push(a, b, c, b, e, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makeBayHeadlandSlopes(plan, hazeColor) {
  const { extent, roles } = plan;
  const seaFrom = (SHORE.waterFromWall ?? 48) - 2;
  const seaTo = SHORE.baySeaMax ?? 150;
  const seaSegments = 24;
  const acrossSegments = 5;
  const positions = [];
  const colors = [];
  const indices = [];
  const col = new THREE.Color();

  for (const side of [-1, 1]) {
    const base = positions.length / 3;
    for (let i = 0; i <= seaSegments; i += 1) {
      const u = i / seaSegments;
      const sea = lerp(seaFrom, seaTo, u);
      const inner = headlandInnerAlong(sea, extent, roles.bay);
      for (let j = 0; j <= acrossSegments; j += 1) {
        const across = HEADLAND_SLOPE_RUN * (j / acrossSegments);
        const p = shorePoint(roles.bay, extent, sea, side * (inner + across));
        positions.push(p.x, heightWorld(p.x, p.z, plan) + 0.025, p.z);
        col.copy(colorWorld(p.x, p.z, plan, hazeColor));
        colors.push(col.r, col.g, col.b);
        if (i > 0 && j > 0) {
          const row = acrossSegments + 1;
          const a = base + (i - 1) * row + j - 1;
          const b = a + 1;
          const c = base + i * row + j - 1;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'fringe:bay-headland-slopes';
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  noPick(mesh);
  return mesh;
}

function makeRiverGeometry(points) {
  const geo = new THREE.BufferGeometry();
  const positions = [];
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const w = lerp(14, 9, i / Math.max(1, points.length - 1)) * 0.5;
    const p = points[i];
    positions.push(p.x + nx * w, p.y, p.z + nz * w);
    positions.push(p.x - nx * w, p.y, p.z - nz * w);
  }
  const indices = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * ── THE RING'S FOUR TREES, DERIVED FROM THE CITY KIT'S OWN SPECIES TABLE ──
 *
 * `foliage.js` is a SEPARATE builder and stays that way — its trees carry a
 * ribboned bole, generated secondary ramification and 54–72 leaf cards per mass,
 * which is hundreds of tris each and cannot be planted 1,573 times out here. What
 * the two kits now share is the ENVELOPE: the tables below are `SPECIES_FORM`'s
 * own `clusters` and `limbs` lists from `foliage.js`, trimmed to the four or five
 * largest masses and the two heaviest limbs and left in the city kit's normalised
 * units. `TREE_FORM`'s `h` then scales each one so its crown top lands at the ring
 * height the massing was tuned for. Both kits therefore draw the same four
 * silhouettes at two budgets, and a change to the species proportions upstream is
 * a change here by inspection rather than by coincidence.
 *
 * What this replaces, and why. The four kinds were a sphere (or two concentric
 * spheres) on a cylinder — a lollipop, and rotationally symmetric, so the
 * per-instance yaw could not change a single pixel of the outline. Three critic
 * rounds read them as "cloned sphere trees" and "lollipop trees" and they were
 * right by construction: at yaw-invariance the only per-instance variable that
 * reached the silhouette was uniform scale.
 *
 * Three things fix that, and all three are in the geometry rather than in the
 * shader:
 *
 *   1. The canopy is 4–5 flattened lobes OFFSET IN PLAN. Offsets are what make
 *      yaw do work: a lobe at (0.46, ·, 0.20) swings through 2 m of arc as the
 *      instance turns, so two neighbours at different headings present different
 *      outlines from the same buffer.
 *   2. Every lobe carries a DARKER UNDERSIDE BAND in the vertex colour, sharp
 *      enough (0.24 → 0.52 of the lobe's own height) to read as a band and not a
 *      gradient. Because the lobes overlap, each band also draws the seam between
 *      one mass and the one below it, which is the layered read the reference
 *      pack's trees have and ours did not.
 *   3. The bole forks. Two tapered limbs leave the bole at the species' own
 *      `boleTop` and terminate INSIDE a lobe, never in air.
 *
 * Vertex colours are MULTIPLIERS on `instanceColor`, not colours. The note in
 * `_plantTrees` that used to forbid `vertexColors` here was correct about the
 * mechanism and wrong about the conclusion: three multiplies `vColor = color *
 * instanceColor`, so the black it saw was the missing attribute's default, not the
 * flag. Emitting a real `color` attribute — which every one of these four now does
 * — makes the flag do exactly what the band needs.
 */
const TREE_FORM = Object.freeze([
  // 0 eucalypt — tall, slim, high open crown. foliage.js SPECIES_FORM.eucalypt.
  Object.freeze({
    h: 2.62,
    boleTop: 0.66,
    boleR: 0.086,
    boleTopR: 0.042,
    seg: 5,
    limbs: Object.freeze([
      Object.freeze({ az: 1.15, reach: 0.26, rise: 0.40, r: 0.040, tipR: 0.012 }),
      Object.freeze({ az: 3.85, reach: 0.24, rise: 0.44, r: 0.038, tipR: 0.011 }),
    ]),
    lobeSeg: 5,
    lobeRing: 4,
    clusters: Object.freeze([
      Object.freeze({ x: 0.02, y: 1.22, z: 0.02, r: 0.150, flat: 0.92, tone: 1.22 }),
      Object.freeze({ x: 0.20, y: 1.10, z: 0.06, r: 0.170, flat: 0.94, tone: 1.14 }),
      Object.freeze({ x: -0.18, y: 1.14, z: -0.08, r: 0.160, flat: 0.94, tone: 1.02 }),
      Object.freeze({ x: -0.26, y: 0.98, z: 0.18, r: 0.150, flat: 0.98, tone: 0.82 }),
    ]),
  }),
  // 1 plane — straight bole, high fork, broad dome. SPECIES_FORM.plane.
  Object.freeze({
    h: 2.16,
    boleTop: 0.46,
    boleR: 0.104,
    boleTopR: 0.055,
    seg: 5,
    limbs: Object.freeze([
      Object.freeze({ az: 2.55, reach: 0.22, rise: 0.22, r: 0.046, tipR: 0.015 }),
      Object.freeze({ az: 0.35, reach: 0.20, rise: 0.24, r: 0.044, tipR: 0.014 }),
    ]),
    lobeSeg: 6,
    lobeRing: 4,
    clusters: Object.freeze([
      Object.freeze({ x: -0.06, y: 0.98, z: -0.10, r: 0.225, flat: 0.90, tone: 1.18 }),
      Object.freeze({ x: 0.24, y: 0.92, z: 0.16, r: 0.215, flat: 0.90, tone: 1.10 }),
      Object.freeze({ x: -0.30, y: 0.86, z: 0.14, r: 0.215, flat: 0.90, tone: 1.02 }),
      Object.freeze({ x: 0.04, y: 0.80, z: 0.38, r: 0.195, flat: 0.94, tone: 0.94 }),
      Object.freeze({ x: 0.36, y: 0.76, z: -0.16, r: 0.190, flat: 0.94, tone: 0.88 }),
    ]),
  }),
  // 2 jacaranda — low fork, nearly flat limbs, wide layered umbrella.
  Object.freeze({
    h: 1.62,
    boleTop: 0.28,
    boleR: 0.102,
    boleTopR: 0.064,
    seg: 5,
    limbs: Object.freeze([
      Object.freeze({ az: 0.55, reach: 0.50, rise: 0.30, r: 0.048, tipR: 0.014 }),
      Object.freeze({ az: 3.95, reach: 0.44, rise: 0.32, r: 0.043, tipR: 0.013 }),
    ]),
    lobeSeg: 6,
    lobeRing: 3,
    clusters: Object.freeze([
      Object.freeze({ x: 0.02, y: 0.78, z: 0.00, r: 0.215, flat: 0.64, tone: 1.20 }),
      Object.freeze({ x: 0.46, y: 0.60, z: 0.20, r: 0.205, flat: 0.68, tone: 1.02 }),
      Object.freeze({ x: -0.50, y: 0.62, z: -0.16, r: 0.200, flat: 0.68, tone: 1.10 }),
      Object.freeze({ x: -0.34, y: 0.58, z: 0.40, r: 0.200, flat: 0.68, tone: 0.88 }),
      Object.freeze({ x: 0.16, y: 0.68, z: -0.44, r: 0.195, flat: 0.68, tone: 0.84 }),
    ]),
  }),
  // 3 bottlebrush — multi-stem, low and dense. Its "fork" is two stems off the
  // ground, which is what a multi-stemmed shrub actually has.
  Object.freeze({
    h: 1.15,
    boleTop: 0.15,
    boleR: 0.085,
    boleTopR: 0.058,
    seg: 4,
    limbs: Object.freeze([
      Object.freeze({ az: 0.40, reach: 0.24, rise: 0.34, r: 0.040, tipR: 0.014 }),
      Object.freeze({ az: 3.60, reach: 0.26, rise: 0.30, r: 0.037, tipR: 0.013 }),
    ]),
    lobeSeg: 5,
    lobeRing: 4,
    clusters: Object.freeze([
      Object.freeze({ x: 0.02, y: 0.60, z: -0.02, r: 0.160, flat: 0.92, tone: 1.18 }),
      Object.freeze({ x: 0.18, y: 0.50, z: 0.10, r: 0.170, flat: 0.96, tone: 1.06 }),
      Object.freeze({ x: -0.16, y: 0.52, z: -0.12, r: 0.160, flat: 0.96, tone: 0.90 }),
      Object.freeze({ x: -0.22, y: 0.40, z: 0.18, r: 0.140, flat: 1.0, tone: 0.74 }),
    ]),
  }),
  // 4 cypress — a fifth plate-scale silhouette: a tall cone, not a lobe-ball.
  Object.freeze({
    h: 2.85,
    boleTop: 0.22,
    boleR: 0.062,
    boleTopR: 0.028,
    seg: 5,
    limbs: Object.freeze([
      Object.freeze({ az: 0.40, reach: 0.08, rise: 0.55, r: 0.028, tipR: 0.010 }),
      Object.freeze({ az: 3.50, reach: 0.07, rise: 0.62, r: 0.026, tipR: 0.009 }),
    ]),
    lobeSeg: 5,
    lobeRing: 4,
    clusters: Object.freeze([
      Object.freeze({ x: 0.00, y: 1.28, z: 0.00, r: 0.095, flat: 1.35, tone: 1.16 }),
      Object.freeze({ x: 0.04, y: 0.98, z: 0.03, r: 0.130, flat: 1.22, tone: 1.04 }),
      Object.freeze({ x: -0.05, y: 0.70, z: -0.03, r: 0.155, flat: 1.18, tone: 0.92 }),
      Object.freeze({ x: 0.06, y: 0.44, z: 0.04, r: 0.175, flat: 1.12, tone: 0.80 }),
      Object.freeze({ x: -0.04, y: 0.22, z: -0.05, r: 0.185, flat: 1.08, tone: 0.72 }),
    ]),
  }),
]);

/** Canopy underside / crown-top vertex multipliers. Warm crown, cool shade. */
const LEAF_UNDER = Object.freeze([0.38, 0.44, 0.46]);
const LEAF_TOP = Object.freeze([1.10, 1.06, 0.92]);
/**
 * Bark, as a multiplier on a green instance colour. The red coefficient has to be
 * large because the thing it multiplies has almost no red in it: at the low end of
 * the hue span (HSL 0.23 / 0.30 / 0.26) the instance colour is linear
 * (0.064, 0.095, 0.027), and (1.85, 0.55, 1.05) takes that to (0.118, 0.052, 0.029)
 * — a warm brown. At the top of the span (0.39 / 0.52 / 0.42, linear
 * (0.033, 0.366, 0.100)) the same multiplier gives (0.061, 0.201, 0.105), a pale
 * grey-green. Brown-barked through to gum-grey across the population, off one
 * attribute, with no second material and no second draw call.
 */
const BARK_MUL = Object.freeze([1.85, 0.55, 1.05]);

/** Push a THREE geometry's verts into the merge buffers with a per-vertex tint. */
function pushTreePart(part, out, tint) {
  const pos = part.getAttribute('position');
  const nrm = part.getAttribute('normal');
  const idx = part.index;
  const base = out.positions.length / 3;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    out.positions.push(x, y, z);
    // `applyMatrix4` (which `scale`/`translate`/`rotate` all route through)
    // transforms the normal attribute by the normal matrix, so the source
    // normals stay correct through the flattening and the lobes read round
    // rather than faceted. No `computeVertexNormals()` — that one averaged
    // across every part in the merged buffer.
    if (nrm) out.normals.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    else out.normals.push(0, 1, 0);
    tint(x, y, z, out.colors);
  }
  if (idx) {
    for (let i = 0; i < idx.count; i += 1) out.indices.push(idx.getX(i) + base);
  } else {
    for (let i = 0; i < pos.count; i += 1) out.indices.push(i + base);
  }
  part.dispose();
}

/** A tapered limb from `a` to `b`, as a low-poly cylinder aimed along the segment. */
function makeLimbGeometry(a, b, r0, r1, seg) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return null;
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true);
  g.translate(0, len * 0.5, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(dx / len, dy / len, dz / len),
  );
  g.applyQuaternion(q);
  g.translate(a[0], a[1], a[2]);
  return g;
}

/** The two fringe species (bible section 5), shared by the instanced trees and the windbreak row. */
const TREE_SPECIES = [
  // Eucalypt is leaf.grey pulled 75% toward leaf.green.b: the pure grey token
  // (S 21) goes slate-blue under the sky fill (measured H 198, first pass).
  { kind: 0, name: 'fringe:trees-a', base: 19.2, lo: 0.84, hi: 1.25, aspect: 0.50, colour: TASTE.foliage.leafGrey, colour2: TASTE.foliage.leafB, mix: 0.75, tint: [0.95, 1.12, 0.52] },
  { kind: 4, name: 'fringe:trees-e', base: 13.3, lo: 0.90, hi: 1.20, aspect: 0.25, colour: TASTE.foliage.leafA, tint: [1.0, 1.12, 0.55] },
];
const TREE_GAIN = 0.34;
const TUFT_GAIN_TUNE = 1.9; // W23-C: tuft value gain under HINTERLAND_TUFT_TUNE (wave twenty-two 1.45)
const TREE_FORM_TONE = 0.80;
const treeFormSpecies = (kind) => TREE_SPECIES.find((sp) => sp.kind === kind);
function treeFormOptions(species) {
  // The form's `color` is a multiplier on the INSTANCE colour (the species token in
  // linear light, tinted). Bark is pale grey on the eucalypt and dark brown-grey on the
  // cypress, so its multiplier is the bark token divided by that instance colour.
  const lin = tokenLinear(species.colour);
  if (species.colour2) {
    const other = tokenLinear(species.colour2);
    for (let ch = 0; ch < 3; ch += 1) lin[ch] += (other[ch] - lin[ch]) * species.mix;
  }
  // River red gum bark is pale but not white: the rock-light token pulled 45% toward the trunk token.
  const barkColour = species.kind === 4
    ? new THREE.Color(TASTE.foliage.trunk)
    : new THREE.Color(TASTE.ground.rockLight).lerp(new THREE.Color(TASTE.foliage.trunk), 0.45);
  const barkLin = [barkColour.r, barkColour.g, barkColour.b];
  const bark = barkLin.map((b, ch) => Math.min(6, b / Math.max(1e-4, lin[ch] * species.tint[ch])));
  return { bark, tone: TREE_FORM_TONE };
}

/**
 * W11-A: the two species the fringe plants are real forms now (tree-forms.js), built
 * in metres with their own proportions, so they are returned unscaled.
 */
function makeTreeGeometry(kind, variant = 0, formOpts = {}) {
  if (kind === 0) return eucalyptForm({ variant, tier: 'backdrop', ...formOpts });
  if (kind === 4) return cypressForm({ variant, tier: 'backdrop', ...formOpts });
  const form = TREE_FORM[Math.max(0, Math.min(TREE_FORM.length - 1, kind | 0))];
  const geometry = clusterTreeGeometry(['eucalypt', 'round', 'umbrella', 'weeping', 'cypress'][kind], `${kind}:${variant}`, { ring: true });
  geometry.scale(form.h, form.h, form.h);
  return geometry;
}

function makeAlpineGeometry(plan) {
  const { extent, alpine, seed } = plan;
  const cx = extent.x * 0.5;
  const cz = extent.z * 0.5;
  const az0 = alpine.azimuth;
  const positions = [];
  const colors = [];
  const layers = 2;
  const segs = 28;
  for (let layer = 0; layer < layers; layer += 1) {
    const radius = alpine.radius + layer * 40;
    for (let i = 0; i <= segs; i += 1) {
      const t = i / segs;
      const az = az0 + (t - 0.5) * 0.62;
      const n = valueNoise2(az * 4.2, layer * 2.1, seed);
      const peak = alpine.peaks[layer];
      const h = peak * (0.55 + 0.45 * Math.sin(t * Math.PI)) + n * 8;
      const x = cx + Math.sin(az) * radius;
      const z = cz + Math.cos(az) * radius;
      const snowAmt = clamp01((h / Math.max(1, peak) - 0.6) / 0.35);
      positions.push(x, 0, z);
      colors.push(0.30, 0.34, 0.38);
      positions.push(x, h, z);
      colors.push(
        lerp(0.30, 0.72, snowAmt),
        lerp(0.34, 0.76, snowAmt),
        lerp(0.38, 0.80, snowAmt),
      );
    }
  }
  const indices = [];
  const ring = segs + 1;
  for (let layer = 0; layer < layers; layer += 1) {
    const off = layer * ring * 2;
    for (let i = 0; i < segs; i += 1) {
      const a = off + i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makeVerge(plan) {
  const group = new THREE.Group();
  group.name = 'fringe:verges';
  const { extent, roles } = plan;
  const mat = new THREE.MeshStandardMaterial({
    color: '#3d4a3a',
    roughness: 0.96,
    metalness: 0.02,
    vertexColors: false,
  });
  const faceMat = new THREE.MeshStandardMaterial({
    color: '#665b46',
    roughness: 0.94,
    metalness: 0.03,
  });
  const landRuns = [
    { edge: roles.hillsEdge, centre: 0, length: alongLength(roles.hillsEdge, extent) },
    { edge: roles.inlandEdge, centre: 0, length: alongLength(roles.inlandEdge, extent) },
  ];
  // The Yarra edge is land except for its bay-end harbour basin. Bridge only
  // the dry run from city to annulus, leaving the quay water completely open.
  const yarraL = alongLength(roles.yarraEdge, extent);
  const harbourSign = harbourAlongSign(roles);
  landRuns.push({
    edge: roles.yarraEdge,
    centre: -harbourSign * yarraL * 0.21,
    length: yarraL * 0.58,
  });
  // Bay-end shoulders: grass that turns the two square corners into land so
  // the beach reads as one coast wrapping into port and hills, not a canal.
  const bayL = alongLength(roles.bay, extent);
  landRuns.push(
    { edge: roles.bay, centre: -bayL * 0.42, length: bayL * 0.22 },
    { edge: roles.bay, centre: bayL * 0.42, length: bayL * 0.22 },
  );
  for (const { edge, centre, length: runLength } of landRuns) {
    const grass = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    const face = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), faceMat);
    const alongX = edge === 'north' || edge === 'south';
    grass.scale.set(alongX ? runLength : 2.4, 0.18, alongX ? 2.4 : runLength);
    face.scale.set(alongX ? runLength : 0.45, 0.55, alongX ? 0.45 : runLength);
    const p = shorePoint(edge, extent, SHORE.wallOffset * 0.4, centre);
    grass.position.copy(p);
    grass.position.y = 0.05;
    face.position.copy(p).addScaledVector(edgeAxes(edge).seaward, 1.1);
    face.position.y = -0.12;
    grass.name = `fringe:verge-grass:${edge}`;
    face.name = `fringe:verge-face:${edge}`;
    noPick(grass);
    noPick(face);
    grass.receiveShadow = true;
    face.receiveShadow = true;
    group.add(grass, face);
  }
  group.userData.dispose = () => {
    mat.dispose();
    faceMat.dispose();
    group.traverse((node) => node.geometry?.dispose?.());
  };
  return group;
}

/* ------------------------------------------------------------------ *
 * Hinterland geometry. Six archetypes, all instanced, all opaque.
 * ------------------------------------------------------------------ */

/**
 * A clipped hedge: hexagonal prism lying along local X, flat face up. 24 tris
 * and not one 90-degree arris, which is gate 1's whole subject. Unit sized —
 * the instance matrix carries length, height and width.
 */
// taste-r1 W14-C: the dead `leaves = true` branch (a 1 x 2.8 x 2.5 clustered sheet) is gone; its only live
// call is `makeHedgeGeometry()` for the windrows, a six-sided rod.
function makeHedgeGeometry() {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1);
  g.rotateY(Math.PI / 6); g.rotateZ(Math.PI / 2); return g;
}

/* ------------------------------------------------------------------ *
 * taste W31 (WINDROW_FORM): where a windrow may lie, and what it looks like.
 * ------------------------------------------------------------------ */

const WR_BIT = Object.freeze({ hedge: 1, rim: 2, fence: 4, track: 8, tree: 16, venue: 32, water: 64, parcel: 128 });
export const WINDROW_GATES = Object.freeze(Object.keys(WR_BIT));

/**
 * Sweep a row along its length at `stepM` and return, for each sample, the mask of the gates it fails. `ctx` holds the
 * obstacles: `segs` [x0, z0, x1, z1, radius, bit], `pts` [x, z, radius, bit], and the callbacks `venueAt`, `waterAt` and
 * `parcelAt` (a parcel key, or null where the ground is not stubble). A sample fails a gate when the swath, its half width plus
 * `clearM`, would touch the obstacle; the venue and water tests also look `reach` to either side, the parcel test at the swath edges.
 */
function windrowSweep(row, ctx) {
  const dx = Math.sin(row.yaw);
  const dz = Math.cos(row.yaw);
  const nx = dz;
  const nz = -dx;
  const reach = ctx.clearM + ctx.halfW;
  const n = Math.max(1, Math.ceil(row.len / ctx.stepM));
  const own = ctx.parcelAt(row.x, row.z);
  const pad = row.len * 0.5 + reach + 6;
  const near = (x, z, r) => Math.abs(x - row.x) < pad + r && Math.abs(z - row.z) < pad + r;
  const segs = ctx.segs.filter((s) => near((s[0] + s[2]) * 0.5, (s[1] + s[3]) * 0.5, Math.hypot(s[2] - s[0], s[3] - s[1]) * 0.5 + s[4]));
  const pts = ctx.pts.filter((q) => near(q[0], q[1], q[2]));
  const t = [];
  const m = [];
  for (let i = 0; i <= n; i += 1) {
    const ti = -row.len * 0.5 + (row.len * i) / n;
    const x = row.x + dx * ti;
    const z = row.z + dz * ti;
    let mask = 0;
    for (const s of segs) {
      if (mask & s[5]) continue;
      const sx = s[2] - s[0];
      const sz = s[3] - s[1];
      const u = Math.max(0, Math.min(1, ((x - s[0]) * sx + (z - s[1]) * sz) / (sx * sx + sz * sz || 1)));
      if (Math.hypot(x - s[0] - u * sx, z - s[1] - u * sz) < s[4] + reach) mask |= s[5];
    }
    for (const q of pts) {
      if (mask & q[3]) continue;
      if (Math.hypot(x - q[0], z - q[1]) < q[2] + reach) mask |= q[3];
    }
    for (const o of [0, -reach, reach]) {
      if (ctx.venueAt(x + nx * o, z + nz * o)) mask |= WR_BIT.venue;
      if (ctx.waterAt(x + nx * o, z + nz * o)) mask |= WR_BIT.water;
    }
    if (own === null) mask |= WR_BIT.parcel;
    else for (const o of [0, -ctx.halfW, ctx.halfW]) if (ctx.parcelAt(x + nx * o, z + nz * o) !== own) mask |= WR_BIT.parcel;
    t.push(ti);
    m.push(mask);
  }
  return { dx, dz, t, m };
}

/** How many rows fail each gate on at least one sample, and how many are shorter than a piece may be. */
function auditWindrows(rows, ctx) {
  const out = { rows: rows.length, short: 0 };
  for (const g of WINDROW_GATES) out[g] = 0;
  for (const row of rows) {
    const sw = windrowSweep(row, ctx);
    const all = sw.m.reduce((a, b) => a | b, 0);
    for (const g of WINDROW_GATES) if (all & WR_BIT[g]) out[g] += 1;
    if (row.len < ctx.minPieceM) out.short += 1;
  }
  return out;
}

/**
 * Cut each row where a gate fails (keeping a sample's margin either side), then cut what is left into unequal pieces with
 * gaps between them; a piece under `minPieceM` is dropped. Returns the pieces, each a row-shaped record.
 */
function cutWindrows(rows, ctx, seed) {
  const pieces = [];
  rows.forEach((row, ri) => {
    const sw = windrowSweep(row, ctx);
    const last = sw.m.length - 1;
    const keep = (a, b) => {
      let t0 = sw.t[a];
      const t1 = sw.t[b];
      for (let k = 0; t1 - t0 >= ctx.minPieceM && k < 8; k += 1) {
        const u = idxUnit(310 + k, Math.round(row.x * 3) + ri, Math.round(row.z * 3), seed);
        let L = 7 + 12 * u;
        if (t1 - t0 - L < ctx.minPieceM + 1.2) L = t1 - t0;
        const mid = t0 + L * 0.5;
        const uw = idxUnit(330 + k, ri, Math.round(row.z * 3) + k, seed);
        const uh = idxUnit(340 + k, Math.round(row.x * 3), ri + k, seed);
        pieces.push({
          x: row.x + sw.dx * mid, z: row.z + sw.dz * mid, yaw: row.yaw, len: L, y: row.y,
          width: ctx.widthM * (0.85 + 0.3 * uw), height: ctx.heightM * (0.85 + 0.3 * uh), hue: row.hue, row: ri,
        });
        t0 += L + 1.2 + 2.2 * idxUnit(320 + k, ri, Math.round(row.x * 3) + k, seed);
      }
    };
    let a = -1;
    for (let i = 0; i <= last + 1; i += 1) {
      const ok = i <= last && sw.m[i] === 0;
      if (ok && a < 0) a = i;
      if (!ok && a >= 0) {
        if (i - 1 - a >= 2) keep(a + 1, i - 2);
        a = -1;
      }
    }
  });
  return pieces;
}

/** The triangles `makeWindrowGeometry` lays for these pieces at a ring spacing: six a ring pair, three rings a piece at the fewest. */
function windrowTriangles(pieces, ringM) {
  let tris = 0;
  for (const pc of pieces) tris += 6 * (Math.max(3, Math.round(pc.len / ringM) + 1) - 1);
  return tris;
}

/**
 * Raked hay, in world space on the ground it is given: per ring a flattened crown (two ridge points) between two feet, so a piece is
 * three facets a side that take the sun and the shade differently; the width, the height, the lateral wander and the crown's lean
 * change from ring to ring; the first and last rings are half the size and the next nearly full, so the ends are blunt and soft, not pointed; two straw tones (a gold and a
 * bleached one) blend along the piece, the feet darker than the crown. Non-indexed, flat normals. No end caps and no underside.
 */
function makeWindrowGeometry(pieces, { sampleY, seed, ringM }) {
  const toneA = new THREE.Color().setHSL(0.122, 0.40, 0.26, THREE.SRGBColorSpace);
  const toneB = new THREE.Color().setHSL(0.140, 0.34, 0.37, THREE.SRGBColorSpace);
  const c = new THREE.Color();
  const pos = [];
  const col = [];
  pieces.forEach((pc, pid) => {
    const dx = Math.sin(pc.yaw);
    const dz = Math.cos(pc.yaw);
    const nx = dz;
    const nz = -dx;
    const n = Math.max(3, Math.round(pc.len / ringM) + 1);
    const key = Math.round(pc.x * 3) + Math.round(pc.z * 7);
    const rings = [];
    for (let k = 0; k < n; k += 1) {
      const u = (s) => idxUnit(350 + s, key + k * 17, pid + 5, seed);
      const t = -pc.len * 0.5 + (pc.len * k) / (n - 1);
      const end = k === 0 || k === n - 1;
      const env = end ? 0.5 : (k === 1 || k === n - 2) ? 0.94 : 1;
      const lat = (valueNoise2(t * 0.17 + pid * 3.7, 4.1, seed) - 0.5) * 0.45 + (u(1) - 0.5) * 0.14;
      const cx = pc.x + dx * t + nx * lat;
      const cz = pc.z + dz * t + nz * lat;
      const w = pc.width * (0.85 + 0.4 * u(2)) * env;
      const h = pc.height * (0.5 + 0.8 * valueNoise2(t * 0.33 + pid * 5.3, 9.7, seed)) * env;
      const lean = (u(4) - 0.5) * 0.45 * w;
      const at = (o) => [cx + nx * o, cz + nz * o];
      const pts = [
        at(-w * 0.5 * (0.88 + 0.24 * u(3))),
        at(lean - w * 0.16 * (0.8 + 0.4 * u(5))),
        at(lean + w * 0.16 * (0.8 + 0.4 * u(6))),
        at(w * 0.5 * (0.88 + 0.24 * u(7))),
      ];
      const gy = pts.map((q) => sampleY(q[0], q[1]));
      const mid = (gy[0] + gy[3]) * 0.5;
      const top = Math.max(mid, gy[0], gy[3]) + 0.02;
      const crownL = Math.max(top + h * (0.82 + 0.3 * u(8)), gy[0] + 0.05);
      const crownR = Math.max(top + h * (0.82 + 0.3 * u(9)), gy[3] + 0.05);
      const ys = [gy[0] - 0.05, crownL, crownR, gy[3] - 0.05];
      const m = Math.max(0, Math.min(1, valueNoise2(t * 0.3 + pid * 2.9, 21.3, seed) * 1.25 + (u(10) - 0.5) * 0.45 + (pc.hue - 0.5) * 0.3 - 0.1));
      c.copy(toneA).lerp(toneB, m);
      const shade = [0.58, 1.1, 1.0, 0.52];
      rings.push(pts.map((q, i) => ({ p: [q[0], ys[i], q[1]], c: [c.r * shade[i], c.g * shade[i], c.b * shade[i]] })));
    }
    for (let k = 0; k + 1 < n; k += 1) {
      for (let f = 0; f < 3; f += 1) {
        const a0 = rings[k][f];
        const a1 = rings[k + 1][f];
        const b0 = rings[k][f + 1];
        const b1 = rings[k + 1][f + 1];
        for (const tri of [[a0, a1, b0], [a1, b1, b0]]) for (const v of tri) { pos.push(...v.p); col.push(...v.c); }
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function makeClusterHedgeGeometry(chains, { width, height, sampleY, seed }) {
  const parts = [];
  const color = new THREE.Color();
  for (const run of chains) for (const item of run) {
    const count = Math.max(1, Math.ceil((item.len ?? 8) / 1.3));
    const step = (item.len ?? 8) / count;
    for (let i = 0; i < count; i += 1) {
      const along = (i + 0.5 - count / 2) * step;
      const x = item.x + Math.sin(item.yaw) * along;
      const z = item.z + Math.cos(item.yaw) * along;
      const u = idxUnit(93, Math.round(x * 100), Math.round(z * 100), seed);
      const part = leafClusterGeometry(1, 1, u);
      const localWidth = 0.6 + 1.2 * (0.5 + 0.5 * Math.sin(x / 6.0 + Math.sin(z / 9.0) * 2.0));
      part.scale(localWidth * 0.57, height * (0.46 + u * 0.10), step * 0.74);
      part.rotateY(item.yaw);
      part.translate(x, sampleY(x, z) + height * 0.45, z);
      color.setHSL(0.25 + u * 0.035, 0.42, 0.30 + u * 0.04, THREE.SRGBColorSpace);
      const c = part.attributes.color;
      for (let j = 0; j < c.count; j += 1) c.setXYZ(j, c.getX(j) * color.r, c.getY(j) * color.g, c.getZ(j) * color.b);
      parts.push(part);
    }
  }
  const geometry = mergeLeafParts(parts);
  parts.forEach((part) => part.dispose());
  return geometry;
}

/**
 * Group boundary samples into contiguous polylines. Identity is the same
 * (dir, gx/gz) key `runLengthOf` uses, so a run of eight 8 m samples becomes
 * one strip instead of eight gapped prisms.
 */
function chainLineItems(items) {
  const lines = new Map();
  const loose = [];
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    if (it.dir !== 0 && it.dir !== 1) {
      loose.push(it);
      continue;
    }
    const key = it.dir === 0 ? `0:${it.gx}` : `1:${it.gz}`;
    const idx = it.dir === 0 ? it.gz : it.gx;
    const list = lines.get(key);
    if (list) list.push([idx, it]);
    else lines.set(key, [[idx, it]]);
  }
  const chains = [];
  for (const list of lines.values()) {
    list.sort((a, b) => a[0] - b[0]);
    let i = 0;
    while (i < list.length) {
      let j = i;
      while (j + 1 < list.length && list[j + 1][0] === list[j][0] + 1) j += 1;
      const run = [];
      for (let k = i; k <= j; k += 1) run.push(list[k][1]);
      chains.push(run);
      i = j + 1;
    }
  }
  for (let i = 0; i < loose.length; i += 1) chains.push([loose[i]]);
  return chains;
}

/**
 * Merged triangular-prism bank along a polyline. `width` / `height` are metres.
 * Shade-side verts are darkened from a fixed noon-ish key (az 154.5°, xz
 * (0.43, −0.90)) so the strip has a shadow side even where the key light's
 * shadow camera does not reach. No Math.random.
 */
function makeMergedBankGeometryRaw(chains, {
  width, height, sampleY, hue0 = 0.27, sat = 0.36, lit = 0.22, shade = 0.10,
  varyH = 0,
  varyWidth = false,
  seed = 0,
} = {}) {
  const positions = [];
  const colors = [];
  const indices = [];
  const halfW = width * 0.5;
  const sunX = SHADE_SUN[0]; // taste W79 (GROUND_SURFACE, G2b): 0.433, -0.901 as ever; the live sun's with the switch on
  const sunZ = SHADE_SUN[1];
  const col = new THREE.Color();
  let base = 0;
  for (let c = 0; c < chains.length; c += 1) {
    const run = chains[c];
    if (!run.length) continue;
    const stations = [];
    const first = run[0];
    const last = run[run.length - 1];
    const sy0 = Math.sin(first.yaw);
    const cy0 = Math.cos(first.yaw);
    stations.push({
      x: first.x - sy0 * (first.len ?? 8) * 0.5,
      z: first.z - cy0 * (first.len ?? 8) * 0.5,
    });
    for (let i = 0; i < run.length; i += 1) {
      stations.push({ x: run[i].x, z: run[i].z });
    }
    const sy1 = Math.sin(last.yaw);
    const cy1 = Math.cos(last.yaw);
    stations.push({
      x: last.x + sy1 * (last.len ?? 8) * 0.5,
      z: last.z + cy1 * (last.len ?? 8) * 0.5,
    });
    if (stations.length < 2) continue;
    const n = stations.length;
    for (let i = 0; i < n; i += 1) {
      const prev = stations[Math.max(0, i - 1)];
      const next = stations[Math.min(n - 1, i + 1)];
      let dx = next.x - prev.x;
      let dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const px = -dz;
      const pz = dx;
      const x = stations[i].x;
      const z = stations[i].z;
      const y = (sampleY?.(x, z) ?? 0);
      const hJitter = varyH > 0
        ? (idxUnit(210, Math.round(x), Math.round(z), seed) - 0.5) * 2 * varyH
        : 0;
      const h = Math.max(0.35, height + hJitter);
      const hue = hue0 + (run[Math.min(i, run.length - 1)]?.hue ?? 0) * 0.05;
      const leftLit = px * sunX + pz * sunZ > 0;
      /**
       * ── SIX VERTICES PER STATION, NOT THREE: A CLIPPED HEDGE HAS A TOP ──
       *
       * The three-vertex profile was base / apex / base — a triangular prism with
       * a knife ridge, which is a ploughed bank in section and not a hedge. A laid
       * stock hedge is a chamfered box: it goes up nearly vertical, turns over a
       * shoulder, and runs FLAT along the top, and the flat is what catches the
       * key and separates the run from the field behind it. Six stations give the
       * two shoulders and the crown band for two extra quads a segment.
       *
       * The two BASE vertices are the darker base band the reference hedges carry.
       * That is not decoration: the dark line at the foot is what separates a
       * hedge from its own ground at 3.71 px/m, where the cast shadow is under a
       * pixel wide, and the multiply contact ribbon underneath does the rest.
       */
      const shoulderY = y + h * 0.66;
      const crownY = y + h;
      // Nominal-width end sections join cleanly; organic swelling belongs inside
      // each connected run. Keep T13C's 0.6–2.2 m range and curved centreline.
      const localWidth = 0.6 + 1.2 * (0.5 + 0.5 * Math.sin(x / 6 + Math.sin(z / 9) * 2));
      const w = varyWidth ? halfW + (localWidth * 0.5 - halfW) * Math.sin(Math.PI * i / (n - 1)) : halfW;
      const shoulderW = w;
      const crownW = w * 0.44;
      const baseW = w * 0.88;
      const litL = leftLit ? lit : shade;
      const litR = leftLit ? shade : lit;
      const crownL = Math.min(0.92, (lit + shade) * 0.5 + lit * 0.42);
      const baseK = 0.46;
      const pushCol = (l, s2 = sat) => {
        col.setHSL(hue, s2, l, THREE.SRGBColorSpace);
        colors.push(col.r, col.g, col.b);
      };
      /**
       * ── THE BASE CORNERS TAKE THEIR OWN GROUND, NOT THE CENTRELINE'S ──
       *
       * Both base vertices used to be pushed at the STATION CENTRE's height, so
       * on cross-slope ground the downhill one hung in the air: measured on the
       * built overlay, 261 of 1,268 hedge base vertices stood more than 0.05 m
       * clear, the worst at 0.374 m. Grounding to the run's centreline was never
       * enough — `regroundRun` bounds the ALONG-slope drop, and this is the
       * ACROSS-slope one, which nothing was looking at.
       *
       * `min` of the two is the whole safety argument: it can only push a corner
       * further into the surface, which reads as a hedge on a slight bank, and it
       * can never open daylight underneath. The shoulders and the crown keep the
       * centreline's height, because a clipped hedge's top is level in section
       * even where its footing is not.
       */
      const groundAtBase = (bx, bz) => {
        const g = sampleY?.(bx, bz);
        return g === null || g === undefined ? y : Math.min(y, g) - 0.02;
      };
      const bx0 = x + px * baseW;
      const bz0 = z + pz * baseW;
      const bx1 = x - px * baseW;
      const bz1 = z - pz * baseW;
      positions.push(bx0, groundAtBase(bx0, bz0), bz0);
      pushCol(litL * baseK, sat * 1.05);
      positions.push(x + px * shoulderW, shoulderY, z + pz * shoulderW);
      pushCol(litL);
      positions.push(x + px * crownW, crownY, z + pz * crownW);
      pushCol(crownL, sat * 0.92);
      positions.push(x - px * crownW, crownY, z - pz * crownW);
      pushCol(crownL * 0.94, sat * 0.92);
      positions.push(x - px * shoulderW, shoulderY, z - pz * shoulderW);
      pushCol(litR);
      positions.push(bx1, groundAtBase(bx1, bz1), bz1);
      pushCol(litR * baseK, sat * 1.05);
    }
    const STRIDE = 6;
    for (let i = 0; i < n - 1; i += 1) {
      const a = base + i * STRIDE;
      const b = a + STRIDE;
      for (let k = 0; k < STRIDE - 1; k += 1) {
        indices.push(a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k);
      }
    }
    // End caps: the six-vertex section closed as a fan on the first base vertex.
    const s0 = base;
    const sN = base + (n - 1) * STRIDE;
    for (let k = 1; k < STRIDE - 1; k += 1) {
      indices.push(s0, s0 + k + 1, s0 + k);
      indices.push(sN, sN + k, sN + k + 1);
    }
    base += n * STRIDE;
  }
  const geo = new THREE.BufferGeometry();
  if (!positions.length) return geo;
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const uv = new Float32Array(positions.length / 3 * 2);
  for (let i = 0; i < uv.length / 2; i += 1) {
    uv[i * 2] = 0.04 + (i % 6) / 5 * 0.39;
    uv[i * 2 + 1] = (Math.floor(i / 6) % 8) / 7;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// W11-B: the fence, wall, bale, shed and stock models live in fringe/farm-models.js. The
// fence is post-and-rail: three timber rails on posts 1.3 m high at 2.67 m centres, one
// 8 m run per instance; the wall is a 9 m run of dry-stone, 1.1 m high.

// W11-A: the reed tuft and the marram clump are `reedForm` and `duneGrassForm` in
// tree-forms.js (a clump of blades, not a 20-triangle cone).

function makeCreekRibbon(plan, sampleY) {
  const { extent, crust } = plan;
  const edge = crust?.hills;
  if (!edge) return null;
  const positions = [];
  const indices = [];
  const pts = [];
  for (let along = -420; along <= 420; along += 8) {
    let best = null;
    for (let sea = 80; sea <= 280; sea += 10) {
      const p = shorePoint(edge, extent, sea, along);
      const out = Math.max(-p.z, p.z - extent.z, -p.x, p.x - extent.x);
      const c = creekFieldAt(p.x, p.z, extent, crust, crust.seats, out, 0);
      if (c.thread < 0.12) continue;
      if (!best || c.thread > best.thread) best = { x: p.x, z: p.z, thread: c.thread };
    }
    if (best) pts.push(best);
  }
  if (pts.length < 4) return null;
  const half = 5.4;
  for (let i = 0; i < pts.length; i += 1) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const yL = (sampleY?.(pts[i].x + nx * half, pts[i].z + nz * half)
      ?? surroundHeightAt(pts[i].x + nx * half, pts[i].z + nz * half, extent, crust)) + 0.04;
    const yR = (sampleY?.(pts[i].x - nx * half, pts[i].z - nz * half)
      ?? surroundHeightAt(pts[i].x - nx * half, pts[i].z - nz * half, extent, crust)) + 0.04;
    const yC = (sampleY?.(pts[i].x, pts[i].z)
      ?? surroundHeightAt(pts[i].x, pts[i].z, extent, crust)) + 0.07;
    positions.push(pts[i].x + nx * half, yL, pts[i].z + nz * half);
    positions.push(pts[i].x, yC, pts[i].z);
    positions.push(pts[i].x - nx * half, yR, pts[i].z - nz * half);
  }
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = i * 3;
    indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
    indices.push(a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/*
 * The post-and-rail fence archetype is GONE, deliberately, and this note is the
 * receipt so it is not re-added on the strength of the bar's tell 3.
 *
 * Measured on the shipped instances: the rails were 0.109 x 0.077 m in world
 * terms and the posts 0.83 x 0.128 m. This ring is seen from 150-600 m, where
 * the plate resolves about 5-7 px per metre, so a rail was 0.4-0.6 px. It could
 * not render as a rail. It aliased away and left the posts standing alone —
 * projected 5 x 25 px at aspect 0.2 — which is exactly the "posts without
 * rails" the r2 review reported as orphan slabs on open ground.
 *
 * Tell 3 is real, but it is about FOREGROUND furniture at 10-60 m. Thickening a
 * rail until it resolves at 400 m makes it a 0.4 m beam, which is a wall
 * wearing a fence's name. The honest answer at this distance is that boundaries
 * are carried by hedges, and that is what carries them.
 */

/**
 * The hinterland surface: the crust, plus this file's relief, plus the paddock
 * tint. Its lift and its tint share one mask, and the mask is zero at the
 * inner ring, at the outer rim, across the waterline and over every landmark
 * seat — so at every boundary this mesh converges on the crust in height AND
 * in colour instead of meeting it at a lip. `polygonOffset` owns the
 * coincident-depth band that convergence necessarily creates.
 */
/**
 * ── THE OVERLAY'S OWN TERMINATION WAS THE "JAGGED UNBLENDED BIOME CUT" ──
 *
 * The board round read `bd-apostles-ocean.png` as "grass-to-sand is a jagged
 * unblended biome cut", and the mechanism is in this file rather than in the
 * beach. Attributed by raycasting the graded plate's own pixels at the locked
 * pose: at (450, 250) and (450, 290) the top surface is
 * `fringe:hinterland-fields`; at (450, 320), (620, 290) and (700, 300) it is
 * gone and only `world:edge-massing:crust` is hit — and the crust's own material
 * DISCARDS every fragment inside r 616 (`attachRingAlbedo(..., clipR =
 * OVERLAY_OUTER − 8)`). So what the eye reads as "sand" seaward of that line is
 * `nature:beach-shelf` seen through a hole in the ring's ground, and the line
 * itself is this sheet's quad-level water cut: a quad is dropped when all four
 * corners read draw-mask ≤ 0.02, and the lattice is 6–16 m radially by 6–20 m
 * azimuthally, so the coast comes out as a staircase on that grid.
 *
 * Two things are done about it, both here, both costing zero triangles:
 *
 * 1. **The dead corner is moved onto the coast.** For any vertex whose mask is
 *    under the floor while a lattice neighbour is over it, the crossing is found
 *    by bisection along that edge and the vertex is placed there. The staircase
 *    becomes a fitted polyline. The vertex only ever moves TOWARD live ground, so
 *    it stays inside the quads it already belonged to and cannot fold them.
 *
 * 2. **It is then pushed a little further seaward, and that is the feather.**
 *    `bakeRingAlbedo` already paints `RING_COVER.sand` from waterness 0.10, so
 *    the extra band arrives wearing beach and dies under the foam instead of on
 *    open ground. The overshoot stops at waterness 0.60 so the sheet never
 *    reaches water deep enough to render land in the sea.
 *
 * The snap is restricted to edges where the zero is the WATER gate: `outGate`
 * over 0.10 (so the outer rim's own honest handover to the crust is untouched)
 * and r clear of the board rim (so the apron join T6B measured and closed is
 * untouched). Azimuthal neighbours wrap modulo `azCount` so the seam ray at
 * ±π sees one neighbour set and both its copies snap identically — a seam
 * handled per-side would open a crack exactly where the ring closes.
 */
function snapDrawEdgeToCoast(xs, zs, masks, azCount, radCount, extent, crust) {
  const stride = radCount + 1;
  const FLOOR = 0.02;
  const moved = [];
  const outGateAt = (r) => 1 - smoothstep(HINTERLAND.outer - HINTERLAND.outRamp, HINTERLAND.outer, r);
  const cx = extent.x * 0.5;
  const cz = extent.z * 0.5;
  const pending = [];
  for (let ia = 0; ia <= azCount; ia += 1) {
    for (let ir = 0; ir <= radCount; ir += 1) {
      const i = ia * stride + ir;
      if (masks[i] > FLOOR) continue;
      const x = xs[i];
      const z = zs[i];
      const dx = x - cx;
      const dz = z - cz;
      const r = Math.hypot(dx, dz);
      if (outGateAt(r) <= 0.10) continue;
      const r0 = sheetR0(Math.atan2(dx, dz), extent);
      if (r < r0 + 2) continue;
      // The live neighbour with the most ground under it, over the four lattice
      // edges. Azimuth wraps; radius does not.
      let best = -1;
      let bestMask = FLOOR;
      const consider = (j) => {
        if (j < 0 || j >= masks.length) return;
        if (masks[j] > bestMask) { bestMask = masks[j]; best = j; }
      };
      if (ir > 0) consider(i - 1);
      if (ir < radCount) consider(i + 1);
      for (const d of [-1, 1]) {
        const nia = ((ia + d) % azCount + azCount) % azCount;
        consider(nia * stride + ir);
      }
      if (best < 0) continue;
      // Bisect for the crossing, then overshoot seaward while the water is still
      // shallow. `t` runs from the dead vertex (0) to the live one (1).
      const ax = xs[best];
      const az2 = zs[best];
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 7; k += 1) {
        const mid = (lo + hi) * 0.5;
        const qx = x + (ax - x) * mid;
        const qz = z + (az2 - z) * mid;
        if (hinterlandDrawMaskAt(qx, qz, extent, crust) > FLOOR) hi = mid; else lo = mid;
      }
      let nx = x + (ax - x) * hi;
      let nz = z + (az2 - z) * hi;
      const ux = nx - ax;
      const uz = nz - az2;
      const ul = Math.hypot(ux, uz) || 1;
      let over = 0;
      while (over < 12) {
        const qx = nx + (ux / ul) * 2;
        const qz = nz + (uz / ul) * 2;
        if (waternessAt(qx, qz, extent, crust) > 0.60) break;
        nx = qx; nz = qz; over += 2;
      }
      pending.push({ i, nx, nz });
    }
  }
  // Applied after the sweep so a vertex's neighbours are read at their ORIGINAL
  // positions — moving in place would let one snap feed the next and walk the
  // whole dead field toward the coast.
  for (const q of pending) {
    xs[q.i] = q.nx;
    zs[q.i] = q.nz;
    // The MASK IS LEFT ALONE, and that is load-bearing. The quad-keep test reads
    // it (`all four ≤ 0.02 → drop`), so marking a snapped corner live would keep
    // the quad OUTSIDE it as well — every dead corner would drag one more ring of
    // sheet out over the water. The first pass did exactly that and the projection
    // instrument caught it: the transport plate's overlay reached pixels whose
    // world position sits at waterness 1.0.
    moved.push({ x: q.nx, z: q.nz });
  }
  return moved;
}

/**
 * taste-r1 (W22-B): FINE_SHEET refines the hinterland sheet under the trial landform. A coarse cell (about 14 m by 12 m) is
 * cut into ka by kr; the vertices on an edge it shares with a coarse neighbour are the linear interpolation of that edge, so
 * the two meet without a crack. `on` 0 (or the trial gain 0) leaves the sheet exactly as before. `box` is the trial footprint
 * (x -440..-230, z 140..350) plus a 30 m margin.
 */
export const FINE_SHEET = { on: (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('fineSheet') === '0') ? 0 : 1, ka: 3, kr: 4, box: [-470, -200, 110, 420] };

function makeHinterlandFields(plan, occ) {
  const {
    extent, crust, seed, hinterlandAz: azCount, hinterlandRad: radCount,
  } = plan;
  const hx = extent.x * 0.5;
  const hz = extent.z * 0.5;
  const positions = [];
  const uvs = [];
  const indices = [];
  const stride = radCount + 1;
  const vn = (azCount + 1) * stride;
  const xs = new Float64Array(vn);
  const zs = new Float64Array(vn);
  const masks = new Float64Array(vn);
  for (let ia = 0; ia <= azCount; ia += 1) {
    const az = (ia / azCount) * TAU - Math.PI;
    const inner = sheetR0(az, { x: hx * 2, z: hz * 2 });
    for (let ir = 0; ir <= radCount; ir += 1) {
      const u = ir / radCount;
      // Radial walk biased inward: the near half of the ring is what fills the
      // plates, and it is where a 17 m triangle showed as a shading seam. The
      // coefficients are set at the planning site (`planFringe`) so that the
      // first step is identical to the 49-ring walk's; all of the loss from the
      // ring-count cut lands past r 560.
      const t = u * 0.4301 + u * u * 0.5699;
      /**
       * ROW 1 IS SNAPPED TO THE APRON RIM, and this is a measured fix.
       *
       * `surroundHeightAt` bends hard at the board: it lerps the board rim
       * height into the hinterland over `landInnerRamp` = 14 m. The apron
       * samples that curve at five radial stations across its 8 m; the sheet
       * was CHORDING it from r0 + 3.4 to r0 + 9.6. Measured on the built
       * meshes, the apron's outer rim vertex therefore stood up to 0.996 m
       * above the sheet under it (p50 0.015, p95 0.88) — not a hole, but a
       * lip along the whole city edge, and the brief's ≤ 0.15 m.
       *
       * Putting a row exactly on the apron rim costs nothing (the ring is
       * moved, not added) and makes the two surfaces share the curve's value
       * there instead of a chord across it.
       */
      const r = ir === 1
        ? inner + (EDGE_APRON.width - HINTERLAND.innerPad)
        : lerp(inner, HINTERLAND.outer, t);
      const i = ia * stride + ir;
      xs[i] = hx + Math.sin(az) * r;
      zs[i] = hz + Math.cos(az) * r;
      // The authored seat radii are up to 32 m short of a venue's live AABB
      // (measured: Falls Creek 96 against 128), so the seat term alone let the
      // lift raise ground 2.88 m inside Falls Creek's own footprint. The live
      // occupancy clearance is the second, tighter gate.
      masks[i] = hinterlandDrawMaskAt(xs[i], zs[i], extent, crust);
    }
  }

  const coastEdge = snapDrawEdgeToCoast(xs, zs, masks, azCount, radCount, extent, crust);

  // The mask this sheet DRAWS from is `hinterlandCarryMaskAt`, not the raw
  // placement mask. It is band-limited to `overlayPitchAt(r)` in the shared
  // analytic function so the exported `hinterlandGroundAt` describes the surface
  // that is actually drawn — an earlier version of this round band-limited it
  // here, on the grid, and the export immediately stood up to 9.33 m above the
  // sheet (median 0.53, p95 4.58). One field, one carrier, one filter.
  //
  // The live occupancy clearance is folded into the SAME filter by passing it as
  // the base sampler: it is a staircase in 1/25ths on an 8 m lattice, so a point
  // sample of it steps for the same reason the gates do.
  const carryBase = (px, pz) => hinterlandMaskAt(px, pz, extent, crust)
    * (occ ? occ.clearance(px, pz) : 1);
  const carry = new Float64Array(vn);
  for (let i = 0; i < vn; i += 1) {
    const r = Math.hypot(xs[i] - hx, zs[i] - hz);
    carry[i] = hinterlandCarryMaskAt(xs[i], zs[i], extent, crust, r, carryBase);
  }

  for (let i = 0; i < vn; i += 1) {
    const x = xs[i];
    const z = zs[i];
    // Same two terms and the same ceiling as `hinterlandGroundAt`, so the built
    // sheet and the analytic sampler every venue grounds on stay one surface.
    // taste-r1 W14-C: the sheet's own height; it carries the coast brow on seaward and is discarded there.
    const base = surroundHeightSheetAt(x, z, extent, crust);
    const lift = hinterlandLiftAt(x, z, extent, crust, seed, carry[i]);
    positions.push(x, base + seatBankLiftLimitAt(lift, base, x, z, crust?.seats), z);
    const uv = [(x - (hx - RING_ALBEDO.worldHalf)) / (RING_ALBEDO.worldHalf * 2),
      (z - (hz - RING_ALBEDO.worldHalf)) / (RING_ALBEDO.worldHalf * 2)];
    uvs.push(uv[0], uv[1]);
  }
  // taste-r1 (W22-B): the finer sheet under the trial landform. Active only with the trial gain above 0; with it at 0 the
  // set is empty and nothing below this line differs from before.
  const refined = new Set();
  if (FINE_SHEET.on && LANDFORM_TRIAL.gain > 0) {
    const [bx0, bx1, bz0, bz1] = FINE_SHEET.box;
    for (let ia = 0; ia < azCount; ia += 1) {
      for (let ir = 4; ir < radCount; ir += 1) {
        const a = ia * stride + ir;
        const corners = [a, a + stride, a + 1, a + stride + 1];
        if (corners.some((k) => masks[k] < 0.9)) continue;
        let ok = false;
        for (const k of corners) {
          if (xs[k] > bx0 && xs[k] < bx1 && zs[k] > bz0 && zs[k] < bz1) ok = true;
        }
        if (ok) refined.add(ia * radCount + ir);
      }
    }
  }
  if (refined.size) {
    const ka = FINE_SHEET.ka;
    const kr = FINE_SHEET.kr;
    const vIndex = new Map();
    const has = (ia, ir) => refined.has(ia * radCount + ir);
    const fineVertex = (fa, fr) => {
      const ia = Math.floor(fa / ka);
      const ir = Math.floor(fr / kr);
      const sa = fa - ia * ka;
      const sr = fr - ir * kr;
      if (sa === 0 && sr === 0) return ia * stride + ir;
      const key = fa * 100000 + fr;
      const hit = vIndex.get(key);
      if (hit !== undefined) return hit;
      let i0 = -1;
      let i1 = -1;
      let tt = 0;
      if (sa === 0) {
        // on a coarse radial line: shared with cells (ia - 1, ir) and (ia, ir)
        if (!(has(ia - 1, ir) && has(ia, ir))) { i0 = ia * stride + ir; i1 = i0 + 1; tt = sr / kr; }
      } else if (sr === 0) {
        if (!(has(ia, ir - 1) && has(ia, ir))) { i0 = ia * stride + ir; i1 = i0 + stride; tt = sa / ka; }
      }
      let x;
      let z;
      let y;
      if (i0 >= 0) {
        x = xs[i0] + (xs[i1] - xs[i0]) * tt;
        z = zs[i0] + (zs[i1] - zs[i0]) * tt;
        y = positions[i0 * 3 + 1] + (positions[i1 * 3 + 1] - positions[i0 * 3 + 1]) * tt;
      } else {
        const az = (((fa / ka) / azCount) * TAU) - Math.PI;
        const inner = sheetR0(az, { x: hx * 2, z: hz * 2 });
        const u = (fr / kr) / radCount;
        const t = u * 0.4301 + u * u * 0.5699;
        const r = lerp(inner, HINTERLAND.outer, t);
        x = hx + Math.sin(az) * r;
        z = hz + Math.cos(az) * r;
        const cm = hinterlandCarryMaskAt(x, z, extent, crust, r, carryBase);
        const base = surroundHeightSheetAt(x, z, extent, crust);
        const lift = hinterlandLiftAt(x, z, extent, crust, seed, cm);
        y = base + seatBankLiftLimitAt(lift, base, x, z, crust?.seats);
      }
      const id = positions.length / 3;
      positions.push(x, y, z);
      uvs.push((x - (hx - RING_ALBEDO.worldHalf)) / (RING_ALBEDO.worldHalf * 2),
        (z - (hz - RING_ALBEDO.worldHalf)) / (RING_ALBEDO.worldHalf * 2));
      vIndex.set(key, id);
      return id;
    };
    for (const cell of refined) {
      const ia = Math.floor(cell / radCount);
      const ir = cell - ia * radCount;
      for (let sa = 0; sa < ka; sa += 1) {
        for (let sr = 0; sr < kr; sr += 1) {
          const fa = ia * ka + sa;
          const fr = ir * kr + sr;
          const a = fineVertex(fa, fr);
          const b = fineVertex(fa + 1, fr);
          const c = fineVertex(fa, fr + 1);
          const e = fineVertex(fa + 1, fr + 1);
          indices.push(a, c, b, b, c, e);
        }
      }
    }
  }
  for (let ia = 0; ia < azCount; ia += 1) {
    for (let ir = 0; ir < radCount; ir += 1) {
      if (refined.size && refined.has(ia * radCount + ir)) continue;
      const a = ia * stride + ir;
      const b = a + stride;
      const c = a + 1;
      const e = b + 1;
      // Nothing to add where the mask is flat zero on all four corners: that is
      // open water or past the rim, and drawing it would only put a second
      // coincident sheet over the crust.
      if (masks[a] <= 0.02 && masks[b] <= 0.02 && masks[c] <= 0.02 && masks[e] <= 0.02) continue;
      // Wound to face UP. The legacy annulus above uses (a,b,c) and is wound
      // face-down — measured mean normal Y −0.86, zero front-facing triangles
      // from any camera above the horizon. Do not copy its order.
      indices.push(a, c, b, b, c, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  // Published for the dune planting: the sheet's own terminating line, after the
  // snap, so the tussocks stand on the transition rather than on a copy of it.
  geo.userData.coastEdge = coastEdge;
  return geo;
}

/**
 * ── THE GROUND'S OWN PAINT, ON GEOMETRY THAT IS NOT THE GROUND ──
 *
 * Crop rows, the farm-track crown and the dune band are all RELIEF laid on the
 * paddock, and every one of them has to be the colour of the soil it stands in.
 * T9's contact patch is the standing lesson here: it sampled `hinterlandColorAt`,
 * the analytic paddock colour, while the ground under it renders from
 * `attachRingAlbedo`'s unique bake — and it came out BRIGHTER than its own ground.
 * Anything that guesses at the colour of the surface it sits on will be wrong
 * about it somewhere.
 *
 * So these share the ring albedo MAP and take their UVs from `ringAlbedoUv`, the
 * same function the overlay's own sheet uses. What differs between a ridge and
 * the soil beside it is then the NORMAL and nothing else, which is exactly the
 * cue the plate is missing.
 *
 * It cannot share the overlay's MATERIAL, and that is worth stating because it
 * looks like the obvious economy: `attachRingAlbedo` REPLACES the fragment normal
 * with one differentiated from the packed height texture, so a mesh wearing that
 * material is shaded as if it were the smooth ground whatever its own geometry
 * says. A ridge under it would be invisible. This material keeps its own normals
 * and pays for that with a second draw call per family.
 */

/**
 * ── CROP ROWS: A RIDGE HAS A LIT FACE AND A SHADE FACE; PAINT HAS NEITHER ──
 *
 * Two of the five crop tones (1 crop, 3 ploughed) are drilled. Row direction is
 * per FIELD, from the field's own lattice index, so a boundary hedge separates
 * two differently-oriented sets of rows — which is what actually says "two
 * paddocks" from above, and it is free: the direction has to come from somewhere
 * and the lattice index is already the field's identity.
 *
 * Every station is seated with the same `sampleGround` the hedges use, so the
 * rows follow the built sheet rather than the analytic field. Bases are pushed
 * 0.05 m under it, which can only bury.
 *
 * Row runs are clipped by testing the COARSE cell membership at each station, so
 * the rows stop at the warped field boundary rather than at a square. A run of
 * one station is dropped: a single 12 m ridge segment lying alone is the same
 * "log on the grass" fault the hedges have a floor for.
 */
/**
 * ── WHY THE WORKED GROUND CANNOT USE `hinterlandMaskAt` ──
 *
 * Measured on the built scene (`plates/T10-wip/_t10-ring.mjs`), the first pass of
 * the crop rows put 5 samples in the shell r 140-200 and 2,983 in r 500-580 —
 * exactly backwards from where the graded plates look. The gate was
 * `hinterlandMaskAt`, and that field multiplies in `seatClearAt`, which clears
 * `smoothstep(r·0.85, r·1.15 + 12, d)` around all SEVEN landmark seats. Those
 * seats sit at r 150-300, so their clearance rings cover most of the near ring
 * between them, and the transport plate's whole olive band lies between
 * Tullamarine's and Southern Cross's. Nothing this file plants through that gate
 * can ever reach the band the plate is judged on.
 *
 * `seatClearAt` is correct for what it was written for: the crust DISHES its
 * height flat under each seat and `hinterlandMaskAt` drives the overlay's LIFT
 * and TINT, which must not fight that dish. Relief laid ON the finished surface
 * has no such duty. So the worked ground takes a gate of its own:
 *
 *   · the DRAW mask (water and the outer rim) — the same field the sheet is
 *     drawn from, so rows can never appear where there is no ground;
 *   · the live occupancy grid — the honest keep-out, measured from the venues
 *     that are actually standing rather than from an authored radius;
 *   · the seat FOOTPRINT rather than its clearance — 0.98 r to 1.06 r + 6 m, so
 *     ploughing stops at the pad instead of 40 m short of it;
 *   · the crust's own batter, because a spoil shoulder and a stony toe are not
 *     ground anybody crops.
 */
export function workedGroundAt(x, z, extent, crust, occ) {
  const draw = hinterlandDrawMaskAt(x, z, extent, crust);
  if (draw < 0.35) return 0;
  // Twelve metres of verge outside the kerb line. The draw mask reaches the
  // board itself (T6B closed an un-drawn hairline there on purpose); ploughing
  // up to the apron would put a furrow against the city's own edge.
  {
    const cx0 = extent.x * 0.5;
    const cz0 = extent.z * 0.5;
    const dx0 = x - cx0;
    const dz0 = z - cz0;
    const rr = Math.hypot(dx0, dz0);
    if (rr < sheetR0(Math.atan2(dx0, dz0), extent, HINTERLAND.innerPad + 12)) return 0;
  }
  if (occ && !occ.free(x, z)) return 0;
  const seats = crust?.seats;
  if (seats) {
    for (let i = 0; i < seats.length; i += 1) {
      const seat = seats[i];
      if (!LANDMARK_SEAT_IDS.has(seat.id)) continue;
      const rad = seat.radius ?? 60;
      const d = Math.hypot(x - seat.x, z - seat.z);
      if (d < rad * 0.98) return 0;
      if (d < rad * 1.06 + 6) return 0;
    }
  }
  const batter = seatBatterAt(x, z, crust?.seats);
  if (Math.max(batter.shoulder, batter.toe) > 0.20) return 0;
  return draw;
}

function makeCropRowsRaw(plan, occ, sampleGround) {
  const { extent, crust, seed } = plan;
  const cx = extent.x * 0.5;
  const cz = extent.z * 0.5;
  const S = HINTERLAND.paddock;
  const R = HINTERLAND_WORK.cropOuterR;
  const step = HINTERLAND_WORK.cropStep;
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const col = new THREE.Color();
  let base = 0;
  let runs = 0;
  const ix0 = Math.floor((cx - R - S) / S);
  const ix1 = Math.ceil((cx + R + S) / S);
  const iz0 = Math.floor((cz - R - S) / S);
  const iz1 = Math.ceil((cz + R + S) / S);
  for (let ix = ix0; ix <= ix1; ix += 1) {
    for (let iz = iz0; iz <= iz1; iz += 1) {
      const kind = paddockKind(ix, iz, seed);
      const pitch = HINTERLAND_WORK.cropPitch[kind];
      if (!pitch) continue;
      const wx = (ix + 0.5) * S;
      const wz = (iz + 0.5) * S;
      if (Math.hypot(wx - cx, wz - cz) > R + S * 0.8) continue;
      const ang = idxUnit(24, ix, iz, seed) * Math.PI;
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      const px = -dz;
      const pz = dx;
      const rise = HINTERLAND_WORK.cropRise[kind];
      // Half-extent of the field's world footprint: half a cell plus the warp
      // the lattice is displaced by, taken on the diagonal.
      const half = S * 0.5 + HINTERLAND.paddockWarp;
      const rows = Math.ceil(half * 1.42 / pitch);
      const along = Math.ceil(half * 1.42 / step);
      for (let k = -rows; k <= rows; k += 1) {
        const ox = wx + px * k * pitch;
        const oz = wz + pz * k * pitch;
        let run = [];
        const flush = () => {
          if (run.length >= 2) {
            const tone = 0.94 + idxUnit(25, ix, iz + k, seed) * 0.12;
            /**
             * ── THE TWO FLANKS ARE KEYED TO THE SUN, NOT TO EACH OTHER ──
             *
             * The first pass gave both flanks the same multiplier and relied on
             * the lighting alone to separate them. Measured on the shroud plate,
             * that bought the hinterland band a standard deviation of ×1.19: a
             * 0.30 m ridge on a 1.55 m pitch tilts its flanks about 21°, and 21°
             * of normal against a high key is a couple of luma either side —
             * under the plate's own grain once the tilt-shift falloff has been
             * through it.
             *
             * The hedge builder in this file already solved the same problem the
             * same way, and its note says why: a fixed noon-ish key (az 154.5°,
             * xz (0.43, −0.90)) baked into the vertex colours gives a strip a
             * shade side that survives wherever the shadow map does not reach.
             * A furrow is a hedge's problem at a tenth the height.
             *
             * T10B's source-matched plate measured only 1.08x T9 standard
             * deviation, not the required 1.6x.  Widening the two floor values
             * while holding the crown fixed raises the section contrast without
             * moving its area-weighted mean: (1.72 + 0.34 + 2 * 1.06) / 4 is
             * still 1.045.  It remains a relief section, not a painted gradient.
             */
            const litLeft = -(px * SHADE_SUN[0] + pz * SHADE_SUN[1]) > 0;
            const vL = (litLeft ? 1.72 : 0.34) * tone;
            const vR = (litLeft ? 0.34 : 1.72) * tone;
            const vC = 1.06 * tone;
            for (let i = 0; i < run.length; i += 1) {
              const st = run[i];
              const uvA = ringAlbedoUv(st.x - px * pitch * 0.5, st.z - pz * pitch * 0.5, extent);
              const uvC = ringAlbedoUv(st.x, st.z, extent);
              const uvB = ringAlbedoUv(st.x + px * pitch * 0.5, st.z + pz * pitch * 0.5, extent);
              // Furrow floor, ridge crown, furrow floor.
              positions.push(st.x - px * pitch * 0.42, st.y - 0.05, st.z - pz * pitch * 0.42);
              uvs.push(uvA[0], uvA[1]);
              col.setRGB(vL, vL, vL * 0.99);
              colors.push(col.r, col.g, col.b);
              positions.push(st.x, st.y + rise, st.z);
              uvs.push(uvC[0], uvC[1]);
              col.setRGB(vC, vC, vC * 0.99);
              colors.push(col.r, col.g, col.b);
              positions.push(st.x + px * pitch * 0.42, st.y - 0.05, st.z + pz * pitch * 0.42);
              uvs.push(uvB[0], uvB[1]);
              col.setRGB(vR, vR, vR * 0.99);
              colors.push(col.r, col.g, col.b);
            }
            for (let i = 0; i < run.length - 1; i += 1) {
              const a = base + i * 3;
              const b = a + 3;
              indices.push(a, a + 1, b, a + 1, b + 1, b);
              indices.push(a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
            }
            base += run.length * 3;
            runs += 1;
          }
          run = [];
        };
        for (let t = -along; t <= along; t += 1) {
          const x = ox + dx * t * step;
          const z = oz + dz * t * step;
          const cell = paddockAt(x, z, seed);
          if (cell.ix !== ix || cell.iz !== iz) { flush(); continue; }
          if (!workedGroundAt(x, z, extent, crust, occ)) { flush(); continue; }
          run.push({ x, z, y: sampleGround(x, z) });
        }
        flush();
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.userData.runs = runs;
  if (!positions.length) return geo;
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * ── THE FARM TRACK GETS A CROWN, BECAUSE PAINT HAS NO SECTION ──
 *
 * The shed-to-board tracks are stamped into the unique albedo as a 4.8 m bed with
 * two 1.9 m pale ruts, and on the plate they read as a pale smudge with no edge —
 * which is all a stamp can be. A real formed track stands 0.10-0.18 m proud of
 * the paddock with the ruts either side of the crown, and that section is the
 * only thing that makes it catch the key differently from the field it crosses.
 *
 * The ribbon rides the SAME endpoints the stamp uses, so the crown lands on the
 * paint rather than beside it, and it wears the ring albedo so the pale ruts are
 * literally the same texels the stamp wrote.
 */
function makeFarmTrackCrowns(plan, lines, sampleGround, blocked = null) {
  if (trackFormActive()) return makeFarmTrackForm(plan.seed ?? 0, lines, sampleGround, PADDOCK_GAIN, PADDOCK_TINT, blocked);
  const { extent } = plan;
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const col = new THREE.Color();
  const STRIDE = 5;
  // 6.4 m across, not 5.0, and the crown a quarter brighter than the paddock.
  // A track is the one piece of ground furniture on this ring that reads at the
  // board-wide pose and reads BRIGHT: at 3-6 px/m it is a 20-38 px pale line, it
  // survives the tilt-shift falloff that averages the crop rows away, and its
  // sign is opposite to the cast shadows item 1 puts back — which is what keeps
  // the band's mean where it was while its spread goes up.
  // TASTE R1, bible section 8: tracks are 3.5 m wide, in ground.track, with two
  // ruts darkened 12%. The ribbon is sampled every 3 m so it follows the built
  // sheet's kinks (a 7 m step left it dipping under the ground in sawteeth, which
  // is what drew the pale grey shards), and it lies 5 cm proud of the sheet.
  const OFF = [-1.75, -0.95, 0, 0.95, 1.75];
  const RISE = [0.04, 0.05, 0.09, 0.05, 0.04];
  const TONE = [0.84, 0.88, 1.0, 0.88, 0.84];
  const trackLin = tokenLinear(TASTE.ground.track).map((v) => v * PADDOCK_GAIN);
  let base = 0;
  for (const line of lines) {
    const dx = line.x1 - line.x0;
    const dz = line.z1 - line.z0;
    const len = Math.hypot(dx, dz);
    if (len < 14) continue;
    const ux = dx / len;
    const uz = dz / len;
    const nx = -uz;
    const nz = ux;
    const n = Math.max(4, Math.round(len / 3));
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const x = line.x0 + dx * t;
      const z = line.z0 + dz * t;
      // The last two stations fade the crown out so the track dies into the
      // paddock instead of ending on a step.
      const taper = Math.min(1, Math.min(i, n - i) / 2);
      for (let k = 0; k < STRIDE; k += 1) {
        const qx = x + nx * OFF[k];
        const qz = z + nz * OFF[k];
        const uv = ringAlbedoUv(qx, qz, extent);
        positions.push(qx, sampleGround(qx, qz) + RISE[k] * (0.4 + 0.6 * taper), qz);
        uvs.push(uv[0], uv[1]);
        const v = 1 + (TONE[k] - 1) * taper;
        col.setRGB(trackLin[0] * v, trackLin[1] * v, trackLin[2] * v);
        colors.push(col.r, col.g, col.b);
      }
    }
    for (let i = 0; i < n; i += 1) {
      const a = base + i * STRIDE;
      const b = a + STRIDE;
      for (let k = 0; k < STRIDE - 1; k += 1) {
        indices.push(a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k);
      }
    }
    base += (n + 1) * STRIDE;
  }
  const geo = new THREE.BufferGeometry();
  if (!positions.length) return geo;
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}


// W11-B: stock is real cattle (2.4 m, three poses) and sheep (1.2 m, two poses), built in
// fringe/farm-models.js at true size; the instance scale is the beast's size relative to that.
// Coats: Angus (near-black) and fawn share the plain cattle geometry; a Hereford has its own
// geometry with the white face, brisket and socks in the vertex colour. The coat is picked per
// animal from its seeded tone roll.
const STOCK_POSES = [
  { name: 'fringe:hinterland-stock', build: () => makeCattleGeometry('stand'), sheep: false, hereford: false, pose: 0 },
  { name: 'fringe:hinterland-stock-graze', build: () => makeCattleGeometry('graze'), sheep: false, hereford: false, pose: 1 },
  { name: 'fringe:hinterland-stock-lying', build: () => makeCattleGeometry('lie'), sheep: false, hereford: false, pose: 2 },
  { name: 'fringe:hinterland-stock-hereford', build: () => makeCattleGeometry('stand', 'hereford'), sheep: false, hereford: true, pose: 0 },
  { name: 'fringe:hinterland-stock-hereford-graze', build: () => makeCattleGeometry('graze', 'hereford'), sheep: false, hereford: true, pose: 1 },
  { name: 'fringe:hinterland-stock-hereford-lying', build: () => makeCattleGeometry('lie', 'hereford'), sheep: false, hereford: true, pose: 2 },
  { name: 'fringe:hinterland-stock-sheep', build: () => makeSheepGeometry('stand'), sheep: true, hereford: false, pose: 0 },
  { name: 'fringe:hinterland-stock-sheep-graze', build: () => makeSheepGeometry('graze'), sheep: true, hereford: false, pose: 1 },
];
const STOCK_GAIN = 0.21;
// Per-coat trim from measuring the lit frame (the grade lifts blacks, so a near-black coat needs
// the most taking down): on-screen value should land on the coat's hex value.
const STOCK_COAT_TRIM = { angus: 0.5, hereford: 0.85, fawn: 0.9, wool: 1.0 };
const stockCoatOf = (b) => (b.sheep ? 'wool' : b.tone < 0.36 ? 'angus' : b.tone < 0.70 ? 'hereford' : 'fawn');

/**
 * Sample the height of a built heightfield's actual triangles.
 *
 * Placements are chosen from the analytic field, but what a viewer sees is the
 * linear interpolation of that field across ~20 m triangles, and the two differ
 * wherever the field turns quickly — measured at up to 3.26 m on this overlay,
 * along the waterline where the mask ramp is steep in world terms. Regrounding
 * every placed object against this sampler makes the gap identically zero by
 * construction rather than small by argument, which is the same discipline the
 * probes use: measure the rendered surface, not the function behind it.
 */
function makeSurfaceSampler(geometry, cell = 20) {
  const pos = geometry.getAttribute('position');
  const idx = geometry.index;
  const tris = [];
  const grid = new Map();
  const count = idx ? idx.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    const a = idx ? idx.getX(i) : i;
    const b = idx ? idx.getX(i + 1) : i + 1;
    const c = idx ? idx.getX(i + 2) : i + 2;
    const t = [
      pos.getX(a), pos.getY(a), pos.getZ(a),
      pos.getX(b), pos.getY(b), pos.getZ(b),
      pos.getX(c), pos.getY(c), pos.getZ(c),
    ];
    const ti = tris.push(t) - 1;
    const i0 = Math.floor(Math.min(t[0], t[3], t[6]) / cell);
    const i1 = Math.floor(Math.max(t[0], t[3], t[6]) / cell);
    const j0 = Math.floor(Math.min(t[2], t[5], t[8]) / cell);
    const j1 = Math.floor(Math.max(t[2], t[5], t[8]) / cell);
    for (let gi = i0; gi <= i1; gi += 1) {
      for (let gj = j0; gj <= j1; gj += 1) {
        const k = gi * 65536 + gj;
        const list = grid.get(k);
        if (list) list.push(ti);
        else grid.set(k, [ti]);
      }
    }
  }
  return (x, z) => {
    const list = grid.get(Math.floor(x / cell) * 65536 + Math.floor(z / cell));
    if (!list) return null;
    let best = null;
    for (let n = 0; n < list.length; n += 1) {
      const t = tris[list[n]];
      const v0x = t[3] - t[0];
      const v0z = t[5] - t[2];
      const v1x = t[6] - t[0];
      const v1z = t[8] - t[2];
      const den = v0x * v1z - v1x * v0z;
      if (Math.abs(den) < 1e-12) continue;
      const v2x = x - t[0];
      const v2z = z - t[2];
      const v = (v2x * v1z - v1x * v2z) / den;
      const w = (v0x * v2z - v2x * v0z) / den;
      const u = 1 - v - w;
      if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
      const y = u * t[1] + v * t[4] + w * t[7];
      if (best === null || y > best) best = y;
    }
    return best;
  };
}

/**
 * Contact shade under each tree: a hexagonal patch whose rim vertices sit on the
 * sampled ground and fade to the ground's own colour, so the patch has no edge
 * to read as a sticker.
 *
 * T10 note on the sentence this replaces: it said the patch has to do the whole
 * job because "the key light's shadow camera is fitted to the board and does not
 * reach r ~500". `LightingRig._fitShadow` now fits the shadow camera to the VIEW
 * FRUSTUM's ground footprint, so at a ring-facing pose the ring is inside the
 * map and the planting casts (see `noPickCasting`). The patch is kept anyway,
 * and for a reason the cast shadow cannot cover: it sits UNDER the canopy, where
 * the canopy occludes its own cast shadow, and it survives at poses whose
 * footprint does not include a given tree.
 */
/**
 * ── THE CONTACT PATCH IS A MULTIPLY DECAL NOW, AND THAT IS THE WHOLE FIX ──
 *
 * The old patch sampled `hinterlandColorAt` — the ANALYTIC paddock colour — and
 * drew an opaque disc at 0.70 of it. The ground it lies on is not that colour: the
 * overlay renders through `attachRingAlbedo`'s unique bake, and on the r15 plate
 * the bake is darker than the analytic value over most of the ring. So the patch
 * came out BRIGHTER than its own ground: crop `plates/r15/bd-shroud-void.png` at
 * (1180, 800) 180 x 120 and every tree stands on a pale saucer. That is not a
 * missing contact shadow, which is what the blind round reported; it is an
 * inverted one, and an opaque decal reading an approximation of a surface it
 * covers can never be anything else.
 *
 * A MULTIPLY blend cannot get this wrong, because it never has to know what is
 * underneath: white is a no-op and grey darkens whatever is there. So the vertex
 * colours here are MULTIPLIERS, the rim is pure white (invisible, so the polygon
 * boundary cannot show), and the material is unlit `MeshBasicMaterial` with
 * `MultiplyBlending` — unlit because a lit multiply would re-multiply the key.
 *
 * Two rings, not one, so the falloff is feathered: 0.55 at the trunk, 0.80 at
 * 0.60 of the radius, 1.0 at the rim.
 *
 * The rim is ELONGATED into the shadow direction rather than the whole disc being
 * offset. An offset patch opens daylight on the sun side, which is the fault it
 * exists to close; an elongated one is a contact patch that leans, which is what a
 * canopy's own shadow does.
 *
 * SIZE AND VALUE ARE STILL BOUNDED, and the reason is still measured. At radius
 * 0.26x scale and a 0.52 centre these patches projected 30,885 px into the
 * shroud-void frame — the same order as the 25,429 px diffuse dark region that
 * shifted a lineament detector's high-pass baseline and swallowed the very lines
 * it was measuring. They grew with tree count (944 -> 1,365) rather than by any
 * change to the patch itself, which is the failure mode to watch: a per-object
 * term whose AGGREGATE is the defect.
 */
// taste W79 (GROUND_SURFACE, G2b): the fixed key (az 154.5 deg) every CPU-baked shade side reads (hedge banks, tree shade, track shoulders). With the switch on it is the
// live key's, read from the rig's key light itself (`LightingRig.key`: the one light that holds the sun; the rig makes four directional lights, so the scene's first one is not
// a safe read) when the layer is built and at every `setProfile`, and the baked sides are rebuilt when the key has moved.
let liveSunXZ = null;
const SHADE_SUN = Object.freeze({
  get 0() { return GROUND_SURFACE.on > 0 && liveSunXZ ? liveSunXZ[0] : 0.433; },
  get 1() { return GROUND_SURFACE.on > 0 && liveSunXZ ? liveSunXZ[1] : -0.901; },
});
/**
 * The unit xz vector toward the key. `LightingRig.setTimeOfDay` moves only the key's POSITION (to the board centre plus the sun direction x reach) and leaves the key's TARGET
 * where the last frame's shadow fit put it (the focus of the view), so the position less the target is the sun direction only until a frame has run and is skewed by the
 * focus's offset from the centre in the same call as the hour changes: the baked sides then read the old key. The rig builds the key's direction from the profile's azimuth
 * (`sunDirection`), so when the profile is handed over that azimuth is the key's own direction; without one (the layer's construction, a bare scene in a test) the key's
 * position less its target's, taken from the world positions, is read.
 */
function sunXZFromKey(key, profile = null) {
  if (Number.isFinite(profile?.azimuth)) {
    const x = Math.sin(profile.azimuth), z = Math.cos(profile.azimuth), h = Math.hypot(x, z);
    return h > 1e-3 ? [x / h, z / h] : null;
  }
  if (!key?.isDirectionalLight || !key.target) return null;
  const a = key.getWorldPosition(new THREE.Vector3()), b = key.target.getWorldPosition(new THREE.Vector3());
  const x = a.x - b.x, z = a.z - b.z, h = Math.hypot(x, z);
  return h > 1e-3 ? [x / h, z / h] : null;
}
/** The key light: the one the caller hands over, else the scene's shadow-casting or first directional light (a bare scene in a test). */
function sunXZFromScene(scene, key = null, profile = null) {
  const direct = sunXZFromKey(key, profile);
  if (direct) return direct;
  let found = null;
  scene.traverse((o) => { if (o.isDirectionalLight && o.visible && (!found || (o.castShadow && !found.castShadow))) found = o; });
  return sunXZFromKey(found);
}
// The CPU-baked builders that read SHADE_SUN. With the switch on each result is remembered with its inputs (`shadeSink`, the building layer's map) and rebuilt in place
// by `rebakeShades` when the key moves; with it off nothing is remembered and the builders are called as ever.
// LS-SHADESINK: the sink is keyed by the geometry, and an entry leaves when its geometry is disposed outside a rebake, so a builder called after construction
// (a rebuild that disposes the geometry it replaces) leaves the sink as large as the live geometries it shades; before, every call was kept (GATE-W79 Open 2).
let shadeSink = null;
let shadeRebaking = false;
function sunBaked(build) {
  return (...args) => {
    const geo = build(...args);
    const sink = shadeSink;
    if (GROUND_SURFACE.on > 0 && sink && !shadeRebaking) {
      if (!sink.has(geo)) {
        const drop = () => {
          if (shadeRebaking) return; // the rebake's own dispose frees the old buffers of a geometry that stays live
          geo.removeEventListener('dispose', drop);
          if (sink.get(geo)?.drop === drop) sink.delete(geo);
        };
        geo.addEventListener('dispose', drop);
        sink.set(geo, { geo, build, args, drop });
      } else {
        const e = sink.get(geo);
        e.build = build; e.args = args;
      }
    }
    return geo;
  };
}
function rebakeShades(sink) {
  shadeRebaking = true;
  try {
    for (const e of sink.values()) {
      const fresh = e.build(...e.args);
      e.geo.dispose(); // frees the old buffers on the GPU; the geometry uploads the new ones at its next draw
      for (const name of Object.keys(e.geo.attributes)) if (!fresh.attributes[name]) e.geo.deleteAttribute(name);
      for (const name of Object.keys(fresh.attributes)) e.geo.setAttribute(name, fresh.attributes[name]);
      e.geo.setIndex(fresh.index);
      e.geo.boundingBox = null;
      if (fresh.attributes.position) e.geo.computeBoundingSphere();
    }
  } finally { shadeRebaking = false; }
}
const makeMergedBankGeometry = sunBaked(makeMergedBankGeometryRaw);
const makeCropRows = sunBaked(makeCropRowsRaw);
const makeTreeShade = sunBaked(makeTreeShadeRaw);
const makeCrestFoot = sunBaked(makeCrestFootRaw);
const makeStripContact = sunBaked(makeStripContactRaw);
/** LS-SHADESINK, for the tests: the sun-baked builder for a raw one (an entry's `build`), so a test can rebuild a live geometry after construction, and the rebake. */
export const SHADE_SINK_PROBE = Object.freeze({
  wrapperOf: (raw) => new Map([
    [makeMergedBankGeometryRaw, makeMergedBankGeometry], [makeCropRowsRaw, makeCropRows], [makeTreeShadeRaw, makeTreeShade],
    [makeCrestFootRaw, makeCrestFoot], [makeStripContactRaw, makeStripContact],
  ]).get(raw) ?? null,
  rebake: (sink) => rebakeShades(sink),
});

function makeTreeShadeRaw(plan, trees, sampleY) {
  const { extent, crust, seed } = plan;
  const positions = [];
  const colors = [];
  const indices = [];
  const SEG = 6;
  const groundY = (x, z) => sampleY?.(x, z) ?? hinterlandGroundAt(x, z, extent, crust, seed);
  let base = 0;
  for (const t of trees) {
    // Capped at 3.4 m for trees; a copse patch declares its own radius because it
    // is standing in for three to five discs that would otherwise overlap into a
    // dark blot with a lumpy edge.
    const rad = t.patchRadius ?? Math.min(2.4, Math.max(0.9, t.scale * 0.17));
    /**
     * ── OVERLAPPING MULTIPLIES COMPOUND, AND 0.55 COMPOUNDED TO BLACK ──
     *
     * A multiply is not additive shading; it is exponential in the number of
     * layers. Measured on this ground (sRGB 0.455, linear 0.1768) with the tone
     * curve the plate is graded through:
     *
     *   k = 0.55:  x1 -> 88/255   x2 -> 67   x3 -> 51   x4 -> 39
     *   k = 0.86:  x1 -> 108/255  x2 -> 101  x3 -> 94   x4 -> 88
     *
     * The first T9-wip plate with the blend working shipped at 0.55/0.62 and the
     * corridor came back with near-black moats along the hedge runs, because the
     * field divisions cross the fence-line boundaries and both cross the tree
     * discs — three and four layers wherever the dressing is densest. That is the
     * same class of fault the copse patch already fixed by construction; it just
     * had not been applied to the runs. Ground is 116/255 here, so 0.86 is a
     * contact darkening that survives four layers and still reads as contact.
     */
    /**
     * T10: 0.80 -> 0.88 on the per-tree patch. The canopy CASTS now, so the decal
     * is no longer the only grounding cue and the two compound where they overlap.
     * 0.88 is inside the band both test files pin ([0.72, 0.94]) and it is chosen
     * for what it now has to do: hold the ground under the bole, where the canopy
     * occludes its own cast shadow and nothing else darkens.
     */
    const dark = t.patchDark ?? 0.88;
    const mid = 1 - (1 - dark) * 0.45;
    positions.push(t.x, groundY(t.x, t.z) + 0.05, t.z);
    colors.push(dark, dark, dark * 1.04);
    for (let ring = 0; ring < 2; ring += 1) {
      const rk = ring === 0 ? 0.60 : 1.0;
      for (let i = 0; i < SEG; i += 1) {
        const a = (i / SEG) * TAU + t.yaw;
        const sx = Math.sin(a);
        const sz = Math.cos(a);
        // Lean into the shadow: up to +28% radius on the away-from-sun side. It was
        // +55%, which at a 2.6 m patch drew a 4 m ellipse under a 6 m tree and read
        // as a smear rather than as a footing.
        const lean = 1 + 0.28 * Math.max(0, -(sx * SHADE_SUN[0] + sz * SHADE_SUN[1]));
        const r = rad * rk * lean;
        const x = t.x + sx * r;
        const z = t.z + sz * r;
        positions.push(x, groundY(x, z) + 0.05, z);
        const v = ring === 0 ? mid : 1;
        colors.push(v, v, ring === 0 ? v * 1.03 : 1);
      }
    }
    const inner = base + 1;
    const outer = base + 1 + SEG;
    for (let i = 0; i < SEG; i += 1) {
      const j = (i + 1) % SEG;
      indices.push(base, inner + i, inner + j);
      indices.push(inner + i, outer + i, outer + j);
      indices.push(inner + i, outer + j, inner + j);
    }
    base = positions.length / 3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * taste W28 (CREST_SHADE): the far trees' foot of shade. One mesh of feathered multiply decals like `makeTreeShade`, but each foot is
 * `seg` sides by `rings` rings, the value `dark` out to `plateau` of the radius and then 1 - (1 - dark) * (1 - smoothstep(plateau, 1,
 * r / R)), exactly 1 on the last ring. Each tree carries its own radius (`patchRadius`, from its crown) and leans up to 28% farther
 * away from the sun like the legacy decal. Seated by `sampleY` (the drawn crust) + 0.05.
 */
function makeCrestFootRaw(trees, sampleY, F = CREST_SHADE) {
  const positions = [];
  const colors = [];
  const indices = [];
  const SEG = F.seg;
  const RINGS = F.rings;
  const value = (rk, dark) => 1 - (1 - dark) * (1 - smoothstep(F.plateau, 1, rk));
  // W28 (items of the join lane): feet that overlap multiplied (two at 0.6 drew 0.36: dark smudges under every clump of far trees).
  // A clump (feet that could touch, 1.28 being the lean's reach) is ONE merged foot: a grid over it whose value at each vertex is the
  // darkest of its members' own profile there, so overlap does not compound and a clump reads as the same soft shade a lone tree
  // casts. A lone tree keeps its own fan.
  const merge = true;
  const clumpOf = new Array(trees.length).fill(-1);
  const clumps = [];
  if (merge) {
    const parent = trees.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    for (let i = 0; i < trees.length; i += 1) {
      for (let j = i + 1; j < trees.length; j += 1) {
        const reach = 1.28 * (trees[i].patchRadius + trees[j].patchRadius);
        const dx = trees[i].x - trees[j].x;
        const dz = trees[i].z - trees[j].z;
        if (Math.abs(dx) < reach && Math.abs(dz) < reach && Math.hypot(dx, dz) < reach) parent[find(i)] = find(j);
      }
    }
    const byRoot = new Map();
    trees.forEach((t, i) => { const r = find(i); if (!byRoot.has(r)) byRoot.set(r, []); byRoot.get(r).push(i); });
    for (const members of byRoot.values()) if (members.length > 1) { members.forEach((i) => { clumpOf[i] = clumps.length; }); clumps.push(members); }
  }
  const profile = (t, px, pz) => {
    const dark = t.patchDark ?? F.dark;
    const dx = px - t.x;
    const dz = pz - t.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return dark;
    const lean = 1 + 0.28 * Math.max(0, -((dx / d) * SHADE_SUN[0] + (dz / d) * SHADE_SUN[1]));
    const rk = d / (t.patchRadius * lean);
    return rk >= 1 ? 1 : value(rk, dark);
  };
  let base = 0;
  trees.forEach((t, ti) => {
    if (clumpOf[ti] >= 0) return;
    const rad = t.patchRadius;
    const dark = t.patchDark ?? F.dark;
    positions.push(t.x, sampleY(t.x, t.z) + 0.05, t.z);
    colors.push(dark, dark, Math.min(1, dark * 1.04));
    for (let ring = 0; ring < RINGS.length; ring += 1) {
      const rk = RINGS[ring];
      const v = ring === RINGS.length - 1 ? 1 : value(rk, dark);
      for (let i = 0; i < SEG; i += 1) {
        const a = (i / SEG) * TAU + t.yaw;
        const sx = Math.sin(a);
        const sz = Math.cos(a);
        const lean = 1 + 0.28 * Math.max(0, -(sx * SHADE_SUN[0] + sz * SHADE_SUN[1]));
        const r = rad * rk * lean;
        const x = t.x + sx * r;
        const z = t.z + sz * r;
        positions.push(x, sampleY(x, z) + 0.05, z);
        colors.push(v, v, ring === RINGS.length - 1 ? 1 : Math.min(1, v * 1.03));
      }
    }
    const first = base + 1;
    for (let i = 0; i < SEG; i += 1) indices.push(base, first + i, first + ((i + 1) % SEG));
    for (let ring = 0; ring < RINGS.length - 1; ring += 1) {
      const inner = first + ring * SEG;
      const outer = inner + SEG;
      for (let i = 0; i < SEG; i += 1) {
        const j = (i + 1) % SEG;
        indices.push(inner + i, outer + i, outer + j);
        indices.push(inner + i, outer + j, inner + j);
      }
    }
    base = positions.length / 3;
  });
  // The merged feet: a grid over the clump's reach, cells whose four corners are all 1 dropped, the cell sized to the smallest crown
  // and widened until the clump's triangles are within the fan budget (56 a tree) it was counted at.
  const budget = 8 + 16 * (RINGS.length - 1);
  for (const members of clumps) {
    const ts = members.map((i) => trees[i]);
    let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity; let rMin = Infinity;
    for (const t of ts) {
      const r = t.patchRadius * 1.28;
      x0 = Math.min(x0, t.x - r); x1 = Math.max(x1, t.x + r); z0 = Math.min(z0, t.z - r); z1 = Math.max(z1, t.z + r);
      rMin = Math.min(rMin, t.patchRadius);
    }
    let cell = Math.max(0.3 * rMin, 0.35);
    let grid = null;
    for (let tries = 0; tries < 12; tries += 1) {
      const nx = Math.max(1, Math.ceil((x1 - x0) / cell));
      const nz = Math.max(1, Math.ceil((z1 - z0) / cell));
      const sx = (x1 - x0) / nx;
      const sz = (z1 - z0) / nz;
      const val = new Float32Array((nx + 1) * (nz + 1));
      for (let k = 0; k <= nz; k += 1) {
        for (let i = 0; i <= nx; i += 1) {
          const px = x0 + i * sx;
          const pz = z0 + k * sz;
          let v = 1;
          for (const t of ts) { const q = profile(t, px, pz); if (q < v) v = q; }
          val[k * (nx + 1) + i] = v;
        }
      }
      const cells = [];
      for (let k = 0; k < nz; k += 1) {
        for (let i = 0; i < nx; i += 1) {
          const a = k * (nx + 1) + i;
          if (val[a] < 0.9999 || val[a + 1] < 0.9999 || val[a + nx + 1] < 0.9999 || val[a + nx + 2] < 0.9999) cells.push([i, k]);
        }
      }
      grid = { nx, sx, sz, val, cells };
      if (cells.length * 2 <= budget * ts.length) break;
      cell *= 1.18;
    }
    const { nx, sx, sz, val, cells } = grid;
    const remap = new Map();
    const vert = (i, k) => {
      const key = k * (nx + 1) + i;
      let id = remap.get(key);
      if (id === undefined) {
        const x = x0 + i * sx;
        const z = z0 + k * sz;
        const v = val[key];
        id = positions.length / 3;
        positions.push(x, sampleY(x, z) + 0.05, z);
        colors.push(v, v, Math.min(1, v * 1.03));
        remap.set(key, id);
      }
      return id;
    };
    for (const [i, k] of cells) {
      const a = vert(i, k); const b = vert(i + 1, k); const c = vert(i, k + 1); const d = vert(i + 1, k + 1);
      if ((i + k) % 2 === 0) { indices.push(a, c, d); indices.push(a, d, b); } else { indices.push(a, c, b); indices.push(b, c, d); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * The same multiply decal, laid as a ribbon under a merged hedge or windbreak run.
 * Built off the SAME chains the strip itself is built from, so the shadow cannot
 * drift off the hedge when the ground shortens a run.
 */
function makeStripContactRaw(chains, { width, sampleY, dark = 0.80, cuts = null }) {
  const positions = [];
  const colors = [];
  const indices = [];
  let base = 0;
  for (let ci = 0; ci < chains.length; ci += 1) {
    const run = chains[ci];
    if (!run || run.length < 1) continue;
    const runWidth = typeof width === 'function' ? width(run) : width;
    const halfW = runWidth * 0.5;
    // 2.1 -> 1.35 of the half width. At 2.1 the ribbon under a 1.7 m hedge was
    // 3.6 m across — a shadow more than twice the width of the thing casting it,
    // which is what made the corridor read as a dark moat rather than as planting.
    const outer = halfW * 1.35;
    const full = [];
    const first = run[0];
    const last = run[run.length - 1];
    full.push({
      x: first.x - Math.sin(first.yaw) * (first.len ?? 8) * 0.5,
      z: first.z - Math.cos(first.yaw) * (first.len ?? 8) * 0.5,
    });
    for (let i = 0; i < run.length; i += 1) full.push({ x: run[i].x, z: run[i].z });
    full.push({
      x: last.x + Math.sin(last.yaw) * (last.len ?? 8) * 0.5,
      z: last.z + Math.cos(last.yaw) * (last.len ?? 8) * 0.5,
    });
    if (full.length < 2) continue;
    // taste W29 (HEDGEROW_TIDY): `cuts` are [chain, s0, s1] arc lengths along this chain's stations where the hedge stands open (a gateway at a
    // track): the ribbon is laid in the stretches between them, ending where the hedge's piece ends.
    let parts = [full];
    const here = cuts ? cuts.filter((q) => q[0] === ci).sort((p, q) => p[1] - q[1]) : null;
    if (here?.length) {
      const cum = [0];
      for (let i = 0; i < full.length - 1; i += 1) cum.push(cum[i] + Math.hypot(full[i + 1].x - full[i].x, full[i + 1].z - full[i].z));
      const total = cum[cum.length - 1];
      const ptAt = (sv) => {
        let i = 0;
        while (i < full.length - 2 && cum[i + 1] < sv) i += 1;
        const f = Math.max(0, Math.min(1, (sv - cum[i]) / Math.max(1e-6, cum[i + 1] - cum[i])));
        return { x: full[i].x + (full[i + 1].x - full[i].x) * f, z: full[i].z + (full[i + 1].z - full[i].z) * f };
      };
      parts = [];
      let from = 0;
      for (const [, c0, c1] of [...here, [0, total, total]]) {
        if (c0 - from > 0.3) {
          const part = [ptAt(from)];
          for (let i = 0; i < full.length; i += 1) if (cum[i] > from + 1e-6 && cum[i] < c0 - 1e-6) part.push(full[i]);
          part.push(ptAt(c0));
          parts.push(part);
        }
        from = Math.max(from, c1);
      }
    }
    for (const stations of parts) {
      const n = stations.length;
      for (let i = 0; i < n; i += 1) {
        const prev = stations[Math.max(0, i - 1)];
        const next = stations[Math.min(n - 1, i + 1)];
        let dx = next.x - prev.x;
        let dz = next.z - prev.z;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len;
        dz /= len;
        const px = -dz;
        const pz = dx;
        // The shaded side is the one the sun is not on, and it gets the wide half.
        const sunSide = px * SHADE_SUN[0] + pz * SHADE_SUN[1] > 0 ? 1 : -1;
        const x = stations[i].x;
        const z = stations[i].z;
        const offs = [-outer * (sunSide > 0 ? 0.45 : 1), -halfW, 0, halfW, outer * (sunSide > 0 ? 1 : 0.45)];
        const vals = [1, dark + (1 - dark) * 0.35, dark, dark + (1 - dark) * 0.35, 1];
        for (let k = 0; k < 5; k += 1) {
          const ox = x + px * offs[k];
          const oz = z + pz * offs[k];
          positions.push(ox, (sampleY?.(ox, oz) ?? 0) + 0.045, oz);
          const v = vals[k];
          colors.push(v, v, Math.min(1, v * 1.03));
        }
      }
      for (let i = 0; i < n - 1; i += 1) {
        const a = base + i * 5;
        const b = a + 5;
        for (let k = 0; k < 4; k += 1) {
          indices.push(a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k);
        }
      }
      base += n * 5;
    }
  }
  const geo = new THREE.BufferGeometry();
  if (!positions.length) return geo;
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * One material for every contact decal on the ring. Unlit, multiply-blended, no
 * depth write: it darkens the ground it lies on and does nothing anywhere else.
 */
function makeContactMaterial() {
  /**
   * ── `premultipliedAlpha: true` IS LOAD-BEARING, AND THE PLATE PROVED IT TWICE ──
   *
   * three r185's `WebGLState` rejects `MultiplyBlending` without it: it calls
   * `error('MultiplyBlending requires material.premultipliedAlpha = true')` and
   * then sets NO blend func at all, so the draw falls through to whatever state
   * was last bound and the decal paints as an OPAQUE PLATE. `waterShadowMat` in
   * port.js and `hullContact` in ships.js both carry this note already; this lane
   * shipped the first T9-wip plate without the flag and reproduced it exactly —
   * every contact patch in precisely the right place, in precisely the right
   * shape, painted near-white ON the ground instead of into it. Measured on
   * `plates/T9-wip/bd-transport-landmass.png` before the fix: the decal at
   * (684, 621) read rgb (227, 225, 223) against ground of (118, 107, 78), and
   * 9.9 % of the corridor window sat over luma 200 against r15's 1.2 %. A contact
   * shadow that lightens the ground is worse than no contact shadow.
   *
   * With the flag the func is `(DST_COLOR, ONE_MINUS_SRC_ALPHA)`, so at alpha 1
   * the result is `dst * src` — the multiply the whole design rests on. Opacity is
   * therefore left at 1 deliberately: anything less re-introduces the `dst *
   * (1 - a)` term and the rim stops being a no-op.
   *
   * `toneMapped: false` for the same reason. These vertex values are FACTORS, not
   * colours; putting them through the tone curve would make the rim something
   * other than 1 and draw the decal's own polygon edge on the ground.
   *
   * `fog: false`, and this one reverses an earlier decision in this lane. Fog on a
   * basic material mixes the fragment toward the fog colour, which out here is a
   * pale haze — attractive as "aerial perspective on a shadow" until you notice it
   * lifts the RIM off 1.0 as well, which paints a faint quad edge round every
   * patch. The rim being exactly 1 is what makes the decal edgeless, so nothing is
   * allowed to move it.
   */
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    color: '#ffffff',
    transparent: true,
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
}

/**
 * Farm dams as one merged mesh: an earth bank ring and a water disc, both with
 * their rim vertices sampled off the hinterland surface so a dam on a slope
 * still sits in its ground rather than tilting out of it.
 */
/**
 * ── TASTE R1: A FARM DAM IS A LEVEL SHEET OF WATER HELD BY AN EARTH BANK ──
 *
 * The old dam was a 12-sided polygon lying on the slope: a cream bank lightened by
 * `offsetHSL(.., +0.16)`, a near-white rim and a navy centre, with the sloping
 * paddock showing through it as green wedges. That read as a hole in the map.
 *
 * Here the water is one level plane at the height of the highest ground inside the
 * disc, so no ground can poke through it. On the downhill side the ground falls
 * away beneath that plane, so the bank rises to hold it, exactly as a real dam wall
 * does; on the uphill side it is a low lip. The outline is three seeded harmonics,
 * a smooth organic shape rather than a polygon with corners. Bank colours are
 * ground tokens: dark wet soil at the waterline, soil on the crest, and the lush
 * pasture token on the outer skirt so it meets the paddock without a seam. Water
 * colours come from the shared depth ramp (bible section 6).
 */
// W11-B: 36 -> 48 segments, so the shoreline can carry the higher harmonics below.
const DAM_SEG = 48;
const DAM_GAIN = PADDOCK_GAIN;

/**
 * Dam outline: the radius at angle `a`. Three low harmonics give the organic blob; three
 * higher ones and one promontory break it into a shoreline that is not a regular polygon.
 */
function damEdge(dam, seed) {
  const k = (n) => idxUnit(n, Math.round(dam.x), Math.round(dam.z), seed) * TAU;
  const p1 = k(330);
  const p2 = k(331);
  const p3 = k(332);
  const p4 = k(333);
  const p5 = k(334);
  const p6 = k(335);
  const bay = k(336);
  const bayDir = idxUnit(337, Math.round(dam.x), Math.round(dam.z), seed) < 0.5 ? -1 : 1;
  return (a) => dam.radius * (1 + 0.085 * Math.sin(2 * a + p1) + 0.055 * Math.sin(3 * a + p2)
    + 0.030 * Math.sin(5 * a + p3)
    + 0.024 * Math.sin(7 * a + p4) + 0.016 * Math.sin(11 * a + p5) + 0.010 * Math.sin(16 * a + p6)
    + bayDir * 0.075 * Math.exp(-(1 - Math.cos(a - bay)) * 9));
}

/** Level, crest and outline of one dam, cached on the dam record. */
function damShape(plan, dam, sampleY) {
  if (dam._shape) return dam._shape;
  const { extent, crust, seed } = plan;
  const groundY = (x, z) => sampleY?.(x, z) ?? hinterlandGroundAt(x, z, extent, crust, seed);
  const edge = damEdge(dam, seed);
  let top = groundY(dam.x, dam.z);
  for (let ring = 0; ring < 3; ring += 1) {
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * TAU;
      const r = edge(a) * (0.45 + ring * 0.30);
      top = Math.max(top, groundY(dam.x + Math.sin(a) * r, dam.z + Math.cos(a) * r));
    }
  }
  const level = top + 0.08;
  dam._shape = { edge, level, crest: level + 0.30, groundY };
  return dam._shape;
}

function makeHinterlandDams(plan, dams, sampleY) {
  // W11-B: the bank is built in fringe/farm-models.js: wet lip, shore, a grassed crest on a
  // 1:3 batter (a raised wall where the ground falls away), and two trampled stock margins of
  // bare soil. The bank wears the paddock's own albedo scale; its material is given the
  // paddock sheet's environment response at the call site.
  const gain = (hex, k = 1) => tokenLinear(hex).map((v) => v * DAM_GAIN * k);
  const colors = {
    mud: gain(TASTE.ground.soil, 0.55),
    crest: tokenLinear(TASTE.ground.soil).map((v, i) => (v + tokenLinear(TASTE.ground.grassLush)[i]) * 0.5 * DAM_GAIN),
    skirt: gain(TASTE.ground.grassLush),
    soil: gain(TASTE.ground.soil, 0.85),
  };
  return makeDamBankGeometry(dams.map((dam) => {
    const { edge, level, crest, groundY } = damShape(plan, dam, sampleY);
    return { x: dam.x, z: dam.z, level, crest, edge, groundY };
  }), { seg: DAM_SEG, colors });
}

/**
 * ── THE WATER LEAVES THE DAM MESH, BECAUSE PAINT AND WATER ARE NOT ONE
 *    MATERIAL RESPONSE ──
 *
 * The dam was one merged mesh at roughness 0.44 / metalness 0.08 carrying both
 * the earth bank and the "water", which is why the blind round could only read it
 * as a dark disc: a surface that answers the environment the same way spoil does
 * is spoil, whatever colour it is painted. The disc is now its own mesh with its
 * own material — roughness 0.09, metalness 0.30, a real envMap response — so it
 * takes a specular off the sky the bank around it cannot.
 *
 * Two vertex tones do the rest: a near-black centre and a lighter rim shallow,
 * which is how a farm dam actually reads from above (deep in the middle, silt and
 * reflected bank at the edge).
 */
function makeHinterlandDamWater(plan, dams, sampleY) {
  const positions = [];
  const colors = [];
  const indices = [];
  // The shared depth ramp (bible section 6), foam first. A dam is a 2 m bowl, so
  // the centre reads water.mid, the shoulder water.shallow and the rim foam
  // blended 50% with the bank mud it lies on.
  const stops = [
    [0, new THREE.Color(...tokenLinear(TASTE.water.foam).map((v, i) => (v
      + tokenLinear(TASTE.ground.soil)[i] * 0.55) * 0.5))],
    [0.5, new THREE.Color(...tokenLinear(TASTE.water.shallow))],
    [2, new THREE.Color(...tokenLinear(TASTE.water.mid))],
    [6, new THREE.Color(...tokenLinear(TASTE.water.midDeep))],
  ];
  const ramp = (depth, out) => {
    for (let k = 1; k < stops.length; k += 1) {
      if (depth <= stops[k][0] || k === stops.length - 1) {
        const t = Math.max(0, Math.min(1, (depth - stops[k - 1][0]) / (stops[k][0] - stops[k - 1][0])));
        return out.copy(stops[k - 1][1]).lerp(stops[k][1], t);
      }
    }
    return out;
  };
  // The lit centre of water.mid came out at S 90+ (the ink-blue band: 6.7% of the
  // dam frame), so the deep half of the bowl is eased 30% toward water.shallow.
  const easeTo = stops[1][1];
  const rampSoft = (depth, out) => {
    ramp(depth, out);
    return out.lerp(easeTo, 0.30 * Math.min(1, depth / 1.5));
  };
  const tone = new THREE.Color();
  const RINGS = [0, 0.35, 0.70, 0.93, 1.0];
  let base = 0;
  for (const dam of dams) {
    const { edge, level } = damShape(plan, dam, sampleY);
    positions.push(dam.x, level, dam.z);
    rampSoft(2.1, tone);
    colors.push(tone.r * DAM_GAIN, tone.g * DAM_GAIN, tone.b * DAM_GAIN);
    const centre = base;
    for (let i = 0; i <= DAM_SEG; i += 1) {
      const a = (i / DAM_SEG) * TAU;
      const e = edge(a);
      for (let ring = 1; ring < RINGS.length; ring += 1) {
        const rho = RINGS[ring];
        // Held FLAT at the dam level: a pond surface is level by definition.
        positions.push(dam.x + Math.sin(a) * e * rho, level, dam.z + Math.cos(a) * e * rho);
        // A shallow bowl: 2.1 m at the centre falling to nothing at the rim.
        rampSoft(2.1 * Math.pow(Math.max(0, 1 - rho * rho), 0.8), tone);
        colors.push(tone.r * DAM_GAIN, tone.g * DAM_GAIN, tone.b * DAM_GAIN);
      }
    }
    const per = RINGS.length - 1;
    for (let i = 0; i < DAM_SEG; i += 1) {
      indices.push(centre, base + 1 + i * per, base + 1 + (i + 1) * per);
      for (let ring = 0; ring < per - 1; ring += 1) {
        const a0 = base + 1 + i * per + ring;
        const a1 = base + 1 + (i + 1) * per + ring;
        indices.push(a0, a1 + 1, a1, a0, a0 + 1, a1 + 1);
      }
    }
    base = positions.length / 3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

export class FringeLayer {
  constructor(scene, city, { quality = 'high', reducedMotion = false, key = null } = {}) {
    this.scene = scene;
    this.city = city;
    this.quality = quality;
    this.reducedMotion = reducedMotion;
    this.plan = planFringe(city, quality);
    this._key = key; // taste W79 (GROUND_SURFACE, G2b): the rig's key light, which the CPU-baked shade sides read
    this._shadeBakes = new Map(); // LS-SHADESINK: geometry -> { geo, build, args, drop }
    if (GROUND_SURFACE.on > 0) {
      shadeSink = this._shadeBakes;
      liveSunXZ = sunXZFromScene(scene, key);
      this._bakedSun = liveSunXZ;
    }
    this.root = new THREE.Group();
    this.root.name = 'fringe:landscape';
    this.pickTargets = [];
    this._haze = new THREE.Color('#c5d4de');
    this._build();
    this._hideTableRim(scene);
    scene.add(this.root);
  }

  _hideTableRim(scene) {
    const table = scene.getObjectByName('presentation:table');
    if (!table) return;
    table.traverse((node) => {
      if (typeof node.name === 'string' && node.name.startsWith('presentation:table-rim')) {
        node.visible = false;
      }
    });
  }

  _build() {
    const plan = this.plan;
    const haze = this._haze;

    // ── ONE PLAN, ONE OBJECT (T6B RESIDUAL 1) ──
    //
    // Published before anything is built so `EdgeMassingLayer`, which mounts
    // five lines later in `scene.js`, takes THIS object rather than making its
    // own from a second `planEdgeMassing(city, scene)` call. Everything on this
    // side — the overlay sheet, the albedo and height bakes, `groundAt` handed
    // to every venue adder, and this file's own placements — already reads
    // `plan.crust`, so publishing the reference is the whole handover.
    //
    // The seats it carries are authored onto each venue's measured footprint
    // centre (`RING_LAYOUT`'s `sx` / `sz`), which is what lets one plan exist
    // before the venues do. `p15-terrain` re-measures that authoring against a
    // live build and fails if a venue has moved out from under its seat.
    this.root.userData.crustPlan = plan.crust ?? null;

    const nearGeo = makeAnnulus(plan, false, haze);
    const nearMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.02,
      flatShading: false,
    });
    const near = new THREE.Mesh(nearGeo, nearMat);
    near.name = 'fringe:annulus-near';
    near.receiveShadow = true;
    noPick(near);
    this.root.add(near);
    // Extra slope sheet photographed as giant blades over the Apostles lookout.
    // Headland relief already lives on the dense annulus.

    const farGeo = makeAnnulus(plan, true, haze);
    const farMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
    const far = new THREE.Mesh(farGeo, farMat);
    far.name = 'fringe:annulus-far';
    noPick(far);
    this.root.add(far);

    const riverGeo = makeRiverGeometry(plan.river);
    const riverMat = new THREE.MeshBasicMaterial({ color: '#5d8a8c', fog: true });
    applyWorldRestyle(riverMat, 'river');
    const river = new THREE.Mesh(riverGeo, riverMat);
    river.name = 'fringe:yarra';
    noPick(river);
    this.root.add(river);

    const verge = makeVerge(plan);
    this.root.add(verge);

    if (plan.expansion.length) {
      const box = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: '#9aa3a8',
        roughness: 0.92,
        metalness: 0.04,
      });
      const mesh = new THREE.InstancedMesh(box, mat, plan.expansion.length);
      mesh.name = 'fringe:expansion';
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      const eul = new THREE.Euler();
      for (let i = 0; i < plan.expansion.length; i += 1) {
        const b = plan.expansion[i];
        p.set(b.x, b.y, b.z);
        eul.set(0, b.yaw, 0);
        q.setFromEuler(eul);
        s.set(b.sx, b.sy, b.sz);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.receiveShadow = true;
      noPick(mesh);
      this.root.add(mesh);
      this._expansion = { box, mat };
    }

    // Trees are instanced in `_plantTrees()` AFTER the venues mount — the
    // keep-out is the live occupancy of what is actually standing there, which
    // cannot be measured until the venues exist.

    const alpineGeo = makeAlpineGeometry(plan);
    const alpineMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
    const alpine = new THREE.Mesh(alpineGeo, alpineMat);
    alpine.name = 'fringe:alpine';
    noPick(alpine);
    this.root.add(alpine);

    const farSeaMat = new THREE.MeshBasicMaterial({ color: '#3a7a8c', fog: true });
    const bay = plan.roles.bay;
    const L = alongLength(bay, plan.extent);
    const addSea = (w, d, seaward, along, name) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), farSeaMat);
      mesh.rotation.x = -Math.PI / 2;
      const p = shorePoint(bay, plan.extent, seaward, along);
      mesh.position.set(p.x, -0.30, p.z);
      mesh.name = name;
      noPick(mesh);
      this.root.add(mesh);
      return mesh;
    };
    const farSeaDepth = 420;
    const farSeaNear = plan.farR + 80;
    addSea(L + 320, farSeaDepth, farSeaNear + farSeaDepth * 0.5, 0, 'fringe:far-sea-beyond');

    const livePlan = {
      ...plan,
      terminals: planFringeTerminals(this.city),
      // `heightAt` is the LEGACY annulus height and is kept unchanged because
      // venues have been built against it. It describes a surface that is hidden
      // at runtime — see the header note. `groundAt` is the surface that
      // actually renders; new work should take that one.
      heightAt: (x, z) => heightWorld(x, z, plan),
      groundAt: hinterlandGroundSampler(plan),
    };
    this._port = addPort(this.root, this.city, livePlan, { reducedMotion: this.reducedMotion });
    this._apostles = addApostles(this.root, this.city, livePlan);
    this._airport = addAirport(this.root, this.city, livePlan, { reducedMotion: this.reducedMotion });
    restyleAirport(this._airport);
    // P22 (ruling 91): T2 and its stand follow the venue count, so the world batch keeps them live.
    // The flag is set here because ruling 89 freezes airport.js.
    for (const name of ['fringe:tullamarine-t2', 'fringe:tullamarine-t2-stand']) {
      const node = this._airport?.getObjectByName?.(name);
      if (node) node.userData.dynamicVisibility = true;
    }
    this._station = addStation(this.root, this.city, livePlan, { reducedMotion: this.reducedMotion });
    this._rail = addRailLink(this.root, this.city, livePlan);
    this._events = addEvents(this.root, this.city, livePlan);
    // taste-r1 W79 fix 2 (L2): the venues now stand, so the land edge takes each pad's drawn-lawn outline (Rod Laver's table, the lawn meshes of the Grand Prix, Tullamarine and
    // Southern Cross) before anything below reads the precinct weight; the plan's own seats, so the model differs from the plan's only in the outlines.
    if (LAND_EDGE.on && plan.crust?.seats) {
      const before = activeLandEdge();
      const after = landEdgeForPlan(this.city, plan.crust.seats, this.root);
      // W79 fix 5 (L2): the rim collar was seated on the ground the earlier model gave; under the plateau or hump knob the ground near the lawn differs with the harvested outline, so it is re-seated on the knob-state ground.
      if ((LAND_EDGE.plateau || LAND_EDGE.hump) && after && after !== before) reseatRimCollar(this.root, plan, before, after);
    }
    this.pickTargets = makeFringePickTargets(this.root);

    this._mats = [nearMat, farMat, riverMat, alpineMat, farSeaMat,
      ...(this._airport.userData.r157OwnedPalmMaterials ?? [])];
    this._geos = [nearGeo, farGeo, riverGeo, alpineGeo];
    this._nearGeo = nearGeo;
    this._farGeo = farGeo;
    this._alpineGeo = alpineGeo;
    this._farSeaMat = farSeaMat;
    this._riverMat = riverMat;
    this._farMat = farMat;
    this._alpineMat = alpineMat;

    // Everything on the ring goes down last, against a keep-out measured from
    // the venues that are now standing.
    this._buildHinterland();
  }

  /**
   * The worked country and the trees that stand in it. Runs after the venues so
   * `buildOccupancy` reads live world AABBs rather than authored radii — the
   * lesson of the hard-copied (60,500) r=120 circle this replaces.
   */
  _buildHinterland() {
    const plan = this.plan;
    const { extent, crust, seed, hinterland } = plan;
    this._hinterlandStats = {
      trees: 0, belts: 0, hedges: 0, dams: 0, sheds: 0, bales: 0, shade: 0,
      scrub: 0, windrows: 0, fences: 0, walls: 0, reeds: 0, windbreaks: 0,
      culledByOccupancy: 0, loneHedgesDropped: 0, hedgeStrips: 0, windbreakStrips: 0,
      cropRuns: 0, farmTracks: 0, stock: 0, rimWoods: 0, dunes: 0, rimBrowRuns: 0,
      assetPointContacts: 0, assetRunContacts: 0,
    };
    if (plan.quality === 'low' || !crust) {
      this._plantTrees(plan.trees, []);
      return;
    }
    // The legacy stand-ins are hidden at runtime and are not obstacles; the
    // giant water sheets are ground, not obstacles either (they are excluded by
    // the span cap, but naming them keeps the intent explicit).
    const skip = new Set([
      'fringe:annulus-near', 'fringe:annulus-far', 'fringe:expansion', 'fringe:alpine',
      'fringe:far-sea-beyond', 'fringe:yarra',
    ]);
    const occ = buildOccupancy(this.root, skip);
    this._occupancy = occ;
    // W85 fix 1: the model the venues' reach lives in (null without LAND_EDGE or without a reach: the tests below then cost nothing)
    const reachModel = LAND_EDGE.on && LAND_EDGE.readers.venue ? landModelFor(extent) : null;
    const onReach = reachModel && reachModel.reach ? (x, z) => onVenueReach(x, z, reachModel, REACH_KEEP_WEIGHT) || onVenueReach(x, z, reachModel, REACH_PASTURE_MAX) : null;
    const clear = (item) => {
      // TASTE R1: nothing is generated on venue ground. Runs (hedges, fences,
      // walls, windbreaks) are tested along their whole length, not at the centre.
      if (inVenueKeepOut(item.x, item.z)) return false;
      if (item.len > 0 && Number.isFinite(item.yaw)) {
        const hx = Math.sin(item.yaw) * item.len * 0.5;
        const hz = Math.cos(item.yaw) * item.len * 0.5;
        if (segmentInVenueKeepOut(item.x - hx, item.z - hz, item.x + hx, item.z + hz)) return false;
      }
      if (onReach) { // W85 fix 1: nor on the venues' reach
        let hit = onReach(item.x, item.z);
        if (!hit && item.len > 0 && Number.isFinite(item.yaw)) hit = segmentOnVenueReach(item.x - Math.sin(item.yaw) * item.len * 0.5, item.z - Math.cos(item.yaw) * item.len * 0.5, item.x + Math.sin(item.yaw) * item.len * 0.5, item.z + Math.cos(item.yaw) * item.len * 0.5, reachModel);
        if (hit) return false;
      }
      if (occ.free(item.x, item.z)) return true;
      // The 8 m grid adds 16–24 m beyond obstacle boxes. That erased corner
      // planting on already-drawn fields. Small parcel trees keep a real 4 m
      // crown clearance from every live box, without the coarse grid margin.
      if (item.role === 'parcel-hedgerow' && !occ.boxes.some(([x0, z0, x1, z1]) =>
        item.x >= x0 - 4 && item.x <= x1 + 4 && item.z >= z0 - 4 && item.z <= z1 + 4)) return true;
      this._hinterlandStats.culledByOccupancy += 1;
      return false;
    };

    const fieldsGeo = makeHinterlandFields(plan, occ);
    this._hinterlandStats.venueRecessVertices = recessVenuePaths(fieldsGeo, extent);
    const albedo = bakeRingAlbedo(extent, crust, {
      seed,
      modulate: (x, z, rgb) => modulateRingPaddock(x, z, rgb, seed),
      postModulate: (x, z, rgb) => finishRingPaddock(x, z, rgb, seed),
    });
    const heightTex = bakeRingHeight(extent, crust, {
      // taste-r1 W14-C: the shader reads this texture for normals only, so it carries the ground
      // without the terraced 30 m treads whose risers were drawn as contour rings.
      heightAt: (x, z) => hinterlandGroundAt(x, z, extent, crust, seed, undefined, true),
    });
    this.root.userData.ringAlbedo = albedo;
    // taste-r1 (W24-B): the tray band ribbon wears the sheet's own shader hooks (edge-massing cannot import this file).
    this.root.userData.groundHooks = { attachWorkedPaddock, attachVenueGround, attachGroundDetail, applyGroundShadowFloor };
    this.root.userData.ringHeight = heightTex;
    this._ringAlbedo = albedo;
    this._ringHeight = heightTex;
    const shedsForTracks = hinterland.sheds ?? [];
    // The same endpoints the albedo stamp uses, kept so the crowned ribbon built
    // after `sampleY` exists lands on the paint rather than beside it.
    const trackLines = [];
    const routeSheds = []; // W80 (TRACK_ROUTE): the sheds that have a line today, handed to the router once the sheet's sampler exists
    for (let s = 0; s < shedsForTracks.length; s += 1) {
      const sh = shedsForTracks[s];
      const hx = extent.x * 0.5;
      const hz = extent.z * 0.5;
      // Nearest point on the board square — the road the farm track meets.
      const qx = Math.max(0, Math.min(extent.x, sh.x));
      const qz = Math.max(0, Math.min(extent.z, sh.z));
      const dx = qx - sh.x;
      const dz = qz - sh.z;
      const len = Math.hypot(dx, dz);
      if (len < 8) continue;
      // TASTE R1: a farm track never crosses venue ground (Rod Laver, Grand Prix).
      if (segmentInVenueKeepOut(sh.x, sh.z, qx, qz)) continue;
      const nx = -dz / len;
      const nz = dx / len;
      // T6B: the ruts are wider and paler, and they sit on a wider bed.
      //
      // The unique albedo is 1024 texels over 1440 m — 1.41 m per texel. A
      // 1.15 m stamp is under one texel, so `stampRingAlbedoLine` was rounding
      // its half-width to a single texel and the track was a 1.4 m line whose
      // contrast the mip chain then halved again at the far ring. 2.4 m ruts on
      // a 6.2 m bed is a real farm track: two wheel ruts inside a scuffed
      // verge, three texels across, which survives minification.
      //
      // Paler too — [0.42,0.36,0.24] was chosen against the old paddock mean of
      // 0.192; against the T6B palette's 0.141 it would read almost the same
      // amount lighter, so it is lifted to hold the contrast the brief asks for.
      //
      // DIALLED BACK after the first plate: 2.4 m ruts on a 6.2 m bed at
      // [0.52,0.46,0.32] read as a sealed road crossing the ring, not as a farm
      // track. The brief says "slightly wider and paler" and this is the
      // slightly: 1.9 m ruts on a 4.8 m bed, still three texels of the 1.41 m
      // albedo grid so it survives minification, and half a step paler rather
      // than a full one.
      // ── T8: THE TRACKS ARE GROUND PAINT AND MUST RIDE THE SAME GAIN ──
      //
      // Every colour in `bakeRingAlbedo` is multiplied by `RING_ALBEDO.landGain`
      // before it is written; these three were stamped AFTERWARDS at full value,
      // so the tracks sat at a fixed brightness while the fields moved with the
      // trim. Measured: at landGain 0.31 the five crop tones' relative
      // interquartile spread collapsed from 0.15 to 0.025, because a 4.8 m bed
      // on a 1.41 m texel grid is bright enough to dominate the census once the
      // fields fall away from it. A farm track is ground, lit by the same sun.
      const rut = 1.35;
      const g = RING_ALBEDO.landGain;
      const bed = [0.28 * g, 0.25 * g, 0.19 * g];
      const pale = [0.47 * g, 0.41 * g, 0.28 * g];
      // W80 (TRACK_ROUTE): the routed corridors are stamped once, as a bed only (below, after the router has run); the straight stamp and its ruts go.
      if (!trackRouteActive()) {
        stampRingAlbedoLine(albedo, extent, sh.x, sh.z, qx, qz, bed, 4.8);
        stampRingAlbedoLine(albedo, extent, sh.x + nx * rut, sh.z + nz * rut, qx + nx * rut, qz + nz * rut, pale, 1.9);
        stampRingAlbedoLine(albedo, extent, sh.x - nx * rut, sh.z - nz * rut, qx - nx * rut, qz - nz * rut, pale, 1.9);
      }
      routeSheds.push({ x: sh.x, z: sh.z });
      trackLines.push({ x0: sh.x, z0: sh.z, x1: qx, z1: qz });
    }
    this._trackLines = trackLines;
    this._routeSheds = routeSheds;
    const fieldsMat = new THREE.MeshStandardMaterial({
      vertexColors: false,
      flatShading: false,
      color: '#ffffff',
      roughness: 0.95,
      metalness: 0.02,
      /**
       * ── T8: THE TWO HALVES OF ONE GROUND HAD DIFFERENT AMBIENT ──
       *
       * This material never set `envMapIntensity`, so it kept three's default
       * of 1 and the lighting rig scaled it to **0.528** live, against
       * `world:edge-massing:crust`'s **0.161** (`envIntensityBase` 0.28) and
       * the apron's and kerb's 0.26. Read back off the running page
       * (`plates/T8-wip/_sweep/tl-meta.json`).
       *
       * The overlay owns the drawn ring inside r 616 and the crust's fragments
       * are discarded there, so the two sheets meet on a hard circle — and one
       * side of that circle was answering the environment three times as hard
       * as the other while both sampled the same albedo map. T7 made the two
       * sheets one SURFACE; this makes them one MATERIAL RESPONSE, which is
       * the same argument applied to light instead of to height.
       *
       * Taken from the crust, not invented: 0.28, published on `userData` the
       * way the rig expects so the day profile scales both by the same factor.
       */
      envMapIntensity: 0.28,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: RING_SEAM.offsetFactor, // W40 (CREEK_DASH): -1, and the crust follows at the seam; -2 at ?creekDash=0
      polygonOffsetUnits: RING_SEAM.offsetUnits, // -2
    });
    fieldsMat.userData.envIntensityBase = 0.28;
    attachRingAlbedo(fieldsMat, albedo, extent, seed, heightTex);
    // taste W45 (SHEET_SHORE): the sheet's seaward edge on a smooth contour of the far coast field, the ribbon drawing the beach (`?sheetShore=0` leaves the shader as it was).
    if (SHEET_SHORE.on) {
      this._sheetShore = bakeSheetShore(extent, crust);
      attachSheetShore(fieldsMat, this._sheetShore);
      this.root.userData.sheetShore = this._sheetShore; // W50 (CRUST_SHORE): the crust wears the same discard
    }
    attachWorkedPaddock(fieldsMat, seed, extent);
    attachVenueGround(fieldsMat, { extent, seed });
    // taste-r1 W14-C: luminance detail from the ground pack, composed after the palette and the venue ground.
    attachGroundDetail(fieldsMat, { extent, seed, near: plan.quality !== 'low' });
    applyGroundShadowFloor(fieldsMat);
    applyWorldRestyle(fieldsMat, 'hinterland');
    const fields = new THREE.Mesh(fieldsGeo, fieldsMat);
    fields.name = 'fringe:hinterland-fields';
    fields.receiveShadow = true;
    fields.renderOrder = -16;
    noPick(fields);
    this.root.add(fields);
    this._fieldsMat = fieldsMat;
    this._fieldsGeo = fieldsGeo;
    // taste-r1 W14-C: the coast ribbon carries the bluff, platform and coves the sheet ends short of.
    this._coastRim = buildCoastRim({ extent, plan: crust, seed, liftAt: (x, z) => hinterlandLiftAt(x, z, extent, crust, seed) });
    if (this._coastRim) {
      this.root.add(this._coastRim);
      this._coastBoulders = buildCoastBoulders({ extent, plan: crust, ribbon: this._coastRim, seed });
      if (this._coastBoulders) this.root.add(this._coastBoulders);
    }
    this._syncCrustTint();

    // Reground everything on the surface that was actually built, not on the
    // function it was built from. Off the overlay the analytic value stands.
    const sampleY = makeSurfaceSampler(fieldsGeo);
    this._sampleHinterlandY = sampleY;
    // taste-r1 (W22-B): blocks on the trial ridge, seated on the built sheet (nothing is built with the trial gain at 0).
    this._ridgeBoulders = buildRidgeBoulders({ groundAt: (x, z) => sampleY(x, z), seed });
    if (this._ridgeBoulders) this.root.add(this._ridgeBoulders);
    const reground = (list) => {
      for (let i = 0; i < list.length; i += 1) {
        const y = sampleY(list[i].x, list[i].z);
        if (y !== null) list[i].y = y;
      }
      return list;
    };
    /**
     * Elongated objects take the LOWEST of their two ends and their centre.
     * Grounding an 8 m hedge on its centre alone passed a centre-only probe at
     * a median gap of −0.115 m while 210 of 625 hedges floated more than
     * 0.25 m at one end, up to 2.67 m — the bar's "corner-test, not
     * centre-test" rule, reproduced exactly. Taking the minimum can only bury
     * the high end, which reads as a hedge on a bank; it can never open
     * daylight underneath.
     */
    /**
     * Ground a run, and SHORTEN it until it can lie on the ground it is given.
     *
     * Min-of-ends grounding is tail-sensitive by construction: the deeper the
     * drop across a segment, the deeper the high end buries. The crust lane's
     * band-limited height field took |dy| over an 8 m segment from p95 0.787 to
     * 1.130 m and p99 1.167 to 3.783 m, and that showed up here immediately as
     * 258 of 2109 hedge samples more than a metre under. Shortening on steep
     * ground is what a real hedge does and it bounds the burial; the alternative
     * — grading to the mean — reopens daylight at the low end, which is a veto.
     */
    const SAFE_DROP = 0.8;
    const MIN_RUN = 5.0;
    const sampleGround = (x, z) => {
      const y = sampleY(x, z);
      // Off the overlay the crust is the ground, but only its ANALYTIC height is
      // available at build time and the rendered crust interpolates it across
      // large triangles. Bias down so the fallback can only bury, never float.
      return y === null ? surroundHeightAt(x, z, extent, crust) - 0.25 : y;
    };
    // W80 (TRACK_ROUTE): the farm tracks routed on the ground the ribbon is seated on (`sampleGround`: the built sheet, the crust's fallback).
    // Every reader of `_trackLines` below takes the routed segments; the corridors go to the ribbon.
    this._trackRoute = null;
    if (trackRouteActive()) {
      const keepM = 10.5; // the ribbon's reach and a 10 m verge: no part of a corridor lies within 10 m of venue ground (the first pass kept 3.5 m)
      // the items a track should not run through: the router pays for them, and what the smoothed line still touches is thinned below
      const pts = [];
      for (const list of [hinterland.belts, hinterland.scatter, hinterland.rimWoods, plan.trees, plan.crestTrees, hinterland.bales]) for (const t of list ?? []) pts.push([t.x, t.z, 3.55, 2.95]);
      for (const t of hinterland.tufts ?? []) if (t.kind === 0) pts.push([t.x, t.z, 3.3, 2.95]);
      for (const t of hinterland.sheds ?? []) pts.push([t.x, t.z, 9.55, 8.95]);
      const segs = [];
      for (const list of [hinterland.fences, hinterland.hedges, hinterland.windbreaks]) {
        for (const t of list ?? []) if (t.len > 0 && Number.isFinite(t.yaw)) { const hx = Math.sin(t.yaw) * t.len * 0.5; const hz = Math.cos(t.yaw) * t.len * 0.5; segs.push([t.x - hx, t.z - hz, t.x + hx, t.z + hz, 3.6]); }
      }
      const routeArgs = {
        sheds: this._routeSheds, extent, ground: sampleGround, wet: (x, z) => waternessAt(x, z, extent, crust), obstacles: { points: pts, segs },
        blocked: (x, z) => VENUE_KEEP_OUT.some((r) => x >= r.x0 - keepM && x <= r.x1 + keepM && z >= r.z0 - keepM && z <= r.z1 + keepM),
      };
      this._trackRouteArgs = routeArgs; // what the router was given, for the tests and probes (a `lone: true` call gives each shed's own path)
      const routed = routeFarmTracks(routeArgs);
      this._trackRoute = routed;
      this._trackLines = routed.segments;
      // W80 fix 4: the bed alone (4.8 m, today's bed colour, no pale ruts) under each routed corridor once, so the track reads as today's and the ribbon's ruts are the only ruts
      const bedG = RING_ALBEDO.landGain, bedRgb = [0.28 * bedG, 0.25 * bedG, 0.19 * bedG];
      let trackStamps = 0;
      for (const c of routed.corridors) {
        for (let k = 1; k < c.simple.length; k += 1) {
          stampRingAlbedoLine(albedo, extent, c.simple[k - 1][0], c.simple[k - 1][1], c.simple[k][0], c.simple[k][1], bedRgb, 4.8);
          trackStamps += 1;
        }
      }
      albedo.needsUpdate = true;
      this._hinterlandStats.trackStamps = trackStamps;
      this._hinterlandStats.routedTracks = routed.corridors.length;
      this._hinterlandStats.routedTrunks = routed.stats.trunks;
    }
    // W80 (TRACK_ROUTE): an item the routed line still passes within 2.95 m of is dropped (trees, crest trees, bales, shrubs); the router pays to avoid them first.
    const routedClear = (x, z) => {
      for (const t of this._trackLines ?? []) {
        const dx = t.x1 - t.x0; const dz = t.z1 - t.z0;
        const u = Math.max(0, Math.min(1, ((x - t.x0) * dx + (z - t.z0) * dz) / (dx * dx + dz * dz || 1)));
        if (Math.hypot(x - (t.x0 + dx * u), z - (t.z0 + dz * u)) <= 2.95) return false;
      }
      return true;
    };
    const thin = (name, list) => {
      if (!this._trackRoute) return list;
      const out = list.filter((it) => routedClear(it.x, it.z));
      this._hinterlandStats[`routeThinned${name}`] = list.length - out.length;
      return out;
    };
    // T15: shared F2 canopy at shrub scale. One instance draw and one merged
    // T11 contact draw, regardless of population; seat on the rendered sheet.
    {
      const regions = venueGroundRegions(extent), paths = venueGroundPaths(extent);
      const plants = [];
      for (let x = -160; x < extent.x - 20; x += 5) for (let z = 35; z < extent.z + 140; z += 5) {
        const u = idxUnit(151, Math.round(x), Math.round(z), seed);
        const v = idxUnit(157, Math.round(z), Math.round(x), seed);
        const px = x + u * 3.5, pz = z + v * 3.5;
        if (venueGroundWeight(px, pz, regions) < 0.95 || u > 0.43) continue;
        if (distanceToVenuePath(px, pz, paths) < 1.8) continue;
        if (waternessAt(px, pz, extent, crust) > 0.08 || sampleY(px, pz) === null) continue;
        if (occ.boxes.some(([x0, z0, x1, z1]) => px >= x0 - 1.7 && px <= x1 + 1.7 && pz >= z0 - 1.7 && pz <= z1 + 1.7)) continue;
        plants.push({ x: px, z: pz, y: sampleGround(px, pz), yaw: u * TAU,
          scale: 1.1 + v * 0.9, patchRadius: 0.8 + v * 0.4, patchDark: 0.86 });
      }
      if (plants.length) {
        const geo = clusterTreeGeometry('hedge', 17, { hedge: true });
        geo.computeBoundingBox();
        // F2's hedge unit is a long, flattened cluster, not a unit cube.
        // Normalize once so shrub instance scales are actual world metres.
        const size = geo.boundingBox.getSize(new THREE.Vector3());
        geo.scale(1 / size.x, 1 / size.y, 1 / size.z);
        geo.computeBoundingBox();
        // Taste bible 2/5: venue scrub is eucalypt-register foliage at 1-2 m, in the leaf
        // tokens (leaf.green.a #5C6E3E, leaf.green.b #6E7D48, leaf.grey #7A8468; typed here
        // because this block may not touch the import header). The hedge unit's vertex
        // colours average ~0.5 (baked AO), so the per-instance colour carries the token
        // divided by that mean and the lit result lands on the token, not on lime.
        const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.98, vertexColors: true });
        applyFoliageDetail(mat); // W19-A
        const mesh = new THREE.InstancedMesh(geo, mat, plants.length);
        mesh.name = 'fringe:venue-ground-scrub';
        const dummy = new THREE.Object3D();
        const scrubVc = geo.attributes.color;
        let scrubMean = 0;
        for (let i = 0; i < scrubVc.count; i++) scrubMean += scrubVc.getY(i);
        scrubMean = Math.max(0.2, scrubMean / Math.max(1, scrubVc.count));
        const scrubTokens = ['#5C6E3E', '#6E7D48', '#7A8468'].map((hex) => new THREE.Color(hex).multiplyScalar(1 / scrubMean));
        for (let i = 0; i < plants.length; i++) {
          const t = plants[i];
          dummy.scale.set(t.scale, t.scale * 0.68, t.scale * 0.83);
          dummy.position.set(t.x, t.y - geo.boundingBox.min.y * dummy.scale.y - 0.04, t.z);
          dummy.rotation.y = t.yaw; dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
          mesh.setColorAt(i, scrubTokens[Math.floor(((t.yaw / TAU) * 7.3 + t.patchRadius * 3.1) % 1 * 3) % 3]);
        }
        mesh.instanceMatrix.needsUpdate = true; noPickCasting(mesh); this.root.add(mesh);
        const contact = new THREE.Mesh(makeTreeShade(plan, plants, sampleGround), makeContactMaterial());
        contact.name = 'fringe:venue-ground-scrub-contact';
        contact.renderOrder = 3; noPick(contact); this.root.add(contact);
        mesh.userData.venueGround = { plants, paths: paths.map((p) => p.toArray()), drawCalls: 2 };
        this._hinterlandStats.venueScrub = plants.length;
        this._hinterlandStats.venuePaths = paths.length;
      }
    }
    /**
     * ── THE WORKED GROUND, BUILT ON THE SURFACE THAT WAS ACTUALLY DRAWN ──
     *
     * Both families are seated with `sampleGround`, the same sampler the hedges
     * take, so they follow the built sheet and not the analytic field. They share
     * one material and one albedo with the sheet under them (`makeRingPaintMaterial`).
     */
    {
      const paint = makeRingPaintMaterial(albedo);
      this._ringPaintMat = paint;
      // T13B: crop texture belongs to the parcel shader. The legacy 3.2–3.8 m
      // ridge mesh used a different lattice and reintroduced dark graphic rows.
      // Keep the crowned farm tracks, but issue no duplicate crop surface.
      this._hinterlandStats.cropRuns = 0;
      // taste W37 (TRACK_APRON): the Southern Cross apron's service road, as the station publishes it (the station is built before this runs).
      const trackGeo = makeFarmTrackCrowns(plan, this._trackRoute && trackFormActive() && trackRutActive() ? this._trackRoute.corridors : (this._trackLines ?? []), sampleGround, this._station?.userData?.apronFootprint ?? null);
      if (trackGeo.getAttribute('position')) {
        // taste W31 (TRACK_FORM): the formed track's verge fades, so it takes a transparent copy of the paint material (off, the shared one).
        const trackMat = trackFormActive() ? makeTrackFormMaterial(plan.seed ?? 0, trackKinActive(), trackBedActive()) : paint; // W84: TRACK_BED draws the ribbon as a tint on the sheet
        const track = new THREE.Mesh(trackGeo, trackMat);
        track.name = 'fringe:hinterland-farm-track';
        // The crown receives but does not cast: a 0.17 m rise throws nothing at
        // this sun angle and putting it in the shadow map only costs texels.
        track.receiveShadow = true;
        noPick(track);
        track.renderOrder = -15;
        this.root.add(track);
        this._farmTrack = trackFormActive() ? { geo: trackGeo, mat: trackMat } : { geo: trackGeo };
        this._hinterlandStats.farmTracks = (this._trackLines ?? []).length;
      } else {
        trackGeo.dispose();
      }
    }

    const regroundRun = (list) => {
      for (let i = 0; i < list.length; i += 1) {
        const it = list[i];
        const sy = Math.sin(it.yaw);
        const cy = Math.cos(it.yaw);
        let half = (it.len ?? 0) * 0.5;
        // Floor at MIN_RUN/2. Shortening below that produced 107 hedges under
        // 5 m and 85 under 4 m, at a plan aspect of 1.3-2.3 against a 2.5 m
        // height — a near-cubic dark prism, which is a block on the grass and
        // not a hedge at any distance. A segment that cannot reach the floor is
        // dropped rather than stubbed; the run loses one link and reads as a
        // gateway, which is a thing a hedge actually has.
        for (let pass = 0; pass < 4 && half > MIN_RUN * 0.5; pass += 1) {
          const a = sampleGround(it.x + sy * half, it.z + cy * half);
          const b = sampleGround(it.x - sy * half, it.z - cy * half);
          if (Math.abs(a - b) <= SAFE_DROP) break;
          half = Math.max(MIN_RUN * 0.5, half * 0.62);
        }
        {
          const a = sampleGround(it.x + sy * half, it.z + cy * half);
          const b = sampleGround(it.x - sy * half, it.z - cy * half);
          if (Math.abs(a - b) > SAFE_DROP * 2.6) { it.drop = true; continue; }
        }
        it.len = half * 2;
        let y = null;
        for (const sgn of [0, -1, 1]) {
          const e = sampleGround(it.x + sy * half * sgn, it.z + cy * half * sgn);
          y = y === null ? e : Math.min(y, e);
        }
        it.y = y;
      }
      return list.filter((it) => !it.drop);
    };

    /**
     * Drop hedge segments that end up ALONE.
     *
     * The r2 remedy had two halves and only one was built: run-length was
     * enforced at plan time, but the occupancy grid, the creek gate, the batter
     * gate and the steep-ground drop all cull afterwards, so a run of six could
     * be reduced to a single survivor. A lone segment is a log on the grass
     * whatever its aspect ratio, which is why the r5 critic still found four.
     * Neighbours are counted on the SURVIVING set, twice, because dropping one
     * segment can orphan the next.
     */
    const dropLoneHedges = (list) => {
      const REACH = HINTERLAND.boundaryStep * 1.8;
      let live = list;
      for (let pass = 0; pass < 2; pass += 1) {
        const cell = new Map();
        const key = (x, z) => `${Math.floor(x / REACH)}:${Math.floor(z / REACH)}`;
        for (const h of live) {
          const k = key(h.x, h.z);
          const bucket = cell.get(k);
          if (bucket) bucket.push(h); else cell.set(k, [h]);
        }
        const kept = live.filter((h) => {
          const gx = Math.floor(h.x / REACH);
          const gz = Math.floor(h.z / REACH);
          for (let i = -1; i <= 1; i += 1) {
            for (let j = -1; j <= 1; j += 1) {
              const bucket = cell.get(`${gx + i}:${gz + j}`);
              if (!bucket) continue;
              for (const o of bucket) {
                if (o === h) continue;
                if (Math.hypot(o.x - h.x, o.z - h.z) <= REACH) return true;
              }
            }
          }
          return false;
        });
        if (kept.length === live.length) { live = kept; break; }
        live = kept;
      }
      this._hinterlandStats.loneHedgesDropped = list.length - live.length;
      return live;
    };
    const hedges = dropLoneHedges(regroundRun(hinterland.hedges.filter(clear)));
    const windbreakPts = regroundRun((hinterland.windbreaks ?? []).filter(clear));
    const fences = regroundRun((hinterland.fences ?? []).filter(clear));
    // taste W33 (WALL_TRACK): the farm-track lines (the ring's and every surveyed paddock's access track), as segments [x0, z0, x1, z1].
    const wallTrackLines = (this._trackLines ?? []).map((t) => [t.x0, t.z0, t.x1, t.z1]);
    for (const farm of (surveyedPaddocks(this.city) ?? [])) {
      for (let k = 1; k < farm.accessTrack.length; k += 1) {
        wallTrackLines.push([farm.accessTrack[k - 1][0], farm.accessTrack[k - 1][1], farm.accessTrack[k][0], farm.accessTrack[k][1]]);
      }
    }
    const wallOnTrack = (w) => {
      const hx = Math.sin(w.yaw) * w.len * 0.5;
      const hz = Math.cos(w.yaw) * w.len * 0.5;
      const reach = WALL_TRACK.clearM + (w.width ?? 0.55) * 0.5;
      return wallTrackLines.some((t) => segSegDistance(w.x - hx, w.z - hz, w.x + hx, w.z + hz, t[0], t[1], t[2], t[3]) < reach);
    };
    const wallsGrounded = regroundRun((hinterland.walls ?? []).filter(clear)); // the run as drawn: regroundRun shortens it on a slope
    this._hinterlandStats.wallsGrounded = wallsGrounded.length;
    this._hinterlandStats.wallsOnTrack = WALL_TRACK.on ? wallsGrounded.filter(wallOnTrack).length : 0;
    const walls = WALL_TRACK.on ? wallsGrounded.filter((w) => !wallOnTrack(w)) : wallsGrounded;
    const wallsTumbled = new Set(wallsGrounded.filter((_, i) => i % 4 === 3)); // every fourth run, counted before any is dropped, so a kept wall keeps its form
    const reeds = (hinterland.reeds ?? []).filter((r) => {
      if (inVenueKeepOut(r.x, r.z)) return false;
      if (onReach && onReach(r.x, r.z)) return false; // W85 fix 1
      // Reeds sit on the crust's creek bank, where the overlay mask is zero.
      r.y = surroundHeightAt(r.x, r.z, extent, crust) - 0.04;
      return true;
    });
    const scrub = regroundRun(hinterland.scrub.filter(clear));
    let windrows = regroundRun(hinterland.windrows.filter(clear)); // taste W31: reassigned to the cut pieces under WINDROW_FORM
    if (!WINDROWS.on) windrows = []; // taste W32: filtered as before (the occupancy count stays), then not drawn
    // The rim treeline rides the same four archetypes as the belts and the
    // copses, so the band that terminates the world costs no extra draw call.
    const belts = reground(
      thin('Trees', hinterland.belts.concat(hinterland.scatter, hinterland.rimWoods ?? []).filter(clear)),
    );
    // A capped planner choice can be occupied after venues mount. Retain the
    // seeded fallback sites, then cap the actual surviving dam/contact pairs.
    // TASTE R1: a dam is tested against the venues' live boxes exactly (circle
    // against rectangle plus 2 m), not through the 8 m occupancy grid, whose 16-24 m
    // margin culled the east farm dam the moment the Grand Prix precinct moved 57 m
    // toward it. Venue ground itself still excludes it.
    const damClear = (dam) => {
      if (inVenueKeepOut(dam.x, dam.z)) return false;
      if (onReach && onReach(dam.x, dam.z)) return false; // W85 fix 1
      const reach = dam.radius * 1.3 + 2;
      return !occ.boxes.some(([bx0, bz0, bx1, bz1]) => {
        const nx = Math.max(bx0, Math.min(dam.x, bx1));
        const nz = Math.max(bz0, Math.min(dam.z, bz1));
        return Math.hypot(dam.x - nx, dam.z - nz) < reach;
      });
    };
    const dams = (hinterland.damCandidates ?? hinterland.dams).filter(damClear).slice(0, hinterland.dams.length);
    if (dams.length) fieldsMat.userData.workedPaddock.dam.value.set(dams[0].x, dams[0].z, dams[0].radius);
    /**
     * ── A DAM HAS A REED FRINGE, AND WITHOUT ONE IT IS A DISC ──
     *
     * The dams already had a bank ring, which reads as earth, and a water disc,
     * which now reads as water. What made them still read as paint at the graded
     * pose is that the two met on a clean circle. Real farm dams are ringed with
     * cumbungi and sedge on the shallow side and bare mud on the deep one, so the
     * fringe is laid on an ARC — from the seeded start heading, over about two
     * thirds of the rim — rather than as a full collar, which would be a second
     * circle drawn round the first.
     *
     * These ride the reed archetype the creek already instances, so the fringe
     * costs no extra draw call.
     */
    for (let d = 0; d < dams.length; d += 1) {
      const dam = dams[d];
      const shape = damShape(plan, dam, sampleY);
      const key = Math.round(dam.x);
      const key2 = Math.round(dam.z);
      const a0 = idxUnit(212, key, key2, seed) * TAU;
      const arc = TAU * (0.52 + idxUnit(213, key, key2, seed) * 0.24);
      const n = Math.max(5, Math.round(dam.radius * 0.85));
      for (let i = 0; i < n; i += 1) {
        const t = i / (n - 1 || 1);
        const a = a0 + arc * t;
        const jitter = idxUnit(214 + (i % 6), key, key2, seed);
        const rad = shape.edge(a) * (0.96 + jitter * 0.10);
        const rx = dam.x + Math.sin(a) * rad;
        const rz = dam.z + Math.cos(a) * rad;
        const gy = sampleY(rx, rz);
        // Reeds stand in the shallows. Where the bank holds the level up (the
        // downhill side) the ground is buried under it, so there is no fringe.
        if (gy !== null && shape.level - gy > 0.55) continue;
        reeds.push({
          x: rx,
          z: rz,
          y: (gy === null ? surroundHeightAt(rx, rz, extent, crust) : gy) - 0.05,
          yaw: a + (jitter - 0.5) * 0.8,
          height: 0.70 + jitter * 0.65,
          scale: 0.50 + jitter * 0.45,
        });
      }
    }
    const sheds = regroundRun(hinterland.sheds.filter(clear));
    const bales = reground(thin('Bales', hinterland.bales.filter(clear)));
    const stock = reground((hinterland.stock ?? []).filter(clear));
    const trees = reground(thin('ParcelTrees', plan.trees.filter(clear)));

    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const eul = new THREE.Euler();
    const c = new THREE.Color();
    const footprintV = new THREE.Vector3();
    const footprintBases = new WeakMap();
    /**
     * Seat every actual base vertex, not just an instance origin. Most of these
     * unit archetypes have a finite footprint and the built sheet can turn by
     * more than 5 cm beneath it; centre-only grounding therefore left daylight
     * under stock feet, shed corners and reeds. Taking the lowest permissible
     * translation can only bury another corner, never open a gap.
     */
    // W11-B: `slope` (rise per metre along the run, local +X) shears the instance so a long run
    // of fence or wall follows the ground with its posts still upright; 0 leaves it rigid.
    const shearM = new THREE.Matrix4();
    const unit = new THREE.Vector3(1, 1, 1);
    const runSlope = (x, z, yaw, length) => {
      const dx = Math.cos(yaw) * length * 0.5;
      const dz = -Math.sin(yaw) * length * 0.5;
      const k = (sampleGround(x + dx, z + dz) - sampleGround(x - dx, z - dz)) / length;
      return Number.isFinite(k) ? Math.max(-0.45, Math.min(0.45, k)) : 0;
    };
    const composeGrounded = (geo, x, z, authoredY, yaw, sx, sy, sz, slope = 0) => {
      let bases = footprintBases.get(geo);
      if (!bases) {
        const pos = geo.getAttribute('position');
        let minY = Infinity;
        for (let i = 0; i < pos.count; i += 1) minY = Math.min(minY, pos.getY(i));
        bases = [];
        for (let i = 0; i < pos.count; i += 1) {
          if (pos.getY(i) <= minY + 1e-4) bases.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
        }
        footprintBases.set(geo, bases);
      }
      eul.set(0, yaw, 0);
      q.setFromEuler(eul);
      s.set(sx, sy, sz);
      let y = authoredY;
      for (const base of bases) {
        footprintV.set(base[0] * sx, base[1] * sy + slope * base[0] * sx, base[2] * sz).applyQuaternion(q);
        y = Math.min(y, sampleGround(x + footprintV.x, z + footprintV.z) - footprintV.y - 0.02);
      }
      p.set(x, y, z);
      if (slope === 0) {
        m.compose(p, q, s);
      } else {
        m.compose(p, q, unit);
        m.multiply(shearM.set(1, 0, 0, 0, slope, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1));
        m.scale(s);
      }
      return m;
    };

    // taste W28 (hedges-2): where a hedgerow lump (an emergent shrub or tree) may not swell: within 3 m of a farm track or of water (sea, dam, creek).
    const hedgeLumpClear = (x, z) => {
      for (const t of this._trackLines ?? []) {
        const dx = t.x1 - t.x0; const dz = t.z1 - t.z0;
        const l2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((x - t.x0) * dx + (z - t.z0) * dz) / l2));
        if (Math.hypot(x - (t.x0 + dx * u), z - (t.z0 + dz * u)) < 3) return true;
      }
      for (const [ox, oz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) {
        const px = x + ox; const pz = z + oz;
        const w = waternessAt(px, pz, extent, crust);
        if (w > 0.10) return true;
        const creek = creekFieldAt(px, pz, extent, crust, crust?.seats, Math.max(-pz, pz - extent.z, -px, px - extent.x), w);
        if (creek.thread > 0.005 || creek.bar > 0.02) return true;
      }
      return false;
    };

    // taste W29 (HEDGEROW_TIDY): the tracks and roads a hedge or the rim brow opens a gateway at where it crosses: the shed tracks and the
    // surveyed farms' access tracks (6.4 m, the crowned ribbon's width) and the venue service paths (5 m). Null with the switch off.
    const gatesOn = !!trackGatesActive(); // taste W82 (TRACK_GATES)
    const hedgeTidy = !!hedgerowTidyActive() && !!hedgerowFormActive();
    const hedgeCrossings = hedgeTidy ? [
      ...(this._trackLines ?? []).map((t) => (gatesOn ? [t.x0, t.z0, t.x1, t.z1, 6.4, 1] : [t.x0, t.z0, t.x1, t.z1, 6.4])),
      ...(surveyedPaddocks(this.city) ?? []).flatMap((farm) => farm.accessTrack.slice(1).map((q, k) => [farm.accessTrack[k][0], farm.accessTrack[k][1], q[0], q[1], 6.4])),
      ...venueGroundPaths(extent).map((vp) => [vp.x, vp.y, vp.z, vp.w, 5]),
    ] : null;
    // taste W82 (TRACK_GATES): the band index over the track lines, the gateways kept for part 2 (`_trackGates`), the counts for the stats key
    const gateIndex = gatesOn ? makeTrackBandIndex((this._trackLines ?? []).map((t) => [t.x0, t.z0, t.x1, t.z1])) : null;
    const gateList = gatesOn ? [] : null;
    const gateStats = gatesOn ? {} : null;
    this._trackGates = gateList;
    const hedgeGates = (kind) => (gatesOn ? { kind, out: [], postM: 0.6, capM: 0.35, minPiece: 3.3, stubM: 4, nearM: 8, dropped: 0, dropAt: [], halves: [] } : null);
    // W82 fix: a split is a run with a piece on each side of a track; it gets a gateway where it is fitted (ends 3.6 to 4.2 m from the centreline, the centre within 0.5 m),
    // two crossings of a track within 4 m share one. `noteGates` keeps the counts of a kind: splits, gateways built, merged into another, not fitted (with the reason), runs ending at a track.
    const noteGates = (kind, r, extra) => {
      const st = gateStats[kind] ?? (gateStats[kind] = { splits: 0, gates: 0, merged: 0, rejected: [], ends: 0, extendedM: 0, trimmedM: 0, mergedPairs: [] });
      st.splits += r.added.length + r.merged.length + r.rejected.length; st.gates += r.added.length; st.merged += r.merged.length; st.rejected.push(...r.rejected);
      st.mergedPairs.push(...r.merged.map((m) => ({ kind, into: m.into.kind, at: m.g.at })));
      st.trimmedM = +(st.trimmedM + [...r.added, ...r.merged.map((m) => m.g)].reduce((t, g) => t + (g.trimmedM ?? 0), 0)).toFixed(2);
      st.extendedM = +(st.extendedM + r.added.reduce((t, g) => t + (g.extendedM ?? 0), 0)).toFixed(2);
      Object.assign(st, extra);
    };
    const takeGates = (g) => {
      if (!g) return;
      const gapM = (q) => Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]);
      const pr = pairHalfRuns(gateIndex, g.halves);
      const r = resolveGateways(gateIndex, gateList, g.kind, g.out.concat(pr.splits).map((q) => ({ ...q, trimmedM: gapM(q) })));
      noteGates(g.kind, r, { dropped: g.dropped, dropAt: g.dropAt, ends: pr.left });
    };
    let hedgeHw = null; // W55 (TUFT_CLEAR): the built hedge mesh's half-width along each item, for the foot clumps
    const hedgeG = hedgeGates('hedge');
    if (hedges.length) {
      const chains = chainLineItems(hedges);
      const hedgeForm = !!hedgerowFormActive(); // taste W28
      // Width/height carry the hedgerow arithmetic recorded at the planning
      // site above. `varyH` breaks the ridge line so a 60 m strip is a hedge
      // rather than an extruded kerb, and `lit`/`shade` are pushed apart so the
      // two faces separate at 6 px: 0.26/0.11 is 15 points of L, which is under
      // the plate's own noise once the strip is that narrow.
      // W11-A: a clipped farm hedge as a real section (battered sides, rounded top,
      // soft lumps, the odd taller unclipped length or gate gap), not a prism with a leaf atlas.
      const geo = hedgeRunGeometry(chains, {
        width: HEDGE_SECTION.width,
        height: HEDGE_SECTION.height,
        sampleY: sampleGround,
        lumpClear: hedgeLumpClear,
        crossings: hedgeCrossings,
        gates: hedgeG,
        // taste W29 (HEDGEROW_TIDY): the crown's value over the hedge's lit flank, times this (the sunlit top read pale tan-yellow at h4, 16 L* over a eucalypt's).
        crownK: hedgeTidy ? HEDGEROW_TIDY_PARAMS.hedgeCrownK : 1,
        // TASTE R1: leaf.green.a's hue (74 degrees), a lit face inside the foliage
        // value cap and a shade face that stays green rather than going navy.
        hue0: 0.205,
        sat: 0.32,
        lit: 0.21,
        // taste W28 (HEDGEROW_FORM): the shade face an olive albedo (yellower, more saturated, a little lighter), as the sky's share on it is blue.
        shade: hedgeForm ? 0.165 : 0.12,
        shadeHue: hedgeForm ? 0.17 : null,
        shadeSat: hedgeForm ? 0.55 : null,
        seed,
      });
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.97,
        metalness: 0,
        color: '#ffffff',
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'fringe:hinterland-hedges';
      noPickCasting(mesh);
      applyFoliageDetail(mat, hedgeForm ? { shadeWarm: true } : {}); // W19-A; W28: the crown shade warming reaches the hedge
      this.root.add(mesh);
      this._hedges = { geo, mat };
      takeGates(hedgeG);
      if (TUFT_CLEAR.on && TRUNK_TUFTS.on) hedgeHw = hedgeHalfProfiles(hedges, geo.attributes.position.array);
      this._hinterlandStats.hedges = hedges.length;
      this._hinterlandStats.hedgeStrips = chains.length;
      // The hedge's own contact, on the same chains so it cannot drift off the
      // run when the ground shortens one.
      const cgeo = makeStripContact(chains, {
        // T10: 0.80 -> 0.88, for the same reason as the tree patch — the hedge
        // throws a real shadow again and the ribbon is now the under-hedge term.
        // T12: 0.6 m cast-shadow band past the hedge body, plus a darker
        // contact so the boundary reads at plate scale as a line, not a tint.
        // taste W28 (HEDGEROW_FORM): 0.74 -> 0.78 under the hedgerow form, just inside T12's darker band (p15-terrain pins it at 0.80
        // or under, read back from a 32-bit float, and p9-ring pins the 0.6 m band each side), so the ribbon is a foot of shade and
        // less of a moat.
        width: HEDGE_SECTION.width + 1.20, sampleY: sampleGround, dark: hedgeForm ? 0.78 : 0.74,
        cuts: geo.userData?.treeForm?.gateCuts ?? null, // taste W29 (HEDGEROW_TIDY): the ribbon stops where the hedge opens a gateway at a track
      });
      const cmat = makeContactMaterial();
      const cmesh = new THREE.Mesh(cgeo, cmat);
      cmesh.name = 'fringe:hinterland-hedge-contact';
      cmesh.renderOrder = -14;
      noPick(cmesh);
      this.root.add(cmesh);
      this._hedgeContact = { geo: cgeo, mat: cmat };
    }

    const browG = hedgeGates('brow');
    if ((hinterland.rimBrow ?? []).length) {
      // The chains are authored as chains already — the brow is one line round the
      // ring, not a set of boundary samples to be grouped — so it goes straight to
      // the same merged-bank builder the hedges use rather than through
      // `chainLineItems`.
      // taste W28 (hedges-2, HEDGEROW_FORM): the brow was the dark bars of the low west view (a chamfered bar with a shade face of L 0.10, teal in the
      // sky's fill). With the switch on it is the hedgerow form (broken ridge, gateways, lumps), the olive shade face and the crown shade warming,
      // along a brow line that wanders smoothly (see the plan, `browSmooth`). 0 keeps wave twenty-seven's bank.
      const browForm = !!hedgerowFormActive();
      const geo = browForm
        ? hedgeRunGeometry(hinterland.rimBrow, {
          width: HEDGE_SECTION.width,
          height: HEDGE_SECTION.height,
          sampleY: sampleGround,
          lumpClear: hedgeLumpClear,
          // taste W29 (HEDGEROW_TIDY): a gateway at each track, and rings 5.2 m apart (3 under a lump) where the hedge's own stand 2.05 apart.
          crossings: hedgeCrossings,
          gates: browG,
          ringM: hedgeTidy ? HEDGEROW_TIDY_PARAMS.browRingM : null,
          lumpRings: hedgeTidy ? HEDGEROW_TIDY_PARAMS.browLumpRings : null,
          hue0: 0.205,
          sat: 0.30,
          lit: 0.19,
          shade: 0.15,
          shadeHue: 0.17,
          shadeSat: 0.55,
          seed,
        })
        : makeMergedBankGeometry(hinterland.rimBrow, {
        // TASTE R1: a 13 x 6.2 m extruded bar is the "raised bar" the bible bans
        // (section 8); the brow is the underscrub of the rim treeline, hedge-sized.
          width: HEDGE_SECTION.width,
          height: HEDGE_SECTION.height,
          sampleY: sampleGround,
          hue0: 0.205,
          sat: 0.30,
          lit: 0.19,
          shade: 0.10,
          varyH: 0.6,
          seed,
        });
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.97,
        metalness: 0,
        color: '#ffffff',
        side: THREE.DoubleSide,
      });
      if (browForm) applyFoliageDetail(mat, { shadeWarm: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'fringe:hinterland-rim-brow';
      noPickCasting(mesh);
      this.root.add(mesh);
      this._rimBrow = { geo, mat };
      takeGates(browG);
      this._hinterlandStats.rimBrowRuns = hinterland.rimBrow.length;
    }

    if (windbreakPts.length) {
      const chains = chainLineItems(windbreakPts);
      // W11-A: the windbreak row IS the row of cypress now. The 28-triangle prism that
      // stood here as an "understorey bank" is replaced by backdrop cypress forms at 5.5 m
      // spacing along the same chains, crowns touching, foliated to the ground (so no bank
      // is needed under them). The few role-windbreak trees the belt pass already planted
      // on these lines are kept, and the row skips their stops.
      const runs = chains.map((run) => {
        const first = run[0];
        const last = run[run.length - 1];
        const st = [{
          x: first.x - Math.sin(first.yaw) * (first.len ?? 8) * 0.5,
          z: first.z - Math.cos(first.yaw) * (first.len ?? 8) * 0.5,
        }];
        for (const it of run) st.push({ x: it.x, z: it.z });
        st.push({
          x: last.x + Math.sin(last.yaw) * (last.len ?? 8) * 0.5,
          z: last.z + Math.cos(last.yaw) * (last.len ?? 8) * 0.5,
        });
        return st;
      });
      // taste W82 (TRACK_GATES): the row is opened across the band (a tree with a vertex in it is skipped), a lone tree near a track goes
      const windG = gatesOn ? { dist: (x, z, lim) => gateIndex.dist(x, z, lim), band: TRACK_GATE_BAND, stubM: 4, nearM: 8, dropped: 0, stubs: 0 } : null;
      const cyp = treeFormSpecies(4);
      const cypLin = tokenLinear(cyp.colour);
      const rowTint = cypLin.map((v, ch) => v * TREE_GAIN * cyp.tint[ch]);
      const geo = windbreakRowGeometry(runs, {
        sampleY: sampleGround,
        seed,
        spacing: 5.5,
        tint: rowTint,
        avoid: belts.filter((b) => b.role === 'windbreak'),
        forms: [0, 1, 2].map((variant) => makeTreeGeometry(4, variant, treeFormOptions(cyp))),
        gates: windG,
      });
      if (windG) gateStats.windbreak = { gates: 0, dropped: windG.dropped, stubs: windG.stubs };
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        metalness: 0,
        color: '#ffffff',
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'fringe:hinterland-windbreaks';
      noPickCasting(mesh);
      applyFoliageDetail(mat); // W19-A
      this.root.add(mesh);
      this._windbreakStrips = { geo, mat };
      this._hinterlandStats.windbreaks = windbreakPts.length;
      this._hinterlandStats.windbreakStrips = chains.length;
      const cgeo = makeStripContact(chains, {
        width: 2.6, sampleY: sampleGround, dark: 0.88,
        ...(gatesOn ? { cuts: runs.flatMap((st, ci) => bandCuts(gateIndex, st, ci, TRACK_GATE_BAND + 2.5)) } : {}), // W82: the ribbon stops with the row
      });
      const cmat = makeContactMaterial();
      const cmesh = new THREE.Mesh(cgeo, cmat);
      cmesh.name = 'fringe:hinterland-windbreak-contact';
      cmesh.renderOrder = -14;
      noPick(cmesh);
      this.root.add(cmesh);
      this._windbreakContact = { geo: cgeo, mat: cmat };
    }

    // taste W82 (TRACK_GATES): a panel's drawn extent is its box on local +X (centred on the item); the gates cut it back to the band's edge, drop the ones in the band
    // and run a free end that faced another across a track out to the band (at most 10 m, where the ground is clear); a cut panel is the same instance scaled along its run (`sx`).
    // A run served by a gateway already built within 4 m (a fence beside a hedge) ends at its own band edge with its own end post.
    // W82 fix 2: the run-out keeps 0.5 m off every other run: the hedges, the brow and the windbreaks (each by its half width), the rail fences, the walls and the parcel fences as planned.
    const gateRunSegs = [];
    if (gatesOn) {
      const alongSeg = (it, r) => { const hx = Math.sin(it.yaw) * it.len * 0.5; const hz = Math.cos(it.yaw) * it.len * 0.5; gateRunSegs.push([it.x - hx, it.z - hz, it.x + hx, it.z + hz, r]); };
      for (const it of hedges.concat(windbreakPts)) alongSeg(it, (it.width ?? HEDGE_SECTION.width) * 0.5); // the run-out keeps 0.5 m off the hedge's edge
      for (const run of hinterland.rimBrow ?? []) for (const it of run) alongSeg(it, (it.width ?? HEDGE_SECTION.width) * 0.5);
    }
    // W83 (item 1, part 3): each planted and crest tree's own trunk, as the triangles of its form within 1.6 m of the root at its own scale and lean (`_gateTrunkTris`); a run-out keeps `GATE_KIT.runOutClear` off them.
    const gateTrunks = gatesOn ? this._gateTrunkTris(this._plantedTrees(trees, belts), (this._trackRoute ? (plan.crestTrees ?? []).filter(clear).filter((it) => routedClear(it.x, it.z)) : (plan.crestTrees ?? []).filter(clear))) : null;
    this._trackTrunkTris = gateTrunks ? { count: gateTrunks.count, crest: gateTrunks.crest } : null; // the footprint triangles behind the run-out test, and how many are the crest trees' (the test pins both)
    const gateClearPoint = (x, z) => {
      if (inVenueKeepOut(x, z)) return false;
      const out = Math.max(-z, z - extent.z, -x, x - extent.x);
      const w = waternessAt(x, z, extent, crust);
      if (w > 0.10) return false;
      const creek = creekFieldAt(x, z, extent, crust, crust?.seats, out, w);
      if (creek.thread > 0.005 || creek.bar > 0.02) return false;
      for (const bx of occ.boxes) if (x >= bx[0] - 0.5 && x <= bx[2] + 0.5 && z >= bx[1] - 0.5 && z <= bx[3] + 0.5) return false;
      for (const sh of sheds) if (Math.hypot(x - sh.x, z - sh.z) < 7) return false; // a shed's footprint is under 6.5 m from its centre
      for (const b of bales) if (Math.hypot(x - b.x, z - b.z) < 1.8) return false;
      for (const t of trees) if (Math.hypot(x - t.x, z - t.z) < 1.0) return false; // a trunk (under 0.5 m across at the foot) and the half metre
      for (const q of gateRunSegs) if (gateIndex.segD(x, z, q) < 0.5 + (q[4] ?? 0)) return false;
      return true;
    };
    // `clear.why` is 'trunk' when the points pass and a tree's trunk comes within `runOutClear` of the run-out; `clear.stop` is then how far along it (from p) it stays that clear (the shorter run-out the caller may try)
    const gateClear = (p, q) => {
      gateClear.why = null; gateClear.stop = null;
      const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.5));
      for (let k = 0; k <= n; k += 1) if (!gateClearPoint(p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n)) return false;
      const stop = gateTrunks.stopAlong(p, q, GATE_KIT.runOutClear);
      if (stop === null) return true;
      gateClear.why = 'trunk'; gateClear.stop = stop; return false;
    };
    const gatedPanels = (list, { kind, tol, half }) => {
      const dir = (f) => [Math.sin(f.yaw), Math.cos(f.yaw)];
      const panels = list.map((f) => { const [dx, dz] = dir(f); return { a: [f.x - dx * half(f), f.z - dz * half(f)], b: [f.x + dx * half(f), f.z + dz * half(f)], src: f }; });
      const fit = fitPanelsToTracks(panels, gateIndex, { kind, tol, clear: gateClear });
      const r = resolveGateways(gateIndex, gateList, kind, fit.splits);
      (this._trackRunOuts ??= []).push(...fit.stats.runOuts.map((q) => ({ kind, ...q }))); // W83: the run-outs and restored runs as built, for the test
      (this._trackShortened ??= []).push(...fit.stats.shortened); // W83 (part 3): the run-outs that stop short of a trunk
      // W82 fix 2: a run served by a gateway already built within 4 m (a fence beside a hedge) ends at its own band edge with its own end post; no connector panel turns a corner to the gateway.
      const out = fit.panels.map((p) => {
        if (!p.cutFrom && !p.extendOf && !p.own) return p.src;
        const f = p.src; const [dx, dz] = p.own ? [(p.b[0] - p.a[0]) / (Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) || 1), (p.b[1] - p.a[1]) / (Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) || 1)] : dir(f);
        const L = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
        const sgn = ((p.b[0] - p.a[0]) * dx + (p.b[1] - p.a[1]) * dz) >= 0 ? 1 : -1;
        const a = sgn > 0 ? p.a : p.b; const b = sgn > 0 ? p.b : p.a;
        const x = (a[0] + b[0]) / 2; const z = (a[1] + b[1]) / 2;
        return { ...f, x, z, a, b, len: L, sx: L / (2 * half(f)), gated: true, srcRef: f, yaw: p.own ? Math.atan2(dx, dz) : f.yaw, ...(f.y !== undefined ? { y: sampleGround(x, z) } : {}) };
      });
      noteGates(kind, r, { dropped: fit.stats.dropped, stubs: fit.stats.stubs, cut: fit.stats.cut, extended: fit.stats.extended, ends: fit.stats.ends, refused: fit.stats.refused, restored: fit.stats.restored, restoredM: +fit.stats.restoredM.toFixed(2), maxRunOutM: +fit.stats.maxRunOutM.toFixed(3), dropAt: fit.stats.dropAt });
      const st = gateStats[kind];
      st.rejected.push(...fit.stats.refused); st.splits += fit.stats.refused.length; st.extendedM = +fit.stats.extendedM.toFixed(2); st.trimmedM = +fit.stats.trimmedM.toFixed(2);
      for (const f of list) gateRunSegs.push([f.x - Math.sin(f.yaw) * half(f), f.z - Math.cos(f.yaw) * half(f), f.x + Math.sin(f.yaw) * half(f), f.z + Math.cos(f.yaw) * half(f)]);
      return out;
    };
    let fenceDraw = fences;
    if (gatesOn && fences.length) {
      const fenceProbe = makeFenceGeometry();
      fenceProbe.computeBoundingBox();
      const fenceHalf = (fenceProbe.boundingBox.max.x - fenceProbe.boundingBox.min.x) * 0.5;
      fenceProbe.dispose();
      fenceDraw = gatedPanels(fences, { kind: 'rail-fence', tol: 1.2, half: () => fenceHalf });
    }
    if (fenceDraw.length) {
      const geo = makeFenceGeometry();
      // W11-B: post-and-rail, modelled at true size (8 m run, posts 1.3 m); the vertex colour
      // is an occlusion and part-tone multiplier on the timber colour.
      const mat = makeRailFenceMaterial(); // W82 fix: the timber the farm gateways share (fringe/farm-models.js)
      const mesh = new THREE.InstancedMesh(geo, mat, fenceDraw.length);
      mesh.name = 'fringe:hinterland-fences';
      for (let i = 0; i < fenceDraw.length; i += 1) {
        const f = fenceDraw[i];
        // Planner yaw is measured from +Z; the fence run lies on local +X, 8 m long, so
        // neighbouring runs meet on a shared post.
        mesh.setMatrixAt(i, composeGrounded(
          geo, f.x, f.z, f.y - 0.06, f.yaw - Math.PI * 0.5, f.sx ?? 1, 1, 1,
          runSlope(f.x, f.z, f.yaw - Math.PI * 0.5, f.gated ? Math.max(1, 8 * f.sx) : 8),
        ));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.receiveShadow = true;
      noPickCasting(mesh);
      this.root.add(mesh);
      this._fences = { geo, mat };
      this._hinterlandStats.fences = fences.length;
      if (gatesOn) gateStats['rail-fence'].drawn = fenceDraw.length;
    }

    let windrowFenceSegs = []; // taste W31: the parcel fence panels as segments, for the windrow gates
    if (PARCEL_FENCES.on && plan.quality !== 'low') {
      // taste-r1 (W25): PARCEL_FENCES. Every boundary sample that carries no hedge, wall, windbreak or fence gets post-and-wire panels,
      // seated the way the hedges are; the edges that end up mostly fenced are marked for the ground shader's stock track.
      const rowKey = (it) => `${it.x.toFixed(2)},${it.z.toFixed(2)}`;
      const hedgeKeys = new Set(hedges.map((h) => `${h.gx}:${h.gz}`));
      for (const w of windbreakPts) hedgeKeys.add(`${w.gx}:${w.gz}`);
      const placedKeys = new Set(fences.concat(walls).map(rowKey));
      const carried = (b, prev, next) => hedgeKeys.has(`${b.gx}:${b.gz}`) || placedKeys.has(rowKey(b))
        || Boolean(prev && placedKeys.has(rowKey(prev))) || Boolean(next && placedKeys.has(rowKey(next)));
      const venuePaths = venueGroundPaths(extent);
      const fenceVenue = venueGroundRegions(extent);
      const segDist = (px, pz, x0, z0, x1, z1) => {
        const dx = x1 - x0, dz = z1 - z0, t = Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / Math.max(dx * dx + dz * dz, 1e-6)));
        return Math.hypot(px - x0 - t * dx, pz - z0 - t * dz);
      };
      const tracks = (this._trackLines ?? []).map((t) => [t.x0, t.z0, t.x1, t.z1, 6.5]);
      for (const farm of (surveyedPaddocks(this.city) ?? [])) {
        for (let k = 1; k < farm.accessTrack.length; k += 1) {
          tracks.push([farm.accessTrack[k - 1][0], farm.accessTrack[k - 1][1], farm.accessTrack[k][0], farm.accessTrack[k][1], 6.5]);
        }
      }
      const farms = (surveyedPaddocks(this.city) ?? []).map((farm) => [farm.centre.x, farm.centre.z]);
      const railBoxes = [];
      if (this._rail) {
        const rb = new THREE.Box3();
        this._rail.updateWorldMatrix(true, true);
        this._rail.traverse((node) => {
          if (!node.isMesh) return;
          rb.setFromObject(node);
          if (!rb.isEmpty()) railBoxes.push([rb.min.x - 8, rb.min.z - 8, rb.max.x + 8, rb.max.z + 8]);
        });
      }
      const inBox = (x, z, [x0, z0, x1, z1], pad) => x >= x0 - pad && x <= x1 + pad && z >= z0 - pad && z <= z1 + pad;
      const blocked = (x, z) => {
        if (inVenueKeepOut(x, z)) return true;
        const out = Math.max(-z, z - extent.z, -x, x - extent.x);
        // taste-r1 W79 fix 2 (L2): under LAND_EDGE the clearance is from the land edge (the board and every pad's drawn lawn), not the board's rectangle
        if ((LAND_EDGE.readers.tray ? landEdgeAt(x, z, landModelFor(extent)) : out) < PARCEL_FENCES.trayClearM) return true; // the tray band: wall, verge and its 20 m blend
        const w = waternessAt(x, z, extent, crust);
        if (w > 0.10) return true;
        const creek = creekFieldAt(x, z, extent, crust, crust?.seats, out, w);
        if (creek.thread > 0.005 || creek.bar > 0.02) return true;
        if (distanceToVenuePath(x, z, venuePaths) < 4) return true;
        for (const t of tracks) if (segDist(x, z, t[0], t[1], t[2], t[3]) < (FENCE_EDGES.on ? Math.min(t[4], FENCE_EDGES.trackM) : t[4])) return true;
        for (const f of farms) if (Math.hypot(x - f[0], z - f[1]) < 36) return true;
        for (const rbx of railBoxes) if (inBox(x, z, rbx, 0)) return true;
        for (const bx of occ.boxes) if (inBox(x, z, bx, 3)) return true;
        return false;
      };
      const planned = planParcelFences(FENCE_EDGES.on ? hinterland.fields.concat(hinterland.fenceRest ?? []) : hinterland.fields, { carried, blocked });
      // taste-r1 (W26): FENCE_CARRY bakes the weathered post and wire tokens into the vertex colours (white material); at 0, W25's greys and '#a29f94'.
      const fenceK = FENCE_HEDGED.on ? FENCE_HEDGED.timberGain : FENCE_EDGES.on ? FENCE_EDGES.timberGain : 1;
      const postTint = FENCE_HEDGED.on ? FENCE_HEDGED.postTint : FENCE_EDGES.postTint;
      const geo = makeWireFenceGeometry(FENCE_CARRY.on ? { post: tokenLinear(TASTE.built.fenceTimber).map((v, ch) => v * fenceK * (FENCE_EDGES.on ? postTint[ch] : 1)), wire: tokenLinear(TASTE.built.fenceWire).map((v) => v * fenceK) } : null);
      const tris = geo.index.count / 3;
      const slopeOk = (pf) => Math.abs(sampleGround(pf.a[0], pf.a[1]) - sampleGround(pf.b[0], pf.b[1])) / pf.len < 0.42;
      let list = planned.panels.filter((pf) => slopeOk(pf) && !blocked(pf.x, pf.z));
      let doubles = null;
      if (FENCE_EDGES.on) {
        // W27: one line where two edges would each draw one (against the panels kept so far and the post-and-rail runs and walls placed)
        doubles = dropDoubleFences(list, fences.concat(walls));
        list = doubles.kept;
      }
      // W28 (FENCE_HEDGED): the panels that lie within 2 m of a rail run or a wall are dropped
      let nearRuns = null;
      if (FENCE_HEDGED.on) {
        nearRuns = dropNearRuns(list, fences.concat(walls), FENCE_HEDGED.nearM);
        list = nearRuns.kept;
      }
      // W29 (FENCE_TIDY): no panel with a point on venue ground (weight `venueMax` or more); the line is zero such points
      let venueDropped = 0;
      const onVenue = (pf) => [0, 0.25, 0.5, 0.75, 1].some((t) => venueGroundWeight(pf.a[0] + (pf.b[0] - pf.a[0]) * t, pf.a[1] + (pf.b[1] - pf.a[1]) * t, fenceVenue) >= FENCE_TIDY.venueMax);
      if (FENCE_TIDY.on) {
        const before = list.length;
        list = list.filter((pf) => !onVenue(pf));
        venueDropped = before - list.length;
      }
      const capPanels = Math.floor(PARCEL_FENCES.maxTriangles * (plan.quality === 'medium' ? 0.5 : 1) / tris);
      const cx0 = extent.x * 0.5, cz0 = extent.z * 0.5;
      if (list.length > capPanels) {
        list = list.sort((u, v) => Math.hypot(u.x - cx0, u.z - cz0) - Math.hypot(v.x - cx0, v.z - cz0)).slice(0, capPanels);
      }
      // W28 (FENCE_HEDGED): a post-and-wire line beside each hedge, fitted to what the cap leaves
      let hedgedAdded = 0, hedgedCut = 0, hedgedPlanned = 0;
      if (FENCE_HEDGED.on) {
        const hedgeOnly = new Set(hedges.map((h) => `${h.gx}:${h.gz}`));
        const offFields = offsetHedgedFields(hinterland.fields, (b) => hedgeOnly.has(`${b.gx}:${b.gz}`),
          HEDGE_SECTION.width / 2 + FENCE_HEDGED.offM, (b) => (b.gx % 2 ? 1 : -1));
        const hp = planParcelFences(offFields, { carried: () => false, blocked });
        const along = (pf) => [0.25, 0.5, 0.75].every((t) => !blocked(pf.a[0] + (pf.b[0] - pf.a[0]) * t, pf.a[1] + (pf.b[1] - pf.a[1]) * t));
        let hl = hp.panels.filter((pf) => slopeOk(pf) && along(pf));
        hl = dropNearRuns(hl, fences.concat(walls), FENCE_HEDGED.nearM).kept;
        hl = dropDoubleFences(hl, fences.concat(walls, list.map((o) => ({ x: o.x, z: o.z, yaw: o.yaw, len: o.len })))).kept;
        if (FENCE_TIDY.on) { const before = hl.length; hl = hl.filter((pf) => !onVenue(pf)); venueDropped += before - hl.length; }
        hedgedPlanned = hl.length;
        const room = Math.max(0, capPanels - list.length);
        if (hl.length > room) hl = hl.sort((u, v) => Math.hypot(u.x - cx0, u.z - cz0) - Math.hypot(v.x - cx0, v.z - cz0)).slice(0, room);
        hedgedCut = hedgedPlanned - hl.length;
        hedgedAdded = hl.length;
        list = list.concat(hl);
      }
      if (gatesOn && list.length) list = gatedPanels(list, { kind: 'parcel-fence', tol: 0.8, half: (f) => f.len * 0.5 });
      if (list.length) {
        windrowFenceSegs = list.map((f) => [f.a[0], f.a[1], f.b[0], f.b[1], 0.25, WR_BIT.fence]);
        const mat = new THREE.MeshStandardMaterial({ color: FENCE_CARRY.on ? '#ffffff' : '#a29f94', vertexColors: true, roughness: 0.94, metalness: 0, side: THREE.DoubleSide });
        const mesh = new THREE.InstancedMesh(geo, mat, list.length);
        mesh.name = 'fringe:hinterland-parcel-fences';
        for (let i = 0; i < list.length; i += 1) {
          const f = list[i];
          const gy = Math.min(sampleGround(f.x, f.z), sampleGround(f.a[0], f.a[1]), sampleGround(f.b[0], f.b[1]));
          mesh.setMatrixAt(i, composeGrounded(geo, f.x, f.z, gy - 0.04, f.yaw - Math.PI * 0.5, f.len / PARCEL_FENCES.panelM, 1, 1,
            runSlope(f.x, f.z, f.yaw - Math.PI * 0.5, 8)));
        }
        mesh.instanceMatrix.needsUpdate = true;
        noPickCasting(mesh);
        this.root.add(mesh);
        this._parcelFences = { geo, mat };
        let stripFlagged = planned.flagged;
        if (FENCE_HEDGED.on) {
          // W28 (fences-fix): no strip under an edge that keeps fewer than three panels once every drop and cap has been applied
          const perEdge = new Map();
          for (const f of list) perEdge.set(f.gx, (perEdge.get(f.gx) ?? 0) + 1);
          stripFlagged = planned.flagged.filter((f) => (perEdge.get(f.gx) ?? 0) >= FENCE_HEDGED.minPanels);
        }
        const fenceTex = parcelFenceTexture(stripFlagged);
        const uni = fieldsMat.userData.workedPaddock.fence;
        if (uni) {
          uni.tex.value.dispose();
          uni.tex.value = fenceTex;
          const o = fenceTex.userData?.origin ?? [0, 0, 0];
          uni.org.value.set(o[0], o[1], o[2]);
        }
        mesh.userData.parcelFences = {
          panels: list.length, triangles: list.length * tris, trianglesPerPanel: tris, stripEdges: stripFlagged.length,
          gateGaps: planned.gateGaps, freeSamples: planned.freeSamples,
          flagged: planned.flagged.map((f) => [f.gx, f.fenceable, f.fenced]),
          list: list.map((f) => [f.x, f.z, f.a[0], f.a[1], f.b[0], f.b[1]]),
          edgeOf: list.map((f) => f.gx), others: fences.concat(walls).map((o) => [o.x, o.z, o.yaw, o.len]), // capture-time census only
          ...(FENCE_EDGES.on ? { rest: hinterland.fenceRest.length, doublesDropped: doubles.dropped.length } : {}),
          ...(FENCE_HEDGED.on ? { hedgedAdded, hedgedCut, hedgedPlanned, nearRunsDropped: nearRuns.dropped.length } : {}),
          ...(FENCE_TIDY.on ? { venueDropped } : {}),
          carriedKeys: [...hedgeKeys], placedKeys: [...placedKeys], // for the capture-time census only
        };
        this._hinterlandStats.parcelFences = list.length;
        this._hinterlandStats.parcelFenceTriangles = list.length * tris;
        this._hinterlandStats.parcelFenceStripEdges = stripFlagged.length;
        if (FENCE_HEDGED.on) { this._hinterlandStats.hedgedFences = hedgedAdded; this._hinterlandStats.nearRunsDropped = nearRuns.dropped.length; }
      } else {
        geo.dispose();
      }
    }

    if (walls.length) {
      // W11-B: dry-stone basalt, a 9 m run 1.1 m high; every fourth run has a tumbled gap.
      const geo = makeStoneWallGeometry(false);
      // Basalt: the cool rockDark token lit up to ink blue under the sky (S 80+ measured), so the
      // warm rockLight token is taken down to the rockDark value range (on-screen V 35 to 50) by the
      // fringe lighting gain (see STOCK_GAIN).
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(TASTE.ground.rockLight).multiplyScalar(0.105), vertexColors: true, roughness: 0.96, metalness: 0 });
      const wallDraw = gatesOn ? gatedPanels(walls, { kind: 'wall', tol: 1.2, half: (w) => w.len * 0.5 }) : walls; // taste W82 (TRACK_GATES)
      const wallSets = [
        { name: 'fringe:hinterland-walls', geo, list: wallDraw.filter((w) => !wallsTumbled.has(w.srcRef ?? w)) },
        { name: 'fringe:hinterland-walls-tumbled', geo: makeStoneWallGeometry(true), list: wallDraw.filter((w) => wallsTumbled.has(w.srcRef ?? w)) },
      ];
      for (const set of wallSets) {
        if (!set.list.length) { if (set.geo !== geo) set.geo.dispose(); continue; }
        const mesh = new THREE.InstancedMesh(set.geo, mat, set.list.length);
        mesh.name = set.name;
        for (let i = 0; i < set.list.length; i += 1) {
          const w = set.list[i];
          mesh.setMatrixAt(i, composeGrounded(
            set.geo, w.x, w.z, w.y - 0.08, w.yaw - Math.PI * 0.5, w.len / 9, w.height / 1.1, 1,
            runSlope(w.x, w.z, w.yaw - Math.PI * 0.5, w.len),
          ));
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.receiveShadow = true;
        noPick(mesh);
        this.root.add(mesh);
      }
      this._walls = { geo, mat };
      this._wallsTumbled = { geo: wallSets[1].geo, mat: null };
      this._hinterlandStats.walls = walls.length;
    }
    if (gatesOn) {
      // W82 fix 2: the double-track cases (two tracks through one gap): `pair` one gateway over both bands (centrelines 7.6 m or less), `between` refused (over 7.6, under 11.6 m), `restore` the run between the bands restored, a gateway to each track (11.6 m or more)
      const dbl = { pair: { built: 0, refused: 0 }, between: { refused: 0 }, restore: { gateways: 0, refused: 0 } };
      for (const g of gateList) { if (g.pair) dbl.pair.built += 1; if (g.restored) dbl.restore.gateways += 1; }
      for (const v of Object.values(gateStats)) for (const q of v.rejected ?? []) { if (q.dcase === 'pair') dbl.pair.refused += 1; else if (q.dcase === 'between') dbl.between.refused += 1; else if (q.dcase === 'restore') dbl.restore.refused += 1; }
      this._hinterlandStats.trackGates = { band: TRACK_GATE_BAND, gates: gateList.length, byKind: gateStats, double: dbl, tone: trackGateToneActive() };
    }

    if (reeds.length) {
      // W11-A: a bulrush clump (blades bent outward, brown seed heads), geometry only.
      const geo = reedForm({ variant: 0 });
      const mat = new THREE.MeshStandardMaterial({ color: '#2a4a32', roughness: 0.98, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(geo, mat, reeds.length);
      mesh.name = 'fringe:hinterland-reeds';
      for (let i = 0; i < reeds.length; i += 1) {
        const r = reeds[i];
        mesh.setMatrixAt(i, composeGrounded(
          geo, r.x, r.z, r.y, r.yaw, r.scale, r.height, r.scale,
        ));
      }
      mesh.instanceMatrix.needsUpdate = true;
      noPick(mesh);
      this.root.add(mesh);
      this._reeds = { geo, mat };
      this._hinterlandStats.reeds = reeds.length;
    }

    // Creek water is painted into the unique albedo (thread / riparian /
    // shingle). A ribbon mesh sampled on an 8 m along-step read as a
    // lightning-bolt n-gon at the graded pose — the overlay hole the draw
    // mask now fills. Reeds remain as the silhouette that reads.

    // taste W31 (WINDROW_FORM): the gates swept on every planned row, with the switch off as well (the audit counts the rows each gate
    // fails), and with it on the rows cut into pieces where hay can lie.
    let windrowForm = null;
    if (windrows.length) {
      const segs = [];
      const along = (it, r, bit) => {
        const hx = Math.sin(it.yaw) * it.len * 0.5;
        const hz = Math.cos(it.yaw) * it.len * 0.5;
        segs.push([it.x - hx, it.z - hz, it.x + hx, it.z + hz, r, bit]);
      };
      for (const it of hedges.concat(windbreakPts)) along(it, Math.max(it.width ?? 1.8, 2.2) * 0.5, WR_BIT.hedge);
      for (const it of fences.concat(walls)) along(it, 0.3, WR_BIT.fence);
      for (const sg of windrowFenceSegs) segs.push(sg);
      for (const run of hinterland.rimBrow ?? []) for (const it of run) along(it, 3, WR_BIT.rim);
      for (const t of this._trackLines ?? []) segs.push([t.x0, t.z0, t.x1, t.z1, 3.2, WR_BIT.track]);
      for (const farm of (surveyedPaddocks(this.city) ?? [])) {
        for (let k = 1; k < farm.accessTrack.length; k += 1) {
          segs.push([farm.accessTrack[k - 1][0], farm.accessTrack[k - 1][1], farm.accessTrack[k][0], farm.accessTrack[k][1], 3.2, WR_BIT.track]);
        }
      }
      for (const vp of venueGroundPaths(extent)) segs.push([vp.x, vp.y, vp.z, vp.w, 2.5, WR_BIT.venue]);
      const pts = [];
      for (const tr of trees.concat(belts)) pts.push([tr.x, tr.z, Math.max(0.3, (tr.scale ?? 8) * 0.035), WR_BIT.tree]);
      for (const dam of dams) pts.push([dam.x, dam.z, dam.radius * 1.3 + 2, WR_BIT.water]);
      const outOfBoard = (x, z) => Math.max(-z, z - extent.z, -x, x - extent.x);
      const wrCtx = {
        segs, pts, clearM: WINDROW_FORM.clearM, halfW: WINDROW_FORM.widthM * 0.5, stepM: WINDROW_FORM.stepM, minPieceM: WINDROW_FORM.minPieceM,
        widthM: WINDROW_FORM.widthM, heightM: WINDROW_FORM.heightM,
        venueAt: (x, z) => inVenueKeepOut(x, z) || (LAND_EDGE.readers.tray ? landEdgeAt(x, z, landModelFor(extent)) : outOfBoard(x, z)) < PARCEL_FENCES.trayClearM || !occ.free(x, z), // W79 fix 2: the land edge under LAND_EDGE
        waterAt: (x, z) => {
          const w = waternessAt(x, z, extent, crust);
          if (w > 0.10) return true;
          const creek = creekFieldAt(x, z, extent, crust, crust?.seats, outOfBoard(x, z), w);
          return creek.thread > 0.005 || creek.bar > 0.02;
        },
        parcelAt: (x, z) => {
          const sub = paddockSubAt(x, z, seed, extent);
          return paddockKind(sub.coarse.ix, sub.coarse.iz, seed) === 2 ? `${sub.ix}:${sub.iz}` : null;
        },
      };
      const planned = windrows.length;
      const gate = { planned, plannedTriangles: planned * 24, before: auditWindrows(windrows, wrCtx) };
      if (WINDROW_FORM.on) {
        const pieces = cutWindrows(windrows, wrCtx, seed);
        let ringM = WINDROW_FORM.ringM;
        while (windrowTriangles(pieces, ringM) > WINDROW_FORM.triGain * 24 * planned && ringM < 6) ringM += 0.1;
        gate.after = auditWindrows(pieces, wrCtx);
        gate.pieces = pieces.length;
        gate.pieceMetres = pieces.reduce((a, pc) => a + pc.len, 0);
        gate.ringM = ringM;
        gate.triangles = windrowTriangles(pieces, ringM);
        windrowForm = { pieces, ringM };
        windrows = pieces.map((pc) => ({ ...pc, y: sampleGround(pc.x, pc.z) }));
      }
      this._hinterlandStats.windrowGate = gate;
    }
    if (windrows.length && windrowForm) {
      const geo = makeWindrowGeometry(windrowForm.pieces, { sampleY: sampleGround, seed, ringM: windrowForm.ringM });
      const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.96, metalness: 0 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'fringe:hinterland-windrows';
      mesh.userData.windrowPieces = windrowForm.pieces.map((pc) => [pc.x, pc.z, pc.yaw, pc.len]); // x, z, yaw, length: for captures and tests
      mesh.receiveShadow = true;
      noPick(mesh);
      this.root.add(mesh);
      this._windrows = { geo, mat };
      this._hinterlandStats.windrows = windrows.length;
      this._hinterlandStats.windrowTriangles = geo.attributes.position.count / 3;
    } else if (windrows.length) {
      const geo = makeHedgeGeometry();
      const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.96, metalness: 0 });
      const mesh = new THREE.InstancedMesh(geo, mat, windrows.length);
      mesh.name = 'fringe:hinterland-windrows';
      for (let i = 0; i < windrows.length; i += 1) {
        const b = windrows[i];
        const hy = b.height / 0.866;
        mesh.setMatrixAt(i, composeGrounded(
          geo, b.x, b.z, b.y + hy * 0.5 - 0.10,
          b.yaw - Math.PI * 0.5, b.len, hy, b.width,
        ));
        c.setHSL(0.115 + b.hue * 0.035, 0.34 + b.hue * 0.14, 0.40 + b.hue * 0.10, THREE.SRGBColorSpace);
        mesh.setColorAt(i, c);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.receiveShadow = true;
      noPick(mesh);
      this.root.add(mesh);
      this._windrows = { geo, mat };
      this._hinterlandStats.windrows = windrows.length;
      this._hinterlandStats.windrowTriangles = windrows.length * 24;
    }

    if (scrub.length) {
      // W11-A: a low shrub mass of domed lobes in a 1 x 1 x 0.866 m unit (the instance scale gives metres).
      const geo = scrubForm({ variant: 0 });
      const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.98, metalness: 0, vertexColors: true });
      applyFoliageDetail(mat, { puff: true }); // W19-A
      const mesh = new THREE.InstancedMesh(geo, mat, scrub.length);
      mesh.name = 'fringe:hinterland-scrub';
      for (let i = 0; i < scrub.length; i += 1) {
        const b = scrub[i];
        const hy = b.height / 0.866;
        mesh.setMatrixAt(i, composeGrounded(
          geo, b.x, b.z, b.y + hy * 0.5 - 0.14,
          b.yaw - Math.PI * 0.5, b.len, hy, b.width,
        ));
        // Drier and greyer than the hedges, so scrub and clipped hedge are two
        // materials rather than one shape at two sizes.
        c.setHSL(0.19 + b.hue * 0.09, 0.16 + b.hue * 0.14, 0.20 + b.hue * 0.10, THREE.SRGBColorSpace);
        mesh.setColorAt(i, c);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.receiveShadow = true;
      noPick(mesh);
      this.root.add(mesh);
      this._scrub = { geo, mat };
      this._hinterlandStats.scrub = scrub.length;
    }

    // W22-A: the low layer. Shrubs and tussocks built of cards, one instanced mesh per form variant (six at most), every
    // instance seated on the built sheet by the lowest of its footprint points and sunk a hand's breadth.
    let tufts = (hinterland.tufts ?? []).filter(clear);
    if (this._trackRoute) tufts = tufts.filter((t) => t.kind !== 0 || routedClear(t.x, t.z)); // W80 (TRACK_ROUTE): no shrub on a routed track
    // W83 (TRACK_GATES, item 1): a shrub or tuft planted after the gating whose footprint comes within `GATE_KIT.runOutClear` of a drawn run-out is dropped (the fence wins).
    // The footprint is the disc of its form's widest vertex at the instance's scale; the counts are per kind (`foot`: of those, the fence-foot ones).
    const runOutDrop = { shrub: 0, tussock: 0, paddockShrub: 0, paddockTuft: 0, foot: 0 };
    const runOutSegs = gatesOn ? (this._trackRunOuts ?? []).map((r) => [r.a[0], r.a[1], r.b[0], r.b[1]]) : [];
    const tuftReachMemo = new Map();
    const nearRunOut = (t, kind) => {
      if (!runOutSegs.length) return false;
      const key = `${kind}:${t.variant}`;
      let r = tuftReachMemo.get(key);
      if (r === undefined) {
        const g = tuftForm({ kind, variant: t.variant }); const pa = g.getAttribute('position'); r = 0;
        for (let i = 0; i < pa.count; i += 1) r = Math.max(r, Math.hypot(pa.getX(i), pa.getZ(i)));
        g.dispose(); tuftReachMemo.set(key, r);
      }
      const reach = r * t.scale + GATE_KIT.runOutClear;
      return runOutSegs.some((q) => gateIndex.segD(t.x, t.z, q) < reach);
    };
    let footPlanted = [];
    if (TRUNK_TUFTS.on && plan.quality !== 'low') {
      // W46: the foot growth of the eucalypts, appended to the same sets (the earlier instances keep their places).
      // the post-and-rail runs (8 m, centred, along (sin yaw, cos yaw)) and the parcel fence panels, as segments: no clump over a fence line
      const footFences = fences.map((f) => [f.x - Math.sin(f.yaw) * 4, f.z - Math.cos(f.yaw) * 4, f.x + Math.sin(f.yaw) * 4, f.z + Math.cos(f.yaw) * 4])
        .concat(windrowFenceSegs.map((g) => [g[0], g[1], g[2], g[3]]));
      const footStats = {};
      // W53 (TUFT_CLEAR): the sheds' footprints and the hedges' bodies join the fences as obstacles
      const footObstacles = TUFT_CLEAR.on ? { sheds: sheds.map((sh) => ({ x: sh.x, z: sh.z, yaw: sh.yaw, len: sh.len, width: sh.width, box: shedModelBox(shedFormOf(sh)) })), hedges, hedgeHw } : null;
      const footTrees = this._plantedTrees(trees, belts).filter((t) => !(t.kind === 4 || t.role === 'windbreak'));
      const foot = trunkTuftPlacements(footTrees, plan.quality, seed, footFences, footStats, footObstacles);
      tufts = tufts.concat(foot);
      footPlanted = foot;
      this._hinterlandStats.footFenceDropped = footStats.fenceDropped ?? 0;
      this._hinterlandStats.footFence = { moved: footStats.fenceMoved ?? 0, dropped: footStats.fenceDropped ?? 0, dropRule: footStats.dropRuleDropped ?? 0, trees: footStats.trees ?? 0, under5: footStats.treesUnderFive ?? 0, under5Before: footStats.treesUnderFiveBefore ?? 0 };
      this._footObstacles = { sheds, hedges, hedgeHw, trees: footTrees }; // W53: the lists the foot test was given (references; the probes read them), whether the switch is on or not
      this._hinterlandStats.footTufts = foot.length;
      this._hinterlandStats.footShrubs = foot.filter((t) => t.kind === 0).length;
    }
    if (gatesOn && runOutSegs.length) {
      const footSet = new Set(footPlanted);
      tufts = tufts.filter((t) => {
        if (!nearRunOut(t, t.kind === 0 ? 'shrub' : 'tussock')) return true;
        runOutDrop[t.kind === 0 ? 'shrub' : 'tussock'] += 1; if (footSet.has(t)) runOutDrop.foot += 1;
        return false;
      });
    }
    if (tufts.length) {
      const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.98, metalness: 0, vertexColors: true });
      applyFoliageDetail(mat, { puff: true, cards: true });
      // taste W59 (SHRUB_TONE): the shrubs' own material, the same patch and the key's diffuse term scaled; off, the shared one.
      let shrubMat = mat;
      if (SHRUB_TONE.on) {
        shrubMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.98, metalness: 0, vertexColors: true });
        applyFoliageDetail(shrubMat, { puff: true, cards: true });
        applyShrubTone(shrubMat);
      }
      const leafA = tokenLinear(TASTE.foliage.leafA);
      const olive = tokenLinear(TASTE.accent.olive).map((v, ch) => v * 0.3 + leafA[ch] * 0.7);
      const straw = tokenLinear(TASTE.ground.grassDry);
      const grey = tokenLinear(TASTE.foliage.leafGrey);
      const tm = new THREE.Matrix4();
      const tp = new THREE.Vector3();
      const tq = new THREE.Quaternion();
      const ts = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      const tc = new THREE.Color();
      const geos = [];
      const shrubSeats = [];
      for (let kind = 0; kind < 2; kind += 1) {
        for (let variant = 0; variant < 3; variant += 1) {
          const list = tufts.filter((t) => t.kind === kind && t.variant === variant);
          if (!list.length) continue;
          const geo = tuftForm({ kind: kind === 0 ? 'shrub' : 'tussock', variant });
          geos.push(geo);
          const mesh = new THREE.InstancedMesh(geo, kind === 0 ? shrubMat : mat, list.length);
          mesh.name = kind === 0 ? 'fringe:hinterland-shrub' : 'fringe:hinterland-tussock';
          for (let i = 0; i < list.length; i += 1) {
            const t = list[i];
            const rr = (kind === 0 ? 0.46 : 0.32) * t.scale;
            let y = sampleY(t.x, t.z) ?? t.y;
            for (let q = 0; q < 4; q += 1) {
              const e = sampleY(t.x + Math.cos(q * Math.PI * 0.5 + t.yaw) * rr, t.z + Math.sin(q * Math.PI * 0.5 + t.yaw) * rr);
              if (e !== null && e < y) y = e;
            }
            t.y = y;
            tp.set(t.x, y - 0.07 * t.scale, t.z);
            tq.setFromAxisAngle(up, t.yaw);
            ts.set(t.scale, t.scale * (t.sy ?? 1), t.scale); // sy: the foot clumps (W49) stand taller than wide
            tm.compose(tp, tq, ts);
            mesh.setMatrixAt(i, tm);
            // Dusty olive, some toward straw, some toward grey-green; a value roll each.
            const tune = HINTERLAND_TUFT_TUNE > 0;
            const lin = (tune ? leafA : olive).slice();
            if (tune) {
              // W23-C: living dusty olive; tussock toward straw-green; a little grey-green at the top of the hue roll.
              if (kind === 1) { const k = 0.30 + 0.30 * (1 - t.hue); for (let ch = 0; ch < 3; ch += 1) lin[ch] += (straw[ch] - lin[ch]) * k; }
              else if (t.hue > 0.7) { const k = (t.hue - 0.7) / 0.3 * 0.15; for (let ch = 0; ch < 3; ch += 1) lin[ch] += (grey[ch] - lin[ch]) * k; }
              else if (t.hue < 0.3) { const k = (0.3 - t.hue) / 0.3 * 0.18; for (let ch = 0; ch < 3; ch += 1) lin[ch] += (straw[ch] - lin[ch]) * k; }
            } else if (t.hue < 0.3) { const k = (0.3 - t.hue) / 0.3 * 0.30; for (let ch = 0; ch < 3; ch += 1) lin[ch] += (straw[ch] - lin[ch]) * k; }
            else if (t.hue > 0.7) { const k = (t.hue - 0.7) / 0.3 * 0.45; for (let ch = 0; ch < 3; ch += 1) lin[ch] += (grey[ch] - lin[ch]) * k; }
            const vv = TREE_GAIN * (tune ? TUFT_GAIN_TUNE : 1.45) * (0.85 + t.val * 0.35);
            let cr = lin[0] * vv; let cg = lin[1] * vv; let cb = lin[2] * vv;
            if (kind === 0 && SHRUB_TONE.on && (SHRUB_TONE.val !== 1 || SHRUB_TONE.sat !== 1)) {
              // W61 (review only, `?shrubVal=` `?shrubSat=`): the value scaled, then the saturation about the colour's own luminance.
              cr *= SHRUB_TONE.val; cg *= SHRUB_TONE.val; cb *= SHRUB_TONE.val;
              const lum = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
              cr = Math.max(0, lum + (cr - lum) * SHRUB_TONE.sat); cg = Math.max(0, lum + (cg - lum) * SHRUB_TONE.sat); cb = Math.max(0, lum + (cb - lum) * SHRUB_TONE.sat);
            }
            tc.setRGB(cr, cg, cb);
            mesh.setColorAt(i, tc);
            if (kind === 0) shrubSeats.push(t);
          }
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          if (kind === 0) {
            noPickCasting(mesh);
            if (crownCardsActive()) mesh.customDepthMaterial = crownCardDepthMaterial();
          } else {
            noPick(mesh);
          }
          this.root.add(mesh);
        }
      }
      this._tufts = { geo: geos[0], mat };
      this._tuftGeos = geos;
      this._hinterlandStats.tufts = tufts.length;
      this._hinterlandStats.tuftShrubs = shrubSeats.length;
      this._tuftShrubs = shrubSeats;
    }

    // W27: the paddock tier. W28: shrub anchors (the scrub shrub's form) and the tussock form at 1.2 to 1.8 times its size, one instanced mesh per
    // kind and variant on a material of its own; nothing is built at switch 0.
    let padTufts = (hinterland.paddockTufts ?? []).filter(clear);
    if (padTufts.length) {
      // Nothing on a farm track (6.5 m bed, the fences' own list) or on a venue ground path: dropped by distance from the line, the item's radius included.
      const padPaths = venueGroundPaths(extent);
      const padTracks = (this._trackLines ?? []).map((t) => [t.x0, t.z0, t.x1, t.z1]);
      for (const farm of (surveyedPaddocks(this.city) ?? [])) {
        for (let k = 1; k < farm.accessTrack.length; k += 1) padTracks.push([farm.accessTrack[k - 1][0], farm.accessTrack[k - 1][1], farm.accessTrack[k][0], farm.accessTrack[k][1]]);
      }
      const padSeg = (px, pz, x0, z0, x1, z1) => {
        const dx = x1 - x0; const dz = z1 - z0;
        const u = Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / Math.max(dx * dx + dz * dz, 1e-6)));
        return Math.hypot(px - x0 - u * dx, pz - z0 - u * dz);
      };
      padTufts = padTufts.filter((t) => {
        const reach = 3.25 + t.scale * (t.kind === 'shrub' ? 0.4 : 0.25);
        if (distanceToVenuePath(t.x, t.z, padPaths) < 4 + t.scale * 0.3) return false;
        return !padTracks.some((q) => padSeg(t.x, t.z, q[0], q[1], q[2], q[3]) < reach);
      });
    }
    if (gatesOn && runOutSegs.length && padTufts.length) { // W83 (item 1): as the shrubs above; before the anchor rule below, so a group that loses every anchor loses its tussocks
      padTufts = padTufts.filter((t) => {
        if (!nearRunOut(t, t.kind)) return true;
        runOutDrop[t.kind === 'shrub' ? 'paddockShrub' : 'paddockTuft'] += 1;
        return false;
      });
    }
    if (gatesOn && this._hinterlandStats.trackGates) this._hinterlandStats.trackGates.shrubsDropped = runOutDrop;
    // Seated as the scrub shrub and tussock are: the lowest of four points on the footprint (and the centre), on the built surface.
    const padSeatY = (t) => {
      const rr = (t.kind === 'shrub' ? 0.46 : 0.32) * t.scale;
      let y = sampleY(t.x, t.z) ?? t.y;
      for (let q = 0; q < 4; q += 1) {
        const e = sampleY(t.x + Math.cos(q * Math.PI * 0.5 + t.yaw) * rr, t.z + Math.sin(q * Math.PI * 0.5 + t.yaw) * rr);
        if (e !== null && e < y) y = e;
      }
      return y;
    };
    if (PADDOCK_SEAT > 0 && padTufts.length) {
      // W29: nothing seats on built ground under the floor (the placement tested the analytic ground; the built sheet differs a little), and a
      // group that has lost every anchor loses its tussocks, which read as loose pale dots without them.
      padTufts = padTufts.filter((t) => padSeatY(t) >= PADDOCK_TUFT_PARAMS.seatFloor);
      const anchored = new Set(padTufts.filter((t) => t.kind === 'shrub').map((t) => t.group));
      padTufts = padTufts.filter((t) => t.kind === 'shrub' || anchored.has(t.group));
    }
    if (padTufts.length) {
      const mat = paddockTuftMaterial();
      const pm = new THREE.Matrix4();
      const pp = new THREE.Vector3();
      const pq = new THREE.Quaternion();
      const ps = new THREE.Vector3();
      const pc = new THREE.Color();
      const pup = new THREE.Vector3(0, 1, 0);
      const pgeos = [];
      for (const kind of ['shrub', 'tussock']) {
        for (let variant = 0; variant < 3; variant += 1) {
          const list = padTufts.filter((t) => t.kind === kind && t.variant === variant);
          if (!list.length) continue;
          const geo = tuftForm({ kind, variant });
          pgeos.push(geo);
          const mesh = new THREE.InstancedMesh(geo, mat, list.length);
          mesh.name = kind === 'shrub' ? 'fringe:hinterland-paddock-shrubs' : 'fringe:hinterland-paddock-tufts';
          for (let i = 0; i < list.length; i += 1) {
            const t = list[i];
            // Sunk a hand's breadth below the seat (`padSeatY`).
            const y = padSeatY(t);
            t.y = y;
            pp.set(t.x, y - 0.07 * t.scale, t.z);
            pq.setFromAxisAngle(pup, t.yaw);
            ps.set(t.scale, t.scale, t.scale);
            pm.compose(pp, pq, ps);
            mesh.setMatrixAt(i, pm);
            pc.setRGB(t.col[0], t.col[1], t.col[2]);
            mesh.setColorAt(i, pc);
          }
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          noPick(mesh);
          this.root.add(mesh);
        }
      }
      this._paddockTufts = { geos: pgeos, mat };
      // W28: a soft contact decal under each anchor (the tree shade's: multiplied into the ground, no depth write), one anchor wide, so none floats.
      const anchorsLaid = padTufts.filter((t) => t.kind === 'shrub');
      if (anchorsLaid.length) {
        const sh = PADDOCK_TUFT_PARAMS.shade;
        const shGeo = makeTreeShade(plan, anchorsLaid.map((t) => ({ x: t.x, z: t.z, yaw: t.yaw, scale: t.scale, patchRadius: t.scale * sh.k, patchDark: sh.dark })), sampleY);
        const shMat = makeContactMaterial();
        const shMesh = new THREE.Mesh(shGeo, shMat);
        shMesh.name = 'fringe:hinterland-paddock-shade';
        shMesh.renderOrder = -14;
        noPick(shMesh);
        this.root.add(shMesh);
        this._paddockShade = { geo: shGeo, mat: shMat };
      }
      this._hinterlandStats.paddockTufts = padTufts.length;
      this._hinterlandStats.paddockShrubs = padTufts.filter((t) => t.kind === 'shrub').length;
    }


    if (sheds.length) {
      // W11-B: a 12 x 8 m portal-frame shed in three forms (gable hay shed, skillion machinery
      // shed with doors, gable with a lean-to). The model is true size; the instance scale
      // is the planned footprint over 12 x 8 and the planned ridge over 5.2 m.
      const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.86, metalness: 0.06 });
      const shedForm = shedFormOf;
      const shedSets = [
        { name: 'fringe:hinterland-sheds', form: 'gable' },
        { name: 'fringe:hinterland-sheds-skillion', form: 'skillion' },
        { name: 'fringe:hinterland-sheds-leanto', form: 'leanto' },
      ].map((set) => ({ ...set, geo: makeShedGeometry(set.form), list: sheds.filter((sh) => shedForm(sh) === set.form) }));
      for (const set of shedSets) {
        if (!set.list.length) { set.geo.dispose(); set.geo = null; continue; }
        const mesh = new THREE.InstancedMesh(set.geo, mat, set.list.length);
        mesh.name = set.name;
        for (let i = 0; i < set.list.length; i += 1) {
          const sh = set.list[i];
          mesh.setMatrixAt(i, composeGrounded(
            set.geo, sh.x, sh.z, sh.y - 0.05,
            sh.yaw - Math.PI * 0.5, sh.len / 12, sh.height / 5.2, sh.width / 8,
          ));
          // The roof is the iron token on every shed; the instance only varies the
          // weathering by a few percent.
          c.setRGB(0.90 + sh.tone * 0.10, 0.90 + sh.tone * 0.10, 0.90 + sh.tone * 0.10);
          mesh.setColorAt(i, c);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        noPickCasting(mesh);
        this.root.add(mesh);
      }
      const shedGeos = shedSets.map((set) => set.geo);
      this._sheds = { geo: shedGeos[0] ?? null, mat };
      this._shedExtra = shedGeos.slice(1).filter(Boolean).map((geo) => ({ geo, mat: null }));
      this._hinterlandStats.sheds = sheds.length;
    }

    if (bales.length) {
      const geo = makeBaleGeometry();
      // W7-C: hay is grass.dry drawn toward sand, taken down by the fringe's lighting gain.
      const baleTone = new THREE.Color(TASTE.ground.grassDry).lerp(new THREE.Color(TASTE.ground.sandDry), 0.30).multiplyScalar(0.34);
      // W11-B: a true-size round bale (1.5 m across, 1.2 m wide, flat spot underneath, lowest
      // point at y = -0.70), so it is placed at scale 1.
      const mat = new THREE.MeshStandardMaterial({ color: baleTone, vertexColors: true, roughness: 0.95, metalness: 0 });
      const mesh = new THREE.InstancedMesh(geo, mat, bales.length);
      mesh.name = 'fringe:hinterland-bales';
      for (let i = 0; i < bales.length; i += 1) {
        const b = bales[i];
        mesh.setMatrixAt(i, composeGrounded(
          geo, b.x, b.z, b.y + 0.70, b.yaw - Math.PI * 0.5, 1, 1, 1,
        ));
      }
      mesh.instanceMatrix.needsUpdate = true;
      noPickCasting(mesh);
      this.root.add(mesh);
      this._bales = { geo, mat };
      this._hinterlandStats.bales = bales.length;
    }

    /**
     * ── DUNE GRASS ON THE TRANSITION, BECAUSE A FEATHER STILL NEEDS FURNISHING ──
     *
     * The snap makes the grass-to-sand line follow the coast and the seaward
     * overshoot makes it fade through the albedo's own sand, but a boundary that
     * two materials merely blend across is still a boundary you can point at. The
     * crust's own file records the rule it wants at a cover edge — "a scatter of
     * patches, or a blended border" — so the line is planted: marram tussocks
     * straddling it, denser landward, thinning to nothing over the sand.
     *
     * They ride the reed archetype (a tapered five-sided tuft, 20 tris) at a
     * straw-green tone, so the family costs one draw call and no new geometry.
     */
    const dunes = [];
    {
      const edge = fieldsGeo.userData.coastEdge ?? [];
      const cxE = extent.x * 0.5;
      const czE = extent.z * 0.5;
      for (let i = 0; i < edge.length && dunes.length < 520; i += 1) {
        const e = edge[i];
        const kx = Math.round(e.x);
        const kz = Math.round(e.z);
        const dx = e.x - cxE;
        const dz = e.z - czE;
        const dl = Math.hypot(dx, dz) || 1;
        // Landward is toward the board; the tangent is its perpendicular.
        const inx = -dx / dl;
        const inz = -dz / dl;
        const tx = -inz;
        const tz = inx;
        const n = 3;
        for (let k = 0; k < n; k += 1) {
          const u = idxUnit(270 + k, kx, kz, seed);
          const v = idxUnit(274 + k, kz, kx, seed);
          // Biased landward: 3/4 of the scatter sits on the grass side, which is
          // where marram actually holds the sand.
          const inward = (v - 0.28) * 16;
          const along = (u - 0.5) * 22;
          const gx = e.x + inx * inward + tx * along;
          const gz = e.z + inz * inward + tz * along;
          const gy = sampleY(gx, gz);
          if (gy === null || gy < 0.15) continue;
          // taste-r1 W14-C: seaward of the coast brow the ribbon draws the bluff; nothing is planted on it.
          const rimD = coastRimAt(gx, gz, extent, crust);
          if (rimD.valid && rimD.gate > 0.35 && rimD.qm > -2.5) continue;
          dunes.push({
            x: gx,
            z: gz,
            y: gy - 0.05,
            yaw: u * TAU,
            height: 0.55 + v * 0.75,
            scale: 0.55 + u * 0.55,
            tone: idxUnit(278 + k, kx, kz, seed),
          });
        }
      }
    }
    if (dunes.length) {
      // W11-A: a marram clump of arching blades, geometry only.
      const geo = duneGrassForm({ variant: 0 });
      const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.98, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(geo, mat, dunes.length);
      mesh.name = 'fringe:hinterland-dune-grass';
      for (let i = 0; i < dunes.length; i += 1) {
        const d = dunes[i];
        mesh.setMatrixAt(i, composeGrounded(
          geo, d.x, d.z, d.y, d.yaw, d.scale, d.height, d.scale,
        ));
        // Straw at the sand end, sea-grey-green at the grass end. Marram is never
        // paddock green and never sand: it is the third tone that says "dune".
        c.setHSL(0.14 + d.tone * 0.09, 0.20 + d.tone * 0.16, 0.30 + d.tone * 0.18, THREE.SRGBColorSpace);
        mesh.setColorAt(i, c);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      noPickCasting(mesh, false);
      this.root.add(mesh);
      this._duneGrass = { geo, mat };
      this._hinterlandStats.dunes = dunes.length;
    }

    if (stock.length) {
      // W11-B: cattle (standing, grazing, lying) and sheep (standing, grazing) at true size.
      // The planned `scale` was relative to a unit beast of 1.9 m (cattle at 1.17 to 1.29, sheep
      // 0.60 to 0.66); the models are 2.4 m and 1.2 m, so it is divided by the old nominal size.
      // The vertex colour is an occlusion and part-tone multiplier on the instance coat.
      const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.92, metalness: 0 });
      const poseOf = (b) => {
        const roll = (((Math.round(b.x * 7.3) * 31 + Math.round(b.z * 5.9) * 17) % 100) + 100) % 100;
        if (b.sheep) return roll < 62 ? 0 : 1;
        return roll < 55 ? 0 : roll < 85 ? 1 : 2;
      };
      const stockSets = STOCK_POSES.map((def) => ({
        ...def,
        geo: def.build(),
        list: stock.filter((b) => !!b.sheep === def.sheep && poseOf(b) === def.pose
          && (def.sheep || (stockCoatOf(b) === 'hereford') === def.hereford)),
      }));
      for (const set of stockSets) {
        if (!set.list.length) { set.geo.dispose(); set.geo = null; continue; }
        const mesh = new THREE.InstancedMesh(set.geo, mat, set.list.length);
        mesh.name = set.name;
        for (let i = 0; i < set.list.length; i += 1) {
          const b = set.list[i];
          const k = b.scale / (b.sheep ? 0.63 : 1.23);
          mesh.setMatrixAt(i, composeGrounded(
            set.geo, b.x, b.z, b.y, b.yaw - Math.PI * 0.5, k, k, k,
          ));
          // Three coats for cattle, chosen per animal from its seeded tone roll: Angus
          // near-black, Hereford red-brown (white parts are in the geometry's vertex colour)
          // and fawn; sheep are off-white wool. The hex values are the on-screen coats; the
          // fringe lights a standard material about 4.7x its albedo, so they are taken down
          // by STOCK_GAIN, with a few percent of tone variation inside a coat.
          const coat = stockCoatOf(b);
          c.set(STOCK_COATS[coat]).multiplyScalar(STOCK_GAIN * STOCK_COAT_TRIM[coat] * (0.94 + ((b.tone * 9) % 1) * 0.12));
          mesh.setColorAt(i, c);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        noPickCasting(mesh);
        this.root.add(mesh);
      }
      const stockGeos = stockSets.map((set) => set.geo).filter(Boolean);
      this._stock = { geo: stockGeos[0] ?? null, mat };
      this._stockExtra = stockGeos.slice(1).map((geo) => ({ geo, mat: null }));
      this._hinterlandStats.stock = stock.length;
    }

    if (dams.length) {
      const geo = makeHinterlandDams(plan, dams, sampleY);
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.44,
        metalness: 0.08,
        fog: true,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      });
      // Same environment response as the paddock sheet it sits in (0.28, the value
      // the T8 note on `fieldsMat` derived from the crust). The family default is
      // 0.92, which lit the bank a third brighter than the ground beside it.
      mat.userData.envIntensityBase = 0.28;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'fringe:hinterland-dams';
      mesh.renderOrder = -15;
      noPick(mesh);
      this.root.add(mesh);
      this._dams = { geo, mat };
      this._hinterlandStats.dams = dams.length;

      const wgeo = makeHinterlandDamWater(plan, dams, sampleY);
      const wmat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        color: '#ffffff',
        roughness: 0.12,
        metalness: 0.30,
        // TASTE R1: a farm dam is mid-teal off the depth ramp, not a sky mirror.
        envMapIntensity: 0.18,
        fog: true,
        polygonOffset: true,
        polygonOffsetFactor: -5,
        polygonOffsetUnits: -5,
      });
      // The lighting rig gives any material with metalness over 0.15 four times the
      // environment, which made this dam a mirror of the sky (measured: sky blue,
      // H 200, in 20% of the dam-close frame). A material whose name says water is
      // exempt from that multiplier (`materialEnvironmentScale`), and the authored
      // base below keeps a faint sky sheen only.
      wmat.name = 'hinterland-dam-water';
      wmat.userData.envIntensityBase = 0.10;
      const wmesh = new THREE.Mesh(wgeo, wmat);
      wmesh.name = 'fringe:hinterland-dam-water';
      wmesh.renderOrder = -14;
      noPick(wmesh);
      this.root.add(wmesh);
      this._damWater = { geo: wgeo, mat: wmat };
    }

    /**
     * The standing-asset contact census. Trees, hedges and windbreaks have their
     * own non-overlapping terms above; crop rows and tracks are the ground's own
     * relief. Every other solid family contributes either one feathered disc or
     * one footprint ribbon here, all through the same pure multiply material.
     */
    const pointContacts = [];
    const addPoints = (list, family, radius, dark) => {
      for (const item of list) pointContacts.push({
        x: item.x, z: item.z, yaw: item.yaw ?? 0, scale: 1,
        patchRadius: radius(item), patchDark: dark, contactFamily: family,
      });
    };
    addPoints(stock, 'stock', (it) => 0.72 * it.scale, 0.94);
    addPoints(bales, 'bales', () => 0.88, 0.95);
    addPoints(reeds, 'reeds', (it) => Math.max(0.38, it.scale * 0.48), 0.97);
    addPoints(dunes, 'dune-grass', (it) => Math.max(0.38, it.scale * 0.46), 0.97);
    addPoints(this._tuftShrubs ?? [], 'tuft-shrub', (it) => Math.max(0.5, it.scale * 0.42), 0.95); // W22-A
    addPoints(dams, 'dams', (it) => it.radius * 1.04, 0.96);
    if (pointContacts.length) {
      const geo = makeTreeShade(plan, pointContacts, sampleGround);
      const mat = makeContactMaterial();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'fringe:hinterland-asset-contact-patches';
      mesh.userData.contactFamilies = [...new Set(pointContacts.map((p0) => p0.contactFamily))];
      mesh.userData.contactRecords = pointContacts.length;
      mesh.renderOrder = -14;
      noPick(mesh);
      this.root.add(mesh);
      this._assetPointContact = { geo, mat };
      this._hinterlandStats.assetPointContacts = pointContacts.length;
    }

    const runContacts = [];
    const addRuns = (list, family, width) => {
      for (const item of list) runContacts.push([{ ...item, contactFamily: family, contactWidth: width(item) }]);
    };
    addRuns(sheds, 'sheds', (it) => it.width * 1.04);
    addRuns(fences, 'fences', (it) => Math.max(0.42, it.width * 1.8));
    addRuns(walls, 'walls', (it) => Math.max(0.72, it.width * 1.35));
    addRuns(scrub, 'scrub', (it) => it.width * 1.02);
    addRuns(windrows, 'windrows', (it) => it.width * 1.02);
    for (const run of hinterland.rimBrow ?? []) {
      runContacts.push(run.map((item) => ({ ...item, contactFamily: 'rim-brow', contactWidth: 6 })));
    }
    if (runContacts.length) {
      const geo = makeStripContact(runContacts, {
        width: (run) => run[0].contactWidth, sampleY: sampleGround, dark: 0.93,
      });
      const mat = makeContactMaterial();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'fringe:hinterland-asset-contact-runs';
      mesh.userData.contactFamilies = [...new Set(runContacts.flat().map((p0) => p0.contactFamily))];
      mesh.userData.contactRecords = runContacts.length;
      mesh.renderOrder = -14;
      noPick(mesh);
      this.root.add(mesh);
      this._assetRunContact = { geo, mat };
      this._hinterlandStats.assetRunContacts = runContacts.length;
    }

    this._plantTrees(trees, belts);
    this._plantCrestTrees(thin('Crest', (plan.crestTrees ?? []).filter(clear)));
    if (gatesOn && gateList.length) {
      // taste W82 (TRACK_GATES, part 2): a farm gateway at every split on the list (fringe/track-gate.js), one merged mesh, built last so every run, trunk, bale and shrub is there to keep off
      const gateObs = collectGateObstacles(this.root);
      // W82 fix 2 (`?trackGateTone=`): `run` (default) bakes each gateway's run timber into the vertex colours (the rail fence's #3a342c for a rail fence; the parcel fence posts' weathered token, gain and tint for a
      // parcel fence, a hedge and the brow), `rail` the rail fence's material with its grey multipliers, `silver` and `galv` a token of their own over the rail fence's multipliers.
      const gateTone = trackGateToneActive() ?? 'run';
      const fenceGainK = FENCE_HEDGED.on ? FENCE_HEDGED.timberGain : FENCE_EDGES.on ? FENCE_EDGES.timberGain : 1;
      const fencePostTint = FENCE_HEDGED.on ? FENCE_HEDGED.postTint : FENCE_EDGES.postTint;
      const parcelPost = FENCE_CARRY.on ? tokenLinear(TASTE.built.fenceTimber).map((v, ch) => v * fenceGainK * (FENCE_EDGES.on ? fencePostTint[ch] : 1)) : tokenLinear('#a29f94');
      const railPost = tokenLinear(RAIL_FENCE_COLOUR);
      const parcelTones = { postFoot: 0.78, postHead: 1.12, rail: 1.12, stayHead: 1.0, stayFoot: 0.78 }; // makeWireFenceGeometry's post tones
      const timberOf = (g) => (gateTone === 'run'
        ? (g.kind === 'rail-fence' ? { base: railPost, tones: RAIL_FENCE_TONES } : { base: parcelPost, tones: parcelTones })
        : { base: [1, 1, 1], tones: RAIL_FENCE_TONES });
      const kit = buildTrackGates(gateList, {
        trackSegs: (this._trackLines ?? []).map((t) => [t.x0, t.z0, t.x1, t.z1]),
        obstacles: gateObs,
        sampleGround,
        timberOf,
      });
      if (kit.geometry) {
        const mat = makeGateMaterial(gateTone, { parcelRuns: gateList.some((g) => g.kind !== 'rail-fence') });
        const mesh = new THREE.Mesh(kit.geometry, mat);
        mesh.name = 'fringe:hinterland-track-gates';
        noPickCasting(mesh);
        this.root.add(mesh);
        this._trackGateMesh = { geo: kit.geometry, mat };
      }
      this._trackGateKit = kit.report;
      this._trackGateTone = gateTone;
      this._trackGateGround = sampleGround; // the probes read the ground the posts were seated on
      this._hinterlandStats.trackGates.kit = {
        gateways: kit.report.gateways.length, built: kit.report.gateways.length, posts: kit.report.posts, leaves: kit.report.leaves, swing: kit.report.swing, back: kit.report.back,
        left: kit.report.left.map((l) => ({ kind: l.kind, at: l.at, post: l.post, reason: l.reason })), tris: kit.report.tris,
        maxTrisPerGateway: kit.report.maxTrisPerGateway, drawCalls: kit.geometry ? 1 : 0, shearMax: +kit.report.shearMax.toFixed(3), obstacleTris: gateObs.count,
      };
      { // W83 (part 3): a shrub or tuft whose footprint the swept area of a leaf that was hung comes within `sweepClear` of is dropped (its instance scaled to nothing; counted with the shrub drops, `shrubsDropped.swept`)
        const swept = { shrub: 0, tussock: 0, paddockShrub: 0, paddockTuft: 0 }; const sectors = [];
        for (const w of kit.report.gateways) for (const l of w.leaves) if (l.mode !== 'off') sectors.push({ P: l.hinge, R: l.len, c0: l.closed, d: l.dir, sv: l.sv });
        const KEY = { 'fringe:hinterland-shrub': 'shrub', 'fringe:hinterland-tussock': 'tussock', 'fringe:hinterland-paddock-shrubs': 'paddockShrub', 'fringe:hinterland-paddock-tufts': 'paddockTuft' };
        const mm = new THREE.Matrix4(); const zero = new THREE.Matrix4().makeScale(0, 0, 0);
        if (sectors.length) this.root.traverse((o) => {
          const key = o.isInstancedMesh ? KEY[o.name] : null; if (!key) return;
          const pa = o.geometry.getAttribute('position'); let reach = 0; for (let i = 0; i < pa.count; i += 1) reach = Math.max(reach, Math.hypot(pa.getX(i), pa.getZ(i)));
          let changed = false;
          for (let i = 0; i < o.count; i += 1) {
            o.getMatrixAt(i, mm); const e = mm.elements; if (e[0] === 0 && e[5] === 0 && e[10] === 0) continue;
            const r = reach * Math.hypot(e[0], e[1], e[2]) + GATE_KIT.sweepClear + GATE_KIT.leafHalfT;
            if (sectors.some((S) => sectorDist(e[12], e[14], S) < r)) { o.setMatrixAt(i, zero); swept[key] += 1; changed = true; }
          }
          if (changed) o.instanceMatrix.needsUpdate = true;
        });
        if (this._hinterlandStats.trackGates.shrubsDropped) this._hinterlandStats.trackGates.shrubsDropped.swept = swept;
      }
    }
  }

  /**
   * taste-r1 (W27): the far tier of trees on the crust (`CREST_TREES`). The same two species, the same leaf material and the same
   * colour law as `_plantTrees`, in the far form, in at most six instanced meshes. They do not cast (the key's shadow band reaches
   * 260 m and these stand 600 m and more out, so a caster here would cost its triangles in the shadow pass for no shadow on the
   * board); they do receive, like their neighbours, and stand on one mesh of soft multiply decals (the tree-shade patch: dark at
   * the bole, exactly 1 at the rim, so it has no edge) so the crowns are seated and not floating on the crust.
   */
  _plantCrestTrees(list) {
    this._hinterlandStats.crestTrees = 0;
    if (!list.length) return;
    let leaf = this._treeMat;
    if (!leaf) {
      leaf = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.95, metalness: 0 });
      applyFoliageDetail(leaf, { puff: true, cards: true, trunkBark: true }); // W43: the hinterland trees' bark mottle
      this._treeMat = leaf;
    }
    const seed = this.plan.seed;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const eul = new THREE.Euler();
    const c = new THREE.Color();
    const bbox = new THREE.Box3();
    const geos = [];
    const shade = [];
    let draws = 0;
    let tris = 0;
    for (const species of TREE_SPECIES) for (let variant = 0; variant < 3; variant += 1) {
      const kind = species.kind;
      const set = list.filter((t, index) => (t.kind === 4 ? 4 : 0) === kind && index % 3 === variant);
      if (!set.length) continue;
      const geometry = makeTreeGeometry(kind, variant, { ...treeFormOptions(species), tier: 'far' }); // the far form, 120 triangles or fewer
      geos.push(geometry);
      bbox.setFromBufferAttribute(geometry.getAttribute('position'));
      const heightUnit = Math.max(1e-3, bbox.max.y - bbox.min.y);
      const crownHalf = 0.25 * ((bbox.max.x - bbox.min.x) + (bbox.max.z - bbox.min.z)); // W28: the crown's half width, for the foot of shade
      const leafLin = tokenLinear(species.colour);
      if (species.colour2) {
        const other = tokenLinear(species.colour2);
        for (let ch = 0; ch < 3; ch += 1) leafLin[ch] += (other[ch] - leafLin[ch]) * species.mix;
      }
      const mesh = new THREE.InstancedMesh(geometry, leaf, set.length);
      mesh.name = (kind === 4 ? 'fringe:crest-e' : 'fringe:crest-a') + (variant ? `:variant-${variant}` : '');
      for (let i = 0; i < set.length; i += 1) {
        const t = set[i];
        const tone = idxUnit(70, Math.round(t.x), Math.round(t.z), seed + i * 151 + variant * 37);
        const squash = idxUnit(71, Math.round(t.z), Math.round(t.x), seed + i * 157 + variant * 41);
        p.set(t.x, t.y, t.z);
        eul.set((tone - 0.5) * 0.105, t.yaw, (squash - 0.5) * 0.105);
        q.setFromEuler(eul);
        const roll = idxUnit(73, Math.round(t.x), Math.round(t.z), seed);
        const k = (species.base * (species.lo + roll * (species.hi - species.lo)) * (t.size ?? 1)) / heightUnit;
        s.set(k, k, k);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
        const vv = TREE_GAIN * (0.96 + tone * 0.08);
        c.setRGB(leafLin[0] * vv * species.tint[0], leafLin[1] * vv * species.tint[1], leafLin[2] * vv * species.tint[2]);
        mesh.setColorAt(i, c);
        shade.push({ x: t.x, z: t.z, yaw: t.yaw, scale: 1, patchRadius: (CREST_SHADE.on ? CREST_SHADE.reach * crownHalf : CREST_TREES.shade.k * heightUnit) * k, patchDark: CREST_SHADE.on ? CREST_SHADE.dark : CREST_TREES.shade.dark });
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      noPick(mesh); // castShadow false, no pick
      mesh.receiveShadow = true;
      mesh.userData.crestTrees = set.length;
      this.root.add(mesh);
      draws += 1;
      tris += set.length * (geometry.index ? geometry.index.count / 3 : geometry.getAttribute('position').count / 3);
    }
    // The contact shade: one mesh of feathered multiply decals (centre dark, rim exactly 1), laid on the crust 0.5 m up, never a disc.
    if (shade.length) {
      const { extent, crust } = this.plan;
      const seat = (x, z) => drawnCrustHeightAt(x, z, extent, crust, this.plan.quality) + CREST_TREES.shade.lift;
      const geo = CREST_SHADE.on ? makeCrestFoot(shade, seat) : makeTreeShade(this.plan, shade, seat);
      const mat = makeContactMaterial();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'fringe:crest-shade';
      mesh.renderOrder = -14;
      noPick(mesh);
      this.root.add(mesh);
      this._crestShade = { geo, mat };
      draws += 1;
      tris += geo.index.count / 3;
    }
    this._treeGeos = (this._treeGeos ?? []).concat(geos);
    this._hinterlandStats.crestTrees = list.length;
    this._hinterlandStats.crestDraws = draws;
    this._hinterlandStats.crestTris = tris;
  }

  /**
   * W83 (TRACK_GATES, item 1, part 3): the trunks a run-out must keep `GATE_KIT.runOutClear` off, known before the trees are drawn. For every planted tree (`planted`, `_plantedTrees`) and every
   * crest tree drawn (`crest`) the plan triangles of its form within 1.6 m of the root, at the instance's own scale, yaw and lean: the matrix is composed here as `_plantTrees` and `_plantCrestTrees` compose it
   * (the same hashes, the same species, variant and index), so the footprint is the tree's own and not its species' largest (the test reads the same triangles back from the built meshes).
   * `stopAlong(p, q, clear)` is null where the segment keeps `clear` m off every one, else how far along it from p it does (0 where p itself is within `clear`).
   */
  _gateTrunkTris(planted, crest) {
    const seed = this.plan.seed; const forms = new Map(); const tris = []; let crestTris = 0;
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const eul = new THREE.Euler(); const pv = new THREE.Vector3(); const sv = new THREE.Vector3(); const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3(); const bbox = new THREE.Box3();
    const formOf = (species, variant, tier) => {
      const key = `${tier}:${species.kind}:${variant}`; let f = forms.get(key);
      if (f) return f;
      const g = makeTreeGeometry(species.kind, variant, tier === 'far' ? { ...treeFormOptions(species), tier } : treeFormOptions(species));
      const pos = g.getAttribute('position'); const idx = g.index; bbox.setFromBufferAttribute(pos);
      const hu = Math.max(1e-3, bbox.max.y - bbox.min.y); const wu = Math.sqrt(Math.max(1e-3, bbox.max.x - bbox.min.x) * Math.max(1e-3, bbox.max.z - bbox.min.z));
      const squeeze = g.userData?.treeForm ? 1 : Math.max(0.28, Math.min(1.2, species.aspect / (wu / hu)));
      let baseY = Infinity; for (let j = 0; j < pos.count; j += 1) baseY = Math.min(baseY, pos.getY(j));
      const list = []; const nT = (idx ? idx.count : pos.count) / 3;
      for (let t = 0; t < nT; t += 1) {
        const i0 = idx ? idx.getX(t * 3) : t * 3; const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1; const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        list.push({ low: Math.min(pos.getY(i0), pos.getY(i1), pos.getY(i2)), v: [pos.getX(i0), pos.getY(i0), pos.getZ(i0), pos.getX(i1), pos.getY(i1), pos.getZ(i1), pos.getX(i2), pos.getY(i2), pos.getZ(i2)] });
      }
      list.sort((u, w) => u.low - w.low); g.dispose();
      f = { hu, squeeze, baseY, list }; forms.set(key, f); return f;
    };
    const add = (t, i, variant, species, tier) => {
      const f = formOf(species, variant, tier);
      const tone = idxUnit(70, Math.round(t.x), Math.round(t.z), seed + i * 151 + variant * 37);
      const squash = idxUnit(71, Math.round(t.z), Math.round(t.x), seed + i * 157 + variant * 41);
      eul.set((tone - 0.5) * 0.105, t.yaw, (squash - 0.5) * 0.105); q.setFromEuler(eul);
      const roll = idxUnit(73, Math.round(t.x), Math.round(t.z), seed);
      const k = (species.base * (species.lo + roll * (species.hi - species.lo)) * (t.size ?? 1)) / f.hu;
      const sq = tier === 'far' ? 1 : f.squeeze;
      pv.set(t.x, 0, t.z); sv.set(k * sq, k, k * sq); m.compose(pv, q, sv);
      const cut = f.baseY + 1.6 / k; const t0 = tris.length;
      for (const e of f.list) {
        if (e.low > cut) break;
        a.set(e.v[0], e.v[1], e.v[2]).applyMatrix4(m); b.set(e.v[3], e.v[4], e.v[5]).applyMatrix4(m); c.set(e.v[6], e.v[7], e.v[8]).applyMatrix4(m);
        tris.push({ x0: a.x, z0: a.z, x1: b.x, z1: b.z, x2: c.x, z2: c.z, bx0: Math.min(a.x, b.x, c.x), bx1: Math.max(a.x, b.x, c.x), bz0: Math.min(a.z, b.z, c.z), bz1: Math.max(a.z, b.z, c.z) });
      }
      if (tier === 'far') crestTris += tris.length - t0;
    };
    const speciesOf = (t) => (t.kind === 4 || t.role === 'windbreak' ? 4 : 0);
    for (const species of TREE_SPECIES) for (let variant = 0; variant < 3; variant += 1) {
      planted.filter((t, index) => speciesOf(t) === species.kind && index % 3 === variant).forEach((t, i) => add(t, i, variant, species, 'near'));
      crest.filter((t, index) => (t.kind === 4 ? 4 : 0) === species.kind && index % 3 === variant).forEach((t, i) => add(t, i, variant, species, 'far'));
    }
    const CELL = 4; const grid = new Map(); const key = (gx, gz) => (gx + 16384) * 32768 + (gz + 16384);
    for (const t of tris) for (let gx = Math.floor(t.bx0 / CELL); gx <= Math.floor(t.bx1 / CELL); gx += 1) for (let gz = Math.floor(t.bz0 / CELL); gz <= Math.floor(t.bz1 / CELL); gz += 1) { const kk = key(gx, gz); const l = grid.get(kk); if (l) l.push(t); else grid.set(kk, [t]); }
    const near = (x0, z0, x1, z1) => { const o = new Set(); for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx += 1) for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz += 1) for (const t of grid.get(key(gx, gz)) ?? []) o.add(t); return o; };
    const stopAlong = (p, qq, clear) => {
      const L = Math.hypot(qq[0] - p[0], qq[1] - p[1]); let stop = null;
      for (const T of near(Math.min(p[0], qq[0]) - clear, Math.min(p[1], qq[1]) - clear, Math.max(p[0], qq[0]) + clear, Math.max(p[1], qq[1]) + clear)) {
        if (segTriDist(p, qq, T) >= clear) continue;
        let u = 0;
        if (segTriDist(p, p, T) >= clear) { let lo = 0; let hi = L; for (let k = 0; k < 30; k += 1) { const mid = (lo + hi) * 0.5; if (segTriDist(p, [p[0] + ((qq[0] - p[0]) * mid) / L, p[1] + ((qq[1] - p[1]) * mid) / L], T) >= clear) lo = mid; else hi = mid; } u = lo; }
        stop = stop === null ? u : Math.min(stop, u);
      }
      return stop;
    };
    return { count: tris.length, crest: crestTris, stopAlong };
  }

  /** The trees `_plantTrees` plants: the singles thinned to 55% by a position hash and a 60 m cell's nine, every group and windbreak tree whole. */
  _plantedTrees(trees, belts) {
    // TASTE R1: a 20 m tree has ten times the crown area of the 6 m blobs it
    // replaces, so the same 2,760 sites would smother the paddocks. Windbreak rows
    // and copses keep every tree (they are the clusters the law asks for); the
    // singles and belt trees thin to 55% by a position hash, deterministic.
    const thin = (t) => t.role === 'windbreak' || t.role === 'copse' || t.group !== undefined
      || idxUnit(75, Math.round(t.x), Math.round(t.z), this.plan.seed) < 0.55;
    // Density evening: no 60 m cell holds more than nine non-windbreak trees, so
    // the west (which the planner fills first and densest) stops reading as a
    // different game from the south-east. Windbreak rows are exempt.
    const perCell = new Map();
    const all = (belts?.length ? trees.concat(belts) : trees).filter(thin).filter((t) => {
      if (t.role === 'windbreak' || t.group !== undefined) return true; // W20-B: a group is planted whole
      const key = Math.floor(t.x / 60) * 4096 + Math.floor(t.z / 60);
      const n = perCell.get(key) ?? 0;
      if (n >= 9) return false;
      perCell.set(key, n + 1);
      return true;
    });
    return all;
  }

  /**
   * The four tree archetypes carry both the ring planting and the shelterbelts,
   * so the belts cost no extra draw call. Each tree also gets a multiply contact
   * decal under the bole, which is a different cue from the cast shadow the
   * canopy throws (T10) and is not made redundant by it.
   */
  _plantTrees(trees, belts) {
    const all = this._plantedTrees(trees, belts);
    if (!all.length) return;
    const plan = this.plan;
    /**
     * ── TASTE R1, VEGETATION LAW (bible section 5) ──
     *
     * Five hand-tuned archetypes in eight variants each (forty meshes, 3,300
     * instances in lemon, olive and lime) become the two species the fringe is
     * allowed: eucalypt (leaf.grey, 16-24 m, crown 0.5 x height wide) and cypress
     * (leaf.green.a, 12-16 m, 0.25 x height wide, the windbreak row). Variants
     * differ by uniform scale 0.84-1.25, rotation, a lean of at most 6 degrees
     * and three crown-density geometries, never by hue (value only, within 8%).
     * Kinds 1-3 (round, umbrella, weeping) fold into eucalypt; kind 4 and every
     * windbreak tree is cypress.
     */
    const SPECIES = TREE_SPECIES;
    // The tint holds G/R of the instance colour near 1.5, because the bark is the
    // same instance colour times (1.85, 0.55, 1.05): below that the trunk goes
    // crimson (first pass: sepia-shelf band 3%), above it olive.
    const speciesOf = (t) => (t.kind === 4 || t.role === 'windbreak' ? 4 : 0);
    const geos = [];
    // `vertexColors` is ON now, and the old note here — "enabling it renders every
    // instance pure black" — was right about the mechanism and out of date about
    // the cause. three composes `vColor = color * instanceColor` and then
    // `diffuseColor *= vColor`; the black it saw was the DISABLED ATTRIBUTE's
    // (0,0,0,1) default, because the old `makeTreeGeometry()` emitted position and
    // normal only. It now emits a real `color` attribute carrying the canopy's
    // underside band and the bark multiplier, so the flag is what makes those two
    // reach the shader. Per-tree hue still comes from setColorAt/instanceColor and
    // the two multiply, which is the intended composition.
    // W11-A: both species are closed solids now (tree-forms.js), so the leaf atlas,
    // the alpha test and the double side that served the old cards are gone.
    const leaf = new THREE.MeshStandardMaterial({
      // White, deliberately. setColorAt() below writes a complete HSL green per
      // instance, and three.js MULTIPLIES material.color by instanceColor — a
      // tinted base here darkened every tree to roughly a third of its intended
      // value and skewed the hue. White lets the per-instance colour stand alone.
      color: '#ffffff',
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
    });
    applyFoliageDetail(leaf, { puff: true, cards: true, trunkBark: true }); // W19-A; W20-B: the outline breaks in the crown shader; W43: the bark mottle
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const eul = new THREE.Euler();
    const c = new THREE.Color();
    const bbox = new THREE.Box3();
    for (const species of SPECIES) for (let variant = 0; variant < 3; variant += 1) {
      const kind = species.kind;
      const list = all.filter((t, index) => speciesOf(t) === kind && index % 3 === variant);
      if (!list.length) continue;
      // Variant 0 / 1 / 2 are the sparse / normal / dense crowns: the foliage
      // builder's three most distinct seeded cluster layouts for the species.
      const geometry = makeTreeGeometry(kind, variant, treeFormOptions(species));
      geos.push(geometry);
      bbox.setFromBufferAttribute(geometry.getAttribute('position'));
      const heightUnit = Math.max(1e-3, bbox.max.y - bbox.min.y);
      const widthUnit = Math.sqrt(Math.max(1e-3, bbox.max.x - bbox.min.x) * Math.max(1e-3, bbox.max.z - bbox.min.z));
      // Crown width / height of the raw geometry against the species' own aspect.
      // W11-A: the forms carry their own real proportions, so no plan squeeze.
      const squeeze = geometry.userData?.treeForm
        ? 1
        : Math.max(0.28, Math.min(1.2, species.aspect / (widthUnit / heightUnit)));
      const leafLin = tokenLinear(species.colour);
      if (species.colour2) {
        const other = tokenLinear(species.colour2);
        for (let ch = 0; ch < 3; ch += 1) leafLin[ch] += (other[ch] - leafLin[ch]) * species.mix;
      }
      const mesh = new THREE.InstancedMesh(geometry, leaf, list.length);
      mesh.name = species.name + (variant ? `:variant-${variant}` : '');
      const vertices = mesh.geometry.getAttribute('position');
      let baseY = Infinity;
      for (let j = 0; j < vertices.count; j += 1) baseY = Math.min(baseY, vertices.getY(j));
      const roots = [];
      for (let j = 0; j < vertices.count; j += 1) {
        if (vertices.getY(j) <= baseY + 1e-5) roots.push(new THREE.Vector3().fromBufferAttribute(vertices, j));
      }
      const foot = new THREE.Vector3();
      for (let i = 0; i < list.length; i += 1) {
        const t = list[i];
        /**
         * ── FOUR PER-INSTANCE ROLLS, NOT ONE ──
         *
         * Every placement site in this file already carries `yaw`, `scale` and
         * `hue`, and against the old rotationally symmetric canopy two of those
         * three reached the silhouette as nothing at all: yaw could not move a
         * pixel of a sphere, and `hue` drives H, S and L off ONE roll, so two
         * neighbours with adjacent hue rolls came out adjacent in all three.
         *
         * `tone` and `squash` are drawn HERE, from the tree's own rounded
         * position through `idxUnit`, rather than added to seven placement sites.
         * That keeps them deterministic and reproducible (no clock, no
         * Math.random), decorrelates them from `hue` — different index salts —
         * and leaves every plan record and every test that reads one unchanged.
         */
        const tone = idxUnit(70, Math.round(t.x), Math.round(t.z), plan.seed + i * 151 + variant * 37);
        const squash = idxUnit(71, Math.round(t.z), Math.round(t.x), plan.seed + i * 157 + variant * 41);
        p.set(t.x, t.y, t.z);
        // TASTE R1: a lean of at most 6 degrees about the base (bible section 5).
        // Seat the actual transformed root vertices below, since the shared bole
        // no longer has a buried tail.
        // Two tilts of at most 3 degrees each compose to at most 6 degrees overall.
        eul.set((tone - 0.5) * 0.105, t.yaw, (squash - 0.5) * 0.105);
        q.setFromEuler(eul);
        // Uniform scale 0.84-1.25 of the species' centre height, so every tree
        // lands in its band (eucalypt 16-24 m, cypress 12-16 m). The crown is
        // squeezed to the species' aspect in plan only, never in height.
        const roll = idxUnit(73, Math.round(t.x), Math.round(t.z), plan.seed);
        const targetH = species.base * (species.lo + roll * (species.hi - species.lo)) * (t.size ?? 1); // W20-B: group members stand 0.55 to 1 of the tallest
        const k = targetH / heightUnit;
        s.set(k * squeeze, k, k * squeeze);
        // The contact decal under the bole: 0.6 x crown radius (bible section 3).
        t.patchRadius = Math.max(1.4, 0.6 * 0.5 * widthUnit * k * squeeze);
        t.patchDark = 0.84;
        m.compose(p, q, s);
        // Centre-only grounding left 2,412 root vertices above the built sheet,
        // up to 0.66 m. Lower the whole tree to its least supported root corner.
        let sink = 0;
        for (const root of roots) {
          foot.copy(root).applyMatrix4(m);
          const ground = this._sampleHinterlandY?.(foot.x, foot.z);
          if (Number.isFinite(ground)) sink = Math.max(sink, foot.y - ground + 0.02);
        }
        m.elements[13] -= sink;
        mesh.setMatrixAt(i, m);
        // The species token, in linear light, scaled by the same lighting gain the
        // ground is calibrated to. Variants differ in value only, within 8%.
        const vv = TREE_GAIN * (0.96 + tone * 0.08);
        c.setRGB(leafLin[0] * vv * species.tint[0], leafLin[1] * vv * species.tint[1], leafLin[2] * vv * species.tint[2]);
        mesh.setColorAt(i, c);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      noPickCasting(mesh);
      if (crownCardsActive()) mesh.customDepthMaterial = crownCardDepthMaterial(); // W21-A: the shadow reads the card's mask
      this.root.add(mesh);
    }
    this._treeMat = leaf;
    this._treeGeos = geos.filter(Boolean);
    if (this._hinterlandStats) {
      this._hinterlandStats.trees = trees.length;
      this._hinterlandStats.belts = belts?.length ?? 0;
      this._hinterlandStats.rimWoods = (belts ?? []).filter((b) => b.role === 'rim-wood').length;
    }

    if (plan.crust && plan.quality !== 'low') {
      // Contact shade as ONE merged mesh with every vertex sampled off the
      // ground, not as instanced flat discs. Instanced discs failed their own
      // rim test: 1350 of 7552 rim samples floated more than 0.25 m, up to
      // 2.14 m, because a rigid 7 m plate cannot lie on ground that moves 4 m
      // in 25. Sampling each rim vertex makes the patch follow the surface, and
      // the rim's multiplier of exactly 1 removes the hard edge that a uniform
      // disc would have put on gate 4.
      //
      // A COPSE GETS ONE PATCH, not three to five overlapping ones. Overlapping
      // multiply discs compound — four at 0.55 is 0.09, a black hole with a
      // scalloped edge — so the members are pulled out of the per-tree list and
      // the copse contributes a single wider, shallower patch instead.
      const patches = all.filter((t) => t.role !== 'copse');
      const members = all.filter((t) => t.role === 'copse');
      for (const cp of plan.hinterland?.copses ?? []) {
        // A copse whose members were all culled — by the occupancy grid, the
        // creek gate or a batter — must not leave its shadow standing on empty
        // grass. The patch follows the SURVIVORS, and takes its radius from them.
        let live = 0;
        let far = 0;
        for (const t of members) {
          const d = Math.hypot(t.x - cp.x, t.z - cp.z);
          if (d > cp.r + 1.5) continue;
          live += 1;
          far = Math.max(far, d + t.scale * 0.20);
        }
        if (!live) continue;
        patches.push({
          x: cp.x,
          z: cp.z,
          yaw: cp.yaw ?? 0,
          scale: far,
          patchRadius: Math.min(cp.r, Math.max(2.2, far + 0.8)),
          patchDark: 0.90,
          role: 'copse-patch',
        });
      }
      const geo = makeTreeShade(plan, patches, this._sampleHinterlandY);
      const mat = makeContactMaterial();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'fringe:hinterland-tree-shade';
      mesh.renderOrder = -14;
      noPick(mesh);
      this.root.add(mesh);
      this._treeShade = { geo, mat };
      if (this._hinterlandStats) {
        this._hinterlandStats.shade = patches.length;
        this._hinterlandStats.copsePatches = (plan.hinterland?.copses ?? []).length;
      }
    }
  }

  /**
   * Take the field overlay's multiplier from the live crust material rather
   * than re-deriving edge-massing's time-of-day tint here. Copying that formula
   * would be the hard-copy defect the bar names; reading the value it produced
   * cannot go stale.
   */
  _syncCrustTint() {
    if (!this._fieldsMat?.color) return;
    const crustMesh = this.scene?.getObjectByName?.('world:edge-massing:crust');
    const src = (Array.isArray(crustMesh?.material) ? crustMesh.material[0] : crustMesh?.material)?.color; // W42: two groups with COAST_CRUST
    if (!src) return false;
    this._fieldsMat.color.copy(src);
    // The crop rows, the track crown and the dune band read the same albedo as
    // the sheet; they have to ride the same time-of-day multiplier or the relief
    // separates from the ground it is relief ON as the profile moves.
    this._ringPaintMat?.color?.copy(src);
    // taste W31 (TRACK_FORM): the formed track has its own material and rides the same multiplier.
    if (!this._farmTrack?.mat?.userData?.trackBed) this._farmTrack?.mat?.color?.copy(src); // W84: a tint (TRACK_BED) is a factor, not a colour the multiplier rides
    return true;
  }

  update(dt, elapsed) {
    const freeze = this.reducedMotion;
    // The crust mounts after this layer, so its tint is not readable during
    // _build. Keep asking until it answers once, then stop.
    if (this._fieldsMat && !this._crustTintSynced) {
      this._crustTintSynced = this._syncCrustTint() === true;
    }
    updatePort(this._port, dt, elapsed, freeze);
    updateApostles(this._apostles, dt, elapsed, freeze);
    updateAirport(this._airport, dt, elapsed, freeze);
    updateStation(this._station, dt, elapsed, freeze);
    updateRailLink(this._rail, dt, elapsed, freeze);
    updateEvents(this._events, dt, elapsed, freeze);
  }

  updateViewDetail(camera, pixelWidth, pixelHeight) {
    const ships = this._port?.userData?.ships;
    if (!ships) return;
    for (const ship of ships) {
      if (ship.id === 'container') updateContainerFittings(ship.bob, camera, pixelWidth, pixelHeight);
    }
  }

  syncState(state) {
    const venues = state?.fringeVenues;
    this._airport?.userData.syncVenues?.(venues);
    if (this._rail) this._rail.visible = Boolean(venues?.railLink);
  }

  setProfile(profile, key = null) {
    if (!profile) return;
    if (key) this._key = key;
    if (GROUND_SURFACE.on > 0) {
      // taste W79 (GROUND_SURFACE, G2b): the key has moved with the hour, so the baked shade sides (hedge banks, tree, paddock and crest shade, windbreak and
      // fence strips) are rebuilt on the new side; a key within a quarter of a degree of the baked one leaves them be.
      liveSunXZ = sunXZFromScene(this.scene, this._key, profile) ?? liveSunXZ;
      const was = this._bakedSun;
      if (liveSunXZ && (!was || liveSunXZ[0] * was[0] + liveSunXZ[1] * was[1] < 0.99999)) {
        this._bakedSun = liveSunXZ;
        rebakeShades(this._shadeBakes);
      }
    }
    const haze = this._haze;
    if (profile.horizonColor && profile.skyColor) {
      haze.copy(profile.horizonColor).lerp(profile.skyColor, 0.55);
      haze.lerp(new THREE.Color('#e2eaf0'), 0.25);
    }
    if (this._farSeaMat?.color && profile.skyColor) {
      this._farSeaMat.color.copy(profile.skyColor).lerp(profile.horizonColor, 0.4);
    }
    if (this._riverMat?.color) {
      this._riverMat.color.copy(haze).offsetHSL(0.04, 0.12, -0.08);
      applyWorldRestyle(this._riverMat, 'river');
    }
    if (this._nearGeo) paintAnnulusColors(this._nearGeo, this.plan, haze, false);
    if (this._farGeo) paintAnnulusColors(this._farGeo, this.plan, haze, true);
    this._crustTintSynced = this._syncCrustTint() === true;
  }

  dispose() {
    if (shadeSink === this._shadeBakes) shadeSink = null;
    for (const e of this._shadeBakes.values()) e.geo.removeEventListener('dispose', e.drop);
    this._shadeBakes.clear();
    this.scene.remove(this.root);
    for (const mat of this._mats ?? []) mat?.dispose?.();
    for (const geo of this._geos ?? []) geo?.dispose?.();
    this._expansion?.box?.dispose?.();
    this._expansion?.mat?.dispose?.();
    for (const pair of [this._hedges, this._sheds, this._bales,
      this._dams, this._treeShade, this._paddockShade, this._scrub, this._windrows,
      this._fences, this._parcelFences, this._walls, this._reeds, this._creek, this._windbreakStrips,
      this._hedgeContact, this._windbreakContact, this._assetPointContact, this._crestShade,
      this._assetRunContact, this._damWater, this._stock,
      ...(this._stockExtra ?? []), ...(this._shedExtra ?? []), this._wallsTumbled,
      this._cropRows, this._farmTrack, this._duneGrass, this._rimBrow, this._trackGateMesh]) {
      pair?.geo?.dispose?.();
      pair?.mat?.dispose?.();
    }
    // One material carries the crop rows, the track crown and the dune band, so
    // it is disposed once here rather than through the pair loop above.
    this._ringPaintMat?.dispose?.();
    this._ringAlbedo?.dispose?.();
    this._ringHeight?.dispose?.();
    this._sheetShore?.dispose?.();
    for (const geo of this._treeGeos ?? []) geo?.dispose?.();
    this._fieldsGeo?.dispose?.();
    this._coastRim?.geometry?.dispose?.();
    this._coastRim?.material?.dispose?.();
    this._fieldsMat?.dispose?.();
    this._treeMat?.dispose?.();
    this.root.traverse((node) => {
      node.geometry?.dispose?.();
      if (node.material && !this._mats?.includes(node.material)) {
        node.material.dispose?.();
      }
    });
    this.pickTargets = [];
    this.root = null;
  }
}

export default FringeLayer;
