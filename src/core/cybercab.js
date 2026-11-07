// Pure business reducer. Money is integer dollars; four simulation beats per quarter.
import { stream } from './rng.js';
import { CYBERCAB_SUPPLIER, arriveCybercabImports, assignCybercabYardBays } from './world/cybercab-supplier.js';

export const CYBERCAB_RULES = Object.freeze({
  price: 45000, cap: 12, beatsPerQuarter: 4, serviceBeats: 2,
  liftPrice: 12000, tyres: 1200, battery: 3500, software: 600,
});
export const CYBERCAB_FINANCIAL_ACTIONS = Object.freeze([
  'BUY_CAB', 'IMPORT_CAB', 'SERVICE_CAB', 'PATCH_SOFTWARE', 'DISMISS_INCIDENT',
  'UPGRADE_DEPOT', 'UPGRADE_CAB_BOOK', 'SET_CAB_DISPATCH', 'RUN_CAB_SHIFT',
]);
export const CYBERCAB_PRESENTATION_ACTIONS = Object.freeze(['CAB_PICKUP', 'CAB_DROPOFF', 'CYBERCAB_TICK']);
export const CYBERCAB_ACTIONS = Object.freeze([...CYBERCAB_FINANCIAL_ACTIONS, ...CYBERCAB_PRESENTATION_ACTIONS]);
// Game-balance assumptions, not a real-world taxi forecast. Four equal work
// blocks make one quarter; rendered journeys illustrate the fleet, not its book.
export const CYBERCAB_DISPATCH = Object.freeze({
  local: Object.freeze({ label: 'Neighbourhood', trips: 90, fare: 28, energy: 8,
    demand: 240, wear: Object.freeze({ tyres: 3, battery: 2, software: 4 }) }),
  airport: Object.freeze({ label: 'Airport', trips: 55, fare: 54, energy: 18,
    demand: 100, wear: Object.freeze({ tyres: 6, battery: 4, software: 5 }) }),
  rest: Object.freeze({ label: 'Reserve', trips: 0, fare: 0, energy: 0,
    demand: 0, wear: Object.freeze({ tyres: 0, battery: 0, software: 0 }) }),
});
export const CYBERCAB_STANDING_COST = 450;
export function validateCybercabEconomyVersion(version) {
  if (version !== undefined && version !== 1 && version !== 2) throw new RangeError('Unsupported Cybercab economy version.');
}
export function validateCybercabState(business) {
  if (!business) return;
  validateCybercabEconomyVersion(business.economyVersion);
  if (business.economyVersion === 2 && (!Number.isInteger(business.round) || business.round < 0 || business.round > 4
    || business.fleet.some(cab => !Object.hasOwn(CYBERCAB_DISPATCH, cab.dispatch)))) {
    throw new RangeError('Invalid Cybercab quarterly dispatch book.');
  }
}
// The primary book remains the renderer's compatibility surface. A second human
// gets an independent book; policy rivals retain their recorded legacy economy.
export function initialiseCybercabSeatBooks(state) {
  if (state.cybercab?.economyVersion !== 2 || !state.seats?.P2
    || state.seats.P2.kind === 'policy' || state.cybercabBySeat) return;
  state.cybercab.ownerSeatId = 'P1';
  const second = createCybercabState({ quarter: state.cybercab.quarter,
    districtId: state.cybercab.depot.districtId, parcelId: state.cybercab.depot.parcelId,
    starterFleet: true, economyVersion: 2 });
  second.ownerSeatId = 'P2';
  // An explicit legacy transition gives no second-seat back pay or old history.
  second.beat = state.cybercab.beat; second.round = state.cybercab.round;
  state.cybercabBySeat = { P2: second };
}

export function cybercabForOwner(state, owner = 'player') {
  if (owner === 'player') return state.cybercab;
  if (owner === 'P1') return state.cybercab?.economyVersion === 2 ? state.cybercab : null;
  if (owner === 'rival') return state.cybercabBySeat?.P2 ?? null;
  return state.cybercabBySeat?.[owner] ?? null;
}

export function validateCybercabRun(state) {
  validateCybercabState(state?.cybercab);
  if (!state?.cybercabBySeat) {
    if (state?.cybercab?.economyVersion === 2 && state.seats?.P2?.kind !== 'policy'
      && state.seats?.P2) throw new RangeError('Missing second-seat Cybercab book.');
    return;
  }
  if (Object.keys(state.cybercabBySeat).join(',') !== 'P2'
    || !state.seats?.P2 || state.seats.P2.kind === 'policy'
    || state.cybercab?.economyVersion !== 2 || state.cybercab.ownerSeatId !== 'P1') {
    throw new RangeError('Invalid Cybercab seat ownership.');
  }
  const second = state.cybercabBySeat.P2;
  validateCybercabState(second);
  if (second?.economyVersion !== 2 || second.ownerSeatId !== 'P2') throw new RangeError('Invalid second-seat Cybercab book.');
}

const clamp = n => Math.max(0, Math.min(100, n));
const rounded = n => Math.round(n * 10000) / 10000;
const money = n => Math.round(n);
const healthy = cab => Math.min(cab.tyres, cab.battery, cab.software) >= 30;
const quarterly = s => s.economyVersion === 2;
const workBeat = s => quarterly(s) ? (s.quarter - 1) * 4 + s.round : s.beat;

export function createCybercabState({ quarter = 1, districtId = 'richmond-flat', parcelId = null, starterFleet = false, economyVersion } = {}) {
  validateCybercabEconomyVersion(economyVersion);
  const state = {
    fleet: starterFleet ? [1, 2].map(n => ({ id: `cab-${n}`, tyres: 100, battery: 100, software: 100, distanceM: 0,
      status: 'idle', location: 'depot', haltUntil: -1, ride: null, lastFare: null, bay: null, basis: 0 })) : [], depot: { districtId, parcelId, lifts: 2, capacity: 4, basis: 0 }, queue: [],
    ledger: starterFleet ? [1, 2].map(n => ({ quarter, beat: (quarter - 1) * 4,
      kind: 'BUY_CAB', cabId: `cab-${n}`, amount: 0, basis: 0, paid: true, source: 'starter-fleet' })) : [], rating: 'A', supplier: { opened: false, openedQuarter: null, orders: [] },
    incidents: [], weeklyChart: [], fares: 0, costs: 0, paidCosts: 0,
    quarter, beat: (quarter - 1) * 4, lastSettledQuarter: quarter - 1,
    nextCabId: starterFleet ? 3 : 1, seenRides: {}, uptime: { available: 0, total: 0 },
  };
  if (economyVersion === 2) enableQuarterlyBook(state);
  return state;
}

// Explicit opt-in preserves an old quarter's posted money and already elapsed
// beats. It neither pays cash nor reruns old blocks, incidents or arrivals.
function enableQuarterlyBook(s) {
  s.economyVersion = 2;
  s.round = Math.max(0, Math.min(4, s.beat - (s.quarter - 1) * 4));
  s.blocks = []; s.sampleTrips = 0; s.sampleFare = 0;
  for (const cab of s.fleet) cab.dispatch = 'local';
}

export function cybercabDemand(seed, quarter, round) {
  return Object.fromEntries(['local', 'airport'].map(key => [key,
    Math.floor(CYBERCAB_DISPATCH[key].demand * stream(seed, `cybercab-demand:q${quarter}:b${round}:${key}`).int(85, 115) / 100),
  ]));
}

export function cybercabFare(distanceM, surge = false, maintenanceFactor = 1) {
  if (!Number.isFinite(distanceM) || distanceM < 0 || distanceM > 100000) return null;
  return money((8 + 2.4 * distanceM / 100) * (surge ? 1.5 : 1) * maintenanceFactor);
}

// One seeded roll per cab per quarter. Low bars raise both frequency and relevant weights.
export function cybercabIncidentOdds(cab) {
  const low = !healthy(cab);
  return { chance: low ? 0.8 : 0.025, weights: [
    { kind: 'virus', weight: cab.software < 30 ? 6 : 1 },
    { kind: 'accident', weight: cab.battery < 30 ? 5 : 1 },
    { kind: 'puncture', weight: cab.tyres < 30 ? 6 : 1 },
    { kind: 'clientele', weight: 1 },
  ] };
}

function charge(s, kind, cost, cabId = null, paid = false) {
  if (paid) s.paidCosts += cost;
  else s.costs += cost;
  s.ledger.push({ quarter: s.quarter, beat: workBeat(s), kind, cabId, amount: -cost, paid });
}

function startQueue(s) {
  const lifts = Math.min(s.depot.lifts, Math.ceil(s.fleet.filter(c => c.status !== 'shipping').length / 2));
  let active = s.queue.filter(job => job.startedBeat != null).length;
  for (const job of s.queue) {
    if (job.startedBeat != null || active >= lifts) continue;
    job.startedBeat = workBeat(s);
    job.finishBeat = workBeat(s) + job.duration;
    active++;
  }
}

function incident(s, cab, kind) {
  const id = `cybercab-${s.ownerSeatId ? `${s.ownerSeatId}-` : ''}${s.quarter}-${cab.id}`;
  const beat = workBeat(s);
  let cost = 0, refund = 0;
  if (kind === 'virus') {
    cost = 4000 + (cab.software < 30 ? 900 : 0);
    for (const c of s.fleet.filter(c => c.status !== 'shipping' && c.status !== 'yard')) c.haltUntil = Math.max(c.haltUntil, beat + 1);
  } else if (kind === 'accident') {
    cost = 6500;
    cab.status = 'repair'; cab.location = 'repair-shop'; cab.ride = null;
    s.queue.push({ cabId: cab.id, component: 'accident', duration: 4, startedBeat: null });
    startQueue(s);
  } else if (kind === 'puncture') {
    cost = 450; cab.haltUntil = Math.max(cab.haltUntil, beat + 1);
    cab.location = cab.tyres < 20 ? 'tow' : 'roadside';
  } else {
    cost = 300; refund = cab.lastFare?.quarter === s.quarter && !cab.lastFare.refunded ? cab.lastFare.amount : 0;
    if (refund) { cab.lastFare.refunded = true; s.fares -= refund; }
    cab.haltUntil = Math.max(cab.haltUntil, beat + 1);
  }
  charge(s, `cybercab-${kind}`, cost, cab.id);
  if (refund) s.ledger.push({ quarter: s.quarter, beat, kind: 'cybercab-refund', cabId: cab.id, amount: -refund });
  const row = { id, kind, cabId: cab.id, quarter: s.quarter, beat, cost, refund,
    tow: kind === 'puncture' && cab.tyres < 20, dismissed: false,
    ...(s.ownerSeatId ? { ownerSeatId: s.ownerSeatId } : {}) };
  s.incidents = [...s.incidents, row].slice(-8);
  return row;
}

function tick(s, seed) {
  s.beat++;
  for (const job of s.queue.filter(j => j.finishBeat <= s.beat)) {
    const cab = s.fleet.find(c => c.id === job.cabId);
    if (job.component !== 'accident') cab[job.component] = 100;
    cab.status = 'idle'; cab.location = 'depot';
  }
  s.queue = s.queue.filter(j => j.finishBeat == null || j.finishBeat > s.beat);
  startQueue(s);
  for (const order of s.supplier.orders) {
    if (order.status !== 'yard' || order.arrivedBeat >= s.beat) continue;
    order.status = 'delivered';
    const cab = s.fleet.find(c => c.id === order.cabId);
    cab.status = 'idle'; cab.location = 'depot'; cab.bay = null;
  }
  const events = [];
  for (const cab of s.fleet) {
    if (cab.status === 'shipping' || cab.status === 'yard') continue;
    s.uptime.total++;
    if (cab.status === 'repair' || cab.status === 'service' || cab.haltUntil >= s.beat) continue;
    s.uptime.available++;
    if (cab.location === 'roadside' || cab.location === 'tow') cab.location = 'depot';
    cab.tyres = rounded(clamp(cab.tyres - 1));
    cab.battery = rounded(clamp(cab.battery - 0.5));
    cab.software = rounded(clamp(cab.software - 4));
    if (s.beat % 4 !== 0) continue;
    const odds = cybercabIncidentOdds(cab);
    const rng = stream(seed, `cybercab:q${s.quarter}:${cab.id}`);
    if (rng.unit() < odds.chance) events.push(incident(s, cab, rng.weighted(odds.weights).kind));
  }
  return events;
}

function deliverYardCabs(s) {
  for (const order of s.supplier.orders) {
    if (order.status !== 'yard') continue;
    order.status = 'delivered';
    const cab = s.fleet.find(c => c.id === order.cabId);
    cab.status = 'idle'; cab.location = 'depot'; cab.bay = null;
  }
}

function runBlock(s, seed) {
  const round = s.round + 1, beat = (s.quarter - 1) * 4 + round;
  const demand = cybercabDemand(seed, s.quarter, round), events = [];
  deliverYardCabs(s);
  const arrived = s.fleet.filter(c => c.status !== 'shipping').sort((a, b) => a.id.localeCompare(b.id));
  const available = arrived.filter(c => !s.queue.some(j => j.cabId === c.id) && c.haltUntil < beat);
  const rows = [];
  for (const key of ['local', 'airport']) {
    const route = CYBERCAB_DISPATCH[key];
    const assigned = available.filter(c => c.dispatch === key);
    const capacities = assigned.map(c => Math.floor(route.trips * (healthy(c) ? 1 : .5)));
    const capacity = capacities.reduce((a, b) => a + b, 0), sold = Math.min(demand[key], capacity);
    let allocated = 0;
    const trips = capacities.map(value => { const n = capacity ? Math.floor(sold * value / capacity) : 0; allocated += n; return n; });
    // Stable remainder allocation; never issue more trips than demand/capacity.
    for (let i = 0; allocated < sold; i = (i + 1) % trips.length) {
      if (trips[i] < capacities[i]) { trips[i]++; allocated++; }
    }
    assigned.forEach((cab, i) => rows.push({ cabId: cab.id, dispatch: key, trips: trips[i],
      fare: route.fare, fares: trips[i] * route.fare, energy: trips[i] * route.energy }));
  }
  s.round = round;
  s.beat = Math.max(s.beat, beat);
  s.uptime.total += arrived.length;
  s.uptime.available += available.filter(c => c.dispatch !== 'rest').length;
  const costsBefore = s.costs, faresBefore = s.fares;
  for (const cab of arrived) {
    charge(s, 'cybercab-overhead', CYBERCAB_STANDING_COST, cab.id);
    const row = rows.find(r => r.cabId === cab.id);
    if (!row?.trips) continue;
    s.fares += row.fares;
    s.ledger.push({ kind: 'cybercab-contract', quarter: s.quarter, beat, ...row, amount: row.fares });
    charge(s, 'cybercab-energy', row.energy, cab.id);
    cab.lastFare = { amount: row.fare, quarter: s.quarter, refunded: false };
    const route = CYBERCAB_DISPATCH[cab.dispatch];
    for (const key of ['tyres', 'battery', 'software']) cab[key] = rounded(clamp(cab[key] - route.wear[key]));
  }
  // A two-block service misses both blocks, then returns for the next block.
  for (const job of s.queue.filter(j => j.finishBeat != null && j.finishBeat <= beat)) {
    const cab = s.fleet.find(c => c.id === job.cabId);
    if (job.component !== 'accident') cab[job.component] = 100;
    cab.status = 'idle'; cab.location = 'depot';
  }
  s.queue = s.queue.filter(j => j.finishBeat == null || j.finishBeat > beat);
  startQueue(s);
  if (round === 4) for (const cab of available.filter(c => c.dispatch !== 'rest')) {
    const odds = cybercabIncidentOdds(cab), rng = stream(seed, `cybercab:q${s.quarter}:${cab.id}`);
    if (rng.unit() < odds.chance) events.push(incident(s, cab, rng.weighted(odds.weights).kind));
  }
  s.blocks = [...s.blocks, { quarter: s.quarter, round, demand, cabs: rows,
    fares: s.fares - faresBefore, costs: s.costs - costsBefore,
    trips: rows.reduce((n, r) => n + r.trips, 0) }].slice(-4);
  return events;
}

export function reduceCybercab(prior, action, { seed = 0, quarter = prior?.quarter ?? 1, cash = 0 } = {}) {
  const original = prior ?? createCybercabState({ quarter });
  const fail = reason => ({ state: original, rejected: true, reason, cashDelta: 0, events: [] });
  if (!Number.isFinite(cash)) return fail('Cash must be finite.');
  if (!CYBERCAB_ACTIONS.includes(action?.type)) return fail('Unknown cybercab action.');
  try { validateCybercabState(original); } catch (error) { return fail(error.message); }
  if (quarter !== original.quarter) return fail('Cybercab quarter is not current.');
  const s = structuredClone(original);
  assignCybercabYardBays(s);
  let cost = 0;
  const cab = s.fleet.find(c => c.id === action.cabId);
  const events = [];
  if (action.type === 'UPGRADE_CAB_BOOK') {
    if (quarterly(s)) return fail('Quarterly dispatch is already active.');
    enableQuarterlyBook(s);
  } else if (action.type === 'SET_CAB_DISPATCH') {
    if (!quarterly(s)) return fail('Start quarterly dispatch first.');
    if (!cab || !Object.hasOwn(CYBERCAB_DISPATCH, action.dispatch)) return fail('Choose a cab and a dispatch route.');
    if (s.round === 4) return fail('All four blocks are complete. Settle before changing dispatch.');
    if (cab.dispatch === action.dispatch) return fail('This dispatch route is already selected.');
    cab.dispatch = action.dispatch;
  } else if (action.type === 'RUN_CAB_SHIFT') {
    if (!quarterly(s)) return fail('Start quarterly dispatch first.');
    if (!Number.isInteger(action.round) || action.round !== s.round + 1 || action.round > 4) return fail('Choose the next work block of this quarter.');
    events.push(...runBlock(s, seed));
  } else if (['BUY_CAB', 'IMPORT_CAB'].includes(action.type)) {
    if (s.fleet.length >= Math.min(12, s.depot.capacity)) return fail('Depot capacity reached. Add a lift.');
    const imported = action.type === 'IMPORT_CAB';
    cost = imported ? CYBERCAB_SUPPLIER.unitPrice : CYBERCAB_RULES.price;
    if (cash < cost) return fail('Not enough cash for a cybercab.');
    const id = `cab-${s.nextCabId++}`;
    s.fleet.push({ id, tyres: 100, battery: 100, software: 100, distanceM: 0,
      status: imported ? 'shipping' : 'idle', location: imported ? 'sea' : 'depot',
      haltUntil: -1, ride: null, lastFare: null, bay: null, basis: cost });
    if (quarterly(s)) s.fleet.at(-1).dispatch = 'local';
    if (imported) {
      s.supplier.opened = true; s.supplier.openedQuarter ??= quarter;
      s.supplier.orders.push({ id: `import-${id}`, cabId: id, supplierId: CYBERCAB_SUPPLIER.id,
        boughtQuarter: quarter, arrivalQuarter: quarter + 1, status: 'shipping' });
    }
  } else if (action.type === 'UPGRADE_DEPOT') {
    if (s.depot.capacity >= 12) return fail('Fleet capacity is already twelve.');
    cost = CYBERCAB_RULES.liftPrice;
    if (cash < cost) return fail('Not enough cash for a depot lift.');
    s.depot.lifts++; s.depot.capacity = Math.min(12, 2 + s.depot.lifts); s.depot.basis += cost;
  } else if (['SERVICE_CAB', 'PATCH_SOFTWARE'].includes(action.type)) {
    const component = action.type === 'PATCH_SOFTWARE' ? 'software' : action.component;
    if (!['tyres', 'battery', 'software'].includes(component)) return fail('Choose tyres, battery or software.');
    if (!cab || !(quarterly(s) ? ['idle', 'carry'].includes(cab.status) : cab.status === 'idle')
      || cab.haltUntil > workBeat(s) || (!quarterly(s) && cab.ride)) return fail('Cab is unavailable for service.');
    if (cab[component] >= 100) return fail('This component needs no service.');
    cost = CYBERCAB_RULES[component];
    if (cash < cost) return fail('Not enough cash for service.');
    cab.status = 'service'; cab.location = 'repair-shop';
    if (quarterly(s)) cab.ride = null;
    s.queue.push({ cabId: cab.id, component, duration: 2, startedBeat: null });
    startQueue(s);
  } else if (action.type === 'DISMISS_INCIDENT') {
    const row = s.incidents.find(i => i.id === action.incidentId);
    if (!row || row.dismissed) return fail('No open incident with that ID.');
    row.dismissed = true;
  } else if (action.type === 'CYBERCAB_TICK') {
    if (action.beat !== s.beat + 1 || action.beat > quarter * 4) return fail('Beat must be the next beat of this quarter.');
    if (quarterly(s)) { s.beat++; deliverYardCabs(s); }
    else events.push(...tick(s, seed));
  } else {
    if (!cab || cab.haltUntil > s.beat || !['idle', 'carry'].includes(cab.status)) return fail('Cab cannot carry passengers now.');
    if (typeof action.rideId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(action.rideId)) return fail('A stable ride ID is required.');
    if (action.type === 'CAB_PICKUP') {
      if (cab.ride || Object.hasOwn(s.seenRides, action.rideId)) return fail('Ride already started or completed.');
      Object.defineProperty(s.seenRides, action.rideId, {
        value: 'pickup', enumerable: true, writable: true, configurable: true,
      });
      cab.ride = { id: action.rideId, surge: action.surge === true, factor: healthy(cab) ? 1 : 0.5 };
      cab.status = 'carry'; cab.location = 'road';
    } else {
      if (cab.ride?.id !== action.rideId) return fail('Drop-off requires this cab’s pickup.');
      const fare = cybercabFare(action.distanceM, cab.ride.surge, cab.ride.factor);
      if (fare == null) return fail('Ride distance must be 0–100000 metres.');
      if (quarterly(s)) {
        s.sampleTrips++; s.sampleFare = fare;
        cab.ride = null; cab.status = 'idle'; s.seenRides[action.rideId] = 'complete';
        return { state: s, cashDelta: 0, rejected: false, events: [] };
      }
      s.fares += fare; cab.distanceM += action.distanceM;
      cab.tyres = rounded(clamp(cab.tyres - action.distanceM / 40000));
      cab.battery = rounded(clamp(cab.battery - action.distanceM / 200000));
      cab.lastFare = { amount: fare, quarter, refunded: false };
      cab.ride = null; cab.status = 'idle'; s.seenRides[action.rideId] = 'complete';
      const row = { kind: 'cybercab-fare', cabId: cab.id, rideId: action.rideId, amount: fare, quarter, beat: s.beat };
      s.ledger.push(row); events.push(row);
    }
  }
  if (cost) charge(s, action.type, cost, cab?.id ?? s.fleet.at(-1)?.id, true);
  return { state: s, cashDelta: cost ? -cost : 0, rejected: false, events };
}

// A local renderer acknowledgement, never a canonical action or network request.
// The returned wrapper/book is detached before the renderer attaches ride poses.
export function reduceCybercabPresentation(view, action) {
  if (view?.cybercab?.economyVersion !== 2 || !CYBERCAB_PRESENTATION_ACTIONS.includes(action?.type)) {
    return { state: view, rejected: true, reason: 'Not a quarterly presentation notification.' };
  }
  const result = reduceCybercab(view.cybercab, action,
    { seed: view.seed, quarter: view.quarter, cash: 0 });
  if (result.rejected) return { ...result, state: view };
  return { state: { ...view, cybercab: result.state }, rejected: false, cashDelta: 0, events: [] };
}

export function settleCybercab(prior, { seed = 0, quarter = prior?.quarter ?? 1 } = {}) {
  const s = structuredClone(prior ?? createCybercabState({ quarter }));
  validateCybercabState(s);
  const empty = { fares: 0, costs: 0, paidCosts: 0, net: 0, cashDelta: 0 };
  if (s.lastSettledQuarter >= quarter) return { state: s, events: [], ...empty };
  if (s.quarter !== quarter) throw new RangeError('Cybercab settlement must be sequential.');
  const events = [];
  if (quarterly(s)) { while (s.round < 4) events.push(...runBlock(s, seed)); }
  else while (s.beat < quarter * 4) events.push(...tick(s, seed));
  const incidents = s.ledger.filter(r => r.quarter === quarter && ['cybercab-virus', 'cybercab-accident', 'cybercab-puncture', 'cybercab-clientele'].includes(r.kind)).length;
  const uptime = s.uptime.total ? s.uptime.available / s.uptime.total : 1;
  const score = Math.max(0, uptime - incidents / Math.max(1, s.fleet.length) * 0.15);
  s.rating = score >= 0.95 ? 'A' : score >= 0.8 ? 'B' : score >= 0.65 ? 'C' : score >= 0.45 ? 'D' : 'E';
  const capitalPaid = quarterly(s) ? Math.max(0, -s.ledger.filter(r => r.quarter === quarter && r.paid
    && ['BUY_CAB', 'IMPORT_CAB', 'UPGRADE_DEPOT'].includes(r.kind)).reduce((n, r) => n + r.amount, 0)) : 0;
  const row = { quarter, fares: s.fares, costs: s.costs, paidCosts: s.paidCosts,
    net: s.fares - s.costs - (s.paidCosts - capitalPaid), cashDelta: s.fares - s.costs,
    ...(quarterly(s) ? { economyVersion: 2, capitalPaid, servicePaid: s.paidCosts - capitalPaid,
      cashMovement: s.fares - s.costs - s.paidCosts } : {}),
    uptime, incidents, rating: s.rating };
  s.weeklyChart = [...s.weeklyChart, row].slice(-52);
  s.lastSettledQuarter = quarter; s.quarter = quarter + 1;
  s.fares = 0; s.costs = 0; s.paidCosts = 0; s.uptime = { available: 0, total: 0 };
  if (quarterly(s)) { s.round = 0; s.sampleTrips = 0; s.sampleFare = 0; }
  events.push(...arriveCybercabImports(s, quarter + 1).map(row => s.ownerSeatId
    ? { ...row, id: `${s.ownerSeatId}:${row.id}`, ownerSeatId: s.ownerSeatId } : row));
  return { state: s, events, ...row };
}

export function cybercabIncomeLine(state, districtId = state.cybercab?.depot.districtId) {
  const b = state.cybercab;
  const row = b?.weeklyChart.at(-1);
  return { id: 'cybercab-income', label: 'cybercab income', districtId,
    amount: b?.depot.districtId === districtId ? (row?.fares ?? 0) - (row?.costs ?? 0) : 0,
    faresToday: b?.fares ?? 0, rating: b?.rating ?? 'A' };
}
