// S3 dependency snapshot of S1's tested farm kit; no other runtime callers.
// Source: mdl-s1-shed-geometry/mvp/src/render/fringe/farm-models.js
// Source SHA256: 1b409af4e7544b3a85da9c469ffdf8c8574fb21105c188371fd09602e676b25a
// farm.js prefers S1's shared exports when they land; this fallback can then retire.
import * as THREE from 'three';
import { TASTE } from '../taste-tokens.js';
import { makeShedGeometry as makeLegacyShedGeometry } from './farm-models.js';
import { std } from './kit.js';
const TAU = Math.PI * 2;

class Mesher {
  constructor() { this.pos = []; this.col = []; this.idx = []; }

  get count() { return this.pos.length / 3; }

  v(x, y, z, c) {
    this.pos.push(x, y, z);
    this.col.push(c[0], c[1], c[2]);
    return this.count - 1;
  }

  t(a, b, c) { this.idx.push(a, b, c); }

  q(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }

  /**
   * Run `fn`, then make the triangles it emitted face outward. A part is judged by the
   * area-weighted sign of (face normal . face centre - part centre), which is right for
   * convex and gently bent solids (limbs, barrels, boxes, frusta).
   */
  solid(fn) {
    const start = this.idx.length;
    fn();
    const end = this.idx.length;
    let cx = 0, cy = 0, cz = 0, n = 0;
    const seen = new Set();
    for (let i = start; i < end; i += 1) {
      const k = this.idx[i];
      if (seen.has(k)) continue;
      seen.add(k);
      cx += this.pos[k * 3]; cy += this.pos[k * 3 + 1]; cz += this.pos[k * 3 + 2]; n += 1;
    }
    if (!n) return;
    cx /= n; cy /= n; cz /= n;
    let score = 0;
    for (let i = start; i < end; i += 3) {
      const a = this.idx[i] * 3, b = this.idx[i + 1] * 3, c = this.idx[i + 2] * 3;
      const ux = this.pos[b] - this.pos[a], uy = this.pos[b + 1] - this.pos[a + 1], uz = this.pos[b + 2] - this.pos[a + 2];
      const vx = this.pos[c] - this.pos[a], vy = this.pos[c + 1] - this.pos[a + 1], vz = this.pos[c + 2] - this.pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const mx = (this.pos[a] + this.pos[b] + this.pos[c]) / 3 - cx;
      const my = (this.pos[a + 1] + this.pos[b + 1] + this.pos[c + 1]) / 3 - cy;
      const mz = (this.pos[a + 2] + this.pos[b + 2] + this.pos[c + 2]) / 3 - cz;
      score += nx * mx + ny * my + nz * mz;
    }
    if (score < 0) {
      for (let i = start; i < end; i += 3) {
        const tmp = this.idx[i + 1];
        this.idx[i + 1] = this.idx[i + 2];
        this.idx[i + 2] = tmp;
      }
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const grey = (t) => [t, t, t];
const mul = (c, t) => [c[0] * t, c[1] * t, c[2] * t];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const linear = (hex, k = 1) => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; };

/** A small deterministic generator (mulberry32). */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/* ------------------------------------------------------------------ */
/* Primitives                                                           */
/* ------------------------------------------------------------------ */

/**
 * A box or frustum standing on y = cy: base half extents (hx0, hz0), top half extents
 * (hx1, hz1), height h, top offset (ox, oz), rotated by yaw about Y. Hard edges. Options:
 * `bottom` (default false) closes the underside, `top` (default true) closes the top.
 */
function frustum(m, cx, cy, cz, hx0, hz0, hx1, hz1, h, c0, c1, o = {}) {
  const yaw = o.yaw ?? 0, ox = o.ox ?? 0, oz = o.oz ?? 0;
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const at = (x, y, z) => [cx + x * cs + z * sn, cy + y, cz - x * sn + z * cs];
  const ring = (hx, hz, y, dx, dz) => [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => at(x + dx, y, z + dz));
  const B = ring(hx0, hz0, 0, 0, 0);
  const T = ring(hx1, hz1, h, ox, oz);
  m.solid(() => {
    for (let k = 0; k < 4; k += 1) {
      const k2 = (k + 1) % 4;
      const a = m.v(B[k][0], B[k][1], B[k][2], c0);
      const b = m.v(B[k2][0], B[k2][1], B[k2][2], c0);
      const c = m.v(T[k2][0], T[k2][1], T[k2][2], c1);
      const d = m.v(T[k][0], T[k][1], T[k][2], c1);
      m.q(a, b, c, d);
    }
    if (o.top !== false) m.q(...T.map((p) => m.v(p[0], p[1], p[2], c1)));
    if (o.bottom) m.q(...B.map((p) => m.v(p[0], p[1], p[2], c0)));
  });
}

/** An oriented box between two points: used for beams, rails, braces and stays. */
function beam(m, p0, p1, ha, hb, c0, c1 = c0, ref = [0, 0, 1], o = {}) {
  tube(m, [{ p: p0, a: ha, b: hb, c: c0 }, { p: p1, a: ha, b: hb, c: c1 }], { ref, sides: 4, capStart: o.capStart ?? true, capEnd: o.capEnd ?? true });
}

/**
 * A tube through points. Each point: { p: [x,y,z], a, b, c } where a and b are the half
 * extents across the tube and c is a vertex colour. The frame is built from the path tangent
 * and `ref`. `sides` 4 gives a box section aligned to the frame, 5+ a rounded section.
 */
function tube(m, pts, o = {}) {
  const sides = o.sides ?? 4;
  const ref0 = o.ref ?? [0, 0, 1];
  const rings = [];
  for (let i = 0; i < pts.length; i += 1) {
    const prev = pts[Math.max(0, i - 1)].p, next = pts[Math.min(pts.length - 1, i + 1)].p;
    // `flatEnd`: the last ring lies level, so a foot ends flat on y whatever the leg's lean.
    const T = o.flatEnd && i === pts.length - 1 ? [0, -1, 0] : norm(sub(next, prev));
    let ref = ref0;
    if (Math.abs(T[0] * ref[0] + T[1] * ref[1] + T[2] * ref[2]) > 0.95) ref = [1, 0, 0];
    const A = norm(cross(T, ref));
    const B = cross(T, A);
    const pt = pts[i];
    const verts = [];
    for (let k = 0; k < sides; k += 1) {
      let u, w;
      if (sides === 4) { [u, w] = [[1, 1], [1, -1], [-1, -1], [-1, 1]][k]; } else { const ang = (k / sides) * TAU; u = Math.cos(ang); w = Math.sin(ang); }
      verts.push([
        pt.p[0] + A[0] * u * pt.a + B[0] * w * pt.b,
        pt.p[1] + A[1] * u * pt.a + B[1] * w * pt.b,
        pt.p[2] + A[2] * u * pt.a + B[2] * w * pt.b,
      ]);
    }
    rings.push({ verts, c: pt.c });
  }
  m.solid(() => {
    const ids = rings.map((r) => r.verts.map((p) => m.v(p[0], p[1], p[2], r.c)));
    for (let i = 0; i < ids.length - 1; i += 1) {
      for (let k = 0; k < sides; k += 1) { const k2 = (k + 1) % sides; m.q(ids[i][k], ids[i][k2], ids[i + 1][k2], ids[i + 1][k]); }
    }
    const cap = (r) => {
      const ctr = r.verts.reduce((s, p) => [s[0] + p[0] / sides, s[1] + p[1] / sides, s[2] + p[2] / sides], [0, 0, 0]);
      const cc = mul(r.c, 0.92);
      const ci = m.v(ctr[0], ctr[1], ctr[2], cc);
      const vi = r.verts.map((p) => m.v(p[0], p[1], p[2], cc));
      for (let k = 0; k < sides; k += 1) m.t(ci, vi[k], vi[(k + 1) % sides]);
    };
    if (o.capStart !== false) cap(rings[0]);
    if (o.capEnd !== false) cap(rings[rings.length - 1]);
  });
}


function facing(m, dir, fn) {
  const start = m.idx.length;
  fn();
  let score = 0;
  for (let i = start; i < m.idx.length; i += 3) {
    const a = m.idx[i] * 3, b = m.idx[i + 1] * 3, c = m.idx[i + 2] * 3;
    const ux = m.pos[b] - m.pos[a], uy = m.pos[b + 1] - m.pos[a + 1], uz = m.pos[b + 2] - m.pos[a + 2];
    const vx = m.pos[c] - m.pos[a], vy = m.pos[c + 1] - m.pos[a + 1], vz = m.pos[c + 2] - m.pos[a + 2];
    score += (uy * vz - uz * vy) * dir[0] + (uz * vx - ux * vz) * dir[1] + (ux * vy - uy * vx) * dir[2];
  }
  if (score < 0) {
    for (let i = start; i < m.idx.length; i += 3) { const t = m.idx[i + 1]; m.idx[i + 1] = m.idx[i + 2]; m.idx[i + 2] = t; }
  }
}


function flatQuad(m, dir, pts, cols) {
  facing(m, dir, () => { m.q(...pts.map((p, i) => m.v(p[0], p[1], p[2], cols[i] ?? cols[0]))); });
}

/** A fan polygon (convex) facing `dir`. */
function flatFan(m, dir, pts, col) {
  facing(m, dir, () => {
    const ids = pts.map((p) => m.v(p[0], p[1], p[2], col));
    for (let i = 1; i < ids.length - 1; i += 1) m.t(ids[0], ids[i], ids[i + 1]);
  });
}


function guttersAndPipe(m, tones, { x0, x1, z, y, pipeX, zSign }) {
  beam(m, [x0, y, z], [x1, y, z], 0.075, 0.055, mul(tones.iron, 0.62), mul(tones.iron, 0.62), [0, 1, 0], { capStart: true, capEnd: true });
  if (pipeX !== undefined) {
    frustum(m, pipeX, 0.10, z + zSign * 0.02, 0.040, 0.040, 0.040, 0.040, y - 0.10, mul(tones.iron, 0.55), mul(tones.iron, 0.70));
  }
}


export const SHED_DEFAULTS = Object.freeze({
  shedGeometry: 1,
  shedPitch: 18.5,       // gable roof degrees
  shedEave: 3.9,         // floor-to-eave metres; machinery clear opening below
  shedPost: 0.175,       // square portal post metres
  shedDoorHeight: 3.65,  // clear opening metres
  shedDoorRecess: 0.20,  // face-to-door metres
  shedDepth: 0.07,       // crest-to-trough metres
  shedRibPitch: 0.304,   // four 76 mm corrugations per geometry band (budget compromise)
  shedRibV: 8,          // encoded vertex-colour crest/trough difference, V points
  shedStainV: 17.5,      // wall-to-base-stain difference, V points
  shedSaturation: 0.17, // iron; timber +.05, concrete -.03
  shedGain: 0.26,        // same linear lighting gain as the existing fringe contract
});
const SHED_LIMITS = {
  shedPitch: [15, 22], shedEave: [3.8, 4.2], shedPost: [0.15, 0.20],
  shedDoorHeight: [3.6, 3.8], shedDoorRecess: [0.15, 0.25], shedDepth: [0.06, 0.08],
  shedRibPitch: [0.076, 0.38], shedRibV: [6, 12], shedStainV: [15, 20],
  shedSaturation: [0.12, 0.22], shedGain: [0.20, 0.34],
};

/** Explicit options win; URL keys work in play and lab; Node has DD_SHED_GEOMETRY=0. */
export function shedOptions(options = {}, search = globalThis.location?.search ?? '') {
  const params = new URLSearchParams(search), out = {};
  for (const [key, fallback] of Object.entries(SHED_DEFAULTS)) {
    const env = key === 'shedGeometry' ? globalThis.process?.env?.DD_SHED_GEOMETRY : undefined;
    const raw = options[key] ?? params.get(key) ?? env ?? fallback;
    const n = raw === '' ? fallback : Number(raw);
    out[key] = Number.isFinite(n) ? n : fallback;
    if (SHED_LIMITS[key]) out[key] = THREE.MathUtils.clamp(out[key], ...SHED_LIMITS[key]);
  }
  out.shedGeometry = out.shedGeometry === 0 ? 0 : 1;
  out.shedDoorHeight = Math.min(out.shedDoorHeight, out.shedEave - 0.15);
  return out;
}

export const SHED_VARIANTS = Object.freeze([
  'hay-2', 'hay-3', 'hay-4', 'machinery-2', 'machinery-3', 'machinery-4',
  'dutch', 'shearing', 'tank', 'silo',
]);
const SHED_ALIASES = { gable: 'hay-3', skillion: 'machinery-3', leanto: 'shearing' };

/** Same white, vertex-coloured, non-emissive surface used by fringe.js, built at the shared kit site (gate ruling 10). */
export function makeShedMaterial() {
  return std('#ffffff', { vertexColors: true, roughness: 0.86, metalness: 0.06 });
}

// HSV here is encoded sRGB, as in the capture rubric. Return linear colour attributes.
function shedColour(c, { saturation, deltaV = 0 } = {}) {
  const rgb = new THREE.Color().setRGB(...c).convertLinearToSRGB();
  const hi = Math.max(rgb.r, rgb.g, rgb.b), lo = Math.min(rgb.r, rgb.g, rgb.b);
  const s = saturation ?? THREE.MathUtils.clamp((hi - lo) / Math.max(hi, 1e-6), 0.10, 0.29);
  const v = THREE.MathUtils.clamp(hi + deltaV / 100, 0.025, 0.95);
  const channel = (x) => v * (1 - s + s * (x - lo) / Math.max(hi - lo, 1e-6));
  rgb.setRGB(channel(rgb.r), channel(rgb.g), channel(rgb.b)).convertSRGBToLinear();
  return rgb.toArray();
}
function newShedTones(o) {
  const tone = (hex, saturation) => shedColour(linear(hex, o.shedGain), { saturation });
  const iron = tone(TASTE.built.roofIron, o.shedSaturation);
  const timber = tone(TASTE.built.timber, Math.min(0.29, o.shedSaturation + 0.05));
  return { iron, ironWall: iron, timber, concrete: tone(TASTE.built.concrete, o.shedSaturation - 0.03),
    ridge: shedColour(iron, { deltaV: 3 }), dark: shedColour(iron, { deltaV: -20 }),
    stain: shedColour(iron, { deltaV: -o.shedStainV }),
    rust: tone(TASTE.built.timber, Math.min(0.29, o.shedSaturation + 0.07)) };
}
function shedPart(m, parts, name, fn) {
  const vertexStart = m.count, triangleStart = m.idx.length / 3;
  fn();
  parts.push({ name, vertexStart, vertexCount: m.count - vertexStart,
    triangleStart, triangles: m.idx.length / 3 - triangleStart });
}

/** Folded sheet with colour-baked fixing trails, gutter oxidation and foot splash. */
function shedSheet(m, parts, name, point, normal, length, T, o, { wall = false, timber = false, curved = false } = {}) {
  const n = Math.ceil(length / o.shedRibPitch), rows = wall ? [0, 0.12, 0.80, 1] : curved ? [0, 1] : [0, 0.86, 1];
  shedPart(m, parts, name, () => facing(m, normal(0.5, 0.5), () => {
    let previous;
    for (let i = 0; i <= 2 * n; i++) {
      const u = i / (2 * n), crest = i % 2, ids = [];
      for (const v of rows) {
        const p = point(u, v), N = normal(u, v);
        let c = timber ? T.timber : T.iron;
        // Correlated trails below the sheet fixings; the large field remains calm.
        if (i % 19 <= 1 && v > 0.12) c = mix(c, T.rust, 0.27 * (1 - v * 0.65));
        const oxidation = !wall && v > 0.8 ? 2.5 : 0;
        const splash = wall && v === 0 ? o.shedStainV : 0;
        c = shedColour(c, { deltaV: -(crest ? 0 : o.shedRibV) - oxidation - splash });
        ids.push(m.v(p[0] + N[0] * crest * o.shedDepth, p[1] + N[1] * crest * o.shedDepth,
          p[2] + N[2] * crest * o.shedDepth, c));
      }
      if (previous) for (let j = 0; j < rows.length - 1; j++) m.q(previous[j], ids[j], ids[j + 1], previous[j + 1]);
      previous = ids;
    }
  }));
}

function shedProp(m, parts, variant, T, o) {
  const tank = variant === 'tank', radius = tank ? 1.6 : 2.0, height = tank ? 2.6 : 7.2;
  const seg = 48, rings = tank ? 12 : 14;
  shedPart(m, parts, 'prop-shell', () => {
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const points = [];
      for (const [s, r] of [[i,j], [i+1,j], [i+1,j+1], [i,j+1]]) {
        const a = TAU * s / seg, y = 0.12 + (height - 0.12) * r / rings;
        const rad = radius + (r % 2) * 0.035;
        const c = shedColour(T.iron, { deltaV: -(r % 2 ? 0 : o.shedRibV) - (r === 0 ? 10 : 0) });
        points.push(m.v(Math.cos(a) * rad, y, Math.sin(a) * rad, c));
      }
      // Increasing angle x height points inward, so reverse this winding.
      m.q(points[3], points[2], points[1], points[0]);
    }
  });
  shedPart(m, parts, 'prop-roof', () => {
    const top = m.v(0, height + (tank ? 0.16 : 0.8), 0, T.ridge);
    for (let i = 0; i < seg; i++) {
      const a = TAU * i / seg, b = TAU * (i + 1) / seg;
      m.t(top, m.v(Math.cos(b)*radius, height, Math.sin(b)*radius, T.iron),
        m.v(Math.cos(a)*radius, height, Math.sin(a)*radius, T.iron));
    }
  });
  shedPart(m, parts, 'prop-base', () => frustum(m, 0, 0, 0, radius + 0.10, radius + 0.10,
    radius + 0.10, radius + 0.10, 0.12, T.stain, T.concrete));
  if (tank) shedPart(m, parts, 'tap-and-inlet', () => {
    beam(m, [radius, 0.45, 0], [radius + 0.22, 0.45, 0], .04, .04, T.dark);
    frustum(m, -.6, height, 0, .14, .14, .14, .14, .18, T.iron, T.ridge);
  });
  else shedPart(m, parts, 'ladder-and-hatch', () => {
    for (const x of [-.20, .20]) beam(m, [x,.20,radius+.14], [x,height+.16,radius+.14], .022,.022,T.dark);
    for (let y=.3; y<height; y+=.3) beam(m, [-.20,y,radius+.17], [.20,y,radius+.17], .018,.018,T.ridge);
    frustum(m, 0, height+.42, 0, .26,.26,.26,.26,.24,T.iron,T.ridge);
  });
  return { length: radius * 2, width: radius * 2, height, bays: null, eave: null, pitch: null };
}

/**
 * One indexed geometry/material per form, at scale 1. Legacy names remain valid.
 * S2 must select bay counts and remove fringe.js's nonuniform placement scales.
 */
export function makeShedGeometry(variant = 'gable', options = {}) {
  const o = shedOptions(options);
  if (!o.shedGeometry) {
    const legacy = ['gable', 'skillion', 'leanto'].includes(variant) ? variant
      : variant.startsWith('machinery') ? 'skillion' : variant === 'shearing' ? 'leanto' : 'gable';
    return makeLegacyShedGeometry(legacy);
  }
  const id = SHED_ALIASES[variant] ?? variant;
  if (!SHED_VARIANTS.includes(id)) throw new RangeError(`Unknown farm form: ${variant}`);
  const m = new Mesher(), parts = [], T = newShedTones(o);
  const part = (name, fn) => shedPart(m, parts, name, fn);
  let spec;
  if (id === 'tank' || id === 'silo') spec = shedProp(m, parts, id, T, o);
  else {
    const bays = Number(id.split('-')[1]) || 3, length = bays * 4, width = 8;
    const x0 = -length / 2, x1 = length / 2, W = width / 2;
    const raised = id === 'shearing', curved = id === 'dutch', machinery = id.startsWith('machinery');
    if (raised) T.stain = shedColour(T.timber, { deltaV: -o.shedStainV });
    const floor = raised ? 0.65 : 0.12, eave = floor + o.shedEave, slope = Math.tan(o.shedPitch * Math.PI / 180);
    const roofY = z => curved ? eave + 2.1 * Math.sqrt(Math.max(0, 1 - (z / W) ** 2))
      : eave + (W - Math.abs(z)) * slope;
    spec = { length, width, bays, floor, eave: o.shedEave, pitch: curved ? null : o.shedPitch,
      post: o.shedPost, doorHeight: machinery ? o.shedDoorHeight : null,
      doorRecess: machinery ? o.shedDoorRecess : null, corrugation: o.shedDepth, ribPitch: o.shedRibPitch };
    part('slab', () => frustum(m, 0, 0, .30, x1+.25,W+.60,x1+.25,W+.60,floor,T.stain,T.concrete));
    part('base-stain', () => {
      for (const sign of [-1,1]) {
        const z = .30 + sign*(W+.601);
        flatQuad(m,[0,0,sign],[[x0,0,z],[x1,0,z],[x1,floor,z],[x0,floor,z]],[T.stain]);
      }
    });
    part('shaded-floor', () => flatQuad(m,[0,1,0],[[x0,floor+.002,-W],[x0,floor+.002,W],
      [x1,floor+.002,W],[x1,floor+.002,-W]],[T.dark]));
    // Dutch barn is an eight-facet barrel vault; gable forms have two true-pitch planes.
    const spans = curved ? 8 : 2;
    for (let k=0;k<spans;k++) {
      const za = -4.4 + 8.8*k/spans, zb = -4.4 + 8.8*(k+1)/spans;
      const ya = roofY(za), yb = roofY(zb), N=norm([0,zb-za,ya-yb]);
      shedSheet(m,parts,`roof-${k}`,(u,v)=>[x0-.4+(length+.8)*u,ya+(yb-ya)*v,za+(zb-za)*v],()=>N,
        length+.8,T,o,{curved});
      part(`soffit-${k}`,()=>flatQuad(m,mul(N,-1),[[x0-.4,ya-.09,za],[x1+.4,ya-.09,za],
        [x1+.4,yb-.09,zb],[x0-.4,yb-.09,zb]],[T.dark]));
      part(`barge-${k}`,()=>{for(const x of [x0-.4,x1+.4]) beam(m,[x,ya,za],[x,yb,zb],.045,.06,T.ridge);});
    }
    if (!curved) part('ridge',()=>beam(m,[x0-.44,roofY(0)+.06,0],[x1+.44,roofY(0)+.06,0],.16,.035,T.ridge,T.ridge,[0,1,0]));
    const sheetWall=(name,origin,axis,len,N,top) => {
      shedSheet(m,parts,name,(u,v)=>[origin[0]+axis[0]*u*len,floor+(top(u)-floor)*v,origin[1]+axis[1]*u*len],
        ()=>N,len,T,o,{wall:true,timber:raised});
    };
    sheetWall('back-wall',[x1,-W],[-1,0],length,[0,0,-1],()=>eave);
    for(const sign of [-1,1]) {
      if (!curved) sheetWall(`end-wall-${sign}`,[sign*x1,-W],[0,1],width,[sign,0,0],u=>roofY(-W+u*width));
      if (!curved) part(`inner-end-${sign}`,()=>flatFan(m,[-sign,0,0],[[sign*(x1-.09),floor,-W],[sign*(x1-.09),floor,W],
        [sign*(x1-.09),eave,W],[sign*(x1-.09),roofY(0),0],[sign*(x1-.09),eave,-W] ],T.dark));
    }
    part('inner-back',()=>flatQuad(m,[0,0,1],[[x0,floor,-W+.09],[x1,floor,-W+.09],
      [x1,eave,-W+.09],[x0,eave,-W+.09]],[T.dark]));
    for(let i=0;i<=bays;i++) {
      const x=x0+o.shedPost/2+(length-o.shedPost)*i/bays;
      for(const z of [-W+.1,W-.1]) {
        part(`post-${i}-${z}`,()=>frustum(m,x,floor,z,o.shedPost/2,o.shedPost/2,
          o.shedPost/2,o.shedPost/2,o.shedEave,T.timber,T.timber));
        part(`knee-${i}-${z}`,()=>beam(m,[x,eave-.6,z],[x,eave+.15,z-Math.sign(z)*.7],.045,.065,T.timber));
      }
      part(`rafter-${i}`,()=>{for(let k=0;k<spans;k++) {
        const za=-W+width*k/spans,zb=-W+width*(k+1)/spans;
        beam(m,[x,roofY(za)-.12,za],[x,roofY(zb)-.12,zb],.07,.10,T.timber);
      }});
    }
    part('purlins-and-girts',()=>{
      for(const z of [-3,-1.5,1.5,3]) beam(m,[x0,roofY(z)-.17,z],[x1,roofY(z)-.17,z],.05,.07,T.timber);
      for(const y of [floor+1.2,floor+2.5]) beam(m,[x0,y,-W+.17],[x1,y,-W+.17],.05,.06,T.timber);
    });
    part('gutters',()=>{for(const sign of [-1,1]) guttersAndPipe(m,T,{x0:x0-.4,x1:x1+.4,z:sign*4.43,
      y:roofY(4.4)-.12,pipeX:sign===1?x1-.1:undefined,zSign:sign});});
    if(machinery) for(let i=0;i<bays;i++) {
      const xa=x0+i*4+.22,xb=x0+(i+1)*4-.22,yh=floor+o.shedDoorHeight,z=W-o.shedDoorRecess;
      part(`door-reveal-${i}`,()=>{
        for(const x of [xa,xb]) flatQuad(m,[x===xa?1:-1,0,0],[[x,floor,W],[x,floor,z],[x,yh,z],[x,yh,W]],[T.dark]);
        flatQuad(m,[0,-1,0],[[xa,yh,W],[xb,yh,W],[xb,yh,z],[xa,yh,z]],[T.dark]);
      });
      // First bay is fully open; other rollers sit inside the actual reveal, not on the wall.
      if(i>0) shedSheet(m,parts,`roller-${i}`,(u,v)=>[xa+(xb-xa)*v,floor+o.shedDoorHeight*u,z-o.shedDepth],()=>[0,0,1],
        o.shedDoorHeight,T,o);
      part(`door-header-${i}`,()=>frustum(m,(xa+xb)/2,yh,W-.06,(xb-xa)/2,.06,(xb-xa)/2,.06,eave-yh,T.iron,T.ridge));
    }
    if(raised) {
      // Raised slatted holding pen and attached low skillion; both meet the main front.
      part('raised-pen',()=>{
        for(let i=0;i<=24;i++) frustum(m,x0+.2+i*(length-.4)/24,.47,5.35,.17,1.2,.17,1.2,.18,T.timber,T.timber);
        for(const x of [x0+.2,0,x1-.2]) {
          frustum(m,x,0,6.5,.085,.085,.085,.085,1.8,T.timber,T.timber);
        }
        for(const y of [.85,1.25,1.65]) beam(m,[x0+.2,y,6.5],[x1-.2,y,6.5],.045,.055,T.timber);
      });
      const N=norm([0,2.7,.55]);
      shedSheet(m,parts,'pen-skillion',(u,v)=>[x0+(length)*u,eave-.4-.55*v,3.95+2.7*v],()=>N,length,T,o);
      part('pen-roof-support',()=>{for(const x of [x0+.2,x1-.2]) frustum(m,x,floor,6.5,.085,.085,.085,.085,o.shedEave-1,T.timber,T.timber);});
    }
  }
  // Keep even deep occlusion in the local built palette; no shared token mutation.
  for(let i=0;i<m.col.length;i+=3) {
    const c=shedColour(m.col.slice(i,i+3));
    m.col[i]=c[0]; m.col[i+1]=c[1]; m.col[i+2]=c[2];
  }
  const g=m.geometry();
  g.name=`farm:${id}`;
  g.userData.shed={ id, ...spec, options:o, parts, colourSpace:'linear vertex RGB; HSV measurements in encoded sRGB' };
  return g;
}

