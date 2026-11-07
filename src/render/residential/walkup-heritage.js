// District Deck V3.70 — the two heritage walk-ups, from scratch.
//
// Owner brief, 2026-08-18: "Beaux arts walk up apartment (See Majorca Building). Streamline
// Moderne walk up apartment (See Mitchell House Melbourne)."
//
// Two four-to-five storey walk-ups on a narrow city frontage, joining `walkup-flats` as the
// third and fourth members of the same family. The whole point of the pair is SEPARATION: the
// same building type in three registers, sortable in silhouette alone.
//
//   walkup-flats        3 storeys, red brick, raised centre parapet, chimney. Rectangular.
//   walkup-beaux-arts   5 storeys, warm render, vertical pilaster rhythm, arched top storey,
//                       a cornice that projects 0.42 m on modillion brackets, panelled parapet.
//   walkup-moderne      4 storeys, pale render banded with a dark spandrel, ONE ROUNDED CORNER
//                       with ribbon glazing wrapping it, curved awning, slim coping, no cornice.
//
// The rounded corner is the identifying move on the Moderne and it is real plan geometry, not a
// chamfer: a quarter annulus of radius 2.35 m built as closed sector prisms, so the ribbon runs
// around it continuously and the silhouette carries a curve nothing else on the board has.
//
// WHY THIS FILE OWNS ITS OWN ASSEMBLY (`assembleHeritageWalkup`) rather than registering two
// entries in `index.js`'s `RESIDENTIAL_BUILDERS`.
//
// One code path for the board and for the instruments. `mvp/tests/wu-*.mjs` import the same
// exported function the dispatcher calls, so a triangle count, a winding proof or a determinism
// diff is measured on the object the board actually draws. The alternative — registering the
// builders and re-deriving the envelope inside the probe — is the duplicated-constant defect
// this programme has logged repeatedly, and it is exactly how a builder probe ends up testing
// the builder's happy path instead of the shipped one. `houses/index.js` and `modern/index.js`
// already own their assembly for their own reasons; this is a third instance of the pattern,
// and the dispatcher guard is the same three lines.
//
// The envelope arithmetic below is copied from `index.js` DELIBERATELY and is noted as such at
// the site, because these two subjects must sit on the same lot datum as `walkup-flats` — a
// walk-up whose plinth stops 0.6 m short of its neighbour's is a tell before it is anything
// else. The one figure this file does NOT inherit is the material identity, which is authored.
//
// §3.2 NINE BUCKETS, and the tenth is deliberately unreached: `roofTrim` is remapped to `iron`
// for every ornament bundle, so gutters, downpipes and ridge metal join the painted-steel
// system rather than minting a draw. Nine used: wall, wallAlt, roof, trim, iron, glass, shadow,
// ground, foliage.
//
// §5.3 EMISSIVE FLOOR, not albedo. Both subjects punch deep reveals — 0.30 m on the Beaux-Arts
// arcaded base, 0.26 m behind the Moderne ribbons — and inside a reveal the irradiance goes to
// zero, so no albedo can rescue the value. The `shadow` bucket carries a small authored EMISSIVE
// term in `tuneHeritageMaterials()`; it costs no bucket and no triangle, and it is a VALUE
// operation on a VALUE fault. The residential palette's own `configureResidentialShadowFloor`
// is already applied by `palette()` and cannot be re-entered (it guards on its own userData), so
// the floor here is additive to it rather than a replacement.

import * as THREE from 'three';
import { restyleColour } from '../style/restyle.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE, STOREY, SETBACK } from '../../core/grid.js';
import { moderneRoofFrame, moderneRoofLayout, moderneRoofServiceClears } from '../moderne-roof-r78.js';
import { MaterialLibrary, surfacesForArchetype } from '../materials.js';
import {
  box, cyl, slab, rotBox, emit, makeContext, palette, variation, PALETTE_BUCKET_CAP,
} from './core.js';
import {
  corniceRun,
  dentilCourse,
  doubleHungWindow,
  downpipe,
  frontDoor,
  gutterRun,
  openingLiner,
  parapetCap,
  projectingSill,
  speedLines,
  stringCourse,
  turnBundle,
  ventGrille,
  windowSurround,
} from './ornament.js';
import { composeLot } from './curtilage.js';
import {
  R72_CAST,
  R72_MAP_ATTRIBUTE,
  R72_PLASTER,
  R72_ROLE_ATTRIBUTE,
  R72_SHELTER,
} from './beaux-surfaces-r72.js';
import {
  R79_MAP_ATTRIBUTE,
  R79_RETIRED_GRIME,
  R79_ROLE_ATTRIBUTE,
  authorModerneHeritage,
} from './moderne-surfaces-r79.js';
import { assessLabel, reliefExtent, reliefLetters } from '../signage/index.js';

/** The ids this file owns. Nothing else in the residential kit may claim them. */
export const HERITAGE_WALKUP_ARCHETYPES = Object.freeze(new Set([
  'walkup-beaux-arts',
  'walkup-moderne',
]));

/**
 * Storeys and lot posture. Both are narrow-frontage city blocks, so the front setback is small
 * and the depth runs most of the tile — the opposite posture from a suburban walk-up.
 *
 * The storey counts are the separation, and they are architecturally honest rather than chosen
 * for a silhouette metric: the Majorca Building is a tall lane-front block and Mitchell House is
 * a squarer four-storey corner. Against `walkup-flats`'s three, the family reads 3 / 4 / 5.
 */
export const HERITAGE_WALKUP_ENVELOPE = Object.freeze({
  'walkup-beaux-arts': { storeys: 5, widthF: 0.90, depthF: 0.86, frontSetback: 0.06, party: false },
  'walkup-moderne':    { storeys: 4, widthF: 0.895, depthF: 0.82, frontSetback: 0.09, party: false },
});

// THE WIDTHS ARE A MEASURED CONSEQUENCE, NOT A TASTE. r1 built both at 0.70 / 0.84 and measured
// the LOT at 9,378 and 8,100 triangles against §3.4's 3,500 allowance. `wu-lot-sweep.mjs` found
// the cause rather than guessing at it: `curtilage.js` builds a retained flank bed with up to five
// shrubs on EACH side whenever `(lotW - bodyW) / 2 > 1.0`, and that path is outside the `planting`
// option, so a caller cannot switch it off — it alone is **1,890 triangles**, and it survived
// `planting: false`, `fence: false` and every other option in the sweep.
//
// A city walk-up on a narrow lot fills its frontage; it does not keep a 2.4 m side garden. Taking
// the buildings to 0.90 / 0.895 puts side clearance at 0.93–0.97 m at every façade variant, which
// is what the subject actually is AND takes the flank beds out. That is the opposite of §5.4's
// forbidden move: nothing was removed from the object to shift a number — the object was corrected
// and the number followed.
//
// The Moderne's width is then bound in the other direction by §3.6. Its awning wraps the rounded
// corner, so the pad constraint is `bodyW/2 + awningProjection <= 7.5` at the WIDEST façade
// variant — 6.895 + 0.58 = 7.475. The awning depth is the dependent variable in that equation and
// it yields to it; the CURVE is the identity and the curve is untouched.

/**
 * Material identity, in the sense `index.js` uses the term: the family IS the period here, so
 * the district wall bias may not turn either of these into brick.
 *
 * Both are RENDER, which is the correct family for both references — the Majorca Building's
 * modelled front and Mitchell House's smooth banded one are both render systems, not masonry
 * left exposed. The separation between them therefore cannot come from the family and has to
 * come from relief, band organisation and value, which is what §2.9 asks for anyway.
 *
 * `trim: 'concrete'` rather than the default painted metal because every dressing on the
 * Beaux-Arts front — pilaster, keystone, modillion, cornice, coping — is cast cement, and on the
 * Moderne the same bucket carries the coping, the awning fascia and the glass-brick grid.
 * Window joinery does NOT take this bucket; it is remapped to `iron` (see DETAIL_REMAP), which
 * is what keeps a pale stone dressing and a dark steel sash in two different value bands.
 */
export const HERITAGE_WALKUP_IDENTITY = Object.freeze({
  'walkup-beaux-arts': { wall: 'render', roof: 'corrugated', trim: 'concrete' },
  'walkup-moderne':    { wall: 'render', roof: 'corrugated', trim: 'concrete' },
});

/**
 * Bundle-key remap for every ornament call in this file.
 *
 * `joinery` and `roofTrim` both fold into `iron`. That is the §3.2 move: the shared library
 * hands back five or six keys and a lane that emits all of them lands at eleven buckets. Sashes,
 * gutters, downpipes, awning beads and railings are one painted-steel system on both subjects,
 * which is also true of the two references.
 */
const DETAIL_REMAP = Object.freeze({
  wall: 'wall',
  wallAlt: 'wallAlt',
  trim: 'trim',
  joinery: 'iron',
  iron: 'iron',
  roofTrim: 'iron',
  roof: 'roof',
  glass: 'glass',
  shadow: 'shadow',
});

function detail(ctx, produced, remap = null) {
  return emit(ctx, produced, remap ?? DETAIL_REMAP);
}

/**
 * The same, but every part is tagged as LOT rather than BUILDING.
 *
 * §3.4's third amendment measures the two separately — 9,000 for the building, 3,500 for the lot,
 * and neither may borrow from the other. The split is recorded HERE, at the only place a lot part
 * enters the model, rather than reconstructed afterwards from geometry names: name-prefix
 * classification is precisely what §5.4.2 records as "a name that identifies fewer things than
 * the code assumes", and `residential-lab.js`'s own framing filter is already broken by it.
 */
function emitLot(ctx, produced, remap = null) {
  const before = ctx.parts.length;
  const n = emit(ctx, produced, remap ?? DETAIL_REMAP);
  for (let i = before; i < ctx.parts.length; i += 1) ctx.parts[i].ddLot = true;
  return n;
}

/* ══════════════════════════ winding-safe surfaces, by construction ══════════════════════ */
//
// A sibling lane shipped a prism with six of eight triangles wound inward, so a third of it was
// culled and invisible. That cannot happen here: every custom face in this file is pushed through
// `surface()`, which is handed the OUTWARD direction and orders the triangle to match it. The
// winding is therefore not a thing the author has to get right — it is derived.
//
// `geometry.userData.ddExpect` records the authored outward per triangle so
// `mvp/tests/wu-winding.mjs` can re-derive the winding normal from the positions alone and assert
// the dot product is positive. That check is non-circular: `computeVertexNormals()` derives
// normals FROM the winding, so comparing a computed normal against the winding proves nothing.

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }

function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

/** A collector of outward-oriented triangles. */
function surface(name, vRange = null) {
  const positions = [];
  const expect = [];
  const uvs = [];
  // `configureResidentialGlass` ramps a pane from sill to head off `uv.y`, and falls back to a
  // fixed 0.62 where `fwidth(uv.y)` is zero — which is what a custom surface with no uv gives it.
  // Passing `vRange` authors the real height so a curved ribbon takes the same ramp a flat pane
  // does. Where it is null the attribute is left off and the merge fills zeros, which is the
  // documented `art-deco-flats` fallback rather than a new failure mode.
  const uvFor = (v) => (vRange
    ? [0.5, Math.max(0, Math.min(1, (v[1] - vRange[0]) / Math.max(1e-6, vRange[1] - vRange[0])))]
    : null);
  const pushTri = (a, b, c, outward) => {
    const n = cross(sub(b, a), sub(c, a));
    const flipped = dot(n, outward) < 0;
    const order = flipped ? [a, c, b] : [a, b, c];
    for (const v of order) {
      positions.push(...v);
      const uv = uvFor(v);
      if (uv) uvs.push(uv[0], uv[1]);
    }
    expect.push(outward[0], outward[1], outward[2]);
  };
  return {
    /** Quad a→b→c→d in order around the face; `outward` need not be normalised. */
    quad(a, b, c, d, outward) {
      pushTri(a, b, c, outward);
      pushTri(a, c, d, outward);
    },
    tri(a, b, c, outward) { pushTri(a, b, c, outward); },
    get count() { return positions.length / 9; },
    build() {
      if (!positions.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      if (uvs.length === (positions.length / 3) * 2) {
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      }
      g.computeVertexNormals();
      g.computeBoundingBox();
      g.name = name;
      g.userData.ddExpect = expect;
      MaterialLibrary.ensureUv2(g);
      return g;
    },
  };
}

/**
 * A closed annular-sector solid — the Moderne's rounded corner, one storey band at a time.
 *
 * Angles are measured from +Z toward +X, so `a0 = 0, a1 = PI/2` is the front-right quadrant.
 * Six face groups: outer, inner, top, bottom and the two radial ends. Every one is handed its
 * own outward, so the solid is closed and correctly wound at any segment count.
 */
function arcPrism({
  cx, cz, rOuter, rInner, y0, y1, a0, a1, segments = 8, name = 'arc-prism',
}) {
  const n = Math.max(1, segments | 0);
  const s = surface(name);
  const at = (r, a, y) => [cx + Math.sin(a) * r, y, cz + Math.cos(a) * r];
  const radial = (a) => [Math.sin(a), 0, Math.cos(a)];
  for (let i = 0; i < n; i += 1) {
    const aa = a0 + ((a1 - a0) * i) / n;
    const ab = a0 + ((a1 - a0) * (i + 1)) / n;
    const am = (aa + ab) / 2;
    // outer skin
    s.quad(at(rOuter, aa, y0), at(rOuter, ab, y0), at(rOuter, ab, y1), at(rOuter, aa, y1),
      radial(am));
    // inner skin, outward points back at the centre
    const inward = radial(am).map((c) => -c);
    s.quad(at(rInner, aa, y0), at(rInner, ab, y0), at(rInner, ab, y1), at(rInner, aa, y1),
      inward);
    // top and bottom rings — these ARE the ribbon's head soffit and its sill
    s.quad(at(rInner, aa, y1), at(rOuter, aa, y1), at(rOuter, ab, y1), at(rInner, ab, y1),
      [0, 1, 0]);
    s.quad(at(rInner, aa, y0), at(rOuter, aa, y0), at(rOuter, ab, y0), at(rInner, ab, y0),
      [0, -1, 0]);
  }
  // radial end caps, outward along the tangent
  const endOut = (a, sign) => [Math.cos(a) * sign, 0, -Math.sin(a) * sign];
  s.quad(at(rInner, a0, y0), at(rOuter, a0, y0), at(rOuter, a0, y1), at(rInner, a0, y1),
    endOut(a0, -1));
  s.quad(at(rInner, a1, y0), at(rOuter, a1, y0), at(rOuter, a1, y1), at(rInner, a1, y1),
    endOut(a1, 1));
  return s.build();
}

/**
 * A thin arc SKIN — one face only, for a band or a joint line applied to a curved wall. Half the
 * triangles of a prism and it never needs a back, because it is pressed against masonry.
 */
function arcSkin({
  cx, cz, radius, y0, y1, a0, a1, segments = 8, name = 'arc-skin', vRange = null,
}) {
  const n = Math.max(1, segments | 0);
  const s = surface(name, vRange);
  const at = (a, y) => [cx + Math.sin(a) * radius, y, cz + Math.cos(a) * radius];
  for (let i = 0; i < n; i += 1) {
    const aa = a0 + ((a1 - a0) * i) / n;
    const ab = a0 + ((a1 - a0) * (i + 1)) / n;
    const am = (aa + ab) / 2;
    s.quad(at(aa, y0), at(ab, y0), at(ab, y1), at(aa, y1), [Math.sin(am), 0, Math.cos(am)]);
  }
  return s.build();
}

/**
 * A flat applied face on a wall plane — a mortar line, a channel joint, a grime patch.
 * `axis: 'x'` means a face whose normal runs along Z (a front or rear wall); `axis: 'z'` means a
 * flank. `normal` is +1 or -1 along that axis.
 */
function planeFace(s, { axis, face, normal, a0, a1, y0, y1, offset = 0.010 }) {
  const plane = face + normal * offset;
  if (axis === 'x') {
    const out = [0, 0, normal];
    s.quad([a0, y0, plane], [a1, y0, plane], [a1, y1, plane], [a0, y1, plane], out);
  } else {
    const out = [normal, 0, 0];
    s.quad([plane, y0, a0], [plane, y0, a1], [plane, y1, a1], [plane, y1, a0], out);
  }
}

/* ═════════════════════════════ shared façade machinery ═════════════════════════════ */

/**
 * One punched opening. `kind` is what §3.5 reads: `door` and `window` are mischief targets.
 * `head` selects the shape of the top — the Beaux-Arts top storey is `arch`, its base is
 * `segmental`, everything else is square.
 */
function opening(x, y, width, height, kind = 'window', head = 'square') {
  return { x, y, width, height, kind, head };
}

/** Gaps left along a wall run once the openings crossing this height band are removed. */
function intervalsAround(min, max, active) {
  const out = [];
  let cursor = min;
  const sorted = active
    .map((o) => [o.x - o.width / 2, o.x + o.width / 2])
    .sort((a, b) => a[0] - b[0]);
  for (const [a, b] of sorted) {
    if (a > cursor + 0.015) out.push([cursor, Math.min(a, max)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < max - 0.015) out.push([cursor, max]);
  return out.filter(([a, b]) => b - a > 0.02);
}

/**
 * Split one wall skin around its holes, so the shared liners enter a real masonry reveal rather
 * than a decal on a solid wall. Every member is a closed slab, so winding comes from BoxGeometry.
 *
 * `thickness` IS the reveal depth the opening gets for free, before `openingLiner` adds its own.
 */
function punchedShell(ctx, {
  axis, face, normal, min, max, baseY, height, thickness, openings, material, name,
}) {
  const ys = [baseY, baseY + height];
  for (const o of openings) ys.push(o.y, o.y + o.height);
  ys.sort((a, b) => a - b);
  const levels = ys.filter((y, i) => i === 0 || Math.abs(y - ys[i - 1]) > 0.001);
  let members = 0;
  for (let i = 0; i < levels.length - 1; i += 1) {
    const y0 = levels[i];
    const y1 = levels[i + 1];
    const ym = (y0 + y1) / 2;
    const active = openings.filter((o) => o.y < ym && o.y + o.height > ym);
    for (const [a, b] of intervalsAround(min, max, active)) {
      const span = b - a;
      const centre = (a + b) / 2;
      const geometry = axis === 'x'
        ? slab(span, y1 - y0, thickness, centre, y0, face - normal * thickness / 2, `${name}-${i}`)
        : slab(thickness, y1 - y0, span, face - normal * thickness / 2, y0, centre, `${name}-${i}`);
      ctx.push(geometry, material);
      members += 1;
    }
  }
  return members;
}

/**
 * The arched head over a `head: 'arch'` opening: a voussoir ring of small radial blocks with a
 * keystone at the crown. This is what carries the Beaux-Arts top storey at board zoom — a row of
 * small alternating lights and shadows above every window, which survives when the arch itself is
 * three pixels tall.
 */
function archHead(ctx, { x, y, z, width, rise, depth = 0.13, voussoirs = 9, keystone = true }) {
  const out = { trim: [], shadow: [] };
  const r = width / 2;
  const n = Math.max(3, voussoirs | 0);
  const springY = y;
  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.5) / n;
    const a = Math.PI * t;
    const bx = x - Math.cos(a) * (r + 0.055);
    const by = springY + Math.sin(a) * (rise + 0.055);
    const tilt = a - Math.PI / 2;
    out.trim.push(rotBox(0.145, 0.30, depth, bx, by, z + depth / 2, { z: tilt }, 'voussoir'));
  }
  if (keystone) {
    out.trim.push(slab(0.24, 0.46, depth + 0.075, x, springY + rise - 0.04,
      z + (depth + 0.075) / 2, 'arch-keystone'));
  }
  // The tympanum behind the ring. Without it the arch reads as a row of blocks floating over wall.
  out.shadow.push(box(width * 0.92, rise * 0.88, 0.05, x, springY + rise * 0.44, z - 0.06,
    'arch-tympanum'));
  void ctx;
  return out;
}

/**
 * Fit a window into a punched opening: liner, sashes, glass, sill, and a surround when the
 * elevation earns one.
 *
 * `lean` is the rear/flank treatment — liner, frame ring and pane, no glazing bars and no
 * surround. That is not a fidelity dodge: a Melbourne walk-up's rear elevation genuinely has
 * plainer joinery than its front, and §3.4 says so explicitly.
 */
function fitWindow(ctx, o, {
  face, angle = 0, surround = false, sill = false, sash = '2over2', reveal = 0.26,
  lean = false, salt = 180,
}) {
  const bundle = doubleHungWindow(ctx, {
    x: o.x, y: o.y, z: face, width: o.width, height: o.height,
    reveal, sash: lean ? '1over1' : sash, curtain: lean ? 'none' : null, salt,
  });
  if (angle) turnBundle(bundle, { x: o.x, z: face, angle });
  detail(ctx, bundle);
  if (sill) {
    const s = projectingSill(ctx, { x: o.x, y: o.y - 0.10, z: face, width: o.width, projection: 0.14 });
    if (angle) turnBundle(s, { x: o.x, z: face, angle });
    detail(ctx, s, { wallAlt: 'trim' });
  }
  if (surround) {
    const frame = windowSurround(ctx, {
      x: o.x, y: o.y, z: face, width: o.width, height: o.height,
      style: 'plain', projection: 0.095, jamb: 0.125, sill: false, brackets: false,
    });
    if (angle) turnBundle(frame, { x: o.x, z: face, angle });
    detail(ctx, frame, { ...DETAIL_REMAP, trim: 'trim' });
  }
}

/**
 * The plinth course §2.3 asks for: a darker, projecting base that wraps all four elevations and
 * hides the ground intersection. Four closed slabs, so it also closes the gap between the wall
 * skin and the lot deck.
 */
function plinthCourse(ctx, {
  bodyW, bodyD, frontZ, backZ, baseY, height = 0.52, proud = 0.20, frontGap = null,
}) {
  const midZ = (frontZ + backZ) / 2;
  const frontZc = frontZ + proud / 2;
  if (!frontGap) {
    ctx.push(slab(bodyW + proud * 2, height, proud, 0, baseY, frontZc,
      'plinth-course-front'), ctx.p.wallAlt);
  } else {
    const fullW = bodyW + proud * 2;
    const gapL = frontGap.x - frontGap.width / 2;
    const gapR = frontGap.x + frontGap.width / 2;
    const leftW = gapL + fullW / 2;
    const rightW = fullW / 2 - gapR;
    if (leftW > 0.02) {
      ctx.push(slab(leftW, height, proud, (-fullW / 2 + gapL) / 2, baseY, frontZc,
        'plinth-course-front'), ctx.p.wallAlt);
    }
    if (rightW > 0.02) {
      ctx.push(slab(rightW, height, proud, (gapR + fullW / 2) / 2, baseY, frontZc,
        'plinth-course-front'), ctx.p.wallAlt);
    }
  }
  ctx.push(slab(bodyW + proud * 2, height, proud, 0, baseY, backZ - proud / 2,
    'plinth-course-rear'), ctx.p.wallAlt);
  for (const side of [-1, 1]) {
    ctx.push(slab(proud, height, bodyD, side * (bodyW / 2 + proud / 2), baseY, midZ,
      'plinth-course-flank'), ctx.p.wallAlt);
  }
}

/**
 * A seamed roof deck behind a parapet, with fascia and gutter. §2.4 wants the battens as raised
 * members with their own shadow, not a normal map, so the seams are real boxes — and on a
 * parapeted city block they are what a board camera looking down at 42° actually sees.
 */
function seamedRoofDeck(ctx, {
  bodyW, bodyD, frontZ, backZ, roofY, fall = 0.34, salt = 300, cut = null, clear = null,
  seamProfile = null, clears = null,
}) {
  const midZ = (frontZ + backZ) / 2;
  const xMax = (bodyW - 0.10) / 2;
  const zMax = frontZ - 0.05;
  const zMin = backZ + 0.05;
  // A ROOF DECK ON A ROUNDED-CORNER BUILDING IS NOT A RECTANGLE.
  //
  // Found on `walkup-moderne--three-quarter.png` at r2 as a floating grey chevron above the top
  // corner ribbon, then identified by querying the model rather than by guessing at it: the deck's
  // square corner sits 3.25 m from the arc centre against a curved parapet at 2.35, so 0.90 m of
  // deck and three standing seams project THROUGH the curve and hang in the air. §3.6's pad check
  // could not see it — 6.48 is well inside 7.50 — which is a reminder that a containment test and
  // a coherence test are different tests.
  //
  // The fix is the same two-boxes-and-a-sector the masonry core already uses, so the deck is cut
  // by the same geometry that cuts the wall.
  if (cut) {
    ctx.push(box(cut.cx + xMax, 0.16, zMax - zMin, (-xMax + cut.cx) / 2, roofY + 0.08,
      (zMin + zMax) / 2, 'roof-deck'), ctx.p.roof);
    ctx.push(box(xMax - cut.cx, 0.16, cut.cz - zMin, (cut.cx + xMax) / 2, roofY + 0.08,
      (zMin + cut.cz) / 2, 'roof-deck'), ctx.p.roof);
    ctx.push(arcPrism({
      cx: cut.cx, cz: cut.cz, rOuter: cut.r, rInner: 0.06, y0: roofY, y1: roofY + 0.16,
      a0: 0, a1: Math.PI / 2, segments: 10, name: 'roof-deck-corner',
    }), ctx.p.roof);
  } else {
    ctx.push(slab(bodyW - 0.10, 0.16, bodyD - 0.10, 0, roofY, midZ, 'roof-deck'), ctx.p.roof);
    // A shallow fall to the rear, expressed as a wedge rather than a rotation so the deck stays
    // axis-aligned under the parapet. fall <= 0 leaves the single deck plane.
    if (fall > 0) {
      ctx.push(rotBox(bodyW - 0.10, 0.10, bodyD - 0.10, 0, roofY + 0.19, midZ,
        { x: -fall / bodyD }, 'roof-fall'), ctx.p.roof);
    }
  }
  if (ctx.q === 'low') return;
  // Beaux uses the flat deck (no fall, no corner cut). Its seams are few and
  // sit on that membrane. The default curved branch keeps the original batten.
  // Moderne opts into a low roll seam; that flag does not change this default.
  const flatSeam = !cut && fall <= 0;
  const rollSeam = seamProfile === 'roll';
  const pitch = flatSeam
    ? (ctx.q === 'high' ? 2.40 : 3.20)
    : rollSeam
      ? (ctx.q === 'high' ? 1.85 : 2.55)
      : (ctx.q === 'high' ? 0.62 : 0.95);
  const seams = Math.max(2, Math.floor((bodyW - 0.6) / pitch));
  const regions = clears ?? (clear ? [clear] : null);
  for (let i = 0; i <= seams; i += 1) {
    const x = -(bodyW - 0.6) / 2 + ((bodyW - 0.6) * i) / seams;
    let z0 = midZ - (bodyD - 0.36) / 2;
    let z1 = midZ + (bodyD - 0.36) / 2;
    if (cut && x > cut.cx) {
      // the seam stops on the curve rather than crossing it
      const dx = x - cut.cx;
      const reach = Math.sqrt(Math.max(0, cut.r * cut.r - dx * dx));
      z1 = Math.min(z1, cut.cz + reach - 0.10);
      if (z1 - z0 < 0.4) continue;
    }
    let spans = [[z0, z1]];
    if (regions) {
      for (const region of regions) {
        if (!(x > region.x0 - 0.04 && x < region.x1 + 0.04)) continue;
        const next = [];
        for (const [a, b] of spans) {
          if (b <= region.z0 || a >= region.z1) next.push([a, b]);
          else {
            if (region.z0 - a > 0.4) next.push([a, region.z0]);
            if (b - region.z1 > 0.4) next.push([region.z1, b]);
          }
        }
        spans = next;
      }
    }
    for (const [a, b] of spans) {
      if (b - a < 0.4) continue;
      if (flatSeam) {
        const seamH = 0.026;
        const deckTop = roofY + 0.16;
        ctx.push(box(0.036, seamH, b - a, x, deckTop + seamH / 2, (a + b) / 2, 'roof-standing-seam'),
          ctx.p.roof);
      } else if (rollSeam) {
        const deckTop = roofY + 0.16;
        const seamH = 0.022;
        ctx.push(box(0.028, seamH, b - a, x, deckTop + seamH / 2, (a + b) / 2, 'roof-standing-seam'),
          ctx.p.roof);
      } else {
        ctx.push(box(0.075, 0.11, b - a, x, roofY + 0.22, (a + b) / 2, 'roof-standing-seam'),
          ctx.p.roof);
      }
    }
  }
  // Fascia and gutter on the rear, where the fall takes the water. The bundle's `roofTrim`
  // folds into `iron` by DETAIL_REMAP — the gutter is painted steel, not a tenth bucket.
  const g = gutterRun(ctx, {
    x: 0, y: roofY + 0.20, z: backZ - 0.04, length: bodyW - 0.20, style: 'ogee',
    depth: 0.14, fascia: true, fasciaDrop: 0.22,
  });
  turnBundle(g, { x: 0, z: backZ - 0.04, angle: Math.PI });
  detail(ctx, g);
  const d = downpipe(ctx, {
    x: -(bodyW / 2 - 0.42), z: backZ - 0.06, fromY: roofY + 0.10, toY: 0.18,
    radius: 0.058, swan: 0.14, brackets: 3, shoe: true,
  });
  turnBundle(d, { x: -(bodyW / 2 - 0.42), z: backZ - 0.06, angle: Math.PI });
  detail(ctx, d);
  void salt;
}

/* ═══════════════════════════════ wall descriptors ═══════════════════════════════ */
//
// A wall is `{ axis, face, normal, min, max }`. `axis: 'x'` is a wall whose openings run along X
// (the front and the rear); `axis: 'z'` is a flank. `normal` is +1 or -1 along the OTHER axis and
// points out of the building. Everything below places geometry through `wallBox`, so a helper
// written for the front works unchanged on a flank — which is what stops a lane building four
// elevations four different ways and only ever grading one of them.

function wall(axis, face, normal, min, max) {
  return { axis, face, normal, min, max };
}

/**
 * A closed member on a wall. `a` is the along-wall centre, `y` the vertical centre, `n` the
 * distance the member's own centre sits INSIDE the face.
 */
function wallBox(w, { a, y, along, height, depth, n = 0, name = 'wall-member' }) {
  const plane = w.face - w.normal * n;
  return w.axis === 'x'
    ? box(along, height, depth, a, y, plane, name)
    : box(depth, height, along, plane, y, a, name);
}

/** The same, sitting ON `yBase` rather than centred on `y`. */
function wallSlab(w, { a, yBase, along, height, depth, n = 0, name = 'wall-member' }) {
  return wallBox(w, { a, y: yBase + height / 2, along, height, depth, n, name });
}

/**
 * The leanest opening assembly that still satisfies §2.2 — a four-member reveal lining, a
 * four-member frame ring with real section, and a pane set back behind both. Nine boxes, 108
 * triangles, and no interior backer because the masonry core stands 0.13 m behind the pane.
 *
 * Used on every flank and rear opening on both subjects. That is an architectural decision, not a
 * budget dodge: a Melbourne walk-up's side elevation has plain joinery and no surround, and §3.4
 * says in terms that ganging or simplifying a rear elevation "usually reads better anyway".
 */
function leanWindow(ctx, w, o, { reveal = 0.24, liner = 0.06, frame = 0.09 } = {}) {
  const d = Math.max(0.10, reveal);
  const cy = o.y + o.height / 2;
  // reveal lining — the surfaces that must hold value with no irradiance reaching them
  ctx.push(wallBox(w, {
    a: o.x - o.width / 2 + liner / 2, y: cy, along: liner, height: o.height, depth: d,
    n: d / 2, name: 'lean-reveal-jamb',
  }), ctx.p.shadow);
  ctx.push(wallBox(w, {
    a: o.x + o.width / 2 - liner / 2, y: cy, along: liner, height: o.height, depth: d,
    n: d / 2, name: 'lean-reveal-jamb',
  }), ctx.p.shadow);
  ctx.push(wallBox(w, {
    a: o.x, y: o.y + o.height - liner / 2, along: o.width, height: liner, depth: d,
    n: d / 2, name: 'lean-reveal-head',
  }), ctx.p.shadow);
  ctx.push(wallBox(w, {
    a: o.x, y: o.y + liner / 2, along: o.width, height: liner, depth: d,
    n: d / 2, name: 'lean-reveal-sill',
  }), ctx.p.shadow);
  // the pane, set behind the frame
  ctx.push(wallBox(w, {
    a: o.x, y: cy, along: o.width - 0.11, height: o.height - 0.11, depth: 0.03,
    n: d, name: 'lean-pane',
  }), ctx.p.glass);
  // the frame ring, with section
  for (const hand of [-1, 1]) {
    ctx.push(wallBox(w, {
      a: o.x + hand * (o.width / 2 - liner - frame / 2), y: cy,
      along: frame, height: o.height - liner * 2, depth: 0.062,
      n: d - 0.045, name: 'lean-frame-stile',
    }), ctx.p.iron);
  }
  ctx.push(wallBox(w, {
    a: o.x, y: o.y + o.height - liner - frame / 2, along: o.width - liner * 2,
    height: frame, depth: 0.062, n: d - 0.045, name: 'lean-frame-rail',
  }), ctx.p.iron);
  ctx.push(wallBox(w, {
    a: o.x, y: o.y + o.height * 0.50, along: o.width - liner * 2,
    height: frame * 0.9, depth: 0.070, n: d - 0.050, name: 'lean-frame-meeting',
  }), ctx.p.iron);
}

/**
 * §2.5 material grunge, as geometry rather than as a wish.
 *
 * Two fields, both applied faces on the `wallAlt` bucket so they read as tonal drift in the same
 * render system rather than as a decal in a new colour: a rising damp band that thins upward from
 * the plinth, and a wash below each sill. Applied faces are 2 triangles each and they are the
 * cheapest legible grunge available — the alternative, a per-pixel map, is what §2.5 rules out.
 */
function renderGrime(ctx, w, { baseY, openings = [], salt = 320, rows = 9 }) {
  if (!ctx.detail) return;
  const s = surface('render-grime');
  const cell = 0.30;
  const rowH = 0.24;
  for (let row = 0; row < rows; row += 1) {
    const y0 = baseY + row * rowH;
    const y1 = y0 + rowH - 0.03;
    const ym = (y0 + y1) / 2;
    const active = openings.filter((o) => o.y < ym && o.y + o.height > ym);
    for (const [a, b] of intervalsAround(w.min, w.max, active)) {
      for (let x = w.min, i = 0; x < w.max; x += cell, i += 1) {
        const lo = Math.max(a, x + 0.02);
        const hi = Math.min(b, x + cell - 0.02);
        if (hi - lo < 0.09) continue;
        const density = 0.46 * (1 - row / rows) + 0.04;
        if (ctx.v.unit(salt + ((row * 23 + i * 37) % 89)) >= density) continue;
        planeFace(s, {
          axis: w.axis, face: w.face, normal: w.normal, a0: lo, a1: hi, y0, y1, offset: 0.011,
        });
      }
    }
  }
  // The wash below a sill, which is where a rendered wall in Melbourne actually stains.
  for (let i = 0; i < openings.length; i += 1) {
    const o = openings[i];
    if (o.kind !== 'window' || !ctx.v.chance(salt + 200 + i, 0.55)) continue;
    const n = ctx.v.int(salt + 240 + i, 1, 2);
    for (let j = 0; j < n; j += 1) {
      const width = ctx.v.range(salt + 280 + i * 3 + j, 0.10, 0.19);
      const drop = ctx.v.range(salt + 320 + i * 3 + j, 0.24, 0.62);
      const at = o.x + ctx.v.range(salt + 360 + i * 3 + j, -o.width * 0.34, o.width * 0.34);
      planeFace(s, {
        axis: w.axis, face: w.face, normal: w.normal,
        a0: at - width / 2, a1: at + width / 2, y0: o.y - drop, y1: o.y - 0.03, offset: 0.014,
      });
    }
  }
  const g = s.build();
  if (!g) return;
  // The two high-tier Moderne patches are named render-grime. The ledge stain
  // replaces them. Any other caller keeps the mesh.
  if (ctx.archetypeId === 'walkup-moderne' && g.name === R79_RETIRED_GRIME) {
    const triangles = g.getAttribute('position').count / 3;
    if (!ctx.r79Retired) ctx.r79Retired = [];
    ctx.r79Retired.push({ name: g.name, triangles });
    g.dispose();
    return;
  }
  ctx.push(g, ctx.p.wallAlt);
}

/* ════════════════════════════ the palette, authored against MEASURED gain ═══════════════ */
//
// §5.3.10 says re-measure rather than quote the table, and §5.0 says author against the RENDERED
// value, never the hex. `mvp/tests/wu-family-gain.mjs` measures the map this lane's materials
// actually sample — the residential ATLAS REGION bound as a shader uniform, not `map.offset`,
// which is the trap the probe's own first pass fell into and reported six families as one number.
//
// Measured on this checkout, 2026-08-18, luma of the region mean:
//
//   family          srgbGain   linear(mean)   mean(linear)   published §5.0
//   render            0.742       0.5110         0.5115         0.60
//   painted_metal     0.717       0.4730         0.4735         (not published)
//   corrugated        0.612       0.3326         0.3328         0.40  ("corrugation")
//   concrete          0.580       0.2961         0.2969         0.29
//   foliage           0.388       0.1338         0.1365         0.10
//   brick             0.895       0.7786         0.8082         0.29
//   glass, shadow     1.0 — `palette()` nulls their maps, so the authored colour IS the albedo
//
// Two findings worth the lines. **The published table is not measuring these materials**: it
// reproduces on `concrete` (0.29 against 0.296) because `concrete` is the one family here still
// on the base `TextureLibrary` 512² map, and misses badly on `brick` (0.29 against 0.78) and
// `foliage` (0.10 against 0.134) because those come from the residential ATLAS, which is a
// different texture with a different mean. A lane quoting the table for an atlas family authors
// against a number that was never measured on it. **And `linear(mean)` vs `mean(linear)` — the
// §5.3.10 mechanism — is real but small here**: 0.5 % on render, 2.0 % on foliage, 3.8 % on
// brick, in the direction §5.3.10 predicts (the high-variance maps diverge most).
//
// So the authoring rule used below is `effective ≈ authoredLuma × srgbGain`, and every target is
// stated as an EFFECTIVE albedo rather than as a hex.
//
// §2.9 NINE VALUE BANDS. Seven are set by albedo × gain and are computable; `glass` and `shadow`
// are set by the lane's own outgoing-radiance mechanisms and are in different units:
//
//   glass   `configureResidentialGlass` ramps the pane from sill to head as a shader uniform pair
//           and floors it at linear 0.038 — this IS §5.3's emissive-floor technique, already
//           implemented in this lane, and it is used rather than re-derived.
//   shadow  `configureResidentialShadowFloor` clamps outgoing light at linear 0.060, iron at
//           0.030. A reveal lining therefore cannot render at zero however little irradiance
//           reaches it, which is exactly §5.3's argument — the fix is a VALUE floor on a VALUE
//           fault, and no chroma operation was applied to it.
//
// Both floors are already applied by `palette()` and both guard on their own `userData`, so they
// cannot be re-entered from here. Nothing below adds a second, competing floor.

const HERITAGE_PALETTE = Object.freeze({
  // BEAUX-ARTS — a warm cream render field, ochre rustication, cast-cement dressings.
  // effective:  wall 170 | trim 135 | ground 110 | wallAlt 90 | foliage 73 | roof 55 | iron 37
  'walkup-beaux-arts': Object.freeze({
    wall:    '#F2E4C8',
    // A GREY-BROWN STONE, not the ochre r1 authored. `walkup-beaux-arts--board.png`, opened, put a
    // strongly orange rusticated base under a cream front and the two read as different materials
    // rather than as one building's base and body. `hb-beauxarts-three-quarter.png` runs its base
    // a desaturated warm grey a value below the render. Effective drops 105 → 90, which also opens
    // the gap to `ground` at 110 from 5 to 20.
    wallAlt: '#85786A',
    trim:    '#EFE8D6',
    get ground() { return restyleColour('#C2BCB0', '#fdf5e5', { id: 'building:walkup-beaux-arts.ground' }); },
    get roof() { return restyleColour('#565B5D', '#bcc7cb', { id: 'building:walkup-beaux-arts.roof' }); },
    iron:    '#2F3532',
    foliage: '#A7C552',
  }),
  // MODERNE — a cool near-white render banded with a bottle-green spandrel. The banding is the
  // separator: `wallAlt` is a MID on the Beaux-Arts (88) and a DARK here (40), so the two
  // subjects do not merely differ in ornament, they differ in where their second wall value sits.
  // effective:  wall 178 | trim 133 | ground 100 | foliage 73 | roof 55 | wallAlt 40 | iron 29
  'walkup-moderne': Object.freeze({
    get wall() { return restyleColour('#F6F2E8', '#fffbf0', { id: 'building:walkup-moderne.wall' }); },
    wallAlt: '#2E3A33',
    trim:    '#E7E4DA',
    get ground() { return restyleColour('#B1ACA2', '#e6e0d3', { id: 'building:walkup-moderne.ground' }); },
    get roof() { return restyleColour('#565B5D', '#98a1a5', { id: 'building:walkup-moderne.roof' }); },
    iron:    '#232A2C',
    foliage: '#A7C552',
  }),
});

/**
 * Repaint the archetype's own materials. Safe because `palette()` caches on
 * `res-<bucket>-<archetypeId>-<districtId>-f<facade>`, so these objects belong to one archetype
 * on one parcel façade and a tint here cannot leak into another lane or another subject.
 *
 * Colour only — no map, roughness, floor or environment response is touched, because those are
 * the lane's calibrated response and §4.9 pins the rig.
 */
const HOSPITALITY_PALETTE = Object.freeze({
  hotel: Object.freeze({
    wall: '#E6C48A',
    wallAlt: '#6A4A28',
    trim: '#C9A227',
    iron: '#8A5A22',
    roof: '#4A3A28',
  }),
  luxe: Object.freeze({
    wall: '#F0D7A4',
    wallAlt: '#7A5824',
    trim: '#D4AF37',
    iron: '#9A6A28',
    roof: '#4A4030',
  }),
});

function dressHospitality(ctx, kind) {
  const overlay = HOSPITALITY_PALETTE[kind];
  if (!overlay) return;
  for (const [bucket, hex] of Object.entries(overlay)) {
    const m = ctx.p[bucket];
    if (!m) continue;
    m.color.set(hex);
    m.userData.residentialTargetColor = hex;
    m.needsUpdate = true;
  }
  const { frontZ, wallH } = ctx.env;
  const word = kind === 'hotel' ? 'HOTEL' : 'RESIDENCES';
  heritageName(ctx, {
    text: word,
    x: 0,
    y: wallH - 1.15,
    z: frontZ + 0.22,
    cap: 0.28,
    maxWidth: 3.4,
    depth: 0.06,
    panel: true,
  });
}

function tuneHeritageMaterials(ctx) {
  const scheme = HERITAGE_PALETTE[ctx.archetypeId];
  if (!scheme) return;
  for (const [bucket, hex] of Object.entries(scheme)) {
    const m = ctx.p[bucket];
    if (!m) continue;
    m.color.set(hex);
    m.userData.residentialTargetColor = hex;
    m.needsUpdate = true;
  }
}

/* ═══════════════════════════ 1 — the Beaux-Arts walk-up ═══════════════════════════ */
//
// After the Majorca Building, Flinders Lane: a narrow, tall, richly modelled render front on a
// city lot. The identity is ORNAMENT, and the discipline that follows from that is a board-zoom
// discipline — every enrichment here is sized so it survives as a rhythm of light and shadow when
// the individual member is two pixels. That is why the modillions are 0.26 m blocks at 0.62 m
// pitch rather than 0.10 m dentils at 0.20 m, and why the rustication is eight PROJECTING courses
// rather than eight incised lines: a projecting course casts; an incised line is a texture.
//
// Each flank is two recessed bays, not a flat grid. The bay skin sits
// BEAUX_FLANK_RECESS metres inside the lot wall; corner piers and the pier
// between the pairs stay on that wall. 0.55 is inside the 0.45–0.65 m brief.
const BEAUX_FLANK_RECESS = 0.55;

function beauxArtsBays(ctx) {
  const { bodyW } = ctx.env;
  const pairW = 0.96;
  const bays = 3;
  const bayW = (bodyW - pairW * (bays + 1)) / bays;
  return {
    pairW,
    bays,
    bayW,
    /** Centre of pilaster PAIR k, k = 0..3. */
    divX: (k) => -bodyW / 2 + pairW / 2 + k * (pairW + bayW),
    /** Centre of bay j, j = 0..2. */
    bayX: (j) => -bodyW / 2 + pairW + bayW / 2 + j * (pairW + bayW),
  };
}

/** The opening schedule, published so `wu-geom.mjs` counts the same holes the builder punches. */
export function beauxArtsOpenings(ctx) {
  const { bodyW, bodyD, frontZ, backZ, wallH } = ctx.env;
  const baseY = 0.14;
  const baseH = 3.70;
  const upperH = (wallH - baseH) / 4;
  const b = beauxArtsBays(ctx);
  const front = [];
  front.push(opening(b.bayX(1), baseY + 0.06, 1.98, 3.02, 'door', 'arch'));
  for (const j of [0, 2]) {
    front.push(opening(b.bayX(j), baseY + 0.98, 1.96, 2.14, 'window', 'segmental'));
  }
  for (let i = 0; i < 4; i += 1) {
    const fy = baseY + baseH + upperH * i;
    const top = i === 3;
    for (let j = 0; j < 3; j += 1) {
      front.push(opening(b.bayX(j), fy + 0.66, 1.92, top ? 1.86 : 2.08, 'window',
        top ? 'arch' : 'square'));
    }
  }
  // Four flank bays, five storeys. A 12.9 m deep flank takes four bays at a 3.0 m rhythm and a
  // real walk-up on a detached lot glazes them; this is the schedule, not a budget choice, and
  // the count it produces is reported rather than trimmed to fit a threshold.
  const side = [];
  for (let k = 0; k < 4; k += 1) {
    const z = backZ + 1.05 + ((bodyD - 2.1) * k) / 3;
    side.push(opening(z, baseY + 0.98, 1.28, 2.02, 'window', 'square'));
    for (let i = 0; i < 4; i += 1) {
      side.push(opening(z, baseY + baseH + upperH * i + 0.66, 1.28, 1.94, 'window', 'square'));
    }
  }
  // The rear is GANGED — two wide openings a storey instead of three narrow ones. §3.4 names this
  // as an architectural decision a lane may take on its own judgement, and on a rear elevation a
  // wide stair-and-landing light is what is actually there.
  const rear = [];
  for (const x of [-bodyW * 0.235, bodyW * 0.235]) {
    rear.push(opening(x, baseY + 1.02, 2.30, 1.96, 'window', 'square'));
    for (let i = 0; i < 4; i += 1) {
      rear.push(opening(x, baseY + baseH + upperH * i + 0.70, 2.30, 1.86, 'window', 'square'));
    }
  }
  void frontZ;
  return { front, side, rear, baseY, baseH, upperH, bays: b };
}

/** Shell, base, order and entablature. Split from the crown only to keep two readable halves. */
function beauxArtsShell(ctx, sched) {
  const { bodyW, bodyD, frontZ, backZ, wallH } = ctx.env;
  const { baseY, baseH, upperH, bays: b } = sched;
  const shellT = 0.36;
  const midZ = (frontZ + backZ) / 2;
  const roofY = baseY + wallH;

  const frontW = wall('x', frontZ, 1, -bodyW / 2, bodyW / 2);
  const rearW = wall('x', backZ, -1, -bodyW / 2, bodyW / 2);
  const leftW = wall('z', -bodyW / 2, -1, backZ, frontZ);
  const rightW = wall('z', bodyW / 2, 1, backZ, frontZ);

  // The masonry core. Every pane on the building has this behind it, which is why no opening in
  // this file carries an interior backer — 65 backers at 12 triangles is 780 triangles for a
  // surface one solid box already provides.
  // Flank inset follows the recessed bay skin so the core stays behind the glass.
  // Front and rear keep the original 0.41 m backing.
  const flankInset = BEAUX_FLANK_RECESS + shellT + 0.08;
  ctx.push(box(bodyW - flankInset * 2, wallH, bodyD - shellT * 2 - 0.10, 0,
    baseY + wallH / 2, midZ, 'beaux-masonry-core'), ctx.p.wall);

  punchedShell(ctx, {
    ...frontW, baseY, height: wallH, thickness: shellT, openings: sched.front,
    material: ctx.p.wall, name: 'beaux-front-shell',
  });
  punchedShell(ctx, {
    ...rearW, baseY, height: wallH, thickness: shellT, openings: sched.rear,
    material: ctx.p.wall, name: 'beaux-rear-shell',
  });
  // Flank shells are built with the bays below. A full-height outer skin here
  // would put the recessed wall behind a second flat plane.

  /* ── the rusticated base ── */
  // Eight projecting courses with a 0.08 m recess between them. Reads at board zoom as eight
  // horizontal shadow lines under the whole of the first storey, which is the single strongest
  // identity cue the base has.
  const courseH = 0.38;
  const coursePitch = 0.46;
  const groundOpenings = sched.front.filter((o) => o.y < baseY + baseH);
  const courses = Math.floor((baseH - 0.30) / coursePitch);
  for (let c = 0; c < courses; c += 1) {
    const y = baseY + 0.08 + c * coursePitch;
    const ym = y + courseH / 2;
    const active = groundOpenings.filter((o) => o.y < ym && o.y + o.height > ym);
    for (const [a, e] of intervalsAround(-bodyW / 2, bodyW / 2, active)) {
      ctx.push(slab(e - a, courseH, 0.11, (a + e) / 2, y, frontZ + 0.055, 'rustic-course'),
        ctx.p.wallAlt);
    }
    // Returns around both front corners so the base does not stop dead at the arris.
    for (const hand of [-1, 1]) {
      ctx.push(slab(0.11, courseH, 0.62, hand * (bodyW / 2 + 0.055), y, frontZ - 0.31,
        'rustic-return'), ctx.p.wallAlt);
    }
  }
  // The band that closes the base and springs the pilaster order.
  detail(ctx, stringCourse(ctx, {
    x: 0, y: baseY + baseH - 0.14, z: frontZ + 0.02, length: bodyW + 0.12,
    height: 0.30, projection: 0.20,
  }), { ...DETAIL_REMAP, trim: 'trim' });
  plinthCourse(ctx, { bodyW, bodyD, frontZ, backZ, baseY, height: 0.56, proud: 0.20 });

  /* ── the pilaster order ── */
  const pilY = baseY + baseH + 0.26;
  const pilH = wallH - baseH - 1.32;
  for (let k = 0; k < 4; k += 1) {
    for (const s of [-1, 1]) {
      const px = b.divX(k) + s * (b.pairW / 2 - 0.235);
      ctx.push(slab(0.44, pilH, 0.17, px, pilY, frontZ + 0.085, 'pilaster-shaft'), ctx.p.trim);
      ctx.push(slab(0.56, 0.22, 0.23, px, pilY - 0.22, frontZ + 0.115, 'pilaster-base'), ctx.p.trim);
      ctx.push(slab(0.58, 0.30, 0.27, px, pilY + pilH, frontZ + 0.135, 'pilaster-capital'), ctx.p.trim);
      // One incised flute, in the shadow bucket, which is floored at linear 0.060 — a recess
      // authored on `wall` would have gone to zero here and taken the pilaster's modelling
      // with it. Value fault, value fix.
      if (ctx.detail) {
        ctx.push(slab(0.11, pilH - 0.34, 0.045, px, pilY + 0.17, frontZ + 0.150,
          'pilaster-flute'), ctx.p.shadow);
      }
    }
  }

  /* ── the spandrel panels ── */
  for (let i = 1; i < 4; i += 1) {
    const fy = baseY + baseH + upperH * i;
    for (let j = 0; j < 3; j += 1) {
      const cx = b.bayX(j);
      const w = b.bayW - 0.62;
      const h = 0.52;
      const y0 = fy - 0.66;
      ctx.push(slab(w, h, 0.07, cx, y0, frontZ + 0.035, 'spandrel-field'), ctx.p.wallAlt);
      for (const hand of [-1, 1]) {
        ctx.push(slab(0.09, h + 0.14, 0.12, cx + hand * (w / 2 + 0.045), y0 - 0.07,
          frontZ + 0.06, 'spandrel-bead'), ctx.p.trim);
      }
      ctx.push(slab(w + 0.18, 0.09, 0.12, cx, y0 - 0.07, frontZ + 0.06, 'spandrel-bead'), ctx.p.trim);
      ctx.push(slab(w + 0.18, 0.09, 0.12, cx, y0 + h + 0.05, frontZ + 0.06, 'spandrel-bead'), ctx.p.trim);
      if (ctx.detail) {
        // A HORIZONTAL CARTOUCHE, not the diagonal lozenge r1 built. On
        // `walkup-beaux-arts--three-quarter.png` the rotated square plus its two bay beads read
        // as a bow tie across the middle of every bay — nine of them, and it is the first thing
        // the eye finds. The reference carries a swag: a horizontal element with weighted ends.
        ctx.push(slab(w * 0.52, 0.16, 0.10, cx, y0 + h / 2 - 0.08, frontZ + 0.115,
          'spandrel-swag'), ctx.p.trim);
        for (const hand of [-1, 1]) {
          ctx.push(slab(0.17, 0.26, 0.12, cx + hand * w * 0.26, y0 + h / 2 - 0.14,
            frontZ + 0.115, 'spandrel-swag-boss'), ctx.p.trim);
        }
      }
    }
  }

  /* ── the entablature: architrave, modillions, cornice ── */
  const entabY = baseY + wallH - 0.98;
  detail(ctx, stringCourse(ctx, {
    x: 0, y: entabY, z: frontZ + 0.02, length: bodyW + 0.10, height: 0.20, projection: 0.13,
  }), { ...DETAIL_REMAP, trim: 'trim' });
  detail(ctx, dentilCourse(ctx, {
    x: 0, y: entabY + 0.30, z: frontZ + 0.02, length: bodyW,
    size: 0.26, pitch: 0.62, height: 0.30, projection: 0.32, bed: true,
  }));
  detail(ctx, corniceRun(ctx, {
    x: 0, y: entabY + 0.68, z: frontZ + 0.02, length: bodyW, height: 0.34,
    projection: 0.42, returns: 0.70,
  }));
  // The flanks and the rear take a plain cornice band. A modillion course on an elevation the
  // board camera reaches once in four rotations is 250 triangles for nothing.
  for (const w of [leftW, rightW]) {
    // Two bays: stacks 0–1 and 2–3. The skin of each bay is the punched shell,
    // set in by BEAUX_FLANK_RECESS. Corner piers and the centre pier stay on
    // the original wall face and their sides are the masonry returns. The
    // piece count matches the old flat shell plus its thirteen dressings, so
    // the flank does not add a triangle. Same wall / wallAlt / trim buckets.
    const recess = BEAUX_FLANK_RECESS;
    const embed = recess + 0.03;
    const recessed = { ...w, face: w.face - w.normal * recess };
    const groundSill = Math.min(...sched.side.map((o) => o.y));
    ctx.push(wallSlab(w, {
      a: midZ, yBase: baseY, along: bodyD, height: groundSill - baseY,
      depth: recess, n: recess / 2, name: 'beaux-flank-base',
    }), ctx.p.wall);
    punchedShell(ctx, {
      ...recessed, baseY: groundSill, height: roofY - groundSill, thickness: shellT,
      openings: sched.side, material: ctx.p.wall, name: 'beaux-flank-shell',
    });

    const stacks = [...new Set(sched.side.map((o) => o.x))].sort((a, b) => a - b);
    const halfW = sched.side[0].width / 2;
    const pad = 0.025;
    const piers = [
      [w.min, stacks[0] - halfW],
      [stacks[1] + halfW, stacks[2] - halfW],
      [stacks[3] + halfW, w.max],
    ];
    const head = entabY + 0.62;
    const capitalH = 0.24;
    const spring = baseY + 0.56;
    for (const [z0, z1] of piers) {
      const a0 = z0 + pad;
      const a1 = z1 - pad;
      const along = a1 - a0;
      const a = (a0 + a1) / 2;
      ctx.push(wallSlab(w, {
        a, yBase: spring, along, height: groundSill - spring,
        depth: embed + 0.02, n: (embed - 0.02) / 2,
        name: 'beaux-flank-pilaster-base',
      }), ctx.p.wallAlt);
      ctx.push(wallSlab(w, {
        a, yBase: groundSill, along, height: head - capitalH - groundSill,
        depth: embed, n: embed / 2, name: 'beaux-flank-pilaster-shaft',
      }), ctx.p.wall);
      ctx.push(wallSlab(w, {
        a, yBase: head - capitalH, along, height: capitalH,
        depth: embed + 0.02, n: (embed - 0.02) / 2,
        name: 'beaux-flank-pilaster-capital',
      }), ctx.p.trim);
    }

    // The front order turns the corner: a trim face on the short front pier,
    // proud of the masonry, stopping at the first opening.
    const frontPier = piers[piers.length - 1];
    const frontAlong = frontPier[1] - frontPier[0] - pad * 2;
    if (frontAlong > 0.12) {
      ctx.push(wallSlab(w, {
        a: (frontPier[0] + frontPier[1]) / 2,
        yBase: spring,
        along: frontAlong,
        height: head - spring,
        depth: 0.10,
        n: -0.02,
        name: 'beaux-flank-corner-return',
      }), ctx.p.trim);
    }

    // Each recessed pair keeps a clear centre. Continuous trim stiles stand
    // in the masonry between its two window columns, from the base to the
    // crown, so the pair reads as one bay rather than a stack of stripes.
    const stile = 0.20;
    const groups = [[0, 1], [2, 3]];
    for (const [i0, i1] of groups) {
      const jambs = [
        stacks[i0] + halfW + 0.08 + stile / 2,
        stacks[i1] - halfW - 0.08 - stile / 2,
      ];
      if (jambs[1] - jambs[0] < 0.35) continue;
      for (const a of jambs) {
        ctx.push(wallSlab(w, {
          a,
          yBase: groundSill,
          along: stile,
          height: head - groundSill,
          depth: 0.22,
          n: 0.47,
          name: 'beaux-flank-bay-stile',
        }), ctx.p.trim);
      }
      const z0 = stacks[i0] - halfW;
      const z1 = stacks[i1] + halfW;
      ctx.push(wallSlab(w, {
        a: (z0 + z1) / 2,
        yBase: groundSill - 0.16,
        along: z1 - z0,
        height: 0.16,
        depth: 0.20,
        n: 0.30,
        name: 'beaux-flank-base-cap',
      }), ctx.p.trim);
      const tops = sched.side.filter((o) => o.x === stacks[i0] || o.x === stacks[i1]);
      const top = Math.max(...tops.map((o) => o.y + o.height));
      const frieze = Math.min(head - 0.08, Math.max(top + 0.06, head - 0.22));
      if (head - frieze >= 0.08) {
        ctx.push(wallSlab(w, {
          a: (z0 + z1) / 2,
          yBase: frieze,
          along: z1 - z0,
          height: head - frieze,
          depth: 0.18,
          n: 0.46,
          name: 'beaux-flank-bay-crown',
        }), ctx.p.trim);
      }
    }

    // Outer lip stays 0.24 m proud, the same as the previous cornice. The
    // inner edge lands on the bay skin so the crown is not a floating band.
    ctx.push(wallSlab(w, {
      a: midZ, yBase: head, along: bodyD, height: 0.30, depth: 0.82, n: 0.17,
      name: 'flank-cornice',
    }), ctx.p.trim);
  }
  ctx.push(wallSlab(rearW, {
    a: 0, yBase: entabY + 0.62, along: bodyW, height: 0.30, depth: 0.26, n: -0.11,
    name: 'rear-cornice',
  }), ctx.p.trim);
}

const BEAUX_DECK_LIFT = 0.05;

/** The crown: parapet, roof deck, the building's name, and the entry. */
function beauxArtsCrown(ctx, sched) {
  const { bodyW, bodyD, frontZ, backZ, wallH } = ctx.env;
  const { baseY, bays: b } = sched;
  const roofY = baseY + wallH;
  const parH = 1.42;
  const midZ = (frontZ + backZ) / 2;

  // One deck plane behind the front crown. The rear service head is added
  // by the Beaux-only apartment adapter, on this footprint, not as a second crown.
  const serviceW = Math.min(3.2, bodyW * 0.36);
  const serviceD = Math.min(2.4, bodyD * 0.20);
  const serviceX = 0;
  const serviceZ = backZ + 0.95 + serviceD / 2;
  ctx.beauxRoofService = {
    x: serviceX,
    z: serviceZ,
    w: serviceW,
    d: serviceD,
    rearZ: backZ - 0.04,
    outletY: roofY + 0.20,
    roofW: bodyW,
    roofD: bodyD,
  };
  // The deck stands BEAUX_DECK_LIFT proud of the wall heads. Laid with its top on roofY it was
  // coplanar with the masonry core and the shell heads under it (149 m2 of shared plane on the
  // facade-0 build, 3 Nov 2026), and the render showed through the corrugated sheet in shards.
  // At the 1 m near plane a 24-bit depth buffer resolves about 2 cm at 600 m.
  seamedRoofDeck(ctx, {
    bodyW, bodyD, frontZ, backZ, roofY: roofY - 0.16 + BEAUX_DECK_LIFT, fall: 0,
    clear: {
      x0: serviceX - serviceW / 2 - 0.22,
      x1: serviceX + serviceW / 2 + 0.22,
      z0: serviceZ - serviceD / 2 - 0.22,
      z1: serviceZ + serviceD / 2 + 0.22,
    },
  });

  // A PANELLED parapet, not a plain wall with a cap. Three sunk panels over the three bays, and
  // the panel frames are what carry it at distance.
  // A BALUSTRADED front parapet, and the change is a plate read.
  // `hb-beauxarts-three-quarter.png` (opened 2026-08-18) crowns its front with an open BALUSTRADE
  // running between solid panelled piers, not with the solid panelled wall r1 built — and the
  // difference is a silhouette difference, because sky shows between the balusters and the roof
  // deck, the water tank and the vent stacks read through it. The flanks and the rear keep the
  // solid parapet, exactly as the plate does.
  ctx.push(slab(bodyW, 0.34, 0.30, 0, roofY, frontZ - 0.15, 'parapet-front-plinth'), ctx.p.wall);
  for (const w of [wall('z', -bodyW / 2, -1, backZ, frontZ), wall('z', bodyW / 2, 1, backZ, frontZ)]) {
    // Same outer face and top as before. The foot drops onto the cornice and
    // the inner face meets the recessed bay skin.
    ctx.push(wallSlab(w, {
      a: midZ, yBase: roofY - 0.06, along: bodyD, height: parH - 0.24, depth: 0.58, n: 0.29,
      name: 'parapet-flank',
    }), ctx.p.wall);
  }
  ctx.push(slab(bodyW, parH - 0.30, 0.30, 0, roofY, backZ + 0.15, 'parapet-rear'), ctx.p.wall);
  for (let j = 0; j < 3; j += 1) {
    const cx = b.bayX(j);
    const w = b.bayW - 0.14;
    ctx.push(slab(w, 0.14, 0.34, cx, roofY + 0.34, frontZ - 0.15, 'balustrade-lower-rail'),
      ctx.p.trim);
    ctx.push(slab(w, 0.17, 0.36, cx, roofY + parH - 0.17, frontZ - 0.15,
      'balustrade-top-rail'), ctx.p.trim);
    const n = Math.max(3, Math.round(w / 0.34));
    const step = w / n;
    for (let i = 0; i < n; i += 1) {
      const bx = cx - w / 2 + step * (i + 0.5);
      // Three stacked members rather than a lathed profile: a baluster's read at board zoom is a
      // waisted light-dark-light rhythm, and three boxes deliver it for 36 triangles.
      ctx.push(slab(0.135, 0.09, 0.20, bx, roofY + 0.48, frontZ - 0.15, 'baluster-foot'),
        ctx.p.trim);
      ctx.push(slab(0.098, parH - 0.74, 0.155, bx, roofY + 0.57, frontZ - 0.15, 'baluster-shaft'),
        ctx.p.trim);
      ctx.push(slab(0.135, 0.09, 0.20, bx, roofY + parH - 0.26, frontZ - 0.15, 'baluster-neck'),
        ctx.p.trim);
    }
  }
  // Piers over each pilaster pair, so the vertical order runs through the parapet rather than
  // stopping under it. This is the move that keeps the silhouette from being a flat lid.
  for (let k = 0; k < 4; k += 1) {
    ctx.push(slab(b.pairW + 0.10, parH + 0.28, 0.40, b.divX(k), roofY, frontZ - 0.10,
      'parapet-pier'), ctx.p.wall);
    ctx.push(slab(b.pairW + 0.34, 0.20, 0.52, b.divX(k), roofY + parH + 0.28, frontZ - 0.10,
      'parapet-pier-cap'), ctx.p.trim);
  }
  // The coping runs on the FLANKS and the rear, where the parapet is solid. Across the front it
  // would cap an open balustrade, which is not what a balustrade does.
  for (const w of [wall('z', -bodyW / 2, -1, backZ, frontZ), wall('z', bodyW / 2, 1, backZ, frontZ)]) {
    ctx.push(wallSlab(w, {
      a: midZ, yBase: roofY + parH - 0.30, along: bodyD, height: 0.16, depth: 0.65, n: 0.255,
      name: 'parapet-coping-flank',
    }), ctx.p.trim);
  }
  ctx.push(slab(bodyW, 0.16, 0.44, 0, roofY + parH - 0.30, backZ + 0.15,
    'parapet-coping-rear'), ctx.p.trim);

  // THE NAME TABLET, AND ITS SIZE IS AN `assessLabel()` RESULT RATHER THAN A PREFERENCE.
  //
  // r1 put the name inside a parapet panel, which held a 0.60 m cap and measured blank-plate at
  // BOTH board stations. A raised central tablet is a standard Beaux-Arts parapet device and it
  // is also the only element on this elevation that can carry a cap large enough to matter: at
  // 0.78 m the word reads `marginal` at the shipped 190 m station — "lettering, not a word",
  // which for a building name is the right payload — and blank-plate at the graded 319 m, which
  // is reported rather than claimed away.
  const tabletW = Math.min(bodyW * 0.46, b.bayW + b.pairW * 1.6);
  ctx.push(slab(tabletW, 1.24, 0.44, 0, roofY + parH + 0.14, frontZ - 0.12,
    'parapet-tablet'), ctx.p.wall);
  ctx.push(slab(tabletW + 0.26, 0.16, 0.56, 0, roofY + parH + 1.38, frontZ - 0.12,
    'parapet-tablet-cap'), ctx.p.trim);
  heritageName(ctx, {
    text: 'ALBION',
    x: 0, y: roofY + parH + 0.44, z: frontZ + 0.115, cap: 0.78,
    maxWidth: tabletW - 0.55, depth: 0.06,
  });

  beauxArtsEntry(ctx, sched);
}

/**
 * The entry, and the one §3.5 mischief target on this subject.
 *
 * `frontDoor` builds a fixed leaf, so the leaf is built here instead and published under
 * `model.openings` with its hinge pivot on the left stile — `board.js` translates the parts by
 * `-pivot` and rotates a hinge group, so the geometry is authored in model space.
 */
function beauxArtsEntry(ctx, sched) {
  const { frontZ } = ctx.env;
  const door = sched.front.find((o) => o.kind === 'door');
  if (!door) return;
  const { x, y, width, height } = door;
  const reveal = 0.30;

  // reveal lining and the arch over it
  detail(ctx, openingLiner(ctx, {
    x, y, z: frontZ, width, height, reveal, back: false,
  }));
  detail(ctx, archHead(ctx, {
    x, y: y + height, z: frontZ + 0.02, width: width + 0.30, rise: 0.72, depth: 0.16,
    voussoirs: 11, keystone: true,
  }));
  // the architrave and the pedimented head — the entry has to out-rank fourteen windows
  for (const hand of [-1, 1]) {
    ctx.push(slab(0.26, height + 0.10, 0.20, x + hand * (width / 2 + 0.13), y,
      frontZ + 0.10, 'entry-architrave'), ctx.p.trim);
  }
  ctx.push(slab(width + 0.92, 0.24, 0.30, x, y - 0.34, frontZ + 0.15, 'entry-threshold'),
    ctx.p.ground);
  ctx.push(slab(width + 0.66, 0.20, 0.28, x, y + height + 0.78, frontZ + 0.14,
    'entry-hood'), ctx.p.trim);

  // fanlight over the leaf
  const leafH = height - 0.72;
  ctx.push(box(width - 0.24, 0.58, 0.04, x, y + leafH + 0.34, frontZ - reveal,
    'entry-fanlight'), ctx.p.glass);
  ctx.push(box(width - 0.18, 0.10, 0.09, x, y + leafH + 0.03, frontZ - reveal + 0.05,
    'entry-transom'), ctx.p.iron);

  // the operable leaf
  const pivotX = x - (width - 0.22) / 2;
  const leaf = [];
  const leafW = width - 0.22;
  leaf.push({
    geometry: box(leafW, leafH, 0.085, x, y + leafH / 2, frontZ - reveal + 0.06, 'entry-leaf'),
    material: ctx.p.iron,
  });
  for (const yy of [0.30, 0.66]) {
    leaf.push({
      geometry: box(leafW - 0.30, leafH * 0.28, 0.05, x, y + leafH * yy,
        frontZ - reveal + 0.115, 'entry-leaf-panel'),
      material: ctx.p.trim,
    });
  }
  leaf.push({
    geometry: cyl(0.05, 0.22, x + leafW / 2 - 0.18, y + leafH * 0.46,
      frontZ - reveal + 0.16, 'z', 'entry-handle', 6),
    material: ctx.p.trim,
  });
  for (const part of leaf) ctx.push(part.geometry, part.material);
  ctx.openings.push({
    id: 'front-door',
    kind: 'door',
    label: 'Front door',
    pivot: { x: pivotX, y: y + leafH / 2, z: frontZ - reveal + 0.06 },
    axis: 'y',
    openAngle: -1.15,
    parts: leaf,
    pick: { cx: leafW * 0.45, cy: 0, cz: 0.10, w: leafW, h: leafH, d: 0.40 },
  });
}

function buildBeauxArts(ctx) {
  tuneHeritageMaterials(ctx);
  const { bodyW, bodyD, frontZ, backZ, wallH, facade } = ctx.env;
  const sched = beauxArtsOpenings(ctx);
  const { baseY } = sched;

  beauxArtsShell(ctx, sched);
  beauxArtsCrown(ctx, sched);

  const frontW = wall('x', frontZ, 1, -bodyW / 2, bodyW / 2);
  const rearW = wall('x', backZ, -1, -bodyW / 2, bodyW / 2);
  const leftW = wall('z', -bodyW / 2, -1, backZ, frontZ);
  const rightW = wall('z', bodyW / 2, 1, backZ, frontZ);

  // the front joinery — the fifteen openings a critic actually reads
  for (let i = 0; i < sched.front.length; i += 1) {
    const o = sched.front[i];
    if (o.kind === 'door') continue;
    fitWindow(ctx, o, {
      face: frontZ, surround: true, sill: true, sash: '6over6', reveal: 0.28,
      salt: 420 + i * 3 + facade,
    });
    if (o.head === 'arch') {
      detail(ctx, archHead(ctx, {
        x: o.x, y: o.y + o.height, z: frontZ + 0.02, width: o.width + 0.22,
        rise: 0.60, depth: 0.14, voussoirs: 9, keystone: true,
      }));
    } else if (o.head === 'segmental') {
      detail(ctx, archHead(ctx, {
        x: o.x, y: o.y + o.height, z: frontZ + 0.02, width: o.width + 0.26,
        rise: 0.34, depth: 0.15, voussoirs: 7, keystone: true,
      }));
    } else if (i >= 3 && i <= 5) {
      // A TRIANGULAR PEDIMENT on the first upper storey only.
      // `hb-beauxarts-three-quarter.png`, opened before this line was written, grades its window
      // heads down the elevation: pediments on the first upper storey, plain cornices on the two
      // above, arches at the top. That hierarchy is the difference between a decorated wall and a
      // composed one, and it costs four boxes a window.
      ctx.push(slab(o.width + 0.60, 0.14, 0.22, o.x, o.y + o.height + 0.04, frontZ + 0.11,
        'pediment-bed'), ctx.p.trim);
      for (const hand of [-1, 1]) {
        ctx.push(rotBox(o.width * 0.64, 0.15, 0.20, o.x + hand * o.width * 0.16,
          o.y + o.height + 0.34, frontZ + 0.11, { z: -hand * 0.46 }, 'pediment-rake'), ctx.p.trim);
      }
      ctx.push(slab(o.width + 0.14, 0.28, 0.09, o.x, o.y + o.height + 0.17, frontZ + 0.055,
        'pediment-tympanum'), ctx.p.wallAlt);
    } else {
      ctx.push(slab(o.width + 0.52, 0.16, 0.20, o.x, o.y + o.height + 0.06, frontZ + 0.10,
        'window-cornice'), ctx.p.trim);
    }
    if (o.head === 'arch') {
      // The top-storey balcony. The plate carries a continuous iron railing across all three top
      // openings, and at board zoom that is a single dark horizontal band a quarter of the way
      // down the elevation — the strongest value break the front has above the base.
      const by = o.y - 0.14;
      ctx.push(slab(o.width + 0.70, 0.14, 0.46, o.x, by, frontZ + 0.23, 'balcony-deck'),
        ctx.p.trim);
      ctx.push(slab(o.width + 0.70, 0.055, 0.10, o.x, by + 0.86, frontZ + 0.42,
        'balcony-handrail'), ctx.p.iron);
      const rails = Math.max(4, Math.round((o.width + 0.70) / 0.20));
      for (let r = 0; r <= rails; r += 1) {
        ctx.push(box(0.035, 0.74, 0.035, o.x - (o.width + 0.70) / 2 + ((o.width + 0.70) * r) / rails,
          by + 0.51, frontZ + 0.44, 'balcony-baluster'), ctx.p.iron);
      }
    }
  }
  for (const w of [leftW, rightW]) {
    const recessed = { ...w, face: w.face - w.normal * BEAUX_FLANK_RECESS };
    for (const o of sched.side) leanWindow(ctx, recessed, o, { reveal: 0.26 });
  }
  for (const o of sched.rear) leanWindow(ctx, rearW, o, { reveal: 0.24 });
  // Rectangular renderGrime faces are not used. R72 masks own Beaux stains.

  if (ctx.detail) {
    detail(ctx, ventGrille(ctx, {
      x: -bodyW * 0.30, y: baseY + 0.42, z: frontZ + 0.10,
      width: 0.44, height: 0.30, style: 'louvre',
    }));
  }

  cityLot(ctx, { entryX: sched.front.find((o) => o.kind === 'door')?.x ?? 0, salt: 860 });
}

/* ═══════════════════════════════ the parapet name ═══════════════════════════════ */

/**
 * The building's name in applied relief letters on the parapet. Both references carry one, so
 * this is a real feature of the subject rather than decoration.
 *
 * §5.4.0 IS APPLIED AND ITS ANSWER IS TAKEN. A facade at the board station delivers **6.47 px/m
 * along the wall and 4.97 px/m up it**, not the inherited 7.33 — and `assessLabel()` returns
 * `blank-plate` for any cap height a 1.42 m parapet can carry. That is not a reason to omit the
 * word: §5.4.0's own ruling is "author real words; expect them to read at the station a player
 * actually plays at, and do not claim they read at 319 m". So the letters are built, sized to the
 * parapet, and the verdict is recorded on the geometry rather than asserted in a report.
 *
 * `reliefLetters()` costs ZERO new material buckets — the letters take `trim`, which the building
 * already owns, and sit on a `wallAlt` panel field, so the mark is a value contrast rather than a
 * hue one. It costs 10 triangles a stroke segment, which `wu-geom.mjs` reports separately.
 */
function heritageName(ctx, {
  text, x, y, z, cap, maxWidth, depth = 0.05, panel = true,
}) {
  if (!ctx.detail) return null;
  const ext = reliefExtent(text, { cap, maxWidth });
  const verdictBoard = assessLabel({ capM: ext.cap, pxPerMHoriz: 6.47, pxPerMVert: 4.97 });
  // The shipped default station, 190 m, at the same 1920x1080 viewport. The board figures scale
  // linearly with 319/190, which is the ratio `l3sign-boardzoom.mjs` derives its 7.33 from.
  const k = 319 / 190;
  const verdictPlay = assessLabel({ capM: ext.cap, pxPerMHoriz: 6.47 * k, pxPerMVert: 4.97 * k });
  // The panel the word stands on. Its height comes from `inkH`, not from `cap`, because the
  // miters are what a plate shows.
  if (panel) {
    ctx.push(slab(ext.inkW + cap * 0.9, ext.inkH + cap * 0.62, 0.06, x,
      y - cap * 0.31, z - 0.02, 'name-panel'), ctx.p.wallAlt);
  }
  const letters = reliefLetters({
    text, x, y, z, cap: ext.cap, material: ctx.p.trim, axis: 'z', facing: 1,
    depth, embed: 0.022, maxWidth, name: 'name-letter',
  });
  for (const part of letters) ctx.push(part.geometry, part.material);
  const record = {
    text,
    cap: +ext.cap.toFixed(3),
    inkW: +ext.inkW.toFixed(3),
    inkH: +ext.inkH.toFixed(3),
    segments: ext.segments,
    triangles: ext.triangles,
    board319: { ...verdictBoard, strokePx: +verdictBoard.strokePx.toFixed(2), capPx: +verdictBoard.capPx.toFixed(2) },
    board190: { ...verdictPlay, strokePx: +verdictPlay.strokePx.toFixed(2), capPx: +verdictPlay.capPx.toFixed(2) },
  };
  ctx.signage.push(record);
  return record;
}

/* ═══════════════════════════ 2 — the Streamline Moderne walk-up ═══════════════════════ */
//
// After Mitchell House, corner of Lonsdale and Elizabeth: the opposite discipline in every
// respect. Where the Beaux-Arts front is a vertical order of pilasters and arches, this is a
// horizontal system of continuous bands, and the identifying move is a ROUNDED CORNER that the
// ribbon glazing runs around without a break.
//
// The corner is real plan geometry — a 2.35 m quarter annulus built as closed sector prisms — and
// it is what makes the two subjects sortable in silhouette alone. Nothing else on this board has
// a curved corner. The radius is not free: the awning wraps it at +1.05 m and §3.6 puts the lot
// edge at 7.5, so the radius, the body width and the awning projection are one constraint, solved
// once here and asserted in `wu-geom.mjs` rather than eyeballed.

const MODERNE = Object.freeze({
  cornerR: 2.35,
  awningProjection: 0.58,
  awningY: 3.16,
  groundH: 3.55,
  ribbonH: 1.50,
  ribbonSill: 0.98,
  glassBrickW: 1.42,
  shellT: 0.32,
  arcSegments: 10,
  /** Width of the pale piers that frame the curved bay and divide the front. */
  pierW: 0.62,
});

/** Where the rounded corner's centre sits, and the storey datums, in one place. */
function moderneFrame(ctx) {
  const { bodyW, bodyD, frontZ, backZ, wallH } = ctx.env;
  const baseY = 0.14;
  const R = MODERNE.cornerR;
  const upperH = (wallH - MODERNE.groundH) / 3;
  return {
    baseY,
    R,
    upperH,
    cx: bodyW / 2 - R,
    cz: frontZ - R,
    /** Where the straight front wall stops and the curve starts. */
    frontRunMax: bodyW / 2 - R,
    /** Where the curve ends and the right flank runs back. */
    flankRunMax: frontZ - R,
    roofY: baseY + wallH,
    bodyW,
    bodyD,
    frontZ,
    backZ,
    wallH,
  };
}

/**
 * Moderne front door in the building's local frame.
 * `x` is the same centre `moderneOpenings` punches. `clearWidth` is that opening plus the
 * 40 mm each side already cut through the authored plinth and trough.
 */
export function moderneDoorAxis(bodyW) {
  const width = 1.55;
  const x = -bodyW / 2 + 0.42 + MODERNE.glassBrickW + 0.22 + width / 2;
  return { x, width, clearWidth: width + 0.08 };
}

/** Door axis for one facade of the standard heritage lot. Facade jitter matches the envelope. */
export function moderneEntranceLocal(facade = 0, lotW = TILE - SETBACK * 2) {
  const f = Math.max(0, Math.min(3, facade | 0));
  const bodyW = lotW * HERITAGE_WALKUP_ENVELOPE['walkup-moderne'].widthF * (1 + (f - 1.5) * 0.018);
  return { ...moderneDoorAxis(bodyW), facade: f, bodyW, lotW };
}

/** The Moderne's opening schedule. Ribbons are ONE punched opening each, not one per light. */
export function moderneOpenings(ctx) {
  const f = moderneFrame(ctx);
  const { baseY, upperH } = f;
  const gbEdge = -f.bodyW / 2 + 0.42 + MODERNE.glassBrickW;

  const front = [];
  const arc = [];
  const flank = [];
  // THE GROUND FLOOR IS A SHOPFRONT THAT WRAPS THE CORNER, and that is a plate correction.
  // r1 punched two 2.30 m lights into a 13 m frontage and `walkup-moderne--three-quarter.png`
  // (opened 2026-08-18 19:50) shows the result: a blank pale base under a fully modelled upper
  // building, which is the weakest thing on the plate. `hb-moderne-three-quarter.png` glazes the
  // whole ground storey continuously and carries it round the curve.
  //
  // It is paid for, not added: the blind left flank and the rear drop from three openings a storey
  // to two GANGED ones, which §3.4 names as a decision a lane may take and which is what those
  // elevations actually have. 864 triangles out, ~840 back, into the elevation a player sees.
  const bayA0 = gbEdge + 0.22;
  const bayA1 = (bayA0 + f.frontRunMax - MODERNE.pierW / 2) / 2 - MODERNE.pierW / 2;
  const bayB0 = bayA1 + MODERNE.pierW;
  const bayB1 = f.frontRunMax - MODERNE.pierW / 2;
  const door = moderneDoorAxis(f.bodyW);
  front.push(opening(door.x, baseY + 0.06, door.width, 2.72, 'door', 'square'));
  front.push(opening((bayA0 + door.width + 0.24 + bayA1) / 2, baseY + 0.58,
    bayA1 - (bayA0 + door.width + 0.24), 2.34, 'window', 'ribbon'));
  front.push(opening((bayB0 + bayB1) / 2, baseY + 0.58, bayB1 - bayB0, 2.34, 'window', 'ribbon'));
  // the shopfront carried round the curve and a short way down the flank
  arc.push({ y: baseY + 0.58, height: 2.34, kind: 'window', head: 'ribbon', ground: true });
  flank.push(opening(f.flankRunMax - 2.20, baseY + 0.58, 3.60, 2.34, 'window', 'ribbon'));
  for (let i = 0; i < 3; i += 1) {
    const y = baseY + MODERNE.groundH + upperH * i + MODERNE.ribbonSill;
    // The straight front ribbon, DIVIDED BY A PIER.
    // `hb-moderne-three-quarter.png`, opened 2026-08-18: the front is not one unbroken band. Pale
    // full-height piers divide it into bays and the band is continuous only where it matters — 
    // around the curve. Building one long slot was r1's read of the brief; the plate's read is a
    // pier at each end of the curved bay and one more across the front, and the plate wins.
    const a0 = gbEdge + 0.22;
    const a1 = f.frontRunMax - MODERNE.pierW / 2;
    const mid = (a0 + a1) / 2;
    front.push(opening((a0 + mid - MODERNE.pierW / 2) / 2, y,
      (mid - MODERNE.pierW / 2) - a0, MODERNE.ribbonH, 'window', 'ribbon'));
    front.push(opening((mid + MODERNE.pierW / 2 + a1) / 2, y,
      a1 - (mid + MODERNE.pierW / 2), MODERNE.ribbonH, 'window', 'ribbon'));
    // the quarter that wraps the corner
    arc.push({ y, height: MODERNE.ribbonH, kind: 'window', head: 'ribbon' });
    // the return along the right flank
    const b0 = f.flankRunMax - 4.35;
    const b1 = f.flankRunMax;
    flank.push(opening((b0 + b1) / 2, y, b1 - b0, MODERNE.ribbonH, 'window', 'ribbon'));
  }
  // The blind left flank and the rear are punched conventionally: a Moderne block turns its
  // ribbon toward the two street elevations and gives the other two ordinary windows.
  const left = [];
  const rear = [];
  for (let s = 0; s < 4; s += 1) {
    const y = s === 0 ? baseY + 0.92 : baseY + MODERNE.groundH + upperH * (s - 1) + 0.86;
    const h = s === 0 ? 2.05 : 1.82;
    for (let k = 0; k < 2; k += 1) {
      const z = f.backZ + 2.20 + (f.bodyD - 4.4) * k;
      left.push(opening(z, y, 2.05, h, 'window', 'square'));
    }
    for (const x of [-f.bodyW * 0.235, f.bodyW * 0.235]) {
      rear.push(opening(x, y, 2.05, h, 'window', 'square'));
    }
  }
  return { front, arc, flank, left, rear, frame: f, gbEdge };
}

/** Ribbon glazing on a straight wall: one continuous pane, mullions in front of it. */
function ribbonGlazing(ctx, w, o, { reveal = 0.26, pitch = 1.12 } = {}) {
  const d = Math.max(0.12, reveal);
  const cy = o.y + o.height / 2;
  // reveal head and sill — the two surfaces a ribbon actually shows, and both on the floored
  // `shadow` bucket because neither receives irradiance at the board's sun angle.
  ctx.push(wallBox(w, {
    a: o.x, y: o.y + o.height - 0.045, along: o.width, height: 0.09, depth: d,
    n: d / 2, name: 'ribbon-reveal-head',
  }), ctx.p.shadow);
  ctx.push(wallBox(w, {
    a: o.x, y: o.y + 0.045, along: o.width, height: 0.09, depth: d, n: d / 2,
    name: 'ribbon-reveal-sill',
  }), ctx.p.shadow);
  for (const hand of [-1, 1]) {
    ctx.push(wallBox(w, {
      a: o.x + hand * (o.width / 2 - 0.045), y: cy, along: 0.09, height: o.height, depth: d,
      n: d / 2, name: 'ribbon-reveal-jamb',
    }), ctx.p.shadow);
  }
  ctx.push(wallBox(w, {
    a: o.x, y: cy, along: o.width - 0.10, height: o.height - 0.11, depth: 0.03, n: d,
    name: 'ribbon-pane',
  }), ctx.p.glass);
  // head and sill rails, continuous — this is what makes it read as a ribbon rather than as a
  // row of windows, and it is the whole identity of the elevation.
  ctx.push(wallBox(w, {
    a: o.x, y: o.y + o.height - 0.10, along: o.width, height: 0.115, depth: 0.075,
    n: d - 0.055, name: 'ribbon-head-rail',
  }), ctx.p.iron);
  ctx.push(wallBox(w, {
    a: o.x, y: o.y + 0.10, along: o.width, height: 0.115, depth: 0.075, n: d - 0.055,
    name: 'ribbon-sill-rail',
  }), ctx.p.iron);
  const n = Math.max(1, Math.round(o.width / pitch));
  for (let i = 1; i < n; i += 1) {
    ctx.push(wallBox(w, {
      a: o.x - o.width / 2 + (o.width * i) / n, y: cy, along: 0.075,
      height: o.height - 0.20, depth: 0.075, n: d - 0.055, name: 'ribbon-mullion',
    }), ctx.p.iron);
  }
  // A projecting sill nose under the ribbon, in the DARK band material. The band and the nose
  // together are the horizontal reading; without the nose the band is a stripe of paint.
  ctx.push(wallBox(w, {
    a: o.x, y: o.y - 0.09, along: o.width + 0.24, height: 0.13, depth: 0.20, n: -0.06,
    name: 'ribbon-sill-nose',
  }), ctx.p.wallAlt);
}

/** The same, wrapped around the rounded corner. */
function arcRibbon(ctx, f, { y, height }, { reveal = 0.26, nose = true } = {}) {
  const segs = MODERNE.arcSegments;
  const R = f.R;
  const a0 = 0.02;
  const a1 = Math.PI / 2 - 0.02;
  const rGlass = R - reveal;
  ctx.push(arcSkin({
    cx: f.cx, cz: f.cz, radius: rGlass, y0: y + 0.055, y1: y + height - 0.055,
    a0, a1, segments: segs, name: 'arc-ribbon-pane', vRange: [y, y + height],
  }), ctx.p.glass);
  // The room behind the curve. Two boxes meet at the arc centre 2.0 m back, which reads as a
  // lit interior rather than as a void; this skin puts a floored dark surface at 0.34 m instead.
  ctx.push(arcSkin({
    cx: f.cx, cz: f.cz, radius: rGlass - 0.34, y0: y, y1: y + height,
    a0: a0 - 0.06, a1: a1 + 0.06, segments: Math.max(4, segs - 3), name: 'arc-ribbon-backer',
  }), ctx.p.shadow);
  for (const [ry, rh] of [[y + height - 0.115, 0.115], [y + 0.02, 0.115]]) {
    ctx.push(arcPrism({
      cx: f.cx, cz: f.cz, rOuter: R - reveal + 0.075, rInner: R - reveal - 0.005,
      y0: ry, y1: ry + rh, a0, a1, segments: Math.max(4, segs - 4), name: 'arc-ribbon-rail',
    }), ctx.p.iron);
  }
  const mullions = 4;
  for (let i = 1; i < mullions; i += 1) {
    const a = a0 + ((a1 - a0) * i) / mullions;
    ctx.push(box(0.075, height - 0.22, 0.075,
      f.cx + Math.sin(a) * (rGlass + 0.04), y + height / 2, f.cz + Math.cos(a) * (rGlass + 0.04),
      'arc-ribbon-mullion'), ctx.p.iron);
  }
  // the dark sill nose, carried round the curve. The ground-storey shopfront has none — a
  // shopfront meets the pavement, it does not sit on a spandrel.
  if (!nose) return;
  ctx.push(arcPrism({
    cx: f.cx, cz: f.cz, rOuter: R + 0.16, rInner: R - 0.10, y0: y - 0.15, y1: y - 0.02,
    a0: a0 - 0.05, a1: a1 + 0.05, segments: Math.max(4, segs - 3), name: 'arc-sill-nose',
  }), ctx.p.wallAlt);
}

/** The glass-brick stair core: a pale gridded panel, and the one vertical on the elevation. */
function glassBrickPanel(ctx, { x, y0, y1, z, width }) {
  const h = y1 - y0;
  ctx.push(slab(width, h, 0.14, x, y0, z + 0.07, 'glassbrick-field'), ctx.p.trim);
  ctx.push(box(width - 0.20, h - 0.16, 0.05, x, y0 + h / 2, z + 0.16, 'glassbrick-sheet'),
    ctx.p.glass);
  if (!ctx.detail) return;
  const pitch = 0.52;
  const rows = Math.max(2, Math.floor(h / pitch));
  for (let i = 1; i < rows; i += 1) {
    ctx.push(slab(width - 0.10, 0.045, 0.055, x, y0 + (h * i) / rows, z + 0.175,
      'glassbrick-joint'), ctx.p.shadow);
  }
  for (let i = 1; i < 3; i += 1) {
    ctx.push(slab(0.045, h - 0.18, 0.055, x - width / 2 + (width * i) / 3, y0 + 0.09,
      z + 0.175, 'glassbrick-joint'), ctx.p.shadow);
  }
  ctx.push(slab(width + 0.16, 0.14, 0.22, x, y1, z + 0.11, 'glassbrick-cap'), ctx.p.trim);
}

function buildModerne(ctx) {
  tuneHeritageMaterials(ctx);
  const sched = moderneOpenings(ctx);
  const f = sched.frame;
  const {
    baseY, R, cx, cz, roofY, bodyW, bodyD, frontZ, backZ, wallH,
  } = f;
  const t = MODERNE.shellT;
  const segs = MODERNE.arcSegments;
  const parH = 0.92;
  const midZ = (frontZ + backZ) / 2;

  const frontW = wall('x', frontZ, 1, -bodyW / 2, f.frontRunMax + 0.02);
  const rightW = wall('z', bodyW / 2, 1, backZ, f.flankRunMax + 0.02);
  const leftW = wall('z', -bodyW / 2, -1, backZ, frontZ);
  const rearW = wall('x', backZ, -1, -bodyW / 2, bodyW / 2);

  /* ── the core, cut back so it cannot push through the curve ──
   *
   * A single inset box would put its own corner 2.80 m from the arc centre against an inner arc
   * radius of 2.03, i.e. 0.77 m OUTSIDE the curved wall — the rounded corner would have a square
   * one sticking through it. Two boxes meeting behind the arc centre solve it exactly, and the
   * right-angle they form 2.0 m behind the ribbon is the surface `arcRibbon`'s backer covers. */
  const inset = t + 0.05;
  pushModerneCoreA(ctx, sched, {
    baseY, cx, bodyW, bodyD, frontZ, backZ, wallH, inset,
  });
  ctx.push(box(bodyW / 2 - inset - cx, wallH, cz - backZ - inset,
    (cx + bodyW / 2 - inset) / 2, baseY + wallH / 2, (backZ + inset + cz) / 2,
    'moderne-core-b'), ctx.p.wall);

  /* ── straight shells ── */
  punchedShell(ctx, {
    ...frontW, baseY, height: wallH, thickness: t, openings: sched.front,
    material: ctx.p.wall, name: 'moderne-front-shell',
  });
  punchedShell(ctx, {
    ...rightW, baseY, height: wallH, thickness: t, openings: sched.flank,
    material: ctx.p.wall, name: 'moderne-right-shell',
  });
  punchedShell(ctx, {
    ...leftW, baseY, height: wallH, thickness: t, openings: sched.left,
    material: ctx.p.wall, name: 'moderne-left-shell',
  });
  punchedShell(ctx, {
    ...rearW, baseY, height: wallH, thickness: t, openings: sched.rear,
    material: ctx.p.wall, name: 'moderne-rear-shell',
  });

  /* ── the rounded corner, band by band ──
   * The arc is punched exactly the way a flat wall is: the solid y-ranges are the complement of
   * the ribbon slots, so the ribbon is a real hole in a real wall and its head soffit and sill
   * are the cap faces of the bands above and below it. */
  const bands = [];
  let cursor = baseY;
  for (const r of sched.arc) {
    bands.push([cursor, r.y]);
    cursor = r.y + r.height;
  }
  bands.push([cursor, roofY]);
  for (const [y0, y1] of bands) {
    if (y1 - y0 < 0.02) continue;
    ctx.push(arcPrism({
      cx, cz, rOuter: R, rInner: R - t, y0, y1, a0: 0, a1: Math.PI / 2,
      segments: segs, name: 'moderne-arc-band',
    }), ctx.p.wall);
  }

  /* ── the glazing ── */
  for (const o of sched.front) {
    if (o.head === 'ribbon') ribbonGlazing(ctx, frontW, o, { reveal: 0.26 });
  }
  for (const o of sched.flank) ribbonGlazing(ctx, rightW, o, { reveal: 0.26, pitch: 1.05 });
  for (const r of sched.arc) {
    arcRibbon(ctx, f, r, { reveal: r.ground ? 0.22 : 0.26, nose: !r.ground });
  }
  for (const o of sched.left) leanWindow(ctx, leftW, o, { reveal: 0.24 });
  for (const o of sched.rear) leanWindow(ctx, rearW, o, { reveal: 0.22 });

  /* ── the horizontal banding, which is the register ──
   * A proud skin in the DARK second wall value under every ribbon, carried unbroken across the
   * front, round the curve and along the flank. On the Beaux-Arts the same bucket is a warm mid;
   * here it is a bottle green at roughly half that value, and that inversion is deliberate. */
  for (let i = 0; i < 3; i += 1) {
    const y = baseY + MODERNE.groundH + f.upperH * i;
    const bandY = y + MODERNE.ribbonSill - 0.86;
    ctx.push(wallSlab(frontW, {
      a: (-bodyW / 2 + f.frontRunMax) / 2, yBase: bandY, along: bodyW / 2 + f.frontRunMax,
      height: 0.74, depth: 0.09, n: -0.045, name: 'moderne-band-front',
    }), ctx.p.wallAlt);
    ctx.push(wallSlab(rightW, {
      a: (backZ + f.flankRunMax) / 2, yBase: bandY, along: f.flankRunMax - backZ,
      height: 0.74, depth: 0.09, n: -0.045, name: 'moderne-band-right',
    }), ctx.p.wallAlt);
    ctx.push(arcSkin({
      cx, cz, radius: R + 0.045, y0: bandY, y1: bandY + 0.74, a0: 0, a1: Math.PI / 2,
      segments: segs, name: 'moderne-band-arc',
    }), ctx.p.wallAlt);
  }

  /* ── the pale piers, and the speed lines in the dark bands ──
   * Both are plate reads off `hb-moderne-three-quarter.png`. The piers frame the curved bay at
   * each end and divide the front; the speed lines are three fine incised horizontals inside every
   * dark spandrel band, and at board zoom they are what stops the band being a flat stripe of
   * paint. They ride the `trim` bucket, which the building already owns. */
  const pierY = baseY + MODERNE.groundH - 0.30;
  const pierH = roofY + parH - pierY;
  for (const px of [
    -bodyW / 2 + 0.42 + MODERNE.glassBrickW + 0.30,
    (-bodyW / 2 + 0.42 + MODERNE.glassBrickW + 0.30 + f.frontRunMax) / 2,
    f.frontRunMax - MODERNE.pierW / 2,
  ]) {
    ctx.push(slab(MODERNE.pierW, pierH, 0.14, px, pierY, frontZ + 0.07, 'moderne-front-pier'),
      ctx.p.wall);
    if (ctx.detail) {
      for (const off of [-0.13, 0, 0.13]) {
        ctx.push(slab(0.045, pierH - 0.42, 0.045, px + off, pierY + 0.21, frontZ + 0.155,
          'moderne-pier-reed'), ctx.p.shadow);
      }
    }
  }
  ctx.push(box(0.14, pierH, MODERNE.pierW, bodyW / 2 + 0.07, pierY + pierH / 2,
    f.flankRunMax - MODERNE.pierW / 2, 'moderne-flank-pier'), ctx.p.wall);

  for (let i = 0; i < 3; i += 1) {
    const y = baseY + MODERNE.groundH + f.upperH * i;
    const bandY = y + MODERNE.ribbonSill - 0.86;
    // A TURNED BUNDLE IS ROTATED ABOUT ITS OWN CENTRE, NOT ABOUT A SWAPPED PAIR.
    // r1 built the flank run at `(x = alongCentre, z = wallPlane)` and then rotated it about
    // `(x = wallPlane, z = alongCentre)` — two different points — and `wu-geom.mjs`'s §3.6 check
    // caught it immediately: the model's x extent went to 14.374 against a lot half-width of 7.5.
    // `walkup.js: wrapCourse()` already had the correct form, which is to build the bundle AT its
    // final centre and turn it about that same centre.
    const frontCentre = (-bodyW / 2 + f.frontRunMax) / 2;
    const flankCentre = (backZ + f.flankRunMax) / 2;
    detail(ctx, speedLines(ctx, {
      x: frontCentre, y: bandY + 0.14, z: frontZ + 0.09,
      length: (bodyW / 2 + f.frontRunMax) * 0.92, count: 3,
      height: 0.05, gap: 0.13, projection: 0.045, taperEnds: 0,
    }));
    const flankLines = speedLines(ctx, {
      x: bodyW / 2 + 0.09, y: bandY + 0.14, z: flankCentre,
      length: (f.flankRunMax - backZ) * 0.92, count: 3,
      height: 0.05, gap: 0.13, projection: 0.045, taperEnds: 0,
    });
    turnBundle(flankLines, { x: bodyW / 2 + 0.09, z: flankCentre, angle: Math.PI / 2 });
    detail(ctx, flankLines);
    for (let k = 0; k < 3; k += 1) {
      ctx.push(arcSkin({
        cx, cz, radius: R + 0.10, y0: bandY + 0.14 + k * 0.18, y1: bandY + 0.19 + k * 0.18,
        a0: 0, a1: Math.PI / 2, segments: segs, name: 'moderne-arc-speed-line',
      }), ctx.p.trim);
    }
  }

  /* ── the curved cantilevered awning ──
   * §3.6 and the corner radius are one constraint. Solved: the awning reaches
   * `bodyW/2 + 1.05` in x and `frontZ + 1.05` in z at the widest façade variant, which is 7.37
   * and 7.20 against a lot half-width of 7.50. `wu-geom.mjs` asserts it rather than trusting it. */
  const ay = baseY + MODERNE.awningY;
  const proj = MODERNE.awningProjection;
  ctx.push(slab(bodyW / 2 + f.frontRunMax, 0.16, proj, (-bodyW / 2 + f.frontRunMax) / 2, ay,
    frontZ + proj / 2, 'awning-front-deck'), ctx.p.trim);
  ctx.push(slab(bodyW / 2 + f.frontRunMax, 0.10, proj - 0.10,
    (-bodyW / 2 + f.frontRunMax) / 2, ay - 0.10, frontZ + proj / 2 - 0.05,
    'awning-front-soffit'), ctx.p.shadow);
  ctx.push(slab(bodyW / 2 + f.frontRunMax, 0.22, 0.09, (-bodyW / 2 + f.frontRunMax) / 2,
    ay - 0.06, frontZ + proj - 0.045, 'awning-front-fascia'), ctx.p.iron);
  const flankRun = 2.9;
  ctx.push(box(proj, 0.16, flankRun, bodyW / 2 + proj / 2, ay + 0.08,
    f.flankRunMax - flankRun / 2, 'awning-flank-deck'), ctx.p.trim);
  ctx.push(box(proj - 0.10, 0.10, flankRun, bodyW / 2 + proj / 2 - 0.05, ay - 0.05,
    f.flankRunMax - flankRun / 2, 'awning-flank-soffit'), ctx.p.shadow);
  ctx.push(box(0.09, 0.22, flankRun, bodyW / 2 + proj - 0.045, ay + 0.02,
    f.flankRunMax - flankRun / 2, 'awning-flank-fascia'), ctx.p.iron);
  ctx.push(arcPrism({
    cx, cz, rOuter: R + proj, rInner: R - 0.06, y0: ay, y1: ay + 0.16,
    a0: 0, a1: Math.PI / 2, segments: segs, name: 'awning-arc-deck',
  }), ctx.p.trim);
  ctx.push(arcPrism({
    cx, cz, rOuter: R + proj - 0.10, rInner: R - 0.04, y0: ay - 0.10, y1: ay,
    a0: 0, a1: Math.PI / 2, segments: segs, name: 'awning-arc-soffit',
  }), ctx.p.shadow);
  ctx.push(arcPrism({
    cx, cz, rOuter: R + proj, rInner: R + proj - 0.09, y0: ay - 0.06, y1: ay + 0.16,
    a0: 0, a1: Math.PI / 2, segments: segs, name: 'awning-arc-fascia',
  }), ctx.p.iron);
  // The tie rods. The plate hangs the awning on angled struts at roughly 1.6 m centres, and they
  // are the detail that says CANTILEVER rather than "a ledge". Three boxes at board zoom is a
  // dotted rhythm under a continuous shadow line, which is exactly how the reference reads.
  if (ctx.detail) {
    const strutRun = bodyW / 2 + f.frontRunMax;
    const nStruts = Math.max(3, Math.round(strutRun / 1.7));
    for (let i = 0; i <= nStruts; i += 1) {
      const sx = -bodyW / 2 + 0.35 + ((strutRun - 0.70) * i) / nStruts;
      if (sx > f.frontRunMax - 0.2) continue;
      ctx.push(rotBox(0.06, 0.90, 0.06, sx, ay + 0.36, frontZ + proj * 0.42,
        { x: -0.72 }, 'awning-strut'), ctx.p.iron);
    }
    for (let i = 0; i < 3; i += 1) {
      const a = 0.22 + (Math.PI / 2 - 0.44) * (i / 2);
      ctx.push(rotBox(0.06, 0.90, 0.06,
        cx + Math.sin(a) * (R + proj * 0.42), ay + 0.36, cz + Math.cos(a) * (R + proj * 0.42),
        { x: -0.72 * Math.cos(a), z: 0.72 * Math.sin(a) }, 'awning-strut-arc'), ctx.p.iron);
    }
  }

  /* ── glass brick, plinth, parapet, roof ── */
  glassBrickPanel(ctx, {
    x: -bodyW / 2 + 0.42 + MODERNE.glassBrickW / 2, y0: baseY + 0.62, y1: roofY + parH - 0.20,
    z: frontZ, width: MODERNE.glassBrickW,
  });
  const entryDoor = sched.front.find((o) => o.kind === 'door');
  plinthCourse(ctx, {
    bodyW, bodyD, frontZ, backZ, baseY, height: 0.44, proud: 0.16,
    frontGap: entryDoor ? { x: entryDoor.x, width: entryDoor.width + 0.08 } : null,
  });
  const roofLayout = moderneRoofLayout(moderneRoofFrame(ctx.env.facade ?? 0));
  seamedRoofDeck(ctx, {
    bodyW, bodyD, frontZ, backZ, roofY: roofY - 0.18,
    cut: { cx, cz, r: R - 0.16 },
    seamProfile: 'roll',
    clears: moderneRoofServiceClears(roofLayout),
  });

  ctx.push(slab(bodyW / 2 + f.frontRunMax, parH, 0.26, (-bodyW / 2 + f.frontRunMax) / 2,
    roofY, frontZ - 0.13, 'moderne-parapet-front'), ctx.p.wall);
  ctx.push(wallSlab(rightW, {
    a: (backZ + f.flankRunMax) / 2, yBase: roofY, along: f.flankRunMax - backZ,
    height: parH, depth: 0.26, n: 0.13, name: 'moderne-parapet-right',
  }), ctx.p.wall);
  ctx.push(wallSlab(leftW, {
    a: midZ, yBase: roofY, along: bodyD, height: parH, depth: 0.26, n: 0.13,
    name: 'moderne-parapet-left',
  }), ctx.p.wall);
  ctx.push(slab(bodyW, parH, 0.26, 0, roofY, backZ + 0.13, 'moderne-parapet-rear'), ctx.p.wall);
  ctx.push(arcPrism({
    cx, cz, rOuter: R, rInner: R - 0.26, y0: roofY, y1: roofY + parH,
    a0: 0, a1: Math.PI / 2, segments: segs, name: 'moderne-parapet-arc',
  }), ctx.p.wall);
  // A SLIM coping, and slim is the point — a 0.16 m cap with a 0.05 m overhang, against the
  // Beaux-Arts' 0.42 m modillion cornice. Two crowns, two silhouettes, one board.
  ctx.push(slab(bodyW / 2 + f.frontRunMax + 0.10, 0.13, 0.36,
    (-bodyW / 2 + f.frontRunMax) / 2, roofY + parH, frontZ - 0.13, 'moderne-coping-front'),
    ctx.p.trim);
  ctx.push(wallSlab(rightW, {
    a: (backZ + f.flankRunMax) / 2, yBase: roofY + parH, along: f.flankRunMax - backZ,
    height: 0.13, depth: 0.36, n: 0.08, name: 'moderne-coping-right',
  }), ctx.p.trim);
  ctx.push(wallSlab(leftW, {
    a: midZ, yBase: roofY + parH, along: bodyD, height: 0.13, depth: 0.36, n: 0.08,
    name: 'moderne-coping-left',
  }), ctx.p.trim);
  ctx.push(slab(bodyW, 0.13, 0.36, 0, roofY + parH, backZ + 0.13, 'moderne-coping-rear'),
    ctx.p.trim);
  ctx.push(arcPrism({
    cx, cz, rOuter: R + 0.05, rInner: R - 0.31, y0: roofY + parH, y1: roofY + parH + 0.13,
    a0: 0, a1: Math.PI / 2, segments: segs, name: 'moderne-coping-arc',
  }), ctx.p.trim);

  moderneEntry(ctx, sched);

  // The raised parapet blade. Same arithmetic as the Beaux-Arts tablet and the same answer: a
  // 0.92 m parapet cannot carry a cap that reads, so the name goes on the one element that can.
  // A raised parapet feature over the entry is a Moderne device rather than a concession — but
  // it is a VERTICAL element on a horizontal building, so it is kept narrow and square-shouldered
  // and it sits at the glass-brick end, where the stair core already breaks the banding.
  const bladeX = -bodyW / 2 + 0.42 + MODERNE.glassBrickW / 2 + 1.95;
  const bladeW = 3.90;
  ctx.push(slab(bladeW, 1.06, 0.34, bladeX, roofY + parH, frontZ - 0.17,
    'parapet-blade'), ctx.p.wall);
  ctx.push(slab(bladeW + 0.14, 0.12, 0.44, bladeX, roofY + parH + 1.06, frontZ - 0.17,
    'parapet-blade-coping'), ctx.p.trim);
  heritageName(ctx, {
    text: 'AVALON',
    x: bladeX, y: roofY + parH + 0.20, z: frontZ + 0.025, cap: 0.78,
    maxWidth: bladeW - 0.42, depth: 0.05, panel: false,
  });

  renderGrime(ctx, frontW, { baseY, openings: sched.front, salt: 720, rows: 6 });
  renderGrime(ctx, leftW, { baseY, openings: sched.left, salt: 750, rows: 6 });

  cityLot(ctx, {
    entryX: entryDoor?.x ?? 0,
    salt: 920,
    letterbox: false,
    entryClear: entryDoor ? {
      x: entryDoor.x,
      width: entryDoor.width + 0.08,
      frontZ,
      leafBottom: entryDoor.y,
    } : null,
  });
  authorModerneHeritage(ctx, {
    cx, cz, R,
    frontZ, backZ, baseY, wallH, bodyW,
    roofY, upperH: f.upperH,
    groundH: MODERNE.groundH,
    ribbonSill: MODERNE.ribbonSill,
    awningY: MODERNE.awningY,
    parH,
  });
}

/**
 * Core-a with a local vestibule behind the front door. The original box's outside envelope
 * stays: one back mass, two full-height flanks, a sill and a head. The missing piece is the
 * scheduled opening, including the transom, from the core's front face back to 0.80 m behind
 * the street face. Box normals face out of each solid, so the pocket's back, sides, floor and
 * soffit face the void. Core-b and every other window backer are untouched.
 */
function pushModerneCoreA(ctx, sched, frame) {
  const { baseY, cx, bodyW, bodyD, frontZ, backZ, wallH, inset } = frame;
  const coreW = cx + bodyW / 2 - inset;
  const coreD = bodyD - inset * 2;
  const coreX = (-bodyW / 2 + inset + cx) / 2;
  const coreY = baseY + wallH / 2;
  const coreZ = (frontZ + backZ) / 2;
  const x0 = coreX - coreW / 2;
  const x1 = coreX + coreW / 2;
  const y0 = coreY - wallH / 2;
  const y1 = coreY + wallH / 2;
  const z0 = coreZ - coreD / 2;
  const z1 = coreZ + coreD / 2;
  const wallMat = ctx.p.wall;
  const door = sched.front.find((o) => o.kind === 'door');
  const pocketBack = frontZ - 0.80;
  const px0 = door ? door.x - door.width / 2 : x0;
  const px1 = door ? door.x + door.width / 2 : x0;
  const py0 = door ? door.y : y0;
  const py1 = door ? door.y + door.height : y0;
  const fits = door
    && px0 - x0 > 0.02 && x1 - px1 > 0.02
    && py0 - y0 > 0.02 && y1 - py1 > 0.02
    && pocketBack - z0 > 0.02 && z1 - pocketBack > 0.02;
  if (!fits) {
    ctx.push(box(coreW, wallH, coreD, coreX, coreY, coreZ, 'moderne-core-a'), wallMat);
    return;
  }
  const push = (w, h, d, x, y, z, name) => ctx.push(box(w, h, d, x, y, z, name), wallMat);
  push(coreW, wallH, pocketBack - z0, coreX, coreY, (z0 + pocketBack) / 2, 'moderne-core-a-back');
  push(px0 - x0, wallH, z1 - pocketBack, (x0 + px0) / 2, coreY, (pocketBack + z1) / 2,
    'moderne-core-a-left');
  push(x1 - px1, wallH, z1 - pocketBack, (px1 + x1) / 2, coreY, (pocketBack + z1) / 2,
    'moderne-core-a-right');
  push(px1 - px0, py0 - y0, z1 - pocketBack, (px0 + px1) / 2, (y0 + py0) / 2,
    (pocketBack + z1) / 2, 'moderne-core-a-floor');
  push(px1 - px0, y1 - py1, z1 - pocketBack, (px0 + px1) / 2, (py1 + y1) / 2,
    (pocketBack + z1) / 2, 'moderne-core-a-head');
}

/** The Moderne entry: a flush steel-framed door under the awning, and its mischief record. */
function moderneEntry(ctx, sched) {
  const { frontZ } = ctx.env;
  const door = sched.front.find((o) => o.kind === 'door');
  if (!door) return;
  const { x, y, width, height } = door;
  const reveal = 0.24;
  const liner = openingLiner(ctx, { x, y, z: frontZ, width, height, reveal, back: false });
  // The shared liner's sill occupies the leaf's bottom 55 mm. Keep the jambs and head,
  // and replace that sill with a threshold whose top is 20 mm under the unchanged leaf.
  liner.shadow = liner.shadow.filter((geometry) => geometry.name !== 'reveal-sill');
  detail(ctx, liner);
  const sillDepth = Math.max(0.06, reveal);
  const sillZ = frontZ - sillDepth / 2;
  const sillTop = y - 0.02;
  const sillH = 0.04;
  ctx.push(box(width, sillH, sillDepth, x, sillTop - sillH / 2, sillZ,
    'moderne-entry-sill'), ctx.p.shadow);
  const padW = 0.04;
  const padH = y - sillTop;
  for (const side of [-1, 1]) {
    ctx.push(box(padW, padH, sillDepth, x + side * (width / 2 - padW / 2), (sillTop + y) / 2, sillZ,
      'moderne-entry-sill-pad'), ctx.p.shadow);
  }
  // The old filled band kept this outer footprint and hid the leaf light and the transom.
  // Three trim boxes — jamb, jamb, lintel — leave the scheduled opening empty.
  const bandD = 0.08;
  const bandZ = frontZ + 0.04;
  const bandY0 = y - 0.06;
  const bandTop = bandY0 + height + 0.30;
  const openL = x - width / 2;
  const openR = x + width / 2;
  const headY = y + height;
  const jambW = 0.23;
  ctx.push(box(jambW, headY - bandY0, bandD, openL - jambW / 2, (bandY0 + headY) / 2, bandZ,
    'moderne-entry-jamb-left'), ctx.p.trim);
  ctx.push(box(jambW, headY - bandY0, bandD, openR + jambW / 2, (bandY0 + headY) / 2, bandZ,
    'moderne-entry-jamb-right'), ctx.p.trim);
  ctx.push(box(width + 0.46, bandTop - headY, bandD, x, (headY + bandTop) / 2, bandZ,
    'moderne-entry-lintel'), ctx.p.trim);
  ctx.push(box(width - 0.16, 0.42, 0.04, x, y + height - 0.28, frontZ - reveal,
    'moderne-entry-transom-glass'), ctx.p.glass);

  const leafH = height - 0.52;
  const leafW = width - 0.18;
  const pivotX = x - leafW / 2;
  const leaf = [];
  leaf.push({
    geometry: box(leafW, leafH, 0.08, x, y + leafH / 2, frontZ - reveal + 0.055,
      'moderne-entry-leaf'),
    material: ctx.p.iron,
  });
  leaf.push({
    geometry: box(leafW - 0.26, leafH * 0.46, 0.04, x, y + leafH * 0.64,
      frontZ - reveal + 0.105, 'moderne-entry-light'),
    material: ctx.p.glass,
  });
  leaf.push({
    geometry: cyl(0.042, leafH * 0.42, x + leafW / 2 - 0.16, y + leafH * 0.48,
      frontZ - reveal + 0.13, 'y', 'moderne-entry-pull', 6),
    material: ctx.p.trim,
  });
  for (const part of leaf) ctx.push(part.geometry, part.material);
  ctx.openings.push({
    id: 'front-door',
    kind: 'door',
    label: 'Front door',
    pivot: { x: pivotX, y: y + leafH / 2, z: frontZ - reveal + 0.055 },
    axis: 'y',
    openAngle: -1.05,
    parts: leaf,
    pick: { cx: leafW * 0.45, cy: 0, cz: 0.10, w: leafW, h: leafH, d: 0.38 },
  });
}

/* ═════════════════════════════ the lot, as a CITY lot ═════════════════════════════ */

/**
 * §2.6 planted lot and §2.7 paved path, on a lot that has no front garden — because neither of
 * these buildings has one. A Flinders Lane block and a Lonsdale Street corner meet the footpath;
 * the planting they carry is a pair of tubs at the entry and a boundary trough, not a lawn.
 *
 * `composeLot()` supplies the board tile, the chamfered rim, the footpath, the kerb, the paved
 * path of units and the rear service margin — everything §2.1 / §2.7 ask for — with `planting`
 * and `fence` refused, and the front-garden planting is built here instead where its triangle
 * cost is the lane's to choose. Measured in `wu-lot-sweep.mjs`: the suburban front garden this
 * replaces is 2,100–3,700 triangles and the tubs below are under 500.
 *
 * This is also the third silhouette separator against `walkup-flats`, which keeps its 0.18
 * setback and its garden: at board zoom the family reads as one building standing back behind a
 * lawn and two standing on the pavement.
 */
const ENTRY_PATH_NAMES = new Set([
  'tess-field', 'tess-border-l', 'tess-border-r', 'tess-border-b', 'tess-border-f',
  'tess-tile', 'entry-threshold',
]);

/** The tessellated entry walk and its threshold, lowered together so the leaf sole clears them. */
function dropEntryWalk(parts, drop) {
  for (const part of parts) {
    if (!ENTRY_PATH_NAMES.has(part.geometry?.name)) continue;
    part.geometry.translate(0, -drop, 0);
    part.geometry.computeBoundingBox();
  }
}

/**
 * The door pot is authored inside the swing. Slide the pot and every leaf by the same
 * vector to the free side of the entry, clear of the plinth face and the flanking tub.
 */
function relocateDoorPot(parts, entryX, frontZ) {
  const plant = parts.filter((part) => part.geometry?.name === 'door-pot'
    || part.geometry?.name === 'door-pot-leaf');
  const pot = plant.find((part) => part.geometry.name === 'door-pot');
  if (!pot) return;
  if (!pot.geometry.boundingBox) pot.geometry.computeBoundingBox();
  const bounds = pot.geometry.boundingBox;
  const side = entryX <= 0 ? 1 : -1;
  const dx = entryX + side * 2.70 - (bounds.min.x + bounds.max.x) / 2;
  const dz = frontZ + 0.56 - (bounds.min.z + bounds.max.z) / 2;
  for (const part of plant) {
    part.geometry.translate(dx, 0, dz);
    part.geometry.computeBoundingBox();
  }
}

function cityLot(ctx, { entryX = 0, salt = 860, entryClear = null, letterbox = true } = {}) {
  const lotParts = composeLot(ctx, {
    era: 'interwar',
    entryX,
    driveway: false,
    planting: false,
    fence: false,
    services: false,
    streetTree: false,
    path: 'pavers',
    ...(letterbox ? {} : { letterbox: false }),
  });
  if (entryClear) {
    // Tess tiles and borders are authored to 0.205. This lands that top 25 mm under the leaf.
    dropEntryWalk(lotParts, 0.205 - (entryClear.leafBottom - 0.025));
    relocateDoorPot(lotParts, entryX, entryClear.frontZ);
  }
  emitLot(ctx, lotParts);

  const { lotW, lotD, bodyW, frontZ } = ctx.env;
  const boundaryZ = lotD / 2 - 0.06;
  const forecourtZ = (frontZ + boundaryZ) / 2;
  const parts = [];
  const mk = (g, m) => parts.push({ geometry: g, material: m });

  // Two tubs flanking the entry. A tub is a box, a rim and three leaf lobes — the lobes are what
  // §2.6 means by "leaf silhouette, not spheres", and three of them at 0.9 m is a mass rather
  // than a ball.
  for (const hand of [-1, 1]) {
    const tx = entryX + hand * 1.55;
    if (Math.abs(tx) > bodyW / 2 - 0.35) continue;
    mk(slab(0.72, 0.52, 0.72, tx, 0.14, forecourtZ, 'tub-body'), ctx.p.ground);
    mk(slab(0.84, 0.10, 0.84, tx, 0.62, forecourtZ, 'tub-rim'), ctx.p.trim);
    if (!ctx.detail) continue;
    for (let i = 0; i < 3; i += 1) {
      const a = ctx.v.range(salt + i + (hand > 0 ? 30 : 0), 0, Math.PI * 2);
      const r = ctx.v.range(salt + 10 + i + (hand > 0 ? 30 : 0), 0.30, 0.44);
      mk(rotBox(r * 2.1, r * 0.36, r * 1.7,
        tx + Math.sin(a) * 0.18, 0.76 + i * 0.15, forecourtZ + Math.cos(a) * 0.18,
        { y: a, z: 0.20 }, 'tub-leaf'), ctx.p.foliage);
    }
  }

  // A boundary trough the full width, with tufts standing proud of it — the §2.6 "tufts standing
  // proud of the lawn" read, at a city building's scale.
  const troughW = lotW - 1.9;
  const troughZ = boundaryZ - 0.30;
  if (!entryClear) {
    mk(slab(troughW, 0.34, 0.44, 0, 0.14, troughZ, 'trough-body'), ctx.p.ground);
    mk(slab(troughW + 0.10, 0.08, 0.54, 0, 0.48, troughZ, 'trough-cap'), ctx.p.trim);
  } else {
    const gapL = entryClear.x - entryClear.width / 2;
    const gapR = entryClear.x + entryClear.width / 2;
    const pushRun = (fullW, h, d, yBase, name, material) => {
      const leftW = gapL + fullW / 2;
      const rightW = fullW / 2 - gapR;
      if (leftW > 0.02) {
        mk(slab(leftW, h, d, (-fullW / 2 + gapL) / 2, yBase, troughZ, name), material);
      }
      if (rightW > 0.02) {
        mk(slab(rightW, h, d, (gapR + fullW / 2) / 2, yBase, troughZ, name), material);
      }
    };
    pushRun(troughW, 0.34, 0.44, 0.14, 'trough-body', ctx.p.ground);
    pushRun(troughW + 0.10, 0.08, 0.54, 0.48, 'trough-cap', ctx.p.trim);
  }
  // CLUMPS, NOT DICE. r1 planted eleven upright 0.34 m boxes along the trough and both r1 plates
  // — `walkup-beaux-arts--board.png` and `walkup-moderne--three-quarter.png`, both opened — show
  // a row of bright green cubes, which is precisely the "spheres and lollipops" §2.6 rules out,
  // in a squarer form. Five overlapping clumps of three FLATTENED, rotated lobes read as a mass
  // with a top line, for 180 triangles against 132.
  if (ctx.detail) {
    const clumps = 5;
    for (let i = 0; i < clumps; i += 1) {
      const cxx = -troughW / 2 + 0.55 + ((troughW - 1.10) * i) / (clumps - 1);
      // A rotated lobe can reach about 0.90 m off its centre. The default 1.05 m skip stays
      // for every caller that does not open an entry corridor.
      const clumpClear = entryClear ? entryClear.width / 2 + 0.90 : 1.05;
      if (Math.abs(cxx - entryX) < clumpClear) continue;
      for (let k = 0; k < 3; k += 1) {
        const spread = ctx.v.range(salt + 60 + i * 4 + k, -0.34, 0.34);
        const w = ctx.v.range(salt + 100 + i * 4 + k, 0.56, 0.86);
        const h = ctx.v.range(salt + 140 + i * 4 + k, 0.20, 0.34);
        mk(rotBox(w, h, w * 0.72,
          cxx + spread, 0.54 + h / 2 + k * 0.11,
          boundaryZ - 0.30 + ctx.v.range(salt + 180 + i * 4 + k, -0.07, 0.07),
          { y: ctx.v.range(salt + 220 + i * 4 + k, 0, Math.PI), z: 0.16 },
          'trough-clump'), ctx.p.foliage);
      }
    }
  }
  for (const part of parts) ctx.push(part.geometry, part.material);
  for (let i = ctx.parts.length - parts.length; i < ctx.parts.length; i += 1) {
    ctx.parts[i].ddLot = true;
  }
}

/* ═════════════════════════════════ assembly ═════════════════════════════════ */

/** archetypeId → builder. The dispatcher guard is keyed on `HERITAGE_WALKUP_ARCHETYPES`. */
const BUILDERS = Object.freeze({
  'walkup-beaux-arts': buildBeauxArts,
  'walkup-moderne': buildModerne,
});

/** Punched-opening census, published so a report cannot count a different set from the builder. */
export function apertureCensus(archetypeId, ctx) {
  if (archetypeId === 'walkup-beaux-arts') {
    const s = beauxArtsOpenings(ctx);
    return {
      front: s.front.length,
      side: s.side.length * 2,
      rear: s.rear.length,
      total: s.front.length + s.side.length * 2 + s.rear.length,
      interactive: 1,
    };
  }
  const s = moderneOpenings(ctx);
  const total = s.front.length + s.arc.length + s.flank.length + s.left.length + s.rear.length;
  return {
    front: s.front.length,
    arc: s.arc.length,
    flank: s.flank.length,
    left: s.left.length,
    rear: s.rear.length,
    total,
    interactive: 1,
  };
}

function triangleCount(g) {
  const index = g.index;
  return (index ? index.count : g.attributes.position.count) / 3;
}

function beauxRoleForName(name, bucket) {
  if (/dentil-bed|soffit/.test(name)) return R72_SHELTER;
  if (/spandrel-field|pediment-tympanum|shell|masonry-core|parapet/.test(name)) return R72_PLASTER;
  if (/flank-base/.test(name) && !/base-cap/.test(name)) return R72_PLASTER;
  if (/pilaster|rustic|cornice|dentil|modillion|string-course|voussoir|keystone|sill|coping|balustrade|pediment|spandrel-|plinth-course|base-cap|bay-stile|bay-crown|corner-return/.test(name)) {
    return R72_CAST;
  }
  return bucket === 1 ? R72_CAST : R72_PLASTER;
}

/** Sill and cornice lines in authored building metres. Face 0 front, 1 flank, 2 rear. */
export function beauxConstructionContacts(env) {
  const sched = beauxArtsOpenings({ env });
  const contacts = [];
  const push = (a0, a1, y, face) => {
    if (!(a1 > a0)) return;
    contacts.push({ a0, a1, y, face });
  };
  for (const opening of sched.front) {
    if (opening.kind !== 'window') continue;
    push(opening.x - opening.width / 2, opening.x + opening.width / 2, opening.y, 0);
  }
  for (const opening of sched.rear) {
    if (opening.kind !== 'window') continue;
    push(opening.x - opening.width / 2, opening.x + opening.width / 2, opening.y, 2);
  }
  for (const opening of sched.side) {
    push(opening.x - opening.width / 2, opening.x + opening.width / 2, opening.y, 1);
  }
  const entabY = sched.baseY + env.wallH - 0.98;
  push(-env.bodyW / 2, env.bodyW / 2, entabY + 0.68, 0);
  push(env.backZ, env.frontZ, entabY + 0.62, 1);
  push(-env.bodyW / 2, env.bodyW / 2, entabY + 0.62, 2);
  return contacts;
}

function stampBeauxGeometry(geometry, role) {
  const position = geometry?.getAttribute?.('position');
  if (!position) return;
  const count = position.count;
  const roles = new Float32Array(count);
  roles.fill(role);
  const map = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    map[i * 3] = position.getX(i);
    map[i * 3 + 1] = position.getY(i);
    map[i * 3 + 2] = position.getZ(i);
  }
  geometry.setAttribute(R72_ROLE_ATTRIBUTE, new THREE.Float32BufferAttribute(roles, 1));
  geometry.setAttribute(R72_MAP_ATTRIBUTE, new THREE.Float32BufferAttribute(map, 3));
}

function stampBeauxSurfaceAttributes(ctx) {
  if (ctx.archetypeId !== 'walkup-beaux-arts') return;
  const contacts = beauxConstructionContacts(ctx.env);
  const buckets = [['wall', 0], ['wallAlt', 1], ['trim', 1]];
  const targets = new Set();
  for (const [name, bucket] of buckets) {
    const material = ctx.p[name];
    if (!material) continue;
    material.userData.r72BeauxContacts = contacts;
    material.userData.r72BeauxBucket = bucket;
    targets.add(material);
  }
  const stampPart = (part) => {
    if (!part?.geometry || !targets.has(part.material)) return;
    const bucket = part.material.userData.r72BeauxBucket ?? 0;
    stampBeauxGeometry(part.geometry, beauxRoleForName(part.geometry.name ?? '', bucket));
  };
  for (const part of ctx.parts) stampPart(part);
  for (const opening of ctx.openings ?? []) {
    for (const part of opening.parts ?? []) stampPart(part);
  }
}

/**
 * Assemble one heritage walk-up, or return null.
 *
 * @param {string} archetypeId
 * @param {MaterialLibrary} materials
 * @param {{districtId?: string|null, quality?: string, facade?: number, debugParts?: boolean}} opts
 */
export function assembleHeritageWalkup(archetypeId, materials, opts = {}) {
  const builder = BUILDERS[archetypeId];
  if (!builder) return null;

  const quality = opts.quality ?? 'high';
  const districtId = opts.districtId ?? null;
  const facade = Math.max(0, Math.min(3, opts.facade | 0));
  const spec = HERITAGE_WALKUP_ENVELOPE[archetypeId];

  // §3.3 DETERMINISM. The only entropy in this file is `variation()`, seeded from the archetype,
  // the district and the façade index and nothing else. No `Date`, no `Math.random`, no read of
  // simulation state — the render layer is downstream of the sim, always.
  const v = variation(`${archetypeId}|${districtId ?? ''}|f${facade}`);

  // THE ENVELOPE ARITHMETIC IS `index.js`'S, DELIBERATELY. These two sit in the same street as
  // `walkup-flats`, so they take the same lot datum, the same façade jitter and the same kerb
  // line. A walk-up whose plinth stops 0.6 m short of its neighbour's is a presentation tell
  // before it is anything else, and the houses lane's corrected `kerbZ` — right on its own
  // merits — would produce exactly that here.
  const lotW = TILE - SETBACK * 2;
  const lotD = TILE - SETBACK * 2;
  const bodyW = lotW * spec.widthF * (1 + (facade - 1.5) * 0.018);
  const bodyD = lotD * spec.depthF * (1 + ((facade * 2) % 3 - 1) * 0.02);
  const storeys = Math.max(1, spec.storeys);
  const wallH = storeys * STOREY;
  const frontZ = lotD / 2 - lotD * spec.frontSetback;
  const backZ = frontZ - bodyD;

  const env = {
    lotW, lotD, bodyW, bodyD, storeys, wallH, frontZ, backZ,
    kerbZ: lotD / 2 + 0.6,
    facade,
    party: false,
    units: 1,
    storeyH: STOREY,
  };

  const declared = surfacesForArchetype(archetypeId, null);
  const surfaces = { ...declared, ...HERITAGE_WALKUP_IDENTITY[archetypeId] };
  const hospitality = opts.hospitality === 'hotel' || opts.hospitality === 'luxe'
    ? opts.hospitality
    : null;
  const key = `${archetypeId}-${districtId ?? 'x'}-f${facade}${hospitality ? `-${hospitality}` : ''}`;
  const p = palette(materials, surfaces, v, key, archetypeId);

  const ctx = makeContext({ env, palette: p, variation: v, quality, archetypeId, districtId });
  ctx.hospitality = hospitality;
  /** §3.5 mischief targets. `board.js` reads `model.openings`. */
  ctx.openings = [];
  /** What `heritageName()` measured, carried on the model so a report cannot re-state it wrong. */
  ctx.signage = [];

  builder(ctx);
  if (opts.hospitality) dressHospitality(ctx, opts.hospitality);
  stampBeauxSurfaceAttributes(ctx);
  if (!ctx.parts.length) return null;

  let buildingTriangles = 0;
  let lotTriangles = 0;
  for (const part of ctx.parts) {
    const n = triangleCount(part.geometry);
    if (part.ddLot) lotTriangles += n; else buildingTriangles += n;
  }
  let openingTriangles = 0;
  for (const o of ctx.openings) {
    for (const part of o.parts) openingTriangles += triangleCount(part.geometry);
  }

  const debugParts = opts.debugParts ? ctx.parts.slice() : null;
  // `keepSources` only when a probe asked for the unmerged parts. The merge consumes its inputs
  // on the board path exactly as `index.js` does, so this file adds no memory the family did not
  // already spend; the copy exists so `wu-winding.mjs` can read `userData.ddExpect`, which the
  // merge strips.
  // Studios retain the authored closed leaves. Board renders these exact sources
  // separately on hinges, so only that mode excludes them before material merging.
  const openingSources = opts.liveOpenings === true
    ? new Set(ctx.openings.flatMap(opening => opening.parts.map(part => part.geometry)))
    : new Set();
  const merged = mergeByMaterial(ctx.parts.filter(part => !openingSources.has(part.geometry)), !!opts.debugParts);
  if (merged.length > PALETTE_BUCKET_CAP) {
    console.warn(
      `[walkup-heritage] ${archetypeId} produced ${merged.length} material buckets `
      + `(cap ${PALETTE_BUCKET_CAP}). Reuse a palette bucket instead of a new material.`,
    );
  }

  const bounds = new THREE.Box3();
  const scratch = new THREE.Box3();
  for (const part of merged) {
    if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
    scratch.copy(part.geometry.boundingBox);
    bounds.union(scratch);
  }
  const size = bounds.isEmpty()
    ? new THREE.Vector3(bodyW, wallH + 2.6, bodyD)
    : bounds.getSize(new THREE.Vector3());

  // The building-only crop, published rather than inferred from geometry names — the same reason
  // `houses/index.js` publishes one. `residential-lab.js` deliberately shoots blind pairs on the
  // FULL bounds so both sides are a tile carrying a building; this box is for a hero or detail
  // station that genuinely wants the building.
  const frameBox = new THREE.Box3(
    new THREE.Vector3(-bodyW / 2 - 1.30, 0, backZ - 0.60),
    new THREE.Vector3(
      bodyW / 2 + 1.30,
      bounds.isEmpty() ? wallH + 2.0 : bounds.max.y,
      frontZ + 1.60,
    ),
  );

  return {
    parts: merged,
    openings: ctx.openings,
    openingSourceGeometries: [...openingSources],
    size,
    frameBox,
    source: 'residential-kit',
    fallback: false,
    kit: true,
    archetypeId,
    form: 'residential',
    ...(ctx.beauxRoofService ? { beauxRoofService: ctx.beauxRoofService } : {}),
    /** Everything a budget report needs, measured on the object the board draws. */
    ddStats: {
      archetypeId,
      facade,
      districtId,
      quality,
      buildings: buildingTriangles,
      lot: lotTriangles,
      total: buildingTriangles + lotTriangles,
      openingLeafTriangles: openingTriangles,
      buckets: merged.length,
      bucketNames: merged.map((m) => m.material?.userData?.family ?? 'unknown'),
      parts: ctx.parts.length,
      apertures: apertureCensus(archetypeId, ctx),
      signage: ctx.signage,
      ...(ctx.r79Retired ? { r79Retired: ctx.r79Retired } : {}),
      envelope: {
        bodyW: +bodyW.toFixed(4),
        bodyD: +bodyD.toFixed(4),
        wallH: +wallH.toFixed(4),
        frontZ: +frontZ.toFixed(4),
        backZ: +backZ.toFixed(4),
        lotHalf: lotW / 2,
      },
      bounds: bounds.isEmpty() ? null : {
        min: bounds.min.toArray().map((n) => +n.toFixed(4)),
        max: bounds.max.toArray().map((n) => +n.toFixed(4)),
      },
    },
    debugParts,
  };
}

/** One geometry per material — the residential kit's own merge, so the board sees one shape. */
function mergeByMaterial(parts, keepSources = false) {
  const buckets = new Map();
  for (const part of parts) {
    const k = part.material?.uuid ?? 'none';
    if (!buckets.has(k)) buckets.set(k, { material: part.material, geos: [] });
    buckets.get(k).geos.push(part.geometry);
  }
  const merged = [];
  for (const { material, geos } of buckets.values()) {
    const prepared = [];
    for (const raw of geos) {
      let g = raw;
      if (g.index) {
        const nonIndexed = g.toNonIndexed();
        if (!keepSources) g.dispose();
        g = nonIndexed;
      }
      const cloned = (keepSources && g === raw) ? g.clone() : g;
      for (const name of Object.keys(cloned.attributes)) {
        if (![
          'position', 'normal', 'uv',
          R72_ROLE_ATTRIBUTE, R72_MAP_ATTRIBUTE,
          R79_ROLE_ATTRIBUTE, R79_MAP_ATTRIBUTE,
        ].includes(name)) {
          cloned.deleteAttribute(name);
        }
      }
      if (!cloned.attributes.normal) cloned.computeVertexNormals();
      if (!cloned.attributes.uv) {
        const n = cloned.attributes.position.count;
        cloned.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      }
      prepared.push(cloned);
    }
    const geometry = prepared.length === 1 ? prepared[0] : mergeGeometries(prepared, false);
    if (!geometry) {
      for (let i = 1; i < prepared.length; i += 1) prepared[i].dispose();
      if (prepared[0]) {
        MaterialLibrary.ensureUv2(prepared[0]);
        merged.push({ geometry: prepared[0], material });
      }
      continue;
    }
    if (prepared.length > 1) for (const g of prepared) g.dispose();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    MaterialLibrary.ensureUv2(geometry);
    geometry.name = `residential:${material?.userData?.family ?? 'wall'}`;
    merged.push({ geometry, material });
  }
  return merged;
}
