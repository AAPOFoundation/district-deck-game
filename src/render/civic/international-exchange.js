import { clusterCanopyPart } from '../foliage.js';
// District Deck V3.41 — MP9 lane H: `international-exchange`, the board's Beaux-Arts hero.
//
// Spec: `docs/next-phase/V341-MP9-BUILDINGS-SPEC.md` §6H. The bar is the Monopoly Plus Short Line
// station front (`mvp/_reviews/mp9/_refs-mp/mp-station-front.png`): a symmetric masonry front with
// a glazed vault behind it, a clock, statues on plinths, engaged columns, cypress planting, lamp
// standards, a balustraded terrace and people on the steps. Every one of those is modelled
// geometry in that frame, and the way to beat it is to model more of them, not to paint them.
//
// WHAT THIS REPLACES. `international-exchange` used to fall through to `building-kit.js`'s legacy
// `stock-exchange` path: honest massing, a clock tower, one flat sand albedo across the whole
// building, teal window decals, an open courtyard reading as an unfinished box, and 38 840
// triangles in 15 material buckets — six over the civic cap. None of that path survives here.
//
// THE COMPOSITION, front (+Z) to back:
//
//   plaza  ── granite setts with a border course, kerb, bollards on chain, two lamp standards,
//             four clipped bay trees in tubs
//   steps  ── seven risers the full width of the portico, cheek walls, and an allegorical figure
//             on a pedestal at each cheek
//   portico ─ six fluted columns of a giant order on pedestals, a full entablature with a brass
//             name band on the frieze, a pediment with a modelled tympanum relief, acroteria
//   body   ── rusticated podium with basement lights, giant-order pilasters, arched windows with
//             real voussoir rings and keystones, a string course, a mezzanine punch grid, a heavy
//             cornice with modillions, an attic balustrade with turned balusters and a flag row
//   crown  ── a central attic pavilion carrying the clock, under a hipped copper roof with a
//             glazed cupola
//   hall   ── a raised clerestory over the trading floor under a glazed barrel vault: the
//             station's own move, done in a financial register
//
// DETERMINISM. No `Math.random`, no clock reads. Per-element jitter comes from `inst(ctx, tag)`,
// which core.js hashes off the element's own tag string and which touches no `ctx.v` salt at all;
// the two `ctx.v` draws this file makes are salts 3700 and 3701, inside lane H's namespace.
//
// BUCKETS. Nine and no more, all of them `ctx.p.*`:
//   wall     the limestone field, column shafts, statues        wallAlt  podium / attic / plinths
//   trim     every moulding, cornice, capital, baluster rail    metal    frames, reveals, railings
//   roof     copper roofs, vault ribs, roof decks               accent   brass letters and flags
//   glass    every pane                                         ground   paving, plaza, steps
//   garden   the planting
// (`ctx.p.shadow` is the kit's own alias onto `metal` and buys no tenth material.)

import {
  CIVIC_METRICS,
  arcEndPlate,
  bench,
  boardPlate,
  box,
  chamferSlab,
  cyl,
  hole,
  inst,
  leafClump,
  part,
  paverRun,
  rotBox,
  slab,
  taper,
  triPlate,
  volume,
} from './core.js';
import { civicWindow, glazedEntry } from './openings.js';

const Y0 = CIVIC_METRICS.plateRise;

/**
 * Authored against the 1 × 2 parcel (15 × 31 m after the setback lattice). `assembleCivic`
 * rescales every `*W`/`*X` key by the measured lot width and every `*Z`/`*D` key by its depth, so
 * the composition holds on a parcel that is not the authored one. Heights are deliberately
 * un-suffixed: a giant order is 8.3 m on a narrow lot and on a wide one.
 *
 * `storeys: 8` is a sim input — landuse, permits and pricing read it — and it is not the model's
 * height. See the lane report §fill: the fit box is the whole 15 × 31 lot, the `three-quarter`
 * station's lens sits at 1.55 × the box height, and a 25.6 m crown therefore projects a subject
 * that binds on frame height at 45 % of frame width. The eight levels are read on the elevation
 * (podium, two-storey giant order, mezzanine, attic, and the three-stage crown) rather than
 * counted in metres, which is how an exchange of this class carries them.
 */
export const INTERNATIONAL_EXCHANGE_ENVELOPE = Object.freeze({
  footprint: Object.freeze([1, 2]),
  storeys: 8,

  bodyW: 13.10,
  frontWallZ: 2.20,
  bodyBackZ: -14.10,

  stepTopZ: 4.80,
  stepFrontZ: 7.80,
  plazaFrontZ: 15.20,

  colPitchX: 2.46,
  colR: 0.52,
  pilW: 0.82,

  crownW: 6.90,
  crownFrontZ: 2.20,
  crownBackZ: -4.60,

  hallW: 6.30,
  hallFrontZ: -5.05,
  hallBackZ: -13.30,

  podiumH: 1.55,
  pedH: 0.62,
  shaftH: 7.50,
  capH: 0.94,
  attH: 1.35,
  pedimentH: 2.55,
});

/* ────────────────────────────── local ornament primitives ─────────────────────────── */

/**
 * A voussoir arch ring. Each stone is its own box on the arc, so the ring reads as coursed
 * masonry with a keystone rather than as a painted curve, and the middle stone is deeper and
 * prouder than its neighbours the way a keystone is.
 *
 * `plane` is 'xy' (the arch spans X, extruded in Z — a front or rear elevation) or 'zy' (spans Z,
 * extruded in X — a flank). The circle is the unique one through the two springings and the
 * crown, the same construction `arcEndPlate` and `archHoles` use, so ring, opening and fanlight
 * are all on one curve.
 */
function archRing(ctx, {
  x, z, springY, w, rise, plane = 'xy', ext = 0.40, band = 0.44, stones = 9,
  material = null, imposts = true, name = 'arch',
}) {
  const p = ctx.p;
  const mat = material ?? p.trim;
  const out = [];
  const hw = w / 2;
  const r = (hw * hw + rise * rise) / (2 * rise);
  const cy = springY + rise - r;
  const half = Math.asin(Math.min(1, hw / r));
  const step = (half * 2) / stones;
  const mid = (stones - 1) / 2;
  for (let i = 0; i < stones; i += 1) {
    const a = -half + (i + 0.5) * step;
    const key = Math.abs(i - mid) < 0.6;
    const t = key ? band * 1.50 : band;
    const rMid = r + t / 2;
    const chord = 2 * rMid * Math.sin(step / 2) * 1.12;
    const px = plane === 'xy' ? x + Math.sin(a) * rMid : x;
    const pz = plane === 'xy' ? z : z + Math.sin(a) * rMid;
    const py = cy + Math.cos(a) * rMid;
    const e = key ? ext + 0.12 : ext;
    out.push(part(plane === 'xy'
      ? rotBox(chord, t, e, px, py, pz, { z: -a }, `${name}-vsr`)
      : rotBox(e, t, chord, px, py, pz, { x: a }, `${name}-vsr`), mat));
  }
  if (imposts) {
    for (const side of [-1, 1]) {
      const ix = plane === 'xy' ? x + side * (hw + 0.05) : x;
      const iz = plane === 'xy' ? z : z + side * (hw + 0.05);
      out.push(part(plane === 'xy'
        ? box(0.34, 0.22, ext + 0.05, ix, springY - 0.05, iz, `${name}-impost`)
        : box(ext + 0.05, 0.22, 0.34, ix, springY - 0.05, iz, `${name}-impost`), mat));
    }
  }
  return out;
}

/**
 * The stepped opening an `archRing` covers. `openWall` decomposes a run by horizontal edge, so an
 * arch is a stack of narrowing rectangles; each band is sampled at its own MID height, which
 * keeps the overshoot above the true arc under half a band and therefore well inside the ring's
 * radial thickness. Sampling the band TOP instead leaves a crescent of wall inside the intrados,
 * which is what the first cut of this did.
 */
function archHoles(u, yBase, w, rectH, rise, tag, steps = 5) {
  const out = [hole(u, yBase, w, rectH, tag)];
  const hw = w / 2;
  const r = (hw * hw + rise * rise) / (2 * rise);
  const cy = rectH + rise - r;
  const band = rise / steps;
  for (let i = 0; i < steps; i += 1) {
    const dy = (rectH + (i + 0.5) * band) - cy;
    const halfW = Math.sqrt(Math.max(0.0064, r * r - dy * dy));
    out.push(hole(u, yBase + rectH + i * band, halfW * 2, band + 0.008, tag));
  }
  return out;
}

/**
 * A fluted column of the giant order: pedestal, torus, entasised shaft, flutes as facets, a
 * necking, echinus, abacus and volute rolls.
 *
 * The flutes are proud arrises rather than cut hollows, which at this scale casts the same
 * shadow ladder for twelve triangles a flute and needs no boolean.
 */
function flutedColumn(ctx, {
  x, z, baseY, pedH, shaftH, capH, r, flutes = 10, name = 'col',
}) {
  const p = ctx.p;
  const out = [];
  const s0 = baseY + pedH;
  const rTop = r * 0.855;
  out.push(part(slab(r * 2.42, pedH * 0.74, r * 2.42, x, baseY, z, `${name}-ped`), p.wall));
  out.push(part(slab(r * 2.62, pedH * 0.26, r * 2.62, x, baseY + pedH * 0.74, z,
    `${name}-ped-cap`), p.trim));
  out.push(part(cyl(r * 1.16, 0.22, x, s0 + 0.11, z, 'y', `${name}-torus`, 12), p.trim));
  out.push(part(taper(r, rTop, shaftH - 0.22, x, s0 + 0.22, z, `${name}-shaft`, 16), p.wall));
  if (ctx.detail) {
    for (let i = 0; i < flutes; i += 1) {
      const a = (i / flutes) * Math.PI * 2;
      const rr = r * 0.95;
      out.push(part(rotBox(r * 0.19, shaftH - 0.60, r * 0.19,
        x + Math.sin(a) * rr, s0 + 0.22 + (shaftH - 0.22) / 2, z + Math.cos(a) * rr,
        { y: a }, `${name}-flute`), p.wall));
    }
  }
  const cy0 = s0 + shaftH;
  out.push(part(cyl(rTop * 1.03, capH * 0.26, x, cy0 + capH * 0.13, z, 'y', `${name}-neck`, 12),
    p.trim));
  out.push(part(taper(rTop * 1.05, r * 1.42, capH * 0.44, x, cy0 + capH * 0.26, z,
    `${name}-echinus`, 12), p.trim));
  out.push(part(slab(r * 3.10, capH * 0.30, r * 3.10, x, cy0 + capH * 0.70, z,
    `${name}-abacus`), p.trim));
  if (ctx.mid) {
    for (const side of [-1, 1]) {
      out.push(part(cyl(capH * 0.21, r * 2.96, x, cy0 + capH * 0.50, z + side * r * 1.28,
        'x', `${name}-volute`, 8), p.trim));
    }
  }
  return out;
}

/** An engaged pilaster of the same order — flanks, rear, and the antae behind the portico. */
function pilaster(ctx, {
  x, z, baseY, pedH, shaftH, capH, w, proj = 0.32, axis = 'z', name = 'pil',
}) {
  const p = ctx.p;
  const out = [];
  const s0 = baseY + pedH;
  const dims = (ww, dd) => (axis === 'z' ? [ww, dd] : [dd, ww]);
  const [pw, pd] = dims(w * 1.26, proj + 0.12);
  out.push(part(slab(pw, pedH, pd, x, baseY, z, `${name}-ped`), p.wallAlt));
  const [sw, sd] = dims(w, proj);
  out.push(part(slab(sw, shaftH, sd, x, s0, z, `${name}-shaft`), p.wall));
  if (ctx.detail) {
    for (const i of [-1, 1]) {
      const [fw, fd] = dims(w * 0.17, proj * 0.30);
      const ox = axis === 'z' ? i * w * 0.24 : 0;
      const oz = axis === 'z' ? 0 : i * w * 0.24;
      const bump = proj * 0.5;
      out.push(part(slab(fw, shaftH - 0.40, fd,
        x + ox + (axis === 'z' ? 0 : Math.sign(x || 1) * bump),
        s0 + 0.20, z + oz + (axis === 'z' ? Math.sign(z - baseY * 0 || 1) * 0 : 0),
        `${name}-flute`), p.wall));
    }
  }
  const [nw, nd] = dims(w * 1.08, proj + 0.06);
  out.push(part(slab(nw, capH * 0.34, nd, x, s0 + shaftH, z, `${name}-neck`), p.trim));
  const [aw, ad] = dims(w * 1.38, proj + 0.22);
  out.push(part(slab(aw, capH * 0.44, ad, x, s0 + shaftH + capH * 0.34, z, `${name}-abacus`),
    p.trim));
  return out;
}

/**
 * A full entablature: architrave in two fascias, a frieze, a bed mould, modillion blocks and a
 * projecting corona under a cyma. §6H asks for cornice modillions as geometry and this is where
 * they live — one block per 0.62 m on every face.
 */
function entablature(ctx, {
  x = 0, z, w, d, y, arch = 0.42, frieze = 0.66, corona = 0.62, proud = 0.36,
  modillions = true, name = 'ent',
}) {
  const p = ctx.p;
  const out = [];
  out.push(part(slab(w + 0.16, arch * 0.52, d + 0.16, x, y, z, `${name}-arch-a`), p.trim));
  out.push(part(slab(w + 0.28, arch * 0.48, d + 0.28, x, y + arch * 0.52, z, `${name}-arch-b`),
    p.trim));
  const fy = y + arch;
  out.push(part(slab(w + 0.22, frieze, d + 0.22, x, fy, z, `${name}-frieze`), p.wall));
  const my = fy + frieze;
  out.push(part(slab(w + 0.40, 0.14, d + 0.40, x, my, z, `${name}-bed`), p.trim));
  if (modillions && ctx.mid) {
    const pitch = 0.62;
    for (const [axis, run, cx, cz] of [
      ['x', w + 0.30, x, z + d / 2 + proud * 0.52],
      ['x', w + 0.30, x, z - d / 2 - proud * 0.52],
      ['z', d + 0.30, x + w / 2 + proud * 0.52, z],
      ['z', d + 0.30, x - w / 2 - proud * 0.52, z],
    ]) {
      const n = Math.max(3, Math.round(run / pitch));
      for (let i = 0; i < n; i += 1) {
        const u = -run / 2 + (i + 0.5) * (run / n);
        const mx = axis === 'x' ? cx + u : cx;
        const mz = axis === 'x' ? cz : cz + u;
        out.push(part(axis === 'x'
          ? slab(0.30, 0.30, proud * 0.92, mx, my + 0.14, mz, `${name}-mod`)
          : slab(proud * 0.92, 0.30, 0.30, mx, my + 0.14, mz, `${name}-mod`), p.trim));
      }
    }
  }
  const cy = my + 0.44;
  out.push(part(slab(w + proud * 2, corona * 0.62, d + proud * 2, x, cy, z, `${name}-corona`),
    p.trim));
  out.push(part(slab(w + proud * 2 + 0.14, corona * 0.38, d + proud * 2 + 0.14,
    x, cy + corona * 0.62, z, `${name}-cyma`), p.trim));
  return { parts: out, top: cy + corona };
}

/** A balustrade with turned balusters, a die at every run end and a moulded rail. */
function balustrade(ctx, {
  x = 0, z, w, d, y, h = 1.35, pitch = 0.64, faces = 'fblr', name = 'bal',
}) {
  const p = ctx.p;
  const out = [];
  const plinth = h * 0.20;
  const rail = h * 0.16;
  const bh = h - plinth - rail;
  const dieW = 0.66;
  for (const [key, axis, run, cx, cz] of [
    ['f', 'x', w, x, z + d / 2],
    ['b', 'x', w, x, z - d / 2],
    ['r', 'z', d, x + w / 2, z],
    ['l', 'z', d, x - w / 2, z],
  ]) {
    if (!faces.includes(key)) continue;
    const alongX = axis === 'x';
    out.push(part(alongX ? slab(run + 0.30, plinth, 0.44, cx, y, cz, `${name}-plinth`)
      : slab(0.44, plinth, run + 0.30, cx, y, cz, `${name}-plinth`), p.trim));
    out.push(part(alongX ? slab(run + 0.36, rail, 0.50, cx, y + plinth + bh, cz, `${name}-rail`)
      : slab(0.50, rail, run + 0.36, cx, y + plinth + bh, cz, `${name}-rail`), p.trim));
    const inner = run - dieW * 2.4;
    const n = Math.max(3, Math.round(inner / pitch));
    for (let i = 0; i < n; i += 1) {
      const u = -inner / 2 + (i + 0.5) * (inner / n);
      const bx = alongX ? cx + u : cx;
      const bz = alongX ? cz : cz + u;
      out.push(part(taper(0.165, 0.090, bh, bx, y + plinth, bz, `${name}-bal`, 6), p.wall));
    }
    for (const side of [-1, 1]) {
      const dx = alongX ? cx + side * (run / 2 - dieW / 2 + 0.08) : cx;
      const dz = alongX ? cz : cz + side * (run / 2 - dieW / 2 + 0.08);
      out.push(part(slab(alongX ? dieW : 0.52, bh, alongX ? 0.52 : dieW, dx, y + plinth, dz,
        `${name}-die`), p.wallAlt));
      out.push(part(slab(alongX ? dieW + 0.16 : 0.64, 0.13, alongX ? 0.64 : dieW + 0.16,
        dx, y + plinth + bh, dz, `${name}-die-cap`), p.trim));
    }
  }
  return out;
}

/** Rusticated coursing — proud bands with staggered vertical joints, not a painted stripe. */
function rustication(ctx, {
  x = 0, z, w, d, y0, y1, courses = 4, proud = 0.08, joint = null, name = 'rust',
}) {
  const p = ctx.p;
  const jm = joint ?? p.metal;
  const out = [];
  const hCourse = (y1 - y0) / courses;
  for (let i = 1; i < courses; i += 1) {
    out.push(part(slab(w + proud * 2, 0.11, d + proud * 2, x, y0 + i * hCourse - 0.055, z,
      `${name}-joint`), jm));
  }
  if (!ctx.detail) return out;
  for (let i = 0; i < courses; i += 1) {
    const cy = y0 + i * hCourse;
    const stagger = (i % 2) * 0.5 + 0.25;
    for (const [axis, run, cx, cz] of [
      ['x', w, x, z + d / 2 + proud],
      ['z', d, x + w / 2 + proud, z],
    ]) {
      const n = Math.max(2, Math.round(run / 1.60));
      for (let k = 0; k < n; k += 1) {
        const u = -run / 2 + (k + stagger) * (run / n);
        if (Math.abs(u) > run / 2 - 0.14) continue;
        out.push(part(axis === 'x'
          ? box(0.08, hCourse - 0.16, 0.11, cx + u, cy + hCourse / 2, cz, `${name}-vj`)
          : box(0.11, hCourse - 0.16, 0.08, cx, cy + hCourse / 2, cz + u, `${name}-vj`), jm));
      }
    }
  }
  return out;
}

/** Alternating corner quoins, proud on both faces of the corner. */
function quoins(ctx, {
  x, z, y0, y1, sx, sz, long = 0.82, short = 0.48, h = 0.62, proud = 0.11, name = 'quoin',
}) {
  const p = ctx.p;
  const out = [];
  const n = Math.max(2, Math.floor((y1 - y0) / h));
  for (let i = 0; i < n; i += 1) {
    const qy = y0 + i * h;
    const wide = i % 2 === 0;
    const w = wide ? long : short;
    const d = wide ? short : long;
    out.push(part(slab(w + proud, h - 0.07, d + proud,
      x + sx * (w / 2 - proud / 2), qy + 0.035, z + sz * (d / 2 - proud / 2),
      `${name}-blk`), p.trim));
  }
  return out;
}

/** A moulded blind panel with a swag — the front's two solid bays, articulated rather than left flat. */
function blindPanel(ctx, { x, y, z, w, h, name = 'panel' }) {
  const p = ctx.p;
  const out = [
    part(slab(w, h, 0.09, x, y, z + 0.045, `${name}-field`), p.trim),
    part(slab(w + 0.34, 0.20, 0.20, x, y - 0.20, z + 0.10, `${name}-sill`), p.trim),
    part(slab(w + 0.34, 0.22, 0.22, x, y + h, z + 0.10, `${name}-head`), p.trim),
  ];
  for (const side of [-1, 1]) {
    out.push(part(slab(0.20, h + 0.20, 0.18, x + side * (w / 2 + 0.10), y - 0.20, z + 0.09,
      `${name}-jamb`), p.trim));
  }
  if (ctx.mid) {
    // A swag: three drooping cylinders between two rosettes. It is the cheapest object in this
    // file per unit of "the wall is carved", at 24 triangles a member.
    for (let i = 0; i < 3; i += 1) {
      const u = (i - 1) * w * 0.26;
      out.push(part(cyl(0.13 - Math.abs(i - 1) * 0.02, w * 0.30, x + u, y + h - 0.62 - (i === 1 ? 0.10 : 0),
        z + 0.14, 'x', `${name}-swag`, 6), p.trim));
    }
    for (const side of [-1, 1]) {
      out.push(part(cyl(0.17, 0.14, x + side * w * 0.34, y + h - 0.46, z + 0.16, 'z',
        `${name}-rosette`, 8), p.trim));
    }
  }
  return out;
}

/** A glazed barrel vault over the trading hall — ribbed, purlined, and glass rather than sheet. */
function glazedVault(ctx, {
  x = 0, z, w, d, springY, rise, facets = 7, ribs = 6, name = 'vault',
}) {
  const p = ctx.p;
  const out = [];
  const hw = w / 2;
  const r = (hw * hw + rise * rise) / (2 * rise);
  const cy = springY + rise - r;
  const half = Math.asin(Math.min(1, hw / r));
  const step = (half * 2) / facets;
  for (let i = 0; i < facets; i += 1) {
    const a = -half + (i + 0.5) * step;
    const chord = 2 * r * Math.sin(step / 2) * 1.05;
    out.push(part(rotBox(chord, 0.10, d, x + Math.sin(a) * r, cy + Math.cos(a) * r, z,
      { z: -a }, `${name}-glaze`), p.glass));
  }
  for (let i = 0; i <= facets; i += 1) {
    const ae = -half + i * step;
    out.push(part(rotBox(0.12, 0.16, d + 0.08, x + Math.sin(ae) * (r + 0.07),
      cy + Math.cos(ae) * (r + 0.07), z, { z: -ae }, `${name}-bar`), p.metal));
  }
  if (ctx.mid) {
    for (let k = 0; k < ribs; k += 1) {
      const rz = z - d / 2 + (k + 0.5) * (d / ribs);
      for (let i = 0; i < facets; i += 1) {
        const a = -half + (i + 0.5) * step;
        const chord = 2 * r * Math.sin(step / 2) * 1.08;
        out.push(part(rotBox(chord, 0.17, 0.17, x + Math.sin(a) * (r + 0.09),
          cy + Math.cos(a) * (r + 0.09), rz, { z: -a }, `${name}-rib`), p.roof));
      }
    }
  }
  out.push(part(box(0.56, 0.22, d + 0.22, x, springY + rise + 0.11, z, `${name}-ridge`), p.roof));
  for (const side of [-1, 1]) {
    out.push(part(box(0.28, 0.32, d + 0.26, x + side * (hw + 0.14), springY - 0.02, z,
      `${name}-fascia`), p.trim));
    out.push(part(arcEndPlate(w + 0.30, rise + 0.12, 0.28, x, springY - 0.06,
      z + side * (d / 2 + 0.14), `${name}-end`, 8), p.wallAlt));
  }
  return out;
}

/**
 * A ribbed stone dome on an octagonal drum, with a glazed lantern.
 *
 * ── r2: THE HIPPED COPPER ROOF WAS THE SECOND-LARGEST CRUSH SOURCE ON THE PLATE. ──
 *
 * [MEASURED] on `laneH-r1`: `crown-roof` owned 2 421 of 28 143 crush pixels, 14.2 % of its own
 * area, at p05 0.9 — a 17 000-pixel near-black plane across the top of the frame. The lane brief
 * is explicit that "nothing on a Monopoly Plus frame is a near-black roof plane", and a large
 * flat plane in the `roof` bucket (envBase 0.44, the lowest in the scheme) pointing at a sky the
 * key does not reach is the shortest route to one.
 *
 * A dome is the better object on every count the round is graded on. It is PALE (`wall`, the same
 * limestone as the order, so it cannot crush any harder than the walls do), it is CURVED, so no
 * single facet holds a large uniform value, its ribs are ornament that reads pale-against-dark on
 * one side and dark-against-pale on the other as the surface turns, and it is the reference's own
 * move: `mp-station-3q` crowns the Short Line with exactly this above exactly this arch.
 *
 * Built as stacked frusta on a circular profile with meridian ribs over the steps, which is how a
 * masonry dome is actually coursed and which costs 5n + 8m boxes rather than a tessellated shell.
 */
function ribbedDome(ctx, {
  x = 0, z, y, r, drumH = 1.10, rise = 1.70, steps = 5, ribs = 8, lights = 8, name = 'dome',
}) {
  const p = ctx.p;
  const out = [];
  // Drum: an octagon with recessed lights between engaged piers, and a cornice.
  out.push(part(cyl(r, drumH, x, y + drumH / 2, z, 'y', `${name}-drum`, 8), p.wall));
  for (let i = 0; i < lights; i += 1) {
    const a = (i / lights) * Math.PI * 2 + Math.PI / lights;
    const px = x + Math.sin(a) * r * 0.99;
    const pz = z + Math.cos(a) * r * 0.99;
    out.push(part(rotBox(r * 0.42, drumH * 0.62, 0.16, px, y + drumH * 0.52, pz,
      { y: a }, `${name}-light`), p.glass));
    out.push(part(rotBox(r * 0.54, drumH * 0.74, 0.10, px - Math.sin(a) * 0.05,
      y + drumH * 0.52, pz - Math.cos(a) * 0.05, { y: a }, `${name}-light-arch`), p.trim));
  }
  out.push(part(cyl(r * 1.10, 0.20, x, y + drumH + 0.10, z, 'y', `${name}-cornice`, 8), p.trim));
  out.push(part(cyl(r * 1.02, 0.16, x, y + drumH + 0.28, z, 'y', `${name}-ring`, 8), p.roof));
  // Dome: frusta on the circle through the springing and the crown.
  const y0 = y + drumH + 0.34;
  const R = (r * r + rise * rise) / (2 * rise);
  const cy = y0 + rise - R;
  const half = Math.asin(Math.min(1, r / R));
  const radAt = (t) => Math.sin(half * (1 - t)) * R;
  const yAt = (t) => cy + Math.cos(half * (1 - t)) * R;
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    out.push(part(taper(radAt(t0), radAt(t1), yAt(t1) - yAt(t0), x, yAt(t0), z,
      `${name}-course`, 8), p.wall));
  }
  for (let m = 0; m < ribs; m += 1) {
    const a = (m / ribs) * Math.PI * 2;
    for (let i = 0; i < steps; i += 1) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const rm = (radAt(t0) + radAt(t1)) / 2;
      const ym = (yAt(t0) + yAt(t1)) / 2;
      const len = Math.hypot(radAt(t0) - radAt(t1), yAt(t1) - yAt(t0)) * 1.12;
      const tilt = Math.atan2(radAt(t0) - radAt(t1), yAt(t1) - yAt(t0));
      out.push(part(rotBox(0.17, len, 0.17, x + Math.sin(a) * rm, ym, z + Math.cos(a) * rm,
        { z: -Math.cos(a) * tilt, x: Math.sin(a) * tilt, y: a }, `${name}-rib`), p.trim));
    }
  }
  // Lantern.
  const ly = yAt(1) - 0.06;
  const lr = Math.max(0.42, r * 0.24);
  out.push(part(cyl(lr * 1.36, 0.18, x, ly + 0.09, z, 'y', `${name}-lan-base`, 8), p.trim));
  out.push(part(cyl(lr, 0.68, x, ly + 0.52, z, 'y', `${name}-lan-drum`, 8), p.glass));
  if (ctx.mid) {
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      out.push(part(rotBox(0.10, 0.68, 0.10, x + Math.sin(a) * lr, ly + 0.52,
        z + Math.cos(a) * lr, { y: a }, `${name}-lan-mull`), p.metal));
    }
  }
  out.push(part(cyl(lr * 1.30, 0.14, x, ly + 0.93, z, 'y', `${name}-lan-cornice`, 8), p.trim));
  out.push(part(taper(lr * 1.22, lr * 0.16, 0.46, x, ly + 1.00, z, `${name}-lan-cap`, 8), p.roof));
  out.push(part(taper(0.10, 0.025, 0.34, x, ly + 1.46, z, `${name}-finial`, 6), p.accent));
  return out;
}

/** An allegorical figure on a pedestal — Commerce and Industry, flanking the steps. */
function statue(ctx, { x, z, y, h = 2.30, facing = 1, name = 'statue' }) {
  const p = ctx.p;
  const out = [];
  const s = h / 2.30;
  const j = (salt) => (inst(ctx, name, salt) - 0.5);
  out.push(part(taper(0.44 * s, 0.30 * s, 1.16 * s, x, y, z, `${name}-robe`, 8), p.wall));
  out.push(part(rotBox(0.56 * s, 0.72 * s, 0.42 * s, x, y + 1.50 * s, z,
    { y: facing * 0.18 + j(1) * 0.10 }, `${name}-torso`), p.wall));
  out.push(part(rotBox(0.68 * s, 0.16 * s, 0.40 * s, x, y + 1.84 * s, z,
    { z: j(2) * 0.14 }, `${name}-shoulders`), p.wall));
  out.push(part(cyl(0.145 * s, 0.30 * s, x + j(3) * 0.05, y + 2.06 * s, z + facing * 0.04, 'y',
    `${name}-head`, 8), p.wall));
  out.push(part(rotBox(0.15 * s, 0.76 * s, 0.15 * s,
    x + facing * 0.32 * s, y + 1.64 * s, z + 0.14 * s,
    { z: facing * 0.55, x: -0.22 }, `${name}-arm`), p.wall));
  if (ctx.detail) {
    out.push(part(rotBox(0.13 * s, 0.62 * s, 0.13 * s,
      x - facing * 0.30 * s, y + 1.46 * s, z + 0.10 * s,
      { z: -facing * 0.18 }, `${name}-arm-b`), p.wall));
    // Commerce holds a caduceus; Industry holds a tablet. The attribute is what stops two pale
    // cones on two pedestals reading as one object mirrored, which is what r1's pair did (§2.5).
    if (facing > 0) {
      out.push(part(cyl(0.055 * s, 1.55 * s, x + facing * 0.44 * s, y + 1.30 * s, z + 0.16 * s,
        'y', `${name}-staff`, 6), p.trim));
      out.push(part(cyl(0.17 * s, 0.10 * s, x + facing * 0.44 * s, y + 2.06 * s, z + 0.16 * s,
        'z', `${name}-staff-disc`, 8), p.trim));
    } else {
      out.push(part(rotBox(0.62 * s, 0.80 * s, 0.14 * s, x + facing * 0.40 * s, y + 1.36 * s,
        z + 0.30 * s, { z: facing * 0.22 }, `${name}-tablet`), p.trim));
    }
    for (const side of [-1, 1]) {
      out.push(part(rotBox(0.10 * s, 1.04 * s, 0.10 * s,
        x + side * 0.16 * s, y + 0.56 * s, z + 0.24 * s, { z: side * 0.06 }, `${name}-fold`),
      p.wall));
    }
  }
  return out;
}

/** A stone urn — the pediment's acroteria and the balustrade's terminal accents. */
function urn(ctx, { x, z, y, h = 1.15, name = 'urn' }) {
  const p = ctx.p;
  const s = h / 1.15;
  return [
    part(slab(0.46 * s, 0.16 * s, 0.46 * s, x, y, z, `${name}-plinth`), p.trim),
    part(taper(0.19 * s, 0.13 * s, 0.26 * s, x, y + 0.16 * s, z, `${name}-foot`, 8), p.wall),
    part(taper(0.20 * s, 0.34 * s, 0.44 * s, x, y + 0.42 * s, z, `${name}-bowl`, 8), p.wall),
    part(cyl(0.36 * s, 0.10 * s, x, y + 0.91 * s, z, 'y', `${name}-rim`, 8), p.trim),
    part(taper(0.14 * s, 0.05 * s, 0.20 * s, x, y + 0.96 * s, z, `${name}-finial`, 6), p.wall),
  ];
}

/** A clipped bay tree in a tub — the exchange's planting, and the reference's cypress rhythm. */
function bayTree(ctx, { x, z, y, h = 3.10, name = 'bay' }) {
  const p = ctx.p;
  const out = [];
  const j = (salt) => inst(ctx, name, salt);
  out.push(part(slab(1.02, 0.11, 1.02, x, y - 0.02, z, `${name}-tub-base`), p.trim));
  out.push(part(taper(0.44, 0.52, 0.74, x, y + 0.09, z, `${name}-tub`, 8), p.wallAlt));
  out.push(part(cyl(0.56, 0.12, x, y + 0.86, z, 'y', `${name}-tub-rim`, 8), p.trim));
  out.push(part(cyl(0.085, h * 0.40, x, y + 0.90 + h * 0.20, z, 'y', `${name}-stem`, 6), p.metal));
  const cy = y + 0.90 + h * 0.40;
  const r = 0.62 + j(1) * 0.08;
  // A clipped bay is a BALL, and a ball is made of overlapping lobes rather than of one lobe.
  const lobes = [
    [0.66, 0, 0.74, 0], [0.52, 0.52, 0.46, 0], [0.52, -0.52, 0.46, 0],
    [0.52, 0, 0.46, 0.52], [0.52, 0, 0.46, -0.52], [0.46, 0, 1.16, 0], [0.44, 0.30, 0.22, 0.30],
  ];
  lobes.forEach(([rr, ox, oy, oz], i) => {
    out.push(part(leafClump(r * rr,
      x + r * ox + (j(i + 2) - 0.5) * 0.10, cy + r * oy, z + r * oz + (j(i + 12) - 0.5) * 0.10,
      `${name}-c${i}`, 0, `${name}|${i}`), p.garden));
  });
  return out.map(p => /-c[0-9]+$/.test(p.geometry.name) ? clusterCanopyPart(p) : p);
}

/**
 * A dwarf stone wall carrying a cast-iron spearhead railing, with piers.
 *
 * §2.5 is explicit that ornament matching the value of what it sits on scores as ABSENT, and
 * §2.8 that "what carries a Victorian frontage is dark cast iron against pale render, and the
 * contrast IS the ornament". Every moulding on this building is `trim` on `wall`, nine luma
 * apart in the inherited scheme, so this railing is the one place on the lot where the lane can
 * put a genuinely dark member against a genuinely pale one without asking for a palette change.
 */
function dwarfRail(ctx, {
  x0, x1, z, y, axis = 'x', wallH = 0.56, railH = 1.02, pitch = 0.27, piers = true,
  name = 'dwarf',
}) {
  const p = ctx.p;
  const out = [];
  const alongX = axis === 'x';
  const len = Math.abs(x1 - x0);
  if (len < 0.4) return out;
  const c = (x0 + x1) / 2;
  const cx = alongX ? c : x0;
  const cz = alongX ? z : (x0 + x1) / 2;
  const bx = alongX ? c : z;
  const bz = alongX ? z : c;
  const dims = (a, b) => (alongX ? [a, b] : [b, a]);
  const [ww, wd] = dims(len, 0.42);
  out.push(part(slab(ww, wallH, wd, bx, y, bz, `${name}-wall`), p.wall));
  const [cw, cd] = dims(len + 0.08, 0.56);
  out.push(part(slab(cw, 0.14, cd, bx, y + wallH, bz, `${name}-cope`), p.trim));
  // Rails and bars. Spear tips stand proud of the top rail, which is what stops a railing
  // reading as a comb of straight bars at one weight (§2.5).
  const [rw, rd] = dims(len, 0.09);
  out.push(part(slab(rw, 0.09, rd, bx, y + wallH + 0.14, bz, `${name}-rail-lo`), p.metal));
  out.push(part(slab(rw, 0.10, rd, bx, y + wallH + railH - 0.10, bz, `${name}-rail-hi`), p.metal));
  const n = Math.max(3, Math.round(len / pitch));
  for (let i = 0; i < n; i += 1) {
    const u = -len / 2 + (i + 0.5) * (len / n);
    const px = alongX ? c + u : bx;
    const pz = alongX ? bz : c + u;
    out.push(part(slab(0.055, railH - 0.12, 0.055, px, y + wallH + 0.14, pz, `${name}-bar`), p.metal));
    if (ctx.detail) {
      out.push(part(taper(0.075, 0.012, 0.20, px, y + wallH + railH - 0.06, pz,
        `${name}-spear`, 4), p.metal));
    }
  }
  if (!piers) return out;
  const np = Math.max(2, Math.round(len / 3.1));
  for (let i = 0; i <= np; i += 1) {
    const u = -len / 2 + (i / np) * len;
    const px = alongX ? c + u : bx;
    const pz = alongX ? bz : c + u;
    out.push(part(slab(0.54, wallH + railH - 0.18, 0.54, px, y, pz, `${name}-pier`), p.wall));
    out.push(part(slab(0.70, 0.15, 0.70, px, y + wallH + railH - 0.18, pz, `${name}-pier-cap`),
      p.trim));
  }
  return out;
}

/** A gate pier: a tall rusticated block with a moulded cap, the seat for a lamp standard. */
function gatePier(ctx, { x, z, y, h = 1.95, w = 1.10, name = 'gpier' }) {
  const p = ctx.p;
  return [
    part(slab(w + 0.30, 0.16, w + 0.30, x, y - 0.04, z, `${name}-toe`), p.trim),
    part(slab(w, h, w, x, y + 0.12, z, `${name}-shaft`), p.wall),
    part(slab(w + 0.24, 0.18, w + 0.24, x, y + 0.12 + h, z, `${name}-cap`), p.trim),
    part(slab(w - 0.16, 0.14, w - 0.16, x, y + 0.30 + h, z, `${name}-die`), p.wall),
  ];
}

/** A clipped cypress — the reference's vertical dark-green rhythm beside the steps. */
function cypress(ctx, { x, z, y, h = 3.70, r = 0.54, name = 'cyp' }) {
  const p = ctx.p;
  const j = (salt) => inst(ctx, name, salt);
  const out = [part(cyl(0.10, h * 0.22, x, y + h * 0.11, z, 'y', `${name}-stem`, 6), p.metal)];
  const n = 9;
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    // Two lobes per level on alternating bearings: a cypress is a dense column, and one clump a
    // level silhouettes as a stack of separate diamonds.
    const rr = r * (1 - t * 0.76) * (0.86 + j(i) * 0.26);
    const a = i * 2.399 + j(i + 30) * 0.8;
    out.push(part(leafClump(rr,
      x + Math.sin(a) * rr * 0.34, y + h * 0.16 + t * h * 0.80, z + Math.cos(a) * rr * 0.34,
      `${name}-c${i}`, 0, `${name}|${i}`), p.garden));
  }
  return out;
}

/** A three-globe cast-iron lamp standard, of the kind the reference lines its terrace with. */
function lampStandard(ctx, { x, z, y, h = 4.30, name = 'lamp' }) {
  const p = ctx.p;
  const out = [
    part(slab(0.78, 0.20, 0.78, x, y, z, `${name}-base`), p.trim),
    part(taper(0.27, 0.20, 0.60, x, y + 0.20, z, `${name}-plinth`, 8), p.wallAlt),
    part(taper(0.13, 0.075, h - 0.80, x, y + 0.80, z, `${name}-shaft`, 8), p.metal),
    part(cyl(0.18, 0.15, x, y + h - 0.06, z, 'y', `${name}-collar`, 8), p.trim),
  ];
  const arm = 0.66;
  for (const ox of [0, -arm, arm]) {
    const top = y + h + (ox === 0 ? 0.44 : 0);
    if (ox !== 0) {
      out.push(part(box(arm + 0.10, 0.10, 0.10, x + ox / 2, y + h + 0.02, z, `${name}-arm`),
        p.metal));
    }
    out.push(part(taper(0.20, 0.15, 0.48, x + ox, top + 0.02, z, `${name}-globe`, 8), p.glass));
    out.push(part(taper(0.17, 0.05, 0.22, x + ox, top + 0.50, z, `${name}-cap`, 8), p.roof));
  }
  return out;
}

/** Bollards on chain along the plaza kerb. */
function bollardChain(ctx, { x0, x1, z, z1 = null, y, n = 9, axis = 'x', name = 'bol' }) {
  const p = ctx.p;
  const out = [];
  const alongX = axis === 'x';
  const u0 = alongX ? x0 : z;
  const u1 = alongX ? x1 : (z1 ?? z);
  const posts = [];
  for (let i = 0; i < n; i += 1) {
    const u = u0 + (i / Math.max(1, n - 1)) * (u1 - u0);
    posts.push(u);
    const bx = alongX ? u : x0;
    const bz = alongX ? z : u;
    out.push(part(taper(0.155, 0.115, 0.84, bx, y, bz, `${name}-post`, 8), p.metal));
    out.push(part(taper(0.13, 0.05, 0.17, bx, y + 0.84, bz, `${name}-cap`, 8), p.trim));
  }
  if (!ctx.mid) return out;
  for (let i = 0; i < posts.length - 1; i += 1) {
    const a = posts[i];
    const b = posts[i + 1];
    const mid = (a + b) / 2;
    const span = (b - a) / 2;
    const sag = 0.18;
    const ang = Math.atan2(sag, Math.abs(span));
    const len = Math.hypot(span, sag);
    for (const [uc, sgn] of [[(a + mid) / 2, -1], [(mid + b) / 2, 1]]) {
      const cx = alongX ? uc : x0;
      const cz = alongX ? z : uc;
      out.push(part(rotBox(alongX ? len : 0.055, 0.055, alongX ? 0.055 : len,
        cx, y + 0.68 - sag / 2, cz,
        alongX ? { z: sgn * ang * Math.sign(b - a) } : { x: -sgn * ang * Math.sign(b - a) },
        `${name}-chain`), p.metal));
    }
  }
  return out;
}

/** The brass name band on the portico frieze — modelled letters, not a decal. */
function nameBand(ctx, { x, z, y, w, h = 0.42, name = 'band' }) {
  const p = ctx.p;
  const out = [
    part(slab(w + 0.30, h + 0.26, 0.09, x, y - 0.13, z, `${name}-ground`), p.metal),
  ];
  if (!ctx.mid) return out;
  // Letter blocks of varied width on a fixed baseline. It reads as an incised inscription at
  // board altitude and as raised brass at hero altitude, and it never spells a wrong word.
  const glyphs = [0.26, 0.20, 0.26, 0.15, 0.24, 0.21, 0.26, 0.24, 0.21, 0.15, 0.26, 0.20,
    0, 0.26, 0.15, 0.21, 0.26, 0.24, 0.21, 0.26, 0.24];
  const gap = 0.10;
  const total = glyphs.reduce((s, g) => s + g + gap, 0) - gap;
  const scale = Math.min(1, (w - 0.4) / total);
  let u = -(total * scale) / 2;
  for (const g of glyphs) {
    const gw = g * scale;
    if (gw > 0.03) {
      out.push(part(box(gw, h, 0.07, x + u + gw / 2, y + h / 2, z + 0.06, `${name}-glyph`),
        p.trim));
    }
    u += gw + gap * scale;
  }
  return out;
}

/** A clock in a moulded surround with a keystone, hands and hour marks. */
function clock(ctx, { x, y, z, r = 1.12, name = 'clock' }) {
  const p = ctx.p;
  const out = [
    part(cyl(r + 0.26, 0.28, x, y, z + 0.04, 'z', `${name}-surround`, 16), p.trim),
    part(cyl(r + 0.06, 0.18, x, y, z + 0.16, 'z', `${name}-bezel`, 16), p.wallAlt),
    part(cyl(r, 0.12, x, y, z + 0.22, 'z', `${name}-face`, 16), p.wall),
    part(box(0.56, 0.36, 0.22, x, y + r + 0.32, z + 0.10, `${name}-keystone`), p.trim),
  ];
  if (!ctx.mid) return out;
  out.push(part(rotBox(0.10, r * 0.62, 0.06, x - r * 0.15, y + r * 0.27, z + 0.28,
    { z: 0.50 }, `${name}-hand-h`), p.metal));
  out.push(part(rotBox(0.075, r * 0.88, 0.06, x + r * 0.24, y + r * 0.30, z + 0.28,
    { z: -0.52 }, `${name}-hand-m`), p.metal));
  out.push(part(cyl(0.10, 0.12, x, y, z + 0.30, 'z', `${name}-boss`, 8), p.metal));
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    out.push(part(rotBox(0.10, i % 2 === 0 ? 0.24 : 0.14, 0.05,
      x + Math.sin(a) * r * 0.82, y + Math.cos(a) * r * 0.82, z + 0.26,
      { z: -a }, `${name}-mark`), p.metal));
  }
  return out;
}

/** A short flag on a staff — the attic flag row. */
function flagStaff(ctx, { x, z, y, h = 2.20, lean = 0.30, name = 'flag' }) {
  const p = ctx.p;
  return [
    part(slab(0.32, 0.22, 0.32, x, y, z, `${name}-shoe`), p.trim),
    part(taper(0.075, 0.045, h, x, y + 0.22, z, `${name}-staff`, 6), p.trim),
    part(box(0.09, 0.09, 0.09, x, y + 0.22 + h, z, `${name}-truck`), p.metal),
    part(rotBox(0.84, 0.52, 0.05, x + lean * 1.7, y + 0.22 + h - 0.46, z,
      { z: -0.05, y: 0.12 }, `${name}-cloth`), p.accent),
  ];
}

/* ─────────────────────────────────── the building ─────────────────────────────────── */

export default function buildInternationalExchange(ctx) {
  const p = ctx.p;
  const E = ctx.env;
  const v = ctx.v;
  const lotW = E.lotW;
  const lotD = E.lotD;
  const halfW = lotW / 2;
  const halfD = lotD / 2;

  const BW = Math.min(E.bodyW ?? 13.10, lotW - 1.9);
  const hb = BW / 2;
  const zWall = E.frontWallZ ?? 2.20;
  const zBack = Math.max(E.bodyBackZ ?? -14.10, -halfD + 1.2);
  const zStepTop = E.stepTopZ ?? 4.80;
  const zStepFront = E.stepFrontZ ?? 7.80;
  const zPlaza = Math.min(E.plazaFrontZ ?? 15.20, halfD - 0.30);

  const podiumH = E.podiumH ?? 1.55;
  const P = Y0 + podiumH;
  const pedH = E.pedH ?? 0.62;
  const shaftH = E.shaftH ?? 7.50;
  const capH = E.capH ?? 0.94;
  const ENT0 = P + pedH + shaftH + capH;
  const attH = E.attH ?? 1.35;
  const pedimentH = E.pedimentH ?? 2.55;

  const colR = E.colR ?? 0.52;
  const colPitch = E.colPitchX ?? 2.46;
  const pilW = E.pilW ?? 0.82;
  const colXs = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map((k) => k * colPitch);
  const zCol = (zStepTop + zWall) / 2;

  const podProud = 0.30;
  const zPodFront = zWall + podProud;
  const zPodBack = zBack - podProud;
  const bodyD = zWall - zBack;
  const zBodyC = (zWall + zBack) / 2;

  /* ── the lot ──────────────────────────────────────────────────────────────────────── */

  ctx.add(boardPlate(ctx, { width: lotW, depth: lotD }));

  ctx.add(paverRun(ctx, {
    x0: -halfW + 0.35, x1: halfW - 0.35, z0: zStepFront - 0.20, z1: zPlaza - 1.35,
    unit: 1.66, joint: 0.10, flat: true, name: 'plaza',
  }));
  ctx.add(paverRun(ctx, {
    x0: -halfW + 0.35, x1: halfW - 0.35, z0: zPlaza - 1.35, z1: zPlaza,
    unit: 0.94, joint: 0.07, flat: true, material: p.wallAlt, name: 'plaza-border',
  }));
  for (const side of [-1, 1]) {
    ctx.add(paverRun(ctx, {
      x0: side * (hb + podProud), x1: side * (halfW - 0.35),
      z0: zBack - 0.8, z1: zStepFront - 0.20,
      unit: 1.12, joint: 0.07, flat: true, name: `apron${side}`,
    }));
  }
  ctx.add(paverRun(ctx, {
    x0: -halfW + 0.35, x1: halfW - 0.35, z0: -halfD + 0.35, z1: zBack - 0.8,
    unit: 1.12, joint: 0.07, flat: true, name: 'rear-yard',
  }));
  ctx.add(part(slab(lotW - 0.70, 0.22, 0.36, 0, Y0 - 0.04, zPlaza + 0.06, 'kerb'), p.trim));

  // THE STREET BOUNDARY IS A DESIGNED EDGE, NOT A KERB. `mp-station-3q` puts a balustraded
  // terrace wall with piers and lamp standards across the whole frontage, with one opening on
  // the axis; that edge is most of why the reference lot reads as a property rather than as a
  // slab with a building on it (§2.6).
  const gateX = 2.90;
  const fenceZ = zPlaza - 0.62;
  const outerX = halfW - 0.42;
  for (const side of [-1, 1]) {
    ctx.add(dwarfRail(ctx, {
      x0: side * gateX + side * 0.62, x1: side * outerX, z: fenceZ, y: Y0, axis: 'x',
      name: `exfence${side > 0 ? 'e' : 'w'}`,
    }));
    ctx.add(dwarfRail(ctx, {
      x0: fenceZ, x1: fenceZ - 2.65, z: side * outerX, y: Y0, axis: 'z', piers: false,
      name: `exreturn${side > 0 ? 'e' : 'w'}`,
    }));
    ctx.add(gatePier(ctx, {
      x: side * gateX, z: fenceZ, y: Y0, h: 1.95, w: 1.10,
      name: `exgate${side > 0 ? 'e' : 'w'}`,
    }));
    ctx.add(lampStandard(ctx, {
      x: side * gateX, z: fenceZ, y: Y0 + 2.42, h: 3.10,
      name: `exlamp${side > 0 ? 'e' : 'w'}`,
    }));
    // A processional pair of bollard runs from the gate to the foot of the steps.
    ctx.add(bollardChain(ctx, {
      x0: side * 3.45, x1: side * 3.45, z: fenceZ - 1.9, y: Y0, n: 4, axis: 'z',
      z1: zStepFront + 1.0, name: `exbol${side > 0 ? 'e' : 'w'}`,
    }));
    ctx.add(bayTree(ctx, {
      x: side * Math.min(halfW - 1.05, 6.35), z: zStepFront + 0.95 + v.range(3700, -0.10, 0.10),
      y: Y0, h: 3.05, name: `exbay${side > 0 ? 'e' : 'w'}`,
    }));
    for (const [k, cz] of [[0, 3.45], [1, 6.35]]) {
      ctx.add(cypress(ctx, {
        x: side * Math.min(halfW - 0.60, 6.92),
        z: zStepFront + cz + v.range(3701 + k, -0.12, 0.12),
        y: Y0, h: 3.70 - k * 0.22, name: `excyp${side > 0 ? 'e' : 'w'}${k}`,
      }));
    }
    ctx.add(bench(ctx, {
      x: side * 5.55, z: zPlaza - 4.30, w: 1.80, y: Y0, axis: 'z',
      name: `exbench${side > 0 ? 'e' : 'w'}`,
    }));
  }

  /* ── podium, stylobate and steps ──────────────────────────────────────────────────── */

  // The flank rhythm: seven pilasters of the giant order and six lights between them, set out
  // from the two ends of the body so the corner bays are equal.
  const pilZ0 = zWall - 0.35;
  const pilZ1 = zBack + 0.35;
  const pilPitch = (pilZ0 - pilZ1) / 6;
  const flankPilZ = [];
  const flankWinZ = [];
  for (let i = 0; i <= 6; i += 1) flankPilZ.push(pilZ0 - i * pilPitch);
  for (let i = 0; i < 6; i += 1) flankWinZ.push(pilZ0 - (i + 0.5) * pilPitch);

  const podWinZ = flankWinZ.filter((_, i) => i === 1 || i === 4);
  const podHoles = podWinZ.map((bz) => hole(bz, Y0 + 0.50, 0.96, 0.96, 'basement'));
  ctx.add(volume(ctx, {
    material: p.metal, x: 0, zFront: zPodFront, zBack: zPodBack, width: BW + podProud * 2,
    y0: Y0, y1: P, left: podHoles, right: podHoles, name: 'podium',
  }));
  ctx.add(rustication(ctx, {
    z: (zPodFront + zPodBack) / 2, w: BW + podProud * 2, d: zPodFront - zPodBack,
    y0: Y0, y1: P - 0.24, courses: 4, joint: p.roof, name: 'podrust',
  }));
  ctx.add([
    part(slab(BW + podProud * 2 + 0.34, 0.24, (zPodFront - zPodBack) + 0.34,
      0, P - 0.24, (zPodFront + zPodBack) / 2, 'pod-cap'), p.trim),
    part(slab(BW + podProud * 2 + 0.22, 0.16, (zPodFront - zPodBack) + 0.22,
      0, Y0 - 0.05, (zPodFront + zPodBack) / 2, 'pod-toe'), p.trim),
  ]);
  for (const bz of podWinZ) {
    for (const side of [-1, 1]) {
      ctx.add(civicWindow(ctx, {
        x: side * (BW / 2 + podProud), y: Y0 + 0.98, z: bz, w: 0.96, h: 0.96,
        facing: side > 0 ? 'right' : 'left', lights: 2, id: `pw${side}${Math.round(bz * 10)}`,
      }));
    }
  }

  ctx.add(part(slab(BW + podProud * 2, podiumH - 0.24, zStepTop - zWall + 0.04, 0, Y0,
    (zStepTop + zWall) / 2, 'stylobate'), p.metal));
  ctx.add(part(slab(BW + podProud * 2 + 0.34, 0.24, zStepTop - zWall + 0.38, 0, P - 0.24,
    (zStepTop + zWall) / 2, 'stylobate-cap'), p.trim));
  ctx.add(part(rotBox(BW + podProud * 2 + 0.34, 0.17, 0.17, 0, P - 0.05,
    (zStepTop + zWall) / 2 + (zStepTop - zWall + 0.38) / 2 - 0.05, { x: Math.PI / 4 },
    'stylobate-chamfer'), p.trim));

  const risers = 6;
  const stepW = BW + podProud * 2 - 0.9;
  const stepRun = (zStepFront - zStepTop) / risers;
  const stepRise = podiumH / risers;
  for (let i = 0; i < risers; i += 1) {
    // Each tread runs from its own nosing back to the stylobate, so the flight steps FORWARD as
    // it descends rather than backward. The first cut of this had it inverted.
    const zNose = zStepFront - i * stepRun;
    const depth = zNose - zStepTop;
    ctx.add(part(slab(stepW, stepRise + 0.03, depth, 0, Y0 + i * stepRise,
      zNose - depth / 2, `step${i}`), p.trim));
    // The chamfered nosing is the crush fix, not a moulding. A 45 degree face at the head of
    // each riser is the only part of a riser the key and the sky can both see.
    ctx.add(part(rotBox(stepW, 0.15, 0.15, 0, Y0 + (i + 1) * stepRise - 0.045, zNose - 0.045,
      { x: Math.PI / 4 }, `stepnose${i}`), p.trim));
  }
  for (const side of [-1, 1]) {
    const cx = side * (stepW / 2 + 0.38);
    ctx.add([
      part(slab(0.80, podiumH * 0.66, zStepFront - zStepTop, cx, Y0,
        (zStepFront + zStepTop) / 2, 'cheek'), p.metal),
      part(slab(0.96, 0.17, zStepFront - zStepTop + 0.16, cx, Y0 + podiumH * 0.66,
        (zStepFront + zStepTop) / 2, 'cheek-cap'), p.trim),
      part(slab(1.36, 0.16, 1.36, cx, Y0 - 0.04, zStepFront - 0.74, 'ped-toe'), p.trim),
      part(slab(1.20, 1.28, 1.20, cx, Y0, zStepFront - 0.74, 'ped-block'), p.wallAlt),
      part(slab(1.40, 0.20, 1.40, cx, Y0 + 1.28, zStepFront - 0.74, 'ped-cap'), p.trim),
    ]);
    ctx.add(statue(ctx, {
      x: cx, z: zStepFront - 0.74, y: Y0 + 1.48, h: 2.40, facing: -side,
      name: `exstatue${side > 0 ? 'e' : 'w'}`,
    }));
  }

  /* ── the body ─────────────────────────────────────────────────────────────────────── */

  const mainSill = P + 1.45;
  const mainRect = 4.25;
  const mainRise = 0.92;
  const mezzY = P + 7.15;
  const mezzH = 1.20;
  const entryW = 2.90;
  const entryH = 4.90;
  const entryRise = 1.25;
  const outerBayX = 2 * colPitch;
  const innerBayX = colPitch;

  const frontHoles = [...archHoles(0, P, entryW, entryH, entryRise, 'entry', 5)];
  for (const bx of [-outerBayX, outerBayX]) {
    frontHoles.push(...archHoles(bx, mainSill, 1.68, mainRect, mainRise, 'win', 5));
  }
  for (const bx of [-outerBayX, -innerBayX, innerBayX, outerBayX]) {
    frontHoles.push(hole(bx, mezzY, 1.18, mezzH, 'mezz'));
  }

  const flankHoles = [];
  for (const wz of flankWinZ) {
    flankHoles.push(...archHoles(wz, mainSill, 1.34, mainRect, 0.76, 'win', 5));
    flankHoles.push(hole(wz, mezzY, 1.10, mezzH, 'mezz'));
  }

  const backBayX = [-1.5, -0.5, 0.5, 1.5].map((k) => k * colPitch);
  const backHoles = [];
  for (const bx of backBayX) {
    backHoles.push(hole(bx, mainSill, 1.46, mainRect, 'win'));
    backHoles.push(hole(bx, mezzY, 1.10, mezzH, 'mezz'));
  }

  ctx.add(volume(ctx, {
    material: p.wall, x: 0, zFront: zWall, zBack, width: BW, y0: P, y1: ENT0,
    front: frontHoles, left: flankHoles, right: flankHoles, back: backHoles, name: 'body',
  }));

  const stringY = P + 6.35;
  ctx.add([
    part(slab(BW + 0.24, 0.26, bodyD + 0.24, 0, stringY, zBodyC, 'string-a'), p.trim),
    part(slab(BW + 0.36, 0.13, bodyD + 0.36, 0, stringY + 0.26, zBodyC, 'string-b'), p.trim),
  ]);

  for (const [sx, sz, cz] of [[1, 1, zWall], [-1, 1, zWall], [1, -1, zBack], [-1, -1, zBack]]) {
    ctx.add(quoins(ctx, {
      x: sx * hb, z: cz, y0: P, y1: ENT0 - 0.30, sx: -sx, sz: -sz, name: `q${sx}${sz}`,
    }));
  }

  /* ── the giant order ──────────────────────────────────────────────────────────────── */

  for (const cx of colXs) {
    ctx.add(flutedColumn(ctx, {
      x: cx, z: zCol, baseY: P, pedH, shaftH, capH, r: colR,
      name: `gcol${Math.round(cx * 10)}`,
    }));
  }
  for (const cx of [colXs[0], colXs[colXs.length - 1]]) {
    ctx.add(pilaster(ctx, {
      x: cx, z: zWall + 0.15, baseY: P, pedH, shaftH, capH, w: pilW, proj: 0.32,
      axis: 'z', name: `anta${Math.round(cx * 10)}`,
    }));
  }
  for (const pz of flankPilZ) {
    for (const side of [-1, 1]) {
      ctx.add(pilaster(ctx, {
        x: side * (hb + 0.15), z: pz, baseY: P, pedH, shaftH, capH, w: pilW, proj: 0.32,
        axis: 'x', name: `fpil${side}${Math.round(pz * 10)}`,
      }));
    }
  }
  for (const bx of [-outerBayX, 0, outerBayX]) {
    ctx.add(pilaster(ctx, {
      x: bx, z: zBack - 0.15, baseY: P, pedH, shaftH, capH, w: pilW, proj: 0.32,
      axis: 'z', name: `rpil${Math.round(bx * 10)}`,
    }));
  }

  /* ── openings, arch rings, keystones and the blind bays ──────────────────────────── */

  ctx.add(glazedEntry(ctx, {
    x: 0, y: P, z: zWall, w: entryW, h: entryH, doorW: 2.10, doorH: 3.30,
    id: 'exchange-entry', label: 'Exchange hall', sidelights: 2,
  }));
  ctx.add(archRing(ctx, {
    x: 0, z: zWall + 0.03, springY: P + entryH, w: entryW, rise: entryRise, plane: 'xy',
    ext: 0.48, band: 0.54, stones: 11, name: 'entry-arch',
  }));
  ctx.add(part(arcEndPlate(entryW - 0.16, entryRise - 0.08, 0.10, 0, P + entryH + 0.02,
    zWall - 0.18, 'entry-fan', 7), p.glass));
  if (ctx.mid) {
    for (let i = 1; i < 5; i += 1) {
      const a = -0.95 + (i / 5) * 1.90;
      ctx.add(part(rotBox(0.09, entryRise + 0.02, 0.09, Math.sin(a) * (entryW * 0.21),
        P + entryH + entryRise * 0.42, zWall - 0.11, { z: -a }, 'entry-fanbar'), p.metal));
    }
  }

  for (const bx of [-outerBayX, outerBayX]) {
    ctx.add(civicWindow(ctx, {
      x: bx, y: mainSill + mainRect / 2, z: zWall, w: 1.68, h: mainRect,
      facing: 'front', lights: 2, transom: true, id: `fw${Math.round(bx * 10)}`,
    }));
    ctx.add(archRing(ctx, {
      x: bx, z: zWall + 0.03, springY: mainSill + mainRect, w: 1.68, rise: mainRise,
      plane: 'xy', ext: 0.40, band: 0.42, stones: 7, name: `fwa${Math.round(bx * 10)}`,
    }));
    ctx.add(part(arcEndPlate(1.54, mainRise - 0.08, 0.09, bx, mainSill + mainRect + 0.02,
      zWall - 0.17, `fwf${Math.round(bx * 10)}`, 6), p.glass));
  }
  // The two inner bays are solid — a 0.4 m pier between a 2.9 m arch and a 1.7 m window is a
  // sliver, and a blind panel with a swag is more ornament than a window would have been.
  for (const bx of [-innerBayX, innerBayX]) {
    ctx.add(blindPanel(ctx, {
      x: bx, y: mainSill + 0.30, z: zWall, w: 1.34, h: mainRect - 0.10,
      name: `bp${Math.round(bx * 10)}`,
    }));
  }
  for (const bx of [-outerBayX, -innerBayX, innerBayX, outerBayX]) {
    ctx.add(civicWindow(ctx, {
      x: bx, y: mezzY + mezzH / 2, z: zWall, w: 1.18, h: mezzH,
      facing: 'front', lights: 2, id: `fm${Math.round(bx * 10)}`,
    }));
  }

  for (const wz of flankWinZ) {
    for (const side of [-1, 1]) {
      const fx = side * hb;
      ctx.add(civicWindow(ctx, {
        x: fx, y: mainSill + mainRect / 2, z: wz, w: 1.34, h: mainRect,
        facing: side > 0 ? 'right' : 'left', lights: 2, transom: true,
        id: `sw${side}${Math.round(wz * 10)}`,
      }));
      ctx.add(archRing(ctx, {
        x: fx + side * 0.03, z: wz, springY: mainSill + mainRect, w: 1.34, rise: 0.76,
        plane: 'zy', ext: 0.40, band: 0.42, stones: 7, imposts: false,
        name: `swa${side}${Math.round(wz * 10)}`,
      }));
      ctx.add(civicWindow(ctx, {
        x: fx, y: mezzY + mezzH / 2, z: wz, w: 1.10, h: mezzH,
        facing: side > 0 ? 'right' : 'left', lights: 2, id: `sm${side}${Math.round(wz * 10)}`,
      }));
    }
  }

  for (const bx of backBayX) {
    ctx.add(civicWindow(ctx, {
      x: bx, y: mainSill + mainRect / 2, z: zBack, w: 1.46, h: mainRect,
      facing: 'back', lights: 2, transom: true, id: `bw${Math.round(bx * 10)}`,
    }));
    ctx.add(civicWindow(ctx, {
      x: bx, y: mezzY + mezzH / 2, z: zBack, w: 1.10, h: mezzH,
      facing: 'back', lights: 2, id: `bm${Math.round(bx * 10)}`,
    }));
  }

  /* ── entablature, attic, pediment ─────────────────────────────────────────────────── */

  const ent = entablature(ctx, { x: 0, z: zBodyC, w: BW, d: bodyD, y: ENT0, name: 'bodyent' });
  ctx.add(ent.parts);
  const ENT1 = ent.top;

  const porticoD = zStepTop - zWall + 0.30;
  const zPortC = (zStepTop + zWall) / 2 + 0.15;
  const portEnt = entablature(ctx, {
    x: 0, z: zPortC, w: BW + 0.10, d: porticoD, y: ENT0, name: 'portent',
  });
  ctx.add(portEnt.parts);
  const zFriezeFace = zPortC + (porticoD + 0.22) / 2;
  ctx.add(nameBand(ctx, {
    x: 0, z: zFriezeFace, y: ENT0 + 0.52, w: BW - 4.6, h: 0.44, name: 'exband',
  }));
  // The crest: a brass wreath and shield on the frieze axis, which is `mp-station-front`'s own
  // gold emblem in an exchange's terms and the lane's one large saturated object.
  const crestY = ENT0 + 0.74;
  ctx.add([
    part(cyl(0.62, 0.16, 0, crestY, zFriezeFace + 0.08, 'z', 'crest-wreath', 12), p.accent),
    part(cyl(0.44, 0.14, 0, crestY, zFriezeFace + 0.12, 'z', 'crest-void', 12), p.metal),
    part(rotBox(0.62, 0.62, 0.14, 0, crestY, zFriezeFace + 0.16, { z: 0.36 }, 'crest-shield'),
      p.accent),
    part(box(1.62, 0.13, 0.13, 0, crestY - 0.60, zFriezeFace + 0.10, 'crest-ribbon'), p.accent),
    part(cyl(0.13, 0.14, -0.78, crestY - 0.60, zFriezeFace + 0.10, 'z', 'crest-boss-l', 8),
      p.accent),
    part(cyl(0.13, 0.14, 0.78, crestY - 0.60, zFriezeFace + 0.10, 'z', 'crest-boss-r', 8),
      p.accent),
  ]);

  const pedW = BW + 0.62;
  const pedT = porticoD + 0.60;
  const zPedFace = zPortC + pedT / 2;
  ctx.add(part(triPlate(pedW, pedimentH, pedT, 0, ENT1, zPortC, 'pediment'), p.wallAlt));
  const rake = Math.atan2(pedimentH, pedW / 2);
  const rakeLen = Math.hypot(pedW / 2, pedimentH) + 0.34;
  for (const side of [-1, 1]) {
    ctx.add([
      part(rotBox(rakeLen, 0.32, pedT + 0.34, side * (pedW / 4), ENT1 + pedimentH / 2 + 0.12,
        zPortC, { z: -side * rake }, 'ped-rake'), p.trim),
      part(rotBox(rakeLen, 0.15, pedT + 0.58, side * (pedW / 4), ENT1 + pedimentH / 2 + 0.32,
        zPortC, { z: -side * rake }, 'ped-cyma'), p.trim),
    ]);
  }
  ctx.add(part(slab(pedW + 0.24, 0.17, pedT + 0.50, 0, ENT1 - 0.05, zPortC, 'ped-shelf'), p.trim));

  if (ctx.mid) {
    const ty = ENT1 + 0.30;
    const zR = zPedFace + 0.02;
    ctx.add([
      part(cyl(0.76, 0.30, 0, ty + 0.98, zR + 0.14, 'z', 'cart-shield', 12), p.trim),
      part(taper(0.54, 0.16, 0.66, 0, ty + 0.22, zR + 0.16, 'cart-point', 8), p.trim),
      part(box(1.90, 0.24, 0.22, 0, ty + 1.82, zR + 0.12, 'cart-crest'), p.trim),
      part(cyl(0.21, 0.26, -0.88, ty + 1.58, zR + 0.12, 'z', 'cart-scroll-l', 8), p.trim),
      part(cyl(0.21, 0.26, 0.88, ty + 1.58, zR + 0.12, 'z', 'cart-scroll-r', 8), p.trim),
      part(box(0.62, 0.36, 0.15, 0, ty + 0.98, zR + 0.30, 'cart-boss'), p.accent),
    ]);
    for (const side of [-1, 1]) {
      const fx = side * 2.95;
      ctx.add([
        part(rotBox(2.40, 0.44, 0.42, fx, ty + 0.34, zR + 0.10,
          { z: -side * 0.10 }, 'tymp-body'), p.wall),
        part(rotBox(0.88, 0.64, 0.40, fx + side * 0.64, ty + 0.76, zR + 0.10,
          { z: -side * 0.34 }, 'tymp-torso'), p.wall),
        part(cyl(0.21, 0.28, fx + side * 1.10, ty + 1.14, zR + 0.10, 'z', 'tymp-head', 8), p.wall),
        part(rotBox(0.68, 0.52, 0.38, fx - side * 0.80, ty + 0.64, zR + 0.08,
          { z: side * 0.42 }, 'tymp-knee'), p.wall),
      ]);
    }
  }
  ctx.add(urn(ctx, { x: 0, z: zPortC, y: ENT1 + pedimentH + 0.12, h: 1.40, name: 'acroC' }));
  for (const side of [-1, 1]) {
    const ax = side * (pedW / 2 - 0.24);
    ctx.add(part(slab(0.96, 0.46, 0.96, ax, ENT1 + 0.12, zPortC, 'acro-ped'), p.trim));
    ctx.add(urn(ctx, {
      x: ax, z: zPortC, y: ENT1 + 0.58, h: 1.24, name: `acro${side > 0 ? 'E' : 'W'}`,
    }));
  }

  ctx.add(part(slab(BW - 0.4, 0.18, bodyD - 0.4, 0, ENT1 - 0.06, zBodyC, 'att-deck'), p.roof));
  ctx.add(balustrade(ctx, {
    x: 0, z: zBodyC, w: BW + 0.34, d: bodyD + 0.34, y: ENT1, h: attH, faces: 'blr',
    name: 'attbal',
  }));

  const flagZs = [zWall - 3.2, zWall - 10.4];
  for (const side of [-1, 1]) {
    for (const fz of flagZs) {
      if (fz < zBack + 1.0) continue;
      ctx.add(flagStaff(ctx, {
        x: side * (BW / 2 + 0.10), z: fz, y: ENT1 + attH * 0.20, h: 2.20, lean: side * 0.17,
        name: `exflag${side}${Math.round(-fz)}`,
      }));
    }
  }

  /* ── the crown pavilion ───────────────────────────────────────────────────────────── */

  const CW = Math.min(E.crownW ?? 6.90, BW - 3.6);
  const zCrownF = E.crownFrontZ ?? zWall;
  const zCrownB = E.crownBackZ ?? -4.60;
  const zCrownC = (zCrownF + zCrownB) / 2;
  const crownD = zCrownF - zCrownB;
  const CR0 = ENT1 - 0.10;
  const CR1 = CR0 + 2.10;

  ctx.add(volume(ctx, {
    material: p.wall, x: 0, zFront: zCrownF, zBack: zCrownB, width: CW, y0: CR0, y1: CR1,
    left: [hole(zCrownC, CR0 + 0.95, 1.30, 1.70, 'win')],
    right: [hole(zCrownC, CR0 + 0.95, 1.30, 1.70, 'win')],
    back: [hole(0, CR0 + 0.95, 1.60, 1.70, 'win')],
    name: 'crown',
  }));
  ctx.add(rustication(ctx, {
    x: 0, z: zCrownC, w: CW, d: crownD, y0: CR0, y1: CR0 + 0.80, courses: 2, name: 'crownrust',
  }));
  for (const [sx, sz, cz] of [
    [1, 1, zCrownF], [-1, 1, zCrownF], [1, -1, zCrownB], [-1, -1, zCrownB],
  ]) {
    ctx.add(quoins(ctx, {
      x: sx * (CW / 2), z: cz, y0: CR0, y1: CR1 - 0.20, sx: -sx, sz: -sz, h: 0.58,
      long: 0.72, short: 0.44, name: `cq${sx}${sz}`,
    }));
  }
  ctx.add(clock(ctx, { x: 0, y: CR0 + 1.80, z: zCrownF + 0.08, r: 1.12, name: 'exclock' }));
  for (const side of [-1, 1]) {
    ctx.add(civicWindow(ctx, {
      x: side * (CW / 2), y: CR0 + 1.80, z: zCrownC, w: 1.30, h: 1.70,
      facing: side > 0 ? 'right' : 'left', lights: 2, id: `crw${side}`,
    }));
  }
  ctx.add(civicWindow(ctx, {
    x: 0, y: CR0 + 1.80, z: zCrownB, w: 1.60, h: 1.70, facing: 'back', lights: 3, id: 'crwb',
  }));
  const crownEnt = entablature(ctx, {
    x: 0, z: zCrownC, w: CW, d: crownD, y: CR1, arch: 0.32, frieze: 0.50, corona: 0.54,
    proud: 0.42, name: 'crownent',
  });
  ctx.add(crownEnt.parts);
  const CR2 = crownEnt.top;

  // The pavilion is capped by a PALE STONE TERRACE behind its own balustrade, not by a roof
  // plane. See `ribbedDome` for the measurement that decided it.
  ctx.add(part(slab(CW + 0.20, 0.22, crownD + 0.20, 0, CR2 - 0.08, zCrownC, 'crown-deck'), p.trim));
  ctx.add(balustrade(ctx, {
    x: 0, z: zCrownC, w: CW + 0.34, d: crownD + 0.34, y: CR2 + 0.14, h: 0.92, pitch: 0.72,
    name: 'crownbal',
  }));
  const DOME_R = Math.min(CW, crownD) * 0.42;
  ctx.add(ribbedDome(ctx, {
    x: 0, z: zCrownC, y: CR2 + 0.14, r: DOME_R,
    drumH: 1.10, rise: DOME_R * 0.80, steps: 7, ribs: 8, name: 'exdome',
  }));

  /* ── the trading hall and its glazed vault ────────────────────────────────────────── */

  const HW = Math.min(E.hallW ?? 6.30, BW - 4.4);
  const zHallF = Math.min(E.hallFrontZ ?? -5.05, zCrownB - 0.4);
  const zHallB = Math.max(E.hallBackZ ?? -13.30, zBack + 0.8);
  const zHallC = (zHallF + zHallB) / 2;
  const hallD = zHallF - zHallB;
  const CL0 = ENT0 + 0.24;
  const CL1 = CL0 + 2.45;

  ctx.add(part(slab(BW - 1.0, 0.20, bodyD - 1.0, 0, ENT0 - 0.14, zBodyC, 'roof-deck'), p.roof));
  ctx.add(part(slab(HW + 0.66, 0.32, hallD + 0.66, 0, CL0 - 0.26, zHallC, 'cler-plinth'),
    p.wallAlt));
  for (const side of [-1, 1]) {
    ctx.add([
      part(box(0.36, CL1 - CL0, hallD, side * (HW / 2 + 0.18), (CL0 + CL1) / 2, zHallC,
        'cler-pier'), p.wallAlt),
      part(box(0.15, CL1 - CL0 - 0.34, hallD - 0.34, side * (HW / 2 + 0.04),
        (CL0 + CL1) / 2, zHallC, 'cler-glaze'), p.glass),
      part(box(HW + 0.36, CL1 - CL0, 0.36, 0, (CL0 + CL1) / 2,
        zHallC + side * (hallD / 2 + 0.18), 'cler-end'), p.wallAlt),
    ]);
    if (ctx.mid) {
      const n = Math.max(4, Math.round(hallD / 1.55));
      for (let i = 0; i < n; i += 1) {
        const mz = zHallC - hallD / 2 + (i + 0.5) * (hallD / n);
        ctx.add(part(box(0.22, CL1 - CL0 - 0.24, 0.17, side * (HW / 2 + 0.13),
          (CL0 + CL1) / 2, mz, 'cler-mull'), p.metal));
      }
    }
  }
  ctx.add(part(slab(HW + 0.74, 0.24, hallD + 0.74, 0, CL1 - 0.24, zHallC, 'cler-cornice'), p.trim));

  ctx.add(glazedVault(ctx, {
    x: 0, z: zHallC, w: HW + 0.34, d: hallD, springY: CL1, rise: 2.55, facets: 7, ribs: 6,
    name: 'hallvault',
  }));

  if (ctx.mid) {
    for (const side of [-1, 1]) {
      ctx.add([
        part(slab(2.20, 1.30, 2.20, side * 4.10, ENT0 - 0.02, zBack + 2.50, 'plant'), p.wallAlt),
        part(slab(2.40, 0.16, 2.40, side * 4.10, ENT0 + 1.28, zBack + 2.50, 'plant-cap'), p.trim),
      ]);
    }
  }
}

export { buildInternationalExchange };
