// District Deck V3.05 B8 — two-seat handover and private selector lifecycle.

import {
  committedPacketFor, createSeatActionEnvelope, privateSeatState,
} from '../core/state.js';
import { escapeHtml } from '../core/format.js';

const REVEAL_HOLD_MS = 650;

// Card legality reads the legacy player fields. For any seat but P1, project that
// seat's cash, actions and holdings onto those fields without writing the run.
export function stateForActiveSeat(state, seatId = 'P1') {
  if (!state || state.mode !== 'hotseat' || !seatId || seatId === 'P1' || !state.seatEconomy?.[seatId]) {
    return state;
  }
  const economy = state.seatEconomy[seatId];
  const holdings = {};
  for (const id of Object.keys(state.holdings ?? {})) {
    const holding = state.holdings[id];
    const canonical = holding.ownerSeatId ?? (holding.owner === 'rival' ? 'P2' : 'P1');
    const owner = canonical === seatId ? 'player' : 'rival';
    holdings[id] = owner === holding.owner ? holding : { ...holding, owner };
  }
  return {
    ...state,
    cash: economy.cash,
    actionsRemaining: economy.actionsRemaining,
    banked: economy.bankedActions ?? state.banked,
    creditByOwner: state.seatCredit?.[seatId]
      ? { ...state.creditByOwner, player: state.seatCredit[seatId] }
      : state.creditByOwner,
    holdings,
  };
}

export function openingSeatId(state) {
  const seatId = state?.quarterCommit?.resolutionOrder?.[0];
  if (!seatId) throw new Error('Hotseat state has no quarter resolution order.');
  return seatId;
}

function nextCollectingSeatId(state) {
  return state.quarterCommit.resolutionOrder.find(
    (seatId) => !state.quarterCommit.committedPackets[seatId],
  ) ?? openingSeatId(state);
}

function nextDefectionSeatId(state) {
  return state.quarterCommit.resolutionOrder.find((seatId) => (
    Object.values(state.activePacts).some((pact) => (
      pact.members.includes(seatId) && pact.decisions[seatId] === null
    ))
  )) ?? openingSeatId(state);
}

function buttonStyle() {
  return [
    'appearance:none',
    'border:1px solid #d8a24a',
    'border-radius:999px',
    'background:#211c17',
    'color:#fff7e8',
    'font:700 15px/1 system-ui',
    'padding:14px 22px',
    'cursor:pointer',
  ].join(';');
}

export class HotseatController {
  constructor(root, {
    getState,
    reduce,
    accept,
    clearSharedPrivate = () => {},
  }) {
    this.root = root;
    this.getState = getState;
    this.reduce = reduce;
    this.accept = accept;
    this.clearSharedPrivate = clearSharedPrivate;
    this.activeSeatId = openingSeatId(this.getState());
    this.revealed = false;
    this.timer = null;
    this.host = document.createElement('section');
    this.host.dataset.hotseat = '';
    this.host.style.cssText = 'position:fixed;inset:0;z-index:10000;pointer-events:none;';
    root.append(this.host);
    this.showPrivacy();
  }

  dispose() {
    this.cancelReveal();
    this.unmountPrivate();
    this.host.remove();
  }

  unmountPrivate() {
    this.host.querySelector('[data-hotseat-private]')?.remove();
  }

  scrubPrivateDom() {
    this.unmountPrivate();
    this.clearSharedPrivate();
    for (const live of this.root.querySelectorAll('[aria-live]')) live.textContent = '';
  }

  showPrivacy(nextSeatId = this.activeSeatId) {
    this.activeSeatId = nextSeatId;
    this.revealed = false;
    this.scrubPrivateDom();
    this.host.replaceChildren();
    const screen = document.createElement('div');
    screen.dataset.hotseatPrivacy = '';
    screen.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:grid',
      'place-items:center',
      'background:linear-gradient(145deg,#15110e,#292019)',
      'color:#fff7e8',
      'pointer-events:auto',
    ].join(';');
    screen.innerHTML = `
      <div style="max-width:34rem;text-align:center;padding:2rem">
        <p style="letter-spacing:.14em;text-transform:uppercase;color:#d8a24a">Private handover</p>
        <h1 style="font:700 42px/1.05 Georgia,serif;margin:.4rem 0 1rem">
          Pass to ${escapeHtml(nextSeatId)}
        </h1>
        <p>Only ${escapeHtml(nextSeatId)}’s private plan will mount after reveal.</p>
        <button type="button" data-hold-reveal
          style="${buttonStyle()}"
          aria-label="Hold to reveal ${escapeHtml(nextSeatId)} private turn">
          Hold to reveal
        </button>
        <p data-reveal-status aria-live="polite" style="min-height:1.4em"></p>
      </div>`;
    this.host.append(screen);
    const control = screen.querySelector('[data-hold-reveal]');
    const begin = (event) => {
      if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      this.beginReveal();
    };
    const cancel = (event) => {
      if (event.type === 'keyup' && !['Enter', ' '].includes(event.key)) return;
      this.cancelReveal();
    };
    control.addEventListener('pointerdown', begin);
    control.addEventListener('pointerup', cancel);
    control.addEventListener('pointercancel', cancel);
    control.addEventListener('pointerleave', cancel);
    control.addEventListener('keydown', begin);
    control.addEventListener('keyup', cancel);
  }

  beginReveal() {
    if (this.timer || this.revealed) return;
    const status = this.host.querySelector('[data-reveal-status]');
    if (status) status.textContent = 'Keep holding…';
    this.timer = setTimeout(() => {
      this.timer = null;
      this.reveal();
    }, REVEAL_HOLD_MS);
  }

  cancelReveal() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const status = this.host.querySelector('[data-reveal-status]');
    if (status && !this.revealed) status.textContent = '';
  }

  reveal() {
    this.cancelReveal();
    this.revealed = true;
    this.host.replaceChildren();
    this.renderPrivate();
  }

  renderPrivate() {
    this.unmountPrivate();
    const state = this.getState();
    const model = privateSeatState(state, this.activeSeatId);
    const panel = document.createElement('aside');
    panel.dataset.hotseatPrivate = this.activeSeatId;
    panel.style.cssText = [
      'position:absolute',
      'top:18px',
      'right:18px',
      'width:min(330px,calc(100vw - 36px))',
      'max-height:calc(100vh - 36px)',
      'overflow:auto',
      'pointer-events:auto',
      'background:#17130ff2',
      'border:1px solid #6f5940',
      'border-radius:16px',
      'padding:16px',
      'color:#fff7e8',
      'box-shadow:0 20px 60px #0009',
    ].join(';');
    const actions = model.pendingActions.map((action, index) =>
      `<li>Action ${index + 1}: ${escapeHtml(action.type)}</li>`).join('');
    const pact = Object.values(model.activePacts)[0] ?? null;
    panel.innerHTML = `
      <header>
        <small style="color:#d8a24a">PRIVATE · ${escapeHtml(this.activeSeatId)}</small>
        <h2 style="margin:.25rem 0">Quarter ${state.quarter} plan</h2>
      </header>
      <dl>
        <dt>Cash</dt><dd>$${model.economy.cash.toLocaleString()}</dd>
        <dt>Actions available</dt><dd>${model.economy.actionsRemaining}</dd>
      </dl>
      <ul data-private-actions>${actions || '<li>No actions staged</li>'}</ul>
      ${pact ? `
        <p>Pact ${escapeHtml(pact.pactId)} targets ${escapeHtml(pact.targetId)}.</p>
        <button type="button" data-pact-honour style="${buttonStyle()}">Honour pact</button>
        <button type="button" data-pact-defect style="${buttonStyle()}">Defect · burn slot</button>
      ` : `
        <button type="button" data-hotseat-commit style="${buttonStyle()}">Commit quarter</button>
      `}`;
    panel.querySelector('[data-hotseat-commit]')?.addEventListener('click', () => this.commit());
    panel.querySelector('[data-pact-honour]')?.addEventListener(
      'click',
      () => this.decidePact(pact.pactId, 'honour'),
    );
    panel.querySelector('[data-pact-defect]')?.addEventListener(
      'click',
      () => this.decidePact(pact.pactId, 'defect'),
    );
    this.host.append(panel);
  }

  stage(action) {
    if (!this.revealed) return { rejected: true, reason: 'Private turn is not revealed.' };
    const state = this.getState();
    const envelope = createSeatActionEnvelope(state, this.activeSeatId, action);
    const result = this.reduce(envelope);
    this.accept(result, action);
    if (!result.rejected) this.renderPrivate();
    return result;
  }

  commit() {
    const state = this.getState();
    const packet = committedPacketFor(state, this.activeSeatId);
    const envelope = createSeatActionEnvelope(state, this.activeSeatId, {
      type: 'commit-quarter',
      packetHash: packet.packetHash,
    });
    const result = this.reduce(envelope);
    this.accept(result);
    if (result.rejected) {
      this.renderPrivate();
      return result;
    }
    const next = this.getState();
    if (next.quarterCommit.status === 'collecting') {
      this.showPrivacy(nextCollectingSeatId(next));
    } else if (next.quarterCommit.status === 'defection') {
      this.showPrivacy(nextDefectionSeatId(next));
    } else {
      this.showPrivacy(openingSeatId(next));
    }
    return result;
  }

  decidePact(pactId, choice) {
    const state = this.getState();
    const action = choice === 'honour'
      ? { type: 'honour-pact', pactId }
      : { type: 'defect', pactId, replacementAction: null };
    const result = this.reduce(createSeatActionEnvelope(state, this.activeSeatId, action));
    this.accept(result);
    if (result.rejected) {
      this.renderPrivate();
      return result;
    }
    const next = this.getState();
    this.showPrivacy(
      next.quarterCommit.status === 'defection'
        ? nextDefectionSeatId(next)
        : openingSeatId(next),
    );
    return result;
  }
}
