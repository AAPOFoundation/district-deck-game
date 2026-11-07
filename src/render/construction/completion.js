// Stage 3 — lock-up / completed building.
// L1 (cottage / townhouse) keeps the weatherboard house in cladding.js.
// L2+ (apartment-permit and taller) must read as a finished low-rise, not a cottage.

import * as THREE from 'three';
import { assembleBuilding } from '../building-kit.js';
import { box, cyl, isApartmentFinish } from './kit.js';
import { addScaffoldBay } from './cladding.js';
import { addSiteCabin, addSkip, addTrafficCones } from './plant.js';

function plantKitModel(parent, model) {
  if (!model?.parts?.length) return 0;
  let added = 0;
  for (const part of model.parts) {
    if (!part?.geometry || !part?.material) continue;
    const mesh = new THREE.Mesh(part.geometry, part.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    parent.add(mesh);
    added += 1;
  }
  return added;
}

/** Try the real finished kit. Never mutates the kit — display only. */
export function tryPlantFinishedModel(ctx) {
  const id = ctx.toArchetype;
  if (!id || !ctx.materials) return false;
  try {
    const model = assembleBuilding(id, ctx.materials, {
      quality: 'high',
      facade: 0,
      districtId: null,
    });
    const layer = ctx.layer('completed');
    const n = plantKitModel(layer, model);
    if (!n) {
      layer.removeFromParent();
      ctx.layers.delete('completed');
      return false;
    }
    layer.userData.finishedKit = id;
    return true;
  } catch (err) {
    if (!/MaterialLibrary/.test(String(err))) {
      console.warn('[construction] finished kit failed', id, err);
    }
    return false;
  }
}

function buildApartmentLockup(ctx, { standin = true } = {}) {
  const { w, d, height, storeys, palette: P } = ctx;
  const levels = Math.max(4, Math.min(storeys, 6));
  const storeyH = Math.min(3.15, Math.max(2.7, height / (levels + 0.35)));
  const wallH = 0.28 + levels * storeyH;
  const halfW = w * 0.36;
  const halfD = d * 0.33;
  const houseW = halfW * 2;
  const houseD = halfD * 2;
  const wallT = 0.22;

  const ghost = ctx.layer('frame-ghost');
  for (let lv = 0; lv < levels; lv += 1) {
    const y = 0.3 + lv * storeyH + storeyH * 0.48;
    for (const t of [-0.38, -0.13, 0.13, 0.38]) {
      box(ghost, 0.13, storeyH * 0.86, 0.13, P.pine, t * houseW, y, -halfD + 0.16);
      box(ghost, 0.13, storeyH * 0.86, 0.13, P.pine, t * houseW, y, halfD - 0.16);
    }
    box(ghost, houseW * 0.92, 0.1, 0.1, P.plate, 0, 0.3 + (lv + 1) * storeyH, halfD - 0.16);
  }

  const shell = ctx.layer('shell');
  box(shell, houseW + 0.55, 0.22, houseD + 0.55, P.slab, 0, 0.11, 0, { cast: false, receive: true });
  box(shell, houseW + 0.12, storeyH * 0.92, wallT, P.brick, 0, storeyH * 0.52, halfD);
  box(shell, houseW + 0.12, storeyH * 0.92, wallT, P.brick, 0, storeyH * 0.52, -halfD);
  box(shell, wallT, storeyH * 0.92, houseD + 0.12, P.brick, halfW, storeyH * 0.52, 0);
  box(shell, wallT, storeyH * 0.92, houseD + 0.12, P.brick, -halfW, storeyH * 0.52, 0);

  const shaftH = wallH - storeyH * 0.88;
  const shaftY = storeyH * 0.88 + shaftH / 2;
  box(shell, houseW, shaftH, wallT, P.render, 0, shaftY, halfD);
  box(shell, houseW, shaftH, wallT, P.render, 0, shaftY, -halfD);
  box(shell, wallT, shaftH, houseD, P.render, halfW, shaftY, 0);
  box(shell, wallT, shaftH, houseD, P.render, -halfW, shaftY, 0);
  box(shell, houseW * 0.34, shaftH, 0.08, P.brick, -houseW * 0.28, shaftY, halfD + 0.05);
  box(shell, houseW * 0.34, shaftH, 0.08, P.brick, houseW * 0.28, shaftY, halfD + 0.05);

  const doorW = 1.15;
  const doorH = 2.15;
  const doorX = 0;
  box(shell, doorW, doorH, 0.08, P.black, doorX, doorH / 2 + 0.12, halfD + 0.04, { cast: false });
  box(shell, doorW + 0.22, 0.12, 0.18, P.steelDark, doorX, doorH + 0.22, halfD + 0.08);
  box(shell, 1.6, 0.1, 0.7, P.slab, doorX, 0.16, halfD + 0.48, { cast: false, receive: true });

  const winW = Math.min(1.28, houseW * 0.16);
  const winH = Math.min(1.22, storeyH * 0.42);
  const bays = houseW > 7.4 ? [-0.32, 0, 0.32] : [-0.22, 0.22];
  const openings = [];
  for (let level = 0; level < levels; level += 1) {
    const y = 0.55 + level * storeyH + winH / 2 + (level === 0 ? 0.15 : 0);
    for (const t of bays) {
      openings.push({ x: t * houseW, y, z: halfD, alongX: true });
      openings.push({ x: t * houseW, y, z: -halfD, alongX: true });
    }
    openings.push({ x: halfW, y, z: 0, alongX: false });
    openings.push({ x: -halfW, y, z: 0, alongX: false });
  }
  for (const op of openings) {
    if (op.alongX) {
      box(shell, winW, winH, wallT + 0.06, P.black, op.x, op.y, op.z, { cast: false });
    } else {
      box(shell, wallT + 0.06, winH, winW, P.black, op.x, op.y, op.z, { cast: false });
    }
  }

  const glazing = ctx.layer('glazing');
  for (const op of openings) {
    if (op.alongX) {
      box(glazing, winW - 0.14, winH - 0.14, 0.04, P.glass, op.x, op.y, op.z + Math.sign(op.z || 1) * 0.06, {
        cast: false,
      });
    } else {
      box(glazing, 0.04, winH - 0.14, winW - 0.14, P.glass, op.x + Math.sign(op.x || 1) * 0.06, op.y, op.z, {
        cast: false,
      });
    }
  }

  const roof = ctx.layer('roof');
  box(roof, houseW + 0.28, 0.18, houseD + 0.28, P.steel, 0, wallH + 0.08, 0);
  box(roof, houseW + 0.38, 0.28, 0.16, P.steelDark, 0, wallH + 0.28, halfD + 0.06);
  box(roof, houseW + 0.38, 0.28, 0.16, P.steelDark, 0, wallH + 0.28, -halfD - 0.06);
  box(roof, 0.16, 0.28, houseD + 0.38, P.steelDark, halfW + 0.06, wallH + 0.28, 0);
  box(roof, 0.16, 0.28, houseD + 0.38, P.steelDark, -halfW - 0.06, wallH + 0.28, 0);
  box(roof, houseW * 0.22, 1.05, houseD * 0.22, P.render, houseW * 0.22, wallH + 0.62, -houseD * 0.08);
  box(roof, houseW * 0.26, 0.12, houseD * 0.26, P.steelDark, houseW * 0.22, wallH + 1.18, -houseD * 0.08);
  cyl(roof, 0.07, 0.08, 0.32, 6, P.steelDark, houseW * 0.22, wallH + 1.38, -houseD * 0.08, { cast: false });

  if (standin) {
    const completed = ctx.layer('completed');
    box(completed, houseW, wallH, houseD, P.render, 0, wallH / 2, 0);
    box(completed, houseW + 0.2, 0.2, houseD + 0.2, P.steel, 0, wallH + 0.08, 0);
    for (const op of openings) {
      if (op.alongX) {
        box(completed, winW - 0.1, winH - 0.1, 0.05, P.glass, op.x, op.y, op.z + Math.sign(op.z || 1) * 0.08, {
          cast: false,
        });
      }
    }
    box(completed, doorW * 0.92, doorH * 0.94, 0.06, P.steelDark, doorX, doorH / 2 + 0.12, halfD + 0.06);
  }

  const scaffold = ctx.layer('scaffold');
  addScaffoldBay(ctx, scaffold, wallH, halfW + 0.7, halfD + 0.7);
  const extraLifts = Math.max(0, Math.min(3, Math.round(wallH / 4) - 3));
  for (let i = 1; i <= extraLifts; i += 1) {
    const y = 6.2 + i * 2.05;
    box(scaffold, houseW + 1.5, 0.06, 0.07, P.steel, 0, y, halfD + 0.7, { cast: false });
    box(scaffold, houseW + 1.5, 0.06, 0.07, P.steel, 0, y, -halfD - 0.7, { cast: false });
  }

  addSiteCabin(ctx, -0.48, -0.48);
  addSkip(ctx, 0.48, 0.5);
  addTrafficCones(ctx, [
    [-1.15, halfD + 1.32],
    [0.25, halfD + 1.42],
    [1.45, halfD + 1.22],
  ]);
}

export function buildCompletion(ctx) {
  if (!isApartmentFinish(ctx.toArchetype)) {
    return false;
  }
  const planted = tryPlantFinishedModel(ctx);
  buildApartmentLockup(ctx, { standin: !planted });
  return true;
}

export { plantKitModel };
