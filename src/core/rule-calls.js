import { RULES } from './content.js';
import { applyBp } from './rng.js';

// Owner decisions are build settings, not persisted rules or run state.
// Each default can be reverted independently by changing its one line.
export const RULE_CALLS = Object.freeze({
  overdraftFloor: 'clamp-zero', // Alternative: 'legacy'.
  worksValue: 'incoming-60', // Alternative: 'pad-floor'.
  operatorRoster: 'live-only', // Alternative: 'all'.
  landingTagline: 'rule', // Alternative: 'district'.
});

const SETTINGS = Object.freeze({
  overdraftFloor: ['clamp-zero', 'legacy'],
  worksValue: ['incoming-60', 'pad-floor'],
  operatorRoster: ['live-only', 'all'],
  landingTagline: ['rule', 'district'],
});
let activeCalls = RULE_CALLS;

export function ruleCall(key) {
  if (!Object.hasOwn(RULE_CALLS, key)) throw new RangeError(`Unknown rule call: ${key}`);
  return activeCalls[key];
}

/** Synchronous test scope only; nested scopes restore their caller's settings. */
export function withRuleCalls(overrides, fn) {
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(SETTINGS, key) || !SETTINGS[key].includes(value)) {
      throw new RangeError(`Unsupported rule call: ${key}=${value}`);
    }
  }
  const previous = activeCalls;
  activeCalls = Object.freeze({ ...previous, ...overrides });
  try {
    return fn();
  } finally {
    activeCalls = previous;
  }
}

/** A negative opening NAV cannot require a positive cash balance. */
export function floorFromOpeningNav(openingNav, limitBp, setting = ruleCall('overdraftFloor')) {
  const legacy = -applyBp(openingNav, limitBp);
  return setting === 'clamp-zero' ? Math.min(0, legacy) : legacy;
}

/** Inputs share the same valuation stage, before common downstream premiums. */
export function worksStandingValue({ worksValue, padValue }, setting = ruleCall('worksValue')) {
  return setting === 'pad-floor' ? Math.max(worksValue, padValue) : worksValue;
}

/** Keep every operator visible; only live abilities make a new run selectable. */
export function operatorChoices(operators, setting = ruleCall('operatorRoster')) {
  return operators.map(({ id, name, attributes }) => ({
    id,
    name,
    selectable: setting === 'all' || attributes.some(attribute => attribute.status === 'live'),
  }));
}

export const LANDING_TAGLINES = Object.freeze({
  // COPY-DRAFT: direct statement of the win rule.
  rule: `Finish quarter ${RULES.quarters} with a higher NAV than Roman Petridis.`,
  // COPY-DRAFT: district-led alternative with the same goal and deadline.
  district: `Build the district, then finish quarter ${RULES.quarters} worth more than Roman Petridis.`,
});

export function landingTagline(setting = ruleCall('landingTagline')) {
  return LANDING_TAGLINES[setting];
}
