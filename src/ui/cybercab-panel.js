import { escapeHtml as esc } from '../core/format.js';
import { CYBERCAB_RULES as rules, CYBERCAB_DISPATCH, CYBERCAB_STANDING_COST,
  createCybercabState, reduceCybercab, settleCybercab, cybercabDemand } from '../core/cybercab.js';
import { previewCybercabSeat, canApplyAction } from '../core/state.js';
import { admitCybercabPayment, isCybercabReserveReason } from '../core/cybercab-funding.js';
import { CYBERCAB_SUPPLIER as supplier } from '../core/world/cybercab-supplier.js';

export const CYBERCAB_OPEN_EVENT = 'district-deck:card-open';
const money = n => `${n < 0 ? '−' : ''}$${Math.abs(n ?? 0).toLocaleString('en-AU')}`;
const labels = { virus: 'Virus attack', accident: 'Car accident', puncture: 'Tyre puncture', clientele: 'Bad clientele' };
const components = ['tyres', 'battery', 'software'];
const thumbnail = '<svg class="cybercab__thumb" viewBox="0 0 120 56" role="img" aria-label="Cybercab"><path d="M9 36 27 29 47 12 78 12 105 29 112 35 110 45H9Z" fill="currentColor"/><path d="m34 29 17-13h24l19 13Z" fill="var(--chrome-steel)"/><path d="M60 16v13" stroke="currentColor" stroke-width="3"/><circle cx="29" cy="44" r="9" fill="var(--chrome-steel)" stroke="currentColor" stroke-width="3"/><circle cx="91" cy="44" r="9" fill="var(--chrome-steel)" stroke="currentColor" stroke-width="3"/></svg>';

export function cybercabActionCheck(state, action) {
  if (state.phase !== 'play') return 'The run is over.';
  const seat = state.activeSeatId ?? 'P1';
  if (state.quarterCommit?.committedPackets?.[seat]
    || state.quarterCommit?.committedSeatIds?.includes(seat)) return 'Your quarter plan is already committed.';
  if (state.onlineView) {
    const admission = canApplyAction(null, state, action);
    if (!admission.ok) return admission.reason;
  }
  if ((state.cybercab?.economyVersion === 2 || action.type === 'UPGRADE_CAB_BOOK')
    && state.activeSeatId && state.activeSeatId !== (state.cybercab?.ownerSeatId ?? 'P1'))
    return `This Cybercab business belongs to ${state.cybercab?.ownerSeatId ?? 'P1'}.`;
  const business = reduceCybercab(state.cybercab, action, { seed: state.seed, quarter: state.quarter, cash: state.cash });
  if (business.rejected) return business.reason;
  if (!(business.cashDelta < 0)) return '';
  return admitCybercabPayment(null, state, -business.cashDelta).reason;
}

function button(state, action, label) {
  const reason = cybercabActionCheck(state, action);
  const note = isCybercabReserveReason(reason)
    ? `<p class="cybercab-funding" tabindex="0">${esc(reason)}</p>` : '';
  return `<button type="button" data-cab-action="${esc(JSON.stringify(action))}"${reason ? ` disabled title="${esc(reason)}"` : ''}>${esc(label)}</button>${note}`;
}

function ordinarySelectedHold(state, cab, dispatch) {
  if (cab?.dispatch !== dispatch || state.phase !== 'play') return false;
  const seat = state.activeSeatId ?? 'P1';
  if (state.quarterCommit?.committedPackets?.[seat]
    || state.quarterCommit?.committedSeatIds?.includes(seat)) return false;
  const action = { type: 'SET_CAB_DISPATCH', cabId: cab.id, dispatch };
  if (state.onlineView && !canApplyAction(null, state, action).ok) return false;
  const book = state.cybercab;
  const owner = book?.ownerSeatId ?? 'P1';
  if (book?.economyVersion === 2 && state.activeSeatId && state.activeSeatId !== owner) return false;
  if (book?.economyVersion !== 2 || book.round === 4 || state.quarter !== book.quarter) return false;
  if (!Number.isFinite(state.cash)) return false;
  return true;
}

function routeButton(state, cab, dispatch, route) {
  const action = { type: 'SET_CAB_DISPATCH', cabId: cab.id, dispatch };
  const reason = cybercabActionCheck(state, action);
  const selected = cab.dispatch === dispatch;
  const soft = ordinarySelectedHold(state, cab, dispatch);
  const hardStop = Boolean(reason) && !soft;
  const pressed = selected ? 'true' : 'false';
  const stateAttrs = hardStop
    ? ` disabled aria-pressed="${pressed}" title="${esc(reason)}"`
    : soft
      ? ` aria-pressed="true" aria-disabled="true" title="${esc(reason)}"`
      : ` aria-pressed="false"`;
  return `<button type="button" class="cybercab__route${selected ? ' is-selected' : ''}" data-cab-route="${esc(cab.id)}" data-cab-action="${esc(JSON.stringify(action))}"${stateAttrs}>${esc(route.label)}${selected ? ' · selected' : ''}</button>`;
}

function bars(cab) {
  return components.map(key => {
    const value = Math.max(0, Math.min(100, Math.round(cab[key])));
    return `<div class="cybercab__bar"><span>${key}</span><meter min="0" max="100" low="30" value="${value}" aria-label="${esc(cab.id)} ${key}">${value}%</meter><span>${value}%</span></div>`;
  }).join('');
}

export function cybercabQuarterModel(state) {
  const business = state.cybercab;
  if (business?.economyVersion !== 2) return null;
  const finished = state.phase === 'result';
  const quarter = finished ? business.lastSettledQuarter : state.quarter;
  const projection = finished ? {state:business,fares:0,costs:0,servicePaid:0,capitalPaid:0,net:0,cashDelta:0,...business.weeklyChart.at(-1)}
    : settleCybercab(business, { seed: state.seed, quarter });
  const entries = projection.state.ledger.filter(row => row.quarter === quarter);
  const cost = kind => -entries.filter(row => row.kind === kind).reduce((n, row) => n + row.amount, 0);
  const energy = cost('cybercab-energy'), standing = cost('cybercab-overhead');
  return { quarter, round: finished ? 4 : business.round, fares: projection.fares,
    energy, standing, incidents: projection.costs - energy - standing,
    servicePaid: projection.servicePaid, capitalPaid: projection.capitalPaid,
    profit: projection.net, cashAtSettlement: projection.cashDelta,
    trips: entries.filter(row => row.kind === 'cybercab-contract').reduce((n, row) => n + row.trips, 0),
    nextDemand: !finished && business.round < 4 ? cybercabDemand(state.seed, state.quarter, business.round + 1) : null };
}

function quarterPlanHtml(state, book) {
  if (!book) return `<p>Your saved trip book is unchanged.</p>${button(state, { type: 'UPGRADE_CAB_BOOK' }, 'START QUARTERLY DISPATCH')}<p>Keep posted fares, costs, orders and completed beats. The remaining blocks and future quarters use the dispatch model.</p>`;
  const market = book.nextDemand ? ['local', 'airport'].map(key => {
    const route = CYBERCAB_DISPATCH[key];
    return `<p><strong>${route.label}</strong> · ${book.nextDemand[key]} trips available next block · up to ${route.trips} per ready cab<br>${money(route.fare)} average fare − ${money(route.energy)} energy per trip</p>`;
  }).join('') : '<p>Four blocks complete. Settle to collect this quarter and plan the next.</p>';
  return `<h4>DISPATCH · ${book.round} / 4 BLOCKS</h4>${market}
    <p>${money(CYBERCAB_STANDING_COST)} standing costs per arrived cab per block, including service and reserve.</p>
    ${button(state, { type: 'RUN_CAB_SHIFT', round: book.round + 1 }, `DISPATCH BLOCK ${Math.min(4, book.round + 1)} / 4`)}
    <p>Run a block, review the result, then adjust routes or service. Settle completes any remaining blocks.</p>`;
}

function projectionHtml(book) {
  if (!book) return '';
  return `<h4>Q${book.quarter} PROJECTION</h4><p>${book.trips} contract trips · current dispatch and condition</p>
    <p>Fares ${money(book.fares)}<br>Energy −${money(book.energy)}<br>Standing costs −${money(book.standing)}<br>Incidents / carried costs −${money(book.incidents)}<br>Service paid −${money(book.servicePaid)}</p>
    <p class="cybercab__fare">Operating profit <strong>${money(book.profit)}</strong></p>
    <p>Fleet / depot investment paid ${money(book.capitalPaid)} · remains an asset<br>Cash on settlement ${money(book.cashAtSettlement)}; paid items are not charged twice.</p>`;
}

export function cybercabPanelHtml(state, { firstOpen = true, importOpen = false } = {}) {
  const b = state.cybercab ?? createCybercabState();
  const book = cybercabQuarterModel(state);
  if (book) return quarterlyPanelHtml(state, book, { firstOpen, importOpen });
  const chart = b.weeklyChart.slice(-7);
  const chartCost = row => row.costs + (row.servicePaid ?? row.paidCosts);
  const ceiling = Math.max(1, ...chart.flatMap(r => [r.fares, chartCost(r)]));
  const fleet = b.fleet.map(cab => `<article class="cybercab__cab"><div class="cybercab__cab-head">${thumbnail}<strong>${esc(cab.id.toUpperCase())}</strong><span class="cybercab__chip">${esc(cab.haltUntil > (book ? (b.quarter - 1) * 4 + b.round : b.beat) ? 'Halted' : cab.status)}</span></div>${bars(cab)}
    ${book ? `<p>Dispatch: <strong>${esc(CYBERCAB_DISPATCH[cab.dispatch].label)}</strong></p><div class="cybercab__services">${Object.entries(CYBERCAB_DISPATCH).map(([dispatch, route]) => button(state, { type: 'SET_CAB_DISPATCH', cabId: cab.id, dispatch }, route.label)).join('')}</div>` : ''}
    <div class="cybercab__services">${components.map(component => button(state, { type: component === 'software' ? 'PATCH_SOFTWARE' : 'SERVICE_CAB', cabId: cab.id, ...(component === 'software' ? {} : { component }) }, `${component === 'software' ? 'Patch' : `Service ${component}`} · ${money(rules[component])}`)).join('')}</div></article>`).join('');
  const incidents = b.incidents.slice(-8).reverse().map(row => `<li><span>${esc(labels[row.kind] ?? row.kind)} · ${esc(row.cabId)}<br>Q${row.quarter}${row.refund ? ` · refund ${money(row.refund)}` : ''}</span><strong>−${money(row.cost)}</strong>${row.dismissed ? '<span>Dismissed</span>' : button(state, { type: 'DISMISS_INCIDENT', incidentId: row.id }, 'Dismiss')}</li>`).join('');
  return `<header class="cybercab__header"><h2 id="cybercab-title">CYBERCAB BUSINESS</h2><button type="button" data-cab-close aria-label="Close cybercab business">Close ×</button></header>
    ${firstOpen ? `<p class="cybercab__how">${book ? 'Choose dispatch → run four work blocks → settle once. Maintain above 30% to protect trip capacity. These are game-balanced quarterly contracts; city journeys are illustrative and waiting earns no extra money.' : 'Buy → carry passengers → earn fares; maintain above 30% to protect earnings.'}</p>` : ''}
    <div class="cybercab__grid"><section><h3>FLEET <span>${b.fleet.length} / ${b.depot.capacity}</span></h3><div class="cybercab__scroll">${fleet || '<p>No cabs yet. Buy at the depot or import from Shanghai.</p>'}</div></section>
    <section><h3>EARNINGS <span>RATING ${esc(b.rating)} / A–E</span></h3>${quarterPlanHtml(state, book)}${projectionHtml(book)}<p class="cybercab__fare">${book ? 'Booked fares' : 'Fares today'} <strong>${money(b.fares)}</strong></p><p>Q${b.quarter} · ${book ? `Work blocks ${b.round} / 4` : `Beat ${b.beat}`} · Cash ${money(state.cash)}</p>
    ${book && b.blocks.length ? `<p>Last block: Q${b.blocks.at(-1).quarter} / ${b.blocks.at(-1).round} · ${b.blocks.at(-1).trips} trips · fares ${money(b.blocks.at(-1).fares)} · costs ${money(b.blocks.at(-1).costs)}</p>` : ''}
    <h4>QUARTER BOOK</h4><p>Quarter totals · fares / ${book ? 'operating costs and service' : 'all costs'}</p><div class="cybercab__chart" role="img" aria-label="${esc(chart.map(r => `Q${r.quarter}: fares ${money(r.fares)}, costs ${money(chartCost(r))}`).join('; ') || 'No settled quarters yet')}">${chart.map(r => `<div class="cybercab__week"><div class="cybercab__columns"><i style="height:${r.fares / ceiling * 100}%"></i><i style="height:${chartCost(r) / ceiling * 100}%"></i></div><span>Q${r.quarter}</span></div>`).join('') || '<p>First chart posts at settlement.</p>'}</div><p>Fares enter cash at settlement.</p><p>Paid ${money(b.paidCosts)} · Due ${money(b.costs)}</p></section>
    <section><h3>MAINTENANCE</h3><p>Repair shop · ${b.queue.filter(j => j.startedBeat == null).length} waiting · ${b.queue.filter(j => j.startedBeat != null).length} working</p>${book ? '<p>Service costs cash now and misses two work blocks once a lift is free. Airport contracts wear tyres and batteries twice as fast; reserve avoids wear but still pays standing costs.</p>' : ''}<div class="cybercab__scroll">${b.queue.map(j => `<p>${esc(j.cabId)} · ${esc(j.component)}<br>${j.startedBeat == null ? 'Waiting for lift' : book ? `Ready after Q${Math.ceil(j.finishBeat / 4)} block ${(j.finishBeat - 1) % 4 + 1}` : `Ready at beat ${j.finishBeat}`}</p>`).join('')}${b.fleet.map(c => `<div class="cybercab__condition"><strong>${esc(c.id.toUpperCase())}</strong>${bars(c)}</div>`).join('') || '<p>Two beats per service. One working lift per two arrived cabs.</p>'}</div></section></div>
    <div class="cybercab__bottom"><section><h3>INCIDENTS <span>LAST EIGHT</span></h3><ul class="cybercab__incidents">${incidents || '<li>No incidents reported.</li>'}</ul><p>Dismiss acknowledges; charges and downtime remain.</p></section><section class="cybercab__purchase">${button(state, { type: 'BUY_CAB' }, `BUY CAB · ${money(rules.price)}`)}<p>${b.depot.capacity - b.fleet.length} spaces available · ${b.depot.lifts} lifts</p><button type="button" data-cab-import>IMPORT${b.supplier.opened ? ' · SUPPLIER BOOK' : ''}</button>${importOpen ? `<p>Shanghai · ${money(supplier.unitPrice)} per cab · one shipping quarter. Arrives Q${state.quarter + 1} at the port yard, then depot.</p>${button(state, { type: 'IMPORT_CAB' }, `ORDER IMPORT · ${money(supplier.unitPrice)}`)}${b.supplier.opened && !state.onlineView && (!state.activeSeatId || state.activeSeatId === 'P1') ? '<button type="button" data-cab-globe>OPEN GLOBE · SHANGHAI</button>' : ''}` : ''}${b.supplier.orders.filter(o => o.status === 'shipping').map(o => `<p>${esc(o.cabId)} · arriving Q${o.arrivalQuarter}</p>`).join('')}</section></div>
    ${book ? `<section class="cybercab__purchase">${button(state, { type: 'UPGRADE_DEPOT' }, `ADD LIFT / CAB SPACE · ${money(rules.liftPrice)}`)}</section>` : ''}
    <details class="cybercab__ledger"><summary>BUSINESS LEDGER · ${b.ledger.length} entries</summary><ol>${b.ledger.slice(-12).reverse().map(r => `<li>Q${r.quarter} · ${esc(r.kind.replaceAll('_', ' ').replace('cybercab-', ''))} · ${esc(r.cabId ?? 'fleet')} <strong>${money(r.amount)}</strong>${r.paid ? ' · paid' : ''}</li>`).join('') || '<li>No entries yet.</li>'}</ol></details>`;
}

function routePlanHtml(book, nextBlock) {
  const demand = nextBlock?.demand ?? book?.nextDemand;
  if (!demand) return '';
  const rows = nextBlock?.cabs ?? [];
  const assigned = key => rows.filter(row => row.dispatch === key).reduce((sum, row) => sum + row.trips, 0);
  const cards = ['local', 'airport'].map(key => {
    const route = CYBERCAB_DISPATCH[key];
    const trips = nextBlock ? assigned(key) : null;
    return `<article><h4>${esc(route.label)}</h4><p class="cybercab__plan-metric"><strong>${trips == null ? '—' : trips}</strong> <span>/ ${demand[key]} shared</span></p><p>Cap ${route.trips} per ready cab</p><p>${money(route.fare)} fare · ${money(route.energy)} energy</p></article>`;
  }).join('');
  return `<section class="cybercab__plan" aria-label="Next block route plan"><h3>Next block routes</h3><div class="cybercab__plan-grid">${cards}</div><p>Trips share each route's demand; assignments account for condition and availability.</p><p>Reserve runs no trips. Every arrived cab still pays ${money(CYBERCAB_STANDING_COST)} standing costs per block.</p></section>`;
}

function quarterlyPanelHtml(state, book, { firstOpen, importOpen }) {
  const b = state.cybercab;
  const complete = state.phase === 'result';
  const next = state.phase === 'play' && book.round < 4 ? reduceCybercab(b,
    {type:'RUN_CAB_SHIFT',round:book.round+1}, {seed:state.seed,quarter:state.quarter,cash:state.cash}) : null;
  const nextBlock = next && !next.rejected ? next.state.blocks.at(-1) : null;
  const dispatch = button(state,{type:'RUN_CAB_SHIFT',round:book.round+1},
    complete ? 'BUSINESS COMPLETE' : book.round < 4 ? `DISPATCH BLOCK ${book.round+1} / 4` : 'FOUR BLOCKS COMPLETE').replace('<button ', '<button data-cab-next ');
  const fleet = b.fleet.map(cab => `<article class="cybercab__cab"><div class="cybercab__cab-head">${thumbnail}<strong>${esc(cab.id.toUpperCase())}</strong><span class="cybercab__chip">${esc(cab.haltUntil > (b.quarter-1)*4+b.round ? 'Halted' : cab.status)}</span></div>
    ${bars(cab)}<div class="cybercab__routes" aria-label="${esc(cab.id)} dispatch">${Object.entries(CYBERCAB_DISPATCH).map(([dispatch, route]) => routeButton(state, cab, dispatch, route)).join('')}</div>
    <div class="cybercab__service-row">${components.map(component => button(state,
      {type:component==='software'?'PATCH_SOFTWARE':'SERVICE_CAB',cabId:cab.id,...(component==='software'?{}:{component})},
      `${component==='software'?'Patch':component} · ${money(rules[component])}`)).join('')}</div></article>`).join('');
  const chart = b.weeklyChart.slice(-7), ceiling = Math.max(1,...chart.flatMap(row=>[row.fares,row.costs+(row.servicePaid??row.paidCosts)]));
  const incidents = b.incidents.slice(-8).reverse().map(row=>`<li><span>${esc(labels[row.kind]??row.kind)} · ${esc(row.cabId)} · Q${row.quarter}</span><strong>−${money(row.cost)}</strong>${row.dismissed?'Dismissed':button(state,{type:'DISMISS_INCIDENT',incidentId:row.id},'Dismiss')}</li>`).join('');
  return `<header class="cybercab__header"><div><p class="cybercab__eyebrow">MELBOURNE · FLEET DESK</p><h2 id="cybercab-title">Cybercab business</h2></div><button type="button" data-cab-close aria-label="Close cybercab business">Close ×</button></header>
    ${firstOpen && !complete?'<p class="cybercab__how">Choose a route. Run a work block. Maintain your fleet and settle to collect. City journeys are illustrative; waiting earns no extra money.</p>':''}
    <section class="cybercab__command"><div><h3>Dispatch · Q${book.quarter}</h3><div class="cybercab__progress" aria-label="${book.round} of 4 work blocks complete">${[1,2,3,4].map(round=>`<span class="${round<=book.round?'is-complete':''}">${round}</span>`).join('')}</div></div><div>${dispatch}<p>${nextBlock?`${nextBlock.trips} trips · fares ${money(nextBlock.fares)} − costs ${money(nextBlock.costs)} = ${money(nextBlock.fares-nextBlock.costs)}`:complete?'Business complete. Your final quarter is settled.':'Settle the city quarter to collect and start the next dispatch.'}</p></div></section>
    <div class="cybercab__summary"><div><span>Cash balance</span><strong>${money(state.cash)}</strong></div><div><span>${complete?'Last settled receipt':'Quarter projection'}</span><p class="cybercab__fare">Operating profit <strong>${money(book.profit)}</strong></p></div><div><span>Settlement cash change</span><strong>${money(book.cashAtSettlement)}</strong><small>Paid costs are already deducted.</small></div></div>
    ${routePlanHtml(book, nextBlock)}
    <section class="cybercab__fleet-section"><h3>Fleet <span>${b.fleet.length} / ${b.depot.capacity} spaces · Rating ${esc(b.rating)}</span></h3><div class="cybercab__fleet-list">${fleet||'<p>No cabs yet. Buy a cab or import from Shanghai.</p>'}</div>
      <p class="cybercab__maintenance-note"><strong>Maintenance:</strong> Keep every bar above 30%. Service misses two blocks after a lift is free. Airport wears tyres and batteries faster. Reserve avoids wear; all arrived cabs pay ${money(CYBERCAB_STANDING_COST)} standing costs per block.</p>
      ${b.queue.length?`<div class="cybercab__jobs">${b.queue.map(job=>`<p>${esc(job.cabId)} · ${esc(job.component)} · ${job.startedBeat==null?'waiting for a lift':`ready after Q${Math.ceil(job.finishBeat/4)} block ${(job.finishBeat-1)%4+1}`}</p>`).join('')}</div>`:''}</section>
    <section class="cybercab__procurement"><div>${button(state,{type:'BUY_CAB'},`BUY CAB · ${money(rules.price)}`)}${button(state,{type:'UPGRADE_DEPOT'},`ADD LIFT / SPACE · ${money(rules.liftPrice)}`)}<button type="button" data-cab-import>Import · ${money(supplier.unitPrice)}</button></div>${importOpen?`<p>Shanghai · ${money(supplier.unitPrice)} per cab · one shipping quarter. Arrives Q${state.quarter+1} at the port yard, then depot.</p>${button(state,{type:'IMPORT_CAB'},`ORDER IMPORT · ${money(supplier.unitPrice)}`)}`:''}${b.supplier.orders.filter(order=>order.status==='shipping').map(order=>`<p>${esc(order.cabId)} · arriving Q${order.arrivalQuarter}</p>`).join('')}</section>
    <details data-cab-section="book" class="cybercab__book"><summary>Quarter book · fares, costs and route demand</summary><div class="cybercab__book-grid"><div><h4>Earnings · Q${book.quarter}</h4><p>Fares ${money(book.fares)}<br>Energy −${money(book.energy)}<br>Standing costs −${money(book.standing)}<br>Incidents / carried costs −${money(book.incidents)}<br>Service paid −${money(book.servicePaid)}</p><p>Fleet / depot investment paid ${money(book.capitalPaid)} · remains an asset</p><p>Booked fares ${money(b.fares)} · Due ${money(b.costs)}</p></div><div><h4>Next block demand</h4>${book.nextDemand?['local','airport'].map(key=>`<p><strong>${CYBERCAB_DISPATCH[key].label}</strong> · ${book.nextDemand[key]} trips available, up to ${CYBERCAB_DISPATCH[key].trips} per cab<br>${money(CYBERCAB_DISPATCH[key].fare)} fare − ${money(CYBERCAB_DISPATCH[key].energy)} energy per trip</p>`).join(''):'<p>Four blocks complete.</p>'}<p>${complete?'This receipt records the final settled quarter.':'Settle completes any remaining blocks at the current dispatch.'} Game balance assumptions; not a real-world earnings forecast.</p></div></div>
      <div class="cybercab__chart" role="img" aria-label="${esc(chart.map(row=>`Q${row.quarter}: fares ${money(row.fares)}, costs ${money(row.costs+(row.servicePaid??row.paidCosts))}`).join('; ')||'No settled quarters yet')}">${chart.map(row=>`<div class="cybercab__week"><div class="cybercab__columns"><i style="height:${row.fares/ceiling*100}%"></i><i style="height:${(row.costs+(row.servicePaid??row.paidCosts))/ceiling*100}%"></i></div><span>Q${row.quarter}</span></div>`).join('')||'<p>First chart posts at settlement.</p>'}</div></details>
    ${incidents?`<details data-cab-section="incidents"><summary>Incidents · ${b.incidents.length}</summary><ul class="cybercab__incidents">${incidents}</ul><p>Dismiss acknowledges; charges and downtime remain.</p></details>`:''}
    <details data-cab-section="ledger" class="cybercab__ledger"><summary>Business ledger · ${b.ledger.length} entries</summary><ol>${b.ledger.slice(-12).reverse().map(row=>`<li>Q${row.quarter} · ${esc(row.kind.replaceAll('_',' ').replace('cybercab-',''))} · ${esc(row.cabId??'fleet')} <strong>${money(row.amount)}</strong>${row.paid?' · paid':''}</li>`).join('')||'<li>No entries yet.</li>'}</ol></details>`;
}

const panels = new WeakMap();
// The supplier's city code is Shanghai; the existing globe calls its city Shanghai Bund.
export function openCybercabSupplier(hud) {
  window.__districtDeck?.openWorld();
  const frame = document.querySelector('[data-world-overlay] iframe');
  if (!frame) return;
  const focusSupplier = () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    let observer, timer;
    const select = () => {
      const label = doc.querySelector('[data-city="shanghai-bund"]');
      if (!label) return false;
      label.click(); label.focus({ preventScroll: true }); observer?.disconnect(); clearTimeout(timer);
      return true;
    };
    if (select()) return;
    observer = new MutationObserver(select);
    observer.observe(doc, { childList: true, subtree: true });
    timer = setTimeout(() => { observer.disconnect(); if (frame.isConnected && !select()) hud.toast?.('Select Shanghai on the globe to view the supplier city.'); }, 15000);
  };
  frame.addEventListener('load', focusSupplier, { once: true });
  if (frame.contentDocument?.readyState === 'complete' && frame.contentDocument.URL !== 'about:blank') focusSupplier();
}

export function syncCybercabPanel(hud, city, state) {
  let panel = panels.get(hud);
  if (!panel) {
    panel = { state, seen: false, importOpen: false, dialog: null };
    panels.set(hud, panel);
    const close = () => {
      document.removeEventListener?.('keydown', panel.onLostFocusKey, true);
      panel.dialog?.remove(); panel.dialog = null; panel.seen = true;
      const focus = panel.focus?.isConnected ? panel.focus
        : [...hud.root.querySelectorAll('[data-cybercab-launch]')].find(button => button.getClientRects().length);
      focus?.focus({ preventScroll: true });
    };
    panel.close = close;
    panel.render = () => {
      if (!panel.dialog) return;
      const active = document.activeElement;
      const inside = panel.dialog.contains(active);
      const key = inside ? active?.getAttribute('data-cab-action') : null;
      const wasRoute = inside && active?.hasAttribute('data-cab-route');
      const hold = inside && !key ? active : null;
      const fundingAction = inside && active?.classList?.contains?.('cybercab-funding')
        ? active.previousElementSibling?.getAttribute?.('data-cab-action') : null;
      const summarySection = inside && (active?.tagName === 'SUMMARY' || active?.nodeName === 'SUMMARY')
        ? active.parentElement?.getAttribute?.('data-cab-section') ?? null : null;
      const dialogScroll = panel.dialog.scrollTop;
      const scrolls = [...panel.dialog.querySelectorAll('.cybercab__scroll')].map(el => el.scrollTop);
      const openSections = new Set([...panel.dialog.querySelectorAll('details')].filter(node=>node.open).map(node=>node.dataset.cabSection??'ledger'));
      panel.displayState = previewCybercabSeat(city, panel.state, panel.viewerSeatId);
      panel.dialog.classList.toggle('cybercab--quarterly',panel.displayState.cybercab?.economyVersion===2);
      panel.dialog.innerHTML = cybercabPanelHtml(panel.displayState, { firstOpen: !panel.seen, importOpen: panel.importOpen });
      panel.dialog.querySelectorAll('details').forEach(node=>{node.open=openSections.has(node.dataset.cabSection??'ledger');});
      panel.dialog.querySelectorAll('.cybercab__scroll').forEach((el, i) => { el.scrollTop = scrolls[i] ?? 0; });
      if (Number.isFinite(dialogScroll)) panel.dialog.scrollTop = dialogScroll;
      const focusClose = () => panel.dialog.querySelector('[data-cab-close]')?.focus?.({ preventScroll: true });
      if (key) {
        const matches = [...panel.dialog.querySelectorAll('[data-cab-action]')].filter(el => el.getAttribute('data-cab-action') === key);
        const replacement = matches.find(el => !el.disabled)
          ?? matches.find(el => el.getAttribute('aria-disabled') === 'true' && el.dataset.cabRoute);
        const fallback = wasRoute
          ? panel.dialog.querySelector('[data-cab-close]')
          : (panel.dialog.querySelector('[data-cab-next]:not(:disabled)') ?? panel.dialog.querySelector('[data-cab-close]'));
        (replacement ?? fallback)?.focus({ preventScroll: true });
      } else if (fundingAction) {
        const button = [...panel.dialog.querySelectorAll('[data-cab-action]')]
          .find(el => el.getAttribute('data-cab-action') === fundingAction);
        const note = button?.nextElementSibling;
        if (note?.classList?.contains?.('cybercab-funding')) note.focus({ preventScroll: true });
        else focusClose();
      } else if (summarySection) {
        const details = [...panel.dialog.querySelectorAll('details')]
          .find(node => node.getAttribute?.('data-cab-section') === summarySection);
        const summary = details?.querySelector?.('summary');
        if (summary) summary.focus({ preventScroll: true });
        else focusClose();
      } else if (hold?.hasAttribute('data-cab-close') || hold?.hasAttribute('data-cab-import') || hold?.hasAttribute('data-cab-globe') || hold?.hasAttribute('data-cab-next')) {
        const selector = hold.hasAttribute('data-cab-close') ? '[data-cab-close]'
          : hold.hasAttribute('data-cab-import') ? '[data-cab-import]'
            : hold.hasAttribute('data-cab-globe') ? '[data-cab-globe]' : '[data-cab-next]';
        const restored = panel.dialog.querySelector(selector);
        if (restored) restored.focus({ preventScroll: true });
        else focusClose();
      } else if (inside) focusClose();
    };
    panel.open = detail => {
      if (panel.disposed) return;
      if (detail?.kind !== 'cybercab') return;
      if (panel.dialog) return;
      panel.focus = document.activeElement;
      panel.dialog = document.createElement('dialog');
      panel.dialog.className = 'cybercab-panel card--instrument';
      panel.dialog.setAttribute('aria-labelledby', 'cybercab-title');
      hud.root.append(panel.dialog);
      panel.dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
      panel.dialog.addEventListener('keydown', event => event.stopPropagation());
      panel.onLostFocusKey = (event) => {
        if (!panel.dialog?.isConnected) return;
        const current = document.activeElement;
        if (current && current !== panel.dialog && panel.dialog.contains(current)) return;
        if (event.key !== 'Tab' && event.key !== 'Enter' && event.key !== ' ' && event.code !== 'Space') return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key !== 'Tab') return;
        panel.dialog.querySelector('[data-cab-close]')?.focus?.({ preventScroll: true });
      };
      document.addEventListener?.('keydown', panel.onLostFocusKey, true);
      panel.dialog.addEventListener('click', event => {
        const target = event.target.closest('button');
        if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
        if (target.hasAttribute('data-cab-close')) return close();
        if (target.hasAttribute('data-cab-import')) {
          if (panel.displayState.cybercab.economyVersion !== 2 && panel.displayState.cybercab.supplier.opened) { close(); openCybercabSupplier(hud); return; }
          panel.importOpen = !panel.importOpen; panel.render(); panel.dialog.querySelector('[data-cab-import]').focus(); return;
        }
        if (target.hasAttribute('data-cab-globe')) {
          close(); openCybercabSupplier(hud); return;
        }
        if (target.dataset.cabAction) hud.onVerb?.(JSON.parse(target.dataset.cabAction));
      });
      panel.render(); panel.dialog.showModal();
      panel.dialog.querySelector('[data-cab-close]').focus();
    };
    panel.onOpen = event => panel.open(event.detail);
    window.addEventListener(CYBERCAB_OPEN_EVENT, panel.onOpen);
    window.addEventListener('card-open', panel.onOpen);
  }
  // HUD rebuilds its district header after this sync. Reuse its count surface
  // once that synchronous render completes, without adding another HUD panel.
  queueMicrotask(() => {
    if (panel.disposed) return;
    const count = (panel.state.cybercabBySeat?.[panel.viewerSeatId] ?? panel.state.cybercab)?.fleet.length ?? 0;
    for (const host of [hud.rail, hud.mobileStrip].filter(Boolean)) {
      let launch = host.querySelector('[data-cybercab-launch]');
      if (!launch) {
        launch = document.createElement('button');
        launch.type = 'button'; launch.className = 'cybercab-launch'; launch.dataset.cybercabLaunch = '';
        launch.addEventListener('click', () => panel.open({kind:'cybercab'}));
        host.append(launch);
      }
      launch.textContent = `Cybercab · ${count} ${count === 1 ? 'cab' : 'cabs'}`;
    }
  });
  const viewerSeatId = hud.lastViewerSeatId ?? 'P1';
  const changed = panel.state !== state || panel.viewerSeatId !== viewerSeatId;
  panel.state = state; panel.viewerSeatId = viewerSeatId;
  if (changed) panel.render();
  return panel;
}

export function disposeCybercabPanel(hud) {
  const panel = panels.get(hud);
  if (!panel || panel.disposed) return;
  panel.disposed = true; panel.close();
  window.removeEventListener(CYBERCAB_OPEN_EVENT, panel.onOpen);
  window.removeEventListener('card-open', panel.onOpen);
  hud.root.querySelectorAll('[data-cybercab-launch]').forEach(button => button.remove());
  panels.delete(hud);
}
