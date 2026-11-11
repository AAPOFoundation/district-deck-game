import { finishBuild, runBuild, yieldToBrowser, warmStart, bootTrace, installEmbeddedImageDecoder, installPeopleTextureWarmup } from './startup.js';
// District Deck V3.00 — scene bootstrap.
// Owns the renderer, lights, camera rig, board and effect layers. Every resource created
// here is disposed in dispose(); nothing renders while the tab is hidden.
// Presentation grounding (table cloth / under-board shadow disc) lives here so board.js
// can stay the city-root owner without a concurrent seat conflict.

import * as THREE from 'three';
import { SHADOW_LAYER } from './lod.js';
import { buildStaticShadowProxy, disposeStaticShadowProxy } from './shadow-proxy.js';
import { CSM } from '../../vendor/three/examples/jsm/csm/CSM.js';
import { classifyPhotoCaster, registerPhotoMaterial } from './photo-shadow-registration.js';
import { IsoCameraRig } from './camera.js';
import { Board, parcelBuildingTransform } from './board.js';
import { PostChain, grade3HemisphereScale } from './post.js';
import { readFrameOptions, MotionPixelRatio } from './frame-policy.js';
import { LightingRig, sunDirection, applyP1FogColor, installCloudMottle, updateCloudMottle, scaleSkyFloorRaw } from './lighting.js';
import { P1_GROUNDING, P1_LIGHT, P23_LIGHT_PHOTO, R9_ATMOS, r9LightColor, fogRangeForExtent } from './v4-p1-polish.js';
import { TASTE_RAIN } from './taste-tokens.js';
import { bindHeroCameraConsole, applyHeroFromView, listHeroPresets } from './hero-camera.js';
import { Vfx } from './vfx.js';
import { mountWeatherFx, updateWeatherFx } from './weather-fx.js';
import { lampLevel } from './style/material-rules.js';
import { applyAlbedoGain } from './style/material-key.js';
import { weatherOf } from '../core/weather.js';
import { Mischief } from './mischief.js';
import {
  AuctionCrowdLayer, PeopleLayer, assertPeopleRenderBudget,
} from './people.js';
import {
  EventOverlayLayer, assertOverlayRenderBudget,
} from './event-overlays.js';
import { WaterSurface } from './water.js';
import { SkyDome } from './sky.js';
import { FoliageLayer } from './foliage.js';
import { FringeLayer, hinterlandGroundSampler } from './fringe.js';
import { placeKitBoard } from './landmarks-glb.js';
import { venueGroundRegions } from './fringe/venue-ground.js';
import { addPortWarehousePickTarget, addPortStructurePickTargets } from './port/port-warehouse-pick.js';
import { TrafficLayer } from './traffic.js';
import { WorldDeliveriesLayer } from './world-deliveries.js';
import { AmbientLifeLayer } from './ambient-life.js';
import { PeopleDrag } from './people-drag.js';
import { MeshyPeoplePool } from './people/meshy-people.js';
import { setReservationPedestrians } from './vehicles/tram.js';
import { collectRoadUsers } from './people/city-physics.js';
import { CityServicesLayer } from './city-services.js';
import {
  activeCity, activeParcel, resolveCurrentParcelId,
} from '../core/city.js';
import {
  findConstructionTap, tickConstructionSites,
} from './construction-site.js';
import { syncStartupSignage } from './startup-signage.js';
import { detectPedestrianHits } from './people/city-physics.js';
import { quarterAllowsCrossingAccident } from '../core/rates.js';
import {
  installWorldCurve,
  updateWorldCurveFromRig,
  compensatePickRay,
} from './world-curve.js';
import { EdgeMassingLayer } from './edge-massing.js';
import { MilitaryUnitsLayer, bindMilitaryDemoConsole } from './military/units.js';
import { MilitaryAttacksLayer } from './military/attacks.js';
import { MilitaryShipyardLayer } from './military/shipyard.js';
import {
  LIFE_TICK_HZ,
  batchStaticWorld,
  batchStaticWorldSteps,
  capInternalSize,
  disposeBatching,
} from './batching.js';

/**
 * Soft radial falloff disc for under-board contact. Pure arithmetic — no canvas, no RNG.
 * Centre is opaque charcoal, edge fades to transparent so the table cloth reads continuous.
 */
function tableShadowTexture(size = 128) {
  const data = new Uint8Array(size * size * 4);
  const mid = (size - 1) * 0.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - mid) / mid;
      const dy = (y - mid) / mid;
      const r = Math.sqrt(dx * dx + dy * dy);
      // Soft core under the plinth, long falloff past the rim.
      const core = Math.max(0, 1 - r * 0.92);
      const alpha = Math.pow(core, 1.55) * 0.72;
      const i = (y * size + x) * 4;
      data[i] = 8;
      data[i + 1] = 7;
      data[i + 2] = 6;
      data[i + 3] = Math.round(Math.min(1, alpha) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

export const PICK_PRIORITY = Object.freeze([
  'person',
  'prop',
  'parcel',
  'civic',
  'reserve',
  'ground',
]);

/**
 * Strategic land picks (parcel/civic/reserve) win over distant prop/person proxies.
 * Huge tree pick boxes used to swallow every city-frame click so buildings felt dead
 * after Frame city (zoom-out exposes overlapping mischief proxies first).
 */
export function resolvePickPriority(layers, { cameraDistance = 0 } = {}) {
  const land = layers.parcel ?? layers.civic ?? layers.reserve ?? null;
  const person = layers.person;
  const prop = layers.prop;
  const fringe = layers.fringe;
  const landDist = land?.distance ?? Infinity;

  // Far / city-frame camera: only strategic land — easter eggs need a closer orbit.
  // Threshold is relative so different board sizes still prefer buildings after Frame.
  const cityFrame = cameraDistance > 140;
  if (cityFrame) {
    return land ?? fringe ?? layers.ground ?? null;
  }

  // Prefer person/prop only when clearly nearer than the land hit (tight slack).
  // EXCEPTION: the public reserve is a fat whole-block volume that sits in front of
  // every park bench/tree proxy — without a wide reserve slack, central-park
  // mischief never wins the ray.
  if (person && person.distance + 0.05 < landDist) return person;
  if (layers.unit && layers.unit.distance + 0.05 < landDist) return layers.unit;
  const construction = layers.construction;
  if (construction && construction.distance + 0.25 < landDist) return construction;
  if (prop) {
    if (land?.kind === 'reserve' && prop.distance <= landDist + 18) return prop;
    if (prop.distance + 0.35 < landDist) return prop;
  }
  if (land) return land;
  if (layers.unit) return layers.unit;
  if (fringe) return fringe;
  if (person) return person;
  if (prop) return prop;
  if (layers.water) return layers.water;
  if (layers.sand) return layers.sand;
  return layers.ground ?? null;
}

/** Transient person/prop/fringe inspection never rewrites the strategic land selection. */
export function strategicSelectionAfterPick(current, hit) {
  if (
    hit?.kind === 'person'
    || hit?.kind === 'prop'
    || hit?.kind === 'construction'
    || hit?.kind === 'fringe'
    || hit?.kind === 'unit'
  ) return current;
  if (hit?.kind === 'water' || hit?.kind === 'sand') return current;
  if (hit?.kind === 'parcel' || hit?.kind === 'civic' || hit?.kind === 'reserve') {
    return { kind: hit.kind, id: hit.id };
  }
  return null;
}

function nearestProxyHit(raycaster, targets, kind, idField) {
  const hits = raycaster.intersectObjects(targets, false)
    .map((hit) => ({
      kind,
      [kind === 'prop' ? 'key' : 'id']: hit.object.userData[idField],
      label: hit.object.userData.label ?? null,
      model: hit.object.userData.modelId ?? hit.object.userData.mischiefKind ?? null,
      focus: hit.object.userData.focus ?? null,
      distance: hit.distance,
    }))
    .filter((hit) => hit[kind === 'prop' ? 'key' : 'id'])
    .sort((a, b) =>
      a.distance - b.distance
      || a[kind === 'prop' ? 'key' : 'id'].localeCompare(b[kind === 'prop' ? 'key' : 'id']));
  return hits[0] ?? null;
}

// Cloud illumination loses the dry sky's colour split, at the same light energy.
// This touches light colours only; material albedo and the presentation grade stay intact.
function overcastLightColor(color, amount) {
  const y = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  color.r += (y - color.r) * amount;
  color.g += (y - color.g) * amount;
  color.b += (y - color.b) * amount;
}

/**
 * Wet-weather light states (TASTE-BIBLE section 3, "Rain and autumn state").
 * Rain dims and softens the key, it never removes it: the sun keeps at least
 * TASTE_RAIN.sunGain of its dry energy so cast shadows and wall-base occlusion survive,
 * the hemisphere rises by TASTE_RAIN.hemisphereGain, and the lamps lose chroma
 * (`lightCloud`) instead of gaining a blue cast. Heavy rain is the same rule one step darker.
 * Retired: sun 10% / 2.5%, a hemisphere raised 7x to stand in for it, and contact darkness
 * scaled by the sun, which together flattened and blued the opening view.
 */
const RAIN_LIGHT = Object.freeze({
  rain: Object.freeze({
    sun: TASTE_RAIN.sunGain, fill: 0.92, bounce: 0.95, hemisphere: TASTE_RAIN.hemisphereGain,
    env: 0.85, contact: 0.90, lightCloud: 0.5, shadowSoft: TASTE_RAIN.shadowRadiusPx / 3, shadowStrength: 1, streaks: 0.8,
  }),
  'heavy-rain': Object.freeze({
    sun: 0.44, fill: 0.85, bounce: 0.90, hemisphere: TASTE_RAIN.hemisphereGain,
    env: 0.70, contact: 0.80, lightCloud: 0.6, shadowSoft: 2.2, shadowStrength: 0.9, streaks: 1,
  }),
});
const SHADOW_TINT_CLOUD = 0.45;
const DRY_LIGHT = Object.freeze({
  sun: 1, fill: 1, bounce: 1, hemisphere: 1, env: 1, contact: 1, lightCloud: 0,
  shadowSoft: 1, shadowStrength: 1, streaks: 0,
});

export class SceneView {
  constructor(...args) {
    finishBuild(this._buildStages(...args));
  }

  static *build(...args) {
    const view = Object.create(this.prototype);
    view._stagedStartup = true;
    yield* view._buildStages(...args);
    return view;
  }

  static create(...args) {
    const options = args[3] ?? {};
    return runBuild(this.build(...args), options.startup);
  }

  *_buildStages(canvas, city, registry, {
    reducedMotion = false, quality = 'high', post = true,
    // Hero-world default: mid-afternoon raking light so water edge, roofs and cars read
    // on the wide plate (late 0.865 was drowning the diorama in brown vignette).
    timeOfDay = 0.42,
  } = {}) {
    // COPY-DRAFT: startup progress.
    yield 'Preparing the renderer';
    this.shadowProxyEnabled = !(typeof location !== 'undefined'
      && new URLSearchParams(location.search).get('p09') === 'off');
    const frameOptions = readFrameOptions(typeof location !== 'undefined' ? location.search : '');
    this.canvas = canvas;
    this.city = city;
    this.state = null;
    this.reducedMotion = reducedMotion;
    this.quality = quality;
    // `?post=off` exists so a defect can be bisected between the render and the chain.
    this.postEnabled = post
      && !(typeof location !== 'undefined'
        && new URLSearchParams(location.search).get('post') === 'off');

    try {
      this.renderer = new THREE.WebGLRenderer({
        // Multisampling the default framebuffer buys nothing once every game pixel is
        // composed through the post chain; the AA stage owns edges now.
        canvas,
        antialias: !this.postEnabled && quality !== 'low',
        powerPreference: 'high-performance',
      });
    } catch (error) {
      // A blank canvas with no explanation is the worst possible failure. Say so.
      throw new Error(
        'This device could not start WebGL, so the board cannot be drawn. '
        + `Try a different browser or enable hardware acceleration. (${error.message})`,
      );
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'low' ? 1 : 1.75));
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // P19 X1B: one shadow map update per composed frame, not per inner render().
    this.renderer.shadowMap.autoUpdate = false;
    // The chain owns the transfer curve: AgX + a baked LUT in post.js. Leaving three's
    // tone mapping on would apply it twice for anything drawn straight to the canvas.
    this.renderer.toneMapping = this.postEnabled
      ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.32;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // A composed frame is many render() calls. Three would reset the counters on each of
    // them, so the frame budget would only ever see the last pass.
    this.renderer.info.autoReset = false;
    // Shared vertex prologue for the globe bend — before any material compiles.
    installWorldCurve(THREE);
    installCloudMottle(THREE);

    this.scene = new THREE.Scene();
    // Fallback sky tint if dome fails; sky mesh still owns the visible field.
    this.scene.background = new THREE.Color('#4a7ab0');
    const fogRange = fogRangeForExtent(city.extent);
    this.scene.fog = new THREE.Fog(
      new THREE.Color().setRGB(0.155, 0.138, 0.118, THREE.LinearSRGBColorSpace),
      fogRange.near,
      fogRange.far,
    );

    this.camera = new THREE.PerspectiveCamera(26, 1, 1, 2000);
    this.rig = new IsoCameraRig(this.camera, canvas, city.extent);
    this.rig.reducedMotion = reducedMotion;
    // Phone round P1 (L1): the phone layer's camera fit (src/ui/phone-fit.js), set by main.js; null here, and inert off the phone classes.
    this.phoneFit = null;

    yield 'Preparing the lighting';
    this.lighting = new LightingRig(this.scene, city.extent, {
      quality,
      timeOfDay,
      renderer: this.renderer,
    });
    this._applyAtmosphereLights();
    this.lighting.bakeEnvironment();

    // Presentation-only table cloth + contact disc under the city root (board owns plinth).
    this._mountTableGround(city.extent, quality);

    this.board = yield* Board.build(city, registry, { quality });
    this.board.setReducedMotion(reducedMotion);
    this.scene.add(this.board.root);
    // Materials from the library need the PMREM envMap; apply after board construction.
    this.lighting.applyEnvironmentToScene(this.scene);
    // V4 Wave P1: GTAO alone left kerbs and wall-footings as bright seams on the
    // farm/warehouse close. Keep the radial decal at a reduced opacity so the two
    // terms stack as a soft contact band rather than a double-ink silhouette.
    if (this.board.contactShadows && this.postEnabled && quality !== 'low') {
      this.board.contactShadows.visible = true;
      if (this.board.contactShadows.material) {
        this.board.contactShadows.material.opacity = P1_GROUNDING.contactDecalOpacity;
      }
    }

    // V3.10 §8 W2-NATURE — water / sky / foliage. Mount after the board so we can hide
    // its flat water plane and GLB tree groups without rewriting board.js (W2-ARCH).
    yield 'Building the sky';
    this.sky = new SkyDome(this.scene, city.extent, {
      quality,
      reducedMotion,
      timeOfDay,
    });
    // MS1: use the same procedural radiance as reflections at every camera angle.
    // Three's background cube is camera-centred and independent of the far plane.
    this.sky.mesh.visible = false;
    this.scene.background = this.lighting.environment;
    this.scene.backgroundIntensity = this.lighting.profile.envIntensity;
    yield 'Building the water';
    this.water = yield* WaterSurface.build(this.scene, city, {
      quality,
      reducedMotion,
      envMap: this.lighting.equirect,
      boardRoot: this.board.root,
      materials: this.board.materials,
    });
    this.water.setSolar(this.lighting.profile, sunDirection(this.lighting.profile));
    yield 'Planting the city trees';
    this.foliage = new FoliageLayer(this.scene, city, {
      quality,
      reducedMotion,
      boardRoot: this.board.root,
      publicTreePits: this.board.publicTreePits,
    });
    this.fringe = yield* FringeLayer.build(this.scene, city, { quality, reducedMotion, key: this.lighting.key }); // taste W79 (GROUND_SURFACE, G2b): the CPU-baked shade sides read the rig's key
    this.fringe.setProfile(this.lighting.profile, this.lighting.key);
    this.fringePickTargets = this.fringe.pickTargets;
    this.fringePickTargets = addPortWarehousePickTarget(this.fringe);
    this.fringePickTargets = addPortStructurePickTargets(this.fringe);
    // Diegetic surround (2 water / 2 land). Replaces the studio table as the
    // thing you see outside the city; fringe / beach / port sit on top.
    yield 'Building the outer landscape';
    this.edgeMassing = yield* EdgeMassingLayer.build(this.scene, city, { quality });
    this.edgeMassing.setProfile(this.lighting.profile);
    this.lighting.applyEnvironmentToScene(this.edgeMassing.root);
    placeKitBoard(this.scene, registry, this.fringe.plan, { groundSampler: hinterlandGroundSampler, surfaceY: this.fringe._sampleHinterlandY }); // K1: only with ?landmarks=kit-board
    // Foliage materials need the same env response as the rest of the board.
    this.lighting.applyEnvironmentToScene(this.foliage.root);
    // Restore tree easter eggs: tip / damage / disappear via mischief (props + trams too).
    this.board.registerFoliageMischiefTargets(this.foliage);
    this.board.registerBeachUmbrellaMischief(this.water);

    yield 'Adding the city life';
    this.people = new PeopleLayer(city, { camera: this.camera });
    yield 'Adding the auction crowd';
    this.auctionCrowd = new AuctionCrowdLayer(city);
    yield 'Adding traffic';
    this.traffic = new TrafficLayer(city, { quality, reducedMotion });
    yield 'Adding world deliveries';
    this.worldDeliveries = new WorldDeliveriesLayer(city, { quality, reducedMotion });
    yield 'Adding the military units';
    this.militaryUnits = new MilitaryUnitsLayer(city, { reducedMotion });
    this.militaryAttacks = new MilitaryAttacksLayer(city, { reducedMotion });
    this.militaryShipyard = new MilitaryShipyardLayer(city, { reducedMotion });
    this.militaryPickTargets = this.militaryUnits.pickTargets;
    this.board.registerTrafficMischief(this.traffic);
    const cityLife = !(typeof location !== 'undefined'
      && new URLSearchParams(location.search).get('cityLife') === '0');
    yield 'Adding street life';
    this.ambientLife = new AmbientLifeLayer(city, { quality, reducedMotion, cityLife });
    this.meshyPeople = new MeshyPeoplePool();
    if (this._stagedStartup) {
      installEmbeddedImageDecoder(this.meshyPeople.loader);
      installPeopleTextureWarmup(this.meshyPeople, this.renderer);
    }
    this.people.attachMeshy(this.meshyPeople);
    this.ambientLife.attachMeshy(this.meshyPeople);

    this.cityServices = new CityServicesLayer(city, { quality, reducedMotion });
    this._syncServicesNight();
    this.eventOverlays = new EventOverlayLayer(city);
    this.scene.add(
      this.eventOverlays.root,
      this.auctionCrowd.root,
      this.people.root,
      this.traffic.root,
      this.worldDeliveries.root,
      this.militaryUnits.root,
      this.militaryAttacks.root,
      this.militaryShipyard.root,
      this.ambientLife.root,
      this.meshyPeople.root,
      this.cityServices.root,
    );

    // Hero framing: bias default orbit so the water edge + sky are in the wide plate.
    this._frameHeroWorld(city);

    yield 'Preparing the effects';
    this.vfx = new Vfx(this.scene);
    // VFX-L3: the city gives the bushfire plume its parcel centres and the board the yaw each
    // building is drawn at (`?weatherLit=0` keeps the old ember ball and reads neither).
    this.weatherFx = mountWeatherFx(this.scene, THREE, {
      city, frontRotation: (parcel, archetypeId) => parcelBuildingTransform(parcel, archetypeId).rotation,
    });
    this.vfx.reducedMotion = reducedMotion;
    this.mischief = new Mischief(this.scene, this.board.mischiefTargets, {
      seed: city.seed,
      vfx: this.vfx,
      reducedMotion,
    });
    // Batch 1 owns the fixed priority slot. Batch 5 populates these proxies;
    // it must not reopen the categorical pick resolver.
    this.personPickTargets = this.people.pickTargets;
    // Frame city must NOT restore mischief — that was coupling camera reset to
    // world mutation and left players thinking picks broke after Frame (F).

    yield 'Preparing the picture';
    this.post = this.postEnabled
      ? new PostChain(this.renderer, {
        quality,
        reducedMotion,
        width: canvas.clientWidth || window.innerWidth,
        height: canvas.clientHeight || window.innerHeight,
        grade: this.lighting.profile.grade,
        ...(frameOptions.msaa === null ? {} : { msaa: frameOptions.msaa }),
      })
      : null;
    // taste W31 (GROUND_CREASE): the ambient-occlusion pass tells the hinterland from the board by the city's own extent.
    if (this.post?.boardExtent && city?.extent) this.post.boardExtent = { x: city.extent.x, z: city.extent.z };
    // taste W33 (CREASE_VENUES): and by the venue ground's own rectangles, so the pass and the list cannot drift apart.
    if (this.post?.venueRegions && city?.extent) this.post.venueRegions = venueGroundRegions(city.extent);
    this.post?.setBroadleafReceivers(this.foliage?.broadleafReceiverMeshes() ?? [], this.scene);
    // Frames driven through window.__districtDeck.step(n) submit one WebGL frame for many
    // simulation ticks, so the temporal resolve would never converge. When the previous
    // ticks were not drawn, the chain accumulates its jitter phases inside the one frame.
    this._skippedSinceRender = 0;
    // Two phases, not four. Every extra phase is another full scene render inside the one
    // captured frame, and on the capture harness's software rasteriser four of them made
    // Page.captureScreenshot flaky at 1600x1000.
    this.taaConvergeFrames = 2;

    yield 'Preparing the controls';
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    // Window capture, not canvas bubble: IsoCameraRig binds pointerdown on the
    // canvas without capture, so a window-capture hook runs first. A person
    // hit swallows only subsequent move/up; a miss leaves pan and parcel picks.
    this.peopleDrag = new PeopleDrag(this);
    this.peopleDrag.bind();
    this.clock = new THREE.Clock();
    this.running = false;
    this.hidden = document.hidden;
    this.frame = null;
    this.lastUpdateMs = 0;
    this._lifeAcc = 0;
    this._worldBatched = false;
    this.batching = null;

    this._onResize = () => this.resize();
    this._onVisibility = () => {
      this.hidden = document.hidden;
      if (!this.hidden) this.clock.getDelta(); // discard the gap
    };
    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', this._onVisibility);
    this._autoDpr = frameOptions.autoDpr
      ? new MotionPixelRatio(this.renderer.getPixelRatio(), this.camera) : null;
    this.resize();
    bindHeroCameraConsole(this);
    bindMilitaryDemoConsole(this);
    this.meshyPeople.load().catch(() => {});
  }

  /** Called after saved state and opening camera are applied, before start(). */
  async prepareStart(startup = {}) {
    const progress = startup.onProgress ?? (() => {});
    const yieldTask = startup.yieldTask ?? yieldToBrowser;
    // COPY-DRAFT: final loading stages.
    this.board.prepareWorld();
    await runBuild(this.water.prepareWorldSteps(), startup);
    this.fringe.prepareWorld();
    progress('Batching the city');
    await yieldTask();
    if (!this._worldBatched) {
      this.batching = await runBuild(batchStaticWorldSteps(this.scene, { quality: this.quality }), startup);
      this.lighting?.applyEnvironmentToScene(this.batching.root);
      this._worldBatched = true;
    }
    progress('Preparing the first picture');
    await yieldTask();
    // Install the same camera-dependent material hooks as the first draw, before
    // compilation, without advancing any simulation or drawing a hidden frame.
    this.lighting?.update(this.camera, this.rig.smoothTarget ?? this.rig.target,
      this.rig.smoothDistance ?? this.rig.distance, Boolean(this.photoCSM));
    this._applyPhotoShadow();
    await warmStart(this, startup);
  }

  hero(name) {
    return applyHeroFromView(this, name);
  }

  heroList() {
    return listHeroPresets();
  }

  /** The lighting rig owns key/fill/rim/bounce and the IBL; see lighting.js. */
  get keyLight() {
    return this.lighting?.key ?? null;
  }

  /**
   * Large dark table cloth + soft under-board shadow disc + premium map fringe.
   * Presentation only: the studio surface the diorama sits on.
   *
   * IMPORTANT: cloth must sit BELOW water troughs. Water lives near y≈0 with vertex
   * chop; if the cloth is only at y≈−0.12, wave troughs disappear under a grey plane.
   * Cloth is therefore deep under the board; rim/contact stay near the board seat.
   */
  _mountTableGround(extent, quality = 'high') {
    const board = Math.max(extent.x, extent.z);
    // Half the short axis — keep contact/rim inside the board so they never cover the bay.
    const halfMin = Math.min(extent.x, extent.z) * 0.5;
    const cx = extent.x / 2;
    const cz = extent.z / 2;
    this.tableRoot = new THREE.Group();
    this.tableRoot.name = 'presentation:table';

    // Deep under water (chop can reach ≈ −0.65). Waves stay above this plane.
    const CLOTH_Y = -0.95;
    // Cloth plane — large enough that every default orbit pose still sees table, not void.
    const clothRadius = board * 2.35;
    const segs = quality === 'low' ? 32 : 64;
    const clothGeom = new THREE.CircleGeometry(clothRadius, segs);
    clothGeom.rotateX(-Math.PI / 2);
    const clothMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setRGB(0.028, 0.024, 0.02, THREE.LinearSRGBColorSpace),
      roughness: 0.94,
      metalness: 0.015,
      envMapIntensity: 0.1,
    });
    clothMat.userData.envIntensityBase = 0.1;
    const cloth = new THREE.Mesh(clothGeom, clothMat);
    cloth.name = 'presentation:table-cloth';
    cloth.position.set(cx, CLOTH_Y, cz);
    cloth.receiveShadow = true;
    cloth.castShadow = false;
    cloth.renderOrder = -20;
    this.tableRoot.add(cloth);
    this.tableCloth = cloth;

    // Soft contact disc under the BOARD footprint only (not under the bay).
    // Must sit BELOW water trough floor (≈ −0.55): if the disc is near y≈0 it
    // paints charcoal over wave troughs and reads as a grey undertone under the bay.
    const discRadius = Math.min(board * 0.48, halfMin * 0.92);
    const discGeom = new THREE.CircleGeometry(discRadius, segs);
    discGeom.rotateX(-Math.PI / 2);
    const shadowMap = tableShadowTexture(quality === 'low' ? 64 : 128);
    const discMat = new THREE.MeshBasicMaterial({
      map: shadowMap,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      opacity: 1,
      fog: true,
    });
    const disc = new THREE.Mesh(discGeom, discMat);
    disc.name = 'presentation:table-contact';
    disc.position.set(cx, CLOTH_Y + 0.04, cz);
    disc.renderOrder = -15;
    this.tableRoot.add(disc);
    this.tableContact = disc;
    this._tableShadowMap = shadowMap;

    // Map fringe — three stacked rings so the city seats on a premium table edge, not void.
    // Keep rim under the board seat (near y=0) and inside halfMin so rings never enter the bay.
    const rimSegs = quality === 'low' ? 48 : 80;
    const apronOuter = Math.min(board * 0.58, halfMin * 1.05);
    const apronInner = Math.min(board * 0.52, apronOuter * 0.9);
    const lipOuter = Math.min(board * 0.525, apronInner * 1.01);
    const lipInner = Math.min(board * 0.505, lipOuter * 0.96);
    const shelfOuter = Math.min(board * 0.508, lipInner * 1.005);
    const shelfInner = Math.min(board * 0.492, shelfOuter * 0.97);

    const woodApron = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setRGB(0.09, 0.065, 0.04, THREE.LinearSRGBColorSpace),
      roughness: 0.82,
      metalness: 0.06,
      envMapIntensity: 0.18,
    });
    woodApron.userData.envIntensityBase = 0.18;
    const woodLip = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setRGB(0.16, 0.11, 0.07, THREE.LinearSRGBColorSpace),
      roughness: 0.68,
      metalness: 0.1,
      envMapIntensity: 0.28,
    });
    woodLip.userData.envIntensityBase = 0.28;
    const woodShelf = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setRGB(0.055, 0.04, 0.028, THREE.LinearSRGBColorSpace),
      roughness: 0.9,
      metalness: 0.04,
      envMapIntensity: 0.12,
    });
    woodShelf.userData.envIntensityBase = 0.12;

    const apronGeom = new THREE.RingGeometry(apronInner, apronOuter, rimSegs);
    apronGeom.rotateX(-Math.PI / 2);
    const apron = new THREE.Mesh(apronGeom, woodApron);
    apron.name = 'presentation:table-rim-apron';
    apron.position.set(cx, -0.055, cz);
    apron.receiveShadow = true;
    apron.renderOrder = -14;
    this.tableRoot.add(apron);

    const lipGeom = new THREE.RingGeometry(lipInner, lipOuter, rimSegs);
    lipGeom.rotateX(-Math.PI / 2);
    const lip = new THREE.Mesh(lipGeom, woodLip);
    lip.name = 'presentation:table-rim';
    lip.position.set(cx, -0.008, cz);
    lip.receiveShadow = true;
    lip.castShadow = quality !== 'low';
    lip.renderOrder = -12;
    this.tableRoot.add(lip);
    this.tableRim = lip;

    const shelfGeom = new THREE.RingGeometry(shelfInner, shelfOuter, rimSegs);
    shelfGeom.rotateX(-Math.PI / 2);
    const shelf = new THREE.Mesh(shelfGeom, woodShelf);
    shelf.name = 'presentation:table-rim-shelf';
    shelf.position.set(cx, -0.028, cz);
    shelf.receiveShadow = true;
    shelf.renderOrder = -13;
    this.tableRoot.add(shelf);
    this.tableRimShelf = shelf;
    this.tableRimApron = apron;

    if (quality !== 'low') {
      const faceH = 0.055;
      const faceGeom = new THREE.CylinderGeometry(
        (lipOuter + lipInner) * 0.5,
        (lipOuter + lipInner) * 0.5,
        faceH,
        rimSegs,
        1,
        true,
      );
      const face = new THREE.Mesh(faceGeom, woodLip);
      face.name = 'presentation:table-rim-face';
      face.position.set(cx, -0.008 - faceH * 0.5, cz);
      face.receiveShadow = true;
      face.castShadow = false;
      face.renderOrder = -12;
      this.tableRoot.add(face);
      this.tableRimFace = face;
      this._tableRimFaceGeom = faceGeom;
    }

    this._tableRimGeoms = [apronGeom, lipGeom, shelfGeom];
    this._tableRimMats = [woodApron, woodLip, woodShelf];

    this.scene.add(this.tableRoot);
    // Retired: the studio table reads as a separate plate against water and
    // hinterland. Edge massing is the diegetic surround; keep the group so
    // fringe's rim-hide lookup still resolves.
    this.tableRoot.visible = false;
  }

  /**
   * Default camera pose for the Monopoly-Plus diorama read: water edge in frame,
   * slightly elevated, board seated on table cloth with sky above. Presentation only.
   */
  _frameHeroWorld(city) {
    const DEG = Math.PI / 180;
    const rig = this.rig;
    if (!rig || !city?.extent) return;
    const cx = city.extent.x * 0.5;
    const cz = city.extent.z * 0.5;
    const board = Math.max(city.extent.x, city.extent.z);
    // Hero R10: target near shore (extent - 20) so sand+water sit in the right third
    // of a 1600×1000 plate for waterEdge east. FOV ~32°, polar ~32°.
    const edge = city.waterEdge;
    const shorePull = 20;
    if (edge === 'east') {
      rig.target.set(city.extent.x - shorePull, 0, cz);
      rig.azimuth = -78 * DEG; // look toward +X water
    } else if (edge === 'west') {
      rig.target.set(shorePull, 0, cz);
      rig.azimuth = -12 * DEG;
    } else if (edge === 'south') {
      rig.target.set(cx, 0, city.extent.z - shorePull);
      rig.azimuth = -52 * DEG;
    } else if (edge === 'north') {
      rig.target.set(cx, 0, shorePull);
      rig.azimuth = -38 * DEG;
    } else {
      rig.target.set(cx, 0, cz);
      rig.azimuth = -45 * DEG;
    }
    rig.polar = 32 * DEG;
    // Pull back so sky band + beach mass + board all fit the wide plate.
    rig.distance = Math.min(rig.maxDistance * 0.92, board * 1.18);
    if (this.camera) {
      this.camera.fov = 32;
      this.camera.updateProjectionMatrix();
    }
    rig.smoothTarget.copy(rig.target);
    rig.smoothAzimuth = rig.azimuth;
    rig.smoothPolar = rig.polar;
    rig.smoothDistance = rig.distance;
    rig.update(1);
  }

  /** Start with a legible civic block; parcel selection supplies the close-up. */
  frameOpeningCity(city) {
    const rig = this.rig;
    if (!rig || !city?.extent) return;
    const centre = city.reserve?.centre ?? {
      x: city.extent.x * 0.5, z: city.extent.z * 0.5,
    };
    const span = Math.max(city.extent.x, city.extent.z);
    this.camera.fov = 36;
    this.camera.updateProjectionMatrix();
    rig.focus(centre, { distance: span * 0.78 });
    rig.azimuth = -38 * Math.PI / 180;
    rig.polar = 44 * Math.PI / 180;
    rig.smoothTarget.copy(rig.target);
    rig.smoothDistance = rig.distance;
    rig.smoothAzimuth = rig.azimuth;
    rig.smoothPolar = rig.polar;
    rig.update(1);
    // Phone round P1 (L1): on tall and short windows the opening is fitted into the room the HUD leaves (a no-op on wide and with ?phoneHud=0).
    this.phoneFit?.opening(city);
  }

  _applyAtmosphereLights() {
    const { key, fill, skyFloor, profile } = this.lighting;
    // Preserve sunrise/sunset while holding the working daylight sun at 42 degrees.
    const daylight = Math.min(1, Math.sin(this.lighting.timeOfDay * Math.PI) / 0.90);
    profile.elevation = P23_LIGHT_PHOTO.elevation * daylight;
    profile.azimuth = P23_LIGHT_PHOTO.azimuth;
    this.lighting._applyProfile();
    key.intensity = profile.keyIntensity * P23_LIGHT_PHOTO.keyGain;
    fill.intensity = profile.fillIntensity * P23_LIGHT_PHOTO.fillGain;
    scaleSkyFloorRaw(skyFloor, P23_LIGHT_PHOTO.skyGain * grade3HemisphereScale());
    r9LightColor(profile.keyColor, P23_LIGHT_PHOTO.keyRGB, key.color);
    r9LightColor(profile.fillColor, P23_LIGHT_PHOTO.fillRGB, fill.color);
    r9LightColor(profile.skyColor, P23_LIGHT_PHOTO.fillRGB, skyFloor.color);
    // Hemisphere ground bounce reaches vertical faces at half strength, while
    // upward-facing roads retain exactly the R sky irradiance and cast shadows.
    r9LightColor(profile.groundColor, P23_LIGHT_PHOTO.hemisphereGroundRGB, skyFloor.groundColor);
    skyFloor.groundColor.multiplyScalar(P23_LIGHT_PHOTO.hemisphereGroundGain);
  }

  _applyPhotoShadow() {
    const light = this.lighting.key;
    // Recompute from the solar base so repeated wet frames never compound.
    const skyState = weatherOf(this.state).state;
    const cloud = skyState === 'heavy-rain' ? 1 : skyState === 'rain' ? 0.8 : 0;
    const wet = RAIN_LIGHT[skyState] ?? DRY_LIGHT;
    const sunGain = wet.sun;
    // Rain sky and rain sun colour (TASTE_RAIN): the dome becomes the grey gradient and the key
    // turns neutral warm white (#F2EEE8, same hue as the clear key, no blue) at its own energy.
    // Clear restores the dry key exactly once, from the same call that built it.
    this.sky?.setOvercast?.(Math.min(1, cloud * 1.25));
    {
      const lum = (c) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
      const dryKey = this._dryKeyColour ??= new THREE.Color();
      if (cloud > 0) {
        r9LightColor(this.lighting.profile.keyColor, P23_LIGHT_PHOTO.keyRGB, dryKey);
        const rainKey = this._rainKeyColour ??= new THREE.Color(TASTE_RAIN.sunColour);
        // Fully neutral (#F2EEE8 alone) left the cool fill and sky to tint every grey: blue-hue
        // neutrals went from 18% to 52% against a 30% cap. 40% of the way keeps the key warm.
        light.color.copy(dryKey).lerp(rainKey.clone().multiplyScalar(lum(dryKey) / Math.max(1e-6, lum(rainKey))), 0.4);
        this._keyColourWet = true;
      } else if (this._keyColourWet) {
        r9LightColor(this.lighting.profile.keyColor, P23_LIGHT_PHOTO.keyRGB, light.color);
        this._keyColourWet = false;
      }
    }
    // Cloud-shadow mottle on the key: rain and heavy rain only, drifting at 3 m/s (TASTE_RAIN.mottle).
    updateCloudMottle(skyState === 'rain' || skyState === 'heavy-rain' ? 1 : 0, performance.now() / 1000);
    const diffuseGain = 1 - 0.40 * cloud;
    // The shadow tint is the hemisphere light's colour, and the blue sky made shaded asphalt S 32 at
    // station 02 (#2C2C40). Pulling the sky and fill chroma toward grey by SHADOW_TINT_CLOUD in every
    // weather keeps shaded neutrals under S 18; the rain state adds its own on top.
    const lightCloud = Math.max(wet.lightCloud, SHADOW_TINT_CLOUD);
    const { profile, fill, rim, bounce, skyFloor } = this.lighting;
    // Rain dims and softens the key (RAIN_LIGHT), it does not remove it, so cast shadows and
    // the geometric AO keep seating every form. The hemisphere rises by at most 1.3x.
    light.intensity = profile.keyIntensity * P23_LIGHT_PHOTO.keyGain * sunGain;
    fill.intensity = profile.fillIntensity * P23_LIGHT_PHOTO.fillGain * wet.fill;
    rim.intensity = profile.rimIntensity * sunGain;
    bounce.intensity = profile.bounceIntensity * wet.bounce;
    skyFloor.intensity = P1_LIGHT.skyFloorIntensity * P23_LIGHT_PHOTO.skyGain * wet.hemisphere * grade3HemisphereScale();
    if (this._photoWeatherProfile !== profile || this._photoCloud !== lightCloud) {
      // Reconstruct the exact dry colours before any weather mix, including time changes.
      r9LightColor(profile.fillColor, P23_LIGHT_PHOTO.fillRGB, fill.color);
      r9LightColor(profile.skyColor, P23_LIGHT_PHOTO.fillRGB, skyFloor.color);
      r9LightColor(profile.groundColor, P23_LIGHT_PHOTO.hemisphereGroundRGB, skyFloor.groundColor);
      skyFloor.groundColor.multiplyScalar(P23_LIGHT_PHOTO.hemisphereGroundGain);
      rim.color.copy(profile.horizonColor);
      bounce.color.copy(profile.groundColor);
      if (lightCloud > 0) {
        overcastLightColor(fill.color, lightCloud);
        overcastLightColor(skyFloor.color, lightCloud);
        overcastLightColor(skyFloor.groundColor, lightCloud);
        overcastLightColor(rim.color, lightCloud);
        overcastLightColor(bounce.color, lightCloud);
      }
      this._photoWeatherProfile = profile;
      this._photoCloud = lightCloud;
    }
    // The registry owns explicit material envMaps; weather never rebakes their texture.
    this.lighting.setWeatherEnvironmentGain(wet.env);
    if (this.post) {
      this._photoContactBase ??= this.post.contactDarkness;
      // Post's existing accessor updates the sun-contact channel, leaving GTAO unchanged.
      // The contact pass stays on in rain: wet ground makes a form's footing darker, not lighter.
      this.post.contactDarkness = this._photoContactBase * wet.contact;
      this.post.rain = wet.streaks;
    }
    this.water?.uniforms?.uAquaWeather?.value.set(cloud, diffuseGain, sunGain);
    const shadow = light.shadow;
    shadow.radius = P23_LIGHT_PHOTO.shadowRadius * wet.shadowSoft;
    shadow.intensity = P23_LIGHT_PHOTO.shadowIntensity * wet.shadowStrength;
    shadow.bias = P23_LIGHT_PHOTO.shadowBias;
    shadow.normalBias = P23_LIGHT_PHOTO.shadowNormalBias;
    if (!light.castShadow) return;
    // Keep the rig key as the solar/caster-budget authority; CSM replaces its draw.
    light.visible = false;
    if (!this.photoCSM) {
      this.photoCSM = new CSM({
        camera: this.camera, parent: this.scene,
        cascades: P23_LIGHT_PHOTO.shadowCascades,
        maxFar: P23_LIGHT_PHOTO.shadowCascadeFar,
        shadowMapSize: P23_LIGHT_PHOTO.shadowCascadeMapSize,
        mode: 'custom', lightMargin: 400, lightNear: 1, lightFar: 3000,
        customSplitsCallback: (count, near, far, breaks) => {
          for (const end of P23_LIGHT_PHOTO.shadowCascadeEnds) breaks.push(Math.min(end / far, 1));
          breaks.push(1);
        },
      });
      this._photoMaterials = new Map();
      if (!this._photoDrawDirect) {
        this._photoFarTiny = new WeakSet();
        this._photoFarClassified = new WeakSet();
        const renderer = this.renderer;
        this._photoDrawDirect = renderer.renderBufferDirect;
        // Keep near and colour draws intact. Only the board-scale depth pass
        // omits detail casters; never change a shared material or castShadow flag.
        renderer.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
          classifyPhotoCaster(object, this._photoFarClassified, this._photoFarTiny);
          if (camera === this._photoFarLight?.shadow.camera && this._photoFarTiny.has(object)) return;
          registerPhotoMaterial(material, this.photoCSM, this._photoMaterials);
          return this._photoDrawDirect.call(renderer, camera, scene, geometry, material, object, group);
        };
      }
    }
    // Owned CPU math scratch: overwritten completely before use, with no render resources.
    const math = this._photoMath ??= {
      receiverFrustum: new THREE.Frustum(), viewProjection: new THREE.Matrix4(),
      sphere: new THREE.Sphere(), tip: new THREE.Vector3(),
      farBounds: new THREE.Box3(), farCorner: new THREE.Vector3(), farCentre: new THREE.Vector3(),
      projectionMatrix: new THREE.Matrix4(), projectionKey: null,
    };
    if (this.shadowProxy) this._syncShadowProxy();
    const csm = this.photoCSM;
    csm.lightDirection.copy(sunDirection(this.lighting.profile)).negate();
    if (math.projectionKey === null || !math.projectionMatrix.equals(this.camera.projectionMatrix)) {
      math.projectionMatrix.copy(this.camera.projectionMatrix);
      math.projectionKey = this.camera.projectionMatrix.elements.join(',');
    }
    const projection = math.projectionKey;
    if (this._photoProjection !== projection) {
      csm.updateFrustums();
      const near = csm.lights[0].shadow.camera;
      this._photoNearBase = { left: near.left, right: near.right, top: near.top, bottom: near.bottom };
      this._photoProjection = projection;
    }
    // CSM's centre snapping must use its original density, not yesterday's crop.
    Object.assign(csm.lights[0].shadow.camera, this._photoNearBase);
    csm.update();
    // Replace the spherical 160m cutoff with a conservative camera receiver
    // test: keep the caster and its full sun-projected volume down to apron level.
    // Off-screen silhouettes that can shadow visible ground remain eligible.
    const receiverFrustum = math.receiverFrustum.setFromProjectionMatrix(
      math.viewProjection.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    const sphere = math.sphere, tip = math.tip;
    const sun = sunDirection(this.lighting.profile);
    for (const mesh of this.scene.userData.batching?.casters ?? []) {
      if (!mesh) continue;
      if (mesh.userData.shadowCulledSize) {
        mesh.castShadow = false;
        if (mesh.userData.shadowMesh) mesh.userData.shadowMesh.castShadow = false;
        continue;
      }
      const bounds = mesh.boundingSphere ?? mesh.geometry?.boundingSphere;
      let relevant = true;
      if (bounds) {
        sphere.copy(bounds).applyMatrix4(mesh.matrixWorld);
        const height = Math.max(0, sphere.center.y + sphere.radius + 12);
        tip.copy(sun).multiplyScalar(-height / Math.max(0.05, sun.y));
        sphere.center.addScaledVector(tip, 0.5);
        sphere.radius += tip.length() * 0.5 + 8; // curved-world displacement allowance
        relevant = receiverFrustum.intersectsSphere(sphere);
      }
      const proxy = mesh.userData.shadowMesh;
      mesh.castShadow = relevant && !mesh.userData.shadowMovedToLod;
      if (proxy) proxy.castShadow = relevant && !!mesh.userData.shadowMovedToLod;
    }
    for (const record of this.scene.userData.lodState?.records ?? []) {
      if (record.level === 2 || record.level === 'impostor' || record.level === 'hide') {
        record.mesh.castShadow = false;
        if (record.mesh.userData.shadowMesh) record.mesh.userData.shadowMesh.castShadow = false;
      }
    }
    for (const cascade of csm.lights) {
      cascade.color.copy(light.color);
      cascade.intensity = light.intensity;
      Object.assign(cascade.shadow, {
        radius: (cascade === csm.lights[0] ? P23_LIGHT_PHOTO.shadowNearRadius : P23_LIGHT_PHOTO.shadowRadius) * wet.shadowSoft,
        intensity: P23_LIGHT_PHOTO.shadowIntensity * wet.shadowStrength,
        bias: P23_LIGHT_PHOTO.shadowBias, normalBias: P23_LIGHT_PHOTO.shadowNormalBias,
      });
    }
    // The final cascade also encloses off-screen apron stations. The near map
    // retains its camera-local density; all far receivers have a fallback map.
    const farLight = csm.lights.at(-1);
    this._photoFarLight = farLight;
    farLight.updateMatrixWorld(true); farLight.target.updateMatrixWorld(true);
    farLight.shadow.updateMatrices(farLight);
    const camera = farLight.shadow.camera;
    const extent = this.city?.extent ?? { x: 272, z: 272 };
    const [west, east, north, south] = P23_LIGHT_PHOTO.shadowFringe;
    const box = math.farBounds.makeEmpty();
    for (const x of [-west, extent.x + east]) for (const z of [-north, extent.z + south]) {
      for (const y of P23_LIGHT_PHOTO.shadowHeight) {
        box.expandByPoint(math.farCorner.set(x, y, z).applyMatrix4(camera.matrixWorldInverse));
      }
    }
    // Beyond the board/aprons there are no authored terrestrial receivers.
    // Fit that prism tightly rather than wasting far-map texels on empty sky.
    const radius = Math.ceil(Math.max(box.max.x - box.min.x, box.max.y - box.min.y) / 2) + 1;
    const centre = box.getCenter(math.farCentre);
    const texel = 2 * radius / csm.shadowMapSize;
    centre.x = Math.round(centre.x / texel) * texel;
    centre.y = Math.round(centre.y / texel) * texel;
    Object.assign(camera, {
      left: centre.x - radius, right: centre.x + radius,
      top: centre.y + radius, bottom: centre.y - radius,
    });
    camera.updateProjectionMatrix();
    // Near shadows track every composed frame. At rest, reuse the far map for
    // one frame; camera/projection/sun changes invalidate it immediately.
    // Ignore sub-micrometre orbit damping residue, well below a shadow texel.
    const moved = !this._photoShadowCamera
      || this.camera.matrixWorld.elements.some((value, i) => Math.abs(value - this._photoShadowCamera.elements[i]) > 1e-7)
      || this._photoShadowProjection !== projection || !this._photoShadowSun?.equals(sun);
    this._photoShadowCamera ??= new THREE.Matrix4();
    this._photoShadowSun ??= new THREE.Vector3();
    this._photoShadowCamera.copy(this.camera.matrixWorld);
    this._photoShadowSun.copy(sun);
    this._photoShadowProjection = projection;
    this._photoIdleFrame = moved ? 0 : 1 - (this._photoIdleFrame ?? 0);
    farLight.shadow.autoUpdate = false;
    farLight.shadow.needsUpdate ||= moved || this._photoIdleFrame === 0 || !farLight.shadow.map;
    const nearLight = csm.lights[0];
    if (moved || this._photoNearCropLight !== nearLight) {
      // Clip the near view volume to the authored ground/receiver prism. Include
      // roofs and raised receivers as well as ground, so tightening cannot cut
      // a visible building's shadow. Shadow casters share receiver light-space XY.
      const verts = [...csm.frustums[0].vertices.near, ...csm.frustums[0].vertices.far]
        .map(v => v.clone().applyMatrix4(this.camera.matrixWorld));
      const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
      const limits = [['x', -west, extent.x + east], ['y', ...P23_LIGHT_PHOTO.shadowHeight], ['z', -north, extent.z + south]];
      const points = [];
      for (const face of faces) {
        let polygon = face.map(i => verts[i]);
        for (const [axis, min, max] of limits) for (const [bound, sign] of [[min, 1], [max, -1]]) {
          const clipped = [];
          for (let i = 0; i < polygon.length; i++) {
            const a = polygon[i], b = polygon[(i + 1) % polygon.length];
            const da = (a[axis] - bound) * sign, db = (b[axis] - bound) * sign;
            if (da >= 0) clipped.push(a);
            if ((da >= 0) !== (db >= 0)) clipped.push(a.clone().lerp(b, da / (da - db)));
          }
          polygon = clipped;
        }
        points.push(...polygon);
      }
      // Box corners inside the view complete the intersection when a box face
      // never crosses an original frustum edge (including full containment).
      const centre = verts.reduce((sum, v) => sum.add(v), new THREE.Vector3()).multiplyScalar(1 / 8);
      const planes = faces.map(f => {
        const plane = new THREE.Plane().setFromCoplanarPoints(verts[f[0]], verts[f[1]], verts[f[2]]);
        return plane.distanceToPoint(centre) < 0 ? plane.negate() : plane;
      });
      for (const x of limits[0].slice(1)) for (const y of limits[1].slice(1)) for (const z of limits[2].slice(1)) {
        const p = new THREE.Vector3(x, y, z);
        if (planes.every(plane => plane.distanceToPoint(p) >= -1e-6)) points.push(p);
      }
      nearLight.updateMatrixWorld(true); nearLight.target.updateMatrixWorld(true);
      nearLight.shadow.updateMatrices(nearLight);
      const bounds = new THREE.Box3();
      for (const p of points) bounds.expandByPoint(p.clone().applyMatrix4(nearLight.shadow.camera.matrixWorldInverse));
      const base = this._photoNearBase, texel = (base.right - base.left) / csm.shadowMapSize;
      const crop = { ...base };
      if (!bounds.isEmpty()) {
        // Retain the receiver-volume cull's 8m curved-world allowance, with
        // outward snapping. Empty intersections conservatively keep the base.
        crop.left = Math.max(base.left, Math.floor((bounds.min.x - 8) / texel) * texel);
        crop.right = Math.min(base.right, Math.ceil((bounds.max.x + 8) / texel) * texel);
        crop.bottom = Math.max(base.bottom, Math.floor((bounds.min.y - 8) / texel) * texel);
        crop.top = Math.min(base.top, Math.ceil((bounds.max.y + 8) / texel) * texel);
      }
      this._photoNearCrop = crop.right > crop.left && crop.top > crop.bottom ? crop : base;
      this._photoNearCropLight = nearLight;
    }
    Object.assign(nearLight.shadow.camera, this._photoNearCrop);
    nearLight.shadow.camera.updateProjectionMatrix();
    this.lighting.lastShadowFit = {
      cascades: csm.cascades, mapSize: csm.shadowMapSize,
      texel: (csm.lights[0].shadow.camera.right - csm.lights[0].shadow.camera.left) / csm.shadowMapSize,
      wholeBoard: true,
    };
    // First build follows contact restoration and the final receiver flags.
    if (!this.shadowProxy) this._syncShadowProxy();
  }

  _syncShadowProxy() {
    if (!this.shadowProxyEnabled || !this._worldBatched || !this.photoCSM) return;
    // One-time build, layer, and photoCSM wiring. The shadow pass syncs after
    // the renderer's matrix update; a frame with no shadow pass does not.
    this.shadowProxy ??= buildStaticShadowProxy(this.scene, this.batching, {
      layer: SHADOW_LAYER, extent: this.city.extent, photoCSM: this.photoCSM,
      farTiny: this._photoFarTiny, renderer: this.renderer,
    });
    this.camera.layers.disable(SHADOW_LAYER);
    this.shadowProxy.photoCSM = this.photoCSM;
  }

  setTimeOfDay(t) {
    const profile = this.lighting.setTimeOfDay(t);
    this._applyAtmosphereLights();
    this._syncServicesNight();
    if (this.post) this.post.setGrade(profile.grade);
    // Sky dome and water glitter share the same solar profile as the lighting rig.
    const sun = sunDirection(profile);
    this.sky?.setProfile(profile, sun);
    this.water?.setEnvMap(this.lighting.equirect);
    this.water?.setSolar(profile, sun);
    // Table cloth follows ground bounce colour so time-of-day stays coherent.
    if (this.tableCloth?.material?.color && profile.groundColor) {
      this.tableCloth.material.color.copy(profile.groundColor).multiplyScalar(0.55);
    }
    // Keep fog/background keyed to sky so the bay never milks to grey void.
    this.fringe?.setProfile(profile, this.lighting.key);
    this.edgeMassing?.setProfile(profile);
    if (this.scene.fog) {
      applyP1FogColor(this.scene.fog, profile);
      if (this.scene.background?.isColor && profile.skyColor) {
        this.scene.background.copy(profile.skyColor).multiplyScalar(0.92);
      }
    }
    return profile;
  }

  /** V-SERVICES beacons follow the street lamps' curve, lampLevel of the rig's sun arc: 0 by day, 1 at night. */
  _syncServicesNight() {
    this.cityServices?.setNight(lampLevel(this.lighting?.profile?.arc));
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    if (this.post) {
      const ratio = this.renderer.getPixelRatio();
      const [pw, ph] = capInternalSize(width, height, ratio);
      this.post.setSize(pw, ph);
    }
  }

  _updatePixelRatio(nowMs) {
    // Stopped/manual QA stepping keeps its pinned ratio throughout a capture.
    if (!this._autoDpr || !this.running) return;
    const ratio = this._autoDpr.update(this.camera, nowMs);
    if (ratio === this.renderer.getPixelRatio()) return;
    this.renderer.setPixelRatio(ratio);
    this.resize(); // Rebuild/rebind post targets and invalidate TAA history on a size change.
  }

  _pickPerson(raycaster) {
    return nearestProxyHit(raycaster, this.personPickTargets, 'person', 'personId');
  }

  _pickProp(raycaster) {
    return nearestProxyHit(raycaster, this.board.mischiefPickTargets, 'prop', 'mischiefKey');
  }

  _pickFringe(raycaster) {
    return nearestProxyHit(raycaster, this.fringePickTargets ?? [], 'fringe', 'fringeId');
  }

  _pickUnit(raycaster) {
    this.militaryPickTargets = this.militaryUnits?.pickTargets ?? [];
    return nearestProxyHit(raycaster, this.militaryPickTargets, 'unit', 'unitId');
  }

  /** Screen coordinates -> the fixed person/prop/fringe/land/ground path. */
  pickAt(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    compensatePickRay(this.raycaster, this.camera);
    const construction = findConstructionTap(this, clientX, clientY);
    const board = this.board.pickLayers(this.raycaster);
    const cameraDistance = this.rig?.smoothDistance ?? this.rig?.distance ?? 0;
    const coast = this.water?.pickAt?.(this.raycaster) ?? null;
    return resolvePickPriority({
      person: this._pickPerson(this.raycaster),
      prop: this._pickProp(this.raycaster),
      unit: this._pickUnit(this.raycaster),
      fringe: this._pickFringe(this.raycaster),
      construction,
      water: coast?.kind === 'water' ? coast : null,
      sand: coast?.kind === 'sand' ? coast : null,
      ...board,
    }, { cameraDistance });
  }

  worldOf(selectionOrId) {
    let selection = typeof selectionOrId === 'string'
      ? activeParcel(this.city, this.state, selectionOrId)
        ? { kind: 'parcel', id: selectionOrId }
        : this.city.civicUses?.some((civic) => civic.id === selectionOrId)
          ? { kind: 'civic', id: selectionOrId }
          : this.city.reserve?.id === selectionOrId
            ? { kind: 'reserve', id: selectionOrId }
            : null
      : selectionOrId;
    if (selection?.kind === 'parcel' && !activeParcel(this.city, this.state, selection.id)) {
      const resolved = resolveCurrentParcelId(this.city, this.state, selection.id);
      selection = resolved ? { kind: 'parcel', id: resolved } : null;
    }
    const entity = selection?.kind === 'parcel'
      ? activeParcel(this.city, this.state, selection.id)
      : selection?.kind === 'civic'
        ? this.city.civicUses?.find((civic) => civic.id === selection.id)
        : selection?.kind === 'reserve' && this.city.reserve?.id === selection.id
          ? this.city.reserve
          : null;
    return entity?.centre ?? null;
  }

  /** One simulation + render tick. Separated so QA can drive frames deterministically. */
  step(dt, elapsed, onFrame = () => {}, render = true) {
    const trace = render && !this._bootFrameTraced ? bootTrace(this, 'first-frame') : null;
    try {
      const cpu0 = performance.now();
      this.rig.update(dt);
      // Last-frame peds: trams must see walkers on the reservation before they step,
      // the same way cars consume `_lastCrossingPeds` below.
      setReservationPedestrians(this._lastCrossingPeds ?? []);
      this.board.update(dt, elapsed);
      tickConstructionSites(this.board, dt, elapsed);
      this.sky?.update(dt, elapsed);
      this.water?.update(dt, elapsed);
      this.fringe?.update?.(dt, elapsed);
      this.foliage?.update(dt, elapsed);
      // P19 X1B: traffic / people / ambient / auction on a 20 Hz tick. The
      // accumulated dt is the interpolation step — pose systems integrate it
      // once rather than allocating between frames.
      this._lifeAcc += dt;
      const lifeStep = 1 / LIFE_TICK_HZ;
      let lifeDt = 0;
      if (this._lifeAcc >= lifeStep) {
        lifeDt = this._lifeAcc;
        this._lifeAcc = 0;
      }
      // Cars, then the published road-user list, then people — a pedestrian cannot
      // yield to a tram that has not stepped this frame. Last-frame peds occupy
      // the box so a green car does not drive through a legal crossing.
      this.traffic?.setPedestrians?.(this._lastCrossingPeds ?? []);
      if (lifeDt > 0) this.traffic?.update(lifeDt, elapsed);
      this.worldDeliveries?.update(dt, elapsed, this.city, this.state);
      this.militaryUnits?.update(dt, elapsed, this.city, this.state);
      this.militaryAttacks?.update(dt, elapsed, this.city, this.state, this.militaryUnits);
      this.militaryShipyard?.update(dt, elapsed, this.city);
      bindMilitaryDemoConsole(this);
      const roadUsers = collectRoadUsers(this.board, this.traffic);
      this.people.setRoadUsers(roadUsers);
      this.people.setSignalClock?.(elapsed, this.city?.seed);
      if (lifeDt > 0) this.people.update(lifeDt);
      // V3.32: the auction ring is posed by the same idle solver the cast is, so it needs the same
      // clock. Without this tick forty bidders hold one frame of a breath while the consultants
      // beside them keep moving, which is §2.7's statue fault arrived at from the other direction.
      if (lifeDt > 0) this.auctionCrowd.update(lifeDt);
      this.ambientLife?.setRoadUsers(roadUsers);
      if (lifeDt > 0) this.ambientLife?.update(lifeDt, elapsed);
      const peds = [
        ...(this.people.queryCrossingPeds?.() ?? []),
        ...(this.ambientLife?.queryCrossingPeds?.() ?? []),
      ];
      this._lastCrossingPeds = peds;
      const crossings = this.people.world?.crossings
        ?? this.ambientLife?.world?.crossings
        ?? [];
      const hits = detectPedestrianHits(roadUsers, peds, crossings, elapsed);
      if (
        hits.length
        && typeof this.onCrossingHit === 'function'
        && quarterAllowsCrossingAccident(this.city?.seed, this.state?.quarter ?? 1)
      ) {
        this.onCrossingHit(hits[0]);
      }
      this.cityServices?.update(dt, elapsed);
      this.eventOverlays.update(elapsed);
      this.mischief.update(dt);
      this.vfx.update(dt);
      updateWeatherFx(this.state, dt, {
        city: this.city, arc: this.lighting?.profile?.arc, reducedMotion: this.reducedMotion,
      });
      if (!this._worldBatched) {
        this.scene.updateMatrixWorld(true);
        this.batching = batchStaticWorld(this.scene, { quality: this.quality });
        // Colour-instancing clones materials after the initial environment walk.
        // Register only the newly created batch root, once, before the first colour draw.
        this.lighting?.applyEnvironmentToScene(this.batching.root);
        this._worldBatched = true;
      }
      this.lastUpdateMs = performance.now() - cpu0;
      onFrame(dt, elapsed);
      if (!render) {
        this._skippedSinceRender += 1;
        return;
      }
      if (this._autoDpr) this._updatePixelRatio(performance.now());
      const focusDistance = this.rig.smoothDistance ?? this.rig.distance;
      // Elevation gate for the miniature DOF: full at board pitch (>=26 deg),
      // gone near street pitch (<=11.5 deg), so hero low-angle shots stay sharp.
      const pitchRad = this.rig.smoothPolar ?? this.rig.polar ?? 0.56;
      const dofScale = Math.min(1, Math.max(0, (pitchRad - 0.20) / 0.25));
      // Fog range rides the camera distance, not the board extent: an authored
      // extent-based band greys the whole board out at the default orbit
      // distance. Depth separation starts past the focus plane and releases
      // over roughly two board spans behind it.
      if (this.scene.fog) {
        const span = Math.max(this.city?.extent?.x ?? 272, this.city?.extent?.z ?? 272);
        this.scene.fog.near = focusDistance * 0.9 + span * 0.25;
        this.scene.fog.far = focusDistance + span * 2.2;
      }
      const worldCurvature = updateWorldCurveFromRig(this.rig, this.city?.extent);
      this.fringe?.updateViewDetail?.(worldCurvature === 0 ? this.camera : null,
        this.canvas.width, this.canvas.height);
      this.lighting?.update(
        this.camera,
        this.rig.smoothTarget ?? this.rig.target,
        focusDistance,
        // Once CSM exists, the immediately following receiver test owns caster flags.
        Boolean(this.photoCSM),
      );
      this._applyPhotoShadow();
      // P16-W6: register the planar reflection camera for this frame. The
      // mirrored render of the port's large forms has to exist before the water
      // that samples it is drawn, and it must not be inside the post chain's
      // render-target bookkeeping, so it happens here and nowhere else.
      this.water?.renderReflection?.(this.renderer, this.camera, this.scene);
      this.renderer.shadowMap.needsUpdate = this.renderer.shadowMap.enabled;
      this.renderer.info.reset();
      if (this.post) {
        this.post.render(this.scene, this.camera, {
          elapsed,
          focusDistance,
          dofScale,
          // Beyond a full board diagonal behind focus: no haze over city/port detail.
          horizonHaze: {
            near: focusDistance + Math.hypot(this.city.extent.x, this.city.extent.z),
            far: focusDistance + Math.hypot(this.city.extent.x, this.city.extent.z) * 2.5,
            color: this.lighting.profile.horizonColor,
            intensity: this.lighting.profile.envIntensity,
          },
          sunDirection: this.lighting?.postState().sunDirection,
          // P16-W6 prototype B: the SSR pass's water mask. The ocean's own depth
          // bake says which world XZ is water and how deep, which is an exact
          // mask for nothing but a texture tap; reconstructing one from the
          // depth buffer alone would take the beach and the apron with it.
          water: this.water?.ssrMaskState?.() ?? null,
          accumulate: this._skippedSinceRender >= 2 ? this.taaConvergeFrames : 1,
        });
      } else {
        this.renderer.render(this.scene, this.camera);
      }
      this._skippedSinceRender = 0;
    } finally {
      trace?.finish();
      if (render) this._bootFrameTraced = true;
    }
  }

  start(onFrame = () => {}) {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      this.frame = requestAnimationFrame(loop);
      if (this.hidden) return;
      const dt = Math.min(0.05, this.clock.getDelta());
      this.step(dt, this.clock.elapsedTime, onFrame);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  setReducedMotion(on) {
    this.reducedMotion = on;
    this.rig.reducedMotion = on;
    this.board.setReducedMotion(on);
    this.sky?.setReducedMotion(on);
    this.water?.setReducedMotion(on);
    this.foliage?.setReducedMotion(on);
    this.people.setReducedMotion(on);
    this.auctionCrowd.setReducedMotion(on);
    this.traffic?.setReducedMotion(on);
    this.worldDeliveries?.setReducedMotion(on);
    if (this.militaryUnits) this.militaryUnits.reducedMotion = on;
    if (this.militaryAttacks) this.militaryAttacks.reducedMotion = on;
    if (this.militaryShipyard) this.militaryShipyard.reducedMotion = on;
    this.ambientLife?.setReducedMotion(on);
    this.meshyPeople?.setReducedMotion(on);
    this.eventOverlays.setReducedMotion(on);
    this.vfx.reducedMotion = on;
    this.mischief.setReducedMotion(on);
    if (this.post) this.post.setReducedMotion(on);
  }

  /**
   * Everything mvp/tests/perf-budget.mjs asserts against §2 of the V3.10 spec. Read-only:
   * it counts what the renderer already holds and never touches simulation state.
   */
  renderProfile() {
    const info = this.renderer.info;
    const seen = new Set();
    let sceneTextureBytes = 0;
    const account = (texture) => {
      if (!texture || seen.has(texture)) return;
      seen.add(texture);
      const image = texture.image ?? {};
      const width = image.width ?? texture.source?.data?.width ?? 0;
      const height = image.height ?? texture.source?.data?.height ?? 0;
      const depth = image.depth ?? 1;
      if (!width || !height) return;
      const bytes = width * height * depth * 4 * (texture.generateMipmaps === false ? 1 : 1.34);
      sceneTextureBytes += bytes;
    };
    this.scene.traverse((object) => {
      const material = object.material;
      if (!material) return;
      for (const entry of Array.isArray(material) ? material : [material]) {
        for (const key of [
          'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
          'alphaMap', 'bumpMap', 'displacementMap', 'envMap',
        ]) {
          account(entry[key]);
        }
      }
    });
    const shadowBytes = (this.photoCSM?.lights ?? [this.lighting?.key]).reduce((sum, light) => {
      if (!light?.castShadow) return sum;
      const size = light.shadow.mapSize;
      return sum + size.x * size.y * 4;
    }, 0);
    const postBytes = this.post ? this.post.textureBytes() : 0;
    const environmentBytes = this.lighting?.environmentBytes ?? 0;
    // Library textures are also reachable via scene materials; report them separately so
    // the §7 ≤40 MB generated-texture budget is visible next to the §2 ≤320 MB total.
    const materialLibraryBytes = this.board?.materials?.textureBytes?.() ?? 0;
    return {
      quality: this.quality,
      post: this.post ? this.post.stats() : null,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      programs: info.programs?.length ?? 0,
      textureBytes: Math.round(sceneTextureBytes + shadowBytes + postBytes + environmentBytes),
      textureBreakdown: {
        scene: Math.round(sceneTextureBytes),
        shadow: shadowBytes,
        post: postBytes,
        environment: environmentBytes,
        materialLibrary: materialLibraryBytes,
      },
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      shadowBand: this.lighting?.postState().shadowBand ?? null,
      pixelRatio: this.renderer.getPixelRatio(),
      drawingBufferSize: this.renderer.getDrawingBufferSize(new THREE.Vector2()),
    };
  }

  /** Reconcile one immutable core snapshot into the independent render adapters. */
  syncState(state, viewerSeatId = 'P1') {
    this.state = state;
    const runtimeCity = activeCity(this.city, state);
    this.people.city = runtimeCity;
    this.auctionCrowd.city = runtimeCity;
    this.eventOverlays.city = runtimeCity;
    this.board.syncOwnership(state, viewerSeatId);
    this.mischief.syncTargets(this.board.mischiefTargets);
    syncStartupSignage(this.board, runtimeCity, state);
    // Succession swaps geometry in, and anything new has to meet the same environment.
    this.lighting?.applyEnvironmentToScene(this.scene);
    this.people.syncState(state);
    this.auctionCrowd.syncState(state);
    this.eventOverlays.syncState(state, viewerSeatId);
    this.cityServices?.syncState(state);
    this.fringe?.syncState?.(state);
    // Those adapters add meshes after the environment walk above.
    applyAlbedoGain(this.scene);
    return this.v303Stats();
  }

  /** Measured Batch 5 additions, separate from the pre-existing board baseline. */
  v303Stats() {
    const people = this.people.stats();
    const crowd = this.auctionCrowd.stats();
    const overlays = this.eventOverlays.stats();
    assertPeopleRenderBudget({ people, crowd });
    assertOverlayRenderBudget(overlays);
    const stats = {
      people,
      crowd,
      overlays,
      drawCalls: people.drawCalls + crowd.drawCalls + overlays.drawCalls,
      triangles: people.triangles + crowd.triangles + overlays.triangles,
    };
    // V3.32: raised with PEOPLE_RENDER_BUDGET (26/220k) and CROWD_RENDER_BUDGET (10/60k).
    // The old 14/77k pair predated the figure programme and gated it below its own budget.
    //
    // 34 → 40 with the auction crowd's own 4 → 10. The three parts sum to exactly the cap on a
    // seed that opens with an auction — 26 cast + 10 crowd + 4 overlays — because each of them
    // is at its own published ceiling and this gate is their sum rather than a fourth opinion
    // about what a board may spend. Measured on `DD-SHOT-0002` at a twenty-four-bidder auction:
    // 39 draws, 79 578 triangles.
    if (stats.drawCalls > 40) {
      throw new Error(`V3.03 draw budget exceeded: ${stats.drawCalls}`);
    }
    if (stats.triangles > 290_000) {
      throw new Error(`V3.03 triangle budget exceeded: ${stats.triangles}`);
    }
    return stats;
  }

  dispose() {
    this.stop();
    disposeStaticShadowProxy(this.shadowProxy);
    this.shadowProxy = null;
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.peopleDrag?.dispose();
    this.peopleDrag = null;
    this.rig.dispose();
    this.mischief.dispose();
    this.vfx.dispose();
    this.people.dispose();
    this.meshyPeople?.dispose();
    this.auctionCrowd.dispose();
    this.traffic?.dispose();
    this.worldDeliveries?.dispose();
    this.militaryUnits?.dispose();
    this.militaryAttacks?.dispose();
    this.militaryShipyard?.dispose();
    this.ambientLife?.dispose();
    this.eventOverlays.dispose();
    this.edgeMassing?.dispose();
    this.edgeMassing = null;
    this.fringe?.dispose();
    this.post?.setBroadleafReceivers([], null);
    this.foliage?.dispose();
    this.water?.dispose();
    this.sky?.dispose();
    this.fringe = null;
    this.foliage = null;
    this.water = null;
    this.sky = null;
    this.traffic = null;
    if (this.tableRoot) {
      this.scene.remove(this.tableRoot);
      this.tableCloth?.geometry?.dispose();
      this.tableCloth?.material?.dispose();
      this.tableContact?.geometry?.dispose();
      this.tableContact?.material?.dispose();
      for (const geom of this._tableRimGeoms ?? []) geom?.dispose?.();
      for (const mat of this._tableRimMats ?? []) mat?.dispose?.();
      this._tableRimFaceGeom?.dispose?.();
      this._tableShadowMap?.dispose();
      this.tableRoot = null;
      this.tableCloth = null;
      this.tableContact = null;
      this.tableRim = null;
      this.tableRimShelf = null;
      this.tableRimApron = null;
      this.tableRimFace = null;
      this._tableRimGeoms = null;
      this._tableRimMats = null;
      this._tableRimFaceGeom = null;
      this._tableShadowMap = null;
    }
    this.board.dispose();
    disposeBatching(this.scene);
    this.batching = null;
    this._worldBatched = false;
    if (this.post) {
      if (this._photoContactBase != null) this.post.contactDarkness = this._photoContactBase;
      this.post.dispose();
    }
    if (this.photoCSM) {
      this.photoCSM.remove();
      this.photoCSM.dispose();
      for (const light of this.photoCSM.lights) light.shadow.dispose();
      for (const [material, hooks] of this._photoMaterials) {
        material.onBeforeCompile = hooks.before;
        material.customProgramCacheKey = hooks.cacheKey;
      }
      this._photoMaterials.clear();
    }
    this._photoMath = null;
    if (this.lighting) this.lighting.dispose();
    this.post = null;
    this.lighting = null;
    if (this._photoDrawDirect) this.renderer.renderBufferDirect = this._photoDrawDirect;
    this.renderer.dispose();
  }
}
