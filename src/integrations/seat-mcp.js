// District Deck V3.05 B9 — local remote-seat contract.

import { SIM_REVISION } from '../core/content.js';
import {
  STATE_VERSION,
  canApplyAction,
  canonicalJson,
  committedPacketFor,
  createSeatActionEnvelope,
  privateSeatState,
  publicSeatState,
} from '../core/state.js';
import {
  encodeCorrespondencePacket,
  importCorrespondencePacket,
} from '../core/correspondence.js';

export const SEAT_STATE_PROTOCOL = 'district-deck-seat-state';

/**
 * @typedef {Object} LegalActionDescriptor
 * @property {Object} action
 * @property {boolean} legal
 * @property {string} reason
 */

/**
 * @typedef {Object} SeatStateResponse
 * @property {'district-deck-seat-state'} protocol
 * @property {5} stateVersion
 * @property {15} simRevision
 * @property {number} seed
 * @property {number} quarter
 * @property {string} seatId
 * @property {string} startStateHash
 * @property {Object} publicState
 * @property {Object} privateIntel
 * @property {LegalActionDescriptor[]} legalActions
 * @property {boolean} committed
 */

/**
 * Pure binding data for the B9 contract functions.
 *
 * @typedef {Object} DistrictDeckSeatMcp
 * @property {Object} city
 * @property {Object} state
 * @property {string} seatId
 * @property {Object[]} [legalActionCandidates]
 * @property {string|null} [lastStateHash]
 */

function canonicalClone(value) {
  return JSON.parse(canonicalJson(value));
}

function assertRemoteBinding(binding) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    throw new TypeError('A seat contract binding is required.');
  }
  const seat = binding.state?.seats?.[binding.seatId];
  if (!seat) throw new RangeError(`Unknown seat: ${binding.seatId}`);
  if (seat.kind !== 'remote') {
    throw new RangeError(`Seat ${binding.seatId} is not a remote seat.`);
  }
}

function contractReject(state, step, check, reason) {
  const validationError = { step, check, reason };
  return {
    state,
    events: [{ kind: 'seat-contract-rejected', ...validationError }],
    rejected: true,
    validationError,
  };
}

/**
 * Run candidate actions through the same read-only reducer probe used by UI.
 */
export function legalActionDescriptors(city, state, seatId, candidates = []) {
  if (!Array.isArray(candidates)) throw new TypeError('Action candidates must be an array.');
  return canonicalClone(candidates.map((candidate) => {
    const action = candidate?.action ?? candidate;
    const check = canApplyAction(
      city,
      state,
      createSeatActionEnvelope(state, seatId, action),
    );
    return {
      action: structuredClone(action),
      legal: check.ok,
      reason: check.reason,
    };
  }));
}

/**
 * Pure implementation of DistrictDeckSeatMcp.get_state.
 *
 * @param {DistrictDeckSeatMcp} binding
 * @param {number} seed
 * @param {number} quarter
 * @returns {SeatStateResponse}
 */
export function get_state(binding, seed, quarter) {
  assertRemoteBinding(binding);
  const { city, state, seatId } = binding;
  if (seed !== state.seed) throw new RangeError('Seat-state seed mismatch.');
  if (quarter !== state.quarter) throw new RangeError('Seat-state quarter mismatch.');

  const selectedPrivate = privateSeatState(state, seatId);
  return canonicalClone({
    protocol: SEAT_STATE_PROTOCOL,
    stateVersion: STATE_VERSION,
    simRevision: SIM_REVISION,
    seed: state.seed,
    quarter: state.quarter,
    seatId,
    startStateHash: state.quarterCommit.startStateHash,
    publicState: publicSeatState(city, state),
    privateIntel: {
      seatId,
      intelByParcel: selectedPrivate.private.intelByParcel,
      accessTokens: selectedPrivate.private.accessTokens,
    },
    legalActions: legalActionDescriptors(
      city,
      state,
      seatId,
      binding.legalActionCandidates ?? [],
    ),
    committed: Boolean(state.quarterCommit.committedPackets[seatId]),
  });
}

/**
 * Pure implementation of DistrictDeckSeatMcp.submit_actions.
 *
 * The caller copies get_state(...).startStateHash into a new binding's
 * lastStateHash. The returned state becomes the caller's next binding state.
 *
 * @param {DistrictDeckSeatMcp} binding
 * @param {Object[]} actions
 */
export function submit_actions(binding, actions) {
  assertRemoteBinding(binding);
  const {
    city,
    state,
    seatId,
    lastStateHash = null,
  } = binding;
  if (
    typeof lastStateHash !== 'string'
    || lastStateHash !== state.quarterCommit.startStateHash
  ) {
    return contractReject(
      state,
      6,
      'run-identity',
      'submit_actions requires the current startStateHash from get_state.',
    );
  }

  let packet;
  try {
    packet = committedPacketFor(state, seatId, actions);
  } catch (error) {
    return contractReject(state, 4, 'schema', error.message);
  }
  return importCorrespondencePacket(
    city,
    state,
    encodeCorrespondencePacket(packet),
    { seatId },
  );
}
