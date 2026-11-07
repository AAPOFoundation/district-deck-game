// Shared milled chrome drawings used by cards, the verb wall, and paper minutes.

export const CONSOLIDATE_GLYPH_DRAWING = [
  '<path d="M2 4.5 6 2l4 2.5L6 7 2 4.5Zm0 0V7l4 2.5L10 7V4.5"></path>',
  '<path d="m14 4.5 4-2.5 4 2.5L18 7l-4-2.5Zm0 0V7l4 2.5L22 7V4.5"></path>',
  '<path d="M6 10.5V12h4m8-1.5V12h-4m-4-1.5 2 2 2-2M12 12.5V15"></path>',
  '<path d="m2 17.5 10-3 10 3-10 3-10-3Zm0 0V20l10 3 10-3v-2.5"></path>',
].join('');

export const CHROME_ACTION_GLYPHS = Object.freeze({
  hold: '<path d="M3 9h18L12 3 3 9zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 19h18M2 22h20"></path>',
  settle: '<path d="M5 3h14v18H5zM8 8h8M8 12h5M8 16l2 2 5-5"></path>',
  nav: '<path d="M3 20h18M5 16l4-5 4 3 6-8M16 6h3v3"></path>',
  debt: '<path d="M5 4h12v16H5zM8 8h6M8 12h6M8 16h4M17 8h3v13H8v-1"></path>',
  overdraft: '<path d="M4 18a8 8 0 1 1 16 0M12 13l5-4M7 18h10"></path>',
  forecast: '<path d="M3 4v17h18M6 17l4-6 4 3 6-8"></path>',
  macro: '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c3 3 4 6 4 9s-1 6-4 9M12 3c-3 3-4 6-4 9s1 6 4 9"></path>',
  events: '<rect x="4" y="5" width="16" height="16" rx="1"></rect><path d="M8 3v4M16 3v4M4 9h16M12 12v5M12 19h.01"></path>',
  // V4.1 Wave 1 — WORLD cassette. Distinct from `macro` (meridian sphere): a
  // milled head-office globe on a short stand, same 24-viewBox stroke language.
  world: '<circle cx="12" cy="10" r="7"></circle><path d="M5 10h14M12 3c2.5 2.2 3.4 4.4 3.4 7s-.9 4.8-3.4 7M12 3C9.5 5.2 8.6 7.4 8.6 10s.9 4.8 3.4 7M9 20h6M12 17.2V20"></path>',
  survey: '<circle cx="12" cy="7" r="3"></circle><path d="M3 7h6M15 7h6M12 10v3M12 13 6 21M12 13l6 8M8 17h8"></path>',
  lobby: '<path d="M4 10h4l10-5v14L8 14H4zM8 14l2 6h4M21 9v6"></path>',
  walk: '<circle cx="13" cy="4" r="2"></circle><path d="m10 21 2-7-3-4 3-3 3 3 4 1M12 14l4 3 1 4"></path>',
  acquire: '<path d="M3 11 12 4l9 7M5 10v10h14V10M12 12v6M9 15h6"></path>',
  notice: '<path d="M6 3h9l3 3v15H6zM15 3v4h3M12 10v5M12 18h.01"></path>',
  buyout: '<path d="M3 11 10 5l7 6v9H3zM10 14h11M17 10l4 4-4 4"></path>',
  divest: '<path d="M7 11 14 5l7 6v9H7zM12 14H2M6 10l-4 4 4 4"></path>',
  merge: '<path d="M4 5h4c4 0 4 7 8 7h5M4 19h4c4 0 4-7 8-7M17 8l4 4-4 4"></path>',
  renovate: '<path d="m4 20 10-10M11 5l3-2 6 6-3 3zM2 22l4-1-3-3z"></path>',
  redevelop: '<path d="M5 21V4h3v17M5 7h14l-4-3M17 7v6M15 13h4v3h-4M3 21h8"></path>',
  demolish: '<path d="M4 4h10v5H4zM12 8l8 10-3 3L9 10M5 15l4 4M3 21h9"></path>',
  aido: '<circle cx="12" cy="8" r="3"></circle><path d="M5 20c1.8-4.2 11.2-4.2 13 0M4 22h16"></path>',
});

export const CHROME_ACTION_GLYPH_ALIASES = Object.freeze({
  bank: 'hold',
  build: 'redevelop',
  people: 'walk',
  pm: 'nav',
  wire: 'events',
  earn: 'nav',
  'redevelop:notice': 'notice',
  'redevelop:buyout': 'buyout',
});

function glyphSvg(drawing, className) {
  return drawing
    ? `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${drawing}</svg>`
    : '';
}

export function chromeActionGlyphSvg(verb, className) {
  const key = CHROME_ACTION_GLYPH_ALIASES[verb] || verb;
  if (key === 'consolidate') return glyphSvg(CONSOLIDATE_GLYPH_DRAWING, className);
  return glyphSvg(CHROME_ACTION_GLYPHS[key], className);
}

export function consolidateGlyphSvg(className) {
  return glyphSvg(CONSOLIDATE_GLYPH_DRAWING, className);
}
