// Seller-fee compatibility. Absent marker is legacy. Version 1 is opt-in only.

export function validateSellerFeeVersion(value) {
  if (value === undefined) return;
  if (value !== 1) throw new RangeError('Unsupported seller fee version.');
}

export function validateSellerFeeRun(state) {
  validateSellerFeeVersion(state?.sellerFeeVersion);
  for (const start of (state?.log ?? []).filter((row) => row?.type === 'run-start')) {
    validateSellerFeeVersion(start.sellerFeeVersion);
    if (start.sellerFeeVersion !== state.sellerFeeVersion) {
      throw new Error('Run-start seller fee mismatch.');
    }
  }
}

export function ordinarySellerBaseBp({ version, seat, operatorFeeBp, legacyFeeBp }) {
  if (version === 1 && seat === 'P1') return operatorFeeBp;
  return legacyFeeBp;
}

/** Token discount may not rise above the ordinary base, including a zero base. */
export function clampSellerFeeBp(base) {
  return Math.min(base, Math.max(50, base - 80));
}
