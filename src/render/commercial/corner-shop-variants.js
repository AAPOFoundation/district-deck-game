// District Deck V3.70 — the three period corner-shop-and-dwelling variants (lane L4).
//
// Owner instruction, verbatim in substance: "Corner shop dwelling needs model improvement and 3
// variants on the map (think art deco, modern, victorian)."
//
// THREE WHOLE SUBJECTS, NOT THREE RESKINS. §5.4 already ruled on what separates a family of
// related subjects — "fenestration rhythm, entry treatment, roofline and lot treatment all
// separate a ladder without spending a triangle on width, and they separate it to a critic's eye
// rather than only to an IoU" — so the three differ in every one of those, plus the thing a
// corner shop is actually sorted on at board zoom: WHAT HAPPENS AT THE CORNER, and WHAT COVERS
// THE FOOTPATH.
//
//   id                      corner            footpath cover        roofline
//   shop-corner-victorian   45 deg splay      posted verandah,      high rendered parapet,
//                           tessellated       bullnose skillion,    moulded cornice, pediment,
//                           entry lobby       cast-iron lace        urns; gabled dwelling + chimney
//   shop-corner-deco        THREE-FACET       cantilevered slab     STEPPED parapet, vertical
//                           curved splay,     on rods, no posts     fluting, geometric relief;
//                           steel corner win                        flat-roofed rear wing
//   shop-corner-modern      ORTHOGONAL        thin cantilevered     flat parapet, slim coping;
//                           notch, no splay   blade, deep soffit    skillion dwelling, condenser
//
// Silhouette, measured by `l4var-silhouette.mjs` AFTER the photo-detail round rather than
// quoted from the round that first wrote this block. The figures here were 6.9 / 6.2 / 5.0 m at
// aspects 1.55 / 1.35 / 1.86 and none of the six was still true: the measured set is
//
//   shop-corner-victorian  7.39 m  aspect 0.884
//   shop-corner-deco       8.84 m  aspect 1.211   <- the mast; it is now the tallest of the three
//   shop-corner-modern     5.22 m  aspect 1.042
//
// Every pair still clears the probe on two of its three terms (the run is in `l4ph-sil.txt`),
// and the ORDER changed: the deco used to sit between the other two on height and now tops them,
// because a deco tower's skyline event is a mast and it had none. Recorded rather than silently
// corrected, because a stale silhouette comment is how a lane convinces itself a pair separates.

//
// §3.6 — THE ENVELOPE STAYS ON THE PAD. Every footpath cover here is clamped against the lot
// half-extent by the same `maxZ` discipline `corner-shop.js` uses, and the deco and modern
// cantilevers take their reach from `Math.min(proj, pad - z)` rather than from a wished-for
// number. The lane probe asserts it on every district x facade.
//
// §5.3 — the recess floor rides `recessFaces()` per FACE, not per member and not per material.
// Every lining, soffit, reveal cheek and interior backer authored in this file carries its level
// at the face that cannot see sky, and the faces that stand in full sun carry zero. Zero
// materials, zero triangles, nine buckets.

import { RECESS } from './surfaces.js';
import {
  METRICS, part, box, slab, taper, cyl, rotBox, recessFaces,
  hole, openWall, plinthCourse, plinthFacet, stringCourse, seamedGable, seamedSkillion, gutterRun,
  punchedWindow, commercialDoor, shopfrontBay, signBand, brickCourses, streaks,
  boardPlinth, lawnTufts, paverPath, paverField, kerbAndFootpath,
  shrubMass, canopyTree, hedgeRun, picketFence, plantedBed, binStore, lamp,
  yawParts, yawResult, corbelRun, tideCourse, verandahDeck, clothesline, chimneyFlashing,
  bikeRack, battenScreen, countAperture, mouldedPanel, quoinRun, pierWall,
} from './core.js';
// Read-only consumption of the shared signage facility. `reliefLetters` takes a material the
// building already owns and adds no bucket, which is the whole reason that route exists.
import { reliefLetters, fitCap } from '../signage/index.js';
// V3.71 lane H — the per-placement choice set. Pure function of `archetypeId | districtId |
// facade` (§3.3); see `corner-shop-tenancy.js` for why the recipe index is a permutation of
// the facade rather than a draw off it.
import { victorianTenancy, decoTenancy, modernTenancy } from './corner-shop-tenancy.js';

/** Salt namespace. The lane owns 5000-5999; `corner-shop.js` sits at 5600, these three above it. */
const S_VIC = 5620;
const S_DEC = 5650;
const S_MOD = 5680;

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * SHARED PIECES
 *
 * Deliberately few. Three subjects that share a lot layout and a dwelling generator are three
 * reskins, which is the fault §5.4 names; what is shared here is the SITE FURNITURE contract
 * (kerb, footpath, tray) that every lot on the board has to honour, and one chimney.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The two street frontages every corner lot has: the main footpath from `kerbAndFootpath`, and
 * the side street's own paved strip with its kerb.
 *
 * `unit` and `walkD` are per-variant on purpose — a Victorian bluestone footpath is laid in
 * bigger, squarer flags than a contemporary one, and it is one of the few lot cues that reads at
 * board zoom without spending a triangle.
 */
function cornerFootpaths(ctx, { unit = 1.10, walkD = 1.30, sideWalk = 1.30 }) {
  const { env, p } = ctx;
  const out = [];
  const padHalfW = env.lotW / 2;
  // ── V3.71 lane H r2 — bluestone, and `roof` RATHER THAN `shadow`, which the plate decided ──
  //
  // `trim` (138-150) was wrong: a near-white line the full width of the lot, along the bottom of
  // the frame, beside a footpath at plate 136 and under a wall at 156. `shadow` (46-52) was the
  // first correction and it was too far: `v371-h2-crush.mjs` on the r2a Victorian hero read the
  // literal-zero share at 4.417 % against r1's 3.169 %, and the 4x crop of the largest dark blob
  // shows why — with the kerb at the same value as the shaded footpath beside it, the whole
  // under-verandah strip merged into ONE dark mass with no step in it. That is §2.9's muddiness
  // test failing at the dark end instead of the light one, which is not an improvement.
  // `roof` (63-68) is a step below the footpath and three below the wall, keeps the band read,
  // and does not crush. The plate is the reason the number moved twice.
  out.push(...kerbAndFootpath(ctx, { walkD, kerbMaterial: p.roof }));
  out.push(...yawParts(paverField(ctx, {
    x: 0, z: 0, w: env.lotD - METRICS.rim * 2, d: sideWalk, unit, bed: false,
  }), Math.PI / 2, padHalfW - METRICS.rim - sideWalk / 2, 0));
  out.push(part(slab(0.22, 0.20, env.lotD - METRICS.rim * 2,
    padHalfW - METRICS.rim - 0.11, 0.0, 0, 'kerb-side'), p.roof));
  return out;
}

/** A brick chimney with a corbelled cap and pots. Victorian only — deco and modern have none. */
function chimney(ctx, { x, z, top, base = 0, pots = 2 }) {
  const p = ctx.p;
  const out = [
    part(slab(0.92, top - base, 0.78, x, base, z, 'chim-shaft'), p.wall),
    part(slab(1.10, 0.16, 0.96, x, top, z, 'chim-corbel'), p.trim),
    part(slab(1.24, 0.13, 1.08, x, top + 0.16, z, 'chim-cap'), p.trim),
  ];
  if (ctx.detail) {
    for (let i = 0; i < pots; i += 1) {
      const s = pots === 1 ? 0 : -1 + i * (2 / (pots - 1));
      // §2.10 — the pots are `trim`, not `wallAlt`. r12 §7 has "the bottle-green chimney pots"
      // standing open on `shop-corner` for four rounds; a terracotta pot in this palette is the
      // render bucket, and drawing it from the stallboard's green is how a 60-triangle object
      // became a colour fault. Not fixed by a floor — it is a hue fault and takes a bucket move.
      out.push(part(taper(0.17, 0.14, 0.46, x + s * 0.26, top + 0.29, z, 'chim-pot', 8), p.trim));
    }
  }
  return out;
}

/**
 * A run of cast-iron lace between two verandah posts: a top rail, a pierced frieze of
 * alternating drops, and a corner bracket at each end.
 *
 * §2 asks for "cast-iron lace if it earns its triangles". It earns them here because it is the
 * single silhouette cue that separates a Victorian shop verandah from every other footpath cover
 * in the kit — it is read as a broken edge against the sky rather than as a straight line — and
 * at 12 triangles a drop it costs less than one punched window.
 */
function ironLace(ctx, { x, z, w, y, drops = 10, name = 'lace' }) {
  if (!ctx.detail) return [];
  const p = ctx.p;
  const out = [
    part(box(w, 0.09, 0.06, x, y, z, `${name}-rail`), p.joinery),
  ];
  const dw = w / drops;
  for (let i = 0; i < drops; i += 1) {
    const u = x - w / 2 + (i + 0.5) * dw;
    const deep = i % 2 === 0 ? 0.26 : 0.15;
    out.push(part(box(dw * 0.30, deep, 0.045, u, y - 0.045 - deep / 2, z, `${name}-drop`), p.joinery));
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 1. VICTORIAN — shop-corner-victorian
 * ══════════════════════════════════════════════════════════════════════════════════════════ */


/**
 * The posted street verandah: a bullnose-profile skillion falling to the street on cast-iron
 * posts, with a lace frieze between them.
 *
 * This is NOT `awning()`. `awning()` builds a canvas blind on a wallplate, which is what the
 * base `shop-corner` has; a Victorian shop verandah is a roof — seamed metal on rafters, with a
 * fascia, a gutter, posts to the kerb and lace between them — and the difference is visible in
 * the silhouette from every board angle. The projection is clamped against `maxZ` exactly as
 * `awning()` clamps it, because §3.6 binds this member harder than any other on the subject.
 */
function postedVerandah(ctx, {
  x, z, w, y = 3.30, proj = 2.0, maxZ = null, name = 'ver', lace = true,
  // V3.71 lane H — the three things that separate one Melbourne shop verandah from the next one
  // down the street, and all three are free. `bullnose` turns the street edge down in three
  // stepped facets (the profile the type is recognised by) or leaves it a straight skillion with
  // a deeper fascia; `stripes` paints the bands down the fall; `postPitch` sets how many posts
  // stand under it. Defaults reproduce the r12 member set byte for byte, so every existing
  // caller and every instrument that measured this member still measures the same thing.
  bullnose = true, stripes = true, postPitch = 3.4, fall = 0.34,
}) {
  const p = ctx.p;
  const out = [];
  const limit = maxZ == null ? z + proj : Math.min(z + proj, maxZ);
  const reach = Math.max(0.7, limit - z);
  const zc = z + reach / 2;
  const angle = Math.atan2(fall, reach);
  const eaveY = y - fall;

  // Deck: seamed metal on rafters. The soffit face carries the §5.3 floor; the weathered top
  // stands in full sun and is untouched.
  out.push(part(recessFaces(
    rotBox(w, 0.10, reach, x, y - fall / 2, zc, { x: angle }, `${name}-deck`),
    RECESS.soffit, ['ny'],
  ), p.roof));
  const rafters = Math.max(3, Math.round(w / 1.7));
  for (let i = 0; i < rafters; i += 1) {
    const u = x - w / 2 + (i + 0.5) * (w / rafters);
    out.push(part(recessFaces(
      rotBox(0.085, 0.085, reach, u, y - fall / 2 - 0.09, zc, { x: angle }, `${name}-rafter`),
      RECESS.soffit, ['ny', 'px', 'nx'],
    ), p.joinery));
  }
  if (ctx.detail) {
    // Lining boards across the reach — the underside of a verandah is boarded, and the boards
    // run across it. Six battens, and the soffit stops being a plane the moment they cast.
    const lines = Math.max(3, Math.round(reach / 0.46));
    for (let i = 0; i < lines; i += 1) {
      const t = (i + 0.5) / lines;
      out.push(part(recessFaces(
        box(w - 0.06, 0.035, 0.05, x, y - fall * t - 0.055, z + reach * t, `${name}-lining`),
        RECESS.soffit, ['ny', 'pz', 'nz'],
      ), p.wallAlt));
    }
    // ── THE STRIPES ────────────────────────────────────────────────────────────────────────
    //
    // A Melbourne bullnose verandah is painted in bands DOWN the fall, and it is the one thing
    // about this member that reads at board zoom. Without them the deck is a plain dark seamed
    // slab, which is precisely what `shop-corner`'s awning already is — the critic sorted the
    // two subjects as one object partly on this surface. Painted bands in `trim` over a `roof`
    // deck, every second module, 3 mm proud so each throws its own edge.
    if (stripes) {
      const bands = Math.max(4, Math.round(w / 0.55));
      const bw = (w - 0.10) / bands;
      for (let i = 0; i < bands; i += 1) {
        if (i % 2 === 0) continue;
        out.push(part(rotBox(bw - 0.05, 0.03, reach - 0.02,
          x - w / 2 + 0.05 + (i + 0.5) * bw, y - fall / 2 + 0.06, zc, { x: angle },
          `${name}-stripe`), p.trim));
      }
    }
  }
  // THE BULLNOSE. A Melbourne shop verandah of this era turns down at the street edge, and that
  // curve is the profile the whole type is recognised by. Three stepped facets, not a cylinder.
  //
  // V3.71 lane H — and the OTHER Melbourne profile is a straight skillion that stops at a deep
  // boarded fascia, which is what the same street carries three doors down. It is the same
  // member count (three), turned through a smaller angle and stood upright, so the two read as
  // two profiles rather than as one profile with a piece missing.
  for (let i = 0; i < 3; i += 1) {
    const t = (i + 0.5) / 3;
    const tilt = bullnose ? angle + (i + 1) * 0.30 : angle;
    const dropY = bullnose ? eaveY - 0.055 - t * 0.24 : eaveY - 0.055 - t * 0.13;
    const dropZ = bullnose ? z + reach + 0.06 + t * 0.11 : z + reach + 0.05 + t * 0.015;
    out.push(part(recessFaces(
      rotBox(w, 0.09, bullnose ? 0.20 : 0.15, x, dropY, dropZ, { x: tilt }, `${name}-bullnose`),
      RECESS.soffit, ['ny'],
    ), p.roof));
  }
  // ── §2.9, r2: THE VERANDAH FASCIA IS THE WIDEST HORIZONTAL AT EYE LEVEL AND IT WAS `trim` ──
  //
  // `_reference-landmarks/mp-shopcorner-victorian.png` hangs a DARK GREEN fascia and valance the
  // full width of both frontages, over a striped canvas, and that band is most of what separates
  // the reference's lower half from ours: [MEASURED] on the r1 critic's own hero, our parapet
  // reads plate 158, the sunlit splay 156 and the footpath 136, with nothing large between 96 and
  // the tray. A near-white fascia over glazing measured at 98-104 put a third large surface in
  // the same band. `joinery` on this scheme is the OXBLOOD the period actually painted its
  // verandah ironwork, and it is already the bucket carrying the posts, gutter and bead directly
  // beside this member — so the fascia now matches the frame it belongs to instead of the parapet
  // three metres above it.
  out.push(part(box(w + 0.08, bullnose ? 0.20 : 0.32, 0.11, x,
    eaveY - (bullnose ? 0.40 : 0.34), z + reach + 0.22, `${name}-fascia`), p.joinery));
  out.push(part(box(w + 0.10, 0.13, 0.15, x, eaveY - 0.56, z + reach + 0.26, `${name}-gutter`), p.joinery));
  out.push(part(box(w + 0.14, 0.05, 0.05, x, eaveY - 0.49, z + reach + 0.33, `${name}-gutter-bead`), p.joinery));
  // Wallplate at the building face, drawn from `trim` and carrying the soffit floor on the three
  // faces the footpath can see. r12 §2.1 paid for this once already on `awning()`: the same
  // member drawn from `joinery` prints a dead-black line the length of the frontage whether or
  // not there is a hole under it, and it was 3,183 px of MAJ-3.
  out.push(part(recessFaces(
    box(w + 0.10, 0.09, 0.13, x, y + 0.06, z + 0.02, `${name}-wallplate`),
    RECESS.soffit, ['ny', 'pz', 'py'],
  ), p.trim));

  const postTop = eaveY - 0.44;
  const postZ = z + reach - 0.04;
  const posts = Math.max(2, Math.round(w / postPitch));
  const laceRuns = [];
  for (let i = 0; i < posts; i += 1) {
    const px = posts === 1 ? x : x - w / 2 + 0.26 + i * ((w - 0.52) / (posts - 1));
    out.push(part(cyl(0.068, postTop, px, postTop / 2, postZ, 'y', `${name}-post`, 8), p.joinery));
    // ── THE CAPITAL, WHICH THE PLATE SAID WAS NOT THERE ─────────────────────────────────────
    //
    // [SEEN] `vd2/shop-corner-victorian--street.png` crop (700,460)-(1000,680) at 3.2x and the
    // 3q crop (660,620)-(980,830): the posts are plain brown sticks running straight into the
    // brown fascia with no widening at the head at all. The `-post-cap` member is real, and it
    // is 0.18 across against a post 0.136 across — 22 mm a side, which is under a pixel at every
    // station this lane shoots. A cast-iron verandah post is read on its CAPITAL: an abacus that
    // oversails the post by half its own width again, on a necking ring under it.
    //
    // One extra box a post, 12 triangles, six posts. The abacus widens to 0.26 so it oversails
    // by 62 mm a side, and the necking under it is the member that makes the two read as a
    // capital rather than as a lid.
    // r3 §5.5.10 — the capital, necking and base are CAST IRON: they are the post's own members
    // and the post is `joinery`. Drawn from `trim` they put three near-white blocks per post in
    // the middle of the dark verandah frame the reference reads as one continuous line. Five
    // posts a frontage, and it is the joinery line §5.5.10 names, broken by its own fittings.
    out.push(part(recessFaces(box(0.26, 0.09, 0.26, px, postTop - 0.045, postZ,
      `${name}-post-cap`), RECESS.soffit, ['ny']), p.joinery));
    out.push(part(recessFaces(box(0.19, 0.07, 0.19, px, postTop - 0.13, postZ,
      `${name}-post-neck`), RECESS.soffit, ['ny']), p.joinery));
    out.push(part(box(0.16, 0.10, 0.16, px, 0.30, postZ, `${name}-post-base`), p.joinery));

    out.push(part(box(0.24, 0.09, 0.24, px, 0.05, postZ, `${name}-post-foot`), p.paving));
    if (ctx.detail) {
      // ── THE BRACKET IS A SPANDREL PLATE, NOT A ROD ──────────────────────────────────
      //
      // [SEEN] `_reference-landmarks/mp-shopcorner-victorian.png` (13:12): the reference's
      // cast iron is a pierced SCROLL at each post head, and it is one of the four things that
      // name the type on that plate. Ours was a 55 mm square rod on the diagonal, which at
      // this lane's stations is a hairline — [SEEN] `vd2/shop-corner-victorian--street.png`
      // crop (700,460)-(1000,680) at 3.2x, where the post runs into the fascia with nothing
      // at the junction at all.
      //
      // Same member, same 12 triangles: 0.14 m deep on the diagonal instead of 0.055, so it
      // presents a face to the sun and reads as the triangle of iron it is meant to be.
      for (const dir of [-1, 1]) {
        out.push(part(rotBox(0.56, 0.14, 0.06, px + dir * 0.19, postTop - 0.21, postZ,
          { z: dir * 0.66 }, `${name}-bracket`), p.joinery));
      }
    }
    if (i > 0) laceRuns.push([px, posts === 1 ? x : x - w / 2 + 0.26 + (i - 1) * ((w - 0.52) / (posts - 1))]);
  }
  if (lace) {
    for (const [a, b] of laceRuns) {
      const span = Math.abs(a - b) - 0.16;
      if (span < 0.5) continue;
      out.push(...ironLace(ctx, {
        x: (a + b) / 2, z: postZ, w: span, y: postTop - 0.12,
        drops: Math.max(5, Math.round(span / 0.42)), name: `${name}-lace`,
      }));
    }
  }
  return out;
}

/**
 * The Victorian corner: a 45 degree splay with a tessellated entry lobby set 0.95 m back, its
 * door at the BACK of the lobby with a fanlight over, and the tiled dado turning into it.
 *
 * The lobby is what puts the door in shadow while its own returns stay lit, and every member
 * inside it carries its §5.3 level — lining for the returns and the head, soffit for the ceiling,
 * sash for the dado and the fanlight rail, interior for the well behind the leaf. The three
 * members that FORM the opening carry the floor on their CUT faces only: a jamb's street face is
 * corbelled brick in full sun and gets nothing.
 */
function victorianEntry(ctx, { cx, cz, splay, wallTop, doorW = 1.32, doorH = 2.48 }) {
  const { p } = ctx;
  const out = [];
  const splayLen = Math.hypot(splay, splay);
  const YAW = Math.PI / 4;
  const LOBBY = 0.95;
  const lobW = doorW + 0.36;
  const jamb = (splayLen - doorW - 0.36) / 2;

  out.push(...yawParts([
    part(recessFaces(box(jamb, wallTop, METRICS.wallDepth, -(doorW / 2 + 0.18 + jamb / 2),
      wallTop / 2, 0, 'vsplay-jamb-l'), 1, ['px']), p.wall),
    part(recessFaces(box(jamb, wallTop, METRICS.wallDepth, (doorW / 2 + 0.18 + jamb / 2),
      wallTop / 2, 0, 'vsplay-jamb-r'), 1, ['nx']), p.wall),
    part(recessFaces(box(lobW, wallTop - doorH - 0.36, METRICS.wallDepth, 0,
      doorH + 0.36 + (wallTop - doorH - 0.36) / 2, 0, 'vsplay-head'), 1, ['ny']), p.wall),
    // The lobby: two return walls, a lit rendered soffit, a stepped tessellated floor.
  // ── V3.71 lane H r2, MAJOR 2 ────────────────────────────────────────────────────────────
  // Every member below is an INWARD-FACING surface inside an entry recess, which is the case
  // §5.3's refinement measures the GTAO multiplier at 0.225 rather than 0.328. At that floor
  // `RECESS.lining` (k 1.000) and `RECESS.interior` (k 0.720) both land UNDER the 0.0073 display
  // clip — the arithmetic is in `surfaces.js RECESS.deep` — which is why an entry lobby renders
  // as a hole through the envelope while the shallow reveals beside it read correctly.
  // `RECESS.deep` (k 1.360) is the same attribute at a level sized for the stacked case.
  // Zero materials, zero triangles.
    part(box(0.14, doorH + 0.72, LOBBY, -(lobW / 2 - 0.07), (doorH + 0.72) / 2, -LOBBY / 2, 'vsplay-return'), p.wall, RECESS.deep),
    part(box(0.14, doorH + 0.72, LOBBY, (lobW / 2 - 0.07), (doorH + 0.72) / 2, -LOBBY / 2, 'vsplay-return'), p.wall, RECESS.deep),
    part(box(lobW, 0.12, LOBBY, 0, doorH + 0.72, -LOBBY / 2, 'vsplay-soffit'), p.trim, RECESS.deep),
    // The glazed tile dado turning the corner into the lobby, capped.
    part(box(0.07, 0.58, LOBBY - 0.06, -(lobW / 2 - 0.17), 0.35, -LOBBY / 2, 'vsplay-tile'), p.wallAlt, RECESS.sash),
    part(box(0.07, 0.58, LOBBY - 0.06, (lobW / 2 - 0.17), 0.35, -LOBBY / 2, 'vsplay-tile'), p.wallAlt, RECESS.sash),
    part(box(0.09, 0.06, LOBBY - 0.06, -(lobW / 2 - 0.17), 0.67, -LOBBY / 2, 'vsplay-tile-cap'), p.trim, 1),
    part(box(0.09, 0.06, LOBBY - 0.06, (lobW / 2 - 0.17), 0.67, -LOBBY / 2, 'vsplay-tile-cap'), p.trim, 1),
    // Dark behind the leaf only, never behind the whole entry.
    part(box(lobW - 0.20, doorH + 0.64, 0.24, 0, (doorH + 0.64) / 2, -LOBBY - 0.10, 'vsplay-well'), p.shadow, RECESS.deep),
    // The step is 0.17 deep and reaches z 0.41 so the threshold mat's OUTER row lands on it
    // rather than 60 mm above it — the mat now steps out of the lobby (see the block below) and
    // its front row would otherwise float over a 0.11 step. Same member, two numbers.
    part(slab(doorW + 0.70, 0.17, 0.46, 0, 0.0, 0.18, 'vsplay-step'), p.paving),
    part(slab(lobW, 0.06, LOBBY, 0, 0.11, -LOBBY / 2, 'vsplay-floor'), p.paving, RECESS.deep),
    part(box(doorW + 0.74, 0.21, 0.29, 0, doorH + 0.46, 0.08, 'vsplay-lintel'), p.trim),
  ], YAW, cx, cz));

  // THE TESSELLATED THRESHOLD. Named in the brief for this variant and it is the one detail a
  // Melbourne shop entry is identified by: a chequer of proud encaustic tiles, 5 x 3, standing
  // 30 mm off the lobby floor so each throws its own edge.
  //
  // ── AND IT BELONGS OUTSIDE THE LOBBY, NOT IN IT ─────────────────────────────────────────
  //
  // [SEEN] `_reference-landmarks/mp-shopcorner-victorian.png` (13:12): the reference lays its
  // diamond-tiled threshold on the FOOTPATH in front of the door, fully lit, where it is one of
  // the four or five details that read at any zoom. Ours was laid on the lobby floor 0.95 m
  // inside a recess under a verandah — [SEEN] `vd2/shop-corner-victorian--three-quarter.png`
  // crop (660,620)-(980,830) at 3.2x, where it is a faint mottle on a pale plane.
  //
  // The mat now steps OUT over the entry step onto the paving, and its rear rows still run into
  // the lobby so it reads as one floor turning the threshold rather than as a rug dropped on the
  // footpath. Same 5 x 3 chequer, same 7 tiles, same 84 triangles: the z origin moves by one
  // lobby depth and the tiles are `wallAlt` glazed tile against `paving`.

  if (ctx.detail) {
    const tiles = [];
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 5; c += 1) {
        if ((r + c) % 2 === 0) continue;
        // ── THE CHEQUER WAS PALE-ON-PALE, WHICH IS THE r2 STALLBOARD FAULT IN A DIFFERENT
        // BUCKET ────────────────────────────────────────────────────────────────────────────
        //
        // [SEEN] `vd2/shop-corner-victorian--three-quarter.png` crop (660,620)-(980,830) at
        // 3.2x: the lobby floor IS visible from the 3q station — it is not the arch-head case —
        // and the chequer on it is a faint mottle rather than a pattern. `trim` renders at 138
        // on this scheme and `paving`, the floor it stands on, at 88; a 50-luma step at 30 mm of
        // relief inside a 0.95 m lobby that carries the lining floor is not enough separation to
        // survive the plate.
        //
        // `wallAlt` is the glazed-tile bucket on this subject — it is what the entry DADO two
        // members above is already drawn from — and it renders at 48. A dark chequer on a pale
        // floor is a 40-luma step the other way with the same 7 members and the same 84
        // triangles. Zero triangles, zero materials, one bucket.
        tiles.push(part(box(lobW / 5 - 0.03, 0.03, LOBBY / 3 - 0.03,
          -lobW / 2 + (c + 0.5) * (lobW / 5), 0.185, 0.30 - (r + 0.5) * (LOBBY / 3),
          'vsplay-mosaic'), p.wallAlt, r === 2 ? 1 : 0));

      }
    }
    out.push(...yawParts(tiles, YAW, cx, cz));
  }
  const door = yawResult(commercialDoor(ctx, {
    x: 0, y: doorH / 2 + 0.17, z: -LOBBY + 0.06, w: doorW, h: doorH,
    id: 'vshop-door', label: 'Shop door', glazed: true, leafMaterial: p.joinery,
  }), YAW, cx, cz);
  out.push(...yawParts([
    part(box(doorW - 0.06, 0.20, 0.05, 0, doorH + 0.53, -LOBBY + 0.10, 'vsplay-fanlight'), p.glass),
    part(box(doorW + 0.18, 0.08, 0.10, 0, doorH + 0.41, -LOBBY + 0.12, 'vsplay-fan-rail'), p.joinery, RECESS.sash),
  ], YAW, cx, cz));
  return { parts: out, opening: door.opening, doorParts: door.parts };
}

export function buildShopCornerVictorian(ctx) {
  const { env, p } = ctx;
  const add = (produced) => ctx.add(produced);
  // V3.71 lane H — this placement's own tenancy. Four recipes, permuted by district so the four
  // facades of one district are always four different shops; see `corner-shop-tenancy.js`.
  const T = victorianTenancy(ctx);
  // The dwelling storey's finish: ashlar render through, a darker painted render, or render with
  // a picked-out string course under the sills. A bucket swap plus at most one member, and it is
  // the first thing that separates two of these standing side by side at board zoom.
  const upWallMat = T.upperFinish === 'painted' ? p.wallAlt : p.wall;

  const halfW = env.bodyW / 2;
  const frontZ = env.frontZ;
  const shopD = 7.30;
  const backZ = frontZ - shopD;
  /* ══ §5.3.11 — TWO STOREYS, AND THE DWELLING IS THE UPPER ONE ══════════════════════════════
   *
   * [SEEN] `_reference-landmarks/mp-shopcorner-victorian.png` (13:12), read at 1024 x 683 and
   * again on the crop (330,80)-(1220,520) at 1.5x. The plate is a TWO-STOREY building: a shop
   * behind a posted verandah, and over it a full dwelling storey carrying five tall arch-headed
   * sashes — two on each frontage and one on the splay — each with a moulded architrave and a
   * sill on two console brackets. Above them a modillion cornice, a balustraded parapet between
   * urned piers, a triangular pediment over the splay, and a hipped seamed roof rising behind
   * the parapet with a rendered chimney at the rear.
   *
   * What this file had was a single-storey shop with the dwelling BEHIND it as a gabled wing.
   * `content.js:96` has registered this id as `storeys: 2` since the day it was written, and the
   * incumbent's own label is "Corner shop and dwelling" — three records said two storeys and only
   * the model dissented.
   *
   * So the mass is re-cut rather than raised: the rear wing's walls, gable, windows, chimney and
   * back verandah are DELETED and rebuilt over the shop, and the ground floor takes the depth the
   * wing vacated (5.45 -> 7.30). Everything the parapet block below already builds — cornice,
   * corbels, balustrade, piers, urns, pediment, roof deck — springs from `wallTop`, so it rides
   * up with the storey without being re-authored.
   */
  const groundTop = 4.15;               // the first-floor line, i.e. the shop's own wall head
  const upperH = 3.60;                  // the dwelling storey over it: boom-era rooms are tall
  const wallTop = groundTop + upperH;   // 7.75 — where the cornice and parapet spring
  const splay = 1.82;
  const padHalfD = env.lotD / 2;
  const padHalfW = env.lotW / 2;
  const midZ = (frontZ + backZ) / 2;
  const rightX = halfW;
  const leftX = -halfW;
  const frontRunHi = rightX - splay;
  const rightRunLo = frontZ - splay;
  const sillY = 0.78;
  const headY = 3.24;

  /* ── lot ─────────────────────────────────────────────────────────────────────────── */
  add(boardPlinth(ctx, { lawn: true }));
  // Bluestone flagging: big squarish flags, which is what a nineteenth-century footpath is.
  add(cornerFootpaths(ctx, { unit: 1.45, walkD: 1.40, sideWalk: 1.35 }));

  /* ── the shop box ────────────────────────────────────────────────────────────────── */
  // ── FENESTRATION PROPORTION, WHICH IS ONE OF THE FIVE THINGS THAT WAS THE INCUMBENT'S ────
  //
  // The bays were 2.85 wide by 2.36 high — landscape, aspect 1.21, which is an Edwardian shop
  // window and is what `shop-corner` has. A boom-era shopfront is PORTRAIT between heavy
  // pilasters: narrower, taller, and arched at the head. 2.30 by 2.46 puts the aspect at 0.93
  // and the head 220 mm higher, and it costs nothing — the openings and their frames are sized
  // off these two numbers.
  const bays = [
    { x: leftX + 2.10 + T.shopBayShift, w: 2.30 },
    { x: leftX + 5.30 - T.shopBayShift, w: 2.30 },
  ];
  const frontOpenings = bays.map((b) => hole(b.x, sillY, b.w, headY - sillY));
  const sideWinZ = (rightRunLo + backZ) / 2 + 0.35;
  const sideBayW = 1.42;

  add(openWall(ctx, {
    material: p.wall, axis: 'x', face: 1, plane: frontZ,
    centre: (leftX + frontRunHi) / 2, run: frontRunHi - leftX,
    y0: 0, y1: groundTop, depth: METRICS.wallDepth, openings: frontOpenings, name: 'vshop-front',
  }));
  // The residence door moves DOWN, not away. With the dwelling over the shop the household is
  // entered from the side street through its own door beside the shopfront, which is what the
  // reference plate shows on that elevation and what the type actually does — a separate street
  // door to a stair. It is punched out of the side wall rather than stood in front of it.
  const resDoorZ = backZ + 1.15;
  const resDoorW = 1.06;
  const resDoorH = 2.36;
  add(openWall(ctx, {
    material: p.wall, axis: 'z', face: 1, plane: rightX,
    centre: (rightRunLo + backZ) / 2, run: rightRunLo - backZ,
    y0: 0, y1: groundTop, depth: METRICS.wallDepth,
    openings: [hole(sideWinZ, sillY, sideBayW, headY - sillY),
      hole(resDoorZ, 0, resDoorW, resDoorH)], name: 'vshop-right',
  }));
  add(openWall(ctx, {
    material: p.wall, axis: 'z', face: -1, plane: leftX, centre: midZ, run: shopD,
    y0: 0, y1: groundTop, depth: METRICS.wallDepth, name: 'vshop-left',
  }));
  add(openWall(ctx, {
    material: p.wall, axis: 'x', face: -1, plane: backZ, centre: 0, run: halfW * 2,
    y0: 0, y1: groundTop, depth: METRICS.wallDepth, name: 'vshop-back',
  }));
  add([
    part(box(halfW * 2 - 1.8, groundTop - 0.2, shopD - 1.8, 0, groundTop / 2, midZ, 'vshop-room'),
      p.shadow, RECESS.interior),
    part(slab(halfW * 2 - 0.9, 0.10, shopD - 0.9, 0, 0.05, midZ, 'vshop-floor'), p.paving),
  ]);
  // What is behind the glass: a back-shelf stack and a counter with a till. Every one of these
  // is in a bucket the subject already carries, and they are what a shop window is FOR.
  if (ctx.detail) {
    const shelfZ = backZ + 1.05;
    add([
      part(slab(halfW * 1.5, 1.62, 0.34, -halfW * 0.16, 0.45, shelfZ, 'vfit-shelf'), p.wallAlt),
      // ── r3 §5.5.10 — WHAT IS BEHIND THE PANE IS DRAWN DOWN THE DARK HALF OF THE LADDER ────
      //
      // r2 measured this on `shop-corner-modern` and wrote the verdict into `fixedGlazing`: its
      // first fitout put `trim` boards behind the glass and TWO OF THREE MEASURED PANES WENT UP
      // (138.7 -> 138.9, 157.2 -> 168.4, 149.2 -> 159.9), because "a shop interior read through
      // daylit glass is DARK with structure in it". That verdict reached `shopfrontBay`'s backer
      // and did NOT reach the shelf boards and counter top standing in front of it, which are
      // the palest members inside the window on this subject. `roof` keeps them a clear step
      // above the `shadow` backer and out of the top band.
      part(slab(halfW * 1.5, 0.07, 0.42, -halfW * 0.16, 1.14, shelfZ - 0.04, 'vfit-shelf-b'), p.roof),
      part(slab(halfW * 1.5, 0.07, 0.42, -halfW * 0.16, 1.70, shelfZ - 0.04, 'vfit-shelf-c'), p.roof),
      part(slab(halfW * 1.1, 0.31, 0.26, -halfW * 0.16, 1.22, shelfZ - 0.10, 'vfit-stock-a'), p.roof),
      part(slab(halfW * 0.8, 0.27, 0.26, -halfW * 0.26, 1.77, shelfZ - 0.10, 'vfit-stock-b'), p.roof),
      part(slab(2.7, 1.02, 0.62, halfW - 2.3, 0.0, frontZ - 2.15, 'vfit-counter'), p.wallAlt),
      part(slab(2.84, 0.09, 0.72, halfW - 2.3, 1.02, frontZ - 2.15, 'vfit-counter-top'), p.roof),
      part(slab(0.42, 0.34, 0.34, halfW - 1.4, 1.11, frontZ - 2.15, 'vfit-till'), p.joinery),
    ]);
  }

  /* ── the splayed entry ───────────────────────────────────────────────────────────── */
  const splayCx = rightX - splay / 2;
  const splayCz = frontZ - splay / 2;
  const splayLen = Math.hypot(splay, splay);
  const entry = victorianEntry(ctx, { cx: splayCx, cz: splayCz, splay, wallTop: groundTop });
  add(entry.parts);
  add(entry.doorParts);
  if (entry.opening) ctx.addOpening(entry.opening);

  /* ── shopfronts ──────────────────────────────────────────────────────────────────── */
  for (let i = 0; i < bays.length; i += 1) {
    add(shopfrontBay(ctx, {
      x: bays[i].x, z: frontZ, w: bays[i].w, sillY, headY,
      id: `vshop-win-${i}`, interactive: i === 0, label: 'Shop window',
      // r5 — REVERTED to `RECESS.interior` under §5.5.20; measured inert at ~0.03 points in r4
      // and the sole cause of that round's pane overshoot. The parameter is stated rather than
      // omitted so the call site still decides its own level (r3 critic residue 2).
      interiorRecess: RECESS.interior,
    }));
  }
  add(yawParts(shopfrontBay(ctx, {
    x: 0, z: 0, w: sideBayW, sillY, headY, id: 'vshop-win-side', interiorRecess: RECESS.interior,
  }).parts, Math.PI / 2, rightX, sideWinZ));

  // The residence's own street door, in the side wall it is punched out of, under a bracketed
  // hood. It leads to the stair, which is the whole point of the storey above it.
  add(commercialDoor(ctx, {
    x: rightX, y: resDoorH / 2 + 0.06, z: resDoorZ, w: resDoorW, h: resDoorH,
    facing: 'right', id: 'vdwell-door', label: 'Residence door', leafMaterial: p.wallAlt,
  }));
  add([
    part(box(0.92, 0.12, 1.74, rightX + 0.46, resDoorH + 0.42, resDoorZ, 'vdwell-hood'), p.roof),
    part(recessFaces(box(0.86, 0.06, 1.60, rightX + 0.46, resDoorH + 0.34, resDoorZ,
      'vdwell-hood-soffit'), RECESS.soffit, ['ny']), p.trim),
    part(box(1.00, 0.13, 0.13, rightX + 0.46, resDoorH + 0.34, resDoorZ + 0.87, 'vdwell-hood-fascia'), p.trim),
    part(box(1.00, 0.13, 0.13, rightX + 0.46, resDoorH + 0.34, resDoorZ - 0.87, 'vdwell-hood-fascia'), p.trim),
  ]);
  if (ctx.detail) {
    for (const s of [-1, 1]) {
      add([part(rotBox(0.48, 0.055, 0.055, rightX + 0.18, resDoorH + 0.30, resDoorZ + s * 0.64,
        { z: -0.72 }, 'vdwell-hood-bracket'), p.joinery)]);
    }
  }

  /* ══ THE DWELLING STOREY ═══════════════════════════════════════════════════════════════════
   *
   * [SEEN] `_reference-landmarks/mp-shopcorner-victorian.png` crop (330,80)-(1220,520) at 1.5x:
   * five tall arch-headed sashes — two per frontage plus one on the splay — each narrow (about
   * 1:2), each with a projecting sill carried on two console brackets, and rusticated quoins
   * running up every corner of THIS storey rather than the one behind the verandah. Six here
   * rather than five, because our front run is 8.2 m against the plate's four-bay frontage and a
   * boom-era first floor is densely fenestrated; the rhythm is deliberately three-against-two
   * over the shopfront's two bays, which is what an upper floor of this type does.
   */
  const upSill = groundTop + 0.92;
  const upWinH = 2.10;
  const upWinW = 1.16;
  const upFront = [];
  const frontRunU = frontRunHi - leftX;
  // OPENING RHYTHM, which is the third of the four axes §5.3.11 named. Three sashes reads as a
  // wide-bayed boom-era first floor; four reads as a dense one. Both are on the street, and the
  // rhythm change is legible in silhouette against the verandah below it. The sash NARROWS at
  // four so the wall between them stays a wall rather than a mullion.
  const upN = T.upperSashes;
  const upW = upN >= 4 ? upWinW * 0.86 : upWinW;
  for (let i = 0; i < upN; i += 1) {
    upFront.push(hole(leftX + 0.95 + (i + 0.5) * ((frontRunU - 1.90) / upN), upSill, upW, upWinH));
  }
  const upSideRun = rightRunLo - backZ;
  const upSide = [];
  for (let i = 0; i < 2; i += 1) {
    upSide.push(hole(backZ + 0.95 + (i + 0.5) * ((upSideRun - 1.90) / 2), upSill, upWinW, upWinH));
  }
  add(openWall(ctx, {
    material: upWallMat, axis: 'x', face: 1, plane: frontZ, centre: (leftX + frontRunHi) / 2,
    run: frontRunU, y0: groundTop, y1: wallTop, depth: METRICS.wallDepth,
    openings: upFront, name: 'vup-front',
  }));
  add(openWall(ctx, {
    material: upWallMat, axis: 'z', face: 1, plane: rightX, centre: (rightRunLo + backZ) / 2,
    run: upSideRun, y0: groundTop, y1: wallTop, depth: METRICS.wallDepth,
    openings: upSide, name: 'vup-right',
  }));
  add(openWall(ctx, {
    material: upWallMat, axis: 'z', face: -1, plane: leftX, centre: midZ, run: shopD,
    y0: groundTop, y1: wallTop, depth: METRICS.wallDepth, name: 'vup-left',
  }));
  add(openWall(ctx, {
    material: upWallMat, axis: 'x', face: -1, plane: backZ, centre: 0, run: halfW * 2,
    y0: groundTop, y1: wallTop, depth: METRICS.wallDepth, name: 'vup-back',
  }));
  // Lapped onto the ground floor's own room box rather than left hanging in the middle of the
  // building. The modern's identical member was reported `FLOAT ... at y 5.00`; this one escaped
  // only because a chimney shaft happens to pass through it, which is a coincidence, not support.
  add([part(box(halfW * 2 - 1.8, upperH + 0.30, shopD - 1.8, 0, (groundTop + wallTop) / 2 - 0.05,
    midZ, 'vup-room'), p.shadow, RECESS.interior)]);

  // The splay carries the storey too — that is the whole reason the reference reads as one
  // building rather than as a box with a chamfer at its foot. Built in the splay's own local
  // frame with the four cut faces carrying the §5.3 lining floor, exactly as `openWall` does it,
  // and yawed on with the wall face at local +0.17 to match the jambs below.
  const upSplayW = 1.34;
  const SPF = 0.17;                       // the splay wall's outward face, local
  const upHeadY = upSill + upWinH;
  const upCheek = (splayLen - upSplayW) / 2;
  add(yawParts([
    part(recessFaces(box(splayLen, upSill - groundTop, METRICS.wallDepth, 0,
      (groundTop + upSill) / 2, 0, 'vup-splay'), 1, ['py']), upWallMat),
    part(recessFaces(box(splayLen, wallTop - upHeadY, METRICS.wallDepth, 0,
      (upHeadY + wallTop) / 2, 0, 'vup-splay'), 1, ['ny']), upWallMat),
    part(recessFaces(box(upCheek, upWinH, METRICS.wallDepth, -(upSplayW + upCheek) / 2,
      upSill + upWinH / 2, 0, 'vup-splay'), 1, ['px']), upWallMat),
    part(recessFaces(box(upCheek, upWinH, METRICS.wallDepth, (upSplayW + upCheek) / 2,
      upSill + upWinH / 2, 0, 'vup-splay'), 1, ['nx']), upWallMat),
  ], Math.PI / 4, splayCx, splayCz));

  /* The sashes. `curtain: true` on all of them: the owner's requirement for this subject is a
   * dwelling with curtained windows, and until this round every one of them was on a rear wing
   * that faced the back fence. */
  for (let i = 0; i < upFront.length; i += 1) {
    const o = upFront[i];
    add(punchedWindow(ctx, {
      x: o.u, y: o.y + o.height / 2, z: frontZ, w: o.width, h: o.height,
      lights: 2, id: `vup-front-${i}`, curtain: true,
    }));
  }
  for (let i = 0; i < upSide.length; i += 1) {
    const o = upSide[i];
    add(punchedWindow(ctx, {
      x: rightX, y: o.y + o.height / 2, z: o.u, w: o.width, h: o.height,
      facing: 'right', lights: 2, id: `vup-side-${i}`, curtain: true,
    }));
  }
  add(yawParts(punchedWindow(ctx, {
    x: 0, y: upSill + upWinH / 2, z: SPF, w: upSplayW, h: upWinH,
    lights: 2, id: 'vup-splay-win', curtain: true,
  }).parts, Math.PI / 4, splayCx, splayCz));
  // The splay sash's architrave, which is where the cartouche's 44 triangles went. The plate
  // gives every upper sash a moulded surround and gives the splay one the fullest: two jamb
  // strips carried past the lintel and a keystone over it. Three boxes, 36 triangles, on the one
  // opening both hero stations look straight down the axis of.
  add(yawParts([
    part(box(0.16, upWinH + 0.34, 0.10, -(upSplayW / 2 + 0.19), upSill + upWinH / 2 + 0.04,
      SPF + 0.05, 'vup-splay-arch'), p.trim),
    part(box(0.16, upWinH + 0.34, 0.10, upSplayW / 2 + 0.19, upSill + upWinH / 2 + 0.04,
      SPF + 0.05, 'vup-splay-arch'), p.trim),
    part(recessFaces(box(0.30, 0.40, 0.13, 0, upSill + upWinH + 0.26, SPF + 0.07,
      'vup-splay-key'), RECESS.soffit, ['ny']), p.trim),
  ], Math.PI / 4, splayCx, splayCz));

  // THE SILL ON TWO CONSOLES. It is the reference's most repeated small move on this storey and
  // it is 24 triangles a window — the sill member `punchedWindow` already emits reads as a shelf
  // with nothing holding it up, which is exactly what the plate does not show.
  if (ctx.detail) {
    const console2 = (ax, ay, az, along) => [
      part(recessFaces(box(along === 'x' ? 0.15 : 0.20, 0.28, along === 'x' ? 0.20 : 0.15,
        ax, ay, az, 'vup-corbel'), RECESS.soffit, ['ny']), p.trim),
    ];
    for (const o of upFront) {
      for (const s of [-1, 1]) {
        add(console2(o.u + s * (o.width / 2 - 0.11), upSill - 0.30, frontZ + 0.10, 'x'));
      }
    }
    for (const o of upSide) {
      for (const s of [-1, 1]) {
        add(console2(rightX + 0.10, upSill - 0.30, o.u + s * (o.width / 2 - 0.11), 'z'));
      }
    }
    add(yawParts([-1, 1].flatMap((s) => console2(s * (upSplayW / 2 - 0.11), upSill - 0.30,
      SPF + 0.10, 'x')), Math.PI / 4, splayCx, splayCz));
  }

  // `banded` — a rendered string course running the frontage and the side street under the
  // dwelling sills, which is what a boom-era render does where it wants a horizontal without a
  // cornice. `trim` on `wall`, which is the 34-luma step this file's parapet panels already use.
  if (T.upperFinish === 'banded') {
    add(stringCourse(ctx, {
      x: 0, z: midZ, w: halfW * 2 + 0.10, d: shopD + 0.10, y: upSill - 0.26,
      thick: 0.15, proud: 0.10, material: p.trim, name: 'vup-string',
    }));
  }

  /* ── base, courses, parapet ──────────────────────────────────────────────────────── */
  // ── §2.3, r2: A BLUESTONE BASE THAT ACTUALLY WRAPS, INCLUDING ROUND THE SPLAY ────────────
  //
  // 0.46 -> 0.66 and the material named rather than defaulted: `wallAlt` on this scheme IS the
  // bluestone plinth (48 rendered) and it is the bucket the palette comment already assigns to
  // that job, so saying so costs nothing and stops the default meaning something else on the
  // next subject. The cap stays `trim` — a bluestone base takes a rendered weathering course,
  // and the light line over the dark band is what makes it read as a base rather than as dirt.
  // The splay facet gets the same pair, 24 triangles, because the corner is the one part of this
  // building both hero stations look straight at and the rectangle's corner is inside the wall.
  add(plinthCourse(ctx, {
    z: midZ, w: halfW * 2, d: shopD, h: 0.66, proud: 0.12,
    material: p.wallAlt, name: 'plinth',
    // r3 §5.5.10 — the weathering course is the LARGEST single `trim` member on every id in this
    // family and `trim` is the parapet's own bucket. The cap is stone, and the stone on this
    // scheme is `paving`: the light line over the dark band survives, and a near-white area at
    // eye level leaves the top band. Redistribution, not darkening.
    capMaterial: p.paving,

    // r3 §5.5.7a — the §5.3 sash floor on the skirt is now asked for HERE rather than taken
    // unconditionally inside shared kit. This subject wants it: the base course stands under a
    // 1.9 m posted verandah in permanent contact shadow, and it is the member r2 darkened.
    skirtRecess: RECESS.sash,
  }));
  add(plinthFacet(ctx, {
    cx: splayCx, cz: splayCz, yaw: Math.PI / 4, run: splayLen + 0.30, h: 0.66, proud: 0.12,
    material: p.wallAlt, capMaterial: p.paving, name: 'vsplay-plinth',
  }));
  // RULED ASHLAR, NOT BED JOINTS. The wall is rendered now, and render does not course at
  // 0.26 — it is scribed into ashlar blocks at roughly half a metre, which is the same
  // `brickCourses` generator run at the deco's own pitch (`corner-shop-variants.js:998`
  // established the precedent for this exact substitution). Same member count, same triangles:
  // what changes is the spacing, and at 0.26 on a rendered wall the scribe reads as brick.
  // ── AND THE FRONT RUN OF RULED ASHLAR HAS NEVER PRODUCED A SINGLE COURSE ───────────────────
  //
  // `brickCourses` computes `rows = floor((y1 - y0) / step)` and then loops `r = 1; r < rows`.
  // At one storey this call ran y0 3.48 to y1 4.15 at a 0.54 pitch: `floor(0.67 / 0.54)` is 1,
  // the loop never executes, and the principal frontage has been asking for ruled render and
  // getting NOTHING for as many rounds as this subject has existed. It is the identical fault
  // the deco's own spandrel course was found to have (`corner-shop-variants.js` deco §5.3), in
  // the sibling written by the same hand, and neither instrument in this lane can see it because
  // both count triangles that exist rather than triangles that were asked for.
  //
  // The two-storey wall fixes it by arithmetic — 4.15 m of run at a 0.72 pitch is four courses —
  // and the pitch is opened from 0.54 to 0.72 because ashlar on a two-storey rendered elevation
  // is a deep block, and because four courses with openings punched through them cost 120
  // triangles against 216 at the old pitch. The openings are PASSED now: a 30 mm scribe drawn
  // straight across a sash is a line on the glass.
  add(brickCourses(ctx, {
    axis: 'x', face: 1, plane: frontZ, centre: (leftX + frontRunHi) / 2, run: frontRunHi - leftX,
    y0: headY + 0.24, y1: wallTop - 0.12, openings: upFront, pitch: 0.72,
  }));
  add(brickCourses(ctx, {
    axis: 'z', face: -1, plane: leftX, centre: midZ, run: shopD, y0: 0.55, y1: wallTop, pitch: 0.78,
  }));
  // ── THE ARCHED HEADS WERE BUILT AND THEN REMOVED, BECAUSE THE PLATE SAID SO ──────────────
  //
  // A segmental arch of five voussoirs and a keystone over each shopfront is the correct second
  // half of the proportion change above, and it was built: 216 triangles across the two front
  // bays and the side bay. `l4vd-b/shop-corner-victorian--three-quarter.png` at 2x on the crop
  // (180,430)-(700,800) shows the reason it is gone — the verandah deck runs at 3.42 falling to
  // 3.08 at the street edge, the window head is at 3.24, and the arch band sits ENTIRELY behind
  // it from every camera the lane captures. Not partly, not in shadow: occluded.
  //
  // Recorded rather than quietly dropped, because the arithmetic is the interesting part: 216
  // triangles is 24 % of this subject's remaining headroom, spent on geometry no plate can show,
  // and the only instrument that could ever have caught it is a plate. The proportion change
  // itself stands — it costs nothing and it does read.

  // THE PARAPET. Rendered, moulded, and taller than anything else on the lot: two cornice
  // courses on corbels, a ruled-render upstand, pilasters at the ends with moulded caps, a
  // raised pediment over the splay with a date block and an urn on each pilaster.
  const parapetH = 1.35;
  const capY = wallTop + parapetH;
  // ── THE CORNICE AND COPE UNDERSIDES CARRY THE §5.3 FLOOR ────────────────────────────────
  //
  // MEASURED, not assumed: `l4r12-members.mjs` puts `vcornice-b` at 1.089 m2 and
  // `vpara-right-cope` at 1.875 m2 below sky visibility 0.12, and `l4r12-mask.py --thick` finds
  // a 2,337 px blob 8.0 px thick at (231,443)-(650,557) on my own plate — which is that band.
  // It is r10 §8.6's ridge and r12 §2.1's awning wallplate for a third time: a full-span
  // moulding whose underside is turned off the sun prints a black LINE, not a shadow, because a
  // shadow reads on a value step and there is nothing under it to step against.
  //
  // `ny` only. Every one of these members stands in full sun on its top and its face, and those
  // faces are untouched. Zero triangles, zero materials.
  const cornice = (axis, plane, centre, run, face) => (axis === 'x' ? [
    part(recessFaces(box(run, 0.16, 0.44, centre, wallTop + 0.08, plane + face * 0.15,
      'vcornice-a'), RECESS.soffit, ['ny']), p.trim),
    part(recessFaces(box(run, 0.12, 0.30, centre, wallTop + 0.24, plane + face * 0.10,
      'vcornice-b'), RECESS.soffit, ['ny']), p.trim),
  ] : [
    part(recessFaces(box(0.44, 0.16, run, plane + face * 0.15, wallTop + 0.08, centre,
      'vcornice-a'), RECESS.soffit, ['ny']), p.trim),
    part(recessFaces(box(0.30, 0.12, run, plane + face * 0.10, wallTop + 0.24, centre,
      'vcornice-b'), RECESS.soffit, ['ny']), p.trim),
  ]);
  add(cornice('x', frontZ, (leftX + frontRunHi) / 2, frontRunHi - leftX, 1));
  add(cornice('z', rightX, (rightRunLo + backZ) / 2, rightRunLo - backZ, 1));
  add(corbelRun(ctx, {
    axis: 'x', plane: frontZ + 0.10, centre: (leftX + frontRunHi) / 2, run: frontRunHi - leftX,
    y: wallTop - 0.11, facing: 1, pitch: 0.58,
  }));
  add(corbelRun(ctx, {
    axis: 'z', plane: rightX + 0.10, centre: (rightRunLo + backZ) / 2, run: rightRunLo - backZ,
    y: wallTop - 0.11, facing: 1, pitch: 0.58,
  }));
  // ── THE PARAPET PROFILE, WHICH WAS THE INCUMBENT'S ───────────────────────────────────────
  //
  // It was a solid 1.35 m slab of render the width of the frontage, which is exactly what
  // `shop-corner` carries and is the single largest surface on both models — the critic measured
  // it blank, streak-smeared, and at plate 183 against a 104.7 bar. A boom-era parapet is not a
  // slab: it is a solid frieze carrying the shop name with a BALUSTRADE standing on it between
  // the piers, and the sky between the balusters is the whole reason the type reads from across
  // a street.
  //
  // So the front run splits: a 0.55 m frieze (which is what the sign band was always sitting on
  // anyway), a moulded rail, square balusters at a 0.36 m pitch, and a top rail under the cope.
  // The side run stays solid — a Melbourne corner shop balustrades its principal frontage and
  // runs a plain parapet down the side street, and it holds 260 triangles for the lot.
  /* ══ V3.71 LANE H — THE CROWN IS THE VARIATION AXIS, AND THE PROFILE CLASS IS NOT ═══════════
   *
   * §5.3.11 names parapet profile first among the four things that separate this family "without
   * spending a triangle on width", and it is the right axis for separating two of ONE id too:
   * the parapet is the tallest surface on the model, it is unobstructed from every station, and
   * it is what the eye lands on from across the board. All four crowns below stand on the same
   * frieze over the same moulded cornice under the same pediment, so the SILHOUETTE CLASS —
   * "tall rendered parapet with a pediment over the splay" — is identical in all four, which is
   * what keeps a Victorian reading Victorian. What changes is the sky between the members.
   *
   *   balusters      the r12 member set exactly: square balusters at a 0.36 pitch on a moulded
   *                  rail, sky showing between them.
   *   name-frieze    no balustrade; a deep solid frieze carrying the shop's name in relief. The
   *                  only carrier on this subject tall enough for a word — the arithmetic is in
   *                  `v371-h-signcost.mjs` and the word ships only where that says it reads.
   *   panelled-dies  short baluster runs between three solid panelled dies. Half the sky, twice
   *                  the horizontal.
   *   blind-arcade   piers with segmental heads over them — the parapet as an arcade, which is
   *                  what a boom-era shop with money did.
   */
  const friezeH = T.friezeH;
  const frontRun = frontRunHi - leftX;
  const frontCx = (leftX + frontRunHi) / 2;
  const balH = parapetH - friezeH - 0.26;
  add([
    part(box(frontRun, friezeH, 0.34, frontCx, wallTop + friezeH / 2, frontZ - 0.05,
      'vpara-front'), p.trim),
    part(recessFaces(box(frontRun + 0.10, 0.12, 0.42, frontCx, wallTop + friezeH + 0.06,
      frontZ - 0.04, 'vpara-front-rail'), RECESS.soffit, ['ny']), p.trim),
    part(box(frontRun, 0.14, 0.30, frontCx, capY - 0.07, frontZ - 0.05,
      'vpara-front-toprail'), p.trim),
    part(recessFaces(box(frontRun + 0.12, 0.15, 0.50, frontCx,
      capY + 0.075, frontZ - 0.03, 'vpara-front-cope'), RECESS.soffit, ['ny']), p.trim),
    part(box(0.34, parapetH, rightRunLo - backZ, rightX - 0.05, wallTop + parapetH / 2,
      (rightRunLo + backZ) / 2, 'vpara-right'), p.trim),
    part(recessFaces(box(0.50, 0.15, rightRunLo - backZ + 0.12, rightX - 0.03, capY + 0.075,
      (rightRunLo + backZ) / 2, 'vpara-right-cope'), RECESS.soffit, ['ny']), p.trim),
    part(box(halfW * 2, 0.46, 0.30, 0, wallTop + 0.23, backZ + 0.15, 'vpara-back'), p.wall),
  ]);
  const balBaseY = wallTop + friezeH + 0.12;
  if (T.parapetCrown === 'balusters' || T.parapetCrown === 'panelled-dies') {
    const balN = Math.max(6, Math.min(24, Math.round(frontRun / T.balusterPitch)));
    // `panelled-dies` keeps the same rail and the same baluster stock and simply stands three
    // solid dies in the run, blanking the balusters behind them. Same generator, same names,
    // fewer of them — a crown, not a second parapet.
    const dieU = T.parapetCrown === 'panelled-dies'
      ? [0.5, 2.5, 4.5].map((k) => leftX + 0.34 + (k / 5) * (frontRun - 0.68))
      : [];
    for (let i = 0; i < balN; i += 1) {
      const u = leftX + 0.34 + (i + 0.5) * ((frontRun - 0.68) / balN);
      if (dieU.some((d) => Math.abs(u - d) < 0.52)) continue;
      add([part(box(0.115, balH, 0.19, u, balBaseY + balH / 2, frontZ - 0.05,
        'vpara-baluster'), p.trim)]);
    }
    for (const d of dieU) {
      add([
        part(box(0.96, balH, 0.26, d, balBaseY + balH / 2, frontZ - 0.05, 'vpara-die'), p.trim),
        ...mouldedPanel(ctx, {
          x: d, y: balBaseY + balH / 2, w: 0.70, h: balH - 0.16, z: frontZ + 0.09,
          rail: 0.08, proud: 0.05, material: p.wall, name: 'vpara-die-panel',
        }),
      ]);
    }
  } else if (T.parapetCrown === 'blind-arcade') {
    // Piers at a 1.05 m pitch with a segmental head sprung between each pair: two boxes and a
    // three-step arch, so the sky is a row of round-headed openings rather than a picket line.
    // 1.35 m bays rather than 1.05: six openings on this frontage instead of eight, which is
    // both the better arch proportion and 96 triangles cheaper — the Victorian is the tightest
    // subject in the family (168 spare at the balustrade) and a crown that costs 400 triangles
    // would have to be paid for by deleting a real member, which §5.4 forbids.
    const arcN = Math.max(4, Math.min(8, Math.round(frontRun / 1.35)));
    const pitch = (frontRun - 0.68) / arcN;
    for (let i = 0; i <= arcN; i += 1) {
      const u = leftX + 0.34 + i * pitch;
      add([part(box(0.26, balH, 0.24, u, balBaseY + balH / 2, frontZ - 0.05,
        'vpara-arcade-pier'), p.trim)]);
    }
    for (let i = 0; i < arcN; i += 1) {
      const u = leftX + 0.34 + (i + 0.5) * pitch;
      for (let k = 0; k < 3; k += 1) {
        const t = (k + 0.5) / 3;
        add([part(recessFaces(box(pitch * (0.86 - t * 0.52), 0.10, 0.20, u,
          balBaseY + balH - 0.16 + k * 0.09, frontZ - 0.05, 'vpara-arcade-head'),
        RECESS.soffit, ['ny']), p.trim)]);
      }
    }
  }
  // Pilasters with urns. The urn is the Victorian skyline event and it is 20 triangles.
  for (const [px, pz, pw, pd] of [
    [leftX + 0.28, frontZ - 0.05, 0.52, 0.42],
    [frontRunHi - 0.28, frontZ - 0.05, 0.52, 0.42],
    [rightX - 0.05, rightRunLo - 0.28, 0.42, 0.52],
    [rightX - 0.05, backZ + 0.34, 0.42, 0.52],
  ]) {
    add([
      part(box(pw, parapetH + 0.28, pd, px, wallTop + (parapetH + 0.28) / 2, pz, 'vpara-pier'), p.trim),
      part(recessFaces(box(pw + 0.14, 0.14, pd + 0.14, px, wallTop + parapetH + 0.35, pz,
        'vpara-pier-cap'), RECESS.soffit, ['ny']), p.trim),
    ]);
    if (ctx.detail) {
      // V3.71 lane H — what stands on the pier is the skyline event of this subject, it is 20-32
      // triangles, and boom-era Melbourne put three different things there. Same count, same
      // bucket, different outline: an urn on a foot, a ball on a plinth, or a stepped die.
      if (T.pierCrown === 'ball') {
        add([
          part(box(0.30, 0.16, 0.30, px, wallTop + parapetH + 0.36, pz, 'vpara-ball-plinth'), p.trim),
          part(taper(0.20, 0.20, 0.26, px, wallTop + parapetH + 0.44, pz, 'vpara-ball', 8), p.trim),
        ]);
      } else if (T.pierCrown === 'die') {
        add([
          part(box(0.34, 0.30, 0.34, px, wallTop + parapetH + 0.43, pz, 'vpara-die-crown'), p.trim),
          part(box(0.22, 0.20, 0.22, px, wallTop + parapetH + 0.68, pz, 'vpara-die-crown-cap'), p.trim),
        ]);
      } else {
        add([
          part(taper(0.19, 0.11, 0.30, px, wallTop + parapetH + 0.42, pz, 'vpara-urn', 8), p.trim),
          part(taper(0.09, 0.16, 0.20, px, wallTop + parapetH + 0.72, pz, 'vpara-urn-top', 8), p.trim),
        ]);
      }
    }
  }
  // The pediment over the splay, with two cement-moulded panels and a date block.
  const pediment = 0.92;
  add(yawParts([
    part(box(splayLen, 0.16, 0.44, 0, wallTop + 0.08, 0.15, 'vsplay-cornice-a'), p.trim),
    part(box(splayLen, 0.12, 0.30, 0, wallTop + 0.24, 0.10, 'vsplay-cornice-b'), p.trim),
    part(box(splayLen, parapetH + pediment, 0.34, 0, wallTop + (parapetH + pediment) / 2, -0.05, 'vpediment'), p.trim),
    part(recessFaces(box(splayLen + 0.16, 0.17, 0.52, 0, capY + pediment + 0.085, -0.03,
      'vpediment-cope'), RECESS.soffit, ['ny']), p.trim),
    part(box(0.62, 0.30, 0.42, 0, capY + pediment + 0.32, -0.03, 'vpediment-block'), p.trim),
    // V3.71 lane H — what tops the pediment. The finial is the r12 member; a roundel and a
    // pair of shoulder scrolls are the other two things a boom-era parapet did over its splay,
    // and each changes the outline the eye reads from the far corner of the board.
    ...(T.pedimentCrown === 'roundel' ? [
      part(cyl(0.26, 0.16, 0, capY + pediment + 0.52, 0.06, 'z', 'vpediment-roundel', 8), p.trim),
      part(cyl(0.17, 0.20, 0, capY + pediment + 0.52, 0.09, 'z', 'vpediment-roundel-eye', 8), p.wall),
    ] : T.pedimentCrown === 'shoulders' ? [
      part(rotBox(0.34, 0.26, 0.34, -0.52, capY + pediment + 0.38, -0.03, { z: 0.42 },
        'vpediment-shoulder'), p.trim),
      part(rotBox(0.34, 0.26, 0.34, 0.52, capY + pediment + 0.38, -0.03, { z: -0.42 },
        'vpediment-shoulder'), p.trim),
      part(box(0.40, 0.22, 0.36, 0, capY + pediment + 0.56, -0.03, 'vpediment-die'), p.trim),
    ] : [
      part(taper(0.20, 0.06, 0.40, 0, capY + pediment + 0.47, -0.03, 'vpediment-finial', 8), p.trim),
    ]),
  ], Math.PI / 4, splayCx, splayCz));
  add(yawParts(signBand(ctx, {
    x: 0, y: wallTop + (parapetH + pediment) * 0.54, z: -0.22, w: splayLen - 0.56,
    h: 0.74, facing: 1, blank: true,
  }), Math.PI / 4, splayCx, splayCz));
  // ── THE PEDIMENT WAS THE LARGEST BLANK SURFACE ON ANY SUBJECT IN THIS LANE ───────────────
  //
  // [SEEN] `vd2/shop-corner-victorian--three-quarter.png` crop (620,240)-(1100,620) at 2.4x and
  // `vd2/shop-corner-victorian--street.png` at 1x: the pediment reads as one unbroken cream
  // slab, 2.57 m across the splay by 2.27 m tall, with nothing on it but the vertical streaking
  // of the render map. It is the tallest thing on the model and it is the first thing the eye
  // lands on from both hero stations. Its own builder said so — "the frieze and pediment are
  // still the largest blank surfaces on the model" — and then withheld itself to 3.25 for it.
  //
  // A boom-era parapet pediment is not a slab. It is a moulded panel in a bolection surround
  // with a cartouche in the middle of it, and the surround is what a photograph reads: a
  // rectangle of shadow inside a rectangle of render. 48 triangles for the panel, 24 for the
  // cartouche, on a subject with 1,092 in hand.
  //
  // The two scroll consoles are the other half of the type and they are the SILHOUETTE half:
  // where the pediment steps down onto the parapet run it does it on a volute, which is what
  // makes the outline of a Victorian shop parapet a curve rather than a stair. Three boxes each
  // — a bed, the roll, and the fillet under it — because a two-box console reads as a bracket.
  // ── AND THE BUCKET IS `wall`, NOT `trim`, BECAUSE THE PLATE SETTLED THAT TOO ────────────
  //
  // [SEEN] `vd1/shop-corner--three-quarter.png` crop (100,250)-(1150,620) at 1.5x: the
  // incumbent's front parapet reads as one unbroken cream slab, and `signBand({blank:true})`
  // HAS ALREADY BUILT a six-member raised surround on it — a rail top and bottom, two stiles,
  // a cap and a base, 60 mm proud. **None of it is visible.** The surround is `p.trim` standing
  // on `para-front`, which is also `p.trim`: same albedo, same map, 60 mm of relief under an
  // even sky. A moulding with no value step against its own field does not read at plate zoom,
  // whatever its projection, and this lane has now built that member twice.
  //
  // So these panels are `wall` on a `trim` parapet — 104 against 138 on this scheme, a 34-luma
  // step — which is also what a boom-era parapet actually did: the fields were picked out from
  // the mouldings rather than painted flat. It costs nothing, and it moves area out of the light
  // band this subject is heaviest in, which §5c wants anyway.
  // ── AND THE FIRST VERSION OF THIS WAS BUILT INSIDE THE PEDIMENT, WHICH IS WHY THERE IS A
  // SECOND PLATE ──────────────────────────────────────────────────────────────────────────
  //
  // The panel was authored at `z: -0.05 - 0.17`, copied off the `signBand` call four lines
  // below it. [SEEN] `l4ph1/shop-corner-victorian--three-quarter.png` crop (620,260)-(1120,520)
  // at 2.6x, shot after that edit: **the side parapet's three panels read clearly and the
  // pediment is still a blank slab.** The two were authored in the same commit by the same hand
  // and only one of them appeared, which is what pointed at the depth rather than the bucket.
  //
  // `yawParts(…, Math.PI/4)` maps local +z to (0.707, 0, 0.707), so local +z is OUTWARD on this
  // splay. `vpediment` sits at z -0.05 with depth 0.34, so its street face is at **+0.12** and
  // everything authored at -0.22 is 340 mm inside the solid. The side panels used +0.13 against
  // a face at +0.12 and stood proud; these used the sign band's number and did not.
  //
  // AND THAT MEANS `signBand({blank:true})` ON THIS PEDIMENT HAS NEVER BEEN VISIBLE EITHER — it
  // is authored at z -0.22 with a 0.10 depth, entirely inside the pediment, on this subject AND
  // on `shop-corner`, which uses the same number. Two independent reasons the lane's blank
  // signboards do not appear: buried on the splay, trim-on-trim on the frontage. Both are
  // findings about a shared member and both are handed to the signage seat rather than patched
  // here; what is fixed is this round's own panels, at the face they belong on.
  const pedFaceZ = 0.12;
  add(yawParts([
    ...mouldedPanel(ctx, {
      x: 0, y: wallTop + parapetH * 0.70, w: splayLen - 0.72, h: parapetH + pediment - 0.86,
      z: pedFaceZ + 0.025, rail: 0.14, proud: 0.09, material: p.wall, name: 'vped-panel',
    }),
    // ── THE CARTOUCHE IS CUT, AND §5.3.11 IS WHY ─────────────────────────────────────────
    //
    // It was 44 triangles of relief on the pediment. The pediment's own face has moved from 5.5 m
    // to 9.1 m above the footpath with the storey, and at 4.97 px/m up a facade (§5.4.0, not the
    // 7.33 this lane quoted for a year) a 0.44 m cartouche is 2.2 px tall at board zoom — a
    // smudge on the one station the game is actually played at. The ruling's words for it are
    // exact: "an upper storey with real openings is worth more at every station than a cartouche
    // that reads at one". The 44 triangles are in the splay sash's arched head below.
    // Scroll consoles at the two ends, standing on the parapet cope and dying into the pediment.
    ...[-1, 1].flatMap((s) => [
      part(box(0.34, 0.16, 0.40, s * (splayLen / 2 + 0.02), capY - 0.08, -0.05, 'vped-console-bed'), p.trim),
      part(cyl(0.19, 0.32, s * (splayLen / 2 + 0.02), capY + 0.20, -0.05, 'x', 'vped-console-roll', 8), p.trim),
      part(rotBox(0.30, 0.46, 0.30, s * (splayLen / 2 + 0.02), capY + 0.52, -0.05,
        { z: s * 0.30 }, 'vped-console-die'), p.trim),
    ]),
  ], Math.PI / 4, splayCx, splayCz));
  // The frieze and the side parapet get the same treatment at the pitch a frontage takes it:
  // three panels along the front frieze between the pilasters, three down the side street run.
  // A balustraded parapet puts its panels in the SOLID part — the frieze under the rail — which
  // is the band the sign sits in, so the panels are pitched to leave the sign's own width clear.
  for (let i = 0; i < 3; i += 1) {
    const pw2 = (frontRun - 1.30) / 3;
    add(mouldedPanel(ctx, {
      x: leftX + 0.65 + (i + 0.5) * pw2, y: wallTop + friezeH * 0.50, w: pw2 - 0.26,
      h: friezeH - 0.16, z: frontZ + 0.13, rail: 0.10, proud: 0.06,
      material: p.wall, name: 'vfrieze-panel',
    }));
  }
  // ── AND THE THREE SIDE-PARAPET PANELS ARE CUT TOO ──────────────────────────────────────
  //
  // 144 triangles on the side street's parapet run. At one storey that run was the only thing on
  // a blank side elevation; at two it is 8 m up over a wall that now carries two curtained sashes
  // with sills on consoles, and the panels are the least legible member on the least-seen
  // elevation. The frieze panels on the PRINCIPAL frontage stay — that is the hero surface and
  // they sit under the balustrade where the plate puts them.
  // ── RUSTICATED QUOINS, RE-SPENT ONTO THE STOREY THE PLATE PUTS THEM ON ─────────────────────
  //
  // They were run 0.60 -> 4.01, i.e. up the GROUND storey, where a 2.05 m posted verandah stands
  // in front of them for the whole of the principal frontage. [SEEN]
  // `_reference-landmarks/mp-shopcorner-victorian.png` crop (330,80)-(1220,520) at 1.5x: the
  // plate's quoins run up the UPPER storey's corners, in full sun above the verandah roof, and
  // the ground storey behind the posts carries none at all.
  //
  // Seven blocks a run at a 0.46 pitch either way, so this is the same 168 triangles moved
  // rather than 168 added — §5.3.11's re-spend, taken on the cheapest member that had it wrong.
  add(quoinRun(ctx, {
    x: leftX + 0.02, z: frontZ + 0.06, y0: groundTop + 0.10, y1: wallTop - 0.14,
    material: p.trim, axis: 'x', name: 'vquoin',
  }));
  add(quoinRun(ctx, {
    x: rightX + 0.06, z: backZ + 0.06, y0: groundTop + 0.10, y1: wallTop - 0.14,
    material: p.trim, axis: 'z', name: 'vquoin',
  }));

  /* ══ THE NAME, AND WHY ONLY ONE OF THE FOUR TENANCIES CARRIES IT ═══════════════════════════
   *
   * The name goes on the FRIEZE, which is where a balustraded parapet puts it. At the old
   * `parapetH * 0.50` it would be floating in the gaps between the balusters.
   *
   * [MEASURED] `mvp/tests/v371-h-signcost.mjs`, at §5.4.0's WALL scales — 6.47 px/m ALONG a
   * facade and 4.97 px/m UP it, never the 7.33 that is the perpendicular figure and over-reads a
   * wall's vertical by 47 %. On a 0.55 m frieze the usable band is 0.40 m and `fitCap` returns a
   * 0.40 m cap, because on a 6.7 m run the HEIGHT binds and not the width; that is 2.0 px of cap
   * at the 319 m board station and 3.3 px at the shipped 190 m default, i.e. `blank-plate` at
   * both, which §5.4.0 says to ship as a blank plate rather than as a scatter of dots.
   *
   * The `name-frieze` tenancy exists because the frieze is the ONE member on this subject that a
   * period-correct choice can make tall enough. At 1.06 m the usable band is 0.86 m, and the
   * probe's verdicts are printed in `r1-builder.md` rather than claimed here. The other three
   * tenancies keep the blank moulded band, which is the honest answer at their frieze height.
   *
   * The relief run is named `vsign-frieze`, and the name matters: `mirror.js` `textRuns()` groups
   * lettering by geometry name, so two words sharing a name on one building would be reflected
   * about their COMBINED principal axis and both would come out wrong on every left-hand corner.
   * One word, one name, one carrier — the §5.4.2 rule applied to the one place in this lane where
   * breaking it would be silent.
   */
  if (T.signCarrier === 'frieze') {
    const vSignBand = friezeH - 0.20;
    const vSignCap = fitCap(T.trade.word, { width: frontRun - 1.50, height: vSignBand });
    add(reliefLetters({
      text: T.trade.word, x: frontCx, y: wallTop + friezeH * 0.50, z: frontZ + 0.12,
      cap: vSignCap, material: p.wall, axis: 'z', facing: 1,
      maxWidth: frontRun - 1.50, depth: 0.05, name: 'vsign-frieze',
    }));
  } else {
    add(signBand(ctx, {
      x: frontCx, y: wallTop + friezeH * 0.50, z: frontZ + 0.12,
      w: frontRun - 1.50, h: 0.40, facing: 1, blank: true,
    }));
  }

  /* ── the shop roof ───────────────────────────────────────────────────────────────── */
  // Flat, in three coplanar pieces that respect the splay. `corner-shop.js` paid for this in r7:
  // a pitched plane cut to a 45 degree corner cannot stay coplanar with a piece yawed
  // differently, and the leftover either gaps or overhangs — both §1.2 majors.
  // ── AND THE ROOF IS NOW A PITCH THAT SHOWS, WHICH IS WHAT THE PLATE HAS ────────────────────
  //
  // [SEEN] `_reference-landmarks/mp-shopcorner-victorian.png` crop (330,80)-(1220,520) at 1.5x: a
  // dark seamed hipped roof rises clearly ABOVE the balustrade, its ribs running down the slope,
  // with the chimney standing through it. At one storey ours was three coplanar flat pieces
  // 1.66 m below the parapet cope — structurally right and visually absent from every station.
  //
  // The big flat back piece is deleted and a seamed pitch takes its place. Its ridge lands at
  // 9.57 against a cope at 9.18 and urn tops at about 10.0, which is the plate's relation. The
  // two flat pieces that remain — the front strip and the diagonal over the splay — stay,
  // because r7 paid for the rule that a pitched plane cannot be cut to a 45 degree corner
  // without either a gap or an overhang, and both are §1.2 majors. The pitch stops 1.72 m short
  // of the frontage so its own eave clears the splay plane; the flat pieces cover that strip.
  //
  // The end panels are drawn from `roof` rather than from `wall`: this roof is hipped on the
  // plate, and a rendered gable end standing over the side-street parapet would be a wall where
  // the reference has metal. A dark triangle at each end reads as the hip it stands in for.
  const deckY = wallTop - 0.24;
  const CLR = 2.05;
  const INSET = 0.64 * Math.SQRT1_2;
  const gOver = 0.06;
  const gFrontEave = frontZ - 1.72;
  const gBackEave = backZ + 0.02;
  add(seamedGable(ctx, {
    w: halfW * 2 - 0.60, d: (gFrontEave - gBackEave) - gOver * 2,
    x: 0, z: (gFrontEave + gBackEave) / 2,
    springY: deckY + 0.04, pitch: 36, overhang: gOver, name: 'vgable',
    endMaterial: p.roof,
  }));
  add(seamedSkillion(ctx, {
    w: (rightX - CLR) - (leftX + 0.25), d: CLR - 0.25,
    x: ((rightX - CLR) + (leftX + 0.25)) / 2, z: frontZ - (CLR + 0.25) / 2,
    yLow: deckY, yHigh: deckY, fall: 'back', overhang: 0.05, name: 'vroof-front',
  }));
  add(yawParts(seamedSkillion(ctx, {
    w: 2.52, d: 1.66, x: 0, z: 0, yLow: deckY, yHigh: deckY,
    fall: 'back', overhang: 0.02, name: 'vroof-splay',
  }), Math.PI / 4, rightX - splay / 2 - INSET, frontZ - splay / 2 - INSET));
  add(gutterRun(ctx, {
    x: 0, z: backZ - 0.02, w: halfW * 1.5, y: wallTop - 0.36, facing: -1,
    dropAt: -halfW * 0.6, y0: 0.5,
  }));

  /* ── the verandah ────────────────────────────────────────────────────────────────── */
  const verY = 3.42;
  // V3.71 lane H — VERANDAH STRUCTURE, the second of §5.3.11's four axes. Bullnose or straight
  // skillion, striped or plain, posts at a 3.0-3.9 m pitch, lace on both runs or on the
  // principal frontage only. Every one of those is a real difference between two shops on one
  // Melbourne street and every one of them reads at board zoom, because the verandah is the
  // widest horizontal on the subject and it sits in full sun over a shadowed footpath.
  const verKit = {
    bullnose: T.verandahBullnose,
    stripes: T.verandahStripes,
    postPitch: T.verandahPostPitch,
    fall: T.verandahFall,
  };
  add(postedVerandah(ctx, {
    x: (leftX + frontRunHi) / 2, z: frontZ, w: (frontRunHi - leftX) - 0.1,
    y: verY, proj: 2.05, maxZ: padHalfD - METRICS.rim - 0.10, name: 'ver-front', ...verKit,
  }));
  add(yawParts(postedVerandah(ctx, {
    x: 0, z: 0, w: (rightRunLo - backZ) - 0.1, y: verY, proj: 1.55,
    maxZ: padHalfW - halfW - METRICS.rim - 0.10, name: 'ver-side',
    ...verKit, lace: T.laceSide,
  }), Math.PI / 2, rightX, (rightRunLo + backZ) / 2));
  // The splay's own return: no posts (it spans a corner), so it hangs off the two beside it.
  add(yawParts(postedVerandah(ctx, {
    x: 0, z: 0, w: splayLen - 0.12, y: verY, proj: 1.35, maxZ: 1.40,
    name: 'ver-splay', ...verKit, lace: false,
  }), Math.PI / 4, splayCx, splayCz));
  // The hanging blade sign, under the verandah where it is legible, hung on two rods and clear
  // of every cornice by 1.6 m. `corner-shop.js` r5 has the forensic on what happens when it is
  // put on the parapet instead.
  const bladeU = splayLen / 2 - 0.38;
  add(yawParts([
    part(box(0.96, 0.54, 0.07, bladeU, 2.34, 0.72, 'vblade-sign'), p.wallAlt),
    part(box(1.04, 0.08, 0.10, bladeU, 2.65, 0.72, 'vblade-cap'), p.trim),
    part(box(1.04, 0.07, 0.10, bladeU, 2.04, 0.72, 'vblade-base'), p.trim),
    part(cyl(0.022, 0.44, bladeU - 0.38, 2.91, 0.72, 'y', 'vblade-hanger', 6), p.joinery),
    part(cyl(0.022, 0.44, bladeU + 0.38, 2.91, 0.72, 'y', 'vblade-hanger', 6), p.joinery),
  ], Math.PI / 4, splayCx, splayCz));
  add(lamp(ctx, { x: leftX + 1.0, y: verY + 0.42, z: frontZ + 0.12 }));

  /* ── grunge (§2.5) ───────────────────────────────────────────────────────────────── */
  add(tideCourse(ctx, {
    axis: 'x', plane: frontZ, centre: (leftX + frontRunHi) / 2, run: frontRunHi - leftX,
    y: 0.58, facing: 1, h: 0.36,
  }));
  add(tideCourse(ctx, {
    axis: 'z', plane: rightX, centre: (rightRunLo + backZ) / 2, run: rightRunLo - backZ,
    y: 0.58, facing: 1, h: 0.32,
  }));
  add(streaks(ctx, {
    plane: frontZ, facing: 1, axis: 'x',
    xs: [leftX + 1.5, leftX + 4.4, frontRunHi - 1.1], yTop: verY - 0.04, length: 1.1,
  }));
  add(streaks(ctx, {
    plane: frontZ, facing: 1, axis: 'x',
    xs: [leftX + 3.1, frontRunHi - 2.6], yTop: wallTop - 0.06, length: 0.8,
  }));

  /* ══ THE REAR IS A YARD, NOT A WING ═══════════════════════════════════════════════════════
   *
   * [SEEN] `_reference-landmarks/mp-shopcorner-victorian.png` at 1024 x 683: behind the
   * two-storey mass the plate has NO second building. It has a rendered yard wall with a moulded
   * cope and a dark gate in it, a paling fence beyond that, a clipped shrub and a hedge — the
   * dwelling is upstairs and the ground behind the shop is its back yard.
   *
   * So the gabled wing is deleted outright: three walls, a room box, a plinth course, five
   * curtained sashes, a gable with its rakes, fascias, ridge and seams, a gutter run, a door with
   * its hood and brackets, a rear verandah with its deck, posts, steps and rafters, plus that
   * elevation's own brick coursing, tide course and streaks. Measured by `l4ph-tri.mjs` on the
   * tree as I found it: 2,000 building triangles. That is what paid for the storey, and it is why
   * a subject with 420 spare could buy one.
   */
  const chimX = leftX + 1.45;
  const chimZ = backZ + 2.10;
  const chimTop = wallTop + T.chimneyRise;
  add(chimney(ctx, { x: chimX, z: chimZ, top: chimTop, pots: T.chimneyPots }));
  // A flat-deck upstand rather than a pitched apron: `pitchRad: 0` seats all four members on the
  // box-gutter deck the shaft passes through, which is what this roof now is.
  add(chimneyFlashing(ctx, {
    x: chimX, z: chimZ, w: 0.92, d: 0.78, roofY: wallTop - 0.24, pitchRad: 0,
  }));
  // The rear elevation carries the dwelling's own service window, over the yard.
  add(streaks(ctx, {
    plane: backZ, facing: -1, axis: 'x',
    xs: [leftX + 1.9, halfW - 2.2], yTop: wallTop - 0.30, length: 1.9,
  }));

  /* ── the yard ────────────────────────────────────────────────────────────────────── */
  const yardZ = (backZ - 0.55 + (-padHalfD + METRICS.rim)) / 2;
  add(paverPath(ctx, {
    x: rightX - 1.60, z0: backZ - 0.35, z1: -padHalfD + METRICS.rim + 0.5,
    width: 1.10, unit: 0.85,
  }));
  add(binStore(ctx, { x: leftX + 1.5, z: yardZ, w: 1.9, d: 1.15, h: 1.35 }));
  add(clothesline(ctx, { x: -0.70, z: yardZ - 0.35, h: 2.00, arm: 1.20 }));
  add(shrubMass(ctx, { x: leftX + 0.55, z: backZ - 0.95, r: 0.54, h: 0.76 }));
  // ── §2.10 IS A PLANTING PROBLEM AS WELL AS A PALETTE ONE ─────────────────────────────────
  //
  // Measured last round on `cv1/shop-corner-victorian--three-quarter.png` with
  // `l4cv-plate.py --hue`: green 2.90 % of the coloured area against a reference pack that runs
  // 5-35 %. Green is the one hue family that survives this rig intact, so planting AREA is the
  // one §2.10 lever the probe's chroma bound does not cap. The bed moves off the deleted wing's
  // flank onto the yard's left boundary, where there is now room for it.
  add(plantedBed(ctx, {
    x: leftX - 0.55, z: yardZ + 0.6, w: 1.30, d: 3.40, plants: 3, salt: S_VIC + 3,
  }));
  add(shrubMass(ctx, { x: leftX - 0.55, z: yardZ - 2.1, r: 0.50, h: 0.70 }));
  add(canopyTree(ctx, {
    x: rightX - 2.9, z: -padHalfD + METRICS.rim + 1.5, h: 3.3, canopy: 0.92, habit: 'round',
  }));
  /* ══ §2.6 / §2.8 r2 — THE PLANTING WAS BUILT AND PLACED WHERE NO GRADED CAMERA LOOKS ═══════
   *
   * The r1 critic's finding, and it is the cheapest point on its own fix list: "the models DO
   * build the lot … but on the three-quarter hero there is one green sliver behind the bin
   * enclosure and nothing else. The building occupies its corner and the planting sits behind
   * it, so it is invisible at street AND at three-quarter. Every reference plate puts a street
   * tree with a real leaf-cluster canopy IN FRAME at the corner, on the footpath, unmissable."
   * Its addendum narrows it further: the modern already does this and the other three do not.
   *
   * Both trees stood on the REAR boundary at `z: -padHalfD + rim + 1.5/1.7`, which is 12 m
   * behind the frontage and behind a two-storey mass. One of them moves to the front footpath at
   * the left end of the frontage — the same place the reference puts its street tree — and it
   * stands in a pit, because it is standing in paving and §2.6's own precedent in `canopyTree`
   * says a trunk that passes through a paver slab is a modelling omission.
   *
   * SIZED, NOT EYEBALLED. §3.6 is the standing risk here: `l4var-bounds.mjs` once named
   * `canopy-a` at |z| 7.612 against a 7.500 rim when a tree was set on a boundary. `TREE_HABIT`'s
   * round habit reaches `1.12 * canopy` from the trunk in x and z (lobe 0 at radius 1.00 with the
   * 1.12 jitter ceiling), so at canopy 0.82 the reach is 0.918. The trunk at
   * (leftX - 1.30, frontZ + 0.62) puts the canopy at |x| <= 7.27 and |z| <= 7.09, and the 0.98 m
   * pit spans z 5.68-6.66 between the footpath's inner edge at 5.58 and the kerb face at 6.715.
   * Nothing here touches the -0.500 m containment baseline, which is the board tray's and stays.
   */
  // ── AND THE FIRST PLACEMENT BREACHED CONTAINMENT, WHICH THE PROBE CAUGHT, NOT A PLATE ────
  //
  // The trunk was authored at `leftX - 1.30`, i.e. relative to the BODY. `bodyW` is
  // `lotW * widthF * (1 +/- 1.4 %)` and runs 9.99 on this subject but 11.95 on `shop-corner`, so
  // the same expression puts the trunk 1.3 m outside a body that is itself 0.98 m from the rim,
  // and `v371-h-contain.mjs` named `canopy-a` at 8.155 against a 7.500 lot. That is §3.6 and it
  // is the same species as everything else this round has been about: an offset taken from the
  // wrong datum. A frontage tree is a LOT object and it is now placed off the lot rim and its own
  // reach, so no facade jitter and no `widthF` can move it out.
  //
  //   reach = 1.12 * canopy      `TREE_HABIT.round` lobe 0, radius 1.00, jitter ceiling 1.12
  //   x = -(padHalfW - rim - reach - 0.05)      z = padHalfD - rim - reach - 0.05
  //
  // At canopy 0.72 that is reach 0.807, trunk (-6.023, 6.023) and a canopy holding |x|,|z| <= 6.83
  // — 0.67 m inside the rim on both axes, on every facade of every id, rather than 0.65 outside it.
  // r5 §2.6 — canopy 0.72 -> 1.02 and height 4.75 -> 5.20. ZERO TRIANGLES: the lobe count and
  // segment count are unchanged, only the radius, so this is the §2.6 objection answered at the
  // scale the reference plate actually plants at. CONTAINMENT IS INVARIANT BY CONSTRUCTION —
  // the trunk is placed at `padHalfW - rim - reach - 0.05`, so trunk + reach is a constant and a
  // larger canopy moves the trunk INBOARD rather than the foliage outboard. Re-run of
  // `v371-h-contain.mjs` is in the r5 report, and the heroes were opened for the thing a bbox
  // sweep cannot see (§5.5.9a): whether the canopy now reaches the verandah.
  const vTreeReach = 1.12 * 1.02;
  add(canopyTree(ctx, {
    x: -(padHalfW - METRICS.rim - vTreeReach - 0.05),
    z: padHalfD - METRICS.rim - vTreeReach - 0.05,
  // ── AND THE FIRST HEIGHT WAS TOO SHORT, WHICH THE r2a PLATE SHOWED ────────────────────────
  //
  // At h 3.0-3.3 the canopy centre sits at 0.78-0.94 * h, i.e. 2.4-3.1 m, and every one of these
  // subjects hangs a verandah or a blade at 3.30-3.42 m across its whole frontage. So the tree
  // the round moved into frame arrived BEHIND the awning: on
  // `r2a/hero--shop-corner-victorian--three-quarter.png` it reads as a green smudge at the left
  // edge, which is §2.6 reachable but not §2.6 read. `_reference-landmarks/mp-shopcorner-victorian.png`
  // stands its street tree well clear of the verandah — the canopy is the second tallest thing in
  // the plate after the parapet. The height goes up; the REACH does not, because reach is a
  // function of `canopy` alone, so containment is unmoved and the probe confirms it.
    h: 5.20, canopy: 1.02, habit: 'roundBroken', pit: true,
  }));
  add(hedgeRun(ctx, {
    x0: -padHalfW + METRICS.rim + 0.4, z0: -padHalfD + METRICS.rim + 0.45,
    x1: padHalfW - METRICS.rim - 1.9, z1: -padHalfD + METRICS.rim + 0.45, h: 0.92,
  }));
  // THE RENDERED YARD WALL, which is what the plate puts against the side street behind the
  // shop, with the gate in it. The paling fence picks up beyond it and runs to the rear
  // boundary — two boundary treatments in series, as the reference has, rather than one picket
  // run doing the whole side.
  // r2 — the same two runs, moved OUTBOARD to the side-street boundary line at
  // `padHalfW - rim - 0.42` from `- 1.45`. At 5.43 both stood a metre inside the boundary with a
  // two-storey wall directly behind them, so on the three-quarter they were a picket-width of
  // pale render against pale render; at 6.46 they stand clear of the building silhouette and
  // read against the backdrop, which is where the reference plate's fence reads from. The side
  // verandah reaches x 6.55 but only over the shop (z >= backZ), and both runs start behind it.
  // Zero triangles: same members, same lengths, one number.
  add(pierWall(ctx, {
    z: padHalfW - METRICS.rim - 0.42, x0: backZ - 0.10, x1: backZ - 2.60,
    h: 1.55, axis: 'z', piers: 3,
  }));
  add(picketFence(ctx, {
    z: padHalfW - METRICS.rim - 0.42, x0: -padHalfD + METRICS.rim + 0.3, x1: backZ - 2.60,
    h: 1.60, gapX: backZ - 3.55, gapW: 1.30, pitch: 0.21, axis: 'z',
  }));
  add(lawnTufts(ctx, {
    count: 16, salt: S_VIC,
    avoid: [
      { x: 0, z: midZ, w: halfW * 2 + 2.6, d: shopD + 3.2 },
      { x: padHalfW - 1.4, z: 0, w: 3.4, d: env.lotD },
      { x: leftX + 1.5, z: yardZ, w: 3.2, d: 2.4 },
    ],
  }));
}

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 2. ART DECO — shop-corner-deco
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * A steel-framed shop window: slim mullions, a terrazzo stallboard with a proud nosing, a lit
 * backer and a display tread. Deliberately NOT `shopfrontBay()` — that member set is a Victorian
 * timber shopfront with a glazed-tile chequer, and standing it on a deco facet is exactly the
 * reskin this file exists to avoid. Half the members, twice the slenderness.
 */
function steelShopWindow(ctx, {
  x, z, w, facing = 'front', sillY = 0.72, headY = 2.94, id = 'dwin', lights = 3,
}) {
  countAperture('glazedBay');
  const p = ctx.p;
  const yaw = typeof facing === 'number' ? facing : (
    facing === 'back' ? Math.PI : facing === 'left' ? -Math.PI / 2
      : facing === 'right' ? Math.PI / 2 : 0);
  const ux = Math.cos(yaw); const uz = -Math.sin(yaw);
  const nx = Math.sin(yaw); const nz = Math.cos(yaw);
  const place = (bw, bh, bt, u, v, n, name) => {
    const g = box(bw, bh, bt, 0, 0, 0, name);
    g.rotateY(yaw);
    g.translate(x + ux * u + nx * n, v, z + uz * u + nz * n);
    g.computeBoundingBox();
    return g;
  };
  const out = [];
  const h = headY - sillY;
  const my = sillY + h / 2;
  const R = 0.24;

  // Terrazzo stallboard: a banded base with a proud nosing, no chequer. Two bands, because a
  // deco stallboard is terrazzo with a contrasting inlaid strip and that strip is the detail.
  out.push(part(place(w, sillY - 0.16, 0.11, 0, (sillY - 0.16) / 2 + 0.16, 0.05, `${id}-stall`), p.wallAlt));
  out.push(part(place(w + 0.10, 0.16, 0.14, 0, 0.08, 0.065, `${id}-stall-plinth`), p.joinery));
  out.push(part(place(w - 0.10, 0.07, 0.05, 0, sillY - 0.34, 0.115, `${id}-stall-inlay`), p.trim));
  // A second, narrower inlay below the first. A terrazzo stallboard is banded, not striped: two
  // strips at different widths read as a designed base, one strip reads as a line someone drew.
  out.push(part(place(w - 0.10, 0.04, 0.05, 0, sillY - 0.47, 0.115, `${id}-stall-inlay-b`), p.trim));
  out.push(part(place(w + 0.12, 0.11, 0.20, 0, sillY - 0.02, 0.08, `${id}-nosing`), p.trim));
  // ── THE CHROME ARCHITRAVE ────────────────────────────────────────────────────────────────
  //
  // A 1930s steel shopfront is set in a bright metal surround that stands proud of the render
  // and stops at the stallboard nosing — it is the member that makes the opening read as an
  // INSTALLED frame rather than as a hole with glass at the back of it, and it is the single
  // most recognisable thing about a deco shop window at street zoom. Three members: two jambs
  // and a head, in `trim` (139) against a `wall` of 120, so it reads as bright metal on render
  // rather than as another band of the same cream.
  out.push(part(place(0.12, headY - sillY + 0.30, 0.12, -w / 2 - 0.08, (sillY + headY) / 2 + 0.10,
    0.055, `${id}-arch-l`), p.trim));
  out.push(part(place(0.12, headY - sillY + 0.30, 0.12, w / 2 + 0.08, (sillY + headY) / 2 + 0.10,
    0.055, `${id}-arch-r`), p.trim));
  out.push(part(recessFaces(place(w + 0.28, 0.14, 0.15, 0, headY + 0.20, 0.06, `${id}-arch-h`),
    RECESS.soffit, ['ny']), p.trim));

  // Reveal cheeks and head, carrying the §5.3 lining floor on the faces that face the opening.
  out.push(part(recessFaces(place(0.10, h, R, -w / 2 + 0.05, my, -R / 2, `${id}-ret-l`),
    1, ['px']), p.trim, 1));
  out.push(part(recessFaces(place(0.10, h, R, w / 2 - 0.05, my, -R / 2, `${id}-ret-r`),
    1, ['nx']), p.trim, 1));
  out.push(part(recessFaces(place(w, 0.12, R, 0, headY - 0.06, -R / 2, `${id}-ret-h`),
    1, ['ny']), p.trim, 1));
  // ── V3.71 lane H r2: THE DECO'S BACKER TAKES `fixedGlazing`'s VERDICT TOO ────────────────
  //
  // [MEASURED] `v371-h2-patch.mjs` on `crit1/row--shop-corner-deco--street.png`: panes at
  // rgb(107,106,108) L 106.5 and rgb(111,109,108) L 109.3 against §5.2's reference glass band of
  // 21-49 and the generated pack's own panes at 58-93, with the wall field beside them at L 137.
  // `trim` is 140 rendered on this scheme and it was the whole content of the window.
  // r5 — REVERTED to `RECESS.interior` (§5.5.20). r4 raised this backer to `RECESS.deep`, measured
  // the whole assignment at ~0.03 points, and shipped it; on the modern it moved the panes out of
  // §5.5.14's band and on this scheme it moved nothing at all.
  out.push(part(place(w + 0.04, h + 0.04, 0.30, 0, my, -0.80, `${id}-interior`), p.shadow, RECESS.interior));
  if (ctx.detail) {
    out.push(part(place(w - 0.14, 0.26, 0.30, 0, sillY + 0.14, -0.44, `${id}-disp`), p.joinery, RECESS.interior));
    for (let i = 0; i < 2; i += 1) {
      out.push(part(place(0.22, 0.30, 0.18, -w * 0.20 + i * w * 0.40, sillY + 0.42, -0.46,
        `${id}-disp-goods`), i % 2 ? p.wall : p.roof, RECESS.interior));
    }
  }
  // Slim steel frame: a cill, a head and `lights - 1` mullions at 0.06 m — half the section of
  // the Victorian shopfront's timber, which is what a steel frame reads as.
  out.push(part(place(w, 0.11, 0.11, 0, sillY + 0.06, -R + 0.05, `${id}-cill`), p.joinery, RECESS.sash));
  out.push(part(place(w, 0.12, 0.11, 0, headY - 0.07, -R + 0.05, `${id}-head`), p.joinery, RECESS.sash));
  out.push(part(place(w, 0.08, 0.10, 0, headY - 0.58, -R + 0.05, `${id}-transom`), p.joinery, RECESS.sash));
  const n = Math.max(1, lights);
  for (let i = 1; i < n; i += 1) {
    out.push(part(place(0.06, h - 0.22, 0.10, -w / 2 + (w * i) / n, my, -R + 0.05, `${id}-mull`),
      p.joinery, RECESS.sash));
  }
  // One pane per light, so the reflection break restarts at every mullion (r12 §2.3).
  for (let i = 0; i < n; i += 1) {
    const lw = (w - 0.14) / n;
    out.push(part(place(lw - 0.06, h - 0.74, 0.04, -w / 2 + 0.07 + (i + 0.5) * lw, my - 0.22,
      -R - 0.02, `${id}-pane`), p.glass));
  }
  out.push(part(place(w - 0.14, 0.40, 0.04, 0, headY - 0.32, -R - 0.02, `${id}-fanlight`), p.glass));
  return out;
}

/**
 * The cantilevered slab awning: a flat deck on hanger rods, with a boxed fascia and a lit
 * soffit. No posts — that is the whole point of the type, and the rods are what stop it being a
 * §1.2 floating element.
 */
function cantileverAwning(ctx, {
  x, z, w, y = 3.20, proj = 1.9, maxZ = null, name = 'cant', rods = true, tiers = 1,
  // V3.71 lane H — how densely the rods are hung. The default reproduces the r12 member set.
  rodPitch = 3.2, fasciaH = 0.30,
  /**
   * ── §2.9 r2 — THE FASCIA IS THE ONE LARGE HORIZONTAL AT EYE LEVEL AND IT WAS `trim` ───────
   *
   * Every reference plate in the pack hangs a DARK fascia over its shopfront: the Victorian's is
   * bottle green, the deco's a dark band under a pale cope. Ours was `trim`, the lightest bucket
   * on every scheme (138-150 rendered), running the whole frontage directly above glazing that
   * the same round measured at plate 98-118. Two of the three largest surfaces in the lower half
   * of the frame, both in the top band, is §2.9's muddiness test stated as geometry.
   *
   * Passed rather than switched inside, because the right bucket is a per-scheme fact and the
   * default has to keep every other caller bit-identical: `wallAlt` is dark terrazzo (52) on the
   * deco and dark bluestone (48) on the Victorian, and on `shop-corner-modern` it is the PALE
   * fibre-cement panel at 134 — the same trap `plinthCourse` was carrying and the same answer.
   */
  fasciaMaterial = null,
  /**
   * r3 §5.5.10 — the deck's TOP is the largest single surface of this member and it is seen from
   * above at every station this lane shoots. `trim` is the parapet's bucket, and a cantilevered
   * awning is a concrete slab: `paving` is the concrete on both schemes that call this (92 on
   * the deco, 110 on the modern) against `trim` at 140-144. This is the redistribution §5.5.10
   * asks for and NOT the darkening the modern's own r12 block refused — that block declined to
   * put the blade top in a DARK bucket, which this is not.
   */
  deckMaterial = null,
}) {
  const p = ctx.p;
  const out = [];
  const reach = Math.max(0.7, (maxZ == null ? z + proj : Math.min(z + proj, maxZ)) - z);
  const zc = z + reach / 2;
  const fascia = fasciaMaterial ?? p.trim;
  out.push(part(slab(w, 0.16, reach, x, y, zc, `${name}-deck`), deckMaterial ?? p.trim));
  out.push(part(recessFaces(slab(w - 0.08, 0.07, reach - 0.08, x, y - 0.07, zc, `${name}-soffit`),
    RECESS.soffit, ['ny']), p.wallAlt));
  out.push(part(box(w + 0.06, fasciaH, 0.14, x, y + 0.06 - fasciaH / 2, z + reach + 0.05,
    `${name}-fascia`), fascia));
  out.push(part(box(w + 0.08, 0.07, 0.06, x, y + 0.07, z + reach + 0.10, `${name}-fascia-bead`), p.joinery));
  // The stepped underside band: a deco awning's fascia is stepped, not flat.
  //
  // ── MAJ-V2: THE SECOND TIER HUNG IN AIR, ON THE MOST-LOOKED-AT EDGE OF THE SUBJECT ───────
  //
  // The fascia box spans y [y-0.24, y+0.06]. At the old pitch the tiers sat at y-0.20 and
  // y-0.31, so tier 1 was inside the fascia and tier 2 was 35 mm clear BELOW its underside with
  // nothing between them — a step detached from the thing it steps off, on the front edge of the
  // awning, which `l4cv-geom.mjs` reported as unsupported on both `dawn-front` and `dawn-side`.
  // The pitch is now derived from the fascia it belongs to rather than chosen: first step 0.12
  // below the fascia centre, 0.08 between steps, so the LAST tier's underside sits at
  // y - 0.12 - (tiers-1)*0.08 - 0.035, which is y-0.235 at tiers 2 against a fascia bottom of
  // y-0.24. Both tiers are inside the member they articulate, which is what a stepped fascia is.
  const stepPitch = 0.08;
  const stepTop = 0.12;
  for (let i = 0; i < tiers; i += 1) {
    out.push(part(box(w - 0.30 - i * 0.5, 0.07, 0.09, x, y - stepTop - i * stepPitch,
      z + reach + 0.02, `${name}-fascia-step`), p.joinery));
  }
  out.push(part(recessFaces(box(w + 0.10, 0.10, 0.14, x, y + 0.15, z + 0.03, `${name}-wallplate`),
    RECESS.soffit, ['ny', 'pz', 'py'], ), p.trim));
  if (rods) {
    const n = Math.max(2, Math.round(w / rodPitch));
    for (let i = 0; i < n; i += 1) {
      const rx = n === 1 ? x : x - w / 2 + 0.5 + i * ((w - 1.0) / (n - 1));
      const rise = 1.15;
      const run = reach - 0.18;
      out.push(part(rotBox(0.05, 0.05, Math.hypot(run, rise), rx, y + rise / 2 + 0.10, z + 0.10 + run / 2,
        { x: Math.atan2(rise, run) }, `${name}-rod`), p.joinery));
      out.push(part(box(0.16, 0.24, 0.10, rx, y + rise + 0.12, z + 0.06, `${name}-rod-plate`), p.joinery));
    }
  }
  return out;
}

export function buildShopCornerDeco(ctx) {
  const { env, p } = ctx;
  const add = (produced) => ctx.add(produced);
  // V3.71 lane H — this placement's own tenancy. The tower stays the tallest thing on the lot in
  // all four; what varies is how many steps it takes to get there and what articulates the top
  // block, which is the parapet-profile axis §5.3.11 named applied inside one period.
  const T = decoTenancy(ctx);

  const halfW = env.bodyW / 2;
  const frontZ = env.frontZ;
  const shopD = 8.40;
  const backZ = frontZ - shopD;
  /* ══ §5.3.11 — TWO STOREYS, THE DWELLING ABOVE THE SHOP ════════════════════════════════════
   *
   * [SEEN] `_reference-landmarks/mp-shopcorner-deco.png` (13:24) at 1024 x 683, and the crop
   * (250,30)-(1330,520) at 1.25x. Two storeys. The upper one carries horizontal steel window
   * banks in DARK GREY surrounds — one bank per straight frontage and a continuous bank wrapping
   * all three facets of the canted corner — with a projecting grey sill band under them and a
   * continuous grey band running the whole building at the parapet base. Above that the stepped
   * ziggurat parapet with its fluted centre block. The cantilevered awning hangs on rods FROM
   * the upper storey's wall, which is what the rods are fixed to on the plate.
   *
   * Ours was a single-storey shop with a flat-roofed wing behind it. `content.js:106` has
   * registered this id as `storeys: 2` since it was written. The wing is deleted and rebuilt
   * over the shop; the shop takes the depth it vacated (6.00 -> 8.40) so the plan aspect this
   * variant is sorted on is preserved rather than lost with the wing.
   */
  const groundTop = 4.30;                 // the first-floor line
  const upperH = 3.30;
  const wallTop = groundTop + upperH;     // 7.60 — where the parapet and tower spring
  // THE CORNER RADIUS, and it is sized by the ENTRY rather than by taste. Three facets share
  // 90 degrees, so a facet's chord is `2R sin 15` — at R 2.55 that is 1.32 m and a 1.30 m shop
  // door with two jambs does not fit in it. R 3.60 gives a 1.86 m chord, which takes the door
  // and two side lights, and it is also what makes the curve read as a curve rather than as a
  // chamfer with a kink. It costs frontage: `frontRunHi` and `rightRunLo` both move in by 3.60,
  // which is why this variant's shop is DEEPER than the other two rather than wider.
  const splay = 3.60;
  const padHalfD = env.lotD / 2;
  const padHalfW = env.lotW / 2;
  const midZ = (frontZ + backZ) / 2;
  const rightX = halfW;
  const leftX = -halfW;
  const frontRunHi = rightX - splay;
  const rightRunLo = frontZ - splay;
  const sillY = 0.74;
  const headY = 3.04;

  // Broad blind-wall bays give the exposed flank/rear a base, piers and a floor line.
  // Every replacement solid stays inside the original wall volume: the panels recess
  // inward, while the end piers retain the authored corners and rear pipe clearance.
  const blindWall = ({ axis, plane, centre, run, y0, y1, name, bays, baseHeight }) => {
    const out = [];
    const endPier = 0.54;
    const middlePier = 0.40;
    const topBand = 0.34;
    const inset = 0.12;
    const lo = centre - run / 2;
    const hi = centre + run / 2;
    const panelBottom = y0 + baseHeight;
    const panelTop = y1 - topBand;
    const panelWidth = (run - endPier * 2 - middlePier * (bays - 1)) / bays;
    const solid = (a, b, bottom, top, set, material, suffix) => {
      out.push(...openWall(ctx, {
        material, axis, face: -1, plane: plane + set, centre: (a + b) / 2,
        run: b - a, y0: bottom, y1: top, depth: METRICS.wallDepth - set,
        name: `${name}-${suffix}`,
      }));
    };
    solid(lo, hi, y0, panelBottom, 0, y0 === 0 ? p.wallAlt : p.wall, 'base');
    solid(lo, hi, panelTop, y1, 0, p.wall, 'head');
    solid(lo, lo + endPier, panelBottom, panelTop, 0, p.wall, 'end-0');
    solid(hi - endPier, hi, panelBottom, panelTop, 0, p.wall, 'end-1');
    for (let i = 0; i < bays; i += 1) {
      const a = lo + endPier + i * (panelWidth + middlePier);
      const b = a + panelWidth;
      solid(a, b, panelBottom, panelTop, inset, p.wall, `panel-${i}`);
      if (i + 1 < bays) solid(b, b + middlePier, panelBottom, panelTop, 0,
        p.wall, `pier-${i}`);
    }
    return out;
  };

  add(boardPlinth(ctx, { lawn: true }));
  add(cornerFootpaths(ctx, { unit: 1.05, walkD: 1.35, sideWalk: 1.30 }));

  /* ── the shop box ────────────────────────────────────────────────────────────────── */
  const bays = [
    { x: leftX + 2.30, w: 3.10 },
    { x: leftX + 5.90, w: 3.10 },
  ];
  add(openWall(ctx, {
    material: p.wall, axis: 'x', face: 1, plane: frontZ,
    centre: (leftX + frontRunHi) / 2, run: frontRunHi - leftX,
    y0: 0, y1: groundTop, depth: METRICS.wallDepth,
    openings: bays.map((b) => hole(b.x, sillY, b.w, headY - sillY)), name: 'dshop-front',
  }));
  const sideWinZ = (rightRunLo + backZ) / 2 + 0.30;
  add(openWall(ctx, {
    material: p.wall, axis: 'z', face: 1, plane: rightX,
    centre: (rightRunLo + backZ) / 2, run: rightRunLo - backZ,
    y0: 0, y1: groundTop, depth: METRICS.wallDepth,
    openings: [hole(sideWinZ, sillY, 2.05, headY - sillY),
      hole(backZ + 1.20, 0, 1.06, 2.34)], name: 'dshop-right',
  }));
  add(blindWall({
    axis: 'z', plane: leftX, centre: midZ, run: shopD,
    y0: 0, y1: groundTop, name: 'dshop-left', bays: 2, baseHeight: sillY,
  }));
  add(blindWall({
    axis: 'x', plane: backZ, centre: 0, run: halfW * 2,
    y0: 0, y1: groundTop, name: 'dshop-back', bays: 3, baseHeight: sillY,
  }));
  add([
    part(box(halfW * 2 - 1.8, groundTop - 0.2, shopD - 1.8, 0, groundTop / 2, midZ, 'dshop-room'),
      p.shadow, RECESS.interior),
    part(slab(halfW * 2 - 0.9, 0.10, shopD - 0.9, 0, 0.05, midZ, 'dshop-floor'), p.paving),
  ]);
  if (ctx.detail) {
    const shelfZ = backZ + 1.0;
    add([
      part(slab(halfW * 1.6, 1.85, 0.32, -halfW * 0.10, 0.40, shelfZ, 'dfit-shelf'), p.wallAlt),
      // ── r3 §5.5.10 — WHAT IS BEHIND THE PANE IS DRAWN DOWN THE DARK HALF OF THE LADDER ────
      //
      // r2 measured this on `shop-corner-modern` and wrote the verdict into `fixedGlazing`: its
      // first fitout put `trim` boards behind the glass and TWO OF THREE MEASURED PANES WENT UP
      // (138.7 -> 138.9, 157.2 -> 168.4, 149.2 -> 159.9), because "a shop interior read through
      // daylit glass is DARK with structure in it". That verdict reached `shopfrontBay`'s backer
      // and did NOT reach the shelf boards and counter top standing in front of it, which are
      // the palest members inside the window on this subject. `roof` keeps them a clear step
      // above the `shadow` backer and out of the top band.
      part(slab(halfW * 1.6, 0.07, 0.40, -halfW * 0.10, 1.28, shelfZ - 0.04, 'dfit-shelf-b'), p.roof),
      part(slab(halfW * 1.2, 0.28, 0.24, -halfW * 0.10, 1.36, shelfZ - 0.10, 'dfit-stock-a'), p.roof),
      part(slab(3.1, 1.05, 0.66, halfW - 2.6, 0.0, frontZ - 2.30, 'dfit-counter'), p.wallAlt),
      part(slab(3.22, 0.09, 0.76, halfW - 2.6, 1.05, frontZ - 2.30, 'dfit-counter-top'), p.roof),
      part(slab(0.42, 0.32, 0.32, halfW - 1.6, 1.14, frontZ - 2.30, 'dfit-till'), p.joinery),
    ]);
  }

  /* ── the curved corner ───────────────────────────────────────────────────────────── */
  // Three facets of a regular octagon spanning the chamfer, each carrying its own wall panel,
  // and the middle one carrying the entry. `openWall` is used per facet so each facet's cut
  // faces get their own §5.3 jamb tags — the same mechanism, on a curve.
  //
  // THE CONSTRUCTION, stated because the first draft guessed it and the guess put the facet
  // faces 0.3 m outside the wall they stand on. The corner is an arc of radius `splay` whose
  // centre C is inset from the corner by `splay` in both axes, so the two straight frontages are
  // TANGENT to it at (rightX - splay, frontZ) and (rightX, frontZ - splay) — which is exactly
  // where `frontRunHi` and `rightRunLo` already stop. Three facets share the 90 degrees, so each
  // spans 30 and their normals sit at 15 / 45 / 75 degrees. A facet's centre is on the apothem
  // (`splay * cos 15`), and its chord is `2 * splay * sin 15`. Nothing here is approximated: the
  // facets meet each other and meet both walls at their own tangent points.
  const CX = rightX - splay;
  const CZ = frontZ - splay;
  const apothem = splay * Math.cos(Math.PI / 12);
  const chord = 2 * splay * Math.sin(Math.PI / 12);
  const facetYaw = [Math.PI / 12, Math.PI / 4, (5 * Math.PI) / 12];
  const doorW = 1.36;
  const doorH = 2.52;
  const facetCentres = facetYaw.map((yaw) => ({
    yaw,
    cx: CX + apothem * Math.sin(yaw),
    cz: CZ + apothem * Math.cos(yaw),
  }));
  for (let i = 0; i < 3; i += 1) {
    const f = facetCentres[i];
    if (i === 1) {
      // THE ENTRY FACET. The whole facet is the entry — the door with a narrow glazed side
      // light each side, no brick jambs, which is what a curved deco corner actually does and
      // is also forced by the arithmetic: at chord 1.86 there is no room for a masonry jamb
      // beside a 1.36 m door. The side lights carry the reveal instead.
      const LOBBY = 0.80;
      const lobW = doorW + 0.32;
      const sideLight = Math.max(0.14, (chord - lobW) / 2 - 0.05);
      add(yawParts([
        part(box(0.10, doorH + 0.52, 0.16, -(lobW / 2 + sideLight + 0.05), (doorH + 0.52) / 2,
          -0.02, 'dsplay-mull-l'), p.joinery, RECESS.sash),
        part(box(0.10, doorH + 0.52, 0.16, (lobW / 2 + sideLight + 0.05), (doorH + 0.52) / 2,
          -0.02, 'dsplay-mull-r'), p.joinery, RECESS.sash),
        part(box(sideLight, doorH + 0.34, 0.05, -(lobW / 2 + sideLight / 2), (doorH + 0.34) / 2,
          -0.06, 'dsplay-sidelight'), p.glass),
        part(box(sideLight, doorH + 0.34, 0.05, (lobW / 2 + sideLight / 2), (doorH + 0.34) / 2,
          -0.06, 'dsplay-sidelight'), p.glass),
        part(box(sideLight + 0.10, doorH + 0.44, 0.10, -(lobW / 2 + sideLight / 2),
          (doorH + 0.44) / 2, -0.72, 'dsplay-sidelight-backer'), p.shadow, RECESS.deep),
        part(box(sideLight + 0.10, doorH + 0.44, 0.10, (lobW / 2 + sideLight / 2),
          (doorH + 0.44) / 2, -0.72, 'dsplay-sidelight-backer'), p.shadow, RECESS.deep),
        part(recessFaces(box(chord, groundTop - doorH - 0.52, METRICS.wallDepth, 0,
          doorH + 0.52 + (groundTop - doorH - 0.52) / 2, 0, 'dsplay-head'), 1, ['ny']), p.wall),
        // r2 MAJOR 2 — the deco's black void at the shopfront centre. See `RECESS.deep`.
        part(box(0.13, doorH + 0.52, LOBBY, -(lobW / 2 - 0.065), (doorH + 0.52) / 2, -LOBBY / 2, 'dsplay-return'), p.wall, RECESS.deep),
        part(box(0.13, doorH + 0.52, LOBBY, (lobW / 2 - 0.065), (doorH + 0.52) / 2, -LOBBY / 2, 'dsplay-return'), p.wall, RECESS.deep),
        part(box(lobW, 0.11, LOBBY, 0, doorH + 0.52, -LOBBY / 2, 'dsplay-soffit'), p.trim, RECESS.deep),
        part(box(lobW - 0.18, doorH + 0.48, 0.22, 0, (doorH + 0.48) / 2, -LOBBY - 0.09, 'dsplay-well'),
          p.shadow, RECESS.deep),
        // A terrazzo threshold with an inlaid band, which is the deco answer to a tessellated
        // Victorian mosaic: a poured floor with a strip in it, not a chequer of tiles.
        part(slab(doorW + 0.62, 0.11, 0.30, 0, 0.0, 0.10, 'dsplay-step'), p.paving),
        part(slab(lobW, 0.06, LOBBY, 0, 0.11, -LOBBY / 2, 'dsplay-floor'), p.paving, RECESS.deep),
        part(slab(lobW - 0.34, 0.03, 0.10, 0, 0.175, -LOBBY * 0.34, 'dsplay-inlay'), p.trim, 1),
        part(slab(lobW - 0.34, 0.03, 0.10, 0, 0.175, -LOBBY * 0.72, 'dsplay-inlay'), p.trim, 1),
        // The stepped deco surround over the entry: three receding bands, the geometric relief
        // §2 asks to be restrained about.
        part(box(lobW + 0.62, 0.16, 0.16, 0, doorH + 0.62, 0.09, 'dsplay-band-a'), p.trim),
        part(box(lobW + 0.40, 0.13, 0.13, 0, doorH + 0.80, 0.075, 'dsplay-band-b'), p.trim),
        part(box(lobW + 0.20, 0.11, 0.11, 0, doorH + 0.95, 0.06, 'dsplay-band-c'), p.trim),
      ], f.yaw, f.cx, f.cz));
      const door = yawResult(commercialDoor(ctx, {
        x: 0, y: doorH / 2 + 0.14, z: -LOBBY + 0.06, w: doorW, h: doorH,
        id: 'dshop-door', label: 'Shop door', glazed: true, leafMaterial: p.joinery,
      }), f.yaw, f.cx, f.cz);
      add(door.parts);
      if (door.opening) ctx.addOpening(door.opening);
      add(yawParts([
        part(box(doorW - 0.04, 0.34, 0.05, 0, doorH + 0.34, -LOBBY + 0.10, 'dsplay-fanlight'), p.glass),
        part(box(doorW + 0.14, 0.07, 0.09, 0, doorH + 0.14, -LOBBY + 0.12, 'dsplay-fan-rail'), p.joinery, RECESS.sash),
      ], f.yaw, f.cx, f.cz));
    } else {
      // The two flanking facets: the steel corner window, which is the type's signature.
      add(yawParts([
        part(recessFaces(box(chord, groundTop - headY, METRICS.wallDepth, 0,
          headY + (groundTop - headY) / 2, 0, 'dfacet-head'), 1, ['ny']), p.wall),
        part(box(chord, sillY, METRICS.wallDepth, 0, sillY / 2, 0, 'dfacet-cill'), p.wall),
      ], f.yaw, f.cx, f.cz));
      add(yawParts(steelShopWindow(ctx, {
        x: 0, z: 0, w: chord - 0.10, sillY, headY, id: `dcorner-${i}`, lights: 2,
      }), f.yaw, f.cx, f.cz));
    }
  }

  /* ── shopfronts on the two straight frontages ────────────────────────────────────── */
  for (let i = 0; i < bays.length; i += 1) {
    add(steelShopWindow(ctx, {
      x: bays[i].x, z: frontZ, w: bays[i].w, sillY, headY, id: `dshop-win-${i}`, lights: 2,
    }));
  }
  add(yawParts(steelShopWindow(ctx, {
    x: 0, z: 0, w: 2.05, sillY, headY, id: 'dshop-win-side', lights: 2,
  }), Math.PI / 2, rightX, sideWinZ));

  // The residence's own street door, punched out of the side wall beside the shopfront. With the
  // dwelling upstairs the household needs a stair off the street, which is what the plate shows
  // on that elevation.
  const dResZ = backZ + 1.20;
  add(commercialDoor(ctx, {
    x: rightX, y: 2.34 / 2 + 0.05, z: dResZ, w: 1.06, h: 2.34,
    facing: 'right', id: 'ddwell-door', label: 'Residence door', leafMaterial: p.wallAlt,
  }));
  add([
    part(slab(1.05, 0.16, 1.55, rightX + 0.50, 2.74, dResZ, 'ddwell-hood'), p.trim),
    part(recessFaces(slab(0.95, 0.06, 1.45, rightX + 0.50, 2.66, dResZ,
      'ddwell-hood-soffit'), RECESS.soffit, ['ny']), p.wallAlt),
    part(box(0.16, 0.24, 0.10, rightX + 0.10, 3.19, dResZ, 'ddwell-hood-rod-plate'), p.joinery),
    // The stay rod as the diagonal it is — plate at (rightX + 0.04, 3.14) to the hood's outer
    // edge at (rightX + 1.02, 2.78). `l4cv-geom.mjs` found the old horizontal version floating
    // at both ends and the fix is carried up with the door rather than re-derived.
    part(rotBox(1.044, 0.05, 0.05, rightX + 0.53, 2.96, dResZ, { z: -0.352 },
      'ddwell-hood-rod'), p.joinery),
  ]);

  /* ══ THE DWELLING STOREY ═══════════════════════════════════════════════════════════════════
   *
   * [SEEN] the deco plate crop (250,30)-(1330,520) at 1.25x: horizontal steel banks, one per
   * straight frontage and one wrapping all three facets of the corner, each set in a dark grey
   * surround with a projecting grey sill under it. The proportion is the opposite of the
   * Victorian's — 2.9 m wide by 1.6 m tall against 1.16 by 2.10 — and that alone sorts the two
   * upper storeys in a greyscale read before a single moulding is legible.
   */
  const upSill = groundTop + 0.78;
  const upWinH = 1.62;
  const upHeadY = upSill + upWinH;
  const dUpFront = bays.map((b) => hole(b.x, upSill, 2.90, upWinH));
  const dUpSide = [hole(sideWinZ, upSill, 2.20, upWinH)];
  add(openWall(ctx, {
    material: p.wall, axis: 'x', face: 1, plane: frontZ,
    centre: (leftX + frontRunHi) / 2, run: frontRunHi - leftX,
    y0: groundTop, y1: wallTop, depth: METRICS.wallDepth,
    openings: dUpFront, name: 'dup-front',
  }));
  add(openWall(ctx, {
    material: p.wall, axis: 'z', face: 1, plane: rightX,
    centre: (rightRunLo + backZ) / 2, run: rightRunLo - backZ,
    y0: groundTop, y1: wallTop, depth: METRICS.wallDepth,
    openings: dUpSide, name: 'dup-right',
  }));
  add(blindWall({
    axis: 'z', plane: leftX, centre: midZ, run: shopD,
    y0: groundTop, y1: wallTop, name: 'dup-left', bays: 2, baseHeight: 0.26,
  }));
  add(blindWall({
    axis: 'x', plane: backZ, centre: 0, run: halfW * 2,
    y0: groundTop, y1: wallTop, name: 'dup-back', bays: 3, baseHeight: 0.26,
  }));
  // The interior backer must sit below the metal roof, not cover its deck and seams.
  // Keep its floor and window backing; the top clears the deck underside by 0.065 m.
  const upperRoomBase = groundTop - 0.20;
  const upperRoomTop = wallTop - 0.35;
  add([part(box(halfW * 2 - 1.8, upperRoomTop - upperRoomBase, shopD - 1.8, 0,
    (upperRoomBase + upperRoomTop) / 2, midZ, 'dup-room'), p.shadow, RECESS.interior)]);
  for (let i = 0; i < dUpFront.length; i += 1) {
    const o = dUpFront[i];
    add(punchedWindow(ctx, {
      x: o.u, y: o.y + o.height / 2, z: frontZ, w: o.width, h: o.height,
      lights: T.upperLights, id: `dup-front-${i}`, curtain: true,
    }));
  }
  add(punchedWindow(ctx, {
    x: rightX, y: upSill + upWinH / 2, z: dUpSide[0].u, w: dUpSide[0].width, h: upWinH,
    facing: 'right', lights: T.upperLights, id: 'dup-side', curtain: true,
  }));
  // THE CORNER BANK. It runs across all three facets, which is the one thing the plate does that
  // no other subject in this lane can: a canted bay glazed continuously round its own curve. Each
  // facet's wall is built in that facet's frame with its cut faces carrying the §5.3 lining floor
  // exactly as `openWall` tags them, and one sash sits in each.
  const dFacetWinW = chord - 0.44;
  const dCheek = (chord - dFacetWinW) / 2;
  for (const f of facetCentres) {
    add(yawParts([
      part(recessFaces(box(chord, upSill - groundTop, METRICS.wallDepth, 0,
        (groundTop + upSill) / 2, 0, 'dup-facet'), 1, ['py']), p.wall),
      part(recessFaces(box(chord, wallTop - upHeadY, METRICS.wallDepth, 0,
        (upHeadY + wallTop) / 2, 0, 'dup-facet'), 1, ['ny']), p.wall),
      part(recessFaces(box(dCheek, upWinH, METRICS.wallDepth, -(dFacetWinW + dCheek) / 2,
        upSill + upWinH / 2, 0, 'dup-facet'), 1, ['px']), p.wall),
      part(recessFaces(box(dCheek, upWinH, METRICS.wallDepth, (dFacetWinW + dCheek) / 2,
        upSill + upWinH / 2, 0, 'dup-facet'), 1, ['nx']), p.wall),
    ], f.yaw, f.cx, f.cz));
    add(yawParts(punchedWindow(ctx, {
      x: 0, y: upSill + upWinH / 2, z: 0.17, w: dFacetWinW, h: upWinH,
      lights: 2, id: `dup-facet-${Math.round(f.yaw * 100)}`, curtain: true,
    }).parts, f.yaw, f.cx, f.cz));
  }

  /* ── banded spandrels, base, stepped parapet ─────────────────────────────────────── */
  // ── §2.3 / §2.10, r2: THE TERRAZZO BASE IS THE DECO'S ONE CHEAPEST FIX AND IT SERVES BOTH ──
  //
  // The r1 critic on the blind pair it lost widest: "Pair C is the widest margin and the reason
  // is one element: the reference's DARK TERRAZZO PLINTH COURSE and dark green joinery give it
  // nine readable bands where ours is one cream field." The same subject is the only §2.10
  // failure in the family at 85.3 % of chromatic area in one sector, against a reference band of
  // 58.4-77.6 %, and [MEASURED] with `v371-h2-patch.mjs` on
  // `crit1/row--shop-corner-deco--street.png` the reason is visible in two numbers: the wall
  // field reads rgb(152,135,110) at B-R -42 and the parapet rgb(226,216,196) at B-R -29. Both
  // are ochre and between them they are most of the object.
  //
  // A base course in `wallAlt` — the DARK TERRAZZO on this scheme at 52 rendered, chroma 7 —
  // takes area away from the ochre AND puts a dark band under a subject whose darkest large
  // surface was previously its own shadow. One member pair does §2.3, §2.9 and §2.10 at once,
  // which is why it is first rather than a palette edit: §5.3.1 is explicit that letting the
  // other buckets drift toward the dominant hue is the original fault by a longer road, and
  // taking AREA off the dominant hue is the move that is not that.
  //
  // 0.34 -> 0.62, and carried round all three curve facets, because the corner is what a player
  // sees first on this id and the rectangle stops at the tangent points.
  add(plinthCourse(ctx, {
    z: midZ, w: halfW * 2, d: shopD, h: 0.62, proud: 0.10,
    material: p.wallAlt, capMaterial: p.paving, name: 'plinth',
    skirtRecess: RECESS.sash, // r3 §5.5.7a — asked for, not inherited. See `plinthCourse`.
  }));
  for (const f of facetCentres) {
    add(plinthFacet(ctx, {
      cx: f.cx, cz: f.cz, yaw: f.yaw, run: chord + 0.10, h: 0.62, proud: 0.10,
      material: p.wallAlt, capMaterial: p.paving, name: 'dfacet-plinth',
    }));
  }
  // RULED RENDER (§2.5). The other two variants get their surface break from bed joints, which
  // this one has no brick to carry. Ruled render is the same move in the same material era: a
  // coarse horizontal scribe every 0.55 m, which is what a 1930s rendered façade actually has
  // and what stops the field reading as one flat cream plane between the bands.
  // ── AND THE FRONT RUN OF IT WAS A NO-OP, WHICH THE CENSUS FOUND, NOT A PLATE ────────────
  //
  // `y0: headY + 1.20` is 4.24 and `y1: wallTop - 0.05` is 4.25. Ten millimetres, at a pitch of
  // 0.55: the principal frontage of this subject has been asking for ruled render and getting
  // one course or none for as many rounds as the block has existed, while the side elevation
  // (`y0: 0.55`) has had the full run. The comment above describes the side wall only.
  //
  // Solved against the surface it is FOR: the spandrel, which starts where the awning stops
  // hiding the wall (`awnY` 3.34 plus its own deck) and ends under the parapet. `awnY` is
  // declared below this point, so the datum is written out rather than referenced.
  // Re-datumed with the storey, and the openings are PASSED: at one storey this call ran 3.62 to
  // 4.25 and produced one course or none (the no-op the previous round found by census); at two
  // it runs the dwelling storey, where a scribe drawn straight across a steel window bank would
  // be a line on the glass.
  add(brickCourses(ctx, {
    axis: 'x', face: 1, plane: frontZ, centre: (leftX + frontRunHi) / 2, run: frontRunHi - leftX,
    y0: groundTop + 0.12, y1: wallTop - 0.34, openings: dUpFront, pitch: 0.62,
  }));

  add(brickCourses(ctx, {
    axis: 'z', face: -1, plane: leftX, centre: midZ, run: shopD, y0: 0.55, y1: wallTop, pitch: 0.72,
  }));
  // THE BANDED SPANDRELS. Two rendered bands running the whole frontage between the window head
  // and the parapet, which is the horizontal emphasis the style is built on and the exact
  // opposite of the Victorian's vertical pilaster rhythm.
  //
  // ── AND THEY ARE DARK, WHICH IS A REFERENCE READING ──────────────────────────────────────
  //
  // [SEEN] `_reference-landmarks/mp-shopcorner-deco.png` (13:24), the period likeness plate for
  // this exact subject: the cream render is banded in DARK GREY-GREEN at the parapet, at the
  // spandrel and at the stallboard, and those three bands are the whole of what makes the plate
  // read as deco rather than as a cream box with a stepped top. Ours were `trim` on a `wall`
  // field — 139 on 120, a 19-luma step — which is why the plate's own instrument put this
  // subject at the hottest median in the lane (144.4) with 46.8 % of its area in two adjacent
  // light bands, and why `--hue` put 74.1 % of its coloured area in one family.
  //
  // `stringCourse` takes no material argument, so the bucket moves at the call site: the two
  // bands are rebuilt here as explicit members in `wallAlt` (52). Same two courses, same
  // projection, same triangles as `stringCourse` emits for a four-sided wrap; what changes is
  // that the horizontal now reads as a band rather than as a highlight.
  /* ── AND THE FRONT BAND RAN 3.60 m PAST THE WALL IT BANDED ────────────────────────────────
   *
   * `box(halfW * 2 + 0.22, ...)` at `frontZ + 0.055` spans the whole body width at the frontage
   * plane — but the frontage STOPS at `frontRunHi`, which is `splay` (3.60 m) short of `rightX`,
   * because the corner is an arc set back from both tangent points. So 3.60 m of every band ran
   * across open air in front of the curve. `l4cv-geom.mjs` cannot see it: its FLOAT check asks
   * whether a bbox touches another bbox, and this one touches the facet walls it flies past.
   *
   * The bands now run the two straight frontages and turn the corner on the facets, which is what
   * the reference does — [SEEN] `_reference-landmarks/mp-shopcorner-deco.png` crop
   * (250,30)-(1330,520) at 1.25x, where the dark grey band at the parapet base is continuous
   * round all three facets and is the single strongest horizontal on the plate.
   *
   * And they are re-datumed onto the dwelling storey: the lower band is the projecting sill under
   * the upper window banks, the upper one is the parapet-base band. At one storey both sat at
   * 3.38 and 3.76, i.e. in the 40 mm between the awning deck and the shopfront head.
   */
  // V3.71 lane H — TWO OR THREE BANDS. A 1930s rendered corner runs its horizontals either as a
  // sill band and a parapet band, or as those two plus a lintel band over the window heads. It
  // is 6 members either way, it costs 72 triangles, and the horizontal count is the thing that
  // separates two deco corners at board zoom the way the baluster count separates two Victorians.
  // The band bucket is the tenancy's — dark terrazzo or pale render — and it is this subject's
  // only material axis, for the reason `corner-shop-tenancy.js` records.
  const bandMat = T.bandBucket === 'trim' ? p.trim : p.wallAlt;
  const dBands = [
    { y: upSill - 0.15, h: 0.18, d: T.bandDepth },
    ...(T.bandCount >= 3 ? [{ y: upHeadY + 0.20, h: 0.14, d: T.bandDepth - 0.02 }] : []),
    { y: wallTop - 0.26, h: 0.34, d: T.bandDepth - 0.01 },
  ];
  for (let i = 0; i < dBands.length; i += 1) {
    const b = dBands[i];
    add([
      part(recessFaces(box((frontRunHi - leftX) + 0.16, b.h, b.d, (leftX + frontRunHi) / 2, b.y,
        frontZ + b.d / 2, `dband-${i}`), RECESS.soffit, ['ny']), bandMat),
      part(recessFaces(box(b.d, b.h, (rightRunLo - backZ) + 0.16, rightX + b.d / 2, b.y,
        (rightRunLo + backZ) / 2, `dband-${i}`), RECESS.soffit, ['ny']), bandMat),
    ]);
    for (const f of facetCentres) {
      add(yawParts([part(recessFaces(box(chord + 0.06, b.h, b.d, 0, b.y, 0.17 + b.d / 2,
        `dband-${i}`), RECESS.soffit, ['ny']), bandMat)], f.yaw, f.cx, f.cz));
    }
  }

  // Parapet: a low run either side, stepping up over the corner in three tiers, with vertical
  // fluting on the tallest. The step is the silhouette event.
  const paraLo = 0.72;
  // Fluted pilasters closing both ends of the straight parapets. A deco parapet is stopped, not
  // run out — and the flutes tie the ends to the tower without repeating its whole language.
  for (const [px, pz, yaw] of [
    [leftX + 0.40, frontZ - 0.04, 0],
    [frontRunHi - 0.34, frontZ - 0.04, 0],
    [rightX - 0.04, backZ + 0.40, Math.PI / 2],
  ]) {
    add(yawParts([
      part(box(0.62, paraLo + 0.30, 0.40, 0, wallTop + (paraLo + 0.30) / 2, 0, 'dpilaster'), p.wall),
      part(box(0.74, 0.13, 0.50, 0, wallTop + paraLo + 0.37, 0.01, 'dpilaster-cap'), p.trim),
      ...(ctx.detail ? (T.pilasterFlutes >= 3 ? [-0.18, 0, 0.18] : [-0.11, 0.11]).map((u) => part(
        box(0.09, paraLo + 0.16, 0.10, u, wallTop + (paraLo + 0.16) / 2, 0.20, 'dpilaster-flute'),
        p.trim,
      )) : []),
    ], yaw, px, pz));
  }
  add([
    part(box(frontRunHi - leftX, paraLo, 0.32, (leftX + frontRunHi) / 2, wallTop + paraLo / 2,
      frontZ - 0.04, 'dpara-front'), p.wall),
    part(recessFaces(box(frontRunHi - leftX + 0.10, 0.13, 0.44, (leftX + frontRunHi) / 2,
      wallTop + paraLo + 0.065, frontZ - 0.02, 'dpara-front-cope'), RECESS.soffit, ['ny']), p.trim),
    part(box(0.32, paraLo, rightRunLo - backZ, rightX - 0.04, wallTop + paraLo / 2,
      (rightRunLo + backZ) / 2, 'dpara-right'), p.wall),
    part(recessFaces(box(0.44, 0.13, rightRunLo - backZ + 0.10, rightX - 0.02,
      wallTop + paraLo + 0.065, (rightRunLo + backZ) / 2, 'dpara-right-cope'),
    RECESS.soffit, ['ny']), p.trim),
    part(box(halfW * 2, 0.40, 0.30, 0, wallTop + 0.20, backZ + 0.15, 'dpara-back'), p.wall),
  ]);
  // The corner's own parapet, one run per facet, so the tower steps down onto something rather
  // than standing on a hole in the parapet line.
  for (const f of facetCentres) {
    add(yawParts([
      part(box(chord + 0.06, paraLo, 0.32, 0, wallTop + paraLo / 2, -0.02, 'dpara-facet'), p.wall),
      part(recessFaces(box(chord + 0.14, 0.13, 0.44, 0, wallTop + paraLo + 0.065, 0.0,
        'dpara-facet-cope'), RECESS.soffit, ['ny']), p.trim),
    ], f.yaw, f.cx, f.cz));
  }
  const tower = facetCentres[1];
  /* ══ V3.71 LANE H — THE TOWER PROFILE IS THE VARIATION AXIS ════════════════════════════════
   *
   * The three-tier ziggurat is the r12 member set and the reference plate's own profile. The
   * other three tenancies are the same tower stepping differently — a two-step fin tower, a
   * four-step shouldered one, and a shallower stepped slab. All four spring from the same corner
   * facet, all four top out between wallTop + 2.80 and wallTop + 3.55, and all four are still the
   * tallest thing on the lot, so the SILHOUETTE CLASS ("deco corner tower over a banded
   * two-storey mass") is untouched. What changes is the outline against the sky, which is what a
   * player sorts two neighbours on before a single band is legible.
   *
   * The tier plan carries `dw` as a WIDTH DELTA on the facet chord rather than an absolute, so a
   * facade jitter that moves `chord` moves every tier with it and the tower cannot come adrift
   * of the facet it stands on. `tierFace` is DERIVED from each tier's own depth rather than
   * written out: the round that first got these members visible found every one of them authored
   * 300-400 mm inside the tower because a `z` had been copied forward, and a face that is
   * computed from `dz + depth/2` cannot drift that way again.
   */
  const TIER_D = 0.34;
  const tiers = T.tierPlan.map((t) => ({ w: chord + t.dw, h: t.h, z: t.dz }));
  const tierFace = tiers.map((t) => t.z + TIER_D / 2);
  const topTier = tiers.length - 1;
  for (let i = 0; i < tiers.length; i += 1) {
    const t = tiers[i];
    add(yawParts([
      part(box(t.w, t.h, TIER_D, 0, wallTop + t.h / 2, t.z, `dtower-${i}`), p.wall),
      part(recessFaces(box(t.w + 0.16, 0.14, TIER_D + 0.12, 0, wallTop + t.h + 0.07, t.z + 0.02,
        `dtower-${i}-cope`), RECESS.soffit, ['ny']), p.trim),
    ], tower.yaw, tower.cx, tower.cz));
  }
  /* ══ VERTICAL FLUTING ON THE TOP TIER, AND THE FAULT THE MEMBER SET CARRIES ════════════════
   *
   * Fins with a shadow between each, on the tallest tier: the one place this subject is
   * vertical, and it works because everything under it is banded horizontally.
   *
   * KEPT VERBATIM FROM r12 BECAUSE IT IS THE REASON `tierFace` EXISTS. [SEEN]
   * `l4ph3/shop-corner-deco--three-quarter.png` (14:08) crop (520,150)-(1120,560) at 2x: the
   * three-tier tower was THREE BLANK CREAM SLABS — the five fins, their caps, the two chevron
   * blocks and the blank sign panel absent from the outward face entirely, because
   * `yawParts(..., tower.yaw)` maps local +z OUTWARD and every one of them had been authored at
   * -0.26 to -0.11, i.e. 300-400 mm out of the BACK of the tower. The same error had already cost
   * this lane its Victorian pediment panel and both blank signboards.
   *
   * V3.71 lane H changes only WHERE the number comes from: `tierFace` is now derived from each
   * tier's own `dz` and depth instead of being written out as a literal triple, so a tenancy that
   * steps its tower differently cannot re-open the bug by having a stale face constant.
   */
  if (ctx.detail) {
    const fins = [];
    const finN = T.finCount;
    const finPitch = (chord - 0.50) / finN;
    /* ── THE FIN BAND IS SOLVED, NOT WRITTEN OUT ─────────────────────────────────────────────
     *
     * [SEEN] `l4ts2/shop-corner-deco--three-quarter.png` (15:12) crop (620,120)-(1020,420) at 3x:
     * the fins read for the first time — and ran the whole 2.10 m from the lowest tier's sign
     * surround up across BOTH intermediate copes onto the top block, so they read as rods laid
     * over a stepped parapet rather than as fluting in it. The reference confines its fluting to
     * the raised centre block, flanking the panel: [SEEN] `_reference-landmarks/
     * mp-shopcorner-deco.png` crop (250,30)-(1330,520) at 1.25x.
     *
     * V3.71 lane H makes a tenancy's tower step differently, so the 1.16 m gap that fix was sized
     * against is no longer a constant. The band is derived from the tier below the top and capped
     * at 1.10 m, top-aligned under the top cope — the same read on a two-step tower as on a
     * four-step one, rather than a literal that is right for exactly one tier plan.
     */
    const finHead = wallTop + tiers[topTier].h - 0.22;
    const finFloor = wallTop + (topTier > 0 ? tiers[topTier - 1].h + 0.20 : 0.50);
    const finH = Math.max(0.55, Math.min(1.10, finHead - finFloor - 0.14));
    const finY = finHead - finH / 2;
    for (let i2 = 0; i2 < finN; i2 += 1) {
      const u = -(chord - 0.50) / 2 + (i2 + 0.5) * finPitch;
      fins.push(part(box(finPitch * 0.46, finH, 0.14, u, finY,
        tierFace[topTier] + 0.03, 'dflute'), p.trim));
      // The head of the flute: a flat cap, or a chamfered stop cut back to the tower face. Two
      // boxes' worth of difference and it changes the top edge of the one member on this subject
      // that is read against the sky.
      if (T.finTop === 'chamfer') {
        fins.push(part(rotBox(finPitch * 0.46, 0.16, 0.17, u, finHead + 0.04,
          tierFace[topTier] + 0.01, { x: 0.42 }, 'dflute-chamfer'), p.trim));
      } else {
        fins.push(part(recessFaces(box(finPitch * 0.46, 0.13, 0.20, u, finHead + 0.07,
          tierFace[topTier] + 0.01, 'dflute-cap'), RECESS.soffit, ['ny']), p.trim));
      }
    }
    add(yawParts(fins, tower.yaw, tower.cx, tower.cz));
  }
  // A restrained geometric relief either side of the fluting: two stepped chevron blocks on the
  // tier below the top, where the tower is still wide enough to carry them. `chevTier` is derived
  // so a two-step tower puts them on its own lower block rather than on an index that does not
  // exist, and the half-width comes from that tier's own `w` rather than from a literal.
  const chevTier = Math.max(0, topTier - 1);
  if (T.chevron) {
    const chevU = tiers[chevTier].w / 2 - 0.34;
    add(yawParts([
      part(box(0.40, 0.40, 0.12, -chevU, wallTop + 1.20, tierFace[chevTier] + 0.02, 'drelief'), p.trim),
      part(box(0.40, 0.40, 0.12, chevU, wallTop + 1.20, tierFace[chevTier] + 0.02, 'drelief'), p.trim),
      part(box(0.24, 0.24, 0.16, -chevU, wallTop + 1.20, tierFace[chevTier] + 0.06, 'drelief-b'), p.wallAlt),
      part(box(0.24, 0.24, 0.16, chevU, wallTop + 1.20, tierFace[chevTier] + 0.06, 'drelief-b'), p.wallAlt),
    ], tower.yaw, tower.cx, tower.cz));
  }
  // The blank moulded panel on the lowest tier, which is what the reference plate carries over
  // its own splay: a double-lined recessed rectangle, read on its surround. `signBand` offsets
  // its members by `facing * 0.03` and gives them a 0.10 depth, so the z that puts their outer
  // edge 0.05 proud of a face at 0.19 is 0.16 — written out rather than guessed a fourth time.
  add(yawParts(signBand(ctx, {
    x: 0, y: wallTop + 0.44, z: tierFace[0] - 0.03, w: chord + 0.10, h: 0.52,
    facing: 1, blank: true,
  }), tower.yaw, tower.cx, tower.cz));

  /* ── the shop roof ───────────────────────────────────────────────────────────────────
   *
   * THREE PIECES AGAIN, AND THE CORNER ONE LAPS RATHER THAN ABUTS. `corner-shop.js` covers its
   * 45 degree splay with three COPLANAR pieces, which works because a chamfer is one straight
   * line. A curve is three, and three coplanar panels that each cover their own sector overlap
   * their neighbours — coplanar overlap is a z-fight, which §1.2 lists as a major in as many
   * words. So the corner panel sits 0.03 m ABOVE the two decks and laps over them, which is
   * also what a real roof does at a change of direction.
   *
   * The three cover ranges are solved against the arc rather than eyeballed: the back deck
   * reaches z 3.10 (arc allows x 5.91 there, it uses 5.85), the front deck reaches x 3.87 (the
   * arc's own limit at its z 5.15), and the corner panel spans radius 2.05 +/- 1.22 from the
   * arc centre at 45 degrees, whose outer corners sit at radius 3.59 inside the wall's own
   * 3.60. The two sectors it does not reach — below 20.7 and above 69.3 degrees — are the two
   * the decks already cover, checked at the boundary rather than assumed.
   */
  const deckY = wallTop - 0.22;
  // Only these three decks and their flashings use the quieter packed roof finish.
  // Seams, exterior copings and every other roof-bucket member retain their materials.
  const roofMetalCtx = { ...ctx, p: { ...p, roof: p.roofDeck, trim: p.roofDeck } };
  add(seamedSkillion(roofMetalCtx, {
    w: 5.85 - (leftX + 0.25), d: 3.10 - (backZ + 0.25),
    x: (5.85 + leftX + 0.25) / 2, z: (3.10 + backZ + 0.25) / 2,
    yLow: deckY, yHigh: deckY, fall: 'back', overhang: 0.04, name: 'droof-back',
  }));
  add(seamedSkillion(roofMetalCtx, {
    w: 3.87 - (leftX + 0.25), d: (frontZ - 0.25) - 3.10,
    x: (3.87 + leftX + 0.25) / 2, z: ((frontZ - 0.25) + 3.10) / 2,
    yLow: deckY, yHigh: deckY, fall: 'back', overhang: 0.04, name: 'droof-front',
  }));
  add(yawParts(seamedSkillion(roofMetalCtx, {
    w: 2.96, d: 2.44, x: 0, z: 0, yLow: deckY + 0.03, yHigh: deckY + 0.03,
    fall: 'back', overhang: 0.02, name: 'droof-corner',
  }), Math.PI / 4, CX + 2.05 * Math.SQRT1_2, CZ + 2.05 * Math.SQRT1_2));
  add(gutterRun(ctx, {
    x: 0, z: backZ - 0.02, w: halfW * 1.5, y: wallTop - 0.34, facing: -1,
    dropAt: -halfW * 0.6, y0: 0.5,
  }));

  /* ── the cantilevered awning ─────────────────────────────────────────────────────── */
  const awnY = 3.34;
  // V3.71 lane H — the footpath cover is the second of §5.3.11's axes and on a deco corner it is
  // the slab, its stepped fascia and the rods that hang it. Reach, step count and rod pitch all
  // move with the tenancy; the CLAMP does not, because §3.6 binds this member harder than any
  // other on the subject and `maxZ` is what keeps the fascia bead on the pad.
  // r2 — the fascia takes the dark terrazzo. See `cantileverAwning`'s own `fasciaMaterial` block:
  // a `trim` fascia the full width of the frontage, immediately over glazing measured at plate
  // 98-118, put the two biggest lower-frame surfaces in one band. On this scheme `wallAlt` IS the
  // terrazzo the reference plate bands its awning with, so this is the id telling the truth about
  // what it is made of rather than a value chosen to move a number.
  const dAwnKit = {
    tiers: 0, rodPitch: T.awningRodPitch, fasciaMaterial: p.wallAlt, fasciaH: 0.46,
    // r3 §5.5.10 — and the DECK over that fascia was still `trim`, seen from above at both hero
    // stations. A deco awning slab is rendered concrete, which is `paving` on this scheme (92):
    // one step under the wall field at 120 and 48 under `trim`.
    deckMaterial: p.paving,
  };
  add(cantileverAwning(ctx, {
    x: (leftX + frontRunHi) / 2, z: frontZ, w: (frontRunHi - leftX) - 0.1, y: awnY,
    proj: 0.95, maxZ: padHalfD - METRICS.rim - 0.15, name: 'dawn-front', ...dAwnKit,
  }));
  add(yawParts(cantileverAwning(ctx, {
    x: 0, z: 0, w: (rightRunLo - backZ) - 0.1, y: awnY, proj: 0.95,
    maxZ: padHalfW - halfW - METRICS.rim - 0.15, name: 'dawn-side', ...dAwnKit,
  }), Math.PI / 2, rightX, (rightRunLo + backZ) / 2));
  // §3.6 ON A CURVE. A yawed cantilever's outermost point is not its reach: it is
  // `centre + (reach + nose) * n + (w/2) * t`, and on the 75 degree facet that put the fascia
  // bead at 7.65 m against the lot's 7.5 — measured by `l4var-bounds.mjs`, which named the
  // member. The reach is solved per facet against BOTH lot axes rather than clamped on one.
  const facetW = chord - 0.16;
  const NOSE = 0.16;                                   // fascia + bead beyond the deck edge
  for (let i = 0; i < 3; i += 1) {
    const f = facetCentres[i];
    const sn = Math.sin(f.yaw);
    const cs = Math.cos(f.yaw);
    const rx = sn > 0.01
      ? (padHalfW - 0.12 - f.cx - (facetW / 2) * Math.abs(cs)) / sn - NOSE : 99;
    const rz = cs > 0.01
      ? (padHalfD - 0.12 - f.cz - (facetW / 2) * Math.abs(sn)) / cs - NOSE : 99;
    const reach = Math.max(0.7, Math.min(0.95, rx, rz));
    // 0.16 narrower than the chord so the three meet at a joint rather than in each other —
    // adjacent facets turn 30 degrees and a full-chord awning on each would interpenetrate at
    // every joint, which is the §1.2 fault this variant's whole corner is exposed to.
    add(yawParts(cantileverAwning(ctx, {
      x: 0, z: 0, w: facetW, y: awnY, proj: reach, maxZ: reach,
      name: `dawn-facet-${i}`, rods: i === 1, tiers: 0, fasciaH: 0.46,
      rodPitch: T.awningRodPitch, fasciaMaterial: p.wallAlt, deckMaterial: p.paving,
    }), f.yaw, f.cx, f.cz));
  }
  // One shallow, level canopy ties both street displays to the recessed corner door.
  // The footprint and all legal leaves remain authored above; no pavement furniture is added.
  // Raised trade lettering uses the existing library trim bucket, without an atlas/material.
  const frontReach = Math.max(0.7, Math.min(frontZ + 0.95,
    padHalfD - METRICS.rim - 0.15) - frontZ);
  const shopCap = fitCap(T.trade.word, { width: frontRunHi - leftX - 1.1, height: 0.32 });
  add(reliefLetters({ text: T.trade.word, x: (leftX + frontRunHi) / 2,
    y: awnY - 0.37, z: frontZ + frontReach + 0.132, cap: shopCap,
    material: p.trim, name: 'dfront-trade' }));
  // Full-height end/junction piers carry the fascia, framing wide display lights as one shop.
  // They stand on existing solid wall piers, outside the authored window apertures.
  for (const x of [leftX + 0.28, (bays[0].x + bays[1].x) / 2, frontRunHi - 0.18]) {
    add(part(box(0.26, awnY - 0.16, 0.18, x, (awnY - 0.16) / 2 + 0.16,
      frontZ + 0.04, 'dfront-pier'), p.wallAlt));
  }
  add(lamp(ctx, { x: leftX + 1.1, y: awnY + 0.50, z: frontZ + 0.12 }));

  /* ══ THE SPANDREL, WHICH IS THIS SUBJECT'S BLANK SURFACE ══════════════════════════════
   *
   * [SEEN] `vd1/shop-corner-deco--three-quarter.png` at 1x: everything from the awning line to
   * the tower cope reads as one continuous beige field crossed by two thin white lines. It is
   * not a single big panel the way the Victorian's pediment is — it is wall, parapet and tower
   * running together at nearly the same value — and it is why this subject measured the hottest
   * median in the lane (144.4) and 46.8 % of its area in two adjacent light bands.
   *
   * The deco answer is not a panel. It is VERTICALS: fluted pilaster strips rising through the
   * spandrel at the bay junctions, and a reeded band between the string course and the parapet.
   * Both are drawn from `wallAlt` (renders 52 against `wall` 120 and `trim` 139), so every one
   * of them is a dark member in the light field — the detail and the §5c distribution are the
   * same edit, which is the only reason there is room to spend 700 triangles on one band.
   */
  // The fluted strips are the piers BETWEEN the upper storey's window banks now, which is where
  // a deco elevation puts its verticals. At one storey they ran the 0.66 m of spandrel between
  // the awning and the parapet; at two they run the full 3.00 m of the dwelling storey, which is
  // the same 216 triangles doing four times the work.
  const spandY0 = groundTop + 0.16;
  const spandY1 = wallTop - 0.12;
  const flutedStrip = (u, plane, yaw, name) => {
    const g = [
      part(box(0.46, spandY1 - spandY0, 0.13, u, (spandY0 + spandY1) / 2, plane + 0.075, name), p.wallAlt),
      part(recessFaces(box(0.58, 0.10, 0.22, u, spandY1 + 0.05, plane + 0.09, `${name}-cap`),
        RECESS.soffit, ['ny']), p.trim),
    ];
    if (ctx.detail) {
      for (const s of [-0.13, 0, 0.13]) {
        g.push(part(box(0.07, spandY1 - spandY0 - 0.12, 0.06, u + s,
          (spandY0 + spandY1) / 2, plane + 0.16, `${name}-flute`), p.trim));
      }
    }
    return yaw ? yawParts(g, yaw, plane, u) : g;
  };
  for (const b of bays) {
    for (const s of [-1, 1]) add(flutedStrip(b.x + s * (b.w / 2 + 0.30), frontZ, 0, 'dstrip'));
  }
  // The side street takes two, at the ends of its own window rather than at four bay junctions
  // it does not have — a deco side elevation is quieter than its principal frontage.
  for (const s of [-1, 1]) {
    add(yawParts(flutedStrip(0, 0, 0, 'dstrip'), Math.PI / 2, rightX, sideWinZ + s * 1.35));
  }
  /* ── THE REEDED BAND IS CUT, ON THE REFERENCE AND ON ITS OWN BUILDER'S VERDICT ────────────
   *
   * 420 triangles of 0.11 m fins at a 0.30 m pitch across the spandrel. Two things retire it.
   *
   * [SEEN] `_reference-landmarks/mp-shopcorner-deco.png` crop (250,30)-(1330,520) at 1.25x: the
   * plate has NO reeded wall band. Its only fluting is on the parapet's raised centre block, five
   * flutes each side of the moulded panel, which is exactly what `dflute` builds — and which,
   * until the fix above, was invisible. The reeding was standing in for a member that existed and
   * could not be seen.
   *
   * And the previous round's own self-estimate withheld this subject from 3.5 partly for it:
   * "the reeded band reads coarser than deco reeding should — 0.11 m fins at 0.30 m pitch is
   * nearly 2:1 dark to light and at 3q it reads as teeth rather than reeding". With the dwelling
   * storey the surface it ran on is no longer a 0.66 m spandrel but a 3.00 m wall carrying window
   * banks, and a band of teeth across that is worse, not better.
   */
  // ── THE FACET JUNCTIONS HAD NO VERTICAL, AND A CURVE WITHOUT ONE READS AS A CHAMFER ─────
  //
  // The three facets butt at their tangent lines with nothing standing at the joint, so the
  // corner reads as three flats meeting at two creases. A deco curved corner runs a slim pier
  // at every joint; it is what makes the eye follow the curve round rather than count the
  // facets, and it also gives the two joints a shadow they currently get only from the sun
  // angle. Two piers, each a body and two flutes, standing from the plinth to the parapet cope.
  for (let j = 0; j < 2; j += 1) {
    const jointYaw = Math.PI / 6 + j * (Math.PI / 6);      // 30 and 60 degrees: the two tangents
    const jx = CX + splay * Math.sin(jointYaw);
    const jz = CZ + splay * Math.cos(jointYaw);
    add(yawParts([
      part(box(0.34, wallTop + paraLo, 0.16, 0, (wallTop + paraLo) / 2, 0.02, 'dfacet-pier'), p.wall),
      part(recessFaces(box(0.44, 0.11, 0.26, 0, wallTop + paraLo + 0.06, 0.04, 'dfacet-pier-cap'),
        RECESS.soffit, ['ny']), p.trim),
      ...(ctx.detail ? [-0.09, 0.09].map((u) => part(
        box(0.06, wallTop + paraLo - 0.5, 0.06, u, (wallTop + paraLo) / 2, 0.09, 'dfacet-pier-flute'),
        p.trim,
      )) : []),
    ], jointYaw, jx, jz));
  }
  /* ── AND THE MAST IS CUT TOO ──────────────────────────────────────────────────────────────
   *
   * [SEEN] `_reference-landmarks/mp-shopcorner-deco.png` at 1024 x 683 and again on the tower
   * crop: there is no mast, no pole and no finial anywhere on the plate. A deco corner shop's
   * skyline event IS the stepped parapet — the ziggurat steps and the raised fluted centre block
   * — and this subject now has that visible for the first time (the block above). The mast was
   * standing in for a skyline this subject did in fact have and could not show.
   *
   * It also cost measurable plate area. The previous round measured the subject at 1 390 x 743 px
   * / 607 336 px with no mast against 1 253 x 780 / 507 658 with a 1.35 m one — 16 % of the hero
   * station's area for 88 triangles, because the lab fits its camera to the bounding box. Cutting
   * it gives that back, and the dwelling storey is what now carries the height.
   */

  /* ── grunge ──────────────────────────────────────────────────────────────────────── */
  add(tideCourse(ctx, {
    axis: 'x', plane: frontZ, centre: (leftX + frontRunHi) / 2, run: frontRunHi - leftX,
    y: 0.42, facing: 1, h: 0.30,
  }));

  add(streaks(ctx, {
    plane: frontZ, facing: 1, axis: 'x',
    xs: [leftX + 1.4, leftX + 4.2, frontRunHi - 1.0], yTop: awnY - 0.06, length: 1.0,
  }));
  add(streaks(ctx, {
    plane: frontZ, facing: 1, axis: 'x', xs: [leftX + 2.9, frontRunHi - 2.4],
    yTop: wallTop + 0.60, length: 1.2,
  }));

  /* ══ THE REAR IS A YARD, NOT A WING ═══════════════════════════════════════════════════════
   *
   * [SEEN] `_reference-landmarks/mp-shopcorner-deco.png` at 1024 x 683: behind the two-storey
   * mass the plate has a LOW rendered boundary wall with a cope, a clothesline with washing on it
   * and a paling gate — no second building. The flat-roofed rear wing is deleted outright: three
   * walls, a room box, a plinth, four curtained sashes, a deck, three parapet upstands, three
   * copes, a gutter run, a door with its hood, soffit, rod plate and stay, and that elevation's
   * streaks. The shop takes 2.40 m of the depth it vacated.
   */
  add(streaks(ctx, {
    plane: backZ, facing: -1, axis: 'x',
    xs: [leftX + 2.0, halfW - 2.4], yTop: wallTop - 0.35, length: 1.8,
  }));

  /* ── the yard ────────────────────────────────────────────────────────────────────── */
  // Laid out against its own footprints rather than dropped on top of them. With the wing gone
  // the shop runs back to z -3.00 and the yard is the 3.9 m between there and the lawn edge at
  // -6.88: paving -3.55 to -5.15, beds -5.85 to -6.85. Every object below is checked clear of
  // the one before it, which is the discipline the previous layout paid for.
  const yardZ = backZ - 1.35;
  add(paverField(ctx, { x: 0.6, z: yardZ, w: 6.0, d: 1.6, unit: 1.15, bed: false }));
  add(binStore(ctx, { x: leftX + 1.4, z: yardZ - 0.05, w: 2.0, d: 1.2, h: 1.4 }));
  // The clothesline with the yard to itself, which is what the plate has behind its own wall.
  add(clothesline(ctx, { x: 2.6, z: yardZ - 0.15, h: 1.95, arm: 1.10 }));
  // Geometric beds, which is what a 1930s lot does with its planting: rectangles with kerbs,
  // and they take the rear boundary instead of a hedge — a deco lot is drawn, not grown.
  add(plantedBed(ctx, {
    x: -halfW * 0.52, z: -padHalfD + METRICS.rim + 0.62, w: 4.4, d: 1.00, plants: 3, salt: S_DEC,
  }));
  add(plantedBed(ctx, {
    x: halfW * 0.42, z: -padHalfD + METRICS.rim + 0.62, w: 3.2, d: 1.00, plants: 2, salt: S_DEC + 20,
  }));
  add(canopyTree(ctx, {
    x: halfW - 2.6, z: -padHalfD + METRICS.rim + 1.95, h: 3.1, canopy: 0.80, habit: 'columnar',
  }));
  // ── §2.6, r2: A STREET TREE ON THE FRONTAGE, WHICH IS THE PLACE EVERY REFERENCE PUTS ONE ──
  //
  // The r1 critic graded §2.6 at 2.0 on this id with the finding that the planting is built and
  // unreachable, and its addendum records that the modern already demonstrates the placement.
  // Columnar habit, because this is a deco lot and a fastigiate street tree is what one gets;
  // `TREE_HABIT.columnar` reaches only 0.72 * canopy in x at the widest lobe against `round`'s
  // 1.12, so at canopy 0.78 on the front footpath it stands well inside the rim.
  // Placed off the LOT RIM and its own reach, never off `leftX` — see the block on the Victorian's
  // own frontage tree for the containment breach that rule exists to stop. `TREE_HABIT.columnar`
  // reaches 0.16 + 0.62 * 1.12 = 0.85 of canopy at its widest lobe, so 0.85 is the multiplier here
  // rather than `round`'s 1.12; the expression states which habit it is solving for.
  // r5 §2.6 — canopy 0.78 -> 1.06, height 5.10 -> 5.45. See the Victorian's block for why this
  // is zero triangles and why containment does not move.
  const dTreeReach = 0.85 * 1.06;
  add(canopyTree(ctx, {
    x: -(padHalfW - METRICS.rim - dTreeReach - 0.05),
    z: padHalfD - METRICS.rim - dTreeReach - 0.05,
    h: 5.45, canopy: 1.06, habit: 'columnarBroken', pit: true,
  }));
  // A rendered dwarf wall with piers rather than pickets — the deco boundary, and the plate puts
  // exactly this against the side street behind the shop.
  //
  // r2 — moved outboard from `padHalfW - rim - 1.40` to `- 0.40`, for the reason recorded on the
  // Victorian's own two runs: at 5.48 it stood a metre inside the boundary with a two-storey
  // rendered wall directly behind it, so a 0.95 m dwarf wall in `wallAlt` was dark render read
  // against pale render; at 6.48 it is silhouetted against the backdrop. Zero triangles.
  add(picketFence(ctx, {
    z: padHalfW - METRICS.rim - 0.40, x0: -padHalfD + METRICS.rim + 0.3, x1: backZ - 0.15,
    h: 0.95, gapX: backZ - 1.30, gapW: 1.30, axis: 'z', masonry: true,
  }));
  add(lawnTufts(ctx, {
    count: 12, salt: S_DEC + 60,
    avoid: [
      { x: 0, z: midZ, w: halfW * 2 + 2.6, d: shopD + 4.2 },
      { x: padHalfW - 1.4, z: 0, w: 3.4, d: env.lotD },
      { x: 0.6, z: yardZ, w: 7.0, d: 2.6 },
    ],
  }));
}

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 3. MODERN — shop-corner-modern
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * A contemporary shopfront: full-height fixed glazing on a low kick plate, slim aluminium
 * framing, and nothing else. No stallboard, no transom mouldings, no bullnose — the whole
 * argument of the type is that the frame gets out of the way.
 */
function fixedGlazing(ctx, {
  x, z, w, facing = 'front', sillY = 0.20, headY = 3.10, id = 'mwin', lights = 3,
}) {
  countAperture('glazedBay');
  const p = ctx.p;
  const yaw = typeof facing === 'number' ? facing : (
    facing === 'back' ? Math.PI : facing === 'left' ? -Math.PI / 2
      : facing === 'right' ? Math.PI / 2 : 0);
  const ux = Math.cos(yaw); const uz = -Math.sin(yaw);
  const nx = Math.sin(yaw); const nz = Math.cos(yaw);
  const place = (bw, bh, bt, u, v, n, name) => {
    const g = box(bw, bh, bt, 0, 0, 0, name);
    g.rotateY(yaw);
    g.translate(x + ux * u + nx * n, v, z + uz * u + nz * n);
    g.computeBoundingBox();
    return g;
  };
  const out = [];
  const h = headY - sillY;
  const my = sillY + h / 2;
  const R = 0.20;

  // ── MAJ-V4: THIS WAS A CONTINUOUS NEAR-BLACK BAND UNDER THE WHOLE SHOPFRONT ──────────────
  //
  // `joinery` renders at luma 48 on this scheme and the kick runs the full width of every bay
  // with the bays end to end, so the three of them read as ONE unbroken black line the length of
  // the street elevation — the variants critic measured the largest sub-40 blob on the subject
  // at 14,765 px and named it. It is the same species the stallboard fix closed one storey above
  // it, on the member that fix does not reach.
  //
  // Two changes, both zero triangles. The kick is `wallAlt` — the fibre-cement panel — which is
  // what a contemporary shopfront actually kicks against and is 134 rather than 48; and its
  // street face carries the §5.3 `sash` floor, because it sits under a blade awning and turned
  // away from the sun, which is the arithmetic §5.3 settles for every member in that position.
  // The `-kick-cap` nosing above it keeps its own soffit level, so the two still step.
  out.push(part(recessFaces(place(w + 0.08, sillY, 0.14, 0, sillY / 2, 0.05, `${id}-kick`),
    RECESS.sash, ['pz']), p.wallAlt));
  // The kick cap's UNDERSIDE is a nosing soffit 40 mm proud of the plate below it, and
  // `l4r12-members.mjs` measures 0.783 m2 of it below sky visibility 0.12 on each bay. Per face:
  // its top stands in full sun and is untouched.
  out.push(part(recessFaces(place(w + 0.10, 0.07, 0.17, 0, sillY + 0.02, 0.065, `${id}-kick-cap`),
    RECESS.soffit, ['ny']), p.trim));
  out.push(part(recessFaces(place(0.09, h, R, -w / 2 + 0.045, my, -R / 2, `${id}-ret-l`), 1, ['px']), p.trim, 1));
  out.push(part(recessFaces(place(0.09, h, R, w / 2 - 0.045, my, -R / 2, `${id}-ret-r`), 1, ['nx']), p.trim, 1));
  out.push(part(recessFaces(place(w, 0.11, R, 0, headY - 0.055, -R / 2, `${id}-ret-h`), 1, ['ny']), p.trim, 1));
  // ── MAJ-V3, MEASURED AND RE-ARGUED: A LIT CARD IS NOT A LIT SHOP ─────────────────────────
  //
  // [MEASURED] on `vd2/shop-corner-modern--three-quarter.png` with `l4ph-patch.py` at three
  // pane patches — (230,450)-(330,510), (520,470)-(600,520), (560,510)-(640,560) — the panes
  // read **L 138.7 / 157.2 / 149.2**. §5.2's reference glass band is 21-49 and the generated
  // pack's own panes measure 58-93. This subject's glass is not "improved and not shut", it is
  // three times the band, and it is the palest in the family by 40 luma: the same instrument
  // reads the deco at 97.4 / 112.2 and the Victorian at 76.8 / 102.5.
  //
  // The cause is NOT the pane. `GLASS_SKY` is solved against three measured panes and is shared
  // by every subject in the lane, including the two that read acceptably. What differs here is
  // WHAT IS BEHIND IT. r10 argued the backer up to `trim` — "a shop with its lights on" — and
  // that argument was made when the backer was the ONLY thing behind the pane, on subjects whose
  // openings sit under a 1.85-2.05 m verandah. This subject glazes from 0.22 to 3.06 under a
  // thin blade, so the backer's DIFFUSE term is live here and dead on the other two: 2.84 m of
  // the brightest albedo in the scheme (`trim` renders at 144, the highest in the lane) standing
  // in sky light, 0.80 m behind a pane that passes 16 % of it.
  //
  // So the lit-shop reading moves off the card and onto the fitout, which is also what a
  // photograph of a corner shop actually shows through its glass: a ceiling with a lit soffit,
  // a stocked gondola run, a chiller. The backer goes to `shadow` — the dim rear wall of a deep
  // room — and the VALUE now comes from members with shape, so the pane carries a value STEP
  // instead of one flat field. That is §2.2's "dark, slightly reflective body" earned by
  // geometry rather than asserted by a hex, and it is the same edit as the detail-density ask.
  // r5 — REVERTED to `RECESS.interior` (§5.5.20). r4 raised this backer to `RECESS.deep`, measured
  // the whole assignment at ~0.03 points, and shipped it; on the modern it moved the panes out of
  // §5.5.14's band and on this scheme it moved nothing at all.
  out.push(part(place(w + 0.04, h + 0.04, 0.30, 0, my, -0.80, `${id}-interior`), p.shadow, RECESS.interior));
  if (ctx.detail) {
    // ── AND THE FIRST VERSION OF THIS FITOUT MADE THE PANE PALER, WHICH THE PLATE MEASURED ──
    //
    // The backer went `trim` -> `shadow` as argued above, and I then filled the space in front
    // of it with a `trim` ceiling and two `trim` shelf boards and a `wallAlt` gondola. [MEASURED]
    // `l4ph-px.py` on the same three patches of `l4ph2/shop-corner-modern--three-quarter.png`
    // against `vd2`: **138.7 -> 138.9, 157.2 -> 168.4, 149.2 -> 159.9.** Two of the three went
    // UP. The subject bbox is 1450x671 -> 1448x685, so it is not a framing shift; I replaced a
    // distant pale card with NEARER pale members and made the fault worse.
    //
    // The arithmetic I should have done first: this scheme's light buckets are `trim` 144,
    // `wallAlt` 134 and `paving` 110, and every member I reached for inside the pane was one of
    // them. Its dark buckets are `shadow` 46, `joinery` 48, `roof` 63 and `wall` 96. A shop
    // interior read through daylit glass is DARK with structure in it — which is what
    // `_reference-landmarks/mp-shopcorner-modern.png` shows — so the fitout is now built down
    // the dark half of the ladder: backer 46, gondola 48, shelves and gondola top 63, ceiling
    // 96. Four value steps, all under the pane, none of them a light bucket.
    out.push(part(recessFaces(place(w - 0.10, 0.07, 0.44, 0, headY - 0.30, -0.56, `${id}-ceiling`),
      RECESS.soffit, ['ny']), p.wall, RECESS.interior));
    out.push(part(place(w - 0.30, 0.95, 0.34, 0, 0.62, -0.52, `${id}-gondola`), p.joinery, RECESS.interior));
    out.push(part(place(w - 0.34, 0.06, 0.40, 0, 1.12, -0.52, `${id}-gondola-top`), p.roof, RECESS.interior));
    for (let s = 0; s < 2; s += 1) {
      out.push(part(place(w - 0.34, 0.05, 0.38, 0, 0.46 + s * 0.34, -0.51, `${id}-shelf`), p.roof, RECESS.interior));
      for (let g = 0; g < 2; g += 1) {
        out.push(part(place((w - 0.52) * 0.34, 0.24, 0.22, -(w - 0.52) * 0.22 + g * (w - 0.52) * 0.44,
          0.63 + s * 0.34, -0.50, `${id}-stock`), (s + g) % 2 ? p.joinery : p.wall, RECESS.interior));
      }
    }
    out.push(part(place(0.60, 1.62, 0.36, w * 0.28, 0.85, -0.58, `${id}-chiller`), p.glass));
  }

  // Slim frame: head, cill and mullions at 0.055 m, and nothing between them.
  out.push(part(place(w, 0.09, 0.09, 0, sillY + 0.05, -R + 0.04, `${id}-cill`), p.joinery, RECESS.sash));
  out.push(part(place(w, 0.10, 0.09, 0, headY - 0.05, -R + 0.04, `${id}-head`), p.joinery, RECESS.sash));
  const n = Math.max(1, lights);
  for (let i = 1; i < n; i += 1) {
    out.push(part(place(0.055, h - 0.10, 0.09, -w / 2 + (w * i) / n, my, -R + 0.04, `${id}-mull`),
      p.joinery, RECESS.sash));
  }
  for (let i = 0; i < n; i += 1) {
    const lw = (w - 0.12) / n;
    out.push(part(place(lw - 0.05, h - 0.20, 0.04, -w / 2 + 0.06 + (i + 0.5) * lw, my, -R - 0.02,
      `${id}-pane`), p.glass));
  }
  return out;
}

export function buildShopCornerModern(ctx) {
  const { env, p } = ctx;
  const add = (produced) => ctx.add(produced);
  // V3.71 lane H — this placement's own tenancy. The notch, the blade and the panel-over-brick
  // material argument are the id's identity and are held; the parapet upstand, the roof plant,
  // the blade's reach and fascia, the ribbon rhythm, the joint count and the WORD all move.
  const T = modernTenancy(ctx);

  const halfW = env.bodyW / 2;
  const frontZ = env.frontZ;
  const shopD = 7.60;
  const backZ = frontZ - shopD;
  /* ══ §5.3.11 — TWO STOREYS, THE DWELLING ABOVE THE SHOP ════════════════════════════════════
   *
   * [SEEN] `_reference-landmarks/mp-shopcorner-modern.png` (13:29) at 1024 x 683 and the crop
   * (240,40)-(1360,560) at 1.2x. Two storeys, and the upper one is where this variant's whole
   * material argument lives: a grey face-brick spandrel band sitting on the awning line, PALE
   * FIBRE-CEMENT PANELS above it with expressed joints and visible fixings, and dark-framed
   * ribbon windows set in deep reveals with no projecting sill. Flat roof over it with a light
   * coping, a condenser on a plinth and a capped flue standing proud.
   *
   * Ours put the panel band in the 0.75 m between the shopfront head and a single-storey
   * parapet, and the dwelling in a skillion wing behind. `content.js:116` registers this id as
   * `storeys: 2`. The wing is deleted and rebuilt above; the shop takes the depth (5.10 -> 7.60).
   */
  const groundTop = 3.95;                  // the first-floor line
  const upperH = 3.55;
  const wallTop = groundTop + upperH;      // 7.50 — parapet, coping and roof plant spring here
  /* ── AND THE BRICK BAND IS 1.20 m, NOT 0.85, BECAUSE THE SIGNAGE ARITHMETIC SAYS SO ────────
   *
   * [MEASURED] `mvp/tests/l4ts-signcost.mjs`, which prices the signage seat's own `fitCap`,
   * `wordCost` and `assessLabel` at §5.4.0's WALL scales (6.47 along / 4.97 up at the 319 m board
   * station, 10.87 / 8.35 at the shipped 190 m default) rather than at the 7.33 this lane has
   * been quoting. Of the eight fields the four two-storey subjects offer, seven are still
   * `blank-plate` at both stations because the WIDTH binds — a splay pediment is 2.4-2.6 m across
   * however tall the building gets, and eight glyphs in 2.6 m is a 0.44 m cap.
   *
   * The one field the second storey genuinely creates is THIS one: a face-brick spandrel running
   * the whole frontage. At 0.85 m it gives a 0.53 m usable band and a `blank-plate` at every
   * station. At 1.20 m it gives 1.30 m of usable height over 10.2 m of clear width, which is a
   * 1.30 m cap — `reads` at the shipped station (stroke 1.74 px, cap 10.9 px against bars of 1.7
   * and 10) and `marginal` at 319 m. That is exactly the split §5.4.0 licenses: author real words,
   * expect them at the station a player plays at, do not claim them at 319 m.
   */
  // V3.71 lane H — the band's height is a tenancy choice within the range the signage
  // arithmetic below licenses (1.20-1.42), never below it: at 0.85 m this carrier was a
  // `blank-plate` at every station, and a tenancy that shrank it would take the one legible
  // word in the lane down with it.
  const brickTop = groundTop + T.brickBand;  // the face-brick spandrel band's head
  const padHalfD = env.lotD / 2;
  const padHalfW = env.lotW / 2;
  const midZ = (frontZ + backZ) / 2;
  const rightX = halfW;
  const leftX = -halfW;
  const sillY = 0.22;
  const headY = 3.06;
  // THE NOTCH. No splay, no curve: the corner is cut back square, 2.1 m by 1.5 m, and the entry
  // stands in it under the awning. It is the third distinct corner plan in the family and it is
  // what a contemporary corner shop actually does.
  const notchW = 2.10;
  const notchD = 1.50;
  const notchX = rightX - notchW / 2;
  const notchZ = frontZ - notchD;

  add(boardPlinth(ctx, { lawn: true }));
  add(cornerFootpaths(ctx, { unit: 0.95, walkD: 1.30, sideWalk: 1.25 }));

  /* ── the shop box ────────────────────────────────────────────────────────────────── */
  const glazeRun = (rightX - notchW) - leftX;
  const bays = [
    { x: leftX + glazeRun * 0.25, w: glazeRun * 0.44 },
    { x: leftX + glazeRun * 0.74, w: glazeRun * 0.44 },
  ];
  add(openWall(ctx, {
    material: p.wall, axis: 'x', face: 1, plane: frontZ,
    centre: (leftX + (rightX - notchW)) / 2, run: glazeRun,
    y0: 0, y1: brickTop, depth: METRICS.wallDepth,
    openings: bays.map((b) => hole(b.x, sillY, b.w, headY - sillY)), name: 'mshop-front',
  }));
  // The notch's two faces: the return wall facing +z carries the entry, and the cheek facing +x
  // carries a tall side light. Both are real walls with real cut faces.
  add(openWall(ctx, {
    material: p.wall, axis: 'x', face: 1, plane: notchZ, centre: notchX, run: notchW,
    y0: 0, y1: brickTop, depth: METRICS.wallDepth,
    openings: [hole(notchX - 0.30, 0, 1.30, 2.62)], name: 'mnotch-front',
  }));
  // THE NOTCH CHEEK WAS INSIDE OUT, and `l4r12-members.mjs` found it rather than a plate:
  // 5.925 m2 of dark on one member, the largest single dark area on the subject. `face: -1` at
  // this plane puts the wall's BODY in the notch void with its lit face turned into the shop —
  // so the surface a customer walks past was the wall's back. `face: 1` puts the body in the
  // building and the face in the notch, which is what every other wall on this subject does.
  //
  // And then it takes the §5.3 LINING floor on that face (`px` — `faceBox` builds an axis-'z'
  // panel with its depth on local x, so the face at the plane is +x). It is the lining of a
  // 1.50 m deep recess: it cannot be lit, so it has to carry.
  const notchCheek = openWall(ctx, {
    material: p.wall, axis: 'z', face: 1, plane: rightX - notchW, centre: (frontZ + notchZ) / 2,
    run: notchD, y0: 0, y1: brickTop, depth: METRICS.wallDepth, name: 'mnotch-cheek',
  });
  for (const item of notchCheek) recessFaces(item.geometry, 1, ['px']);
  add(notchCheek);
  add(openWall(ctx, {
    material: p.wall, axis: 'z', face: 1, plane: rightX, centre: (notchZ + backZ) / 2,
    run: notchZ - backZ, y0: 0, y1: brickTop, depth: METRICS.wallDepth,
    openings: [hole((notchZ + backZ) / 2 + 0.20, sillY + 0.55, 2.30, 2.05),
      hole(backZ + 1.15, 0, 1.02, 2.30)], name: 'mshop-right',
  }));
  add(openWall(ctx, {
    material: p.wall, axis: 'z', face: -1, plane: leftX, centre: midZ, run: shopD,
    y0: 0, y1: brickTop, depth: METRICS.wallDepth, name: 'mshop-left',
  }));
  add(openWall(ctx, {
    material: p.wall, axis: 'x', face: -1, plane: backZ, centre: 0, run: halfW * 2,
    y0: 0, y1: brickTop, depth: METRICS.wallDepth, name: 'mshop-back',
  }));
  add([
    part(box(halfW * 2 - 1.8, groundTop - 0.2, shopD - 1.8, 0, groundTop / 2, midZ, 'mshop-room'),
      p.shadow, RECESS.interior),
    part(slab(halfW * 2 - 0.9, 0.10, shopD - 0.9, 0, 0.05, midZ, 'mshop-floor'), p.paving),
  ]);

  /* ── glazing ─────────────────────────────────────────────────────────────────────── */
  for (let i = 0; i < bays.length; i += 1) {
    add(fixedGlazing(ctx, {
      x: bays[i].x, z: frontZ, w: bays[i].w, sillY, headY, id: `mshop-win-${i}`, lights: 3,
    }));
  }
  add(yawParts(fixedGlazing(ctx, {
    x: 0, z: 0, w: 2.30, sillY: sillY + 0.55, headY: sillY + 2.60, id: 'mshop-win-side', lights: 2,
  }), Math.PI / 2, rightX, (notchZ + backZ) / 2 + 0.20));

  /* ── SHOPFRONT HARDWARE: the things a photograph of a suburban shop shows ─────────────
   *
   * Three members that are on every contemporary Australian shopfront and on none of this
   * lane's models: the roller-shutter box that sits above the glass line, its two guide
   * channels down the reveal, and the wall-washers under the awning. They are what makes the
   * head of a shopfront read as an assembly rather than as the top edge of a pane, and they
   * sit in the one band of this elevation the eye is already on.
   *
   * Buckets: box and guides are `joinery` (the darkest family, which is what a powder-coated
   * shutter box is), the box's cap is `trim`. No tenth bucket.
   */
  for (const b of bays) {
    add([
      part(recessFaces(box(b.w + 0.30, 0.30, 0.24, b.x, headY + 0.17, frontZ + 0.10,
        'mshutter-box'), RECESS.soffit, ['ny']), p.joinery),
      part(box(b.w + 0.36, 0.06, 0.28, b.x, headY + 0.34, frontZ + 0.11, 'mshutter-cap'), p.trim),
      part(box(0.09, headY - sillY, 0.13, b.x - b.w / 2 - 0.11, (headY + sillY) / 2, frontZ + 0.07,
        'mshutter-guide'), p.joinery),
      part(box(0.09, headY - sillY, 0.13, b.x + b.w / 2 + 0.11, (headY + sillY) / 2, frontZ + 0.07,
        'mshutter-guide'), p.joinery),
    ]);
  }
  // Wall-washers on the awning soffit. Two members each — a body and a lens — because a light
  // fitting read from below is a dark can with a bright disc in it, and one box is the can only.
  //
  // The soffit datum is DERIVED from `cantileverAwning`'s own construction rather than guessed:
  // its deck is 0.16 thick centred on `awnY`, and the `-soffit` plank sits 0.07 below that
  // centre with its own 0.07 of thickness, so the underside is `awnY - 0.07 - 0.035`. `awnY` is
  // declared further down this function, so the constant is repeated here with the arithmetic
  // shown; `l4ph-geom.mjs` asserts the fitting's top face laps the soffit rather than floating.
  const awnSoffitY = 3.30 - 0.07 - 0.035;
  for (let i = 0; i < 3; i += 1) {
    const lx = leftX + 1.5 + i * ((glazeRun - 3.0) / 2);
    add([
      part(box(0.20, 0.13, 0.20, lx, awnSoffitY - 0.05, frontZ + 0.78, 'mdownlight'), p.joinery),
      part(recessFaces(box(0.14, 0.04, 0.14, lx, awnSoffitY - 0.13, frontZ + 0.78, 'mdownlight-lens'),
        RECESS.soffit, ['ny']), p.trim),
    ]);
  }

  // The meter cabinet and its board, on the side elevation where the service run actually is.
  add([
    part(box(0.10, 0.86, 0.66, rightX + 0.05, 1.42, backZ + 1.35, 'mmeter-box'), p.wallAlt),
    part(box(0.05, 0.10, 0.72, rightX + 0.11, 1.90, backZ + 1.35, 'mmeter-hood'), p.trim),
    part(box(0.04, 0.30, 0.22, rightX + 0.12, 1.42, backZ + 1.35, 'mmeter-face'), p.joinery, RECESS.sash),
  ]);

  /* ── the entry in the notch ──────────────────────────────────────────────────────── */

  const doorW = 1.30;
  const doorH = 2.48;
  add([
    part(recessFaces(box(0.12, doorH + 0.16, 0.26, notchX - 0.30 - doorW / 2 - 0.06,
      (doorH + 0.16) / 2, notchZ - 0.13, 'mentry-jamb-l'), RECESS.deep, ['px']), p.trim, RECESS.deep),
    part(recessFaces(box(0.12, doorH + 0.16, 0.26, notchX - 0.30 + doorW / 2 + 0.06,
      (doorH + 0.16) / 2, notchZ - 0.13, 'mentry-jamb-r'), RECESS.deep, ['nx']), p.trim, RECESS.deep),
    part(recessFaces(box(doorW + 0.36, 0.14, 0.26, notchX - 0.30, doorH + 0.22, notchZ - 0.13,
      'mentry-head'), RECESS.deep, ['ny']), p.trim, RECESS.deep),
    part(box(doorW + 0.20, 0.34, 0.06, notchX - 0.30, doorH + 0.47, notchZ - 0.02, 'mentry-fanlight'), p.glass),
    part(box(doorW + 0.24, 0.30, 0.16, notchX - 0.30, doorH + 0.44, notchZ + 0.09, 'mentry-blade'), p.wallAlt),
    part(slab(doorW + 0.70, 0.10, 0.36, notchX - 0.30, 0.0, notchZ + 0.20, 'mentry-step'), p.paving),
    part(slab(notchW - 0.16, 0.06, notchD - 0.10, notchX, 0.10, (frontZ + notchZ) / 2, 'mentry-floor'), p.paving, RECESS.deep),
    part(box(doorW + 0.10, doorH + 0.10, 0.22, notchX - 0.30, (doorH + 0.10) / 2, notchZ - 0.32,
      'mentry-well'), p.shadow, RECESS.deep),
  ]);
  add(commercialDoor(ctx, {
    x: notchX - 0.30, y: doorH / 2 + 0.10, z: notchZ - 0.02, w: doorW, h: doorH,
    id: 'mshop-door', label: 'Shop door', glazed: true, leafMaterial: p.joinery,
  }));

  /* ══ THE DWELLING STOREY, AND THE PANEL BAND BECOMES THE WALL ══════════════════════════════
   *
   * [SEEN] `_reference-landmarks/mp-shopcorner-modern.png` crop (240,40)-(1360,560) at 1.2x: the
   * upper storey is not a band of panel on a brick wall, it IS panel — pale fibre-cement sheets
   * with expressed joints, standing on a grey face-brick spandrel that sits directly on the
   * awning line. Dark ribbon windows are punched through the panel with deep reveals and NO
   * projecting sill or lintel, which is the opposite of both older variants and is the cue that
   * sorts this rung in a greyscale read.
   *
   * So the upper walls are `wallAlt` (134, the lightest bucket on this subject) over a `wall`
   * ground floor and spandrel (96, the darkest of the three variants' walls). That inversion —
   * pale over dark, where the Victorian and deco are both dark over pale — is the palette note
   * `surfaces.js` already wrote for this rung and the massing could not carry until now.
   *
   * The ribbon sashes take `sill: false, head: false`: `punchedWindow`'s proud sill and lintel are
   * period members and a contemporary aluminium ribbon has neither. That is 24 triangles a window
   * saved AND the correct read.
   */
  // ── §2.3, r2: 0.28 -> 0.55, AND `wallAlt` WOULD HAVE BEEN EXACTLY THE WRONG BUCKET HERE ───
  //
  // The r1 critic's addendum, from its own three-quarter hero: "The plinth course is
  // unambiguously absent: the brick piers run straight into the footpath with no base anywhere on
  // the building." At 0.28 m it was a shadow line. The bucket matters more than the height: on
  // this scheme `wallAlt` is the PALE FIBRE-CEMENT PANEL at 134 rendered, brighter than the face
  // brick it would stand under, so `plinthCourse`'s inherited default would have built a LIGHTER
  // base than the wall — the inverse of §2.3. `joinery` (42,49,56) is the dark base a
  // contemporary shopfront is actually detailed with and the one this scheme already uses for
  // every dark slim member on the building.
  add(plinthCourse(ctx, {
    z: midZ, w: halfW * 2, d: shopD, h: 0.55, proud: 0.08,
    material: p.joinery, capMaterial: p.paving, name: 'plinth',
    skirtRecess: RECESS.sash, // r3 §5.5.7a — asked for, not inherited. See `plinthCourse`.
  }));
  // The notch's two cut faces get the same base, for the reason the splay does on the other
  // three: the corner is what a player looks straight at and a rectangle stops at the tangent.
  add(plinthFacet(ctx, {
    cx: notchX, cz: notchZ, yaw: 0, run: notchW, h: 0.55, proud: 0.08,
    material: p.joinery, capMaterial: p.paving, name: 'mnotch-plinth',
  }));
  add(plinthFacet(ctx, {
    cx: rightX, cz: (frontZ + notchZ) / 2, yaw: Math.PI / 2, run: notchD, h: 0.55, proud: 0.08,
    material: p.joinery, capMaterial: p.paving, name: 'mnotch-plinth',
  }));
  const mUpSill = brickTop + 0.45;
  const mUpH = 1.45;
  // V3.71 lane H — OPENING RHYTHM. Two wide ribbons or three narrower ones across the same
  // panelled frontage. It is the axis §5.3.11 names third and it is the cheapest one on this
  // subject, because a contemporary ribbon carries no sill and no lintel: the third opening is
  // 128 triangles, not 210, and the wall between them stays panel rather than becoming mullion.
  const mUpN = T.upperRibbon;
  const mUpW = mUpN >= 3 ? glazeRun * 0.26 : glazeRun * 0.40;
  const mUpFront = [];
  for (let i = 0; i < mUpN; i += 1) {
    mUpFront.push(hole(leftX + glazeRun * (0.24 + i * (0.48 / (mUpN - 1))), mUpSill, mUpW, mUpH));
  }
  const mUpSide = [hole((notchZ + backZ) / 2 + 0.30, mUpSill, 2.60, mUpH)];
  add(openWall(ctx, {
    material: p.wallAlt, axis: 'x', face: 1, plane: frontZ, centre: 0, run: halfW * 2,
    y0: brickTop, y1: wallTop, depth: METRICS.wallDepth,
    openings: mUpFront, name: 'mup-front',
  }));
  add(openWall(ctx, {
    material: p.wallAlt, axis: 'z', face: 1, plane: rightX, centre: (frontZ + backZ) / 2,
    run: shopD, y0: brickTop, y1: wallTop, depth: METRICS.wallDepth,
    openings: mUpSide, name: 'mup-right',
  }));
  add(openWall(ctx, {
    material: p.wallAlt, axis: 'z', face: -1, plane: leftX, centre: midZ, run: shopD,
    y0: brickTop, y1: wallTop, depth: METRICS.wallDepth, name: 'mup-left',
  }));
  add(openWall(ctx, {
    material: p.wallAlt, axis: 'x', face: -1, plane: backZ, centre: 0, run: halfW * 2,
    y0: brickTop, y1: wallTop, depth: METRICS.wallDepth, name: 'mup-back',
  }));
  // The interior backer runs DOWN to lap the ground floor's own room box. Built to the upper
  // storey alone it spans 4.90 to 7.10 with the ground room ending at 3.85 and the nearest window
  // backer 0.51 m away laterally, so `l4cv-geom.mjs` reported it as `FLOAT ... mup-room at y 5.00`
  // — correctly: an interior box hanging in the middle of a building is unsupported by any bbox.
  // The Victorian and the incumbent escaped it only because a chimney shaft happens to pass
  // through theirs, which is not a support, it is a coincidence. All four now lap.
  add([part(box(halfW * 2 - 1.8, wallTop - groundTop + 0.30, shopD - 1.8, 0,
    (groundTop + wallTop) / 2 - 0.05, midZ, 'mup-room'), p.shadow, RECESS.interior)]);
  for (let i = 0; i < mUpFront.length; i += 1) {
    const o = mUpFront[i];
    add(punchedWindow(ctx, {
      x: o.u, y: o.y + o.height / 2, z: frontZ, w: o.width, h: o.height,
      lights: 2, id: `mup-front-${i}`, sill: false, head: false, curtain: true,
    }));
  }
  add(punchedWindow(ctx, {
    x: rightX, y: mUpSill + mUpH / 2, z: mUpSide[0].u, w: mUpSide[0].width, h: mUpH,
    facing: 'right', lights: 2, id: 'mup-side', sill: false, head: false, curtain: true,
  }));
  // ── AND THE UPPER STOREY OVER THE NOTCH NEEDS A COLUMN UNDER IT ────────────────────────────
  //
  // The corner is notched 2.10 x 1.50 at the ground floor, so the upper storey's own corner has
  // the notch cheek under one edge and NOTHING under the other. r7 MAJ-2 on `shoptop-mixed` is
  // exactly that fault at a bigger scale — "the brick shopfront piers hang off the awning with
  // black gaps under them" — and it was 47 members of cantilevered upper mass. A recessed corner
  // entry in a real building stands on a column, so this one does: one 0.34 m brick column at the
  // notch's outer corner, full height to the spandrel, plus the notch's own soffit.
  add([
    part(box(0.34, brickTop, 0.34, rightX - 0.17, brickTop / 2, frontZ - 0.17, 'mnotch-column'), p.wall),
    part(recessFaces(slab(notchW + 0.10, 0.14, notchD + 0.10, notchX, brickTop - 0.14,
      (frontZ + notchZ) / 2, 'mnotch-soffit'), RECESS.deep, ['ny']), p.trim),
  ]);
  // The expressed panel joints. The plate reads its panel wall on the JOINT, not on a proud
  // sheet: a thin recessed line every 1.5 m or so with the fixing dots between them. Four on the
  // frontage and two on the return, in `shadow`, which is the same move `mshadow-gap` makes under
  // the coping and costs six members rather than the eleven proud panels this replaced.
  for (let i = 0; i < T.panelJoints; i += 1) {
    add([part(box(0.07, wallTop - brickTop - 0.16, 0.06,
      leftX + (i + 1) * (halfW * 2 / (T.panelJoints + 1)) + T.jointShift,
      (brickTop + wallTop) / 2, frontZ + 0.03, 'mpanel-joint'), p.shadow, RECESS.soffit)]);
  }
  for (let i = 0; i < 2; i += 1) {
    add([part(box(0.06, wallTop - brickTop - 0.16, 0.07, rightX + 0.03,
      (brickTop + wallTop) / 2, backZ + (i + 1) * (shopD / 3), 'mpanel-joint'), p.shadow, RECESS.soffit)]);
  }
  // The residence's own street door on the return, at ground level beside the shopfront — the
  // plate has exactly this, a flush door in the brick with a concrete step at it.
  const mResZ = backZ + 1.15;
  add(commercialDoor(ctx, {
    x: rightX, y: 2.30 / 2 + 0.06, z: mResZ, w: 1.02, h: 2.30,
    facing: 'right', id: 'mdwell-door', label: 'Residence door', leafMaterial: p.joinery,
  }));
  // §3.6 — the step and hood reach past `rightX`, and `rightX` is itself facade-jittered, so the
  // offsets are solved against the LOT rather than chosen. `l4var-bounds.mjs` named both members
  // at |x| 7.552 and 7.502 against 7.5 on facade 3 before this, which is the same class of miss
  // the deco's yawed awning and the Victorian's canopy tree each cost this lane one round.
  const mStepW = 1.10;
  const mStepOff = Math.min(0.46, padHalfW - 0.12 - rightX - mStepW / 2);
  add([
    part(slab(mStepW, 0.14, 0.92, rightX + mStepOff, 0.0, mResZ, 'mdwell-step'), p.paving),
    part(box(mStepW, 0.10, 0.14, rightX + mStepOff - 0.04, 2.62, mResZ, 'mdwell-hood'), p.trim),
  ]);
  // EXPRESSED COLUMNS between the glazed bays. A contemporary shopfront is a frame with glass
  // hung in it, and the column at each bay junction is the member that says so — it is this
  // variant's answer to the Victorian's pilaster and the deco's flute, and it is the only
  // vertical on the elevation.
  for (const b of bays) {
    for (const side of [-1, 1]) {
      const cx2 = b.x + side * (b.w / 2 + 0.16);
      add([
        // The column's cheeks line the glazing recess exactly as `office.js`'s pier cheeks line
        // its bay (r12 §1.3), and they take `soffit` rather than `lining` for the same reason:
        // the window's own `-ret` members sit at 1.00 further in, and putting both at one level
        // collapses the value step §2.2 asks for into a single lit band.
        part(recessFaces(box(0.26, headY + 0.10, 0.30, cx2, (headY + 0.10) / 2, frontZ + 0.08,
          'mcolumn'), RECESS.soffit, ['px', 'nx']), p.wallAlt),
        part(box(0.32, 0.09, 0.36, cx2, headY + 0.14, frontZ + 0.09, 'mcolumn-cap'), p.trim),
        part(box(0.32, 0.10, 0.36, cx2, 0.05, frontZ + 0.09, 'mcolumn-base'), p.joinery),
      ]);
    }
  }
  // A SHADOW GAP under the coping instead of a cornice. "Minimal mouldings" is not "no shadow
  // line" — the contemporary detail is a recessed reveal, and it is one member per elevation.
  add([
    part(box(halfW * 2 - 0.10, 0.09, 0.06, 0, wallTop + T.parapetUpstand - 0.02, frontZ - 0.16,
      'mshadow-gap'), p.shadow, RECESS.soffit),
    part(box(0.06, 0.09, shopD - 0.10, rightX - 0.16, wallTop + T.parapetUpstand - 0.02, midZ,
      'mshadow-gap'), p.shadow, RECESS.soffit),
  ]);
  // Flat parapet with a slim coping, and the notch's own head carried across it.
  //
  // V3.71 lane H — a contemporary parapet is read on exactly two numbers: how far the upstand
  // stands above the roof deck, and how far the coping oversails it. 0.30 with a fat cope reads
  // as a banded box; 0.62 with a thin one reads as a raised blade. Both are on the street, both
  // are the same seven members, and the difference is legible in silhouette at board zoom —
  // which is the whole point, because the flat parapet is this id's entire skyline.
  const mUp = T.parapetUpstand;
  const mCopeW = 0.30 + T.copingProud * 1.6;
  add([
    part(box(halfW * 2 + 0.06, mUp, 0.30, 0, wallTop + mUp / 2, frontZ - 0.03, 'mpara-front'), p.wall),
    part(recessFaces(box(halfW * 2 + 0.26, 0.10, mCopeW, 0, wallTop + mUp + 0.05, frontZ - 0.02,
      'mpara-front-cope'), RECESS.soffit, ['ny']), p.trim),
    part(box(0.30, mUp, shopD, rightX - 0.03, wallTop + mUp / 2, midZ, 'mpara-right'), p.wall),
    part(recessFaces(box(mCopeW, 0.10, shopD + 0.20, rightX - 0.02, wallTop + mUp + 0.05, midZ,
      'mpara-right-cope'), RECESS.soffit, ['ny']), p.trim),
    part(box(0.30, mUp, shopD, leftX + 0.03, wallTop + mUp / 2, midZ, 'mpara-left'), p.wall),
    part(recessFaces(box(mCopeW, 0.10, shopD + 0.20, leftX + 0.02, wallTop + mUp + 0.05, midZ,
      'mpara-left-cope'), RECESS.soffit, ['ny']), p.trim),
    part(box(halfW * 2, mUp - 0.04, 0.30, 0, wallTop + (mUp - 0.04) / 2, backZ + 0.15,
      'mpara-back'), p.wall),
  ]);
  // The roof deck and a condenser bank behind a slatted screen — the contemporary skyline event,
  // and nothing else stands on it.
  add([part(slab(halfW * 2 - 0.4, 0.12, shopD - 0.4, 0, wallTop, midZ, 'mroof-deck'), p.roof)]);
  /* ══ V3.71 LANE H — WHAT STANDS ON THE ROOF IS A TENANCY CHOICE ════════════════════════════
   *
   * [SEEN] `_reference-landmarks/mp-shopcorner-modern.png` (13:29): the reference stands its
   * condenser and its flue PROUD of the parapet, unscreened, as the one event on an otherwise
   * flat roof — that is what dates a contemporary shop from across a street. The r12 round found
   * the opposite fault here and on the office in this lane, off its own plate: batten screens
   * that "fully occlude the plant units behind them, so the roofscape reads as an empty cage
   * beside a lift overrun". The units stand 0.72 tall from `wallTop + 0.12` and the screen stood
   * 1.05 from the same datum, so it was 330 mm taller than everything behind it. The screen is
   * 0.62 and the units are on a 0.18 plinth, so the fan decks clear its head by 200 mm.
   *
   * The four roof plants below are the same three member kinds arranged four ways — two units
   * behind a screen, one unit and a taller flue, a pair of flues, a screened single unit. The
   * roof is a corner shop's whole silhouette above the coping, so this is the cheapest real
   * separation on the subject: no new bucket, no new member kind, four different skylines.
   */
  const plantX = leftX + 2.85 + T.plantShift;
  const condenser = (cx3) => [
    part(slab(1.42, 0.18, 1.02, cx3, wallTop + 0.12, midZ - 0.6, 'mplant-plinth'), p.paving),
    part(slab(1.30, 0.72, 0.90, cx3, wallTop + 0.30, midZ - 0.6, 'mplant-unit'), p.roof),
    part(slab(1.10, 0.09, 0.72, cx3, wallTop + 1.02, midZ - 0.6, 'mplant-fan'), p.joinery),
  ];
  const flue = (fx, fh) => [
    part(cyl(0.13, fh, fx, wallTop + 0.06 + fh / 2, midZ - 0.35, 'y', 'mflue', 8), p.joinery),
    part(cyl(0.20, 0.14, fx, wallTop + 0.13 + fh, midZ - 0.35, 'y', 'mflue-cowl', 8), p.trim),
  ];
  if (T.roofPlant === 'condenser-pair') {
    add([...condenser(plantX - 0.75), ...condenser(plantX + 0.75)]);
    add(battenScreen(ctx, {
      x: plantX, y: wallTop + 0.12, z: midZ + 0.05, w: 3.4, h: 0.62, pitch: 0.42,
      facing: 1, material: p.joinery,
    }));
  } else if (T.roofPlant === 'flue-pair') {
    add(condenser(plantX - 0.55));
    add(flue(plantX + 1.35, 1.55));
    add(flue(plantX + 1.95, 1.05));
  } else if (T.roofPlant === 'condenser-screen') {
    add(condenser(plantX));
    add(battenScreen(ctx, {
      x: plantX, y: wallTop + 0.12, z: midZ + 0.05, w: 2.3, h: 0.62, pitch: 0.34,
      facing: 1, material: p.joinery,
    }));
    add(flue(plantX + 2.35, 1.30));
  } else {
    add(condenser(plantX - 0.75));
    add(condenser(plantX + 0.75));
    add(flue(leftX + 5.35, 1.30));
  }

  add(gutterRun(ctx, {
    x: 0, z: backZ - 0.02, w: halfW * 1.4, y: wallTop - 0.30, facing: -1,
    dropAt: -halfW * 0.55, y0: 0.5,
  }));

  /* ── the cantilevered blade awning ───────────────────────────────────────────────── */
  /* ── AND THE ROD HANGERS COME OFF, WHICH IS BOTH THE REFERENCE AND THE SIGN BAND ───────────
   *
   * [SEEN] `_reference-landmarks/mp-shopcorner-modern.png` crop (240,40)-(1360,560) at 1.2x: the
   * modern's blade awning has NO hanger rods — it is a thin cantilever off the wall, and that is
   * half of what separates it from the deco, whose plate shows seven diagonal rods in a row and
   * keeps them.
   *
   * And [SEEN] `l4ts3/shop-corner-modern--three-quarter.png` (15:28) crop (160,340)-(940,620) at
   * 1.9x, shot with the rods still on: `cantileverAwning` fixes its rod plates at `y + 1.15 +
   * 0.12` — 4.57 m, which is the middle of the spandrel band the word now stands on — so three
   * rods and their plates cut straight across MILK BAR. A word crossed by its own awning hardware
   * is not a word. Taking the rods off is the reference reading AND the fix, and it returns 168
   * triangles.
   */
  const awnY = 3.30;
  // V3.71 lane H — the blade's reach and its fascia. A thin fascia reads as a plate of steel;
  // a deep one reads as a boxed hood with a sign face on it, and both are on the street. The
  // reach still takes its clamp from the lot, never from the tenancy: §3.6 binds this member.
  // r2 — the fascia takes `joinery`. The r1 critic's hero shows this blade as the single largest
  // near-white horizontal on the id, running the whole frontage directly over glazing the same
  // round measured at plate 157-190; two of the three biggest surfaces in the lower frame inside
  // one band is §2.9's muddiness test. A dark slim fascia on a pale soffit is also what
  // `_reference-landmarks/mp-shopcorner-modern.png` carries. The DECK stays `trim` — the top of
  // the blade is a lit surface and turning it dark would be a different fault.
  const mAwnKit = {
    tiers: 0, rods: false, fasciaH: T.awningFascia === 'deep' ? 0.46 : 0.24,
    fasciaMaterial: p.joinery,
    // r3 §5.5.10 — the block above declined to make the blade TOP dark and it was right to;
    // this does not. `paving` on this scheme is the pale concrete forecourt at 110 against
    // `trim` at 144, so the blade stays a lit pale slab and stops sharing a band with the
    // coping seven metres above it. A cantilevered blade is concrete.
    deckMaterial: p.paving,
  };
  add(cantileverAwning(ctx, {
    x: (leftX + (rightX - notchW)) / 2, z: frontZ, w: glazeRun + 0.12, y: awnY, proj: T.awningProj,
    maxZ: padHalfD - METRICS.rim - 0.15, name: 'mawn-front', ...mAwnKit,
  }));
  add(yawParts(cantileverAwning(ctx, {
    x: 0, z: 0, w: (notchZ - backZ) - 0.1, y: awnY, proj: T.awningProj - 0.60,
    maxZ: padHalfW - halfW - METRICS.rim - 0.15, name: 'mawn-side', ...mAwnKit,
  }), Math.PI / 2, rightX, (notchZ + backZ) / 2));
  // The blade over the notch, which is what makes the entry read from the far corner.
  add(cantileverAwning(ctx, {
    x: notchX, z: notchZ, w: notchW - 0.06, y: awnY, proj: notchD + 0.55,
    maxZ: padHalfD - METRICS.rim - 0.15, name: 'mawn-notch', ...mAwnKit,
  }));
  /* ══ THE SHOP'S NAME, AS A WORD, FOR THE FIRST TIME IN THIS LANE ═══════════════════════════
   *
   * The photo round priced the relief route and declined on the seat's own verdict, correctly: at
   * a 0.26-0.40 m fascia cap every carrier in the lane is `blank-plate`. §5.3.11 asked whether a
   * two-storey parapet changes that arithmetic. It does — but not where the ask expected, and the
   * re-price is in `mvp/tests/l4ts-signcost.mjs`:
   *
   *   - on the two splay pediments and the deco tower the WIDTH binds, not the height, and the
   *     pediment did not get wider with the storey. Still `blank-plate` at both stations.
   *   - on THIS subject the storey creates a face-brick spandrel 2.09 m tall and 10.2 m clear,
   *     which carries a 1.30 m cap. `reads` at the shipped 190 m station, `marginal` at 319 m.
   *
   * So one word is built, here, and `fitCap` — the seat's own solver — sizes it rather than a
   * number chosen by me. `p.trim` is a bucket this subject already owns (141,145,149 against a
   * face brick of 102,95,86), so the count stays at nine of nine. The blank fascia surround it
   * replaces was 72 triangles; the word is 270.
   */
  //
  // V3.71 lane H — THE WORD IS THE TENANCY'S, and it is the single loudest per-instance
  // difference in this lane: two neighbours read MILK BAR and GROCER rather than reading the
  // same building twice. The run is renamed `msign-spandrel` because `mirror.js` `textRuns()`
  // groups lettering by geometry name and a bare `msign` would be a name that identifies fewer
  // things than the code assumes the moment a second word appears anywhere on this subject —
  // §5.4.2's hazard, in the one place in this lane where it would fail silently and only on
  // left-hand corners. `l4mir-text.mjs` matches on the `-seg` suffix, not on the prefix, so the
  // rename is safe and was checked by reading that instrument rather than by assuming.
  const mSignCap = fitCap(T.trade.word, {
    width: glazeRun - 1.4, height: (brickTop - headY) * 0.62,
  });
  add(reliefLetters({
    text: T.trade.word, x: (leftX + (rightX - notchW)) / 2, y: headY + 0.62, z: frontZ,
    cap: mSignCap, material: p.trim, axis: 'z', facing: 1,
    maxWidth: glazeRun - 1.4, depth: 0.06, name: 'msign-spandrel',
  }));
  add(lamp(ctx, { x: leftX + 1.1, y: awnY + 0.48, z: frontZ + 0.12 }));

  /* ── FACE BRICK, EXPRESSED ───────────────────────────────────────────────────────────
   *
   * The brief for this variant asks for "face brick or fibre-cement panel with expressed
   * joints". Both are on the model and neither is EXPRESSED: `brickCourses` scribes a bed
   * joint, which is a line, and `mpanel` sets a shadow gap, which is also a line. What face
   * brickwork does that a scribe cannot is stand PROUD — a soldier course under the coping and
   * a projecting header band at the glazing head, both of which throw their own shadow across
   * the wall below and are the reason a brick parapet has a horizontal in it at all.
   *
   * Two members an elevation, drawn from `wall` so the band is the same brick it stands in and
   * reads on its shadow rather than on a colour change. `wallAlt` here would make it a stripe.
   */
  for (const [axis, plane, centre, run] of [
    ['x', frontZ, (leftX + (rightX - notchW)) / 2, glazeRun + notchW],
    ['z', rightX, (notchZ + backZ) / 2, notchZ - backZ],
  ]) {
    const soldier = axis === 'x'
      ? [box(run, 0.24, 0.13, centre, wallTop + 0.30, plane + 0.09, 'mbrick-soldier'),
        box(run - 0.30, 0.16, 0.10, centre, headY + 0.24, plane + 0.075, 'mbrick-header')]
      : [box(0.13, 0.24, run, plane + 0.09, wallTop + 0.30, centre, 'mbrick-soldier'),
        box(0.10, 0.16, run - 0.30, plane + 0.075, headY + 0.24, centre, 'mbrick-header')];
    add(soldier.map((g) => part(recessFaces(g, RECESS.soffit, ['ny']), p.wall)));
  }
  // The front downpipe. `gutterRun` drops one at the rear, which is correct and invisible; a
  // corner shop also runs one down the exposed return, and it is the only vertical on that
  // elevation. Head, shaft, shoe — it starts at the gutter line and finishes on the plinth,
  // which is §2's "lands on something" for the one member most likely to fail it.
  // V3.71 lane H — which exposed return carries it. A downpipe is the only vertical on a blank
  // elevation, so moving it moves the one line the eye has to read that wall by. The shoe kicks
  // AWAY from the wall in both hands, which is why the rotation takes the side's sign.
  const mdSide = T.downpipeSide;
  const mdX = mdSide < 0 ? leftX : rightX;
  add([
    part(box(0.18, 0.16, 0.20, mdX + mdSide * 0.10, wallTop + 0.16, frontZ - 0.55, 'mdown-head'), p.joinery),
    part(box(0.13, wallTop + 0.08 - 0.30, 0.13, mdX + mdSide * 0.09, (wallTop + 0.38) / 2,
      frontZ - 0.55, 'mdown-shaft'), p.joinery),
    part(rotBox(0.13, 0.30, 0.13, mdX + mdSide * 0.02, 0.24, frontZ - 0.55,
      { z: -mdSide * 0.42 }, 'mdown-shoe'), p.joinery),
  ]);

  /* ── grunge ──────────────────────────────────────────────────────────────────────── */

  add(brickCourses(ctx, {
    axis: 'z', face: -1, plane: leftX, centre: midZ, run: shopD, y0: 0.4, y1: headY, pitch: 0.34,
  }));
  add(brickCourses(ctx, {
    axis: 'x', face: 1, plane: frontZ, centre: (leftX + (rightX - notchW)) / 2, run: glazeRun,
    y0: 0.05, y1: sillY + 0.02, openings: [], pitch: 0.22,
  }));
  add(brickCourses(ctx, {
    axis: 'z', face: 1, plane: rightX, centre: (notchZ + backZ) / 2, run: notchZ - backZ,
    y0: 0.4, y1: headY, pitch: 0.34,
  }));
  add(brickCourses(ctx, {
    axis: 'x', face: -1, plane: backZ, centre: 0, run: halfW * 1.6, y0: 0.4, y1: headY, pitch: 0.40,
  }));
  add(streaks(ctx, {
    plane: frontZ, facing: 1, axis: 'x', xs: [leftX + 1.9, leftX + 5.0], yTop: wallTop + 0.42,
    length: 1.3,
  }));
  add(tideCourse(ctx, {
    axis: 'z', plane: leftX, centre: midZ, run: shopD, y: 0.34, facing: -1, h: 0.26,
  }));

  /* ══ THE REAR IS A YARD, NOT A WING ═══════════════════════════════════════════════════════
   *
   * [SEEN] `_reference-landmarks/mp-shopcorner-modern.png` at 1024 x 683: behind the two-storey
   * mass the plate has a paling fence, a rotary clothes hoist, a wheelie bin and paving — and a
   * LOW rendered rear section that is a boundary wall rather than a building. The skillion wing
   * is deleted: three walls, a room box, a plinth, four sashes, a skillion roof with its seams,
   * fascias and gutter, a deck, a door and its hood, and that elevation's streaks. The shop takes
   * 2.50 m of the depth it vacated.
   */
  add(streaks(ctx, {
    plane: backZ, facing: -1, axis: 'x', xs: [leftX + 2.1, halfW - 2.6], yTop: wallTop - 0.40,
    length: 2.0,
  }));

  /* ── the yard and forecourt ──────────────────────────────────────────────────────── */
  const yardZ = (backZ - 0.55 + (-padHalfD + METRICS.rim)) / 2;
  add(paverField(ctx, { x: -0.6, z: yardZ, w: halfW * 1.05, d: 2.1, unit: 1.40, bed: false }));
  add(binStore(ctx, { x: leftX + 1.4, z: yardZ, w: 2.1, d: 1.2, h: 1.45 }));
  // The rotary hoist the plate puts in this yard, which no other variant carries in the open.
  add(clothesline(ctx, { x: rightX - 2.3, z: yardZ + 0.35, h: 1.90, arm: 1.25 }));
  add(bikeRack(ctx, { x: leftX + 1.6, z: frontZ + 1.85, hoops: 2 }));
  // ── THE FOOTPATH IN FRONT OF A CORNER SHOP IS NOT EMPTY ────────────────────────────────
  //
  // Every photograph of a working suburban shop has produce standing on the footpath under the
  // awning, and it is the one object on the lot that says the building is OPEN. Three crate
  // stacks: a body, a proud rim and the goods heaped above it, at two heights so the run does
  // not read as one extruded profile. Then the entry mat and two bollards, which are what stop
  // a 2.1 m notch reading as a hole cut in the corner.
  //
  // ── AND THEY ARE BILLED TO THE BUILDING, WHICH IS THE HONEST ACCOUNT ─────────────────────
  //
  // These are site furniture and they belong on the lot. `v370-l4-commercial-probe.mjs`'s
  // `LOT_PREFIX` has no entry that matches `crate`, `mat` or `bollard`, so all seven members
  // fall to the BUILDING account. The first draft of this block reached the lot account by
  // naming a produce crate `bin` and a bollard `fence-post` — which is dressing a classifier,
  // not classifying, and it is exactly the move §5.3.4 exists to catch. The names are what the
  // objects are; the 176 triangles are billed to the building; the building has 4,196 spare and
  // does not need the relief. Another seat's classifier is NOT edited to move them.
  for (let i = 0; i < 3; i += 1) {
    const cx3 = leftX + 2.7 + i * 1.35;
    const ch = 0.52 + (i % 2) * 0.16;
    add([
      part(slab(1.02, ch, 0.72, cx3, 0.10, frontZ + 1.05, 'mcrate'), p.joinery),
      part(slab(1.10, 0.07, 0.80, cx3, 0.10 + ch, frontZ + 1.05, 'mcrate-rim'), p.trim),
      part(slab(0.86, 0.20, 0.58, cx3, 0.17 + ch, frontZ + 1.05, 'mcrate-goods'), p.garden),
    ]);
  }
  add([
    part(slab(1.50, 0.04, 0.86, notchX - 0.30, 0.10, notchZ + 0.44, 'mentry-mat'), p.joinery),
    part(cyl(0.09, 0.86, notchX + notchW / 2 - 0.22, 0.53, frontZ + 0.42, 'y', 'mbollard', 8), p.trim),
    part(cyl(0.09, 0.86, notchX - notchW / 2 + 0.22, 0.53, frontZ + 0.42, 'y', 'mbollard', 8), p.trim),
    part(box(0.22, 0.07, 0.22, notchX + notchW / 2 - 0.22, 0.93, frontZ + 0.42, 'mbollard-cap'), p.joinery),
    part(box(0.22, 0.07, 0.22, notchX - notchW / 2 + 0.22, 0.93, frontZ + 0.42, 'mbollard-cap'), p.joinery),
  ]);


  add(plantedBed(ctx, {
    x: rightX - 1.5, z: -padHalfD + METRICS.rim + 1.25, w: 2.4, d: 1.45, plants: 2, salt: S_MOD,
  }));
  add(plantedBed(ctx, {
    x: leftX + 2.2, z: -padHalfD + METRICS.rim + 1.25, w: 3.2, d: 1.45, plants: 3, salt: S_MOD + 20,
  }));
  add(canopyTree(ctx, {
    x: 0.6, z: -padHalfD + METRICS.rim + 2.9, h: 3.4, canopy: 0.94, habit: 'open',
  }));
  // ── §2.6, r2: a street tree at the frontage on this id too ────────────────────────────────
  //
  // The r1 critic's addendum credits this subject with the placement the other three lack —
  // "three green planter boxes at the shopfront and a shrub in a raised bed at the right return"
  // — and it is right that this id roughly passes where the others fail. It still has no street
  // tree, and the clause names one ("Trees have a leaf-cluster canopy, not a lollipop"), so the
  // family now reads consistently rather than one id being the exception. `open` habit, whose
  // widest lobe reaches 0.60 + 0.36 * 1.12 = 1.00 of canopy: at 0.80 that is 0.80 from the trunk,
  // holding |x| <= 7.19 and |z| <= 6.60 inside a 7.5 rim.
  // r5 §2.6 — canopy 0.74 -> 1.04, height 4.65 -> 5.10. Zero triangles; containment invariant.
  const mTreeReach = 1.00 * 1.04;
  add(canopyTree(ctx, {
    x: -(padHalfW - METRICS.rim - mTreeReach - 0.05),
    z: padHalfD - METRICS.rim - mTreeReach - 0.05,
    h: 5.10, canopy: 1.04, habit: 'openBroken', pit: true,
  }));
  // The hedge takes the strip to the RIGHT of the yard paving; the boundary planting on this
  // variant is deliberately asymmetric, which is also the contemporary lot posture.
  add(hedgeRun(ctx, {
    x0: 2.2, z0: -padHalfD + METRICS.rim + 0.40,
    x1: padHalfW - METRICS.rim - 1.6, z1: -padHalfD + METRICS.rim + 0.40, h: 0.70,
  }));
  add(picketFence(ctx, {
    z: padHalfW - METRICS.rim - 1.35, x0: -padHalfD + METRICS.rim + 0.3, x1: backZ - 0.15,
    h: 1.62, gapX: backZ - 1.40, gapW: 1.35, pitch: 0.30, axis: 'z',
  }));
  add(lawnTufts(ctx, {
    count: 12, salt: S_MOD + 60,
    avoid: [
      { x: 0, z: midZ, w: halfW * 2 + 2.6, d: shopD + 4.4 },
      { x: padHalfW - 1.4, z: 0, w: 3.4, d: env.lotD },
      { x: -0.6, z: yardZ, w: halfW * 1.05 + 1.0, d: 3.0 },
    ],
  }));
}

/**
 * Wave G — one existing fascia seat, two identities. The medical word is authored content;
 * venture text is supplied by board state and this builder never invents a brand.
 */
export function applyShopIdentitySign(ctx, { kind, text }) {
  const { env, p } = ctx;
  const medical = kind === 'medical';
  const label = String(text ?? '').trim();
  if (!label) return 0;
  const width = Math.max(5.4, Math.min(env.bodyW - 1.1, env.bodyW * 0.78));
  const height = medical ? 1.04 : 0.94;
  const y = 3.56;
  const z = env.frontZ + 0.19;
  const crossRun = medical ? 1.45 : 0;
  const wordWidth = width - crossRun - 0.72;
  const wordX = medical ? crossRun * 0.34 : 0;
  const cap = fitCap(label, { width: wordWidth, height: height * 0.58 });
  const prefix = medical ? 'medical' : 'ai';
  const backer = medical ? p.trim : p.joinery;
  const ink = medical ? p.wallAlt : p.trim;
  ctx.add(part(box(width, height, 0.18, 0, y, z, `${prefix}-sign-fascia`), backer));
  if (medical) {
    const crossX = -width / 2 + 0.68;
    ctx.add([
      part(box(0.24, 0.68, 0.10, crossX, y, z + 0.14, 'medical-cross-vertical'), p.wallAlt),
      part(box(0.68, 0.24, 0.10, crossX, y, z + 0.14, 'medical-cross-horizontal'), p.wallAlt),
    ]);
  }
  ctx.add(reliefLetters({
    text: label,
    x: wordX,
    y: y - cap * 0.05,
    z: z + 0.10,
    cap,
    material: ink,
    axis: 'z',
    facing: 1,
    maxWidth: wordWidth,
    depth: 0.05,
    name: `${prefix}-sign-letters`,
  }));
  return 1;
}

/** Wave G — ground-up, single-storey pavilion with a fenced soft-fall play yard. */
export function buildChildcareCentre(ctx) {
  const { env, p } = ctx;
  const add = (produced) => ctx.add(produced);
  const pavilionW = env.bodyW * 0.82;
  const pavilionD = 4.75;
  const pavilionZ = -2.25;
  const pavilionFront = pavilionZ + pavilionD / 2;
  const yardZ = 2.72;
  const fenceW = Math.min(env.lotW - METRICS.rim * 2 - 0.50, pavilionW + 1.10);
  const fenceFrontZ = env.lotD / 2 - METRICS.rim - 1.42;

  add(boardPlinth(ctx, { lawn: true }));
  add(kerbAndFootpath(ctx, { walkD: 1.22 }));
  add([
    part(slab(pavilionW, 3.35, pavilionD, 0, 0, pavilionZ, 'childcare-pavilion'), p.wall),
    part(slab(pavilionW + 0.58, 0.30, pavilionD + 0.58, 0, 3.35, pavilionZ,
      'childcare-pavilion-roof'), p.roof),
    part(slab(pavilionW * 0.56, 0.82, 0.20, -pavilionW * 0.08, 2.42,
      pavilionFront + 0.10, 'childcare-sign-fascia'), p.wallAlt),
    part(slab(pavilionW * 0.16, 2.18, 0.16, pavilionW * 0.34, 0.18,
      pavilionFront + 0.11, 'childcare-entry-door'), p.joinery),
    part(slab(fenceW - 0.66, 0.12, 3.64, 0, 0.03, yardZ,
      'childcare-softfall-pad'), p.wallAlt),
  ]);
  for (const x of [-pavilionW * 0.31, -pavilionW * 0.03, pavilionW * 0.24]) {
    add(part(slab(pavilionW * 0.20, 1.56, 0.10, x, 0.64, pavilionFront + 0.11,
      'childcare-window'), p.glass));
  }
  const signCap = fitCap('CHILDCARE', { width: pavilionW * 0.48, height: 0.48 });
  add(reliefLetters({
    text: 'CHILDCARE', x: -pavilionW * 0.08, y: 2.82, z: pavilionFront + 0.23,
    cap: signCap, material: p.trim, axis: 'z', facing: 1,
    maxWidth: pavilionW * 0.48, depth: 0.05, name: 'childcare-sign-letters',
  }));

  const fenceBackZ = pavilionFront + 0.42;
  const postPitch = 0.72;
  const frontPosts = Math.max(8, Math.round(fenceW / postPitch));
  for (let i = 0; i <= frontPosts; i += 1) {
    const x = -fenceW / 2 + (i / frontPosts) * fenceW;
    add(part(slab(0.10, 1.28, 0.10, x, 0.08, fenceFrontZ,
      'childcare-fence-post'), p.joinery));
  }
  const sidePosts = 6;
  for (const x of [-fenceW / 2, fenceW / 2]) {
    for (let i = 1; i < sidePosts; i += 1) {
      const z = fenceBackZ + (i / sidePosts) * (fenceFrontZ - fenceBackZ);
      add(part(slab(0.10, 1.28, 0.10, x, 0.08, z, 'childcare-fence-post'), p.joinery));
    }
    add([
      part(slab(0.10, 0.10, fenceFrontZ - fenceBackZ, x, 0.40,
        (fenceFrontZ + fenceBackZ) / 2, 'childcare-fence-rail'), p.trim),
      part(slab(0.10, 0.10, fenceFrontZ - fenceBackZ, x, 1.02,
        (fenceFrontZ + fenceBackZ) / 2, 'childcare-fence-rail'), p.trim),
    ]);
  }
  add([
    part(slab(fenceW, 0.10, 0.10, 0, 0.40, fenceFrontZ, 'childcare-fence-rail'), p.trim),
    part(slab(fenceW, 0.10, 0.10, 0, 1.02, fenceFrontZ, 'childcare-fence-rail'), p.trim),
    part(slab(1.18, 0.62, 1.18, -2.35, 0.16, yardZ, 'childcare-play-block-blue'), p.wallAlt),
    part(slab(1.06, 0.88, 1.06, -0.22, 0.16, yardZ + 0.28, 'childcare-play-block-yellow'), p.trim),
    part(cyl(0.62, 0.82, 2.10, 0.57, yardZ - 0.18, 'y', 'childcare-play-drum', 10), p.garden),
    part(slab(3.20, 0.18, 2.35, 2.15, 2.30, yardZ + 0.20, 'childcare-shade-canopy'), p.trim),
  ]);
  for (const x of [0.78, 3.52]) {
    for (const z of [yardZ - 0.72, yardZ + 1.12]) {
      add(part(slab(0.10, 2.30, 0.10, x, 0.08, z, 'childcare-shade-post'), p.joinery));
    }
  }
}

/** Wave G — the corner-shop shell keeps its mass and takes the medical fascia identity. */
export function buildMedicalCentre(ctx) {
  buildShopCornerModern(ctx);
  applyShopIdentitySign(ctx, ctx.signText
    ? { kind: 'venture', text: ctx.signText }
    : { kind: 'medical', text: 'MEDICAL CENTRE' });
}

/**
 * Wave N3 — a board-readable fuel miniature.
 *
 * The dimensions below are deliberately grouped by system: canopy, two identical service bays,
 * kiosk and pylon. A critic can move one read without unpicking magic coordinates from the other
 * three, and every material comes from the petrol station's existing nine-bucket palette.
 */
export const PETROL_STATION_GEOMETRY = Object.freeze({
  rearZ: -3.72,
  canopyZ: 1.02,
  canopyMaxW: 9.9,
  canopyD: 5.4,
  canopyY: 4.06,
  canopyDeckH: 0.45,
  canopyFasciaH: 1.20,
  canopyFasciaRuleH: 0.12,
  canopyPostWidth: 0.28,
  serviceBayXs: Object.freeze([-2.08, 2.08]),
  bowserOffsetZ: 0.62,
  islandW: 1.85,
  islandLength: 4.20,
  bowserW: 0.92,
  bowserH: 1.65,
  bowserD: 0.72,
  bowserCapH: 0.24,
  hoseSection: 0.16,
  hoseUprightH: 1.10,
  kioskW: 7.55,
  kioskD: 3.35,
  kioskX: 0.58,
  kioskH: 4.05,
  kioskFasciaH: 1.00,
  pylonStreetInsetX: 1.38,
  pylonStreetInsetZ: 1.80,
  priceBladeW: 0.90,
  priceBladeH: 6.40,
  priceBladeD: 0.32,
  pricePlateW: 1.35,
  pricePlateH: 0.85,
  priceCapW: 1.15,
  priceCapH: 0.85,
  laneMarkW: 0.20,
  laneMarkLength: 5.0,
});

export function buildPetrolStation(ctx) {
  const { env, p } = ctx;
  const add = (produced) => ctx.add(produced);
  const spec = PETROL_STATION_GEOMETRY;
  const rearZ = spec.rearZ;
  const canopyZ = spec.canopyZ;
  const canopyW = Math.min(env.lotW - 2.0, spec.canopyMaxW);
  const canopyD = spec.canopyD;
  const canopyY = spec.canopyY;
  const bayXs = spec.serviceBayXs;
  const bowserZs = [canopyZ - spec.bowserOffsetZ, canopyZ + spec.bowserOffsetZ];
  const forecourtW = env.lotW - METRICS.rim * 2;
  const forecourtD = env.lotD - METRICS.rim * 2;

  add(boardPlinth(ctx, { lawn: false }));
  // One calm grey poured slab in the paving bucket sits 20 mm below the tiled public path.
  // Its value is deliberately separate from the beige kiosk and gold canopy deck.
  add(part(slab(forecourtW, 0.08, forecourtD, 0, -0.02, 0,
    'petrol-forecourt-slab'), p.paving));
  add(cornerFootpaths(ctx, { unit: 1.0, walkD: 1.15, sideWalk: 1.15 }));

  const kioskW = spec.kioskW;
  const kioskD = spec.kioskD;
  const kioskX = spec.kioskX;
  const kioskFrontZ = rearZ + kioskD / 2;
  const kioskRightX = kioskX + kioskW / 2;
  const kioskRoofY = 0.08 + spec.kioskH;
  const kioskFasciaY = kioskRoofY - spec.kioskFasciaH;
  const kioskGlassX = -0.12;
  const kioskGlassW = 4.7;
  const kioskGlassH = 1.78;
  const canopyFasciaY = canopyY + spec.canopyDeckH - spec.canopyFasciaH;
  const canopyRuleY = canopyFasciaY + 0.16;
  add([
    part(slab(kioskW, spec.kioskH, kioskD, kioskX, 0.08, rearZ,
      'petrol-kiosk'), p.wall),
    part(slab(kioskW + 0.38, 0.18, kioskD + 0.32, kioskX, kioskRoofY, rearZ,
      'petrol-kiosk-roof'), p.roof),
    // A dark room plate makes the glazing read as an opening rather than blue paint.
    part(slab(kioskGlassW + 0.14, kioskGlassH + 0.12, 0.08, kioskGlassX, 0.70,
      kioskFrontZ + 0.01, 'petrol-kiosk-window-reveal'), p.shadow),
    part(slab(kioskGlassW, kioskGlassH, 0.06, kioskGlassX, 0.76,
      kioskFrontZ + 0.08, 'petrol-kiosk-glass'), p.glass),
    part(slab(1.04, 2.2, 0.10, 3.08, 0.20,
      kioskFrontZ + 0.10, 'petrol-kiosk-door'), p.joinery),
    // One-metre brand fascia wraps the canopy-facing front and the corner's street-facing return.
    part(slab(kioskW, spec.kioskFasciaH, 0.18, kioskX, kioskFasciaY,
      kioskFrontZ + 0.12, 'petrol-kiosk-signboard'), p.wallAlt),
    part(slab(0.18, spec.kioskFasciaH, kioskD, kioskRightX + 0.12, kioskFasciaY,
      rearZ, 'petrol-kiosk-street-fascia'), p.wallAlt),
    part(slab(kioskW - 0.42, 0.09, 0.08, kioskX, kioskFasciaY + 0.72,
      kioskFrontZ + 0.23, 'petrol-kiosk-sign-rule'), p.trim),
    // A gold structural deck inside a deep four-sided red fascia: deliberately toy-chunky.
    part(slab(canopyW, spec.canopyDeckH, canopyD, 0, canopyY, canopyZ,
      'petrol-canopy-roof'), p.trim),
    part(slab(canopyW + 0.08, spec.canopyFasciaH, 0.16, 0, canopyFasciaY,
      canopyZ + canopyD / 2, 'petrol-canopy-fascia-front'), p.wallAlt),
    part(slab(canopyW + 0.08, spec.canopyFasciaH, 0.16, 0, canopyFasciaY,
      canopyZ - canopyD / 2, 'petrol-canopy-fascia-back'), p.wallAlt),
    part(slab(0.16, spec.canopyFasciaH, canopyD - 0.16, -canopyW / 2,
      canopyFasciaY,
      canopyZ, 'petrol-canopy-fascia-left'), p.wallAlt),
    part(slab(0.16, spec.canopyFasciaH, canopyD - 0.16, canopyW / 2,
      canopyFasciaY,
      canopyZ, 'petrol-canopy-fascia-right'), p.wallAlt),
    // The 120 mm gold rule sits proud of every fascia face, including both returns.
    part(slab(canopyW + 0.10, spec.canopyFasciaRuleH, 0.04, 0, canopyRuleY,
      canopyZ + canopyD / 2 + 0.10, 'petrol-canopy-rule-front'), p.trim),
    part(slab(canopyW + 0.10, spec.canopyFasciaRuleH, 0.04, 0, canopyRuleY,
      canopyZ - canopyD / 2 - 0.10, 'petrol-canopy-rule-back'), p.trim),
    part(slab(0.04, spec.canopyFasciaRuleH, canopyD - 0.16,
      -canopyW / 2 - 0.10, canopyRuleY, canopyZ, 'petrol-canopy-rule-left'), p.trim),
    part(slab(0.04, spec.canopyFasciaRuleH, canopyD - 0.16,
      canopyW / 2 + 0.10, canopyRuleY, canopyZ, 'petrol-canopy-rule-right'), p.trim),
  ]);

  // Four evenly spaced aluminium mullions turn the kiosk pane into a shopfront rhythm.
  for (const fraction of [-0.3, -0.1, 0.1, 0.3]) {
    add(part(slab(0.10, kioskGlassH + 0.08, 0.09,
      kioskGlassX + kioskGlassW * fraction, 0.73, kioskFrontZ + 0.14,
      'petrol-kiosk-mullion'), p.joinery));
  }
  add([
    part(slab(kioskGlassW + 0.12, 0.11, 0.10, kioskGlassX, 0.71,
      kioskFrontZ + 0.14, 'petrol-kiosk-window-sill'), p.joinery),
    part(slab(kioskGlassW + 0.12, 0.11, 0.10, kioskGlassX, 2.52,
      kioskFrontZ + 0.14, 'petrol-kiosk-window-head'), p.joinery),
  ]);

  // Two five-metre lane bars stop the broad forecourt reading as an empty grey card.
  for (const x of [-0.58, 0.58]) {
    add(part(slab(spec.laneMarkW, 0.025, spec.laneMarkLength, x, 0.065, canopyZ,
      'petrol-lane-mark'), p.trim));
  }

  // Each island is one service bay. Two chunky red columns stand at its ends, under an overhanging
  // canopy; the bowsers sit between them rather than being mistaken for canopy supports.
  for (const x of bayXs) {
    add([
      part(slab(spec.islandW, 0.18, spec.islandLength, x, 0.07, canopyZ,
        'petrol-bowser-island'), p.paving),
      part(slab(1.02, 0.07, 2.98, x, 0.25, canopyZ,
        'petrol-bowser-island-inset'), p.trim),
    ]);
    const postOffsetZ = spec.islandLength / 2 - 0.33;
    for (const z of [canopyZ - postOffsetZ, canopyZ + postOffsetZ]) {
      add(part(slab(spec.canopyPostWidth, canopyY - 0.30, spec.canopyPostWidth,
        x, 0.30, z, 'petrol-canopy-post'), p.wallAlt));
    }
    for (const z of bowserZs) {
      const bowserBaseY = 0.32;
      const bowserCapY = bowserBaseY + spec.bowserH;
      const hoseBaseY = 0.78;
      const hoseUprightX = x + spec.bowserW / 2 + 0.09;
      add([
        part(slab(spec.bowserW, spec.bowserH, spec.bowserD, x, bowserBaseY, z,
          'petrol-bowser-body'), p.joinery),
        part(slab(0.42, 0.30, 0.07, x, bowserBaseY + spec.bowserH * 0.60,
          z + spec.bowserD / 2 + 0.03,
          'petrol-bowser-screen'), p.joinery),
        part(slab(0.72, spec.bowserCapH, 0.58, x, bowserCapY, z,
          'petrol-bowser-cap'), p.trim),
        part(slab(0.44, 0.12, 0.12, x, bowserCapY + spec.bowserCapH, z + 0.18,
          'petrol-bowser-top-light'), p.wall),
        // A 160 mm section and 1.10 m upright make the hose glyph survive board distance.
        part(slab(spec.hoseSection, spec.hoseUprightH, spec.hoseSection,
          hoseUprightX, hoseBaseY, z,
          'petrol-bowser-hose-upright'), p.joinery),
        part(slab(0.30, spec.hoseSection, spec.hoseSection,
          hoseUprightX - 0.15, hoseBaseY + spec.hoseUprightH - spec.hoseSection, z,
          'petrol-bowser-hose-arm'), p.joinery),
      ]);
    }
  }

  // Street-corner price totem: one broad red blade, two two-sided prices and an overscale cap.
  const pylonX = -env.lotW / 2 + spec.pylonStreetInsetX;
  const pylonZ = env.lotD / 2 - spec.pylonStreetInsetZ;
  const pylonBaseY = 0.20;
  add([
    part(slab(0.92, 0.18, 0.72, pylonX, 0.06, pylonZ,
      'petrol-price-board-foot'), p.paving),
    part(slab(spec.priceBladeW, spec.priceBladeH, spec.priceBladeD,
      pylonX, pylonBaseY, pylonZ, 'petrol-price-board-blade'), p.wallAlt),
    part(slab(spec.priceCapW, spec.priceCapH, 0.34, pylonX,
      pylonBaseY + spec.priceBladeH - spec.priceCapH, pylonZ,
      'petrol-price-board-cap'), p.wallAlt),
  ]);
  for (let row = 0; row < 2; row += 1) {
    const plateY = 2.52 + row * 1.02;
    for (const face of [-1, 1]) {
      const plateZ = pylonZ + face * (spec.priceBladeD / 2 + 0.06);
      const digitZ = pylonZ + face * (spec.priceBladeD / 2 + 0.16);
      add([
        part(slab(spec.pricePlateW, spec.pricePlateH, 0.12, pylonX, plateY,
          plateZ, `petrol-price-plate-${row + 1}`), p.wall),
        part(slab(0.52, 0.16, 0.08, pylonX + 0.12, plateY + 0.52,
          digitZ, 'petrol-price-digit'), p.trim),
      ]);
    }
  }
}

export const SHOP_VARIANT_BUILDERS = Object.freeze({
  'shop-corner-victorian': buildShopCornerVictorian,
  'shop-corner-deco': buildShopCornerDeco,
  'shop-corner-modern': buildShopCornerModern,
  'medical-centre': buildMedicalCentre,
  'petrol-station': buildPetrolStation,
});
