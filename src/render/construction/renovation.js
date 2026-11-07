// Renovation wrap — building stays (board owns it). Scaffold + skip + dirt + tap members.
// Does not replace the initial or final house model.

import * as THREE from 'three';
import { envelopeSize } from './kit.js';
import { box, cyl, createPalette } from './kit.js';
import { addSkip, addTrafficCones } from './plant.js';
import { SiteContext } from './kit.js';
import { bindTapMembers } from './tap.js';
import { attachTicker, requestSiteWorkCycle } from './animate.js';

export function buildRenovation(ctx) {
  const { w, d, height, palette: P } = ctx;
  const wallH = Math.max(5.2, height);
  const BAY = 2.1;
  const LIFT = 2.0;
  const standoff = 0.6;
  const DECK = 0.5;
  const lifts = Math.max(2, Math.round(wallH / LIFT));
  const topY = lifts * LIFT;
  const halfW = w / 2 + standoff;
  const halfD = d / 2 + standoff;
  const corners = [
    { x: -halfW, z: halfD }, { x: halfW, z: halfD },
    { x: halfW, z: -halfD }, { x: -halfW, z: -halfD },
  ];
  const runs = corners.map((c, i) => {
    const n = corners[(i + 1) % 4];
    const dx = n.x - c.x;
    const dz = n.z - c.z;
    const len = Math.hypot(dx, dz);
    return { from: c, to: n, dx, dz, len, ix: dz / len, iz: -dx / len };
  });

  const wrap = ctx.layer('reno-wrap');
  const netting = [];

  for (const r of runs) {
    const bays = Math.max(1, Math.round(r.len / BAY));
    for (let i = 0; i < bays; i += 1) {
      const t = i / bays;
      const x = r.from.x + r.dx * t;
      const z = r.from.z + r.dz * t;
      for (const inset of [0, DECK]) {
        const px = x + r.ix * inset;
        const pz = z + r.iz * inset;
        const std = new THREE.Group();
        std.position.set(px, 0, pz);
        wrap.add(std);
        cyl(std, 0.048, 0.048, topY + 0.95, 6, P.steel, 0, (topY + 0.95) / 2, 0, { cast: false });
        box(std, 0.3, 0.06, 0.3, P.scaffoldBase, 0, 0.04, 0, { cast: false });
        ctx.tap(std, 'scaffold', { label: `reno-std-${px.toFixed(1)}` });
      }
    }
  }

  for (let l = 1; l <= lifts; l += 1) {
    const y = l * LIFT;
    for (const r of runs) {
      const alongX = Math.abs(r.dx) > Math.abs(r.dz);
      const midX = (r.from.x + r.to.x) / 2 + r.ix * (DECK / 2);
      const midZ = (r.from.z + r.to.z) / 2 + r.iz * (DECK / 2);
      const lw = alongX ? r.len : 0.05;
      const ld = alongX ? 0.05 : r.len;
      for (const inset of [-(DECK / 2), DECK / 2]) {
        box(wrap, lw, 0.05, ld, P.steel, midX + r.ix * inset, y, midZ + r.iz * inset, { cast: false });
        box(wrap, lw, 0.05, ld, P.steel, midX + r.ix * inset, y + 0.95, midZ + r.iz * inset, { cast: false });
      }
      box(wrap, alongX ? r.len : DECK, 0.045, alongX ? DECK : r.len, P.pine, midX, y + 0.06, midZ, {
        cast: false,
      });
      box(
        wrap,
        alongX ? r.len : 0.03,
        0.16,
        alongX ? 0.03 : r.len,
        P.pine,
        midX - r.ix * (DECK / 2),
        y + 0.14,
        midZ - r.iz * (DECK / 2),
        { cast: false },
      );
      const bays = Math.max(1, Math.round(r.len / BAY));
      for (let i = 0; i <= bays; i += 1) {
        const t = i / bays;
        const tx = r.from.x + r.dx * t + r.ix * (DECK / 2);
        const tz = r.from.z + r.dz * t + r.iz * (DECK / 2);
        box(wrap, alongX ? 0.045 : DECK + 0.1, 0.045, alongX ? DECK + 0.1 : 0.045, P.steel, tx, y, tz, {
          cast: false,
        });
      }
    }
  }

  for (const r of runs) {
    const alongX = Math.abs(r.dx) > Math.abs(r.dz);
    const bays = Math.max(1, Math.round(r.len / BAY));
    const bayLen = r.len / bays;
    const diagLen = Math.hypot(bayLen, LIFT);
    const diagAngle = Math.atan2(LIFT, bayLen);
    for (let l = 0; l < lifts; l += 1) {
      for (let i = 0; i < bays; i += 1) {
        if ((i + l) % 2 !== 0) continue;
        const t = (i + 0.5) / bays;
        const x = r.from.x + r.dx * t;
        const z = r.from.z + r.dz * t;
        const dir = l % 2 === 0 ? 1 : -1;
        box(
          wrap,
          alongX ? diagLen : 0.04,
          0.04,
          alongX ? 0.04 : diagLen,
          P.steel,
          x,
          l * LIFT + LIFT / 2,
          z,
          alongX ? { cast: false, rotZ: dir * diagAngle } : { cast: false, rotX: dir * diagAngle },
        );
      }
    }
  }

  for (const r of runs) {
    const alongX = Math.abs(r.dx) > Math.abs(r.dz);
    const bays = Math.max(1, Math.round(r.len / BAY));
    const bayLen = r.len / bays;
    for (let l = 0; l < lifts; l += 1) {
      for (let i = 0; i < bays; i += 1) {
        const t = (i + 0.5) / bays;
        const x = r.from.x + r.dx * t - r.ix * 0.03;
        const z = r.from.z + r.dz * t - r.iz * 0.03;
        const panel = box(
          wrap,
          alongX ? bayLen - 0.1 : 0.02,
          LIFT - 0.16,
          alongX ? 0.02 : bayLen - 0.1,
          P.netting,
          x,
          l * LIFT + LIFT / 2,
          z,
          { cast: false },
        );
        panel.userData.phase = i * 0.55 + l * 0.8;
        netting.push(panel);
      }
    }
  }
  ctx.rig('netting', netting);

  const ladX = -w * 0.5 + (w / Math.max(1, Math.round(w / BAY))) * 0.5;
  const ladZ = halfD - DECK * 0.85;
  for (const ox of [-0.16, 0.16]) {
    cyl(wrap, 0.028, 0.028, topY, 5, P.steel, ladX + ox, topY / 2, ladZ, { cast: false });
  }
  for (let r = 0; r < Math.floor(topY / 0.28); r += 1) {
    box(wrap, 0.34, 0.025, 0.025, P.steel, ladX, 0.28 * (r + 1), ladZ, { cast: false });
  }

  box(wrap, w * 0.98, 0.12, 0.04, P.safety, 0, topY + 0.62, halfD + 0.06, { cast: false });
  box(wrap, w * 0.98, 0.12, 0.04, P.safety, 0, 1.45, halfD + 0.06, { cast: false });
  box(wrap, w * 0.55, 0.12, d * 0.35, P.dirt, w * 0.12, 0.06, -d * 0.2, {
    cast: false, receive: true,
  });
  addSkip(ctx);
  addTrafficCones(ctx, [
    [-w * 0.42, -d * 0.42],
    [w * 0.1, -d * 0.44],
    [w * 0.48, -d * 0.2],
  ]);
}

export function createRenovationScaffoldGroup({ parcel, materials, storeys = 2, quarter = 0 }) {
  const { w, d } = envelopeSize(parcel);
  const group = new THREE.Group();
  group.name = `renovation-scaffold:${storeys}`;
  group.position.set(parcel.centre.x, 0, parcel.centre.z);
  group.userData.renovation = true;
  group.userData.cycleSeconds = 18;

  const ctx = new SiteContext({
    group,
    w,
    d,
    height: Math.max(5.2, storeys * 3.05),
    storeys,
    materials,
    seed: `reno:${parcel.id ?? parcel.centre.x}`,
    stageIndex: 3,
    toArchetype: null,
  });
  // Palette is created inside SiteContext; plant helpers read ctx.palette.
  if (!ctx.palette) ctx.palette = createPalette(materials);
  buildRenovation(ctx);
  bindTapMembers(ctx);
  attachTicker(group, ctx);
  group.userData.quarter = quarter;
  requestSiteWorkCycle(group, quarter);
  group.userData.tapTargets = ctx.taps;
  return group;
}
