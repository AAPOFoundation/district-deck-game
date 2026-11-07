// District Deck V3.70 L7 — the veggie patch overlay on a community-garden block centre.
//
// Same contract as `IceCreamRush`: constructed once with `{ onAction, onClose, onCue }`,
// mounted lazily into the host, `show(city, state, seed, coreId)` opens it and `close()`
// hides it. Rules live in `src/core/veggie-patch.js`; this file is presentation and
// input only, and it never mutates the run — the harvest reaches the sim through
// `onAction`, which is the same path the other two minigames use.

import * as THREE from 'three';
import { money, moneyExact } from '../core/format.js';
import {
  COMPOST_PER_PLOT,
  CROPS,
  CROP_IDS,
  DAYS_PER_SEASON,
  EQUIPMENT,
  EQUIPMENT_IDS,
  PLOTS_PER_BED,
  PLOT_COUNT,
  SEASON_LABEL,
  WATER_CAN_COST,
  WATER_LOAD,
  WATER_LOAD_COST,
  ACTION_COST,
  VISITS_PER_QUARTER,
  seedCost,
  seasonRibbon,
  advanceWeek,
  beginVisit,
  buyEquipment,
  buyWater,
  canPayFromTin,
  catchUp,
  ensureStake,
  compost,
  compostCap,
  createPatch,
  cropOf,
  daysLeft,
  harvest,
  inSeason,
  parsePatch,
  patchKey,
  payoutAction,
  plotIsRipe,
  plotValue,
  seasonForQuarter,
  sell,
  sellable,
  serialisePatch,
  sow,
  tankCap,
  water,
  weed,
} from '../core/veggie-patch.js';
import {
  BED_FRAME,
  SOIL_Y,
  buildActionFx,
  buildPlotCursor,
  buildVeggieGarden,
  buildVeggieKit,
  buildVeggiePlants,
  plotAnchor,
  setCompostVisual,
} from './veggie-voxels.js';
import { applyPlantSway, buildHeldTool, tickHeldTool, tickVeggieFx } from './veggie-pieces/fx.js';
import { applySeasonRig } from './veggie-pieces/light.js';
import { trapOverlayKeys } from './minigame-entry.js';

/**
 * Self-mounting stylesheet. The house pattern is a `<link>` in play.html, but play.html
 * belongs to another lane — doing it here keeps the wiring edit to one file. Idempotent,
 * and a no-op if the orchestrator would rather add the link to the page.
 */
function ensureStyles() {
  const href = new URL('./veggie-patch.css', import.meta.url).href;
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

/** The community garden this overlay belongs to. Mirrors `supermarketOnBoard`. */
export function communityGardenOnBoard(city) {
  return (city?.blockCores ?? []).find((core) => core.useId === 'community-garden') ?? null;
}

/** Deliberately local. Importing landing.js for three lines would drag 112 kB in. */
const store = {
  get(key) {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  },
  set(key, value) {
    try { globalThis.localStorage?.setItem(key, value); return true; } catch { return false; }
  },
};

const TOOLS = Object.freeze([
  { id: 'sow', label: 'Sow', key: '1', hint: `Grab the seed tray. $${ACTION_COST.sow} plus the seed, then a bare plot.` },
  { id: 'water', label: 'Water', key: '2', hint: `Grab the can. $${ACTION_COST.water} from the tin. Dry tank adds $${WATER_CAN_COST}.` },
  { id: 'weed', label: 'Weed', key: '3', hint: `Grab the hoe. $${ACTION_COST.weed}. Weeds steal a third of the harvest each.` },
  { id: 'compost', label: 'Compost', key: '4', hint: `Grab the scoop in the heap. $${ACTION_COST.compost}. A quarter more yield, twice per bed.` },
  { id: 'harvest', label: 'Harvest', key: '5', hint: `Grab the basket. $${ACTION_COST.harvest}. Pull ripe crops, then Sell.` },
]);

const CROP_ICON = Object.freeze(Object.fromEntries(
  CROP_IDS.map((id) => [id, new URL(`../../assets/img/veggie/crops/${id}.png`, import.meta.url).href]),
));
const HOVER_YELLOW = new THREE.Color('#e8c069');
const HOVER_EMIT = new THREE.Color('#c9a24a');
const CHROME_OP = Object.freeze({
  'shed-halo': 0.52,
  'hover-ring': 0.42,
  'shed-glow': 0.20,
  'hover-glow': 0.16,
});
const CHROME_NAMES = new Set(['shed-halo', 'shed-glow', 'hover-ring', 'hover-glow', 'hover-hit']);

function cropExpect(crop, patch) {
  const seasons = crop.season.map((id) => SEASON_LABEL[id]).join(' / ');
  const cans = `${crop.water} can${crop.water === 1 ? '' : 's'} a week`;
  return `${crop.days ?? crop.quarters * 21} days · ${cans} · ${seasons}. Seed ${moneyExact(seedCost(patch, crop))}. Harvest about ${money(crop.value)}. ${crop.note}`;
}

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

export class VeggiePatch {
  constructor(host, { onAction, onClose, onCue } = {}) {
    this.host = host;
    this.onAction = onAction;
    this.onClose = onClose;
    this.onCue = onCue;
    this.element = null;
    this.city = null;
    this.state = null;
    this.coreId = 'core';
    this.seed = '0';
    this.patch = createPatch({});
    this.tool = 'sow';
    this.seedChoice = 'silverbeet';
    this.cursor = 0;
    this.flash = '';
    this.spin = 0;
    this._untrap = null;
    this._raf = 0;
    this._plants = null;
    this._kit = null;
    this._fx = null;
    this._fxUntil = 0;
    this.locked = false;
    this._visitReason = '';
    this._hitTool = null;
    this._hitShed = false;
    this._held = null;
    this._heldAt = new THREE.Vector3();
    this._hoverRoot = null;
    this._tints = new Map();
  }

  get open() {
    return Boolean(this.element && !this.element.hidden);
  }

  /** `coreId` names the block centre, so two gardens on one board keep separate beds. */
  show(city, state, seed = 0, coreId = 'core') {
    this.city = city;
    this.state = state;
    this.seed = String(seed ?? 0);
    this.coreId = String(coreId ?? 'core');
    const quarter = Math.max(1, Number(state?.quarter) || 1);
    const fallback = createPatch({ seed: this.seed, coreId: this.coreId, quarter });
    const stored = store.get(patchKey(this.seed, this.coreId));
    // `quarter` is the run's, from `state`, and it is the trust anchor `parsePatch` clamps the
    // stored record's claimed quarter against — a record cannot buy a bigger harvest ceiling
    // by claiming to be further into the run than the run is.
    this.patch = ensureStake(
      catchUp(stored ? parsePatch(stored, fallback, { quarter }) : fallback, quarter),
    );
    const visit = beginVisit(this.patch, quarter);
    this.locked = !visit.ok;
    if (visit.ok) this.patch = visit.patch;
    this._visitReason = visit.ok ? '' : visit.reason;
    this._persist();
    if (!this.element) { ensureStyles(); this._mount(); }
    this.element.hidden = false;
    this.flash = '';
    this._rebuildPlants();
    this._rebuildKit();
    if (this.scene && this._lights) {
      applySeasonRig(this.scene, this._lights, seasonForQuarter(this.patch?.quarter ?? 1));
    }
    this._paint();
    this._arm();
    this._resize();
    if (this.locked) this._say(this._visitReason || 'Three visits this quarter.', true);
  }

  close() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this.element) this.element.hidden = true;
    this._persist();
    this.onClose?.();
  }

  destroy() {
    this.close();
    this._untrap?.();
    this._untrap = null;
    this.renderer?.dispose();
    this.element?.remove();
    this.element = null;
  }

  _persist() {
    store.set(patchKey(this.seed, this.coreId), serialisePatch(this.patch));
  }

  _mount() {
    this.element = el(`
      <section class="vgp" role="dialog" aria-label="Veggie patch">
        <header class="vgp__bar">
          <i class="vgp__leaf" aria-hidden="true"></i>
          <span class="vgp__brand">Veggie Patch</span>
          <span class="vgp__spacer"></span>
          <div class="vgp__seasons" data-vgp-seasons aria-label="Seasons"></div>
          <span class="vgp__chip">Day <b data-vgp-day>1</b></span>
          <span class="vgp__chip">Tank <b data-vgp-tank>0</b></span>
          <span class="vgp__chip" data-vgp-compost-chip>Compost <b data-vgp-heap>0</b></span>
          <span class="vgp__chip" data-vgp-play-chip>Play <b data-vgp-visit>1</b></span>
          <span class="vgp__chip vgp__chip--tin">Tin <b data-vgp-tin>$0</b></span>
          <button type="button" class="vgp__x" data-vgp-close aria-label="Close">✕</button>
        </header>
        <div class="vgp__stage">
          <div class="vgp__yard">
            <canvas data-vgp-canvas></canvas>
            <div class="vgp__pins" data-vgp-pins></div>
            <div class="vgp__eqtip" data-vgp-eqtip hidden></div>
            <aside class="vgp__side">
              <div class="vgp__seeds" data-vgp-seeds hidden></div>
              <div class="vgp__row">
                <button type="button" class="vgp__btn vgp__btn--week" data-vgp-week>Week</button>
                <button type="button" class="vgp__btn vgp__btn--sell" data-vgp-sell>Sell</button>
              </div>
            </aside>
            <aside class="vgp__shop" data-vgp-shop hidden>
              <header class="vgp__shop-bar">
                <strong>Shed</strong>
                <button type="button" class="vgp__x" data-vgp-shop-close aria-label="Close shed">✕</button>
              </header>
              <p class="vgp__shop-lede">Specialist kit. Bought here, installed on the garden.</p>
              <div class="vgp__shop-list" data-vgp-shop-list></div>
            </aside>
          </div>
        </div>
        <div class="vgp__flash" data-vgp-flash hidden></div>
      </section>
    `);
    this.host.append(this.element);

    this.element.querySelector('[data-vgp-close]').addEventListener('click', () => this.close());
    this.element.querySelector('[data-vgp-sell]').addEventListener('click', () => this._sell());
    this.element.querySelector('[data-vgp-week]').addEventListener('click', () => this._week());
    this.element.querySelector('[data-vgp-shop-close]').addEventListener('click', () => this._closeShop());
    this.element.querySelector('[data-vgp-shop-list]').addEventListener('click', (event) => {
      if (event.target.closest('[data-water-buy]')) { this._buyWater(); return; }
      const button = event.target.closest('[data-kit]');
      if (button) this._buy(button.dataset.kit);
    });
    this.element.addEventListener('pointerover', (event) => this._tipFrom(event.target));
    this.element.addEventListener('pointerout', (event) => {
      const next = event.relatedTarget;
      if (next && this.element.contains(next) && next.closest('[data-tip]')) return;
      if (next && this.element.contains(next) && next.closest('[data-vgp-canvas]')) return;
      this._hideTip();
    });
    this.element.querySelector('[data-vgp-seeds]').addEventListener('click', (event) => {
      const button = event.target.closest('[data-seed]');
      if (button) {
        this.seedChoice = button.dataset.seed;
        this._paint();
      }
    });
    this.element.querySelector('[data-vgp-pins]').addEventListener('click', (event) => {
      const plot = event.target.closest('[data-plot]');
      if (plot) this._apply(Number(plot.dataset.plot));
    });

    // Capture-phase trap. Without it `v` inside this dialog cycled the board lens behind it,
    // which is a modal driving the application it is covering.
    this._untrap = trapOverlayKeys(() => this.open, (event) => this._key(event));
    this._initThree();
  }

  _key(event) {
    if (event.key === 'Escape') {
      const shop = this.element?.querySelector('[data-vgp-shop]');
      if (shop && !shop.hidden) { this._closeShop(); return; }
      this.close();
      return;
    }
    const tool = TOOLS.find((row) => row.key === event.key);
    if (tool) { this._setTool(tool.id); event.preventDefault(); return; }
    const moves = {
      ArrowLeft: -1, ArrowRight: 1, ArrowUp: -PLOTS_PER_BED, ArrowDown: PLOTS_PER_BED,
    };
    if (moves[event.key] != null) {
      this.cursor = (this.cursor + moves[event.key] + PLOT_COUNT) % PLOT_COUNT;
      this._paint();
      event.preventDefault();
      return;
    }
    const lower = String(event.key).toLowerCase();
    if (lower === 'q') { this._spinView(-1); event.preventDefault(); return; }
    if (lower === 'e') { this._spinView(1); event.preventDefault(); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      this._apply(this.cursor);
      event.preventDefault();
    }
  }

  // --- the garden ------------------------------------------------------------

  _initThree() {
    const canvas = this.element.querySelector('[data-vgp-canvas]');
    this._canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    // Hedge shade, not sky. The camera frames the beds; if a sliver of background
    // still shows it should read as the fence line, not weather.
    this.scene.background = new THREE.Color('#4a5538');

    const aspect = 16 / 9;
    this.viewSize = Math.max(BED_FRAME.w, BED_FRAME.d) * 0.42;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80);
    this._poseCamera(aspect);

    const hemi = new THREE.HemisphereLight('#e6f0ff', '#6a6250', 0.78);
    const key = new THREE.DirectionalLight('#fff2d6', 1.5);
    key.position.set(12, 16, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -16;
    key.shadow.camera.right = 16;
    key.shadow.camera.top = 16;
    key.shadow.camera.bottom = -16;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 40;
    const fill = new THREE.DirectionalLight('#c2d8ee', 0.30);
    fill.position.set(-6, 5, -6);
    this.scene.add(hemi, key, fill);
    this._lights = { hemi, key, fill };
    applySeasonRig(this.scene, this._lights, seasonForQuarter(this.patch?.quarter ?? 1));

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.fixtures = buildVeggieGarden(this.patch, { fixtures: true });
    // The plants come off the fixtures group and are replaced on their own, so a click does
    // not rebuild the shed.
    this._plants = this.fixtures.getObjectByName('veggie-plants');
    this._kit = buildVeggieKit(this.patch);
    this.world.add(this.fixtures);
    this.world.add(this._kit);
    this._prepSelectables();

    this.cursorMark = buildPlotCursor();
    this.world.add(this.cursorMark);
    this._setTool(this.tool);

    this._ray = new THREE.Raycaster();
    this._ptr = new THREE.Vector2();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SOIL_Y);

    canvas.addEventListener('pointermove', (event) => this._hover(event));
    canvas.addEventListener('pointerleave', () => {
      this._hideTip();
      this._hoverRoot = null;
      if (this._held) this._held.visible = false;
    });
    canvas.addEventListener('pointerdown', (event) => {
      this._hover(event);
      if (this._hitShed) { this._openShop(); return; }
      if (this._hitTool) { this._setTool(this._hitTool); return; }
      this._apply(this.cursor);
    });
  }

  _poseCamera(aspect) {
    // Frame the four beds and their paths, not the paddock and sky. Vegetables have to
    // fill the plate; the orchard fence is scenery, not the subject.
    const halfW = BED_FRAME.w / 2;
    const halfD = BED_FRAME.d / 2;
    // Enough frustum to hold all sixteen plots; not enough to let the sky in.
    const v = Math.max(halfD * 0.98, (halfW + 0.35) / Math.max(0.35, aspect));
    this.viewSize = v;
    this.camera.left = -v * aspect;
    this.camera.right = v * aspect;
    this.camera.top = v;
    this.camera.bottom = -v;
    this.camera.position.set(6.2, 10.5, 6.8);
    this.camera.lookAt(0, 0.32, 0.12);
    this.camera.updateProjectionMatrix();
  }

  _spinView(step) {
    this.spin = (this.spin + step + 4) % 4;
    this.world.rotation.y = (this.spin * Math.PI) / 2;
  }

  _kitIdFrom(object) {
    return this._userData(object, 'equipment');
  }

  _userData(object, key) {
    let node = object;
    while (node) {
      if (node.userData?.[key] != null && node.userData[key] !== false) return node.userData[key];
      node = node.parent;
    }
    return null;
  }

  _pickRoot(object) {
    let found = null;
    let node = object;
    while (node && node !== this.world) {
      if (node.name === 'held-tool' || node.name === 'veggie-fx' || node.name === 'veggie-cursor') {
        return null;
      }
      if (node.userData?.shed || node.userData?.tool || node.userData?.equipment) found = node;
      node = node.parent;
    }
    return found;
  }

  _prepSelectables() {
    const visit = (node) => {
      if (!node) return;
      if (node.userData?.shed || node.userData?.tool || node.userData?.equipment) {
        this._ensureHover(node);
        return;
      }
      for (const child of node.children) visit(child);
    };
    visit(this.fixtures);
    visit(this._kit);
  }

  _ensureHover(root) {
    if (!root || root.userData.hoverReady) return;
    root.userData.hoverReady = true;
    if (root.getObjectByName('hover-ring') || root.getObjectByName('shed-halo')) return;
    root.updateWorldMatrix(true, true);
    const box = new THREE.Box3();
    root.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.geometry || CHROME_NAMES.has(mesh.name)) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const part = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
      box.union(part);
    });
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    root.worldToLocal(center);
    const radius = Math.max(0.18, Math.max(size.x, size.z) * 0.5 + 0.10);
    const y = center.y - size.y * 0.5 + 0.03;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.70, radius, 40),
      new THREE.MeshBasicMaterial({
        color: '#e8c069',
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.name = 'hover-ring';
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(center.x, y, center.z);
    ring.raycast = () => {};
    root.add(ring);
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.68, 28),
      new THREE.MeshBasicMaterial({
        color: '#f0dfa8',
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    glow.name = 'hover-glow';
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(center.x, y - 0.012, center.z);
    glow.raycast = () => {};
    root.add(glow);
    const hitH = Math.max(0.28, size.y + 0.10);
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.28, size.x + 0.12), hitH, Math.max(0.28, size.z + 0.12)),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.name = 'hover-hit';
    hit.position.set(center.x, center.y, center.z);
    root.add(hit);
  }

  _clearTints() {
    for (const root of this._tints.keys()) this._setTint(root, 0);
    this._tints.clear();
    this._hoverRoot = null;
  }

  _setTint(root, amount) {
    if (!root) return;
    const t = Math.max(0, Math.min(1, amount));
    root.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const cap = CHROME_OP[mesh.name];
      if (cap != null) {
        if (mesh.material) mesh.material.opacity = t * cap;
        mesh.scale.setScalar(0.94 + t * 0.06);
        return;
      }
      if (CHROME_NAMES.has(mesh.name)) return;
      const strength = mesh.name === 'shed-mass' ? 0.55 : 1;
      if (t <= 0.01) {
        if (mesh.userData.tintMat) {
          mesh.material = mesh.userData.baseMat;
          mesh.userData.tintMat = null;
        }
        return;
      }
      if (!mesh.userData.tintMat && mesh.material) {
        mesh.userData.baseMat = mesh.material;
        const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const cloned = src.map((mat) => {
          const copy = mat.clone();
          copy.userData.tintBase = mat.color ? mat.color.clone() : HOVER_YELLOW.clone();
          if (copy.emissive) copy.emissive.copy(HOVER_EMIT);
          return copy;
        });
        mesh.userData.tintMat = Array.isArray(mesh.material) ? cloned : cloned[0];
        mesh.material = mesh.userData.tintMat;
      }
      const tinted = Array.isArray(mesh.userData.tintMat) ? mesh.userData.tintMat : [mesh.userData.tintMat];
      for (const mat of tinted) {
        if (!mat) continue;
        if (mat.color && mat.userData.tintBase) {
          mat.color.copy(mat.userData.tintBase).lerp(HOVER_YELLOW, t * 0.16 * strength);
        }
        if (mat.emissive) mat.emissiveIntensity = t * 0.22 * strength;
      }
    });
  }

  _tickHoverTint() {
    const want = this._hoverRoot;
    if (want && !this._tints.has(want)) this._tints.set(want, 0);
    for (const [root, amt] of [...this._tints.entries()]) {
      const goal = root === want ? 1 : 0;
      const next = amt + (goal - amt) * (goal > amt ? 0.34 : 0.20);
      if (goal === 0 && next < 0.012) {
        this._setTint(root, 0);
        this._tints.delete(root);
        continue;
      }
      const clamped = goal === 1 && next > 0.985 ? 1 : next;
      this._tints.set(root, clamped);
      this._setTint(root, clamped);
    }
  }

  _openShop() {
    const shop = this.element?.querySelector('[data-vgp-shop]');
    if (!shop) return;
    shop.hidden = false;
    this._paintShop();
  }

  _closeShop() {
    const shop = this.element?.querySelector('[data-vgp-shop]');
    if (shop) shop.hidden = true;
  }

  _showTip(title, body, clientX, clientY) {
    const tip = this.element?.querySelector('[data-vgp-eqtip]');
    const yard = this.element?.querySelector('.vgp__yard');
    if (!tip || !yard || !title) return;
    const box = yard.getBoundingClientRect();
    tip.hidden = false;
    tip.innerHTML = `<b>${escape(title)}</b>${body ? `<span>${escape(body)}</span>` : ''}`;
    const width = 260;
    let x = clientX - box.left - width - 8;
    if (x < 12) x = Math.min(box.width - width - 12, clientX - box.left + 14);
    const y = Math.max(12, Math.min(box.height - 130, clientY - box.top));
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  _hideTip() {
    const tip = this.element?.querySelector('[data-vgp-eqtip]');
    if (tip) tip.hidden = true;
  }

  _tipFrom(node) {
    const host = node?.closest?.('[data-tip]');
    if (!host) return;
    const box = host.getBoundingClientRect();
    this._showTip(host.dataset.tip, host.dataset.tipBody || '', box.left - 16, box.top);
  }

  _plotExpect(index) {
    const plot = this.patch.plots[index];
    const crop = cropOf(plot.crop);
    if (!crop) return plot.enriched
      ? { title: 'Bare · rich', body: 'The last beans left this plot. The next crop here pays 15% more.' }
      : { title: 'Bare', body: 'Sow a seed here.' };
    const left = daysLeft(plot);
    const bits = [];
    if (plotIsRipe(plot)) bits.push(`Ripe, about ${moneyExact(plotValue(plot))}.`);
    else bits.push(`${left} day${left === 1 ? '' : 's'} left.`);
    if (plot.thirst > 0) bits.push('Thirsty — water or it will die.');
    if (plot.weeds) bits.push(`${plot.weeds} weed${plot.weeds === 1 ? '' : 's'}.`);
    bits.push(cropExpect(crop, this.patch));
    return { title: crop.label, body: bits.join(' ') };
  }

  _hover(event) {
    const box = this._canvas.getBoundingClientRect();
    this._ptr.x = ((event.clientX - box.left) / box.width) * 2 - 1;
    this._ptr.y = -((event.clientY - box.top) / box.height) * 2 + 1;
    this._ray.setFromCamera(this._ptr, this.camera);
    this._placeHeld();
    this._hitTool = null;
    this._hitShed = false;
    this._hoverRoot = null;
    const hits = [];
    if (this.fixtures) this._ray.intersectObject(this.fixtures, true, hits);
    if (this._kit) this._ray.intersectObject(this._kit, true, hits);
    hits.sort((a, b) => a.distance - b.distance);
    let hitObj = null;
    let root = null;
    for (const hit of hits) {
      const candidate = this._pickRoot(hit.object);
      if (candidate && !candidate.visible) continue;
      hitObj = hit.object;
      root = candidate;
      break;
    }
    if (root) this._hoverRoot = root;
    if (hitObj && this._userData(hitObj, 'shed')) {
      this._hitShed = true;
      this._showTip('Shed', 'Open for sprinklers, trays, and other kit you can install.', event.clientX, event.clientY);
      return;
    }
    const tool = hitObj ? this._userData(hitObj, 'tool') : null;
    if (tool) {
      this._hitTool = tool;
      const row = TOOLS.find((item) => item.id === tool);
      this._showTip(row?.label ?? tool, row?.hint ?? 'Grab this to use it.', event.clientX, event.clientY);
      return;
    }
    const kitId = hitObj ? this._kitIdFrom(hitObj) : null;
    const item = kitId ? EQUIPMENT[kitId] : null;
    if (item) {
      this._showTip(item.label, item.note, event.clientX, event.clientY);
      return;
    }
    const hit = new THREE.Vector3();
    if (!this._ray.ray.intersectPlane(this._plane, hit)) return;
    const local = hit.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.world.rotation.y);
    let best = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < PLOT_COUNT; i += 1) {
      const a = plotAnchor(i);
      const d = Math.hypot(a.x - local.x, a.z - local.z);
      if (d < bestDistance) { bestDistance = d; best = i; }
    }
    if (best < 0 || bestDistance > 1.1) {
      this._hideTip();
      return;
    }
    const expect = this._plotExpect(best);
    this._showTip(expect.title, expect.body, event.clientX, event.clientY);
    if (best === this.cursor) return;
    this.cursor = best;
    this._paint();
  }

  _placeHeld() {
    if (!this._held || !this.camera || !this.world) return;
    const hit = new THREE.Vector3();
    if (!this._ray.ray.intersectPlane(this._plane, hit)) {
      this._held.visible = false;
      return;
    }
    this._held.visible = true;
    this.world.worldToLocal(hit);
    this._held.position.set(hit.x + 0.16, hit.y + 0.40, hit.z + 0.10);
  }

  _rebuildHeap() {
    if (this.fixtures) setCompostVisual(this.fixtures, this.patch.compost);
  }

  _rebuildPlants() {
    if (!this.fixtures) return;
    if (this._plants) this.fixtures.remove(this._plants);
    this._plants = buildVeggiePlants(this.patch);
    this.fixtures.add(this._plants);
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
      const now = performance.now();
      if (this._fx && now > this._fxUntil) {
        this.world.remove(this._fx);
        this._fx = null;
      }
      if (this._fx) tickVeggieFx(this._fx, now);
      tickHeldTool(this._held, now);
      this._tickHoverTint();
      applyPlantSway(this._plants, now);
      this.renderer.render(this.scene, this.camera);
      this._placePins();
    };
    this._raf = requestAnimationFrame(step);
  }

  _setTool(tool) {
    this.tool = tool;
    if (this._held) this.world?.remove(this._held);
    this._held = buildHeldTool(tool);
    this.world?.add(this._held);
    this.world?.traverse((node) => {
      if (node.name?.startsWith('hand-') && node.userData?.tool) {
        node.visible = node.userData.tool !== tool;
      }
    });
    if (this._hoverRoot && !this._hoverRoot.visible) this._hoverRoot = null;
    this.element?.querySelector('.vgp__yard')?.classList.add('is-held');
    this._paint();
  }

  _apply(index) {
    this.cursor = index;
    const before = this.patch;
    const paidCan = this.tool === 'water' && before.tank < 1;
    // Every other refusal in this game states its reason. At zero hours r1 selected the plot
    // and said nothing at all, which reads as a broken button rather than a spent quarter.
    if (this.locked) {
      this._say(this._visitReason || 'Three visits this quarter.', true);
      this.onCue?.('reject');
      this._paint();
      return;
    }
    let result;
    if (this.tool === 'water') result = water(before, index);
    else if (this.tool === 'weed') result = weed(before, index);
    else if (this.tool === 'compost') result = compost(before, index);
    else if (this.tool === 'harvest') result = harvest(before, index);
    else result = sow(before, index, this.seedChoice);

    this.patch = result.patch;
    if (!result.ok) {
      this._say(result.reason, true);
      this.onCue?.('reject');
    } else {
      this.onCue?.(this.tool === 'harvest' ? 'ching' : 'select');
      if (result.reason === 'out-of-season') {
        this._say(`${cropOf(this.seedChoice).label} is out of season`, true);
      } else if (paidCan) {
        this._say(`${moneyExact(WATER_CAN_COST)} from the tin`);
      }
      this._persist();
    }
    this._rebuildPlants();
    if (result.ok) {
      this._flashAction(this.tool, index);
      if (this.tool === 'compost' || this.tool === 'weed' || this.tool === 'harvest') {
        this._rebuildHeap();
      }
    }
    this._paint();
  }

  _week() {
    if (this.locked) {
      this._say(this._visitReason || 'Three visits this quarter.', true);
      return;
    }
    const result = advanceWeek(this.patch);
    this.patch = result.patch;
    if (!result.ok) {
      this._say(result.reason, true);
      this.onCue?.('reject');
    } else {
      this.onCue?.('select');
      this._persist();
      if (this.patch.rained) this._say('Rain. Tank is full.');
    }
    this._rebuildPlants();
    this._rebuildHeap();
    this._paint();
  }

  _buy(kitId) {
    const result = buyEquipment(this.patch, kitId);
    this.patch = result.patch;
    if (!result.ok) {
      this._say(result.reason, true);
      this.onCue?.('reject');
    } else {
      this.onCue?.('ching');
      this._persist();
      this._rebuildKit();
    }
    this._paint();
  }

  _buyWater() {
    const result = buyWater(this.patch);
    this.patch = result.patch;
    if (!result.ok) {
      this._say(result.reason, true);
      this.onCue?.('reject');
    } else {
      this.onCue?.('ching');
      this._persist();
    }
    this._paint();
  }

  _flashAction(tool, index) {
    if (!this.world) return;
    if (this._fx) this.world.remove(this._fx);
    const a = plotAnchor(index);
    this._fx = buildActionFx(tool, a.x, a.y + 0.15, a.z);
    this.world.add(this._fx);
    this._fxUntil = performance.now() + 900;
    if (this._held) this._held.userData.useUntil = performance.now() + 380;
  }

  _rebuildKit() {
    if (!this.world) return;
    this._clearTints();
    if (this._kit) this.world.remove(this._kit);
    this._kit = buildVeggieKit(this.patch);
    this.world.add(this._kit);
    this._prepSelectables();
  }

  _sell() {
    // Announce AFTER the host can take it, not before. `main.js` drops an action silently
    // when the run is over (`phase !== 'play'`), and r1 destroyed the produce and printed
    // "$X to the ledger" regardless — money the ledger never saw, crop the garden no longer
    // has. The phase is the branch a player can actually reach, so it is checked here.
    const phase = this.state?.phase;
    if (this.onAction && phase && phase !== 'play') {
      this._say('The run is over.', true);
      this.onCue?.('reject');
      return;
    }
    const result = sell(this.patch);
    if (!result.ok) {
      this._say(result.reason, true);
      this.onCue?.('reject');
      this._paint();
      return;
    }
    this.patch = result.patch;
    this._persist();
    this.onAction?.(payoutAction(result.amount, this.coreId));
    this.onCue?.('ching');
    this._say(`${moneyExact(result.amount)} sold`);
    this._paint();
  }

  _say(text, bad = false) {
    const node = this.element?.querySelector('[data-vgp-flash]');
    if (!node) return;
    node.hidden = false;
    node.classList.toggle('is-bad', bad);
    node.textContent = text;
    node.classList.remove('is-go');
    void node.offsetWidth;
    node.classList.add('is-go');
    window.clearTimeout(this._flashTimer);
    this._flashTimer = window.setTimeout(() => { node.hidden = true; }, 2400);
  }

  _paint() {
    if (!this.element) return;
    const patch = this.patch;
    const set = (key, value) => {
      const node = this.element.querySelector(`[data-vgp-${key}]`);
      if (node) node.textContent = value;
    };
    this._paintSeasons();
    set('day', `${patch.day ?? 1}/${DAYS_PER_SEASON}`);
    set('tank', `${patch.tank}/${tankCap(patch)}`);
    set('heap', `${patch.compost}/${compostCap(patch)}`);
    set('visit', `${patch.visits ?? 1}/${VISITS_PER_QUARTER}`);
    set('tin', moneyExact(patch.tin));
    const compostChip = this.element.querySelector('[data-vgp-compost-chip]');
    if (compostChip) {
      compostChip.dataset.tip = 'Compost';
      compostChip.dataset.tipBody = 'Barrows in the crate on the left. Grab the scoop in the heap, then a bed.';
    }
    const playChip = this.element.querySelector('[data-vgp-play-chip]');
    if (playChip) {
      playChip.dataset.tip = 'Play';
      playChip.dataset.tipBody = `You can open this garden ${VISITS_PER_QUARTER} times each city quarter. This is visit ${patch.visits ?? 1}.`;
    }
    this._paintPins();
    this._paintSeeds();
    this._paintShop();
    const tankChip = this.element.querySelector('.vgp__chip [data-vgp-tank]')?.closest('.vgp__chip');
    if (tankChip) {
      tankChip.dataset.tip = 'Tank';
      tankChip.dataset.tipBody = patch.tank < 1
        ? `Empty. Water still works — $${WATER_CAN_COST} a can from the tin. Or buy ${WATER_LOAD} litres for $${WATER_LOAD_COST}.`
        : `Rain fills this. A dry tank kills a crop in two weeks. Buy ${WATER_LOAD} litres for $${WATER_LOAD_COST} under Water.`;
    }
    const weekBtn = this.element.querySelector('[data-vgp-week]');
    if (weekBtn) {
      weekBtn.disabled = (patch.day ?? 1) >= DAYS_PER_SEASON;
      weekBtn.textContent = (patch.day ?? 1) >= DAYS_PER_SEASON ? 'Done' : 'Week';
      weekBtn.dataset.tip = 'Week';
      weekBtn.dataset.tipBody = 'Seven days. Watered crops grow. Dry ones get thirstier. Rain tops the tank.';
    }
    const sellBtn = this.element.querySelector('[data-vgp-sell]');
    const amount = sellable(patch);
    sellBtn.disabled = amount <= 0;
    sellBtn.textContent = amount > 0 ? `Sell ${moneyExact(amount)}` : 'Sell';
    sellBtn.dataset.tip = 'Sell';
    sellBtn.dataset.tipBody = amount > 0
      ? `${moneyExact(amount)} to the city ledger. Seed money stays in the tin.`
      : 'Banks what you harvested. Nothing to sell yet.';
  }

  _paintPins() {
    const root = this.element.querySelector('[data-vgp-pins]');
    const season = seasonForQuarter(this.patch.quarter);
    if (root.children.length !== PLOT_COUNT) {
      root.replaceChildren();
      for (let index = 0; index < PLOT_COUNT; index += 1) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'vgp__pin';
        button.dataset.plot = String(index);
        button.innerHTML = '<span class="vgp__pin-name"></span>';
        root.append(button);
      }
    }
    root.querySelectorAll('[data-plot]').forEach((button) => {
      const index = Number(button.dataset.plot);
      const plot = this.patch.plots[index];
      const crop = cropOf(plot.crop);
      const ripe = plotIsRipe(plot);
      button.classList.toggle('is-cursor', index === this.cursor);
      button.classList.toggle('is-empty', !crop);
      button.classList.toggle('is-ripe', ripe);
      button.classList.toggle('is-thirsty', Boolean(crop) && plot.thirst > 0);
      button.classList.toggle('is-weedy', plot.weeds > 0);
      button.classList.toggle('is-sulking', Boolean(crop) && !inSeason(plot.crop, season));
      const name = button.querySelector('.vgp__pin-name');
      const cursorHere = index === this.cursor;
      const thirsty = Boolean(crop) && plot.thirst > 0;
      const weedy = plot.weeds > 0;
      const flag = thirsty ? '◷' : weedy ? '✻' : '';
      name.textContent = cursorHere && crop
        ? crop.label
        : cursorHere && plot.enriched
          ? 'Rich'
          : flag;
      button.classList.toggle('is-quiet', !name.textContent);
      const expect = this._plotExpect(index);
      button.dataset.tip = expect.title;
      button.dataset.tipBody = expect.body;
      button.setAttribute('aria-label', expect.body ? `${expect.title}. ${expect.body}` : expect.title);
    });
    this._placePins();
  }

  /** Project each plot's garden-local anchor to the canvas and park its pin there. */
  _placePins() {
    if (!this.camera || !this._canvas) return;
    const root = this.element?.querySelector('[data-vgp-pins]');
    if (!root) return;
    const spin = this.world?.rotation.y ?? 0;
    const vector = new THREE.Vector3();
    root.querySelectorAll('[data-plot]').forEach((button) => {
      const a = plotAnchor(Number(button.dataset.plot));
      vector.set(a.x, a.y + 0.12, a.z);
      vector.applyAxisAngle(new THREE.Vector3(0, 1, 0), spin);
      vector.project(this.camera);
      button.style.left = `${((vector.x + 1) / 2) * 100}%`;
      button.style.top = `${((1 - vector.y) / 2) * 100}%`;
    });
  }

  _paintSeasons() {
    const root = this.element.querySelector('[data-vgp-seasons]');
    if (!root) return;
    const now = seasonRibbon(this.patch.quarter).find((slot) => slot.current);
    root.replaceChildren();
    if (!now) return;
    const chip = document.createElement('span');
    chip.className = 'vgp__season is-now';
    chip.textContent = now.full;
    chip.setAttribute('aria-current', 'true');
    root.append(chip);
  }

  _paintSeeds() {
    const root = this.element.querySelector('[data-vgp-seeds]');
    root.hidden = this.tool !== 'sow';
    if (root.hidden) return;
    const season = seasonForQuarter(this.patch.quarter);
    root.replaceChildren();
    for (const id of CROP_IDS) {
      const crop = CROPS[id];
      const fit = crop.season.includes(season);
      const cost = seedCost(this.patch, crop);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `vgp__seed${id === this.seedChoice ? ' is-on' : ''}${fit ? ' is-fit' : ''}`;
      button.dataset.seed = id;
      button.disabled = !canPayFromTin(this.patch, cost + ACTION_COST.sow);
      const icon = CROP_ICON[id];
      button.innerHTML = `${icon ? `<img src="${icon}" alt="" width="40" height="40">` : ''}<span class="vgp__seed-copy"><b>${escape(crop.label)}</b><span>${moneyExact(cost)}</span></span>`;
      button.dataset.tip = crop.label;
      button.dataset.tipBody = cropExpect(crop, this.patch);
      root.append(button);
    }
  }

  _paintShop() {
    const root = this.element.querySelector('[data-vgp-shop-list]');
    if (!root || this.element.querySelector('[data-vgp-shop]')?.hidden) return;
    const room = tankCap(this.patch) - this.patch.tank;
    const litres = Math.min(WATER_LOAD, Math.max(0, room));
    const waterCost = litres ? Math.round(WATER_LOAD_COST * (litres / WATER_LOAD)) : 0;
    const rows = EQUIPMENT_IDS.map((id) => {
      const item = EQUIPMENT[id];
      const owned = Boolean(this.patch.kit?.[id]);
      return `<button type="button" class="vgp__shop-item${owned ? ' is-owned' : ''}" data-kit="${id}" ${owned ? 'disabled' : ''} data-tip="${escape(item.label)}" data-tip-body="${escape(item.note)}">
        <b>${escape(item.label)}</b>
        <span>${owned ? 'Installed' : moneyExact(item.cost)}</span>
      </button>`;
    });
    if (litres > 0) {
      rows.push(`<button type="button" class="vgp__shop-item" data-water-buy data-tip="Mains water" data-tip-body="${escape(`Fills ${litres} litres. Rain is free; this is the tap.`)}">
        <b>Tank +${litres}</b><span>${moneyExact(waterCost)}</span>
      </button>`);
    }
    root.innerHTML = rows.join('');
  }
}

export { COMPOST_PER_PLOT };
