// Script Lord — CRT wholesale desk. Text game first. Graphics are plates only.

import { moneyExact } from '../core/format.js';
import {
  ASSET,
  CITIES,
  DAYS,
  HOME_CITY,
  LAWYER_COST,
  LAWYER_WASH_BP,
  PRODUCTS,
  START_CASH,
  START_DEBT,
  WASH_BP,
  avgOf,
  borrow,
  buy,
  cityOf,
  cityPayout,
  cityRumor,
  deposit,
  fareTo,
  heldUnits,
  hireLawyer,
  lastError,
  maxBuy,
  maxSell,
  netWorth,
  nextHoldTier,
  priceTag,
  remandOnBoard,
  repay,
  resolveEvent,
  retainCounsel,
  retire,
  sell,
  startCareer,
  stockMark,
  unrealized,
  upgradeHold,
  washPct,
  withdraw,
  jet,
} from '../core/script-lord.js';

export { remandOnBoard };

function el(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
}

function dollars(value) {
  return moneyExact(value);
}

function productIcon(id) {
  return `${ASSET}/${id}.jpg`;
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function tip(text) {
  return ` data-tip="${escapeAttr(text)}"`;
}

export class ScriptLord {
  constructor(host, { onAction, onClose } = {}) {
    this.host = host;
    this.onAction = onAction;
    this.onClose = onClose;
    this.element = null;
    this.city = null;
    this.state = null;
    this.seed = 1;
    this.career = null;
    this.view = 'boot';
    this.qty = 1;
    this.amount = 0;
    this._onKey = (event) => this._key(event);
  }

  get open() {
    return Boolean(this.element && !this.element.hidden);
  }

  show(city, state, seed = 1) {
    this.city = city;
    this.state = state;
    this.seed = Number(seed) || 1;
    if (!this.element) this._mount();
    this.element.hidden = false;
    if (!this.career) this.view = 'boot';
    else if (this.career.phase === 'ended') this.view = 'ended';
    else this.view = 'play';
    this._paint();
  }

  update(city, state) {
    this.city = city;
    this.state = state;
    if (this.open) this._paint();
  }

  close() {
    this._flushCityPayout();
    if (this.element) this.element.hidden = true;
    this.onClose?.();
  }

  destroy() {
    this.close();
    window.removeEventListener('keydown', this._onKey);
    this.element?.remove();
    this.element = null;
    this.career = null;
  }

  _mount() {
    this.element = el(`
      <section class="slrd" role="dialog" aria-label="Script Lord">
        <header class="slrd__bar">
          <i class="slrd__pip" aria-hidden="true"></i>
          <span class="slrd__brand">Script Lord</span>
          <span class="slrd__tag">Licensed wholesale</span>
          <span class="slrd__spacer"></span>
          <span class="slrd__chip" data-sl-day></span>
          <span class="slrd__chip" data-sl-city></span>
          <button type="button" class="slrd__x" data-sl="close" aria-label="Close"${tip('Close the desk. The career stays on this run until you bank or abandon.')}>✕</button>
        </header>
        <div class="slrd__crt">
          <div class="slrd__scan" aria-hidden="true"></div>
          <div class="slrd__boot" data-sl-boot hidden>
            <figure class="slrd__hero">
              <img src="${ASSET}/boot-hero.jpg" alt="">
            </figure>
            <div class="slrd__ticket">
              <p class="slrd__eyebrow">Capital-city circuit · 30 days</p>
              <h2>Script Lord</h2>
              <p>You are a licensed pharmaceutical wholesaler. Buy cheap tenders, jet, sell into shortage. Debt compounds 10% every hop.</p>
              <p class="slrd__start-line">Start with ${dollars(START_CASH)} cash and ${dollars(START_DEBT)} on the book. Hold 100.</p>
              <div class="slrd__row">
                <button type="button" class="slrd__btn slrd__btn--go" data-sl="start"${tip('Open a 30-day wholesale licence. $2,000 cash, $5,500 on the compound desk.')}>Start career</button>
              </div>
              <ol class="slrd__howto">
                <li>Read the board. CHEAP means buy. SPIKE means sell. Keep enough cash for airfare.</li>
                <li>Jet to another capital — that spends a day and rolls a new board.</li>
                <li>Bank cash in Melbourne — muggers cannot touch it. The compound desk comes knocking there too.</li>
                <li>Retire any time, or last until day ${DAYS}. The wash lets you keep ${Math.round(WASH_BP / 100)}% of net worth, or ${Math.round(LAWYER_WASH_BP / 100)}% with a lawyer on retainer.</li>
                <li>AFP can treat the circuit as trafficking. A raid wipes the career and resets city NAV to what you started the run with. A lawyer halves the hop chance.</li>
              </ol>
            </div>
          </div>
          <div class="slrd__desk" data-sl-desk hidden>
            <div class="slrd__status" data-sl-status></div>
            <div class="slrd__book" data-sl-book></div>
            <div class="slrd__log" data-sl-log></div>
            <div class="slrd__verbs">
              <button type="button" class="slrd__btn" data-sl="open-jet"${tip('Fly to another capital. Costs one day, airfare, and 10% interest on the debt. J')}>Jet</button>
              <button type="button" class="slrd__btn" data-sl="open-bank"${tip('Melbourne only. Park cash so a taxi-rank lift cannot touch it.')}>Bank</button>
              <button type="button" class="slrd__btn" data-sl="open-loan"${tip('Melbourne only. Borrow or repay the compound desk. They collect from day 5.')}>Loan</button>
              <button type="button" class="slrd__btn" data-sl="hold"${tip('Buy a bigger hold. Satchel 100, crate 150, then the cold-chain van 200.')}>Hold+</button>
              <button type="button" class="slrd__btn" data-sl="lawyer"${tip(`Retainer ${dollars(LAWYER_COST)}. TGA fines shrink, and the city wash rises from ${Math.round(WASH_BP / 100)}% to ${Math.round(LAWYER_WASH_BP / 100)}%.`)}>Lawyer</button>
              <button type="button" class="slrd__btn slrd__btn--warn" data-sl="retire"${tip('Close the licence now. Unsold stock is marked to the current ask, then washed into city cash.')}>Retire</button>
            </div>
          </div>
          <div class="slrd__ended" data-sl-ended hidden>
            <h2 data-sl-end-title>Books closed</h2>
            <p data-sl-end-copy></p>
            <dl class="slrd__tally" data-sl-tally></dl>
            <div class="slrd__row">
              <button type="button" class="slrd__btn slrd__btn--go" data-sl="payout"${tip('Move the washed settlement into District Deck cash and close the desk.')}>Bank takings</button>
              <button type="button" class="slrd__btn" data-sl="counsel"${tip(`Pay ${dollars(LAWYER_COST)} now so counsel can lift the wash to ${Math.round(LAWYER_WASH_BP / 100)}% before you bank.`)}>Retain counsel</button>
              <button type="button" class="slrd__btn" data-sl="abandon"${tip('Throw away this settlement and start a fresh 30-day career.')}>New career</button>
            </div>
          </div>
          <div class="slrd__modal" data-sl-modal hidden>
            <div class="slrd__panel" data-sl-panel></div>
          </div>
          <div class="slrd__tip" data-sl-tip hidden></div>
        </div>
      </section>
    `);
    this.host.append(this.element);
    this.element.addEventListener('click', (event) => this._click(event));
    this.element.addEventListener('input', (event) => this._input(event));
    this.element.addEventListener('pointerover', (event) => this._tipOver(event));
    this.element.addEventListener('pointerout', (event) => this._tipOut(event));
    window.addEventListener('keydown', this._onKey);
  }

  _click(event) {
    const node = event.target.closest('[data-sl]');
    if (!node || !this.open) return;
    const act = node.dataset.sl;
    const id = node.dataset.id;
    if (act === 'close') {
      this.close();
      return;
    }
    if (act === 'start') {
      this.career = startCareer(this.seed);
      this.view = 'play';
      this._paint();
      return;
    }
    if (act === 'payout') {
      this._payout();
      return;
    }
    if (act === 'abandon') {
      this.career = null;
      this.view = 'boot';
      this._paint();
      return;
    }
    if (act === 'counsel') {
      if (!this.career) return;
      this._apply(retainCounsel(this.career), { after: () => { this.view = 'ended'; } });
      return;
    }
    if (!this.career) return;
    if (act === 'buy' || act === 'buy-max') {
      const qty = act === 'buy-max' ? maxBuy(this.career, id) : this._qtyFor(node);
      this._apply(buy(this.career, id, qty));
      return;
    }
    if (act === 'sell' || act === 'sell-max') {
      const qty = act === 'sell-max' ? maxSell(this.career, id) : this._qtyFor(node);
      this._apply(sell(this.career, id, qty));
      return;
    }
    if (act === 'open-jet') {
      this.view = 'jet';
      this._paint();
      return;
    }
    if (act === 'open-bank') {
      this.view = 'bank';
      this.amount = this.career.cash;
      this._paint();
      return;
    }
    if (act === 'open-loan') {
      this.view = 'loan';
      this.amount = this.career.debt;
      this._paint();
      return;
    }
    if (act === 'back') {
      this.view = 'play';
      this._paint();
      return;
    }
    if (act === 'jet-to') {
      this._apply(jet(this.career, id), { after: () => { this.view = 'play'; } });
      return;
    }
    if (act === 'deposit') {
      this._apply(deposit(this.career, this._amount()), { after: () => { this.view = 'play'; } });
      return;
    }
    if (act === 'withdraw') {
      this._apply(withdraw(this.career, this._amount()), { after: () => { this.view = 'play'; } });
      return;
    }
    if (act === 'borrow') {
      this._apply(borrow(this.career, this._amount()), { after: () => { this.view = 'play'; } });
      return;
    }
    if (act === 'repay') {
      this._apply(repay(this.career, this._amount()), { after: () => { this.view = 'play'; } });
      return;
    }
    if (act === 'hold') {
      this._apply(upgradeHold(this.career));
      return;
    }
    if (act === 'lawyer') {
      this._apply(hireLawyer(this.career));
      return;
    }
    if (act === 'retire') {
      this._apply(retire(this.career), { after: () => { this.view = 'ended'; } });
      return;
    }
    if (act === 'choice') {
      this._apply(resolveEvent(this.career, id), { after: () => { this.view = 'play'; } });
    }
  }

  _qtyFor(node) {
    const raw = Number(node.dataset.qty);
    if (Number.isFinite(raw) && raw > 0) return raw;
    return Math.max(1, Math.round(Number(this.qty) || 1));
  }

  _amount() {
    const field = this.element?.querySelector('[data-sl-amount]');
    const raw = Number(field?.value ?? this.amount);
    return Math.max(0, Math.round(raw || 0));
  }

  _input(event) {
    if (event.target.matches('[data-sl-qty]')) {
      this.qty = Math.max(1, Math.round(Number(event.target.value) || 1));
    }
    if (event.target.matches('[data-sl-amount]')) {
      this.amount = Math.max(0, Math.round(Number(event.target.value) || 0));
    }
  }

  _tipNode(target) {
    return target instanceof Element ? target.closest('[data-tip]') : null;
  }

  _tipOver(event) {
    const node = this._tipNode(event.target);
    if (!node) return;
    const text = node.getAttribute('data-tip');
    const tipEl = this.element?.querySelector('[data-sl-tip]');
    if (!text || !tipEl) return;
    tipEl.hidden = false;
    tipEl.textContent = text;
    const host = this.element.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    const tipBox = tipEl.getBoundingClientRect();
    let left = box.left + box.width / 2 - host.left - tipBox.width / 2;
    let top = box.top - host.top - tipBox.height - 8;
    if (top < 6) top = box.bottom - host.top + 8;
    left = Math.max(8, Math.min(left, host.width - tipBox.width - 8));
    tipEl.style.left = `${Math.round(left)}px`;
    tipEl.style.top = `${Math.round(top)}px`;
  }

  _tipOut(event) {
    if (this._tipNode(event.relatedTarget)) return;
    const tipEl = this.element?.querySelector('[data-sl-tip]');
    if (tipEl) tipEl.hidden = true;
  }

  _apply(next, { after } = {}) {
    this.career = next;
    if (this.career.phase === 'ended') {
      this.view = 'ended';
      if (this.career.endReason === 'raided') {
        this.onAction?.({ type: 'script-lord-shift', op: 'confiscate' });
      }
    } else if (this.career.phase === 'event') this.view = 'play';
    else after?.();
    this._paint();
  }

  _flushCityPayout() {
    if (this.career?.phase !== 'ended') return;
    const amount = cityPayout(this.career);
    this.career = null;
    this.view = 'boot';
    if (amount > 0) {
      this.onAction?.({ type: 'script-lord-shift', op: 'payout', amount });
    }
  }

  _payout() {
    this.close();
  }

  _key(event) {
    if (!this.open) return;
    if (event.target instanceof HTMLElement && event.target.matches('input, textarea')) {
      if (event.key === 'Escape') event.target.blur();
      return;
    }
    if (event.key === 'Escape') {
      if (this.career?.phase === 'event') return;
      if (this.view === 'jet' || this.view === 'bank' || this.view === 'loan') {
        this.view = 'play';
        this._paint();
        event.preventDefault();
        return;
      }
      this.close();
      event.preventDefault();
      return;
    }
    if (!this.career || this.career.phase !== 'play' || this.view !== 'play') return;
    const digit = event.key >= '1' && event.key <= '8' ? Number(event.key) : 0;
    if (digit) {
      const product = PRODUCTS[digit - 1];
      if (event.shiftKey) this._apply(sell(this.career, product.id, this.qty));
      else this._apply(buy(this.career, product.id, this.qty));
      event.preventDefault();
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'j') {
      this.view = 'jet';
      this._paint();
      event.preventDefault();
    }
  }

  _paint() {
    const root = this.element;
    if (!root) return;
    const career = this.career;
    const showBoot = this.view === 'boot' && (!career || career.phase !== 'ended');
    const showEnded = this.view === 'ended' || career?.phase === 'ended';
    const showDesk = Boolean(career) && career.phase !== 'ended' && !showBoot;
    const showModal = showDesk && (
      this.view === 'jet' || this.view === 'bank' || this.view === 'loan' || career.phase === 'event'
    );
    root.querySelector('[data-sl-boot]').hidden = !showBoot;
    root.querySelector('[data-sl-desk]').hidden = !showDesk;
    root.querySelector('[data-sl-ended]').hidden = !showEnded;
    root.querySelector('[data-sl-modal]').hidden = !showModal;
    root.classList.toggle('is-boot', showBoot);
    root.classList.toggle('is-ended', showEnded);
    const day = root.querySelector('[data-sl-day]');
    const cityChip = root.querySelector('[data-sl-city]');
    if (career && !showBoot) {
      day.textContent = `Day ${Math.min(career.day, DAYS)}/${DAYS}`;
      cityChip.textContent = cityOf(career.cityId)?.name ?? career.cityId;
    } else {
      day.textContent = '30-day career';
      cityChip.textContent = 'Melbourne desk';
    }
    if (showDesk) this._paintDesk(career);
    if (showEnded && career) this._paintEnded(career);
    if (showModal) this._paintModal(career);
  }

  _paintDesk(career) {
    const city = cityOf(career.cityId);
    const error = lastError(career);
    const worth = netWorth(career);
    const hold = heldUnits(career);
    const book = unrealized(career);
    this.element.querySelector('[data-sl-status]').innerHTML = `
      <div${tip('Cash on this hop. Muggers can lift this. Airfare comes off it.')}><span>Cash</span><b>${dollars(career.cash)}</b></div>
      <div${tip('Melbourne book. Safe from a taxi-rank lift. The compound desk can still take it.')}><span>Bank</span><b>${dollars(career.bank)}</b></div>
      <div${tip('Compound-desk debt. 10% every hop. They collect in Melbourne from day 5.')}><span>Debt</span><b class="${career.debt > 0 ? 'is-bad' : ''}">${dollars(career.debt)}</b></div>
      <div${tip('Stock on hand versus capacity. Upgrade the hold for more room.')}><span>Hold</span><b>${hold}/${career.holdCap}</b></div>
      <div${tip('Cash + bank + stock at today’s ask − debt. This is what the wash is applied to.')}><span>Net</span><b class="${worth < 0 ? 'is-bad' : 'is-good'}">${dollars(worth)}</b></div>
      <div${tip('Unrealised profit on stock versus your average buy price.')}><span>Book</span><b class="${book < 0 ? 'is-bad' : 'is-good'}">${dollars(book)}</b></div>
      <div${tip(career.lawyer ? 'Counsel is live. 80% of net washes into city cash.' : 'No counsel. 60% of net washes into city cash. Hire a lawyer to lift it.')}><span>Wash</span><b>${washPct(career)}%</b></div>
      <div${tip('Regulatory heat. Higher means more inspections on the next hop.')}><span>Heat</span><b>${career.heat}</b></div>
    `;
    const rows = PRODUCTS.map((product, index) => {
      const price = career.prices[product.id];
      const have = career.stock[product.id] ?? 0;
      const avg = avgOf(career, product.id);
      const tag = priceTag(product, price);
      const canBuy = maxBuy(career, product.id);
      const canSell = maxSell(career, product.id);
      const pnl = have > 0 ? (price - avg) * have : 0;
      const avgLabel = have > 0 && avg > 0 ? dollars(avg) : have > 0 ? '—' : '·';
      return `
        <tr>
          <td class="slrd__sku">
            <img src="${productIcon(product.id)}" alt="">
            <span>${index + 1} ${product.name}</span>
          </td>
          <td class="slrd__have">${have}</td>
          <td class="slrd__avg"${tip(have > 0 ? `Weighted average buy price for ${product.name}.` : `No ${product.name} on hand.`)}>${avgLabel}</td>
          <td class="slrd__px slrd__px--${tag}">${dollars(price)}${tag === 'cheap' ? ' CHEAP' : tag === 'spike' ? ' SPIKE' : ''}</td>
          <td class="slrd__pnl ${pnl > 0 ? 'is-good' : pnl < 0 ? 'is-bad' : ''}">${have > 0 ? dollars(pnl) : ''}</td>
          <td class="slrd__acts">
            <button type="button" class="slrd__mini" data-sl="buy" data-id="${product.id}" data-qty="1" ${canBuy < 1 ? 'disabled' : ''}${tip(`Buy 1 ${product.name} at ${dollars(price)}. Averages into your cost.`)}>Buy 1</button>
            <button type="button" class="slrd__mini" data-sl="buy-max" data-id="${product.id}" ${canBuy < 1 ? 'disabled' : ''}${tip(`Spend as much cash as the hold will take. ${canBuy} units.`)}>Max ${canBuy}</button>
            <button type="button" class="slrd__mini" data-sl="sell" data-id="${product.id}" data-qty="1" ${canSell < 1 ? 'disabled' : ''}${tip(`Sell 1 ${product.name} at ${dollars(price)}. Average cost stays on the rest.`)}>Sell 1</button>
            <button type="button" class="slrd__mini" data-sl="sell-max" data-id="${product.id}" ${canSell < 1 ? 'disabled' : ''}${tip(`Sell the whole ${product.name} line at today’s ask.`)}>Dump</button>
          </td>
        </tr>
      `;
    }).join('');
    this.element.querySelector('[data-sl-book]').innerHTML = `
      <div class="slrd__where">${city.name} · ${cityRumor(city, career.prices)}${career.lawyer ? ' · retainer live' : ''} · hops from ${dollars(Math.min(...CITIES.filter((row) => row.id !== career.cityId).map((row) => fareTo(career, row.id))))}</div>
      <table>
        <thead><tr>
          <th>Line</th>
          <th>Have</th>
          <th${tip('Weighted average purchase price.')}>Avg</th>
          <th${tip('Today’s wholesale ask in this city.')}>Ask</th>
          <th${tip('Unrealised profit versus your average buy.')}>P/L</th>
          <th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <label class="slrd__qty">Qty <input type="number" min="1" value="${this.qty}" data-sl-qty></label>
      ${error ? `<p class="slrd__err">${error}</p>` : ''}
    `;
    this.element.querySelector('[data-sl-log]').innerHTML = (career.log ?? []).map((line) => `<div>${line}</div>`).join('');
    const next = nextHoldTier(career);
    const holdBtn = this.element.querySelector('[data-sl="hold"]');
    holdBtn.textContent = next ? `${next.label} ${dollars(next.cost)}` : 'Hold maxed';
    holdBtn.disabled = !next || career.cash < next.cost;
    const lawyerBtn = this.element.querySelector('[data-sl="lawyer"]');
    lawyerBtn.textContent = career.lawyer ? 'Retainer live' : `Lawyer ${dollars(LAWYER_COST)}`;
    lawyerBtn.disabled = career.lawyer || career.cash < LAWYER_COST;
    this.element.querySelector('[data-sl="open-bank"]').disabled = career.cityId !== HOME_CITY;
    this.element.querySelector('[data-sl="open-loan"]').disabled = career.cityId !== HOME_CITY;
  }

  _paintEnded(career) {
    const reason = career.endReason === 'raided' ? 'Raided'
      : career.endReason === 'seized' ? 'Seized'
        : career.endReason === 'days' ? 'Day 30'
          : 'Retired';
    this.element.querySelector('[data-sl-end-title]').textContent = reason;
    this.element.querySelector('[data-sl-end-copy]').textContent = career.log.at(-2) ?? 'Books closed.';
    const payout = career.payout ?? cityPayout(career);
    const worth = netWorth(career);
    const haircut = Math.max(0, worth - payout);
    this.element.querySelector('[data-sl-tally]').innerHTML = `
      <div${tip('Cash still on the desk after any last debt grab.')}><dt>Cash</dt><dd>${dollars(career.cash)}</dd></div>
      <div><dt>Bank</dt><dd>${dollars(career.bank)}</dd></div>
      <div${tip('Unsold stock marked to the last city’s ask.')}><dt>Stock</dt><dd>${dollars(stockMark(career))}</dd></div>
      <div><dt>Debt</dt><dd>${dollars(career.debt)}</dd></div>
      <div${tip('Gross worth before the wash is applied.')}><dt>Gross net</dt><dd>${dollars(worth)}</dd></div>
      <div${tip(career.lawyer ? 'Counsel washed 80% through.' : 'No counsel. 60% washes through. Retain counsel below if you can still pay.')}><dt>Wash</dt><dd>${washPct(career)}%</dd></div>
      <div${tip('The slice that did not survive the wash.')}><dt>Left on the table</dt><dd>${dollars(haircut)}</dd></div>
      <div${tip('What actually lands in District Deck cash when you bank takings.')}><dt>City settlement</dt><dd>${dollars(payout)}</dd></div>
    `;
    const payBtn = this.element.querySelector('[data-sl="payout"]');
    payBtn.textContent = career.endReason === 'raided'
      ? 'City books seized'
      : payout > 0 ? `Bank takings · ${dollars(payout)}` : 'Close books';
    const counselBtn = this.element.querySelector('[data-sl="counsel"]');
    if (counselBtn) {
      counselBtn.hidden = Boolean(career.lawyer) || career.endReason === 'raided';
      counselBtn.disabled = career.lawyer || career.cash < LAWYER_COST;
    }
  }

  _paintModal(career) {
    const panel = this.element.querySelector('[data-sl-panel]');
    if (career.phase === 'event' && career.event) {
      const event = career.event;
      panel.innerHTML = `
        <h3>${event.title}</h3>
        <p>${event.body}</p>
        <div class="slrd__row">
          ${event.choices.map((choice) => `
            <button type="button" class="slrd__btn ${choice.id === event.choices[0].id ? 'slrd__btn--go' : ''}" data-sl="choice" data-id="${choice.id}"${tip(choice.label)}>${choice.label}</button>
          `).join('')}
        </div>
      `;
      return;
    }
    if (this.view === 'jet') {
      panel.innerHTML = `
        <h3>Jet</h3>
        <p>One hop = one day. Debt compounds 10%. Airfare comes off cash.</p>
        <div class="slrd__cities">
          ${CITIES.filter((row) => row.id !== career.cityId).map((row) => {
            const fare = fareTo(career, row.id);
            const disabled = career.cash < fare;
            return `
              <button type="button" class="slrd__city" data-sl="jet-to" data-id="${row.id}" ${disabled ? 'disabled' : ''}${tip(`${row.name}. ${row.note}. Airfare ${dollars(fare)}, one day, 10% interest.`)}>
                <b>${row.name}</b>
                <span>${dollars(fare)}</span>
                <em>${row.note}</em>
              </button>
            `;
          }).join('')}
        </div>
        <button type="button" class="slrd__btn" data-sl="back"${tip('Cancel the hop and stay in this city.')}>Stay on the ground</button>
      `;
      return;
    }
    if (this.view === 'bank') {
      panel.innerHTML = `
        <h3>Melbourne book</h3>
        <p>Cash ${dollars(career.cash)} · Bank ${dollars(career.bank)}. Muggers cannot touch the book.</p>
        <label class="slrd__qty">Amount <input type="number" min="0" value="${this.amount}" data-sl-amount></label>
        <div class="slrd__row">
          <button type="button" class="slrd__btn slrd__btn--go" data-sl="deposit"${tip('Move cash onto the Melbourne book. Muggers cannot touch it.')}>Deposit</button>
          <button type="button" class="slrd__btn" data-sl="withdraw"${tip('Draw cash back off the book for buying or airfare.')}>Withdraw</button>
          <button type="button" class="slrd__btn" data-sl="back"${tip('Close the book.')}>Back</button>
        </div>
      `;
      return;
    }
    if (this.view === 'loan') {
      panel.innerHTML = `
        <h3>Compound desk</h3>
        <p>On the book ${dollars(career.debt)}. Interest 10% every hop. They collect in Melbourne from day 5.</p>
        <label class="slrd__qty">Amount <input type="number" min="0" value="${this.amount}" data-sl-amount></label>
        <div class="slrd__row">
          <button type="button" class="slrd__btn" data-sl="borrow"${tip('Take more from the compound desk. Interest still runs 10% a hop.')}>Borrow</button>
          <button type="button" class="slrd__btn slrd__btn--go" data-sl="repay"${tip('Pay down the book from cash-on-hand.')}>Repay</button>
          <button type="button" class="slrd__btn" data-sl="back"${tip('Close the compound desk.')}>Back</button>
        </div>
      `;
    }
  }
}
