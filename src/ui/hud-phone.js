// Phone round P1, lane L2a: the phone HUD (contract section 3). Loaded after main.js; does nothing while data-phone-hud is 0.
//
// What it builds on the phone classes (data-layout tall or short), all from the DOM the Hud already renders, so hud.js, main.js and the
// legacy sheets stay as they are:
//   data-phone="plate"       a new header: cash, the NAV lead, the quarter, the actions left (read from the hidden .statusbar and the rail)
//   data-phone="menu-btn"    its menu button; the menu itself is the existing .mobile-cycle-strip (data-phone="menu"), with Help and WORLD direct,
//                            tools in Manage and Events in Reports; handlers stay on their nodes, with Settings (sound controls), the Cybercab launcher and Exit
//   data-phone="bar"         the real footer.actionbar (the Hud's click handler lives on it, so Bank and Settle stay inside it); this module adds the
//                            camera button and the Petridis and Districts pills after every Hud render, and marks Bank and Settle data-phone-action
//   data-phone="camera"      the original nav.camera-controls (main.js binds its click handler to that element), moved out of the bar into .game
//   data-phone="toast"       every toast, rewritten to this layer's compact class; the ticker's news arrives as toasts
// The pills open modal.js's overlay sheet (.overlay .sheet) with a copy of the rail's Petridis dossier or Districts roster (the roster is built by
// the Hud's own pairsRailHtml while a tool panel replaces it in the rail); a press in the copy hands a clone of the pressed element to the real
// rail, whose delegated click handler reads data attributes only, so the rail's own handler runs.
// Every press acts on click and never on pointerdown or pointerup, so it acts once under the iOS order (pointerdown, pointerup, a late click).

import { openModal } from './modal.js';

const KEY_PREFIX = 'district-deck-v300'; // main.js UI_PREFS_KEY: the sound preferences the Help sheet writes
const TOAST_MS = 3600;
const MAX_TOASTS = 3;
const EXIT_ARM_MS = 6000;

// ---------------------------------------------------------------------------------------------------------------- pure helpers (tested)

/** ?glassAlpha= (0 to 1) and ?glassBlur= (0 to 64 px) from a query string; anything else is null (the token's own value stands). */
export function readGlassKnobs(search) {
  let params;
  try { params = new URLSearchParams(search || ''); } catch { return { alpha: null, blur: null }; }
  const num = (name, lo, hi) => {
    const raw = params.get(name);
    if (raw == null || raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
  };
  return { alpha: num('glassAlpha', 0, 1), blur: num('glassBlur', 0, 64) };
}

/** The rail's "NAV tied" / "You lead $12k" / "Petridis leads $12k" as a signed figure for the plate. */
export function parseLead(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return { kind: 'none', figure: '' };
  if (/tied/i.test(t)) return { kind: 'tie', figure: 'tied' };
  const m = /(You lead|Petridis leads)\s+(.+)$/i.exec(t);
  if (!m) return { kind: 'none', figure: '' };
  // The rail's lead figure is an absolute magnitude for both sides.
  return /^you/i.test(m[1]) ? { kind: 'lead', figure: `+${m[2]}` } : { kind: 'trail', figure: `−${m[2]}` };
}

/** A copy of the rail's markup keeps its element tree but not its class names: the legacy rail rules are keyed on them. */
export function rescopeClasses(root) {
  for (const n of root.querySelectorAll('[class]')) n.setAttribute('class', [...n.classList].map((c) => `ph-c-${c}`).join(' '));
  return root;
}

/** Trims a toast stack to max, oldest first. A held toast (hud.js toast(…, { held: true }): a settle notice) leaves on its own clock and is not counted. */
export function trimToasts(container, max) {
  const loose = [...(container?.children ?? [])].filter((t) => !t.dataset?.held);
  while (loose.length > max) loose.shift().remove();
}

/** One line of news for a toast from a ticker line's parts: NAME · fragment · anchor. */
export function newsLine(parts) {
  return [parts?.name, parts?.fragment, parts?.anchor].map((s) => String(s ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ');
}

/** Phone round P2a, item D. A range input moves to where a finger lands on its track before the finger has said whether it means to drag the slider or to scroll
 *  the menu; `touch-action: pan-y` lets the browser take a vertical pan, but the value the first touch set stays, and the page's handler has stored it. This holds
 *  the `input` events of a touch or pen gesture back until its first 10 px read horizontal (a drag: the held value is applied once, later events pass) or the
 *  finger lifts without moving (a tap on the track: applied at pointerup). A gesture that reads vertical, or that the browser cancels for a pan, puts the value back
 *  and the page's handler never sees it. A mouse and the keyboard are not held. Registered before the page's own `input` handler. */
export function guardRange(input, signal) {
  let g = null;
  const release = () => { g.go = true; input.dispatchEvent(new Event('input', { bubbles: true })); };
  input.addEventListener('input', (event) => { if (g && !g.go) { g.dirty = true; event.stopImmediatePropagation(); } }, { capture: true, signal });
  input.addEventListener('pointerdown', (event) => {
    g = event.pointerType === 'mouse' ? null : { x: event.clientX, y: event.clientY, v: input.value, go: false, dirty: false, vertical: false };
  }, { signal });
  input.addEventListener('pointermove', (event) => {
    if (!g || g.go || g.vertical) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (Math.hypot(dx, dy) < 10) return;
    if (Math.abs(dx) >= Math.abs(dy)) { if (g.dirty) release(); else g.go = true; } else { g.vertical = true; input.value = g.v; }
  }, { signal });
  input.addEventListener('pointerup', () => {
    if (g && !g.go) { if (g.vertical) input.value = g.v; else if (g.dirty) release(); }
    g = null;
  }, { signal });
  input.addEventListener('pointercancel', () => { if (g && !g.go) input.value = g.v; g = null; }, { signal });
  input.addEventListener('blur', () => { g = null; }, { signal });
}

// ----------------------------------------------------------------------------------------------------------------------- small DOM helpers

const SVG = {
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 8.5V4h4.5M16.5 4H21v4.5M21 15.5V20h-4.5M7.5 20H3v-4.5"/><circle cx="12" cy="12" r="3.6"/></svg>',
};

function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : String(v)); }
  if (html) node.innerHTML = html;
  return node;
}

const clean = (s) => String(s ?? '').replace(/[ \s]+/g, ' ').trim();
const store = {
  get(key) { try { return globalThis.localStorage?.getItem(`${KEY_PREFIX}:${key}`) ?? null; } catch { return null; } },
  set(key, value) { try { globalThis.localStorage?.setItem(`${KEY_PREFIX}:${key}`, String(value)); } catch { /* optional storage */ } },
};

// ------------------------------------------------------------------------------------------------------------------ the sound bus handle
// main.js keeps its AudioBus private. The Help sheet's controls reach it through a closure, so the menu's Settings cannot. Every AudioBus method the game
// calls on a gesture is wrapped once to remember the instance (the game's first pointerdown calls unlock() before any menu can open); behaviour is unchanged.
let audioBus = null;
let audioWrapped = false;
function captureAudioBus() {
  if (audioWrapped) return;
  audioWrapped = true;
  import('../render/audio.js').then(({ AudioBus }) => {
    for (const name of ['unlock', 'setEnabled', 'setMusicVolume', 'setEffectsVolume', 'play']) {
      const original = AudioBus.prototype[name];
      if (typeof original !== 'function') continue;
      AudioBus.prototype[name] = function wrapped(...args) { audioBus ??= this; return original.apply(this, args); };
    }
  }).catch(() => { /* the controls then write the preferences only */ });
}
const soundOn = () => (audioBus ? audioBus.enabled : store.get('muted') !== '1');

// ------------------------------------------------------------------------------------------------------------------------------ the layer

// Exported for the node tests, which drive rebuildBar on a DOM double; the page still makes the one instance below.
export class PhoneHud {
  constructor() {
    this.on = false;
    this.ac = null;
    this.observers = [];
    this.seenNews = new Set();
    this.menuOpen = false;
    this.cameraOpen = false;
    this.pill = null;
    this.exitTimer = 0;
    this.classes = new Map(); // node -> the class attribute it had before this layer renamed it
    this.barHtml = null; // the Hud's own action-bar markup (camera bay in place), for deactivate()
    this.stripHtml = null; // the Hud's own strip markup as its last render wrote it (before the tools and views moved), for deactivate()
    this.barClass = null;
    this.lensClass = null;
    this.newsPrimed = false;
    this.ready = false;
  }

  start() {
    const html = document.documentElement;
    const sync = () => {
      const want = this.ready && html.getAttribute('data-phone-hud') === '1';
      if (want && !this.on) this.activate();
      else if (!want && this.on) this.deactivate();
    };
    // main.js builds the Hud and binds the camera handler inside boot(), after the assets load; this layer renames the classes the Hud and main.js
    // look their elements up by, so it waits until the game is up (window.__districtDeck is set at the end of boot(); play.html's body keeps
    // loader-pending until 400 ms later). The wait is a rAF poll: the layer starts before the first paint that follows boot.
    const gameUp = () => !!window.__districtDeck || !document.body.classList.contains('loader-pending');
    const waitForGame = () => {
      if (gameUp()) { this.ready = true; sync(); } else window.requestAnimationFrame(waitForGame);
    };
    waitForGame();
    new MutationObserver(sync).observe(html, { attributes: true, attributeFilter: ['data-phone-hud'] });
    window.addEventListener('layoutchange', sync);
  }

  // ----------------------------------------------------------------------------------------------------------------------- activate and undo

  activate() {
    const game = document.querySelector('main.game');
    const statusbar = game?.querySelector('.statusbar');
    const bar = game?.querySelector('footer.actionbar');
    const strip = game?.querySelector('.mobile-cycle-strip');
    const nav = game?.querySelector('nav.camera-controls');
    const toasts = game?.querySelector('.toasts');
    if (!game || !statusbar || !bar || !strip || !nav || !toasts) return;
    Object.assign(this, { game, statusbar, bar, strip, nav, toasts, rail: game.querySelector('.rail') });
    this.on = true;
    this.ac = new AbortController();
    import('./hud.js').then((m) => { this.pairsRailHtml = m.pairsRailHtml; }).catch(() => { /* the pill then needs the rail's own roster */ });
    this.applyKnobs();
    captureAudioBus();

    this.buildPlate();
    this.buildMenuExtras();
    this.buildBarExtras();
    // The legacy sheets key their phone rules on four class names (several with !important), so the layer renames the four containers and
    // deactivate() gives the names back. The Hud and main.js looked the elements up by class during boot() and hold references from then on;
    // the camera click handler is already bound to the nav element (main.js bindInput), which is why the nav is renamed and never replaced.
    this.classes = new Map();
    const rename = (node, name) => { if (!this.classes.has(node)) this.classes.set(node, node.getAttribute('class')); node.setAttribute('class', name); };
    rename(strip, 'ph-menu');
    rename(nav, 'ph-camera');
    rename(toasts, 'ph-toasts');
    strip.setAttribute('data-phone', 'menu');
    strip.id = 'ph-menu';
    strip.dataset.open = '0';
    nav.setAttribute('data-phone', 'camera');
    nav.id = 'ph-camera';
    nav.dataset.open = '0';
    bar.setAttribute('data-phone', 'bar');

    const signal = this.ac.signal;
    const watch = (target, fn, options) => {
      const o = new MutationObserver(fn);
      o.observe(target, options);
      this.observers.push(o);
    };
    watch(bar, () => this.onBar(), { childList: true, attributes: true, attributeFilter: ['class'] });
    watch(statusbar, () => this.onStatus(), { childList: true, subtree: true });
    if (this.rail) watch(this.rail, () => this.onRail(), { childList: true });
    watch(strip, () => this.onStrip(), { childList: true });
    watch(toasts, () => this.onToasts(), { childList: true });
    watch(game, () => this.onGame(), { childList: true });
    watch(document.body, () => this.onStatus(), { attributes: true, attributeFilter: ['class'] });

    this.menuBtn.addEventListener('click', () => this.setMenu(!this.menuOpen), { signal });
    strip.addEventListener('click', (event) => this.onMenuClick(event), { signal });
    // one drawer open at a time, so the menu stays short enough for the short class
    strip.addEventListener('toggle', (event) => {
      const d = event.target;
      if (d?.tagName === 'DETAILS' && d.open) for (const o of strip.querySelectorAll('details[open]')) if (o !== d) o.open = false;
      this.syncFades(); // a drawer changes how much there is to scroll
    }, { capture: true, signal });
    // the scroll cue follows the menu's scroll position and its size (opening it, a resize or a turn of the phone changes both)
    strip.addEventListener('scroll', () => this.syncFades(), { passive: true, signal });
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => this.syncFades());
      ro.observe(strip);
      this.observers.push(ro);
    }
    this.bar.addEventListener('click', (event) => this.onBarClick(event), { signal });
    nav.addEventListener('click', (event) => this.onCameraClick(event), { signal });
    document.addEventListener('pointerdown', (event) => this.onOutside(event), { capture: true, signal });
    document.addEventListener('keydown', (event) => this.onKey(event), { capture: true, signal });

    this.onBar();
    this.onStatus();
    this.onStrip();
    this.onToasts();
  }

  deactivate() {
    this.on = false;
    this.ac?.abort();
    this.ac = null;
    for (const o of this.observers) o.disconnect();
    this.observers = [];
    this.closePill();
    clearTimeout(this.exitTimer);
    this.plate?.remove();
    this.menuBtn?.remove();
    this.settings?.remove();
    this.manage?.remove();
    this.exit?.remove();
    this.fadeTop?.remove();
    this.fadeBottom?.remove();
    this.extras?.remove();
    // the Hud's strip comes back as its last render wrote it: Build, Demolish, People and PM leave the Manage group, and Events leaves Reports.
    // WORLD stays direct; the markup is written back before the next render (the Hud's click handler on the strip is delegated, so the new nodes work)
    if (this.strip && this.stripHtml !== null) this.strip.innerHTML = this.stripHtml;
    this.stripHtml = null;
    this.strip?.removeAttribute('data-phone');
    this.strip?.removeAttribute('id');
    this.strip?.removeAttribute('data-open');
    this.strip?.removeAttribute('data-fade-top');
    this.strip?.removeAttribute('data-fade-bottom');
    this.nav?.removeAttribute('data-phone');
    this.nav?.removeAttribute('id');
    this.nav?.removeAttribute('data-open');
    this.bar?.removeAttribute('data-phone');
    // the Hud's own action bar comes back with its camera keys in their bay; the next render rewrites it anyway
    if (this.bar && this.barHtml !== null) {
      this.bar.innerHTML = this.barHtml;
      const bay = this.bar.querySelector('[data-camera-bay]');
      if (bay && this.nav) bay.replaceWith(this.nav);
    }
    this.bar?.setAttribute('class', this.barClass ?? 'actionbar');
    this.barHtml = null;
    this.barClass = null;
    for (const [node, cls] of this.classes) { if (cls === null) node.removeAttribute('class'); else node.setAttribute('class', cls); }
    this.classes = new Map();
    const lens = this.nav?.querySelector('[data-lens-cycle]');
    if (lens && this.lensClass) lens.setAttribute('class', this.lensClass);
    this.lensClass = null;
    for (const t of this.toasts?.querySelectorAll('[data-phone="toast"]') ?? []) t.remove();
    document.documentElement.style.removeProperty('--glass-alpha');
    document.documentElement.style.removeProperty('--glass-blur');
    this.menuOpen = false;
    this.cameraOpen = false;
  }

  /** ?glassAlpha= and ?glassBlur= (the owner's sheet): inline on <html>, which outranks phone-tokens.css. */
  applyKnobs() {
    const { alpha, blur } = readGlassKnobs(window.location.search);
    const style = document.documentElement.style;
    if (alpha !== null) style.setProperty('--glass-alpha', String(alpha)); else style.removeProperty('--glass-alpha');
    if (blur !== null) style.setProperty('--glass-blur', `${blur}px`); else style.removeProperty('--glass-blur');
  }

  // ------------------------------------------------------------------------------------------------------------------------------- the plate

  buildPlate() {
    this.plate = el('header', { class: 'ph-plate', 'data-phone': 'plate', 'aria-label': 'Run status' }, `
      <div class="ph-cell ph-cell--cash"><span class="ph-cap">Cash</span><span class="ph-val" data-ph="cash"></span></div>
      <div class="ph-cell ph-cell--nav"><span class="ph-cap">NAV<span class="ph-lead" data-ph="lead"></span></span><span class="ph-val" data-ph="nav"></span></div>
      <div class="ph-cell ph-cell--quarter"><span class="ph-cap">Quarter</span><span class="ph-val" data-ph="quarter"></span></div>
      <div class="ph-cell ph-cell--actions"><span class="ph-cap">Actions</span><span class="ph-val" data-ph="actions"></span></div>`);
    this.menuBtn = el('button', { type: 'button', class: 'ph-menu-btn', 'data-phone': 'menu-btn', 'aria-label': 'Menu', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': 'ph-menu' }, `<span class="ph-glyph" aria-hidden="true">${SVG.menu}</span>`);
    this.statusbar.after(this.plate, this.menuBtn);
    this.cells = Object.fromEntries([...this.plate.querySelectorAll('[data-ph]')].map((n) => [n.dataset.ph, n]));
  }

  put(node, text, cls = null) {
    if (!node) return;
    if (node.textContent !== text) node.textContent = text;
    if (cls !== null) node.className = node.className.replace(/\bis-(gain|loss|warn)\b/g, '').trim() + (cls ? ` ${cls}` : '');
  }

  /** The plate's four figures, read from what the Hud just rendered (the hidden .statusbar and the rail's Petridis header). */
  syncPlate() {
    if (!this.plate) return;
    const money = this.statusbar.querySelectorAll('.status-row--money .stat--lead');
    const well = (node) => node?.querySelector('.counter__well');
    const cash = well(money[0]);
    const nav = well(money[1]);
    const quarter = this.statusbar.querySelector('.stat--quarter .counter__well');
    const actions = this.statusbar.querySelector('.stat--actions .counter__well');
    this.put(this.cells.cash, clean(cash?.textContent) || '', cash?.classList.contains('loss') ? 'is-loss' : '');
    this.put(this.cells.nav, clean(nav?.textContent) || '');
    this.put(this.cells.quarter, clean(quarter?.textContent) || '');
    this.put(this.cells.actions, clean(actions?.textContent) || '');
    const summary = this.rail?.querySelector('[data-rail-panel="rival"] .rail-tab__summary');
    const { leadSide, leadGap } = this.rail?.querySelector('[data-rail-panel="rival"]')?.dataset ?? {};
    // The signed plate figure follows the rendered NAV data, independent of rail copy.
    const lead = leadSide === 'tie' ? { kind: 'tie', figure: 'tied' }
      : leadSide === 'player' && leadGap ? { kind: 'lead', figure: `+${leadGap}` }
        : leadSide === 'rival' && leadGap ? { kind: 'trail', figure: `−${leadGap}` }
          : { kind: 'none', figure: '' };
    this.put(this.cells.lead, lead.figure ? ` ${lead.figure}` : '', lead.kind === 'lead' ? 'is-gain' : lead.kind === 'trail' ? 'is-loss' : '');
    this.cells.lead?.setAttribute('title', clean(summary?.textContent));
  }

  onStatus() {
    if (!this.on) return;
    this.syncPlate();
    this.moveRailToasts();
    this.scanNews();
  }

  onRail() {
    if (!this.on) return;
    this.syncPlate();
    this.refreshPill();
  }

  // ------------------------------------------------------------------------------------------------------------------------------- the menu

  buildMenuExtras() {
    // a static group, not a disclosure: the sound controls are on screen the moment the menu opens (the gate counts a disclosure as a second tap)
    this.settings = el('section', { class: 'ph-settings', 'data-phone-settings': '', 'aria-labelledby': 'ph-settings-title' }, `
      <h2 class="ph-settings__title" id="ph-settings-title">Settings</h2>
      <button type="button" role="switch" class="ph-switch" data-sound-enabled aria-checked="true"><span class="ph-switch__label">Sound</span><span class="ph-switch__state" aria-hidden="true"></span></button>
      <label class="ph-range"><span class="ph-range__label">Music</span><input type="range" min="0" max="100" step="1" data-music-volume aria-label="Music volume"><output></output></label>
      <label class="ph-range"><span class="ph-range__label">Effects</span><input type="range" min="0" max="100" step="1" data-effects-volume aria-label="Effects volume"><output></output></label>`);
    // the four tools (Build, Demolish, People, PM) as a static group under a Manage heading: the gate counts the Hud's collapsed Manage drawer as a second tap
    this.manage = el('section', { class: 'ph-manage', 'data-phone-manage': '', 'aria-labelledby': 'ph-manage-title' }, '<h2 class="ph-manage__title" id="ph-manage-title">Manage</h2>');
    this.exit = el('a', { class: 'mobile-cycle-chip ph-exit', href: './index.html', 'data-phone-exit': '' }, 'Exit');
    // the scroll cue: two fades that hold to the menu's top and bottom edges while there is more in that direction (hud-phone.css "the scroll cue")
    this.fadeTop = el('span', { class: 'ph-fade ph-fade--top', 'data-phone-fade': 'top', 'aria-hidden': 'true' });
    this.fadeBottom = el('span', { class: 'ph-fade ph-fade--bottom', 'data-phone-fade': 'bottom', 'aria-hidden': 'true' });
    const signal = this.ac.signal;
    const sw = this.settings.querySelector('[data-sound-enabled]');
    const music = this.settings.querySelector('[data-music-volume]');
    const effects = this.settings.querySelector('[data-effects-volume]');
    sw.addEventListener('click', () => {
      audioBus?.unlock();
      const want = !soundOn();
      // main.js owns the mute flag, its preference and its toast: its M key is the one way in that keeps them in step
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
      this.syncSettings(want);
    }, { signal });
    const level = (input, name, apply) => input.addEventListener('input', () => {
      const v = Number(input.value) / 100;
      audioBus?.unlock();
      apply(v);
      store.set(name, String(v));
      input.nextElementSibling.textContent = `${Math.round(v * 100)}%`;
    }, { signal });
    guardRange(music, signal);
    guardRange(effects, signal);
    level(music, 'music-volume', (v) => audioBus?.setMusicVolume(v));
    level(effects, 'effects-volume', (v) => audioBus?.setEffectsVolume(v));
    effects.addEventListener('change', () => audioBus?.play('acquire'), { signal });
    this.exit.addEventListener('click', (event) => {
      if (this.exit.dataset.armed === '1') return; // the second tap follows the link
      event.preventDefault();
      this.exit.dataset.armed = '1';
      this.exit.textContent = 'Tap again to exit';
      clearTimeout(this.exitTimer);
      this.exitTimer = setTimeout(() => this.disarmExit(), EXIT_ARM_MS);
    }, { signal });
    this.syncSettings();
  }

  /** Exit back to its first tap: the 6 s timer and a closing menu both call it, so "Tap again to exit" never survives a close and reopen. */
  disarmExit() {
    clearTimeout(this.exitTimer);
    if (!this.exit) return;
    this.exit.dataset.armed = '0';
    this.exit.textContent = 'Exit';
  }

  syncSettings(on = soundOn()) {
    const sw = this.settings?.querySelector('[data-sound-enabled]');
    if (!sw) return;
    sw.setAttribute('aria-checked', String(on));
    sw.querySelector('.ph-switch__state').textContent = on ? 'On' : 'Off';
    const set = (input, name, fallback, live) => {
      const stored = store.get(name);
      const v = live ?? (stored !== null && Number.isFinite(Number(stored)) ? Number(stored) : fallback);
      input.value = String(Math.round(v * 100));
      input.nextElementSibling.textContent = `${Math.round(v * 100)}%`;
    };
    set(this.settings.querySelector('[data-music-volume]'), 'music-volume', 0.35, audioBus?.musicVolume);
    set(this.settings.querySelector('[data-effects-volume]'), 'effects-volume', 0.8, audioBus?.effectsVolume);
  }

  /**
   * After each Hud render the persistent Settings and Exit nodes go back in (their order is the stylesheet's). Events moves into Reports,
   * WORLD stays direct, and the four tools form the Manage group, so the menu is Help, WORLD, Settings, Manage, Reports, the Cybercab launcher and Exit.
   */
  onStrip() {
    if (!this.on) return;
    // a Hud render sets the strip's innerHTML, which takes the persistent nodes out; moving a button into the Manage group is a childList change of
    // the strip too, so the work is done once per render, when the group has been taken out
    const rendered = this.manage.parentElement !== this.strip;
    // the Hud's own markup, taken before anything moves or is added (deactivate() writes it back, as it does the bar's)
    if (rendered) this.stripHtml = this.strip.innerHTML;
    for (const node of [this.settings, this.manage, this.exit, this.fadeTop, this.fadeBottom]) if (node.parentElement !== this.strip) this.strip.append(node);
    if (rendered) {
      for (const old of this.manage.querySelectorAll('button')) old.remove();
      const tools = ['build', 'demolish', 'people', 'pm'].map((k) => this.strip.querySelector(`[data-mobile-rail-tool="${k}"]`)).filter(Boolean);
      if (tools.length) this.manage.append(...tools);
      const body = this.strip.querySelector('details[data-mobile-drawer="reports"] > .v4-mobile-drawer__body');
      if (body) {
        const views = ['events'].map((v) => this.strip.querySelector(`:scope > [data-status-view="${v}"]`)).filter(Boolean);
        if (views.length) body.prepend(...views);
      }
    }
    this.syncSettings();
    this.syncFades();
  }

  /**
   * The menu's scroll cue. Where the menu is taller than its cap it scrolls; the top fade shows once it has scrolled, the bottom fade while more lies below
   * (at the very end it would only dim Exit's lower edge). The fades are sticky nodes inside the menu, so the stylesheet does the holding; this only sets
   * the two flags it keys on. A closed menu has no box (display none), so both read 0.
   */
  syncFades() {
    const m = this.strip;
    if (!this.on || !m) return;
    const set = (name, on) => { const v = on ? '1' : '0'; if (m.getAttribute(name) !== v) m.setAttribute(name, v); };
    // a closed menu has no box and nothing to read: no layout is forced on a Hud render while it is shut
    const open = this.menuOpen;
    const room = open ? m.scrollHeight - m.clientHeight : 0;
    const top = room > 1 && m.scrollTop > 1;
    const bottom = room > 1 && m.scrollTop + m.clientHeight < m.scrollHeight - 1;
    set('data-fade-top', top);
    set('data-fade-bottom', bottom);
  }

  onMenuClick(event) {
    const target = event.target;
    // a press on a verb closes the menu; a disclosure, a slider or the switch keeps it open
    if (target.closest('summary, input, label, [data-sound-enabled], [data-phone-exit]')) return;
    if (target.closest('button, a[href]')) this.setMenu(false);
  }

  setMenu(open, { focus = false } = {}) {
    if (open === this.menuOpen) return;
    if (open) { this.setCamera(false); this.closePill(); }
    this.menuOpen = open;
    this.strip.dataset.open = open ? '1' : '0';
    this.menuBtn.setAttribute('aria-expanded', String(open));
    this.menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
    this.menuBtn.querySelector('.ph-glyph').innerHTML = open ? SVG.close : SVG.menu;
    if (open) {
      // the menu opens at its top. The write comes after data-open = 1: a closed menu has no box (display none) and ignores a scroll write, and Chrome then
      // gives back the offset it was closed at; the setter brings style and layout up to date first, so the box exists when the 0 lands
      this.strip.scrollTop = 0;
    } else {
      for (const d of this.strip.querySelectorAll('details[open]')) d.open = false;
      this.disarmExit();
      if (focus) this.menuBtn.focus();
    }
    this.syncFades();
    // the menu has a box only once its display has changed: read the scroll state again after the next frame as well
    if (open) window.requestAnimationFrame(() => this.syncFades());
  }

  // ---------------------------------------------------------------------------------------------------------------------------- the bottom bar

  buildBarExtras() {
    this.camBtn = el('button', { type: 'button', class: 'ph-cam-btn', 'data-phone': 'camera-btn', 'aria-label': 'Camera controls', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': 'ph-camera' }, `<span class="ph-glyph" aria-hidden="true">${SVG.camera}</span>`);
    this.pillPetridis = el('button', { type: 'button', class: 'ph-pill', 'data-phone': 'pill-petridis', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': 'Petridis' }, '<span>Petridis</span>');
    this.pillDistricts = el('button', { type: 'button', class: 'ph-pill', 'data-phone': 'pill-districts', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': 'Districts' }, '<span>Districts</span>');
    this.extras = el('div', { class: 'ph-extras' });
    this.extras.append(this.camBtn, this.pillPetridis, this.pillDistricts);
  }

  /**
   * After each Hud render the action bar's markup and class are new (_renderActions sets both): the layer takes the real Bank and Settle buttons out of the
   * Hud's settle-fab wrapper, renames them, marks them data-phone-action, puts the camera keys back out of the bar and re-adds the extras.
   * The elements stay the Hud's own, so its click handler on the footer (and the B key's lookup by data-verb-family) work as before.
   */
  onBar() {
    if (!this.on) return;
    const bar = this.bar;
    if (bar.getAttribute('class') !== 'ph-bar') { this.barClass = bar.getAttribute('class'); bar.setAttribute('class', 'ph-bar'); }
    const fab = bar.querySelector('.settle-fab');
    if (fab) this.rebuildBar(fab);
    this.restyleLens();
    if (this.nav.parentElement !== this.game) this.game.insertBefore(this.nav, this.toasts);
    if (this.extras.parentElement !== bar) bar.append(this.extras);
  }

  rebuildBar(fab) {
    const bar = this.bar;
    // what deactivate() puts back: the Hud's markup with the camera keys in their bay
    if (this.nav.parentElement && bar.contains(this.nav)) this.nav.replaceWith(el('span', { 'data-camera-bay': '', 'aria-hidden': 'true' }));
    this.barHtml = bar.innerHTML;
    const bank = fab.querySelector('[data-verb="hold"]');
    const settle = fab.querySelector('[data-verb="settle"]');
    const keep = [];
    for (const [button, kind] of [[bank, 'bank'], [settle, 'settle']]) {
      if (!button) continue;
      const label = clean(button.querySelector('.verb__label')?.textContent) || (kind === 'bank' ? 'Bank' : 'Settle');
      const hint = clean(button.querySelector('.verb__hint, .verb__reason')?.textContent);
      // A Settle that forces a sale or ends the run (hud.js settleButtonState) carries it: in full in the name, short under the label.
      const note = kind === 'settle' ? clean(button.dataset.settleNote) : '';
      const short = kind === 'settle' ? clean(button.dataset.settleHint) : '';
      const glyph = button.querySelector('svg');
      button.setAttribute('class', `ph-btn ph-btn--${kind}`);
      button.setAttribute('data-phone-action', kind);
      button.setAttribute('aria-label', note || hint ? `${label}, ${note || hint}` : label);
      const text = el('span', { class: 'ph-btn__label' });
      text.textContent = label;
      if (glyph) glyph.setAttribute('class', 'ph-btn__glyph');
      let face = text;
      if (short) {
        face = el('span', { class: 'ph-btn__stack' });
        const small = el('small', { class: 'ph-btn__hint', 'aria-hidden': 'true' });
        small.textContent = short;
        face.append(text, small);
      }
      button.replaceChildren(...(glyph ? [glyph] : []), face);
      keep.push(button);
    }
    bar.replaceChildren(...keep);
  }

  /** The lens button's legacy classes carry !important paper-and-steel rules; it is created once, so its class is taken off once. */
  restyleLens() {
    const lens = this.nav.querySelector('[data-lens-cycle]');
    if (!lens || lens.getAttribute('class') === 'ph-lens') return;
    this.lensClass = lens.getAttribute('class');
    lens.setAttribute('class', 'ph-lens');
  }

  onBarClick(event) {
    const camera = event.target.closest('[data-phone="camera-btn"]');
    if (camera) { this.setCamera(!this.cameraOpen); return; }
    const pill = event.target.closest('[data-phone^="pill-"]');
    if (pill) this.openPill(pill.dataset.phone === 'pill-petridis' ? 'petridis' : 'districts');
  }

  // ----------------------------------------------------------------------------------------------------------------------- the camera popover

  setCamera(open, { focus = false } = {}) {
    if (open === this.cameraOpen) return;
    if (open) { this.setMenu(false); this.closePill(); }
    this.cameraOpen = open;
    this.nav.dataset.open = open ? '1' : '0';
    this.camBtn.setAttribute('aria-expanded', String(open));
    if (!open && focus) this.camBtn.focus();
  }

  onCameraClick(event) {
    // the Hud's own handler (main.js bindInput) moves the camera; Frame city is one shot, so the popover closes after it, the zoom keys stay
    if (event.target.closest('[data-camera="frame"]')) this.setCamera(false);
  }

  // ------------------------------------------------------------------------------------------------------------------- the pills' overlay sheet

  /**
   * The markup the sheet shows. The rail's own copy while it has one; the Hud renders a tool panel (Build, People, PM) in place of the Districts roster
   * while a tool is on, so then the roster is built from the game's city and state by the Hud's own exported builder.
   */
  pillMarkup(key) {
    if (!this.rail) return null;
    if (key === 'petridis') return this.rail.querySelector('[data-rail-panel="rival"] > .body')?.innerHTML ?? null;
    const roster = this.rail.querySelector('#districts-roster');
    if (roster) return roster.innerHTML;
    const dd = window.__districtDeck;
    const city = dd?.getCity?.();
    const state = dd?.getState?.();
    return this.pairsRailHtml && city && state ? this.pairsRailHtml(city, state, null) : null;
  }

  pillHtml(key, markup) {
    return `<div class="ph-clone ph-clone--${key}"><div class="ph-c-body" data-ph-root>${markup}</div></div>`;
  }

  openPill(key) {
    const markup = this.pillMarkup(key);
    if (markup === null) return;
    this.closePill();
    this.setMenu(false);
    this.setCamera(false);
    const label = key === 'petridis' ? 'Petridis' : 'Districts';
    // modal.js owns focus, Tab, Escape and the close button; the content is the rail's own markup
    const close = openModal(this.game, {
      label,
      html: this.pillHtml(key, markup),
      onClick: (event, done) => this.onPillClick(event, done),
    });
    const overlay = this.game.lastElementChild?.classList.contains('overlay') ? this.game.lastElementChild : null;
    const sheet = overlay?.querySelector('.sheet');
    if (!overlay || !sheet) { close(); return; }
    rescopeClasses(overlay.querySelector('[data-ph-root]'));
    this.pill = { key, overlay, sheet, close, html: markup };
    overlay.dataset.phonePill = key;
    sheet.setAttribute('data-phone', 'dialog');
    // drop the legacy document-sheet classes (their !important paper rules) and name the parts this layer styles
    sheet.className = 'ph-pill-sheet'; // the `sheet` class goes too: legacy `.sheet p, .sheet li, .sheet h2` rules (one with !important) would reach the copy
    sheet.querySelector('.sheet__binder')?.setAttribute('class', 'ph-sheet-head');
    sheet.querySelector('.sheet__nameplate')?.setAttribute('class', 'ph-sheet-title');
    sheet.querySelector('[data-close]')?.setAttribute('class', 'ph-sheet-close');
    sheet.querySelector('.sheet__paper')?.setAttribute('class', 'ph-sheet-body');
    this.syncPills();
  }

  onPillClick(event, done) {
    const pill = this.pill;
    if (!pill) return;
    const hit = event.target.closest('[data-goto], [data-pair-focus], [data-district-targets], [data-district-candidates], [data-district-blocks], [data-person-goto]');
    const root = pill.overlay.querySelector('[data-ph-root]');
    if (!hit || !root || !root.contains(hit) || hit.disabled) return;
    done();
    this.pill = null;
    this.syncPills();
    // The Hud's rail handler is delegated on .rail and reads data attributes only, so a copy of the pressed element handed to the rail runs the same
    // handler (focus a district, go to a parcel) whatever the rail is showing, and the rail is not touched.
    const ghost = hit.cloneNode(true);
    this.rail.append(ghost);
    ghost.click();
    ghost.remove();
  }

  /** The rail re-rendered while the sheet is up: show the new markup. */
  refreshPill() {
    const pill = this.pill;
    if (!pill) return;
    const markup = this.pillMarkup(pill.key);
    const root = pill.overlay.querySelector('[data-ph-root]');
    if (markup === null || !root || markup === pill.html) return;
    pill.html = markup;
    root.innerHTML = markup;
    rescopeClasses(root);
  }

  closePill() {
    const pill = this.pill;
    if (!pill) return;
    this.pill = null;
    pill.close();
    this.syncPills();
  }

  syncPills() {
    const open = this.pill && this.pill.overlay.isConnected ? this.pill.key : null;
    this.pillPetridis?.setAttribute('aria-expanded', String(open === 'petridis'));
    this.pillDistricts?.setAttribute('aria-expanded', String(open === 'districts'));
  }

  /** Something else closed the sheet (its own close button, Escape, a restart): forget it. */
  onGame() {
    if (this.pill && !this.pill.overlay.isConnected) { this.pill = null; this.syncPills(); }
  }

  // ---------------------------------------------------------------------------------------------------------------------------------- toasts

  moveRailToasts() {
    // the Hud puts merge notices inside the hidden status bar; on the phone they are ordinary toasts
    for (const t of this.statusbar.querySelectorAll('.toast--rail')) this.toasts.append(t);
  }

  onToasts() {
    if (!this.on) return;
    for (const t of [...this.toasts.children]) {
      if (t.dataset.phone === 'toast') continue;
      const kind = /toast--reject/.test(t.className) ? 'reject' : /toast--good/.test(t.className) ? 'good' : 'plain';
      const text = clean((t.querySelector('.toast__body') ?? t).textContent);
      t.className = `ph-toast ph-toast--${kind}`;
      t.dataset.phone = 'toast';
      t.replaceChildren(el('span', { class: 'ph-toast__body' }, ''));
      t.firstChild.textContent = text;
    }
    trimToasts(this.toasts, MAX_TOASTS);
  }

  /** The ticker leaves the plate; each new line of news arrives as a toast (two at most at once). */
  scanNews() {
    if (document.body.classList.contains('loader-pending')) return;
    // the first look after the loader only learns the lines already on the ticker, so the board opens without a toast
    const primed = this.newsPrimed;
    this.newsPrimed = true;
    const fresh = [];
    for (const line of this.statusbar.querySelectorAll('[data-ticker-key]')) {
      const key = line.dataset.tickerKey;
      if (this.seenNews.has(key)) continue;
      this.seenNews.add(key);
      fresh.push(newsLine({
        name: line.querySelector('.ticker-line__name')?.textContent,
        fragment: line.querySelector('.ticker-line__frag')?.textContent,
        anchor: line.querySelector('.ticker-line__anchor')?.textContent,
      }));
    }
    if (primed) for (const text of fresh.slice(-2)) this.news(text);
  }

  news(text) {
    if (!text) return;
    const t = el('div', { class: 'ph-toast ph-toast--news', 'data-phone': 'toast' });
    t.append(el('span', { class: 'ph-toast__body' }));
    t.firstChild.textContent = text;
    this.toasts.append(t);
    setTimeout(() => t.remove(), TOAST_MS);
  }

  // ------------------------------------------------------------------------------------------------------------------------------ outside taps

  onOutside(event) {
    const t = event.target;
    if (this.menuOpen && !this.strip.contains(t) && !this.menuBtn.contains(t)) this.setMenu(false);
    if (this.cameraOpen && !this.nav.contains(t) && !this.camBtn.contains(t)) this.setCamera(false);
    if (this.pill && !this.pill.overlay.contains(t)) this.closePill();
  }

  onKey(event) {
    if (event.key !== 'Escape') return;
    if (this.menuOpen) { event.preventDefault(); event.stopPropagation(); this.setMenu(false, { focus: true }); return; }
    if (this.cameraOpen) { event.preventDefault(); event.stopPropagation(); this.setCamera(false, { focus: true }); }
  }
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.__ddPhoneHud) {
  window.__ddPhoneHud = new PhoneHud();
  window.__ddPhoneHud.start();
}
