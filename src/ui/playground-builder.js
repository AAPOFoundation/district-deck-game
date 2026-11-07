// District Deck V3.70 L7 — the voxel playground builder overlay.
//
// Same contract as the other two minigames: `new PlaygroundBuilder(host, { onAction,
// onClose, onCue })`, lazily mounted, `show(city, state, seed, coreId)` / `close()`.
//
// The build is player expression, not a simulated quantity, so it does NOT travel through
// the sim reducer — it is saved to local storage under `designKey(seed, coreId)`. Likes
// are derived from the design (children at the gate send love or sadness); they are not
// cash and they never reach the ledger. The render layer stays strictly downstream of
// the sim (V370 spec §3.3): nothing here writes state, and nothing here can alter a replay.

import * as THREE from 'three';
import {
  CELL,
  GRID,
  LEVELS,
  MAX_PIECES,
  PIECES,
  PIECE_IDS,
  VARIANT_COUNT,
  canPlace,
  cellToLocal,
  clearDesign,
  completedSets,
  designKey,
  emptyDesign,
  footprint,
  heightAt,
  likesOf,
  parseDesign,
  pieceByKey,
  pieceOf,
  place,
  rate,
  ratingNotes,
  removeAt,
  serialiseDesign,
  specOf,
  variantIndexOf,
  vibeOf,
  visitorPlan,
} from '../core/playground-builder.js';
import {
  LEVEL_H,
  buildChildFigure,
  buildGridGuides,
  buildPadShell,
  buildPiece,
  buildPlaygroundVoxels,
  buildVibeToken,
  buildVisitorRoot,
  colourHex,
  gateLocal,
  padMetrics,
} from './playground-voxels.js';
import { skyTexture } from './minigame-textures.js';
import { trapOverlayKeys } from './minigame-entry.js';

const store = {
  get(key) {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  },
  set(key, value) {
    try { globalThis.localStorage?.setItem(key, value); return true; } catch { return false; }
  },
};

/** See the note in veggie-patch.js — keeps the wiring edit to one file. Idempotent. */
function ensureStyles() {
  const href = new URL('./playground-builder.css', import.meta.url).href;
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

/** The playground this builder belongs to. Mirrors `supermarketOnBoard`. */
export function playgroundOnBoard(city) {
  return (city?.blockCores ?? []).find((core) => core.useId === 'playground') ?? null;
}

const VIEW = GRID * CELL * 0.52;

function el(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
}

function escape(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export class PlaygroundBuilder {
  constructor(host, { onAction, onClose, onCue } = {}) {
    this.host = host;
    this.onAction = onAction;
    this.onClose = onClose;
    this.onCue = onCue;
    this.element = null;
    this.city = null;
    this.state = null;
    this.seed = '0';
    this.coreId = 'core';
    this.design = emptyDesign({});
    this.tool = 'deck';
    this.yaw = 0;
    this.colourIndex = 0;
    this.variant = 0;
    this.cursor = { x: Math.floor(GRID / 2), z: Math.floor(GRID / 2) };
    this.spin = 0;
    this.zoom = 1.7;
    this.dirty = false;
    this._raf = 0;
    this._ghost = null;
    this._built = null;
    this._visitors = [];
    this._clock = 0;
    this._lastTick = 0;
    this._shownLikes = 0;
  }

  get open() {
    return Boolean(this.element && !this.element.hidden);
  }

  show(city, state, seed = 0, coreId = 'core') {
    this.city = city;
    this.state = state;
    this.seed = String(seed ?? 0);
    this.coreId = String(coreId ?? 'core');
    const fallback = emptyDesign({ seed: this.seed, coreId: this.coreId });
    const stored = store.get(designKey(this.seed, this.coreId));
    this.design = stored ? parseDesign(stored, fallback) : fallback;
    this.dirty = false;
    if (!this.element) { ensureStyles(); this._mount(); }
    this.element.hidden = false;
    // Nothing has happened yet, so nothing may be on screen claiming it has. The overlay
    // element is reused between opens, and the r2 critic found "Bench is already there."
    // showing the moment the playground opened on a restored design.
    this._clearFlash();
    this._lastTick = 0;
    this._rebuild();
    this._paint();
    this._openOnFreeCell();
    // Without this the hint strip is blank until the first mouse move, and a player who
    // opens with the keyboard has no idea where the cursor is.
    this._refreshGhost();
    this._arm();
    this._resize();
  }

  close() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this.dirty) this._save(true);
    if (this.element) this.element.hidden = true;
    this.onClose?.();
  }

  destroy() {
    this.close();
    this.renderer?.dispose();
    this._untrap?.();
    this._untrap = null;
    this.element?.remove();
    this.element = null;
  }

  // --- mount ---------------------------------------------------------------

  _mount() {
    this.element = el(`
      <section class="pgb" role="dialog" aria-label="Playground builder">
        <header class="pgb__bar">
          <i class="pgb__mark" aria-hidden="true"></i>
          <span class="pgb__brand">Playground Builder</span>
          <span class="pgb__tag" data-pgb-where>Block centre</span>
          <span class="pgb__spacer"></span>
          <span class="pgb__chip">Rating <b data-pgb-score>0.0</b>/5</span>
          <span class="pgb__chip pgb__chip--vibe" data-pgb-vibe>Sadness</span>
          <span class="pgb__chip">Likes <b data-pgb-likes>0</b></span>
          <span class="pgb__chip">Kids <b data-pgb-kids>0</b></span>
          <span class="pgb__chip">Pieces <b data-pgb-count>0</b>/${MAX_PIECES}</span>
          <span class="pgb__chip pgb__chip--save" data-pgb-saved>Saved</span>
          <button type="button" class="pgb__x" data-pgb-close aria-label="Close">✕</button>
        </header>
        <div class="pgb__stage">
          <canvas data-pgb-canvas></canvas>
          <div class="pgb__hint" data-pgb-hint></div>
          <div class="pgb__flash" data-pgb-flash hidden></div>
          <div class="pgb__keys">
            <span><b>1–9</b> piece</span>
            <span><b>V</b> variant</span>
            <span><b>arrows</b> move</span>
            <span><b>R</b> rotate</span>
            <span><b>C</b> colour</span>
            <span><b>+/−</b> zoom</span>
            <span><b>space</b> place</span>
            <span><b>del</b> remove</span>
            <span><b>Q/E</b> spin view</span>
            <span><b>S</b> save</span>
          </div>
        </div>
        <aside class="pgb__side">
          <div class="pgb__palette" data-pgb-palette role="toolbar" aria-label="Pieces"></div>
          <div class="pgb__variants" data-pgb-variants role="toolbar" aria-label="Variant"></div>
          <div class="pgb__colours" data-pgb-colours role="toolbar" aria-label="Colour"></div>
          <p class="pgb__note" data-pgb-note></p>
          <div class="pgb__marks" data-pgb-marks></div>
          <ul class="pgb__advice" data-pgb-advice></ul>
          <div class="pgb__row">
            <button type="button" class="pgb__btn pgb__btn--go" data-pgb-save>Save the build</button>
            <button type="button" class="pgb__btn" data-pgb-rotate>Rotate</button>
            <button type="button" class="pgb__btn pgb__btn--warn" data-pgb-clear>Clear</button>
          </div>
          <p class="pgb__fine">
            Saved to this block centre, in this browser — it is here when you come back to
            <b data-pgb-where2>this core</b>. Likes are what the children send, not cash.
            It does not stand on the board yet, and it never touches the ledger.
          </p>
        </aside>
      </section>
    `);
    this.host.append(this.element);
    this._canvas = this.element.querySelector('[data-pgb-canvas]');

    this.element.querySelector('[data-pgb-close]').addEventListener('click', () => this.close());
    this.element.querySelector('[data-pgb-save]').addEventListener('click', () => this._save());
    this.element.querySelector('[data-pgb-rotate]').addEventListener('click', () => this._rotate());
    this.element.querySelector('[data-pgb-clear]').addEventListener('click', () => this._clear());
    this.element.querySelector('[data-pgb-palette]').addEventListener('click', (event) => {
      const button = event.target.closest('[data-piece]');
      if (button) this._setTool(button.dataset.piece);
    });
    this.element.querySelector('[data-pgb-colours]').addEventListener('click', (event) => {
      const button = event.target.closest('[data-colour]');
      if (button) {
        this.colourIndex = Number(button.dataset.colour);
        this._paint();
        this._refreshGhost();
      }
    });
    this.element.querySelector('[data-pgb-variants]').addEventListener('click', (event) => {
      const button = event.target.closest('[data-variant]');
      if (!button) return;
      this.variant = variantIndexOf(button.dataset.variant);
      this._paint();
      this._refreshGhost();
    });

    // Capture-phase trap: a bubble listener registered after the board's could not stop it,
    // so `v` inside this dialog cycled the board lens underneath.
    this._untrap = trapOverlayKeys(() => this.open, (event) => this._key(event));
    this._initThree();
  }

  _initThree() {
    const canvas = this._canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    // Was a solid `THREE.Color('#8fb2c9')`. Whole-frame that put 80.7 % of the plate in one
    // value bucket and 82.6 % in one hue — the sky owned the picture. A graded, clouded sky
    // costs one texture and gives the frame somewhere to go.
    this.scene.background = skyTexture('day');

    const aspect = 16 / 10;
    this.camera = new THREE.OrthographicCamera(-VIEW * aspect, VIEW * aspect, VIEW, -VIEW, 0.1, 90);
    this._poseCamera(aspect);

    const hemi = new THREE.HemisphereLight('#e8f2ff', '#6a6250', 0.85);
    const key = new THREE.DirectionalLight('#fff3d8', 1.55);
    const reach = GRID * CELL * 0.7 + 4;
    key.position.set(reach * 0.85, 22, reach * 0.7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -reach;
    key.shadow.camera.right = reach;
    key.shadow.camera.top = reach;
    key.shadow.camera.bottom = -reach;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 70;
    const fill = new THREE.DirectionalLight('#bcd8f2', 0.34);
    fill.position.set(-7, 6, -5);
    this.scene.add(hemi, key, fill);

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.world.add(buildPadShell());
    this.world.add(buildGridGuides());

    this.ghostRoot = new THREE.Group();
    this.world.add(this.ghostRoot);
    this.visitorRoot = buildVisitorRoot();
    this.world.add(this.visitorRoot);

    this.cursorRing = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.46, 18),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    this.cursorRing.rotation.x = -Math.PI / 2;
    this.world.add(this.cursorRing);

    this._ray = new THREE.Raycaster();
    this._ptr = new THREE.Vector2();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.26);

    canvas.addEventListener('pointermove', (event) => this._hover(event));
    canvas.addEventListener('pointerdown', (event) => {
      this._hover(event);
      if (event.button === 2 || event.shiftKey) this._remove();
      else this._place();
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this._zoomBy(event.deltaY > 0 ? 1 : -1);
    }, { passive: false });
  }

  _poseCamera(aspect) {
    // Frame the pad and its surround, not the sky. A fixed half-height wasted a third of a
    // wide canvas on empty background, which is what the whole-frame hue reading measured.
    const halfWide = (VIEW * 2 * 0.707);
    const halfTall = VIEW * 0.707 + 2.4;
    const v = Math.max(halfTall, halfWide / Math.max(0.3, aspect)) * 1.02 / (this.zoom || 1);
    this.camera.left = -v * aspect;
    this.camera.right = v * aspect;
    this.camera.top = v;
    this.camera.bottom = -v;
    const dist = GRID * CELL * 0.85 + 6;
    this.camera.position.set(dist, dist * 1.05, dist);
    this.camera.lookAt(0, 1.1, 0.15);
    this.camera.updateProjectionMatrix();
  }

  // --- input ---------------------------------------------------------------

  _key(event) {
    if (event.key === 'Escape') { this.close(); return; }
    const piece = pieceByKey(event.key);
    if (piece) { this._setTool(piece.id); event.preventDefault(); return; }
    const moves = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    if (moves[event.key]) {
      const [dx, dz] = moves[event.key];
      this.cursor = {
        x: Math.max(0, Math.min(GRID - 1, this.cursor.x + dx)),
        z: Math.max(0, Math.min(GRID - 1, this.cursor.z + dz)),
      };
      this._refreshGhost();
      event.preventDefault();
      return;
    }
    const lower = event.key.toLowerCase();
    if (lower === 'r') { this._rotate(); event.preventDefault(); return; }
    if (lower === 'c') { this._cycleColour(); event.preventDefault(); return; }
    if (lower === 'v') { this._cycleVariant(); event.preventDefault(); return; }
    if (lower === 'q') { this._spinView(-1); event.preventDefault(); return; }
    if (lower === 'e') { this._spinView(1); event.preventDefault(); return; }
    if (lower === 's') { this._save(); event.preventDefault(); return; }
    if (event.key === '=' || event.key === '+') { this._zoomBy(-1); event.preventDefault(); return; }
    if (event.key === '-' || event.key === '_') { this._zoomBy(1); event.preventDefault(); return; }
    if (event.key === ' ' || event.key === 'Enter') { this._place(); event.preventDefault(); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { this._remove(); event.preventDefault(); }
  }

  _hover(event) {
    const box = this._canvas.getBoundingClientRect();
    this._ptr.x = ((event.clientX - box.left) / box.width) * 2 - 1;
    this._ptr.y = -((event.clientY - box.top) / box.height) * 2 + 1;
    this._ray.setFromCamera(this._ptr, this.camera);
    const hit = new THREE.Vector3();
    if (!this._ray.ray.intersectPlane(this._plane, hit)) return;
    // Undo the view spin before turning metres back into cells.
    const local = hit.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.world.rotation.y);
    const cell = this._localToCell(local.x, local.z);
    if (cell.x === this.cursor.x && cell.z === this.cursor.z) return;
    this.cursor = cell;
    this._refreshGhost();
  }

  _localToCell(x, z) {
    const first = cellToLocal(0, 0);
    const cx = Math.round((x - first.x) / (cellToLocal(1, 0).x - first.x));
    const cz = Math.round((z - first.z) / (cellToLocal(0, 1).z - first.z));
    return {
      x: Math.max(0, Math.min(GRID - 1, cx)),
      z: Math.max(0, Math.min(GRID - 1, cz)),
    };
  }

  _setTool(id) {
    if (!PIECES[id]) return;
    this.tool = id;
    this.yaw = 0;
    this.colourIndex = 0;
    this.variant = 0;
    this._paint();
    this._refreshGhost();
  }

  _cycleVariant() {
    this.variant = (this.variant + 1) % VARIANT_COUNT;
    this._paint();
    this._refreshGhost();
  }

  _zoomBy(step) {
    this.zoom = Math.max(0.7, Math.min(2.8, this.zoom + step * 0.12));
    this._resize();
  }

  _rotate() {
    this.yaw = (this.yaw + 90) % 360;
    this._refreshGhost();
    this._paint();
  }

  _cycleColour() {
    const piece = pieceOf(this.tool);
    this.colourIndex = (this.colourIndex + 1) % piece.colours.length;
    this._paint();
    this._refreshGhost();
  }

  _spinView(step) {
    this.spin = (this.spin + step + 4) % 4;
    this.world.rotation.y = (this.spin * Math.PI) / 2;
  }

  _entry() {
    const spec = specOf(this.tool, this.variant);
    const y = spec.ground ? 0 : heightAt(this.design, this.cursor.x, this.cursor.z);
    return {
      id: this.tool,
      x: this.cursor.x,
      z: this.cursor.z,
      y: Math.min(y, LEVELS - 1),
      yaw: this.yaw,
      colour: spec.colours[this.colourIndex % spec.colours.length],
      variant: spec.variant,
    };
  }

  _place() {
    const result = place(this.design, this._entry());
    if (!result.ok) {
      this._say(result.reason, true);
      this.onCue?.('reject');
      return;
    }
    this.design = result.design;
    this.dirty = true;
    this.onCue?.('select');
    this._rebuild();
    this._paint();
    this._refreshGhost();
  }

  _remove() {
    const result = removeAt(this.design, this.cursor.x, this.cursor.z);
    if (!result.ok) {
      this._say(result.reason, true);
      return;
    }
    this.design = result.design;
    this.dirty = true;
    if (result.reason) this._say(result.reason);
    this.onCue?.('select');
    this._rebuild();
    this._paint();
    this._refreshGhost();
  }

  _clear() {
    this.design = clearDesign(this.design);
    this.dirty = true;
    this._rebuild();
    this._paint();
    this._say('Playground cleared. Start again.');
  }

  _save(quiet = false) {
    const ok = store.set(designKey(this.seed, this.coreId), serialiseDesign(this.design));
    this.dirty = !ok;
    this._paint();
    if (quiet) return;
    this.onCue?.(ok ? 'ching' : 'reject');
    this._say(ok
      ? `Saved. ${this.design.pieces.length} piece${this.design.pieces.length === 1 ? '' : 's'} waiting on ${escape(this.coreId)} next time you open it.`
      : 'Could not save — this browser is blocking local storage.', !ok);
  }

  // --- scene ---------------------------------------------------------------

  _rebuild() {
    if (this._built) this.world.remove(this._built);
    this._built = buildPlaygroundVoxels(this.design);
    this.world.add(this._built);
    this._spawnVisitors();
  }

  _refreshGhost() {
    if (!this.ghostRoot) return;
    this.ghostRoot.clear();
    const entry = this._entry();
    const check = canPlace(this.design, entry);
    const ghost = buildPiece(entry);
    const tint = new THREE.MeshBasicMaterial({
      color: check.ok ? '#9fe08a' : '#e08a7a',
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    ghost.traverse((node) => { if (node.isMesh) node.material = tint; });
    this.ghostRoot.add(ghost);

    const cells = footprint(entry.id, entry.x, entry.z, entry.yaw, entry.variant);
    const anchor = cellToLocal(cells[0]?.[0] ?? entry.x, cells[0]?.[1] ?? entry.z);
    this.cursorRing.position.set(anchor.x, 0.28 + entry.y * LEVEL_H, anchor.z);
    this.cursorRing.material.color.set(check.ok ? '#ffffff' : '#e08a7a');

    const hint = this.element?.querySelector('[data-pgb-hint]');
    if (hint) {
      const spec = specOf(entry.id, entry.variant);
      hint.textContent = check.ok
        ? `${spec.label} · ${spec.variantLabel} · cell ${entry.x + 1},${entry.z + 1} · level ${entry.y + 1}`
        : check.reason;
      hint.classList.toggle('is-bad', !check.ok);
    }
  }

  /** Hide any cue left over from the last time this overlay was open. */
  _clearFlash() {
    window.clearTimeout(this._flashTimer);
    this._flashTimer = 0;
    const node = this.element?.querySelector('[data-pgb-flash]');
    if (node) { node.hidden = true; node.textContent = ''; }
  }

  /**
   * Park the opening cursor somewhere the current tool would actually go.
   *
   * The cursor opened at cell 3,3 unconditionally, so on a restored design the hint strip's
   * first word to the player was a refusal for a placement they had not attempted. Scanning
   * outward from the centre for a cell that passes `canPlace` means the hint opens by naming
   * the piece and the cell, which is what it is for.
   */
  _openOnFreeCell() {
    const mid = (GRID - 1) / 2;
    const cells = [];
    for (let x = 0; x < GRID; x += 1) {
      for (let z = 0; z < GRID; z += 1) cells.push([x, z]);
    }
    cells.sort((a, b) => (
      (Math.abs(a[0] - mid) + Math.abs(a[1] - mid)) - (Math.abs(b[0] - mid) + Math.abs(b[1] - mid))
    ));
    // The cursor has to move BEFORE the probe: `_entry()` derives the stack level from
    // `this.cursor`, so spreading it and overriding x/z would test a new cell at the old
    // cell's height and answer a different question. That is this programme's signature
    // defect at instrument scale, and it is cheaper to avoid than to find.
    const prior = this.cursor;
    for (const [x, z] of cells) {
      this.cursor = { x, z };
      if (canPlace(this.design, this._entry()).ok) return;
    }
    this.cursor = prior;
  }

  _say(text, bad = false) {
    const node = this.element?.querySelector('[data-pgb-flash]');
    if (!node) return;
    node.hidden = false;
    node.textContent = text;
    node.classList.toggle('is-bad', bad);
    window.clearTimeout(this._flashTimer);
    this._flashTimer = window.setTimeout(() => { node.hidden = true; }, 2200);
  }

  _paint() {
    if (!this.element) return;
    const report = rate(this.design);
    const set = (key, value) => {
      const node = this.element.querySelector(`[data-pgb-${key}]`);
      if (node) node.textContent = value;
    };
    const vibe = vibeOf(this.design);
    const likes = likesOf(this.design);
    const kids = visitorPlan(this.design, this.seed);
    set('score', report.score.toFixed(1));
    set('count', String(this.design.pieces.length));
    set('likes', String(likes));
    set('kids', String(kids.length));
    set('where', this.coreId === 'core' ? 'Block centre' : `Block centre · ${this.coreId}`);
    set('where2', this.coreId);
    const vibeChip = this.element.querySelector('[data-pgb-vibe]');
    if (vibeChip) {
      vibeChip.textContent = vibe === 'love' ? 'Love' : vibe === 'sadness' ? 'Sadness' : 'Mixed';
      vibeChip.dataset.vibe = vibe;
    }
    // Save was silent in r1 — the toast was the only signal and it had faded by the time a
    // player looked. A standing chip says what is true right now.
    const savedChip = this.element.querySelector('[data-pgb-saved]');
    if (savedChip) {
      savedChip.textContent = this.dirty ? 'Unsaved changes' : 'Saved';
      savedChip.classList.toggle('is-dirty', this.dirty);
    }
    const toolSpec = specOf(this.tool, this.variant);
    set('note', `${toolSpec.label} · ${toolSpec.variantLabel} — ${toolSpec.variantNote}`);

    const palette = this.element.querySelector('[data-pgb-palette]');
    if (palette.children.length !== PIECE_IDS.length) {
      palette.replaceChildren();
      for (const id of PIECE_IDS) {
        const piece = PIECES[id];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pgb__piece';
        button.dataset.piece = id;
        button.innerHTML = `<b>${escape(piece.label)}</b><span>${piece.key}</span>`;
        button.title = piece.note;
        palette.append(button);
      }
    }
    palette.querySelectorAll('[data-piece]').forEach((button) => {
      button.classList.toggle('is-on', button.dataset.piece === this.tool);
    });

    const variants = this.element.querySelector('[data-pgb-variants]');
    if (variants) {
      variants.replaceChildren();
      const family = pieceOf(this.tool);
      family.variants.forEach((choice, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `pgb__variant${index === this.variant ? ' is-on' : ''}`;
        button.dataset.variant = String(index);
        button.textContent = choice.label;
        button.title = choice.note;
        variants.append(button);
      });
    }

    const colours = this.element.querySelector('[data-pgb-colours]');
    const piece = pieceOf(this.tool);
    colours.replaceChildren();
    piece.colours.forEach((colour, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `pgb__swatch${index === this.colourIndex ? ' is-on' : ''}`;
      button.dataset.colour = String(index);
      button.style.background = colourHex(colour);
      button.setAttribute('aria-label', colour);
      colours.append(button);
    });

    const marks = this.element.querySelector('[data-pgb-marks]');
    marks.innerHTML = Object.entries(report.parts).map(([key, value]) => (
      `<div class="pgb__mark-row">
        <span>${escape(key)}</span>
        <i><b style="width:${Math.round(value * 100)}%"></b></i>
      </div>`
    )).join('');

    const advice = this.element.querySelector('[data-pgb-advice]');
    const sets = completedSets(this.design);
    const extra = sets.length
      ? [`Complete sets: ${sets.map((id) => pieceOf(id).label).join(', ')}.`]
      : [];
    advice.innerHTML = [...ratingNotes(this.design), ...extra]
      .map((line) => `<li>${escape(line)}</li>`).join('');
  }

  _playTarget() {
    const play = this.design.pieces.find((entry) => specOf(entry.id, entry.variant)?.play);
    if (!play) return { x: 0, z: padMetrics().cz };
    const cells = footprint(play.id, play.x, play.z, play.yaw, play.variant);
    const local = cellToLocal(cells[0][0], cells[0][1]);
    return { x: local.x, z: local.z };
  }

  _spawnVisitors() {
    if (!this.visitorRoot) return;
    this.visitorRoot.clear();
    this._visitors = [];
    const plan = visitorPlan(this.design, this.seed);
    const gate = gateLocal();
    const target = this._playTarget();
    const vibe = vibeOf(this.design);
    plan.forEach((kid, index) => {
      const figure = buildChildFigure(kid.hue);
      const token = buildVibeToken(kid.mood);
      token.position.set(0, 0.95, 0);
      const wrap = new THREE.Group();
      wrap.add(figure, token);
      const lane = ((index % 5) - 2) * 0.38;
      wrap.position.set(gate.x + lane, gate.y, gate.z + 0.35);
      this.visitorRoot.add(wrap);
      this._visitors.push({
        ...kid,
        wrap,
        token,
        gate: { x: gate.x + lane, z: gate.z + 0.35 },
        target,
        enter: vibe !== 'sadness' || kid.mood === 'love',
      });
    });
    this._clock = 0;
    this._shownLikes = 0;
  }

  _tickVisitors(dt) {
    if (!this._visitors.length) return;
    this._clock += dt;
    const likes = likesOf(this.design);
    const shown = Math.min(likes, Math.floor(this._clock * 6));
    if (shown !== this._shownLikes) {
      this._shownLikes = shown;
      const node = this.element?.querySelector('[data-pgb-likes]');
      if (node) node.textContent = String(shown);
    }
    for (const kid of this._visitors) {
      const local = Math.max(0, this._clock - kid.delay);
      const bob = Math.sin(this._clock * 3.4 + kid.hue) * 0.03;
      kid.token.position.y = 0.95 + bob + (kid.mood === 'love' ? Math.sin(this._clock * 2.1 + kid.hue) * 0.08 : 0);
      kid.token.rotation.y = this._clock * 1.4;
      if (!kid.enter) {
        kid.wrap.position.x = kid.gate.x + Math.sin(this._clock * 1.2 + kid.hue) * 0.12;
        kid.wrap.position.z = kid.gate.z;
        kid.wrap.rotation.y = Math.sin(this._clock * 0.8) * 0.4;
        continue;
      }
      const walk = Math.min(1, local * kid.speed * 0.35);
      const midZ = (kid.gate.z + kid.target.z) * 0.5;
      const x = kid.gate.x + (kid.target.x - kid.gate.x) * walk;
      const z = walk < 0.45
        ? kid.gate.z + (midZ - kid.gate.z) * (walk / 0.45)
        : midZ + (kid.target.z - midZ) * ((walk - 0.45) / 0.55);
      kid.wrap.position.x = x;
      kid.wrap.position.z = z;
      kid.wrap.position.y = gateLocal().y + Math.abs(Math.sin(local * 7)) * 0.04;
      kid.wrap.rotation.y = Math.atan2(kid.target.x - kid.gate.x, kid.target.z - kid.gate.z);
    }
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
    const step = (now) => {
      this._raf = requestAnimationFrame(step);
      if (!this.open) return;
      const t = now || 0;
      const dt = this._lastTick ? Math.min(0.05, (t - this._lastTick) / 1000) : 0.016;
      this._lastTick = t;
      this._tickVisitors(dt);
      this._resize();
      this.renderer.render(this.scene, this.camera);
    };
    this._raf = requestAnimationFrame(step);
  }
}

/** Read a saved build without opening the game — the block-core hook uses this. */
export function savedPlaygroundDesign(seed, coreId) {
  const fallback = emptyDesign({ seed, coreId });
  const stored = store.get(designKey(String(seed), String(coreId)));
  return stored ? parseDesign(stored, fallback) : fallback;
}
