// City → globe goods and the compatibility persistence facade. Integer yields
// use standing forms; explicit export writes resolve identity through integration.
// Placement count is inlined (collapse whole:true A/B mirrors, keep distinct 1×1
// slots) so this module does not import pad-slots.js — that file pulls city.js,
// which the world envelope graph forbids.

import { CITY_MILITARY_UNIT_KINDS, WORLD_SIM_REVISION } from './world/catalog.js';
import { echoProcessDraws, parseProcessDraws, rotateProcessDrawsForRun } from './world/processes.js';
import { blocksAdjacentToPort, portCapacityFromCity } from './world/port-storage.js';
import { parseParcelId } from './grid.js';
import { resolveStoredRunIdentity } from '../integration/city-run-identity.js';

export const CITY_EXPORTS_KEY = 'district-deck:v332:city-exports:melbourne';
export const CITY_RUN_IDENTITY_KEY = 'district-deck:v332:city-run-identity:melbourne';
/** Same-origin world envelope. City reads this key for the applied-quarter ack (W2b). */
const WORLD_RUN_KEY = 'district-deck:v332:world-run';
/** Unapplied quarter payloads, oldest first. A ninth settle drops the oldest with a log line. */
export const CITY_EXPORTS_QUEUE_CAP = 8;

export const CITY_EXPORT_GOODS = Object.freeze([
  'grain', 'food', 'timber', 'materials', 'students', 'tech', 'biotech',
  'milkPowder', 'wine', 'beef', 'educationSeats', 'education',
]);

const CITY_EXPORT_GOOD_SET = new Set(CITY_EXPORT_GOODS);
const INSTITUTION_KEYS = Object.freeze([
  'spaceWorks', 'missionarySchool', 'officerSchool', 'exchange', 'biolab', 'incubator',
]);
const REQUIRED_INSTITUTION_KEYS = Object.freeze([
  'spaceWorks', 'missionarySchool', 'officerSchool', 'exchange',
]);
const PAYLOAD_KEYS = Object.freeze([
  'runId', 'quarter', 'goods', 'consumedImports', 'institutions',
]);
const OPTIONAL_PAYLOAD_KEYS = Object.freeze([
  'kitSeqWatermark', 'processDraws', 'startupValuations', 'biolabCount', 'portStorage', 'defence',
]);
const DEFENCE_UNIT_KIND_SET = new Set(CITY_MILITARY_UNIT_KINDS);
const STARTUP_VALUATION_ECHO_COUNT = 64;
const STARTUP_VALUATION_ECHO_CAP = 1_000_000_000_000;
const KIT_SEQ_CAP = 1_000_000;

/**
 * Authored cap: every goods / consumedImports integer must sit in [0, 100000].
 * Anything outside rejects the whole payload (numeric bombs included).
 */
export const CITY_EXPORT_AMOUNT_CAP = 100_000;

/**
 * Integer crates per standing form per settle. One table. No floats.
 * community-garden / veggie-patch → grain
 * sawtooth warehouse / factory / hammerbarn → materials
 * office / data-centre lab → tech trickle
 * school / university → students
 * dairy-processor → milkPowder; winery → wine; cattle-abattoir → beef
 * grain-plot → grain (stacks with garden grain)
 * educationSeats = count of standing school/university forms
 * education = min(students, educationSeats) for the Tokyo tuition book
 */
export const CAMPUS_FORMS = Object.freeze([
  'school-primary', 'school-high', 'university-old-arts',
]);
const CAMPUS_FORM_SET = new Set(CAMPUS_FORMS);

export const INSTITUTION_FORMS = Object.freeze({
  spaceWorks: 'space-works',
  missionarySchool: 'missionary-school',
  officerSchool: 'officer-school',
  exchange: 'international-exchange',
  biolab: 'biolab',
  incubator: 'incubator',
});
// Watermark keys arrive as KIT ids (e.g. 'ai-incubator') from consumeBuildKit
// as well as form ids — an unknown key rejects the whole payload, so both
// vocabularies are admitted (the V4.7 emptyGoods lesson, applied in advance).
const INSTITUTION_ID_SET = new Set([
  ...Object.values(INSTITUTION_FORMS),
  'space-works-kit', 'ai-incubator',
]);

export const CITY_FORM_YIELDS = Object.freeze({
  'community-garden': Object.freeze({ grain: 2 }),
  biolab: Object.freeze({ biotech: 1 }),
  'veggie-patch': Object.freeze({ grain: 2 }),
  'warehouse-brick': Object.freeze({ materials: 2 }),
  'factory-light': Object.freeze({ materials: 3 }),
  'hammerbarn': Object.freeze({ materials: 2 }),
  'tower-office': Object.freeze({ tech: 1 }),
  'office-lowrise': Object.freeze({ tech: 1 }),
  'warehouse-datacentre': Object.freeze({ tech: 2 }),
  'school-primary': Object.freeze({ students: 1 }),
  'school-high': Object.freeze({ students: 2 }),
  'university-old-arts': Object.freeze({ students: 3 }),
  'dairy-processor': Object.freeze({ milkPowder: 2 }),
  'winery': Object.freeze({ wine: 2 }),
  'cattle-abattoir': Object.freeze({ beef: 2 }),
  'grain-plot': Object.freeze({ grain: 3 }),
});

/**
 * Integer offtake per standing / working form per settle. One table. No floats.
 * Walked ARCHETYPES 2026-08-29:
 *   - construction holdings (working) → fittings 1 each
 *   - petrol-station → oil 1
 *   - hospitality/kitchen: only `cafe-corner` has useClass hospitality; no kitchen
 *     useClass; no hotel archetype (hotels are walk-up conversions, counted below)
 *   - international-exchange → credit 1 (Sydney line's honest consumer)
 */
export const CITY_FORM_CONSUMPTION = Object.freeze({
  'petrol-station': Object.freeze({ oil: 1 }),
  'cafe-corner': Object.freeze({ food: 1 }),
  'international-exchange': Object.freeze({ credit: 1 }),
});

function emptyGoods() {
  return {
    grain: 0,
    food: 0,
    timber: 0,
    materials: 0,
    students: 0,
    tech: 0,
    milkPowder: 0,
    wine: 0,
    beef: 0,
    educationSeats: 0,
    education: 0,
    biotech: 0,
  };
}

function addYield(goods, formId) {
  const row = CITY_FORM_YIELDS[formId];
  if (!row) return;
  for (const [good, amount] of Object.entries(row)) {
    goods[good] += amount;
  }
}

function addConsumption(consumed, formId) {
  const row = CITY_FORM_CONSUMPTION[formId];
  if (!row) return;
  for (const [good, amount] of Object.entries(row)) {
    consumed[good] = (consumed[good] ?? 0) + amount;
  }
}

/**
 * Count placements, not archetype ids. Same rule as standingPadSlotPlacements:
 * collapse only the whole:true A/B mirror (one factory on a pad). Distinct 1×1
 * slot placements stay distinct. Inlined so the envelope graph stays city-free.
 */
function standingSlotRecords(holding) {
  const slots = holding?.padSlots;
  if (!slots || typeof slots !== 'object') return [];
  const records = [];
  for (const key of ['A', 'B']) {
    const slot = slots[key];
    if (slot?.status === 'standing' && typeof slot.archetypeId === 'string') {
      records.push({ slot: key, record: slot });
    }
  }
  return records;
}

function holdingStandingPlacements(holding, status) {
  const slotted = standingSlotRecords(holding);
  if (holding?.siteCleared && slotted.length === 0) return [];
  if (slotted.length) {
    const whole = slotted.filter(({ record }) => record.whole === true);
    if (whole.length) return [whole[0].record.archetypeId];
    return slotted.map(({ record }) => record.archetypeId);
  }
  const primary = status?.builtArchetypeId ?? holding?.archetypeId ?? null;
  return typeof primary === 'string' && primary ? [primary] : [];
}

function holdingYieldForms(holding, status) {
  // Slot records already carry per-slot status: a standing slot A yields even
  // while slot B is under works. Only the unslotted primary-identity fallback
  // must stay silent during construction (the identity describes the works
  // target, not a standing building).
  const slotted = standingSlotRecords(holding);
  if (slotted.length || holding?.siteCleared) {
    return holdingStandingPlacements(holding, status);
  }
  if (holding?.construction) return [];
  return holdingStandingPlacements(holding, status);
}

function collectStandingForms(city, state) {
  const forms = [];
  const holdings = state?.holdings ?? {};
  const parcelStatus = state?.parcelStatus ?? {};
  for (const parcelId of Object.keys(holdings)) {
    const holding = holdings[parcelId];
    if (!holding) continue;
    forms.push(...holdingYieldForms(holding, parcelStatus[parcelId]));
  }
  for (const civic of city?.civicUses ?? []) {
    if (typeof civic?.useId === 'string' && civic.useId) forms.push(civic.useId);
  }
  for (const core of city?.blockCores ?? []) {
    if (typeof core?.useId === 'string' && core.useId) forms.push(core.useId);
  }
  return forms;
}

function deriveConsumedImports(city, state) {
  const consumed = {};
  for (const holding of Object.values(state?.holdings ?? {})) {
    if (holding?.construction) {
      consumed.fittings = (consumed.fittings ?? 0) + 1;
    }
    if (holding?.hospitality?.kind === 'hotel' && !holding?.siteCleared) {
      consumed.food = (consumed.food ?? 0) + 1;
    }
  }
  for (const formId of collectStandingForms(city, state)) {
    addConsumption(consumed, formId);
  }
  return consumed;
}

export function deriveInstitutions(forms) {
  const standing = new Set(forms ?? []);
  return Object.freeze({
    spaceWorks: standing.has(INSTITUTION_FORMS.spaceWorks),
    missionarySchool: standing.has(INSTITUTION_FORMS.missionarySchool),
    officerSchool: standing.has(INSTITUTION_FORMS.officerSchool),
    exchange: standing.has(INSTITUTION_FORMS.exchange),
    biolab: standing.has(INSTITUTION_FORMS.biolab),
    incubator: standing.has(INSTITUTION_FORMS.incubator),
  });
}

export function deriveBiolabCount(forms) {
  return (forms ?? []).filter((formId) => formId === INSTITUTION_FORMS.biolab).length;
}

export function deriveStartupValuations(state) {
  const values = [];
  for (const holding of Object.values(state?.holdings ?? {})) {
    const venture = holding?.venture;
    if (!venture || venture.id !== 'ai-startup') continue;
    if (venture.status !== 'operating' && venture.status !== 'valued') continue;
    const valuation = venture.valuation;
    if (!Number.isInteger(valuation) || valuation <= 0) continue;
    values.push(valuation);
    if (values.length >= STARTUP_VALUATION_ECHO_COUNT) break;
  }
  return values;
}

function cityRunIdFallback(state) {
  const seed = Number.isInteger(state?.seed) ? String(state.seed) : '0';
  const mode = typeof state?.mode === 'string' && state.mode ? state.mode : 'solo';
  return `${seed}:${mode}`;
}

function readStore(store, key) {
  try {
    if (store && typeof store.get === 'function') return store.get(key) ?? null;
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStore(store, key, value) {
  try {
    if (store && typeof store.set === 'function') return Boolean(store.set(key, value));
    globalThis.localStorage?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStore(store, key) {
  try {
    if (store && typeof store.remove === 'function') {
      store.remove(key);
      return;
    }
    globalThis.localStorage?.removeItem(key);
  } catch { /* optional storage */ }
}

export function resolveCityRunId(state, store) {
  // This explicit persistence API is impure; reducers/replays do not call it.
  // A stored identity must not inspect state or mint a new token.
  return resolveStoredRunIdentity(store, CITY_RUN_IDENTITY_KEY, () => cityRunIdFallback(state));
}

function parseStartupValuations(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > STARTUP_VALUATION_ECHO_COUNT) return null;
  const restored = [];
  for (const amount of value) {
    if (!Number.isInteger(amount) || amount < 0 || amount > STARTUP_VALUATION_ECHO_CAP) return null;
    restored.push(amount);
  }
  return restored;
}

function parseBiolabCount(value, institutions) {
  if (value == null) return institutions?.biolab === true ? 1 : 0;
  if (!Number.isInteger(value) || value < 0 || value > CITY_EXPORT_AMOUNT_CAP) return null;
  return value;
}

const PORT_STORAGE_CAPACITY_KEYS = Object.freeze(['yard', 'warehouse', 'tank']);

function parsePortStorage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  for (const key of Object.keys(value)) {
    if (key !== 'adjacentWarehouses' && key !== 'capacity') return null;
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'adjacentWarehouses')) return null;
  if (!Object.prototype.hasOwnProperty.call(value, 'capacity')) return null;
  const adjacentWarehouses = value.adjacentWarehouses;
  if (!Number.isInteger(adjacentWarehouses) || adjacentWarehouses < 0
    || adjacentWarehouses > CITY_EXPORT_AMOUNT_CAP) {
    return null;
  }
  const cap = value.capacity;
  if (!cap || typeof cap !== 'object' || Array.isArray(cap)) return null;
  const capKeys = Object.keys(cap);
  if (capKeys.length !== PORT_STORAGE_CAPACITY_KEYS.length) return null;
  const capacity = {};
  for (const key of PORT_STORAGE_CAPACITY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(cap, key)) return null;
    const amount = cap[key];
    if (!Number.isInteger(amount) || amount < 0 || amount > CITY_EXPORT_AMOUNT_CAP) return null;
    capacity[key] = amount;
  }
  return Object.freeze({
    adjacentWarehouses,
    capacity: Object.freeze(capacity),
  });
}

function parseDefenceUnit(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!DEFENCE_UNIT_KIND_SET.has(value.kind)) return null;
  if (value.blockId != null && typeof value.blockId !== 'string') return null;
  const unit = { kind: value.kind, blockId: value.blockId ?? null };
  if (typeof value.id === 'string' && value.id.length > 0) unit.id = value.id;
  return Object.freeze(unit);
}

function parseDefence(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!Array.isArray(value.units)) return null;
  if (value.officerOnWatch !== true && value.officerOnWatch !== false) return null;
  if (!Array.isArray(value.portBlocks)) return null;
  const units = [];
  for (const row of value.units) {
    const unit = parseDefenceUnit(row);
    if (!unit) return null;
    units.push(unit);
  }
  const portBlocks = [];
  for (const blockId of value.portBlocks) {
    if (typeof blockId !== 'string' || blockId.length === 0) return null;
    portBlocks.push(blockId);
  }
  const restored = {
    units: Object.freeze(units),
    officerOnWatch: value.officerOnWatch === true,
    portBlocks: Object.freeze(portBlocks),
  };
  if (Array.isArray(value.targets)) {
    const targets = [];
    for (const row of value.targets) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
      if (typeof row.id !== 'string' || row.id.length === 0) return null;
      if (row.blockId != null && typeof row.blockId !== 'string') return null;
      targets.push(Object.freeze({ id: row.id, blockId: row.blockId ?? null }));
    }
    restored.targets = Object.freeze(targets);
  }
  return Object.freeze(restored);
}

function readWorldDamage(store) {
  const raw = readStore(store, WORLD_RUN_KEY);
  if (!raw) return { damaged: {}, beat: 0 };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { damaged: {}, beat: 0 };
    }
    if (parsed.simRevision !== WORLD_SIM_REVISION) return { damaged: {}, beat: 0 };
    const damaged = parsed.facilities?.damaged && typeof parsed.facilities.damaged === 'object'
      && !Array.isArray(parsed.facilities.damaged)
      ? parsed.facilities.damaged
      : {};
    const beat = Number.isInteger(parsed.beat) ? parsed.beat : 0;
    return { damaged, beat };
  } catch {
    return { damaged: {}, beat: 0 };
  }
}

function damageLive(row, beat) {
  if (!row || typeof row !== 'object') return false;
  if (!Number.isInteger(row.until) || !Number.isInteger(row.since)) return false;
  if (beat < row.since) return false;
  return beat < row.until;
}

function integerMapValid(value, allowedKeys = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const [key, amount] of Object.entries(value)) {
    if (allowedKeys && !allowedKeys.has(key)) return false;
    if (!Number.isInteger(amount) || amount < 0 || amount > CITY_EXPORT_AMOUNT_CAP) return false;
  }
  return true;
}

function parseKitSeqWatermark(value) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const restored = {};
  for (const [institutionId, seq] of Object.entries(value)) {
    if (!INSTITUTION_ID_SET.has(institutionId)) return null;
    if (!Number.isInteger(seq) || seq < 0 || seq > KIT_SEQ_CAP) return null;
    restored[institutionId] = seq;
  }
  return restored;
}

function echoKitSeqWatermark(value) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('kitSeqWatermark must be a record.');
  }
  const restored = {};
  for (const [institutionId, seq] of Object.entries(value)) {
    if (!INSTITUTION_ID_SET.has(institutionId)) {
      throw new RangeError(`Unknown kitSeqWatermark institution: ${institutionId}`);
    }
    if (!Number.isInteger(seq) || seq < 0 || seq > KIT_SEQ_CAP) {
      throw new RangeError(`kitSeqWatermark.${institutionId} must be a non-negative integer.`);
    }
    restored[institutionId] = seq;
  }
  return restored;
}

export function parseCityExportsPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  const allowed = new Set([...PAYLOAD_KEYS, ...OPTIONAL_PAYLOAD_KEYS]);
  for (const key of keys) {
    if (!allowed.has(key)) return null;
  }
  for (const key of PAYLOAD_KEYS) {
    if (!keys.includes(key)) return null;
  }
  if (typeof value.runId !== 'string' || value.runId.length === 0) return null;
  if (!Number.isInteger(value.quarter) || value.quarter < 0 || value.quarter > 1_000_000) return null;
  if (!integerMapValid(value.goods, CITY_EXPORT_GOOD_SET)) return null;
  for (const good of CITY_EXPORT_GOODS) {
    if (!Number.isInteger(value.goods[good]) || value.goods[good] < 0 || value.goods[good] > CITY_EXPORT_AMOUNT_CAP) {
      return null;
    }
  }
  if (!integerMapValid(value.consumedImports)) return null;
  const institutions = value.institutions;
  if (!institutions || typeof institutions !== 'object' || Array.isArray(institutions)) return null;
  const institutionKeys = Object.keys(institutions);
  for (const key of institutionKeys) {
    if (!INSTITUTION_KEYS.includes(key)) return null;
    if (institutions[key] !== true && institutions[key] !== false) return null;
  }
  for (const key of REQUIRED_INSTITUTION_KEYS) {
    if (!institutionKeys.includes(key)) return null;
  }
  const kitSeqWatermark = parseKitSeqWatermark(value.kitSeqWatermark);
  if (!kitSeqWatermark) return null;
  const processDraws = parseProcessDraws(value.processDraws, value.runId);
  if (!processDraws) return null;
  const restoredInstitutions = Object.freeze({
    spaceWorks: institutions.spaceWorks === true,
    missionarySchool: institutions.missionarySchool === true,
    officerSchool: institutions.officerSchool === true,
    exchange: institutions.exchange === true,
    biolab: institutions.biolab === true,
    incubator: institutions.incubator === true,
  });
  const startupValuations = parseStartupValuations(value.startupValuations);
  if (!startupValuations) return null;
  const biolabCount = parseBiolabCount(value.biolabCount, restoredInstitutions);
  if (biolabCount == null) return null;
  const restored = {
    runId: value.runId,
    quarter: value.quarter,
    goods: Object.freeze({ ...emptyGoods(), ...value.goods }),
    consumedImports: Object.freeze({ ...value.consumedImports }),
    institutions: restoredInstitutions,
    kitSeqWatermark: Object.freeze(kitSeqWatermark),
    processDraws: Object.freeze(processDraws),
    startupValuations: Object.freeze(startupValuations),
    biolabCount,
  };
  if (Object.prototype.hasOwnProperty.call(value, 'portStorage')) {
    const portStorage = parsePortStorage(value.portStorage);
    if (!portStorage) return null;
    restored.portStorage = portStorage;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'defence')) {
    const defence = parseDefence(value.defence);
    if (!defence) return null;
    restored.defence = defence;
  }
  return Object.freeze(restored);
}

/**
 * CITY_EXPORTS_KEY stores an array of unapplied quarter payloads (oldest first).
 * A stored single-object legacy payload parses as a one-entry queue.
 */
export function parseCityExportsQueue(value) {
  if (Array.isArray(value)) {
    const queue = [];
    for (const entry of value) {
      const parsed = parseCityExportsPayload(entry);
      if (!parsed) return null;
      queue.push(parsed);
    }
    return queue;
  }
  const one = parseCityExportsPayload(value);
  if (!one) return null;
  return [one];
}

export function latestCityExportsPayload(queue) {
  if (!Array.isArray(queue) || queue.length === 0) return null;
  return queue[queue.length - 1];
}

/**
 * Echo merge across queued entries. kitSeqWatermark is a per-institution
 * monotonic maximum. processDraws concatenate by facility: rows union on seq
 * (later write wins a duplicate seq), seq watermark is the max.
 * Live kit/process readers use the LATEST entry, which is already the city's
 * current snapshot; merge is the cross-entry identity of that snapshot.
 */
export function mergeExportEchoes(queue) {
  const kitSeqWatermark = {};
  const processDraws = {};
  for (const entry of queue ?? []) {
    for (const [institutionId, seq] of Object.entries(entry?.kitSeqWatermark ?? {})) {
      if (!Number.isInteger(seq)) continue;
      kitSeqWatermark[institutionId] = Math.max(kitSeqWatermark[institutionId] ?? 0, seq);
    }
    for (const [facilityId, draw] of Object.entries(entry?.processDraws ?? {})) {
      const existing = processDraws[facilityId] ?? { seq: 0, rows: [] };
      const bySeq = new Map();
      for (const row of existing.rows) {
        if (Number.isInteger(row?.seq)) bySeq.set(row.seq, row);
      }
      for (const row of draw?.rows ?? []) {
        if (Number.isInteger(row?.seq)) bySeq.set(row.seq, row);
      }
      const rows = [...bySeq.values()].sort((a, b) => a.seq - b.seq);
      const drawSeq = Number.isInteger(draw?.seq) ? draw.seq : 0;
      processDraws[facilityId] = Object.freeze({
        seq: Math.max(existing.seq, drawSeq),
        rows: Object.freeze(rows),
      });
    }
  }
  return Object.freeze({
    kitSeqWatermark: Object.freeze({ ...kitSeqWatermark }),
    processDraws: Object.freeze({ ...processDraws }),
  });
}

export function ledgerLapseCopy(quarter) {
  return `The globe fell behind — Q${quarter}'s ledger lapsed.`;
}

/**
 * Same-origin ack of the world's applied city-ledger watermark. Mirrors the
 * W2b WORLD_RUN_KEY read: missing or foreign-revision envelopes return null
 * (fail closed — do not prune).
 */
export function readCityExportsAck(store) {
  const raw = readStore(store, WORLD_RUN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (parsed.simRevision !== WORLD_SIM_REVISION) return null;
    const ambition = parsed.ambition;
    if (!ambition || typeof ambition !== 'object' || Array.isArray(ambition)) return null;
    if (
      typeof ambition.lastLedgerRunId === 'string'
      && ambition.lastLedgerRunId.length > 0
      && Number.isInteger(ambition.lastLedgerQuarter)
      && ambition.lastLedgerQuarter >= 0
    ) {
      return { runId: ambition.lastLedgerRunId, quarter: ambition.lastLedgerQuarter };
    }
    const identity = ambition.lastLedgerApplied;
    if (typeof identity !== 'string' || identity.length === 0) return null;
    const idx = identity.lastIndexOf(':');
    if (idx <= 0 || idx >= identity.length - 1) return null;
    const runId = identity.slice(0, idx);
    const quarter = Number(identity.slice(idx + 1));
    if (!Number.isInteger(quarter) || quarter < 0 || runId.length === 0) return null;
    return { runId, quarter };
  } catch {
    return null;
  }
}

function pruneAppliedExports(queue, runId, ack) {
  return queue.filter((entry) => {
    if (!entry || entry.runId !== runId) return false;
    if (ack && ack.runId === entry.runId && entry.quarter <= ack.quarter) return false;
    return true;
  });
}

function noteLedgerLapse(state, quarter) {
  if (!state || !Array.isArray(state.log)) return;
  state.log.push({
    q: Number.isInteger(state.quarter) ? state.quarter : 0,
    type: 'exports-lapse',
    body: ledgerLapseCopy(quarter),
  });
}

function parcelBlockId(parcelId) {
  try {
    const parsed = parseParcelId(parcelId);
    return `${parsed.bx},${parsed.bz}`;
  } catch {
    return null;
  }
}

function collectFacilityTargets(city, state) {
  const targets = [];
  const holdings = state?.holdings ?? {};
  const parcelStatus = state?.parcelStatus ?? {};
  for (const parcelId of Object.keys(holdings)) {
    const forms = holdingYieldForms(holdings[parcelId], parcelStatus[parcelId]);
    const blockId = parcelBlockId(parcelId);
    if (!blockId) continue;
    for (const formId of forms) {
      targets.push(Object.freeze({ id: formId, blockId }));
    }
  }
  return Object.freeze(targets);
}

function deriveDefence(city, state) {
  const military = state?.military;
  const units = Array.isArray(military?.units)
    ? military.units
      .filter((unit) => unit && DEFENCE_UNIT_KIND_SET.has(unit.kind))
      .map((unit) => Object.freeze({
        kind: unit.kind,
        blockId: unit.blockId == null ? null : String(unit.blockId),
        id: typeof unit.id === 'string' ? unit.id : undefined,
      }))
    : [];
  const portBlocks = blocksAdjacentToPort(city).map((block) => `${block.bx},${block.bz}`);
  return Object.freeze({
    units: Object.freeze(units.map((unit) => Object.freeze({
      kind: unit.kind,
      blockId: unit.blockId,
      ...(unit.id ? { id: unit.id } : {}),
    }))),
    officerOnWatch: military?.watch?.officerOnWatch === true
      || units.some((unit) => unit.kind === 'officer' && unit.blockId),
    portBlocks: Object.freeze(portBlocks),
    targets: collectFacilityTargets(city, state),
  });
}

export function deriveCityExports(city, state, runId = null, store = null) {
  const { damaged, beat } = readWorldDamage(store);
  const goods = emptyGoods();
  const forms = collectStandingForms(city, state);
  for (const formId of forms) {
    if (damageLive(damaged[formId], beat)) continue;
    addYield(goods, formId);
  }
  goods.educationSeats = forms.filter((formId) => CAMPUS_FORM_SET.has(formId)).length;
  goods.education = Math.min(goods.students, goods.educationSeats);
  const quarter = Number.isInteger(state?.quarter) ? state.quarter : 0;
  const id = typeof runId === 'string' && runId.length > 0
    ? runId
    : cityRunIdFallback(state);
  const institutions = deriveInstitutions(forms);
  const portStorage = portCapacityFromCity(city, state);
  const processDraws = echoProcessDraws(state?.processDrawLog, state?.processDrawWatermark, id);
  const filteredDraws = {};
  for (const [facilityId, draw] of Object.entries(processDraws)) {
    if (damageLive(damaged[facilityId], beat)) {
      filteredDraws[facilityId] = Object.freeze({
        seq: draw.seq,
        rows: Object.freeze([]),
      });
    } else {
      filteredDraws[facilityId] = draw;
    }
  }
  return Object.freeze({
    runId: id,
    quarter,
    goods: Object.freeze({ ...goods }),
    consumedImports: Object.freeze({ ...deriveConsumedImports(city, state) }),
    institutions,
    kitSeqWatermark: Object.freeze(echoKitSeqWatermark(state?.kitSeqWatermark)),
    processDraws: Object.freeze(filteredDraws),
    startupValuations: Object.freeze(deriveStartupValuations(state)),
    biolabCount: deriveBiolabCount(forms),
    portStorage: Object.freeze({
      adjacentWarehouses: portStorage.adjacentWarehouses,
      capacity: Object.freeze({ ...portStorage.capacity }),
    }),
    defence: deriveDefence(city, state),
  });
}

/**
 * Pure write gate. Solo `settle` always writes.
 * Hotseat `commit-quarter` writes only when the quarter advanced (barrier
 * settled a non-terminal Q) OR the accepted result carries a `kind:'settle'`
 * event (terminal Q does not increment; the settle record is the signal).
 * `settlementPresentingUntil` is armed from that same event as the UI freeze;
 * it is not a second write key because it lingers until dismiss.
 */
export function shouldWriteCityExports(verb, prevQuarter, nextQuarter, events = null) {
  if (verb === 'settle') return true;
  if (verb !== 'commit-quarter') return false;
  if (Number.isInteger(prevQuarter) && Number.isInteger(nextQuarter) && nextQuarter > prevQuarter) {
    return true;
  }
  if (Array.isArray(events) && events.some((event) => event?.kind === 'settle')) return true;
  return false;
}

export function writeCityExports(city, state, store) {
  try {
    const runId = resolveCityRunId(state, store);
    if (typeof runId !== 'string' || runId.length === 0) return false;
    rotateProcessDrawsForRun(state, runId);
    const nextPayload = deriveCityExports(city, state, runId, store);
    const raw = readStore(store, CITY_EXPORTS_KEY);
    let queue = [];
    if (raw) {
      try {
        const parsed = parseCityExportsQueue(JSON.parse(raw));
        if (parsed) queue = [...parsed];
      } catch {
        queue = [];
      }
    }
    const ack = readCityExportsAck(store);
    queue = pruneAppliedExports(queue, runId, ack);
    const last = queue[queue.length - 1];
    if (last && last.runId === nextPayload.runId && last.quarter === nextPayload.quarter) {
      queue[queue.length - 1] = nextPayload;
    } else {
      queue.push(nextPayload);
    }
    while (queue.length > CITY_EXPORTS_QUEUE_CAP) {
      const dropped = queue.shift();
      noteLedgerLapse(state, dropped?.quarter);
    }
    return writeStore(store, CITY_EXPORTS_KEY, JSON.stringify(queue));
  } catch {
    return false;
  }
}

export function clearCityExports(store) {
  removeStore(store, CITY_EXPORTS_KEY);
  removeStore(store, CITY_RUN_IDENTITY_KEY);
}
