// District Deck V3.70 L7 — the town square's conversation.
//
// Offline by construction. There is no network call in this file and no possibility of
// one: the square talks to the game's own cast, who are authored here and in
// `src/core/storyline.js`, and every reply is chosen by hash from a written bank. It
// does not pretend to reach other humans, because it cannot and should not.
//
// Deterministic: reply choice is `hash32(castId : tag : dayKey : turn)`. The same day,
// the same topic and the same turn produce the same square on every machine, which is
// what makes it reviewable in a probe rather than only by eye.

import { hash32 } from './rng.js';
import { CHARACTER_PROFILES } from './storyline.js';
import { TAGS } from './townsquare-news.js';

/**
 * Aido is the one voice with no `CHARACTER_PROFILES` entry — he lives in
 * `src/ui/quarterly-bulletin.js` as "Aido, Chief of Staff", who keeps the minutes. His
 * identity is authored here rather than in storyline.js, which belongs to another lane.
 */
const AIDO = Object.freeze({
  name: 'Aido',
  shortName: 'Aido',
  title: 'Chief of Staff — keeps the minutes',
});

export const CAST = Object.freeze([
  {
    id: 'aido',
    profile: null,
    name: AIDO.name,
    shortName: AIDO.shortName,
    title: AIDO.title,
    accent: '#d8a24a',
    chairs: true,
  },
  {
    id: 'terry',
    profile: 'property-agent',
    accent: '#c9705a',
  },
  {
    id: 'wozza',
    profile: 'cheap-builder',
    accent: '#d8a24a',
  },
  {
    id: 'saskia',
    profile: 'architect',
    accent: '#6f96b8',
  },
  {
    id: 'vinh',
    profile: 'mortgage-broker',
    accent: '#6f96b8',
  },
  {
    id: 'petridis',
    profile: 'rival-developer',
    accent: '#8f6f9b',
  },
].map((row) => {
  const profile = row.profile ? CHARACTER_PROFILES[row.profile] : null;
  return Object.freeze({
    ...row,
    name: row.name ?? profile?.name ?? row.id,
    shortName: row.shortName ?? profile?.shortName ?? row.id,
    title: row.title ?? profile?.title ?? '',
    greeting: profile?.greeting ?? '',
  });
}));

export const CAST_BY_ID = Object.freeze(Object.fromEntries(CAST.map((row) => [row.id, row])));

/**
 * What each of them has an opinion about, and what that opinion sounds like. A character
 * with nothing to say on a topic is absent from that topic — Wozza does not hold forth
 * on the yield curve, and a square where everyone answers everything is a chorus.
 */
const LINES = Object.freeze({
  aido: {
    any: [
      'Noted, and minuted. I will put it against this quarter under "matters raised".',
      'I have no view. I have a record, which outlasts views.',
      'For the file: raised in the square, no resolution, no dissent recorded.',
    ],
    rates: [
      'The rate line moves the serviceability column and nothing else on our sheet moves with it. That is worth saying out loud before someone says otherwise.',
      'I have re-run the schedule at the stressed rate. The schedule survives. The confidence around it does not.',
    ],
    planning: [
      'Three of ours sit inside that overlay. I have flagged the lodgement dates rather than the outcomes, because dates are checkable and outcomes are opinion.',
      'The objection period is a calendar, not a debate. I keep the calendar.',
    ],
    auction: [
      'Clearance is a reported figure with an unreported denominator. I record it and I mark it as reported.',
      'Saturday goes in the minute as it happened, not as it was described on Sunday.',
    ],
    market: [
      'Every figure quoted in this square today is somebody\'s estimate. I am writing down whose.',
      'The ledger does not care what the mood is. Neither, on a good day, do we.',
    ],
    heritage: [
      'The overlay is a document with a boundary. Whether it is a good document is not a matter I can minute.',
      'Two of our applications sit inside the extension. I have written to nobody about it yet, on purpose.',
    ],
    transport: [
      'Route changes move footfall, and footfall shows up in retail rent about four quarters after the works finish. I have set a reminder rather than an expectation.',
      'The stop that gets removed is worth more attention than the two that get added.',
    ],
    construction: [
      'Variations arrive as a number and a sentence. I file the sentence, because the number changes.',
      'Programme slippage compounds quietly. I would rather report it early and be wrong than late and be right.',
    ],
  },

  terry: {
    any: [
      'Look, I\'ll say what everyone here is thinking and none of them will put their name to: the stock is thin and the buyers are not.',
      'You want my honest read? Two-thirds of what gets said in this square is a listing presentation with the price taken out.',
      'I count the biscuits and I count the buyers. Both numbers are down.',
    ],
    auction: [
      'Sixty-eight per cent clearance, and about a fifth of that is negotiated by Tuesday. The board says Saturday; the money says Tuesday.',
      'Passed in does not mean unsold, it means the vendor found out on a footpath instead of in an office.',
    ],
    market: [
      'The quotes are drifting within cooee of the truth, which happens twice a decade and never lasts.',
      'Every vendor in the inner north thinks their neighbour\'s result is their floor. It is their ceiling, and they find out on a Saturday.',
    ],
    rates: [
      'A rate hold does one thing to my Saturdays: it puts the underbidders back in the room. That is the whole mechanism.',
      'People say rates and mean confidence. They are not the same thing and only one of them shows up to an open.',
    ],
    heritage: [
      'An overlay knocks about eight per cent off what I can quote and adds about four weeks to the campaign. Then everyone tells me heritage adds value.',
      'I have sold three houses inside that overlay. Beautiful homes. Beautiful, immovable, permanently beautiful homes.',
    ],
    transport: [
      'Put a tram stop near a shopfront and the shopfront reprices before the rails are laid. I have watched it happen four times.',
      'The block that loses its parking loses two buyer types and gains one. On paper that is neutral. It is not neutral.',
    ],
  },

  wozza: {
    any: [
      'Mate. I build things. You lot talk about things. Both honest trades, only one of them\'s got a ute.',
      'I\'ve got a slab curing and an opinion, and only one of them\'s any good.',
      'Whatever\'s been decided in this square, I\'ll be the one holding the bar when it isn\'t.',
    ],
    construction: [
      'Timber\'s up again, so my quotes last a week now. I write them in pencil. The pencil\'s holding value better than the steel.',
      'Everyone\'s value-engineering. What that means on site is I take out the thing that stops the water and put in the thing that hides it.',
    ],
    planning: [
      'Council\'ll sit on that for a quarter and then ask for a shadow diagram they could\'ve asked for in week one. Ancient law.',
      'Every objection I\'ve ever read has been about a fence and pretended to be about character.',
    ],
    heritage: [
      'Heritage means I take the front off with a chisel instead of the bar. Same wall, four times the money, twice the sneezing.',
      'Found a bluestone cellar under a slab in Richmond once. Sold the bluestone, paid for the reno. That\'s the only heritage rebate that\'s ever worked.',
    ],
    transport: [
      'Works on the corridor means my trucks queue for forty minutes to do a twenty-minute pour. Concrete doesn\'t queue. Concrete goes off.',
      'They\'ll dig it, find something Victorian, and stop. Always do. Me and Daz have a running bet on which decade.',
    ],
    market: [
      'When the market\'s hot everyone wants it Tuesday. When it\'s not, everyone wants it cheap. Nobody\'s ever wanted it right.',
    ],
  },

  saskia: {
    any: [
      'This square talks about buildings the way people talk about weather. As something that happens to them.',
      'I will say the unpopular thing, because somebody has paid for the hour: most of what gets built here is a spreadsheet with a facade attached.',
      'You may quote me. People generally do, slightly wrong.',
    ],
    planning: [
      'The objection is about overshadowing and the shadow falls on a car park. I have read the drawings. The car park will cope.',
      'A hearing decides whether a building is allowed. It has never once decided whether it is any good.',
    ],
    heritage: [
      'I could save that facade. The open question is whether it deserves saving. It knows what it did.',
      'An overlay drawn by a consultant who has never stood in the street is a boundary, not a judgement. Sometimes the boundary is right anyway.',
    ],
    construction: [
      'Your builder has value-engineered my void. There is now a room where the light used to be, and I am billing for the light.',
      'Timber going up does not change what the building should be. It changes what the client will admit to wanting.',
    ],
    transport: [
      'Move the stop and you move where people arrive from, which is the only thing that decides where a front door belongs.',
      'A corridor is not a line on a map. It is a decision about which side of the street gets the morning.',
    ],
    market: [
      'The market rewards floor area and punishes section. That is the whole explanation for the last twenty years.',
    ],
  },

  vinh: {
    any: [
      'I have already run your numbers. They told me everything, including two things you have not.',
      'Everyone in this square is describing a feeling. I can price a feeling, but it costs more.',
      'Calm is not optimism. Calm is having read the schedule.',
    ],
    rates: [
      'A hold is not relief. Half the fixed book from the boom rolls off this year regardless, and it rolls off at today\'s rate, not today\'s mood.',
      'Serviceability looks fine until you run the DTI at the stressed rate. Then it looks like a letter from the bank.',
    ],
    market: [
      'Three lenders repriced overnight and told their own staff afterwards. In this industry that counts as forward guidance.',
      'Volume up, credit flat. One of those two is lying and it is never volume.',
    ],
    auction: [
      'A result above reserve tells you about the reserve. It tells you almost nothing about the valuation, and the valuer agrees with me.',
      'The bank\'s valuer drove past at night, in the rain, and felt nothing. There is an appeals process. It is also a man in a car.',
    ],
    construction: [
      'Cost escalation lands on the lender before it lands on the builder. Progress draws are the tell — watch them, not the invoices.',
      'A variation is a re-underwrite that nobody calls a re-underwrite.',
    ],
    planning: [
      'A permit is worth about eleven per cent of a site\'s value and the whole of its financeability. Those are different numbers doing different jobs.',
    ],
  },

  petridis: {
    any: [
      'Pleasant square, this. I have been coming here longer than most of the people in it.',
      'I do not dislike any of you. That is generally the misunderstanding.',
      'Hold. Extract. Exit. It is not poetry, which is why it keeps being true.',
    ],
    planning: [
      'The objection period is a cost, and costs can be scheduled. I schedule mine early.',
      'They asked my timeline at the hearing. I said I had been here since before the hearing. That was the timeline.',
    ],
    market: [
      'Everyone here is waiting for the market to tell them something. It has been telling you the same thing for two years.',
      'Scale is boring, which is exactly why it wins in a square full of interesting people.',
    ],
    rates: [
      'I borrow offshore. The rate you are all discussing is a domestic weather report I read for the entertainment.',
      'A rate cut helps you more than it helps me, and it will not help you enough. I say that kindly.',
    ],
    heritage: [
      'Heritage is a fine thing. I hold three heritage buildings and they yield surprisingly well.',
      'The overlay caught six applications. It did not catch mine, and I would like that observed rather than implied.',
    ],
    transport: [
      'The frontages along that route were assembled eighteen months ago. Confirmation is a formality with a press release attached.',
      'Everyone reads a route map as transport. It is a title map with a timetable printed over it.',
    ],
    auction: [
      'My people do not bid. They wait, and they call on Tuesday. It is cheaper and it is quieter.',
    ],
  },
});

/** Free-typed text is matched to topics by plain keyword. No model, no network. */
const KEYWORDS = Object.freeze({
  rates: ['rate', 'rates', 'interest', 'rba', 'cash rate', 'serviceability', 'dti', 'fixed', 'variable', 'repay'],
  planning: ['planning', 'permit', 'council', 'objection', 'hearing', 'overlay', 'zoning', 'tribunal', 'application'],
  construction: ['build', 'builder', 'construction', 'timber', 'steel', 'concrete', 'slab', 'trade', 'variation', 'materials', 'site'],
  auction: ['auction', 'clearance', 'reserve', 'bid', 'bidder', 'passed in', 'saturday', 'campaign'],
  heritage: ['heritage', 'facade', 'victorian', 'terrace', 'character', 'overlay', 'listed'],
  transport: ['tram', 'train', 'bus', 'stop', 'route', 'corridor', 'transport', 'parking', 'station'],
  market: ['market', 'price', 'prices', 'yield', 'value', 'rent', 'demand', 'supply', 'sell', 'buy'],
});

export function readTags(text) {
  const lower = String(text ?? '').toLowerCase();
  const hits = TAGS.filter((tag) => (KEYWORDS[tag] ?? []).some((word) => lower.includes(word)));
  return hits.length ? hits : [];
}

function bankFor(castId, tag) {
  const lines = LINES[castId];
  if (!lines) return [];
  if (tag && Array.isArray(lines[tag])) return lines[tag];
  return lines.any ?? [];
}

export function hasOpinion(castId, tag) {
  return Array.isArray(LINES[castId]?.[tag]);
}

/**
 * Who speaks to a topic, in a fixed order. Aido chairs and always closes; the rest are
 * ordered by hash so the same day gives the same square without the same person always
 * going first.
 */
export function speakersFor(tags, dayKey = '', limit = 3) {
  const topic = tags?.[0] ?? null;
  const opinionated = CAST.filter((row) => !row.chairs && hasOpinion(row.id, topic));
  const rest = CAST.filter((row) => !row.chairs && !opinionated.includes(row));
  // Shuffle WITHIN each group, then concatenate. Sorting the concatenation by hash was
  // the r1 bug: it let a bystander outrank the broker on a rates question, so the square
  // answered a lending question with a builder's shrug and the specialist never spoke.
  const byHash = (a, b) => {
    const ha = hash32(`${dayKey}:${topic}:${a.id}`);
    const hb = hash32(`${dayKey}:${topic}:${b.id}`);
    return ha - hb || a.id.localeCompare(b.id);
  };
  const ordered = [...opinionated.slice().sort(byHash), ...rest.slice().sort(byHash)];
  return ordered.slice(0, Math.max(1, limit));
}

/** One reply. Pure: same arguments, same sentence, on every machine. */
export function replyFrom({ castId, tags = [], dayKey = '', turn = 0 }) {
  const cast = CAST_BY_ID[castId];
  if (!cast) return null;
  const tag = tags.find((candidate) => hasOpinion(castId, candidate)) ?? null;
  const bank = bankFor(castId, tag);
  if (!bank.length) return null;
  const index = hash32(`${castId}:${tag ?? 'any'}:${dayKey}:${turn}`) % bank.length;
  return {
    castId,
    name: cast.name,
    shortName: cast.shortName,
    accent: cast.accent,
    tag,
    text: bank[index],
  };
}

/**
 * The square's answer to one thing the player said. Two or three voices, Aido last,
 * because the chair minutes what was said rather than adding to it.
 */
export function respond({ text, tags = [], dayKey = '', turn = 0, voices = 3 }) {
  const topics = tags.length ? tags : readTags(text);
  const speakers = speakersFor(topics, dayKey, Math.max(1, voices - 1));
  const replies = speakers
    .map((cast, i) => replyFrom({ castId: cast.id, tags: topics, dayKey, turn: turn * 10 + i }))
    .filter(Boolean);
  const chair = replyFrom({ castId: 'aido', tags: topics, dayKey, turn: turn * 10 + 9 });
  if (chair) replies.push(chair);
  return { topics, replies };
}

/**
 * Aido opens the square with what is actually true about the run. Reads state; writes
 * nothing. `quarter`, `season` and `grade` come from the caller.
 */
export function openingPost({ quarter = 1, season = 'autumn', grade = null, holdings = 0, feedStatusKind = 'sample' }) {
  const seasonLine = {
    autumn: 'The planes are turning and the auction results read like form guides.',
    winter: 'Four o\'clock darkness and heaters in the auction rooms. The city is negotiating.',
    spring: 'Blossom on the median strips and sixty auctions a Saturday.',
    summer: 'Heat shimmer on the tram lines and cranes stacked against a white sky.',
  }[season] ?? '';
  const holdingLine = holdings > 0
    ? `We hold ${holdings} title${holdings === 1 ? '' : 's'} going into this one.`
    : 'We hold nothing yet, which is a position, if a quiet one.';
  const feedLine = feedStatusKind === 'live'
    ? 'The board has today\'s news on it.'
    : 'The board is carrying sample items — nobody has wired a live feed to this square yet, and I would rather say so than let you read it as news.';
  return {
    castId: 'aido',
    name: AIDO.name,
    shortName: AIDO.shortName,
    accent: '#d8a24a',
    tag: null,
    text: `Quarter ${quarter}. ${seasonLine} ${holdingLine}${grade ? ` Grade ${grade}.` : ''} ${feedLine}`.replace(/\s+/g, ' ').trim(),
  };
}

/** Prompts the player can press instead of typing. Each is a real topic, not filler. */
export const PROMPTS = Object.freeze([
  { id: 'rates', label: 'What do rates do to us?', tags: ['rates'] },
  { id: 'planning', label: 'Is the objection period survivable?', tags: ['planning'] },
  { id: 'auction', label: 'Read me Saturday.', tags: ['auction'] },
  { id: 'construction', label: 'What is the build actually costing?', tags: ['construction'] },
  { id: 'heritage', label: 'Does the overlay help or hurt?', tags: ['heritage'] },
  { id: 'transport', label: 'Does the corridor change anything?', tags: ['transport'] },
]);
