// District Deck V3.20 — residential kit dispatcher.
//
// building-kit.js calls `assembleResidential()` before its own legacy path. When a builder
// is registered for the archetype the residential kit owns the whole model; when it is not,
// this returns null and the legacy kit runs unchanged. That fall-through is what keeps the
// programme from ever leaving the board in a worse state than it started.
//
// Lane ownership (V320-RESIDENTIAL-AAA-SPEC §5) — one file per lane, so lanes never edit
// the same source:
//
//   terrace.js       Lane A   terrace-single, terrace-double, terrace-carlton-heritage
//   federation.js    Lane B   cottage-federation, heritage-federation-villa,
//                             bungalow-californian, bungalow-brighton
//   walkup.js        Lane C   walkup-flats, art-deco-flats
//   contemporary.js  Lane D   townhouse-row, townhouse-paired-single, apartment-low,
//                             apartment-mid, apartment-midrise, apartment-permit,
//                             apartment-tower
//   ornament.js      shared   lace, brackets, corbels, finials, sills, chimneys, spouting
//   curtilage.js     shared   fences, gates, paths, planting, letterboxes, services
//   core.js          shared   primitives, deterministic variation, the palette

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE, STOREY, SETBACK } from '../../core/grid.js';
import { MaterialLibrary, surfacesForArchetype } from '../materials.js';
import { makeContext, palette, variation, PALETTE_BUCKET_CAP } from './core.js';
import {
  R77_FRONT_DATUM,
  R77_MAP_ATTRIBUTE,
  authorMissingDecoMap,
  decoSurfaceKind,
} from './deco-surfaces-r77.js';

import { TERRACE_BUILDERS } from './terrace.js';
import { WALKUP_BUILDERS } from './walkup.js';
import { assembleHeritageWalkup, HERITAGE_WALKUP_ARCHETYPES, HERITAGE_WALKUP_ENVELOPE } from './walkup-heritage.js';
import { CONTEMPORARY_BUILDERS } from './contemporary.js';
import { HOUSE_ARCHETYPES, assembleHouse } from './houses/index.js';
import { MODERN_ARCHETYPES, assembleModern } from './modern/index.js';

// V3.40 — Lane B is stashed and its four archetypes now belong to `houses/`.
//
// `federation.js` carried `cottage-federation`, `heritage-federation-villa`,
// `bungalow-californian` and `bungalow-brighton`. It is archived unread at
// `_stash/federation-v330-stashed.js` and is no longer imported. The four are rebuilt from
// scratch under `houses/`, which owns its own context, palette, detail and curtilage rather
// than inheriting this file's shared ones — see `houses/index.js` for the reasons, which are
// specific and were paid for.

/** archetypeId → builder(ctx). A missing entry falls through to the legacy kit. */
export const RESIDENTIAL_BUILDERS = Object.freeze({
  ...TERRACE_BUILDERS,
  ...WALKUP_BUILDERS,
  ...CONTEMPORARY_BUILDERS,
});

/** Storeys and lot posture per archetype, independent of the authored economic record. */
/**
 * A note on the terrace widths, because the number that looks wrong is the right one.
 *
 * A parcel is one 16-unit tile, so two neighbouring buildings can never be closer than a tile
 * apart. At the first draft's `widthF: 0.52` a single-fronted terrace was 7.8 wide on a
 * 15-unit lot, and a Carlton street of ten drew as ten detached boxes with a blank flank each
 * — the r05 row plate is unambiguous about it. Party walls cannot meet ACROSS parcels at this
 * grid, ever.
 *
 * So they meet INSIDE one. `ref-01` is the evidence: five frontages sharing party walls on a
 * single board base. A terrace holding in Carlton is a row of dwellings, not one house, and
 * `units` is how many narrow frontages the builder subdivides its width into. The flanks that
 * remain exposed are the two ends of the row, which is exactly where a real terrace row shows
 * a party wall — so the blank-flank problem and the street-read problem have the same fix.
 */
const ENVELOPE = Object.freeze({
  'walkup-beaux-arts': HERITAGE_WALKUP_ENVELOPE['walkup-beaux-arts'],
  'walkup-moderne': HERITAGE_WALKUP_ENVELOPE['walkup-moderne'],
  'terrace-single':            { storeys: 2, widthF: 0.94, depthF: 0.86, frontSetback: 0.10, party: true, units: 3 },
  'terrace-double':            { storeys: 2, widthF: 0.94, depthF: 0.86, frontSetback: 0.10, party: true, units: 2 },
  'terrace-carlton-heritage':  { storeys: 2, widthF: 0.94, depthF: 0.88, frontSetback: 0.12, party: true, units: 2 },
  'cottage-federation':        { storeys: 1, widthF: 0.74, depthF: 0.78, frontSetback: 0.26, party: false },
  'heritage-federation-villa': { storeys: 1, widthF: 0.86, depthF: 0.84, frontSetback: 0.24, party: false },
  'bungalow-californian':      { storeys: 1, widthF: 0.84, depthF: 0.80, frontSetback: 0.26, party: false },
  'bungalow-brighton':         { storeys: 1, widthF: 0.86, depthF: 0.78, frontSetback: 0.28, party: false },
  // Same reasoning as the terraces above: a row is a row inside one parcel, not a detached
  // box hoping its neighbour lands close enough. A contemporary townhouse row is three
  // dwellings; a paired townhouse is, by name, two.
  'townhouse-row':             { storeys: 3, widthF: 0.94, depthF: 0.82, frontSetback: 0.14, party: true, units: 3 },
  'townhouse-paired-single':   { storeys: 2, widthF: 0.94, depthF: 0.80, frontSetback: 0.18, party: true, units: 2 },
  'walkup-flats':              { storeys: 3, widthF: 0.88, depthF: 0.80, frontSetback: 0.18, party: false },
  'art-deco-flats':            { storeys: 3, widthF: 0.88, depthF: 0.80, frontSetback: 0.16, party: false },
  'apartment-low':             { storeys: 4, widthF: 0.90, depthF: 0.84, frontSetback: 0.12, party: false },
  'apartment-mid':             { storeys: 6, widthF: 0.90, depthF: 0.86, frontSetback: 0.10, party: false },
  'apartment-midrise':         { storeys: 7, widthF: 0.90, depthF: 0.86, frontSetback: 0.10, party: false },
  'apartment-permit':          { storeys: 5, widthF: 0.90, depthF: 0.86, frontSetback: 0.12, party: false },
  'apartment-tower':           { storeys: 12, widthF: 0.82, depthF: 0.82, frontSetback: 0.10, party: false },
});

/**
 * Archetypes whose wall material is part of their identity, and which therefore ignore
 * `DISTRICT_WALL_BIAS`.
 *
 * The bias exists so six districts collapse into a handful of wall families, and for the
 * archetypes that genuinely vary — a terrace is render in Carlton and brick in Fitzroy, both
 * true — it is right. But it was also turning an interwar brick walk-up into a cream rendered
 * box in every district that prefers render, and the blind pair against `ref-05` made the cost
 * obvious: Lane C built a correct art-deco silhouette — curved stair tower, stepped parapet,
 * corner bays, speed lines — and then rendered the whole thing in one cream, against a
 * reference whose entire character is red brick banded with cream. A red-brick 1938 walk-up is
 * a red-brick 1938 walk-up in Brighton as much as in Richmond.
 *
 * Deliberately a short list. Every entry here costs a wall-family batch key, so it is reserved
 * for archetypes where the material IS the period.
 */
const MATERIAL_IDENTITY = Object.freeze({
  'apartment-midrise': { wall: 'brick', roof: 'concrete', trim: 'timber' },
  // The roof family is the archetype identity for both tiled Federation/interwar houses.
  // Keep this override residential-local rather than changing the shared surface registry.
  'heritage-federation-villa': { wall: 'render', roof: 'tile', trim: 'timber' },
  'bungalow-brighton': { wall: 'render', roof: 'tile', trim: 'timber' },
  // Authored brick already; this only stops a render-biased district washing it out.
  'walkup-flats': null,
  // `ARCHETYPE_SURFACES` authors this one as render, which is the deeper reason the plate came
  // out cream — the district bias was not the culprit and the first version of this fix, which
  // only suppressed the bias, changed nothing. Melbourne interwar deco is brick banded with
  // render, not render throughout, so the wall family is overridden outright. materials.js is
  // shared and owned elsewhere, so the override lives here rather than in the authored table.
  'art-deco-flats': { wall: 'brick', roof: 'concrete', trim: 'render' },
});

/**
 * Surfaces for a residential archetype: the shared resolver, except that the archetypes above
 * hold their own material whatever district they land in.
 *
 * `DISTRICT_WALL_BIAS` exists so six districts collapse into a handful of wall families, and
 * for archetypes that genuinely vary — a terrace is render in Carlton and brick in Fitzroy,
 * both true — it is right. It is wrong where the material IS the period: the blind pair
 * against `ref-05` showed Lane C building a correct art-deco silhouette (curved stair tower,
 * stepped parapet, corner bays, speed lines) and then rendering all of it in one cream,
 * against a reference whose entire character is red brick banded with cream.
 *
 * Deliberately a short list. Every entry costs a wall-family batch key.
 */
function residentialSurfaces(archetypeId, districtId) {
  // Residential identity is declared by the archetype. The district still supplies its
  // instance chroma in the board, but must not turn brick walk-ups or weatherboard cottages
  // into render by replacing the family before palette() can select its response.
  const declared = surfacesForArchetype(archetypeId, null);
  const identity = MATERIAL_IDENTITY[archetypeId];
  return identity ? { ...declared, ...identity } : declared;
}

/** Whether the residential kit owns this archetype. */
export function ownsArchetype(archetypeId) {
  return HOUSE_ARCHETYPES.has(archetypeId)
    || MODERN_ARCHETYPES.has(archetypeId)
    || HERITAGE_WALKUP_ARCHETYPES.has(archetypeId)
    || typeof RESIDENTIAL_BUILDERS[archetypeId] === 'function';
}

/**
 * Assemble a residential model, or return null so the legacy kit runs.
 *
 * @param {string} archetypeId
 * @param {MaterialLibrary} materials
 * @param {{districtId?: string|null, quality?: string, facade?: number}} opts
 */
export function assembleResidential(archetypeId, materials, opts = {}) {
  // V3.40 — the four detached houses are owned by their own lane, which builds its own context
  // and palette. When that lane has nothing to give (its builders are still empty), return null
  // so `building-kit.js` runs its legacy path: an honest empty state rather than a silent
  // fall-back to the stashed models this programme exists to replace.
  if (HOUSE_ARCHETYPES.has(archetypeId)) {
    return assembleHouse(archetypeId, materials, opts);
  }
  if (MODERN_ARCHETYPES.has(archetypeId)) {
    return assembleModern(archetypeId, materials, opts);
  }

  // The two interwar walk-ups are a top-level assembler with the same (id, materials, opts)
  // shape as `assembleModern` — NOT a `(ctx) => ...` entry in RESIDENTIAL_BUILDERS. Wiring them
  // into that map passed `ctx.materials` where a MaterialLibrary was required and broke boot.
  if (HERITAGE_WALKUP_ARCHETYPES.has(archetypeId)) {
    return assembleHeritageWalkup(archetypeId, materials, opts);
  }

  const builder = RESIDENTIAL_BUILDERS[archetypeId];
  if (!builder) return null;

  const quality = opts.quality ?? 'high';
  const districtId = opts.districtId ?? null;
  const facade = Math.max(0, Math.min(3, opts.facade | 0));
  const spec = ENVELOPE[archetypeId] ?? { storeys: 2, widthF: 0.8, depthF: 0.82, frontSetback: 0.16, party: false };

  const v = variation(`${archetypeId}|${districtId ?? ''}|f${facade}`);

  // The lot: one tile, minus the setback lattice. The building occupies widthF/depthF of it
  // and the remainder is curtilage — front garden toward +Z, a service margin behind.
  const lotW = TILE - SETBACK * 2;
  const lotD = TILE - SETBACK * 2;
  const bodyW = lotW * spec.widthF * (1 + (facade - 1.5) * 0.018);
  const bodyD = lotD * spec.depthF * (1 + ((facade * 2) % 3 - 1) * 0.02);
  const storeys = Math.max(1, spec.storeys);
  const wallH = storeys * STOREY;
  // Front wall plane. Positive Z is the street.
  const frontZ = lotD / 2 - lotD * spec.frontSetback;
  const backZ = frontZ - bodyD;

  const env = {
    lotW, lotD, bodyW, bodyD, storeys, wallH, frontZ, backZ,
    kerbZ: lotD / 2 + 0.6,
    facade,
    party: spec.party,
    /** How many party-walled frontages the builder subdivides the width into (1 = detached). */
    units: Math.max(1, spec.units ?? 1),
    storeyH: STOREY,
  };

  const surfaces = residentialSurfaces(archetypeId, districtId);
  const key = `${archetypeId}-${districtId ?? 'x'}-f${facade}`;
  const p = palette(materials, surfaces, v, key, archetypeId);

  const ctx = makeContext({
    env, palette: p, variation: v, quality, archetypeId, districtId,
  });

  builder(ctx);
  if (!ctx.parts.length) return null;

  const merged = mergeByMaterial(ctx.parts);
  // Mortar skins were the first ground faces. Without them the shadow bucket
  // precedes ground, and the generic kit then paints the lot tray and plinth
  // with shadow. Deco only: put ground back before shadow. No new bucket.
  if (archetypeId === 'art-deco-flats' && quality !== 'low') orderGroundBeforeShadow(merged);
  if (merged.length > PALETTE_BUCKET_CAP) {
    // Not fatal — the board still draws — but it is a spec breach worth surfacing in the
    // console during development rather than only in a perf run days later.
    console.warn(
      `[residential] ${archetypeId} produced ${merged.length} material buckets `
      + `(cap ${PALETTE_BUCKET_CAP}). Reuse a palette bucket instead of a new material.`,
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
    ? new THREE.Vector3(bodyW, wallH + 2.6, bodyD)
    : bounds.getSize(new THREE.Vector3());

  return {
    parts: merged,
    size,
    source: 'residential-kit',
    fallback: false,
    kit: true,
    archetypeId,
    abb: ctx.abb,
    i2: ctx.i2,
    form: 'residential',
  };
}

/**
 * One geometry per material. Mirrors building-kit.js's own merge so the two kits present
 * the board with the same shape of model.
 */
function orderGroundBeforeShadow(parts) {
  const variant = (part) => part.material?.userData?.variant ?? '';
  const ground = parts.findIndex((part) => variant(part).startsWith('res-ground-'));
  const shadow = parts.findIndex((part) => variant(part).startsWith('res-shadow-'));
  if (ground < 0 || shadow < 0 || ground < shadow) return parts;
  const [bucket] = parts.splice(ground, 1);
  parts.splice(shadow, 0, bucket);
  return parts;
}

function mergeByMaterial(parts) {
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
      const decoKind = decoSurfaceKind(material);
      if (decoKind) authorMissingDecoMap(g, decoKind, material.userData?.[R77_FRONT_DATUM]);
      const kept = ['position', 'normal', 'uv', ...(material?.vertexColors ? ['color'] : [])];
      if (decoKind) kept.push(R77_MAP_ATTRIBUTE);
      for (const name of Object.keys(g.attributes)) {
        if (!kept.includes(name)) g.deleteAttribute(name);
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
        MaterialLibrary.ensureUv2(prepared[0]);
        merged.push({ geometry: prepared[0], material });
      }
      continue;
    }
    if (prepared.length > 1) for (const g of prepared) g.dispose();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    MaterialLibrary.ensureUv2(geometry);
    geometry.name = `residential:${material?.userData?.family ?? 'wall'}`;
    merged.push({ geometry, material });
  }
  return merged;
}

export { TILE, STOREY, SETBACK };
