// District Deck V3.70 — commercial kit dispatcher (lane L4).
//
// Same contract as `residential/index.js` and `industrial/index.js`: `building-kit.js` calls
// `assembleCommercial()` before its own legacy path, and an unregistered archetype returns null
// and falls through to the legacy kit untouched.
//
// Lane ownership (V370-AAA-PROGRAMME-SPEC §4) — one file per subject:
//
//   office.js         office-lowrise, tower-office
//   corner-shop.js    shop-corner, shoptop-mixed
//   apartment-low.js  apartment-low
//   apartments.js     apartment-mid, apartment-midrise, apartment-permit
//   apartment-kit.js  the shared half of the succession ladder
//   core.js           shared primitives, deterministic variation, the nine-bucket palette
//   surfaces.js       the nine buckets
//
// `apartment-*` belonged to `residential/contemporary.js` in the legacy kit. Registering a
// builder HERE is how this lane takes ownership; `contemporary.js` is never edited to hand it
// over, because `building-kit.js` checks residential first and the fall-through order is
// deliberate. `residential/index.js` no longer lists these four in `RESIDENTIAL_BUILDERS`
// only if the orchestrator removes them — see `r1-builder.md` for the one shared-file edit
// this lane needs, and until it lands the apartment rungs still resolve residential-first.
//
// `apartment-tower` is NOT registered. It is the ceiling of the ladder and V370 §4/L4 names
// six subjects plus two stretch ones; taking the tower without building it would drop it onto
// a kit that has no builder for it.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE, STOREY, SETBACK } from '../../core/grid.js';
import { variation } from '../residential/core.js';
import { METRICS } from './core.js';
import { commercialPalette } from './surfaces.js';
import { OFFICE_BUILDERS } from './office.js';
import { SHOP_BUILDERS } from './corner-shop.js';
import { SHOP_VARIANT_BUILDERS, applyShopIdentitySign } from './corner-shop-variants.js';
import { APARTMENT_LOW_BUILDERS } from './apartment-low.js';
import { APARTMENT_BUILDERS } from './apartments.js';
import { RETAIL_SHED_BUILDERS, HAMMERBARN_ENVELOPE } from './hammerbarn.js';
// V3.41 MP9 lanes B and J — grain yard and petrol station get models of their own.
import { GRAIN_YARD_BUILDERS } from './grain-yard.js';
import { PETROL_STATION_BUILDERS } from './petrol-station.js';
import { mirrorModelX, isHanded, normaliseHand } from './mirror.js';
import { SHOPFRONT_ROW_IDS, assembleShopfrontRow } from './shopfront-row.js';

/**
 * archetypeId → builder(ctx).
 *
 * @type {Readonly<Record<string, (ctx: any) => any>>}
 */
export const COMMERCIAL_BUILDERS = Object.freeze({
  ...OFFICE_BUILDERS,
  ...SHOP_BUILDERS,
  ...SHOP_VARIANT_BUILDERS,
  ...APARTMENT_LOW_BUILDERS,
  ...APARTMENT_BUILDERS,
  ...RETAIL_SHED_BUILDERS,
  // V3.41 MP9 lanes B and J. Last, so `grain-plot` resolves to its own lane file rather than to
  // the Hammerbarn entry that aliases it in `RETAIL_SHED_BUILDERS`.
  ...GRAIN_YARD_BUILDERS,
  ...PETROL_STATION_BUILDERS,
});

export const COMMERCIAL_BUCKET_CAP = 9;

/**
 * PARKED — built, gradeable, and NOT proposed for promotion. The r1 critic asked this lane to
 * decide `tower-office` rather than leave it hanging, and the decision is to park it.
 *
 * Three reasons, in order of weight:
 *
 * 1. It is not one of this lane's subjects. §4/L4 names "office building, corner shop, low-rise
 *    apartment, other apartments". `tower-office` was built on leftover budget in r1 and marked
 *    "do not promote" by its own builder — the one r1 self-assessment the critic said survived
 *    contact.
 * 2. Its r3 plate is the weakest object in the lane. Three blank elevations (fixed this round)
 *    over a lot that is a lawn strip and two beds, and a massing argument that is `office-lowrise`
 *    stretched to eight storeys rather than a tower. The second half of that is not a finish
 *    problem and is not fixable in a palette pass.
 * 3. Promotion is the specific harm the r1 critic found: four L4 ids, this one among them, were
 *    reachable on the live seed-0 board without passing a gate. A promotion gate now blocks that,
 *    and this lane should not be the session that asks for an exception.
 *
 * Parked does not mean abandoned. It stays registered so the lab can render it and a critic can
 * grade it; what it must not do is appear in any id list this lane hands the orchestrator for
 * `V370_KIT_IDS`. `PROMOTION_CANDIDATES` below is that list, and the probe asserts the two do
 * not overlap.
 */
export const V370_PARKED = Object.freeze(['tower-office']);

/**
 * The ids this lane would put in front of a promotion gate, in the order it would ship them.
 * Not a promotion — the gate is the orchestrator's, and three of these are still over §3.4.
 */
export const PROMOTION_CANDIDATES = Object.freeze([
  'shop-corner', 'office-lowrise', 'shoptop-mixed',
  'apartment-low', 'apartment-permit', 'apartment-midrise', 'apartment-mid',
]);

/**
 * The envelope table. Fractions of the LOT, never of the tile, so the setback lattice is
 * honoured and §3.6 ("the envelope stays on the pad") is a property of the table rather than of
 * each builder remembering.
 *
 * `footprint` is the authored parcel span in tiles. `board.js` passes `lotSpan` only for
 * industrial ids, so a commercial subject is built to its authored footprint exactly as the
 * legacy kit built it — see `r1-builder.md` for the shared-file change that would let the
 * office resize to a one-tile parcel the way the warehouse does.
 */
const ENVELOPE = Object.freeze({
  hammerbarn: HAMMERBARN_ENVELOPE,
  'grain-plot': HAMMERBARN_ENVELOPE,
  'office-lowrise': {
    footprint: [1, 2], widthF: 0.80, depthF: 0.60, frontSetback: 0.21,
    wallH: 11.65, storeys: 3, units: 1,
  },
  'tower-office': {
    footprint: [1, 2], widthF: 0.78, depthF: 0.52, frontSetback: 0.22,
    wallH: 26.8, storeys: 8, units: 1,
  },
  // §5.3.11 — TWO STOREYS. `wallH` is the head of the two-storey wall, not the shop's own, and
  // `storeys` now agrees with `content.js`, which has said 2 since the id was written. The render
  // envelope was the fourth record saying one storey while three said two.
  'shop-corner': {
    footprint: [1, 1], widthF: 0.78, depthF: 0.66, frontSetback: 0.14,
    wallH: 6.60, storeys: 2, units: 1,
  },
  'shoptop-mixed': {
    footprint: [1, 1], widthF: 0.76, depthF: 0.72, frontSetback: 0.12,
    wallH: 13.5, storeys: 4, units: 1,
  },
  // ── the three period corner shops ────────────────────────────────────────────────────────
  //
  // Owner instruction: three variants on the map. The plan aspects here are deliberately spread
  // — 0.80/0.70, 0.76/0.64, 0.84/0.60 — because §4 asks the subjects to be sortable in
  // silhouette alone and the lane probe's all-pairs test reads plan aspect as one of its three
  // axes. They are NOT three heights of one box: the Victorian is the deepest and tallest, the
  // deco the boxiest and the modern the widest and lowest, and each one's roofline does the rest.
  //
  // `wallH` is the wall head of the two-storey mass, not the subject's height — each builder
  // stands its own parapet, pediment, tower or roof above it, which is where the silhouette
  // separation is. It was the SHOP's head while these were single-storey; §5.3.11 changed that.
  'shop-corner-victorian': {
    footprint: [1, 1], widthF: 0.68, depthF: 0.72, frontSetback: 0.13,
    wallH: 7.75, storeys: 2, units: 1,
  },
  'shop-corner-deco': {
    footprint: [1, 1], widthF: 0.82, depthF: 0.56, frontSetback: 0.14,
    wallH: 7.60, storeys: 2, units: 1,
  },
  'shop-corner-modern': {
    footprint: [1, 1], widthF: 0.84, depthF: 0.60, frontSetback: 0.16,
    wallH: 7.20, storeys: 2, units: 1,
  },
  'medical-centre': {
    footprint: [1, 1], widthF: 0.82, depthF: 0.58, frontSetback: 0.17,
    wallH: 7.20, storeys: 2, units: 1,
  },
  'petrol-station': {
    footprint: [1, 1], widthF: 0.80, depthF: 0.34, frontSetback: 0.42,
    wallH: 4.40, storeys: 1, units: 1,
  },
  // The ladder. Height comes from `LADDER` in apartment-kit.js; these are the plan and the
  // setback, which are deliberately IDENTICAL across the four so the rungs stack on one street
  // frontage line rather than wandering back and forth as they grow.
  'apartment-low': {
    footprint: [1, 1], widthF: 0.74, depthF: 0.60, frontSetback: 0.205,
    wallH: 12.80, storeys: 4, units: 1,
  },
  'apartment-permit': {
    footprint: [1, 1], widthF: 0.74, depthF: 0.60, frontSetback: 0.205,
    wallH: 15.90, storeys: 5, units: 1,
  },
  'apartment-midrise': {
    footprint: [1, 1], widthF: 0.74, depthF: 0.60, frontSetback: 0.205,
    wallH: 22.05, storeys: 7, units: 1,
  },
  'apartment-mid': {
    footprint: [1, 1], widthF: 0.74, depthF: 0.60, frontSetback: 0.205,
    wallH: 25.28, storeys: 8, units: 1,
  },
});

/** Whether the commercial kit owns this archetype. */
export function ownsArchetype(archetypeId) {
  return typeof COMMERCIAL_BUILDERS[archetypeId] === 'function';
}

/**
 * Assemble a commercial model, or return null so the legacy kit runs.
 *
 * @param {string} archetypeId
 * @param {import('../materials.js').MaterialLibrary} materials
 * @param {{districtId?: string|null, quality?: string, facade?: number}} opts
 * @returns {{parts: Array<{geometry: any, material: any}>, size: any, source: string,
 *            fallback: boolean, kit: boolean, archetypeId: string, form: string} | null}
 */
export function assembleCommercial(archetypeId, materials, opts = {}) {
  const builder = COMMERCIAL_BUILDERS[archetypeId];
  const spec = ENVELOPE[archetypeId];
  if (!builder || !spec) return null;

  const quality = opts.quality ?? 'high';
  const districtId = opts.districtId ?? null;
  const facade = Math.max(0, Math.min(3, opts.facade | 0));

  // §3.3 — variation hashes off archetype | district | facade and NOTHING ELSE. No sim state
  // reaches this function, and nothing here writes anywhere.
  const v = variation(`v370|${archetypeId}|${districtId ?? ''}|f${facade}`);

  const span = opts.lotSpan;
  const tilesX = Math.max(1, span?.spanX ?? spec.footprint[0]);
  const tilesZ = Math.max(1, span?.spanZ ?? spec.footprint[1]);
  const lotW = tilesX * TILE - SETBACK * 2;
  const lotD = tilesZ * TILE - SETBACK * 2;
  // Façade jitter is bounded so the widest variant still clears the lot rim by a margin the
  // envelope probe checks. ±1.4 % on width, ±1.6 % on depth.
  const bodyW = lotW * spec.widthF * (1 + (facade - 1.5) * 0.014);
  const bodyD = lotD * spec.depthF * (1 + ((facade * 2) % 3 - 1) * 0.016);
  const frontZ = lotD / 2 - lotD * spec.frontSetback;

  const storeys = archetypeId === 'hammerbarn'
    ? Math.max(spec.storeys, Number(opts.storeys) || spec.storeys)
    : spec.storeys;

  const env = Object.freeze({
    archetypeId,
    lotW,
    lotD,
    bodyW,
    bodyD,
    frontZ,
    backZ: frontZ - bodyD,
    kerbZ: lotD / 2 - 0.62,
    floorY: 0,
    wallH: spec.wallH,
    ridgeY: spec.wallH + 2.4,
    facade,
    districtId,
    storeyH: STOREY,
    storeys,
    units: spec.units,
    footprint: [tilesX, tilesZ],
  });

  // P20 I2: the sheet owns appearance; ENVELOPE above still owns every dimension.
  if (SHOPFRONT_ROW_IDS.includes(archetypeId)) {
    return assembleShopfrontRow(materials, env, v, opts);
  }
  const p = commercialPalette(materials, { id: archetypeId, districtId, facade, v });
  const parts = [];
  const openings = [];
  const ctx = {
    id: archetypeId,
    env,
    p,
    v,
    signText: opts.signText ?? null,
    q: quality,
    detail: quality === 'high',
    mid: quality !== 'low',
    parts,
    openings,
    push(geometry, material) {
      if (!geometry || !material) return 0;
      parts.push({ geometry, material });
      return 1;
    },
    addOpening(opening) {
      if (opening?.parts?.length) openings.push(opening);
    },
    add(produced) {
      if (!produced) return 0;
      if (produced.parts && !produced.geometry) {
        const n = this.add(produced.parts);
        if (produced.opening) this.addOpening(produced.opening);
        if (Array.isArray(produced.openings)) {
          for (const o of produced.openings) this.addOpening(o);
        }
        return n;
      }
      let n = 0;
      const list = Array.isArray(produced) ? produced : [produced];
      for (const item of list) {
        if (!item?.geometry || !item.material) continue;
        parts.push({ geometry: item.geometry, material: item.material });
        n += 1;
      }
      return n;
    },
  };

  builder(ctx);
  if (
    opts.signText
    && ['shop-corner', 'shop-corner-victorian', 'shop-corner-deco', 'shop-corner-modern']
      .includes(archetypeId)
  ) {
    applyShopIdentitySign(ctx, { kind: 'venture', text: opts.signText });
  }
  if (!parts.length) return null;

  /* ── THE SECOND HAND ────────────────────────────────────────────────────────────────────
   *
   * The owner's instruction: "create a mirror image of each corner shop so its correctly
   * positioned on the corners." A corner shop is HANDED — the splay addresses the intersection,
   * the shopfront returns down one street, the dwelling side down the other — and every builder
   * in this lane authors the right hand (secondary street at local +X). Rotation cannot make the
   * other hand; only a reflection can. `mirror.js` carries the argument, the corner-to-hand rule
   * and the winding repair.
   *
   * `hand` arrives as an OPTION and defaults to the authored hand, so every existing caller —
   * the board, the lab, every instrument in `mvp/tests` — gets a byte-identical model to the one
   * it got before this existed. `handForParcel()` is exported for `board.js` to call; the edit
   * that lands it is written out in this round's report rather than made here, because
   * `board.js` is the orchestrator's file (CONTRACT.md rule 7).
   *
   * Gated on `isHanded`, so `shoptop-mixed` — which shares `shopGround()` and is NOT one of
   * `city.js`'s `CORNER_ONLY_IDS` — cannot be mirrored even if a caller asks for it.
   */
  const hand = normaliseHand(opts.hand);
  if (hand === 'left' && isHanded(archetypeId)) mirrorModelX(parts, openings);

  // ── §2.1, and this is the fix the r1 plates bought ─────────────────────────────────────
  //
  // "Every lot sits on a chamfered plinth with a dark bevelled edge. The miniature stands ON
  // something. A green rectangle laid flat on the terrain reads as a cutout and is an automatic 2."
  //
  // `boardPlinth` builds the tray DOWNWARD from y = 0, the way `residential/houses/garden.js`
  // does. On the board that is right — the lot is cut into the terrain. In the fidelity lab it
  // is invisible: the studio ground plane sits at y = 0 and buries the whole tray, which
  // `residential/modern/modern-garden.js` already records ("Lab studio ground sits at y = 0 and
  // wins the z-fight against the houses lawn"). The r1 `apartment-low` plate is the evidence:
  // a green lawn with a hairline of dark rim, exactly the cutout §2.1 scores 2 for.
  //
  // So the whole assembled model is lifted onto the tray's top face. r1 lifted it by the tray's
  // WHOLE depth, 0.66 m, and the r1 critic was right that this is a board defect rather than a
  // §2.1 improvement: it stands two thirds of a metre above L2's pavement datum and above every
  // flush Federation and terrace lot beside it. The lift is now `plateTop` — 0.10 m, L1's
  // number, for L1's reason (see `METRICS` in core.js). The tray's body is cut DOWN into the
  // terrain instead, so the object is still a tray and no longer a pedestal.
  //
  // Applied to opening pivots and picks as well as to geometry, because a hinge that stays at
  // the old datum swings a door through the ground.
  const LIFT = METRICS.plateTop;
  for (const item of parts) {
    item.geometry.translate(0, LIFT, 0);
    item.geometry.computeBoundingBox();
  }
  for (const opening of openings) {
    for (const item of opening.parts ?? []) {
      item.geometry.translate(0, LIFT, 0);
      item.geometry.computeBoundingBox();
      // Opening leaves never pass through `mergeByMaterial`, so they would reach a recess-aware
      // shader with the attribute unbound. WebGL defaults an unbound float attribute to 0 and
      // that is the value we want, but relying on a driver default for a visual result is the
      // shape of bug this programme keeps logging. Bind it explicitly.
      if (!item.geometry.attributes.ddRecess) {
        const n = item.geometry.attributes.position?.count ?? 0;
        if (n) {
          // r12 — a leaf keeps its INDEX, so a per-vertex array authored by `recessFaces()` maps
          // straight onto the attribute here; only the merge path has to expand it.
          const scalar = Number(item.geometry.userData?.ddRecess ?? 0) || 0;
          const per = item.geometry.userData?.ddRecessVerts ?? null;
          const data = per && per.length === n
            ? Float32Array.from(per, (v) => Math.max(scalar, v))
            : new Float32Array(n).fill(scalar);
          item.geometry.setAttribute('ddRecess', new THREE.BufferAttribute(data, 1));
        }
      }
    }
    if (opening.pivot) opening.pivot = { ...opening.pivot, y: opening.pivot.y + LIFT };
  }

  // MEASUREMENT HOOK, off by default and never taken by the board. Merging by material is what
  // makes a triangle census unattributable: afterwards there are nine geometries and no names,
  // so "where does this subject spend its budget" cannot be answered, and r1 answered it by
  // guessing at three levers. With `unmerged` the caller gets the parts as built, names intact,
  // and the probe's budget-attribution table reads them.
  //
  // IT RETURNS EARLY, ON PURPOSE. The r1 critic's `v370-l4-critic-budget.mjs` installs an ESM
  // load hook that injects itself immediately before the merge line below, matching it as a
  // string literal, and throws "transform is stale" if that line moves. Folding the hook into
  // that line broke the critic's instrument — caught by running it, which is the reason to run
  // somebody else's instrument after touching their anchor. (The anchor text is deliberately not
  // quoted anywhere in this comment: `String.replace` takes the FIRST match, and a comment that
  // quotes the anchor gets the injection instead of the code. That cost a second run to find.)
  // The merge line must stay byte-identical to what that transform expects.
  if (opts.unmerged) return { parts, openings, archetypeId, hand, unmerged: true };

  const merged = mergeByMaterial(parts);
  // Keep the split beside the original roof bucket: kit AO caches the first
  // vertex in each quantized position/normal cell. Moving roofs behind walls
  // changes those winners even though the surfaces themselves did not change.
  if (archetypeId === 'shop-corner-deco' && p.roofDeck) {
    const deckIndex = merged.findIndex(item => item.material === p.roofDeck);
    const roofIndex = merged.findIndex(item => item.material === p.roof);
    if (deckIndex >= 0 && roofIndex >= 0) {
      const [deck] = merged.splice(deckIndex, 1);
      merged.splice(merged.findIndex(item => item.material === p.roof) + 1, 0, deck);
    }
  }
  // Deco deliberately separates six roof members from its existing shared roof bucket.
  const dedicatedDecoRoof = archetypeId === 'shop-corner-deco'
    && merged.filter(item => item.material?.userData?.m15DecoRoofGrain).length === 1;
  const bucketCap = COMMERCIAL_BUCKET_CAP + (dedicatedDecoRoof ? 1 : 0);
  if (merged.length > bucketCap) {
    console.warn(
      `[commercial] ${archetypeId} reached ${merged.length} material buckets `
      + `(cap ${bucketCap}). Reuse a bucket instead of adding a material.`,
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
    ? new THREE.Vector3(bodyW, env.wallH + 2.4, bodyD)
    : bounds.getSize(new THREE.Vector3());

  // The frame the lab fits on: the building, not the lot, plus the projection its awnings,
  // canopies and balconies are allowed. Matches `residential/modern/index.js` so a plate of a
  // commercial subject composites against a residential one at the same subject scale.
  const EAVE_MARGIN = 0.95;
  const FRONT_MARGIN = 1.85;
  const frameBox = new THREE.Box3(
    new THREE.Vector3(-bodyW / 2 - EAVE_MARGIN, 0, env.backZ - EAVE_MARGIN),
    new THREE.Vector3(
      bodyW / 2 + EAVE_MARGIN,
      bounds.isEmpty() ? env.ridgeY : Math.max(env.ridgeY, bounds.max.y),
      env.frontZ + FRONT_MARGIN,
    ),
  );

  return {
    parts: merged,
    openings,
    size,
    frameBox,
    source: 'commercial-kit',
    fallback: false,
    kit: true,
    archetypeId,
    hand,
    form: archetypeId.startsWith('apartment') ? 'residential' : 'commercial',
  };
}

/**
 * One geometry per material. Mirrors `building-kit.js`'s own merge so the two kits present the
 * board with the same shape of model. The attribute pruning is load-bearing: `mergeGeometries`
 * returns null — silently — if one input carries an attribute the others do not.
 */
function mergeByMaterial(parts) {
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
      const idx = raw.index ? Array.from(raw.index.array) : null;
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
      // ── r10: `ddRecess` SURVIVES THE MERGE ──────────────────────────────────────────────
      //
      // §5.3's emissive floor has to reach a jamb without a tenth material (§3.2 caps the
      // building at nine buckets and this lane is at nine) and without a triangle. It rides a
      // per-vertex attribute instead, and the attribute is set HERE, after the prune, for two
      // reasons: the prune above would otherwise delete it, and `mergeGeometries` returns null
      // — silently — if one input carries an attribute the others do not, so every geometry in
      // every bucket gets one whether it is tagged or not. An untagged member carries 0.0 and
      // its pixel is bit-identical to r9.
      // ── r12: AND IT SURVIVES PER FACE ─────────────────────────────────────────────────
      //
      // `recessFaces()` writes a per-vertex array against the geometry AS AUTHORED, which is
      // indexed. `toNonIndexed()` above expands 24 vertices to 36 in the index's own order, so
      // the array is expanded through that index rather than copied — copying it would silently
      // tag the wrong faces, which is worse than not tagging them. The index is read off `raw`
      // before the conversion disposes it.
      const recess = Number(raw.userData?.ddRecess ?? g.userData?.ddRecess ?? 0) || 0;
      const vcount = g.attributes.position.count;
      const perVert = raw.userData?.ddRecessVerts ?? null;
      let filled = null;
      if (perVert) {
        if (idx) {
          filled = new Float32Array(idx.length);
          for (let i = 0; i < idx.length; i += 1) filled[i] = Math.max(recess, perVert[idx[i]] ?? 0);
        } else if (perVert.length === vcount) {
          filled = Float32Array.from(perVert, (v) => Math.max(recess, v));
        }
        if (filled && filled.length !== vcount) filled = null;
      }
      g.setAttribute('ddRecess', new THREE.BufferAttribute(
        filled ?? new Float32Array(vcount).fill(recess), 1,
      ));
      prepared.push(g);
    }
    const geometry = prepared.length === 1 ? prepared[0] : mergeGeometries(prepared, false);
    if (!geometry) {
      for (let i = 1; i < prepared.length; i += 1) prepared[i].dispose();
      if (prepared[0]) {
        prepared[0].computeBoundingBox();
        prepared[0].computeBoundingSphere();
        merged.push({ geometry: prepared[0], material });
      }
      continue;
    }
    if (prepared.length > 1) for (const g of prepared) g.dispose();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.name = `commercial:${material?.userData?.family ?? 'wall'}`;
    merged.push({ geometry, material });
  }
  return merged;
}

/**
 * Handedness, re-exported so a caller needs one import from this lane. `handForParcel` is a pure
 * read of `tx` / `tz` / `rotation` off a parcel record — §3.3, downstream of the sim, writes
 * nothing.
 */
export { handForParcel, HANDED_IDS, isHanded } from './mirror.js';

export { TILE, STOREY, SETBACK };
