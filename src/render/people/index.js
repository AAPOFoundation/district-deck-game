// District Deck V3.32 — cast figure batch.
//
// Orchestrator. Owns which InstancedMesh exists and at what capacity, the pose → matrix write
// loop, and the measured `stats()` the budget gate reads. It knows nothing about the gait and
// nothing about game state: `people.js` supplies world roots, `rig.js` supplies poses.
//
// Draw budget, V3.32 §3: the cast is 18 draws / 220 000 triangles across 29 instances. Adding
// a *segment* to an existing family costs instances and no draws; adding a *family* costs one
// draw. Prefer segmentation.
//
// r01 (seat 1) moved the batch from nine whole-limb families to the segment set in the shared
// brief §2. Two families carry more than one segment each — the leg mesh is thigh and shin, four
// instances a figure — which is the segmentation the budget note asks for. Draw sheet below.

import * as THREE from 'three';
import { PEOPLE_CAP } from '../../core/people.js';
import {
  GEOMETRY_CONTRACT, HIDDEN_SCALE, PROPORTIONS, UP, buildFromScale, geometryTriangles, instanced,
} from './core.js';
import {
  buildChestGeometry, buildContactGeometry, buildDogBodyGeometry, buildDogDarkGeometry,
  buildDogHeadGeometry, buildDogLegGeometry, buildDogTailGeometry, buildFootGeometry,
  buildForearmGeometry, buildLimbSegmentGeometry, buildNeckGeometry,
  buildPelvisGeometry, buildRestPose, buildTorsoGeometry, buildUpperArmGeometry,
} from './figure.js';
import { HAT_FIT, buildFaceGeometry, buildHairGeometry, buildHeadGeometry, faceFor } from './head.js';
import {
  WARDROBE_CAPACITY, WARDROBE_PLAN, WARDROBE_SHAPES, buildBadgeGeometry, buildWardrobe, familyKey,
  pelvisToneFor,
} from './wardrobe.js';
import { createFigureMaterials, disposeFigureMaterials } from './materials.js';
import { castPalette, pressFor, styleFor, styleForPerson } from './cast.js';
import { poseFigure } from './rig.js';

export { pathPosition, pathLengthOf, matrixAlongPath, yawAlongPath, poseFigure } from './rig.js';

/** Half the core PEOPLE_CAP on the board so the street is readable. +1 is the avatar. */
export const STREET_PERSON_CAPACITY = Math.max(1, Math.round(PEOPLE_CAP / 2) + 1);
/** Fixed budget fallback: three workers on each of the two camera-nearest active sites. */
export const SITE_CREW_SITE_CAP = 2;
export const SITE_CREW_SIZE = 3;
export const SITE_CREW_CAPACITY = SITE_CREW_SITE_CAP * SITE_CREW_SIZE;
export const PERSON_CAPACITY = STREET_PERSON_CAPACITY + SITE_CREW_CAPACITY;

const CAST_SHADOW = { castShadow: true };

/**
 * Which pose slots each instanced family carries, in draw order back to front.
 *
 * A family is one geometry and one material; a slot is one instance of it. `thighL` and `shinR`
 * share the leg mesh because a thigh and a shin differ only by the scale the pose hands them, so
 * the knee and the ankle the old figure lacked cost four instances and no extra draw.
 */
const FAMILIES = Object.freeze([
  { key: 'contact', slots: ['contact'], material: ['contact'] },
  { key: 'pelvis', slots: ['pelvis'], material: ['legGarment', 'legs'], shadow: true },
  { key: 'limb', slots: ['thighL', 'thighR', 'shinL', 'shinR'], material: ['legGarment', 'legs'], shadow: true },
  { key: 'foot', slots: ['footL', 'footR'], material: ['shoe', 'badge'], shadow: true },
  { key: 'torso', slots: ['torso'], material: ['torsoGarment', 'body'], shadow: true },
  { key: 'chest', slots: ['chest'], material: ['torsoGarment', 'body'], shadow: true },
  { key: 'upperArm', slots: ['upperArmL', 'upperArmR'], material: ['sleeve', 'torsoGarment', 'body'], shadow: true },
  { key: 'forearm', slots: ['forearmL', 'forearmR'], material: ['skin', 'arms', 'head'], shadow: true },
  { key: 'neck', slots: ['neck'], material: ['skin', 'head', 'arms'], shadow: true },
  { key: 'head', slots: ['head'], material: ['head', 'skin'], shadow: true },
  { key: 'face', slots: ['face'], material: ['darkFeature', 'hair'] },
  { key: 'hair', slots: ['hair'], material: ['hair'], shadow: true },
  { key: 'badge', slots: ['badge'], material: ['badge'] },

  // —— the quadruped, shared brief §2 ——————————————————————————————————————————————————
  //
  // Five families, and they are what `PEOPLE_RENDER_BUDGET.drawCalls` was raised from 18 to 26
  // for: "the quadruped slot set" is named in that note. The dog had no geometry of its own
  // before this — it was the human trunk laid on its side with a face card edge-on for a head —
  // and the r01 critic could not grade it at all.
  //
  // Segmentation is taken wherever it exists: four legs are four instances of one mesh, and the
  // nose and both eyes are three instances of one dark bulb. Coat parts draw in the `hair`
  // family's material rather than `skin`, because a fur response is nearer to hair than to a
  // human forearm and it costs nothing to say so.
  { key: 'dogBody', slots: ['dogBody'], material: ['hair'], shadow: true },
  { key: 'dogHead', slots: ['dogHead'], material: ['hair'], shadow: true },
  {
    key: 'dogLeg',
    slots: ['dogLegFL', 'dogLegFR', 'dogLegRL', 'dogLegRR'],
    material: ['hair'],
    shadow: true,
  },
  { key: 'dogTail', slots: ['dogTail'], material: ['hair'], shadow: true },
  { key: 'dogDark', slots: ['dogNose', 'dogEyeL', 'dogEyeR'], material: ['darkFeature', 'hair'] },
]);

/**
 * Lane C's wardrobe, V3.32 §2.5. One family per (material batch × unit shape), many instances a
 * figure: a jacket is seven panels and a hem, a hard hat is five parts, a boot is three. Slot
 * names are generated because a garment piece is not a body part and must never collide with lane
 * A's slot set.
 *
 * Eight families where r01 had four. The second shape — a rounded shell (`wardrobe.js`
 * `buildShellGeometry`) — is what a belt, a cuff, a hem, a vest and a boot are made of: a brick
 * laid against a swept-profile body shows four corners and a flat lit top face, so it reads as a
 * separate object at any dimension. The third, `buildDomeGeometry`, is r02's one added draw and
 * carries the hard hat's crown and the peaked cap's. It was bought against a measured defect
 * rather than a preference: two shells stacked into a dome put a rim taper and a fresh bulge at
 * their junction, and the r01 critic read the result off the enlarged builder as a stacked-disc
 * ziggurat with four visible steps. `wardrobe.js` reclaimed 164 triangles of over-provisioned
 * capacity in the same pass, so the sheet is smaller than r01b's with a family more in it.
 *
 * The old `accessory` family paid for the first four. It drew one shared hard-hat volume
 * re-scaled into a briefcase, a bag, a cap and a roll, which is precisely the defect §2.5 exists
 * to catch, and nothing poses it any more — reclaiming it before spending is §7.5.
 *
 * **r03 changes no family and re-cuts four capacities.** Deleting the pair of full-height front
 * edges from every open coat and moving the architect's glasses off the retro-reflective family
 * took the fattest `accent:brick` kit from 7 to 5 and `trim:brick` from 5 to 2; the hi-vis vest's
 * new top tape band spent most of it back. The sheet is 3 088 triangles against r02's 3 068, and
 * the fattest figure in the cast authors 28 wardrobe instances.
 */
const WARDROBE_FAMILIES = Object.freeze(WARDROBE_PLAN.map(({ batch, shape, capacity }) => Object.freeze({
  key: `wear_${batch}_${shape}`,
  batch,
  shape,
  shadow: batch !== 'trim',
  material: [batch],
  slots: Object.freeze(Array.from(
    { length: capacity }, (unused, i) => `wear:${batch}:${shape}:${i}`,
  )),
})));

/**
 * Which cast tone each body slot takes. Colour authority sits here rather than in the rig,
 * because §2.9 is graded on the value ladder across the whole figure and a lane that owns one
 * segment cannot see the ladder. The rig's own instance colours are overwritten, not read.
 */
const SLOT_TONE = Object.freeze({
  // **`pelvis` is overridden per kit by `wardrobe.js` `pelvisToneFor`, and that is the r04 fix for
  // the pale chest patch the r03 critic traced across five figures.** Lane A's pelvis is the
  // outermost trunk mass from the hip to just above the waist, so a trouser tone on it puts the
  // trouser over the whole lower torso and the garment only from the sternum up. The reasoning
  // and the two named exceptions are at `KIT_PELVIS_TONE`. The entry below is the fallback for a
  // kit the wardrobe lane does not know about.
  pelvis: 'trouser', thighL: 'trouser', thighR: 'trouser', shinL: 'trouser', shinR: 'trouser',
  footL: 'shoe', footR: 'shoe',
  // The trunk carries the garment. Lane A's chest mass already has the trapezius slope and the
  // chest-over-waist overhang §2.1 grades, and a panel shell around it hides both — so the
  // segment takes the garment's own colour and `wardrobe.js` models only the collar, the front
  // edge, the skirt and the hem. The shirt survives at the collar and in the placket.
  torso: 'outer', chest: 'outer',
  upperArmL: 'outer', upperArmR: 'outer',
  forearmL: 'skin', forearmR: 'skin', handL: 'skin', handR: 'skin',
  neck: 'skin', head: 'skin',
  hair: 'hair',
});

/**
 * The dog wears a coat, not a shirt and trousers.
 *
 * Two tones rather than one: a cream body and legs against a tan head and tail, which is how
 * `mp-dog.png` breaks its own animal up and is the only value separation a single-colour dog has.
 * The nose and the eyes take no tone at all — `darkFeature` keeps its own near-black, the way the
 * human face does.
 */
const DOG_SLOT_TONE = Object.freeze({
  dogBody: 'skin',
  dogLegFL: 'skin', dogLegFR: 'skin', dogLegRL: 'skin', dogLegRR: 'skin',
  dogHead: 'trouser',
  dogTail: 'trouser',
});

/**
 * Instance colour per family, or `null` to leave the material's own colour alone.
 *
 * `foot` is a **fallback**, not the shoe's value: `SLOT_TONE.footL/R` resolves to the cast
 * palette's `shoe` and `_dressPose` runs after this, so the palette wins on every figure the
 * dress cache covers. It is held at the darkest rung of the ladder rather than at the mid brown
 * it carried in r01, so the two can no longer disagree about what a boot is worth — the r01
 * plate's missing shoe-against-trouser separation was an occlusion, not a colour: lane A's shin
 * cap hung 120 mm below the ankle in trouser colour and buried the boot. `wardrobe.js` now
 * models a boot upper wide enough to cover it.
 */
const FAMILY_TINT = Object.freeze({
  torso: 'archetype',
  chest: 'archetype',
  upperArm: 'archetype',
  foot: '#241f1d',
});

/** Legacy property names `people.js` still aliases off the batch. */
const LEGACY_ALIAS = Object.freeze({
  body: 'torso', shoulders: 'chest', legs: 'limb', arms: 'upperArm',
});

const HIDDEN = Object.freeze({
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  scale: HIDDEN_SCALE,
});

/** Write one solved part slot into an instanced mesh. A null slot is hidden, never left stale. */
function writePart(mesh, index, slot) {
  const value = slot ?? HIDDEN;
  mesh.setMatrixAt(index, new THREE.Matrix4().compose(value.position, value.quaternion, value.scale));
  if (value.colour) mesh.setColorAt(index, value.colour);
}

/**
 * Build the figure descriptor `write()` consumes from a world placement. The lab uses this;
 * `people.js` builds its own descriptors from navmesh-sampled records.
 */
export function castFigure({
  id, archetypeId, x = 0, y = 0, z = 0, yaw = 0, phase, beat, pendingOutcome = null,
  routeHidden = false,
}) {
  const [, height, width] = styleForPerson(id, archetypeId);
  return {
    id,
    archetypeId,
    position: new THREE.Vector3(x, y, z),
    scale: new THREE.Vector3(width, height, width),
    yaw,
    phase,
    // Per-figure idle clock. `rig.js` prefers this over the batch-level beat, so an idle strip
    // renders four cells of one figure's weight shift exactly as `phase` renders eight cells of
    // its walk. Undefined on the board, where the batch beat drives the whole cast together.
    beat,
    pendingOutcome,
    routeHidden,
  };
}

/**
 * Twenty-two instanced families for the whole cast — fourteen body, eight wardrobe. The meshes
 * are exposed rather than parented to a group of their own, because `PeopleLayer` owns the layer
 * root and the render-purity fixture counts instanced children on it directly.
 */
export class PeopleFigureBatch {
  constructor({ capacity = PERSON_CAPACITY, proportions = PROPORTIONS } = {}) {
    this.capacity = capacity;
    this.proportions = proportions;
    this.materials = createFigureMaterials();

    const geometryFor = {
      contact: () => buildContactGeometry(proportions),
      pelvis: () => buildPelvisGeometry(proportions),
      limb: () => buildLimbSegmentGeometry(proportions),
      foot: () => buildFootGeometry(proportions),
      torso: () => buildTorsoGeometry(proportions),
      chest: () => buildChestGeometry(proportions),
      upperArm: () => buildUpperArmGeometry(proportions),
      forearm: () => buildForearmGeometry(proportions),
      neck: () => buildNeckGeometry(proportions),
      head: () => buildHeadGeometry(proportions),
      face: () => buildFaceGeometry(proportions),
      hair: () => buildHairGeometry(proportions),
      badge: () => buildBadgeGeometry(),
      dogBody: () => buildDogBodyGeometry(),
      dogHead: () => buildDogHeadGeometry(),
      dogLeg: () => buildDogLegGeometry(),
      dogTail: () => buildDogTailGeometry(),
      dogDark: () => buildDogDarkGeometry(),
    };

    this.meshes = [];
    this.families = [];
    /** slot name → { mesh, offset, per } so the write loop is one pass over the pose. */
    this.slotIndex = new Map();
    /** Resolved wardrobe and cast tones, one entry per archetype rather than per figure. */
    this._dressed = new Map();

    for (const family of [...FAMILIES, ...WARDROBE_FAMILIES]) {
      const mesh = instanced(
        family.shape ? WARDROBE_SHAPES[family.shape]() : geometryFor[family.key](),
        this._material(family.material),
        capacity * family.slots.length,
        `v303:people:${family.key}`,
        family.shadow ? CAST_SHADOW : undefined,
      );
      if (family.key === 'contact') mesh.renderOrder = 2;
      this[family.key] = mesh;
      this.meshes.push(mesh);
      this.families.push({ mesh, per: family.slots.length, tint: FAMILY_TINT[family.key] ?? null });
      family.slots.forEach((slotName, offset) => {
        this.slotIndex.set(slotName, {
          mesh, offset, per: family.slots.length, tint: FAMILY_TINT[family.key] ?? null,
        });
      });
    }
    for (const [alias, key] of Object.entries(LEGACY_ALIAS)) this[alias] = this[key];
  }

  /**
   * First material family that exists, by name.
   *
   * `materials.js` is lane E and another seat's file this round, so the geometry lane names what
   * it wants and takes what is there: `shoe` when the material lane has added one, the badge
   * plate until it has. The last resort is a neutral standard material rather than a throw,
   * because a missing key must not take the whole board down mid-round.
   */
  _material(names) {
    for (const name of names) {
      if (this.materials[name]) return this.materials[name];
    }
    this._fallback ??= new THREE.MeshStandardMaterial({
      color: '#b9b2a8', roughness: 0.62, metalness: 0.04, flatShading: true,
    });
    return this._fallback;
  }

  /**
   * Wardrobe and cast tones for one archetype, resolved once and cached.
   *
   * The named consultants are named people, so identity is fixed per archetype rather than
   * re-rolled per record: the mortgage broker is the same greying man in every quarter. What is
   * per-figure is the build, which `castFigure` and `people.js` take from `styleForPerson`.
   *
   * Caching matters at this size. Twenty-nine figures at up to twenty-eight wardrobe pieces each
   * is eight hundred colours and quaternions; resolving them per frame would put allocation in the
   * render loop for no variation gained.
   */
  _dress(archetypeId, identityId = 0) {
    const cacheKey = `${archetypeId}:${identityId}`;
    const cached = this._dressed.get(cacheKey);
    if (cached) return cached;

    const palette = castPalette(`${archetypeId}:${identityId}`, archetypeId, identityId);
    const tones = new Map();
    const map = archetypeId === 'dog' ? DOG_SLOT_TONE : SLOT_TONE;
    for (const [slotName, tone] of Object.entries(map)) {
      const named = slotName === 'pelvis' && archetypeId !== 'dog'
        ? pelvisToneFor(archetypeId) : tone;
      tones.set(slotName, new THREE.Color(palette[named] ?? palette.outer));
    }

    const counters = new Map();
    const pieces = [];
    let dropped = 0;
    const authored = buildWardrobe(archetypeId, palette, {
      id: archetypeId, press: pressFor(archetypeId),
    });
    for (const item of authored) {
      const key = familyKey(item.batch, item.shape);
      const used = counters.get(key) ?? 0;
      if (used >= (WARDROBE_CAPACITY[key] ?? 0)) { dropped += 1; continue; }
      counters.set(key, used + 1);
      pieces.push({
        slot: `wear:${item.batch}:${item.shape}:${used}`,
        anchor: item.anchor,
        offset: new THREE.Vector3(item.x, item.y, item.z),
        size: new THREE.Vector3(item.w, item.h, item.d),
        quaternion: new THREE.Quaternion().setFromEuler(
          new THREE.Euler(item.pitch, item.yaw, item.roll, 'YXZ'),
        ),
        colour: new THREE.Color(item.tone),
      });
    }
    const dress = { tones, pieces, dropped };
    this._dressed.set(cacheKey, dress);
    return dress;
  }

  /**
   * Colour the body from the cast palette and hang the wardrobe off the solved segments.
   *
   * Both halves run after the pose is solved and neither depends on which lane solved it, so the
   * cast keeps its palette and its clothes whether the figure is standing in lane A's bind pose
   * or walking in lane D's cycle. A piece whose anchor slot is hidden this frame is skipped and
   * its instance falls through to `writePart`'s hidden transform rather than being left stale.
   */
  _dressPose(figure, pose) {
    const dress = this._dress(figure.archetypeId, figure.identityId ?? 0);
    // §2.5 asks for hair at the temples under a hard hat, and §2.3 grades a head that has hair at
    // a value separate from the skin. `rig.js` hides the whole hair mass whenever headwear covers
    // the crown, which is why the r01b builder and policeman were bare skin from brow to brim —
    // the one archetype pair whose reference plates most clearly show hair under the hat.
    //
    // Restore it squashed rather than hidden. `HAT_FIT` scales the mass in y only, so the crown
    // drops clear of a brim while the temple locks and the nape — which sit at the head origin's
    // own height and are untouched in x and z — stay exactly where `head.js` put them.
    if (!pose.hair && pose.head && figure.archetypeId !== 'dog') {
      pose.hair = {
        position: pose.head.position.clone(),
        quaternion: pose.head.quaternion.clone(),
        scale: new THREE.Vector3(
          pose.head.scale.x * HAT_FIT.x,
          pose.head.scale.y * HAT_FIT.y,
          pose.head.scale.z * HAT_FIT.z,
        ),
        colour: null,
      };
    }
    for (const [slotName, colour] of dress.tones) {
      if (pose[slotName]) pose[slotName].colour = colour;
    }
    if (figure.routeHidden) return;
    const mul = buildFromScale(figure.scale);
    for (const item of dress.pieces) {
      const parent = pose[item.anchor];
      if (!parent) continue;
      const offset = new THREE.Vector3(
        item.offset.x * mul.width, item.offset.y * mul.height, item.offset.z * mul.width,
      ).applyQuaternion(parent.quaternion);
      pose[item.slot] = {
        position: parent.position.clone().add(offset),
        quaternion: parent.quaternion.clone().multiply(item.quaternion),
        scale: new THREE.Vector3(
          item.size.x * mul.width, item.size.y * mul.height, item.size.z * mul.width,
        ),
        colour: item.colour,
      };
    }
    if (figure.archetypeId === 'site-robot') {
      // The wardrobe brick above is already posed from this anchor; hide the organic skull,
      // face and hair so the robot reads as one box-headed rig rather than a helmeted human.
      pose.head = null;
      pose.face = null;
      pose.hair = null;
    }
  }

  /**
   * The pose for one figure, in the segment slot names of shared brief §2.
   *
   * `rig.js` is lane D and another seat's file this round. When it solves the segment slots this
   * takes them; until it does, the bind pose from `figure.js` is composed against the figure's
   * root here, so the anatomy lane can be captured and graded on a plate without waiting on the
   * gait lane. The bind pose is not an animation — a figure standing in it is standing still.
   */
  _resolvePose(figure, solved) {
    const quadruped = figure.archetypeId === 'dog';
    const stamped = solved?.geometryContract === GEOMETRY_CONTRACT;
    // A quadruped solve is only trusted if it actually carries the quadruped slots. The gait lane
    // used to write the dog into the *biped* slot names because there was no dog geometry to
    // write into; now that there is, a solve that still names `chest` and `shinL` would draw a
    // human trunk lying on its side inside the dog, and a partially-adopted rig must fail loudly
    // rather than half-render.
    if (stamped && (!quadruped || solved.dogBody !== undefined)) return solved;
    if (solved && !this._warned) {
      this._warned = true;
      // Not a throw: a lane mid-round must be able to save a file without taking the board down.
      // Not silence either — a squashed figure with no explanation is what costs a round.
      console.warn(
        stamped
          ? 'people/index.js: the pose solver stamps the geometry contract but does not solve the '
            + 'quadruped slots (dogBody, dogHead, dogLegFL/FR/RL/RR, dogTail, dogNose, dogEyeL/R), '
            + 'so the dog is standing in figure.js\'s bind pose. A solver adopts by calling '
            + 'buildRestPose(PROPORTIONS, { quadruped: true, mul }) and posing those names.'
          : `people/index.js: pose solver does not declare geometryContract "${GEOMETRY_CONTRACT}", `
            + 'so the bind pose from figure.js is driving. A solver adopts by placing parts in '
            + 'world metres against PROPORTIONS.y / PROPORTIONS.natural and returning that key.',
      );
    }

    const { position, scale, yaw = 0, routeHidden = false, archetypeId } = figure;
    if (routeHidden) return {};
    const mul = buildFromScale(scale);
    // The bind pose is a constant of the build, so it is solved once per build and not once per
    // figure per frame. The quadruped's is keyed by build because its slots carry the inverse of
    // the multipliers this method is about to apply — see `figure.js` `quadrupedRestPose`.
    this._rest ??= new Map();
    const key = quadruped ? `dog:${mul.width}:${mul.height}` : 'biped';
    let rest = this._rest.get(key);
    if (!rest) {
      rest = buildRestPose(this.proportions, { quadruped, mul });
      this._rest.set(key, rest);
    }
    const face = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    if (figure.lean > 1e-4) {
      const tilt = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(Math.cos(figure.leanHeading ?? 0), 0, Math.sin(figure.leanHeading ?? 0)),
        figure.lean,
      );
      face.premultiply(tilt);
    }
    const [hex] = styleFor(archetypeId);
    const archetype = new THREE.Color(hex);

    const pose = {};
    for (const [name, local] of Object.entries(rest)) {
      if (!local) { pose[name] = null; continue; }
      const tint = this.slotIndex.get(name)?.tint ?? null;
      pose[name] = {
        position: new THREE.Vector3(
          local.position.x * mul.width, local.position.y * mul.height, local.position.z * mul.width,
        ).applyQuaternion(face).add(position),
        quaternion: face.clone().multiply(local.quaternion),
        scale: new THREE.Vector3(
          local.scale.x * mul.width, local.scale.y * mul.height, local.scale.z * mul.width,
        ),
        colour: tint === 'archetype' ? archetype : (tint ? new THREE.Color(tint) : null),
      };
    }
    // Head, hair and the dark features take one transform, so a face can never slide off a skull.
    if (pose.head) {
      pose.face = {
        position: pose.head.position.clone(),
        quaternion: pose.head.quaternion.clone(),
        scale: pose.head.scale.clone(),
        colour: null,
      };
      pose.hair = { ...pose.head, colour: null };
      // r06 critic: one head recolored. faceFor knobs were dead until this write.
      // Same mesh, per-id scale — no extra draw. Jaw/cranium still need a later geometry pass.
      if (figure.id) {
        const face = faceFor(figure.id);
        pose.face.scale.multiply(new THREE.Vector3(face.eyeX, face.eye, face.nose));
      }
    }
    // Wardrobe is lane C; until it poses through the segment contract these two stay hidden
    // rather than being placed by a lane that does not own them.
    pose.badge = null;
    pose.accessory = null;
    // The dog carries no hair and no human face. A muzzle with human eyes painted on it is worse
    // than a muzzle with none.
    if (quadruped) { pose.hair = null; pose.face = null; }
    return pose;
  }

  /**
   * Solve and write every figure. `figures` is an ordered array of descriptors; a figure may
   * carry its own `phase` to step one member of the cast independently of the rest, which is
   * how the lab renders eight cells of one gait cycle in a single frame.
   */
  write(figures, { phase = 1, reducedMotion = false, beat = null } = {}) {
    const count = Math.min(figures.length, this.capacity);
    for (const { mesh, per } of this.families) mesh.count = count * per;

    for (let index = 0; index < count; index += 1) {
      const figure = figures[index];
      const pose = this._resolvePose(figure, poseFigure(figure, { phase, reducedMotion, beat }));
      this._dressPose(figure, pose);
      for (const [name, entry] of this.slotIndex) {
        writePart(entry.mesh, index * entry.per + entry.offset, pose[name] ?? null);
      }
    }

    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    return count;
  }

  /** Measured, not assumed — `assertPeopleRenderBudget` reads exactly this. */
  stats(instances) {
    return {
      drawCalls: instances ? this.families.length : 0,
      triangles: Math.round(this.families.reduce(
        (sum, { mesh, per }) => sum + geometryTriangles(mesh.geometry) * instances * per, 0,
      )),
      instances,
    };
  }

  /** Triangles one figure costs, across every family. The §3 per-figure ceiling is 7 000. */
  trianglesPerFigure() {
    return Math.round(this.families.reduce(
      (sum, { mesh, per }) => sum + geometryTriangles(mesh.geometry) * per, 0,
    ));
  }

  dispose() {
    for (const mesh of this.meshes) mesh.geometry.dispose();
    disposeFigureMaterials(this.materials);
    this._fallback?.dispose();
    this._dressed.clear();
  }
}

export default PeopleFigureBatch;
