// Mosaic trading desk. Presentation only — verbs go through onAction into the engine.

import {
  DAYS_PER_QUARTER,
  TAPE_MS_PER_DAY,
  accountSummary,
  assetsOnDesk,
  canTrade,
  formDailyBar,
  smaValue,
  formatTickerPrice,
  marketLotSize,
  quarterDailyBars,
  quoteFromLast,
  stockExchangeOnBoard,
  tapeDayFromElapsed,
  tradeLotsForCard,
} from '../core/markets.js';
import { canPlaceOrder, isLimitMarketable } from '../core/markets-orders.js';
import { deskWire } from '../core/markets-narrative.js';
import { escapeHtml, moneyExact, signedMoney } from '../core/format.js';

const TYPES = [
  { id: 'market', label: 'MKT' },
  { id: 'limit', label: 'LMT' },
  { id: 'stop', label: 'STP' },
  { id: 'stop-limit', label: 'STP LMT' },
  { id: 'take-profit', label: 'TAKE PROFIT' },
];

function clsOf(bp) {
  if (!Number.isFinite(bp) || bp === 0) return '';
  return bp > 0 ? 'up' : 'dn';
}

function signedPct(bp) {
  if (!Number.isFinite(bp)) return '—';
  return `${bp >= 0 ? '+' : ''}${(bp / 100).toFixed(2)}%`;
}

function needsLimit(type) {
  return type === 'limit' || type === 'stop-limit' || type === 'take-profit';
}

function needsStop(type) {
  return type === 'stop' || type === 'stop-limit';
}

export class ExchangeDesk {
  constructor(host, { onAction, onClose, onSettle = null }) {
    this.host = host;
    this.onAction = onAction;
    this.onClose = onClose;
    this.onSettle = onSettle;
    this.element = null;
    this.city = null;
    this.state = null;
    this.venueId = null;
    this.assetId = 'XAU';
    this.side = 'buy';
    this.orderType = 'limit';
    this.tif = 'gtc';
    this.qty = 1;
    this.limitPrice = 0;
    this.stopPrice = 0;
    this.stopLoss = '';
    this.takeProfit = '';
    this._chart = null;
    this._raf = 0;
    /** Wall-clock origin for the current game quarter. Never reset on hide. */
    this._quarterStartedAt = 0;
    this._tapeQuarter = null;
    /** Completed quarter tapes keyed by asset, each an array of 90-bar blocks. */
    this._history = {};
    this._barCache = new Map();
    this._lastTickDay = -1;
  }

  get open() {
    return Boolean(this.element && !this.element.hidden);
  }

  close() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this.element) {
      this.element.hidden = true;
    }
    this.onClose?.();
  }

  destroy() {
    this.close();
    this.element?.remove();
    this.element = null;
  }

  show(city, state, venueId = null) {
    this.city = city;
    this.state = state;
    const venue = stockExchangeOnBoard(city);
    this.venueId = venueId ?? venue?.id ?? null;
    if (!this.element) this._mount();
    this.element.hidden = false;
    this._syncTapeQuarter(state, { continueOnSettle: false });
    this._syncTicketDefaults(true);
    this.render();
    this._drawChart();
    this._armTape();
  }

  update(city, state) {
    this.city = city;
    this.state = state;
    this._syncTapeQuarter(state, { continueOnSettle: true });
    if (!this.open) return;
    this.render();
    this._drawChart();
    this._armTape();
  }

  _deskAssets() {
    return assetsOnDesk(this.state);
  }

  _syncTapeQuarter(state, { continueOnSettle }) {
    const q = state?.quarter;
    if (!Number.isInteger(q)) return;
    if (this._tapeQuarter == null) {
      this._tapeQuarter = q;
      this._quarterStartedAt = performance.now();
      // Prelude so day 1 is not a single autoscaled candle.
      for (const asset of this._deskAssets()) {
        const open = state.markets?.prices?.[asset.id] ?? asset.basePrice;
        const prior = [
          this._barsFor(state.seed, asset.id, Math.max(0, q - 3), open),
          this._barsFor(state.seed, asset.id, Math.max(0, q - 2), open),
          this._barsFor(state.seed, asset.id, Math.max(0, q - 1), open),
        ].flat();
        this._history[asset.id] = prior.slice(-220);
      }
      return;
    }
    if (q === this._tapeQuarter) return;
    // Seal only days that actually played — do not dump the unplayed rest of the film.
    const played = tapeDayFromElapsed(performance.now() - (this._quarterStartedAt || performance.now()));
    for (const asset of this._deskAssets()) {
      const open = state.markets?.priorPrices?.[asset.id]
        ?? state.markets?.prices?.[asset.id]
        ?? asset.basePrice;
      const block = this._barsFor(state.seed, asset.id, this._tapeQuarter, open);
      if (!this._history[asset.id]) this._history[asset.id] = [];
      this._history[asset.id].push(...block.slice(0, played.day + 1));
    }
    this._tapeQuarter = q;
    // New 90-day movie starts now so Settle never blanks the tape.
    this._quarterStartedAt = performance.now();
    this._lastTickDay = -1;
    void continueOnSettle;
  }

  _barsFor(seed, assetId, quarter, openPrice) {
    const key = `${seed}:${assetId}:${quarter}:${openPrice}`;
    if (!this._barCache.has(key)) {
      this._barCache.set(key, quarterDailyBars(seed, assetId, quarter, openPrice, this.state?.markets));
    }
    return this._barCache.get(key);
  }

  _tape() {
    const now = performance.now();
    const started = this._quarterStartedAt || now;
    const { day, frac } = tapeDayFromElapsed(now - started);
    const seed = this.state?.seed;
    const q = this.state?.quarter ?? 1;
    const open = this.state?.markets?.prices?.[this.assetId]
      ?? this._deskAssets().find((a) => a.id === this.assetId)?.basePrice
      ?? 1;
    const block = this._barsFor(seed, this.assetId, q, open);
    const done = block.slice(0, day);
    const live = formDailyBar(block[day], frac, seed, this.assetId);
    const history = this._history[this.assetId] ?? [];
    const bars = live ? [...history, ...done, live] : [...history, ...done];
    const last = live?.c ?? done.at(-1)?.c ?? open;
    return { day, frac, bars, last, waiting: day >= DAYS_PER_QUARTER - 1 && frac >= 1 };
  }

  _tapeLast(assetId) {
    const seed = this.state?.seed;
    const q = this.state?.quarter ?? 1;
    const asset = this._deskAssets().find((row) => row.id === assetId);
    const open = this.state?.markets?.prices?.[assetId] ?? asset?.basePrice ?? 1;
    const block = this._barsFor(seed, assetId, q, open);
    const now = performance.now();
    const { day, frac } = tapeDayFromElapsed(now - (this._quarterStartedAt || now));
    const live = formDailyBar(block[day], frac, seed, assetId);
    return live?.c ?? open;
  }

  _armTape() {
    if (this._raf || !this.open) return;
    const tick = () => {
      this._raf = 0;
      if (!this.open || !this.state) return;
      this._tickLive();
      this._drawChart();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _mount() {
    const root = document.createElement('section');
    root.className = 'tws tws--document-system';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Stock Exchange trading desk');
    root.innerHTML = `
      <header class="tws__titlebar">
        <span class="tws__brand">TWS · District</span>
        <span>Stock Exchange workstation</span>
        <span data-tws-venue></span>
        <span class="tws__titlebar-spacer"></span>
        <span data-tws-clock></span>
        <button type="button" class="tws-settle" data-tws-settle>Settle Q</button>
        <button type="button" class="tws__icon-btn" data-tws-close aria-label="Close desk">✕</button>
      </header>
      <div class="tws__account" data-tws-account></div>
      <div class="tws-wire" data-tws-wire></div>
      <div class="tws__workspace">
        <aside class="tws-pane tws-watch">
          <div class="tws-pane__h">Monitor · Watchlist</div>
          <div data-tws-watch></div>
        </aside>
        <section class="tws-pane tws-chart">
          <div class="tws-pane__h">Daily chart · 90-day quarter · MA50/MA200</div>
          <div class="tws-chart__meta" data-tws-chart-meta></div>
          <canvas data-tws-canvas></canvas>
        </section>
        <aside class="tws-pane tws-ticket">
          <div class="tws-pane__h">Order ticket</div>
          <form class="tws-ticket__body" data-tws-ticket autocomplete="off"></form>
        </aside>
      </div>
      <div class="tws__blotter">
        <div class="tws-pane tws-grid">
          <div class="tws-pane__h">Portfolio</div>
          <div data-tws-positions></div>
        </div>
        <div class="tws-pane tws-grid">
          <div class="tws-pane__h">Working orders</div>
          <div data-tws-orders></div>
        </div>
        <div class="tws-pane tws-grid">
          <div class="tws-pane__h">News · dividends · prints</div>
          <div data-tws-news></div>
          <div data-tws-fills></div>
        </div>
      </div>
    `;
    this.host.appendChild(root);
    this.element = root;
    this._chart = root.querySelector('[data-tws-canvas]');
    root.querySelector('[data-tws-close]').addEventListener('click', () => this.close());
    root.addEventListener('click', (event) => this._onClick(event));
    root.addEventListener('submit', (event) => {
      event.preventDefault();
      this._transmit();
    });
    root.addEventListener('input', (event) => this._onInput(event));
    root.addEventListener('change', (event) => this._onInput(event));
    document.addEventListener('keydown', (event) => {
      if (!this.open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });
  }

  _onClick(event) {
    const close = event.target.closest('[data-tws-close]');
    if (close) return;
    const row = event.target.closest('[data-tws-asset]');
    if (row) {
      this.assetId = row.dataset.twsAsset;
      this._syncTicketDefaults(true);
      this.render();
      this._drawChart();
      return;
    }
    const side = event.target.closest('[data-tws-side]');
    if (side) {
      this.side = side.dataset.twsSide;
      if (this.orderType === 'take-profit') this.side = 'sell';
      this.render();
      return;
    }
    const settle = event.target.closest('[data-tws-settle]');
    if (settle) {
      // Settle Q has no bare-settle path. main.js wires onSettle to trySettle, the HUD guard.
      this.onSettle?.();
      return;
    }
    const suggest = event.target.closest('[data-tws-suggest]');
    if (suggest) {
      const { sl, tp } = this._bracketHints();
      if (suggest.dataset.twsSuggest === 'sl') this.stopLoss = String(sl);
      if (suggest.dataset.twsSuggest === 'tp') this.takeProfit = String(tp);
      if (suggest.dataset.twsSuggest === 'both') {
        this.stopLoss = String(sl);
        this.takeProfit = String(tp);
      }
      this.render();
      return;
    }
    const cancel = event.target.closest('[data-tws-cancel]');
    if (cancel) {
      this.onAction?.({
        type: 'cancel-order',
        orderId: cancel.dataset.twsCancel,
        venueId: this.venueId,
      });
    }
  }

  _onInput(event) {
    const el = event.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return;
    const name = el.name;
    if (name === 'orderType') {
      this.orderType = el.value;
      if (this.orderType === 'take-profit') this.side = 'sell';
    }
    if (name === 'tif') this.tif = el.value;
    if (name === 'qty') {
      const lot = marketLotSize(this.assetId);
      const raw = Math.max(lot, Math.round(Number(el.value) || lot));
      this.qty = Math.max(lot, Math.round(raw / lot) * lot);
    }
    if (name === 'limitPrice') this.limitPrice = Math.max(1, Math.round(Number(el.value) || 0));
    if (name === 'stopPrice') this.stopPrice = Math.max(1, Math.round(Number(el.value) || 0));
    if (name === 'stopLoss') this.stopLoss = el.value;
    if (name === 'takeProfit') this.takeProfit = el.value;
    this._paintTicketPreview();
  }

  _bracketHints() {
    const last = this.state?.markets?.prices?.[this.assetId] ?? this._tapeLast(this.assetId);
    const sl = Math.max(1, Math.round(last * 0.97));
    const tp = Math.max(sl + 1, Math.round(last * 1.05));
    return { last, sl, tp };
  }

  _syncTicketDefaults(forcePrices) {
    const lot = marketLotSize(this.assetId);
    if (!Number.isInteger(this.qty) || this.qty < lot) this.qty = lot;
    const last = this.state?.markets?.prices?.[this.assetId];
    if (forcePrices && Number.isFinite(last)) {
      this.limitPrice = last;
      this.stopPrice = last;
    }
  }

  _draft() {
    const sl = Number(this.stopLoss);
    const tp = Number(this.takeProfit);
    return {
      type: 'place-order',
      orderType: this.orderType,
      assetId: this.assetId,
      side: this.orderType === 'take-profit' ? 'sell' : this.side,
      units: this.qty,
      venueId: this.venueId,
      tif: this.tif,
      markPrice: Math.max(1, Math.round(this._tapeLast(this.assetId))),
      limitPrice: needsLimit(this.orderType) ? this.limitPrice : undefined,
      stopPrice: needsStop(this.orderType) ? this.stopPrice : undefined,
      stopLoss: Number.isInteger(sl) && sl > 0 ? sl : undefined,
      takeProfit: Number.isInteger(tp) && tp > 0 ? tp : undefined,
    };
  }

  _transmit() {
    const draft = this._draft();
    this.onAction?.(draft);
  }

  render() {
    if (!this.element || !this.state) return;
    const venue = stockExchangeOnBoard(this.city);
    const venueEl = this.element.querySelector('[data-tws-venue]');
    if (venueEl) venueEl.textContent = venue ? `${venue.id} · ${venue.districtName}` : 'no venue';
    this._paintClock();
    this.element.querySelector('[data-tws-account]').innerHTML = this._accountHtml();
    this.element.querySelector('[data-tws-watch]').innerHTML = this._watchHtml();
    this.element.querySelector('[data-tws-ticket]').innerHTML = this._ticketHtml();
    this.element.querySelector('[data-tws-positions]').innerHTML = this._positionsHtml();
    this.element.querySelector('[data-tws-orders]').innerHTML = this._ordersHtml();
    const news = this.element.querySelector('[data-tws-news]');
    if (news) news.innerHTML = this._newsHtml();
    this.element.querySelector('[data-tws-fills]').innerHTML = this._fillsHtml();
    this._paintWire();
    this._paintChartMeta();
    this._paintTicketPreview();
    this._tickLive();
  }

  _paintClock() {
    const clock = this.element?.querySelector('[data-tws-clock]');
    if (!clock || !this.state) return;
    const { day, frac, waiting } = this._tape();
    const secs = Math.max(1, Math.ceil((1 - frac) * (TAPE_MS_PER_DAY / 1000)));
    const hold = waiting ? ' / waiting on settle' : ` / ${secs}s left`;
    const actions = this.state.actionsRemaining;
    clock.textContent = `Q${this.state.quarter}/${this.state.quarters} · Day ${day + 1}/${DAYS_PER_QUARTER}${hold} · ${actions} action${actions === 1 ? '' : 's'}`;
  }

  _tickLive() {
    if (!this.element || !this.state) return;
    this._paintClock();
    const { day } = this._tape();
    for (const asset of this._deskAssets()) {
      const last = this._tapeLast(asset.id);
      const quote = quoteFromLast(asset.id, last, this.state?.markets);
      const lastEl = this.element.querySelector(`[data-tws-px="${asset.id}"]`);
      if (lastEl) lastEl.textContent = formatTickerPrice(last, asset.class, asset.id);
      void quote;
    }
    const focus = this._deskAssets().find((row) => row.id === this.assetId);
    const q = quoteFromLast(this.assetId, this._tapeLast(this.assetId), this.state?.markets);
    if (q && focus) {
      const tb = this.element.querySelector('[data-tws-ticket-bid]');
      const tl = this.element.querySelector('[data-tws-ticket-last]');
      const ta = this.element.querySelector('[data-tws-ticket-ask]');
      if (tb) tb.textContent = formatTickerPrice(q.bid, focus.class, this.assetId);
      if (tl) tl.textContent = formatTickerPrice(q.last, focus.class, this.assetId);
      if (ta) ta.textContent = formatTickerPrice(q.ask, focus.class, this.assetId);
    }
    this._paintChartMeta();
    if (day !== this._lastTickDay) {
      this._lastTickDay = day;
      this._paintWire();
      const news = this.element.querySelector('[data-tws-news]');
      if (news) news.innerHTML = this._newsHtml();
    }
    for (const asset of this._deskAssets()) {
      const last = this._tapeLast(asset.id);
      const mark = this.state.markets?.prices?.[asset.id] ?? last;
      const bp = mark > 0 ? Math.round(((last - mark) / mark) * 10000) : 0;
      const dollars = last - mark;
      const chg = this.element.querySelector(`[data-tws-chg="${asset.id}"]`);
      const cash = this.element.querySelector(`[data-tws-chgd="${asset.id}"]`);
      if (chg) {
        chg.textContent = signedPct(bp);
        chg.className = `num ${clsOf(bp)}`;
      }
      if (cash) {
        cash.textContent = signedMoney(dollars, { exact: true });
        cash.className = `num ${clsOf(bp)}`;
      }
    }
    this._paintLivePortfolio();
    void TAPE_MS_PER_DAY;
    this._maybeScanTape();
  }

  _lotTapePnl(lot) {
    const tape = this._tapeLast(lot.id);
    const held = lot.held ?? 0;
    const avg = lot.avgCost ?? 0;
    const mkt = held * tape;
    const pnl = held > 0 ? (tape - avg) * held : 0;
    const bp = avg > 0 ? Math.round(((tape - avg) / avg) * 10000) : 0;
    return { tape, mkt, pnl, bp };
  }

  _paintLivePortfolio() {
    if (!this.element || !this.state) return;
    const lots = tradeLotsForCard(this.state);
    let book = 0;
    let pnl = 0;
    let basis = 0;
    for (const lot of lots) {
      if (lot.held <= 0) continue;
      const live = this._lotTapePnl(lot);
      book += live.mkt;
      pnl += live.pnl;
      basis += lot.costBasis || 0;
      const row = this.element.querySelector(`[data-tws-pos="${lot.id}"]`);
      if (!row) continue;
      const lastEl = row.querySelector('[data-tws-pos-last]');
      const mktEl = row.querySelector('[data-tws-pos-mkt]');
      const dolEl = row.querySelector('[data-tws-pos-pnl]');
      const pctEl = row.querySelector('[data-tws-pos-pct]');
      const tone = clsOf(live.bp);
      if (lastEl) lastEl.textContent = formatTickerPrice(live.tape, lot.class, lot.id);
      if (mktEl) mktEl.textContent = moneyExact(live.mkt);
      if (dolEl) {
        dolEl.textContent = signedMoney(live.pnl, { exact: true });
        dolEl.className = `num ${tone}`;
      }
      if (pctEl) {
        pctEl.textContent = signedPct(live.bp);
        pctEl.className = `num ${tone}`;
      }
    }
    const uBp = basis > 0 ? Math.round((pnl / basis) * 10000) : 0;
    const cash = this.state.cash ?? 0;
    const navEl = this.element.querySelector('[data-tws-nav] b');
    const uplEl = this.element.querySelector('[data-tws-upl] b');
    const nlvEl = this.element.querySelector('[data-tws-nlv] b');
    const uplWrap = this.element.querySelector('[data-tws-upl]');
    if (navEl) navEl.textContent = moneyExact(book);
    if (nlvEl) nlvEl.textContent = moneyExact(cash + book);
    if (uplEl) {
      uplEl.innerHTML = `${signedMoney(pnl, { exact: true })} <span class="tws__metric-sub">${signedPct(uBp)}</span>`;
    }
    if (uplWrap) {
      uplWrap.classList.toggle('tws__metric--up', pnl > 0);
      uplWrap.classList.toggle('tws__metric--down', pnl < 0);
    }
  }

  _maybeScanTape() {
    if (!this.open || !this.state) return;
    const now = performance.now();
    if (now - (this._lastScanAt ?? 0) < 250) return;
    const working = (this.state.markets?.orders ?? []).filter((row) => row.status === 'working');
    if (!working.length) return;
    const marks = {};
    let hit = false;
    for (const order of working) {
      const tape = Math.max(1, Math.round(this._tapeLast(order.assetId)));
      marks[order.assetId] = tape;
      if (isLimitMarketable(order, tape)) hit = true;
    }
    if (!hit) return;
    this._lastScanAt = now;
    this.onAction?.({ type: 'scan-orders', marks });
  }

  _accountHtml() {
    const a = accountSummary(this.state, 'player');
    const lots = tradeLotsForCard(this.state);
    let book = 0;
    let pnl = 0;
    let basis = 0;
    for (const lot of lots) {
      if (lot.held <= 0) continue;
      const live = this._lotTapePnl(lot);
      book += live.mkt;
      pnl += live.pnl;
      basis += lot.costBasis || 0;
    }
    const uBp = basis > 0 ? Math.round((pnl / basis) * 10000) : 0;
    const uCls = pnl > 0 ? 'tws__metric--up' : pnl < 0 ? 'tws__metric--down' : '';
    return `
      <div class="tws__metric"><small>Cash</small><b>${moneyExact(a.cash)}</b></div>
      <div class="tws__metric"><small>Reserved</small><b>${moneyExact(a.reserved)}</b></div>
      <div class="tws__metric"><small>Buying power</small><b>${moneyExact(a.free)}</b></div>
      <div class="tws__metric" data-tws-nav><small>Listed NAV</small><b>${moneyExact(book)}</b></div>
      <div class="tws__metric ${uCls}" data-tws-upl><small>Unrealized</small><b>${signedMoney(pnl, { exact: true })} <span class="tws__metric-sub">${signedPct(uBp)}</span></b></div>
      <div class="tws__metric" data-tws-nlv><small>Total NAV</small><b>${moneyExact((this.state.cash ?? 0) + book)}</b></div>
      <div class="tws__metric"><small>Working</small><b>${a.working}</b></div>
    `;
  }

  _watchHtml() {
    const lots = tradeLotsForCard(this.state);
    const groups = [
      ['Equities', 'equity'],
      ['Crypto', 'crypto'],
      ['Commodities', 'commodity'],
    ];
    return groups.map(([label, cls]) => {
      const rows = lots.filter((lot) => lot.class === cls).map((lot) => {
        const on = lot.id === this.assetId ? 'is-on' : '';
        const last = this._tapeLast(lot.id);
        const tapeBp = lot.price > 0 ? Math.round(((last - lot.price) / lot.price) * 10000) : 0;
        const tapeCash = last - lot.price;
        const tone = clsOf(tapeBp);
        return `<tr class="${on}" data-tws-asset="${escapeHtml(lot.id)}">
          <td><span class="sym">${escapeHtml(lot.id)}</span><div class="cls">${escapeHtml(lot.name)}</div></td>
          <td class="num" data-tws-px="${escapeHtml(lot.id)}">${formatTickerPrice(last, lot.class, lot.id)}</td>
          <td class="num ${tone}" data-tws-chgd="${escapeHtml(lot.id)}">${signedMoney(tapeCash, { exact: true })}</td>
          <td class="num ${tone}" data-tws-chg="${escapeHtml(lot.id)}">${signedPct(tapeBp)}</td>
          <td class="num">${lot.held || '—'}</td>
        </tr>`;
      }).join('');
      return `<div class="tws-watch__group">${label}</div>
        <table>
          <thead><tr><th>Instrument</th><th>Last</th><th>$</th><th>%</th><th>Pos</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }).join('');
  }

  _ticketHtml() {
    const asset = this._deskAssets().find((row) => row.id === this.assetId);
    const quote = quoteFromLast(this.assetId, this._tapeLast(this.assetId), this.state?.markets);
    const lot = marketLotSize(this.assetId);
    const typeOpts = TYPES.map((t) =>
      `<option value="${t.id}" ${t.id === this.orderType ? 'selected' : ''}>${t.label}</option>`).join('');
    return `
      <div class="tws-ticket__sides">
        <button type="button" class="tws-side is-buy ${this.side === 'buy' ? 'is-on' : ''}" data-tws-side="buy">BUY</button>
        <button type="button" class="tws-side is-sell ${this.side === 'sell' ? 'is-on' : ''}" data-tws-side="sell">SELL</button>
      </div>
      <div class="tws-quote">
        <div><small>Bid</small><span class="bid" data-tws-ticket-bid>${quote ? formatTickerPrice(quote.bid, asset?.class, this.assetId) : '—'}</span></div>
        <div><small>Last</small><span data-tws-ticket-last>${quote ? formatTickerPrice(quote.last, asset?.class, this.assetId) : '—'}</span></div>
        <div><small>Ask</small><span class="ask" data-tws-ticket-ask>${quote ? formatTickerPrice(quote.ask, asset?.class, this.assetId) : '—'}</span></div>
      </div>
      <p class="tws-bracket__help">Tape last moves with the day. <strong>Fills use the official mark</strong> ${formatTickerPrice(this.state.markets?.prices?.[this.assetId], asset?.class, this.assetId)}.</p>
      <div class="tws-field"><label>Symbol</label><input value="${escapeHtml(this.assetId)}" readonly></div>
      <div class="tws-field"><label>Type</label><select name="orderType">${typeOpts}</select></div>
      <div class="tws-field"><label>Qty · batch ${lot}</label><input name="qty" type="number" min="${lot}" step="${lot}" value="${this.qty}"></div>
      <div class="tws-field"><label>Limit</label><input name="limitPrice" type="number" min="1" step="1" value="${this.limitPrice}" ${needsLimit(this.orderType) ? '' : 'disabled'}></div>
      <div class="tws-field"><label>Stop</label><input name="stopPrice" type="number" min="1" step="1" value="${this.stopPrice}" ${needsStop(this.orderType) ? '' : 'disabled'}></div>
      <div class="tws-field"><label>TIF</label>
        <select name="tif">
          <option value="gtc" ${this.tif === 'gtc' ? 'selected' : ''}>GTC</option>
          <option value="day" ${this.tif === 'day' ? 'selected' : ''}>DAY · this Q</option>
        </select>
      </div>
      ${this._bracketHtml()}
      <p class="tws-preview" data-tws-preview></p>
      <button class="tws-transmit" type="submit">Transmit</button>
      <div class="tws-aux">
        <button class="tws-ghost" type="button" data-tws-side="buy">Bid · buy</button>
        <button class="tws-ghost" type="button" data-tws-side="sell">Ask · sell</button>
      </div>
    `;
  }

  _bracketHtml() {
    const { last, sl, tp } = this._bracketHints();
    if (this.side !== 'buy') {
      return `<div class="tws-bracket tws-bracket--off">
        <div class="tws-bracket__h">Stop loss · take profit</div>
        <p>Brackets attach to a <strong>BUY</strong>. Set a falling stop or rising target.</p>
      </div>`;
    }
    return `<div class="tws-bracket">
      <div class="tws-bracket__h">Protect this long
        <button type="button" class="tws-ghost" data-tws-suggest="both">Fill −3% / +5%</button>
      </div>
      <p class="tws-bracket__help">Optional; leave blank to skip. Last is ${formatTickerPrice(last, this._deskAssets().find((a) => a.id === this.assetId)?.class, this.assetId)}.</p>
      <div class="tws-field tws-field--stack">
        <label for="tws-sl">Stop loss · sell if last ≤</label>
        <div class="tws-field__row">
          <input id="tws-sl" name="stopLoss" type="number" min="1" step="1"
            placeholder="${sl}" value="${escapeHtml(this.stopLoss)}" inputmode="numeric">
          <button type="button" class="tws-ghost" data-tws-suggest="sl">Use ${sl}</button>
        </div>
      </div>
      <div class="tws-field tws-field--stack">
        <label for="tws-tp">Take profit · sell if last ≥</label>
        <div class="tws-field__row">
          <input id="tws-tp" name="takeProfit" type="number" min="1" step="1"
            placeholder="${tp}" value="${escapeHtml(this.takeProfit)}" inputmode="numeric">
          <button type="button" class="tws-ghost" data-tws-suggest="tp">Use ${tp}</button>
        </div>
      </div>
    </div>`;
  }

  _paintTicketPreview() {
    const el = this.element?.querySelector('[data-tws-preview]');
    if (!el || !this.city || !this.state) return;
    const draft = this._draft();
    const check = draft.type === 'trade'
      ? null
      : canPlaceOrder(this.city, this.state, draft);
    const last = this.state.markets?.prices?.[this.assetId] ?? 0;
    const px = draft.limitPrice ?? last;
    const notional = this.qty * px;
    const mark = this.state.markets?.prices?.[this.assetId] ?? last;
    const sl = Number(this.stopLoss);
    const tp = Number(this.takeProfit);
    const bits = [];
    if (draft.side === 'buy' && Number.isInteger(sl) && sl > 0) {
      bits.push(sl >= mark ? `SL ${sl} must be below mark ${Math.round(mark)}` : `SL sell ≤ ${sl}`);
    }
    if (draft.side === 'buy' && Number.isInteger(tp) && tp > 0) {
      bits.push(tp <= mark ? `TP ${tp} must be above mark ${Math.round(mark)}` : `TP sell ≥ ${tp}`);
    }
    if (draft.orderType === 'market') {
      const mkt = canTrade(this.city, this.state, {
        type: 'trade',
        assetId: draft.assetId,
        side: draft.side,
        units: draft.units,
        venueId: draft.venueId,
      });
      if (!mkt.ok) {
        el.textContent = mkt.reason;
        return;
      }
      el.textContent = `MKT ${draft.side.toUpperCase()} ${this.qty} ${this.assetId} · ${moneyExact(this.qty * mark)} mark · no action${bits.length ? ` — ${bits.join('; ')}` : ''}`;
      return;
    }
    if (check && !check.ok) {
      el.textContent = check.reason;
      return;
    }
    if (isLimitMarketable(draft, mark)) {
      el.textContent = `${draft.orderType.toUpperCase()} ${draft.side.toUpperCase()} ${this.qty} ${this.assetId} · fills now at mark ${moneyExact(mark)}${bits.length ? ` — ${bits.join('; ')}` : ''}`;
      return;
    }
    const wait = draft.side === 'buy'
      ? `rests until last ≤ ${moneyExact(px)} at settle`
      : `rests until last ≥ ${moneyExact(px)} at settle`;
    el.textContent = `${draft.orderType.toUpperCase()} ${draft.side.toUpperCase()} ${this.qty} ${this.assetId} · ${moneyExact(notional)} reserved, no action · ${wait}${bits.length ? ` — ${bits.join('; ')}` : ''}`;
  }

  _positionsHtml() {
    const lots = tradeLotsForCard(this.state).filter((lot) => lot.held > 0);
    if (!lots.length) {
      return `<table><thead><tr>
        <th>Sym</th><th>Qty</th><th>Avg</th><th>Last</th><th>Mkt</th><th>P&amp;L $</th><th>P&amp;L %</th>
      </tr></thead><tbody><tr><td colspan="7" style="text-align:left;color:#8b95a5">Flat · no positions</td></tr></tbody></table>`;
    }
    const rows = lots.map((lot) => {
      const live = this._lotTapePnl(lot);
      const d = clsOf(live.bp);
      return `<tr data-tws-pos="${escapeHtml(lot.id)}">
        <td>${escapeHtml(lot.id)}</td>
        <td class="num">${lot.held}</td>
        <td class="num">${formatTickerPrice(lot.avgCost, lot.class, lot.id)}</td>
        <td class="num" data-tws-pos-last>${formatTickerPrice(live.tape, lot.class, lot.id)}</td>
        <td class="num" data-tws-pos-mkt>${moneyExact(live.mkt)}</td>
        <td class="num ${d}" data-tws-pos-pnl>${signedMoney(live.pnl, { exact: true })}</td>
        <td class="num ${d}" data-tws-pos-pct>${signedPct(live.bp)}</td>
      </tr>`;
    }).join('');
    return `<table><thead><tr>
      <th>Sym</th><th>Qty</th><th>Avg</th><th>Last</th><th>Mkt</th><th>P&amp;L $</th><th>P&amp;L %</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  }

  _ordersHtml() {
    const orders = (this.state.markets?.orders ?? []).filter((o) => o.status === 'working');
    if (!orders.length) {
      return `<table><thead><tr>
        <th>Sym</th><th>Side</th><th>Type</th><th>Qty</th><th>Px</th><th>TIF</th><th></th>
      </tr></thead><tbody><tr><td colspan="7" style="text-align:left;color:#5c6573">No working orders</td></tr></tbody></table>`;
    }
    const rows = orders.map((o) => `<tr>
      <td>${escapeHtml(o.assetId)}</td>
      <td>${escapeHtml(o.side)}</td>
      <td>${escapeHtml(o.orderType)}</td>
      <td>${o.units}</td>
      <td>${o.limitPrice ?? o.stopPrice ?? '—'}</td>
      <td>${escapeHtml(o.tif)}</td>
      <td><button type="button" data-tws-cancel="${escapeHtml(o.id)}">Cancel</button></td>
    </tr>`).join('');
    return `<table><thead><tr>
      <th>Sym</th><th>Side</th><th>Type</th><th>Qty</th><th>Px</th><th>TIF</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  }

  _paintWire() {
    const el = this.element?.querySelector('[data-tws-wire]');
    if (!el || !this.state) return;
    const tape = this._tape();
    const wire = deskWire(this.state.seed, this.state.quarter, tape.day, this.assetId);
    const divs = this.state.markets?.lastDividends?.lines ?? [];
    const tail = divs.length
      ? `Div ${divs[0].assetId} ${moneyExact(divs[0].amount)}${divs.length > 1 ? ` +${divs.length - 1}` : ''}`
      : wire.focus.headline;
    el.innerHTML = `<strong>${escapeHtml(wire.year.scenario.headline)}</strong>
      · <em>${escapeHtml(wire.quarter.beat.title)} — ${escapeHtml(wire.quarter.scenario.headline)}</em>
      · ${escapeHtml(tail)}`;
  }

  _newsHtml() {
    if (!this.state) return '';
    const tape = this._tape();
    const wire = deskWire(this.state.seed, this.state.quarter, tape.day, this.assetId);
    const items = [wire.focus, ...wire.extras].map((row) =>
      `<div><b>${escapeHtml(row.kind ?? 'note')}</b> · ${escapeHtml(row.headline)}</div>`).join('');
    return `<div class="tws-news">${items}</div>`;
  }

  _fillsHtml() {
    const fills = [...(this.state.markets?.fills ?? [])].slice(-12).reverse();
    if (!fills.length) {
      return `<table><thead><tr>
        <th>Q</th><th>Sym</th><th>Side</th><th>Qty</th><th>Px</th>
      </tr></thead><tbody><tr><td colspan="5" style="text-align:left;color:#5c6573">No prints this run</td></tr></tbody></table>`;
    }
    const rows = fills.map((f) => `<tr>
      <td>Q${f.quarter}</td>
      <td>${escapeHtml(f.assetId)}</td>
      <td>${escapeHtml(f.side)}</td>
      <td>${f.units}</td>
      <td>${moneyExact(f.price)}</td>
    </tr>`).join('');
    return `<table><thead><tr>
      <th>Q</th><th>Sym</th><th>Side</th><th>Qty</th><th>Px</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  }

  _paintChartMeta() {
    const meta = this.element?.querySelector('[data-tws-chart-meta]');
    if (!meta || !this.state) return;
    const lot = tradeLotsForCard(this.state).find((row) => row.id === this.assetId);
    if (!lot) { meta.textContent = ''; return; }
    const tape = this._tape();
    const last = tape.last;
    const d = clsOf(last - lot.price);
    const ma50 = smaValue(tape.bars, 50, tape.bars.length - 1);
    const ma200 = smaValue(tape.bars, 200, tape.bars.length - 1);
    meta.innerHTML = `<strong>${escapeHtml(lot.id)}</strong>${escapeHtml(lot.name)}
      · ${formatTickerPrice(last, lot.class, lot.id)} / Day ${tape.day + 1}/${DAYS_PER_QUARTER}
      · <span style="color:#7dceb0">MA50 ${ma50 ? Math.round(ma50) : '—'}</span>
      / <span style="color:#9aa6ff">MA200 ${ma200 ? Math.round(ma200) : '—'}</span>
      ${tape.waiting ? '<span class="dn"> / tape held; continue at settle</span>' : ' / live'}`;
  }

  _drawChart() {
    const canvas = this._chart;
    if (!canvas || !this.state) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(120, Math.floor(rect.width));
    const h = Math.max(80, Math.floor(rect.height - 22));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0d11';
    ctx.fillRect(0, 0, w, h);

    const tape = this._tape();
    const bars = tape.bars.slice(-120);
    if (!bars.length) return;

    const padL = 8;
    const padR = 48;
    const padT = 12;
    const padB = 36;
    const volH = 22;
    const lows = bars.map((b) => b.l);
    const highs = bars.map((b) => b.h);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const span = Math.max(1, max - min);
    const innerW = w - padL - padR;
    const innerH = h - padT - padB - volH;
    const maxV = Math.max(1, ...bars.map((b) => b.v));
    const slot = innerW / bars.length;
    const yOf = (px) => padT + (max - px) / span * innerH;

    ctx.strokeStyle = '#222833';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = padT + (innerH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      const px = max - span * i / 4;
      ctx.fillStyle = '#5c6573';
      ctx.font = '10px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(String(Math.round(px)), w - padR + 6, y + 3);
    }

    const drawMa = (period, color, width) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      let started = false;
      for (let i = 0; i < bars.length; i += 1) {
        const sma = smaValue(bars, period, i);
        if (sma == null) continue;
        const x = padL + slot * i + slot / 2;
        if (!started) { ctx.moveTo(x, yOf(sma)); started = true; }
        else ctx.lineTo(x, yOf(sma));
      }
      ctx.stroke();
    };
    drawMa(50, '#7dceb0', 1.4);
    drawMa(200, '#9aa6ff', 1.7);

    bars.forEach((bar, i) => {
      const x = padL + slot * i + slot / 2;
      const up = bar.c >= bar.o;
      ctx.strokeStyle = up ? '#3dcc8a' : '#ef5b5b';
      ctx.fillStyle = up ? '#3dcc8a' : '#ef5b5b';
      ctx.beginPath();
      ctx.moveTo(x, yOf(bar.h));
      ctx.lineTo(x, yOf(bar.l));
      ctx.stroke();
      const bodyTop = yOf(Math.max(bar.o, bar.c));
      const bodyBot = yOf(Math.min(bar.o, bar.c));
      const bw = Math.max(2, slot * 0.62);
      ctx.fillRect(x - bw / 2, bodyTop, bw, Math.max(1, bodyBot - bodyTop));
      const vh = (bar.v / maxV) * (volH - 2);
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x - bw / 2, h - padB + volH - vh, bw, Math.max(1, vh));
      ctx.globalAlpha = 1;
    });

    const lastPx = bars.at(-1)?.c;
    if (Number.isFinite(lastPx)) {
      const y = yOf(lastPx);
      ctx.strokeStyle = '#f08a24aa';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f08a24';
      ctx.fillRect(w - padR, y - 8, padR - 4, 16);
      ctx.fillStyle = '#1a0d02';
      ctx.font = '10px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.round(lastPx)), w - padR / 2 - 2, y + 3);
    }

    ctx.fillStyle = '#5c6573';
    ctx.font = '9px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    const step = bars.length > 60 ? 15 : 5;
    for (let i = 0; i < bars.length; i += step) {
      const bar = bars[i];
      const x = padL + slot * i + slot / 2;
      const label = bar.q != null ? `Q${bar.q}d${(bar.d ?? i) + 1}` : String(i + 1);
      ctx.fillText(label, x, h - 6);
    }
  }
}
