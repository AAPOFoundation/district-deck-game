// Browser transport only. No reducer, camera, world store, or local campaign writes.
import { STATE_VERSION } from '../core/state-version.js';
import { SIM_REVISION } from '../core/content.js';

export const ONLINE_ROOM_PROTOCOL = 'district-deck-online-v1';
export const onlineRoomStorageKey = roomId => `district-deck.online.room.v1:${roomId}`;
export const onlineRoomOpeningStorageKey = 'district-deck.online.opening.v1';
const identity = { protocol: ONLINE_ROOM_PROTOCOL, stateVersion: STATE_VERSION, simRevision: SIM_REVISION };
const roomPattern = /^[a-f0-9]{32}$/;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const clone = value => structuredClone(value);
// Mark failures at the fetch boundary without changing the thrown error or retaining it.
const networkFailures = new WeakSet();
function browserStorage() { try { return globalThis.sessionStorage ?? null; } catch { return null; } }
function requestId() {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}
function seatSecret() {
  const bytes = new Uint8Array(32); globalThis.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function readOpening(storage) {
  const raw = storage?.getItem(onlineRoomOpeningStorageKey);
  if (!raw) return null;
  const saved = JSON.parse(raw);
  if (!['create', 'join'].includes(saved?.kind) || !roomPattern.test(saved.roomId ?? '')
    || !tokenPattern.test(saved.body?.seatToken ?? '')
    || (saved.kind === 'create' && saved.body.roomId !== saved.roomId)) {
    throw new OnlineRoomError('Saved room opening proof is invalid; it was preserved.');
  }
  return saved;
}
function validateCredentials(value) {
  if (!roomPattern.test(value?.roomId ?? '') || !tokenPattern.test(value?.token ?? '')
    || !['P1', 'P2'].includes(value?.seatId ?? 'P1')) throw new Error('Invalid room credentials.');
  return value;
}
function savedInvite(value, roomId) {
  return value?.roomId === roomId && tokenPattern.test(value.inviteToken ?? '')
    && ['human', 'external-ai'].includes(value.opponent)
    ? { roomId, inviteToken: value.inviteToken, opponent: value.opponent } : null;
}
export class OnlineRoomError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}

export class OnlineRoom {
  constructor(credentials, { baseUrl = '/api/rooms', fetchImpl = globalThis.fetch,
    storage = browserStorage(), requestMs = 15000 } = {}) {
    validateCredentials(credentials);
    if (typeof baseUrl !== 'string' || /[?#]/.test(baseUrl) || typeof fetchImpl !== 'function') {
      throw new Error('Invalid room transport options.');
    }
    this.baseUrl = baseUrl.replace(/\/$/, '');
    // Browser fetch requires its Window receiver; calling it as a room method
    // passes the room instance and fails even though Node's fetch permits it.
    this.fetchImpl = (...args) => fetchImpl.call(globalThis, ...args);
    this.storage = storage;
    if (!Number.isInteger(requestMs) || requestMs <= 0 || requestMs > 30000) throw new Error('Invalid request deadline.');
    this.requestMs = requestMs;
    this.credentials = clone(credentials);
    this.roomId = credentials.roomId;
    this.seatId = credentials.seatId ?? null;
    this.snapshot = null;
    this.invite = null;
    this.pending = null;
    this.retired = false;
    this.controllers = new Set();
    this.listeners = new Set();
    this.queue = Promise.resolve();
    this.pollTimer = null;
    this.polling = false;
  }

  static savedCredentials(roomId, { storage = browserStorage() } = {}) {
    if (!roomPattern.test(roomId ?? '')) return null;
    try {
      const saved = JSON.parse(storage?.getItem(onlineRoomStorageKey(roomId)) ?? 'null');
      return saved?.credentials?.roomId === roomId ? clone(validateCredentials(saved.credentials)) : null;
    } catch { return null; }
  }

  static async options({ baseUrl = '/api/rooms', fetchImpl = globalThis.fetch } = {}) {
    if (/[?#]/.test(baseUrl)) throw new Error('Invalid room endpoint.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/options`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new OnlineRoomError('Room options are unavailable.', response.status);
      return await response.json();
    } finally { clearTimeout(timer); }
  }

  static pendingOpening({ storage = browserStorage() } = {}) {
    try { return clone(readOpening(storage)); } catch { return null; }
  }

  static async #prepare(kind, configuration, options) {
    const storage = options.storage === undefined ? browserStorage() : options.storage;
    const allowed = kind === 'create' ? ['seed', 'opponent', 'policyId', 'operatorId'] : ['roomId', 'inviteToken'];
    if (!configuration || Object.keys(configuration).some(key => !allowed.includes(key))) {
      throw new OnlineRoomError('Unsupported room opening fields.');
    }
    const intent = kind === 'create' ? { seed: configuration.seed, opponent: configuration.opponent,
      policyId: configuration.policyId ?? 'value', operatorId: configuration.operatorId ?? 'underwriter' }
      : { inviteToken: configuration.inviteToken };
    let opening = readOpening(storage);
    if (opening) {
      if (opening.kind !== kind || (kind === 'join' && opening.roomId !== configuration.roomId)
        || Object.entries(intent).some(([key, value]) => opening.body[key] !== value)) {
        throw new OnlineRoomError('A previous room opening is uncertain. Retry it before opening another room.');
      }
    } else {
      const roomId = kind === 'create' ? requestId().slice(0, 32) : configuration.roomId;
      opening = { kind, roomId, body: { ...identity, ...intent, seatToken: seatSecret(),
        ...(kind === 'create' ? { roomId, inviteToken: intent.opponent === 'policy' ? null : seatSecret() } : {}) } };
    }
    const encoded = JSON.stringify(opening);
    try {
      storage.setItem(onlineRoomOpeningStorageKey, encoded);
      if (storage.getItem(onlineRoomOpeningStorageKey) !== encoded) throw new Error('Storage did not retain proof.');
    } catch {
      throw new OnlineRoomError('Room opening requires session storage so an interrupted reply can be recovered.');
    }
    return this.#opening(opening, { ...options, storage });
  }

  static async #opening(opening, options) {
    const baseUrl = (options.baseUrl ?? '/api/rooms').replace(/\/$/, '');
    if (/[?#]/.test(baseUrl)) throw new Error('Invalid room endpoint.');
    const requestMs = options.requestMs ?? 15000;
    if (!Number.isInteger(requestMs) || requestMs <= 0 || requestMs > 30000) throw new Error('Invalid request deadline.');
    const path = opening.kind === 'create' ? '' : `/${opening.roomId}/join`;
    const clear = () => {
      try {
        if (options.storage.getItem(onlineRoomOpeningStorageKey) === JSON.stringify(opening)) {
          options.storage.removeItem(onlineRoomOpeningStorageKey);
        }
      } catch { /* Keep the exact proof if storage cannot be changed. */ }
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestMs);
    let payload;
    try {
      const response = await (options.fetchImpl ?? globalThis.fetch)(`${baseUrl}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opening.body), cache: 'no-store', signal: controller.signal,
      });
      payload = await response.json();
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) clear();
        throw new OnlineRoomError(payload.error ?? 'Room opening failed.', response.status);
      }
    } finally { clearTimeout(timer); }
    if (payload.credentials?.roomId !== opening.roomId || payload.credentials.token !== opening.body.seatToken
      || payload.credentials.seatId !== (opening.kind === 'create' ? 'P1' : 'P2')) {
      throw new OnlineRoomError('Opening response did not match its saved seat proof.');
    }
    const room = new OnlineRoom(payload.credentials, options);
    room.invite = payload.invite ?? null;
    room.#accept(payload);
    if (OnlineRoom.savedCredentials(room.roomId, options)?.token === room.credentials.token) clear();
    return room;
  }
  static create(configuration, options = {}) { return this.#prepare('create', configuration, options); }
  static join({ roomId, inviteToken }, options = {}) {
    if (!roomPattern.test(roomId ?? '') || !tokenPattern.test(inviteToken ?? '')) {
      return Promise.reject(new Error('Invalid invitation.'));
    }
    return this.#prepare('join', { roomId, inviteToken }, options);
  }
  static async retryOpening(options = {}) {
    const storage = options.storage === undefined ? browserStorage() : options.storage;
    const opening = readOpening(storage);
    if (!opening) throw new OnlineRoomError('No pending room opening to retry.');
    return this.#opening(opening, { ...options, storage });
  }
  static async resume(credentials, options = {}) {
    const room = new OnlineRoom(credentials, options);
    let invite = null;
    try {
      const saved = JSON.parse(room.storage?.getItem(onlineRoomStorageKey(room.roomId)) ?? 'null');
      if (saved?.credentials?.roomId === room.roomId && saved.credentials.token === credentials.token) {
        room.pending = saved.pending ?? null;
        if (saved.credentials.seatId === 'P1') invite = savedInvite(saved.invite, room.roomId);
      }
    } catch { /* A damaged browser cache is not authoritative room state. */ }
    await room.refresh();
    // Restore the creator's private invitation only after server authentication and seat validation.
    if (room.seatId === 'P1' && !room.snapshot.joined.P2) { room.invite = invite; room.#save(); }
    return room;
  }

  #alive() { if (this.retired) throw new OnlineRoomError('Room transport is disposed.'); }
  #save() {
    try {
      this.storage?.setItem(onlineRoomStorageKey(this.roomId), JSON.stringify({
        credentials: this.credentials, pending: this.pending, invite: this.invite,
      }));
    } catch { /* Explicit credentials remain available if browser storage is unavailable. */ }
  }
  #accept(payload) {
    this.#alive();
    const next = payload.snapshot;
    if (!next || next.protocol !== ONLINE_ROOM_PROTOCOL || next.roomId !== this.roomId
      || next.stateVersion !== STATE_VERSION || next.simRevision !== SIM_REVISION
      || !Number.isSafeInteger(next.revision) || !['P1', 'P2'].includes(next.seatId)
      || (this.seatId && next.seatId !== this.seatId)) {
      throw new OnlineRoomError('Room response identity or game revision mismatch.', 409);
    }
    if (this.snapshot && next.revision < this.snapshot.revision) return null;
    this.seatId = next.seatId;
    this.credentials.seatId = next.seatId;
    const prior = this.snapshot;
    const changed = !prior || next.revision !== prior.revision;
    this.snapshot = next;
    if (next.seatId !== 'P1' || next.joined.P2) this.invite = null;
    this.#save();
    const events = payload.events?.length ? payload.events : prior && next.lastResolution
      && next.lastResolution.revision > prior.revision
      ? [{ kind: 'room-quarter-resolved', ...next.lastResolution }] : [];
    const update = { snapshot: next, events, duplicate: payload.duplicate === true,
      receipt: payload.receipt ?? null };
    if (changed || update.events.length) {
      for (const listener of this.listeners) {
        try { listener(update); } catch { /* One UI subscriber cannot interrupt the transport. */ }
      }
    }
    return update;
  }

  async #request(path, body = null, query = '') {
    this.#alive();
    const controller = new AbortController();
    this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), this.requestMs);
    try {
      let response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}/${this.roomId}/${path}${query}`, {
          method: body === null ? 'GET' : 'POST', cache: 'no-store', signal: controller.signal,
          headers: { Authorization: `Bearer ${this.credentials.token}`,
            ...(body === null ? {} : { 'Content-Type': 'application/json' }) },
          ...(body === null ? {} : { body: JSON.stringify(body) }),
        });
      } catch (error) {
        if (error && typeof error === 'object') networkFailures.add(error);
        throw error;
      }
      this.#alive();
      if (response.status === 204) return null;
      const payload = await response.json();
      this.#alive();
      if (!response.ok) {
        const error = new OnlineRoomError(payload.error ?? 'Room request failed.', response.status);
        error.definiteRejection = response.status >= 400 && response.status < 500;
        throw error;
      }
      return payload;
    } finally { clearTimeout(timer); this.controllers.delete(controller); }
  }

  async refresh() {
    const payload = await this.#request('state', null,
      this.snapshot ? `?revision=${this.snapshot.revision}` : '');
    return payload ? this.#accept(payload) : null;
  }
  #serial(operation) {
    const next = this.queue.then(() => { this.#alive(); return operation(); });
    this.queue = next.catch(() => {});
    return next;
  }
  async #sendPending() {
    const pending = this.pending;
    if (!pending) return null;
    try {
      const payload = await this.#request(pending.path, pending.body);
      const update = this.#accept(payload);
      this.pending = null; this.#save();
      return update;
    } catch (error) {
      // Network/5xx failure can follow an accepted durable commit. Keep its exact ID.
      // A definite validation/auth/conflict reply did not accept this request.
      if (error.definiteRejection) { this.pending = null; this.#save(); }
      throw error;
    }
  }
  #mutate(path, extra = {}) {
    return this.#serial(async () => {
      if (this.pending) throw new OnlineRoomError('A previous request is uncertain. Retry it before making another plan change.');
      if (!this.snapshot) await this.refresh();
      this.pending = { path, body: { ...identity, ...extra, requestId: requestId(),
        revision: this.snapshot.revision, quarter: this.snapshot.quarter,
        startStateHash: this.snapshot.startStateHash } };
      this.#save();
      return this.#sendPending();
    });
  }
  stage(action) { return this.#mutate('actions', { action }); }
  upgradeAuctions() { return this.#mutate('auction-contract'); }
  commit() { return this.#mutate('commit'); }
  decidePact(action) { return this.#mutate('decision', { action }); }
  submitActions(actions) { return this.#mutate('submit_actions', { actions }); }
  retry() { return this.#serial(() => this.#sendPending()); }
  subscribe(listener) { this.#alive(); this.listeners.add(listener); return () => this.listeners.delete(listener); }
  startPolling({ intervalMs = 1500, onError = () => {}, onRecovered = () => {} } = {}) {
    this.#alive();
    if (!Number.isInteger(intervalMs) || intervalMs < 500 || intervalMs > 30000) throw new Error('Invalid polling interval.');
    if (this.polling) return;
    this.polling = true;
    let failedRead = null;
    const notify = (callback, ...args) => {
      try { callback(...args); } catch { /* A status observer cannot stop read polling. */ }
    };
    const tick = async () => {
      try {
        await this.refresh();
        if (!this.retired && this.polling && failedRead) {
          const recovered = failedRead; failedRead = null;
          notify(onRecovered, recovered);
        }
      } catch (error) {
        if (!this.retired) {
          const recoverable = networkFailures.has(error) || (error instanceof OnlineRoomError
            && (error.status === 408 || error.status === 429 || (error.status >= 500 && error.status < 600)));
          failedRead = recoverable ? error : null;
          notify(onError, error, { recoverable });
        }
      }
      if (!this.retired && this.polling) this.pollTimer = setTimeout(tick, intervalMs);
    };
    this.pollTimer = setTimeout(tick, intervalMs);
  }
  dispose() {
    if (this.retired) return;
    this.retired = true; this.polling = false;
    clearTimeout(this.pollTimer);
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear(); this.listeners.clear();
  }
}
