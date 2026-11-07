// District Deck V3.70 L7 — the town square on a pocket-park block centre.
//
// Two halves. Left is the news board, which renders ONE local file and says plainly
// whether that file is sample data or a real refresh — see `src/core/townsquare-news.js`
// for why there is no API key and no third-party call anywhere in this path. Right is
// the square itself, where the player talks to the game's own cast. That conversation is
// offline, authored and deterministic; it does not reach other humans and never claims to.
//
// Reads run state (quarter, grade, holdings) so the cast can be specific. Writes nothing.

import * as THREE from 'three';
import { dailySeed, escapeHtml } from '../core/format.js';
import { SEASON_LABEL, seasonForQuarter } from '../core/veggie-patch.js';
import {
  BOARD_SIZE,
  TAG_LABEL,
  ageInDays,
  boardForDay,
  emptyFeed,
  feedStatus,
  loadFeed,
  tagsInFeed,
} from '../core/townsquare-news.js';
import {
  CAST,
  CAST_BY_ID,
  PROMPTS,
  openingPost,
  readTags,
  respond,
} from '../core/townsquare-chat.js';
import {
  FLOOR_PER_QUARTER,
  createFloor,
  floorKey,
  openQuarter,
  parseFloor,
  raise,
  serialiseFloor,
  standingLabel,
  standingOf,
  turnsLeft,
} from '../core/townsquare-floor.js';
import { skyTexture } from './minigame-textures.js';
import { buildSquareCast, buildTownSquare } from './townsquare-voxels.js';
import { trapOverlayKeys } from './minigame-entry.js';

/** Deliberately local — see the note in veggie-patch.js. */
const store = {
  get(key) {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  },
  set(key, value) {
    try { globalThis.localStorage?.setItem(key, value); return true; } catch { return false; }
  },
};

function el(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
}

/** See the note in veggie-patch.js — keeps the wiring edit to one file. Idempotent. */
function ensureStyles() {
  const href = new URL('./townsquare-panel.css', import.meta.url).href;
  // Compare RESOLVED hrefs: a page whose own <link> is relative would not match an
  // attribute-selector test, and the sheet would be injected a second time.
  const already = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .some((link) => link.href === href);
  if (already) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}

/** The pocket park this square belongs to. Mirrors `supermarketOnBoard`. */
export function pocketParkOnBoard(city) {
  return (city?.blockCores ?? []).find((core) => core.useId === 'pocket-park') ?? null;
}

export class TownSquare {
  constructor(host, { onAction, onClose, onCue } = {}) {
    this.host = host;
    this.onAction = onAction;
    this.onClose = onClose;
    this.onCue = onCue;
    this.element = null;
    this.city = null;
    this.state = null;
    this.coreId = 'core';
    this.feed = emptyFeed('Loading the news board.');
    this.filter = null;
    this.thread = [];
    this.turn = 0;
    this.dayKey = 'DD-00000000';
    this.floor = createFloor({});
    this._untrap = null;
    this._raf = 0;
  }

  get open() {
    return Boolean(this.element && !this.element.hidden);
  }

  /** `now` is injected so a probe can pin the day. Time never enters core by itself. */
  show(city, state, seed = 0, coreId = 'core', now = new Date()) {
    this.city = city;
    this.state = state;
    this.seed = String(seed ?? 0);
    this.coreId = String(coreId ?? 'core');
    this.now = now;
    this.dayKey = `${dailySeed(now)}:${this.seed}`;
    this.turn = 0;
    const quarter = Math.max(1, Number(state?.quarter) || 1);
    const fallback = createFloor({ seed: this.seed, coreId: this.coreId, quarter });
    const stored = store.get(floorKey(this.seed, this.coreId));
    this.floor = openQuarter(stored ? parseFloor(stored, fallback) : fallback, quarter);
    this._persist();
    if (!this.element) { ensureStyles(); this._mount(); }
    this.element.hidden = false;
    this.thread = [{ kind: 'said', ...this._opening() }];
    this._paint();
    this._load();
    this._arm();
    this._resize();
  }

  close() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._persist();
    if (this.element) this.element.hidden = true;
    this.onClose?.();
  }

  destroy() {
    this.close();
    this._untrap?.();
    this._untrap = null;
    this.cast?.dispose?.();
    this.cast = null;
    this.renderer?.dispose();
    this.element?.remove();
    this.element = null;
  }

  _persist() {
    store.set(floorKey(this.seed, this.coreId), serialiseFloor(this.floor));
  }

  /**
   * What the square actually knows about the run. Every briefing is built from these and
   * nothing else — a briefing that cannot be grounded in a number is not issued.
   * Reads only; the panel never writes a field of `state`.
   */
  _facts() {
    const state = this.state ?? {};
    const city = this.city ?? {};
    const holdings = Object.values(state.holdings ?? {}).filter((row) => row?.owner === 'player');
    const quarter = Math.max(1, Number(state.quarter) || 1);
    const quarterCap = Math.max(quarter, Number(city.quarters) || quarter);
    const districtsHeld = new Set();
    for (const [id, row] of Object.entries(state.holdings ?? {})) {
      if (row?.owner !== 'player') continue;
      const district = city.parcels?.[id]?.districtId ?? city.parcels?.[id]?.district ?? null;
      if (district) districtsHeld.add(district);
    }
    const season = seasonForQuarter(quarter);
    return {
      quarter,
      quarterCap,
      quartersLeft: Math.max(0, quarterCap - quarter),
      season,
      seasonLabel: SEASON_LABEL[season] ?? 'This quarter',
      cash: Number(state.cash) || 0,
      grade: state.grade ?? null,
      holdings: holdings.length,
      mortgaged: holdings.filter((row) => (Number(row.debt) || 0) > 0).length,
      building: holdings.filter((row) => row.construction).length,
      parcels: city.order?.length ?? 0,
      districts: city.districts?.length ?? 0,
      districtsHeld: districtsHeld.size,
    };
  }

  _opening() {
    const quarter = Math.max(1, Number(this.state?.quarter) || 1);
    // The player's titles, not every title on the board. r1 counted the rival's holdings as
    // "we hold", which is a small lie told confidently by the one voice in this square whose
    // whole character is that he does not tell them.
    const holdings = Object.values(this.state?.holdings ?? {})
      .filter((row) => row?.owner === 'player').length;
    return openingPost({
      quarter,
      season: seasonForQuarter(quarter),
      grade: this.state?.grade ?? null,
      holdings,
      feedStatusKind: feedStatus(this.feed).kind,
    });
  }

  async _load() {
    this.feed = await loadFeed();
    // Re-open the square now the board's honesty is known.
    this.thread = [{ kind: 'said', ...this._opening() }];
    this._paint();
  }

  _mount() {
    this.element = el(`
      <section class="tsq" role="dialog" aria-label="Town square">
        <header class="tsq__bar">
          <i class="tsq__mark" aria-hidden="true"></i>
          <span class="tsq__brand">Town Square</span>
          <span class="tsq__tag" data-tsq-where>Pocket park</span>
          <span class="tsq__spacer"></span>
          <span class="tsq__chip" data-tsq-clock>Q1</span>
          <button type="button" class="tsq__x" data-tsq-close aria-label="Close">✕</button>
        </header>
        <div class="tsq__stage">
          <section class="tsq__board" aria-label="News board">
            <div class="tsq__banner" data-tsq-banner></div>
            <div class="tsq__filters" data-tsq-filters></div>
            <div class="tsq__items" data-tsq-items></div>
          </section>
          <section class="tsq__square" aria-label="Discussion">
            <div class="tsq__park">
              <canvas data-tsq-canvas></canvas>
              <div class="tsq__floor" data-tsq-floor></div>
            </div>
            <div class="tsq__standing" data-tsq-standing></div>
            <p class="tsq__preamble">
              You are talking to the people in this game — Aido, the consultants, and the
              man across the road. Nobody else is in this square, and nothing you type
              leaves this machine. The minute book is kept for this block centre, in this
              browser: it is not in the run's save file, and clearing the cache clears the
              minutes.
            </p>
            <div class="tsq__thread" data-tsq-thread aria-live="polite"></div>
            <div class="tsq__prompts" data-tsq-prompts></div>
            <form class="tsq__say" data-tsq-say>
              <input type="text" data-tsq-input maxlength="220" autocomplete="off"
                     placeholder="Say something to the square…" aria-label="Say something">
              <button type="submit" class="tsq__btn tsq__btn--go">Speak</button>
            </form>
          </section>
        </div>
      </section>
    `);
    this.host.append(this.element);

    this.element.querySelector('[data-tsq-close]').addEventListener('click', () => this.close());
    this.element.querySelector('[data-tsq-say]').addEventListener('submit', (event) => {
      event.preventDefault();
      const input = this.element.querySelector('[data-tsq-input]');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      this._say(text);
    });
    this.element.querySelector('[data-tsq-prompts]').addEventListener('click', (event) => {
      const button = event.target.closest('[data-prompt]');
      if (!button) return;
      const prompt = PROMPTS.find((row) => row.id === button.dataset.prompt);
      if (prompt) this._say(prompt.label, prompt.tags);
    });
    this.element.querySelector('[data-tsq-filters]').addEventListener('click', (event) => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      const tag = button.dataset.filter || null;
      this.filter = this.filter === tag ? null : tag;
      this._paint();
    });
    this.element.querySelector('[data-tsq-items]').addEventListener('click', (event) => {
      const button = event.target.closest('[data-raise]');
      if (!button) return;
      const item = this._board().find((row) => row.id === button.dataset.raise);
      if (item) this._say(`About this: ${item.headline}`, item.tags);
    });

    // Capture-phase trap: typing in the box used to drive the board's lens and verb keys.
    // Text input still lands, because nothing here calls preventDefault.
    this._untrap = trapOverlayKeys(() => this.open, (event) => {
      if (event.key === 'Escape') { this.close(); return; }
      const lower = String(event.key).toLowerCase();
      if (lower === 'q') { this._spinView(-1); event.preventDefault(); return; }
      if (lower === 'e') { this._spinView(1); event.preventDefault(); }
    });
    this._initThree();
  }

  // --- the park --------------------------------------------------------------

  _initThree() {
    const canvas = this.element.querySelector('[data-tsq-canvas]');
    this._canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = skyTexture('square');
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 140);

    const hemi = new THREE.HemisphereLight('#e4eeff', '#6a6250', 0.80);
    const key = new THREE.DirectionalLight('#fff2d6', 1.42);
    key.position.set(10, 15, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -11;
    key.shadow.camera.right = 11;
    key.shadow.camera.top = 11;
    key.shadow.camera.bottom = -11;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 52;
    const fill = new THREE.DirectionalLight('#c2d8ee', 0.30);
    fill.position.set(-8, 6, -7);
    this.scene.add(hemi, key, fill);

    this.world = new THREE.Group();
    this.world.add(buildTownSquare());
    this.scene.add(this.world);
    this.spin = 0;
    this._poseCamera(3);
    this._mountCast();
  }

  /**
   * Put the five named speakers, the player and a dog in the square.
   *
   * r2's second square major was that the model had no figures in it while five speakers
   * carried standing chips under it. `buildSquareCast()` instantiates L2's own
   * `PeopleFigureBatch` — its file is not edited — and the batch is added to `world` so it
   * spins with `Q`/`E` like everything else.
   *
   * Synchronous, and it is worth saying why the first cut was not. Loading the figure module
   * behind a dynamic import measured 59 seconds to resolve on a loaded box, so three probe
   * runs read an empty square and were reading a promise that had not landed. The module is
   * already in the page's graph for the board, so the static path costs nothing and the
   * square is either populated the moment it opens or it is honestly reported as not.
   *
   * A failure here must never take the overlay down: a square with no people is the worst
   * case, and `castError` carries the reason rather than swallowing it.
   */
  _mountCast() {
    this.cast = null;
    this.castError = null;
    try {
      const cast = buildSquareCast({ reducedMotion: true });
      if (!cast) { this.castError = 'buildSquareCast returned null'; return; }
      this.cast = cast;
      this.world.add(...cast.meshes);
    } catch (error) {
      this.cast = null;
      this.castError = String(error?.stack ?? error);
      // Not a throw. Not silence either — a swallowed reason is how a missing feature gets
      // reported as "built but not visible", which cost this round three probe runs.
      console.warn('townsquare-panel: the square cast did not mount —', this.castError);
    }
  }

  _poseCamera(aspect) {
    // A wide, shallow banner. Frame the paving and the benches; the canopies may crop.
    const halfWide = 9.4;
    const halfTall = 3.9;
    const v = Math.max(halfTall, halfWide / Math.max(0.3, aspect));
    this.camera.left = -v * aspect;
    this.camera.right = v * aspect;
    this.camera.top = v;
    this.camera.bottom = -v;
    // Lower than the other two: a square is a place you stand in, not a plan you read.
    this.camera.position.set(10, 8.0, 13);
    this.camera.lookAt(0, 1.5, 0);
    this.camera.updateProjectionMatrix();
  }

  _spinView(step) {
    this.spin = ((this.spin ?? 0) + step + 4) % 4;
    if (this.world) this.world.rotation.y = (this.spin * Math.PI) / 2;
  }

  _resize() {
    if (!this.renderer || !this._canvas) return;
    const box = this._canvas.getBoundingClientRect();
    const w = Math.max(16, Math.floor(box.width));
    const h = Math.max(16, Math.floor(box.height));
    this.renderer.setSize(w, h, false);
    this._poseCamera(w / h);
  }

  _arm() {
    if (this._raf) return;
    const step = () => {
      this._raf = requestAnimationFrame(step);
      if (!this.open) return;
      this._resize();
      this.renderer.render(this.scene, this.camera);
    };
    this._raf = requestAnimationFrame(step);
  }

  _say(text, tags = []) {
    this.turn += 1;
    this.thread.push({ kind: 'player', text });
    const topics = tags.length ? tags : readTags(text);
    const result = raise(this.floor, {
      tags: topics,
      headline: text,
      dayKey: this.dayKey,
      facts: this._facts(),
    });
    if (!result.ok) {
      // Out of floor. The square does not go silent — the chair explains the rule, which is
      // the only honest way to refuse a player who has just typed something.
      this.thread.push({
        kind: 'said',
        castId: 'aido',
        name: 'Aido',
        accent: '#d8a24a',
        text: `${result.reason} I will hold it over: it goes in next quarter's business, and the floor opens again when the run advances.`,
      });
      this.onCue?.('reject');
      this._paintThread();
      this._paintFloor();
      return;
    }
    this.floor = result.floor;
    this._persist();
    const { replies } = respond({
      text, tags: topics, dayKey: this.dayKey, turn: this.turn,
    });
    for (const reply of replies) this.thread.push({ kind: 'said', ...reply });
    for (const briefing of result.briefings) {
      const cast = CAST_BY_ID[briefing.castId];
      this.thread.push({
        kind: 'said',
        briefing: true,
        castId: briefing.castId,
        name: cast?.name ?? briefing.castId,
        accent: cast?.accent ?? '#6f96b8',
        text: briefing.text,
      });
    }
    this.onCue?.(result.briefings.length ? 'ching' : 'select');
    this._paintThread();
    this._paintFloor();
    this._paintStanding();
  }

  _paint() {
    if (!this.element) return;
    const quarter = Math.max(1, Number(this.state?.quarter) || 1);
    this.element.querySelector('[data-tsq-clock]').textContent = `Q${quarter}`;
    this.element.querySelector('[data-tsq-where]').textContent = this.coreId === 'core'
      ? 'Pocket park'
      : `Pocket park · ${this.coreId}`;
    this._paintBanner();
    this._paintFilters();
    this._paintItems();
    this._paintPrompts();
    this._paintThread();
    this._paintFloor();
    this._paintStanding();
  }

  /** The day's board, drawn from the file's pool. Six of twenty-four, rotated by day. */
  _board() {
    return boardForDay(this.feed, this.dayKey, BOARD_SIZE);
  }

  _paintFloor() {
    const node = this.element.querySelector('[data-tsq-floor]');
    if (!node) return;
    const left = turnsLeft(this.floor);
    const pips = Array.from({ length: FLOOR_PER_QUARTER }, (_, i) => (
      `<i class="${i < left ? 'is-on' : ''}"></i>`
    )).join('');
    node.innerHTML = `
      <span class="tsq__floor-pips">${pips}</span>
      <b>${left} of ${FLOOR_PER_QUARTER}</b>
      <span>${left > 0 ? 'turns of the floor this quarter' : 'the floor is spent until the run advances'}</span>`;
    node.classList.toggle('is-spent', left <= 0);
  }

  _paintStanding() {
    const node = this.element.querySelector('[data-tsq-standing]');
    if (!node) return;
    const rows = CAST.filter((cast) => !cast.chairs).map((cast) => {
      const level = standingOf(this.floor, cast.id);
      return `<i class="tsq__stand${level >= 2 ? ' is-brief' : ''}${level > 0 ? ' is-known' : ''}"
                 title="${escapeHtml(`${cast.name} ${standingLabel(level)}`)}">
                ${escapeHtml(cast.shortName)}<b>${level}</b></i>`;
    }).join('');
    const last = this.floor.minutes[this.floor.minutes.length - 1] ?? null;
    node.innerHTML = `${rows}${last ? `<span class="tsq__minute">Minuted: ${escapeHtml(last)}</span>` : ''}`;
  }

  _paintBanner() {
    const node = this.element.querySelector('[data-tsq-banner]');
    const status = feedStatus(this.feed);
    const age = ageInDays(this.feed, this.now instanceof Date ? this.now : new Date());
    const stale = age != null && age > 1 ? ` Written ${age} day${age === 1 ? '' : 's'} ago.` : '';
    node.className = `tsq__banner is-${status.kind}`;
    node.innerHTML = `
      <b>${escapeHtml(status.label)}</b>
      <span>${escapeHtml(status.detail)}${escapeHtml(stale)}</span>`;
  }

  _paintFilters() {
    const node = this.element.querySelector('[data-tsq-filters]');
    // Filters describe the board on screen, not the whole pool behind it.
    const tags = tagsInFeed({ items: this._board() });
    node.replaceChildren();
    if (!tags.length) return;
    for (const tag of tags) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `tsq__filter${this.filter === tag ? ' is-on' : ''}`;
      button.dataset.filter = tag;
      button.textContent = TAG_LABEL[tag] ?? tag;
      node.append(button);
    }
  }

  _paintItems() {
    const node = this.element.querySelector('[data-tsq-items]');
    const board = this._board();
    const items = this.filter
      ? board.filter((item) => item.tags.includes(this.filter))
      : board;
    if (!items.length) {
      node.innerHTML = `<p class="tsq__bare">${escapeHtml(this.feed.notice || 'Nothing on the board.')}</p>`;
      return;
    }
    node.innerHTML = items.map((item) => `
      <article class="tsq__item${item.sample ? ' is-sample' : ''}">
        <header>
          <span class="tsq__outlet">${escapeHtml(item.outlet)}</span>
          ${item.handle ? `<span class="tsq__handle">${escapeHtml(item.handle)}</span>` : ''}
          ${item.sample ? '<span class="tsq__stamp">SAMPLE</span>' : ''}
        </header>
        <h3>${escapeHtml(item.headline)}</h3>
        <p>${escapeHtml(item.summary)}</p>
        <footer>
          <span class="tsq__tags">${item.tags.map((tag) => escapeHtml(TAG_LABEL[tag] ?? tag)).join(' · ')}</span>
          ${item.url
    ? `<a class="tsq__link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Source</a>`
    : '<span class="tsq__nolink">No source link — invented item</span>'}
          <button type="button" class="tsq__btn" data-raise="${escapeHtml(item.id)}">Raise it</button>
        </footer>
      </article>`).join('');
  }

  _paintPrompts() {
    const node = this.element.querySelector('[data-tsq-prompts]');
    node.replaceChildren();
    for (const prompt of PROMPTS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tsq__prompt';
      button.dataset.prompt = prompt.id;
      button.textContent = prompt.label;
      node.append(button);
    }
  }

  /** What the square is for, shown while the thread is still one paragraph long. */
  _houseRules() {
    const minutes = this.floor.minutes.slice(-4);
    return `
      <div class="tsq__rules">
        <b>How the floor works</b>
        <p>Three turns a quarter. Raise an item off the board or press a prompt, and the
        people who actually own that topic hear it — the broker on rates, the builder on
        materials, the architect on planning. Two hearings and they stop performing and
        start reading you the file on your own run.</p>
        ${minutes.length ? `<p class="tsq__rules-minutes">Minute book: ${minutes.map((line) => escapeHtml(line)).join(' · ')}</p>` : ''}
      </div>`;
  }

  _paintThread() {
    const node = this.element.querySelector('[data-tsq-thread]');
    node.innerHTML = (this.thread.length <= 1 ? this._houseRules() : '') + this.thread.map((row) => {
      if (row.kind === 'player') {
        return `<div class="tsq__line tsq__line--me"><b>You</b><p>${escapeHtml(row.text)}</p></div>`;
      }
      return `
        <div class="tsq__line${row.briefing ? ' tsq__line--brief' : ''}">
          <b style="color:${escapeHtml(row.accent ?? '#d8a24a')}">${escapeHtml(row.name)}${row.briefing ? ' · reading you the file' : ''}</b>
          <p>${escapeHtml(row.text)}</p>
        </div>`;
    }).join('');
    node.scrollTop = node.scrollHeight;
  }
}

export { CAST };
