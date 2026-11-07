// Off-board Melbourne venues: purchasable airport, port and event-ticket assets.
// Pure. No THREE. Render reads visibility; economy reads civicUpgradeValueBp (which calls here).

import { TILES_PER_BLOCK, globalTile, parseParcelId } from './grid.js';
import { activeParcel } from './city.js';

const OPPOSITE = Object.freeze({
  north: 'south', south: 'north', east: 'west', west: 'east',
});

export const FRINGE_VENUE_IDS = Object.freeze([
  'buy', 'rail-link', 'hotel', 'terminal',
  'rod-laver', 'grand-prix', 'falls-creek', 'port',
]);

export const FRINGE_VENUE_COSTS = Object.freeze({
  buy: 220_000,
  'rail-link': 160_000,
  hotel: 140_000,
  terminal: 180_000,
  'rod-laver': 90_000,
  'grand-prix': 110_000,
  'falls-creek': 80_000,
  port: 180_000,
});

export const FRINGE_FLIGHT_YIELD = 1_200;
export const FRINGE_FLIGHTS_BASE = 12;
export const FRINGE_FLIGHTS_HOTEL = 4;
export const FRINGE_FLIGHTS_TERMINAL = 6;
export const FRINGE_FLIGHTS_RAIL = 3;
export const FRINGE_BERTH_YIELD = 3_000;
export const FRINGE_SHIPS_BASE = 6;
export const AIRPORT_LINK_PEAK_BP = 1600;
export const AIRPORT_LINK_REACH = 8;
export const FRINGE_EVENT_REACH = 8;
export const FRINGE_EVENT_PEAK_BP = Object.freeze({
  'rod-laver': 500,
  'grand-prix': 600,
  'falls-creek': 400,
});

const EVENT_FLAG_BY_ID = Object.freeze({
  'rod-laver': 'rodLaver',
  'grand-prix': 'grandPrix',
  'falls-creek': 'fallsCreek',
});

const OPTIONAL_VENUE_SPEC = Object.freeze({
  'rod-laver': Object.freeze({
    flag: EVENT_FLAG_BY_ID['rod-laver'],
    label: 'Rod Laver events ticket',
    owned: 'The Rod Laver ticket is already held.',
  }),
  'grand-prix': Object.freeze({
    flag: EVENT_FLAG_BY_ID['grand-prix'],
    label: 'Grand Prix events ticket',
    owned: 'The Grand Prix ticket is already held.',
  }),
  'falls-creek': Object.freeze({
    flag: EVENT_FLAG_BY_ID['falls-creek'],
    label: 'Falls Creek season ticket',
    owned: 'The Falls Creek ticket is already held.',
  }),
  port: Object.freeze({
    flag: 'portOwned',
    label: 'Buy Port of Melbourne',
    owned: 'You already hold the port.',
  }),
});

export function fringeRolesOf(city) {
  const bay = city?.waterEdge || 'south';
  const harbourLow = Boolean(city?.waterEdgeBand?.harbourAtLowEnd);
  const perp = (bay === 'north' || bay === 'south')
    ? ['west', 'east']
    : ['north', 'south'];
  const yarraEdge = harbourLow ? perp[0] : perp[1];
  const hillsEdge = harbourLow ? perp[1] : perp[0];
  return {
    bay,
    yarraEdge,
    hillsEdge,
    inlandEdge: OPPOSITE[bay],
  };
}

export function planFringeTerminals(city) {
  const roles = fringeRolesOf(city);
  return Object.freeze({
    beachEdge: roles.bay,
    portEdge: roles.yarraEdge,
    hubEdge: roles.inlandEdge,
    eventsEdge: roles.hillsEdge,
    airportAlong: 'negative',
    stationAlong: 'positive',
    reservedEdges: Object.freeze([]),
  });
}

function axis(edge, kind) {
  if (edge === 'north') return kind === 'seaward' ? { x: 0, z: -1 } : { x: 1, z: 0 };
  if (edge === 'south') return kind === 'seaward' ? { x: 0, z: 1 } : { x: 1, z: 0 };
  if (edge === 'west') return kind === 'seaward' ? { x: -1, z: 0 } : { x: 0, z: 1 };
  return kind === 'seaward' ? { x: 1, z: 0 } : { x: 0, z: 1 };
}

/** +1 if positive along-on-yarra points at the bay (harbour corner). */
export function harbourAlongSign(roles) {
  const along = axis(roles.yarraEdge, 'along');
  const bay = axis(roles.bay, 'seaward');
  const dot = along.x * bay.x + along.z * bay.z;
  return dot >= 0 ? 1 : -1;
}

export function emptyFringeVenues() {
  return {
    airportOwned: false,
    railLink: false,
    hotel: false,
    terminals: 1,
    rodLaver: false,
    grandPrix: false,
    fallsCreek: false,
    portOwned: false,
  };
}

export function ensureFringeVenues(state) {
  if (!state.fringeVenues) state.fringeVenues = emptyFringeVenues();
  const v = state.fringeVenues;
  if (typeof v.airportOwned !== 'boolean') v.airportOwned = Boolean(v.airportOwned);
  if (typeof v.railLink !== 'boolean') v.railLink = Boolean(v.railLink);
  if (typeof v.hotel !== 'boolean') v.hotel = Boolean(v.hotel);
  if (typeof v.rodLaver !== 'boolean') v.rodLaver = Boolean(v.rodLaver);
  if (typeof v.grandPrix !== 'boolean') v.grandPrix = Boolean(v.grandPrix);
  if (typeof v.fallsCreek !== 'boolean') v.fallsCreek = Boolean(v.fallsCreek);
  if (typeof v.portOwned !== 'boolean') v.portOwned = Boolean(v.portOwned);
  if (!Number.isInteger(v.terminals) || v.terminals < 1) v.terminals = 1;
  return state;
}

export function fringeFlights(state) {
  const v = state?.fringeVenues;
  if (!v?.airportOwned) return 0;
  let n = FRINGE_FLIGHTS_BASE;
  if (v.hotel) n += FRINGE_FLIGHTS_HOTEL;
  if ((v.terminals ?? 1) >= 2) n += FRINGE_FLIGHTS_TERMINAL;
  if (v.railLink) n += FRINGE_FLIGHTS_RAIL;
  return n;
}

export function fringeVenueIncome(state) {
  return (
    fringeFlights(state) * FRINGE_FLIGHT_YIELD
    + fringeShips(state) * FRINGE_BERTH_YIELD
  );
}

export function fringeShips(state) {
  return state?.fringeVenues?.portOwned ? FRINGE_SHIPS_BASE : 0;
}

/** Apply off-board venue income after the settlement preview parity check. */
export function applyFringeVenueIncome(state) {
  const income = fringeVenueIncome(state);
  if (income > 0) state.cash += income;
  return income;
}

export function fringeVenueQuote(state, id) {
  const v = state?.fringeVenues ?? emptyFringeVenues();
  const optional = OPTIONAL_VENUE_SPEC[id];
  if (optional) {
    if (v[optional.flag]) {
      return { ok: false, reason: optional.owned, id, label: optional.label };
    }
    return {
      ok: true,
      id,
      cost: FRINGE_VENUE_COSTS[id],
      label: optional.label,
    };
  }
  if (id === 'buy') {
    if (v.airportOwned) {
      return { ok: false, reason: 'You already hold Tullamarine.', id, label: 'Buy Tullamarine' };
    }
    return { ok: true, id, cost: FRINGE_VENUE_COSTS.buy, label: 'Buy Tullamarine' };
  }
  if (!v.airportOwned) {
    return { ok: false, reason: 'Buy the airport first.', id };
  }
  if (id === 'rail-link') {
    if (v.railLink) {
      return {
        ok: false,
        reason: 'Airport rail is already open.',
        id,
        label: 'Airport rail · Southern Cross',
      };
    }
    return { ok: true, id, cost: FRINGE_VENUE_COSTS['rail-link'], label: 'Airport rail · Southern Cross' };
  }
  if (id === 'hotel') {
    if (v.hotel) {
      return { ok: false, reason: 'The airside hotel is already up.', id, label: 'Airside hotel' };
    }
    return { ok: true, id, cost: FRINGE_VENUE_COSTS.hotel, label: 'Airside hotel' };
  }
  if (id === 'terminal') {
    if ((v.terminals ?? 1) >= 2) {
      return { ok: false, reason: 'The second terminal is already open.', id, label: 'Second terminal' };
    }
    return { ok: true, id, cost: FRINGE_VENUE_COSTS.terminal, label: 'Second terminal' };
  }
  return { ok: false, reason: 'Unknown venue upgrade.', id };
}

/** Lattice tile on the inland edge, positive along — Southern Cross gate. */
export function southernCrossGateTile(city) {
  const roles = fringeRolesOf(city);
  const maxGx = Math.max(0, (city.blocksX ?? 4) * TILES_PER_BLOCK - 1);
  const maxGz = Math.max(0, (city.blocksZ ?? 4) * TILES_PER_BLOCK - 1);
  const k = 0.74;
  const gxAlong = Math.round(maxGx * k);
  const gzAlong = Math.round(maxGz * k);
  const inland = roles.inlandEdge;
  if (inland === 'north') return { gx: gxAlong, gz: 0 };
  if (inland === 'south') return { gx: gxAlong, gz: maxGz };
  if (inland === 'west') return { gx: 0, gz: gzAlong };
  return { gx: maxGx, gz: gzAlong };
}

/** Lattice tile at the centre of the hills-edge events gate. */
export function hillsEdgeGateTile(city) {
  const roles = fringeRolesOf(city);
  const maxGx = Math.max(0, (city.blocksX ?? 4) * TILES_PER_BLOCK - 1);
  const maxGz = Math.max(0, (city.blocksZ ?? 4) * TILES_PER_BLOCK - 1);
  const middleGx = Math.round(maxGx * 0.5);
  const middleGz = Math.round(maxGz * 0.5);
  const hills = roles.hillsEdge;
  if (hills === 'north') return { gx: middleGx, gz: 0 };
  if (hills === 'south') return { gx: middleGx, gz: maxGz };
  if (hills === 'west') return { gx: 0, gz: middleGz };
  return { gx: maxGx, gz: middleGz };
}

export function parcelTileDistanceToGate(city, state, parcelId, gate) {
  const parcel = activeParcel(city, state, parcelId);
  if (!parcel?.tiles?.length) return Infinity;
  let best = Infinity;
  for (const tile of parcel.tiles) {
    const id = typeof tile === 'string' ? tile : tile.id;
    const parsed = parseParcelId(id);
    const { gx, gz } = globalTile(parsed.bx, parsed.bz, parsed.tx, parsed.tz);
    const d = Math.abs(gx - gate.gx) + Math.abs(gz - gate.gz);
    if (d < best) best = d;
  }
  return best;
}

/** Quadratic decay from Southern Cross. 0 unless the rail link is open. */
export function airportLinkValueBp(city, state, parcelId) {
  if (!state?.fringeVenues?.railLink) return 0;
  const gate = southernCrossGateTile(city);
  const dist = parcelTileDistanceToGate(city, state, parcelId, gate);
  if (!Number.isFinite(dist)) return 0;
  const t = Math.max(0, 1 - dist / AIRPORT_LINK_REACH);
  return Math.round(AIRPORT_LINK_PEAK_BP * t * t);
}

/** Shared quadratic hills-edge decay; bought tickets contribute distinct, additive peaks. */
export function fringeEventsValueBp(city, state, parcelId) {
  const venues = state?.fringeVenues;
  if (!venues) return 0;
  let peakBp = 0;
  for (const [id, flag] of Object.entries(EVENT_FLAG_BY_ID)) {
    if (venues[flag]) peakBp += FRINGE_EVENT_PEAK_BP[id];
  }
  if (peakBp <= 0) return 0;
  const gate = hillsEdgeGateTile(city);
  const dist = parcelTileDistanceToGate(city, state, parcelId, gate);
  if (!Number.isFinite(dist)) return 0;
  const t = Math.max(0, 1 - dist / FRINGE_EVENT_REACH);
  return Math.round(peakBp * t * t);
}

export function applyFringeVenuePurchase(venues, id) {
  const next = { ...emptyFringeVenues(), ...venues };
  if (id === 'buy') next.airportOwned = true;
  else if (id === 'rail-link') next.railLink = true;
  else if (id === 'hotel') next.hotel = true;
  else if (id === 'terminal') next.terminals = 2;
  else if (id === 'port') next.portOwned = true;
  else if (EVENT_FLAG_BY_ID[id]) next[EVENT_FLAG_BY_ID[id]] = true;
  return next;
}
