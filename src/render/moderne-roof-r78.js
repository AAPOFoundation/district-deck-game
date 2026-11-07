// R78 — Streamline Moderne roof only. The specialist already builds the continuous
// seamed deck (two rectangles plus the rounded corner) and the slim parapet.
// This module adds one stair/lift head and one screened plant on that deck.
// Placement follows the glass-brick side of the plan. It is not a surveyed
// internal stair core: the facade has no modeled stairwell footprint.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE, STOREY, SETBACK } from '../core/grid.js';

export const R78_HEAD_NAME = 'r78-moderne-roof-head';
export const R78_DOOR_NAME = 'r78-moderne-roof-door';
export const R78_PLANT_NAME = 'r78-moderne-roof-plant';
export const R78_ROOF_NAME = 'r78-moderne-roof';

// Lockstep with walkup-heritage HERITAGE_WALKUP_ENVELOPE['walkup-moderne'] and MODERNE.
const WIDTH_F = 0.895;
const DEPTH_F = 0.82;
const FRONT_SETBACK = 0.09;
const CORNER_R = 2.35;
const GLASS_W = 1.42;
const STOREYS = 4;

const WALL = '#c6c0b4';
const DECK = '#777d7a';
const COPING = '#9b9f99';
const REVEAL = '#2c3033';
const LEAF = '#6a6256';
const LOUVRE = '#3c4450';
const IRON = '#3c423e';

export function moderneRoofFrame(facade = 0) {
  const f = Math.max(0, Math.min(3, facade | 0));
  const lot = TILE - SETBACK * 2;
  const bodyW = lot * WIDTH_F * (1 + (f - 1.5) * 0.018);
  const bodyD = lot * DEPTH_F * (1 + ((f * 2) % 3 - 1) * 0.02);
  const wallRoofY = 0.14 + STOREYS * STOREY;
  const frontZ = lot / 2 - lot * FRONT_SETBACK;
  const backZ = frontZ - bodyD;
  const deckTop = wallRoofY - 0.02;
  const xMax = (bodyW - 0.10) / 2;
  return {
    facade: f,
    bodyW,
    bodyD,
    wallRoofY,
    frontZ,
    backZ,
    deckTop,
    xMax,
    zMin: backZ + 0.05,
    zMax: frontZ - 0.05,
    cx: bodyW / 2 - CORNER_R,
    cz: frontZ - CORNER_R,
    cutR: CORNER_R - 0.16,
    glassX: -bodyW / 2 + 0.42 + GLASS_W / 2,
  };
}

/** True when a plan point lands on the specialist deck, inside the rounded cut. */
export function moderneDeckContains(frame, x, z, margin = 0) {
  if (x < -frame.xMax + margin || x > frame.xMax - margin) return false;
  if (z < frame.zMin + margin || z > frame.zMax - margin) return false;
  if (x <= frame.cx) return true;
  if (z <= frame.cz - margin) return true;
  const dx = x - frame.cx;
  const dz = z - frame.cz;
  const limit = frame.cutR - margin;
  return dx >= -0.02 && dz >= -0.02 && dx * dx + dz * dz <= limit * limit;
}

function samplesFor(x, z, w, d) {
  const insetX = w * 0.32;
  const insetZ = d * 0.32;
  const points = [];
  for (const sx of [-1, 0, 1]) {
    for (const sz of [-1, 0, 1]) {
      points.push([x + sx * insetX, z + sz * insetZ]);
    }
  }
  return points;
}

export function moderneRoofLayout(frame) {
  const headW = 2.24;
  const headD = 1.72;
  const wallH = 2.32;
  const capH = 0.08;
  const copeH = 0.06;
  const headX = -frame.bodyW / 2 + 0.50 + headW / 2;
  const headFront = frame.frontZ - 0.52;
  const headZ = headFront - headD / 2;
  const plantW = 1.62;
  const plantD = 1.18;
  const plantH = 1.02;
  const plantX = headX + headW / 2 + 0.92 + plantW / 2;
  const plantZ = headZ - 0.62;
  const cowlH = 0.20;
  const head = {
    x: headX, z: headZ, w: headW, d: headD, wallH, capH, copeH, cowlH,
    overallH: wallH + capH + copeH + cowlH,
    samples: samplesFor(headX, headZ, headW, headD),
  };
  const plant = {
    x: plantX, z: plantZ, w: plantW, d: plantD, h: plantH,
    samples: samplesFor(plantX, plantZ, plantW, plantD),
  };
  return { frame, head, plant, deckTop: frame.deckTop };
}

/** Deck-band for a downward ray. Roll seams stand 0.022 m on the membrane. */
export function r78SupportBand(deckTop) {
  return { min: deckTop - 0.03, max: deckTop + 0.13 };
}

/** Head, plant, and the walkway outside the side door. Seam XZ must stay out. */
export function moderneRoofServiceClears(layout) {
  const { head, plant } = layout;
  const pad = (x, z, w, d, margin) => ({
    x0: x - w / 2 - margin,
    x1: x + w / 2 + margin,
    z0: z - d / 2 - margin,
    z1: z + d / 2 + margin,
  });
  const doorX = head.x + head.w / 2;
  return [
    pad(head.x, head.z, head.w, head.d, 0.05),
    pad(plant.x, plant.z, plant.w, plant.d, 0.05),
    {
      x0: doorX - 0.02,
      x1: plant.x - plant.w / 2 + 0.02,
      z0: head.z - 0.55,
      z1: head.z + 0.62,
    },
  ];
}

export function r78PointInClear(clears, x, z) {
  return clears.some((region) => x >= region.x0 && x <= region.x1 && z >= region.z0 && z <= region.z1);
}

export function mergeModerneRoofPart(geometries) {
  const signals = geometries.flatMap((geometry) => geometry.userData?.r78Signals ?? []);
  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  merged.name = R78_ROOF_NAME;
  merged.userData.r78Role = R78_ROOF_NAME;
  merged.userData.r78Parts = Object.freeze([R78_HEAD_NAME, R78_DOOR_NAME, R78_PLANT_NAME]);
  merged.userData.r78Signals = Object.freeze(signals);
  merged.userData.p17Signals = Object.freeze(signals);
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  return merged;
}

function paint(geometry, hex) {
  const color = new THREE.Color(hex);
  const count = geometry.attributes.position.count;
  const values = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    values[i * 3] = color.r;
    values[i * 3 + 1] = color.g;
    values[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function box(w, h, d, x, yBase, z, name, hex) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(x, yBase + h / 2, z);
  geometry.name = name;
  return paint(geometry, hex);
}

function tubeX(length, radius, x, y, z, name, hex) {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 8, 1, false);
  geometry.rotateZ(Math.PI / 2);
  geometry.translate(x, y, z);
  geometry.name = name;
  return paint(geometry, hex);
}

function tubeY(radius, height, x, yBase, z, name, hex) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 8, 1, false);
  geometry.translate(x, yBase + height / 2, z);
  geometry.name = name;
  return paint(geometry, hex);
}

function mergeNamed(geometries, name, signals) {
  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  merged.name = name;
  merged.userData.r78Role = name;
  merged.userData.r78Signals = Object.freeze(signals.slice());
  merged.userData.p17Signals = Object.freeze(signals.slice());
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  return merged;
}

export function buildModerneRoofGeometries(layout) {
  const { frame, head, plant } = layout;
  const y0 = frame.deckTop;
  const hx = head.x;
  const hz = head.z;
  const hw = head.w;
  const hd = head.d;
  const wall = 0.14;
  const openW = 0.92;
  const openH = 2.00;
  const right = hx + hw / 2 - wall / 2;
  const signals = [];
  const push = (geometry) => {
    signals.push(geometry.name);
    return geometry;
  };

  const shell = [
    push(box(hw - wall, 0.08, hd - wall, hx - wall / 2, y0, hz, 'r78-bearing-slab', DECK)),
    push(box(hw, head.wallH, wall, hx, y0, hz + hd / 2 - wall / 2, 'r78-wall-street', WALL)),
    push(box(hw, head.wallH, wall, hx, y0, hz - hd / 2 + wall / 2, 'r78-wall-rear', WALL)),
    push(box(wall, head.wallH, hd - wall * 2, hx - hw / 2 + wall / 2, y0, hz, 'r78-wall-left', WALL)),
    push(box(wall, head.wallH, (hd - openW) / 2 - wall, right, y0,
      hz - hd / 2 + wall + ((hd - openW) / 2 - wall) / 2, 'r78-jamb-rear', WALL)),
    push(box(wall, head.wallH, (hd - openW) / 2 - wall, right, y0,
      hz + hd / 2 - wall - ((hd - openW) / 2 - wall) / 2, 'r78-jamb-street', WALL)),
    push(box(wall, head.wallH - openH, openW, right, y0 + openH, hz, 'r78-lintel', WALL)),
    push(box(0.62, 0.78, 0.05, hx, y0 + 1.15, hz + hd / 2 + 0.012, 'r78-street-recess', REVEAL)),
  ];
  for (let blade = 0; blade < 3; blade += 1) {
    shell.push(push(box(wall + 0.02, 0.045, openW * 0.86, right, y0 + 2.06 + blade * 0.07,
      hz, `r78-louvre-${blade}`, LOUVRE)));
  }
  const capY = y0 + head.wallH;
  shell.push(push(box(hw + 0.08, head.capH, hd + 0.08, hx, capY, hz, 'r78-cap', DECK)));
  const copeY = capY + head.capH;
  shell.push(push(box(hw + 0.16, head.copeH, 0.08, hx, copeY, hz + hd / 2 + 0.04, 'r78-coping-street', COPING)));
  shell.push(push(box(hw + 0.16, head.copeH, 0.08, hx, copeY, hz - hd / 2 - 0.04, 'r78-coping-rear', COPING)));
  shell.push(push(box(0.08, head.copeH, hd, hx - hw / 2 - 0.04, copeY, hz, 'r78-coping-left', COPING)));
  shell.push(push(box(0.08, head.copeH, hd, hx + hw / 2 + 0.04, copeY, hz, 'r78-coping-door', COPING)));
  shell.push(push(tubeX(hw + 0.10, 0.055, hx, capY + head.capH / 2, hz + hd / 2 + 0.02,
    'r78-bullnose', COPING)));
  shell.push(push(box(0.08, head.wallH + head.capH, 0.08, hx - hw / 2 + 0.08, y0,
    hz - hd / 2 - 0.02, 'r78-downpipe', IRON)));
  shell.push(push(tubeY(0.16, head.cowlH, hx - 0.28, copeY + head.copeH, hz - 0.22, 'r78-cowl', IRON)));

  const leafW = 0.80;
  const leafH = 1.90;
  const door = [
    push(box(0.05, 0.03, leafW, hx + hw / 2 + 0.01, y0, hz, 'r78-threshold', IRON)),
    push(box(0.045, leafH, leafW, hx + hw / 2 + 0.02, y0 + 0.04, hz, 'r78-door-leaf', LEAF)),
    push(tubeY(0.028, 0.72, hx + hw / 2 + 0.06, y0 + 0.78, hz + leafW * 0.28, 'r78-door-pull', IRON)),
  ];

  const px = plant.x;
  const pz = plant.z;
  const pw = plant.w;
  const pd = plant.d;
  const ph = plant.h;
  const plantSignals = [];
  const plantPush = (geometry) => {
    plantSignals.push(geometry.name);
    return geometry;
  };
  const screened = [
    plantPush(box(pw, 0.08, pd, px, y0, pz, 'r78-plant-pad', DECK)),
    plantPush(box(0.62, 0.46, 0.48, px - 0.28, y0 + 0.08, pz - 0.08, 'r78-plant-unit-a', WALL)),
    plantPush(box(0.62, 0.40, 0.48, px + 0.30, y0 + 0.08, pz + 0.06, 'r78-plant-unit-b', WALL)),
    plantPush(box(pw, ph - 0.08, 0.06, px, y0 + 0.08, pz - pd / 2 + 0.03, 'r78-plant-back', WALL)),
    plantPush(box(pw, 0.06, pd, px, y0 + ph - 0.06, pz, 'r78-plant-rail', IRON)),
  ];
  for (let blade = 0; blade < 4; blade += 1) {
    const by = y0 + 0.22 + blade * 0.18;
    screened.push(plantPush(box(pw - 0.08, 0.045, 0.05, px, by, pz + pd / 2, `r78-plant-louvre-street-${blade}`, LOUVRE)));
    screened.push(plantPush(box(0.05, 0.045, pd - 0.10, px + pw / 2, by, pz, `r78-plant-louvre-side-${blade}`, LOUVRE)));
  }

  const doorSignals = door.map((geometry) => geometry.name);
  return [
    mergeNamed(shell, R78_HEAD_NAME, signals.filter((name) => !name.startsWith('r78-door') && name !== 'r78-threshold')),
    mergeNamed(door, R78_DOOR_NAME, doorSignals),
    mergeNamed(screened, R78_PLANT_NAME, plantSignals),
  ];
}
