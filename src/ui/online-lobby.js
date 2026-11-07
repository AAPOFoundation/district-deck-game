import { OnlineRoom } from '../integrations/online-room.js';
import { OPERATORS } from '../core/content.js';
import { operatorChoices } from '../core/rule-calls.js';

const mounted = new WeakMap();

// A mount owns its DOM handlers, connection, and request cancellation. The
// transport still owns saved credentials and exact interrupted-opening proofs.
export function mountOnlineLobby({ document = globalThis.document, window = globalThis.window, Room = OnlineRoom } = {}) {
  mounted.get(document)?.dispose();
  const $ = selector => document.querySelector(selector);
  const { location, history, navigator } = window;
  const status = message => { $('#online-status').textContent = message; };
  const create = $('#create-room');
  const forms = [create, $('#join-room'), $('#resume-room'), $('#retry-opening')];
  const handlers = [];
  let room = null, unsubscribe = null, connectionAbort = null, reenter = null, generation = 0, retired = false;
  const current = ticket => !retired && ticket === generation;
  const listen = (target, type, handler) => {
    target.addEventListener(type, handler);
    handlers.push(() => target.removeEventListener(type, handler));
  };
  function disconnect() {
    unsubscribe?.(); unsubscribe = null;
    connectionAbort?.abort(); connectionAbort = null;
    room?.dispose(); room = null;
  }
  function dispose() {
    if (reenter) { window.removeEventListener('pageshow', reenter); reenter = null; }
    if (retired) return;
    retired = true; generation++;
    disconnect(); handlers.splice(0).forEach(remove => remove());
    mounted.delete(document);
  }
  const controller = { dispose };
  mounted.set(document, controller);
  for (const form of forms) for (const button of form.querySelectorAll('button')) button.disabled = false;

  $('#online-operator').replaceChildren();
  for (const operator of operatorChoices(OPERATORS)) {
    const option = document.createElement('option'); option.value = operator.id;
    option.disabled = !operator.selectable;
    // COPY-DRAFT: preserve the full roster while identifying unavailable choices.
    option.textContent = `${operator.name ?? operator.id}${operator.selectable ? '' : ' (Later)'}`;
    $('#online-operator').append(option);
  }
  $('#online-operator').value = 'underwriter';
  listen(create.elements.opponent, 'change', () => { $('#policy-field').hidden = create.elements.opponent.value !== 'policy'; });
  listen($('#create-instead'), 'click', () => {
    create.hidden = false; $('#join-details').open = false; $('#create-instead').hidden = true;
    $('#lobby-title').textContent = 'Start a room'; status('');
    create.elements.opponent.focus();
  });

  function parseInvite(value) {
    const url = new URL(value, location.href), fields = new URLSearchParams(url.hash.slice(1));
    const roomId = fields.get('room') || url.searchParams.get('room');
    const inviteToken = fields.get('invite');
    if (!roomId || !inviteToken) throw new Error('Paste the complete invitation link.');
    return { roomId, inviteToken };
  }

  function renderRoom() {
    const seats = Object.values(room.snapshot.joined);
    const ready = seats.length >= 2 && seats.every(joined => joined === true);
    const ended = room.snapshot.viewState?.phase === 'result';
    $('#lobby-title').textContent = ended ? 'Game complete' : ready ? 'Ready for Melbourne' : 'Waiting for the other seat';
    $('#room-ready-title').textContent = room.roomId;
    $('#room-summary').textContent = `You are ${room.seatId} · Quarter ${room.snapshot.quarter} · Seed ${room.snapshot.seed}`;
    $('#enter-online-city').href = `./play.html?room=${encodeURIComponent(room.roomId)}`;
    $('#seat-token').value = room.credentials.token;
    $('#room-invitation').hidden = true; $('#ai-access').hidden = true; $('#invite-link').value = '';
    if (room.invite) {
      const link = new URL('./online.html', location.href);
      link.hash = new URLSearchParams({ room: room.roomId, invite: room.invite.inviteToken }).toString();
      $('#invite-link').value = link.href; $('#room-invitation').hidden = false;
      $('#invite-help').textContent = room.snapshot.opponent === 'external-ai' ? 'Give this invitation to your AI player. It grants the other seat.' : 'Share this link with your friend. Both seats must join before the quarter can resolve.';
      if (room.snapshot.opponent === 'external-ai') {
        $('#ai-access').hidden = false;
        $('#ai-instructions').textContent = `Read ${location.origin}/credits.html#online-api and GET ${location.origin}/api/rooms/options first.

Generate a random 32-byte seatToken (43-character unpadded base64url). Save it and this exact body before joining:
POST ${location.origin}/api/rooms/${room.roomId}/join
{"inviteToken":"<token from invitation>","seatToken":"<your saved token>","protocol":"<from options>","stateVersion":"<from options>","simRevision":"<from options>"}

Keep the version fields in their original JSON types. If the reply is lost, retry that same body.

Then authenticate with Authorization: Bearer <seat token>.
POST /api/rooms/${room.roomId}/get_state
POST /api/rooms/${room.roomId}/submit_actions

Read the current revision, quarter and startStateHash before submitting a plan.`;
      }
    }
    status(ended ? 'This game is complete. Enter the city to review your current balances.' : ready
      ? 'Both seats have joined. Enter the city to plan your quarter.'
      : 'Waiting for your invited player to join. You can enter the city while you wait.');
  }

  function showRoom(next, ticket) {
    room = next;
    create.hidden = true; $('#join-details').hidden = true; $('#create-instead').hidden = true;
    $('#retry-opening').hidden = true; $('#room-ready').hidden = false;
    $('#refresh-room').disabled = false;
    const live = () => current(ticket) && room === next;
    unsubscribe = next.subscribe(() => { if (live()) renderRoom(); });
    next.startPolling({ onError: () => {
      if (live()) status('Room update failed. Showing the last confirmed status; use Refresh room status.');
    } });
    renderRoom();
    history.replaceState(null, '', `./online.html?room=${encodeURIComponent(room.roomId)}`);
    $('#enter-online-city').focus();
  }

  async function perform(form, operation) {
    if (retired) return;
    const ticket = ++generation;
    disconnect(); $('#room-ready').hidden = true;
    const abort = new AbortController(); connectionAbort = abort;
    const options = { fetchImpl: (input, init = {}) => window.fetch(input, { ...init,
      signal: AbortSignal.any([abort.signal, ...(init.signal ? [init.signal] : [])]),
    }) };
    // Reset a superseded form too; its late finally must not touch this attempt.
    for (const other of forms) for (const button of other.querySelectorAll('button')) button.disabled = other === form;
    status('Connecting…');
    try {
      const next = await operation(options);
      if (!current(ticket)) { next.dispose(); return; }
      showRoom(next, ticket);
    } catch (error) {
      if (!current(ticket)) return;
      disconnect();
      status(error.message || 'The online service could not be reached. Please try again.');
      $('#retry-opening').hidden = !Room.pendingOpening();
    } finally {
      if (current(ticket)) for (const button of form.querySelectorAll('button')) button.disabled = false;
    }
  }
  listen(create, 'submit', event => {
    event.preventDefault();
    const seed = Number(create.elements.seed.value);
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) { status('Use a whole-number seed from 0 to 4294967295.'); return; }
    perform(create, options => Room.create({ seed, opponent: create.elements.opponent.value,
      operatorId: create.elements.operatorId.value, policyId: create.elements.policyId.value }, options));
  });
  listen($('#join-room'), 'submit', event => {
    event.preventDefault(); const form = event.currentTarget;
    perform(form, options => Room.join(parseInvite(form.elements.invite.value), options));
  });
  listen($('#resume-room'), 'submit', event => {
    event.preventDefault(); const form = event.currentTarget;
    perform(form, options => {
      const roomId = form.elements.roomId.value.trim(), token = form.elements.token.value.trim();
      const credentials = token ? { roomId, token } : Room.savedCredentials(roomId);
      if (!credentials) throw new Error('Enter the access token saved when you joined this room.');
      return Room.resume(credentials, options);
    });
  });
  listen($('#refresh-room'), 'click', async () => {
    const next = room, ticket = generation;
    if (!next) return;
    const button = $('#refresh-room'); button.disabled = true;
    try { await next.refresh(); if (current(ticket) && room === next) renderRoom(); }
    catch { if (current(ticket) && room === next) status('Room update failed. Showing the last confirmed status; try Refresh again.'); }
    finally { if (current(ticket) && room === next) button.disabled = false; }
  });
  async function copy(value) {
    const ticket = generation;
    try { await navigator.clipboard.writeText(value); if (current(ticket)) status('Copied.'); }
    catch { if (current(ticket)) status('Copy is unavailable here. Select and copy the field manually.'); }
  }
  listen($('#copy-invite'), 'click', () => copy($('#invite-link').value));
  listen($('#copy-access'), 'click', () => copy(room?.credentials.token ?? ''));
  listen($('#retry-opening'), 'submit', event => {
    event.preventDefault(); perform(event.currentTarget, options => Room.retryOpening(options));
  });
  $('#retry-opening').hidden = !Room.pendingOpening();
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (fragment.has('invite')) {
    create.hidden = true; $('#join-details').open = true; $('#create-instead').hidden = false;
    $('#lobby-title').textContent = 'Join your invited room';
    $('#join-room').elements.invite.value = location.href;
    history.replaceState(null, '', location.pathname + location.search);
  } else {
    const roomId = new URLSearchParams(location.search).get('room');
    if (roomId) {
      $('#resume-room').elements.roomId.value = roomId;
      const credentials = Room.savedCredentials(roomId);
      if (credentials) perform($('#resume-room'), options => Room.resume(credentials, options));
    }
  }
  listen(window, 'pagehide', event => {
    dispose();
    // Back/Forward may restore this same document. Keep only one dormant
    // re-entry listener; the retired mount and its requests stay stopped.
    if (event.persisted) {
      reenter = () => {
        reenter = null;
        if (!mounted.has(document)) mountOnlineLobby({ document, window, Room });
      };
      window.addEventListener('pageshow', reenter, { once: true });
    }
  });
  return controller;
}

if (typeof document !== 'undefined' && document.querySelector('#create-room')) mountOnlineLobby();
