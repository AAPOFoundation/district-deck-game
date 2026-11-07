// Zombie Shopper TD v2 — modeled Three.js vinyl playset.
// v1 photo-plate stashed at ~/.george/district-deck/supermarket-td-v1-photo-2026-08-15/
// Lease is cash-only; one run per lease.

import * as THREE from 'three';
import { RULES } from '../core/content.js';
import { money } from '../core/format.js';
import {
  PATHS, VIEW, buildPlayset, posePlaysetCamera, setLaneFills, setTillBars,
} from './supermarket-td-playset.js';
import { makeVinylMaps } from './supermarket-td-textures.js';
import { PA_GAIT, nextFreeTrapSlot } from './supermarket-td-gait.js';
import { buildVinylHuman, tickVinylShopper, buildVinylTrap, tickTrapPop } from './supermarket-td-shoppers.js';

const SKUS = Object.freeze(['fresh', 'household', 'liquor']);
const RESTOCK = Object.freeze({ fresh: 40, household: 30, liquor: 50 });
const PAYOUT = Object.freeze({ fresh: 90, household: 70, liquor: 110 });
const TRAP_COST = Object.freeze({ magazine: 180, specials: 260 });
const UP_COST = Object.freeze({ cashier: 220, machine: 280, repair: 160 });
const CAP = 7;
const ASSET = './assets/img/supermarket-td';

export function supermarketOnBoard(city) {
  return (city?.civicUses ?? []).find((row) => row.useId === 'supermarket-strip') ?? null;
}

function along(path, t) {
  const clamped = Math.max(0, Math.min(0.999, t));
  const span = path.length - 1;
  const f = clamped * span;
  const i = Math.min(span - 1, Math.floor(f));
  const u = f - i;
  const a = path[i];
  const b = path[i + 1];
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
}

function loadMap(loader, file) {
  const map = loader.load(`${ASSET}/${file}`);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

function vinylMat(color, extras = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: extras.roughness ?? 0.38,
    metalness: extras.metalness ?? 0.05,
    emissive: extras.emissive ?? 0x000000,
    emissiveIntensity: extras.emissiveIntensity ?? 0,
    map: extras.map ?? null,
    transparent: Boolean(extras.transparent),
    alphaTest: extras.alphaTest ?? 0,
    depthWrite: extras.depthWrite ?? true,
  });
}

export class SuperMarketTd {
  constructor(host, { onAction, onClose }) {
    this.host = host;
    this.onAction = onAction;
    this.onClose = onClose;
    this.element = null;
    this.city = null;
    this.state = null;
    this.phase = 'boot';
    this.stage = 1;
    this.stock = { fresh: 8, household: 8, liquor: 6 };
    this.takings = 0;
    this.shoppers = [];
    this.cashiers = [];
    this.spawnLeft = 0;
    this.spawnAcc = 0;
    this.served = 0;
    this.overflow = 0;
    this.placeMode = null;
    this.selTill = 1;
    this._raf = 0;
    this._last = 0;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.shopperGroup = null;
    this.playset = null;
    this.loader = new THREE.TextureLoader();
  }

  get open() {
    return Boolean(this.element && !this.element.hidden);
  }

  close() {
    this._flushPayout();
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this.element) this.element.hidden = true;
    this.phase = 'boot';
    this.placeMode = null;
    this.onClose?.();
  }

  _flushPayout() {
    const amount = this.takings ?? 0;
    if (amount < 1) return;
    const stock = { ...this.stock };
    const stage = this.stage;
    this.takings = 0;
    this.onAction?.({
      type: 'supermarket-shift',
      op: 'payout',
      amount,
      stock,
      stage,
    });
  }

  destroy() {
    this.close();
    this.renderer?.dispose();
    this.element?.remove();
    this.element = null;
    window.removeEventListener('keydown', this._onKey);
  }

  show(city, state) {
    this._flushPayout();
    this.city = city;
    this.state = state;
    const shop = state.supermarket ?? {};
    this.stage = shop.stage ?? 1;
    this.stock = { ...(shop.stock ?? this.stock) };
    if (!this.element) this._mount();
    this.element.hidden = false;
    this.phase = 'boot';
    this._syncBoot();
    this._paintDock();
    this._paintHud();
    this._arm();
    this._resize();
  }

  update(city, state) {
    this.city = city;
    this.state = state;
    if (!this.open) return;
    this._syncBoot();
    this._paintDock();
    this._paintHud();
  }

  _shop() {
    return this.state?.supermarket ?? {
      leaseUntilQuarter: 0,
      playsLeft: 0,
      stage: this.stage,
      stock: this.stock,
      takings: this.takings,
    };
  }

  _leased() {
    const shop = this._shop();
    return shop.leaseUntilQuarter === this.state?.quarter && shop.playsLeft > 0;
  }

  _mount() {
    const root = document.createElement('section');
    root.className = 'zstd zstd--v2 is-boot';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Zombie Shopper supermarket v2');
    const lease = money(RULES.supermarketLease);
    root.innerHTML = `
      <button type="button" class="zstd__x" data-zstd-close aria-label="Close">✕</button>
      <div class="zstd__pin" data-zstd-clock></div>
      <div class="zstd__stage">
        <canvas data-zstd-canvas></canvas>
        <div class="zstd__hud">
          <div class="zstd__chip zstd__chip--cash"><b data-zstd-cash>$0</b></div>
          <div class="zstd__chip" data-sku="fresh"><img alt="" src="${ASSET}/want-fresh.png"><b data-zstd-fresh>0</b></div>
          <div class="zstd__chip" data-sku="household"><img alt="" src="${ASSET}/want-household.png"><b data-zstd-household>0</b></div>
          <div class="zstd__chip" data-sku="liquor"><img alt="" src="${ASSET}/want-liquor.png"><b data-zstd-liquor>0</b></div>
        </div>
        <div class="zstd__place" data-zstd-place-banner hidden></div>
        <div class="zstd__boot" data-zstd-boot>
          <div class="zstd__stamp">
            <span class="zstd__stamp-mark" data-zstd-lease-mark>${lease} · 0 actions</span>
            <button type="button" class="verb" data-zstd-lease>Lease</button>
            <button type="button" class="verb verb--primary" data-zstd-play>Open doors</button>
          </div>
        </div>
        <div class="zstd__night" data-zstd-night hidden>
          <p data-zstd-night-copy></p>
          <div class="zstd__crates">
            <button type="button" class="zstd__crate" data-zstd-buy="fresh">
              <img src="${ASSET}/want-fresh.png" alt="">
              <span>Fresh · ${money(RESTOCK.fresh)}</span>
            </button>
            <button type="button" class="zstd__crate" data-zstd-buy="household">
              <img src="${ASSET}/crates.png" alt="">
              <span>Aisle · ${money(RESTOCK.household)}</span>
            </button>
            <button type="button" class="zstd__crate" data-zstd-buy="liquor">
              <img src="${ASSET}/want-liquor.png" alt="">
              <span>Bottle · ${money(RESTOCK.liquor)}</span>
            </button>
          </div>
          <div class="zstd__row">
            <button type="button" class="verb verb--primary" data-zstd-dawn>Dawn</button>
            <button type="button" class="verb" data-zstd-bank>Bank</button>
          </div>
        </div>
        <div class="zstd__tillpop" data-zstd-tillpop hidden>
          <span data-zstd-till-name>Till</span>
          <button type="button" class="verb" data-zstd-up="cashier">Hands · ${money(UP_COST.cashier)}</button>
          <button type="button" class="verb" data-zstd-up="machine">Machine · ${money(UP_COST.machine)}</button>
          <button type="button" class="verb" data-zstd-up="repair">Tape · ${money(UP_COST.repair)}</button>
        </div>
      </div>
      <div class="zstd__dock">
        <button type="button" class="verb" data-zstd-place="magazine" title="Magazine rack at the next aisle door">
          <img src="${ASSET}/magazine-rack.png" alt="">Mag
        </button>
        <button type="button" class="verb" data-zstd-place="specials" title="Specials bin at the next aisle crossing">
          <img src="${ASSET}/specials-bin.png" alt="">Bin
        </button>
      </div>
    `;
    this.host.appendChild(root);
    this.element = root;
    this._canvas = root.querySelector('[data-zstd-canvas]');
    this._boot = root.querySelector('[data-zstd-boot]');
    this._night = root.querySelector('[data-zstd-night]');
    this._placeBanner = root.querySelector('[data-zstd-place-banner]');
    this._tillpop = root.querySelector('[data-zstd-tillpop]');
    root.querySelector('[data-zstd-close]').addEventListener('click', () => this.close());
    root.addEventListener('click', (event) => this._onClick(event));
    this._onKey = (event) => {
      if (!this.open) return;
      if (event.key === 'Escape') this.close();
    };
    window.addEventListener('keydown', this._onKey);
    this._initThree();
  }

  _initThree() {
    const canvas = this._canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1a120e');
    this.scene.fog = new THREE.Fog('#1a120e', 20, 36);

    const aspect = 16 / 10;
    this.camera = new THREE.OrthographicCamera(-VIEW * aspect, VIEW * aspect, VIEW, -VIEW, 0.1, 48);
    posePlaysetCamera(this.camera, aspect);

    const hemi = new THREE.HemisphereLight('#fff1c8', '#3a2418', 0.9);
    const key = new THREE.DirectionalLight('#fff6dd', 1.65);
    key.position.set(8, 14, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -11;
    key.shadow.camera.right = 11;
    key.shadow.camera.top = 11;
    key.shadow.camera.bottom = -11;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 32;
    const fill = new THREE.DirectionalLight('#9ad4ff', 0.32);
    fill.position.set(-7, 6, -3);
    const rim = new THREE.DirectionalLight('#ffd23a', 0.28);
    rim.position.set(0, 5, 9);
    this.scene.add(hemi, key, fill, rim);

    const built = buildPlayset(this.scene, makeVinylMaps());
    this.playset = built.root;
    this.laneFills = built.fills;
    this.tillBars = built.tillBars;

    this.shopperGroup = new THREE.Group();
    this.scene.add(this.shopperGroup);

    this.magMap = loadMap(this.loader, 'magazine-rack.png');
    this.specMap = loadMap(this.loader, 'specials-bin.png');
    this.wantMap = {
      fresh: loadMap(this.loader, 'want-fresh.png'),
      liquor: loadMap(this.loader, 'want-liquor.png'),
      household: loadMap(this.loader, 'want-household.png'),
    };

    this.cashierHandles = PATHS.map((path, i) => {
      const end = path[path.length - 1];
      const handle = buildVinylHuman({
        role: 'cashier', want: 'cashier', seed: (i + 1) * 0.19,
      });
      handle.root.position.set(end.x, PA_GAIT.floorY, end.z + 0.62);
      handle.gait.yaw = Math.PI;
      this.scene.add(handle.root);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.62, 0.045, 8, 24),
        vinylMat('#ffd23a', { emissive: '#ffd23a', emissiveIntensity: 0.4 }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(end.x, 0.22, end.z + 0.35);
      ring.visible = i === this.selTill;
      this.scene.add(ring);
      handle.root.userData.till = i;
      handle.root.userData.ring = ring;
      handle.ring = ring;
      return handle;
    });
    this.cashierMeshes = this.cashierHandles.map((row) => row.root);

    this.trapSlots = [
      { id: 'm0', kind: 'magazine', x: -3.3, z: -3.45, used: false, mesh: null, pad: null },
      { id: 'm1', kind: 'magazine', x: 0, z: -3.45, used: false, mesh: null, pad: null },
      { id: 'm2', kind: 'magazine', x: 3.3, z: -3.45, used: false, mesh: null, pad: null },
      { id: 's0', kind: 'specials', x: -1.65, z: -0.55, used: false, mesh: null, pad: null },
      { id: 's1', kind: 'specials', x: 1.65, z: -0.55, used: false, mesh: null, pad: null },
    ];
    for (const slot of this.trapSlots) {
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.38, 0.08, 16),
        vinylMat('#ffd23a', { emissive: '#8a5a10', emissiveIntensity: 0.28 }),
      );
      pad.position.set(slot.x, 0.28, slot.z);
      pad.userData.slot = slot.id;
      pad.castShadow = true;
      this.scene.add(pad);
      slot.pad = pad;
    }

    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    canvas.addEventListener('pointerdown', (event) => {
      if (this.phase !== 'day') return;
      const box = canvas.getBoundingClientRect();
      ptr.x = ((event.clientX - box.left) / box.width) * 2 - 1;
      ptr.y = -((event.clientY - box.top) / box.height) * 2 + 1;
      ray.setFromCamera(ptr, this.camera);
      const hits = ray.intersectObjects(this.scene.children, true);
      const tillHit = hits.find((row) => row.object.userData.till != null);
      if (tillHit) {
        this.selTill = tillHit.object.userData.till;
        this._tillPicked = true;
        this._syncTillRings();
        this._paintTillPop();
        return;
      }
      const hit = hits.find((row) => row.object.userData.slot);
      if (hit) this._installTrap(hit.object.userData.slot);
    });
  }

  _sprite(map, w, h) {
    const mat = vinylMat('#ffffff', {
      map,
      transparent: true,
      alphaTest: 0.22,
      roughness: 0.5,
      depthWrite: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.lookAt(this.camera.position);
    return mesh;
  }

  _syncTillRings() {
    for (const mesh of this.cashierMeshes ?? []) {
      if (mesh.userData.ring) mesh.userData.ring.visible = mesh.userData.till === this.selTill;
    }
  }

  _syncPads() {
    this.placeMode = null;
    for (const slot of this.trapSlots ?? []) {
      if (!slot.pad) continue;
      slot.pad.visible = !slot.used;
      slot.pad.material.emissive = new THREE.Color('#3a2810');
      slot.pad.material.emissiveIntensity = 0.12;
      slot.pad.scale.setScalar(1);
    }
    if (this._placeBanner) this._placeBanner.hidden = true;
    for (const btn of this.element?.querySelectorAll('[data-zstd-place]') ?? []) {
      const kind = btn.dataset.zstdPlace;
      const free = nextFreeTrapSlot(this.trapSlots, kind);
      btn.disabled = this.phase !== 'day' || !free;
      btn.classList.remove('is-on');
    }
  }

  _syncBoot() {
    if (!this._boot) return;
    const leased = this._leased();
    this._boot.hidden = this.phase !== 'boot';
    this.element?.classList.toggle('is-boot', this.phase === 'boot');
    this.element?.classList.toggle('is-night', this.phase === 'night');
    if (this._canvas) this._canvas.style.pointerEvents = this.phase === 'day' ? 'auto' : 'none';
    const play = this.element.querySelector('[data-zstd-play]');
    const lease = this.element.querySelector('[data-zstd-lease]');
    if (play) play.disabled = !leased;
    if (lease) lease.disabled = leased || (this.state?.cash ?? 0) < (RULES.supermarketLease ?? 4500);
    this.element.querySelector('[data-zstd-lease-mark]')?.classList.toggle('is-paid', leased);
    const clock = this.element.querySelector('[data-zstd-clock]');
    if (clock && this.state) clock.textContent = `Q${this.state.quarter}`;
  }

  _onClick(event) {
    const t = event.target;
    const tillEl = t.closest('[data-zstd-till]');
    if (tillEl) {
      this.selTill = Number(tillEl.dataset.zstdTill);
      this._syncTillRings();
      this._paintDock();
      return;
    }
    if (t.closest('[data-zstd-lease]')) {
      this.onAction?.({ type: 'supermarket-shift', op: 'lease' });
      return;
    }
    if (t.closest('[data-zstd-play]')) {
      if (!this._leased()) return;
      this.onAction?.({ type: 'supermarket-shift', op: 'consume-play' });
      this._startDay();
      return;
    }
    const buy = t.closest('[data-zstd-buy]');
    if (buy) {
      this._buyStock(buy.dataset.zstdBuy);
      return;
    }
    if (t.closest('[data-zstd-dawn]')) {
      this.stage += 1;
      this._startDay();
      return;
    }
    if (t.closest('[data-zstd-bank]')) {
      this._bankAndClose();
      return;
    }
    const place = t.closest('[data-zstd-place]');
    if (place) {
      this._placeNextTrap(place.dataset.zstdPlace);
      return;
    }
    const up = t.closest('[data-zstd-up]');
    if (up) this._upgrade(up.dataset.zstdUp);
  }

  _startDay() {
    this.phase = 'day';
    this.placeMode = null;
    this.element?.classList.remove('is-boot', 'is-night');
    this._boot.hidden = true;
    this._night.hidden = true;
    this.shoppers = [];
    this._tillPicked = false;
    this.shopperGroup.clear();
    this.served = 0;
    this.overflow = 0;
    this.spawnAcc = 0;
    this.spawnLeft = Math.max(1, Math.round((6 + this.stage * 3) / 2));
    this.cashiers = PATHS.map((_, i) => ({
      id: i,
      hp: this.cashiers[i]?.hp ?? 100,
      max: 100,
      cashierLv: this.cashiers[i]?.cashierLv ?? 1,
      machineLv: this.cashiers[i]?.machineLv ?? 1,
      busy: 0,
      broken: (this.cashiers[i]?.hp ?? 100) <= 0,
    }));
    this._syncPads();
    this._syncTillRings();
    this._resize();
    this._paintHud();
    this._paintTillPop();
  }

  _spawnOne() {
    const path = PATHS[this.shoppers.length % PATHS.length];
    const want = SKUS[Math.floor((this.stage + this.shoppers.length) % SKUS.length)];
    const handle = buildVinylHuman({
      want,
      role: 'shopper',
      seed: ((this.shoppers.length + this.stage) * 0.37) % 1,
      wantMap: this.wantMap[want] ?? this.wantMap.fresh,
    });
    handle.root.position.set(path[0].x, PA_GAIT.floorY, path[0].z);
    handle.root.scale.setScalar(0.22);
    this.shopperGroup.add(handle.root);
    this.shoppers.push({
      path,
      t: 0,
      speed: 0.11 + this.stage * 0.018,
      want,
      handle,
      sprite: handle.root,
      rage: false,
      parked: false,
      pop: 0,
    });
  }

  _slowAt(x, z) {
    let factor = 1;
    for (const slot of this.trapSlots) {
      if (!slot.used) continue;
      const dx = x - slot.x;
      const dz = z - slot.z;
      if (dx * dx + dz * dz < 1.7) factor *= slot.kind === 'magazine' ? 0.62 : 0.5;
    }
    return factor;
  }

  _tick(dt) {
    if (this.phase !== 'day') return;
    for (const slot of this.trapSlots) tickTrapPop(slot.mesh, dt);
    this.spawnAcc += dt;
    const gap = Math.max(0.55, 1.35 - this.stage * 0.08);
    if (this.spawnLeft > 0 && this.spawnAcc >= gap && this.shoppers.length < CAP) {
      this.spawnAcc = 0;
      this.spawnLeft -= 1;
      this._spawnOne();
    }
    for (const till of this.cashiers) {
      if (till.busy > 0) till.busy -= dt;
    }
    const waiting = [0, 0, 0];
    for (const shopper of this.shoppers) {
      if (shopper.done) continue;
      if (shopper.t < 1 && !shopper.parked) {
        const pos = along(shopper.path, shopper.t);
        shopper.t += shopper.speed * this._slowAt(pos.x, pos.z) * dt;
      }
      if (shopper.t >= 1) {
        shopper.t = 1;
        const lane = PATHS.indexOf(shopper.path);
        const till = this.cashiers[lane] ?? this.cashiers[0];
        if (till.broken) {
          shopper.parked = true;
          shopper.rage = true;
        } else if (till.busy > 0) {
          shopper.parked = true;
        } else if ((this.stock[shopper.want] ?? 0) < 1) {
          till.hp = Math.max(0, till.hp - (18 + this.stage * 4));
          till.broken = till.hp <= 0;
          shopper.done = true;
          shopper.rage = true;
          continue;
        } else {
          this.stock[shopper.want] -= 1;
          till.busy = Math.max(0.28, 1.15 - till.cashierLv * 0.12 - till.machineLv * 0.1);
          this.takings += PAYOUT[shopper.want];
          this.served += 1;
          shopper.done = true;
          continue;
        }
        if (shopper.parked) waiting[lane] += 1;
      }
      const now = along(shopper.path, shopper.t);
      const ahead = along(shopper.path, Math.min(1, shopper.t + 0.05));
      const jam = shopper.parked ? Math.min(2, waiting[PATHS.indexOf(shopper.path)] - 1) * 0.42 : 0;
      const moving = shopper.t < 1 && !shopper.parked;
      tickVinylShopper(shopper.handle, {
        dt,
        moving,
        pathSpeed: shopper.speed,
        from: now,
        to: ahead,
        rage: shopper.rage,
        camera: this.camera,
      });
      shopper.handle.root.position.set(now.x + PA_GAIT.laneBias, PA_GAIT.floorY, now.z - jam);
      if (shopper.rage) {
        shopper.handle.shirt.color.set('#ff6a6a');
        shopper.handle.shirt.emissive.set('#4a1010');
        shopper.handle.shirt.emissiveIntensity = 0.35;
      }
    }
    for (const cashier of this.cashierHandles ?? []) {
      const till = this.cashiers[cashier.root.userData.till];
      tickVinylShopper(cashier, {
        dt,
        moving: false,
        pathSpeed: 0,
        from: cashier.root.position,
        to: { x: cashier.root.position.x, z: cashier.root.position.z - 0.2 },
        rage: Boolean(till?.broken),
        camera: this.camera,
      });
    }
    this.shoppers = this.shoppers.filter((row) => {
      if (!row.done) return true;
      this.shopperGroup.remove(row.sprite);
      return false;
    });
    if (this.shoppers.length >= CAP) {
      this._endDay('Aisle jammed.');
      return;
    }
    if (this.spawnLeft <= 0 && this.shoppers.length === 0) {
      this._endDay(null);
    }
    this._paintHud();
    this._paintWorld();
  }

  _paintWorld() {
    const counts = [0, 0, 0];
    for (const row of this.shoppers) {
      const i = PATHS.indexOf(row.path);
      if (i >= 0) counts[i] += 1;
    }
    setLaneFills(this.laneFills, counts, Math.ceil(CAP / 3));
    setTillBars(this.tillBars, this.cashiers);
  }

  _poseShopperNearTill(index, phase) {
    const shopper = this.shoppers[index];
    if (!shopper?.handle) return null;
    this._poseHold = true;
    for (const row of this.shoppers) {
      if (row.handle?.root) row.handle.root.visible = row === shopper;
    }
    shopper.t = 0.78;
    shopper.parked = false;
    shopper.handle.gait.pop = 1;
    shopper.handle.gait.phase = phase;
    const now = along(shopper.path, shopper.t);
    const ahead = along(shopper.path, Math.min(1, shopper.t + 0.05));
    tickVinylShopper(shopper.handle, {
      dt: 0,
      moving: true,
      pathSpeed: 0.18,
      from: now,
      to: ahead,
      rage: false,
      camera: this.camera,
    });
    shopper.handle.root.position.set(now.x + PA_GAIT.laneBias, PA_GAIT.floorY, now.z);
    this.renderer?.render(this.scene, this.camera);
    return shopper.handle.root.position;
  }

  _endDay(fail) {
    this.phase = 'night';
    this.placeMode = null;
    this._syncPads();
    this._night.hidden = false;
    const copy = this.element.querySelector('[data-zstd-night-copy]');
    if (copy) {
      copy.textContent = fail
        ? `${fail} Bank what you can or restock for dawn.`
        : `Shift clear · ${this.served} served · ${money(this.takings)} in the till.`;
    }
    this._paintTillPop();
    this._paintHud();
  }

  _buyStock(sku) {
    const cost = RESTOCK[sku] * 4;
    if (this.takings < cost) return;
    this.takings -= cost;
    this.stock[sku] = (this.stock[sku] ?? 0) + 4;
    this._paintHud();
  }

  _placeNextTrap(kind) {
    if (this.phase !== 'day') return;
    const slot = nextFreeTrapSlot(this.trapSlots, kind);
    if (slot) this._installTrap(slot.id);
  }

  _installTrap(slotId) {
    if (this.phase !== 'day') return;
    const slot = this.trapSlots.find((row) => row.id === slotId);
    if (!slot || slot.used) return;
    const cost = TRAP_COST[slot.kind];
    if (this.takings < cost && (this.state?.cash ?? 0) < cost) return;
    if (this.takings >= cost) this.takings -= cost;
    slot.used = true;
    const mesh = buildVinylTrap(slot.kind);
    mesh.position.set(slot.x, 0.62, slot.z);
    this.scene.add(mesh);
    slot.mesh = mesh;
    this.placeMode = null;
    this._syncPads();
    this._paintHud();
  }

  _upgrade(kind) {
    const till = this.cashiers[this.selTill] ?? this.cashiers[0];
    if (!till) return;
    const cost = UP_COST[kind];
    if (this.takings < cost) return;
    this.takings -= cost;
    if (kind === 'repair') {
      till.hp = till.max;
      till.broken = false;
    } else if (kind === 'cashier') {
      till.cashierLv += 1;
    } else if (kind === 'machine') {
      till.machineLv += 1;
    }
    this._paintTillPop();
    this._paintHud();
  }

  _bankAndClose() {
    this.close();
  }

  _paintHud() {
    const set = (key, value) => {
      const el = this.element?.querySelector(`[data-zstd-${key}]`);
      if (el) el.textContent = value;
    };
    set('cash', money(this.takings));
    set('fresh', String(this.stock.fresh));
    set('household', String(this.stock.household));
    set('liquor', String(this.stock.liquor));
    if (this.state) {
      const clock = this.element?.querySelector('[data-zstd-clock]');
      if (clock) clock.textContent = `Q${this.state.quarter}`;
    }
    this._paintWorld();
    if (this.phase === 'day') this._syncPads();
  }

  _paintTillPop() {
    const pop = this._tillpop;
    if (!pop) return;
    pop.hidden = this.phase !== 'day' || !this._tillPicked;
    const till = this.cashiers[this.selTill];
    const name = pop.querySelector('[data-zstd-till-name]');
    if (name && till) {
      name.textContent = till.broken ? `Till ${till.id + 1} down` : `Till ${till.id + 1}`;
    }
  }

  _paintDock() {
    this._paintTillPop();
  }

  _resize() {
    if (!this.renderer || !this._canvas) return;
    const box = this._canvas.getBoundingClientRect();
    const w = Math.max(16, Math.floor(box.width));
    const h = Math.max(16, Math.floor(box.height));
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    posePlaysetCamera(this.camera, aspect);
  }

  _arm() {
    if (this._raf) return;
    const step = (now) => {
      this._raf = requestAnimationFrame(step);
      if (!this.open) return;
      const dt = this._last ? Math.min(0.05, (now - this._last) / 1000) : 0.016;
      this._last = now;
      this._resize();
      if (!this._poseHold) this._tick(dt);
      this.renderer?.render(this.scene, this.camera);
    };
    this._raf = requestAnimationFrame(step);
  }
}
