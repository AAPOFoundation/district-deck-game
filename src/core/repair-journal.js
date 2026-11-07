// A repair is accepted only after city, world and any settlement exports persist.
// A crash before the commit record rolls every projection back on next load.
import { hash32 } from './rng.js';

export const REPAIR_JOURNAL_KEY = 'district-deck:v4:repair-transaction';
const CITY_KEY = 'district-deck:v305:last-run';
const WORLD_KEY = 'district-deck:v332:world-run';
const AUXILIARY_KEYS = new Set(['district-deck:v332:city-exports:melbourne', 'district-deck:v332:city-run-identity:melbourne']);
const PROTOCOL = 'district-deck-repair-transaction-v1';
const MAX_JOURNAL_CHARS = 2_000_000;
const fingerprint = (raw) => raw == null ? null : `${raw.length}:${hash32(raw).toString(16)}`;
const unavailable = () => ({ ok: false, reason: 'Repair could not be saved. Your pending repair must recover before play continues.' });

function writeExact(store, key, value) {
  try {
    if ((store.get(key) ?? null) === value) return true;
    if (value == null) {
      if (store.get(key) == null) return true;
      store.remove(key);
    } else store.set(key, value);
    return (store.get(key) ?? null) === value;
  } catch { return false; }
}

export function recoverRepairTransaction(store) {
  let raw;
  try { raw = store.get(REPAIR_JOURNAL_KEY); } catch { return unavailable(); }
  if (raw == null) return { ok: true, recovered: false };
  let entry;
  try { entry = JSON.parse(raw); } catch { return unavailable(); }
  if (raw.length > MAX_JOURNAL_CHARS || entry?.protocol !== PROTOCOL
    || !['prepared', 'committed'].includes(entry.phase)
    || !(entry.beforeCity === null || typeof entry.beforeCity === 'string')
    || typeof entry.beforeWorld !== 'string'
    || typeof entry.afterCityHash !== 'string' || typeof entry.afterWorldHash !== 'string'
    || !Array.isArray(entry.auxiliary ?? [])
    || (entry.auxiliary ?? []).some((row) => !AUXILIARY_KEYS.has(row?.key)
      || !(row.before === null || typeof row.before === 'string')
      || !(row.afterHash === null || typeof row.afterHash === 'string'))
    || new Set((entry.auxiliary ?? []).map((row) => row.key)).size !== (entry.auxiliary ?? []).length) return unavailable();
  if (entry.phase === 'prepared') {
    const targets = [[WORLD_KEY, entry.beforeWorld, entry.afterWorldHash], [CITY_KEY, entry.beforeCity, entry.afterCityHash],
      ...(entry.auxiliary ?? []).map((row) => [row.key, row.before, row.afterHash])];
    // Do not overwrite a separately changed save or an unrecognised journal.
    try {
      for (const [key, before, afterHash] of targets) {
        const current = store.get(key) ?? null;
        if (current !== before && fingerprint(current) !== afterHash) return unavailable();
      }
    } catch { return unavailable(); }
    for (const [key, before] of targets) if (!writeExact(store, key, before)) return unavailable();
  }
  if (!writeExact(store, REPAIR_JOURNAL_KEY, null)) return unavailable();
  return { ok: true, recovered: true };
}

export function persistRepairTransaction({ beforeWorld, afterWorld, afterCity, additionalWrites = [] }, store) {
  const recovered = recoverRepairTransaction(store);
  if (!recovered.ok) return recovered;
  if (!Array.isArray(additionalWrites) || additionalWrites.some((row) => !AUXILIARY_KEYS.has(row?.key))
    || new Set(additionalWrites.map((row) => row.key)).size !== additionalWrites.length) return unavailable();
  let beforeCity;
  try {
    beforeCity = store.get(CITY_KEY) ?? null;
    for (const row of additionalWrites) {
      if ((store.get(row.key) ?? null) !== row.before) return { ok: false, reason: 'City exports changed. Retry the quarter before continuing.' };
    }
    if (store.get(WORLD_KEY) !== beforeWorld) return { ok: false, reason: 'The world changed. Reopen the repair before trying again.' };
  } catch { return unavailable(); }
  const entry = { protocol: PROTOCOL, phase: 'prepared', beforeCity, beforeWorld,
    afterCityHash: fingerprint(afterCity), afterWorldHash: fingerprint(afterWorld),
    auxiliary: additionalWrites.map(({ key, before, after }) => ({ key, before, afterHash: fingerprint(after) })),
  };
  const prepared = JSON.stringify(entry);
  if (prepared.length > MAX_JOURNAL_CHARS) return { ok: false, reason: 'This repair needs more save space. Your city and world have not changed.' };
  if (!writeExact(store, REPAIR_JOURNAL_KEY, prepared)) return unavailable();
  if (!writeExact(store, CITY_KEY, afterCity) || !writeExact(store, WORLD_KEY, afterWorld)
    || additionalWrites.some(({ key, after }) => !writeExact(store, key, after))) {
    const rollback = recoverRepairTransaction(store);
    return rollback.ok
      ? { ok: false, reason: 'Repair could not be saved. Your city cash and world are unchanged.' }
      : rollback;
  }
  if (!writeExact(store, REPAIR_JOURNAL_KEY, JSON.stringify({ ...entry, phase: 'committed' }))) {
    const rollback = recoverRepairTransaction(store);
    return rollback.ok
      ? { ok: false, reason: 'Repair could not be saved. Your city cash and world are unchanged.' }
      : rollback;
  }
  // Committed journals can be discarded later without changing either save.
  writeExact(store, REPAIR_JOURNAL_KEY, null);
  return { ok: true };
}
