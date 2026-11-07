// District Deck V3.70 L7 — the town square's mechanic: turns of the floor.
//
// WHY THIS EXISTS. r1's square was the best prose in the programme attached to nothing: no
// state, nothing to lose, nothing to win, and a critic was right to call that a failed block
// centre under §4/L5, which asks every block centre to add gameplay value stated as a
// mechanic in one sentence. Here is the sentence:
//
//   You get three turns of the floor a quarter, and spending one on a topic buys you a
//   briefing from whoever in the room actually owns that topic.
//
// So the square costs something (attention, rationed by the quarter), pays something
// (concrete reads of the run, in a named voice), and remembers (standing with each of the
// cast, and a minute book that survives the visit). It reads the run and writes nothing to
// it — the same purity contract the veggie patch and the playground hold.
//
// Pure model. No DOM, no clock, no Math.random, no network. Facts arrive as an argument.

import { hash32 } from './rng.js';
import { hasOpinion } from './townsquare-chat.js';

export const FLOOR_VERSION = 1;
/** Turns of the floor per quarter. Three is enough to choose and not enough to sweep. */
export const FLOOR_PER_QUARTER = 3;
/** Standing at which a member of the cast starts briefing you rather than performing. */
export const BRIEFING_AT = 2;
export const STANDING_CAP = 4;
const MINUTES_KEPT = 12;

export function createFloor({ seed = 0, coreId = 'core', quarter = 1 } = {}) {
  return {
    version: FLOOR_VERSION,
    seed: String(seed),
    coreId: String(coreId),
    quarter: Math.max(1, Math.round(Number(quarter) || 1)),
    spent: 0,
    standing: {},
    minutes: [],
  };
}

function cloneFloor(floor) {
  return {
    ...floor,
    standing: { ...floor.standing },
    minutes: floor.minutes.slice(-MINUTES_KEPT),
  };
}

/**
 * Open the square at the run's current quarter. The floor resets each quarter — that is the
 * ration — while standing and the minute book carry, because a room remembers who spoke.
 */
export function openQuarter(floor, quarter) {
  const target = Math.max(1, Math.round(Number(quarter) || 1));
  if (floor.quarter === target) return floor;
  const next = cloneFloor(floor);
  next.quarter = target;
  next.spent = 0;
  return next;
}

export function turnsLeft(floor) {
  return Math.max(0, FLOOR_PER_QUARTER - (floor?.spent ?? 0));
}

export function standingOf(floor, castId) {
  return Math.max(0, Math.min(STANDING_CAP, floor?.standing?.[castId] ?? 0));
}

export function standingLabel(level) {
  if (level >= 4) return 'trusted';
  if (level >= 3) return 'candid';
  if (level >= 2) return 'briefing you';
  if (level >= 1) return 'noted you';
  return 'has not placed you';
}

// --- briefings ---------------------------------------------------------------
// Every line below is derived from a fact the caller read out of the run. None of them is
// decoration: if a briefing cannot be grounded in a number the square has, it is not issued.

function money(value) {
  const n = Math.round(Number(value) || 0);
  return `$${n.toLocaleString('en-AU')}`;
}

const BRIEFERS = Object.freeze({
  vinh: (f) => (
    `You are carrying ${f.holdings} title${f.holdings === 1 ? '' : 's'} against ${money(f.cash)} in cash. `
    + `At quarter ${f.quarter} of ${f.quarterCap} that is ${f.quartersLeft} settlement${f.quartersLeft === 1 ? '' : 's'} `
    + 'of runway, and runway is the only number a lender reads twice.'
  ),
  terry: (f) => (
    `${f.seasonLabel}, and ${f.holdings === 0 ? 'you hold nothing, so every campaign out there is somebody else\'s problem' : `you hold ${f.holdings}`}. `
    + `${f.mortgaged > 0 ? `${f.mortgaged} of them carry debt, which is the number a buyer's agent smells first.` : 'Nothing of yours is mortgaged, which is rarer in this room than you would think.'}`
  ),
  wozza: (f) => (
    f.building > 0
      ? `You've got ${f.building} site${f.building === 1 ? '' : 's'} in the ground right now. Every one of them is a quarter you cannot spend twice.`
      : 'Nothing of yours is under construction. Cheapest quarter you will ever have, and the quietest.'
  ),
  saskia: (f) => (
    f.grade
      ? `Your grade reads ${f.grade}. That is a judgement about the portfolio, not about the buildings, and the two come apart more often than anyone admits.`
      : 'No grade on the board yet. Nothing has been judged, which is not the same as nothing being wrong.'
  ),
  petridis: (f) => (
    `There are ${f.parcels} parcels on this board and ${f.districts} districts to put them in. `
    + `You are in ${f.districtsHeld} of them. Concentration is a decision even when nobody makes it.`
  ),
});

/**
 * The briefing a member of the cast gives at standing `BRIEFING_AT` or better. Deterministic:
 * the same facts, cast and day produce the same sentence.
 */
export function briefingFrom(castId, facts) {
  const make = BRIEFERS[castId];
  if (!make) return null;
  return make(facts);
}

export function canBrief(castId) {
  return Boolean(BRIEFERS[castId]);
}

/**
 * Put something to the square.
 *
 * Costs one turn of the floor. Standing goes up with everyone who has a view on the topic —
 * a rates question is heard by the broker, not by the builder — and anyone who crosses
 * `BRIEFING_AT` hands over a briefing on the spot.
 */
export function raise(floor, { tags = [], headline = '', dayKey = '', facts = null } = {}) {
  if (turnsLeft(floor) <= 0) {
    return {
      floor,
      ok: false,
      reason: 'The floor has moved on. Three turns a quarter, and this quarter is spent.',
      gained: [],
      briefings: [],
    };
  }
  const topic = tags?.[0] ?? null;
  const heard = ['terry', 'wozza', 'saskia', 'vinh', 'petridis']
    .filter((castId) => (topic ? hasOpinion(castId, topic) : false));
  const next = cloneFloor(floor);
  next.spent += 1;
  const briefings = [];
  for (const castId of heard) {
    const before = standingOf(next, castId);
    const after = Math.min(STANDING_CAP, before + 1);
    next.standing[castId] = after;
    if (before < BRIEFING_AT && after >= BRIEFING_AT && facts && canBrief(castId)) {
      briefings.push({ castId, text: briefingFrom(castId, facts) });
    }
  }
  // Deterministic order when two cross at once: the room does not shuffle itself.
  briefings.sort((a, b) => hash32(`${dayKey}:${a.castId}`) - hash32(`${dayKey}:${b.castId}`));
  const line = headline ? String(headline).slice(0, 120) : (topic ?? 'general business');
  next.minutes = [...next.minutes.slice(-(MINUTES_KEPT - 1)), `Q${next.quarter}: ${line}`];
  return { floor: next, ok: true, reason: '', gained: heard, briefings };
}

// --- persistence -------------------------------------------------------------
// Browser-local, like the patch and the design. Nothing here is a simulated quantity.

export function floorKey(seed, coreId) {
  return `dd:square:${seed}:${coreId}`;
}

export function serialiseFloor(floor) {
  return JSON.stringify({ ...floor, minutes: floor.minutes.slice(-MINUTES_KEPT) });
}

/**
 * Read a stored floor, clamping every value on the way in.
 *
 * The lesson the reducer's trust boundary taught this lane: a record that arrives from
 * `localStorage` is untrusted input, not a saved object. `spent`, `standing` and `quarter`
 * are all clamped here so a hand-edited file cannot mint turns of the floor or standing it
 * never earned.
 */
export function parseFloor(text, fallback) {
  try {
    const raw = JSON.parse(String(text));
    if (!raw || raw.version !== FLOOR_VERSION) return fallback;
    const standing = {};
    for (const [castId, value] of Object.entries(raw.standing ?? {})) {
      if (typeof castId !== 'string' || castId.length > 24) continue;
      const level = Math.round(Number(value) || 0);
      if (level > 0) standing[castId] = Math.min(STANDING_CAP, level);
    }
    return {
      ...createFloor({ seed: raw.seed, coreId: raw.coreId, quarter: raw.quarter }),
      spent: Math.max(0, Math.min(FLOOR_PER_QUARTER, Math.round(Number(raw.spent) || 0))),
      standing,
      minutes: (Array.isArray(raw.minutes) ? raw.minutes : [])
        .filter((line) => typeof line === 'string')
        .map((line) => line.slice(0, 140))
        .slice(-MINUTES_KEPT),
    };
  } catch {
    return fallback;
  }
}
