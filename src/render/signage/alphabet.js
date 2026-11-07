// District Deck V3.70 — SIGNAGE lane. The alphabet, authored as stroke skeletons.
//
// WHY THIS FILE EXISTS, AND WHY IT IS NOT `fillText` WITH A SYSTEM FONT.
//
// §3.3 requires that the same id produce the same pixels. `ctx.fillText(s, x, y)` with a CSS
// family resolves through the host's font stack: `sans-serif` is Helvetica on this Mac, DejaVu
// Sans on a Linux CI box and Arial on Windows, and the three have different advance widths,
// different cap heights and different letterforms. A sign built that way is not deterministic
// across machines, it is deterministic across ONE machine — which is the failure mode that only
// shows up when somebody else regenerates the plate. `sign-font-determinism.mjs` measures the
// spread on this box rather than asserting it.
//
// So the alphabet lives here, as data. Every glyph is a set of POLYLINES on a normalised
// skeleton box, and the same data drives both renderers the facility offers:
//
//   the ATLAS route   — the polyline is stroked into a CanvasTexture cell (2 triangles a sign)
//   the RELIEF route  — each segment becomes a prism of applied metal (10 triangles a segment)
//
// One alphabet, two renderers, so a word is authored once and the lane picks the technique that
// fits its material budget. That is the whole point of the module.
//
// SKELETON SPACE. Glyph points are u ∈ [0,1] on both axes. `mapGlyph` remaps them so the INK —
// the stroked skeleton, not the skeleton — spans exactly [0, advance] × [0, capHeight]. A stroke
// centred on a skeleton at u=1 would otherwise overshoot the cap by half a stroke, which is the
// classic way a "1.2 m letter" measures 1.35 m on the plate. Cap height means the ink.
//
// The forms are a condensed grotesque with squared joints — the Australian applied-letter and
// painted-fascia idiom (pressed aluminium letters on a parapet, signwritten shopfronts). Round
// letters are chamfered polygons rather than true arcs because the relief route has to build
// each segment as a solid, and a 24-segment 'O' is 240 triangles nobody can see at board zoom.

/** Advance width as a multiple of cap height. Condensed: most caps are 0.66. */
const ADV = Object.freeze({
  I: 0.24, J: 0.56, L: 0.60, M: 0.90, W: 0.94, T: 0.62, ' ': 0.34,
  '-': 0.44, '.': 0.26, "'": 0.22, '1': 0.46, ',': 0.26, '/': 0.46,
});
const ADV_DEFAULT = 0.66;

/**
 * glyph → array of polylines, each an array of [u, v] with v=0 at the baseline.
 * Segment counts are kept low on purpose: they are the relief route's triangle bill.
 */
const GLYPHS = Object.freeze({
  ' ': [],
  A: [[[0.02, 0], [0.5, 1], [0.98, 0]], [[0.19, 0.32], [0.81, 0.32]]],
  B: [[[0, 0], [0, 1], [0.80, 1], [1, 0.79], [0.80, 0.55], [0, 0.55]],
    [[0.80, 0.55], [1, 0.29], [0.80, 0], [0, 0]]],
  C: [[[1, 0.82], [0.80, 1], [0.20, 1], [0, 0.78], [0, 0.22], [0.20, 0], [0.80, 0], [1, 0.18]]],
  D: [[[0, 0], [0, 1], [0.72, 1], [1, 0.72], [1, 0.28], [0.72, 0], [0, 0]]],
  E: [[[1, 1], [0, 1], [0, 0], [1, 0]], [[0, 0.52], [0.84, 0.52]]],
  F: [[[1, 1], [0, 1], [0, 0]], [[0, 0.54], [0.82, 0.54]]],
  G: [[[1, 0.82], [0.80, 1], [0.20, 1], [0, 0.78], [0, 0.22], [0.20, 0], [0.80, 0], [1, 0.20],
    [1, 0.46], [0.56, 0.46]]],
  H: [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, 0.52], [1, 0.52]]],
  I: [[[0.5, 0], [0.5, 1]]],
  J: [[[1, 1], [1, 0.22], [0.80, 0], [0.25, 0], [0.04, 0.20]]],
  K: [[[0, 0], [0, 1]], [[1, 1], [0.06, 0.44]], [[0.36, 0.62], [1, 0]]],
  L: [[[0, 1], [0, 0], [1, 0]]],
  M: [[[0, 0], [0, 1], [0.5, 0.40], [1, 1], [1, 0]]],
  N: [[[0, 0], [0, 1], [1, 0], [1, 1]]],
  O: [[[0.20, 1], [0.80, 1], [1, 0.78], [1, 0.22], [0.80, 0], [0.20, 0], [0, 0.22], [0, 0.78],
    [0.20, 1]]],
  P: [[[0, 0], [0, 1], [0.82, 1], [1, 0.78], [0.82, 0.52], [0, 0.52]]],
  Q: [[[0.20, 1], [0.80, 1], [1, 0.78], [1, 0.22], [0.80, 0], [0.20, 0], [0, 0.22], [0, 0.78],
    [0.20, 1]], [[0.62, 0.26], [1.02, -0.04]]],
  R: [[[0, 0], [0, 1], [0.82, 1], [1, 0.78], [0.82, 0.52], [0, 0.52]], [[0.42, 0.52], [1, 0]]],
  S: [[[1, 0.84], [0.80, 1], [0.22, 1], [0, 0.82], [0.22, 0.57], [0.78, 0.49], [1, 0.26],
    [0.78, 0], [0.20, 0], [0, 0.16]]],
  T: [[[0, 1], [1, 1]], [[0.5, 1], [0.5, 0]]],
  U: [[[0, 1], [0, 0.22], [0.20, 0], [0.80, 0], [1, 0.22], [1, 1]]],
  V: [[[0, 1], [0.5, 0], [1, 1]]],
  W: [[[0, 1], [0.25, 0], [0.5, 0.64], [0.75, 0], [1, 1]]],
  X: [[[0, 0], [1, 1]], [[0, 1], [1, 0]]],
  Y: [[[0, 1], [0.5, 0.52], [1, 1]], [[0.5, 0.52], [0.5, 0]]],
  Z: [[[0, 1], [1, 1], [0, 0], [1, 0]]],
  0: [[[0.20, 1], [0.80, 1], [1, 0.78], [1, 0.22], [0.80, 0], [0.20, 0], [0, 0.22], [0, 0.78],
    [0.20, 1]], [[0.18, 0.22], [0.82, 0.78]]],
  1: [[[0.06, 0.76], [0.5, 1], [0.5, 0]]],
  2: [[[0, 0.82], [0.20, 1], [0.80, 1], [1, 0.76], [0, 0], [1, 0]]],
  3: [[[0, 0.86], [0.20, 1], [0.80, 1], [1, 0.79], [0.80, 0.56], [0.36, 0.56]],
    [[0.80, 0.56], [1, 0.28], [0.80, 0], [0.20, 0], [0, 0.14]]],
  4: [[[0.74, 0], [0.74, 1], [0, 0.30], [1, 0.30]]],
  5: [[[1, 1], [0.10, 1], [0, 0.58], [0.70, 0.60], [1, 0.34], [0.80, 0], [0.20, 0], [0, 0.14]]],
  6: [[[0.90, 0.88], [0.70, 1], [0.25, 1], [0, 0.62], [0, 0.20], [0.20, 0], [0.78, 0], [1, 0.20],
    [1, 0.36], [0.78, 0.56], [0.20, 0.56], [0, 0.36]]],
  7: [[[0, 1], [1, 1], [0.34, 0]]],
  8: [[[0.22, 0.55], [0, 0.78], [0.22, 1], [0.78, 1], [1, 0.78], [0.78, 0.55], [0.22, 0.55],
    [0, 0.28], [0.22, 0], [0.78, 0], [1, 0.28], [0.78, 0.55]]],
  9: [[[0.10, 0.12], [0.30, 0], [0.75, 0], [1, 0.38], [1, 0.80], [0.80, 1], [0.22, 1], [0, 0.80],
    [0, 0.64], [0.22, 0.44], [0.80, 0.44], [1, 0.64]]],
  '-': [[[0.06, 0.50], [0.94, 0.50]]],
  '.': [[[0.5, 0.02], [0.5, 0.11]]],
  ',': [[[0.60, 0.10], [0.36, -0.12]]],
  "'": [[[0.5, 0.74], [0.42, 1]]],
  '/': [[[0, 0], [1, 1]]],
});

/** Fallback for anything unmapped: a filled bar, which is honest about being unreadable. */
const TOFU = [[[0.12, 0.06], [0.88, 0.06]], [[0.12, 0.5], [0.88, 0.5]], [[0.12, 0.94], [0.88, 0.94]]];

/** Advance width of one glyph in cap-height units, ink included. */
export function advanceOf(ch) {
  return ADV[ch] ?? ADV_DEFAULT;
}

export function glyphExists(ch) {
  return Object.prototype.hasOwnProperty.call(GLYPHS, ch);
}

/**
 * Normalise a caller's string into glyphs this alphabet actually has.
 * Uppercase only: a sign this small has no room for a lowercase x-height, and every Australian
 * civic fascia and pylon in the reference band is set in caps anyway.
 */
export function normaliseText(text) {
  return String(text ?? '').toUpperCase().replace(/[^\x20-\x7E]/g, ' ');
}

/**
 * The polylines of one word, in metres, with the ink box stated.
 *
 * @param {string} text
 * @param {{cap:number, strokeRatio?:number, tracking?:number}} opts
 *   `cap` is the cap height of the INK in metres. `strokeRatio` is stroke / cap — 0.16 is a
 *   normal bold grotesque, 0.20 is heavy, 0.13 is the thinnest that still holds at board zoom.
 *   `tracking` is extra letter spacing in cap-height units.
 * @returns {{polylines: number[][][], width: number, cap: number, stroke: number,
 *            segments: number, glyphs: number}}
 *   `polylines` are [x, y] pairs in metres with x from 0 and y from the baseline.
 */
export function layoutWord(text, { cap, strokeRatio = 0.16, tracking = 0.10 }) {
  const s = cap * strokeRatio;
  const chars = normaliseText(text).split('');
  const out = [];
  let pen = 0;
  let segments = 0;
  let glyphs = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const adv = advanceOf(ch) * cap;
    const shape = GLYPHS[ch] ?? TOFU;
    if (shape.length) glyphs += 1;
    // Ink box is [pen, pen + adv] x [0, cap]; the skeleton is inset by half a stroke so the
    // stroked result lands exactly on that box rather than half a stroke outside it.
    const ix = pen + s / 2;
    const iw = Math.max(adv - s, s * 0.25);
    const iy = s / 2;
    const ih = Math.max(cap - s, s * 0.25);
    for (const line of shape) {
      const pts = line.map(([u, v]) => [ix + u * iw, iy + v * ih]);
      out.push(pts);
      segments += pts.length - 1;
    }
    pen += adv + (i < chars.length - 1 ? tracking * cap : 0);
  }
  return { polylines: out, width: Math.max(pen, 0), cap, stroke: s, segments, glyphs };
}

/**
 * Width a word will occupy at a given cap height, without building it.
 * Used to solve cap height against an available panel width.
 */
export function wordWidth(text, { cap, tracking = 0.10 }) {
  const chars = normaliseText(text).split('');
  let pen = 0;
  for (let i = 0; i < chars.length; i += 1) {
    pen += advanceOf(chars[i]) * cap;
    if (i < chars.length - 1) pen += tracking * cap;
  }
  return pen;
}

/** The largest cap height that fits `text` into `width` x `height` metres. */
export function fitCap(text, { width, height, tracking = 0.10 }) {
  const unit = wordWidth(text, { cap: 1, tracking });
  if (unit <= 0) return height;
  return Math.min(height, width / unit);
}
