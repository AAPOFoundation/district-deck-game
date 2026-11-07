// Script Lord — Drug Lord 2 loop with licensed pharmaceuticals. No DOM.
// Buy low in one capital, jet, sell high in another. Thirty days. Debt compounds.

import { stream } from './rng.js';

export const ASSET = './assets/img/script-lord';
export const DAYS = 30;
export const START_CASH = 2_000;
export const START_DEBT = 5_500;
export const START_HOLD = 100;
export const INTEREST_BP = 1_000; // 10% per jet
export const HOME_CITY = 'melbourne';
export const MAX_DEBT = 20_000;
export const MIN_BORROW = 500;
export const LAWYER_COST = 6_500;
export const WASH_BP = 6_000; // 60% of net worth → city cash
export const LAWYER_WASH_BP = 8_000; // retainer lifts the wash to 80%
export const COLLECT_DAY = 5;
export const SEIZE_DAY = 20;
/** Base chance the AFP boards a hop. Heat and city audit stack on top. */
export const POLICE_RAID_BASE = 0.018;
export const POLICE_RAID_HEAT = 0.00035;
export const POLICE_RAID_AUDIT = 0.06;
/** When washing takings into city cash: 5%. */
export const POLICE_WASH_RAID_BP = 500;

export const PRODUCTS = Object.freeze([
  { id: 'prozac', name: 'Prozac', lo: 8, hi: 45 },
  { id: 'ambien', name: 'Ambien', lo: 40, hi: 180 },
  { id: 'viagra', name: 'Viagra', lo: 80, hi: 340 },
  { id: 'ritalin', name: 'Ritalin', lo: 140, hi: 520 },
  { id: 'xanax', name: 'Xanax', lo: 220, hi: 980 },
  { id: 'adderall', name: 'Adderall', lo: 480, hi: 2_100 },
  { id: 'vicodin', name: 'Vicodin', lo: 900, hi: 3_800 },
  { id: 'oxycontin', name: 'OxyContin', lo: 2_200, hi: 14_500 },
]);

export const PRODUCT_IDS = Object.freeze(PRODUCTS.map((row) => row.id));

export const PRODUCT_BY_ID = Object.freeze(Object.fromEntries(
  PRODUCTS.map((row) => [row.id, row]),
));

export const HOLD_TIERS = Object.freeze([
  { id: 'satchel', label: 'Satchel', cap: 100, cost: 0 },
  { id: 'crate', label: 'Crate', cap: 150, cost: 8_000 },
  { id: 'van', label: 'Cold-chain van', cap: 200, cost: 22_000 },
]);

export const CITIES = Object.freeze([
  {
    id: 'melbourne', name: 'Melbourne', fare: 0, bank: true, loan: true, audit: 0.10,
    note: 'Home desk · bank · factoring',
    bias: {
      prozac: 1.00, ambien: 1.00, viagra: 1.02, ritalin: 0.98,
      xanax: 1.00, adderall: 1.05, vicodin: 1.00, oxycontin: 1.00,
    },
  },
  {
    id: 'sydney', name: 'Sydney', fare: 180, bank: false, loan: false, audit: 0.14,
    note: 'Harbour demand · stimulants dear',
    bias: {
      prozac: 0.78, ambien: 1.08, viagra: 1.22, ritalin: 1.35,
      xanax: 1.18, adderall: 1.42, vicodin: 1.12, oxycontin: 1.28,
    },
  },
  {
    id: 'brisbane', name: 'Brisbane', fare: 220, bank: false, loan: false, audit: 0.11,
    note: 'Hospital tenders · oxy dumps',
    bias: {
      prozac: 0.92, ambien: 0.88, viagra: 0.95, ritalin: 0.90,
      xanax: 1.25, adderall: 0.96, vicodin: 0.72, oxycontin: 0.68,
    },
  },
  {
    id: 'perth', name: 'Perth', fare: 340, bank: false, loan: false, audit: 0.09,
    note: 'Isolation · wild swings',
    bias: {
      prozac: 1.15, ambien: 1.20, viagra: 0.84, ritalin: 0.70,
      xanax: 0.82, adderall: 0.64, vicodin: 1.18, oxycontin: 1.38,
    },
  },
  {
    id: 'adelaide', name: 'Adelaide', fare: 200, bank: false, loan: false, audit: 0.10,
    note: 'Cheap generics',
    bias: {
      prozac: 0.62, ambien: 0.66, viagra: 0.70, ritalin: 0.88,
      xanax: 0.94, adderall: 1.10, vicodin: 1.06, oxycontin: 1.08,
    },
  },
  {
    id: 'hobart', name: 'Hobart', fare: 260, bank: false, loan: false, audit: 0.08,
    note: 'Small shelf · high ask',
    bias: {
      prozac: 1.18, ambien: 0.74, viagra: 1.30, ritalin: 1.16,
      xanax: 1.22, adderall: 1.24, vicodin: 1.20, oxycontin: 1.16,
    },
  },
  {
    id: 'darwin', name: 'Darwin', fare: 380, bank: false, loan: false, audit: 0.07,
    note: 'Remote dump · oxy cheap',
    bias: {
      prozac: 1.10, ambien: 1.14, viagra: 0.90, ritalin: 1.28,
      xanax: 0.76, adderall: 1.32, vicodin: 0.80, oxycontin: 0.58,
    },
  },
  {
    id: 'canberra', name: 'Canberra', fare: 160, bank: false, loan: false, audit: 0.22,
    note: 'TGA desk · more audits',
    bias: {
      prozac: 0.96, ambien: 0.98, viagra: 1.00, ritalin: 0.74,
      xanax: 0.90, adderall: 0.92, vicodin: 1.04, oxycontin: 1.06,
    },
  },
]);

export const CITY_BY_ID = Object.freeze(Object.fromEntries(
  CITIES.map((row) => [row.id, row]),
));

export function makeRng(seed = 1) {
  let s = (Number(seed) >>> 0) || 1;
  return {
    next() {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0x1_0000_0000;
    },
    int(max) {
      return Math.floor(this.next() * max);
    },
    pick(list) {
      return list[this.int(list.length)];
    },
    state() {
      return s;
    },
    set(value) {
      s = (Number(value) >>> 0) || 1;
    },
  };
}

function emptyStock() {
  return Object.fromEntries(PRODUCT_IDS.map((id) => [id, 0]));
}

function emptyAvg() {
  return emptyStock();
}

export function ensureAvg(career) {
  if (!career.avgCost) career.avgCost = emptyAvg();
  return career;
}

export function avgOf(career, id) {
  if ((career.stock?.[id] ?? 0) < 1) return 0;
  return career.avgCost?.[id] ?? 0;
}

function addLots(career, id, qty, unitCost) {
  ensureAvg(career);
  const have = career.stock[id] ?? 0;
  const prev = (career.avgCost[id] ?? 0) * have;
  const nextHave = have + qty;
  career.stock[id] = nextHave;
  career.avgCost[id] = nextHave > 0 ? Math.round((prev + unitCost * qty) / nextHave) : 0;
}

function takeLots(career, id, qty) {
  ensureAvg(career);
  career.stock[id] = Math.max(0, (career.stock[id] ?? 0) - qty);
  if (career.stock[id] < 1) career.avgCost[id] = 0;
}

export function stockCost(career) {
  return PRODUCT_IDS.reduce((sum, id) => {
    const have = career.stock?.[id] ?? 0;
    if (have < 1) return sum;
    return sum + have * (career.avgCost?.[id] ?? 0);
  }, 0);
}

export function unrealized(career) {
  return stockMark(career) - stockCost(career);
}

export function washBp(career) {
  return career?.lawyer ? LAWYER_WASH_BP : WASH_BP;
}

export function washPct(career) {
  return Math.round(washBp(career) / 100);
}

function clone(value) {
  return structuredClone(value);
}

function rngOf(career) {
  const rng = makeRng(1);
  rng.set(career.rngState || 1);
  return rng;
}

function commit(career, rng, patch) {
  return { ...career, ...patch, rngState: rng.state() };
}

function pushLog(career, line) {
  const log = [...(career.log ?? []), line].slice(-12);
  return { ...career, log };
}

export function productOf(id) {
  return PRODUCT_BY_ID[id] ?? null;
}

export function cityOf(id) {
  return CITY_BY_ID[id] ?? null;
}

export function heldUnits(career) {
  return PRODUCT_IDS.reduce((sum, id) => sum + (career.stock?.[id] ?? 0), 0);
}

export function stockMark(career) {
  return PRODUCT_IDS.reduce((sum, id) => (
    sum + (career.stock?.[id] ?? 0) * (career.prices?.[id] ?? 0)
  ), 0);
}

export function netWorth(career) {
  return (career.cash ?? 0) + (career.bank ?? 0) + stockMark(career) - (career.debt ?? 0);
}

export function cityPayout(career) {
  if (career?.endReason === 'raided') return 0;
  return Math.max(0, Math.round(netWorth(career) * (washBp(career) / 10_000)));
}

export function policeRaidChance(career) {
  const city = cityOf(career?.cityId);
  const raw = POLICE_RAID_BASE
    + (career?.heat ?? 0) * POLICE_RAID_HEAT
    + (city?.audit ?? 0) * POLICE_RAID_AUDIT;
  const chance = career?.lawyer ? raw * 0.5 : raw;
  return Math.max(0.005, Math.min(0.18, chance));
}

export function scriptLordWashRaidHits(seed, quarter) {
  return stream(seed, `script-lord:wash-raid:q${quarter}`).int(0, 9999) < POLICE_WASH_RAID_BP;
}

export function holdTier(career) {
  const cap = career.holdCap ?? START_HOLD;
  return HOLD_TIERS.find((row) => row.cap === cap) ?? HOLD_TIERS[0];
}

export function nextHoldTier(career) {
  const current = holdTier(career);
  const index = HOLD_TIERS.findIndex((row) => row.id === current.id);
  return HOLD_TIERS[index + 1] ?? null;
}

export function fareTo(career, cityId) {
  if (cityId === career.cityId) return 0;
  return cityOf(cityId)?.fare ?? 200;
}

export function midPrice(product) {
  return Math.round((product.lo + product.hi) / 2);
}

export function priceTag(product, price) {
  const mid = midPrice(product);
  if (price <= product.lo * 0.85 || price <= mid * 0.62) return 'cheap';
  if (price >= product.hi * 1.15 || price >= mid * 1.7) return 'spike';
  return 'fair';
}

export function rollPrices(city, rng) {
  const prices = {};
  for (const product of PRODUCTS) {
    const bias = city.bias[product.id] ?? 1;
    const roll = rng.next();
    if (roll < 0.06) {
      prices[product.id] = Math.max(1, Math.round(product.lo * (0.48 + rng.next() * 0.18) * bias));
    } else if (roll < 0.12) {
      prices[product.id] = Math.round(product.hi * (2.2 + rng.next() * 1.8) * bias);
    } else {
      const u = 0.12 + rng.next() * 0.76;
      prices[product.id] = Math.max(1, Math.round((product.lo + (product.hi - product.lo) * u) * bias));
    }
  }
  return prices;
}

export function startCareer(seed = 1) {
  const rng = makeRng(seed);
  const city = cityOf(HOME_CITY);
  const prices = rollPrices(city, rng);
  return {
    seed: Number(seed) || 1,
    rngState: rng.state(),
    day: 1,
    cityId: HOME_CITY,
    cash: START_CASH,
    bank: 0,
    debt: START_DEBT,
    holdCap: START_HOLD,
    stock: emptyStock(),
    avgCost: emptyAvg(),
    prices,
    lawyer: false,
    heat: 0,
    log: [
      'Wholesale desk open. Thirty days on the capital circuit.',
      `Factoring desk booked you for ${START_DEBT.toLocaleString('en-AU')} at 10% a hop.`,
    ],
    event: null,
    phase: 'play',
    endReason: null,
    history: [{ day: 1, cityId: HOME_CITY, prices: { ...prices } }],
  };
}

export function maxBuy(career, productId) {
  const price = career.prices?.[productId];
  if (!price) return 0;
  const room = Math.max(0, (career.holdCap ?? 0) - heldUnits(career));
  return Math.min(room, Math.floor((career.cash ?? 0) / price));
}

export function maxSell(career, productId) {
  return career.stock?.[productId] ?? 0;
}

export function buy(career, productId, qty) {
  if (career.phase !== 'play') return fail(career, 'Desk is closed.');
  const product = productOf(productId);
  if (!product) return fail(career, 'Unknown line.');
  const n = Math.max(0, Math.round(Number(qty) || 0));
  if (n < 1) return fail(career, 'Buy at least one unit.');
  const price = career.prices[productId];
  const cost = price * n;
  if (career.cash < cost) return fail(career, `Need $${cost.toLocaleString('en-AU')}.`);
  if (heldUnits(career) + n > career.holdCap) return fail(career, 'Hold is full.');
  const next = clone(career);
  delete next.lastError;
  next.cash -= cost;
  addLots(next, productId, n, price);
  return pushLog(next, `Bought ${n} ${product.name} @ $${price.toLocaleString('en-AU')} · avg $${avgOf(next, productId).toLocaleString('en-AU')}.`);
}

export function sell(career, productId, qty) {
  if (career.phase !== 'play') return fail(career, 'Desk is closed.');
  const product = productOf(productId);
  if (!product) return fail(career, 'Unknown line.');
  const n = Math.max(0, Math.round(Number(qty) || 0));
  if (n < 1) return fail(career, 'Sell at least one unit.');
  if ((career.stock[productId] ?? 0) < n) return fail(career, `Only ${career.stock[productId] ?? 0} on hand.`);
  const price = career.prices[productId];
  const avg = avgOf(career, productId);
  const pnl = (price - avg) * n;
  const next = clone(career);
  delete next.lastError;
  takeLots(next, productId, n);
  next.cash += price * n;
  const sign = pnl >= 0 ? '+' : '−';
  return pushLog(next, `Sold ${n} ${product.name} @ $${price.toLocaleString('en-AU')} · avg $${avg.toLocaleString('en-AU')} · ${sign}$${Math.abs(pnl).toLocaleString('en-AU')}.`);
}

function fail(career, reason) {
  return { ...career, lastError: reason };
}

export function lastError(career) {
  return career.lastError ?? null;
}

export function clearError(career) {
  if (!career.lastError) return career;
  const next = { ...career };
  delete next.lastError;
  return next;
}

function compoundDebt(debt) {
  if (debt <= 0) return 0;
  return Math.ceil(debt * (1 + INTEREST_BP / 10_000));
}

export function jet(career, cityId) {
  if (career.phase !== 'play') return fail(career, 'Desk is closed.');
  const dest = cityOf(cityId);
  if (!dest) return fail(career, 'No such city.');
  if (dest.id === career.cityId) return fail(career, 'Already on the ground here.');
  const fare = fareTo(career, dest.id);
  if (career.cash < fare) return fail(career, `Airfare is $${fare.toLocaleString('en-AU')}.`);
  const rng = rngOf(career);
  const next = clone(career);
  delete next.lastError;
  next.cash -= fare;
  next.day += 1;
  next.debt = compoundDebt(next.debt);
  next.cityId = dest.id;
  next.prices = rollPrices(dest, rng);
  next.history = [...next.history, { day: next.day, cityId: dest.id, prices: { ...next.prices } }].slice(-30);
  next.log = [...next.log, `Jet to ${dest.name}. Day ${next.day}.`].slice(-12);
  if (next.day > DAYS) return commit(endCareer(next, 'days'), rng, {});
  const event = rollEvent(next, rng);
  if (event) {
    next.event = event;
    next.phase = 'event';
    next.log = [...next.log, event.title].slice(-12);
  }
  return commit(next, rng, {});
}

function rollEvent(career, rng) {
  if (career.cityId === HOME_CITY && career.debt > 0 && career.day >= COLLECT_DAY) {
    if (career.day >= SEIZE_DAY || rng.next() < 0.55) return financierEvent(career);
  }
  if (rng.next() < policeRaidChance(career)) return policeEvent();
  const city = cityOf(career.cityId);
  const chance = 0.28 + (career.heat ?? 0) / 220 + (city?.audit ?? 0) * 0.35;
  if (rng.next() > chance) return null;
  const bag = ['tga-audit', 'hospital', 'patent', 'leftover', 'mugger', 'dump', 'heat'];
  if ((city?.audit ?? 0) > 0.18) bag.push('tga-audit', 'tga-audit');
  const kind = rng.pick(bag);
  if (kind === 'tga-audit') return tgaEvent(career, rng);
  if (kind === 'hospital') return hospitalEvent(career, rng);
  if (kind === 'patent') return patentEvent(career, rng);
  if (kind === 'leftover') return leftoverEvent(career, rng);
  if (kind === 'mugger') return muggerEvent(career, rng);
  if (kind === 'dump') return dumpEvent(career, rng);
  return {
    id: 'heat',
    title: 'A wholesaler named you on a tip line.',
    body: 'Heat is up. The next few hops are noisier.',
    choices: [{ id: 'ok', label: 'Noted' }],
    payload: { heat: 18 },
  };
}

function financierEvent(career) {
  const due = career.debt;
  return {
    id: 'financier',
    title: 'The compound desk wants a payment.',
    body: `Outstanding $${due.toLocaleString('en-AU')}. Pay here in Melbourne or they start seizing.`,
    choices: [
      { id: 'pay-all', label: `Pay $${due.toLocaleString('en-AU')}` },
      { id: 'pay-half', label: 'Pay half' },
      { id: 'skip', label: 'Walk past' },
    ],
    payload: { due },
  };
}

function tgaEvent(career, rng) {
  const fine = 700 + rng.int(1_900);
  const cut = career.lawyer ? 0.12 : 0.28 + rng.next() * 0.14;
  return {
    id: 'tga-audit',
    title: 'TGA inspectors meet you at the gate.',
    body: career.lawyer
      ? `Retainer holds. Fine is lighter, or they skim ${Math.round(cut * 100)}% of the hold.`
      : `Pay a fine or they take ${Math.round(cut * 100)}% of the hold as unlicensed stock.`,
    choices: [
      { id: 'fine', label: `Pay $${fine.toLocaleString('en-AU')} fine` },
      { id: 'forfeit', label: 'Forfeit stock' },
    ],
    payload: { fine, cut },
  };
}

function hospitalEvent(career, rng) {
  const product = rng.pick(PRODUCTS);
  const price = Math.max(1, Math.round(product.lo * 0.52));
  return {
    id: 'hospital',
    title: `${cityOf(career.cityId).name} hospital cancelled a tender.`,
    body: `${product.name} is on the loading dock at $${price.toLocaleString('en-AU')}.`,
    choices: [
      { id: 'take', label: `Lock ${product.name} at $${price.toLocaleString('en-AU')}` },
      { id: 'pass', label: 'Leave it' },
    ],
    payload: { productId: product.id, price },
  };
}

function patentEvent(career, rng) {
  const product = rng.pick(PRODUCTS);
  const price = Math.round(product.hi * (2.6 + rng.next() * 1.6));
  return {
    id: 'patent',
    title: 'Patent-extension rumour hits the circuit.',
    body: `${product.name} just spiked to $${price.toLocaleString('en-AU')}.`,
    choices: [
      { id: 'take', label: `Mark ${product.name} to the spike` },
      { id: 'pass', label: 'Ignore the rumour' },
    ],
    payload: { productId: product.id, price },
  };
}

function leftoverEvent(career, rng) {
  const product = rng.pick(PRODUCTS);
  const qty = 2 + rng.int(5);
  return {
    id: 'leftover',
    title: 'A chemist left a sealed carton on the counter.',
    body: `${qty} units of ${product.name}. Take them if the hold has room.`,
    choices: [
      { id: 'take', label: `Take ${qty} ${product.name}` },
      { id: 'pass', label: 'Leave it' },
    ],
    payload: { productId: product.id, qty },
  };
}

function muggerEvent(career, rng) {
  const cut = 0.12 + rng.next() * 0.16;
  const loss = Math.max(0, Math.round(career.cash * cut));
  return {
    id: 'mugger',
    title: 'Someone lifts the cash envelope at the taxi rank.',
    body: `Banked funds are safe. Cash on hand is exposed. About $${loss.toLocaleString('en-AU')}.`,
    choices: [{ id: 'ok', label: 'Count what is left' }],
    payload: { loss },
  };
}

function policeEvent() {
  return {
    id: 'police',
    title: 'AFP intercepts the shipment.',
    body: 'They are treating the circuit as drug trafficking. Career stock is gone, and they freeze every city asset back to your opening NAV.',
    choices: [{ id: 'ok', label: 'They take the lot' }],
    payload: {},
  };
}

function dumpEvent(career, rng) {
  const picks = [...PRODUCTS].sort(() => rng.next() - 0.5).slice(0, 3);
  const prices = {};
  for (const product of picks) prices[product.id] = Math.max(1, Math.round(product.lo * 0.7));
  return {
    id: 'dump',
    title: 'A suburban chemist is closing the books.',
    body: `${picks.map((row) => row.name).join(', ')} are marked down.`,
    choices: [
      { id: 'take', label: 'Take the markdowns' },
      { id: 'pass', label: 'Walk on' },
    ],
    payload: { prices },
  };
}

export function resolveEvent(career, choiceId) {
  if (career.phase !== 'event' || !career.event) return fail(career, 'No event on the desk.');
  const event = career.event;
  const choice = event.choices.find((row) => row.id === choiceId);
  if (!choice) return fail(career, 'That is not on offer.');
  const next = clone(career);
  next.event = null;
  next.phase = 'play';
  delete next.lastError;
  const { payload } = event;
  if (event.id === 'financier') return resolveFinancier(next, choiceId);
  if (event.id === 'tga-audit') return resolveTga(next, choiceId, payload);
  if (event.id === 'hospital' || event.id === 'patent') {
    if (choiceId === 'take') {
      next.prices[payload.productId] = payload.price;
      return pushLog(next, `${productOf(payload.productId).name} is now $${payload.price.toLocaleString('en-AU')}.`);
    }
    return pushLog(next, 'You left the special on the floor.');
  }
  if (event.id === 'leftover') {
    if (choiceId === 'take') {
      const room = next.holdCap - heldUnits(next);
      const take = Math.min(room, payload.qty);
      if (take < 1) return pushLog(next, 'Hold is full. Carton stays.');
      addLots(next, payload.productId, take, 0);
      return pushLog(next, `Took ${take} ${productOf(payload.productId).name} · avg $${avgOf(next, payload.productId).toLocaleString('en-AU')}.`);
    }
    return pushLog(next, 'Left the carton.');
  }
  if (event.id === 'mugger') {
    next.cash = Math.max(0, next.cash - payload.loss);
    return pushLog(next, `Lost $${payload.loss.toLocaleString('en-AU')} off the envelope.`);
  }
  if (event.id === 'dump') {
    if (choiceId === 'take') {
      next.prices = { ...next.prices, ...payload.prices };
      return pushLog(next, 'Markdowns locked.');
    }
    return pushLog(next, 'Passed the closing-down sale.');
  }
  if (event.id === 'heat') {
    next.heat = Math.min(100, next.heat + (payload.heat ?? 18));
    return pushLog(next, 'Heat is up.');
  }
  if (event.id === 'police') return raidCareer(next);
  return next;
}

export function raidCareer(career) {
  const next = clone(career);
  for (const id of PRODUCT_IDS) takeLots(next, id, next.stock[id] ?? 0);
  next.cash = 0;
  next.bank = 0;
  next.debt = 0;
  next.event = null;
  next.phase = 'ended';
  next.endReason = 'raided';
  next.payout = 0;
  next.log = [...(next.log ?? []),
    'AFP seized the circuit for trafficking.',
    'City books reset to opening NAV. No wash.',
  ].slice(-12);
  return next;
}

function resolveFinancier(career, choiceId) {
  const due = career.debt;
  const liquid = career.cash + career.bank;
  if (choiceId === 'pay-all') {
    if (liquid < due) {
      if (career.day >= SEIZE_DAY) return seize(career);
      career.heat = Math.min(100, career.heat + 20);
      return pushLog(career, 'Not enough cash and bank to clear the desk.');
    }
    return payDebt(career, due);
  }
  if (choiceId === 'pay-half') {
    const half = Math.ceil(due / 2);
    if (liquid < half) {
      career.heat = Math.min(100, career.heat + 16);
      return pushLog(career, 'Could not cover half.');
    }
    return payDebt(career, half);
  }
  career.heat = Math.min(100, career.heat + 22);
  if (career.day >= SEIZE_DAY) return seize(career);
  return pushLog(career, 'You walked past the compound desk. They noticed.');
}

function payDebt(career, amount) {
  let left = Math.min(amount, career.debt);
  const fromCash = Math.min(career.cash, left);
  career.cash -= fromCash;
  left -= fromCash;
  const fromBank = Math.min(career.bank, left);
  career.bank -= fromBank;
  career.debt -= fromCash + fromBank;
  return pushLog(career, `Paid $${(fromCash + fromBank).toLocaleString('en-AU')} to the compound desk.`);
}

function seize(career) {
  const next = payDebt(career, career.debt);
  if (next.debt <= 0) return pushLog(next, 'Desk cleared under threat of seizure.');
  for (const id of PRODUCT_IDS) takeLots(next, id, next.stock[id] ?? 0);
  next.cash = 0;
  next.bank = 0;
  return endCareer(next, 'seized');
}

function resolveTga(career, choiceId, payload) {
  if (choiceId === 'fine') {
    const fine = career.lawyer ? Math.round(payload.fine * 0.45) : payload.fine;
    if (career.cash + career.bank < fine) {
      return forfeitStock(career, payload.cut, 'Could not cover the fine. They took stock.');
    }
    let left = fine;
    const fromCash = Math.min(career.cash, left);
    career.cash -= fromCash;
    left -= fromCash;
    career.bank -= left;
    career.heat = Math.max(0, career.heat - 8);
    return pushLog(career, `Paid $${fine.toLocaleString('en-AU')} TGA fine.`);
  }
  return forfeitStock(career, payload.cut, 'Inspectors took a cut of the hold.');
}

function forfeitStock(career, cut, line) {
  ensureAvg(career);
  for (const id of PRODUCT_IDS) {
    const have = career.stock[id] ?? 0;
    const keep = Math.max(0, Math.floor(have * (1 - cut)));
    takeLots(career, id, have - keep);
  }
  career.heat = Math.min(100, career.heat + 10);
  return pushLog(career, line);
}

export function deposit(career, amount) {
  if (career.phase !== 'play') return fail(career, 'Desk is closed.');
  if (career.cityId !== HOME_CITY) return fail(career, 'Bank is in Melbourne.');
  const n = Math.max(0, Math.round(Number(amount) || 0));
  if (n < 1) return fail(career, 'Deposit something.');
  if (career.cash < n) return fail(career, 'Not enough cash-on-hand.');
  const next = clone(career);
  delete next.lastError;
  next.cash -= n;
  next.bank += n;
  return pushLog(next, `Banked $${n.toLocaleString('en-AU')}.`);
}

export function withdraw(career, amount) {
  if (career.phase !== 'play') return fail(career, 'Desk is closed.');
  if (career.cityId !== HOME_CITY) return fail(career, 'Bank is in Melbourne.');
  const n = Math.max(0, Math.round(Number(amount) || 0));
  if (n < 1) return fail(career, 'Withdraw something.');
  if (career.bank < n) return fail(career, 'Not enough in the book.');
  const next = clone(career);
  delete next.lastError;
  next.bank -= n;
  next.cash += n;
  return pushLog(next, `Drew $${n.toLocaleString('en-AU')}.`);
}

export function borrow(career, amount) {
  if (career.phase !== 'play') return fail(career, 'Desk is closed.');
  if (career.cityId !== HOME_CITY) return fail(career, 'Factoring desk is in Melbourne.');
  const n = Math.max(0, Math.round(Number(amount) || 0));
  if (n < MIN_BORROW) return fail(career, `Minimum borrow is $${MIN_BORROW.toLocaleString('en-AU')}.`);
  if (career.debt + n > MAX_DEBT) return fail(career, `Desk caps debt at $${MAX_DEBT.toLocaleString('en-AU')}.`);
  const next = clone(career);
  delete next.lastError;
  next.debt += n;
  next.cash += n;
  return pushLog(next, `Drew $${n.toLocaleString('en-AU')} from the compound desk.`);
}

export function repay(career, amount) {
  if (career.phase !== 'play') return fail(career, 'Desk is closed.');
  if (career.cityId !== HOME_CITY) return fail(career, 'Factoring desk is in Melbourne.');
  const n = Math.max(0, Math.round(Number(amount) || 0));
  if (n < 1) return fail(career, 'Repay something.');
  if (career.debt < 1) return fail(career, 'Nothing on the book.');
  const pay = Math.min(n, career.debt, career.cash);
  if (pay < 1) return fail(career, 'No cash-on-hand to pay.');
  const next = clone(career);
  delete next.lastError;
  next.cash -= pay;
  next.debt -= pay;
  return pushLog(next, `Repaid $${pay.toLocaleString('en-AU')}.`);
}

export function upgradeHold(career) {
  if (career.phase !== 'play') return fail(career, 'Desk is closed.');
  const nextTier = nextHoldTier(career);
  if (!nextTier) return fail(career, 'Hold is already at the van.');
  if (career.cash < nextTier.cost) {
    return fail(career, `${nextTier.label} costs $${nextTier.cost.toLocaleString('en-AU')}.`);
  }
  const next = clone(career);
  delete next.lastError;
  next.cash -= nextTier.cost;
  next.holdCap = nextTier.cap;
  return pushLog(next, `Hold is now a ${nextTier.label.toLowerCase()} (${nextTier.cap}).`);
}

export function hireLawyer(career) {
  if (career.phase !== 'play') return fail(career, 'Desk is closed.');
  if (career.lawyer) return fail(career, 'Retainer is already live.');
  if (career.cash < LAWYER_COST) {
    return fail(career, `Retainer is $${LAWYER_COST.toLocaleString('en-AU')}.`);
  }
  const next = clone(career);
  delete next.lastError;
  next.cash -= LAWYER_COST;
  next.lawyer = true;
  next.heat = Math.max(0, next.heat - 12);
  return pushLog(next, `Compliance retainer on the books. Audits hurt less. Wash on cash-out is ${washPct(next)}%.`);
}

export function retainCounsel(career) {
  if (career.phase !== 'ended') return fail(career, 'Books are still open.');
  if (career.lawyer) return fail(career, 'Retainer is already live.');
  if (career.cash < LAWYER_COST) {
    return fail(career, `Retainer is $${LAWYER_COST.toLocaleString('en-AU')}.`);
  }
  const next = clone(career);
  delete next.lastError;
  next.cash -= LAWYER_COST;
  next.lawyer = true;
  next.payout = cityPayout(next);
  return pushLog(next, `Counsel retained for the wash. City settlement is now $${next.payout.toLocaleString('en-AU')}.`);
}

export function retire(career) {
  if (career.phase === 'ended') return career;
  return endCareer(clone(career), 'retired');
}

function endCareer(career, reason) {
  const next = clone(career);
  if (next.debt > 0) {
    const paid = payDebt(next, next.debt);
    Object.assign(next, paid);
  }
  if (next.debt > 0) {
    for (const id of PRODUCT_IDS) {
      const have = next.stock[id] ?? 0;
      const fire = Math.round((next.prices[id] ?? 0) * 0.5);
      next.cash += have * fire;
      takeLots(next, id, have);
    }
    payDebt(next, next.debt);
  }
  next.phase = 'ended';
  next.endReason = reason;
  next.event = null;
  next.payout = cityPayout(next);
  const why = reason === 'days' ? 'Day 30. Books close.'
    : reason === 'seized' ? 'The compound desk seized the lot.'
      : 'You retired the licence.';
  next.log = [...next.log, why, `Wash ${washPct(next)}% · settlement $${next.payout.toLocaleString('en-AU')} to the city books.`].slice(-12);
  return next;
}

export function cityRumor(city, prices) {
  let best = null;
  for (const product of PRODUCTS) {
    const tag = priceTag(product, prices[product.id]);
    const score = tag === 'cheap' ? product.hi / prices[product.id]
      : tag === 'spike' ? prices[product.id] / product.lo
        : 0;
    if (!best || score > best.score) best = { product, tag, score, price: prices[product.id] };
  }
  if (!best || best.score < 1.4) return city.note;
  if (best.tag === 'cheap') return `${best.product.name} cheap`;
  if (best.tag === 'spike') return `${best.product.name} spike`;
  return city.note;
}

export function remandOnBoard(city) {
  return (city?.civicUses ?? []).find((row) => row.useId === 'remand-centre') ?? null;
}
