import {
  WORLD_RUN_KEY, inspectWorldRun, createWorldRun,
  serialiseWorld, catchUpPendingSettles,
} from '../../core/world/envelope.js';
import { hash32 } from '../../core/rng.js';
import { recoverRepairTransaction } from '../../core/repair-journal.js';

// Unlike the optional-storage adapter, failed reads must not look like missing saves.
const browserStore = {
  get: (key) => globalThis.localStorage.getItem(key),
  set(key, value) { globalThis.localStorage.setItem(key, value); return true; },
  remove(key) { globalThis.localStorage.removeItem(key); },
};

function writeVerified(store, key, value) {
  try { return store.set(key, value) === true && store.get(key) === value; }
  catch { return false; }
}

function durableCatchUp(world, store) {
  // Catch-up is calculated in memory. Only the final world is persisted; the
  // source export queue and city identity are read-only throughout recovery.
  const pending = new Map();
  const sources = new Map();
  let readFailed = false;
  const staged = {
    get(key) {
      if (pending.has(key)) return pending.get(key);
      if (!sources.has(key)) {
        try { sources.set(key, store.get(key)); }
        catch (error) { readFailed = true; throw error; }
      }
      return sources.get(key);
    },
    set(key, value) { pending.set(key, value); return true; },
  };
  try {
    const next = catchUpPendingSettles(world, staged);
    if (readFailed) return { status: 'unavailable', reason: 'Pending city quarters could not be read. Retry when storage is available.' };
    const finalRaw = serialiseWorld(next);
    if (finalRaw !== serialiseWorld(world) && !writeVerified(store, WORLD_RUN_KEY, finalRaw)) {
      return { status: 'unavailable', reason: 'Pending city quarters could not be saved. Retry to finish restoring your world.' };
    }
    const durable = inspectWorldRun(store.get(WORLD_RUN_KEY));
    if (durable.status !== 'valid' || serialiseWorld(durable.world) !== finalRaw) {
      return { status: 'unavailable', reason: 'The saved world could not be verified. Retry before continuing.' };
    }
    return { status: 'ready', world: next };
  } catch {
    return { status: 'unavailable', reason: 'Pending city quarters could not be restored. Your city exports have been retained.' };
  }
}

/** Explicit recovery commit. Validate and back up the exact original before replacing it. */
export function importWorldSession({ candidateRaw, expectedRaw, store = browserStore }) {
  const candidate = inspectWorldRun(candidateRaw);
  if (candidate.status !== 'valid') return { ok: false, reason: 'That file is not a compatible world save.' };
  const recovered = recoverRepairTransaction(store);
  if (!recovered.ok) return recovered;
  let original;
  try { original = store.get(WORLD_RUN_KEY); }
  catch { return { ok: false, reason: 'World storage is unavailable.' }; }
  if (original !== expectedRaw) return { ok: false, reason: 'Your world changed while choosing the file. Retry before importing.' };
  let backupKey = null;
  if (original != null) {
    backupKey = `${WORLD_RUN_KEY}:recovery-backup:${hash32(String(original)).toString(16)}`;
    try {
      const backup = store.get(backupKey);
      if (backup != null && backup !== original) return { ok: false, reason: 'The recovery backup could not be safely created.' };
      if (backup !== original && !writeVerified(store, backupKey, original)) {
        return { ok: false, reason: 'The original save could not be backed up. Nothing has been replaced.' };
      }
    } catch { return { ok: false, reason: 'The original save could not be backed up. Nothing has been replaced.' }; }
  }
  const replacement = serialiseWorld(candidate.world);
  if (!writeVerified(store, WORLD_RUN_KEY, replacement)) {
    return { ok: false, backupKey, reason: 'The imported save could not be verified. Your original remains in the recovery backup.' };
  }
  return { ok: true, world: candidate.world, backupKey };
}

export function requestedWorldSeed(search) {
  const raw = new URLSearchParams(search).get('worldSeed');
  if (raw == null || raw === '') return { kind: 'absent' };
  const seed = Number(raw);
  return Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff
    ? { kind: 'seed', seed: seed >>> 0 }
    : { kind: 'invalid' };
}

/** Only a genuinely missing save may be created. Recovery never writes a save. */
export function loadWorldSession({ request, defaultSeed, store = browserStore }) {
  const recovered = recoverRepairTransaction(store);
  if (!recovered.ok) return { status: 'unavailable', reason: recovered.reason };
  let raw;
  try { raw = store.get(WORLD_RUN_KEY); } catch {
    return { status: 'unavailable' };
  }
  if (raw === '') return { status: 'invalid-save', raw };
  const inspected = inspectWorldRun(raw);
  if (inspected.status === 'invalid') return { status: 'invalid-save', raw, reason: inspected.reason };
  if (request.kind === 'invalid') return { status: 'invalid-seed', raw };
  if (inspected.status === 'valid') {
    if (request.kind === 'seed' && request.seed !== inspected.world.worldSeed) {
      return { status: 'seed-conflict', world: inspected.world, requestedSeed: request.seed, raw };
    }
    return durableCatchUp(inspected.world, store);
  }
  const created = createWorldRun({ worldSeed: request.kind === 'seed' ? request.seed : defaultSeed });
  if (!writeVerified(store, WORLD_RUN_KEY, serialiseWorld(created))) return { status: 'unavailable' };
  return durableCatchUp(created, store);
}
