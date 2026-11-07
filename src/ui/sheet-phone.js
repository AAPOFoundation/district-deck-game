// Phone round P1, lane L2b: the card as a sheet, its footer, and the dialogs (contract sections 3 and 8; PHONE-PLAN section 4C and 4D).
//
// Loaded after main.js. While <html data-phone-hud="1"> it decorates every `aside.card` under the game root:
//
//   aside.card[data-phone="sheet"][data-sheet="peek" | "full" | "side"]
//     div.sheet-bar            the handle (data-phone="sheet-handle"), the snap button and the close button, 44 px hit areas
//     header.deed-binder       (legacy; shown on a full sheet only)
//     nav.deed-pages           (legacy tab row)
//     div.sheet-scroll         the legacy panels, wrapped; the one scrolling region
//     footer[data-phone="sheet-foot"]
//                              opaque and always in view: the card's own verb buttons (moved here, identity kept) and, on tall,
//                              two proxies for Bank and Settle (the real buttons stay in the bar; contract ruling 10)
//
// and mirrors the sheet's state on <html data-phone-sheet="none | peek | full | side"> (contract ruling 8). card.js changes in two
// lines only (it announces `districtdeck:card-render` after a render and `districtdeck:card-close` after a close, on its host, so the
// root attribute goes to "none" at once); its own innerHTML re-render is caught by a MutationObserver and decorated again, and its own
// click delegate keeps acting on the moved buttons. With the HUD layer off (data-phone-hud="0", ?phoneHud=0, or the window going wide) everything this
// module moved is put back and the attribute is removed, so the desktop card is the legacy card.
//
// State on tall is the legacy class `card--collapsed` (collapsed = peek), which card.js's own snap handler already toggles, so the
// snap button, the handle and a drag all write one variable and the observer derives data-sheet from it. Taps act on `click` (the
// iOS order is pointerdown, pointerup, then a late click, and a control that has moved by then swallows it); a drag follows the
// finger through --sheet-drag-h, snaps on pointerup, and swallows the click a mouse sends after it.

const doc = document;
const root = doc.documentElement;

const PEEK = 'peek';
const FULL = 'full';
const SIDE = 'side';
const TAP_SLOP = 8; // px a finger may move and still be a tap
const FLICK = 0.45; // px per ms: a drag this fast snaps in its own direction whatever the height

const hudOn = () => root.getAttribute('data-phone-hud') === '1';
const isShort = () => root.getAttribute('data-layout') === 'short';

/** Per card: what was moved (for the restore) and the last selection key (a new selection opens at the peek). */
const book = new WeakMap();
let host = null;
let probe = null;
let hostObserver = null;
let cardObserver = null;
let actionbarObserver = null;
let busy = false;

function make(tag, className, attrs = {}) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

/** The sheet heights in px, read through the same variables the CSS uses (the contract's values when L1's are not defined). */
function sheetPx() {
  if (!probe) {
    probe = make('div', 'sheet-probe', { 'aria-hidden': 'true' });
    probe.style.cssText = 'position:fixed;left:0;top:0;width:1px;visibility:hidden;pointer-events:none;';
  }
  if (!probe.isConnected) (doc.body ?? root).appendChild(probe);
  probe.style.height = 'var(--sheet-peek, calc(210px + env(safe-area-inset-bottom, 0px)))';
  const peek = probe.getBoundingClientRect().height;
  probe.style.height = 'var(--sheet-full, min(60dvh, 520px))';
  const full = probe.getBoundingClientRect().height;
  return { peek, full: Math.max(full, peek + 1) };
}

function selectionKey(card) {
  const d = card.dataset;
  return [d.parcelId, d.personId, d.fringeId, d.civicId, card.getAttribute('aria-label')].join('|');
}

function glyph(card, collapsed) {
  const snap = card.querySelector('[data-card-snap]');
  if (snap) {
    snap.textContent = collapsed ? '▴' : '▾';
    snap.setAttribute('aria-label', collapsed ? 'Expand card' : 'Collapse card');
  }
  const handle = card.querySelector('[data-phone="sheet-handle"]');
  if (handle) {
    handle.setAttribute('aria-label', collapsed ? 'Expand card' : 'Collapse card');
    handle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }
}

/** Write the one state variable (tall): the legacy collapsed class; data-sheet and the root follow in syncMode. */
function setTall(card, mode) {
  const collapsed = mode !== FULL;
  card.classList.toggle('card--collapsed', collapsed);
  glyph(card, collapsed);
  syncMode(card);
}

function currentMode(card) {
  if (isShort()) return SIDE;
  return card.classList.contains('card--collapsed') ? PEEK : FULL;
}

function syncMode(card) {
  const mode = currentMode(card);
  const changed = card.getAttribute('data-sheet') !== mode;
  if (changed) card.setAttribute('data-sheet', mode);
  if (mode !== SIDE) glyph(card, mode === PEEK);
  syncRoot();
  if (changed) fitZoneChip(card); // the binder shows on the full sheet only
}

/** <html data-phone-sheet>: the open card's mode, none when there is none (a card that is closing counts as closed). */
function syncRoot() {
  if (!hudOn()) {
    if (root.hasAttribute('data-phone-sheet')) root.removeAttribute('data-phone-sheet');
    return;
  }
  let mode = 'none';
  if (host) {
    const open = [...host.querySelectorAll(':scope > aside.card[data-phone="sheet"]')].find((c) => !c.classList.contains('is-closing'));
    if (open) mode = open.getAttribute('data-sheet') || currentMode(open);
  }
  if (root.getAttribute('data-phone-sheet') !== mode) root.setAttribute('data-phone-sheet', mode);
}

// ---------------------------------------------------------------------------------------------------------------- the handle

function makeHandle(card) {
  const handle = make('button', 'sheet-handle', {
    type: 'button',
    'data-phone': 'sheet-handle',
    'aria-label': 'Expand card',
    'aria-expanded': 'false',
  });
  handle.append(make('span', 'sheet-handle__grip', { 'aria-hidden': 'true' }));

  let drag = null;
  let swallow = 0; // time before which a click is the tail of a drag, not a tap

  handle.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (isShort()) return;
    const box = card.getBoundingClientRect();
    drag = { id: event.pointerId, y0: event.clientY, h0: box.height, h: box.height, moved: false, ly: event.clientY, lt: event.timeStamp, v: 0 };
    try { handle.setPointerCapture(event.pointerId); } catch (error) { /* a synthetic pointer has no capture */ }
  });

  handle.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = event.clientY - drag.y0;
    if (!drag.moved) {
      if (Math.abs(dy) < TAP_SLOP) return;
      drag.moved = true;
      card.setAttribute('data-sheet-drag', '');
    }
    const { peek, full } = sheetPx();
    drag.h = Math.min(full, Math.max(peek, drag.h0 - dy));
    card.style.setProperty('--sheet-drag-h', `${drag.h}px`);
    const dt = event.timeStamp - drag.lt;
    if (dt > 0) drag.v = (drag.ly - event.clientY) / dt;
    drag.ly = event.clientY;
    drag.lt = event.timeStamp;
  });

  const finish = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    try { handle.releasePointerCapture(event.pointerId); } catch (error) { /* none held */ }
    if (!d.moved) return; // a tap: the click that follows toggles
    swallow = event.timeStamp + 450;
    const { peek, full } = sheetPx();
    let to;
    if (event.type === 'pointercancel') to = d.h0 >= (peek + full) / 2 ? FULL : PEEK;
    else if (Math.abs(d.v) > FLICK) to = d.v > 0 ? FULL : PEEK;
    else to = d.h > (peek + full) / 2 ? FULL : PEEK;
    card.removeAttribute('data-sheet-drag');
    card.style.removeProperty('--sheet-drag-h');
    setTall(card, to);
  };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);

  handle.addEventListener('click', (event) => {
    if (event.timeStamp < swallow) { event.preventDefault(); return; }
    if (isShort()) return;
    setTall(card, currentMode(card) === FULL ? PEEK : FULL);
  });
  return handle;
}

// ---------------------------------------------------------------------------------------------------------- Bank and Settle (proxies)

const PROXIES = [
  { id: 'bank', fallback: 'footer.actionbar [data-verb="hold"]', label: 'Bank' },
  { id: 'settle', fallback: 'footer.actionbar [data-verb="settle"]', label: 'Settle' },
];

/** The real button a proxy presses: L2a's `data-phone-action`, else today's bar button (found at press time: the bar re-renders). */
function proxyTarget(id) {
  const spec = PROXIES.find((p) => p.id === id);
  return doc.querySelector(`[data-phone-action="${id}"]`) ?? doc.querySelector(spec.fallback);
}

function proxyHint(id, target) {
  if (!target) return '';
  if (id === 'bank') return (target.querySelector('.verb__hint')?.textContent ?? '').trim();
  // a Settle that forces a sale or ends the run says so here too (hud.js settleButtonState); the bar's count otherwise
  if (target.dataset?.settleHint) return target.dataset.settleHint.trim();
  const meta = doc.querySelector('.settle-fab__meta');
  const left = meta ? meta.querySelector('span:last-child')?.textContent ?? '' : '';
  return left.trim();
}

function syncProxies() {
  if (!host) return;
  for (const foot of host.querySelectorAll('[data-phone="sheet-foot"]')) {
    for (const spec of PROXIES) {
      const proxy = foot.querySelector(`[data-phone-proxy="${spec.id}"]`);
      if (!proxy) continue;
      const target = proxyTarget(spec.id);
      const disabled = !target || target.disabled || target.getAttribute('aria-disabled') === 'true';
      if (proxy.disabled !== disabled) proxy.disabled = disabled;
      const hint = proxy.querySelector('.sheet-proxy__hint');
      const text = proxyHint(spec.id, target);
      if (hint && hint.textContent !== text) hint.textContent = text;
      if (spec.id === 'settle') mirrorSettle(proxy, target);
    }
  }
}

/**
 * The card's Settle proxy reads as the real Settle does (hud.js _renderActions and markSettleArmed): steel while the quarter is
 * untouched (data-settle-quiet), brass and "Confirm" once the first press has armed it (data-settle-armed). Pressing it still
 * presses the real button, so the warning and the confirm stay the Game's.
 */
function mirrorSettle(proxy, target) {
  for (const key of ['settleQuiet', 'settleArmed']) {
    const value = target?.dataset?.[key];
    if (value === undefined) { if (proxy.dataset[key] !== undefined) delete proxy.dataset[key]; }
    else if (proxy.dataset[key] !== value) proxy.dataset[key] = value;
  }
  const label = proxy.querySelector('.sheet-proxy__label');
  const text = (target?.querySelector('.verb__label, .ph-btn__label')?.textContent ?? '').trim() || 'Settle';
  if (label && label.textContent !== text) label.textContent = text;
}

function makeFoot() {
  const foot = make('footer', 'sheet-foot', { 'data-phone': 'sheet-foot', 'aria-label': 'Card actions' });
  const verbs = make('div', 'sheet-foot__verbs');
  const bank = make('div', 'sheet-foot__bank');
  for (const spec of PROXIES) {
    const proxy = make('button', `sheet-proxy sheet-proxy--${spec.id}`, { type: 'button', 'data-phone-proxy': spec.id });
    proxy.append(make('span', 'sheet-proxy__label'), make('small', 'sheet-proxy__hint'));
    proxy.firstChild.textContent = spec.label;
    bank.append(proxy);
  }
  bank.addEventListener('click', (event) => {
    const proxy = event.target.closest('[data-phone-proxy]');
    if (!proxy) return;
    // The card's own click delegate must not see this press: the real button is pressed once, from here.
    event.stopPropagation();
    if (proxy.disabled) return;
    proxyTarget(proxy.dataset.phoneProxy)?.click();
  });
  foot.append(verbs, bank);
  return foot;
}

// ---------------------------------------------------------------------------------------------------------- decorate and restore

// The sheet's own children, in order. Anything else that is a direct child of the card is card.js's content, and belongs in the one
// scroll region: left outside it, it would sit under the foot (the foot is the last child) and be squeezed or clipped at the card's edge.
const OWN_CHILDREN = '.sheet-bar, .deed-binder, nav.deed-pages, .sheet-scroll, [data-phone="sheet-foot"]';

/** Move every direct child of the card that is not the sheet's own into `scroll`, appended in the card's order. Returns how many moved.
 *  build() uses it for the first dressing; decorate() uses it again on every scan, because card.js adds content to a rendered card
 *  (card.js:4095 appends the transport interchange's Hinterland gateway after _render) and the observer only sees a new child. */
function adoptStrays(card, scroll) {
  let moved = 0;
  for (const child of [...card.children]) {
    if (child.matches(OWN_CHILDREN)) continue;
    scroll.append(child);
    moved += 1;
  }
  return moved;
}

/** The civic card's eyebrow line reads "<raw id> · <district name>" (card.js:2007: "civic-transport-interchange-1 · Brunswick Rise"), legacy text
 *  for the desktop card. On the phone classes it shows the district alone. The raw text is kept on the element (data-phone-raw) so restore()
 *  can put it back; card.js's own re-render replaces the element, and the next scan tidies the new one. P2b (item 4): a line that then reads
 *  the card's own title ("Public reserve" over "Public reserve", a reserve with no district) is hidden on the phone classes (hidden and
 *  data-phone-hid; restore() shows it again). Returns true when it changed a line. */
function tidyEyebrow(card) {
  if (!card.classList.contains('card--civic')) return false;
  let changed = false;
  for (const addr of card.querySelectorAll('.card__identity-copy > .card__addr')) {
    if (addr.hasAttribute('data-phone-raw')) continue;
    const raw = addr.textContent;
    // a public reserve's line is its id alone ("reserve-2-1"); card.js hands the game's name for it on the element (P2a)
    const named = addr.getAttribute('data-phone-name');
    if (named) {
      // P2b: card.js cannot find the reserve's district for `district?.name` (it compares an id with the district object), so it hands the block's
      // district on its own attribute; the line is then "Public reserve · <district>"
      const block = (addr.getAttribute('data-phone-district') ?? '').trim();
      addr.setAttribute('data-phone-raw', raw);
      addr.textContent = block && !named.includes(block) ? `${named} · ${block}` : named;
      changed = true;
    } else {
      const at = raw.indexOf(' · ');
      const district = at < 0 ? '' : raw.slice(at + 3).trim();
      if (district) {
        addr.setAttribute('data-phone-raw', raw);
        addr.textContent = district;
        changed = true;
      }
    }
    // a line without a name on it and without " · " has nothing to cut it to, but it can still repeat the title
    if (repeatsTitle(card, addr)) {
      addr.setAttribute('hidden', '');
      addr.setAttribute('data-phone-hid', '1');
      changed = true;
    }
  }
  return changed;
}

/** True when the eyebrow `addr` reads the card's title (trimmed, case-insensitive). */
function repeatsTitle(card, addr) {
  const title = addr.parentElement?.querySelector?.(':scope > .card__title')
    ?? card.querySelector?.('.card__identity-copy > .card__title')
    ?? card.querySelector?.('.card__title');
  const own = (addr.textContent ?? '').trim().toLowerCase();
  return Boolean(title) && own !== '' && own === (title.textContent ?? '').trim().toLowerCase();
}

function build(card) {
  const bar = make('div', 'sheet-bar');
  bar.append(makeHandle(card));
  const snap = card.querySelector('[data-card-snap]');
  if (snap) bar.append(snap);
  const close = card.querySelector('.card__close');
  if (close) bar.append(close);
  card.prepend(bar);

  const scroll = make('div', 'sheet-scroll');
  card.append(scroll);
  adoptStrays(card, scroll);

  const foot = makeFoot();
  card.append(foot);
  const moved = [];
  // Only the parcel (deed) card keeps its verbs in the foot (it alone has .card__actions--fixed; card.js adds card--deed after this
  // runs, so the class cannot be asked); the other cards' verbs stay in their own panels.
  const actions = scroll.querySelector('.card__actions--fixed');
  if (actions) {
    for (const button of actions.querySelectorAll('button[data-verb]')) {
      moved.push({ node: button, parent: button.parentNode, next: button.nextSibling });
      foot.firstChild.append(button);
    }
  }
  const record = book.get(card) ?? {};
  record.moved = moved;
  record.snap = snap ? { parent: snap.parentNode } : null;
  book.set(card, record);
}

function decorate(card) {
  card.setAttribute('data-phone', 'sheet');
  const record = book.get(card) ?? {};
  book.set(card, record);

  if (!card.querySelector(':scope > .sheet-bar')) build(card);
  else {
    const scroll = card.querySelector(':scope > .sheet-scroll');
    if (scroll) adoptStrays(card, scroll);
  }

  // A card this module has not seen opens at the peek. A new selection in a card that is already up opens at the peek too, but the
  // selection is only known once card.js has finished (it sets the person and fringe ids after _render), so that check runs after it.
  tidyEyebrow(card);
  // On short the seat shows the whole card, so the class comes off; record.tallMode keeps the tall state (peek or full) for the return to tall.
  if (!record.seen) {
    record.seen = true;
    if (isShort()) record.tallMode = PEEK;
    else card.classList.add('card--collapsed');
  }
  if (isShort()) {
    if (record.tallMode == null) record.tallMode = card.classList.contains('card--collapsed') ? PEEK : FULL;
    card.classList.remove('card--collapsed');
  } else if (record.tallMode != null) {
    card.classList.toggle('card--collapsed', record.tallMode === PEEK);
    record.tallMode = null;
  }
  syncMode(card);
  watchZoneChip(card);
  fitZoneChip(card);
  syncProxies();
  revealSelectedTab(card);
  queueMicrotask(() => reselect(card, record));
}

const TAB_FADE_MAX = 16; // px: the widest a tab row's edge fade may be

/** P2d SHEET item 1. The fade at each edge of a scrolling tab row covers only the tab that edge cuts: clamp(min(overhang, visible part), 0, 16) px,
 *  and 0 when no tab straddles that edge (a tab wholly past it, or a gap at it, is not cut). So a fade never reaches past the cut tab's visible
 *  part, and no whole tab lies under one. `rowLeft` and `rowRight` are the row's visible client edges and `tabs` the tabs' boxes ({ left, right }),
 *  all in one coordinate space. Returns { left, right } in px. */
function tabFadeWidths(rowLeft, rowRight, tabs) {
  const fade = (overhang, visible) => Math.min(TAB_FADE_MAX, Math.max(0, Math.min(overhang, visible)));
  let left = 0;
  let right = 0;
  for (const t of tabs ?? []) {
    if (!t || !(t.right > t.left)) continue;
    if (t.left < rowLeft && t.right > rowLeft) left = Math.max(left, fade(rowLeft - t.left, t.right - rowLeft));
    if (t.right > rowRight && t.left < rowRight) right = Math.max(right, fade(t.right - rowRight, rowRight - t.left));
  }
  return { left, right };
}

/** Write the two fade widths on the row (--tab-fade-l, --tab-fade-r), read by sheet-phone.css's mask and the left wash. */
function syncTabFades(row, cut) {
  let widths = { left: 0, right: 0 };
  if (cut !== 'none') {
    const box = row.getBoundingClientRect();
    const rowLeft = box.left + (row.clientLeft || 0);
    const rowRight = rowLeft + row.clientWidth;
    const tabs = [...row.querySelectorAll(':scope > button')].map((tab) => tab.getBoundingClientRect());
    widths = tabFadeWidths(rowLeft, rowRight, tabs);
  }
  for (const [prop, value] of [['--tab-fade-l', widths.left], ['--tab-fade-r', widths.right]]) {
    const px = `${Math.round(value * 100) / 100}px`;
    if (row.style.getPropertyValue(prop) !== px) row.style.setProperty(prop, px);
  }
}

/** The side seat's tab row scrolls under a 720 px game. `cut` names the edge that still has labels past it; the fade at each edge is sized to
 *  the tab cut there (syncTabFades) and is gone at the scroll's end. Runs on scroll, scrollend and resize. */
function syncTabCut(row) {
  if (!row) return;
  const max = row.scrollWidth - row.clientWidth;
  let cut = 'none';
  if (max > 1) {
    const left = row.scrollLeft > 1;
    const right = max - row.scrollLeft > 1;
    cut = left && right ? 'both' : right ? 'right' : left ? 'left' : 'none';
  }
  if (row.getAttribute('data-tab-cut') !== cut) row.setAttribute('data-tab-cut', cut);
  syncTabFades(row, cut);
}

const tabRows = new WeakSet();
const revealedTab = new WeakMap();
const tabRowSizes = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
  if (!hudOn()) return;
  for (const entry of entries) syncTabCut(entry.target);
}) : { observe() {} };
function watchTabRow(card) {
  const row = card.querySelector(':scope > .deed-pages');
  if (!row || tabRows.has(row)) return;
  tabRows.add(row);
  const sync = () => { if (hudOn()) syncTabCut(row); };
  row.addEventListener('scroll', sync, { passive: true });
  row.addEventListener('scrollend', sync);
  tabRowSizes.observe(row);
}

// ---------------------------------------------------------------------------------------------------------------- the zone chip

/** P2D-SHEET zone fix. On the tall full sheet the parcel binder's zone chip reads "Zone " plus the label ("Zone NRZ · neighbourhood") wherever
 *  the chip and the ownership ribbon keep one row. (At 430 px a short bare label lets the band sit beside the binder's tab, a 30 px binder; the
 *  prefix takes it to the 48 px two-row binder every narrower tall window draws, as 8ac9c803 did, so the prefix reads alike on every parcel.) At
 *  320 px the NRZ label with the prefix is 214.6 px against the 296 px row's 204 left beside "FOR SALE", and the band wrapped the ribbon under
 *  the chip (band 18 -> 38 px, binder 48 -> 68 px). The chip carries data-phone-zone: "full" (the prefix), "bare" (the label as 523b2791
 *  draws it) or "code" (the band keeps one row and the label ends in an ellipsis after the code, which stays whole: its width is measured
 *  into --phone-zone-code-w and the chip's min-width holds it). `measure(state)` writes the state and returns { oneRow }. */
function zoneChipFit(measure) {
  const bare = measure('bare');
  if (!bare.oneRow) return 'code';
  const full = measure('full');
  return full.oneRow ? 'full' : 'bare';
}

/** The zone code at the head of a chip label ("NRZ" of "NRZ · neighbourhood", "AG" of "AG"). */
function zoneCode(label) {
  return String(label ?? '').split('·')[0].trim();
}

/** The parcel binder's chip, band, ribbon and binder, or null for a civic, city asset or person binder or a card without one. */
function zoneParts(card) {
  const binder = card.querySelector?.(':scope > .deed-binder');
  if (!binder || binder.matches('.deed-binder--civic, .deed-binder--fringe, .deed-binder--person')) return null;
  const chip = binder.querySelector('.card__band-district');
  if (!chip) return null;
  return { binder, chip, band: chip.parentElement, ribbon: binder.querySelector('.card__band-ribbon') };
}

/** Drop what fitZoneChip wrote, so the chip's markup is card.js's again. */
function clearZoneChip(chip) {
  if (!chip) return;
  chip.removeAttribute('data-phone-zone');
  chip.style?.removeProperty('--phone-zone-code-w');
  if (chip.getAttribute('style') === '') chip.removeAttribute('style');
}

/** Choose the chip's state from its own boxes. A binder that is not drawn (the peek, the side seat) is left as it is: its first full sheet
 *  fits it (syncMode, and the binder's ResizeObserver). Returns the state, or null when there is no parcel chip or the layer is off. */
function fitZoneChip(card) {
  const parts = zoneParts(card);
  if (!parts) return null;
  const { binder, chip, band, ribbon } = parts;
  if (!hudOn()) { clearZoneChip(chip); return null; }
  if (!binder.getClientRects().length) return chip.getAttribute('data-phone-zone');
  const measure = (state) => {
    chip.setAttribute('data-phone-zone', state);
    const c = chip.getBoundingClientRect();
    const r = ribbon?.getClientRects().length ? ribbon.getBoundingClientRect() : null;
    const oneRow = (!r || Math.abs(r.top - c.top) < 1) && band.scrollWidth <= band.clientWidth + 0.5 && chip.scrollWidth <= chip.clientWidth + 0.5;
    return { oneRow };
  };
  const fit = zoneChipFit(measure);
  if (fit === 'code') {
    const text = chip.firstChild;
    const code = zoneCode(chip.textContent);
    let width = 0;
    if (text?.nodeType === 3 && code) {
      const range = doc.createRange();
      range.setStart(text, Math.max(0, text.data.indexOf(code)));
      range.setEnd(text, Math.min(text.data.length, text.data.indexOf(code) + code.length));
      width = range.getBoundingClientRect().width;
    }
    chip.style.setProperty('--phone-zone-code-w', `${Math.ceil(width)}px`);
  } else clearZoneChip(chip);
  if (chip.getAttribute('data-phone-zone') !== fit) chip.setAttribute('data-phone-zone', fit);
  return fit;
}

// A rotation or a window that changes width refits the open card's chip. The fit runs in the next frame, not in the observer's callback: it
// can change the binder's own height, which inside the callback is a ResizeObserver loop error.
const zoneBinders = new WeakMap();
const zonePending = new Set();
let zoneFrame = 0;
const zoneSizes = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
  if (!hudOn()) return;
  for (const entry of entries) {
    const card = entry.target.closest?.('aside.card');
    if (card) zonePending.add(card);
  }
  if (zoneFrame || !zonePending.size) return;
  zoneFrame = requestAnimationFrame(() => {
    zoneFrame = 0;
    const cards = [...zonePending];
    zonePending.clear();
    for (const card of cards) if (card.isConnected && hudOn()) fitZoneChip(card);
  });
}) : { observe() {}, unobserve() {} };
function watchZoneChip(card) {
  const binder = zoneParts(card)?.binder ?? null;
  const was = zoneBinders.get(card) ?? null;
  if (was === binder) return;
  if (was) zoneSizes.unobserve(was);
  if (binder) { zoneSizes.observe(binder); zoneBinders.set(card, binder); } else zoneBinders.delete(card);
}

/** Phone layer only. Moves the row sideways, and only when it overflows sideways. On tall the tab is taller than the row, so a vertical scroll would clip its top rule. The 16 px is the end fade; the start edge stops at 0. */
function revealTab(tab) {
  if (!hudOn() || !(tab instanceof Element)) return;
  const row = tab.closest('.deed-pages');
  if (!(row instanceof Element)) return;
  revealedTab.set(row, tab);
  const max = row.scrollWidth - row.clientWidth;
  if (max > 1) {
    const rowBox = row.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    const start = rowBox.left;
    const end = rowBox.right - 16;
    let next = row.scrollLeft;
    if (tabBox.left < start) next -= start - tabBox.left;
    else if (tabBox.right > end) next += tabBox.right - end;
    if (next < 0) next = 0;
    if (next > max) next = max;
    if (Math.abs(next - row.scrollLeft) > 0.5) row.scrollLeft = next;
  }
  syncTabCut(row);
}

function revealSelectedTab(card) {
  if (!hudOn()) return;
  const row = card.querySelector(':scope > .deed-pages');
  if (!row) return;
  const fresh = !tabRows.has(row);
  watchTabRow(card);
  const tab = row.querySelector(':scope > [data-card-tab][aria-selected="true"]')
    ?? row.querySelector(':scope > [data-card-tab].is-active');
  // A rescan decorates again. Reveal only a row we have not seen, or a tab that changed. A player's own scroll stays.
  if (tab && (fresh || revealedTab.get(row) !== tab)) revealTab(tab);
  else syncTabCut(row);
}

function reselect(card, record) {
  if (!card.isConnected || !hudOn() || book.get(card) !== record) return;
  const key = selectionKey(card);
  const changed = record.key !== undefined && record.key !== key;
  record.key = key;
  if (changed && !isShort() && !card.classList.contains('card--collapsed')) setTall(card, PEEK);
}

/** Put everything this module moved back where card.js made it, and drop what it added. */
function restore(card) {
  const record = book.get(card);
  const bar = card.querySelector(':scope > .sheet-bar');
  const scroll = card.querySelector(':scope > .sheet-scroll');
  if (record?.moved) {
    for (const { node, parent, next } of [...record.moved].reverse()) {
      if (!parent?.isConnected) continue;
      if (next && next.parentNode === parent) parent.insertBefore(node, next);
      else parent.appendChild(node);
    }
  }
  if (scroll) {
    // the close and snap go back: close into the binder when there is one, snap into the identity block
    const close = card.querySelector('.card__close');
    const binder = card.querySelector(':scope > .deed-binder');
    if (close && binder) binder.append(close);
    else if (close) card.prepend(close);
    const snap = card.querySelector('[data-card-snap]');
    const identity = scroll.querySelector('.card__identity, .card__head, .card__landuse-head');
    if (snap && identity) identity.append(snap);
    while (scroll.firstChild) card.insertBefore(scroll.firstChild, scroll);
    scroll.remove();
  }
  for (const addr of card.querySelectorAll('[data-phone-raw]')) {
    addr.textContent = addr.getAttribute('data-phone-raw');
    addr.removeAttribute('data-phone-raw');
  }
  for (const addr of card.querySelectorAll('[data-phone-hid]')) {
    addr.removeAttribute('hidden');
    addr.removeAttribute('data-phone-hid');
  }
  bar?.remove();
  card.querySelector(':scope > [data-phone="sheet-foot"]')?.remove();
  const tabRow = card.querySelector(':scope > .deed-pages');
  for (const prop of ['--tab-fade-l', '--tab-fade-r']) tabRow?.style?.removeProperty(prop);
  clearZoneChip(zoneParts(card)?.chip);
  const zoneBinder = zoneBinders.get(card);
  if (zoneBinder) { zoneSizes.unobserve(zoneBinder); zoneBinders.delete(card); }
  for (const attr of ['data-phone', 'data-sheet', 'data-sheet-drag']) card.removeAttribute(attr);
  card.style.removeProperty('--sheet-drag-h');
  card.classList.remove('card--collapsed');
  glyphLegacy(card);
  book.delete(card);
}

function glyphLegacy(card) {
  const snap = card.querySelector('[data-card-snap]');
  if (snap) {
    snap.textContent = '▾';
    snap.setAttribute('aria-label', 'Collapse card');
  }
}

function dialogs() {
  if (!host) return;
  for (const sheet of host.querySelectorAll(':scope > .overlay > .sheet')) {
    // modal.js writes data-phone="dialog" itself; this covers any overlay sheet made another way
    if (hudOn() && sheet.getAttribute('data-phone') !== 'dialog') sheet.setAttribute('data-phone', 'dialog');
  }
}

function scan() {
  if (!host) return;
  busy = true;
  try {
    const cards = [...host.querySelectorAll(':scope > aside.card')];
    if (hudOn()) {
      for (const card of cards) {
        if (card.classList.contains('is-closing')) continue;
        decorate(card);
        cardObserver.observe(card, { childList: true, attributes: true, attributeFilter: ['class', 'data-parcel-id', 'data-person-id', 'data-fringe-id', 'data-civic-id'] });
      }
    } else {
      for (const card of cards) if (card.hasAttribute('data-phone')) restore(card);
    }
    dialogs();
    syncRoot();
  } finally {
    busy = false;
    hostObserver?.takeRecords();
    cardObserver?.takeRecords();
  }
}

function watchActionbar() {
  const bar = doc.querySelector('footer.actionbar');
  if (!bar || actionbarObserver) return;
  actionbarObserver = new MutationObserver(() => { if (hudOn()) syncProxies(); });
  actionbarObserver.observe(bar, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'data-settle-quiet', 'data-settle-armed'], characterData: true });
}

function start() {
  host = doc.querySelector('main.game') ?? doc.querySelector('.game');
  if (!host) return;
  hostObserver = new MutationObserver(() => { if (!busy) scan(); });
  hostObserver.observe(host, { childList: true });
  cardObserver = new MutationObserver((records) => {
    if (busy) return;
    // an attribute change that is only our own data-sheet / data-phone writes never gets here (they are not in the filter)
    if (records.length) scan();
  });
  watchActionbar();
  // card.js tells the host when it has rendered or closed a card, so the sheet and <html data-phone-sheet> are right in the same task
  // (the camera reads the root attribute straight after show()); the observers above are the fallback for every other change.
  host.addEventListener('districtdeck:card-render', () => { if (hudOn()) scan(); });
  host.addEventListener('districtdeck:card-close', () => { syncRoot(); });
  host.addEventListener('click', (event) => {
    if (!hudOn()) return;
    const tab = event.target.closest?.('[data-card-tab]');
    if (!tab || !host.contains(tab) || !tab.closest('aside.card[data-phone="sheet"]')) return;
    revealTab(tab);
  });
  window.addEventListener('layoutchange', () => { watchActionbar(); scan(); });
  scan();
}

if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
else start();

export { adoptStrays, clearZoneChip, fitZoneChip, mirrorSettle, OWN_CHILDREN, proxyHint, restore, syncTabCut, tabFadeWidths, TAB_FADE_MAX, tidyEyebrow, zoneChipFit, zoneCode };
