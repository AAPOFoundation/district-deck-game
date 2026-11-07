// District Deck V3.70 L7 — the town square's news board.
//
// READ THIS BEFORE CHANGING ANYTHING HERE.
//
// The game is a static local page with no backend. There is no API key in this file and
// there never will be one, because a key in client-side code is a published key. There
// is also no third-party call at runtime: the client reads ONE local file,
// `src/core/townsquare-news.json`, and renders whatever it finds there.
//
// Refreshing that file is a separate, server-side job — `mvp/scripts/townsquare-refresh-news.mjs`
// — which is NOT part of the game bundle and is not imported from anywhere in `src/`.
// That script currently ships with its live call stubbed. Until an owner wires it, every
// item in the file is sample data, and this module refuses to let the UI pretend
// otherwise: `feedStatus()` reports `sample` whenever `live` is false or any item carries
// `sample: true`, and the UI is contractually required to show that banner.
//
// A feed that looks live and is not is worse than a feed that says it is sample data.

import { hash32 } from './rng.js';

export const NEWS_URL = new URL('./townsquare-news.json', import.meta.url).href;
export const NEWS_VERSION = 1;
export const REFRESH_SCRIPT = 'mvp/scripts/townsquare-refresh-news.mjs';

export const TAGS = Object.freeze([
  'rates', 'planning', 'construction', 'auction', 'heritage', 'transport', 'market',
]);

export const TAG_LABEL = Object.freeze({
  rates: 'Rates',
  planning: 'Planning',
  construction: 'Construction',
  auction: 'Auctions',
  heritage: 'Heritage',
  transport: 'Transport',
  market: 'Market',
});

export function emptyFeed(reason = 'The news board is bare.') {
  return {
    version: NEWS_VERSION,
    live: false,
    source: 'none',
    generated: null,
    daySeed: null,
    notice: reason,
    items: [],
  };
}

function cleanItem(raw, index) {
  const tags = Array.isArray(raw?.tags) ? raw.tags.filter((tag) => TAGS.includes(tag)) : [];
  /**
   * ONE predicate, computed first, then everything derived from it.
   *
   * r1 used two: `raw?.sample` decided whether to strip the URL and `raw?.sample !== false`
   * decided whether to stamp the item SAMPLE. An item with the flag OMITTED failed the
   * first and passed the second, so it was marked sample and kept its link — an invented
   * headline under a real masthead with a live Source anchor, which is precisely the shape
   * the comment above says this module exists to prevent. Latent in the shipped file
   * because all six items set the flag; live on any hand-edit or partial write, which is
   * the exact case the honest-half-refresh design was built for.
   */
  const sample = raw?.sample !== false;
  const handle = raw?.handle ? String(raw.handle) : '';
  return {
    id: String(raw?.id ?? `item-${index}`),
    outlet: String(raw?.outlet ?? 'Unattributed'),
    // A bare `@handle` on a feature whose brief is "news from x.com" is the single element
    // most likely to be read as a real account. While the item is sample, it says so.
    handle: handle && sample && !/\(in-game\)/.test(handle) ? `${handle} (in-game)` : handle,
    headline: String(raw?.headline ?? '').trim(),
    summary: String(raw?.summary ?? '').trim(),
    tags: tags.length ? tags : ['market'],
    // A sample item never carries a link, whatever the file says.
    url: sample ? null : (raw?.url ? String(raw.url) : null),
    sample,
  };
}

/** Validate and normalise a parsed news file. Never throws; a bad file becomes empty. */
export function parseFeed(raw) {
  if (!raw || typeof raw !== 'object') return emptyFeed('News file unreadable.');
  if (raw.version !== NEWS_VERSION) return emptyFeed('News file is a version this build does not read.');
  const items = Array.isArray(raw.items) ? raw.items : [];
  const cleaned = items.map(cleanItem).filter((item) => item.headline);
  return {
    version: NEWS_VERSION,
    live: raw.live === true,
    source: String(raw.source ?? 'sample'),
    generated: raw.generated ? String(raw.generated) : null,
    daySeed: raw.daySeed ? String(raw.daySeed) : null,
    notice: String(raw.notice ?? ''),
    items: cleaned,
  };
}

/**
 * The single source of truth for the banner. `live` requires BOTH the file's own flag
 * and every item being non-sample — so a half-refreshed file still reports honestly.
 */
export function feedStatus(feed) {
  if (!feed?.items?.length) {
    return {
      kind: 'empty',
      label: 'No news on the board',
      detail: `Nothing in the local news file. Run \`${REFRESH_SCRIPT}\` to fill it.`,
    };
  }
  const anySample = feed.items.some((item) => item.sample);
  if (!feed.live || anySample) {
    return {
      kind: 'sample',
      label: 'Sample data — not a live feed',
      detail: `These items are invented for the game and attributed to invented outlets. Refreshed by \`${REFRESH_SCRIPT}\`, whose live call is stubbed until an owner wires it.`,
    };
  }
  return {
    kind: 'live',
    label: `Refreshed ${feed.generated ?? 'today'}`,
    detail: `Written to the local news file by \`${REFRESH_SCRIPT}\`. The game itself makes no network call.`,
  };
}

/**
 * Fetch the local news file. Same-origin, no credentials, no third party. Any failure
 * returns an empty feed with a readable reason rather than throwing into the UI.
 */
export async function loadFeed(fetchImpl = globalThis.fetch, url = NEWS_URL) {
  if (typeof fetchImpl !== 'function') return emptyFeed('No fetch in this environment.');
  try {
    const response = await fetchImpl(url, { cache: 'no-cache', credentials: 'omit' });
    if (!response.ok) return emptyFeed(`News file returned ${response.status}.`);
    return parseFeed(await response.json());
  } catch (error) {
    return emptyFeed(`News file unreachable: ${error?.message ?? 'unknown error'}.`);
  }
}

export function itemsForTag(feed, tag) {
  if (!tag) return feed.items;
  return feed.items.filter((item) => item.tags.includes(tag));
}

export function tagsInFeed(feed) {
  const seen = new Set();
  for (const item of feed.items ?? []) for (const tag of item.tags) seen.add(tag);
  return TAGS.filter((tag) => seen.has(tag));
}

/** How many items a board carries on any one day. The file holds a larger pool. */
export const BOARD_SIZE = 6;
/** No more than this many items on one topic, or a quiet week is six rates stories. */
export const TAG_CEILING = 2;

/**
 * The day's board, drawn deterministically from the file's pool.
 *
 * "News renewed daily" was written into the file as a `daySeed` field that r1 parsed and
 * then read from nowhere: it varied no ordering, no selection and no content, so the same
 * six items rendered on every day forever. This is the missing half — the rotation itself,
 * against the sample corpus, needing no network and no key. The live fetch remains an owner
 * decision (key, host, cadence, and a key must never sit in a client bundle); the rotation
 * does not have to wait for it.
 *
 * Pure: same pool and same day key give the same board on every machine, which is what lets
 * a probe assert "yesterday and today differ" rather than a human squinting at two screens.
 */
export function boardForDay(feed, dayKey, size = BOARD_SIZE) {
  const items = feed?.items ?? [];
  if (items.length <= size) return items;
  const key = String(dayKey ?? '');
  const ordered = items
    .map((item) => ({ item, rank: hash32(`${key}:${item.id}`) }))
    .sort((a, b) => a.rank - b.rank || a.item.id.localeCompare(b.item.id))
    .map((row) => row.item);
  const picked = [];
  const perTag = new Map();
  const overflow = [];
  for (const item of ordered) {
    if (picked.length >= size) break;
    const crowded = item.tags.some((tag) => (perTag.get(tag) ?? 0) >= TAG_CEILING);
    if (crowded) { overflow.push(item); continue; }
    picked.push(item);
    for (const tag of item.tags) perTag.set(tag, (perTag.get(tag) ?? 0) + 1);
  }
  // The ceiling shapes the board; it never shrinks it below `size`.
  for (const item of overflow) {
    if (picked.length >= size) break;
    picked.push(item);
  }
  return picked;
}

/**
 * How stale the board is, in days, against a date the CALLER supplies. Time enters this
 * module through an argument — the same rule `dailySeed` follows in `format.js`.
 */
export function ageInDays(feed, now) {
  if (!feed?.generated || !(now instanceof Date)) return null;
  const then = Date.parse(feed.generated);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}
