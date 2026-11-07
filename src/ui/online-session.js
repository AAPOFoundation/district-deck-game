import { OnlineRoom } from '../integrations/online-room.js';
import { escapeHtml } from '../core/format.js';
import { CYBERCAB_DISPATCH } from '../core/cybercab.js';
import { openModal } from './modal.js';
import { runHistoryHtml } from './settlement-presenter.js';

const planText = value => typeof value === 'string'
  ? value.slice(0, 128).replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
const planName = value => planText(value).replace(/[_:-]+/g, ' ').replace(/\s+/g, ' ').toLowerCase();
const planId = (value, fallback = 'target unavailable') => planText(value).toUpperCase() || fallback;
const planMoney = value => Number.isFinite(value)
  ? `${value < 0 ? '−' : ''}$${Math.abs(value).toLocaleString('en-AU')}` : 'unavailable';
const planParts = (...parts) => parts.filter(Boolean).join(' · ');

/** Plain text from the accepted action's own fields; never a fresh quote or reducer call. */
export function onlineActionLabel(action, view = {}) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) return 'Move details unavailable';
  const parcel = planId(action.parcelId, 'parcel unavailable');
  const cab = planId(action.cabId, 'cab unavailable');
  const bid = Number.isFinite(action.maxBid) ? `bid limit ${planMoney(action.maxBid)}` : '';
  const building = planName(action.catalogId) || 'building choice unavailable';
  switch (action.type) {
    case 'BUY_CAB': return 'Buy a Cybercab';
    case 'IMPORT_CAB': return 'Import a Cybercab from Shanghai';
    case 'UPGRADE_DEPOT': return 'Add a depot lift and cab space';
    case 'UPGRADE_CAB_BOOK': return 'Start quarterly Cybercab dispatch';
    case 'SERVICE_CAB': return planParts(`Service ${cab}`, planName(action.component) || 'component unavailable');
    case 'PATCH_SOFTWARE': return `Patch ${cab} software`;
    case 'SET_CAB_DISPATCH': return planParts(`Set ${cab} route`,
      CYBERCAB_DISPATCH[action.dispatch]?.label || planName(action.dispatch) || 'route unavailable');
    case 'RUN_CAB_SHIFT': return Number.isInteger(action.round) && action.round >= 1 && action.round <= 4
      ? `Dispatch work block ${action.round} of 4` : 'Dispatch work block · block unavailable';
    case 'DISMISS_INCIDENT': {
      const incident = Array.isArray(view?.cybercab?.incidents)
        ? view.cybercab.incidents.find(row => row?.id === action.incidentId) : null;
      return planParts('Acknowledge cab incident', incident
        ? planParts(planId(incident.cabId), planName(incident.kind)) : planText(action.incidentId) || 'incident unavailable');
    }
    case 'acquire': return planParts(`Acquire ${parcel}`, bid);
    case 'divest': return `Sell ${parcel}`;
    case 'renovate': return `Renovate ${parcel}`;
    case 'survey': return `Survey ${parcel}`;
    case 'lobby': return planParts(`Seek planning approval for ${parcel}`, action.usePermitId
      ? `use permit: ${planName(action.usePermitId)}` : Number.isInteger(action.permitLevel)
        ? `level ${action.permitLevel}` : 'next permit level');
    case 'insure': return planParts(`Insure ${parcel}`, action.cover === 'both'
      ? 'fire and flood cover' : `${planName(action.cover) || 'unspecified'} cover`);
    case 'lease': return planParts(`Lease ${parcel}`, `${planName(action.tenantQuality) || 'unspecified'} tenant`);
    case 'remediate': return `Remediate ${parcel}`;
    case 'renovate-room': return planParts(`Upgrade room at ${parcel}`,
      `${planName(action.finish) || 'finish unavailable'} ${planName(action.roomId) || 'room unavailable'}`);
    case 'walk': return planParts(action.destination?.kind === 'person' ? 'Walk to meet' : 'Walk to',
      planId(action.destination?.id), action.purchase ? `purchase: ${planName(action.purchase)}` : '',
      action.brokerChoice ? `broker offer: ${action.brokerChoice === 'lvr' ? 'loan-to-value ratio'
        : action.brokerChoice === 'interest' ? 'interest rate' : planName(action.brokerChoice)}` : '');
    case 'bid': return planParts('Auction bid',
      planId(view?.events?.byId?.[action.eventId]?.parcelId || action.eventId), bid);
    case 'hire': return planParts(`Hire ${planName(action.profession) || 'specialist'}`, parcel,
      planText(action.personId), action.brief ? `brief: ${planName(action.brief)}` : '');
    case 'send-crew': return planParts(`Send crew to ${parcel}`, planText(action.personId));
    case 'demolish-strike': return `Demolish ${parcel}`;
    case 'place-building': return planParts(`Build at ${parcel}`, building);
    case 'redevelop': return planParts(`Redevelop ${parcel}`, building);
    case 'redevelop:notice': return `Give tenant notice at ${parcel}`;
    case 'redevelop:buyout': return `Buy out tenant at ${parcel}`;
    case 'hold': return planParts('Hold', action.bankRequested === true ? 'request action banking'
      : action.bankRequested === false ? 'do not bank this action' : 'banking choice unavailable');
    case 'pact': return planParts(`Offer ${planName(action.pactKind) || 'pact'}`,
      planId(action.targetId), action.partnerSeatId ? `with ${planId(action.partnerSeatId)}` : '',
      action.beneficiarySeatId ? `beneficiary ${planId(action.beneficiarySeatId)}` : '', bid);
    default: return planParts('Other move', planName(action.type) || 'type unavailable',
      action.parcelId ? parcel : '', action.cabId ? cab : '');
  }
}

export function onlinePlanMovesHtml(snapshot) {
  const actions = Array.isArray(snapshot?.ownPlan) ? snapshot.ownPlan : [];
  return `<ol class="online-plan">${actions.map(action =>
    `<li>${escapeHtml(onlineActionLabel(action, snapshot.viewState))}</li>`).join('') || '<li>No moves planned.</li>'}</ol>`;
}

export function onlinePlanBalancesHtml(snapshot) {
  const view = snapshot.viewState ?? {}, resolution = snapshot.lastResolution;
  const quarter = value => Number.isSafeInteger(value) ? value : '?';
  return `<p>Current confirmed cash <strong>${planMoney(view.cash)}</strong> · NAV <strong>${planMoney(view.onlineNav?.player)}</strong>.</p>
    ${resolution ? `<p>Last settlement · Q${quarter(resolution.fromQuarter)} to Q${quarter(resolution.toQuarter)}: cash ${planMoney(resolution.cashBefore)} → ${planMoney(resolution.cashAfter)}. This is your total cash change, including planned spending.</p>` : ''}`;
}

export function onlinePlanStatus(snapshot, seatId) {
  const committed = snapshot.committed.includes(seatId);
  const waitingForJoin = Object.values(snapshot.joined).some(joined => !joined);
  const pacts = snapshot.viewState.quarterCommit.status === 'defection'
    ? Object.values(snapshot.viewState.activePacts ?? {}).filter(pact => pact.members.includes(seatId) && !pact.decisions[seatId]) : [];
  const ended = snapshot.viewState.phase !== 'play';
  const moves = snapshot.ownPlan?.length ?? 0;
  const auctionBlocked = snapshot.auctionContract?.settlementBlocked === true;
  return { committed, waitingForJoin, pacts, canCommit: !committed && !waitingForJoin && !ended && !auctionBlocked,
    text: auctionBlocked ? 'An accepted legacy auction bid prevents this room from advancing. Its data is preserved; no plan reset is available.'
      : ended ? 'Game complete · current balances are in your plan' : pacts.length ? 'Choose whether to honour your pacts'
      : waitingForJoin ? 'Waiting for the invited seat to join' : committed ? 'Plan committed · waiting for the other seat'
        : `${moves} ${moves === 1 ? 'move' : 'moves'} planned · commit to resolve` };
}

export function onlineAuctionUpgradeHtml(snapshot, busy = false) {
  const contract = snapshot.auctionContract;
  if (!contract?.upgradeSupported || contract.version !== 1) return '';
  if (contract.settlementBlocked) return '<p>This room has an accepted bid under the old auction rules. Its data is preserved, but it cannot advance on this server. There is no plan reset or automatic repair.</p>';
  return `<p>Scheduled bidding is disabled under this room’s legacy rules. Enable seat auctions at an empty quarter with no accepted plans, commits, pacts or auction commitments. Earlier results remain unchanged.</p>
    <p><button type="button" data-online-upgrade-auctions ${busy || snapshot.ownPlan.length || snapshot.committed.length ? 'disabled' : ''}>Enable seat auctions</button></p>`;
}

export async function resumeOnlineSession(search = location.search) {
  const roomId = new URLSearchParams(search).get('room');
  if (!roomId) return null;
  const credentials = OnlineRoom.savedCredentials(roomId);
  if (!credentials) throw new Error('Room access is missing. Open the online lobby to reconnect.');
  return OnlineRoom.resume(credentials);
}

export function mountOnlineSession(game) {
  const room = game.online;
  let busy = false, message = '', closePlan = null, disposed = false, planRevision = null;
  let closeHistory = null, historyRevision = null, pollFailure = null;
  const setMessage = value => { message = value; pollFailure = null; };
  const currentPlanButton = () => [...game.root.querySelectorAll('[data-online-plan]')]
    .find(button => button.isConnected && button.offsetParent !== null && !button.disabled) ?? null;
  const render = () => {
    if (disposed) return;
    const snapshot = room.snapshot;
    const retireStaleDialogs = () => {
      if (closePlan && planRevision !== snapshot.revision) { closePlan(); closePlan = null; planRevision = null; }
      if (closeHistory && historyRevision !== snapshot.revision) { closeHistory(); closeHistory = null; historyRevision = null; }
    };
    const rivalPanel = game.hud.rail?.querySelector('[data-rail-panel="rival"]');
    if (!rivalPanel) { retireStaleDialogs(); return; }
    game.root.querySelector('[data-online-status]')?.remove();
    const panel = document.createElement('section');
    panel.className = 'online-status'; panel.dataset.onlineStatus = '';
    const model = onlinePlanStatus(snapshot, room.seatId);
    panel.innerHTML = `<div><strong title="${escapeHtml(room.roomId)}">Room ${escapeHtml(room.roomId.slice(0,8))}</strong><span>${escapeHtml(room.seatId)} · Q${snapshot.quarter}</span></div>
      <p role="status">${escapeHtml(pollFailure?.message || message || model.text)}</p>
      <button type="button" data-online-plan>${model.pacts.length ? 'Pact decisions' : 'View plan'}</button><button type="button" data-online-retry ${busy ? 'disabled' : ''}>Reconnect</button>`;
    rivalPanel.before(panel);
    if (snapshot.opponent !== 'policy') {
      rivalPanel.hidden = true;
      const label = game.root.querySelector('.board-legend__item--ai');
      if (label) label.innerHTML = '<i></i>Opponent';
    }
    for (const button of game.root.querySelectorAll('[data-verb="settle"]')) {
      button.textContent = model.committed ? 'WAITING' : 'COMMIT PLAN';
      button.disabled = busy || !model.canCommit;
      button.title = model.canCommit ? 'Commit this quarter’s planned moves. Both seats resolve together.' : model.text;
    }
    const mobile = game.hud.mobileStrip;
    mobile?.querySelector('[data-online-plan]')?.remove();
    if (mobile) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'mobile-cycle-chip';
      button.dataset.onlinePlan = ''; button.textContent = `${room.seatId} · ${model.pacts.length ? 'Pacts' : model.committed ? 'Waiting' : 'Plan'}`; mobile.prepend(button);
    }
    // Resolve focus only after the current desktop/mobile launch controls exist.
    retireStaleDialogs();
  };
  const showPlan = () => {
    if (disposed) return;
    closePlan?.(); const snapshot = room.snapshot;
    planRevision = snapshot.revision;
    const model = onlinePlanStatus(snapshot, room.seatId);
    closePlan = openModal(game.root, { label: 'Your online plan', returnFocus: currentPlanButton, html: `
      <p>Room <strong>${escapeHtml(room.roomId)}</strong> · ${escapeHtml(room.seatId)} · Quarter ${snapshot.quarter}</p>
      <p>The server checks each move when you add it. Both seats resolve together; your plan stays private until resolution.</p>
      ${onlinePlanMovesHtml(snapshot)}
      <p>${escapeHtml(model.text)}.</p>
      ${model.pacts.map(pact => `<section class="online-pact"><h3>${escapeHtml(pact.pactKind)} · ${escapeHtml(pact.targetId ?? 'shared plan')}</h3><p>Honour the agreement, or defect and withdraw from it. The other seat’s decision stays private.</p><button type="button" data-pact-id="${escapeHtml(pact.pactId)}" data-pact-decision="honour-pact" ${busy ? 'disabled' : ''}>Honour pact</button> <button type="button" data-pact-id="${escapeHtml(pact.pactId)}" data-pact-decision="defect" ${busy ? 'disabled' : ''}>Defect</button></section>`).join('')}
      ${onlinePlanBalancesHtml(snapshot)}
      ${onlineAuctionUpgradeHtml(snapshot, busy)}
      <p><button type="button" data-online-history>View completed quarters</button></p>
      <p><a href="./online.html?room=${encodeURIComponent(room.roomId)}">Room access and reconnection</a></p>`,
      footer: `<div class="online-plan-controls"><button type="button" data-online-commit ${busy || !model.canCommit ? 'disabled' : ''}>Commit plan</button><button type="button" data-close>Back to city</button></div>`,
      onClick: (event, close) => {
        if (disposed || snapshot.revision !== room.snapshot.revision) { close(); closePlan = null; return; }
        if (event.target.closest('[data-online-history]')) {
          close(); closePlan = null; historyRevision = snapshot.revision;
          closeHistory = openModal(game.root, { label: 'Your completed quarters',
            html: runHistoryHtml(snapshot.viewState), returnFocus: currentPlanButton });
          return;
        }
        if (event.target.closest('[data-online-upgrade-auctions]') && !busy) {
          close(); closePlan = null; upgradeAuctions(); return;
        }
        if (event.target.closest('[data-online-commit]')) { close(); closePlan = null; game.submitOnline({type:'settle'}); }
        const decision = event.target.closest('[data-pact-decision]');
        if (decision && !busy) { close(); closePlan = null; decide(decision.dataset.pactDecision, decision.dataset.pactId); }
      },
    });
  };
  const upgradeAuctions = async () => {
    if (disposed || busy) return;
    busy = true; setMessage('Enabling seat auctions…'); render();
    try { await room.upgradeAuctions(); if (!disposed) message = 'Seat auctions enabled. Earlier results are unchanged.'; }
    catch (error) { if (!disposed) setMessage(error.message || 'The upgrade was not confirmed. Reconnect to retry.'); }
    finally { busy = false; render(); }
  };
  const decide = async (type, pactId) => {
    if (disposed) return;
    busy = true; setMessage('Sending your decision…'); render();
    try { await room.decidePact({type,pactId,...(type === 'defect' ? {replacementAction:null} : {})}); if (!disposed) message = ''; }
    catch (error) { if (!disposed) setMessage(error.message || 'Your decision could not be confirmed. Reconnect to retry.'); }
    finally { busy = false; render(); }
  };
  const click = async event => {
    if (disposed) return;
    if (event.target.closest('[data-online-plan]')) { showPlan(); return; }
    if (event.target.closest('[data-online-retry]')) {
      if (busy) return;
      busy = true; render();
      try {
        await room.retry(); if (disposed) return;
        // Only this newer authenticated read may retire the error it started after.
        const priorFailure = pollFailure;
        await room.refresh();
        if (!disposed) { message = 'Connected'; if (pollFailure === priorFailure) pollFailure = null; }
      }
      catch (error) { if (!disposed) setMessage(error.message || 'Unable to reconnect. Your plan is retained.'); }
      busy = false;
      render();
    }
  };
  game.root.addEventListener('click', click);
  return {
    render,
    setBusy(value) { busy = value; if (value) setMessage('Sending your move…'); else if (message === 'Sending your move…') message = ''; render(); },
    error(error) { if (disposed) return; setMessage(error.message || error.reason || 'Connection interrupted. Your last confirmed plan is retained.'); render(); },
    pollingError(error, { recoverable = false } = {}) {
      if (disposed || (pollFailure && !pollFailure.recoverable && recoverable)) return;
      pollFailure = { error, recoverable, message: error.message || 'Connection interrupted. Your last confirmed plan is retained.' };
      render();
    },
    pollingRecovered(error) {
      if (disposed || pollFailure?.error !== error || !pollFailure.recoverable) return;
      pollFailure = null;
      if (room.pending && !message) message = 'Connection restored. Your previous request is unconfirmed; Reconnect to retry it.';
      render();
    },
    dispose() { if (disposed) return; disposed = true; closePlan?.(); closeHistory?.(); game.root.removeEventListener('click', click); game.root.querySelector('[data-online-status]')?.remove(); },
  };
}
