// Farm ownership comes from the live city retained by the session bridge.
// This is marker data only; the globe owns its established label presentation.
export function farmMarkerData(state) {
  return Object.entries(state?.farms ?? {}).filter(([, farm]) => farm.owner === 'player').map(([id, farm]) => ({
    id, cityId: 'melbourne-inner', fieldId: [...farm.fieldId],
    label: `${id.toUpperCase()} · ${farm.completedQuarter != null ? 'Farm' : farm.construction ? 'Building farm' : 'Owned paddock'}`,
    route: 'Hinterland gateway → Melbourne town-square market',
  }));
}

export function liveFarmMarkers(win = window) {
  try { return farmMarkerData(win.parent === win ? null : win.parent.__districtDeck?.getState?.()); }
  catch { return []; }
}

export function farmMarkerSuffix(markers) {
  return markers.length ? ` · FARM${markers.length > 1 ? ' ×' + markers.length : ''}` : '';
}
