// Runtime hue selection; no save state or browser work at module load.
const candidate = (mark, light) => Object.freeze({ mark, plinth: mark, ring: mark, ribbon: light, light });
export const RIVAL_HUE_DEFAULT = 'plum';
export const RIVAL_HUES = Object.freeze({
  blue: Object.freeze({ mark: '#3a78b8', plinth: '#4a88d4', ring: '#6f96b8', ribbon: '#8fb4d4', light: '#6f96b8' }),
  plum: candidate('#6e3460', '#b15a9c'),
  ochre: candidate('#7a4e22', '#a16f3d'),
});

export function rivalColours(search = globalThis.location?.search ?? '') {
  const name = new URLSearchParams(search).get('rivalHue');
  return Object.hasOwn(RIVAL_HUES, name) ? RIVAL_HUES[name] : RIVAL_HUES[RIVAL_HUE_DEFAULT];
}

// styles.css --rival / --rival-rgb already paint this light. Skip the write only then.
const CSS_RIVAL_FALLBACK = '#b15a9c';

export function applyRivalCss(style, search = globalThis.location?.search ?? '') {
  const colours = rivalColours(search);
  if (colours.light === CSS_RIVAL_FALLBACK) return;
  style.setProperty('--rival-ui', colours.light);
  style.setProperty('--rival-rgb', colours.light.slice(1).match(/../g).map(h => parseInt(h, 16)).join(' '));
}
