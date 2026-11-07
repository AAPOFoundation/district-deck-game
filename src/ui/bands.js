// Phone round P1, lane L1: the bands the phone HUD reserves at the window's edges, read from the CSS variables of phone-bands.css
// (docs/art-direction/PHONE-CONTRACT-2026-10-20.md, section 2), after Pocket Reserve's bands.ts.
//
// readBands() gives px numbers { top, bottom, left, right, sheetPeek, sheetFull, seatW, sat, sab, sal, sar }. They are read from the root's computed
// style. The eleven custom properties are not registered with @property (a registered one has a value with the switch at 0 too), so a computed read
// of a name that uses calc(), min() or var() is the specified text, and the probe takes over; it does the same for an engine that leaves env()
// unresolved inside a custom property:
//   - the four insets are read from a hidden fixed element whose padding is env(safe-area-inset-*), and written back onto <html> as px
//     (--sat, --sab, --sal, --sar), so every calc() in the HUD's own CSS that uses var(--sat) resolves too. The write-back is dropped at the top of
//     every read and made again, so a rotation reaches the insets (an inline value would otherwise freeze them at the first read);
//   - any other name that still gives no number is read from the same element with its padding set to var(--name), which the engine resolves.
// If even the probe gives nothing (the stylesheet has not loaded), the contract's numbers stand on the insets: 52 + sat, 56 + sab, sal, sar,
// 210 + sab, min(60 % of the height, 520), min(30 % of the width, 300).
//
// The bands are read on boot, on a layout change and on a resize, and cached: bands() returns the last read. The camera never reads them from a
// panel's live rectangle and never when a sheet opens or closes (the sheet's state is the attribute data-phone-sheet on <html>, ruling 8).
//
// The module does nothing at import and nothing while data-phone-hud is 0 (the callers check it); createBands(win, doc) takes a window and a
// document of its own so that the unit test can drive it with fakes.

/** The eleven variables, in the order of the object readBands() returns: [name of the variable, key]. */
export const BAND_VARS = Object.freeze([
  ['--band-top', 'top'], ['--band-bottom', 'bottom'], ['--band-left', 'left'], ['--band-right', 'right'],
  ['--sheet-peek', 'sheetPeek'], ['--sheet-full', 'sheetFull'], ['--seat-w', 'seatW'],
  ['--sat', 'sat'], ['--sab', 'sab'], ['--sal', 'sal'], ['--sar', 'sar'],
]);

const INSETS = Object.freeze([
  ['--sat', 'sat', 'safe-area-inset-top', 'paddingTop'],
  ['--sab', 'sab', 'safe-area-inset-bottom', 'paddingBottom'],
  ['--sal', 'sal', 'safe-area-inset-left', 'paddingLeft'],
  ['--sar', 'sar', 'safe-area-inset-right', 'paddingRight'],
]);

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:px)?$/i;

/** A computed length as px: '59px' -> 59, ' 12.5px ' -> 12.5, '0' -> 0. Anything that is not a plain px figure (an unresolved calc(), env(), var(), '') -> NaN. */
export function parseLength(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;
  const text = value.trim();
  if (!NUMBER.test(text)) return NaN;
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : NaN;
}

const round = (n) => Math.round(n * 100) / 100;

/** The contract's numbers on the insets and the window, for a page whose stylesheet is missing. */
export function contractBands(insets, w, h) {
  const sat = insets.sat || 0, sab = insets.sab || 0, sal = insets.sal || 0, sar = insets.sar || 0;
  return {
    top: 52 + sat, bottom: 56 + sab, left: sal, right: sar,
    sheetPeek: 210 + sab, sheetFull: Math.min(0.6 * h, 520), seatW: Math.min(0.3 * w, 300),
    sat, sab, sal, sar,
  };
}

/**
 * The room the camera fits into and the player sees: the window less the bands, less the open sheet.
 * `sheet` is the value of data-phone-sheet on <html>: 'none' (or anything else), 'peek' and 'full' (tall: the card from the bottom edge), 'side' (short:
 * the card seated on the right, inside the right band). Pure: no DOM. Returns { left, top, right, bottom } in px of the window.
 */
export function roomRect(b, w, h, sheet = 'none') {
  const rect = { left: b.left, top: b.top, right: w - b.right, bottom: h - b.bottom };
  if (sheet === 'side') rect.right = w - b.right - b.seatW;
  else if (sheet === 'peek') rect.bottom = h - b.sheetPeek;
  else if (sheet === 'full') rect.bottom = h - b.sheetFull;
  return rect;
}

/**
 * The sheet state visibleBoardRect() takes: the attribute data-phone-sheet on <html> when a sheet has set it ('none' included: it is believed); when no
 * sheet ever has (the attribute is undefined) and a card is mounted, the contract's own seat for the class, 'side' on short and 'peek' on tall; else 'none'.
 */
export function seatedSheet(attr, cardMounted, layout) {
  if (attr !== undefined && attr !== null) return attr;
  if (!cardMounted) return 'none';
  return layout === 'short' ? 'side' : 'peek';
}

/**
 * The room for the camera's home fit: the window less the bands, never the sheet (a sheet never moves the home fit). Pocket Reserve's guard: an axis whose
 * two bands leave under 120 px is taken whole, so a bad stylesheet cannot reduce the city to a speck.
 */
export function fitRoom(b, w, h) {
  const across = w - b.left - b.right >= 120;
  const down = h - b.top - b.bottom >= 120;
  return { left: across ? b.left : 0, top: down ? b.top : 0, right: across ? w - b.right : w, bottom: down ? h - b.bottom : h };
}

/**
 * A reader on a window and a document. The page's instance is made below (readBands, bands, refreshBands); the unit test makes its own.
 *   win.getComputedStyle(el), win.innerWidth, win.innerHeight; doc.documentElement, doc.body, doc.createElement(tag).
 */
export function createBands(win, doc) {
  let probe = null;
  let cached = null;
  let source = 'none';
  const written = new Set(); // the inset names this reader has written onto <html> as px

  function rootStyle() {
    return win.getComputedStyle(doc.documentElement);
  }
  function probeEl() {
    if (!probe) {
      probe = doc.createElement('div');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;box-sizing:content-box;padding:0;border:0;margin:0';
    }
    if (!probe.isConnected && doc.body) doc.body.appendChild(probe);
    return probe;
  }
  /** px of an expression, by the hidden element's padding (the engine resolves env(), var(), calc(), min() and the viewport units itself). NaN if it cannot. */
  function probed(expression, side = 'paddingTop') {
    const el = probeEl();
    el.style[side] = '';
    el.style[side] = expression;
    return parseLength(win.getComputedStyle(el)[side]);
  }
  function numbers(cs) {
    const out = {};
    for (const [name, key] of BAND_VARS) out[key] = parseLength(cs.getPropertyValue(name));
    return out;
  }
  const complete = (o) => BAND_VARS.every(([, key]) => Number.isFinite(o[key]));

  /** Read the bands now. Returns { bands, source } with source 'computed', 'probe' or 'contract'. */
  function readInfo() {
    const root = doc.documentElement;
    // The insets written back by an earlier read are inline, and an inline value wins over env(): drop them first, so that this read (and the HUD's
    // own var(--sat)) follows the insets as they are now, then write back again below whatever still needs it.
    for (const name of written) root.style.removeProperty(name);
    written.clear();
    const cs = rootStyle();
    let b = numbers(cs);
    if (complete(b)) return { bands: tidy(b), source: 'computed' };

    // 1. The insets: env() inside a custom property did not resolve. Read them from the probe's padding and write them back as px.
    let wrote = false;
    for (const [name, key, env, side] of INSETS) {
      if (Number.isFinite(b[key])) continue;
      const px = probed(`env(${env}, 0px)`, side);
      if (Number.isFinite(px)) {
        root.style.setProperty(name, `${round(px)}px`);
        written.add(name);
        b[key] = round(px);
        wrote = true;
      }
    }
    // The band variables use var(--sat) and the rest, so with the insets written back they may resolve in the computed style now.
    if (wrote) {
      const again = numbers(win.getComputedStyle(root));
      for (const [, key] of BAND_VARS) if (!Number.isFinite(b[key]) && Number.isFinite(again[key])) b[key] = again[key];
    }
    // 2. Whatever is still not a number but is defined (an unresolved calc() or min()): the probe with var(--name). A name that is not defined at all
    //    (the stylesheet has not loaded) is left for the contract's numbers: a probe of an undefined variable would read 0 and pass for a band of 0.
    let usedProbe = wrote;
    const style = win.getComputedStyle(root);
    for (const [name, key] of BAND_VARS) {
      if (Number.isFinite(b[key])) continue;
      if (String(style.getPropertyValue(name)).trim() === '') continue;
      const px = probed(`var(${name})`);
      if (Number.isFinite(px)) { b[key] = px; usedProbe = true; }
    }
    if (complete(b)) return { bands: tidy(b), source: 'probe' };

    // 3. No stylesheet (or a probe that gives nothing): the contract's numbers on the insets.
    const w = win.innerWidth || 0, h = win.innerHeight || 0;
    const c = contractBands({ sat: b.sat, sab: b.sab, sal: b.sal, sar: b.sar }, w, h);
    for (const [, key] of BAND_VARS) if (!Number.isFinite(b[key])) b[key] = c[key];
    return { bands: tidy(b), source: usedProbe ? 'probe+contract' : 'contract' };
  }
  function tidy(b) {
    const out = {};
    for (const [, key] of BAND_VARS) out[key] = round(b[key]);
    return out;
  }
  function same(a, b) {
    return !!a && !!b && BAND_VARS.every(([, key]) => a[key] === b[key]);
  }

  return {
    /** Read now, without touching the cache. */
    read() {
      return readInfo().bands;
    },
    /** Read again and cache (boot, a layout change, a resize). Returns true when the bands differ from the last read. */
    refresh() {
      const info = readInfo();
      const changed = !same(cached, info.bands);
      cached = info.bands;
      source = info.source;
      return changed;
    },
    /** The bands as last read (read now if they never were). A copy. */
    bands() {
      if (!cached) this.refresh();
      return { ...cached };
    },
    /** How the last read was made: 'computed', 'probe', 'probe+contract' or 'contract'. */
    source() {
      return source;
    },
    /** Drop the probe element (the unit test and the page's dispose). */
    dispose() {
      if (probe && probe.remove) probe.remove();
      probe = null;
      cached = null;
    },
  };
}

let shared = null;

function instance() {
  if (!shared) shared = createBands(window, document);
  return shared;
}

/** The bands now, in px: { top, bottom, left, right, sheetPeek, sheetFull, seatW, sat, sab, sal, sar }. */
export function readBands() {
  return instance().read();
}

/** Read the bands again and keep them for bands(); true when they changed. */
export function refreshBands() {
  return instance().refresh();
}

/** The bands as last read. */
export function bands() {
  return instance().bands();
}

/** How the last refreshBands() was made. */
export function bandsSource() {
  return instance().source();
}
