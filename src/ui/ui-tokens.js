// @ts-check
/**
 * UI tokens: the one source for the UI's colours, type, space, layers and motion (style coherence plan W0, `ui.md` 13.2).
 *
 * Values are direction A, today's V4 charcoal and brass tidied (style-w0/ui-sheet/tokens-a.css), plus the six district
 * accents from styles.css and the scene colours read from TASTE, so adopting a token changes no picture. The module
 * follows render/taste-tokens.js: pure data plus small helpers, no DOM or three.js import, so node tests, canvas code
 * and in-world labels read the same values the stylesheet does. `uiTokensCss()` writes ui-tokens.css under
 * `@layer tokens`; the test holds the two byte for byte. No page imports either file yet (W6 wires them in).
 *
 * Regenerate from the worktree root:
 *   node -e "import('./mvp/src/ui/ui-tokens.js').then(m => process.stdout.write(m.uiTokensCss()))" > mvp/src/ui/ui-tokens.css
 *
 * phone-tokens.css belongs to the phone round; its --ph-* names are not redefined here, and the test only reads it.
 */
import { TASTE } from '../render/taste-tokens.js';
import { RIVAL_HUES, RIVAL_HUE_DEFAULT } from '../render/rival-hue.js';

const f = Object.freeze;

/** Groups in the order of ui.md 13.2. Keys are the custom-property names without the leading `--`. */
export const UI_TOKENS = f({
  surface: f({
    'surface-0': '#101920', // wells, deepest ground (V4 surface-deep)
    'surface-1': '#18232b', // panels (V4 surface)
    'surface-2': '#1f2d36', // raised rows and chips
    'surface-3': '#293b46',
    'surface-glass': '#18232b', // A is opaque; B swaps this for an alpha value
    'surface-glass-deep': '#101920',
    'surface-popover': 'var(--surface-1)',
    'overlay-scrim': '#040b1299',
  }),
  line: f({
    'line-subtle': '#2c3c46', // dividers, decoration only
    line: '#52616a', // the V4 hairline, 2.5:1, decoration only
    'line-strong': '#6f8089', // 3.9:1 on surface-1, for any border that carries meaning
    'line-accent': '#d3b37c66',
  }),
  text: f({
    text: '#edf0ec',
    'text-2': '#b5c3c8',
    'text-3': '#8fa1a9', // 5.96:1 on surface-1; retires #6b655c and --tws-dim as text
    'text-on-accent': '#15232b',
    focus: '#b5dbe6',
  }),
  accent: f({
    brass: '#d3b37c', // one brass in place of 33 golds
    'brass-hi': '#e9cf9f',
    'brass-lo': '#9b7f4c',
  }),
  semantic: f({
    gain: '#5fa878',
    loss: '#c9705a',
    warn: '#d98e4a',
    info: '#6f96b8',
  }),
  ownership: f({
    'owner-you': '#d3b37c', // one "you" for the legend and the overlay lens (today #d8a24a, #f0b84a, #f5c230, #d3b37c)
    'owner-rival': RIVAL_HUES[RIVAL_HUE_DEFAULT].light, // plum light #b15a9c; mark #6e3460
    'owner-auction': '#e9cf9f',
    'owner-public': '#8fa1a9',
    free: 'var(--brass)', // for-sale mark
  }),
  district: f({
    'd-fitzroy': '#c8763f',
    'd-carlton': '#a8524a',
    'd-richmond': '#7d7a52',
    'd-brighton': '#4f7f86',
    'd-docklands': '#5c6b8a',
    'd-brunswick': '#8a6f9b',
  }),
  document: f({
    paper: '#e7deca',
    'paper-edge': '#cfc4aa',
    ink: '#1d1914',
    'ink-muted': '#5a4f40',
    rule: '#b6a98e',
    stamp: '#9f3527',
  }),
  /** Neutrals and accents that touch the 3D scene, read from TASTE so the overlays and the board agree. */
  scene: f({
    'scene-water-deep': TASTE.water.deep,
    'scene-shadow-tint': TASTE.shadowTint,
    'scene-accent-red': TASTE.accent.red,
    'scene-accent-gold': TASTE.accent.gold,
    'scene-accent-navy': TASTE.accent.navy,
    'scene-accent-maroon': TASTE.accent.maroon,
    'scene-accent-olive': TASTE.accent.olive,
  }),
  type: f({
    'font-display': '"DD Display", "Oswald", "Arial Narrow", sans-serif',
    'font-body': '"DD Body", "Libre Franklin", system-ui, sans-serif',
    // Tabular figures: the shipped Libre Franklin has no tnum (ui-sheet finding 1), so figures name the role and wait for a face.
    'font-num': '"DD Body", "Libre Franklin", system-ui, sans-serif',
    'font-num-variant': 'tabular-nums',
    'type-scale': '1', // the single knob the six steps scale by
    'step-1': 'calc(12px * var(--type-scale))',
    'step-2': 'calc(14px * var(--type-scale))', // body
    'step-3': 'calc(16px * var(--type-scale))',
    'step-4': 'calc(20px * var(--type-scale))',
    'step-5': 'calc(28px * var(--type-scale))',
    'step-6': 'calc(40px * var(--type-scale))',
    'weight-1': '400',
    'weight-2': '500',
    'weight-3': '700',
    'track-0': '0',
    'track-1': '0.04em',
    'track-2': '0.08em',
    'track-3': '0.12em',
    'lead-1': '1.2',
    'lead-2': '1.4',
    'lead-3': '1.6',
  }),
  shape: f({
    'space-1': '4px',
    'space-2': '8px',
    'space-3': '12px',
    'space-4': '16px',
    'space-5': '24px',
    'space-6': '32px',
    'radius-0': '0',
    'radius-1': '3px',
    'radius-2': '6px',
    'radius-pill': '999px',
    'border-1': '1px',
    'border-2': '2px',
    'elev-0': 'none',
    'elev-1': '0 2px 8px #040b1233',
    'elev-2': '0 8px 30px #040b1238',
    'elev-3': '0 12px 36px #040b1266',
  }),
  /** Named layers in place of 32 z-index literals. */
  layer: f({
    'z-behind': '-1',
    'z-board': '0',
    'z-board-overlay': '10',
    'z-hud': '20',
    'z-rail': '30',
    'z-card': '40',
    'z-dialog': '60',
    'z-system': '80',
    'z-toast': '90',
  }),
  motion: f({
    'dur-1': '100ms',
    'dur-2': '180ms',
    'dur-3': '280ms',
    'ease-out': 'cubic-bezier(0.2, 0.7, 0.2, 1)',
    'ease-in-out': 'cubic-bezier(0.6, 0, 0.2, 1)',
  }),
  size: f({
    'icon-1': '16px',
    'icon-2': '20px',
    'icon-3': '24px',
    'icon-4': '32px',
    'control-h-1': '36px',
    'control-h-2': '44px',
    'chip-h': '24px',
    'tool-h': '56px',
    'rail-w': '320px',
    'card-w': '380px',
    edge: '12px',
    'frame-pad': 'var(--space-3)',
    'deck-h': '60px',
    'ticker-h': '28px',
    'bar-h': 'calc(var(--deck-h) + var(--ticker-h) + var(--border-1))',
    'act-h': '108px',
    'roster-h': '296px',
    'mobile-row-h': '48px',
  }),
  /** Direction A's frame and component roles (opaque, no keyline), which the 13.3 components read. */
  role: f({
    'frame-bg': 'var(--surface-1)',
    'frame-line': 'var(--line)',
    'frame-radius': 'var(--radius-2)',
    'frame-shadow': 'var(--elev-2)',
    'frame-blur': '0px',
    'frame-sat': '1',
    'bar-bg': 'var(--surface-1)',
    'keyline-color': 'var(--brass)',
    'keyline-opacity': '0',
    'keyline-inset': '5px',
    'keyline-notch': '0px',
    'head-color': 'var(--brass)',
    'head-bg': 'transparent',
    'rule-color': 'var(--line)',
    'well-bg': 'var(--surface-0)',
    'well-line': 'var(--line)',
    'btn-bg': 'var(--surface-2)',
    'btn-ghost-bg': 'transparent',
    'btn-line': 'var(--line-strong)',
    'btn-text': 'var(--text)',
    'btn-sub': 'var(--text-2)',
    'btn-primary-bg': 'var(--brass)',
    'btn-primary-line': 'var(--brass-hi)',
    'btn-primary-text': 'var(--text-on-accent)',
    'chip-bg': 'transparent',
    'chip-bg-on': 'var(--surface-2)',
    'chip-line': 'var(--line-strong)',
    'sheet-foot-bg': 'var(--surface-1)',
  }),
});

/** The thirteen ui.md 13.2 groups, each mapped to the module groups that hold it. */
export const UI_TOKEN_GROUPS_13_2 = f({
  Surface: f(['surface']),
  Line: f(['line']),
  Text: f(['text']),
  Accent: f(['accent']),
  Semantic: f(['semantic']),
  Ownership: f(['ownership']),
  District: f(['district']),
  Document: f(['document']),
  Type: f(['type']),
  'Space and shape': f(['shape']),
  Layers: f(['layer']),
  Motion: f(['motion']),
  Size: f(['size']),
});

/** Overrides under prefers-reduced-motion: the switch sits at token level, so every duration read through a token stops. */
export const UI_REDUCED_MOTION = f({ 'dur-1': '0ms', 'dur-2': '0ms', 'dur-3': '0ms' });

/** @returns {Map<string, string>} every token name (without `--`) to its declared value, in group order */
export function uiTokenMap() {
  const map = new Map();
  for (const group of Object.values(UI_TOKENS)) {
    for (const [name, value] of Object.entries(group)) {
      if (map.has(name)) throw new Error(`ui-tokens: ${name} is declared twice`);
      map.set(name, value);
    }
  }
  return map;
}

/**
 * The value of one token with var() references resolved, for canvas and 3D code that cannot read CSS.
 * @param {string} name with or without the leading `--`
 * @returns {string}
 */
export function uiToken(name) {
  const map = uiTokenMap();
  const resolve = (/** @type {string} */ key, depth = 0) => {
    if (depth > 8) throw new Error(`ui-tokens: ${key} resolves too deep`);
    const value = map.get(key);
    if (value === undefined) throw new Error(`ui-tokens: no token ${key}`);
    return value.replace(/var\(--([\w-]+)\)/g, (_, ref) => resolve(ref, depth + 1));
  };
  return resolve(name.replace(/^--/, ''));
}

/** @param {string} name @returns {number} a px, ms, unitless or ramp-step token as a number (for example `z-card` 40, `dur-2` 180, `step-1` 12) */
export function uiTokenNumber(name) {
  const value = uiToken(name).trim();
  const scaled = /^calc\((-?\d+(?:\.\d+)?)px \* (\d+(?:\.\d+)?)\)$/.exec(value); // a ramp step on the scale knob
  if (scaled) return Number(scaled[1]) * Number(scaled[2]);
  const m = /^(-?\d+(?:\.\d+)?)(px|ms)?$/.exec(value);
  if (!m) throw new Error(`ui-tokens: ${name} is not a plain number (${value})`);
  return Number(m[1]);
}

/** @returns {string} the text of ui-tokens.css */
export function uiTokensCss() {
  const lines = [
    '/* Generated by ui-tokens.js (uiTokensCss); do not edit by hand. Direction A, today\'s V4 palette, ui.md 13.2.',
    '   Regenerate: node -e "import(\'./mvp/src/ui/ui-tokens.js\').then(m => process.stdout.write(m.uiTokensCss()))" > mvp/src/ui/ui-tokens.css */',
    '@layer tokens {',
    '  :root {',
  ];
  const groups = Object.entries(UI_TOKENS);
  groups.forEach(([group, tokens], i) => {
    if (i > 0) lines.push('');
    lines.push(`    /* ${group} */`);
    for (const [name, value] of Object.entries(tokens)) lines.push(`    --${name}: ${value};`);
  });
  lines.push('  }', '', '  @media (prefers-reduced-motion: reduce) {', '    :root {');
  for (const [name, value] of Object.entries(UI_REDUCED_MOTION)) lines.push(`      --${name}: ${value};`);
  lines.push('    }', '  }', '}', '');
  return lines.join('\n');
}
