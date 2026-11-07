// World → city cargo: P13 port choreography (crane, conveyor, trucks, rail).
// This adapter only reads WORLD_RUN_KEY (and the matching city-exports payload).
// It never writes city or world storage. Replay-once / seen-beat / poll stay.

import * as THREE from 'three';
import { cityExtent, PITCH, ROAD } from '../core/grid.js';
import {
  CITY_EXPORTS_KEY,
  WORLD_RUN_KEY,
  inspectWorldRun,
  readCityExports,
  worldStoreGet,
} from '../core/world/envelope.js';
import { beatDeliveries } from '../core/world/deliveries.js';
import { liveDisasters } from '../core/world/disasters.js';
import { portHoldRows } from '../core/world/port-storage.js';
import {
  CITY_EXPORT_GOODS,
  CITY_FORM_CONSUMPTION,
  CITY_FORM_YIELDS,
} from '../core/city-exports.js';
import {
  CITY_EXPORT_TO_YARD,
  WORLD_GOODS,
  exportCashForGood,
  handlingFeeForGood,
} from '../core/world/catalog.js';
import { deskNeedsVoxelCargo } from '../ui/world-map/desk-cargo.js';
import {
  EXCHANGE_CHIP_CAP,
  ExchangeChipsLayer,
} from './exchange-chips.js';
import {
  PortLogisticsDirector,
  bindPortDemoConsole,
} from './port/logistics-anim.js';
import { PortAmbientLoop } from './port/port-ambient.js';

export const TOKEN_SCALE = 4.8;
/** Cargo token scale-up on vehicles (~1.6×). TOKEN_SCALE stays 4.8 for hop pins. */
export const CARGO_TOKEN_SCALE_MUL = 1.6;
const TOKEN_BASE_Y = 0.3;
export const WORLD_DELIVERY_DURATION_SECONDS = 4.8;
const LANE_GAP = 8.8;
export const WORLD_DELIVERY_LANE_GAP = LANE_GAP;
const QUAY_OFFSET = 5.5;
const DOCK_INSET = 1.8;
const STAGGER_SECONDS = 0.125;
export const WORLD_DELIVERY_HOPS = 5;
export const WORLD_DELIVERY_HOP_HEIGHT = 4.6;
export const WORLD_DELIVERY_MAX_LIVE = 12;
export const WORLD_DELIVERY_POLL_MS = 1000;
export const WORLD_DELIVERY_SHIP_GOOD = 'warships';
export const WORLD_DELIVERY_SHIP_SCALE = 16.8;
export const WORLD_DELIVERY_BERTH_SECONDS = 0.85;
export const WORLD_DELIVERY_DEPART_SECONDS = 1.35;
/** Per-row travel at city scale. Index picks a value in this inclusive range. */
export const WORLD_EXCHANGE_TRAVEL_MIN = 6;
export const WORLD_EXCHANGE_TRAVEL_MAX = 14;
/** Deterministic spawn stagger from log-row index. No RNG. */
export const WORLD_EXCHANGE_STAGGER_STEP = 0.65;
/** First journey (any movement) is visible within this many seconds of the beat. */
export const WORLD_EXCHANGE_FIRST_JOURNEY_MAX = 2;
/** Index-0 travel only. First hop + completion chip fit in 8s of the beat. */
export const WORLD_EXCHANGE_FIRST_TRAVEL_MAX = 4;
/** Hold the token at the destination so a chip and vehicle share one frame. */
export const WORLD_EXCHANGE_COMPLETE_HOLD = 0.45;
export const WORLD_EXCHANGE_BOB_AMP = 0.11;
export const WORLD_EXCHANGE_PUFF_DURATION = 0.55;
export const WORLD_EXCHANGE_VOXEL_SCALE = 7;
export const WORLD_EXCHANGE_TRUCK_SCALE = 5.4;
const SHIP_SEA_OFFSET = 36;
const CARGO_URL = (good) => `./assets/models/world-cargo/${good}.glb`;
export { CARGO_URL };

/** Goods that have a painted GLB in assets/models/world-cargo. Missing → crate. */
export const WORLD_CARGO_GLB_GOODS = Object.freeze([
  'alien', 'aluminium', 'ancient-biotech', 'asylum', 'autos', 'beer', 'biotech',
  'castings', 'ceramics', 'chips', 'cocoa', 'coffee', 'cobalt', 'compute',
  'copper', 'credit', 'fittings', 'food', 'furniture', 'gold', 'graphite',
  'iron', 'lithium', 'lng', 'machinery', 'magnets', 'marble', 'modular',
  'nickel', 'oil', 'people', 'platinum', 'pulp', 'quartz', 'rare-earth',
  'robots', 'silicon', 'starlink', 'steel', 'tiles', 'timber', 'titanium',
  'tourists', 'turbines', 'uranium', 'warships', 'windings', 'wine',
]);
const CARGO_GLB_SET = new Set(WORLD_CARGO_GLB_GOODS);

export function cargoHasGlb(good) {
  return CARGO_GLB_SET.has(good);
}

export function isWorldRunStorageEvent(event) {
  return Boolean(event && event.key === WORLD_RUN_KEY);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function smoothstep(low, high, value) {
  const t = clamp01((value - low) / Math.max(1e-6, high - low));
  return t * t * (3 - 2 * t);
}

function extentFor(city) {
  return city?.extent ?? cityExtent(city?.blocksX ?? 4, city?.blocksZ ?? 4);
}

function distanceFromWater(point, edge, extent) {
  if (edge === 'north') return point.z;
  if (edge === 'south') return extent.z - point.z;
  if (edge === 'west') return point.x;
  return extent.x - point.x;
}

function yardPoint(city, edge, extent) {
  const yards = (city?.blockCores ?? [])
    .filter((core) => core.useId === 'works-yard' && core.centre)
    .slice()
    .sort((left, right) =>
      distanceFromWater(right.centre, edge, extent)
      - distanceFromWater(left.centre, edge, extent)
      || left.id.localeCompare(right.id));
  const centre = yards[0]?.centre ?? {
    x: Math.min(extent.x - ROAD, ROAD + PITCH + 24),
    z: Math.min(extent.z - ROAD, ROAD + PITCH + 24),
  };
  return { x: centre.x, y: 0.3, z: centre.z };
}

/**
 * The quay sits just over the water-side rim. Lanes fan at both ends so a whole
 * harvested book does not collapse into one unreadable model.
 */
export function worldDeliveryEndpoints(city, direction = 'in', lane = 0) {
  const extent = extentFor(city);
  const edge = city?.waterEdge ?? 'east';
  const laneIndex = Math.max(0, Math.floor(lane));
  const laneColumn = laneIndex % 3;
  const laneRow = Math.floor(laneIndex / 3);
  const yard = yardPoint(city, edge, extent);

  if (direction === 'land' || direction === 'road') {
    const landSlot = (0.75 + laneColumn) * LANE_GAP;
    const landRow = laneRow * LANE_GAP * 0.72;
    const yardBayDepth = laneColumn * 2.8 + landRow * 0.4;
    const gate = { x: extent.x * 0.5, y: 0.3, z: extent.z * 0.5 };
    if (edge === 'north') {
      gate.x += landSlot;
      gate.z = ROAD + landRow;
      yard.x += landSlot * 0.5;
      yard.z += yardBayDepth;
    } else if (edge === 'south') {
      gate.x += landSlot;
      gate.z = extent.z - ROAD - landRow;
      yard.x += landSlot * 0.5;
      yard.z -= yardBayDepth;
    } else if (edge === 'west') {
      gate.x = ROAD + landRow;
      gate.z += landSlot;
      yard.x += yardBayDepth;
      yard.z += landSlot * 0.5;
    } else {
      gate.x = extent.x - ROAD - landRow;
      gate.z += landSlot;
      yard.x -= yardBayDepth;
      yard.z += landSlot * 0.5;
    }
    return { start: gate, end: yard };
  }

  const inbound = direction !== 'out';
  // Inbound and outbound occupy opposite halves of the quay. Extra rows step
  // farther over the water instead of folding routes back through one knot.
  const laneSlot = (inbound ? -1 : 1) * (0.75 + laneColumn) * LANE_GAP;
  const rowDepth = laneRow * LANE_GAP * 0.72;
  const yardBayDepth = laneColumn * 2.8 + rowDepth * 0.4;
  const yardLaneSlot = laneSlot * 0.5;
  const quay = { x: extent.x * 0.5, y: 0.3, z: extent.z * 0.5 };

  if (edge === 'north') {
    quay.x += laneSlot;
    quay.z = inbound ? DOCK_INSET + rowDepth : -QUAY_OFFSET - rowDepth;
    yard.x += yardLaneSlot;
    yard.z += yardBayDepth;
  } else if (edge === 'south') {
    quay.x += laneSlot;
    quay.z = inbound
      ? extent.z - DOCK_INSET - rowDepth
      : extent.z + QUAY_OFFSET + rowDepth;
    yard.x += yardLaneSlot;
    yard.z -= yardBayDepth;
  } else if (edge === 'west') {
    quay.x = inbound ? DOCK_INSET + rowDepth : -QUAY_OFFSET - rowDepth;
    quay.z += laneSlot;
    yard.x += yardBayDepth;
    yard.z += yardLaneSlot;
  } else {
    quay.x = inbound
      ? extent.x - DOCK_INSET - rowDepth
      : extent.x + QUAY_OFFSET + rowDepth;
    quay.z += laneSlot;
    yard.x -= yardBayDepth;
    yard.z += yardLaneSlot;
  }

  return inbound
    ? { start: quay, end: yard }
    : { start: yard, end: quay };
}

/** Hull sits on the water-side quay; departs further seaward past the rim.
 *  `direction: 'in'` berths at inbound lane-0; `'out'` (default) at outbound lane-0. */
export function worldDeliveryShipPath(city, direction = 'out') {
  const inbound = direction === 'in';
  const ends = worldDeliveryEndpoints(city, inbound ? 'in' : 'out', 0);
  const dock = inbound ? ends.start : ends.end;
  const edge = city?.waterEdge ?? 'east';
  const sea = { x: dock.x, y: dock.y, z: dock.z };
  if (edge === 'north') sea.z -= SHIP_SEA_OFFSET;
  else if (edge === 'south') sea.z += SHIP_SEA_OFFSET;
  else if (edge === 'west') sea.x -= SHIP_SEA_OFFSET;
  else sea.x += SHIP_SEA_OFFSET;
  const yaw = edge === 'north' || edge === 'south' ? 0 : Math.PI / 2;
  return { dock, sea, yaw };
}

/** Inbound ship hops wait for the hull to dock, then stagger. Others start immediately. */
export function worldDeliveryHopStartAge(delivery, stagger = 0) {
  const delay = hopDirectionFor(delivery) === 'in' && delivery?.via === 'ship'
    ? WORLD_DELIVERY_BERTH_SECONDS
    : 0;
  return delay ? -(delay + stagger) : stagger;
}

/** Per-seed beat watermark: a lower or equal beat on the same seed is stale. */
export function isMonotonicWorldBeat(lastSeed, lastBeat, world) {
  if (!world) return false;
  if (lastSeed !== world.worldSeed) return true;
  if (!Number.isInteger(lastBeat)) return true;
  return world.beat > lastBeat;
}

export function hopDirectionFor(delivery) {
  if (delivery?.via === 'road' || delivery?.via === 'land') return 'land';
  if (delivery?.via === 'yard' || delivery?.cause === 'overflow') return 'in';
  return delivery?.dir === 'out' ? 'out' : 'in';
}

/** STEEL is the demo path: ship berths, voxel token unloads, truck hauls inland. */
export function isSteelDemoRow(delivery) {
  return delivery?.good === 'steel';
}

export function vehicleForDelivery(delivery) {
  if (isSteelDemoRow(delivery) && hopDirectionFor(delivery) !== 'land') return 'truck';
  return hopDirectionFor(delivery) === 'land' ? 'truck' : 'ship';
}

export function cargoTokenKind(good) {
  if (cargoHasGlb(good)) return 'glb';
  if (deskNeedsVoxelCargo(good)) return 'voxel';
  return 'crate';
}

export function exchangeTravelSeconds(index) {
  const slot = Math.max(0, Math.floor(index));
  const span = WORLD_EXCHANGE_TRAVEL_MAX - WORLD_EXCHANGE_TRAVEL_MIN;
  const seconds = WORLD_EXCHANGE_TRAVEL_MIN + (slot % (span + 1));
  if (slot === 0) return Math.min(seconds, WORLD_EXCHANGE_FIRST_TRAVEL_MAX);
  return seconds;
}

export function exchangeStaggerSeconds(index) {
  if (index <= 0) return 0;
  return Math.max(0, Math.floor(index)) * WORLD_EXCHANGE_STAGGER_STEP;
}

export function cargoTokenScale(vehicle) {
  const mul = TOKEN_SCALE * CARGO_TOKEN_SCALE_MUL;
  return vehicle === 'truck' ? mul * 0.55 : mul;
}

/** Worst-case first-journey wait: poll backup + inbound-ship berth, capped at 2s.
 *  Same-page beats spawn the index-0 hop with voxel-crate fallback (no GLB await). */
export function firstJourneyLatencySeconds() {
  const poll = WORLD_DELIVERY_POLL_MS / 1000;
  const wait = poll + WORLD_DELIVERY_BERTH_SECONDS;
  return Math.min(wait, WORLD_EXCHANGE_FIRST_JOURNEY_MAX);
}

/**
 * Form class a standing building must belong to. Never `'generic'`.
 * `'port'` is the apron fallback when nothing of the class stands.
 */
export const ENDPOINT_CLASS_FORMS = Object.freeze({
  factory: Object.freeze([
    'factory-light', 'hammerbarn', 'dairy-processor', 'winery', 'biolab',
    'terafab', 'steelworks', 'smelter', 'kiln', 'works-hall', 'pulp-mill',
    'printing-press', 'refinery', 'space-works',
  ]),
  warehouse: Object.freeze([
    'warehouse-brick', 'warehouse-datacentre', 'warehouse-richmond-loft',
  ]),
  abattoir: Object.freeze(['cattle-abattoir']),
  works: Object.freeze([
    'grain-plot', 'community-garden', 'veggie-patch',
    'school-primary', 'school-high', 'university-old-arts',
    'missionary-school', 'officer-school', 'international-exchange',
    'tower-office', 'office-lowrise', 'cafe-corner', 'petrol-station',
    'works-yard',
  ]),
  port: Object.freeze([]),
});

const FORM_TO_CLASS = new Map();
for (const [cls, forms] of Object.entries(ENDPOINT_CLASS_FORMS)) {
  for (const formId of forms) FORM_TO_CLASS.set(formId, cls);
}

export function endpointClassForForm(formId) {
  return FORM_TO_CLASS.get(formId) ?? 'port';
}

const GOOD_CLASS = new Map();

function assignGoodClass(cls, goods) {
  for (const good of goods) GOOD_CLASS.set(good, cls);
}

assignGoodClass('factory', [
  'fittings', 'modular', 'chips', 'robots', 'steel', 'pig-iron', 'alumina',
  'silicon', 'polysilicon', 'wafer', 'die', 'magnets', 'windings', 'motors',
  'frames', 'castings', 'machinery', 'turbines', 'autos', 'compute', 'starlink',
  'alien', 'biotech', 'ancient-biotech', 'ceramics', 'titanium', 'platinum',
  'gold', 'lng', 'marble', 'milk-powder', 'milkPowder', 'wine', 'ink',
  'enriched-uranium', 'warhead', 'missile-body', 'tech',
]);
assignGoodClass('warehouse', [
  'oil', 'timber', 'furniture', 'tiles', 'food', 'coffee', 'cocoa', 'beer',
  'copper', 'iron', 'lithium', 'rare-earth', 'graphite', 'bauxite', 'quartz',
  'kaolin', 'pulp', 'paper', 'materials', 'nickel', 'aluminium', 'uranium',
  'cobalt',
]);
assignGoodClass('abattoir', ['beef']);
assignGoodClass('works', [
  'people', 'tourists', 'asylum', 'education', 'students', 'educationSeats',
  'bibles', 'credit', 'grain',
]);
assignGoodClass('port', ['warships']);

function preferClassFromForms(formIds, good) {
  const classes = formIds.map(endpointClassForForm);
  if (good === 'materials' && classes.includes('warehouse')) return 'warehouse';
  if (classes.includes('abattoir')) return 'abattoir';
  if (classes.includes('factory')) return 'factory';
  if (classes.includes('warehouse')) return 'warehouse';
  if (classes.includes('works')) return 'works';
  return null;
}

export function endpointClassForGood(good) {
  if (good == null || good === '') return 'port';
  const named = GOOD_CLASS.get(good);
  if (named) return named;
  const yieldForms = [];
  for (const [formId, yields] of Object.entries(CITY_FORM_YIELDS)) {
    if (yields[good] > 0) yieldForms.push(formId);
  }
  const cityGood = Object.keys(CITY_EXPORT_TO_YARD)
    .find((city) => CITY_EXPORT_TO_YARD[city] === good);
  if (cityGood) {
    for (const [formId, yields] of Object.entries(CITY_FORM_YIELDS)) {
      if (yields[cityGood] > 0) yieldForms.push(formId);
    }
  }
  const fromYields = preferClassFromForms(yieldForms, cityGood ?? good);
  if (fromYields) return fromYields;
  const consumedForms = [];
  for (const [formId, row] of Object.entries(CITY_FORM_CONSUMPTION)) {
    if (row[good] > 0) consumedForms.push(formId);
  }
  const fromConsumption = preferClassFromForms(consumedForms, good);
  if (fromConsumption) return fromConsumption;
  return 'port';
}

function freezeLeg(amount, plate, source, extra) {
  return extra
    ? Object.freeze({ amount, plate, source, ...extra })
    : Object.freeze({ amount, plate, source });
}

function citySettleLeg(good, sign = 1) {
  return freezeLeg(
    sign * exportCashForGood(good),
    'cash',
    'exportCash',
    { ledger: 'city' },
  );
}

/**
 * Cash legs for a logged delivery row. `row.amount` / `row.cash` win verbatim.
 * Otherwise harvest/export read the same catalog the beat ledger charged
 * (`handlingFeeForGood`, `exportCashForGood`) onto Head-office tape.
 * Rows with no verbatim amount and no charged catalog leg map to NO legs —
 * their cash (when any) posts on a different ledger row that maps itself.
 * Truth beats never-silence (V5.0 critic R2/R3).
 */
export function cashLegsFromDelivery(row) {
  if (!row || typeof row !== 'object') return Object.freeze([]);
  const plate = row.plate === 'cash' ? 'cash' : 'tape';
  if (Number.isInteger(row.amount)) {
    return Object.freeze([freezeLeg(row.amount, plate, 'amount')]);
  }
  if (Number.isInteger(row.cash)) {
    return Object.freeze([freezeLeg(row.cash, plate, 'cash')]);
  }
  if (row.cause === 'export-departure') {
    return Object.freeze([]);
  }
  if (row.cause === 'harvest') {
    return Object.freeze([
      freezeLeg(-handlingFeeForGood(row.good), 'tape', 'handlingFee'),
    ]);
  }
  if (row.cause === 'export' || row.cause === 'export-shipment') {
    return Object.freeze([
      freezeLeg(-handlingFeeForGood(row.good), 'tape', 'handlingFee'),
      freezeLeg(exportCashForGood(row.good), 'tape', 'exportCash'),
    ]);
  }
  if (row.cause === 'overflow' || row.good == null || row.good === '') {
    return Object.freeze([]);
  }
  // Unrecognised causes (process draws, scrap) move goods whose cash —
  // when any — posts on a different ledger row that maps itself. No
  // verbatim amount on THIS row means no chip; catalog substitution here
  // was the same invented-number fault the critic caught in
  // _finishJourney (V5.0 R2).
  return Object.freeze([]);
}

function standingFormsOfHolding(holding, status) {
  const slots = holding?.padSlots;
  if (slots && typeof slots === 'object') {
    const slotted = [];
    for (const key of ['A', 'B']) {
      const slot = slots[key];
      if (slot?.status === 'standing' && typeof slot.archetypeId === 'string') {
        slotted.push({ key, slot });
      }
    }
    if (slotted.length) {
      const whole = slotted.find((row) => row.slot.whole === true);
      if (whole) return [whole.slot.archetypeId];
      return slotted.map((row) => row.slot.archetypeId);
    }
    if (holding?.siteCleared) return [];
  }
  if (holding?.construction) return [];
  const primary = status?.builtArchetypeId ?? holding?.archetypeId ?? null;
  return typeof primary === 'string' && primary ? [primary] : [];
}

export function standingEndpointSites(city, state) {
  const sites = [];
  for (const core of city?.blockCores ?? []) {
    if (typeof core?.useId === 'string' && core.centre) {
      sites.push({
        id: String(core.id ?? core.useId),
        formId: core.useId,
        x: core.centre.x,
        y: 0.3,
        z: core.centre.z,
      });
    }
  }
  for (const civic of city?.civicUses ?? []) {
    if (typeof civic?.useId === 'string' && civic.centre) {
      sites.push({
        id: String(civic.id ?? civic.useId),
        formId: civic.useId,
        x: civic.centre.x,
        y: 0.3,
        z: civic.centre.z,
      });
    }
  }
  const holdings = state?.holdings ?? {};
  const parcels = city?.parcels ?? {};
  for (const parcelId of Object.keys(holdings).sort()) {
    const holding = holdings[parcelId];
    const forms = standingFormsOfHolding(holding, state?.parcelStatus?.[parcelId]);
    const centre = parcels[parcelId]?.centre;
    if (!centre) continue;
    for (const formId of forms) {
      sites.push({
        id: `${parcelId}:${formId}`,
        formId,
        x: centre.x,
        y: 0.3,
        z: centre.z,
      });
    }
  }
  sites.sort((left, right) => left.id.localeCompare(right.id));
  return sites;
}

export function resolveStandingEndpoint(city, state, endpointClass, lane = 0) {
  if (!endpointClass || endpointClass === 'port') return null;
  const allowed = new Set(ENDPOINT_CLASS_FORMS[endpointClass] ?? []);
  if (!allowed.size) return null;
  const matches = standingEndpointSites(city, state)
    .filter((site) => allowed.has(site.formId));
  if (!matches.length) return null;
  const pick = matches[Math.max(0, Math.floor(lane)) % matches.length];
  return { x: pick.x, y: pick.y, z: pick.z, formId: pick.formId, id: pick.id };
}

function journeyPoints(city, state, delivery, { hopDir, lane, vehicle, endpointClass }) {
  if (!city) return { start: null, end: null };
  const inbound = hopDir !== 'out';
  const standing = resolveStandingEndpoint(city, state, endpointClass, lane);
  const land = worldDeliveryEndpoints(city, 'land', lane);
  const sea = worldDeliveryEndpoints(city, inbound ? 'in' : 'out', lane);
  if (isSteelDemoRow(delivery) && hopDir !== 'land') {
    const berth = inbound ? sea.start : sea.end;
    const inland = standing ?? berth;
    return inbound ? { start: berth, end: inland } : { start: inland, end: berth };
  }
  const fringe = vehicle === 'truck'
    ? land.start
    : (inbound ? sea.start : sea.end);
  const inland = standing ?? (inbound ? sea.start : sea.end);
  return inbound
    ? { start: fringe, end: inland }
    : { start: inland, end: fringe };
}

export function journeysFromDeliveryRows(rows, options = {}) {
  const city = options.city;
  const state = options.state;
  const list = Array.isArray(rows) ? rows : [];
  const lanes = { in: 0, out: 0, land: 0 };
  return Object.freeze(list.map((delivery, index) => {
    const hopDir = hopDirectionFor(delivery);
    const laneKey = hopDir === 'land' ? 'land' : hopDir;
    const lane = lanes[laneKey] ?? 0;
    lanes[laneKey] = lane + 1;
    const vehicle = vehicleForDelivery(delivery);
    const endpointClass = endpointClassForGood(delivery?.good);
    const points = journeyPoints(city, state, delivery, {
      hopDir, lane, vehicle, endpointClass,
    });
    return Object.freeze({
      id: delivery?.id ?? `row:${index}`,
      index,
      lane,
      good: delivery?.good ?? null,
      dir: delivery?.dir === 'out' ? 'out' : 'in',
      via: delivery?.via ?? null,
      cause: delivery?.cause ?? null,
      vehicle,
      endpointClass,
      chipsAt: isSteelDemoRow(delivery) ? 'berth' : 'end',
      stagger: exchangeStaggerSeconds(index),
      travelSeconds: exchangeTravelSeconds(index),
      start: points.start,
      end: points.end,
      chips: cashLegsFromDelivery(delivery),
      delivery,
    });
  }));
}

export function exchangeGoodsCovered() {
  return Object.freeze({
    cityExport: CITY_EXPORT_GOODS,
    world: WORLD_GOODS,
  });
}

export { EXCHANGE_CHIP_CAP };

/** sessionStorage key: last city-board beat whose journeys were shown. */
export const WORLD_DELIVERY_SEEN_BEAT_KEY = 'dd:world-deliveries:seen-beat';

export function readSeenBeat(storage) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    const raw = storage.getItem(WORLD_DELIVERY_SEEN_BEAT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const beat = parsed?.beat;
    const seed = parsed?.seed;
    if (!Number.isInteger(beat)) return null;
    return Object.freeze({ beat, seed: seed ?? null });
  } catch {
    return null;
  }
}

export function writeSeenBeat(storage, world) {
  if (!storage || typeof storage.setItem !== 'function' || !world) return false;
  try {
    storage.setItem(
      WORLD_DELIVERY_SEEN_BEAT_KEY,
      JSON.stringify({ beat: world.beat, seed: world.worldSeed ?? null }),
    );
    return true;
  } catch {
    return false;
  }
}

export function defaultSessionStore() {
  try {
    const store = globalThis.sessionStorage;
    if (store && typeof store.getItem === 'function') return store;
  } catch {
    /* private mode / node */
  }
  return null;
}

/**
 * Pure replay-once gate. Same rows + same seen-beat → no respawn.
 * Fresh beat → spawn. Load with unplayed rows (seen null) → replayed.
 */
export function replayOnceDecision(world, seen, rows) {
  if (!world || !Number.isInteger(world.beat)) {
    return Object.freeze({ action: 'none', why: 'no-world' });
  }
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return Object.freeze({ action: 'none', why: 'no-rows' });
  }
  const seenBeat = seen?.beat;
  const seenSeed = seen?.seed;
  if (seenSeed === world.worldSeed && seenBeat === world.beat) {
    return Object.freeze({ action: 'none', why: 'already-shown' });
  }
  if (
    seenSeed === world.worldSeed
    && Number.isInteger(seenBeat)
    && world.beat < seenBeat
  ) {
    return Object.freeze({ action: 'none', why: 'stale-beat' });
  }
  if (seenSeed === world.worldSeed && Number.isInteger(seenBeat)) {
    return Object.freeze({ action: 'spawned', why: 'fresh-beat' });
  }
  return Object.freeze({ action: 'replayed', why: 'unplayed-on-load' });
}

function steelRowSnapshot(row, beat) {
  return Object.freeze({
    id: row?.id ?? null,
    good: row?.good ?? 'steel',
    dir: row?.dir === 'out' ? 'out' : 'in',
    via: row?.via ?? null,
    cause: row?.cause ?? null,
    amount: Number.isInteger(row?.amount) ? row.amount : (
      Number.isInteger(row?.cash) ? row.cash : null
    ),
    beat: Number.isInteger(row?.beat) ? row.beat : (beat ?? null),
  });
}

/**
 * JSON report for `window.dd.demoSteel()`. Pure. Orchestrator screenshot driver.
 */
export function demoSteelReport(options = {}) {
  const world = options.world ?? null;
  const city = options.city ?? null;
  const state = options.state ?? null;
  const seen = options.seen ?? null;
  const lastPlay = options.lastPlay ?? null;
  const live = Array.isArray(options.live) ? options.live : [];
  const ships = Array.isArray(options.ships) ? options.ships : [];
  const rows = world ? [...beatDeliveries(world)] : [];
  const steel = rows.filter((row) => isSteelDemoRow(row));
  const decision = replayOnceDecision(world, seen, rows);
  const journeys = journeysFromDeliveryRows(steel, { city, state });
  const journey = journeys[0] ?? null;
  let action = 'none';
  let why = 'no-world';
  if (!world) {
    why = 'no-world';
  } else if (!steel.length) {
    why = 'no-steel-rows';
    action = 'none';
  } else if (
    lastPlay
    && lastPlay.beat === world.beat
    && lastPlay.seed === world.worldSeed
  ) {
    action = lastPlay.action;
    why = lastPlay.why;
  } else if (decision.action === 'none') {
    action = 'none';
    why = decision.why;
  } else {
    action = decision.action;
    why = decision.why;
  }
  return Object.freeze({
    good: 'steel',
    tokenKind: cargoTokenKind('steel'),
    vehicle: journey?.vehicle ?? vehicleForDelivery({
      good: 'steel', dir: 'in', via: 'ship',
    }),
    endpointClass: endpointClassForGood('steel'),
    chipsAt: 'berth',
    lastLoggedSteel: Object.freeze(steel.map((row) => steelRowSnapshot(row, world?.beat))),
    action,
    why,
    seenBeat: Number.isInteger(seen?.beat) ? seen.beat : null,
    worldBeat: Number.isInteger(world?.beat) ? world.beat : null,
    liveSteel: live.filter((item) => item?.delivery?.good === 'steel').length,
    ships: ships.length,
    journey: journey
      ? Object.freeze({
        vehicle: journey.vehicle,
        endpointClass: journey.endpointClass,
        chipsAt: journey.chipsAt,
        start: journey.start,
        end: journey.end,
        chips: journey.chips,
      })
      : null,
  });
}

export function bindDemoSteelConsole(layer) {
  const win = globalThis.window;
  if (!win || !layer) return;
  const attach = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    obj.demoSteel = () => layer.demoSteel();
  };
  if (!win.dd || typeof win.dd !== 'object') win.dd = {};
  attach(win.dd);
  attach(win.__districtDeck);
}

export function collapseOverflowDeliveries(rows, maxLive = WORLD_DELIVERY_MAX_LIVE) {
  const list = Array.isArray(rows) ? [...rows] : [];
  if (list.length <= maxLive) return list;
  const head = list.slice(0, Math.max(0, maxLive - 1));
  const overflow = list.length - head.length;
  head.push(Object.freeze({
    id: `overflow:+${overflow}`,
    good: 'overflow',
    dir: 'in',
    via: 'yard',
    cause: 'overflow',
    overflow,
    from: 'melbourne-inner',
    to: 'melbourne-inner',
    kind: 'steamer',
    book: null,
  }));
  return head;
}

/**
 * Pure cartoon pose. Five separate parabolic hops make the lift readable from
 * the hero camera; contact squash and launch stretch preserve the toy weight.
 */
export function worldDeliveryMotion(progress) {
  const t = clamp01(progress);
  const clock = t * WORLD_DELIVERY_HOPS;
  const hop = Math.min(WORLD_DELIVERY_HOPS - 1, Math.floor(clock));
  const phase = t >= 1 ? 1 : clock - Math.floor(clock);
  const hopStep = smoothstep(0, 1, phase);
  const arc = Math.pow(4 * phase * (1 - phase), 1.5);
  const contactDistance = Math.min(phase, 1 - phase);
  const squash = 0.18 * (1 - smoothstep(0, 0.18, contactDistance));
  const stretch = 0.1 * smoothstep(0.62, 0.94, arc);
  return {
    travel: t >= 1 ? 1 : (hop + hopStep) / WORLD_DELIVERY_HOPS,
    lift: arc * WORLD_DELIVERY_HOP_HEIGHT,
    phase,
    scaleY: 1 + stretch - squash,
    scaleXZ: 1 - stretch * 0.4 + squash * 0.667,
  };
}

function disposeObject(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root?.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    const entries = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of entries) {
      if (!material) continue;
      materials.add(material);
      if (material.map) textures.add(material.map);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

export class WorldDeliveriesLayer {
  constructor(city, { quality = 'high', reducedMotion = false } = {}) {
    this.city = city;
    this.quality = quality;
    this.reducedMotion = reducedMotion;
    this.root = new THREE.Group();
    this.root.name = 'world-deliveries';
    this.live = [];
    this.loading = 0;
    this.motionEpoch = 0;
    this.disposed = false;
    this.lastBeat = null;
    this.lastAnimatedBeat = null;
    this.lastAnimatedSeed = null;
    this.lastPlay = null;
    this.sessionStore = defaultSessionStore();
    this.boardState = null;
    this.chips = new ExchangeChipsLayer();
    this.root.add(this.chips.root);
    this.director = new PortLogisticsDirector({
      reducedMotion,
      onChip: (delivery, at, logistics) => this._spawnPortChip(delivery, at, logistics),
      resolveEndpoint: (cls, lane) => resolveStandingEndpoint(this.city, this.boardState, cls, lane),
    });
    this.ambient = new PortAmbientLoop({ reducedMotion });
    this.fireGroup = new THREE.Group();
    this.fireGroup.name = 'city-fire';
    this.fireGroup.visible = false;
    this.fireDisasterId = null;
    this.root.add(this.fireGroup);
    this.fireMat = new THREE.MeshStandardMaterial({
      color: 0xc45a18,
      emissive: 0x8c2418,
      emissiveIntensity: 0.7,
      roughness: 0.6,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.fireMark = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 1.2), this.fireMat);
    this.fireGroup.add(this.fireMark);
    this._onStorage = null;
    this._pollId = null;
    this._livenessHost = null;
    this.demoLock = false;
    this._bindLiveness();
    bindDemoSteelConsole(this);
    bindPortDemoConsole(this);
    this._ingestFromStore();
  }

  _bindLiveness() {
    const host = globalThis.window;
    if (!host || typeof host.addEventListener !== 'function') return;
    this._livenessHost = host;
    this._onStorage = (event) => {
      if (!isWorldRunStorageEvent(event)) return;
      this._ingestFromStore();
    };
    host.addEventListener('storage', this._onStorage);
    if (typeof host.setInterval === 'function') {
      this._pollId = host.setInterval(() => this._ingestFromStore(), WORLD_DELIVERY_POLL_MS);
    }
  }

  _unbindLiveness() {
    const host = this._livenessHost ?? globalThis.window;
    if (this._onStorage && host && typeof host.removeEventListener === 'function') {
      host.removeEventListener('storage', this._onStorage);
    }
    if (this._pollId != null && host && typeof host.clearInterval === 'function') {
      host.clearInterval(this._pollId);
    }
    this._onStorage = null;
    this._pollId = null;
    this._livenessHost = null;
  }

  _ingestFromStore() {
    if (this.disposed) return;
    const world = this._readWorld();
    if (!world) return;
    this._maybePlay(world, this.city);
  }

  _findPort() {
    let node = this.root;
    while (node?.parent) node = node.parent;
    return node?.getObjectByName?.('fringe:port') ?? null;
  }

  _ensureDirector() {
    if (!this.director.logistics) {
      const port = this._findPort();
      if (!port) return false;
      if (!this.director.attach(port)) return false;
    }
    this._ensureAmbient();
    return true;
  }

  _ensureAmbient() {
    if (this.ambient.attached) return true;
    const port = this.director.port ?? this._findPort();
    if (!port) return false;
    return this.ambient.attach(port, this.director);
  }

  _readWorld() {
    try {
      const inspected = inspectWorldRun(worldStoreGet(WORLD_RUN_KEY));
      if (inspected.status !== 'valid') return null;
      return inspected.world;
    } catch {
      return null;
    }
  }

  _industrialPoint(city) {
    const extent = extentFor(city);
    const yard = (city?.blockCores ?? []).find((core) => core.useId === 'works-yard' && core.centre);
    if (yard?.centre) return { x: yard.centre.x, y: 1.4, z: yard.centre.z };
    return { x: extent.x * 0.62, y: 1.4, z: extent.z * 0.48 };
  }

  _tickFire(world, elapsed, city) {
    if (!this.fireGroup) return;
    const fire = (world ? liveDisasters(world) : []).find((row) => row.type === 'fire' && !row.repaired);
    if (!fire) {
      this.fireGroup.visible = false;
      this.fireDisasterId = null;
      this.fireGroup.userData.disasterId = null;
      return;
    }
    if (this.fireDisasterId !== fire.id) {
      this.fireDisasterId = fire.id;
      this.fireGroup.userData.disasterId = fire.id;
    }
    const point = this._industrialPoint(city);
    this.fireGroup.position.set(point.x, point.y, point.z);
    if (this.reducedMotion) {
      this.fireMat.color.setHex(0x8c2418);
      this.fireMat.emissiveIntensity = 0.4;
      this.fireGroup.visible = true;
      return;
    }
    const flicker = 0.55 + Math.abs(Math.sin(elapsed * 9.2)) * 0.45;
    this.fireMat.emissiveIntensity = 0.4 + flicker * 0.8;
    this.fireMark.scale.set(4.2, 1.8 + flicker * 1.6, 4.2);
    this.fireGroup.visible = true;
  }

  _seenRecord() {
    if (Number.isInteger(this.lastAnimatedBeat)) {
      return { beat: this.lastAnimatedBeat, seed: this.lastAnimatedSeed };
    }
    return readSeenBeat(this.sessionStore);
  }

  _maybePlay(world, city) {
    if (this.demoLock) return;
    const raw = [...beatDeliveries(world)];
    const seen = this._seenRecord();
    const decision = replayOnceDecision(world, seen, raw);
    const stamp = Object.freeze({
      action: decision.action,
      why: decision.why,
      beat: world?.beat ?? null,
      seed: world?.worldSeed ?? null,
    });
    if (decision.action === 'none') {
      if (!this.lastPlay || this.lastPlay.beat !== stamp.beat) this.lastPlay = stamp;
      if (decision.why === 'no-rows' && Number.isInteger(world?.beat)
        && !Number.isInteger(this.lastAnimatedBeat)) {
        this.lastAnimatedBeat = world.beat;
        this.lastAnimatedSeed = world.worldSeed;
        this.lastBeat = world.beat;
        writeSeenBeat(this.sessionStore, world);
      }
      return;
    }
    this.lastPlay = stamp;
    this._playBeat(world, city);
  }

  _playBeat(world, city) {
    this.motionEpoch += 1;
    this.lastAnimatedBeat = world.beat;
    this.lastAnimatedSeed = world.worldSeed;
    this.lastBeat = world.beat;
    writeSeenBeat(this.sessionStore, world);

    if (!this._ensureDirector()) return;
    const raw = [...beatDeliveries(world)];
    const holds = portHoldRows(world);
    this.director.resolveEndpoint = (cls, lane) => (
      resolveStandingEndpoint(city ?? this.city, this.boardState, cls, lane)
    );
    this.director.play(raw, {
      city: city ?? this.city,
      holds,
      reducedMotion: this.reducedMotion,
      onChip: (delivery, at, logistics) => this._spawnPortChip(delivery, at, logistics),
    });
  }

  /**
   * Cash chips: harvest fee at the crane set-down on the lane head;
   * export-shipment as a wire-received tape chip at the admin block.
   * export-departure maps to zero legs (Lane B). Never synthesise catalog cash.
   */
  _spawnPortChip(delivery, at, logistics) {
    const mapped = cashLegsFromDelivery(delivery).filter(
      (leg) => Number.isInteger(leg?.amount) && leg.amount !== 0,
    );
    if (!mapped.length) return;
    let point = { x: 0, y: 2, z: 0 };
    if (at === 'admin') {
      point = logistics?.adminWorld ?? logistics?.toWorld?.(
        logistics?.admin?.x ?? 0, 4.2, logistics?.admin?.z ?? 0,
      ) ?? point;
    } else {
      const head = logistics?.transferLane?.headSlot;
      point = head && logistics?.toWorld
        ? logistics.toWorld(head.x, (logistics.transferLane?.bedTopY ?? 1) + 1.6, head.z)
        : point;
    }
    for (let index = 0; index < mapped.length; index += 1) {
      const leg = mapped[index];
      this.chips?.spawn(leg.amount, {
        x: point.x,
        y: (point.y ?? 0) + index * 0.85,
        z: (point.z ?? 0) + index * 1.35,
      }, { plate: leg.plate, ledger: leg.ledger });
    }
  }

  _finishJourney(item) {
    // Port chips fire from the director at set-down / admin. This hook stays
    // so a zero-leg row never synthesises citySettleLeg cash.
    void item;
  }

  demoSteel() {
    bindDemoSteelConsole(this);
    return demoSteelReport({
      world: this._readWorld(),
      city: this.city,
      state: this.boardState,
      seen: this._seenRecord(),
      lastPlay: this.lastPlay,
      live: this.live,
      ships: [],
    });
  }

  portDemo() {
    bindPortDemoConsole(this);
    this._ensureDirector();
    if (!this.director.logistics) return { ok: false, why: 'no-port' };
    this.demoLock = true;
    const plan = this.director.playDemo({
      city: this.city,
      reducedMotion: this.reducedMotion,
      onChip: (delivery, at, logistics) => this._spawnPortChip(delivery, at, logistics),
      resolveEndpoint: (cls, lane) => {
        const standing = resolveStandingEndpoint(this.city, this.boardState, cls, lane);
        if (standing) return standing;
        const extent = extentFor(this.city);
        return { x: extent.x * 0.42, z: extent.z * 0.38 };
      },
    });
    return {
      ok: true,
      firstMotion: plan?.firstMotion ?? null,
      playableDuration: plan?.playableDuration ?? null,
      events: plan?.events?.length ?? 0,
      queued: plan?.queued?.length ?? 0,
    };
  }

  portDemoStatus() {
    bindPortDemoConsole(this);
    return this.director.status();
  }

  portCamera(phase) {
    bindPortDemoConsole(this);
    return this.director.cameraPose(phase);
  }

  update(dt, elapsed, city = this.city, state = null) {
    this.city = city ?? this.city;
    if (state) this.boardState = state;
    const world = this._readWorld();
    if (world) this._maybePlay(world, city);
    this._tickFire(world, elapsed, city);
    this._ensureDirector();
    this.director.update(dt);
    const worldSeed = world?.worldSeed;
    this.ambient.update(dt, this.director, worldSeed);
    if (this.demoLock && !this.director.playing && this.director.time > 1) {
      this.demoLock = false;
    }
    this.chips?.update(dt);
    bindDemoSteelConsole(this);
    bindPortDemoConsole(this);
  }

  portAmbientStatus() {
    bindPortDemoConsole(this);
    return this.ambient.status();
  }

  setReducedMotion(on) {
    this.reducedMotion = Boolean(on);
    this.director.reducedMotion = this.reducedMotion;
    this.ambient.setReducedMotion(this.reducedMotion);
    if (!this.reducedMotion) return;
    this.motionEpoch += 1;
    this.director.resetLive();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._unbindLiveness();
    this.motionEpoch += 1;
    this.ambient.dispose();
    this.director.dispose();
    this.chips?.dispose();
    this.chips = null;
    this.fireMat?.dispose();
    this.fireMark?.geometry?.dispose();
    this.root.clear();
  }
}


