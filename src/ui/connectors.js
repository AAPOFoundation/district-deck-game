// District Deck V3.03 Batch 5 / V3.10 R13 — zero-draw SVG links from reading surfaces to the board.
// Rival arcs stay hidden on the default play plate; they only appear while routing (hover/focus
// on a rival chip, or the selected parcel is a disclosed rival target). Event and person links
// remain selection-gated. Soft stroke volume so architecture wins the frame.

import * as THREE from 'three';
import { escapeHtml } from '../core/format.js';

function matrixSignature(camera, width, height) {
  return [
    width,
    height,
    ...camera.matrixWorldInverse.elements,
    ...camera.projectionMatrix.elements,
  ].map((value) => Number(value).toFixed(4)).join(',');
}

function screenPoint(camera, point, width, height) {
  if (!point) return null;
  const projected = new THREE.Vector3(point.x, point.y ?? 0, point.z).project(camera);
  if (
    projected.z < -1 || projected.z > 1
    || projected.x < -1 || projected.x > 1
    || projected.y < -1 || projected.y > 1
  ) return null;
  return {
    x: ((projected.x + 1) / 2) * width,
    y: ((1 - projected.y) / 2) * height,
  };
}

function elementPoint(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function elementEdgePoint(element, toward) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: toward?.x < rect.left + rect.width / 2 ? rect.left : rect.right,
    y: Math.max(rect.top + 18, Math.min(toward?.y ?? rect.top + rect.height / 2, rect.bottom - 18)),
  };
}

/** Selected parcel id from the action bar (single-thread selection language). */
function selectedParcelId() {
  const verb = document.querySelector('.action-group--property .verb[data-parcel-id]');
  return verb?.dataset.parcelId ?? null;
}

/**
 * Rival arcs are routing affordances, not always-on board chrome.
 * Show only while the player is pointing at a rival chip or has that target selected.
 */
function isRivalRouting(chip) {
  if (!chip) return false;
  if (chip.matches(':hover, :focus, :focus-visible')) return true;
  const selected = selectedParcelId();
  return Boolean(selected && chip.dataset.goto === selected);
}

function routingSignature() {
  const parts = [];
  for (const chip of document.querySelectorAll('[data-rival-order][data-goto]')) {
    if (isRivalRouting(chip)) {
      parts.push(`r${chip.dataset.rivalOrder}:${chip.dataset.goto}`);
    }
  }
  const eventRow = document.querySelector('.event-row.is-selected[data-event-id]');
  if (eventRow) parts.push(`e:${eventRow.dataset.eventId}`);
  const personCard = document.querySelector('.card[data-person-id]');
  if (personCard) parts.push(`p:${personCard.dataset.personId}`);
  const selected = selectedParcelId();
  if (selected) parts.push(`s:${selected}`);
  return parts.join('|');
}

/** Soft solid arc + parcel pin. Inline opacity mutes CSS glow so the plate stays quiet. */
function curve(from, to, kind, opacity = 0.42) {
  const bend = Math.max(18, Math.abs(to.x - from.x) * 0.28);
  const direction = to.x >= from.x ? 1 : -1;
  return `
    <path class="board-connector board-connector--${kind}"
      style="opacity:${opacity}"
      d="M ${from.x.toFixed(1)} ${from.y.toFixed(1)}
         C ${(from.x + bend * direction).toFixed(1)} ${from.y.toFixed(1)},
           ${(to.x - bend * direction).toFixed(1)} ${to.y.toFixed(1)},
           ${to.x.toFixed(1)} ${to.y.toFixed(1)}" />
    <circle class="board-connector-pin board-connector-pin--${kind}"
      style="opacity:${Math.min(1, opacity + 0.12)}"
      cx="${to.x.toFixed(1)}" cy="${to.y.toFixed(1)}" r="2.6" />`;
}

function personCue(to, board, name) {
  if (!to || !board || to.x < board.left || to.x > board.right || to.y < board.top || to.y > board.bottom) return '';
  const label = String(name ?? 'Selected person').slice(0, 24);
  const width = Math.min(174, Math.max(100, label.length * 6.6 + 24));
  if (board.right - board.left < width + 12 || board.bottom - board.top < 96) return '';
  const x = Math.max(board.left + 6, Math.min(to.x - width / 2, board.right - width - 6));
  const above = to.y - 72 >= board.top + 6;
  const y = above ? to.y - 72 : Math.min(to.y + 22, board.bottom - 32);
  const stemY = above ? y + 26 : y;
  const anchorY = to.y + (above ? -10 : 10);
  return `<g class="board-person-cue" data-person-cue>
    <ellipse class="board-person-cue__ring" cx="${to.x.toFixed(1)}" cy="${to.y.toFixed(1)}" rx="11" ry="5" />
    <path class="board-person-cue__stem" d="M ${(x + width / 2).toFixed(1)} ${stemY.toFixed(1)} L ${to.x.toFixed(1)} ${anchorY.toFixed(1)}" />
    <rect class="board-person-cue__label" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width}" height="26" rx="4" />
    <text class="board-person-cue__name" x="${(x + width / 2).toFixed(1)}" y="${(y + 13).toFixed(1)}">${escapeHtml(label)}</text>
  </g>`;
}

export class ConnectorOverlay {
  constructor(svg, view, getState, { getBoardRect = null } = {}) {
    this.svg = svg;
    this.view = view;
    this.getState = getState;
    this.getBoardRect = getBoardRect;
    this.signature = '';
    this.invalidated = true;
    this._onResize = () => this.invalidate();
    // Hover/focus on rival chips is pure DOM state — re-evaluate without a camera move.
    this._onRoutingPointer = () => this.invalidate();
    window.addEventListener('resize', this._onResize);
    document.addEventListener('pointerover', this._onRoutingPointer, true);
    document.addEventListener('pointerout', this._onRoutingPointer, true);
    document.addEventListener('focusin', this._onRoutingPointer, true);
    document.addEventListener('focusout', this._onRoutingPointer, true);
  }

  invalidate() {
    this.invalidated = true;
  }

  update() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const personCard = document.querySelector('.card[data-person-id]');
    const personPosition = personCard ? this.view.people.positionOf(personCard.dataset.personId) : null;
    const personSignature = personPosition ? `${personPosition.x.toFixed(3)},${personPosition.y.toFixed(3)},${personPosition.z.toFixed(3)}` : '';
    const signature = `${matrixSignature(this.view.camera, width, height)}#${routingSignature()}#${personSignature}`;
    if (!this.invalidated && signature === this.signature) return false;
    this.signature = signature;
    this.invalidated = false;
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const paths = [];
    for (const chip of document.querySelectorAll('[data-rival-order][data-goto]')) {
      if (!isRivalRouting(chip)) continue;
      const from = elementPoint(chip);
      const to = screenPoint(
        this.view.camera,
        this.view.worldOf(chip.dataset.goto),
        width,
        height,
      );
      if (from && to) {
        // Primary rival target slightly louder than fall-through; both muted vs pre-R13.
        const order = Number(chip.dataset.rivalOrder) || 1;
        paths.push(curve(from, to, `rival-${order}`, order === 1 ? 0.48 : 0.32));
      }
    }

    const eventRow = document.querySelector('.event-row.is-selected[data-event-id]');
    if (eventRow) {
      const state = this.getState();
      const event = state.events?.byId?.[eventRow.dataset.eventId];
      const parcelId = event?.anchorIds?.find((id) => this.view.city.parcels[id]);
      const to = screenPoint(this.view.camera, this.view.worldOf(parcelId), width, height);
      const from = elementEdgePoint(eventRow, to);
      if (from && to) paths.push(curve(from, to, 'event', 0.52));
    }

    if (personCard) {
      const to = screenPoint(this.view.camera, personPosition, width, height);
      const from = elementEdgePoint(personCard, to);
      if (from && to) {
        paths.push(curve(from, to, 'person', 0.40));
        paths.push(personCue(to, this.getBoardRect?.(), personCard.querySelector('.card__title')?.textContent));
      }
    }
    this.svg.innerHTML = paths.join('');
    this.svg.hidden = paths.length === 0;
    return true;
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('pointerover', this._onRoutingPointer, true);
    document.removeEventListener('pointerout', this._onRoutingPointer, true);
    document.removeEventListener('focusin', this._onRoutingPointer, true);
    document.removeEventListener('focusout', this._onRoutingPointer, true);
    this.svg.innerHTML = '';
  }
}
