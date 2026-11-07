// Financial receipts belong to the durable room envelope, never to replay state.
// Only these scalar totals may cross the authenticated seat's history boundary.
import { cybercabForOwner } from '../core/cybercab.js';

const VERSION = 1;
const MONEY = ['rent', 'opex', 'interest', 'overdraft', 'net', 'cashBefore', 'cashAfter', 'navAfter'];
const CAB_MONEY = ['fares', 'costs', 'servicePaid', 'capitalPaid', 'net', 'cashMovement'];
const ROW_KEYS = ['version', 'seatId', 'quarter', 'resolutionRevision', ...MONEY, 'cybercab'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = Number.isSafeInteger;
const seatsFor = state => Object.keys(state.seats).filter(id => state.seats[id].kind !== 'policy').sort();
function check(ok, message) { if (!ok) throw new Error(`Room receipts: ${message}`); }
function keys(value, expected) {
  return record(value) && Object.keys(value).length === expected.length
    && expected.every(key => Object.hasOwn(value, key));
}
function sealedRows(state) {
  // Contest/underfunding records in the same ledger are not quarter settlements.
  return state.ledger.filter(row => integer(row.quarter) && integer(row.navAfter)
    && integer(row.net) && integer(row.rent));
}
function completedQuarter(state) { return sealedRows(state).at(-1)?.quarter ?? 0; }
function accounting(state, seatId, quarter) {
  const matches = sealedRows(state).filter(row => row.quarter === quarter);
  check(matches.length === 1, 'one sealed quarter is required');
  const row = matches[0], primary = seatId === 'P1';
  check(primary || seatId === 'P2', 'unsupported financial seat');
  return Object.fromEntries(['rent', 'opex', 'interest', 'overdraft', 'net', 'navAfter'].map(key =>
    [key, row[primary ? key : `rival${key[0].toUpperCase()}${key.slice(1)}`]]));
}
function cabSummary(state, seatId, quarter) {
  const matches = (cybercabForOwner(state, seatId)?.weeklyChart ?? []).filter(row => row.quarter === quarter);
  check(matches.length <= 1, 'duplicate business quarter');
  const row = matches[0];
  if (!row || row.economyVersion !== 2) return null;
  const summary = Object.fromEntries(CAB_MONEY.map(key => [key, row[key]]));
  check(CAB_MONEY.every(key => integer(summary[key])), 'unavailable business totals');
  return summary;
}
function validateRow(row, seatId, maxQuarter, maxRevision) {
  check(keys(row, ROW_KEYS) && row.version === VERSION && row.seatId === seatId,
    'invalid receipt fields or seat');
  check(integer(row.quarter) && row.quarter >= 1 && row.quarter <= maxQuarter
    && integer(row.resolutionRevision) && row.resolutionRevision >= 1
    && row.resolutionRevision <= maxRevision, 'invalid receipt quarter or revision');
  check(MONEY.every(key => integer(row[key])), 'unavailable financial totals');
  check(row.cybercab === null || (keys(row.cybercab, CAB_MONEY)
    && CAB_MONEY.every(key => integer(row.cybercab[key]))), 'invalid business summary');
}
function receipt(state, seatId, quarter, resolution) {
  const row = { version: VERSION, seatId, quarter, resolutionRevision: resolution.revision,
    ...accounting(state, seatId, quarter), cashBefore: resolution.cashBefore[seatId],
    cashAfter: resolution.cashAfter[seatId], cybercab: cabSummary(state, seatId, quarter) };
  validateRow(row, seatId, state.quarters, resolution.revision);
  return row;
}

export function newRoomReceiptHistory(state) {
  return { version: VERSION, recordedFromQuarter: 1,
    bySeat: Object.fromEntries(seatsFor(state).map(id => [id, []])) };
}

/** Format 1 retained only the latest cash transition. Never infer older closing cash. */
export function migrateRoomReceiptHistory(room) {
  const history = newRoomReceiptHistory(room.state), quarter = completedQuarter(room.state);
  if (!quarter) return history;
  history.recordedFromQuarter = quarter + 1;
  const resolution = room.lastResolution;
  if (!resolution || resolution.fromQuarter !== quarter || resolution.toQuarter !== room.state.quarter
    || !integer(resolution.revision) || resolution.revision > room.revision) return history;
  // Both seats get the same availability boundary; unsupported legacy data stays unavailable.
  try {
    const rows = seatsFor(room.state).map(id => [id, [receipt(room.state, id, quarter, resolution)]]);
    history.bySeat = Object.fromEntries(rows);
    history.recordedFromQuarter = quarter;
  } catch { /* No complete latest financial receipt can be established. */ }
  return history;
}

export function validateRoomReceiptHistory(history, state, revision) {
  const seats = seatsFor(state), lastQuarter = completedQuarter(state);
  check(keys(history, ['version', 'recordedFromQuarter', 'bySeat']) && history.version === VERSION
    && keys(history.bySeat, seats), 'invalid history envelope');
  check(integer(history.recordedFromQuarter) && history.recordedFromQuarter >= 1
    && history.recordedFromQuarter <= lastQuarter + 1 && lastQuarter <= state.quarters,
  'invalid history availability');
  for (const seatId of seats) {
    const rows = history.bySeat[seatId];
    check(Array.isArray(rows) && rows.length <= state.quarters
      && rows.length === lastQuarter - history.recordedFromQuarter + 1, 'missing or excess receipts');
    let previousRevision = 0;
    for (const [index, row] of rows.entries()) {
      validateRow(row, seatId, state.quarters, revision);
      check(row.quarter === history.recordedFromQuarter + index
        && row.resolutionRevision > previousRevision, 'duplicate or unordered receipts');
      const totals = accounting(state, seatId, row.quarter);
      check(Object.keys(totals).every(key => row[key] === totals[key]), 'sealed accounting mismatch');
      const cab = cabSummary(state, seatId, row.quarter);
      check(cab === null ? row.cybercab === null : row.cybercab !== null
        && CAB_MONEY.every(key => row.cybercab[key] === cab[key]), 'sealed business mismatch');
      previousRevision = row.resolutionRevision;
    }
  }
  return history;
}

/** Called once for the reducer's actual settle event, before the same atomic room write. */
export function appendRoomReceipts(history, state, resolution, quarter) {
  check(quarter === resolution.fromQuarter && quarter === completedQuarter(state), 'settlement identity mismatch');
  const next = structuredClone(history);
  for (const seatId of seatsFor(state)) next.bySeat[seatId].push(receipt(state, seatId, quarter, resolution));
  return validateRoomReceiptHistory(next, state, resolution.revision);
}

/** The server chooses seatId from authentication. No other seat's array leaves here. */
export function roomReceiptsForSeat(history, seatId) {
  check(Object.hasOwn(history.bySeat, seatId), 'history seat is unavailable');
  return { version: VERSION, seatId, recordedFromQuarter: history.recordedFromQuarter,
    receipts: history.bySeat[seatId].map(row => {
      validateRow(row, seatId, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
      return structuredClone(row);
    }) };
}

/** Fail closed if a caller tries to join another seat, private fields, or unbounded rows. */
export function validateOwnRoomReceipts(history, seatId, maxQuarter) {
  check(keys(history, ['version', 'seatId', 'recordedFromQuarter', 'receipts'])
    && history.version === VERSION && history.seatId === seatId
    && integer(history.recordedFromQuarter) && history.recordedFromQuarter >= 1
    && history.recordedFromQuarter <= maxQuarter + 1
    && Array.isArray(history.receipts) && history.receipts.length <= maxQuarter,
  'invalid own history');
  let revision = 0;
  for (const [index, row] of history.receipts.entries()) {
    validateRow(row, seatId, maxQuarter, Number.MAX_SAFE_INTEGER);
    check(row.quarter === history.recordedFromQuarter + index && row.resolutionRevision > revision,
      'invalid own history order');
    revision = row.resolutionRevision;
  }
  return history;
}
