import { applyAction } from './state.js';
import { marketValue, navOf } from './economy.js';
import { hasUnconsumedKit, isInstitutionKit } from './build-kits.js';
import { buildCatalog, canPlaceBuilding } from './site-works.js';

const previewMemo = new WeakMap();
let placesAsById = null;

// The BUILD row's legality check (canPlaceBuilding with no store) reads kit vouchers from
// browser storage, and the click hands the reducer the same rows through applyCityAction.
// A bare action would give the reducer an empty world, refusing every legal kit row.
export const browserKitStore = Object.freeze({
  get(key) {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  },
});

function placesAsOf(catalogId) {
  placesAsById ??= new Map(buildCatalog().map((entry) => [entry.id, entry.placesAs]));
  return placesAsById.get(catalogId) ?? null;
}

// Only institution kits read the store. A kit can ship while the city state stays the same,
// so their memo key carries the voucher the reducer will see.
function memoKey(state, parcelId, catalogId, store) {
  const placesAs = placesAsOf(catalogId);
  if (!placesAs || !isInstitutionKit(placesAs)) return `${parcelId}|${catalogId}`;
  const kit = hasUnconsumedKit(placesAs, state, store);
  return `${parcelId}|${catalogId}|${kit.ok ? `kit:${kit.row.id}` : `none:${kit.reason}`}`;
}

function placedJob(result, parcelId) {
  const placed = result.events?.find((event) => event.kind === 'place-building' || event.kind === 'farm-build');
  const holding = result.state.holdings?.[parcelId];
  if (placed?.slot) return holding?.padSlots?.[placed.slot]?.works ?? null;
  return holding?.construction ?? result.state.farms?.[parcelId]?.construction ?? null;
}

// navBefore and the standing parcel value are the same for every kit this quarter.
const quarterInputs = new WeakMap();

function sharedInputs(city, state, parcelId) {
  let row = quarterInputs.get(state);
  if (!row) {
    row = { navBefore: navOf(city, state, 'player'), valueBefore: new Map() };
    quarterInputs.set(state, row);
  }
  if (!row.valueBefore.has(parcelId)) {
    row.valueBefore.set(
      parcelId,
      state.holdings?.[parcelId]
        ? marketValue(city, state, parcelId)
        : (state.farms?.[parcelId]?.basis ?? 0),
    );
  }
  return { navBefore: row.navBefore, valueBefore: row.valueBefore.get(parcelId) };
}

function valueDuringWorks(city, state, parcelId, placesAs) {
  const nextHolding = {
    ...state.holdings[parcelId],
    siteCleared: false,
    construction: { toArchetype: placesAs },
  };
  delete nextHolding.demolition;
  delete nextHolding.hospitality;
  return marketValue(city, {
    ...state,
    holdings: { ...state.holdings, [parcelId]: nextHolding },
  }, parcelId);
}

function remember(previews, key, preview) {
  const frozen = preview == null ? null : Object.freeze(preview);
  previews.set(key, frozen);
  return frozen;
}

export function buildStartPreview(city, state, parcelId, catalogId, store = browserKitStore) {
  if (!city || !state || !parcelId || !catalogId) return null;
  let previews = previewMemo.get(state);
  if (!previews) {
    previews = new Map();
    previewMemo.set(state, previews);
  }
  const key = memoKey(state, parcelId, catalogId, store);
  if (previews.has(key)) return previews.get(key);

  const placesAs = placesAsOf(catalogId);
  // Institution kits still go through the reducer: the voucher is part of the click.
  if (placesAs && isInstitutionKit(placesAs)) {
    const result = applyAction(city, state, { type: 'place-building', parcelId, catalogId, store });
    if (result.rejected) return remember(previews, key, null);
    const navBefore = navOf(city, state, 'player');
    const navAfter = navOf(city, result.state, 'player');
    return remember(previews, key, {
      navBefore,
      navAfter,
      navChange: navAfter - navBefore,
      valueBefore: marketValue(city, state, parcelId),
      valueDuringWorks: marketValue(city, result.state, parcelId),
      completionQuarter: placedJob(result, parcelId)?.completionQuarter ?? null,
    });
  }

  const check = canPlaceBuilding(city, state, parcelId, catalogId, null, store);
  if (!check.ok) return remember(previews, key, null);

  const shared = sharedInputs(city, state, parcelId);
  if (catalogId === 'farm' || placesAs === 'farm') {
    const cost = check.cost ?? 0;
    const during = shared.valueBefore + cost;
    const navChange = -cost + (during - shared.valueBefore);
    return remember(previews, key, {
      navBefore: shared.navBefore,
      navAfter: shared.navBefore + navChange,
      navChange,
      valueBefore: shared.valueBefore,
      valueDuringWorks: during,
      completionQuarter: state.quarter + 1,
    });
  }

  const during = valueDuringWorks(city, state, parcelId, check.placesAs ?? placesAs);
  const navChange = -check.cashOut + (during - shared.valueBefore) - check.debtTaken;
  return remember(previews, key, {
    navBefore: shared.navBefore,
    navAfter: shared.navBefore + navChange,
    navChange,
    valueBefore: shared.valueBefore,
    valueDuringWorks: during,
    completionQuarter: state.quarter + check.durationQuarters,
  });
}
