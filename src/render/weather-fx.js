// City weather FX. Self-contained. One shared geometry per effect.
// Mount hook: this.weatherFx = mountWeatherFx(this.scene, THREE, { city });
// then updateWeatherFx(this.state, dt, { city, arc, reducedMotion }) beside vfx.update.

import { weatherOf, liveBushfires } from '../core/weather.js';
import { lampLevel } from './style/material-rules.js';
import { STOREY, TILE, SETBACK } from '../core/grid.js';
import { ARCHETYPES } from '../core/content.js';
import { archetypeIdOf } from '../core/economy.js';
import { createCityFringeMaterial } from './materials.js';

/**
 * VFX-L3 weather look. `?weatherLit=0` (or `mountWeatherFx(scene, THREE, { lit: false })`)
 * keeps the pre-L3 picture exactly: the sky-tint sphere (MeshBasic, toneMapped false) and the
 * fixed 3.7 m ember ball at (16, 1.4, -14). On by default: the ember ball is gone, each live
 * bushfire parcel gets a pooled plume column of lit smoke rising from its roof line over the parcel
 * centre and a lit ember bed of fallen debris at the foot of its front wall, a few embers of which
 * glow after dusk; the
 * rain sky tint is the same 980 m shell at the same colour and opacity, drawn by a ShaderMaterial
 * that takes the tonemapping and colour-space chunks (inside the grade) instead of MeshBasic with
 * toneMapped false. Under the post chain the renderer's tone mapping is off for every material, so
 * that shell writes the old sphere's linear colour and alpha exactly and the rain sky is today's.
 *
 * Raw material constructors (the src/render ratchet, ruling 8 of 28 Oct): the lit look draws the
 * fire plume, the tanker exhaust and the rain shell with ONE ShaderMaterial object (one program
 * family, branched on the per-vertex/per-instance `plumeKind`), built at the module's one
 * ShaderMaterial site, which with `weatherLit=0` builds the pre-L3 tanker material instead. The ember
 * bed and its glowing shards share one MeshStandardMaterial; the glow rides on a per-vertex
 * `emberLit` attribute of the glow mesh's own geometry, read in onBeforeCompile.
 */
export function weatherFxLitDefault(search = globalThis.location?.search) {
  try {
    if (search && new URLSearchParams(search).get('weatherLit') === '0') return false;
  } catch { /* no location */ }
  return true;
}

/** Bushfire plume and ember bed (lit look). Colours are sRGB hex; the plume shader takes them linear. */
export const BUSHFIRE_FX = Object.freeze({
  maxFires: 6,
  /** Column billboards per fire, then short wisps rising off the ember bed. */
  plumePerFire: 30,
  wispPerFire: 6,
  plumePeriod: 11,
  wispPeriod: 4,
  /** Column height in metres; the old smokeHeight figure, now actually drawn. */
  plumeHeight: 32,
  /**
   * Rise curve: height = plumeHeight x p^plumeRise, so puffs linger low and the lower column is
   * the densest part (1.35 puts 36 % of the puffs in the lowest quarter instead of 25 %).
   */
  plumeRise: 1.35,
  /** Downwind lean at the top of the column (+x, the tanker plume's drift direction). */
  plumeDrift: 8,
  /**
   * Round 2: 4 m base puffs. Round 3: alpha 0.6 (was 0.5) so the overlapping base puffs occlude the
   * roof under the column; `?fireAlpha=<n>` overrides it for a capture sweep. Round 3b: 0.85. The
   * r4 day-close frame regressed lane on off over 40 px windows in the column core and found 0.23-
   * 0.41 of the roof still showing (effective cover 0.6-0.77), which leaves 0.49 of the base pixels
   * within 6 V of their median against a band of 0.8.
   */
  plumeSizeBase: 4,
  plumeSizeTop: 10,
  plumeAlpha: 1.0,
  /**
   * The column stands up to this far from the parcel centre toward the frontage, so its base sits
   * over the front half of the roof, above the ember bed (acceptance: within 2 m of the centre).
   * Round 3: never closer than plumeWallClear (half a base puff) to the front wall, so on a deep
   * building such as the bond store (front wall 1.74 m from the centre) the column stays over the
   * roof at the centre instead of hanging in front of the facade.
   */
  plumeFrontShift: 1.8,
  plumeWallClear: 2,
  /** The column's offset from the parcel centre never passes this (acceptance 6: within 2 m). */
  plumeMaxOffset: 1.95,
  /** Wisps: short (0 to wispHeight m off the bed), leaning wispLean m back toward the facade. */
  wispHeight: 2.4,
  wispLean: -0.3,
  wispSizeBase: 0.7,
  wispSizeTop: 1.6,
  wispAlpha: 0.26,
  /**
   * Smoke albedo, grey-brown S 12 V 47. Round 2: the smoke is lit by the scene's own lights (the
   * key wrapped over each puff, the other directionals, hemisphere and ambient as a floor), the way
   * a Lambert surface of this albedo is, so it is never self-lit; the albedo is #7d7266 with the
   * day rig's warm cast divided out, so the lit result keeps that hue.
   */
  smokeColour: 0x79716a,
  /**
   * Scale on the lit smoke radiance; `?fireSmoke=<n>` overrides it for a capture sweep. Round 3:
   * 0.25 (was 0.8). The r3 contact sheet read V 69.4 / 78.4 / 83.9 at 0.5 / 0.8 / 1.2 against a
   * band of V 45-55, so the default sits at the low end of the judge's 0.25-0.3. Round 3b: 0.2. At
   * 0.25 the r4 day-close core regression put the smoke's own colour at about (160, 125, 100), S 35
   * V 63; with smokeDayDesat that drops to about V 57, and 0.2 takes it to about V 52.
   */
  smokeLightGain: 0.2,
  /**
   * Round 3b: by day the lit smoke moves this share of the way to its own luminance (grey), because
   * the warm key and the grade carry the column to S 35 against a band of 10-20. `?fireGrey=<n>`
   * overrides it (0 keeps the round-3 chroma). Night greying (smokeNightDesat) applies on top.
   */
  smokeDayDesat: 0.55,
  /** After dusk the lit smoke drops to this share of itself and loses most of its chroma. */
  smokeNightFloor: 0.30,
  smokeNightDesat: 0.6,
  /**
   * Warm under-light, scaled by lampLevel(arc) so it is zero by day: a dull ember red on the
   * column's lowest underBandM metres above the roof line and the wisps' lowest wispUnderBandM,
   * added to the dark night smoke at underLight of the warm colour.
   */
  underColour: 0xff7a32,
  /** Wisps over the bed only. */
  underLight: 0.1,
  /**
   * Round 3: the column takes no warm add (was 0.1 over its lowest underBandM), so the smoke's net
   * change over the roof line at night is its own darkening only. `?fireWarm=<n>` puts it back.
   */
  underLightColumn: 0,
  underBandM: 2.5,
  wispUnderBandM: 1.2,
  emberShards: 18,
  /** The first emberGlowShards of each bed are small live embers; the rest are char and ash with no emission. */
  emberGlowShards: 3,
  /**
   * Round 2: the bed lies at the facade foot, metres outward from the front wall (not the street
   * edge), so it sits under the column's front edge inside the front garden. The front wall is
   * FRONT_SETBACK's share of the lot depth back from the lot's street side (residential/index.js).
   * A shallow garden pulls the band in so no shard passes the street edge (emberEdgeClear). Round 3:
   * 1.1 m (was 0.45), so a shard's far corner (0.42 m from its centre) stays behind a front fence,
   * which stands 0.56 m inside the street edge (curtilage.js boundaryZ).
   */
  emberOut: Object.freeze([0.35, 1.2]),
  /**
   * Half the debris spread along the frontage in metres, centred on the column's line: a packed
   * 2.8 m cluster under the plume base. Never more than emberAlongShare of the frontage half-width.
   */
  emberAlong: 1.4,
  emberEdgeClear: 1.1,
  emberAlongShare: 0.72,
  emberWidth: Object.freeze([0.3, 0.6]),
  emberHeight: Object.freeze([0.08, 0.2]),
  /**
   * Round 3: the three live embers are larger (0.2-0.32 m, was 0.14-0.28) and sit apart, one on the
   * column's line and one each side at half the spread, in the street-side half of the band, so
   * none hides behind the dead debris from the street.
   */
  emberGlowWidth: Object.freeze([0.2, 0.32]),
  emberGlowHeight: Object.freeze([0.08, 0.14]),
  /** Charred timber S 21 V 24 and ash S 11 V 47 (built-surface band 10-29). */
  charColour: 0x3d3530,
  ashColour: 0x77706a,
  roughness: 0.93,
  metalness: 0,
  /** Ember glow: night only, lampLevel(arc) x this, so daytime emission is exactly zero. */
  emberEmissive: 0xff5a1f,
  emberNightIntensity: 1.4,
  /** Garden and path datum in the lot (curtilage LOT.rise 0.14 to the turf tops 0.16-0.18); shards sit on it, sunk 2 cm. */
  bedY: 0.15,
  /** The column starts this far above the eaves (storeys x STOREY), clear of the building mass. */
  roofClear: 0.5,
  /** Storeys assumed when a parcel names no archetype. */
  fallbackStoreys: 2,
});

/**
 * Built form of kits that are not the residential envelope, measured on the model the board draws
 * (building-kit.js assembleBuilding; a test re-measures it on spans 1 and 2, facades 0-3 and every
 * condition tier). `warehouse-brick` is industrial/warehouse-shed.js on the board, not the
 * industrial/index.js bond store: a 6.4 m brick shed with four north-light teeth (crest 8.95 m),
 * its front wall 2.9 m from the centre on one tile (8.15 m on two), standing 0.7 m off the lot's
 * centre line, a porch canopy over the door to one side and bollards in the yard. `wall(depthHalf)`
 * is the front wall face; `roofY` the roof line; the bed lies bedOut m past the wall's ledge on the
 * clear 0.24 m yard slab beside
 * the porch, centred `bedAcross` m along the model's +x (the board's tangent is its -x) with a
 * half-spread of `bedAlong`; the column stands `plumeAcross` m the same way so its base is over
 * the bed.
 */
export const KIT_STANDING = Object.freeze({
  'warehouse-brick': Object.freeze({
    wall(depthHalf) {
      const lotD = 2 * depthHalf - 2 * SETBACK;
      const compact = lotD < 2 * TILE - 2 * SETBACK;
      return (compact ? -1.6 : -2.7) + (lotD * (compact ? 0.6 : 0.7)) / 2;
    },
    roofY: 8.95,
    bedY: 0.24,
    /** The wall's plinth ledge and sill run 0.35 m out (under the eaves); the bed starts past it. */
    bedOut: 0.4,
    bedAlong: 0.9,
    bedAcross: 3.0,
    plumeAcross: 1.5,
  }),
});

function kitStanding(archetypeId) {
  return KIT_STANDING[archetypeId] ?? null;
}

/**
 * Front-wall setback as a share of the lot depth, mirrored from residential/index.js ENVELOPE and
 * walkup-heritage.js HERITAGE_WALKUP_ENVELOPE (a test reads both sources and fails on drift).
 * An archetype not listed is taken to build to the envelope edge, SETBACK inside the street edge.
 */
export const FRONT_SETBACK = Object.freeze({
  'walkup-beaux-arts': 0.06,
  'walkup-moderne': 0.09,
  'terrace-single': 0.10,
  'terrace-double': 0.10,
  'terrace-carlton-heritage': 0.12,
  'cottage-federation': 0.26,
  'heritage-federation-villa': 0.24,
  'bungalow-californian': 0.26,
  'bungalow-brighton': 0.28,
  'townhouse-row': 0.14,
  'townhouse-paired-single': 0.18,
  'walkup-flats': 0.18,
  'art-deco-flats': 0.16,
  'apartment-low': 0.12,
  'apartment-mid': 0.10,
  'apartment-midrise': 0.10,
  'apartment-permit': 0.12,
  'apartment-tower': 0.10,
});

/** A non-negative URL number, or the fallback. */
function urlNumber(key, fallback, search, allowZero) {
  try {
    const raw = search ? new URLSearchParams(search).get(key) : null;
    const n = raw == null || raw === '' ? NaN : Number(raw);
    if (Number.isFinite(n) && (n > 0 || (allowZero && n === 0))) return n;
  } catch { /* no location */ }
  return fallback;
}

/** `?fireSmoke=<n>` scales the lit smoke radiance (positive numbers only); otherwise smokeLightGain. */
export function fireSmokeGain(search = globalThis.location?.search) {
  return urlNumber('fireSmoke', BUSHFIRE_FX.smokeLightGain, search, false);
}

/**
 * Capture tuning keys for the lit look only (`?weatherLit=0` ignores them): `fireSmoke` (smoke
 * radiance gain), `fireAlpha` (column puff alpha), `fireGrey` (day greying of the smoke, 0-1),
 * `fireWarm` (column warm add at night),
 * `fireNight` (the smoke's night share of itself) and `fireEmber` (live ember glow at night).
 */
export function fireTune(search = globalThis.location?.search) {
  return Object.freeze({
    smokeGain: fireSmokeGain(search),
    alpha: Math.min(1, urlNumber('fireAlpha', BUSHFIRE_FX.plumeAlpha, search, false)),
    grey: Math.min(1, urlNumber('fireGrey', BUSHFIRE_FX.smokeDayDesat, search, true)),
    warmColumn: urlNumber('fireWarm', BUSHFIRE_FX.underLightColumn, search, true),
    nightFloor: Math.min(1, urlNumber('fireNight', BUSHFIRE_FX.smokeNightFloor, search, false)),
    emberGlow: urlNumber('fireEmber', BUSHFIRE_FX.emberNightIntensity, search, true),
  });
}

/** Outward frontage normal for a parcel rotation (grid.js frontage: 0 = +Z, 90 = +X, 180 = -Z, 270 = -X). */
function frontageNormal(rotation) {
  const r = ((Math.round(Number(rotation) || 0) % 360) + 360) % 360;
  if (r === 90) return { x: 1, z: 0 };
  if (r === 180) return { x: 0, z: -1 };
  if (r === 270) return { x: -1, z: 0 };
  return { x: 0, z: 1 };
}

/**
 * What stands on the parcel: the built archetype id (or the parcel's), its storeys and the roof
 * line. A KIT_STANDING kit gives its measured roof deck (the bond store draws three storeys over
 * its plate whatever ARCHETYPES says); anything else is storeys x STOREY.
 */
function standingOn(state, city, parcelId, parcel) {
  let id = null;
  try { id = state ? archetypeIdOf(city, { holdings: {}, ...state }, parcelId) : null; } catch { id = null; }
  id = id ?? parcel?.archetypeId ?? null;
  const raw = ARCHETYPES[id]?.storeys ?? parcel?.storeys;
  const storeys = Number.isFinite(raw) && raw > 0 ? raw : BUSHFIRE_FX.fallbackStoreys;
  const kit = kitStanding(id);
  return { id, storeys, roofY: kit?.roofY ?? storeys * STOREY, kit };
}

/**
 * Distance from the parcel centre to the front wall's face along the frontage normal. A listed
 * residential archetype builds its front wall FRONT_SETBACK of the lot depth (tile less SETBACK
 * each side) back from the lot's street side, as residential/index.js does; a KIT_STANDING kit
 * gives its measured wall; anything else builds to the envelope edge.
 */
export function facadeOffset(archetypeId, depthHalf = TILE / 2) {
  const kit = kitStanding(archetypeId);
  if (kit) return kit.wall(depthHalf);
  const share = FRONT_SETBACK[archetypeId];
  const lotHalf = depthHalf - SETBACK;
  if (!Number.isFinite(share)) return lotHalf;
  return lotHalf - 2 * lotHalf * share;
}

/** Darkness after sunset on the lamp curve (style/material-rules.js): 0 by day, 1 at night. */
export function weatherNightLevel(arc) {
  return lampLevel(Number.isFinite(arc) ? arc : 1);
}

/**
 * Live bushfire parcels in ignition order, capped at maxFires. x/z is the plume base, up to
 * plumeFrontShift from the parcel centre (`centre`) toward the frontage and never nearer the front
 * wall than plumeWallClear, and y the plume base at the roof line. edge is the street edge of the
 * parcel and facade the foot of its front wall (facadeOffset m from the centre); normal and tangent
 * frame the ember bed there, bedY, bedAlong, bedCentre and bedOut are the surface it lies on, its
 * half-spread, its centre along the tangent and how far past the wall face its band starts, and
 * halfFront is half the frontage width. `options.frontRotation(parcel, archetypeId)` gives the yaw
 * the board actually draws the building at (board.js parcelBuildingTransform); without it the
 * parcel's own rotation is used.
 */
export function bushfireSites(state, city, options = {}) {
  const weather = weatherOf(state);
  const parcels = city?.parcels;
  if (!parcels) return [];
  const out = [];
  for (const row of liveBushfires(weather, state?.quarter ?? weather?.quarter ?? 1)) {
    const parcel = parcels[row.parcelId];
    const centre = parcel?.centre;
    if (!centre || !Number.isFinite(centre.x) || !Number.isFinite(centre.z)) continue;
    const standing = standingOn(state, city, row.parcelId, parcel);
    let rotation = parcel.rotation;
    try {
      const drawn = options?.frontRotation?.(parcel, standing.id);
      if (Number.isFinite(drawn)) rotation = drawn;
    } catch { /* keep the parcel's own */ }
    const normal = frontageNormal(rotation);
    const [fx, fz] = Array.isArray(parcel.groundFootprint) ? parcel.groundFootprint : [1, 1];
    const halfX = ((Number(fx) || 1) * TILE) / 2;
    const halfZ = ((Number(fz) || 1) * TILE) / 2;
    const depthHalf = normal.x !== 0 ? halfX : halfZ;
    const roofY = standing.roofY + BUSHFIRE_FX.roofClear;
    const wall = facadeOffset(standing.id, depthHalf);
    const tangent = { x: -normal.z, z: normal.x };
    let shift = Math.max(0, Math.min(BUSHFIRE_FX.plumeFrontShift, depthHalf, wall - BUSHFIRE_FX.plumeWallClear));
    // A kit's column may stand to one side (over its bed); the model's +x is the board's -tangent.
    let across = -(standing.kit?.plumeAcross ?? 0);
    const reach = Math.hypot(shift, across);
    if (reach > BUSHFIRE_FX.plumeMaxOffset) {
      shift *= BUSHFIRE_FX.plumeMaxOffset / reach;
      across *= BUSHFIRE_FX.plumeMaxOffset / reach;
    }
    out.push(Object.freeze({
      id: String(row.id ?? row.parcelId), parcelId: row.parcelId,
      x: centre.x + normal.x * shift + tangent.x * across, y: roofY,
      z: centre.z + normal.z * shift + tangent.z * across,
      centre: Object.freeze({ x: centre.x, z: centre.z }),
      edge: Object.freeze({ x: centre.x + normal.x * depthHalf, z: centre.z + normal.z * depthHalf }),
      facade: Object.freeze({ x: centre.x + normal.x * wall, z: centre.z + normal.z * wall }),
      facadeOffset: wall,
      gardenDepth: Math.max(0, depthHalf - wall),
      archetypeId: standing.id,
      bedY: standing.kit?.bedY ?? BUSHFIRE_FX.bedY,
      bedAlong: standing.kit?.bedAlong ?? BUSHFIRE_FX.emberAlong,
      bedCentre: -(standing.kit?.bedAcross ?? 0),
      bedOut: standing.kit?.bedOut ?? 0,
      normal: Object.freeze(normal),
      tangent: Object.freeze(tangent),
      halfFront: normal.x !== 0 ? halfZ : halfX,
    }));
    if (out.length >= BUSHFIRE_FX.maxFires) break;
  }
  return out;
}

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic ember-bed shards for one fire in the facade frame: `out` metres outward from the
 * front wall, `along` metres along the frontage, sizes, yaw, char or ash. Debris lies thickest
 * against the wall, so `out` is biased toward the inner end of the band. The first
 * emberGlowShards are small live embers (`glow`); the rest are dead char and ash.
 */
export function emberBedLayout(fireId, halfFront = TILE / 2, alongMax = BUSHFIRE_FX.emberAlong) {
  const rnd = seededRandom(hashSeed(`ember:${fireId}`));
  const [o0, o1] = BUSHFIRE_FX.emberOut;
  const span = Math.max(0, Math.min(alongMax, BUSHFIRE_FX.emberAlong, halfFront * BUSHFIRE_FX.emberAlongShare));
  const glows = BUSHFIRE_FX.emberGlowShards;
  const out = [];
  for (let i = 0; i < BUSHFIRE_FX.emberShards; i += 1) {
    const glow = i < glows;
    const [w0, w1] = glow ? BUSHFIRE_FX.emberGlowWidth : BUSHFIRE_FX.emberWidth;
    const [h0, h1] = glow ? BUSHFIRE_FX.emberGlowHeight : BUSHFIRE_FX.emberHeight;
    // Dead debris packs toward the column's line: a triangular spread along the frontage, thickest
    // at 0. The live embers sit apart (centre and half the spread each side, jittered 0.08 m) in the
    // street-side half of the band, so each reads on its own.
    const slot = glows > 1 ? (i / (glows - 1)) * 2 - 1 : 0;
    const along = glow ? slot * span * 0.5 + (rnd() - 0.5) * 0.16 : (rnd() + rnd() - 1) * span;
    const outward = glow ? o0 + (0.5 + 0.4 * rnd()) * (o1 - o0) : o0 + rnd() ** 1.3 * (o1 - o0);
    const width = w0 + rnd() * (w1 - w0);
    const depth = w0 + rnd() * (w1 - w0);
    const height = h0 + rnd() * (h1 - h0);
    const yaw = rnd() * Math.PI * 2;
    const ash = !glow && rnd() < 0.35;
    out.push(Object.freeze({
      out: outward, along: Math.max(-span, Math.min(span, along)),
      sx: width, sy: height, sz: depth, yaw, ash, glow,
    }));
  }
  return out;
}

// The pre-L3 tanker exhaust program, kept verbatim for `weatherLit=0`.
const TANKER_VERTEX = `
      attribute float plumePhase;
      uniform float plumeTime;
      varying vec2 plumeUv;
      varying float plumeAlpha;
      void main() {
        float p = fract(plumeTime / 8.0 + plumePhase);
        float envelope = sin(3.141592653589793 * p);
        plumeAlpha = 0.12 * envelope * envelope;
        plumeUv = uv;
        vec4 centre = modelViewMatrix * vec4(p * p * 1.7, p * 7.0, 0.0, 1.0);
        centre.xy += position.xy * (0.6 + p * 2.2);
        gl_Position = projectionMatrix * centre;
      }`;
const TANKER_FRAGMENT = `
      varying vec2 plumeUv;
      varying float plumeAlpha;
      void main() {
        float radius = length((plumeUv - 0.5) * 2.0);
        float soft = 1.0 - smoothstep(0.05, 1.0, radius);
        gl_FragColor = vec4(vec3(0.42, 0.43, 0.44), soft * plumeAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`;

/** plumeKind values of the shared lit program: 0 wisp, 1 column, 2 tanker exhaust, 3 rain shell. */
const KIND_TANKER = 2;
const KIND_SHELL = 3;

// The lit look's one program: the fire plume (kinds 0 and 1), the tanker exhaust (kind 2, the pre-L3
// program's terms) and the rain sky-tint shell (kind 3, the old MeshBasic program's live terms).
// The material is BackSide for the shell, so the billboards are wound back-facing: x is mirrored
// and uv.x with it, which leaves every corner's screen position and uv where they were.
const PLUME_VERTEX = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float plumePhase;
  attribute float plumeSeed;
  attribute float plumeKind;
  attribute vec2 plumeLean;
  attribute vec3 plumeOrigin;
  uniform float plumeTime;
  uniform float uTankerTime;
  uniform float uPeriod;
  uniform float uWispPeriod;
  uniform float uHeight;
  uniform float uRise;
  uniform float uSizeBase;
  uniform float uSizeTop;
  uniform float uAlpha;
  uniform float uWispHeight;
  uniform float uWispSizeBase;
  uniform float uWispSizeTop;
  uniform float uWispAlpha;
  uniform float uUnderBandM;
  uniform float uWispUnderBandM;
  varying vec2 plumeUv;
  varying float plumeAlpha;
  varying float plumeWarm;
  varying float plumeColumn;
  varying float plumeMode;
  #include <fog_pars_vertex>
  void main() {
    if (plumeKind > 2.5) {
      plumeMode = 2.0;
      #include <begin_vertex>
      #include <project_vertex>
      #include <logdepthbuf_vertex>
      return;
    }
    vec2 corner = vec2(-position.x, position.y);
    plumeUv = vec2(1.0 - uv.x, uv.y);
    if (plumeKind > 1.5) {
      plumeMode = 1.0;
      float p = fract(uTankerTime / 8.0 + plumePhase);
      float envelope = sin(3.141592653589793 * p);
      plumeAlpha = 0.12 * envelope * envelope;
      vec4 centre = modelViewMatrix * vec4(p * p * 1.7, p * 7.0, 0.0, 1.0);
      centre.xy += corner * (0.6 + p * 2.2);
      gl_Position = projectionMatrix * centre;
      return;
    }
    plumeMode = 0.0;
    // plumeKind 1: the column over the roof; 0: a short wisp off the ember bed.
    float column = step(0.5, plumeKind);
    plumeColumn = column;
    float p = fract(plumeTime / mix(uWispPeriod, uPeriod, column) + plumePhase);
    float h = mix(p, pow(p, uRise), column);
    // Zero value and zero slope at both ends of the cycle, so the wrap back to the base never pops.
    plumeAlpha = mix(uWispAlpha * smoothstep(0.0, 0.08, p) * pow(1.0 - p, 1.4),
      uAlpha * smoothstep(0.0, 0.04, p) * pow(1.0 - p, 1.6), column);
    // Warm under-light reach in world metres above each origin: the column's lowest uUnderBandM
    // over the roof line, the wisps' lowest uWispUnderBandM over the bed.
    float rise = h * mix(uWispHeight, uHeight, column);
    plumeWarm = 1.0 - smoothstep(0.0, mix(uWispUnderBandM, uUnderBandM, column), rise);
    float jx = plumeSeed - 0.5;
    float jz = fract(plumeSeed * 7.13) - 0.5;
    float spread = mix(0.3 + p * 0.5, 0.6 + p * 2.5, column);
    vec3 local = vec3(plumeLean.x * h * h + jx * spread, rise, plumeLean.y * h * h + jz * spread);
    vec4 mvPosition = modelViewMatrix * vec4(plumeOrigin + local, 1.0);
    mvPosition.xy += corner * mix(mix(uWispSizeBase, uWispSizeTop, sqrt(p)), mix(uSizeBase, uSizeTop, sqrt(p)), column);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

// Lit smoke. Each puff is shaded as a soft sphere facing the camera: the key (the brightest
// directional, world direction toward the light) wraps over it, and uFloor carries every other
// light as its sphere average (other directionals at half, hemisphere at the sky/ground mean,
// ambient). Radiance = albedo x irradiance / pi, the Lambert term three's standard material uses.
const PLUME_FRAGMENT = `
  uniform vec3 diffuse;
  uniform float opacity;
  uniform vec3 uSmoke;
  uniform vec3 uWarm;
  uniform vec3 uKeyDir;
  uniform vec3 uKeyCol;
  uniform vec3 uFloor;
  uniform float uGain;
  uniform float uDay;
  uniform float uNight;
  uniform float uNightFloor;
  uniform float uNightDesat;
  uniform float uDayDesat;
  uniform float uUnder;
  uniform float uUnderCol;
  varying vec2 plumeUv;
  varying float plumeAlpha;
  varying float plumeWarm;
  varying float plumeColumn;
  varying float plumeMode;
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  void main() {
    if (plumeMode > 1.5) {
      #include <logdepthbuf_fragment>
      gl_FragColor = vec4(diffuse, opacity);
    } else if (plumeMode > 0.5) {
      float radius = length((plumeUv - 0.5) * 2.0);
      float soft = 1.0 - smoothstep(0.05, 1.0, radius);
      gl_FragColor = vec4(vec3(0.42, 0.43, 0.44), soft * plumeAlpha);
    } else {
    vec2 d = (plumeUv - 0.5) * 2.0;
    float radius = length(d);
    float soft = 1.0 - smoothstep(0.05, 1.0, radius);
    vec2 dn = d / max(1.0, radius);
    vec3 n = normalize(vec3(dn, sqrt(max(0.0, 1.0 - dot(dn, dn))) + 0.15));
    vec3 keyView = normalize((viewMatrix * vec4(uKeyDir, 0.0)).xyz);
    float wrap = clamp((dot(n, keyView) + 0.6) / 1.6, 0.0, 1.0);
    vec3 irradiance = uFloor + uKeyCol * wrap;
    vec3 col = uSmoke * irradiance * (0.3183098861837907 * uGain);
    // Smoke, never a light: after dusk it falls to uNightFloor of itself and greys, so the column
    // reads dark on the night sky.
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    // Greyed by uDayDesat at every hour (the warm key and the grade tint it), then by uNightDesat
    // more after dusk.
    float grey = 1.0 - (1.0 - uDayDesat) * (1.0 - uNightDesat * uNight);
    col = mix(col, vec3(lum), grey) * mix(uNightFloor, 1.0, uDay);
    // Dull warm under-light from the ember bed, after dusk only, on the wisps' lowest metres and the
    // underside of each puff; the column takes uUnderCol (0 by default since round 3).
    float under = mix(uUnder, uUnderCol, plumeColumn);
    col += uWarm * (uNight * under * plumeWarm * (0.35 + 0.65 * (1.0 - plumeUv.y)));
    gl_FragColor = vec4(col, soft * plumeAlpha);
    }
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    // Fog on the fire plume only, as before (the shell and the exhaust never took it). The shared
    // material keeps fog false for the shell, so syncPlumeFog sets USE_FOG and the fog uniforms.
    if (plumeMode < 0.5) {
      #include <fog_fragment>
    }
  }`;

/** three's getUnlitUniformColorSpace: the space the renderer writes fog colour in for this pass. */
function unlitColorSpace(renderer) {
  const target = renderer?.getRenderTarget?.() ?? null;
  if (target === null) return renderer?.outputColorSpace ?? THREE_REF.ColorManagement.workingColorSpace;
  if (target.isXRRenderTarget === true) return target.texture.colorSpace;
  return THREE_REF.ColorManagement.workingColorSpace;
}

/**
 * The fire plume's fog, as three refreshes it for a material with fog true: USE_FOG (and FOG_EXP2)
 * follow the scene's fog, and the fog uniforms are copied before the plume draws and uploaded with
 * it. Runs as the plume mesh's onBeforeRender.
 */
function syncPlumeFog(renderer, scene) {
  const material = firePlume?.material;
  if (!material) return;
  const fog = scene?.isScene === true ? scene.fog : null;
  const defines = material.defines ?? (material.defines = {});
  const want = fog ? (fog.isFogExp2 ? 2 : 1) : 0;
  const have = 'USE_FOG' in defines ? ('FOG_EXP2' in defines ? 2 : 1) : 0;
  if (want !== have) {
    delete defines.USE_FOG;
    delete defines.FOG_EXP2;
    if (want) defines.USE_FOG = '';
    if (want === 2) defines.FOG_EXP2 = '';
    material.needsUpdate = true;
  }
  if (!fog) return;
  const u = material.uniforms;
  fog.color.getRGB(u.fogColor.value, unlitColorSpace(renderer));
  if (fog.isFog) {
    u.fogNear.value = fog.near;
    u.fogFar.value = fog.far;
  } else if (fog.isFogExp2) {
    u.fogDensity.value = fog.density;
  }
  material.uniformsNeedUpdate = true;
}

/**
 * The plume's light uniforms from the scene's top-level lights (three's units: directional and
 * hemisphere colour x intensity is irradiance). Returns null when the scene has no light, and the
 * shader then keeps its neutral default of pi, which draws the albedo itself.
 */
export function smokeLightRig(lights) {
  let key = null;
  let keyPower = 0;
  const floor = [0, 0, 0];
  let any = false;
  const add = (c, k) => { floor[0] += c.r * k; floor[1] += c.g * k; floor[2] += c.b * k; };
  for (const l of lights ?? []) {
    if (!l || l.visible === false) continue;
    const i = Number.isFinite(l.intensity) ? l.intensity : 1;
    if (l.isDirectionalLight) {
      any = true;
      const power = i * (0.2126 * l.color.r + 0.7152 * l.color.g + 0.0722 * l.color.b);
      if (power > keyPower) {
        if (key) add(key.color, key.intensity * 0.5);
        key = l; keyPower = power;
      } else add(l.color, i * 0.5);
    } else if (l.isHemisphereLight) {
      any = true;
      floor[0] += (l.color.r + l.groundColor.r) * 0.5 * i;
      floor[1] += (l.color.g + l.groundColor.g) * 0.5 * i;
      floor[2] += (l.color.b + l.groundColor.b) * 0.5 * i;
    } else if (l.isAmbientLight) {
      any = true;
      add(l.color, i);
    }
  }
  if (!any) return null;
  const dir = [0, 1, 0];
  const keyCol = [0, 0, 0];
  if (key) {
    const tx = key.target?.position?.x ?? 0;
    const ty = key.target?.position?.y ?? 0;
    const tz = key.target?.position?.z ?? 0;
    const dx = key.position.x - tx;
    const dy = key.position.y - ty;
    const dz = key.position.z - tz;
    const len = Math.hypot(dx, dy, dz) || 1;
    dir[0] = dx / len; dir[1] = dy / len; dir[2] = dz / len;
    const i = Number.isFinite(key.intensity) ? key.intensity : 1;
    keyCol[0] = key.color.r * i; keyCol[1] = key.color.g * i; keyCol[2] = key.color.b * i;
  }
  return { dir, keyCol, floor };
}

/**
 * The module's one ShaderMaterial site. Lit: one material for the fire plume, the tanker exhaust and
 * the rain shell (BackSide and fog false for the shell; the plume's fog is set by syncPlumeFog).
 * `weatherLit=0`: the pre-L3 tanker material, field for field.
 */
function buildSmokeMaterial(THREE, lit, tune = fireTune('')) {
  const material = new THREE.ShaderMaterial(lit ? {
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      plumeTime: { value: 0 },
      uTankerTime: { value: 0 },
      uPeriod: { value: BUSHFIRE_FX.plumePeriod },
      uWispPeriod: { value: BUSHFIRE_FX.wispPeriod },
      uHeight: { value: BUSHFIRE_FX.plumeHeight },
      uRise: { value: BUSHFIRE_FX.plumeRise },
      uSizeBase: { value: BUSHFIRE_FX.plumeSizeBase },
      uSizeTop: { value: BUSHFIRE_FX.plumeSizeTop },
      uAlpha: { value: tune.alpha },
      uWispHeight: { value: BUSHFIRE_FX.wispHeight },
      uWispSizeBase: { value: BUSHFIRE_FX.wispSizeBase },
      uWispSizeTop: { value: BUSHFIRE_FX.wispSizeTop },
      uWispAlpha: { value: BUSHFIRE_FX.wispAlpha },
      uUnderBandM: { value: BUSHFIRE_FX.underBandM },
      uWispUnderBandM: { value: BUSHFIRE_FX.wispUnderBandM },
      uSmoke: { value: new THREE.Color(BUSHFIRE_FX.smokeColour) },
      uWarm: { value: new THREE.Color(BUSHFIRE_FX.underColour) },
      // Neutral until the first update reads the scene's lights: irradiance pi draws the albedo.
      uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
      uKeyCol: { value: new THREE.Color(0, 0, 0) },
      uFloor: { value: new THREE.Color(Math.PI, Math.PI, Math.PI) },
      uGain: { value: tune.smokeGain },
      uDay: { value: 1 },
      uNight: { value: 0 },
      uNightFloor: { value: tune.nightFloor },
      uNightDesat: { value: BUSHFIRE_FX.smokeNightDesat },
      uDayDesat: { value: Number.isFinite(tune.grey) ? tune.grey : BUSHFIRE_FX.smokeDayDesat },
      uUnder: { value: BUSHFIRE_FX.underLight },
      uUnderCol: { value: tune.warmColumn },
      // The rain shell's tint and opacity (the old MeshBasic `diffuse` and `opacity`).
      diffuse: { value: new THREE.Color(SKY_TINT_COLOR) },
      opacity: { value: 0 },
    }]),
    vertexShader: PLUME_VERTEX,
    fragmentShader: PLUME_FRAGMENT,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  } : {
    uniforms: { plumeTime: { value: 0 } },
    transparent: true, depthWrite: false,
    vertexShader: TANKER_VERTEX,
    fragmentShader: TANKER_FRAGMENT,
  });
  if (!lit) return material;
  material.name = 'weather:smoke-and-tint';
  // `color` and `opacity` keep the shell's old meaning for lib-page.js and v4-weather-response.mjs:
  // `color` is the `diffuse` uniform and `opacity` writes the `opacity` uniform.
  const uniforms = material.uniforms;
  Object.defineProperty(material, 'color', { get: () => uniforms.diffuse.value, configurable: true });
  let opacityValue = 0;
  Object.defineProperty(material, 'opacity', {
    get: () => opacityValue,
    set: (v) => { opacityValue = v; uniforms.opacity.value = v; },
    configurable: true,
  });
  return material;
}

/** Per-vertex or per-instance constant attributes for a geometry the shared smoke program draws. */
function setSmokeKind(THREE, geom, kind, count, instanced) {
  const Attr = instanced ? THREE.InstancedBufferAttribute : THREE.BufferAttribute;
  geom.setAttribute('plumeKind', new Attr(new Float32Array(count).fill(kind), 1));
  if (!geom.getAttribute('plumePhase')) geom.setAttribute('plumePhase', new Attr(new Float32Array(count), 1));
  geom.setAttribute('plumeSeed', new Attr(new Float32Array(count), 1));
  geom.setAttribute('plumeLean', new Attr(new Float32Array(count * 2), 2));
  geom.setAttribute('plumeOrigin', new Attr(new Float32Array(count * 3), 3));
}

function buildBushfirePool(THREE, mat) {
  const per = BUSHFIRE_FX.plumePerFire + BUSHFIRE_FX.wispPerFire;
  const count = BUSHFIRE_FX.maxFires * per;
  const geom = new THREE.PlaneGeometry(1, 1);
  // Per fire: plumePerFire column puffs, then wispPerFire wisps, each set on evenly spread phases.
  const isColumn = (i) => (i % per) < BUSHFIRE_FX.plumePerFire;
  geom.setAttribute('plumePhase', new THREE.InstancedBufferAttribute(
    Float32Array.from({ length: count }, (_, i) => (isColumn(i)
      ? (i % per) / BUSHFIRE_FX.plumePerFire
      : ((i % per) - BUSHFIRE_FX.plumePerFire) / BUSHFIRE_FX.wispPerFire)), 1));
  geom.setAttribute('plumeKind', new THREE.InstancedBufferAttribute(
    Float32Array.from({ length: count }, (_, i) => (isColumn(i) ? 1 : 0)), 1));
  geom.setAttribute('plumeLean', new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2));
  const seedRnd = seededRandom(0x5eed);
  geom.setAttribute('plumeSeed', new THREE.InstancedBufferAttribute(
    Float32Array.from({ length: count }, () => seedRnd()), 1));
  geom.setAttribute('plumeOrigin', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3));
  const plume = new THREE.InstancedMesh(geom, mat, count);
  plume.name = 'weather:bushfire-plume';
  plume.count = 0;
  plume.renderOrder = 10;
  plume.frustumCulled = false;
  plume.visible = false;
  plume.raycast = () => {};
  plume.onBeforeRender = syncPlumeFog;

  const shards = BUSHFIRE_FX.maxFires * BUSHFIRE_FX.emberShards;
  const glowShards = BUSHFIRE_FX.maxFires * BUSHFIRE_FX.emberGlowShards;
  // Unit shard: 1 m across its widest axis after scaling, base on y = 0, sunk 2 cm into the ground.
  const shardGeom = new THREE.IcosahedronGeometry(0.5, 0);
  shardGeom.computeBoundingBox();
  const shardBox = shardGeom.boundingBox;
  const shardSize = shardBox.getSize(new THREE.Vector3());
  shardGeom.translate(0, -shardBox.min.y, 0);
  shardGeom.scale(1 / shardSize.x, 1 / shardSize.y, 1 / shardSize.z);
  shardGeom.translate(0, -0.02 / BUSHFIRE_FX.emberHeight[0], 0);
  // The glow mesh draws its own copy of the shard, whose per-vertex `emberLit` is the ember colour
  // (linear); the bed's is zero. The shared material adds emberLit x uEmberLevel to the emission.
  const glowGeom = shardGeom.clone();
  const verts = shardGeom.getAttribute('position').count;
  const ember = new THREE.Color(BUSHFIRE_FX.emberEmissive);
  shardGeom.setAttribute('emberLit', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
  glowGeom.setAttribute('emberLit', new THREE.BufferAttribute(
    Float32Array.from({ length: verts * 3 }, (_, i) => ember.toArray()[i % 3]), 3));
  // One material for the dead char and ash and for the few live embers: lit, colour per instance,
  // `emissive` black (dead char and ash never glow); the live embers glow after dusk only through
  // emberLit, at uEmberLevel, which follows emissiveIntensity (lampLevel).
  const level = { value: 0 };
  // Built through the shared fringe builder (gate ruling 8): the char takes the nearest shared finish.
  const emberMat = createCityFringeMaterial(0xffffff, {
    roughness: BUSHFIRE_FX.roughness,
    metalness: BUSHFIRE_FX.metalness,
    emissiveIntensity: 0,
  }, 'weather');
  emberMat.name = 'weather:bushfire-ember';
  emberMat.onBeforeCompile = (shader) => {
    shader.uniforms.uEmberLevel = level;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 emberLit;\nflat varying vec3 vEmberLit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvEmberLit = emberLit;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uEmberLevel;\nflat varying vec3 vEmberLit;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vEmberLit * uEmberLevel;');
  };
  // Its own program key: the scene's hook wrappers (photo CSM, aerial perspective) build theirs on the
  // upstream key, and the default (onBeforeCompile's source) would then read the wrapper's source,
  // shared by every wrapped standard material, so a cached program without emberLit could be reused.
  emberMat.customProgramCacheKey = () => 'weather:ember-lit-v1';
  emberMat.userData.emberLevel = level;
  const bed = new THREE.InstancedMesh(shardGeom, emberMat, shards);
  bed.name = 'weather:bushfire-ember-bed';
  const glow = new THREE.InstancedMesh(glowGeom, emberMat, glowShards);
  glow.name = 'weather:bushfire-embers';
  for (const mesh of [bed, glow]) {
    mesh.count = 0;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.raycast = () => {};
  }
  const char = new THREE.Color(BUSHFIRE_FX.charColour);
  for (let i = 0; i < shards; i += 1) bed.setColorAt(i, char);
  for (let i = 0; i < glowShards; i += 1) glow.setColorAt(i, char);
  return { plume, bed, glow };
}

/** Intensity table. rain < heavy-rain on every lever. One instanced mesh per effect. */
export const WEATHER_FX = Object.freeze({
  rainCount: Object.freeze({ rain: 800, 'heavy-rain': 1400 }),
  // User order 2026-09-01: drops read enormous at diorama scale
  // (3.4–5.2 m streaks, 0.16 m thick). Halved-plus.
  rainLength: Object.freeze({ rain: 1.6, 'heavy-rain': 2.4 }),
  rainOpacity: Object.freeze({ rain: 0.78, 'heavy-rain': 0.95 }),
  rainSpeed: Object.freeze({ rain: 22, 'heavy-rain': 36 }),
  wetRoad: Object.freeze({ rain: 0.70, 'heavy-rain': 1 }),
  // Overcast haze over the sky and the far ocean beyond the sky sphere. Rain greys the sky,
  // it does not blacken it: the tint colour is a luminous neutral (SKY_TINT_COLOR below).
  skyTint: Object.freeze({ rain: 0.34, 'heavy-rain': 0.52 }),
  smokeHeight: 32,
  smokeCount: 16,
  emberGlow: 1.6,
});

const SMOKE_COUNT = WEATHER_FX.smokeCount;
/** Overcast sky grey, close to the fog token (#A9B9CE) with the chroma taken out. */
const SKY_TINT_COLOR = 0x9aa2ab;
const CITY_CENTRE = 136;

export function wetRoadFactor(weather) {
  if (weather?.state === 'heavy-rain') return WEATHER_FX.wetRoad['heavy-rain'];
  if (weather?.state === 'rain') return WEATHER_FX.wetRoad.rain;
  return 0;
}

export function weatherFxIntensity(stateName) {
  if (stateName === 'heavy-rain') {
    return Object.freeze({
      count: WEATHER_FX.rainCount['heavy-rain'],
      length: WEATHER_FX.rainLength['heavy-rain'],
      opacity: WEATHER_FX.rainOpacity['heavy-rain'],
      speed: WEATHER_FX.rainSpeed['heavy-rain'],
      wetRoad: WEATHER_FX.wetRoad['heavy-rain'],
      skyTint: WEATHER_FX.skyTint['heavy-rain'],
    });
  }
  if (stateName === 'rain') {
    return Object.freeze({
      count: WEATHER_FX.rainCount.rain,
      length: WEATHER_FX.rainLength.rain,
      opacity: WEATHER_FX.rainOpacity.rain,
      speed: WEATHER_FX.rainSpeed.rain,
      wetRoad: WEATHER_FX.wetRoad.rain,
      skyTint: WEATHER_FX.skyTint.rain,
    });
  }
  return Object.freeze({
    count: 0, length: 0, opacity: 0, speed: 0, wetRoad: 0, skyTint: 0,
  });
}

let THREE_REF = null;
let smokeMesh = null;
let plumeScene = null;
let plumeSearchAt = 0;
let plumeAttached = false;
let skyTintMesh = null;
let emberMesh = null;
let dummy = null;
let mounted = false;
let fxClock = 0;
let fxLit = false;
let fxCity = null;
let fxFrontRotation = null;
let fxEmberGlow = BUSHFIRE_FX.emberNightIntensity;
let firePlume = null;
let emberBed = null;
let emberGlow = null;
let lightAt = -1;
let lightList = [];
let fireSignature = '';

function ensureScratch(THREE) {
  if (!dummy) dummy = new THREE.Object3D();
}

export function mountWeatherFx(scene, THREE, options = {}) {
  const {
    lit = weatherFxLitDefault(), city = null, smokeGain = null, tune = null, frontRotation = null,
  } = options ?? {};
  THREE_REF = THREE;
  ensureScratch(THREE);
  fxLit = lit !== false;
  fxCity = city;
  fxFrontRotation = typeof frontRotation === 'function' ? frontRotation : null;
  const fireLook = { ...(tune ?? fireTune()) };
  if (Number.isFinite(smokeGain) && smokeGain > 0) fireLook.smokeGain = smokeGain;
  fxEmberGlow = Number.isFinite(fireLook.emberGlow) ? fireLook.emberGlow : BUSHFIRE_FX.emberNightIntensity;
  fireSignature = '';

  // P21 R1: cut the depth-test-free box streaks; they read as floating white rods.
  // Wet-road response and the weather sky tint still carry rain state.

  // One attached tanker exhaust: sixteen soft billboards, one draw, no textures.
  // Each particle fades with zero slope before its phase wraps back to the mouth.
  const smokeGeom = new THREE.PlaneGeometry(1, 1);
  smokeGeom.setAttribute('plumePhase', new THREE.InstancedBufferAttribute(
    Float32Array.from({ length: SMOKE_COUNT }, (_, i) => i / SMOKE_COUNT), 1));
  // Lit: the shared smoke program (the exhaust is kind 2); weatherLit=0: the pre-L3 tanker material.
  const smokeMat = buildSmokeMaterial(THREE, fxLit, fireLook);
  if (fxLit) setSmokeKind(THREE, smokeGeom, KIND_TANKER, SMOKE_COUNT, true);
  smokeMesh = new THREE.InstancedMesh(smokeGeom, smokeMat, SMOKE_COUNT);
  smokeMesh.name = 'weather:tanker-plume';
  // The ocean and foam are transparent passes at orders 5/6. Exhaust must
  // composite after them while still depth-testing against the ship.
  smokeMesh.renderOrder = 10;
  smokeMesh.frustumCulled = false;
  smokeMesh.visible = false;
  smokeMesh.raycast = () => {};
  plumeScene = scene;
  plumeAttached = false;
  plumeSearchAt = 0;

  if (fxLit) {
    // Lit look: no fixed ember ball; the sky tint is the graded shell; each live bushfire draws
    // from one pooled plume and ember bed.
    skyTintMesh = buildSkyTintShell(THREE, smokeMat);
    emberMesh = null;
    const pool = buildBushfirePool(THREE, smokeMat);
    firePlume = pool.plume;
    emberBed = pool.bed;
    emberGlow = pool.glow;
    lightAt = -1;
    lightList = [];
    scene.add(smokeMesh);
    scene.add(skyTintMesh);
    scene.add(firePlume);
    scene.add(emberBed);
    scene.add(emberGlow);
    mounted = true;
    return {
      rain: null, smoke: smokeMesh, skyTint: skyTintMesh, ember: null,
      bushfirePlume: firePlume, emberBed, emberGlow, lit: true,
    };
  }

  skyTintMesh = buildSkyTintShell(THREE, null);

  const emberGeom = new THREE.SphereGeometry(1.15, 10, 8);
  const emberMat = new THREE.MeshBasicMaterial({
    color: 0xff6a28,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  emberMesh = new THREE.Mesh(emberGeom, emberMat);
  emberMesh.name = 'weather:bushfire-ember';
  emberMesh.position.set(16, 1.4, -14);
  emberMesh.visible = false;

  scene.add(smokeMesh);
  scene.add(skyTintMesh);
  scene.add(emberMesh);
  mounted = true;
  return { rain: null, smoke: smokeMesh, skyTint: skyTintMesh, ember: emberMesh };
}

function bushfireLive(weather) {
  return (weather?.bushfires ?? []).some((row) => (
    row && row.repaired !== true && row.burnedDown !== true
  ));
}

/**
 * The rain sky tint: a 980 m back-faced shell round the city centre, drawn first among the
 * transparents and writing no depth, so it greys only the sky and the far ocean behind it.
 * With `shared` (the lit look) it is drawn by the shared smoke material as kind 3, the old
 * MeshBasic program with no map, no light and no fog reduced to its live terms (the tint and opacity
 * in linear, then the output chunks; tonemapping_fragment is the grade's entry), with toneMapped at
 * its default; otherwise it is the pre-L3 MeshBasicMaterial with toneMapped false. Same geometry,
 * transform, colour and opacity either way; the shared material's `color` aliases its `diffuse`
 * uniform and its `opacity` uniform follows material.opacity, so QA probes read both the same way.
 */
function buildSkyTintShell(THREE, shared) {
  const skyGeom = new THREE.SphereGeometry(980, 20, 14);
  let skyMat = shared;
  if (shared) {
    setSmokeKind(THREE, skyGeom, KIND_SHELL, skyGeom.getAttribute('position').count, false);
  } else {
    skyMat = new THREE.MeshBasicMaterial({
      color: SKY_TINT_COLOR,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
  }
  const mesh = new THREE.Mesh(skyGeom, skyMat);
  mesh.name = 'weather:sky-tint';
  mesh.position.set(CITY_CENTRE, 0, CITY_CENTRE);
  mesh.frustumCulled = false;
  mesh.renderOrder = -20;
  mesh.visible = false;
  return mesh;
}

function writeBushfires(sites) {
  const signature = sites.map((s) => `${s.id}@${s.x},${s.y},${s.z}/${s.facade.x},${s.facade.z},${s.bedY},${s.bedCentre}`).join('|');
  if (signature === fireSignature) return;
  fireSignature = signature;
  const column = BUSHFIRE_FX.plumePerFire;
  const per = column + BUSHFIRE_FX.wispPerFire;
  const origin = firePlume.geometry.getAttribute('plumeOrigin');
  const lean = firePlume.geometry.getAttribute('plumeLean');
  const bedMid = (BUSHFIRE_FX.emberOut[0] + BUSHFIRE_FX.emberOut[1]) / 2;
  const char = new THREE_REF.Color(BUSHFIRE_FX.charColour);
  const ash = new THREE_REF.Color(BUSHFIRE_FX.ashColour);
  let shard = 0;
  let live = 0;
  sites.forEach((site, f) => {
    const room = Math.max(BUSHFIRE_FX.emberOut[0], (site.gardenDepth ?? Infinity) - BUSHFIRE_FX.emberEdgeClear);
    const lift = site.bedOut ?? 0;
    const wispOut = Math.min(bedMid, room) + lift;
    for (let i = 0; i < column; i += 1) {
      origin.setXYZ(f * per + i, site.x, site.y, site.z);
      lean.setXY(f * per + i, BUSHFIRE_FX.plumeDrift, 0);
    }
    // Short wisps rise off the middle of the bed at the facade foot, leaning back onto the wall.
    for (let i = column; i < per; i += 1) {
      const mid = site.bedCentre ?? 0;
      origin.setXYZ(f * per + i, site.facade.x + site.normal.x * wispOut + site.tangent.x * mid,
        site.bedY ?? BUSHFIRE_FX.bedY, site.facade.z + site.normal.z * wispOut + site.tangent.z * mid);
      lean.setXY(f * per + i, site.normal.x * BUSHFIRE_FX.wispLean, site.normal.z * BUSHFIRE_FX.wispLean);
    }
    for (const piece of emberBedLayout(site.id, site.halfFront, site.bedAlong ?? BUSHFIRE_FX.emberAlong)) {
      const out = Math.min(piece.out, room) + lift;
      const along = piece.along + (site.bedCentre ?? 0);
      dummy.position.set(
        site.facade.x + site.normal.x * out + site.tangent.x * along,
        site.bedY ?? BUSHFIRE_FX.bedY,
        site.facade.z + site.normal.z * out + site.tangent.z * along,
      );
      dummy.rotation.set(0, piece.yaw, 0);
      dummy.scale.set(piece.sx, piece.sy, piece.sz);
      dummy.updateMatrix();
      if (piece.glow) {
        emberGlow.setMatrixAt(live, dummy.matrix);
        live += 1;
      } else {
        emberBed.setMatrixAt(shard, dummy.matrix);
        emberBed.setColorAt(shard, piece.ash ? ash : char);
        shard += 1;
      }
    }
  });
  origin.needsUpdate = true;
  lean.needsUpdate = true;
  firePlume.count = sites.length * per;
  emberBed.count = shard;
  emberGlow.count = live;
  emberBed.instanceMatrix.needsUpdate = true;
  emberGlow.instanceMatrix.needsUpdate = true;
  if (emberBed.instanceColor) emberBed.instanceColor.needsUpdate = true;
  firePlume.visible = sites.length > 0;
  emberBed.visible = shard > 0;
  emberGlow.visible = live > 0;
}

/** Copy the scene's lights into the plume's light uniforms; the list is re-read once a second. */
function lightSmoke(u) {
  if (!plumeScene) return;
  if (fxClock >= lightAt) {
    lightAt = fxClock + 1;
    lightList = plumeScene.children.filter((o) => o.isDirectionalLight || o.isHemisphereLight || o.isAmbientLight);
  }
  const rig = smokeLightRig(lightList);
  if (!rig) return;
  u.uKeyDir.value.set(rig.dir[0], rig.dir[1], rig.dir[2]);
  u.uKeyCol.value.setRGB(rig.keyCol[0], rig.keyCol[1], rig.keyCol[2]);
  u.uFloor.value.setRGB(rig.floor[0], rig.floor[1], rig.floor[2]);
}

function updateLitWeather(state, weather, fx, options) {
  if (!firePlume || !emberBed || !emberGlow) return;
  const city = options.city ?? fxCity;
  writeBushfires(bushfireSites(state, city, { frontRotation: options.frontRotation ?? fxFrontRotation }));
  const night = weatherNightLevel(options.arc);
  const reduced = options.reducedMotion === true;
  const u = firePlume.material.uniforms;
  // Reduced motion: the column holds still at its evenly spread phases and the embers stop flickering.
  u.plumeTime.value = reduced ? 0 : fxClock % BUSHFIRE_FX.plumePeriod;
  u.uNight.value = night;
  u.uDay.value = 1 - night;
  if (firePlume.visible) lightSmoke(u);
  const flicker = reduced ? 1 : 0.8 + Math.abs(Math.sin(fxClock * 5.3)) * 0.2;
  const glow = emberGlow.material;
  glow.emissiveIntensity = fxEmberGlow * night * flicker;
  if (glow.userData.emberLevel) glow.userData.emberLevel.value = glow.emissiveIntensity;
}

export function updateWeatherFx(state, dt, options = {}) {
  if (!mounted || !THREE_REF || !dummy) return;
  const weather = weatherOf(state);
  const step = Number.isFinite(dt) ? dt : 0.016;
  fxClock += step;
  const fx = weatherFxIntensity(weather?.state);

  if (fxLit) updateLitWeather(state, weather, fx, options ?? {});

  if (skyTintMesh) {
    const tint = fx.skyTint;
    skyTintMesh.visible = tint > 0.001;
    skyTintMesh.material.opacity = tint;
  }

  // The port arrives asynchronously. Search at most once a second until its
  // existing funnel mouth is available; parenting follows all ship motion.
  if (!plumeAttached && fxClock >= plumeSearchAt) {
    plumeSearchAt = fxClock + 1;
    const mouth = plumeScene?.getObjectByName('fringe:ship:tanker')?.getObjectByName('funnel:mouth');
    if (mouth?.geometry) {
      mouth.geometry.computeBoundingBox();
      mouth.geometry.boundingBox.getCenter(smokeMesh.position);
      smokeMesh.position.y += 0.14;
      // Static batching freezes InstancedMesh local matrices before the async
      // port arrives. Commit the attachment transform explicitly.
      smokeMesh.updateMatrix();
      mouth.add(smokeMesh);
      plumeAttached = true;
      smokeMesh.visible = true;
    }
  }
  // The exhaust's clock: its own uniform in the shared lit program, plumeTime in the pre-L3 one.
  const exhaust = smokeMesh.material.uniforms;
  (exhaust.uTankerTime ?? exhaust.plumeTime).value = fxClock % 8;
  const smokeOn = bushfireLive(weather);
  if (emberMesh) {
    emberMesh.visible = smokeOn;
    if (smokeOn) {
      const pulse = 0.72 + Math.abs(Math.sin(fxClock * 7.4)) * 0.28;
      emberMesh.scale.setScalar(WEATHER_FX.emberGlow * pulse);
      emberMesh.material.opacity = 0.55 + pulse * 0.35;
    }
  }
}

export function disposeWeatherFx(scene) {
  if (!mounted) return;
  smokeMesh?.removeFromParent();
  if (scene && skyTintMesh) scene.remove(skyTintMesh);
  if (scene && emberMesh) scene.remove(emberMesh);
  for (const mesh of [firePlume, emberBed, emberGlow]) {
    mesh?.removeFromParent();
    mesh?.geometry?.dispose?.();
    mesh?.material?.dispose?.();
  }
  firePlume = null;
  emberBed = null;
  emberGlow = null;
  lightAt = -1;
  lightList = [];
  fireSignature = '';
  fxCity = null;
  fxFrontRotation = null;
  fxLit = false;
  smokeMesh?.geometry?.dispose?.();
  smokeMesh?.material?.dispose?.();
  skyTintMesh?.geometry?.dispose?.();
  skyTintMesh?.material?.dispose?.();
  emberMesh?.geometry?.dispose?.();
  emberMesh?.material?.dispose?.();
  smokeMesh = null;
  skyTintMesh = null;
  emberMesh = null;
  plumeScene = null;
  plumeAttached = false;
  plumeSearchAt = 0;
  dummy = null;
  mounted = false;
  fxClock = 0;
}
