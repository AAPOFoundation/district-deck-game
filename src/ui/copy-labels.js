import { RULES } from '../core/content.js';
import { PERMIT_LABELS } from '../core/planning-permits.js';
import { DISTRICT_DEFINITIONS, PAIR_SYNERGIES } from '../core/landuse.js';

// COPY-DRAFT: use permits keep their own name; height permits use the shared rung labels.
export function lobbyRungLabel(event) {
  if (event.usePermitId) return event.useLabel ?? 'change of use';
  return PERMIT_LABELS[event.permitLevel ?? event.planningCeiling ?? 1] ?? PERMIT_LABELS[1];
}

// COPY-DRAFT: plain names for the planning zones.
const ZONE_NAMES = Object.freeze({
  NRZ: 'neighbourhood residential', GRZ: 'general residential', RGZ: 'residential growth',
  MUZ: 'mixed use', CZ: 'commercial',
});
// COPY-DRAFT: the zone limits height independently of the approved use.
export function planningZoneTitle(zoneId) {
  const name = ZONE_NAMES[zoneId];
  return `${name ? `${zoneId} is a ${name} planning zone that limits height` : 'The planning zone limits height'}. Approved use is recorded separately.`;
}

// COPY-DRAFT: distinguish the current approval from the parcel's permitted maximum.
export function ceilingTitle(level, cap) {
  return `L${level} is the approved height rung. This parcel can be lobbied up to L${cap}.`;
}

// COPY-DRAFT: a fresh city has no globe run until the player opens it.
export function qbeatTitle(canon, hasWorld) {
  if (!hasWorld) return 'The globe has not opened. It catches up one beat per settled quarter when opened.';
  return `The city is in quarter ${canon.cityQuarter ?? '—'} and the globe is at beat ${canon.worldBeat}. The globe catches up one beat per settled quarter.`;
}

// COPY-DRAFT: expand the ticker's own fragments into one sentence, using the
// recipe to distinguish the affected measure and an addition from a set value.
function tickerChange(name, fragment) {
  const pair = PAIR_SYNERGIES.find(row => row.name.toUpperCase() === name.toUpperCase());
  const effect = pair?.effects?.[0];
  const district = DISTRICT_DEFINITIONS.find(row => row.name.toUpperCase() === name.toUpperCase());
  const districtEffect = district?.effects.find(row => row.measure === 'rent') ?? district?.effects[0];
  const rate = fragment.match(/^([+-]?\d+(?:\.\d+)?) (?:([a-z]+) )?bp$/i);
  if (rate) {
    const measure = districtEffect
      ? `${districtEffect.receiver === 'any' ? '' : `${districtEffect.receiver} `}${districtEffect.measure}`
      : rate[2] ?? 'the rate';
    return `changes ${measure} by ${rate[1]} basis points`;
  }
  const demand = fragment.match(/^demand ([+-]?\d+%)$/);
  if (demand) return `changes family demand by ${demand[1]}`;
  const radius = fragment.match(/^radius (\d+)$/);
  if (radius) {
    const tiles = `${radius[1]} tile${radius[1] === '1' ? '' : 's'}`;
    return Number.isFinite(effect?.add)
      ? `extends the patrol radius by ${tiles}` : `sets the patrol radius to ${tiles}`;
  }
  const defect = fragment.match(/^defect (\d+%)$/);
  if (defect) return `sets the works defect chance to ${defect[1]}`;
  const chance = fragment.match(/^[+-]?\d+%$/);
  if (chance) return `changes ${effect?.measure === 'dogFindChance' ? 'Banjo’s find chance' : 'the chance'} by ${fragment}`;
  const added = fragment.match(/^add ([+-]?\d+)$/);
  if (added) return `increases the auction crowd by ${added[1]} people`;
  if (fragment === 'intel') return effect?.measure === 'fireTargetScore'
    ? 'identifies a holding at risk of fire' : 'makes shared intel available';
  if (fragment === '×') return effect?.value ? `cancels the ${effect.value}` : 'cancels the pending outcome';
  const multiplier = fragment.match(/^×(\d+(?:\.\d+)?)$/);
  if (multiplier) return `sets the multiplier to ${multiplier[1]}`;
  return 'is active';
}

// COPY-DRAFT: name the nearby parcel and expand bp only on a rate fragment.
export function tickerTitle(line) {
  const name = String(line?.name ?? 'The local effect');
  const fragment = String(line?.fragment ?? '');
  const near = line?.anchorId ? ` near ${String(line.anchorId).toUpperCase()}` : '';
  return `${name} ${tickerChange(name, fragment)}${near}.`;
}

export function resultHeadline(state) {
  const horizon = Math.max(1, Math.floor(Number(state?.quarters) || RULES.quarters));
  // COPY-DRAFT: early endings name their actual quarter; the final-day heading stays pinned.
  if (Number(state?.quarter) < horizon) {
    return `${state.grade === 'INSOLVENT' ? 'INSOLVENT' : 'RUN ENDED'} · Q${state.quarter}`;
  }
  return `SETTLEMENT DAY · Q${horizon}`;
}
