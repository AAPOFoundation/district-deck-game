// Yard → city institution kits. Vouchers live in the world envelope
// (ambition.buildKits / ambition.kitSeq on WORLD_RUN_KEY). City state holds a
// lossless per-institution sequence watermark. Same-origin localStorage only.

import {
  CITY_EXPORTS_KEY,
  CITY_RUN_IDENTITY_KEY,
  latestCityExportsPayload,
  parseCityExportsQueue,
} from './city-exports.js';
import { hash32 } from './rng.js';
import { kitIdForCityForm, WORLD_BUILD_KIT_IDS, WORLD_BUILD_KITS } from './world/catalog.js';

export const WORLD_RUN_KEY = 'district-deck:v332:world-run';
export const KIT_SEQ_CAP = 1_000_000;
export const BEAT_CAP = 1_000_000;

const KIT_ID_SET = new Set(WORLD_BUILD_KIT_IDS);
const VOUCHER_KEYS = Object.freeze(['seq', 'id', 'runId', 'beat']);

function resolveKitId(institutionId) {
  if (KIT_ID_SET.has(institutionId)) return institutionId;
  const mapped = kitIdForCityForm(institutionId);
  return KIT_ID_SET.has(mapped) ? mapped : institutionId;
}

function readStore(store, key) {
  try {
    if (store && typeof store.get === 'function') return store.get(key) ?? null;
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function isInstitutionKit(institutionId) {
  return KIT_ID_SET.has(resolveKitId(institutionId));
}

export function kitPlainName(institutionId) {
  return WORLD_BUILD_KITS[resolveKitId(institutionId)]?.label ?? institutionId;
}

export function kitMissingReason(institutionId) {
  return `The Yard has not shipped the ${kitPlainName(institutionId)} kit.`;
}

export function kitForgedReason() {
  return 'That kit record is not valid.';
}

export function kitStaleReason() {
  return 'That kit belongs to another city run.';
}

export function kitAlreadyUsedReason() {
  return 'That kit was already used.';
}

export function kitAlreadyShippedReason(institutionId) {
  return `The ${kitPlainName(institutionId)} kit is already shipped.`;
}

/** Tamper-evidence: same class as the envelope checksum. Nothing secret is seeded. */
export function deriveVoucherId(runId, institutionId, seq) {
  return hash32(`${runId}:${institutionId}:${seq}`).toString(16);
}

function requireNonNegativeInt(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
  return value;
}

function voucherRowValid(value, institutionId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== VOUCHER_KEYS.length) return false;
  for (const key of VOUCHER_KEYS) {
    if (!keys.includes(key)) return false;
  }
  if (typeof value.id !== 'string' || value.id.length === 0 || value.id.length > 200) return false;
  if (typeof value.runId !== 'string' || value.runId.length === 0 || value.runId.length > 200) {
    return false;
  }
  if (!Number.isInteger(value.beat) || value.beat < 0 || value.beat > BEAT_CAP) return false;
  if (!Number.isInteger(value.seq) || value.seq < 1 || value.seq > KIT_SEQ_CAP) return false;
  if (!KIT_ID_SET.has(institutionId)) return false;
  return value.id === deriveVoucherId(value.runId, institutionId, value.seq);
}

export function restoreBuildKits(value) {
  if (value == null) {
    throw new RangeError('ambition.buildKits must be a record.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('ambition.buildKits must be a record.');
  }
  const restored = {};
  for (const [institutionId, row] of Object.entries(value)) {
    const kitId = resolveKitId(institutionId);
    if (!KIT_ID_SET.has(kitId)) {
      throw new RangeError(`Unknown build-kit institution: ${institutionId}`);
    }
    if (!voucherRowValid(row, kitId)) {
      throw new RangeError(`ambition.buildKits.${institutionId} is not a valid voucher.`);
    }
    restored[kitId] = Object.freeze({
      seq: row.seq,
      id: row.id,
      runId: row.runId,
      beat: row.beat,
    });
  }
  return restored;
}

export function restoreKitSeq(value) {
  if (value == null) {
    throw new RangeError('ambition.kitSeq must be a record.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('ambition.kitSeq must be a record.');
  }
  const restored = {};
  for (const [institutionId, seq] of Object.entries(value)) {
    const kitId = resolveKitId(institutionId);
    if (!KIT_ID_SET.has(kitId)) {
      throw new RangeError(`Unknown kitSeq institution: ${institutionId}`);
    }
    restored[kitId] = requireNonNegativeInt(seq, `ambition.kitSeq.${institutionId}`);
    if (restored[kitId] > KIT_SEQ_CAP) {
      throw new RangeError(`ambition.kitSeq.${institutionId} exceeds the issuance cap.`);
    }
  }
  return restored;
}

export function restoreKitSeqWatermark(value) {
  if (value == null) {
    throw new RangeError('kitSeqWatermark must be a record.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('kitSeqWatermark must be a record.');
  }
  const restored = {};
  for (const [institutionId, seq] of Object.entries(value)) {
    const kitId = resolveKitId(institutionId);
    if (!KIT_ID_SET.has(kitId)) {
      throw new RangeError(`Unknown kitSeqWatermark institution: ${institutionId}`);
    }
    restored[kitId] = requireNonNegativeInt(seq, `kitSeqWatermark.${institutionId}`);
    if (restored[kitId] > KIT_SEQ_CAP) {
      throw new RangeError(`kitSeqWatermark.${institutionId} exceeds the issuance cap.`);
    }
  }
  const keys = Object.keys(restored);
  if (keys.length > WORLD_BUILD_KIT_IDS.length) {
    throw new RangeError('kitSeqWatermark has too many institutions.');
  }
  return restored;
}

export function recordKitSeqWatermark(current, institutionId, seq) {
  const kitId = resolveKitId(institutionId);
  if (!KIT_ID_SET.has(kitId)) {
    throw new RangeError(`Unknown institution: ${institutionId}`);
  }
  if (!Number.isInteger(seq) || seq < 1 || seq > KIT_SEQ_CAP) {
    throw new RangeError('consumed kit seq must be a positive integer.');
  }
  const restored = restoreKitSeqWatermark(current ?? {});
  const last = restored[kitId] ?? restored[institutionId] ?? 0;
  if (seq <= last) {
    throw new RangeError('consumed kit seq must advance the watermark.');
  }
  return { ...restored, [kitId]: seq };
}

/** Drop outstanding vouchers whose seq is already echoed as consumed. */
export function dropSpentBuildKits(buildKits, watermark = {}, runId = null) {
  const next = {};
  for (const [institutionId, row] of Object.entries(buildKits ?? {})) {
    if (!row) continue;
    if (typeof runId === 'string' && runId.length > 0 && row.runId !== runId) continue;
    if (row.seq <= (watermark?.[institutionId] ?? 0)) continue;
    next[institutionId] = row;
  }
  return next;
}

export function issueBuildKitVoucher(ambition, { runId, institutionId, beat }) {
  if (typeof runId !== 'string' || runId.length === 0) {
    throw new RangeError('A city run id is required to issue a kit voucher.');
  }
  if (!KIT_ID_SET.has(institutionId)) {
    throw new RangeError(`Unknown institution: ${institutionId}`);
  }
  if (!Number.isInteger(beat) || beat < 0 || beat > BEAT_CAP) {
    throw new RangeError('voucher beat must be a non-negative integer.');
  }
  const buildKits = restoreBuildKits(ambition?.buildKits ?? {});
  const kitSeq = restoreKitSeq(ambition?.kitSeq ?? {});
  if (buildKits[institutionId]) {
    throw new RangeError(kitAlreadyShippedReason(institutionId));
  }
  const seq = (kitSeq[institutionId] ?? 0) + 1;
  const row = Object.freeze({
    seq,
    id: deriveVoucherId(runId, institutionId, seq),
    runId,
    beat,
  });
  return {
    row,
    buildKits: { ...buildKits, [institutionId]: row },
    kitSeq: { ...kitSeq, [institutionId]: seq },
  };
}

function latestExportsPayload(store) {
  const raw = readStore(store, CITY_EXPORTS_KEY);
  if (!raw) return null;
  try {
    const queue = parseCityExportsQueue(JSON.parse(raw));
    return latestCityExportsPayload(queue);
  } catch {
    return null;
  }
}

export function readCityRunIdFromExports(store) {
  const payload = latestExportsPayload(store);
  if (typeof payload?.runId === 'string' && payload.runId.length > 0) return payload.runId;
  return null;
}

export function readCityExportsKitWatermark(store) {
  const payload = latestExportsPayload(store);
  if (!payload) return { runId: null, kitSeqWatermark: {} };
  return {
    runId: payload.runId,
    kitSeqWatermark: payload.kitSeqWatermark ?? {},
  };
}

function liveCityRunId(store) {
  const identity = readStore(store, CITY_RUN_IDENTITY_KEY);
  const exported = readCityRunIdFromExports(store);
  const identityId = typeof identity === 'string' && identity.length > 0 ? identity : null;
  const exportId = typeof exported === 'string' && exported.length > 0 ? exported : null;
  if (identityId && exportId && identityId !== exportId) {
    return { ok: false, reason: kitStaleReason(), runId: null };
  }
  return { ok: true, reason: '', runId: identityId ?? exportId };
}

function parseWorldEnvelope(raw) {
  if (raw == null || raw === '') return { status: 'missing', world: null };
  let envelope;
  try {
    envelope = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { status: 'forged', world: null };
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return { status: 'forged', world: null };
  }
  if (typeof envelope.checksum !== 'string') return { status: 'forged', world: null };
  const { checksum, ...body } = envelope;
  const canonicalise = (item) => {
    if (Array.isArray(item)) return item.map(canonicalise);
    if (item === null || typeof item !== 'object') return item;
    return Object.keys(item).sort().reduce((record, key) => {
      if (item[key] !== undefined) record[key] = canonicalise(item[key]);
      return record;
    }, {});
  };
  const canonical = JSON.stringify(canonicalise(body));
  if (checksum !== hash32(canonical).toString(16)) return { status: 'forged', world: null };
  try {
    const buildKits = restoreBuildKits(body.ambition?.buildKits ?? {});
    const kitSeq = restoreKitSeq(body.ambition?.kitSeq ?? {});
    return { status: 'ok', world: body, buildKits, kitSeq };
  } catch {
    return { status: 'forged', world: null };
  }
}

export function readBuildKitVouchers(store) {
  const raw = readStore(store, WORLD_RUN_KEY);
  const parsed = parseWorldEnvelope(raw);
  if (parsed.status === 'missing') {
    return { status: 'missing', vouchers: {}, kitSeq: {}, world: null };
  }
  if (parsed.status !== 'ok') {
    return { status: 'forged', vouchers: {}, kitSeq: {}, world: null };
  }
  return {
    status: 'ok',
    vouchers: parsed.buildKits,
    kitSeq: parsed.kitSeq,
    world: parsed.world,
  };
}

function inspectForCity(state, store) {
  const read = readBuildKitVouchers(store);
  if (read.status === 'forged') {
    return { ok: false, reason: kitForgedReason(), payload: null, runId: null };
  }
  const live = liveCityRunId(store);
  if (!live.ok) {
    return { ok: false, reason: live.reason, payload: null, runId: null };
  }
  if (read.status === 'missing' || !read.vouchers) {
    return { ok: true, reason: '', vouchers: {}, runId: live.runId };
  }
  return { ok: true, reason: '', vouchers: read.vouchers, runId: live.runId };
}

function watermarkOf(state, institutionId) {
  const mark = state?.kitSeqWatermark;
  if (!mark || typeof mark !== 'object' || Array.isArray(mark)) return 0;
  const kitId = resolveKitId(institutionId);
  const last = mark[kitId] ?? mark[institutionId];
  return Number.isInteger(last) && last >= 0 ? last : 0;
}

export function hasUnconsumedKit(institutionId, state, store) {
  const kitId = resolveKitId(institutionId);
  if (!KIT_ID_SET.has(kitId)) {
    return { ok: false, reason: kitMissingReason(kitId) };
  }
  const inspected = inspectForCity(state, store);
  if (!inspected.ok) return { ok: false, reason: inspected.reason };
  const row = inspected.vouchers?.[kitId];
  if (!row) return { ok: false, reason: kitMissingReason(kitId) };
  if (typeof inspected.runId === 'string' && inspected.runId.length > 0 && row.runId !== inspected.runId) {
    return { ok: false, reason: kitStaleReason() };
  }
  if (row.id !== deriveVoucherId(row.runId, kitId, row.seq)) {
    return { ok: false, reason: kitForgedReason() };
  }
  if (row.seq <= watermarkOf(state, kitId)) {
    return { ok: false, reason: kitAlreadyUsedReason() };
  }
  return { ok: true, reason: '', row, runId: inspected.runId, kitId };
}

export function consumeBuildKit(institutionId, state, store) {
  const kitId = resolveKitId(institutionId);
  const check = hasUnconsumedKit(kitId, state, store);
  if (!check.ok) return check;
  return {
    ok: true,
    reason: '',
    id: check.row.id,
    seq: check.row.seq,
    institutionId: kitId,
  };
}
