// Keep the live city in its document while visiting the globe. No save migration,
// quarter-start reducer, or camera reconstruction is needed on return.
export const CITY_RETURN_MESSAGE = 'district-deck:world-city-return';

export function cityReturnUrl(href, { standalone = false, savedCity = null } = {}) {
  const url = new URL('./play.html', href);
  url.search = new URL(href).search;
  if (!standalone) return url.href;
  if (savedCity) {
    try {
      const envelope = JSON.parse(savedCity);
      const state = JSON.parse(envelope.canonicalState);
      if (!Number.isInteger(state.seed) || state.seed < 0 || state.seed > 0xffffffff) throw new Error('Invalid seed');
      // The city loader performs the full checksum/schema validation. Here the
      // saved seed only chooses the campaign URL, never authorises a save write.
      url.searchParams.set('seed', String(state.seed));
      url.searchParams.set('continue', '1');
      return url.href;
    } catch {
      // The launcher's recovery screen can explain an unreadable city save.
      return new URL('./index.html', href).href;
    }
  }
  url.searchParams.delete('continue');
  return url.href;
}

export function openWorldOverlay({ root, view, onFrame, url = location.href }) {
  if (document.querySelector('[data-world-overlay]')) return;
  const focus = document.activeElement;
  const wasInert = root.inert;
  const wasRunning = view.running;
  const globeUrl = new URL('./world.html', url);
  globeUrl.search = new URL(url).search;
  const overlay = document.createElement('dialog');
  overlay.dataset.worldOverlay = '1';
  overlay.setAttribute('aria-label', 'World globe');
  overlay.style.cssText = 'position:fixed;inset:0;margin:0;padding:0;border:0;width:100vw;height:100vh;max-width:none;max-height:none;background:#171b21;';
  const frame = document.createElement('iframe');
  frame.title = 'World globe — CITY returns to your current quarter';
  frame.src = globeUrl.href;
  frame.style.cssText = 'display:block;width:100%;height:100%;border:0;';
  overlay.append(frame);
  const close = () => {
    window.removeEventListener('message', receive);
    overlay.remove();
    root.inert = wasInert;
    if (wasRunning) view.start(onFrame);
    if (focus?.isConnected) focus.focus({ preventScroll: true });
  };
  const receive = (event) => {
    if (event.origin === globeUrl.origin && event.source === frame.contentWindow
      && event.data === CITY_RETURN_MESSAGE) close();
  };
  overlay.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  window.addEventListener('message', receive);
  view.stop();
  root.inert = true;
  document.body.append(overlay);
  overlay.showModal();
  frame.focus();
}

export function wireCityReturn(link, win = window, { dismissPanel = () => false } = {}) {
  if (!link) return;
  let savedCity = null;
  if (win.parent === win) {
    try { savedCity = win.localStorage?.getItem('district-deck:v305:last-run') ?? null; } catch { /* launcher handles unavailable saves */ }
  }
  link.href = cityReturnUrl(win.location.href, { standalone: win.parent === win, savedCity });
  if (win.parent === win) return;
  const returnToCity = (event) => {
    event.preventDefault();
    win.parent.postMessage(CITY_RETURN_MESSAGE, win.location.origin);
  };
  link.addEventListener('click', returnToCity);
  win.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (dismissPanel()) {
      event.preventDefault();
      return;
    }
    returnToCity(event);
  });
}
