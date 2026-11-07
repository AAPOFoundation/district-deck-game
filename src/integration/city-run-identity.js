/**
 * Browser persistence boundary for a city run identity. Export writes call this
 * explicitly; importing the module never reads storage, clocks or entropy.
 * Legacy storage and failure semantics are preserved here.
 */
export function resolveStoredRunIdentity(store, key, prefixForRun) {
  let stored = null;
  try {
    stored = store && typeof store.get === 'function'
      ? store.get(key) ?? null
      : globalThis.localStorage?.getItem(key) ?? null;
  } catch { /* optional storage */ }
  if (typeof stored === 'string' && stored.length > 0) return stored;

  const uuid = globalThis.crypto?.randomUUID?.();
  const minted = typeof uuid === 'string' && uuid.length > 0
    ? uuid
    : `run-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  const runId = `${prefixForRun()}:${minted}`;
  let persisted = false;
  try {
    if (store && typeof store.set === 'function') persisted = Boolean(store.set(key, runId));
    else {
      globalThis.localStorage?.setItem(key, runId);
      persisted = true;
    }
  } catch { /* persistence failure is returned below */ }
  if (!persisted && typeof uuid !== 'string') return null;
  return runId;
}
