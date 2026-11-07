import { moneyExact } from '../core/format.js';

const CASH_GATE = /^Short \$[\d,]+ against the overdraft floor\.$/;

/** Presentation only. Amounts come from the quote and the gate reason. */
export function acquireFundingExplanation(quote, reason) {
  if (!quote || quote.ok !== false || !CASH_GATE.test(String(reason ?? ''))) return null;
  return {
    concise: `Short ${moneyExact(quote.shortfall)}`,
    detail: `Cash available ${moneyExact(quote.ordinaryCash)}. Overdraft available ${moneyExact(quote.availableOverdraft)}. Auction reserve ${moneyExact(quote.reservedForAuction)}. ${reason}`,
  };
}
