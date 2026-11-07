// V2 room identity and transfer accounting. Mutators receive reducer-owned clones only.
import { RULES } from './content.js';
import { renovateBase } from './succession.js';
import { ROOM_IDS, FINISH_LEVELS, roomJobs } from './renovation-rooms.js';

export function validateRoomEconomyVersion(value) {
  if (value !== undefined && value !== 2) throw new Error('Unsupported room economy version.');
}
export function isRoomEconomyV2(state) { return state?.roomEconomyVersion === 2; }
export function pendingRoomReplacementReason(state, id) {
  return isRoomEconomyV2(state) && roomJobs(state.holdings?.[id]).length
    ? 'Finish pending room work before replacing these rooms.' : null;
}

export function resetRoomGeneration(state, id, standing) {
  if (!isRoomEconomyV2(state)) return;
  const status = state.parcelStatus[id];
  if (!status) throw new Error('Missing room generation status.');
  // Repeated clear events cannot consume another generation. A completed replacement
  // from standing is new construction even without a separate demolition action.
  if (!standing && status.roomGenerationState === 'cleared') return;
  status.roomGeneration = (status.roomGeneration ?? 0) + 1;
  status.roomGenerationState = standing ? 'standing' : 'cleared';
  delete status.rooms;
  delete status.roomFinish;
  delete status.roomEconomy;
  delete status.roomCompletedBase;
}

export function captureRoomCompletedBase(state, id, holding) {
  if (!isRoomEconomyV2(state)) return;
  const status = state.parcelStatus[id];
  if (holding.siteCleared || status.roomGenerationState === 'cleared') {
    delete status.roomCompletedBase;
    return;
  }
  status.roomCompletedBase = {
    generation: status.roomGeneration ?? 0,
    archetypeId: holding.archetypeId,
    landUseId: holding.landUseId ?? holding.archetypeId,
    level: holding.level,
    condition: holding.condition,
    basePrice: holding.basePrice,
    baseRent: holding.baseRent,
  };
}

/** Pure transfer basis: preserve earned capital, rebase condition exactly once. */
export function roomTransferBase(state, id, normal) {
  if (!isRoomEconomyV2(state)) return normal;
  const status = state.parcelStatus[id], saved = status?.roomCompletedBase;
  // Unbuilt consolidated sites intentionally retain a null built-form override.
  const archetypeId = status?.builtArchetypeId ?? normal.archetypeId;
  const landUseId = status?.builtLandUseId ?? status?.builtArchetypeId
    ?? normal.landUseId ?? normal.archetypeId;
  if (!saved || status.roomGenerationState === 'cleared'
    || saved.generation !== (status.roomGeneration ?? 0)
    || saved.archetypeId !== archetypeId || saved.landUseId !== landUseId
    || saved.level !== status.builtLevel) return normal;
  const values = saved.condition === status.condition
    ? { basePrice: saved.basePrice, baseRent: saved.baseRent }
    : renovateBase(saved.basePrice, saved.baseRent, saved.condition, status.condition);
  return { ...normal, ...values };
}

/** Lineage holdings supersede any older exit cache when an intact merge is undone. */
export function restoreParentRoomBase(state, id, savedHolding) {
  if (!isRoomEconomyV2(state)) return;
  captureRoomCompletedBase(state, id, savedHolding);
  const holding = state.holdings[id], saved = state.parcelStatus[id].roomCompletedBase;
  if (!saved) return;
  Object.assign(holding, saved.condition === holding.condition
    ? { basePrice: saved.basePrice, baseRent: saved.baseRent }
    : renovateBase(saved.basePrice, saved.baseRent, saved.condition, holding.condition));
}

function integer(value, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Invalid room economy ${label}.`);
  }
}
function finish(value) {
  if (value !== null && !FINISH_LEVELS.includes(value)) throw new Error('Invalid room economy finish.');
}
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid room economy ${label}.`);
  }
}
function basis(value, generation) {
  object(value, 'basis');
  if (value.generation !== generation) throw new Error('Room basis generation mismatch.');
  integer(value.basisPrice, 'basis price');
  if (typeof value.basisApartment !== 'boolean'
    || !['very_low', 'low', 'medium', 'high', 'prestige'].includes(value.basisBand)) {
    throw new Error('Invalid room economy basis kind.');
  }
  for (const key of ['initialConditions', 'initialFinishes']) {
    object(value[key], key);
    if (Object.keys(value[key]).sort().join() !== [...ROOM_IDS].sort().join()) {
      throw new Error('Invalid room basis IDs.');
    }
  }
  for (const id of ROOM_IDS) {
    integer(value.initialConditions[id], 'initial condition', 0, 100);
    finish(value.initialFinishes[id]);
    if (value.initialFinishes[id] !== null) throw new Error('Unsupported initial earned finish.');
  }
}
function earned(value, roomId) {
  object(value, 'earned record');
  finish(value.highestFinish);
  integer(value.awardedValue, 'awarded value');
  integer(value.awardedRentBp, 'awarded rent', 0, 400);
  if (value.highestFinish === null && (value.awardedValue !== 0 || value.awardedRentBp !== 0)) {
    throw new Error('Unearned room has rewards.');
  }
  const expectedBp = ['kitchen', 'bathroom'].includes(roomId)
    ? ({ basic: 150, deluxe: 250, luxury: 400 }[value.highestFinish] ?? 0) : 0;
  if (value.awardedRentBp !== expectedBp) throw new Error('Room finish/rent entitlement mismatch.');
}

/** Validate metadata without normalizing, migrating or minting any earned entitlement. */
export function validateRoomEconomyState(state) {
  validateRoomEconomyVersion(state.roomEconomyVersion);
  for (const start of (state.log ?? []).filter(row => row.type === 'run-start')) {
    validateRoomEconomyVersion(start.roomEconomyVersion);
    if (start.roomEconomyVersion !== state.roomEconomyVersion) throw new Error('Run-start room economy mismatch.');
  }
  if (!isRoomEconomyV2(state)) {
    for (const status of Object.values(state.parcelStatus ?? {})) {
      if (status.roomEconomy || status.roomCompletedBase || status.roomGeneration !== undefined
        || status.roomGenerationState !== undefined) throw new Error('Legacy room state contains v2 metadata.');
    }
    for (const holding of Object.values(state.holdings ?? {})) {
      for (const job of roomJobs(holding)) {
        if (job.roomEconomyVersion !== undefined) throw new Error('Legacy room job contains version metadata.');
      }
    }
    return state;
  }
  for (const [id, status] of Object.entries(state.parcelStatus ?? {})) {
    const generation = status.roomGeneration ?? 0, economy = status.roomEconomy;
    integer(generation, 'generation');
    if (status.roomGenerationState !== undefined
      && !['standing', 'cleared'].includes(status.roomGenerationState)) throw new Error('Invalid room generation state.');
    if (economy) {
      basis(economy, generation);
      object(economy.rooms, 'room records');
      for (const [roomId, value] of Object.entries(economy.rooms)) {
        if (!ROOM_IDS.includes(roomId)) throw new Error('Invalid earned room ID.');
        earned(value, roomId);
      }
    }
    for (const [roomId, current] of Object.entries(status.rooms ?? {})) {
      if (!ROOM_IDS.includes(roomId)) throw new Error('Invalid room condition ID.');
      integer(current, 'condition', 0, 100);
    }
    for (const [roomId, current] of Object.entries(status.roomFinish ?? {})) {
      if (!ROOM_IDS.includes(roomId)) throw new Error('Invalid room finish ID.');
      finish(current);
      if (current !== null && FINISH_LEVELS.indexOf(current)
        > FINISH_LEVELS.indexOf(economy?.rooms?.[roomId]?.highestFinish ?? null)) {
        throw new Error('Current finish exceeds earned provenance.');
      }
    }
    const saved = status.roomCompletedBase;
    if (saved) {
      object(saved, 'completed base');
      integer(saved.generation, 'snapshot generation');
      if (saved.generation !== generation || status.roomGenerationState === 'cleared') {
        throw new Error('Stale room completed generation.');
      }
      for (const key of ['basePrice', 'baseRent', 'level']) integer(saved[key], key);
      integer(saved.condition, 'building condition', 0, RULES.maxCondition);
      if (typeof saved.archetypeId !== 'string' || typeof saved.landUseId !== 'string') {
        throw new Error('Invalid room completed form.');
      }
    }
    const jobs = roomJobs(state.holdings?.[id]);
    if (new Set(jobs.map(job => job.roomId)).size !== jobs.length) throw new Error('Duplicate pending room.');
    if (status.roomGenerationState === 'cleared' && (economy || jobs.length)) throw new Error('Cleared rooms retain work.');
    for (const job of jobs) validatePending(job, economy, generation);
  }
  return state;
}

function validatePending(job, economy, generation) {
  if (job.roomEconomyVersion !== 2) throw new Error('Unversioned job in v2 run.');
  const transition = job.roomEconomyTransition;
  object(transition, 'pending transition');
  if (transition.generation !== generation || transition.roomId !== job.roomId
    || !ROOM_IDS.includes(job.roomId)) throw new Error('Pending room generation/ID mismatch.');
  basis(transition.basis, generation);
  earned(transition, job.roomId);
  if (!FINISH_LEVELS.includes(job.finish)) throw new Error('Invalid pending room finish.');
  integer(job.valueAdd, 'pending value');
  integer(job.cost, 'pending cost');
  integer(job.startedQuarter, 'start', 1);
  integer(job.completionQuarter, 'completion', job.startedQuarter);
  object(job.rentRatio, 'rent ratio');
  integer(job.rentRatio.numerator, 'rent numerator', 1);
  integer(job.rentRatio.denominator, 'rent denominator', 1);
  const prior = economy?.rooms?.[job.roomId];
  if (!economy || transition.awardedValue < (prior?.awardedValue ?? 0)
    || transition.awardedRentBp < (prior?.awardedRentBp ?? 0)) throw new Error('Pending earned entitlement regresses.');
  if (FINISH_LEVELS.indexOf(transition.highestFinish) < FINISH_LEVELS.indexOf(prior?.highestFinish ?? null)
    || FINISH_LEVELS.indexOf(transition.highestFinish) < FINISH_LEVELS.indexOf(job.finish)) {
    throw new Error('Pending finish entitlement regresses.');
  }
  const oldBp = prior?.awardedRentBp ?? 0;
  const ratio = transition.awardedRentBp === oldBp ? { numerator: 1, denominator: 1 }
    : { numerator: 10000 + transition.awardedRentBp, denominator: 10000 + oldBp };
  if (job.rentRatio.numerator !== ratio.numerator || job.rentRatio.denominator !== ratio.denominator) {
    throw new Error('Pending rent delta mismatch.');
  }
  if (transition.awardedValue - (prior?.awardedValue ?? 0) !== job.valueAdd) throw new Error('Pending value delta mismatch.');
  for (const key of ['generation', 'basisPrice', 'basisApartment', 'basisBand']) {
    if (transition.basis[key] !== economy[key]) throw new Error('Pending basis mismatch.');
  }
  for (const key of ['initialConditions', 'initialFinishes']) {
    for (const id of ROOM_IDS) if (transition.basis[key][id] !== economy[key][id]) throw new Error('Pending basis mismatch.');
  }
}
