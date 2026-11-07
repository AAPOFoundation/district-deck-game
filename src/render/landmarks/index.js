// District Deck V3.70 — LANDMARKS kit dispatcher.
//
// Same contract as `civic/index.js`, `residential/index.js` and `industrial/index.js`:
// `building-kit.js` would call `assembleLandmark()` before its own legacy path, and when no
// builder is registered for the archetype this returns null and nothing changes. That
// fall-through is what lets the kit be adopted with one line and no merge — and it is why this
// lane touches no shared file. Adoption is:
//
//   import { assembleLandmark } from './landmarks/index.js';
//   const lm = assembleLandmark(archetypeId, materials, opts); if (lm) return lm;
//
// Lane ownership — one file per subject, so nothing here is edited by two hands at once:
//
//   old-arts.js    university-old-arts    the University of Melbourne's Old Arts building
//   town-hall.js   town-hall-melbourne    the Melbourne Town Hall
//   kit.js         shared primitives, deterministic variation, the lot kit
//   surfaces.js    the nine-bucket palette
//   openings.js    reveals, arches, tracery, panes, interactive leaves, the clock face

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE, STOREY, SETBACK } from '../../core/grid.js';
import { MaterialLibrary } from '../materials.js';
import { makeContext, variation, LM_BUCKET_CAP, LM_METRICS } from './kit.js';
import { landmarkPalette } from './surfaces.js';
import buildOldArts, { OLD_ARTS_ENVELOPE } from './old-arts.js';
import buildTownHall, { TOWN_HALL_ENVELOPE } from './town-hall.js';

/** archetypeId → builder(ctx). A missing entry falls through to whatever the caller had. */
export const LANDMARK_BUILDERS = Object.freeze({
  'university-old-arts': buildOldArts,
  'town-hall-melbourne': buildTownHall,
});

const ENVELOPE = Object.freeze({
  'university-old-arts': OLD_ARTS_ENVELOPE,
  'town-hall-melbourne': TOWN_HALL_ENVELOPE,
});

/** Whether the landmarks kit owns this archetype. */
export function ownsArchetype(archetypeId) {
  return typeof LANDMARK_BUILDERS[archetypeId] === 'function';
}

/** Every id this kit can assemble. */
export const LANDMARK_IDS = Object.freeze(Object.keys(LANDMARK_BUILDERS));

/**
 * Assemble a landmark, or return null.
 *
 * `opts.unmerged` hands back the named primitives instead of the merged buckets. It exists for
 * this lane's own instruments — the board-zoom raster has to be able to name the part it is
 * measuring, and a census on merged geometry cannot tell an interior room shell from the façade
 * in front of it.
 */
export function assembleLandmark(archetypeId, materials, opts = {}) {
  const builder = LANDMARK_BUILDERS[archetypeId];
  if (!builder) return null;
  const spec = ENVELOPE[archetypeId];
  if (!spec) return null;

  const quality = opts.quality ?? 'high';
  const districtId = opts.districtId ?? null;
  const facade = Math.max(0, Math.min(3, opts.facade | 0));

  // The lot is the parcel when the caller knows the difference; the authored footprint stands
  // when it does not (the lab, a tile preview). The building is clamped to whatever the lot turns
  // out to be rather than overhanging it (§3.6).
  const span = opts.lotSpan;
  const tilesX = Math.max(1, span?.spanX ?? spec.footprint[0]);
  const tilesZ = Math.max(1, span?.spanZ ?? spec.footprint[1]);
  const lotW = tilesX * TILE - SETBACK * 2;
  const lotD = tilesZ * TILE - SETBACK * 2;

  const v = variation(`v370lm|${archetypeId}|${districtId ?? ''}|f${facade}`);
  const p = landmarkPalette(materials, { id: archetypeId, districtId, facade, v });

  // Façade jitter is small on a landmark, and smaller than the civic lane's. There is exactly one
  // Melbourne Town Hall; four visibly different massings of it on one board would be a worse
  // model, not a more varied one. The variation budget goes to planting, wear and colour spread.
  const wJ = 1 + (facade - 1.5) * 0.006;
  const dJ = 1 + ((facade * 2) % 3 - 1) * 0.008;

  const env = {
    archetypeId,
    facade,
    districtId,
    lotW,
    lotD,
    footprint: [tilesX, tilesZ],
    storeyH: STOREY,
    groundY: LM_METRICS.plateRise,
    ...spec,
    ...scaleEnvelope(spec, lotW, lotD, wJ, dJ),
  };

  const ctx = makeContext({ env, palette: p, variation: v, quality, archetypeId, districtId });
  builder(ctx);
  if (!ctx.parts.length) return null;

  if (opts.unmerged) {
    return {
      parts: ctx.parts,
      openings: ctx.openings,
      apertures: ctx.apertures,
      ...(ctx.i2 ? { i2: ctx.i2 } : {}),
      source: 'landmark-kit',
      kit: true,
      archetypeId,
    };
  }

  const merged = mergeByMaterial(ctx.parts, archetypeId);
  if (merged.length > LM_BUCKET_CAP) {
    console.warn(
      `[landmarks] ${archetypeId} produced ${merged.length} material buckets `
      + `(cap ${LM_BUCKET_CAP}). Reuse a palette bucket instead of adding a material.`,
    );
  }

  const bounds = new THREE.Box3();
  const scratch = new THREE.Box3();
  for (const item of merged) {
    if (!item.geometry.boundingBox) item.geometry.computeBoundingBox();
    scratch.copy(item.geometry.boundingBox);
    bounds.union(scratch);
  }
  const size = bounds.isEmpty()
    ? new THREE.Vector3(lotW, (spec.storeys ?? 2) * STOREY, lotD)
    : bounds.getSize(new THREE.Vector3());

  return {
    parts: merged,
    openings: ctx.openings,
    apertures: ctx.apertures,
    size,
    frameBox: bounds.clone(),
    source: 'landmark-kit',
    fallback: false,
    kit: true,
    archetypeId,
    form: 'landmark',
    ...(ctx.i2 ? {
      i2: ctx.i2,
      p17B7: { sheet: 'civic-hall', signals: ctx.i2.signals, plinthChamferM: .65, plinthBevelM: .18 },
      p17RoofPlant: { kind: 'nothing', heightM: 0, areaFrac: 0, areaM2: 0 },
    } : {}),
  };
}

/**
 * Fit the authored envelope inside the measured lot.
 *
 * Authored numbers are set against a 2 x 2 parcel (31 x 31 m after the setback lattice). Counts
 * and vertical dimensions never scale: a storey is 4.9 m on a wide parcel and on a narrow one,
 * and a tower's height is its proportion to its own width, not to the lot's. Only plan dimensions
 * move, and each moves on the axis it belongs to.
 */
function scaleEnvelope(spec, lotW, lotD, wJ, dJ) {
  const sx = (lotW / 31) * wJ;
  const sz = (lotD / 31) * dJ;
  const out = {};
  for (const [k, value] of Object.entries(spec)) {
    if (typeof value !== 'number') continue;
    if (COUNT_KEYS.has(k)) continue;
    if (/(W|X|Gap)$/.test(k)) out[k] = value * sx;
    else if (/(Z|D)$/.test(k)) out[k] = value * sz;
  }
  return out;
}

const COUNT_KEYS = Object.freeze(new Set([
  'storeys', 'storeyH', 'bays', 'roofPitch', 'columns',
]));

/**
 * One geometry per material.
 *
 * The attribute pruning is not tidiness: `mergeGeometries` requires every input to carry the same
 * attribute set, and a stray attribute on one primitive returns null for the whole merge —
 * silently, which would drop a whole material system off the building.
 */
function mergeByMaterial(parts, archetypeId) {
  const buckets = new Map();
  for (const item of parts) {
    const k = item.material?.uuid ?? 'none';
    if (!buckets.has(k)) buckets.set(k, { material: item.material, geos: [] });
    buckets.get(k).geos.push(item.geometry);
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
        if (!['position', 'normal', 'uv', ...(archetypeId === 'town-hall-melbourne' ? ['color'] : [])].includes(name)) g.deleteAttribute(name);
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
    geometry.name = `landmark:${archetypeId}:${material?.userData?.family ?? 'wall'}`;
    merged.push({ geometry, material });
  }
  return merged;
}

export { TILE, STOREY, SETBACK };
