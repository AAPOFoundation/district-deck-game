import { clusterCanopyPart } from '../foliage.js';
// District Deck V3.70 — LANDMARKS lane, shared primitives.
//
// Governing spec: `docs/next-phase/V370-AAA-PROGRAMME-SPEC.md`. This lane builds two Melbourne
// landmarks — the University of Melbourne's Old Arts building and the Melbourne Town Hall — and
// it is deliberately SELF-CONTAINED: the only imports are `three`, `../materials.js` and
// `../../core/grid.js`. Nothing here reaches into `civic/`, `residential/`, `commercial/`,
// `industrial/` or `block-cores/`, all of which are live under other seats on this checkout, and
// nothing here is imported by them. `building-kit.js` can adopt `landmarks/index.js` later with
// one line and no merge.
//
// The technique is the programme's, not this lane's invention, and the debts are named where they
// are paid: punched walls with real reveal depth, a room behind every aperture, a board plate that
// is widest at the top, per-unit paver variation, and value authored against the RENDERED figure
// rather than the hex (§5.0 — the family map is a per-bucket gain with a 20x spread).
//
// GEOMETRY CONVENTION, identical to the civic contract so a later merge is mechanical:
//   X across the frontage, +Z toward the street, Y up. y = 0 is the board plane; everything on
//   the lot stands on `LM_METRICS.plateRise`. Only the plate rim goes below y = 0.
//
// WINDING: every solid in this file is closed, so `mvp/tests/lm-winding.mjs` can prove its
// orientation by the divergence theorem (signed volume > 0 <=> outward). An adjacent lane shipped
// a prism with six of eight triangles wound inward and lost a third of it; a closed-solid-only
// rule makes that measurable rather than eyeballed.

import * as THREE from 'three';
import { MaterialLibrary } from '../materials.js';

/** Nine buckets per building, hard cap (§3.2). */
export const LM_BUCKET_CAP = 9;

/* ────────────────────────────── deterministic variation ───────────────────────────── */

/** FNV-1a -> uint32. Same string, same pixels, forever. */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Hash + salt -> [0,1) with a murmur3-style finalizer. The finalizer is not decoration: FNV-1a's
 * avalanche on strings differing only in their last character does not reach the top bits, and a
 * `pick` reads exactly those.
 */
export function unitFrom(hash, salt) {
  let h = (hash ^ Math.imul(salt, 0x9e3779b9)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

/**
 * PER-INSTANCE variation hashed off `archetypeId | districtId | facade | tag` and NOTHING ELSE
 * (§3.3). No simulation state is read here or anywhere downstream of it — the arguments are the
 * whole input.
 */
export function inst(ctx, tag, salt = 0) {
  const key = `${ctx?.archetypeId ?? ''}|${ctx?.districtId ?? ''}|f${ctx?.env?.facade ?? 0}|${tag}`;
  return unitFrom(hash32(key), salt);
}

/** `inst` mapped onto a range. */
export function instRange(ctx, tag, salt, lo, hi) {
  return lo + inst(ctx, tag, salt) * (hi - lo);
}

/** A small deterministic variation source bound to one building instance. */
export function variation(seedString) {
  const h = hash32(seedString);
  return {
    hash: h,
    unit: (salt) => unitFrom(h, salt),
    range: (salt, lo, hi) => lo + unitFrom(h, salt) * (hi - lo),
    pick: (salt, list) => list[Math.floor(unitFrom(h, salt) * list.length) % list.length],
    chance: (salt, p) => unitFrom(h, salt) < p,
    int: (salt, lo, hi) => lo + Math.floor(unitFrom(h, salt) * (hi - lo + 1)),
  };
}

/** Multiply a hex toward black (t<0) or white (t>0). */
export function shade(hex, t) {
  const c = new THREE.Color(hex);
  if (t < 0) c.multiplyScalar(1 + t);
  else c.lerp(new THREE.Color('#ffffff'), t);
  return `#${c.getHexString()}`;
}

/* ──────────────────────────────────── metrics ─────────────────────────────────────── */

export const LM_METRICS = Object.freeze({
  /** Masonry wall thickness. A landmark's wall is thicker than a hospital's, and it shows. */
  wallDepth: 0.44,
  /** How far a pane sits behind the outer wall face (§2.2 — a real distance). */
  reveal: 0.30,
  /** Frame member section, "chunky". */
  frame: 0.14,
  sill: 0.22,
  /** Board plate. Widest at the TOP, stepping in going down: the outermost silhouette point is a
   *  face the key reaches, with the dark bevel behind it (§2.1). */
  plateRise: 0.34,
  plateDeck: 0.34,
  plateApron: 0.28,
  plateLedge: 0.16,
  plateLedgeCap: 0.05,
  plateLedgeY: 0.10,
  plateApronDrop: 0.46,
  plateChamfer: 0.20,
  plateDrip: 0.04,
});

/* ─────────────────────────────────── primitives ───────────────────────────────────── */

function finish(geometry, name) {
  geometry.name = name;
  geometry.computeBoundingBox();
  MaterialLibrary.ensureUv2(geometry);
  return geometry;
}

export function part(geometry, material) {
  return { geometry, material };
}

/** Box with its CENTRE at (x,y,z). */
export function box(w, h, d, x, y, z, name = 'box') {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return finish(g, name);
}

/** Box sitting ON the plane y = yBase, centred in x/z. */
export function slab(w, h, d, x, yBase, z, name = 'slab') {
  return box(w, h, d, x, yBase + h / 2, z, name);
}

/** Box with Euler rotation about its own centre, then translated. */
export function rotBox(w, h, d, x, y, z, euler, name = 'rot-box') {
  const g = new THREE.BoxGeometry(w, h, d);
  if (euler?.x) g.rotateX(euler.x);
  if (euler?.y) g.rotateY(euler.y);
  if (euler?.z) g.rotateZ(euler.z);
  g.translate(x, y, z);
  g.computeVertexNormals();
  return finish(g, name);
}

/** Cylinder along an axis. Closed (caps on), so the winding probe can read it. */
export function cyl(radius, length, x, y, z, axis = 'y', name = 'cyl', segments = 8) {
  const g = new THREE.CylinderGeometry(radius, radius, length, segments, 1, false);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  g.computeVertexNormals();
  return finish(g, name);
}

/** Tapered cylinder — column shaft with entasis, baluster, pinnacle, trunk. */
export function taper(rBottom, rTop, height, x, yBase, z, name = 'taper', segments = 8) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, height, segments, 1, false);
  g.translate(x, yBase + height / 2, z);
  g.computeVertexNormals();
  return finish(g, name);
}

/**
 * Extrude a 2D polygon (optionally with holes) along an axis.
 *
 * This is the one primitive a Gothic or a Corinthian building genuinely needs and a box kit
 * cannot fake: a pointed-arch surround is an annulus with a point on it, and approximating one
 * out of rotated boxes costs more triangles AND reads as a chevron. `pts` is a list of
 * `[u, v]` in the extrusion's own plane, counter-clockwise; `holes` is a list of the same, and
 * three's earcut handles the winding of both.
 *
 * `axis` says which world axis the extrusion runs along:
 *   'z' — (u, v) is (x, y), thickness along z   (a front-elevation member)
 *   'x' — (u, v) is (z, y), thickness along x   (a flank member)
 */
export function extrude(pts, {
  depth = 0.2, axis = 'z', x = 0, y = 0, z = 0, name = 'extrude', holes = [],
}) {
  const shape = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
  for (const h of holes) {
    shape.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  // ExtrudeGeometry builds on the XY plane growing along +Z, and centres nothing. Centre the
  // extrusion on its own axis first so callers position by the member's middle.
  g.translate(0, 0, -depth / 2);
  if (axis === 'x') g.rotateY(Math.PI / 2);
  g.translate(x, y, z);
  g.computeVertexNormals();
  return finish(g, name);
}

/**
 * A pointed (two-centred) arch profile, as a closed polygon in (u, v).
 *
 * `halfW` is the half-span, `spring` the height at which the arch starts, `rise` the height of
 * the point above the springing, `base` the bottom of the jambs. `segs` is the number of chords
 * per side — three is enough at board zoom and still reads as a curve in a detail plate.
 *
 * The curve is a real circular arc struck from a centre on the springing line, which is what a
 * two-centred arch is; a parabola or a chevron reads wrong to anyone who has seen one.
 */
export function pointedArchProfile({ halfW, spring, rise, base = 0, segs = 4 }) {
  const apex = spring + rise;
  // Radius of the arc through (halfW, spring) and (0, apex), struck from (cx, spring).
  // (halfW - cx)^2 = R^2 and cx^2 + rise^2 = R^2  =>  cx = (halfW^2 - rise^2) / (2 * halfW).
  const cx = (halfW * halfW - rise * rise) / (2 * halfW);
  const R = Math.hypot(cx, rise);
  const pts = [[-halfW, base], [halfW, base], [halfW, spring]];
  // Right half: from the springing to the apex, struck from (cx, spring).
  const a0 = Math.atan2(0, halfW - cx);
  const a1 = Math.atan2(rise, -cx);
  for (let i = 1; i <= segs; i += 1) {
    const a = a0 + (a1 - a0) * (i / segs);
    pts.push([cx + Math.cos(a) * R, spring + Math.sin(a) * R]);
  }
  // Left half mirrored, apex already placed by the last step of the right half.
  for (let i = segs - 1; i >= 1; i -= 1) {
    const a = a0 + (a1 - a0) * (i / segs);
    pts.push([-(cx + Math.cos(a) * R), spring + Math.sin(a) * R]);
  }
  pts.push([-halfW, spring]);
  return pts;
}

/** A round-headed (semicircular) arch profile — the Town Hall's rusticated ground storey. */
export function roundArchProfile({ halfW, spring, base = 0, segs = 6 }) {
  const pts = [[-halfW, base], [halfW, base], [halfW, spring]];
  for (let i = 1; i <= segs * 2 - 1; i += 1) {
    const a = (Math.PI * i) / (segs * 2);
    pts.push([Math.cos(a) * halfW, spring + Math.sin(a) * halfW]);
  }
  pts.push([-halfW, spring]);
  return pts;
}

/** Offset a closed profile outward by `t` about the origin of its own span. Cheap and adequate
 *  for an arch surround, where the offset only has to look like a constant-width moulding. */
export function inflateProfile(pts, t) {
  return pts.map(([u, v]) => {
    const len = Math.hypot(u, v) || 1;
    return [u + (u / len) * t, v + (v / len) * t];
  });
}

/**
 * Low-poly leaf cluster (§2.6 — "leaf silhouette, not spheres").
 *
 * An octahedron at eight triangles, with each of its six poles pulled to a per-lobe scale and
 * pushed off-axis, hashed off the clump's own tag. A regular octahedron's silhouette from any
 * azimuth is a convex hexagon with three axes of symmetry, and foliage has none of those
 * properties. Same eight triangles, ragged non-convex outline, no two clumps alike.
 */
export function leafClump(radius, x, y, z, name = 'clump', seed = '', subdiv = 0) {
  const g = new THREE.OctahedronGeometry(radius, subdiv);
  const pos = g.attributes.position;
  const h = hash32(`${name}|${seed}`);
  for (let i = 0; i < pos.count; i += 1) {
    const px = pos.getX(i); const py = pos.getY(i); const pz = pos.getZ(i);
    const k = Math.round(px * 5) * 7 + Math.round(py * 5) * 13 + Math.round(pz * 5) * 29;
    const s = 0.62 + unitFrom(h, 40 + k) * 0.72;
    pos.setXYZ(i,
      px * s + (unitFrom(h, 60 + k) - 0.5) * radius * 0.34,
      py * s * 0.86 + (unitFrom(h, 80 + k) - 0.5) * radius * 0.26,
      pz * s + (unitFrom(h, 100 + k) - 0.5) * radius * 0.34);
  }
  g.translate(x, y, z);
  g.computeVertexNormals();
  return finish(g, name);
}


/**
 * Remap a geometry's V coordinate to 0..1 over its own Y extent.
 *
 * `ExtrudeGeometry`'s default UV generator emits cap UVs in MODEL UNITS, not normalised, and the
 * glass bucket's head-to-sill ramp rides `uv.y`. A pointed-arch pane three metres tall therefore
 * arrived with uv.y = 3 everywhere the ramp clamps, i.e. flat head colour top to bottom — the flat
 * card §2.2 forbids, arriving through the UV rather than through the albedo. Box panes are already
 * 0..1 per face and are untouched by this.
 */
export function remapUvY(geometry) {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  if (!pos || !uv) return geometry;
  let lo = Infinity; let hi = -Infinity;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  const span = hi - lo || 1;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setY(i, (pos.getY(i) - lo) / span);
  }
  uv.needsUpdate = true;
  return geometry;
}

/* ─────────────────────────────── punched wall system ──────────────────────────────── */

/** An aperture in a wall run, in the run's own (u, y) coordinates. */
export function hole(u, y, width, height, tag = 'win') {
  return { u, y, width, height, tag };
}

/**
 * A stepped head turns one rectangular punch into an ARCH-SHAPED punch.
 *
 * `openWall` slices by horizontal edge, so three stacked rectangles of decreasing width give the
 * wall an arched reveal for the price of a few extra wall boxes — and the surround moulding then
 * covers the steps. It is ONE aperture and the census counts it as one; see `apertureCensus`.
 */
export function archedHole(u, y, width, height, {
  headFrac = 0.30, steps = 3, tag = 'win', pointed = true,
} = {}) {
  const shaft = height * (1 - headFrac);
  const out = [{ u, y, width, height: shaft, tag, aperture: 1 }];
  const headH = height - shaft;
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 1) / (steps + 1);
    // A pointed head narrows faster near the top than a round one does.
    const k = pointed ? t ** 1.55 : Math.sqrt(1 - (1 - t) ** 2) * 0.0 + (1 - Math.cos(t * Math.PI / 2));
    out.push({
      u, y: y + shaft + (headH * i) / steps, width: width * (1 - k * 0.92),
      height: headH / steps, tag: `${tag}-h${i}`, aperture: 0,
    });
  }
  return out;
}

/**
 * A box on a wall face. `axis` is the direction the run travels; `face` is +1 where the outward
 * normal points along +z / +x; `plane` is the outer face's coordinate on the perpendicular axis.
 */
export function faceBox(axis, face, plane, { u, y, run, height, depth, set = 0 }, name = 'face') {
  const outer = plane - face * set;
  const centre = outer - face * (depth / 2);
  return axis === 'x'
    ? box(run, height, depth, u, y, centre, name)
    : box(depth, height, run, centre, y, u, name);
}

/**
 * A wall run with holes punched in it, emitted as the solid pieces around the holes.
 *
 * This is what makes an opening a hole rather than a decal, and because every piece carries the
 * full wall depth the reveal comes for free and is real (§2.2). The band decomposition is by
 * horizontal edge: every opening contributes its sill and head to the edge list, the run is
 * sliced into bands between consecutive edges, and each band is filled left-to-right around the
 * openings straddling it.
 */
export function openWall(materialOrCtx, {
  material, axis = 'x', face = 1, plane, centre = 0, run, y0, y1,
  depth = LM_METRICS.wallDepth, set = 0, openings = [], name = 'wall',
}) {
  const mat = material ?? materialOrCtx;
  if (!(run > 0.02) || !(y1 - y0 > 0.02)) return [];
  const out = [];
  const edges = [y0, y1];
  for (const o of openings) {
    edges.push(Math.max(y0, Math.min(y1, o.y)), Math.max(y0, Math.min(y1, o.y + o.height)));
  }
  edges.sort((a, b) => a - b);
  const ys = edges.filter((y, i) => i === 0 || y - edges[i - 1] > 0.004);
  const lo = centre - run / 2;
  const hi = centre + run / 2;
  for (let i = 0; i < ys.length - 1; i += 1) {
    const a = ys[i];
    const b = ys[i + 1];
    const mid = (a + b) / 2;
    const spans = openings
      .filter((o) => o.y < mid && o.y + o.height > mid)
      .map((o) => [o.u - o.width / 2, o.u + o.width / 2])
      .sort((s, t) => s[0] - t[0]);
    let u = lo;
    for (const [s, t] of spans) {
      const left = Math.max(u, lo);
      const right = Math.min(s, hi);
      if (right - left > 0.02) {
        out.push(part(faceBox(axis, face, plane, {
          u: (left + right) / 2, y: mid, run: right - left, height: b - a, depth, set,
        }, name), mat));
      }
      u = Math.max(u, t);
    }
    if (hi - u > 0.02) {
      out.push(part(faceBox(axis, face, plane, {
        u: (u + hi) / 2, y: mid, run: hi - u, height: b - a, depth, set,
      }, name), mat));
    }
  }
  return out;
}

/**
 * A closed volume with four punched wall faces, a dark room behind them and a floor.
 *
 * The room is load-bearing: it is what stops a punched hole reading as a black sticker. Where the
 * mass is too small to shell it falls back to a solid, so nothing ever leaves a hole through the
 * envelope (§1.2).
 */
export function volume(ctx, {
  material, sideMaterial = null, x = 0, zFront, zBack, width, y0, y1,
  depth = LM_METRICS.wallDepth,
  front = [], back = [], left = [], right = [], room = true, name = 'vol',
}) {
  const out = [];
  const zc = (zFront + zBack) / 2;
  const d = zFront - zBack;
  if (!(width > 0.05) || !(d > 0.05) || !(y1 - y0 > 0.05)) return out;
  const mat = material ?? ctx.p.wall;
  if (!(width > depth * 2.4) || !(d > depth * 2.4)) {
    out.push(part(box(width, y1 - y0, d, x, (y0 + y1) / 2, zc, `${name}-solid`), mat));
    return out;
  }
  if (room) {
    const inset = depth * 1.04;
    // §5.3 — the room is `trim`, not the darkest bucket. No albedo can light a reveal, so the
    // surface at the back of one has to CARRY its value; putting the room in the darkest bucket
    // is how every lane in this programme ended up with black stickers behind its glass.
    out.push(part(box(
      Math.max(0.2, width - inset * 2),
      Math.max(0.2, y1 - y0 - 0.10),
      Math.max(0.2, d - inset * 2),
      x, (y0 + y1) / 2, zc, `${name}-room`,
    ), ctx.p.room));
    out.push(part(box(
      Math.max(0.2, width - depth), 0.12, Math.max(0.2, d - depth),
      x, y0 + 0.06, zc, `${name}-floor`,
    ), ctx.p.ground));
  }
  out.push(...openWall(mat, {
    axis: 'x', face: 1, plane: zFront, centre: x, run: width, y0, y1, depth,
    openings: front, name: `${name}-front`,
  }));
  out.push(...openWall(mat, {
    axis: 'x', face: -1, plane: zBack, centre: x, run: width, y0, y1, depth,
    openings: back, name: `${name}-back`,
  }));
  const side = sideMaterial ?? mat;
  out.push(...openWall(side, {
    axis: 'z', face: 1, plane: x + width / 2, centre: zc, run: d, y0, y1, depth,
    openings: right, name: `${name}-right`,
  }));
  out.push(...openWall(side, {
    axis: 'z', face: -1, plane: x - width / 2, centre: zc, run: d, y0, y1, depth,
    openings: left, name: `${name}-left`,
  }));
  return out;
}

/* ─────────────────────────────── construction members ─────────────────────────────── */

/** §2.3 — the darker masonry base course, in two steps so it has its own shadow line. */
export function plinthCourse(ctx, {
  x = 0, z, w, d, yBase, h = 1.05, proud = 0.16, material = null, name = 'plinth',
}) {
  const p = ctx.p;
  const base = material ?? p.wallAlt;
  return [
    part(slab(w + proud * 2, h, d + proud * 2, x, yBase, z, `${name}-base`), base),
    part(slab(w + proud * 2 + 0.12, 0.16, d + proud * 2 + 0.12, x, yBase, z, `${name}-toe`), base),
    part(slab(w + proud * 2 + 0.07, 0.12, d + proud * 2 + 0.07, x, yBase + h, z, `${name}-cap`), p.trim),
  ];
}

/** A projecting string course / band with real section. */
export function stringCourse(ctx, {
  x = 0, z, w, d, y, thick = 0.18, proud = 0.12, material = null, name = 'string',
}) {
  const mat = material ?? ctx.p.trim;
  return [
    part(slab(w + proud * 2, thick, d + proud * 2, x, y, z, `${name}-band`), mat),
    part(slab(w + proud * 2 + 0.05, 0.07, d + proud * 2 + 0.05, x, y + thick, z, `${name}-drip`), mat),
  ];
}

/**
 * A heavy modillioned cornice (§2 register, and the Town Hall's identity above the pilasters).
 *
 * Bed mould, then a run of modillion blocks with a real gap between them, then the corona and its
 * drip. The modillions are the reason this reads as a classical cornice at a close orbit rather
 * than as a stack of three slabs.
 */
export function corniceRun(ctx, {
  x = 0, z, w, d, y, faces = 'fr', pitch = 1.15, drop = 0.42, proud = 0.34,
  material = null, name = 'cornice',
}) {
  const mat = material ?? ctx.p.trim;
  const out = [
    part(slab(w + proud * 0.7, 0.20, d + proud * 0.7, x, y, z, `${name}-bed`), mat),
  ];
  const modY = y + 0.20;
  const modH = drop;
  const blockD = proud * 0.78;
  if (faces.includes('f')) {
    const n = Math.max(2, Math.round(w / pitch));
    for (let i = 0; i < n; i += 1) {
      const bx = x - w / 2 + (i + 0.5) * (w / n);
      out.push(part(slab(0.30, modH, blockD, bx, modY, z + d / 2 + blockD / 2, `${name}-mod`), mat));
    }
  }
  if (faces.includes('r')) {
    const n = Math.max(2, Math.round(d / pitch));
    for (let i = 0; i < n; i += 1) {
      const bz = z - d / 2 + (i + 0.5) * (d / n);
      out.push(part(slab(blockD, modH, 0.30, x + w / 2 + blockD / 2, modY, bz, `${name}-mod`), mat));
    }
  }
  out.push(part(slab(w + proud * 2, 0.30, d + proud * 2, x, modY + modH, z, `${name}-corona`), mat));
  out.push(part(slab(w + proud * 2 + 0.06, 0.09, d + proud * 2 + 0.06,
    x, modY + modH + 0.30, z, `${name}-drip`), mat));
  return out;
}

/**
 * A balustrade — plinth, balusters with a real waist, and a moulded rail.
 *
 * A baluster is two opposed tapers, which is what makes the run read as turned stone rather than
 * as a comb of sticks. Five segments each, because at the board station the whole run is 40 px
 * tall and the silhouette is the only thing carrying it.
 */
export function balustrade(ctx, {
  x0, x1, z0, z1, y, h = 1.05, pitch = 1.05, material = null, name = 'balus', posts = true,
}) {
  const mat = material ?? ctx.p.trim;
  const out = [];
  const horizontal = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const len = horizontal ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  if (len < 0.5) return out;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const th = 0.40;
  const plinthH = 0.20;
  const railH = 0.20;
  out.push(part(horizontal
    ? slab(len, plinthH, th, cx, y, cz, `${name}-plinth`)
    : slab(th, plinthH, len, cx, y, cz, `${name}-plinth`), mat));
  const n = Math.max(2, Math.round(len / pitch));
  const bh = h - plinthH - railH;
  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.5) / n;
    const bx = horizontal ? Math.min(x0, x1) + t * len : cx;
    const bz = horizontal ? cz : Math.min(z0, z1) + t * len;
    out.push(part(taper(0.15, 0.09, bh * 0.55, bx, y + plinthH, bz, `${name}-bal`, 5), mat));
    out.push(part(taper(0.09, 0.14, bh * 0.45, bx, y + plinthH + bh * 0.55, bz, `${name}-bal-t`, 5), mat));
  }
  if (posts) {
    for (const t of [0, 1]) {
      const px = horizontal ? Math.min(x0, x1) + t * len : cx;
      const pz = horizontal ? cz : Math.min(z0, z1) + t * len;
      out.push(part(slab(0.42, h + 0.14, 0.42, px, y, pz, `${name}-post`), mat));
    }
  }
  out.push(part(horizontal
    ? slab(len, railH, th + 0.10, cx, y + h - railH, cz, `${name}-rail`)
    : slab(th + 0.10, railH, len, cx, y + h - railH, cz, `${name}-rail`), mat));
  return out;
}

/**
 * A crenellated parapet — merlons with embrasures between them (§ the Old Arts identity).
 *
 * The embrasure is a real gap, not a painted band: the silhouette at board zoom is the whole
 * point of a crenellation and a notched slab would read as a solid one.
 */
export function crenellation(ctx, {
  x, z, w, d, y, merlonH = 0.95, merlonW = 0.80, gap = 0.55, wallT = 0.34,
  material = null, capMaterial = null, name = 'cren',
}) {
  const mat = material ?? ctx.p.wall;
  const cap = capMaterial ?? ctx.p.trim;
  const out = [];
  const run = (length, axis, fixed, sign) => {
    const pitch = merlonW + gap;
    const n = Math.max(2, Math.round(length / pitch));
    const step = length / n;
    for (let i = 0; i < n; i += 1) {
      const t = -length / 2 + (i + 0.5) * step;
      const mx = axis === 'x' ? x + t : fixed;
      const mz = axis === 'x' ? fixed : z + t;
      const bw = axis === 'x' ? Math.min(merlonW, step - gap * 0.55) : wallT;
      const bd = axis === 'x' ? wallT : Math.min(merlonW, step - gap * 0.55);
      out.push(part(slab(bw, merlonH, bd, mx, y, mz, `${name}-merlon`), mat));
      out.push(part(slab(bw + 0.08, 0.10, bd + 0.08, mx, y + merlonH, mz, `${name}-mcap`), cap));
    }
    return sign;
  };
  run(w, 'x', z + d / 2 - wallT / 2, 1);
  run(w, 'x', z - d / 2 + wallT / 2, -1);
  run(d - wallT * 2, 'z', x + w / 2 - wallT / 2, 1);
  run(d - wallT * 2, 'z', x - w / 2 + wallT / 2, -1);
  return out;
}

/**
 * A steep gabled roof in slate: two sheets meeting at a HIGH ridge, laid in raised courses with
 * their own shadow, on a fascia and a hung gutter that both have real section (§2.4).
 *
 * ── THE SIGN, AND IT WAS THE ROUND'S ONLY MAJOR. ──
 *
 * [MEASURED] `mvp/tests/lmroof-geom.mjs --parts rf-` against the r1 source: each `rf-plane` came
 * back with its top edge at y **14.88 at the OUTER edge** (z 5.52 and z -7.51) and **9.82 at the
 * CENTRE** (z ~-1.0). Both sheets rose outward. That is a BUTTERFLY, not a gable — the planes met
 * at the low point on the ridge line and the eaves stood 5.26 m in the air over open wall head.
 *
 * `rotBox` applies `rotateX(euler.x)` before translating, so a sheet whose length lies on local +Z
 * and is rolled by `a` about X has its +Z end travel by `(-sin a, cos a)` in (y, z). r1 passed
 * `{ x: -sign * angle }` with a centre offset of `+sign * halfD / 2`, i.e. the +Z end of the +Z
 * sheet travelled AWAY from the ridge and UPWARD together. The correct roll is `+sign * angle`.
 *
 * EVERYTHING ELSE ON THIS ROOF WAS ALREADY AUTHORED FOR A CORRECT GABLE, which is the strongest
 * evidence the sign is the whole defect and not one symptom of it: the ridge cap sits at
 * `eaveY + rise` on the centre line, the gable ends extrude an apex-UP triangle
 * `[[-halfD,0],[halfD,0],[0,rise]]`, and `old-arts.js`'s `dormer()` seats itself at
 * `eaveY + tan(pitch) * halfD * 0.48` for `z = zc + halfD * 0.52` — which is the height of a
 * correct slope at that depth, and nowhere near an inverted one. Three members authored for a
 * gable, one member built as a butterfly.
 *
 * WHY THE WINDING PROBE PASSED ANYWAY, and this is worth more than the instance: `lm-probe.mjs`
 * proves orientation by signed volume, and rotating a closed box **preserves** its signed volume
 * whatever the angle. A winding check cannot see an upside-down roof. `mvp/tests/lmroof-probe.mjs`
 * asserts the ORIENTATION separately — ridge high, sheets meeting, eave at the wall head — and a
 * mutation run restoring this sign makes it fail.
 *
 * The bright band the r1 round chased was `rf-ceiling` at 1,841 visible px, and it was a symptom:
 * with the eaves 5.26 m up, the board camera's 42° sightline passes UNDER the raised outer edge
 * of the near sheet and lands on the ceiling slab in full key. The r1 round added that slab, then
 * reseated it, then measured it — but the slab was never the fault. See §2 of
 * `_reviews/quality-loop/v370/landmarks/roof-builder.md`.
 *
 * Melbourne's block-cores lane shipped and fixed this exact defect in ITS own `seamGable`
 * (`block-cores/types/market-hall.js:26` — "seamGable inverted every roof it built (the roll
 * sign)"). Two lanes, two independent copies of the primitive, one character.
 */
export function seamGable(ctx, {
  x = 0, z, w, d, eaveY, pitch = 0.85, overhang = 0.55, coursePitch = 1.15,
  material = null, name = 'roof',
}) {
  const p = ctx.p;
  const mat = material ?? p.roof;
  const out = [];
  const halfD = d / 2 + overhang;
  const rise = halfD * Math.tan(pitch);
  const slope = Math.hypot(halfD, rise);
  const angle = Math.atan2(rise, halfD);
  const t = 0.20;
  const span = w + overhang * 2;
  // Half the sheet's thickness measured VERTICALLY. Everything that hangs off the eave is seated
  // against this rather than against `eaveY`, so the fascia lands on the sheet's underside instead
  // of poking through its face — the r1 fascia's top sat 0.02 m ABOVE the sheet's mid-surface.
  const perp = t / (2 * Math.cos(angle));
  const eaveUnder = eaveY - perp;
  for (const sign of [1, -1]) {
    const cz = z + sign * halfD / 2;
    const cy = eaveY + rise / 2;
    out.push(part(rotBox(span, t, slope, x, cy, cz,
      { x: sign * angle }, `${name}-plane`), mat));
    // ── SLATE COURSES, running ACROSS the slope, which is what slate does. ──
    // r1 laid 20 battens per sheet DOWN the slope. Standing-seam battens run down a METAL roof;
    // both these subjects are slate, and [MEASURED by looking] `_reference-landmarks/
    // mp-oldarts-three-quarter.png` shows the roof as horizontal lapped courses with a shadow
    // under each lap and no vertical member anywhere on it. Courses are also cheaper: 7 per sheet
    // against 20, which is 312 triangles back on a subject that had 452 of headroom.
    // The pitch is a board-zoom abstraction and is stated as one — a real slate course is ~0.30 m
    // and would land at 2.4 px at the board station, which is a moiré rather than a roof; one
    // modelled lap stands for about four real ones at ~7 px.
    const nc = Math.max(3, Math.round(slope / coursePitch));
    // Outward normal of this sheet is (0, cos a, sign * sin a); `off` rides along it so the course
    // is buried 0.02 in the sheet and stands 0.08 proud of it, with its own cast shadow.
    const off = 0.15;
    for (let i = 0; i < nc; i += 1) {
      // u runs the slope, -slope/2 at the ridge to +slope/2 at the eave. Courses are placed on
      // the LAP line, from the eave up, so the lowest one sits on the eave itself.
      const u = slope / 2 - (i + 0.15) * (slope / nc);
      out.push(part(rotBox(span, 0.10, 0.24, x,
        cy - sign * u * Math.sin(angle) + off * Math.cos(angle),
        cz + u * Math.cos(angle) + sign * off * Math.sin(angle),
        { x: sign * angle }, `${name}-course`), mat));
    }
    // Verge coping, one per end of each sheet: a raked stone member standing proud of the slate at
    // the gable end. [MEASURED by looking] `_reference-landmarks/mp-oldarts-three-quarter.png`
    // caps every gable with a pale raking coping and the roof stops against it; r1's verge was the
    // bare cut edge of the sheet, so the whole 857 px gable-end triangle met the roof with no line
    // between them. 4 members, 48 triangles, on a subject with 728 of headroom.
    for (const end of [1, -1]) {
      out.push(part(rotBox(0.30, 0.16, slope, x + end * (span / 2 - 0.10),
        cy + off * Math.cos(angle), cz + sign * off * Math.sin(angle),
        { x: sign * angle }, `${name}-verge`), p.trim));
    }
    // Fascia: a board with section on the rafter ends, its top against the sheet's underside.
    out.push(part(slab(span + 0.06, 0.34, 0.14, x, eaveUnder - 0.34,
      z + sign * (halfD - 0.02), `${name}-fascia`), p.trim));
    // Gutter: hung PROUD of the fascia and below the sheet's edge, in two members so it carries a
    // section rather than a silhouette — a bead over a body, which is what an ogee reads as at
    // board zoom. r1's single member sat at `halfD - 0.05`, i.e. INSIDE the roof sheet once the
    // sheet came down to the eave, and would have vanished the moment the sign was fixed.
    out.push(part(slab(span, 0.20, 0.20, x, eaveUnder - 0.28,
      z + sign * (halfD + 0.13), `${name}-gutter`), p.metal));
    out.push(part(slab(span, 0.07, 0.26, x, eaveUnder - 0.08,
      z + sign * (halfD + 0.10), `${name}-gutter-bead`), p.metal));
  }
  // The ridge cap, and it is load-bearing on the envelope rather than decorative: the two sheets'
  // inner end faces cross at `(z, eaveY + rise)` and open into a V ABOVE that crossing, 0.126 m
  // wide at the sheet crown and running the full 26.8 m of ridge. The cap's underside is seated at
  // the crossing so the V is plugged; a shallower cap would leave a slot straight to sky.
  out.push(part(slab(span + 0.10, 0.26, 0.46, x, eaveY + rise + perp - 0.13, z,
    `${name}-ridge`), p.trim));
  // ── THE CEILING. IT IS A SOFFIT NOW, AND IT WAS NEVER THE FAULT. ──
  //
  // r1 added this slab to close a band it read as a hole in the envelope, then reseated it, then
  // measured it at 1,841 visible px and marked the non-occlusion [ARGUED]. The band WAS this slab;
  // the reason a closed envelope showed an interior member is that the roof above it was inverted,
  // so the board camera's sightline passed under a 5.26 m-high eave and lit it in full key. With
  // the sign fixed it measures 0.0 px at the board station (`lm-boardzoom.mjs --parts rf-`).
  //
  // It stays, for two reasons that are its own rather than the band's: it closes the downward V
  // between the two sheets' undersides at the ridge, and it reads as a SOFFIT under the 0.50 m
  // eave overhang from the street. Seated so its top is flush with the wall head rather than
  // 0.04 m proud of it, because a lid that pokes through its own wall head is how the r1 attempt
  // left `rng-room` visible at 365.6 px after the "fix".
  //
  // It overhangs in Z ONLY. r1 oversized it on both axes; [MEASURED] `lmroof-where.mjs --part
  // rf-ceiling` put the last 35.4 visible px on a single plane at **x = -13.08, y 9.52..9.62** —
  // the slab's own END face, 0.21 m proud of the end wall and hanging below the gable's base at
  // `eaveY`, where nothing covers it. Pulled inside the end walls; the Z overhang stays because
  // there it IS the soffit under the eave.
  out.push(part(slab(w - 0.10, 0.26, d + 0.4, x, eaveY - 0.26, z, `${name}-ceiling`), p.shadow));
  // Gable ends, so the roof is closed rather than two leaning planes.
  for (const sign of [1, -1]) {
    out.push(part(extrude(
      [[-halfD, 0], [halfD, 0], [0, rise]],
      { depth: 0.30, axis: 'x', x: x + sign * (w / 2 + 0.14), y: eaveY, z, name: `${name}-gable` },
    ), p.wall));
  }
  return out;
}

/**
 * A mansard roof — the Town Hall tower's crown, and the one silhouette that says Second Empire.
 *
 * Steep lower slope, shallow upper deck, both in slate, with a bold moulded kerb between them.
 * Built as four trapezoid slabs rather than a frustum so the slate battens can run down the
 * slope and the kerb can have a real section.
 */
export function mansardRoof(ctx, {
  x = 0, z, w, d, y, lowerH, upperH, inset, deckInset, seamPitch = 1.15,
  material = null, name = 'mansard',
}) {
  const p = ctx.p;
  const mat = material ?? p.roof;
  const out = [];
  const t = 0.22;
  const faces = [
    { axis: 'x', sign: 1, span: w, fixed: z + d / 2, run: d },
    { axis: 'x', sign: -1, span: w, fixed: z - d / 2, run: d },
    { axis: 'z', sign: 1, span: d, fixed: x + w / 2, run: w },
    { axis: 'z', sign: -1, span: d, fixed: x - w / 2, run: w },
  ];
  for (const f of faces) {
    const slope = Math.hypot(inset, lowerH);
    const angle = Math.atan2(inset, lowerH);
    const cy = y + lowerH / 2;
    if (f.axis === 'x') {
      const cz = f.fixed - f.sign * inset / 2;
      out.push(part(rotBox(f.span, slope, t, x, cy, cz, { x: -f.sign * angle }, `${name}-face`), mat));
      const n = Math.max(2, Math.round(f.span / seamPitch));
      for (let i = 0; i < n; i += 1) {
        const bx = x - f.span / 2 + (i + 0.5) * (f.span / n);
        out.push(part(rotBox(0.10, slope * 0.98, 0.11, bx, cy, cz + f.sign * 0.14,
          { x: -f.sign * angle }, `${name}-batten`), mat));
      }
    } else {
      const cx = f.fixed - f.sign * inset / 2;
      out.push(part(rotBox(t, slope, f.span, cx, cy, z, { z: f.sign * angle }, `${name}-face`), mat));
      const n = Math.max(2, Math.round(f.span / seamPitch));
      for (let i = 0; i < n; i += 1) {
        const bz = z - f.span / 2 + (i + 0.5) * (f.span / n);
        out.push(part(rotBox(0.11, slope * 0.98, 0.10, cx + f.sign * 0.14, cy, bz,
          { z: f.sign * angle }, `${name}-batten`), mat));
      }
    }
  }
  // The kerb between the two slopes, and the shallow upper deck above it.
  const uw = w - inset * 2;
  const ud = d - inset * 2;
  out.push(part(slab(uw + 0.34, 0.26, ud + 0.34, x, y + lowerH - 0.10, z, `${name}-kerb`), p.trim));
  out.push(part(slab(uw + 0.44, 0.10, ud + 0.44, x, y + lowerH + 0.16, z, `${name}-kerb-drip`), p.trim));
  const dy = y + lowerH + 0.26;
  const di = Math.max(0.1, deckInset);
  for (const f of faces) {
    const slope = Math.hypot(di, upperH);
    const angle = Math.atan2(di, upperH);
    if (f.axis === 'x') {
      out.push(part(rotBox(uw, slope, t, x, dy + upperH / 2, f.fixed - f.sign * (inset + di / 2),
        { x: -f.sign * angle }, `${name}-upper`), mat));
    } else {
      out.push(part(rotBox(t, slope, ud, f.fixed - f.sign * (inset + di / 2), dy + upperH / 2, z,
        { z: f.sign * angle }, `${name}-upper`), mat));
    }
  }
  out.push(part(slab(Math.max(0.4, uw - di * 2), 0.16, Math.max(0.4, ud - di * 2),
    x, dy + upperH - 0.02, z, `${name}-deck`), mat));
  return out;
}

/** A downpipe that ends in a shoe, because §2 rule 4 says nothing floats. */
export function downpipe(ctx, {
  x, z, y0, y1, name = 'dp',
}) {
  const p = ctx.p;
  return [
    part(cyl(0.09, y1 - y0, x, (y0 + y1) / 2, z, 'y', `${name}-pipe`, 6), p.metal),
    part(slab(0.26, 0.20, 0.26, x, y0, z, `${name}-shoe`), p.metal),
    part(slab(0.22, 0.12, 0.22, x, y1 - 0.34, z, `${name}-strap`), p.metal),
  ];
}

/* ─────────────────────────────────── the lot kit ──────────────────────────────────── */

/**
 * Chamfered slab: a box whose top face is inset by `insetTop` and whose bottom is inset by
 * `inset`, so the sides rake. Closed, twelve triangles plus the two caps.
 */
export function chamferSlab(w, d, h, inset, x, yBase, z, name = 'chamfer', insetTop = 0) {
  const g = new THREE.BufferGeometry();
  const bw = w / 2 - inset; const bd = d / 2 - inset;
  const tw = w / 2 - insetTop; const td = d / 2 - insetTop;
  const v = [
    [-bw, 0, -bd], [bw, 0, -bd], [bw, 0, bd], [-bw, 0, bd],
    [-tw, h, -td], [tw, h, -td], [tw, h, td], [-tw, h, td],
  ];
  // WINDING, and this list was wrong in the first draft — `mvp/tests/lm-probe.mjs` measured the
  // whole solid at NEGATIVE signed volume, i.e. every one of its twelve triangles facing inward,
  // which is the defect an adjacent lane shipped and nobody saw for four rounds. Counter-clockwise
  // seen from OUTSIDE, checked face by face against the divergence theorem rather than by eye.
  const faces = [
    [0, 1, 2], [0, 2, 3],       // bottom (outward = -Y)
    [4, 6, 5], [4, 7, 6],       // top    (outward = +Y)
    [0, 5, 1], [0, 4, 5],       // -Z
    [1, 6, 2], [1, 5, 6],       // +X
    [2, 7, 3], [2, 6, 7],       // +Z
    [3, 4, 0], [3, 7, 4],       // -X
  ];
  const pos = [];
  for (const f of faces) for (const i of f) pos.push(v[i][0] + x, v[i][1] + yBase, v[i][2] + z);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  return finish(g, name);
}

/**
 * §2.1 — the board tile. Widest at the TOP, stepping in going down, under a lit horizontal ledge
 * that overhangs a dark bevel by a drip. The extreme silhouette point is then a face the key
 * reaches, and the dark band sits behind it rather than as an unlit lip in front of it.
 */
export function boardPlate(ctx, { width, depth, x = 0, z = 0, name = 'lot-plate' } = {}) {
  const p = ctx.p;
  const M = LM_METRICS;
  const ledgeW = width + M.plateApron * 2;
  const ledgeD = depth + M.plateApron * 2;
  return [
    part(chamferSlab(ledgeW - M.plateDrip * 2, ledgeD - M.plateDrip * 2,
      M.plateLedgeY + M.plateApronDrop, M.plateChamfer,
      x, -M.plateApronDrop, z, `${name}-base`, 0), p.metal),
    part(chamferSlab(ledgeW, ledgeD, M.plateLedge - M.plateLedgeCap, 0.075,
      x, M.plateLedgeY, z, `${name}-bevel`, 0.02), p.metal),
    part(slab(ledgeW, M.plateLedgeCap, ledgeD,
      x, M.plateLedgeY + M.plateLedge - M.plateLedgeCap, z, `${name}-ledge`), p.ground),
    part(slab(width, M.plateDeck, depth, x, M.plateRise - M.plateDeck, z, `${name}-deck`), p.ground),
  ];
}

/** Lawn field with scattered tufts standing proud of it (§2.6). */
export function lawn(ctx, {
  x = 0, z, w, d, y = LM_METRICS.plateRise, tufts = 16, salt = 20, name = 'lawn',
}) {
  const p = ctx.p;
  const v = ctx.v;
  const out = [part(slab(w, 0.08, d, x, y - 0.02, z, `${name}-field`), p.garden)];
  if (!ctx.mid) return out;
  const n = ctx.detail ? tufts : Math.round(tufts * 0.5);
  for (let i = 0; i < n; i += 1) {
    const tx = x + v.range(salt + i * 3, -w / 2 + 0.4, w / 2 - 0.4);
    const tz = z + v.range(salt + i * 3 + 1, -d / 2 + 0.4, d / 2 - 0.4);
    const th = v.range(salt + i * 3 + 2, 0.16, 0.34);
    out.push(part(rotBox(0.28, th, 0.24, tx, y + th / 2, tz, { y: th * 6 }, `${name}-tuft`), p.garden));
  }
  return out;
}

/** §2.7 — a path made of something: individual units, with a dark joint bed reading between. */
export function paverRun(ctx, {
  x0, x1, z0, z1, y = LM_METRICS.plateRise, unit = 1.30, joint = 0.08,
  material = null, flat = false, name = 'paving',
}) {
  const p = ctx.p;
  const mat = material ?? p.ground;
  const out = [];
  const w = Math.abs(x1 - x0);
  const d = Math.abs(z1 - z0);
  if (w < 0.3 || d < 0.3) return out;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  out.push(part(slab(w, 0.07, d, cx, y - 0.03, cz, `${name}-bed`), p.jointBed));
  const cols = Math.max(1, Math.round(w / (unit + joint)));
  const rows = Math.max(1, Math.round(d / (unit + joint)));
  const colLen = w / cols;
  const rowLen = d / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const tag = `${name}-u${r}x${c}`;
      const lift = flat ? 0 : (inst(ctx, tag, 1) - 0.5) * 0.022;
      const shrink = inst(ctx, tag, 2) * 0.05;
      out.push(part(slab(
        colLen - joint - shrink, 0.07 + lift, rowLen - joint - shrink * 0.6,
        Math.min(x0, x1) + (c + 0.5) * colLen + (inst(ctx, tag, 3) - 0.5) * 0.03,
        y + 0.02, Math.min(z0, z1) + (r + 0.5) * rowLen + (inst(ctx, tag, 4) - 0.5) * 0.03,
        `${name}-unit`,
      ), mat));
    }
  }
  return out;
}

/**
 * A dressed-stone boundary wall with piers at intervals and a moulded capping — the landmark's
 * equivalent of §2.8's picket fence. Every pier stands on the deck and every cap sits on a wall;
 * nothing floats.
 */
export function stoneWallRun(ctx, {
  x0, x1, z0, z1, y = LM_METRICS.plateRise, h = 1.15, t = 0.36, pierPitch = 4.2,
  material = null, name = 'bwall',
}) {
  const p = ctx.p;
  const mat = material ?? p.wallAlt;
  const out = [];
  const horizontal = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const len = horizontal ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  if (len < 0.6) return out;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  out.push(part(horizontal ? slab(len, h, t, cx, y, cz, `${name}-run`)
    : slab(t, h, len, cx, y, cz, `${name}-run`), mat));
  out.push(part(horizontal ? slab(len, 0.12, t + 0.14, cx, y + h, cz, `${name}-cap`)
    : slab(t + 0.14, 0.12, len, cx, y + h, cz, `${name}-cap`), p.trim));
  const n = Math.max(2, Math.round(len / pierPitch) + 1);
  for (let i = 0; i < n; i += 1) {
    const tt = i / (n - 1);
    const px = horizontal ? Math.min(x0, x1) + tt * len : cx;
    const pz = horizontal ? cz : Math.min(z0, z1) + tt * len;
    const jitter = (inst(ctx, `${name}-pier${i}`, 5) - 0.5) * 0.04;
    out.push(part(slab(t + 0.26, h + 0.28 + jitter, t + 0.26, px, y, pz, `${name}-pier`), mat));
    out.push(part(slab(t + 0.40, 0.13, t + 0.40, px, y + h + 0.28 + jitter, pz, `${name}-pier-cap`), p.trim));
  }
  return out;
}

/** Iron palisade between two piers — a real run of bars with a top and bottom rail. */
export function palisadeRun(ctx, {
  x0, x1, z, y = LM_METRICS.plateRise, h = 1.55, pitch = 0.40, material = null, name = 'rail',
}) {
  const mat = material ?? ctx.p.metal;
  const out = [];
  const len = Math.abs(x1 - x0);
  if (len < 0.4) return out;
  const cx = (x0 + x1) / 2;
  out.push(part(slab(len, 0.10, 0.10, cx, y + 0.18, z, `${name}-bot`), mat));
  out.push(part(slab(len, 0.12, 0.12, cx, y + h - 0.14, z, `${name}-top`), mat));
  const n = Math.max(2, Math.round(len / pitch));
  for (let i = 0; i < n; i += 1) {
    const bx = Math.min(x0, x1) + (i + 0.5) * (len / n);
    const bh = h + (inst(ctx, `${name}-bar${i}`, 7) - 0.5) * 0.03;
    out.push(part(slab(0.07, bh, 0.07, bx, y, z, `${name}-bar`), mat));
    out.push(part(taper(0.055, 0.005, 0.18, bx, y + bh, z, `${name}-spike`, 4), mat));
  }
  return out;
}

/** A clustered shrub mass with leaf silhouette (§2.6). */
export function shrubMass(ctx, {
  x: x0, z: z0, y = LM_METRICS.plateRise, r = 0.85, lobes = 3, salt = 40, name = 'shrub',
}) {
  const p = ctx.p;
  const out = [];
  const [x, z] = onPad(ctx, x0, z0, r * 1.6);
  for (let i = 0; i < lobes; i += 1) {
    const tag = `${name}-${i}`;
    const ox = x + (inst(ctx, tag, salt) - 0.5) * r * 1.5;
    const oz = z + (inst(ctx, tag, salt + 1) - 0.5) * r * 1.5;
    const rr = r * (0.48 + inst(ctx, tag, salt + 2) * 0.42);
    out.push(part(leafClump(rr, ox, y + rr * 0.74, oz, `${name}-clump`, tag, ctx.detail ? 1 : 0), p.garden));
  }
  return out;
}

/** A hedge — overlapping clumps along a run, not a green box. */
export function hedgeRun(ctx, {
  x0, x1, z0, z1, y = LM_METRICS.plateRise, h = 0.95, name = 'hedge',
}) {
  const p = ctx.p;
  const out = [];
  const horizontal = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const len = horizontal ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  if (len < 0.5) return out;
  const n = Math.max(2, Math.round(len / (h * 0.72)));
  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.5) / n;
    const hx = horizontal ? Math.min(x0, x1) + t * len : (x0 + x1) / 2;
    const hz = horizontal ? (z0 + z1) / 2 : Math.min(z0, z1) + t * len;
    const tag = `${name}-${i}`;
    const rr = h * (0.46 + inst(ctx, tag, 9) * 0.18);
    out.push(part(leafClump(rr, hx, y + rr * 0.82, hz, `${name}-clump`, tag), p.garden));
  }
  return out;
}

/**
 * Clamp a planted centre so the thing that grows out of it stays on the pad (§3.6).
 *
 * A leaf clump reaches about 1.15 x its own radius past its placement, and every planting call in
 * this lane placed its centre and trusted it. `lm-probe.mjs`'s parcel sweep found the consequence
 * on a 2 x 1 parcel — a crown 0.71 m off the plate — so the clamp lives HERE, inside the planting
 * primitives, rather than in each of the eleven call sites where it would eventually be forgotten.
 */
function onPad(ctx, x, z, reach) {
  const hw = Math.max(0.5, (ctx?.env?.lotW ?? 31) / 2 - reach - 0.25);
  const hd = Math.max(0.5, (ctx?.env?.lotD ?? 31) / 2 - reach - 0.25);
  return [Math.max(-hw, Math.min(hw, x)), Math.max(-hd, Math.min(hd, z))];
}

/** A canopy tree — trunk, two limbs, a ragged crown of clumps. Not a lollipop. */
export function canopyTree(ctx, {
  x: x0, z: z0, y = LM_METRICS.plateRise, h = 6.4, r = 2.3, salt = 60, name = 'tree',
}) {
  const p = ctx.p;
  const out = [];
  const [x, z] = onPad(ctx, x0, z0, r * 1.15);
  const trunkH = h * 0.46;
  out.push(part(taper(0.28, 0.17, trunkH, x, y, z, `${name}-trunk`, 6), p.metal));
  for (const s of [1, -1]) {
    out.push(part(rotBox(0.15, trunkH * 0.55, 0.15,
      x + s * r * 0.28, y + trunkH * 0.92, z + s * r * 0.10,
      { z: -s * 0.42 }, `${name}-limb`), p.metal));
  }
  // ── THE CROWN IS SUBDIVIDED, AND THE REASON IS ON A PLATE. ──
  //
  // r1 shipped five bare octahedra per tree at 0.52 r each, and
  // `plates/r1/university-old-arts--detail.png` shows them as four enormous flat facets — the
  // "faceted mid-green wedges" three critics have now named in three different lanes, and the
  // exact fault §2.6 exists to prevent. Count was never the fix: a sixth crystal is a bigger
  // crystal. One subdivision takes a clump from 8 triangles to 32 and from a hexagonal
  // silhouette to a ragged one, and the lobes come down in size so the crown is built out of
  // foliage-sized pieces rather than out of the whole tree.
  const lobes = ctx.detail ? 7 : 4;
  for (let i = 0; i < lobes; i += 1) {
    const tag = `${name}-c${i}`;
    const a = (i / lobes) * Math.PI * 2 + inst(ctx, tag, salt) * 1.9;
    const rad = r * (0.26 + inst(ctx, tag, salt + 1) * 0.50);
    out.push(part(leafClump(
      r * (0.34 + inst(ctx, tag, salt + 2) * 0.24),
      x + Math.cos(a) * rad,
      y + trunkH + r * (0.34 + inst(ctx, tag, salt + 3) * 0.52),
      z + Math.sin(a) * rad,
      `${name}-clump`, tag, ctx.detail ? 1 : 0,
    ), p.garden));
  }
  return out.map(p => /canopy|clump/.test(p.geometry.name) ? clusterCanopyPart(p) : p);
}

/** A bench, because a civic forecourt has furniture and a critic looks for it. */
export function bench(ctx, {
  x, z, w = 1.9, y = LM_METRICS.plateRise, axis = 'x', name = 'bench',
}) {
  const p = ctx.p;
  const out = [];
  const along = axis === 'x';
  out.push(part(along ? slab(w, 0.10, 0.50, x, y + 0.44, z, `${name}-seat`)
    : slab(0.50, 0.10, w, x, y + 0.44, z, `${name}-seat`), p.trim));
  out.push(part(along ? slab(w, 0.34, 0.09, x, y + 0.56, z - 0.20, `${name}-back`)
    : slab(0.09, 0.34, w, x - 0.20, y + 0.56, z, `${name}-back`), p.trim));
  for (const s of [-1, 1]) {
    const lx = along ? x + s * (w / 2 - 0.22) : x;
    const lz = along ? z : z + s * (w / 2 - 0.22);
    out.push(part(slab(0.10, 0.44, 0.42, lx, y, lz, `${name}-leg`), p.metal));
  }
  return out;
}

/** A cast-iron lamp standard with a real base, shaft, arm and lantern. */
export function lampPost(ctx, { x, z, y = LM_METRICS.plateRise, h = 4.2, name = 'lamp' }) {
  const p = ctx.p;
  return [
    part(taper(0.26, 0.18, 0.42, x, y, z, `${name}-base`, 6), p.metal),
    part(taper(0.13, 0.09, h - 0.42, x, y + 0.42, z, `${name}-shaft`, 6), p.metal),
    part(slab(0.46, 0.10, 0.10, x, y + h - 0.12, z, `${name}-arm`), p.metal),
    part(taper(0.20, 0.10, 0.42, x, y + h - 0.02, z, `${name}-lantern`, 6), p.glass),
    part(taper(0.12, 0.02, 0.16, x, y + h + 0.40, z, `${name}-finial`, 5), p.metal),
  ];
}

/* ────────────────────────────────── the context ───────────────────────────────────── */

export function makeContext({ env, palette, variation: v, quality, archetypeId, districtId }) {
  const parts = [];
  const openings = [];
  return {
    id: archetypeId,
    archetypeId,
    districtId,
    env,
    p: palette,
    v,
    q: quality,
    detail: quality === 'high',
    mid: quality !== 'low',
    parts,
    openings,
    /** Punched apertures, counted as the ARCHITECTURE counts them (§3.4 reporting). */
    apertures: [],
    countAperture(tag) { this.apertures.push(tag); },
    push(geometry, material) {
      if (!geometry || !material) return 0;
      parts.push({ geometry, material });
      return 1;
    },
    addOpening(opening) {
      if (opening?.parts?.length) openings.push(opening);
    },
    add(produced) {
      if (!produced) return 0;
      if (produced.parts && !produced.geometry) {
        const n = this.add(produced.parts);
        if (produced.opening) this.addOpening(produced.opening);
        return n;
      }
      let n = 0;
      const list = Array.isArray(produced) ? produced : [produced];
      for (const item of list) {
        if (!item?.geometry || !item.material) continue;
        parts.push({ geometry: item.geometry, material: item.material });
        n += 1;
      }
      return n;
    },
  };
}
