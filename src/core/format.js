// District Deck V3.00 — display formatting. Pure, no state, no locale surprises.
// The ledger holds integers; this file is the only place they become strings.

export function money(value) {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}m`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
  return `${sign}$${abs}`;
}

export function moneyExact(value) {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(Math.round(value)).toLocaleString('en-AU')}`;
}

export function signedMoney(value, { exact = false, plus = true } = {}) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '$0';
  // COPY-DRAFT: WORD JOINER keeps a sign with its figure in both text and HTML receipts.
  const sign = value > 0 ? (plus ? '+\u2060' : '') : '−\u2060';
  return `${sign}${(exact ? moneyExact : money)(Math.abs(value))}`;
}

export function pct(bp, digits = 1) {
  return `${(bp / 100).toFixed(digits)}%`;
}

export function signedPct(bp, digits = 1) {
  const v = (bp / 100).toFixed(digits);
  return `${bp > 0 ? '+' : ''}${v}%`;
}

export function levelLabel(level) {
  // Short L0/L1/L2 tags match card "BUILT FORM L*" and planning permit copy.
  return ['L0 · As standing', 'L1 · First succession', 'L2 · Second succession'][level]
    ?? `L${level}`;
}

export function conditionLabel(condition) {
  return ['Tired', 'Sound', 'Renewed'][condition] ?? `Condition ${condition}`;
}

/**
 * Escape anything player-supplied before it meets innerHTML. The seed is the only such
 * value today, but "only one place" is exactly how the second place gets missed.
 */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Today's UTC daily seed. Time enters core only through arguments — this is the caller's job. */
export function dailySeed(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `DD-${y}${m}${d}`;
}
