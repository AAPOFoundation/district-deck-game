// District Deck V3.05 B9 — transport-neutral correspondence packet strings.

import { SIM_REVISION } from './content.js';
import { hash32 } from './rng.js';
import {
  QUARTER_PROTOCOL,
  STATE_VERSION,
  applyAction,
  canonicalJson,
  committedPacketFor,
  createSeatActionEnvelope,
} from './state.js';

export const CORRESPONDENCE_PREFIX = 'DDQ1';

export const CORRESPONDENCE_IMPORT_CHECKS = Object.freeze({
  1: 'prefix',
  2: 'base64url-utf8',
  3: 'checksum',
  4: 'schema',
  5: 'protocol-version-revision',
  6: 'run-identity',
  7: 'packet-hash',
  8: 'ordinary-reducer',
  9: 'duplicate-seat',
  10: 'accepted-log',
});

const PACKET_KEYS = Object.freeze([
  'actions',
  'packetHash',
  'protocol',
  'quarter',
  'seatId',
  'seed',
  'simRevision',
  'startStateHash',
  'stateVersion',
]);

const clone = (value) => structuredClone(value);

function rejectImport(state, step, reason) {
  const validationError = {
    step,
    check: CORRESPONDENCE_IMPORT_CHECKS[step],
    reason,
  };
  return {
    state,
    events: [{ kind: 'correspondence-import-rejected', ...validationError }],
    rejected: true,
    validationError,
  };
}

function bytesToBase64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function base64urlToBytes(value) {
  if (!value || !/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) {
    throw new Error('Payload is not unpadded base64url.');
  }
  const standard = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytesToBase64url(bytes) !== value) {
    throw new Error('Payload is not canonical base64url.');
  }
  return bytes;
}

function packetBody(packet) {
  const {
    packetHash: _packetHash,
    ...body
  } = packet;
  return body;
}

function packetSchemaError(packet, rawJson) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
    return 'Packet JSON must contain one object.';
  }
  const keys = Object.keys(packet).sort();
  if (canonicalJson(keys) !== canonicalJson(PACKET_KEYS)) {
    return 'Packet fields do not match the CommittedPacket schema.';
  }
  if (!Number.isSafeInteger(packet.stateVersion)) return 'stateVersion must be an integer.';
  if (!Number.isSafeInteger(packet.simRevision)) return 'simRevision must be an integer.';
  if (!Number.isSafeInteger(packet.seed)) return 'seed must be an integer.';
  if (!Number.isSafeInteger(packet.quarter) || packet.quarter < 1) {
    return 'quarter must be a positive integer.';
  }
  if (typeof packet.protocol !== 'string') return 'protocol must be a string.';
  if (typeof packet.seatId !== 'string' || !packet.seatId) {
    return 'seatId must be a non-empty string.';
  }
  if (
    typeof packet.startStateHash !== 'string'
    || !/^[0-9a-f]+$/u.test(packet.startStateHash)
  ) return 'startStateHash must be lowercase hexadecimal.';
  if (typeof packet.packetHash !== 'string' || !/^[0-9a-f]+$/u.test(packet.packetHash)) {
    return 'packetHash must be lowercase hexadecimal.';
  }
  if (!Array.isArray(packet.actions)) return 'actions must be an array.';
  for (let index = 0; index < packet.actions.length; index += 1) {
    const action = packet.actions[index];
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      return `actions[${index}] must be an object.`;
    }
    if (typeof action.type !== 'string' || !action.type) {
      return `actions[${index}].type must be a non-empty string.`;
    }
  }
  if (canonicalJson(packet) !== rawJson) {
    return 'Packet JSON record keys are not canonical.';
  }
  return null;
}

function reducerRejectReason(result) {
  return result.events?.find(({ kind }) => kind === 'reject')?.reason
    ?? 'Ordinary reducer rejected the packet.';
}

function isDuplicateReject(reason) {
  return reason === 'That seat has already committed.';
}

/**
 * Encode one CommittedPacket as the V3.05 ASCII correspondence format.
 */
export function encodeCorrespondencePacket(packet) {
  const canonicalPacketJson = canonicalJson(packet);
  const bytes = new TextEncoder().encode(canonicalPacketJson);
  return [
    CORRESPONDENCE_PREFIX,
    bytesToBase64url(bytes),
    hash32(canonicalPacketJson).toString(16),
  ].join('.');
}

/**
 * Export only the packet already committed by a non-policy seat.
 */
export function exportCommittedPacket(state, seatId) {
  if (state.auctionSeatVersion === 2) throw new Error('Online seat-auction plans are not offline correspondence exports.');
  const accepted = state?.quarterCommit?.committedPackets?.[seatId];
  if (!accepted) throw new Error(`Seat ${seatId} has not committed this quarter.`);
  if (state.seats?.[seatId]?.kind === 'policy') {
    throw new Error('Policy packets are not correspondence exports.');
  }
  const packet = committedPacketFor(state, seatId, accepted.actions);
  if (canonicalJson(packet) !== canonicalJson(accepted)) {
    throw new Error('Committed packet no longer matches the quarter snapshot.');
  }
  return encodeCorrespondencePacket(packet);
}

/**
 * Decode and atomically import a packet through the ordinary action reducer.
 *
 * A rejected result always returns the original state reference. Successful
 * results contain only the action and commit envelopes the ordinary reducer
 * would have logged for a local human seat.
 */
export function importCorrespondencePacket(city, state, packetString, {
  seatId: expectedSeatId = null,
} = {}) {
  if (state.auctionSeatVersion === 2) return rejectImport(state, 5,
    'Online seat-auction plans must be submitted to their room server.');
  if (
    typeof packetString !== 'string'
    || packetString.split('.')[0] !== CORRESPONDENCE_PREFIX
  ) return rejectImport(state, 1, `Expected exact ${CORRESPONDENCE_PREFIX} prefix.`);

  const parts = packetString.split('.');
  if (parts.length !== 3) {
    return rejectImport(state, 2, 'Packet must contain one payload and one checksum.');
  }

  let canonicalPacketJson;
  try {
    const bytes = base64urlToBytes(parts[1]);
    canonicalPacketJson = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    return rejectImport(state, 2, error.message);
  }

  const expectedChecksum = hash32(canonicalPacketJson).toString(16);
  if (parts[2] !== expectedChecksum) {
    return rejectImport(state, 3, 'Correspondence checksum mismatch.');
  }

  let packet;
  try {
    packet = JSON.parse(canonicalPacketJson);
  } catch {
    return rejectImport(state, 4, 'Packet payload is not valid JSON.');
  }
  const schemaError = packetSchemaError(packet, canonicalPacketJson);
  if (schemaError) return rejectImport(state, 4, schemaError);

  if (packet.protocol !== QUARTER_PROTOCOL) {
    return rejectImport(state, 5, 'Quarter protocol mismatch.');
  }
  if (packet.stateVersion !== STATE_VERSION) {
    return rejectImport(state, 5, 'Quarter state version mismatch.');
  }
  if (packet.simRevision !== SIM_REVISION) {
    return rejectImport(state, 5, 'Quarter simulation revision mismatch.');
  }

  if (packet.seed !== state.seed) return rejectImport(state, 6, 'Quarter seed mismatch.');
  if (packet.quarter !== state.quarter) {
    return rejectImport(state, 6, 'Quarter number mismatch.');
  }
  if (
    !state.seats?.[packet.seatId]
    || state.seats[packet.seatId].kind === 'policy'
    || (expectedSeatId !== null && packet.seatId !== expectedSeatId)
  ) return rejectImport(state, 6, 'Quarter seat ID mismatch.');
  if (packet.startStateHash !== state.quarterCommit?.startStateHash) {
    return rejectImport(state, 6, 'Quarter start-state hash mismatch.');
  }

  const expectedPacketHash = hash32(canonicalJson(packetBody(packet))).toString(16);
  if (packet.packetHash !== expectedPacketHash) {
    return rejectImport(state, 7, 'Committed packet hash mismatch.');
  }

  const originalLogLength = state.log.length;
  const expectedEnvelopes = [];
  let cursor = state;
  try {
    for (const action of packet.actions) {
      const envelope = createSeatActionEnvelope(cursor, packet.seatId, action);
      const result = applyAction(city, cursor, envelope);
      if (result.rejected) {
        const reason = reducerRejectReason(result);
        return rejectImport(state, isDuplicateReject(reason) ? 9 : 8, reason);
      }
      expectedEnvelopes.push(envelope);
      cursor = result.state;
    }

    if (state.quarterCommit.committedPackets[packet.seatId]) {
      return rejectImport(state, 9, 'That seat has already committed.');
    }

    const commitEnvelope = createSeatActionEnvelope(cursor, packet.seatId, {
      type: 'commit-quarter',
      packetHash: packet.packetHash,
    });
    const committed = applyAction(city, cursor, commitEnvelope);
    if (committed.rejected) {
      const reason = reducerRejectReason(committed);
      return rejectImport(state, isDuplicateReject(reason) ? 9 : 8, reason);
    }
    expectedEnvelopes.push(commitEnvelope);

    const acceptedEnvelopes = committed.state.log.slice(originalLogLength)
      .filter((entry) => (
        entry?.protocol === commitEnvelope.protocol
        && entry.seed === packet.seed
        && entry.quarter === packet.quarter
        && entry.seatId === packet.seatId
      ))
      .slice(0, expectedEnvelopes.length);
    if (canonicalJson(acceptedEnvelopes) !== canonicalJson(expectedEnvelopes)) {
      return rejectImport(state, 10, 'Accepted packet envelopes were not appended to the log.');
    }

    return {
      ...committed,
      correspondence: {
        completedChecks: Object.keys(CORRESPONDENCE_IMPORT_CHECKS).map(Number),
        packet: clone(packet),
      },
    };
  } catch (error) {
    return rejectImport(state, 8, error.message);
  }
}
