// District Deck V3.00 — deterministic random.
// Framework §2. One PRNG, many named streams. No Math.random anywhere in core.

/** FNV-1a style 32-bit string hash. Stable across engines. */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, well-distributed, and identical on every engine. */
export function mulberry32(seedInt) {
  let a = seedInt >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A named stream. Two systems must never share one: adding a decorative roll
 * to `props` must not be able to shift anything drawn from `market`.
 */
export function stream(seed, name) {
  const next = mulberry32(hash32(`${seed}::${name}`));
  return {
    name,
    /** float in [0,1) */
    unit: next,
    /** integer in [min, max] inclusive */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** float in [min, max) */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** uniform pick */
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    /** weighted pick: items is [{ weight, ...}] */
    weighted(items) {
      let total = 0;
      for (const item of items) total += item.weight;
      let roll = next() * total;
      for (const item of items) {
        roll -= item.weight;
        if (roll < 0) return item;
      }
      return items[items.length - 1];
    },
    /** in-place deterministic Fisher-Yates */
    shuffle(list) {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

/** Basis-point arithmetic. All money stays integer. Framework §2.2 rule 2. */
export function applyBp(value, bp) {
  return Math.round((value * bp) / 10000);
}
