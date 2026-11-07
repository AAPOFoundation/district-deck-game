// Fractured coastal limestone. One closed mass per call: unequal planar faces,
// three vertical joint creases, a seaward bite, a ledge and a spur that die
// into a face, and a broken crown. Deterministic. No Math.random.
//
// The plan is star-shaped around the local origin, so the shaft cannot cross
// itself. Radius stays under ~1.08 so the mesh remains inside the existing
// wet-foot / barnacle footprint that sizes the cove contact discs.

import * as THREE from 'three';
import { TASTE } from '../taste-tokens.js';
import { fractureStone, bakeStoneOcclusion } from './stone-surface.js';

function hash(i, salt = 0) {
  const s = Math.sin(i * 12.9898 + salt * 78.233 + 1.0) * 43758.5453;
  return s - Math.floor(s);
}

function pulse(t, centre, half) {
  const u = Math.abs(t - centre) / half;
  if (u >= 1) return 0;
  const s = 1 - u;
  return s * s * (3 - 2 * s);
}

function chordRadius(r0, a0, r1, a1, am) {
  const p0x = Math.cos(a0) * r0;
  const p0z = Math.sin(a0) * r0;
  const ex = Math.cos(a1) * r1 - p0x;
  const ez = Math.sin(a1) * r1 - p0z;
  const dx = Math.cos(am);
  const dz = Math.sin(am);
  const det = ex * (-dz) - (-dx) * ez;
  if (Math.abs(det) < 1e-6) return (r0 + r1) * 0.5;
  const s = (ex * (-p0z) - (-p0x) * ez) / det;
  return Math.max(0.2, s);
}

const CHALK = new THREE.Color('#b7b1a3');
const WARM = new THREE.Color('#c4b59a');
const COOL = new THREE.Color('#a3aaa4');
const RECESS = new THREE.Color('#5c564c');
const DAMP = new THREE.Color('#686c66');
const MOSS = new THREE.Color('#6a7848');

// W4-A: stacks are banded by height in the rock tokens (TASTE-BIBLE 2): 1.5 m beds between
// rockLight and rockDark, a darker wet band on the lowest 1.5 m, leaf-grey on the crown.
const BAND_ROCK_LIGHT = new THREE.Color(TASTE.ground.rockLight);
const BAND_ROCK_DARK = new THREE.Color(TASTE.ground.rockDark);
const BAND_LEAF_GREY = new THREE.Color(TASTE.foliage.leafGrey);
const BAND_M = 1.5;
const BAND_MIX = 0.72;
const bandColour = new THREE.Color();
// Base rock colour for the baked occlusion to multiply: rockLight pulled 12% toward rockDark,
// so the stack is pale limestone with the strata shader adding the darker beds.
// The 0.47 is measured, not chosen: lit by the key and sky these meshes render about 2.3x brighter than
// their albedo; a 1.0 base put the faces at V 91-95 and 0.52 at V 81 (the rock band is V 35-80).
const STONE_BASE = new THREE.Color(TASTE.ground.rockLight).lerp(new THREE.Color(TASTE.ground.rockDark), 0.12)
  .multiplyScalar(0.47);

/** Blend a vertex colour toward the height band it sits in. `heightM` is metres above the stone's own base. */
function bandVertex(col, heightM, t, seed, dry) {
  const band = Math.floor(Math.max(0, heightM) / BAND_M);
  const k = hash(band * 3 + seed * 7, 301);
  // Alternating beds, each with its own depth of tone, so the bands read as strata and not as a barber pole.
  const darkness = band % 2 === 0 ? 0.08 + 0.18 * k : 0.34 + 0.22 * k;
  bandColour.copy(BAND_ROCK_LIGHT).lerp(BAND_ROCK_DARK, darkness);
  if (!dry && heightM < BAND_M) bandColour.lerp(BAND_ROCK_DARK, 0.5);
  if (t > 0.9) bandColour.lerp(BAND_LEAF_GREY, 0.35 * ((t - 0.9) / 0.1));
  col.lerp(bandColour, BAND_MIX);
}

function makePlan(seed, kind, outerSign) {
  const broad = kind === 'crust' ? 4 : 4 + (Math.abs(Math.floor(seed)) % 3);
  const joints = 3;
  const corners = broad + joints;
  const jointAt = new Set();
  const step = corners / joints;
  for (let k = 0; k < joints; k += 1) {
    let idx = Math.floor(k * step + hash(seed, 30 + k) * step * 0.55) % corners;
    while (jointAt.has(idx)) idx = (idx + 1) % corners;
    jointAt.add(idx);
  }
  const weights = [];
  for (let i = 0; i < corners; i += 1) {
    weights.push(jointAt.has(i)
      ? 0.20 + hash(seed, 40 + i) * 0.08
      : 0.72 + hash(seed, 50 + i) * 0.85);
  }
  const sum = weights.reduce((acc, w) => acc + w, 0);
  let ang = hash(seed, 60) * Math.PI * 2;
  const corner = [];
  for (let i = 0; i < corners; i += 1) {
    const sweep = (weights[i] / sum) * Math.PI * 2;
    corner.push({
      ang,
      sweep,
      rad: 1.0 + hash(seed, 70 + i) * 0.08,
      joint: jointAt.has(i),
    });
    ang += sweep;
  }
  const verts = [];
  for (let i = 0; i < corners; i += 1) {
    const c0 = corner[i];
    const c1 = corner[(i + 1) % corners];
    const a1 = c0.ang + c0.sweep;
    const part = (i + Math.floor(hash(seed, 8) * 3)) % 3;
    const cornerAmp = (index, ang) => {
      const inward = kind === 'leg' && Math.cos(ang) * outerSign < -0.05;
      const base = kind === 'stack' ? 0.24 + hash(seed, 71 + index) * 0.06
        : kind === 'leg' ? 0.1
        : kind === 'crown' ? 0.16
        : kind === 'platform' ? 0.12
        : 0.05;
      return base * (inward ? 0.35 : 1);
    };
    const amp = cornerAmp(i, c0.ang);
    verts.push({
      ang: c0.ang,
      rad: c0.rad,
      role: 'corner',
      feat: null,
      part,
      amp,
    });
    if (c0.joint) {
      const am = c0.ang + c0.sweep * (0.40 + hash(seed, 80 + i) * 0.2);
      const rim = Math.min(c0.rad, c1.rad);
      const depth = 0.28 + hash(seed, 90 + i) * 0.12;
      const throatHost = verts[verts.length - 1];
      verts.push({
        ang: am,
        rad: rim,
        throat: rim * (1 - depth * 0.65),
        role: 'throat',
        feat: null,
        depth,
        part: throatHost.part,
        amp: throatHost.amp,
        cutT: 0.2 + hash(seed, 95 + i) * 0.45,
        cutHalf: 0.08 + hash(seed, 96 + i) * 0.05,
      });
    } else {
      const am = c0.ang + c0.sweep * 0.5;
      const chord = chordRadius(c0.rad, c0.ang, c1.rad, a1, am);
      const rim = (c0.rad + c1.rad) * 0.5;
      const filled = chord + (rim - chord) * 0.72;
      const host = verts[verts.length - 1];
      const nextPart = ((i + 1) + Math.floor(hash(seed, 8) * 3)) % 3;
      const nextAmp = cornerAmp(i + 1, a1);
      verts.push({
        ang: am,
        rad: filled,
        chord: filled,
        role: 'mid',
        feat: null,
        nx: Math.cos(am),
        nz: Math.sin(am),
        r0: c0.rad,
        a0: c0.ang,
        part0: host.part,
        amp0: host.amp,
        r1: c1.rad,
        a1,
        part1: nextPart,
        amp1: Number.isFinite(nextAmp) ? nextAmp : host.amp,
      });
    }
  }
  const mids = verts.filter((v) => v.role === 'mid');
  let notch = mids[0];
  let notchScore = -1e9;
  for (let i = 0; i < mids.length; i += 1) {
    const v = mids[i];
    let score = v.nz;
    if (kind === 'leg') {
      score = outerSign * v.nx * 0.85 + v.nz * 0.3;
      if (outerSign * v.nx < -0.15) score -= 3;
    }
    if (score > notchScore) {
      notchScore = score;
      notch = v;
    }
  }
  if (notch && kind !== 'crust') notch.feat = 'notch';
  let spur = null;
  let spurScore = -1e9;
  for (let i = 0; i < mids.length; i += 1) {
    const v = mids[i];
    if (v.feat) continue;
    if (kind === 'leg' && outerSign * v.nx < 0.05) continue;
    const score = kind === 'leg'
      ? outerSign * v.nx
      : v.nx * (hash(seed, 91) - 0.45) + v.nz * 0.15 + hash(seed, 94 + i);
    if (score > spurScore) {
      spurScore = score;
      spur = v;
    }
  }
  if (spur && kind !== 'platform' && kind !== 'crust') {
    spur.feat = 'spur';
    spur.outer = spur.chord + (kind === 'leg' ? 0.065 : 0.075 + hash(seed, 92) * 0.03);
  }
  let ledges = 0;
  for (let i = 0; i < mids.length && ledges < 2; i += 1) {
    const v = mids[i];
    if (v.feat) continue;
    v.feat = 'ledge';
    v.push = 0.10 + hash(seed, 93 + i) * 0.05;
    v.ledgeAt = 0.28 + hash(seed, 97 + i) * 0.42;
    const at = verts.indexOf(v);
    const prev = verts[at - 1];
    const next = verts[at + 1];
    if (prev && prev.role === 'corner' && !prev.feat) {
      prev.feat = 'lip';
      prev.lip = v.push * 0.45;
      prev.ledgeAt = v.ledgeAt;
    }
    if (next && next.role === 'corner' && !next.feat) {
      next.feat = 'lip';
      next.lip = v.push * 0.45;
      next.ledgeAt = v.ledgeAt;
    }
    ledges += 1;
  }
  const first = verts[0];
  verts.push({
    ...first,
    ang: first.ang + Math.PI * 2,
    seam: true,
  });
  return { verts, joints };
}

function sanitiseRings(rows) {
  const sorted = rows.slice().sort((a, b) => a.t - b.t);
  const out = [{ t: sorted[0].t, s: sorted[0].s }];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = out[out.length - 1];
    const t = Math.max(sorted[i].t, prev.t + 0.04);
    if (t >= 0.94) break;
    out.push({ t, s: sorted[i].s });
  }
  if (out[out.length - 1].t < 0.90) out.push({ t: 0.92, s: 0.86 });
  return out;
}

function volumeBreaks(seed, kind) {
  if (kind === 'crust') return { a: 0.34, b: 0.62, c: 0.8, amp: 0.05 };
  if (kind === 'platform') return { a: 0.32, b: 0.58, c: 0.76, amp: 0.12 };
  if (kind === 'leg') {
    return {
      a: 0.26 + hash(seed, 17) * 0.08,
      b: 0.52 + hash(seed, 18) * 0.06,
      c: 0.74,
      amp: 0.1,
    };
  }
  if (kind === 'crown') {
    return { a: 0.28, b: 0.52, c: 0.74, amp: 0.16 };
  }
  const a = 0.16 + hash(seed, 17) * 0.12;
  const b = a + 0.22 + hash(seed, 18) * 0.1;
  const c = Math.min(0.84, b + 0.16 + hash(seed, 19) * 0.06);
  return { a, b, c, amp: 0.22 + hash(seed, 20) * 0.08 };
}

function massShift(t, vols) {
  const span = (u, lo, hi) => (u - lo) / Math.max(0.04, hi - lo);
  if (t <= vols.a) return 0.2 * span(t, 0, vols.a);
  if (t <= vols.b) return 0.2 + 0.8 * span(t, vols.a, vols.b);
  if (t <= vols.c) return 1 - 0.35 * span(t, vols.b, vols.c);
  return Math.max(0, 0.65 * (1 - span(t, vols.c, 0.92)));
}

function volumeGain(part, amp, t, vols) {
  const A = vols.a;
  const B = vols.b;
  const C = vols.c;
  const span = (u, lo, hi) => (u - lo) / Math.max(0.04, hi - lo);
  if (part === 0) {
    if (t <= A) return 1 - 0.15 * amp + (amp + 0.15 * amp) * span(t, 0, A);
    if (t <= B) return 1 + amp - 2 * amp * span(t, A, B);
    return 1 - amp + 0.2 * amp * Math.min(1, span(t, B, 0.92));
  }
  if (part === 1) {
    if (t <= A) return 1 + 0.55 * amp - 1.45 * amp * span(t, 0, A);
    if (t <= B) return 1 - 0.9 * amp + 1.9 * amp * span(t, A, B);
    return 1 + amp - 1.55 * amp * Math.min(1, span(t, B, 0.92));
  }
  if (t <= B) return 1 - 0.28 * amp;
  if (t <= C) return 1 - 0.28 * amp + 1.22 * amp * span(t, B, C);
  return 1 + 0.94 * amp - 1.75 * amp * Math.min(1, span(t, C, 0.92));
}

function ringRows(seed, notchT, kind) {
  const vols = volumeBreaks(seed, kind);
  const notch = Math.max(0.06, Math.min(0.2, notchT));
  const raw = [0, notch, vols.a, vols.a + 0.045, (vols.a + vols.b) * 0.5, vols.b, vols.b + 0.045, vols.c, 0.92];
  raw.sort((a, b) => a - b);
  const rows = [];
  for (let i = 0; i < raw.length; i += 1) {
    const t = raw[i];
    if (t > 0.93) continue;
    if (rows.length && t - rows[rows.length - 1].t < 0.035) continue;
    rows.push({ t, s: 1 });
  }
  if (rows[rows.length - 1].t < 0.9) rows.push({ t: 0.92, s: 1 });
  return { ledgeT: vols.b, notch, vols, rows };
}

function sampleRadius(v, ringT, ringS, notchT, ledgeT, notchDepth, vols) {
  const gainOf = (part, amp) => volumeGain(part ?? 0, amp || 0, ringT, vols);
  let rad;
  if (v.role === 'mid' && v.r0) {
    const r0 = v.r0 * gainOf(v.part0, v.amp0);
    const r1 = v.r1 * gainOf(v.part1, v.amp1);
    rad = chordRadius(r0, v.a0, r1, v.a1, v.ang) * ringS;
    if (v.feat === 'notch') rad *= 1 - notchDepth * pulse(ringT, notchT, 0.06);
  } else if (v.role === 'throat') {
    const cut = pulse(ringT, v.cutT, v.cutHalf);
    const rim = v.rad * gainOf(v.part, v.amp * 0.35);
    rad = (rim * (1 - cut) + v.throat * cut) * ringS;
  } else {
    rad = v.rad * gainOf(v.part, v.amp) * ringS;
  }
  void ledgeT;
  return Math.max(0.4, Math.min(1.55, rad));
}

function paintVertex(col, v, t, seed, dry, ledgeT) {
  const warm = hash(Math.round(v.ang * 1.7) + seed * 3, 11) > 0.5;
  col.copy(CHALK).lerp(warm ? WARM : COOL, 0.08);
  if (v.role === 'throat') {
    const cut = pulse(t, v.cutT ?? 0.45, v.cutHalf ?? 0.14);
    col.lerp(RECESS, cut * 0.72);
  }
  if (!dry && t < 0.16) col.lerp(DAMP, ((0.16 - t) / 0.16) * 0.5);
  if (v.feat === 'ledge' && t < (v.ledgeAt ?? ledgeT) && (v.ledgeAt ?? ledgeT) - t < 0.06) {
    col.lerp(RECESS, 0.35);
  }
  if (t > 0.84 && v.role !== 'throat' && hash(Math.round(v.ang * 3) + seed, 12) > 0.62) {
    col.lerp(MOSS, 0.26);
  }
}

function signedVolume(positions, indices) {
  let volume = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] * 3;
    const ib = indices[t + 1] * 3;
    const ic = indices[t + 2] * 3;
    const ax = positions[ia];
    const ay = positions[ia + 1];
    const az = positions[ia + 2];
    const bx = positions[ib];
    const by = positions[ib + 1];
    const bz = positions[ib + 2];
    const cx = positions[ic];
    const cy = positions[ic + 1];
    const cz = positions[ic + 2];
    volume += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return volume / 6;
}

function reverseWinding(indices) {
  for (let t = 0; t < indices.length; t += 3) {
    const swap = indices[t + 1];
    indices[t + 1] = indices[t + 2];
    indices[t + 2] = swap;
  }
}

/**
 * @param {object} opts
 * @param {number} opts.seed
 * @param {number} opts.r world radius
 * @param {number} opts.h world height
 * @param {number} [opts.lean]
 * @param {number} [opts.squash]
 * @param {number} [opts.baseY]
 * @param {'stack'|'platform'|'leg'|'crown'|'crust'} [opts.kind]
 * @param {number} [opts.notchT]
 * @param {number} [opts.notchDepth]
 * @param {number} [opts.outerSign]
 * @param {boolean} [opts.dry]
 * @param {object} [opts.occlusion] AP1 (26 Oct): per-call overrides for the occlusion bake (tint, floor, wetDark,
 *   cavity, undercut, topLift). Omitted, the bake is exactly the shared default below, so other callers are unchanged.
 */
export function buildFracturedStone(opts) {
  const seed = opts.seed ?? 0;
  const r = opts.r;
  const h = Math.max(0.2, opts.h);
  const lean = opts.lean ?? 0;
  const squash = opts.squash ?? 1;
  const baseY = opts.baseY ?? 0;
  const kind = opts.kind || 'stack';
  const dry = opts.dry === true || kind === 'crown' || kind === 'crust';
  const outerSign = opts.outerSign ?? 1;
  const requestedNotch = opts.notchT ?? (0.10 + 0.08 * hash(seed, 231));
  const notchDepth = Math.max(0.18, Math.min(0.42, opts.notchDepth ?? (0.28 + 0.08 * hash(seed, 232))));
  const planned = ringRows(seed, requestedNotch, kind);
  const rows = planned.rows || planned;
  const notchT = planned.notch ?? rows[Math.min(2, rows.length - 1)].t;
  const ledgeT = planned.ledgeT ?? 0.55;
  const vols = planned.vols || { a: 0.3, b: 0.55, c: 0.75, amp: 0.1 };
  const { verts, joints } = makePlan(seed, kind, outerSign);
  const V = verts.length;
  const R = rows.length;
  const shoulderT = rows[R - 1].t;
  const positions = [];
  const colors = [];
  const uvs = [];
  const col = new THREE.Color();

  const pushVert = (x, y, z, u, v, color) => {
    positions.push(x, y, z);
    colors.push(color.r, color.g, color.b);
    uvs.push(u, v);
  };

  for (let ring = 0; ring < R; ring += 1) {
    const row = rows[ring];
    for (let i = 0; i < V; i += 1) {
      const vert = verts[i];
      const rad = sampleRadius(vert, row.t, row.s, notchT, ledgeT, kind === 'platform' ? notchDepth * 0.45 : notchDepth, vols);
      const shift = massShift(row.t, vols);
      const shiftAmp = kind === 'stack' ? 0.22 : kind === 'leg' ? 0.05 : 0.08;
      const sx = kind === 'leg'
        ? outerSign * shiftAmp * shift
        : (hash(seed, 21) - 0.5) * 2 * shiftAmp * shift;
      const sz = kind === 'leg' ? 0 : (hash(seed, 22) - 0.5) * 2 * shiftAmp * 0.75 * shift;
      const x = Math.cos(vert.ang) * rad * r + lean * row.t + sx * r;
      const y = baseY + row.t * h;
      const z = Math.sin(vert.ang) * rad * r * squash + sz * r;
      paintVertex(col, vert, row.t, seed, dry, ledgeT);
      if (kind === 'stack' || kind === 'leg') bandVertex(col, row.t * h, row.t, seed, dry);
      const u = vert.seam ? 1 : (vert.ang - verts[0].ang) / (Math.PI * 2);
      pushVert(x, y, z, u, row.t, col);
    }
  }

  const shoulderY = baseY + shoulderT * h;
  const crownY = baseY + h;
  const peakBase = positions.length / 3;
  let minPeak = Infinity;
  let maxPeak = -Infinity;
  let ledgeRelief = 0;
  for (let i = 0; i < V - 1; i += 1) {
    const a = verts[i];
    const b = verts[i + 1];
    const ia = (R - 1) * V + i;
    const ib = (R - 1) * V + i + 1;
    const mx = (positions[ia * 3] + positions[ib * 3]) * 0.5;
    const mz = (positions[ia * 3 + 2] + positions[ib * 3 + 2]) * 0.5;
    const jointEdge = a.role === 'throat' || b.role === 'throat';
    const drop = jointEdge
      ? h * (0.045 + hash(seed, 200 + i) * 0.03)
      : h * (0.004 + hash(seed, 210 + i) * 0.018);
    const y = Math.min(crownY, shoulderY + (crownY - shoulderY) + 0.02) - drop;
    const keep = Math.max(shoulderY + 0.02, y);
    minPeak = Math.min(minPeak, keep);
    maxPeak = Math.max(maxPeak, keep);
    const radial = Math.hypot(mx, mz) || 1;
    const bulge = (jointEdge ? -0.02 : 0.015) * r;
    paintVertex(col, jointEdge ? { ang: (a.ang + b.ang) * 0.5, role: 'throat', depth: 0.3 } : a, 0.96, seed, dry, ledgeT);
    pushVert(mx + (mx / radial) * bulge, keep, mz + (mz / radial) * bulge, (i + 0.5) / (V - 1), 1, col);
    if (a.feat === 'ledge' || b.feat === 'ledge') {
      const push = (a.push || b.push || 0.09) * r * 0.93;
      ledgeRelief = Math.max(ledgeRelief, push);
    }
  }
  const topCentre = positions.length / 3;
  let cx = 0;
  let cz = 0;
  let cy = 0;
  const peaks = V - 1;
  for (let i = 0; i < peaks; i += 1) {
    const pi = peakBase + i;
    cx += positions[pi * 3];
    cy += positions[pi * 3 + 1];
    cz += positions[pi * 3 + 2];
  }
  cx /= peaks;
  cy /= peaks;
  cz /= peaks;
  col.copy(CHALK).lerp(MOSS, dry ? 0.08 : 0.12);
  pushVert(cx, Math.max(shoulderY + 0.04, cy - (maxPeak - minPeak) * 0.35), cz, 0.5, 1, col);
  const bottomCentre = positions.length / 3;
  paintVertex(col, verts[0], 0, seed, dry, ledgeT);
  if (!dry) col.lerp(DAMP, 0.45);
  pushVert(lean * 0, baseY, 0, 0.5, 0, col);

  // W6-B: the ring grid is refined as a regular lattice (every ring keeps the same
  // number of columns, rows stay at one height), so the stone keeps its ring/column/crown-
  // fan structure while its faces carry m x n times the triangles. The cap vertices (peaks,
  // crown hub, foot centre) are untouched; each cap fan simply spans the finer shoulder.
  const refine = opts.lattice ?? (kind === 'stack' ? [4, 2] : kind === 'leg' ? [3, 2]
    : kind === 'crust' ? [1, 1] : [2, 2]);
  const lm = Math.max(1, refine[0]);
  const ln = Math.max(1, refine[1]);
  const Rr = (R - 1) * lm + 1;
  const Vr = (V - 1) * ln + 1;
  const gridPos = new Array(Rr * Vr * 3);
  const gridUv = new Array(Rr * Vr * 2);
  for (let rr = 0; rr < Rr; rr += 1) {
    const rf = rr / lm;
    const r0 = Math.min(R - 2, Math.floor(rf));
    const rt = rf - r0;
    for (let cc = 0; cc < Vr; cc += 1) {
      const cf = cc / ln;
      const c0 = Math.min(V - 2, Math.floor(cf));
      const ct = cf - c0;
      const i00 = r0 * V + c0;
      const i01 = r0 * V + c0 + 1;
      const i10 = (r0 + 1) * V + c0;
      const i11 = (r0 + 1) * V + c0 + 1;
      const o = rr * Vr + cc;
      for (let k = 0; k < 3; k += 1) {
        const a = positions[i00 * 3 + k] * (1 - ct) + positions[i01 * 3 + k] * ct;
        const b = positions[i10 * 3 + k] * (1 - ct) + positions[i11 * 3 + k] * ct;
        gridPos[o * 3 + k] = a * (1 - rt) + b * rt;
      }
      for (let k = 0; k < 2; k += 1) {
        const a = uvs[i00 * 2 + k] * (1 - ct) + uvs[i01 * 2 + k] * ct;
        const b = uvs[i10 * 2 + k] * (1 - ct) + uvs[i11 * 2 + k] * ct;
        gridUv[o * 2 + k] = a * (1 - rt) + b * rt;
      }
    }
  }
  const capPositions = positions.slice(peakBase * 3);
  const capUvs = uvs.slice(peakBase * 2);
  positions.length = 0;
  uvs.length = 0;
  for (let i = 0; i < gridPos.length; i += 1) positions.push(gridPos[i]);
  for (let i = 0; i < gridUv.length; i += 1) uvs.push(gridUv[i]);
  for (let i = 0; i < capPositions.length; i += 1) positions.push(capPositions[i]);
  for (let i = 0; i < capUvs.length; i += 1) uvs.push(capUvs[i]);
  const gridCount = Rr * Vr;
  const peakBaseR = gridCount;
  const topCentreR = peakBaseR + peaks;
  const bottomCentreR = topCentreR + 1;
  void topCentre;
  void bottomCentre;

  const indices = [];
  for (let ring = 0; ring < Rr - 1; ring += 1) {
    for (let i = 0; i < Vr - 1; i += 1) {
      const a = ring * Vr + i;
      const b = ring * Vr + i + 1;
      const c = (ring + 1) * Vr + i;
      const d = (ring + 1) * Vr + i + 1;
      indices.push(a, d, b, a, c, d);
    }
  }
  // Side quads own the bottom ring as (i+1 -> i) and the shoulder as (i -> i+1).
  // Caps use the opposite direction on those edges. One global reversal, if the
  // enclosed volume is negative, keeps every welded edge opposed.
  for (let i = 0; i < Vr - 1; i += 1) indices.push(bottomCentreR, i, i + 1);
  for (let i = 0; i < peaks; i += 1) {
    const k = peakBaseR + i;
    const kn = peakBaseR + ((i + 1) % peaks);
    for (let j = 0; j < ln; j += 1) {
      const s0 = (Rr - 1) * Vr + i * ln + j;
      const s1 = s0 + 1;
      indices.push(s1, s0, k);
    }
    const sEnd = (Rr - 1) * Vr + (i + 1) * ln;
    indices.push(sEnd, k, kn);
    indices.push(topCentreR, kn, k);
  }
  if (signedVolume(positions, indices) < 0) reverseWinding(indices);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  // W6-B register conversion. The coarse hull above fixes the silhouette and the
  // footprint; the lattice-refined surface is then given course recesses, a low crumble
  // and planar fracture cuts (position-only, so the seam cannot crack), and the vertex
  // colour is replaced by baked occlusion: the lowest 1.5 m darker, crevices and
  // undercuts darker, upward faces lighter. Rock colour and strata come from the stone
  // material's shader (stone-surface.js), not from the vertex colour.
  const fractured = fractureStone(geometry, {
    seed,
    levels: 0,
    baseY,
    recess: kind === 'crust' ? 0.03 : kind === 'crown' ? 0.06 : 0.10,
    crumble: kind === 'crust' ? 0.02 : 0.08,
    cuts: kind === 'stack' ? 4 : kind === 'leg' ? 2 : kind === 'platform' ? 3 : 0,
    cutDepth: kind === 'stack' ? 0.30 : 0.22,
  });
  bakeStoneOcclusion(fractured, {
    baseY,
    wetM: dry ? 0.01 : 1.5,
    wetDark: dry ? 0 : 0.22,
    topLift: 0.10,
    undercut: 0.22,
    cavity: 0.28,
    tint: STONE_BASE,
    ...(opts.occlusion || {}),
  });
  fractured.computeBoundingBox();

  const gaps = [];
  for (let i = 1; i < rows.length; i += 1) gaps.push(rows[i].t - rows[i - 1].t);
  const thick = Math.max(...gaps);
  const thin = Math.min(...gaps);
  const inset = (kind === 'platform' ? notchDepth * 0.45 : notchDepth) * 0.8 * r;
  let bandRelief = ledgeRelief;
  for (let i = 0; i < verts.length; i += 1) {
    const vert = verts[i];
    if (vert.role !== 'corner' || vert.seam) continue;
    const foot = vert.rad * volumeGain(vert.part, vert.amp, 0, vols);
    const shoulder = vert.rad * volumeGain(vert.part, vert.amp, vols.a, vols);
    const mid = vert.rad * volumeGain(vert.part, vert.amp, vols.b, vols);
    bandRelief = Math.max(bandRelief, Math.abs(shoulder - foot) * r, Math.abs(mid - shoulder) * r);
  }
  return {
    geometry: fractured,
    meta: {
      notchHeightM: +((notchT * h).toFixed(3)),
      notchDepthM: +(Math.max(0.05, inset).toFixed(3)),
      unequalCourseRatio: +((thick / thin).toFixed(3)),
      courseThicknessM: gaps.map((g) => +(g * h).toFixed(3)),
      horizontalBandReliefM: +(bandRelief.toFixed(3)),
      verticalFractures: joints,
      flatTopReliefM: +((maxPeak - minPeak).toFixed(3)),
      kind,
    },
  };
}
