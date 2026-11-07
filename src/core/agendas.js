// H2: seeded daily intentions. Pure data; movement belongs to the existing walk solver.
export const AGENDA_IDENTITIES = Object.freeze([
  'suit', 'hi-vis', 'child-backpack', 'elder-cane', 'jogger', 'cyclist', 'coat-bag', 'summer-dress',
]);
const WORK = Object.freeze({ suit: 'office', 'hi-vis': 'site', 'child-backpack': 'school',
  'elder-cane': 'park', jogger: 'park', cyclist: 'office', 'coat-bag': 'shop', 'summer-dress': 'cafe' });
const VERBS = Object.freeze({ home: 'At home', commute: 'Commuting', work: 'Working',
  school: 'At school', lunch: 'Getting lunch', errands: 'Running errands', leisure: 'Taking time out' });
function hash(text) {
  let n = 2166136261;
  for (const c of String(text)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
const mod = (n, d) => ((n % d) + d) % d;

// Sibling capability: road collision consumers deliberately strip transit metadata.
const transitProviders = new WeakMap();
export function publishAgendaTransit(city, provider) { transitProviders.set(city, provider); }
export function agendaTransit(city) { return transitProviders.get(city)?.() ?? []; }
export function tramCapability(tram, city) {
  const item = tram.item, vertical = item.axis === 'v';
  const along = item.from + (item.to - item.from) * tram.t;
  const stops = city.transit.filter(s => s.kind === 'stop'
    && Math.abs(vertical ? s.x - item.x : s.z - item.z) < 14)
    // Wait beside the end door, clear of the stop's shelter and pylon footprint.
    .map(s => ({ id: `stop:${s.x}:${s.z}`, x: s.x + (vertical ? 0 : 5.5), z: s.z + (vertical ? 5.5 : 0),
      along: vertical ? s.z : s.x, side: Math.sign(vertical ? s.x - item.x : s.z - item.z) }));
  const stop = stops.find(s => Math.abs(s.along - along) < .05);
  const berthed = stop && tram.speed === 0 && tram.dwellTimer > 0
    && Math.abs((tram.lastStopAlong ?? Infinity) - along) < .05;
  const open = berthed && tram.doorRig?.open >= .95 && tram.doorRig.side === stop.side;
  return { id: `tram:${item.axis}:${vertical ? item.x : item.z}`, stops,
    x: vertical ? item.x : along, z: vertical ? along : item.z,
    stopId: berthed ? stop.id : null, doorSide: berthed ? stop.side : 0,
    phase: open ? 'doors-open' : berthed && tram.dwellTimer < .6 ? 'departing' : 'arriving',
    boardSlot: berthed ? { x: stop.x, z: stop.z } : null,
    alightSlot: berthed ? { x: stop.x, z: stop.z } : null };
}

export function agendaPlaces(city) {
  const places = { home: [], office: [], site: [], school: [], park: [], shop: [], cafe: [], tram: [], beach: [], venue: [] };
  for (const p of [...Object.values(city?.parcels ?? {}), ...(city?.civicUses ?? [])]) {
    if (!Number.isFinite(p.centre?.x) || !Number.isFinite(p.centre?.z)) continue;
    const use = p.useId ?? p.landUseId ?? p.archetypeId ?? '';
    const point = { id: p.id, x: p.centre.x, z: p.centre.z, label: p.label ?? use.replaceAll('-', ' ') };
    if (p.sector === 'residential') places.home.push(point);
    if (/office|exchange/.test(use) || p.sector === 'office') places.office.push(point);
    if (/factory|warehouse|works|port/.test(use) || p.sector === 'industrial') places.site.push(point);
    if (/school|childcare/.test(use)) places.school.push(point);
    if (/park|reserve|garden|recreation/.test(use)) places.park.push(point);
    if (/shop|supermarket|retail|hammerbarn/.test(use) || p.sector === 'retail') places.shop.push(point);
    if (/cafe/.test(use)) places.cafe.push(point);
    if (/interchange|station/.test(use)) places.tram.push(point);
    if (/stadium|arena|theatre|venue|recreation/.test(use)) places.venue.push(point);
  }
  if (city?.reserve?.centre) places.park.push({ id: city.reserve.id ?? 'reserve', ...city.reserve.centre, label: 'Park' });
  // The shore is a real destination even though it is outside tradeable parcels.
  if (city?.extent && city?.waterEdge) {
    const { x, z } = city.extent, edge = city.waterEdge;
    places.beach.push({ id: 'beach', label: 'Beach',
      x: edge === 'east' ? x + 8 : edge === 'west' ? -8 : x / 2,
      z: edge === 'south' ? z + 8 : edge === 'north' ? -8 : z / 2 });
  }
  for (const rows of Object.values(places)) rows.sort((a, b) => a.id.localeCompare(b.id));
  return places;
}

export function createAgenda(city, actor, places = agendaPlaces(city)) {
  const id = actor.id, seed = `${city?.seed ?? 0}:${id}:agenda`;
  const identity = AGENDA_IDENTITIES.includes(actor.pedestrianVariant) ? actor.pedestrianVariant
    : ({ 'cheap-builder': 'hi-vis', family: 'child-backpack', architect: 'coat-bag' }[actor.archetypeId] ?? 'suit');
  const fallback = { id: null, label: 'Neighbourhood', x: actor.homeX ?? actor.x ?? 0, z: actor.homeZ ?? actor.z ?? 0 };
  const choose = (kind) => {
    const rows = places[kind] ?? [];
    return Object.freeze({ ...(rows[hash(`${seed}:${kind}`) % Math.max(1, rows.length)] ?? fallback), kind });
  };
  const destinations = Object.fromEntries(Object.keys(places).map(kind => [kind, choose(kind)]));
  // Preserve authored residents' home and workplace when those parcels exist.
  for (const [kind, parcelId] of [['home', actor.homeParcelId], [WORK[identity], actor.workParcelId ?? actor.jobParcelId]]) {
    const p = city?.parcels?.[parcelId];
    if (p?.centre) destinations[kind] = Object.freeze({ id: p.id, ...p.centre, label: p.archetypeId, kind });
  }
  return Object.freeze({ id, identity, seed, shift: hash(`${seed}:shift`) % 3 - 1,
    mode: identity === 'cyclist' ? 'cycle' : ['walk', 'walk', 'tram', 'cybercab'][hash(`${seed}:mode`) % 4],
    homeParcelId: destinations.home.id, workParcelId: destinations[WORK[identity]].id,
    destinations: Object.freeze(destinations) });
}

export function agendaAt(plan, absoluteBeat, { weather = '', events = [] } = {}) {
  const day = Math.floor(absoluteBeat / 24), hour = mod(absoluteBeat, 24);
  const weekend = mod(day, 7) >= 5;
  const wet = /rain|storm|wet/.test(typeof weather === 'string' ? weather : weather?.state ?? '');
  const h = mod(hour - plan.shift, 24);
  let activity = h < 6 || h >= 21 ? 'home' : h < 8 ? 'commute' : h < 12 ? 'work'
    : h < 14 ? 'lunch' : h < 17 ? 'work' : h < 18 ? 'errands' : h < 20 ? 'leisure' : 'commute';
  let kind = WORK[plan.identity];
  if (weekend && (activity === 'work' || activity === 'commute' && h < 8)) activity = 'leisure';
  if (activity === 'work' && plan.identity === 'child-backpack') activity = 'school';
  if (activity === 'work' && ['elder-cane', 'jogger'].includes(plan.identity)) activity = 'leisure';
  if (activity === 'home' || activity === 'commute' && h >= 20) kind = 'home';
  if (activity === 'lunch') kind = 'cafe';
  if (activity === 'errands') kind = 'shop';
  if (activity === 'leisure') kind = plan.identity === 'summer-dress' && !wet ? 'beach' : 'park';
  const event = (Array.isArray(events) ? events : []).find(e => e && e.active !== false
    && (e.startBeat == null || e.startBeat <= absoluteBeat) && (e.endBeat == null || e.endBeat >= absoluteBeat)
    && (e.venueId || e.venue || e.destination));
  if (event && activity === 'leisure' && hash(`${plan.seed}:${day}:event`) % 4 !== 0) kind = 'venue';
  let destination = plan.destinations[kind];
  if (kind === 'venue' && Number.isFinite(event?.destination?.x) && Number.isFinite(event?.destination?.z)) {
    destination = { ...event.destination, kind, label: event.label ?? 'Event', id: event.venueId ?? 'event' };
  }
  const mode = plan.mode === 'cycle' ? 'cycle' : wet && plan.mode === 'walk' ? 'tram' : plan.mode;
  const verb = plan.identity === 'jogger' && activity === 'leisure' ? 'Running in the park' : VERBS[activity];
  return Object.freeze({ beat: hour, day, weekend, activity, mode, destination,
    line: `${verb}${activity === 'commute' ? ` by ${mode}` : ''} · ${destination.label}` });
}

export function agendaDay(plan, day = 0, environment = {}) {
  return Array.from({ length: 24 }, (_, beat) => agendaAt(plan, day * 24 + beat, environment));
}
export function agendaDayLine(plan, day = 0, environment = {}) {
  return agendaDay(plan, day, environment).filter((row, i, rows) => i === 0 || row.activity !== rows[i - 1].activity)
    .map(row => `${String(row.beat).padStart(2, '0')} ${row.activity}`).join(' → ');
}
export function agendaHistogram(plans, beat, environment = {}) {
  const counts = {};
  for (const plan of plans) {
    const { activity } = agendaAt(plan, beat, environment);
    counts[activity] = (counts[activity] ?? 0) + 1;
  }
  return counts;
}

/** Presentation residents beyond the mesh budget carry plans, never figure geometry. */
export function createAgendaPopulation(city, actors, count = 208) {
  const places = agendaPlaces(city);
  const plans = actors.map(actor => createAgenda(city, actor, places));
  for (let i = plans.length; i < Math.max(actors.length, count); i++) {
    plans.push(createAgenda(city, { id: `resident:coarse-${i}`,
      pedestrianVariant: AGENDA_IDENTITIES[i % AGENDA_IDENTITIES.length] }, places));
  }
  return plans;
}
