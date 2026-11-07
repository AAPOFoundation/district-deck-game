// District Deck V3.70 — SIGNAGE lane. The atlas: one CanvasTexture, one material, every sign.
//
// THE MATERIAL ARGUMENT, WHICH IS THE WHOLE REASON THIS IS AN ATLAS AND NOT A TEXTURE PER SIGN.
//
// §3.2 caps a building at nine material buckets and `sign-buckets.mjs` measures all three civic
// subjects at exactly nine — zero headroom. A technique that mints a material per sign is not
// "close to unusable" on this board, it is unusable: three signs on a hospital would be twelve
// buckets. A technique that mints ONE material for every sign on the whole board costs the board
// one material and one program, and costs a building that carries a sign one bucket.
//
// So every sign in the district lives in one 2048 x 2048 canvas, and a sign face is a quad whose
// UVs point at its cell. `board.js:357` opens one InstancedMesh per (model, material), so the
// board-wide draw-call bill for all signage everywhere is one instanced draw per archetype that
// carries a sign — not one per sign, and not one per placement.
//
// DETERMINISM (§3.3). No `Math.random`, no clock, no system font. Cell contents are a pure
// function of the cell key; the key is built from the caller's text, colours and geometry. Two
// buildings asking for the same sign get the same cell, which is also why a district of forty
// identical shopfronts costs one cell rather than forty.
//
// DISPOSAL. `board.js:6902` and `:8254` dispose any material that is not flagged
// `userData.sharedLibrary`, and this material is shared across every building on the board — so
// one building's teardown would take the whole district's signage with it. It is flagged shared
// and disposed with the MaterialLibrary that owns it.

import * as THREE from 'three';
import { layoutWord, normaliseText } from './alphabet.js';

export const ATLAS_SIZE = 2048;
/** Shelf pitch. Content is `SHELF - GUTTER_Y * 2` texels tall; the rest is bleed margin. */
export const SHELF = 128;
const GUTTER_Y = 16;
const GUTTER_X = 24;
/** UV inset, in texels, so bilinear filtering never samples the gutter's outer edge. */
const UV_INSET = 6;
const CONTENT_H = SHELF - GUTTER_Y * 2;

/**
 * Palette floor, V370 §5.2: author nothing near black. The post grade's shadow tint returns
 * saturated navy for anything under sRGB luma ~21, and sign ink is the one surface on a building
 * where the authored pixel IS the albedo (no family map multiplies it), so the floor binds here
 * literally rather than approximately. `#332d26` measures sRGB luma 46.
 */
export const SIGN_INK = '#332d26';
export const SIGN_GROUND = '#e6ddc9';

function isBrowser() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

class SignAtlas {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = ATLAS_SIZE;
    this.canvas.height = ATLAS_SIZE;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    // A flat mid field behind everything, so a cell that is never drawn reads as a blank plate
    // rather than as transparent black — the failure the lane must never ship.
    this.ctx.fillStyle = SIGN_GROUND;
    this.ctx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
    /** @type {Map<string, {u0:number,v0:number,u1:number,v1:number}>} */
    this.cells = new Map();
    this.shelfY = 0;
    this.penX = 0;
    this.full = false;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.anisotropy = 8;
    this.texture.needsUpdate = true;
    this.material = null;
  }

  /** Allocate a cell `wTex` x CONTENT_H texels. Returns null when the atlas is full. */
  _alloc(wTex) {
    const w = Math.min(Math.max(8, Math.round(wTex)), ATLAS_SIZE - GUTTER_X * 2);
    if (this.penX + w + GUTTER_X > ATLAS_SIZE) {
      this.shelfY += SHELF;
      this.penX = 0;
    }
    if (this.shelfY + SHELF > ATLAS_SIZE) {
      this.full = true;
      return null;
    }
    const x = this.penX + GUTTER_X;
    const y = this.shelfY + GUTTER_Y;
    this.penX = x + w;
    return { x, y, w, h: CONTENT_H };
  }

  /**
   * Get (drawing on first request) the cell for `key`.
   *
   * @param {string} key deterministic identity of the sign's pixels
   * @param {number} aspect content width / height, so a wide fascia gets a wide cell
   * @param {(ctx:CanvasRenderingContext2D, box:{x:number,y:number,w:number,h:number}) => void} draw
   * @returns {{u0:number,v0:number,u1:number,v1:number}|null}
   */
  cell(key, aspect, draw) {
    const hit = this.cells.get(key);
    if (hit) return hit;
    const box = this._alloc(CONTENT_H * aspect);
    if (!box) {
      console.warn(`[signage] atlas full at ${this.cells.size} cells; "${key}" gets a blank plate.`);
      return null;
    }
    // The gutter carries the sign's own ground colour so a mip level that reaches past the cell
    // edge returns the plate, never a neighbour's ink.
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(box.x - GUTTER_X, box.y - GUTTER_Y, box.w + GUTTER_X * 2, box.h + GUTTER_Y * 2);
    this.ctx.clip();
    draw(this.ctx, box);
    this.ctx.restore();
    this.texture.needsUpdate = true;
    const rect = {
      u0: (box.x + UV_INSET) / ATLAS_SIZE,
      v0: 1 - (box.y + box.h - UV_INSET) / ATLAS_SIZE,
      u1: (box.x + box.w - UV_INSET) / ATLAS_SIZE,
      v1: 1 - (box.y + UV_INSET) / ATLAS_SIZE,
    };
    this.cells.set(key, rect);
    return rect;
  }

  dispose() {
    this.texture.dispose();
    this.material?.dispose();
  }
}

/**
 * The one atlas, hung off the MaterialLibrary so it dies with it and so two renderers sharing a
 * library share their signage. `materials.userData` is the library's own extension point.
 */
export function getSignAtlas(materials) {
  if (!isBrowser()) return null;
  const store = materials?.userData;
  if (!store) return new SignAtlas();
  if (!store.__signAtlas) {
    const atlas = new SignAtlas();
    atlas.material = new THREE.MeshPhysicalMaterial({
      map: atlas.texture,
      color: 0xffffff,
      roughness: 0.58,
      metalness: 0.0,
      envMapIntensity: 1,
    });
    atlas.material.name = 'dd-mat:signage';
    // Shared across every building on the board — see the disposal note in the header.
    atlas.material.userData.sharedLibrary = true;
    atlas.material.userData.family = 'signage';
    atlas.material.userData.envIntensityBase = 0.62;
    store.__signAtlas = atlas;
  }
  return store.__signAtlas;
}

/** The single signage material, or null outside a browser. */
export function signageMaterial(materials) {
  return getSignAtlas(materials)?.material ?? null;
}

/**
 * Draw one lettered plate into a cell. Exported so the determinism probe can call it against a
 * bare canvas without a MaterialLibrary.
 *
 * `capFrac` is the cap height as a fraction of the plate height; the remainder is the margin a
 * real fascia leaves above and below its letters.
 */
export function paintPlate(ctx, box, {
  text, ink = SIGN_INK, ground = SIGN_GROUND, capFrac = 0.62, strokeRatio = 0.16,
  tracking = 0.10, rule = 0,
}) {
  ctx.fillStyle = ground;
  ctx.fillRect(box.x - GUTTER_X, box.y - GUTTER_Y, box.w + GUTTER_X * 2, box.h + GUTTER_Y * 2);
  const cap = box.h * capFrac;
  const avail = box.w * 0.90;
  // LETTER-SPACE TO FILL, THEN SQUEEZE TO FIT — which is what a signwriter does with a wide band.
  // The first version set the word at its natural tracking and centred it, and the measured
  // result on `board-both.png` was a 2.89 m word floating in a 12.8 m fascia: most of the sign
  // was empty and the letters were no larger for it. Tracking is free legibility here — wider
  // gaps stop adjacent stems merging at distance — so a word narrower than its plate is spread
  // rather than centred. It never grows past the plate, and it never leaves it.
  let word = layoutWord(text, { cap, strokeRatio, tracking });
  const glyphGaps = Math.max(1, normaliseText(text).length - 1);
  if (word.width > 0 && word.width < avail) {
    const extra = (avail - word.width) / (glyphGaps * cap);
    word = layoutWord(text, { cap, strokeRatio, tracking: Math.min(tracking + extra, 0.9) });
  }
  const sx = word.width > avail && word.width > 0 ? avail / word.width : 1;
  const originX = box.x + (box.w - word.width * sx) / 2;
  // Baseline sits so the ink block is optically centred: the cap box is centred, not the plate.
  const baseline = box.y + box.h - (box.h - cap) / 2;
  ctx.strokeStyle = ink;
  ctx.lineWidth = word.stroke;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.save();
  ctx.translate(originX, baseline);
  ctx.scale(sx, 1);
  for (const line of word.polylines) {
    ctx.beginPath();
    ctx.moveTo(line[0][0], -line[0][1]);
    for (let i = 1; i < line.length; i += 1) ctx.lineTo(line[i][0], -line[i][1]);
    ctx.stroke();
  }
  ctx.restore();
  if (rule > 0) {
    ctx.fillStyle = ink;
    ctx.fillRect(box.x + box.w * 0.06, box.y + box.h - rule, box.w * 0.88, rule);
  }
  return { cap, stroke: word.stroke, squeeze: sx, width: word.width * sx };
}
