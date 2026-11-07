import { validateRoomEconomyVersion } from '../core/room-economy-lifecycle.js';
import { validateCybercabEconomyVersion } from '../core/cybercab.js';
import { validateSellerFeeVersion } from '../core/seller-fee-contract.js';
import { validateCybercabFundingVersion } from '../core/cybercab-funding.js';
// District Deck V3.05 B7 — landing, seed and local-save edge.
// B8 superseded the small run-start/replay bridge here when the seat schema landed.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createCity } from '../core/city.js';
import { BLOCK, CORRIDOR, PITCH, ROAD, TILE, STOREY, SETBACK } from '../core/grid.js';
import {
  canonicalJson, deserialiseState, serialise, STATE_VERSION, validateSeats,
} from '../core/state.js';
import { ARCHETYPES, OPERATORS, SIM_REVISION } from '../core/content.js';
import { LANDING_TAGLINES, landingTagline, operatorChoices } from '../core/rule-calls.js';
import { liveOperatorDifferenceLabels } from './operator-choice.js';
import { hash32 } from '../core/rng.js';
import { recoverRepairTransaction } from '../core/repair-journal.js';
import { AssetRegistry } from '../render/assets.js';
import { Board } from '../render/board.js';
import { familyInstanceTint } from '../render/materials.js';
import { LightingRig, sunDirection } from '../render/lighting.js';
import { SkyDome } from '../render/sky.js';
import { PostChain, grade3HemisphereScale } from '../render/post.js';
import { P1_LIGHT, P23_LIGHT_PHOTO, r9LightColor } from '../render/v4-p1-polish.js';
import { WaterSurface } from '../render/water.js';
import { FoliageLayer } from '../render/foliage.js';
import { TrafficLayer } from '../render/traffic.js';
import { PeopleLayer } from '../render/people.js';
import { AmbientLifeLayer } from '../render/ambient-life.js';
import { collectRoadUsers } from '../render/people/city-physics.js';
import { LANDING_CAMERA_BEATS } from './landing-camera-beats.js';

const LANDING_LOOP_SECONDS = 45;

export const LAST_RUN_KEY = 'district-deck:v305:last-run';
export const MODE_KEY = 'district-deck:v305:selected-mode';
export const SAVE_PROTOCOL = 'district-deck-save';
export const DEFAULT_SEED = 0;
export const MAX_UINT32 = 0xffffffff;
export const LANDING_DISPLAY_SEED = hash32('district-deck:landing:v305');

/** Solo AI developer personas (policy rival). Display names match the in-game Rival rail. */
export const PERSONAS = Object.freeze([
  {
    displayName: 'Value',
    policyId: 'yieldSeeker',
    currentRivalPolicyId: 'value',
    tendency: 'AI developer · highest yield · holds for rent',
  },
  {
    displayName: 'Momentum',
    policyId: 'developer',
    currentRivalPolicyId: 'momentum',
    tendency: 'AI developer · chases sector forecast · pays for growth',
  },
  {
    displayName: 'Civic',
    policyId: 'corridor',
    currentRivalPolicyId: 'civic',
    tendency: 'AI developer · tram corridors · adjacency compounds',
  },
]);

const PERSONA_BY_ID = Object.fromEntries(PERSONAS.map((persona) => [persona.policyId, persona]));
const OPERATOR_BY_ID = Object.fromEntries(OPERATORS.map((operator) => [operator.id, operator]));
export const DEFAULT_OPERATOR_ID = 'underwriter';

/**
 * The original wrapper lived in main.js. B7 needs the same guarded edge on both routes,
 * so it moves here without changing its deliberately small get/set/remove contract.
 */
export const browserStore = {
  get(key) {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  },
  set(key, value) {
    try { globalThis.localStorage?.setItem(key, value); return true; } catch { return false; }
  },
  remove(key) {
    try { globalThis.localStorage?.removeItem(key); } catch { /* optional storage */ }
  },
};

/** Recheck after recovery: an old invalid-save dialog must not delete a recovered run. */
export function discardInvalidLocalRun(storage) {
  const recovery = recoverRepairTransaction(storage);
  if (!recovery.ok) return recovery;
  if (inspectLocalRun(storage.get(LAST_RUN_KEY)).status === 'valid') {
    return { ok: false, reason: 'A valid city save is available. Reload to continue it.' };
  }
  storage.remove(LAST_RUN_KEY);
  return { ok: true };
}

export function parseExplicitSeed(raw, defaultSeed = DEFAULT_SEED) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: true, seed: defaultSeed, blank: true, error: '' };
  if (!/^\d+$/.test(text)) {
    return {
      ok: false,
      seed: null,
      blank: false,
      error: 'Enter a whole number from 0 to 4294967295.',
    };
  }
  const seed = Number(text);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > MAX_UINT32) {
    return {
      ok: false,
      seed: null,
      blank: false,
      error: 'Seed must be between 0 and 4294967295.',
    };
  }
  return { ok: true, seed, blank: false, error: '' };
}

export function isSeedStamp(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

export function dailySeedFromStamp(seedStamp) {
  if (!isSeedStamp(seedStamp)) throw new RangeError('Daily seed stamp must be YYYY-MM-DD.');
  return hash32(`district-deck:daily:${seedStamp}`);
}

/** The Date is supplied by the button handler; the pure daily helper never reads a clock. */
export function utcSeedStamp(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function seedSelectionFromParams(search) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const parsed = parseExplicitSeed(params.get('seed'));
  const seed = parsed.ok ? parsed.seed : DEFAULT_SEED;
  const stamp = params.get('daily');
  const daily = isSeedStamp(stamp) && dailySeedFromStamp(stamp) === seed;
  return {
    seed,
    seedSource: daily ? 'daily' : 'explicit',
    seedStamp: daily ? stamp : null,
  };
}

function selectableOperatorId(id) {
  return operatorChoices(OPERATORS).find(operator => operator.id === id && operator.selectable)?.id
    ?? DEFAULT_OPERATOR_ID;
}

export function currentRivalPolicyId(policyId) {
  if (OPERATOR_BY_ID[policyId]) return `operator:${selectableOperatorId(policyId)}`;
  return PERSONA_BY_ID[policyId]?.currentRivalPolicyId ?? PERSONAS[0].currentRivalPolicyId;
}

export function createRunStartRecord({
  seed,
  seedSource,
  seedStamp = null,
  mode = 'solo',
  seats,
  operatorId = seats?.runStartEconomy?.operatorId,
  openingCash = seats?.runStartEconomy?.openingCash,
  roomEconomyVersion,
  cybercabEconomyVersion,
  sellerFeeVersion,
  cybercabFundingVersion,
}) {
  validateRoomEconomyVersion(roomEconomyVersion);
  validateCybercabEconomyVersion(cybercabEconomyVersion);
  validateSellerFeeVersion(sellerFeeVersion);
  validateCybercabFundingVersion(cybercabFundingVersion);
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_UINT32) {
    throw new RangeError('Run-start seed must be an unsigned 32-bit integer.');
  }
  if (!['explicit', 'daily', 'correspondence'].includes(seedSource)) {
    throw new RangeError('Run-start source must be explicit, daily or correspondence.');
  }
  if (seedSource === 'daily') {
    if (!isSeedStamp(seedStamp) || dailySeedFromStamp(seedStamp) !== seed) {
      throw new RangeError('Daily run-start metadata does not match its seed.');
    }
  } else if (seedStamp !== null) {
    throw new RangeError('Non-daily run-start metadata cannot contain a daily stamp.');
  }
  if (!['solo', 'hotseat', 'correspondence'].includes(mode)) {
    throw new RangeError('Unsupported run mode.');
  }
  const canonicalSeats = validateSeats(seats, { mode });
  if (!OPERATOR_BY_ID[operatorId]) throw new RangeError('Run-start operator is not supported.');
  if (!Number.isInteger(openingCash) || openingCash <= 0) {
    throw new RangeError('Run-start opening cash must be a positive integer.');
  }
  return {
    type: 'run-start',
    ...(roomEconomyVersion === 2 ? { roomEconomyVersion: 2 } : {}),
    ...(cybercabEconomyVersion === 2 ? { cybercabEconomyVersion: 2 } : {}),
    ...(sellerFeeVersion === 1 ? { sellerFeeVersion: 1 } : {}),
    ...(cybercabFundingVersion === 1 ? { cybercabFundingVersion: 1 } : {}),
    seatId: 'SYSTEM',
    seed,
    seedSource,
    seedStamp,
    mode,
    operatorId,
    openingCash,
    seats: canonicalSeats,
  };
}

export function checksumCanonicalState(canonicalState) {
  return hash32(canonicalState).toString(16);
}

export function createLocalRunEnvelope(state, savedAtEdge) {
  const canonicalState = serialise(state);
  return {
    protocol: SAVE_PROTOCOL,
    stateVersion: STATE_VERSION,
    simRevision: SIM_REVISION,
    savedAtEdge,
    canonicalState,
    checksum: checksumCanonicalState(canonicalState),
  };
}

function requireRunStart(parsed) {
  const first = parsed?.log?.[0];
  if (!first || first.type !== 'run-start') throw new Error('The first log record is not run-start.');
  const expected = createRunStartRecord(first);
  if (canonicalJson(first) !== canonicalJson(expected)) {
    throw new Error('The run-start record contains unsupported fields.');
  }
  if (parsed.roomEconomyVersion !== first.roomEconomyVersion) throw new Error('Run-start room economy mismatch.');
  if (parsed.sellerFeeVersion !== first.sellerFeeVersion) throw new Error('Run-start seller fee mismatch.');
  if (parsed.cybercabFundingVersion !== first.cybercabFundingVersion) throw new Error('Run-start cybercab funding mismatch.');
  if (parsed.seed !== first.seed) throw new Error('The run seed and run-start seed differ.');
  if (parsed.operatorId !== first.operatorId) {
    throw new Error('The run operator and run-start operator differ.');
  }
  if (parsed.openingCash !== first.openingCash) {
    throw new Error('The run opening cash and run-start opening cash differ.');
  }
  return first;
}

export function deserialiseCanonicalRun(canonicalState) {
  if (typeof canonicalState !== 'string') throw new TypeError('Canonical state must be a string.');
  const parsed = JSON.parse(canonicalState);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Canonical state must contain one state object.');
  }
  const city = createCity({ seed: parsed.seed });
  const state = deserialiseState(canonicalState, { city });
  const runStart = requireRunStart(state);
  return { city, state, runStart };
}

export function inspectLocalRun(rawEnvelope) {
  if (rawEnvelope === null || rawEnvelope === undefined || rawEnvelope === '') {
    return { status: 'missing', reason: '', envelope: null };
  }
  let envelope;
  try {
    envelope = typeof rawEnvelope === 'string' ? JSON.parse(rawEnvelope) : rawEnvelope;
  } catch {
    return { status: 'invalid', reason: 'The saved envelope is not valid JSON.', envelope: null };
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return { status: 'invalid', reason: 'The saved envelope is not an object.', envelope };
  }
  if (envelope.protocol !== SAVE_PROTOCOL) {
    return { status: 'invalid', reason: 'The save protocol is not supported.', envelope };
  }
  if (envelope.stateVersion !== STATE_VERSION) {
    return {
      status: 'invalid',
      reason: `The save uses state version ${String(envelope.stateVersion)}; this build supports ${STATE_VERSION}.`,
      envelope,
    };
  }
  if (envelope.simRevision !== SIM_REVISION) {
    return {
      status: 'invalid',
      reason: `The save uses simulation revision ${String(envelope.simRevision)}; this build supports ${SIM_REVISION}.`,
      envelope,
    };
  }
  if (typeof envelope.savedAtEdge !== 'string' || typeof envelope.canonicalState !== 'string') {
    return { status: 'invalid', reason: 'The save metadata is incomplete.', envelope };
  }
  if (envelope.checksum !== checksumCanonicalState(envelope.canonicalState)) {
    return { status: 'invalid', reason: 'The save checksum does not match its state bytes.', envelope };
  }
  try {
    const restored = deserialiseCanonicalRun(envelope.canonicalState);
    return { status: 'valid', reason: '', envelope, ...restored };
  } catch (error) {
    return {
      status: 'invalid',
      reason: `The saved state could not be restored: ${error.message}`,
      envelope,
    };
  }
}

export function buildPlayUrl({
  seed,
  seedSource = 'explicit',
  seedStamp = null,
  policyId = PERSONAS[0].policyId,
  operatorId = null,
  mode = 'solo',
  continueRun = false,
} = {}) {
  const params = new URLSearchParams();
  params.set('seed', String(seed));
  if (seedSource === 'daily') params.set('daily', seedStamp);
  params.set('mode', mode);
  if (!continueRun && operatorId !== null) {
    const selectedOperatorId = seedSource === 'daily' || mode === 'campaign'
      ? DEFAULT_OPERATOR_ID
      : selectableOperatorId(operatorId);
    params.set('operatorId', selectedOperatorId);
    // main.js's pre-W0 bridge reads `persona`; carry the operator through that existing edge.
    params.set('persona', selectedOperatorId);
  } else if (!continueRun) {
    params.set('persona', PERSONA_BY_ID[policyId] ? policyId : PERSONAS[0].policyId);
  }
  if (continueRun) params.set('continue', '1');
  return `./play.html?${params.toString()}`;
}

const OPERATOR_TILES = Object.freeze({
  underwriter: 'assets/img/people/operators/underwriter-portrait.png',
  auctioneer: 'assets/img/people/operators/auctioneer-portrait.png',
  builder: 'assets/img/people/operators/builder-portrait.png',
  'heritage-trust': 'assets/img/people/operators/heritage-trust-portrait.png',
  syndicate: 'assets/img/people/operators/syndicate-portrait.png',
  liquidator: 'assets/img/people/operators/liquidator-portrait.png',
  planner: 'assets/img/people/operators/planner-portrait.png',
  absentee: 'assets/img/people/operators/absentee-portrait.png',
});

function operatorInitials(name) {
  return String(name ?? '')
    .replace(/^The\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '·';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** COPY-DRAFT: Later plates identify visible operators without a live ability. */
export function operatorCardsHtml(setting) {
  const choices = operatorChoices(OPERATORS, setting);
  const firstSelectable = choices.find(operator => operator.selectable)?.id;
  return choices.map(({ id, selectable }) => {
    const operator = OPERATOR_BY_ID[id];
    const cash = `${(operator.cashMultipleBp / 10_000).toFixed(2)}×`;
    const initials = operatorInitials(operator.name);
    const tile = OPERATOR_TILES[operator.id];
    const shortName = String(operator.name ?? '').replace(/^The\s+/i, '');
    const register = operator.register || '';
    const difference = liveOperatorDifferenceLabels(operator).join(' · ');
    const face = tile
      ? `<img src="${tile}" alt="" width="160" height="214">`
      : `<span class="landing-operator__initials">${initials}</span>`;
    return `
      <label class="landing-operator${selectable ? '' : ' landing-operator--later'}" title="${escapeHtml(register)}">
        <input type="radio" name="operator" value="${operator.id}"${id === firstSelectable ? ' checked' : ''}${selectable ? '' : ' disabled data-later'}>
        <span class="landing-operator__face">${face}</span>
        <strong>${escapeHtml(shortName)}</strong>
        ${selectable ? '' : '<span class="landing-operator__later">Later</span>'}
        ${register ? `<span class="landing-operator__register">${escapeHtml(register)}</span>` : ''}
        <small>${cash} cash</small>
        ${difference ? `<span class="landing-operator__diff">${escapeHtml(difference).replace(/\//g, '/<wbr>')}</span>` : ''}
      </label>`;
  }).join('');
}

function mountOperatorCards(field) {
  if (!field) return;
  const heading = field.querySelector('legend');
  if (heading) heading.textContent = 'Choose your operator';
  const grid = field.querySelector('.persona-grid, .landing-operators');
  if (!grid) return;
  grid.classList.add('landing-operators');
  grid.innerHTML = operatorCardsHtml();
  grid.querySelectorAll('img').forEach((img) => {
    img.addEventListener('error', () => {
      const label = img.closest('.landing-operator');
      const id = label?.querySelector('input')?.value;
      const operator = OPERATORS.find((item) => item.id === id);
      img.replaceWith(Object.assign(document.createElement('span'), {
        className: 'landing-operator__initials',
        textContent: operatorInitials(operator?.name),
      }));
    }, { once: true });
  });
}

const LANDING_CITY = Object.freeze({ blocksX: 3, blocksZ: 4 });
const LANDING_HAZE = '#6a8aaa';
const LANDING_HAZE_RGB = Object.freeze([0x6a, 0x8a, 0xaa]);
const LANDING_TIME_OF_DAY = 0.42;

/**
 * P2D-ROAD landing fix: the clear-weather light finish SceneView gives play (scene.js `_applyAtmosphereLights`
 * and the dry branch of `_applyPhotoShadow`), applied to the landing's own LightingRig. Without it the landing
 * kept the rig's raw profile: a key shadow at full strength (three's default 1, where play leaves 27% of the
 * warm key in shade, P23_LIGHT_PHOTO.shadowIntensity 0.73) and the punchy zenith blue on the sky and fill
 * lamps (play trims them with r9LightColor and pulls their chroma toward grey by SHADOW_TINT_CLOUD 0.45).
 * The landing's street sits in cast shadow at its boot pose, so the city road (albedo about 0.025 linear)
 * was lit by blue alone and drew navy (median S 100, R channel 14/255). The sun's elevation and azimuth stay
 * the landing's own, so its composition and shadow shapes are unchanged; CSM, bias and weather are not copied.
 */
export const LANDING_SHADOW_TINT_CLOUD = 0.45; // scene.js SHADOW_TINT_CLOUD (phone-p2d-road.test.mjs pins it)
function landingOvercast(color, amount) {
  const y = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  color.r += (y - color.r) * amount;
  color.g += (y - color.g) * amount;
  color.b += (y - color.b) * amount;
}
export function applyLandingClearLightFinish(lighting) {
  const { key, fill, rim, bounce, skyFloor, profile } = lighting ?? {};
  if (!key || !fill || !rim || !bounce || !skyFloor || !profile) return false;
  r9LightColor(profile.keyColor, P23_LIGHT_PHOTO.keyRGB, key.color);
  key.intensity = profile.keyIntensity * P23_LIGHT_PHOTO.keyGain;
  fill.intensity = profile.fillIntensity * P23_LIGHT_PHOTO.fillGain;
  rim.intensity = profile.rimIntensity;
  bounce.intensity = profile.bounceIntensity;
  skyFloor.intensity = P1_LIGHT.skyFloorIntensity * P23_LIGHT_PHOTO.skyGain * grade3HemisphereScale();
  r9LightColor(profile.fillColor, P23_LIGHT_PHOTO.fillRGB, fill.color);
  r9LightColor(profile.skyColor, P23_LIGHT_PHOTO.fillRGB, skyFloor.color);
  r9LightColor(profile.groundColor, P23_LIGHT_PHOTO.hemisphereGroundRGB, skyFloor.groundColor);
  skyFloor.groundColor.multiplyScalar(P23_LIGHT_PHOTO.hemisphereGroundGain);
  rim.color.copy(profile.horizonColor);
  bounce.color.copy(profile.groundColor);
  for (const c of [fill.color, skyFloor.color, skyFloor.groundColor, rim.color, bounce.color]) {
    landingOvercast(c, LANDING_SHADOW_TINT_CLOUD);
  }
  if (key.shadow) key.shadow.intensity = P23_LIGHT_PHOTO.shadowIntensity;
  return true;
}
const LANDING_ENTRY_U = 0;
const MAX_CAM_Y = 26;
const MIN_CAM_Y = 4.5;
const MAX_PITCH_RAD = (22 * Math.PI) / 180;
const MIN_PITCH_RAD = (-4 * Math.PI) / 180;

const LANDING_MODERN_SWAPS = Object.freeze([
  { from: ['cottage-federation', 'bungalow-brighton'], to: 'house-modern-skillion' },
  { from: ['bungalow-californian', 'heritage-federation-villa'], to: 'house-modern-pavilion' },
  { from: ['terrace-single'], to: 'townhouse-modern-brick' },
  { from: ['terrace-double', 'terrace-carlton-heritage'], to: 'townhouse-modern-render' },
  { from: ['walkup-flats'], to: 'apartment-modern-courtyard' },
  { from: ['art-deco-flats'], to: 'apartment-modern-bar' },
]);

function canvasCssSize(canvas) {
  const box = canvas.getBoundingClientRect();
  const vv = globalThis.visualViewport;
  const width = Math.max(1, Math.round(
    box.width || canvas.clientWidth || vv?.width || globalThis.innerWidth || 1280,
  ));
  const height = Math.max(1, Math.round(
    box.height || canvas.clientHeight || vv?.height || globalThis.innerHeight || 800,
  ));
  return {
    width,
    height,
    rectW: box.width,
    rectH: box.height,
    clientW: canvas.clientWidth,
    clientH: canvas.clientHeight,
  };
}

function landingBootU(beats) {
  const i = beats.findIndex((beat) => beat.id === 'beat-02-terrace-hero');
  if (i <= 0) return LANDING_ENTRY_U;
  return i / beats.length;
}

function wantLandingNature({ software, portrait, search } = {}) {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(search ?? globalThis.location?.search ?? '');
  if (params.get('landingNature') === 'off') return false;
  if (software) return false;
  if (portrait && params.get('landingNature') !== 'on') return false;
  return true;
}

function restyleLandingParcels(city) {
  const used = new Set();
  const parcels = { ...city.parcels };
  const order = city.order ?? Object.keys(parcels);
  const swapped = [];
  for (const swap of LANDING_MODERN_SWAPS) {
    const arch = ARCHETYPES[swap.to];
    if (!arch) continue;
    const id = order.find((pid) => {
      if (used.has(pid)) return false;
      return swap.from.includes(parcels[pid]?.archetypeId);
    }) ?? order.find((pid) => {
      if (used.has(pid) || !parcels[pid]) return false;
      const cur = ARCHETYPES[parcels[pid].archetypeId];
      return cur?.sector === 'residential' && !String(parcels[pid].archetypeId).startsWith('shop');
    });
    if (!id) continue;
    used.add(id);
    const p = parcels[id];
    parcels[id] = {
      ...p,
      archetypeId: arch.id,
      landUseId: arch.id,
      sector: arch.sector,
      storeys: arch.storeys,
    };
    swapped.push({ id, from: p.archetypeId, to: arch.id, x: p.centre?.x, z: p.centre?.z });
  }
  const heroHits = swapped.filter((row) => (
    Number(row.x) >= 140 && Number(row.x) <= 176
    && Number(row.z) >= 48 && Number(row.z) <= 90
  ));
  if (!heroHits.length) {
    const extras = order.filter((pid) => {
      if (used.has(pid) || !parcels[pid]) return false;
      const x = parcels[pid].centre?.x;
      const z = parcels[pid].centre?.z;
      if (!(x >= 140 && x <= 176 && z >= 48 && z <= 90)) return false;
      return LANDING_MODERN_SWAPS.some((swap) => swap.from.includes(parcels[pid].archetypeId));
    }).slice(0, 8);
    for (const id of extras) {
      const p = parcels[id];
      const swap = LANDING_MODERN_SWAPS.find((row) => row.from.includes(p.archetypeId));
      const arch = ARCHETYPES[swap?.to];
      if (!arch) continue;
      used.add(id);
      parcels[id] = {
        ...p,
        archetypeId: arch.id,
        landUseId: arch.id,
        sector: arch.sector,
        storeys: arch.storeys,
      };
      swapped.push({ id, from: p.archetypeId, to: arch.id, x: p.centre?.x, z: p.centre?.z });
    }
  }
  return { city: { ...city, parcels }, swapped };
}

// The display city's two Beaux-Arts facades are authored smooth render and
// cast cement. Remove the district brick-family multiplier from those existing
// instance entries only; retain parcel drift, district chroma and every material.
function restoreLandingHeritageRender(board) {
  if (board?.city?.seed !== LANDING_DISPLAY_SEED) return 0;
  const color = new THREE.Color();
  let restored = 0;
  for (const [id, facade] of [['p1012', 0], ['p1022', 3]]) {
    const rec = board.staticBuildings?.get(id);
    if (rec?.archetypeId !== 'walkup-beaux-arts' || rec.districtId !== 'richmond-flat'
      || rec.facade !== facade || !rec.placement?.tint?.isColor) continue;
    const factor = familyInstanceTint('brick', id);
    const original = rec.placement.tint.toArray().map(Math.fround);
    if (![...factor.toArray(), ...original].every(v => Number.isFinite(v) && v > 0)) continue;
    const suffix = `walkup-beaux-arts-richmond-flat-f${facade}`;
    for (const mesh of rec.meshes ?? []) {
      const data = mesh.material?.userData;
      const family = data?.variant === `res-wall-${suffix}`
        || data?.variant === `res-wall-alt-${suffix}` ? 'render'
        : data?.variant === `res-trim-${suffix}` ? 'concrete' : null;
      if (!family || data.family !== family || !mesh.isInstancedMesh
        || !mesh.instanceColor || !Number.isInteger(rec.index)
        || rec.index < 0 || rec.index >= mesh.count) continue;
      mesh.getColorAt(rec.index, color);
      // A repeated call, or a later owner's tint, must never compound the division.
      if (!color.toArray().every((v, i) => v === original[i])) continue;
      color.setRGB(color.r / factor.r, color.g / factor.g, color.b / factor.b);
      mesh.setColorAt(rec.index, color);
      mesh.instanceColor.needsUpdate = true;
      restored++;
    }
  }
  return restored;
}

function addHorizonDressing(scene, city) {
  const haze = new THREE.Color(LANDING_HAZE);
  scene.fog = new THREE.Fog(haze, Math.max(city.extent.x, city.extent.z) * 3.2, Math.max(city.extent.x, city.extent.z) * 6.5);
}

function addLandingCloth(scene, city, groundColor) {
  const cx = city.extent.x / 2;
  const cz = city.extent.z / 2;
  const colour = groundColor ? groundColor.clone().multiplyScalar(0.55) : new THREE.Color('#5a6a48');
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(city.extent.x + 4, city.extent.z + 4),
    new THREE.MeshLambertMaterial({ color: colour }),
  );
  cloth.rotation.x = -Math.PI / 2;
  cloth.position.set(cx, -0.95, cz);
  cloth.name = 'ground:landing-cloth';
  scene.add(cloth);
  return cloth;
}

function makeGrainTexture(size, paint) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const a = Math.abs(Math.sin(x * 0.37 + y * 0.21));
      const b = Math.abs(Math.cos(x * 0.11 - y * 0.29));
      const t = (a * 0.55 + b * 0.45);
      const [r, g, bl] = paint(t);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = bl;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function dressFlightGround(scene, city) {
  const lawnTex = makeGrainTexture(64, (t) => [
    Math.round(96 + t * 28),
    Math.round(108 + t * 22),
    Math.round(58 + t * 16),
  ]);
  lawnTex.repeat.set(6, 6);
  const lawnMat = new THREE.MeshLambertMaterial({ map: lawnTex });
  const reserve = city.reserve;
  if (reserve?.bounds) {
    const w = reserve.bounds.maxX - reserve.bounds.minX;
    const d = reserve.bounds.maxZ - reserve.bounds.minZ;
    const lawn = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.8, d - 0.8),
      lawnMat,
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(reserve.centre.x, 0.28, reserve.centre.z);
    lawn.name = 'landing-reserve-tone';
    scene.add(lawn);
  }
}

function isLandingBuilding(obj) {
  let node = obj;
  while (node) {
    const name = `${node.name || ''}`;
    if (/^buildings:|^civic:|^opening:|rotunda/i.test(name)) return true;
    node = node.parent;
  }
  return false;
}

function landingFootpathSpots(city) {
  const spots = [];
  const vCount = (city.blocksX ?? 3) + 1;
  const hCount = (city.blocksZ ?? 4) + 1;
  for (let i = 0; i < vCount; i += 1) {
    const base = i * PITCH;
    for (const kerb of [CORRIDOR.footpathCentreLow, CORRIDOR.footpathCentreHigh]) {
      for (let s = 0; s < 6; s += 1) spots.push({ x: base + kerb, z: 20 + s * 32, yaw: 0 });
    }
  }
  for (let j = 0; j < hCount; j += 1) {
    const base = j * PITCH;
    for (const kerb of [CORRIDOR.footpathCentreLow, CORRIDOR.footpathCentreHigh]) {
      for (let s = 0; s < 5; s += 1) spots.push({ x: 20 + s * 36, z: base + kerb, yaw: Math.PI / 2 });
    }
  }
  const reserve = city.reserve?.centre;
  if (reserve) {
    spots.push(
      { x: reserve.x + 4.2, z: reserve.z + 3.1, yaw: 0.35 },
      { x: reserve.x - 5.1, z: reserve.z + 1.8, yaw: -0.7 },
      { x: reserve.x + 1.6, z: reserve.z - 4.4, yaw: 1.15 },
      { x: reserve.x - 2.4, z: reserve.z - 2.2, yaw: 2.4 },
    );
  }
  // Prefer the landing camera street: beats 1/5/6 and the t=18 crossing.
  const preferred = spots.filter((s) => s.x > 88 && s.x < 164 && s.z > 48 && s.z < 176);
  return preferred.length ? preferred : spots;
}

function placeLandingPedestrians(layer, city, salt) {
  const spots = landingFootpathSpots(city);
  const actors = layer.actors ?? [];
  // Pin people to the frames the loop actually looks at. Unique spots so the
  // honest count (clustered) matches the eye.
  const heroSpots = [
    { x: 154, z: 70, yaw: 0 },
    { x: 150, z: 66, yaw: 0 },
    { x: 148, z: 72, yaw: 0.08 },
    { x: 152, z: 62, yaw: 0 },
    { x: 146, z: 64, yaw: 0 },
    { x: 140, z: 88, yaw: 0 },
    { x: 144, z: 84, yaw: Math.PI / 2 },
    { x: 132, z: 86, yaw: Math.PI },
    { x: 128, z: 96, yaw: 0 },
    { x: 136, z: 90, yaw: 0 },
    { x: 130, z: 80, yaw: 0 },
    { x: 154, z: 128, yaw: 0 },
    { x: 150, z: 132, yaw: 0 },
    { x: 148, z: 124, yaw: 0 },
    { x: 100, z: 160, yaw: 0.4 },
    { x: 94, z: 166, yaw: -0.6 },
    { x: 108, z: 158, yaw: 1.1 },
    { x: 88, z: 170, yaw: 0.2 },
    { x: 112, z: 152, yaw: -1.2 },
    { x: 102, z: 166, yaw: 0.35, baseY: 1.18 },
    { x: 106, z: 170, yaw: -0.5, baseY: 1.18 },
    { x: 98, z: 172, yaw: 2.4, baseY: 1.18 },
    { x: 104, z: 164, yaw: 0.15, baseY: 1.18 },
    { x: 132, z: 118, yaw: 0 },
    { x: 138, z: 108, yaw: 0 },
    { x: 146, z: 110, yaw: 0 },
    { x: 150, z: 104, yaw: 0 },
    { x: 142, z: 118, yaw: Math.PI / 2 },
    { x: 148, z: 96, yaw: 0 },
    { x: 134, z: 124, yaw: 0 },
    { x: 152, z: 88, yaw: 0 },
    { x: 118, z: 148, yaw: 0.3 },
    { x: 124, z: 142, yaw: -0.4 },
    { x: 144, z: 130, yaw: 0 },
    { x: 138, z: 134, yaw: Math.PI / 2 },
    { x: 118, z: 164, yaw: 0.15 },
    { x: 124, z: 158, yaw: -0.2 },
    { x: 122, z: 150, yaw: 0.4 },
    { x: 128, z: 146, yaw: 0 },
    { x: 116, z: 172, yaw: 0.25 },
    { x: 130, z: 154, yaw: Math.PI / 2 },
    { x: 146, z: 136, yaw: 0 },
    { x: 152, z: 130, yaw: -0.3 },
    { x: 140, z: 142, yaw: 0.2 },
    { x: 134, z: 138, yaw: 0 },
  ];
  for (let i = 0; i < actors.length; i += 1) {
    const actor = actors[i];
    const hero = heroSpots[(i * 3 + salt * 7) % heroSpots.length];
    const pick = hero || spots[(hash32(`landing-ped:${salt}:${i}`) >>> 0) % spots.length];
    actor.kind = 'stroll';
    actor.lifeMode = 'idle';
    actor.x = pick.x;
    actor.z = pick.z;
    actor.yaw = pick.yaw;
    actor.baseY = pick.baseY ?? 0;
    actor.strollAmp = 0;
    actor.strollAxis = Math.abs(pick.yaw) < 0.2 || Math.abs(Math.abs(pick.yaw) - Math.PI) < 0.2 ? 'z' : 'x';
    actor.homeX = actor.x;
    actor.homeZ = actor.z;
    actor._lastX = actor.x;
    actor._lastZ = actor.z;
    actor._px = actor.x;
    actor._pz = actor.z;
  }
  paintLandingWardrobe(layer, salt);
  layer.update?.(0, 0);
}

const LANDING_WARDROBE = Object.freeze([
  { jacket: '#6b4330', lower: '#3a342c' },
  { jacket: '#4a4e52', lower: '#2c2822' },
  { jacket: '#7a5a32', lower: '#3d3428' },
  { jacket: '#5c4030', lower: '#2a2620' },
  { jacket: '#8a5340', lower: '#3c3228' },
  { jacket: '#4e4638', lower: '#2e2a24' },
]);

const LANDING_FLEET = Object.freeze([
  '#8a4030', '#5c5348', '#6b5428', '#3d4550', '#7a5a38', '#4a4038',
]);

function paintLandingWardrobe(layer, salt) {
  const actors = layer.actors ?? [];
  for (let i = 0; i < actors.length; i += 1) {
    const swatch = LANDING_WARDROBE[(i + salt * 3) % LANDING_WARDROBE.length];
    const actor = actors[i];
    actor.color = new THREE.Color(swatch.jacket);
    actor.jacketColor = new THREE.Color(swatch.jacket);
    actor.lowerColor = new THREE.Color(swatch.lower);
    actor.outfit = 'jacket';
    actor.vestColor = undefined;
    actor.hasHat = false;
    actor.hatHard = false;
  }
}

function paintLandingFleet(traffic) {
  if (!traffic?.fleet?.length) return;
  for (let i = 0; i < traffic.fleet.length; i += 1) {
    const car = traffic.fleet[i];
    if (!car?.color) continue;
    car.color.set(LANDING_FLEET[i % LANDING_FLEET.length]);
  }
}

const TERRACE_FRONT = Object.freeze({
  'terrace-single': { widthF: 0.94, frontSetback: 0.10, units: 3, porch: 1.20, kind: 'single' },
  'terrace-double': { widthF: 0.94, frontSetback: 0.10, units: 2, porch: 1.45, kind: 'double' },
  'terrace-carlton-heritage': { widthF: 0.94, frontSetback: 0.12, units: 2, porch: 1.34, kind: 'heritage' },
});

function terraceApertureLocals(archetypeId, facade) {
  const spec = TERRACE_FRONT[archetypeId];
  if (!spec) return [];
  const lot = TILE - SETBACK * 2;
  const bodyW = lot * spec.widthF * (1 + (facade - 1.5) * 0.018);
  const frontZ = lot / 2 - lot * spec.frontSetback;
  const wallFront = frontZ - spec.porch;
  const unitW = bodyW / spec.units;
  const baseY = 0.14;
  const z = wallFront + 0.20;
  const out = [];
  for (let i = 0; i < spec.units; i += 1) {
    const ux = -bodyW / 2 + unitW * (i + 0.5);
    if (spec.kind === 'single') {
      out.push({
        x: ux + unitW * 0.20, y: baseY + 0.46, z,
        w: Math.min(1.70, unitW * 0.36) * 0.72, h: 1.80 * 0.76,
      });
      out.push({
        x: ux, y: baseY + STOREY + 0.44, z,
        w: Math.min(1.62, unitW * 0.35) * 0.72, h: 1.88 * 0.76,
      });
    } else if (spec.kind === 'double') {
      const bayOffset = Math.min(unitW * 0.29, 2.15);
      for (const hand of [-1, 1]) {
        for (const off of [-0.675, 0.675]) {
          out.push({
            x: ux + hand * bayOffset + off, y: baseY + STOREY + 0.42, z,
            w: 1.10 * 0.72, h: 2.00 * 0.76,
          });
        }
      }
    } else {
      const bankW = Math.min(2.15, unitW * 0.34);
      out.push({
        x: ux + unitW * 0.18, y: baseY + 0.52, z,
        w: bankW * 0.78, h: 1.60 * 0.76,
      });
      out.push({
        x: ux + unitW * 0.18, y: baseY + STOREY + 0.50, z,
        w: bankW * 0.78, h: 1.56 * 0.76,
      });
    }
  }
  return out;
}

function dressTerraceApertures(board) {
  if (!board?.staticBuildings) return { panes: 0 };
  const glass = new THREE.MeshStandardMaterial({
    color: '#1a242c',
    roughness: 0.10,
    metalness: 0.18,
    transparent: true,
    opacity: 0.82,
    envMapIntensity: 1.35,
    vertexColors: true,
  });
  const mullion = new THREE.MeshStandardMaterial({
    color: '#2a241c',
    roughness: 0.55,
    metalness: 0.12,
  });
  const glassGeos = [];
  const mullionGeos = [];
  let panes = 0;
  const tmp = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  for (const rec of board.staticBuildings.values()) {
    const locals = terraceApertureLocals(rec.archetypeId, rec.facade ?? 0);
    if (!locals.length || !rec.placement) continue;
    pos.copy(rec.placement.position);
    quat.copy(rec.placement.quaternion);
    scl.copy(rec.placement.scale);
    tmp.compose(pos, quat, scl);
    for (const pane of locals) {
      const geo = new THREE.PlaneGeometry(pane.w, pane.h, 1, 5);
      const colors = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < geo.attributes.position.count; i += 1) {
        const py = geo.attributes.position.getY(i);
        const u = (py + pane.h * 0.5) / Math.max(0.001, pane.h);
        const shade = 0.18 + u * 0.72;
        colors[i * 3] = 0.10 * shade + 0.03;
        colors[i * 3 + 1] = 0.14 * shade + 0.04;
        colors[i * 3 + 2] = 0.18 * shade + 0.06;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.translate(pane.x, pane.y + pane.h * 0.5, pane.z + 0.012);
      geo.applyMatrix4(tmp);
      glassGeos.push(geo);
      const barW = Math.max(0.045, pane.w * 0.05);
      const vBar = new THREE.BoxGeometry(barW, pane.h * 0.96, 0.05);
      vBar.translate(pane.x, pane.y + pane.h * 0.5, pane.z + 0.03);
      vBar.applyMatrix4(tmp);
      mullionGeos.push(vBar);
      const hBar = new THREE.BoxGeometry(pane.w * 0.96, barW, 0.05);
      hBar.translate(pane.x, pane.y + pane.h * 0.5, pane.z + 0.03);
      hBar.applyMatrix4(tmp);
      mullionGeos.push(hBar);
      panes += 1;
    }
  }
  const group = new THREE.Group();
  group.name = 'landing-terrace-glaze';
  if (glassGeos.length) {
    const merged = mergeGeometries(glassGeos, false);
    glassGeos.forEach((g) => g.dispose());
    if (merged) {
      merged.name = 'landing-terrace-pane-glass';
      const mesh = new THREE.Mesh(merged, glass);
      mesh.name = 'landing-terrace-pane';
      group.add(mesh);
    }
  }
  if (mullionGeos.length) {
    const merged = mergeGeometries(mullionGeos, false);
    mullionGeos.forEach((g) => g.dispose());
    if (merged) {
      merged.name = 'landing-terrace-mullion';
      const mesh = new THREE.Mesh(merged, mullion);
      mesh.name = 'landing-terrace-mullion';
      group.add(mesh);
    }
  }
  board.root.add(group);
  return { panes };
}

function makeGhostSignTexture() {
  return makeGrainTexture(64, (t) => {
    const band = t > 0.62 ? [196, 178, 132] : t > 0.38 ? [122, 58, 42] : [168, 148, 98];
    const dust = Math.round((t - 0.5) * 22);
    return [
      Math.max(40, Math.min(220, band[0] + dust)),
      Math.max(32, Math.min(200, band[1] + dust)),
      Math.max(28, Math.min(180, band[2] + Math.round(dust * 0.6))),
    ];
  });
}

function dressFlankSubjects(board) {
  if (!board?.staticBuildings) return;
  const group = new THREE.Group();
  group.name = 'landing-flank-subjects';
  const paint = new THREE.MeshLambertMaterial({
    map: makeGhostSignTexture(),
    transparent: true,
    opacity: 0.9,
  });
  const iron = new THREE.MeshStandardMaterial({ color: '#3a3834', roughness: 0.68, metalness: 0.38 });
  const timber = new THREE.MeshLambertMaterial({
    map: makeGrainTexture(32, (t) => [
      Math.round(102 + t * 28),
      Math.round(84 + t * 16),
      Math.round(52 + t * 10),
    ]),
  });
  const lot = TILE - SETBACK * 2;
  let n = 0;
  for (const rec of board.staticBuildings.values()) {
    const arch = rec.archetypeId || '';
    if (!/terrace|shop/.test(arch)) continue;
    const pos = rec.placement?.position;
    if (!pos) continue;
    if (pos.x < 140 || pos.x > 176 || pos.z < 96 || pos.z > 140) continue;
    const faceX = pos.x - lot / 2 - 0.06;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.4), paint);
    sign.rotation.y = Math.PI / 2;
    sign.position.set(faceX, 4.7, pos.z - 0.4);
    sign.name = 'props:landing-ghost-sign';
    group.add(sign);
    const esc = new THREE.Group();
    esc.name = 'props:landing-fire-escape';
    const landA = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.07, 2.2), iron);
    landA.position.set(faceX - 0.82, 3.35, pos.z + 0.9);
    const landB = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.07, 2.2), iron);
    landB.position.set(faceX - 0.82, 6.15, pos.z + 0.9);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.85, 2.2), iron);
    rail.position.set(faceX - 1.52, 3.8, pos.z + 0.9);
    const railB = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.85, 2.2), iron);
    railB.position.set(faceX - 1.52, 6.6, pos.z + 0.9);
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.08, 6.4, 0.55), iron);
    ladder.position.set(faceX - 0.82, 3.4, pos.z + 2.05);
    esc.add(landA, landB, rail, railB, ladder);
    group.add(esc);
    const hoard = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.25, 5.4), timber);
    hoard.position.set(faceX - 0.42, 1.18, pos.z);
    hoard.name = 'props:landing-hoarding';
    group.add(hoard);
    n += 1;
  }
  if (n) board.root.add(group);
  return { flanks: n };
}

function addShopPane(group, glass, bar, pane) {
  const g = new THREE.PlaneGeometry(pane.w, pane.h, 1, 4);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i += 1) {
    const py = g.attributes.position.getY(i);
    const u = (py + pane.h * 0.5) / Math.max(0.001, pane.h);
    const shade = 0.22 + u * 0.7;
    col[i * 3] = 0.08 * shade + 0.03;
    col[i * 3 + 1] = 0.11 * shade + 0.04;
    col[i * 3 + 2] = 0.15 * shade + 0.05;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(g, glass);
  mesh.position.set(pane.x, pane.y, pane.z);
  if (pane.yaw) mesh.rotation.y = pane.yaw;
  mesh.name = 'landing-shop-pane';
  group.add(mesh);
  const ox = pane.yaw ? Math.sin(pane.yaw) * 0.045 : 0;
  const oz = pane.yaw ? Math.cos(pane.yaw) * 0.045 : 0.045;
  const sx = pane.yaw ? Math.cos(pane.yaw) * pane.w * 0.17 : pane.w * 0.17;
  const sz = pane.yaw ? -Math.sin(pane.yaw) * pane.w * 0.17 : 0;
  const v1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, pane.h * 0.94, 0.08), bar);
  const v2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, pane.h * 0.94, 0.08), bar);
  const h1 = new THREE.Mesh(new THREE.BoxGeometry(pane.w * 0.94, 0.08, 0.08), bar);
  const h2 = new THREE.Mesh(new THREE.BoxGeometry(pane.w * 0.94, 0.08, 0.08), bar);
  if (pane.yaw) {
    v1.rotation.y = pane.yaw;
    v2.rotation.y = pane.yaw;
    h1.rotation.y = pane.yaw;
    h2.rotation.y = pane.yaw;
  }
  v1.position.set(pane.x - sx + ox, pane.y, pane.z - sz + oz);
  v2.position.set(pane.x + sx + ox, pane.y, pane.z + sz + oz);
  h1.position.set(pane.x + ox, pane.y - pane.h * 0.06, pane.z + oz);
  h2.position.set(pane.x + ox, pane.y + pane.h * 0.20, pane.z + oz);
  v1.name = v2.name = h1.name = h2.name = 'landing-shop-mullion';
  group.add(v1, v2, h1, h2);
}

function dressShopApertures(board) {
  if (!board?.staticBuildings) return { panes: 0 };
  const glass = new THREE.MeshStandardMaterial({
    color: '#1a242c',
    roughness: 0.11,
    metalness: 0.16,
    transparent: true,
    opacity: 0.82,
    envMapIntensity: 1.3,
    vertexColors: true,
  });
  const bar = new THREE.MeshStandardMaterial({
    color: '#d8c9a4',
    roughness: 0.46,
    metalness: 0.16,
  });
  const group = new THREE.Group();
  group.name = 'landing-shop-glaze';
  let panes = 0;
  for (const rec of board.staticBuildings.values()) {
    const arch = rec.archetypeId || '';
    if (!/shop-corner|shoptop-mixed|walkup/.test(arch) || !rec.placement) continue;
    const pos = rec.placement.position;
    if (pos.x < 132 || pos.x > 176 || pos.z < 108 || pos.z > 156) continue;
    const lot = TILE - SETBACK * 2;
    const west = pos.x - lot / 2 - 0.08;
    const south = pos.z + lot / 2 + 0.08;
    const faces = [
      { x: west, y: 1.75, z: pos.z - 2.2, w: 2.9, h: 2.2, yaw: -Math.PI / 2 },
      { x: west, y: 1.75, z: pos.z + 1.9, w: 2.9, h: 2.2, yaw: -Math.PI / 2 },
      { x: west, y: 4.98, z: pos.z - 2.05, w: 1.68, h: 1.46, yaw: -Math.PI / 2 },
      { x: west, y: 4.98, z: pos.z + 1.7, w: 1.68, h: 1.46, yaw: -Math.PI / 2 },
      { x: pos.x - 2.05, y: 1.75, z: south, w: 2.75, h: 2.15, yaw: 0 },
      { x: pos.x + 1.75, y: 1.75, z: south, w: 2.75, h: 2.15, yaw: 0 },
      { x: pos.x - 1.95, y: 4.98, z: south, w: 1.58, h: 1.38, yaw: 0 },
      { x: pos.x + 1.65, y: 4.98, z: south, w: 1.58, h: 1.38, yaw: 0 },
    ];
    for (const pane of faces) {
      addShopPane(group, glass, bar, pane);
      panes += 1;
    }
    const roof = new THREE.Mesh(
      new THREE.PlaneGeometry(lot * 1.04, lot * 0.96, 12, 9),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    const rc = new Float32Array(roof.geometry.attributes.position.count * 3);
    for (let i = 0; i < roof.geometry.attributes.position.count; i += 1) {
      const px = roof.geometry.attributes.position.getX(i);
      const pz = roof.geometry.attributes.position.getZ(i);
      const rib = 0.5 + 0.5 * Math.sin(px * 5.2);
      const stain = 0.5 + 0.5 * Math.sin(pz * 2.6 + px * 0.8);
      roof.geometry.attributes.position.setY(i, rib * 0.18);
      rc[i * 3] = 0.36 + rib * 0.18 + stain * 0.08;
      rc[i * 3 + 1] = 0.28 + rib * 0.11 + stain * 0.05;
      rc[i * 3 + 2] = 0.20 + rib * 0.06;
    }
    roof.geometry.setAttribute('color', new THREE.BufferAttribute(rc, 3));
    roof.geometry.computeVertexNormals();
    roof.rotation.x = -Math.PI / 2;
    roof.position.set(pos.x, 8.48, pos.z);
    roof.name = 'landing-shop-roof';
    group.add(roof);
  }
  if (panes) board.root.add(group);
  return { panes };
}

function dressCafeDecks(board) {
  if (!board?.staticBuildings) return { decks: 0 };
  const group = new THREE.Group();
  group.name = 'props:landing-cafe-deck';
  const timber = new THREE.MeshLambertMaterial({
    map: makeGrainTexture(24, (t) => [
      Math.round(122 + t * 28),
      Math.round(86 + t * 16),
      Math.round(52 + t * 10),
    ]),
  });
  const iron = new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.45, metalness: 0.28 });
  const cloth = new THREE.MeshLambertMaterial({ color: '#3a6a8c' });
  const top = new THREE.MeshLambertMaterial({ color: '#ece6da' });
  let n = 0;
  for (const rec of board.staticBuildings.values()) {
    const arch = rec.archetypeId || '';
    if (!/shop-corner|shoptop-mixed/.test(arch) || !rec.placement) continue;
    const pos = rec.placement.position;
    if (pos.x < 138 || pos.x > 172 || pos.z < 112 || pos.z > 148) continue;
    const lot = TILE - SETBACK * 2;
    const frontZ = pos.z + lot / 2 - 0.08;
    const deckY = 3.55;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.14, 3.05), timber);
    deck.position.set(pos.x - 0.2, deckY, frontZ + 1.45);
    deck.name = 'props:landing-cafe-slab';
    group.add(deck);
    for (let i = 0; i < 11; i += 1) {
      const bx = pos.x - 4.0 + i * 0.78;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.02, 0.08), iron);
      post.position.set(bx, deckY + 0.56, frontZ + 2.82);
      post.name = 'props:landing-cafe-baluster';
      group.add(post);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(8.3, 0.08, 0.09), iron);
    rail.position.set(pos.x - 0.2, deckY + 1.05, frontZ + 2.82);
    rail.name = 'props:landing-cafe-rail';
    group.add(rail);
    for (const ox of [-2.2, 0.1, 2.2]) {
      const table = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.07, 10), top);
      table.position.set(pos.x + ox, deckY + 0.8, frontZ + 1.35);
      table.name = 'props:landing-cafe-table';
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.74, 8), iron);
      stem.position.set(pos.x + ox, deckY + 0.44, frontZ + 1.35);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.76, 0.3, 10, 1, true), cloth);
      shade.position.set(pos.x + ox, deckY + 1.62, frontZ + 1.35);
      shade.name = 'props:landing-cafe-umbrella';
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), iron);
      pole.position.set(pos.x + ox, deckY + 1.18, frontZ + 1.35);
      group.add(table, stem, shade, pole);
    }
    n += 1;
  }
  if (n) board.root.add(group);
  return { decks: n };
}

function landingGpuInfo(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl?.getExtension?.('WEBGL_debug_renderer_info');
    const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
    return { gpu, software: /swiftshader|llvmpipe|soft|microsoft basic/i.test(gpu) };
  } catch {
    return { gpu: '', software: false };
  }
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function easeTravel(t) {
  const x = Math.max(0, Math.min(1, t));
  const s = x * x * x * (x * (x * 6 - 15) + 10);
  return s * s * (3 - 2 * s);
}

// r17 live frames that outscored waypoints. t=18 (u=0.400, seg 2 rawT≈0.80)
// still sits on the recast 3→4 path (corner / zebra). Hold near beat 4 on
// 4→5 so the 180-gate does not linger on the party-wall mid (r18 u≈0.51).
const SPLINE_DWELLS = Object.freeze({ 2: 0.80, 3: 0.12 });

function dwellEase(rawT, hold) {
  const t = Math.max(0, Math.min(1, rawT));
  const lo = Math.max(0, hold - 0.10);
  const hi = Math.min(1, hold + 0.10);
  const tEnter = 0.26;
  const tExit = 0.74;
  if (t <= tEnter) return lo * easeTravel(t / tEnter);
  if (t >= tExit) return hi + (1 - hi) * easeTravel((t - tExit) / Math.max(1e-6, 1 - tExit));
  return lo + (hi - lo) * easeTravel((t - tEnter) / (tExit - tEnter));
}

function sampleSpline(points, u, kind = 'eye') {
  const count = points.length;
  if (!count) return new THREE.Vector3();
  if (count === 1) return points[0].clone();
  const wrapped = ((u % 1) + 1) % 1;
  const scaled = wrapped * count;
  const index = Math.floor(scaled) % count;
  const rawT = scaled - Math.floor(scaled);
  const hold = SPLINE_DWELLS[index];
  const t = hold == null ? easeTravel(rawT) : dwellEase(rawT, hold);
  const p1 = points[index];
  const p2 = points[(index + 1) % count];
  const tY = p2.y > p1.y
    ? (hold == null ? easeTravel(rawT * rawT) : dwellEase(rawT * rawT, hold))
    : t;
  let x = p1.x + (p2.x - p1.x) * t;
  let y = p1.y + (p2.y - p1.y) * tY;
  let z = p1.z + (p2.z - p1.z) * t;
  const pull = Math.sin(Math.PI * (hold == null ? rawT : t));
  // 4→5: keep look on the tram corridor, not the party wall (r18 facade 0.99).
  if (kind === 'look' && index === 3) {
    x -= 14 * pull;
    y -= 1.4 * pull;
    z -= 6 * pull;
    const late = Math.max(0, rawT - 0.80) / 0.20;
    if (late > 0) {
      const w = late * late * (3 - 2 * late);
      x = x * (1 - w) + 140 * w;
      y = y * (1 - w) + 3.1 * w;
      z = z * (1 - w) + 116 * w;
    }
  }
  // 5→6: hold the retail street, then swing to the reserve late so the mid
  // is not a party wall or a crane in the sky band.
  if (kind === 'look' && index === 4) {
    const swing = t * t;
    x = p1.x + (p2.x - p1.x) * swing;
    z = p1.z + (p2.z - p1.z) * swing;
    y = p1.y + (p2.y - p1.y) * swing - 1.1 * pull;
  }
  // 6→7 is now rotunda→rotunda; stay on the park, do not lift into sky.
  if (kind === 'look' && index === 5) {
    y -= 0.8 * pull;
  }
  // Keep the last 0.855–0.857 samples moving (easeTravel is already parked).
  if (index === 5 && rawT > 0.90) {
    const extra = (rawT - 0.90) / 0.10;
    const w = Math.sin(extra * Math.PI);
    if (kind === 'eye') {
      x += 0.10 * w;
      z += 0.06 * w;
    } else {
      x += 0.07 * w;
    }
  }
  // 7→1 wrap: short southbound hop into beat 1. Linear so easeTravel
  // cannot pin a plateau; a small sway keeps consecutive MAD ≥ 1.
  if (index === 6) {
    const t = rawT;
    const sway = Math.sin(Math.PI * t);
    x = p1.x + (p2.x - p1.x) * t;
    y = p1.y + (p2.y - p1.y) * t;
    z = p1.z + (p2.z - p1.z) * t;
    if (kind === 'eye') {
      x += 0.18 * sway;
      y += 0.08 * sway;
    } else {
      x += 0.10 * sway;
    }
  }
  return new THREE.Vector3(x, y, z);
}

function beatsToPath(beats, portrait = false) {
  return {
    positions: beats.map((beat) => new THREE.Vector3().fromArray((portrait && beat.portrait ? beat.portrait : beat).eye)),
    looks: beats.map((beat) => new THREE.Vector3().fromArray((portrait && beat.portrait ? beat.portrait : beat).look)),
  };
}

function geometricFallbackBeats(city) {
  const reserve = city.reserve?.centre ?? { x: city.extent.x * 0.5, z: city.extent.z * 0.6 };
  const tram = tramWorld(city);
  const look = {
    x: (reserve.x * 0.55) + (tram.x * 0.45),
    y: 5.1,
    z: (reserve.z * 0.7) + (tram.z * 0.3),
  };
  const radius = 48;
  const beats = [];
  for (let i = 0; i < 8; i += 1) {
    const az = (i / 8) * Math.PI * 2 + 0.4;
    beats.push({
      id: `fallback-${i}`,
      subject: 'fallback-ring',
      distance: radius,
      azimuthDeg: (az * 180) / Math.PI,
      height: 16,
      eye: [look.x + Math.sin(az) * radius, 16, look.z + Math.cos(az) * radius],
      look: [look.x, look.y, look.z],
    });
  }
  return beats;
}

function landingCameraPath(city, beats = LANDING_CAMERA_BEATS) {
  const used = Array.isArray(beats) && beats.length ? beats : geometricFallbackBeats(city);
  return beatsToPath(used);
}

function resolveLandingCitySize() {
  try {
    const raw = new URLSearchParams(globalThis.location?.search ?? '').get('landingCity');
    if (raw === '3x3') return { blocksX: 3, blocksZ: 3 };
    if (raw === '4x3') return { blocksX: 4, blocksZ: 3 };
    if (raw === '4x4') return { blocksX: 4, blocksZ: 4 };
    if (raw === '5x5') return { blocksX: 5, blocksZ: 5 };
  } catch { /* display size is optional */ }
  return LANDING_CITY;
}

function tramWorld(city) {
  const tramV = city.corridors?.vertical?.find((corridor) => corridor.tram);
  const tramH = city.corridors?.horizontal?.find((corridor) => corridor.tram);
  return {
    x: tramV ? tramV.index * PITCH + CORRIDOR.tramCentre : city.extent.x * 0.55,
    z: tramH ? tramH.index * PITCH + CORRIDOR.tramCentre : city.extent.z * 0.32,
  };
}

function clampLandingPose(camera, look) {
  camera.position.y = Math.min(MAX_CAM_Y, Math.max(MIN_CAM_Y, camera.position.y));
  const dx = look.x - camera.position.x;
  const dy = look.y - camera.position.y;
  const dz = look.z - camera.position.z;
  const horiz = Math.hypot(dx, dz) || 1;
  const pitch = Math.atan2(-dy, horiz);
  if (pitch > MAX_PITCH_RAD) look.y = camera.position.y - Math.tan(MAX_PITCH_RAD) * horiz;
  else if (pitch < MIN_PITCH_RAD) look.y = camera.position.y + Math.tan(-MIN_PITCH_RAD) * horiz;
  return {
    cameraY: Number(camera.position.y.toFixed(2)),
    pitchDeg: Number(((Math.atan2(camera.position.y - look.y, horiz) * 180) / Math.PI).toFixed(2)),
  };
}

function medianNumber(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function publishLandingBoard(fields) {
  const prev = globalThis.__landingBoard ?? {};
  Object.assign(prev, fields);
  globalThis.__landingBoard = prev;
}

function bindScrollReveals(root) {
  const nodes = [...(root?.querySelectorAll('[data-reveal]') ?? [])];
  if (!nodes.length) return () => {};
  if (!('IntersectionObserver' in globalThis)) {
    nodes.forEach((node) => node.classList.add('is-in'));
    return () => {};
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) entry.target.classList.add('is-in');
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  for (const node of nodes) observer.observe(node);
  return () => observer.disconnect();
}

export function advanceLandingIdle(board, phase, dt, reducedMotion = false) {
  if (reducedMotion) return phase;
  const next = (phase + Math.max(0, Math.min(0.05, dt))) % (Math.PI * 2);
  board.update(Math.max(0, Math.min(0.05, dt)), next);
  return next;
}

async function mountIdleBoard(canvas, { reducedMotion, root = null } = {}) {
  if (!canvas) return null;
  {
    const { width, height } = canvasCssSize(canvas);
    const dpr = Math.min(Number(globalThis.devicePixelRatio) || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
  }
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
  } catch {
    publishLandingBoard({ ready: false, webgl: false });
    return null;
  }

  renderer.setClearColor(new THREE.Color(LANDING_HAZE), 1);
  renderer.clear();
  canvas.style.opacity = '1';
  root?.classList.add('is-live');

  const citySize = resolveLandingCitySize();
  const generated = createCity({
    seed: LANDING_DISPLAY_SEED,
    blocksX: citySize.blocksX,
    blocksZ: citySize.blocksZ,
  });
  const restyled = restyleLandingParcels(generated);
  const city = restyled.city;
  const registry = new AssetRegistry();
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (typeof url === 'string' && url.includes('warehouse-brick.glb')) {
      return nativeFetch(url.replace('warehouse-brick.glb', 'warehouse-converted.glb'), init);
    }
    return nativeFetch(input, init);
  };
  try {
    await registry.loadAll();
  } finally {
    globalThis.fetch = nativeFetch;
  }

  const gpu = landingGpuInfo(renderer);
  const tileCount = citySize.blocksX * citySize.blocksZ;
  const firstSize = canvasCssSize(canvas);
  const portrait = firstSize.height > firstSize.width * 1.05;
  const boardQuality = gpu.software || portrait ? 'low' : 'medium';
  const dpr = Math.min(Number(globalThis.devicePixelRatio) || 1, 2);
  const ratioLadder = gpu.software
    ? [1]
    : [...new Set([
      Number(dpr.toFixed(2)),
      Number(Math.max(1, dpr * 0.75).toFixed(2)),
      1,
    ])].sort((a, b) => b - a);
  let ratioIndex = 0;
  let pixelRatio = ratioLadder[0];
  const pixelCap = ratioLadder[0];
  let pixelPinned = false;
  let calibTime = 0;
  let lastDropAt = 0;
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = boardQuality !== 'low';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  addHorizonDressing(scene, city);
  const lighting = new LightingRig(scene, city.extent, {
    quality: boardQuality,
    timeOfDay: LANDING_TIME_OF_DAY,
    renderer,
  });
  lighting.bakeEnvironment();
  applyLandingClearLightFinish(lighting);
  const sky = new SkyDome(scene, city.extent, {
    quality: boardQuality,
    reducedMotion,
    timeOfDay: LANDING_TIME_OF_DAY,
  });
  if (scene.fog && lighting.profile?.horizonColor && lighting.profile?.skyColor) {
    scene.fog.color.copy(lighting.profile.horizonColor).lerp(lighting.profile.skyColor, 0.35).multiplyScalar(0.9);
  }
  addLandingCloth(scene, city, lighting.profile?.groundColor);

  const board = new Board(city, registry, { quality: boardQuality });
  restoreLandingHeritageRender(board);
  board.setReducedMotion?.(reducedMotion);
  board.reducedMotion = reducedMotion;
  scene.add(board.root);
  lighting.applyEnvironmentToScene(scene);
  if (board.contactShadows && boardQuality !== 'low') board.contactShadows.visible = false;
  // The Board already owns organic reserve turf at y=.27. The legacy y=.28
  // striped overlay concealed that shared grass, wear and contact field.

  let water = null;
  let foliage = null;
  const natureOn = wantLandingNature({ software: gpu.software, portrait });
  if (natureOn) {
    try {
      water = new WaterSurface(scene, city, {
        quality: boardQuality,
        reducedMotion,
        envMap: lighting.equirect,
        boardRoot: board.root,
        materials: board.materials,
      });
      water.setSolar?.(lighting.profile, sunDirection(lighting.profile));
    } catch {
      water = null;
    }
    try {
      foliage = new FoliageLayer(scene, city, {
        quality: boardQuality,
        reducedMotion,
        boardRoot: board.root,
      });
      lighting.applyEnvironmentToScene(foliage.root);
    } catch {
      foliage = null;
    }
  }

  const postEnabled = !gpu.software && !portrait;
  renderer.toneMapping = postEnabled ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.32;
  const post = postEnabled
    ? new PostChain(renderer, {
      quality: boardQuality,
      reducedMotion,
      width: canvas.clientWidth || globalThis.innerWidth || 1280,
      height: canvas.clientHeight || globalThis.innerHeight || 800,
      grade: lighting.profile.grade,
    })
    : null;

  // Keep the per-material environment response already assigned by LightingRig.

  const apertureBlobOf = (obj, mat) => {
    const geo = String(obj.geometry?.name || '').toLowerCase();
    const variant = String(mat?.userData?.variant || '').toLowerCase();
    const family = String(mat?.userData?.family || '').toLowerCase();
    const blob = [
      mat?.name, variant, family, obj.name, obj.parent?.name, geo,
    ].map((value) => String(value || '').toLowerCase()).join(' ');
    return { geo, variant, family, blob };
  };
  const isApertureSurface = (obj, mat) => {
    const { geo, variant, family, blob } = apertureBlobOf(obj, mat);
    if (/\b(door-leaf|door-panel|window-frame|window-sill|window-ledge|window-muntin|window-reveal|reveal-jamb|reveal-head|reveal-sill|surround-band)\b/.test(`${geo} ${blob}`)) {
      return false;
    }
    if (family === 'glass') return true;
    if (/res-shadow|kit-room-interior|res-glass|kit-glass|kit-civic-glass|kit-warehouse-pane|kit-rec-window/.test(variant)) {
      return true;
    }
    if (/\b(window-glass|arched-window-glass|bay-glass|reveal-back|flank-reveal-back|window-interior|punch-pane|civic-win-glass|office-window|warehouse-punch-pane)\b/.test(geo)) {
      return true;
    }
    return /\b(glass|glaz|pane)\b/.test(blob);
  };
  const glazed = new Set();
  let glazeIndex = 0;
  board.root.traverse((obj) => {
    if (!obj.isMesh) return;
    for (const mat of [].concat(obj.material || [])) {
      if (!mat || glazed.has(mat)) continue;
      if (!isApertureSurface(obj, mat)) continue;
      const { geo, variant, family } = apertureBlobOf(obj, mat);
      const isBack = family !== 'glass' && (
        /res-shadow|kit-room-interior/.test(variant)
        || /\b(reveal-back|flank-reveal-back|window-interior)\b/.test(geo)
      );
      glazed.add(mat);
      const lit = ((hash32(`landing-glaze:${glazeIndex}`) >>> 8) % 100) < 38;
      glazeIndex += 1;
      if (mat.isMeshPhysicalMaterial || mat.isMeshStandardMaterial) {
        mat.color?.set(isBack ? '#1c262e' : '#1a2a32');
        mat.roughness = isBack ? 0.16 : 0.07;
        mat.metalness = isBack ? 0.20 : 0.24;
        mat.envMapIntensity = Math.max(mat.envMapIntensity ?? 1, isBack ? 1.25 : 1.55);
        if ('clearcoat' in mat) {
          mat.clearcoat = isBack ? 0.32 : 0.62;
          mat.clearcoatRoughness = isBack ? 0.22 : 0.10;
        }
        if (isBack) {
          mat.transparent = false;
          mat.opacity = 1;
        } else if ('opacity' in mat) {
          mat.transparent = true;
          mat.opacity = Math.min(mat.opacity ?? 1, 0.78);
        }
        if (lit) {
          mat.emissive = new THREE.Color('#c4893a');
          mat.emissiveIntensity = isBack ? 0.16 : 0.26;
        } else {
          mat.emissive = new THREE.Color('#243038');
          mat.emissiveIntensity = isBack ? 0.08 : 0.10;
        }
      } else {
        mat.color?.set(lit ? '#3a3224' : '#243038');
        mat.emissive = new THREE.Color(lit ? '#c4893a' : '#1c262c');
        mat.emissiveIntensity = lit ? 0.30 : 0.08;
      }
    }
  });
  dressTerraceApertures(board);
  dressShopApertures(board);
  dressCafeDecks(board);
  dressFlankSubjects(board);
  board.root.traverse((obj) => {
    if (/fringe:rock/.test(obj.name || '')) obj.visible = false;
  });

  let traffic = null;
  try {
    if (tileCount <= 16) {
      traffic = new TrafficLayer(city, { quality: 'low', reducedMotion });
      board.registerTrafficMischief(traffic);
      paintLandingFleet(traffic);
      scene.add(traffic.root);
    }
  } catch {
    traffic = null;
  }

  let people = null;
  const lifeLayers = [];
  try {
    people = new PeopleLayer(city);
    scene.add(people.root);
  } catch {
    people = null;
  }
  try {
    if (tileCount <= 16) {
      const primary = new AmbientLifeLayer(city, { quality: 'low', reducedMotion, cityLife: false });
      placeLandingPedestrians(primary, city, 0);
      lifeLayers.push(primary);
      scene.add(primary.root);
      const extraCity = Object.create(city);
      Object.defineProperty(extraCity, 'seed', {
        value: hash32(`landing-life:${city.seed ?? 0}`),
      });
      const extra = new AmbientLifeLayer(extraCity, { quality: 'low', reducedMotion, cityLife: false });
      placeLandingPedestrians(extra, city, 1);
      lifeLayers.push(extra);
      scene.add(extra.root);
    }
  } catch {
    /* pedestrians are optional if the layer fails to boot */
  }

  const camera = new THREE.PerspectiveCamera(34, 1, 0.8, 2200);
  let activeBeats = Array.isArray(LANDING_CAMERA_BEATS) && LANDING_CAMERA_BEATS.length
    ? LANDING_CAMERA_BEATS
    : geometricFallbackBeats(city);
  let path = landingCameraPath(city, activeBeats);
  let portraitPath = beatsToPath(activeBeats, true);
  const lookScratch = new THREE.Vector3();
  let phase = 0;
  const bootU = landingBootU(activeBeats);
  let elapsed = bootU * LANDING_LOOP_SECONDS;
  let frame = null;
  let intersecting = true;
  let disposed = false;
  let lastTimestamp = null;
  let simAccum = 0;
  let lastPose = { cameraY: 0, pitchDeg: 0 };
  let lastEye = [0, 0, 0];
  let lastLook = [0, 0, 0];
  let loopPaused = false;
  let renderCount = 0;
  let lastMeasured = null;
  let buildingBoxes = null;
  const fpsWindow = [];
  const cityLabel = `${citySize.blocksX}x${citySize.blocksZ}`;

  const applyCamera = (eye, look, size = canvasCssSize(canvas)) => {
    camera.position.set(eye[0], eye[1], eye[2]);
    lookScratch.set(look[0], look[1], look[2]);
    lookScratch.y = Math.max(3.5, lookScratch.y);
    lastPose = clampLandingPose(camera, lookScratch);
    const { width, height } = size;
    const isPortrait = height > width * 1.05;
    const dx = camera.position.x - lookScratch.x;
    const dy = camera.position.y - lookScratch.y;
    const dz = camera.position.z - lookScratch.z;
    const pull = isPortrait ? 1.62 : 1;
    camera.position.set(
      lookScratch.x + dx * pull,
      Math.min(MAX_CAM_Y, Math.max(MIN_CAM_Y, lookScratch.y + dy * pull)),
      lookScratch.z + dz * pull,
    );
    lastPose = clampLandingPose(camera, lookScratch);
    if (isPortrait) {
      camera.fov = 38;
      camera.clearViewOffset();
    } else {
      camera.fov = 32;
      camera.clearViewOffset();
    }
    lastEye = [camera.position.x, camera.position.y, camera.position.z];
    lastLook = [lookScratch.x, lookScratch.y, lookScratch.z];
    camera.lookAt(lookScratch);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  };

  const renderOnce = () => {
    lighting.update(camera, lookScratch, camera.position.distanceTo(lookScratch));
    sky.update(0, elapsed);
    water?.update?.(0, elapsed);
    foliage?.update?.(0, elapsed);
    if (post) {
      post.render(scene, camera, {
        elapsed,
        focusDistance: camera.position.distanceTo(lookScratch),
        sunDirection: lighting.postState?.()?.sunDirection,
      });
    } else {
      renderer.render(scene, camera);
    }
    renderCount += 1;
  };

  const poseAt = (u) => {
    const wrapped = ((u % 1) + 1) % 1;
    const size = canvasCssSize(canvas);
    const activePath = size.height > size.width * 1.05 ? portraitPath : path;
    const eye = sampleSpline(activePath.positions, wrapped, 'eye');
    const look = sampleSpline(activePath.looks, wrapped, 'look');
    applyCamera([eye.x, eye.y, eye.z], [look.x, look.y, look.z], size);
  };

  const poseTo = (eye, look) => {
    applyCamera(eye, look);
    renderOnce();
    publishPose();
    return { ...lastPose, eye: lastEye, look: lastLook };
  };

  const setBeats = (beats) => {
    if (!Array.isArray(beats) || !beats.length) return activeBeats;
    activeBeats = beats;
    path = beatsToPath(beats);
    portraitPath = beatsToPath(beats, true);
    poseAt(elapsed / LANDING_LOOP_SECONDS);
    renderOnce();
    publishPose();
    return activeBeats;
  };

  const pauseLoop = () => {
    loopPaused = true;
    if (frame) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    lastTimestamp = null;
    return { paused: true, renderCount };
  };

  const kickLoop = () => {
    if (!frame && !disposed && !loopPaused && !document.hidden) {
      lastTimestamp = null;
      frame = requestAnimationFrame(loop);
    }
    return Boolean(frame);
  };

  const resumeLoop = () => {
    loopPaused = false;
    intersecting = true;
    lastTimestamp = null;
    kickLoop();
    return { paused: false, renderCount, frame: Boolean(frame) };
  };

  const stepCityLife = (step) => {
    const users = collectRoadUsers(board, traffic);
    people?.setRoadUsers?.(users);
    people?.update?.(step);
    for (const layer of lifeLayers) {
      layer.setRoadUsers?.(users);
      layer.update?.(step, elapsed);
    }
  };

  const tickFrame = (dt = 1 / 60) => {
    const step = Math.max(0, Math.min(0.08, Number(dt) || 1 / 60));
    if (!reducedMotion) {
      phase = advanceLandingIdle(board, phase, step);
      traffic?.update?.(step, elapsed);
      stepCityLife(step);
    }
    renderOnce();
    publishPose();
    return { renderCount, cameraY: lastPose.cameraY, pitchDeg: lastPose.pitchDeg };
  };

  const frameSignature = () => {
    const q = camera.quaternion;
    return [
      camera.position.x.toFixed(4),
      camera.position.y.toFixed(4),
      camera.position.z.toFixed(4),
      q.x.toFixed(5),
      q.y.toFixed(5),
      q.z.toFixed(5),
      q.w.toFixed(5),
      String(renderCount),
    ].join('|');
  };

  const resize = () => {
    const { width, height } = canvasCssSize(canvas);
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(pixelRatio);
    camera.aspect = width / Math.max(1, height);
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    post?.setSize(width * pixelRatio, height * pixelRatio);
    if (scene) renderOnce();
    else renderer.clear();
  };

  const noteFps = (dt) => {
    if (!dt) return;
    fpsWindow.push(1 / dt);
    if (fpsWindow.length > 90) fpsWindow.shift();
  };

  const maybeCalibrate = (dt) => {
    if (pixelPinned) return;
    calibTime += dt;
    if (calibTime >= 2.4) {
      pixelPinned = true;
      renderer.setPixelRatio(pixelRatio);
      return;
    }
    if (fpsWindow.length >= 24 && calibTime - lastDropAt > 0.85) {
      const med = medianNumber(fpsWindow);
      if (med > 0 && med < 47 && ratioIndex < ratioLadder.length - 1) {
        ratioIndex += 1;
        pixelRatio = ratioLadder[ratioIndex];
        renderer.setPixelRatio(pixelRatio);
        post?.setSize(
          (canvas.clientWidth || 1280) * pixelRatio,
          (canvas.clientHeight || 800) * pixelRatio,
        );
        fpsWindow.length = 0;
        lastDropAt = calibTime;
      }
    }
  };

  const publishPose = (extra = {}) => {
    publishLandingBoard({
      cameraU: (elapsed / LANDING_LOOP_SECONDS) % 1,
      entryU: LANDING_ENTRY_U,
      pixelRatio,
      pixelCap,
      pixelPinned,
      citySize: cityLabel,
      reserveId: city.reserve?.id ?? null,
      hazeRgb: LANDING_HAZE_RGB,
      backgroundRgb: LANDING_HAZE_RGB,
      bootU,
      restyleCount: restyled.swapped.length,
      restyleHistogram: restyled.swapped,
      hasWater: Boolean(water),
      hasFoliage: Boolean(foliage),
      cameraY: lastPose.cameraY,
      pitchDeg: lastPose.pitchDeg,
      beatIds: activeBeats.map((beat) => beat.id),
      beats: activeBeats,
      lifeDebug: lifeLayers.map((layer) => (layer.actors ?? []).map((actor) => ({
        x: Number((actor._lastX ?? actor.x).toFixed(1)),
        z: Number((actor._lastZ ?? actor.z).toFixed(1)),
        kind: actor.kind,
      }))),
      paused: loopPaused,
      renderCount,
      ...extra,
    });
  };

  const seek = (u) => {
    elapsed = (((u % 1) + 1) % 1) * LANDING_LOOP_SECONDS;
    poseAt(elapsed / LANDING_LOOP_SECONDS);
    renderOnce();
    publishPose();
  };

  const shotContext = () => ({
    extent: city.extent,
    waterEdge: city.waterEdge,
    blocksX: city.blocksX,
    blocksZ: city.blocksZ,
    reserve: city.reserve
      ? {
        id: city.reserve.id,
        bx: city.reserve.bx,
        bz: city.reserve.bz,
        centre: city.reserve.centre,
        bounds: city.reserve.bounds,
      }
      : null,
    tram: tramWorld(city),
    corridors: {
      vertical: (city.corridors?.vertical ?? []).map((corridor) => ({
        index: corridor.index,
        tram: Boolean(corridor.tram),
        x: corridor.index * PITCH + CORRIDOR.tramCentre,
      })),
      horizontal: (city.corridors?.horizontal ?? []).map((corridor) => ({
        index: corridor.index,
        tram: Boolean(corridor.tram),
        z: corridor.index * PITCH + CORRIDOR.tramCentre,
      })),
    },
    parcels: Object.values(city.parcels ?? {}).map((parcel) => ({
      id: parcel.id,
      archetypeId: parcel.archetypeId,
      bx: parcel.bx,
      bz: parcel.bz,
      x: parcel.centre.x,
      z: parcel.centre.z,
    })),
    beats: activeBeats.map((beat) => beat.id),
  });

  const ancestorBlob = (obj) => {
    const parts = [];
    let node = obj;
    while (node) {
      if (node.name) parts.push(String(node.name));
      node = node.parent;
    }
    return parts.join(' ').toLowerCase();
  };

  const isUnderBuildingRoot = (obj) => {
    let node = obj;
    while (node) {
      const name = `${node.name || ''}`;
      if (/^buildings:|^civic:|^opening:|rotunda/i.test(name)) return true;
      node = node.parent;
    }
    return false;
  };

  const isGroundPlane = (obj) => /ground:|road|lawn|turf|hoggin|path|corridor|apron|landing-reserve/
    .test(ancestorBlob(obj));

  const isFieldGround = (obj) => {
    const name = ancestorBlob(obj);
    if (/ground:road|road-/.test(name)) return false;
    return /lawn|turf|hoggin|apron|landing-reserve|ground:landing|ground-tile|ground:ground-tile/.test(name);
  };

  const isSkyDome = (obj) => /landing-sky-dome|sky-dome|nature:sky/.test(ancestorBlob(obj));

  const worldNormal = (hit) => {
    if (!hit?.face) return { x: 0, y: 1, z: 0 };
    const n = hit.face.normal.clone();
    if (hit.object?.matrixWorld) n.transformDirection(hit.object.matrixWorld);
    return n;
  };

  const collectBuildingBoxes = () => {
    if (buildingBoxes) return buildingBoxes;
    const boxes = [];
    board.root.traverse((obj) => {
      if (!obj.isMesh) return;
      if (!isUnderBuildingRoot(obj) && !/rotunda/i.test(`${obj.name || ''}`)) return;
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) return;
      boxes.push(box);
    });
    buildingBoxes = boxes;
    return boxes;
  };

  const distanceToNearestBuildingAABB = (point) => {
    const boxes = collectBuildingBoxes();
    let best = Infinity;
    const p = point.isVector3 ? point : new THREE.Vector3(point.x, point.y, point.z);
    for (const box of boxes) {
      const dx = p.x < box.min.x ? box.min.x - p.x : p.x > box.max.x ? p.x - box.max.x : 0;
      const dy = p.y < box.min.y ? box.min.y - p.y : p.y > box.max.y ? p.y - box.max.y : 0;
      const dz = p.z < box.min.z ? box.min.z - p.z : p.z > box.max.z ? p.z - box.max.z : 0;
      const d = Math.hypot(dx, dy, dz);
      if (d < best) best = d;
    }
    return best;
  };

  const artWindowOf = (W, H) => {
    const plate = document.querySelector('.landing-hero__plate')?.getBoundingClientRect();
    const box = canvas.getBoundingClientRect();
    let frac = 0.45;
    if (plate && box.width > 8) {
      const raw = (plate.right - 16 - box.left) / box.width;
      if (Number.isFinite(raw) && raw >= 0.32 && raw <= 0.58) frac = raw;
    }
    return {
      artX0: Math.max(0, Math.min(W - 8, Math.floor(frac * W))),
      artX1: W - 1,
      artY0: 0,
      artY1: H - 1,
    };
  };

  const storeMeasured = (buf, W, H, art) => {
    const w = art.artX1 - art.artX0 + 1;
    const h = art.artY1 - art.artY0 + 1;
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      const srcY = art.artY0 + y;
      const src = ((H - 1 - srcY) * W + art.artX0) * 4;
      pixels.set(buf.subarray(src, src + w * 4), y * w * 4);
    }
    lastMeasured = { width: w, height: h, pixels };
    return lastMeasured;
  };

  const encodeMeasuredPng = async () => {
    if (!lastMeasured) return null;
    const { width, height, pixels } = lastMeasured;
    const off = new OffscreenCanvas(width, height);
    const ctx = off.getContext('2d', { alpha: false, willReadFrequently: true });
    const img = ctx.createImageData(width, height);
    img.data.set(pixels);
    ctx.putImageData(img, 0, 0);
    const blob = await off.convertToBlob({ type: 'image/png' });
    const ab = await blob.arrayBuffer();
    const bytes = new Uint8Array(ab);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  };

  const madAgainstMeasured = async (pngB64) => {
    if (!lastMeasured) return null;
    const raw = String(pngB64 || '').replace(/^data:image\/png;base64,/, '');
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${raw}`)).blob());
    const off = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = off.getContext('2d', { alpha: false, willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const got = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    const a = lastMeasured.pixels;
    const n = Math.min(a.length, got.length);
    if (n < 4 || bmp.width !== lastMeasured.width || bmp.height !== lastMeasured.height) {
      return 255;
    }
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n; i += 4) {
      sum += Math.abs(a[i] - got[i]) + Math.abs(a[i + 1] - got[i + 1]) + Math.abs(a[i + 2] - got[i + 2]);
      count += 1;
    }
    return Number((sum / Math.max(1, count * 3)).toFixed(4));
  };

  const exportMeasuredRgba = () => {
    if (!lastMeasured) return null;
    const { width, height, pixels } = lastMeasured;
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < pixels.length; i += chunk) {
      bin += String.fromCharCode(...pixels.subarray(i, i + chunk));
    }
    return { width, height, b64: btoa(bin) };
  };

  const raycastArtGrid = (art, W, H) => {
    const raycaster = new THREE.Raycaster();
    raycaster.far = 420;
    const extentX = city.extent.x;
    const extentZ = city.extent.z;
    const cols = 24;
    const rows = 24;
    const samples = [];
    const artW = Math.max(1, art.artX1 - art.artX0);
    const artH = Math.max(1, art.artY1 - art.artY0);
    for (let iy = 0; iy < rows; iy += 1) {
      for (let ix = 0; ix < cols; ix += 1) {
        const px = art.artX0 + ((ix + 0.5) / cols) * artW;
        const py = art.artY0 + ((iy + 0.5) / rows) * artH;
        const ndcX = (px / W) * 2 - 1;
        const ndcY = 1 - (py / H) * 2;
        raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
        const hits = raycaster.intersectObjects([scene], true);
        const hit = hits.find((entry) => !isSkyDome(entry.object)) ?? hits[0] ?? null;
        const ny = (py - art.artY0) / artH;
        if (!hit) {
          samples.push({
            ix, iy, row: iy, ny, hit: false, distance: Infinity,
            point: null, object: null, normalY: 0,
          });
          continue;
        }
        const n = worldNormal(hit);
        samples.push({
          ix, iy, row: iy, ny, hit: true, distance: hit.distance,
          point: hit.point, object: hit.object, face: hit.face, normalY: n.y,
        });
      }
    }

    const totalHits = samples.filter((s) => s.hit).length || 1;
    const isRoof = (s) => s.hit && s.normalY > 0.6 && s.point.y > 2.5 && isUnderBuildingRoot(s.object);
    const isGround = (s) => s.hit && isFieldGround(s.object);
    const offBoard = (s) => s.hit && isGroundPlane(s.object)
      && !/landing-shore/.test(ancestorBlob(s.object))
      && (s.point.x < 0 || s.point.x > extentX || s.point.z < 0 || s.point.z > extentZ);

    const roofHits = samples.filter(isRoof).length;
    const groundHits = samples.filter(isGround).length;
    const roofFrac = roofHits / totalHits;
    const groundFracAll = groundHits / totalHits;
    const bottom = samples.filter((s) => s.ny >= 0.60);
    const groundFracBottom = bottom.filter(isGround).length / Math.max(1, bottom.length);
    const rowsHit = new Set(samples.filter(offBoard).map((s) => s.row));

    const nonGround = samples.filter((s) => s.hit && !isGround(s));
    const bins = new Array(16).fill(0);
    for (const s of nonGround) {
      const bin = Math.min(bins.length - 1, Math.floor(s.distance / 8));
      bins[bin] += 1;
    }
    const depthLayers = bins.filter((b) => b >= 0.08 * Math.max(1, nonGround.length)).length;

    const band = samples.filter((s) => s.ny >= 0.45 && s.ny <= 0.80);
    const facade = band.filter((s) => {
      if (!s.hit || Math.abs(s.normalY) >= 0.35 || s.point.y <= 0.5 || s.point.y >= 9) return false;
      const name = ancestorBlob(s.object);
      if (/person|people|figure|pedestrian|ambient|traffic|tram/.test(name)) return false;
      return true;
    });
    const facadeBand = facade.length / Math.max(1, band.length);

    const skyBand = samples.filter((s) => s.ny < 0.15 && s.hit);
    const floating = skyBand.filter((s) => {
      if (isSkyDome(s.object) || isGroundPlane(s.object) || isUnderBuildingRoot(s.object)) return false;
      const name = ancestorBlob(s.object);
      if (/props:|transit:|tram|foliage|nature:|park:|traffic|people|person|opening:|succession:crane|crane|catenary|wire|boom|mast|pole|overhead|lamp|light|signal|sign|finial|banner|flag|antenna/.test(name)) return false;
      return distanceToNearestBuildingAABB(s.point) > 3.2;
    });
    const leafName = (obj) => {
      const parts = [];
      let node = obj;
      let hops = 0;
      while (node && hops < 4) {
        const geo = node.geometry?.name;
        if (geo) parts.push(`geo:${geo}`);
        if (node.name) parts.push(String(node.name));
        node = node.parent;
        hops += 1;
      }
      return parts.join(' < ') || '(unnamed)';
    };
    const floatingNames = [];
    const seenFloat = new Set();
    for (const s of floating) {
      const key = leafName(s.object);
      if (seenFloat.has(key)) continue;
      seenFloat.add(key);
      floatingNames.push(key);
      if (floatingNames.length >= 12) break;
    }

    return {
      roofFrac: Number(roofFrac.toFixed(3)),
      groundFracAll: Number(groundFracAll.toFixed(3)),
      groundFracBottom: Number(groundFracBottom.toFixed(3)),
      offBoardGroundRows: rowsHit.size,
      depthLayers,
      facadeBand: Number(facadeBand.toFixed(3)),
      floatingSky: floating.length,
      floatingNames,
      rayHits: totalHits,
    };
  };

  const measureShot = (opts = {}) => {
    const asEntry = Boolean(opts.entry);
    if (opts.render !== false) renderOnce();
    const gl = renderer.getContext();
    const W = canvas.width;
    const H = canvas.height;
    if (!W || !H) {
      return { fail: true, why: 'empty-canvas', emptyFrac: 1, flatFrac: 1, voidFrac: 1 };
    }
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const art = artWindowOf(W, H);
    storeMeasured(buf, W, H, art);
    const at = (x, y) => {
      const i = ((H - 1 - y) * W + x) * 4;
      return [buf[i], buf[i + 1], buf[i + 2]];
    };
    const { artX0, artX1, artY0, artY1 } = art;
    const buckets = new Map();
    let nModal = 0;
    for (let y = artY0; y < artY1; y += 3) {
      for (let x = artX0; x < artX1; x += 3) {
        const p = at(x, y);
        nModal += 1;
        const key = `${p[0] >> 3}-${p[1] >> 3}-${p[2] >> 3}`;
        const entry = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
        entry.n += 1;
        entry.r += p[0];
        entry.g += p[1];
        entry.b += p[2];
        buckets.set(key, entry);
      }
    }
    let top = null;
    for (const entry of buckets.values()) if (!top || entry.n > top.n) top = entry;
    const modal = top
      ? [top.r / top.n, top.g / top.n, top.b / top.n]
      : [140, 148, 70];
    const haze = [...LANDING_HAZE_RGB];
    const hazeTan = [0xc4, 0xa8, 0x82];
    const hazeBand = [0x8f, 0x73, 0x52];
    const khakiField = [0x68, 0x6c, 0x42];
    let empty = 0;
    let flat = 0;
    let cleared = 0;
    let unlit = 0;
    let m = 0;
    for (let y = artY0 + 2; y < artY1 - 2; y += 2) {
      for (let x = artX0 + 2; x < artX1 - 2; x += 2) {
        const p = at(x, y);
        m += 1;
        const lawn = (p[1] > 120 && p[0] > 110 && p[2] < 155 && p[1] >= p[0] - 10 && p[1] > p[2] + 12)
          || (p[1] > p[0] + 8 && p[1] > p[2] + 4 && p[1] > 98 && p[1] < 210 && Math.abs(p[0] - p[2]) < 55);
        if (lawn || Math.hypot(p[0] - modal[0], p[1] - modal[1], p[2] - modal[2]) < 22) empty += 1;
        const inTop = y < artY0 + (artY1 - artY0) * 0.22;
        const hd = Math.abs(p[0] - haze[0]) + Math.abs(p[1] - haze[1]) + Math.abs(p[2] - haze[2]);
        const td = Math.abs(p[0] - hazeTan[0]) + Math.abs(p[1] - hazeTan[1]) + Math.abs(p[2] - hazeTan[2]);
        const kd = Math.abs(p[0] - khakiField[0]) + Math.abs(p[1] - khakiField[1]) + Math.abs(p[2] - khakiField[2]);
        if (inTop && (hd <= 16 || td <= 16 || kd <= 18)) cleared += 1;
        const lum = (p[0] + p[1] + p[2]) / 3;
        if (lum < 22 && p[1] < 28) unlit += 1;
        let lo = 255;
        let hi = 0;
        for (let dy = -2; dy <= 2; dy += 2) {
          for (let dx = -2; dx <= 2; dx += 2) {
            const q = at(x + dx, y + dy);
            const l = (q[0] + q[1] + q[2]) / 3;
            if (l < lo) lo = l;
            if (l > hi) hi = l;
          }
        }
        if (hi - lo < 7) flat += 1;
      }
    }
    const emptyFrac = empty / Math.max(1, m);
    const flatFrac = flat / Math.max(1, m);
    const voidFrac = cleared / Math.max(1, m);
    const unlitFrac = unlit / Math.max(1, m);

    let paleN = 0;
    let paleHits = 0;
    let topPaleN = 0;
    let topPaleHits = 0;
    for (let y = artY0; y < artY1; y += 2) {
      for (let x = artX0; x < artX1; x += 2) {
        const p = at(x, y);
        const mx = Math.max(p[0], p[1], p[2]);
        const mn = Math.min(p[0], p[1], p[2]);
        const isPale = mx > 170 && (mx - mn) < 26;
        paleN += 1;
        if (isPale) paleHits += 1;
        if (y < artY0 + (artY1 - artY0) / 3) {
          topPaleN += 1;
          if (isPale) topPaleHits += 1;
        }
      }
    }
    const skyFrac = paleHits / Math.max(1, paleN);
    const topThirdSky = topPaleHits / Math.max(1, topPaleN);

    const lumOf = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
    const chromaOf = (p) => Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]);
    const hueBucket = (p) => {
      const r = p[0] / 255;
      const g = p[1] / 255;
      const b = p[2] / 255;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const d = mx - mn;
      if (d < 1e-4) return 24;
      let h = 0;
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      return Math.floor((((h * 60) + 360) % 360) / 15);
    };
    const isPaleSky = (p) => {
      const mx = Math.max(p[0], p[1], p[2]);
      return mx > 165 && chromaOf(p) < 32;
    };
    const topY1 = artY0 + Math.floor((artY1 - artY0) / 3);
    const paleLums = [];
    for (let y = artY0; y < topY1; y += 2) {
      for (let x = artX0; x < artX1; x += 2) {
        const p = at(x, y);
        if (isPaleSky(p)) paleLums.push(lumOf(p));
      }
    }
    const paleMean = paleLums.reduce((a, b) => a + b, 0) / Math.max(1, paleLums.length);
    let paleVar = 0;
    for (const value of paleLums) paleVar += (value - paleMean) ** 2;
    const horizonSd = paleLums.length < 40 ? 0 : Math.sqrt(paleVar / paleLums.length);
    let horizonBandPx = 0;
    let horizonBandSpan = 0;
    let runH = 0;
    let runSpan = 0;
    let runBucket = null;
    let runLum = null;
    let runStartLum = null;
    let prevRowLum = null;
    let enterJump = 0;
    const rowW = Math.max(1, Math.floor((artX1 - artX0) / 2));
    const bandY1 = artY0 + Math.floor((artY1 - artY0) * 0.42);
    const closeRun = (exitLum) => {
      const hard = enterJump > 12 || (exitLum != null && Math.abs(exitLum - runLum) > 12);
      const uniform = runStartLum != null && Math.abs(runLum - runStartLum) < 8;
      if (hard && uniform && runH > horizonBandPx && runSpan > 0.5) {
        horizonBandPx = runH;
        horizonBandSpan = runSpan;
      }
    };
    for (let y = artY0; y < bandY1; y += 1) {
      const buckets = new Map();
      let rowLum = 0;
      let rowN = 0;
      for (let x = artX0; x < artX1; x += 2) {
        const p = at(x, y);
        const chroma = chromaOf(p);
        const key = chroma < 18 ? 24 : hueBucket(p);
        const entry = buckets.get(key) || { n: 0, lum: 0 };
        entry.n += 1;
        entry.lum += lumOf(p);
        buckets.set(key, entry);
        rowLum += lumOf(p);
        rowN += 1;
      }
      let top = null;
      let topKey = null;
      for (const [key, entry] of buckets) {
        if (!top || entry.n > top.n) {
          top = entry;
          topKey = key;
        }
      }
      const span = (top?.n ?? 0) / rowW;
      const meanL = top && top.n ? top.lum / top.n : rowLum / Math.max(1, rowN);
      const same = runBucket != null && topKey === runBucket && Math.abs(meanL - runLum) < 2.4;
      if (span > 0.5 && (runH === 0 || same)) {
        if (runH === 0) {
          enterJump = prevRowLum == null ? 20 : Math.abs(meanL - prevRowLum);
          runStartLum = meanL;
        }
        runH += 1;
        runSpan = Math.max(runSpan, span);
        runBucket = topKey;
        runLum = meanL;
      } else {
        if (runH) closeRun(meanL);
        if (span > 0.5) {
          enterJump = prevRowLum == null ? 20 : Math.abs(meanL - prevRowLum);
          runH = 1;
          runSpan = span;
          runBucket = topKey;
          runLum = meanL;
          runStartLum = meanL;
        } else {
          runH = 0;
          runSpan = 0;
          runBucket = null;
          runLum = null;
        }
      }
      prevRowLum = meanL;
    }
    if (runH) closeRun(runStartLum);
    const artH = Math.max(1, artY1 - artY0);
    const horizonBandFrac = horizonBandPx / artH;
    const horizonFail = horizonSd <= 8
      || (horizonBandFrac > 0.22 && horizonBandSpan > 0.5);

    const isSky = (p) => {
      const hd = Math.abs(p[0] - haze[0]) + Math.abs(p[1] - haze[1]) + Math.abs(p[2] - haze[2]);
      const td = Math.abs(p[0] - hazeTan[0]) + Math.abs(p[1] - hazeTan[1]) + Math.abs(p[2] - hazeTan[2]);
      const bd = Math.abs(p[0] - hazeBand[0]) + Math.abs(p[1] - hazeBand[1]) + Math.abs(p[2] - hazeBand[2]);
      const kd = Math.abs(p[0] - khakiField[0]) + Math.abs(p[1] - khakiField[1]) + Math.abs(p[2] - khakiField[2]);
      return hd <= 20 || td <= 20 || bd <= 18 || kd <= 20;
    };
    let hazeRows = 0;
    const rowStep = Math.max(1, Math.floor((artY1 - artY0) / 80));
    for (let y = artY0; y < artY0 + Math.floor((artY1 - artY0) * 0.14); y += rowStep) {
      let sky = 0;
      let tot = 0;
      for (let x = artX0; x < artX1; x += 3) {
        tot += 1;
        if (isSky(at(x, y))) sky += 1;
      }
      if (tot && sky / tot >= 0.48) hazeRows += 1;
    }

    const heightFor = (archetype) => {
      if (/tower/.test(archetype)) return 26;
      if (/walkup|art-deco/.test(archetype)) return 13;
      if (/warehouse/.test(archetype)) return 10;
      if (/rotunda/.test(archetype)) return 9.4;
      if (/shop|terrace/.test(archetype)) return 8.2;
      return 6.4;
    };
    const widthFor = (archetype) => {
      if (/rotunda/.test(archetype)) return 12;
      if (/double|walkup|art-deco|warehouse|tower/.test(archetype)) return 16;
      return 8;
    };
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const projectArea = (x, y0, z, w, h) => {
      const mid = new THREE.Vector3(x, y0 + h * 0.5, z);
      const toObj = mid.clone().sub(camera.position);
      if (toObj.length() < 10 || toObj.dot(forward) < 8) return 0;
      const pts = [
        [x - w / 2, y0, z], [x + w / 2, y0, z],
        [x - w / 2, y0 + h, z], [x + w / 2, y0 + h, z],
      ].map(([px, py, pz]) => new THREE.Vector3(px, py, pz).project(camera));
      let minX = 1;
      let maxX = -1;
      let minY = 1;
      let maxY = -1;
      let any = false;
      for (const p of pts) {
        if (p.z > 1) continue;
        any = true;
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      if (!any) return 0;
      minX = Math.max(-1, minX);
      maxX = Math.min(1, maxX);
      minY = Math.max(-1, minY);
      maxY = Math.min(1, maxY);
      if (maxX <= minX || maxY <= minY) return 0;
      return ((maxX - minX) * (maxY - minY)) / 4;
    };
    let maxSubjectH = 0;
    if (city.reserve?.centre) {
      maxSubjectH = Math.max(
        maxSubjectH,
        projectArea(city.reserve.centre.x, 0, city.reserve.centre.z, 12, 9.6),
      );
    }
    for (const parcel of Object.values(city.parcels ?? {})) {
      const arch = parcel.archetypeId || '';
      maxSubjectH = Math.max(
        maxSubjectH,
        projectArea(parcel.centre.x, 0, parcel.centre.z, widthFor(arch), heightFor(arch)),
      );
    }

    const raycaster = new THREE.Raycaster();
    raycaster.far = 220;
    const buildingCells = new Set();
    let tram = false;
    const frustum = new THREE.Frustum();
    const proj = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(proj);
    const countVisiblePeople = () => {
      const visible = [];
      const x0 = Math.max(0, art.artX0 - 48);
      const personRay = new THREE.Raycaster();
      const origin = camera.position;
      const targets = [people?.root, ...lifeLayers.map((layer) => layer.root)]
        .filter(Boolean);
      const consider = (x, z, baseY = 0, height = 1.56) => {
        const feet = new THREE.Vector3(x, baseY + 0.05, z);
        const head = new THREE.Vector3(x, baseY + height, z);
        const hp = head.clone().project(camera);
        const fp = feet.clone().project(camera);
        if (hp.z < -1 || hp.z > 1) return;
        if (hp.x < -1.08 || hp.x > 1.08 || hp.y < -1.08 || hp.y > 1.08) return;
        const px = (hp.x * 0.5 + 0.5) * W;
        const py = (1 - (hp.y * 0.5 + 0.5)) * H;
        if (px < x0 || px > art.artX1 || py < art.artY0 || py > art.artY1) return;
        const screenH = Math.abs(hp.y - fp.y) * 0.5 * H;
        if (screenH < 12) return;
        // Head and shoulders first so a column across a torso cannot erase a
        // figure whose crown still clears it. No proximity hand-back: an
        // occluder in front is an occluder.
        const probes = [
          [0, height * 0.96, 0],
          [0.18, height * 0.93, 0],
          [-0.18, height * 0.93, 0],
          [0, height * 0.93, 0.18],
          [0, height * 0.93, -0.18],
          [0.40, height * 0.90, 0],
          [-0.40, height * 0.90, 0],
          [0, height * 0.84, 0],
          [0.28, height * 0.78, 0],
          [-0.28, height * 0.78, 0],
          [0, height * 0.62, 0],
          [0.22, height * 0.88, 0.22],
          [-0.22, height * 0.88, -0.22],
          [0.32, height * 0.70, 0.12],
          [-0.32, height * 0.70, -0.12],
          [0, height * 1.02, 0],
        ];
        const hitSet = targets.length ? [...targets, board.root] : [scene];
        let seen = false;
        let openHits = 0;
        let solidHits = 0;
        for (const [ox, oy, oz] of probes) {
          const pt = new THREE.Vector3(x + ox, baseY + oy, z + oz);
          const dir = pt.clone().sub(origin);
          const dist = dir.length();
          if (dist < 0.4) continue;
          dir.multiplyScalar(1 / dist);
          personRay.set(origin, dir);
          personRay.far = dist + 0.35;
          const hits = personRay.intersectObjects(hitSet, true);
          const hit = hits.find((entry) => !isSkyDome(entry.object) && !isGroundPlane(entry.object));
          if (!hit) {
            seen = true;
            break;
          }
          const name = ancestorBlob(hit.object);
          if (/person|people|figure|pedestrian|ambient|v332:people/.test(name)) {
            seen = true;
            break;
          }
          if (hit.point.y > baseY + height * 0.98) {
            openHits += 1;
            continue;
          }
          if (/rotunda|balustrade|baluster|handrail|newel|column|civic:|dome|finial|bandstand|rib|capital|plinth/.test(name)) {
            openHits += 1;
            continue;
          }
          solidHits += 1;
        }
        if (!seen && openHits > 0 && solidHits === 0) seen = true;
        if (!seen && openHits >= 4 && openHits > solidHits) seen = true;
        if (seen) visible.push({ x, z });
      };
      for (const layer of lifeLayers) {
        for (const actor of layer.actors ?? []) {
          consider(
            actor._lastX ?? actor.x,
            actor._lastZ ?? actor.z,
            actor.poseY ?? actor.baseY ?? 0,
            actor.height ?? 1.56,
          );
        }
      }
      if (people?.records) {
        for (const rec of people.records.values()) {
          if (rec.lastX == null) continue;
          consider(rec.lastX, rec.lastZ, 0, rec.height ?? 1.7);
        }
      }
      const used = new Array(visible.length).fill(false);
      let n = 0;
      for (let i = 0; i < visible.length; i += 1) {
        if (used[i]) continue;
        used[i] = true;
        n += 1;
        for (let j = i + 1; j < visible.length; j += 1) {
          if (used[j]) continue;
          if (Math.hypot(visible[i].x - visible[j].x, visible[i].z - visible[j].z) < 0.85) {
            used[j] = true;
          }
        }
      }
      return n;
    };
    const peopleCount = countVisiblePeople();
    const peopleSeen = peopleCount > 0;
    const tramRay = new THREE.Raycaster();
    const tramSeen = (worldPos, nameHint = '') => {
      if (!worldPos || !frustum.containsPoint(worldPos)) return false;
      const top = worldPos.clone();
      top.y += 3.1;
      const bot = worldPos.clone();
      bot.y += 0.25;
      const hp = top.clone().project(camera);
      const fp = bot.clone().project(camera);
      if (hp.z < -1 || hp.z > 1) return false;
      if (hp.x < -1.12 || hp.x > 1.12 || hp.y < -1.12 || hp.y > 1.12) return false;
      const px = (hp.x * 0.5 + 0.5) * W;
      const py = (1 - (hp.y * 0.5 + 0.5)) * H;
      if (px < art.artX0 - 24 || px > art.artX1 + 24 || py < art.artY0 - 24 || py > art.artY1 + 24) {
        return false;
      }
      const screenH = Math.abs(hp.y - fp.y) * 0.5 * H;
      if (screenH < 12) return false;
      const aim = worldPos.clone();
      aim.y += 1.4;
      const dir = aim.clone().sub(camera.position);
      const dist = dir.length();
      if (dist < 0.6) return true;
      dir.multiplyScalar(1 / dist);
      tramRay.set(camera.position, dir);
      tramRay.far = dist + 0.8;
      const hits = tramRay.intersectObject(board.root, true);
      const hit = hits.find((entry) => !isSkyDome(entry.object) && !isGroundPlane(entry.object));
      if (!hit) return true;
      const hitName = ancestorBlob(hit.object).toLowerCase();
      if (/tram|w-class|e-class/.test(hitName)
        && !/track|pole|wire|catenary|stop|shelter|sign/.test(hitName)) {
        return true;
      }
      return false;
    };
    scene.traverse((obj) => {
      if (tram) return;
      const name = `${obj.name || ''} ${obj.userData?.modelId || ''}`.toLowerCase();
      if (!name || !/tram|w-class|e-class/.test(name)) return;
      if (/track|pole|wire|catenary|stop|shelter|sign/.test(name) && !/w-class|e-class|tram-body|tram:car/.test(name)) {
        return;
      }
      const pos = obj.getWorldPosition(new THREE.Vector3());
      if (tramSeen(pos, name)) tram = true;
    });
    if (!tram && board.trams?.length) {
      for (const item of board.trams) {
        const pos = item.root?.getWorldPosition?.(new THREE.Vector3())
          ?? item.group?.getWorldPosition?.(new THREE.Vector3())
          ?? item.group?.position;
        const hint = `${item.root?.name || ''} ${item.group?.name || ''} tram`;
        if (pos && tramSeen(pos, hint)) {
          tram = true;
          break;
        }
      }
    }
    for (let iy = 0; iy < 14; iy += 1) {
      for (let ix = 0; ix < 16; ix += 1) {
        const ndcX = -0.05 + (ix / 15) * 1.05;
        const ndcY = 0.92 - (iy / 13) * 1.7;
        raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
        const hits = raycaster.intersectObject(board.root, true);
        const hit = hits.find((entry) => {
          const name = `${entry.object?.name || ''}`.toLowerCase();
          return !/ground|road|lawn|turf|water|path|hoggin/.test(name);
        });
        if (!hit) continue;
        const cellKey = `${Math.round(hit.point.x / 14)}:${Math.round(hit.point.z / 14)}`;
        if (hit.point.y > 1.2) buildingCells.add(cellKey);
      }
    }

    const grid = raycastArtGrid(art, W, H);
    const why = [];
    if (grid.roofFrac > (asEntry ? 0.18 : 0.25)) why.push(`roof ${grid.roofFrac.toFixed(3)}`);
    if (grid.offBoardGroundRows !== 0) why.push(`offBoard ${grid.offBoardGroundRows}`);
    if (grid.groundFracBottom > (asEntry ? 0.30 : 0.45)) why.push(`groundBottom ${grid.groundFracBottom.toFixed(3)}`);
    if (grid.groundFracAll > 0.35) why.push(`groundAll ${grid.groundFracAll.toFixed(3)}`);
    if (asEntry && grid.depthLayers < 2) why.push(`depthLayers ${grid.depthLayers}`);
    if (asEntry && grid.facadeBand < 0.35) why.push(`facade ${grid.facadeBand.toFixed(3)}`);
    // A5 binds on wall-only frames. A layered street (tram, people, or
    // depthLayers ≥ 3) can share a high facadeBand with a blank party wall;
    // only the wall-only case fails the ceiling.
    const wallOnly = people
      ? (grid.depthLayers <= 2 && peopleCount < 2 && !tram)
      : false;
    if (grid.facadeBand > 0.80 && wallOnly) {
      why.push(`facade ${grid.facadeBand.toFixed(3)}`);
    }
    if (grid.floatingSky > 8) why.push(`floating ${grid.floatingSky}`);
    if (skyFrac > 0.32) why.push(`sky ${skyFrac.toFixed(3)}`);
    if (topThirdSky > 0.85) why.push(`topSky ${topThirdSky.toFixed(3)}`);
    return {
      emptyFrac: Number(emptyFrac.toFixed(3)),
      flatFrac: Number(flatFrac.toFixed(3)),
      voidFrac: Number(voidFrac.toFixed(4)),
      hazeRows,
      maxSubjectH: Number(maxSubjectH.toFixed(3)),
      unlitFrac: Number(unlitFrac.toFixed(4)),
      buildings: buildingCells.size,
      people: peopleSeen,
      peopleCount,
      skyFrac: Number(skyFrac.toFixed(3)),
      topThirdSky: Number(topThirdSky.toFixed(3)),
      horizonSd: Number(horizonSd.toFixed(2)),
      horizonBandPx,
      horizonBandSpan: Number(horizonBandSpan.toFixed(3)),
      horizonFail,
      tram,
      fail: why.length > 0,
      why: why.join(','),
      modal: modal.map((v) => Math.round(v)),
      cameraY: lastPose.cameraY,
      pitchDeg: lastPose.pitchDeg,
      eye: lastEye,
      look: lastLook,
      roofFrac: grid.roofFrac,
      groundFracAll: grid.groundFracAll,
      groundFracBottom: grid.groundFracBottom,
      offBoardGroundRows: grid.offBoardGroundRows,
      depthLayers: grid.depthLayers,
      facadeBand: grid.facadeBand,
      floatingSky: grid.floatingSky,
      floatingNames: grid.floatingNames ?? [],
      signature: frameSignature(),
      rayHits: grid.rayHits,
    };
  };

  let artDiffPrev = null;
  const resetArtDiff = () => {
    artDiffPrev = null;
  };
  const compareAndStoreArt = () => {
    if (!lastMeasured) return { mad: 0, pct: 0, first: true, w: 0, h: 0 };
    const cur = lastMeasured;
    if (!artDiffPrev || artDiffPrev.width !== cur.width || artDiffPrev.height !== cur.height) {
      artDiffPrev = {
        width: cur.width,
        height: cur.height,
        pixels: cur.pixels.slice(),
      };
      return { mad: 0, pct: 0, first: true, w: cur.width, h: cur.height };
    }
    const a = artDiffPrev.pixels;
    const b = cur.pixels;
    const nPix = Math.min(a.length, b.length);
    let sum = 0;
    let count = 0;
    let changed = 0;
    for (let i = 0; i < nPix; i += 4) {
      const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      sum += d;
      count += 1;
      if (d > 0) changed += 1;
    }
    a.set(b);
    const mad = count ? sum / (count * 3) : 0;
    const pct = count ? (100 * changed) / count : 0;
    return {
      mad: Number(mad.toFixed(3)),
      pct: Number(pct.toFixed(2)),
      first: false,
      w: cur.width,
      h: cur.height,
    };
  };
  const sampleArtAt = (u) => {
    poseAt(u);
    renderOnce();
    const gl = renderer.getContext();
    const W = canvas.width;
    const H = canvas.height;
    if (!W || !H) return { mad: 0, pct: 0, first: true };
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    storeMeasured(buf, W, H, artWindowOf(W, H));
    return compareAndStoreArt();
  };

  resize();
  poseAt(elapsed / LANDING_LOOP_SECONDS);
  renderOnce();
  neutralizeLandingWheel(canvas);
  canvas.dataset.ready = 'true';
  root?.classList.add('is-live');
  root?.querySelector('[data-landing-hero]')?.classList.add('is-live');
  document.body?.classList.add('landing-has-board');
  resize();
  const bootSize = canvasCssSize(canvas);
  publishLandingBoard({
    ready: true,
    webgl: true,
    software: gpu.software,
    gpu: gpu.gpu,
    pixelRatio,
    pixelCap,
    pixelPinned,
    citySize: cityLabel,
    reserveId: city.reserve?.id ?? null,
    groundDressed: true,
    hazeRgb: LANDING_HAZE_RGB,
    backgroundRgb: LANDING_HAZE_RGB,
    entryU: LANDING_ENTRY_U,
    bootU,
    fpsMedian: 0,
    loopSeconds: LANDING_LOOP_SECONDS,
    cameraY: lastPose.cameraY,
    pitchDeg: lastPose.pitchDeg,
    cameraU: (elapsed / LANDING_LOOP_SECONDS) % 1,
    restyleCount: restyled.swapped.length,
    restyleHistogram: restyled.swapped,
    hasWater: Boolean(water),
    hasFoliage: Boolean(foliage),
    clientW: bootSize.clientW,
    clientH: bootSize.clientH,
    rectW: bootSize.rectW,
    rectH: bootSize.rectH,
    canvasW: canvas.width,
    canvasH: canvas.height,
    beatIds: activeBeats.map((beat) => beat.id),
    beats: activeBeats,
    seek,
    poseTo,
    setBeats,
    measureShot,
    pauseLoop,
    resumeLoop,
    tickFrame,
    frameSignature,
    encodeMeasuredPng,
    madAgainstMeasured,
    exportMeasuredRgba,
    resetArtDiff,
    compareAndStoreArt,
    sampleArtAt,
    shotContext,
    hash() {
      try {
        const gl = renderer.getContext();
        const width = Math.min(48, canvas.width);
        const height = Math.min(28, canvas.height);
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let total = 0;
        for (let i = 0; i < pixels.length; i += 4) total = (total * 33 + pixels[i] + pixels[i + 1] + pixels[i + 2]) >>> 0;
        return total.toString(16);
      } catch {
        return '';
      }
    },
    inventoryApertures() {
      const rows = [];
      const seen = new Set();
      board.root.traverse((obj) => {
        if (!obj.isMesh) return;
        const blob = ancestorBlob(obj);
        const terrace = /terrace/.test(blob);
        const geo = String(obj.geometry?.name || '');
        const mats = [].concat(obj.material || []);
        for (const mat of mats) {
          const variant = String(mat?.userData?.variant || '');
          const family = String(mat?.userData?.family || '');
          const key = `${obj.name}|${geo}|${mat?.name || ''}|${variant}|${family}|${terrace}`;
          if (seen.has(key)) continue;
          const interesting = terrace
            || /window|glass|pane|sash|reveal|opening|interior|shadow|surround|curtain/.test(
              `${obj.name} ${geo} ${variant} ${family} ${mat?.name || ''}`.toLowerCase(),
            );
          if (!interesting) continue;
          seen.add(key);
          const c = mat?.color;
          rows.push({
            terrace,
            name: obj.name || '',
            parent: obj.parent?.name || '',
            geo,
            mat: mat?.name || '',
            variant,
            family,
            instanced: Boolean(obj.isInstancedMesh),
            count: obj.count ?? 1,
            lum: c ? Number((0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b).toFixed(3)) : null,
          });
        }
      });
      const buildings = [];
      if (board.staticBuildings) {
        for (const [id, rec] of board.staticBuildings) {
          if (!/terrace/.test(rec.archetypeId || '')) continue;
          buildings.push({
            id,
            archetypeId: rec.archetypeId,
            facade: rec.facade,
            pos: rec.placement?.position
              ? [rec.placement.position.x, rec.placement.position.y, rec.placement.position.z]
              : null,
          });
        }
      }
      return { rows, buildings };
    },
  });

  function loop(timestamp) {
    frame = null;
    if (disposed || document.hidden || loopPaused) return;
    const dt = lastTimestamp === null ? 0 : Math.min(0.05, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;
    if (!reducedMotion) {
      elapsed += dt;
      simAccum += dt;
      const simHz = medianNumber(fpsWindow) > 0 && medianNumber(fpsWindow) < 50 ? 18 : 30;
      if (simAccum >= 1 / simHz) {
        const step = Math.min(0.08, simAccum);
        phase = advanceLandingIdle(board, phase, step);
        traffic?.update?.(step, elapsed);
        stepCityLife(step);
        simAccum = 0;
      }
      poseAt(elapsed / LANDING_LOOP_SECONDS);
      noteFps(dt);
      maybeCalibrate(dt);
    }
    renderOnce();
    publishPose({ fpsMedian: Number(medianNumber(fpsWindow).toFixed(2)) });
    frame = requestAnimationFrame(loop);
  }
  const resume = () => {
    intersecting = true;
    kickLoop();
  };
  const visibility = () => {
    if (!document.hidden) resume();
  };
  const observer = new IntersectionObserver(([entry]) => {
    intersecting = entry.isIntersecting || true;
    if (!document.hidden) resume();
  }, { threshold: 0.01 });
  observer.observe(canvas);
  window.addEventListener('resize', resize);
  globalThis.visualViewport?.addEventListener('resize', resize);
  const boxObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
  boxObserver?.observe(canvas);
  document.addEventListener('visibilitychange', visibility);
  resume();

  return () => {
    disposed = true;
    if (frame) cancelAnimationFrame(frame);
    observer.disconnect();
    boxObserver?.disconnect();
    window.removeEventListener('resize', resize);
    globalThis.visualViewport?.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', visibility);
    traffic = null;
    people = null;
    lifeLayers.length = 0;
    water?.dispose?.();
    foliage?.dispose?.();
    sky?.dispose();
    post?.dispose();
    renderer.dispose();
  };
}

function formatSaveTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]} · ${match[4]}:${match[5]} UTC` : value;
}

export function replaceSaveNotice(inspection) {
  if (inspection?.status !== 'valid') return null;
  const run = `Seed ${inspection.state.seed} · Q${inspection.state.quarter}`;
  return Object.freeze({
    run,
    continueLabel: `Continue ${run} instead`,
    confirmLabel: 'Replace saved run',
    detail: `Starting a new district replaces your saved run (${run}, saved ${formatSaveTime(inspection.envelope.savedAtEdge)}). Its progress cannot be recovered.`,
  });
}

export function startPressOutcome({ notice, armed }) {
  return notice && !armed ? 'arm' : 'go';
}

// Imagen t5n plates were never authored. Do not probe missing names (those were the r1n 404s).
const LANDING_PLATE_FILES = Object.freeze({});

function probePlateUrl(file) {
  return new URL(`../../assets/img/ui-plates/landing/${file}`, import.meta.url).href;
}

async function wireLandingPlates(root) {
  if (!root) return { wired: [] };
  const wired = [];
  await Promise.all(Object.entries(LANDING_PLATE_FILES).map(async ([prop, names]) => {
    for (const name of names) {
      const href = probePlateUrl(name);
      const ok = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth > 0);
        img.onerror = () => resolve(false);
        img.src = href;
      });
      if (ok) {
        root.style.setProperty(prop, `url("${href}")`);
        wired.push(name);
        return;
      }
    }
  }));
  if (wired.length) root.classList.add('landing-has-plates');
  return { wired };
}

function overlayFocusables(panel) {
  return [...(panel?.querySelectorAll('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])') ?? [])]
    .filter((node) => !node.disabled && !node.hidden && node.getAttribute('aria-hidden') !== 'true');
}

/** Keep the visible goal and document description on the same build setting. */
export function applyLandingTagline(root) {
  if (!root) return;
  const tagline = landingTagline();
  const hero = root.querySelector('.landing-hero__tagline');
  if (hero) hero.textContent = tagline;
  const meta = (root.ownerDocument ?? root).querySelector('meta[name="description"]');
  if (meta) {
    const description = meta.content ?? '';
    const previous = Object.values(LANDING_TAGLINES).find(text => description.endsWith(text));
    const prefix = previous ? description.slice(0, -previous.length).trimEnd() : description.trim();
    meta.setAttribute('content', [prefix, tagline].filter(Boolean).join(' '));
  }
}

export async function mountLanding(root, {
  storage = browserStore,
  locationObject = globalThis.location,
  historyObject = globalThis.history,
  now = () => new Date(),
} = {}) {
  if (!root) return null;
  const seedInput = root.querySelector('#seed-input');
  const seedError = root.querySelector('#seed-error');
  const start = root.querySelector('#start-district');
  const startNote = root.querySelector('#start-note');
  const startTitle = root.querySelector('#overlay-new-title');
  const personaField = root.querySelector('#persona-field');
  mountOperatorCards(personaField);
  const continueLink = root.querySelector('#continue-run');
  const continueMeta = root.querySelector('#continue-meta');
  const continuePanel = root.querySelector('#continue-panel');
  const invalidPanel = root.querySelector('#invalid-save');
  const invalidReason = root.querySelector('#invalid-save-reason');
  const modeInputs = [...root.querySelectorAll('input[name="launch-kind"], input[name="mode"]')];
  const operatorInputs = () => [...root.querySelectorAll('input[name="operator"]')];
  const overlays = [...root.querySelectorAll('[data-overlay]')];
  const scrim = root.querySelector('[data-landing-scrim]');
  const departure = root.querySelector('[data-landing-departure]');
  const params = new URLSearchParams(locationObject.search);
  const initialSelection = seedSelectionFromParams(params);
  if (seedInput) seedInput.value = params.has('seed') ? String(initialSelection.seed) : '';
  let selectedDaily = initialSelection.seedSource === 'daily' ? initialSelection : null;
  let lastFocus = null;
  let openName = null;

  const applyDaily = () => {
    const seedStamp = utcSeedStamp(now());
    const seed = dailySeedFromStamp(seedStamp);
    selectedDaily = { seed, seedSource: 'daily', seedStamp };
    if (seedInput) seedInput.value = String(seed);
    if (seedError) seedError.textContent = '';
    seedInput?.removeAttribute('aria-invalid');
    const dailyInput = modeInputs.find(({ value }) => value === 'daily');
    if (dailyInput) dailyInput.checked = true;
    if (startTitle) startTitle.textContent = 'Daily District';
    const landingParams = new URLSearchParams();
    landingParams.set('seed', String(seed));
    landingParams.set('daily', seedStamp);
    try {
      historyObject.replaceState({}, '', `${locationObject.pathname}?${landingParams.toString()}`);
    } catch { /* optional history */ }
  };

  const closeOverlays = () => {
    for (const panel of overlays) panel.hidden = true;
    if (scrim) scrim.hidden = true;
    root.removeAttribute('data-open-overlay');
    document.body?.classList.remove('landing-overlay-open');
    openName = null;
    const restore = lastFocus;
    lastFocus = null;
    if (restore && typeof restore.focus === 'function') restore.focus();
  };

  const openOverlay = (name) => {
    const next = overlays.find((panel) => panel.dataset.overlay === name);
    if (!next) return;
    lastFocus = document.activeElement;
    for (const panel of overlays) panel.hidden = panel !== next;
    if (scrim) scrim.hidden = false;
    root.setAttribute('data-open-overlay', name);
    document.body?.classList.add('landing-overlay-open');
    openName = name;
    if (name === 'office') {
      root.querySelectorAll('[data-reveal]').forEach((node) => node.classList.add('is-in'));
      const videos = [...next.querySelectorAll('video')];
      videos.forEach((video, index) => {
        video.muted = true;
        video.defaultMuted = true;
        video.loop = true;
        video.playsInline = true;
        globalThis.setTimeout(() => {
          if (video.readyState >= 2) video.play?.().catch(() => {});
          else video.load?.();
        }, index * 280);
      });
    }
    const focusable = overlayFocusables(next);
    (focusable[0] ?? next.querySelector('.landing-overlay__close'))?.focus?.();
  };

  const continueUrlFor = (inspection) => buildPlayUrl({
    seed: inspection.state.seed,
    seedSource: inspection.runStart.seedSource,
    seedStamp: inspection.runStart.seedStamp,
    mode: inspection.runStart.mode === 'hotseat' ? 'solo' : inspection.runStart.mode,
    continueRun: true,
  });

  const saveInspection = inspectLocalRun(storage.get(LAST_RUN_KEY));
  if (saveInspection.status === 'valid' && continueLink) {
    root.querySelector('#rack-new')?.classList.remove('landing-plate--primary');
    continueLink.classList.add('landing-plate--primary');
    continueLink.removeAttribute('aria-disabled');
    continueLink.removeAttribute('tabindex');
    if (continuePanel) continuePanel.hidden = false;
    if (continueMeta) {
      continueMeta.textContent = `Seed ${saveInspection.state.seed} · Q${saveInspection.state.quarter} · ${formatSaveTime(saveInspection.envelope.savedAtEdge)}`;
    }
    continueLink.href = continueUrlFor(saveInspection);
  } else if (saveInspection.status === 'invalid' && invalidPanel) {
    invalidPanel.hidden = false;
    if (invalidReason) invalidReason.textContent = saveInspection.reason;
  }

  const replacePanel = root.querySelector('#replace-save');
  const replaceDetail = root.querySelector('#replace-save-detail');
  const replaceContinue = root.querySelector('#replace-save-continue');
  let replaceNotice = replaceSaveNotice(saveInspection);
  let replaceContinueUrl = replaceNotice ? continueUrlFor(saveInspection) : null;
  let replaceArmed = false;

  const disarmReplace = () => {
    replaceArmed = false;
    if (start) start.textContent = 'Start';
    if (replacePanel) delete replacePanel.dataset.armed;
  };

  // Another tab can write the save after this page mounts, so the notice reads storage again
  // whenever the sheet opens, on each press of Start and on its own Continue link. A confirmation
  // given for one saved run does not carry over to a different one.
  function readReplaceNotice() {
    const inspection = inspectLocalRun(storage.get(LAST_RUN_KEY));
    const notice = replaceSaveNotice(inspection);
    if (replaceArmed && notice?.detail !== replaceNotice?.detail) disarmReplace();
    replaceNotice = notice;
    replaceContinueUrl = notice ? continueUrlFor(inspection) : null;
    if (replacePanel) replacePanel.hidden = !notice;
    if (!notice) return;
    if (replaceDetail) replaceDetail.textContent = notice.detail;
    if (replaceContinue) {
      replaceContinue.textContent = notice.continueLabel;
      replaceContinue.href = replaceContinueUrl;
    }
  }

  function prepareReplaceNotice() {
    disarmReplace();
    readReplaceNotice();
  }

  storage.set(MODE_KEY, 'solo');
  if (selectedDaily) {
    const dailyInput = modeInputs.find(({ value }) => value === 'daily');
    if (dailyInput) dailyInput.checked = true;
  }

  root.querySelector('#rack-new')?.addEventListener('click', () => {
    const solo = modeInputs.find(({ value }) => value === 'solo');
    if (solo) solo.checked = true;
    selectedDaily = null;
    if (startTitle) startTitle.textContent = 'New District';
    prepareReplaceNotice();
    openOverlay('new');
  });
  root.querySelector('#rack-daily')?.addEventListener('click', () => {
    applyDaily();
    prepareReplaceNotice();
    openOverlay('new');
  });
  root.querySelector('#rack-how')?.addEventListener('click', () => openOverlay('how'));
  root.querySelectorAll('[data-overlay-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeOverlays());
  });
  scrim?.addEventListener('click', () => closeOverlays());

  const onDocKey = (event) => {
    if (!openName) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeOverlays();
      return;
    }
    if (event.key !== 'Tab') return;
    const panel = overlays.find((node) => node.dataset.overlay === openName);
    const list = overlayFocusables(panel);
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', onDocKey);

  root.querySelector('#discard-invalid-save')?.addEventListener('click', () => {
    const result = discardInvalidLocalRun(storage);
    if (!result.ok) { if (invalidReason) invalidReason.textContent = result.reason; return; }
    if (invalidPanel) invalidPanel.hidden = true;
  });

  modeInputs.forEach((input) => input.addEventListener('change', () => {
    if (input.value === 'daily' && input.checked) applyDaily();
    else if (input.value === 'solo' && input.checked) {
      selectedDaily = null;
      if (startTitle) startTitle.textContent = 'New District';
    }
  }));

  seedInput?.addEventListener('input', () => {
    if (!selectedDaily || seedInput.value !== String(selectedDaily.seed)) selectedDaily = null;
    if (seedError) seedError.textContent = '';
    seedInput.removeAttribute('aria-invalid');
  });

  const goPlay = (url) => {
    publishLandingBoard({ lastNav: url });
    if (globalThis.__landingStay) return url;
    const navigate = () => { locationObject.href = url; };
    if (!departure) {
      navigate();
      return url;
    }
    let committed = false;
    const commit = (event) => {
      if (event && (event.target !== departure || event.propertyName !== 'opacity')) return;
      if (committed) return;
      committed = true;
      departure.removeEventListener('transitionend', commit);
      navigate();
    };
    departure.addEventListener('transitionend', commit);
    root.classList.add('is-departing');
    document.body?.classList.add('landing-is-departing');
    const durations = globalThis.getComputedStyle?.(departure).transitionDuration
      ?.split(',')
      .map((value) => Number.parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000))
      ?? [];
    if (!durations.some((duration) => duration > 0)) commit();
    return url;
  };

  replaceContinue?.addEventListener('click', (event) => {
    event.preventDefault();
    readReplaceNotice();
    if (replaceContinueUrl) goPlay(replaceContinueUrl);
  });

  continueLink?.addEventListener('click', (event) => {
    if (continueLink.getAttribute('aria-disabled') === 'true' || !continueLink.hasAttribute('href')) {
      event.preventDefault();
      return;
    }
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    goPlay(continueLink.href);
  });

  root.querySelector('#launcher-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!seedInput) return;
    const parsed = parseExplicitSeed(seedInput.value);
    if (!parsed.ok) {
      if (seedError) seedError.textContent = parsed.error;
      seedInput.setAttribute('aria-invalid', 'true');
      seedInput.focus();
      return;
    }
    const dailyOn = modeInputs.find(({ checked }) => checked)?.value === 'daily';
    if (dailyOn && !selectedDaily) applyDaily();
    const selection = selectedDaily && selectedDaily.seed === parsed.seed
      ? selectedDaily
      : { seed: parsed.seed, seedSource: 'explicit', seedStamp: null };
    const operatorId = operatorInputs().find(({ checked }) => checked)?.value ?? DEFAULT_OPERATOR_ID;
    readReplaceNotice();
    if (startPressOutcome({ notice: replaceNotice, armed: replaceArmed }) === 'arm') {
      replaceArmed = true;
      if (start) start.textContent = replaceNotice.confirmLabel;
      if (replacePanel) { replacePanel.hidden = false; replacePanel.dataset.armed = '1'; }
      return;
    }
    goPlay(buildPlayUrl({
      ...selection,
      operatorId,
      mode: 'solo',
    }));
  });

  applyLandingTagline(root);
  if (start) start.textContent = 'Start';
  if (startNote) startNote.textContent = 'One player';

  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const disposeHero = mountLandingHero(root, { reducedMotion });
  bindHeroDocket(root);
  bindAidoPortrait(root);
  bindReportFallbacks(root);
  const disposeCast = mountCastMedia(root, { reducedMotion });
  const disposeReveals = bindScrollReveals(root);
  wireLandingPlates(root).catch(() => {});
  const boardReady = mountIdleBoard(root.querySelector('#landing-board'), { reducedMotion, root });
  boardReady.then((disposeBoard) => {
    if (!disposeBoard) {
      root.classList.remove('is-live');
      document.body?.classList.remove('landing-has-board');
    }
  }).catch(() => {
    root.classList.remove('is-live');
    document.body?.classList.remove('landing-has-board');
  });
  return {
    saveInspection,
    openOverlay,
    closeOverlays,
    dispose() {
      document.removeEventListener('keydown', onDocKey);
      disposeHero?.();
      disposeReveals?.();
      disposeCast?.();
      boardReady.then((disposeBoard) => disposeBoard?.()).catch(() => {});
    },
  };
}

export function mountLandingHero(root, { reducedMotion = false } = {}) {
  const stage = root?.querySelector('[data-screening] .landing-hero__stage')
    ?? root?.querySelector('[data-landing-hero] .landing-hero__stage');
  if (!stage) return () => {};
  const slides = [...stage.querySelectorAll('[data-hero-slide]')];
  if (!slides.length) return () => {};
  let index = 0;
  let timer = 0;
  const show = (next) => {
    slides.forEach((slide, i) => slide.classList.toggle('is-active', i === next));
    const active = slides[next];
    const video = active.querySelector('[data-hero-video]');
    const poster = active.querySelector('img');
    slides.forEach((slide) => {
      const other = slide.querySelector('[data-hero-video]');
      if (other && other !== video) {
        other.pause?.();
        other.classList.remove('is-ready');
      }
    });
    if (poster) poster.classList.toggle('is-kenburns', !reducedMotion);
    if (!video) return;
    const tryPlay = () => {
      if (video.readyState >= 2 && video.videoWidth > 0) {
        video.classList.add('is-ready');
        video.play?.().catch(() => { video.classList.remove('is-ready'); });
      }
    };
    video.addEventListener('loadeddata', tryPlay, { once: true });
    video.addEventListener('error', () => {
      video.classList.remove('is-ready');
      if (poster) poster.classList.add('is-kenburns');
    }, { once: true });
    if (video.readyState >= 2) tryPlay();
    else video.load?.();
  };
  show(0);
  if (!reducedMotion) {
    timer = globalThis.setInterval(() => {
      index = (index + 1) % slides.length;
      show(index);
    }, 6000);
  }
  return () => {
    if (timer) globalThis.clearInterval(timer);
  };
}

function bindHeroDocket(root) {
  const docket = root?.querySelector('[data-hero-docket]');
  if (!docket) return;
  const videos = [...(root.querySelectorAll('[data-hero-video]') ?? [])];
  const sync = () => {
    const live = videos.some((video) => video.readyState >= 2 && video.videoWidth > 0);
    docket.hidden = !live;
  };
  for (const video of videos) {
    video.addEventListener('loadeddata', sync);
    video.addEventListener('error', sync);
  }
  sync();
}

function bindReportFallbacks(root) {
  const fallback = {
    'report-deed.png': 'vignette-deed.png',
    'report-dossier.png': 'vignette-dossier.png',
    'report-settlement.png': 'vignette-settlement.png',
  };
  for (const img of root?.querySelectorAll('[data-report-band] img') ?? []) {
    img.addEventListener('error', () => {
      const file = String(img.getAttribute('src') || '').split('/').pop();
      const next = fallback[file];
      if (next) img.src = `assets/img/ui-plates/landing/${next}`;
    }, { once: true });
  }
}

function bindAidoPortrait(root) {
  const img = root?.querySelector('[data-aido-portrait]');
  if (!img) return;
  const fail = () => {
    img.classList.add('is-absent');
    img.removeAttribute('src');
    img.alt = '';
  };
  img.addEventListener('error', fail, { once: true });
  if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) fail();
}

function neutralizeLandingWheel(canvas) {
  // Play CameraRig binds wheel + preventDefault for zoom. A landing is a
  // document-scroll page and must never consume the wheel.
  const release = (event) => {
    event.stopImmediatePropagation();
  };
  canvas?.addEventListener('wheel', release, { capture: true, passive: true });
  canvas?.addEventListener('mousewheel', release, { capture: true, passive: true });
}

export function mountCastMedia(root, { reducedMotion = false } = {}) {
  const cards = [...(root?.querySelectorAll('.site-pass, .mug-pass') ?? [])];
  let disposed = false;
  const records = [];
  const sync = record => {
    const { card, video, poster } = record;
    const active = !disposed && !reducedMotion && !document.hidden && record.visible && !card.closest('[hidden]');
    if (!active) { video.pause?.(); return; }
    if (!record.loaded) {
      record.loaded = true;
      if (video.dataset.src) video.src = video.dataset.src;
      video.preload = 'metadata';
      video.load?.();
    }
    if (video.readyState < 2) return;
    const play = video.play?.();
    Promise.resolve(play).then(() => {
      if (disposed || document.hidden || !record.visible || card.closest('[hidden]')) { video.pause?.(); return; }
      video.classList.add('is-ready'); poster?.classList.add('is-video-ready');
    }).catch(() => { video.classList.remove('is-ready'); poster?.classList.remove('is-video-ready'); });
  };
  for (const card of cards) {
    const video = card.querySelector('video'), poster = card.querySelector('img');
    if (!video) continue;
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = false;
    video.preload = 'none';
    const record = { card, video, poster, visible:false, loaded:false };
    record.ready = () => sync(record);
    record.failed = () => { video.classList.remove('is-ready'); poster?.classList.remove('is-video-ready'); };
    video.addEventListener('loadeddata', record.ready);
    video.addEventListener('error', record.failed);
    records.push(record);
  }
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      const record = records.find(row => row.card === entry.target);
      if (record) { record.visible = entry.isIntersecting; sync(record); }
    }
  }, { threshold:0.1 }) : null;
  records.forEach(record => observer?.observe(record.card));
  const visibility = () => records.forEach(sync);
  document.addEventListener('visibilitychange', visibility);
  // Without visibility observation the static portraits remain the reliable fallback.
  return () => {
    disposed = true; observer?.disconnect();
    document.removeEventListener('visibilitychange', visibility);
    for (const record of records) {
      record.video.pause?.();
      record.video.removeEventListener('loadeddata', record.ready);
      record.video.removeEventListener('error', record.failed);
    }
  };
}
