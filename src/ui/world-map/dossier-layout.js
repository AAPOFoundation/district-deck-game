import { makeDossierClose } from './phone-globe.js';

const ACTION_CLASSES = new Set([
  'province-resource-zone-actions', 'province-ambition-rail-actions',
  'province-working-band', 'province-shut-band', 'province-book-actions',
  'province-force-orders', 'province-book-working', 'province-book-reason',
  'province-make',
]);

export function dossierSection(tagName, classes = []) {
  if (tagName === 'STYLE' || classes.includes('chrome-rivets')) return 'style';
  if (tagName === 'H2' || classes.includes('province-status')
    || classes.includes('province-resource-zone-identity')) return 'heading';
  if (tagName === 'BUTTON' || classes.some((name) => ACTION_CLASSES.has(name))) return 'actions';
  return 'description';
}

// Keep the height-specific mode and the measured mast in step with viewport changes.
// One binding per live dossier; rebuilding its content does not add listeners.
const phonePanelBindings = new WeakMap();
function measurePhonePanels(dossier) {
  let measure = phonePanelBindings.get(dossier);
  if (!measure) {
    const doc = dossier.ownerDocument;
    const shortPortrait = doc.defaultView?.matchMedia('(max-height: 600px) and (orientation: portrait)');
    measure = () => {
      const root = doc.documentElement;
      const tall = root?.dataset.phoneHud === '1' && root.dataset.layout === 'tall';
      const compact = tall && shortPortrait?.matches;
      const mast = doc.querySelector('.province-mast');
      for (const panel of [mast, dossier]) {
        if (compact && panel) panel.dataset.compactGlobe = '1';
        else if (panel?.dataset) delete panel.dataset.compactGlobe;
      }
      // Measure after applying the compact layout, including the port picker and key.
      if (tall) dossier.style.setProperty('--phone-mast-bottom', `${mast ? mast.offsetTop + mast.offsetHeight : 0}px`);
    };
    shortPortrait?.addEventListener('change', measure);
    doc.defaultView?.addEventListener('layoutchange', measure);
    phonePanelBindings.set(dossier, measure);
  }
  measure();
}

/** Move the existing nodes, preserving delegated actions, attributes and descriptions. */
export function bookSelectionIndex(keys, previous, fallback = 0, preferred = null) {
  const previousIndex = keys.indexOf(previous);
  const preferredIndex = keys.indexOf(preferred);
  return previousIndex >= 0 ? previousIndex : preferredIndex >= 0 ? preferredIndex
    : Math.max(0, Math.min(keys.length - 1, fallback));
}

export function arrangeDossier(dossier, { bookChoice = null, preferredBook = null, onBookChoice = null, onRecenter = null, onClose = null } = {}) {
  const card = dossier.querySelector(':scope > .province-resource-card, :scope > .province-ambition-rail, :scope > [data-cybercab-book]') ?? dossier;
  card.classList.add('v4-dossier-layout');
  const sections = Object.fromEntries(['heading', 'description', 'actions'].map((name) => {
    const element = dossier.ownerDocument.createElement(name === 'heading' ? 'header' : name === 'actions' ? 'footer' : 'div');
    element.className = `v4-dossier-${name}`;
    return [name, element];
  }));
  sections.description.tabIndex = 0;
  sections.description.setAttribute('aria-label', 'Port details. Scroll for more information.');
  for (const child of [...card.children]) {
    const section = dossierSection(child.tagName, [...child.classList]);
    if (section !== 'style') sections[section].append(child);
  }
  // The selected port is the heading. Its longer introduction belongs with
  // the other scrollable detail, so it cannot push the transaction off-screen.
  const identity = sections.heading.querySelector('.province-resource-zone-identity');
  const desk = identity?.querySelector('.province-resource-desk');
  if (desk) {
    const blurb = desk.querySelector('.province-resource-desk-blurb');
    if (blurb) {
      blurb.classList.add('v4-port-introduction');
      blurb.textContent = blurb.textContent.replace(/^\s*—\s*/, '');
      sections.description.prepend(blurb);
    }
    identity.prepend(desk);
    if (onRecenter) {
      const recenter = dossier.ownerDocument.createElement('button');
      recenter.type = 'button';
      recenter.className = 'v4-recenter-port';
      recenter.textContent = 'Locate';
      recenter.setAttribute('aria-label', `Locate ${desk.querySelector('strong')?.textContent ?? 'port'} on the globe`);
      recenter.addEventListener('click', onRecenter);
      desk.append(recenter);
    }
  }
  const books = sections.description.querySelector('.province-books');
  if (books?.querySelector('.province-book') && !books.querySelector('[data-cybercab-order]')) sections.actions.prepend(books);
  // Several trade routes use a compact choice control, so the current route's
  // status and button stay visible without making the footer another scroll pane.
  for (const bookList of sections.actions.querySelectorAll('.province-books, .province-resource-books')) {
    const rows = [...bookList.children].filter((child) => child.classList.contains('province-book'));
    if (rows.length < 2) continue;
    const label = dossier.ownerDocument.createElement('label');
    label.className = 'v4-book-picker';
    label.textContent = 'Trade route';
    const choice = dossier.ownerDocument.createElement('select');
    choice.dataset.v4BookChoice = '1';
    const keys = rows.map((row, index) => row.dataset.route ?? row.querySelector('[data-route]')?.dataset.route ?? `book-${index}`);
    rows.forEach((row, index) => {
      const option = dossier.ownerDocument.createElement('option');
      option.value = keys[index];
      option.textContent = row.querySelector('.province-book-title')?.textContent ?? row.dataset.bookTitle ?? `Route ${index + 1}`;
      choice.append(option);
    });
    const dominant = rows.findIndex((row) => row.querySelector('.is-dominant-action'));
    choice.selectedIndex = bookSelectionIndex(keys, bookChoice, dominant, preferredBook);
    const showChoice = () => rows.forEach((row, index) => { row.hidden = index !== choice.selectedIndex; });
    choice.addEventListener('change', () => {
      showChoice();
      onBookChoice?.(choice.value);
    });
    showChoice();
    label.append(choice);
    bookList.before(label);
  }
  sections.actions.hidden = !sections.actions.children.length;
  if (onClose) sections.heading.prepend(makeDossierClose(dossier.ownerDocument, onClose));
  card.append(sections.heading, sections.description, sections.actions);
  const root = dossier.ownerDocument.documentElement;
  if (root?.dataset.phoneHud === '1') {
    // Put the decision before the longer detail in both reading and focus order.
    card.append(sections.description);
    const trade = [...sections.actions.children].find((child) => child.classList.contains('province-shut-band'));
    if (trade) sections.actions.prepend(trade);
  }
  measurePhonePanels(dossier);
}
