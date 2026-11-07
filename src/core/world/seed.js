// District Deck — province seed derivation. Uses rng.js streams; do not rewrite rng.js.

import { hash32, stream } from '../rng.js';

const MAX_UINT32 = 0xffffffff;

export function citySeed(worldSeed, cityId) {
  if (!Number.isInteger(worldSeed) || worldSeed < 0 || worldSeed > MAX_UINT32) {
    throw new RangeError('worldSeed must be a uint32.');
  }
  if (typeof cityId !== 'string' || !cityId) {
    throw new TypeError('cityId must be a non-empty string.');
  }
  return hash32(`district-deck:world:${worldSeed}:city:${cityId}`);
}

export function worldStream(worldSeed, name) {
  if (!Number.isInteger(worldSeed) || worldSeed < 0 || worldSeed > MAX_UINT32) {
    throw new RangeError('worldSeed must be a uint32.');
  }
  return stream(worldSeed, `world:${name}`);
}
