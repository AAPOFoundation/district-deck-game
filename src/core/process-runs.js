// V4.4 Wave 2 — city process-run reducers. Pure. Labour is CASH wages.

import { parseParcelId, globalTile } from './grid.js';
import { WORLD_RUN_KEY, inspectWorldRun, worldStore } from './world/envelope.js';
import {
  cityFacilityStallUntil,
  fireDamageForFacility,
  fireRepairCopy,
  cityFacilityStall,
  cityStallCopy,
  quakeStallCopy,
} from './world/disasters.js';
import { portApronParcelId } from './world/deliveries.js';
import {
  COMBO_RANGE_TILES,
  KILN_HEAT_BEAT_RELIEF,
  PROCESS_ABORT_BREAKAGE,
  PROCESS_BY_ID,
  PROCESS_DRAW_LOG_CAP,
  abortRunCopy,
  byproductEscapedCopy,
  canHostProcessInCity,
  cannotFeedCopy,
  facilityHostsProcess,
  comboTierFor,
  comboYieldQty,
  delayCopy,
  deriveDrawId,
  distancePenalties,
  globeBehindCopy,
  globeDarkCopy,
  kilnHeatEscapedCopy,
  kilnHeatProcess,
  netGiveQuality,
  processOf,
  rollProcess,
  runCashCost,
  scrapCopy,
  waitingOnYardCopy,
} from './world/processes.js';

function reject(state, reason) {
  return { rejected: true, ok: false, state, reason, events: [{ kind: 'reject', reason }] };
}

function standingForm(holding, status) {
  const slots = holding?.padSlots;
  if (slots && typeof slots === 'object') {
    const standing = [];
    for (const key of ['A', 'B']) {
      const slot = slots[key];
      if (slot?.status === 'standing' && typeof slot.archetypeId === 'string') {
        standing.push(slot);
      }
    }
    if (standing.length) {
      const whole = standing.filter((slot) => slot.whole === true);
      if (whole.length) return whole[0].archetypeId;
      return standing[0].archetypeId;
    }
  }
  if (holding?.siteCleared && (!slots || typeof slots !== 'object')) return null;
  if (holding?.construction) return null;
  const primary = status?.builtArchetypeId ?? holding?.archetypeId ?? null;
  return typeof primary === 'string' && primary ? primary : null;
}

export function standingProcessForm(city, state, parcelId) {
  return standingForm(state?.holdings?.[parcelId], state?.parcelStatus?.[parcelId]);
}

function readStore(store, key) {
  try {
    if (store && typeof store.get === 'function') return store.get(key) ?? null;
    return worldStore.get(key);
  } catch {
    return null;
  }
}

/** City reads WORLD_RUN_KEY same-origin, read-only, for the applied-seq ack. */
export function readWorldDrawAck(store = worldStore) {
  const inspected = inspectWorldRun(readStore(store, WORLD_RUN_KEY));
  if (inspected.status !== 'valid' || !inspected.world) {
    return {
      runId: null, watermark: {}, stocks: null,
      worldBeat: 0, cityFacilityStallUntil: 0, world: null,
    };
  }
  const ambition = inspected.world.ambition ?? {};
  const world = inspected.world;
  return {
    runId: typeof ambition.processDrawRunId === 'string' && ambition.processDrawRunId.length > 0
      ? ambition.processDrawRunId
      : (typeof ambition.lastLedgerRunId === 'string' ? ambition.lastLedgerRunId : null),
    watermark: ambition.processDrawWatermark && typeof ambition.processDrawWatermark === 'object'
      ? ambition.processDrawWatermark
      : {},
    stocks: world.stocks ?? null,
    worldBeat: world.beat ?? 0,
    cityFacilityStallUntil: cityFacilityStallUntil(world),
    cityFacilityStallType: cityFacilityStall(world).type,
    world,
  };
}

function logProcess(state, type, body, extra = {}) {
  if (!Array.isArray(state.log)) state.log = [];
  state.log.push({
    q: state.quarter ?? 0,
    type,
    body,
    ...extra,
  });
}

function pruneAppliedRows(state, parcelId, appliedSeq) {
  const existing = Array.isArray(state.processDrawLog?.[parcelId])
    ? [...state.processDrawLog[parcelId]]
    : [];
  const kept = existing.filter((row) => (row?.seq ?? 0) > appliedSeq);
  state.processDrawLog = {
    ...(state.processDrawLog ?? {}),
    [parcelId]: kept,
  };
  return kept;
}

function appliedSeqFor(ack, parcelId, runId) {
  if (!ack) return 0;
  if (runId && ack.runId && ack.runId !== runId) return 0;
  return ack.watermark?.[parcelId] ?? 0;
}

/**
 * Issue one draw row. Prunes only rows the world has already applied.
 * Never splices unapplied rows. Pauses when the unapplied window would
 * exceed PROCESS_DRAW_LOG_CAP.
 */
export function issueProcessDraw(state, parcelId, row, options = {}) {
  const ack = options.worldAck ?? (options.store ? readWorldDrawAck(options.store) : null);
  const runId = typeof options.runId === 'string' && options.runId.length > 0
    ? options.runId
    : (typeof row.runId === 'string' ? row.runId : null);
  const appliedSeq = appliedSeqFor(ack, parcelId, runId);
  const kept = pruneAppliedRows(state, parcelId, appliedSeq);
  if (kept.length >= PROCESS_DRAW_LOG_CAP) {
    logProcess(state, 'process-hold', globeBehindCopy(), { parcelId });
    return { ok: false, paused: true, seq: null };
  }
  const seq = (state.processDrawWatermark?.[parcelId] ?? 0) + 1;
  state.processDrawWatermark = {
    ...(state.processDrawWatermark ?? {}),
    [parcelId]: seq,
  };
  const stamped = {
    ...row,
    seq,
    parcelId,
  };
  if (runId) {
    stamped.runId = runId;
    stamped.id = deriveDrawId(runId, parcelId, seq);
  }
  kept.push(Object.freeze(stamped));
  state.processDrawLog = {
    ...(state.processDrawLog ?? {}),
    [parcelId]: kept,
  };
  return { ok: true, paused: false, seq };
}

function yardCannotFeed(process, yardStocks) {
  const hasInputs = Object.keys(process.inputs ?? {}).length > 0;
  if (yardStocks == null || typeof yardStocks !== 'object') return hasInputs;
  for (const [good, amount] of Object.entries(process.inputs)) {
    if ((yardStocks[good] ?? 0) < amount) return true;
  }
  return false;
}

function yardSnapshotMissing(yardStocks) {
  return yardStocks == null || typeof yardStocks !== 'object';
}

export function parcelChebyshevTiles(city, aId, bId) {
  const tilesA = city?.parcels?.[aId]?.tiles ?? [aId];
  const tilesB = city?.parcels?.[bId]?.tiles ?? [bId];
  let min = Infinity;
  for (const tileA of tilesA) {
    let parsedA;
    try { parsedA = parseParcelId(tileA); } catch { continue; }
    const ga = globalTile(parsedA.bx, parsedA.bz, parsedA.tx, parsedA.tz);
    for (const tileB of tilesB) {
      let parsedB;
      try { parsedB = parseParcelId(tileB); } catch { continue; }
      const gb = globalTile(parsedB.bx, parsedB.bz, parsedB.tx, parsedB.tz);
      const d = Math.max(Math.abs(ga.gx - gb.gx), Math.abs(ga.gz - gb.gz));
      if (d < min) min = d;
    }
  }
  return Number.isFinite(min) ? min : null;
}

function producerConsumer(aId, bId) {
  const a = PROCESS_BY_ID[aId];
  const b = PROCESS_BY_ID[bId];
  if (!a || !b) return false;
  for (const good of Object.keys(a.outputs)) {
    if ((b.inputs[good] ?? 0) > 0) return true;
  }
  for (const good of Object.keys(b.outputs)) {
    if ((a.inputs[good] ?? 0) > 0) return true;
  }
  return false;
}

function lastGiveCount(holding, good) {
  const stamp = holding?.lastGiveByGood;
  if (!stamp || typeof stamp !== 'object' || Array.isArray(stamp)) return 0;
  const n = stamp[good];
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function nearestSupplierDistance(city, standing, node, holdings) {
  const inputs = PROCESS_BY_ID[node.processId]?.inputs ?? {};
  const needed = Object.keys(inputs).filter((good) => (inputs[good] ?? 0) > 0);
  if (needed.length === 0) return null;
  let best = null;
  for (const other of standing) {
    if (other.parcelId === node.parcelId) continue;
    const outputs = PROCESS_BY_ID[other.processId]?.outputs ?? {};
    const holding = holdings?.[other.parcelId];
    const feeds = needed.some((good) => (
      (outputs[good] ?? 0) > 0 && lastGiveCount(holding, good) >= 1
    ));
    if (!feeds) continue;
    const d = parcelChebyshevTiles(city, node.parcelId, other.parcelId);
    if (!Number.isInteger(d)) continue;
    if (best == null || d < best) best = d;
  }
  if (best != null) return best;
  const apron = portApronParcelId(city);
  return parcelChebyshevTiles(city, node.parcelId, apron);
}

/**
 * Derived combo state. Recomputed from REAL standing positions — never stored,
 * never a manual toggle.
 */
export function comboStateFor(city, state) {
  const holdings = state?.holdings ?? {};
  const standing = [];
  const kilnParcels = [];
  for (const parcelId of Object.keys(holdings).sort()) {
    const holding = holdings[parcelId];
    if (holding?.owner && holding.owner !== 'player') continue;
    const form = standingProcessForm(city, state, parcelId);
    if (form === 'kiln') kilnParcels.push(parcelId);
    const process = processOf(holding?.processId);
    if (!process || !canHostProcessInCity(process)) continue;
    if (!facilityHostsProcess(form, process)) continue;
    standing.push({ parcelId, processId: process.id, form });
  }

  const parent = standing.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const unite = (a, b) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pa] = pb;
  };
  for (let i = 0; i < standing.length; i += 1) {
    for (let j = i + 1; j < standing.length; j += 1) {
      if (!producerConsumer(standing[i].processId, standing[j].processId)) continue;
      const d = parcelChebyshevTiles(city, standing[i].parcelId, standing[j].parcelId);
      if (!Number.isInteger(d) || d > COMBO_RANGE_TILES) continue;
      unite(i, j);
    }
  }

  const groups = new Map();
  for (let i = 0; i < standing.length; i += 1) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(standing[i]);
  }

  const byParcel = {};
  const chains = [];
  for (const members of groups.values()) {
    const stageIds = [...new Set(members.map((row) => row.processId))];
    const tier = comboTierFor(stageIds.length);
    chains.push(Object.freeze({
      stages: stageIds.length,
      chip: tier.chip,
      parcelIds: Object.freeze(members.map((row) => row.parcelId)),
    }));
    for (const node of members) {
      const supplierDistance = nearestSupplierDistance(city, standing, node, holdings);
      const penalties = distancePenalties(supplierDistance ?? 0);
      const kilnInRange = kilnParcels.some((kilnId) => {
        const d = parcelChebyshevTiles(city, node.parcelId, kilnId);
        return Number.isInteger(d) && d <= COMBO_RANGE_TILES;
      });
      const kilnHeat = tier.byproductCapture
        && kilnHeatProcess(node.processId)
        && kilnInRange;
      byParcel[node.parcelId] = Object.freeze({
        chip: tier.chip,
        linkedStages: stageIds.length,
        yieldBp: tier.yieldBp,
        byproductCapture: tier.byproductCapture,
        qualityBump: tier.qualityBump,
        errorHalved: tier.errorHalved,
        supplierDistance,
        kilnHeat,
        kilnInRange,
        ...penalties,
      });
    }
  }
  return Object.freeze({
    byParcel: Object.freeze(byParcel),
    chains: Object.freeze(chains),
  });
}

export function startProcessRun(city, state, parcelId, options = {}) {
  const holding = state?.holdings?.[parcelId];
  if (!holding) return reject(state, 'No holding on that parcel.');
  if (holding.processRun) return reject(state, 'A run is already live.');
  const processId = holding.processId;
  const process = processOf(processId);
  if (!process) return reject(state, 'Select a process first.');
  if (!canHostProcessInCity(process)) {
    return reject(state, 'Mines cannot run in Melbourne.');
  }
  const ack = options.worldAck ?? (options.store ? readWorldDrawAck(options.store) : readWorldDrawAck());
  if ((ack.worldBeat ?? 0) < (ack.cityFacilityStallUntil ?? 0)) {
    return reject(state, cityStallCopy(ack.cityFacilityStallType));
  }
  const fireHit = fireDamageForFacility(ack.world, process.facility, ack.worldBeat);
  if (fireHit) {
    return reject(state, fireRepairCopy(fireHit.cost));
  }
  const form = standingProcessForm(city, state, parcelId);
  if (!facilityHostsProcess(form, process)) {
    return reject(state, 'That plant cannot host this process.');
  }
  const hasInputs = Object.keys(process.inputs).length > 0;
  if (hasInputs && yardSnapshotMissing(options.yardStocks)) {
    logProcess(state, 'process-hold', globeDarkCopy(), { parcelId, processId: process.id });
    return reject(state, globeDarkCopy());
  }
  if (yardCannotFeed(process, options.yardStocks)) {
    return reject(state, cannotFeedCopy());
  }
  const cost = runCashCost(process);
  if ((state.cash ?? 0) < cost) {
    return reject(state, 'Head office cannot cover the wage bill.');
  }
  const combo = options.combo ?? comboStateFor(city, state);
  const parcelCombo = combo.byParcel?.[parcelId] ?? null;
  const runIndex = Number.isInteger(holding.processRunIndex) ? holding.processRunIndex : 0;
  const roll = rollProcess(state.seed ?? 0, process.id, runIndex, {
    accidentExposureBp: parcelCombo?.accidentExposureBp ?? 0,
    errorHalved: parcelCombo?.errorHalved === true,
  });
  let remainingBeats = process.timeBeats
    + roll.delayBeats
    + (parcelCombo?.transferBeats ?? 0);
  if (parcelCombo?.kilnHeat) {
    remainingBeats = Math.max(1, remainingBeats - KILN_HEAT_BEAT_RELIEF);
  } else if (
    parcelCombo?.kilnInRange
    && kilnHeatProcess(process.id)
    && !parcelCombo?.byproductCapture
  ) {
    logProcess(state, 'process-escape', kilnHeatEscapedCopy(), {
      processId: process.id,
      parcelId,
    });
  }
  const inputs = process.inputs;
  let takeSeq = 0;
  if (Object.keys(inputs).length) {
    const issued = issueProcessDraw(state, parcelId, {
      kind: 'take',
      processId: process.id,
      runIndex,
      goods: Object.freeze({ ...inputs }),
    }, { ...options, worldAck: ack });
    if (!issued.ok) {
      return reject(state, globeBehindCopy());
    }
    takeSeq = issued.seq;
  }
  state.cash = (state.cash ?? 0) - cost;
  holding.processRunIndex = runIndex + 1;
  holding.processRun = Object.freeze({
    processId: process.id,
    runIndex,
    remainingBeats,
    delayBeats: roll.delayBeats,
    delayClasses: Object.freeze(roll.delays.map((hit) => hit.class)),
    error: roll.error,
    takeSeq,
    takeApplied: takeSeq === 0,
    wageCost: cost,
    runId: typeof options.runId === 'string' ? options.runId : null,
    comboChip: parcelCombo?.chip ?? '',
    comboYieldBp: parcelCombo?.yieldBp ?? 0,
    byproductCapture: parcelCombo?.byproductCapture === true,
    comboQualityBump: parcelCombo?.qualityBump ?? 0,
    errorHalved: parcelCombo?.errorHalved === true,
    supplierDistance: parcelCombo?.supplierDistance ?? null,
    transferBeats: parcelCombo?.transferBeats ?? 0,
    qualityDecayBp: parcelCombo?.qualityDecayBp ?? 0,
    accidentExposureBp: parcelCombo?.accidentExposureBp ?? 0,
    kilnHeat: parcelCombo?.kilnHeat === true,
  });
  for (const hit of roll.delays) {
    logProcess(state, 'process-delay', delayCopy(process, hit.class, hit.beats), {
      processId: process.id,
      parcelId,
      delayClass: hit.class,
      beats: hit.beats,
    });
  }
  logProcess(state, 'process-start', `${process.label} run begins.`, {
    processId: process.id,
    parcelId,
  });
  return { ok: true, rejected: false, state, reason: '', roll };
}

function completeProcessRun(state, parcelId, holding, options = {}) {
  const run = holding.processRun;
  const process = PROCESS_BY_ID[run.processId];
  if (!process) {
    holding.processRun = null;
    return { ok: true };
  }
  if (run.takeSeq && !run.takeApplied) {
    return { ok: false, stalled: true };
  }
  const kind = run.error ? 'scrap' : 'give';
  const goods = {};
  if (run.error) {
    Object.assign(goods, process.inputs);
  } else {
    const yieldBp = Number.isInteger(run.comboYieldBp) ? run.comboYieldBp : 0;
    for (const [good, amount] of Object.entries(process.outputs)) {
      goods[good] = comboYieldQty(amount, yieldBp);
    }
    if (run.byproductCapture) {
      for (const [good, amount] of Object.entries(process.byproducts)) {
        goods[good] = (goods[good] ?? 0) + amount;
      }
    } else if (Object.keys(process.byproducts).length) {
      logProcess(state, 'process-escape', byproductEscapedCopy(process), {
        processId: process.id,
        parcelId,
      });
    }
  }
  const issued = issueProcessDraw(state, parcelId, {
    kind,
    processId: process.id,
    runIndex: run.runIndex,
    goods: Object.freeze({ ...goods }),
    ...(kind === 'give'
      ? {
        quality: netGiveQuality(
          run.comboQualityBump,
          run.qualityDecayBp,
          run.errorHalved === true,
        ),
      }
      : {}),
    ...(kind === 'give' && (run.comboYieldBp ?? 0) > 0
      ? { yieldBp: run.comboYieldBp }
      : {}),
  }, options);
  if (!issued.ok) {
    return { ok: false, paused: true };
  }
  if (kind === 'give') {
    const prev = holding.lastGiveByGood && typeof holding.lastGiveByGood === 'object'
      && !Array.isArray(holding.lastGiveByGood)
      ? { ...holding.lastGiveByGood }
      : {};
    for (const [good, amount] of Object.entries(goods)) {
      if (Number.isInteger(amount) && amount > 0) {
        prev[good] = (Number.isInteger(prev[good]) ? prev[good] : 0) + 1;
      }
    }
    holding.lastGiveByGood = Object.freeze(prev);
  }
  if (run.error) {
    logProcess(state, 'process-error', scrapCopy(), {
      processId: process.id,
      parcelId,
    });
  } else {
    logProcess(state, 'process-complete', `${process.label} run lands.`, {
      processId: process.id,
      parcelId,
    });
  }
  holding.processRun = null;
  return { ok: true };
}

function takeHasApplied(run, parcelId, ack) {
  if (!run.takeSeq) return true;
  if (run.takeApplied) return true;
  if (!ack) return false;
  if (run.runId && ack.runId && run.runId !== ack.runId) return false;
  return (ack.watermark?.[parcelId] ?? 0) >= run.takeSeq;
}

/**
 * Advance live runs by one beat. Completions deposit or scrap only after
 * the take applied. Does not auto-start the next run — settleProcessFacilities
 * does that.
 */
export function tickProcessRuns(city, state, options = {}) {
  const ack = options.worldAck ?? (options.store ? readWorldDrawAck(options.store) : readWorldDrawAck());
  const stalled = (ack.worldBeat ?? 0) < (ack.cityFacilityStallUntil ?? 0);
  const holdings = state?.holdings ?? {};
  for (const parcelId of Object.keys(holdings).sort()) {
    const holding = holdings[parcelId];
    if (holding?.owner && holding.owner !== 'player') continue;
    const run = holding?.processRun;
    if (!run || !Number.isInteger(run.remainingBeats)) continue;
    const process = processOf(run.processId);
    if (stalled) {
      if (!run.quakeNoted) {
        logProcess(state, 'process-hold', cityStallCopy(ack.cityFacilityStallType), {
          processId: run.processId,
          parcelId,
        });
        holding.processRun = Object.freeze({ ...run, quakeNoted: true });
      }
      continue;
    }
    if (process && fireDamageForFacility(ack.world, process.facility, ack.worldBeat)) {
      if (!run.fireNoted) {
        logProcess(state, 'process-hold', fireRepairCopy(), {
          processId: run.processId,
          parcelId,
        });
        holding.processRun = Object.freeze({ ...run, fireNoted: true });
      }
      continue;
    }
    if (!takeHasApplied(run, parcelId, ack)) {
      if (!run.waitingNoted) {
        logProcess(state, 'process-wait', waitingOnYardCopy(), {
          processId: run.processId,
          parcelId,
        });
        holding.processRun = Object.freeze({ ...run, waitingNoted: true });
      }
      continue;
    }
    const live = run.takeApplied ? run : Object.freeze({ ...run, takeApplied: true });
    const remaining = live.remainingBeats - 1;
    if (remaining > 0) {
      holding.processRun = Object.freeze({ ...live, remainingBeats: remaining });
      continue;
    }
    holding.processRun = live;
    const completed = completeProcessRun(state, parcelId, holding, { ...options, worldAck: ack });
    if (!completed.ok) {
      holding.processRun = Object.freeze({ ...live, remainingBeats: 1 });
    }
  }
  return state;
}

function autoStartIdle(city, state, options = {}) {
  const holdings = state?.holdings ?? {};
  for (const parcelId of Object.keys(holdings).sort()) {
    const holding = holdings[parcelId];
    if (holding?.owner && holding.owner !== 'player') continue;
    if (!holding?.processId || holding.processRun) continue;
    const started = startProcessRun(city, state, parcelId, options);
    if (started.rejected) continue;
  }
  return state;
}

/** Settle hook: advance live runs, then start idle selected processes. */
export function settleProcessFacilities(city, state, options = {}) {
  const ack = options.worldAck ?? (options.store ? readWorldDrawAck(options.store) : readWorldDrawAck());
  const combo = options.combo ?? comboStateFor(city, state);
  const nextOptions = {
    ...options,
    worldAck: ack,
    combo,
    yardStocks: options.yardStocks ?? ack.stocks,
  };
  tickProcessRuns(city, state, nextOptions);
  const comboAfter = comboStateFor(city, state);
  autoStartIdle(city, state, { ...nextOptions, combo: comboAfter });
  return state;
}

function retractUnackedTake(state, parcelId, run) {
  const rows = Array.isArray(state.processDrawLog?.[parcelId])
    ? state.processDrawLog[parcelId].filter((row) => row.seq !== run.takeSeq)
    : [];
  state.processDrawLog = {
    ...(state.processDrawLog ?? {}),
    [parcelId]: rows,
  };
  if ((state.processDrawWatermark?.[parcelId] ?? 0) === run.takeSeq) {
    const next = run.takeSeq - 1;
    const watermark = { ...(state.processDrawWatermark ?? {}) };
    if (next > 0) watermark[parcelId] = next;
    else delete watermark[parcelId];
    state.processDrawWatermark = watermark;
  }
}

export function abortProcessRun(city, state, parcelId, options = {}) {
  const holding = state?.holdings?.[parcelId];
  if (!holding) return reject(state, 'No holding on that parcel.');
  const run = holding.processRun;
  if (!run) return reject(state, 'No run is live.');
  const ack = options.worldAck ?? (options.store ? readWorldDrawAck(options.store) : readWorldDrawAck());
  const applied = takeHasApplied(run, parcelId, ack);
  const retracted = Boolean(run.takeSeq) && !applied;
  if (retracted) retractUnackedTake(state, parcelId, run);
  const billed = Number.isInteger(run.wageCost) ? run.wageCost : 0;
  const refund = Math.max(0, billed - PROCESS_ABORT_BREAKAGE);
  state.cash = (state.cash ?? 0) + refund;
  holding.processRun = null;
  const kind = retracted ? 'retract' : 'committed';
  logProcess(state, 'process-abort', abortRunCopy(kind), {
    processId: run.processId,
    parcelId,
    refund,
    retracted,
  });
  return { ok: true, rejected: false, state, reason: '', refund, retracted };
}

export function selectProcessOnHolding(city, state, parcelId, processId) {
  const holding = state?.holdings?.[parcelId];
  if (!holding) return reject(state, 'No holding on that parcel.');
  const process = processOf(processId);
  if (!process) return reject(state, 'Unknown process.');
  if (!canHostProcessInCity(process)) {
    return reject(state, 'Mines cannot run in Melbourne.');
  }
  const form = standingProcessForm(city, state, parcelId);
  if (!facilityHostsProcess(form, process)) {
    return reject(state, 'That plant cannot host this process.');
  }
  if (holding.processRun) return reject(state, 'A run is already live.');
  holding.processId = process.id;
  return { ok: true, rejected: false, state, reason: '' };
}
