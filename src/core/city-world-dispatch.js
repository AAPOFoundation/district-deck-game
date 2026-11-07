// Browser/storage boundary. Reducers receive recorded inputs and emit proposed
// world effects; legality probes and replays never read or write browser storage.
import { CITY_EXPORTS_KEY, CITY_RUN_IDENTITY_KEY, writeCityExports, clearCityExports } from './city-exports.js';
import { applyAction } from './state.js';
import { createLocalRunEnvelope, inspectLocalRun, LAST_RUN_KEY } from '../ui/landing.js';
import { persistRepairTransaction, recoverRepairTransaction } from './repair-journal.js';
import { inspectWorldRun, serialiseWorld, WORLD_RUN_KEY, worldStore, worldStoreGet, advanceWorldOnCitySettle } from './world/envelope.js';

function rejected(state, reason) {
  return { state, rejected: true, events: [{ kind: 'reject', reason }] };
}

export function cityPersistencePolicy(search) {
  const params = new URLSearchParams(search);
  return { allowPersistentRepairs: !params.has('fixture') && !params.has('q') && !params.has('room') };
}

// QA overlays main.js opens on load. quality is a player setting, not a boot.
const QA_BOOT_PARAMS = Object.freeze(['desk', 'shop', 'rush', 'garden', 'playground', 'square', 'script', 'look']);

function qaBootSearch(search) {
  const params = new URLSearchParams(search);
  return QA_BOOT_PARAMS.some((key) => {
    const value = params.get(key);
    return value != null && value !== '' && value !== '0';
  });
}

/** Every out-of-reducer campaign mutation reconciles repairs before touching saves. */
export function runCityCampaignMutation({ search, store = worldStore }, mutate) {
  if (!cityPersistencePolicy(search).allowPersistentRepairs) {
    return { ok: false, reason: 'Campaign changes are unavailable in a preview.' };
  }
  const recovery = recoverRepairTransaction(store);
  if (!recovery.ok) return recovery;
  return mutate(store);
}

/** Preview boot is deliberately storage-free, including pending journal recovery. */
export function prepareCitySession({ search, seed, store = worldStore }) {
  if (!cityPersistencePolicy(search).allowPersistentRepairs) {
    return { resumedRun: false, preserveInvalidSave: false, state: null };
  }
  // A QA boot reads the saved run and leaves it, including its export queue, untouched.
  if (qaBootSearch(search)) {
    inspectLocalRun(store.get(LAST_RUN_KEY));
    return { resumedRun: false, preserveInvalidSave: true, state: null };
  }
  const recovery = recoverRepairTransaction(store);
  if (!recovery.ok) throw new Error(recovery.reason);
  const saved = inspectLocalRun(store.get(LAST_RUN_KEY));
  const params = new URLSearchParams(search);
  if (params.get('continue') === '1') {
    if (saved.status !== 'valid') throw new Error(saved.reason || 'No valid local run is available to continue.');
    if (saved.state.seed !== seed) throw new Error('The continue URL seed does not match the saved run.');
    return { resumedRun: true, preserveInvalidSave: false, state: saved.state };
  }
  // Restart removes the save and reloads. That boot keeps the export queue until the new
  // run's first save. A fresh URL opened while a save is still stored drops only the bridge.
  if (saved.status !== 'missing') clearCityExports(store);
  return { resumedRun: false, preserveInvalidSave: saved.status === 'invalid', state: null };
}

export function saveCitySession({
  search, state, savedAt, preserveInvalidSave = false, clearExports = false, store = worldStore,
}) {
  const blocked = !cityPersistencePolicy(search).allowPersistentRepairs || preserveInvalidSave || qaBootSearch(search);
  // Blind clear only when this action did not just write the new run's own queue.
  if (clearExports && !blocked) clearCityExports(store);
  if (blocked) return { saved: false };
  try {
    const result = runCityCampaignMutation({ search, store }, () => ({
      ok: true, saved: store.set(LAST_RUN_KEY, JSON.stringify(createLocalRunEnvelope(state, savedAt))) === true,
    }));
    return { ...result, saved: result.saved === true };
  }
  catch { return { saved: false }; }
}

export function previewRestartUrl(href, seed, mode) {
  const url = new URL(href);
  if (cityPersistencePolicy(url.search).allowPersistentRepairs && !qaBootSearch(url.search)) return null;
  url.searchParams.delete('continue');
  if (mode === 'same') url.searchParams.set('seed', String(seed));
  else url.searchParams.delete('seed');
  return url.href;
}

export function applyCityAction(city, state, action, store = worldStore, {
  savedAt = '1970-01-01T00:00:00.000Z', allowPersistentRepairs = true,
} = {}) {
  const body = action?.action ?? action;
  const previewRepairReason = 'Repairs are unavailable in fixture and quarter previews. Open your saved city to repair the campaign.';
  if (!allowPersistentRepairs && body?.type === 'repair-facility') return rejected(state, previewRepairReason);
  if (allowPersistentRepairs) {
    const recovery = recoverRepairTransaction(store);
    if (!recovery.ok) return rejected(state, recovery.reason);
  }
  let input = action;
  if (['settle', 'station-unit', 'commit-quarter', 'repair-facility', 'abort-process', 'place-building', 'defect', 'honour-pact', 'apply-deadline'].includes(body?.type)) {
    const inspected = inspectWorldRun(worldStoreGet(WORLD_RUN_KEY, store));
    if (inspected.status === 'valid') {
      const world = inspected.world;
      if (['repair-facility', 'abort-process', 'place-building'].includes(body.type)) {
        const enriched = { ...body, worldSnapshot: serialiseWorld(world),
          ...(body.type === 'place-building' ? { worldCityExports: worldStoreGet(CITY_EXPORTS_KEY, store), worldCityIdentity: worldStoreGet(CITY_RUN_IDENTITY_KEY, store) } : {}),
        };
        input = action.action ? { ...action, action: enriched } : enriched;
      } else {
        // Ordinary quarters need only the roster. Retain the full world only
        // for process acknowledgements (or packets that may select a process).
        const needsProcessWorld = body.type !== 'station-unit' && (Boolean(action.action) || body.type === 'apply-deadline'
          || Object.values(state.holdings ?? {}).some((holding) => holding.processId || holding.processRun));
        input = { ...action, ...(needsProcessWorld ? { worldSnapshot: serialiseWorld(world) } : {}), worldMilitary: {
          beat: world.beat,
          caps: { tank: world.forces?.army ?? 0, drone: world.forces?.drone ?? 0, officer: world.ambition?.officers ?? 0 },
        } };
      }
    }
  }
  const result = applyAction(city, state, input);
  if (result.rejected) return result;
  const effects = result.events.filter((event) => event.kind === 'world-repair');
  if (!effects.length) return result;
  if (!allowPersistentRepairs) return rejected(state, previewRepairReason);
  // Validate the whole batch before a single write. A globe edited while a
  // hotseat packet was pending must not be overwritten by an old snapshot.
  const inspected = inspectWorldRun(worldStoreGet(WORLD_RUN_KEY, store));
  if (inspected.status !== 'valid') return rejected(state, 'World repair could not be saved. Your city cash is unchanged.');
  const beforeWorld = serialiseWorld(inspected.world);
  let proposed = beforeWorld;
  for (const effect of effects) {
    if (effect.before !== proposed) return rejected(state, 'The world changed. Reopen the repair before trying again.');
    proposed = effect.after;
  }
  const savedCity = worldStoreGet(LAST_RUN_KEY, store);
  if (savedCity != null && inspectLocalRun(savedCity).status !== 'valid') {
    return rejected(state, 'The saved city needs recovery before a repair can be recorded. Its existing save has been preserved.');
  }
  const settled = result.events.some((event) => event.kind === 'settle');
  const additionalWrites = [];
  let exportNotices = [];
  if (settled) {
    // A hotseat repair can also finish the quarter. Stage its export queue,
    // identity and resulting world beat inside the same recoverable commit.
    const sources = new Map();
    const writes = new Map([[WORLD_RUN_KEY, proposed]]);
    let readFailed = false;
    const staged = {
      get(key) {
        if (writes.has(key)) return writes.get(key);
        if (!sources.has(key)) {
          try { sources.set(key, store.get(key) ?? null); }
          catch (error) { readFailed = true; throw error; }
        }
        return sources.get(key);
      },
      set(key, value) {
        if (![WORLD_RUN_KEY, CITY_EXPORTS_KEY, CITY_RUN_IDENTITY_KEY].includes(key)) throw new Error('Unexpected settlement write');
        writes.set(key, value); return true;
      },
    };
    const logBefore = result.state.log?.length ?? 0;
    if (!writeCityExports(city, result.state, staged) || readFailed) {
      return rejected(state, 'Quarter exports could not be prepared. Your repair and quarter have not been saved.');
    }
    advanceWorldOnCitySettle(staged);
    if (readFailed) return rejected(state, 'Quarter exports could not be read. Retry before continuing.');
    proposed = writes.get(WORLD_RUN_KEY);
    exportNotices = (result.state.log ?? []).slice(logBefore);
    for (const [key, after] of writes) {
      if (key !== WORLD_RUN_KEY) additionalWrites.push({ key, before: sources.get(key) ?? null, after });
    }
  }
  const persisted = persistRepairTransaction({ beforeWorld, afterWorld: proposed,
    afterCity: JSON.stringify(createLocalRunEnvelope(result.state, savedAt)), additionalWrites,
  }, store);
  if (!persisted.ok) return rejected(state, persisted.reason);
  return { ...result, settlementExportsCommitted: settled, exportNotices };
}

/** A successful save makes refresh a resume; fixtures never become saved runs. */
export function resumeUrlAfterSave(href, seed) {
  const url = new URL(href);
  if (url.searchParams.has('fixture') || url.searchParams.has('q') || url.searchParams.has('room') || qaBootSearch(url.search)) return null;
  url.searchParams.set('seed', String(seed));
  url.searchParams.set('continue', '1');
  return url.href;
}
