// Read-only next-grade preview for school and transport. Does not quote a return
// and does not change civic rules.

import { RULES } from '../core/content.js';
import { activeOrder, activeParcel } from '../core/city.js';
import {
  CIVIC_UPGRADE_SPEC,
  civicUpgradeLevel,
  civicUpgradeQuote,
} from '../core/civic-works.js';
import { escapeHtml, money } from '../core/format.js';
import { globalTile, parseParcelId } from '../core/grid.js';
import { nearestTileDistance } from '../core/landuse.js';
import { applyBp } from '../core/rng.js';

const DISTANCE_SHARE_BP = Object.freeze({ 1: 10000, 2: 6000, 3: 3000 });

function percentagePoints(bp) {
  const value = (bp / 100).toFixed(1);
  return `${bp > 0 ? '+' : ''}${value} pp`;
}

function asLattice(tiles) {
  return (tiles ?? []).map((tile) => {
    if (tile && Number.isInteger(tile.gx) && Number.isInteger(tile.gz)) return tile;
    const id = typeof tile === 'string' ? tile : tile?.id;
    const parsed = parseParcelId(id);
    return { id, ...globalTile(parsed.bx, parsed.bz, parsed.tx, parsed.tz) };
  });
}

function civicDistance(city, state, useId, parcelId) {
  const parcel = activeParcel(city, state, parcelId);
  const civic = (city.civicUses ?? []).find((row) => row.useId === useId);
  if (!parcel?.tiles || !civic?.tiles) return null;
  const distance = nearestTileDistance(asLattice(parcel.tiles), asLattice(civic.tiles));
  return Number.isFinite(distance) ? distance : null;
}

function contributionBp(useId, level, distance) {
  if (!Number.isInteger(distance) || distance < 1 || distance > 3) return 0;
  const peak = CIVIC_UPGRADE_SPEC[useId]?.liftBp[level] ?? 0;
  return applyBp(peak, DISTANCE_SHARE_BP[distance]);
}

function marginalPair(useId, level, nextLevel, distance) {
  const current = contributionBp(useId, level, distance);
  const next = contributionBp(useId, nextLevel, distance);
  return {
    distance,
    valueBp: next - current,
    rentBp: applyBp(next, RULES.amenityRentShareBp) - applyBp(current, RULES.amenityRentShareBp),
  };
}

export function civicInvestmentPreview(city, state, useId, viewerSeatId = 'P1') {
  const spec = CIVIC_UPGRADE_SPEC[useId];
  if (!spec || !city || !state) return null;
  const quote = civicUpgradeQuote(state, useId);
  const level = quote?.level ?? civicUpgradeLevel(state, useId);
  const preview = {
    useId,
    level,
    maxLevel: spec.maxLevel,
    fromLabel: spec.labels[level] ?? '',
    viewerSeatId,
    basis: 'Added civic contribution, not a guaranteed return.',
  };
  if (!quote?.ok) {
    return {
      ...preview,
      purchasable: false,
      reason: quote?.reason ?? 'Already at the top civic grade.',
      nextLevel: null,
      toLabel: null,
      cost: null,
      actionCost: null,
      marginalByDistance: null,
      affected: [],
      affectedCount: 0,
      ownedCount: 0,
      spilloverCount: 0,
    };
  }
  const marginalByDistance = [1, 2, 3].map((distance) => marginalPair(useId, level, quote.nextLevel, distance));
  const affected = [];
  for (const parcelId of activeOrder(city, state)) {
    const distance = civicDistance(city, state, useId, parcelId);
    if (!Number.isInteger(distance) || distance < 1 || distance > 3) continue;
    const marginal = marginalPair(useId, level, quote.nextLevel, distance);
    const ownerSeatId = state.holdings?.[parcelId]?.ownerSeatId ?? null;
    affected.push({
      parcelId,
      distance,
      marginalValueBp: marginal.valueBp,
      marginalRentBp: marginal.rentBp,
      ownedByViewer: ownerSeatId === viewerSeatId,
    });
  }
  affected.sort((a, b) => a.parcelId.localeCompare(b.parcelId));
  const ownedCount = affected.filter((row) => row.ownedByViewer).length;
  return {
    ...preview,
    purchasable: true,
    reason: null,
    nextLevel: quote.nextLevel,
    toLabel: quote.label,
    cost: quote.cost,
    actionCost: 1,
    marginalByDistance,
    affected,
    affectedCount: affected.length,
    ownedCount,
    spilloverCount: affected.length - ownedCount,
  };
}

export function civicInvestmentPreviewHtml(preview) {
  if (!preview) return '';
  if (!preview.purchasable) {
    return `
      <section class="card__section" data-civic-investment="${escapeHtml(preview.useId)}" data-civic-investment-state="complete" aria-label="Upgrade increment">
        <div class="card__section-title">Upgrade increment</div>
        <p>${escapeHtml(preview.fromLabel)} is fully upgraded. No next grade.</p>
      </section>`;
  }
  const reach = `${preview.affectedCount} parcels benefit; you own ${preview.ownedCount}. Other owners also benefit.`;
  const rows = preview.marginalByDistance.map((row) => `
        <div class="card__influence-row" data-civic-marginal-distance="${row.distance}">
          <span>Distance ${row.distance}</span>
          <span class="value">value ${percentagePoints(row.valueBp)} · rent ${percentagePoints(row.rentBp)}</span>
        </div>`).join('');
  return `
      <section class="card__section" data-civic-investment="${escapeHtml(preview.useId)}" data-civic-investment-state="next" aria-label="Next upgrade">
        <div class="card__section-title">Next upgrade</div>
        <p data-civic-investment-step>${escapeHtml(preview.fromLabel)} → ${escapeHtml(preview.toLabel)}. ${money(preview.cost)} · ${preview.actionCost} action.</p>
        <p data-civic-investment-basis>${escapeHtml(preview.basis)}</p>
        <div class="card__influence-head"><span>Distance</span><span>Added contribution (percentage points)</span></div>
        ${rows}
        <p data-civic-investment-reach>${escapeHtml(reach)}</p>
      </section>`;
}
