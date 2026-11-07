import { layoutRule } from './layout-class.js';

export const TOAST_CAP_WITH_CARD = 2;

// Viewport coordinates; the returned height bounds the entire stack, including
// long receipts. Callers clip that region so no notice paints across the card.
export function toastAnchor({ viewport, cardRect = null, statusBottom = 0, fabTop = viewport.height }) {
  const gap = 12;
  const { width, height } = viewport;
  const phone = layoutRule(width, height, false, false).phoneHud;
  let left = gap, right = width - gap;
  const top = Math.max(gap, statusBottom + gap);
  let bottom = Math.min(height - gap, fabTop - gap);
  if (cardRect) {
    if (phone && cardRect.top > top) {
      bottom = Math.min(bottom, cardRect.top - gap);
    } else {
      const after = width - gap - cardRect.right - gap;
      const before = cardRect.left - gap - gap;
      if (after >= before) left = Math.max(left, cardRect.right + gap);
      else right = Math.min(right, cardRect.left - gap);
    }
  }
  return { left, top, width: Math.max(0, Math.min(360, right - left)), maxHeight: Math.max(0, bottom - top) };
}
