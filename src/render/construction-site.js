// District Deck — residential construction stages (AAA presentation).
// Stages: demolition → excavation (intra-Q) → slab → timber frame → cladding / lock-up.
// Initial and finished building models are not touched. This file is the board-facing API.

import * as THREE from 'three';
import { constructionStageIndex } from '../core/construction-stages.js';
import {
  SiteContext, envelopeSize, targetHeight, storeyCount,
} from './construction/kit.js';
import { addHoarding, addPortaloo, addAccidentOverlay } from './construction/plant.js';
import { addSiteGang } from './construction/crew.js';
import { buildDemolition } from './construction/demolition.js';
import { buildExcavation } from './construction/excavation.js';
import { buildSlab } from './construction/slab.js';
import { buildFrame } from './construction/frame.js';
import { addScaffoldBay, buildCladding } from './construction/cladding.js';
import { buildCompletion } from './construction/completion.js';
import { createRenovationScaffoldGroup } from './construction/renovation.js';
import { bindTapMembers, impulseMember, tickTaps } from './construction/tap.js';
import { attachTicker, requestSiteWorkCycle, tickSite } from './construction/animate.js';
import { syncCompletedBuildings } from './construction/handoff.js';
import { stream } from '../core/rng.js';

/** Tap-to-break chance on heavy plant (basis points). One break per job. */
export const PLANT_BREAK_CHANCE_BP = 1000;
const PLANT_BREAK_KINDS = new Set(['excavator', 'crane', 'cabin']);

const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();

export { createRenovationScaffoldGroup };

export function createConstructionStageGroup({
  parcel,
  construction,
  quarter,
  materials,
  finished = null,
}) {
  const stageIndex = constructionStageIndex(construction, quarter);
  const { w, d } = envelopeSize(parcel);
  const height = targetHeight(construction.toArchetype);
  const storeys = storeyCount(construction.toArchetype);
  const group = new THREE.Group();
  group.name = `construction-stage:${construction.toArchetype}:${stageIndex}`;
  group.position.set(parcel.centre.x, 0, parcel.centre.z);
  group.userData.constructionStage = stageIndex;
  group.userData.parcelId = parcel.id ?? null;
  group.userData.toArchetype = construction.toArchetype;
  group.userData.completionQuarter = construction.completionQuarter;
  group.userData.accident = Boolean(construction.accidentOccurred);
  group.userData.cycleSeconds = 16;
  group.userData.quarter = quarter;

  const ctx = new SiteContext({
    group,
    fit: finished,
    w,
    d,
    height,
    storeys,
    materials,
    seed: `${parcel.id ?? parcel.centre.x}:${construction.toArchetype}:${stageIndex}`,
    stageIndex,
    toArchetype: construction.toArchetype,
  });

  addHoarding(ctx, { gate: stageIndex > 0 });

  if (stageIndex <= 0) {
    buildDemolition(ctx);
    buildExcavation(ctx);
    addPortaloo(ctx, -0.44, 0.42);
    // Lock-up previously owned the only scaffold layer. A low first-quarter bay keeps the
    // demolition/excavation stage legible as active works before the frame rises.
    const scaffold = ctx.layer('scaffold');
    addScaffoldBay(
      ctx,
      scaffold,
      Math.min(5.2, Math.max(3.2, height * 0.34)),
      w * 0.38,
      d * 0.36,
    );
  } else if (stageIndex === 1) {
    buildSlab(ctx);
  } else if (stageIndex === 2) {
    buildFrame(ctx);
  } else if (finished || !buildCompletion(ctx)) {
    buildCladding(ctx);
  }

  if (construction.accidentOccurred) addAccidentOverlay(ctx);

  addSiteGang(ctx);
  bindTapMembers(ctx);
  attachTicker(group, ctx);
  group.userData.tapTargets = ctx.taps;
  requestSiteWorkCycle(group, quarter);
  // Pose at local t=0 (full demolition / inherited pad), then let the existing scene tick
  // latch its clock origin. This preview does not consume the quarter's one work cycle.
  group.userData.progressOverride = 0;
  tickSite(ctx, 0, 0, { reducedMotion: false });
  delete group.userData.progressOverride;
  group.userData.workCycleOrigin = null;
  return group;
}

export function tickConstructionSites(board, dt, elapsed) {
  if (!board) return;
  const reduced = Boolean(board.reducedMotion);
  const records = [
    ...(board.constructionStages?.values?.() ?? []),
    ...(board.renovationScaffolds?.values?.() ?? []),
  ];
  for (const record of records) {
    try {
      const group = record?.group;
      const ctx = group?.userData?.ctx;
      if (!ctx) {
        group?.userData?.tick?.(dt, elapsed, { reducedMotion: reduced });
        continue;
      }
      tickSite(ctx, dt, elapsed, { reducedMotion: reduced });
      tickTaps(ctx, dt, { reducedMotion: reduced });
      if (ctx.rigs.excavator && ctx.taps) {
        const ex = ctx.taps.find((t) => t.kind === 'excavator');
        if (ex?.state) ctx.rigs.excavator.tapYaw = ex.state.thetaY ?? ex.state.thetaX * 0.6;
      }
    } catch (err) {
      console.warn('[construction] tick failed', err);
    }
  }
  try {
    syncCompletedBuildings(board);
  } catch (err) {
    console.warn('[construction] handoff failed', err);
  }
}

function constructionGroups(view) {
  const groups = [];
  for (const record of view.board.constructionStages?.values?.() ?? []) {
    if (record.group) groups.push(record.group);
  }
  for (const record of view.board.renovationScaffolds?.values?.() ?? []) {
    if (record.group) groups.push(record.group);
  }
  return groups;
}

function parcelIdOf(node) {
  let walk = node;
  while (walk) {
    if (walk.userData?.parcelId) return walk.userData.parcelId;
    walk = walk.parent;
  }
  return null;
}

export function findConstructionTap(view, clientX, clientY) {
  if (!view?.board || !view.camera || !view.canvas) return null;
  const rect = view.canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  _pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_pointer, view.camera);
  _raycaster.far = 240;
  const groups = constructionGroups(view);
  if (!groups.length) return null;
  const hits = _raycaster.intersectObjects(groups, true);
  if (!hits.length) return null;
  let rec = null;
  let node = hits[0].object;
  while (node && !rec) {
    rec = node.userData?.constructionTap ?? null;
    if (!rec) node = node.parent;
  }
  if (!rec) {
    const point = hits[0].point;
    let best = Infinity;
    for (const group of groups) {
      for (const tap of group.userData.tapTargets ?? []) {
        if (!tap.node) continue;
        const world = new THREE.Vector3();
        tap.node.getWorldPosition(world);
        const dist = world.distanceTo(point);
        if (dist < best && dist < 2.4) {
          best = dist;
          rec = tap;
        }
      }
    }
  }
  if (!rec) return null;
  const kind = rec.kind ?? rec.node?.userData?.constructionKind ?? 'beam';
  return {
    kind: 'construction',
    rec,
    plantKind: kind,
    label: rec.label ?? kind,
    parcelId: parcelIdOf(rec.node) ?? rec.node?.parent?.userData?.parcelId ?? null,
    distance: hits[0].distance,
    alreadyBroken: Boolean(rec.broken),
  };
}

export function isBreakablePlant(kind, label = '') {
  if (PLANT_BREAK_KINDS.has(kind)) return true;
  const id = String(label);
  return id === 'pump' || id === 'excavator' || id === 'crane';
}

export function rollPlantBreak(seed, parcelId, rec) {
  if (!rec || rec.broken) return false;
  if (!isBreakablePlant(rec.kind, rec.label)) return false;
  const roll = stream(
    seed ?? 0,
    `plant-break:${parcelId ?? 'site'}:${rec.label}:${rec.taps ?? rec.state?.taps ?? 0}`,
  ).int(0, 9999);
  return roll < PLANT_BREAK_CHANCE_BP;
}

export function breakPlantMember(rec) {
  if (!rec?.state) return;
  rec.broken = true;
  rec.state.thetaX = 1.15;
  rec.state.thetaZ = 0.35;
  rec.state.velX = 0;
  rec.state.velZ = 0;
  rec.state.energy = 1;
  rec.state.active = true;
  rec.node.rotation.x = rec.state.thetaX;
  rec.node.rotation.z = rec.state.thetaZ;
}

export function impulseConstructionTap(view, hit, { clientX = 0, clientY = 0 } = {}) {
  const rec = hit?.rec;
  if (!rec) return { broke: false, taps: 0 };
  if (rec.broken) return { broke: false, taps: rec.taps ?? rec.state?.taps ?? 0, alreadyBroken: true };
  const salt = ((clientX * 13 + clientY * 7) % 1000) / 1000;
  const taps = impulseMember(rec, salt);
  const seed = view?.board?.city?.seed ?? view?.city?.seed ?? 0;
  const already = Boolean(hit.alreadyAccident);
  const broke = !already && rollPlantBreak(seed, hit.parcelId, rec);
  if (broke) breakPlantMember(rec);
  return { broke, taps, parcelId: hit.parcelId, label: rec.label, plantKind: rec.kind };
}

export function handleConstructionPointer(view, event) {
  if (event.button != null && event.button !== 0) return false;
  const hit = findConstructionTap(view, event.clientX, event.clientY);
  if (!hit) return false;
  impulseConstructionTap(view, hit, event);
  return true;
}
