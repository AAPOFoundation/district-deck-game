// District Deck V3.03 — deterministic cast, avatar and human-demand core.
// Every cast row is data. Generic registries interpret authored predicate,
// destination, interaction and despawn rule ids; reducers never switch on archetypes.
//
// Player-facing roles (UI labels live in src/ui/card.js PERSON_LABELS):
//   cheap-builder     → Builder (meet once, then up to 3 free cost briefs)
//   architect         → Design consultant (meet once, then up to 3 free quality/succession briefs)
//   property-agent    → Sales consultant (meet once, then up to 3 sale-price briefs)
//   mortgage-broker   → Finance consultant (meet once, then accept LVR or interest for no action)
//   rival-developer   → AI rival figure (meet once, then open/take the named parcel for no action)
// The automated opponent is the policy rival (RIVAL_POLICIES / AI developer rail), not a hire.

import { ARCHETYPES, RULES } from './content.js';
import { debtStressBp, marketValue, ownerOf } from './economy.js';
import {
  activeCoreWalkGraph, activeParcel, activeOrder, activeWalkAnchorsFor,
} from './city.js';
import { globalTile, parseParcelId } from './grid.js';
import { resolvePairSynergies } from './landuse.js';
import { applyBp, stream } from './rng.js';
import { eraBand, nextArchetypeId } from './succession.js';
import { identityFor, nextIdentityId } from './people-identities.js';

export const PEOPLE_ARCHETYPE_IDS = Object.freeze([
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
]);

/** R18: denser cast — more AI rivals, consultants and builders on the board. */
export const PEOPLE_CAP = 28;

/** After one paid Meet, a professional can take this many free hire briefs. */
export const PROFESSIONAL_PROJECT_CAP = 3;

export function professionalProjectsUsed(person) {
  if (person?.pendingOutcome?.kind !== 'hire') return 0;
  return Math.max(0, person.pendingOutcome.projectsEngaged ?? 0);
}

export function professionalProjectsRemaining(person) {
  return Math.max(0, PROFESSIONAL_PROJECT_CAP - professionalProjectsUsed(person));
}

function stampFreeAcquire(avatar, parcelId, quarter) {
  if (!avatar || !parcelId || !Number.isInteger(quarter)) return;
  if (!avatar.followUpTokens) avatar.followUpTokens = { acquireParcels: {} };
  if (!avatar.followUpTokens.acquireParcels) avatar.followUpTokens.acquireParcels = {};
  const current = avatar.followUpTokens.acquireParcels[parcelId] ?? 0;
  avatar.followUpTokens.acquireParcels[parcelId] = Math.max(current, quarter);
}

export const ANCHOR_KINDS = Object.freeze([
  'parcel',
  'civic',
  'reserve',
  'core',
  'person',
  'avatar',
]);

const FAMILY_POSITIVE_IDS = Object.freeze([
  'school-primary', 'childcare-centre', 'pocket-park', 'playground',
  'community-garden', 'reserve',
]);
const FAMILY_NEGATIVE_IDS = Object.freeze([
  'factory-light', 'remand-centre', 'sewerage-plant',
]);
export const AVATAR_VENUE_SPENDS = Object.freeze({
  cafe: Object.freeze({
    useId: 'cafe-corner',
    costRule: 'coffeeCost',
    token: 'brokerTermsUntilQuarter',
    duration: 1,
  }),
  food: Object.freeze({
    useId: 'supermarket-strip',
    costRule: 'foodCost',
    token: 'peopleDemandUntilQuarter',
    duration: 2,
  }),
  outfitter: Object.freeze({
    useId: 'shop-corner',
    costRule: 'clothesCost',
    token: 'askingBandUntilQuarter',
    duration: 2,
  }),
  notice: Object.freeze({
    useId: 'town-hall-melbourne',
    costRule: 'techCost',
    token: 'eventForecastUntilQuarter',
    duration: null,
  }),
});
const AVATAR_VENUE_BY_USE = Object.freeze(Object.fromEntries(
  Object.entries(AVATAR_VENUE_SPENDS).map(([venueClass, rule]) => [
    rule.useId,
    Object.freeze({ venueClass, ...rule }),
  ]),
));

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  for (const key of Object.keys(value).sort()) deepFreeze(value[key]);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function definition({
  id,
  priority,
  predicate,
  chance,
  destination,
  interaction,
  persistence,
  despawn,
}) {
  return deepFreeze({
    id,
    priority,
    spawn: { predicate, chance },
    destination,
    interaction,
    persistence,
    despawn,
  });
}

/**
 * The ten §3.4 rows under one schema. Numbers, rule ids and operation ids live here;
 * generic registries below interpret them.
 */
export const PERSON_ARCHETYPES = Object.freeze([
  definition({
    id: 'property-agent',
    priority: 2,
    predicate: { rule: 'metric-at-least', metric: 'unownedCount', value: 2 },
    chance: {
      base: 4200,
      terms: [
        { metric: 'maxBlockHumanDensity', multiplier: 140 },
        { metric: 'activeAuctionCount', multiplier: 900 },
      ],
      max: 9200,
      synergyMeasure: 'agentSpawnChance',
    },
    destination: { rule: 'agent-opportunity' },
    interaction: { operation: 'hire-candidate', profession: 'property-agent' },
    persistence: 4,
    despawn: { rule: 'hire-consumed-or-expired' },
  }),
  definition({
    id: 'cheap-builder',
    priority: 3,
    predicate: { rule: 'always' },
    chance: {
      base: 3600,
      terms: [{ metric: 'activeWorks', multiplier: 700 }],
      max: 8800,
      synergyMeasure: 'cheapBuilderSpawnChance',
    },
    destination: { rule: 'owned-works' },
    interaction: { operation: 'hire-candidate', profession: 'cheap-builder' },
    persistence: 5,
    despawn: { rule: 'hire-consumed-or-expired' },
  }),
  definition({
    id: 'architect',
    priority: 3,
    predicate: { rule: 'always' },
    chance: {
      base: 3200,
      terms: [{ metric: 'architectEligibleCount', multiplier: 450 }],
      max: 8200,
    },
    destination: { rule: 'architect-value' },
    interaction: { operation: 'hire-candidate', profession: 'architect' },
    persistence: 5,
    despawn: { rule: 'hire-consumed-or-expired' },
  }),
  definition({
    id: 'mortgage-broker',
    priority: 2,
    predicate: { rule: 'broker-eligible' },
    chance: {
      base: 3400,
      terms: [{ metric: 'brokerStressExcess', divisor: 1.5 }],
      max: 8600,
      synergyMeasure: 'brokerSpawnChance',
    },
    destination: { rule: 'broker-meeting' },
    interaction: { operation: 'broker-offer' },
    persistence: 4,
    despawn: { rule: 'broker-accepted' },
  }),
  definition({
    id: 'rival-developer',
    priority: 0,
    predicate: { rule: 'phase-play' },
    chance: { guaranteed: true },
    destination: { rule: 'rival-plan' },
    interaction: { operation: 'rival-disclosure' },
    persistence: 8,
    despawn: { rule: 'phase-result' },
  }),
  definition({
    id: 'arsonist',
    priority: 7,
    predicate: { rule: 'metric-at-least', metric: 'vulnerableCount', value: 1 },
    chance: {
      base: 150,
      terms: [{ metric: 'vulnerableCount', multiplier: 90 }],
      max: 1800,
      postMultiplierMetric: 'policeIncidenceMultiplier',
    },
    destination: { rule: 'fire-risk' },
    interaction: { operation: 'pending-fire' },
    persistence: 1,
    despawn: { rule: 'outcome-resolved-or-expired' },
  }),
  definition({
    id: 'squatter',
    priority: 7,
    predicate: { rule: 'metric-at-least', metric: 'squatterEligibleCount', value: 1 },
    chance: {
      base: 400,
      terms: [{ metric: 'squatterEligibleCount', multiplier: 120 }],
      max: 2400,
      postMultiplierMetric: 'policeIncidenceMultiplier',
    },
    destination: { rule: 'vacant-stock' },
    interaction: { operation: 'pending-occupation' },
    persistence: 2,
    despawn: { rule: 'outcome-resolved-or-expired' },
  }),
  definition({
    id: 'policeman',
    priority: 1,
    predicate: { rule: 'metric-at-least', metric: 'policeBuildingCount', value: 1 },
    chance: {
      conditional: {
        metric: 'existingPolicemanCount',
        truthy: 1800,
        falsy: 7000,
      },
    },
    destination: { rule: 'police-risk' },
    interaction: { operation: 'patrol-intel' },
    persistence: 4,
    despawn: { rule: 'expiry-only' },
  }),
  definition({
    id: 'family',
    priority: 5,
    predicate: { rule: 'family-eligible' },
    chance: {
      base: 5200,
      terms: [
        { metric: 'familyPositiveEmitterCount', multiplier: 100 },
        { metric: 'familyNegativeEmitterCount', multiplier: -150 },
      ],
      min: 1000,
      max: 8500,
      synergyMeasure: 'familySpawnChance',
    },
    destination: { rule: 'family-utility' },
    interaction: { operation: 'family-signal' },
    persistence: 4,
    despawn: { rule: 'family-utility-low' },
  }),
  definition({
    id: 'dog',
    priority: 8,
    predicate: { rule: 'always' },
    chance: {
      conditional: {
        metric: 'existingDogCount',
        truthy: 1200,
        falsy: 6000,
      },
    },
    destination: { rule: 'dog-find' },
    interaction: { operation: 'dog-find-pending' },
    persistence: 5,
    despawn: { rule: 'dog-found-or-expired' },
  }),
]);

export const PERSON_ARCHETYPE_BY_ID = Object.freeze(Object.fromEntries(
  PERSON_ARCHETYPES.map((entry) => [entry.id, entry]),
));

export function anchorKey(anchor) {
  return `${anchor.kind}:${anchor.id}`;
}

function anchor(kind, id) {
  if (!ANCHOR_KINDS.includes(kind)) throw new Error(`unknown anchor kind ${kind}`);
  return Object.freeze({ kind, id });
}

function sameAnchor(left, right) {
  return Boolean(left && right && left.kind === right.kind && left.id === right.id);
}

function assertAnchor(value, field) {
  if (
    !value
    || !ANCHOR_KINDS.includes(value.kind)
    || typeof value.id !== 'string'
  ) throw new TypeError(`${field} must be an Anchor`);
}

export function assertPerson(person) {
  for (const field of ['id', 'archetypeId', 'intent']) {
    if (typeof person[field] !== 'string') throw new TypeError(`Person.${field} must be a string`);
  }
  if (!PERSON_ARCHETYPE_BY_ID[person.archetypeId]) {
    throw new TypeError(`unknown Person.archetypeId ${person.archetypeId}`);
  }
  for (const field of ['spawnedQuarter', 'despawnAfterQuarter', 'priority']) {
    if (!Number.isInteger(person[field])) throw new TypeError(`Person.${field} must be an integer`);
  }
  assertAnchor(person.fromAnchor, 'Person.fromAnchor');
  assertAnchor(person.toAnchor, 'Person.toAnchor');
  if (person.interactionTarget !== null) {
    assertAnchor(person.interactionTarget, 'Person.interactionTarget');
  }
  if (person.pendingOutcome !== null && typeof person.pendingOutcome !== 'object') {
    throw new TypeError('Person.pendingOutcome must be an object or null');
  }
  if (person.identityId != null && !Number.isInteger(person.identityId)) {
    throw new TypeError('Person.identityId must be an integer when set');
  }
  return person;
}

export function walkAnchorsFor(city, state = null) {
  if (city.walkAnchors) return activeWalkAnchorsFor(city, state);
  const anchors = [
    ...[...activeOrder(city, state)].sort().map((id) => anchor('parcel', id)),
    ...[...city.civicUses].sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id }) => anchor('civic', id)),
    ...(city.reserve ? [anchor('reserve', city.reserve.id)] : []),
    ...[...city.blockCores].sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id }) => anchor('core', id)),
    ...[...city.rightsOfWay].sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id }) => anchor('core', `${id}:mouth`)),
  ];
  anchors.sort((left, right) => anchorKey(left).localeCompare(anchorKey(right)));
  return Object.freeze(anchors);
}

export function peopleStream(seed, suffix) {
  return stream(seed, `people:${suffix}`);
}

export function avatarSetupStream(seed, avatarId) {
  return peopleStream(seed, `avatar:${avatarId}:setup`);
}

export function personQuarterStream(seed, quarter, personId) {
  return peopleStream(seed, `q${quarter}:person:${personId}`);
}

export function spawnQuarterStream(seed, quarter, archetypeId) {
  return peopleStream(seed, `q${quarter}:spawn:${archetypeId}`);
}

export function worksQualityStream(seed, quarter, parcelId, actionOrdinal, seatId = null) {
  return peopleStream(seed, seatId
    ? `q${quarter}:seat:${seatId}:works:${parcelId}:${actionOrdinal}`
    : `q${quarter}:works:${parcelId}:${actionOrdinal}`);
}

export function worksQualityRoll(seed, quarter, parcelId, actionOrdinal, seatId = null) {
  return worksQualityStream(seed, quarter, parcelId, actionOrdinal, seatId).int(0, 9999);
}

export function dogFindStream(seed, quarter, personId) {
  return peopleStream(seed, `q${quarter}:dog:${personId}`);
}

export function emptyPeople() {
  return deepFreeze({ order: [], byId: {} });
}

export function freezePeople(people) {
  const order = [...people.order].sort();
  const byId = {};
  for (const id of order) {
    if (!people.byId[id]) throw new Error(`people.order names missing person ${id}`);
    byId[id] = deepFreeze({ ...assertPerson(people.byId[id]) });
  }
  return deepFreeze({ order, byId });
}

export function createAvatar(city, seed, avatarId, startingNav = RULES.startingCash) {
  const anchors = walkAnchorsFor(city);
  if (!anchors.length) throw new Error('cannot place an avatar in a city without walk anchors');
  const selected = avatarSetupStream(seed, avatarId).pick(anchors);
  return {
    id: avatarId,
    fromAnchor: { ...selected },
    destination: { ...selected },
    movedQuarter: 0,
    accessTokens: {
      brokerTermsUntilQuarter: 0,
      askingBandUntilQuarter: 0,
      eventForecastUntilQuarter: 0,
      peopleDemandUntilQuarter: 0,
    },
    brokerOffer: null,
    followUpTokens: { acquireParcels: {} },
    // Per-avatar meeting receipts survive movement and quarter changes. The card reads
    // the event/outcome captured here instead of inferring a meeting from current position.
    meetResults: {},
    startingNav,
    spendingTotal: 0,
  };
}

export function createAvatars(
  city,
  seed,
  avatarIds = ['player'],
  startingNav = RULES.startingCash,
) {
  const avatars = {};
  for (const avatarId of [...avatarIds].sort()) {
    avatars[avatarId] = createAvatar(city, seed, avatarId, startingNav);
  }
  return avatars;
}

export function createPeopleInputSnapshot(state) {
  return deepFreeze(structuredClone(state));
}

function civicAndCoreBuildings(city) {
  const buildings = [];
  for (const civic of [...city.civicUses].sort((a, b) => a.id.localeCompare(b.id))) {
    buildings.push({
      key: civic.id,
      id: civic.id,
      kind: 'building',
      typeId: civic.useId,
      anchor: anchor('civic', civic.id),
      tiles: [...civic.tiles].sort(),
      bx: civic.bx,
      bz: civic.bz,
    });
  }
  for (const core of [...city.blockCores].sort((a, b) => a.id.localeCompare(b.id))) {
    buildings.push({
      key: core.id,
      id: core.id,
      kind: 'building',
      typeId: core.useId,
      anchor: anchor('core', core.id),
      tiles: [`p${core.bx}${core.bz}${core.tx}${core.tz}`],
      bx: core.bx,
      bz: core.bz,
    });
  }
  if (city.reserve) {
    const { bx, bz } = city.reserve;
    buildings.push({
      key: city.reserve.id,
      id: city.reserve.id,
      kind: 'building',
      typeId: 'reserve',
      anchor: anchor('reserve', city.reserve.id),
      tiles: [`p${bx}${bz}11`],
      bx,
      bz,
    });
  }
  return buildings.sort((left, right) => left.key.localeCompare(right.key));
}

function anchorTiles(city, value, people = null, state = null) {
  if (!value) return [];
  if (value.kind === 'parcel') return activeParcel(city, state, value.id)?.tiles ?? [];
  if (value.kind === 'civic') {
    return city.civicUses.find(({ id }) => id === value.id)?.tiles ?? [];
  }
  if (value.kind === 'reserve') {
    return city.reserve?.id === value.id
      ? [`p${city.reserve.bx}${city.reserve.bz}11`]
      : [];
  }
  if (value.kind === 'core') {
    const id = value.id.replace(/:mouth$/, '');
    const core = city.blockCores.find((entry) => entry.id === id)
      ?? city.rightsOfWay.find((entry) => entry.id === id);
    return core ? [`p${core.bx}${core.bz}11`] : [];
  }
  if (value.kind === 'person') {
    return anchorTiles(city, people?.byId?.[value.id]?.toAnchor, people, state);
  }
  return [];
}

function anchorBlock(city, value, people = null, state = null) {
  const tile = anchorTiles(city, value, people, state)[0];
  if (!tile) return null;
  const { bx, bz } = parseParcelId(tile);
  return `${bx},${bz}`;
}

function tileDistance(leftTiles, rightTiles) {
  let best = Infinity;
  for (const leftId of leftTiles) {
    const left = parseParcelId(leftId);
    const leftGlobal = globalTile(left.bx, left.bz, left.tx, left.tz);
    for (const rightId of rightTiles) {
      const right = parseParcelId(rightId);
      const rightGlobal = globalTile(right.bx, right.bz, right.tx, right.tz);
      best = Math.min(
        best,
        Math.abs(leftGlobal.gx - rightGlobal.gx) + Math.abs(leftGlobal.gz - rightGlobal.gz),
      );
    }
  }
  return best;
}

function personEntity(city, person, people, state = null) {
  return {
    key: person.id,
    id: person.id,
    kind: 'person',
    typeId: person.archetypeId,
    anchor: person.toAnchor,
    tiles: anchorTiles(city, person.toAnchor, people, state),
    person,
  };
}

function blockHumanDensity(city, input) {
  const density = {};
  for (let bz = 0; bz < city.blocksZ; bz += 1) {
    for (let bx = 0; bx < city.blocksX; bx += 1) density[`${bx},${bz}`] = 0;
  }
  for (const id of [...(input.people?.order ?? [])].sort()) {
    const person = input.people.byId[id];
    const block = anchorBlock(city, person.toAnchor, input.people, input);
    if (block) density[block] += 1;
  }
  for (const eventId of [...(input.events?.order ?? [])].sort()) {
    const event = input.events.byId[eventId];
    const crowdSize = event.payload?.crowdSize ?? 0;
    if (crowdSize <= 0 || !event.anchorIds?.length) continue;
    const parcelId = [...event.anchorIds].sort()[0];
    const parcel = activeParcel(city, input, parcelId);
    if (parcel) density[`${parcel.bx},${parcel.bz}`] += Math.ceil(crowdSize / 5);
  }
  return density;
}

export function fireExposureBp(city, state, parcelId) {
  const status = state.parcelStatus[parcelId];
  const holding = state.holdings[parcelId];
  const parcel = activeParcel(city, state, parcelId);
  const condition = holding?.condition ?? status?.condition ?? parcel.condition;
  const archetypeId = status?.builtArchetypeId ?? holding?.archetypeId ?? parcel.archetypeId;
  const authoredExposureBp = ARCHETYPES[archetypeId]?.fireExposureBp ?? 0;
  return Math.max(0, Math.min(4000,
    [1800, 800, 300][condition]
    + authoredExposureBp
    + (status?.occupancy === 'vacant' ? 700 : 0)
    + (holding?.construction ? 1200 : 0)));
}

function architectTwoRungValue(city, input, parcelId) {
  const holding = input.holdings[parcelId];
  if (!holding) return 0;
  const first = nextArchetypeId(holding.archetypeId);
  const second = first ? nextArchetypeId(first) : null;
  if (!first || !second || first === second || holding.level + 2 > holding.planningCeiling) return 0;
  return ARCHETYPES[second].basePrice - ARCHETYPES[first].basePrice;
}

function familyUtilityForBlock(city, blockId) {
  const [bx, bz] = blockId.split(',').map(Number);
  let utility = 0;
  for (const building of civicAndCoreBuildings(city)) {
    if (building.bx !== bx || building.bz !== bz) continue;
    if (FAMILY_POSITIVE_IDS.includes(building.typeId)) utility += 300;
    if (FAMILY_NEGATIVE_IDS.includes(building.typeId)) utility -= 700;
  }
  return utility;
}

function existingPeopleCount(input, archetypeId) {
  return [...(input.people?.order ?? [])].sort()
    .filter((id) => input.people.byId[id].archetypeId === archetypeId).length;
}

function buildContext(city, input) {
  const unownedIds = [...activeOrder(city, input)].sort().filter((id) => !ownerOf(input, id));
  const ownedIds = Object.keys(input.holdings).sort()
    .filter((id) => input.holdings[id].owner === 'player');
  const activeWorksIds = ownedIds.filter((id) =>
    input.holdings[id].renovation || input.holdings[id].construction);
  const tiredOwnedIds = ownedIds.filter((id) =>
    (input.holdings[id].condition ?? input.parcelStatus[id].condition) < RULES.maxCondition);
  const architectEligibleIds = ownedIds.filter((id) => {
    const holding = input.holdings[id];
    return eraBand(ARCHETYPES[holding.archetypeId]) === 'historic'
      || holding.level < holding.planningCeiling;
  });
  const vulnerableIds = [...activeOrder(city, input)].sort().filter((id) => {
    const status = input.parcelStatus[id];
    const holding = input.holdings[id];
    return (holding?.condition ?? status.condition) === 0
      || status.occupancy === 'vacant'
      || status.occupancy === 'squatted'
      || Boolean(holding?.construction);
  });
  const squatterEligibleIds = [...activeOrder(city, input)].sort().filter((id) => {
    const status = input.parcelStatus[id];
    const holding = input.holdings[id];
    return status.occupancy !== 'squatted'
      && (status.occupancy === 'vacant' || Boolean(holding?.construction));
  });
  const buildings = civicAndCoreBuildings(city);
  const density = blockHumanDensity(city, input);
  const stress = debtStressBp(city, input, 'player');
  const activeAuctionCount = [...(input.events?.order ?? [])].sort()
    .filter((id) => input.events.byId[id].type === 'auction'
      && input.events.byId[id].status !== 'resolved'
      && input.events.byId[id].status !== 'cancelled').length;
  const hasPolice = existingPeopleCount(input, 'policeman') > 0;
  return {
    city,
    input,
    buildings,
    density,
    unownedIds,
    ownedIds,
    activeWorksIds,
    tiredOwnedIds,
    architectEligibleIds,
    vulnerableIds,
    squatterEligibleIds,
    metrics: {
      unownedCount: unownedIds.length,
      maxBlockHumanDensity: Math.max(0, ...Object.keys(density).sort().map((key) => density[key])),
      activeAuctionCount,
      activeWorks: activeWorksIds.length,
      builderEligibleCount: new Set([...activeWorksIds, ...tiredOwnedIds]).size
        + buildings.filter(({ typeId }) => typeId === 'works-yard').length,
      architectEligibleCount: architectEligibleIds.length,
      brokerStressExcess: Math.max(0, stress - 3500),
      vulnerableCount: vulnerableIds.length,
      squatterEligibleCount: squatterEligibleIds.length,
      policeBuildingCount: buildings.filter(({ typeId }) =>
        typeId === 'police-station' || typeId === 'remand-centre').length,
      existingPolicemanCount: existingPeopleCount(input, 'policeman'),
      existingDogCount: existingPeopleCount(input, 'dog'),
      familyPositiveEmitterCount: buildings.filter(({ typeId }) =>
        FAMILY_POSITIVE_IDS.includes(typeId)).length,
      familyNegativeEmitterCount: buildings.filter(({ typeId }) =>
        FAMILY_NEGATIVE_IDS.includes(typeId)).length,
      residentialCount: [...activeOrder(city, input)].sort()
        .filter((id) => activeParcel(city, input, id).sector === 'residential').length,
      policeIncidenceMultiplier: hasPolice ? 0.35 : 1,
    },
  };
}

const PREDICATE_RULES = Object.freeze({
  always: () => true,
  'phase-play': ({ input }) => input.phase === 'play',
  'metric-at-least': ({ metrics }, predicate) =>
    metrics[predicate.metric] >= predicate.value,
  'broker-eligible': ({ city, input }) =>
    debtStressBp(city, input, 'player') > 3500 || input.cash < 1_000_000,
  'family-eligible': ({ metrics }) =>
    metrics.residentialCount > 0 && metrics.familyPositiveEmitterCount > 0,
});

function predicatePasses(context, predicate) {
  return PREDICATE_RULES[predicate.rule](context, predicate);
}

function applyMeasureMultipliers(value, context, measure, person = null) {
  if (!measure) return value;
  const entities = [...context.buildings];
  if (person) {
    entities.push(personEntity(context.city, person, context.input.people, context.input));
  }
  const matches = resolvePairSynergies(entities);
  let result = value;
  let product = 1;
  const seen = new Set();
  for (const match of matches) {
    // Wave L retires building↔building pairs as a gameplay authority. Settled districts
    // now own those benefits; person-involving relationships remain valid here.
    if (match.left.kind === 'building' && match.right.kind === 'building') continue;
    if (
      person
      && match.left.kind === 'building'
      && match.right.kind === 'building'
      && (
        tileDistance(anchorTiles(context.city, person.toAnchor, context.input.people), match.left.tiles) > 2
        || tileDistance(anchorTiles(context.city, person.toAnchor, context.input.people), match.right.tiles) > 2
      )
    ) continue;
    if (seen.has(match.name)) continue;
    for (const effect of match.effects) {
      if (effect.measure !== measure || effect.multiplier === undefined) continue;
      const nextProduct = Math.min(1.6, product * effect.multiplier);
      result = Math.round(result * (nextProduct / product));
      product = nextProduct;
      seen.add(match.name);
    }
  }
  return result;
}

function chanceFor(context, cast) {
  const chance = cast.spawn.chance;
  if (chance.guaranteed) return 10000;
  if (chance.conditional) {
    return context.metrics[chance.conditional.metric]
      ? chance.conditional.truthy
      : chance.conditional.falsy;
  }
  let value = chance.base;
  for (const term of chance.terms ?? []) {
    const metric = context.metrics[term.metric] ?? 0;
    if (term.divisor) value += Math.floor(metric / term.divisor);
    else value += metric * term.multiplier;
  }
  value = Math.max(chance.min ?? 0, Math.min(chance.max ?? 9000, value));
  value = applyMeasureMultipliers(value, context, chance.synergyMeasure);
  if (chance.postMultiplierMetric) {
    value = Math.round(value * context.metrics[chance.postMultiplierMetric]);
  }
  return Math.max(0, Math.min(9000, value));
}

function candidate(anchorValue, score = 0, outcome = null) {
  return { anchor: anchorValue, score, outcome };
}

function sortedBest(candidates, destinationRoll) {
  if (!candidates.length) return null;
  const ordered = [...candidates].sort((left, right) =>
    right.score - left.score || anchorKey(left.anchor).localeCompare(anchorKey(right.anchor)));
  const top = ordered.filter(({ score }) => score === ordered[0].score);
  return top[Math.min(top.length - 1, Math.floor(destinationRoll * top.length))];
}

function nearestByTiles(city, fromAnchor, candidates, state = null) {
  const fromTiles = anchorTiles(city, fromAnchor, null, state);
  return [...candidates].sort((left, right) =>
    tileDistance(fromTiles, anchorTiles(city, left.anchor, null, state))
      - tileDistance(fromTiles, anchorTiles(city, right.anchor, null, state))
    || anchorKey(left.anchor).localeCompare(anchorKey(right.anchor)))[0] ?? null;
}

const COUNCIL_MOTTOS = Object.freeze([
  'Mind the bluestone, share the shade.',
  'Good streets make patient neighbours.',
  'Measure twice, plant once.',
  'The long way round is still public land.',
]);

function findAlreadyRecorded(input, findId) {
  return (input.intel?.finds ?? []).some((find) => find.id === findId);
}

function dogFallback(context) {
  const family = [...(context.input.people?.order ?? [])].sort()
    .map((id) => context.input.people.byId[id])
    .find(({ archetypeId }) => archetypeId === 'family');
  if (family) return candidate(family.toAnchor);
  if (context.city.reserve) return candidate(anchor('reserve', context.city.reserve.id));
  return candidate(walkAnchorsFor(context.city, context.input)[0]);
}

function chooseByUnit(values, unit) {
  if (!values.length) return null;
  return values[Math.min(values.length - 1, Math.floor(unit * values.length))];
}

/**
 * §10's forceable deterministic seam. Production omits `units` and consumes exactly
 * find-kind then anchor from people:q<q>:dog:<personId>.
 */
export function dogFindFor(city, input, personId, units = {}) {
  const context = buildContext(city, input);
  const rng = dogFindStream(input.seed, input.quarter, personId);
  const findKindUnit = units.findKindUnit ?? rng.unit();
  const anchorUnit = units.anchorUnit ?? rng.unit();
  const anotherMarker = [...(input.people?.order ?? [])].sort()
    .filter((id) => id !== personId)
    .map((id) => input.people.byId[id])
    .some((person) =>
      person.archetypeId === 'dog'
      && person.pendingOutcome?.kind === 'dog-find'
      && person.pendingOutcome.status === 'pending');
  if (anotherMarker) return dogFallback(context);

  const passedAuctions = [...(input.events?.order ?? [])].sort()
    .map((id) => input.events.byId[id])
    .filter((event) =>
      event.type === 'auction'
      && event.status === 'resolved'
      && event.outcome?.outcome === 'passed-in'
      && !findAlreadyRecorded(input, `lost-auction-paddle:${event.id}`));
  const worksYards = context.buildings
    .filter(({ typeId }) => typeId === 'works-yard')
    .sort((a, b) => a.id.localeCompare(b.id));
  const planEligible = !findAlreadyRecorded(input, 'builders-dropped-plans')
    && (context.activeWorksIds.length > 0 || worksYards.length > 0);
  const capsuleEligible = Boolean(city.reserve)
    && !findAlreadyRecorded(input, 'council-time-capsule');
  const eligibleKinds = [
    ...(passedAuctions.length ? ['lost-auction-paddle'] : []),
    ...(planEligible ? ['builders-dropped-plans'] : []),
    ...(capsuleEligible ? ['council-time-capsule'] : []),
  ];
  const findKind = chooseByUnit(eligibleKinds, findKindUnit);

  if (findKind === 'lost-auction-paddle') {
    const event = chooseByUnit(passedAuctions, anchorUnit);
    const parcelId = event.anchorIds[0];
    const askingOverride = input.parcelStatus[parcelId].askingOverride
      ?? event.outcome.askingOverride;
    return candidate(anchor('parcel', parcelId), 0, {
      kind: 'dog-find',
      findId: `lost-auction-paddle:${event.id}`,
      findKind,
      status: 'pending',
      eventId: event.id,
      parcelId,
      askingOverride,
      gesture: 'sit-with-paddle',
    });
  }

  if (findKind === 'builders-dropped-plans') {
    const sources = [
      ...context.activeWorksIds.map((parcelId) => ({
        anchor: anchor('parcel', parcelId),
        parcelId,
      })),
      ...worksYards.map((yard) => ({ anchor: yard.anchor, parcelId: null })),
    ];
    const source = chooseByUnit(sources, anchorUnit);
    const mouths = [...city.rightsOfWay].sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id }) => candidate(anchor('core', `${id}:mouth`)));
    const destination = nearestByTiles(city, source.anchor, mouths, input)?.anchor ?? source.anchor;
    const parcelId = source.parcelId
      ?? context.ownedIds.find((id) =>
        !input.holdings[id].renovation && !input.holdings[id].construction)
      ?? context.ownedIds[0]
      ?? activeOrder(city, input)[0];
    const worksActionOrdinal = input.actionOrdinal + 1;
    const defectBand = worksQualityRoll(
      input.seed,
      input.quarter,
      parcelId,
      worksActionOrdinal,
    ) < RULES.cheapBuilderDefectBp;
    return candidate(destination, 0, {
      kind: 'dog-find',
      findId: 'builders-dropped-plans',
      findKind,
      status: 'pending',
      parcelId,
      worksQuarter: input.quarter,
      worksActionOrdinal,
      defectBand,
      gesture: 'carry-plan',
    });
  }

  if (findKind === 'council-time-capsule') {
    return candidate(anchor('reserve', city.reserve.id), 0, {
      kind: 'dog-find',
      findId: 'council-time-capsule',
      findKind,
      status: 'pending',
      motto: chooseByUnit(COUNCIL_MOTTOS, anchorUnit),
      gesture: 'dig',
    });
  }

  const interchange = context.buildings
    .find(({ typeId }) => typeId === 'transport-interchange');
  if (interchange && !findAlreadyRecorded(input, 'tram-ticket-from-nowhere')) {
    return candidate(interchange.anchor, 0, {
      kind: 'dog-find',
      findId: 'tram-ticket-from-nowhere',
      findKind: 'tram-ticket-from-nowhere',
      status: 'pending',
      unlockedLivery: 'blue-gold',
      gesture: 'wait-with-ticket',
    });
  }
  return dogFallback(context);
}

const DESTINATION_RULES = Object.freeze({
  'agent-opportunity': (context, roll) => {
    const row = context.city.market.find(({ quarter }) => quarter === context.input.quarter + 1);
    return sortedBest(context.unownedIds.map((id) => {
      const parcel = activeParcel(context.city, context.input, id);
      const block = `${parcel.bx},${parcel.bz}`;
      const auction = [...(context.input.events?.order ?? [])].sort().some((eventId) => {
        const event = context.input.events.byId[eventId];
        return event.type === 'auction' && event.anchorIds?.includes(id);
      });
      return candidate(
        anchor('parcel', id),
        (row?.sectors[parcel.sector]?.realisedBp ?? 0)
          + 20 * context.density[block]
          + (auction ? 500 : 0),
        {
          kind: 'hire',
          status: 'available',
          profession: 'property-agent',
          brief: 'sales',
        },
      );
    }), roll);
  },
  'owned-works': (context) => {
    const work = context.activeWorksIds.map((id) =>
      candidate(anchor('parcel', id), 1000));
    if (work.length) return work[0];
    const gain = context.tiredOwnedIds.map((id) =>
      candidate(anchor('parcel', id), RULES.maxCondition - context.input.holdings[id].condition));
    if (gain.length) return sortedBest(gain, 0);
    const yard = context.buildings.find(({ typeId }) =>
      typeId === 'works-yard' || typeId === 'factory-light' || typeId === 'warehouse-brick');
    return yard ? candidate(yard.anchor) : null;
  },
  'architect-value': (context, roll) => sortedBest(context.architectEligibleIds.map((id) =>
    candidate(
      anchor('parcel', id),
      architectTwoRungValue(context.city, context.input, id)
        + (eraBand(ARCHETYPES[context.input.holdings[id].archetypeId]) === 'historic' ? 1 : 0),
    )), roll),
  'broker-meeting': (context) => {
    const avatar = context.input.avatars[Object.keys(context.input.avatars).sort()[0]];
    if (avatar) return candidate(anchor('avatar', avatar.id));
    const place = context.buildings.find(({ typeId }) => typeId === 'transport-interchange')
      ?? context.buildings.find(({ typeId }) => typeId === 'cafe-corner');
    return place ? candidate(place.anchor) : null;
  },
  'rival-plan': (context) => {
    const target = context.input.rival.intent?.parcelIds?.[0]
      ?? context.input.rival.intent?.parcelId;
    if (target && activeParcel(context.city, context.input, target)) {
      return candidate(anchor('parcel', target));
    }
    const interchange = context.buildings.find(({ typeId }) => typeId === 'transport-interchange');
    return interchange
      ? candidate(interchange.anchor)
      : candidate(walkAnchorsFor(context.city, context.input)[0]);
  },
  'fire-risk': (context, roll) => sortedBest(context.vulnerableIds.map((id) => {
    const status = context.input.parcelStatus[id];
    const holding = context.input.holdings[id];
    return candidate(
      anchor('parcel', id),
      fireExposureBp(context.city, context.input, id)
        + ((holding?.condition ?? status.condition) === 0 ? 800 : 0)
        + (status.occupancy === 'vacant' ? 600 : 0)
        + (holding?.construction ? 1000 : 0),
      { kind: 'fire', parcelId: id, status: 'pending' },
    );
  }), roll),
  'vacant-stock': (context, roll) => sortedBest(context.squatterEligibleIds.map((id) =>
    candidate(
      anchor('parcel', id),
      (context.input.parcelStatus[id].occupancy === 'vacant' ? 1_000_000 : 0)
        - marketValue(context.city, context.input, id),
      { kind: 'occupation', parcelId: id, status: 'pending' },
    )), roll),
  'police-risk': (context, roll) => {
    const risks = [
      ...context.vulnerableIds.map((id) =>
        candidate(anchor('parcel', id), fireExposureBp(context.city, context.input, id))),
    ];
    if (risks.length) return sortedBest(risks, roll);
    const fallback = context.buildings.find(({ typeId }) => typeId === 'remand-centre')
      ?? context.buildings.find(({ typeId }) => typeId === 'police-station');
    return fallback ? candidate(fallback.anchor) : null;
  },
  'family-utility': (context, roll) => {
    const blocks = [...new Set([...activeOrder(context.city, context.input)].sort()
      .filter((id) => activeParcel(context.city, context.input, id).sector === 'residential')
      .map((id) => {
        const parcel = activeParcel(context.city, context.input, id);
        return `${parcel.bx},${parcel.bz}`;
      }))].sort();
    return sortedBest(blocks.map((blockId) => {
      const parcelId = [...activeOrder(context.city, context.input)].sort().find((id) => {
        const parcel = activeParcel(context.city, context.input, id);
        return parcel.sector === 'residential' && `${parcel.bx},${parcel.bz}` === blockId;
      });
      return candidate(
        anchor('parcel', parcelId),
        familyUtilityForBlock(context.city, blockId),
        { kind: 'family-demand', blockId, demandBp: 60 },
      );
    }), roll);
  },
  'dog-find': (context, roll, meta) =>
    dogFindFor(context.city, context.input, meta.personId, meta.units),
});

function destinationFor(context, cast, destinationRoll, fromAnchor, personId) {
  const selected = DESTINATION_RULES[cast.destination.rule](
    context,
    destinationRoll,
    { personId },
  );
  if (selected) return selected;
  const fallback = nearestByTiles(
    context.city,
    fromAnchor,
    walkAnchorsFor(context.city, context.input).map((value) => candidate(value)),
    context.input,
  );
  return fallback ?? candidate(fromAnchor);
}

function contractedHirePin(context, person) {
  if (person.pendingOutcome?.kind !== 'hire' || person.pendingOutcome.status !== 'contracted') {
    return null;
  }
  const parcelId = person.pendingOutcome.parcelId;
  if (!parcelId) return null;
  const holding = context.input.holdings?.[parcelId];
  if (!holding) return null;
  if (!holding.construction && !holding.renovation && holding.owner !== 'player') {
    return null;
  }
  return { kind: 'parcel', id: parcelId };
}

function nextPerson(context, person, cast, destinationRoll, outcomeRoll, persistenceRoll) {
  void outcomeRoll;
  void persistenceRoll;
  if (
    person.pendingOutcome?.kind === 'dog-find'
    && person.pendingOutcome.status === 'pending'
  ) {
    return {
      ...person,
      fromAnchor: { ...person.toAnchor },
      toAnchor: { ...person.toAnchor },
    };
  }
  const hirePin = contractedHirePin(context, person);
  if (hirePin) {
    return {
      ...person,
      fromAnchor: { ...hirePin },
      toAnchor: { ...hirePin },
    };
  }
  const selected = destinationFor(context, cast, destinationRoll, person.toAnchor, person.id);
  return {
    ...person,
    fromAnchor: { ...person.toAnchor },
    toAnchor: { ...selected.anchor },
    intent: cast.destination.rule,
    interactionTarget: selected.anchor.kind === 'parcel' ? { ...selected.anchor } : null,
    pendingOutcome: selected.outcome ?? person.pendingOutcome,
  };
}

function spawnPerson(context, cast, quarter, destinationRoll, outcomeRoll, persistenceRoll) {
  void outcomeRoll;
  void persistenceRoll;
  const existing = new Set(context.input.people?.order ?? []);
  let ordinal = 0;
  while (existing.has(`${cast.id}-${quarter}-${ordinal}`)) ordinal += 1;
  const personId = `${cast.id}-${quarter}-${ordinal}`;
  const fallback = walkAnchorsFor(context.city, context.input)[0];
  const selected = destinationFor(context, cast, destinationRoll, fallback, personId);
  return {
    id: personId,
    archetypeId: cast.id,
    identityId: 0,
    spawnedQuarter: quarter,
    despawnAfterQuarter: quarter + cast.persistence - 1,
    fromAnchor: { ...selected.anchor },
    toAnchor: { ...selected.anchor },
    intent: cast.destination.rule,
    interactionTarget: selected.anchor.kind === 'parcel' ? { ...selected.anchor } : null,
    pendingOutcome: selected.outcome,
    priority: cast.priority,
  };
}

const DESPAWN_RULES = Object.freeze({
  'expiry-only': ({ person, quarter }) => person.despawnAfterQuarter < quarter,
  'phase-result': ({ input }) => input.phase === 'result',
  'hire-consumed-or-expired': ({ person, input, quarter }) => {
    if (person.despawnAfterQuarter < quarter) return true;
    if (professionalProjectsUsed(person) < PROFESSIONAL_PROJECT_CAP) return false;
    return !Object.keys(input.holdings).sort()
      .some((id) => {
        const h = input.holdings[id];
        if (h.hire?.personId === person.id) return true;
        return Object.values(h.hires ?? {}).some((c) => c?.personId === person.id);
      });
  },
  'broker-accepted': ({ person, quarter }) =>
    person.despawnAfterQuarter < quarter || person.pendingOutcome?.status === 'accepted',
  'outcome-resolved-or-expired': ({ person, quarter }) =>
    person.despawnAfterQuarter < quarter
    || ['resolved', 'cancelled', 'intercepted'].includes(person.pendingOutcome?.status),
  'family-utility-low': ({ person, context, quarter }) =>
    person.despawnAfterQuarter < quarter
    || familyUtilityForBlock(
      context.city,
      anchorBlock(context.city, person.toAnchor, context.input.people, context.input) ?? '-1,-1',
    ) < -600,
  'dog-found-or-expired': ({ person, quarter }) =>
    person.despawnAfterQuarter < quarter,
});

export function shouldDespawnPerson(city, input, person, quarter) {
  const cast = PERSON_ARCHETYPE_BY_ID[person.archetypeId];
  const context = buildContext(city, input);
  return DESPAWN_RULES[cast.despawn.rule]({ person, input, quarter, context });
}

function applyPeoplePairSynergies(city, input, people) {
  const byId = Object.fromEntries([...people.order].sort()
    .map((id) => [id, structuredClone(people.byId[id])]));
  const collection = { order: Object.keys(byId).sort(), byId };
  const context = buildContext(city, { ...input, people: collection });
  const entities = [
    ...context.buildings,
    ...collection.order.map((id) => personEntity(city, byId[id], collection, context.input)),
  ];
  const matches = resolvePairSynergies(entities);
  for (const match of matches) {
    for (const effect of match.effects) {
      if (effect.measure === 'cancelOutcome' && match.right.person) {
        const person = byId[match.right.person.id];
        if (person.pendingOutcome?.kind === effect.value) {
          person.pendingOutcome = { ...person.pendingOutcome, status: 'intercepted' };
          person.despawnAfterQuarter = input.quarter - 1;
        }
      }
      if (effect.measure === 'dogFindChance' && match.right.person) {
        const dog = byId[match.right.person.id];
        if (dog.pendingOutcome?.findId) {
          dog.pendingOutcome = {
            ...dog.pendingOutcome,
            chanceMultiplier: effect.multiplier,
          };
        }
      }
    }
  }
  const order = Object.keys(byId).sort().filter((id) =>
    byId[id].despawnAfterQuarter >= input.quarter);
  return { order, byId: Object.fromEntries(order.map((id) => [id, byId[id]])) };
}

/**
 * A test may force named spawn rolls without changing production state. This is a
 * deterministic fixture seam: production calls omit `options`, and all other draws
 * still come from the exact named stream and exact draw order.
 */
export function tickPeopleFromSnapshot(city, input, quarter, options = {}) {
  if (!Object.isFrozen(input)) {
    throw new TypeError('tickPeopleFromSnapshot requires an immutable peopleInputSnapshot');
  }
  const context = buildContext(city, input);
  const survivors = [];
  for (const id of [...(input.people?.order ?? [])].sort()) {
    const person = input.people.byId[id];
    const cast = PERSON_ARCHETYPE_BY_ID[person.archetypeId];
    if (DESPAWN_RULES[cast.despawn.rule]({ person, input, quarter, context })) continue;
    const rng = personQuarterStream(input.seed, quarter, person.id);
    survivors.push(nextPerson(context, person, cast, rng.unit(), rng.unit(), rng.unit()));
  }

  const spawned = [];
  /** Extra unique dogs and families — each copy gets its own identityId. */
  const MULTI_SPAWN = Object.freeze({
    dog: 4,
    family: 3,
  });
  const STAKEHOLDERS = new Set([
    'cheap-builder', 'architect', 'property-agent', 'mortgage-broker', 'rival-developer',
  ]);
  for (const cast of PERSON_ARCHETYPES) {
    const rng = spawnQuarterStream(input.seed, quarter, cast.id);
    const already = [...survivors, ...spawned]
      .some(({ archetypeId }) => archetypeId === cast.id);
    if (STAKEHOLDERS.has(cast.id) && already) continue;
    if (!predicatePasses(context, cast.spawn.predicate)
      && !(STAKEHOLDERS.has(cast.id) && !options.spawnRolls && !already)) {
      continue;
    }
    if (cast.id === 'rival-developer' && already) continue;
    const attempts = MULTI_SPAWN[cast.id] ?? 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (survivors.length + spawned.length >= PEOPLE_CAP) break;
      const spawnRoll = options.spawnRolls?.[cast.id] ?? rng.unit();
      // Later attempts need slightly better rolls so first hireable is preferred.
      const attemptBias = attempt * 0.12;
      const destinationRoll = rng.unit();
      const outcomeRoll = rng.unit();
      const persistenceRoll = rng.unit();
      if (cast.spawn.chance.guaranteed) {
        if (attempt > 0) break; // one guaranteed rival only
      } else if (STAKEHOLDERS.has(cast.id) && !options.spawnRolls && !already) {
        // One Chippy / Saskia / Terry / Vinh even when the chance roll would skip.
      } else if (spawnRoll * 10000 + attemptBias * 10000 >= chanceFor(context, cast)) {
        continue;
      }
      const person = spawnPerson(
        context,
        cast,
        quarter,
        destinationRoll,
        outcomeRoll,
        persistenceRoll,
      );
      person.identityId = nextIdentityId(cast.id, [...survivors, ...spawned]);
      spawned.push(person);
      if (cast.spawn.chance.guaranteed) break;
    }
  }

  const candidates = [...survivors, ...spawned]
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
    .slice(0, PEOPLE_CAP);
  const retainedIds = new Set(candidates.map(({ id }) => id));
  const retained = [...survivors, ...spawned]
    .filter(({ id }) => retainedIds.has(id))
    .sort((left, right) => left.id.localeCompare(right.id));
  return freezePeople(applyPeoplePairSynergies(city, input, {
    order: retained.map(({ id }) => id),
    byId: Object.fromEntries(retained.map((person) => [person.id, person])),
  }));
}

export function tickPeople(city, state, quarter, options = {}) {
  return tickPeopleFromSnapshot(city, createPeopleInputSnapshot(state), quarter, options);
}

export function anchorUseId(city, value, people = null, state = null) {
  if (value.kind === 'parcel') return activeParcel(city, state, value.id)?.landUseId ?? null;
  if (value.kind === 'civic') {
    return city.civicUses.find(({ id }) => id === value.id)?.useId ?? null;
  }
  if (value.kind === 'reserve') return city.reserve?.id === value.id ? 'reserve' : null;
  if (value.kind === 'core') {
    const id = value.id.replace(/:mouth$/, '');
    return city.blockCores.find((entry) => entry.id === id)?.useId ?? null;
  }
  if (value.kind === 'person') {
    return anchorUseId(city, people?.byId?.[value.id]?.toAnchor, people, state);
  }
  return null;
}

/**
 * Renderer-independent §6.1 graph. It is deliberately rebuilt from measured city geometry
 * instead of reading displayWalkGraph, so display-only routing may change without moving a
 * spend. V3.04 stores the selected version beside the other derived topology fields.
 */
export function coreWalkGraphFor(city, state = null) {
  return activeCoreWalkGraph(city, state);
}

function effectiveSpendAnchor(state, value, seen = new Set()) {
  if (!value) return null;
  const key = `${value.kind}:${value.id}`;
  if (seen.has(key)) return null;
  seen.add(key);
  if (value.kind === 'person') {
    return effectiveSpendAnchor(state, state.people.byId[value.id]?.toAnchor, seen);
  }
  if (value.kind === 'avatar') {
    return effectiveSpendAnchor(state, state.avatars[value.id]?.destination, seen);
  }
  return value;
}

export function avatarSpendStream(seed, quarter, avatarId, actionOrdinal) {
  return peopleStream(seed, avatarId === 'player'
    ? `q${quarter}:avatar-spend:${avatarId}:${actionOrdinal}`
    : `q${quarter}:seat:${avatarId}:avatar-spend:${actionOrdinal}`);
}

export function avatarSpendCandidate(city, state, avatarId, destination, actionOrdinal) {
  const avatar = state.avatars[avatarId];
  if (!avatar) return null;
  const { graph, attachments } = coreWalkGraphFor(city, state);
  const from = effectiveSpendAnchor(state, avatar.destination);
  const to = effectiveSpendAnchor(state, destination);
  if (!from || !to) return null;
  const start = attachments[`${from.kind}:${from.id}`];
  const goal = attachments[`${to.kind}:${to.id}`];
  if (!start || !goal) return null;
  const queue = [start];
  const previous = new Map([[start, null]]);
  for (let index = 0; index < queue.length && !previous.has(goal); index += 1) {
    for (const neighbour of graph[queue[index]] ?? []) {
      if (previous.has(neighbour)) continue;
      previous.set(neighbour, queue[index]);
      queue.push(neighbour);
    }
  }
  if (!previous.has(goal)) return null;
  const route = [];
  for (let key = goal; key !== null; key = previous.get(key)) route.push(key);
  route.reverse();
  const routeIndex = new Map(route.map((key, index) => [key, index]));
  const venueAnchors = [
    ...activeOrder(city, state).map((id) => {
      const { landUseId } = activeParcel(city, state, id);
      return {
      anchor: { kind: 'parcel', id },
      useId: landUseId,
      };
    }),
    ...(city.civicUses ?? []).map(({ id, useId }) => ({
      anchor: { kind: 'civic', id },
      useId,
    })),
  ];
  const candidates = venueAnchors.flatMap(({ anchor, useId }) => {
    const rule = AVATAR_VENUE_BY_USE[useId];
    const node = attachments[`${anchor.kind}:${anchor.id}`];
    const pathIndex = routeIndex.get(node);
    return rule && pathIndex !== undefined
      ? [{ ...rule, anchor, pathIndex, amount: RULES[rule.costRule] }]
      : [];
  }).sort((left, right) =>
    left.pathIndex - right.pathIndex
    || `${left.anchor.kind}:${left.anchor.id}`.localeCompare(
      `${right.anchor.kind}:${right.anchor.id}`,
    ));
  if (!candidates.length) return null;
  const uncovered = candidates.filter((row) =>
    !avatarHasAccess(avatar, row.token, venueSpendUntilQuarter(state.quarter, row)));
  if (!uncovered.length) return null;
  const destKey = `${destination.kind}:${destination.id}`;
  const destHit = uncovered.find((row) => `${row.anchor.kind}:${row.anchor.id}` === destKey);
  if (destHit) return destHit;
  const rng = avatarSpendStream(state.seed, state.quarter, avatarId, actionOrdinal);
  return uncovered[Math.floor(rng.unit() * uncovered.length)];
}

export function venueSpendUntilQuarter(quarter, rule) {
  return rule.duration === null ? RULES.quarters : quarter + rule.duration;
}

export function applyAvatarSpend(avatar, quarter, spend) {
  if (!spend) return avatar;
  const untilQuarter = venueSpendUntilQuarter(quarter, spend);
  avatar.accessTokens[spend.token] = untilQuarter;
  avatar.spendingTotal += spend.amount;
  return { avatar, untilQuarter };
}

export function avatarHasAccess(avatar, token, quarter) {
  return (avatar.accessTokens?.[token] ?? 0) >= quarter;
}

export function validateLegacyPurchase(action) {
  if (action.purchase !== null && action.purchase !== undefined) {
    return {
      ok: false,
      reason: 'Manual purchases were removed; venue spending is autonomous.',
    };
  }
  return { ok: true };
}

export function walkDestinationExists(city, state, destination) {
  if (!destination || !ANCHOR_KINDS.includes(destination.kind)) return false;
  if (destination.kind === 'person') return Boolean(state.people.byId[destination.id]);
  if (destination.kind === 'avatar') return Boolean(state.avatars[destination.id]);
  return walkAnchorsFor(city, state).some((value) => sameAnchor(value, destination));
}

export function deriveAvatarPath(city, fromAnchor, toAnchor, people = null) {
  const from = fromAnchor.kind === 'person'
    ? people?.byId?.[fromAnchor.id]?.toAnchor ?? fromAnchor
    : fromAnchor;
  const to = toAnchor.kind === 'person'
    ? people?.byId?.[toAnchor.id]?.toAnchor ?? toAnchor
    : toAnchor;
  const startKey = anchorKey(from);
  const goalKey = anchorKey(to);
  if (startKey === goalKey) return Object.freeze([{ ...from }]);
  const graph = city.walkGraph ?? {};
  const queue = [startKey];
  const previous = new Map([[startKey, null]]);
  while (queue.length) {
    const current = queue.shift();
    for (const neighbour of [...(graph[current] ?? [])].sort()) {
      if (previous.has(neighbour)) continue;
      previous.set(neighbour, current);
      if (neighbour === goalKey) {
        queue.length = 0;
        break;
      }
      queue.push(neighbour);
    }
  }
  if (!previous.has(goalKey)) return Object.freeze([{ ...from }, { ...to }]);
  const keys = [];
  for (let key = goalKey; key !== null; key = previous.get(key)) keys.push(key);
  keys.reverse();
  return Object.freeze(keys.map((key) => {
    const separator = key.indexOf(':');
    return Object.freeze({ kind: key.slice(0, separator), id: key.slice(separator + 1) });
  }));
}

function effectiveWalkAnchor(state, destination) {
  return destination.kind === 'person'
    ? state.people.byId[destination.id]?.toAnchor ?? destination
    : destination;
}

export function contactPeopleForWalk(state, destination) {
  const effective = effectiveWalkAnchor(state, destination);
  return PERSON_ARCHETYPES.flatMap((cast) =>
    [...state.people.order].sort()
      .map((id) => state.people.byId[id])
      .filter((person) => person.archetypeId === cast.id && sameAnchor(person.toAnchor, effective)));
}

function discoverDogFind(state, avatar, person) {
  const pending = person.pendingOutcome;
  if (
    pending?.kind !== 'dog-find'
    || pending.status !== 'pending'
    || !pending.findId
  ) {
    return {
      state,
      event: { kind: 'dog-find-pending', personId: person.id },
      despawn: false,
    };
  }
  const find = {
    id: pending.findId,
    kind: pending.findKind,
    personId: person.id,
    foundQuarter: state.quarter,
    anchor: { ...person.toAnchor },
    source: 'dog',
  };
  const identity = identityFor(person.archetypeId, person.identityId ?? 0);
  find.identityId = person.identityId ?? 0;
  find.personChip = identity.chip;
  if (pending.findKind === 'lost-auction-paddle') {
    find.eventId = pending.eventId;
    find.parcelId = pending.parcelId;
    find.askingOverride = pending.askingOverride;
    const prior = state.intel.parcels[pending.parcelId] ?? {};
    state.intel.parcels[pending.parcelId] = {
      conditionRevealed: prior.conditionRevealed ?? false,
      nextAsking: pending.askingOverride,
      floodExposureBp: prior.floodExposureBp ?? null,
      fireExposureBp: prior.fireExposureBp ?? null,
      revealedQuarter: state.quarter,
      source: 'dog',
      avatarId: avatar.id,
    };
  } else if (pending.findKind === 'builders-dropped-plans') {
    find.parcelId = pending.parcelId;
    find.worksQuarter = pending.worksQuarter;
    find.worksActionOrdinal = pending.worksActionOrdinal;
    find.defectBand = pending.defectBand;
  } else if (pending.findKind === 'council-time-capsule') {
    find.motto = pending.motto;
    find.actionsGranted = RULES.timeCapsuleActions;
    state.actionsRemaining = (state.actionsRemaining ?? 0) + RULES.timeCapsuleActions;
    if (state.seatEconomy?.P1) {
      state.seatEconomy.P1.actionsRemaining =
        (state.seatEconomy.P1.actionsRemaining ?? 0) + RULES.timeCapsuleActions;
    }
  } else if (pending.findKind === 'tram-ticket-from-nowhere') {
    find.unlockedLivery = pending.unlockedLivery;
  }
  state.intel.finds.push(find);
  person.pendingOutcome = { ...pending, status: 'found' };
  return {
    state,
    event: { kind: 'dog-find', personId: person.id, find: { ...find } },
    despawn: false,
  };
}

const CONTACT_OPERATIONS = Object.freeze({
  'hire-candidate': ({ state, person, operation }) => ({
    state,
    event: {
      kind: 'hire-candidate',
      personId: person.id,
      profession: operation.profession,
    },
  }),
  'broker-offer': ({ state, avatar, person, brokerChoice }) => {
    const exact = avatarHasAccess(avatar, 'brokerTermsUntilQuarter', state.quarter);
    if (!brokerChoice) {
      return {
        state,
        event: {
          kind: 'broker-intel',
          personId: person.id,
          detail: exact ? { lvrBp: RULES.brokerLvrBp, interestBp: RULES.brokerInterestBp } : null,
        },
      };
    }
    const offer = brokerChoice === 'lvr'
      ? {
        kind: 'lvr',
        valueBp: RULES.brokerLvrBp,
        expiresAfterQuarter: state.quarter + 1,
        sourcePersonId: person.id,
      }
      : {
        kind: 'interest',
        valueBp: RULES.brokerInterestBp,
        expiresAfterQuarter: state.quarter + 2,
        sourcePersonId: person.id,
      };
    avatar.brokerOffer = offer;
    return {
      state,
      event: {
        kind: 'broker-offer',
        personId: person.id,
        offer: exact ? { ...offer } : { kind: offer.kind, expiresAfterQuarter: offer.expiresAfterQuarter },
        accepted: true,
        despawn: true,
      },
      despawn: true,
    };
  },
  'rival-disclosure': ({ state, avatar, person }) => {
    const firstMove = state.rival.intent?.plan?.[0] ?? state.rival.intent ?? null;
    const parcelId = firstMove?.parcelId ?? state.rival.intent?.parcelIds?.[0] ?? null;
    stampFreeAcquire(avatar, parcelId, state.quarter);
    return {
      state,
      event: {
        kind: 'rival-disclosure',
        personId: person.id,
        firstMove,
      },
    };
  },
  'pending-fire': ({ state, person }) => ({
    state,
    event: { kind: 'fire-warning', personId: person.id, outcome: person.pendingOutcome },
  }),
  'pending-occupation': ({ state, avatar, person }) => ({
    state,
    event: {
      kind: 'occupation-warning',
      personId: person.id,
      outcome: avatarHasAccess(avatar, 'peopleDemandUntilQuarter', state.quarter)
        ? person.pendingOutcome
        : null,
    },
  }),
  'patrol-intel': ({ state, person }) => ({
    state,
    event: { kind: 'patrol-intel', personId: person.id },
  }),
  'family-signal': ({ state, avatar, person }) => ({
    state,
    event: {
      kind: 'family-signal',
      personId: person.id,
      blockId: avatarHasAccess(avatar, 'peopleDemandUntilQuarter', state.quarter)
        ? person.pendingOutcome?.blockId ?? null
        : null,
    },
  }),
  'dog-find-pending': ({ state, avatar, person }) =>
    discoverDogFind(state, avatar, person),
});

export function resolveAvatarContacts(city, state, avatarId, destination, brokerChoice = null) {
  const avatar = state.avatars[avatarId];
  const contacts = contactPeopleForWalk(state, destination);
  const events = [];
  const despawnIds = new Set();
  for (const person of contacts) {
    const cast = PERSON_ARCHETYPE_BY_ID[person.archetypeId];
    const operation = cast.interaction;
    const resolved = CONTACT_OPERATIONS[operation.operation]({
      city,
      state,
      avatar,
      person,
      operation,
      brokerChoice,
    });
    events.push(resolved.event);
    if (resolved.despawn) despawnIds.add(person.id);
  }
  if (brokerChoice && !events.some(({ kind }) => kind === 'broker-offer')) {
    throw new Error('No mortgage broker was met at this destination.');
  }
  if (despawnIds.size) {
    const order = state.people.order.filter((id) => !despawnIds.has(id));
    state.people = freezePeople({
      order,
      byId: Object.fromEntries(order.map((id) => [id, state.people.byId[id]])),
    });
  }
  return events;
}

export function familyDemandForPerson(city, state, person) {
  if (person.archetypeId !== 'family') return 0;
  const context = buildContext(city, state);
  let demand = applyMeasureMultipliers(60, context, 'familyDemand', person);
  return Math.max(-RULES.peopleDemandClampBp, Math.min(RULES.peopleDemandClampBp, demand));
}

export function humanDemandByBlock(city, state) {
  const result = Object.fromEntries(Object.keys(state.blockDemandBp).sort()
    .map((blockId) => [blockId, 0]));
  for (const personId of [...state.people.order].sort()) {
    const person = state.people.byId[personId];
    if (person.archetypeId !== 'family') continue;
    const blockId = person.pendingOutcome?.blockId
      ?? anchorBlock(city, person.toAnchor, state.people, state);
    if (!blockId || !(blockId in result)) continue;
    result[blockId] += familyDemandForPerson(city, state, person);
  }
  for (const blockId of Object.keys(result).sort()) {
    result[blockId] = Math.max(
      -RULES.peopleDemandClampBp,
      Math.min(RULES.peopleDemandClampBp, result[blockId]),
    );
  }
  return result;
}

/** Blocks carrying an authored family signal in the current people snapshot. */
export function activeFamilySignalBlocks(city, state) {
  const valid = new Set(Object.keys(state?.blockDemandBp ?? {}));
  if (!valid.size) {
    for (let bz = 0; bz < (city?.blocksZ ?? 0); bz += 1) {
      for (let bx = 0; bx < (city?.blocksX ?? 0); bx += 1) valid.add(`${bx},${bz}`);
    }
  }
  return Object.freeze([...new Set([...(state?.people?.order ?? [])].sort()
    .map((personId) => state.people.byId[personId])
    .filter((person) => person?.archetypeId === 'family')
    .map((person) => person.pendingOutcome?.blockId)
    .filter((blockId) => blockId && valid.has(String(blockId)))
    .map(String))].sort());
}

export function designBuildSynergyActive(city, state, parcelId) {
  const entities = [...state.people.order].sort()
    .map((id) => personEntity(city, state.people.byId[id], state.people, state))
    .filter((entity) => sameAnchor(entity.anchor, anchor('parcel', parcelId)));
  return resolvePairSynergies(entities)
    .some((match) => match.name === 'Design and build');
}
