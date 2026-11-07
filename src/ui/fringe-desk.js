// Card model for off-board city assets.
// The former always-on Constructor desk is retired; this module deliberately owns
// no DOM mount, layout CSS, camera motion, requestAnimationFrame, or timer.

import {
  FRINGE_BERTH_YIELD,
  FRINGE_FLIGHT_YIELD,
  FRINGE_FLIGHTS_HOTEL,
  FRINGE_FLIGHTS_RAIL,
  FRINGE_FLIGHTS_TERMINAL,
  FRINGE_VENUE_COSTS,
  FRINGE_VENUE_IDS,
  fringeFlights,
  fringeShips,
  fringeVenueIncome,
  fringeVenueQuote,
} from '../core/fringe-venues.js';
import { escapeHtml } from '../core/format.js';
import { portWarehouseHtml, portPeekHtml, readOpenWorld } from './port-warehouse-card.js';

export { FRINGE_VENUE_IDS };

export const FRINGE_ASSET_META = Object.freeze({
  buy: Object.freeze({
    precinct: 'Tullamarine',
    title: 'Tullamarine',
    register: 'Airport holding',
  }),
  'rail-link': Object.freeze({
    precinct: 'Tullamarine · Southern Cross',
    title: 'Airport rail',
    register: 'Rail-link holding',
  }),
  hotel: Object.freeze({
    precinct: 'Tullamarine',
    title: 'Airside hotel',
    register: 'Hotel holding',
  }),
  terminal: Object.freeze({
    precinct: 'Tullamarine',
    title: 'Second terminal',
    register: 'Terminal holding',
  }),
  'rod-laver': Object.freeze({
    precinct: 'Events precinct',
    title: 'Rod Laver',
    register: 'Events ticket',
  }),
  'grand-prix': Object.freeze({
    precinct: 'Events precinct',
    title: 'Grand Prix',
    register: 'Events ticket',
  }),
  'falls-creek': Object.freeze({
    precinct: 'Events precinct',
    title: 'Falls Creek',
    register: 'Season ticket',
  }),
  port: Object.freeze({
    precinct: 'Port precinct', // COPY-DRAFT
    title: 'Port of Melbourne',
    register: 'Berth holding',
  }),
});

function money(n) {
  return `$${Math.round(n).toLocaleString('en-AU')}`;
}

function eventStatus(venues) {
  const count = [venues?.rodLaver, venues?.grandPrix, venues?.fallsCreek].filter(Boolean).length;
  return count > 0
    ? `${count} ticket${count === 1 ? '' : 's'} held · prices lift toward the hills gate.`
    : 'Tickets lift nearby parcels without a board civic.';
}

function assetStatus(state, id) {
  const venues = state?.fringeVenues;
  const flights = fringeFlights(state);
  const ships = fringeShips(state);
  if (id === 'buy') {
    const airport = !venues?.airportOwned
      ? 'Not held. Flights still land; you do not book the yield.'
      : `${flights} flights · ${money(flights * FRINGE_FLIGHT_YIELD)} / Q.`;
    return `${airport}${venues?.railLink ? ' Rail open — prices lift toward Southern Cross.' : ''}`;
  }
  if (id === 'rail-link') {
    return venues?.railLink
      ? 'Rail open — prices lift toward Southern Cross.'
      : `Link adds ${FRINGE_FLIGHTS_RAIL} flights and lifts prices toward Southern Cross.`;
  }
  if (id === 'hotel') {
    return venues?.hotel
      ? `Airside hotel held · ${FRINGE_FLIGHTS_HOTEL} flights added to the airport book.`
      : `Adds ${FRINGE_FLIGHTS_HOTEL} flights to the airport book.`;
  }
  if (id === 'terminal') {
    return (venues?.terminals ?? 1) >= 2
      ? `Second terminal open · ${FRINGE_FLIGHTS_TERMINAL} flights added to the airport book.`
      : `Adds ${FRINGE_FLIGHTS_TERMINAL} flights to the airport book.`;
  }
  if (id === 'port') {
    return venues?.portOwned
      ? `${ships} ships · ${money(ships * FRINGE_BERTH_YIELD)} / Q at ${money(FRINGE_BERTH_YIELD)} each.`
      : 'Buy the holding to book berth yield from six ships.';
  }
  return eventStatus(venues);
}

export function fringeAssetCardModel(state, id) {
  if (!FRINGE_VENUE_IDS.includes(id)) return null;
  const meta = FRINGE_ASSET_META[id];
  const quote = fringeVenueQuote(state, id);
  const actionLabel = quote.label ?? meta.title;
  const cost = quote.cost ?? FRINGE_VENUE_COSTS[id];
  return {
    id,
    ...meta,
    quote,
    cost,
    actionLabel: quote.ok ? `${actionLabel} · ${money(cost)}` : actionLabel,
    status: assetStatus(state, id),
    portfolioYield: `${money(fringeVenueIncome(state))} current venue yield / Q.`,
    actionDetail: quote.ok
      ? `${actionLabel} · ${money(cost)} · 1 action.`
      : (quote.reason ?? 'That city asset is not available.'),
  };
}

export function fringeAssetCardHtml(state, id, options = {}) {
  const model = fringeAssetCardModel(state, id);
  if (!model) return null;
  const blocked = !model.quote.ok;
  const warehouse = id === 'port'
    ? portWarehouseHtml(options.world ?? readOpenWorld())
    : '';
  return `
    <header class="deed-binder deed-binder--fringe">
      <div class="deed-tab" data-deed-tab>
        <span>${escapeHtml(model.title)}</span>
        <span class="deed-tab__suburb">${escapeHtml(model.precinct)}</span>
      </div>
      <button class="card__close" type="button" aria-label="Close city asset card">✕</button>
    </header>
    <section class="card__folder-page fringe-card__body" data-fringe-card="${escapeHtml(model.id)}">
      ${warehouse}
      <div class="card__identity fringe-card__identity">
        <div class="fringe-card__kicker">Constructor · city asset</div>
        <div class="card__title">${escapeHtml(model.title)}</div>
        <p class="card__sub">${escapeHtml(model.register)}</p>
      </div>
      <div class="fringe-card__register">
        <div class="row"><span class="label">Position</span><span class="value">${escapeHtml(model.precinct)}</span></div>
        <div class="row"><span class="label">Holding</span><span class="value">${escapeHtml(model.status)}</span></div>
        <div class="row"><span class="label">Portfolio</span><span class="value">${escapeHtml(model.portfolioYield)}</span></div>
      </div>
      <div class="card__lead-cost">
        <div class="card__lead-cost-line">
          <span class="label">City asset</span>
          <span class="value amber">${escapeHtml(money(model.cost))}</span>
        </div>
      </div>
      ${id === 'port' ? portPeekHtml(options.world ?? readOpenWorld()) : ''}
      <div class="card__actions card__actions--fixed">
        <div class="card__actions-primary">
          <button type="button"
                  class="verb verb--primary${blocked ? ' verb--blocked' : ''}"
                  data-verb="fringe-venue" data-verb-family="acquire"
                  data-fringe-id="${escapeHtml(model.id)}"
                  ${blocked ? 'disabled' : ''}
                  title="${escapeHtml(model.actionDetail)}"
                  data-reason="${escapeHtml(model.actionDetail)}">
            <span class="verb__key" aria-hidden="true">1</span>
            <img class="verb__icon" src="assets/img/ui-icons/verb-acquire.png"
                 alt="" width="36" height="36" decoding="async">
            <span class="verb__stack">
              <span class="verb__label">${escapeHtml(model.actionLabel)}</span>
              <small class="verb__hint">${escapeHtml(blocked ? model.actionDetail : '1 action')}</small>
            </span>
          </button>
        </div>
      </div>
    </section>`;
}
