/**
 * Presentation-only variation for authored messages. Integer keys retain the
 * existing repeatable choice; other keys use the existing random UI fallback.
 * Keep this outside ledger/replay code.
 */
export function pickMessage(bank, key = null) {
  if (!bank || !bank.length) return '';
  if (key !== null && Number.isInteger(key)) {
    return bank[((key % bank.length) + bank.length) % bank.length];
  }
  return bank[Math.floor(Math.random() * bank.length)];
}
