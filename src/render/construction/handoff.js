// After a residential job settles, board.js disposes the construction group and
// tries to grow the finished kit via beginCompletion / dynamic buildings.
// L2 (apartment-permit) is never map-start stock. If that swap leaves an empty
// pad, plant the finished kit here as a regular Mesh (construction lane only).

import * as THREE from 'three';
import { assembleBuilding } from '../building-kit.js';
import { activeParcel } from '../../core/city.js';
import { ARCHETYPES } from '../../core/content.js';

const watch = new WeakMap();

function boardWatch(board) {
  let rec = watch.get(board);
  if (!rec) {
    rec = { seen: new Map(), planted: new Map() };
    watch.set(board, rec);
  }
  return rec;
}

function visibleBoardBuilding(board, id) {
  const dyn = board.dynamicBuildings?.get(id)?.group;
  if (dyn?.children?.length) return true;
  const anim = board.completionAnimations?.get(id)?.group;
  if (anim?.children?.length) return true;
  return false;
}

function disposePlant(board, group) {
  if (!group) return;
  board.root?.remove(group);
  group.parent?.remove(group);
}

function fallbackMass(materials, archetypeId) {
  const storeys = Math.max(4, ARCHETYPES[archetypeId]?.storeys ?? 5);
  const h = Math.max(12, storeys * 3.05);
  const mat = materials?.get?.('render', { variant: 'cs-handoff', color: '#e6ddd0', roughness: 0.84 })
    ?? new THREE.MeshStandardMaterial({ color: '#e6ddd0', roughness: 0.84 });
  const roof = materials?.get?.('painted_metal', { variant: 'cs-handoff-roof', color: '#6a7278', roughness: 0.48 })
    ?? new THREE.MeshStandardMaterial({ color: '#6a7278', roughness: 0.5 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(10.6, h, 9.4), mat);
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.ownsGeometry = true;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(11.0, 0.28, 9.8), roof);
  cap.position.y = h + 0.12;
  cap.castShadow = true;
  cap.userData.ownsGeometry = true;
  g.add(body, cap);
  return g;
}

function plantFinished(board, id, archetypeId) {
  const parcel = activeParcel(board.city, board.lastState, id);
  if (!parcel || !ARCHETYPES[archetypeId]) return null;
  const group = new THREE.Group();
  group.name = `construction-handoff:${id}:${archetypeId}`;
  const offset = parcel.placement?.modelOffset ?? { x: 0, z: 0 };
  group.position.set(
    (parcel.centre?.x ?? 0) + (offset.x ?? 0),
    0,
    (parcel.centre?.z ?? 0) + (offset.z ?? 0),
  );
  const scale = parcel.placement?.modelScale;
  if (scale && typeof scale === 'object') {
    group.scale.set(scale.x ?? 1, scale.y ?? 1, scale.z ?? 1);
  }
  let model = null;
  try {
    if (board.materials) {
      model = assembleBuilding(archetypeId, board.materials, {
        quality: board.quality ?? 'high',
        facade: 0,
        districtId: parcel.districtId ?? null,
      });
    }
  } catch (err) {
    if (!/MaterialLibrary/.test(String(err))) {
      console.warn('[construction] handoff assemble failed', archetypeId, err);
    }
  }
  if (model?.parts?.length) {
    for (const part of model.parts) {
      if (!part?.geometry || !part?.material) continue;
      const mesh = new THREE.Mesh(part.geometry, part.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }
  if (!group.children.length) {
    const mass = fallbackMass(board.materials, archetypeId);
    while (mass.children.length) group.add(mass.children[0]);
  }
  if (!group.children.length) return null;
  group.userData.handoffArchetype = archetypeId;
  board.root.add(group);
  return group;
}

export function syncCompletedBuildings(board) {
  if (!board) return;
  const rec = boardWatch(board);
  const state = board.lastState;
  const stages = board.constructionStages;

  for (const [id, record] of stages ?? []) {
    const to = record?.toArchetype
      ?? record?.group?.userData?.toArchetype
      ?? null;
    if (to) rec.seen.set(id, to);
  }

  if (!state?.holdings) return;

  for (const [id, toArchetype] of rec.seen) {
    const holding = state.holdings[id];
    if (!holding) {
      const old = rec.planted.get(id);
      if (old) {
        disposePlant(board, old);
        rec.planted.delete(id);
      }
      rec.seen.delete(id);
      continue;
    }
    if (holding.construction || stages?.has(id)) {
      const old = rec.planted.get(id);
      if (old) {
        disposePlant(board, old);
        rec.planted.delete(id);
      }
      continue;
    }
    if (visibleBoardBuilding(board, id)) {
      const old = rec.planted.get(id);
      if (old) {
        disposePlant(board, old);
        rec.planted.delete(id);
      }
      rec.seen.delete(id);
      continue;
    }
    if (rec.planted.has(id)) continue;
    const finish = holding.archetypeId
      ?? state.parcelStatus?.[id]?.builtArchetypeId
      ?? toArchetype;
    const group = plantFinished(board, id, finish);
    if (group) rec.planted.set(id, group);
  }
}

export function _handoffInternalsForTest() {
  return { watch };
}
