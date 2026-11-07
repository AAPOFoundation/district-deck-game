// District Deck V3.38 Wave M — service tenancy and franchise-anchor pricing.
// All rolls use named streams so lease outcomes and quarterly investor marks replay exactly.

import { stream } from './rng.js';

export const COMMERCIAL_TENANT_ORDER = Object.freeze([
  'local-operator',
  'regional-chain',
  'franchise-anchor',
]);

export const COMMERCIAL_TENANT_TERMS = Object.freeze({
  'local-operator': Object.freeze({
    id: 'local-operator',
    label: 'LOCAL OPERATOR',
    rentBp: 9200,
    arrearsChanceBp: 0,
    anchorCandidate: false,
  }),
  'regional-chain': Object.freeze({
    id: 'regional-chain',
    label: 'REGIONAL CHAIN',
    rentBp: 10000,
    arrearsChanceBp: 500,
    anchorCandidate: false,
  }),
  'franchise-anchor': Object.freeze({
    id: 'franchise-anchor',
    label: 'FRANCHISE ANCHOR',
    rentBp: 11000,
    arrearsChanceBp: 1100,
    anchorCandidate: true,
  }),
});

/**
 * Service investor yields use the simulation's cash period: basis points per quarter.
 * The bands straddle each use's neutral anchor-rent / works-cost break-even, so a low
 * cap can support a modest flip while a high cap rewards collecting the short lease.
 * `bigBrandRentBp` is applied after the franchise option's quoted rent when it lands.
 */
export const COMMERCIAL_CAP_RATE_BASIS = 'quarter';

export const FRANCHISE_USE_MARKETS = Object.freeze({
  'childcare-centre': Object.freeze({
    label: 'Childcare centre',
    capRateMinBp: 390,
    capRateMaxBp: 460,
    anchorChanceBp: 3500,
    bigBrandRentBp: 11000,
    brands: Object.freeze(['Bright Steps', 'Little Lanterns', 'Neighbourhood Early Learning']),
  }),
  'petrol-station': Object.freeze({
    label: 'Petrol station',
    capRateMinBp: 470,
    capRateMaxBp: 550,
    anchorChanceBp: 3000,
    bigBrandRentBp: 10800,
    brands: Object.freeze(['MetroFuel', 'Southern Cross Energy', 'Highway House']),
  }),
  'medical-centre': Object.freeze({
    label: 'Medical centre',
    capRateMinBp: 390,
    capRateMaxBp: 460,
    anchorChanceBp: 4000,
    bigBrandRentBp: 10600,
    brands: Object.freeze(['Citywide Health', 'Harbour Medical Group', 'Commonwealth Clinics']),
  }),
});

export const COMMERCIAL_TENANT_TERM_QUARTERS = 4;

export function franchiseUseMarket(useId) {
  return FRANCHISE_USE_MARKETS[useId] ?? null;
}

export function isFranchiseTenancyUse(useId) {
  return Boolean(franchiseUseMarket(useId));
}

export function commercialTenantTerms(useId, tenantQuality) {
  if (!isFranchiseTenancyUse(useId)) return null;
  return COMMERCIAL_TENANT_TERMS[tenantQuality] ?? null;
}

/** One franchise decision at lease signing. The inclusive roll makes 0 and 9,999 legal. */
export function rollCommercialAnchor(seed, parcelId, quarter, useId) {
  const market = franchiseUseMarket(useId);
  if (!market) return null;
  const streamName = `tenancy:anchor:${parcelId}:q${quarter}`;
  const rng = stream(seed, streamName);
  const roll = rng.int(0, 9999);
  const landed = roll < market.anchorChanceBp;
  return Object.freeze({
    landed,
    roll,
    chanceBp: market.anchorChanceBp,
    brand: landed ? rng.pick(market.brands) : null,
    rentBp: landed ? market.bigBrandRentBp : 10000,
    stream: streamName,
  });
}

/** One investor mark per quarter, inside the use's authored cap-rate band. */
export function rollCommercialCapRate(seed, parcelId, quarter, useId) {
  const market = franchiseUseMarket(useId);
  if (!market) return null;
  const streamName = `tenancy:cap-rate:${parcelId}:q${quarter}`;
  const capRateBp = stream(seed, streamName).int(market.capRateMinBp, market.capRateMaxBp);
  const span = market.capRateMaxBp - market.capRateMinBp;
  const position = span ? (capRateBp - market.capRateMinBp) / span : 0.5;
  const investor = position <= 1 / 3
    ? 'CORE INCOME FUND'
    : position <= 2 / 3
      ? 'BALANCED PROPERTY FUND'
      : 'YIELD SYNDICATE';
  return Object.freeze({
    capRateBp,
    basis: COMMERCIAL_CAP_RATE_BASIS,
    investor,
    minBp: market.capRateMinBp,
    maxBp: market.capRateMaxBp,
    stream: streamName,
  });
}

export function capitaliseQuarterlyRent(quarterlyRent, capRateBp) {
  const rent = Math.max(0, Math.round(Number(quarterlyRent) || 0));
  const cap = Math.max(1, Math.round(Number(capRateBp) || 0));
  return Math.round((rent * 10000) / cap);
}

/** Compatibility adapter for saved probes that still pass a four-quarter rent total. */
export function capitaliseAnnualRent(annualRent, capRateBp) {
  const quarterlyRent = Math.max(0, Math.round((Number(annualRent) || 0) / 4));
  return capitaliseQuarterlyRent(quarterlyRent, capRateBp);
}
