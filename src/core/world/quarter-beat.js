// ONE SETTLE FEEDS ONE BEAT. Pure. No DOM.
// Each city settle writes one quarter's ledger; each globe beat applies at most
// one unapplied quarter. Beats between settles run on stock.

export function quarterBeatCanon({
  cityQuarter = null,
  worldBeat = 0,
  lastLedgerQuarter = null,
  lastLedgerAppliedBeat = null,
} = {}) {
  const beat = Number.isInteger(worldBeat) ? worldBeat : 0;
  const quarter = Number.isInteger(cityQuarter) ? cityQuarter : null;
  const appliedQ = Number.isInteger(lastLedgerQuarter) ? lastLedgerQuarter : null;
  const appliedBeat = Number.isInteger(lastLedgerAppliedBeat) ? lastLedgerAppliedBeat : null;

  const unapplied = Number.isInteger(quarter) && Number.isInteger(appliedQ)
    ? Math.max(0, quarter - appliedQ)
    : (Number.isInteger(quarter) && appliedQ == null ? 1 : 0);

  const beatsSinceApply = appliedBeat == null ? beat : beat - appliedBeat;
  // Positive: globe behind the books (unapplied quarters).
  // Negative: globe ran ahead of the last applied quarter.
  const beatsBehind = unapplied > 0
    ? unapplied
    : (appliedBeat == null || beatsSinceApply === 0 ? 0 : -beatsSinceApply);
  const drift = Math.abs(beatsBehind) >= 2;
  const k = Math.abs(beatsBehind);
  const cityChip = `Q${quarter ?? '–'} · BEAT ${beat}`;
  const globePlate = appliedQ == null
    ? `BEAT ${beat} · awaiting the city's books`
    : `BEAT ${beat} · Q${appliedQ} applied`;
  const driftTitle = drift ? `The globe runs ${k} beats behind the books.` : '';
  return Object.freeze({
    cityQuarter: quarter,
    worldBeat: beat,
    appliedQuarter: appliedQ,
    appliedBeat,
    unapplied,
    beatsBehind,
    drift,
    driftTitle,
    cityChip,
    globePlate,
  });
}
