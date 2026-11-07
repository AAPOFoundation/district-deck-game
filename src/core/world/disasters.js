// V4.5 Wave 3 — seeded natural disasters. Beside pulses, never pulse-shaped.
// Stream: disaster:{beat}. Escorts and stationed chokes do not protect against nature.

import {
  appendWorldLog,
  WORLD_CITIES,
  WORLD_CITY_BY_ID,
  WORLD_PULSE_BOOKS,
  WORLD_TRADE_BY_ID,
  WORLD_TRADE_ROUTES,
} from './catalog.js';
import { worldStream } from './seed.js';
import { holdOpenBooks } from './trade.js';

export const WORLD_DISASTER_TYPES = Object.freeze([
  'tsunami', 'earthquake', 'volcano', 'asteroid', 'flood', 'fire',
]);

const DISASTER_SET = new Set(WORLD_DISASTER_TYPES);

/** Per-beat chance in basis points. One roll 0–9999; first matching band wins. */
export const DISASTER_CHANCE_BP = Object.freeze({
  tsunami: 200,
  earthquake: 180,
  volcano: 140,
  flood: 150,
  fire: 70,
  asteroid: 10,
});

export const DISASTER_TOTAL_CHANCE_BP = Object.freeze(
  Object.values(DISASTER_CHANCE_BP).reduce((sum, bp) => sum + bp, 0),
);

export const DISASTER_CAMPAIGN_BEATS = 40;

export const DISASTER_DURATION_BEATS = Object.freeze({
  tsunami: 3,
  earthquake: 4,
  volcano: 2,
  asteroid: 3,
  flood: 3,
  fire: 0,
});

/** Fire has no beat fuse. The repair action is the only off-switch. */
export const FIRE_BURNS_UNTIL_REPAIRED = true;

export const FIRE_REPAIR_COST = 80_000;

export const CITY_INDUSTRIAL_FACILITIES = Object.freeze([
  'steelworks', 'smelter', 'terafab', 'works-hall', 'kiln', 'refinery',
]);

const FACILITY_LABEL = Object.freeze({
  steelworks: 'steelworks',
  smelter: 'smelter',
  terafab: 'chip plant',
  'works-hall': 'works hall',
  kiln: 'kiln',
  refinery: 'refinery',
});

export const COASTAL_DESK_IDS = Object.freeze([
  'melbourne-inner', 'geelong-port', 'sydney-harbour', 'adelaide-light', 'hobart-derwent',
  'singapore-roads', 'hongkong-peak', 'guangzhou-fittings', 'shanghai-bund', 'taipei-chips',
  'hcmc-furniture', 'jakarta-timber', 'gothenburg-mod', 'hormuz-roads', 'starbase-texas',
  'levant-roads', 'london-city', 'santos-coffee', 'valparaiso-copper', 'accra-cocoa',
  'doha-lng', 'nagoya-autos', 'bordeaux-wine', 'mumbai-cotton', 'carrara-marble',
  'losangeles-harbour', 'tokyo-harbour', 'port-hedland', 'gladstone', 'pohang', 'morowali',
  // V4.6 R2a — new coastal desks. Cape Flattery is a cape (desk inland of the
  // water cell, same as Gladstone). Hsinchu is a Taiwan Strait prefecture
  // (desk inland of the harbour cell, same as Taipei). Osaka is the Kansai
  // port. Ningbo is the Yangtze port. Rotorua (inland mill) and Sheffield
  // (inland foundry) stay off this table.
  'cape-flattery', 'hsinchu', 'osaka', 'ningbo',
]);

export const RIVER_DESK_IDS = Object.freeze([
  'melbourne-inner', 'shanghai-bund', 'london-city', 'hcmc-furniture', 'kolwezi',
]);

export const VOLCANO_DESK_IDS = Object.freeze([
  'jakarta-timber', 'morowali', 'tokyo-harbour', 'nagoya-autos', 'seto',
]);

export const MAKE_DESK_IDS = Object.freeze([
  'port-hedland', 'greenbushes', 'mount-weld', 'eneabba-sands',
  'kolwezi', 'morowali', 'balama', 'rustenburg',
  'olympic-dam',
]);

/**
 * Catalog-honest air books. WORLD_TRADE_ROUTES has no `kind === 'air'` row
 * (those lines are steamer / tanker), so this set is empty. Volcano holds
 * region books instead — see regionBooksForDesk.
 */
export const WORLD_AIR_BOOK_IDS = Object.freeze(
  WORLD_TRADE_ROUTES.filter((route) => route.kind === 'air').map((route) => route.id),
);

const COASTAL_SET = new Set(COASTAL_DESK_IDS);
const RIVER_SET = new Set(RIVER_DESK_IDS);
const MAKE_SET = new Set(MAKE_DESK_IDS);
const MELBOURNE_ID = 'melbourne-inner';

/** MAKE desks plus Melbourne. Every earthquake target actually stalls. */
export const EARTHQUAKE_DESK_IDS = Object.freeze([
  ...MAKE_DESK_IDS,
  MELBOURNE_ID,
]);

/** River/coastal MAKE desks plus Melbourne city stall. targetsFor uses this. */
export const FLOOD_DESK_IDS = Object.freeze([
  ...MAKE_DESK_IDS.filter((id) => COASTAL_SET.has(id) || RIVER_SET.has(id)),
  MELBOURNE_ID,
]);

const ASTEROID_DESK_IDS = Object.freeze(
  WORLD_CITIES.map((city) => city.id).filter((id) => id !== 'geelong-port' && id !== 'ballarat-gold'),
);

export const DISASTER_ANIMATION_MS = Object.freeze({
  tsunami: 4200,
  earthquake: 1800,
  volcano: 5200,
  asteroid: 3600,
  flood: 4000,
  fire: 3200,
});

export const DISASTER_CONCURRENCY_CAP = 2;

export const ESCORT_NATURE_COPY = 'Escorts shorten a pulse on a sea book. They do not protect against nature.';

function requireNonNegativeInt(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
  return value;
}

function deskName(deskId) {
  return WORLD_CITY_BY_ID[deskId]?.mapName ?? deskId;
}

function booksForDesk(deskId) {
  return WORLD_TRADE_ROUTES
    .filter((route) => route.from === deskId || route.to === deskId)
    .map((route) => route.id);
}

/** Struck desk books plus books whose `via` list includes the desk. */
export function regionBooksForDesk(deskId) {
  return WORLD_TRADE_ROUTES
    .filter((route) => (
      route.from === deskId
      || route.to === deskId
      || (route.via ?? []).includes(deskId)
    ))
    .map((route) => route.id);
}

export function expectedDisastersInCampaign(beats = DISASTER_CAMPAIGN_BEATS) {
  return (beats * DISASTER_TOTAL_CHANCE_BP) / 10000;
}

export function disasterRegister(type, {
  deskId, durationBeats, facilityId, repairCost, lostGood, lostFrom,
} = {}) {
  const name = deskName(deskId);
  const hold = Number.isInteger(durationBeats) ? durationBeats : DISASTER_DURATION_BEATS[type];
  const beatsWord = hold === 1 ? 'one beat' : `${hold === 2 ? 'two' : hold === 3 ? 'three' : hold === 4 ? 'four' : String(hold)} beats`;
  if (type === 'tsunami') {
    const origin = lostFrom ?? name;
    return `A tsunami takes the ${origin} shipment. The book holds ${beatsWord}.`;
  }
  if (type === 'earthquake') {
    if (deskId === MELBOURNE_ID) {
      return `An earthquake rocks Melbourne. City plants stall ${beatsWord}.`;
    }
    return `An earthquake rocks ${name}. The mine rests ${beatsWord}.`;
  }
  if (type === 'volcano') {
    return `Ash from ${name} holds the region's books. The line waits ${beatsWord}.`;
  }
  if (type === 'asteroid') {
    return `A strike hits ${name}. The book holds and the shipment is lost.`;
  }
  if (type === 'flood') {
    if (deskId === MELBOURNE_ID) {
      return `A flood hits Melbourne. City plants stall ${beatsWord}.`;
    }
    return `A flood halts MAKE at ${name}. The mine waits ${beatsWord}.`;
  }
  if (type === 'fire') {
    const plant = FACILITY_LABEL[facilityId] ?? 'mill';
    const cost = Number.isInteger(repairCost) ? repairCost : FIRE_REPAIR_COST;
    return `Fire hits the ${plant}. Repair costs $${cost.toLocaleString('en-AU')} before it runs again.`;
  }
  return `Nature hits ${name}.`;
}

function freezeDisaster(row) {
  return Object.freeze({
    id: String(row.id),
    type: row.type,
    beat: requireNonNegativeInt(row.beat, 'disaster beat'),
    untilBeat: requireNonNegativeInt(row.untilBeat, 'disaster untilBeat'),
    deskId: String(row.deskId),
    books: Object.freeze([...(row.books ?? [])].map(String)),
    lostBooks: Object.freeze([...(row.lostBooks ?? [])].map(String)),
    durationBeats: requireNonNegativeInt(row.durationBeats ?? 1, 'disaster durationBeats'),
    facilityId: row.facilityId == null ? null : String(row.facilityId),
    repairCost: Number.isInteger(row.repairCost) ? row.repairCost : 0,
    repaired: row.repaired === true,
    register: String(row.register ?? ''),
    lat: Number.isFinite(row.lat) ? row.lat : (WORLD_CITY_BY_ID[row.deskId]?.map.lat ?? 0),
    lon: Number.isFinite(row.lon) ? row.lon : (WORLD_CITY_BY_ID[row.deskId]?.map.lon ?? 0),
  });
}

export function restoreWorldDisasters(disasters) {
  if (disasters == null) return [];
  if (!Array.isArray(disasters)) throw new TypeError('World disasters must be an array.');
  return disasters.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new TypeError(`World disaster ${index} must be an object.`);
    }
    if (!DISASTER_SET.has(row.type)) {
      throw new RangeError(`Unsupported world disaster type: ${row.type}`);
    }
    return freezeDisaster(row);
  });
}

export function liveDisasters(world, beat = world?.beat ?? 0) {
  return (world?.disasters ?? []).filter((row) => {
    if (beat < row.beat) return false;
    if (row.type === 'fire') return row.repaired !== true;
    return beat < row.untilBeat;
  });
}

export function desksUnderDisaster(world, beat = world?.beat ?? 0) {
  return new Set(liveDisasters(world, beat).map((row) => row.deskId));
}

export function pulseHitsDisasterDesks(pulseType, deskIds) {
  if (!deskIds || deskIds.size === 0) return false;
  const books = WORLD_PULSE_BOOKS[pulseType] ?? [];
  return books.some((id) => {
    const route = WORLD_TRADE_BY_ID[id];
    if (!route) return false;
    return deskIds.has(route.from) || deskIds.has(route.to);
  });
}

export function mineDesksHalted(world, beat = world?.beat ?? 0) {
  const halted = new Set();
  for (const row of liveDisasters(world, beat)) {
    if (row.type === 'flood' && MAKE_SET.has(row.deskId)) halted.add(row.deskId);
    if (row.type === 'earthquake' && MAKE_SET.has(row.deskId)) halted.add(row.deskId);
  }
  return halted;
}

export function cityFacilityStallUntil(world, beat = world?.beat ?? 0) {
  return cityFacilityStall(world, beat).until;
}

/** The latest-running Melbourne stall and WHICH disaster set it, so the city
 * reducer can speak the right line (flood copy for floods, quake for quakes). */
export function cityFacilityStall(world, beat = world?.beat ?? 0) {
  let until = 0;
  let type = null;
  for (const row of liveDisasters(world, beat)) {
    const cityStall = (row.type === 'earthquake' || row.type === 'flood')
      && row.deskId === MELBOURNE_ID;
    if (cityStall && row.untilBeat > until) {
      until = row.untilBeat;
      type = row.type;
    }
  }
  return { until, type };
}

export function cityStallCopy(type) {
  return type === 'flood' ? floodHaltCityCopy() : quakeStallCopy();
}

export function floodHaltCityCopy() {
  return 'The flood still sits on the plant.';
}

export function fireDamageForFacility(world, facilityId, beat = world?.beat ?? 0) {
  if (!facilityId) return null;
  for (const row of liveDisasters(world, beat)) {
    if (row.type !== 'fire') continue;
    if (row.repaired) continue;
    if (row.facilityId !== facilityId) continue;
    return {
      disasterId: row.id,
      facilityId: row.facilityId,
      cost: row.repairCost || FIRE_REPAIR_COST,
    };
  }
  return null;
}

export function fireRepairCopy(cost = FIRE_REPAIR_COST) {
  return `The mill is damaged. Repair costs $${cost.toLocaleString('en-AU')}.`;
}

export function quakeStallCopy() {
  return 'The earthquake still holds the plant.';
}

export function floodHaltCopy() {
  return 'MAKE is halted. The flood still sits on the mine.';
}

function targetsFor(type) {
  if (type === 'tsunami') return COASTAL_DESK_IDS;
  if (type === 'volcano') return VOLCANO_DESK_IDS;
  if (type === 'flood') return FLOOD_DESK_IDS;
  if (type === 'earthquake') return EARTHQUAKE_DESK_IDS;
  if (type === 'fire') return Object.freeze([MELBOURNE_ID]);
  if (type === 'asteroid') return ASTEROID_DESK_IDS;
  return ASTEROID_DESK_IDS;
}

export function disasterTargets(type) {
  return targetsFor(type);
}

function booksAffected(type, deskId) {
  if (type === 'volcano') return regionBooksForDesk(deskId);
  if (type === 'tsunami' || type === 'asteroid') return booksForDesk(deskId);
  return [];
}

function pickType(rng) {
  const roll = rng.int(0, 9999);
  let cursor = 0;
  for (const type of WORLD_DISASTER_TYPES) {
    cursor += DISASTER_CHANCE_BP[type];
    if (roll < cursor) return type;
  }
  return null;
}

export function rollDisaster(worldSeed, beat, world = null) {
  if (!Number.isInteger(beat) || beat <= 0) return null;
  const rng = worldStream(worldSeed, `disaster:${beat}`);
  const type = pickType(rng);
  if (!type) return null;
  const targets = targetsFor(type);
  if (!targets.length) return null;
  const deskId = rng.pick(targets);
  const durationBeats = DISASTER_DURATION_BEATS[type];
  const untilBeat = beat + durationBeats;
  const facilityId = type === 'fire' ? rng.pick(CITY_INDUSTRIAL_FACILITIES) : null;
  const repairCost = type === 'fire' ? FIRE_REPAIR_COST : 0;
  const books = booksAffected(type, deskId);
  const openLost = [];
  if (type === 'tsunami' || type === 'asteroid') {
    for (const id of books) {
      if (world?.routes?.[id]?.status === 'open') openLost.push(id);
    }
  }
  const lostRoute = openLost[0] ?? books[0] ?? null;
  const lostSpec = lostRoute ? WORLD_TRADE_BY_ID[lostRoute] : null;
  const map = WORLD_CITY_BY_ID[deskId]?.map ?? { lat: 0, lon: 0 };
  return freezeDisaster({
    id: `disaster-${type}-${beat}`,
    type,
    beat,
    untilBeat,
    deskId,
    books,
    lostBooks: openLost,
    durationBeats,
    facilityId,
    repairCost,
    repaired: false,
    register: disasterRegister(type, {
      deskId,
      durationBeats,
      facilityId,
      repairCost,
      lostGood: lostSpec?.good ?? null,
      lostFrom: lostSpec ? deskName(lostSpec.from) : deskName(deskId),
    }),
    lat: map.lat,
    lon: map.lon,
  });
}

function shipmentLossRow(disaster) {
  const lost = disaster.lostBooks?.[0];
  if (!lost) return null;
  const spec = WORLD_TRADE_BY_ID[lost];
  if (!spec) return null;
  const origin = deskName(spec.from);
  const label = spec.good === 'timber' ? 'timber'
    : spec.good === 'graphite' ? 'graphite'
      : spec.good;
  return Object.freeze({
    beat: disaster.beat,
    type: 'shipment-lost',
    kind: 'shipment-lost',
    routeId: lost,
    good: spec.good,
    deskId: disaster.deskId,
    body: `The ${origin} ${label} crate is lost.`,
  });
}

export function applyDisaster(world, disaster) {
  if (!disaster) return world;
  const frozen = freezeDisaster(disaster);
  const holdIds = frozen.type === 'volcano'
    ? frozen.books
    : (frozen.type === 'tsunami' || frozen.type === 'asteroid')
      ? frozen.books
      : [];
  const routes = holdIds.length
    ? holdOpenBooks(world.routes, holdIds, frozen.untilBeat)
    : world.routes;
  const logRows = [
    Object.freeze({
      beat: frozen.beat,
      type: frozen.type,
      kind: 'disaster',
      disasterId: frozen.id,
      deskId: frozen.deskId,
      books: frozen.books,
      durationBeats: frozen.durationBeats,
      facilityId: frozen.facilityId,
      repairCost: frozen.repairCost,
      lat: frozen.lat,
      lon: frozen.lon,
      body: frozen.register,
    }),
    shipmentLossRow(frozen),
  ];
  return {
    ...world,
    routes,
    disasters: [...(world.disasters ?? []).filter((row) => row.id !== frozen.id), frozen],
    log: appendWorldLog(world.log, logRows),
  };
}

export function advanceWorldDisasters(world) {
  const beat = world.beat ?? 0;
  const live = liveDisasters(world, beat).filter((row) => row.beat !== beat);
  const already = (world.disasters ?? []).find((row) => row.beat === beat) ?? null;
  if (already) {
    return {
      ...world,
      disasters: [...live, already],
    };
  }
  const rolled = rollDisaster(world.worldSeed, beat, world);
  if (!rolled) {
    return { ...world, disasters: live };
  }
  if (rolled.type === 'fire') {
    const burning = live.some((row) => row.type === 'fire'
      && row.facilityId === rolled.facilityId && !row.repaired);
    // One blaze per facility: a second strike feeds the existing fire.
    if (burning) return { ...world, disasters: live };
  }
  return applyDisaster({ ...world, disasters: live }, rolled);
}

export function repairFire(world, disasterId) {
  const row = (world?.disasters ?? []).find((entry) => entry.id === disasterId);
  if (!row || row.type !== 'fire' || row.repaired) {
    return { ok: false, reason: 'No fire to repair.', world, fee: 0 };
  }
  const fee = row.repairCost || FIRE_REPAIR_COST;
  if ((world.treasuryCash ?? 0) < fee) {
    return {
      ok: false,
      reason: `Head office needs $${fee.toLocaleString('en-AU')}.`,
      world,
      fee,
    };
  }
  const repaired = freezeDisaster({
    ...row,
    repaired: true,
    untilBeat: world.beat ?? row.beat,
  });
  const disasters = (world.disasters ?? []).map((entry) => (
    entry.id === disasterId ? repaired : entry
  ));
  const log = appendWorldLog(world.log, Object.freeze({
    beat: world.beat ?? 0,
    type: 'fire-repair',
    disasterId,
    facilityId: row.facilityId,
    body: `The ${FACILITY_LABEL[row.facilityId] ?? 'mill'} is repaired.`,
  }));
  return {
    ok: true,
    reason: '',
    fee,
    world: {
      ...world,
      treasuryCash: (world.treasuryCash ?? 0) - fee,
      disasters,
      log,
    },
  };
}

export function noDoubleJeopardyGuard() {
  return 'A desk under a disaster does not also take pulse damage the same beat.';
}

export { MELBOURNE_ID as DISASTER_MELBOURNE_ID };
