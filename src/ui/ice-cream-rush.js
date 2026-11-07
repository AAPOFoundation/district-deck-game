// Ice Cream Rush — memory-order overlay on the beach van.
// Lease-free: tap the van, remember the ticket, tap those tiles, cash in.

import { money, moneyExact } from '../core/format.js';
import {
  ASSET,
  HINTS_PER_ORDER,
  ITEM_LABEL,
  MISTAKES_ALLOWED,
  REVIEWS_TO_CLOSE,
  cellLook,
  collectedTypes,
  itemSrc,
  meltTick,
  memorizeMs,
  openShift,
  payoutCollected,
  productSrc,
  startRound,
  tapCell,
  useHint,
} from '../core/ice-cream-rush.js';

function el(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
}

export class IceCreamRush {
  constructor(host, { onAction, onClose, onCue } = {}) {
    this.host = host;
    this.onAction = onAction;
    this.onClose = onClose;
    this.onCue = onCue;
    this.element = null;
    this.shift = openShift(1);
    this.round = null;
    this.hinting = false;
    this._timer = 0;
    this._meltTimer = 0;
    this._rngState = 1;
  }

  get open() {
    return Boolean(this.element && !this.element.hidden);
  }

  show(city, state, seed = 1) {
    this._flushPayout();
    this.city = city;
    this.state = state;
    this._rngState = (Number(seed) >>> 0) || 1;
    this.shift = openShift(this._rngState);
    this.round = null;
    this.hinting = false;
    this._stopMelt();
    if (!this.element) this._mount();
    this.element.hidden = false;
    this._paint();
  }

  close() {
    this._flushPayout();
    this._clearTimer();
    this._stopMelt();
    if (this.element) this.element.hidden = true;
    this.shift.phase = 'boot';
    this.round = null;
    this.onClose?.();
  }

  _flushPayout() {
    const amount = this.shift?.takings ?? 0;
    if (amount < 1) return;
    this.shift.takings = 0;
    this.onAction?.({ type: 'ice-cream-rush-shift', op: 'payout', amount });
  }

  destroy() {
    this.close();
    this.element?.remove();
    this.element = null;
  }

  _rng() {
    this._rngState = (Math.imul(this._rngState, 1664525) + 1013904223) >>> 0;
    return this._rngState / 0x100000000;
  }

  _mount() {
    this.element = el(`
      <section class="icr" role="dialog" aria-label="Ice Cream Rush">
        <header class="icr__bar">
          <i class="icr__cone" aria-hidden="true"></i>
          <span class="icr__brand">Ice Cream Rush</span>
          <span class="icr__tag">Beach shift</span>
          <span class="icr__spacer"></span>
          <span class="icr__chip">Takings <b data-icr-cash>$0</b></span>
          <span class="icr__chip">Show <b data-icr-show>$0</b></span>
          <span class="icr__chip">Served <b data-icr-served>0</b></span>
          <button type="button" class="icr__x" data-icr-close aria-label="Close">✕</button>
        </header>
        <div class="icr__stage">
          <div class="icr__play">
            <div class="icr__order">
              <div class="icr__order-label" data-icr-order-label>Order</div>
              <div class="icr__slots" data-icr-slots></div>
            </div>
            <div class="icr__board" data-icr-board></div>
            <div class="icr__float" data-icr-float hidden></div>
            <div class="icr__tools">
              <button type="button" class="icr__btn icr__btn--mint" data-icr-hint>Hint · 1</button>
              <span class="icr__lives" data-icr-lives></span>
            </div>
          </div>
          <aside class="icr__side">
            <figure class="icr__client">
              <img data-icr-client alt="Customer">
              <figcaption data-icr-client-cap>Waiting</figcaption>
            </figure>
            <div class="icr__reviews" data-icr-reviews></div>
          </aside>
          <div class="icr__veil" data-icr-veil>
            <div class="icr__ticket" data-icr-ticket></div>
          </div>
        </div>
      </section>
    `);
    this.host.append(this.element);
    this.element.querySelector('[data-icr-close]').addEventListener('click', () => this.close());
    this.element.querySelector('[data-icr-hint]').addEventListener('click', () => this._hint());
    this.element.querySelector('[data-icr-board]').addEventListener('click', (event) => {
      const cell = event.target.closest('[data-r]');
      if (!cell) return;
      this._tap(+cell.dataset.r, +cell.dataset.c);
    });
    this.element.querySelector('[data-icr-veil]').addEventListener('click', (event) => {
      const act = event.target.closest('[data-icr-act]')?.dataset.icrAct;
      if (act) this._act(act);
    });
  }

  _act(name) {
    if (name === 'open') {
      this._beginRound();
      return;
    }
    if (name === 'next') {
      this._beginRound();
      return;
    }
    if (name === 'bank') {
      this.close();
    }
  }

  _beginRound() {
    this._clearTimer();
    this._stopMelt();
    this.hinting = false;
    this.round = startRound({ rng: () => this._rng(), served: this.shift.served });
    this.shift.phase = 'play';
    this.element?.classList.remove('is-slippery');
    this._paint();
    this._timer = window.setTimeout(() => {
      if (!this.round || this.round.phase !== 'memorize') return;
      this.round = { ...this.round, phase: 'serve', event: 'serve' };
      this._startMelt();
      this._paint();
    }, memorizeMs(this.round.order.length));
  }

  _startMelt() {
    this._stopMelt();
    this._meltTimer = window.setInterval(() => this._melt(), 2200);
  }

  _stopMelt() {
    if (this._meltTimer) window.clearInterval(this._meltTimer);
    this._meltTimer = 0;
  }

  _melt() {
    if (!this.round || this.round.phase !== 'serve') return;
    const next = meltTick(this.round, () => this._rng());
    this.round = next;
    if (next.meltCost) {
      this.shift.takings = Math.max(0, this.shift.takings - next.meltCost);
      this._float(`−${moneyExact(next.meltCost)} gone bad`, true);
      this.onCue?.('reject');
    }
    if (next.event === 'bottom-melt') {
      this.shift.reviews += 1;
      this.element?.classList.add('is-slippery');
      this._float('Bottom row spoiled', true);
      this.onCue?.('lose');
      if (this.shift.reviews >= REVIEWS_TO_CLOSE) {
        this.shift.phase = 'closed';
        this._stopMelt();
      }
    }
    this._paint();
  }

  _tap(row, col) {
    if (!this.round || this.round.phase !== 'serve') return;
    const next = tapCell(this.round, row, col, () => this._rng());
    this.round = next;
    if (next.showPay) {
      this.shift.takings += next.showPay;
      this.shift.showmanship += next.showPay;
      this._float(`+${moneyExact(next.showPay)} showmanship`);
    }
    if (next.event === 'collect') {
      this.onCue?.('select');
      this._flashCell(row, col);
      if (next.collectPay != null && next.collectPay < 250) {
        this._float(`+${moneyExact(next.collectPay)} soft serve`);
      }
    } else if (next.event === 'showmanship') {
      this.onCue?.('select');
      this._burst(next.fx);
    } else if (next.event === 'spoiled') {
      this.onCue?.('reject');
    } else if (next.event === 'mistake') {
      this.onCue?.('reject');
    } else if (next.event === 'deliver') {
      this._stopMelt();
      this.shift.served += 1;
      const pay = payoutCollected(next.collected);
      this.shift.takings += pay;
      this.onCue?.('ching');
      this._burst(next.fx);
    } else if (next.event === 'review') {
      this._stopMelt();
      this.shift.reviews += 1;
      this.onCue?.('reject');
      if (this.shift.reviews >= REVIEWS_TO_CLOSE) this.shift.phase = 'closed';
    }
    this._paint();
  }

  _hint() {
    if (!this.round) return;
    const next = useHint(this.round);
    this.round = next;
    if (next.event !== 'hint') {
      this.onCue?.('reject');
      this._paint();
      return;
    }
    this.hinting = true;
    this.onCue?.('select');
    this._paint();
    window.setTimeout(() => {
      this.hinting = false;
      this._paint();
    }, 1800);
  }

  _flashCell(row, col) {
    const btn = this.element?.querySelector(`[data-r="${row}"][data-c="${col}"]`);
    if (!btn) return;
    btn.classList.add('is-pop');
    window.setTimeout(() => btn.classList.remove('is-pop'), 120);
  }

  _float(text, bad = false) {
    const node = this.element?.querySelector('[data-icr-float]');
    if (!node) return;
    node.hidden = false;
    node.classList.toggle('is-bad', bad);
    node.textContent = text;
    node.classList.remove('is-go');
    void node.offsetWidth;
    node.classList.add('is-go');
    window.setTimeout(() => { node.hidden = true; }, 900);
  }

  _burst(fx) {
    if (!fx?.length || !this.element) return;
    const root = this.element.querySelector('[data-icr-board]');
    for (const run of fx) {
      const cells = run.cells ?? [];
      for (const pair of cells) {
        const r = pair[0];
        const c = pair[1];
        const btn = root.querySelector(`[data-r="${r}"][data-c="${c}"]`);
        if (!btn) continue;
        btn.classList.add('is-burst');
        window.setTimeout(() => btn.classList.remove('is-burst'), 280);
      }
    }
  }

  _clearTimer() {
    if (this._timer) window.clearTimeout(this._timer);
    this._timer = 0;
  }

  _paint() {
    if (!this.element) return;
    this.element.querySelector('[data-icr-cash]').textContent = money(this.shift.takings);
    const show = this.element.querySelector('[data-icr-show]');
    if (show) show.textContent = money(this.shift.showmanship ?? 0);
    this.element.querySelector('[data-icr-served]').textContent = String(this.shift.served);
    this._paintClient();
    this._paintReviews();
    this._paintOrder();
    this._paintBoard();
    this._paintTools();
    this._paintVeil();
  }

  _paintClient() {
    const img = this.element.querySelector('[data-icr-client]');
    const cap = this.element.querySelector('[data-icr-client-cap]');
    const event = this.round?.event;
    if (event === 'deliver') {
      img.src = `${ASSET}/client-happy.jpg`;
      cap.textContent = 'Happy customer';
    } else if (event === 'review' || this.shift.phase === 'closed') {
      img.src = `${ASSET}/client-mad.jpg`;
      cap.textContent = 'Bad review';
    } else {
      img.src = `${ASSET}/client-wait.jpg`;
      cap.textContent = this.round?.phase === 'memorize' ? 'Remember this' : 'Waiting';
    }
  }

  _paintReviews() {
    const root = this.element.querySelector('[data-icr-reviews]');
    root.replaceChildren();
    for (let i = 0; i < REVIEWS_TO_CLOSE; i += 1) {
      const stamp = document.createElement('span');
      stamp.className = `icr__stamp${i < this.shift.reviews ? ' is-on' : ''}`;
      stamp.textContent = 'BAD';
      root.append(stamp);
    }
  }

  _paintOrder() {
    const label = this.element.querySelector('[data-icr-order-label]');
    const slots = this.element.querySelector('[data-icr-slots]');
    const round = this.round;
    slots.replaceChildren();
    if (!round) {
      label.textContent = 'Order';
      return;
    }
    const hide = round.phase === 'serve' && !this.hinting;
    label.textContent = hide ? 'Remember' : 'Order';
    const taken = collectedTypes(round.collected);
    for (const type of round.order) {
      const idx = taken.indexOf(type);
      const done = idx >= 0;
      if (done) taken.splice(idx, 1);
      const slot = document.createElement('div');
      slot.className = `icr__slot${done ? ' is-done' : hide && !done ? ' is-hidden' : ''}`;
      if (done || !hide) slot.style.backgroundImage = `url("${itemSrc(type)}")`;
      if (hide && !done) slot.textContent = '?';
      slot.title = ITEM_LABEL[type];
      slots.append(slot);
    }
  }

  _paintBoard() {
    const root = this.element.querySelector('[data-icr-board]');
    const round = this.round;
    const locked = !round || round.phase !== 'serve';
    if (!round) {
      root.replaceChildren();
      return;
    }
    const kids = root.children;
    if (kids.length !== 64) {
      root.replaceChildren();
      for (let r = 0; r < 8; r += 1) {
        for (let c = 0; c < 8; c += 1) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'icr__cell';
          btn.dataset.r = String(r);
          btn.dataset.c = String(c);
          root.append(btn);
        }
      }
    }
    [...root.children].forEach((btn, i) => {
      const r = Math.floor(i / 8);
      const c = i % 8;
      const look = cellLook(round.board[r][c]);
      const type = look?.type;
      btn.disabled = locked;
      btn.classList.remove('is-melt-1', 'is-melt-2', 'is-spoiled');
      const melt = look?.melt ?? 0;
      if (melt === 1) btn.classList.add('is-melt-1');
      if (melt === 2) btn.classList.add('is-melt-2');
      if (melt >= 3) btn.classList.add('is-spoiled');
      const src = type ? `url("${itemSrc(type, melt)}")` : 'none';
      btn.style.backgroundImage = src;
      const label = type ? ITEM_LABEL[type] : '';
      btn.title = melt >= 3 ? `${label} · gone bad` : melt ? `${label} · melting` : label;
    });
  }

  _paintTools() {
    const hint = this.element.querySelector('[data-icr-hint]');
    const lives = this.element.querySelector('[data-icr-lives]');
    const left = this.round?.hintsLeft ?? HINTS_PER_ORDER;
    hint.textContent = `Hint · ${left}`;
    hint.disabled = !this.round || this.round.phase !== 'serve' || left < 1;
    const mistakes = this.round?.mistakes ?? 0;
    const grace = Math.max(0, MISTAKES_ALLOWED - mistakes);
    lives.textContent = `Margin ${grace} · ${this.shift.reviews}/${REVIEWS_TO_CLOSE} bad reviews`;
  }

  _paintVeil() {
    const veil = this.element.querySelector('[data-icr-veil]');
    const ticket = this.element.querySelector('[data-icr-ticket]');
    const event = this.round?.event;
    const boot = !this.round && this.shift.phase !== 'closed';
    const deliver = event === 'deliver';
    const review = event === 'review' && this.shift.phase !== 'closed';
    const closed = this.shift.phase === 'closed';
    if (!boot && !deliver && !review && !closed) {
      veil.hidden = true;
      return;
    }
    veil.hidden = false;
    const floater = this.element.querySelector('[data-icr-float]');
    if (floater) floater.hidden = true;
    if (boot) {
      ticket.innerHTML = `
        <h2>Ice Cream Rush</h2>
        <p>The order flashes, then hides. Tap matching tiles from memory. Three in a line pop for showmanship. Dairy melts — soft scoops pay less, spoiled ones cost you. Three spoiled on the bottom row is a bad review. Waffles and cones stay dry.</p>
        <div class="icr__row">
          <button type="button" class="icr__btn icr__btn--mint" data-icr-act="open">Open hatch</button>
        </div>`;
      return;
    }
    if (deliver) {
      const pay = payoutCollected(this.round.collected);
      const extra = this.round.showPay ? ` · +${moneyExact(this.round.showPay)} showmanship` : '';
      ticket.innerHTML = `
        <div class="icr__product" style="background-image:url('${productSrc(this.round.order)}')"></div>
        <h2>Order up</h2>
        <div class="icr__cash">+${moneyExact(pay)}</div>
        <p>Cha-ching.${extra}</p>
        <div class="icr__row">
          <button type="button" class="icr__btn icr__btn--mint" data-icr-act="next">Next customer</button>
        </div>`;
      return;
    }
    if (review) {
      ticket.innerHTML = `
        <h2>Wrong order</h2>
        <p>Wrong items. That is a bad review.</p>
        <div class="icr__row">
          <button type="button" class="icr__btn" data-icr-act="next">Next customer</button>
        </div>`;
      return;
    }
    ticket.innerHTML = `
      <h2>Van closed</h2>
      <p>Five bad reviews and the hatch shuts. You earned ${moneyExact(this.shift.takings)} this shift.</p>
      <div class="icr__row">
        <button type="button" class="icr__btn icr__btn--mint" data-icr-act="bank">Bank takings</button>
      </div>`;
  }
}
