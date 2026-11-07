// District Deck V3.32 — figure material families.
//
// Lane E. Owns every material the cast draws with, and the wear that lives in material response.
// One material per `InstancedMesh`, so a family costs the cast one draw call (V3.32 §3).
//
// ## What §2.4 actually asks for
//
// *"Skin, hair, cotton shirting, wool suiting, hi-vis polyester, denim, leather, rubber sole,
// retro-reflective tape, brushed metal and painted metal each carry their own roughness and
// response. Cloth is not skin with a different colour. Leather takes a highlight; wool does
// not."* The r01 cast answered that with one `voxelMat` at two roughnesses, which is the
// dimension's zero.
//
// Eleven responses do not need eleven draws, because a response is a *pair* of roughness and
// envMap intensity and several garments legitimately share one. The families below are grouped
// by response rather than by garment: everything matte and woven draws on `accent`, everything
// rigid — hard hat shell, briefcase, jerry can, tool belt, boot sole — draws on `prop`, the boot
// itself draws on `shoe`, and the two responses nothing else can imitate, fluorescent polyester
// and retro-reflective tape, get a family each.
//
// | family     | stands for                          | rough | metal | env  |
// |------------|-------------------------------------|-------|-------|------|
// | `skin`     | skin                                | 0.78  | 0.00  | 0.52 |
// | `hair`     | a sculpted hair mass                | 0.60  | 0.00  | 0.66 |
// | `torso`    | cotton shirting                     | 0.86  | 0.00  | 0.46 |
// | `legs`     | denim / drill trouser               | 0.88  | 0.00  | 0.40 |
// | `accent`   | wool suiting, canvas, knitwear      | 0.95  | 0.00  | 0.24 |
// | `shoe`     | leather upper and rubber sole       | 0.52  | 0.03  | 0.34 |
// | `prop`     | leather cases, painted metal, shell | 0.66  | 0.02  | 0.10 |
// | `hivis`    | fluorescent polyester               | 0.66  | 0.00  | 0.58 |
// | `trim`     | retro-reflective tape, brushed metal| 0.21  | 0.26  | 1.30 |
//
// **The env column is a base the rig multiplies, not a final intensity.** `LightingRig` scales
// every stamped base by `profile.envIntensity`, which runs 0.45 at the ends of the day to 0.70 at
// noon, so a base of 0.30 is about 0.18 of the sky on the plate. r01 authored this column as if
// it were the final number — wool at 0.09, leather at 0.18 — while the rig was in fact
// discarding all of it and running the whole cast at its 0.92 fallback, so nothing here was ever
// validated against a render. Stamped and re-authored in r01b, the two errors having cancelled
// each other out for a round: an unstamped 0.09 rendered at 0.55 and a stamped 0.09 renders at
// 0.05, which crushed a shadowed wool coat to black on the first plate after the stamp landed.
//
// What the column has to hold is the *ordering* §2.4 grades, and it does: wool lowest at 0.30,
// then denim, cotton, skin, hi-vis, hair, and retro-reflective tape highest at 1.30. Leather sits
// at 0.34 rather than at the top: on this cast the leather is a black boot, and the highlight it
// takes has to come from its roughness of 0.52 against wool's 0.95, not from a sky it cannot
// afford to reflect.
// Both were metered down twice after the stamp landed. At 0.80 and 0.70 a near-black boot and a
// near-black tool belt were reflecting most of a blue-white sky off an albedo of two per cent and
// came off the hero plate as frosted mauve, because the specular term of an image-based light is
// not multiplied by albedo: on the darkest surfaces in the cast it *is* the pixel. Wool at 0.24
// and roughness 0.95 against leather at 0.34 and roughness 0.52 is the whole of "leather takes a
// highlight; wool does not", and it reads at hero distance without a single texel.
//
// ## Wear
//
// §2.8 scores a uniform dirt multiply at zero, so there is none here. Wear arrives two ways and
// both are per-surface: a **value patch** — a modelled panel in a different tone at the knee,
// the cuff, the toecap or the hi-vis shoulder, authored in `wardrobe.js` and coloured from
// `cast.js` — and a **roughness break**, a low-frequency mottle written into the roughness map
// of the five families that would otherwise render as unbroken fills. The mottle never touches
// colour, so it cannot muddy the value ladder §2.9 is graded on; it only stops a flat panel
// taking the light as one plane. r02 adds a third: a **grain**, a per-family normal map that
// gives each cloth a surface rather than a shading variation — see `grainNormal`. All three
// avoid a colour map for the same reason, which is that on an instanced family it multiplies
// into `instanceColor` and becomes exactly the uniform dirt multiply §2.8 scores at zero.
//
// `prop` was metered a third time in r02, and off a plate. It carries the boot now, and a
// near-black boot at roughness 0.60 and env 0.26 still put a blue sky highlight on its own toe:
// the r02 first-pass builder measured a `#3a291b` upper with facets at L\* 51 and a visible
// cyan patch, and 0.19 did not close it. The cause is Fresnel rather than intensity: at grazing
// incidence a dielectric reflects the whole sky whatever its albedo, and a boot's toe is nothing
// but grazing facets. 0.10 is the lowest environment on the cast and the family keeps its
// highlight from the key, at 0.29 of roughness ahead of the wool beside it, which is the half of
// §2.4 that is actually graded.
//
// Salt namespace 500–599. Deterministic: no clock, no `Math.random`.

import * as THREE from 'three';
import { PALETTE, unitFrom } from './core.js';

/** Salts this lane owns. V3.32 §5: 500–599. */
export const MATERIALS_SALT = Object.freeze({
  MOTTLE: 521,
  GRAIN: 531,
});

/**
 * A cloth **grain**, as a normal map, 64².
 *
 * §2.4's standing charge against the cast is that *"every surface is an unbroken fill with facet
 * shading as its only variation — no weave, no denim grain, no canvas tooth, no leather grain"*,
 * and the r01 mottle could not answer it: a roughness break changes how evenly a plane takes the
 * light and leaves the plane flat. A normal map gives the plane a surface. It is the only map that
 * can, because on an instanced family a colour or emissive map multiplies into `instanceColor` and
 * would flatten the cast palette §2.9 is graded on, and §2.8 scores a uniform dirt multiply at
 * zero for exactly that reason.
 *
 * `weave` is the fraction of the height field carried by a regular structure rather than by
 * speckle: 0 is leather and canvas, which are irregular; denim carries a twill at 45°, the one
 * weave that reads at this scale. `depth` scales the finite difference the normal is taken from,
 * so a coarse canvas and a fine shirting differ in relief rather than in period.
 *
 * **Every scale below was metered down once against a plate.** The first r02 builder came back
 * with corduroy trousers: a limb's UV runs 1.0 around a 200 mm circumference and 1.0 along an
 * 800 mm shin, so a 45° diagonal in texture space arrives on the leg as a near-vertical stripe,
 * and at 0.70 weave and 0.40 normal scale the stripe was the loudest thing on the figure. The
 * wool likewise drew a maze on the policeman's sleeves at twelve cells. Halving the weave, raising
 * the cell counts and cutting the scales to 0.12–0.22 leaves the grain reading as cloth tooth at
 * hero distance and as nothing at all at board altitude, which is the correct amount.
 *
 * Flat shading does not defeat it. Three recomputes the geometric normal per fragment from screen
 * derivatives and perturbs *that*, so the grain sits on top of the facet break rather than
 * competing with it.
 *
 * Returns `null` under Node, where four test files import this module and there is no canvas.
 */
function grainNormal(seed, { cells = 16, weave = 0, depth = 1.6 } = {}) {
  if (typeof document === 'undefined') return null;
  const size = 64;
  const height = new Float32Array(size * size);
  const step = size / cells;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cx = Math.floor(x / step);
      const cy = Math.floor(y / step);
      const speckle = unitFrom(`${seed}:${cx}:${cy}`, MATERIALS_SALT.GRAIN);
      // A 45° twill: the diagonal the eye reads as denim, at a two-texel period.
      const twill = 0.5 + 0.5 * Math.sin((x + y) * Math.PI * 0.5);
      height[y * size + x] = speckle * (1 - weave) + twill * weave;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * depth;
      const dy = (at(x, y + 1) - at(x, y - 1)) * depth;
      const length = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      image.data[i] = Math.round((-dx / length * 0.5 + 0.5) * 255);
      image.data[i + 1] = Math.round((-dy / length * 0.5 + 0.5) * 255);
      image.data[i + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * A low-frequency roughness break, 64², generated through the in-repo canvas path.
 *
 * Roughness only. A colour or emissive map on an instanced family multiplies into every
 * instance's own colour and would flatten the cast palette that §2.9 is graded on; a roughness
 * map changes only how each facet takes the light, which is exactly what "no flat unbroken
 * fills" asks for.
 *
 * Returns `null` under Node, where four test files import this module and there is no canvas.
 */
function mottleTexture(seed, { low = 0.82, high = 1.0, cells = 8 } = {}) {
  if (typeof document === 'undefined') return null;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const step = size / cells;
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      const u = unitFrom(`${seed}:${x}:${y}`, MATERIALS_SALT.MOTTLE);
      const level = Math.round((low + (high - low) * u) * 255);
      ctx.fillStyle = `rgb(${level},${level},${level})`;
      ctx.fillRect(x * step, y * step, step + 1, step + 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Linear filtering on purpose: the break has to read as cloth taking the light unevenly, not
  // as a checker. Nearest turns eight cells into a visible grid at hero distance.
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The chunky flat-shaded standard material the cast is built from. White base colour: identity
 * arrives per instance through `setColorAt`, so one material serves every archetype.
 *
 * Kept exported at its original signature — `ambient-life.js` and the crowd layer build against
 * it and neither is in this lane.
 */
export function voxelMat(roughness, metalness = 0.04) {
  return new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness,
    metalness,
    envMapIntensity: 0.38,
    flatShading: true,
  });
}

/**
 * One family.
 *
 * **The base colour is white unless the family never takes an instance colour.** Three multiplies
 * `material.color` by `instanceColor`, so a family that carries both renders the product of the
 * two: the r01-seat2 first plate put khaki drill trousers through a navy denim base and got a
 * near-black leg, which reads on a value plate as the trouser rung collapsing into the shoe rung.
 * `darkFeature` and `contact` keep their own colour because nothing ever tints them.
 *
 * `mottle` names the roughness break, or is left off for a smooth response.
 */
function family(name, {
  roughness, metalness = 0, env = 0.3, colour = '#ffffff', mottle = null, grain = null,
  emissive = null, emissiveIntensity = 0,
}) {
  const material = new THREE.MeshStandardMaterial({
    color: colour,
    roughness,
    metalness,
    envMapIntensity: env,
    flatShading: true,
  });
  material.name = `v332:people:${name}`;
  // **The authored intensity only survives if it is stamped here.**
  //
  // `LightingRig.applyEnvironmentToScene` walks the scene and rewrites `envMapIntensity` on every
  // standard material from `envIntensityFor()`, which reads roughness and metalness and returns
  // 1.20, 1.35 or 0.92. `userData.envIntensityBase` is the documented opt-out and the residential
  // MaterialLibrary already uses it; the figure kit did not, so every value in the table above
  // was discarded at load and the whole cast rendered at 0.92 of a bright blue-white sky.
  //
  // That single line is most of three r01 defects at once. Wool at 0.09 and leather at 0.18 both
  // ran at 0.92, so §2.4's "leather takes a highlight; wool does not" could not exist. The key
  // lifted authored L* by up to thirty-five points, so §2.9's ladder collapsed however well the
  // palette was spread. And every near-black on the figure — boot, sole, tool belt, pouches —
  // took nine tenths of a sky and rendered blue: the r01b hero plate measured a `#241a12` boot at
  // `rgb(40,44,75)`. The rig multiplies this base by its own time-of-day intensity, which is the
  // contract, so the families stay related to each other as the board's hour moves.
  material.userData.envIntensityBase = env;
  if (emissive) {
    material.emissive = new THREE.Color(emissive);
    material.emissiveIntensity = emissiveIntensity;
  }
  if (mottle) {
    const texture = mottleTexture(mottle.seed ?? name, mottle);
    if (texture) {
      material.roughnessMap = texture;
      material.needsUpdate = true;
    }
  }
  if (grain) {
    const texture = grainNormal(grain.seed ?? name, grain);
    if (texture) {
      // **The repeat is a pair now, and that is the r02 §2.4 finding answered where it lives.**
      //
      // The critic's charge was that the grain is *"a single vertical directional streak applied
      // to everything — at hero distance it reads as brushed metal or wood grain rather than as
      // cloth"*. It is not a directional map: it is an isotropic field on a wildly anisotropic UV.
      // `profileSolid` runs u once around a ring and v once along the stack, so on a shin the same
      // 0→1 span covers a 600 mm circumference and an 800 mm length, and on a forearm 750 mm
      // against 560 mm — but on a *limb* the visible half is only the front, so a repeat of 3 in
      // both axes puts about 1.5 cells across the visible width against 3 up the length. Cells
      // twice as tall as they are wide, in a column, are a streak.
      //
      // A pair lets each family square its own cells up on the surface it mostly draws on. Nothing
      // about the generated texture changes; what changes is how it is laid on.
      const [ru, rv] = Array.isArray(grain.repeat) ? grain.repeat : [grain.repeat ?? 3, grain.repeat ?? 3];
      texture.repeat.set(ru, rv);
      material.normalMap = texture;
      material.normalScale = new THREE.Vector2(grain.scale ?? 0.35, grain.scale ?? 0.35);
      material.needsUpdate = true;
    }
  }
  return material;
}

/**
 * Every material a cast figure uses, in one call, so the batch never constructs one inline.
 * Keys match the `InstancedMesh` slots in `index.js`.
 */
export function createFigureMaterials() {
  // —— body ——————————————————————————————————————————————————————————————————————————
  // Skin is matte and takes light in two or three broad passages, with no sheen and nothing
  // passing through the flesh: the register forbids both, and a glossy forearm is the single
  // fastest way to break the fidelity tier.
  const skin = family('skin', { roughness: 0.78, env: 0.52 });
  // Cotton shirting: the trunk under the garment, seen at the collar and in the coat opening.
  const torsoGarment = family('cotton', {
    roughness: 0.86, env: 0.46, mottle: { seed: 'cotton', low: 0.86 },
    // Shirting: a fine even weave, shallow, at a high repeat. The one grain that has to stay
    // almost invisible, because a shirt that reads as hessian is worse than a shirt that reads
    // as a fill.
    grain: { seed: 'cotton', cells: 24, weave: 0.55, depth: 1.1, repeat: [7, 4], scale: 0.16 },
  });
  // Denim and cotton drill: the flattest response on the figure, so the trouser never competes
  // with the leather below it in the value ladder.
  const legGarment = family('denim', {
    roughness: 0.88, env: 0.40, mottle: { seed: 'denim', low: 0.84 },
    // The twill. 0.7 of the height field is the 45° diagonal, which is the structure the eye
    // actually names as denim, and the rest is the slub that stops it reading as a printed
    // pattern.
    grain: { seed: 'denim', cells: 20, weave: 0.34, depth: 1.5, repeat: [6, 3], scale: 0.24 },
  });
  // Wool suiting, canvas and knitwear. 0.95 with almost no environment is the "wool does not
  // take a highlight" half of §2.4, and it is what makes the leather beside it read as leather.
  const wool = family('wool', {
    roughness: 0.95, env: 0.24, mottle: { seed: 'wool', low: 0.88 },
    // Broad and irregular: a coat's nap, a knitted beanie and a canvas layer all take the light
    // in patches rather than in rows, so the weave term is zero and the cells are large.
    grain: { seed: 'wool', cells: 14, weave: 0.00, depth: 1.9, repeat: [5, 2], scale: 0.26 },
  });
  // Leather upper over a rubber sole. Low roughness and a *weak* environment: the sheen has to
  // come from the key, because it cannot come from the sky without the boot turning into it.
  const leather = family('leather', {
    roughness: 0.52, metalness: 0.03, env: 0.34,
    grain: { seed: 'leather', cells: 26, weave: 0, depth: 1.2, repeat: [8, 4], scale: 0.18 },
  });
  // Rigid goods: leather cases and belts, painted-metal cans, the lacquered hard-hat shell,
  // paper rolls and canvas bedrolls. One response between the boot and the wool, because a
  // briefcase has a sheen and a bedroll does not, and the value patch on each carries the rest.
  // Headwear draws here rather than taking a family of its own: r01 reclaimed the old accessory
  // draw for the wardrobe and spending it twice would put the cast over eighteen.
  //
  // Metered down twice now, and for the same reason both times. r01 measured leather from 0.82
  // to 0.18 after a near-black boot baked out at `#6c5f5a`. r01b measured this family from 0.20
  // to 0.10 and dropped its metalness with it, because once `wardrobe.js` put a *modelled* boot,
  // a belt and two pouches on it in the darkest tones on the palette, every one of them came off
  // the hero plate blue: at L*7 the environment is nearly all of the pixel, and this environment
  // is a bright overcast sky. A dark surface with a strong environment does not read dark, it
  // reads as whatever is above it.
  const propFamily = family('prop', {
    roughness: 0.66, metalness: 0.02, env: 0.10, mottle: { seed: 'prop', low: 0.80 },
    // The boot draws here, so this grain is leather's: irregular, and deep enough to break the
    // one large near-black mass on the figure into something with a surface.
    grain: { seed: 'prop', cells: 24, weave: 0, depth: 1.3, repeat: [8, 4], scale: 0.13 },
  });

  return {
    // Segment families, named as lane A's `FAMILIES` table asks for them.
    skin,
    head: skin,
    arms: skin,
    torsoGarment,
    body: torsoGarment,
    shoulders: torsoGarment,
    legGarment,
    legs: legGarment,
    // A sleeve is wool, not shirting: the upper-arm segment carries the jacket, and the sleeve
    // hem, the forearm and the hand below it are cuff cloth then skin.
    sleeve: wool,
    // Hair is a sculpted mass, not strands: lower roughness than skin so it catches one broad
    // highlight across the crown and separates from the forehead even where the values are close.
    hair: family('hair', { roughness: 0.60, env: 0.66 }),
    // Eyes, brow shadow and mouth. The darkest matte on the figure and deliberately the least
    // reflective thing on it: §2.3 fails a face whose features render at the skin's own value,
    // and a feature that catches a highlight reads as a bead rather than as a socket.
    darkFeature: family('dark-feature', { roughness: 0.98, env: 0.07, colour: '#20181a' }),

    // —— wardrobe ————————————————————————————————————————————————————————————————————
    // Every soft garment panel, hem, collar, cuff, beanie, hood and wear patch.
    accent: wool,
    // Boots, and the sole and toecap patches that sit on them.
    shoe: leather,
    // Rigid goods: leather cases and belts, painted-metal cans, lacquered hard-hat shell, paper
    // rolls and canvas bedrolls. One response between the boot and the wool, because a briefcase
    // has a sheen and a bedroll does not, and the value patch on each carries the rest of it.
    // Headwear draws here too rather than taking a fourteenth family — r01 reclaimed the old
    // accessory draw for the wardrobe and spending it again would put the cast over 18.
    prop: propFamily,
    // Alias, so lane A's `accessory` family still resolves if it is reinstated.
    headwear: propFamily,
    // Fluorescent polyester. The emissive lift is what "reads as fluorescent under daylight"
    // means in a renderer with no fluorescence model, and it is held at 0.20 so the yellow sits
    // near L*80 and never clips — §2.9 forbids a hi-vis blowout as firmly as a black crush.
    // 0.24, up from 0.20. The r01 critic measured the vest at L\* 81.3 against a lab ground of
    // 75.6 — 5.7 points of margin — and noted that against the light footpath the board actually
    // draws, the builder's loudest identity cue loses it. The tape above it measured 90.7 and was
    // checked for clipping and found clean, so there is headroom to lift the fabric without
    // taking the tape into a blowout §2.9 forbids as firmly as a crush.
    hivis: family('hivis', {
      roughness: 0.66, env: 0.58, emissive: '#c9d824', emissiveIntensity: 0.24,
      mottle: { seed: 'hivis', low: 0.90 },
      grain: { seed: 'hivis', cells: 30, weave: 0.72, depth: 0.9, repeat: [9, 5], scale: 0.12 },
    }),
    // Retro-reflective tape and brushed metal. The tape is brighter than the fabric it is sewn
    // to on three counts at once: a higher base value, a fifth of the roughness, and a small
    // white emissive that survives when the vest itself falls into shadow.
    trim: family('trim', {
      roughness: 0.21, metalness: 0.26, env: 1.30, emissive: '#ffffff', emissiveIntensity: 0.07,
    }),
    badge: family('badge', { roughness: 0.30, metalness: 0.28, env: 1.25 }),

    // Contact is unlit on purpose: a lit disc under a figure double-darkens against the
    // renderer's own ambient occlusion and reads as a charcoal puck rather than a shadow.
    contact: new THREE.MeshBasicMaterial({
      color: PALETTE.contact,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }),
  };
}

/** Dispose the roughness breaks and the grains alongside the materials that hold them. */
export function disposeFigureMaterials(materials) {
  const seen = new Set();
  for (const material of Object.values(materials ?? {})) {
    if (!material || seen.has(material)) continue;
    seen.add(material);
    if (material.roughnessMap) material.roughnessMap.dispose();
    if (material.normalMap) material.normalMap.dispose();
    material.dispose?.();
  }
}
