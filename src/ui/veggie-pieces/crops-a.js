// Radish, silverbeet, broad-bean, potato. Procedural. No sim. No Math.random.
// r2: produce owns the silhouette. Low radish. No pale stick-forest. Plot gutters.

import { plotIsRipe } from '../../core/veggie-patch.js';
import {
  ball,
  box,
  cyl,
  growthStage,
  latheFruit,
  leaf,
  rosette,
  stem,
} from './geom.js';

function clamp01(t) {
  return Math.max(0, Math.min(1, t ?? 0));
}

function dry(plot) {
  return (plot?.thirst ?? 0) > 0;
}

function foliage(m, plot, healthy) {
  return dry(plot) ? m.leafDry : healthy;
}

function wilt(plot, base) {
  return base + (dry(plot) ? 0.28 : 0);
}

function grow(stage, t) {
  if (stage === 'sprout') return 0.34 + 0.30 * t;
  if (stage === 'leaf') return 0.68 + 0.16 * t;
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
  x, y, z, h, tilt, yaw, rTop = 0.006, rBot = 0.010,
}) {
  const mesh = cyl(group, material, rTop, rBot, h, 0, 0, 0, 7);
  const mid = h * 0.5;
  mesh.position.set(
    x + Math.sin(yaw) * Math.sin(tilt) * mid,
    y + Math.cos(tilt) * mid,
    z + Math.cos(yaw) * Math.sin(tilt) * mid,
  );
  mesh.rotation.order = 'YXZ';
  mesh.rotation.y = yaw;
  mesh.rotation.x = tilt;
  return mesh;
}

/** Wide cream rib — the silverbeet drawing. */
function flatRib(group, material, {
  x, y, z, h, tilt, yaw, wid = 0.036, thick = 0.012,
}) {
  const mesh = box(group, material, wid, h, thick, 0, 0, 0);
  const mid = h * 0.5;
  mesh.position.set(
    x + Math.sin(yaw) * Math.sin(tilt) * mid,
    y + Math.cos(tilt) * mid,
    z + Math.cos(yaw) * Math.sin(tilt) * mid,
  );
  mesh.rotation.order = 'YXZ';
  mesh.rotation.y = yaw;
  mesh.rotation.x = tilt;
  return mesh;
}

function laminaRib(group, material, {
  x, y, z, len, tilt, yaw, wid = 0.028,
}) {
  const reach = len * 0.48;
  const mesh = box(
    group, material,
    wid, 0.010, len * 0.90,
    x + Math.sin(yaw) * Math.sin(tilt) * reach,
    y + Math.cos(tilt) * reach + 0.007,
    z + Math.cos(yaw) * Math.sin(tilt) * reach,
  );
  mesh.rotation.order = 'YXZ';
  mesh.rotation.y = yaw;
  mesh.rotation.x = tilt - Math.PI / 2;
  return mesh;
}

/** Narrow upright chard leaf. Cream rib is louder than the blade. */
function chardLeaf(group, blade, rib, x, y, z, len, tilt, yaw) {
  const petTilt = Math.min(0.28, tilt * 0.55);
  flatRib(group, rib, {
    x, y, z, h: len * 0.72, tilt: petTilt, yaw, wid: 0.038, thick: 0.013,
  });
  const p = tip(x, y, z, len * 0.52, petTilt, yaw);
  leaf(group, blade, {
    x: p.x, y: p.y, z: p.z,
    len: len * 0.42, wid: len * 0.16,
    tilt, yaw, thick: 0.013, point: 0.20,
  });
  laminaRib(group, rib, {
    x: p.x, y: p.y, z: p.z,
    len: len * 0.40, tilt, yaw, wid: 0.030,
  });
}

function compoundLeaf(group, blade, pet, x, y, z, len, tilt, yaw, pairs) {
  petiole(group, pet, {
    x, y, z, h: len * 0.72, tilt, yaw, rTop: 0.003, rBot: 0.006,
  });
  for (let i = 0; i < pairs; i += 1) {
    const along = (0.28 + i * 0.24) * len;
    const p = tip(x, y, z, along, tilt, yaw);
    const lf = len * 0.20;
    leaf(group, blade, {
      x: p.x, y: p.y, z: p.z,
      len: lf, wid: lf * 0.55,
      tilt: tilt + 0.30, yaw: yaw + 1.15, thick: 0.010, point: 0.28,
    });
    leaf(group, blade, {
      x: p.x, y: p.y, z: p.z,
      len: lf * 0.92, wid: lf * 0.50,
      tilt: tilt + 0.28, yaw: yaw - 1.12, thick: 0.010, point: 0.28,
    });
  }
  const end = tip(x, y, z, len * 0.78, tilt, yaw);
  leaf(group, blade, {
    x: end.x, y: end.y, z: end.z,
    len: len * 0.18, wid: len * 0.12,
    tilt, yaw, thick: 0.010, point: 0.26,
  });
}

/** Lime hanging pod. Authored 1.4× the r1 capsule. */
function hangPod(group, m, x, y, z, yaw, s) {
  const k = 1.4 * s;
  latheFruit(group, m.pod, {
    x, y, z,
    pts: [
      [0, 0.072 * k],
      [0.018 * k, 0.060 * k],
      [0.028 * k, 0.018 * k],
      [0.030 * k, -0.016 * k],
      [0.022 * k, -0.054 * k],
      [0.008 * k, -0.082 * k],
      [0, -0.090 * k],
    ],
    segs: 8,
    rot: [1.28, yaw, 0.14],
  });
}

const RADISH_SITES = [
  [-0.12, 0.00],
  [0.14, 0.04],
];

const CHARD_SITES = [
  [-0.14, 0.03],
  [0.00, -0.05],
  [0.14, 0.03],
];

const BEAN_SITES = [
  [-0.15, -0.07],
  [0.15, -0.07],
  [0.00, 0.10],
];

const POTATO_STEMS = [
  [-0.06, 0.04, 0.2],
  [0.07, -0.04, 1.3],
];

function buildRadishPlant(group, m, x, y, z, t, plot, stage, idx) {
  const blade = foliage(m, plot, m.leafLight);
  const pet = foliage(m, plot, m.leafMid);
  const g = grow(stage, t);

  if (stage === 'sprout') {
    stem(group, pet, {
      x, y, z, h: 0.035, rTop: 0.003, rBot: 0.006, lean: (idx - 1.5) * 0.03, yaw: idx,
    });
    leaf(group, blade, {
      x, y: y + 0.03, z, len: 0.08, wid: 0.038,
      tilt: wilt(plot, 1.05), yaw: idx * 0.8, thick: 0.010,
    });
    leaf(group, blade, {
      x, y: y + 0.03, z, len: 0.07, wid: 0.034,
      tilt: wilt(plot, 1.08), yaw: idx * 0.8 + Math.PI, thick: 0.010,
    });
    return;
  }

  // Low hat. Leaf len stays ≤ 0.22 so the root is the silhouette.
  const count = stage === 'leaf' ? 6 : 7 + (idx % 2);
  const len = Math.min(0.22, 0.14 + 0.07 * g);
  rosette(group, blade, {
    x, y: y + 0.028, z,
    count,
    len,
    wid: 0.062,
    tilt: wilt(plot, 1.08),
    phase: idx * 0.35,
    thick: 0.012,
  });

  if (stage === 'bud') {
    cyl(group, m.soilWet, 0.06, 0.09, 0.018, x, y + 0.008, z, 8);
  }

  if (stage !== 'ripe') return;

  const s = (idx === 0 ? 1.35 : 1.18) + vary(idx, 2) * 0.05;
  // Tapered shoulder — a radish, not a pink tomato. Fat at soil, tapers down.
  latheFruit(group, m.radish, {
    x, y: y + 0.02, z,
    pts: [
      [0.00, 0.055 * s],
      [0.07 * s, 0.042 * s],
      [0.10 * s, 0.012 * s],
      [0.08 * s, -0.04 * s],
      [0.045 * s, -0.09 * s],
      [0.018 * s, -0.13 * s],
      [0.00, -0.15 * s],
    ],
    segs: 10,
  });
  cyl(group, m.tag, 0.010 * s, 0.004 * s, 0.045 * s, x, y - 0.16 * s, z, 6);
}

export function buildRadish(group, m, a, t, plot) {
  const u = clamp01(t);
  const stage = growthStage(u, plotIsRipe(plot));
  for (let i = 0; i < RADISH_SITES.length; i += 1) {
    const [ox, oz] = RADISH_SITES[i];
    buildRadishPlant(group, m, a.x + ox, a.y, a.z + oz, u, plot, stage, i);
  }
}

function buildChardCrown(group, m, x, y, z, t, plot, stage, idx) {
  const blade = foliage(m, plot, m.leafDeep);
  const rib = m.tag;
  const g = grow(stage, t);
  const n = stage === 'sprout' ? 2 : stage === 'leaf' ? 4 : 5;

  stem(group, rib, {
    x, y, z, h: 0.05 + 0.03 * g, rTop: 0.012, rBot: 0.018, lean: (idx - 1) * 0.04, yaw: idx,
  });

  const leafLen = (stage === 'sprout' ? 0.14 : 0.30) + 0.10 * g;
  for (let i = 0; i < n; i += 1) {
    const yaw = idx * 0.35 + (i / n) * Math.PI * 2;
    const len = leafLen * (0.90 + ((i * 29) % 7) / 40);
    const tilt = wilt(plot, 0.26 + ((i * 11) % 5) / 28);
    chardLeaf(group, blade, rib, x, y + 0.015, z, len, tilt, yaw);
  }

  if (stage !== 'ripe') return;

  stem(group, rib, {
    x, y: y + 0.34, z, h: 0.28, rTop: 0.006, rBot: 0.012,
    lean: (idx - 1) * 0.06, yaw: idx + 0.3,
  });
  for (let k = 0; k < 3; k += 1) {
    ball(group, rib, 0.011, x + (k - 1) * 0.014, y + 0.50 + k * 0.03, z, 6);
  }
}

export function buildSilverbeet(group, m, a, t, plot) {
  const u = clamp01(t);
  const stage = growthStage(u, plotIsRipe(plot));
  for (let i = 0; i < CHARD_SITES.length; i += 1) {
    const [ox, oz] = CHARD_SITES[i];
    buildChardCrown(group, m, a.x + ox, a.y, a.z + oz, u, plot, stage, i);
  }
}

function buildBeanStem(group, m, x, y, z, t, plot, stage, idx) {
  const blade = foliage(m, plot, m.leafGrey);
  const g = grow(stage, t);
  const h = (stage === 'sprout' ? 0.18 : 0.38) + 0.32 * g;
  const lean = (idx % 2 === 0 ? -1 : 1) * 0.04;

  box(group, m.leafDeep, 0.022, h, 0.022, x, y + h / 2, z, [0, idx * 0.25, lean]);
  stem(group, m.leafMid, {
    x: x + lean * 0.06, y: y + h - 0.03, z,
    h: 0.05, rTop: 0.005, rBot: 0.009, lean, yaw: idx,
  });

  const nodes = stage === 'sprout' ? 1 : stage === 'leaf' ? 2 : 3;
  for (let n = 1; n <= nodes; n += 1) {
    const ny = y + (h * n) / (nodes + 0.7);
    const yaw = idx * 0.7 + n * 1.05;
    const len = 0.08 + 0.03 * g;
    const tilt = wilt(plot, 1.02);
    leaf(group, blade, {
      x, y: ny, z, len, wid: len * 0.52, tilt, yaw, thick: 0.011, point: 0.32,
    });
    leaf(group, blade, {
      x, y: ny, z, len: len * 0.92, wid: len * 0.48,
      tilt, yaw: yaw + Math.PI, thick: 0.011, point: 0.32,
    });
  }

  if (stage === 'bud') {
    ball(group, m.leafDeep, 0.010, x + 0.02, y + h * 0.88, z + 0.015, 6);
    ball(group, m.leafLight, 0.008, x - 0.018, y + h * 0.80, z - 0.012, 6);
  }

  if (stage !== 'ripe') return;

  hangPod(group, m, x + 0.05, y + h * 0.52, z + 0.03, idx * 0.6, 1.05);
  hangPod(group, m, x - 0.04, y + h * 0.66, z - 0.02, idx * 0.6 + 1.5, 0.92);
}

export function buildBroadBean(group, m, a, t, plot) {
  const u = clamp01(t);
  const stage = growthStage(u, plotIsRipe(plot));
  const count = stage === 'sprout' ? 2 : BEAN_SITES.length;
  for (let i = 0; i < count; i += 1) {
    const [ox, oz] = BEAN_SITES[i];
    buildBeanStem(group, m, a.x + ox, a.y, a.z + oz, u, plot, stage, i);
  }
}

function buildPotatoHill(group, m, x, y, z, g) {
  latheFruit(group, m.soilWet, {
    x, y, z,
    pts: [
      [0.20 * g + 0.06, 0],
      [0.18 * g + 0.05, 0.032],
      [0.12 * g + 0.03, 0.062],
      [0.05 * g + 0.02, 0.078],
      [0, 0.086],
    ],
    segs: 10,
  });
}

export function buildPotato(group, m, a, t, plot) {
  const u = clamp01(t);
  const stage = growthStage(u, plotIsRipe(plot));
  const blade = foliage(m, plot, m.leafMid);
  const pet = foliage(m, plot, m.leafDeep);
  const g = grow(stage, t);

  buildPotatoHill(group, m, a.x, a.y, a.z, 0.80 + 0.20 * g);

  const stems = stage === 'sprout' ? 1 : POTATO_STEMS.length;
  for (let i = 0; i < stems; i += 1) {
    const [ox, oz, phase] = POTATO_STEMS[i];
    const x = a.x + ox;
    const z = a.z + oz;
    const h = (stage === 'sprout' ? 0.10 : 0.16) + 0.12 * g;
    stem(group, pet, {
      x, y: a.y + 0.07, z, h, rTop: 0.006, rBot: 0.011,
      lean: (i - 0.5) * 0.08, yaw: phase,
    });

    if (stage === 'sprout') {
      rosette(group, blade, {
        x, y: a.y + 0.12, z,
        count: 3, len: 0.08, wid: 0.032, tilt: wilt(plot, 0.85), phase, thick: 0.009,
      });
      continue;
    }

    const sprays = stage === 'leaf' ? 2 : 3;
    for (let k = 0; k < sprays; k += 1) {
      const ny = a.y + 0.10 + (h * (k + 0.35)) / (sprays + 0.5);
      const yaw = phase + k * 1.4 + i * 0.5;
      compoundLeaf(
        group, blade, pet,
        x, ny, z,
        0.13 + 0.03 * g,
        wilt(plot, 0.92),
        yaw,
        2,
      );
    }

    if (stage === 'bud' || stage === 'ripe') {
      ball(group, m.leafLight, 0.012, x + 0.015, a.y + 0.08 + h, z, 6);
    }
  }

  if (stage !== 'ripe') return;

  const tubers = [
    [-0.16, 0.10, 1.05],
    [0.15, 0.11, 0.98],
    [-0.08, -0.14, 1.00],
    [0.14, -0.10, 0.96],
  ];
  for (let i = 0; i < tubers.length; i += 1) {
    const [ox, oz, s] = tubers[i];
    const fruit = latheFruit(group, m.tuber, {
      x: a.x + ox, y: a.y + 0.092, z: a.z + oz,
      pts: [
        [0, 0.040 * s],
        [0.044 * s, 0.026 * s],
        [0.058 * s, 0.000 * s],
        [0.046 * s, -0.024 * s],
        [0.018 * s, -0.036 * s],
        [0, -0.040 * s],
      ],
      segs: 7,
      rot: [0.35, ox * 5, 0.12],
    });
    fruit.scale.set(1.12, 0.86, 0.94);
  }
}

export const CROPS_A = {
  radish: buildRadish,
  silverbeet: buildSilverbeet,
  'broad-bean': buildBroadBean,
  potato: buildPotato,
};
