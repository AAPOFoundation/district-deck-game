import { cybercabSupplierBook } from '../../core/world/cybercab-supplier.js';
import { isCybercabReserveReason } from '../../core/cybercab-funding.js';
import { previewCybercabSeat } from '../../core/state.js';
import { cybercabActionCheck } from '../cybercab-panel.js';

export const CYBERCAB_PORT = 'shanghai-bund';
export const CYBERCAB_LANE = 'cybercabs-shanghai-melbourne';
export const CYBERCAB_ROUTE = Object.freeze({
  id: CYBERCAB_LANE, from: CYBERCAB_PORT, to: 'melbourne-inner', good: 'autos', kind: 'sea',
});

export function liveCybercabCity(win = window) {
  try {
    if (win.parent === win) return null;
    return win.parent.__districtDeck?.getState?.() ?? null;
  } catch { return null; }
}

export function liveCybercabBoard(win = globalThis.window) {
  try {
    if (!win || win.parent === win) return null;
    return win.parent.__districtDeck?.getCity?.() ?? null;
  } catch { return null; }
}

/** Online views already hold the staged book; only the wallet shown to admission changes. */
export function cybercabDisplayState(state, city, seatId = state?.activeSeatId ?? 'P1') {
  if (!state) return state;
  if (state.onlineView) {
    return { ...state, activeSeatId: state.activeSeatId ?? seatId, cash: state.cybercabPlanCash ?? state.cash };
  }
  if (city && state.seats?.[seatId]) return previewCybercabSeat(city, state, seatId);
  return state;
}

export function cybercabBookModel(state, city) {
  const board = city === undefined ? liveCybercabBoard() : city;
  const seatId = state?.activeSeatId ?? 'P1';
  const viewed = cybercabDisplayState(state, board, seatId);
  const business = viewed?.cybercab;
  const book = cybercabSupplierBook(viewed);
  const reason = business
    ? cybercabActionCheck(viewed, { type: 'IMPORT_CAB' })
    : 'Open the globe from your city to order cybercabs.';
  return {
    ...book, capacity: business?.depot.capacity ?? 0, fleet: business?.fleet.length ?? 0,
    arrivalQuarter: (viewed?.quarter ?? 1) + book.shippingQuarters,
    canBuy: !reason, reason: reason ?? '',
    orders: book.orders.map(order => {
      const boughtBeat = business.ledger.find(row => row.kind === 'IMPORT_CAB' && row.cabId === order.cabId)?.beat
        ?? (order.boughtQuarter - 1) * 4;
      const arrivalBeat = (order.arrivalQuarter - 1) * 4;
      const progress = order.status === 'shipping'
        ? Math.min(.96, Math.max(0, (business.beat - boughtBeat) / Math.max(1, arrivalBeat - boughtBeat))) : 1;
      return { ...order, progress };
    }),
  };
}

/**
 * One display-poll slot for one world instance. Not a global model or admission cache.
 * Published state and city objects are replaced by acceptReducerResult, online snapshots,
 * and replaceState. The poll derives only when that state identity or the resolved city
 * object changes, including a first call where both are still undefined. Equal derived
 * books do not request a paint. Click-time checks keep calling cybercabBookModel directly.
 * In-place city-export log rows and renderer mesh flags are not supplier inputs.
 */
export function createCybercabBookPoll(derive = cybercabBookModel, resolveBoard = liveCybercabBoard) {
  let seen = false;
  let state;
  let board;
  let book = null;
  let signature = '';
  return {
    poll(nextState, city) {
      const resolved = city === undefined ? resolveBoard() : city;
      if (seen && nextState === state && resolved === board) {
        return { nextBook: book, signature, changed: false, derived: false };
      }
      const nextBook = derive(nextState, resolved);
      const nextSignature = JSON.stringify(nextBook);
      const changed = !seen || nextSignature !== signature;
      seen = true;
      state = nextState;
      board = resolved;
      book = nextBook;
      signature = nextSignature;
      return { nextBook, signature, changed, derived: true };
    },
  };
}

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => '$' + value.toLocaleString('en-AU');

export function cybercabBookHtml(book) {
  return `<section data-cybercab-book>
    <span class="province-status" data-status="open">Supplier book</span>
    <h2>Shanghai Cybercab Works</h2>
    <p class="province-lead">Cybercabs to Melbourne</p>
    <dl class="province-book-brief">
      <dt>Unit price · shipping included</dt><dd>${money(book.unitPrice)}</dd>
      <dt>Shipping</dt><dd>${book.shippingQuarters} quarter · arrives Q${book.arrivalQuarter}</dd>
      <dt>Depot capacity</dt><dd>${book.fleet} / ${book.capacity} cabs · ${Math.max(0, book.capacity - book.fleet)} spaces</dd>
    </dl>
    <p class="province-kind-note">Coral Sea → Bass Strait → Melbourne port yard, then the depot.</p>
    <div class="province-book-actions"><button type="button" class="province-open-book" data-cybercab-buy ${book.canBuy ? '' : 'disabled'}>IMPORT CAB · ${money(book.unitPrice)}</button></div>
    ${book.reason ? `<p class="province-book-reason"${isCybercabReserveReason(book.reason) ? ' tabindex="0"' : ''}>${esc(book.reason)}</p>` : ''}
    <p class="province-books-heading">Import register</p>
    <div class="province-books">${book.orders.length ? book.orders.slice(-12).reverse().map(order => `<article class="province-book" data-cybercab-order="${esc(order.id)}">
      <strong>${esc(order.cabId)}</strong><p>${order.status === 'shipping' ? `Shipping · ${Math.round(order.progress * 100)}% · arrives Q${order.arrivalQuarter}` : order.status === 'yard' ? `Arrived Q${order.arrivalQuarter} · Melbourne port yard` : 'Delivered to depot'}</p>
    </article>`).join('') : '<p>No imports ordered.</p>'}</div>
    <button type="button" class="province-frame-book" data-cybercab-machinery>SHANGHAI · MACHINERY DESK</button>
  </section>`;
}
