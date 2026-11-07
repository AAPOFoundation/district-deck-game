// Meshy walk-shells on the live board. One loaded GLB per unique identity.
// Path and facing still come from PeopleLayer / AmbientLifeLayer.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { identityFor } from '../../core/people-identities.js';
import { STYLE_SWITCHES, silencePersonEmission } from '../style/material-rules.js';
import { PROPORTIONS, unitFrom } from './core.js';
import {
  GAIT,
  wanderTick,
  createWanderState,
  lookTick,
  createLookState,
  walkTimeScale,
  clipShouldPlay,
  cadenceFor,
  meanYaw,
  wrapDelta,
  dampYaw,
  clipRootMotionYaw,
} from './gait.js';

const MANIFEST_URL = 'assets/models/people/manifest.json';
/** Match kit street stature (`PROPORTIONS.height` = 1.38 m), not literal 1.84 m. */
const TARGET_HEIGHT = PROPORTIONS.height;

const MEMBER_HEIGHT = Object.freeze({
  dad: TARGET_HEIGHT * 1.06,
  mum: TARGET_HEIGHT * 0.96,
  boy: TARGET_HEIGHT * 0.56,
  girl: TARGET_HEIGHT * 0.50,
});

function walkUrl(id) {
  return `assets/models/people/${id}/walk.glb`;
}

function memberRole(id) {
  if (id.endsWith('-dad')) return 'dad';
  if (id.endsWith('-mum')) return 'mum';
  if (id.endsWith('-boy')) return 'boy';
  if (id.endsWith('-girl')) return 'girl';
  return null;
}

function heightFor(id) {
  const role = memberRole(id);
  return role ? MEMBER_HEIGHT[role] : TARGET_HEIGHT;
}

function scaleToHeight(root, metres) {
  const box = new THREE.Box3().setFromObject(root);
  const height = box.max.y - box.min.y;
  if (!(height > 0.05)) return { footY: 0, k: 1 };
  const k = metres / height;
  root.scale.multiplyScalar(k);
  box.setFromObject(root);
  return { footY: -box.min.y, k };
}

function findBone(map, names) {
  for (const name of names) {
    if (map[name]) return map[name];
  }
  const keys = Object.keys(map);
  for (const want of names) {
    const hit = keys.find((key) => key.toLowerCase().endsWith(want.toLowerCase()));
    if (hit) return map[hit];
  }
  return null;
}

function computeRestTime(gltf) {
  const clip = firstWalkClip(gltf);
  if (!clip || !(clip.duration > 0.05)) return 0.27;
  const fallback = Math.min(0.27, clip.duration * 0.25);
  const bones = indexBones(gltf.scene);
  const left = findBone(bones, ['LeftFoot', 'mixamorigLeftFoot', 'mixamorig:LeftFoot']);
  const right = findBone(bones, ['RightFoot', 'mixamorigRightFoot', 'mixamorig:RightFoot']);
  if (!left || !right) return fallback;
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const action = mixer.clipAction(clip);
  action.enabled = true;
  action.play();
  const leftPos = new THREE.Vector3();
  const rightPos = new THREE.Vector3();
  let bestT = fallback;
  let bestD = Infinity;
  const samples = 24;
  for (let i = 0; i < samples; i += 1) {
    const t = (i / samples) * clip.duration;
    action.time = t;
    mixer.update(0);
    gltf.scene.updateMatrixWorld(true);
    left.getWorldPosition(leftPos);
    right.getWorldPosition(rightPos);
    const d = Math.hypot(leftPos.x - rightPos.x, leftPos.z - rightPos.z)
      + Math.abs(leftPos.y) + Math.abs(rightPos.y);
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(gltf.scene);
  return bestT;
}

function firstWalkClip(gltf) {
  return gltf.animations.find((clip) => /walk/i.test(clip.name))
    ?? gltf.animations[0]
    ?? null;
}

/**
 * World-space facing baked into the walk clip, cancelled at the root so the chest
 * faces travel. Must NOT use hips .position mid-cycle (in-place sway is 5+ track
 * units and looks like a 25–40° "tilt") or hips local Euler Y (bind axes ≠ facing).
 *
 * Mixamo rest faces +Z: `up × (rightShoulder − leftShoulder)` is +Z at rest.
 * Sign verified on architect / cheap-builder / policeman (rest ≈ 0°, walk mean ≈ −5°).
 */
function measureClipForward(gltf) {
  const clip = firstWalkClip(gltf);
  if (!clip || !(clip.duration > 0.05)) return 0;
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const height = Math.max(0.1, box.max.y - box.min.y);
  const pos = clip.tracks?.find((t) => /hips/i.test(t.name) && /\.position$/.test(t.name));
  if (pos && pos.times.length >= 2) {
    const n = pos.times.length;
    const motion = clipRootMotionYaw(
      pos.values[(n - 1) * 3] - pos.values[0],
      pos.values[(n - 1) * 3 + 2] - pos.values[2],
      height,
    );
    if (motion != null) return motion;
  }
  const bones = indexBones(gltf.scene);
  const left = findBone(bones, [
    'LeftShoulder', 'LeftArm', 'mixamorigLeftShoulder', 'mixamorig:LeftShoulder',
  ]);
  const right = findBone(bones, [
    'RightShoulder', 'RightArm', 'mixamorigRightShoulder', 'mixamorig:RightShoulder',
  ]);
  if (!left || !right) return 0;
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const action = mixer.clipAction(clip);
  action.enabled = true;
  action.play();
  const leftPos = new THREE.Vector3();
  const rightPos = new THREE.Vector3();
  const rightVec = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const yaws = [];
  const samples = 8;
  for (let i = 0; i < samples; i += 1) {
    action.time = (i / samples) * clip.duration;
    mixer.update(0);
    gltf.scene.updateMatrixWorld(true);
    left.getWorldPosition(leftPos);
    right.getWorldPosition(rightPos);
    rightVec.subVectors(rightPos, leftPos);
    forward.crossVectors(up, rightVec);
    if (forward.lengthSq() < 1e-8) continue;
    yaws.push(Math.atan2(forward.x, forward.z));
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(gltf.scene);
  if (!yaws.length) return 0;
  const fix = meanYaw(yaws);
  return Math.abs(wrapDelta(fix)) < GAIT.forwardDeadzone ? 0 : fix;
}

function seedUnit(id, salt) {
  return unitFrom(String(id), 700 + salt);
}

function indexBones(root) {
  const bones = {};
  root.traverse((node) => {
    if (node.name) bones[node.name] = node;
  });
  return bones;
}

function fidgetKind(id) {
  if (id === 'cheap-builder' || id === 'policeman') return 'helmet';
  if (id === 'architect') return 'glasses';
  if (id === 'property-agent') return 'wave';
  if (id === 'mortgage-broker') return 'watch';
  if (id === 'rival-developer') return 'point';
  if (id === 'arsonist') return 'hips';
  if (id === 'squatter') return 'pockets';
  if (id.endsWith('-boy') || id.endsWith('-girl')) return 'fidget';
  if (id.endsWith('-dad')) return 'shift';
  if (id.endsWith('-mum')) return 'look';
  return 'shift';
}

const PACE = Object.freeze({
  'cheap-builder': 0.96,
  architect: 1.02,
  'property-agent': 1.05,
  'mortgage-broker': 0.98,
  'rival-developer': 1.01,
  arsonist: 1.04,
  squatter: 0.95,
  policeman: 0.99,
});

export function gaitFor(id) {
  const cadence = cadenceFor(id);
  const role = memberRole(id);
  if (role === 'boy') return { cadence: 0.70 };
  if (role === 'girl') return { cadence: 0.78 };
  if (PACE[id]) return { cadence: cadence * (0.96 + (PACE[id] - 1) * 0.4) };
  return { cadence };
}

export function fidgetBones() {}

/**
 * Style W1 L3: with ?styleEmit=1 (`emit`) the GLB's own emissive white and emissive map are removed here, at load,
 * because the Meshy people arrive after the scene's first environment walk. The metal and roughness rules need no
 * line of their own: this function already sets metalness 0, roughness at least 0.86 and clearcoat 0.
 */
export function restyleToKit(root, { emit = STYLE_SWITCHES.emit } = {}) {
  const hsl = { h: 0, s: 0, l: 0 };
  root.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    const list = Array.isArray(node.material) ? node.material : [node.material];
    for (const mat of list) {
      if (!mat) continue;
      if ('metalness' in mat) mat.metalness = 0;
      if ('roughness' in mat) mat.roughness = Math.max(0.86, mat.roughness ?? 0.5);
      if ('envMapIntensity' in mat) mat.envMapIntensity = 0.28;
      if ('clearcoat' in mat) mat.clearcoat = 0;
      if ('sheen' in mat) mat.sheen = 0;
      if ('specularIntensity' in mat) mat.specularIntensity = 0.18;
      if (emit) silencePersonEmission(mat);
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      if (mat.color) {
        mat.color.getHSL(hsl);
        mat.color.setHSL(hsl.h, hsl.s * 0.86, Math.min(0.72, hsl.l * 1.02));
      }
      mat.needsUpdate = true;
    }
    node.castShadow = true;
    node.receiveShadow = true;
  });
}

function firstWalkClipDuration(handle) {
  const clip = handle.action?.getClip?.();
  return (clip && clip.duration > 0.05) ? clip.duration : 1;
}

export class MeshyPeoplePool {
  constructor() {
    this.loader = new GLTFLoader();
    this.templates = new Map();
    this.handles = new Map();
    this.root = new THREE.Group();
    this.root.name = 'v332:meshy-people';
    this.ready = false;
    this.pedestrianIds = [];
    this._load = null;
    this._disposed = false;
    this.reducedMotion = false;
  }

  setReducedMotion(on) {
    this.reducedMotion = Boolean(on);
  }

  load() {
    if (this._disposed) return this._load ?? Promise.resolve(this);
    if (this._load) return this._load;
    this._load = this._loadAll();
    return this._load;
  }

  async _loadAll() {
    if (this._disposed) return this;
    let manifest = { cast: [], pedestrians: [] };
    try {
      const res = await fetch(MANIFEST_URL);
      if (res.ok) manifest = await res.json();
    } catch {
      if (this._disposed) return this;
      this.ready = true;
      return this;
    }
    if (this._disposed) return this;
    const entries = [...(manifest.cast ?? []), ...(manifest.pedestrians ?? [])];
    this.ready = true;
    const chunk = 4;
    for (let i = 0; i < entries.length && !this._disposed; i += chunk) {
      await Promise.all(entries.slice(i, i + chunk).map(async (entry) => {
        try {
          const gltf = await this.loader.loadAsync(walkUrl(entry.id));
          if (this._disposed) return;
          restyleToKit(gltf.scene);
          const restT = computeRestTime(gltf);
          const forwardFix = measureClipForward(gltf);
          this.templates.set(entry.id, { gltf: { scene: gltf.scene, animations: gltf.animations }, entry, restT, forwardFix });
        } catch (err) {
          console.warn(`meshy-people: failed ${entry.id}`, err?.message ?? err);
        }
      }));
      if (this._disposed) return this;
      this.pedestrianIds = (manifest.pedestrians ?? [])
        .map((row) => row.id)
        .filter((id) => this.templates.has(id));
    }
    return this;
  }

  has(id) {
    return this.templates.has(id);
  }

  familyMembers(identityId = 0) {
    const ident = identityFor('family', identityId);
    return [...(ident.members ?? [])];
  }

  shellIdForPerson(person) {
    if (!person) return null;
    if (person.archetypeId === 'dog' || person.archetypeId === 'avatar') return null;
    if (person.archetypeId === 'family') {
      const members = this.familyMembers(person.identityId ?? 0);
      const mum = members.find((id) => id.endsWith('-mum')) ?? members[0];
      return mum && this.templates.has(mum) ? mum : null;
    }
    const id = person.archetypeId;
    return this.templates.has(id) ? id : null;
  }

  familyExtras(person) {
    if (person?.archetypeId !== 'family') return [];
    const primary = this.shellIdForPerson(person);
    return this.familyMembers(person.identityId ?? 0)
      .filter((id) => id !== primary && this.templates.has(id))
      .map((id) => {
        const role = memberRole(id);
        const offset = role === 'dad' ? { dx: 0.95, dz: 0.15 }
          : role === 'boy' ? { dx: -0.55, dz: 0.55 }
            : { dx: 0.4, dz: 0.7 };
        return {
          id,
          ...offset,
          height: heightFor(id),
          facing: (unitFrom(id, 11) - 0.5) * 1.2,
        };
      });
  }

  pedestrianIdAt(index) {
    if (!this.pedestrianIds?.length) return null;
    return this.pedestrianIds[index] ?? null;
  }

  _spawn(id, key) {
    const packed = this.templates.get(id);
    if (!packed) return null;
    const root = cloneSkinned(packed.gltf.scene);
    root.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    const { footY, k } = scaleToHeight(root, heightFor(id));
    const mixer = new THREE.AnimationMixer(root);
    const clip = firstWalkClip(packed.gltf);
    const action = clip ? mixer.clipAction(clip) : null;
    const phase = seedUnit(id + key, 1);
    const restT = packed.restT ?? 0.27;
    if (action) {
      action.enabled = true;
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      action.time = restT;
      action.timeScale = 0;
      action.paused = true;
    }
    this.root.add(root);
    const bones = indexBones(root);
    const handle = {
      id,
      key,
      root,
      mixer,
      action,
      footY,
      scaleK: k,
      naturalSpeed: GAIT.naturalWalk * k,
      bones,
      neck: findBone(bones, ['neck', 'Neck', 'mixamorigNeck', 'mixamorig:Neck']),
      head: findBone(bones, ['Head', 'head', 'mixamorigHead', 'mixamorig:Head']),
      spine: findBone(bones, ['Spine01', 'Spine', 'mixamorigSpine', 'mixamorig:Spine']),
      leftUpLeg: findBone(bones, ['LeftUpLeg', 'LeftUpperLeg', 'mixamorigLeftUpLeg']),
      rightUpLeg: findBone(bones, ['RightUpLeg', 'RightUpperLeg', 'mixamorigRightUpLeg']),
      leftLoLeg: findBone(bones, ['LeftLeg', 'LeftLowerLeg', 'mixamorigLeftLeg']),
      rightLoLeg: findBone(bones, ['RightLeg', 'RightLowerLeg', 'mixamorigRightLeg']),
      leftFoot: findBone(bones, ['LeftFoot', 'mixamorigLeftFoot']),
      rightFoot: findBone(bones, ['RightFoot', 'mixamorigRightFoot']),
      restT,
      forwardFix: packed.forwardFix ?? 0,
      wander: createWanderState(0, 0, 0, phase),
      look: createLookState(phase),
      lastX: null,
      lastZ: null,
      clipPose: null,
      restLegs: null,
      clipLegs: null,
    };
    this._captureRestLegs(handle);
    this.handles.set(key, handle);
    return handle;
  }

  _freezeWalk(handle) {
    if (!handle.action) return;
    handle.action.enabled = true;
    handle.action.timeScale = 0;
    handle.action.paused = true;
    handle.mixer.update(0);
  }

  _playWalk(handle, dt, speed) {
    if (!handle.action) return;
    handle.action.paused = false;
    handle.action.enabled = true;
    const spec = gaitFor(handle.id);
    handle.action.timeScale = walkTimeScale(
      speed, handle.naturalSpeed || GAIT.naturalWalk, spec.cadence,
    );
    handle.mixer.update(Math.max(1 / 120, dt));
  }

  _copyQuat(store, bone) {
    if (!bone) return store;
    return (store ?? new THREE.Quaternion()).copy(bone.quaternion);
  }

  _captureRestLegs(handle) {
    handle.restLegs = {
      leftUp: this._copyQuat(null, handle.leftUpLeg),
      rightUp: this._copyQuat(null, handle.rightUpLeg),
      leftLo: this._copyQuat(null, handle.leftLoLeg),
      rightLo: this._copyQuat(null, handle.rightLoLeg),
      leftUpPos: handle.leftUpLeg ? handle.leftUpLeg.position.clone() : null,
      rightUpPos: handle.rightUpLeg ? handle.rightUpLeg.position.clone() : null,
      leftFootY: handle.leftFoot ? handle.leftFoot.position.y : 0,
      rightFootY: handle.rightFoot ? handle.rightFoot.position.y : 0,
      leftFootPos: handle.leftFoot ? handle.leftFoot.position.clone() : null,
      rightFootPos: handle.rightFoot ? handle.rightFoot.position.clone() : null,
    };
  }

  _restoreClipPose(handle) {
    const pose = handle.clipPose;
    if (!pose) return;
    if (handle.neck && pose.neck) handle.neck.quaternion.copy(pose.neck);
    if (handle.head && pose.head) handle.head.quaternion.copy(pose.head);
    if (handle.spine && pose.spine) handle.spine.quaternion.copy(pose.spine);
    const legs = handle.clipLegs;
    if (!legs) return;
    if (handle.leftUpLeg && legs.leftUp) handle.leftUpLeg.quaternion.copy(legs.leftUp);
    if (handle.rightUpLeg && legs.rightUp) handle.rightUpLeg.quaternion.copy(legs.rightUp);
    if (handle.leftLoLeg && legs.leftLo) handle.leftLoLeg.quaternion.copy(legs.leftLo);
    if (handle.rightLoLeg && legs.rightLo) handle.rightLoLeg.quaternion.copy(legs.rightLo);
    if (handle.leftUpLeg && handle.restLegs?.leftUpPos) {
      handle.leftUpLeg.position.copy(handle.restLegs.leftUpPos);
    }
    if (handle.rightUpLeg && handle.restLegs?.rightUpPos) {
      handle.rightUpLeg.position.copy(handle.restLegs.rightUpPos);
    }
    if (handle.leftFoot && handle.restLegs?.leftFootPos) {
      handle.leftFoot.position.copy(handle.restLegs.leftFootPos);
    }
    if (handle.rightFoot && handle.restLegs?.rightFootPos) {
      handle.rightFoot.position.copy(handle.restLegs.rightFootPos);
    }
  }

  _captureClipPose(handle) {
    handle.clipPose = handle.clipPose ?? {};
    if (handle.neck) {
      handle.clipPose.neck = (handle.clipPose.neck ?? new THREE.Quaternion()).copy(handle.neck.quaternion);
    }
    if (handle.head) {
      handle.clipPose.head = (handle.clipPose.head ?? new THREE.Quaternion()).copy(handle.head.quaternion);
    }
    if (handle.spine) {
      handle.clipPose.spine = (handle.clipPose.spine ?? new THREE.Quaternion()).copy(handle.spine.quaternion);
    }
    handle.clipLegs = handle.clipLegs ?? {};
    handle.clipLegs.leftUp = this._copyQuat(handle.clipLegs.leftUp, handle.leftUpLeg);
    handle.clipLegs.rightUp = this._copyQuat(handle.clipLegs.rightUp, handle.rightUpLeg);
    handle.clipLegs.leftLo = this._copyQuat(handle.clipLegs.leftLo, handle.leftLoLeg);
    handle.clipLegs.rightLo = this._copyQuat(handle.clipLegs.rightLo, handle.rightLoLeg);
  }

  _applyStrideStyle(handle, playing) {
    const rest = handle.restLegs;
    const clip = handle.clipLegs;
    if (!rest || !clip) return;
    const duration = firstWalkClipDuration(handle);
    const phase = (playing && handle.action)
      ? (((handle.action.time / duration) % 1 + 1) % 1)
      : 0;
    const ang = phase * Math.PI * 2;
    const passAmt = Math.abs(Math.cos(ang));
    const k = playing
      ? GAIT.strideCompress + (GAIT.passCompress - GAIT.strideCompress) * passAmt
      : GAIT.strideCompress * 0.45;
    const slerp = (bone, clipQ, restQ) => {
      if (!bone || !clipQ || !restQ) return;
      bone.quaternion.copy(clipQ).slerp(restQ, k);
    };
    slerp(handle.leftUpLeg, clip.leftUp, rest.leftUp);
    slerp(handle.rightUpLeg, clip.rightUp, rest.rightUp);
    slerp(handle.leftLoLeg, clip.leftLo, rest.leftLo);
    slerp(handle.rightLoLeg, clip.rightLo, rest.rightLo);
    if (rest.leftUpPos && handle.leftUpLeg) handle.leftUpLeg.position.copy(rest.leftUpPos);
    if (rest.rightUpPos && handle.rightUpLeg) handle.rightUpLeg.position.copy(rest.rightUpPos);
    handle.root.updateMatrixWorld(true);
    this._squeezeLateral(handle, handle.leftUpLeg, GAIT.stanceNarrow, GAIT.stanceHalf);
    this._squeezeLateral(handle, handle.rightUpLeg, GAIT.stanceNarrow, GAIT.stanceHalf);
    handle.root.updateMatrixWorld(true);
    const adduct = playing
      ? GAIT.stanceAdduct + (GAIT.passAdduct - GAIT.stanceAdduct) * passAmt
      : GAIT.passAdduct;
    this._adductThigh(handle, handle.leftUpLeg, handle.leftLoLeg, adduct);
    this._adductThigh(handle, handle.rightUpLeg, handle.rightLoLeg, adduct);
    if (!playing || !handle.action || this.reducedMotion) {
      if (rest.leftFootPos && handle.leftFoot) handle.leftFoot.position.copy(rest.leftFootPos);
      if (rest.rightFootPos && handle.rightFoot) handle.rightFoot.position.copy(rest.rightFootPos);
      handle.root.updateMatrixWorld(true);
      this._squeezeLateral(handle, handle.leftFoot, GAIT.footTrack, GAIT.footHalf);
      this._squeezeLateral(handle, handle.rightFoot, GAIT.footTrack, GAIT.footHalf);
      return;
    }
    const leftSwing = Math.max(0, Math.cos(ang));
    const rightSwing = Math.max(0, Math.cos(ang + Math.PI));
    if (handle.leftLoLeg) handle.leftLoLeg.rotateX(-GAIT.swingKnee * leftSwing);
    if (handle.rightLoLeg) handle.rightLoLeg.rotateX(-GAIT.swingKnee * rightSwing);
    if (rest.leftFootPos && handle.leftFoot) handle.leftFoot.position.copy(rest.leftFootPos);
    if (rest.rightFootPos && handle.rightFoot) handle.rightFoot.position.copy(rest.rightFootPos);
    handle.root.updateMatrixWorld(true);
    this._liftFootWorld(handle.leftFoot, leftSwing * GAIT.swingLift);
    this._liftFootWorld(handle.rightFoot, rightSwing * GAIT.swingLift);
    handle.root.updateMatrixWorld(true);
    this._squeezeLateral(handle, handle.leftFoot, GAIT.footTrack, GAIT.footHalf);
    this._squeezeLateral(handle, handle.rightFoot, GAIT.footTrack, GAIT.footHalf);
  }

  /**
   * Cancel frontal-plane thigh lean so the swing is sagittal (one foot in front
   * of the other) instead of a Mixamo wishbone. Axis-free: uses hip→knee in
   * world vs the figure's own right vector.
   */
  _adductThigh(handle, upLeg, loLeg, amount) {
    if (!upLeg || !loLeg || !upLeg.parent || !(amount > 0.001)) return;
    const a = this._stanceA ?? (this._stanceA = new THREE.Vector3());
    const b = this._stanceB ?? (this._stanceB = new THREE.Vector3());
    upLeg.getWorldPosition(a);
    loLeg.getWorldPosition(b);
    b.sub(a);
    if (b.lengthSq() < 1e-8) return;
    b.normalize();
    const rootQ = this._stanceRootQ ?? (this._stanceRootQ = new THREE.Quaternion());
    handle.root.getWorldQuaternion(rootQ);
    const right = this._stanceRight ?? (this._stanceRight = new THREE.Vector3());
    const fwd = this._stanceFwd ?? (this._stanceFwd = new THREE.Vector3());
    right.set(1, 0, 0).applyQuaternion(rootQ);
    fwd.set(0, 0, 1).applyQuaternion(rootQ);
    const lateral = b.dot(right);
    if (Math.abs(lateral) < 0.002) return;
    const dq = this._stanceDelta ?? (this._stanceDelta = new THREE.Quaternion());
    dq.setFromAxisAngle(fwd, -lateral * amount);
    const worldQ = this._stanceQ ?? (this._stanceQ = new THREE.Quaternion());
    const parentQ = this._stanceParentQ ?? (this._stanceParentQ = new THREE.Quaternion());
    upLeg.getWorldQuaternion(worldQ);
    upLeg.parent.getWorldQuaternion(parentQ);
    worldQ.premultiply(dq);
    upLeg.quaternion.copy(parentQ.invert()).multiply(worldQ);
  }

  _squeezeLateral(handle, bone, amount, halfMetres = 0) {
    if (!bone || !bone.parent || !(amount > 0.001)) return;
    const w = this._footWorld ?? (this._footWorld = new THREE.Vector3());
    bone.getWorldPosition(w);
    handle.root.worldToLocal(w);
    w.x *= (1 - amount);
    if (halfMetres > 0) {
      const sx = Math.abs(handle.root.scale.x) || 1;
      const floorLocal = halfMetres / sx;
      const sign = w.x < 0 ? -1 : w.x > 0 ? 1 : 0;
      if (sign) w.x = sign * Math.max(floorLocal, Math.abs(w.x));
    }
    handle.root.localToWorld(w);
    bone.parent.worldToLocal(w);
    bone.position.copy(w);
  }

  _liftFootWorld(foot, metres) {
    if (!foot || !foot.parent || !(metres > 0.0005)) return;
    const w = this._footWorld ?? (this._footWorld = new THREE.Vector3());
    foot.getWorldPosition(w);
    w.y += metres;
    foot.parent.worldToLocal(w);
    foot.position.copy(w);
  }

  _applyPostMixer(handle, dt, idle, worldLookYaw) {
    const seedFn = (salt) => seedUnit(handle.id + handle.key, 700 + Math.floor(salt * 1000) % 97);
    const look = lookTick(handle.look, {
      facing: handle.wander.facing,
      worldLookYaw,
      dt,
      idle,
      reducedMotion: this.reducedMotion,
      seedFn,
    });
    const q = handle._lookQ ?? (handle._lookQ = new THREE.Quaternion());
    const axis = handle._lookAxis ?? (handle._lookAxis = new THREE.Vector3(0, 1, 0));
    if (handle.neck && handle.clipPose?.neck) {
      q.setFromAxisAngle(axis, look.neck);
      handle.neck.quaternion.copy(handle.clipPose.neck).multiply(q);
    }
    if (handle.head && handle.clipPose?.head) {
      q.setFromAxisAngle(axis, look.head);
      handle.head.quaternion.copy(handle.clipPose.head).multiply(q);
    }
    if (handle.spine && handle.clipPose?.spine) {
      const breath = (!this.reducedMotion && idle)
        ? Math.sin(handle.wander.clock * 1.55) * 0.012 : 0;
      const xAxis = handle._spineAxis ?? (handle._spineAxis = new THREE.Vector3(1, 0, 0));
      q.setFromAxisAngle(xAxis, breath);
      handle.spine.quaternion.copy(handle.clipPose.spine).multiply(q);
    }
  }

  place(key, id, { x, y, z, yaw, dt, walking, hidden, wander = false, lookYaw = null }) {
    if (!id || hidden) {
      const existing = this.handles.get(key);
      if (existing) existing.root.visible = false;
      return false;
    }
    let handle = this.handles.get(key);
    if (!handle || handle.id !== id) {
      if (handle) {
        this.root.remove(handle.root);
        handle.mixer.stopAllAction();
      }
      handle = this._spawn(id, key);
      if (!handle) return false;
    }
    handle.root.visible = true;
    const traveling = Boolean(walking);
    const kid = Boolean(memberRole(id) === 'boy' || memberRole(id) === 'girl');
    const seedFn = (salt) => seedUnit(`${handle.id}|${handle.key}|${Math.floor(handle.wander.clock * 20)}`, salt);
    if (handle.wander.facing == null || Number.isNaN(handle.wander.facing)) {
      handle.wander = createWanderState(x, z, yaw, seedUnit(id + key, 1));
    }
    wanderTick(handle.wander, {
      homeX: x,
      homeZ: z,
      homeYaw: yaw,
      allowWander: Boolean(wander) && !traveling && !this.reducedMotion,
      kid,
      reducedMotion: this.reducedMotion,
    }, Math.max(0, dt), seedFn);

    if (traveling) {
      handle.wander.x = x;
      handle.wander.z = z;
      const jump = Math.abs(wrapDelta(yaw - handle.wander.facing));
      if (handle.lastX == null || jump > GAIT.travelerSnap) {
        handle.wander.facing = yaw;
      } else {
        handle.wander.facing = dampYaw(
          handle.wander.facing, yaw, Math.max(0, dt), GAIT.walkDampRate, GAIT.walkMaxRate,
        );
      }
    }
    const px = traveling || this.reducedMotion || !wander ? x : handle.wander.x;
    const pz = traveling || this.reducedMotion || !wander ? z : handle.wander.z;
    handle.root.position.set(px, y + (handle.footY || 0), pz);
    // Keep the ground anchor separate from the model's authored foot correction.
    (handle.groundAnchor ??= new THREE.Vector3()).set(px, y, pz);
    const face = handle.wander.facing;
    handle.root.rotation.set(0, face - (handle.forwardFix || 0), 0);

    const prevX = handle.lastX;
    const prevZ = handle.lastZ;
    const step = Math.max(dt, 1 / 120);
    const speed = (prevX == null)
      ? (traveling ? GAIT.naturalWalk : 0)
      : Math.hypot(px - prevX, pz - prevZ) / step;
    handle.lastX = px;
    handle.lastZ = pz;

    const playing = !this.reducedMotion && clipShouldPlay(speed);
    this._restoreClipPose(handle);
    if (playing) this._playWalk(handle, dt, speed);
    else this._freezeWalk(handle);
    this._captureClipPose(handle);
    this._applyStrideStyle(handle, playing);
    this._applyPostMixer(
      handle,
      dt,
      !playing,
      Number.isFinite(lookYaw) ? lookYaw : null,
    );
    return true;
  }

  /** Last placed ground point in world coordinates, including idle wander. */
  groundAnchorOf(key) {
    const handle = this.handles.get(key);
    if (!handle?.groundAnchor) return null;
    for (let node = handle.root; node; node = node.parent) if (!node.visible) return null;
    return this.root.localToWorld(handle.groundAnchor.clone());
  }

  prunePrefix(prefix, liveKeys) {
    for (const [key, handle] of this.handles) {
      if (!key.startsWith(prefix)) continue;
      if (liveKeys.has(key)) continue;
      this.root.remove(handle.root);
      handle.mixer.stopAllAction();
      this.handles.delete(key);
    }
  }

  prune(liveKeys) {
    for (const [key, handle] of this.handles) {
      if (liveKeys.has(key)) continue;
      this.root.remove(handle.root);
      handle.mixer.stopAllAction();
      this.handles.delete(key);
    }
  }

  dispose() {
    this._disposed = true;
    this.prune(new Set());
    this.templates.clear();
    this.pedestrianIds = [];
    this.ready = false;
  }
}

export default MeshyPeoplePool;
