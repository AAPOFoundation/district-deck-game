// Floating cash chips at the point of a logged goods exchange.
// Amounts are passed in verbatim from the journey mapper — this file does not
// invent dollars. One shared plane, a preallocated 8-slot canvas pool, no
// per-frame allocations. Oldest-first eviction.

import * as THREE from 'three';

export const EXCHANGE_CHIP_CAP = 8;
export const EXCHANGE_CHIP_DURATION = 1.2;
export const EXCHANGE_CHIP_LIFT = 5.2;
/** Plates start this far above their origin so a lane-head chip clears the crane rails. */
export const EXCHANGE_CHIP_BASE_RAISE = 2.2;
export const EXCHANGE_CHIP_WIDTH = 9.6;
export const EXCHANGE_CHIP_HEIGHT = 2.7;
export const EXCHANGE_CHIP_SCALE = 1.5;
export const EXCHANGE_CHIP_POP = 0.18;
export const EXCHANGE_CHIP_POP_PEAK = 1.18;
export const EXCHANGE_PLATE_EVENT = 'district-deck:exchange-plate';
export const EXCHANGE_CHIP_AMBER = '#d8a24a';
export const EXCHANGE_CHIP_BONE = '#ece6da';
export const EXCHANGE_CHIP_LOSS = '#c9705a';
export const EXCHANGE_CHIP_INK = '#0c0b09';

const CANVAS_W = 256;
const CANVAS_H = 72;

function formatChipMoney(amount) {
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : '';
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    const millions = Math.round((abs / 1_000_000) * 10) / 10;
    const body = Number.isInteger(millions) ? String(millions) : millions.toFixed(1);
    return `${sign}$${body}M`;
  }
  return `${sign}$${abs.toLocaleString('en-AU')}`;
}

export function formatChipLabel(amount, options = {}) {
  if (!Number.isInteger(amount)) return '';
  const money = options.ledger === 'city'
    ? formatChipMoney(amount)
    : `${amount > 0 ? '+' : amount < 0 ? '−' : ''}$${Math.abs(amount).toLocaleString('en-AU')}`;
  if (options.ledger === 'city') return `⌂ ${money} AT SETTLE`;
  return money;
}

export function chipAmountFromLog(row) {
  if (Number.isInteger(row?.amount)) return row.amount;
  if (Number.isInteger(row?.cash)) return row.cash;
  return null;
}

/** Insertion-ordered queue. Shift is oldest-first when over cap. */
export function nextChipQueue(queue, chip, cap = EXCHANGE_CHIP_CAP) {
  const next = Array.isArray(queue) ? [...queue, chip] : [chip];
  while (next.length > cap) next.shift();
  return next;
}

export function emitExchangePlatePulse(plate, amount) {
  const doc = globalThis.document;
  if (!doc || typeof doc.dispatchEvent !== 'function') return false;
  if (typeof CustomEvent !== 'function') return false;
  doc.dispatchEvent(new CustomEvent(EXCHANGE_PLATE_EVENT, {
    detail: { plate, amount },
  }));
  return true;
}

function paintChip(canvas, label, earning) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  const fill = earning ? EXCHANGE_CHIP_AMBER : EXCHANGE_CHIP_BONE;
  const ink = earning ? EXCHANGE_CHIP_INK : EXCHANGE_CHIP_LOSS;
  roundRect(ctx, 8, 8, CANVAS_W - 16, CANVAS_H - 16, 14);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const settle = label.includes('AT SETTLE');
  ctx.font = settle
    ? '700 22px "DD Display", system-ui, sans-serif'
    : '700 36px "DD Display", system-ui, sans-serif';
  ctx.fillText(label, CANVAS_W * 0.5, CANVAS_H * 0.54);
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function makeSlotCanvas() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  return canvas;
}

export class ExchangeChipsLayer {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'exchange-chips';
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.live = [];
    this.idle = [];
    this.disposed = false;
    for (let index = 0; index < EXCHANGE_CHIP_CAP; index += 1) {
      this.idle.push(this._makeSlot(index));
    }
  }

  _makeSlot(index) {
    const canvas = makeSlotCanvas();
    const texture = canvas
      ? new THREE.CanvasTexture(canvas)
      : new THREE.Texture();
    if (texture.isCanvasTexture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
    }
    // P13 critic R2: a chip drawn with depth testing off and an alpha fade read as
    // "a translucent ghosted asset passing through the gantry backstay". The plate
    // is now an opaque cut-out (alphaTest keeps the rounded corners), depth-tested
    // like any other object, and it leaves by SCALE, never by opacity.
    const material = new THREE.MeshBasicMaterial({
      map: canvas ? texture : null,
      color: 0xffffff,
      transparent: false,
      alphaTest: 0.5,
      opacity: 1,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(this.geometry, material);
    mesh.name = `exchange-chip:${index}`;
    mesh.scale.set(
      EXCHANGE_CHIP_WIDTH * EXCHANGE_CHIP_SCALE,
      EXCHANGE_CHIP_HEIGHT * EXCHANGE_CHIP_SCALE,
      1,
    );
    mesh.rotation.set(-0.52, 0.38, 0);
    mesh.renderOrder = 24;
    mesh.visible = false;
    mesh.frustumCulled = false;
    this.root.add(mesh);
    return {
      index,
      canvas,
      texture,
      material,
      mesh,
      amount: 0,
      plate: 'tape',
      age: 0,
      originX: 0,
      originY: 0,
      originZ: 0,
    };
  }

  spawn(amount, point, { plate = 'tape', ledger = null } = {}) {
    if (this.disposed) return null;
    if (!Number.isInteger(amount) || amount === 0) return null;
    // Evict only chips that have rendered at least one frame; a same-frame
    // burst never silently kills its own first chip — when every live chip
    // is age-0 the newcomer is dropped instead (critic V5.0 R2).
    while (this.live.length >= EXCHANGE_CHIP_CAP) {
      const idx = this.live.findIndex((slot) => slot.age > 0);
      if (idx < 0) return null;
      const [slot] = this.live.splice(idx, 1);
      this._park(slot);
    }
    const slot = this.idle.shift();
    if (!slot) return null;
    slot.amount = amount;
    slot.plate = plate === 'cash' ? 'cash' : 'tape';
    slot.age = 0;
    slot.originX = point?.x ?? 0;
    slot.originY = (point?.y ?? 0) + 1.6;
    slot.originZ = point?.z ?? 0;
    if (slot.canvas) {
      paintChip(slot.canvas, formatChipLabel(amount, { ledger }), amount > 0);
      slot.texture.needsUpdate = true;
    }
    slot.mesh.position.set(slot.originX, slot.originY, slot.originZ);
    slot.material.opacity = 1;
    slot.mesh.visible = true;
    this.live.push(slot);
    emitExchangePlatePulse(slot.plate, amount);
    return slot;
  }

  _evictOldest() {
    const slot = this.live.shift();
    if (slot) this._park(slot);
  }

  _park(slot) {
    slot.mesh.visible = false;
    slot.material.opacity = 0;
    slot.amount = 0;
    slot.age = 0;
    this.idle.push(slot);
  }

  update(dt) {
    if (this.disposed) return;
    const step = Math.max(0, dt);
    for (let i = this.live.length - 1; i >= 0; i -= 1) {
      const slot = this.live[i];
      slot.age += step;
      const t = Math.min(1, slot.age / EXCHANGE_CHIP_DURATION);
      const ease = 1 - (1 - t) ** 3;
      const popT = Math.min(1, slot.age / EXCHANGE_CHIP_POP);
      const pop = popT < 1
        ? 0.78 + (EXCHANGE_CHIP_POP_PEAK - 0.78) * Math.sin(popT * Math.PI)
        : 1;
      // Leave by scale (ease-in shrink over the last 30 %), never by opacity —
      // the plate stays opaque for its whole life.
      const leave = t < 0.7 ? 1 : Math.max(0.02, 1 - ((t - 0.7) / 0.3) ** 2);
      const s = EXCHANGE_CHIP_SCALE * pop * leave;
      slot.mesh.scale.set(EXCHANGE_CHIP_WIDTH * s, EXCHANGE_CHIP_HEIGHT * s, 1);
      slot.mesh.position.set(
        slot.originX,
        slot.originY + EXCHANGE_CHIP_BASE_RAISE + EXCHANGE_CHIP_LIFT * ease,
        slot.originZ,
      );
      slot.material.opacity = 1;
      if (t >= 1) {
        this.live.splice(i, 1);
        this._park(slot);
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.live.length = 0;
    this.idle.length = 0;
    this.geometry.dispose();
    this.root.traverse((child) => {
      if (!child.isMesh) return;
      child.material?.map?.dispose?.();
      child.material?.dispose?.();
    });
    this.root.clear();
  }
}
