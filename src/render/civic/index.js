// District Deck V3.70 — civic kit dispatcher (lane L3).
//
// Same contract as `residential/index.js` and `industrial/index.js`: `building-kit.js` calls
// `assembleCivic()` before its own legacy path. When a builder is registered for the archetype
// the civic kit owns the whole model; when it is not, this returns null and the legacy kit runs
// unchanged. That fall-through is what keeps the programme from ever leaving the board in a
// worse state than it started.
//
// Lane ownership (V370-AAA-PROGRAMME-SPEC §4) — one file per subject, so nothing in this
// directory is edited by two hands at once:
//
//   hospital.js          hospital-district
//   school.js            school-primary
//   community-centre.js  community-recreation
//   core.js              shared primitives, deterministic variation, the lot kit
//   surfaces.js          the nine-bucket palette
//   openings.js          reveals, frames, panes, interactive leaves
//
// The nine-bucket cap in §3.2 of the spec is a hard cap per BUILDING, not per directory.
//
// `school-primary` still prefers a commissioned GLB in `board.js`. Force the kit for review with
// `?forcekit=school-primary`; the id joins `V370_KIT_IDS` when the lane clears the gate.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE, STOREY, SETBACK } from '../../core/grid.js';
import { MaterialLibrary } from '../materials.js';
import { makeContext, variation, CIVIC_BUCKET_CAP, CIVIC_METRICS } from './core.js';
import { civicPalette } from './surfaces.js';
import buildHospital, { HOSPITAL_ENVELOPE } from './hospital.js';
import buildSchool, { SCHOOL_ENVELOPE } from './school.js';
import buildCommunity, { COMMUNITY_ENVELOPE } from './community-centre.js';
import buildCourthouse, { COURTHOUSE_ENVELOPE } from './courthouse.js';
// V3.41 MP9 lanes E / F / G / H. Three schools that were one school with three signs, and the
// exchange that was falling through to the legacy stock-exchange kit, get models of their own.
import buildHighSchool, { HIGH_SCHOOL_ENVELOPE } from './high-school.js';
import buildMissionarySchool, { MISSIONARY_SCHOOL_ENVELOPE } from './missionary-school.js';
import buildOfficerSchool, { OFFICER_SCHOOL_ENVELOPE } from './officer-school.js';
import buildInternationalExchange, { INTERNATIONAL_EXCHANGE_ENVELOPE } from './international-exchange.js';
import { signBoard } from './core.js';

// These five forms already have dedicated, identity-specific builders in building-kit.js.
// Registering them here makes the civic dispatcher authoritative without copying thousands of
// lines of established geometry into a second implementation. `assembleBuilding()` supplies a
// one-shot adapter that re-enters its legacy section with civic dispatch disabled.
function buildExistingBuildingKitCivic() {}

const EXISTING_BUILDING_KIT_ENVELOPE = Object.freeze({
  'supermarket-strip': Object.freeze({ footprint: Object.freeze([3, 1]), storeys: 1 }),
  'transport-interchange': Object.freeze({ footprint: Object.freeze([1, 2]), storeys: 1 }),
  'remand-centre': Object.freeze({ footprint: Object.freeze([1, 2]), storeys: 3 }),
  'police-station': Object.freeze({ footprint: Object.freeze([1, 1]), storeys: 2 }),
  'cafe-corner': Object.freeze({ footprint: Object.freeze([1, 1]), storeys: 1 }),
});

const INSTITUTION_FASCIA = Object.freeze({
  'missionary-school': 'MISSION SCHOOL',
  'officer-school': 'OFFICER SCHOOL',
});

/**
 * archetypeId → builder(ctx). A missing entry falls through to the legacy kit.
 *
 * @type {Readonly<Record<string, (ctx: any) => void>>}
 */
export const CIVIC_BUILDERS = Object.freeze({
  'hospital-district': buildHospital,
  'school-primary': buildSchool,
  // V3.41 MP9 — three subjects that shared `buildSchool` now have their own lane files.
  'school-high': buildHighSchool,
  'missionary-school': buildMissionarySchool,
  'officer-school': buildOfficerSchool,
  'community-recreation': buildCommunity,
  courthouse: buildCourthouse,
  'supermarket-strip': buildExistingBuildingKitCivic,
  'transport-interchange': buildExistingBuildingKitCivic,
  'remand-centre': buildExistingBuildingKitCivic,
  'police-station': buildExistingBuildingKitCivic,
  'cafe-corner': buildExistingBuildingKitCivic,
  // V3.41 MP9 lane H — the exchange leaves the legacy stock-exchange path.
  'international-exchange': buildInternationalExchange,
});

/** Per-subject envelope, authored beside its builder and mirrored here for the dispatcher. */
export const CIVIC_ENVELOPE = Object.freeze({
  'hospital-district': HOSPITAL_ENVELOPE,
  'school-primary': SCHOOL_ENVELOPE,
  'school-high': HIGH_SCHOOL_ENVELOPE,
  'missionary-school': MISSIONARY_SCHOOL_ENVELOPE,
  'officer-school': OFFICER_SCHOOL_ENVELOPE,
  'community-recreation': COMMUNITY_ENVELOPE,
  courthouse: COURTHOUSE_ENVELOPE,
  'international-exchange': INTERNATIONAL_EXCHANGE_ENVELOPE,
  ...EXISTING_BUILDING_KIT_ENVELOPE,
});

/** Whether the civic kit owns this archetype. */
export function ownsArchetype(archetypeId) {
  return typeof CIVIC_BUILDERS[archetypeId] === 'function';
}

/**
 * Assemble a civic model, or return null so the legacy kit runs.
 *
 * @param {string} archetypeId
 * @param {import('../materials.js').MaterialLibrary} materials
 * @param {{districtId?: string|null, quality?: string, facade?: number,
 *          lotSpan?: {spanX:number, spanZ:number}}} opts
 * @returns {{parts: Array<{geometry: any, material: any}>, openings: Array<any>, size: any,
 *            frameBox: any, source: string, fallback: boolean, kit: boolean,
 *            archetypeId: string, form: string} | null}
 */
export function assembleCivic(archetypeId, materials, opts = {}) {
  const builder = CIVIC_BUILDERS[archetypeId];
  if (!builder) return null;
  const spec = CIVIC_ENVELOPE[archetypeId];
  if (!spec) return null;
  if (builder === buildExistingBuildingKitCivic) {
    return typeof opts.buildingKitAssembler === 'function'
      ? opts.buildingKitAssembler()
      : null;
  }

  const quality = opts.quality ?? 'high';
  const districtId = opts.districtId ?? null;
  const facade = Math.max(0, Math.min(3, opts.facade | 0));

  // THE LOT IS THE PARCEL WHEN THE CALLER KNOWS THE DIFFERENCE.
  //
  // All three subjects are authored `footprint: [1, 2]` in `core/landuse.js`, and the industrial
  // lane measured that authored footprints and real parcels disagree — 49 of 80 warehouse
  // parcels turned out to be a single tile. `opts.lotSpan` is the measured parcel; when it is
  // absent (the lab, a tile preview) the authored footprint stands. The building is clamped to
  // whatever the lot turns out to be rather than overhanging it (§3.6).
  const span = opts.lotSpan;
  const tilesX = Math.max(1, span?.spanX ?? spec.footprint[0]);
  const tilesZ = Math.max(1, span?.spanZ ?? spec.footprint[1]);
  const lotW = tilesX * TILE - SETBACK * 2;
  const lotD = tilesZ * TILE - SETBACK * 2;

  const v = variation(`v370civic|${archetypeId}|${districtId ?? ''}|f${facade}`);
  const p = civicPalette(materials, { id: archetypeId, districtId, facade, v });

  // Façade jitter is deliberately small on a civic building. A hospital is not four different
  // hospitals; the variation budget goes to planting, wear and colour spread rather than to
  // massing, because the massing IS the identity the silhouette argument rests on.
  const wJ = 1 + (facade - 1.5) * 0.010;
  const dJ = 1 + ((facade * 2) % 3 - 1) * 0.012;

  const env = {
    archetypeId,
    facade,
    districtId,
    lotW,
    lotD,
    footprint: [tilesX, tilesZ],
    storeyH: STOREY,
    /** Everything on the lot stands on the board plate's deck. */
    groundY: CIVIC_METRICS.plateRise,
    ...spec,
    // Scale the authored envelope onto the measured lot so nothing leaves the pad.
    ...scaleEnvelope(spec, lotW, lotD, wJ, dJ),
  };

  const ctx = makeContext({ env, palette: p, variation: v, quality, archetypeId, districtId });
  builder(ctx);
  if (INSTITUTION_FASCIA[archetypeId]) {
    ctx.add(signBoard(ctx, {
      x: 0,
      z: Math.min(lotD * 0.42, 8.5),
      w: 3.1,
      h: 1.12,
      name: `${archetypeId}-fascia`,
    }));
  }
  if (!ctx.parts.length) return null;

  // `unmerged: true` hands back the named primitives instead of nine merged buckets. It exists for
  // the lane's area census, which has to be able to EXCLUDE the interior room shells: `volume()`
  // builds a solid box inside every mass so a punched opening does not read as a black sticker, and
  // those boxes are invisible except through the openings. A census on merged geometry cannot tell
  // them from the façade they sit behind, and the first version of that census consequently
  // reported the `metal` bucket owning 30 % of every subject's facing area — a number that would
  // have driven a palette decision to fix an area nobody can see.
  if (opts.unmerged) {
    return {
      parts: ctx.parts, openings: ctx.openings, source: 'civic-kit', kit: true, archetypeId,
    };
  }
  const merged = mergeByMaterial(ctx.parts, archetypeId);
  if (merged.length > CIVIC_BUCKET_CAP) {
    console.warn(
      `[civic] ${archetypeId} produced ${merged.length} material buckets `
      + `(cap ${CIVIC_BUCKET_CAP}). Reuse a palette bucket instead of adding a material.`,
    );
  }

  const bounds = new THREE.Box3();
  const scratch = new THREE.Box3();
  for (const part of merged) {
    if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
    scratch.copy(part.geometry.boundingBox);
    bounds.union(scratch);
  }
  const size = bounds.isEmpty()
    ? new THREE.Vector3(lotW, spec.storeys * STOREY, lotD)
    : bounds.getSize(new THREE.Vector3());

  return {
    parts: merged,
    openings: ctx.openings,
    size,
    frameBox: bounds.clone(),
    source: 'civic-kit',
    fallback: false,
    kit: true,
    archetypeId,
    form: 'civic',
  };
}

/**
 * Fit the authored envelope inside the measured lot.
 *
 * The authored numbers are set against a 1 × 2 parcel (15 × 31 m after the setback lattice). On a
 * lot that is not that shape every X dimension scales by the width ratio and every Z by the depth
 * ratio, so the building keeps its proportions and its front setback rather than spilling. The
 * façade jitter rides on top, which is why it is applied HERE rather than inside a builder — a
 * builder that jitters its own dimensions cannot know how much room the clamp left.
 */
function scaleEnvelope(spec, lotW, lotD, wJ, dJ) {
  const sx = (lotW / 15) * wJ;
  const sz = (lotD / 31) * dJ;
  const out = {};
  for (const [k, value] of Object.entries(spec)) {
    if (typeof value !== 'number') continue;
    // Counts and vertical dimensions never scale with the lot. `bays` and `wardLevels` are
    // integers a builder loops on, and a hospital storey is 3.2 m on a wide parcel and on a
    // narrow one. Only plan dimensions move, and they move on the axis they belong to.
    if (COUNT_KEYS.has(k)) continue;
    if (/(W|X|Gap)$/.test(k)) out[k] = value * sx;
    else if (/(Z|D)$/.test(k)) out[k] = value * sz;
  }
  return out;
}

const COUNT_KEYS = Object.freeze(new Set([
  'bays', 'storeys', 'storeyH', 'wardLevels',
]));

/**
 * One geometry per material. Mirrors `building-kit.js`'s own merge so the two kits present the
 * board with the same shape of model.
 *
 * The attribute pruning is not tidiness: `mergeGeometries` requires every input to carry the same
 * attribute set, and a stray attribute on one primitive returns null for the whole merge —
 * silently, which would drop a whole material system off the building.
 */
function mergeByMaterial(parts, archetypeId) {
  const buckets = new Map();
  for (const part of parts) {
    const k = part.material?.uuid ?? 'none';
    if (!buckets.has(k)) buckets.set(k, { material: part.material, geos: [] });
    buckets.get(k).geos.push(part.geometry);
  }
  const merged = [];
  for (const { material, geos } of buckets.values()) {
    const prepared = [];
    for (const raw of geos) {
      let g = raw;
      if (g.index) {
        const nonIndexed = g.toNonIndexed();
        g.dispose();
        g = nonIndexed;
      }
      for (const name of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) {
        const n = g.attributes.position.count;
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      }
      prepared.push(g);
    }
    const geometry = prepared.length === 1 ? prepared[0] : mergeGeometries(prepared, false);
    if (!geometry) {
      for (let i = 1; i < prepared.length; i += 1) prepared[i].dispose();
      if (prepared[0]) {
        prepared[0].computeBoundingBox();
        prepared[0].computeBoundingSphere();
        MaterialLibrary.ensureUv2(prepared[0]);
        merged.push({ geometry: prepared[0], material });
      }
      continue;
    }
    if (prepared.length > 1) for (const g of prepared) g.dispose();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    MaterialLibrary.ensureUv2(geometry);
    geometry.name = `civic:${archetypeId}:${material?.userData?.family ?? 'wall'}`;
    merged.push({ geometry, material });
  }
  return merged;
}

export { TILE, STOREY, SETBACK };
