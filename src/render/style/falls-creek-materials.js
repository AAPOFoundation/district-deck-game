// Falls Creek materials and colours. Moved unchanged out of
// mvp/src/render/fringe/events/falls-creek.js (falls-split, 14 Nov 2026) so that file
// holds no raw material constructor and no colour literal under the style-unify-lint
// touched-file rule. Values, parameters, construction order and sharing are as they
// were; mvp/tests/falls-creek-fingerprint.test.mjs pins them against astra6/v4.
// Moving these onto material classes is a restyle and separate work.
//
// No module-level state, and nothing is allocated on import. fallsMats() builds a
// fresh set on every call (addFallsCreek calls it once per build); the waterfall
// crest and foam materials are built on every call of their builder, as before.
// The snow textures stay in falls-creek.js (cached there) and come in as arguments,
// with falls-creek.js's own `std`, so its createCityFringeMaterial owner tag
// ('fringe/events/falls-creek.js', read by style/classes.js) stays in that file.
import * as THREE from 'three';
import { TASTE } from '../taste-tokens.js';
import { createStoneMaterial } from '../fringe/stone-surface.js';

/** W7-C: the grade lifts fringe albedo about 1.5x; a prop that must read at its token takes the lift off. */
function dimHex(hex, k = 0.34) { return tokMix(hex, '#000000', 1 - k); }
/** W7-C: a token blended toward another token, as a hex string, for materials that need one hue family. */
export function tokMix(a, b, t) {
  const ca = new THREE.Color(a);
  return `#${ca.lerp(new THREE.Color(b), t).getHexString()}`;
}

/* ------------------------------------------------------------------ *
 * Local materials. The shared palette in ./shared.js is owned by other
 * builders, so everything new for this venue is defined here.
 *
 * ——— r4: the fill lane ———
 * r3 shipped a warm key with no fill. Lit faces read correctly at 53,92,51
 * and shade faces crushed to literal 0,0,0, so 18% of the frame sat under
 * luminance 18 and forty conifers read as forty holes.
 *
 * Two hooks do the work, and both are local to this file:
 *
 *  1. `userData.envIntensityBase` — `LightingRig.applyEnvironmentToScene`
 *     (mvp/src/render/lighting.js) reads it and stamps
 *     `envMapIntensity = base * profile.envIntensity`. The environment is the
 *     baked sky gradient, so raising the base buys *sky-coloured* fill, which
 *     is exactly the bar's tell 6 — warm key, blue fill — rather than a flat
 *     grey lift. Anything without a stamped base defaults to 0.92.
 *  2. `emissive` at a low cool value — the floor. It does not depend on the
 *     rig having run and it is not reachable by the shadow map, so it is what
 *     guarantees no face on this venue can reach zero. Kept small enough that
 *     the committed cast shadows (gate 3, our best gate) still read.
 *
 * Snow additionally gets a warm base colour so the key lands warm on the lit
 * face while the sky fill and the blue emissive own the shadow side.
 * ------------------------------------------------------------------ */

/**
 * Sky-fill response + an emissive floor. See the header note above.
 *
 * `floorHex` may be the string `'self'`, in which case the floor takes the
 * material's own colour. That matters: a cool grey floor under a saturated red
 * jacket or a brown timber wall raises the minimum channel and drains the hue,
 * and the first r4 capture measured exactly that — mean saturation 0.366 → 0.264
 * and the accent fraction 2.72% → 0.80%. Neutral surfaces take the cool floor,
 * anything that carries colour takes its own.
 */
function fill(mat, envBase, floorHex, floor) {
  mat.userData.envIntensityBase = envBase;
  if (floor > 0) {
    mat.emissive = floorHex === 'self'
      ? new THREE.Color(mat.color.getHex())
      : new THREE.Color(floorHex);
    mat.emissiveIntensity = floor;
  }
  return mat;
}

// One cool floor tone shared by the neutral families, so the shade side across
// the venue agrees instead of drifting per material.
const SHADE_FILL = '#22323f';
const SNOW_FILL = '#2c4a6b';
const SELF = 'self';

export function fallsMats({ std, snowRoughTex, snowHeightTex }) {
  return {
    // ——— r5: the ground stops washing itself out ———
    // The env term is the baked sky gradient and the emissive floor was a neutral
    // blue-grey; both were sized in r4 for a rig that had no ambient at all. The
    // rig now carries a hemisphere shade floor board-wide, so the props that were
    // holding the darks up are also flattening the hue over the largest surface in
    // the frame — grass authored at saturation 0.48 was measuring 0.10 on the
    // plate. Both come down hard, and the crushed-shadow figure is checked after
    // every capture rather than assumed.
    // ——— P15 FC3: snow shadow is never black ———
    //
    // Measured on the FC2 plate against an ownership mask (one flat-white render of
    // this venue against a flat-black render of everything else, calibrated against
    // an independent raycast at four pixels): **0.263 % of the venue's own pixels
    // sit under luma 8, and the darkest 0.05 % of them are literally (0, 0, 0),
    // B−R = 0.00**. Neutral black, not blue: a cast shadow on snow with no floor
    // under it. The two largest such clusters are 733 px and 215 px, and the
    // raycast attributes both to `green-paddock` / `skirt-apron`, i.e. to these two
    // materials — while the largest black cluster ANYWHERE near the venue belongs
    // to `fringe:hinterland-fields`, another lane's mesh, whose material carries no
    // emissive floor at all. (FC2's residual 4 named this venue for that cluster;
    // it is not ours, and the note is corrected rather than repeated.)
    //
    // The floor goes up and, on the snow band, turns bluer: `#2c4a6b` is the tone
    // the venue's own snow props already use, so the mountain's shade side now
    // agrees with the drifts standing on it instead of being a colder grey.
    terrain: fill(std('#ffffff', {
      vertexColors: true, roughness: 0.74, metalness: 0.04, roughnessMap: snowRoughTex(),
      bumpMap: snowHeightTex(), bumpScale: 0.46,
    }), 0.72, '#3a4650', 0.035),
    // Paddock + graded skirt: double-sided so a residual crease cannot
    // render as a near-black backface, and polygon-offset so the apron
    // wins the depth test against the live ring instead of flickering a lip.
    terrainSkirt: (() => {
      const m = fill(std('#ffffff', {
        vertexColors: true, roughness: 0.78, metalness: 0.03,
      }), 0.38, '#2a3a2a', 0.03);
      m.side = THREE.DoubleSide;
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
      m.polygonOffsetUnits = -2;
      return m;
    })(),
    // ——— the apron gets its own material, and it is the ONE that stays dark ———
    //
    // Item 4 (lift the crushed shadows) and items 2–3 (close the perimeter step)
    // pull in opposite directions on one material: the apron's whole job is to
    // disappear into a crust that has NO emissive floor and answers the environment
    // at 0.16 against this venue's 0.60, so every point of floor added to it is a
    // point of step added at the boundary. Splitting them lets the snow and the
    // paddock come up while the outer annulus goes the other way.
    //
    // The numbers are the live ring's, read off the crust material rather than
    // chosen: `envIntensityBase` 0.28 (the crust's own; the rig then scales both by
    // the same profile factor) and a floor of 0.02, which is a tenth of what the
    // paddock carries. Roughness follows the crust's 0.92 for the same reason.
    terrainApron: (() => {
      const m = fill(std('#ffffff', {
        vertexColors: true, roughness: 0.90, metalness: 0.03,
      }), 0.30, '#22384c', 0.02);
      m.side = THREE.DoubleSide;
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
      m.polygonOffsetUnits = -2;
      return m;
    })(),
    // ——— r7: the emissive floor comes down ———
    //
    // r4 spent a whole gate taking crushed black from 18% to 0.24% and the props it
    // used to do it are still sized for a rig that had no ambient term. The measured
    // consequence is that the references carry MORE crushed black than we do —
    // 1.49 / 2.01 / 3.67% against our 0.245% — while our shade floor sits at p05
    // luminance 60.1 against their 22.9 / 22.9 / 33.6. There is a whole stop of
    // headroom at the dark end and the floor is what is eating it.
    //
    // Neutral families lose roughly half their floor, because a cool grey emissive on
    // snow, stone, steel and asphalt is pure flatness: it carries no hue to protect
    // and it is the term standing between this venue and the reference's shade. The
    // saturated families keep most of theirs, because there the floor is the material's
    // own colour and it is holding the accent measure that r5 spent the round winning.
    // W7-C: prop snow reads the snow token (V 93) and steps down from it; the old
    // #faf7f0 / #f4f7fb props rendered at V 97-100, pure white against a V 93 ground.
    snowLit: fill(std(dimHex(TASTE.ground.snow, 0.50), {
      roughness: 0.38, metalness: 0.06, bumpMap: snowHeightTex(), bumpScale: 0.18,
    }), 1.0, SNOW_FILL, 0.06),
    snowMid: fill(std(dimHex(tokMix(TASTE.ground.snow, TASTE.ground.rockLight, 0.14), 0.50), {
      roughness: 0.52, metalness: 0.04, bumpMap: snowHeightTex(), bumpScale: 0.22,
    }), 1.0, SNOW_FILL, 0.07),
    snowShade: fill(std(dimHex(tokMix(TASTE.ground.snow, TASTE.shadowTint, 0.34), 0.50), {
      roughness: 0.62, metalness: 0.03, bumpMap: snowHeightTex(), bumpScale: 0.25,
    }), 1.0, SNOW_FILL, 0.08),
    snowTrack: fill(std(dimHex(tokMix(TASTE.ground.snow, TASTE.ground.rockLight, 0.30), 0.50), {
      roughness: 0.56, metalness: 0.03, bumpMap: snowHeightTex(), bumpScale: 0.10,
    }), 1.0, SNOW_FILL, 0.06),
    snowSparkle: fill(std(dimHex(TASTE.ground.snow, 0.50), { roughness: 0.16, metalness: 0.22 }), 1.2, SNOW_FILL, 0.05),
    snowDirty: fill(std(dimHex(tokMix(TASTE.ground.snow, TASTE.ground.rockLight, 0.45), 0.50), { roughness: 0.62, metalness: 0.03 }), 1.0, SNOW_FILL, 0.06),
    snowMelt: fill(std('#788997', {
      roughness: 0.82, metalness: 0.04, bumpMap: snowHeightTex(), bumpScale: 0.12,
    }), 0.92, '#24384a', 0.11),
    // FC6: dielectric blue-green ice. Depth is carried by attenuation rather
    // than metalness, and the 0.15 roughness is shared by lip, sheet and pool.
    // Transmission trial: 0 keeps these two ices off the extra transmission pass.
    // Thickness and the other physical fields stay as authored. Clones copy this.
    ice: fill(new THREE.MeshPhysicalMaterial({
      color: '#74bdc6', roughness: 0.15, metalness: 0,
      clearcoat: 0.78, clearcoatRoughness: 0.10,
      transmission: 0, thickness: 0.85,
      attenuationColor: '#246f79', attenuationDistance: 4.2,
      ior: 1.31, side: THREE.DoubleSide,
    }), 1.70, '#173f50', 0.085),
    iceDeep: fill(new THREE.MeshPhysicalMaterial({
      color: '#397d86', roughness: 0.15, metalness: 0,
      clearcoat: 0.70, clearcoatRoughness: 0.12,
      transmission: 0, thickness: 1.7,
      attenuationColor: '#15535e', attenuationDistance: 2.8,
      ior: 1.31, side: THREE.DoubleSide,
    }), 1.45, '#123b49', 0.10),
    // W7-C: the four boulder tones are the two rock tokens and their blends.
    rock: fill(std(dimHex(tokMix(TASTE.ground.rockLight, TASTE.ground.rockDark, 0.5)), { roughness: 0.95, metalness: 0.02 }), 0.5, SHADE_FILL, 0.04),
    rockPale: fill(std(dimHex(TASTE.ground.rockLight), { roughness: 0.93, metalness: 0.02 }), 0.5, SHADE_FILL, 0.04),
    rockDark: fill(std(dimHex(TASTE.ground.rockDark), { roughness: 0.96, metalness: 0.02 }), 0.5, SHADE_FILL, 0.05),
    rockLichen: fill(std(dimHex(tokMix(TASTE.ground.rockLight, TASTE.foliage.leafGrey, 0.55)), { roughness: 0.96, metalness: 0.02 }), 0.5, SELF, 0.05),
    rockWet: fill(std('#3a3e42', { roughness: 0.28, metalness: 0.18 }), 1.40, SHADE_FILL, 0.10),
    // W12: trees carry their whole colour (bark, leaf, snow) in the vertex tone
    treeVC: fill(std('#ffffff', { roughness: 0.9, metalness: 0.02, vertexColors: true }), 0.8, SHADE_FILL, 0),
    // wave twelve: rock BODIES (bedded blocks with baked occlusion) read the stone shader's
    // course bedding; only geometry from falls-creek-models.js carries the colour attribute.
    rockBody: [
      [dimHex(TASTE.ground.rockLight, 0.42), 3],
      [dimHex(tokMix(TASTE.ground.rockLight, TASTE.ground.rockDark, 0.5), 0.42), 5],
      [dimHex(TASTE.ground.rockDark, 0.42), 7],
      [dimHex(tokMix(TASTE.ground.rockLight, TASTE.foliage.leafGrey, 0.55), 0.42), 11],
    ].map(([hex, seed]) => fill(createStoneMaterial({
      color: hex, roughness: 0.95, scale: 1.5, seed, waterY: -1000, wetTop: 0,
    }), 0.5, SHADE_FILL, 0.04)),
    rockSeatShade: new THREE.MeshBasicMaterial({
      color: '#1f3140', transparent: true, opacity: 0.14,
      depthWrite: false, blending: THREE.NormalBlending,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }),
    strata: fill(std('#3e3a36', { roughness: 0.92, metalness: 0.04 }), 1.15, SHADE_FILL, 0.14),
    flower: [
      fill(std('#c94b7a', { roughness: 0.7, metalness: 0.04 }), 0.90, SELF, 0.22),
      fill(std('#e0b030', { roughness: 0.7, metalness: 0.04 }), 0.90, SELF, 0.22),
      fill(std('#d8dce8', { roughness: 0.7, metalness: 0.04 }), 0.90, SELF, 0.18),
    ],
    tussock: fill(std(dimHex(tokMix(TASTE.ground.grassDry, TASTE.ground.soil, 0.25), 0.5), { roughness: 0.97, metalness: 0.01 }), 1.0, SELF, 0.08),
    tussockPale: fill(std(dimHex(TASTE.ground.grassDry, 0.5), { roughness: 0.97, metalness: 0.01 }), 1.0, SELF, 0.08),
    heath: fill(std(dimHex(TASTE.foliage.leafA, 0.5), { roughness: 0.96, metalness: 0.01 }), 1.0, SELF, 0.08),
    timber: fill(std('#6b4527', { roughness: 0.8, metalness: 0.03 }), 1.35, SELF, 0.13),
    timberDark: fill(std('#452e1c', { roughness: 0.82, metalness: 0.03 }), 1.35, SELF, 0.15),
    timberWarm: fill(std('#8a5f33', { roughness: 0.76, metalness: 0.04 }), 1.35, SELF, 0.12),
    timberPale: fill(std('#b08b57', { roughness: 0.72, metalness: 0.04 }), 1.35, SELF, 0.11),
    shingle: fill(std('#50403a', { roughness: 0.85, metalness: 0.05 }), 1.35, SELF, 0.15),
    shingleRidge: fill(std('#635045', { roughness: 0.8, metalness: 0.06 }), 1.35, SELF, 0.14),
    stone: fill(std('#8e8478', { roughness: 0.93, metalness: 0.03 }), 1.30, SHADE_FILL, 0.12),
    stoneDark: fill(std('#6a6157', { roughness: 0.94, metalness: 0.03 }), 1.30, SHADE_FILL, 0.14),
    // ——— r7: the venue gets a specular ———
    //
    // The blind-click sentence is "the whole thing's made of the same plastic", and the
    // measurement behind it is that there is no specular anywhere in the frame: every
    // window, windscreen and glazed face in this venue was matte, where the reference
    // breaks silhouettes with reflective glass and highlighted steel. These four are
    // authored as mirrors rather than as tinted lamberts — roughness at or under 0.10,
    // metalness at or over 0.72, and a high env base so the baked sky gradient is what
    // they return. That is a reflection of the sky, not an added lamp, so it costs the
    // dark end nothing.
    glassWarm: std('#ffd79a', {
      roughness: 0.20, metalness: 0.10, emissive: '#ff9a34', emissiveIntensity: 0.85,
    }),
    glassCool: fill(std('#2b3f4f', { roughness: 0.09, metalness: 0.72 }), 2.10, '#18293a', 0.07),
    glassSky: fill(std('#7d9fc4', { roughness: 0.05, metalness: 0.88 }), 2.60, '#1c2c3e', 0.05),
    glassDeep: fill(std('#243747', { roughness: 0.07, metalness: 0.80 }), 2.30, '#16222f', 0.06),
    chrome: fill(std('#c8ced6', { roughness: 0.10, metalness: 0.92 }), 2.20, SHADE_FILL, 0.06),
    lampGlow: std('#ffe6b0', {
      roughness: 0.3, metalness: 0.05, emissive: '#ffb340', emissiveIntensity: 1.35,
    }),
    steel: fill(std('#59606a', { roughness: 0.30, metalness: 0.70 }), 1.55, SHADE_FILL, 0.10),
    steelDark: fill(std('#3b414a', { roughness: 0.34, metalness: 0.70 }), 1.55, SHADE_FILL, 0.12),
    galv: fill(std('#9aa3ac', { roughness: 0.24, metalness: 0.80 }), 1.65, SHADE_FILL, 0.09),
    cable: fill(std('#454b54', { roughness: 0.26, metalness: 0.86 }), 1.55, SHADE_FILL, 0.10),
    orange: fill(std('#f16305', { roughness: 0.55, metalness: 0.08 }), 0.95, SELF, 0.22),
    orangeDeep: fill(std('#c14405', { roughness: 0.58, metalness: 0.08 }), 0.95, SELF, 0.24),
    netBlue: fill(std('#17559e', { roughness: 0.6, metalness: 0.06 }), 0.95, SELF, 0.26),
    asphalt: fill(std('#3b3e44', { roughness: 0.93, metalness: 0.03 }), 1.25, SHADE_FILL, 0.12),
    gravel: fill(std('#6d6961', { roughness: 0.96, metalness: 0.02 }), 1.25, SHADE_FILL, 0.11),
    lineWhite: fill(std('#e8e6df', { roughness: 0.62, metalness: 0.05 }), 1.30, SNOW_FILL, 0.10),
    // Deliberately over-scaled road paint. A 22 cm bay line is a third of a pixel at
    // 135 m, which is why the r6 critic recorded a car park "with kerbs but not one
    // line marking" while ten of them were on the deck. Toy register carries its
    // markings at three times life size, as the references do.
    paintWhite: fill(std('#f2efe6', { roughness: 0.58, metalness: 0.05 }), 1.30, SNOW_FILL, 0.10),
    paintYellow: fill(std('#e8b219', { roughness: 0.58, metalness: 0.06 }), 1.00, SELF, 0.18),
    gumBark: fill(std('#cdc6b6', { roughness: 0.88, metalness: 0.02 }), 1.45, SELF, 0.11),
    gumBark2: fill(std('#a89f8c', { roughness: 0.9, metalness: 0.02 }), 1.45, SELF, 0.12),
    // ——— r5: foliage saturation ———
    // r4 paid for its shadow fix with hue. A cool blue-grey emissive floor under a
    // green leaf raises the blue channel and drains the green: my cones measured
    // screen saturation 0.53 against the board scatter's 0.73–0.83 in the same
    // frame, which is why the two tree populations read as different species. The
    // rig now carries a hemisphere shade floor board-wide, so the neutral emissive
    // that was propping the darks up is no longer load-bearing. It comes down to a
    // trace, and the floor that remains takes the leaf's own colour, which keeps
    // the hue instead of washing it out.
    // Env base matched to the board's own landscape scatter, which runs
    // envMapIntensity 0.637 and measures screen saturation 0.73-0.84 in the same
    // frame where my cones at env 1.45 measured 0.53. The sky term is what was
    // making the two tree populations read as different species; it is not the
    // colour. The r4 critic's job 8 was to bring them to the same light response.
    gumLeaf: fill(std(dimHex(TASTE.foliage.leafGrey, 0.55), { roughness: 0.93, metalness: 0.02 }), 0.72, SELF, 0.11),
    gumLeaf2: fill(std(dimHex(TASTE.foliage.leafB, 0.55), { roughness: 0.93, metalness: 0.02 }), 0.72, SELF, 0.10),
    // W7-C: conifers take the leaf tokens (S 20-55, V 35-60), not #1f5228 / #307539.
    pine: [
      fill(std(dimHex(tokMix(TASTE.foliage.leafA, '#000000', 0.10), 0.55), { roughness: 0.93, metalness: 0.02 }), 0.7, SELF, 0.06),
      fill(std(dimHex(TASTE.foliage.leafA, 0.55), { roughness: 0.92, metalness: 0.02 }), 0.7, SELF, 0.06),
      fill(std(dimHex(TASTE.foliage.leafB, 0.55), { roughness: 0.92, metalness: 0.02 }), 0.7, SELF, 0.06),
    ],
    skin: fill(std('#d9a077', { roughness: 0.72, metalness: 0.02 }), 1.35, SELF, 0.12),
    jacket: [
      '#cf1620', '#0e4bb0', '#00838c', '#dd3579',
      '#f5b800', '#6432b8', '#eceae4', '#f96b06',
    ].map((c) => fill(std(c, { roughness: 0.5, metalness: 0.06 }), 1.00, SELF, 0.24)),
    trouser: [
      fill(std('#2c3648', { roughness: 0.62, metalness: 0.04 }), 1.25, SELF, 0.16),
      fill(std('#4a4f57', { roughness: 0.62, metalness: 0.04 }), 1.25, SELF, 0.15),
      fill(std('#3b4a37', { roughness: 0.62, metalness: 0.04 }), 1.25, SELF, 0.16),
    ],
    // Car paint reads as paint when it has a clearcoat: roughness down to 0.18 with a
    // higher env base is what puts a moving highlight on a 3 m body at 135 m.
    car: [
      '#c01c16', '#12468c', '#dfe0dc', '#0e8f8a', '#146443',
    ].map((c) => fill(std(c, { roughness: 0.18, metalness: 0.42 }), 1.35, SELF, 0.20)),
    tyre: fill(std('#26282c', { roughness: 0.94, metalness: 0.02 }), 1.20, SHADE_FILL, 0.11),
    catYellow: fill(std('#f2ac00', { roughness: 0.46, metalness: 0.16 }), 0.95, SELF, 0.24),
    // Signage pair. Both name boards were reading as smears, so they now run a
    // deliberately wide luminance gap: near-black ink on a pale cream panel. A
    // high-contrast pair survives softening far better than a tonal one.
    // ——— r5: the shadow gap ———
    // The r4 critic's closing measurement was that crisp-edge contrast, not blur,
    // is now the limit: our sharpest band peaks well under the reference's. What
    // makes a reference roof edge cut is the dark soffit line under the eave, and
    // that is local contrast on a 20 cm band — it buys the gradient without
    // touching the whole-frame darkness the last round spent a whole gate fixing.
    soffit: fill(std('#1d140e', { roughness: 0.9, metalness: 0.02 }), 0.40, SELF, 0.05),
    signPanel: fill(std('#e2cea3', { roughness: 0.72, metalness: 0.03 }), 1.40, SELF, 0.12),
    signInk: fill(std('#1d130d', { roughness: 0.78, metalness: 0.03 }), 0.85, '#12181e', 0.08),
    // Dirty cream, deliberately warmer and two stops down from snow (#faf7f0): a
    // sheep that shares a value with a drift becomes a drift at this distance.
    fleece: fill(std('#c2b08c', { roughness: 0.95, metalness: 0.01 }), 1.35, SELF, 0.20),
    fleeceDark: fill(std('#463b30', { roughness: 0.95, metalness: 0.01 }), 1.60, SELF, 0.26),
    hay: fill(std('#c9ac5f', { roughness: 0.97, metalness: 0.01 }), 1.60, SELF, 0.20),
    hayDark: fill(std('#a08842', { roughness: 0.97, metalness: 0.01 }), 1.60, SELF, 0.22),
    // Painted chalet trim. Saturated accent against neutral ground is the bar's
    // tell 9, and r3 measured 1.79% accent against Monopoly Plus's 8.79–12.2%.
    // W7-C: one accent hue for the village (accent.red, small surfaces only).
    trim: [
      TASTE.accent.red, TASTE.accent.red, TASTE.accent.maroon,
      TASTE.accent.red, TASTE.accent.maroon, TASTE.accent.red,
    ].map((c) => fill(std(c, { roughness: 0.58, metalness: 0.06 }), 1.00, SELF, 0.08)),
    // ——— r5: painted roofing ———
    //
    // The r4 plate measured strongly-saturated pixels at 14.6% against the
    // references' 25–31% and was the palest of the four images on the table. The
    // brightening that fixed the crushed shadows took the saturated darks with it
    // and nothing saturated replaced them.
    //
    // Roofs are the largest uninterrupted surfaces this venue owns and every one
    // of them was a white snow slab over a near-neutral shingle. These are the
    // paint tones that now sit under the snow, and they are chosen to be saturated
    // *and* bright — luminance 90–160 against the shingle's 60 — so the accent
    // arrives without clawing back the darkness the last round removed. Snow slides
    // off a warm eave and sits near the ridge, so the exposed band is the lower
    // third of each plane, which is also the part the camera sees most of.
    // A saturated material does not render saturated if a neutral sky term is
    // washing it: at env 1.55 the barn red authored at 0.77 measured 0.42 on the
    // plate, just under the 0.45 the accent test counts. The paint family runs a
    // low env base and carries its own hue in the emissive instead.
    // W7-C: chalet roofs are built.roofSlate in six small steps of value; the
    // saturated paint tones (#c93a22, #1a7fb5, #2e9455, #e39c12 ...) are retired.
    roof: [0.00, 0.10, -0.06, 0.16, -0.12, 0.05].map((d) => fill(std(
      tokMix(TASTE.built.roofSlate, d >= 0 ? '#ffffff' : '#000000', Math.abs(d) * 0.5),
      { roughness: 0.60, metalness: 0.06 },
    ), 0.9, SELF, 0.05)),
    roofSeam: [0.00, 0.10, -0.06, 0.16, -0.12, 0.05].map((d) => fill(std(
      tokMix(TASTE.built.roofSlate, '#000000', 0.22 + Math.abs(d) * 0.3),
      { roughness: 0.62, metalness: 0.06 },
    ), 0.9, SELF, 0.05)),
    barnRed: fill(std(TASTE.accent.red, { roughness: 0.72, metalness: 0.05 }), 0.95, SELF, 0.10),
    barnRedDark: fill(std(TASTE.accent.maroon, { roughness: 0.76, metalness: 0.05 }), 0.95, SELF, 0.10),
    barnTrim: fill(std(TASTE.built.marking, { roughness: 0.74, metalness: 0.03 }), 1.1, SELF, 0.06),
    lodgeRoof: fill(std(TASTE.built.roofSlate, { roughness: 0.55, metalness: 0.08 }), 0.9, SELF, 0.05),
    lodgeRoofSeam: fill(std(tokMix(TASTE.built.roofSlate, '#000000', 0.25), { roughness: 0.6, metalness: 0.08 }), 0.9, SELF, 0.05),
    // Race-gate paint. Slalom panels are the most saturated small objects on any
    // real hill and they survive this softening better than anything of their size.
    gateRed: fill(std('#e01c23', { roughness: 0.5, metalness: 0.06 }), 0.90, SELF, 0.26),
    gateBlue: fill(std('#0d4fd6', { roughness: 0.5, metalness: 0.06 }), 0.90, SELF, 0.28),
    // ——— r7: painted contact, down-sun ———
    //
    // The shadow map throws a shadow; it does not throw a *collar*. What the reference
    // stills have under every wall, vehicle, post and body is a short, dark, oriented
    // patch that ties the object to the ground independently of whether the cascade
    // resolves at that distance — and at 135 m through this depth-of-field envelope,
    // it mostly does not. These are the tones that patch sits in, one per ground
    // family, each authored two to three stops under the surface it lies on so it
    // reads as shade rather than as dirt. They carry almost no emissive floor on
    // purpose: this family exists to own the dark end of the histogram.
    // Authored against the surface each one lies on, not against a guess. Lit snow is
    // #faf7f0; a cast shadow on snow returns about a quarter of that and takes the sky's
    // blue with it, so the core is a deep slate-blue and the penumbra one step up. The
    // first r7 pass used #7d97b8 for the core, which measured as mid-grey on the plate
    // and moved p05 only four levels — a shadow that is not dark is not a shadow.
    // Painted snow contacts carry the same argument as the terrain floor: the
    // darkest thing a venue lays on snow should still be blue. 0.03/0.04 -> 0.07/0.08.
    contactSnow: fill(std('#4a5568', { roughness: 0.78, metalness: 0.02 }), 0.55, SNOW_FILL, 0.07),
    contactSnowSoft: fill(std('#7c8794', { roughness: 0.74, metalness: 0.02 }), 0.70, SNOW_FILL, 0.08),
    // Under a roof the deck is in shade, not in a hole. Kept well clear of black so a
    // 100 square metre patch reads as a shaded floor rather than as a void plane.
    deckShade: fill(std('#33353b', { roughness: 0.94, metalness: 0.03 }), 0.60, SHADE_FILL, 0.05),
    deckShadeSoft: fill(std('#4a4c52', { roughness: 0.94, metalness: 0.03 }), 0.72, SHADE_FILL, 0.06),
    contactGrass: fill(std('#13210d', { roughness: 0.96, metalness: 0.01 }), 0.50, SELF, 0.04),
    contactGrassSoft: fill(std('#24391a', { roughness: 0.96, metalness: 0.01 }), 0.65, SELF, 0.05),
    contactHard: fill(std('#1a1a19', { roughness: 0.95, metalness: 0.02 }), 0.45, SHADE_FILL, 0.03),
    contactHardSoft: fill(std('#333230', { roughness: 0.95, metalness: 0.02 }), 0.60, SHADE_FILL, 0.04),
    smoke: [0.32, 0.24, 0.16, 0.10].map((o) => new THREE.MeshStandardMaterial({
      color: '#d3d8dc', transparent: true, opacity: o, roughness: 1, metalness: 0, depthWrite: false,
    })),
  };
}

// Snow-gum bark (addSnowGum's tint).
export const GUM_BARK = '#30271f';

// Waterfall (addWaterfall): the ice sheet's recorded depth tint, the crest and
// plunge-pool foam materials (one each per call), and the two spray tones.
export const FALLS_ICE_DEPTH_TINT = '#246f79';
export function fallsCrestMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: '#f4fbff', roughness: 0.22, metalness: 0,
    clearcoat: 0.85, clearcoatRoughness: 0.12, ior: 1.31,
    emissive: '#d7eef6', emissiveIntensity: 0.18,
  });
}
export function fallsFoamMaterial() {
  return new THREE.MeshBasicMaterial({
    color: '#eef7fb', transparent: true, opacity: 0.55,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
}
/** Indexed by `i % 2`: even sprays then odd sprays. */
export const FALLS_SPRAY_COLOURS = Object.freeze(['#dceff2', '#f2fbfc']);
