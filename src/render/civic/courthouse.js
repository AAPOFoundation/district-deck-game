// V3.38 Wave L — geometry-only courthouse.
// A stepped public plinth, four-column portico, pediment and flag pole give it a civic
// silhouette without a commissioned asset or a new material bucket.

import {
  CIVIC_METRICS,
  boardPlate,
  box,
  cyl,
  flagpole,
  hole,
  parapetRoof,
  part,
  paverRun,
  plinthCourse,
  slab,
  stringCourse,
  triPlate,
  volume,
} from './core.js';
import { civicWindow, glazedEntry } from './openings.js';

const Y0 = CIVIC_METRICS.plateRise;

export const COURTHOUSE_ENVELOPE = Object.freeze({
  footprint: Object.freeze([1, 1]),
  storeys: 3,
});

export default function buildCourthouse(ctx) {
  const { p } = ctx;
  const lotW = ctx.env.lotW;
  const lotD = ctx.env.lotD;
  const w = Math.min(11.6, lotW - 1.6);
  const d = Math.min(8.4, lotD - 4.2);
  const zFront = 2.4;
  const zBack = zFront - d;
  const zCentre = (zFront + zBack) / 2;
  const baseY = Y0 + 0.70;
  const topY = baseY + 8.8;

  ctx.add(boardPlate(ctx, { width: lotW, depth: lotD }));
  ctx.add(paverRun(ctx, {
    x0: -2.2, x1: 2.2, z0: zFront + 1.8, z1: lotD / 2 - 0.35,
    unit: 1.1, flat: true, name: 'court-walk',
  }));

  // The body begins on two full-width masonry steps, so the mass has a visible public
  // threshold and no wall meets the board plate directly.
  ctx.add([
    part(slab(w + 0.8, 0.32, d + 0.8, 0, Y0, zCentre, 'court-step-low'), p.wallAlt),
    part(slab(w + 0.42, 0.38, d + 0.42, 0, Y0 + 0.32, zCentre, 'court-step-high'), p.wallAlt),
  ]);
  ctx.add(plinthCourse(ctx, {
    x: 0, z: zCentre, w, d, yBase: baseY, h: 0.72,
    material: p.metal, name: 'court-plinth',
  }));

  const entryW = 2.4;
  const entryH = 2.9;
  const windowW = 1.35;
  const windowH = 1.55;
  const frontHoles = [
    hole(0, baseY, entryW, entryH, 'entry'),
  ];
  for (const x of [-4.0, -2.1, 2.1, 4.0]) {
    frontHoles.push(hole(x, baseY + 1.1, windowW, windowH, 'window'));
    frontHoles.push(hole(x, baseY + 4.2, windowW, windowH, 'window'));
  }
  ctx.add(volume(ctx, {
    x: 0, zFront, zBack, width: w, y0: baseY, y1: topY,
    front: frontHoles, name: 'court-body',
  }));
  ctx.add(stringCourse(ctx, {
    x: 0, z: zCentre, w, d, y: baseY + 3.45, thick: 0.24,
    name: 'court-string',
  }));
  ctx.add(parapetRoof(ctx, {
    x: 0, z: zCentre, w, d, y: topY, parapet: 0.52, name: 'court-roof',
  }));

  ctx.add(glazedEntry(ctx, {
    x: 0, y: baseY, z: zFront, w: entryW, h: entryH,
    doorW: 1.6, doorH: 2.35, id: 'court-entry', label: 'Courthouse entrance',
  }));
  for (const x of [-4.0, -2.1, 2.1, 4.0]) {
    for (const y of [baseY + 1.1, baseY + 4.2]) {
      ctx.add(civicWindow(ctx, {
        x, y: y + windowH / 2, z: zFront, w: windowW, h: windowH,
        facing: 'front', lights: 2, id: `court-win-${x}-${y}`,
      }));
    }
  }

  // Columned portico: four octagonal shafts, deep entablature and a real triangular
  // pediment. Everything seats on the upper entry step.
  const porticoZ = zFront + 1.15;
  const columnBase = Y0 + 0.70;
  const columnH = 4.4;
  ctx.add(part(slab(7.6, 0.32, 2.6, 0, Y0 + 0.38, porticoZ, 'portico-step'), p.wallAlt));
  for (const x of [-2.7, -0.9, 0.9, 2.7]) {
    ctx.add([
      part(slab(0.72, 0.22, 0.72, x, columnBase, porticoZ, 'column-base'), p.trim),
      part(cyl(0.28, columnH, x, columnBase + columnH / 2 + 0.22, porticoZ,
        'y', 'portico-column', 8), p.wall),
      part(slab(0.78, 0.22, 0.78, x, columnBase + columnH + 0.22, porticoZ,
        'column-cap'), p.trim),
    ]);
  }
  const entablatureY = columnBase + columnH + 0.44;
  ctx.add([
    part(slab(7.8, 0.58, 2.8, 0, entablatureY, porticoZ, 'entablature'), p.trim),
    part(triPlate(7.4, 1.65, 0.34, 0, entablatureY + 0.58, porticoZ + 1.42,
      'court-pediment'), p.wallAlt),
    part(box(7.8, 0.16, 0.48, 0, entablatureY + 0.66, porticoZ + 1.42,
      'pediment-cornice'), p.trim),
  ]);

  ctx.add(flagpole(ctx, {
    x: Math.min(lotW / 2 - 1.0, 5.6),
    z: Math.min(lotD / 2 - 1.0, 5.4),
    h: 7.2,
    name: 'court-flag',
  }));
}
