// District Deck — corner-shop AI startups and data-centre listings.
// Pure helpers. State writes them; economy and the exchange read them.

import { applyBp, stream } from './rng.js';
import { ARCHETYPES } from './content.js';
import { stockExchangeOnBoard } from './markets.js';
import { createHospitality, universityStartupBoostBp } from './civic-works.js';

export const INCUBATOR_STARTUP_BOOST_BP = 2_400;

/** A standing AI incubator lifts startup valuations the way a funded
 * university desk does — same order of boost, no SIM change. */
export function incubatorStartupBoostBp(state) {
  for (const holding of Object.values(state?.holdings ?? {})) {
    if (holding?.construction) continue;
    if (holding?.archetypeId === 'incubator') return INCUBATOR_STARTUP_BOOST_BP;
    for (const key of ['A', 'B']) {
      const slot = holding?.padSlots?.[key];
      if (slot?.status === 'standing' && slot.archetypeId === 'incubator') {
        return INCUBATOR_STARTUP_BOOST_BP;
      }
    }
  }
  return 0;
}

export const STARTUP_BURN_MIN = 50_000;
export const STARTUP_BURN_MAX = 100_000;
export const STARTUP_VALUATION_MIN = 10_000_000;
export const STARTUP_VALUATION_MAX = 110_000_000;
/** 25% at $10m. */
export const STARTUP_CHANCE_AT_MIN_BP = 2500;
/** 1% at $110m. */
export const STARTUP_CHANCE_AT_MAX_BP = 100;
/** Below this, each settle re-rolls the $10m–$110m lottery. */
export const STARTUP_LOCK_VALUATION = 5_000_000;
/** 16% chance to mark +10% once locked. Twice the down chance. */
export const STARTUP_DRIFT_UP_BP = 1600;
/** 8% chance to mark −20% once locked. */
export const STARTUP_DRIFT_DOWN_BP = 800;
export const STARTUP_DRIFT_UP_MULT_BP = 11_000;
export const STARTUP_DRIFT_DOWN_MULT_BP = 8_000;

/** Each converted warehouse earns at least this much rent per quarter. */
export const DATA_CENTRE_MIN_QUARTERLY_RENT = 1_000_000;
/**
 * EQIX / DLR trade around 9–10× trailing sales. The listing is priced at
 * 10 × (four quarters of contracted rent).
 */
export const DATA_CENTRE_REVENUE_MULTIPLE = 10;
export const DATA_CENTRE_IPO_SHARES = 1_000_000;

export const STARTUP_BRANDS = Object.freeze([
  'Nova', 'Lumen', 'Fathom', 'Prism', 'Helix',
  'Nimbus', 'Volt', 'Axiom', 'Kite', 'Orbital',
]);

export function isCornerShopArchetype(archetypeId) {
  return String(archetypeId ?? '').startsWith('shop-corner');
}

export function isDataCentreArchetype(archetypeId) {
  return String(archetypeId ?? '') === 'warehouse-datacentre';
}

export function activeVenture(holding) {
  const venture = holding?.venture;
  if (!venture) return null;
  if (venture.status === 'operating' || venture.status === 'valued') return venture;
  return null;
}

export function listedTickerOf(holding) {
  const id = holding?.listedTicker;
  return typeof id === 'string' && id ? id : null;
}

/** Post-IPO locks (R2, ≤8 words, no "permit"). */
export const LISTED_FABRIC_REASON = 'The float owns the fabric now.';
export const LISTED_USE_REASON = 'The listing froze this use.';
export const LISTED_DEMO_REASON = 'Shareholders hold the bricks.';

export const DATA_CENTRE_IPO_MIN = 30_000_000;
export const DATA_CENTRE_IPO_MAX = 60_000_000;

/**
 * Log-uniform IPO market cap on [$30m, $60m].
 * X = 30e6 × 2^u with u ~ U[0, 1). Density ∝ 1/x, so mass sits near $30m
 * and $60m is the thin tail (P(X > $50m) = log2(1.2) ≈ 0.263;
 * P(X > $55m) ≈ 0.126). Stream `dc:ipo:{parcelId}` has no quarter, so
 * completion and IPO time draw the same number.
 */
export function rollDataCentreIpoMarketCap(seed, parcelId) {
  const rng = stream(seed, `dc:ipo:${parcelId}`);
  const u = rng.unit();
  const raw = Math.round(DATA_CENTRE_IPO_MIN * (2 ** u));
  return Math.max(DATA_CENTRE_IPO_MIN, Math.min(DATA_CENTRE_IPO_MAX, raw));
}

export function operatingBaseRent(archetypeId, authoredRent = 0) {
  if (isDataCentreArchetype(archetypeId)) {
    return Math.max(authoredRent ?? 0, DATA_CENTRE_MIN_QUARTERLY_RENT);
  }
  return authoredRent ?? 0;
}

export function startupChanceBp(valuation) {
  const value = Number(valuation);
  if (!Number.isFinite(value) || value <= 0) return STARTUP_CHANCE_AT_MIN_BP;
  const lo = Math.log(STARTUP_VALUATION_MIN);
  const hi = Math.log(STARTUP_VALUATION_MAX);
  const t = (Math.log(value) - lo) / (hi - lo);
  const clamped = Math.max(0, Math.min(1, t));
  // Geometric in log-value so $110m is 1% and mid-band hits sit well below a linear blend.
  const ratio = STARTUP_CHANCE_AT_MAX_BP / STARTUP_CHANCE_AT_MIN_BP;
  return Math.round(STARTUP_CHANCE_AT_MIN_BP * (ratio ** clamped));
}

/**
 * One quarterly draw. Sample V log-uniform on [$10m, $110m], accept with P(V)
 * that falls from 25% at $10m to 1% at $110m on a geometric log curve.
 * Miss → null (shop price + burn).
 */
export function rollStartupValuation(seed, parcelId, quarter, boostBp = 0) {
  const rng = stream(seed, `venture:ai:${parcelId}:q${quarter}`);
  const u = rng.unit();
  const span = STARTUP_VALUATION_MAX / STARTUP_VALUATION_MIN;
  const valuation = Math.round(STARTUP_VALUATION_MIN * (span ** u));
  const chanceBp = Math.min(9500, startupChanceBp(valuation) + Math.max(0, boostBp | 0));
  if (rng.int(0, 9999) >= chanceBp) return null;
  return Math.max(STARTUP_VALUATION_MIN, Math.min(STARTUP_VALUATION_MAX, valuation));
}

export function isStartupLocked(venture) {
  return Number(venture?.valuation) >= STARTUP_LOCK_VALUATION;
}

export function rollStartupDrift(seed, parcelId, quarter, valuation) {
  const current = Math.max(1, Math.round(Number(valuation) || 0));
  const rng = stream(seed, `venture:ai:drift:${parcelId}:q${quarter}`);
  const roll = rng.int(0, 9999);
  if (roll < STARTUP_DRIFT_UP_BP) {
    return {
      direction: 'up',
      valuation: Math.max(
        1,
        Math.min(STARTUP_VALUATION_MAX, applyBp(current, STARTUP_DRIFT_UP_MULT_BP)),
      ),
    };
  }
  if (roll < STARTUP_DRIFT_UP_BP + STARTUP_DRIFT_DOWN_BP) {
    return {
      direction: 'down',
      valuation: Math.max(1, applyBp(current, STARTUP_DRIFT_DOWN_MULT_BP)),
    };
  }
  return { direction: 'hold', valuation: current };
}

export function pickStartupBrand(seed, parcelId) {
  const rng = stream(seed, `venture:ai:brand:${parcelId}`);
  return rng.pick(STARTUP_BRANDS);
}

/** Quarterly operating burn, re-rolled on its own replay-safe stream. */
export function startupBurnForQuarter(seed, parcelId, quarter) {
  return stream(seed, `venture:burn:${parcelId}:q${quarter}`)
    .int(STARTUP_BURN_MIN, STARTUP_BURN_MAX);
}

export function createAiStartupVenture({ seed, parcelId, quarter }) {
  const brand = pickStartupBrand(seed, parcelId);
  return Object.freeze({
    id: 'ai-startup',
    status: 'operating',
    brand,
    label: `${brand}.ai`,
    startedQuarter: quarter,
    burnMin: STARTUP_BURN_MIN,
    burnMax: STARTUP_BURN_MAX,
    valuation: null,
    valuedQuarter: null,
  });
}

export function activateUsePermit(state, parcelId, usePermitId, { seed, quarter }) {
  const holding = state.holdings?.[parcelId];
  if (!holding) return null;
  if (usePermitId === 'walkup-hotel' || usePermitId === 'walkup-luxe') {
    holding.hospitality = createHospitality(
      usePermitId === 'walkup-hotel' ? 'hotel' : 'luxe',
      seed,
      parcelId,
    );
    return holding.hospitality;
  }
  if (usePermitId !== 'ai-startup') return null;
  const venture = createAiStartupVenture({ seed, parcelId, quarter });
  holding.venture = venture;
  const status = state.parcelStatus?.[parcelId];
  if (status) {
    status.occupancy = 'vacant';
    status.tenant = null;
  }
  return venture;
}

export function applyVentureStep(state) {
  const events = [];
  for (const parcelId of Object.keys(state.holdings ?? {}).sort()) {
    const holding = state.holdings[parcelId];
    const venture = holding?.venture;
    if (!venture || (venture.status !== 'operating' && venture.status !== 'valued')) continue;

    if (isStartupLocked(venture)) {
      const drift = rollStartupDrift(state.seed, parcelId, state.quarter, venture.valuation);
      if (drift.direction !== 'hold') {
        holding.venture = Object.freeze({
          ...venture,
          status: 'valued',
          valuation: drift.valuation,
          valuedQuarter: state.quarter,
        });
      }
      events.push({
        kind: 'startup-drift',
        parcelId,
        direction: drift.direction,
        valuation: holding.venture.valuation,
        brand: venture.label,
      });
      continue;
    }

    const valuation = rollStartupValuation(
      state.seed,
      parcelId,
      state.quarter,
      universityStartupBoostBp(state) + incubatorStartupBoostBp(state),
    );
    if (valuation) {
      holding.venture = Object.freeze({
        ...venture,
        status: 'valued',
        valuation,
        valuedQuarter: state.quarter,
      });
      events.push({
        kind: 'startup-valuation',
        parcelId,
        valuation,
        brand: venture.label,
      });
    } else {
      events.push({
        kind: 'startup-miss',
        parcelId,
        brand: venture.label,
      });
    }
  }
  return events;
}

export function ventureCashburnForOwner(state, owner) {
  let total = 0;
  for (const id of Object.keys(state.holdings ?? {}).sort()) {
    const holding = state.holdings[id];
    if (!holding) continue;
    const mine = owner === 'player' || owner === 'P1'
      ? holding.owner === 'player'
      : owner === 'rival' || owner === 'R1'
        ? holding.owner === 'rival'
        : holding.ownerSeatId === owner;
    if (!mine) continue;
    const venture = activeVenture(holding);
    // The operating lottery burns cash. Once PE has valued the venture it moves on the
    // quarterly mark-to-market branch instead, so the card's "while unvalued" line is literal.
    if (!venture || isStartupLocked(venture)) continue;
    total += startupBurnForQuarter(state.seed, id, state.quarter);
  }
  return total;
}

export function dataCentreTickerId(parcelId, existingIds = []) {
  const stem = `D${String(parcelId).replace(/[^A-Za-z0-9]/g, '').slice(-3).toUpperCase() || 'C01'}`;
  const taken = new Set(existingIds);
  if (!taken.has(stem)) return stem;
  for (let i = 2; i < 50; i += 1) {
    const next = `${stem}${i}`;
    if (!taken.has(next)) return next;
  }
  return `${stem}X`;
}

export function dataCentreQuarterlyRent(city, state, parcelId) {
  const holding = state.holdings?.[parcelId];
  const authored = holding?.baseRent
    ?? ARCHETYPES['warehouse-datacentre']?.baseRent
    ?? 0;
  return operatingBaseRent('warehouse-datacentre', authored);
}

export function ipoQuote(city, state, parcelId) {
  const holding = state.holdings?.[parcelId];
  if (!holding) return null;
  const quarterly = dataCentreQuarterlyRent(city, state, parcelId);
  const annualRevenue = quarterly * 4;
  const shares = DATA_CENTRE_IPO_SHARES;
  const rolled = Number.isInteger(holding.ipoMarketCap)
    ? holding.ipoMarketCap
    : rollDataCentreIpoMarketCap(state.seed, parcelId);
  const ipoPrice = Math.max(1, Math.round(rolled / shares));
  const marketCap = ipoPrice * shares;
  return Object.freeze({
    parcelId,
    quarterlyRent: quarterly,
    annualRevenue,
    multiple: DATA_CENTRE_REVENUE_MULTIPLE,
    marketCap,
    shares,
    ipoPrice,
  });
}

export function canIpo(city, state, parcelId) {
  if (state.phase !== 'play') return { ok: false, reason: 'The run is over.' };
  if (state.actionsRemaining <= 0) return { ok: false, reason: 'No actions left this quarter.' };
  const holding = state.holdings?.[parcelId];
  if (!holding || holding.owner !== 'player') {
    return { ok: false, reason: 'You do not hold this parcel.' };
  }
  if (holding.construction) return { ok: false, reason: 'Works are still open.' };
  const form = holding.archetypeId
    ?? state.parcelStatus?.[parcelId]?.builtArchetypeId;
  const slottedDc = ['A', 'B'].some((slot) => (
    holding.padSlots?.[slot]?.status === 'standing'
    && isDataCentreArchetype(holding.padSlots[slot].archetypeId)
  ));
  if (!isDataCentreArchetype(form) && !slottedDc) {
    return { ok: false, reason: 'IPO is for a finished data centre.' };
  }
  if (listedTickerOf(holding)) {
    return { ok: false, reason: 'Already listed.' };
  }
  if (!stockExchangeOnBoard(city)) {
    return { ok: false, reason: 'No Stock Exchange on this city.' };
  }
  return { ok: true, quote: ipoQuote(city, state, parcelId) };
}

export function createDataCentreListing(city, state, parcelId) {
  const quote = ipoQuote(city, state, parcelId);
  if (!quote) return null;
  const existing = (state.markets?.listings ?? []).map((row) => row.id);
  const id = dataCentreTickerId(parcelId, existing);
  const parcel = city.parcels?.[parcelId];
  const district = parcel?.districtName ?? parcel?.districtId ?? 'District';
  return Object.freeze({
    id,
    name: `${district} Data`,
    class: 'equity',
    basePrice: quote.ipoPrice,
    volBp: 2700,
    kind: 'data-centre',
    parcelId,
    sharesOutstanding: quote.shares,
    quarterlyDividend: quote.quarterlyRent,
    listedQuarter: state.quarter,
    annualRevenue: quote.annualRevenue,
    multiple: quote.multiple,
  });
}

export function listingById(state, assetId) {
  return (state.markets?.listings ?? []).find((row) => row.id === assetId) ?? null;
}

export function releaseListedParcelIfExited(state, assetId) {
  const listing = listingById(state, assetId);
  if (!listing?.parcelId) return null;
  const held = state.markets?.portfolios?.player?.[assetId] ?? 0;
  if (held > 0) return null;
  const holding = state.holdings?.[listing.parcelId];
  if (!holding || holding.listedTicker !== assetId) return null;
  delete state.holdings[listing.parcelId];
  return listing.parcelId;
}
