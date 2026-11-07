// District Deck V3.40 — the four detached houses, rebuilt from scratch.
//
// Governing spec: docs/next-phase/V340-RESIDENTIAL-HOUSES-FROM-SCRATCH-SPEC.md
// Module contract: ./CONTRACT.md — read that before editing anything in this directory.
//
// This lane replaces Lane B of the V3.20 residential kit. `../federation.js` is stashed at
// `../_stash/federation-v330-stashed.js`, unregistered and unread.
//
// What is deliberately NOT inherited from `../core.js`, and why it matters:
//
//   `palette()`   carried hard colour pins keyed on these four archetype ids.
//   `makeContext()` carried a `routedMaterial` table that reassigned a part's material by
//                 matching its geometry NAME against regular expressions, and a `push` filter
//                 that silently discarded any geometry named `gutter-grime-*`,
//                 `villa-terracotta-course-*` or `californian-roughcast-aggregate-*`.
//
// New geometry colliding with those names would have been repainted or deleted without a
// warning. This lane builds its own context and its own palette. The only things taken from
// `../core.js` are the pure primitives and the deterministic hash, which are engine, not model.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE, STOREY, SETBACK } from '../../../core/grid.js';
import { MaterialLibrary } from '../../materials.js';
import { variation } from '../core.js';
import { housePalette } from './house-surfaces.js';

import buildCalifornian from './bungalow-californian.js';
import buildBrighton from './bungalow-brighton.js';
import buildVilla from './heritage-federation-villa.js';
import buildCottage from './cottage-federation.js';

/** archetypeId → builder. The set this lane owns, and nothing else. */
const BUILDERS = Object.freeze({
  'bungalow-californian': buildCalifornian,
  'bungalow-brighton': buildBrighton,
  'heritage-federation-villa': buildVilla,
  'cottage-federation': buildCottage,
});

export const HOUSE_ARCHETYPES = Object.freeze(new Set(Object.keys(BUILDERS)));

/** Nine, and there is no tenth. See CONTRACT.md §4. */
export const HOUSE_BUCKET_CAP = 9;

/**
 * Lot posture per archetype.
 *
 * `widthF` and `depthF` are fractions of the lot, and they are larger here than the stashed
 * lane's numbers on purpose. In every Monopoly-Plus reference plate the building occupies about
 * four fifths of the tile and the garden is the margin around it; the baseline plates put a
 * small house in the middle of a large empty plate, which loses the blind pair before a critic
 * has looked at a single detail.
 */
/**
 * `ridgeY` is an ABSOLUTE authored target, not a derived expression.
 *
 * It used to be `floorY + wallH + bodyD * 0.5 * (ridgeF - 1) + wallH * 0.28`, and the KIT seat
 * caught what that produced: 7.62 m on the Californian against a 13.5 m width, when one gable
 * over its 10.8 m depth at 26° would already put the ridge at 6.6 m. §7 asks for a Californian
 * whose width reads as *clearly* greater than its height to the ridge, and neither number
 * delivered it. A derived height that nobody has checked is worse than an authored one, because
 * it looks principled.
 *
 * Authored so the four sit where they should against their own widths:
 *
 *   Californian 13.5 / 5.50 = 2.45   broadest of the four, which is the archetype
 *   Brighton    12.0 / 6.40 = 1.88   compact and upright against it
 *   villa       13.5 / 7.15 = 1.88   tall and generous, and the tower goes above this
 *   cottage     11.4 / 5.20 = 2.19   small, and not a shrunken villa
 */
const ENVELOPE = Object.freeze({
  // Broad and low. The width must read as clearly greater than the height to the ridge, and a
  // builder that roofs the whole footprint in one span will not get there — break the plan into
  // wings and let `roofIntersection` solve the valleys.
  'bungalow-californian': {
    widthF: 0.90, depthF: 0.72, frontSetback: 0.16, floorY: 0.62, wallH: 2.85, ridgeY: 5.50,
  },
  // More compact and more upright than the Californian — the difference must be legible.
  'bungalow-brighton': {
    widthF: 0.80, depthF: 0.74, frontSetback: 0.18, floorY: 0.58, wallH: 2.95, ridgeY: 6.40,
  },
  // The grandest of the four: tall, generous, and it breaks into a tower above this ridge.
  //
  // `widthF` came down from 0.90 after two seats hit the same conflict independently and one of
  // them breached the plate with it. At 0.90 the façade-3 jitter takes `bodyW` to 13.824, and
  // half of that plus KIT's 0.58 villa overhang lands the eave at x 7.492 against a plate edge at
  // 7.500 — an 8 mm margin, and the probe measured the assembled f3 build at 15.2 wide on a 15.0
  // tile. At 0.86 the same façade lands the eave at 7.185, with 0.315 of margin.
  //
  // The general rule the two seats between them established, and which the other three entries
  // are now checked against: **`lotW · widthF · 1.024 / 2 + overhang + 0.30 ≤ 7.50`.** The 0.30 is
  // the chamfer, and geometry that crosses it is off the board tile.
  'heritage-federation-villa': {
    widthF: 0.86, depthF: 0.76, frontSetback: 0.15, floorY: 0.70, wallH: 3.25, ridgeY: 7.15,
  },
  // The smallest and plainest. It must not read as a shrunken villa.
  'cottage-federation': {
    widthF: 0.76, depthF: 0.70, frontSetback: 0.22, floorY: 0.52, wallH: 2.70, ridgeY: 5.20,
  },
});

/**
 * Assemble one of the four houses, or return null so the caller falls through.
 *
 * @param {string} archetypeId
 * @param {MaterialLibrary} materials
 * @param {{districtId?: string|null, quality?: string, facade?: number}} opts
 */
export function assembleHouse(archetypeId, materials, opts = {}) {
  const builder = BUILDERS[archetypeId];
  if (!builder) return null;

  const quality = opts.quality ?? 'high';
  const districtId = opts.districtId ?? null;
  const facade = Math.max(0, Math.min(3, opts.facade | 0));
  const spec = ENVELOPE[archetypeId];

  const v = variation(`v340|${archetypeId}|${districtId ?? ''}|f${facade}`);

  const lotW = TILE - SETBACK * 2;
  const lotD = TILE - SETBACK * 2;
  // A small per-façade jitter so four parcels of one archetype are four houses rather than one
  // house four times. Deliberately small: the façade's real variation is colour and ornament.
  const bodyW = lotW * spec.widthF * (1 + (facade - 1.5) * 0.016);
  const bodyD = lotD * spec.depthF * (1 + ((facade * 2) % 3 - 1) * 0.018);
  const frontZ = lotD / 2 - lotD * spec.frontSetback;

  const env = Object.freeze({
    lotW, lotD, bodyW, bodyD,
    frontZ, backZ: frontZ - bodyD,
    // The kerb line, and it is INSIDE the plate.
    //
    // The stashed lane put this at `lotD / 2 + 0.6`, which is 0.6 units beyond the plate's own
    // street edge — so a footpath built on it floats off the tile with nothing under it. The
    // GARDEN seat found it, could not use it, and built its street band inside the plate
    // instead. Rather than leave a value in `env` that every future seat has to discover is
    // wrong, the kerb now sits where the kerb actually is: 0.6 in from the street edge, with the
    // footpath between it and the boundary.
    kerbZ: lotD / 2 - 0.6,
    floorY: spec.floorY,
    wallH: spec.wallH,
    ridgeY: spec.ridgeY,
    facade,
    districtId,
    storeyH: STOREY,
  });

  const p = housePalette(materials, { id: archetypeId, districtId, facade, v });

  const parts = [];
  const ctx = {
    id: archetypeId,
    env,
    p,
    v,
    q: quality,
    detail: quality === 'high',
    mid: quality !== 'low',
    parts,
    push(geometry, material) {
      if (!geometry || !material) return 0;
      parts.push({ geometry, material });
      return 1;
    },
    add(produced) {
      if (!produced) return 0;
      let n = 0;
      for (const part of produced) {
        if (!part?.geometry || !part.material) continue;
        parts.push({ geometry: part.geometry, material: part.material });
        n += 1;
      }
      return n;
    },
  };

  builder(ctx);
  if (!parts.length) return null;

  const merged = mergeByMaterial(parts);
  if (merged.length > HOUSE_BUCKET_CAP) {
    // Not fatal — the board still draws — but it is a spec breach and a failed round. A tenth
    // bucket costs the board 43 additional draw submissions per batch key.
    console.warn(
      `[houses] ${archetypeId} reached ${merged.length} material buckets (cap ${HOUSE_BUCKET_CAP}). `
      + 'Reuse a bucket rather than minting one.',
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
    ? new THREE.Vector3(bodyW, env.wallH + 2.6, bodyD)
    : bounds.getSize(new THREE.Vector3());

  // THE FRAMING BOX — the building without its lot, published rather than inferred.
  //
  // `residential-lab.js` frames its plates on a building-only box, and builds that box by
  // excluding lot geometry by GEOMETRY NAME PREFIX — `lot-`, `fence-`, `tree-`, `hedge-` and so
  // on. Its own comment anticipates this lane exactly: "a lane that renames its parts should lose
  // the tighter crop, never the plate."
  //
  // That is what happened. This lane merges by material, so a finished model carries nine
  // geometries named `houses:trim`, `houses:garden` and so on, not one geometry per component —
  // no prefix matches, the filter excludes nothing, and every station has been framing the whole
  // 15 x 15 tile with the building as a fraction of it. Measured cost: `blind-pair.mjs` refused
  // to build the cottage's front pair and every street pair outright, because our subject came
  // out at 2.79–2.91 aspect against the reference's 1.71–1.97. A wide shallow band against a
  // squarer tile is a presentation tell before it is anything else.
  //
  // Name-based exclusion cannot be repaired from this side without either splitting merged
  // geometry — which would take the part count past the nine the board's instancing budget
  // allows — or renaming buckets to impersonate the old lane's component names, which is worse
  // than the bug. So the lane publishes the box instead, and it can be exact because the lane
  // authored the envelope in the first place.
  //
  // Lateral and depth extents come from `env` plus a margin that covers the deepest eave in the
  // lane (the Californian's 0.95) and the deepest verandah projection. Height is measured off
  // the real geometry rather than authored, because chimneys, finials and tower cones all stand
  // above `ridgeY` by amounts only the archetype knows.
  const EAVE_MARGIN = 1.15;
  const FRONT_MARGIN = 1.90;
  const frameBox = new THREE.Box3(
    new THREE.Vector3(-bodyW / 2 - EAVE_MARGIN, 0, env.backZ - EAVE_MARGIN),
    new THREE.Vector3(
      bodyW / 2 + EAVE_MARGIN,
      bounds.isEmpty() ? env.ridgeY : Math.max(env.ridgeY, bounds.max.y),
      env.frontZ + FRONT_MARGIN,
    ),
  );

  return {
    ...(ctx.i2 ? { i2: ctx.i2 } : {}),
    parts: merged,
    size,
    frameBox,
    source: 'houses-kit',
    fallback: false,
    kit: true,
    archetypeId,
    form: 'residential',
  };
}

/**
 * One geometry per material, so the board sees the same shape of model the other kits hand it.
 */
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
      for (const name of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'uv', ...(material.userData.i2Role ? ['color'] : [])].includes(name)) g.deleteAttribute(name);
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
    geometry.name = `houses:${material?.userData?.family ?? 'wall'}`;
    merged.push({ geometry, material });
  }
  return merged;
}

export { TILE, STOREY, SETBACK };
