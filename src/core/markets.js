// District Deck — deterministic listed markets (NASDAQ-style equities + crypto).
// Prices and trades are pure seed streams. No network. No Math.random.
// Venue access: click a civic `stock-exchange` building (card trade verbs).

import { stream, applyBp } from './rng.js';
import { RULES } from './content.js';
import { narrativeBiasBp, narrativeDailyBiasBp } from './markets-narrative.js';

/**
 * Notable listed names — game tickers (not a live brokerage).
 * basePrice ≈ real-world USD levels (rounded) so the tape reads familiar.
 * volBp = quarterly half-range in basis points (lively equity/crypto Q-moves).
 * AAPL/MSFT mega-cap ~20%; growth ~27%; NVDA/TSLA ~40%; crypto 70–85%.
 */
export const LISTED_ASSETS = Object.freeze([
  // Spot-inspired opens (Aug 2026 tape, rounded). Engine stays integer.
  Object.freeze({ id: 'NVDA', name: 'Nvidia', class: 'equity', basePrice: 224, volBp: 4000 }),
  Object.freeze({ id: 'AAPL', name: 'Apple', class: 'equity', basePrice: 302, volBp: 2000 }),
  Object.freeze({ id: 'MSFT', name: 'Microsoft', class: 'equity', basePrice: 492, volBp: 2000 }),
  Object.freeze({ id: 'AMZN', name: 'Amazon', class: 'equity', basePrice: 267, volBp: 2700 }),
  Object.freeze({ id: 'GOOGL', name: 'Alphabet', class: 'equity', basePrice: 344, volBp: 2700 }),
  Object.freeze({ id: 'META', name: 'Meta', class: 'equity', basePrice: 579, volBp: 2700 }),
  Object.freeze({ id: 'TSLA', name: 'Tesla', class: 'equity', basePrice: 328, volBp: 4000 }),
  Object.freeze({ id: 'BTC', name: 'Bitcoin', class: 'crypto', basePrice: 108_000, volBp: 7500 }),
  Object.freeze({ id: 'ETH', name: 'Ethereum', class: 'crypto', basePrice: 3_820, volBp: 7000 }),
  Object.freeze({ id: 'SOL', name: 'Solana', class: 'crypto', basePrice: 178, volBp: 8500 }),
  Object.freeze({ id: 'XAU', name: 'Gold', class: 'commodity', basePrice: 4376, volBp: 1800, unit: 'oz' }),
  Object.freeze({ id: 'CL', name: 'Crude oil', class: 'commodity', basePrice: 83, volBp: 3500, unit: 'bbl' }),
  Object.freeze({ id: 'KC', name: 'Coffee', class: 'commodity', basePrice: 248, volBp: 4000, unit: 'cwt' }),
]);

export const ORDER_TYPES = Object.freeze(['market', 'limit', 'stop', 'stop-limit', 'take-profit']);
export const ORDER_TIF = Object.freeze(['day', 'gtc']);

/** Intra-quarter tape. Presentation clock — fills / NAV still use official last. */
export const DAYS_PER_QUARTER = 90;
/** Wall-clock ms per tape day. Slow enough to transmit an order inside one candle. */
export const TAPE_MS_PER_DAY = 12_000;

export const LISTED_BY_ID = Object.freeze(
  Object.fromEntries(LISTED_ASSETS.map((asset) => [asset.id, asset])),
);

export function listingsOf(marketsOrState) {
  const markets = marketsOrState?.listings
    ? marketsOrState
    : marketsOrState?.markets;
  return Array.isArray(markets?.listings) ? markets.listings : [];
}

export function assetsOnDesk(marketsOrState) {
  const extra = listingsOf(marketsOrState);
  return extra.length ? [...LISTED_ASSETS, ...extra] : LISTED_ASSETS;
}

export function assetFromMarkets(marketsOrState, assetId) {
  if (LISTED_BY_ID[assetId]) return LISTED_BY_ID[assetId];
  return listingsOf(marketsOrState).find((row) => row.id === assetId) ?? null;
}

export const MARKET_VENUE_USE_ID = 'stock-exchange';

/** Default trade lot for a ticker (equities 100, crypto 1/2/5). */
export function marketLotSize(assetId) {
  const fromRules = RULES.marketLotSizeById?.[assetId];
  if (Number.isInteger(fromRules) && fromRules >= 1) return fromRules;
  return LISTED_BY_ID[assetId]?.class === 'crypto' ? 1 : 100;
}

/**
 * Display price for the tape / card. Ledger still stores integer applyBp values.
 * Equities: 2dp. ETH/SOL: 2dp. BTC: 0–2dp (whole dollars when integer).
 */
export function formatTickerPrice(price, assetClass, assetId = null) {
  const n = Number(price);
  if (!Number.isFinite(n)) return '—';
  const id = assetId ?? null;
  const isBtc = id === 'BTC' || (assetClass === 'crypto' && id == null && Math.abs(n) >= 10_000);
  if (isBtc) {
    if (Number.isInteger(n)) {
      return `$${Math.abs(n).toLocaleString('en-AU')}`;
    }
    return `$${n.toLocaleString('en-AU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  }
  if (assetClass === 'commodity' && (id === 'CL' || id === 'KC')) {
    return `$${n.toLocaleString('en-AU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (id === 'XAU' || assetClass === 'commodity') {
    return `$${n.toLocaleString('en-AU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  // Equities + ETH/SOL (and other non-BTC crypto): always 2dp.
  return `$${n.toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function emptyBook() {
  return Object.freeze(Object.fromEntries(LISTED_ASSETS.map(({ id }) => [id, 0])));
}

/** Average-cost residual basis per owner (total $ still in remaining shares). */
function emptyCostBases() {
  return Object.freeze({ player: Object.freeze({}), rival: Object.freeze({}) });
}

/** Opening prices for quarter 1 from seed — tight band; full volBp is for quarterly reprice. */
export function openMarketPrices(seed) {
  const prices = {};
  for (const asset of LISTED_ASSETS) {
    const openBp = Math.min(150, Math.round(asset.volBp * 0.08));
    const roll = stream(seed, `markets:open:${asset.id}`).int(-openBp, openBp);
    prices[asset.id] = Math.max(1, applyBp(asset.basePrice, 10000 + roll));
  }
  return Object.freeze(prices);
}

/**
 * Macro / property pulse that steers listed prices (presentation + NAV).
 * Pure: callers pass flags from the run's events and sector index moves.
 *
 * @typedef {{
 *   downturn?: boolean,
 *   interestShock?: boolean,
 *   materialsSpike?: boolean,
 *   flashFlood?: boolean,
 *   propertyPulseBp?: number,
 * }} MarketMacroContext
 */

/**
 * Reprice every listed name for the given quarter (called at settle into next Q).
 * Drift = macro bias (economy conditions) + asset-class vol roll.
 * Without a macro bias, markets still move; with downturn / interest shock they
 * reprice hard in a readable direction (risk-off equities & crypto).
 *
 * @param {string} seed
 * @param {number} quarter
 * @param {Record<string, number>} priorPrices
 * @param {MarketMacroContext} [macro]
 */
export function repriceMarkets(seed, quarter, priorPrices, macro = {}, listings = []) {
  const prices = {};
  const downturn = Boolean(macro.downturn);
  const interestShock = Boolean(macro.interestShock);
  const materialsSpike = Boolean(macro.materialsSpike);
  const flashFlood = Boolean(macro.flashFlood);
  const propertyPulseBp = Number.isFinite(macro.propertyPulseBp)
    ? Math.max(-2500, Math.min(2500, Math.round(macro.propertyPulseBp)))
    : 0;

  const assets = listings.length ? [...LISTED_ASSETS, ...listings] : LISTED_ASSETS;
  for (const asset of assets) {
    const prior = priorPrices?.[asset.id] ?? asset.basePrice;
    let biasBp = 0;

    // Calm / expansion: mild risk-on so markets are not flat when the city is healthy.
    // Kept small (~100 bp equity / ~80 crypto) so idiosyncratic volBp drives the tape.
    if (!downturn && !interestShock) {
      biasBp += asset.class === 'crypto' ? 80 : 100;
      if (['NVDA', 'TSLA', 'META'].includes(asset.id)) biasBp += 40;
      if (['AAPL', 'MSFT', 'GOOGL'].includes(asset.id)) biasBp += 20;
    }

    if (downturn) {
      // Broad risk-off — crypto and high-beta hurt more.
      biasBp += asset.class === 'crypto' ? -2200 : -1100;
      if (['NVDA', 'TSLA', 'META', 'AMZN'].includes(asset.id)) biasBp -= 600;
      if (['AAPL', 'MSFT'].includes(asset.id)) biasBp -= 250;
    }

    if (interestShock) {
      // Higher rates compress growth / crypto; slight relative shelter for mega-cap cash machines.
      biasBp += asset.class === 'crypto' ? -1600 : -700;
      if (['NVDA', 'TSLA', 'META'].includes(asset.id)) biasBp -= 550;
      if (['AAPL', 'MSFT'].includes(asset.id)) biasBp -= 150;
    }

    if (materialsSpike) {
      if (asset.class === 'commodity') {
        // Cost shock is a commodity bid.
        biasBp += asset.id === 'XAU' ? 900 : asset.id === 'CL' ? 1400 : 1100;
      } else {
        biasBp += asset.class === 'crypto' ? -400 : -280;
        if (asset.id === 'TSLA') biasBp -= 200;
      }
    }

    if (flashFlood) {
      if (asset.class === 'commodity') {
        biasBp += asset.id === 'XAU' ? 350 : 180;
      } else {
        biasBp += asset.class === 'crypto' ? -250 : -120;
      }
    }

    if (asset.class === 'commodity' && downturn) {
      if (asset.id === 'XAU') biasBp += 1600; // haven
      if (asset.id === 'CL') biasBp -= 400; // demand
      if (asset.id === 'KC') biasBp -= 200;
    }
    if (asset.class === 'commodity' && interestShock) {
      if (asset.id === 'XAU') biasBp += 400;
      if (asset.id === 'CL' || asset.id === 'KC') biasBp -= 250;
    }
    if (asset.class === 'commodity' && !downturn && !interestShock && !materialsSpike) {
      biasBp += 60;
    }

    // Link to property book: strong sector / district pulse → mild risk-on for listed book.
    biasBp += Math.round(propertyPulseBp * (asset.class === 'crypto' ? 0.45 : 0.35));

    // Idiosyncratic quarterly noise (asset vol) — still large enough to move the tape.
    const roll = stream(seed, `markets:q${quarter}:${asset.id}`).int(
      -asset.volBp,
      asset.volBp,
    );
    // Extra macro-amplified noise so a shock quarter is visibly choppy.
    const shockNoise = (downturn || interestShock)
      ? stream(seed, `markets:shock:${quarter}:${asset.id}`).int(-500, 500)
      : 0;

    const totalBp = biasBp + roll + shockNoise + narrativeBiasBp(seed, quarter, asset.id);
    prices[asset.id] = Math.max(1, applyBp(prior, 10000 + totalBp));
  }
  return Object.freeze(prices);
}

/**
 * Build macro context for reprice from run state at settle (into next quarter).
 * Prefers the run macro plan + live event types for the quarter just ending,
 * plus average sector realised move this settlement when provided.
 */
export function marketMacroFromState(state, {
  sectorMoves = null,
  resolvingQuarter = state.quarter,
} = {}) {
  const types = new Set();
  // Authored run plan is the most reliable macro authority for the settling quarter.
  for (const entry of state.macroPlan?.entries ?? []) {
    if (entry.resolveQuarter === resolvingQuarter) types.add(entry.type);
  }
  for (const id of state.events?.order ?? []) {
    const event = state.events.byId?.[id];
    if (!event) continue;
    if (!['downturn', 'interest-shock', 'materials-spike', 'flash-flood'].includes(event.type)) {
      continue;
    }
    if (event.resolveQuarter === resolvingQuarter) types.add(event.type);
  }

  let propertyPulseBp = 0;
  if (sectorMoves && typeof sectorMoves === 'object') {
    const values = Object.values(sectorMoves)
      .map((row) => row?.realisedBp)
      .filter((v) => Number.isFinite(v));
    if (values.length) {
      propertyPulseBp = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    }
  }

  return Object.freeze({
    downturn: types.has('downturn'),
    interestShock: types.has('interest-shock'),
    materialsSpike: types.has('materials-spike'),
    flashFlood: types.has('flash-flood'),
    propertyPulseBp,
  });
}

export function createMarkets(seed) {
  return Object.freeze({
    prices: openMarketPrices(seed),
    portfolios: Object.freeze({
      player: emptyBook(),
      rival: emptyBook(),
    }),
    // Total $ cost of remaining units per asset (average-cost method).
    costBases: emptyCostBases(),
    listings: Object.freeze([]),
    orders: Object.freeze([]),
    orderSeq: 0,
    fills: Object.freeze([]),
    reservedCash: Object.freeze({ player: 0, rival: 0 }),
  });
}

export function ensureMarketsShape(markets, seed) {
  const fresh = createMarkets(seed ?? 'DD-MKT-HYDRATE');
  const src = markets && typeof markets === 'object' ? markets : {};
  const portfolios = {
    player: { ...fresh.portfolios.player, ...(src.portfolios?.player ?? {}) },
    rival: { ...fresh.portfolios.rival, ...(src.portfolios?.rival ?? {}) },
  };
  const costBases = {
    player: { ...(src.costBases?.player ?? {}) },
    rival: { ...(src.costBases?.rival ?? {}) },
  };
  return {
    ...fresh,
    ...src,
    prices: { ...fresh.prices, ...(src.prices ?? {}) },
    portfolios,
    costBases,
    listings: Array.isArray(src.listings) ? src.listings : [],
    orders: Array.isArray(src.orders) ? src.orders : [],
    orderSeq: Number.isInteger(src.orderSeq) ? src.orderSeq : 0,
    fills: Array.isArray(src.fills) ? src.fills : [],
    reservedCash: {
      player: Number.isFinite(src.reservedCash?.player) ? src.reservedCash.player : 0,
      rival: Number.isFinite(src.reservedCash?.rival) ? src.reservedCash.rival : 0,
    },
  };
}

export function reservedCashOf(state, owner = 'player') {
  const key = owner === 'P1' || owner === 'player' ? 'player'
    : owner === 'R1' || owner === 'rival' ? 'rival'
      : owner;
  return Math.max(0, Math.round(state.markets?.reservedCash?.[key] ?? 0));
}

export function freeCashOf(state, owner = 'player') {
  const cash = owner === 'player' || owner === 'P1' ? state.cash : (state.seatEconomy?.R1?.cash ?? 0);
  return cash - reservedCashOf(state, owner);
}

export function marketBookValue(state, owner = 'player') {
  const key = owner === 'P1' || owner === 'player' ? 'player'
    : owner === 'R1' || owner === 'rival' ? 'rival'
      : owner;
  const book = state.markets?.portfolios?.[key] ?? emptyBook();
  const prices = state.markets?.prices ?? {};
  let total = 0;
  for (const id of Object.keys(book).sort()) {
    const units = book[id] ?? 0;
    if (!units) continue;
    total += units * (prices[id] ?? assetFromMarkets(state.markets, id)?.basePrice ?? 0);
  }
  return total;
}

export function stockExchangeOnBoard(city) {
  return (city.civicUses ?? []).find((civic) => civic.useId === MARKET_VENUE_USE_ID) ?? null;
}

/** Venue + phase only — cash and inventory are the caller's problem. */
export function assertMarketVenue(city, state, venueId) {
  const venue = stockExchangeOnBoard(city);
  if (!venue) return { ok: false, reason: 'No Stock Exchange on this city.' };
  if (!venueId || venueId !== venue.id) {
    return { ok: false, reason: 'Open the Stock Exchange building to trade.' };
  }
  if (state.phase !== 'play') return { ok: false, reason: 'The run is over.' };
  return { ok: true, venue };
}

export function canTrade(city, state, action) {
  const venue = stockExchangeOnBoard(city);
  if (!venue) {
    return { ok: false, reason: 'No Stock Exchange on this city.' };
  }
  // Venue is mandatory — open the Stock Exchange civic; no off-site trades.
  if (!action.venueId || action.venueId !== venue.id) {
    return { ok: false, reason: 'Open the Stock Exchange building to trade.' };
  }
  if (state.phase !== 'play') return { ok: false, reason: 'The run is over.' };
  const asset = assetFromMarkets(state.markets, action.assetId);
  if (!asset) return { ok: false, reason: 'Unknown listed asset.' };
  const side = action.side;
  if (side !== 'buy' && side !== 'sell') return { ok: false, reason: 'Buy or sell only.' };
  const units = Number(action.units);
  // No hard unit ceiling — cash (buy) and held book (sell) are the only limits.
  if (!Number.isInteger(units) || units < 1) {
    return { ok: false, reason: 'Trade at least 1 unit.' };
  }
  const price = state.markets?.prices?.[asset.id] ?? asset.basePrice;
  const cashOut = units * price;
  const book = state.markets?.portfolios?.player?.[asset.id] ?? 0;
  if (side === 'buy') {
    const free = freeCashOf(state, 'player');
    if (free < cashOut) {
      return { ok: false, reason: `Need ${cashOut.toLocaleString()} free cash.` };
    }
  } else {
    const restingSells = (state.markets?.orders ?? [])
      .filter((row) => row.status === 'working' && row.owner === 'player'
        && row.side === 'sell' && row.assetId === asset.id)
      .reduce((sum, row) => sum + (row.units ?? 0), 0);
    if (book - restingSells < units) {
      return {
        ok: false,
        reason: restingSells
          ? `You hold ${book} ${asset.id} (${restingSells} resting sells).`
          : `You hold ${book} ${asset.id}.`,
      };
    }
  }
  return {
    ok: true,
    venue,
    asset,
    price,
    units,
    cashOut: side === 'buy' ? cashOut : 0,
    cashIn: side === 'sell' ? cashOut : 0,
  };
}

export function tradeLotsForCard(state) {
  return assetsOnDesk(state).map((asset) => {
    const price = state.markets?.prices?.[asset.id] ?? asset.basePrice;
    const prior = state.markets?.priorPrices?.[asset.id] ?? asset.basePrice;
    const held = state.markets?.portfolios?.player?.[asset.id] ?? 0;
    const costBasis = state.markets?.costBases?.player?.[asset.id] ?? 0;
    const avgCost = held > 0 ? costBasis / held : 0;
    const unrealized = held > 0 ? (price - avgCost) * held : 0;
    const unrealizedBp = avgCost > 0
      ? Math.round(((price - avgCost) / avgCost) * 10000)
      : 0;
    const delta = price - prior;
    const deltaBp = prior > 0 ? Math.round(((price - prior) / prior) * 10000) : 0;
    return Object.freeze({
      id: asset.id,
      name: asset.name,
      class: asset.class,
      price,
      prior,
      delta,
      deltaBp,
      held,
      avgCost,
      costBasis,
      unrealized,
      unrealizedBp,
    });
  });
}

/** Human label for last reprice macro flags (card / HUD). */
export function marketMacroLabel(macro) {
  if (!macro) return 'Markets open · reprice each Settle';
  const bits = [];
  if (macro.downturn) bits.push('downturn');
  if (macro.interestShock) bits.push('interest shock');
  if (macro.materialsSpike) bits.push('materials spike');
  if (macro.flashFlood) bits.push('flood');
  if (macro.propertyPulseBp) {
    bits.push(`property ${macro.propertyPulseBp > 0 ? '+' : ''}${(macro.propertyPulseBp / 100).toFixed(1)}%`);
  }
  if (!bits.length) return 'Risk-on tape · no macro hazard this settle';
  return `Risk-off drivers · ${bits.join(' · ')}`;
}

export function quoteFor(state, assetId) {
  const asset = assetFromMarkets(state.markets, assetId);
  if (!asset) return null;
  const last = state.markets?.prices?.[assetId] ?? asset.basePrice;
  return quoteFromLast(assetId, last, state.markets);
}

export function quoteFromLast(assetId, last, markets = null) {
  const asset = assetFromMarkets(markets, assetId);
  if (!asset || !Number.isFinite(last)) return null;
  const spreadBp = asset.class === 'crypto' ? 14
    : asset.class === 'commodity' ? 8
      : 4;
  const half = Math.max(1, Math.round(last * spreadBp / 10000));
  return Object.freeze({
    assetId,
    last,
    bid: Math.max(1, last - half),
    ask: last + half,
    spread: half * 2,
    spreadBp,
  });
}

/**
 * One quarter of daily OHLC starting at `openPrice`. Deterministic. Day 0 open = openPrice.
 * Daily range is a slice of quarterly vol so 90 days read as one session, not 90 crashes.
 */
export function quarterDailyBars(seed, assetId, quarter, openPrice, markets = null) {
  const asset = assetFromMarkets(markets, assetId);
  if (!asset) return [];
  const start = Math.max(1, Math.round(openPrice));
  const rangeBp = Math.max(18, Math.round(asset.volBp / 12));
  const bars = [];
  let close = start;
  for (let day = 0; day < DAYS_PER_QUARTER; day += 1) {
    const rng = stream(seed, `markets:day:${quarter}:${asset.id}:${day}`);
    const body = rng.int(-rangeBp, rangeBp) + narrativeDailyBiasBp(seed, quarter, day, asset.id);
    const wickHi = rng.int(0, Math.round(rangeBp * 0.4));
    const wickLo = rng.int(0, Math.round(rangeBp * 0.4));
    const vol = 60 + rng.int(0, 380);
    const open = close;
    const next = Math.max(1, applyBp(open, 10000 + body));
    const high = Math.max(open, next, applyBp(Math.max(open, next), 10000 + wickHi));
    const low = Math.max(1, Math.min(open, next, applyBp(Math.min(open, next), 10000 - wickLo)));
    bars.push(Object.freeze({
      q: quarter,
      d: day,
      o: open,
      h: high,
      l: low,
      c: next,
      v: vol,
    }));
    close = next;
  }
  return Object.freeze(bars);
}

/** Intraday forming candle: fraction 0–1 of the current tape day. */
export function formDailyBar(bar, frac, seed, assetId) {
  if (!bar) return null;
  const t = Math.max(0, Math.min(1, frac));
  const mid = bar.o + (bar.c - bar.o) * t;
  const tick = stream(seed, `markets:tick:${bar.q}:${assetId}:${bar.d}`).int(-6, 6);
  const last = Math.max(1, Math.round(mid + tick * t));
  // Discover range with time — do not paint the finished day's full wick at t=0.
  const ext = Math.round((bar.h - Math.max(bar.o, bar.c)) * t);
  const drop = Math.round((Math.min(bar.o, bar.c) - bar.l) * t);
  const high = Math.max(bar.o, last) + ext;
  const low = Math.max(1, Math.min(bar.o, last) - drop);
  return Object.freeze({
    ...bar,
    h: high,
    l: low,
    c: last,
    forming: true,
  });
}

export function smaValue(bars, period, index) {
  if (!Array.isArray(bars) || index + 1 < period) return null;
  let sum = 0;
  for (let i = index + 1 - period; i <= index; i += 1) sum += bars[i].c;
  return sum / period;
}

export function tapeDayFromElapsed(elapsedMs) {
  const raw = elapsedMs / TAPE_MS_PER_DAY;
  const day = Math.min(DAYS_PER_QUARTER - 1, Math.max(0, Math.floor(raw)));
  const frac = day >= DAYS_PER_QUARTER - 1
    ? Math.min(1, raw - day)
    : raw - day;
  return { day, frac: Math.max(0, Math.min(1, frac)), elapsedDays: raw };
}

/**
 * Deterministic OHLC history ending at `lastPrice`. Presentation only — never
 * used for fill or NAV.
 */
export function chartBars(seed, assetId, lastPrice, count = 64, markets = null) {
  const asset = assetFromMarkets(markets, assetId);
  if (!asset) return [];
  const raw = [];
  let close = Math.max(1, asset.basePrice);
  const rangeBp = Math.max(50, Math.round(asset.volBp / 14));
  for (let i = 0; i < count; i++) {
    const rng = stream(seed, `markets:bar:${asset.id}:${i}`);
    const body = rng.int(-rangeBp, rangeBp);
    const wickHi = rng.int(0, Math.round(rangeBp * 0.45));
    const wickLo = rng.int(0, Math.round(rangeBp * 0.45));
    const vol = 80 + rng.int(0, 420);
    const open = close;
    const next = Math.max(1, applyBp(open, 10000 + body));
    const high = Math.max(open, next, applyBp(Math.max(open, next), 10000 + wickHi));
    const low = Math.max(1, Math.min(open, next, applyBp(Math.min(open, next), 10000 - wickLo)));
    raw.push({ i, o: open, h: high, l: low, c: next, v: vol });
    close = next;
  }
  const target = Math.max(1, lastPrice);
  const scale = target / Math.max(1, raw[raw.length - 1].c);
  const bars = raw.map((bar) => Object.freeze({
    i: bar.i,
    o: Math.max(1, Math.round(bar.o * scale)),
    h: Math.max(1, Math.round(bar.h * scale)),
    l: Math.max(1, Math.round(bar.l * scale)),
    c: bar.i === count - 1 ? target : Math.max(1, Math.round(bar.c * scale)),
    v: bar.v,
  }));
  return Object.freeze(bars);
}

export function accountSummary(state, owner = 'player') {
  const book = marketBookValue(state, owner);
  const reserved = reservedCashOf(state, owner);
  const cash = owner === 'player' || owner === 'P1' ? state.cash : 0;
  const lots = tradeLotsForCard(state);
  const unrealized = lots.reduce((sum, lot) => sum + (lot.unrealized || 0), 0);
  return Object.freeze({
    cash,
    reserved,
    free: cash - reserved,
    book,
    unrealized,
    equity: cash + book,
    working: (state.markets?.orders ?? []).filter((o) => o.status === 'working' && o.owner === 'player').length,
  });
}
