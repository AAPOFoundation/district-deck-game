// Deterministic market narrative. Three authored forks at every beat.
// Seed picks the fork — no Math.random, no network. Prices still settle in markets.js.

import { stream } from './rng.js';

const CLASS = Object.freeze({
  NVDA: 'equity', AAPL: 'equity', MSFT: 'equity', AMZN: 'equity',
  GOOGL: 'equity', META: 'equity', TSLA: 'equity',
  BTC: 'crypto', ETH: 'crypto', SOL: 'crypto',
  XAU: 'commodity', CL: 'commodity', KC: 'commodity',
});
const TICKERS = Object.freeze(Object.keys(CLASS));

function pick3(seed, key) {
  return stream(seed, key).int(0, 2);
}

/** Quarterly world beats — inspired by real tape, not live news. */
export const QUARTER_BEATS = Object.freeze([
  Object.freeze({
    id: 'fomc',
    title: 'FOMC week',
    scenarios: Object.freeze([
      Object.freeze({
        id: 'cut',
        headline: 'Fed cuts 25bp · dollar softens',
        body: 'Front-end yields drop. Growth and crypto bid; gold gives back some haven premium.',
        bias: { equity: 380, crypto: 620, XAU: -180, CL: 80, KC: 40 },
      }),
      Object.freeze({
        id: 'hold',
        headline: 'Fed on hold · data-dependent',
        body: 'No new guidance. Tape chops around carry; mega-caps grind.',
        bias: { equity: 80, crypto: 40, XAU: 60, CL: 20, KC: 10 },
      }),
      Object.freeze({
        id: 'hawk',
        headline: 'Hawkish hold · higher-for-longer',
        body: 'Dot plot refuses to ease. Duration and high-beta sold; gold steadies.',
        bias: { equity: -520, crypto: -780, XAU: 220, CL: -90, KC: -40, NVDA: -200, TSLA: -260 },
      }),
    ]),
  }),
  Object.freeze({
    id: 'ai-capex',
    title: 'AI capex season',
    scenarios: Object.freeze([
      Object.freeze({
        id: 'beat',
        headline: 'Hyperscalers raise AI spend',
        body: 'Cloud guides up. NVDA, MSFT, AMZN, GOOGL lead; power and copper chatter lifts oil a touch.',
        bias: { NVDA: 900, MSFT: 420, AMZN: 280, GOOGL: 260, META: 240, equity: 120, crypto: 180, CL: 70 },
      }),
      Object.freeze({
        id: 'digest',
        headline: 'Capex in-line · digestion',
        body: 'Spend holds, margins watched. Semis pause after the run.',
        bias: { NVDA: 80, MSFT: 40, equity: 30, crypto: -40 },
      }),
      Object.freeze({
        id: 'pause',
        headline: 'AI spend pause scare',
        body: 'One major pauses a cluster. Multiple compression hits the whole AI complex.',
        bias: { NVDA: -1100, MSFT: -380, AMZN: -240, GOOGL: -220, META: -280, equity: -200, crypto: -320 },
      }),
    ]),
  }),
  Object.freeze({
    id: 'opec',
    title: 'OPEC+ / energy',
    scenarios: Object.freeze([
      Object.freeze({
        id: 'cut-supply',
        headline: 'OPEC+ deepens cuts',
        body: 'Barrels pulled. Crude jumps; airlines and goods inflation worry the tape.',
        bias: { CL: 1600, KC: 180, XAU: 120, equity: -180, TSLA: -220, crypto: -120 },
      }),
      Object.freeze({
        id: 'hold-quota',
        headline: 'Quotas rolled · oil rangebound',
        body: 'Compliance mixed. WTI chops; no new inflation pulse.',
        bias: { CL: 40, equity: 20 },
      }),
      Object.freeze({
        id: 'unwind',
        headline: 'OPEC+ unwind talk',
        body: 'Supply returning. Crude sold; real incomes and growth names catch a bid.',
        bias: { CL: -900, equity: 160, TSLA: 180, crypto: 80 },
      }),
    ]),
  }),
  Object.freeze({
    id: 'harvest',
    title: 'Softs / harvest',
    scenarios: Object.freeze([
      Object.freeze({
        id: 'frost',
        headline: 'Brazilian frost hits arabica',
        body: 'Arabica spikes. Food inflation ticks; gold bids as real rates wobble.',
        bias: { KC: 1800, XAU: 90, equity: -60 },
      }),
      Object.freeze({
        id: 'normal',
        headline: 'Harvest in-line',
        body: 'USDA quietly confirms. Arabica fades back to range.',
        bias: { KC: -40, equity: 20 },
      }),
      Object.freeze({
        id: 'glut',
        headline: 'Record crop · arabica glut',
        body: 'Warehouses full. KC sold; consumer staples catch a small bid.',
        bias: { KC: -1100, AAPL: 40, AMZN: 30 },
      }),
    ]),
  }),
]);

export const YEAR_BEATS = Object.freeze([
  Object.freeze({
    id: 'regime',
    title: 'Year regime',
    scenarios: Object.freeze([
      Object.freeze({
        id: 'boom',
        headline: 'Soft-landing year',
        body: 'Growth holds, inflation cools. Risk-on for the full year overlay.',
        bias: { equity: 220, crypto: 300, XAU: -80, CL: 40 },
      }),
      Object.freeze({
        id: 'stag',
        headline: 'Stagflation scare year',
        body: 'Sticky goods, slower growth. Gold and oil lead; duration and crypto lag.',
        bias: { equity: -280, crypto: -400, XAU: 360, CL: 280, KC: 160 },
      }),
      Object.freeze({
        id: 'recession',
        headline: 'Recession-watch year',
        body: 'Labour cracks. Haven bid in gold and quality cash; cyclicals and crypto sold.',
        bias: { equity: -420, crypto: -700, XAU: 480, CL: -220, AAPL: -80, MSFT: -60, TSLA: -200 },
      }),
    ]),
  }),
]);

const DAILY = Object.freeze({
  NVDA: [
    { headline: 'NVDA · data-center GPU sold out through the quarter', biasBp: 90, kind: 'company' },
    { headline: 'NVDA · China licence rumour — mixed book', biasBp: -40, kind: 'company' },
    { headline: 'NVDA · foundry costs guide a touch higher', biasBp: -70, kind: 'financials' },
  ],
  AAPL: [
    { headline: 'AAPL · services revenue run-rate beats Street', biasBp: 50, kind: 'financials' },
    { headline: 'AAPL · iPhone channel checks in-line', biasBp: 10, kind: 'company' },
    { headline: 'AAPL · EU App Store fine chatter', biasBp: -45, kind: 'company' },
  ],
  MSFT: [
    { headline: 'MSFT · Azure AI attach rate printed hot', biasBp: 55, kind: 'financials' },
    { headline: 'MSFT · OpenAI commercial terms reaffirmed', biasBp: 25, kind: 'company' },
    { headline: 'MSFT · capex digestion — multiple compresses', biasBp: -50, kind: 'financials' },
  ],
  AMZN: [
    { headline: 'AMZN · AWS reacceleration print', biasBp: 60, kind: 'financials' },
    { headline: 'AMZN · Prime fee hike sticks', biasBp: 20, kind: 'company' },
    { headline: 'AMZN · labour action at two hubs', biasBp: -55, kind: 'company' },
  ],
  GOOGL: [
    { headline: 'GOOGL · search + YouTube ads both beat', biasBp: 50, kind: 'financials' },
    { headline: 'GOOGL · antitrust remedy narrower than feared', biasBp: 35, kind: 'company' },
    { headline: 'GOOGL · cloud mix lags Azure for a day', biasBp: -40, kind: 'financials' },
  ],
  META: [
    { headline: 'META · Reels ads fill above plan', biasBp: 55, kind: 'financials' },
    { headline: 'META · Reality Labs spend held', biasBp: 5, kind: 'company' },
    { headline: 'META · engagement dip in two geos', biasBp: -50, kind: 'company' },
  ],
  TSLA: [
    { headline: 'TSLA · deliveries surprise to the upside', biasBp: 80, kind: 'financials' },
    { headline: 'TSLA · FSD vNext staged in two states', biasBp: 40, kind: 'company' },
    { headline: 'TSLA · price cut in China overnight', biasBp: -90, kind: 'company' },
  ],
  BTC: [
    { headline: 'BTC · spot ETF prints a 2nd straight inflow day', biasBp: 70, kind: 'flow' },
    { headline: 'BTC · miner hash-price steady', biasBp: 10, kind: 'company' },
    { headline: 'BTC · leverage flush on perps', biasBp: -80, kind: 'flow' },
  ],
  ETH: [
    { headline: 'ETH · staking queue shortens', biasBp: 45, kind: 'flow' },
    { headline: 'ETH · L2 fee share in-line', biasBp: 10, kind: 'company' },
    { headline: 'ETH · unlock calendar weighs', biasBp: -55, kind: 'flow' },
  ],
  SOL: [
    { headline: 'SOL · DEX volumes make a new local high', biasBp: 70, kind: 'flow' },
    { headline: 'SOL · outage post-mortem: 19 minutes', biasBp: -60, kind: 'company' },
    { headline: 'SOL · ETF filing chatter only', biasBp: 20, kind: 'flow' },
  ],
  XAU: [
    { headline: 'XAU · real yields slip 4bp · bullion bid', biasBp: 50, kind: 'macro' },
    { headline: 'XAU · official-sector buying unconfirmed', biasBp: 15, kind: 'flow' },
    { headline: 'XAU · stronger dollar trims the metal', biasBp: -45, kind: 'macro' },
  ],
  CL: [
    { headline: 'CL · EIA draw larger than consensus', biasBp: 70, kind: 'macro' },
    { headline: 'CL · tanker rates quiet', biasBp: 5, kind: 'flow' },
    { headline: 'CL · demand scare from two PMIs', biasBp: -65, kind: 'macro' },
  ],
  KC: [
    { headline: 'KC · Minas weather desk flags frost risk', biasBp: 80, kind: 'macro' },
    { headline: 'KC · certified inventories unchanged', biasBp: 5, kind: 'flow' },
    { headline: 'KC · Vietnam robusta hedge selling', biasBp: -55, kind: 'macro' },
  ],
});

/** Annualised dividend yield in bp of last (quarterly cash = last × bp / 40000). */
export const DIVIDEND_YIELD_BP = Object.freeze({
  AAPL: 44,
  MSFT: 73,
  GOOGL: 32,
  META: 32,
  AMZN: 0,
  NVDA: 3,
  TSLA: 0,
});

export function quarterNarrative(seed, quarter) {
  const beat = QUARTER_BEATS[(quarter - 1 + QUARTER_BEATS.length) % QUARTER_BEATS.length];
  const idx = pick3(seed, `narrative:q:${quarter}`);
  return Object.freeze({ period: 'quarter', beat, scenario: beat.scenarios[idx], idx });
}

export function yearNarrative(seed, quarter) {
  const year = Math.max(1, Math.ceil(quarter / 4));
  const beat = YEAR_BEATS[(year - 1) % YEAR_BEATS.length];
  const idx = pick3(seed, `narrative:y:${year}`);
  return Object.freeze({ period: 'year', year, beat, scenario: beat.scenarios[idx], idx });
}

export function dailyNarrative(seed, quarter, day, assetId) {
  const pool = DAILY[assetId] ?? DAILY.AAPL;
  const idx = pick3(seed, `narrative:d:${quarter}:${day}:${assetId}`);
  return Object.freeze({ period: 'day', ...pool[idx], idx });
}

function biasFor(scenario, assetId) {
  if (!scenario?.bias) return 0;
  const cls = CLASS[assetId];
  return (scenario.bias[assetId] ?? 0) + (cls ? (scenario.bias[cls] ?? 0) : 0);
}

/** Combined narrative drift in bp for a quarter settle. */
export function narrativeBiasBp(seed, quarter, assetId) {
  const q = quarterNarrative(seed, quarter);
  const y = yearNarrative(seed, quarter);
  return biasFor(q.scenario, assetId) + Math.round(biasFor(y.scenario, assetId) * 0.45);
}

/** Extra daily body in bp for the tape movie. */
export function narrativeDailyBiasBp(seed, quarter, day, assetId) {
  const q = quarterNarrative(seed, quarter);
  const d = dailyNarrative(seed, quarter, day, assetId);
  return Math.round(biasFor(q.scenario, assetId) / 18) + (d.biasBp ?? 0);
}

export function dividendPerUnit(assetId, last) {
  const y = DIVIDEND_YIELD_BP[assetId];
  if (!y || !Number.isFinite(last)) return 0;
  return (last * y) / 40000;
}

export function payDividends(state, owner = 'player') {
  const book = state.markets?.portfolios?.[owner] ?? {};
  const prices = state.markets?.prices ?? {};
  const listings = Object.fromEntries(
    (state.markets?.listings ?? []).map((row) => [row.id, row]),
  );
  const lines = [];
  let cash = 0;
  const ids = new Set([...TICKERS, ...Object.keys(book)]);
  for (const assetId of [...ids].sort()) {
    const units = book[assetId] ?? 0;
    if (units <= 0) continue;
    const listing = listings[assetId];
    if (listing?.quarterlyDividend && listing.sharesOutstanding) {
      const amount = Math.round(
        listing.quarterlyDividend * units / listing.sharesOutstanding,
      );
      if (amount <= 0) continue;
      cash += amount;
      lines.push(Object.freeze({
        assetId, units, per: amount / units, amount, kind: listing.kind ?? 'listing',
      }));
      continue;
    }
    const y = DIVIDEND_YIELD_BP[assetId];
    if (!y) continue;
    const last = prices[assetId];
    if (!Number.isFinite(last)) continue;
    const amount = Math.round((units * last * y) / 40000);
    if (amount <= 0) continue;
    const per = amount / units;
    cash += amount;
    lines.push(Object.freeze({ assetId, units, per, amount }));
  }
  return Object.freeze({ cash, lines });
}

export function deskWire(seed, quarter, day, assetId) {
  const q = quarterNarrative(seed, quarter);
  const y = yearNarrative(seed, quarter);
  const d = dailyNarrative(seed, quarter, day, assetId);
  const extras = TICKERS
    .filter((id) => id !== assetId)
    .slice(0, 4)
    .map((id) => dailyNarrative(seed, quarter, day, id));
  return Object.freeze({
    quarter: q,
    year: y,
    focus: d,
    extras,
  });
}
