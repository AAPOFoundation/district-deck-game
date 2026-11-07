// Toy Port of Melbourne hulls. Local X = along-edge (bow +X), Z = seaward, Y = up.
// Bottoms sit ~-0.34, a shade under WATER_Y. No Math.random.

import * as THREE from 'three';
import {
  addBox, addCyl, addSphere, noPick, WATER_Y, addToyLetters, disposeGroup,
} from './kit.js';
import { createCityFringeMaterial } from '../materials.js';
function std(color, extra) { return createCityFringeMaterial(color, extra, 'fringe/ships.js'); }
import { SHORE } from '../shore.js';
import {
  CONTAINER_BOX,
  stampedBoxGeometry,
  stampedContainerMaterials,
  stampedYardGeometry,
  stampGoodForIndex,
  stampVariantForIndex,
} from '../port/container-stamps.js';

/**
 * ── THE WHARF'S SHARED GEOMETRY, AND WHY IT LIVES HERE (board-AAA E4). ──
 *
 * `outer-ocean.js` needs two numbers from the port: where the rendered wharf
 * stands, and how high its deck is. It carried private copies — `PAINTED
 * .apronTop` mirroring `SHORE.sandY + 0.38` with a comment saying it "matches
 * fringe/port.js DECK_Y without importing that held file", and a shelter sized
 * by hand against a 38.5 m quay written into prose. Two modules holding private
 * copies of one number is how `station.js` spent a round painting shadows 52
 * degrees away from the key.
 *
 * They are defined in THIS file, not in `port.js`, and the reason is a real
 * hazard rather than taste. `port.js` imports `harbourCalmAt` / `harbourPeakYAt`
 * from `outer-ocean.js`, so if `outer-ocean.js` imported these back out of
 * `port.js` the two would form a cycle — and `PAINTED` is a module-scope
 * `const`, so whichever module evaluated second would read the other's exports
 * in the temporal dead zone and throw at import time, not at render time.
 * `ships.js` imports only `three`, `./kit.js` and `../shore.js`, none of which
 * reach `outer-ocean.js`, so it is a safe leaf for both.
 *
 * **Import these from `fringe/ships.js`.** `port.js` re-exports the same
 * bindings for callers that already reach for it, but that path is the cycle.
 *
 * `QUAY_SEAWARD + COPE_Z` = 38.5 m is the cope line, seaward of the board rim.
 * `DECK_Y` is the authored apron datum; the rendered slab top is 12 mm higher
 * at 0.452, because an `addSlab` box spans `[y + h/2 - 2c, y + 3h/2 - 2c]`
 * (see the origin note below). Clearance arguments should use 0.44 and know
 * they have 12 mm in hand, not the other way round.
 */
export const QUAY_SEAWARD = 32;
/** Quay face: cope edge at +Z in the port's group frame, water beyond it. */
export const COPE_Z = 6.5;
export const APRON_TOP = SHORE.sandY + 0.28;
export const DECK_Y = APRON_TOP + 0.10;

/* ─────────────────── the water's render-order band ─────────────────── */

/**
 * ── EVERY DECAL ON THE HARBOUR DRAWS ABOVE THE SEA, AND HERE IS WHY. ──
 *
 * `nature:water:ocean` (outer-ocean.js) is a TRANSPARENT `ShaderMaterial` at
 * `renderOrder` 5 that WRITES depth, and `nature:water:beach-foam` is a second
 * transparent plate at 6. three.js sorts the transparent list by `renderOrder`
 * BEFORE depth, so anything on the water below 7 is drawn first and then
 * painted over by the sea itself. A10 found this from one decal and lifted that
 * decal; the census (`shots-A11-wip/order-census.mjs`) then read the rest of the
 * venue: **546 of the 556 transparent meshes under `fringe:port-harbour` sat at
 * renderOrder ≤ 6** — every wet collar, every foam strip, every wake, every
 * reflection and every vessel shadow in the port. Drawn, measured, never seen.
 *
 * So the venue does not hand out render orders by hand any more. `waterOrder`
 * is the one ladder, it starts above both water meshes, and a decal states
 * WHICH LAYER it is rather than which integer:
 *
 *   0  chop        the basin's own crest and trough streaks
 *   1  shade       cast shadows, lees, the contact under a hull  (multiply)
 *   2  wet         displacement halo, wetted band, reflection
 *   3  collar      the wetted-collar shade rings                 (multiply)
 *   4  ribbon      collar ribbons, seams, pierce rings
 *   5  foam        foam strips, wakes, bow waves
 *   6  crest       the densest froth caps, on top of everything
 *
 * The ladder is what layers the water now. Before this pass the layering was
 * carried by 73 mm of Y separation (`HARBOUR_Y + 0.012` … `+ 0.085`), which put
 * the top of the stack nine centimetres above a sea whose sheltered crest is at
 * 0.163 — see `decalY` in port.js. Every one of these materials has
 * `depthWrite: false`, so nothing in the band tests against anything else in it
 * and the Y separation was never doing the work the order does.
 */
export const SEA_ORDER = 5;
export const SEA_FOAM_ORDER = 6;
/** First order that clears both water meshes. */
export const WATER_ORDER_BASE = SEA_FOAM_ORDER + 1;
export const WATER_LAYERS = 7;
/** `layer` 0…6 → an absolute render order above the sea. */
export function waterOrder(layer = 0) {
  const l = Math.max(0, Math.min(WATER_LAYERS - 1, Math.round(Number(layer) || 0)));
  return WATER_ORDER_BASE + l;
}

const HALF_PI = Math.PI / 2;
const BOTTOM = -0.34;

function toyLetterWidth(text, s, gap) {
  let w = 0;
  const chars = String(text).toUpperCase();
  for (let i = 0; i < chars.length; i += 1) {
    w += chars[i] === ' ' ? 0.42 * s : 0.78 * s + gap;
  }
  return w;
}

/**
 * ── P16-PM7 item 2 — ONE NUMBER FOR THE ARM AND THE FLANGE IT LANDS ON. ──
 * The jetty's two loading-arm pedestals and the tanker's manifold risers have to
 * be the same distance apart or the arms come down on bare deck, which is what
 * the audit reads as "a plain white cube with no manifold beneath it". The
 * spacing lives here because the risers are built here; `port.js` derives
 * `ARM_PEDESTAL_X` from it.
 */
export const TANKER_ARM_SPACING = 6.0;

export const SHIP_LENGTH = Object.freeze({
  container: 42,
  tanker: 46,
  cruise: 40,
  'spirit-of-tasmania': 34,
  'warship-a': 32,
  'warship-b': 26,
});

/**
 * Container-ship stow grid. Lane C animates against every cell.
 *
 * ── P16-PM4 item 2 — THE BAYS ARE RE-SLOTTED, NOT RE-TYPED. ──
 * Seven bays and five rows were numbers, and they fitted a 42 m hull only
 * because the module was 2.86 m long. What the SHIP fixes is the run of deck
 * between the fo'c'sle break and the house (19.9 m) and the width across the
 * hatch coamings (7.5 m); how many boxes go in them is the module's business.
 * At the P16-PM4 module that is five bays of four rows instead of seven of
 * five — fewer, larger boxes on the same deck, which is the item's own rule.
 */
/*
 * taste-r1 W8-E — THE BOX IS 0.95 SCALE (5.76 x 2.46 x 2.32 m), SO THE STOW IS RE-SPACED, NOT SHRUNK.
 *
 * Three bays of three rows and three tiers: the stack tops out 10.2 m over the water, which is the bible's 1:4 container
 * ship (10 m to the top of the stack). The bays are NOT packed face to face. Two fixed things set the pitch:
 *   - the hold gantry stands at the berthed hull's local x = 0 and its spreader only moves in z and up/down, so the bay it
 *     serves has to be centred on x = 0 (`holdBay`, the middle one), or a lowered box is carried 4 m sideways at release;
 *   - the deck crane pedestals (1.7 m footings) stand between the house front (x = -11.9) and the first bay, so the outer
 *     bays' near faces stop 2 m inside it.
 * That leaves 1.4 m between faces. The bridge between two bays is a 0.52 m walkway, and the ship's own sway
 * (`sway` 0.4 m in `updatePort`) moves a box lowered at x = 0 sideways on the hull, so 0.69 m a side is the least
 * that keeps the walkway out of the lowered box's path.
 */
const STOW_BAY_GAP_M = 1.4;
const STOW_PITCH_X = CONTAINER_BOX.w + STOW_BAY_GAP_M;
const STOW_PITCH_Z = CONTAINER_BOX.d + 0.06;
const STOW_RUN_M = 19.9;
const STOW_WIDTH_M = 7.5;
// An odd number of bays, so one of them is the hold bay at the middle of the run.
const STOW_BAYS = Math.max(3, 2 * Math.floor(STOW_RUN_M / STOW_PITCH_X / 2) + 1);
const STOW_HOLD_BAY = (STOW_BAYS - 1) / 2;
export const CONTAINER_DECK_STOW = Object.freeze({
  bays: STOW_BAYS,
  rows: Math.max(3, Math.round(STOW_WIDTH_M / STOW_PITCH_Z)),
  tiers: 3,
  pitchX: STOW_PITCH_X,
  pitchZ: STOW_PITCH_Z,
  holdBay: STOW_HOLD_BAY,
  // x of the first bay's centre; the hold bay (index `holdBay`) is at x = 0, under the hold gantry.
  cargoX0: -STOW_HOLD_BAY * STOW_PITCH_X,
});

/**
 * taste-r1 W8-E: the lane the ambient deck hand walks, seaward of the stow. 3.9 m is outboard of the outer row (3.57 m
 * from the centreline) and inside the shell (half-breadth 4.6 m along the parallel body, which ends near x = 8); the
 * run covers the three bays. It used to cross the forward bays' boxes and run on over the bow (x 8.2 to 17.4 at z 2.9).
 */
export const CONTAINER_DECK_WALK = Object.freeze({
  z: 3.9,
  x0: CONTAINER_DECK_STOW.cargoX0 - 1.5,
  x1: CONTAINER_DECK_STOW.cargoX0 + (CONTAINER_DECK_STOW.bays - 1) * CONTAINER_DECK_STOW.pitchX + 1.5,
});

export function seedUnit(seed, key) {
  let h = (seed >>> 0) ^ 0x811c9dc5;
  const s = String(key);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

/* ───────────────────────── procedural surface kit ─────────────────────────
 * Monopoly Plus tell 7: "a single flat lambert colour across a whole surface"
 * is the loudest untextured-viewport signal. Everything below is drawn into a
 * 2-D canvas at load, so it adds no dependency and no asset file. Node has no
 * canvas and the fringe tests build the port headless, so every factory returns
 * null there and the materials fall back to plain colour.
 */

const TEX_CACHE = new Map();
const GEOM_CACHE = new Map();

function hasCanvas() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

export function canvasTexture(key, w, h, draw, opts = {}) {
  if (!hasCanvas()) return null;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  let tex = null;
  try {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    draw(ctx, w, h);
    tex = new THREE.CanvasTexture(cv);
    tex.wrapS = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    tex.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    if (opts.srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = opts.anisotropy ?? 4;
    tex.needsUpdate = true;
  } catch {
    return null;
  }
  TEX_CACHE.set(key, tex);
  return tex;
}

/**
 * ── P16-PM5B item 8 — A GLYPH STROKE IS 0.12 × s, AND UNDER 0.10 m IT IS HAIR. ──
 *
 * The orchestrator's hairline census names one family above every other: `f6f4ec`
 * cream boxes 0.034–0.06 m across — 102 + 65 + 57 + 44 + 17 of them at
 * crane-close, 99 + 57 + 24 + 20 at shed-lane, 622 + 331 + 216 at quay-hero.
 * They are sign lettering, and the arithmetic is exact: `kit.js` draws every
 * glyph bar at `0.12 × s`, so a run at s 0.31 (the funnel legend, the IMO
 * number, the berth boards) is a rank of 37 mm rods standing 50 mm proud of a
 * plate. At the play camera that is 0.6 px, which is the definition of the
 * fault rather than an instance of it.
 *
 * The floor is 0.10 m of member, so a run keeps its geometry only at
 * s ≥ `LETTER_S_MIN`. Below that it becomes ONE two-triangle decal plate whose
 * texture is rasterised from `addToyLetters`' OWN bar table — read back off a
 * throwaway group rather than copied — so the decal and the boxes can never
 * spell or space the text differently. The census does not count 2-tri quads,
 * and neither does the eye: a plate resolves into letters at every zoom where
 * 37 mm of steel cannot.
 */
export const LETTER_STROKE_MIN = 0.10;
const LETTER_STROKE_K = 0.12;
export const LETTER_S_MIN = LETTER_STROKE_MIN / LETTER_STROKE_K;
const LETTER_TEXELS_PER_M = 150;
const LETTER_MAT_CACHE = new Map();
const LETTER_PLAN_CACHE = new Map();

/** The bars kit.js would draw, read off a throwaway group. Single source of truth. */
function letterBarPlan(text, s, gap, mat) {
  const key = `${text}|${s.toFixed(4)}|${gap.toFixed(4)}`;
  if (LETTER_PLAN_CACHE.has(key)) return LETTER_PLAN_CACHE.get(key);
  const probe = new THREE.Group();
  const wrap = addToyLetters(probe, text, mat, 0, 0, 0, { s, gap, depth: 0.05, yaw: 0 });
  const bars = [];
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (const m of wrap.children) {
    const p = m.geometry?.parameters;
    if (!p) continue;
    const rot = m.rotation?.z ?? 0;
    const bar = { x: m.position.x, y: m.position.y, w: p.width, h: p.height, rot };
    bars.push(bar);
    const c = Math.abs(Math.cos(rot)); const sn = Math.abs(Math.sin(rot));
    const hx = (bar.w * c + bar.h * sn) * 0.5;
    const hy = (bar.w * sn + bar.h * c) * 0.5;
    x0 = Math.min(x0, bar.x - hx); x1 = Math.max(x1, bar.x + hx);
    y0 = Math.min(y0, bar.y - hy); y1 = Math.max(y1, bar.y + hy);
  }
  disposeGroup(probe);
  const plan = bars.length ? { bars, x0, x1, y0, y1 } : null;
  LETTER_PLAN_CACHE.set(key, plan);
  return plan;
}

/**
 * One plate carrying `text`. Returns a wrap group with the same `userData` stamp
 * the box run carries, so `p13-port-layout`'s letter census counts it unchanged.
 */
function letterDecalRun(group, text, mat, x, y, z, opts) {
  const s = opts.s;
  const gap = opts.gap;
  const plan = letterBarPlan(text, s, gap, mat);
  if (!plan) return null;
  const pad = 0.16 * s;
  const w = (plan.x1 - plan.x0) + pad * 2;
  const h = (plan.y1 - plan.y0) + pad * 2;
  if (!(w > 0) || !(h > 0)) return null;
  const hex = mat?.color ? `#${mat.color.getHexString()}` : '#f6f4ec';
  const key = `letters:${String(text).toUpperCase()}:${s.toFixed(3)}:${gap.toFixed(3)}:${hex}`;
  let plateMat = LETTER_MAT_CACHE.get(key);
  if (!plateMat) {
    // One isotropic texel density, so a rotated bar stays a rectangle in the map.
    const tw = Math.max(8, Math.min(1024, Math.round(w * LETTER_TEXELS_PER_M)));
    const th = Math.max(8, Math.min(1024, Math.round(h * LETTER_TEXELS_PER_M)));
    const tex = canvasTexture(key, tw, th, (ctx, W, H) => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = hex;
      const k = W / w;
      for (const b of plan.bars) {
        ctx.save();
        ctx.translate((b.x - plan.x0 + pad) * k, H - (b.y - plan.y0 + pad) * (H / h));
        ctx.rotate(-b.rot);
        ctx.fillRect(-b.w * 0.5 * k, -b.h * 0.5 * k, b.w * k, b.h * k);
        ctx.restore();
      }
    }, { clamp: true, srgb: true, anisotropy: 8 });
    plateMat = tex
      ? new THREE.MeshStandardMaterial({
        color: 0xffffff, map: tex, transparent: true, alphaTest: 0.4,
        roughness: mat?.roughness ?? 0.5, metalness: mat?.metalness ?? 0.06,
      })
      : mat;
    // taste-r1: only a plate material this module made is cached. With no canvas (the Node tests) `plateMat` is the
    // caller's own `mat`, which belongs to one build; caching it handed a later build the first build's stale
    // letter and hull-name materials (capped and worn by the first build's pass), so lettering read f6f4ec on
    // build one and cccac4 on build two, and the hull name V85 against V80.
    if (plateMat !== mat) LETTER_MAT_CACHE.set(key, plateMat);
  }
  const wrap = new THREE.Group();
  wrap.position.set(x, y, z);
  wrap.rotation.y = opts.yaw ?? 0;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(w, h), plateMat);
  quad.position.set((plan.x0 + plan.x1) * 0.5, (plan.y0 + plan.y1) * 0.5,
    (opts.depth ?? 0.1) * 0.5);
  noPick(quad);
  wrap.add(quad);
  wrap.userData.text = String(text).toUpperCase();
  wrap.userData.s = s;
  wrap.userData.letterYaw = opts.yaw ?? 0;
  wrap.userData.decal = true;
  group.add(wrap);
  return wrap;
}

/**
 * Every letter run in the venue goes through here. Above the stroke floor it is
 * the box run it always was; below it, one plate. The stamp is identical either
 * way, which is what keeps the census honest across the swap.
 */
export function toyLettersOrDecal(group, text, mat, x, y, z, opts = {}) {
  const s = opts.s ?? 0.85;
  const gap = opts.gap ?? 0.18;
  if (s < LETTER_S_MIN) {
    const plate = letterDecalRun(group, text, mat, x, y, z, { ...opts, s, gap });
    if (plate) return plate;
  }
  const wrap = addToyLetters(group, text, mat, x, y, z, { ...opts, s, gap });
  wrap.userData.text = String(text).toUpperCase();
  wrap.userData.s = s;
  wrap.userData.letterYaw = opts.yaw ?? 0;
  return wrap;
}

/** Deterministic 0..1 from two integers. Never Math.random. */
function u2(a, b) {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Mottled grey wash. Reads as concrete, asphalt or worn paint. */
function mottleTexture(key, { base = 208, grain = 26, blotch = 16, cells = 26, lines = 0 } = {}) {
  return canvasTexture(key, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = `rgb(${base},${base},${base})`;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < cells * cells; i += 1) {
      const x = (i % cells) * (w / cells);
      const y = Math.floor(i / cells) * (h / cells);
      const v = Math.round(base + (u2(i, 3) - 0.5) * 2 * blotch);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, w / cells + 1, h / cells + 1);
    }
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (u2(i, 11) - 0.5) * 2 * grain;
      d[i] = Math.max(0, Math.min(255, d[i] + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
    ctx.putImageData(img, 0, 0);
    for (let i = 0; i < lines; i += 1) {
      ctx.strokeStyle = `rgba(0,0,0,${0.05 + u2(i, 5) * 0.06})`;
      ctx.lineWidth = 1 + u2(i, 7);
      ctx.beginPath();
      let x = u2(i, 21) * w;
      let y = u2(i, 22) * h;
      ctx.moveTo(x, y);
      for (let s = 0; s < 5; s += 1) {
        x += (u2(i, 30 + s) - 0.5) * 90;
        y += (u2(i, 40 + s) - 0.5) * 90;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, { srgb: true });
}

/** Vertical corrugation as a tangent-space normal map. Container flanks. */
function corrugationNormal(key, ribs, railBand = 8) {
  return canvasTexture(key, 128, 128, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const p = (y * w + x) * 4;
        const flat = y < railBand || y > h - railBand - 1 ? 0 : 1;
        const nx = Math.sin((x / w) * Math.PI * 2 * ribs) * 0.62 * flat;
        const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx));
        img.data[p] = (nx * 0.5 + 0.5) * 255;
        img.data[p + 1] = 128;
        img.data[p + 2] = (nz * 0.5 + 0.5) * 255;
        img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

/** Crossing swell as a tangent-space normal map. Harbour surface. */
/**
 * Welded ship plating: horizontal strakes, staggered butt joints, weld beads and
 * a little oil-canning between them.
 *
 * ── GATE 2: "THE WEAR IS ONE TEXTURE." ──
 * The critic found the same fine vertical hatch at 3.4x to 7x on the tug hull,
 * the deckhouses, the container corrugation and the dredger's side plating, and
 * called it one procedural stripe standing in for steel, paint, corrugation and
 * enamel. It was literally one function: `corrugationNormal` drove `corrugation`,
 * `cladding` and `hullPlate`, and the only difference between them was the rib
 * count. A shed IS ribbed sheeting and a container IS corrugated, so those two
 * keep it. A boat is not: a hull is flat plate welded in courses, and the joints
 * run the other way. Two textures where there was one, on the two families that
 * were being confused for each other.
 */
/** Roughness map: scratches (darker = smoother exposed metal) and rust bloom (brighter). */
function steelScratchRoughness(key) {
  return canvasTexture(key, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i += 1) {
      const x = u2(i, 3) * w;
      const y = u2(i, 4) * h;
      ctx.strokeStyle = `rgb(${Math.round(40 + u2(i, 5) * 50)},${Math.round(40 + u2(i, 6) * 50)},${Math.round(40 + u2(i, 7) * 50)})`;
      ctx.lineWidth = 1 + u2(i, 8) * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (u2(i, 9) - 0.2) * 90, y + (u2(i, 10) - 0.5) * 18);
      ctx.stroke();
    }
    for (let i = 0; i < 28; i += 1) {
      const x = u2(i, 21) * w;
      const y = u2(i, 22) * h;
      const r = 8 + u2(i, 23) * 22;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, '#e8d8c8');
      g.addColorStop(1, 'rgba(138,138,138,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Albedo bloom: rust stains over galvanised grey. */
function steelRustBloom(key) {
  return canvasTexture(key, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8e949c';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i += 1) {
      const x = u2(i, 2) * w;
      ctx.fillStyle = `rgba(${Math.round(140 + u2(i, 3) * 40)},${Math.round(70 + u2(i, 4) * 30)},${Math.round(36 + u2(i, 5) * 16)},${0.18 + u2(i, 6) * 0.4})`;
      ctx.fillRect(x, u2(i, 7) * h * 0.35, 2 + u2(i, 8) * 5, h * (0.4 + u2(i, 9) * 0.55));
    }
    for (let i = 0; i < 16; i += 1) {
      ctx.fillStyle = `rgba(70,74,78,${0.08 + u2(i, 12) * 0.16})`;
      ctx.fillRect(0, u2(i, 13) * h, w, 2);
    }
  }, { srgb: true });
}

/** Concrete aggregate albedo with control-joint lines and oil stains. */
function concreteAggregate(key) {
  return canvasTexture(key, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b8b4aa';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i += 1) {
      const v = Math.round(150 + u2(i, 3) * 70);
      ctx.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
      ctx.fillRect(u2(i, 4) * w, u2(i, 5) * h, 1 + u2(i, 6) * 3, 1 + u2(i, 7) * 3);
    }
    ctx.fillStyle = 'rgba(70,68,62,0.55)';
    ctx.fillRect(0, h * 0.33 - 1, w, 2);
    ctx.fillRect(0, h * 0.66 - 1, w, 2);
    ctx.fillRect(w * 0.5 - 1, 0, 2, h);
    for (let i = 0; i < 10; i += 1) {
      const x = u2(i, 20) * w;
      const y = u2(i, 21) * h;
      const r = 12 + u2(i, 22) * 28;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(48,44,38,0.45)');
      g.addColorStop(1, 'rgba(48,44,38,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { srgb: true });
}

function concreteJointRoughness(key) {
  return canvasTexture(key, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, h * 0.33 - 2, w, 4);
    ctx.fillRect(0, h * 0.66 - 2, w, 4);
    ctx.fillRect(w * 0.5 - 2, 0, 4, h);
    for (let i = 0; i < 80; i += 1) {
      const v = Math.round(200 + u2(i, 2) * 40);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(u2(i, 3) * w, u2(i, 4) * h, 4 + u2(i, 5) * 10, 3);
    }
  });
}

/** Painted-metal roughness: semi-gloss field with brighter chipped edges. */
function paintChipRoughness(key) {
  return canvasTexture(key, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d8d8d8';
    ctx.fillRect(0, 0, w, 6);
    ctx.fillRect(0, h - 6, w, 6);
    ctx.fillRect(0, 0, 6, h);
    ctx.fillRect(w - 6, 0, 6, h);
    for (let i = 0; i < 48; i += 1) {
      ctx.fillStyle = `rgb(${Math.round(180 + u2(i, 2) * 60)},${Math.round(180 + u2(i, 3) * 60)},${Math.round(180 + u2(i, 4) * 60)})`;
      ctx.fillRect(u2(i, 5) * w, u2(i, 6) * h, 3 + u2(i, 7) * 10, 2 + u2(i, 8) * 6);
    }
  });
}

/**
 * ── P13-A8 item 7 (R6 fault 8) — MACRO WEAR THAT SURVIVES 1:1. ──
 *
 * "Crane paint, concrete, roofs and steel still share a smooth toy response…
 * make native-pixel macro wear and specular separation materially stronger."
 *
 * The three families already had maps, and that is exactly why the note is
 * about MACRO: `mottleTexture` is a 26-cell blotch field plus per-pixel grain,
 * which is high-frequency — at a hundred metres it integrates to a flat tone
 * and at 1:1 it reads as noise. What tells paint from concrete from steel on a
 * real wharf is LOW-frequency and it is positional: paint carries a darker
 * weathered dado along its bottom edge and chips along every edge; concrete
 * carries control joints on a fixed grid, tyre smears and a damp band; steel
 * carries rust blooming out of horizontal weld lines. All three below are
 * authored at that scale, on top of the grain the families already had.
 */
function paintWeatheredAlbedo(key) {
  return canvasTexture(key, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e6e4de';
    ctx.fillRect(0, 0, w, h);
    // The weathered band. Paint fails from the bottom up: splash, salt, boots.
    const grad = ctx.createLinearGradient(0, h * 0.58, 0, h);
    grad.addColorStop(0, 'rgba(96,92,84,0)');
    grad.addColorStop(0.55, 'rgba(96,92,84,0.30)');
    grad.addColorStop(1, 'rgba(74,70,62,0.52)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, h * 0.58, w, h * 0.42);
    // Drip streaks out of the fixings.
    for (let i = 0; i < 14; i += 1) {
      const x = u2(i, 31) * w;
      const y0 = h * (0.10 + u2(i, 32) * 0.45);
      const len = h * (0.12 + u2(i, 33) * 0.4);
      const gg = ctx.createLinearGradient(0, y0, 0, y0 + len);
      gg.addColorStop(0, 'rgba(112,86,58,0.42)');
      gg.addColorStop(1, 'rgba(112,86,58,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(x, y0, 2 + u2(i, 34) * 3, len);
    }
    // Chips: bright substrate along every edge, plus scattered knocks.
    ctx.fillStyle = 'rgba(168,170,172,0.85)';
    for (let i = 0; i < 90; i += 1) {
      const edge = i % 4;
      const t = u2(i, 41) * (edge < 2 ? w : h);
      const s = 2 + u2(i, 42) * 6;
      if (edge === 0) ctx.fillRect(t, 0, s, 1 + u2(i, 43) * 4);
      else if (edge === 1) ctx.fillRect(t, h - 4, s, 1 + u2(i, 43) * 4);
      else if (edge === 2) ctx.fillRect(0, t, 1 + u2(i, 43) * 4, s);
      else ctx.fillRect(w - 4, t, 1 + u2(i, 43) * 4, s);
    }
    ctx.fillStyle = 'rgba(150,152,155,0.7)';
    for (let i = 0; i < 34; i += 1) {
      ctx.fillRect(u2(i, 51) * w, u2(i, 52) * h, 2 + u2(i, 53) * 5, 2 + u2(i, 54) * 4);
    }
  }, { srgb: true });
}

function apronWearAlbedo(key) {
  return canvasTexture(key, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#bdb9af';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i += 1) {
      const v = Math.round(158 + u2(i, 3) * 62);
      ctx.fillStyle = `rgb(${v},${v - 3},${v - 9})`;
      ctx.fillRect(u2(i, 4) * w, u2(i, 5) * h, 1 + u2(i, 6) * 3, 1 + u2(i, 7) * 3);
    }
    // Control joints, and a slab that has settled a little either side of one.
    ctx.fillStyle = 'rgba(58,56,50,0.62)';
    for (const y of [0.25, 0.5, 0.75]) ctx.fillRect(0, h * y - 1.5, w, 3);
    for (const x of [0.33, 0.72]) ctx.fillRect(w * x - 1.5, 0, 3, h);
    ctx.fillStyle = 'rgba(200,196,188,0.4)';
    ctx.fillRect(0, h * 0.5 + 2, w, 4);
    // Tyre smears: long, soft, roughly parallel, never through a joint square.
    for (let i = 0; i < 9; i += 1) {
      const y = u2(i, 61) * h;
      const gg = ctx.createLinearGradient(0, y, w, y + (u2(i, 62) - 0.5) * 40);
      gg.addColorStop(0, 'rgba(46,44,42,0)');
      gg.addColorStop(0.4, `rgba(46,44,42,${0.16 + u2(i, 63) * 0.2})`);
      gg.addColorStop(1, 'rgba(46,44,42,0)');
      ctx.strokeStyle = gg;
      ctx.lineWidth = 3 + u2(i, 64) * 7;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y + (u2(i, 65) - 0.5) * 50, w * 0.7,
        y + (u2(i, 66) - 0.5) * 50, w, y + (u2(i, 67) - 0.5) * 30);
      ctx.stroke();
    }
    // Damp band along the cope edge.
    const damp = ctx.createLinearGradient(0, h, 0, h * 0.82);
    damp.addColorStop(0, 'rgba(74,76,74,0.42)');
    damp.addColorStop(1, 'rgba(74,76,74,0)');
    ctx.fillStyle = damp;
    ctx.fillRect(0, h * 0.82, w, h * 0.18);
  }, { srgb: true });
}

function steelWeldAlbedo(key) {
  return canvasTexture(key, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8f959c';
    ctx.fillRect(0, 0, w, h);
    // Plate courses. Each one a shade off its neighbour, which is what makes a
    // steel wall read as PLATES rather than as a painted surface.
    for (let i = 0; i < 5; i += 1) {
      const v = Math.round(132 + u2(i, 11) * 30);
      ctx.fillStyle = `rgb(${v},${v + 4},${v + 9})`;
      ctx.fillRect(0, (i / 5) * h, w, h / 5 - 1);
    }
    // Weld beads, and the rust blooming down out of each one.
    for (let i = 1; i < 5; i += 1) {
      const y = (i / 5) * h;
      ctx.fillStyle = 'rgba(72,76,80,0.75)';
      ctx.fillRect(0, y - 1, w, 2);
      const gg = ctx.createLinearGradient(0, y, 0, y + h * 0.14);
      gg.addColorStop(0, 'rgba(146,86,44,0.55)');
      gg.addColorStop(1, 'rgba(146,86,44,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(0, y, w, h * 0.14);
    }
    // Bloom patches with a hard core and a soft halo — a rust spot has an edge.
    for (let i = 0; i < 22; i += 1) {
      const x = u2(i, 21) * w;
      const y = u2(i, 22) * h;
      const r = 4 + u2(i, 23) * 16;
      const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
      gg.addColorStop(0, `rgba(134,72,34,${0.4 + u2(i, 24) * 0.35})`);
      gg.addColorStop(0.55, 'rgba(134,72,34,0.22)');
      gg.addColorStop(1, 'rgba(134,72,34,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { srgb: true });
}

/** Specular breakup for steel: the roughness half of the same story. */
function steelBreakupRoughness(key) {
  return canvasTexture(key, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#585858';
    ctx.fillRect(0, 0, w, h);
    for (let i = 1; i < 5; i += 1) {
      ctx.fillStyle = '#c8c8c8';
      ctx.fillRect(0, (i / 5) * h - 2, w, 4);
    }
    for (let i = 0; i < 30; i += 1) {
      const x = u2(i, 31) * w;
      const y = u2(i, 32) * h;
      const r = 5 + u2(i, 33) * 18;
      const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
      gg.addColorStop(0, 'rgba(230,230,230,0.8)');
      gg.addColorStop(1, 'rgba(230,230,230,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 60; i += 1) {
      ctx.fillStyle = `rgba(30,30,30,${0.1 + u2(i, 41) * 0.2})`;
      ctx.fillRect(u2(i, 42) * w, u2(i, 43) * h, 6 + u2(i, 44) * 26, 1 + u2(i, 45) * 2);
    }
  });
}

/** Albedo for tanker hull plating: strakes, weld beads, framing lines. */
function hullFramingAlbedo(key) {
  return canvasTexture(key, 256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#2a3038';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i += 1) {
      const y = ((i + 0.5) / 7) * h;
      const v = Math.round(36 + u2(i, 3) * 14);
      ctx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
      ctx.fillRect(0, y - h / 14, w, h / 7);
    }
    for (let i = 0; i < 7; i += 1) {
      const y = (i / 6) * h;
      ctx.fillStyle = 'rgba(190,198,206,0.38)';
      ctx.fillRect(0, y - 1, w, 2);
      ctx.fillStyle = 'rgba(12,14,16,0.45)';
      ctx.fillRect(0, y + 1, w, 1);
    }
    for (let i = 0; i < 9; i += 1) {
      const x = (i / 8) * w + ((i % 2) * w) / 18;
      ctx.fillStyle = 'rgba(170,178,186,0.32)';
      ctx.fillRect(x - 1, 0, 2, h);
      ctx.fillStyle = 'rgba(10,12,14,0.4)';
      ctx.fillRect(x + 1, 0, 1, h);
    }
    for (let i = 0; i < 28; i += 1) {
      ctx.fillStyle = `rgba(18,16,14,${0.08 + u2(i, 9) * 0.16})`;
      ctx.fillRect(u2(i, 11) * w, u2(i, 12) * h, 2 + u2(i, 13) * 5, 8 + u2(i, 14) * 22);
    }
  }, { srgb: true });
}

function platingNormal(key, strakes = 5, butts = 3) {
  return canvasTexture(key, 128, 128, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    const nearest = (v, pitch) => {
      const m = ((v % pitch) + pitch) % pitch;
      return m > pitch * 0.5 ? m - pitch : m;
    };
    // Odd, so the bead reads as a raised weld rather than a groove.
    const bead = (d, r) => (Math.abs(d) > r ? 0 : (d / r) * Math.exp(1 - (d * d) / (r * r)));
    const strakeH = h / strakes;
    const buttW = w / butts;
    for (let y = 0; y < h; y += 1) {
      const iy = Math.floor(y / strakeH);
      const sy = nearest(y, strakeH);
      for (let x = 0; x < w; x += 1) {
        const sx = nearest(x + (iy % 2) * buttW * 0.5, buttW);
        let nx = bead(sx, 2.4) * 0.46 + Math.sin(y * 0.087 + 1.4) * 0.09;
        let ny = bead(sy, 2.9) * 0.58 + Math.sin(x * 0.061 + 3.1) * 0.07;
        const m = Math.hypot(nx, ny);
        if (m > 0.92) { nx = (nx / m) * 0.92; ny = (ny / m) * 0.92; }
        const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
        const q = (y * w + x) * 4;
        img.data[q] = (nx * 0.5 + 0.5) * 255;
        img.data[q + 1] = (ny * 0.5 + 0.5) * 255;
        img.data[q + 2] = (nz * 0.5 + 0.5) * 255;
        img.data[q + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

function rippleNormal(key) {
  return canvasTexture(key, 256, 256, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const p = (y * w + x) * 4;
        const u = (x / w) * Math.PI * 2;
        const v = (y / h) * Math.PI * 2;
        const nx = Math.sin(u * 3 + v) * 0.22
          + Math.sin(u * 7 - v * 3) * 0.12
          + Math.sin(u * 13 + v * 9) * 0.05;
        const ny = Math.sin(v * 2 - u) * 0.19
          + Math.sin(v * 9 + u * 5) * 0.08
          + Math.sin(v * 17 - u * 11) * 0.04;
        const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
        img.data[p] = (nx * 0.5 + 0.5) * 255;
        img.data[p + 1] = (ny * 0.5 + 0.5) * 255;
        img.data[p + 2] = (nz * 0.5 + 0.5) * 255;
        img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

/** Real diamond mesh with holes. Alpha-tested, so the fence is see-through. */
function chainlinkTexture(key) {
  return canvasTexture(key, 128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#d2d6da';
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'square';
    for (let i = -w; i < w * 2; i += 16) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h, 0); ctx.stroke();
    }
  }, { srgb: true });
}

/**
 * ── ALPHA MAPS MUST BE PAINTED IN GREY, NOT IN ALPHA. ──
 *
 * Every soft mask in this file was authored as white at varying canvas alpha on
 * a cleared canvas. Three.js reads `alphaMap` from the texture's GREEN channel,
 * and a canvas painted `rgba(255,255,255,0.15)` still has green 255 wherever it
 * was touched at all — the falloff lives entirely in a channel the shader never
 * samples. So a gradient authored as a soft blob uploads as a HARD disc.
 *
 * The plate agrees, twice. The critic recorded "hard black contact patches" for
 * kit that this function's own comment calls soft, and read the wake as "loose
 * white beads" — which is what `foamTexture` becomes when 620 soft radial
 * gradients each flatten to an opaque dot. Both masks are now opaque greyscale
 * on black, where the value the shader reads is the value that was painted.
 */
function contactTexture(key) {
  return canvasTexture(key, 96, 96, (ctx, w, h) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#f2f2f2');
    g.addColorStop(0.45, '#8c8c8c');
    g.addColorStop(0.8, '#262626');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { clamp: true });
}

/**
 * ── P16-PM5B item 6 — THE MULTIPLY AO MAP IS THE INVERSE OF THE ALPHA ONE. ──
 * `contactTexture` is white at the centre and black at the rim because it is an
 * ALPHA map: alpha high under the foot, fading out. Handed to a MULTIPLY
 * material as a colour map it would do the opposite of the job — leave the
 * centre untouched and paint a black ring round it. A multiply map darkens
 * where it is DARK, so this one runs dark at the centre out to pure white,
 * which multiplies to no change at the rim and so has no edge.
 */
function contactAOTexture(key) {
  return canvasTexture(key, 96, 96, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#5d646d');
    g.addColorStop(0.42, '#8f959d');
    g.addColorStop(0.74, '#d2d5d9');
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { clamp: true });
}

/** Diagonal hazard bars. Painted keep-clear zones and crane-leg skirts. */
function hazardTexture(key, a = '#eec21c', b = '#1b1b1e') {
  return canvasTexture(key, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = b;
    ctx.lineWidth = 22;
    for (let i = -h; i < w * 2; i += 44) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
    }
  }, { srgb: true });
}

/** Rust bleeding down from weld seams. Sheet piling, wagons, old plant. */
function rustTexture(key, base = '#9a7050') {
  return canvasTexture(key, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i += 1) {
      const wid = 1 + u2(i, 64) * 5;
      ctx.fillStyle = `rgba(${Math.round(96 + u2(i, 65) * 70)},${Math.round(42 + u2(i, 66) * 34)},24,${0.18 + u2(i, 67) * 0.42})`;
      ctx.fillRect(u2(i, 61) * w, u2(i, 62) * h, wid, 12 + u2(i, 63) * 74);
    }
    for (let i = 0; i < 46; i += 1) {
      ctx.fillStyle = `rgba(238,234,226,${0.08 + u2(i, 71) * 0.18})`;
      ctx.fillRect(u2(i, 72) * w, u2(i, 73) * h, 6 + u2(i, 74) * 26, 4 + u2(i, 75) * 18);
    }
  }, { srgb: true });
}

/** Timber sleepers over ballast, for the quay rail spur. */
function sleeperTexture(key) {
  return canvasTexture(key, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6b6259';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1100; i += 1) {
      const g = Math.round(86 + u2(i, 81) * 76);
      ctx.fillStyle = `rgb(${g},${Math.round(g * 0.95)},${Math.round(g * 0.87)})`;
      const s = 2 + u2(i, 82) * 5;
      ctx.fillRect(u2(i, 83) * w, u2(i, 84) * h, s, s);
    }
    for (let i = 0; i < 12; i += 1) {
      const y = i * (h / 12) + 3;
      ctx.fillStyle = `rgb(${Math.round(50 + u2(i, 85) * 22)},${Math.round(36 + u2(i, 86) * 16)},29)`;
      ctx.fillRect(0, y, w, 11);
    }
  }, { srgb: true });
}

/**
 * Foam. The first version drew hard 2-8 px rectangles, and stretched across a
 * fifteen-metre wake strip each of those landed on screen as a ten-pixel white
 * square — the plate read as confetti, not spray. Soft radial blobs at high
 * density blur into froth instead.
 */
function foamTexture(key) {
  return canvasTexture(key, 256, 256, (ctx, w, h) => {
    // Opaque greyscale, so the falloff survives into the channel the shader
    // reads. See the note above `contactTexture`.
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    // r4's grain landed on screen as 4-8 px blobs and the critic read it as
    // scattered polystyrene rather than froth. Halving the radius and roughly
    // doubling the count keeps the same coverage while putting the grain under
    // the resolving limit at the hero camera, which is what makes spray read as
    // spray. The count is the cost: it is canvas work at build time only.
    for (let i = 0; i < 2000; i += 1) {
      const y = u2(i, 91) * h;
      // Fade to nothing at the top and bottom so tiled strips have no hard edge.
      const fall = Math.sin((y / h) * Math.PI);
      if (u2(i, 92) > fall * fall * 1.15) continue;
      const x = u2(i, 95) * w;
      const r = 1.1 + u2(i, 94) * 3.1;
      const a = (0.16 + u2(i, 93) * 0.54) * fall;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(255,255,255,${a})`);
      grad.addColorStop(0.5, `rgba(255,255,255,${a * 0.42})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }, {});
}

/**
 * Waterline collar. A ribbon with a bright core, not a field of blobs.
 *
 * ── WHY THE r5 COLLAR WAS NOT FINDABLE IN THE PIXELS. ──
 * The critic could not find foam on the dredger's port waterline or stern, or
 * on the barge's outboard side, at 7x — and the census said every hull had it.
 * Both are true. `foamTexture` is 2000 blobs at radius 1.1–4.2 px on a 256 px
 * tile, peak alpha 0.7, under a material opacity of 0.4: mean coverage over the
 * strip works out at a few percent of an already weak 0.28. On a hull with a
 * WAKE behind it (both tugs, the pilot, the launch) the wake carries the white
 * and the collar is never asked to. The dredger and the barge are moored, have
 * no wake, and there the collar was the whole claim — so the two vessels the
 * critic named are exactly the two the blob field could not carry.
 *
 * This is a ribbon: a bright core running along the hull side, scalloped along
 * its length and falling off across its width, with the blob grain kept as a
 * top layer rather than as the whole signal.
 */
function collarTexture(key) {
  return canvasTexture(key, 256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const px = img.data;
    for (let y = 0; y < h; y += 1) {
      const v = (y + 0.5) / h;
      // Across the ribbon: a bright core just off centre, dying at both edges.
      const across = Math.exp(-((v - 0.46) * (v - 0.46)) / (2 * 0.115 * 0.115));
      for (let x = 0; x < w; x += 1) {
        const u = (x + 0.5) / w;
        // Scallops: three periods that do not share a factor, so the ribbon
        // never repeats as a comb.
        const sc = 0.60
          + 0.24 * Math.sin(u * Math.PI * 2 * 7 + 0.6)
          + 0.16 * Math.sin(u * Math.PI * 2 * 13 + 2.3)
          + 0.11 * Math.sin(u * Math.PI * 2 * 23 + 4.1);
        const grain = 0.72 + 0.5 * u2(x, y * 7 + 3);
        const a = Math.max(0, Math.min(1, across * sc * grain));
        const i = (y * w + x) * 4;
        const c = Math.round(a * 255);
        px[i] = c; px[i + 1] = c; px[i + 2] = c; px[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, {});
}

/**
 * Wetted band. Greyscale MULTIPLIER, white at both edges and dark through the
 * middle, so a strip laid along a hull's waterline darkens the water into the
 * hull and fades to nothing rather than stopping at a line.
 *
 * Gate 3's remaining half: the critic found "no foam AND no contact darkening"
 * on the dredger and the barge. Froth alone is not contact — a hull sitting in
 * water darkens the water it displaces before it froths it.
 */
function wetBandTexture(key) {
  return canvasTexture(key, 8, 64, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    const px = img.data;
    for (let y = 0; y < h; y += 1) {
      const v = (y + 0.5) / h;
      const core = Math.exp(-((v - 0.5) * (v - 0.5)) / (2 * 0.22 * 0.22));
      // 1 (no change) at the edges down to 0.46 through the middle.
      const m = 1 - 0.54 * core;
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        const c = Math.round(Math.max(0, Math.min(1, m)) * 255);
        px[i] = c; px[i + 1] = c; px[i + 2] = c; px[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, {});
}

/**
 * Hull-plan shadow stencil: pointed bow at +u, rounded stern at -u, a solid
 * core and a soft rim.
 *
 * r3 shadowed every hull with a plain radial blob wider than the beam, and the
 * critic's reading was exact — two shadow languages in one frame, hard lattice
 * shadows on the dock and featureless ovals on the water. A silhouette costs
 * one texture.
 */
function hullShadowTexture(key) {
  return canvasTexture(key, 256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    const outline = (k) => {
      const cx = w * 0.5;
      const cy = h * 0.5;
      const sx = (u) => cx + (u - 0.5) * w * k;
      const sy = (v) => cy + (v - 0.5) * h * k;
      ctx.beginPath();
      ctx.moveTo(sx(0.05), sy(0.5));
      ctx.bezierCurveTo(sx(0.05), sy(0.10), sx(0.13), sy(0.03), sx(0.30), sy(0.03));
      ctx.lineTo(sx(0.70), sy(0.03));
      ctx.bezierCurveTo(sx(0.89), sy(0.06), sx(0.98), sy(0.30), sx(0.99), sy(0.5));
      ctx.bezierCurveTo(sx(0.98), sy(0.70), sx(0.89), sy(0.94), sx(0.70), sy(0.97));
      ctx.lineTo(sx(0.30), sy(0.97));
      ctx.bezierCurveTo(sx(0.13), sy(0.97), sx(0.05), sy(0.90), sx(0.05), sy(0.5));
      ctx.closePath();
      ctx.fill();
    };
    // Ten stacked fills from proud of the hull inward: a penumbra at the rim
    // that reaches full strength a fifth of the beam inside the silhouette.
    // Painted onto opaque black so the accumulation lands in the green channel
    // the shader samples, not in canvas alpha, which it does not.
    for (let i = 0; i < 10; i += 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      outline(1.04 - i * 0.052);
    }
  }, { clamp: true });
}

/**
 * ── P13-A10 item 3 — the CONTACT alpha, which is not the CAST-SHADOW alpha. ──
 *
 * The first cut of the contact decal reused `hullShadowTexture` and measured as
 * nothing: an exact same-session A/B at `quay-hero` moved 2 pixels under the tug
 * and the force-opaque probe plate showed no shape at all. The reason is in that
 * texture's ramp, not in the blend. Its ten fills run k 1.04 → 0.572, and its
 * outline already spans the whole canvas at k = 1, so alpha reaches full strength
 * a fifth of the beam INSIDE the hull — exactly where the hull occludes it — and
 * the only band left outboard carries the 0.16 rim, which at 0.32 opacity is a
 * 5 % darkening, i.e. three luma. Correct for a shadow thrown clear of its
 * caster; useless for a contact that lives under one.
 *
 * This ramp is built the other way round: full strength by r ≈ 0.70 of the quad
 * and falling to nothing at its edge, so with the quad at 1.30 × beam the hull's
 * own edge sits at r ≈ 0.77 where the map still reads about 0.9. The visible
 * band is then 0.15 × beam of real value decaying outward, and it has no edge of
 * its own — which is the distinction that keeps MC3-6 closed.
 */
function hullContactTexture(key) {
  return canvasTexture(key, 256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    const outline = (k) => {
      const cx = w * 0.5;
      const cy = h * 0.5;
      const sx = (u) => cx + (u - 0.5) * w * k;
      const sy = (v) => cy + (v - 0.5) * h * k;
      ctx.beginPath();
      ctx.moveTo(sx(0.04), sy(0.5));
      ctx.bezierCurveTo(sx(0.04), sy(0.12), sx(0.14), sy(0.02), sx(0.32), sy(0.02));
      ctx.lineTo(sx(0.72), sy(0.02));
      ctx.bezierCurveTo(sx(0.90), sy(0.06), sx(0.99), sy(0.30), sx(1.0), sy(0.5));
      ctx.bezierCurveTo(sx(0.99), sy(0.70), sx(0.90), sy(0.94), sx(0.72), sy(0.98));
      ctx.lineTo(sx(0.32), sy(0.98));
      ctx.bezierCurveTo(sx(0.14), sy(0.98), sx(0.04), sy(0.88), sx(0.04), sy(0.5));
      ctx.closePath();
      ctx.fill();
    };
    // ── P16-PM2 (PM1 hand-off) — THE CONTACT NEEDS A REAL FEATHER. ──
    // Twelve fills of 0.22 put 22 % of the value on the OUTERMOST band, and
    // that band coincides with the quad's own boundary: the alpha steps from
    // nothing to 22 % across one texel, which is a hard edge, and the corner
    // pose reads it as a black plate under the warship. Thirty fills of 0.055
    // put 5.5 % on the outer band and reach 0.82 at the core, and the ramp runs
    // k 1.00 → 0.50, so on a quad at 1.20 × beam the feather is a quarter of
    // the quad's half-width — 1.5 m under a 9.6 m hull, 1.1 m under a 5.7 m one.
    for (let i = 0; i < 30; i += 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.055)';
      outline(1.0 - i * 0.0172);
    }
  }, { clamp: true });
}

/**
 * Water film: a tileable multiplier laid over the basin's baked vertex colours.
 * Twelve summed waves at irregular integer wavenumbers, plus a glitter term
 * picked out where the field's directional slope peaks.
 *
 * ── WHY THIS IS NOT r1's PLAID, WHICH IS THE OBVIOUS OBJECTION ──
 * r1 lost a round to a lattice, and the mechanism was specific: two crossed
 * low-frequency sines in a NORMAL map, tiled nine times, seen through a pure
 * white specular term on an otherwise flat surface. Two crossed sines are a
 * plaid by construction, and a specular-only response prints one. This is an
 * albedo multiplier of twelve waves at twelve headings, none axis-aligned and
 * none sharing a wavenumber ratio, multiplying a colour field that is already
 * varying. There is no pair of dominant orthogonal frequencies for a lattice to
 * form from, and no highlight term for it to be printed by.
 *
 * Integer wavenumbers make the tile seamless. The tile is laid at 170 m, which
 * is wider than the visible water is deep at the hero camera, so the repeat
 * itself never presents two copies of the same motif side by side.
 */
function waterFilmTexture(key) {
  return canvasTexture(key, 512, 512, (ctx, w, h) => {
    // [mu, nv, amplitude, phase]. Low bands are swell, the last three are chop.
    //
    // ── THE SPECTRUM IS FLAT ON PURPOSE, AND NORMALISED BY RMS. ──
    // The first r4 film used a 1/k amplitude roll-off and divided by the SUM of
    // amplitudes. Both were wrong for this job. The three chop octaves carried
    // 0.20 of 4.09, so the metre-scale detail this map exists to supply arrived
    // at under one per cent of the range and measured as nothing in the plate.
    // A near-flat spectrum keeps the fine octaves in play, and dividing by RMS
    // rather than the sum restores the contrast that summing twelve waves and
    // then dividing by twelve throws away. Extremes clip, which is what a
    // wind-roughened surface does anyway.
    //
    // ── r6: THE SPECTRUM STOPPED TOO SOON FOR THE INSTRUMENT THAT GRADES IT. ──
    // Gate 2 is measured as a 9x9 LOCAL luminance sigma, so it only counts
    // detail whose period is under about ten screen pixels. At the r5 repeat of
    // one tile per 170 m the finest wave here — m 45 on a 512 tile — landed at
    // 3.8 m, which is 57 px of screen in the near water and 19 px in the far.
    // Every octave in the film was therefore ABOVE the window the instrument
    // looks through, which is why the flat map came back with the open water
    // solid red while its own smoothed standard deviation read a healthy 8.2.
    // Three more octaves take the spectrum down to m 71, and the repeat below
    // drops to 58 m, which puts the finest band at 0.8 m — 12 px near, 4 px far.
    const WAVES = [
      [3, 1, 1.00, 0.00], [1, 4, 0.86, 1.31], [5, 2, 0.78, 2.44],
      [2, 7, 0.72, 3.77], [8, 3, 0.66, 0.62], [4, 9, 0.62, 5.11],
      [11, 5, 0.58, 1.88], [6, 13, 0.54, 4.02], [15, 8, 0.52, 2.71],
      [34, 19, 0.58, 0.44], [41, 27, 0.55, 3.19], [23, 45, 0.53, 1.05],
      [60, 37, 0.50, 2.16], [29, 63, 0.48, 4.71], [71, 52, 0.45, 0.83],
    ];
    // Slope is read along one heading so the glitter lies in streaks the way a
    // sun path does, instead of an even sparkle over the whole plane.
    const GX = 0.86;
    const GZ = -0.51;
    let ampSq = 0;
    let slopeSq = 0;
    for (const [m, n, a] of WAVES) {
      ampSq += a * a;
      const d = a * (m * GX + n * GZ);
      slopeSq += d * d;
    }
    const ampNorm = 1 / (2.1 * Math.sqrt(ampSq * 0.5));
    const slopeNorm = 1 / (2.3 * Math.sqrt(slopeSq * 0.5));
    const img = ctx.createImageData(w, h);
    const D = img.data;
    const TAU = Math.PI * 2;
    for (let y = 0; y < h; y += 1) {
      const v = (y / h) * TAU;
      for (let x = 0; x < w; x += 1) {
        const u = (x / w) * TAU;
        let f = 0;
        let s = 0;
        for (let k = 0; k < WAVES.length; k += 1) {
          const [m, n, a, p] = WAVES[k];
          const t = m * u + n * v + p;
          f += a * Math.sin(t);
          s += a * (m * GX + n * GZ) * Math.cos(t);
        }
        const fn = Math.max(-1, Math.min(1, f * ampNorm));
        const sn = Math.max(0, Math.min(1, s * slopeNorm));
        const glint = Math.pow(sn, 4);
        const value = 0.775 + 0.262 * fn + 0.26 * glint;
        const b = Math.max(0, Math.min(255, Math.round(value * 255)));
        const i = (y * w + x) * 4;
        D[i] = b; D[i + 1] = b; D[i + 2] = b; D[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, { anisotropy: 8 });
}

export function portTextures() {
  return {
    concrete: mottleTexture('dd-port-concrete', { base: 216, grain: 15, blotch: 15, cells: 22, lines: 14 }),
    asphalt: mottleTexture('dd-port-asphalt', { base: 200, grain: 30, blotch: 13, cells: 34, lines: 9 }),
    paint: mottleTexture('dd-port-paint', { base: 228, grain: 8, blotch: 12, cells: 18, lines: 6 }),
    steelWear: mottleTexture('dd-port-steelwear', { base: 222, grain: 11, blotch: 20, cells: 14, lines: 10 }),
    steelScratch: steelScratchRoughness('dd-port-steel-scratch'),
    steelBloom: steelRustBloom('dd-port-steel-bloom'),
    concreteAgg: concreteAggregate('dd-port-concrete-agg'),
    concreteJoints: concreteJointRoughness('dd-port-concrete-joints'),
    paintChip: paintChipRoughness('dd-port-paint-chip'),
    corrugation: corrugationNormal('dd-port-corrugation', 11),
    cladding: corrugationNormal('dd-port-cladding', 18, 4),
    hullPlate: platingNormal('dd-port-hullplate'),
    hullFrame: hullFramingAlbedo('dd-port-hullframe'),
    plating: platingNormal('dd-port-plating', 4, 2),
    ripple: rippleNormal('dd-port-ripple'),
    chainlink: chainlinkTexture('dd-port-chainlink'),
    contact: contactTexture('dd-port-contact'),
    contactAO: contactAOTexture('dd-port-contact-ao'),
    hazard: hazardTexture('dd-port-hazard'),
    rust: rustTexture('dd-port-rust'),
    sleepers: sleeperTexture('dd-port-sleepers'),
    foam: foamTexture('dd-port-foam'),
    collar: collarTexture('dd-port-collar'),
    wetBand: wetBandTexture('dd-port-wetband'),
    hullShade: hullShadowTexture('dd-port-hullshade'),
    hullContact: hullContactTexture('dd-port-hullcontact'),
    waterFilm: waterFilmTexture('dd-port-waterfilm'),
    // P13-A8 item 7 — the macro half of the three families.
    paintWeather: paintWeatheredAlbedo('dd-port-paint-weather'),
    apronWear: apronWearAlbedo('dd-port-apron-wear'),
    steelWeld: steelWeldAlbedo('dd-port-steel-weld'),
    steelBreakup: steelBreakupRoughness('dd-port-steel-breakup'),
  };
}

/**
 * Box with every edge cut. Gate 1 bans a razor 90° corner anywhere the light
 * catches, and a chamfer is the cheapest honest fix: one extrusion, one bevel
 * ring, cached by dimension so a hundred containers share one buffer.
 */
export function chamferBox(w, h, d, chamfer = 0.045) {
  const c = Math.max(0.006, Math.min(chamfer, w * 0.3, h * 0.3, d * 0.3));
  const key = `cb|${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${c.toFixed(3)}`;
  const hit = GEOM_CACHE.get(key);
  if (hit) return hit;
  const iw = w - c * 2;
  const id = d - c * 2;
  const shape = new THREE.Shape();
  shape.moveTo(-iw / 2, -id / 2);
  shape.lineTo(iw / 2, -id / 2);
  shape.lineTo(iw / 2, id / 2);
  shape.lineTo(-iw / 2, id / 2);
  shape.closePath();
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: h - c * 2,
    bevelEnabled: true,
    bevelSize: c,
    bevelThickness: c,
    bevelOffset: 0,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 1,
  });
  geom.rotateX(-HALF_PI);
  geom.translate(0, h * 0.5 - c, 0);
  geom.computeVertexNormals();
  GEOM_CACHE.set(key, geom);
  return geom;
}

/**
 * ── THE `addSlab` ORIGIN, MEASURED. READ THIS BEFORE PLACING ANYTHING. ──
 *
 * `addSlab` does NOT centre the box on `y`, and the comment below that says it
 * shares `addBox`'s call shape is true only for w/h/d. `chamferBox` extrudes to
 * a total height h spanning [-c, h-c] and then translates by +(h/2 - c), so the
 * finished box spans:
 *
 *     bottom = y + h/2 - 2c        centre = y + h - 2c        top = y + 3h/2 - 2c
 *
 * Every slab in this venue therefore sits ABOUT HALF ITS OWN HEIGHT above where
 * its call reads. Short kit is unaffected (a 0.06 m paint bed moves 0.03 m), but
 * it is metres on anything tall, and it is why the r3 plate showed the name board
 * hanging four metres clear above its own lettering: `addToyLetters` uses
 * `addBox`, which really is centred, so a slab and a letter authored at the same
 * `y` land four metres apart. Verified by building the geometry and reading the
 * bounding box, not by reasoning about ExtrudeGeometry.
 *
 * The convention is NOT being changed. Two thousand meshes in this file and
 * `port.js` were authored by eye against captures and are correct on screen;
 * re-centring them would move the whole venue. Use the three helpers below when
 * a new object has to register with something that is not a slab.
 */
export function slabChamfer(w, h, d, chamfer = 0.045) {
  return Math.max(0.006, Math.min(chamfer, w * 0.3, h * 0.3, d * 0.3));
}

/** `y` to pass `addSlab` so the box's top face lands exactly on `topY`. */
export function slabTopAt(w, h, d, chamfer, topY) {
  return topY - h * 1.5 + 2 * slabChamfer(w, h, d, chamfer);
}

/** `y` to pass `addSlab` so the box's centre lands exactly on `centreY`. */
export function slabCentreAt(w, h, d, chamfer, centreY) {
  return centreY - h + 2 * slabChamfer(w, h, d, chamfer);
}

/** Chamfered box mesh. Origin is not the centre — see the block above. */
export function addSlab(group, w, h, d, mat, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(chamferBox(w, h, d, opts.chamfer ?? 0.045), mat);
  mesh.position.set(x, y, z);
  if (opts.rotX) mesh.rotation.x = opts.rotX;
  if (opts.rotY) mesh.rotation.y = opts.rotY;
  if (opts.rotZ) mesh.rotation.z = opts.rotZ;
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  if (opts.name) mesh.name = opts.name;
  noPick(mesh);
  group.add(mesh);
  return mesh;
}

/** One draw call for a repeated dressing part. Matrices are authored, not random. */
export function addInstances(group, geom, mat, placements, name) {
  if (!placements.length) return null;
  const mesh = new THREE.InstancedMesh(geom, mat, placements.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < placements.length; i += 1) {
    const it = placements[i];
    p.set(it.x ?? 0, it.y ?? 0, it.z ?? 0);
    e.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0);
    q.setFromEuler(e);
    s.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  noPick(mesh);
  group.add(mesh);
  return mesh;
}

/**
 * Every material now carries a map, a normal map or an authored environment
 * response. `envIntensityBase` is the sanctioned hook LightingRig reads: the
 * harbour asked for 0.92 by default and blew out to near-white paper, which was
 * the loudest single fault in the r0 plate.
 */
/**
 * ── THE SHADE FLOOR. NOTHING IN THIS VENUE MAY REACH (0,0,0). ──
 *
 * r4 measured 3.99% of the plate below luminance 8 against the three Monopoly
 * Plus references at 0.51-0.75%. The rig has since gained a hemisphere term,
 * which halved it to 1.76% — real, and still four times the references, because
 * a hemisphere floors a normal in proportion to how skyward it faces and the
 * offenders are all VERTICAL faces of near-black paint: a tug's boot band, a
 * barge's shade side, a row of tyre fenders. A surface at 0x1c1e22 facing away
 * from the key gets half a weak sky term and tone-maps to zero.
 *
 * The fix is per-material rather than a scene-wide ambient. Emissive adds a
 * fixed linear term wherever the surface appears, so it is invisible on a face
 * already lit to 0.8 and is the whole signal on a face at 0.0 — which is what a
 * fill light does. A flat ambient would have lifted the key-lit faces too and
 * washed out the form shading the critic banked at gate 1.
 *
 * The tint is the references' own: shade in MP-5 is a cool blue, never neutral
 * and never black.
 */
const SHADE_FLOOR = 0x16232e;

function floored(m, k = 1) {
  m.emissive = new THREE.Color(SHADE_FLOOR);
  m.emissiveIntensity = k;
  return m;
}

export function portMaterials(tex) {
  const T = tex ?? portTextures();
  const env = (m, base) => {
    m.userData.envIntensityBase = base;
    return m;
  };
  // P13-A8 item 7: the two family helpers take the MACRO maps. `T.paint` and
  // `T.steelWear` were 26-cell blotch fields — correct grain, no structure —
  // and R6 fault 8 is a structure finding, not a grain one.
  const painted = (color, extra = {}) => std(color, {
    roughness: 0.56,
    metalness: 0.1,
    map: T.paintWeather ?? T.paint ?? null,
    roughnessMap: T.paintChip ?? null,
    ...extra,
  });
  const worn = (color, extra = {}) => std(color, {
    roughness: 0.5,
    metalness: 0.34,
    map: T.steelWeld ?? T.steelWear ?? null,
    roughnessMap: T.steelBreakup ?? null,
    ...extra,
  });
  const mats = {
    tex: T,
    // r3 sampled the hero ship's weather deck at RGB 204,199,205 — a near-white
    // slab across the largest surface in the frame. The material was never pale;
    // a horizontal face under a key at intensity 4.8 simply blows out, and 0x3d
    // is not low enough to survive it. Both deck tones drop about a stop so the
    // pale hatch covers laid on them have something to read against.
    deck: floored(worn(0x24292e, { roughness: 0.88, metalness: 0.14 }), 0.9),
    deckDark: floored(worn(0x161a1e, { roughness: 0.9, metalness: 0.12 }), 1.0),
    // Working-craft deck plate. The ship decks above had to drop a stop to stop
    // the hero's weather deck blowing to white, but a 26 m barge deck at that
    // value is a black slab in the middle of the frame; this is the tone the
    // small craft use instead.
    plateDeck: floored(worn(0x50463c, { roughness: 0.9, metalness: 0.12 }), 0.7),
    steel: worn(0x848a90, { roughness: 0.42, metalness: 0.62, roughnessMap: T.steelScratch ?? null }),
    steelDark: floored(worn(0x40464c, {
      roughness: 0.38, metalness: 0.66, map: T.steelBloom ?? T.steelWear ?? null,
      roughnessMap: T.steelScratch ?? null,
    }), 0.75),
    steelPale: worn(0x8a9098, { roughness: 0.42, metalness: 0.7, roughnessMap: T.steelScratch ?? null }),
    steelWork: floored(worn(0x6a727a, {
      roughness: 0.48, metalness: 0.85,
      map: T.steelBloom ?? T.steelWear ?? null,
      roughnessMap: T.steelScratch ?? null,
    }), 0.7),
    glass: env(std(0x16283a, { roughness: 0.08, metalness: 0.72 }), 1.5),
    white: painted(0xf2f0e8, { roughness: 0.48 }),
    cream: painted(0xe8dfcc),
    orange: painted(0xe0621a, { roughness: 0.46 }),
    yellow: painted(0xf0b414, { roughness: 0.35, metalness: 0.55, roughnessMap: T.paintChip ?? null }),
    yellowDark: painted(0xc98c0c, { roughness: 0.35, metalness: 0.55, roughnessMap: T.paintChip ?? null }),
    yellowPale: painted(0xffd257, { roughness: 0.35, metalness: 0.55, roughnessMap: T.paintChip ?? null }),
    redBoot: painted(0x8f1d15, { roughness: 0.5, normalMap: T.hullPlate ?? null }),
    blueHull: painted(0x18509a, {
      roughness: 0.38, metalness: 0.16, map: T.hullFrame ?? T.paint ?? null,
      normalMap: T.hullPlate ?? null,
    }),
    blackHull: floored(painted(0x272c33, {
      roughness: 0.46, metalness: 0.2, normalMap: T.hullPlate ?? null,
    }), 1.1),
    tankerHull: floored(painted(0x272c33, {
      roughness: 0.44, metalness: 0.22, map: T.hullFrame ?? T.paint ?? null,
      normalMap: T.hullPlate ?? null,
    }), 1.1),
    navyHull: floored(painted(0x233046, {
      roughness: 0.42, metalness: 0.18, map: T.hullFrame ?? T.paint ?? null,
      normalMap: T.hullPlate ?? null,
    }), 0.85),
    spiritRed: floored(std('#2a0305', {
      roughness: 0.9, metalness: 0.0, normalMap: T.hullPlate ?? null,
    }), 0.9),
    spiritStripe: new THREE.MeshBasicMaterial({ color: '#c51420', toneMapped: false }),
    spiritBlue: painted(0x1a3a7a, {
      roughness: 0.42, metalness: 0.12, normalMap: T.hullPlate ?? null,
    }),
    hiVis: painted('#e6b01a', { roughness: 0.55, metalness: 0.1 }),
    hardhat: std('#f5d818', { roughness: 0.42, metalness: 0.1 }),
    grey: worn(0x8f959d, { roughness: 0.46, metalness: 0.28 }),
    greyDark: worn(0x5e656e, { roughness: 0.5, metalness: 0.3 }),
    greyLight: worn(0xb8bcc2, { roughness: 0.42, metalness: 0.24 }),
    hullGrey: worn(0x8f959d, {
      roughness: 0.46, metalness: 0.28, normalMap: T.hullPlate ?? null,
    }),
    hullGreyDark: worn(0x5e656e, {
      roughness: 0.5, metalness: 0.3, normalMap: T.hullPlate ?? null,
    }),
    soot: floored(std(0x212328, { roughness: 0.72, metalness: 0.14 }), 1.0),
    rubber: floored(std(0x30333a, { roughness: 0.94, metalness: 0.03 }), 1.0),
    concrete: std(0xb9b5ab, {
      roughness: 0.95, metalness: 0.03,
      map: T.apronWear ?? T.concreteAgg ?? T.concrete ?? null,
      roughnessMap: T.concreteJoints ?? null,
    }),
    concreteDark: std(0x8e8a80, {
      roughness: 0.95, metalness: 0.04,
      map: T.apronWear ?? T.concreteAgg ?? T.concrete ?? null,
      roughnessMap: T.concreteJoints ?? null,
    }),
    concreteWet: std(0x6d6a63, { roughness: 0.68, metalness: 0.06, map: T.concrete ?? null }),
    concreteWork: std(0xb4b0a6, {
      roughness: 0.95, metalness: 0.02,
      map: T.apronWear ?? T.concreteAgg ?? T.concrete ?? null,
      roughnessMap: T.concreteJoints ?? null,
    }),
    apronDark: floored(std('#3b4247', { roughness: 0.97, metalness: 0.02, map: T.asphalt ?? null }), 0.7),
    apronMid: std('#4a5157', { roughness: 0.95, metalness: 0.02, map: T.asphalt ?? null }),
    cope: std(0xc6c2b7, {
      roughness: 0.95, metalness: 0.04,
      map: T.apronWear ?? T.concreteAgg ?? T.concrete ?? null,
      roughnessMap: T.concreteJoints ?? null,
    }),
    tank: painted(0xf4f2eb, { roughness: 0.52, metalness: 0.08 }),
    tankWeld: painted(0xf7f4ea, { roughness: 0.28, metalness: 0.34 }),
    tankBand: painted(0x1d4f86, { roughness: 0.48, metalness: 0.12 }),
    bootWet: painted(0x243038, { roughness: 0.3, metalness: 0.18 }),
    waterlineStrake: floored(painted(0x14181e, { roughness: 0.4, metalness: 0.16 }), 1.05),
    grease: floored(std(0x1a1c1e, { roughness: 0.88, metalness: 0.04 }), 0.9),
    armGloss: painted(0xf2f0e8, { roughness: 0.3, metalness: 0.12 }),
    lamp: std(0xfff0c0, {
      roughness: 0.3, metalness: 0.1, emissive: 0xffd98a, emissiveIntensity: 0.85,
    }),
    beacon: std(0xff3a24, {
      roughness: 0.35, metalness: 0.1, emissive: 0xff2a10, emissiveIntensity: 1.15,
    }),
    lifeboat: painted(0xe8761a, { roughness: 0.48 }),
    pool: env(std(0x3d92d4, { roughness: 0.22, metalness: 0.14 }), 1.1),
    rust: std(0xc07b3a, { roughness: 0.88, metalness: 0.14, map: T.rust ?? null }),
    rustDark: floored(std(0x6e4a30, { roughness: 0.9, metalness: 0.16, map: T.rust ?? null }), 0.7),
    ballast: std(0x8e8880, { roughness: 0.98, metalness: 0.02, map: T.sleepers ?? null }),
    hazard: std(0xffffff, { roughness: 0.62, metalness: 0.06, map: T.hazard ?? null }),
    brick: std(0xa8654a, { roughness: 0.9, metalness: 0.02, map: T.concrete ?? null }),
    grass: std(0x51702f, { roughness: 0.96, metalness: 0.0 }),
    lineWhite: new THREE.MeshStandardMaterial({
      color: 0xf6f4ec, roughness: 0.72, metalness: 0.0,
    }),
    lineYellow: new THREE.MeshStandardMaterial({
      color: 0xf2c419, roughness: 0.7, metalness: 0.0,
    }),
    containers: [
      painted(0xe05a12, { roughness: 0.56, metalness: 0.1, normalMap: T.corrugation ?? null }),
      painted(0x1b64bc, { roughness: 0.54, metalness: 0.1, normalMap: T.corrugation ?? null }),
      painted(0x1f8450, { roughness: 0.56, metalness: 0.1, normalMap: T.corrugation ?? null }),
      painted(0xd8a608, { roughness: 0.54, metalness: 0.1, normalMap: T.corrugation ?? null }),
      painted(0xba2320, { roughness: 0.56, metalness: 0.1, normalMap: T.corrugation ?? null }),
      painted(0x148a86, { roughness: 0.54, metalness: 0.1, normalMap: T.corrugation ?? null }),
      painted(0xe6e2d6, { roughness: 0.52, metalness: 0.1, normalMap: T.corrugation ?? null }),
      painted(0x6f4a2c, { roughness: 0.6, metalness: 0.1, normalMap: T.corrugation ?? null }),
      painted(0x8e3c86, { roughness: 0.55, metalness: 0.1, normalMap: T.corrugation ?? null }),
      floored(painted(0x37474f, { roughness: 0.58, metalness: 0.1, normalMap: T.corrugation ?? null }), 0.7),
    ],
  };
  // A cladding normal map turns a plain shed wall into ribbed steel sheeting.
  mats.cladWhite = std(0xeeece4, {
    roughness: 0.42, metalness: 0.18, map: T.paint ?? null, normalMap: T.cladding ?? null,
    roughnessMap: T.paintChip ?? null,
  });
  mats.cladBlue = floored(std(0x1d4f86, {
    roughness: 0.42, metalness: 0.18, map: T.paint ?? null, normalMap: T.cladding ?? null,
    roughnessMap: T.paintChip ?? null,
  }), 0.7);
  mats.cladRed = floored(std(0x9a231d, {
    roughness: 0.44, metalness: 0.16, map: T.paint ?? null, normalMap: T.cladding ?? null,
    roughnessMap: T.paintChip ?? null,
  }), 0.8);
  // Welded plate, for anything that floats. Distinct from `clad*` above, which is
  // ribbed sheeting and belongs on sheds.
  const plate = (color, extra = {}) => std(color, {
    roughness: 0.5, metalness: 0.14, map: T.paint ?? null, normalMap: T.plating ?? null, ...extra,
  });
  mats.plateWhite = plate(0xeeece4);
  mats.plateCream = plate(0xe4dccb, { roughness: 0.54 });
  mats.plateRed = floored(plate(0x9a231d, { roughness: 0.52, metalness: 0.12 }), 0.8);
  mats.plateBlue = floored(plate(0x1d4f86, { roughness: 0.5 }), 0.7);
  mats.hullSteel = std(0xf4f2ec, {
    roughness: 0.44, metalness: 0.2, normalMap: T.hullPlate ?? null,
  });
  // Harbour body — deliberately unlit.
  //
  // Three rounds were lost to this surface. A probe that forced the basin to
  // pure red rendered as washed pink, which is the whole diagnosis: a large
  // white specular and IBL term sits on top of whatever albedo the water has,
  // so a lit material could not hold a sea colour at this grazing camera. Both
  // failures came from that. r1's plaid was pure specular through a tiled
  // normal map; r2 and r3's "wet concrete" was that same white term over an
  // albedo crushed to near-black in the attempt to fight it.
  //
  // MeshBasicMaterial takes the vertex colour and nothing else, so the swell
  // shading, the depth ramp and the sun glitter are all baked into the buffer
  // in `addHarbourBasin` where they can be reasoned about exactly.
  //
  // r4 adds one map on top of that. `MeshBasicMaterial` multiplies map by vertex
  // colour, and the film is authored as a LINEAR multiplier centred near 0.82
  // (no `srgb` flag, so a canvas byte is the multiplier directly), which the
  // basin's colour bake compensates for. The vertex buffer carries what the
  // 6.8 m grid can hold — depth, swell shading, wind banding — and the film
  // carries the metre-scale chop and glitter the grid cannot resolve, at no
  // triangle cost.
  mats.harbourWater = new THREE.MeshBasicMaterial({
    vertexColors: true,
    color: 0xffffff,
    map: T.waterFilm ?? null,
  });
  // Wind streaks laid on the basin as geometry. Unlit, like the basin, so they
  // cannot pick up the specular term that cost r1 and r2 their surface.
  // ── BOARD-AAA r1: THESE TWO COLOURS ARE THE HARBOUR'S COLOUR NOW. ──
  //
  // `fringe:port-harbour:surface` is hidden by `OCEAN.hiddenPortWater`, so the
  // basin is the one-ocean sheet seen THROUGH these streaks. That makes the
  // chop a repaint, not a texture, and the repaint was the whole of the "wet
  // concrete, not sea" reading: measured on `port-waterline-tight`, the sheet
  // under the dressing reads HSV saturation 232 and the dressed band reads 87.
  //
  // The mechanism is the one the glint lerp in `addHarbourBasin` showed, one
  // layer up. `0xc7e2da` is a near-neutral pale at saturation 28, and alpha
  // compositing is a linear lerp: 5,800 instances over a 242 x 148 m wedge is
  // ~1.6 layers, and at opacity 0.7 through the radial `contact` alpha (mean
  // ~0.26 over the quad) that is ~26% of every water pixel. Pushed through the
  // live transfer — `solarProfile(0.42).grade` through `bakeGradeLut`, AgX at
  // BASE_EXPOSURE — over the measured one-ocean buffer (0.0109, 0.1283, 0.1522):
  //
  //   bare sheet                                  s230
  //   r6      0xc7e2da / 0x0d2c3a  at 26%         s72     (plate measures 87)
  //   0x9fdfe4 / 0x0d2c3a          at 26%         s103
  //   SHIPPED 0x5ac8d7 / 0x0a3741  at 26%         s165
  //
  // against Monopoly Plus 1's pond at 141. Both stops are now a lighter and a
  // darker version of the sheet's own hue, so the streaks read as crest and
  // trough on one sea instead of painting a second, greyer one over it.
  // Geometry, count and opacity are untouched here — the density taper that
  // ends the layer at the breakwater lives in `addWaterChop`, with its reason.
  //
  // ── P13-A11: AND THIS LAYER STAYS UNDER THE SEA. IT IS NOT A DECAL. ──
  // A11 lifted every water decal in the venue above the ocean's renderOrder and
  // then had to decide what this layer is. Measured, it is not dressing: a
  // projection of every instance through the hero camera
  // (`shots-A11-wip/chop-probe.mjs`, `quay-hero`, screen point 160,272) finds
  // **37 crest quads and 31 trough quads whose screen box covers that ONE
  // pixel**. Alpha compositing at 68 layers deep saturates at the stop whatever
  // the per-quad alpha is — 1 − (1 − a)³⁷ is 0.99 at a = 0.12 — so above the sea
  // the field stops being a texture and becomes paint, and the plate shows
  // exactly that: `a11wip2/3/4-quay-hero` carry a near-white cyan ribbon across
  // the basin that survived 0.7 → 0.30 → 0.15 unchanged and only moved when the
  // STOP moved. Three plates to establish that the alpha was never the lever.
  //
  // Drawn UNDER the sea it is what it was designed to be: the basin's paint,
  // seen through a translucent shader surface that puts its own foam, normals
  // and sun path on top. That is also why the calibration above works — "26 % of
  // every water pixel" is what 5,800 instances come to when the sea is still
  // over them. So the numbers, the tone and the geometry are the board-water
  // lane's, unchanged, and `CHOP_ORDER` in port.js states the exception with
  // this reason so the next pass does not lift it as an oversight.
  mats.chopPale = new THREE.MeshBasicMaterial({
    color: 0x5ac8d7,
    transparent: true,
    opacity: 0.7,
    alphaMap: T.contact ?? null,
    depthWrite: false,
    toneMapped: false,
  });
  mats.chopDark = new THREE.MeshBasicMaterial({
    color: 0x0a3741,
    transparent: true,
    opacity: 0.58,
    alphaMap: T.contact ?? null,
    depthWrite: false,
    toneMapped: false,
  });
  // Hull shadow: a silhouette, not an oval. See `hullShadowTexture`.
  mats.hullShade = new THREE.MeshBasicMaterial({
    // Cool, not black. Two of these stack under every hull (silhouette plus
    // core) and at 0.56 of 0x0b1a24 the pair composited to a hole in the water.
    color: 0x123240,
    transparent: true,
    opacity: 0.46,
    alphaMap: T.hullShade ?? null,
    depthWrite: false,
    toneMapped: false,
  });
  // Displacement halo. A hull that meets a flat plane through one hard edge is
  // parked, not floating. This is the same silhouette as `hullShade`, laid wider
  // than the beam and much weaker, so the water darkens gradually into the hull
  // the way MP-1's pond darkens into its rocky bank.
  mats.hullWet = new THREE.MeshBasicMaterial({
    color: 0x0f3746,
    transparent: true,
    opacity: 0.3,
    alphaMap: T.hullShade ?? null,
    depthWrite: false,
    toneMapped: false,
  });
  // P13-A10 item 3. The contact shadow that sits UNDER a hull rather than
  // down-sun of it. See `addHullContact` for why this is a multiply and why
  // 0.32 is the number: the water under a hull can never fall below 0.68 of
  // what it was, which is the brief's ≤ 0.35 alpha stated as the thing it
  // actually controls. `premultipliedAlpha` is mandatory — without it three
  // r185 logs an error and leaves the blend func unset, and the decal paints
  // as an opaque plate (the same trap `waterShadowMat` in port.js records).
  mats.hullContact = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.32,
    alphaMap: T.hullContact ?? null,
    // P16-PM8 item 2 / LAW 6A: the plate is `contactPatchGeometry` now and its
    // border vertices carry alpha zero, so the fade exists with no canvas. The
    // map stays and the two multiply together.
    vertexColors: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    premultipliedAlpha: true,
    blending: THREE.MultiplyBlending,
  });
  mats.harbourShallow = env(std(0x2c6a6d, { roughness: 0.6, metalness: 0.05 }), 0.4);
  // ── P13-A11: 0.4 WAS A WEAK FILM UNDER THE SEA AND IS A STIPPLE OVER IT. ──
  // Same cause as the chop: every foam strip in the venue sat at renderOrder 3,
  // under the ocean's 5. Lifted, the blob field lands at full strength, and
  // `a11wip1-quay-hero` at 1.9x reads as salt-and-pepper dither round every
  // hull — 2 to 3 px specks at 1:1, which is the "scattered polystyrene" read
  // `foamTexture`'s own note records fixing once already. Two levers, both
  // aimed at putting the grain back under the resolving limit: the tile is
  // smaller (see `tiledFoam`) so a blob is sub-pixel at the hero camera, and
  // the film is weaker so what survives is a haze rather than dots.
  mats.foam = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.0,
    transparent: true,
    opacity: 0.26,
    alphaMap: T.foam ?? null,
    depthWrite: false,
  });
  // Waterline collar and its wetted band. See `collarTexture`.
  // 0.42 was likewise set while the ribbon was under the sea. Above it, a 0.94 x
  // len collar at 0.42 welds into the painted white line R4 fault 8 named.
  mats.collar = new THREE.MeshBasicMaterial({
    color: 0xf4fbfb,
    transparent: true,
    opacity: 0.30,
    alphaMap: T.collar ?? null,
    depthWrite: false,
    toneMapped: false,
  });
  mats.wetBand = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: T.wetBand ?? null,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    toneMapped: false,
    // See the note on the water-shadow material in port.js: three r185 refuses
    // MultiplyBlending without this and leaves the blend func unset.
    premultipliedAlpha: true,
    blending: THREE.MultiplyBlending,
  });
  mats.contact = new THREE.MeshBasicMaterial({
    color: 0x1a242e,
    transparent: true,
    opacity: 0.46,
    alphaMap: T.contact ?? null,
    depthWrite: false,
    toneMapped: false,
  });
  /* ── P16-PM5B item 6 — AO UNDER A FOOT IS A MULTIPLY, NOT A GREY WASH. ──
   * `mats.contact` is alpha-blended at 0.46, so over a bright apron it lays a
   * flat slate tint that reads as paint rather than as darkening — which is
   * why crane-close F8 and quay-hero F10 both call "no contact darkening under
   * the crane feet" on an apron that already carries a patch. A multiply pass
   * scales what is under it instead of covering it, so the joint lines and the
   * wear survive through the shadow and the shadow reads as occlusion.
   * `premultipliedAlpha` is required or three r185 leaves the blend func unset. */
  mats.contactAO = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: T.contactAO ?? null,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    toneMapped: false,
    premultipliedAlpha: true,
    blending: THREE.MultiplyBlending,
  });
  mats.chainlink = new THREE.MeshStandardMaterial({
    color: 0xb6bcc2,
    roughness: 0.6,
    metalness: 0.42,
    transparent: true,
    alphaMap: T.chainlink ?? null,
    alphaTest: T.chainlink ? 0.42 : 0,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
  mats.chainlink.userData.envIntensityBase = 0.7;
  /**
   * ── P16-PM6 LAW 3 — THE FEATHER CONTRACT, DECLARED WHERE THE MAP IS. ──
   *
   * A canvas alpha map DOES NOT EXIST HEADLESS: `canvasTexture` returns null
   * with no `document`, so in node every material above reads `alphaMap: null`
   * and a build-time lint cannot tell a plate that fades out at its border from
   * one that stops dead. The first run of `p16-port-lint` listed 1,431 "straight
   * opaque edges on the harbour water" on exactly that basis and most of them
   * were feathered all along — the same trap PM5A recorded when its own decal
   * census reported 44 rectangles offline and 7 on the page.
   *
   * So the fade is DECLARED here, beside the map that provides it, and the law
   * reads the declaration. Only the maps that are drawn on a black canvas AND
   * clamped qualify: `contactTexture` (radial to black), `hullShadowTexture` and
   * `hullContactTexture` (a silhouette on black, `clamp: true`). `foam`,
   * `collar` and `wetBand` are REPEAT-wrapped — four straight edges by
   * construction, whatever the tile looks like — so they are not stamped, and a
   * plate wearing one has to carry its feather in the geometry, which is what
   * `foamPatchGeometry` is for.
   */
  for (const k of ['contact', 'chopPale', 'chopDark', 'hullShade', 'hullWet', 'hullContact']) {
    if (mats[k]) mats[k].userData.waterFeather = 'clamped-fade-to-black';
  }
  for (const k of ['redBoot', 'blueHull', 'blackHull', 'tankerHull', 'navyHull',
    'spiritRed', 'spiritBlue', 'hullGrey', 'hullGreyDark', 'hullSteel']) {
    if (mats[k]) mats[k].userData.hullPlatingNormal = 'hullPlate';
  }
  for (const k of ['plateWhite', 'plateCream', 'plateRed', 'plateBlue']) {
    if (mats[k]) mats[k].userData.hullPlatingNormal = 'plating';
  }
  return mats;
}

/* ───────────────────── P16-PM2: hulls are lofted, not stacked ───────────────────── */

/**
 * ── P16 LANE PM2 ITEM 1 — A HULL IS ONE SURFACE. ──
 *
 * The user's crane-close screenshot reads the hero ship's stern as "a stack of
 * blue slabs" and its deck as "a glossy tile grid", and both readings are
 * literal. Before this pass the merchant hull was 41 chamfered boxes: five
 * forebody sections each with its own boot band, a leaning stem blade, a
 * transom plate, three co-axial counter steps, a raked slab, a knuckle, two
 * quarter tucks, a transom band and a name-board ledge. Every one of them was
 * added to fix the previous one's silhouette, and the sum is a lasagne — from
 * any quarter view you count the layers instead of reading a hull.
 *
 * A stack of boxes can never be one massing, however many boxes you add. What
 * makes a hull one massing is that it is ONE SURFACE, so this is a loft:
 * a grid of points, levels running from the keel to the bulwark cap and
 * stations running from the transom to the stem, stitched into a closed shell.
 * The lines are stated once, in `merchantGrid`, and the same grid drives every
 * material band, so the boot, the load-line band, the topside and the deck are
 * pieces of one form rather than four boxes that nearly touch.
 *
 * `loftBand(levels, …)` builds the ring surface between two or more levels.
 * `loftCap(level, dir)` closes one level with a flat face — the flat of keel at
 * the bottom, the working deck at the top. Bands built off the SAME grid share
 * their boundary vertices exactly, so no seam can open between them and no
 * band can be authored at a height that another band has already covered.
 *
 * Cost, measured rather than assumed: 26 stations × 11 levels is 1,092
 * triangles for a whole hull including its bulwark and deck, against roughly
 * 2,100 for the 41 boxes it replaces (a chamfered box is ~52 triangles at
 * `bevelSegments: 1`). The rebuild is a triangle SAVING, which is what left
 * room under the +5 % ceiling for the other items in this lane.
 */
function loftRing(level) {
  // A level is I stations of [x, y, z] on the STARBOARD side (z ≥ 0). The ring
  // runs starboard transom → starboard stem, crosses at the stem, and returns
  // along the port side. Three quarter/centre points then carry the stern aft,
  // so closing the loop draws a curved counter instead of one flat slab.
  const I = level.length;
  const ring = new Array(I * 2 + 3);
  for (let i = 0; i < I; i += 1) ring[i] = level[i];
  for (let i = 0; i < I; i += 1) {
    const p = level[I - 1 - i];
    ring[I + i] = [p[0], p[1], -p[2]];
  }
  const stern = level[0];
  const round = Math.max(0.12, Math.min(1.2, stern[2] * 0.22 + 0.08));
  ring[I * 2] = [stern[0] - round * 0.72, stern[1], -stern[2] * 0.52];
  ring[I * 2 + 1] = [stern[0] - round, stern[1], 0];
  ring[I * 2 + 2] = [stern[0] - round * 0.72, stern[1], stern[2] * 0.52];
  return ring;
}

/**
 * Ring surface between consecutive levels. Winding is chosen so the normal
 * points outboard on both sides (verified on paper against the cross product
 * of the two quad edges, and on the plate: a flipped hull renders as a hole).
 */
export function loftBand(levels, opts = {}) {
  const rings = levels.map(loftRing);
  const J = rings.length;
  const N = rings[0].length;
  const pos = [];
  const uvs = [];
  const idx = [];
  // Girth arc length per ring for the V coordinate, so plating maps evenly.
  const girth = rings.map((r) => {
    const acc = [0];
    for (let k = 1; k <= N; k += 1) {
      const a = r[k - 1];
      const b = r[k % N];
      acc.push(acc[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    return acc;
  });
  const uScale = opts.uScale ?? 0.28;
  const vScale = opts.vScale ?? 0.28;
  for (let j = 0; j < J; j += 1) {
    for (let k = 0; k < N; k += 1) {
      const p = rings[j][k];
      pos.push(p[0], p[1], p[2]);
      uvs.push(girth[j][k] * uScale, p[0] * vScale);
    }
  }
  // `invert` flips the winding. The bulwark's INNER face is a band whose levels
  // descend rather than rise, so the consistent outward winding sends its normal
  // into the hull and the boat renders as an open shell you can see through —
  // which is exactly what the first pm2 quay-hero plate showed on the tender and
  // the punt. It is one flag, not a second geometry.
  const inv = opts.invert === true;
  for (let j = 0; j < J - 1; j += 1) {
    for (let k = 0; k < N; k += 1) {
      const k2 = (k + 1) % N;
      const a = j * N + k;
      const b = j * N + k2;
      const c = (j + 1) * N + k2;
      const d = (j + 1) * N + k;
      if (inv) idx.push(a, c, b, a, d, c);
      else idx.push(a, b, c, a, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/** Flat face closing one level: `dir` +1 faces up (a deck), −1 down (the keel). */
export function loftCap(level, dir = 1, opts = {}) {
  const I = level.length;
  const pos = [];
  const uvs = [];
  const idx = [];
  const uScale = opts.uScale ?? 0.28;
  for (let i = 0; i < I; i += 1) {
    const p = level[i];
    pos.push(p[0], p[1], p[2]);
    uvs.push(p[0] * uScale, p[2] * uScale);
  }
  for (let i = 0; i < I; i += 1) {
    const p = level[i];
    pos.push(p[0], p[1], -p[2]);
    uvs.push(p[0] * uScale, -p[2] * uScale);
  }
  // The side loft carries a three-point curved transom. Extend the cap over
  // that counter too; otherwise the old straight stern chord survives as an
  // exposed lid inside the new silhouette.
  const stern = level[0];
  const round = Math.max(0.12, Math.min(1.2, stern[2] * 0.22 + 0.08));
  const aft = [
    [stern[0] - round * 0.72, stern[1], -stern[2] * 0.52],
    [stern[0] - round, stern[1], 0],
    [stern[0] - round * 0.72, stern[1], stern[2] * 0.52],
  ];
  const a0 = pos.length / 3;
  for (const p of aft) {
    pos.push(p[0], p[1], p[2]);
    uvs.push(p[0] * uScale, p[2] * uScale);
  }
  for (let i = 0; i < I - 1; i += 1) {
    const s0 = i;
    const s1 = i + 1;
    const p0 = I + i;
    const p1 = I + i + 1;
    if (dir > 0) idx.push(s0, s1, p1, s0, p1, p0);
    else idx.push(s0, p1, s1, s0, p0, p1);
  }
  const transomTris = [[0, I, a0], [0, a0, a0 + 1], [0, a0 + 1, a0 + 2]];
  for (const [a, b, c] of transomTris) {
    if (dir > 0) idx.push(a, b, c); else idx.push(a, c, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}


export function loftMesh(group, geo, mat, name) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.ownsGeometry = true;
  if (name) mesh.name = name;
  noPick(mesh);
  group.add(mesh);
  return mesh;
}

/**
 * ── P16-PM2B ITEM 1 — A DECKHOUSE LEVEL IS AN ENCLOSED BLOCK. ──
 *
 * `casingLevels` gave one battered loft with the deck lines cut IN as reveals,
 * and that was the right answer to "four stacked slabs" — but a reveal is an
 * inset of 9 % of the half-breadth, which on a 6.4 m house is a 0.29 m recess,
 * and at the 26° crane-close polar a 0.29 m recess under a lit white face reads
 * as an OVERHANG with a dark underside. The eye counts terraces exactly as it
 * counted slabs. Two more things were literally open, and the gap census
 * measures both:
 *
 *   - the accommodation stair was four 0.86 × 0.05 m flights leaning on nothing,
 *     authored OUTBOARD of the aft face over the water, with no stringers and no
 *     enclosure: five pale plates with daylight between them, which is exactly
 *     the critic's "five separate floor plates with open air between them …
 *     there is no enclosing wall anywhere".
 *   - the window bands were `addBox` strips standing 0.02 m PROUD of a face
 *     whose plan the reveal had already stepped 0.29 m in, so at the reveal
 *     levels the glass floated clear of the wall it belonged to.
 *
 * A TIER here is one closed block: walls from its own floor to its own deck
 * (one loft band — a ray through it cannot come out the far side), the window
 * band as a flush 15 mm decal cut off the SAME plan rather than a box hung on
 * it, a deck edge with real thickness, and the deck that caps it. The tier above
 * steps in by at most `HOUSE_STEP_MAX` per side, so what sits between two tiers
 * is a walk-around, not a cantilevered plate with sky under it.
 */
const HOUSE_STEP_MAX = 0.6;

/** One superellipse ring of a house tier, in the `loftBand` half-level format. */
function houseRing(cx, y, hw, hd, stations = 7, k = 3.6) {
  const lv = [];
  for (let i = 0; i < stations; i += 1) {
    const t = i / (stations - 1);
    const ang = -Math.PI * 0.5 + t * Math.PI;
    const sx = Math.sin(ang);
    const sz = Math.cos(ang);
    const px = Math.sign(sx) * Math.abs(sx) ** (2 / k);
    const pz = Math.abs(sz) ** (2 / k);
    lv.push([cx + hw * px, y, Math.max(0.02, hd * pz)]);
  }
  return lv;
}

/**
 * One sculpted accommodation shell. `tiers` is still the authored profile, but
 * its steps are short sloping shoulders inside ONE loft instead of alternating
 * wall bands and floor plates. Individual inset panes break the glazing into
 * windows; nothing wraps around the whole house as a stripe.
 */
export function deckhouse(g, mats, opts) {
  const {
    x, y0, tiers, body, glass, deck: deckMat, name = 'house',
    stations = 7, k = 3.6, openWindowFrames = false,
  } = opts;
  const levels = [];
  const shellRings = [];
  const sideGlass = [];
  const sideFrames = [];
  const bridgeGlass = [];
  const bridgeFrames = [];
  let y = y0;
  let prevHw = null;
  let prevHd = null;
  let prevCx = null;
  for (let i = 0; i < tiers.length; i += 1) {
    const t = tiers[i];
    let hw = t.w * 0.5;
    let hd = t.d * 0.5;
    if (prevHw !== null) {
      // A tier may not step in more than 0.6 m per side, and may not step OUT
      // at all — an upper tier wider than the one under it is a proud plate by
      // another name.
      hw = Math.min(prevHw, Math.max(hw, prevHw - HOUSE_STEP_MAX));
      hd = Math.min(prevHd, Math.max(hd, prevHd - HOUSE_STEP_MAX));
    }
    const cx = x + (t.dx ?? 0);
    // Fold the former deck-edge thickness into the wall height. Overall house
    // height and downstream seats stay fixed without retaining a tier plate.
    const h = t.h + (t.edge ?? 0.16);
    const bat = t.batter ?? 0.05;
    const topHw = Math.max(0.06, hw - bat);
    const topHd = Math.max(0.06, hd - bat);
    const bottomHw = prevHw ?? hw;
    const bottomHd = prevHd ?? hd;
    const bottomCx = prevCx ?? cx;
    if (i === 0) shellRings.push(houseRing(cx, y, bottomHw, bottomHd, stations, k));
    const topY = y + h;
    // There is deliberately no second ring just above a level break. Joining
    // the previous crown straight to this crown fairs the whole storey into a
    // continuous battered casing; a short shoulder here is a terrace in the
    // crane-close silhouette, even when it belongs to one BufferGeometry.
    shellRings.push(houseRing(cx, topY, topHw, topHd, stations, k));
    levels.push({ i, cx, hw: topHw, hd: topHd, bottomCx, bottomHw, bottomHd, y0: y, y1: topY });

    if (t.windows !== false) {
      const sill = y + h * (t.sill ?? 0.36);
      const head = y + h * (t.head ?? 0.74);
      const panelH = Math.max(0.22, head - sill - 0.08);
      const panelY = (sill + head) * 0.5;
      const panelF = (panelY - y) / h;
      const panelCx = bottomCx + (cx - bottomCx) * panelF;
      const panelHd = Math.max(0.06, bottomHd + (topHd - bottomHd) * panelF);
      const panelHw = Math.max(0.06, bottomHw + (topHw - bottomHw) * panelF);
      const nPane = Math.max(2, Math.min(7, Math.floor((topHw * 2) / 1.05)));
      const pitch = (topHw * 1.48) / nPane;
      const panelW = Math.max(0.30, pitch - 0.14);
      for (const sgn of [-1, 1]) {
        for (let p = 0; p < nPane; p += 1) {
          const px = panelCx + (p - (nPane - 1) * 0.5) * pitch;
          // One dark recess cassette sits behind each slightly smaller glass
          // pane. Its exposed perimeter is the four-sided frame, without four
          // overlapping boxes at every corner. This preserves the 100 mm frame
          // read while removing 75% of the repeated window geometry.
          sideFrames.push({
            x: px, y: panelY, z: sgn * (panelHd + 0.075),
            sx: panelW + 0.16, sy: panelH + 0.20, sz: 1,
          });
          sideGlass.push({
            x: px, y: panelY, z: sgn * (panelHd + 0.09), sx: panelW, sy: panelH, sz: 1,
          });
        }
      }
      if (i === tiers.length - 1) {
        const nFront = Math.max(2, Math.min(5, Math.floor((topHd * 2) / 0.85)));
        const frontPitch = (topHd * 1.45) / nFront;
        const frontW = Math.max(0.28, frontPitch - 0.13);
        for (let p = 0; p < nFront; p += 1) {
          const pz = (p - (nFront - 1) * 0.5) * frontPitch;
          bridgeFrames.push({
            x: panelCx + panelHw + 0.075, y: panelY, z: pz,
            sx: 1, sy: panelH + 0.20, sz: frontW + 0.16,
          });
          bridgeGlass.push({
            x: panelCx + panelHw + 0.09, y: panelY, z: pz, sx: 1, sy: panelH, sz: frontW,
          });
        }
      }
    }

    // Preserve every old semantic name as a non-drawing compatibility node.
    // Animation, selectors and old captures can still resolve them, while the
    // geometry census can prove no tier plate or wrapping stripe survives.
    for (const suffix of ['wall', 'wall-lower', 'wall-mid', 'wall-upper', 'windows', 'deck-edge', 'deck']) {
      const retired = new THREE.Group();
      retired.name = `${name}:t${i}:${suffix}`;
      retired.userData.retiredVisual = true;
      g.add(retired);
    }
    prevHw = topHw;
    prevHd = topHd;
    prevCx = cx;
    y = topY;
  }
  const shell = loftMesh(g, loftBand(shellRings), body, `${name}:sculpted-shell`);
  shell.userData.singleSculptedShell = true;
  shell.userData.continuousCasing = true;
  shell.userData.profileRings = shellRings.length;
  loftMesh(g, loftCap(shellRings[0].slice(0, stations), -1),
    opts.foot ?? mats.steelDark ?? deckMat ?? body, `${name}:foot`);
  loftMesh(g, loftCap(shellRings[shellRings.length - 1].slice(0, stations), 1),
    deckMat ?? mats.deckDark ?? body, `${name}:roof`);

  const windowMat = glass ?? mats.glass;
  // The container house's former "frame" was a solid box in front of its
  // glass. Four perimeter members now leave the pane exposed. Seat each pane
  // against the *emitted* rounded casing, not the rectangular tier half-depth:
  // the end panes otherwise stand as much as 0.32 m clear of the shell.
  // Other deckhouse callers retain their exact original geometry.
  let sideFrameParts = sideFrames;
  let bridgeFrameParts = bridgeFrames;
  if (openWindowFrames) {
    // Window placements above are in deckhouse-local coordinates. The actual
    // shell may already have a transformed port parent, so probe its geometry
    // through an unattached identity mesh instead of mixing local rays with
    // shell.matrixWorld. This allocates no drawn part or independent geometry.
    const shellProbe = new THREE.Mesh(shell.geometry, body);
    shellProbe.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const shellFace = (axis, px, py, pz, sgn = 1) => {
      if (axis === 'z') ray.set(new THREE.Vector3(px, py, sgn * 20),
        new THREE.Vector3(0, 0, -sgn));
      else ray.set(new THREE.Vector3(20, py, pz), new THREE.Vector3(-1, 0, 0));
      ray.near = 0; ray.far = 40;
      const hits = [];
      // kit's noPick deliberately disables gameplay raycasts. This local CPU
      // construction probe leaves that override and live render state intact.
      THREE.Mesh.prototype.raycast.call(shellProbe, ray, hits);
      if (!hits.length) throw new Error(`${name}: casing misses window reveal`);
      hits.sort((a, b) => a.distance - b.distance);
      return axis === 'z' ? Math.abs(hits[0].point.z) : hits[0].point.x;
    };
    sideFrameParts = [];
    for (let i = 0; i < sideGlass.length; i += 1) {
      const pane = sideGlass[i], frame = sideFrames[i];
      const sign = Math.sign(pane.z);
      const contact = (sx, sy) => shellFace('z', pane.x + sx, pane.y + sy, 0, sign);
      const glassFaces = [];
      const frameFaces = [];
      for (const dx of [-pane.sx * 0.5, 0, pane.sx * 0.5])
        for (const dy of [-pane.sy * 0.5, 0, pane.sy * 0.5]) glassFaces.push(contact(dx, dy));
      for (const dx of [-frame.sx * 0.5, 0, frame.sx * 0.5])
        for (const dy of [-frame.sy * 0.5, 0, frame.sy * 0.5]) frameFaces.push(contact(dx, dy));
      const paneFront = Math.max(...glassFaces) + 0.025;
      const frameFront = paneFront + 0.0125;
      const depth = frameFront - Math.min(...frameFaces) + 0.025;
      pane.z = sign * (paneFront - 0.0275);
      const z = sign * (frameFront - depth * 0.5);
      const halfH = pane.sy * 0.5, halfW = pane.sx * 0.5;
      for (const ySign of [-1, 1]) sideFrameParts.push({
        x: pane.x, y: pane.y + ySign * (halfH + 0.05), z,
        sx: frame.sx, sy: 0.10, sz: depth,
      });
      for (const xSign of [-1, 1]) sideFrameParts.push({
        x: pane.x + xSign * (halfW + 0.04), y: pane.y, z,
        sx: 0.08, sy: pane.sy, sz: depth,
      });
    }
    bridgeFrameParts = [];
    for (let i = 0; i < bridgeGlass.length; i += 1) {
      const pane = bridgeGlass[i], frame = bridgeFrames[i];
      const contact = (sy, sz) => shellFace('x', 0, pane.y + sy, pane.z + sz);
      const glassFaces = [];
      const frameFaces = [];
      for (const dy of [-pane.sy * 0.5, 0, pane.sy * 0.5])
        for (const dz of [-pane.sz * 0.5, 0, pane.sz * 0.5]) glassFaces.push(contact(dy, dz));
      for (const dy of [-frame.sy * 0.5, 0, frame.sy * 0.5])
        for (const dz of [-frame.sz * 0.5, 0, frame.sz * 0.5]) frameFaces.push(contact(dy, dz));
      const paneFront = Math.max(...glassFaces) + 0.025;
      const frameFront = paneFront + 0.0125;
      const depth = frameFront - Math.min(...frameFaces) + 0.025;
      pane.x = paneFront - 0.0275;
      const x = frameFront - depth * 0.5;
      const halfH = pane.sy * 0.5, halfW = pane.sz * 0.5;
      for (const ySign of [-1, 1]) bridgeFrameParts.push({
        x, y: pane.y + ySign * (halfH + 0.05), z: pane.z,
        sx: depth, sy: 0.10, sz: frame.sz,
      });
      for (const zSign of [-1, 1]) bridgeFrameParts.push({
        x, y: pane.y, z: pane.z + zSign * (halfW + 0.04),
        sx: depth, sy: pane.sy, sz: 0.08,
      });
    }
  }
  if (sideGlass.length) {
    addInstances(g, new THREE.BoxGeometry(1, 1, 0.055), windowMat, sideGlass,
      `${name}:window-recess:side-glass`);
    addInstances(g, openWindowFrames ? new THREE.BoxGeometry(1, 1, 1) : new THREE.BoxGeometry(1, 1, 0.11), body, sideFrameParts,
      `${name}:window-recess:side-frames`);
  }
  if (bridgeGlass.length) {
    addInstances(g, new THREE.BoxGeometry(0.055, 1, 1), windowMat, bridgeGlass,
      `${name}:bridge:recessed-glass`);
    addInstances(g, openWindowFrames ? new THREE.BoxGeometry(1, 1, 1) : new THREE.BoxGeometry(0.11, 1, 1), body, bridgeFrameParts,
      `${name}:bridge:window-frames`);
  }
  if (!g.userData.houseCensus) g.userData.houseCensus = [];
  g.userData.houseCensus.push({
    name, levels, shell: shell.name, drawableTierParts: 0,
    profileRings: shellRings.length,
    windowPanels: sideGlass.length, bridgePanels: bridgeGlass.length,
  });
  return { top: y, levels };
}

/**
 * A member that states where it starts and where it finishes. `port.js` has the
 * same helper; `ships.js` is a leaf module (three / kit / shore only — importing
 * `port.js` back would close a cycle), so it carries its own twelve lines rather
 * than reaching for that one.
 */
export function strut(g, mat, from, to, w, d = w, chamfer = 0.03) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  if (len < 1e-4) return null;
  const pivot = new THREE.Group();
  pivot.position.copy(from);
  pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const mesh = new THREE.Mesh(chamferBox(w, len, d, chamfer), mat);
  mesh.position.y = -(len * 0.5 - 2 * slabChamfer(w, len, d, chamfer));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.ownsGeometry = true;
  noPick(mesh);
  pivot.add(mesh);
  g.add(pivot);
  return pivot;
}

/**
 * A bridge wing is a CANTILEVER, and a cantilever shows what carries it.
 * One solid deck block with real thickness, a solid outboard bulwark instead of
 * a hairline rail, and two knee brackets down to the house side — which is the
 * answer to "a small white platform with railings hangs disconnected in mid-air
 * off the starboard side, attached to nothing".
 */
export function bridgeWing(g, mats, { x, y, z, out, len = 1.7, deckMat, wallMat }) {
  const sgn = Math.sign(z) || 1;
  const zc = z + sgn * out * 0.5;
  const dm = deckMat ?? mats.steelDark;
  const wm = wallMat ?? mats.white;
  addSlab(g, len, 0.26, out, dm, x, slabTopAt(len, 0.26, out, 0.04, y), zc, { chamfer: 0.04 });
  addSlab(g, len, 0.62, 0.2, wm, x, slabTopAt(len, 0.62, 0.2, 0.05, y + 0.62),
    z + sgn * (out - 0.08), { chamfer: 0.05 });
  for (const dx of [-len * 0.34, len * 0.34]) {
    strut(g, wm, new THREE.Vector3(x + dx, y - 1.15, z + sgn * 0.05),
      new THREE.Vector3(x + dx, y - 0.24, z + sgn * (out - 0.12)), 0.17, 0.17);
  }
}

/**
 * The lines of a merchant hull, stated once.
 *
 * `t` runs 0 (transom) → 1 (stem) with cosine bunching, so the ends — where the
 * form actually changes — carry the stations. Half-breadth is a function of `t`
 * and of the LEVEL, not of x: that is what gives a bow that flares (the topside
 * stays full further forward than the bottom does) and a counter stern whose
 * quarters carry beam over a run that has already fined away. The stem rakes
 * because each level's forward station sits at its own x.
 */
function merchantGrid(L, B, D, opts = {}) {
  // Thirty cosine-spaced stations replace PM8's 21: enough samples for the
  // sheer/flare/transom silhouette while leaving budget for geometry-backed
  // castings and twistlocks on every occupied container.
  const stations = opts.stations ?? 30;
  const wl = opts.waterline ?? WATER_Y;
  const bulwark = opts.bulwark ?? 0.52;
  const bulwarkT = opts.bulwarkT ?? 0.16;
  const deckBase = BOTTOM + D;
  const dr = Math.max(0.18, wl - BOTTOM);
  // Level heights, absolute. The two waterline levels are pinned to the float
  // line rather than to a fraction of the depth, so a shallow hull and a deep
  // one carry the same 0.10 m boot top and 0.12 m load-line band.
  const yLev = [
    BOTTOM,
    BOTTOM + dr * 0.16,
    BOTTOM + dr * 0.55,
    wl + 0.10,
    wl + 0.22,
  ];
  yLev.push(yLev[4] + (deckBase - yLev[4]) * 0.42);
  yLev.push(yLev[4] + (deckBase - yLev[4]) * 0.80);
  const TOP_HULL = yLev.length; // index of the sheer level
  const tA = 0.14;
  const tF = 0.70;
  const halfB = B * 0.5;
  // Girth: flat of keel, turn of bilge, then a vertical topside.
  const girth = (v) => (v <= 0.30 ? 0.10 + 0.90 * (v / 0.30) ** 0.62 : 1.0);
  const planAt = (t, v) => {
    if (t > tF) {
      const f = (t - tF) / (1 - tF);
      const p = 1.30 + 1.55 * (1 - Math.min(1, v / 0.55));
      return (1 - f) ** p;
    }
    if (t < tA) {
      const a = t / tA;
      const transom = 0.06 + 0.62 * Math.min(1, v / 0.75);
      return transom + (1 - transom) * a ** 1.35;
    }
    return 1;
  };
  // Sheer: the deck lifts at the ends only, so the cargo run stays dead flat.
  const sheer = (t) => {
    const f = Math.max(0, (t - 0.86) / 0.14);
    const a = Math.max(0, (0.09 - t) / 0.09);
    return D * (0.30 * f * f + 0.09 * a * a);
  };
  const xAt = (t, v) => {
    const aft = -L * (0.402 + 0.098 * Math.min(1, v));
    const fwd = L * (0.408 + 0.092 * Math.min(1, v));
    return aft + (fwd - aft) * t;
  };
  const level = (yFor, hbScale, extraY = 0) => {
    const out = [];
    for (let i = 0; i < stations; i += 1) {
      const t = 0.5 - 0.5 * Math.cos(Math.PI * (i / (stations - 1)));
      const y = yFor(t);
      const v = (y - BOTTOM) / D;
      const hb = halfB * planAt(t, v) * girth(Math.min(1, Math.max(0, v)));
      out.push([xAt(t, Math.min(1, Math.max(0, v))), y + extraY, Math.max(0.012, hb * hbScale)]);
    }
    return out;
  };
  const levels = yLev.map((y) => level(() => y, 1));
  // Sheer line, bulwark top (outer), bulwark top (inner), deck edge (inner).
  const sheerY = (t) => deckBase + sheer(t);
  levels.push(level(sheerY, 1));
  levels.push(level((t) => sheerY(t) + bulwark, 1));
  const inner = (yFn) => {
    const out = [];
    for (let i = 0; i < stations; i += 1) {
      const t = 0.5 - 0.5 * Math.cos(Math.PI * (i / (stations - 1)));
      const hb = halfB * planAt(t, 1) * girth(1);
      out.push([xAt(t, 1), yFn(t), Math.max(0.01, hb - bulwarkT)]);
    }
    return out;
  };
  levels.push(inner((t) => sheerY(t) + bulwark));
  levels.push(inner(sheerY));
  /**
   * The half-breadth the SHELL actually has at world x on the level whose
   * height fraction is `v`. Every piece of dressing takes its Z from here: the
   * hull is curved, so anything authored at `±B/2` floats clear of the plating
   * at the quarters, which is the fault class that put a fairlead three metres
   * off the bow in the a12before plates.
   */
  const hbAtX = (x, v = 1) => {
    const vc = Math.min(1, Math.max(0, v));
    const x0 = xAt(0, vc);
    const x1 = xAt(1, vc);
    const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
    return Math.max(0.05, halfB * planAt(t, vc) * girth(vc));
  };
  return {
    levels, deckBase, TOP_HULL, sheerY, xAt, planAt, halfB, stations, hbAtX, girth,
    curvedTransom: true, transomArcPoints: 3,
    // Band boundaries by level index, so a caller never guesses one.
    boot: [0, 1, 2, 3], band: [3, 4], topside: [4, 5, 6, TOP_HULL],
    bulwarkRows: [TOP_HULL, TOP_HULL + 1, TOP_HULL + 2, TOP_HULL + 3],
    deckLevel: TOP_HULL + 3,
    keelLevel: 0,
  };
}

/**
 * Build the four material bands of a lofted hull into `g`. Returns the grid so
 * the caller can hang deck kit off the same lines the shell was cut from.
 */
function buildLoftedHull(g, grid, mats, { hull, boot, band, deck, name = 'hull' }) {
  const L = grid.levels;
  const pick = (ix) => ix.map((i) => L[i]);
  loftMesh(g, loftBand(pick(grid.boot)), boot, `${name}:boot`);
  loftMesh(g, loftCap(L[grid.keelLevel], -1), boot, `${name}:keel`);
  loftMesh(g, loftBand(pick(grid.band)), band, `${name}:band`);
  loftMesh(g, loftBand(pick(grid.topside)), hull, `${name}:topside`);
  const bw = grid.bulwarkRows;
  loftMesh(g, loftBand([L[bw[0]], L[bw[1]]]), hull, `${name}:bulwark`);
  loftMesh(g, loftBand([L[bw[1]], L[bw[2]]]), hull, `${name}:bulwark-cap`);
  loftMesh(g, loftBand([L[bw[2]], L[bw[3]]], { invert: true }), hull, `${name}:bulwark-inner`);
  loftMesh(g, loftCap(L[grid.deckLevel], 1), deck, `${name}:deck`);
  return grid;
}

/**
 * ── P16-PM2 ITEM 1 — THE SMALL CRAFT GET THE SAME LAW. ──
 *
 * `port.js` built every tug, pilot boat, launch, punt, barge and dredger the
 * same way the merchant hull was built: a red slab for the topside, a white
 * slab a shade wider for the boot top, a black slab narrower again for the
 * bottom, then a fo'c'sle slab, a deck slab and two bulwark slabs — seven
 * co-axial boxes with three different beams. That is what the user's frames
 * read as "a gold tug's bow inside the container ship's bow": you cannot tell
 * where one hull stops because neither of them has a silhouette.
 *
 * `addCraftHull` is the same loft as the merchant one, sized off ABSOLUTE keel,
 * waterline and deck heights because the craft in `port.js` are seated on
 * `HARBOUR_Y`, not on `BOTTOM`. It returns the grid so a caller can put its
 * fenders, its rails and its deckhouse on the shell rather than at `±B/2`.
 */
export function craftGrid({
  L, B, keelY, deckY, waterlineY, bulwark = 0.34, bulwarkT = 0.12,
  stations = 18, transomK = 0.74, bowFine = 1.55, sheerK = 0.16,
}) {
  const depth = Math.max(0.4, deckY - keelY);
  const dr = Math.max(0.12, waterlineY - keelY);
  const yLev = [
    keelY,
    keelY + dr * 0.30,
    waterlineY - 0.04,
    waterlineY + 0.10,
  ];
  yLev.push(yLev[3] + (deckY - yLev[3]) * 0.55);
  const TOP = yLev.length;
  const halfB = B * 0.5;
  const tA = 0.10;
  const tF = 0.58;
  const girth = (v) => (v <= 0.34 ? 0.16 + 0.84 * (v / 0.34) ** 0.55 : 1.0);
  const planAt = (t, v) => {
    if (t > tF) {
      const f = (t - tF) / (1 - tF);
      const p = bowFine * (1 + 0.9 * (1 - Math.min(1, v / 0.6)));
      return (1 - f) ** p;
    }
    if (t < tA) {
      const a = t / tA;
      const tr = transomK * Math.min(1, 0.35 + v);
      return tr + (1 - tr) * a ** 1.2;
    }
    return 1;
  };
  const sheer = (t) => {
    const f = Math.max(0, (t - 0.72) / 0.28);
    const a = Math.max(0, (0.12 - t) / 0.12);
    return depth * sheerK * (1.35 * f * f + 0.4 * a * a);
  };
  const xAt = (t, v) => {
    const aft = -L * (0.46 + 0.04 * Math.min(1, v));
    const fwd = L * (0.40 + 0.10 * Math.min(1, v));
    return aft + (fwd - aft) * t;
  };
  const sheerY = (t) => deckY + sheer(t);
  const level = (yFn, shrink = 0) => {
    const out = [];
    for (let i = 0; i < stations; i += 1) {
      const t = 0.5 - 0.5 * Math.cos(Math.PI * (i / (stations - 1)));
      const y = yFn(t);
      const v = Math.min(1, Math.max(0, (y - keelY) / depth));
      const hb = halfB * planAt(t, v) * girth(v) - shrink;
      out.push([xAt(t, v), y, Math.max(0.01, hb)]);
    }
    return out;
  };
  const levels = yLev.map((y) => level(() => y));
  levels.push(level(sheerY));
  levels.push(level((t) => sheerY(t) + bulwark));
  levels.push(level((t) => sheerY(t) + bulwark, bulwarkT));
  levels.push(level(sheerY, bulwarkT));
  const hbAtX = (x, v = 1) => {
    const vc = Math.min(1, Math.max(0, v));
    const x0 = xAt(0, vc);
    const x1 = xAt(1, vc);
    const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
    return Math.max(0.04, halfB * planAt(t, vc) * girth(vc));
  };
  return {
    levels, TOP, xAt, hbAtX, sheerY, halfB, stations, deckY, keelY,
    curvedTransom: true, transomArcPoints: 3,
    boot: [0, 1, 2], band: [2, 3], topside: [3, 4, TOP], bulwarkRows: [TOP, TOP + 1, TOP + 2, TOP + 3],
    deckLevel: TOP + 3, keelLevel: 0,
  };
}

/** One lofted small-craft shell: boot, boot-top band, topside, bulwark, deck. */
export function addCraftHull(g, mats, opts) {
  const grid = craftGrid(opts);
  const L = grid.levels;
  const pick = (ix) => ix.map((i) => L[i]);
  const name = opts.name ?? 'craft';
  const sourceHullMat = opts.hull ?? mats.plateRed;
  const needsPlateNormal = !sourceHullMat.userData.hullPlatingNormal;
  const hullMat = needsPlateNormal ? sourceHullMat.clone() : sourceHullMat;
  if (needsPlateNormal) {
    hullMat.normalMap = mats.tex?.hullPlate ?? null;
    hullMat.userData.hullPlatingNormal = 'hullPlate';
    hullMat.needsUpdate = true;
  }
  loftMesh(g, loftBand(pick(grid.boot)), opts.boot ?? mats.blackHull, `${name}:boot`);
  loftMesh(g, loftCap(L[grid.keelLevel], -1), opts.boot ?? mats.blackHull, `${name}:keel`);
  loftMesh(g, loftBand(pick(grid.band)), opts.band ?? mats.white, `${name}:band`);
  loftMesh(g, loftBand(pick(grid.topside)), hullMat, `${name}:topside`);
  const bw = grid.bulwarkRows;
  loftMesh(g, loftBand([L[bw[0]], L[bw[1]]]), hullMat, `${name}:bulwark`);
  loftMesh(g, loftBand([L[bw[1]], L[bw[2]]]), hullMat, `${name}:bulwark-cap`);
  loftMesh(g, loftBand([L[bw[2]], L[bw[3]]], { invert: true }), hullMat, `${name}:bulwark-inner`);
  loftMesh(g, loftCap(L[grid.deckLevel], 1), opts.deck ?? mats.deck, `${name}:deck`);
  if (!g.userData.craftHullCensus) g.userData.craftHullCensus = [];
  g.userData.craftHullCensus.push({
    name, stations: grid.stations, curvedTransom: grid.curvedTransom,
    transomArcPoints: grid.transomArcPoints,
    platingNormalBand: hullMat.userData.hullPlatingNormal ?? null,
  });
  return grid;
}

function pipeX(g, r, len, mat, x, y, z) {
  return addCyl(g, r, r, len, 8, mat, x, y, z, { rotZ: HALF_PI });
}

function pipeZ(g, r, len, mat, x, y, z) {
  return addCyl(g, r, r, len, 8, mat, x, y, z, { rotX: HALF_PI });
}

function boxMat(mats, seed, i) {
  const n = mats.containers.length;
  return mats.containers[Math.floor(seedUnit(seed, `c:${i}`) * n) % n];
}



/** Deck railing down both flanks: stanchions plus two rails, instanced. */
/**
 * ── P16-PM2 (critic C8) — NOTHING HAIRLINE. ──
 * 60 mm stanchions and 45 mm rails resolve to 0.7 px at the play camera and
 * 0.9 px at crane-close, which is what the audit reads as "hairline railings
 * floating above the plate": a sub-pixel member cannot anti-alias, so it
 * flickers on and off between frames instead of drawing. The section is 2.5×
 * heavier — and PM9 takes the post to 160 mm, the top rail to 150 mm and the
 * knee rail to 130 mm so the near-pose census clears its new 4 px floor.
 */
function addDeckRail(g, mat, x0, x1, z, y, pitch = 1.5, h = 0.42) {
  const len = Math.abs(x1 - x0);
  const n = Math.max(2, Math.round(len / pitch) + 1);
  const posts = [];
  const feet = [];
  for (let i = 0; i < n; i += 1) {
    const px = x0 + (x1 - x0) * (i / (n - 1));
    posts.push({ x: px, y: y + h * 0.5, z });
    feet.push({ x: px, y: y + 0.03, z });
  }
  // The heavier 160 mm post is its own foot at this scale; a separate foot
  // plate per stanchion cost 2.4 k triangles across the venue for 0.3 px.
  void feet;
  addInstances(g, chamferBox(0.16, h, 0.16, 0.04), mat, posts);
  addSlab(g, len, 0.15, 0.15, mat, (x0 + x1) * 0.5, y + h - 0.05, z, { chamfer: 0.04 });
  addSlab(g, len, 0.13, 0.13, mat, (x0 + x1) * 0.5, y + h * 0.55, z, { chamfer: 0.035 });
}

/**
 * ── P16-PM8 ITEM 2 / LAW 6A — THE CONTACT DECAL WAS A QUAD. ──
 *
 * `hullContactTexture`'s ramp is honest and it is a MAP, and a map is null in
 * node — so every headless census in this project has measured the contact
 * decal as a plain four-vertex rectangle up to 47 × 11 m lying on the harbour,
 * and could not tell it apart from the plate PM5A removed. Worse, the ramp's
 * outermost fill runs at k = 1.00, which is the canvas border, so even in the
 * browser the plate ends on a one-texel step rather than at zero.
 *
 * Nineteen vertices on the hull's own plan: a border at alpha zero, the same
 * plan shrunk by `inset` at alpha one, and a centre. The shape and the fade are
 * both geometry, they survive with no canvas, and the plate has no straight
 * edge and no corner anywhere. The map stays on the material as well, so what
 * the browser draws is the silhouette ramp INSIDE a shape that already dies at
 * its own border — the two agree, and neither is load-bearing alone.
 *
 * The plan table is `hullFootprint`'s in `port.js`, at unit length and beam.
 * Duplicated rather than imported because `port.js` imports THIS file.
 */
const CONTACT_PATCH = { geo: null };
function contactPatchGeometry() {
  if (CONTACT_PATCH.geo) return CONTACT_PATCH.geo;
  const bow = 0.34;
  const hl = 0.5;
  const hb = 0.5;
  const plan = [
    [hl, 0], [hl * (1 - bow * 0.5), hb * 0.82], [hl * 0.42, hb],
    [-hl * 0.72, hb], [-hl, hb * 0.66], [-hl, -hb * 0.66],
    [-hl * 0.72, -hb], [hl * 0.42, -hb], [hl * (1 - bow * 0.5), -hb * 0.82],
  ];
  const inset = 0.28;
  const n = plan.length;
  // Baked into XZ the way the `PlaneGeometry(1, 1).rotateX(-PI/2)` it replaces
  // was, so `addHullContact`'s scale(len, 1, beam) and rotation.y are unchanged.
  const verts = [0, 0, 0];
  const uvs = [0.5, 0.5];
  const cols = [1, 1, 1, 1];
  for (const [px, pz] of plan) { verts.push(px * (1 - inset), 0, pz * (1 - inset)); uvs.push(px + 0.5, pz + 0.5); cols.push(1, 1, 1, 1); }
  for (const [px, pz] of plan) { verts.push(px, 0, pz); uvs.push(px + 0.5, pz + 0.5); cols.push(1, 1, 1, 0); }
  const idx = [];
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    idx.push(0, 1 + j, 1 + i);
    idx.push(1 + i, 1 + j, 1 + n + j);
    idx.push(1 + i, 1 + n + j, 1 + n + i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 4));
  geo.setIndex(idx);
  CONTACT_PATCH.geo = geo;
  return geo;
}

/**
 * ── P13-A10 item 3 — THE CONTACT SHADOW UNDER EVERY HULL. ──
 *
 * A9 residual 2, restated by the brief: "at d 140 the barge / tug / lighter have
 * a dark surround but no cast shadow tint on the water". What they have is
 * `addVesselShadow`'s swept silhouette — a hull-plan polygon thrown down-sun —
 * and at the hero pose that polygon is thrown clear of the hull, so the WATER
 * DIRECTLY UNDER THE HULL, where a floating object's darkest contact lives, is
 * untouched. A boat with no contact under it is a boat printed on the sea.
 *
 * This is the missing term: a decal seated ON the hull's own plan, elongated
 * along it, barely offset down-sun so it stays under the boat rather than
 * beside it. Three properties matter and each is a deliberate choice:
 *
 *   MULTIPLY, not alpha. With `premultipliedAlpha` three sets the blend func to
 *   (DST_COLOR, ONE_MINUS_SRC_ALPHA), so the result is `src·dst + dst·(1−a)`.
 *   With a black source that is exactly `dst · (1 − a)`: the water is scaled,
 *   never tinted, so a decal over dark water and the same decal over foam both
 *   darken by the same FACTOR. A flat alpha wash paints the same grey onto both
 *   and reads as a sticker.
 *   ALPHA ≤ 0.35. The brief's ceiling, and it is the real one: at `opacity`
 *   0.32 the darkest the water can go under a hull is 0.68 of what it was.
 *   DEPTH-TESTED. `depthTest` stays on (only `depthWrite` is off), so a hull
 *   sitting over its own decal occludes it instead of the decal painting over
 *   the plating.
 *
 * The alpha map is the hull silhouette `hullShadowTexture` already draws — the
 * shape with the penumbra that reaches full strength a fifth of the beam inside
 * the outline — so the decal has no edge of its own to see, which is the trap
 * MC3-6 caught A7 in with a rectangular wetted plate.
 */
export function addHullContact(group, mats, opts = {}) {
  const mat = mats.hullContact;
  if (!mat) return null;
  const len = Math.max(0.5, opts.len ?? 10);
  const beam = Math.max(0.4, opts.beam ?? 4);
  // P16-PM2 (PM1 hand-off): the quad is clamped to the hull outline + 1 m on
  // every side. `grow` alone is a ratio, so a long hull grew its decal by
  // metres — the warship's plate measured 27.6 m against an 18.3 m hull.
  const quadLen = Math.min(len * (opts.grow ?? 1.10), len + 2);
  const quadBeam = Math.min(beam * (opts.growBeam ?? 1.20), beam + 2);
  const sun = mats.sun;
  // A contact shadow is not a cast shadow: it stays UNDER the hull. The throw is
  // a fixed small fraction of the beam, not `height × sun.reach`, so a 40 m ship
  // and a 4 m punt both keep their decal seated.
  const throwM = Math.min(1.6, beam * 0.16);
  const dx = (sun?.dx ?? 0) * throwM;
  const dz = (sun?.dz ?? 0) * throwM;
  const mesh = new THREE.Mesh(contactPatchGeometry(), mat);
  // `hullFootprint`'s convention: rotation.y = t maps local (1,0,0) to
  // (cos t, 0, −sin t), so the decal's length axis lies on the hull's.
  mesh.rotation.y = opts.yaw ?? 0;
  // The patch is baked into XZ, so the second scale term is Y (nothing) and
  // the beam rides on Z. Scaling y here is the silent way to draw a 1 m decal.
  mesh.scale.set(quadLen, 1, quadBeam);
  mesh.position.set((opts.x ?? 0) + dx, opts.y ?? 0.2, (opts.z ?? 0) + dz);
  // ── THE RENDER ORDER IS THE WHOLE ITEM, AND IT COST FIVE PROBE PLATES. ──
  // The decal was invisible at renderOrder 2 and a FULL-strength black multiply
  // moved the hero frame by 0.03 luma, which is not "subtle" — it is not drawn.
  // The cause is not depth and not the blend: `nature:water:ocean` is a
  // TRANSPARENT ShaderMaterial at renderOrder 5 with `depthWrite: true`, and
  // `nature:water:beach-foam` sits at 6. Three sorts the transparent list by
  // renderOrder before depth, so anything on the water below 6 is drawn first
  // and then painted over by the sea itself. Measured, one variable per plate
  // (`shots-A10-wip/iso-probe.mjs`, tug box mean luma delta): ro 2 → 0.00,
  // polygonOffset −64 → 4.12, depthTest off → 22.1, ro 10000 → 0.35.
  //
  // P13-A11: that finding is now the venue's law rather than this decal's
  // exception — see `waterOrder` above. A contact is the water DARKENING under
  // a hull, so it belongs on the shade layer with the cast shadow and the lee,
  // under the wetted band and well under the foam. A10's absolute 7 put it on
  // top of every one of them, which was right only while it was the one decal
  // that drew at all.
  mesh.renderOrder = opts.renderOrder ?? waterOrder(1);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  if (opts.name) mesh.name = `${opts.name}:contact-shadow`;
  if (mesh.userData) mesh.userData.pickable = false;
  group.add(mesh);
  return mesh;
}

const FOAM_TILES = new Map();

/** Foam whose alpha repeats at a fixed world scale, so froth never stretches. */
export function tiledFoam(mats, w, d) {
  if (!mats.foam?.alphaMap) return mats.foam;
  // P13-A11: 3.2 m a tile, not 5. `foamTexture` draws blobs of radius 1.1–4.2
  // on a 256 px tile, so at 5 m and the hero camera's 16 px/m a blob is 2.6
  // screen pixels — over the resolving limit, and the plate reads as dither. At
  // 3.2 m it is 1.7 px and the field reads as froth again. Nothing about the
  // texture changes; this is the world scale it is sampled at.
  const rx = Math.max(1, Math.round(w / 3.2));
  const ry = Math.max(1, Math.round(d / 3.2));
  const key = `${rx}x${ry}`;
  if (FOAM_TILES.has(key)) return FOAM_TILES.get(key);
  const m = mats.foam.clone();
  m.alphaMap = mats.foam.alphaMap.clone();
  m.alphaMap.wrapS = THREE.RepeatWrapping;
  m.alphaMap.wrapT = THREE.RepeatWrapping;
  m.alphaMap.repeat.set(rx, ry);
  m.alphaMap.needsUpdate = true;
  m.needsUpdate = true;
  FOAM_TILES.set(key, m);
  return m;
}

/**
 * ── P16-PM6 LAW 3 — A PLATE WHOSE FADE IS IN ITS OWN CORNERS. ──
 *
 * Nine vertices, four-component colour: white everywhere, alpha zero on the
 * eight border vertices and one in the middle. Three.js reads a four-component
 * `color` attribute as vec4, so this multiplies the material's own alpha down
 * to nothing at the plate's boundary and leaves the tile untouched at its
 * centre — the map keeps its froth, and the plate has no edge to find.
 *
 * PM5A put the same feather into `foamPatchGeometry` in `port.js` and it retired
 * the straight terminations on every hull-water plate that file builds. This is
 * the twin that survived, one module up: `addWaterlineFoam` is `ships.js`'s own
 * plate builder, and it was laying two 36 m straight bars and a 7 m bow card on
 * open water under every big hull in the venue — the last thirteen entries in
 * the P16-PM6 decal list. Vertex alpha rather than PM5A's black-on-additive,
 * because these plates keep `mats.foam`'s alpha blending and its tone: a black
 * border on an alpha-blended material paints black instead of nothing.
 */
const FEATHER_QUAD = { geo: null };
/**
 * ── P16-PM7 item 3 — EXPORTED, BECAUSE THE RUNTIME BUILDERS NEED IT TOO. ──
 * `addDepartWake` in `port/port-vehicles.js` laid seven straight `PlaneGeometry`
 * quads on open water at runtime, which is this exact fault class one module
 * across and invisible to a static census. It uses this geometry now rather than
 * a second copy of it, so there is one feather in the venue and the lint has one
 * thing to check.
 */
export function featherQuadGeometry() {
  if (FEATHER_QUAD.geo) return FEATHER_QUAD.geo;
  const N = 2;
  const verts = [];
  const uvs = [];
  const cols = [];
  for (let r = 0; r <= N; r += 1) {
    for (let c = 0; c <= N; c += 1) {
      const u = c / N;
      const v = r / N;
      verts.push(u - 0.5, v - 0.5, 0);
      uvs.push(u, v);
      const inner = (c > 0 && c < N && r > 0 && r < N) ? 1 : 0;
      cols.push(1, 1, 1, inner);
    }
  }
  const idx = [];
  for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N; c += 1) {
      const a = r * (N + 1) + c;
      idx.push(a, a + 1, a + N + 2, a, a + N + 2, a + N + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 4));
  geo.setIndex(idx);
  FEATHER_QUAD.geo = geo;
  return geo;
}

const FOAM_TILES_FEATHERED = new Map();
/** `tiledFoam`, with the vertex-alpha feather switched on. Cached separately so
 *  the flat-plate callers keep the material they were calibrated against. */
function tiledFoamFeathered(mats, w, d) {
  const base = tiledFoam(mats, w, d);
  if (!base || base === mats.foam) return base;
  const key = `${Math.max(1, Math.round(w / 3.2))}x${Math.max(1, Math.round(d / 3.2))}`;
  if (FOAM_TILES_FEATHERED.has(key)) return FOAM_TILES_FEATHERED.get(key);
  const m = base.clone();
  m.alphaMap = base.alphaMap;
  m.vertexColors = true;
  m.needsUpdate = true;
  FOAM_TILES_FEATHERED.set(key, m);
  return m;
}

function addBulb(g, hull, L, B) {
  addSphere(g, Math.min(0.72, B * 0.12), 8, hull, L * 0.492, WATER_Y - 0.12, 0, { scaleY: 0.58 });
  addSphere(g, Math.min(0.42, B * 0.07), 8, hull, L * 0.51, WATER_Y - 0.02, 0, { scaleY: 0.46 });
}


/**
 * ── P16-PM2B ITEM 1 — THE FUNNEL IS A CASING, NOT A DRUM. ──
 *
 * Three co-axial `CylinderGeometry`s at one radius is a drum, and the critic's
 * F10 reads it as one: "the funnel top is a flat dark ellipse with no cap or
 * uptake", and the decal on its tangent warps because a cylinder has no flat to
 * put a name on. A funnel casing is a raked, rounded-rectangular box: longer
 * fore-and-aft than athwart, narrowing as it rises, leaning aft over its own
 * height, with a rim standing proud of the top and the uptake sunk inside it.
 * `r` and `h` keep their meaning for every existing caller.
 */
function funnel(g, body, band, cap, x, y, z, r, h) {
  // `loftRing` closes a level by mirroring it about z = 0, so a funnel off the
  // centreline (the Spirit carries a pair) is built ON the centreline inside its
  // own group and the group is moved. Building it at z directly would put the
  // port half at −z.
  const f = new THREE.Group();
  f.name = 'funnel';
  f.position.z = z;
  noPick(f);
  g.add(f);
  const rake = h * 0.17;
  const at = (t, hx, hz, dy = 0) => houseRing(x - rake * t, y + h * t + dy, r * hx, r * hz, 7, 3.0);
  loftMesh(f, loftBand([at(0, 1.28, 0.95), at(0.55, 1.14, 0.88), at(0.84, 1.03, 0.83)]), body,
    'funnel:casing');
  loftMesh(f, loftBand([at(0.84, 1.03, 0.83), at(1, 1.00, 0.81)]), band, 'funnel:band');
  // The rim stands proud of the casing and the uptake is sunk inside it, so the
  // top is a modelled mouth rather than the flat dark ellipse the critic reads.
  loftMesh(f, loftBand([at(1, 1.00, 0.81), at(1, 1.09, 0.89), at(1, 1.09, 0.89, 0.17)]), cap,
    'funnel:rim');
  loftMesh(f, loftBand([at(1, 1.09, 0.89, 0.17), at(1, 0.90, 0.66, 0.17)]), cap, 'funnel:rim-cap');
  loftMesh(f, loftBand([at(1, 0.90, 0.66, 0.17), at(1, 0.86, 0.60, -0.14)], { invert: true }), cap,
    'funnel:uptake');
  loftMesh(f, loftCap(at(1, 0.86, 0.60, -0.14), 1), cap, 'funnel:mouth');
  return f;
}

/**
 * ── P16-PM2B ITEM 1 — ONE ENCLOSED BLOCK PER LEVEL. ──
 *
 * PM2 replaced four stacked decks with one battered casing and cut the deck
 * lines IN as reveals. That removed the proud pale plates and it is why the
 * house now reads as one silhouette at range — but at the 26° crane-close polar
 * a 0.09-of-half-breadth reveal is a 0.29 m recess, and a 0.29 m recess under a
 * sunlit white face is an overhang with a dark underside. The critic's verdict
 * on that plate is unchanged in kind: "five separate floor plates with open air
 * between them and daylight visible straight through the gaps".
 *
 * Two of the three things the eye was reading were literally open, and the gap
 * census measures them:
 *
 *   - the accommodation stair — four 0.86 × 0.05 m flights leaning on nothing,
 *     authored 0.3 m OUTBOARD of the aft face over the water, with no stringers
 *     between them. Five pale plates with sea visible between them, on the
 *     quarter the crane-close camera looks straight at.
 *   - the window bands — `addBox` strips 0.02 m proud of a plan the reveals had
 *     already stepped 0.29 m in, so at two of the four levels the glass stood
 *     clear of the wall it belonged to.
 *
 * Now: `deckhouse` builds each level as a closed block — walls floor to deck,
 * the window band flush as a decal, a deck edge with thickness and a deck that
 * caps it — stepping in ≤ 0.6 m per side per level. The stair is an enclosed
 * tower INSIDE the house plan. The bridge has wings that show their brackets.
 * The roof is the dark deck material, not the brightest rectangle in the frame
 * (PM2 RESIDUAL 1). The funnel is a shaped casing.
 */
function aftHouse(g, mats, { x, deckY, B, decks, w, body, accent, stack = true, name = 'house', openWindowFrames = false }) {
  const d = B * 0.8;
  const lower = mats.greyLight ?? mats.cream ?? body;
  const tierH = 0.80;
  const edge = 0.12;
  const tiers = [];
  for (let i = 0; i < decks; i += 1) {
    tiers.push({
      w: w - i * 0.30,
      d: d - i * 0.34,
      h: tierH,
      edge,
      mat: i === 0 ? lower : body,
      windows: i > 0,
    });
  }
  const bridgeW = Math.max(2.4, w - decks * 0.30 - 0.5);
  const bridgeD = Math.max(2.4, d - decks * 0.34);
  tiers.push({
    w: bridgeW, d: bridgeD, h: 1.0, edge: 0.16, mat: mats.white,
    sill: 0.20, head: 0.84, dx: w * 0.05,
  });
  const house = deckhouse(g, mats, {
    x, y0: deckY + 0.04, tiers, body, glass: mats.glass,
    deck: mats.deckDark ?? mats.steelDark, name, openWindowFrames,
  });
  const bridgeLev = house.levels[house.levels.length - 1];
  const bridgeY = bridgeLev.y0;
  const bridgeTop = house.top;
  const houseH = bridgeTop - deckY;

  // ── the stair tower: INSIDE the plan, enclosed, with one door ──
  const towX = x - w * 0.5 + 0.62;
  const towTop = house.levels[Math.max(0, decks - 1)].y1;
  addSlab(g, 1.15, towTop - deckY - 0.04, d * 0.30, mats.steelDark, towX,
    slabTopAt(1.15, towTop - deckY - 0.04, d * 0.30, 0.06, towTop + 0.22), 0, { chamfer: 0.06 });
  addSlab(g, 0.09, 1.05, 0.7, mats.greyLight ?? mats.white, towX - 0.6,
    slabTopAt(0.09, 1.05, 0.7, 0.03, deckY + 1.15), 0, { chamfer: 0.03 });

  // ── bridge wings, with the knees that carry them ──
  const wingZ = bridgeLev.hd + 0.06;
  const wingOut = Math.max(0.8, B * 0.46 - wingZ);
  for (const sgn of [1, -1]) {
    bridgeWing(g, mats, {
      x: x + w * 0.05, y: bridgeY + 0.26, z: sgn * wingZ, out: wingOut,
      len: Math.min(2.1, bridgeW * 0.42), deckMat: mats.deckDark ?? mats.steelDark,
      wallMat: mats.white,
    });
  }

  // Grime out of the deck scuppers: the vertical rhythm that stops white paint
  // reading as a white box, at a tenth of the triangles the butt straps cost.
  // P16-PM2B: seated on the TIER the streak runs down, not on `d · 0.46`. The
  // house steps in as it rises, so one run authored at the ground-tier plan
  // stood up to 0.5 m off the wall at the upper levels and read at crane-close
  // as a rank of orange posts standing in front of the accommodation.
  const grime = [];
  for (const lev of house.levels.slice(0, Math.min(2, house.levels.length))) {
    const gh = lev.y1 - lev.y0 - 0.16;
    for (let s = 0; s < 5; s += 1) {
      let gx = lev.cx - lev.hw * 0.62 + (s / 4) * lev.hw * 1.24;
      if (openWindowFrames && s === 2) {
        // The centre scupper streak crossed the middle pane of two storeys.
        // Keep the weathering on casing between panes, not painted over glass.
        const glazedLevel = house.levels[Math.min(lev.i + 1, house.levels.length - 1)];
        const nPane = Math.max(2, Math.min(7, Math.floor((glazedLevel.hw * 2) / 1.05)));
        gx += (glazedLevel.hw * 1.48 / nPane) * 0.5;
      }
      for (const sgn of [1, -1]) {
        grime.push({ x: gx, y: lev.y0 + 0.06 + gh * 0.5, z: sgn * (lev.hd - 0.02), sy: gh / 0.7 });
      }
    }
  }
  addInstances(g, chamferBox(0.12, 0.7, 0.03, 0.008), mats.rustDark ?? mats.rust,
    grime, `${name}:grime`);

  // ── the compass deck. The roof plate is already the dark deck material, so
  // what goes on it is kit rather than another pale plate: a radar mast at a
  // section that survives the play camera (0.24 m ≈ 3.8 px at crane-close
  // against the 0.16 m post's 2.5), one yard, and two uptake vents. ──
  addSlab(g, 1.35, 0.34, d * 0.26, accent ?? mats.orange, x + w * 0.15,
    slabTopAt(1.35, 0.34, d * 0.26, 0.05, bridgeTop + 0.34), 0, { chamfer: 0.05 });
  addSlab(g, 0.24, 2.6, 0.24, mats.steelPale, x - w * 0.06,
    slabTopAt(0.24, 2.6, 0.24, 0.05, bridgeTop + 2.6), 0, { chamfer: 0.05 });
  addSlab(g, 1.5, 0.16, 0.16, mats.steelPale, x - w * 0.06,
    slabTopAt(1.5, 0.16, 0.16, 0.04, bridgeTop + 2.3), 0, { chamfer: 0.04 });
  addSlab(g, 0.34, 0.34, 0.62, mats.steelDark, x - w * 0.06,
    slabTopAt(0.34, 0.34, 0.62, 0.06, bridgeTop + 2.9), 0, { chamfer: 0.06 });
  for (const dz of [d * 0.22, -d * 0.22]) {
    addCyl(g, 0.2, 0.24, 0.55, 8, mats.steelDark, x + w * 0.22, bridgeTop + 0.32, dz);
  }

  // ── one funnel, a raked casing, on the house's own centreline ──
  if (!stack) return { bridgeY, bridgeTop, houseH, d };
  funnel(g, mats.steelDark, mats.spiritRed ?? mats.orange, mats.soot ?? mats.steelDark,
    x - w * 0.22, bridgeTop + 0.08, 0, Math.min(d * 0.20, w * 0.24), 2.0);
  return { bridgeY, bridgeTop, houseH, d };
}

/**
 * ── P16-PM2 ITEM 1 — THE MERCHANT HULL IS ONE LOFTED SURFACE. ──
 *
 * What this replaced: 41 chamfered boxes. Five forebody sections each with its
 * own boot band and load-line strip, a leaning stem blade, a flush transom
 * plate, three co-axial counter steps, a raked slab at 0.30 rad, a knuckle, two
 * quarter tucks, a transom band, a name-board ledge and a pair of gunwales.
 * Every one of them was added to answer a previous round's silhouette fault and
 * the sum is what the user's crane-close screenshot reads as "a stack of blue
 * slabs": from any quarter you count layers instead of reading a hull.
 *
 * Now the shell is `merchantGrid` + `buildLoftedHull` — one set of lines, four
 * material bands cut off the SAME grid, so the boot, the load-line band, the
 * topside, the bulwark and the working deck are pieces of one form. The bow
 * flares because the topside plan stays full further forward than the bottom
 * does; the stem rakes because each level's forward station sits at its own x;
 * the counter carries beam over a run that has already fined away. None of
 * those is a box any more.
 *
 * Everything below the loft is DRESSING and obeys one law: nothing is placed at
 * `±B/2`. The hull is curved, so a strip authored at half the midship beam
 * floats three metres clear of the plating at the quarter. Dressing takes its Z
 * from `grid.hbAtX(x)` — the half-breadth the shell actually has at that x —
 * which is why the seams, the fairleads and the draft marks sit ON the hull at
 * the ends as well as amidships.
 */
function addMerchantHull(g, mats, {
  L, B, D, hull, boot, bulb = true, rail = true, waterline = WATER_Y,
}) {
  const grid = merchantGrid(L, B, D, { waterline, bulwark: 0.55, bulwarkT: 0.18 });
  buildLoftedHull(g, grid, mats, {
    hull,
    boot,
    band: mats.white ?? mats.steelPale,
    deck: mats.deckDark ?? mats.deck,
    name: 'hull',
  });
  const deckBase = grid.deckBase;
  const hb = grid.hbAtX;
  const sternX = grid.xAt(0, 1);
  const stemX = grid.xAt(1, 1);
  g.userData.hullGrid = grid;

  // Rubbing strake and boot-top weep: two thin runs that break the topside
  // without adding a second silhouette. Instanced along the parallel body only,
  // each piece taking its own Z off the shell.
  const strake = [];
  const sheerStrake = [];
  const weeps = [];
  const nRun = 26;
  for (let i = 0; i < nRun; i += 1) {
    const t = i / (nRun - 1);
    const x = sternX + (stemX - sternX) * (0.06 + t * 0.88);
    const half = hb(x, 1);
    const midY = (waterline + 0.30 + deckBase - 0.42) * 0.5;
    const midHalf = hb(x, (midY - BOTTOM) / D);
    for (const sgn of [1, -1]) {
      strake.push({ x, y: deckBase - 0.42, z: sgn * (half + 0.07) });
      sheerStrake.push({ x, y: midY, z: sgn * (midHalf + 0.05) });
      if (i % 5 === 2) weeps.push({ x, y: waterline + 0.55, z: sgn * (half + 0.04) });
    }
  }
  /* ── P16-PM7 — A STRAKE'S CHAMFER IS NEVER SEEN, AND IT COSTS 6,656. ──
   * `chamferBox` is 28 triangles against a plain box's 12, and Gate 1's chamfer
   * rule is about a razor corner the key light catches. On a 0.22 × 0.14 m band
   * running along a hull the chamfer is 0.05 m — a fifth of a pixel at
   * quay-hero's 96 m and under a pixel at every pose in the pack — and there are
   * 416 of these bands across the venue's hulls. The 6,656 triangles they were
   * spending on an invisible bevel are what pays for the 165 joint nodes four
   * consecutive audits have asked for. The strakes themselves are untouched:
   * same section, same count, same tone. */
  addInstances(g, new THREE.BoxGeometry((stemX - sternX) / nRun + 0.06, 0.22, 0.14),
    mats.steelDark, strake, 'hull:rubbing-strake');
  // A second strake at the boot-top's shoulder, so the topside is never a
  // 1.4 m blue plane between two lines (critic C6).
  addInstances(g, new THREE.BoxGeometry((stemX - sternX) / nRun + 0.06, 0.13, 0.1),
    mats.steelDark, sheerStrake, 'hull:sheer-strake');
  // PM9 class 3: plating belongs in the shell normal map. Upright seam rods
  // faceted the hull and remained sub-pixel even after two width increases.
  const retiredSeams = new THREE.Group();
  retiredSeams.name = 'hull:plate-seams';
  retiredSeams.userData.retiredVisual = true;
  g.add(retiredSeams);
  addInstances(g, chamferBox(0.16, 0.8, 0.07, 0.02), mats.rust ?? mats.rustDark, weeps,
    'hull:weeps');

  // Forecastle: the deck lifts forward in the loft, so the raised head is the
  // shell's own sheer plus a short break bulkhead — not a box on a box.
  const fcX = grid.xAt(0.90, 1);
  addSlab(g, 0.22, 0.62, hb(fcX, 1) * 1.9, hull, fcX, deckBase + 0.1, 0, { chamfer: 0.06 });

  // Rudder and propeller boss under the counter.
  addSlab(g, L * 0.035, D * 0.86, 0.3, mats.soot ?? mats.steelDark, sternX + L * 0.045,
    BOTTOM + 0.1, 0, { chamfer: 0.1 });
  addCyl(g, 0.5, 0.38, 1.5, 10, mats.soot ?? mats.steelDark, sternX + L * 0.085,
    BOTTOM + 0.5, 0, { rotZ: HALF_PI });
  if (bulb) addBulb(g, hull, L, B);

  // Anchors in their hawse pockets, and warping bitts, on the flare.
  const anchorX = grid.xAt(0.88, 1);
  const anchorZ = hb(anchorX, 0.82);
  for (const dz of [anchorZ, -anchorZ]) {
    addSlab(g, 0.9, 0.7, 0.12, mats.soot ?? mats.steelDark, anchorX,
      BOTTOM + D * 0.70, dz * 1.02, { chamfer: 0.05, rotY: Math.sign(dz) * 0.24 });
    addCyl(g, 0.16, 0.16, 0.7, 8, mats.steelDark, anchorX - L * 0.05,
      deckBase + 0.62, dz * 0.8);
  }

  // Draft marks at the quarter, on the shell. Each white tick has a slightly
  // larger dark steel pocket behind it, so the decal read is geometry-backed
  // and follows the changing half-breadth rather than floating on one plane.
  const draftX = grid.xAt(0.22, 0.5);
  const draftBacking = [];
  const draftMarks = [];
  for (const sgn of [1, -1]) {
    for (let i = 0; i < 7; i += 1) {
      const y = BOTTOM + 0.3 + i * 0.28;
      const v = Math.min(1, Math.max(0, (y - BOTTOM) / D));
      const shellZ = hb(draftX, v);
      draftBacking.push({ x: draftX, y, z: sgn * (shellZ + 0.045) });
      draftMarks.push({ x: draftX + (i % 2 ? 0.035 : -0.035), y, z: sgn * (shellZ + 0.095) });
    }
  }
  addInstances(g, new THREE.BoxGeometry(0.42, 0.15, 0.07), mats.steelDark,
    draftBacking, 'hull:draught-mark-backing');
  addInstances(g, new THREE.BoxGeometry(0.30, 0.08, 0.08), mats.white,
    draftMarks, 'hull:draught-marks');
  grid.platingNormalBand = 'hullPlate';
  grid.draughtMarkCount = draftMarks.length;
  grid.draughtBackingCount = draftBacking.length;

  if (rail) {
    const railX0 = grid.xAt(0.16, 1);
    const railX1 = grid.xAt(0.82, 1);
    const railZ = Math.min(hb(railX0, 1), hb(railX1, 1)) - 0.1;
    addDeckRail(g, mats.steelPale, railX0, railX1, railZ, deckBase + 0.5);
    addDeckRail(g, mats.steelPale, railX0, railX1, -railZ, deckBase + 0.5);
  }
  /* P16-PM10 A7 crane F2 / oil F1: this builder used to add three feathered
   * RECTANGLES around every merchant hull. `port.js` already supplies the
   * plan-shaped wet collar, contact, reflection and broken foam for the same
   * hull, so the legacy set was a second white U-shaped halo floating off the
   * plating. Zero is a live contract: water contact is hull-shaped upstream. */
  grid.legacyRectangularFoamPlates = 0;
  return deckBase + 0.12;
}

/**
 * ── P16-PM2 ITEM 4 — THE DECK CRANE GETS AN ENVELOPE. ──
 *
 * The a12before crane-close plate shows an orange bar running out of the
 * accommodation and stopping inside a FITTINGS box, and the pixel probe names
 * it: an unnamed `mats.orange` mesh 6.22 m across inside `fringe:ship:container`
 * — this jib. It never intersected a container (the probe reads the box 2.6 m
 * behind it), but it was authored as a bar PIVOTED AT ITS MIDDLE, hung at
 * `deckY + 3.8` with an inboard end 1.4 m over the working deck, and the stow
 * beside it stands 6.9 m above the same deck. A jib whose whole length lies
 * below the boxes it works reads as passing through them from every bearing
 * that matters, which is the fault the user actually named.
 *
 * The jib now pivots at its ROOT off a 5.6 m pedestal and slews outboard, so:
 *   • the pedestal stands clear of the bays in x (the caller places it in a gap);
 *   • the jib crosses the outer container row at 1.3 m above the highest tier;
 *   • the tip lands over the water, outboard of the beam, where a jib serving
 *     the hatch it stands beside actually points.
 * `envelope` is returned so the census can assert the clearance rather than
 * take it on trust.
 */
function addDeckCrane(g, mats, x, z, deckY, lean, opts = {}) {
  const crane = new THREE.Group();
  crane.name = opts.name ?? 'deck-crane';
  crane.position.set(x, deckY, z);
  crane.rotation.y = opts.slew ?? 0;
  noPick(crane);
  g.add(crane);
  const pivotY = opts.pivotY ?? 5.6;
  const jib = opts.jib ?? 7.4;
  addSlab(crane, 1.7, 0.14, 1.7, mats.steelDark, 0, 0.07, 0, { chamfer: 0.04 });
  addCyl(crane, 0.55, 0.68, 0.4, 10, mats.steelDark, 0, 0.34, 0);
  addCyl(crane, 0.44, 0.52, pivotY - 1.4, 10, mats.orange, 0, (pivotY - 1.4) * 0.5 + 0.3, 0);
  addSlab(crane, 1.2, 1.0, 1.4, mats.cream, 0, pivotY - 1.6, 0, { chamfer: 0.12 });
  addSlab(crane, 0.95, 0.5, 0.1, mats.glass, 0.62, pivotY - 1.5, 0.72, { chamfer: 0.03 });
  const arm = new THREE.Group();
  arm.position.set(0, pivotY, 0);
  arm.rotation.x = -lean;
  noPick(arm);
  crane.add(arm);
  addSlab(arm, 0.36, 0.36, jib, mats.orange, 0, -0.18, jib * 0.5, { chamfer: 0.07 });
  addSlab(arm, 0.24, 0.24, jib * 0.86, mats.orange, 0, 0.28, jib * 0.5, { chamfer: 0.05 });
  for (let i = 1; i < 5; i += 1) {
    addSlab(arm, 0.1, 0.62, 0.1, mats.steelDark, 0, 0.06, (i / 5) * jib, { chamfer: 0.02 });
  }
  addSlab(arm, 0.5, 0.34, 0.5, mats.steelDark, 0, -0.1, jib, { chamfer: 0.08 });
  // Hook falls hang from the tip, straight down in world space.
  const tipY = deckY + pivotY + Math.sin(lean) * jib;
  const tipZ = Math.cos(lean) * jib;
  // P16-PM2B ITEM 3 — the fall was a 70 mm wire (1.0 px at crane-close) and the
  // hook a 0.09 m plate. A rope nobody can resolve is a sparkling line; these
  // are a 150 mm fall and a hook block with a sheave case.
  /* ── P16-PM7 item 2 — THE HOOK BLOCK HUNG CLEAR OF ITS OWN SHEAVE CASE. ──
   * P16A3 Call 2 F4 reads a pole at oil-sea x 946 whose last pixel is y 496 with
   * the pale base resuming at y 504 — "a 7-pixel air gap between a member and its
   * own base plate". The pixel probe names it: this crane's fall, hook block and
   * sheave case. `addSlab` puts a box half its own height ABOVE the y it is
   * handed, so a hook authored at `−0.18` below the fall and a case at `−0.44`
   * were 0.13 m apart in a place the eye reads as one block on one wire. All
   * three are seated off the member above them now, by the same `slabTopAt` the
   * rest of the venue uses, so the assembly cannot come apart when `fall` moves.
   */
  const fall = Math.max(0.6, tipY - deckY - 1.2);
  const fallBot = tipY - deckY - fall;
  addCyl(crane, 0.075, 0.075, fall, 6, mats.steelPale, 0, fallBot + fall * 0.5, tipZ);
  const hookTop = fallBot + 0.06;
  addSlab(crane, 0.34, 0.42, 0.34, mats.steelDark, 0,
    slabTopAt(0.34, 0.42, 0.34, 0.07, hookTop), tipZ, { chamfer: 0.07 });
  addSlab(crane, 0.4, 0.2, 0.2, mats.steelPale, 0,
    slabTopAt(0.4, 0.2, 0.2, 0.05, hookTop - 0.38), tipZ, { chamfer: 0.05 });
  crane.userData.envelope = { pivotY, jib, lean, tipY, tipZ, slew: opts.slew ?? 0 };
  return crane;
}

/**
 * ── THE HERO SHIP'S DECK, AND WHY IT WAS THE LARGEST FLAT SURFACE IN THE PLATE ──
 *
 * r3 loaded five bays of three rows over a 42 m hull, so cargo covered 28% of the
 * length and the rest was one uninterrupted plate. Sampled off the plate that
 * plate read RGB 204,199,205 — the deck material is dark slate, but a top face
 * under a key at intensity 4.8 blows to near-white, which is exactly what the
 * critic measured at 197–214 and called a barge rather than a ship.
 *
 * Both halves are fixed here. The load goes to seven bays of five rows (about
 * 2.4× the boxes), and what deck is still open is a system rather than a sheet:
 * dark plate, pale hatch covers on chamfered coamings, painted walkways down
 * both sides, lashing-rod racks and a green painted working area forward.
 */
// Only buildContainer's lashing rods and tread overlays participate. The weak
// owner keeps no retired ship alive and adds no material/geometry disposal work.
const CONTAINER_FITTINGS = new WeakMap();
const _fittingView = new THREE.Matrix4();
const _fittingPart = new THREE.Matrix4();

function registerContainerFittings(ship, members) {
  ship.updateWorldMatrix(true, true);
  const inverse = ship.matrixWorld.clone().invert();
  CONTAINER_FITTINGS.set(ship, members.map(({ mesh, longAxis }) => {
    mesh.geometry.computeBoundingBox();
    return { mesh, parent: mesh.parent, geometry: mesh.geometry, longAxis,
      toShip: new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld),
      centre: mesh.geometry.boundingBox.getCenter(new THREE.Vector3()),
      half: mesh.geometry.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(0.5),
      near: true, visible: mesh.visible };
  }));
}

function fittingVisible(part, near) {
  if (part.near === near) return;
  if (near) part.mesh.visible = part.visible;
  else { part.visible = part.mesh.visible; part.mesh.visible = false; }
  part.near = near;
}

// Conservative pinhole bound on the transverse section, not the fitting's long
// silhouette: rods are 0.18 x 0.18 m; tread sections are 0.07 x 0.22 m. Hide
// below 1.5 backing pixels and restore above 2, where the section spans two
// samples. This hysteresis is local to these fittings; close geometry stays.
export function updateContainerFittings(ship, camera, pixelWidth, pixelHeight) {
  const parts = CONTAINER_FITTINGS.get(ship);
  if (!parts) return;
  const projection = camera?.projectionMatrix?.elements;
  const valid = camera?.isPerspectiveCamera === true && Number.isFinite(pixelWidth)
    && pixelWidth > 0 && Number.isFinite(pixelHeight) && pixelHeight > 0
    && Number.isFinite(projection?.[0]) && projection[0] > 0
    && Number.isFinite(projection[5]) && projection[5] > 0
    && projection[1] === 0 && projection[4] === 0 && projection[3] === 0
    && projection[7] === 0 && projection[11] === -1 && projection[12] === 0
    && projection[13] === 0 && projection[15] === 0;
  if (!valid) { for (const part of parts) fittingVisible(part, true); return; }
  camera.updateWorldMatrix(true, false);
  ship.updateWorldMatrix(true, false);
  _fittingView.multiplyMatrices(camera.matrixWorldInverse, ship.matrixWorld);
  const focal = Math.max(Math.abs(projection[0]) * pixelWidth,
    Math.abs(projection[5]) * pixelHeight) * 0.5;
  for (const part of parts) {
    if (part.mesh.parent !== part.parent || part.mesh.geometry !== part.geometry) {
      fittingVisible(part, true); continue;
    }
    const e = _fittingPart.multiplyMatrices(_fittingView, part.toShip).elements;
    const { x, y, z } = part.centre, h = part.half;
    const cx = e[0] * x + e[4] * y + e[8] * z + e[12];
    const cy = e[1] * x + e[5] * y + e[9] * z + e[13];
    const cz = e[2] * x + e[6] * y + e[10] * z + e[14];
    const rx = Math.abs(e[0]) * h.x + Math.abs(e[4]) * h.y + Math.abs(e[8]) * h.z;
    const ry = Math.abs(e[1]) * h.x + Math.abs(e[5]) * h.y + Math.abs(e[9]) * h.z;
    const rz = Math.abs(e[2]) * h.x + Math.abs(e[6]) * h.y + Math.abs(e[10]) * h.z;
    const depth = -cz - rz;
    // Long Y for rods, long X for treads. Include shear/nonuniform scale in the
    // section diagonal rather than using a camera-distance or uniform-scale guess.
    const a = part.longAxis === 1 ? 0 : 4, wa = 2 * (part.longAxis === 1 ? h.x : h.y);
    const wb = 2 * h.z;
    const ax = e[a] * wa, ay = e[a + 1] * wa, az = e[a + 2] * wa;
    const bx = e[8] * wb, by = e[9] * wb, bz = e[10] * wb;
    const section = Math.sqrt(ax * ax + ay * ay + az * az + bx * bx + by * by + bz * bz
      + 2 * Math.abs(ax * bx + ay * by + az * bz));
    const radial2 = (Math.abs(cx) + rx) ** 2 + (Math.abs(cy) + ry) ** 2;
    const pixels = focal * section / depth * Math.sqrt(1 + radial2 / (depth * depth));
    if (!(depth > camera.near) || !Number.isFinite(pixels)) fittingVisible(part, true);
    else if (part.near ? pixels < 1.5 : pixels > 2) fittingVisible(part, !part.near);
  }
}

// Logistics clones remain full-detail. Restore the source's exact intended
// visibility synchronously, even if Object3D.clone throws; no frame sees this lift.
export function cloneShipWithFittings(holder) {
  const hidden = CONTAINER_FITTINGS.get(holder.children[0])?.filter(part => !part.near) ?? [];
  for (const part of hidden) fittingVisible(part, true);
  try { return holder.clone(true); }
  finally { for (const part of hidden) fittingVisible(part, false); }
}

// Geometry identity only. Three.clone JSON-serializes userData, so a fading
// clone cannot recover its opaque draw through a property on the mesh.
const deckCargoFade = new WeakMap();
const deckCargoOpaque = new WeakMap();

function rememberDeckCargoPair(opaque, fade) {
  if (!opaque || !fade || opaque === fade) return;
  if (!deckCargoFade.has(opaque)) deckCargoFade.set(opaque, fade);
  if (!deckCargoOpaque.has(fade)) deckCargoOpaque.set(fade, opaque);
}

export function deckCargoGeometry(geometry, wantOpaque) {
  if (!geometry) return geometry;
  if (wantOpaque) {
    if (deckCargoFade.has(geometry)) return geometry;
    return deckCargoOpaque.get(geometry) ?? geometry;
  }
  if (deckCargoOpaque.has(geometry)) return geometry;
  return deckCargoFade.get(geometry) ?? geometry;
}

function buildContainer(g, mats, seed) {
  const minorFittings = [];
  const L = SHIP_LENGTH.container;
  const B = 9.2;
  const D = 2.45;
  const deckY = addMerchantHull(g, mats, { L, B, D, hull: mats.blueHull, boot: mats.redBoot });
  // P16-PM2: the loft carries the boot and the load-line band, so the old
  // `addWaterlineDress` full-beam slabs are gone — at `B + 0.24` over 0.76 L
  // they stood three metres clear of the plating at both quarters.
  const hb = g.userData.hullGrid.hbAtX;
  addBox(g, 5.2, 0.55, hb(L * 0.34, 1) * 1.62, mats.deckDark, L * 0.34, deckY + 0.22, 0);
  const cw = CONTAINER_BOX.w;
  const ch = CONTAINER_BOX.h;
  const cd = CONTAINER_BOX.d;
  const bays = CONTAINER_DECK_STOW.bays;
  const rows = CONTAINER_DECK_STOW.rows;
  const tiers = CONTAINER_DECK_STOW.tiers;
  const pitch = CONTAINER_DECK_STOW.pitchX;
  const rowPitch = CONTAINER_DECK_STOW.pitchZ;
  const cargoX0 = CONTAINER_DECK_STOW.cargoX0;
  // R5 fault 6 (container-zone x900–1195 / y390–645) — "ship cargo repeats the
  // same bay rhythm". It did: `cargoX0 + bay * pitch` is a metronome, and with
  // seven identical bays the eye reads the interval, not the cargo. Real stows
  // group around the hatch runs, so the bays go 2 · 2 · 3 with a wider working
  // gap between groups plus a few centimetres of seeded slop per bay. Bay COUNT
  // is untouched — `deckSlots` still totals bays × rows × tiers = 175.
  // taste-r1 W8-E: three bays at a 7.16 m pitch (see CONTAINER_DECK_STOW), the middle one centred on x = 0 under the hold
  // gantry. No seeded slop: the hold bay has to stay exactly under the spreader, and with three bays there is no
  // interval to read as a metronome. The bays are still 2 + 1 grouped, so the bridge between the last two is the tall one.
  const holdBay = CONTAINER_DECK_STOW.holdBay;
  const bayGroup = (b) => (b < bays - 1 ? 0 : 1);
  const bayX = [];
  for (let b = 0; b < bays; b += 1) bayX.push(cargoX0 + b * pitch);
  const cargoX1 = bayX[bays - 1];
  // Where the run's two ends stand, for everything that has to sit just beyond them.
  const cargoFaceAft = bayX[0] - cw * 0.5;
  const cargoFaceFwd = cargoX1 + cw * 0.5;
  // Painted walkways outboard of the hatches, and a working area forward of the
  // cargo run. Flat lambert is the tell; a deck with paint on it is not flat.
  // P16-PM2: the walkway runs stop inside the parallel body. At L·0.70 they ran
  // to x 13.4, where the shell's half-breadth is 2.35 m and the strip was
  // authored at 3.68 — 1.3 m of yellow paint on air.
  for (const dz of [B * 0.40, -B * 0.40]) {
    addSlab(g, L * 0.54, 0.05, 0.62, mats.lineYellow ?? mats.yellow, -L * 0.06,
      deckY + 0.06, dz, { chamfer: 0.02 });
  }
  addSlab(g, 5.4, 0.05, hb(cargoFaceFwd + 3.0, 1) * 1.5, mats.grass ?? mats.deckDark, cargoFaceFwd + 3.0,
    deckY + 0.06, 0, { chamfer: 0.03 });
  addSlab(g, 4.2, 0.06, B * 0.5, mats.rustDark ?? mats.deckDark, cargoFaceAft - 2.6,
    deckY + 0.06, 0, { chamfer: 0.03 });
  const byGood = new Map();
  const rails = [];
  const doors = [];
  const deckSlots = [];
  const cargoUnits = [];
  const hatchCleats = [];
  let bridgeCount = 0;
  const slotAnchors = new THREE.Group();
  slotAnchors.name = 'fringe:ship:container:slots';
  g.add(slotAnchors);
  const normalMap = mats.tex?.corrugation ?? null;
  for (let bay = 0; bay < bays; bay += 1) {
    const x = bayX[bay];
    // Coaming under every bay, then a PALE hatch cover on top of it. The tonal
    // break between the two is what stops the run reading as one slab when a
    // bay is left unloaded.
    addSlab(g, cw + 0.34, 0.26, B * 0.74, mats.deckDark, x, deckY + 0.02, 0, { chamfer: 0.05 });
    addSlab(g, cw + 0.14, 0.12, B * 0.70, mats.greyLight, x, deckY + 0.24, 0, { chamfer: 0.03 });
    for (const dz of [B * 0.34, -B * 0.34]) {
      addSlab(g, cw + 0.14, 0.05, 0.1, mats.steelDark, x, deckY + 0.34, dz, { chamfer: 0.02 });
    }
    for (const dz of [B * 0.22, -B * 0.22, B * 0.08, -B * 0.08]) {
      hatchCleats.push({ x: x + cw * 0.28, y: deckY + 0.34, z: dz });
      hatchCleats.push({ x: x - cw * 0.28, y: deckY + 0.34, z: dz });
    }
    // Lashing bridge between bays: open two-level frame (posts, walkways, braces).
    // R5 fault 6 — a bridge at EVERY gap is its own metronome. Bridges stand at
    // the group joins and at one seeded gap inside a group, and the tall ones
    // carry a second walkway level where the short ones do not.
    // taste-r1 W8-E: with three bays there are two gaps and both are bridged (one short, one tall); the bridges stand
    // 0.69 m either side of the hold bay's faces, which the lowered box clears (CONTAINER_DECK_STOW).
    const joins = bay > 0;
    if (joins) {
      bridgeCount += 1;
      const tall = bayGroup(bay) !== bayGroup(bay - 1);
      const bx = (x + bayX[bay - 1]) * 0.5;
      const bridge = new THREE.Group();
      bridge.name = `fringe:ship:container:lashing-bridge:${bay}`;
      noPick(bridge);
      g.add(bridge);
      const posts = [];
      const braces = [];
      const zs = tall
        ? [-B * 0.30, -B * 0.10, B * 0.10, B * 0.30]
        : [-B * 0.26, B * 0.04, B * 0.30];
      /* ── P16-PM7 item 5 — THE LASHING BRIDGE STOOD ON ITS OWN HEAD. ──
       * `chamferBox` spans `[h/2 − 2c, 3h/2 − 2c]` above the matrix origin, so a
       * post authored at `deckY + postH/2` had its FOOT at `deckY + postH − 0.04`
       * — a 3.98 m post starting 3.94 m above the deck, four metres of air over
       * the stow, with its own walkways (placed by `addSlab`, which is correct)
       * threaded through the middle of nothing. Nine of PM6's eleven declared
       * FLOAT entries on `fringe:ship:*` are these two families. Both are placed
       * by their CENTRE now, with the chamfer offset taken out explicitly, and
       * the braces carry the same correction through their own rotation. */
      const postH = tall ? ch * 2.2 : ch * 1.5;
      const postC = slabChamfer(0.18, postH, 0.18, 0.035);
      const postFoot = deckY + 0.30;
      for (const dz of zs) posts.push({ x: bx, y: postFoot - postH * 0.5 + 2 * postC, z: dz });
      addInstances(bridge, chamferBox(0.18, postH, 0.18, 0.035),
        mats.steelWork ?? mats.steelPale, posts,
        `fringe:ship:container:lashing-bridge:${bay}:posts`);
      for (const lv of (tall ? [0.55, 1.45] : [0.62])) {
        addSlab(bridge, 0.52, 0.16, B * 0.72, mats.steelDark, bx, deckY + ch * lv, 0, {
          chamfer: 0.035, name: `fringe:ship:container:lashing-bridge:${bay}:walkway:${lv}`,
        });
        addSlab(bridge, 0.44, 0.10, B * 0.68, mats.greyLight, bx, deckY + ch * lv + 0.13, 0,
          { chamfer: 0.025 });
      }
      const braceH = ch * 1.55;
      const braceOff = braceH - 2 * slabChamfer(0.16, braceH, 0.16, 0.03);
      for (const dz of (tall ? [-B * 0.20, B * 0.20] : [B * 0.16])) {
        // taste-r1 W8-E: a 0.22 rad lean (was 0.52) keeps each brace inside the 1.4 m gap between bays; at 0.52 the
        // braces' feet stood 0.3 m inside the hold bay's cargo faces.
        for (const rz of [0.22, -0.22]) {
          braces.push({
            x: bx + braceOff * Math.sin(rz),
            y: postFoot + postH * 0.5 - braceOff * Math.cos(rz),
            z: dz,
            rz,
          });
        }
      }
      addInstances(bridge, chamferBox(0.16, ch * 1.55, 0.16, 0.03), mats.steelDark, braces,
        `fringe:ship:container:lashing-bridge:${bay}:braces`);
      if (mats.chainlink && tall) {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(B * 0.62, ch * 1.6), mats.chainlink);
        mesh.position.set(bx, postFoot + ch * 0.85, 0);
        mesh.rotation.y = HALF_PI;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        noPick(mesh);
        bridge.add(mesh);
      }
      bridge.userData.engineeredLashingBridge = true;
    }
    for (let row = 0; row < rows; row += 1) {
      const k = seedUnit(seed, `stk:${bay}:${row}`);
      // Two bays in seven are struck down low so the deck line is not a wall,
      // and the pale hatch covers under them stay in shot.
      // taste-r1 W8-E: at three tiers the aft bay is the full one (2-3 high), the forward bay varies (1-3), and the hold
      // bay under the gantry is struck down to one box in every row. The crane lowers a box into the hold bay from
      // above at a z that is not the cell's own, so every stack beside the lowered box has to stand at or below the tier
      // it is lowered to: with one box high everywhere the first export lands on tier 1 and the next on tier 2.
      const height = bay === holdBay ? 1
        : (bay === 0 ? 2 + Math.floor(k * 2) : 1 + Math.floor(k * 3));
      for (let tier = 0; tier < tiers; tier += 1) {
        const px = x;
        const stackPitch = ch + 0.10;
        const py = deckY + 0.42 + ch * 0.5 + tier * stackPitch;
        const pz = (row - (rows - 1) * 0.5) * rowPitch;
        const occupied = tier < height;
        deckSlots.push({ bay, row, tier, x: px, y: py, z: pz, occupied });
        const anchor = new THREE.Object3D();
        anchor.name = `fringe:ship:container:slot:${bay}:${row}:${tier}`;
        anchor.position.set(px, py, pz);
        anchor.userData.occupied = occupied;
        slotAnchors.add(anchor);
        if (!occupied) continue;
        cargoUnits.push({ bay, row, tier, x: px, y: py, z: pz });
        const idx = bay * rows * tiers + row * tiers + tier;
        const good = stampGoodForIndex(seed, `deck:${bay}:${row}:${tier}`, idx);
        // R5 fault 6 — per-container variants. Two boxes of the same good now
        // carry different paint and different wear; the instanced total is
        // unchanged, only the number of buckets it is split across.
        const variant = stampVariantForIndex(seed, `deckv:${bay}:${row}:${tier}`, idx);
        const key = `${good}|${variant}`;
        if (!byGood.has(key)) byGood.set(key, []);
        byGood.get(key).push({ x: px, y: py, z: pz });
        rails.push({ x: px, y: py + ch * 0.5 - 0.04, z: pz });
        doors.push({ x: px + cw * 0.5 + 0.02, y: py, z: pz });
      }
    }
  }
  const cargoInstanced = [];
  const fadeGeometry = stampedBoxGeometry(cw, ch, cd);
  for (const [key, list] of byGood) {
    const [good, v] = key.split('|');
    const variant = Number(v) || 0;
    const materials = stampedContainerMaterials(good, { normalMap, variant });
    // Fixed deck cargo only. Adjacent groups that already share one material
    // object draw together while the box stays opaque. The six-slot array and
    // both cached geometries stay untouched; fade swaps the mesh reference.
    const opaque = stampedYardGeometry(materials, cw, ch, cd);
    rememberDeckCargoPair(opaque, fadeGeometry);
    const mesh = addInstances(
      g, opaque, materials, list,
      variant ? `fringe:ship:container:cargo:${good}:v${variant}`
        : `fringe:ship:container:cargo:${good}`,
    );
    if (mesh) cargoInstanced.push(mesh);
  }
  // Orchestrator 2026-09-02 (BA2 fault 11 / R4 fault 10 forensics): this was a full-footprint
  // 0.13 m dark steel plate on every roof (cw×1.015 × cd×1.03), so every stamped roof
  // rendered as a slate lid whatever `container-top` was painted. Now a single narrow
  // longitudinal roof rib; the chalked roof paint shows and the stacks read as boxes.
  addInstances(g, chamferBox(cw * 0.94, 0.14, 0.16, 0.025), mats.steelDark,
    rails.map((r) => ({
      ...r, y: r.y - (0.14 - 2 * slabChamfer(cw * 0.94, 0.14, 0.16, 0.025)),
    })), 'fringe:ship:container:cargo-rails');

  /* ── P16-PM9 CLASS 6 — ISO LOAD PATH AT EVERY OCCUPIED BOX. ──
   * Corner castings state where a spreader and the box below carry the load;
   * twistlocks occupy the deliberate 100 mm tier gap; and a dark strip sits at
   * every true box-on-box seam. These are instanced sets, not per-box draw calls. */
  const castings = [];
  const twistlocks = [];
  const seamAo = [];
  for (const unit of cargoUnits) {
    for (const dx of [-cw * 0.5 + 0.12, cw * 0.5 - 0.12]) {
      for (const dy of [-ch * 0.5 + 0.09, ch * 0.5 - 0.09]) {
        for (const dz of [-cd * 0.5 + 0.10, cd * 0.5 - 0.10]) {
          castings.push({ x: unit.x + dx, y: unit.y + dy, z: unit.z + dz });
        }
      }
      for (const dz of [-cd * 0.5 + 0.10, cd * 0.5 - 0.10]) {
        twistlocks.push({ x: unit.x + dx, y: unit.y - ch * 0.5 - 0.05, z: unit.z + dz });
      }
    }
    if (unit.tier > 0) {
      for (const sgn of [-1, 1]) {
        seamAo.push({ x: unit.x, y: unit.y - ch * 0.5 + 0.035, z: unit.z + sgn * (cd * 0.5 + 0.035) });
      }
    }
  }
  addInstances(g, new THREE.BoxGeometry(0.24, 0.18, 0.20), mats.steelWork ?? mats.steelDark,
    castings, 'fringe:ship:container:corner-castings');
  addInstances(g, new THREE.BoxGeometry(0.18, 0.10, 0.16), mats.steelDark,
    twistlocks, 'fringe:ship:container:twistlocks');
  addInstances(g, new THREE.BoxGeometry(cw * 0.94, 0.08, 0.045), mats.soot ?? mats.steelDark,
    seamAo, 'fringe:ship:container:contact-ao-seams');
  // Orchestrator 2026-09-02 (BA2 fault 10): the door was a solid dark plate over the whole
  // painted end (0.07 × ch·0.82 × cd·0.86); now a pair-width locking-bar strip so the
  // `container-end` paint (doors a step darker than the sides) carries the end face.
  // R5 fault 7: paired locking bars either side of a thin centre seam, not one strip.
  // ── P16-PM2 (PM3 hand-off, PM3-RESIDUAL 1) — THE SHIP'S POST FOREST. ──
  // `chamferBox` puts a box's FOOT at `y + H/2 − 2c`, and these three runs were
  // instanced at the container's own CENTRE, so a 1.04 m locking bar stood from
  // 0.15 m below the roof to 0.89 m above it: at crane-close that is a rank of
  // 50 mm rods standing in the air between every stack, which is the hairline
  // forest PM3 measured in the yard and left standing here. Two fixes at once —
  // seated with the same `H − 2c` arithmetic `boxFootY` states in `port.js`,
  // and the section taken from 50 mm (0.6 px at crane-close) to 140 mm (2.2 px),
  // because a bar nobody can resolve is worse than no bar at all.
  const barH = ch * 0.80;
  const barC = 0.03;
  const seatBar = (arr, w2, d2, c2) => arr.map((d) => ({
    ...d, y: d.y - (barH - 2 * slabChamfer(w2, barH, d2, c2)),
  }));
  addInstances(g, chamferBox(0.14, barH, 0.14, barC), mats.steelDark,
    seatBar(doors.map((d) => ({ ...d, z: d.z - cd * 0.27 })), 0.14, 0.14, barC),
    'fringe:ship:container:cargo-doors:bar-l');
  addInstances(g, chamferBox(0.14, barH, 0.14, barC), mats.steelDark,
    seatBar(doors.map((d) => ({ ...d, z: d.z + cd * 0.27 })), 0.14, 0.14, barC),
    'fringe:ship:container:cargo-doors:bar-r');
  addInstances(g, chamferBox(0.1, ch * 0.84, cd * 0.06, 0.02), mats.steelDark,
    doors.map((d) => ({
      ...d, y: d.y - (ch * 0.84 - 2 * slabChamfer(0.1, ch * 0.84, cd * 0.06, 0.02)),
    })), 'fringe:ship:container:cargo-doors');
  addInstances(g, chamferBox(0.20, 0.12, 0.16, 0.025), mats.steelWork ?? mats.steelDark, hatchCleats,
    'fringe:ship:container:hatch-cleats');
  /* ── P16-PM10 NEW REGRESSION — LASHINGS BELONG AT BAY ENDS. ──
   * PM9 added four rods per bay, but crossed each one from `+0.44cw` to
   * `-0.40cw` through the bay itself. At crane-close that projects as a blue X
   * painted over the container doors: exactly A7 crane F11. Keep the working
   * load paths and their census, but put each pair just beyond its fore/aft
   * cargo face. Both endpoints remain on the same side of that face, so no rod
   * can enter a corrugated box even when the camera foreshortens the stow. */
  const lashingRods = new THREE.Group();
  lashingRods.name = 'fringe:ship:container:lashing-rods';
  noPick(lashingRods);
  g.add(lashingRods);
  let rodCount = 0;
  const outerRowZ = (rows - 1) * 0.5 * rowPitch + cd * 0.5 + 0.12;
  for (let bay = 0; bay < bays; bay += 1) {
    for (const sgn of [-1, 1]) {
      for (const hand of [-1, 1]) {
        const cargoFaceX = bayX[bay] + hand * cw * 0.5;
        const fromX = cargoFaceX + hand * 0.46;
        const toX = cargoFaceX + hand * 0.10;
        const rod = strut(lashingRods, mats.steelDark,
          new THREE.Vector3(fromX, deckY + 0.34,
            sgn * (outerRowZ + 0.62)),
          new THREE.Vector3(toX, deckY + 0.42 + ch * 1.72,
            sgn * outerRowZ), 0.18, 0.18, 0.035);
        rod.name = `fringe:ship:container:lashing-rod:${rodCount}`;
        rod.userData.bayEnd = true;
        rod.userData.cargoFaceX = cargoFaceX;
        rod.userData.cargoFaceClearance = 0.10;
        rod.userData.endSign = hand;
        rod.userData.fromX = fromX;
        rod.userData.toX = toX;
        minorFittings.push({ mesh: rod.children[0], longAxis: 1 });
        rodCount += 1;
      }
    }
  }
  // Lashing-rod racks and a spares stack against the forward bulkhead.
  const rods = [];
  for (let i = 0; i < 12; i += 1) {
    rods.push({ x: cargoFaceFwd + 4.4, y: deckY + 0.5 + (i % 4) * 0.26, z: (Math.floor(i / 4) - 1) * 1.5,
      rz: 0.02 * (i % 3) });
  }
  addInstances(g, chamferBox(4.2, 0.16, 0.16, 0.035), mats.rust, rods,
    'fringe:ship:container:lashing-rod-rack');
  // ── P16-PM2 ITEM 4 — the jibs slew SEAWARD, off the stow. ──
  // Local +Z is seaward, so a jib at slew 0 swings away from both the quay and
  // the gantry. Pedestals stand in the gaps at either end of the cargo run; the
  // jib crosses the outer container row 1.3 m above the highest tier.
  const stackTop = deckY + 0.42 + ch * tiers + 0.10 * (tiers - 1);
  // A short steep jib over the crane's own gap: the tip lands 3.7 m outboard of
  // the centreline, INSIDE the 4.6 m half-beam, so the jib serves the hatch it
  // stands beside and never sweeps across the stow. The first pass ran 7.4 m at
  // 0.62 rad, whose tip reached 1.4 m past the ship's side and — at crane-close,
  // where seaward is toward the camera — projected across the whole cargo run.
  /* ── P16-PM5B item 4 — THE PIVOT IS DERIVED FROM THE STACK, NOT TYPED. ──
   *
   * PM2 aimed both jibs seaward and left `pivotY` at a typed 5.2, and the
   * arithmetic says that is 0.17 m short: the forward jib's tip lands at
   * `deckY + 9.30` against a stack top at `deckY + 9.47`, so the whole jib
   * lies BELOW the boxes it stands beside. It does not read as fouling in a
   * still because `slew` is 0 and the pedestal stands in the x-gap between
   * bays — but nothing stops a bearing, or a later director, putting the arm
   * across the stow, and that is exactly what crane-close F3 and
   * container-zone F4 read as "orange arms through the container stack".
   *
   * The pivot is now the height at which the tip clears the stack at ANY slew:
   * the stack's own top, plus a working clearance, less whatever the jib's own
   * lean already gains. The typed 5.2 stays as a floor, so a short stow cannot
   * drop the crane into the deck. `tiers` moves and the crane follows. */
  const CRANE_CLEAR_M = 0.9;
  const cranePivot = (jib, lean) => Math.max(5.2,
    (stackTop - (deckY + 0.3)) + CRANE_CLEAR_M - Math.sin(lean) * jib);
  const craneAft = addDeckCrane(g, mats, cargoFaceAft - 0.95, 0, deckY + 0.3, 0.85,
    { name: 'fringe:ship:container:deck-crane:aft', pivotY: cranePivot(5.6, 0.85), jib: 5.6 });
  const craneFwd = addDeckCrane(g, mats, cargoFaceFwd + 0.95, 0, deckY + 0.3, 0.82,
    { name: 'fringe:ship:container:deck-crane:fwd', pivotY: cranePivot(5.2, 0.82), jib: 5.2 });
  g.userData.deckCranes = [craneAft, craneFwd];
  g.userData.stackTop = stackTop;
  const house = aftHouse(g, mats, {
    x: -L * 0.36, deckY, B, decks: 4, w: 6.4, body: mats.cream, accent: mats.orange,
    stack: false, openWindowFrames: true,
  });
  // ── A7 ITEM 3a / A6 RESIDUAL 3, RE-SEATED ON THE SHELL (P16-PM2). ──
  // The bulwark itself is now part of the loft, so the 31 m `blueHull` band and
  // its full-length rubbing strake are gone with it. What survives is the
  // INTERRUPTION the A7 item asked for — freeing ports, fairleads, weeps, a
  // pilot door, an accommodation ladder — and every piece takes its Z from
  // `hb(x)`, the half-breadth the shell actually has at that station. Authored
  // at `±(B/2 + 0.06)` they stood up to 2.6 m off the plating forward of the
  // parallel body, which is half of what the a12before plate reads as clutter.
  const scuppers = [];
  const fairleads = [];
  const weeps = [];
  for (let i = 0; i < 11; i += 1) {
    const bx = -L * 0.36 + i * (L * 0.66 / 10);
    const half = hb(bx, 1);
    for (const sgn of [1, -1]) {
      if (i % 2 === 0) {
        scuppers.push({ x: bx + 0.4, y: deckY + 0.1, z: sgn * (half + 0.05) });
        scuppers.push({ x: bx - 0.4, y: deckY + 0.1, z: sgn * (half + 0.05) });
      }
      if (i === 1 || i === 4 || i === 7 || i === 10) {
        fairleads.push({ x: bx, y: deckY + 0.34, z: sgn * (half + 0.09) });
        weeps.push({ x: bx, y: deckY - 1.05, z: sgn * (hb(bx, 0.6) + 0.03) });
      }
    }
  }
  addInstances(g, chamferBox(0.42, 0.16, 0.07, 0.03), mats.soot ?? mats.deckDark, scuppers,
    'fringe:ship:container:scuppers');
  addInstances(g, chamferBox(0.36, 0.4, 0.18, 0.07), mats.steelWork ?? mats.steelDark, fairleads,
    'fringe:ship:container:fairleads');
  addInstances(g, chamferBox(0.16, 1.5, 0.03, 0.01), mats.rust ?? mats.rustDark, weeps,
    'fringe:ship:container:rust-weeps');
  // Pilot door and the stowed accommodation ladder, both amidships where the
  // shell is parallel, so both sit flush.
  const doorX = L * 0.10;
  const doorZ = hb(doorX, 0.66);
  for (const sgn of [1, -1]) {
    addSlab(g, 1.1, 1.15, 0.09, mats.steelDark, doorX, BOTTOM + D * 0.66, sgn * (doorZ + 0.03),
      { chamfer: 0.04 });
    addSlab(g, 0.9, 0.9, 0.06, mats.greyLight ?? mats.white, doorX, BOTTOM + D * 0.66,
      sgn * (doorZ + 0.07), { chamfer: 0.03 });
  }
  // Critic C3: "a railed platform hanging in mid-air" — the stowed
  // accommodation ladder was a 5.2 m plank against the topside with nothing
  // holding it, on BOTH sides, so the stern quarter read as a stack of pale
  // plates. One ladder, on the quay side, on three brackets off the shell.
  {
    const ladZ = -(hb(-L * 0.06, 0.82) + 0.14);
    addSlab(g, 5.2, 0.14, 0.55, mats.steelPale, -L * 0.06, BOTTOM + D * 0.82, ladZ,
      { chamfer: 0.04, rotZ: 0.06 });
    for (const ox of [-2.1, 0, 2.1]) {
      addSlab(g, 0.16, 0.42, 0.34, mats.steelDark, -L * 0.06 + ox, BOTTOM + D * 0.72,
        -(hb(-L * 0.06 + ox, 0.75) + 0.06), { chamfer: 0.04 });
    }
    addDeckRail(g, mats.steelPale, -L * 0.06 - 2.4, -L * 0.06 + 2.4, ladZ,
      BOTTOM + D * 0.82 + 0.16, 1.6, 0.34);
  }
  // ── P16-PM2B — THE STACK SITS ON THE HOUSE THE HOUSE ACTUALLY BUILT. ──
  // The funnel, its POM plate and the aerial mast were all authored against
  // `deckY + 4.1` — an arithmetic guess at the old casing top. `aftHouse`
  // returns its own `bridgeTop`, so nothing here can go stale when a tier
  // height changes, and the funnel is a raked casing with a modelled mouth
  // instead of three co-axial drums with a warped decal at their tangent.
  const stackY = house.bridgeTop;
  funnel(g, mats.blueHull, mats.white, mats.soot, -L * 0.36, stackY + 0.06, 0, 0.78, 2.3);
  // Critic C10: the funnel legend sits on a flat name plate on the casing's own
  // flat, which is the point of a shaped casing — a drum has no flat to take a
  // legend, so the letters warped round its tangent.
  // Critic F16 — the legend plate was 1.9 m wide on a casing 2.0 m wide, so on
  // a superellipse section its ends stood 0.3 m proud while its middle was
  // buried: a plane cutting the funnel. It is 1.25 m now, which is inside the
  // casing's flat at every station, and it sits 20 mm off the face.
  addSlab(g, 1.25, 0.56, 0.08, mats.navyHull ?? mats.steelDark, -L * 0.36 - 0.24,
    slabCentreAt(1.25, 0.56, 0.08, 0.03, stackY + 1.42), 0.70, { chamfer: 0.03 });
  toyLettersOrDecal(g, 'POM', mats.white, -L * 0.36 - 0.72, stackY + 1.29, 0.75, {
    s: 0.31, gap: 0.05, depth: 0.05, yaw: 0,
  });
  addSlab(g, 0.24, 3.4, 0.24, mats.steelPale, -L * 0.36 + 2.4,
    slabTopAt(0.24, 3.4, 0.24, 0.05, stackY + 3.4), 0, { chamfer: 0.05 });
  addSlab(g, 1.6, 0.14, 0.14, mats.steelPale, -L * 0.36 + 2.4,
    slabTopAt(1.6, 0.14, 0.14, 0.04, stackY + 2.9), 0, { chamfer: 0.04 });
  addSphere(g, 0.2, 6, mats.beacon ?? mats.lamp, -L * 0.36 + 2.4, stackY + 3.5, 0);
  /* P16-PM7 item 5 — the forward masthead light stood 0.16 m clear of the
   * bulwark with nothing under it. A light stands on a staff. */
  addCyl(g, 0.13, 0.15, 1.62, 8, mats.steelPale, L * 0.44, deckY + 0.72, 0);
  addSphere(g, 0.18, 6, mats.lamp, L * 0.44, deckY + 1.5, 0);
  const imoS = 0.32;
  const imoGap = 0.03;
  const imoText = 'IMO 9321844';
  const imoW = toyLetterWidth(imoText, imoS, imoGap);
  toyLettersOrDecal(g, imoText, mats.white, L * 0.02 - imoW * 0.15, deckY - 1.05,
    hb(L * 0.02, 0.55) + 0.14, { s: imoS, gap: imoGap, depth: 0.05, yaw: 0 });
  // ── P16-PM2 (critic C1) — THE BOAT HANGS OFF SOMETHING. ──
  // "an orange cylinder floats untethered beside the hull": the boat and both
  // davit posts were all authored at the SAME outboard z, so the posts stood on
  // water and the whole assembly touched nothing. A davit stands ON THE DECK
  // and cantilevers out; the boat hangs under the outboard end of the arm.
  const boatIn = hb(-L * 0.30, 1) - 0.45;
  const boatOut = hb(-L * 0.30, 1) + 0.55;
  for (const sgn of [1, -1]) {
    addCyl(g, 0.24, 0.24, 2.05, 8, mats.lifeboat, -L * 0.30, deckY + 1.15, sgn * boatOut,
      { rotX: HALF_PI });
    for (const ox of [-0.85, 0.85]) {
      // Post on the deck, then the arm out to the falls.
      addSlab(g, 0.24, 1.5, 0.24, mats.steelPale, -L * 0.30 + ox, deckY + 0.55,
        sgn * boatIn, { chamfer: 0.04 });
      addSlab(g, 0.16, 0.16, boatOut - boatIn + 0.2, mats.steelPale, -L * 0.30 + ox,
        deckY + 1.98, sgn * (boatIn + boatOut) * 0.5, { chamfer: 0.04 });
      addCyl(g, 0.07, 0.07, 0.85, 6, mats.steelDark, -L * 0.30 + ox, deckY + 1.62,
        sgn * boatOut);
    }
    addSlab(g, 1.9, 0.14, 0.14, mats.steelPale, -L * 0.30, deckY + 2.02, sgn * boatIn,
      { chamfer: 0.03 });
  }
  const gangway = new THREE.Group();
  gangway.name = 'fringe:ship:container:gangway';
  noPick(gangway);
  gangway.position.set(L * 0.08, deckY, -hb(L * 0.08, 1));
  g.add(gangway);
  /* ── P16-PM8 ITEM 4 — THE "TEAL PLANK" ON THE HARBOUR IS THIS GANGWAY. ──
   *
   * A4 FLOAT 9 and A5 pack-i: "a straight-edged teal slab lies on the harbour
   * from (671, 364) to (734, 334) with a pale underside edge at (674–739,
   * 342–365), no hull, no wake and no contact shadow", four rounds running and
   * never named. `p16-pm8-probe quay-hero 675 305 745 335` names it in one line:
   * `fringe:ship:container:gangway`, a 0.12 × 2.52 × 7.07 m box at (171.9, 2.17,
   * −46.4). A 7.6 m plank 0.09 m thick with two 0.08 m stringers, running down
   * off the shell at 0.28 rad over open water, seen at 158 m — of course it
   * reads as a slab lying on the sea with a pale underside. The stringers are
   * the pale underside edge.
   *
   * What a real accommodation ladder has, and what this had none of: treads
   * across the run, a stanchion line each side with a top rail and a mid rail,
   * a landing platform at the bottom, and a lower end that BEARS on something
   * rather than stopping in the air. All six below, and the run is thickened to
   * 0.16 m so the plank has a section at this distance rather than an edge.
   */
  addSlab(gangway, 0.72, 0.16, 7.6, mats.steelPale, 0, -0.85, -3.4, { chamfer: 0.03, rotX: 0.28 });
  addSlab(gangway, 0.10, 0.55, 7.2, mats.steelDark, 0.34, -0.55, -3.2, { chamfer: 0.02, rotX: 0.28 });
  addSlab(gangway, 0.10, 0.55, 7.2, mats.steelDark, -0.34, -0.55, -3.2, { chamfer: 0.02, rotX: 0.28 });
  // Treads across the run, on the run's own rake, so the plank has a grain.
  for (let i = 0; i < 9; i += 1) {
    const u = (i + 0.5) / 9;
    const zt = -3.4 - 7.2 * 0.5 + u * 7.2;
    const tread = addSlab(gangway, 0.62, 0.07, 0.22, mats.steelWork ?? mats.steelDark, 0,
      -0.85 + 0.10 + (zt + 3.4) * Math.tan(0.28) * -1, zt, { chamfer: 0.02, rotX: 0.28 });
    minorFittings.push({ mesh: tread, longAxis: 0 });
  }
  // Stanchions with a top and a mid rail, each side. A gangway without a rail
  // is a plank, which is exactly what four rounds of the audit have called it.
  for (const sgn of [1, -1]) {
    for (let i = 0; i < 4; i += 1) {
      const u = i / 3;
      const zs = -3.4 - 7.2 * 0.5 + u * 7.2;
      const ys = -0.85 + (zs + 3.4) * Math.tan(0.28) * -1;
      addSlab(gangway, 0.09, 1.05, 0.09, mats.steelDark, sgn * 0.34, ys + 0.55, zs, { chamfer: 0.02 });
    }
    for (const h of [1.02, 0.56]) {
      addSlab(gangway, 0.09, 0.09, 7.3, mats.steelPale, sgn * 0.34, -0.85 + h, -3.4,
        { chamfer: 0.02, rotX: 0.28 });
    }
  }
  // The bottom landing: a platform on the apron with a kerb and two legs, so the
  // lower end bears on the quay instead of ending over the water.
  const zLand = -3.4 - 7.2 * 0.5 - 0.55;
  const yLand = -0.85 + (zLand + 3.4) * Math.tan(0.28) * -1;
  addSlab(gangway, 1.35, 0.14, 1.30, mats.steelPale, 0, yLand - 0.02, zLand, { chamfer: 0.04 });
  addSlab(gangway, 1.35, 0.10, 0.10, mats.steelDark, 0, yLand + 0.10, zLand - 0.60, { chamfer: 0.02 });
  for (const sgn of [1, -1]) {
    addSlab(gangway, 0.12, 0.85, 0.12, mats.steelDark, sgn * 0.52, yLand - 0.50, zLand - 0.45,
      { chamfer: 0.02 });
  }
  // P16-PM2: bitts sit on the deck the shell actually has. At `L·0.38, B·0.38`
  // the pair forward stood 2.1 m outboard of a hull that has already fined to a
  // 1.4 m half-breadth there.
  const shipBitts = [];
  for (const [bx, bk] of [[0.36, 0.72], [0.22, 0.82], [-0.42, 0.80]]) {
    const px = L * bx;
    const pz = hb(px, 1) * bk;
    shipBitts.push({ x: px, y: deckY + 0.28, z: pz });
    shipBitts.push({ x: px, y: deckY + 0.28, z: -pz });
  }
  addInstances(g, new THREE.CylinderGeometry(0.12, 0.14, 0.55, 8), mats.steelWork ?? mats.steelDark,
    shipBitts, 'fringe:ship:container:bitts');
  g.userData.deckY = deckY;
  const hullNameS = 1.1;
  const hullNameGap = 0.06;
  const hullNameW = toyLetterWidth('MELBOURNE', hullNameS, hullNameGap);
  const hullName = new THREE.Group();
  hullName.name = 'fringe:ship:container:name';
  hullName.position.set(L * 0.16, deckY - 0.72, hb(L * 0.16, 0.62) + 0.16);
  hullName.rotation.y = 0;
  hullName.userData.s = hullNameS;
  hullName.userData.letterYaw = 0;
  hullName.userData.lines = ['MELBOURNE'];
  noPick(hullName);
  addBox(hullName, hullNameW + 0.6, hullNameS + 0.45, 0.07, mats.navyHull ?? mats.steelDark, 0,
    hullNameS * 0.5, 0);
  toyLettersOrDecal(hullName, 'MELBOURNE', mats.white, -hullNameW * 0.5, 0, 0.1, {
    s: hullNameS, gap: hullNameGap, depth: 0.12, yaw: 0,
  });
  g.add(hullName);
  g.userData.deckSlots = deckSlots;
  g.userData.cargoInstanced = cargoInstanced;
  g.userData.isoContainerContract = {
    bays,
    occupied: cargoUnits.length,
    stackedUnits: cargoUnits.filter((unit) => unit.tier > 0).length,
    cornerCastings: castings.length,
    twistlocks: twistlocks.length,
    contactAoSeams: seamAo.length,
    lashingRods: rodCount,
    lashingBridges: bridgeCount,
    lashingAtBayEnds: true,
    lashingCargoFaceClearance: 0.10,
    stackGap: 0.10,
  };
  registerContainerFittings(g, minorFittings);
}

function buildTanker(g, mats) {
  const L = SHIP_LENGTH.tanker;
  // TASTE-R1 W3-B: beam 8.4 -> 7.3. The loft's flare and bulwark put the outermost plating 0.7 m past B, so a
  // 7.3 m grid gives the 8.0 m hull of the bible's 1:4 tanker (50 x 8 x 8), measured at the topside and strakes.
  const B = 7.3;
  const D = 2.05;
  const hull = mats.tankerHull ?? mats.blackHull;
  const deckY = addMerchantHull(g, mats, { L, B, D, hull, boot: mats.redBoot });
  // P16-PM9: the loft carries the boot and load-line band. Its plating grid is
  // now the material's normal map; pale upright frame bars on the shell were
  // both a second seam system and the final near-pose tanker hairline family.
  const hb = g.userData.hullGrid.hbAtX;
  /* ── P16-PM7 item 5 / P16A4 (5) — THE 3 px FLOOR APPLIES TO THE SHIP TOO. ──
   *
   * P16A3 pack-i measured the tanker at "roughly sixty percent white dashed
   * sparkle by area" and its Call 2 column scan reads a 50–80 level luma swing
   * on a one-to-three column period along every rail run. P16A4 restates it and
   * names the remedy: the hairline law's floor is for the ship's deck furniture
   * as much as the quay's. PM6 declared this family as a capped exception on the
   * argument that a floor cannot fix 0.09 m at 92 m; that argument is right about
   * 0.09 m and wrong about the conclusion — the fix is a HEAVIER SECTION, which
   * is what every other family in this venue got. 0.12 m is 3.1 px at oil-sea's
   * 77 m and 2.6 px at 92 m, and a 120 mm frame on a 46 m hull is a frame.
   *
   * The remaining catwalk trestles and dome handrails are physical members;
   * plating frames/stringers are represented by the hull normal map.
   */
  const catwalkY = deckY + 0.92;
  const trestles = [];
  for (let i = 0; i < 13; i += 1) {
    const x = -14.8 + i * 2.35 + (i % 3 === 0 ? 0.18 : i % 3 === 1 ? -0.12 : 0.04);
    for (const dz of [0.28, -0.28]) {
      trestles.push({ x, y: deckY + 0.42, z: dz });
    }
  }
  addInstances(g, chamferBox(0.14, 0.84, 0.14, 0.03), mats.steelDark, trestles);
  addSlab(g, 30.2, 0.07, 0.72, mats.steelPale, 0.3, catwalkY, 0, { chamfer: 0.02 });
  addDeckRail(g, mats.steelPale, -14.6, 15.4, 0.38, catwalkY, 1.55, 0.42);
  addDeckRail(g, mats.steelPale, -14.6, 15.4, -0.38, catwalkY, 1.55, 0.42);

  const domes = [-11.2, -4.1, 3.2, 10.4];
  const hatchRails = [];
  for (let i = 0; i < domes.length; i += 1) {
    const x = domes[i];
    addCyl(g, 0.95, 1.02, 0.42, 10, mats.steelDark, x, deckY + 0.22, 0);
    addSphere(g, 1.05, 10, mats.tank, x, deckY + 0.48, 0, { scaleY: 0.46 });
    addCyl(g, 0.22, 0.22, 0.16, 8, mats.steel, x, deckY + 0.98, 0);
    addSlab(g, 0.42, 0.06, 0.42, mats.steelPale, x, deckY + 1.08, 0, { chamfer: 0.02 });
    for (const a of [0, 1, 2, 3]) {
      const ang = a * HALF_PI + 0.2 * i;
      hatchRails.push({
        x: x + Math.cos(ang) * 0.72,
        y: deckY + 0.72,
        z: Math.sin(ang) * 0.72,
      });
    }
  }
  addInstances(g, chamferBox(0.16, 0.38, 0.16, 0.04), mats.steelPale, hatchRails);

  const pipeRuns = [
    { z: 1.42, y: deckY + 0.38, r: 0.09, len: 24, mat: mats.steelDark },
    { z: 1.68, y: deckY + 0.52, r: 0.07, len: 21, mat: mats.steelPale },
    { z: -1.48, y: deckY + 0.44, r: 0.08, len: 22.5, mat: mats.steel },
  ];
  const flanges = [];
  for (const run of pipeRuns) {
    pipeX(g, run.r, run.len, run.mat, 0.6, run.y, run.z);
    for (let i = 0; i < 8; i += 1) {
      flanges.push({
        x: -10.4 + i * 3.05 + (run.z > 0 ? 0.2 : -0.15),
        y: run.y,
        z: run.z,
        rz: HALF_PI,
      });
    }
  }
  addInstances(g, new THREE.CylinderGeometry(0.19, 0.19, 0.14, 8), mats.rust ?? mats.steelDark, flanges);

  addSlab(g, 2.6, 0.72, 2.9, mats.steelDark, 0.2, deckY + 0.42, 0, { chamfer: 0.08 });
  pipeZ(g, 0.12, 3.8, mats.steelDark, 0.2, deckY + 0.78, 0);
  pipeX(g, 0.1, 2.2, mats.steelPale, 0.2, deckY + 0.92, 0.55);
  addCyl(g, 0.28, 0.32, 0.16, 10, mats.grease ?? mats.rubber, 0.2, deckY + 0.78, 0);
  addCyl(g, 0.22, 0.22, 0.2, 8, mats.grease ?? mats.rubber, 0.2, deckY + 1.08, 0,
    { rotX: HALF_PI });
  addCyl(g, 0.16, 0.18, 0.14, 8, mats.grease ?? mats.rubber, 0.7, deckY + 0.78, 0.55);
  addCyl(g, 0.16, 0.18, 0.14, 8, mats.grease ?? mats.rubber, -0.25, deckY + 0.78, -0.5);
  addCyl(g, 0.14, 0.14, 0.22, 8, mats.steelPale, 0.55, deckY + 1.12, 0.2);
  addCyl(g, 0.14, 0.14, 0.22, 8, mats.steelPale, -0.15, deckY + 1.12, -0.25);
  const manifold = new THREE.Group();
  manifold.name = 'fringe:ship:tanker:manifold';
  manifold.position.set(0.2, deckY + 1.05, 0);
  g.add(manifold);
  addSlab(manifold, 2.15, 0.08, 1.85, mats.steelDark, 0, -0.92, 0, { chamfer: 0.03 });
  addSlab(manifold, 1.85, 0.05, 1.55, mats.grease ?? mats.rubber, 0, -0.86, 0, { chamfer: 0.02 });
  for (const [vx, vz] of [[0.42, 0.48], [-0.38, -0.42], [0.55, -0.28], [-0.5, 0.32]]) {
    addCyl(manifold, 0.16, 0.16, 0.12, 8, mats.steelPale, vx, -0.18, vz);
    addCyl(manifold, 0.28, 0.28, 0.05, 10, mats.cladRed ?? mats.redBoot, vx, 0.08, vz,
      { rotX: HALF_PI });
    /* P16-PM7 item 5 — the four tie rods round each connection were 0.07 m across
     * the flats and 2.8 px at oil-sea: the last family on the hairline law's near
     * list. 0.13 m resolves and is still a tie rod against a 0.56 m flange. */
    addCyl(manifold, 0.075, 0.075, 0.52, 6, mats.steelDark, vx, 0.08, vz, { rotZ: HALF_PI });
    addCyl(manifold, 0.075, 0.075, 0.52, 6, mats.steelDark, vx, 0.08, vz);
  }
  /* ── P16-PM7 item 2 — THE ARMS LAND ON SOMETHING. ──
   * P16A3 pack-i and P16A4 both read the outboard tip as "a plain white cube …
   * no manifold, no flange and no coupling beneath it". There WAS a manifold —
   * one, amidships — and the two loading arms come down 3 m either side of it,
   * because `TANKER_ARM_SPACING` is the pedestal spacing on the jetty. A tanker
   * takes a ROW of connections, one per arm, so there is one presentation per
   * arm now: a bolted riser, a raised flange face with its bolt ring, and the
   * drip tray under it. The spacing is stated once, here, and `port.js` places
   * its pedestals off the same number, so the arm and the flange it lands on
   * cannot drift apart. */
  for (const side of [-1, 1]) {
    const rx = side * TANKER_ARM_SPACING * 0.5;
    addSlab(manifold, 1.5, 0.08, 1.5, mats.steelDark, rx, -0.92, 0, { chamfer: 0.03 });
    addSlab(manifold, 1.25, 0.05, 1.25, mats.grease ?? mats.rubber, rx, -0.86, 0,
      { chamfer: 0.02 });
    addCyl(manifold, 0.24, 0.28, 0.62, 10, mats.steelPale, rx, -0.52, 0);
    addCyl(manifold, 0.44, 0.44, 0.14, 12, mats.cladRed ?? mats.redBoot, rx, -0.14, 0);
    addCyl(manifold, 0.34, 0.34, 0.16, 10, mats.grease ?? mats.rubber, rx, 0.02, 0);
    addCyl(manifold, 0.44, 0.44, 0.1, 12, mats.steelPale, rx, 0.14, 0);
    // The spool back to the deck line, so the riser is fed rather than planted.
    addCyl(manifold, 0.16, 0.16, Math.abs(rx) * 0.72, 8, mats.steelPale,
      rx - side * Math.abs(rx) * 0.36, -0.66, 0, { rotZ: HALF_PI });
  }
  g.userData.manifold = { x: 0.2, y: deckY + 1.05, z: 0 };
  g.userData.deckY = deckY;
  g.userData.catwalkY = catwalkY;

  const hoseReel = new THREE.Group();
  hoseReel.name = 'fringe:ship:tanker:hose-reel';
  hoseReel.position.set(1.18, deckY, 1.52);
  noPick(hoseReel);
  g.add(hoseReel);
  addCyl(hoseReel, 0.07, 0.08, 1.05, 8, mats.steelDark, 0, 0.52, 0);
  addCyl(hoseReel, 0.4, 0.4, 0.36, 10, mats.steelPale, 0, 0.88, 0, { rotZ: HALF_PI });
  addCyl(hoseReel, 0.46, 0.46, 0.06, 10, mats.cladRed ?? mats.redBoot, 0.16, 0.88, 0,
    { rotZ: HALF_PI });
  addCyl(hoseReel, 0.46, 0.46, 0.06, 10, mats.cladRed ?? mats.redBoot, -0.16, 0.88, 0,
    { rotZ: HALF_PI });
  addCyl(hoseReel, 0.07, 0.07, 1.15, 8, mats.rubber ?? mats.blackHull, 0.38, 0.42, 0.18,
    { rotX: 0.55 });
  addCyl(hoseReel, 0.06, 0.06, 0.7, 8, mats.rubber ?? mats.blackHull, 0.55, 0.22, 0.55,
    { rotX: HALF_PI });

  const stretcher = new THREE.Group();
  stretcher.name = 'fringe:ship:tanker:pipe-stretcher';
  stretcher.position.set(8.35, catwalkY, 0);
  noPick(stretcher);
  g.add(stretcher);
  addBox(stretcher, 0.16, 0.22, 0.7, mats.steelDark, -1.55, 0.08, 0);
  addBox(stretcher, 0.16, 0.22, 0.7, mats.steelDark, 1.55, 0.08, 0);
  addBox(stretcher, 3.5, 0.06, 0.55, mats.steelPale, 0, 0.2, 0);
  addCyl(stretcher, 0.09, 0.09, 3.35, 8, mats.steelPale, 0, 0.32, 0.12, { rotZ: HALF_PI });
  addCyl(stretcher, 0.07, 0.07, 3.2, 8, mats.steel, 0, 0.32, -0.1, { rotZ: HALF_PI });
  addCyl(stretcher, 0.08, 0.08, 0.16, 8, mats.rust ?? mats.steelDark, -1.4, 0.32, 0.12,
    { rotZ: HALF_PI });
  addCyl(stretcher, 0.08, 0.08, 0.16, 8, mats.rust ?? mats.steelDark, 1.4, 0.32, 0.12,
    { rotZ: HALF_PI });

  const deckCrane = new THREE.Group();
  deckCrane.name = 'fringe:ship:tanker:deck-crane';
  noPick(deckCrane);
  g.add(deckCrane);
  addDeckCrane(deckCrane, mats, 0.35, -2.15, deckY, 0.58,
    { name: 'fringe:ship:tanker:deck-crane:jib', pivotY: 3.4, jib: 5.4, slew: Math.PI });

  addCyl(g, 0.12, 0.14, 1.15, 8, mats.steelPale, 4.8, deckY + 0.7, 2.35);
  addCyl(g, 0.08, 0.08, 0.85, 6, mats.redBoot ?? mats.cladRed, 4.8, deckY + 1.45, 2.35,
    { rotZ: 0.55 });
  addCyl(g, 0.05, 0.09, 0.22, 6, mats.steelDark, 5.15, deckY + 1.78, 2.35, { rotZ: HALF_PI });

  for (const wx of [L * 0.30, -L * 0.22]) {
    const wz = Math.min(2.55, hb(wx, 1) * 0.6);
    addCyl(g, 0.42, 0.42, 0.85, 10, mats.steelDark, wx, deckY + 0.48, wz, { rotZ: HALF_PI });
    addCyl(g, 0.12, 0.12, 0.7, 8, mats.steelPale, wx, deckY + 0.48, wz, { rotZ: HALF_PI });
    addSlab(g, 0.7, 0.16, 0.7, mats.steel, wx, deckY + 0.08, wz, { chamfer: 0.04 });
  }

  // Same davit law as the hero hull: posts on the deck, arm cantilevered out,
  // boat hanging under the outboard end.
  const boatIn = -(hb(-L * 0.28, 1) - 0.4);
  const boatOut = -(hb(-L * 0.28, 1) + 0.5);
  addCyl(g, 0.24, 0.24, 2.15, 8, mats.lifeboat, -L * 0.28, deckY + 1.15, boatOut,
    { rotX: HALF_PI });
  for (const ox of [-0.85, 0.85]) {
    addSlab(g, 0.24, 1.4, 0.24, mats.steelPale, -L * 0.28 + ox, deckY + 0.5, boatIn,
      { chamfer: 0.04 });
    addSlab(g, 0.16, 0.16, Math.abs(boatOut - boatIn) + 0.2, mats.steelPale, -L * 0.28 + ox,
      deckY + 1.9, (boatIn + boatOut) * 0.5, { chamfer: 0.04 });
    addCyl(g, 0.07, 0.07, 0.8, 6, mats.steelDark, -L * 0.28 + ox, deckY + 1.55, boatOut);
  }
  addSlab(g, 1.9, 0.14, 0.14, mats.steelPale, -L * 0.28, deckY + 1.94, boatIn, { chamfer: 0.03 });

  const bitts = [];
  for (const [bk, zk] of [[0.36, 0.68], [0.28, 0.76], [-0.42, 0.66], [-0.34, 0.74]]) {
    const bx = L * bk;
    const bz = hb(bx, 1) * zk;
    bitts.push({ x: bx, y: deckY + 0.28, z: bz });
    bitts.push({ x: bx, y: deckY + 0.28, z: -bz });
  }
  addInstances(g, new THREE.CylinderGeometry(0.12, 0.14, 0.55, 8), mats.steelDark, bitts);

  // P16-PM2B: `stack: false`. The tanker was carrying TWO funnels — one built
  // by `aftHouse` at `x − w·0.24` and one built here at `x` — 1.3 m apart on a
  // ship that has one uptake. The house builds the accommodation; this file
  // builds the stack, on the house top the house reports.
  const tHouse = aftHouse(g, mats, {
    x: -L * 0.38, deckY, B, decks: 3, w: 5.6, body: mats.white, stack: false,
  });
  const tankerNameS = 0.82;
  const tankerNameGap = 0.04;
  const tankerLines = ['PORT OF', 'MELBOURNE'];
  const tankerNameW = Math.max(
    ...tankerLines.map((ln) => toyLetterWidth(ln, tankerNameS, tankerNameGap)),
  );
  const tankerNameH = tankerLines.length * tankerNameS + (tankerLines.length - 1) * 0.08 + 0.34;
  const tankerName = new THREE.Group();
  tankerName.name = 'fringe:ship:tanker:name';
  // R4 fault 12 — at the 92 m oil-sea crop the deck-edge band of the after
  // house (authored at `dd + 0.16` deep, i.e. 0.08 m proud of `B·0.4`) hung
  // directly over a plate seated at `B·0.4 + 0.12`, clipping the top of "PORT
  // OF" and eating the left stem of the "M" so it read "HELBOURNE". The plate
  // moves off the house entirely and onto the HULL SIDE below the deck line —
  // the place a real ship carries its port of registry, and the one band of
  // topside with nothing above it. Group name, `userData.lines` and the
  // `heroPoses.oil` lookup in port.js are untouched.
  // ── P16-PM2 ITEM 3 (PM1 hand-off) — THE NAME IS ON THE HULL, NOT ON A BOARD
  // AT THE BERTH LINE. ──
  // The plate was 2.26 m tall centred at `deckY − 0.95`, so it ran from 0.42 m
  // UNDER the water to 2.0 m above it, seated at the half-breadth the shell has
  // at mid-height. The shell narrows below the waterline, so the bottom of the
  // board stood 2.5 m clear of the plating: at `oil-sea` it reads as a
  // billboard standing on the berth line with the tanker passing through it.
  // The board keeps its 0.82 m glyphs (the A5/A6 readability pin), and instead
  // the FURNITURE round them shrinks: line gap 0.12 → 0.08 and margin 0.50 →
  // 0.34 take the plate from 2.26 m to 2.06 m, which is what fits between the
  // waterline at 0.17 and the bulwark cap at 2.38 on this hull. Band 0.25 →
  // 2.31: 0.08 m of clear topside under it, 0.07 m under the cap over it, and
  // flush against a shell that is vertical over the whole run.
  tankerName.position.set(-L * 0.30, deckY - 0.55, hb(-L * 0.30, 0.75) + 0.06);
  tankerName.rotation.y = 0;
  tankerName.userData.s = tankerNameS;
  tankerName.userData.letterYaw = 0;
  tankerName.userData.lines = tankerLines;
  noPick(tankerName);
  addBox(tankerName, tankerNameW + 0.5, tankerNameH, 0.1, mats.plateBlue ?? mats.blueHull, 0, 0, 0);
  addBox(tankerName, tankerNameW + 0.6, 0.07, 0.13, mats.steelPale, 0, tankerNameH * 0.5 + 0.015, 0);
  let tankerBase = tankerNameH * 0.5 - 0.15 - tankerNameS;
  for (const ln of tankerLines) {
    const lw = toyLetterWidth(ln, tankerNameS, tankerNameGap);
    toyLettersOrDecal(tankerName, ln, mats.white, -lw * 0.5, tankerBase, 0.07, {
      s: tankerNameS, gap: tankerNameGap, depth: 0.08, yaw: 0,
    });
    tankerBase -= tankerNameS + 0.08;
  }
  g.add(tankerName);
  funnel(g, mats.blackHull, mats.redBoot, mats.soot, -L * 0.38, tHouse.bridgeTop + 0.05, 0,
    0.62, 2.0);
  addSlab(g, 0.24, 2.6, 0.24, mats.steel, L * 0.4,
    slabTopAt(0.24, 2.6, 0.24, 0.05, deckY + 2.7), 0, { chamfer: 0.05 });
}

function buildCruise(g, mats) {
  const L = SHIP_LENGTH.cruise;
  // TASTE-R1 W3-B: beam 9.0 -> 7.6 (the strakes stand 0.4 m past B: an 8.0 m hull, bible s4 1:4 cruise ship
  // 55 x 8 x 14). Every house, bridge and wing is B-relative.
  const B = 7.6;
  const D = 2.55;
  const deckY = addMerchantHull(g, mats, { L, B, D, hull: mats.navyHull, boot: mats.redBoot });
  const hb = g.userData.hullGrid.hbAtX;
  const superL = L * 0.7;
  const decks = 5;
  // ── P16-PM2 ITEM 1 — THE PASSENGER BLOCK IS ONE CASING. ──
  // Five `addBox` tiers, each with a `w + 0.12` grey plate under it and a
  // `w + 0.10` navy plate over it, is fifteen stacked slabs and it reads as
  // exactly that. One battered casing with the tier lines cut in as reveals
  // holds the same value gradient in one silhouette.
  // ── P16-PM2B ITEM 1 — FIVE ENCLOSED PASSENGER DECKS. ──
  // PM2 replaced fifteen stacked slabs with one battered casing carrying four
  // 0.10-batter reveals; on a 28 m block a reveal is a 1.4 m step, and four of
  // them at the quay-hero polar are four terraces with four dark undersides.
  // Each deck is now a closed block, stepping in ≤ 0.6 m per side, with the
  // promenade glass flush on the same plan rather than a `windowRow` box
  // authored at a half-breadth the reveal had already moved.
  const superX = -L * 0.08;
  const cTiers = [];
  for (let i = 0; i < decks; i += 1) {
    cTiers.push({
      w: superL - i * 0.5, d: B * 0.86 - i * 0.40, h: 0.62, edge: 0.10,
      mat: i === 0 ? (mats.greyLight ?? mats.white) : mats.white,
      sill: 0.26, head: 0.80,
    });
  }
  const cHouse = deckhouse(g, mats, {
    x: superX, y0: deckY + 0.06, tiers: cTiers, body: mats.white, glass: mats.glass,
    deck: mats.greyDark ?? mats.steelDark, name: 'cruise:house', stations: 9,
  });
  // The navigating bridge is its own block forward of the passenger stack, with
  // wings out to the ship's side — which is what a bridge on a passenger ship
  // looks like and what stops the forward end being a blank white gable.
  const bridgeY = cHouse.top;
  const cBridge = deckhouse(g, mats, {
    x: L * 0.16, y0: bridgeY - 0.62,
    tiers: [{ w: 5.4, d: B * 0.66, h: 0.9, edge: 0.14, mat: mats.white, sill: 0.18, head: 0.86 }],
    body: mats.white, glass: mats.glass, deck: mats.greyDark ?? mats.steelDark,
    name: 'cruise:bridge', stations: 7,
  });
  for (const sgn of [1, -1]) {
    bridgeWing(g, mats, {
      x: L * 0.16, y: bridgeY - 0.36, z: sgn * (B * 0.33 + 0.05),
      out: Math.max(0.7, B * 0.47 - B * 0.33), len: 2.0,
      deckMat: mats.greyDark ?? mats.steelDark, wallMat: mats.white,
    });
  }
  void cBridge;
  funnel(g, mats.navyHull, mats.white, mats.soot, -L * 0.16, cHouse.top, 0, 0.95, 2.8);
  /* P16-PM7 item 5 — the radar mast was seated by its TOP at `cHouse.top + 3.4`,
   * which puts its foot 0.6 m above the house it stands on: PM6's declared FLOAT
   * exception 1, last entry. The mast now starts on the house top. */
  addSlab(g, 0.26, 2.8, 0.26, mats.steel, -L * 0.08,
    slabTopAt(0.26, 2.8, 0.26, 0.05, cHouse.top + 2.8), 0, { chamfer: 0.05 });
  addSphere(g, 0.32, 8, mats.greyLight, -L * 0.08, cHouse.top + 3.0, 0);
  for (const sgn of [1, -1]) {
    for (let i = -3; i <= 3; i += 1) {
      const bx = i * 3.1 - 0.8;
      addCyl(g, 0.22, 0.22, 1.15, 8, mats.lifeboat, bx, deckY + 1.35, sgn * (hb(bx, 1) + 0.1),
        { rotX: HALF_PI });
    }
  }
  // The pool deck sits ON the house top rather than at an arithmetic guess of
  // it: the old `deckY + decks·0.7 + 0.55` was 0.39 m clear of the block once
  // the tier heights changed, which is how a prop starts floating.
  addSlab(g, 3.2, 0.16, 2.4, mats.white, L * 0.02,
    slabTopAt(3.2, 0.16, 2.4, 0.04, cHouse.top + 0.16), 0, { chamfer: 0.04 });
  addSlab(g, 1.6, 0.1, 1.1, mats.pool, L * 0.02,
    slabTopAt(1.6, 0.1, 1.1, 0.02, cHouse.top + 0.2), 0, { chamfer: 0.02 });
}

function buildSpirit(g, mats) {
  const L = SHIP_LENGTH['spirit-of-tasmania'];
  // TASTE-R1 W3-B: beam 10.2 -> 7.0 (the belt and strakes stand 0.5 m past B: a 7.5 m hull, bible s4 1:4 Spirit of
  // Tasmania 48 x 7.5 x 11). The houses, bridge, ramp and belt are B-relative; the two funnels stand at z = +-1.55
  // and the lifeboats on the shell's own half-breadth.
  const B = 7.0;
  const D = 3.25;
  // ── P16-PM2 ITEM 1 — THE FERRY IS ONE LOFTED HULL AND ONE CASING. ──
  // Before: a box hull, a boot slab, gunwales, three bow boxes, a transom box,
  // four belt slabs, two house boxes and their four proud plates — nineteen
  // slabs stacked co-axially, which is the "stepped slab" reading the user's
  // screenshots name on every vessel in the venue.
  const deckY = addMerchantHull(g, mats, {
    L, B, D, hull: mats.spiritRed, boot: mats.redBoot, bulb: false,
  }) + 0.20;
  const grid = g.userData.hullGrid;
  const hb = grid.hbAtX;
  // The TT-Line belt is a band cut off the SAME grid, so it wraps the shell.
  const beltLev = [];
  for (const v of [0.40, 0.56]) {
    const lv = [];
    for (let i = 0; i < grid.stations; i += 1) {
      const t = 0.5 - 0.5 * Math.cos(Math.PI * (i / (grid.stations - 1)));
      const bx = grid.xAt(t, v);
      lv.push([bx, BOTTOM + D * v, hb(bx, v) + 0.05]);
    }
    beltLev.push(lv);
  }
  loftMesh(g, loftBand(beltLev), mats.spiritStripe, 'spirit:belt');
  const ramp = addBox(g, 0.22, D * 0.7, B * 0.62, mats.steelDark, grid.xAt(0.03, 0.5),
    BOTTOM + D * 0.42, 0);
  ramp.rotation.z = 0.18;
  for (const sgn of [1, -1]) {
    addBox(g, 4.8, 1.35, 0.1, mats.steelDark, -L * 0.12, BOTTOM + 1.15,
      sgn * (hb(-L * 0.12, 0.44) + 0.04));
  }
  // ── P16-PM2B ITEM 1 — THE FERRY'S TWO PASSENGER DECKS ARE TWO BLOCKS. ──
  // One casing with a single 0.09 reveal on a 23.8 m house is a 1.07 m terrace
  // across the whole side, and the `windowRow` strips that dressed it were
  // authored at `B · 0.42` — 0.32 m clear of a casing already battered 0.12 in.
  const sHouse = deckhouse(g, mats, {
    x: -L * 0.05, y0: deckY + 0.04,
    tiers: [
      { w: L * 0.70, d: B * 0.90, h: 1.32, edge: 0.14, mat: mats.white, sill: 0.30, head: 0.82 },
      { w: L * 0.66, d: B * 0.82, h: 1.30, edge: 0.14, mat: mats.white, sill: 0.26, head: 0.80 },
    ],
    body: mats.white, glass: mats.glass, deck: mats.greyDark ?? mats.steelDark,
    name: 'spirit:house', stations: 9,
  });
  addSlab(g, L * 0.72, 0.22, hb(-L * 0.02, 1) * 2 + 0.12, mats.spiritBlue, -L * 0.02,
    deckY - 0.34, 0, { chamfer: 0.06 });
  addSlab(g, L * 0.58, 0.10, B * 0.80, mats.spiritStripe, -L * 0.06,
    slabTopAt(L * 0.58, 0.10, B * 0.80, 0.03, sHouse.levels[0].y1 + 0.02), 0, { chamfer: 0.03 });
  // The bridge sits ON the house top with wings out to the ship's side.
  const sBridge = deckhouse(g, mats, {
    x: L * 0.20, y0: sHouse.top,
    tiers: [{ w: 4.8, d: B * 0.58, h: 0.95, edge: 0.14, mat: mats.white, sill: 0.18, head: 0.86 }],
    body: mats.white, glass: mats.glass, deck: mats.greyDark ?? mats.steelDark,
    name: 'spirit:bridge', stations: 7,
  });
  for (const sgn of [1, -1]) {
    bridgeWing(g, mats, {
      x: L * 0.20, y: sHouse.top + 0.3, z: sgn * (B * 0.29 + 0.05), out: B * 0.14, len: 1.9,
      deckMat: mats.greyDark ?? mats.steelDark, wallMat: mats.white,
    });
  }
  void sBridge;
  funnel(g, mats.spiritStripe, mats.white, mats.soot, -L * 0.08, sHouse.top, 1.55, 0.72, 2.65);
  funnel(g, mats.spiritStripe, mats.white, mats.soot, -L * 0.08, sHouse.top, -1.55, 0.72, 2.65);
  addSlab(g, 1.4, 0.18, 3.5, mats.spiritStripe, -L * 0.08,
    slabTopAt(1.4, 0.18, 3.5, 0.04, sHouse.top + 0.18), 0, { chamfer: 0.04 });
  for (const sgn of [1, -1]) {
    for (const bx of [4.2, -5.4]) {
      addCyl(g, 0.2, 0.2, 1.05, 8, mats.lifeboat, bx, deckY + 0.9, sgn * (hb(bx, 1) + 0.1),
        { rotX: HALF_PI });
    }
  }
  addSphere(g, 0.16, 6, mats.lamp, L * 0.44, deckY + 0.4, 0);
}


/**
 * ── P16-PM2B ITEM 2 — THE GUN IS ONE FORM. ──
 * Was a cylinder, a box, a pipe and a cap at four different diameters with the
 * barrel emerging from a face nothing carried. Now: a barbette the turret turns
 * on, one shell for the turret with a raked face, and a barrel that leaves that
 * face on the face's own axis at a section that survives the play camera.
 */
function addGun(g, mats, x, deckY, barrel, turretR) {
  addCyl(g, turretR * 0.92, turretR * 1.0, 0.34, 10, mats.greyDark, x, deckY + 0.17, 0);
  const face = x + turretR * 0.78;
  addSlab(g, turretR * 1.9, 0.78, turretR * 1.6, mats.grey, x + 0.1,
    slabTopAt(turretR * 1.9, 0.78, turretR * 1.6, 0.14, deckY + 1.12), 0, { chamfer: 0.14 });
  addSlab(g, turretR * 0.6, 0.5, turretR * 1.1, mats.grey, face - 0.05,
    slabTopAt(turretR * 0.6, 0.5, turretR * 1.1, 0.1, deckY + 0.98), 0,
    { chamfer: 0.1, rotZ: -0.22 });
  pipeX(g, 0.1, barrel, mats.greyDark, face + barrel * 0.5, deckY + 0.72, 0);
  addCyl(g, 0.15, 0.15, 0.34, 8, mats.greyDark, face + barrel, deckY + 0.72, 0, { rotZ: HALF_PI });
}

/**
 * ── P16-PM2B ITEM 2 — THE WARSHIPS ARE LOFTED HULLS. ──
 *
 * PM2 RESIDUAL 7, closed. What stood here: one `addBox` main hull, two co-axial
 * chamfered courses over it, a knuckle strake, a boot slab, gunwales, a deck
 * box, and `addRakedBow`'s four boxes plus a rotated stem blade — eleven
 * co-axial solids at five different beams. From any quarter you counted courses
 * instead of reading a hull, which is the same fault the merchant fleet had and
 * the same answer: ONE grid of stations × levels, with the boot, the wet band,
 * the topside, the deck edge and the deck cut off it as material bands.
 *
 * A warship's lines differ from a workboat's in three numbers and they are the
 * three `craftGrid` already takes: a fine entry (`bowFine` 2.1 against a tug's
 * 1.35), a full transom (`transomK`), and sheer that lifts hard forward. The
 * house is one enclosed `deckhouse` rather than four slabs with a band between
 * them, and the mast is a section the play camera can resolve.
 *
 * `military:warship-dress` overlays this hull during a sea fight and takes its
 * plan from `HULL_PLAN` in `warship-dress.js` (half-beam 3.46 amidships, pinned
 * by `p14-military-art`). `warship-a`'s beam is set so the overlay's ribbons
 * stay just proud of this shell rather than sinking into it.
 */
function buildWarship(g, mats, kind) {
  const spec = kind === 'warship-a'
    ? { L: 32, B: 6.72, D: 2.22, mast: 7.5, gun: 1.12, barrel: 2.85, helo: true, vls: true }
    : { L: 26, B: 5.6, D: 2.02, mast: 6.15, gun: 0.92, barrel: 2.15, helo: false, vls: false };
  const { L, B, D } = spec;
  const deckY = BOTTOM + D + 0.12;
  const grid = addCraftHull(g, mats, {
    L, B, keelY: BOTTOM, deckY, waterlineY: WATER_Y,
    hull: mats.hullGrey ?? mats.grey, boot: mats.soot,
    band: mats.hullGreyDark ?? mats.greyDark ?? mats.steelDark,
    deck: mats.deckDark ?? mats.deck,
    bulwark: 0.30, bulwarkT: 0.12, stations: 18,
    transomK: 0.70, bowFine: 2.1, sheerK: 0.20,
    name: `fringe:ship:${kind}:hull`,
  });
  const hb = grid.hbAtX;
  // PM9 class 3: the shell's normal map carries plate butts. The physical run
  // was a field of thin rods that faceted the hull at every audit pose.
  const retiredButts = new THREE.Group();
  retiredButts.name = `fringe:ship:${kind}:plate-butts`;
  retiredButts.userData.retiredVisual = true;
  g.add(retiredButts);
  addGun(g, mats, L * 0.28, deckY, spec.barrel, spec.gun);
  if (spec.vls) {
    const cells = [];
    for (let i = 0; i < 8; i += 1) {
      cells.push({ x: L * 0.08 + (i % 4) * 0.5, y: deckY + 0.22, z: (i < 4 ? 0.55 : -0.55) });
    }
    addSlab(g, 2.6, 0.34, 1.9, mats.grey, L * 0.115,
      slabTopAt(2.6, 0.34, 1.9, 0.06, deckY + 0.3), 0, { chamfer: 0.06 });
    addInstances(g, chamferBox(0.42, 0.14, 0.42, 0.03), mats.greyDark, cells,
      `fringe:ship:${kind}:vls`);
  }
  const houseX = spec.helo ? -L * 0.04 : -L * 0.02;
  // ── ONE ENCLOSED SUPERSTRUCTURE. ──
  // Was: a 1.35 m slab, a 0.09 m band 0.14 m PROUD of it on all four sides, a
  // 1.1 m slab, a 0.14 m band proud again, plus eight 0.06 m rods standing off
  // the sides. Two blocks and two proud plates is a slab stack whatever the
  // chamfer is. `deckhouse` walls each level floor-to-deck and puts the glass
  // flush on the same plan.
  const house = deckhouse(g, mats, {
    x: houseX, y0: deckY + 0.02,
    tiers: [
      { w: 6.3, d: B * 0.60, h: 1.28, edge: 0.12, mat: mats.grey, sill: 0.34, head: 0.74 },
      { w: 4.4, d: B * 0.46, h: 1.05, edge: 0.12, mat: mats.greyLight ?? mats.grey, sill: 0.18, head: 0.86, dx: 0.55 },
    ],
    body: mats.grey, glass: mats.glass, deck: mats.deckDark ?? mats.greyDark,
    name: `fringe:ship:${kind}:house`, stations: 7,
  });
  for (const sgn of [1, -1]) {
    bridgeWing(g, mats, {
      x: houseX + 0.55, y: house.levels[0].y1 + 0.3, z: sgn * (B * 0.23 + 0.05),
      out: Math.max(0.55, B * 0.36 - B * 0.23), len: 1.5,
      deckMat: mats.deckDark ?? mats.greyDark, wallMat: mats.greyLight ?? mats.grey,
    });
  }
  for (const z of [-B * 0.14, 0, B * 0.14]) {
    addBox(g, 0.14, 0.34, B * 0.1, mats.soot, houseX + 2.62, house.levels[0].y1 + 0.5, z);
  }
  // Uptake casing behind the house, then the mast: 0.26 m section against the
  // 0.16 m post that read as a hairline at the play camera.
  funnel(g, mats.grey, mats.greyDark ?? mats.soot, mats.soot, houseX - 1.6, house.top - 0.1, 0,
    0.62, 1.6);
  const mastX = houseX + 0.8;
  addSlab(g, 0.26, spec.mast, 0.26, mats.grey, mastX,
    slabTopAt(0.26, spec.mast, 0.26, 0.05, deckY + spec.mast), 0, { chamfer: 0.05 });
  if (!spec.helo) {
    for (const dz of [0.42, -0.42]) {
      strut(g, mats.grey, new THREE.Vector3(mastX - 1.05, deckY + spec.mast * 0.10, dz),
        new THREE.Vector3(mastX - 0.12, deckY + spec.mast * 0.72, dz * 0.3), 0.17, 0.17);
    }
  }
  addSlab(g, 1.7, 0.16, 0.42, mats.greyLight, mastX,
    slabTopAt(1.7, 0.16, 0.42, 0.04, deckY + spec.mast * 0.74), 0, { chamfer: 0.04 });
  addSphere(g, spec.helo ? 0.46 : 0.34, 8, mats.greyLight, mastX, deckY + spec.mast * 0.92, 0);
  addSlab(g, 0.2, 0.9, 0.75, mats.greyLight, mastX + 0.32,
    slabTopAt(0.2, 0.9, 0.75, 0.05, deckY + spec.mast * 0.58), 0, { chamfer: 0.05 });
  if (spec.helo) {
    addSlab(g, 6.4, 0.16, B * 0.74, mats.deckDark, -L * 0.32,
      slabTopAt(6.4, 0.16, B * 0.74, 0.04, deckY + 0.14), 0, { chamfer: 0.04 });
    addCyl(g, 1.35, 1.35, 0.06, 10, mats.yellow, -L * 0.34, deckY + 0.17, 0);
    const hangar = deckhouse(g, mats, {
      x: -L * 0.18, y0: deckY + 0.02,
      tiers: [{ w: 3.4, d: B * 0.66, h: 1.6, edge: 0.12, mat: mats.grey, windows: false }],
      body: mats.grey, glass: mats.glass, deck: mats.deckDark ?? mats.greyDark,
      name: `fringe:ship:${kind}:hangar`, stations: 7,
    });
    addSlab(g, 0.12, 1.15, B * 0.44, mats.greyDark, -L * 0.18 - 1.72,
      slabCentreAt(0.12, 1.15, B * 0.44, 0.03, deckY + 0.75), 0, { chamfer: 0.03 });
    void hangar;
    addGun(g, mats, -L * 0.42, deckY, 1.4, 0.55);
  } else {
    addSlab(g, 3.2, 0.62, B * 0.55, mats.greyDark, -L * 0.34,
      slabTopAt(3.2, 0.62, B * 0.55, 0.08, deckY + 0.66), 0, { chamfer: 0.08 });
    for (const sgn of [1, -1]) {
      addCyl(g, 0.2, 0.2, 0.95, 8, mats.lifeboat, -L * 0.28, deckY + 0.85,
        sgn * (hb(-L * 0.28, 1) - 0.3), { rotX: HALF_PI });
    }
    addSlab(g, 0.2, 2.2, 0.2, mats.grey, -L * 0.4,
      slabTopAt(0.2, 2.2, 0.2, 0.04, deckY + 2.2), 0, { chamfer: 0.04 });
    addSphere(g, 0.22, 6, mats.greyLight, -L * 0.4, deckY + 2.4, 0);
  }
  addSphere(g, 0.14, 6, mats.lamp, L * 0.42, deckY + 0.85, 0);
}

export function buildShip(id, group, mats, seed) {
  if (id === 'container') buildContainer(group, mats, seed);
  else if (id === 'tanker') buildTanker(group, mats);
  else if (id === 'cruise') buildCruise(group, mats);
  else if (id === 'spirit-of-tasmania') buildSpirit(group, mats);
  else buildWarship(group, mats, id);
}
