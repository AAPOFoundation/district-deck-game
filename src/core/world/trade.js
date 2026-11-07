// District Deck — deterministic world trade weather. No city engine imports.

import {
  appendWorldLog,
  CREDIT_ROUTE_ID,
  booksGuardedByStationedChokes,
  creditOffer,
  WORLD_PULSE_BOOKS,
  WORLD_PULSE_TYPES,
  WORLD_ROUTE_STATUSES,
  WORLD_TRADE_BY_ID,
  WORLD_TRADE_ROUTES,
} from './catalog.js';
import { worldStream } from './seed.js';

const ROUTE_STATUS_SET = new Set(WORLD_ROUTE_STATUSES);
const PULSE_SET = new Set(WORLD_PULSE_TYPES);

const PULSE_DURATION = Object.freeze({
  'oil-embargo': 4,
  'china-quota': 4,
  'war-asylum': 5,
  'open-boom': 3,
});

const PULSE_REGISTER = Object.freeze({
  'oil-embargo': 'Hormuz books shut. Crude for the inner works is a rumour.',
  'china-quota': 'Guangzhou and Hong Kong hold crates. Quotes in Melbourne go up.',
  'war-asylum': 'Guns on the Levant desk. Asylum books steam south.',
  'open-boom': 'Every flag is a working flag. The inner city eats well.',
});

function requireRouteStatus(status) {
  if (!ROUTE_STATUS_SET.has(status)) {
    throw new RangeError(`Unsupported world route status: ${status}`);
  }
  return status;
}

export function emptyWorldRoutes() {
  const routes = {};
  for (const route of WORLD_TRADE_ROUTES) {
    routes[route.id] = freezeRoute({
      id: route.id,
      status: 'closed',
      opened: false,
      untilBeat: null,
    });
  }
  return routes;
}

export function restoreWorldRoutes(routes) {
  if (!routes || typeof routes !== 'object' || Array.isArray(routes)) {
    throw new TypeError('World routes must be a record.');
  }
  const restored = {};
  for (const route of WORLD_TRADE_ROUTES) {
    const row = routes[route.id];
    if (row == null) {
      restored[route.id] = freezeRoute({
        id: route.id,
        status: 'closed',
        opened: false,
        untilBeat: null,
      });
      continue;
    }
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new TypeError(`World route ${route.id} must be an object.`);
    }
    restored[route.id] = freezeRoute({
      id: route.id,
      status: requireRouteStatus(row.status),
      opened: Boolean(row.opened),
      untilBeat: row.untilBeat == null ? null : requireNonNegativeInt(row.untilBeat, `${route.id}.untilBeat`),
      principal: Number.isInteger(row.principal) ? row.principal : 0,
      installment: Number.isInteger(row.installment) ? row.installment : 0,
      remaining: Number.isInteger(row.remaining) ? row.remaining : 0,
    });
  }
  return restored;
}

function freezeRoute(row) {
  return Object.freeze({
    id: row.id,
    status: row.status,
    opened: Boolean(row.opened),
    untilBeat: row.untilBeat ?? null,
    principal: Number.isInteger(row.principal) ? row.principal : 0,
    installment: Number.isInteger(row.installment) ? row.installment : 0,
    remaining: Number.isInteger(row.remaining) ? row.remaining : 0,
  });
}

function requireNonNegativeInt(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
  return value;
}

export function restoreWorldPulses(pulses) {
  if (!Array.isArray(pulses)) throw new TypeError('World pulses must be an array.');
  return pulses.map((pulse, index) => {
    if (!pulse || typeof pulse !== 'object' || Array.isArray(pulse)) {
      throw new TypeError(`World pulse ${index} must be an object.`);
    }
    if (!PULSE_SET.has(pulse.type)) {
      throw new RangeError(`Unsupported world pulse type: ${pulse.type}`);
    }
    return Object.freeze({
      id: String(pulse.id),
      type: pulse.type,
      beat: requireNonNegativeInt(pulse.beat, `pulse ${index} beat`),
      untilBeat: requireNonNegativeInt(pulse.untilBeat, `pulse ${index} untilBeat`),
      register: String(pulse.register ?? PULSE_REGISTER[pulse.type]),
    });
  });
}

function makePulse(worldSeed, beat, type) {
  const untilBeat = beat + PULSE_DURATION[type];
  return Object.freeze({
    id: `pulse-${type}-${beat}`,
    type,
    beat,
    untilBeat,
    register: PULSE_REGISTER[type],
  });
}

function applyPulseToRoutes(routes, pulse, escortedBooks = new Set(), guardedBooks = new Set()) {
  const next = { ...routes };
  const duration = Math.max(1, pulse.untilBeat - pulse.beat);
  const embargo = (id) => {
    const prior = next[id];
    const escorted = prior?.status === 'open' && escortedBooks.has(id);
    const guarded = prior?.status === 'open' && guardedBooks.has(id);
    let untilBeat = pulse.untilBeat;
    if (escorted) untilBeat = pulse.beat + 1;
    else if (guarded) untilBeat = pulse.beat + Math.max(1, Math.floor(duration / 2));
    next[id] = freezeRoute({
      ...prior,
      id,
      status: 'embargoed',
      opened: Boolean(prior?.opened),
      untilBeat,
    });
  };
  const openAll = () => {
    for (const route of WORLD_TRADE_ROUTES) {
      if (route.loan) continue;
      if (!WORLD_TRADE_BY_ID[route.id].playerOpenable && route.id !== 'asylum-levant-melbourne') continue;
      next[route.id] = freezeRoute({
        ...next[route.id],
        id: route.id,
        status: 'open',
        opened: true,
        untilBeat: null,
      });
    }
  };

  if (pulse.type === 'oil-embargo' || pulse.type === 'china-quota') {
    for (const id of WORLD_PULSE_BOOKS[pulse.type] ?? []) embargo(id);
  }
  if (pulse.type === 'war-asylum') {
    for (const id of WORLD_PULSE_BOOKS['war-asylum'] ?? []) {
      next[id] = Object.freeze({
        id,
        status: 'open',
        opened: true,
        untilBeat: pulse.untilBeat,
      });
    }
  }
  if (pulse.type === 'open-boom') openAll();
  return next;
}

function escortedBookIds(world, routes) {
  const navyCount = world.forces?.navy ?? 0;
  return new Set((world.requests ?? [])
    .filter((request) => {
      if (request?.kind !== 'escort') return false;
      if (!Number.isInteger(request.index) || request.index < 0 || request.index >= navyCount) {
        return false;
      }
      const route = WORLD_TRADE_BY_ID[request.book];
      const seaBook = route?.kind === 'steamer' || route?.kind === 'tanker';
      return seaBook && routes?.[request.book]?.status === 'open';
    })
    .map((request) => request.book));
}

function expireRoutes(routes, beat) {
  const next = { ...routes };
  for (const route of WORLD_TRADE_ROUTES) {
    const row = next[route.id];
    if (row.untilBeat != null && beat >= row.untilBeat) {
      next[route.id] = freezeRoute({
        ...row,
        id: route.id,
        status: row.opened ? 'open' : 'closed',
        opened: Boolean(row.opened),
        untilBeat: null,
      });
    }
  }
  return next;
}

/** Opening weather only. Never call mid-beat; the stored pulses array is the freeze. */
export function rollOpeningPulse(worldSeed) {
  const rng = worldStream(worldSeed, 'trade:opening');
  const roll = rng.int(0, 99);
  if (roll < 26) return makePulse(worldSeed, 0, 'oil-embargo');
  if (roll < 48) return makePulse(worldSeed, 0, 'china-quota');
  if (roll < 64) return makePulse(worldSeed, 0, 'war-asylum');
  return null;
}

export function pulseForBeat(world, beat = world?.beat ?? 0) {
  return (world?.pulses ?? []).find((pulse) => pulse.beat === beat) ?? null;
}

export function seedWorldTrade(worldSeed) {
  const pulse = rollOpeningPulse(worldSeed);
  const pulses = pulse ? [pulse] : [];
  let routes = emptyWorldRoutes();
  if (pulse) routes = applyPulseToRoutes(routes, pulse);
  return {
    routes,
    pulses,
    log: pulses.map((entry) => Object.freeze({
      beat: 0,
      type: entry.type,
      body: entry.register,
    })),
  };
}

/** Per-100 incidence at the `trade:beat:{beat}` gate. A standing NUKE halves it. */
export const WORLD_PULSE_CHANCE = 38;
export const NUKE_PULSE_CHANCE = 19;

export function nukeDeterrenceActive(world) {
  return (world?.forces?.nuke ?? 0) > 0;
}

export function pulseChanceFor(world) {
  return nukeDeterrenceActive(world) ? NUKE_PULSE_CHANCE : WORLD_PULSE_CHANCE;
}

export function holdOpenBooks(routes, bookIds, untilBeat) {
  const next = { ...routes };
  for (const id of bookIds ?? []) {
    const prior = next[id];
    if (!prior || prior.status !== 'open') continue;
    next[id] = freezeRoute({
      ...prior,
      id,
      status: 'held',
      opened: true,
      untilBeat,
    });
  }
  return next;
}

export function advanceWorldTrade(world, options = {}) {
  const beat = world.beat + 1;
  let routes = expireRoutes(world.routes, beat);
  const live = (world.pulses ?? []).filter((pulse) => beat < pulse.untilBeat);
  const already = (world.pulses ?? []).find((pulse) => pulse.beat === beat) ?? null;
  const skipPulseDesks = options.skipPulseDesks instanceof Set
    ? options.skipPulseDesks
    : new Set(options.skipPulseDesks ?? []);
  let pulse = already;
  if (!pulse) {
    const rng = worldStream(world.worldSeed, `trade:beat:${beat}`);
    const busy = live.length > 0;
    if (!busy && rng.int(0, 99) < pulseChanceFor(world)) {
      const pick = rng.int(0, 99);
      const type = pick < 30 ? 'oil-embargo'
        : pick < 55 ? 'china-quota'
          : pick < 78 ? 'war-asylum'
            : 'open-boom';
      const blocked = skipPulseDesks.size > 0 && type !== 'open-boom' && (WORLD_PULSE_BOOKS[type] ?? []).some((id) => {
        const spec = WORLD_TRADE_BY_ID[id];
        return spec && (skipPulseDesks.has(spec.from) || skipPulseDesks.has(spec.to));
      });
      if (!blocked) {
        pulse = makePulse(world.worldSeed, beat, type);
        routes = applyPulseToRoutes(
          routes,
          pulse,
          escortedBookIds(world, routes),
          booksGuardedByStationedChokes(world.ambition?.stationedChokepoints),
        );
      }
    }
  }
  const pulses = pulse && !already ? [...live, pulse] : live;
  const log = appendWorldLog(world.log, pulse && !already
    ? Object.freeze({
      beat,
      type: pulse.type,
      body: pulse.register,
    })
    : null);
  const loaned = tickLoan(world, routes);
  return {
    ...world,
    beat,
    treasuryCash: loaned.treasuryCash,
    routes: loaned.routes,
    pulses,
    log,
  };
}

function tickLoan(world, routes) {
  const row = routes[CREDIT_ROUTE_ID];
  if (!row || row.status !== 'open' || !row.remaining) {
    return { routes, treasuryCash: world.treasuryCash ?? 0 };
  }
  const due = Math.min(row.installment, row.remaining);
  const cash = world.treasuryCash ?? 0;
  if (cash < due) {
    return { routes, treasuryCash: cash };
  }
  const remaining = row.remaining - due;
  const nextRow = remaining <= 0
    ? freezeRoute({
      id: CREDIT_ROUTE_ID,
      status: 'closed',
      opened: true,
      untilBeat: null,
      principal: 0,
      installment: 0,
      remaining: 0,
    })
    : freezeRoute({ ...row, remaining });
  return {
    routes: { ...routes, [CREDIT_ROUTE_ID]: nextRow },
    treasuryCash: cash - due,
  };
}

export function routeIsOpen(world, routeId) {
  return world.routes?.[routeId]?.status === 'open';
}

function campusSeatsLive(world) {
  const ambition = world?.ambition ?? {};
  const appliedBeat = ambition.lastLedgerAppliedBeat;
  const beat = world?.beat ?? 0;
  if (!ambition.lastLedgerApplied || !Number.isInteger(appliedBeat)) return 0;
  // Lockstep with INSTITUTION_STALE_BEATS (ambition.js): applied ledger older than 8 beats is empty.
  if (beat - appliedBeat < 0 || beat - appliedBeat > 8) return 0;
  const seats = ambition.educationSeats;
  return Number.isInteger(seats) && seats > 0 ? seats : 0;
}

export function canOpenTradeRoute(world, routeId) {
  const spec = WORLD_TRADE_BY_ID[routeId];
  if (!spec) return { ok: false, fee: 0, reason: 'No such book.' };
  if (!spec.playerOpenable) {
    return { ok: false, fee: spec.openFee, reason: 'This book opens only with the war pulse.' };
  }
  const row = world.routes?.[routeId];
  if (!row) return { ok: false, fee: spec.openFee, reason: 'No such book.' };
  if (row.status === 'open') {
    return { ok: false, fee: spec.openFee, reason: 'This book is already working.' };
  }
  if (row.status === 'embargoed') {
    return { ok: false, fee: spec.openFee, reason: 'Embargoed. Wait the beat.' };
  }
  if (row.status === 'held') {
    return { ok: false, fee: spec.openFee, reason: 'Held. Nature has the book.' };
  }
  if (row.status === 'cut') {
    return { ok: false, fee: spec.openFee, reason: 'The line is cut.' };
  }
  if (world.treasuryCash < spec.openFee) {
    return {
      ok: false,
      fee: spec.openFee,
      reason: `Head office needs $${spec.openFee.toLocaleString('en-AU')}.`,
    };
  }
  if (spec.requiresCampus && campusSeatsLive(world) < 1) {
    return { ok: false, fee: spec.openFee, reason: 'The city has no campus.' };
  }
  return { ok: true, fee: spec.openFee, reason: '' };
}

export function openTradeRoute(world, routeId) {
  const check = canOpenTradeRoute(world, routeId);
  if (!check.ok) return { ok: false, world, fee: check.fee, reason: check.reason };
  const spec = WORLD_TRADE_BY_ID[routeId];
  const routes = { ...world.routes };
  let treasuryCash = world.treasuryCash - check.fee;
  let openedRow = {
    id: routeId,
    status: 'open',
    opened: true,
    untilBeat: null,
    principal: 0,
    installment: 0,
    remaining: 0,
  };
  let body = `${spec.good} book opened from ${spec.from}.`;
  if (spec.loan) {
    const offer = creditOffer(world);
    openedRow = {
      ...openedRow,
      principal: offer.principal,
      installment: offer.installment,
      remaining: offer.principal,
    };
    treasuryCash += offer.principal;
    body = `Sydney line of credit drawn. Principal $${offer.principal.toLocaleString('en-AU')}; repay $${offer.installment.toLocaleString('en-AU')} each beat for ${offer.termBeats} beats.`;
  }
  routes[routeId] = freezeRoute(openedRow);
  const log = appendWorldLog(world.log, Object.freeze({
    beat: world.beat,
    type: 'open-route',
    body,
  }));
  return {
    ok: true,
    fee: check.fee,
    reason: '',
    world: {
      ...world,
      treasuryCash,
      routes,
      log,
    },
  };
}
