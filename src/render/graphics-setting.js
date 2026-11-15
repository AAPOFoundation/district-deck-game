import { readFrameOptions } from './frame-policy.js';

// Player-facing Graphics choice. `auto` is today's behaviour exactly; URL parameters
// (?quality=, ?msaa=, ?dpr=) still override every mode so the measuring tools are unchanged.
export const GRAPHICS_KEY = 'dd.graphics';
// Fast (the low tier) is held back: on 15 Nov the low tier drew the water and land beyond the board as flat brown
// at station-f, airport-o2 and rod-laver-a. A stored 'fast' reads as auto until that is fixed.
export const GRAPHICS_MODES = Object.freeze(['auto', 'full', 'balanced']);
export const GRAPHICS_LABELS = Object.freeze({ auto: 'Auto', full: 'Full', balanced: 'Balanced' });

export function normaliseGraphicsMode(value) {
  return GRAPHICS_MODES.includes(value) ? value : 'auto';
}

export function readStoredGraphics(storage) {
  try {
    const store = storage === undefined ? globalThis.localStorage : storage;
    return normaliseGraphicsMode(store?.getItem(GRAPHICS_KEY));
  } catch {
    return 'auto';
  }
}

export function writeStoredGraphics(mode, storage) {
  try {
    const store = storage === undefined ? globalThis.localStorage : storage;
    store.setItem(GRAPHICS_KEY, normaliseGraphicsMode(mode));
    return true;
  } catch {
    return false;
  }
}

export function resolveGraphics({ stored, search = '', hardwareQuality = 'high' } = {}) {
  const mode = normaliseGraphicsMode(stored);
  const frame = readFrameOptions(search);
  const urlQuality = new URLSearchParams(search || '').get('quality');
  if (mode === 'auto') return { mode, quality: hardwareQuality, msaa: frame.msaa, dprAuto: frame.autoDpr };
  const quality = 'high';
  const msaa = mode === 'balanced' ? 0 : null;
  return {
    mode,
    quality: urlQuality || quality,
    msaa: frame.msaa ?? msaa,
    dprAuto: frame.autoDpr,
  };
}

export function graphicsSettingsMarkup(current) {
  const mode = normaliseGraphicsMode(current);
  const radios = GRAPHICS_MODES.map(m => `<label><input type="radio" name="dd-graphics" value="${m}"${m === mode ? ' checked' : ''}> ${GRAPHICS_LABELS[m]}</label>`).join('\n    ');
  return `<fieldset class="sound-settings graphics-settings">
    <legend>Graphics</legend>
    ${radios}
    <p>Applies when the page reloads. <button type="button" class="verb" data-graphics-reload>Reload</button></p>
  </fieldset>`;
}

export function mountGraphicsSettings(host, { storage, reload = () => globalThis.location.reload() } = {}) {
  if (!host) return () => {};
  host.innerHTML = graphicsSettingsMarkup(readStoredGraphics(storage));
  const change = event => {
    if (event.target.matches?.('input[name="dd-graphics"]')) writeStoredGraphics(event.target.value, storage);
  };
  const click = event => { if (event.target.closest?.('[data-graphics-reload]')) reload(); };
  host.addEventListener('change', change);
  host.addEventListener('click', click);
  return () => { host.removeEventListener('change', change); host.removeEventListener('click', click); };
}
