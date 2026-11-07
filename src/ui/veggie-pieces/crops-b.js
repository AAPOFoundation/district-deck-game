// Garlic, zucchini, tomato, pumpkin. Deterministic. No Math.random.
// Produce is the silhouette. Sparse foliage. Soil gutters. Fruit only when ripe.

import { plotIsRipe } from '../../core/veggie-patch.js';
import {
  box,
  calyx,
  cyl,
  growthStage,
  latheFruit,
  leaf,
  ribbedOrb,
  rosette,
  stem,
} from './geom.js';

function clamp01(t) {
  return Math.max(0, Math.min(1, t ?? 0));
}

function dry(plot) {
  return (plot?.thirst ?? 0) > 0;
}

function foliage(m, plot, healthy, tired) {
  if (dry(plot)) return m.leafDry;
  if ((plot?.weeds ?? 0) > 0) return tired;
  return healthy;
}

function wilt(plot, base) {
  return base + (dry(plot) ? 0.34 : 0);
}

function grow(stage, t) {
  if (stage === 'sprout') return 0.36 + 0.35 * t;
  if (stage === 'leaf') return 0.70 + 0.18 * t;
  return 1;
}

function vary(i, k) {
  return ((i * 37 + k * 19) % 13) / 12;
}

function tip(x, y, z, h, tilt, yaw) {
  return {
    x: x + Math.sin(yaw) * Math.sin(tilt) * h,
    y: y + Math.cos(tilt) * h,
    z: z + Math.cos(yaw) * Math.sin(tilt) * h,
  };
}

function petiole(group, material, {
  x, y, z, h, tilt, yaw, rTop = 0.008, rBot = 0.014,
}) {
  const mesh = cyl(group, material, rTop, rBot, h, 0, 0, 0, 8);
  const mid = h * 0.5;
  mesh.position.set(
    x + Math.sin(yaw) * Math.sin(tilt) * mid,
    y + Math.cos(tilt) * mid,
    z + Math.cos(yaw) * Math.sin(tilt) * mid,
  );
  mesh.rotation.order = 'YXZ';
  mesh.rotation.y = yaw;
  mesh.rotation.x = tilt;
  return tip(x, y, z, h, tilt, yaw);
}

function vineRun(group, mat, x0, y0, z0, x1, y1, z1, r = 0.014) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz) || 0.01;
  const mesh = cyl(
    group, mat, r * 0.85, r, len,
    (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 6,
  );
  mesh.rotation.order = 'YXZ';
  mesh.rotation.y = Math.atan2(dx, dz);
  mesh.rotation.x = Math.acos(Math.max(-1, Math.min(1, dy / len)));
  return mesh;
}

/** Odd-pinnate spray — kept short so fruit stays in the open. */
function compoundTomato(group, mat, x, y, z, yaw, s, openTilt, leaflets) {
  const rachis = 0.14 * s;
  const lean = Math.min(1.15, openTilt * 0.48);
  petiole(group, mat, {
    x, y, z, h: rachis * 0.40, tilt: lean, yaw, rTop: 0.004, rBot: 0.007,
  });
  for (let i = 0; i < leaflets; i += 1) {
    const along = (i + 1) / (leaflets + 0.3);
    const p = tip(x, y, z, rachis * along, lean, yaw);
    const terminal = i === leaflets - 1;
    const side = terminal ? 0 : (i % 2 === 0 ? 1 : -1);
    leaf(group, mat, {
      x: p.x, y: p.y, z: p.z,
      len: (terminal ? 0.11 : 0.085) * s,
      wid: (terminal ? 0.055 : 0.040) * s,
      tilt: openTilt,
      yaw: yaw + side * 0.95,
      thick: 0.009,
      point: 0.20,
    });
  }
}

function tomatoOrb(group, m, x, y, z, r) {
  latheFruit(group, m.tomato, {
    x, y, z,
    pts: [
      [0.002, -r * 0.88],
      [r * 0.28, -r * 0.78],
      [r * 0.86, -r * 0.42],
      [r * 1.00, -r * 0.04],
      [r * 0.98, r * 0.32],
      [r * 0.70, r * 0.70],
      [r * 0.24, r * 0.86],
      [0.003, r * 0.90],
    ],
    segs: 12,
  });
  calyx(group, m.leafDeep, { x, y: y + r * 0.78, z, s: r * 1.22 });
}

/** Sagittate zucchini leaf — triangular, not a pumpkin paddle. */
function sagittate(group, mat, x, y, z, yaw, len, wid, tilt) {
  leaf(group, mat, {
    x, y, z, len, wid, tilt, yaw, thick: 0.014, point: 0.12,
  });
}

const GARLIC_SITES = [
  [-0.22, -0.08],
  [-0.10, 0.10],
  [0.00, -0.06],
  [0.10, 0.10],
  [0.22, -0.07],
];

function garlicBulb(group, m, x, y, z, salt) {
  latheFruit(group, m.tag, {
    x, y: y + 0.038, z,
    pts: [
      [0.010, -0.014],
      [0.058, 0.000],
      [0.074, 0.028],
      [0.050, 0.056],
      [0.016, 0.068],
    ],
    segs: 10,
  });
  for (let k = 0; k < 5; k += 1) {
    const yaw = (k / 5) * Math.PI * 2 + salt * 0.21;
    cyl(
      group, m.tag,
      0.022, 0.030, 0.050,
      x + Math.sin(yaw) * 0.040,
      y + 0.028,
      z + Math.cos(yaw) * 0.040,
      8,
    );
  }
  cyl(group, m.tag, 0.014, 0.018, 0.036, x, y + 0.070, z, 6);
}

export function buildGarlic(group, m, a, t, plot) {
  const u = clamp01(t);
  const ripe = plotIsRipe(plot);
  const stage = growthStage(u, ripe);
  const g = grow(stage, u);
  const mat = foliage(m, plot, m.leafGrey, m.leafMid);
  const blades = stage === 'sprout' ? 3 : 5;
  const len = (stage === 'sprout' ? 0.16 : 0.26) + 0.10 * g;
  const wid = 0.062 + 0.012 * g;
  const open = wilt(plot, 0.52);

  for (let i = 0; i < 5; i += 1) {
    const ox = GARLIC_SITES[i][0];
    const oz = GARLIC_SITES[i][1];
    if (stage === 'ripe') garlicBulb(group, m, a.x + ox, a.y, a.z + oz, i);
    rosette(group, mat, {
      x: a.x + ox,
      y: a.y + (stage === 'ripe' ? 0.078 : 0.016),
      z: a.z + oz,
      count: blades,
      len: len * (0.92 + vary(i, 2) * 0.12),
      wid,
      tilt: open,
      phase: i * 0.73,
      thick: 0.016,
    });
  }
}

export function buildZucchini(group, m, a, t, plot) {
  const u = clamp01(t);
  const ripe = plotIsRipe(plot);
  const stage = growthStage(u, ripe);
  const g = grow(stage, u);
  const mat = foliage(m, plot, m.leafDeep, m.leafMid);
  const open = wilt(plot, 0.92);
  const lean = wilt(plot, 0.28);
  const n = stage === 'sprout' ? 2 : 3;
  const leafLen = (stage === 'sprout' ? 0.16 : 0.24) + 0.04 * g;

  stem(group, m.leafDeep, {
    x: a.x, y: a.y, z: a.z - 0.04, h: 0.06 * g + 0.03, rTop: 0.014, rBot: 0.022, segs: 8,
  });

  for (let i = 0; i < n; i += 1) {
    const yaw = (i / n) * Math.PI * 2 + 0.55;
    const h = 0.16 + (i % 2) * 0.05 + 0.04 * g;
    const bx = a.x + Math.sin(yaw) * 0.05;
    const bz = a.z - 0.04 + Math.cos(yaw) * 0.05;
    const end = petiole(group, m.leafDeep, {
      x: bx, y: a.y, z: bz, h, tilt: lean, yaw, rTop: 0.007, rBot: 0.014,
    });
    sagittate(
      group, mat, end.x, end.y, end.z, yaw,
      leafLen * (0.94 + vary(i, 3) * 0.08),
      leafLen * 0.62,
      open,
    );
  }

  if (stage === 'bud') {
    latheFruit(group, m.tag, {
      x: a.x + 0.04, y: a.y + 0.05, z: a.z + 0.12,
      pts: [
        [0.004, 0.00],
        [0.012, 0.016],
        [0.028, 0.034],
        [0.006, 0.050],
      ],
      segs: 8,
      rot: [0.55, 0.3, 0.15],
    });
  }

  if (stage === 'ripe') {
    const cx = a.x + 0.04;
    const cy = a.y + 0.048;
    const cz = a.z + 0.14;
    const yaw = 0.40;
    const half = 0.17;
    latheFruit(group, m.marrow, {
      x: cx, y: cy, z: cz,
      pts: [
        [0.008, -half],
        [0.042, -half + 0.04],
        [0.054, -0.04],
        [0.056, 0.04],
        [0.046, half - 0.05],
        [0.016, half - 0.016],
        [0.004, half],
      ],
      segs: 10,
      rot: [Math.PI / 2, yaw, 0],
    });
    const tx = cx + Math.sin(yaw) * half;
    const tz = cz + Math.cos(yaw) * half;
    latheFruit(group, m.tag, {
      x: tx, y: cy + 0.01, z: tz,
      pts: [
        [0.004, 0.00],
        [0.012, 0.014],
        [0.030, 0.032],
        [0.006, 0.048],
      ],
      segs: 8,
      rot: [0.7, yaw, 0.1],
    });
  }
}

export function buildTomato(group, m, a, t, plot) {
  const u = clamp01(t);
  const ripe = plotIsRipe(plot);
  const stage = growthStage(u, ripe);
  const g = grow(stage, u);
  const mat = foliage(m, plot, m.leafMid, m.leafDeep);
  const open = wilt(plot, 1.10);
  const sh = (stage === 'sprout' ? 0.28 : 0.46) + 0.22 * g;
  const vineH = sh * 0.88;
  const leafS = 0.62 + 0.18 * g;
  const lx = a.x - 0.10;
  const lz = a.z - 0.04;
  const rx = a.x + 0.12;
  const rz = a.z + 0.05;

  box(group, m.timberPale, 0.028, sh, 0.028, lx, a.y + sh / 2, lz);
  box(group, m.timberPale, 0.018, 0.06, 0.018, lx, a.y + sh + 0.024, lz);
  box(group, m.timberPale, 0.024, sh * 0.86, 0.024, rx, a.y + (sh * 0.86) / 2, rz);
  box(
    group, m.timberPale,
    0.28, 0.016, 0.016,
    (lx + rx) / 2, a.y + sh * 0.70, (lz + rz) / 2,
    [0.06, 0.28, 0.04],
  );
  box(group, m.timberDark, 0.036, 0.012, 0.012, lx + 0.012, a.y + vineH * 0.48, lz + 0.008, [0, 0.35, 0.15]);

  stem(group, m.leafDeep, {
    x: lx + 0.024, y: a.y, z: lz + 0.016,
    h: vineH, rTop: 0.010, rBot: 0.016, segs: 8, lean: 0.04, yaw: 0.3,
  });

  const tiers = stage === 'sprout' ? 1 : 2;
  const sprays = 2;
  const leaflets = stage === 'sprout' ? 3 : 3;
  for (let k = 0; k < tiers; k += 1) {
    const yy = a.y + 0.10 + (vineH - 0.18) * ((k + 0.4) / (tiers + 0.4));
    for (let s = 0; s < sprays; s += 1) {
      const yaw = k * 0.9 + (s / sprays) * Math.PI * 2 + 0.4;
      compoundTomato(
        group, mat,
        lx + 0.024 + Math.sin(yaw) * 0.03,
        yy,
        lz + 0.016 + Math.cos(yaw) * 0.03,
        yaw, leafS, open, leaflets,
      );
    }
  }

  if (stage !== 'sprout') {
    vineRun(
      group, m.leafDeep,
      lx + 0.04, a.y + vineH * 0.58, lz + 0.02,
      rx - 0.02, a.y + vineH * 0.64, rz,
      0.010,
    );
  }

  if (stage === 'bud') {
    const buds = [
      [lx + 0.10, a.y + vineH * 0.58, lz + 0.08],
      [lx - 0.06, a.y + vineH * 0.70, lz + 0.02],
    ];
    for (let i = 0; i < buds.length; i += 1) {
      calyx(group, m.tag, { x: buds[i][0], y: buds[i][1], z: buds[i][2], s: 0.028 });
    }
  }

  if (stage === 'ripe') {
    const fruit = [
      [lx + 0.16, a.y + vineH * 0.48, lz + 0.14, 0.098],
      [lx - 0.12, a.y + vineH * 0.38, lz + 0.12, 0.090],
      [rx + 0.04, a.y + vineH * 0.44, rz + 0.12, 0.094],
    ];
    for (let i = 0; i < fruit.length; i += 1) {
      const [fx, fy, fz, r] = fruit[i];
      stem(group, m.leafDeep, {
        x: fx, y: fy + r * 0.80, z: fz,
        h: 0.04, rTop: 0.005, rBot: 0.008, segs: 6, lean: 0.16, yaw: 0.3 + i,
      });
      tomatoOrb(group, m, fx, fy, fz, r);
    }
  }
}

export function buildPumpkin(group, m, a, t, plot) {
  const u = clamp01(t);
  const ripe = plotIsRipe(plot);
  const stage = growthStage(u, ripe);
  const g = grow(stage, u);
  const mat = foliage(m, plot, m.leafDeep, m.leafMid);
  const open = wilt(plot, 0.95);
  const lean = wilt(plot, 0.30);
  const n = stage === 'sprout' ? 2 : 3;
  const leafLen = Math.min(0.28, (stage === 'sprout' ? 0.16 : 0.24) + 0.04 * g);

  const nodes = [
    [a.x - 0.16, a.y + 0.014, a.z - 0.12],
    [a.x + 0.02, a.y + 0.016, a.z - 0.10],
    [a.x + 0.16, a.y + 0.014, a.z - 0.14],
  ];
  for (let i = 1; i < n; i += 1) {
    vineRun(group, m.leafDeep, ...nodes[i - 1], ...nodes[i], 0.014);
  }

  for (let i = 0; i < n; i += 1) {
    const nx = nodes[i][0];
    const nz = nodes[i][2];
    const yaw = 2.6 + i * 1.05;
    const h = 0.12 + (i % 2) * 0.04 + 0.04 * g;
    const end = petiole(group, m.leafDeep, {
      x: nx, y: a.y, z: nz, h, tilt: lean, yaw, rTop: 0.008, rBot: 0.014,
    });
    leaf(group, mat, {
      x: end.x, y: end.y, z: end.z,
      len: leafLen * (0.94 + vary(i, 4) * 0.06),
      wid: leafLen * 0.70,
      tilt: open,
      yaw,
      thick: 0.014,
      point: 0.30,
    });
  }

  if (stage === 'bud') {
    latheFruit(group, m.tag, {
      x: a.x + 0.06, y: a.y + 0.05, z: a.z + 0.08,
      pts: [
        [0.004, 0.00],
        [0.014, 0.018],
        [0.032, 0.038],
        [0.008, 0.054],
      ],
      segs: 8,
      rot: [0.45, 0.2, 0.12],
    });
  }

  if (stage === 'ripe') {
    const px = a.x + 0.04;
    const pz = a.z + 0.12;
    const r = 0.18;
    const squash = 0.72;
    ribbedOrb(group, m.pumpkin, {
      x: px, y: a.y + r * squash, z: pz,
      r, squash, ribs: 8, segs: 12,
    });
    stem(group, m.timberPale, {
      x: px, y: a.y + r * squash * 2, z: pz,
      h: 0.09, rTop: 0.012, rBot: 0.026, segs: 8, lean: 0.38, yaw: 0.5,
    });
  }
}

export const CROPS_B = {
  garlic: buildGarlic,
  zucchini: buildZucchini,
  tomato: buildTomato,
  pumpkin: buildPumpkin,
};
