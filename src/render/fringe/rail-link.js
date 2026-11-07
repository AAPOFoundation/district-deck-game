// Southern Cross → Tullamarine elevated airport rail on the inland fringe.
// Built always; visibility toggled from fringeVenues.railLink. Deterministic.

import * as THREE from 'three';
import {
  std, addBox, addCyl, noPick, edgeFrame, placeGroup,
} from './kit.js';
import {
  addChamferBar, BoxMerge, addMerged, StripMerge,
  HedgeStrip, LobeMerge, ContactMerge, contactMaterial,
  sampleLiveGround, addServiceUte, transitMats, applyGroundShadowFloor,
} from './transit.js';
import { alongLength } from '../shore.js';
import { TASTE } from '../taste-tokens.js';
import { waterRampHex } from '../water/law.js';
import { buildViaduct, buildEmbankment, buildShuttle, buildYard } from './rail-link-models.js';
import { trackKinActive, makeTrackKinMesh, TRACK_KIN_AIRPORT } from './track-form.js';

/**
 * W7-C: the fringe lights a standard material about 4-5x brighter than its albedo
 * (the hinterland paddock sheet carries PADDOCK_GAIN 0.20 for the same reason), so the
 * paddock, crop and dam tones are the taste tokens taken down by that gain.
 */
const FARM_GAIN = 0.26;
const tokDim = (hex, k = FARM_GAIN) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
const tokBlend = (a, b, t) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;

/**
 * Chain-link: an 8 x 8 alpha lattice (two diagonals per texel block) on a data texture, so the panel is a
 * mesh in silhouette and a fence at the distance the yard is seen from. Texel (0, 0) is opaque, which is
 * where the posts and rails (no uv) sample.
 */
function chainLinkTexture() {
  const N = 8;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const on = x === y || x + y === N - 1;
      const i = (y * N + x) * 4;
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = on ? 255 : 0;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Drops one merged, vertex-coloured geometry from rail-link-models.js into the scene. */
function addGeo(parent, geo, mat, name, opts = {}) {
  if (!geo?.index?.count) return null;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  mesh.userData.ownsGeometry = true;
  if (name) mesh.name = name;
  noPick(mesh);
  parent.add(mesh);
  return mesh;
}

function mats() {
  return {
    conc: std('#bdb6a6', { roughness: 0.86, metalness: 0.04 }),
    concDeep: std('#8e887c', { roughness: 0.9, metalness: 0.03 }),
    ballast: std('#8c8377', { roughness: 0.96, metalness: 0.03 }),
    sleeper: std('#775638', { roughness: 0.93, metalness: 0.02 }),
    sleeperWorn: std('#5e5a52', { roughness: 0.94, metalness: 0.02 }),
    steelDark: std('#666760', { roughness: 0.38, metalness: 0.68 }),
    blue: std('#1160b8', { roughness: 0.36, metalness: 0.2 }),
    dark: std('#1d2025', { roughness: 0.55, metalness: 0.18 }),
    hiVis: std('#e6b01a', { roughness: 0.55, metalness: 0.12 }),
    contact: std('#33372e', { roughness: 0.98, metalness: 0.02 }),
    track: std('#8a8172', { roughness: 0.97, metalness: 0.03 }),
    trackDark: std('#5f594c', { roughness: 0.98, metalness: 0.02 }),
    scrub: std('#4c6f31', { roughness: 0.96, metalness: 0.02 }),
    scrubDry: std('#8d8a4c', { roughness: 0.96, metalness: 0.02 }),
    postTimber: std('#6d5a43', { roughness: 0.94, metalness: 0.03 }),
    fenceWire: std('#8b8f92', { roughness: 0.44, metalness: 0.6 }),
    drum: std('#7c6a4f', { roughness: 0.9, metalness: 0.04 }),
    hutWall: std('#b9b2a0', { roughness: 0.8, metalness: 0.05 }),
    hutRoof: std('#5d6168', { roughness: 0.6, metalness: 0.3 }),
    asphalt: std('#3e4146', { roughness: 0.94, metalness: 0.03 }),
    asphaltAlt: std('#4a4e54', { roughness: 0.93, metalness: 0.03 }),
    kerb: std('#c4b79a', { roughness: 0.78, metalness: 0.04 }),
    paintW: std('#e8e4d6', { roughness: 0.58, metalness: 0.04 }),
    paintY: std('#d4ae32', { roughness: 0.56, metalness: 0.05 }),
    damp: std('#4c5a3a', { roughness: 0.98, metalness: 0.01 }),
    // P15-TR2. The old `damp` at #3a4a32 was the darkest large surface in the
    // corridor and it was drawn BELOW the crust, so the only thing it ever put on
    // the plate was a dark shard where a chord broke the surface. The channel is
    // now real geometry standing above the ground, so it can take a bank tone and
    // a wet-invert tone instead of one near-black value.
    dampWet: std('#3f4a35', { roughness: 0.9, metalness: 0.03 }),
    /**
     * The made ground itself, and the tones are a PLATE decision, not a taste one.
     *
     * The first TR2 capture proved the geometry and lost the read: crown, batter
     * and toe were all mid olive-tan within a few LSB of the hinterland crust, so
     * a formation that measures 0.02 m from the ring at its toe also LOOKED like
     * the ring, and gate 4 grades what it can see. Three separated bands now —
     * pale compacted gravel on the crown, a grassed green batter, a darker grass
     * at the toe — against khaki, which is what an embankment does anyway: the
     * running surface is stone and the slopes are seeded.
     */
    subgrade: std('#b9af95', { roughness: 0.95, metalness: 0.03 }),
    subgradeAlt: std('#c6bca0', { roughness: 0.94, metalness: 0.03 }),
    batter: std('#6f8a45', { roughness: 0.96, metalness: 0.02 }),
    batterAlt: std('#7e9850', { roughness: 0.96, metalness: 0.02 }),
    toe: std('#62783e', { roughness: 0.97, metalness: 0.02 }),
    retain: std('#9e968a', { roughness: 0.88, metalness: 0.05 }),
    hedge: std('#3f5c2b', { roughness: 0.97, metalness: 0.01 }),
    // P16 T9: the strip and lobe merges carry their own vertex tone — a darker
    // base band on the hedge, a shaded underside on every canopy lobe — so their
    // materials are white and let the attribute stand alone, the same composition
    // the ring's instanced trees use.
    hedgeStrip: std('#5c7a34', { roughness: 0.97, metalness: 0.01, vertexColors: true }),
    plantLobe: std('#5f8438', { roughness: 0.96, metalness: 0.01, vertexColors: true }),
    plantLobeAlt: std('#48632c', { roughness: 0.96, metalness: 0.01, vertexColors: true }),
    fieldA: applyGroundShadowFloor(std(tokDim(TASTE.ground.grassLush), { roughness: 0.97, metalness: 0.01 })),
    fieldB: applyGroundShadowFloor(std(tokDim(TASTE.ground.grassDry), { roughness: 0.97, metalness: 0.01 })),
    /**
     * The two flanks of a crop row, as a LIT/SHADE PAIR rather than as one tint
     * relying on the key. A 0.24 m ridge on a 1.6 m pitch tilts its faces about
     * 17°, and 17° of normal against this key is a couple of luma — under the
     * plate's own grain. The ring's hedges solved the same problem the same way
     * and their note says why: a fixed noon-ish key baked into the surface gives
     * a strip a shade side wherever the shadow map does not reach. Derived from
     * `fieldB` so the paddock's own tint still governs; only the value moves.
     * T10B's matched plate measured the first pair at only 1.08x T9 band spread.
     * These values are 2.53x farther apart but mean 154.7 luma, against fieldB's
     * 154.9: more readable section, effectively unchanged paddock tone.
     */
    cropLit: applyGroundShadowFloor(std(tokDim(tokBlend(TASTE.ground.grassDry, TASTE.ground.sandDry, 0.55), 0.34), { roughness: 0.97, metalness: 0.01 })),
    cropShade: applyGroundShadowFloor(std(tokDim(tokBlend(TASTE.ground.soil, '#000000', 0.40), 0.29), { roughness: 0.97, metalness: 0.01 })),
    farmTrack: applyGroundShadowFloor(std(tokDim(TASTE.ground.track), { roughness: 0.96, metalness: 0.02 })),
    dam: std('#4a6470', { roughness: 0.22, metalness: 0.12 }),
    damBank: applyGroundShadowFloor(std(tokDim(tokBlend(TASTE.ground.soil, TASTE.ground.grassDry, 0.35)), { roughness: 0.97, metalness: 0.02 })),
    reed: std('#4f6a32', { roughness: 0.96, metalness: 0.01 }),
    reedDry: std('#7a7a3e', { roughness: 0.96, metalness: 0.01 }),
    noise: std('#9aa08c', { roughness: 0.82, metalness: 0.06 }),
    noiseCap: std('#c2c6b4', { roughness: 0.7, metalness: 0.08 }),
    // `plantA`..`plantD` and `hedgeAlt` are gone: they were five materials whose
    // only job was to give neighbouring plants different tones, and the tone is a
    // vertex attribute on the lobe and strip merges now. Nothing referenced them
    // after the rebuild, and `mats()` has no dispose path, so leaving them would
    // have leaked five MeshStandardMaterials per build.
    bark: std('#5c4a36', { roughness: 0.94, metalness: 0.02 }),
    gantry: std('#4a5056', { roughness: 0.4, metalness: 0.55 }),
    gantrySign: std('#1e3a68', { roughness: 0.42, metalness: 0.12 }),
    warning: std('#d4a21a', { roughness: 0.48, metalness: 0.08 }),
    // rail-link-models.js bakes colour and occlusion into the vertex colour, so these are plain white standards.
    vcMatte: std('#ffffff', { roughness: 0.9, metalness: 0.03, vertexColors: true }),
    vcSteel: std('#ffffff', { roughness: 0.46, metalness: 0.5, vertexColors: true }),
    vcChain: std('#ffffff', { roughness: 0.5, metalness: 0.5, vertexColors: true, map: chainLinkTexture(), alphaTest: 0.5, side: THREE.DoubleSide }),
  };
}

export function addRailLink(parent, city, plan) {
  const roles = plan?.roles ?? {};
  const extent = plan?.extent ?? city?.extent ?? { x: 272, z: 272 };
  const edge = roles.inlandEdge;
  if (!edge) return null;
  const L = alongLength(edge, extent);
  const frame = edgeFrame(edge, extent, 20, 0);
  const m = mats();
  const root = new THREE.Group();
  root.name = 'fringe:airport-link';
  noPick(root);
  placeGroup(parent, root, frame);

  // The viaduct shares the inland edge with Southern Cross, whose hall centre
  // sits +L*0.26 along at seaward 22 and reaches ±26 m either side. At the old
  // L*0.48 span the deck drove straight through the concourse at local z = -2,
  // which the station hero camera could see. Stop the viaduct well short and
  // finish it on an abutment instead.
  const span = L * 0.26;
  /**
   * DECK HEIGHT — 8.2, and it was 6.4 until the ring came up through it.
   *
   * P15-TR2, measured on the live `plan.groundAt` rather than on the stub the
   * unit tests use: the hinterland under this viaduct is not the flat 0.34 m
   * shelf the corridor was authored against. A knoll rises to **6.23 m inside the
   * deck band** (|lz| <= 2.9) at lx 12.5 and stays above 5.9 m from lx 11 to 15.
   * The old soffit was 6.40 - 0.43 = 5.97, so the crust stood 0.26 m THROUGH the
   * underside of the deck for about 4 m of its length — which is the hard-edged
   * dark wedge in the middle of the board plate's corridor, and it is also why
   * the mid pier solved to a NEGATIVE column height (colTop 5.74 against a cap
   * top of 6.62) and stacked four dark foundation plates inside the soffit.
   *
   * 8.2 leaves 1.54 m of daylight over the measured crest. It costs about 9 plate
   * px of extra height at the board camera (7.5 px per metre at this pose), which
   * is the cheapest available answer to a solid-through-solid intersection.
   */
  const yDeck = 8.2;

  // The viaduct itself (girder, piers, track, platform, overhead line) is built further down by rail-link-models.js.

  /**
   * Annulus height in the viaduct's own local space. `placeGroup` puts this group
   * at `frame.origin`, whose y is 0, so the terrain sampler needs no offset — and
   * it is read from `plan.heightAt`, never from a copied ramp constant.
   */
  const toWorldXZ = (lx, lz) => ({
    x: frame.origin.x + frame.along.x * lx + frame.seaward.x * lz,
    z: frame.origin.z + frame.along.z * lx + frame.seaward.z * lz,
  });
  const groundLocal = (lx, lz) => {
    const p = toWorldXZ(lx, lz);
    return sampleLiveGround(plan, p.x, p.z) - frame.origin.y;
  };
  /**
   * The surface a foundation at (lx, lz) should actually sit on.
   *
   * Measured, not assumed: three of the seven piers stand on the airport's turf
   * tray and one on the station's deck, both about 2 m above the annulus. Setting
   * every pile cap on `groundLocal` puts four of seven foundations *inside* a
   * neighbour's solid slab — the same buried-base fault this round is fixing, one
   * cause along. Both venues publish `userData.deckPlate` (world AABB + top) and
   * this reads it; with no plate published it degrades to the annulus, which is
   * the r0 behaviour and is correct wherever no tray exists.
   */
  const supportLocal = (lx, lz) => {
    const p = toWorldXZ(lx, lz);
    let top = groundLocal(lx, lz) + frame.origin.y;
    for (const sib of parent?.children ?? []) {
      const d = sib?.userData?.deckPlate;
      if (!d || sib === root) continue;
      if (p.x < d.minX || p.x > d.maxX || p.z < d.minZ || p.z > d.maxZ) continue;
      if (d.top > top) top = d.top;
    }
    return top - frame.origin.y;
  };
  const seedU = (k) => {
    const n = Math.imul(((city?.seed ?? plan?.seed ?? 0) >>> 0) ^ (k >>> 0), 2246822519) >>> 0;
    const q = Math.imul(n ^ (n >>> 13), 3266489917) >>> 0;
    return ((q ^ (q >>> 16)) >>> 0) / 4294967296;
  };

  // --- the subgrade formation ---------------------------------------------
  //
  // P13-CRITIC-BA2.codex.md **fault 3**: "bd-transport-landmass + x 410-1180 /
  // y 420-960 + mvp/src/render/fringe/rail-link.js — extend
  // `fringe:airport-link-access-road` and `fringe:airport-link-swale` into both
  // venue batters so the road no longer dissolves into the central void."
  //
  // The road did not dissolve because it was short. Measured on the live plan:
  // the open stretch runs lx -10.6 .. +24.9 and the road already covered
  // -9.6 .. +23.9, so the longitudinal gap to each tray was about 1.2 m. What it
  // dissolved into was the SHAPE of the ground. The corridor crosses a knoll that
  // rises from 0.34 m to 6.32 m and back inside 24 m, and the road was 28 flat
  // quads laid at `groundLocal + 0.04` — a 1.2 m chord against a 1:2 slope, so it
  // alternately buried itself and broke the surface. The swale was worse: it was
  // authored at `groundLocal - 0.02 .. -0.22`, i.e. entirely BELOW the crust, and
  // the only pixels it ever produced were the shards where a chord happened to
  // poke out. Those shards are the dark grey streaks the plate reads at
  // x 700-900 / y 480-700.
  //
  // So the object is a formation, not a decal: one built crust of made ground
  // from the Tullamarine tray to the Southern Cross tray, standing FILL above the
  // natural surface everywhere, battered to a toe on the sampled ring at both
  // edges, with the road on its crown and the swales dished INTO it. Because the
  // crown stands 0.46 m proud, a swale invert 0.34 m below the crown is still
  // 0.12 m above the crust and therefore always renders — that is the whole fix
  // for the dark plates, and it is a consequence of building up rather than a
  // depth constant that has to be tuned.
  //
  // The formation cannot ride over the knoll under the deck: there is no legal
  // crown there, because a crown below the crust would have the crust through it
  // and a crown above the crust would be inside the viaduct. So the band swings
  // west onto the knoll's gentler flank where the straddling alignment would cost
  // more than a metre of height, and swings back over the pier line where the
  // land is flat. The knoll itself is then dressed as what it is: paddock.
  const SOFFIT = yDeck - 0.43;
  const openAt = (x) => supportLocal(x, 0) - groundLocal(x, 0) < 0.08;
  const corr = (() => {
    const lo = -span * 0.5 - 5;
    const hi = span * 0.5 + 5;
    let x0 = null;
    let x1 = null;
    for (let x = lo; x <= hi; x += 0.5) {
      if (!openAt(x)) continue;
      if (x0 === null) x0 = x;
      x1 = x;
    }
    if (x0 === null) return { x0: lo, x1: lo, empty: true };
    return { x0: x0 + 1.0, x1: x1 - 1.0, empty: (x1 - x0) < 8 };
  })();

  const FORM_W = 15.0;      // crown band: lip, drain, kerb, 5.8 m carriageway, kerb, drain, shoulder
  const FORM_FILL = 0.58;   // made ground over the crust — the drains live inside this
  /**
   * INNER LIP AT z = 3.0, and it is not under the deck.
   *
   * The first TR2 solve put a level 15 m crown on the corridor centreline and let
   * the alignment swing around the knoll. Measured, that was worse than what it
   * replaced: a level crown on a 1:2 cross-slope is a 4.5 m fill on its low side,
   * the profile ballooned to 6.76 m at lx 14 and then fell 3.5 m in 2 m at the
   * station end, and the swinging band jumped 9 m sideways between two stations.
   *
   * A formation on a hillside is benched — cut on the uphill side, filled on the
   * downhill — and this lane cannot cut, because a crown below the crust has the
   * crust through it. So the crown DRAPES: it is the blurred crust plus a constant
   * fill, which keeps the batters short, the toes on the sampled ring, and the
   * drains above ground for their whole length. Only the carriageway is flattened,
   * and only to 35 % of the local cross-fall, which is bounded by the fill so the
   * road can never cut below the crust either.
   *
   * The band then sits BESIDE the viaduct on the camera side rather than under it:
   * 3.0 clears the deck's 2.7 m half-width, so the road is never hidden behind the
   * deck, the piers stand at the formation's inner toe, and the crown at the crest
   * is 4.8 m against a 7.77 m soffit instead of fighting it.
   */
  const FORM_ZIN = 3.0;
  // [offset from the inner lip, height against the draped base]. Read across:
  // retaining lip, drain, kerb, 5.8 m carriageway, kerb, drain, shoulder.
  const FORM_SECT = [
    [0.00, 0.00], [0.90, 0.00], [1.70, -0.34], [3.10, -0.34], [3.90, 0.00],
    [4.35, 0.07], [4.62, 0.05], [7.50, 0.10], [10.38, 0.05], [10.65, 0.07],
    [11.10, 0.00], [11.95, -0.30], [13.20, -0.30], [14.05, 0.00], [FORM_W, 0.00],
  ];
  const sectOff = (u) => {
    if (u <= 0) return 0;
    for (let k = 0; k + 1 < FORM_SECT.length; k += 1) {
      const [o0, d0] = FORM_SECT[k];
      const [o1, d1] = FORM_SECT[k + 1];
      if (u <= o1) return d0 + (d1 - d0) * ((u - o0) / (o1 - o0));
    }
    return 0;
  };
  // 1 outside the carriageway, 0.35 across it: the road keeps a third of the
  // hillside's cross-fall and pivots about its own centreline, so the deviation
  // from the draped base is bounded by half the band's local drop.
  const flatOf = (u) => {
    const ramp = (a, b) => {
      const t = Math.max(0, Math.min(1, (u - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    if (u <= 3.2) return 1;
    if (u < 4.5) return 1 - 0.65 * ramp(3.2, 4.5);
    if (u <= 10.5) return 0.35;
    if (u < 12.2) return 0.35 + 0.65 * ramp(10.5, 12.2);
    return 1;
  };
  const FORM = (() => {
    if (corr.empty) return null;
    // Lap 2.7 m ONTO each tray so no ring is left between formation and slab.
    const x0 = corr.x0 - 2.7;
    const x1 = corr.x1 + 2.7;
    const N = Math.max(30, Math.round((x1 - x0) / 0.6));
    const at = (i) => x0 + ((x1 - x0) * i) / N;
    /**
     * THE RAMPS ARE SOLVED, NOT SET.
     *
     * P15 TR3. `TAPER = 7.0` was a constant: seven metres in which the fill runs
     * out onto each venue's apron. Measured on the built carriageway at its own
     * stations (a 0.5 m rebin of a 0.6 m station pitch reports the same slope as
     * −5 % and −12 % on adjacent bins, which is how TR2's instrument produced a
     * figure it could not reconcile), the north ramp carried **−10.3 %** on this
     * seed against a 12 % law: the constant sheds 0.62 m of made ground over 7 m,
     * and the ring underneath ALSO falls 0.13 m across the same run, which a
     * constant cannot know.
     *
     * `GRADE_TARGET` states the design grade instead and the run is solved
     * against the grade the BUILT crown actually carries. That matters because
     * `baseAt` blends a rising made surface into a falling natural one, so the
     * ramp's profile is convex and its steepest station sits about 1.5 points
     * above the drop-over-length figure — solving the average would have left the
     * worst station over the target. Six passes, each stretching the offending
     * ramp by the ratio it overshot, both ramps capped so they cannot meet in the
     * middle and floored so a corridor on flat ground still lands its ends.
     */
    const GRADE_TARGET = 0.09;
    const RAMP_CAP = Math.max(4.0, (x1 - x0) * 0.42);
    let rampS = 7.0;
    let rampN = 7.0;
    const taperAt = (x) => Math.max(0, Math.min(1,
      Math.min((x - x0) / rampS, (x1 - x) / rampN)));
    /** Crust blurred 5 m across and 3.6 m along — a made surface, not every wrinkle. */
    const drape = (x, z) => (
      0.34 * groundLocal(x, z)
      + 0.165 * (groundLocal(x, z - 2.5) + groundLocal(x, z + 2.5))
      + 0.165 * (groundLocal(x - 1.8, z) + groundLocal(x + 1.8, z))
    );
    /**
     * Longitudinal grading, fill only and capped. The knoll runs at 1:1.2 along
     * the alignment, so an ungraded crown gave the carriageway an 82 % grade.
     * A fill-only limiter at 42 % raises the approaches and can only ever push the
     * profile UP, so the "crown is above the crust" invariant survives it, and the
     * lift is capped at 2.0 m so it cannot become the 4.5 m embankment the first
     * solve produced. What is left after that is the hill, and the hill needs a
     * cutting, which needs fringe.js.
     */
    const lift = [];
    {
      const prof = [];
      for (let i = 0; i <= N; i += 1) prof.push(drape(at(i), FORM_ZIN + 7.5) + FORM_FILL);
      const g = prof.slice();
      const dx = (x1 - x0) / N;
      for (let i = 1; i <= N; i += 1) g[i] = Math.max(g[i], g[i - 1] - 0.42 * dx);
      for (let i = N - 1; i >= 0; i -= 1) g[i] = Math.max(g[i], g[i + 1] - 0.42 * dx);
      for (let i = 0; i <= N; i += 1) lift.push(Math.min(2.0, g[i] - prof[i]));
    }
    const liftAt = (x) => {
      const f = Math.max(0, Math.min(N, ((x - x0) * N) / (x1 - x0)));
      const i = Math.max(0, Math.min(N - 1, Math.floor(f)));
      return lift[i] + (lift[i + 1] - lift[i]) * (f - i);
    };
    /**
     * The draped base at (x, offset). Never less than 0.42 m over the crust, so
     * a 0.34 m drain invert still stands 0.08 m proud of it — which is the whole
     * reason TR's swale was invisible and this one is not.
     */
    const baseAt = (x, u) => {
      const z = FORM_ZIN + u;
      const g = groundLocal(x, z);
      const raw = Math.max(drape(x, z) + FORM_FILL + liftAt(x), g + 0.42);
      const t = taperAt(x);
      if (t >= 1) return raw;
      /**
       * THE ENDS LAND ON THE CRUST, NOT ON `deckPlate.top`.
       *
       * The first version tapered to the published tray top. Measured against the
       * built venues in the 15 m band this formation actually occupies: the
       * airport's apron crown there is 0.52 and its tray 0.46, which the tray top
       * describes correctly — but Southern Cross publishes `top` 0.645 for its
       * RAIL DECK while its apron crown in this band is 0.21-0.29, so tapering to
       * 0.645 stood the formation's end 0.4 m proud of the surface it is supposed
       * to meet. Both venue aprons already run their own batter down to the crust,
       * so the honest common surface at the ends is the crust, and 0.16 m over it
       * passes UNDER the airport's 0.52 crown (which then hides the lap) and under
       * the station apron, with no coplanar sliver on either.
       */
      const land = g + 0.16;
      return Math.max(land + (raw - land) * t, g + 0.06);
    };
    const sectY = (x, u) => {
      const pivot = baseAt(x, 7.5);
      return pivot + (baseAt(x, u) - pivot) * flatOf(u) + sectOff(u) * taperAt(x);
    };
    // Solve the two ramps against the carriageway they actually build. `rampS`
    // and `rampN` are read by `taperAt` on every call, so each pass re-measures
    // the profile the previous pass produced rather than a model of it.
    {
      const crown = (x) => sectY(x, 7.5);
      const dx = (x1 - x0) / N;
      const worstOn = (lo, hi) => {
        let w = 0;
        for (let i = 0; i < N; i += 1) {
          const xa = at(i);
          const xb = at(i + 1);
          if (xb < lo || xa > hi) continue;
          w = Math.max(w, Math.abs(crown(xb) - crown(xa)) / dx);
        }
        return w;
      };
      for (let pass = 0; pass < 6; pass += 1) {
        const wS = worstOn(x0, x0 + rampS);
        const wN = worstOn(x1 - rampN, x1);
        if (wS <= GRADE_TARGET && wN <= GRADE_TARGET) break;
        if (wS > GRADE_TARGET) rampS = Math.min(RAMP_CAP, rampS * (wS / GRADE_TARGET));
        if (wN > GRADE_TARGET) rampN = Math.min(RAMP_CAP, rampN * (wN / GRADE_TARGET));
      }
    }
    return {
      x0, x1, N, at, taperAt, baseAt, sectY,
      rampS, rampN,
      crownAt: (x) => sectY(x, 7.5),
      inside: (x) => x >= x0 && x <= x1,
    };
  })();
  const BATTER_RUN = (rise) => Math.max(1.2, Math.min(13, Math.abs(rise) * 2.5 + 1.0));
  /**
   * THE VIADUCT'S DECK BAND, AND WHY THE INNER LIP IS RETAINED.
   *
   * P15 TR3, and it is what makes `fringe:airport-link-retaining` build. The
   * inner batter falls from the lip at local z 3.0 toward the centreline over
   * `BATTER_RUN(rise)`, which at this corridor's 0.6 m of fill is 2.5 m — so the
   * toe lands at z 0.5. Measured on the built mesh before it was touched:
   * **98 of 98 inner-batter vertices stood inside the deck band**, and the slope
   * ran over the pier foundations, whose 4.4 m contact plate reaches z 2.2 and
   * was sitting under 0.33 m of embankment. That is the same buried-foundation
   * fault TR2 fixed one cause along, arriving from the other side.
   *
   * An embankment that cannot daylight before it reaches a structure is retained
   * rather than battered, in practice and here. Where the toe would fall inside
   * the deck band the lip gets a wall with a coping and a stone strip at its
   * foot; the pier pads get their ground back; and the land under the deck stays
   * ring instead of becoming a green slope that ends at a column.
   */
  const DECK_HALF = 2.7;
  const innerRetained = (x) => {
    if (!FORM) return false;
    const rise = FORM.crownAt(x) - groundLocal(x, FORM_ZIN - 0.9);
    if (rise <= 0.06) return false;   // the crust is the higher surface: the cut-face case
    return FORM_ZIN - BATTER_RUN(rise) < DECK_HALF + 0.3;
  };
  const formSurface = (x, z) => {
    if (!FORM || !FORM.inside(x)) return null;
    const u = z - FORM_ZIN;
    if (u >= 0 && u <= FORM_W) return FORM.sectY(x, u);
    for (const [edge, dir] of [[FORM_ZIN + FORM_W, 1], [FORM_ZIN, -1]]) {
      const d = (z - edge) * dir;
      if (d < 0) continue;
      // A retained lip has no slope past it: the wall face is vertical and the
      // ring starts on the other side, which is what lets the dressing and the
      // pier foundations sit on the crust right up to the wall.
      if (dir < 0 && innerRetained(x)) return null;
      const y = FORM.sectY(x, dir > 0 ? FORM_W : 0);
      const rise = y - groundLocal(x, edge + dir * 0.9);
      if (rise <= 0.06) return null;      // retained cut face: the crust owns it
      const run = BATTER_RUN(rise);
      if (d > run) return null;
      const toe = groundLocal(x, edge + dir * run) - 0.02;
      return y + (toe - y) * (d / run);
    }
    return null;
  };
  /** Ground for anything the corridor plants: formation first, crust behind it. */
  const surfaceAt = (x, z) => {
    const f = formSurface(x, z);
    return f === null ? groundLocal(x, z) : f;
  };
  /** Foundation surface: a venue tray, then the formation, then the crust. */
  const supportOn = (x, z) => Math.max(supportLocal(x, z), formSurface(x, z) ?? -Infinity);

  // --- the viaduct --------------------------------------------------------
  //
  // A box girder 8 m wide and 1.7 m deep in three 24 m spans (the piers at +-span/6, bearings as a shadow
  // gap over each), hammerhead piers on pile caps set on the sampled surface, abutment blocks with buffer
  // stops, one ballasted track on two thin rails, parapets and a cable trough, a 1.0 m platform with a
  // canopy and a station building, and a 25 kV overhead line on three masts. Built as merged,
  // vertex-coloured meshes in rail-link-models.js: the old seven stepped pads, 960 ballast chips, 1,850
  // sleeper plates and the twelve-metre mast rhythm are gone.
  const DECK_TOP = yDeck + 0.275;
  const pierX = [-span / 6, span / 6];
  const PLATFORM_X = [-22.5, -3.0];
  const via = buildViaduct({ span, yTop: DECK_TOP, pierX, supportAt: supportOn, platformX: PLATFORM_X });
  const RAIL_TOP = via.info.railTop;
  const CONTACT_Y = via.info.contactY;
  addGeo(root, via.matte, m.vcMatte, 'fringe:airport-link-viaduct');
  addGeo(root, via.steel, m.vcSteel, 'fringe:airport-link-viaduct-steel', { receive: true });
  root.userData.viaduct = via.info;

  // --- the corridor under the deck ----------------------------------------
  //
  // The board plate's own indictment: "the rail viaduct crosses the void on bare
  // piers with nothing underneath, and the only relief anywhere in the lower half
  // of the frame is the viaduct's own cast shadow." A real elevated railway owns
  // the land it stands on. TR gave it a road, a drain, a fence and materiel; TR2
  // gives all of that one piece of made ground to stand on, because a carriageway
  // draped on a knoll is not infrastructure, it is a decal that tears.
  //
  // The solver is above. This is the surface it renders: fifteen metres of section
  // read across as retaining lip, drain, kerb, 5.8 m carriageway, kerb, drain,
  // shoulder — every strip derived from the same crown height, so the drains are
  // cut INTO the formation and cannot slip under the crust the way the old ones
  // did. Batters fall from both lips to a toe seated on the sampled ring.
  const yardSpot = { x: 0, z: 0, y: 0, ok: false };
  if (FORM) {
    const crownM = new StripMerge();
    const crownAlt = new StripMerge();
    const road = new StripMerge();
    const roadAlt = new StripMerge();
    const ruts = new StripMerge();
    const swale = new StripMerge();
    const swaleWet = new StripMerge();
    const batter = new StripMerge();
    const batterAlt = new StripMerge();
    const toeM = new StripMerge();
    const kerbL = new BoxMerge();
    const kerbR = new BoxMerge();
    const wallB = new BoxMerge();
    const coping = new BoxMerge();
    const paintC = new BoxMerge();
    const paintE = new BoxMerge();

    // Which family each strip of the section lands in. The drains are geometry
    // cut into the formation, not a plate laid on it.
    const KIND = [
      'crown', 'swale', 'wet', 'swale', 'crown',
      'edge', 'road', 'road', 'edge', 'crown',
      'swale', 'wet', 'swale', 'crown',
    ];
    const binOf = (kind, i) => {
      if (kind === 'road') return i % 7 === 3 ? roadAlt : road;
      if (kind === 'swale') return swale;
      if (kind === 'wet') return swaleWet;
      if (kind === 'edge') return crownAlt;
      return i % 5 === 2 ? crownAlt : crownM;
    };

    for (let i = 0; i < FORM.N; i += 1) {
      const xa = FORM.at(i);
      const xb = FORM.at(i + 1);
      for (let k = 0; k + 1 < FORM_SECT.length; k += 1) {
        const o0 = FORM_SECT[k][0];
        const o1 = FORM_SECT[k + 1][0];
        binOf(KIND[k], i).quad(
          [xa, FORM.sectY(xa, o0), FORM_ZIN + o0], [xb, FORM.sectY(xb, o0), FORM_ZIN + o0],
          [xb, FORM.sectY(xb, o1), FORM_ZIN + o1], [xa, FORM.sectY(xa, o1), FORM_ZIN + o1],
        );
      }
      const mid = (xa + xb) * 0.5;
      const seg = (xb - xa) + 0.05;
      // Kerb 0.30 x 0.42 and the paint 0.34 / 0.26 wide. Exaggerated on purpose:
      // the lateral scale at this pose is 5.7 plate px per metre (86 px across the
      // 15 m band, measured off the projection), so a real 0.15 m kerb line and a
      // 0.10 m lane marking would both land under one pixel and simply not exist.
      kerbL.box(seg, 0.30, 0.42, mid, FORM.sectY(mid, 4.35) + 0.12, FORM_ZIN + 4.35);
      kerbR.box(seg, 0.30, 0.42, mid, FORM.sectY(mid, 10.65) + 0.12, FORM_ZIN + 10.65);
      // Polish down the two running lines, so the carriageway carries traffic
      // rather than one flat value across 5.8 m.
      for (const o of [6.05, 8.95]) {
        ruts.quad(
          [xa, FORM.sectY(xa, o) + 0.022, FORM_ZIN + o - 0.32],
          [xb, FORM.sectY(xb, o) + 0.022, FORM_ZIN + o - 0.32],
          [xb, FORM.sectY(xb, o) + 0.022, FORM_ZIN + o + 0.32],
          [xa, FORM.sectY(xa, o) + 0.022, FORM_ZIN + o + 0.32],
        );
      }
      if (i % 3 === 0) paintC.box(1.45, 0.05, 0.34, mid, FORM.sectY(mid, 7.5) + 0.04, FORM_ZIN + 7.5);
      if (i % 4 !== 1) {
        paintE.box(1.05, 0.045, 0.26, mid, FORM.sectY(mid, 5.10) + 0.035, FORM_ZIN + 5.10);
        paintE.box(1.05, 0.045, 0.26, mid, FORM.sectY(mid, 9.90) + 0.035, FORM_ZIN + 9.90);
      }
      // Batters and toes on both lips, solved per station against the crust.
      for (const [uEdge, dir] of [[FORM_W, 1], [0.0, -1]]) {
        const e = FORM_ZIN + uEdge;
        const ya = FORM.sectY(xa, uEdge);
        const yb = FORM.sectY(xb, uEdge);
        const riseA = ya - groundLocal(xa, e + dir * 0.9);
        const riseB = yb - groundLocal(xb, e + dir * 0.9);
        const retained = dir < 0 && innerRetained(mid);
        if (retained && (riseA > 0.06 || riseB > 0.06)) {
          // FILL RETAINED AT THE STRUCTURE. The slope cannot daylight before the
          // viaduct's deck band, so the lip is a wall: face, coping, and a stone
          // strip on the crust at its foot so it lands on something rather than
          // springing out of grass. The strip joins the named toe family, which
          // is the surface the "toe meets the ring within 0.15 m" law measures.
          const gA = groundLocal(xa, e + dir * 0.6);
          const gB = groundLocal(xb, e + dir * 0.6);
          const top = (ya + yb) * 0.5 + 0.10;
          const base = Math.min(gA, gB) - 0.55;
          wallB.box(seg, Math.max(0.30, top - base), 0.44, mid, (top + base) * 0.5, e + dir * 0.06);
          coping.box(seg, 0.13, 0.60, mid, top + 0.06, e + dir * 0.10);
          toeM.quad(
            [xa, gA + 0.02, e + dir * 0.30], [xb, gB + 0.02, e + dir * 0.30],
            [xb, groundLocal(xb, e + dir * 1.5) + 0.02, e + dir * 1.5],
            [xa, groundLocal(xa, e + dir * 1.5) + 0.02, e + dir * 1.5],
          );
        } else if (riseA > 0.06 || riseB > 0.06) {
          const rA = BATTER_RUN(Math.max(0.06, riseA));
          const rB = BATTER_RUN(Math.max(0.06, riseB));
          const tA = groundLocal(xa, e + dir * rA) - 0.02;
          const tB = groundLocal(xb, e + dir * rB) - 0.02;
          (i % 4 === 1 ? batterAlt : batter).quad(
            [xa, ya, e], [xb, yb, e],
            [xb, tB, e + dir * rB], [xa, tA, e + dir * rA],
          );
          toeM.quad(
            [xa, tA + 0.02, e + dir * rA], [xb, tB + 0.02, e + dir * rB],
            [xb, groundLocal(xb, e + dir * (rB + 1.2)) + 0.02, e + dir * (rB + 1.2)],
            [xa, groundLocal(xa, e + dir * (rA + 1.2)) + 0.02, e + dir * (rA + 1.2)],
          );
        } else {
          // The crust stands above the crown here, so the lip is a retained face,
          // not a slope. Built as a bar rather than a quad: a vertical strip's
          // normal has ny ~ 0 and StripMerge's flip test cannot orient it.
          const hA = Math.min(groundLocal(xa, e + dir * 0.7), ya + 2.6);
          const hB = Math.min(groundLocal(xb, e + dir * 0.7), yb + 2.6);
          const top = (hA + hB) * 0.5 + 0.08;
          const base = Math.min(ya, yb) - 0.45;
          wallB.box(seg, Math.max(0.25, top - base), 0.62, mid, (top + base) * 0.5, e + dir * 0.31);
          coping.box(seg, 0.13, 0.74, mid, top + 0.06, e + dir * 0.31);
        }
      }
    }
    addMerged(root, crownM, m.subgrade, { cast: false, name: 'fringe:airport-link-formation' });
    addMerged(root, crownAlt, m.subgradeAlt, { cast: false });
    addMerged(root, batter, m.batter, { cast: false, name: 'fringe:airport-link-batter' });
    addMerged(root, batterAlt, m.batterAlt, { cast: false });
    addMerged(root, toeM, m.toe, { cast: false, name: 'fringe:airport-link-toe' });
    addMerged(root, wallB, m.retain, { name: 'fringe:airport-link-retaining' });
    addMerged(root, coping, m.kerb, { cast: false });
    addMerged(root, road, m.asphalt, { cast: false, name: 'fringe:airport-link-access-road' });
    addMerged(root, roadAlt, m.asphaltAlt, { cast: false });
    addMerged(root, ruts, m.trackDark, { cast: false });
    addMerged(root, swale, m.damp, { cast: false, name: 'fringe:airport-link-swale' });
    addMerged(root, swaleWet, m.dampWet, { cast: false });
    addMerged(root, kerbL, m.kerb, { name: 'fringe:airport-link-kerb-l' });
    addMerged(root, kerbR, m.kerb, { name: 'fringe:airport-link-kerb-r' });
    addMerged(root, paintC, m.paintY, { cast: false, name: 'fringe:airport-link-lane-paint' });
    addMerged(root, paintE, m.paintW, { cast: false });

    // Culverts. A drain that runs the length of a corridor and never crosses the
    // road it drains is a painted line. Two cross-drains, each with a headwall and
    // a pipe mouth in both channels and a grated inlet on the uphill side.
    for (const [ci, t] of [[0, 0.30], [1, 0.71]]) {
      const cx = FORM.x0 + (FORM.x1 - FORM.x0) * t;
      const zi = FORM_ZIN;
      for (const [o, dir] of [[2.40, 1], [12.55, -1]]) {
        const cy = FORM.sectY(cx, o);
        addChamferBar(root, m.concDeep, 2.2, 0.62, 0.66, 0.08, cx, cy + 0.06, zi + o,
          { rotY: Math.PI / 2, name: ci === 0 && dir > 0 ? 'fringe:airport-link-culvert' : undefined });
        addCyl(root, 0.30, 0.30, 0.9, 10, m.dark, cx, cy + 0.06, zi + o + dir * 0.42,
          { rotY: Math.PI / 2, rotZ: Math.PI / 2, cast: false });
        addChamferBar(root, m.steelDark, 1.5, 0.28, 0.07, 0.02, cx, cy + 0.20, zi + o,
          { rotY: Math.PI / 2, cast: false });
      }
      addChamferBar(root, m.warning, 0.5, 0.14, 0.5, 0.04,
        cx - 0.9, FORM.sectY(cx, 3.6) + 0.28, zi + 3.6);
    }

    // Reeds and rushes IN the channels — they sit at the invert, which stands
    // 0.12 m above the crust, so unlike TR's they are on something.
    const reeds = new BoxMerge();
    const reedsDry = new BoxMerge();
    for (let i = 0; i < 64; i += 1) {
      const u = seedU(8800 + i * 19);
      const v = seedU(9100 + i * 23);
      if (u < 0.14) continue;
      const x = FORM.x0 + v * (FORM.x1 - FORM.x0);
      const near = i % 2 === 0;
      const off = near ? 1.75 + u * 1.25 : 12.05 + u * 1.05;
      const z = FORM_ZIN + off;
      // Seated on the channel's OWN invert, not on the road centreline. Taking the
      // crown height for a point 6 m across a 12 % cross-fall put 90 of 1,056 reed
      // vertices under the crust — the same class of error as the old swale.
      const g0 = FORM.sectY(x, off);
      const h = 0.4 + u * 0.62;
      const bin = u > 0.62 ? reedsDry : reeds;
      bin.box(0.08 + v * 0.07, h, 0.08 + u * 0.05, x, g0 + h * 0.42, z, u * 2.4);
      if (i % 3 !== 0) bin.box(0.07, h * 0.72, 0.06, x + 0.22, g0 + h * 0.3, z + 0.18, v * 1.8);
    }
    addMerged(root, reeds, m.reed, { cast: false, name: 'fringe:airport-link-reeds' });
    addMerged(root, reedsDry, m.reedDry, { cast: false });

    // The yard's pad. Benched off the outer shoulder where the crown is flattest,
    // measured rather than placed: the station with the smallest crown gradient in
    // the southern half wins, so the pad never lands on the grade over the knoll.
    {
      let best = Infinity;
      let bi = 4;
      for (let i = 6; i < FORM.N - 6; i += 1) {
        const grad = Math.abs(FORM.crownAt(FORM.at(i + 3)) - FORM.crownAt(FORM.at(i - 3)))
          + Math.abs(FORM.sectY(FORM.at(i), FORM_W) - FORM.sectY(FORM.at(i), FORM_W - 6));
        const cost = grad + Math.abs(i / FORM.N - 0.20) * 2.4;
        if (cost < best) { best = cost; bi = i; }
      }
      const px = FORM.at(bi);
      const pz = FORM_ZIN + FORM_W + 5.4;
      const py = FORM.sectY(px, FORM_W);
      const pad = new StripMerge();
      const padBat = new StripMerge();
      const padKerb = new BoxMerge();
      const HX = 6.2;
      const HZ = 5.4;
      const S = 8;
      for (let a = 0; a < S; a += 1) {
        const ax = px - HX + (2 * HX * a) / S;
        const bx = px - HX + (2 * HX * (a + 1)) / S;
        pad.quad([ax, py + 0.02, pz - HZ], [bx, py + 0.02, pz - HZ],
          [bx, py + 0.02, pz + HZ], [ax, py + 0.02, pz + HZ]);
        // Batter off the pad's outer face and its two ends.
        const oz = pz + HZ;
        const r0 = BATTER_RUN(py - groundLocal(ax, oz + 1.0));
        const r1 = BATTER_RUN(py - groundLocal(bx, oz + 1.0));
        padBat.quad([ax, py + 0.02, oz], [bx, py + 0.02, oz],
          [bx, groundLocal(bx, oz + r1) - 0.02, oz + r1],
          [ax, groundLocal(ax, oz + r0) - 0.02, oz + r0]);
        padKerb.box((2 * HX) / S + 0.04, 0.26, 0.34, (ax + bx) * 0.5, py + 0.13, oz);
      }
      for (const s of [1, -1]) {
        const ex = px + s * HX;
        const r = BATTER_RUN(py - groundLocal(ex + s * 1.0, pz));
        padBat.quad([ex, py + 0.02, pz - HZ], [ex, py + 0.02, pz + HZ],
          [ex + s * r, groundLocal(ex + s * r, pz + HZ) - 0.02, pz + HZ],
          [ex + s * r, groundLocal(ex + s * r, pz - HZ) - 0.02, pz - HZ]);
        padKerb.box(0.3, 0.26, 2 * HZ, ex, py + 0.13, pz);
      }
      addMerged(root, pad, m.subgradeAlt, { cast: false, name: 'fringe:airport-link-yard-pad' });
      addMerged(root, padBat, m.batter, { cast: false });
      addMerged(root, padKerb, m.kerb);
      yardSpot.x = px;
      yardSpot.z = pz;
      yardSpot.y = py + 0.02;
      yardSpot.ok = true;
    }
  }
  /**
   * Corridor-relative placement. `t` runs 0..1 along the formation and `off` is
   * metres out from its inner lip, so the dressing follows the alignment when it
   * swings instead of each family re-deriving a z from the pier line — which is
   * how TR ended up with a fence, a planting belt and a yard on a hillside the
   * road had already left.
   */
  const corrAt = (t, off) => {
    if (!FORM) return { x: 0, z: off, y: groundLocal(0, off) };
    const x = FORM.x0 + (FORM.x1 - FORM.x0) * t;
    const z = FORM_ZIN + off;
    return { x, z, y: surfaceAt(x, z) };
  };
  /** Offset of the outer toe at x — where the made ground stops and the ring starts. */
  const toeOff = (x) => {
    if (!FORM) return 8;
    const zi = FORM_ZIN;
    const rise = FORM.crownAt(x) - groundLocal(x, zi + FORM_W + 0.9);
    return FORM_W + BATTER_RUN(Math.max(0.06, rise));
  };
  /**
   * The inner side's DRESSING datum — not the same thing as where the made ground
   * stops, and P15 TR3 is the round that separated them.
   *
   * With the lip retained the made ground now stops 0.35 m from it, so a datum
   * read off the face alone would move every inner family 2.1 m toward the
   * centreline. TR2's datum was the batter toe at local z 0.5, which was already
   * wrong for a different reason: the pier pads reach z 2.2, so hedges were being
   * planted at z −1.9 and the boundary fence at −4.5 with the pads between them.
   * The datum is now whichever is further out — the batter toe where the lip is
   * battered, and the far side of the viaduct's deck band where it is retained —
   * so nothing this function places can stand on the structure.
   */
  const inToeOff = (x) => {
    if (!FORM) return -8;
    const zi = FORM_ZIN;
    const rise = FORM.crownAt(x) - groundLocal(x, zi - 0.9);
    if (rise <= 0.06) return -0.9;
    const face = innerRetained(x) ? -0.35 : -BATTER_RUN(rise);
    return Math.min(face, -(FORM_ZIN + DECK_HALF));
  };

  if (FORM) {
    // Corridor boundary fence, both sides, outboard of the toes so no post stands
    // in a batter face or a carriageway.
    const posts = new BoxMerge();
    const wire = new BoxMerge();
    const n = Math.max(6, Math.round((FORM.x1 - FORM.x0) / 4.4));
    for (const side of [1, -1]) {
      let prev = null;
      for (let i = 0; i <= n; i += 1) {
        const t = i / n;
        const x = FORM.x0 + (FORM.x1 - FORM.x0) * t;
        const off = side > 0
          ? toeOff(x) + 2.1 + 0.55 * Math.sin(x * 0.09)
          // Symmetric with the outer run again. TR2 carried -5.0 here because its
          // datum was the batter toe at local z 0.5 and 2.1 m past that stood the
          // fence at z -1.6, inside the deck band. `inToeOff` now clears the deck
          // band itself, so the fence takes the same 2.1 m the outer side does and
          // lands at z -4.8 — where TR2's -5.0 was aiming.
          : inToeOff(x) - 2.1 - 0.55 * Math.sin(x * 0.07);
        const p = corrAt(t, off);
        const h = 1.28 + seedU(5200 + i * 13 + (side > 0 ? 0 : 55)) * 0.14;
        posts.box(0.14, h, 0.14, p.x, p.y + h * 0.5 - 0.05, p.z, (seedU(5600 + i * 7) - 0.5) * 0.12);
        if (prev) {
          const dx = p.x - prev.x;
          const dz = p.z - prev.z;
          const len = Math.hypot(dx, dz);
          const yaw = Math.atan2(-dz, dx);
          for (const hf of [0.92, 0.6, 0.3]) {
            wire.box(len, 0.05, 0.05, prev.x + dx * 0.5, (prev.y + p.y) * 0.5 + h * hf - 0.05,
              prev.z + dz * 0.5, yaw);
          }
        }
        prev = p;
      }
    }
    addMerged(root, posts, m.postTimber, { name: 'fringe:airport-link-fence' });
    addMerged(root, wire, m.fenceWire, { cast: false });
  }
  if (FORM) {
    // Materiel beside the access road: outboard of the outer toe, on the ring, and
    // at bay pitches that are not the pier pitch so it never repeats the columns.
    const stack = new BoxMerge();
    const stackAlt = new BoxMerge();
    const heap = new BoxMerge();
    const scrub = new BoxMerge();
    const scrubDry = new BoxMerge();
    const bayT = [0.10, 0.24, 0.44, 0.63, 0.88];
    const bayP = (i, extra = 0) => {
      const t = bayT[i % bayT.length];
      const x = FORM.x0 + (FORM.x1 - FORM.x0) * t;
      return corrAt(t, toeOff(x) + 3.2 + extra);
    };
    // sleeper stacks, crossed in courses — kept as the named family
    for (const bi of [0, 3]) {
      const b = bayP(bi);
      for (let c = 0; c < 5; c += 1) {
        for (let k = 0; k < 4; k += 1) {
          const cross = c % 2 === 0;
          const o = (k - 1.5) * 0.44;
          const bin = (c + k) % 3 === 0 ? stackAlt : stack;
          if (cross) bin.box(2.3, 0.2, 0.3, b.x, b.y + 0.12 + c * 0.21, b.z + o, 0.04);
          else bin.box(0.3, 0.2, 2.3, b.x + o, b.y + 0.12 + c * 0.21, b.z, -0.03);
        }
      }
    }
    {
      const b = bayP(2);
      for (let c = 0; c < 4; c += 1) {
        const r = 2.5 - c * 0.55;
        for (let k = 0; k < 6; k += 1) {
          const a = k * 1.047 + c * 0.4;
          heap.box(r * 0.85, 0.34, r * 0.8, b.x + Math.cos(a) * r * 0.32,
            b.y + 0.16 + c * 0.28, b.z + Math.sin(a) * r * 0.32, a);
        }
      }
    }
    for (const [bi, dx, r] of [[4, 0, 1.05], [4, 2.9, 0.8]]) {
      const b = bayP(bi, dx > 0 ? -0.7 : 0);
      addCyl(root, r, r, 0.34, 12, m.steelDark, b.x + dx, b.y + r, b.z, { rotZ: Math.PI / 2 });
      addCyl(root, r * 0.62, r * 0.62, 1.0, 12, m.drum, b.x + dx, b.y + r, b.z, { rotZ: Math.PI / 2 });
      addCyl(root, r, r, 0.34, 12, m.steelDark, b.x + dx + 0.98, b.y + r, b.z, { rotZ: Math.PI / 2 });
    }
    {
      const b = bayP(1, 1.4);
      addChamferBar(root, m.conc, 5.0, 4.0, 0.24, 0.09, b.x, b.y + 0.12, b.z, { cast: false });
      addChamferBar(root, m.hutWall, 3.4, 2.6, 2.5, 0.14, b.x, b.y + 1.45, b.z);
      addChamferBar(root, m.hutRoof, 3.8, 3.0, 0.24, 0.09, b.x, b.y + 2.78, b.z);
      addChamferBar(root, m.concDeep, 3.6, 2.8, 0.14, 0.05, b.x, b.y + 2.60, b.z, { cast: false });
      addBox(root, 0.9, 1.7, 0.12, m.dark, b.x + 0.6, b.y + 1.09, b.z - 1.34, { cast: false });
      addChamferBar(root, m.steelDark, 1.3, 0.9, 0.12, 0.04, b.x + 0.6, b.y + 0.30, b.z - 1.72, { cast: false });
      addChamferBar(root, m.hiVis, 1.1, 0.16, 0.5, 0.06, b.x - 1.2, b.y + 0.5, b.z - 1.5);
    }

    // Chain-link maintenance yard, now on the level pad benched off the formation
    // rather than on whatever the crust happened to be doing at mid-span. One
    // height for the whole compound, because a graded pad has one height.
    {
      const yx = yardSpot.ok ? yardSpot.x : (FORM.x0 + FORM.x1) * 0.5;
      const yz = yardSpot.ok ? yardSpot.z : -13.4;
      const yg = yardSpot.ok ? yardSpot.y : groundLocal(yx, yz);
      const yard = new THREE.Group();
      yard.name = 'fringe:airport-link-yard';
      yard.position.set(yx, yg, yz);
      // A gabled workshop with a ribbed roof, a siding with a buffer stop, stores and a chain-link
      // perimeter with a gate, from rail-link-models.js (about 1,600 triangles against 2,064).
      const yardModel = buildYard();
      addGeo(yard, yardModel.matte, m.vcMatte, 'fringe:airport-link-yard:shed');
      addGeo(yard, yardModel.steel, m.vcSteel, 'fringe:airport-link-yard:steel');
      addGeo(yard, yardModel.fence, m.vcChain, 'fringe:airport-link-yard:fence', { cast: false });
      root.add(yard);
    }

    /**
     * ── PLANTING BELTS: FOUR KINDS OF BOX BECOME FOUR KINDS OF PLANT ──
     *
     * All four species here were axis-aligned `BoxMerge` boxes: kind 0 a 0.7 m
     * cube with a smaller cube beside it, kind 1 a 1.6 x 1.05 x 1.45 slab balanced
     * on a 0.28 m post, kind 2 a 0.7 m cube on a 2.1 m stick, kind 3 a flat box on
     * the ground. On the r15 transport plate those are, in order: the pale cubes
     * scattered over the paddock, the green cubes on visible stalks, the green
     * cubes on taller stalks, and the olive cubes lying on the grass. Every one of
     * them is legible AS a cube, which is the whole of the blind round's finding.
     *
     * The kinds keep their sizes and their roles — a low bushy mass, a small tree
     * with a clear stem, a taller narrow tree, a ground-hugging shrub — and are
     * rebuilt as offset lobes on tapered stems. Two merges rather than four,
     * because the tone that used to be carried by four materials is now a vertex
     * attribute, and one contact merge under the lot.
     */
    const plantLobe = new LobeMerge();
    const plantLobeAlt = new LobeMerge();
    const beltContact = new ContactMerge({ groundAt: groundLocal, lift: 0.04 });
    for (let i = 0; i < 78; i += 1) {
      const u = seedU(6100 + i * 17);
      const v = seedU(6700 + i * 23);
      const w = seedU(7300 + i * 29);
      if (u < 0.16) continue;
      const t = v;
      const x = FORM.x0 + (FORM.x1 - FORM.x0) * t;
      const outer = w > 0.5;
      const off = outer
        ? toeOff(x) + 4.4 + u * 7.0 + Math.sin(i * 1.7) * 1.6
        : inToeOff(x) - 4.4 - u * 7.0 - Math.sin(i * 1.7) * 1.6;
      const p = corrAt(t, off);
      const g = p.y;
      const kind = Math.floor(u * 4);
      // Alternate bins so neighbours in the row do not share a base tone.
      const bin = i % 3 === 1 ? plantLobeAlt : plantLobe;
      const yaw = u * Math.PI * 2 + v * 1.3;
      let patch = 0.7;
      if (kind === 0) {
        // Low bushy mass, no clear stem: three lobes crowded at the ground.
        const h = 0.55 + v * 0.9;
        const r = 0.42 + w * 0.30;
        for (let k = 0; k < 3; k += 1) {
          const a = yaw + (k / 3) * Math.PI * 2;
          const rad = r * (0.34 + seedU(7900 + i * 13 + k * 5) * 0.44);
          bin.lobe(p.x + Math.cos(a) * rad, g + h * (0.42 + k * 0.16),
            p.z + Math.sin(a) * rad, r * (0.68 + seedU(8100 + i * 17 + k * 7) * 0.32),
            0.88, 0.86 + seedU(8300 + i * 19 + k * 11) * 0.32, 5, 3);
        }
        patch = r + 0.34;
      } else if (kind === 1) {
        // Small tree with a clear stem and a broad low crown.
        const h = 1.4 + v * 1.1;
        const r = 0.72 + w * 0.28;
        const fork = g + h * 0.62;
        bin.stem(p.x, g - 0.08, p.z, (v - 0.5) * 0.14, fork, (w - 0.5) * 0.14, 0.16, 0.10);
        for (let k = 0; k < 4; k += 1) {
          const a = yaw + (k / 4) * Math.PI * 2 + w * 0.7;
          const rad = r * (0.40 + seedU(8500 + i * 13 + k * 5) * 0.52);
          const lx = p.x + Math.cos(a) * rad;
          const lz = p.z + Math.sin(a) * rad;
          const ly = fork + h * (0.16 + seedU(8700 + i * 17 + k * 7) * 0.22);
          if (k < 2) bin.stem(p.x, fork - 0.03, p.z, lx - p.x, ly - 0.10, lz - p.z, 0.09, 0.04);
          bin.lobe(lx, ly, lz, r * (0.46 + seedU(8900 + i * 19 + k * 11) * 0.26),
            0.66 + seedU(9100 + i * 23 + k * 13) * 0.22,
            0.86 + seedU(9300 + i * 29 + k * 17) * 0.34, 5, 3);
        }
        patch = r + 0.40;
      } else if (kind === 2) {
        // Taller, narrower tree: a real bole and a tight crown at the top.
        const h = 2.1 + w * 1.4;
        const r = 0.46 + v * 0.22;
        const fork = g + h * 0.70;
        bin.stem(p.x, g - 0.08, p.z, (u - 0.5) * 0.16, fork, (v - 0.5) * 0.16, 0.17, 0.09);
        for (let k = 0; k < 3; k += 1) {
          const a = yaw + (k / 3) * Math.PI * 2 + v * 1.1;
          const rad = r * (0.30 + seedU(9500 + i * 13 + k * 5) * 0.46);
          const lx = p.x + Math.cos(a) * rad;
          const lz = p.z + Math.sin(a) * rad;
          const ly = fork + h * (0.10 + seedU(9700 + i * 17 + k * 7) * 0.20);
          if (k < 2) bin.stem(p.x, fork - 0.03, p.z, lx - p.x, ly - 0.08, lz - p.z, 0.075, 0.035);
          bin.lobe(lx, ly, lz, r * (0.58 + seedU(9900 + i * 19 + k * 11) * 0.30),
            0.92 + seedU(10100 + i * 23 + k * 13) * 0.24,
            0.84 + seedU(10300 + i * 29 + k * 17) * 0.36, 5, 3);
        }
        patch = r + 0.36;
      } else {
        // Ground-hugging shrub: two flat lobes, no stem.
        const h = 0.4 + u * 0.55;
        const r = 0.48 + v * 0.26;
        for (let k = 0; k < 2; k += 1) {
          const a = yaw + k * 2.4;
          const rad = r * (0.26 + seedU(10500 + i * 13 + k * 5) * 0.34);
          bin.lobe(p.x + Math.cos(a) * rad, g + h * (0.46 + k * 0.14),
            p.z + Math.sin(a) * rad, r * (0.74 + seedU(10700 + i * 17 + k * 7) * 0.26),
            0.56, 0.80 + seedU(10900 + i * 19 + k * 11) * 0.30, 5, 3);
        }
        patch = r + 0.30;
      }
      beltContact.disc(p.x, p.z, patch * 0.92, 0.82, 6, yaw);
    }
    // T10: the belts cast too. They have carried `cast: false` since TR2, when they
    // were boxes on sticks; they are lobed canopies on forked stems now, and a
    // canopy with no shadow is the "floating" read the board round reported.
    addMerged(root, plantLobe, m.plantLobe, { name: 'fringe:airport-link-belt-a' });
    addMerged(root, plantLobeAlt, m.plantLobeAlt, {});
    const beltContactMesh = addMerged(root, beltContact, contactMaterial(),
      { cast: false, receive: false, name: 'fringe:airport-link-belt-contact' });
    if (beltContactMesh) beltContactMesh.renderOrder = -12;
    addMerged(root, stack, m.sleeper, { name: 'fringe:airport-link-sleeper-stack' });
    addMerged(root, stackAlt, m.sleeperWorn);
    addMerged(root, heap, m.ballast);
    addMerged(root, scrub, m.scrub, { cast: false });
    addMerged(root, scrubDry, m.scrubDry, { cast: false });

    // Noise walls on the crest of the inner retaining lip, city side, over the
    // station third. On the formation, so they stand on made ground like the road.
    {
      const walls = new BoxMerge();
      const caps = new BoxMerge();
      const nW = 9;
      for (let i = 0; i < nW; i += 1) {
        const t = 0.60 + (i / (nW - 1)) * 0.36;
        const u = seedU(9900 + i * 11);
        const h = 2.4 + u * 0.7;
        const p = corrAt(t, 0.48 + (u - 0.5) * 0.25);
        walls.box(2.15, h, 0.18, p.x, p.y + h * 0.5, p.z);
        caps.box(2.25, 0.12, 0.28, p.x, p.y + h + 0.04, p.z);
      }
      addMerged(root, walls, m.noise, { name: 'fringe:airport-link-noise-wall' });
      addMerged(root, caps, m.noiseCap, { cast: false });
    }

    // Pedestrian overbridge spanning the deck. Its feet take `surfaceAt`, so each
    // one lands on whichever of formation, batter or ring is actually under it.
    {
      const bx = FORM.x0 + (FORM.x1 - FORM.x0) * 0.80;
      const gL = surfaceAt(bx, 6.8);
      const gR = surfaceAt(bx, -6.8);
      addChamferBar(root, m.conc, 0.7, 2.2, yDeck + 1.6 - gL, 0.14, bx, (yDeck + 1.6 + gL) * 0.5, 6.4);
      addChamferBar(root, m.conc, 0.7, 2.2, yDeck + 1.6 - gR, 0.14, bx, (yDeck + 1.6 + gR) * 0.5, -6.4);
      addChamferBar(root, m.conc, 0.9, 13.2, 0.28, 0.1, bx, yDeck + 1.72, 0, { rotY: Math.PI / 2 });
      addChamferBar(root, m.steelDark, 0.12, 13.0, 0.85, 0.04, bx, yDeck + 2.2, 0.95, { rotY: Math.PI / 2 });
      addChamferBar(root, m.steelDark, 0.12, 13.0, 0.85, 0.04, bx, yDeck + 2.2, -0.95, { rotY: Math.PI / 2 });
      const steps = new BoxMerge();
      for (let k = 0; k < 8; k += 1) {
        const t = (k + 0.5) / 8;
        steps.box(1.6, 0.16, 0.85, bx + 1.1, gL + (yDeck + 1.55 - gL) * t, 6.4 - t * 2.4);
        steps.box(1.6, 0.16, 0.85, bx - 1.1, gR + (yDeck + 1.55 - gR) * t, -6.4 + t * 2.4);
      }
      addMerged(root, steps, m.concDeep, { name: 'fringe:airport-link-overbridge' });
    }
    // Signage gantries over the deck.
    for (const [gx, label] of [[corr.x0 + (corr.x1 - corr.x0) * 0.22, 0], [corr.x0 + (corr.x1 - corr.x0) * 0.48, 1]]) {
      addChamferBar(root, m.gantry, 0.22, 0.22, 4.6, 0.06, gx, DECK_TOP + 2.4, 2.35);
      addChamferBar(root, m.gantry, 0.22, 0.22, 4.6, 0.06, gx, DECK_TOP + 2.4, -2.35);
      addChamferBar(root, m.gantry, 0.22, 5.1, 0.22, 0.06, gx, DECK_TOP + 4.85, 0, { rotY: Math.PI / 2 });
      addChamferBar(root, m.gantrySign, 0.16, 3.4, 0.9, 0.05, gx, DECK_TOP + 4.35, 0, {
        rotY: Math.PI / 2,
        name: label ? 'fringe:airport-link-gantry:city' : 'fringe:airport-link-gantry:air',
      });
      addChamferBar(root, m.warning, 0.08, 1.1, 0.22, 0.03, gx, DECK_TOP + 4.05, 0, { rotY: Math.PI / 2, cast: false });
    }

    // Two service vehicles ON the carriageway — on the two running lines the ruts
    // mark, at the crown height, headed along the alignment rather than along the
    // pier line, because the alignment is what curves.
    {
      const fleet = transitMats();
      const yawAt = (t) => {
        const xa = FORM.x0 + (FORM.x1 - FORM.x0) * Math.max(0, t - 0.03);
        const xb = FORM.x0 + (FORM.x1 - FORM.x0) * Math.min(1, t + 0.03);
        return Math.atan2(-(FORM_ZIN - FORM_ZIN), xb - xa);
      };
      const park = (name, t, off, back) => {
        const g = new THREE.Group();
        addServiceUte(g, fleet, name);
        const p = corrAt(t, off);
        g.position.set(p.x, FORM.sectY(p.x, off) + 0.11, p.z);
        g.rotation.y = yawAt(t) + (back ? Math.PI : 0) + (back ? 0.14 : -0.06);
        noPick(g);
        root.add(g);
      };
      park('fringe:airport-link-ute:0', 0.20, 6.05, false);
      park('fringe:airport-link-ute:1', 0.90, 8.95, true);
    }
  }

  // --- the paddock the link crosses ---------------------------------------
  //
  // P15-TR2 item 3. With the formation built, the corridor still crosses open
  // country, and the knoll under the deck is now the only place in the frame
  // where the ring shows between the two slabs — which is correct, because it is
  // a hill, but a bare hill is still a void. It becomes farmland: two paddocks at
  // different tones either side of the link, hedged on their boundaries, with a
  // farm track ducking under the viaduct between them, a dam in the hollow and a
  // windbreak row on the exposed side. All of it on `groundAt`, none of it inside
  // the formation's own footprint.
  if (FORM) {
    const fieldA = new StripMerge();
    const fieldB = new StripMerge();
    const track = new StripMerge();
    // taste W33 (TRACK_KIN): the farm track as the hinterland's formed track, in runs (it breaks under the deck); off, the flat ribbon.
    const trackKin = TRACK_KIN_AIRPORT && trackKinActive(); // off: the line crosses the link road (track-form.js)
    const trackRuns = [];
    const bank = new BoxMerge();
    const windLobe = new LobeMerge();
    /**
     * Where paddock dressing may stand: off the formation, and inside the ring.
     *
     * The z bound is not decoration. This frame's origin is world (-20, 0, 136)
     * with seaward = -x, so local z = -20 IS the board's own edge at world x = 0,
     * and the crust flattens to 0.02 m from local z -17 inward because that is the
     * board apron. Hedges, a windbreak and a farm track authored at local z -19 to
     * -24 would have stood ON the city. -16 keeps every one of them at least 4 m
     * clear of the board; +42 keeps the far paddock inside the ring this lane can
     * see rather than scattered across the annulus T6 owns.
     */
    const clear = (x, z) => formSurface(x, z) === null && z > -16 && z < 42;
    // W7-C: crop paddock tint and rows start 26 m from the city edge (local z -20), so the
    // tray verge and its 20 m blend stay clear; only the far paddock (z > 6) is cropped.
    const CROP_Z0 = 6;
    const cropClear = (x, z) => clear(x, z) && z >= CROP_Z0;
    // Field tint, as pads whose FOUR CORNERS are sampled. A pad held at one
    // height is the decal fault at a smaller scale: measured, a 4.8 m pad seated
    // on its centre strayed 3.28 m from the crust on the knoll's flank. Corner
    // sampling and a 3.2 m pad keep the worst mid-edge sag under 0.2 m.
    for (let i = 0; i < 260; i += 1) {
      const u = seedU(11000 + i * 13);
      const v = seedU(11700 + i * 29);
      const w = seedU(12300 + i * 17);
      const x = FORM.x0 - 6 + (FORM.x1 - FORM.x0 + 12) * u;
      // W7-C: both tints now sit on the far side; the inner side is inside the 26 m the tray
      // edge keeps clear, so the second tint (fieldB) is the far paddock's stubble band.
      const side = 1;
      const z = side > 0
        ? FORM_ZIN + toeOff(x) + 3.0 + v * 20
        // TR3: the datum moved 3.2 m outboard when it started clearing the deck
        // band, so the near edge and the depth come in by the same amount — the
        // tint band covers the ground it covered before, not 3 m of new annulus
        // past `clear`'s own z > -16 bound.
        : FORM_ZIN + inToeOff(x) - 1.6 - v * 11;
      if (!cropClear(x, z)) continue;
      const bin = w > 0.46 ? fieldB : fieldA;
      const s = 1.2 + w * 0.9;
      const gy = (px, pz) => groundLocal(px, pz) + 0.055;
      if (!cropClear(x - s, z - s) || !cropClear(x + s, z + s)) continue;
      bin.quad([x - s, gy(x - s, z - s), z - s], [x + s, gy(x + s, z - s), z - s],
        [x + s, gy(x + s, z + s), z + s], [x - s, gy(x - s, z + s), z + s]);
    }
    /**
     * ── T10: THE PADDOCK WAS TINT PADS, AND A TINT PAD HAS NO SECTION ──
     *
     * The two field tints above are flat quads laid on `groundAt` at +0.055, and
     * on the graded plate they are exactly what the board round called "albedo-only
     * kitbash blocks": colour with no lit face and no shade face. The ring's own
     * answer to the same fault is crop rows, and the same argument holds here at a
     * smaller scale — the corridor is the only worked country the transport plate
     * frames at all. (Measured, and it is worth recording: over a 14,866-sample
     * projection of that plate onto the ring, ZERO samples pass the hinterland's
     * worked-ground gate. The plate's big olive plane is the harbour sector, mean
     * waterness 1.000, so the ring's crop rows can never reach this frame. What
     * can is this paddock.)
     *
     * Rows run ACROSS the corridor, which is roughly across the view at the locked
     * pose, so each ridge presents one lit flank and one shaded one. 1.6 m pitch
     * and a 0.24 m rise: at this pose the corridor renders about 5.8 px/m, so a
     * cycle is nine pixels and a flank is four — the smallest mark that still has
     * two values in it.
     *
     * Two quads a ridge segment, normals per quad (`StripMerge` computes them and
     * flips them up), so the shading is the geometry's and not a painted gradient.
     */
    const furrowLit = new StripMerge();
    const furrowShade = new StripMerge();
    {
      const PITCH = 1.6;
      const RISE = 0.24;
      const STEP = 2.6;
      for (let x = FORM.x0 - 4; x <= FORM.x1 + 4; x += PITCH) {
        for (const side of [1, -1]) {
          // Two paddocks: the near one is stubble (shallower rows), the far one is
          // standing crop. Alternating means alternating, so only the far paddock
          // and every third row of the near one are drilled.
          // W7-C: the far paddock is the only cropped ground now, so it is drilled as standing
          // crop: every second row at full rise.
          const rise = side > 0 ? RISE * 0.8 : RISE;
          if (side > 0 && Math.round((x - FORM.x0) / PITCH) % 2 !== 0) continue;
          const z0 = side > 0
            ? FORM_ZIN + toeOff(x) + 3.4
            : FORM_ZIN + inToeOff(x) - 12.4;
          const z1 = side > 0
            ? FORM_ZIN + toeOff(x) + 21.0
            : FORM_ZIN + inToeOff(x) - 2.0;
          let prev = null;
          for (let z = z0; z <= z1 + 0.01; z += STEP) {
            const ok = cropClear(x, z) && cropClear(x - PITCH * 0.42, z) && cropClear(x + PITCH * 0.42, z);
            const cur = ok ? { z, gy: groundLocal(x, z) } : null;
            if (prev && cur) {
              const w = PITCH * 0.42;
              const la = [x - w, groundLocal(x - w, prev.z) + 0.03, prev.z];
              const lb = [x - w, groundLocal(x - w, cur.z) + 0.03, cur.z];
              const ca = [x, prev.gy + rise, prev.z];
              const cb = [x, cur.gy + rise, cur.z];
              const ra = [x + w, groundLocal(x + w, prev.z) + 0.03, prev.z];
              const rb = [x + w, groundLocal(x + w, cur.z) + 0.03, cur.z];
              // Local -x is the sun side of a row running across the corridor at
              // this frame's orientation, so the two flanks take the two
              // materials rather than one and a hope.
              furrowLit.quad(la, lb, cb, ca);
              furrowShade.quad(ca, cb, rb, ra);
            }
            prev = cur;
          }
        }
      }
    }

    /**
     * ── THE CORRIDOR'S HEDGES WERE A CHAIN OF CUBES, AND THE PLATE SAYS SO ──
     *
     * These four field divisions and the two fence-line runs below were built as
     * `BoxMerge.box()` per 8 m sample, with a per-sample `u < 0.12` dice roll
     * deciding whether each box existed. Crop `plates/r15/bd-transport-landmass.png`
     * at (500, 560) 360 x 200: a diagonal chain of axis-aligned green cubes with
     * lit top faces, each one visibly separate from the next, standing on ground
     * with no contact at all. That is the blind round's "cube-clump vegetation that
     * reads as unplaced primitives", and it is what the geometry was.
     *
     * A hedge is a CONTINUOUS clipped form, so it is built as one now: a polyline
     * through the run, a chamfered six-vertex section with a flat top, base corners
     * seated on their own ground. The gaps are AUTHORED — one gateway per run, at a
     * seeded position, which is a thing a real field boundary has — instead of a
     * per-sample roll that turns a 26 m run into three stubs. Where `clear()` fails
     * (the formation, the deck band) the polyline is cut and a new one started, so
     * the structure still breaks the run without leaving fragments.
     */
    const strip = new HedgeStrip({ width: 1.45, height: 1.55, groundAt: groundLocal });
    // One decal merge for the paddock: the hedge ribbons and the windbreak discs
    // share it, so the whole dressing costs one extra draw call rather than two.
    const stripContact = new ContactMerge({ groundAt: groundLocal, lift: 0.04 });
    const plantContact = stripContact;
    const layRun = (pts, gates) => {
      // Split the polyline at every gate and at every break in `clear()`.
      let cur = [];
      const flush = () => {
        /**
         * The floor is on LENGTH, not on station count, and the difference is not
         * academic: the four field divisions sample at 1.0 m along the outer side
         * and 0.54 m along the inner one, so a three-station floor passed a 1.6 m
         * fragment and the cube census caught it — one component at 2.3 m against
         * a 3 m line. 3.5 m of run, measured along the polyline.
         */
        let len = 0;
        for (let k = 1; k < cur.length; k += 1) {
          len += Math.hypot(cur[k].x - cur[k - 1].x, cur[k].z - cur[k - 1].z);
        }
        if (cur.length >= 3 && len >= 3.5) {
          strip.run(cur);
          stripContact.ribbon(cur, 1.45, 0.82);
        }
        cur = [];
      };
      for (let i = 0; i < pts.length; i += 1) {
        const t = i / Math.max(1, pts.length - 1);
        const atGate = gates.some((gt) => Math.abs(t - gt) < 0.055);
        if (!clear(pts[i].x, pts[i].z) || atGate) {
          flush();
          continue;
        }
        cur.push(pts[i]);
      }
      flush();
    };
    for (const [hi, side, tAt] of [[0, 1, 0.16], [1, 1, 0.62], [2, -1, 0.30], [3, -1, 0.78]]) {
      const x = FORM.x0 + (FORM.x1 - FORM.x0) * tAt;
      const zi = FORM_ZIN;
      const z0 = side > 0 ? zi + toeOff(x) + 2.4 : zi + inToeOff(x) - 2.4;
      const z1 = z0 + side * (side > 0 ? 26 : 14);
      const nH = 26;
      const pts = [];
      for (let k = 0; k < nH; k += 1) {
        const t = (k + 0.5) / nH;
        const u = seedU(13000 + hi * 97 + k * 11);
        pts.push({
          // A hedge wanders; it does not run true. The wander is the same seeded
          // number the old per-box jitter used, applied to the LINE instead.
          x: x + (u - 0.5) * 0.5,
          z: z0 + (z1 - z0) * t,
          h: 1.30 + u * 0.42,
        });
      }
      layRun(pts, [0.20 + seedU(13900 + hi * 31) * 0.55]);
    }
    // P15 TR3 item 4 — the hedgerow ALONG the fence line, which is the run the
    // paddock did not have. The four lines above are field divisions and they run
    // ACROSS the corridor; what a road through farmland actually carries is a
    // boundary hedge following the fence, and its absence is why the corridor's
    // two long fences read as bare post-and-wire against open ring for their whole
    // length. It is laid at the fence's own offset (`inToeOff`/`toeOff` plus the
    // same 2.1 m, so it tracks the fence when the toe moves rather than being
    // authored at a z of its own), set back 1.1 m on the field side so posts and
    // hedge are not in the same footprint, and broken in seeded gaps — a hedgerow
    // that runs unbroken for 39 m is one lambert ribbon again, in green.
    for (const side of [1, -1]) {
      const nR = 44;
      const pts = [];
      for (let k = 0; k < nR; k += 1) {
        const t = (k + 0.5) / nR;
        const x = FORM.x0 + (FORM.x1 - FORM.x0) * t;
        const u = seedU(16400 + (side > 0 ? 0 : 71) + k * 13);
        const v = seedU(17100 + (side > 0 ? 0 : 71) + k * 17);
        const off = side > 0
          ? toeOff(x) + 2.1 + 0.55 * Math.sin(x * 0.09) + 1.1 + v * 0.5
          : inToeOff(x) - 2.1 - 0.55 * Math.sin(x * 0.07) - 1.1 - v * 0.5;
        pts.push({ x, z: FORM_ZIN + off, h: 1.32 + u * 0.46 });
      }
      // TWO gates on a 39 m boundary run — a gateway and the stretch grubbed out
      // where the yard access crosses — instead of the old `u < 0.22` per-sample
      // roll, which deleted 22 % of the members at random interior positions and
      // was what actually fragmented the run.
      layRun(pts, [
        0.26 + seedU(18800 + (side > 0 ? 0 : 41)) * 0.20,
        0.66 + seedU(18900 + (side > 0 ? 0 : 41)) * 0.22,
      ]);
    }
    // Farm track: the way between the two paddocks, ducking under the deck.
    {
      const tx = FORM.x0 + (FORM.x1 - FORM.x0) * 0.47;
      let prev = null;
      let kinRun = null;
      for (let k = 0; k <= 26; k += 1) {
        const t = k / 26;
        const z = -15 + t * 40;
        const x = tx + Math.sin(t * 2.6) * 2.2;
        const cur = { x, z, ok: clear(x, z) };
        if (trackKin) {
          if (prev && prev.ok && cur.ok) {
            if (!kinRun) { kinRun = { pts: [[prev.x, prev.z]] }; trackRuns.push(kinRun); }
            kinRun.pts.push([cur.x, cur.z]);
          } else kinRun = null;
        } else if (prev && prev.ok && cur.ok) {
          const dx = cur.x - prev.x;
          const dz = cur.z - prev.z;
          const len = Math.hypot(dx, dz);
          const nx = -dz / len;
          const nz = dx / len;
          const hwid = 1.3;
          // Both edges sampled, not the centreline held flat across 2.6 m.
          const c = (px, pz, s) => [px + nx * hwid * s, groundLocal(px + nx * hwid * s, pz + nz * hwid * s) + 0.05, pz + nz * hwid * s];
          track.quad(
            c(prev.x, prev.z, 1), c(cur.x, cur.z, 1), c(cur.x, cur.z, -1), c(prev.x, prev.z, -1),
          );
        }
        prev = cur;
      }
    }
    // A dam in the hollow on the far side. W7-C: rebuilt as the hinterland dam is. The
    // water is one level plane coloured off the shared depth ramp (`waterRampHex`), set
    // inside a raised earth bank in the ground tone; the grey cylinder and the fourteen
    // brown boxes around it read as a trench. It moved to the far paddock so nothing
    // sits inside the 26 m the tray edge keeps clear.
    {
      const DAM_R = 5.4;
      const BANK_REACH = 3.6;
      const EXTENT = DAM_R + BANK_REACH + 0.5;
      const sites = [];
      for (let k = 0; k < 9; k += 1) {
        const t = 0.20 + k * 0.075;
        const cxx = FORM.x0 + (FORM.x1 - FORM.x0) * t;
        const czz = FORM_ZIN + toeOff(cxx) + 9.5 + EXTENT * 0.5;
        // The dam's own bound reaches to z 52: it is one landmark, not paddock dressing.
        const damClear = (x, z) => formSurface(x, z) === null && z >= CROP_Z0 && z < 52;
        const ok = [[0, 0], [EXTENT, 0], [-EXTENT, 0], [0, EXTENT], [0, -EXTENT]]
          .every(([ox, oz]) => damClear(cxx + ox, czz + oz));
        if (!ok) continue;
        let lo = 1e9;
        let hi = -1e9;
        for (const [ox, oz] of [[0, 0], [DAM_R, 0], [-DAM_R, 0], [0, DAM_R], [0, -DAM_R]]) {
          const g = groundLocal(cxx + ox, czz + oz);
          lo = Math.min(lo, g);
          hi = Math.max(hi, g);
        }
        sites.push({ x: cxx, z: czz, flat: hi - lo, mean: groundLocal(cxx, czz) });
      }
      sites.sort((a, b) => a.flat - b.flat);
      const site = sites[0];
      if (site && site.flat < 1.6) {
        const { x: dx, z: dz } = site;
        const SEG = 28;
        const edgeAt = (a) => DAM_R * (1 + 0.11 * Math.sin(3 * a + 0.7) + 0.06 * Math.sin(5 * a + 2.1));
        // Water level: the lowest rim ground, so the plane is in the hollow wherever it can be.
        let level = 1e9;
        for (let i = 0; i < SEG; i += 1) {
          const a = (i / SEG) * Math.PI * 2;
          level = Math.min(level, groundLocal(dx + Math.sin(a) * edgeAt(a), dz + Math.cos(a) * edgeAt(a)));
        }
        level -= 0.10;
        const tone = new THREE.Color();
        const wPos = [];
        const wCol = [];
        const wIdx = [];
        const WRINGS = [0, 0.45, 0.80, 1.0];
        const waterTone = (rho) => {
          // A 2 m bowl: water.mid at the centre falling to foam on the bank at the rim.
          const depth = 2.0 * Math.pow(Math.max(0, 1 - rho * rho), 0.8);
          tone.set(waterRampHex(depth));
          return tone.multiplyScalar(0.20);
        };
        wPos.push(dx, level + 0.02, dz);
        waterTone(0);
        wCol.push(tone.r, tone.g, tone.b);
        for (let i = 0; i <= SEG; i += 1) {
          const a = (i / SEG) * Math.PI * 2;
          for (let r = 1; r < WRINGS.length; r += 1) {
            const e = edgeAt(a) * WRINGS[r];
            wPos.push(dx + Math.sin(a) * e, level + 0.02, dz + Math.cos(a) * e);
            waterTone(WRINGS[r]);
            wCol.push(tone.r, tone.g, tone.b);
          }
        }
        const per = WRINGS.length - 1;
        for (let i = 0; i < SEG; i += 1) {
          wIdx.push(0, 1 + i * per, 1 + (i + 1) * per);
          for (let r = 0; r < per - 1; r += 1) {
            const a0 = 1 + i * per + r;
            const a1 = 1 + (i + 1) * per + r;
            wIdx.push(a0, a1 + 1, a1, a0, a0 + 1, a1 + 1);
          }
        }
        const wGeo = new THREE.BufferGeometry();
        wGeo.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
        wGeo.setAttribute('color', new THREE.Float32BufferAttribute(wCol, 3));
        wGeo.setIndex(wIdx);
        wGeo.computeVertexNormals();
        const wMat = new THREE.MeshStandardMaterial({
          vertexColors: true, roughness: 0.12, metalness: 0.30, envMapIntensity: 0.18,
          polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
        });
        wMat.name = 'airport-link-dam-water';
        wMat.userData.envIntensityBase = 0.10;
        const water = new THREE.Mesh(wGeo, wMat);
        water.name = 'fringe:airport-link-dam';
        water.castShadow = false;
        water.receiveShadow = false;
        water.userData.ownsGeometry = true;
        noPick(water);
        root.add(water);

        // Earth bank: inner lip at the water, crest 0.5 m above it (never below the ground
        // it stands on), outer foot buried 4 cm into the crust so it cannot float.
        const bPos = [];
        const bCol = [];
        const bIdx = [];
        const soil = new THREE.Color(tokBlend(TASTE.ground.soil, TASTE.ground.grassDry, 0.35));
        for (let i = 0; i <= SEG; i += 1) {
          const a = (i / SEG) * Math.PI * 2;
          const e = edgeAt(a);
          const sx = Math.sin(a);
          const cz = Math.cos(a);
          const crestG = groundLocal(dx + sx * (e + 1.2), dz + cz * (e + 1.2));
          const crest = Math.max(level + 0.5, crestG + 0.3);
          const fx = dx + sx * (e + BANK_REACH);
          const fz = dz + cz * (e + BANK_REACH);
          const foot = groundLocal(fx, fz) - 0.04;
          const v = seedU(14200 + i * 23);
          for (const [reach, y, shade] of [
            [0.0, level + 0.04, 0.80], [1.2, crest, 1.0], [BANK_REACH, Math.min(foot, crest), 0.90 + v * 0.1],
          ]) {
            bPos.push(dx + sx * (e + reach), y, dz + cz * (e + reach));
            tone.copy(soil).multiplyScalar(FARM_GAIN * shade);
            bCol.push(tone.r, tone.g, tone.b);
          }
        }
        for (let i = 0; i < SEG; i += 1) {
          for (let r = 0; r < 2; r += 1) {
            const a0 = i * 3 + r;
            const a1 = (i + 1) * 3 + r;
            bIdx.push(a0, a0 + 1, a1 + 1, a0, a1 + 1, a1);
          }
        }
        const bGeo = new THREE.BufferGeometry();
        bGeo.setAttribute('position', new THREE.Float32BufferAttribute(bPos, 3));
        bGeo.setAttribute('color', new THREE.Float32BufferAttribute(bCol, 3));
        bGeo.setIndex(bIdx);
        bGeo.computeVertexNormals();
        const bMat = applyGroundShadowFloor(new THREE.MeshStandardMaterial({
          vertexColors: true, roughness: 0.97, metalness: 0.02, side: THREE.DoubleSide,
        }));
        const bankMesh = new THREE.Mesh(bGeo, bMat);
        bankMesh.name = 'fringe:airport-link-dam-bank';
        bankMesh.castShadow = false;
        bankMesh.receiveShadow = true;
        bankMesh.userData.ownsGeometry = true;
        noPick(bankMesh);
        root.add(bankMesh);
      }
    }
    /**
     * Windbreak: one ragged row on the exposed side of the far paddock. Was a box
     * on a box — a 1.5 x 1.4 m cube of "canopy" balanced on a 0.3 m stick, which
     * at this pose is the "green cube on a trunk" the transport plate shows beside
     * the hedge chain. It is now three or four offset lobes on a forked stem, the
     * same idiom as the ring's trees, with a contact disc under each.
     */
    for (let k = 0; k < 16; k += 1) {
      const u = seedU(15000 + k * 19);
      const t = (k + 0.5) / 16;
      const x = FORM.x0 - 4 + (FORM.x1 - FORM.x0 + 8) * t;
      const z = FORM_ZIN + inToeOff(x) - 8.6 - u * 2.2;
      if (!clear(x, z)) continue;
      if (u < 0.14) continue;
      const g = groundLocal(x, z);
      const h = 2.6 + u * 2.0;
      const v = seedU(15600 + k * 23);
      const w = seedU(15900 + k * 29);
      const yaw = u * Math.PI * 2;
      const fork = g + h * 0.44;
      windLobe.stem(x, g - 0.08, z, (v - 0.5) * 0.22, fork, (w - 0.5) * 0.22, 0.20, 0.13);
      // Two limbs out of the fork, each ending inside a lobe.
      const lobeN = 3 + (u > 0.62 ? 1 : 0);
      const spread = 0.78 + v * 0.42;
      for (let i = 0; i < lobeN; i += 1) {
        const a = yaw + (i / lobeN) * Math.PI * 2 + w * 0.9;
        const rad = spread * (0.42 + seedU(16000 + k * 31 + i * 7) * 0.62);
        const lx = x + Math.cos(a) * rad;
        const lz = z + Math.sin(a) * rad;
        const ly = fork + h * (0.20 + seedU(16100 + k * 37 + i * 11) * 0.26);
        if (i < 2) {
          windLobe.stem(x, fork - 0.04, z, lx - x, ly - 0.12, lz - z, 0.115, 0.05);
        }
        windLobe.lobe(lx, ly, lz, spread * (0.52 + seedU(16200 + k * 41 + i * 13) * 0.34),
          0.80 + seedU(16300 + k * 43 + i * 17) * 0.24,
          0.88 + seedU(16350 + k * 47 + i * 19) * 0.30, 5, 3);
      }
      plantContact.disc(x, z, spread * 0.95 + 0.28, 0.82, 6, yaw);
    }
    addMerged(root, fieldA, m.fieldA, { cast: false, name: 'fringe:airport-link-paddock-a' });
    addMerged(root, fieldB, m.fieldB, { cast: false, name: 'fringe:airport-link-paddock-b' });
    // The rows wear the far paddock's own tint, so the relief cannot disagree with
    // the colour of the ground it is relief ON. `cast: false` — a 0.24 m ridge
    // throws nothing at this sun angle and would only spend shadow texels.
    addMerged(root, furrowLit, m.cropLit, { cast: false, name: 'fringe:airport-link-crop-rows' });
    addMerged(root, furrowShade, m.cropShade, { cast: false, name: 'fringe:airport-link-crop-rows-shade' });
    addMerged(root, track, m.farmTrack, { cast: false, name: 'fringe:airport-link-farm-track' });
    if (trackKin) {
      // The ribbon was 2.6 m wide, on the ground plus 0.05 m: the form is scaled to 1.3 m a side and lifted the same 0.05 m, in the paddocks' dimmed tokens.
      const kin = makeTrackKinMesh(trackRuns, {
        seed: plan?.seed ?? 0, sampleGround: groundLocal, gain: FARM_GAIN, tint: [1, 1, 1], halfWidth: 1.3, lift: 0.05, line0: 11,
      });
      if (kin) { kin.name = 'fringe:airport-link-farm-track'; noPick(kin); root.add(kin); }
    }
    // `fringe:airport-link-hedge` is the CONTINUOUS strip now. The name survives
    // because every p15-transport pin that reads it — the deck-band exclusion, the
    // float floor and ceiling, the footprint gap — is a question about where the
    // hedge is, and those all still have an answer; only its section changed.
    /**
     * ── THE CORRIDOR PLANTING CASTS AGAIN (T10), AND THE T9 NUMBERS STILL STAND ──
     *
     * T9 set `cast: false` here after attributing the corridor's near-black with
     * the harness's own toggles, on `plates/T9-wip/_diag-*`, over the 4,146 px the
     * corridor window renders under luma 55:
     *
     *   r15                    69.7
     *   T9 as first shipped    23.1
     *   T9, decals hidden      27.5   -> the contact decals are 4.4 of the drop
     *   T9, veg shadows off    71.7   -> the cast shadows are 48.6 of it
     *
     * Those measurements are not being overturned; what they were measured ON has
     * changed. The orchestrator's crust toggle at 18:40Z 09-04 put shadowed crust
     * at 0.70-0.74 of unshadowed at this very pose (corridor 78.7 vs 113.2), i.e.
     * a shadow with a floor, and the 23.1 T9 read was the crust's OLD albedo plus
     * the road map under a shadow, not the shadow alone. Turning the shadows off
     * left a corridor whose hedges and windbreak lie on the paddock with nothing
     * between them and it — which is the fault the board round then named.
     *
     * So they cast, the decals stay underneath, and the T10 receipt is the same
     * instrument in the other direction: the darkest shadowed crust pixel in the
     * hinterland band against its own value with the vegetation's shadows toggled
     * off. Anything under 0.55 there is a crushed pass and this flag goes back.
     */
    addMerged(root, strip, m.hedgeStrip, { name: 'fringe:airport-link-hedge' });
    addMerged(root, bank, m.damBank, { cast: false });
    addMerged(root, windLobe, m.plantLobe, { name: 'fringe:airport-link-windbreak' });
    const stripContactMesh = addMerged(root, stripContact, contactMaterial(),
      { cast: false, receive: false, name: 'fringe:airport-link-hedge-contact' });
    if (stripContactMesh) stripContactMesh.renderOrder = -12;
  }

  // The shuttle: one two-car light metro unit parked at the platform, y = 0 at the rail head. The group
  // keeps its name, and the body mesh keeps the name the pick target and the tests look for.
  const shuttle = new THREE.Group();
  shuttle.name = 'fringe:airport-link-shuttle';
  const shuttleModel = buildShuttle({ contactY: CONTACT_Y - RAIL_TOP });
  const shuttleBody = addGeo(shuttle, shuttleModel.body, m.vcMatte, 'fringe:airport-link-shuttle:body');
  shuttleBody.userData.captureTarget = false;
  shuttleBody.userData.windowSquaresPerSide = 9;
  addGeo(shuttle, shuttleModel.steel, m.vcSteel, 'fringe:airport-link-shuttle-roof');
  const shuttleHero = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 8), m.blue);
  shuttleHero.name = 'fringe:airport-link-shuttle-hero';
  shuttleHero.position.set(0, 3.15, 0);
  shuttleHero.visible = false;
  shuttleHero.castShadow = false;
  shuttleHero.userData.captureTarget = true;
  noPick(shuttleHero);
  shuttle.add(shuttleHero);
  shuttle.userData.windowSquares = { east: 9, west: 9 };
  // Centred under the canopy, which starts 5.1 m inside the platform's west end and stops 0.4 m short of the east.
  const SHUTTLE_X = (PLATFORM_X[0] + 5.1 + PLATFORM_X[1] - 0.4) * 0.5;
  shuttle.position.set(SHUTTLE_X, RAIL_TOP, 0);
  noPick(shuttle);
  root.add(shuttle);

  // --- the rail embankment -------------------------------------------------
  //
  // A raised bank with 1:2 batters and a berm, 4 m over the crust, carrying one ballasted siding that ends in
  // buffer stops; a cess drain and a post-and-wire fence on each toe. It stands beyond the paddock hedge
  // (local z 58) and clear of the airport tray (local x < -10.7), so it meets none of the corridor's made
  // ground, and its toes are sampled on the live crust.
  {
    const bank = buildEmbankment({ x0: 1, x1: 57, zc: 58, height: 4.0, groundAt: groundLocal });
    addGeo(root, bank.matte, m.vcMatte, 'fringe:airport-link-embankment');
    addGeo(root, bank.steel, m.vcSteel, 'fringe:airport-link-embankment-track');
    addGeo(root, bank.fence, m.vcSteel, 'fringe:airport-link-embankment-fence', { cast: false });
  }

  root.userData.span = span;
  // taste W35: the formation's footprint as a test in the parent's x, z (road, kerbs, drains, shoulder and batters: what `clear()` drops), for
  // the farm gateway track, which crosses it; farm.js breaks the track's runs there. False everywhere with no formation.
  root.userData.formFootprint = (wx, wz) => {
    const dx = wx - frame.origin.x;
    const dz = wz - frame.origin.z;
    return formSurface(frame.along.x * dx + frame.along.z * dz, frame.seaward.x * dx + frame.seaward.z * dz) !== null;
  };
  root.visible = false;
  return root;
}

export function updateRailLink(group, dt, elapsed, reducedMotion) {
  const shuttle = group?.userData?.shuttle;
  if (!shuttle) return;
  // This is the upgrade hero, parked where its dedicated framing target lives.
  shuttle.position.x = group.userData.shuttleX ?? shuttle.position.x;
  void dt;
  void elapsed;
  void reducedMotion;
}
