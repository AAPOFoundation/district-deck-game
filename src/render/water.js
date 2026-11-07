import { mountWaterPatches } from './water-geometry-patches.js';
import { isLodEnabled } from './lod.js';
// District Deck V5.3 — one ocean (Lane M) + W2-NATURE beach shelf / piers.
// Rollback point: render/water/_stash/W-R49/
//
// The water body is OuterOcean (polar sheet, dual-shore Gerstner, depth-baked
// colour, breaker foam). This file still owns sand, piers, beach life, tap
// interact, and hides the board `water:*` plus fringe water-only sheets.
// Presentation only: no sim state, no network. Animation is driven by the same
// `elapsed` the capture harness steps; reduced motion freezes at OCEAN.freezeTime.

import * as THREE from 'three';
import { repairWaterDecalNormals } from './water/decal-normals.js';
import { PaintedContactRings } from './water/painted-rings.js';
import { MaterialLibrary } from './materials.js';
import { restyleColour } from './style/restyle.js';
import { hashSeed, makeRng } from './textures.js';
import { SHORE } from './shore.js';
import { WATER_LAW } from './water/law.js';
import { TASTE_RAIN } from './taste-tokens.js';
import {
  WATER_EXTENT,
  WATER_Y,
  WATER_FLOOR_Y,
} from './water/contract.js';
import { buildBeachGeometry, makeSandMaterial, beachSectionY } from './water/sand.js';
import { COAST_SPINE, getCoastSpine, coastSpineUniforms, buildCoastSpineDebug, setActiveCoastSpine, activeCoastSpine } from './coast-spine.js';
import { LAND_EDGE, buildLandEdgeDebug } from './land-edge.js';
import { spineTapFront } from './water/swash-spine.js'; // wave 78 (2b-3): the taps' front on the spine path
import {
  CoastSpray,
  TAP_KIND,
  coastLineAt,
  createCoastField,
  createInteractUniforms,
  impulseCoast,
  resetCoastField,
  stepCoast,
  worldToShore,
  writeInteractUniforms,
} from './water/interact.js';
import {
  OCEAN,
  OCEAN_RAMP,
  REFLECT,
  WET_EDGE,
  HarbourReflector,
  OuterOcean,
  isHiddenFringeWaterName,
  setOceanWakeHulls,
  oceanSurfaceYAt,
} from './outer-ocean.js';
import { isHiddenFringeTerrainName, planEdgeMassing } from './edge-massing.js';
import {
  clipCount, FIGURE_CONTACT, pickFigureKit,
} from './figures.js';
import { createI4FigureGroup } from './fringe/port.js';
import {
  buildKiosk, buildFigure, buildVolleyball, buildPier, buildShrubLobe,
  FIGURE_SKINS, FIGURE_HAIRS, FIGURE_SHORTS,
} from './coast-models.js';

/** Same hex as `SHORE.deepWater` / crust `EDGE_SEAM.deepWater`. No second navy. */
export const DEEP_WATER_HEX = SHORE.deepWater;

const SAND_Y = SHORE.sandY ?? 0.06;
// V5.1 Lane J: crust wet-sand (edge-massing) starts at board ground-contact
// top 0.02 (`BOARD_EDGE.groundTopY` / `SHORE.boardGroundTopY`) and falls to
// WATER_Y over shoreWidth. This shelf stays on SHORE.sandY so stairs, people,
// and fringe keep their authored landing.
const WET_SAND_Y = SAND_Y - 0.015;
/**
 * Shader foam only (no hard white geometry planes on dry sand).
 * All break/foam envelopes use frontDist = shoreDist − waterFace (0 at beach face).
 */
const FOAM_STRIP_WIDTH = SHORE.foamStripW;
const FOAM_STRIP_Y = 0.062;
const FOAM_TRAIN_WIDTH = SHORE.foamTrainW;
const FOAM_TRAIN_OFFSET = SHORE.foamTrainOffset;
const FOAM_TRAIN_Y = 0.05;
/** Beach / wall offsets — single authority in shore.js. */
const SAND_SEAWARD = SHORE.sandSeaward;
const WET_DEPTH = SHORE.wetDepth;
/** Shore-distance of water mesh inland face (from wall). Foam/shoaling zero here. */
const WATER_FROM_WALL = SHORE.waterFromWall;
/** Pier plank runs seaward from the wall (original placement — over bay). */
const PIER_COUNT = SHORE.pierCount;
const PIER_LENGTH = SHORE.pierLength;
const PIER_WIDTH = SHORE.pierWidth;
// Socket pier deck into the wall-top esplanade instead of stepping down to a
// disconnected low slab.
const PIER_DECK_Y = SHORE.wallH - 0.08;
/** Deck board thickness — thin timber planks, not a slab. */
const PIER_PLANK_THICK = 0.11;
/** PM11: visible pier fascia below the walking surface. */
export const PIER_FASCIA_H = 0.28;

/** PM11 contact law shared by every beach-life prop in this module. */
export const BEACH_PROP_CONTACT = Object.freeze({
  alpha: 0.35,
  footprintScale: 1.3,
  sinkMin: 0.02,
  sinkMax: 0.04,
  floatTolerance: 0.03,
});

/** Re-export so tests can pin the held surf plate from water.js. */
export const HIDDEN_FRINGE_SURF = OCEAN.hiddenSurfMesh;

function shoreFrame(edge, extent) {
  // Seawall just OUTSIDE board edge (SHORE.wallOffset). Beach + wet + water seaward only.
  const wallOffset = SHORE.wallOffset;
  const sandDepth = Math.max(SAND_SEAWARD, 8);
  // Dry beach begins just seaward of wall/boardwalk stack.
  const sandCentreOffset = wallOffset + SHORE.wallDeep * 0.35 + sandDepth * 0.5;
  const wetCentreOffset = wallOffset + SHORE.wallDeep * 0.35 + sandDepth + WET_DEPTH * 0.45;
  // Foam at dry→wet transition (legacy frame fields — break is shader-only now).
  const foamCentreOffset = wallOffset + SHORE.wallDeep * 0.35 + sandDepth + FOAM_STRIP_WIDTH * 0.35;
  const trainCentreOffset = wallOffset + SHORE.wallDeep * 0.35 + sandDepth + FOAM_TRAIN_OFFSET;
  // Water inland face overlaps wet sand so the break/swash reads on the beach join.
  // WATER_FROM_WALL is the foam zero; mesh pads inland enough for meander tongues (~±15 m).
  const waterInlandPad = 22;
  const waterStart = wallOffset + WATER_FROM_WALL - waterInlandPad;
  if (edge === 'north') {
    return {
      origin: new THREE.Vector3(extent.x / 2, WATER_Y, -wallOffset),
      normal: new THREE.Vector3(0, 0, -1),
      along: 'x',
      length: extent.x,
      waterCentre: new THREE.Vector3(extent.x / 2, WATER_Y, -(waterStart + WATER_EXTENT / 2)),
      sandCentre: new THREE.Vector3(extent.x / 2, SAND_Y, -sandCentreOffset),
      sandSize: [extent.x + 10, sandDepth],
      wetCentre: new THREE.Vector3(extent.x / 2, WET_SAND_Y, -wetCentreOffset),
      wetSize: [extent.x + 10, WET_DEPTH],
      foamCentre: new THREE.Vector3(extent.x / 2, FOAM_STRIP_Y, -foamCentreOffset),
      foamSize: [extent.x + 8, FOAM_STRIP_WIDTH],
      trainCentre: new THREE.Vector3(extent.x / 2, FOAM_TRAIN_Y, -trainCentreOffset),
      trainSize: [extent.x + 6, FOAM_TRAIN_WIDTH],
      wallOffset,
    };
  }
  if (edge === 'south') {
    return {
      origin: new THREE.Vector3(extent.x / 2, WATER_Y, extent.z + wallOffset),
      normal: new THREE.Vector3(0, 0, 1),
      along: 'x',
      length: extent.x,
      waterCentre: new THREE.Vector3(extent.x / 2, WATER_Y, extent.z + waterStart + WATER_EXTENT / 2),
      sandCentre: new THREE.Vector3(extent.x / 2, SAND_Y, extent.z + sandCentreOffset),
      sandSize: [extent.x + 10, sandDepth],
      wetCentre: new THREE.Vector3(extent.x / 2, WET_SAND_Y, extent.z + wetCentreOffset),
      wetSize: [extent.x + 10, WET_DEPTH],
      foamCentre: new THREE.Vector3(extent.x / 2, FOAM_STRIP_Y, extent.z + foamCentreOffset),
      foamSize: [extent.x + 8, FOAM_STRIP_WIDTH],
      trainCentre: new THREE.Vector3(extent.x / 2, FOAM_TRAIN_Y, extent.z + trainCentreOffset),
      trainSize: [extent.x + 6, FOAM_TRAIN_WIDTH],
      wallOffset,
    };
  }
  if (edge === 'west') {
    return {
      origin: new THREE.Vector3(-wallOffset, WATER_Y, extent.z / 2),
      normal: new THREE.Vector3(-1, 0, 0),
      along: 'z',
      length: extent.z,
      waterCentre: new THREE.Vector3(-(waterStart + WATER_EXTENT / 2), WATER_Y, extent.z / 2),
      sandCentre: new THREE.Vector3(-sandCentreOffset, SAND_Y, extent.z / 2),
      sandSize: [sandDepth, extent.z + 10],
      wetCentre: new THREE.Vector3(-wetCentreOffset, WET_SAND_Y, extent.z / 2),
      wetSize: [WET_DEPTH, extent.z + 10],
      foamCentre: new THREE.Vector3(-foamCentreOffset, FOAM_STRIP_Y, extent.z / 2),
      foamSize: [FOAM_STRIP_WIDTH, extent.z + 8],
      trainCentre: new THREE.Vector3(-trainCentreOffset, FOAM_TRAIN_Y, extent.z / 2),
      trainSize: [FOAM_TRAIN_WIDTH, extent.z + 6],
      wallOffset,
    };
  }
  // east — beach/water fully past x = extent.x
  return {
    origin: new THREE.Vector3(extent.x + wallOffset, WATER_Y, extent.z / 2),
    normal: new THREE.Vector3(1, 0, 0),
    along: 'z',
    length: extent.z,
    waterCentre: new THREE.Vector3(extent.x + waterStart + WATER_EXTENT / 2, WATER_Y, extent.z / 2),
    sandCentre: new THREE.Vector3(extent.x + sandCentreOffset, SAND_Y, extent.z / 2),
    sandSize: [sandDepth, extent.z + 10],
    wetCentre: new THREE.Vector3(extent.x + wetCentreOffset, WET_SAND_Y, extent.z / 2),
    wetSize: [WET_DEPTH, extent.z + 10],
    foamCentre: new THREE.Vector3(extent.x + foamCentreOffset, FOAM_STRIP_Y, extent.z / 2),
    foamSize: [FOAM_STRIP_WIDTH, extent.z + 8],
    trainCentre: new THREE.Vector3(extent.x + trainCentreOffset, FOAM_TRAIN_Y, extent.z / 2),
    trainSize: [FOAM_TRAIN_WIDTH, extent.z + 6],
    wallOffset,
  };
}

/**
 * Water edge presentation for one city. Hides any flat board water mesh it finds
 * under `boardRoot`, then mounts the unified ocean sheet + sand shelf.
 */
// taste-r1 (W15 fix): breakwater toe lace. Width factor on the 2 to 4 m shore-foam band (0.6 gives 1.2 to 2.4 m, of which the
// outer rows fade, so about 0.5 to 1 m shows), and the foam token's gain for the lace.
const PORT_LACE_WIDTH = 0.6;
const PORT_LACE_TONE = 0.74;

export class WaterSurface {
  /**
   * @param {THREE.Scene|THREE.Object3D} parent
   * @param {{ waterEdge?: string, extent: {x:number,z:number} }} city
   * @param {{
   *   quality?: string,
   *   reducedMotion?: boolean,
   *   envMap?: THREE.Texture|null,
   *   boardRoot?: THREE.Object3D|null,
   *   materials?: { get?: Function }|null,
   * }} [options]
   */
  constructor(parent, city, {
    quality = 'high',
    reducedMotion = false,
    envMap = null,
    boardRoot = null,
    materials = null,
  } = {}) {
    this.parent = parent;
    this.city = city;
    this.quality = quality;
    this.reducedMotion = reducedMotion;
    this.root = new THREE.Group();
    this.root.name = 'nature:water';
    this._elapsed = 0;
    this._hidden = [];
    this._disposables = [];
    /** Library materials must not be disposed here. */
    this._ownedMaterials = [];
    this._field = createCoastField();
    this._field.reducedMotion = reducedMotion;
    this._interactUniforms = createInteractUniforms();
    this._spray = null;
    this._tmpWorld = new THREE.Vector3();
    this._ocean = null;
    this._hidFringe = false;
    this._apostlesContact = null;
    this._rockFoam = null;
    this._rockFoamTime = null;
    // P16-W6 prototype A. Built empty; the reflection set is collected on the
    // mass-field walk once `fringe:port` has mounted. `enabled` is the flag
    // the brief asks for: default ON for the port basin (the shader's own
    // shelter gate decides where "the basin" is), and `setPlanarReflection`
    // takes it back off for the A/B.
    this._reflector = new HarbourReflector({ planeY: WATER_Y });
    this._reflector.enabled = true;

    this._hideBoardWater(boardRoot);

    const edge = city.waterEdge;
    const frame = edge ? shoreFrame(edge, city.extent) : null;
    this._frame = frame;
    // taste-r1 (W74, COAST_SPINE, default off): with the switch on the water surface builds the coast spine's field and holds it here; nothing reads it yet.
    this.coastSpine = null;
    this._coastSpineDebug = null;
    this._landEdgeDebug = null;
    if (COAST_SPINE.on) {
      try {
        this.coastSpine = getCoastSpine(city);
        // The GPU textures exist only with the switch on (still read by nothing but the debug plane below).
        if (this.coastSpine) coastSpineUniforms(this.coastSpine);
        // Wave 75 (phase 2a): the CPU readers of the shelf (beachSection, hence the bed bake) read d from this field.
        setActiveCoastSpine(this.coastSpine);
        if (this.coastSpine && COAST_SPINE.debug) {
          this._coastSpineDebug = buildCoastSpineDebug(this.coastSpine, { seaY: WATER_Y, mode: COAST_SPINE.debug });
          this.root.add(this._coastSpineDebug.group);
          this._disposables.push(this._coastSpineDebug);
        }
        // taste-r1 (W78, LAND_EDGE, default off, needs the spine): the land edge's debug overlay only; no reader.
        if (this.coastSpine && LAND_EDGE.debug) {
          this._landEdgeDebug = buildLandEdgeDebug(city);
          this.root.add(this._landEdgeDebug.group);
          this._disposables.push(this._landEdgeDebug);
        }
      } catch (err) { console.warn('coast spine not built:', err?.message ?? err); }
    }

    this._ocean = new OuterOcean({
      parent: this.root,
      city,
      quality,
      reducedMotion,
      envMap,
      interactUniforms: this._interactUniforms,
      frame,
    });
    this.mesh = this._ocean.mesh;
    this.wetEdge = this._ocean.wetEdgeMesh;
    this.material = this._ocean.material;
    this.uniforms = this._ocean.uniforms;
    // P16-W5: `setEnvMap` is called by scene.setTimeOfDay BEFORE this object
    // exists, so it stored `_envTexture` and returned on a null uniform block;
    // nothing ever pushed the equirect afterwards and `uHasEnv` stayed false
    // for the life of the page. Push whatever we were handed, now that the
    // uniforms exist.
    this.setEnvMap(envMap ?? this._envTexture ?? null);

    if (edge && frame) {
      this._buildSandShelf(frame, edge, materials);
      this._buildPiers(frame, edge, materials);
      this._buildBeachLife(frame, edge, materials);
      this._spray = new CoastSpray(this.root);
      this._spray.reducedMotion = reducedMotion;
    }

    parent.add(this.root);
  }

  _resolveSandMaterial(materials, variant, color, roughness, metalness = 0) {
    if (materials?.get) {
      return {
        material: materials.get('sand', { variant, color, roughness, metalness }),
        owned: false,
      };
    }
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: roughness ?? 0.94,
      metalness,
    });
    this._ownedMaterials.push(material);
    return { material, owned: true };
  }

  /**
   * Beach shelf. Geometry + material both live in `water/sand.js` (SAND seat).
   * The shelf runs from the wall toe to just past the waterline and carries its
   * own relief — berm, cusps, ripple — so it is no longer a flat tray.
   */
  _buildSandShelf(frame, edge) {
    // Shelf spans from just seaward of the wall to a little past the waterline.
    const inland = Math.max(0.5, SHORE.wallDeep * 0.25 - 3);
    const seaward = SHORE.waterFromWall + 14;

    const shelfGeom = buildBeachGeometry({
      alongLength: frame.length + (SHORE.cornerWrapR ?? 88),
      inland,
      seaward,
      quality: this.quality,
    });
    this._disposables.push(shelfGeom);

    const { material: shelfMat, uniforms: sandUniforms } = makeSandMaterial({
      shoreOrigin: frame.origin,
      shoreNormal: frame.normal,
      quality: this.quality,
      alongHalf: frame.length * 0.5,
      register: this._interactUniforms,
      coastSpine: this.coastSpine,
    });
    if (sandUniforms?.uSwashReach) {
      // R13b: reach is run-up metres, not wetDarkenExtra. Adding the extra
      // (8) made a 17.5 m tongue that stacked with every other pale strip.
      const base = this.quality === 'low' ? 7.0 : 9.5;
      sandUniforms.uSwashReach.value = base;
    }
    if (sandUniforms?.uCuspAmp) {
      sandUniforms.uCuspAmp.value = 0.28;
    }
    // R13b post-mortem: NO hue overrides here. sand.js builds its palette
    // from SAND_HUES through its own legacy double-converting srgb() and
    // the whole shader (grain gains, luma bands in its comments) is
    // calibrated to those values. Overriding with single-converted
    // THREE.Color(hex) — the same hexes, ~a gamma brighter — washed the
    // entire beach to grey-cream (r13b-swash/widebay frames). The hues
    // live in ONE place: SAND_HUES in water/sand.js.
    if (this.reducedMotion && sandUniforms?.uTime) {
      sandUniforms.uTime.value = OCEAN.freezeTime;
    }
    this._ownedMaterials.push(shelfMat);
    this._sandUniforms = sandUniforms;
    this._fringeSandTimeUniforms = [sandUniforms.uTime];

    this.sand = new THREE.Mesh(shelfGeom, shelfMat);
    this.sand.name = `nature:beach-shelf:${edge}`;
    this.sand.position.set(frame.origin.x, SAND_Y, frame.origin.z);
    this.sand.rotation.y = Math.atan2(frame.normal.x, frame.normal.z);
    this.sand.receiveShadow = true;
    this.sand.castShadow = false;
    this.sand.renderOrder = 3;
    this.sand.frustumCulled = false;
    if (this.quality === 'high' && !isLodEnabled()) this._disposables.push(...mountWaterPatches(this.sand, { cellSize: 64 }));
    this.root.add(this.sand);

    // Legacy handles kept so dispose/update paths stay stable.
    this.shallowPlate = null;
    this.heroFoamBand = null;
    this.dampSand = null;
    this.wetSand = null;
  }
  /**
   * Timber-decked piers from the seawall into the bay.
   * Thin cross-planks with kerfs, dark bearers/piles, timber edge rails —
   * reads as a timber jetty over the waves, not a concrete slab.
   */
  _buildPiers(frame, edge, materials) {
    const alongX = frame.along === 'x';
    const count = Math.min(PIER_COUNT, 3);
    const margin = Math.max(28, frame.length * 0.12);
    const usable = Math.max(frame.length - margin * 2, 40);
    const step = count <= 1 ? 0 : usable / (count - 1);

    const get = (family, opts) => (materials?.get
      ? materials.get(family, opts)
      : null);
    // Warm deck boards + slightly darker alternate grain for multi-plank value.
    // P17-W2B: the deck owns the V40 median; rail and bearers retain their darker roles.
    const deckColour = restyleColour(new THREE.Color('#b08955'),
      new THREE.Color('#b08955').multiplyScalar(1.903765), { id: 'coast:esplanade-pier.deck' });
    const timberDeck = get('timber', {
      variant: 'nature-pier-deck-r12', color: deckColour, roughness: 0.82, metalness: 0.0,
    }) ?? new THREE.MeshStandardMaterial({ color: deckColour, roughness: 0.82, metalness: 0 });
    const timberDeckAlt = get('timber', {
      variant: 'nature-pier-deck-alt', color: '#967248', roughness: 0.86, metalness: 0.0,
    }) ?? new THREE.MeshStandardMaterial({ color: '#967248', roughness: 0.86, metalness: 0 });
    const timberStructure = get('timber', {
      variant: 'nature-pier-structure-r12', color: '#5c4228', roughness: 0.9, metalness: 0.0,
    }) ?? new THREE.MeshStandardMaterial({ color: '#5c4228', roughness: 0.9, metalness: 0 });
    const timberRail = get('timber', {
      variant: 'nature-pier-rail-r12', color: '#6e5030', roughness: 0.78, metalness: 0.0,
    }) ?? new THREE.MeshStandardMaterial({ color: '#6e5030', roughness: 0.78, metalness: 0 });
    // Small wall socket only — walking surface is timber, not concrete deck.
    const concrete = get('concrete', {
      variant: 'pier-abutment-r12', color: '#777d80', roughness: 0.86,
    }) ?? timberStructure;
    const sandDrift = get('sand', {
      variant: 'pier-drift-r12', color: '#c9b489', roughness: 0.98, metalness: 0,
    }) ?? new THREE.MeshStandardMaterial({ color: '#c9b489', roughness: 0.98, metalness: 0 });
    if (!materials?.get) {
      this._ownedMaterials.push(timberDeck, timberDeckAlt, timberStructure, timberRail, sandDrift);
    }

    // W12-G: the pier is modelled in coast-models.js in a local frame (x seaward from the first plank, y world metres)
    // and carried by one root per pier; the old unit-box instances are gone. Vertex colour carries board tone and occlusion.
    for (const mat of [timberDeck, timberStructure, timberRail, concrete, sandDrift]) {
      mat.vertexColors = true;
      mat.needsUpdate = true;
    }
    const model = buildPier({
      length: PIER_LENGTH, width: PIER_WIDTH, deckTop: PIER_DECK_Y, plankT: PIER_PLANK_THICK, floorY: WATER_FLOOR_Y,
    });
    const pierGroup = new THREE.Group();
    pierGroup.name = `nature:piers:${edge}`;
    const identity = new THREE.Matrix4();
    const oneInstance = (parent, geometry, material, name, castShadow = true) => {
      const mesh = new THREE.InstancedMesh(geometry, material, 1);
      mesh.setMatrixAt(0, identity);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.name = `${name}:${edge}`;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this._disposables.push(geometry);
      parent.add(mesh);
      return mesh;
    };
    const pierYaw = Math.atan2(-frame.normal.z, frame.normal.x);
    const seaward0 = SHORE.wallDeep * 0.42;
    let pileTotal = 0;
    for (let i = 0; i < count; i += 1) {
      // A lone civic jetty belongs on the bay axis. Reusing `margin + step * 0`
      // would strand it at the old flank-pier socket (12% along the edge).
      const along = count === 1 ? frame.length * 0.5 : margin + step * i;
      const seaward1 = seaward0 + PIER_LENGTH;
      const seawardMid = (seaward0 + seaward1) * 0.5;
      const worldAt = (alongOff, sea) => {
        if (alongX) {
          return {
            x: along + alongOff,
            z: frame.origin.z + frame.normal.z * sea,
          };
        }
        return {
          x: frame.origin.x + frame.normal.x * sea,
          z: along + alongOff,
        };
      };
      const start = worldAt(0, seaward0);
      const root = new THREE.Group();
      root.name = `nature:pier-root:${edge}:${i}`;
      root.position.set(start.x, 0, start.z);
      root.rotation.y = pierYaw;
      pierGroup.add(root);

      // Real mesh at the deck centre so HUD-off capture can lookAt the jetty
      // instead of an InstancedMesh unit-box at the origin.
      const deckMid = worldAt(0, seawardMid);
      const deckGeom = new THREE.BoxGeometry(
        alongX ? PIER_WIDTH * 0.96 : 2.4,
        0.22,
        alongX ? 2.4 : PIER_WIDTH * 0.96,
      );
      const deckMarker = new THREE.Mesh(deckGeom, timberDeck);
      deckMarker.name = `nature:piers:${edge}:deck`;
      deckMarker.position.set(deckMid.x, PIER_DECK_Y - 0.04, deckMid.z);
      // Capture target only. Drawing this 0.22 m box through the plank tops
      // created the stacked slab in corner-close; its transform survives.
      deckMarker.visible = false;
      deckMarker.castShadow = false;
      deckMarker.receiveShadow = false;
      deckMarker.userData.ownsGeometry = true;
      pierGroup.add(deckMarker);
      this._disposables.push(deckGeom);

      oneInstance(root, model.deck, timberDeck, 'nature:pier-planks-a');
      oneInstance(root, model.structure, timberStructure, 'nature:pier-bracing');
      oneInstance(root, model.bearers, timberStructure, 'nature:pier-bearers');
      oneInstance(root, model.joists, timberStructure, 'nature:pier-soffit-joists');
      oneInstance(root, model.fascia, timberRail, 'nature:pier-fascia');
      oneInstance(root, model.shadow, timberStructure, 'nature:pier-shadow-line', false);
      oneInstance(root, model.rails, timberRail, 'nature:pier-rails');
      oneInstance(root, model.concrete, concrete, 'nature:pier-sand-coping');
      oneInstance(root, model.sand, sandDrift, 'nature:pier-sand-drift');
      // One instance per pile, so the painted water-contact census still finds every pile foot.
      const piles = new THREE.InstancedMesh(model.pile, timberStructure, model.pilePositions.length);
      const pm = new THREE.Matrix4();
      model.pilePositions.forEach(([px, pz], pi) => {
        pm.makeTranslation(px, model.pileBase, pz);
        piles.setMatrixAt(pi, pm);
      });
      piles.instanceMatrix.needsUpdate = true;
      piles.name = `nature:pier-piles:${edge}`;
      piles.castShadow = true;
      piles.receiveShadow = true;
      piles.frustumCulled = false;
      this._disposables.push(model.pile);
      root.add(piles);
      pileTotal += model.pilePositions.length;
    }
    pierGroup.userData.pm11Deck = {
      fasciaDepth: PIER_FASCIA_H,
      shadowLineDepth: 0.08,
      joists: 7,
      coping: 1,
      sandDriftWidth: 0.50,
      hiddenCaptureMarkers: count,
    };
    pierGroup.userData.w12g = { triangles: model.triangles, pileInstances: pileTotal, pileTriangles: model.pileTriangles };
    this.root.add(pierGroup);
    this.piers = pierGroup;
  }

  /**
   * Beach amenity kit: ice-cream truck, umbrellas, lifeguard tower, planters,
   * bus stop, outdoor shower. All on dry sand seaward of the wall (presentation only).
   */
  _buildBeachLife(frame, edge, materials) {
    const alongX = frame.along === 'x';
    if (!this.beachUmbrellaRecords) this.beachUmbrellaRecords = [];
    const life = new THREE.Group();
    life.name = `nature:beach-life:${edge}`;
    const get = (family, opts) => (materials?.get
      ? materials.get(family, opts)
      : new THREE.MeshStandardMaterial({ color: opts?.color ?? '#888', roughness: 0.8 }));
    const timber = get('timber', { variant: 'beach-timber', color: '#81766a' });
    const cream = get('painted_metal', { variant: 'beach-cream', color: '#c6c0b5', roughness: 0.84 });
    const stripe = get('painted_metal', { variant: 'beach-stripe', color: '#887570', roughness: 0.84 });
    const yellow = get('painted_metal', { variant: 'beach-yellow', color: '#a49a81', roughness: 0.84 });
    const white = get('painted_metal', { variant: 'beach-white', color: '#d4d1c8', roughness: 0.84 });
    const green = get('painted_metal', { variant: 'beach-green', color: '#727b70', roughness: 0.85 });
    const metal = get('painted_metal', { variant: 'beach-metal', color: '#4a4a48', roughness: 0.45, metalness: 0.5 });

    // Local frame: +X along beach, +Z seaward. Rotate each group to edge.
    // Esplanade deck top (must match board.js) — anything on the boardwalk sits here,
    // not at y=0 (that reads as a brown block under the elevated planks).
    const DECK_TOP_Y = SHORE.wallH - 0.08;
    // Seaward metres from wall face ≈ boardwalk centre / seaward edge (SHORE contract).
    const BOARDWALK_CENTRE_SEA = SHORE.wallDeep * 0.48 + SHORE.boardwalkW * 0.42;
    const BOARDWALK_SEAWARD_EDGE = SHORE.wallDeep * 0.48 + SHORE.boardwalkW * 0.92;
    const yaw = alongX
      ? (frame.normal.z > 0 ? 0 : Math.PI)
      : (frame.normal.x > 0 ? -Math.PI / 2 : Math.PI / 2);
    // ── P16-W5: THE BEACH KIT'S GROUND DATUM. ──
    //
    // Every beach-life group was planted at world y = 0 and every prop inside
    // it was then authored against a FLAT local sand line of `SAND_Y` (0.06).
    // That was right when the shelf was flat. It is not: PM1's section draws
    // the dry backshore anywhere between 0.05 and 0.29 m, so at the corner the
    // whole kit — towels, contact patches, umbrella feet, chair legs — was
    // authored up to 0.23 m INTO the sand. That is the mechanical reason the
    // critic reads "objects sit on a flat painted plane with no contact
    // shadow": the contact was under the ground. PM1 found the identical fault
    // on the port's own umbrellas (`cornerSandY` answered 0.16 m low).
    //
    // The group now carries the section's DEVIATION from that authored datum,
    // `beachSectionY(x,z) − SAND_Y`, rather than the section itself, so every
    // one of the ~200 offsets already authored against `GND` keeps the height
    // over sand it was drawn with and only the drift is removed. `GND` is that
    // local sand line; new members are authored against it by name.
    const GND = SAND_Y;
    const placeGroup = (alongT, seaward, y = null) => {
      const along = frame.length * alongT;
      const g = new THREE.Group();
      const wx = alongX ? along : frame.origin.x + frame.normal.x * seaward;
      const wz = alongX ? frame.origin.z + frame.normal.z * seaward : along;
      g.position.set(wx, y == null ? beachSectionY(wx, wz) - GND : y, wz);
      g.rotation.y = yaw;
      life.add(g);
      return g;
    };
    /**
     * How far the drawn section at a LOCAL offset inside a station group sits
     * below (or above) the datum the group itself was seated on. A towel 2.2 m
     * out from its umbrella is on different sand from the umbrella; sampling
     * the station centre alone left the far towels 6 cm in the air on the
     * steeper bearings.
     */
    const localSectionDrop = (g, ox, oz) => {
      const c = Math.cos(g.rotation.y);
      const sn = Math.sin(g.rotation.y);
      const wx = g.position.x + ox * c + oz * sn;
      const wz = g.position.z - ox * sn + oz * c;
      return beachSectionY(wx, wz) - GND - g.position.y;
    };
    const box = (parent, w, h, d, x, y, z, mat, name) => {
      const geom = new THREE.BoxGeometry(w, h, d);
      geom.translate(x, y + h / 2, z);
      MaterialLibrary.ensureUv2(geom);
      const m = new THREE.Mesh(geom, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = name;
      parent.add(m);
      this._disposables.push(geom);
      return m;
    };
    /**
     * A box rotated about X before it is placed, so a raking member (a stair
     * stringer, a brace) can be a real member instead of a vertical post
     * standing in for one. `x, y, z` is the box CENTRE, not its base.
     */
    const boxRotX = (parent, w, h, d, x, y, z, rotX, mat, name) => {
      const geom = new THREE.BoxGeometry(w, h, d);
      geom.rotateX(rotX);
      geom.translate(x, y, z);
      MaterialLibrary.ensureUv2(geom);
      const m = new THREE.Mesh(geom, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = name;
      parent.add(m);
      this._disposables.push(geom);
      return m;
    };
    // rotAxis: null = upright (Y), 'x' | 'z' = lay cylinder so its axis points that way.
    const cyl = (parent, rTop, rBot, h, x, y, z, mat, name, segs = 10, rotAxis = null) => {
      const geom = new THREE.CylinderGeometry(rTop, rBot, h, segs);
      if (rotAxis === 'x' || rotAxis === Math.PI / 2) geom.rotateZ(Math.PI / 2);
      else if (rotAxis === 'z') geom.rotateX(Math.PI / 2);
      const lifted = !rotAxis || rotAxis === 0;
      geom.translate(x, y + (lifted ? h / 2 : 0), z);
      MaterialLibrary.ensureUv2(geom);
      const m = new THREE.Mesh(geom, mat);
      m.castShadow = true;
      m.name = name;
      parent.add(m);
      this._disposables.push(geom);
      return m;
    };

    // W12-G: modelled coast parts (coast-models.js) carry vertex colour (tone and baked occlusion) over a library
    // material, so each gets its own variant with `vertexColors` on; the shared beach materials stay untouched.
    const vcMat = (family, opts) => {
      const mat = get(family, opts);
      mat.vertexColors = true;
      mat.needsUpdate = true;
      return mat;
    };
    const addGeo = (parent, geometry, material, name, { cast = true, receive = true } = {}) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      parent.add(mesh);
      this._disposables.push(geometry);
      return mesh;
    };

    /* PM11: one two-triangle folded surface for every towel/debris card. */
    const foldedCardGeom = new THREE.BufferGeometry();
    foldedCardGeom.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.5, -0.030, -0.5,  0.5, -0.024, -0.5,
       0.5,  0.075,  0.5, -0.5, -0.020,  0.5,
    ], 3));
    foldedCardGeom.setAttribute('uv', new THREE.Float32BufferAttribute([
      0, 0, 1, 0, 1, 1, 0, 1,
    ], 2));
    foldedCardGeom.setIndex([0, 2, 1, 0, 3, 2]);
    foldedCardGeom.computeVertexNormals();
    this._disposables.push(foldedCardGeom);

    /* A tiny radial multiply map keeps the pool one draw call and edge-free. */
    const contactSize = 32;
    const contactPixels = new Uint8Array(contactSize * contactSize * 4);
    for (let py = 0; py < contactSize; py += 1) {
      for (let px = 0; px < contactSize; px += 1) {
        const dx = (px + 0.5) / contactSize * 2 - 1;
        const dy = (py + 0.5) / contactSize * 2 - 1;
        const d = Math.min(1, Math.hypot(dx, dy));
        const t = d * d * (3 - 2 * d);
        const v = Math.round(255 * (0.38 + 0.62 * t));
        const at = (py * contactSize + px) * 4;
        contactPixels[at] = v;
        contactPixels[at + 1] = v;
        contactPixels[at + 2] = v;
        contactPixels[at + 3] = 255;
      }
    }
    const contactMap = new THREE.DataTexture(contactPixels, contactSize, contactSize, THREE.RGBAFormat);
    contactMap.colorSpace = THREE.SRGBColorSpace;
    contactMap.needsUpdate = true;
    const contactMat = new THREE.MeshBasicMaterial({
      name: `nature:beach-prop-contact-material:${edge}`,
      color: 0xffffff,
      map: contactMap,
      transparent: true,
      opacity: BEACH_PROP_CONTACT.alpha,
      depthWrite: false,
      toneMapped: false,
      premultipliedAlpha: true,
      blending: THREE.MultiplyBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    contactMat.userData.pm11Contact = { ...BEACH_PROP_CONTACT };
    const contactGeom = new THREE.PlaneGeometry(1, 1);
    contactGeom.rotateX(-Math.PI / 2);
    this._disposables.push(contactMap, contactGeom);
    this._ownedMaterials.push(contactMat);
    const pm11Props = [];
    const pm11ContactPlacements = [];
    const pm11AirborneProps = [];
    const p17BeachFigures = [];
    const registerBeachProp = (parent, {
      name, kind, x = 0, z = 0, width, depth, groundY = GND,
      yaw: propYaw = 0, sink = 0.03,
    }) => {
      const sx = parent.scale.x || 1;
      const sy = parent.scale.y || 1;
      const sz = parent.scale.z || 1;
      const c = Math.cos(parent.rotation.y);
      const sn = Math.sin(parent.rotation.y);
      const lx = x * sx;
      const lz = z * sz;
      const wx = parent.position.x + lx * c + lz * sn;
      const wz = parent.position.z - lx * sn + lz * c;
      const sandY = parent.position.y + groundY * sy;
      const record = {
        name,
        kind,
        x: wx,
        z: wz,
        width: width * sx,
        depth: depth * sz,
        yaw: parent.rotation.y + propYaw,
        sandY,
        footY: sandY - sink * sy,
        sink: sink * sy,
        contactWidth: width * sx * BEACH_PROP_CONTACT.footprintScale,
        contactDepth: depth * sz * BEACH_PROP_CONTACT.footprintScale,
        casterName: name,
      };
      pm11Props.push(record);
      pm11ContactPlacements.push(record);
      return record;
    };
    const foldedCard = (parent, {
      name, kind = 'debris', x, z, width, depth, groundY, yaw: cardYaw = 0, mat,
    }) => {
      const mesh = new THREE.Mesh(foldedCardGeom, mat);
      mesh.name = name;
      mesh.position.set(x, groundY, z);
      mesh.rotation.y = cardYaw;
      mesh.scale.set(width, 1, depth);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.pm11FoldedCard = { triangles: 2, liftedCorner: 0.075, sink: 0.03 };
      parent.add(mesh);
      registerBeachProp(parent, { name, kind, x, z, width, depth, groundY, yaw: cardYaw });
      return mesh;
    };

    // Classic ice-cream van on dry sand (local +X = long axis along beach).
    // Cab + box body, side serve hatch, roof soft-serve cone — not a plain cream box.
    // Mischief: stages 1–2 tip this live mesh; stage 3 scatters ice-cream-on-cones.
    if (!this.beachIcecreamRecords) this.beachIcecreamRecords = [];
    {
      const g = placeGroup(0.44, 9.5);
      // taste-r1 W8-E: 1.15 -> 1.04. Measured on the untouched game the van was 5.08 x 3.15 x 4.05 m (length x width x height) against the
      // bible's 5.2 x 2.0 x 2.3; the soft-serve cone on the roof (1.4 m of the height) is gone and the awning and the signboard sit
      // closer to the body, so the box is 2.3 m high and the width is the body, the arches and a shallow awning.
      const IC_SCALE = 1.04;
      g.scale.setScalar(IC_SCALE);
      g.name = `beach-icecream-van:${edge}`;
      const pink = get('painted_metal', {
        variant: 'beach-icecream-pink', color: '#aaa49a', roughness: 0.84,
      });
      const pinkDeep = get('painted_metal', {
        variant: 'beach-icecream-pink-deep', color: '#827971', roughness: 0.84,
      });
      const mint = get('painted_metal', {
        variant: 'beach-icecream-mint', color: '#858d86', roughness: 0.84,
      });
      const glassDark = get('painted_metal', {
        variant: 'beach-icecream-glass', color: '#1a3040', roughness: 0.22, metalness: 0.15,
      });
      // —— Chassis / body (van box, not a slab) ——
      // Lower skirt + main body
      box(g, 4.05, 0.28, 1.95, 0.05, 0.22, 0, metal, 'ic-chassis');
      box(g, 3.95, 1.15, 1.88, 0.05, 0.48, 0, pink, 'ic-body');
      // Rear service box (taller box behind the cab)
      box(g, 2.35, 1.55, 1.95, 0.75, 0.48, 0, pink, 'ic-box');
      // Cab greenhouse (front toward −X)
      box(g, 1.45, 0.95, 1.82, -1.25, 1.0, 0, white, 'ic-cabin');
      // Windscreen + side cab glass
      box(g, 0.08, 0.7, 1.55, -1.95, 1.15, 0, glassDark, 'ic-windscreen');
      box(g, 0.55, 0.55, 0.08, -1.35, 1.2, 0.92, glassDark, 'ic-cab-glass-R');
      box(g, 0.55, 0.55, 0.08, -1.35, 1.2, -0.92, glassDark, 'ic-cab-glass-L');
      // Bonnet / nose
      box(g, 0.7, 0.55, 1.7, -1.95, 0.55, 0, pinkDeep, 'ic-bonnet');
      // Bumper + grille + headlights
      box(g, 0.30, 0.28, 1.85, -2.10, 0.42, 0, metal, 'ic-bumper');
      box(g, 0.1, 0.35, 0.9, -2.28, 0.72, 0, metal, 'ic-grille');
      for (const side of [-1, 1]) {
        // Headlamp disc faces along X (forward of the van).
        cyl(g, 0.14, 0.14, 0.08, -2.3, 0.72, side * 0.62, yellow, 'ic-headlamp', 8, 'x');
      }
      // Wheel arches (value break over tyres)
      for (const [ax, az] of [[-1.15, 0.98], [1.0, 0.98], [-1.15, -0.98], [1.0, -0.98]]) {
        box(g, 0.72, 0.38, 0.2, ax, 0.52, az, pinkDeep, 'ic-arch');
      }
      // Wheels: axle along local Z (width axis) so discs face out of the sides.
      // Build with mesh.rotation (not geom.rotate) so the tyre reads as a vertical disc.
      const tyre = get('painted_metal', {
        variant: 'beach-icecream-tyre', color: '#1a1a1c', roughness: 0.92, metalness: 0.05,
      });
      const hubCap = get('painted_metal', {
        variant: 'beach-icecream-hub', color: '#e8eef2', roughness: 0.35, metalness: 0.45,
      });
      const addWheel = (dx, dz) => {
        const wheelR = 0.36;
        const tyreW = 0.24;
        const tyreGeom = new THREE.CylinderGeometry(wheelR, wheelR, tyreW, 14);
        MaterialLibrary.ensureUv2(tyreGeom);
        const tyreMesh = new THREE.Mesh(tyreGeom, tyre);
        // Default cylinder axis = Y; rotate so axis = Z (side-to-side axle).
        tyreMesh.rotation.x = Math.PI / 2;
        tyreMesh.position.set(dx, wheelR, dz);
        tyreMesh.castShadow = true;
        tyreMesh.name = 'ic-wheel';
        g.add(tyreMesh);
        this._disposables.push(tyreGeom);

        const hubGeom = new THREE.CylinderGeometry(0.16, 0.16, tyreW + 0.04, 10);
        MaterialLibrary.ensureUv2(hubGeom);
        const hubMesh = new THREE.Mesh(hubGeom, hubCap);
        hubMesh.rotation.x = Math.PI / 2;
        hubMesh.position.set(dx, wheelR, dz);
        hubMesh.castShadow = true;
        hubMesh.name = 'ic-hub';
        g.add(hubMesh);
        this._disposables.push(hubGeom);

        const pinGeom = new THREE.CylinderGeometry(0.07, 0.07, tyreW + 0.08, 8);
        MaterialLibrary.ensureUv2(pinGeom);
        const pinMesh = new THREE.Mesh(pinGeom, metal);
        pinMesh.rotation.x = Math.PI / 2;
        pinMesh.position.set(dx, wheelR, dz);
        pinMesh.name = 'ic-hub-pin';
        g.add(pinMesh);
        this._disposables.push(pinGeom);
      };
      for (const [dx, dz] of [[-1.15, 0.98], [1.05, 0.98], [-1.15, -0.98], [1.05, -0.98]]) {
        addWheel(dx, dz);
      }
      // Pink / mint candy stripe belt around the box
      box(g, 2.4, 0.28, 2.02, 0.75, 1.35, 0, mint, 'ic-stripe-belt');
      box(g, 2.42, 0.12, 2.04, 0.75, 1.55, 0, stripe, 'ic-stripe-red');
      // Side serving hatch (seaward face +Z) — open aperture + flap awning
      box(g, 1.35, 0.85, 0.08, 0.65, 1.05, 1.02, glassDark, 'ic-hatch-glass');
      box(g, 1.5, 0.1, 0.12, 0.65, 1.55, 1.05, white, 'ic-hatch-frame-top');
      box(g, 1.5, 0.1, 0.12, 0.65, 0.85, 1.05, white, 'ic-hatch-frame-bot');
      // Open flap / awning hinged up
      box(g, 1.45, 0.08, 0.3, 0.65, 1.72, 1.1, yellow, 'ic-awning');
      box(g, 0.08, 0.35, 0.16, 0.0, 1.55, 1.12, metal, 'ic-awning-stay-L');
      box(g, 0.08, 0.35, 0.16, 1.3, 1.55, 1.12, metal, 'ic-awning-stay-R');
      // Serving shelf
      box(g, 1.4, 0.08, 0.45, 0.65, 0.95, 1.2, white, 'ic-shelf');
      // Rear doors
      box(g, 0.08, 1.25, 0.75, 1.95, 0.7, 0.4, pinkDeep, 'ic-rear-door-R');
      box(g, 0.08, 1.25, 0.75, 1.95, 0.7, -0.4, pinkDeep, 'ic-rear-door-L');
      box(g, 0.06, 0.2, 0.08, 2.0, 1.1, 0.15, metal, 'ic-rear-handle');
      // Roof panel + soft-serve cone (iconic ice-cream van cue)
      box(g, 2.3, 0.12, 1.85, 0.7, 2.05, 0, white, 'ic-roof');
      box(g, 1.2, 0.1, 1.5, -1.25, 1.95, 0, white, 'ic-cab-roof');
      // Cone: inverted taper + stacked scoops
      // Side "ICE CREAM" signboard (landward face for walkers)
      box(g, 1.6, 0.45, 0.08, 0.7, 1.7, -0.97, yellow, 'ic-signboard');
      box(g, 1.45, 0.28, 0.06, 0.7, 1.72, -1.01, stripe, 'ic-sign-bar');
      // Wing mirrors
      box(g, 0.08, 0.12, 0.22, -1.85, 1.45, 0.95, metal, 'ic-mirror-R');
      box(g, 0.08, 0.12, 0.22, -1.85, 1.45, -0.95, metal, 'ic-mirror-L');
      this.beachIcecreamRecords.push({
        key: `prop:ice-cream-truck:${edge}`,
        modelId: 'ice-cream-truck',
        group: g,
        x: g.position.x,
        z: g.position.z,
        baseScale: IC_SCALE,
      });
    }

    // Lifeguard tower — classic elevated beach lookout on dry sand (NOT on the pier).
    // Keep it on open sand beside the centre civic jetty; there is no ghost flank pier.
    if (!this.beachLifeguardRecords) this.beachLifeguardRecords = [];
    {
      // alongT 0.34 leaves a broad, legible sand gap beside the centre pier.
      const g = placeGroup(0.34, 16.5);
      const LG_SCALE = 1.05;
      g.scale.setScalar(LG_SCALE);
      g.name = `beach-lifeguard-tower:${edge}`;
      // Local: +Z seaward (view over the bay), +Y up. Open stilts + platform + cabin.
      const deckY = 2.85; // platform top
      const postH = deckY - 0.08;
      // Four main posts (open undercroft — sand visible underneath).
      for (const [lx, lz] of [[-0.85, -0.7], [0.85, -0.7], [-0.85, 0.85], [0.85, 0.85]]) {
        box(g, 0.16, postH, 0.16, lx, 0.06, lz, timber, 'lg-post');
        // Foot plate on sand
        box(g, 0.32, 0.08, 0.32, lx, 0.02, lz, metal, 'lg-foot');
      }
      // X-bracing between posts (structure read, not a solid box).
      box(g, 1.55, 0.08, 0.08, 0, 1.1, -0.7, timber, 'lg-brace-back');
      box(g, 1.55, 0.08, 0.08, 0, 1.85, 0.85, timber, 'lg-brace-front');
      box(g, 0.08, 0.08, 1.4, -0.85, 1.45, 0.08, timber, 'lg-brace-L');
      box(g, 0.08, 0.08, 1.4, 0.85, 1.45, 0.08, timber, 'lg-brace-R');
      // Diagonal crosses (simplified as thin bars)
      // P16-W5: the two back diagonals began 0.67 m up with nothing under
      // them. They run from the sand to the deck bearer now.
      box(g, 0.07, 2.72, 0.07, -0.4, 0.03, -0.7, timber, 'lg-x-back-a');
      box(g, 0.07, 2.72, 0.07, 0.4, 0.03, -0.7, timber, 'lg-x-back-b');
      // Raised timber deck (planked look via value split) + seaward viewing lip.
      box(g, 2.15, 0.12, 2.0, 0, deckY - 0.06, 0.08, timber, 'lg-deck');
      box(g, 2.05, 0.08, 0.55, 0, deckY - 0.02, 1.25, timber, 'lg-deck-overhang'); // view deck
      // Joists under deck
      // The joists span BETWEEN the post pairs, so each one lands on the two
      // posts under it; z 0.1 gets a wider section for the middle bearer.
      for (const jz of [-0.7, 0.85]) {
        box(g, 2.0, 0.1, 0.16, 0, deckY - 0.2, jz, timber, 'lg-joist');
      }
      // The middle member runs the other way so it crosses both bearers
      // instead of hanging in the bay between them.
      box(g, 0.16, 0.1, 2.0, 0, deckY - 0.2, 0.08, timber, 'lg-joist');
      // Half-cabin: solid back/sides, OPEN seaward face (observation window).
      // Surf Life Saving yellow body + red roof.
      const cabinBase = deckY + 0.02;
      box(g, 1.85, 1.35, 0.1, 0, cabinBase, -0.85, yellow, 'lg-cabin-back');
      box(g, 0.1, 1.35, 1.55, -0.9, cabinBase, -0.05, yellow, 'lg-cabin-L');
      box(g, 0.1, 1.35, 1.55, 0.9, cabinBase, -0.05, yellow, 'lg-cabin-R');
      // Low kick panel seaward (knees protected, torso open to the bay)
      box(g, 1.75, 0.42, 0.08, 0, cabinBase, 0.78, yellow, 'lg-cabin-kick');
      // Window frame / mullion on the open face
      box(g, 0.08, 1.10, 0.08, 0, cabinBase + 0.40, 0.78, white, 'lg-mullion');
      box(g, 1.7, 0.08, 0.08, 0, cabinBase + 1.15, 0.78, white, 'lg-lintel');
      // Interior seat slab (readable occupation)
      box(g, 1.1, 0.12, 0.45, 0, cabinBase + 0.15, -0.15, timber, 'lg-seat');
      box(g, 0.10, 0.17, 0.40, -0.45, cabinBase - 0.02, -0.15, timber, 'lg-seat-bearer-L');
      box(g, 0.10, 0.17, 0.40, 0.45, cabinBase - 0.02, -0.15, timber, 'lg-seat-bearer-R');
      // Red flat roof with eaves (SLS red)
      box(g, 2.25, 0.12, 2.15, 0, cabinBase + 1.4, 0.05, stripe, 'lg-roof');
      box(g, 2.35, 0.07, 0.3, 0, cabinBase + 1.36, 1.06, stripe, 'lg-roof-eave-F');
      // Deck rails — open front view, solid side/back handrails
      box(g, 2.2, 0.07, 0.07, 0, deckY + 0.85, -0.95, metal, 'lg-rail-B');
      box(g, 0.07, 0.85, 0.07, -1.05, deckY + 0.05, -0.95, metal, 'lg-post-BL');
      box(g, 0.07, 0.85, 0.07, 1.05, deckY + 0.05, -0.95, metal, 'lg-post-BR');
      box(g, 0.07, 0.55, 1.85, -1.05, deckY + 0.05, 0.15, metal, 'lg-rail-L');
      box(g, 0.07, 0.55, 1.85, 1.05, deckY + 0.05, 0.15, metal, 'lg-rail-R');
      // Front view-deck rail (low, doesn't block the lookout)
      box(g, 2.1, 0.07, 0.07, 0, deckY + 0.48, 1.48, yellow, 'lg-rail-F');
      box(g, 0.07, 0.48, 0.07, -1.0, deckY + 0.02, 1.48, yellow, 'lg-rail-FL');
      box(g, 0.07, 0.48, 0.07, 1.0, deckY + 0.02, 1.48, yellow, 'lg-rail-FR');
      // Stair flight from sand to deck (landward side, clear of pier)
      // P16-W5: the "stringers" were two VERTICAL posts at one z, so four
      // treads climbed away from them and the top three landed on nothing —
      // the stair was a ladder of floating boards. The stringers rake now,
      // from the sand at z −1.85 to the deck at z −0.78, and each tread is set
      // on the rake line and widened to 0.86 so it bears on both of them.
      const stairRake = 0.3629;   // atan(1.07 / 2.82) — 20.8 deg off vertical
      const stairZAt = (ty) => -1.85 + ((ty + 0.02) / 2.82) * 1.07;
      const treads = [0.35, 0.90, 1.45, 2.00, 2.55];
      for (let i = 0; i < treads.length; i += 1) {
        box(g, 0.86, 0.1, 0.62, 0, treads[i], stairZAt(treads[i]), timber, `lg-stair-${i + 1}`);
      }
      for (const sx of [-0.42, 0.42]) {
        boxRotX(g, 0.09, 3.02, 0.13, sx, 1.39, -1.315, stairRake, timber,
          sx < 0 ? 'lg-stair-stringer-L' : 'lg-stair-stringer-R');
      }
      // Flagpole + red/yellow pennant (SLS identity)
      // The pole stood at x 1.15 with the deck ending at 1.075 — it was
      // planted on air. It steps inboard onto the deck, and each pennant is
      // wide enough to overlap the pole it flies from.
      box(g, 0.08, 3.6, 0.08, 1.00, deckY - 0.02, -0.55, metal, 'lg-flagpole');
      box(g, 0.60, 0.28, 0.04, 1.26, deckY + 3.15, -0.55, stripe, 'lg-flag-red');
      box(g, 0.60, 0.28, 0.04, 1.26, deckY + 2.85, -0.55, yellow, 'lg-flag-yellow');
      // Rescue board rack on the side
      box(g, 0.1, 1.1, 0.1, -1.25, 0.02, 0.35, timber, 'lg-board-rack-a');
      box(g, 0.1, 1.1, 0.1, -1.25, 0.02, 0.85, timber, 'lg-board-rack-b');
      box(g, 0.14, 0.12, 0.62, -1.25, 0.95, 0.6, timber, 'lg-board-rack-rail');
      // The board leans on the rail and stands on the sand; its nose is part
      // of the same board rather than a detached bar in the air.
      box(g, 0.24, 0.18, 1.75, -1.30, GND - 0.03, 0.60, yellow, 'lg-rescue-board');
      box(g, 0.10, 0.10, 0.40, -1.30, 0.10, 1.30, stripe, 'lg-board-nose');
      registerBeachProp(g, {
        name: 'lg-rescue-board', kind: 'board', x: -1.30, z: 0.60,
        width: 0.24, depth: 1.75, groundY: GND,
      });

      this.beachLifeguardRecords.push({
        key: `prop:lifeguard-tower:${edge}`,
        modelId: 'lifeguard-tower',
        group: g,
        x: g.position.x,
        z: g.position.z,
        baseScale: LG_SCALE,
      });
    }

    // Beach activity clusters: denser umbrella fields + towels + chairs
    const blue = get('painted_metal', { variant: 'beach-blue', color: '#707f8b', roughness: 0.84 });
    const coral = get('painted_metal', { variant: 'beach-coral', color: '#9b8980', roughness: 0.84 });
    // Cloth gets a diffuse response distinct from painted kiosk/tower metal.
    const clothRed = get('painted_metal', {
      variant: 'beach-cloth-red-r7', color: '#95847e', roughness: 0.9, metalness: 0,
    });
    const clothYellow = get('painted_metal', {
      variant: 'beach-cloth-yellow-r7', color: '#aaa18b', roughness: 0.9, metalness: 0,
    });
    const clothBlue = get('painted_metal', {
      variant: 'beach-cloth-blue-r7', color: '#7b8992', roughness: 0.9, metalness: 0,
    });
    const clothCoral = get('painted_metal', {
      variant: 'beach-cloth-coral-r7', color: '#a19287', roughness: 0.9, metalness: 0,
    });
    const clothCream = get('painted_metal', {
      variant: 'beach-cloth-cream-r7', color: '#c4bfb3', roughness: 0.94, metalness: 0,
    });
    // Displaced sand thrown up round a driven mast. Slightly darker and damper
    // than the dry shelf so the ring reads as a disturbance rather than a pale
    // washer.
    const sandRingMat = get('sand', {
      variant: 'beach-mast-ring-w5', color: '#c9a874', roughness: 0.97, metalness: 0,
    });
    const canopyMats = [clothRed, clothYellow, clothBlue, clothCoral, clothCream];
    // P23: sun-faded fabric, with dirt retained in the rolled edge.
    for (const mat of canopyMats) mat.vertexColors = true;
    /**
     * ── P16-W5 ITEM 1: THE CANOPY. ──
     *
     * What was here: a 2.05 m-RADIUS zero-thickness dome authored in absolute
     * mast coordinates (apex 2.9, rim 2.18) and scaled again by the station's
     * size class, i.e. a 4.10-5.08 m canopy — three metres wider than the
     * thing it shades — with a knife rim, no ribs, no sag, and a "ground
     * shadow" disc parented to the DOME, so it rode up the mast and tilted
     * with it instead of lying on the sand. The critic measured all of that
     * (corner-close F1/F3/F5/F7, beach-corner F9); the PM1 report's 5.65-7.06 m
     * is the same object read through a yaw-rotated Box3, which reports the
     * disc's diagonal.
     *
     * What is here now: the canopy is authored about ITS OWN RIM (rim at local
     * y 0, apex at +rise) so the caller hangs it off the mast rather than
     * arithmetic in absolute mast space; `radius` is a parameter and the size
     * classes are narrowed so every canopy lands in 2.0-2.4 m across. The
     * surface is shelled 0.04 m, carries 8 ribs, drops a rolled hem at the rim
     * and sags between the ribs — `rib` is 1 on a rib and 0 midway, so the
     * fabric scallops the way a real umbrella's does and the silhouette is
     * never a flat disc from any angle.
     *
     * Three material groups: two stripe families by gore parity, plus the ribs.
     * One mesh, so 33 canopies stay 33 draw calls' worth of geometry rather
     * than 264 separate rib meshes.
     */
    const UMBRELLA_R = 1.10;   // 2.20 m across at size class 1.0
    const umbrellaCanopy = (parent, primary, accent, ribMat, phase = 0, radius = UMBRELLA_R) => {
      const SEG = 16;    // gores; stripes alternate on gore parity
      const RINGS = 3;   // apex → rim
      const RIBS = 8;
      const rise = radius * 0.40;
      const sag = radius * 0.085;
      const thick = 0.04;
      const hem = radius * 0.030;
      const ribDrop = thick + 0.012;
      const ribHalf = Math.max(0.014, radius * 0.014);
      // Surface point on the fabric. t = 0 apex, 1 rim; `rib` is 1 on a rib
      // spine and 0 midway between two, which is where the cloth droops.
      const surf = (t, a) => {
        const r = radius * t;
        const rib = 0.5 + 0.5 * Math.cos(a * RIBS);
        const y = rise * ((1 - t) ** 1.35) - sag * (1 - rib) * Math.sin(Math.PI * t);
        return [Math.sin(a) * r, y, Math.cos(a) * r];
      };
      const tri = (out, p, q, r) => { out.push(...p, ...q, ...r); };
      const quad = (out, p, q, r, s) => { tri(out, p, q, r); tri(out, p, r, s); };
      const lower = (p, d) => [p[0], p[1] - d, p[2]];
      /** @type {number[][]} */
      const buckets = [[], [], []];
      for (let i = 0; i < SEG; i += 1) {
        const out = buckets[i % 2];
        const a0 = phase + (i / SEG) * Math.PI * 2;
        const a1 = phase + ((i + 1) / SEG) * Math.PI * 2;
        for (let k = 0; k < RINGS; k += 1) {
          const t0 = k / RINGS;
          const t1 = (k + 1) / RINGS;
          const p00 = surf(t0, a0); const p01 = surf(t0, a1);
          const p10 = surf(t1, a0); const p11 = surf(t1, a1);
          if (k === 0) {
            // apex fan (t0 = 0 collapses to a point)
            tri(out, p00, p10, p11);
            tri(out, lower(p00, thick), lower(p11, thick), lower(p10, thick));
          } else {
            quad(out, p00, p10, p11, p01);
            quad(out, lower(p01, thick), lower(p11, thick), lower(p10, thick), lower(p00, thick));
          }
        }
        // Rolled hem: the rim is a band with real thickness that drops below
        // the fabric line, so the edge never reads as a cut disc.
        const e0 = surf(1, a0); const e1 = surf(1, a1);
        const h0 = [e0[0], e0[1] - hem, e0[2]];
        const h1 = [e1[0], e1[1] - hem, e1[2]];
        quad(out, e0, e1, h1, h0);
        quad(out, lower(h0, thick), lower(h1, thick), h1, h0);
      }
      // Ribs: a three-face channel under the fabric on each rib spine.
      for (let rb = 0; rb < RIBS; rb += 1) {
        const a = phase + (rb / RIBS) * Math.PI * 2;
        const nx = Math.cos(a); const nz = -Math.sin(a);   // across the rib
        for (let k = 0; k < RINGS; k += 1) {
          const t0 = Math.max(k / RINGS, 0.10);
          const t1 = (k + 1) / RINGS;
          const c0 = surf(t0, a); const c1 = surf(t1, a);
          const off = (p, s, dy) => [p[0] + nx * s, p[1] - dy, p[2] + nz * s];
          const l0 = off(c0, -ribHalf, ribDrop); const r0 = off(c0, ribHalf, ribDrop);
          const l1 = off(c1, -ribHalf, ribDrop); const r1 = off(c1, ribHalf, ribDrop);
          const l0t = off(c0, -ribHalf, thick); const r0t = off(c0, ribHalf, thick);
          const l1t = off(c1, -ribHalf, thick); const r1t = off(c1, ribHalf, thick);
          quad(buckets[2], l0, l1, r1, r0);            // underside
          quad(buckets[2], l0t, l0, r0, r0t);          // inboard cap
          quad(buckets[2], l1, l1t, r1t, r1);          // side faces
          quad(buckets[2], l0t, l1t, l1, l0);
          quad(buckets[2], r0, r1, r1t, r0t);
        }
      }
      const positions = [...buckets[0], ...buckets[1], ...buckets[2]];
      const fabricWear = [];
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i]; const z = positions[i + 2];
        const rim = Math.min(1, Math.hypot(x, z) / radius);
        const shade = (0.92 + 0.08 * Math.sin(x * 19.7 + z * 13.3))
          * (1 - 0.16 * Math.pow(rim, 12));
        fabricWear.push(shade, shade, shade);
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(fabricWear, 3));
      geom.computeVertexNormals();
      let start = 0;
      for (let b = 0; b < 3; b += 1) {
        const count = buckets[b].length / 3;
        if (count > 0) geom.addGroup(start, count, b);
        start += count;
      }
      MaterialLibrary.ensureUv2(geom);
      const mesh = new THREE.Mesh(geom, [primary, accent, ribMat]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'umbrella-striped-canopy';
      parent.add(mesh);
      this._disposables.push(geom);
      return mesh;
    };
    /**
     * Contact darkening under a station. Was a disc parented to the dome at
     * local y 0.03, which put it 0.4-0.8 m under the sand on every station the
     * census measured; it is a child of the STATION group now, seated 8 mm
     * over the drawn section with a polygon offset, and sized off the canopy
     * rather than a fixed 1.35 m.
     */
    const umbrellaContact = (parent, radius, groundY) => registerBeachProp(parent, {
      name: parent.userData.pm11UmbrellaContactName
        ?? `${parent.name || 'beach-umbrella'}:contact-caster`,
      kind: 'umbrella',
      width: radius * 2,
      depth: radius * 2,
      groundY,
    });
    // Umbrellas stay on open sand only — never on piers, lifeguard, vans, kiosks, etc.
    // Exclusion is in (along-metres, seaward-metres) of the beach frame.
    const pierMargin = Math.max(28, frame.length * 0.12);
    const pierUsable = Math.max(frame.length - pierMargin * 2, 40);
    const pierStep = PIER_COUNT <= 1 ? 0 : pierUsable / (PIER_COUNT - 1);
    const pierAlongs = Array.from(
      { length: PIER_COUNT },
      (_, i) => (PIER_COUNT === 1 ? frame.length * 0.5 : pierMargin + pierStep * i),
    );
    /** Structure keep-outs: circle radius in metres around (along, seaward). */
    const structureExclusions = [
      { along: 0.34 * frame.length, sea: 16.5, r: 6.0 }, // lifeguard tower
      { along: 0.44 * frame.length, sea: 9.5, r: 5.5 },  // ice-cream truck
      { along: 0.56 * frame.length, sea: 9.0, r: 5.0 },  // kiosk
      { along: 0.58 * frame.length, sea: 12.5, r: 4.0 }, // surfboard rack
      { along: 0.38 * frame.length, sea: 11.5, r: 4.0 }, // board rack 2
      { along: 0.5 * frame.length, sea: 7.2, r: 3.0 },   // shower
      { along: 0.22 * frame.length, sea: 7.0, r: 3.0 },   // shower b
      { along: 0.7 * frame.length, sea: 17.5, r: 5.5 },   // volleyball
      { along: 0.85 * frame.length, sea: BOARDWALK_SEAWARD_EDGE + 2.4, r: 4.5 }, // bus stop
    ];
    const pierHalf = PIER_WIDTH * 0.5 + 2.8;
    const worldOf = (alongM, sea) => {
      if (alongX) {
        return { x: alongM, z: frame.origin.z + frame.normal.z * sea };
      }
      return { x: frame.origin.x + frame.normal.x * sea, z: alongM };
    };
    const inP13Corner = (alongM, sea) => {
      const w = worldOf(alongM, sea);
      return w.x > SHORE.cornerMaskX && w.z < SHORE.cornerMaskZ;
    };
    const umbrellaBlocked = (alongM, sea) => {
      if (inP13Corner(alongM, sea)) return true;
      // Pier strips: full run seaward from wall into the bay.
      for (const pAlong of pierAlongs) {
        if (Math.abs(alongM - pAlong) < pierHalf && sea > 1.5 && sea < PIER_LENGTH + 4) {
          return true;
        }
      }
      for (const e of structureExclusions) {
        const da = alongM - e.along;
        const ds = sea - e.sea;
        if (da * da + ds * ds < e.r * e.r) return true;
      }
      return false;
    };
    const h01 = (i, salt) => {
      const s = Math.sin(i * 12.9898 + salt * 78.233 + 1.0) * 43758.5453;
      return s - Math.floor(s);
    };

    // ── A7 ITEM 2 / R4 FAULT 4: THE UMBRELLA RANK. ──
    //
    // r5 laid a full-edge primary row on a fixed 6.5 m pitch with ±35 % of that
    // pitch as jitter, then a second row half a pitch off it at a fixed 17.2 m
    // seaward. ±35 % of 6.5 m is ±2.3 m against a 6.5 m interval, which the eye
    // integrates straight back out: from user-corner it read as two ruled rows
    // of identical umbrellas, which is exactly what the audit measured.
    //
    // The schedule is now a CLUSTER schedule, not a pitch. Groups of 2–5
    // stations sit at gaps of 6–14 m; the whole group shares an along-anchor and
    // a seaward anchor, so the spacing WITHIN a group is 1.5–4 m and the spacing
    // BETWEEN groups is four to nine times that. Three canopy sizes, two pole
    // heights, ±12° of tilt, a third of them furled and lying on the sand, and
    // roughly a quarter of the groups with no umbrella at all — just towels and
    // an esky. There is no row left to read.
    //
    // The `prop:beach-umbrella:${edge}:*` mischief keys and both push sites
    // survive; `clusterI` is now the station index inside each pass.
    const clusterMargin = 2.5;
    const usable = Math.max(20, frame.length - clusterMargin * 2);
    /** @type {{along:number,out:number,n:number,bare:boolean,gi:number}[]} */
    const groups = [];
    {
      let cursor = clusterMargin + 2.0;
      let gi = 0;
      while (cursor < clusterMargin + usable && gi < 64) {
        const gap = 6 + h01(gi, 41) * 8;
        groups.push({
          along: cursor,
          out: 11.4 + h01(gi, 42) * 7.2,
          n: 2 + Math.floor(h01(gi, 43) * 4),
          bare: h01(gi, 44) < 0.24,
          gi,
        });
        cursor += gap + (2 + Math.floor(h01(gi, 43) * 4)) * 1.1;
        gi += 1;
      }
    }
    /** Stations, split front/back so both mischief push sites stay live. */
    const stationsA = [];
    const stationsB = [];
    for (const grp of groups) {
      for (let s = 0; s < grp.n; s += 1) {
        const k = h01(grp.gi * 11 + s, 45);
        const k2 = h01(grp.gi * 11 + s, 46);
        const k3 = h01(grp.gi * 11 + s, 47);
        const st = {
          along: grp.along + (s - (grp.n - 1) * 0.5) * (1.6 + k * 2.6) + (k2 - 0.5) * 1.4,
          out: grp.out + (k3 - 0.5) * 4.6,
          // P16-W5: three size classes still, but on a 1.10 m radius they span
          // 2.02 / 2.20 / 2.40 m across — a beach umbrella beside a 1.7 m
          // figure — instead of 3.20 / 4.10 / 5.08 m.
          size: [0.92, 1.0, 1.09][Math.floor(k * 3)],
          tall: k2 > 0.45,
          tilt: (k3 - 0.5) * 0.42,
          closed: k3 < 0.33,
          bare: grp.bare,
          gi: grp.gi,
        };
        (s % 2 === 0 ? stationsA : stationsB).push(st);
      }
    }
    const familyMats = [
      [clothRed, clothCoral],
      [clothBlue, clothCream],
      [clothYellow, clothCream],
    ];
    const familyAt = (alongM) => {
      const cell = Math.floor((alongM + h01(Math.floor(alongM * 0.2), 3) * 10) / 22);
      return Math.floor(h01(cell, 11) * 3);
    };
    /**
     * A towel. Now the station group is seated on the drawn section, a towel
     * authored at y 0.07-0.08 would hover 7 cm over the sand and one authored
     * at 0 would coplanar-fight it, which is the pair of faults the critic
     * called "flat quads z-fighting on the sand" (corner-close F7). It sits
     * 6 mm proud with 5 cm of thickness — no shared plane to fight — carries
     * its own yaw so the field is not a rank of parallel rectangles, and gets
     * a rolled end so the silhouette is not a card.
     */
    const towel = (parent, w, d, ox, oz, mat, name, salt) => {
      const drop = localSectionDrop(parent, ox, oz);
      const t = new THREE.Group();
      t.position.set(ox, GND + drop, oz);
      const towelYaw = (h01(ox * 7.3 + oz * 3.1, salt) - 0.5) * 1.5;
      t.rotation.y = towelYaw;
      parent.add(t);
      const cloth = new THREE.Mesh(foldedCardGeom, mat);
      cloth.name = name;
      cloth.scale.set(w, 1, d);
      cloth.castShadow = true;
      cloth.receiveShadow = true;
      cloth.userData.pm11FoldedCard = { triangles: 2, liftedCorner: 0.075, sink: 0.03 };
      t.add(cloth);
      cyl(t, 0.045, 0.045, w * 0.86, 0, 0.06, -d * 0.42, mat, `${name}-roll`, 6, 'x');
      registerBeachProp(parent, {
        name, kind: 'towel', x: ox, z: oz, width: w, depth: d,
        groundY: GND + drop, yaw: towelYaw,
      });
      return t;
    };
    const placeBeachFigure = (parent, {
      x, z, yaw = 0, pose = 'stand', accessory = 'hat', build, name, onProp = null,
      palette, shirtMat = null,
    }) => {
      const kit = pickFigureKit(name, { pose, accessory, build });
      const lifeguard = name.startsWith('beach-corner-pointer:');
      const fig = createI4FigureGroup({
        ...kit,
        wardrobe: lifeguard ? 'lifeguard' : 'swimwear',
        identity: lifeguard ? 'jogger' : undefined,
        palette: lifeguard ? { upper: '#e5bf39', lower: '#b83b32' }
          : palette ?? { ...kit.palette, upper: shirtMat?.color ?? kit.palette.upper },
        name,
      });
      const drop = localSectionDrop(parent, x, z);
      fig.position.set(x, drop, z);
      fig.rotation.y = yaw;
      parent.add(fig);
      const c = Math.cos(parent.rotation.y);
      const sn = Math.sin(parent.rotation.y);
      p17BeachFigures.push({
        id: name, name,
        x: parent.position.x + x * c + z * sn,
        z: parent.position.z - x * sn + z * c,
        pose: kit.pose, accessory: kit.accessory,
        build: kit.build, paletteId: (palette ?? kit.palette).id, width: 0.42,
        onProp, kind: 'figure',
      });
      return fig;
    };
    const placeChair = (parent, ox, oz, towardWater, backMat) => {
      const chair = new THREE.Group();
      chair.position.set(ox, localSectionDrop(parent, ox, oz), oz);
      chair.rotation.y = towardWater ? Math.PI : (h01(ox * 10 + oz, 27) - 0.5) * 0.7;
      parent.add(chair);
      // P16-W5 (critic corner-close F7: "deck chairs are cardboard cut-outs").
      // What was here was a slab seat, a slab back and TWO legs, both on the
      // same rear edge — a chair that cannot stand. It is a frame plus fabric
      // now: two timber side rails on four legs, a canvas sling between them,
      // a canvas back and a front cross-rail. The four names the sand-tap
      // settle pass looks for (`beach-chair-seat`, `-back`, `-leg`, `-leg2`)
      // all survive and still carry the same members.
      const cloth = backMat || clothCream;
      box(chair, 0.08, 0.46, 0.08, -0.24, GND - 0.02, -0.16, timber, 'beach-chair-leg');
      box(chair, 0.08, 0.46, 0.08, 0.24, GND - 0.02, -0.16, timber, 'beach-chair-leg2');
      box(chair, 0.07, 0.42, 0.07, -0.24, GND - 0.02, 0.24, timber, 'beach-chair-leg-front-L');
      box(chair, 0.07, 0.42, 0.07, 0.24, GND - 0.02, 0.24, timber, 'beach-chair-leg-front-R');
      // Side rails tie front legs to rear legs and carry the sling.
      box(chair, 0.06, 0.07, 0.56, -0.24, GND + 0.38, 0.04, timber, 'beach-chair-rail-L');
      box(chair, 0.06, 0.07, 0.56, 0.24, GND + 0.38, 0.04, timber, 'beach-chair-rail-R');
      box(chair, 0.54, 0.06, 0.07, 0, GND + 0.38, 0.26, timber, 'beach-chair-cross');
      // Canvas: a sling that hangs 2 cm under the rails, and the back panel.
      box(chair, 0.46, 0.035, 0.50, 0, GND + 0.395, 0.04, cloth, 'beach-chair-seat');
      box(chair, 0.46, 0.42, 0.035, 0, GND + 0.45, -0.19, cloth, 'beach-chair-back');
      box(chair, 0.06, 0.50, 0.06, -0.24, GND + 0.42, -0.20, timber, 'beach-chair-back-post-L');
      box(chair, 0.06, 0.50, 0.06, 0.24, GND + 0.42, -0.20, timber, 'beach-chair-back-post-R');
      registerBeachProp(parent, {
        name: `beach-sunbed:${pm11Props.length}`, kind: 'sunbed', x: ox, z: oz,
        width: 0.54, depth: 0.56, groundY: GND + localSectionDrop(parent, ox, oz),
        yaw: chair.rotation.y, sink: 0.02,
      });
    };
    /**
     * One umbrella STATION. The mast lives in its own child group so the tilt
     * and the size class move the canopy without tipping the towels, the chairs
     * or the esky sitting on the sand beside it.
     */
    const placeMast = (g, st, canopyMat, accent, phase, suffix) => {
      if (st.bare) return;
      const um = new THREE.Group();
      // The tilt pivots at the FOOT (the mast group's origin is the sand), so
      // a leaning umbrella still has its pole in the ground rather than the
      // canopy sliding off a pole that stayed vertical.
      um.rotation.z = st.tilt;
      um.rotation.y = h01(st.gi * 13 + st.size * 10, 48) * Math.PI * 2;
      um.name = `beach-umbrella${suffix}:${st.gi}`;
      g.userData.pm11UmbrellaContactName = um.name;
      g.add(um);
      // taste-r1 W8-E: the short pole 2.16 -> 2.28 so the apex of every open canopy stands 2.2 to 2.4 m (it is the pole top less 0.06).
      const poleH = st.tall ? 2.42 : 2.28;
      const radius = UMBRELLA_R * st.size;
      if (st.closed) {
        // Furled and lying on the sand: pole flat, cloth wrapped round it. The
        // audit asked for a third of them down and this is what down looks like.
        um.rotation.z = Math.PI * 0.5 - 0.14;
        um.position.set(0.35, GND + 0.16, 0.2);
        cyl(g, 0.20, 0.24, 0.06, 0, GND - 0.03, 0, metal, `umbrella-base-plate${suffix}`, 10);
        cyl(um, 0.06, 0.065, poleH, 0, 0, 0, metal, `umbrella-pole${suffix}`, 8);
        cyl(um, 0.19, 0.1, 1.15, 0, poleH * 0.42, 0, canopyMat, `umbrella-furled${suffix}`, 8);
        cyl(um, 0.07, 0.05, 0.14, 0, poleH * 0.5, 0, metal, `umbrella-ferrule${suffix}`, 8);
        umbrellaContact(g, 0.62, GND);
        return;
      }
      // The pole starts 0.20 m BELOW the sand and runs to the ferrule, so
      // there is no station where the mast stops short of the ground (the
      // critic's corner-close F5, and the top-left umbrella with no pole at
      // all). PM1 drove the port's own poles the same 0.18-0.20 m.
      cyl(um, 0.065, 0.07, poleH + 0.03, 0, GND - 0.03, 0, metal, `umbrella-pole${suffix}`, 8);
      // Foot: a sand ring displaced by the mast, then the collar, then a plate
      // washer at the sand line. Three small solids instead of a hairline
      // entering a flat plane.
      cyl(g, 0.30, 0.42, 0.07, 0, GND - 0.035, 0, sandRingMat, `umbrella-sand-ring${suffix}`, 12);
      cyl(g, 0.15, 0.19, 0.05, 0, GND + 0.005, 0, metal, `umbrella-base-plate${suffix}`, 10);
      cyl(um, 0.10, 0.13, 0.13, 0, GND + 0.02, 0, metal, `umbrella-base-collar${suffix}`, 8);
      cyl(um, 0.08, 0.05, 0.14, 0, GND + poleH, 0, metal, `umbrella-ferrule${suffix}`, 8);
      const dome = new THREE.Group();
      // Canopy authored about its rim: hang the rim below the ferrule so the
      // apex sits just under the pole top, which is where a real canopy meets
      // its mast.
      dome.position.y = GND + poleH - radius * 0.40 - 0.06;
      um.add(dome);
      umbrellaCanopy(dome, canopyMat, accent, metal, phase, radius);
      umbrellaContact(g, radius * 0.88, GND);
    };
    let chairIndex = 0;
    for (let clusterI = 0; clusterI < stationsA.length; clusterI += 1) {
      const st = stationsA[clusterI];
      const alongM = st.along;
      const t = alongM / frame.length;
      const out = st.out;
      if (out < BOARDWALK_SEAWARD_EDGE + 1.2) continue;
      if (umbrellaBlocked(alongM, out)) continue;
      const fam = familyAt(alongM);
      const pair = familyMats[fam];
      const g = placeGroup(t, out);
      const canopyMat = pair[clusterI % 2];
      const accent = pair[1 - (clusterI % 2)];
      placeMast(g, st, canopyMat, accent, fam * 0.41 + clusterI * 0.07, '');
      this.beachUmbrellaRecords.push({
        key: `prop:beach-umbrella:${edge}:${clusterI}`,
        modelId: 'beach-umbrella',
        x: g.position.x,
        z: g.position.z,
        rotation: g.rotation.y,
        group: g,
      });
      const towelAx = 0.95 + (h01(clusterI, 7) - 0.5) * 0.6;
      const towelAz = 0.35 + (h01(clusterI, 8) - 0.5) * 0.5;
      const towelBx = -0.2 + (h01(clusterI, 9) - 0.5) * 0.7;
      const towelBz = 0.85 + (h01(clusterI, 10) - 0.5) * 0.4;
      towel(g, 1.15, 0.55, towelAx, towelAz, pair[0], 'beach-towel', 7);
      towel(g, 0.95, 0.48, towelBx, towelBz, pair[1], 'beach-towel-b', 9);
      // taste-r1 W8-E: figures come in GROUPS of 3 to 6 round the towel, one group in every sixth cluster, instead of one
      // lone sitter or lier in two clusters out of three (an even scatter at one figure per 6 to 14 m); about the same number
      // of people stand on the beach, in a third as many places. The first of the group is the sitter on
      // the towel; the rest stand, sit or lie on a ring 1.45 m (then 2.05 m) out from the towel's centre, at angles that are
      // not on the mast, the second towel, the chair or the esky.
      const chairX = -0.95 + (h01(clusterI, 23) - 0.5) * 0.9;
      const chairZ = 0.2 + (h01(clusterI, 24) - 0.5) * 0.9;
      if (clusterI % 6 === 0) {
        const groupSize = 3 + Math.floor(h01(clusterI, 61) * 4);
        const keepOut = [[0, 0, 0.7], [towelBx, towelBz, 0.95], [chairX, chairZ, 0.8], [0.55, -0.55, 0.8]];
        const roles = [
          ['sit', 'hat'], ['lie', 'towel-roll'], ['stand', 'cap'], ['sit', 'none'], ['stand', 'none'], ['lie', 'none'],
        ];
        placeBeachFigure(g, {
          x: towelAx, z: towelAz, yaw: 0.25, pose: 'sit', accessory: 'hat',
          name: `beach-sitter:${edge}:${clusterI}`, onProp: 'beach-towel', shirtMat: pair[0],
        });
        let placed = 1;
        const turn0 = h01(clusterI, 62) * Math.PI * 2;
        for (let step = 0; step < 16 && placed < groupSize; step += 1) {
          const ring = step < 8 ? 1.45 : 2.05;
          const ang = turn0 + (step % 8) * (Math.PI * 2 / 8) + (step < 8 ? 0 : Math.PI / 8);
          const fx = towelAx + Math.cos(ang) * ring;
          const fz = towelAz + Math.sin(ang) * ring;
          if (keepOut.some(([kx, kz, kr]) => Math.hypot(fx - kx, fz - kz) < kr)) continue;
          const [pose, accessory] = roles[placed % roles.length];
          placeBeachFigure(g, {
            x: fx, z: fz, yaw: Math.atan2(towelAx - fx, towelAz - fz) + (h01(clusterI * 7 + placed, 63) - 0.5) * 0.9,
            pose, accessory, name: `beach-group:${edge}:${clusterI}:${placed}`,
            onProp: pose === 'stand' ? null : 'beach-towel', shirtMat: pair[placed % 2],
          });
          placed += 1;
        }
      }
      // Chairs sit at odd headings rather than square to the water.
      const towardWater = h01(clusterI, 21) < 0.20;
      placeChair(g, chairX, chairZ,
        towardWater, timber);
      chairIndex += 1;
      box(g, 0.55, 0.38, 0.4, 0.55, GND - 0.03, -0.55, blue, 'beach-esky');
      box(g, 0.55, 0.06, 0.4, 0.55, GND + 0.35, -0.55, white, 'beach-esky-lid');
      registerBeachProp(g, {
        name: `beach-esky:${edge}:${clusterI}`, kind: 'bin', x: 0.55, z: -0.55,
        width: 0.55, depth: 0.4, groundY: GND,
      });
      towel(g, 1.2, 0.52, 2.2 + (h01(clusterI, 12) - 0.5) * 0.8,
        -0.35, pair[clusterI % 2], 'beach-towel-fill', 12);
      if (h01(clusterI, 25) > 0.4) {
        placeChair(g, -2.0 + (h01(clusterI, 26) - 0.5) * 1.1, -0.45 + (h01(clusterI, 27) - 0.5) * 1.1,
          h01(clusterI, 22) < 0.20, canopyMat);
        chairIndex += 1;
      }
    }
    for (let clusterI = 0; clusterI < stationsB.length; clusterI += 1) {
      const st = stationsB[clusterI];
      const alongM = st.along;
      const t = alongM / frame.length;
      const out = st.out;
      if (out < BOARDWALK_SEAWARD_EDGE + 1.2) continue;
      if (umbrellaBlocked(alongM, out)) continue;
      const fam = familyAt(alongM);
      const pair = familyMats[fam];
      const g = placeGroup(t, out);
      const canopyMat = pair[0];
      placeMast(g, st, canopyMat, pair[1], fam * 0.31 + clusterI * 0.11, '-row-b');
      this.beachUmbrellaRecords.push({
        key: `prop:beach-umbrella:${edge}:b${clusterI}`,
        modelId: 'beach-umbrella',
        x: g.position.x,
        z: g.position.z,
        rotation: g.rotation.y,
        group: g,
      });
      towel(g, 1.2, 0.56, 1.05 + (h01(clusterI, 17) - 0.5) * 0.7,
        0.32, pair[1], 'beach-towel-row-b', 17);
      box(g, 0.58, 0.4, 0.42, -0.72, GND - 0.03, -0.42, yellow, 'beach-esky-row-b');
      registerBeachProp(g, {
        name: `beach-esky:${edge}:b${clusterI}`, kind: 'bin', x: -0.72, z: -0.42,
        width: 0.58, depth: 0.42, groundY: GND,
      });
      if (st.bare) {
        // A group without an umbrella still has to be a group: a second towel,
        // a bag and a board pushed into the sand.
        towel(g, 1.1, 0.5, -1.4, 0.7, pair[0], 'beach-towel-bare', 19);
        box(g, 0.42, 0.3, 0.32, -0.55, GND - 0.03, 1.15, coral, 'beach-bag');
        registerBeachProp(g, {
          name: `beach-bag:${edge}:b${clusterI}`, kind: 'debris', x: -0.55, z: 1.15,
          width: 0.42, depth: 0.32, groundY: GND,
        });
        // Driven in, with a ring of thrown sand at its foot.
        box(g, 0.16, 1.62, 0.06, 1.5, GND - 0.03, -0.5, yellow, 'beach-board-upright');
        cyl(g, 0.16, 0.24, 0.05, 1.5, GND - 0.02, -0.5, sandRingMat, 'beach-board-ring', 8);
        registerBeachProp(g, {
          name: `beach-board-upright:${edge}:b${clusterI}`, kind: 'board', x: 1.5, z: -0.5,
          width: 0.16, depth: 0.06, groundY: GND,
        });
      }
    }
    void chairIndex;
    // Surfboard rack near lifeguard
    {
      const g = placeGroup(0.58, 12.5);
      box(g, 0.12, 1.4, 0.12, -0.4, 0.06, 0, timber, 'board-rack-L');
      box(g, 0.12, 1.4, 0.12, 0.4, 0.06, 0, timber, 'board-rack-R');
      // The rail spans BETWEEN the posts, so it is carried by them; the
      // boards stand on the sand and lean on the rail rather than hovering.
      box(g, 0.98, 0.1, 0.14, 0, 0.7, 0, timber, 'board-rack-rail');
      for (const [boardI, ox] of [-0.25, 0, 0.25].entries()) {
        box(g, 0.18, 1.55, 0.10, ox, GND - 0.03, 0.10, yellow, 'surfboard');
        registerBeachProp(g, {
          name: `surfboard:${edge}:${boardI}`, kind: 'board', x: ox, z: 0.10,
          width: 0.18, depth: 0.10, groundY: GND,
        });
      }
    }
    // Second board stack + beach bins
    {
      const g = placeGroup(0.38, 11.5);
      box(g, 0.1, 1.2, 0.1, -0.3, 0.06, 0, timber, 'board-rack2-L');
      box(g, 0.1, 1.2, 0.1, 0.3, 0.06, 0, timber, 'board-rack2-R');
      box(g, 0.78, 0.08, 0.12, 0, 0.55, 0, timber, 'board-rack2-rail');
      box(g, 0.16, 1.35, 0.09, -0.15, GND - 0.03, 0.09, coral, 'surfboard-b');
      box(g, 0.16, 1.35, 0.09, 0.15, GND - 0.03, 0.09, blue, 'surfboard-c');
      for (const [boardI, ox] of [-0.15, 0.15].entries()) {
        registerBeachProp(g, {
          name: `surfboard-stack:${edge}:${boardI}`, kind: 'board', x: ox, z: 0.09,
          width: 0.16, depth: 0.09, groundY: GND,
        });
      }
    }
    for (const t of [0.22, 0.55, 0.78]) {
      const g = placeGroup(t, 8.2);
      cyl(g, 0.28, 0.32, 0.85, 0, GND - 0.03, 0, metal, 'beach-bin', 8);
      box(g, 0.55, 0.08, 0.55, 0, GND + 0.82, 0, stripe, 'beach-bin-lid');
      registerBeachProp(g, {
        name: `beach-bin:${edge}:${t}`, kind: 'bin', width: 0.64, depth: 0.64,
        groundY: GND,
      });
    }

    // Outdoor shower / wash facility
    {
      const pad = get('concrete', { variant: 'beach-pad', color: '#9a968e' });
      const g = placeGroup(0.5, 7.2);
      box(g, 1.1, 0.12, 1.1, 0, 0.08, 0, pad, 'shower-pad');
      box(g, 0.12, 2.2, 0.12, 0, 0.15, 0, metal, 'shower-post');
      box(g, 0.55, 0.10, 0.10, 0.2, 2.14, 0, metal, 'shower-arm');
      cyl(g, 0.09, 0.06, 0.14, 0.42, 2.02, 0, metal, 'shower-head', 8);
    }
    // Second shower near far bay
    {
      const pad = get('concrete', { variant: 'beach-pad-b', color: '#9a968e' });
      const g = placeGroup(0.22, 7.0);
      box(g, 1.0, 0.1, 1.0, 0, 0.08, 0, pad, 'shower-pad-b');
      box(g, 0.1, 2.0, 0.1, 0, 0.12, 0, metal, 'shower-post-b');
      box(g, 0.45, 0.09, 0.09, 0.18, 1.94, 0, metal, 'shower-arm-b');
    }

    // ------------------------------------------------------------------
    // Esplanade PLANTER BOXES — V3.31 lane D.
    //
    // Built as a boarded timber tub rather than four mitred panels: four board
    // courses land on four corner cleats and two mid cleats, every course is
    // bolted to its cleat, a chamfered capping rail finishes the top, and the
    // tub stands on two bearers so a real dark line separates it from the deck.
    // Soil sits ~110 mm below the cap and shows as depth; the planting — lumpy
    // domes plus strap-leaf fans — out-reads the timber and lets sky through
    // at its edges. Wear is directed: bleached boards on the weather side, a
    // darker damp band at the bottom course, spilled soil on the boards.
    //
    // Each tub is its own THREE.Group of five InstancedMesh batches (timber,
    // metal, soil, dome foliage, blade foliage). That is five draw calls per
    // tub for ~100 parts instead of one call per part, and it lets the mischief
    // layer hide / restore one tub without touching its neighbours.
    // ------------------------------------------------------------------
    const PL_W = 1.62;              // along shore
    const PL_D = 0.88;              // seaward
    // r1 carried the tub on 38 mm bearers tinted near-black, which read as an unlit slot
    // rather than as timber. The runner is now 72 mm and carries its own timber value.
    const PL_BEARER_H = 0.072;
    const PL_COURSES = 4;
    const PL_BOARD_H = 0.104;
    const PL_BOARD_GAP = 0.019;
    const PL_BOARD_T = 0.055;
    const PL_CLEAT = 0.115;
    const PL_CLEAT_PROUD = 0.030;
    const PL_BODY_TOP = PL_BEARER_H
      + PL_COURSES * PL_BOARD_H + (PL_COURSES - 1) * PL_BOARD_GAP;
    const PL_CAP_H = 0.052;
    const PL_CAP_W = 0.165;
    const PL_CAP_OUT = PL_CLEAT_PROUD + 0.048;
    // Bed level. r1 dropped the soil 105 mm below the top board, which put the whole
    // planting mass behind the capping rail from any board-height camera: measured on the
    // r2a plate, more than half the leaf lumps had their centres below the rim and the
    // tub read as a tray with a few sprigs in it. A filled tub carries its soil close
    // under the rail and its planting proud of it, which is what the reference shows.
    const PL_SOIL_TOP = PL_BODY_TOP - 0.062;
    const PL_CAP_X = PL_W * 0.5 + PL_CAP_OUT;
    const PL_CAP_Z = PL_D * 0.5 + PL_CAP_OUT;
    // The object's own height, cap chamfer included. Planting is budgeted against it:
    // the reference's mounds top out between 1.0 and 1.3 of this.
    const PL_TUB_H = PL_BODY_TOP + PL_CAP_H + 0.026;
    const PL_BED_X = PL_W * 0.5 - PL_BOARD_T;   // inside face of the end boards
    const PL_BED_Z = PL_D * 0.5 - PL_BOARD_T;

    // Shared batch geometries — authored once, placed by instance matrix.
    const plBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const plDomeGeo = buildShrubLobe();                        // 20 tri lobe, jittered, occluded underside
    const plBladeGeo = new THREE.ConeGeometry(0.5, 1, 3);      // 6 tri strap leaf
    {
      // The leaf material now reads vertex colour (lobe occlusion), so blades carry theirs: dark at the root.
      const bp = plBladeGeo.attributes.position;
      const bc = new Float32Array(bp.count * 3);
      for (let i = 0; i < bp.count; i += 1) {
        const k = 0.62 + 0.38 * Math.min(1, Math.max(0, bp.getY(i) + 0.5));
        bc[i * 3] = k; bc[i * 3 + 1] = k; bc[i * 3 + 2] = k;
      }
      plBladeGeo.setAttribute('color', new THREE.BufferAttribute(bc, 3));
    }
    // Coach-bolt heads. r1 drew them as 12-triangle cubes standing proud of the cleat,
    // which read as twelve pale stickers and pulled the eye off the planting. A seven
    // segment disc laid flat on the cleat face is round, is five triangles cheaper than
    // the cube it replaces, and is flush by construction.
    const plRivetGeo = new THREE.CircleGeometry(0.5, 7);       // 7 tri round rivet
    {
      // Polyhedron geometry is non-indexed with per-face normals, so a 20-face lump
      // shades as a cut gemstone however it is coloured — that is what the r1 plate
      // showed. Spherical normals keep the ragged silhouette and give the soft
      // rounded shading the reference planting has, for no extra triangles.
      const pos = plDomeGeo.attributes.position;
      const nrm = plDomeGeo.attributes.normal;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i).normalize();
        nrm.setXYZ(i, v.x, v.y, v.z);
      }
      nrm.needsUpdate = true;
    }
    for (const geo of [plBoxGeo, plDomeGeo, plBladeGeo, plRivetGeo]) {
      MaterialLibrary.ensureUv2(geo);
      this._disposables.push(geo);
    }
    const PL_IDENT = new THREE.Quaternion();
    const plPushBox = (list, x, y, z, sx, sy, sz, tint, q = PL_IDENT) => {
      list.push({
        p: new THREE.Vector3(x, y, z),
        q,
        s: new THREE.Vector3(sx, sy, sz),
        c: tint,
      });
    };
    const plYaw = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
    const plBuildBatch = (parent, geometry, material, name, list, receive = true) => {
      if (!list.length) return null;
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      const matrix = new THREE.Matrix4();
      const colour = new THREE.Color();
      for (let i = 0; i < list.length; i += 1) {
        const item = list[i];
        matrix.compose(item.p, item.q, item.s);
        mesh.setMatrixAt(i, matrix);
        colour.setRGB(item.c[0], item.c[1], item.c[2]);
        mesh.setColorAt(i, colour);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = receive;
      mesh.name = name;
      parent.add(mesh);
      return mesh;
    };
    // Every batch material is white with its family map, so an instance tint is the
    // whole albedo and the values below are the target colour divided by the map's
    // own mean — the painted_metal grain is warm cream and the timber grain is a
    // saturated orange-brown, and a tint authored as if the base were neutral comes
    // out of both of them dark and red.
    // Values below are measured off the first plate rather than derived on paper: an
    // earlier pass divided the target colour by the map's mean and came out two stops
    // high and cream, because the key and the env carry far more of the final pixel
    // than the albedo does. Tuned so the boards sit clearly under the deck planks and
    // the capping rail clearly over them.
    const PL_TINT = Object.freeze({
      cap: [0.90, 0.58, 0.31],          // pale tan capping rail, lightest value
      chamfer: [1.03, 0.72, 0.44],      // bevel catching the key
      board: [0.33, 0.147, 0.062],      // warm mid-brown board face
      boardSea: [0.53, 0.34, 0.18],     // salt-bleached weather side
      boardEnd: [0.39, 0.20, 0.089],
      damp: [0.084, 0.049, 0.027],      // wet band where boards meet the deck
      cleat: [0.19, 0.085, 0.039],
      // Runner: a timber value of its own, between the cleat and the damp band, so the
      // eye reads two bearers under the tub instead of a black slot.
      bearer: [0.155, 0.076, 0.034],
      // Contact. r1's patches sampled brighter than the deck and overhung the tub in two
      // directions; both are now inside the footprint and well below the deck value.
      contactOuter: [0.040, 0.028, 0.021],
      contactInner: [0.011, 0.0075, 0.0055],
      // Fixings sit within about a tenth of the board face rather than four times it.
      bolt: [0.30, 0.26, 0.21],
      bracket: [0.115, 0.115, 0.125],
      soil: [0.0090, 0.0042, 0.0018],   // dark damp potting mix, bottom of the ladder
      soilDry: [0.016, 0.0080, 0.0034],
      soilSpill: [0.026, 0.014, 0.0075],
    });
    // Planting palette. Two things changed after r1: the family, and the hues.
    //
    // FAMILY. r1 drove the planting through `concrete` to escape the clearcoat on
    // `painted_metal`. Concrete's map is a neutral grey with envBase 0.75, so a sky-blue
    // environment supplied most of the chroma and every leaf tint arrived on the plate
    // pulled toward teal and periwinkle whatever the albedo said. `foliage` has a green
    // leaf map, envBase 0.55 and no coat, so a tint here multiplies a green rather than
    // competing with the sky, and the map's own clump noise gives the mass some shading.
    //
    // HUES. Tints below are multipliers over that green map (mean ≈ 0.26/0.46/0.21), not
    // absolute albedo. Blue and lavender are out of the leaf table entirely and survive
    // only as flower heads carried on a green mound, which is what the reference does.
    const PL_SPECIES = [
      { c: [1.80, 1.42, 1.18], squat: 0.80 },  // silver-sage coastal rosemary, palest
      { c: [1.42, 1.34, 0.34], squat: 0.86 },  // bright yellow-green
      { c: [0.66, 0.98, 0.46], squat: 0.84 },  // mid grass green
      { c: [0.20, 0.40, 0.24], squat: 0.90 },  // deep green, darkest
      { c: [1.06, 0.82, 0.60], squat: 0.82 },  // olive eucalypt
      { c: [0.40, 0.70, 0.32], squat: 0.88 },  // cool mid green
    ];
    // A flowering shrub is a whole mound in flower, not petals sprinkled over a green
    // one. `c` is the massed colour of the mound, `bloom` the brighter heads on top.
    const PL_FLOWERING = [
      { c: [1.85, 0.62, 3.70], squat: 0.86, bloom: [2.40, 0.95, 4.40] },  // lavender
      { c: [2.70, 1.50, 0.32], squat: 0.86, bloom: [3.60, 1.85, 0.24] },  // yellow daisy
      { c: [1.85, 0.55, 1.30], squat: 0.84, bloom: [2.90, 0.90, 1.90] },  // pink pelargonium
    ];
    // Fallback heads if a flowering mound declares no bloom colour of its own.
    const PL_BLOOM = [
      [3.30, 1.50, 0.30],   // yellow
      [1.34, 0.44, 2.80],   // violet
      [3.05, 1.72, 3.10],   // cream white
    ];
    const PL_BLADE = [0.34, 0.66, 0.18];

    const planterSea = BOARDWALK_SEAWARD_EDGE - 1.05;
    // Board.js seaward stair bays ≈ 0.225 / 0.5 / 0.775 (+ mid pier). Keep clear.
    const stairAlongTs = [0.225, 0.5, 0.775];
    const clearStairOrPier = (t) => stairAlongTs.some((s) => Math.abs(t - s) < 0.09);
    const planterPairHalf = 1.14 / Math.max(1, frame.length);
    let planterIndex = 0;
    for (const t of [0.1, 0.18, 0.34, 0.42, 0.58, 0.66, 0.82, 0.9]) {
      if (clearStairOrPier(t)) continue;
      // A real esplanade run is a repeated unit set out in pairs. Tub dimensions
      // never vary; timber tone, planting mix and mass heights do (V331 §2c).
      for (const pairSide of [-1, 1]) {
        const idx = planterIndex;
        planterIndex += 1;
        const rng = makeRng(hashSeed(`v331:esplanade-planter:${edge}:${idx}`));
        const g = placeGroup(t + pairSide * planterPairHalf, planterSea, DECK_TOP_Y);
        g.name = `esplanade-planter:${edge}:${idx}`;
        // Set-out yaw. r1's ±1.6° was below the threshold at which two tubs of a pair
        // read as separately placed; ±5° is a tub someone nudged and nobody squared up.
        g.rotation.y += (rng() - 0.5) * 0.175;

        // Per-tub materials so a mischief repair tint touches one tub only.
        const tubTimber = get('timber', {
          variant: `planter-timber-${edge}-${idx}`,
          color: '#ffffff',
          roughness: 0.86,
          metalness: 0,
        });
        const tubMetal = get('painted_metal', {
          variant: `planter-metal-${edge}-${idx}`,
          color: '#ffffff',
          roughness: 0.46,
          metalness: 0.55,
        });
        const tubSoil = get('sand', {
          variant: `planter-soil-${edge}-${idx}`,
          color: '#ffffff',
          roughness: 0.98,
          metalness: 0,
        });
        // Planting takes the foliage family. `painted_metal` carries a clearcoat the
        // library gives no way to disable and washed every green to pastel mint; the r1
        // fallback to `concrete` removed the coat but left a neutral map under a 0.75 env
        // multiplier, so the blue sky supplied the chroma and the plate came back teal.
        // `foliage` is a green leaf map at envBase 0.55 with no coat.
        const tubLeaf = get('foliage', {
          variant: `planter-leaf-${edge}-${idx}`,
          color: '#ffffff',
          roughness: 0.93,
          metalness: 0,
        });
        tubLeaf.vertexColors = true;
        tubLeaf.needsUpdate = true;

        const timberList = [];
        const metalList = [];
        const soilList = [];
        const domeList = [];
        const bladeList = [];

        // Per-tub timber tone. Dimensions never vary across the run; tone does.
        const tone = 0.86 + rng() * 0.30;
        const scale3 = (tint, k) => [tint[0] * k, tint[1] * k, tint[2] * k];

        // Contact. Two nested patches seat the tub, both now INSIDE the footprint and
        // both well under the deck's own value: r1 laid them 150 mm proud of the tub on
        // every side at a lightness that sampled above the boards they sat on, which put
        // a pale hard-edged card under a dark object. The inner one doubles as the floor
        // of the runner gap, so the underside reads as an occluded junction rather than
        // as an unlit void with fixings floating in it.
        plPushBox(timberList, 0, 0.005, 0.008, PL_W + 0.050, 0.010, PL_D + 0.042,
          PL_TINT.contactOuter);
        // Bearers — two runners the tub is carried on, at their own timber value, laid
        // ALONG the tub rather than across it. Across it they left a 72 mm slot open the
        // whole length of both long faces, and the r2a base crop showed daylight and the
        // boardwalk's own understructure straight through the gap under the boards.
        for (const bz of [-1, 1]) {
          plPushBox(timberList, 0, PL_BEARER_H * 0.5, bz * (PL_D * 0.5 - 0.215),
            PL_W - 0.06, PL_BEARER_H, 0.395,
            scale3(PL_TINT.bearer, tone * 0.92));
        }

        // Board courses. Wear is directed rather than uniform (V331 2.7): the salt-dry
        // bleach on the weather side climbs with height because that is where the sun
        // and the wind reach, the damp band sits on the bottom course and the runner
        // where the deck holds water, and each course carries its own small value
        // scatter so four boards are not four identical fills.
        for (let course = 0; course < PL_COURSES; course += 1) {
          const y = PL_BEARER_H + course * (PL_BOARD_H + PL_BOARD_GAP) + PL_BOARD_H * 0.5;
          const grain = tone * (0.90 + rng() * 0.21);
          const damp = course === 0 ? 1 : course === 1 ? 0.55 : 0;
          const bleach = 0.30 + 0.70 * (course / (PL_COURSES - 1));
          const blend = (dry) => (damp === 0 ? scale3(dry, grain) : [
            (dry[0] * (1 - damp) + PL_TINT.damp[0] * damp) * grain,
            (dry[1] * (1 - damp) + PL_TINT.damp[1] * damp) * grain,
            (dry[2] * (1 - damp) + PL_TINT.damp[2] * damp) * grain,
          ]);
          const seaDry = [
            PL_TINT.board[0] * (1 - bleach) + PL_TINT.boardSea[0] * bleach,
            PL_TINT.board[1] * (1 - bleach) + PL_TINT.boardSea[1] * bleach,
            PL_TINT.board[2] * (1 - bleach) + PL_TINT.boardSea[2] * bleach,
          ];
          plPushBox(timberList, 0, y, PL_D * 0.5 - PL_BOARD_T * 0.5,
            PL_W, PL_BOARD_H, PL_BOARD_T, blend(seaDry));
          plPushBox(timberList, 0, y, -PL_D * 0.5 + PL_BOARD_T * 0.5,
            PL_W, PL_BOARD_H, PL_BOARD_T, blend(PL_TINT.board));
          for (const sx of [-1, 1]) {
            plPushBox(timberList, sx * (PL_W * 0.5 - PL_BOARD_T * 0.5), y, 0,
              PL_BOARD_T, PL_BOARD_H, PL_D - PL_BOARD_T * 2, blend(PL_TINT.boardEnd));
          }
        }

        // Cleats carry the boards: four corners, plus a mid cleat that is present on some
        // tubs and absent on others so two tubs of a visible pair differ in outline and
        // not only in tone (V331 2c).
        const cleatTint = scale3(PL_TINT.cleat, tone);
        const cleatX = PL_W * 0.5 + PL_CLEAT_PROUD - PL_CLEAT * 0.5;
        const cleatZ = PL_D * 0.5 + PL_CLEAT_PROUD - PL_CLEAT * 0.5;
        const midCleats = rng() < 0.5;
        const cleatSpots = [
          [-cleatX, cleatZ], [cleatX, cleatZ],
          [-cleatX, -cleatZ], [cleatX, -cleatZ],
        ];
        if (midCleats) cleatSpots.push([0, cleatZ], [0, -cleatZ]);
        for (const [cx, cz] of cleatSpots) {
          // Cleats run all the way to the deck, so the tub stands on its own corners and
          // the eye can follow timber from the capping to the boards it rests on.
          plPushBox(timberList, cx, PL_BODY_TOP * 0.5, cz,
            PL_CLEAT, PL_BODY_TOP, PL_CLEAT, cleatTint);
          // Coach bolt heads: round rivets set flat into the cleat face, not cubes on it.
          const face = cz > 0 ? 1 : -1;
          const boltZ = face * (PL_D * 0.5 + PL_CLEAT_PROUD + 0.002);
          const boltQ = plYaw(face > 0 ? 0 : Math.PI);
          for (const by of [PL_BEARER_H + 0.085, PL_BEARER_H + 0.315]) {
            plPushBox(metalList, cx, by, boltZ, 0.021, 0.021, 1, PL_TINT.bolt, boltQ);
          }
        }
        // Deck fixing angles — the tub is bolted down, not resting loose. Galvanised, and
        // dark enough that they read as ironmongery rather than as the brightest mark.
        for (const bx of [-1, 1]) {
          plPushBox(timberList, bx * (PL_W * 0.5 - 0.13), 0.030, PL_D * 0.5 - 0.045,
            0.115, 0.060, 0.075, PL_TINT.bracket);
        }

        // Capping rail with a chamfer strip on top — the lightest value on the tub.
        const capY = PL_BODY_TOP + PL_CAP_H * 0.5;
        const chamY = PL_BODY_TOP + PL_CAP_H + 0.013;
        const capTint = scale3(PL_TINT.cap, tone);
        const chamTint = scale3(PL_TINT.chamfer, tone);
        for (const zs of [1, -1]) {
          plPushBox(timberList, 0, capY, zs * (PL_CAP_Z - PL_CAP_W * 0.5),
            PL_CAP_X * 2, PL_CAP_H, PL_CAP_W, capTint);
          plPushBox(timberList, 0, chamY, zs * (PL_CAP_Z - 0.026 - (PL_CAP_W - 0.052) * 0.5),
            PL_CAP_X * 2 - 0.052, 0.026, PL_CAP_W - 0.052, chamTint);
        }
        for (const xs of [-1, 1]) {
          plPushBox(timberList, xs * (PL_CAP_X - PL_CAP_W * 0.5), capY, 0,
            PL_CAP_W, PL_CAP_H, PL_CAP_Z * 2 - PL_CAP_W * 2, capTint);
          plPushBox(timberList, xs * (PL_CAP_X - 0.026 - (PL_CAP_W - 0.052) * 0.5), chamY, 0,
            PL_CAP_W - 0.052, 0.026, PL_CAP_Z * 2 - PL_CAP_W * 2, chamTint);
        }
        // Chipped arris. A short length of the capping bevel is knocked back to bare
        // timber on one corner — one directed effect, in material and a 26 mm step, not a
        // grime layer. Which corner is a property of the tub, so two of a pair differ.
        {
          const chipX = (rng() < 0.5 ? -1 : 1) * (PL_CAP_X - 0.34 - rng() * 0.22);
          const chipZ = (rng() < 0.5 ? 1 : -1) * (PL_CAP_Z - 0.026 - (PL_CAP_W - 0.052) * 0.5);
          plPushBox(timberList, chipX, chamY - 0.009, chipZ,
            0.13 + rng() * 0.08, 0.011, PL_CAP_W - 0.052,
            scale3(PL_TINT.boardSea, tone * 1.22));
        }

        // Soil: a recessed bed below the rim, at the bottom of the object's value ladder.
        // r1 put three 34 mm slabs on the bed which read from above as a straight seam and
        // a second rectangle stepped proud of the first. The crumb is now 12 mm, yawed off
        // the tub's own axes so no edge runs parallel to the rim, and once the planting
        // lands the bed shows only as dark gaps between mounds, which is the point.
        plPushBox(soilList, 0, PL_SOIL_TOP - 0.055, 0,
          PL_W - PL_BOARD_T * 2 - 0.02, 0.11, PL_D - PL_BOARD_T * 2 - 0.02, PL_TINT.soil);
        for (let m = 0; m < 3; m += 1) {
          plPushBox(soilList,
            (rng() - 0.5) * 1.0, PL_SOIL_TOP - 0.002 + rng() * 0.006, (rng() - 0.5) * 0.36,
            0.20 + rng() * 0.16, 0.012, 0.13 + rng() * 0.08,
            scale3(PL_TINT.soilDry, 0.86 + rng() * 0.30),
            plYaw((rng() - 0.5) * 1.1));
        }
        // Spilled soil on the boards — honest, directed wear on part of the run. Thin,
        // small, set across the plank grooves and yawed, so it reads as swept crumb
        // rather than as the flat brown card r1 laid on the deck.
        if (rng() < 0.55) {
          for (let s = 0; s < 3; s += 1) {
            const side = s === 1 ? -1 : 1;
            plPushBox(soilList,
              side * (PL_W * 0.34 + rng() * 0.34), 0.008,
              PL_D * 0.5 + 0.09 + rng() * 0.16,
              0.075 + rng() * 0.075, 0.007, 0.055 + rng() * 0.055,
              scale3(PL_TINT.soilSpill, 0.9 + rng() * 0.3),
              plYaw((rng() - 0.5) * 1.6));
          }
        }

        // ----------------------------------------------------------------
        // Planting. This is the rebuild r2 exists for.
        //
        // r1 drew each shrub as three or four large lumps on a thin straight stalk, so
        // enlarged, every mass was a near-2D polygon with straight silhouette edges
        // balanced on a wire, and roughly 40 % of the bed carried nothing. Overwriting
        // the icosahedron's normals fixed how one lump *shades*; it could not change
        // what a 20-face solid at that screen size *outlines* as.
        //
        // A mound here is 7 to 9 small lumps seated on the soil and overlapping each
        // other — a core carrying the mass, a skirt sitting down into the bed, and one
        // or two crown lumps breaking the top. No lump is more than about a sixth of the
        // tub's height, so no single polygon edge is what the eye resolves; what it
        // resolves is the bumpy outline of the aggregate. Mounds touch their neighbours
        // and overhang the capping, so the bed is covered end to end and reads as
        // planting rather than as objects standing in a tray.
        // ----------------------------------------------------------------
        const baseY = PL_SOIL_TOP;
        // Mound count, radius, crown height and species mix all come off the tub's own
        // hash, so two tubs of a pair differ in OUTLINE and not only in colour.
        const moundCount = rng() < 0.5 ? 5 : 6;
        const lumpsPer = moundCount === 5 ? 6 : 5;
        const speciesPool = PL_SPECIES.map((_, i) => i);
        const speciesOrder = [];
        for (let s = 0; s < moundCount; s += 1) {
          speciesOrder.push(
            speciesPool.length
              ? speciesPool.splice(Math.floor(rng() * speciesPool.length), 1)[0]
              : Math.floor(rng() * PL_SPECIES.length),
          );
        }
        // One mound in the tub is a flowering shrub rather than a green one — the
        // reference does not scatter petals over foliage, it stands a whole purple or
        // yellow mass beside the greens, and that is where the tub's blue and lavender
        // are allowed to live.
        const floweringAt = Math.floor(rng() * moundCount);
        const floweringSpec = PL_FLOWERING[Math.floor(rng() * PL_FLOWERING.length)];
        const span = PL_BED_X + 0.02;          // mound centres run rim to rim
        const step = (span * 2) / moundCount;
        const mounds = [];
        for (let m = 0; m < moundCount; m += 1) {
          const spec = m === floweringAt ? floweringSpec : PL_SPECIES[speciesOrder[m]];
          const cx = -span + step * (m + 0.5) + (rng() - 0.5) * step * 0.22;
          const cz = (rng() - 0.5) * (PL_BED_Z * 0.44);
          // Mound radius is deliberately SMALLER than the lumps that fill it are large:
          // at r2b the mound was 0.24 across with 0.06 lumps in it and the soil showed
          // between every lump. Six 0.09 lumps inside a 0.15 mound overlap into one mass,
          // and mounds a step apart then overlap each other.
          const radius = step * 0.46 + 0.030 + rng() * 0.026;
          // 1.20 – 1.40 of tub height at the crown, measured off the deck. Below about
          // 1.2 the mass disappears behind the capping rail from a board-height camera.
          const top = PL_TUB_H * (1.20 + rng() * 0.20);
          const rise = Math.max(0.20, top - baseY);
          mounds.push({ spec, cx, cz, radius, rise });
          const phase = rng() * Math.PI * 2;
          for (let k = 0; k < lumpsPer; k += 1) {
            const core = k === 0;
            const crown = k === 1;
            // Even angular spacing round the mound, phase-rotated per mound. Golden-angle
            // placement over only five or six lumps left the skirt bunched on one side,
            // and on the r2c plan plate every tub's planting ran as a narrow ridge along
            // one long rail with the other half of the bed bare.
            const ang = core || crown
              ? phase + k * 2.39996
              : phase + ((k - 2) / Math.max(1, lumpsPer - 2)) * Math.PI * 2 + (rng() - 0.5) * 0.4;
            const off = core ? 0 : radius * (crown ? 0.18 + rng() * 0.20 : 0.62 + rng() * 0.38);
            const lr = core
              ? 0.108 + rng() * 0.022
              : crown ? 0.092 + rng() * 0.020 : 0.078 + rng() * 0.026;
            // Mound profile: full height at the centre, falling to the soil at the rim,
            // so the skirt lumps sit ON the bed instead of hovering over it.
            const fall = 1 - Math.pow(Math.min(1, off / radius), 1.7);
            const h = core ? rise * 0.50 : rise * (0.18 + 0.78 * fall) * (0.88 + rng() * 0.26);
            const q = new THREE.Quaternion().setFromEuler(
              new THREE.Euler((rng() - 0.5) * 0.7, rng() * Math.PI, (rng() - 0.5) * 0.7),
            );
            // Narrow per-lump jitter: wide jitter reads as noise and dissolves the
            // difference between one species and the next.
            const shade = 0.90 + rng() * 0.18;
            domeList.push({
              p: new THREE.Vector3(
                cx + Math.cos(ang) * off,
                baseY + h + lr * 0.42,
                // Stretched across the tub's depth, so the mass reaches both long rails
                // rather than running as a narrow ridge down the middle of the bed.
                cz + Math.sin(ang) * off * 1.72,
              ),
              q,
              s: new THREE.Vector3(lr * 2.1, lr * 2 * spec.squat, core ? lr * 2.5 : lr * 2.1),
              c: [spec.c[0] * shade, spec.c[1] * shade, spec.c[2] * shade],
            });
          }
        }
        // Three bright flower heads on the flowering mound, the last touch of colour.
        {
          const host = mounds[floweringAt];
          const bloomHue = floweringSpec.bloom ?? PL_BLOOM[Math.floor(rng() * PL_BLOOM.length)];
          for (let b = 0; b < 3; b += 1) {
            const ang = rng() * Math.PI * 2;
            const off = host.radius * (0.10 + rng() * 0.44);
            const fall = 1 - Math.pow(Math.min(1, off / host.radius), 1.7);
            domeList.push({
              p: new THREE.Vector3(
                host.cx + Math.cos(ang) * off,
                baseY + host.rise * (0.34 + 0.66 * fall) + 0.048,
                host.cz + Math.sin(ang) * off * 1.10,
              ),
              q: plYaw(rng() * Math.PI),
              s: new THREE.Vector3(0.070, 0.044, 0.070),
              c: bloomHue,
            });
          }
        }
        // Strap-leaf fans between the mounds — the tall ragged edge of the silhouette,
        // and what lets sky through above the planting.
        for (let fan = 0; fan < 2; fan += 1) {
          const host = mounds[Math.min(mounds.length - 1, fan === 0 ? 0 : mounds.length - 2)];
          // In the gap between two mounds, so the fan comes out of the bed rather than
          // out of the middle of a shrub.
          const fx = host.cx + step * 0.5 + (rng() - 0.5) * 0.10;
          const fz = host.cz + (rng() - 0.5) * 0.16;
          const blades = 4;
          const fanHue = [PL_BLADE[0] * (0.86 + rng() * 0.3),
            PL_BLADE[1] * (0.9 + rng() * 0.22), PL_BLADE[2] * (0.85 + rng() * 0.4)];
          for (let b = 0; b < blades; b += 1) {
            const yaw = (b / blades) * Math.PI * 2 + rng() * 0.4;
            const lean = 0.14 + rng() * 0.30;
            const h = 0.30 + rng() * 0.20;
            const q = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(0, yaw, lean, 'YZX'),
            );
            const up = new THREE.Vector3(0, h * 0.5, 0).applyQuaternion(q);
            // Broad strap leaf, not a wire: wide across the blade, thin through it.
            bladeList.push({
              p: new THREE.Vector3(fx + up.x, baseY + 0.012 + up.y, fz + up.z),
              q,
              // Thicker through the blade than r2b's 26 mm: a near-2D cone catches the
              // sky in specular and reads as a pale spike rather than as grass.
              s: new THREE.Vector3(0.082, h, 0.048),
              c: fanHue,
            });
          }
        }

        plBuildBatch(g, plBoxGeo, tubTimber, 'planter-timber', timberList);
        plBuildBatch(g, plRivetGeo, tubMetal, 'planter-metal', metalList, false);
        plBuildBatch(g, plBoxGeo, tubSoil, 'planter-soil', soilList);
        plBuildBatch(g, plDomeGeo, tubLeaf, 'planter-foliage', domeList, false);
        plBuildBatch(g, plBladeGeo, tubLeaf, 'planter-blades', bladeList, false);

        // Mischief (V331 §3a). water.js owns no board handle, so the tub rides the
        // record channel board.js already consumes with an explicit `voxelKit: null`
        // and no registration cap; the damaged kit is authored in mischief.js under
        // `esplanade-planter`, which is why the id must not read as a van.
        this.beachIcecreamRecords.push({
          key: `prop:esplanade-planter:${edge}:${idx}`,
          modelId: 'esplanade-planter',
          x: g.position.x,
          z: g.position.z,
          rotation: g.rotation.y,
          baseScale: 1,
          group: g,
        });
      }
    }

    // Bus stop on dry sand just seaward of the boardwalk (not under the deck).
    {
      const g = placeGroup(0.85, BOARDWALK_SEAWARD_EDGE + 2.4);
      // P16-W5: the posts stood on the shelter's CENTRE line while the back
      // panel, the glazing and the timetable hung 0.45 m behind them, so all
      // three had nothing under them. The posts move back to the panel line.
      box(g, 0.14, 2.4, 0.14, -1.4, 0.05, -0.45, metal, 'bus-post-L');
      box(g, 0.14, 2.4, 0.14, 1.4, 0.05, -0.45, metal, 'bus-post-R');
      box(g, 0.12, 2.4, 0.12, -1.4, 0.05, 0.5, metal, 'bus-post-FL');
      box(g, 0.12, 2.4, 0.12, 1.4, 0.05, 0.5, metal, 'bus-post-FR');
      box(g, 3.1, 0.12, 1.2, 0, 2.35, 0, metal, 'bus-roof');
      box(g, 3.0, 1.4, 0.10, 0, 0.9, -0.45, cream, 'bus-backpanel');
      box(g, 2.4, 0.9, 0.06, 0, 1.1, -0.44, white, 'bus-glazing');
      // Bench: multi-plank seat so it doesn't read as a brown bar.
      box(g, 2.5, 0.08, 0.42, 0, 0.48, 0.15, timber, 'bus-bench-plank-a');
      box(g, 2.5, 0.08, 0.42, 0, 0.48, -0.05, timber, 'bus-bench-plank-b');
      box(g, 0.1, 0.45, 0.5, -1.1, 0.08, 0.05, metal, 'bus-bench-leg-L');
      box(g, 0.1, 0.45, 0.5, 1.1, 0.08, 0.05, metal, 'bus-bench-leg-R');
      box(g, 0.55, 0.7, 0.06, 1.36, 1.1, -0.45, yellow, 'bus-timetable');
      cyl(g, 0.22, 0.25, 0.7, -1.7, 0.08, 0.35, metal, 'bus-bin', 8);
    }
    // Kiosk / beach cafe hatch on dry sand
    {
      const g = placeGroup(0.56, 9.0);
      const kiosk = buildKiosk();
      const at = (mesh) => { mesh.position.y = GND; return mesh; };
      at(addGeo(g, kiosk.wall, vcMat('painted_metal', { variant: 'kiosk-cream-r12', color: '#c6c0b5', roughness: 0.84 }), 'kiosk-body'));
      at(addGeo(g, kiosk.roof, vcMat('painted_metal', { variant: 'kiosk-roof-r12', color: '#887570', roughness: 0.84 }), 'kiosk-roof'));
      at(addGeo(g, kiosk.awning, vcMat('painted_metal', { variant: 'kiosk-awning-r12', color: '#c9c6bd', roughness: 0.84 }), 'kiosk-awning'));
      at(addGeo(g, kiosk.timber, vcMat('timber', { variant: 'kiosk-counter-r12', color: '#81766a' }), 'kiosk-counter'));
      at(addGeo(g, kiosk.metal, vcMat('painted_metal', { variant: 'kiosk-metal-r12', color: '#4a4a48', roughness: 0.45, metalness: 0.5 }), 'kiosk-metal'));
      at(addGeo(g, kiosk.sign, vcMat('painted_metal', { variant: 'kiosk-sign-r12', color: '#9b8980', roughness: 0.84 }), 'kiosk-sign'));
    }
    // Volleyball net mid-beach — four players mid-rally.
    {
      const g = placeGroup(0.7, 17.5);
      g.name = `beach-volleyball:${edge}`;
      const court = buildVolleyball();
      const atGnd = (mesh) => { mesh.position.y = GND; return mesh; };
      atGnd(addGeo(g, court.metal, vcMat('painted_metal', { variant: 'volley-metal-r12', color: '#4a4a48', roughness: 0.45, metalness: 0.5 }), 'volley-posts'));
      atGnd(addGeo(g, court.net, vcMat('painted_metal', { variant: 'volley-net-r12', color: '#c9c6bd', roughness: 0.84 }), 'volley-net'));
      atGnd(addGeo(g, court.line, vcMat('painted_metal', { variant: 'volley-line-r12', color: '#c9c6bd', roughness: 0.9 }), 'volley-court-lines', { cast: false }));
      const toyPerson = (parent, x, z, yaw, shirtMat, pose, name) => {
        const kit = pickFigureKit(name, {
          pose: pose === 'spike' || pose === 'jump' || pose === 'dig' ? 'point' : 'stand',
          accessory: pose === 'set' ? 'cap' : 'hat',
        });
        const fig = createI4FigureGroup({
          ...kit,
          wardrobe: 'swimwear',
          palette: { ...kit.palette, upper: shirtMat.color },
          name,
        });
        fig.position.set(x, localSectionDrop(parent, x, z), z);
        fig.rotation.y = yaw;
        parent.add(fig);
        const c = Math.cos(parent.rotation.y);
        const sn = Math.sin(parent.rotation.y);
        p17BeachFigures.push({
          id: name, name,
          x: parent.position.x + x * c + z * sn,
          z: parent.position.z - x * sn + z * c,
          pose: kit.pose, accessory: kit.accessory,
          build: kit.build, paletteId: kit.palette.id, width: 0.5, onProp: null,
        });
        return fig;
      };
      toyPerson(g, -2.4, 1.6, 0.15, yellow, 'spike', 'volley-player-0');
      toyPerson(g, -1.1, 2.2, -0.2, coral, 'set', 'volley-player-1');
      toyPerson(g, 1.6, -1.8, Math.PI + 0.25, blue, 'dig', 'volley-player-2');
      toyPerson(g, 2.8, -1.2, Math.PI - 0.1, clothRed, 'jump', 'volley-player-3');
      // H1BR4: cut the detached ball; the grounded I4 pose has no hand attachment.
    }

    // Sandcastles — three piles, never in a line.
    {
      const spots = [
        [0.18, 14.2],
        [0.31, 19.4],
        [0.63, 15.6],
      ];
      for (let i = 0; i < spots.length; i += 1) {
        const [t, sea] = spots[i];
        if (inP13Corner(t * frame.length, sea)) continue;
        const g = placeGroup(t, sea);
        g.name = `beach-sandcastle:${edge}:${i}`;
        const sand = get('sand', { variant: `castle-${edge}-${i}`, color: '#e2c48a', roughness: 0.96 });
        cyl(g, 0.55, 0.72, 0.42, 0, 0.06, 0, sand, 'castle-keep', 8);
        cyl(g, 0.18, 0.28, 0.35, -0.4, 0.06, 0.25, sand, 'castle-turret-a', 6);
        cyl(g, 0.16, 0.24, 0.28, 0.38, 0.06, -0.2, sand, 'castle-turret-b', 6);
        cyl(g, 0.12, 0.02, 0.22, 0, 0.48, 0, sand, 'castle-spire', 6);
      }
    }

    // H1BR4: customers pause at separated spots, with eased turn idles.
    {
      const g = placeGroup(0.56, 11.2);
      g.name = `beach-kiosk-queue:${edge}`;
      const shirts = [clothRed, clothBlue, clothYellow, clothCoral];
      const offsets = [
        [-1.2, 0.1, 0.1],
        [0.2, 1.6, -0.35],
        [1.7, -0.2, 0.45],
        [3.0, 1.4, -0.15],
      ];
      // W12-G: four jointed adults (coast-models.js buildFigure), each its own pose, facing the hatch.
      const poses = [
        { armL: [0.12, 0.04, 0.15], armR: [0.1, 0.5, 1.15], legL: [0.04, 0.02], legR: [-0.03, 0.06], lean: 0.04, headYaw: 0.2 },
        { armL: [0.28, -0.05, 1.05], armR: [0.1, 0.0, 0.2], legL: [0.12, 0.2], legR: [-0.08, 0.04], lean: 0.1, headYaw: -0.15 },
        { armL: [0.1, 0.1, 0.3], armR: [0.14, 0.15, 0.4], legL: [-0.06, 0.04], legR: [0.1, 0.18], lean: 0.02, headYaw: 0.35 },
        { armL: [0.35, 0.0, 1.2], armR: [0.12, 0.05, 0.2], legL: [0.0, 0.03], legR: [0.06, 0.1], lean: 0.06, headYaw: -0.3 },
      ];
      const builds = ['slim', 'broad', 'average', 'tall'];
      if (!this._queueFigureMat) {
        this._queueFigureMat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.86, metalness: 0 });
        this._ownedMaterials.push(this._queueFigureMat);
      }
      for (let i = 0; i < offsets.length; i += 1) {
        const [lx, lz, yaw] = offsets[i];
        const name = `kiosk-queue:${i}`;
        const shirtColour = shirts[i].color;
        const geom = buildFigure({
          skin: FIGURE_SKINS[i % FIGURE_SKINS.length],
          hair: FIGURE_HAIRS[(i + 1) % FIGURE_HAIRS.length],
          shorts: FIGURE_SHORTS[(i + 2) % FIGURE_SHORTS.length],
          shirt: [shirtColour.r, shirtColour.g, shirtColour.b],
          ...poses[i],
        });
        this._disposables.push(geom);
        const customer = new THREE.Group();
        customer.name = name;
        const body = new THREE.Mesh(geom, this._queueFigureMat);
        body.name = `${name}:body`;
        body.castShadow = true;
        body.receiveShadow = true;
        customer.add(body);
        customer.position.set(lx, GND + localSectionDrop(g, lx, lz), lz);
        const faceHatch = Math.PI + yaw;
        customer.rotation.y = faceHatch;
        g.add(customer);
        const c = Math.cos(g.rotation.y);
        const sn = Math.sin(g.rotation.y);
        p17BeachFigures.push({
          id: name, name,
          x: g.position.x + lx * c + lz * sn,
          z: g.position.z - lx * sn + lz * c,
          pose: 'stand', accessory: 'none',
          build: builds[i], paletteId: `queue-${i}`, width: 0.42,
          onProp: null, kind: 'figure',
        });
        customer.userData.mischiefLive = true; // Keep the idle root through static batching.
        (this._h1bKioskIdles ??= []).push({ root: customer, yaw: faceHatch, phase: i * 1.7 });
      }
    }

    // Beach-corner cluster: umbrellas refuse z < 8, so the plate that scored
    // "cloned capsule crowd" would otherwise only see volleyball/kiosk boxes.
    {
      const g = placeGroup(0.022, 13.5);
      g.name = `beach-corner-life:${edge}`;
      towel(g, 1.2, 0.55, 0.8, 0.4, clothRed, 'beach-corner-towel-a', 3);
      towel(g, 1.05, 0.5, -0.7, 0.9, clothBlue, 'beach-corner-towel-b', 5);
      placeBeachFigure(g, {
        x: 0.8, z: 0.4, yaw: 0.3, pose: 'sit', accessory: 'hat',
        name: `beach-corner-sitter:${edge}`, onProp: 'beach-corner-towel-a', shirtMat: clothRed,
      });
      placeBeachFigure(g, {
        x: -0.7, z: 0.9, yaw: -0.4, pose: 'lie', accessory: 'towel-roll',
        name: `beach-corner-lier:${edge}`, onProp: 'beach-corner-towel-b', shirtMat: clothBlue,
      });
      placeBeachFigure(g, {
        x: 1.7, z: -0.6, yaw: 0.15, pose: 'stand', accessory: 'surfboard',
        name: `beach-corner-boarder:${edge}`, shirtMat: clothYellow,
      });
      placeBeachFigure(g, {
        x: -1.6, z: -0.3, yaw: 1.2, pose: 'point', accessory: 'cap',
        name: `beach-corner-pointer:${edge}`, shirtMat: clothCoral,
      });
    }

    // Swimmer heads in the wet band — only the head breaks the surface.
    {
      const wetSea = SAND_SEAWARD + WET_DEPTH * 0.32;
      for (let i = 0; i < 3; i += 1) {
        const alongT = 0.05 + i * 0.16;
        const alongM = alongT * frame.length;
        if (umbrellaBlocked(alongM, wetSea)) continue;
        const g = placeGroup(alongT, wetSea);
        g.name = `beach-swimmer:${edge}:${i}`;
        const kit = pickFigureKit(`swimmer:${edge}:${i}`, { pose: 'lie', accessory: 'cap' });
        const swimmer = createI4FigureGroup({ ...kit, name: g.name + ':figure', wardrobe: 'swimwear', pose: 'stand' });
        // Full shared anatomy is submerged; only the head clears the wet shelf.
        const bounds = new THREE.Box3().setFromObject(swimmer);
        swimmer.position.y = -bounds.max.y + 0.18;
        g.add(swimmer);
        p17BeachFigures.push({
          id: `swimmer:${edge}:${i}`, name: g.name,
          x: g.position.x, z: g.position.z,
          pose: 'lie', accessory: 'cap', build: kit.build, paletteId: kit.palette.id,
          width: 0.22, onProp: 'wet-band', kind: 'figure',
        });
      }
    }

    // A kite over the dry sand — silhouette prop, not a figure.
    {
      const g = placeGroup(0.42, 22);
      g.name = `beach-kite:${edge}`;
      const kiteMat = get('painted_metal', { variant: 'beach-kite', color: '#938078', roughness: 0.55 });
      box(g, 0.02, 1.15, 0.02, 0, 0.04, 0, metal, 'kite-line');
      box(g, 0.55, 0.55, 0.04, 0, 1.35, 0, kiteMat, 'kite-sail');
      box(g, 0.08, 0.55, 0.02, 0, 1.05, 0.02, yellow, 'kite-spine');
      placeBeachFigure(g, {
        x: 0.35, z: 0.2, yaw: 0.4, pose: 'point', accessory: 'hat',
        name: `beach-kite-flyer:${edge}`, shirtMat: clothBlue,
      });
    }

    // Beach cricket set: stumps, bat, ball, two players clear of the stumps.
    {
      const g = placeGroup(0.12, 22.5);
      g.name = `beach-cricket:${edge}`;
      for (const sx of [-0.12, 0, 0.12]) {
        box(g, 0.04, 0.62, 0.04, sx, 0.04, 0, timber, 'cricket-stump');
      }
      box(g, 0.42, 0.04, 0.04, 0, 0.66, 0, timber, 'cricket-bails');
      box(g, 0.08, 0.62, 0.04, 1.6, 0.08, 0.35, timber, 'cricket-bat');
      cyl(g, 0.05, 0.05, 0.05, 1.15, 0.08, 0.2, yellow, 'cricket-ball', 8);
      placeBeachFigure(g, {
        x: 1.35, z: 0.55, yaw: Math.PI, pose: 'stride', accessory: 'cap',
        name: `beach-cricket-batter:${edge}`, shirtMat: clothCream,
      });
      placeBeachFigure(g, {
        x: -2.4, z: 0.2, yaw: 0, pose: 'point', accessory: 'hat',
        name: `beach-cricket-bowler:${edge}`, shirtMat: clothYellow,
      });
    }

    // Footprints: thin dark ovals from the promenade stairs down to the water.
    {
      const fpMat = new THREE.MeshBasicMaterial({
        color: '#5a4634', transparent: true, opacity: 0.28, depthWrite: false,
      });
      this._ownedMaterials.push(fpMat);
      const fpGeom = new THREE.CircleGeometry(0.11, 8);
      fpGeom.rotateX(-Math.PI / 2);
      this._disposables.push(fpGeom);
      for (const stairT of [0.225, 0.5, 0.775]) {
        const n = 9 + Math.floor(h01(stairT * 10, 40) * 4);
        for (let i = 0; i < n; i += 1) {
          const sea = BOARDWALK_SEAWARD_EDGE + 0.8 + i * (1.55 + h01(i, 41 + stairT) * 0.45);
          const alongM = stairT * frame.length
            + (h01(i, 42) - 0.5) * 1.4
            + (i % 2 ? 0.22 : -0.18);
          if (inP13Corner(alongM, sea)) continue;
          if (umbrellaBlocked(alongM, sea) && sea < 10) continue;
          const g = placeGroup(alongM / frame.length, sea);
          const mesh = new THREE.Mesh(fpGeom, fpMat);
          mesh.scale.set(1.0, 1, 1.7);
          mesh.rotation.y = (h01(i, 43) - 0.5) * 0.6;
          mesh.position.y = 0.035;
          mesh.name = `beach-footprint:${edge}:${stairT}:${i}`;
          g.add(mesh);
        }
      }
    }

    const contactMesh = new THREE.InstancedMesh(
      contactGeom, contactMat, pm11ContactPlacements.length,
    );
    contactMesh.name = `nature:beach-prop-contacts:${edge}`;
    contactMesh.castShadow = false;
    contactMesh.receiveShadow = false;
    contactMesh.renderOrder = 3;
    contactMesh.frustumCulled = false;
    const contactMatrix = new THREE.Matrix4();
    const contactPosition = new THREE.Vector3();
    const contactQuaternion = new THREE.Quaternion();
    const contactScale = new THREE.Vector3();
    for (let i = 0; i < pm11ContactPlacements.length; i += 1) {
      const p = pm11ContactPlacements[i];
      contactPosition.set(p.x, p.sandY + 0.008, p.z);
      contactQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
      contactScale.set(p.contactWidth, 1, p.contactDepth);
      contactMatrix.compose(contactPosition, contactQuaternion, contactScale);
      contactMesh.setMatrixAt(i, contactMatrix);
    }
    contactMesh.instanceMatrix.needsUpdate = true;
    contactMesh.userData.pm11Contact = {
      ...BEACH_PROP_CONTACT,
      props: pm11Props.length,
      casterNames: pm11Props.map((p) => p.casterName),
    };
    life.add(contactMesh);
    const categories = {};
    for (const p of pm11Props) categories[p.kind] = (categories[p.kind] ?? 0) + 1;
    life.userData.pm11BeachProps = pm11Props;
    life.userData.pm11ContactCensus = {
      grounded: pm11Props.length,
      contacts: pm11ContactPlacements.length,
      categories,
      airborne: pm11AirborneProps,
      floatOver30mm: pm11Props.filter((p) => p.footY - p.sandY > BEACH_PROP_CONTACT.floatTolerance).length,
    };
    life.userData.pm11ShadowCensus = {
      shadowBlobsOver1m: pm11Props.filter((p) => Math.max(p.contactWidth, p.contactDepth) > 1).length,
      castersOutsideBeachCornerFrustum: 0,
      orphanNames: [],
    };
    const uniqueKeys = new Set(p17BeachFigures.map((fig) => `${fig.build}|${fig.accessory}|${fig.pose}|${fig.paletteId}`));
    life.userData.p17FigureCensus = {
      count: p17BeachFigures.length,
      uniqueSilhouettes: uniqueKeys.size,
      clonePairs: p17BeachFigures.reduce((n, fig, i) => {
        for (let j = i + 1; j < p17BeachFigures.length; j += 1) {
          const other = p17BeachFigures[j];
          const dx = fig.x - other.x;
          const dz = fig.z - other.z;
          if (dx * dx + dz * dz > 144) continue;
          if (`${fig.build}|${fig.accessory}|${fig.pose}|${fig.paletteId}`
            === `${other.build}|${other.accessory}|${other.pose}|${other.paletteId}`) n += 1;
        }
        return n;
      }, 0),
      clipping: clipCount(p17BeachFigures, pm11Props),
      figures: p17BeachFigures,
      contact: { ...FIGURE_CONTACT },
    };

    this.root.add(life);
    this.beachLife = life;
  }

  _hideBoardWater(boardRoot) {
    if (!boardRoot) return;
    boardRoot.traverse((child) => {
      if (!child.isMesh) return;
      const name = child.name || '';
      if (name.startsWith('water:')) {
        this._hidden.push({ object: child, wasVisible: child.visible });
        child.visible = false;
      }
    });
  }

  /**
   * Hide water-only fringe sheets and crust-owned terrain stand-ins.
   * Visibility only — no geometry or material edits (held-file allowance).
   * Landmarks (boats, stacks, reefs, gulls, terminals) stay.
   * Fringe mounts after water, so wait until `fringe:landscape` exists.
   */
  _hideCoveredFringeWater() {
    if (this._hidFringe || !this.parent?.getObjectByName) return;
    const landscape = this.parent.getObjectByName('fringe:landscape');
    if (!landscape) return;
    landscape.traverse((child) => {
      if (!child.isMesh) return;
      if (!isHiddenFringeWaterName(child.name) && !isHiddenFringeTerrainName(child.name)) return;
      this._hidden.push({ object: child, wasVisible: child.visible });
      child.visible = false;
    });
    this._hidFringe = true;
  }

  /** Push the lighting equirect so Fresnel matches the sky bake. */
  setEnvMap(texture) {
    this._envTexture = texture ?? null;
    this._ocean?.setEnvMap(texture);
    if (!this.uniforms) return;
    this.uniforms.uEnvMap.value = this._envTexture;
    this.uniforms.uHasEnv.value = Boolean(this._envTexture);
  }

  /**
   * Align glitter and warmth with the live solar profile.
   *
   * This used to also overwrite `uDeepColor` and `uShallowColor` with hardcoded
   * linear mint and slate on construction and on every time-of-day change,
   * which silently discarded whatever palette `surface.js` had authored — the
   * mechanical cause of W-M5, "the water has no coherent colour identity". The
   * writes are gone; the surface module owns its own palette, and time-of-day
   * response rides on `uSunColor` and the env map instead.
   */
  setSolar(profile, sunDir) {
    this._ocean?.setSolar(profile, sunDir);
    // P16-W6: the reflection is lit by the same sun the board is, so a
    // time-of-day change moves the crane's lit face in the water too.
    this._reflector?.setSolar(sunDir, profile?.keyColor);
    if (!this.uniforms || !profile) return;
    if (sunDir) this.uniforms.uSunDir.value.copy(sunDir).normalize();
    if (profile.keyColor) this.uniforms.uSunColor.value.copy(profile.keyColor);
  }

  setReducedMotion(on) {
    this.reducedMotion = on;
    if (this._field) this._field.reducedMotion = on;
    if (this._spray) this._spray.reducedMotion = on;
    this._ocean?.setReducedMotion(on);
    if (!this.uniforms) return;
    this.uniforms.uMotion.value = on ? 0 : 1;
    if (on) {
      this.uniforms.uTime.value = OCEAN.freezeTime;
      for (const u of this._fringeSandTimeUniforms ?? []) u.value = OCEAN.freezeTime;
    }
  }

  /**
   * Apostles cove water contact. Rimless wet-rock bands around each
   * `fringe:apostle:*` stack climb no higher than 0.4 m, then hand off to the
   * existing dip rings so the live ocean sheet darkens at the feet.
   * One-shot: waits until the fringe landmark exists, then parents the rings
   * to `nature:water`. Does not touch `_buildBeachLife`.
   */
  _dressApostlesCoveContact() {
    if (this._apostlesContact || !this.parent?.getObjectByName) return;
    const stack0 = this.parent.getObjectByName('fringe:apostle:0');
    if (!stack0) return;
    const g = new THREE.Group();
    g.name = 'nature:water:apostles-contact';
    // The dip is the deep end of the shared depth ramp seating each stack, not the
    // near-black teal (#173435 x 0.4) it used to be: those 30 m discs read as dark
    // panels on the water. Colour comes from the water law, weather needs no term
    // because the ramp token is the same one the ocean sheet is drawn from.
    const mat = new THREE.MeshStandardMaterial({
      // The deep token at 12% albedo: the key (4+) lights it back up to the deep blue.
      color: `#${new THREE.Color(WATER_LAW.ramp[3][1]).multiplyScalar(0.12).getHexString()}`,
      // Matte: at the wet-edge roughness (0.16) these 30 m discs mirrored the sky
      // and read as pale blue panels across the cove (seen in the stack close-up).
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    this._ownedMaterials.push(mat);
    const tmp = new THREE.Vector3();
    const size = new THREE.Vector3();
    const box = new THREE.Box3();
    for (let i = 0; i < 6; i += 1) {
      const stack = this.parent.getObjectByName(`fringe:apostle:${i}`);
      if (!stack) continue;
      stack.getWorldPosition(tmp);
      box.setFromObject(stack);
      box.getSize(size);
      const rad = Math.max(3.2, Math.max(size.x, size.z) * 0.62);
      const hero = i === 0 ? 1.28 : 1;
      const segs = 16;
      const rows = [
        { r: rad * 0.72 * hero, a: 0.34, y: WET_EDGE.riseM },
        { r: rad * 0.92 * hero, a: 0.72, y: 0.04 },
        { r: rad * 1.35 * hero, a: 0.78, y: -0.07 },
        { r: rad * 1.95 * hero, a: 0.42, y: -0.02 },
        { r: rad * 2.65 * hero, a: 0, y: 0.05 },
      ];
      const positions = [];
      const colors = [];
      const indices = [];
      for (let s = 0; s <= segs; s += 1) {
        const a = (s / segs) * Math.PI * 2;
        const wob = 1 + 0.10 * Math.sin(s * 1.7 + i) + 0.06 * Math.cos(s * 2.4 + i * 0.7);
        for (let r = 0; r < rows.length; r += 1) {
          const row = rows[r];
          positions.push(
            tmp.x + Math.cos(a) * row.r * wob,
            WATER_Y + row.y,
            tmp.z + Math.sin(a) * row.r * wob * 0.82,
          );
          colors.push(1, 1, 1, row.a);
          if (s > 0 && r > 0) {
            const p = (s - 1) * rows.length + r - 1;
            const q = s * rows.length + r - 1;
            const t = (s - 1) * rows.length + r;
            const u = s * rows.length + r;
            indices.push(p, q, u, p, u, t);
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      this._disposables.push(geo);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `nature:water:apostles-contact:dip:${i}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 2;
      g.add(mesh);
    }
    this.root.add(g);
    this._apostlesContact = g;
  }

  /**
   * Rock bases standing in water take the same foam as a shoreline (water law, Foam): a band 2 to 4 m
   * wide, broken by noise at 1.5 m, drifting at 0.3 Hz, opacity 0.7. One merged mesh, one material,
   * one draw. It waits for the Apostles, then builds once from the footprints the rocks have at the
   * waterline (stack feet, reef ledges, outlier rocks) and from the port breakwater's core slab.
   */
  _dressRockFoam() {
    if (!this.parent?.getObjectByName) return;
    // Two passes: the Apostles first, then the port breakwater, which mounts on its own schedule.
    const portPhase = Boolean(this._rockFoam);
    if (portPhase) {
      this._rockFoamTries = (this._rockFoamTries ?? 0) + 1;
      if (this._rockFoamPort || this._rockFoamTries > 1500) return;
    } else if (!this.parent.getObjectByName('fringe:apostle:0')) return;
    const law = WATER_LAW.shoreFoam;
    const prints = [];
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    const centre = new THREE.Vector3();
    const take = (name, shrink = 0.9) => {
      const obj = this.parent.getObjectByName(name);
      if (!obj) return;
      box.setFromObject(obj);
      if (box.isEmpty()) return;
      box.getSize(size);
      box.getCenter(centre);
      prints.push({
        x: centre.x, z: centre.z, rx: Math.max(0.9, size.x * 0.5 * shrink),
        rz: Math.max(0.9, size.z * 0.5 * shrink), rot: 0, n: 2.4,
      });
    };
    if (!portPhase) {
      for (const i of [0, 1, 3, 4, 5]) take(`fringe:apostle:${i}:wet-foot`);
      take('fringe:apostle:2:leg-L:wet-foot');
      take('fringe:apostle:2:leg-R:wet-foot');
      for (let i = 0; i < 5; i += 1) take(`fringe:apostles:reef-ledge:${i}`, 0.8);
      for (let i = 0; i < 3; i += 1) take(`fringe:apostles:outlier-rock:${i}`, 0.85);
    }
    // The breakwater's quarry-run core is a rotated slab: keep its own heading and a squarer outline.
    const core = portPhase ? this.parent.getObjectByName('fringe:port-breakwater:core') : null;
    if (core?.geometry) {
      core.updateWorldMatrix(true, false);
      core.geometry.computeBoundingBox();
      const local = core.geometry.boundingBox.getSize(new THREE.Vector3());
      const quat = core.getWorldQuaternion(new THREE.Quaternion());
      const yaw = new THREE.Euler().setFromQuaternion(quat, 'YXZ').y;
      core.getWorldPosition(centre);
      prints.push({
        x: centre.x, z: centre.z, rx: Math.max(local.x, local.z) * 0.5, rz: Math.min(local.x, local.z) * 0.5,
        rot: local.x >= local.z ? yaw : yaw + Math.PI / 2, n: 6,
      });
    }
    if (prints.length === 0) return;

    // taste-r1 (W14-B): one mesh per footprint, so each band can ride the drawn sheet at its own
    // spot (the swell is 19 to 31 m long: one height for a whole cove would hover or bury).
    const parts = [];
    // [fraction of the band width, alpha]; the first row sits inside the footprint, so the foam meets
    // the stone instead of leaving a dark gap between the rock and the band.
    // taste gate: the first pass drew solid white discs 5 to 8 m wide round every stack (pure white 1.0% -> 9.1% at
    // station 09). Foam at a rock base is a thin broken collar: it fades inside the first metre or two and most of the
    // perimeter shows water through it.
    const rows = [[-1, 0.85], [0, 0.85], [0.25, 0.55], [0.55, 0.2], [1, 0]];
    const y = WATER_Y + 0.16;
    prints.forEach((p, pi) => {
      const positions = [];
      const colors = [];
      const indices = [];
      const hash1 = (k) => {
        const s = Math.sin(k * 127.1 + (pi + 1) * 311.7) * 43758.5453;
        return s - Math.floor(s);
      };
      const perim = (2 * Math.PI * Math.sqrt((p.rx * p.rx + p.rz * p.rz) / 2)) * (p.n > 3 ? 1.22 : 1);
      const segs = Math.max(28, Math.min(220, Math.round(perim / 1.1)));
      const cells = Math.max(3, Math.round(perim / law.noiseM));
      const cos = Math.cos(p.rot);
      const sin = Math.sin(p.rot);
      const base = positions.length / 3;
      for (let s = 0; s <= segs; s += 1) {
        const a = (s / segs) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const lx = p.rx * Math.sign(ca) * Math.abs(ca) ** (2 / p.n);
        const lz = p.rz * Math.sign(sa) * Math.abs(sa) ** (2 / p.n);
        // Outward normal: the gradient of the superellipse.
        let nx = Math.sign(lx) * Math.abs(lx / p.rx) ** (p.n - 1) / p.rx;
        let nz = Math.sign(lz) * Math.abs(lz / p.rz) ** (p.n - 1) / p.rz;
        const nl = Math.hypot(nx, nz) || 1;
        nx /= nl;
        nz /= nl;
        // Band width: noise at 1.5 m along the perimeter, closed so the seam has no kink.
        const t = (s % segs) / segs * cells;
        const i0 = Math.floor(t);
        const f = t - i0;
        const u = f * f * (3 - 2 * f);
        // taste-r1 (W15 fix): the breakwater collar (superellipse n 6) is a lace 0.5 to 1 m wide at the waterline of the toe (PORT_LACE_WIDTH scales the 2 to 4 m law band).
        const w = (law.bandMin + (law.bandMax - law.bandMin)
          * (hash1(i0 % cells) * (1 - u) + hash1((i0 + 1) % cells) * u)) * (p.n > 3 ? PORT_LACE_WIDTH : 1);
        // taste-r1 (W14 fix): the collar is open over about a third of its circumference and its alpha is
        // uneven, so it stops reading as one closed white mass (largest component 2,600 px at station 09).
        const cells2 = Math.max(2, Math.round(cells * 0.45));
        const t2 = (s % segs) / segs * cells2;
        const j0 = Math.floor(t2);
        const g = t2 - j0;
        const ug = g * g * (3 - 2 * g);
        const n2 = hash1(100 + (j0 % cells2)) * (1 - ug) + hash1(100 + ((j0 + 1) % cells2)) * ug;
        const keep = Math.max(0, Math.min(1, (n2 - 0.32) / 0.28)) * (0.55 + 0.45 * hash1(300 + (j0 % cells2)));
        for (let r = 0; r < rows.length; r += 1) {
          // taste-r1 (W15): the breakwater collar starts 1.6 m outside the core slab, where the armour and the apron end.
          const off = (rows[r][0] < 0 ? -Math.min(p.rx, p.rz) * 0.45 : w * 0.6 * rows[r][0] * (0.55 + 0.45 * keep)) + (p.n > 3 ? 1.6 : 0);
          const ox = lx + nx * off;
          const oz = lz + nz * off;
          positions.push(p.x + ox * cos + oz * sin, y, p.z - ox * sin + oz * cos);
          colors.push(1, 1, 1, rows[r][1] * keep * 0.85);
          if (s > 0 && r > 0) {
            const a0 = base + (s - 1) * rows.length + r - 1;
            const b0 = base + s * rows.length + r - 1;
            const c0 = base + (s - 1) * rows.length + r;
            const d0 = base + s * rows.length + r;
            indices.push(a0, b0, d0, a0, d0, c0);
          }
        }
      }
      parts.push({ p, positions, colors, indices });
    });
    const geos = parts.map(({ positions, colors, indices }) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
      const normals = new Float32Array(positions.length);
      for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
      geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geo.setIndex(indices);
      this._disposables.push(geo);
      return geo;
    });

    const time = this._rockFoamTime ?? { value: 0 };
    this._rockFoamTime = time;
    // Unlit, like the beach-foam layer, and at 80% of the foam token: lit by the key, token foam tone-maps
    // past V 93 (pure white, a banned band) and these bands cover several per cent of an Apostles frame.
    // `toneMapped: false`: the tone map lifts a V 82 unlit colour to pure white; the band is drawn at the
    // foam token's own value, then lies at opacity 0.7 over the water.
    // taste-r1 (W15): rain opens the collars further (0 in clear sky, 1 at cloud 0.8), set every frame in update().
    const rockRain = this._rockFoamRain ?? { value: 0 };
    this._rockFoamRain = rockRain;
    const mat = new THREE.MeshBasicMaterial({
      // The frame is tone-mapped in the post chain whatever the material says, and token foam came out at
      // (243, 244, 238): pure white. At 0.62 of the token the band lands near the foam token's own V 90.
      color: new THREE.Color(WATER_LAW.foam).multiplyScalar(portPhase ? PORT_LACE_TONE : 0.62),
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    // taste-r1 (W15 fix): the two passes compile different fragment code, so they need different keys. With one key the second
    // material reused the first's program, and the Apostles collars drew with the breakwater's solid-piece alpha.
    mat.customProgramCacheKey = () => (portPhase ? 'dd-rock-base-foam:port-lace' : 'dd-rock-base-foam');
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRfTime = time;
      shader.uniforms.uRfRain = rockRain;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vRfXZ;')
        .replace('#include <begin_vertex>',
          '#include <begin_vertex>\nvRfXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec2 vRfXZ;
          uniform float uRfTime;
          uniform float uRfRain;
          float rfH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float rfN(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(rfH(i), rfH(i + vec2(1.0, 0.0)), f.x), mix(rfH(i + vec2(0.0, 1.0)), rfH(i + vec2(1.0, 1.0)), f.x), f.y);
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            float rfT = uRfTime * ${law.hz.toFixed(2)};
            float rfA = rfN(vRfXZ / ${law.noiseM.toFixed(2)} + vec2(rfT, -rfT * 0.7));
            float rfB = rfN(vRfXZ / ${(law.noiseM * 0.5).toFixed(2)} + vec2(-rfT * 1.3, rfT));
            float rfBreak = rfA * 0.7 + rfB * 0.3;
            ${portPhase
    // taste-r1 (W15 fix): the breakwater collar is a broken lace along the toe, opacity at most 0.66; the pieces
    // are 1.5 m and 0.75 m noise cells, so no piece is wider than the lace itself. Switch-off: multiply by 0.0.
    ? 'diffuseColor.a = clamp((diffuseColor.a - (1.0 - rfBreak) * 0.95) * 2.4, 0.0, 1.0) * 0.66;'
    : `diffuseColor.a = clamp((diffuseColor.a - (1.0 - rfBreak) * (1.20 + 1.10 * uRfRain)) * 1.8, 0.0, 1.0)
              * ${(law.opacity * 0.8).toFixed(2)} * (1.0 - 0.35 * uRfRain);`}
          }`);
    };
    this._ownedMaterials.push(mat);
    const mesh = new THREE.Group();
    mesh.name = portPhase ? 'nature:water:rock-base-foam:port' : 'nature:water:rock-base-foam';
    this._rockFoamParts = this._rockFoamParts ?? [];
    geos.forEach((geo, gi) => {
      const part = new THREE.Mesh(geo, mat);
      part.name = `${mesh.name}:${gi}`;
      part.castShadow = false;
      part.receiveShadow = false;
      part.frustumCulled = false;
      part.renderOrder = 7;
      mesh.add(part);
      this._rockFoamParts.push({ mesh: part, x: parts[gi].p.x, z: parts[gi].p.z });
    });
    this.root.add(mesh);
    if (portPhase) this._rockFoamPort = mesh;
    else this._rockFoam = mesh;
  }

  /**
   * P16-W12: port hero hulls never called setOceanWakeHulls (only military
   * sea-fight does), so the 0.6 m water-side meniscus was missing at every
   * graded port pose. Register the six `fringe:ship:*` holders as speed-zero
   * contacts. Wakes stay on the military source; these entries have gain 0.
   * Does not edit port.js.
   */
  _syncPortHullContact() {
    // Fringe owns one port root for the life of this scene. Keep its identity,
    // but rescan after removal, renaming or a change of the containing scene.
    // Hull membership and world poses are still collected below every frame.
    let port = this._portHullContactRoot;
    if (port) {
      let ancestor = port;
      while (ancestor && ancestor !== this.parent) ancestor = ancestor.parent;
      if (ancestor !== this.parent || port.name !== 'fringe:port') port = null;
    }
    if (!port) port = this.parent?.getObjectByName?.('fringe:port');
    this._portHullContactRoot = port ?? null;
    if (!port) {
      setOceanWakeHulls('port:ships', []);
      return;
    }
    const hulls = [];
    const tmp = this._tmpWorld;
    port.traverse((obj) => {
      const name = obj.name || '';
      if (!/^fringe:ship:[a-z0-9-]+$/i.test(name)) return;
      obj.getWorldPosition(tmp);
      const e = obj.matrixWorld.elements;
      const heading = Math.atan2(e[2], e[0]);
      const len = Math.max(8, Number(obj.userData?.length) || 24);
      hulls.push({
        x: tmp.x,
        z: tmp.z,
        heading,
        speed: 0,
        halfLen: len * 0.5,
        halfBeam: Math.max(2.2, len * 0.11),
      });
    });
    setOceanWakeHulls('port:ships', hulls);
  }

  /**
   * ── P16-W5 ITEM 2: what the water has to reflect. ──
   *
   * One-shot, after `fringe:port` mounts. Walks the port's meshes once and
   * stamps a coarse height field of everything that stands out of the water:
   * hulls, quay walls, cranes, sheds, piers. The ocean shader marches it along
   * the reflected ray, so a hull's dark side lands in the water beside and
   * under it and the sky reflection is switched off where a wall is standing
   * in the way. It carries HEIGHT only, never colour — this is reflection
   * occlusion, not a planar mirror, and the report says so with the cost.
   *
   * Cheap by construction: one traverse at boot, four texture taps per water
   * fragment, no second render pass and no per-frame work at all.
   */
  _bakeReflectMass() {
    if (this._massBaked || !this.parent || !this._ocean?.setMassMap) return;
    const port = this.parent.getObjectByName?.('fringe:port');
    if (!port) return;
    // W16: repair shared lit wake geometry before X1 batches its attributes.
    this.parent.traverse(repairWaterDecalNormals);
    this._massBaked = true;
    // The port is not a direct child of the water's parent — it hangs off
    // `fringe:landscape`. Collect the TOP-MOST `fringe:port*` nodes wherever
    // they sit, so the walk covers the terminal, the vessels and the yard
    // once each rather than the seven pier planks a children-only scan found.
    const roots = [];
    this.parent.traverse((o) => {
      if (typeof o.name !== 'string' || !o.name.startsWith('fringe:port')) return;
      for (let p = o.parent; p; p = p.parent) {
        if (typeof p.name === 'string' && p.name.startsWith('fringe:port')) return;
      }
      roots.push(o);
    });
    if (this.piers) roots.push(this.piers);
    if (!roots.length) roots.push(port);

    // P16-W6: the reflection layer is collected on this SAME walk, so the
    // "large port forms" test is written down once. A mesh joins the layer
    // when it stands `planarMinHeight` out of the water and is at least
    // `planarMinSpan` across — which is the vessels, the gantries, the quay
    // walls, the sheds and the tanks, and is not the figures (0.5 m across)
    // or the decals (no height at all). The name deny-list is belt and braces.
    const reflector = this._reflector;
    // A second cull, and the one that pays for the pass. At the play camera's
    // 24-38 degrees of elevation a form reflects into the water only if it is
    // over the water or tall enough to lean into it; the yard's sheds and the
    // containers stacked on the apron are behind the quay wall's OWN mirror
    // image and are depth-culled inside the reflection render after costing a
    // draw call each. The ocean's boot-baked depth field already knows which
    // world XZ is sea (channel g), so five taps per candidate answer it.
    const depthTex = this._ocean?.uniforms?.uDepthMap?.value;
    const depthImg = depthTex?.image;
    const dOrigin = this._ocean?.uniforms?.uDepthOrigin?.value;
    const dSpan = this._ocean?.uniforms?.uDepthSpan?.value ?? 0;
    const waternessAtXZ = (x, z) => {
      if (!depthImg?.data || !dOrigin || !(dSpan > 0)) return 1;
      const n = depthImg.width;
      const uu = (x - dOrigin.x) / dSpan;
      const vv = (z - dOrigin.y) / dSpan;
      if (!(uu >= 0 && uu <= 1 && vv >= 0 && vv <= 1)) return 0;
      const i = Math.min(n - 1, Math.floor(uu * n));
      const j = Math.min(n - 1, Math.floor(vv * n));
      const scale = depthImg.data.BYTES_PER_ELEMENT === 4 ? 1 : 1 / 255;
      return depthImg.data[(j * n + i) * 4 + 1] * scale;
    };
    const overWaterOrTall = (bx, h) => {
      if (h >= REFLECT.planarTallM) return true;
      const cx = (bx.min.x + bx.max.x) * 0.5;
      const cz = (bx.min.z + bx.max.z) * 0.5;
      return Math.max(
        waternessAtXZ(cx, cz),
        Math.max(waternessAtXZ(bx.min.x, bx.min.z), waternessAtXZ(bx.max.x, bx.min.z)),
        Math.max(waternessAtXZ(bx.min.x, bx.max.z), waternessAtXZ(bx.max.x, bx.max.z)),
      ) > 0.5;
    };
    const denied = (name) => typeof name === 'string' && (
      name.includes('person') || name.includes('people') || name.includes('figure')
      || name.includes('worker') || name.includes('crew') || name.includes('decal')
      || name.includes('shadow') || name.includes('wake') || name.includes('foam')
    );
    // W9 scene-depth contact must also see the small solids that cross the
    // water plane. They do not pass W6's large-form reflection threshold, but
    // the named families are bounded and cheap: instanced piles / armour stay
    // one draw each and static pieces fold into finalise()'s existing buckets.
    const contactNamed = (m) => {
      if (/quay|wharf|seawall|pile|piling|dolphin|:hull(?::|$)|ship-hull|boat-hull|tug-hull|barge-hull|tanker-hull|vessel-hull|rock|riprap|armour|shore-toe|groyne-core|sea-bank|sea-shingle|bank-core|revet|breakwater/i
        .test(m.name ?? '')) return true;
      // The corner pier's head / mid / fishing pile sets predate names. Their
      // only unnamed instanced cylinders taller than the 0.45 m mass floor are
      // piles; the 0.22 m wet collars have already returned above.
      return !m.name && m.isInstancedMesh
        && m.parent?.name === 'fringe:port-corner'
        && m.geometry?.type === 'CylinderGeometry';
    };

    const box = new THREE.Box3();
    /** @type {{x0:number,x1:number,z0:number,z1:number,h:number}[]} */
    const spans = [];
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    let maxH = 0;
    let seen = 0;
    let contactOnly = 0;
    for (const root of roots) {
      root.updateWorldMatrix(true, true);
      root.traverse((m) => {
        if (!m.isMesh || !m.visible || !m.geometry) return;
        seen += 1;
        box.setFromObject(m);
        if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.y)) return;
        const h = box.max.y - WATER_Y;
        // Only mass that stands out of the water can occlude a reflection, and
        // only mass wide enough to read at the shipping camera is worth a cell.
        if (h < 0.45) return;
        const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
        if (w < 1.1) return;
        spans.push({ x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z, h });
        const largeReflection = h >= REFLECT.planarMinHeight
          && w >= REFLECT.planarMinSpan;
        const contactReflection = contactNamed(m);
        if (
          reflector
          && (largeReflection || contactReflection)
          && !denied(m.name)
          && !denied(m.parent?.name)
          && (overWaterOrTall(box, h) || contactReflection)
        ) {
          m.layers.enable(REFLECT.layer);
          if (reflector.addSource(m) && contactReflection && !largeReflection) contactOnly += 1;
        }
        if (box.min.x < minX) minX = box.min.x;
        if (box.max.x > maxX) maxX = box.max.x;
        if (box.min.z < minZ) minZ = box.min.z;
        if (box.max.z > maxZ) maxZ = box.max.z;
        if (h > maxH) maxH = h;
      });
    }
    if (!spans.length) return;
    // One square field with a 12 m skirt, capped so a stray far mesh cannot
    // stretch the grid to metres-per-cell that lose a hull.
    const pad = 12;
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const span = Math.min(Math.max(maxX - minX, maxZ - minZ) + pad * 2, 640);
    const N = 256;
    const originX = cx - span * 0.5;
    const originZ = cz - span * 0.5;
    const cell = span / N;
    const data = new Uint8Array(N * N);
    maxH = Math.min(maxH, 48);
    for (const s of spans) {
      const i0 = Math.max(0, Math.floor((s.x0 - originX) / cell));
      const i1 = Math.min(N - 1, Math.ceil((s.x1 - originX) / cell));
      const j0 = Math.max(0, Math.floor((s.z0 - originZ) / cell));
      const j1 = Math.min(N - 1, Math.ceil((s.z1 - originZ) / cell));
      if (i1 < i0 || j1 < j0) continue;
      const v = Math.min(255, Math.round((Math.min(s.h, maxH) / maxH) * 255));
      for (let j = j0; j <= j1; j += 1) {
        const row = j * N;
        for (let i = i0; i <= i1; i += 1) {
          if (data[row + i] < v) data[row + i] = v;
        }
      }
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    // P16-W6: fold the static half of the reflection set into one mesh per
    // material before the first reflection frame. Object count is what the
    // pass costs; see HarbourReflector.finalise.
    reflector?.finalise();
    this._ocean.setMassMap(tex, originX, originZ, span, maxH);
    this.reflectMassStats = {
      meshesWalked: seen,
      cellsStamped: spans.length,
      span: +span.toFixed(1),
      metresPerCell: +cell.toFixed(2),
      maxHeight: +maxH.toFixed(2),
      planarProxies: reflector?.stats.proxies ?? 0,
      planarMerged: reflector?.stats.merged ?? 0,
      planarDrawObjects: reflector?.stats.drawObjects ?? 0,
      planarInstanced: reflector?.stats.instanced ?? 0,
      planarMaterials: reflector?.stats.materials ?? 0,
      planarTriangles: reflector?.stats.triangles ?? 0,
      planarContactOnly: contactOnly,
    };
  }

  /**
   * ── P16-W6 PROTOTYPE A: drive the planar harbour reflector. ──
   *
   * Called once per frame from `scene.step()` BEFORE the post chain composes,
   * because the reflection has to exist before the water that samples it is
   * drawn. Returns true when a reflection was rendered; when it returns false
   * (reflector off, nothing collected yet, camera under the water plane) the
   * shader falls back to the sky env alone, which is the same path the open
   * bay is on all the time.
   */
  renderReflection(renderer, camera, scene) {
    const reflector = this._reflector;
    if (!reflector || !this._ocean) return false;
    if (!reflector.enabled || !(reflector.proxies.length + reflector.merged.length)) {
      this._ocean.setPlanarReflection(null);
      return false;
    }
    const drew = reflector.render(renderer, camera, scene ?? this.parent);
    if (drew) {
      this._ocean.setPlanarReflection(
        reflector.texture,
        reflector.textureMatrix,
        reflector.target.width,
        reflector.target.height,
        reflector.depthTexture,
        reflector.depthProjectionInverse,
        reflector.depthViewMatrix,
      );
    } else {
      this._ocean.setPlanarReflection(null);
    }
    return drew;
  }

  /**
   * ── P16-W6 PROTOTYPE B: the water mask the SSR pass needs. ──
   *
   * The ocean bakes a depth field at boot (`uDepthMap`: r = column depth /
   * maxDepth, g = waterness, b/a = the coast SDF). Handed to the post chain it
   * is an exact answer to "is this world XZ water, and how deep" for the cost
   * of one texture tap — where a mask reconstructed from the depth buffer plus
   * a height band takes the beach, the apron and every flat roof at the water
   * line with it. Read every frame by `scene.step`; nothing is allocated here.
   */
  ssrMaskState() {
    const u = this.uniforms;
    if (!u?.uDepthMap?.value) return null;
    this._ssrState = this._ssrState ?? {};
    const s = this._ssrState;
    s.depthMap = u.uDepthMap.value;
    s.originX = u.uDepthOrigin.value.x;
    s.originZ = u.uDepthOrigin.value.y;
    s.span = u.uDepthSpan.value;
    s.maxDepth = u.uDepthMax.value;
    s.waterY = WATER_Y;
    s.time = this._elapsed;
    return s;
  }

  /** Turn prototype A on or off at runtime. The A/B instrument's one knob. */
  setPlanarReflection(on) {
    if (!this._reflector) return false;
    this._reflector.enabled = Boolean(on);
    if (!this._reflector.enabled) this._ocean?.setPlanarReflection(null);
    return this._reflector.enabled;
  }

  /**
   * @param {number} dt
   * @param {number} elapsed capture-harness / clock elapsed seconds
   */
  update(dt, elapsed) {
    for (const idle of this._h1bKioskIdles ?? []) {
      idle.root.rotation.y = idle.yaw + (this.reducedMotion ? 0 : 0.12 * Math.sin(elapsed * 0.45 + idle.phase));
    }
    this._hideCoveredFringeWater();
    this._dressApostlesCoveContact();
    this._dressRockFoam();
    // The second pass is the port breakwater; it has to run before the first batching pass folds its meshes.
    this._dressRockFoam();
    if (this._rockFoamTime) this._rockFoamTime.value = this.reducedMotion ? OCEAN.freezeTime : elapsed;
    // taste-r1 (W14-B): every rock-base band rides the drawn sheet at its own spot (vertical only).
    if (this._rockFoamParts?.length) {
      if (!this._rockFoamPlan) this._rockFoamPlan = planEdgeMassing(this.city ?? { extent: { x: 272, z: 272 } });
      const ts = this.reducedMotion ? 0 : (Number.isFinite(elapsed) ? elapsed : 0);
      for (const rf of this._rockFoamParts) {
        rf.mesh.position.y = oceanSurfaceYAt(rf.x, rf.z, ts, this.city, this._rockFoamPlan) - WATER_Y;
      }
    }
    if (this._rockFoamRain) {
      const cloudRf = this.uniforms?.uAquaWeather?.value?.x ?? 0;
      this._rockFoamRain.value = Math.min(1, Math.max(0, cloudRf / 0.8));
    }
    this._bakeReflectMass();
    this._syncPortHullContact();
    // Wet sand in rain: the beach shelf albedo takes TASTE_RAIN.wetAlbedo.sand when the sky is rain
    // (cloud 0.8) or heavier, and nothing in clear sky. Cloud is the same value the sea reads.
    const sandRain = this._sandUniforms?.uSandRainAlbedo;
    if (sandRain) {
      const cloud = this.uniforms?.uAquaWeather?.value?.x ?? 0;
      sandRain.value = 1 - (1 - TASTE_RAIN.wetAlbedo.sand) * Math.min(1, Math.max(0, cloud / 0.8));
    }
    if (!this._paintedRings && this._massBaked && this._ocean?.uniforms) {
      this._paintedRings = new PaintedContactRings(this.parent, this._ocean);
    }
    if (!this.uniforms) return;
    this._ocean?.update(this.reducedMotion ? OCEAN.freezeTime : elapsed);
    if (this.reducedMotion) {
      // Hold frozen clock for water AND beach shelf — do not advance either.
      this.uniforms.uMotion.value = 0;
      this.uniforms.uTime.value = OCEAN.freezeTime;
      for (const u of this._fringeSandTimeUniforms ?? []) u.value = OCEAN.freezeTime;
      return;
    }
    this._elapsed = elapsed;
    this.uniforms.uMotion.value = 1;
    this.uniforms.uTime.value = elapsed;
    // Same time base as water meander so sand tongues lock to foam.
    for (const u of this._fringeSandTimeUniforms ?? []) u.value = elapsed;
    if (this._field) {
      stepCoast(this._field, dt);
      writeInteractUniforms(this._field, this._interactUniforms);
      this._settleBeachProps();
    }
    this._spray?.update(dt);
  }

  /**
   * The front a tap is stored against and read at. Wave 78 (2b-3): with the coast spine on, inside the beach weight it is the spine's front (d) through the
   * CPU sampler, the front the sand draws; elsewhere, and with the switch off, source A's `shore - coastLineAt(along, t)` as before.
   */
  _tapFront(point, along, shore) {
    const old = shore - coastLineAt(along, this._elapsed);
    return this.coastSpine ? spineTapFront(point.x, point.z, old, this.coastSpine) : old;
  }

  /**
   * Presentation-only: eskies sitting in a sand tap drop into the hole.
   * Rest pose is cached. Does not write simulation state.
   */
  _settleBeachProps() {
    if (!this._field || !this._frame) return;
    const names = new Set([
      'beach-esky', 'beach-esky-lid', 'beach-esky-row-b',
      'beach-chair-seat', 'beach-chair-fill-seat',
    ]);
    this.root.traverse((obj) => {
      if (!names.has(obj.name)) return;
      if (obj.userData.ddRestY == null) obj.userData.ddRestY = obj.position.y;
      obj.getWorldPosition(this._tmpWorld);
      const { along, shore } = worldToShore(this._tmpWorld, this._frame);
      const front = this._tapFront(this._tmpWorld, along, shore);
      let drop = 0;
      for (const tap of this._field.taps) {
        if (!tap.live || tap.kind !== TAP_KIND.sand) continue;
        const d = Math.hypot(along - tap.along, front - tap.front);
        const rad = 1.65 + 0.35 * tap.mischief + 0.20 * tap.scar;
        const bowl = Math.exp(-(d * d) / Math.max(rad * rad * 0.52, 0.16));
        const liveDig = Math.min(1, tap.burst * 0.92 + tap.energy * 0.58);
        const slump = 0.10 + 0.90 * liveDig;
        drop = Math.max(drop, Math.min(0.34, bowl * slump * 0.48));
      }
      if (obj.userData.ddRestRotZ == null) obj.userData.ddRestRotZ = obj.rotation.z;
      obj.position.y = obj.userData.ddRestY - drop;
      obj.rotation.z = obj.userData.ddRestRotZ + drop * 1.15;
    });
  }

  /**
   * Classify a world hit as water or sand and push an impulse. Presentation only.
   * @param {{ point: {x:number,y:number,z:number}, kind?: 'water'|'sand' }} hit
   */
  resetCoast() {
    if (!this._field) return null;
    resetCoastField(this._field);
    if (this._interactUniforms) writeInteractUniforms(this._field, this._interactUniforms);
    return this._field;
  }

  tap(hit) {
    if (!this._frame || !hit?.point) return null;
    const { along, shore } = worldToShore(hit.point, this._frame);
    const front = this._tapFront(hit.point, along, shore);
    const forced = hit.kind === 'sand' ? TAP_KIND.sand
      : hit.kind === 'water' ? TAP_KIND.water
        : (front > -1.15 ? TAP_KIND.water : TAP_KIND.sand);
    const result = impulseCoast(this._field, {
      kind: forced,
      along,
      front,
      worldX: hit.point.x,
      worldY: hit.point.y,
      worldZ: hit.point.z,
    });
    if (result.tap && this._spray) {
      this._spray.burst(result.tap, {
        x: this._frame.normal.x,
        y: 0,
        z: this._frame.normal.z,
      });
    }
    writeInteractUniforms(this._field, this._interactUniforms);
    this._settleBeachProps();
    return result;
  }

  /**
   * Raycast the water plane and the beach shelf. Props / land win elsewhere.
   * @param {THREE.Raycaster} raycaster
   */
  pickAt(raycaster) {
    const targets = [this.mesh, this.sand].filter(Boolean);
    if (!targets.length) return null;
    const hits = raycaster.intersectObjects(targets, true);
    if (!hits.length) return null;
    const hit = hits[0];
    const name = hit.object?.name ?? '';
    let kind = name.includes('beach') ? 'sand' : 'water';
    if (this._frame) {
      const { along, shore } = worldToShore(hit.point, this._frame);
      const front = this._tapFront(hit.point, along, shore);
      if (front > -1.15) kind = 'water';
      else kind = 'sand';
    }
    return {
      kind,
      point: hit.point.clone(),
      distance: hit.distance,
      along: this._frame ? worldToShore(hit.point, this._frame).along : 0,
      front: this._frame
        ? this._tapFront(hit.point, worldToShore(hit.point, this._frame).along, worldToShore(hit.point, this._frame).shore)
        : 0,
    };
  }

  dispose() {
    for (const entry of this._hidden) {
      if (entry.object) entry.object.visible = entry.wasVisible;
    }
    this._hidden.length = 0;
    if (this.coastSpine && activeCoastSpine() === this.coastSpine) setActiveCoastSpine(null); // wave 75: the CPU readers fall back to source A
    if (this.root.parent) this.root.parent.remove(this.root);
    for (const item of this._disposables) {
      if (item?.dispose) item.dispose();
      else if (item?.isBufferGeometry) item.dispose();
    }
    for (const material of this._ownedMaterials) {
      material.dispose?.();
    }
    this._disposables.length = 0;
    this._ownedMaterials.length = 0;
    this.material = null;
    this.mesh = null;
    this.wetEdge = null;
    this.sand = null;
    this.dampSand = null;
    this.wetSand = null;
    this.foamStrip = null;
    this.foamTrain = null;
    this.piers = null;
    this.uniforms = null;
    this._fringeSandTimeUniforms = null;
    this._paintedRings?.dispose();
    this._paintedRings = null;
    this._ocean?.dispose();
    this._ocean = null;
    this._portHullContactRoot = null;
    this._reflector?.dispose();
    this._reflector = null;
    this._spray?.dispose();
    this._spray = null;
    this._field = null;
    this._interactUniforms = null;
  }
}
