// District Deck V3.00 — modal dialogs.
// A first-time player who navigates by keyboard meets the help sheet before anything
// else. Without focus management, Tab cycles parcels behind the overlay and Enter tries
// to settle a quarter the player has not seen — so every dialog goes through here.

const FOCUSABLE = 'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * True while any dialog is open. Board shortcuts check this and stand down.
 *
 * Derived from the DOM rather than a counter on purpose: an overlay removed by anything
 * other than its own close() would leak a counter and leave the keyboard dead for the
 * rest of the session, with no way back. The DOM cannot disagree with itself.
 */
export function isModalOpen() {
  return document.querySelector('.overlay, dialog[open], [data-world-overlay]') !== null;
}

/**
 * Open a dialog. Returns a close() function. The overlay owns Tab and Escape for as
 * long as it is up, and restores focus to whatever had it before.
 * An optional returnFocus resolver can supply a launch control replaced while open.
 */
export function openModal(host, { html, label, footer = '', onClick, returnFocus = null }) {
  const previous = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="sheet sheet--document mat-carbon" data-phone="dialog" role="dialog" aria-modal="true" aria-label="${label}">
    <header class="deed-binder sheet__binder">
      <div class="deed-tab sheet__nameplate"><span>${label}</span></div>
      <button class="card__close" type="button" data-close aria-label="Close">✕</button>
    </header>
    <div class="sheet__paper">${html}</div>
    ${footer ? `<footer class="sheet__actions qb__actions">${footer}</footer>` : ''}
  </div>`;
  const sheet = overlay.firstElementChild;

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onKeydown, true);
    const target = returnFocus ? returnFocus() : previous;
    if (target && typeof target.focus === 'function') target.focus();
  };

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') {
      // Board shortcuts must not fire through a dialog.
      event.stopPropagation();
      return;
    }
    const items = Array.from(sheet.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
    event.stopPropagation();
  }

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) { close(); return; }
    if (event.target.closest('[data-close]')) { close(); return; }
    onClick?.(event, close);
  });

  host.appendChild(overlay);
  document.addEventListener('keydown', onKeydown, true);

  // If the overlay leaves the DOM by any other route, tear the listener down with it.
  const watcher = new MutationObserver(() => {
    if (!overlay.isConnected) { watcher.disconnect(); close(); }
  });
  watcher.observe(host, { childList: true });

  const primary = sheet.querySelector('[data-autofocus]') ?? sheet.querySelector(FOCUSABLE);
  primary?.focus();

  return close;
}
