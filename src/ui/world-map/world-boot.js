// Keep the document usable while the much larger globe module and its models load.
import { CITY_RETURN_MESSAGE, cityReturnUrl } from '../../core/session-bridge.js';
import { layoutInstance } from '../layout-class.js';

// Set the phone layout attributes before the globe starts.
layoutInstance();

const main = document.getElementById('province');
const loading = document.getElementById('world-loading');
const title = document.getElementById('world-loading-title');
const status = document.getElementById('world-loading-status');
const retry = document.getElementById('world-loading-retry');
const city = document.getElementById('world-loading-return');
let slowTimer;

// This link also works before the game's ribbon exists. Do not register a second
// Escape handler: the live globe owns panel dismissal and city return after boot.
let savedCity = null;
try { savedCity = localStorage.getItem('district-deck:v305:last-run'); } catch { /* recovery handles storage */ }
city.href = cityReturnUrl(location.href, { standalone: parent === window, savedCity });
city.addEventListener('click', (event) => {
  if (parent === window) return;
  event.preventDefault();
  parent.postMessage(CITY_RETURN_MESSAGE, location.origin);
});
retry.addEventListener('click', () => location.reload());

function setPhase(phase, message) {
  if (!['loading', 'recovery', 'ready', 'failed'].includes(phase)) return;
  if (document.body.dataset.worldPhase === 'failed' && phase !== 'failed') return;
  const transferFocus = phase === 'ready' && loading.contains(document.activeElement);
  clearTimeout(slowTimer);
  document.body.dataset.worldPhase = phase;
  main.inert = phase !== 'ready';
  main.setAttribute('aria-busy', String(phase === 'loading'));
  loading.hidden = phase === 'recovery' || phase === 'ready';
  if (phase === 'loading') {
    title.textContent = 'Preparing your world';
    status.textContent = message || 'Restoring your trading books and preparing the globe.';
    retry.hidden = true;
    slowTimer = setTimeout(() => {
      status.textContent = 'This is taking longer than usual. You can keep waiting, reload the globe, or return to your city.';
      retry.hidden = false;
    }, 20000);
  } else if (phase === 'failed') {
    title.textContent = 'The globe could not start';
    status.textContent = 'Reload the globe to try again, or return to your city.';
    retry.hidden = false;
  } else if (phase === 'ready') {
    if (transferFocus) document.getElementById('province-canvas').focus({ preventScroll: true });
    window.removeEventListener('error', bootError);
    window.removeEventListener('unhandledrejection', bootError);
    window.removeEventListener('district-deck:world-phase', onPhase);
  }
}

function bootError() {
  // A save-recovery dialog keeps ownership of its controls and explanatory text.
  if (document.body.dataset.worldPhase === 'loading') setPhase('failed');
}
function onPhase(event) { setPhase(event.detail?.phase, event.detail?.message); }
window.addEventListener('district-deck:world-phase', onPhase);
window.addEventListener('error', bootError);
window.addEventListener('unhandledrejection', bootError);
window.addEventListener('pagehide', () => clearTimeout(slowTimer), { once: true });
setPhase('loading');
import('./world-map.js').catch((error) => {
  console.error('World globe failed to start.', error);
  bootError();
});
