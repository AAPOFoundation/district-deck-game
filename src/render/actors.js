// District Deck V3.10 W2-CROWD — actor silhouette contract (presentation only).
// Party Animals rule from V3.10 §10: big head, soft rounded limbs, thick readable
// outline at board zoom. Geometry lives in people.js (instanced primitives); this
// module holds the shared proportions so future skeletal cycles share one source.

export const PARTY_ANIMALS = Object.freeze({
  // R12 quality-loop: board-token scale (Monopoly Plus) — hardhat/badge readable at mid zoom.
  headRadius: 0.42,
  bodyRadius: 0.4,
  bodyLength: 1.12,
  limbRadius: 0.135,
  limbLength: 0.78,
  armRadius: 0.115,
  armLength: 0.58,
  contactRadius: 0.72,
  walkBobMetres: 0.05,
});

/** Cast roles (colour/accessory identity). All humans share one body scale in people.js. */
export const BODY_ARCHETYPES = Object.freeze([
  'property-agent',
  'cheap-builder',
  'architect',
  'mortgage-broker',
  'rival-developer',
  'arsonist',
  'squatter',
  'policeman',
  'family',
  'dog',
  'avatar',
]);

export default {
  PARTY_ANIMALS,
  BODY_ARCHETYPES,
};
