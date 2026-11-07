/** Keep ordinary anchored cards; let an exposed selected port try bounded placement. */
export function anchoredPortLabels(items, bounds, { selectedId, hudRects = [] } = {}) {
  return items.filter((item) => {
    const fits = item.x - item.w / 2 >= bounds.left
      && item.x + item.w / 2 <= bounds.right
      && item.y - item.h / 2 >= bounds.top
      && item.y + item.h / 2 <= bounds.bottom;
    if (fits) return true;
    if (item.id !== selectedId || !Number.isFinite(item.w) || !Number.isFinite(item.h)
      || item.w <= 0 || item.h <= 0
      || item.w > bounds.right - bounds.left || item.h > bounds.bottom - bounds.top) return false;
    const x = item.anchorX, y = item.anchorY;
    return Number.isFinite(x) && Number.isFinite(y)
      && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom
      && !hudRects.some((r) => x >= r.x - r.w / 2 && x <= r.x + r.w / 2
        && y >= r.y - r.h / 2 && y <= r.y + r.h / 2);
  });
}

/** Selected and hovered ports win collisions, then ports with available/working books. */
export function portLabelTiers(items, { selectedId, hoveredId } = {}) {
  const focus = items.filter((item) => item.id === selectedId || item.id === hoveredId)
    .map((item) => ({ ...item, rank: item.id === hoveredId ? -2 : -1 }));
  const others = items.filter((item) => item.id !== selectedId && item.id !== hoveredId);
  return {
    home: focus,
    routeEnds: others.filter((item) => item.priority === 'route-end'),
    rest: others.filter((item) => item.priority !== 'route-end'),
  };
}
