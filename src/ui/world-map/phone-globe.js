/** Whether the globe uses the tall phone layout. */
export function isPhoneTall(root) {
  return root?.dataset?.phoneHud === '1' && root?.dataset?.layout === 'tall';
}

/** Keep tall-phone framing between the mast and the visible dossier, however narrow; only an inverted band falls back. */
export function phoneMapRect(rect, { phoneTall = false, mastBottom = 0, dossierTop = null } = {}) {
  if (!phoneTall) return rect;
  const top = Math.max(rect.top, mastBottom + 8);
  const bottom = Number.isFinite(dossierTop) ? Math.min(rect.bottom, dossierTop - 8) : rect.bottom;
  return bottom >= top ? { ...rect, top, bottom } : rect;
}

/** Keep the dossier closed only while its selection key is unchanged. */
export function phoneDossierClosed(closedKey, selectionKey) {
  return typeof closedKey === 'string' && closedKey === selectionKey;
}

/** Whether Close has hidden the dossier: the phone sheet hides it only under the phone layout. */
export function phonePanelHidden(dossier, root) {
  return root?.dataset?.phoneHud === '1' && typeof dossier?.dataset?.phoneClosed === 'string';
}

/** Identify Yard taps that open a panel, excluding category expansion. */
export function yardTapOpensPanel(target) {
  if (target?.closest?.('[data-worktree]')) return true;
  if (target?.closest?.('[data-ambition-category]')) return false;
  return Boolean(target?.closest?.('.province-yard-row-main, .province-ambition, .province-raise-force'));
}

/** Close an open tall-phone Yard and keep its toggle in sync. */
export function collapseYardDrawer(yard, root) {
  if (!isPhoneTall(root) || yard?.dataset?.expanded !== '1') return false;
  yard.querySelector('.v4-yard-toggle').setAttribute('aria-expanded', 'false');
  yard.dataset.expanded = '0';
  return true;
}

/** Make a dossier Close button whose click stays inside the control. */
export function makeDossierClose(doc, onClose) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'v4-dossier-close';
  button.textContent = 'Close';
  button.setAttribute('aria-label', 'Close this panel');
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClose();
  });
  return button;
}
