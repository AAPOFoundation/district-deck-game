// District Deck V3.70 L7 — how a player actually reaches the three block-centre minigames,
// and how those overlays stop driving the board underneath them.
//
// TWO PROBLEMS, ONE FILE.
//
// 1. REACHABILITY. The games open by tapping the block centre on the board
//    (`blockCentreGameAt` from `main.js` pointerup). The left-side launcher rail is a
//    QA/test seam (`installBlockCentreEntry`) and is not auto-mounted in play.
//
// 2. KEY FALL-THROUGH. All three overlays bound `keydown` on `window` and the board's own
//    handler is also on `window`, registered EARLIER — so `stopPropagation()` from an
//    overlay was useless and `stopImmediatePropagation()` from a later bubble listener was
//    too late. Pressing `v` inside a modal cycled the board lens behind it. The fix is a
//    CAPTURE-phase listener on `window`: capture runs before every bubble listener on the
//    same node regardless of registration order, so one `stopImmediatePropagation()` there
//    stops the board seeing anything while an overlay is open.
//
// Nothing here reads or writes simulation state. The launcher only calls the three openers
// the app publishes, and reads `city.blockCores` to know which buttons are worth showing.

const GAMES = Object.freeze([
  {
    id: 'veggie',
    useId: 'community-garden',
    label: 'Veggie patch',
    note: 'Sow, water and sell what the beds grow',
    open: 'openVeggie',
  },
  {
    id: 'playground',
    useId: 'playground',
    label: 'Playground',
    note: 'Build the best playground on the block',
    open: 'openPlayground',
  },
  {
    id: 'square',
    useId: 'pocket-park',
    label: 'Town square',
    note: 'Read the board and put something to the floor',
    open: 'openSquare',
  },
]);

const STYLE_ID = 'mge-style';

const CSS = `
.mge {
  position: absolute;
  left: 14px;
  top: calc(var(--bar-h, 46px) + 118px);
  z-index: 17;
  display: grid;
  gap: 5px;
  width: 178px;
  padding: 7px;
  border: 1px solid var(--line, #2a3138);
  border-radius: 12px;
  background: var(--board-face, rgba(16,20,24,0.92));
  box-shadow: 0 10px 26px rgba(0,0,0,0.42);
  font-family: inherit;
}
.mge__title {
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--paper-dim, #9aa4ad);
  padding: 1px 3px 3px;
}
.mge__btn {
  display: grid;
  gap: 1px;
  text-align: left;
  padding: 6px 8px;
  border: 1px solid var(--line, #2a3138);
  border-radius: 9px;
  background: linear-gradient(180deg, rgba(46,54,62,0.72), rgba(14,18,22,0.88));
  color: var(--paper, #ece6da);
  font: inherit;
  cursor: pointer;
}
.mge__btn:hover { border-color: var(--amber, #d8a24a); }
.mge__btn b { font-size: 12px; font-weight: 800; letter-spacing: 0.01em; }
.mge__btn span { font-size: 10px; line-height: 1.25; color: var(--paper-dim, #9aa4ad); }
.mge__btn em { font-size: 10px; font-style: normal; opacity: 0.6; }
@media (max-width: 860px) { .mge { display: none; } }
`;

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.append(style);
}

/** Which block centres of each kind this city actually has. Reads, never writes. */
export function blockCentresOnCity(city) {
  const cores = city?.blockCores ?? [];
  return GAMES
    .map((game) => ({ game, cores: cores.filter((core) => core.useId === game.useId) }))
    .filter((row) => row.cores.length > 0);
}

/**
 * The block centre a board pick landed on, if any — for the tap-to-open hunk in the
 * orchestrator patch. `hit` is whatever `view.pickAt()` returned; anything carrying a world
 * `point` works, which includes the ground and parcel hits.
 *
 * Radius is deliberately generous: a block centre is a 15 m square of turf and the player is
 * aiming at a shed, not at a pixel.
 */
export function blockCentreGameAt(city, hit, radius = 7.5) {
  const point = hit?.point ?? hit?.position ?? null;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  let best = null;
  for (const core of city?.blockCores ?? []) {
    const game = GAMES.find((row) => row.useId === core.useId);
    if (!game || !core.centre) continue;
    const dx = core.centre.x - point.x;
    const dz = core.centre.z - point.z;
    const distance = Math.hypot(dx, dz);
    if (distance > radius) continue;
    if (!best || distance < best.distance) best = { game, core, distance };
  }
  return best;
}

let installed = null;
/** The app the mounted rail was built against. See `liveApp` and the watcher below. */
let installedApp = null;

/**
 * The app a rail button should drive RIGHT NOW.
 *
 * r2's rail closed over the app it was installed against. `main.js` `dispose()` deletes
 * `window.__districtDeck`, and `installBlockCentreEntry` returns early while the node is
 * still connected, so a board torn down and rebuilt inside one page load left three buttons
 * driving a dead app — the r2 critic filed it from a code read and said so. Resolving the
 * handle at click time makes that unreachable rather than unlikely: the rail drives whatever
 * board is live, and falls back to the one it was born with.
 */
function liveApp(fallback) {
  const handle = globalThis.window?.__districtDeck;
  if (handle && typeof handle.openVeggie === 'function') return handle;
  return fallback;
}

/**
 * Mount the launcher. Idempotent — a second call returns the first rail rather than a
 * second one, which is what makes the bridge below safe once main.js adopts the call.
 */
export function installBlockCentreEntry(app, host = null) {
  if (installed?.isConnected && installedApp === app) return installed;
  // A rail left over from a disposed board is not the rail this app needs.
  if (installed && installedApp !== app) { installed.remove?.(); installed = null; }
  const doc = globalThis.document;
  if (!doc) return null;
  const rows = blockCentresOnCity(app?.city);
  if (!rows.length) return null;
  const root = host ?? doc.querySelector('main.game') ?? doc.body;
  if (!root) return null;
  ensureStyle(doc);

  const nav = doc.createElement('nav');
  nav.className = 'mge';
  nav.setAttribute('aria-label', 'Block centres');
  const title = doc.createElement('div');
  title.className = 'mge__title';
  title.textContent = 'Block centres';
  nav.append(title);

  for (const { game, cores } of rows) {
    const core = cores[0];
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'mge__btn';
    button.dataset.blockCentre = game.id;
    button.dataset.coreId = core.id;
    button.innerHTML = '';
    const name = doc.createElement('b');
    name.textContent = game.label;
    const note = doc.createElement('span');
    note.textContent = game.note;
    const where = doc.createElement('em');
    where.textContent = cores.length > 1 ? `${cores.length} on this board · ${core.id}` : core.id;
    button.append(name, note, where);
    button.addEventListener('click', () => {
      const open = liveApp(app)?.[game.open];
      if (typeof open === 'function') open(core.id);
    });
    nav.append(button);
  }

  root.append(nav);
  installed = nav;
  installedApp = app;
  return nav;
}

/**
 * The bridge. `main.js` publishes `window.__districtDeck` with the three openers on it once
 * the board is up; this waits for that and installs. It gives up quietly after the window
 * below, and it never throws into the boot path.
 *
 * This exists because reachability is a round-2 blocker and `main.js` is another seat's
 * file. It is a bridge, not a design — the explicit call in `installBlockCentreEntry` is the
 * shape this should end up in.
 */
export function autoInstallWhenReady({ tries = 60, every = 500, slow = 4000 } = {}) {
  if (typeof globalThis.window === 'undefined' || typeof globalThis.document === 'undefined') return;
  let left = tries;
  let warned = false;
  const tick = () => {
    // No window any more means no board to watch for. Returning without rescheduling is what
    // stops the heartbeat outliving the page it belongs to — a test that tears the global
    // down found this by throwing out of a timer after the test had ended.
    const win = globalThis.window;
    if (!win) return;
    const app = win.__districtDeck;
    const ready = app && typeof app.openVeggie === 'function' && app.city;
    if (ready && !(installed?.isConnected && installedApp === app)) {
      try { installBlockCentreEntry(app); } catch { /* a launcher must never break boot */ }
    }
    left -= 1;
    // r2 gave up SILENTLY after thirty seconds, and reachability is the major this rail
    // exists to close. Boots on a loaded box took longer than that more than once during the
    // r2 review, so the watcher no longer stops — it drops to a four-second heartbeat, which
    // costs nothing and also re-mounts the rail if a board is disposed and rebuilt. It says
    // so once, rather than leaving a player with three missing games and no explanation.
    if (left <= 0 && !installed?.isConnected && !warned) {
      warned = true;
      console.warn(
        'minigame-entry: the block-centre rail is not mounted after '
        + `${Math.round((tries * every) / 1000)}s. Still watching. `
        + 'main.js should call installBlockCentreEntry(app) directly — see V370 spec §5.1.',
      );
    }
    globalThis.setTimeout(tick, left > 0 ? every : slow);
  };
  globalThis.setTimeout(tick, every);
}

/** Test seam: forget the mounted rail so a probe can mount a second board. */
export function resetBlockCentreEntry() {
  installed?.remove?.();
  installed = null;
  installedApp = null;
}

/**
 * ONE capture-phase listener, installed at MODULE EVALUATION time.
 *
 * The ordering is the whole trick and it took a measurement to find. Within one node and one
 * phase, listeners run in registration order. `hud.js:534` binds `keydown` on `window` with
 * `capture: true` and consumes `v`, `b` and `w` with `stopImmediatePropagation()` of its own,
 * and it binds that during `new Hud()` — at runtime, inside the App constructor. A capture
 * listener registered when an overlay first mounts is therefore SECOND, and second is too
 * late: the r2 build measured the lens still cycling from OWNERSHIP to CORRIDOR with the
 * dialog open, exactly as r1 did.
 *
 * ES module evaluation runs before any of main.js's own statements, and main.js imports the
 * three overlays, which import this file. So the listener below is registered before the
 * HUD's, and `stopImmediatePropagation()` from it stops the HUD, the board's bubble handler
 * at `main.js:723`, and anything either of them adds later.
 *
 * Typing is preserved: when focus is in a text field only Escape reaches an overlay handler,
 * and nothing is `preventDefault`ed here, so the character still lands in the box.
 */
const OVERLAYS = [];

function onKeyCapture(event) {
  const live = OVERLAYS.filter((row) => {
    try { return row.isOpen(); } catch { return false; }
  });
  if (!live.length) return;
  // The board is behind this dialog. Nothing it binds should fire while it is covered.
  event.stopImmediatePropagation();
  const node = event.target;
  const typing = Boolean(node) && (
    node.tagName === 'INPUT'
    || node.tagName === 'TEXTAREA'
    || node.isContentEditable === true
  );
  if (typing && event.key !== 'Escape') return;
  for (const row of live) row.handler(event);
}

globalThis.window?.addEventListener('keydown', onKeyCapture, true);

/** Register an overlay with the trap. Returns a dispose function. */
export function trapOverlayKeys(isOpen, handler) {
  const row = { isOpen, handler };
  OVERLAYS.push(row);
  return () => {
    const index = OVERLAYS.indexOf(row);
    if (index >= 0) OVERLAYS.splice(index, 1);
  };
}

/** Test seam: how many overlays are currently registered with the trap. */
export function trappedOverlayCount() {
  return OVERLAYS.length;
}
