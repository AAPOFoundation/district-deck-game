// Working-order book for the Stock Exchange desk.
// Pure. Deterministic. Buys fill at the live market, never at a higher limit.
// Transmit and tape scans pass mark prices; settle also checks prior last + tape range.

import { RULES } from './content.js';
import {
  ORDER_TIF,
  ORDER_TYPES,
  assertMarketVenue,
  assetFromMarkets,
  canTrade,
  ensureMarketsShape,
  freeCashOf,
  marketLotSize,
  quarterDailyBars,
} from './markets.js';

export function nextOrderId(markets) {
  const seq = (markets.orderSeq ?? 0) + 1;
  return { id: `ord-${String(seq).padStart(4, '0')}`, seq };
}

export function protectiveBuyPrice(order, last) {
  if (order.orderType === 'limit' || order.orderType === 'take-profit') {
    return Math.max(1, Math.round(order.limitPrice ?? last));
  }
  if (order.orderType === 'stop-limit') {
    return Math.max(1, Math.round(order.limitPrice ?? order.stopPrice ?? last));
  }
  if (order.orderType === 'stop') {
    return Math.max(1, Math.round((order.stopPrice ?? last) * 1.02));
  }
  return Math.max(1, Math.round(last));
}

export function recomputeReserved(markets, owner = 'player') {
  let reserved = 0;
  for (const order of markets.orders ?? []) {
    if (order.status !== 'working') continue;
    if (order.owner !== owner) continue;
    if (order.side !== 'buy') continue;
    reserved += (order.reservedCash ?? 0);
  }
  return reserved;
}

export function workingSellUnits(markets, owner, assetId, excludeId = null) {
  let units = 0;
  for (const order of markets.orders ?? []) {
    if (order.status !== 'working') continue;
    if (order.owner !== owner) continue;
    if (order.side !== 'sell') continue;
    if (order.assetId !== assetId) continue;
    if (excludeId && order.id === excludeId) continue;
    units += order.units;
  }
  return units;
}

export function canPlaceOrder(city, state, action) {
  const orderType = action.orderType ?? 'market';
  if (orderType === 'market') {
    return canTrade(city, state, { ...action, type: 'trade' });
  }
  if (!ORDER_TYPES.includes(orderType)) {
    return { ok: false, reason: 'Unknown order type.' };
  }
  const venue = assertMarketVenue(city, state, action.venueId);
  if (!venue.ok) return venue;

  const asset = assetFromMarkets(state.markets, action.assetId);
  if (!asset) return { ok: false, reason: 'Unknown listed asset.' };
  const side = action.side;
  if (side !== 'buy' && side !== 'sell') return { ok: false, reason: 'Buy or sell only.' };
  const units = Number(action.units);
  if (!Number.isInteger(units) || units < 1) {
    return { ok: false, reason: 'Trade at least 1 unit.' };
  }
  const lot = marketLotSize(asset.id);
  if (units % lot !== 0) {
    return { ok: false, reason: `Qty must be a multiple of the ${lot}-unit lot.` };
  }
  const tif = action.tif ?? 'gtc';
  if (!ORDER_TIF.includes(tif)) return { ok: false, reason: 'TIF is day or gtc.' };

  const last = state.markets?.prices?.[asset.id] ?? asset.basePrice;
  const limitPrice = action.limitPrice != null ? Math.round(Number(action.limitPrice)) : null;
  const stopPrice = action.stopPrice != null ? Math.round(Number(action.stopPrice)) : null;

  if ((orderType === 'limit' || orderType === 'take-profit' || orderType === 'stop-limit')
    && (!Number.isInteger(limitPrice) || limitPrice < 1)) {
    return { ok: false, reason: 'Limit price required.' };
  }
  if ((orderType === 'stop' || orderType === 'stop-limit')
    && (!Number.isInteger(stopPrice) || stopPrice < 1)) {
    return { ok: false, reason: 'Stop price required.' };
  }
  if (orderType === 'take-profit' && side !== 'sell') {
    return { ok: false, reason: 'Take-profit is a sell order.' };
  }
  if (side === 'buy') {
    if (Number.isInteger(action.stopLoss) && action.stopLoss >= last) {
      return { ok: false, reason: `Stop loss must be below the mark (${last}).` };
    }
    if (Number.isInteger(action.takeProfit) && action.takeProfit <= last) {
      return { ok: false, reason: `Take profit must be above the mark (${last}).` };
    }
  }

  const draft = {
    orderType, side, units, limitPrice, stopPrice, assetId: asset.id,
  };
  if (side === 'buy') {
    const reserve = units * protectiveBuyPrice(draft, last);
    if (freeCashOf(state, 'player') < reserve) {
      return { ok: false, reason: `Need ${reserve.toLocaleString()} free cash reserved.` };
    }
  } else {
    const held = state.markets?.portfolios?.player?.[asset.id] ?? 0;
    const reservedSell = workingSellUnits(state.markets, 'player', asset.id);
    if (held - reservedSell < units) {
      return { ok: false, reason: `You hold ${held} ${asset.id} (${reservedSell} resting sells).` };
    }
  }

  return {
    ok: true,
    venue: venue.venue,
    asset,
    last,
    units,
    orderType,
    tif,
    limitPrice,
    stopPrice,
    reservedCash: side === 'buy' ? units * protectiveBuyPrice(draft, last) : 0,
  };
}

export function canCancelOrder(city, state, action) {
  const markets = ensureMarketsShape(state.markets, state.seed);
  const order = markets.orders.find((row) => row.id === action.orderId);
  if (!order) return { ok: false, reason: 'Order not found.' };
  if (order.status !== 'working') return { ok: false, reason: 'Order is not working.' };
  if (order.owner !== 'player') return { ok: false, reason: 'Not your order.' };
  const venue = assertMarketVenue(city, state, action.venueId ?? order.venueId);
  if (!venue.ok) return venue;
  return { ok: true, order };
}

function triggered(order, last) {
  if (!Number.isFinite(last)) return false;
  if (order.orderType === 'limit' || order.orderType === 'take-profit') {
    if (order.side === 'buy') return last <= order.limitPrice;
    return last >= order.limitPrice;
  }
  if (order.orderType === 'stop') {
    if (order.side === 'buy') return last >= order.stopPrice;
    return last <= order.stopPrice;
  }
  if (order.orderType === 'stop-limit') {
    const armed = order.side === 'buy' ? last >= order.stopPrice : last <= order.stopPrice;
    if (!armed) return false;
    if (order.side === 'buy') return last <= order.limitPrice;
    return last >= order.limitPrice;
  }
  return false;
}

/** Limit / take-profit already through the given mark — fill now. */
export function isLimitMarketable(order, last) {
  if (order.orderType !== 'limit' && order.orderType !== 'take-profit') return false;
  return triggered(order, last);
}

/** Pay the market. A buy limit above the print still fills at the print. */
export function improvedFillPrice(order, market) {
  const px = Math.max(1, Math.round(Number(market)));
  if (!Number.isFinite(px)) return 1;
  if (order.orderType === 'limit' || order.orderType === 'take-profit') {
    if (order.side === 'buy' && Number.isInteger(order.limitPrice)) {
      return Math.min(px, order.limitPrice);
    }
    if (order.side === 'sell' && Number.isInteger(order.limitPrice)) {
      return Math.max(px, order.limitPrice);
    }
  }
  return px;
}

function quarterTouched(order, seed, quarter, open, markets = null) {
  if (!Number.isFinite(open)) return false;
  const bars = quarterDailyBars(seed, order.assetId, quarter, open, markets);
  if (!bars.length) return false;
  let lo = open;
  let hi = open;
  for (const bar of bars) {
    if (bar.l < lo) lo = bar.l;
    if (bar.h > hi) hi = bar.h;
  }
  if (order.orderType === 'limit' || order.orderType === 'take-profit') {
    if (order.side === 'buy') return lo <= order.limitPrice;
    return hi >= order.limitPrice;
  }
  if (order.orderType === 'stop') {
    if (order.side === 'buy') return hi >= order.stopPrice;
    return lo <= order.stopPrice;
  }
  if (order.orderType === 'stop-limit') {
    const armed = order.side === 'buy' ? hi >= order.stopPrice : lo <= order.stopPrice;
    if (!armed) return false;
    if (order.side === 'buy') return lo <= order.limitPrice;
    return hi >= order.limitPrice;
  }
  return false;
}

function applyFillToBook(next, order, fillPrice) {
  const owner = order.owner ?? 'player';
  const book = { ...next.markets.portfolios[owner] };
  const bases = { ...next.markets.costBases[owner] };
  const assetId = order.assetId;
  const held = book[assetId] ?? 0;
  const priorBasis = bases[assetId] ?? 0;
  const cashDelta = order.units * fillPrice;
  let realized = 0;
  if (order.side === 'buy') {
    if (owner === 'player') next.cash -= cashDelta;
    book[assetId] = held + order.units;
    bases[assetId] = priorBasis + cashDelta;
  } else {
    if (owner === 'player') next.cash += cashDelta;
    const soldBasis = held > 0 ? Math.round((priorBasis * order.units) / held) : 0;
    realized = cashDelta - soldBasis;
    book[assetId] = held - order.units;
    bases[assetId] = priorBasis - soldBasis;
    if ((book[assetId] ?? 0) <= 0) {
      book[assetId] = 0;
      bases[assetId] = 0;
    }
  }
  next.markets.portfolios = { ...next.markets.portfolios, [owner]: book };
  next.markets.costBases = { ...next.markets.costBases, [owner]: bases };
  return { cashDelta, realized };
}

/**
 * Fill / expire working orders.
 * Settle: new last, prior last (mark while the ticket was live), and the
 * quarter tape range. Transmit: pass `{ now: true }` so only the official mark
 * can fill a marketable limit immediately — day TIF does not expire.
 * Mutates the cloned `next` run state in place (caller already cloned).
 */
export function resolveWorkingOrders(next, resolvingQuarter, opts = {}) {
  const now = Boolean(opts.now);
  next.markets = ensureMarketsShape(next.markets, next.seed);
  const orders = next.markets.orders.map((row) => ({ ...row }));
  const fills = [...(next.markets.fills ?? [])];
  const events = [];

  const sorted = [...orders].sort((a, b) => a.id.localeCompare(b.id));
  const cancelledGroups = new Set();

  const parentFilled = (order) => {
    if (!order.bracket) return true;
    const parentId = String(order.id).replace(/-sl$/, '').replace(/-tp$/, '');
    const parent = orders.find((row) => row.id === parentId);
    if (!parent) return true;
    return parent.status === 'filled';
  };

  for (const order of sorted) {
    if (order.status !== 'working') continue;
    if (order.bracket && !parentFilled(order)) continue;
    if (cancelledGroups.has(order.groupId)) {
      order.status = 'cancelled';
      order.cancelReason = 'oco';
      order.resolvedQuarter = next.quarter;
      continue;
    }
    const tape = opts.marks && Number.isFinite(Number(opts.marks[order.assetId]))
      ? Math.max(1, Math.round(Number(opts.marks[order.assetId])))
      : null;
    const last = tape ?? next.markets.prices[order.assetId];
    const prior = next.markets.priorPrices?.[order.assetId];
    if (now && !isLimitMarketable(order, last)) continue;
    const hitLast = triggered(order, last);
    const hitPrior = !now && Number.isFinite(prior) && triggered(order, prior);
    const hitRange = !now && quarterTouched(
      order, next.seed, resolvingQuarter, prior ?? last, next.markets,
    );
    if (hitLast || hitPrior || hitRange) {
      const market = hitLast ? last : hitPrior ? prior : last;
      const fillPrice = improvedFillPrice(order, market);
      const notional = order.units * fillPrice;
      if (order.side === 'buy') {
        const cash = order.owner === 'player' ? next.cash : (next.rival?.cash ?? 0);
        if (cash < notional) {
          order.status = 'cancelled';
          order.cancelReason = 'insufficient-cash';
          order.resolvedQuarter = next.quarter;
          continue;
        }
      } else {
        const held = next.markets.portfolios[order.owner]?.[order.assetId] ?? 0;
        if (held < order.units) {
          // Bracket children wait for the entry fill — do not kill them.
          if (order.bracket) continue;
          order.status = 'cancelled';
          order.cancelReason = 'insufficient-shares';
          order.resolvedQuarter = next.quarter;
          continue;
        }
      }
      const { cashDelta, realized } = applyFillToBook(next, order, fillPrice);
      order.status = 'filled';
      order.filledPrice = fillPrice;
      order.resolvedQuarter = next.quarter;
      const fill = Object.freeze({
        id: `fill-${order.id}`,
        orderId: order.id,
        assetId: order.assetId,
        side: order.side,
        units: order.units,
        price: fillPrice,
        quarter: next.quarter,
        cashDelta,
        realized,
      });
      fills.push(fill);
      events.push({ kind: 'order-fill', ...fill });
      if (order.groupId && order.bracket) cancelledGroups.add(order.groupId);
      continue;
    }
    if (!now && order.tif === 'day' && order.placedQuarter === resolvingQuarter) {
      order.status = 'expired';
      order.resolvedQuarter = next.quarter;
      events.push({ kind: 'order-expired', orderId: order.id, assetId: order.assetId });
    }
  }
  for (const order of orders) {
    if (order.status !== 'working' || !order.groupId) continue;
    if (!cancelledGroups.has(order.groupId)) continue;
    order.status = 'cancelled';
    order.cancelReason = 'oco';
    order.resolvedQuarter = next.quarter;
  }

  next.markets.orders = orders;
  next.markets.fills = fills.slice(-80);
  next.markets.reservedCash = {
    ...next.markets.reservedCash,
    player: recomputeReserved(next.markets, 'player'),
    rival: recomputeReserved(next.markets, 'rival'),
  };
  return events;
}

/** Marketable limits / take-profits fill at the given marks (else official last). */
export function tryFillWorkingOrdersNow(next, opts = {}) {
  return resolveWorkingOrders(next, next.quarter, { now: true, marks: opts.marks ?? null });
}

export function bracketChildRows({
  id, assetId, units, tif, venueId, quarter, stopLoss, takeProfit,
}) {
  const rows = [];
  const groupId = `oco-${id}`;
  if (Number.isInteger(stopLoss) && stopLoss >= 1) {
    rows.push({
      id: `${id}-sl`,
      owner: 'player',
      assetId,
      side: 'sell',
      units,
      orderType: 'stop',
      tif,
      limitPrice: null,
      stopPrice: stopLoss,
      status: 'working',
      placedQuarter: quarter,
      venueId,
      reservedCash: 0,
      groupId,
      bracket: 'stop-loss',
    });
  }
  if (Number.isInteger(takeProfit) && takeProfit >= 1) {
    rows.push({
      id: `${id}-tp`,
      owner: 'player',
      assetId,
      side: 'sell',
      units,
      orderType: 'take-profit',
      tif,
      limitPrice: takeProfit,
      stopPrice: null,
      status: 'working',
      placedQuarter: quarter,
      venueId,
      reservedCash: 0,
      groupId,
      bracket: 'take-profit',
    });
  }
  return rows;
}

export function attachBracketDrafts(parent, { stopLoss, takeProfit, last }) {
  const children = [];
  if (parent.side !== 'buy') return children;
  if (Number.isInteger(stopLoss) && stopLoss >= 1) {
    children.push({
      orderType: 'stop',
      side: 'sell',
      units: parent.units,
      stopPrice: stopLoss,
      limitPrice: null,
      tif: parent.tif,
      parentHint: 'stop-loss',
    });
  }
  if (Number.isInteger(takeProfit) && takeProfit >= 1) {
    children.push({
      orderType: 'take-profit',
      side: 'sell',
      units: parent.units,
      limitPrice: takeProfit,
      stopPrice: null,
      tif: parent.tif,
      parentHint: 'take-profit',
    });
  }
  void last;
  return children;
}

export { RULES };
