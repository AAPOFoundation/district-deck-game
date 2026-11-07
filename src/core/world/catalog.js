// District Deck — authored world catalog (globe desks + trade goods).
// Frozen content, same contract as DISTRICTS / OPERATORS. Dollars are game units.
// Every node still opens the existing six-district inner board. Flavour lives here.

export const WORLD_PROTOCOL = 'district-deck-world';
export const WORLD_STATE_VERSION = 6;
export const WORLD_TREASURY_START = 4_000_000;

/** Pairing with HEAD city STATE_VERSION. Do not import state.js. */
export const WORLD_CITY_STATE_VERSION = 10;
/** Pairing with HEAD SIM_REVISION. Do not import content.js. V5.7 P14 threats / defence. */
export const WORLD_SIM_REVISION = 69;

export function transitBeatsForDays(days) {
  const n = Number.isInteger(days) && days > 0 ? days : 18;
  return Math.max(1, Math.ceil(n / 7));
}

/**
 * Authored port-to-port (or airport) days. Single source for route.days /
 * route.transitBeats. cargo-lanes CARGO_DAYS reads these rows.
 */
export const WORLD_ROUTE_DAYS = Object.freeze({
  'beer-hobart-melbourne': 2,
  'warships-adelaide-melbourne': 4,
  'tourists-singapore-melbourne': 1,
  'robots-starbase-melbourne': 3,
  'compute-starbase-melbourne': 3,
  'starlink-starbase-melbourne': 3,
  'chips-taipei-melbourne': 4,
  'tiles-guangzhou-melbourne': 18,
  'timber-jakarta-melbourne': 12,
  'furniture-hcmc-melbourne': 16,
  'modular-hongkong-melbourne': 16,
  'fittings-guangzhou-melbourne': 18,
  'machinery-shanghai-melbourne': 18,
  'credit-sydney-melbourne': 1,
  'marble-carrara-melbourne': 40,
  'ancient-biotech-antarctica-melbourne': 4,
  'uranium-olympic-melbourne': 5,
  'alien-northpole-melbourne': 3,
  'oil-hormuz-melbourne': 22,
  'asylum-levant-melbourne': 30,
  'turbines-london-melbourne': 40,
  'modular-gothenburg-melbourne': 44,
  'biotech-melbourne-london': 2,
  'biotech-melbourne-losangeles': 3,
  'biotech-melbourne-tokyo': 2,
  'coffee-santos-melbourne': 32,
  'copper-valparaiso-melbourne': 20,
  'cocoa-accra-melbourne': 30,
  'lng-doha-melbourne': 21,
  'autos-nagoya-melbourne': 18,
  'wine-bordeaux-melbourne': 40,
  'gold-johannesburg-melbourne': 1,
  'people-mumbai-melbourne': 18,
  'grain-melbourne-singapore': 7,
  'fittings-melbourne-jakarta': 12,
  'chips-melbourne-tokyo': 2,
});

function withRouteTransit(row) {
  const days = Number.isInteger(row.days) && row.days > 0
    ? row.days
    : (WORLD_ROUTE_DAYS[row.id] ?? 18);
  return Object.freeze({
    ...row,
    days,
    transitBeats: transitBeatsForDays(days),
  });
}

/**
 * Pulse/open writes used to keep 24 rows. Movement rows (harvest /
 * city-admission / export-shipment) are logged every beat and a single
 * beat can exceed 24 (open inbound books + one admission + offtake).
 * Cap at 64 so one beat of movement plus pulse/open history survives.
 * Same-beat handling holds coalesce to one inbound row and one outbound
 * row (dockHoldLogRow), so the cap cannot evict individual holds.
 * Port storage holds coalesce to one port-full row per class per beat.
 */
export const WORLD_LOG_CAP = 64;

export function appendWorldLog(log, entries, cap = WORLD_LOG_CAP) {
  const next = Array.isArray(log) ? [...log] : [];
  const extra = Array.isArray(entries) ? entries : [entries];
  for (const entry of extra) {
    if (!entry) continue;
    next.push(Object.isFrozen(entry) ? entry : Object.freeze(entry));
  }
  return next.slice(-Math.max(1, cap));
}

/**
 * One log row per direction per beat for unfunded handling. 62 inbound
 * holds plus 12 outbound holds used to overflow WORLD_LOG_CAP and drop
 * ten inbound rows; the aggregate is two rows, never 74.
 */
export function dockHoldLogRow(beat, direction, count, sample = null) {
  const n = Number.isInteger(count) ? count : 0;
  if (n < 1) return null;
  if (direction !== 'inbound' && direction !== 'outbound') {
    throw new RangeError(`dock-hold direction must be inbound or outbound, got ${direction}`);
  }
  const row = {
    beat,
    type: 'dock-hold',
    direction,
    count: n,
    body: `Handling unfunded — ${n} ${direction} crates hold at the dock.`,
  };
  if (n === 1 && sample && typeof sample === 'object') {
    if (typeof sample.routeId === 'string') row.routeId = sample.routeId;
    if (typeof sample.good === 'string') row.good = sample.good;
  }
  return Object.freeze(row);
}

/**
 * CityExports.goods → Yard crate class (WORLD_GOODS).
 * grain: community gardens / veggie patches grow grain. Army + Mars recipes spend
 *        `food` crates. effects.js GOOD_COPY already labels food as Grain.
 * food:  reserved if a city kitchen later yields food directly (none in Wave 1).
 * timber: city timber lots (none in Wave 1 yield table; Jakarta inbound still harvests).
 * materials: sawtooth / factory / hammerbarn → fittings (works crates).
 * students: school / university → people (labour crates).
 * tech: office / data-centre trickle → chips.
 * milkPowder / wine / beef: Wave 3 farm offtake. Same beat-tick mapping as grain→food.
 * education: min(students, educationSeats) tuition crates for the Tokyo desk.
 * educationSeats is a campus gate, not a crate.
 */
export const CITY_EXPORT_TO_YARD = Object.freeze({
  grain: 'food',
  food: 'food',
  biotech: 'biotech',
  timber: 'timber',
  materials: 'fittings',
  students: 'people',
  tech: 'chips',
  milkPowder: 'milk-powder',
  wine: 'wine',
  beef: 'beef',
  education: 'education',
});

export const WORLD_CITY_STATUSES = Object.freeze(['locked', 'open', 'in-play', 'closed']);
export const WORLD_LINK_KINDS = Object.freeze(['rail', 'steamer', 'tanker']);
export const WORLD_GOODS = Object.freeze([
  'oil', 'fittings', 'modular', 'furniture', 'tiles', 'timber', 'chips',
  'robots', 'tourists', 'credit', 'food', 'people', 'asylum', 'biotech',
  'ancient-biotech',
  'coffee', 'copper', 'cocoa', 'lng', 'autos', 'wine', 'gold',
  'marble', 'beer', 'warships', 'compute', 'starlink', 'alien',
  'machinery', 'turbines',
  'milk-powder', 'beef', 'education',
  'iron', 'lithium', 'rare-earth', 'titanium', 'cobalt',
  'steel', 'nickel', 'graphite', 'aluminium', 'ceramics', 'platinum',
  'pig-iron', 'bauxite', 'alumina', 'quartz', 'silicon', 'polysilicon',
  'wafer', 'die', 'kaolin', 'magnets', 'windings', 'motors', 'frames',
  'castings', 'materials',
  'pulp', 'paper', 'ink', 'bibles',
  'uranium', 'enriched-uranium', 'warhead', 'missile-body',
]);

export const WORLD_CASH_WIN = 10_000_000_000_000;
export const WORLD_TAPE_START = 4_000_000_000;
export const WORLD_EXPORT_TAPE = 80_000_000_000;
export const WORLD_INBOUND_TAPE = 2_000_000_000;
export const WORLD_CREDIT_TAPE = 25_000_000_000;
export const CREDIT_ROUTE_ID = 'credit-sydney-melbourne';
export const CREDIT_TERM_BEATS = 8;
export const CREDIT_ARRANGEMENT_FEE = 40_000;

/** Cash principal from listed tape. Start tape ($4B) draws $400k over eight beats. */
export function creditOffer(world) {
  const tape = Math.max(WORLD_TAPE_START, world?.ambition?.tape ?? WORLD_TAPE_START);
  const units = Math.log10(tape) - Math.log10(WORLD_TAPE_START);
  const principal = Math.min(1_500_000, Math.max(250_000, 400_000 + Math.round(units * 350_000)));
  const installment = Math.ceil(principal / CREDIT_TERM_BEATS);
  return Object.freeze({
    principal,
    termBeats: CREDIT_TERM_BEATS,
    installment,
    tape,
    fee: CREDIT_ARRANGEMENT_FEE,
  });
}
export const WORLD_EXPORT_CASH = 125_000;
/**
 * Cash a shipped crate pays Head office. High-value licences and tuition pay
 * millions so the user's force prices stay honest. Prices never come down;
 * earnings come up. Unlisted goods fall back to WORLD_EXPORT_CASH.
 *
 * Per-good numbers are authored here — the design table did not list them.
 * Same logic: dear crates (biotech, tuition, chips, milk powder) pay millions;
 * bulk grain and fittings pay a million-ish.
 */
export const WORLD_EXPORT_CASH_BY_GOOD = Object.freeze({
  biotech: 8_000_000,        // lab licences to Los Angeles, Tokyo, London
  'ancient-biotech': 12_000_000, // Antarctic ice-core. Endgame BIOMIND feedstock.
  education: 5_000_000,      // Tokyo tuition desk
  chips: 4_000_000,          // silicon
  'milk-powder': 3_000_000,  // infant formula
  wine: 2_000_000,
  beef: 2_000_000,
  fittings: 1_500_000,       // works crates
  food: 1_250_000,           // grain. V4.6 Wave 1: retuned up so beat-15 still funds the force bill after handling fees. Prices never down.
});

export function exportCashForGood(good) {
  const named = WORLD_EXPORT_CASH_BY_GOOD[good];
  if (Number.isInteger(named) && named > 0) return named;
  return WORLD_EXPORT_CASH;
}

/**
 * Per-crate handling fee when an inbound crate lands or an outbound crate
 * leaves. Charged to Head office on top of the book open fee. Unfunded
 * handling holds the crate at the dock that beat (log row; no silent loss).
 *
 * Classes, authored 2026-08-30:
 *   bulk ($2,000) — dirt, grain, timber, people, pulp, paper, slag
 *   mid  ($8,000) — processed metals, parts, wine, beef, fittings
 *   dear ($40,000) — chips, wafers, robots, bullion, licences, tuition
 * Loans skip harvest and skip this fee.
 */
export const WORLD_HANDLING_BULK = 2_000;
export const WORLD_HANDLING_MID = 8_000;
export const WORLD_HANDLING_DEAR = 40_000;

export const WORLD_HANDLING_FEE_BY_GOOD = Object.freeze({
  oil: WORLD_HANDLING_BULK,
  food: WORLD_HANDLING_BULK,
  timber: WORLD_HANDLING_BULK,
  iron: WORLD_HANDLING_BULK,
  bauxite: WORLD_HANDLING_BULK,
  kaolin: WORLD_HANDLING_BULK,
  quartz: WORLD_HANDLING_BULK,
  materials: WORLD_HANDLING_BULK,
  graphite: WORLD_HANDLING_BULK,
  tiles: WORLD_HANDLING_BULK,
  furniture: WORLD_HANDLING_BULK,
  beer: WORLD_HANDLING_BULK,
  cocoa: WORLD_HANDLING_BULK,
  coffee: WORLD_HANDLING_BULK,
  pulp: WORLD_HANDLING_BULK,
  paper: WORLD_HANDLING_BULK,
  ink: WORLD_HANDLING_BULK,
  people: WORLD_HANDLING_BULK,
  tourists: WORLD_HANDLING_BULK,
  asylum: WORLD_HANDLING_BULK,
  bibles: WORLD_HANDLING_BULK,

  fittings: WORLD_HANDLING_MID,
  modular: WORLD_HANDLING_MID,
  copper: WORLD_HANDLING_MID,
  steel: WORLD_HANDLING_MID,
  'pig-iron': WORLD_HANDLING_MID,
  alumina: WORLD_HANDLING_MID,
  silicon: WORLD_HANDLING_MID,
  nickel: WORLD_HANDLING_MID,
  lithium: WORLD_HANDLING_MID,
  cobalt: WORLD_HANDLING_MID,
  'rare-earth': WORLD_HANDLING_MID,
  aluminium: WORLD_HANDLING_MID,
  ceramics: WORLD_HANDLING_MID,
  lng: WORLD_HANDLING_MID,
  autos: WORLD_HANDLING_MID,
  wine: WORLD_HANDLING_MID,
  beef: WORLD_HANDLING_MID,
  machinery: WORLD_HANDLING_MID,
  turbines: WORLD_HANDLING_MID,
  marble: WORLD_HANDLING_MID,
  windings: WORLD_HANDLING_MID,
  motors: WORLD_HANDLING_MID,
  frames: WORLD_HANDLING_MID,
  castings: WORLD_HANDLING_MID,
  magnets: WORLD_HANDLING_MID,
  die: WORLD_HANDLING_MID,
  warships: WORLD_HANDLING_MID,

  chips: WORLD_HANDLING_DEAR,
  robots: WORLD_HANDLING_DEAR,
  compute: WORLD_HANDLING_DEAR,
  starlink: WORLD_HANDLING_DEAR,
  alien: WORLD_HANDLING_DEAR,
  gold: WORLD_HANDLING_DEAR,
  platinum: WORLD_HANDLING_DEAR,
  biotech: WORLD_HANDLING_DEAR,
  'ancient-biotech': WORLD_HANDLING_DEAR,
  education: WORLD_HANDLING_DEAR,
  wafer: WORLD_HANDLING_DEAR,
  polysilicon: WORLD_HANDLING_DEAR,
  titanium: WORLD_HANDLING_DEAR,
  credit: WORLD_HANDLING_DEAR,
  'milk-powder': WORLD_HANDLING_DEAR,
  uranium: WORLD_HANDLING_DEAR,
  'enriched-uranium': WORLD_HANDLING_DEAR,
  warhead: WORLD_HANDLING_MID,
  'missile-body': WORLD_HANDLING_MID,
});

export function handlingFeeForGood(good) {
  const named = WORLD_HANDLING_FEE_BY_GOOD[good];
  if (Number.isInteger(named) && named > 0) return named;
  return WORLD_HANDLING_MID;
}
export const WORLD_DRONE_WIN = 6;
export const WORLD_CULTURE_HOLD = 50;
export const WORLD_CULTURE_NEED = 8;
export const WORLD_MISSIONARY_CAP = 3;
export const WORLD_MISSIONARY_COST = 150_000;
export const WORLD_OFFICER_COST = 200_000;
export const WORLD_OFFICER_CAP = 3;
export const WORLD_STATION_COST = Object.freeze({
  cash: 90_000,
  stocks: Object.freeze({ modular: 1 }),
});
export const WORLD_LISTING_SHIPMENTS = 5;
export const WORLD_LISTING_NEED = 3;
/** FINANCIAL win: at least three city AI startups each valued ≥ $100m. */
export const WORLD_STARTUP_WIN_COUNT = 3;
export const WORLD_STARTUP_WIN_VALUATION = 100_000_000;
export const WORLD_MISSION_BASE_PCT = 35;
export const WORLD_CULTURE_CREED = 'christianity';
export const WORLD_MISSION_MODIFIER_PCT = Object.freeze({
  'singapore-roads': 8,
  'hongkong-peak': 5,
  'london-city': 4,
  'tokyo-harbour': 2,
  'sydney-harbour': 3,
  'hormuz-roads': -8,
  'levant-roads': -12,
  'starbase-texas': -5,
  'antarctica-dome': -6,
  'northpole-base': -6,
});
/** Integer bp a live pulse adds to Melbourne works cost. Stationed chokes halve this. */
export const WORLD_PULSE_DAMAGE_BP = Object.freeze({
  'oil-embargo': 1600,
  'china-quota': 1200,
  'war-asylum': 400,
  'open-boom': 0,
});

export const WORLD_CREEDS = Object.freeze([
  Object.freeze({ id: 'meritocracy', label: 'Meritocracy' }),
  Object.freeze({ id: 'capitalism', label: 'Capitalism' }),
  Object.freeze({ id: 'socialism', label: 'Socialism' }),
  Object.freeze({ id: 'christianity', label: 'Christianity' }),
  Object.freeze({ id: 'islam', label: 'Islam' }),
  Object.freeze({ id: 'buddhism', label: 'Buddhism' }),
]);

export const WORLD_MARS_PARTS = Object.freeze([
  Object.freeze({
    id: 'probe', label: 'Mars probe', cash: 400_000,
    // Was chips 4, robots 2, rare-earth 2. V4.3 adds platinum 1 (electrode/systems).
    stocks: Object.freeze({ chips: 4, robots: 2, 'rare-earth': 2, platinum: 1 }),
    register: 'Mars probe. Chips, robots, rare earth, platinum.',
  }),
  Object.freeze({
    id: 'habitat', label: 'Habitat', cash: 360_000,
    // Was modular 3, timber 2, food 1, titanium 2.
    stocks: Object.freeze({ steel: 3, aluminium: 2, ceramics: 1, modular: 2, food: 1 }),
    register: 'Habitat. Stainless hull, aluminium, ceramic tiles, rooms, grain.',
  }),
  Object.freeze({
    id: 'drive', label: 'Drive', cash: 520_000,
    // Was oil 4, chips 3, robots 2.
    stocks: Object.freeze({ steel: 2, nickel: 2, copper: 1, lng: 2, 'rare-earth': 1 }),
    register: 'Drive. Stainless hull, nickel engines, methane.',
  }),
  Object.freeze({
    id: 'life', label: 'Life support', cash: 280_000,
    // Was food 3, people 2, fittings 1.
    stocks: Object.freeze({ chips: 2, platinum: 1, aluminium: 1, food: 2 }),
    register: 'Life support. Chips, platinum, aluminium, grain.',
  }),
  Object.freeze({
    id: 'stack', label: 'Landing stack', cash: 800_000,
    // Was modular 3, chips 3, robots 2, credit 1.
    stocks: Object.freeze({ steel: 4, ceramics: 2, lng: 2, robots: 2 }),
    register: 'Landing stack. Stainless hull, ceramic tiles, methane, robots.',
  }),
]);
export const WORLD_ROUTE_STATUSES = Object.freeze(['closed', 'open', 'embargoed', 'cut', 'held']);
export const WORLD_PULSE_TYPES = Object.freeze([
  'oil-embargo',
  'china-quota',
  'war-asylum',
  'open-boom',
]);

/**
 * Books a live damaging pulse actually hits. trade.js embargoes/opens these ids;
 * effects.js spends WORLD_PULSE_DAMAGE_BP against them. Keep both consumers on this table.
 */
export const WORLD_PULSE_BOOKS = Object.freeze({
  'oil-embargo': Object.freeze(['oil-hormuz-melbourne']),
  'china-quota': Object.freeze([
    'fittings-guangzhou-melbourne',
    'tiles-guangzhou-melbourne',
    'modular-hongkong-melbourne',
  ]),
  'war-asylum': Object.freeze(['asylum-levant-melbourne']),
  'open-boom': Object.freeze([]),
});

function city(row) {
  return Object.freeze({
    ...row,
    map: Object.freeze(row.map),
  });
}

export const WORLD_CITIES = Object.freeze([
  city({
    id: 'melbourne-inner',
    name: 'Melbourne Inner',
    register: 'Your city. Open supplier books. Sell biotech to Los Angeles, Tokyo, and London.',
    trait: 'inner',
    accent: '#c8763f',
    mapName: 'Melbourne',
    map: { lat: -37.81, lon: 144.96 },
    romanStart: true,
    startStatus: 'open',
    openingCashEstimate: 2_200_000,
  }),
  city({
    id: 'geelong-port',
    name: 'Geelong Port',
    register: 'Harbour market. Tankers land here when the inner books travel.',
    trait: 'harbour',
    accent: '#4f7f86',
    mapName: 'Geelong',
    map: { lat: -38.15, lon: 144.36 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 1_900_000,
  }),
  city({
    id: 'ballarat-gold',
    name: 'Ballarat Gold',
    register: 'Inland prestige. The carnival ticket lands here after Melbourne.',
    trait: 'gold',
    accent: '#b8924a',
    mapName: 'Ballarat',
    map: { lat: -37.56, lon: 143.85 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_400_000,
  }),
  city({
    id: 'sydney-harbour',
    name: 'Sydney Harbour',
    register: 'Sydney prices a line of credit on the listed tape, with repayments each beat.',
    trait: 'credit',
    accent: '#3f6f8c',
    mapName: 'Sydney',
    map: { lat: -33.87, lon: 151.21 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_300_000,
  }),
  city({
    id: 'adelaide-light',
    name: 'Adelaide Yards',
    register: 'Adelaide sells warships. Port Adelaide hulls steam the Bight.',
    trait: 'warships',
    accent: '#4a5a6a',
    mapName: 'Adelaide',
    map: { lat: -34.93, lon: 138.6 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 1_800_000,
  }),
  city({
    id: 'hobart-derwent',
    name: 'Hobart Derwent',
    register: 'Hobart sells beer. A steamer crosses Bass Strait in about two days.',
    trait: 'beer',
    accent: '#6a7f6a',
    mapName: 'Hobart',
    map: { lat: -42.88, lon: 147.33 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 1_700_000,
  }),
  city({
    id: 'singapore-roads',
    name: 'Singapore Roads',
    register: 'Singapore sells travellers. A steamer is a cargo ship. Pay to open the book.',
    trait: 'tourists',
    accent: '#8c5a3a',
    mapName: 'Singapore',
    map: { lat: 1.35, lon: 103.82 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_600_000,
  }),
  city({
    id: 'hongkong-peak',
    name: 'Hong Kong Peak',
    register: 'Hong Kong sells modular rooms. Whole floors land as crates. Pay to ship them by cargo ship.',
    trait: 'modular',
    accent: '#8c3a3a',
    mapName: 'Hong Kong',
    map: { lat: 22.32, lon: 114.17 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_800_000,
  }),
  city({
    id: 'guangzhou-fittings',
    name: 'Guangzhou Fittings',
    register: 'Guangzhou sells steel, glass, joinery, and tile for the works. Pay to ship the fittings and the tiles.',
    trait: 'fittings',
    accent: '#a45a3a',
    mapName: 'Guangzhou',
    map: { lat: 23.13, lon: 113.26 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_400_000,
  }),
  city({
    id: 'shanghai-bund',
    name: 'Shanghai Bund',
    register: 'Shanghai sells plant machinery. Pay to ship it by cargo ship.',
    trait: 'machinery',
    accent: '#6a5a3a',
    mapName: 'Shanghai',
    map: { lat: 31.23, lon: 121.47 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_500_000,
  }),
  city({
    id: 'taipei-chips',
    name: 'Taipei Chips',
    register: 'Taipei sells chips — electronics and silicon for works and tape. Pay to ship them by cargo ship.',
    trait: 'chips',
    accent: '#3a5a7a',
    mapName: 'Taipei',
    map: { lat: 25.03, lon: 121.57 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_700_000,
  }),
  city({
    id: 'hcmc-furniture',
    name: 'Ho Chi Minh Furniture',
    register: 'Ho Chi Minh sells furniture for the rooms. Pay to ship it by cargo ship.',
    trait: 'furniture',
    accent: '#6a7a3a',
    mapName: 'Ho Chi Minh',
    map: { lat: 10.82, lon: 106.63 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 1_600_000,
  }),
  city({
    id: 'jakarta-timber',
    name: 'Jakarta Timber',
    register: 'Jakarta sells hardwood for frames, floors, and formwork. Pay to ship it by cargo ship.',
    trait: 'timber',
    accent: '#7a5a2a',
    mapName: 'Jakarta',
    map: { lat: -6.21, lon: 106.85 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 1_800_000,
  }),
  city({
    id: 'gothenburg-mod',
    name: 'Gothenburg Modular',
    register: 'Gothenburg sells luxury modular rooms. Quiet, expensive crates. Pay to ship them by cargo ship.',
    trait: 'modular',
    accent: '#4a6a7a',
    mapName: 'Gothenburg',
    map: { lat: 57.71, lon: 11.97 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_900_000,
  }),
  city({
    id: 'hormuz-roads',
    name: 'Hormuz Roads',
    register: 'Hormuz sells crude oil for the works and the listed tape. Pay to ship it by tanker.',
    trait: 'oil',
    accent: '#8a6a2a',
    mapName: 'Hormuz',
    map: { lat: 26.57, lon: 56.25 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_100_000,
  }),
  city({
    id: 'starbase-texas',
    name: 'Starbase Texas',
    register: 'Starbase sells yard robots, Boca compute, and Starlink. Pay to fly each book from Boca.',
    trait: 'robots',
    accent: '#5a3a2a',
    mapName: 'Starbase',
    map: { lat: 25.99, lon: -97.16 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 3_100_000,
  }),
  city({
    id: 'levant-roads',
    name: 'Levant Roads',
    register: 'Levant is a war desk. People, not cargo. The asylum book opens when the guns do.',
    trait: 'war',
    accent: '#6a3a3a',
    mapName: 'Levant',
    map: { lat: 33.89, lon: 35.5 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 1_400_000,
  }),
  city({
    id: 'london-city',
    name: 'London City',
    register: 'London sells gas turbines and buys biotech. Turbines travel by cargo ship via Suez; biotech flies back.',
    trait: 'turbines',
    accent: '#4a4a6a',
    mapName: 'London',
    map: { lat: 51.51, lon: -0.13 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 3_200_000,
  }),
  city({
    id: 'santos-coffee',
    name: 'Santos Coffee',
    register: 'Santos sells Brazilian coffee. Pay to ship it by cargo ship via the Cape.',
    trait: 'coffee',
    accent: '#6a3a22',
    mapName: 'Santos',
    map: { lat: -23.96, lon: -46.33 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 1_900_000,
  }),
  city({
    id: 'valparaiso-copper',
    name: 'Valparaíso Copper',
    register: 'Valparaíso sells Chilean copper for the works. Pay to ship it across the South Pacific.',
    trait: 'copper',
    accent: '#b45a2a',
    mapName: 'Valparaíso',
    map: { lat: -33.05, lon: -71.62 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_000_000,
  }),
  city({
    id: 'accra-cocoa',
    name: 'Accra Cocoa',
    register: 'Accra sells Ghanaian cocoa for the kitchens. Pay to ship it by cargo ship via the Cape.',
    trait: 'cocoa',
    accent: '#5a2a18',
    mapName: 'Accra',
    map: { lat: 5.63, lon: 0.01 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 1_500_000,
  }),
  city({
    id: 'doha-lng',
    name: 'Doha LNG',
    register: 'Doha sells Qatari LNG for the works. Pay to ship it by tanker via Hormuz.',
    trait: 'lng',
    accent: '#3a6a7a',
    mapName: 'Doha',
    map: { lat: 25.91, lon: 51.58 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_800_000,
  }),
  city({
    id: 'nagoya-autos',
    name: 'Nagoya Autos',
    register: 'Nagoya sells Japanese cars. Pay to ship them by cargo ship across East Asia.',
    trait: 'autos',
    accent: '#3a4a6a',
    mapName: 'Nagoya',
    map: { lat: 35.09, lon: 136.88 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_600_000,
  }),
  city({
    id: 'bordeaux-wine',
    name: 'Bordeaux Wine',
    register: 'Bordeaux sells French wine for the rooms. Pay to ship it by cargo ship via Suez.',
    trait: 'wine',
    accent: '#6a2a3a',
    mapName: 'Bordeaux',
    map: { lat: 44.84, lon: -0.57 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_200_000,
  }),
  city({
    id: 'johannesburg-gold',
    name: 'Johannesburg Gold',
    register: 'Johannesburg sells bullion. Pay to fly it; gold does not wait on a steamer.',
    trait: 'gold',
    accent: '#c4a05a',
    mapName: 'Johannesburg',
    map: { lat: -26.20, lon: 28.05 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 3_000_000,
  }),
  city({
    id: 'mumbai-cotton',
    name: 'Mumbai Labour',
    register: 'Mumbai sells human labour. Households travel by cargo ship across the Indian Ocean.',
    trait: 'people',
    accent: '#69796e',
    mapName: 'Mumbai',
    map: { lat: 18.95, lon: 72.84 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 1_700_000,
  }),
  city({
    id: 'carrara-marble',
    name: 'Carrara Marble',
    register: 'Carrara sells Italian marble for the stone and facades. Pay to ship it via Suez.',
    trait: 'marble',
    accent: '#d0c8bc',
    mapName: 'Carrara',
    map: { lat: 44.08, lon: 10.10 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_100_000,
  }),
  city({
    id: 'antarctica-dome',
    name: 'Antarctic Dome',
    register: 'Raise a research dome on the ice. Ancient Biotech yields each beat the dome stands.',
    trait: 'ancient-biotech',
    accent: '#8ab4c8',
    mapName: 'Antarctica',
    map: { lat: -66.28, lon: 110.53 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 900_000,
  }),
  city({
    id: 'northpole-base',
    name: 'North Pole Base',
    register: 'Stand a polar base. Alien tech yields each beat the base holds.',
    trait: 'alien',
    accent: '#6a8aaa',
    mapName: 'North Pole',
    map: { lat: 90, lon: 0 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 900_000,
  }),
  city({
    id: 'losangeles-harbour',
    name: 'Los Angeles Harbour',
    register: 'Los Angeles buys biotech. Air freight across the Pacific, about three days.',
    trait: 'biotech',
    accent: '#4a6a8a',
    mapName: 'Los Angeles',
    map: { lat: 33.74, lon: -118.27 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_400_000,
  }),
  city({
    id: 'tokyo-harbour',
    name: 'Tokyo Harbour',
    register: 'Tokyo buys biotech. Air freight across East Asia, about two days.',
    trait: 'biotech',
    accent: '#5a4a6a',
    mapName: 'Tokyo',
    map: { lat: 35.68, lon: 139.76 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_700_000,
  }),
  city({
    id: 'port-hedland',
    name: 'Port Hedland',
    register: 'Port Hedland sells iron for hulls and plates. Pay to ship it by cargo ship.',
    trait: 'iron',
    accent: '#8a4a2a',
    mapName: 'Port Hedland',
    map: { lat: -20.31, lon: 118.58 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 1_900_000,
  }),
  city({
    id: 'greenbushes',
    name: 'Greenbushes',
    register: 'Greenbushes sells lithium for drone batteries. Pay to ship it by cargo ship.',
    trait: 'lithium',
    accent: '#8aa0b4',
    mapName: 'Greenbushes',
    map: { lat: -33.85, lon: 116.06 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_400_000,
  }),
  city({
    id: 'mount-weld',
    name: 'Mount Weld',
    register: 'Mount Weld sells rare earth for motors and guidance. Pay to ship it by cargo ship.',
    trait: 'rare-earth',
    accent: '#3a7a5a',
    mapName: 'Mount Weld',
    map: { lat: -28.86, lon: 122.55 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_800_000,
  }),
  city({
    id: 'eneabba-sands',
    name: 'Eneabba Sands',
    register: 'Eneabba Sands sells titanium for airframes. Pay to ship it by cargo ship.',
    trait: 'titanium',
    accent: '#8a8a9a',
    mapName: 'Eneabba',
    map: { lat: -29.82, lon: 115.27 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_500_000,
  }),
  city({
    id: 'kolwezi',
    name: 'Kolwezi',
    register: 'Kolwezi sells cobalt for batteries and magnets. Pay to ship it by cargo ship.',
    trait: 'cobalt',
    accent: '#2a4a8a',
    mapName: 'Kolwezi',
    map: { lat: -10.72, lon: 25.47 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_200_000,
  }),
  city({
    id: 'pohang',
    name: 'Pohang',
    register: 'Pohang sells stainless steel for hulls and frames. Pay to ship it by cargo ship.',
    trait: 'steel',
    accent: '#6a7278',
    mapName: 'Pohang',
    map: { lat: 36.02, lon: 129.34 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_400_000,
  }),
  city({
    id: 'morowali',
    name: 'Morowali',
    register: 'Morowali sells nickel for engines and batteries. Pay to ship it by cargo ship.',
    trait: 'nickel',
    accent: '#9a9080',
    mapName: 'Morowali',
    map: { lat: -2.83, lon: 122.16 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_500_000,
  }),
  city({
    id: 'balama',
    name: 'Balama',
    register: 'Balama sells graphite for anodes. Pay to ship it by cargo ship.',
    trait: 'graphite',
    accent: '#2a2a2e',
    mapName: 'Balama',
    map: { lat: -13.35, lon: 38.57 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_100_000,
  }),
  city({
    id: 'gladstone',
    name: 'Gladstone',
    register: 'Gladstone sells aluminium from the smelter. Pay to ship it by cargo ship.',
    trait: 'aluminium',
    accent: '#c8ccd0',
    mapName: 'Gladstone',
    // Harbour CBD sits on water in the 960×480 mask; 151.08 is inland of the
    // port, still the Gladstone industrial belt (Yarwun).
    map: { lat: -23.84, lon: 151.08 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_300_000,
  }),
  city({
    id: 'seto',
    name: 'Seto',
    register: 'Seto sells technical ceramics for tiles and liners. Pay to ship it by cargo ship.',
    trait: 'ceramics',
    accent: '#c49a72',
    mapName: 'Seto',
    // Real Seto (35.22, 137.10) shares Nagoya's mask cell. One cell east is
    // the Mino–Seto ceramics belt (Toki), so the desks do not stack.
    map: { lat: 35.25, lon: 137.36 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_600_000,
  }),
  city({
    id: 'rustenburg',
    name: 'Rustenburg',
    register: 'Rustenburg sells platinum from the Bushveld. Pay to ship it by cargo ship.',
    trait: 'platinum',
    accent: '#dce2e6',
    mapName: 'Rustenburg',
    map: { lat: -25.65, lon: 27.24 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 3_200_000,
  }),
  city({
    id: 'cape-flattery',
    name: 'Cape Flattery',
    register: 'Cape Flattery sells silica sand for the silicon furnace. Pay to ship it by cargo ship.',
    trait: 'quartz',
    accent: '#c8c0a8',
    mapName: 'Cape Flattery',
    blurb: 'Cape Flattery ships silica sand for the silicon furnace.',
    // Real cape harbour sits on water in the 960×480 mask; 145.20 is inland of
    // the cape, still the Hope Vale / Cape York silica sands belt.
    map: { lat: -15.00, lon: 145.20 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 1_900_000,
  }),
  city({
    id: 'hsinchu',
    name: 'Hsinchu',
    register: 'Hsinchu sells wafers, dies, and silicon for the fab. Pay to ship them by cargo ship.',
    trait: 'wafer',
    accent: '#3a6a8a',
    mapName: 'Hsinchu',
    blurb: 'Hsinchu sells wafers, dies, and silicon for the fab.',
    // Real harbour cell is water. 24.75, 121.00 is the Science Park inland
    // belt, one cell west-south of Taipei so the desks do not stack.
    map: { lat: 24.75, lon: 121.00 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_700_000,
  }),
  city({
    id: 'rotorua',
    name: 'Rotorua',
    register: 'Rotorua sells pulp and paper from the mill. Pay to ship them by cargo ship.',
    trait: 'pulp',
    accent: '#5a7a4a',
    mapName: 'Rotorua',
    blurb: 'Rotorua sells pulp and paper from the mill.',
    map: { lat: -38.14, lon: 176.25 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 1_800_000,
  }),
  city({
    // Foundry city. Pohang keeps hull steel; Sheffield takes the casting book.
    id: 'sheffield',
    name: 'Sheffield',
    register: 'Sheffield sells steel castings for the works hall. Pay to ship them by cargo ship.',
    trait: 'castings',
    accent: '#6a5a4a',
    mapName: 'Sheffield',
    blurb: 'Sheffield sells steel castings for the works hall.',
    map: { lat: 53.38, lon: -1.47 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_200_000,
  }),
  city({
    // Kansai heavy electrical. Valparaíso keeps the copper book; Osaka takes windings.
    id: 'osaka',
    name: 'Osaka',
    register: 'Osaka sells copper windings for motors and turbines. Pay to ship them by cargo ship.',
    trait: 'windings',
    accent: '#4a5a7a',
    mapName: 'Osaka',
    blurb: 'Osaka sells copper windings for motors and turbines.',
    map: { lat: 34.69, lon: 135.50 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_500_000,
  }),
  city({
    // Ningbo is the magnet capital. Mount Weld keeps the rare-earth ore book.
    id: 'ningbo',
    name: 'Ningbo',
    register: 'Ningbo sells rare-earth magnets for motors and turbines. Pay to ship them by cargo ship.',
    trait: 'magnets',
    accent: '#3a5a4a',
    mapName: 'Ningbo',
    blurb: 'Ningbo sells rare-earth magnets for motors and turbines.',
    map: { lat: 29.87, lon: 121.54 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_400_000,
  }),
  city({
    // BHP Olympic Dam, South Australia. On-mask land cell 845,321. Inland of
    // Adelaide so the desks do not stack.
    id: 'olympic-dam',
    name: 'Olympic Dam',
    register: 'Olympic Dam sells uranium for the centrifuge works. Pay to ship it by cargo ship.',
    trait: 'uranium',
    accent: '#c4b45a',
    mapName: 'Olympic Dam',
    blurb: 'A Roxby Downs pit. Uranium for the centrifuge works.',
    map: { lat: -30.44, lon: 136.89 },
    romanStart: false,
    startStatus: 'locked',
    openingCashEstimate: 2_600_000,
  }),
]);

export const WORLD_CITY_BY_ID = Object.freeze(
  Object.fromEntries(WORLD_CITIES.map((entry) => [entry.id, entry])),
);

export const WORLD_EDGES = Object.freeze([
  Object.freeze({ from: 'melbourne-inner', to: 'geelong-port', kind: 'rail' }),
  Object.freeze({ from: 'melbourne-inner', to: 'ballarat-gold', kind: 'rail' }),
  Object.freeze({ from: 'melbourne-inner', to: 'sydney-harbour', kind: 'rail' }),
  Object.freeze({ from: 'melbourne-inner', to: 'adelaide-light', kind: 'rail' }),
  Object.freeze({ from: 'melbourne-inner', to: 'hobart-derwent', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'singapore-roads', kind: 'steamer' }),
  Object.freeze({ from: 'singapore-roads', to: 'jakarta-timber', kind: 'steamer' }),
  Object.freeze({ from: 'singapore-roads', to: 'hcmc-furniture', kind: 'steamer' }),
  Object.freeze({ from: 'singapore-roads', to: 'hongkong-peak', kind: 'steamer' }),
  Object.freeze({ from: 'hongkong-peak', to: 'guangzhou-fittings', kind: 'steamer' }),
  Object.freeze({ from: 'hongkong-peak', to: 'shanghai-bund', kind: 'steamer' }),
  Object.freeze({ from: 'hongkong-peak', to: 'taipei-chips', kind: 'steamer' }),
  Object.freeze({ from: 'singapore-roads', to: 'hormuz-roads', kind: 'tanker' }),
  Object.freeze({ from: 'singapore-roads', to: 'levant-roads', kind: 'steamer' }),
  Object.freeze({ from: 'singapore-roads', to: 'london-city', kind: 'steamer' }),
  Object.freeze({ from: 'london-city', to: 'gothenburg-mod', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'starbase-texas', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'santos-coffee', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'valparaiso-copper', kind: 'steamer' }),
  Object.freeze({ from: 'london-city', to: 'accra-cocoa', kind: 'steamer' }),
  Object.freeze({ from: 'hormuz-roads', to: 'doha-lng', kind: 'tanker' }),
  Object.freeze({ from: 'hongkong-peak', to: 'nagoya-autos', kind: 'steamer' }),
  Object.freeze({ from: 'london-city', to: 'bordeaux-wine', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'johannesburg-gold', kind: 'steamer' }),
  Object.freeze({ from: 'singapore-roads', to: 'mumbai-cotton', kind: 'steamer' }),
  Object.freeze({ from: 'london-city', to: 'carrara-marble', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'antarctica-dome', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'northpole-base', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'losangeles-harbour', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'tokyo-harbour', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'port-hedland', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'greenbushes', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'mount-weld', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'eneabba-sands', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'kolwezi', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'pohang', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'morowali', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'balama', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'gladstone', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'seto', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'rustenburg', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'cape-flattery', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'hsinchu', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'rotorua', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'sheffield', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'osaka', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'ningbo', kind: 'steamer' }),
  Object.freeze({ from: 'melbourne-inner', to: 'olympic-dam', kind: 'steamer' }),
]);

const WORLD_TRADE_ROUTE_ROWS = [
  Object.freeze({
    id: 'oil-hormuz-melbourne',
    good: 'oil',
    from: 'hormuz-roads',
    to: 'melbourne-inner',
    via: Object.freeze(['singapore-roads']),
    kind: 'tanker',
    openFee: 180_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Crude oil for the works and the listed tape. Travels by tanker.',
  }),
  Object.freeze({
    id: 'fittings-guangzhou-melbourne',
    good: 'fittings',
    from: 'guangzhou-fittings',
    to: 'melbourne-inner',
    via: Object.freeze(['hongkong-peak', 'singapore-roads']),
    kind: 'steamer',
    openFee: 200_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Steel, glass, and joinery for the works. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'tiles-guangzhou-melbourne',
    good: 'tiles',
    from: 'guangzhou-fittings',
    to: 'melbourne-inner',
    via: Object.freeze(['hongkong-peak', 'singapore-roads']),
    kind: 'steamer',
    openFee: 110_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Tile and stone from Guangzhou for the floors. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'modular-hongkong-melbourne',
    good: 'modular',
    from: 'hongkong-peak',
    to: 'melbourne-inner',
    via: Object.freeze(['singapore-roads']),
    kind: 'steamer',
    openFee: 240_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Modular rooms. Whole floors land as crates. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'modular-gothenburg-melbourne',
    good: 'modular',
    from: 'gothenburg-mod',
    to: 'melbourne-inner',
    via: Object.freeze(['london-city', 'singapore-roads']),
    kind: 'steamer',
    openFee: 280_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Swedish luxury modular rooms. Quiet, expensive crates. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'furniture-hcmc-melbourne',
    good: 'furniture',
    from: 'hcmc-furniture',
    to: 'melbourne-inner',
    via: Object.freeze(['singapore-roads']),
    kind: 'steamer',
    openFee: 150_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Furniture for the rooms. Travels by cargo ship.',
  }),

  Object.freeze({
    id: 'timber-jakarta-melbourne',
    good: 'timber',
    from: 'jakarta-timber',
    to: 'melbourne-inner',
    via: Object.freeze(['singapore-roads']),
    kind: 'steamer',
    openFee: 160_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Hardwood for frames, floors, and formwork. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'chips-taipei-melbourne',
    good: 'chips',
    from: 'taipei-chips',
    to: 'melbourne-inner',
    via: Object.freeze(['hongkong-peak', 'singapore-roads']),
    kind: 'steamer',
    openFee: 260_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Electronics and silicon for works and tape. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'robots-starbase-melbourne',
    good: 'robots',
    from: 'starbase-texas',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 320_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Yard robots from Boca. Travels by air freight.',
  }),
  Object.freeze({
    id: 'compute-starbase-melbourne',
    good: 'compute',
    from: 'starbase-texas',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 300_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Boca compute. Travels by air freight.',
  }),
  Object.freeze({
    id: 'starlink-starbase-melbourne',
    good: 'starlink',
    from: 'starbase-texas',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 280_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Starlink from Boca. Travels by air freight.',
  }),
  Object.freeze({
    id: 'tourists-singapore-melbourne',
    good: 'tourists',
    from: 'singapore-roads',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 120_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Travellers fill hotels and inner rooms. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'credit-sydney-melbourne',
    good: 'credit',
    from: 'sydney-harbour',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'rail',
    openFee: CREDIT_ARRANGEMENT_FEE,
    playerOpenable: true,
    direction: 'inbound',
    loan: true,
    register: 'A line of credit sized to Melbourne’s listed tape. Arrangement fee, then repayments each beat.',
  }),
  Object.freeze({
    id: 'machinery-shanghai-melbourne',
    good: 'machinery',
    from: 'shanghai-bund',
    to: 'melbourne-inner',
    via: Object.freeze(['hongkong-peak', 'singapore-roads']),
    kind: 'steamer',
    openFee: 220_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Shanghai plant machinery. Travels by cargo ship.',
  }),
  Object.freeze({
    // Shanghai already hosts the machinery book. China exported HS 321519
    // printing ink to Australia in 2024; it is not the world's largest
    // exporter (Germany leads the global table). Keep the desk for network.
    id: 'ink-shanghai-melbourne',
    good: 'ink',
    from: 'shanghai-bund',
    to: 'melbourne-inner',
    via: Object.freeze(['hongkong-peak', 'singapore-roads']),
    kind: 'steamer',
    openFee: 80_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Shanghai printing ink for the press. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'warships-adelaide-melbourne',
    good: 'warships',
    from: 'adelaide-light',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 250_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Port Adelaide warships. Travels by sea along the Bight.',
  }),
  Object.freeze({
    id: 'beer-hobart-melbourne',
    good: 'beer',
    from: 'hobart-derwent',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 40_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Hobart beer for the rooms. Crosses Bass Strait in about two days.',
  }),
  Object.freeze({
    id: 'turbines-london-melbourne',
    good: 'turbines',
    from: 'london-city',
    to: 'melbourne-inner',
    via: Object.freeze(['singapore-roads']),
    kind: 'steamer',
    openFee: 260_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'London gas turbines. Travels by cargo ship via Suez.',
  }),
  Object.freeze({
    id: 'asylum-levant-melbourne',
    good: 'asylum',
    from: 'levant-roads',
    to: 'melbourne-inner',
    via: Object.freeze(['singapore-roads']),
    kind: 'steamer',
    openFee: 0,
    playerOpenable: false,
    direction: 'inbound',
    register: 'War books. People, not cargo. Opens when the guns do. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'biotech-melbourne-london',
    good: 'biotech',
    from: 'melbourne-inner',
    to: 'london-city',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 200_000,
    playerOpenable: true,
    direction: 'outbound',
    capacity: 1,
    register: 'Biotech to London. Air freight, about two days. Export cash each beat.',
  }),
  Object.freeze({
    id: 'biotech-melbourne-losangeles',
    good: 'biotech',
    from: 'melbourne-inner',
    to: 'losangeles-harbour',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 220_000,
    playerOpenable: true,
    direction: 'outbound',
    capacity: 1,
    register: 'Biotech to Los Angeles. Air freight across the Pacific, about three days. Export cash each beat.',
  }),
  Object.freeze({
    id: 'biotech-melbourne-tokyo',
    good: 'biotech',
    from: 'melbourne-inner',
    to: 'tokyo-harbour',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 180_000,
    playerOpenable: true,
    direction: 'outbound',
    capacity: 1,
    register: 'Biotech to Tokyo. Air freight across East Asia, about two days. Export cash each beat.',
  }),
  Object.freeze({
    id: 'coffee-santos-melbourne',
    good: 'coffee',
    from: 'santos-coffee',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 140_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Brazilian coffee for the kitchens. Travels by cargo ship via the Cape of Good Hope.',
  }),
  Object.freeze({
    id: 'copper-valparaiso-melbourne',
    good: 'copper',
    from: 'valparaiso-copper',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 190_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Chilean copper for the works. Travels by cargo ship across the South Pacific.',
  }),
  Object.freeze({
    id: 'cocoa-accra-melbourne',
    good: 'cocoa',
    from: 'accra-cocoa',
    to: 'melbourne-inner',
    via: Object.freeze(['london-city']),
    kind: 'steamer',
    openFee: 130_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Ghanaian cocoa for the kitchens. Travels by cargo ship via the Cape of Good Hope.',
  }),
  Object.freeze({
    id: 'lng-doha-melbourne',
    good: 'lng',
    from: 'doha-lng',
    to: 'melbourne-inner',
    via: Object.freeze(['hormuz-roads']),
    kind: 'tanker',
    openFee: 210_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Qatari LNG for the works. Travels by tanker via Hormuz and the Indian Ocean.',
  }),
  Object.freeze({
    id: 'autos-nagoya-melbourne',
    good: 'autos',
    from: 'nagoya-autos',
    to: 'melbourne-inner',
    via: Object.freeze(['hongkong-peak', 'singapore-roads']),
    kind: 'steamer',
    openFee: 220_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Japanese cars. Travels by cargo ship across East Asia.',
  }),
  Object.freeze({
    id: 'wine-bordeaux-melbourne',
    good: 'wine',
    from: 'bordeaux-wine',
    to: 'melbourne-inner',
    via: Object.freeze(['london-city', 'singapore-roads']),
    kind: 'steamer',
    openFee: 170_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'French wine for the rooms. Travels by cargo ship via Suez.',
  }),
  Object.freeze({
    id: 'gold-johannesburg-melbourne',
    good: 'gold',
    from: 'johannesburg-gold',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 240_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Witwatersrand bullion. Travels by air freight; gold does not wait on a steamer.',
  }),
  Object.freeze({
    id: 'people-mumbai-melbourne',
    good: 'people',
    from: 'mumbai-cotton',
    to: 'melbourne-inner',
    via: Object.freeze(['singapore-roads']),
    kind: 'steamer',
    openFee: 90_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Human labour from Mumbai. Travels by cargo ship across the Indian Ocean.',
  }),
  Object.freeze({
    id: 'marble-carrara-melbourne',
    good: 'marble',
    from: 'carrara-marble',
    to: 'melbourne-inner',
    via: Object.freeze(['london-city', 'singapore-roads']),
    kind: 'steamer',
    openFee: 160_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Carrara marble for the stone and facades. Travels by cargo ship via Suez.',
  }),
  Object.freeze({
    id: 'iron-hedland-melbourne',
    good: 'iron',
    from: 'port-hedland',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 140_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Pilbara iron for hulls and plates. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'lithium-greenbushes-melbourne',
    good: 'lithium',
    from: 'greenbushes',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 240_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Greenbushes lithium for drone batteries. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'rare-earth-weld-melbourne',
    good: 'rare-earth',
    from: 'mount-weld',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 300_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Mount Weld rare earth for motors and guidance. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'titanium-eneabba-melbourne',
    good: 'titanium',
    from: 'eneabba-sands',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 280_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Eneabba titanium for airframes. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'cobalt-kolwezi-melbourne',
    good: 'cobalt',
    from: 'kolwezi',
    to: 'melbourne-inner',
    via: Object.freeze(['johannesburg-gold']),
    kind: 'steamer',
    openFee: 250_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Kolwezi cobalt for batteries and magnets. Travels by cargo ship via the Cape.',
  }),
  Object.freeze({
    id: 'steel-pohang-melbourne',
    good: 'steel',
    from: 'pohang',
    to: 'melbourne-inner',
    via: Object.freeze(['tokyo-harbour']),
    kind: 'steamer',
    openFee: 220_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Pohang stainless for hulls and frames. Travels by cargo ship across East Asia.',
  }),
  Object.freeze({
    id: 'nickel-morowali-melbourne',
    good: 'nickel',
    from: 'morowali',
    to: 'melbourne-inner',
    via: Object.freeze(['singapore-roads']),
    kind: 'steamer',
    openFee: 260_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Morowali nickel for engines and batteries. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'graphite-balama-melbourne',
    good: 'graphite',
    from: 'balama',
    to: 'melbourne-inner',
    via: Object.freeze(['johannesburg-gold']),
    kind: 'steamer',
    openFee: 190_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Balama graphite for anodes. Travels by cargo ship via the Cape.',
  }),
  Object.freeze({
    id: 'aluminium-gladstone-melbourne',
    good: 'aluminium',
    from: 'gladstone',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 230_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Gladstone aluminium from the smelter. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'ceramics-seto-melbourne',
    good: 'ceramics',
    from: 'seto',
    to: 'melbourne-inner',
    via: Object.freeze(['nagoya-autos', 'hongkong-peak', 'singapore-roads']),
    kind: 'steamer',
    openFee: 270_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Seto technical ceramics for tiles and liners. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'platinum-rustenburg-melbourne',
    good: 'platinum',
    from: 'rustenburg',
    to: 'melbourne-inner',
    via: Object.freeze(['johannesburg-gold']),
    kind: 'steamer',
    openFee: 420_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Rustenburg platinum from the Bushveld. Travels by cargo ship via the Cape.',
  }),
  Object.freeze({
    id: 'ancient-biotech-antarctica-melbourne',
    good: 'ancient-biotech',
    from: 'antarctica-dome',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 240_000,
    playerOpenable: true,
    direction: 'inbound',
    outpost: 'dome',
    setupLabel: 'Raise the research dome',
    register: 'An Antarctic research dome. Ancient Biotech yields each beat the dome stands.',
  }),
  Object.freeze({
    id: 'alien-northpole-melbourne',
    good: 'alien',
    from: 'northpole-base',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 280_000,
    playerOpenable: true,
    direction: 'inbound',
    outpost: 'base',
    setupLabel: 'Stand the polar base',
    register: 'A North Pole base. Yields alien tech each beat it holds.',
  }),
  Object.freeze({
    id: 'grain-melbourne-singapore',
    good: 'food',
    from: 'melbourne-inner',
    to: 'singapore-roads',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 90_000,
    playerOpenable: true,
    direction: 'outbound',
    capacity: 1,
    register: 'Grain crates to Singapore. Travels by cargo ship. Export cash each beat.',
  }),
  Object.freeze({
    id: 'fittings-melbourne-jakarta',
    good: 'fittings',
    from: 'melbourne-inner',
    to: 'jakarta-timber',
    via: Object.freeze(['singapore-roads']),
    kind: 'steamer',
    openFee: 110_000,
    playerOpenable: true,
    direction: 'outbound',
    capacity: 1,
    register: 'Works fittings to Jakarta. Travels by cargo ship. Export cash each beat.',
  }),
  Object.freeze({
    id: 'chips-melbourne-tokyo',
    good: 'chips',
    from: 'melbourne-inner',
    to: 'tokyo-harbour',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 130_000,
    playerOpenable: true,
    direction: 'outbound',
    capacity: 1,
    register: 'Chips to Tokyo. Air freight across East Asia. Export cash each beat.',
  }),
  Object.freeze({
    id: 'milk-powder-melbourne-shanghai',
    good: 'milk-powder',
    from: 'melbourne-inner',
    to: 'shanghai-bund',
    via: Object.freeze(['singapore-roads', 'hongkong-peak']),
    kind: 'steamer',
    openFee: 120_000,
    playerOpenable: true,
    direction: 'outbound',
    capacity: 1,
    register: 'Baby milk powder to Shanghai. Travels by cargo ship. Export cash each beat.',
  }),
  Object.freeze({
    id: 'wine-melbourne-london',
    good: 'wine',
    from: 'melbourne-inner',
    to: 'london-city',
    via: Object.freeze(['singapore-roads']),
    kind: 'steamer',
    openFee: 150_000,
    playerOpenable: true,
    direction: 'outbound',
    capacity: 1,
    register: 'Australian wine to London. Travels by cargo ship. Export cash each beat.',
  }),
  Object.freeze({
    id: 'beef-melbourne-jakarta',
    good: 'beef',
    from: 'melbourne-inner',
    to: 'jakarta-timber',
    via: Object.freeze(['singapore-roads']),
    kind: 'steamer',
    openFee: 130_000,
    playerOpenable: true,
    direction: 'outbound',
    capacity: 1,
    register: 'Beef to Jakarta. Travels by cargo ship. Export cash each beat.',
  }),
  Object.freeze({
    id: 'education-melbourne-tokyo',
    good: 'education',
    from: 'melbourne-inner',
    to: 'tokyo-harbour',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 200_000,
    playerOpenable: true,
    direction: 'outbound',
    capacity: 1,
    requiresCampus: true,
    register: 'Tuition to Tokyo. One campus desk. Export cash each beat.',
  }),
  Object.freeze({
    id: 'steel-melbourne-tokyo',
    good: 'steel',
    from: 'melbourne-inner',
    to: 'tokyo-harbour',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 140_000,
    playerOpenable: true,
    direction: 'outbound',
    capacity: 1,
    register: 'City steel to Tokyo. Travels by cargo ship. Export cash each beat.',
  }),
  Object.freeze({
    id: 'bibles-melbourne-singapore',
    good: 'bibles',
    from: 'melbourne-inner',
    to: 'singapore-roads',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 90_000,
    playerOpenable: true,
    direction: 'outbound',
    capacity: 1,
    register: 'Pressed bibles to Singapore. Travels by cargo ship. Export cash each beat.',
  }),

  // V4.6 Wave 1 — every Yard good gets an inbound book. MAKE stays the cheaper
  // long-run path (mine openFee ~$140k–$160k so importCost > makeCost).
  // V4.6 Wave 1b re-homes homeless / overloaded W1 books onto dedicated desks.
  Object.freeze({
    id: 'food-singapore-melbourne',
    good: 'food',
    from: 'singapore-roads',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 90_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Singapore rice and grain for the inner kitchens. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'milk-powder-hobart-melbourne',
    good: 'milk-powder',
    from: 'hobart-derwent',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 120_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Hobart dairy formula. Crosses Bass Strait. A cheaper grade than Melbourne offtake.',
  }),
  Object.freeze({
    id: 'beef-santos-melbourne',
    good: 'beef',
    from: 'santos-coffee',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 130_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Santos beef from the Brazilian yards. Travels by cargo ship via the Cape.',
  }),
  Object.freeze({
    id: 'education-mumbai-melbourne',
    good: 'education',
    from: 'mumbai-cotton',
    to: 'melbourne-inner',
    via: Object.freeze(['singapore-roads']),
    kind: 'steamer',
    openFee: 200_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Mumbai tuition crates. Travels by cargo ship across the Indian Ocean.',
  }),
  Object.freeze({
    id: 'pig-iron-pohang-melbourne',
    good: 'pig-iron',
    from: 'pohang',
    to: 'melbourne-inner',
    via: Object.freeze(['tokyo-harbour']),
    kind: 'steamer',
    openFee: 180_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Pohang pig-iron for the BOF. Travels by cargo ship across East Asia.',
  }),
  Object.freeze({
    id: 'bauxite-gladstone-melbourne',
    good: 'bauxite',
    from: 'gladstone',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 140_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Gladstone bauxite for the Bayer plant. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'alumina-gladstone-melbourne',
    good: 'alumina',
    from: 'gladstone',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 200_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Gladstone alumina for Hall-Héroult. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'quartz-flattery-melbourne',
    good: 'quartz',
    from: 'cape-flattery',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 160_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Cape Flattery silica sand for the silicon furnace. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'silicon-hsinchu-melbourne',
    good: 'silicon',
    from: 'hsinchu',
    to: 'melbourne-inner',
    via: Object.freeze(['hongkong-peak', 'singapore-roads']),
    kind: 'steamer',
    openFee: 180_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Hsinchu metallurgical silicon. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'polysilicon-hsinchu-melbourne',
    good: 'polysilicon',
    from: 'hsinchu',
    to: 'melbourne-inner',
    via: Object.freeze(['hongkong-peak', 'singapore-roads']),
    kind: 'steamer',
    openFee: 200_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Hsinchu polysilicon for the Czochralski pull. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'wafer-hsinchu-melbourne',
    good: 'wafer',
    from: 'hsinchu',
    to: 'melbourne-inner',
    via: Object.freeze(['hongkong-peak', 'singapore-roads']),
    kind: 'steamer',
    openFee: 240_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Hsinchu wafers for lithography. Travels by air freight.',
  }),
  Object.freeze({
    id: 'die-hsinchu-melbourne',
    good: 'die',
    from: 'hsinchu',
    to: 'melbourne-inner',
    via: Object.freeze(['hongkong-peak', 'singapore-roads']),
    kind: 'steamer',
    openFee: 250_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Hsinchu dies for chip packing. Travels by air freight.',
  }),
  Object.freeze({
    id: 'kaolin-seto-melbourne',
    good: 'kaolin',
    from: 'seto',
    to: 'melbourne-inner',
    via: Object.freeze(['nagoya-autos', 'hongkong-peak', 'singapore-roads']),
    kind: 'steamer',
    openFee: 140_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Seto kaolin for the kiln. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'magnets-ningbo-melbourne',
    good: 'magnets',
    from: 'ningbo',
    to: 'melbourne-inner',
    via: Object.freeze(['shanghai-bund', 'hongkong-peak', 'singapore-roads']),
    kind: 'steamer',
    openFee: 280_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Ningbo rare-earth magnets. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'windings-osaka-melbourne',
    good: 'windings',
    from: 'osaka',
    to: 'melbourne-inner',
    via: Object.freeze(['tokyo-harbour', 'hongkong-peak', 'singapore-roads']),
    kind: 'steamer',
    openFee: 160_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Osaka copper windings. Travels by cargo ship across East Asia.',
  }),
  Object.freeze({
    id: 'motors-nagoya-melbourne',
    good: 'motors',
    from: 'nagoya-autos',
    to: 'melbourne-inner',
    via: Object.freeze(['hongkong-peak', 'singapore-roads']),
    kind: 'steamer',
    openFee: 200_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Nagoya electric motors. Travels by cargo ship across East Asia.',
  }),
  Object.freeze({
    id: 'frames-pohang-melbourne',
    good: 'frames',
    from: 'pohang',
    to: 'melbourne-inner',
    via: Object.freeze(['tokyo-harbour']),
    kind: 'steamer',
    openFee: 180_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Pohang steel frames. Travels by cargo ship across East Asia.',
  }),
  Object.freeze({
    id: 'castings-sheffield-melbourne',
    good: 'castings',
    from: 'sheffield',
    to: 'melbourne-inner',
    via: Object.freeze(['london-city', 'singapore-roads']),
    kind: 'steamer',
    openFee: 170_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Sheffield steel castings. Travels by cargo ship via Suez.',
  }),
  Object.freeze({
    id: 'materials-pohang-melbourne',
    good: 'materials',
    from: 'pohang',
    to: 'melbourne-inner',
    via: Object.freeze(['tokyo-harbour']),
    kind: 'steamer',
    openFee: 80_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Pohang slag for the works. Travels by cargo ship across East Asia.',
  }),
  Object.freeze({
    id: 'pulp-rotorua-melbourne',
    good: 'pulp',
    from: 'rotorua',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 100_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Rotorua pulp for the paper mill. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'paper-rotorua-melbourne',
    good: 'paper',
    from: 'rotorua',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 120_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Rotorua paper for the press. Travels by cargo ship.',
  }),
  Object.freeze({
    id: 'bibles-london-melbourne',
    good: 'bibles',
    from: 'london-city',
    to: 'melbourne-inner',
    via: Object.freeze(['singapore-roads']),
    kind: 'steamer',
    openFee: 90_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'London press bibles. Travels by cargo ship via Suez.',
  }),
  Object.freeze({
    id: 'uranium-olympic-melbourne',
    good: 'uranium',
    from: 'olympic-dam',
    to: 'melbourne-inner',
    via: Object.freeze([]),
    kind: 'steamer',
    openFee: 280_000,
    playerOpenable: true,
    direction: 'inbound',
    register: 'Olympic Dam uranium for the centrifuge works. Travels by cargo ship.',
  }),
];

export const WORLD_TRADE_ROUTES = Object.freeze(WORLD_TRADE_ROUTE_ROWS.map(withRouteTransit));

export const WORLD_TRADE_BY_ID = Object.freeze(
  Object.fromEntries(WORLD_TRADE_ROUTES.map((route) => [route.id, route])),
);

/**
 * Four military chokes. Positions are globe lat/lon. `guards` names existing books.
 * Stationing a choke halves pulse damage (integer bp) on those books.
 * Every choke must guard ≥1 book a live damaging pulse actually hits (WORLD_PULSE_BOOKS).
 */
export const WORLD_CHOKEPOINTS = Object.freeze([
  Object.freeze({
    id: 'hormuz',
    label: 'Hormuz',
    map: Object.freeze({ lat: 26.57, lon: 56.25 }),
    // Strait of Hormuz is the oil/LNG choke; oil-embargo hits oil-hormuz-melbourne.
    guards: Object.freeze(['oil-hormuz-melbourne', 'lng-doha-melbourne']),
    pulseDamageBp: 1600,
  }),
  Object.freeze({
    id: 'suez',
    label: 'Suez',
    map: Object.freeze({ lat: 30.45, lon: 32.35 }),
    // Levant/Europe steamers pass Suez; war-asylum hits asylum-levant-melbourne.
    guards: Object.freeze([
      'asylum-levant-melbourne',
      'turbines-london-melbourne',
      'wine-bordeaux-melbourne',
      'marble-carrara-melbourne',
    ]),
    pulseDamageBp: 1200,
  }),
  Object.freeze({
    id: 'bass-strait',
    label: 'Bass Strait',
    map: Object.freeze({ lat: -40.38, lon: 145.72 }),
    // Bass is Melbourne's southern throat; china-quota fittings still berth through it.
    guards: Object.freeze(['beer-hobart-melbourne', 'fittings-guangzhou-melbourne']),
    pulseDamageBp: 800,
  }),
  Object.freeze({
    id: 'pacific-lane',
    label: 'Pacific lane',
    map: Object.freeze({ lat: -20.0, lon: -150.0 }),
    // Trans-Pacific HK/Guangzhou crates; china-quota hits modular and tiles.
    guards: Object.freeze([
      'modular-hongkong-melbourne',
      'tiles-guangzhou-melbourne',
      'copper-valparaiso-melbourne',
    ]),
    pulseDamageBp: 1000,
  }),
]);

export const WORLD_CHOKE_BY_ID = Object.freeze(
  Object.fromEntries(WORLD_CHOKEPOINTS.map((row) => [row.id, row])),
);

export function booksGuardedByStationedChokes(stationedIds) {
  const stationed = new Set(stationedIds ?? []);
  const books = new Set();
  for (const choke of WORLD_CHOKEPOINTS) {
    if (!stationed.has(choke.id)) continue;
    for (const book of choke.guards) books.add(book);
  }
  return books;
}

export function pulseDamageBp(pulseType, stationed = false) {
  const full = WORLD_PULSE_DAMAGE_BP[pulseType] ?? 0;
  if (!Number.isInteger(full) || full <= 0) return 0;
  return stationed ? Math.floor(full / 2) : full;
}

/** Per-beat spawn chance after beat 6. A live war-asylum pulse raises it to 900. */
export const THREAT_BASE_BP = 300;
export const WAR_ASYLUM_THREAT_BP = 900;
export const PIRATE_APPROACH_BEATS = 3;
export const DRONE_APPROACH_BEATS = 2;
export const NAVY_BUILD_BEATS = 2;
export const DRONE_BUILD_BEATS = 1;
export const ARMY_BUILD_BEATS = 1;
export const FACILITY_REPAIR_COST = 120_000;
/** Applied to each port class cap while `port` is damaged. 5000 bp = half. */
export const PORT_DAMAGE_CAPACITY_BP = 5000;

export const WORLD_THREAT_KINDS = Object.freeze(['pirates', 'drones']);
export const WORLD_SHIPYARD_KINDS = Object.freeze(['navy', 'drone', 'army']);
export const CITY_MILITARY_UNIT_KINDS = Object.freeze(['tank', 'drone', 'officer']);
export const THREAT_INTERCEPTOR_KINDS = Object.freeze(['navy', 'drone', 'army', 'officer']);

export const FORCE_BUILD_BEATS = Object.freeze({
  navy: NAVY_BUILD_BEATS,
  drone: DRONE_BUILD_BEATS,
  army: ARMY_BUILD_BEATS,
});

export const WORLD_THREAT_KIND_LABEL = Object.freeze({
  pirates: 'Pirates',
  drones: 'Drones',
});

export const WORLD_DRONE_HOSTILE_DESKS = Object.freeze([
  'levant-roads', 'jakarta-timber', 'accra-cocoa', 'hormuz-roads',
]);

/**
 * Authored pirate basins. `books` are existing WORLD_TRADE_ROUTES ids whose
 * sea lane passes the strait. Bass is Melbourne's home water.
 */
export const WORLD_THREAT_BASINS = Object.freeze([
  Object.freeze({
    id: 'malacca',
    label: 'Malacca',
    map: Object.freeze({ lat: 2.5, lon: 101.2 }),
    books: Object.freeze([
      'timber-jakarta-melbourne',
      'furniture-hcmc-melbourne',
      'tourists-singapore-melbourne',
      'grain-melbourne-singapore',
      'fittings-melbourne-jakarta',
      'food-singapore-melbourne',
      'bibles-melbourne-singapore',
    ]),
  }),
  Object.freeze({
    id: 'bab',
    label: 'Bab-el-Mandeb',
    map: Object.freeze({ lat: 12.58, lon: 43.33 }),
    books: Object.freeze([
      'asylum-levant-melbourne',
      'turbines-london-melbourne',
      'wine-bordeaux-melbourne',
      'marble-carrara-melbourne',
      'people-mumbai-melbourne',
      'bibles-london-melbourne',
    ]),
  }),
  Object.freeze({
    id: 'guinea',
    label: 'Gulf of Guinea',
    map: Object.freeze({ lat: 3.0, lon: 2.5 }),
    books: Object.freeze([
      'cocoa-accra-melbourne',
    ]),
  }),
  Object.freeze({
    id: 'sulu',
    label: 'Sulu',
    map: Object.freeze({ lat: 6.0, lon: 121.0 }),
    books: Object.freeze([
      'chips-taipei-melbourne',
      'nickel-morowali-melbourne',
      'silicon-hsinchu-melbourne',
      'die-hsinchu-melbourne',
      'wafer-hsinchu-melbourne',
    ]),
  }),
  Object.freeze({
    id: 'bass',
    label: 'Bass Strait',
    map: Object.freeze({ lat: -40.38, lon: 145.72 }),
    near: 'melbourne',
    books: Object.freeze([
      'beer-hobart-melbourne',
      'warships-adelaide-melbourne',
      'milk-powder-hobart-melbourne',
      'fittings-guangzhou-melbourne',
    ]),
  }),
]);

export const WORLD_THREAT_BASIN_BY_ID = Object.freeze(
  Object.fromEntries(WORLD_THREAT_BASINS.map((row) => [row.id, row])),
);

/** Civ3 analog: raise a wing from crates + cash. Space age is catalogued, locked. */
export const WORLD_FORCE_KINDS = Object.freeze(['army', 'navy', 'air', 'drone', 'nuke']);
export const WORLD_SPACE_KINDS = Object.freeze(['satellite', 'rocket', 'ship']);

export const WORLD_FORCE_RECIPES = Object.freeze({
  army: Object.freeze({
    label: 'Army',
    register: 'Battalion. Iron plates, copper, and oil. One trained officer.',
    cash: 25_000_000,
    stocks: Object.freeze({ iron: 3, copper: 1, oil: 1 }),
    age: 'industrial',
  }),
  navy: Object.freeze({
    label: 'Navy',
    register: 'Ship. Iron hull, timber, robots, chips, rare earth. One officer.',
    cash: 250_000_000,
    stocks: Object.freeze({ iron: 4, timber: 1, robots: 2, chips: 2, 'rare-earth': 2 }),
    age: 'industrial',
  }),
  air: Object.freeze({
    label: 'Air',
    register: 'Squadron. Titanium frames, chips, rare earth, robots. One officer.',
    cash: 400_000_000,
    stocks: Object.freeze({ titanium: 3, chips: 3, 'rare-earth': 2, robots: 2 }),
    age: 'industrial',
  }),
  drone: Object.freeze({
    label: 'Drone',
    register: 'Squadron. Robots, chips, lithium, cobalt, rare earth, graphite, nickel. One officer.',
    cash: 600_000,
    stocks: Object.freeze({
      robots: 2, chips: 2, lithium: 1, cobalt: 1, 'rare-earth': 1, graphite: 1, nickel: 1,
    }),
    age: 'industrial',
  }),
  nuke: Object.freeze({
    label: 'Nuke',
    register: 'A deterrent. Enriched uranium, a warhead, a missile body. One officer.',
    cash: 1_500_000_000,
    stocks: Object.freeze({
      'enriched-uranium': 1, warhead: 1, 'missile-body': 1,
    }),
    age: 'industrial',
  }),
  satellite: Object.freeze({
    label: 'Satellite',
    register: 'A book in orbit. Not this sitting.',
    cash: 400_000,
    stocks: Object.freeze({ chips: 4, robots: 2, credit: 1 }),
    age: 'space',
  }),
  rocket: Object.freeze({
    label: 'Rocket',
    register: 'A stack from Boca. Not this sitting.',
    cash: 520_000,
    stocks: Object.freeze({ oil: 4, chips: 3, robots: 2 }),
    age: 'space',
  }),
  ship: Object.freeze({
    label: 'Spaceship',
    register: 'A hull for the dark. Not this sitting.',
    cash: 800_000,
    stocks: Object.freeze({ modular: 4, chips: 4, robots: 3, credit: 2 }),
    age: 'space',
  }),
});

/**
 * Train the biomind. V4.6 Wave 1 user order: two standing biolabs, $100b cash,
 * and 100× the V4.5 stock bill. Those counts exceed STOCK_CAP (99), so crates
 * feed a training total on ambition (biomindFed) instead of raising the cap.
 * Asylum crates are refugees for human trials.
 *
 * Honest $100B math (prices never down): the V4.2 honest fixture earns
 * $18.75m offtake a beat after handling, ~$741m Head office at beat 40.
 * $100B is ~135 of those campaigns. Implemented as ordered; earning scale,
 * tape-funded training, or a longer campaign is the next call.
 */
export const WORLD_BIOMIND_COST = 100_000_000_000;
export const WORLD_BIOMIND_BIOLABS = 2;
export const WORLD_BIOMIND_STOCKS = Object.freeze({
  chips: 500, compute: 300, robots: 200, credit: 200, asylum: 200,
  'ancient-biotech': 100,
  biotech: 100,
});
export const WORLD_BIOMIND_STOCK_KEYS = Object.freeze(Object.keys(WORLD_BIOMIND_STOCKS));
export const WORLD_BIOMIND_BEATS = 4;
export const WORLD_BIOMIND_FED_CAP = 10_000;

export function emptyBiomindFed() {
  const fed = {};
  for (const good of WORLD_BIOMIND_STOCK_KEYS) fed[good] = 0;
  return fed;
}
/** Standard delay classes on the training run. Political is the heaviest. */
export const WORLD_BIOMIND_DELAY_BP = Object.freeze({
  accident: 70,
  environmental: 90,
  political: 180,
});

/**
 * Institution build kits. The Yard ships the kit; the city consumes the record
 * at placement. Freight cash is authored here — the design table listed goods
 * only. Scale: crate count plus dearness (robots/chips/marble).
 */
export const WORLD_BUILD_KIT_IDS = Object.freeze([
  'space-works', 'international-exchange', 'missionary-school', 'officer-school', 'biolab',
  'ai-incubator',
]);

/**
 * Yard kit id → city form id. Most kits share the form id. The incubator kit
 * ships as `ai-incubator` and places as `incubator`.
 */
export const WORLD_KIT_CITY_FORM = Object.freeze({
  'ai-incubator': 'incubator',
});

export function cityFormForKit(kitId) {
  return WORLD_KIT_CITY_FORM[kitId] ?? kitId;
}

export function kitIdForCityForm(formId) {
  for (const [kitId, form] of Object.entries(WORLD_KIT_CITY_FORM)) {
    if (form === formId) return kitId;
  }
  return formId;
}

export const WORLD_BUILD_KITS = Object.freeze({
  'space-works': Object.freeze({
    id: 'space-works',
    label: 'space works',
    action: 'Ship the build kit — space works',
    register: 'Steel, robots, and chips for the space works pad.',
    cash: 200_000,
    stocks: Object.freeze({ steel: 4, robots: 2, chips: 1 }),
  }),
  'international-exchange': Object.freeze({
    id: 'international-exchange',
    label: 'international exchange',
    action: 'Ship the build kit — international exchange',
    register: 'Steel, marble, and chips for the exchange.',
    cash: 180_000,
    stocks: Object.freeze({ steel: 2, marble: 2, chips: 2 }),
  }),
  'missionary-school': Object.freeze({
    id: 'missionary-school',
    label: 'missionary school',
    action: 'Ship the build kit — missionary school',
    register: 'Timber and marble for the missionary school.',
    cash: 80_000,
    stocks: Object.freeze({ timber: 2, marble: 1 }),
  }),
  'officer-school': Object.freeze({
    id: 'officer-school',
    label: 'officer school',
    action: 'Ship the build kit — officer school',
    register: 'Steel and timber for the officer school.',
    cash: 90_000,
    stocks: Object.freeze({ steel: 2, timber: 1 }),
  }),
  biolab: Object.freeze({
    id: 'biolab',
    label: 'biolab',
    action: 'Ship the build kit — biolab',
    register: 'Steel, chips, and ceramics for the biolab.',
    cash: 160_000,
    stocks: Object.freeze({ steel: 2, chips: 2, ceramics: 1 }),
  }),
  'ai-incubator': Object.freeze({
    id: 'ai-incubator',
    label: 'AI incubator',
    action: 'Ship the build kit — AI incubator',
    register: 'Steel, chips, and compute for the incubator.',
    cash: 180_000,
    stocks: Object.freeze({ steel: 2, chips: 2, compute: 1 }),
  }),
});

