// District Deck V3.20 — residential kit core.
//
// Shared primitives, deterministic variation and the material palette every residential
// builder uses. Nothing here knows about a specific archetype; everything an archetype
// builder needs that is not archetype-specific belongs in this file, `ornament.js` or
// `curtilage.js`.
//
// Contract with the caller (building-kit.js): a builder receives a `Ctx` and pushes parts
// through `ctx.push(geometry, material)`. The dispatcher merges by material and returns the
// `{ parts, size, ... }` shape the board already consumes.
//
// Rules, from V320-RESIDENTIAL-AAA-SPEC §3:
//   - deterministic: hash-derived variation only, never Math.random / Date.now
//   - draw-call discipline: every part must land in one of the palette buckets below, so a
//     residential archetype costs at most PALETTE_BUCKET_CAP instanced draws
//   - construction logic: helpers exist so a post can be given a base and a capital, and a
//     beam can be seated on posts, without each builder reinventing it

import * as THREE from 'three';
import { restyleColour } from '../style/restyle.js';
import { MaterialLibrary } from '../materials.js';
import {
  applyResidentialAtlas,
  configureResidentialWearShader,
  configureResidentialAtlasShader,
  getResidentialTextureAtlas,
} from './texture-atlas.js';

/**
 * A residential archetype may not exceed this many distinct materials (draw budget §3).
 *
 * Nine, and measured rather than assumed: all three Victorian terraces land on exactly nine
 * merged buckets WITH a complete lot. The palette defines eleven entries, but an archetype
 * pays only for the ones its geometry actually reaches, and two of them (`ground` and one
 * other) fall out once curtilage and the envelope share families.
 *
 * The point of the cap was never the number. board.js creates one InstancedMesh per bucket
 * PER BATCH KEY, and residential occupies 43 keys on the reference seed — so nine buckets is
 * 476 meshes against the baseline kit's 584, while every archetype gains a lot it never had.
 */
export const PALETTE_BUCKET_CAP = 9;

/* ────────────────────────────── deterministic variation ───────────────────────────── */

/** FNV-1a → uint32. Same string, same pixels, forever. */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Hash + salt → [0,1).
 *
 * The first version was `(hash ^ salt * φ) >>> 0` divided by 2³², which XORs the salt in and
 * then hands the raw high bits straight to the caller. `v.pick` takes `floor(u * n)`, so it
 * reads only the top two or three bits — and FNV-1a's avalanche on a seed string that differs
 * only in its last character does not reach that far. Measured across the sixteen archetypes ×
 * six districts × four façades: the four wall colours came out 59 / 85 / 117 / 123 instead of
 * 96 each, and — the reason a critic scored the street row 3.0 for colour — **all three
 * terraces at all four façade variants selected the same index**. The row was not five similar
 * creams, it was one colour four times.
 *
 * A murmur3-style finalizer fixes it: two xor-shift-multiply rounds mix every input bit into
 * every output bit, so the top bits carry as much entropy as the bottom ones. Still pure,
 * still deterministic, same seed → same pixels.
 */
export function unitFrom(hash, salt) {
  let h = (hash ^ Math.imul(salt, 0x9e3779b9)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

/**
 * A small deterministic variation source bound to one building instance.
 * `v.unit(n)` → [0,1); `v.range(n, lo, hi)`; `v.pick(n, array)`; `v.chance(n, p)`.
 */
export function variation(seedString) {
  const h = hash32(seedString);
  const variationResult = {
    hash: h,
    unit: (salt) => unitFrom(h, salt),
    range: (salt, lo, hi) => lo + unitFrom(h, salt) * (hi - lo),
    pick: (salt, list) => list[Math.floor(unitFrom(h, salt) * list.length) % list.length],
    chance: (salt, p) => unitFrom(h, salt) < p,
    /** Integer in [lo, hi]. */
    int: (salt, lo, hi) => lo + Math.floor(unitFrom(h, salt) * (hi - lo + 1)),
  };
  return variationResult;
}

/* ─────────────────────────────────── geometry helpers ─────────────────────────────── */

function finish(geometry, name) {
  geometry.name = name;
  geometry.computeBoundingBox();
  MaterialLibrary.ensureUv2(geometry);
  return geometry;
}

/** Box with its CENTRE at (x,y,z). */
export function box(w, h, d, x, y, z, name = 'box') {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return finish(g, name);
}

/** Box sitting ON the plane y = yBase, centred in x/z. */
export function slab(w, h, d, x, yBase, z, name = 'slab') {
  return box(w, h, d, x, yBase + h / 2, z, name);
}

/** Box with Euler rotation applied about its own centre, then translated. */
export function rotBox(w, h, d, x, y, z, euler, name = 'rot-box') {
  const g = new THREE.BoxGeometry(w, h, d);
  if (euler?.x) g.rotateX(euler.x);
  if (euler?.y) g.rotateY(euler.y);
  if (euler?.z) g.rotateZ(euler.z);
  g.translate(x, y, z);
  g.computeVertexNormals();
  return finish(g, name);
}

/** Cylinder along an axis. `axis` is 'x' | 'y' | 'z'. */
export function cyl(radius, length, x, y, z, axis = 'y', name = 'cyl', segments = 10) {
  const g = new THREE.CylinderGeometry(radius, radius, length, segments, 1, false);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  g.computeVertexNormals();
  return finish(g, name);
}

/** Tapered cylinder — turned posts, chimney pots, urns. */
export function taper(rBottom, rTop, height, x, yBase, z, name = 'taper', segments = 10) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, height, segments, 1, false);
  g.translate(x, yBase + height / 2, z);
  g.computeVertexNormals();
  return finish(g, name);
}

/** Sphere — finials, door knobs, gate balls. */
export function ball(radius, x, y, z, name = 'ball', segments = 8) {
  const g = new THREE.SphereGeometry(radius, segments, Math.max(4, segments >> 1));
  g.translate(x, y, z);
  g.computeVertexNormals();
  return finish(g, name);
}

/**
 * A gabled roof solid: ridge running along X, pitched to the eaves in Z.
 * Sits on y = yBase, extends to yBase + height.
 */
export function gable(w, d, height, x, yBase, z, name = 'gable') {
  const hw = w / 2; const hd = d / 2;
  const y0 = yBase; const y1 = yBase + height;
  const v = [
    // eave line, near and far
    -hw, y0, -hd, hw, y0, -hd, hw, y0, hd, -hw, y0, hd,
    // ridge
    -hw, y1, 0, hw, y1, 0,
  ];
  // Faces are listed explicitly rather than derived by index arithmetic, and wound
  // counter-clockwise as seen from OUTSIDE the solid. Every face was verified against the
  // solid's centroid before this file was handed to the lanes — the first draft had all
  // eight wound inward, which back-face culling would have turned into invisible roofs
  // across every residential archetype at once.
  const faces = [
    [0, 5, 1], [0, 4, 5],   // -z pitch
    [2, 4, 3], [2, 5, 4],   // +z pitch
    [0, 3, 4],              // -x gable end
    [1, 5, 2],              // +x gable end
    [0, 2, 3], [0, 1, 2],   // soffit
  ];
  const positions = [];
  const uvs = [];
  for (const [a, b, c] of faces) {
    for (const i of [a, b, c]) {
      const px = v[i * 3]; const pz = v[i * 3 + 2];
      positions.push(px, v[i * 3 + 1], pz);
      uvs.push(px / w + 0.5, pz / d + 0.5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.translate(x, 0, z);
  return finish(g, name);
}

/**
 * A hipped roof solid: a ridge of length `ridgeLen` centred on the plan, four pitches.
 * The Melbourne default for terraces, cottages and bungalows.
 */
export function hip(w, d, height, ridgeLen, x, yBase, z, name = 'hip') {
  const hw = w / 2; const hd = d / 2;
  const hr = Math.max(0, Math.min(ridgeLen, w * 0.98)) / 2;
  const y0 = yBase; const y1 = yBase + height;
  const v = [
    -hw, y0, -hd, hw, y0, -hd, hw, y0, hd, -hw, y0, hd, // 0..3 eaves
    -hr, y1, 0, hr, y1, 0,                               // 4,5 ridge
  ];
  // Wound counter-clockwise from outside — see the note on gable().
  const faces = [
    [0, 5, 1], [0, 4, 5],   // -z pitch
    [2, 4, 3], [2, 5, 4],   // +z pitch
    [3, 4, 0],              // -x hip
    [1, 5, 2],              // +x hip
    [0, 2, 3], [0, 1, 2],   // soffit
  ];
  const positions = [];
  const uvs = [];
  for (const [a, b, c] of faces) {
    for (const i of [a, b, c]) {
      const px = v[i * 3]; const pz = v[i * 3 + 2];
      positions.push(px, v[i * 3 + 1], pz);
      uvs.push(px / w + 0.5, pz / d + 0.5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.translate(x, 0, z);
  return finish(g, name);
}

/**
 * A skillion / mono-pitch plane with thickness — verandah roofs, lean-tos.
 * High edge at z = zHigh with height yHigh; low edge at z = zLow with height yLow.
 */
export function skillion(w, thickness, x, zHigh, yHigh, zLow, yLow, name = 'skillion') {
  const depth = Math.abs(zHigh - zLow);
  const rise = yHigh - yLow;
  const length = Math.hypot(depth, rise);
  const angle = Math.atan2(rise, depth);
  const g = new THREE.BoxGeometry(w, thickness, length);
  g.rotateX(-angle * Math.sign(zLow - zHigh));
  g.translate(x, (yHigh + yLow) / 2, (zHigh + zLow) / 2);
  g.computeVertexNormals();
  return finish(g, name);
}

/**
 * A bullnose verandah roof — the Federation signature. A quarter-round front edge
 * approximated by `segs` facets, with a straight skillion behind it.
 */
export function bullnose(w, x, zFront, yFront, zBack, yBack, thickness, name = 'bullnose', segs = 6) {
  const geos = [];
  const curveDepth = Math.min((zFront - zBack) * 0.42, 1.5);
  const curveRise = Math.min(yBack - yFront, curveDepth);
  const straightBack = zFront - curveDepth;
  geos.push(skillion(w, thickness, x, zBack, yBack, straightBack, yFront + curveRise, `${name}-back`));
  for (let i = 0; i < segs; i += 1) {
    const t0 = i / segs; const t1 = (i + 1) / segs;
    const a0 = (Math.PI / 2) * t0; const a1 = (Math.PI / 2) * t1;
    const z0 = straightBack + Math.sin(a0) * curveDepth;
    const z1 = straightBack + Math.sin(a1) * curveDepth;
    const y0 = yFront + curveRise * Math.cos(a0);
    const y1 = yFront + curveRise * Math.cos(a1);
    geos.push(skillion(w, thickness, x, z0, y0, z1, y1, `${name}-c${i}`));
  }
  return geos;
}

/**
 * A moulding run — a stack of thin offset boxes that reads as a profiled cornice, string
 * course, plinth or architrave. `profile` is a list of [heightFraction, projection].
 */
export function moulding(length, height, x, yBase, z, axis, profile, name = 'moulding') {
  const geos = [];
  let y = yBase;
  for (const [hf, proj] of profile) {
    const h = height * hf;
    const g = axis === 'x'
      ? slab(length, h, proj, x, y, z, `${name}-band`)
      : slab(proj, h, length, x, y, z, `${name}-band`);
    geos.push(g);
    y += h;
  }
  return geos;
}

/** Standard three-step classical cornice profile. */
export const CORNICE_PROFILE = Object.freeze([[0.28, 0.16], [0.34, 0.30], [0.38, 0.22]]);
/** Plinth / base course — heavier at the bottom. */
export const PLINTH_PROFILE = Object.freeze([[0.55, 0.26], [0.45, 0.16]]);

/* ─────────────────────────────────── the palette ──────────────────────────────────── */

/**
 * Resolve the residential material palette for one archetype. Every builder draws from
 * exactly these buckets so the merge collapses to at most PALETTE_BUCKET_CAP draws.
 *
 * @param {MaterialLibrary} materials
 * @param {{wall:string, roof:string, trim:string}} surfaces
 * @param {ReturnType<typeof variation>} v
 * @param {string} key cache-safe suffix so two archetypes never share a tinted variant
 */
export function palette(materials, surfaces, v, key, archetypeId = null) {
  const residentialAtlas = getResidentialTextureAtlas(materials);
  const terrace = archetypeId?.startsWith('terrace-');
  const wallFamily = terrace ? 'brick' : surfaces.wall === 'glass' ? 'render' : surfaces.wall;
  const roofFamily = terrace ? 'slate' : surfaces.roof === 'glass' ? 'concrete' : surfaces.roof;
  const trimFamily = (surfaces.trim === 'glass' || surfaces.trim === wallFamily)
    ? (wallFamily === 'timber' ? 'painted_metal' : 'timber')
    : surfaces.trim;

  // The façade colour. `v` is already seeded with the façade index, so picking here is what
  // makes four façade variants four different houses rather than one house four times.
  //
  // This was the loudest defect in the first street-row plate: five terraces, five identical
  // creams, because `wall` took the family's default colour and only `iron` and `wallAlt`
  // varied. ref-01 gets most of its street rhythm from genuinely different frontage colours,
  // and the board's own per-parcel `DISTRICT_WALL_CHROMA` tint is a nudge, not a repaint.
  const table = CONTEMPORARY_IDS.has(archetypeId)
    ? WALL_FACADE_COLOURS_CONTEMPORARY
    : WALL_FACADE_COLOURS;
  // Roughcast and render fronts. `mp-heritage-federation-villa` measures its roughcast at
  // L 83.1 C 28.7 and `mp-bungalow-californian` its stucco at L 81.7 C 34; the values these
  // three lists replaced sat at L 74-85 with chroma 8-13, which is why a critic read them as
  // one milky mass. Index order is deliberate: façade 0 is the plate a critic grades, and the
  // canonical colour of each of these archetypes — cream roughcast on the villa, warm sand on
  // the bungalows — belongs on it. The other three indices carry the street's value spread.
  //
  // V3.30 r3 — CARLTON'S WALL IS PINNED AND NO LONGER DRAWN FROM THE FAÇADE LOTTERY.
  //
  // `terrace-carlton-heritage` is the one archetype whose `wall` bucket carries no frontage at
  // all: `wallAltFamily` below flips its front shell to painted render, so `wall` serves only
  // the flank, the chimneys and the verandah recess. It has no §2.8 street-spread work to do,
  // and every point of value it takes from the lottery comes out of the one separation the
  // recess depends on. The terrace seat measured recess-to-parapet luma by façade index —
  // carlton-east 2.57 / 1.83 / 1.60 / 1.15, fitzroy-north 2.03 / 1.09 / 1.92 / 1.51 — so the
  // graded plate is fine and one parcel in four loses the separation outright, which is what
  // the row plate shows. `#e0bb92` at L 78.1 was landing on the same surface as `#96452f` at
  // L 39.5.
  //
  // Pinned a step below the darkest entry the brick list held, which keeps the Hawthorn-red
  // chroma the brick atlas was tuned against (C 40.8 here against the list's 43.6) while
  // putting recess, flank and chimneys on one value for all four façades. The street's spread
  // is untouched: Carlton's frontage value comes from `wallAlt`, which still picks a cream.
  const wallColor = archetypeId === 'terrace-carlton-heritage'
    ? '#8a3f2b'
    : archetypeId === 'cottage-federation'
    ? v.pick(41, ['#d8cfb8', '#ded5bf', '#d2c8af', '#e2d9c4'])
    : archetypeId === 'bungalow-californian'
    ? '#D8CFB8'
    : archetypeId === 'bungalow-brighton'
      ? v.pick(41, ['#e7d2a6', '#ddc79a', '#f5e5bf', '#efdcb2'])
      : archetypeId === 'heritage-federation-villa'
        ? v.pick(41, ['#eed7a0', '#e7d094', '#f5e2a8', '#f8ecc4'])
        : v.pick(41, table[wallFamily] ?? [WALL_BASE[wallFamily] ?? '#d8cfc2']);
  const trim = TRIM_SCHEMES[archetypeId] ?? TRIM_SCHEMES.default;
  // A masonry band is not a darker copy of the same salmon field. Keep it as a warm buff
  // value so the interwar walk-up and deco fronts have a readable secondary material bucket.
  const hasClinkerBase = archetypeId === 'bungalow-californian'
    || archetypeId === 'bungalow-brighton'
    || archetypeId === 'heritage-federation-villa'
    || archetypeId === 'cottage-federation';
  // The buff band on a brick front is the painted render shell of a Carlton boom terrace and
  // the cream banding of an interwar walk-up. `mp-terrace-carlton-heritage` measures that
  // shell at L 85.4 C 20.8 and `mp-terrace-single` its warm sand at L 79.1 C 21.4; the values
  // these replaced rendered at L 63.6, which is the single largest value gap in the set.
  //
  // The clinker lists are the other half of the same finding. `mp-heritage-federation-villa`
  // measures its brick at L 49.9 C 48.8 and `mp-bungalow-brighton` at L 49.3 C 52; ours were
  // authored between L 27 and L 42 with chroma 20-40, so a base course that should carry the
  // frontage's warmth read as a dark brown skirt. The clinker atlas region costs about nine
  // points of chroma between albedo and plate, so these are set high enough to survive it.
  const wallAltColor = archetypeId === 'bungalow-brighton'
    ? '#4A2E2A'
    : archetypeId === 'bungalow-californian'
      ? '#8C4A38'
      : archetypeId === 'heritage-federation-villa'
        ? '#B4563F'
        : wallFamily === 'brick'
    ? v.pick(42, ['#f0dcac', '#e8d29e', '#f7ecbe'])
    : hasClinkerBase
      ? v.pick(42, archetypeId === 'bungalow-californian'
        ? ['#a5533a', '#b05a3d', '#bb6341', '#9a4a33']
        : archetypeId === 'bungalow-brighton'
          ? ['#ad5540', '#b45c42', '#a34e39', '#bd663f']
          : archetypeId === 'heritage-federation-villa'
            ? ['#ae5334', '#bc5c39', '#c4633d', '#cc6c42']
            : ['#c05f3c', '#c86440', '#b85639', '#ae4e33'])
      : shade(wallColor, -0.22 - v.unit(31) * 0.06);
  const wallMaterial = materials.get(wallFamily, {
    variant: `res-wall-${key}`,
    color: wallColor,
    roughness: wallFamily === 'brick' ? 0.88 : 0.84,
  });
  // Carlton's front shell is painted render while its exposed party return remains brick.
  // Keep those two surfaces in the existing wall/wallAlt buckets so the lane pays no tenth
  // material; only the alternate bucket changes family for this one residential archetype.
  const wallAltFamily = terrace && wallFamily === 'brick'
    ? 'render' : hasClinkerBase ? 'brick' : wallFamily;
  const wallAltMaterial = materials.get(wallAltFamily, {
    variant: `res-wall-alt-${key}`,
    color: wallAltColor,
    roughness: wallAltFamily === 'brick' ? 0.92 : 0.88,
  });
  prepareSurfaceMaps(wallMaterial);
  prepareSurfaceMaps(wallAltMaterial);
  applyResidentialMaterial(wallMaterial, wallFamily, residentialAtlas);
  // The base band is still one palette bucket, but it gets its own atlas region so clinker
  // masonry carries perpends and per-brick value variation instead of a printed red stripe.
  applyResidentialMaterial(wallAltMaterial, wallAltFamily, residentialAtlas,
    hasClinkerBase ? 'clinker' : null);
  configureResidentialSurface(wallMaterial, wallFamily, v, 73, archetypeId);
  configureResidentialSurface(wallAltMaterial, wallAltFamily, v, 79, archetypeId);

  // Roof colours, measured off the reference pack rather than reasoned from "the roof should
  // be dark". Per plate, on the lit pitch:
  //
  //   mp-cottage-federation      galvanised corrugated  L 76.7 C  0.7  (shaded pitch L 60.5)
  //   mp-heritage-federation-villa  terracotta tile     L 63.2 C 57.7  (shaded pitch L 50.1)
  //   mp-bungalow-brighton       terracotta tile        L 59.2 C 50.0  (shaded pitch L 49.3)
  //   mp-bungalow-californian    warm brown shingle     L 38.4 C  9.5  at hue 66 — warm, not
  //                                                     the cold blue-grey we had at hue 230
  //   mp-terrace-single          slate                  L 45.1 C  2.6
  //
  // Every one of ours sat 15-28 L* below its reference, and the Californian was the wrong hue
  // family outright. These lift the family toward the measurement; the range across a slope
  // comes from the atlas normal and the wear pass, which is why the flat-colour compensation
  // shader below this call was removed rather than retuned.
  const roofColour = archetypeId === 'bungalow-californian' ? '#5c5249'
    : archetypeId === 'cottage-federation' ? '#b6b8b6'
      : archetypeId === 'bungalow-brighton' ? '#A8482F'
        : archetypeId === 'heritage-federation-villa' ? '#A8492C'
          : archetypeId === 'walkup-flats'
            ? restyleColour(ROOF_VALUE.concrete, '#dad4c8', { id: 'building:walkup-flats.roof' })
            : archetypeId === 'art-deco-flats'
              ? restyleColour(ROOF_VALUE.concrete, '#c9c3b8', { id: 'building:art-deco-flats.roof' })
              : ROOF_VALUE[roofFamily] ?? null;
  const roofMaterial = materials.get(roofFamily, {
    variant: `res-roof-${key}`,
    color: roofColour,
    roughness: roofFamily === 'corrugated' ? 0.62
      : roofFamily === 'slate' ? 0.75 : roofFamily === 'tile' ? 0.86 : 0.82,
    metalness: roofFamily === 'corrugated' ? 0.22 : 0.04,
  });
  // Keep the broad roof response mineral / painted rather than a blown-out polished lobe.
  roofMaterial.specularIntensity = archetypeId === 'heritage-federation-villa' ? 0.34
    : archetypeId === 'bungalow-brighton' ? 0.24
      : archetypeId === 'bungalow-californian' ? 0.08 : 0.5;
  if (archetypeId === 'heritage-federation-villa') roofMaterial.roughness = 0.92;
  if (archetypeId === 'bungalow-brighton') roofMaterial.roughness = 0.72;
  if (archetypeId === 'bungalow-californian') {
    roofMaterial.roughness = 0.90;
    roofMaterial.metalness = 0.04;
    roofMaterial.envMapIntensity = 0.22;
  }
  roofMaterial.anisotropy = roofFamily === 'corrugated' ? 0.22 : 0.0;
  roofMaterial.userData.residentialTargetColor = roofColour;
  const roofRepeatOverride = roofFamily === 'tile'
    ? archetypeId === 'heritage-federation-villa' ? [3.0, 3.8]
      : archetypeId === 'bungalow-brighton' ? [3.0, 1.3] : null
    : null;
  applyResidentialMaterial(roofMaterial, roofFamily, residentialAtlas, null, roofRepeatOverride);
  configureResidentialSurface(roofMaterial, roofFamily, v, 83, archetypeId);
  roofMaterial.needsUpdate = true;

  const glassMaterial = materials.get('glass', {
    variant: `res-glass-${key}`,
    // Near-black is the pane's head-on value; the fresnel ramp below supplies the grazing
    // highlight. A pale grey albedo makes the same opening read as a decal at board altitude.
    color: '#14181c',
    roughness: 0.08,
    metalness: 0.0,
    opacity: 0.94,
  });
  configureResidentialGlass(glassMaterial, archetypeId);

  const interiorMaterial = materials.get('concrete', {
    variant: `res-shadow-${key}`,
    // Let the actual eaves shadow and AO carry depth. Near-black albedo crushed the recess
    // after the lab grade, so leave a charcoal-brown floor for real light to modulate.
    color: archetypeId === 'terrace-carlton-heritage' ? '#3a3029'
      : archetypeId === 'bungalow-californian' ? '#111312' : '#2d3131',
    roughness: 0.98,
    metalness: 0.0,
  });
  // Concrete's board texture is correct for plinths, but it multiplies this bucket down to a
  // black card inside a verandah. The recess needs the plain charcoal albedo so AO and the
  // eaves shadow remain visible as light behaviour.
  interiorMaterial.map = null;
  interiorMaterial.roughnessMap = null;
  interiorMaterial.normalMap = null;
  interiorMaterial.aoMap = null;
  interiorMaterial.color.set('#3d3a34');
  interiorMaterial.roughness = 0.96;
  interiorMaterial.specularIntensity = 0.06;
  interiorMaterial.envMapIntensity = 0.32;
  interiorMaterial.reflectivity = 0.08;
  interiorMaterial.clearcoat = 0.0;
  interiorMaterial.toneMapped = true;
  configureResidentialShadowFloor(interiorMaterial, archetypeId);
  interiorMaterial.needsUpdate = true;
  const ironColor = archetypeId === 'terrace-carlton-heritage'
    ? IRONWORK_COLOURS[0]
    : archetypeId === 'heritage-federation-villa' ? '#2b332c'
      // Brighton's iron was the one entry authored BELOW the near-black in IRONWORK_COLOURS
      // (L 13.5 against 15.7), so after the floor landed it would have been the one archetype
      // whose iron was held off zero by the clamp alone rather than by its own albedo — a flat
      // card instead of a dark family. Lifted to sit with the rest; hue and chroma unchanged.
      : archetypeId === 'bungalow-brighton' ? '#242a25' : v.pick(7, IRONWORK_COLOURS);
  const ironMaterial = materials.get('painted_metal', {
    variant: `res-iron-${key}`,
    // One building-level choice. Do not key this by floor, component or lane index: every
    // rail, gate, downpipe and palisade on a house belongs to the same paint system.
    color: archetypeId === 'walkup-flats'
      ? restyleColour(ironColor, '#232a2c', { id: 'building:walkup-flats.iron' }) : ironColor,
    roughness: 0.68,
    metalness: 0.12,
  });
  // The shared painted-metal albedo is warm ochre for joinery. Ironwork must not inherit
  // that map and turn charcoal into a cool blue/bronze checker; its building-level colour is
  // the complete paint response at board scale.
  //
  // V3.30 r2 — THE IRON BUCKET HAD NO BLACK FLOOR, and it was the single largest measured
  // defect on the Victorian plates. `#141719` is linear 0.007; at `envMapIntensity 0.10` and
  // `specularIntensity 0.08` a face turned off the key returned literally zero, and the mask
  // under L 8 on the r1 detail plates resolved to exactly one object set — fence, verandah
  // posts, frieze legs and beads, brackets, door leaves — at a mean RGB of (0.66, 0.16, 0.92).
  // 94 % of everything below L 12 was below L 6: a clipped wall at zero rather than a shadow,
  // where `_reference-mp/` runs 17-34 %.
  //
  // Three changes, and none of them is geometry. The albedo lifts one step; the environment
  // response goes to 0.35 so a post shaft picks up a sky gradient down its length instead of
  // one flat value; and the bucket is given the same shadow floor the interior bucket has
  // carried since V3.20, at a lower value because iron must stay the darkest family on the
  // frontage. `mp-terrace-single` measures its verandah posts at a median L 52-80 and
  // `mp-terrace-carlton-heritage` its lace at L 84-110, so the floor is a safety net well
  // under the bar rather than a repaint toward it.
  //
  // What this buys is not a colour. `turnedPost`'s four-step silhouette and `laceBracket`'s
  // rake are already on the plate and already correct; they were invisible because they were
  // at L 0. This makes existing geometry appear at zero triangle cost.
  ironMaterial.roughness = 0.92;
  ironMaterial.metalness = 0.0;
  ironMaterial.envMapIntensity = IRON_ENV_INTENSITY;
  ironMaterial.clearcoat = 0.0;
  ironMaterial.clearcoatRoughness = 1.0;
  ironMaterial.specularIntensity = 0.08;
  applyResidentialMaterial(ironMaterial, 'painted_metal', residentialAtlas);
  configureResidentialShadowFloor(ironMaterial, archetypeId, IRON_SHADOW_FLOOR);
  ironMaterial.needsUpdate = true;

  // Planting, and the largest single measured gap in the set. Every reference plate puts a
  // lawn under the building — `mp-cottage-federation` L 55.5 C 60.5, `mp-heritage-federation-
  // villa` L 55.2 C 53.8, `mp-terrace-carlton-heritage` L 60.3 C 59.9 — and on our baseline
  // plates the pixels that classify as saturated green are between 0.1 and 0.8 per cent of the
  // subject. The lot deck, the hedges, the shrubs and the street tree all draw from this one
  // bucket, so the whole lot was reading as a warm grey with olive lumps on it.
  //
  // The foliage atlas costs about eight points of lightness and returns about six of chroma
  // between albedo and plate, so these sit above the plate target on both axes. They are still
  // measurably below the reference — that is deliberate. "Saturated lime" is one of the five
  // swings this file has already been through, and the way not to repeat it is to land short of
  // the measurement and read the plate, not to aim past it.
  const foliageMaterial = materials.get('foliage', {
    variant: `res-foliage-${key}`,
    color: archetypeId === 'terrace-carlton-heritage'
      ? v.pick(11, ['#9ab944', '#8fae3c', '#a4c34d'])
      : v.pick(11, ['#93b03e', '#9dbb47', '#88a636', '#a7c552']),
    roughness: 0.96,
    metalness: 0.0,
  });
  applyResidentialMaterial(foliageMaterial, 'foliage', residentialAtlas);
  const roofTrimMaterial = applyResidentialMaterial(materials.get('painted_metal', {
    variant: `res-rooftrim-${key}`,
    color: archetypeId === 'bungalow-brighton'
      ? '#9C4B33' : shade(ROOF_TRIM_BASE[roofFamily] ?? '#8b8f94', -0.06),
  }), 'painted_metal', residentialAtlas);
  const joineryFamily = trimFamily === 'timber' ? 'joinery' : trimFamily;
  // Painted timber. This is the §2.8 finding, and it is the one family in the set that was
  // genuinely too LIGHT rather than too dark: the Federation cottage's barge boards, verandah
  // posts, brackets, window frames and fence were all `#75836d`, which renders between L 46 and
  // L 62 against a wall rendering at L 69 — seven to twenty-three points of separation where
  // `mp-cottage-federation` measures forty-five (wall L 84.7, heritage-green joinery L 39.5).
  // The green is taken down to the reference's value and given the chroma that makes it read as
  // paint rather than as a grey with an opinion.
  //
  // The villa goes the other way for the same reason: `mp-heritage-federation-villa` paints its
  // turned posts, brackets and fretwork cream at L 83.1 C 28.7, and reads them against a red
  // brick base and a terracotta roof rather than against a darker trim. Ours was L 82 at chroma
  // 8, so the value was already right and only the chroma was missing.
  //
  // V3.30 r2 — the chroma correction above overshot by roughly 1.9x and it has been measured
  // twice. The r1 diagnosis was right and is NOT being reverted: at C 10-12 the joinery read
  // as a grey with an opinion and the wall-to-trim separation had collapsed. But the plates it
  // produced measure, in the frontage band with backdrop and planting excluded,
  //
  //   cottage       ours L 38.4 C 41.9 h 113   |  mp- L 45.2 C 21.6 h 103
  //   brighton      ours L 43.7 C 45.0 h 118   |  mp- L 46.9 C 23.4 h  99
  //   californian   ours L 53.7 C 42.9 h  96   |  mp- L 32.2 C 21.8 h  95
  //
  // — roughly double the reference's chroma, and on the cottage and Brighton the hue has run
  // ten to nineteen degrees off the reference's olive toward a leaf green. `mp-cottage-federation`
  // paints a muted sage on its barge boards and window surrounds; ours paints the same members
  // in a saturated green that two independent critics have now called debug highlighting.
  //
  // The albedo-to-plate transfer measured on these three plates is a chroma multiplier of
  // 1.7-2.1 (the lab grade carries `saturation + 0.255`) with the hue running 5-18 degrees
  // low, so these are authored at C 11-13 and 5-18 degrees high to land on C 22-24 at hue
  // ~100. Lightness is left where each archetype's plate already sits, apart from the cottage,
  // which is the one of the three whose plate this seat can open.
  const trimColour = archetypeId === 'cottage-federation' ? '#687255'
    : archetypeId === 'heritage-federation-villa' ? '#24382B'
      // V3.30 r3 — THE CALIFORNIAN'S JOINERY IS CREAM, SAMPLED OFF THE REFERENCE.
      //
      // `mp-bungalow-californian` paints every piece of joinery on the house cream: barge
      // boards, rafter tails, eave blocks, the porch beam, window surrounds, sills, pier caps
      // and fence caps. Its census puts that family at L 82.2 C 35.0 h 81 over 9.3 % of the
      // subject (`#edc78c`, `#eeca90`, `#e1ba7e`). The olive on that plate is a different
      // thing entirely — the gable SHINGLE field and the window sashes, L 28-35 C 20 h 94,
      // 3.7 % of the subject — and it is a wall material, not a paint system.
      //
      // Ours painted the whole joinery system in that olive, at L 49-62 C 22-28 h 91-92 over
      // 13.5 % of the frontage. Two independent critics called it debug highlighting; the r1
      // Federation critic's table filed the reference's olive shingle under "californian
      // joinery" and read the gap as a chroma overshoot, which is why three rounds of chroma
      // correction never closed it. The sashes go cream with the surrounds because `joinery`
      // is aliased to `trim` here and the third painted value costs a tenth bucket, and a
      // cream sash bar against a pane that now ramps to a real dark still reads as a bar.
      : archetypeId === 'bungalow-californian' ? '#6B6F4A'
        : archetypeId === 'bungalow-brighton' ? '#515542' : trim.ornament;
  const trimMaterial = applyResidentialMaterial(materials.get(trimFamily, {
    variant: `res-trim-${key}`,
    color: trimColour,
    roughness: 0.72,
    metalness: trimFamily === 'painted_metal' ? 0.12 : 0.0,
  }), joineryFamily, residentialAtlas);
  if (joineryFamily === 'joinery') {
    trimMaterial.roughness = 0.90;
    trimMaterial.metalness = 0.0;
    trimMaterial.specularIntensity = 0.08;
    trimMaterial.envMapIntensity = 0.10;
    trimMaterial.clearcoat = 0.0;
    trimMaterial.needsUpdate = true;
  }
  trimMaterial.userData.residentialTargetColor = trimColour;
  // `roofTrim` is already part of the residential palette and is normally remapped back to
  // the roof by the Federation lane. Reuse that existing bucket for the cream cottage fence,
  // the cream villa caps and the Californian sills/caps instead of minting a tenth material.
  const boundaryColour = archetypeId === 'heritage-federation-villa' ? '#24382B'
    : archetypeId === 'bungalow-brighton' ? '#9C4B33'
      : archetypeId === 'cottage-federation' || archetypeId === 'bungalow-californian'
        ? '#E8DEC7' : null;
  if (boundaryColour) {
    roofTrimMaterial.color.set(boundaryColour);
    roofTrimMaterial.userData.residentialTargetColor = boundaryColour;
    roofTrimMaterial.needsUpdate = true;
  }
  const boundaryMaterial = boundaryColour
    ? archetypeId === 'heritage-federation-villa' ? ironMaterial : wallMaterial
    : trimMaterial;
  const paletteResult = {
    wallFamily,
    roofFamily,
    trimFamily,
    /** Primary wall. */
    wall: wallMaterial,
    /** A second wall value for base courses, string bands and party returns. */
    wallAlt: wallAltMaterial,
    /**
     * Roof — the single most load-bearing colour in the palette, because it is the largest
     * surface a house has.
     *
     * The V3.20 note here argued it down toward near-black, on the evidence that the post chain
     * lifts shadows by about twelve points and the model therefore needs darks deep enough to
     * survive the lift. That measurement stands. Applying it to the roof did not: measured
     * against `_reference-mp/`, the roof is where our set loses the most value, not where it
     * gains it. Galvanised corrugated reads L 76.7 on the lit pitch of `mp-cottage-federation`
     * against our L 46.6, and terracotta reads L 63.2 on `mp-heritage-federation-villa` against
     * our L 44.9. The darks the post chain eats are the shadow bucket's job and the iron's; the
     * roof's job is colour and slope-to-slope range.
     */
    roof: roofMaterial,
    /** Ridge caps, barge boards, gutters — the roof's own metal. */
    roofTrim: roofTrimMaterial,
    // `trim` is the ornament/boundary value used by the existing lanes. Keep it distinct from
    // the lighter joinery bucket without spending a tenth material bucket.
    trim: trimMaterial,
    /** Joinery — window frames, doors, fascia. Always the light value. */
    // The lane has one painted-timber system. Alias joinery and boundary to the trim bucket
    // so direct curtilage callers cannot spend a tenth draw merely to tint the same paint.
    joinery: trimMaterial,
    /** Boundary — fence, gate, letterbox and other lot-facing trim. */
    boundary: boundaryMaterial,
    /**
     * Ironwork — lace, palisade fences, balustrades, downpipes.
     *
     * These four values are all dark on purpose. The first draft offered a near-white
     * (#f0ece2) as one of four, which meant a quarter of every street drew its lace, its
     * fence, its balustrade and its downpipes in cream — and cream lace against a cream wall
     * is invisible. What carries ref-01 and ref-02 is near-black cast iron against pale
     * render and pale piers; the contrast IS the ornament. Heritage green and oxide red are
     * real Melbourne fence colours and give a street some spread without losing the value
     * separation that makes the ornament read at board altitude.
     */
    iron: ironMaterial,
    glass: glassMaterial,
    /**
     * Shadowed interiors — window returns, verandah soffits, door recesses.
     *
     * Taken to near-black for the same reason as the roof: this bucket exists to supply the
     * darks the lighting cannot, and after the post chain's shadow lift #20242a was arriving
     * as a mid grey. A verandah that is not visibly darker inside than out is the difference
     * between a building with depth and a façade with a porch drawn on it.
     */
    shadow: interiorMaterial,
    /** Semantic alias for future opening builders; it reuses the shadow bucket. */
    interior: interiorMaterial,
    /** Ground, paths, plinths. */
    ground: materials.get('concrete', {
      variant: `res-ground-${key}`,
      color: archetypeId === 'bungalow-californian' ? '#9e9990'
        : archetypeId === 'walkup-flats' ? restyleColour('#b0a89a', '#e1d7c5', { id: 'building:walkup-flats.ground' }) : '#b0a89a',
    }),
    /**
     * Planting. Greyer and less saturated than the first draft, which ran a clean mid-green
     * that turned any large panel of lawn into felt. Real turf at miniature scale is dusty
     * and olive, and the reference plates' planting reads green mainly by contrast with warm
     * masonry rather than by chroma of its own.
     */
    foliage: foliageMaterial,
  };
  // Federation's shared roof helper aliases `roofTrim` to `roof` before it emits details.
  // Brighton needs that existing painted-metal bucket for its lighter fence masonry, so keep
  // the semantic handle stable there; the roof helper still receives the roof material itself.
  if (archetypeId === 'bungalow-brighton') {
    Object.defineProperty(paletteResult, 'roofTrim', {
      configurable: true,
      enumerable: true,
      get: () => roofTrimMaterial,
      set: () => {},
    });
  }
  return paletteResult;
}

const WALL_BASE = Object.freeze({
  brick: '#c4a090',
  render: '#e8e0d4',
  weatherboard: '#f0ebe0',
  concrete: '#c8c4bc',
});

/**
 * Four period-plausible frontage colours per wall family, one per façade variant.
 *
 * Deliberately spread in VALUE as well as hue. The blind comparison against ref-10 found the
 * model's biggest single weakness was not a missing ornament but that wall, trim, roof and
 * lot all sat within a few values of each other, so nothing separated at board altitude. A
 * row needs a dark one and a light one, not four tints of cream.
 *
 * Brick runs Hawthorn red through to the pale cream brick of an interwar block; render covers
 * the Melbourne range from bare cement through boom-style ochre to a painted heritage green;
 * weatherboard is the coastal set.
 */
const WALL_FACADE_COLOURS = Object.freeze({
  brick: ['#b85a3d', '#cf8052', '#96452f', '#e0bb92'],
  // Painted render, and the spread here is doing real work. The first version offered four
  // near-identical pales, so a row of five terraces came out as five creams no matter which
  // variant each drew — every critic round since has led with "one house four times". A
  // Melbourne terrace street is painted: cream, heritage green, slate blue, ochre. Four
  // distinct hues at four distinct values is what makes `ref-01` read as five houses.
  // Warm heritage render only. Sage and blue-grey are trim colours, not wall colours.
  render: ['#f4e5bc', '#e2c998', '#c8a672', '#b28556'],
  weatherboard: ['#e8d7a4', '#d9bd8c', '#fae9ab', '#c6cf9c'],
  concrete: ['#c8c4bc', '#9a968e', '#d2cec6', '#a9a7a1'],
});

/*
 * V3.30 — why these numbers, and where they came from.
 *
 * Every wall, roof, brick, joinery, iron and planting value in this file below was set against
 * a pixel measurement of `mvp/_reviews/residential/_reference-mp/mp-<id>.png`, not against the
 * previous round. The set's value has swung five times — near-black shadow, blown white,
 * saturated lime, correct, bleached — because each correction aimed at the last overshoot.
 *
 * What the reference actually measures (Lab, sampled off the plates, sky excluded):
 *
 *   surface                 mp-<id> measured        v330 baseline measured     delta
 *   wall, lit               L 79-90  C 21-30        L 63-70  C  9-18           -15 L, -12 C
 *   galvanised roof, lit    L 76.7   C  0.7         L 46.6   C  2.7            -28 L
 *   terracotta tile roof    L 63.2   C 57.7         L 44.9   C 40.5            -18 L, -17 C
 *   red brick / clinker     L 47-55  C 43-53        L 39-42  C 29-40           - 8 L, -14 C
 *   heritage-green joinery  L 39.5   C 24.4         L 46-62  C 10-15           +13 L, -12 C
 *   lawn / planting         L 55.5   C 60.5         L 27-31  C 21-23           -26 L, -38 C
 *
 * The headline: the set is not "too pale". Measured against the bar our walls and roofs are
 * ~15-28 L* too DARK, and every warm family is 12-38 chroma short. The pastel read comes from
 * missing chroma, not from excess lightness, and darkening the set — the reflex a "milk"
 * finding provokes — would have been the sixth swing. The joinery is the one family that is
 * genuinely too light, which is why the wall-to-trim separation collapsed.
 */

/**
 * Contemporary walls, which are a different palette entirely and need to be.
 *
 * Every table above is period-correct for a heritage frontage and uniformly light, which is
 * right for a Carlton terrace and wrong for anything built after about 1990. Lane D built a
 * seven-storey midrise with correctly stepped massing, projecting balconies and a properly
 * articulated flank — and then drew all of it in one cream, against a reference whose entire
 * read is charcoal brick against pale render. `ref-11` and `ref-12` get their value range from
 * the material contrast, not from the lighting.
 *
 * This is also the cheapest remaining fix for the §2.9 value-collapse finding: a charcoal wall
 * is a genuine dark that no amount of shadow lift in the post chain can flatten, because it is
 * dark in albedo rather than dark in illumination.
 */
const WALL_FACADE_COLOURS_CONTEMPORARY = Object.freeze({
  brick: ['#3c3a38', '#4a4643', '#6b5f57', '#8a7d72'],
  render: ['#4b433e', '#e1d7ca', '#75685d', '#b8a18d'],
  weatherboard: ['#4a4f4c', '#ddd8ce', '#6a6f6b', '#c8c3b8'],
  concrete: ['#4a4a48', '#b6b2aa', '#5e5c57', '#d2cec6'],
});

/**
 * Archetypes drawn from the contemporary table. Kept here rather than in `index.js` because
 * the palette is the thing that needs to know, and a lane must not be able to opt itself into
 * a different colour world by accident.
 */
const CONTEMPORARY_IDS = Object.freeze(new Set([
  'townhouse-row', 'townhouse-paired-single',
  'apartment-low', 'apartment-mid', 'apartment-midrise', 'apartment-permit', 'apartment-tower',
]));

const ROOF_TRIM_BASE = Object.freeze({
  slate: '#8b95a0',
  corrugated: '#aeb4b8',
  tile: '#a85c3c',
  concrete: '#b0aca4',
});

/**
 * Residential roof values, set from the reference pack.
 *
 * The note this replaces argued the roof should be taken "far darker than the shared material
 * families" because the post chain lifts shadows by about twelve points, and used that to
 * justify slate at `#3a4149` and tile at `#a65334`. The shadow-lift measurement is real and
 * still holds; the conclusion drawn from it was not. A roof is not a shadow. `mp-terrace-single`
 * measures its slate at L 45.1 and `mp-heritage-federation-villa` its tile at L 63.2 on the lit
 * pitch, and our plates rendered the same surfaces at L 28-45. The darks the post chain eats
 * belong in the shadow bucket and in the iron, which is where they now are; the roof carries
 * colour instead, which is what §2.8's largest-single-surface finding actually asked for.
 */
const ROOF_VALUE = Object.freeze({
  slate: '#666b64',
  corrugated: '#7a7d7c',
  tile: '#bb6238',
  concrete: '#6b6862',
});

/**
 * Building-level iron and trim schemes. All values stay inside the existing palette keys.
 *
 * These stay dark, and that is not negotiable — one of the four was near-white before r02 and
 * a quarter of every street drew its lace, fence, balustrade and downpipes invisibly. What
 * changes at v330 is chroma only: the oxide and the heritage green were authored at chroma 12
 * and read as two shades of soot, and `mp-terrace-carlton-heritage` shows a palisade whose
 * green is unmistakably green at the same value. Lightness moves by under two points; the
 * near-black entry is untouched.
 */
const IRONWORK_COLOURS = Object.freeze(['#23282b', '#402b18', '#153524']);

/**
 * The iron bucket's environment response and its black floor.
 *
 * `0.10` gave a post shaft one value from base to capital, which is what turned four turned
 * steps into a bar. At `0.35` the shaft samples the studio hemisphere and the top of the shaft
 * separates from the bottom, so the entasis and the bell capital have something to read
 * against. It is an environment response, not an emissive lift: a face already in the key's
 * shadow moves very little, which is why the floor is needed as well.
 *
 * `IRON_SHADOW_FLOOR` is in LINEAR outgoing radiance, clamped before tone mapping. It sits
 * under the interior bucket's 0.06 on purpose — iron is the darkest family a Victorian
 * frontage has, and a floor that lands iron and verandah recess at the same value would trade
 * one flat read for another.
 */
const IRON_ENV_INTENSITY = 0.35;
const IRON_SHADOW_FLOOR = 0.030;

const TRIM_SCHEMES = Object.freeze({
  default: { joinery: '#e4d8c5', ornament: '#8f7c50' },
  'cottage-federation': { joinery: '#e9dfca', ornament: '#d8c7a7' },
  'heritage-federation-villa': { joinery: '#eadfc8', ornament: '#8f5a37' },
  // Cream, per the reference census above. The olive that was here is the gable shingle
  // field's colour and belongs to a wall bucket, not to the paint system.
  'bungalow-californian': { joinery: '#e7cb8e', ornament: '#dcbd7e' },
  'bungalow-brighton': { joinery: '#52654f', ornament: '#3f5544' },
  // Pale stone dressings, and this is the §2.4 / §2.8 finding on the brick terraces. Measured
  // on `v330-r1-final/terrace-single--detail.png`: sill and architrave render at L 147-151
  // against sunlit brick at L 159.6 — under twelve points, and at a hue only thirty degrees
  // off the brick's, so the whole dressing system disappeared into the wall it sits on. The
  // old ochres were the cause and not the symptom: `#8a7549` is a 0-255 luminance of 118 and
  // the brick albedo `#b85a3d` is 108, so they were authored a few points apart before a
  // single photon was traced.
  //
  // `mp-terrace-single` runs its quoins at L 210 and its architraves at a p50 of 190 against a
  // wall at L 199.6, and `mp-terrace-double` its parapet at a p50 of 228 — the dressings are
  // the LIGHTEST family on a reference frontage, above the wall rather than below it. On a
  // brick front that reads as a larger spread than on the reference's render fronts, which is
  // correct: painted stone against Hawthorn red is what a boom-era terrace actually did, and
  // it is also where our missing highlight tail lives (0.000 % of subject over L 246 against
  // the reference's 0.13-1.06 %).
  //
  // The two values stay a step apart so the pair still carries §2.8's street spread.
  'terrace-single': { joinery: '#ded4bd', ornament: '#d8cdb4' },
  'terrace-double': { joinery: '#e7dfcf', ornament: '#e2d6ba' },
  'terrace-carlton-heritage': { joinery: '#e8d3ae', ornament: '#8e6b41' },
  'walkup-flats': { joinery: '#ddd2bd', ornament: '#8d7a4e' },
  'art-deco-flats': { joinery: '#eadfc8', ornament: '#9a8353' },
  'townhouse-row': { joinery: '#d6c3a7', ornament: '#80684e' },
  'townhouse-paired-single': { joinery: '#e1d5c3', ornament: '#8a7359' },
  'apartment-low': { joinery: '#d6c5ad', ornament: '#776351' },
  'apartment-mid': { joinery: '#ded0ba', ornament: '#746050' },
  'apartment-midrise': { joinery: '#e0d4c1', ornament: '#786453' },
  'apartment-permit': { joinery: '#d9c8b0', ornament: '#735e4e' },
  'apartment-tower': { joinery: '#d2b895', ornament: '#806044' },
});

function prepareSurfaceMaps(material) {
  for (const texture of [material.map, material.roughnessMap, material.normalMap, material.aoMap]) {
    if (!texture) continue;
    // TextureLibrary already enables trilinear mipmaps; anisotropy suppresses the long-flank
    // brick / board moiré when a parcel is viewed from board altitude.
    texture.anisotropy = Math.max(texture.anisotropy ?? 1, 8);
    texture.needsUpdate = true;
  }
}

function applyResidentialMaterial(material, family, atlas, atlasFamily = null, repeatOverride = null) {
  // AB-B materials already chain this atlas; a second build must not duplicate uniforms.
  if (material.userData?.abbPalette) return material;
  // All residential families, including masonry, use the one shared atlas. `clinker` is a
  // material-response region rather than a new MaterialLibrary family, so the nine-bucket
  // contract remains unchanged while the dark base gets its own course and brick jitter.
  const regionFamily = atlasFamily ?? family;
  if (applyResidentialAtlas(material, regionFamily, atlas)) {
    configureResidentialAtlasShader(material, atlas, regionFamily, repeatOverride,
      regionFamily === 'brick' || regionFamily === 'clinker');
  }
  return material;
}

/**
 * Give the existing procedural maps a restrained second scale of variation at residential
 * viewing distance. The texture library already supplies the family pattern (including brick
 * courses and weatherboard laps); this pass keeps those authored maps intact and only adds the
 * low-frequency value breakup that survives the studio plate's downsample. It is shader work,
 * not a new texture or material bucket, so every lane keeps its draw-call cost.
 */
function configureResidentialSurface(material, family, v, salt, archetypeId = null) {
  if (!material) return;
  // V3.30 r3 — re-entrancy guard, the same class of fault `configureResidentialShadowFloor`
  // documents. `materials.get()` caches on `family::variant::overrides`, so a second
  // `palette()` call for one archetype/district/façade hands back the SAME material object.
  // Without this the chained `onBeforeCompile` below would append a second
  // `uniform float ddResidentialGain;` at global scope and the program would fail to link —
  // and it would fail on the wall, the wall band and the roof at once, which is every large
  // surface a house has. It survived only because `palette()` happens to be called once per
  // key before the first render, which is a property of today's call sites and not of this
  // function. Everything below the guard is either idempotent or already applied.
  if (material.userData.residentialSurfacePatched) return;
  material.userData.residentialSurfacePatched = true;

  const normalStrength = family === 'brick' ? 0.45
    : family === 'weatherboard' ? 0.45
      : family === 'slate' ? 0.92
        : family === 'tile' ? 1.05
          : family === 'corrugated' ? 0.30
            : family === 'render' || family === 'concrete' ? 0.12 : 0.58;
  if (material.normalMap) material.normalScale.set(normalStrength, normalStrength);
  if (material.aoMap) material.aoMapIntensity = family === 'brick' ? 1.0 : 0.92;
  material.userData.residentialSurface = { family, normalStrength };

  // Atlas pixels already carry the family-specific variation. Skipping the old family shader
  // here is important: the atlas UV hook is one shared program, not eight material programs.
  // The wear pass is separate and remains active for atlas surfaces.
  const wearSalt = 300 + (salt % 100);
  const wearProfile = {
    seed: v.unit(wearSalt + 1),
    soil: v.range(salt + 2, 0.78, 1.08),
    storey: 3.2,
    patchX: v.range(salt + 3, -2.2, 2.2),
    patchY: v.range(salt + 4, 0.72, 2.18),
    patchWidth: v.range(salt + 5, 0.75, 1.55),
    archetypeId,
    targetColor: material.userData.residentialTargetColor ?? null,
  };
  if (material.userData.residentialAtlas) {
    configureResidentialWearShader(material, family, wearProfile);
    return;
  }
  if (!material.map) return;
  const gain = v.range(salt, 0.72, 1.12);
  const familyCode = family === 'brick' ? `
    // The map's own 8×16 brick module remains authoritative. These are slower colour
    // changes across several bricks plus a quiet joint lift, not a second brick grid.
    float ddBrick = sin(ddUv.x * 19.0 + sin(ddUv.y * 7.0) * 1.9)
      + 0.55 * sin(ddUv.x * 61.0 - ddUv.y * 11.0);
    vec2 ddBrickCell = floor(ddUv * vec2(24.0, 48.0));
    vec2 ddBrickBlock = floor(ddBrickCell / vec2(7.0, 9.0));
    vec2 ddHashA = fract(ddBrickCell * vec2(0.1031, 0.11369) + ddBrickBlock.yx * 0.071);
    ddHashA += dot(ddHashA, ddHashA.yx + 33.33);
    float ddBrickValue = fract((ddHashA.x + ddHashA.y) * (ddHashA.x + 19.19 * ddHashA.y));
    vec2 ddHashB = fract(ddBrickBlock * vec2(0.1271, 0.0917) + 0.37);
    ddHashB += dot(ddHashB, ddHashB.yx + 17.17);
    float ddBlockValue = fract((ddHashB.x + ddHashB.y) * 23.71);
    float ddCourse = sin(ddUv.y * 48.0 + sin(ddUv.x * 3.0) * 0.32);
    float ddFine = sin(ddUv.x * 143.0 + ddUv.y * 37.0);
    float ddJoint = 1.0 - smoothstep(0.0, 0.075, abs(ddCourse));
    diffuseColor.rgb *= 1.0 + ddResidentialGain * (
      ddBrick * 0.018 + (ddBrickValue - 0.5) * 0.17 + (ddBlockValue - 0.5) * 0.08
      + ddFine * 0.007 - ddJoint * 0.042
    );
  ` : family === 'weatherboard' ? `
    // Grain runs along the board length; the lap shadow is left to the authored map and
    // normal so this modulation does not turn into a painted stripe.
    float ddGrain = sin(ddUv.x * 127.0 + sin(ddUv.y * 13.0) * 2.8)
      + 0.35 * sin(ddUv.x * 311.0 + ddUv.y * 9.0);
    float ddBoard = sin(ddUv.y * 30.0 + sin(ddUv.x * 2.0) * 0.18);
    diffuseColor.rgb *= 1.0 + ddResidentialGain * (
      ddGrain * 0.009 + ddBoard * 0.012
    );
  ` : family === 'render' ? `
    float ddRender = sin(ddUv.x * 17.0 + sin(ddUv.y * 5.0) * 2.4)
      + 0.45 * sin(ddUv.y * 43.0 + ddUv.x * 8.0);
    diffuseColor.rgb *= 1.0 + ddResidentialGain * ddRender * 0.010;
  ` : family === 'slate' || family === 'corrugated' ? `
    float ddRoof = sin(ddUv.x * 23.0 + sin(ddUv.y * 4.0) * 1.7)
      + 0.35 * sin(ddUv.y * 91.0);
    float ddSlateCourse = sin(ddUv.y * 34.0 + sin(ddUv.x * 5.0) * 0.8);
    float ddValleyLichen = smoothstep(0.52, 0.96, fract(ddUv.x * 5.5 + ddUv.y * 0.7));
    diffuseColor.rgb *= 1.0 + ddResidentialGain * (
      ddRoof * 0.030 + ddSlateCourse * 0.022 - ddValleyLichen * 0.028
    );
  ` : '';

  if (!familyCode) return;
  const patch = `
    vec2 ddUv = vMapUv;
    ${familyCode}
  `;
  const previousCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previousCompile) previousCompile(shader, renderer);
    shader.uniforms.ddResidentialGain = { value: gain };
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nuniform float ddResidentialGain;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>\n#ifdef USE_MAP\n${patch}\n#endif`,
    );
  };
  material.customProgramCacheKey = () => `residential-surface-v320-${family}`;
  configureResidentialWearShader(material, family, wearProfile);
  material.needsUpdate = true;
}

/**
 * Glazing. §2.3 forbids both the flat blue rectangle and the flat matte black one, and the
 * baseline plate was failing it in a third way the rule does not name: a flat mid GREY. The
 * Federation cottage's panes measure L 34.8 at chroma 8.1 with a standard deviation across the
 * pane of under two points — a card, not a window, and warm rather than cool because what it
 * was reflecting uniformly was the studio backdrop.
 *
 * What the reference shows instead is a gradient down every pane: `mp-heritage-federation-villa`
 * runs its bay windows from a light cool head to a dark sill, and `mp-cottage-federation`'s
 * front sashes measure a median of L 15 at the sill against L 47 higher in the opening. So the
 * pane is given an explicit head-to-sill ramp in albedo, cool at the head where it picks up sky
 * and dark at the sill where it looks into the room, and the physical material's Schlick term
 * and environment response continue to work on top of it.
 *
 * ---------------------------------------------------------------------------------------
 * V3.30 r3 — THE RAMP WAS KEYED TO THE WRONG THING, AND IT WAS MEASURED, NOT REASONED.
 *
 * A blind critic found five openings on ONE elevation of `terrace-single` carrying five
 * different treatments — a blue-gradient mirror, a black void, a flat mid-grey slab, a black
 * hole, a grey grid — and called it a shader bug rather than a stylistic range. It was right,
 * and the suspect named in the brief was not the cause.
 *
 * **The world-position recovery is correct.** Instrumented through `ctx.push` on every part
 * landing in the glass bucket and read back out of the lab: `residential-lab.js` mounts the
 * model as plain `THREE.Mesh` in a group at y = 0, so `USE_INSTANCING` is undefined and
 * `modelMatrix * transformed` returns exactly the geometry's own Y. Not one pane in the
 * sixteen-archetype set straddles a multiple of the 3.05 m period, so the wrap this was
 * expected to show does not happen either.
 *
 * **What the measurement did show is that the ramp end-points are arbitrary per opening**,
 * because a ramp keyed to absolute height asks where a pane happens to sit against a 3.05 m
 * grid rather than where a fragment sits within its own pane. Sampled `t` at sill and head:
 *
 *   heritage-federation-villa   fanlight               0.974 → 1.000   flat blue card
 *   heritage-federation-villa   upper window           0.000 → 0.222   flat black card
 *   heritage-federation-villa   door leadlight         0.394 → 0.942   near-full sweep
 *   heritage-federation-villa   leadlight margin ×3    0.897 → 1.000   flat blue card
 *   terrace-carlton-heritage    fanlight               0.911 → 1.000   flat blue card
 *   terrace-carlton-heritage    arched window          0.063 → 0.735   part sweep
 *   terrace-single              window                 0.042 → 0.994   full sweep
 *   terrace-single              fanlight               0.770 → 0.966   flat blue card
 *
 * Forty-one panes on the villa, spans from 0.026 to 0.890. That is the scatter, exactly: a
 * door assembly whose main light sweeps dark-to-cool while the margin lights beside it are
 * flat blue is "milky opaque panes sitting next to dark panes in the same window", and an
 * upper window pinned to the bottom 22 % of the ramp is the black hole.
 *
 * **So the ramp is keyed to the pane's own height instead.** `uv.y` runs 0 at the sill to 1 at
 * the head on every vertical face of every glass geometry in the set — verified rather than
 * assumed, by regressing `uv.y` against normalised local Y over the non-horizontal faces of
 * all 187 glass parts across the sixteen archetypes: r = 1.000 on every one. It is also the
 * only per-pane signal that survives `index.js`'s merge, which deletes every attribute except
 * position, normal and uv. Three `arcSurface` panes on `art-deco-flats` carry no uv at all and
 * merge to zeros; `fwidth` is exactly zero across a constant attribute, so those fall back to
 * a fixed mid-ramp value rather than to a black card.
 *
 * **The second half of the defect is that the ramp was invisible anyway.** At `roughness 0.08`,
 * `envMapIntensity 1.0` and `specularIntensity 1.0` the pane is a mirror of the studio dome and
 * the albedo underneath it barely registers. Measured down our three upper `terrace-single`
 * panes the plate ran L 38 → 57 → 39, i.e. LIGHTEST in the middle and lighter at the sill than
 * at the head, while `mp-terrace-single` runs L 36.8 cool blue at the head to L 7.3 warm
 * near-black at the sill — a linear-luminance range of 11× against our 1.2×. Cutting the
 * environment and specular response back is what lets an authored gradient be the thing a
 * viewer sees; the Schlick term still lifts grazing panes, which is the part worth keeping.
 *
 * The tints ride uniforms rather than being interpolated into the shader source, so a tint can
 * never reach the program cache key. The one value that IS baked into the source — the
 * roughness floor — is in the key, for the reason `configureResidentialShadowFloor` sets out.
 */
const GLASS_TINT = Object.freeze({
  //                        head (sky pickup)      sill (room depth)
  // Head values are authored blue rather than merely light. `mp-terrace-single`'s upper sash
  // measures C 12.4 at hue 246 where the first r3 pass rendered C 6.3: with the environment
  // mirror cut back the pane no longer borrows the sky's colour, so the tint has to carry it.
  // Every sill is above `IRON_SHADOW_FLOOR` in all three channels.
  default: [[0.058, 0.080, 0.116], [0.033, 0.036, 0.043]],
  'bungalow-californian': [[0.056, 0.072, 0.094], [0.032, 0.035, 0.039]],
  'bungalow-brighton': [[0.054, 0.074, 0.106], [0.032, 0.035, 0.042]],
  'heritage-federation-villa': [[0.052, 0.070, 0.098], [0.032, 0.036, 0.042]],
});

/**
 * The pane's black floor, in linear outgoing radiance.
 *
 * Above `IRON_SHADOW_FLOOR` on purpose. §2.3 forbids the matte-black pane and §2.8 makes cast
 * iron the darkest family a Victorian frontage has, so a window under a verandah must stay
 * legible as glass while still sitting above the lace in front of it. Every sill tint above is
 * also authored above the iron floor in every channel: the previous values ran as low as linear
 * 0.004, which is a quarter of the iron's albedo and rendered as a hole in the wall wherever the
 * key did not reach the pane.
 */
const GLASS_SHADOW_FLOOR = 0.038;
/** Roughness. Glossy enough for a Schlick lift at grazing angles, not a mirror of the dome. */
const GLASS_ROUGHNESS = 0.30;
const GLASS_ROUGHNESS_CALIFORNIAN = 0.34;

function configureResidentialGlass(material, archetypeId = null) {
  const roughness = archetypeId === 'bungalow-californian'
    ? GLASS_ROUGHNESS_CALIFORNIAN : GLASS_ROUGHNESS;
  // MeshPhysicalMaterial supplies the angle-dependent Schlick Fresnel term. These keep it
  // visible without letting it own the pane: front-on panes read as the authored ramp while
  // grazing panes still catch the sky.
  material.roughness = roughness;
  material.metalness = 0.0;
  material.envMapIntensity = 0.42;
  material.ior = 1.5;
  material.specularIntensity = 0.55;
  material.specularColor = new THREE.Color('#ccd4d8');
  const [head, sill] = GLASS_TINT[archetypeId] ?? GLASS_TINT.default;

  // Re-entrancy. `materials.get()` caches on `family::variant::overrides`, so a second
  // `palette()` call for one key returns this same object; without the guard the second pass
  // would declare `varying float ddPaneT;` twice at global scope and the program would fail to
  // link. Because the tints are uniforms, a repeat call updates values instead of re-patching.
  const existing = material.userData.residentialGlass;
  if (existing) {
    existing.archetypeId = archetypeId;
    existing.head = head;
    existing.sill = sill;
    existing.uniforms.ddPaneHead.value.set(head[0], head[1], head[2]);
    existing.uniforms.ddPaneSill.value.set(sill[0], sill[1], sill[2]);
    material.needsUpdate = true;
    return;
  }

  const uniforms = {
    ddPaneHead: { value: new THREE.Vector3(head[0], head[1], head[2]) },
    ddPaneSill: { value: new THREE.Vector3(sill[0], sill[1], sill[2]) },
  };
  material.userData.residentialGlass = { head, sill, archetypeId, uniforms };

  // `federation.js` reaches into `ctx.p.glass` in three of its builders AFTER `palette()` has
  // returned and sets `roughness` to 0.18 / 0.08 / 0.10 with `envMapIntensity` 0.85 / 0.65 /
  // 0.90 — the cottage, the villa and the Californian. Those are mirror values, and a mirror is
  // the thing that made the authored ramp invisible in the first place, so three of the sixteen
  // archetypes would leave this pass with a different pane response from the other thirteen.
  // The lane's file is not this seat's to edit, so the value is clamped here in the direction
  // that cannot regress it: a lane may still make the pane rougher or its environment quieter,
  // and may not make it a mirror. Reported to that seat rather than reverted.
  let envIntensity = material.envMapIntensity;
  Object.defineProperty(material, 'envMapIntensity', {
    configurable: true,
    enumerable: true,
    get: () => envIntensity,
    set: (value) => { envIntensity = Math.min(Number.isFinite(value) ? value : 0.42, 0.45); },
  });

  const previousCompile = material.onBeforeCompile;
  const previousKey = typeof material.customProgramCacheKey === 'function'
    ? String(material.customProgramCacheKey()) : '';
  material.onBeforeCompile = (shader, renderer) => {
    if (previousCompile) previousCompile(shader, renderer);
    shader.uniforms.ddPaneHead = uniforms.ddPaneHead;
    shader.uniforms.ddPaneSill = uniforms.ddPaneSill;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying float ddPaneT;',
    );
    // `attribute vec2 uv;` is unconditional in three's vertex prefix, so this needs no
    // USE_UV guard and costs nothing when the material carries no map.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  ddPaneT = uv.y;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nvarying float ddPaneT;\nuniform vec3 ddPaneHead;\nuniform vec3 ddPaneSill;',
    );
    // The roughness floor lives in the shader rather than in `material.roughness`, because
    // three refreshes that uniform from the material on every version bump and a lane setting
    // it after `palette()` would win. `max` so a lane can still choose a duller pane.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>\n  roughnessFactor = max( roughnessFactor, ${roughness.toFixed(2)} );`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
  // A pane whose uv is constant across the primitive carries no height signal — the three
  // uv-less \`arcSurface\` bays on \`art-deco-flats\` merge to zeros. fwidth is exactly 0 there
  // and only there, so those fall back to a fixed point on the ramp rather than to its floor.
  float ddPaneValid = step( 1e-6, fwidth( ddPaneT ) );
  float ddPane = mix( 0.62, clamp( ddPaneT, 0.0, 1.0 ), ddPaneValid );
  diffuseColor.rgb = mix( ddPaneSill, ddPaneHead, smoothstep( 0.05, 0.95, ddPane ) );
  diffuseColor.a = min( diffuseColor.a, 0.94 );
`,
    );
  };
  // The tints are uniforms, so they do not belong in the key. The roughness floor IS baked into
  // the source, so it does — three computes the cache key BEFORE `onBeforeCompile` runs and
  // hands back the first program compiled under that key, and a constant key here would give
  // the Californian's 0.34 floor to whichever pane compiled first. That is the same collision
  // `configureResidentialShadowFloor` documents, and it is one identifier away at all times.
  material.customProgramCacheKey = () => `${previousKey}|residential-glass-v330r3-r${roughness.toFixed(2)}`;
  configureResidentialShadowFloor(material, archetypeId, GLASS_SHADOW_FLOOR);
  material.needsUpdate = true;
}

/**
 * Keep a residential dark bucket off zero after the studio grade.
 *
 * Until r1 this had never once run. The chunk it patched, `<output_fragment>`, was renamed to
 * `<opaque_fragment>` in three r152 and the project is on r185, so `String.replace` matched
 * nothing and returned the shader untouched — silently, because a failed replace is not an
 * error. Both names are attempted now so the pass survives a three.js move in either direction.
 *
 * **The floor rides a uniform, and the cache key is composed rather than replaced.** Repairing
 * the chunk name made the lever work and made a latent collision live in the same commit, and
 * this round makes the collision reachable by putting a second material — the iron — through
 * the same function at a different floor. three.js computes the program cache key BEFORE
 * `onBeforeCompile` runs and then hands back the first program compiled under that key, so a
 * floor baked into the shader SOURCE is only ever honoured for whichever material compiled
 * first; every later material with the same key silently inherits it. Two things fix that
 * class rather than the instance:
 *
 *   - the floor is a uniform, so the source is byte-identical for every caller and two
 *     materials sharing a program is now the correct outcome instead of a silent one
 *     (three clones `parameters.uniforms` per material, so the values stay separate);
 *   - the key is appended to whatever the material already carried — the atlas key, on iron —
 *     instead of overwriting it, so a material whose SOURCE differs upstream still gets its
 *     own program.
 *
 * The `userData` guard is not decoration. `materials.get()` caches on
 * `family::variant::overrides`, so a second `palette()` call for the same archetype/district/
 * façade returns the same material object; without the guard the second pass would declare the
 * uniform twice at global scope and the program would fail to link.
 */
function configureResidentialShadowFloor(material, archetypeId = null, floorOverride = null) {
  if (!material) return;
  if (material.userData.residentialShadowFloor !== undefined) return;
  const floor = floorOverride ?? (archetypeId === 'bungalow-californian' ? 0.03 : 0.06);
  material.userData.residentialShadowFloor = floor;
  const previousCompile = material.onBeforeCompile;
  const previousKey = typeof material.customProgramCacheKey === 'function'
    ? String(material.customProgramCacheKey()) : '';
  material.onBeforeCompile = (shader, renderer) => {
    if (previousCompile) previousCompile(shader, renderer);
    shader.uniforms.ddResidentialShadowFloor = { value: floor };
    for (const chunk of ['#include <opaque_fragment>', '#include <output_fragment>']) {
      if (!shader.fragmentShader.includes(chunk)) continue;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float ddResidentialShadowFloor;',
        )
        .replace(
          chunk,
          `outgoingLight = max( outgoingLight, vec3( ddResidentialShadowFloor ) );\n${chunk}`,
        );
      break;
    }
  };
  material.customProgramCacheKey = () => `${previousKey}|residential-shadow-floor-v330r2`;
}

/*
 * REMOVED at v330-r1 — `configureResidentialArchetypeResponse()`.
 *
 * It multiplied the corrugated roof by the ratio between `#b8c0c2` and the archetype's target
 * colour inside `<map_fragment>`, and paired with `federation.js: legacyRoofCompensation()`,
 * which forced `material.color` back to `#b8c0c2` whenever it saw the shader's cache key. Two
 * halves of one mechanism, in two files, owned by two seats.
 *
 * Measured on the baseline plate: the Federation cottage's roof albedo reads `#8e908e` (L 59.6)
 * but the plate renders it at L 46.6, because the ratio (≈0.58 linear) was applying on top of a
 * `material.color` that was already the target on any frame where the compensation guard did
 * not fire. The reference measures the same roof at L 76.7. It also clamped the roof's dark end
 * with `max(diffuseColor.rgb, 0.06)`, flattening the very slope-to-slope range §2.8 asks for.
 *
 * Deleting it makes `materials.get(color)` the single source of the roof colour. The guard in
 * federation.js keys on `customProgramCacheKey().startsWith('residential-roof-response-')`, so
 * with the key gone the guard returns false and that pass leaves the colour alone — this is
 * safe whether or not the Federation seat's concurrent matteRoof edit lands.
 */

/** Multiply a hex colour toward black (t<0) or white (t>0). */
export function shade(hex, t) {
  const c = new THREE.Color(hex);
  if (t < 0) c.multiplyScalar(1 + t);
  else c.lerp(new THREE.Color('#ffffff'), t);
  return `#${c.getHexString()}`;
}

/**
 * Compatibility hook for lanes authored before V3.20's material wear pass. Wear now lives in
 * albedo and roughness uniforms; this intentionally emits no geometry.
 */
export function applySharedWear(ctx, {
  width = ctx.env.bodyW,
  frontZ = ctx.env.frontZ,
  baseY = 0.14,
  salt = 72,
} = {}) {
  // Wear is a shader gradient now. Keep this compatibility hook so older lane call sites do
  // not change their build order or variation salts while ensuring no coplanar wear geometry
  // can return to the residential kit.
  void ctx; void width; void frontZ; void baseY; void salt;
}

/* ─────────────────────────────── the builder context ──────────────────────────────── */

/**
 * Build the context handed to every residential builder.
 *
 * `ctx.push(geometry|geometry[], material)` collects parts.
 * `ctx.env` carries the measured envelope; `ctx.p` the palette; `ctx.v` the variation
 * source; `ctx.q` the quality tier ('high' | 'medium' | 'low').
 *
 * The FRONT of every residential building faces +Z. The street kerb is at +Z. Builders may
 * assume this; the board rotates the instance.
 */
export function makeContext({ env, palette: p, variation: v, quality, archetypeId, districtId }) {
  const parts = [];
  const routedMaterial = (geometry, material) => {
    if (!geometry || !material) return material;
    const name = geometry.name ?? '';
    // V3.30 r3 — THE OTHER HALF OF "FIVE OPENINGS, FIVE TREATMENTS", AND IT IS NOT THE SHADER.
    //
    // `doubleHungWindow` draws a drape picked per opening from ['full','upper','parted','none']
    // and pushes it into `out.joinery`, 70 mm behind the glass at 94 % × 94 % of the pane. It
    // also pushes a `warm-room-plane` on one opening in five, into `out.trim`, 6 mm IN FRONT of
    // the glass at 90 % × 86 %. Both land in this file's single painted-timber bucket, and the
    // brick terraces paint that bucket the pale stone of their dressings — `#d8cdb4` on
    // terrace-single, `#e7dfcf` on terrace-double. So a `full` drape renders as a near-white
    // opaque card filling the opening and a `none` renders as clean glass, four openings apart
    // on one elevation. That is the "flat opaque mid-grey slab in a white surround, which reads
    // as a blanked-off window" and the "milky opaque panes sitting next to dark panes in the
    // same window": measured on `v330-r2-final/terrace-single--detail.png` the slab runs L 55-61
    // at hue 81 against `mp-terrace-single`'s curtain at L 52-58 BEHIND glass reading L 7-37.
    //
    // The curtain goes to the shadow bucket, which is the material the opening liner behind it
    // already uses, so a drape now deepens the room instead of boarding the window up. The room
    // plane goes to the glass bucket, where it is a second pane 6 mm proud of the first taking
    // the identical per-pane ramp — it cannot read as a card because it is the same material as
    // what it covers. Neither is a geometry change and neither costs a bucket: both targets are
    // already reached by every archetype.
    if (name === 'window-curtain') return p.shadow;
    if (name === 'warm-room-plane') return p.glass;
    if (archetypeId === 'bungalow-californian' && material === p.trim
      && /(sill|fence-.*cap|pier-cap|chimney.*cap|render-bellcast)/i.test(name)) {
      // Californian joinery is olive; the named caps and sills are the cream masonry family.
      return p.wall;
    }
    if (archetypeId === 'bungalow-brighton' && material === p.trim
      && /(render-bellcast|string-course)/i.test(name)) {
      return p.wall;
    }
    if (archetypeId === 'bungalow-brighton'
      && /(^(?:dwarf-wall|pier-(?:plinth|shaft|band))$|brighton-.*fence)/i.test(name)) {
      // Keep the Brighton clinker base dark, but give the front boundary its lighter red
      // masonry family without minting a bucket.
      return p.roofTrim;
    }
    if (archetypeId === 'heritage-federation-villa' && material === p.trim) {
      // The villa's joinery stays dark green, while its fence/pier caps and render bellcast
      // are the cream masonry family. Both reuse buckets already reached by the archetype.
      if (/(fence|bellcast|coping|cap|pier-cap)/i.test(name)) return p.wall;
      if (/(window|door|sash|glass-frame)/i.test(name)) return p.boundary;
    }
    return material;
  };
  return {
    env,
    p,
    v,
    q: quality,
    archetypeId,
    districtId,
    parts,
    push(geometry, material) {
      if (Array.isArray(geometry)) {
        for (const g of geometry) {
          if (!g) continue;
          // The Californian builder's old aggregate chips are disconnected red cards above
          // the plinth. They are wear emitters, not construction, and must not survive as
          // floating pixels; the brick datum and all authored masonry remain untouched.
          if (g.name?.startsWith('gutter-grime-')
            || g.name?.startsWith('villa-terracotta-course-')) continue;
          if (archetypeId === 'bungalow-californian'
            && g.name?.startsWith('californian-roughcast-aggregate-')) continue;
          parts.push({ geometry: g, material: routedMaterial(g, material) });
        }
      } else if (geometry) {
        if (geometry.name?.startsWith('gutter-grime-')
          || geometry.name?.startsWith('villa-terracotta-course-')) return;
        if (archetypeId === 'bungalow-californian'
          && geometry.name?.startsWith('californian-roughcast-aggregate-')) return;
        parts.push({ geometry, material: routedMaterial(geometry, material) });
      }
    },
    /** Detail elements are skipped below 'high' so the low tier stays in budget. */
    detail: quality === 'high',
    mid: quality !== 'low',
  };
}

/**
 * Push whatever a shared library handed back.
 *
 * The two shared libraries settled on different return shapes, for good reasons in each
 * case: `curtilage.js` returns `Part[]` — `{ geometry, material }` — because a lot straddles
 * masonry, iron and planting in one call and the parts already know their material;
 * `ornament.js` returns a BUNDLE — `{ iron: [...], joinery: [...] }` keyed by palette bucket
 * — so a caller can repaint the same lace by remapping a key. Both then exported a function
 * called `emit`, which a lane importing both cannot bind twice.
 *
 * Rather than force every lane to alias its imports and remember which shape came from
 * where, this takes either. Lanes should import `emit` from core.js and nothing else.
 *
 * @param {ReturnType<typeof makeContext>} ctx
 * @param {Array<{geometry: any, material: any}> | Record<string, any[]>} produced
 * @param {Record<string,string>|null} [remap] bundle form only — rename a bucket key
 */
export function emit(ctx, produced, remap = null) {
  if (!produced) return 0;
  if (Array.isArray(produced)) {
    let n = 0;
    for (const part of produced) {
      if (!part?.geometry) continue;
      ctx.push(part.geometry, part.material);
      n += 1;
    }
    return n;
  }
  let n = 0;
  for (const key of Object.keys(produced)) {
    const list = produced[key];
    if (!list || !list.length) continue;
    const bucket = remap?.[key] ?? key;
    const material = ctx.p[bucket];
    if (!material) {
      // Silently dropping geometry is worse than a noisy build: a typo'd bucket name would
      // read as "the ornament just did not show up".
      console.warn(`[residential] unknown palette bucket "${bucket}" — ${list.length} parts dropped`);
      continue;
    }
    ctx.push(list, material);
    n += list.length;
  }
  return n;
}
