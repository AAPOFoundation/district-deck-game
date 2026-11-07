// District Deck — quarterly inflation and interest path.
// Frozen with the seed (same contract as city.market). Forecast is what the
// rail publishes; realised is what settle charges.

import { applyBp, stream } from './rng.js';
import { RULES } from './content.js';

export const INTEREST_MIN_BP = 60;
export const INTEREST_MAX_BP = 220;
export const INFLATION_MIN_BP = -80;
export const INFLATION_MAX_BP = 180;
/** 30% below market — deceased-estate asking. */
export const DECEASED_ESTATE_ASK_BP = 7000;
/** 8% chance a ready-car / pedestrian pair becomes an accident. One per quarter. */
export const JAYWALK_CHANCE_BP = 800;
export const CROSSING_ACCIDENT_CHANCE_BP = JAYWALK_CHANCE_BP;

/** One 8% draw per quarter — the accident is allowed or it is not. */
export function quarterAllowsCrossingAccident(seed, quarter) {
  return stream(String(seed), `crossing-accident:allow:q${quarter}`).int(0, 9999)
    < CROSSING_ACCIDENT_CHANCE_BP;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * One authored row per quarter. Interest is a RATE (bp per quarter on debt).
 * Inflation is a quarterly CPI change (bp).
 */
export function createRatesPlan(seed, quarters = RULES.quarters) {
  const horizon = Math.max(1, quarters | 0);
  const rows = [];
  let interest = RULES.interestBp;
  for (let q = 1; q <= horizon; q += 1) {
    // Q1 stays on the published opening rate and a 0 CPI print so existing
    // Q1 ledger fixtures keep their integers. The path moves from Q2.
    if (q === 1) {
      rows.push(Object.freeze({
        quarter: 1,
        interestForecastBp: RULES.interestBp,
        interestRealisedBp: RULES.interestBp,
        inflationForecastBp: 0,
        inflationRealisedBp: 0,
      }));
      continue;
    }
    const setup = stream(seed, `rates:q${q}`);
    const interestStep = setup.int(-22, 22);
    const interestForecastBp = clamp(interest + interestStep, INTEREST_MIN_BP, INTEREST_MAX_BP);
    const interestRealisedBp = clamp(
      interestForecastBp + setup.int(-6, 6),
      INTEREST_MIN_BP,
      INTEREST_MAX_BP,
    );
    interest = interestRealisedBp;
    const inflationForecastBp = setup.int(INFLATION_MIN_BP, INFLATION_MAX_BP);
    const inflationRealisedBp = clamp(
      inflationForecastBp + setup.int(-35, 35),
      INFLATION_MIN_BP - 20,
      INFLATION_MAX_BP + 20,
    );
    rows.push(Object.freeze({
      quarter: q,
      interestForecastBp,
      interestRealisedBp,
      inflationForecastBp,
      inflationRealisedBp,
    }));
  }
  return Object.freeze(rows);
}

export function ratesRow(plan, quarter) {
  if (!Array.isArray(plan) || !quarter) return null;
  return plan[quarter - 1] ?? null;
}

export function createRatesState(seed, quarters = RULES.quarters) {
  const plan = createRatesPlan(seed, quarters);
  const first = plan[0];
  return {
    plan,
    priceIndexBp: 10000,
    interestBp: first?.interestRealisedBp ?? RULES.interestBp,
    appliedQuarter: 0,
  };
}

export function ensureRatesState(state, seed, quarters) {
  if (state.rates?.plan?.length) return state.rates;
  return createRatesState(seed ?? state.seed, quarters ?? state.quarters ?? RULES.quarters);
}

/** Published forecast for the rail (current quarter). */
export function forecastRates(state, quarter = state.quarter) {
  const rates = ensureRatesState(state, state.seed, state.quarters);
  const row = ratesRow(rates.plan, quarter);
  const next = ratesRow(rates.plan, quarter + 1);
  return {
    inflationForecastBp: row?.inflationForecastBp ?? 0,
    interestForecastBp: row?.interestForecastBp ?? RULES.interestBp,
    nextInflationForecastBp: next?.inflationForecastBp ?? row?.inflationForecastBp ?? 0,
    nextInterestForecastBp: next?.interestForecastBp ?? row?.interestForecastBp ?? RULES.interestBp,
    inflationRealisedBp: row?.inflationRealisedBp ?? 0,
    interestRealisedBp: row?.interestRealisedBp ?? RULES.interestBp,
    priceIndexBp: rates.priceIndexBp ?? 10000,
    interestBp: rates.interestBp ?? RULES.interestBp,
  };
}

/** Apply this quarter's realised inflation once. Interest stays until the quarter advances. */
export function applyInflationStep(state) {
  const rates = ensureRatesState(state, state.seed, state.quarters);
  state.rates = rates;
  if (rates.appliedQuarter === state.quarter) return rates;
  const row = ratesRow(rates.plan, state.quarter);
  if (row) {
    rates.priceIndexBp = applyBp(rates.priceIndexBp, 10000 + row.inflationRealisedBp);
  }
  rates.appliedQuarter = state.quarter;
  return rates;
}

/** After settle advances the quarter, load that quarter's realised cash rate. */
export function advanceInterestRate(state) {
  const rates = ensureRatesState(state, state.seed, state.quarters);
  state.rates = rates;
  const row = ratesRow(rates.plan, state.quarter);
  if (row) rates.interestBp = row.interestRealisedBp;
  return rates;
}

export function priceIndexBp(state) {
  return state?.rates?.priceIndexBp ?? 10000;
}
