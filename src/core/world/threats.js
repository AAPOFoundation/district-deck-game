// V5.7 P14 — seeded pirate raids and drone strikes. Stream: threat:{beat}.
// Sighting precedes the strike by approach beats. Resolution is a reducer
// event; the globe and city only replay log rows.

import {
  appendWorldLog,
  booksGuardedByStationedChokes,
  DRONE_APPROACH_BEATS,
  FACILITY_REPAIR_COST,
  PIRATE_APPROACH_BEATS,
  PORT_DAMAGE_CAPACITY_BP,
  THREAT_BASE_BP,
  THREAT_INTERCEPTOR_KINDS,
  WAR_ASYLUM_THREAT_BP,
  WORLD_DRONE_HOSTILE_DESKS,
  WORLD_THREAT_BASIN_BY_ID,
  WORLD_THREAT_BASINS,
  WORLD_THREAT_KIND_LABEL,
  WORLD_THREAT_KINDS,
  WORLD_TRADE_BY_ID,
} from './catalog.js';
import { CITY_INDUSTRIAL_FACILITIES } from './disasters.js';
import {
  capacityForAdjacentWarehouses,
  portCapacity,
} from './port-storage.js';
import { worldStream } from './seed.js';
import { holdOpenBooks } from './trade.js';

const THREAT_KIND_SET = new Set(WORLD_THREAT_KINDS);
const INTERCEPTOR_KIND_SET = new Set(THREAT_INTERCEPTOR_KINDS);
const THREAT_RESTORE_CAP = 512;
const DRONE_RANGE_BLOCKS = 2;
const UNIT_LOSS_MARGIN = 2;
const DRONE_TARGETS = Object.freeze([...CITY_INDUSTRIAL_FACILITIES, 'port']);

function requireNonNegativeInt(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
  return value;
}

function freezeInterceptor(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new TypeError('Threat interceptor must be an object.');
  }
  if (!INTERCEPTOR_KIND_SET.has(row.kind)) {
    throw new RangeError(`Unsupported interceptor kind: ${row.kind}`);
  }
  return Object.freeze({
    kind: row.kind,
    id: String(row.id ?? ''),
  });
}

function freezeThreat(row) {
  const interceptors = Object.freeze(
    [...(row.interceptors ?? [])].map(freezeInterceptor),
  );
  const strength = requireNonNegativeInt(row.strength ?? 1, 'threat.strength');
  if (strength < 1 || strength > 3) {
    throw new RangeError('threat.strength must be an integer 1–3.');
  }
  const outcome = row.outcome == null ? null : String(row.outcome);
  if (outcome != null && outcome !== 'repelled' && outcome !== 'loss' && outcome !== 'damage') {
    throw new RangeError(`Unsupported threat outcome: ${outcome}`);
  }
  return Object.freeze({
    id: String(row.id),
    kind: row.kind,
    beat: requireNonNegativeInt(row.beat, 'threat.beat'),
    strikeBeat: requireNonNegativeInt(row.strikeBeat, 'threat.strikeBeat'),
    strength,
    basinId: row.basinId == null ? null : String(row.basinId),
    from: row.from == null ? null : String(row.from),
    targetShipmentId: row.targetShipmentId == null ? null : String(row.targetShipmentId),
    targetBook: row.targetBook == null ? null : String(row.targetBook),
    targetFacility: row.targetFacility == null ? null : String(row.targetFacility),
    outcome,
    interceptors,
    resolvedBeat: row.resolvedBeat == null
      ? null
      : requireNonNegativeInt(row.resolvedBeat, 'threat.resolvedBeat'),
  });
}

export function emptyThreats() {
  return [];
}

export function emptyFacilities() {
  return { damaged: {}, defence: null };
}

export function restoreWorldThreats(threats) {
  if (threats == null) return [];
  if (!Array.isArray(threats)) throw new TypeError('World threats must be an array.');
  if (threats.length > THREAT_RESTORE_CAP) {
    throw new RangeError(`World threats exceed the restore cap of ${THREAT_RESTORE_CAP}.`);
  }
  return threats.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new TypeError(`World threat ${index} must be an object.`);
    }
    if (!THREAT_KIND_SET.has(row.kind)) {
      throw new RangeError(`Unsupported world threat kind: ${row.kind}`);
    }
    return freezeThreat(row);
  });
}

function restoreDamaged(damaged) {
  if (damaged == null) return {};
  if (!damaged || typeof damaged !== 'object' || Array.isArray(damaged)) {
    throw new TypeError('World facilities.damaged must be a record.');
  }
  const restored = {};
  for (const [key, row] of Object.entries(damaged)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new TypeError(`World facilities.damaged.${key} must be an object.`);
    }
    restored[key] = Object.freeze({
      since: requireNonNegativeInt(row.since, `facilities.damaged.${key}.since`),
      until: requireNonNegativeInt(row.until, `facilities.damaged.${key}.until`),
      repairCost: requireNonNegativeInt(
        row.repairCost ?? FACILITY_REPAIR_COST,
        `facilities.damaged.${key}.repairCost`,
      ),
      undamagedCapacity: row.undamagedCapacity && typeof row.undamagedCapacity === 'object'
        ? Object.freeze({
          yard: requireNonNegativeInt(row.undamagedCapacity.yard, `${key}.undamagedCapacity.yard`),
          warehouse: requireNonNegativeInt(
            row.undamagedCapacity.warehouse,
            `${key}.undamagedCapacity.warehouse`,
          ),
          tank: requireNonNegativeInt(row.undamagedCapacity.tank, `${key}.undamagedCapacity.tank`),
        })
        : null,
    });
  }
  return restored;
}

function restoreDefence(defence) {
  if (defence == null) return null;
  if (!defence || typeof defence !== 'object' || Array.isArray(defence)) {
    throw new TypeError('World facilities.defence must be a record.');
  }
  const units = Array.isArray(defence.units)
    ? defence.units.map((unit, index) => {
      if (!unit || typeof unit !== 'object' || Array.isArray(unit)) {
        throw new TypeError(`defence.units[${index}] must be an object.`);
      }
      return Object.freeze({
        kind: String(unit.kind),
        blockId: unit.blockId == null ? null : String(unit.blockId),
        id: unit.id == null ? null : String(unit.id),
      });
    })
    : [];
  const portBlocks = Array.isArray(defence.portBlocks)
    ? defence.portBlocks.map(String)
    : [];
  const targets = Array.isArray(defence.targets)
    ? defence.targets.map((row) => Object.freeze({
      id: String(row.id),
      blockId: row.blockId == null ? null : String(row.blockId),
    }))
    : [];
  return Object.freeze({
    units: Object.freeze(units),
    officerOnWatch: defence.officerOnWatch === true,
    portBlocks: Object.freeze(portBlocks),
    targets: Object.freeze(targets),
  });
}

export function restoreFacilities(facilities) {
  if (facilities == null) return emptyFacilities();
  if (!facilities || typeof facilities !== 'object' || Array.isArray(facilities)) {
    throw new TypeError('World facilities must be a record.');
  }
  for (const key of Object.keys(facilities)) {
    if (key !== 'damaged' && key !== 'defence') {
      throw new Error(`Unsupported facilities field: ${key}`);
    }
  }
  return {
    damaged: restoreDamaged(facilities.damaged),
    defence: restoreDefence(facilities.defence ?? null),
  };
}

export function liveThreats(world, beat = world?.beat ?? 0) {
  return (world?.threats ?? []).filter((row) => {
    if (beat < row.beat) return false;
    if (row.outcome == null) return beat <= row.strikeBeat;
    return row.resolvedBeat == null || beat === row.resolvedBeat;
  });
}

export function facilityDamageLive(damaged, facilityKey, beat = 0) {
  if (!facilityKey) return false;
  const row = damaged?.[facilityKey];
  if (!row) return false;
  if (beat < row.since) return false;
  return beat < row.until;
}

export function liveFacilityDamage(world, facilityKey, beat = world?.beat ?? 0) {
  return facilityDamageLive(world?.facilities?.damaged, facilityKey, beat);
}

function halveCapacity(cap) {
  return {
    yard: Math.floor((cap.yard ?? 0) * PORT_DAMAGE_CAPACITY_BP / 10000),
    warehouse: Math.floor((cap.warehouse ?? 0) * PORT_DAMAGE_CAPACITY_BP / 10000),
    tank: Math.floor((cap.tank ?? 0) * PORT_DAMAGE_CAPACITY_BP / 10000),
  };
}

export function withDamagedPortCapacity(port, world, beat = world?.beat ?? 0) {
  if (!facilityDamageLive(world?.facilities?.damaged, 'port', beat)) return port;
  const full = portCapacity(port);
  return {
    ...port,
    capacity: halveCapacity(full),
  };
}

export function bookHasEscort(world, bookId) {
  if (!bookId) return false;
  const navyCount = world?.forces?.navy ?? 0;
  return (world?.requests ?? []).some((request) => {
    if (request?.kind !== 'escort') return false;
    if (request.book !== bookId) return false;
    if (!Number.isInteger(request.index) || request.index < 0 || request.index >= navyCount) {
      return false;
    }
    const route = WORLD_TRADE_BY_ID[request.book];
    const seaBook = route?.kind === 'steamer' || route?.kind === 'tanker';
    return seaBook && world?.routes?.[request.book]?.status === 'open';
  });
}

export function bookHasStationedChoke(world, bookId) {
  if (!bookId) return false;
  const guarded = booksGuardedByStationedChokes(world?.ambition?.stationedChokepoints);
  return guarded.has(bookId);
}

function warAsylumLive(world, beat) {
  return (world?.pulses ?? []).some((pulse) => (
    pulse?.type === 'war-asylum'
    && beat >= (pulse.beat ?? 0)
    && beat < pulse.untilBeat
  ));
}

function threatChanceBp(world, beat) {
  if (warAsylumLive(world, beat)) return WAR_ASYLUM_THREAT_BP;
  if (beat >= 6) return THREAT_BASE_BP;
  return 0;
}

function seaRoute(routeId) {
  const route = WORLD_TRADE_BY_ID[routeId];
  return route?.kind === 'steamer' || route?.kind === 'tanker' ? route : null;
}

function liveUntargetedShipments(world) {
  const targeted = new Set(
    (world?.threats ?? [])
      .filter((row) => row.kind === 'pirates' && row.outcome == null && row.targetShipmentId)
      .map((row) => row.targetShipmentId),
  );
  const live = [];
  for (const shipment of world?.shipments ?? []) {
    if (shipment.landedBeat != null) continue;
    if (targeted.has(shipment.id)) continue;
    if (!seaRoute(shipment.routeId)) continue;
    live.push(shipment);
  }
  return live;
}

export function pirateCandidates(world) {
  const shipments = liveUntargetedShipments(world);
  const hits = [];
  for (const basin of WORLD_THREAT_BASINS) {
    const books = new Set(basin.books);
    for (const shipment of shipments) {
      if (!books.has(shipment.routeId)) continue;
      hits.push({ basin, shipment });
    }
  }
  return hits;
}

function parseBlockId(blockId) {
  if (typeof blockId !== 'string') return null;
  const match = /^(\d+),(\d+)$/.exec(blockId);
  if (!match) return null;
  return { bx: Number(match[1]), bz: Number(match[2]), id: `${Number(match[1])},${Number(match[2])}` };
}

export function manhattanBlocks(left, right) {
  const a = typeof left === 'string' ? parseBlockId(left) : left;
  const b = typeof right === 'string' ? parseBlockId(right) : right;
  if (!a || !b) return Infinity;
  return Math.abs(a.bx - b.bx) + Math.abs(a.bz - b.bz);
}

function targetBlocks(world, threat) {
  const defence = world?.facilities?.defence;
  if (threat.targetFacility === 'port') {
    return [...(defence?.portBlocks ?? [])];
  }
  const hits = [];
  for (const row of defence?.targets ?? []) {
    if (row.id === threat.targetFacility && row.blockId) hits.push(row.blockId);
  }
  return hits;
}

function unitInRange(unit, blocks) {
  if (!unit?.blockId || !blocks.length) return false;
  return blocks.some((blockId) => manhattanBlocks(unit.blockId, blockId) <= DRONE_RANGE_BLOCKS);
}

export function pirateInterceptors(world, threat) {
  const interceptors = [];
  const book = threat.targetBook;
  if (bookHasEscort(world, book)) {
    const escort = (world.requests ?? []).find((request) => (
      request?.kind === 'escort' && request.book === book
    ));
    interceptors.push(freezeInterceptor({
      kind: 'navy',
      id: escort ? `escort:${escort.index}:${book}` : `escort:${book}`,
    }));
  }
  if (bookHasStationedChoke(world, book)) {
    const chokeId = (world.ambition?.stationedChokepoints ?? []).find((id) => {
      const basinBooks = booksGuardedByStationedChokes([id]);
      return basinBooks.has(book);
    });
    interceptors.push(freezeInterceptor({
      kind: 'navy',
      id: chokeId ? `choke:${chokeId}` : 'choke',
    }));
  }
  if (threat.basinId === 'bass' && (world.forces?.navy ?? 0) >= 1) {
    interceptors.push(freezeInterceptor({ kind: 'navy', id: 'home-fleet' }));
  }
  return interceptors;
}

export function droneInterceptors(world, threat) {
  const defence = world?.facilities?.defence;
  const blocks = targetBlocks(world, threat);
  const units = [...(defence?.units ?? [])]
    .filter((unit) => unit.kind === 'drone' || unit.kind === 'tank')
    .sort((left, right) => String(left.id ?? '').localeCompare(String(right.id ?? '')));
  const interceptors = [];
  for (const unit of units) {
    if (!unitInRange(unit, blocks)) continue;
    interceptors.push(freezeInterceptor({
      kind: unit.kind === 'tank' ? 'army' : 'drone',
      id: unit.id ?? `${unit.kind}:${unit.blockId}`,
    }));
  }
  if (defence?.officerOnWatch === true) {
    interceptors.push(freezeInterceptor({ kind: 'officer', id: 'watch' }));
  }
  return interceptors;
}

function threatSightedCopy(threat) {
  const label = WORLD_THREAT_KIND_LABEL[threat.kind] ?? threat.kind;
  const eta = Math.max(0, threat.strikeBeat - threat.beat);
  const beatsWord = eta === 1 ? '1 beat' : `${eta} beats`;
  if (threat.kind === 'pirates') {
    const basin = WORLD_THREAT_BASIN_BY_ID[threat.basinId]?.label ?? threat.basinId ?? 'the strait';
    const book = threat.targetBook ?? 'a book';
    return `${label} sighted in ${basin}. ${book} in ${beatsWord}.`;
  }
  const facility = threat.targetFacility === 'port' ? 'the port' : (threat.targetFacility ?? 'a mill');
  return `${label} inbound on ${facility}. Strike in ${beatsWord}.`;
}

function threatRepelledCopy(threat, interceptors) {
  const label = WORLD_THREAT_KIND_LABEL[threat.kind] ?? threat.kind;
  const names = interceptors.map((row) => row.kind).join(', ') || 'the watch';
  return `${label} repelled by ${names}.`;
}

function threatLossCopy(threat, crates) {
  const book = threat.targetBook ?? 'the book';
  const n = Number.isInteger(crates) ? crates : 0;
  const crateWord = n === 1 ? '1 crate' : `${n} crates`;
  return `Pirates take ${crateWord} on ${book}. The book holds one beat.`;
}

function threatDamageCopy(threat, leftover, untilBeat) {
  const facility = threat.targetFacility === 'port' ? 'the port' : (threat.targetFacility ?? 'the mill');
  const beats = leftover === 1 ? '1 beat' : `${leftover} beats`;
  return `Drones hit ${facility}. Damaged ${beats} (until beat ${untilBeat}).`;
}

function unitLossCopy(kind, id) {
  const name = kind === 'officer' ? 'officer' : kind;
  return `One ${name} lost (${id}).`;
}

export function rollThreat(worldSeed, beat, world = null) {
  if (!Number.isInteger(beat) || beat <= 0) return null;
  const rng = worldStream(worldSeed, `threat:${beat}`);
  const chance = threatChanceBp(world, beat);
  if (chance <= 0) return null;
  const roll = rng.int(0, 9999);
  if (roll >= chance) return null;
  const pirates = pirateCandidates(world);
  const dronesOk = beat >= 6 || warAsylumLive(world, beat);
  const canPirates = pirates.length > 0;
  const canDrones = dronesOk;
  if (!canPirates && !canDrones) return null;
  let kind;
  if (canPirates && canDrones) kind = rng.int(0, 1) === 0 ? 'pirates' : 'drones';
  else kind = canPirates ? 'pirates' : 'drones';
  const strength = rng.int(1, 3);
  if (kind === 'pirates') {
    const hit = rng.pick(pirates);
    return freezeThreat({
      id: `threat:pirates:${beat}`,
      kind: 'pirates',
      beat,
      strikeBeat: beat + PIRATE_APPROACH_BEATS,
      strength,
      basinId: hit.basin.id,
      from: null,
      targetShipmentId: hit.shipment.id,
      targetBook: hit.shipment.routeId,
      targetFacility: null,
      outcome: null,
      interceptors: [],
      resolvedBeat: null,
    });
  }
  const from = warAsylumLive(world, beat)
    ? 'levant-roads'
    : rng.pick(WORLD_DRONE_HOSTILE_DESKS);
  const targetFacility = rng.pick(DRONE_TARGETS);
  return freezeThreat({
    id: `threat:drones:${beat}`,
    kind: 'drones',
    beat,
    strikeBeat: beat + DRONE_APPROACH_BEATS,
    strength,
    basinId: null,
    from,
    targetShipmentId: null,
    targetBook: null,
    targetFacility,
    outcome: null,
    interceptors: [],
    resolvedBeat: null,
  });
}

export function applyThreatSighted(world, threat) {
  if (!threat) return world;
  const frozen = freezeThreat(threat);
  const already = (world.threats ?? []).some((row) => row.id === frozen.id);
  if (already) return world;
  const log = appendWorldLog(world.log, Object.freeze({
    beat: frozen.beat,
    type: 'threat-sighted',
    kind: frozen.kind,
    basinId: frozen.basinId,
    from: frozen.from,
    strikeBeat: frozen.strikeBeat,
    targetBook: frozen.targetBook,
    targetFacility: frozen.targetFacility,
    body: threatSightedCopy(frozen),
  }));
  return {
    ...world,
    threats: [...(world.threats ?? []), frozen],
    log,
  };
}

function replaceThreat(world, threat) {
  const threats = (world.threats ?? []).map((row) => (row.id === threat.id ? threat : row));
  return { ...world, threats };
}

function loseInterceptor(world, interceptor, beat) {
  if (!interceptor) return { world, body: null };
  if (interceptor.kind === 'officer') {
    const officers = Math.max(0, (world.ambition?.officers ?? 0) - 1);
    return {
      world: {
        ...world,
        ambition: { ...(world.ambition ?? {}), officers },
      },
      body: unitLossCopy('officer', interceptor.id),
    };
  }
  const kind = interceptor.kind;
  const forces = { ...(world.forces ?? {}) };
  forces[kind] = Math.max(0, (forces[kind] ?? 0) - 1);
  return {
    world: { ...world, forces },
    body: unitLossCopy(kind, interceptor.id),
  };
}

function applyPirateStrike(world, threat) {
  const interceptors = pirateInterceptors(world, threat);
  const beat = world.beat ?? 0;
  if (interceptors.length) {
    const resolved = freezeThreat({
      ...threat,
      outcome: 'repelled',
      interceptors,
      resolvedBeat: beat,
    });
    const log = appendWorldLog(world.log, Object.freeze({
      beat,
      type: 'threat-repelled',
      kind: 'pirates',
      interceptors,
      targetBook: threat.targetBook,
      strength: threat.strength,
      body: threatRepelledCopy(resolved, interceptors),
    }));
    return replaceThreat({ ...world, log }, resolved);
  }
  const shipments = [...(world.shipments ?? [])];
  const index = shipments.findIndex((row) => row.id === threat.targetShipmentId);
  let crates = 0;
  if (index >= 0) {
    const shipment = shipments[index];
    crates = Math.min(shipment.count, threat.strength);
    const nextCount = shipment.count - crates;
    if (nextCount < 1) shipments.splice(index, 1);
    else {
      shipments[index] = Object.freeze({
        ...shipment,
        count: nextCount,
        listed: Math.min(shipment.listed ?? 0, nextCount),
      });
    }
  }
  const untilBeat = beat + 1;
  const routes = threat.targetBook
    ? holdOpenBooks(world.routes, [threat.targetBook], untilBeat)
    : world.routes;
  const resolved = freezeThreat({
    ...threat,
    outcome: 'loss',
    interceptors: [],
    resolvedBeat: beat,
  });
  const log = appendWorldLog(world.log, Object.freeze({
    beat,
    type: 'threat-loss',
    kind: 'pirates',
    book: threat.targetBook,
    crates,
    interceptors: [],
    strength: threat.strength,
    body: threatLossCopy(threat, crates),
  }));
  return replaceThreat({
    ...world,
    shipments,
    routes,
    log,
  }, resolved);
}

function markFacilityDamaged(world, facilityKey, leftover, beat) {
  const damaged = { ...(world.facilities?.damaged ?? {}) };
  const existing = damaged[facilityKey];
  const live = existing && beat < existing.until;
  let port = world.port;
  if (live) {
    damaged[facilityKey] = Object.freeze({
      ...existing,
      until: existing.until + leftover,
    });
  } else {
    const undamagedCapacity = facilityKey === 'port'
      ? { ...portCapacity(world.port) }
      : null;
    damaged[facilityKey] = Object.freeze({
      since: beat,
      until: beat + leftover,
      repairCost: FACILITY_REPAIR_COST,
      undamagedCapacity,
    });
    if (facilityKey === 'port') {
      port = {
        ...(world.port ?? {}),
        capacity: halveCapacity(undamagedCapacity),
      };
    }
  }
  return {
    ...world,
    port,
    facilities: {
      ...(world.facilities ?? emptyFacilities()),
      damaged,
    },
  };
}

function applyDroneStrike(world, threat) {
  const available = droneInterceptors(world, threat);
  const used = available.slice(0, threat.strength);
  const leftover = threat.strength - used.length;
  const beat = world.beat ?? 0;
  let next = world;
  let lossBody = null;
  if (leftover >= UNIT_LOSS_MARGIN && used.length) {
    const lost = loseInterceptor(next, used[0], beat);
    next = lost.world;
    lossBody = lost.body;
  }
  if (leftover <= 0) {
    const resolved = freezeThreat({
      ...threat,
      outcome: 'repelled',
      interceptors: used,
      resolvedBeat: beat,
    });
    const body = lossBody
      ? `${threatRepelledCopy(resolved, used)} ${lossBody}`
      : threatRepelledCopy(resolved, used);
    const log = appendWorldLog(next.log, Object.freeze({
      beat,
      type: 'threat-repelled',
      kind: 'drones',
      interceptors: used,
      targetFacility: threat.targetFacility,
      strength: threat.strength,
      body,
    }));
    return replaceThreat({ ...next, log }, resolved);
  }
  next = markFacilityDamaged(next, threat.targetFacility ?? 'port', leftover, beat);
  const untilBeat = next.facilities.damaged[threat.targetFacility ?? 'port']?.until ?? (beat + leftover);
  const resolved = freezeThreat({
    ...threat,
    outcome: 'damage',
    interceptors: used,
    resolvedBeat: beat,
  });
  const body = lossBody
    ? `${threatDamageCopy(threat, leftover, untilBeat)} ${lossBody}`
    : threatDamageCopy(threat, leftover, untilBeat);
  const log = appendWorldLog(next.log, Object.freeze({
    beat,
    type: 'threat-damage',
    kind: 'drones',
    facility: threat.targetFacility,
    untilBeat,
    interceptors: used,
    strength: threat.strength,
    body,
  }));
  return replaceThreat({ ...next, log }, resolved);
}

export function resolveThreatStrike(world, threat) {
  if (!threat || threat.outcome != null) return world;
  if (threat.kind === 'pirates') return applyPirateStrike(world, threat);
  if (threat.kind === 'drones') return applyDroneStrike(world, threat);
  return world;
}

function expireFacilityDamage(world) {
  const beat = world.beat ?? 0;
  const damaged = world.facilities?.damaged ?? {};
  const keys = Object.keys(damaged);
  if (!keys.length) return world;
  const nextDamaged = { ...damaged };
  let port = world.port;
  let changed = false;
  for (const key of keys) {
    const row = damaged[key];
    if (beat < row.until) continue;
    delete nextDamaged[key];
    changed = true;
    if (key === 'port') {
      const restored = row.undamagedCapacity
        ? { ...row.undamagedCapacity }
        : capacityForAdjacentWarehouses(port?.adjacentWarehouses ?? 0);
      port = { ...(port ?? {}), capacity: restored };
    }
  }
  if (!changed) return world;
  return {
    ...world,
    port,
    facilities: {
      ...(world.facilities ?? emptyFacilities()),
      damaged: nextDamaged,
    },
  };
}

export function advanceWorldThreats(world) {
  const beat = world.beat ?? 0;
  let next = expireFacilityDamage(world);
  const due = (next.threats ?? []).filter((row) => (
    row.outcome == null && row.strikeBeat === beat
  ));
  for (const threat of due) {
    next = resolveThreatStrike(next, threat);
  }
  const already = (next.threats ?? []).some((row) => row.beat === beat);
  if (already) return next;
  const rolled = rollThreat(next.worldSeed, beat, next);
  if (!rolled) return next;
  return applyThreatSighted(next, rolled);
}

export function repairFacilityDamage(world, facilityKey) {
  const key = typeof facilityKey === 'string' ? facilityKey : '';
  const row = world?.facilities?.damaged?.[key];
  if (!row) {
    return { ok: false, reason: 'No damage to repair.', world, fee: 0 };
  }
  const fee = row.repairCost || FACILITY_REPAIR_COST;
  const damaged = { ...(world.facilities?.damaged ?? {}) };
  delete damaged[key];
  let port = world.port;
  if (key === 'port') {
    const restored = row.undamagedCapacity
      ? { ...row.undamagedCapacity }
      : capacityForAdjacentWarehouses(port?.adjacentWarehouses ?? 0);
    port = { ...(port ?? {}), capacity: restored };
  }
  const log = appendWorldLog(world.log, Object.freeze({
    beat: world.beat ?? 0,
    type: 'facility-repaired',
    facility: key,
    cost: fee,
    body: `${key === 'port' ? 'The port' : key} is repaired.`,
  }));
  return {
    ok: true,
    reason: '',
    fee,
    world: {
      ...world,
      port,
      facilities: {
        ...(world.facilities ?? emptyFacilities()),
        damaged,
      },
      log,
    },
  };
}

export {
  DRONE_TARGETS,
  UNIT_LOSS_MARGIN,
};
