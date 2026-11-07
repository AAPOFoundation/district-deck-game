// District Deck V3.40 Wave R3 — Aido PM assistant.
// Pure plan derivation. Confirm spends real actions through the ordinary reducers.

import { TENANT_TERMS } from './event-rules.js';
import { isFranchiseTenancyUse } from './commercial-tenancy.js';
import {
  archetypeIdOf, canDivest, canRenovate, conditionOf, divestQuote, heldBy,
  marketValue, renovateQuote,
} from './economy.js';
import { RULES } from './content.js';
import { applyAction, canApplyAction } from './state.js';
import { moneyExact } from './format.js';

export const AIDO_STANCES = Object.freeze(['risk-taker', 'balanced', 'low-risk']);
export const AIDO_PLAN_CAP = 4;

const LEASE_QUALITY = Object.freeze({
  'risk-taker': 'stretch',
  balanced: 'standard',
  'low-risk': 'secure',
});

export function aidoLeaseQuality(stance) {
  return LEASE_QUALITY[stance] ?? null;
}

function sortIds(ids) {
  return [...ids].sort((left, right) => String(left).localeCompare(String(right)));
}

function vacantLeaseIds(city, state) {
  const ids = [];
  for (const id of sortIds(heldBy(state, 'player'))) {
    const holding = state.holdings[id];
    const form = archetypeIdOf(city, state, id);
    if (isFranchiseTenancyUse(form)) continue;
    const action = {
      type: 'lease',
      parcelId: id,
      tenantQuality: 'standard',
    };
    const check = canApplyAction(city, state, action);
    if (check.ok) ids.push(id);
    else if (holding && !holding.construction) {
      const stretch = canApplyAction(city, state, {
        type: 'lease',
        parcelId: id,
        tenantQuality: 'stretch',
      });
      const secure = canApplyAction(city, state, {
        type: 'lease',
        parcelId: id,
        tenantQuality: 'secure',
      });
      if (stretch.ok || secure.ok) ids.push(id);
    }
  }
  return ids;
}

function mostTiredId(city, state) {
  let best = null;
  let bestCondition = Infinity;
  for (const id of sortIds(heldBy(state, 'player'))) {
    const check = canRenovate(city, state, id);
    if (!check.ok) continue;
    const condition = conditionOf(city, state, id);
    if (condition < bestCondition) {
      best = id;
      bestCondition = condition;
    }
  }
  return best;
}

function deepestUnderwaterId(city, state) {
  let best = null;
  let bestEquity = 0;
  for (const id of sortIds(heldBy(state, 'player'))) {
    const check = canDivest(city, state, id);
    if (!check.ok) continue;
    const holding = state.holdings[id];
    const equity = marketValue(city, state, id) - (holding?.debt ?? 0);
    if (equity < bestEquity) {
      best = id;
      bestEquity = equity;
    }
  }
  return best;
}

function leaseLine(parcelId, quality) {
  const terms = TENANT_TERMS[quality];
  const fee = RULES.leaseFee;
  return Object.freeze({
    kind: 'lease',
    parcelId,
    tenantQuality: quality,
    action: Object.freeze({ type: 'lease', parcelId, tenantQuality: quality }),
    label: `Lease ${String(parcelId).toUpperCase()} ${quality}`,
    cost: fee,
    effect: `${moneyExact(fee)} · 1 action · rent ${terms.rentBp / 100}%`,
  });
}

function renovateLine(city, state, parcelId) {
  const quote = renovateQuote(city, state, parcelId);
  return Object.freeze({
    kind: 'renovate',
    parcelId,
    action: Object.freeze({ type: 'renovate', parcelId }),
    label: `Renovate ${String(parcelId).toUpperCase()}`,
    cost: quote?.cashOut ?? quote?.cost ?? 0,
    effect: `${moneyExact(quote?.cashOut ?? 0)} · 1 action · condition up`,
  });
}

function divestLine(city, state, parcelId) {
  const quote = divestQuote(city, state, parcelId);
  const proceeds = quote?.proceeds ?? 0;
  return Object.freeze({
    kind: 'divest',
    parcelId,
    action: Object.freeze({ type: 'divest', parcelId }),
    label: `Divest ${String(parcelId).toUpperCase()}`,
    cost: 0,
    effect: proceeds >= 0
      ? `${moneyExact(proceeds)} in · no action`
      : `surrender · no action`,
  });
}

/**
 * Bounded plan for THIS quarter. Max four lines.
 * Leases first (STRETCH / STANDARD / SECURE by stance), then renovate the most
 * tired holding (balanced + low-risk) or divest the deepest-underwater holding
 * (risk-taker only).
 */
export function deriveAidoPlan(city, state, stance) {
  const quality = aidoLeaseQuality(stance);
  if (!quality) {
    return Object.freeze({ stance, lines: Object.freeze([]), reason: 'Unknown stance.' });
  }
  const lines = [];
  for (const id of vacantLeaseIds(city, state)) {
    if (lines.length >= AIDO_PLAN_CAP) break;
    const probe = canApplyAction(city, state, {
      type: 'lease',
      parcelId: id,
      tenantQuality: quality,
    });
    if (!probe.ok) continue;
    lines.push(leaseLine(id, quality));
  }
  if (lines.length < AIDO_PLAN_CAP && stance !== 'risk-taker') {
    const tired = mostTiredId(city, state);
    if (tired) lines.push(renovateLine(city, state, tired));
  }
  if (lines.length < AIDO_PLAN_CAP && stance === 'risk-taker') {
    const underwater = deepestUnderwaterId(city, state);
    if (underwater) lines.push(divestLine(city, state, underwater));
  }
  return Object.freeze({
    stance,
    lines: Object.freeze(lines.slice(0, AIDO_PLAN_CAP)),
    reason: '',
  });
}

export const AIDO_ACTIONS_EXHAUSTED = 'Actions ran out mid-plan.';

export function executeAidoPlan(city, state, plan, apply = applyAction) {
  let current = state;
  const applied = [];
  for (const line of plan?.lines ?? []) {
    const result = apply(city, current, line.action);
    if (result.rejected) {
      const reason = result.events?.[0]?.reason ?? '';
      const exhausted = /no actions left this quarter/i.test(reason);
      return {
        state: current,
        applied,
        stopped: true,
        reason: exhausted ? AIDO_ACTIONS_EXHAUSTED : reason,
      };
    }
    current = result.state;
    applied.push(line);
  }
  return {
    state: current,
    applied,
    stopped: false,
    reason: '',
  };
}
