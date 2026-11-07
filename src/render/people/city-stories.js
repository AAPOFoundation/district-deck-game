// District Deck H-LIFE — deterministic street stories.
//
// "RAG" here is Retrieval–Assignment–Graph, not a network model:
//   Retrieve an authored day from the book,
//   Assign it by seed hash of the person id,
//   Graph the day's places in order.
// Presentation only. No Math.random. No sim-state writes.
//
// Salt 850–899 so this lane cannot re-roll figure / ambient variation.

export const STORY_SALT = 850;
export const DAY_SECONDS = 96;

function hash32(text) {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

function unit(id, salt) {
  return hash32(`${id}|story|${salt}`) / 0x100000000;
}

/**
 * Authored days. `career` is a visual role the walker can grow into after day 0.
 * Beats are place ids resolved against the live city catalog.
 */
export const STORY_BOOK = Object.freeze([
  Object.freeze({
    id: 'commuter',
    title: 'Commuter',
    career: null,
    beats: Object.freeze(['home', 'tram', 'work', 'cafe', 'tram', 'home']),
  }),
  Object.freeze({
    id: 'designer-hopeful',
    title: 'Designer',
    career: 'architect',
    beats: Object.freeze(['home', 'cafe', 'exchange', 'reserve', 'cafe', 'home']),
  }),
  Object.freeze({
    id: 'developer-hopeful',
    title: 'Developer',
    career: 'rival-developer',
    beats: Object.freeze(['home', 'site', 'exchange', 'tram', 'site', 'home']),
  }),
  Object.freeze({
    id: 'tradie',
    title: 'Tradie',
    career: 'cheap-builder',
    beats: Object.freeze(['home', 'site', 'cafe', 'site', 'tram', 'home']),
  }),
  Object.freeze({
    id: 'sales-day',
    title: 'Agent',
    career: 'property-agent',
    beats: Object.freeze(['home', 'shop', 'parcel', 'cafe', 'shop', 'home']),
  }),
  Object.freeze({
    id: 'broker-day',
    title: 'Broker',
    career: 'mortgage-broker',
    beats: Object.freeze(['home', 'cafe', 'exchange', 'cafe', 'home']),
  }),
  Object.freeze({
    id: 'family-park',
    title: 'Family',
    career: 'family',
    beats: Object.freeze(['home', 'reserve', 'shop', 'reserve', 'home']),
  }),
  Object.freeze({
    id: 'beach-day',
    title: 'Beach',
    career: null,
    beats: Object.freeze(['home', 'stairs', 'beach', 'look-sea', 'stairs', 'home']),
  }),
  Object.freeze({
    id: 'promenade',
    title: 'Promenade',
    career: null,
    beats: Object.freeze(['promenade', 'look-sea', 'stairs', 'beach', 'stairs', 'promenade']),
  }),
  Object.freeze({
    id: 'student',
    title: 'Student',
    career: 'architect',
    beats: Object.freeze(['home', 'school', 'reserve', 'shop', 'tram', 'home']),
  }),
  Object.freeze({
    id: 'lifeguard',
    title: 'Lookout',
    career: null,
    beats: Object.freeze(['stairs', 'beach', 'look-sea', 'beach', 'stairs']),
  }),
  Object.freeze({
    id: 'shop-run',
    title: 'Errand',
    career: null,
    beats: Object.freeze(['home', 'shop', 'cafe', 'shop', 'home']),
  }),
  Object.freeze({
    id: 'barista-day',
    title: 'Barista',
    career: 'architect',
    beats: Object.freeze(['home', 'cafe', 'cafe', 'shop', 'cafe', 'home']),
  }),
  Object.freeze({
    id: 'courier-day',
    title: 'Courier',
    career: null,
    beats: Object.freeze(['home', 'shop', 'tram', 'exchange', 'shop', 'home']),
  }),
]);

const BOOK_BY_ID = Object.freeze(Object.fromEntries(
  STORY_BOOK.map((row) => [row.id, row]),
));

const ZONE_PREF = Object.freeze({
  beach: Object.freeze(['beach-day', 'lifeguard', 'promenade']),
  promenade: Object.freeze(['promenade', 'beach-day', 'commuter']),
  reserve: Object.freeze(['family-park', 'student', 'designer-hopeful']),
  street: Object.freeze([
    'commuter', 'tradie', 'designer-hopeful', 'developer-hopeful',
    'sales-day', 'broker-day', 'shop-run', 'student',
    'barista-day', 'courier-day',
  ]),
});

const CAST_STORY = Object.freeze({
  'cheap-builder': 'tradie',
  architect: 'designer-hopeful',
  'rival-developer': 'developer-hopeful',
  'property-agent': 'sales-day',
  'mortgage-broker': 'broker-day',
  family: 'family-park',
  policeman: 'commuter',
  avatar: 'commuter',
});

export function storyById(id) {
  return BOOK_BY_ID[id] ?? STORY_BOOK[0];
}

/**
 * Retrieve a story for this person. Zone and archetype bias the book;
 * the hash chooses inside that slice so two neighbours are not the same day.
 */
export function retrieveStory(personId, {
  seed = 'DD',
  zone = 'street',
  archetypeId = null,
} = {}) {
  const forced = CAST_STORY[archetypeId];
  const pool = forced
    ? [forced]
    : (ZONE_PREF[zone] ?? ZONE_PREF.street);
  const pick = Math.floor(unit(`${seed}|${personId}`, STORY_SALT) * pool.length);
  const id = pool[Math.min(pool.length - 1, pick)];
  const row = storyById(id);
  return {
    id: row.id,
    title: row.title,
    career: row.career,
    beats: row.beats,
    personId,
    seed,
  };
}

export function dayIndex(clock) {
  return Math.floor(Math.max(0, clock) / DAY_SECONDS);
}

export function dayPhase(clock) {
  const t = ((clock % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
  return t / DAY_SECONDS;
}

/**
 * Clock that lands in a given beat. `local` 0 is the start of travel,
 * 0.5 is arrival, 0.75 is a dwell that a plate can read.
 */
export function clockAtBeat(story, beatIndex, local = 0.75, day = 0) {
  const n = (story?.beats ?? STORY_BOOK[0].beats).length;
  const idx = Math.max(0, Math.min(n - 1, Math.floor(beatIndex)));
  const u = Math.max(0, Math.min(1, local));
  return day * DAY_SECONDS + ((idx + u) / n) * DAY_SECONDS;
}

export function beatIndexOf(story, placeId) {
  const beats = story?.beats ?? [];
  const idx = beats.indexOf(placeId);
  return idx < 0 ? 0 : idx;
}

/**
 * Which beat of the day, and how far through it.
 * Travel occupies the first half of a beat; dwell the second.
 */
export function storyBeat(story, clock) {
  const beats = story?.beats ?? STORY_BOOK[0].beats;
  const n = beats.length;
  const u = dayPhase(clock) * n;
  const index = Math.min(n - 1, Math.floor(u));
  const local = u - index;
  const prevIndex = (index + n - 1) % n;
  return {
    index,
    local,
    from: beats[prevIndex],
    to: beats[index],
    traveling: local < 0.5,
    alpha: local < 0.5 ? local * 2 : 1,
    day: dayIndex(clock),
  };
}

/**
 * After the first full day a hopeful dresses as their career.
 * Day 0 they are still becoming.
 */
export function careerNow(story, clock) {
  if (!story?.career) return null;
  return dayIndex(clock) >= 1 ? story.career : null;
}

export function storyLine(story, clock) {
  const beat = storyBeat(story, clock);
  const grown = careerNow(story, clock);
  const role = grown ?? story.title;
  if (beat.traveling) return `${role} · ${beat.from} → ${beat.to}`;
  return `${role} · ${beat.to}`;
}

/** Dwell verb a plate can name. Travel stays an errand. */
export function dwellAction(story, clock) {
  const beat = storyBeat(story, clock);
  if (beat.traveling) return 'errand';
  if (beat.to === 'cafe' || beat.to === 'reserve' || beat.to === 'shop') return `at-${beat.to}`;
  if (beat.to === 'site' || beat.to === 'work') return 'work';
  if (beat.to === 'look-sea') return 'look-sea';
  if (beat.to === 'tram') return 'wait';
  if (beat.to === 'stairs' || beat.to === 'beach') return 'wander';
  return `at-${beat.to}`;
}

export function tallyStories(actors) {
  const counts = {};
  for (const actor of actors ?? []) {
    const id = actor.story?.id;
    if (!id) continue;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}
