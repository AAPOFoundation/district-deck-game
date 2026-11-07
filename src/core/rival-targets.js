// Petridis's intent is recomputed only at settle, so this filter keeps the list to parcels the player can still contest in between.
export function disclosedRivalTargets(state) {
  return [...new Set(state?.rival?.intent?.parcelIds ?? [])].filter((id) => {
    const owner = state?.holdings?.[id]?.owner;
    return owner !== 'player' && owner !== 'rival';
  });
}
