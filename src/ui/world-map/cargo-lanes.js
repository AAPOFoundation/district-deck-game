// Natural Melbourne-bound cargo lanes. Days are port-to-port (or airport) mid-range.
// Speeds used to sanity-check: container 16 kn, VLCC 13 kn, rail ~50 km/h, jet ~850 km/h.
// Sources: Maersk / Magellan / HMM / MSC schedules, FluentCargo, CMA NEMO, CTI ARTC rail.
// Authored days live on WORLD_TRADE_ROUTES (catalog). CARGO_DAYS reads those rows.

import { WORLD_TRADE_BY_ID, WORLD_TRADE_ROUTES } from '../../core/world/catalog.js';

export const MS_PER_DAY = 1200;

const P = (lat, lon) => Object.freeze({ lat, lon });

const LANE = Object.freeze({
  skagerrak: P(57.5, 8.0),
  northSea: P(54.0, 3.0),
  dover: P(51.05, 1.4),
  channel: P(49.6, -4.2),
  biscay: P(44.5, -9.5),
  gibraltar: P(35.9, -5.7),
  westMed: P(37.2, 3.2),
  centralMed: P(35.4, 18.8),
  eastMed: P(33.05, 30.6),
  portSaid: P(31.27, 32.30),
  timsah: P(30.57, 32.29),
  bitter: P(30.32, 32.38),
  suezSouth: P(29.97, 32.55),
  redNorth: P(27.70, 33.95),
  redJeddah: P(21.50, 38.80),
  redMid: P(20.40, 38.30),
  bab: P(12.58, 43.33),
  aden: P(12.6, 48.2),
  arabian: P(10.0, 58.5),
  maldives: P(2.2, 73.2),
  indianEq: P(-8.0, 82.0),
  indianSouth: P(-22.0, 96.0),
  leeuwin: P(-36.3, 114.4),
  bightWest: P(-37.3, 125.0),
  bight: P(-37.5, 133.0),
  bassWest: P(-39.45, 141.9),
  luzon: P(20.2, 122.4),
  scs: P(14.5, 116.5),
  philSea: P(8.0, 133.0),
  equator: P(-2.0, 146.0),
  coral: P(-16.5, 154.5),
  tasman: P(-32.4, 154.6),
  sydneyRoads: P(-34.4, 151.7),
  bassEast: P(-39.15, 148.4),
  karimata: P(0.8, 107.4),
  sunda: P(-6.65, 105.15),
  javaSouth: P(-12.5, 108.5),
  waOffshore: P(-27.5, 111.5),
  oman: P(23.7, 59.3),
  arabianEast: P(15.5, 62.5),
  murray: P(-35.12, 139.27),
  bordertown: P(-36.31, 140.77),
  ararat: P(-37.28, 142.93),
  ballarat: P(-37.56, 143.85),
  santosRoads: P(-26.2, -42.0),
  southAtlantic: P(-32.0, -20.0),
  midAtlantic: P(-35.0, 0.0),
  capeTown: P(-35.5, 18.5),
  agulhas: P(-36.5, 22.0),
  southIndianWest: P(-38.0, 40.0),
  southIndianMid: P(-36.0, 70.0),
  guinea: P(2.0, 2.0),
  guineaSouth: P(-8.0, 6.0),
  angolaBasin: P(-20.0, 10.0),
  valpoRoads: P(-35.0, -85.0),
  southPacificWest: P(-40.0, -120.0),
  southPacificMid: P(-45.0, -160.0),
  southPacificDate: P(-47.0, 175.0),
  tasmanSouth: P(-44.0, 155.0),
  rasLaffan: P(26.5, 56.3),
  nagoyaRoads: P(33.8, 137.0),
  kuroshio: P(30.0, 140.0),
  bordeauxRoads: P(45.5, -3.0),
  mumbaiRoads: P(12.0, 68.0),
});

const SUEZ_INDIAN = Object.freeze([
  LANE.portSaid, LANE.timsah, LANE.bitter, LANE.suezSouth, LANE.redNorth, LANE.redJeddah,
  LANE.redMid, LANE.bab, LANE.aden,
  LANE.arabian, LANE.maldives, LANE.indianEq, LANE.indianSouth, LANE.leeuwin,
  LANE.bightWest, LANE.bight, LANE.bassWest,
]);

const ATLANTIC_SUEZ = Object.freeze([
  LANE.gibraltar, LANE.westMed, LANE.centralMed, ...SUEZ_INDIAN,
]);

const EAST_ASIA = Object.freeze([
  LANE.luzon, LANE.philSea, LANE.equator, LANE.coral, LANE.tasman, LANE.sydneyRoads, LANE.bassEast,
]);

const SUNDA_BIGHT = Object.freeze([
  LANE.sunda, LANE.javaSouth, LANE.waOffshore, LANE.leeuwin, LANE.bightWest, LANE.bight, LANE.bassWest,
]);

const TANKER_INDIAN = Object.freeze([
  LANE.oman, LANE.arabianEast, LANE.maldives, LANE.indianEq, LANE.indianSouth,
  LANE.leeuwin, LANE.bightWest, LANE.bight, LANE.bassWest,
]);

const RAIL_ADELAIDE = Object.freeze([
  LANE.murray, LANE.bordertown, LANE.ararat, LANE.ballarat,
]);

const RAIL_SYDNEY = Object.freeze([
  P(-37.02, 145.14),
  P(-36.08, 146.92),
  P(-35.12, 147.37),
  P(-34.75, 149.72),
]);

const CAPE_INDIAN = Object.freeze([
  LANE.capeTown, LANE.agulhas, LANE.southIndianWest, LANE.southIndianMid,
  LANE.leeuwin, LANE.bightWest, LANE.bight, LANE.bassWest,
]);

const SANTOS_CAPE = Object.freeze([
  LANE.santosRoads, LANE.southAtlantic, LANE.midAtlantic, ...CAPE_INDIAN,
]);

const ACCRA_CAPE = Object.freeze([
  LANE.guinea, LANE.guineaSouth, LANE.angolaBasin, ...CAPE_INDIAN,
]);

const PACIFIC_SOUTH = Object.freeze([
  LANE.valpoRoads, LANE.southPacificWest, LANE.southPacificMid, LANE.southPacificDate,
  LANE.tasmanSouth, LANE.bassEast,
]);

const NAGOYA_ASIA = Object.freeze([
  LANE.nagoyaRoads, LANE.kuroshio, LANE.philSea, LANE.equator, LANE.coral,
  LANE.tasman, LANE.sydneyRoads, LANE.bassEast,
]);

const MUMBAI_INDIAN = Object.freeze([
  LANE.mumbaiRoads, LANE.maldives, LANE.indianEq, LANE.indianSouth,
  LANE.leeuwin, LANE.bightWest, LANE.bight, LANE.bassWest,
]);

const DOHA_TANKER = Object.freeze([
  LANE.rasLaffan, ...TANKER_INDIAN,
]);

export const CARGO_MODE = Object.freeze({
  'beer-hobart-melbourne': 'sea-bass',
  'warships-adelaide-melbourne': 'sea-bass',
  'tourists-singapore-melbourne': 'air',
  'robots-starbase-melbourne': 'air',
  'compute-starbase-melbourne': 'air',
  'starlink-starbase-melbourne': 'air',
  'chips-taipei-melbourne': 'air',
  'tiles-guangzhou-melbourne': 'sea-asia',
  'timber-jakarta-melbourne': 'sea-sunda',
  'furniture-hcmc-melbourne': 'sea-sunda',
  'modular-hongkong-melbourne': 'sea-asia',
  'fittings-guangzhou-melbourne': 'sea-asia',
  'machinery-shanghai-melbourne': 'sea-asia',
  'cybercabs-shanghai-melbourne': 'sea-asia',
  'credit-sydney-melbourne': 'rail',
  'marble-carrara-melbourne': 'sea-suez',
  'ancient-biotech-antarctica-melbourne': 'air',
  'uranium-olympic-melbourne': 'sea-bass',
  'alien-northpole-melbourne': 'air',
  'oil-hormuz-melbourne': 'sea-tanker',
  'asylum-levant-melbourne': 'sea-suez',
  'turbines-london-melbourne': 'sea-suez',
  'modular-gothenburg-melbourne': 'sea-suez',
  'biotech-melbourne-london': 'air',
  'biotech-melbourne-losangeles': 'air',
  'biotech-melbourne-tokyo': 'air',
  'coffee-santos-melbourne': 'sea-cape',
  'copper-valparaiso-melbourne': 'sea-pacific',
  'cocoa-accra-melbourne': 'sea-cape',
  'lng-doha-melbourne': 'sea-tanker',
  'autos-nagoya-melbourne': 'sea-asia',
  'wine-bordeaux-melbourne': 'sea-suez',
  'gold-johannesburg-melbourne': 'air',
  'people-mumbai-melbourne': 'sea-indian',
  'grain-melbourne-singapore': 'sea-sunda',
  'fittings-melbourne-jakarta': 'sea-sunda',
  'chips-melbourne-tokyo': 'air',
});

export const CARGO_DAYS = Object.freeze(Object.fromEntries(
  WORLD_TRADE_ROUTES.map((route) => [route.id, route.days]),
));

export function cargoDaysFor(routeId) {
  return WORLD_TRADE_BY_ID[routeId]?.days ?? 18;
}

export function isSeaCargo(routeId) {
  const mode = CARGO_MODE[routeId];
  return mode === 'sea-suez' || mode === 'sea-asia' || mode === 'sea-sunda'
    || mode === 'sea-tanker' || mode === 'sea-cape' || mode === 'sea-pacific'
    || mode === 'sea-indian' || mode === 'sea-bass';
}

export function cargoDurationMs(routeId) {
  return Math.max(1, CARGO_DAYS[routeId] ?? 18) * MS_PER_DAY;
}

export function travelLabel(routeId) {
  const mode = CARGO_MODE[routeId];
  if (mode === 'air') return 'Air freight';
  if (mode === 'rail') return 'Overland rail';
  if (mode === 'sea-tanker') return routeId.startsWith('lng-') ? 'LNG tanker' : 'Oil tanker';
  if (mode === 'sea-suez') return 'Cargo ship via Suez';
  if (mode === 'sea-cape') return 'Cargo ship via the Cape';
  if (mode === 'sea-pacific') return 'Cargo ship across the Pacific';
  if (mode === 'sea-indian') return 'Cargo ship via the Indian Ocean';
  if (mode === 'sea-bass') return 'Coastal steamer';
  return 'Cargo ship';
}

export function travelNote(routeId) {
  const days = CARGO_DAYS[routeId] ?? 18;
  const mode = CARGO_MODE[routeId];
  const outbound = routeId.startsWith('biotech-melbourne-');
  if (mode === 'air') {
    return outbound
      ? `The cargo flies from Melbourne. Air freight is about ${days} day${days === 1 ? '' : 's'}, not weeks.`
      : `The cargo flies in. Air freight is about ${days} day${days === 1 ? '' : 's'}, not weeks.`;
  }
  if (routeId === 'credit-sydney-melbourne') {
    return `Overland rail on the Hume corridor. About ${days} day${days === 1 ? '' : 's'}.`;
  }
  if (mode === 'rail') {
    return `Overland rail. About ${days} day${days === 1 ? '' : 's'}.`;
  }
  if (mode === 'sea-tanker') {
    return routeId.startsWith('lng-')
      ? `An LNG tanker. About ${days} days via Hormuz, the Indian Ocean, and Cape Leeuwin.`
      : `An oil tanker at about 13 knots. Hormuz crude takes about ${days} days via the Indian Ocean and Cape Leeuwin.`;
  }
  if (mode === 'sea-suez') {
    return `A steamer is a cargo ship, not a warship. This book sails via Suez — about ${days} days.`;
  }
  if (mode === 'sea-sunda') {
    return `A steamer is a cargo ship. It takes the Sunda Strait and the Bight — about ${days} days.`;
  }
  if (mode === 'sea-cape') {
    return `A steamer is a cargo ship. It rounds the Cape of Good Hope — about ${days} days.`;
  }
  if (mode === 'sea-pacific') {
    return `A steamer is a cargo ship. It crosses the South Pacific — about ${days} days.`;
  }
  if (mode === 'sea-indian') {
    return `A steamer is a cargo ship. It crosses the Indian Ocean and Cape Leeuwin — about ${days} days.`;
  }
  if (mode === 'sea-bass') {
    return routeId === 'beer-hobart-melbourne'
      ? `A steamer crosses Bass Strait. About ${days} days.`
      : `A warship steams the Bight and Bass Strait. About ${days} days.`;
  }
  return `A steamer is a cargo ship. East Asia sailings run the Coral Sea and Bass Strait — about ${days} days.`;
}

export function pathStops(routeId) {
  const mode = CARGO_MODE[routeId];
  if (routeId === 'credit-sydney-melbourne') return 'Goulburn → Wagga Wagga → Albury → Seymour';
  if (mode === 'rail') return 'Overland rail';
  if (mode === 'air') return 'Great-circle flight';
  if (routeId === 'modular-gothenburg-melbourne') return 'North Sea → Mediterranean → Suez → Red Sea';
  if (routeId === 'turbines-london-melbourne') return 'Channel → Mediterranean → Suez → Red Sea';
  if (routeId === 'asylum-levant-melbourne') return 'East Mediterranean → Suez → Red Sea';
  if (mode === 'sea-suez') return 'Mediterranean → Suez → Red Sea';
  if (mode === 'sea-tanker') return 'Hormuz → Indian Ocean → Cape Leeuwin';
  if (mode === 'sea-sunda') return 'Sunda Strait → Great Australian Bight';
  if (mode === 'sea-asia') return 'South China Sea → Coral Sea → Bass Strait';
  if (mode === 'sea-cape') return 'South Atlantic → Cape of Good Hope → Cape Leeuwin';
  if (mode === 'sea-pacific') return 'South Pacific → Tasman Sea';
  if (mode === 'sea-indian') return 'Arabian Sea → Indian Ocean → Cape Leeuwin';
  if (mode === 'sea-bass') {
    return routeId === 'beer-hobart-melbourne' ? 'Bass Strait' : 'Great Australian Bight → Bass Strait';
  }
  return 'Direct route';
}

export function travelPhrase(routeId) {
  const mode = CARGO_MODE[routeId];
  const days = CARGO_DAYS[routeId] ?? 18;
  if (mode === 'air') return `air freight · about ${days} day${days === 1 ? '' : 's'}`;
  if (mode === 'rail') return `overland rail · about ${days} days`;
  if (mode === 'sea-tanker') {
    return routeId.startsWith('lng-')
      ? `LNG tanker via Hormuz · about ${days} days`
      : `oil tanker via the Indian Ocean · about ${days} days`;
  }
  if (mode === 'sea-suez') return `cargo ship via Suez (a steamer is a ship, not a warship) · about ${days} days`;
  if (mode === 'sea-sunda') return `cargo ship via Sunda and the Bight · about ${days} days`;
  if (mode === 'sea-cape') return `cargo ship via the Cape of Good Hope · about ${days} days`;
  if (mode === 'sea-pacific') return `cargo ship across the South Pacific · about ${days} days`;
  if (mode === 'sea-indian') return `cargo ship via the Indian Ocean · about ${days} days`;
  if (mode === 'sea-bass') {
    return routeId === 'beer-hobart-melbourne'
      ? `Bass Strait steamer · about ${days} days`
      : `coastal warship · about ${days} days`;
  }
  return `cargo ship via the Coral Sea · about ${days} days`;
}

function reverseLane(points) {
  return [...points].reverse();
}

function midsFor(routeId) {
  const mode = CARGO_MODE[routeId];
  if (routeId === 'credit-sydney-melbourne') return reverseLane(RAIL_SYDNEY);
  if (mode === 'air') return [];
  if (mode === 'rail') return RAIL_ADELAIDE;
  if (mode === 'sea-tanker') {
    if (routeId === 'lng-doha-melbourne') return DOHA_TANKER;
    return TANKER_INDIAN;
  }
  if (mode === 'sea-asia') {
    if (routeId === 'autos-nagoya-melbourne') return NAGOYA_ASIA;
    return EAST_ASIA;
  }
  if (mode === 'sea-cape') {
    if (routeId === 'coffee-santos-melbourne') return SANTOS_CAPE;
    return ACCRA_CAPE;
  }
  if (mode === 'sea-pacific') return PACIFIC_SOUTH;
  if (mode === 'sea-indian') return MUMBAI_INDIAN;
  if (mode === 'sea-bass') {
    if (routeId === 'beer-hobart-melbourne') return [P(-40.2, 146.5)];
    return [LANE.bight, LANE.bassWest];
  }
  if (mode === 'sea-sunda') {
    if (routeId === 'furniture-hcmc-melbourne') return [LANE.scs, LANE.karimata, ...SUNDA_BIGHT];
    return SUNDA_BIGHT;
  }
  if (routeId === 'marble-carrara-melbourne') {
    return [LANE.westMed, LANE.centralMed, ...SUEZ_INDIAN];
  }
  if (routeId === 'modular-gothenburg-melbourne') {
    return [LANE.skagerrak, LANE.northSea, LANE.dover, LANE.channel, LANE.biscay, ...ATLANTIC_SUEZ];
  }
  if (routeId === 'turbines-london-melbourne') {
    return [LANE.channel, LANE.biscay, ...ATLANTIC_SUEZ];
  }
  if (routeId === 'asylum-levant-melbourne') {
    return [LANE.eastMed, ...SUEZ_INDIAN];
  }
  if (routeId === 'wine-bordeaux-melbourne') {
    return [LANE.bordeauxRoads, LANE.biscay, ...ATLANTIC_SUEZ];
  }
  return ATLANTIC_SUEZ;
}

export function cargoWaypoints(routeId, origin, destination) {
  if (!origin || !destination) return [];
  return [origin, ...midsFor(routeId), destination];
}

export function cargoLift(mode, u) {
  if (mode === 'air') return 0.12 + (Math.sin(Math.PI * u) * 0.22);
  if (mode === 'rail') return 0.028;
  return 0.036;
}
