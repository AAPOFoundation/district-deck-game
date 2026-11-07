import { rulesFor } from '../core/content.js';

function fmt(value) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${value < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(2)}m`;
  if (abs >= 1_000) return `${value < 0 ? '-' : ''}$${Math.round(abs / 1_000)}k`;
  return `${value < 0 ? '-' : ''}$${abs}`;
}

/** Neutral sale line. A fee is named only when the quote records one. */
export function ordinaryDivestToast({ parcelId, quote } = {}) {
  const id = String(parcelId ?? '').toUpperCase();
  const parts = [`Sold ${id}`];
  if (Number.isFinite(quote?.proceeds)) parts.push(`net ${fmt(quote.proceeds)}`);
  if (Number.isFinite(quote?.fee) && quote.fee > 0) parts.push(`fee ${fmt(quote.fee)}`);
  return parts.join(' · ');
}

/** Per-quarter operator allowance. Not actions left, and not a banked bonus. */
export function helpActionAllowance(state) {
  return rulesFor(state).actionsPerQuarter;
}
