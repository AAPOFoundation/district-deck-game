// Voxel-register threat tokens and fight playback.
// Driven only by world.threats (sighting) and current-beat log rows (the fight).
// Deterministic. Tokens are pooled. Tick does not allocate.
// reducedMotion: fade the tokens, no tracers.

import * as THREE from 'three';
import {
  WORLD_CITIES,
  WORLD_CITY_BY_ID,
  WORLD_THREAT_BASIN_BY_ID,
  WORLD_TRADE_BY_ID,
} from '../../core/world/catalog.js';
import { liveThreats } from '../../core/world/threats.js';
import { shipmentLaneFraction } from '../../core/world/shipments.js';
import { cargoLift, cargoWaypoints, CARGO_MODE } from './cargo-lanes.js';
import {
  GLOBE_RADIUS,
  cellToLatLon,
  isLandCell,
  latLonToCell,
} from './world-globe.js';
import { itemIconHtml } from './item-icons.js';

export const THREAT_FIGHT_MS = 6000;
export const THREAT_EASE_MS = 2600;
export const THREAT_CONCURRENCY_CAP = 2;
export const THREAT_SIGHTING_CAP = 4;
export const FIGHT_ZOOM = 1.12;
export const FIGHT_VIEWPORT_INSET_PX = 40;
/**
 * M5 F4 — the pan is a last correction, not the framing. Past this the camera
 * offset drags the globe off its own stage and the desk shows through.
 */
export const FIGHT_PAN_MAX_PX = 120;
export const PIRATE_TOKEN_SCALE = 0.54;
export const DRONE_TOKEN_SCALE = 0.50;
export const ESCORT_TOKEN_SCALE = 0.68;
export const ESCORT_MAX_PX = 90;
export const PACK_MAX_PX = 70;
export const SWARM_MAX_PX = 70;
/**
 * M5 F1 — a hull with a bow and a superstructure needs more than 24 px of
 * longest side before those three parts separate. Still an order of magnitude
 * under M4's 362 px overshoot, and the max caps are unchanged.
 */
export const TOKEN_MIN_PX = 34;
/**
 * M8 item 4 — at play scale the salvo is still small.
 *
 * M7's receipt: muzzle flashes 19 and 14 px, hit 16 px, at a 34 px token. On
 * the plate those read; on the globe as the user actually looks at it they are
 * specks. The flash and the hit halo are doubled — the built star sizes and
 * the caps together, because a cap of 40 cannot carry a 38 px flash without
 * clipping the spikes that make it a flash — and the tracer core is left where
 * M7 measured it, because a doubled tracer is the white slab M7's first
 * capture already proved.
 */
export const FLASH_MAX_PX = 72;
/**
 * M7 item 4 — the salvo has to be legible, not merely present.
 *
 * M6 put a second exchange over the 4 s frame and measured it: `flash0` 22 px,
 * `flash1` 16 px, escort and pack 34 px each. The orchestrator's read of those
 * frames is that the exchange is still small, and the measurements say where.
 * The tracer was built at 0.003 root units — about **1.5 px** at the fitted
 * scale, which is a hairline over open ocean and reads as nothing. The flashes
 * were axis-aligned cubes: at 22 px an additive cube is a white card, not a
 * flash. And the pack carried no hit at all, so the 4 s frame showed guns
 * firing at three boats that were visibly unbothered.
 */
export const TRACER_MIN_PX = 3;
/** M8 — the floor the hit is held to, doubled off M7's measured 16 px. */
export const FLASH_MIN_PX = 24;
/** M8 — the built star sizes. Doubled; the caps above were raised to carry them. */
export const FLASH_STAR_0 = 0.060;
export const FLASH_STAR_1 = 0.044;
export const HIT_STAR_SIZE = 0.068;
/**
 * M8 item 4 — the strike ring. A hit that only blooms and dies is a brighter
 * dot; a ring that leaves it says something arrived. It expands from the hit
 * over `HIT_RING_MS` and fades as it goes, which is the one motion in the
 * exchange the eye can follow at globe scale.
 */
export const HIT_RING_MS = 400;
export const HIT_RING_R0 = 0.012;
export const HIT_RING_R1 = 0.056;
/** The tracer's built core width, in root units. ~3.7 px at the fitted scale. */
export const TRACER_CORE_W = 0.0075;
export const TRACER_HALO_W = 0.013;
/**
 * And SHORT. A 0.062-long bar is 31 px against a 34 px escort-to-pack gap, so
 * four of them additively overlap into one white slab that swallows both
 * parties — which is what the second M7 capture shows. A round in flight is a
 * dash, not a beam.
 */
export const TRACER_LEN = 0.026;
/** M7 item 4 — the pack is a silhouette: a dark hull under a pale deck. */
export const PACK_HULL_HEX = 0x22272b;
export const PACK_DECK_HEX = 0xb4bcc0;
/** Smoke off the pack persists this long; a new puff every cadence. */
export const FIGHT_PUFF_LIFE_MS = 2000;
export const FIGHT_PUFF_CADENCE_MS = 360;
export const FIGHT_PUFF_COUNT = 6;

export const FIGHT_TIMELINE = Object.freeze({
  durationMs: THREAT_FIGHT_MS,
  piratesRepelled: Object.freeze({
    escortClose: Object.freeze([0, 720]),
    muzzle: Object.freeze([720, 2400]),
    tracers: Object.freeze([720, 2400]),
    // MC3 F12 — the audit shot the fight at 4 s and found no exchange, because
    // every gun window had closed by 2.4 s. A fight is more than one salvo: the
    // escort re-engages while the pack scatters, and that second exchange is
    // what the 4 s frame carries.
    muzzle2: Object.freeze([3300, 4900]),
    tracers2: Object.freeze([3300, 4900]),
    // M7 item 4 — the rounds land. A salvo with no hit on the far end is a
    // light show; `packHit` covers the 2.5 s frame and `packHit2` the second
    // exchange, each seated ON the pack rather than in the gap.
    packHit: Object.freeze([2000, 3000]),
    packHit2: Object.freeze([4150, 4900]),
    // Puffs start with the first hit and keep coming; each lives 2 s.
    puffs: Object.freeze([1500, 5200]),
    sink: Object.freeze([1680, 3300]),
    wakesDie: Object.freeze([2100, 4200]),
    scatter: Object.freeze([3000, 5700]),
  }),
  piratesLoss: Object.freeze({
    close: Object.freeze([0, 1500]),
    pips: Object.freeze([900, 4200]),
    darken: Object.freeze([900, 4500]),
  }),
  drones: Object.freeze({
    arrive: Object.freeze([0, 1800]),
    flash1: Object.freeze([1800, 2700]),
    flash2: Object.freeze([3000, 3900]),
    fade: Object.freeze([3900, 6000]),
  }),
});

const MELBOURNE_ID = 'melbourne-inner';
const MELBOURNE_MAP = WORLD_CITY_BY_ID[MELBOURNE_ID]?.map
  ?? WORLD_CITIES.find((city) => city.id === MELBOURNE_ID)?.map
  ?? { lat: -37.81, lon: 144.96 };
const BASS_MAP = WORLD_THREAT_BASIN_BY_ID.bass?.map ?? { lat: -40.38, lon: 145.72 };
const SEA_LIFT = 0.036;

const ECHELON_OFFSETS = Object.freeze([
  Object.freeze([0.000, 0, 0.000]),
  Object.freeze([-0.038, 0, 0.024]),
  Object.freeze([-0.074, 0, 0.046]),
]);
const DIAMOND_OFFSETS = Object.freeze([
  Object.freeze([0, 0.012, 0]),
  Object.freeze([-0.016, 0.010, 0]),
  Object.freeze([0.016, 0.010, 0]),
  Object.freeze([0, 0.010, -0.016]),
  Object.freeze([0, 0.010, 0.016]),
]);
/** MC3 F12 — the token palette: dark hull, pale house, red pack pennant. */
export const ESCORT_HULL_HEX = 0x1d2a33;
export const ESCORT_HOUSE_HEX = 0xdce4e8;
export const PACK_PENNANT_HEX = 0xd23a2a;
const FIGHT_ESCORT_LOCAL = Object.freeze([0.064, 0, -0.016]);
const FIGHT_PACK_LOCAL = Object.freeze([-0.072, 0, 0.024]);
// M5 F1 — the exchange sits in the gap between the two parties. Screen-space
// AABBs of oblique 3D boxes bleed a few pixels past their world separation, so
// the flash is seated nearer the pack than the geometric midpoint.
const FIGHT_FLASH_LOCAL = Object.freeze([-0.012, 0.020, 0.004]);
const CAM_REST_Z = 5.15;
// M5 F12: the sighting mark is a thin basin contour, not a solid square footprint.
const PIRATE_RING_XZ = 0.036;
const DRONE_RING_XZ = 0.032;
const RING_THICKNESS = 0.24;

const yUp = new THREE.Vector3(0, 1, 0);

export function clamp01(value) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function smoothstep(k) {
  const t = clamp01(k);
  return t * t * (3 - 2 * t);
}

export function beatsRemaining(threat, beat) {
  const strike = Number.isInteger(threat?.strikeBeat) ? threat.strikeBeat : 0;
  const now = Number.isInteger(beat) ? beat : 0;
  return Math.max(0, strike - now);
}

export function approachProgress(threat, beat) {
  if (!threat) return 0;
  const span = Math.max(1, (threat.strikeBeat ?? 0) - (threat.beat ?? 0));
  return clamp01(((Number.isInteger(beat) ? beat : 0) - (threat.beat ?? 0)) / span);
}

export function easeBetweenBeats(from, to, nowMs, startMs, reducedMotion) {
  if (reducedMotion) return to;
  const k = clamp01((nowMs - startMs) / THREAT_EASE_MS);
  return from + ((to - from) * smoothstep(k));
}

export function sightedThreats(world, beat = world?.beat ?? 0) {
  return liveThreats(world, beat).filter((row) => row.outcome == null);
}

export function fightLogRows(world, beat = world?.beat ?? 0) {
  const rows = [];
  for (const row of world?.log ?? []) {
    if (row?.beat !== beat) continue;
    if (row.type === 'threat-repelled' || row.type === 'threat-loss' || row.type === 'threat-damage') {
      rows.push(row);
    }
  }
  return rows;
}

export function fightKey(row) {
  const target = row?.targetBook ?? row?.book ?? row?.targetFacility ?? row?.facility ?? '';
  return `${row?.beat ?? 0}:${row?.type ?? ''}:${row?.kind ?? ''}:${target}`;
}

function beatWord(n) {
  return n === 1 ? '1 BEAT' : `${n} BEATS`;
}

function beatWordLower(n) {
  return n === 1 ? '1 beat' : `${n} beats`;
}

function basinLabel(basinId) {
  return WORLD_THREAT_BASIN_BY_ID[basinId]?.label ?? basinId ?? 'the strait';
}

function basinChip(basinId) {
  return basinLabel(basinId).toUpperCase();
}

function bookGoodName(bookId) {
  return WORLD_TRADE_BY_ID[bookId]?.good ?? (typeof bookId === 'string' ? bookId.split('-')[0] : 'book');
}

function sourceCityName(bookId) {
  const from = WORLD_TRADE_BY_ID[bookId]?.from;
  return WORLD_CITY_BY_ID[from]?.mapName ?? 'Taipei';
}

function droneFacilityChip(facility) {
  if (!facility || facility === 'port') return 'TARGET PORT';
  if (facility.startsWith('factory')) return 'TARGET FACTORY';
  return `TARGET ${String(facility).replaceAll('-', ' ').toUpperCase()}`;
}

function droneFacilityYard(facility) {
  if (!facility || facility === 'port') return 'port';
  if (facility.startsWith('factory')) return 'mill';
  return String(facility).replaceAll('-', ' ');
}

export function formatThreatEtaChip(threat, beat) {
  if (!threat) return '';
  const eta = beatsRemaining(threat, beat);
  if (threat.kind === 'pirates') {
    return `PIRATES · ${beatWord(eta)} · ${basinChip(threat.basinId)}`;
  }
  return `DRONES · ${beatWord(eta)} · ${droneFacilityChip(threat.targetFacility)}`;
}

export function formatThreatHoldSegment(threat, beat) {
  if (!threat || threat.outcome != null) return '';
  const eta = beatsRemaining(threat, beat);
  if (threat.kind === 'pirates') {
    const basin = basinLabel(threat.basinId);
    const good = bookGoodName(threat.targetBook);
    if (eta <= 0) return `Pirates sighted — ${basin} · striking the ${good} book.`;
    return `Pirates sighted — ${basin} · ${beatWordLower(eta)} to the ${good} book.`;
  }
  const facility = droneFacilityYard(threat.targetFacility);
  if (eta <= 0) return `Drones inbound — ${facility} under strike.`;
  return `Drones inbound — ${facility} in ${beatWordLower(eta)}.`;
}

export function formatLiveThreatHold(world, beat = world?.beat ?? 0) {
  const live = sightedThreats(world, beat);
  if (live.length === 0) return '';
  let pick = live[0];
  for (const row of live) {
    if (row.strikeBeat < pick.strikeBeat) pick = row;
    else if (row.strikeBeat === pick.strikeBeat && row.kind === 'pirates' && pick.kind !== 'pirates') {
      pick = row;
    }
  }
  return formatThreatHoldSegment(pick, beat);
}

export function appendThreatYardSegment(notice, threatSegment) {
  if (!threatSegment) return typeof notice === 'string' ? notice : '';
  const segment = threatSegment.replace(/\.$/, '');
  const base = String(notice ?? '').replace(/\.$/, '').trim();
  if (!base || base === 'Beat advanced. No Yard crates arrived') {
    return `${segment}.`;
  }
  const parts = base.split(' · ');
  if (parts.length >= 3) {
    return `${parts[0]} · ${parts[1]} · ${segment}.`;
  }
  return `${base} · ${segment}.`;
}

export function formatThreatAdvice(threat) {
  if (!threat || threat.outcome != null) return '';
  if (threat.kind === 'drones') {
    return threat.targetFacility && threat.targetFacility !== 'port'
      ? 'Place a tank beside the mill on the city map'
      : 'Place a tank beside the port on the city map';
  }
  if (threat.basinId === 'bass') return 'Station a base on Bass Strait';
  const city = sourceCityName(threat.targetBook);
  return `Escort the ${city} book with a navy hull`;
}

export function liveThreatAdvice(world, beat = world?.beat ?? 0) {
  const live = sightedThreats(world, beat);
  if (live.length === 0) return '';
  const parts = [];
  const pirates = live.find((row) => row.kind === 'pirates');
  const drones = live.find((row) => row.kind === 'drones');
  if (pirates) parts.push(formatThreatAdvice(pirates));
  if (drones) parts.push(formatThreatAdvice(drones));
  return parts.filter(Boolean).join('. ');
}

export function escortDossierNote(world, bookId, beat = world?.beat ?? 0) {
  if (!bookId) return '';
  const hit = sightedThreats(world, beat).find((row) => (
    row.kind === 'pirates' && row.targetBook === bookId
  ));
  if (!hit) return '';
  const eta = beatsRemaining(hit, beat);
  return `Pirates on this book · ${beatWordLower(eta)} out.`;
}

export function lerpLaneInto(stops, u, out) {
  if (!stops || stops.length === 0) {
    out.lat = 0;
    out.lon = 0;
    return out;
  }
  if (stops.length === 1) {
    out.lat = stops[0].lat;
    out.lon = stops[0].lon;
    return out;
  }
  const clamped = clamp01(u);
  const f = clamped * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(f));
  const local = f - index;
  const a = stops[index];
  const b = stops[index + 1];
  let dLon = b.lon - a.lon;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  out.lat = a.lat + ((b.lat - a.lat) * local);
  out.lon = a.lon + (dLon * local);
  return out;
}

export function lerpLane(stops, u) {
  return lerpLaneInto(stops, u, { lat: 0, lon: 0 });
}

export function closestLaneFraction(stops, target) {
  if (!stops || stops.length < 2 || !target) return 0;
  let best = 0;
  let bestD = Infinity;
  const scratch = { lat: 0, lon: 0 };
  const n = stops.length - 1;
  for (let i = 0; i < n; i += 1) {
    for (let step = 0; step <= 8; step += 1) {
      const local = step / 8;
      lerpLaneInto([stops[i], stops[i + 1]], local, scratch);
      const dLat = scratch.lat - target.lat;
      let dLon = scratch.lon - target.lon;
      if (dLon > 180) dLon -= 360;
      if (dLon < -180) dLon += 360;
      const d = (dLat * dLat) + (dLon * dLon);
      if (d < bestD) {
        bestD = d;
        best = (i + local) / n;
      }
    }
  }
  return best;
}

export function pirateLaneProgress(basinFraction, runnerFraction, progress) {
  return basinFraction + ((runnerFraction - basinFraction) * clamp01(progress));
}

/**
 * MC3 F12 — a sea fight belongs at sea. The pirate lane's midpoint between
 * Taipei and Melbourne falls over New Guinea, and M5 pinned the fight to the
 * pirate token wherever the lane put it, so the audit found the exchange on
 * land. This walks the baked Natural Earth mask outward on an expanding ring
 * and returns the nearest cell whose whole `clear`-cell neighbourhood is water.
 *
 * Deterministic and cheap: the search is an ordered ring scan, not a sample.
 */
export const SEAWARD_MAX_RINGS = 26;
export const SEAWARD_CLEAR_CELLS = 2;
export function isOpenWaterCell(column, row, clear = SEAWARD_CLEAR_CELLS, cols = 960, rows = 480) {
  for (let dr = -clear; dr <= clear; dr += 1) {
    const rr = row + dr;
    if (rr < 0 || rr >= rows) return false;
    for (let dc = -clear; dc <= clear; dc += 1) {
      const cc = ((column + dc) % cols + cols) % cols;
      if (isLandCell(cc, rr)) return false;
    }
  }
  return true;
}

export function seawardPoint(lat, lon, clear = SEAWARD_CLEAR_CELLS, maxRings = SEAWARD_MAX_RINGS) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { lat, lon, moved: 0 };
  const start = latLonToCell(lat, lon);
  if (isOpenWaterCell(start.column, start.row, clear)) return { lat, lon, moved: 0 };
  for (let ring = 1; ring <= maxRings; ring += 1) {
    let best = null;
    for (let dr = -ring; dr <= ring; dr += 1) {
      for (let dc = -ring; dc <= ring; dc += 1) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const rr = start.row + dr;
        if (rr < 0 || rr >= 480) continue;
        const cc = ((start.column + dc) % 960 + 960) % 960;
        if (!isOpenWaterCell(cc, rr, clear)) continue;
        const d2 = (dr * dr) + (dc * dc);
        if (!best || d2 < best.d2 || (d2 === best.d2 && (dr < best.dr || (dr === best.dr && dc < best.dc)))) {
          best = { cc, rr, d2, dr, dc };
        }
      }
    }
    if (best) {
      const at = cellToLatLon(best.cc, best.rr);
      return { lat: at.lat, lon: at.lon, moved: ring };
    }
  }
  return { lat, lon, moved: -1 };
}

/**
 * MC3 F8 — the northern city labels bunched into one strip because every label
 * was placed on its anchor and clamped, with nothing looking at its neighbours.
 * This is the collision pass: anchors keep their order, and a label that cannot
 * sit on its own anchor steps away from it on a fixed ladder until it is clear.
 *
 * Pure and deterministic: same input, same output, no DOM, no time. `items` are
 * centre-anchored rects `{ id, x, y, w, h, rank }`; lower `rank` is placed first
 * and therefore keeps its anchor.
 */
export const LABEL_GAP_PX = 3;
export const LABEL_STEP_PX = 15;
export const LABEL_MAX_STEPS = 7;
export const LABEL_LEADER_PX = 11;
export const LABEL_DROP_STEPS = 2;

function labelOverlap(a, b, gap) {
  return Math.abs(a.x - b.x) * 2 < (a.w + b.w + gap * 2)
    && Math.abs(a.y - b.y) * 2 < (a.h + b.h + gap * 2);
}

export function staggerLabels(items, bounds = null, opts = {}) {
  const gap = opts.gap ?? LABEL_GAP_PX;
  const step = opts.step ?? LABEL_STEP_PX;
  // M13: a dense zoom is not permission to march labels across the stage.
  // Capture/runtime placement gets two local attempts, then drops the lower
  // priority label. The legacy/default ladder remains for older callers.
  const maxSteps = opts.maxSteps
    ?? (opts.dropOnCollision ? LABEL_DROP_STEPS : LABEL_MAX_STEPS);
  const leaderAt = opts.leaderAt ?? LABEL_LEADER_PX;
  const order = [...(items ?? [])].sort((a, b) => (
    (a.rank ?? 0) - (b.rank ?? 0)
    || a.y - b.y
    || a.x - b.x
    || String(a.id).localeCompare(String(b.id))
  ));
  /*
   * ── P14 M11 ITEM 4 — RECTS THAT ARE ALREADY ON THE MAP. ──
   *
   * MC6 pack-d: "colliding labels". The pass was already here and it was
   * already greedy; what it did not know about was everything OUTSIDE its own
   * list. Threat chips and route labels are laid by their own code and clamped
   * only, so a city label could be moved clear of every other city label and
   * still land under a PIRATES chip. `reserved` seeds the placed list with
   * rects the caller has already committed — the threats, which the brief puts
   * first — so the same one pass resolves against all of them.
   */
  const placed = [...(opts.reserved ?? [])];
  const out = [];
  const clampIn = (rect) => {
    if (!bounds) return rect;
    const hw = rect.w / 2;
    const hh = rect.h / 2;
    return {
      ...rect,
      x: Math.max(bounds.left + hw, Math.min(bounds.right - hw, rect.x)),
      y: Math.max(bounds.top + hh, Math.min(bounds.bottom - hh, rect.y)),
    };
  };
  const offsets = [[0, 0]];
  for (let i = 1; i <= maxSteps; i += 1) {
    offsets.push([0, -i * step]);
    offsets.push([0, i * step]);
    offsets.push([-i * step * 1.6, -i * step * 0.5]);
    offsets.push([i * step * 1.6, -i * step * 0.5]);
    offsets.push([-i * step * 1.6, i * step * 0.5]);
    offsets.push([i * step * 1.6, i * step * 0.5]);
    offsets.push([-i * step * 2.6, 0]);
    offsets.push([i * step * 2.6, 0]);
  }
  for (const item of order) {
    let chosen = null;
    for (const [dx, dy] of offsets) {
      const cand = clampIn({ ...item, x: item.x + dx, y: item.y + dy });
      if (Number.isFinite(opts.maxDisplacement)
        && Math.hypot(cand.x - item.x, cand.y - item.y) > opts.maxDisplacement) continue;
      let clash = false;
      for (const other of placed) {
        if (labelOverlap(cand, other, gap)) { clash = true; break; }
      }
      if (!clash) { chosen = cand; break; }
    }
    if (!chosen) {
      // Nowhere clear on the ladder. A stacked label is worse than no label:
      // the strip the audit measured is exactly what stacking produces.
      out.push({
        id: item.id, x: item.x, y: item.y, dx: 0, dy: 0, moved: 0,
        leader: false, hidden: true, priority: item.priority ?? 'rest',
      });
      continue;
    }
    placed.push(chosen);
    const dx = chosen.x - item.x;
    const dy = chosen.y - item.y;
    const moved = Math.hypot(dx, dy);
    out.push({
      id: item.id,
      x: chosen.x,
      y: chosen.y,
      dx,
      dy,
      moved,
      leader: moved >= leaderAt,
      hidden: false,
      priority: item.priority ?? 'rest',
    });
  }
  return out;
}

/** Rects retained by a placement result, with source dimensions restored. */
export function placedLabelRects(placed, items) {
  const byId = new Map((items ?? []).map((it) => [it.id, it]));
  return (placed ?? []).filter((p) => !p.hidden).map((p) => ({
    id: p.id, x: p.x, y: p.y,
    w: byId.get(p.id)?.w ?? p.w ?? 0,
    h: byId.get(p.id)?.h ?? p.h ?? 0,
    priority: p.priority ?? byId.get(p.id)?.priority ?? 'rest',
  }));
}

/**
 * M13's explicit order: home, threats, route endpoints, everything else.
 * Each tier is locked before the next begins, so an item can move locally or
 * disappear but can never displace a more important receipt.
 */
export function placePriorityLabels(tiers, bounds = null, opts = {}) {
  const ordered = [
    ['home', tiers?.home ?? []],
    ['threat', tiers?.threats ?? []],
    ['route-end', tiers?.routeEnds ?? []],
    ['rest', tiers?.rest ?? []],
  ];
  const reserved = [...(opts.reserved ?? [])];
  const out = [];
  for (const [priority, items] of ordered) {
    if (!items.length) continue;
    const source = items.map((item, index) => ({
      ...item,
      priority,
      rank: item.rank ?? index,
    }));
    const placed = staggerLabels(source, bounds, {
      ...opts,
      reserved,
      dropOnCollision: true,
    });
    out.push(...placed);
    reserved.push(...placedLabelRects(placed, source));
  }
  return out;
}

/** True when no placed or reserved rects overlap. The receipt, in one call. */
export function labelsClear(placed, items, gap = LABEL_GAP_PX, reserved = []) {
  const rects = [...(reserved ?? []), ...placedLabelRects(placed, items)];
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      if (labelOverlap(rects[i], rects[j], gap)) return false;
    }
  }
  return true;
}

/**
 * MC3 F12 — where the globe's tilt has to sit for the fight to land on the
 * stage centre.
 *
 * M5 derived this analytically: "the globe is rotated Rx * Ry, so a point at
 * latitude phi lands on the camera axis when rotation.x is exactly phi". The
 * globe's `rotation.order` is `YXZ`, so the composition is Ry * Rx, and under
 * that order the latitude that centres a point depends on its longitude too.
 * The M5 law therefore left the Arafura-latitude fight 140 px low and the
 * 120 px pan cap spent itself dragging the globe up, which is what exposed the
 * desk in the bottom corner.
 *
 * So do not derive it. `projectY(rotX)` hands back the focus point's screen y
 * for a candidate tilt, measured through the real camera; this scans the legal
 * range and refines, which is correct for any rotation order and any camera.
 * Pure: the caller owns the projection.
 */
export const FIGHT_TILT_MIN = -0.78;
export const FIGHT_TILT_MAX = 0.55;
export function solveFightTilt(projectY, targetY, opts = {}) {
  const lo = opts.lo ?? FIGHT_TILT_MIN;
  const hi = opts.hi ?? FIGHT_TILT_MAX;
  const coarse = opts.coarse ?? 15;
  const refines = opts.refines ?? 4;
  let bestX = lo;
  let bestErr = Infinity;
  let a = lo;
  let b = hi;
  for (let pass = 0; pass <= refines; pass += 1) {
    const n = pass === 0 ? coarse : 7;
    for (let i = 0; i < n; i += 1) {
      const x = n === 1 ? a : a + ((b - a) * i) / (n - 1);
      const y = projectY(x);
      if (!Number.isFinite(y)) continue;
      const err = Math.abs(y - targetY);
      if (err < bestErr) {
        bestErr = err;
        bestX = x;
      }
    }
    const half = (b - a) / (pass === 0 ? coarse - 1 : 6);
    a = Math.max(lo, bestX - half);
    b = Math.min(hi, bestX + half);
  }
  return { rotX: bestX, err: bestErr };
}

export function inFightWindow(range, elapsedMs) {
  return elapsedMs >= range[0] && elapsedMs < range[1];
}

export function fightWindowU(range, elapsedMs) {
  const span = Math.max(1, range[1] - range[0]);
  return clamp01((elapsedMs - range[0]) / span);
}

function hash01(id, salt) {
  let h = 2166136261;
  const text = `${id}:${salt}`;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function cityMap(id) {
  return WORLD_CITY_BY_ID[id]?.map ?? MELBOURNE_MAP;
}

function routeStops(routeId) {
  const route = WORLD_TRADE_BY_ID[routeId];
  if (!route) return [];
  const origin = cityMap(route.from);
  const destination = cityMap(route.to);
  return cargoWaypoints(route.id, origin, destination);
}

function bookMidpointMap(routeId) {
  const stops = routeStops(routeId);
  if (stops.length < 2) return BASS_MAP;
  return stops[Math.max(0, Math.min(stops.length - 1, Math.floor(stops.length * 0.45)))];
}

function latLonInto(out, lat, lon, radius) {
  const latRad = lat * (Math.PI / 180);
  const lonRad = lon * (Math.PI / 180);
  const latitudeRadius = radius * Math.cos(latRad);
  out.set(
    latitudeRadius * Math.cos(lonRad),
    radius * Math.sin(latRad),
    -latitudeRadius * Math.sin(lonRad),
  );
  return out;
}

function slerpLatLonInto(from, to, t, out, a, b, c) {
  latLonInto(a, from.lat, from.lon, 1);
  latLonInto(b, to.lat, to.lon, 1);
  const dot = Math.min(1, Math.max(-1, a.dot(b)));
  const angle = Math.acos(dot);
  const denom = Math.sin(angle);
  const fromW = denom > 0.00001 ? Math.sin((1 - t) * angle) / denom : 1 - t;
  const toW = denom > 0.00001 ? Math.sin(t * angle) / denom : t;
  c.set(
    (a.x * fromW) + (b.x * toW),
    (a.y * fromW) + (b.y * toW),
    (a.z * fromW) + (b.z * toW),
  );
  const length = c.length() || 1;
  out.lat = Math.asin(Math.min(1, Math.max(-1, c.y / length))) * 180 / Math.PI;
  out.lon = -Math.atan2(c.z, c.x) * 180 / Math.PI;
  return out;
}

function makeMat(opts) {
  return new THREE.MeshStandardMaterial(opts);
}

function threatShadowTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  gradient.addColorStop(0.58, 'rgba(0, 0, 0, 0.46)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'globe:threat-marker-shadow-map';
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

function addBox(parent, geometry, material, scale, position) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function collectMeshes(root, into) {
  root.traverse((child) => {
    if (child.isMesh) into.push(child);
  });
}

/**
 * M7 item 4 — a flash, not a card. An additive cube at 22 px reads as a white
 * rectangle because it has four straight edges and no centre. A hot core with
 * four spikes off it reads as a gun going off at the same pixel budget, and it
 * survives the screen-fit shrink because the spikes go first.
 */
function addFlashStar(parent, dot, box, material, size, position, name) {
  const g = new THREE.Group();
  g.name = name;
  const core = new THREE.Mesh(dot, material);
  core.scale.setScalar(size * 0.46);
  g.add(core);
  for (let i = 0; i < 4; i += 1) {
    const spike = new THREE.Mesh(box, material);
    const long = size * 1.35;
    const thin = size * 0.16;
    spike.scale.set(long, thin, thin);
    spike.rotation.y = (i / 4) * Math.PI;
    spike.rotation.z = i % 2 ? 0.5 : 0;
    g.add(spike);
  }
  g.position.set(position[0], position[1], position[2]);
  parent.add(g);
  return g;
}

/**
 * M5 F12 — a thin lat/lon contour ring laid flat on the globe, held in a group
 * so the existing `ring.scale.set(r, 0.008, r)` tick still reads in globe units.
 */
function addContourRing(parent, geometry, material, radius, name) {
  const holder = new THREE.Group();
  holder.name = name;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;
  holder.add(mesh);
  holder.scale.set(radius, 0.008, radius);
  holder.position.set(0, 0.006, 0);
  parent.add(holder);
  return holder;
}

export class WorldThreatLayer {
  constructor(globe, {
    reducedMotion = false,
    chipHost = null,
    cargoRunners = null,
    flagGroups = null,
  } = {}) {
    this.globe = globe;
    this.reducedMotion = Boolean(reducedMotion);
    this.chipHost = chipHost;
    this.cargoRunners = cargoRunners;
    this.flagGroups = flagGroups;
    this.root = new THREE.Group();
    this.root.name = 'world-threats';
    globe?.add(this.root);

    this.unitBox = new THREE.BoxGeometry(1, 1, 1);
    this.unitDot = new THREE.SphereGeometry(1, 7, 5);
    // M5 F12: a basin contour, not a footprint. Radius 1 so slot scale still
    // reads in the same units the tick already writes.
    this.unitRing = new THREE.RingGeometry(1 - RING_THICKNESS, 1, 30, 1);
    this.markerDiscGeometry = new THREE.LatheGeometry([
      new THREE.Vector2(0.52, 0.02),
      new THREE.Vector2(0.76, 0.02),
      new THREE.Vector2(0.98, 0.06),
      new THREE.Vector2(1.05, 0.12),
      new THREE.Vector2(0.94, 0.20),
      new THREE.Vector2(0.52, 0.22),
    ], 24);
    this.markerShadowGeometry = new THREE.RingGeometry(0.52, 1.08, 24);
    // The lathed shoulder supplies the edge normal; clearcoat gives it a
    // camera-relative highlight without a third draw call for a separate lip.
    this.markerDiscMat = new THREE.MeshPhysicalMaterial({
      color: 0x3b2525,
      roughness: 0.27,
      metalness: 0.18,
      clearcoat: 0.42,
      clearcoatRoughness: 0.14,
    });
    this.markerDiscMat.name = 'globe:threat-marker-specular-edge';
    this.markerShadowMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: threatShadowTexture(),
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      toneMapped: false,
    });
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._box = new THREE.Box3();
    this._corners = [
      new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
      new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
    ];
    this._lastFightZoom = 1;
    this._lastFightPan = null;
    this._ll = { lat: 0, lon: 0 };
    this._from = { lat: 0, lon: 0 };
    this._to = { lat: 0, lon: 0 };
    this._darkened = null;

    this.piratePool = [];
    this.dronePool = [];
    this.fightPool = [];
    this._buildPools();
    this._buildMelbourneFlash();
    this._buildChips();
  }

  _addMarkerPedestal(root, radius) {
    const shadow = new THREE.Mesh(this.markerShadowGeometry, this.markerShadowMat);
    shadow.name = 'globe:threat-marker-shadow';
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.001;
    shadow.scale.setScalar(radius);
    shadow.renderOrder = 1;
    root.add(shadow);
    const disc = new THREE.Mesh(this.markerDiscGeometry, this.markerDiscMat);
    disc.name = 'globe:threat-marker-disc';
    disc.scale.setScalar(radius);
    disc.castShadow = true;
    disc.receiveShadow = true;
    disc.renderOrder = 2;
    root.add(disc);
    return disc;
  }

  setReducedMotion(on) {
    this.reducedMotion = Boolean(on);
  }

  setChipHost(host) {
    this.chipHost = host;
    if (host) {
      for (const slot of [...this.piratePool, ...this.dronePool]) {
        if (slot.chip && slot.chip.parent !== host) host.append(slot.chip);
      }
    }
  }

  _buildPools() {
    for (let i = 0; i < THREAT_SIGHTING_CAP; i += 1) {
      this.piratePool.push(this._makePirateSlot(i));
      this.dronePool.push(this._makeDroneSlot(i));
    }
    for (let i = 0; i < THREAT_CONCURRENCY_CAP; i += 1) {
      this.fightPool.push(this._makeFightSlot(i));
    }
  }

  _makePirateSlot(index) {
    const hullMat = makeMat({
      color: 0x8c2418, roughness: 0.72, metalness: 0.08,
      emissive: 0x4a0a08, emissiveIntensity: 0.14,
      transparent: true, opacity: 1, depthWrite: false,
    });
    const pennantMat = makeMat({
      color: 0xe07058, roughness: 0.55,
      emissive: 0x8c2418, emissiveIntensity: 0.18,
      transparent: true, opacity: 1, depthWrite: false,
    });
    const wakeMat = makeMat({
      color: 0xc9d4dc, roughness: 0.35,
      transparent: true, opacity: 0.42, depthWrite: false,
    });
    const ringMat = makeMat({
      color: 0xd8563e, roughness: 0.4,
      emissive: 0x6e1a10, emissiveIntensity: 0.85,
      transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide,
    });
    const root = new THREE.Group();
    root.name = `pirate pack ${index}`;
    root.visible = false;
    this._addMarkerPedestal(root, 0.058 * 0.6);
    const token = new THREE.Group();
    token.scale.setScalar(PIRATE_TOKEN_SCALE);
    root.add(token);
    const hulls = [];
    const wakes = [];
    for (let h = 0; h < 3; h += 1) {
      const pack = new THREE.Group();
      pack.position.set(ECHELON_OFFSETS[h][0], ECHELON_OFFSETS[h][1], ECHELON_OFFSETS[h][2]);
      addBox(pack, this.unitBox, hullMat, [0.038, 0.011, 0.014], [0, 0.008, 0]);
      const bow = addBox(pack, this.unitBox, hullMat, [0.016, 0.010, 0.010], [0.024, 0.009, 0]);
      bow.rotation.y = 0.62;
      addBox(pack, this.unitBox, hullMat, [0.012, 0.014, 0.010], [-0.006, 0.016, 0]);
      hulls.push(pack);
      const wake = addBox(pack, this.unitBox, wakeMat, [0.014, 0.003, 0.010], [-0.024, 0.002, 0]);
      wakes.push(wake);
      token.add(pack);
    }
    const pennant = addBox(token, this.unitBox, pennantMat, [0.01, 0.055, 0.028], [0.012, 0.055, 0]);
    const ring = addContourRing(root, this.unitRing, ringMat, PIRATE_RING_XZ, `pirate ring ${index}`);
    this.root.add(root);
    const meshes = [];
    collectMeshes(root, meshes);
    return {
      kind: 'pirates',
      id: null,
      root,
      token,
      hulls,
      wakes,
      pennant,
      ring,
      meshes,
      hullMat,
      pennantMat,
      wakeMat,
      ringMat,
      fromProgress: 0,
      toProgress: 0,
      easeStart: 0,
      basinFraction: 0,
      stops: null,
      chip: null,
      threat: null,
    };
  }

  _makeDroneSlot(index) {
    const bodyMat = makeMat({
      color: 0xa03028, roughness: 0.48, metalness: 0.18,
      emissive: 0x5a1010, emissiveIntensity: 0.16,
      transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide,
    });
    const ringMat = makeMat({
      color: 0xd8563e, roughness: 0.4,
      emissive: 0x6e1a10, emissiveIntensity: 0.85,
      transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide,
    });
    const root = new THREE.Group();
    root.name = `drone swarm ${index}`;
    root.visible = false;
    this._addMarkerPedestal(root, 0.052 * 0.6);
    const token = new THREE.Group();
    token.scale.setScalar(DRONE_TOKEN_SCALE);
    root.add(token);
    const chevrons = [];
    for (let c = 0; c < 5; c += 1) {
      const pack = new THREE.Group();
      pack.position.set(DIAMOND_OFFSETS[c][0], DIAMOND_OFFSETS[c][1], DIAMOND_OFFSETS[c][2]);
      const dot = new THREE.Mesh(this.unitDot, bodyMat);
      dot.scale.setScalar(0.007);
      dot.castShadow = true;
      pack.add(dot);
      chevrons.push(pack);
      token.add(pack);
    }
    const ring = addContourRing(root, this.unitRing, ringMat, DRONE_RING_XZ, `drone ring ${index}`);
    this.root.add(root);
    const meshes = [];
    collectMeshes(root, meshes);
    return {
      kind: 'drones',
      id: null,
      root,
      token,
      chevrons,
      ring,
      meshes,
      bodyMat,
      ringMat,
      fromProgress: 0,
      toProgress: 0,
      easeStart: 0,
      fromMap: MELBOURNE_MAP,
      chip: null,
      threat: null,
    };
  }

  _makeFightSlot(index) {
    // MC3 F12 — a token-scale silhouette that reads at 34 px needs two values,
    // not one: a dark hull under a pale house. The old escort was one mid teal
    // with a pale strip, which at this size is a single teal smudge.
    const escortMat = makeMat({
      color: ESCORT_HULL_HEX, roughness: 0.62, metalness: 0.2,
      emissive: 0x0d161d, emissiveIntensity: 0.35,
      transparent: true, opacity: 1, depthWrite: false,
    });
    const gunwaleMat = makeMat({
      color: ESCORT_HOUSE_HEX, roughness: 0.66, metalness: 0.06,
      emissive: 0x3d4a52, emissiveIntensity: 0.3,
      transparent: true, opacity: 1, depthWrite: false,
    });
    const pennantMat = makeMat({
      color: PACK_PENNANT_HEX, roughness: 0.5, metalness: 0.06,
      emissive: 0x5a0f0a, emissiveIntensity: 0.7,
      transparent: true, opacity: 1, depthWrite: false,
    });
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffe8b0, transparent: true, opacity: 0, depthWrite: false,
      toneMapped: false, blending: THREE.AdditiveBlending,
    });
    const hitMat = new THREE.MeshBasicMaterial({
      color: 0xffd08a, transparent: true, opacity: 0, depthWrite: false,
      toneMapped: false, blending: THREE.AdditiveBlending,
    });
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xfff0c0, transparent: true, opacity: 0, depthWrite: false,
      toneMapped: false, blending: THREE.AdditiveBlending,
    });
    const tracerHaloMat = new THREE.MeshBasicMaterial({
      color: 0xff9a3c, transparent: true, opacity: 0, depthWrite: false,
      toneMapped: false, blending: THREE.AdditiveBlending,
    });
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0x585048, transparent: true, opacity: 0.85, depthWrite: false,
    });
    // M7 item 4 — opaque, so the pack has a silhouette to sink.
    const packHullMat = makeMat({
      color: PACK_HULL_HEX, roughness: 0.6, metalness: 0.18,
      emissive: 0x121618, emissiveIntensity: 0.3,
      transparent: true, opacity: 1, depthWrite: false,
    });
    const packDeckMat = makeMat({
      color: PACK_DECK_HEX, roughness: 0.68, metalness: 0.06,
      emissive: 0x2e3438, emissiveIntensity: 0.3,
      transparent: true, opacity: 1, depthWrite: false,
    });
    const pulseMat = makeMat({
      color: 0xc04030, roughness: 0.4,
      emissive: 0x8c1810, emissiveIntensity: 1.1,
      transparent: true, opacity: 0.55, depthWrite: false,
    });
    const pipMat = makeMat({
      color: 0xc8a24a, roughness: 0.7,
      emissive: 0x5f310d, emissiveIntensity: 0.3,
      transparent: true, opacity: 1, depthWrite: false,
    });
    const root = new THREE.Group();
    root.name = `threat fight ${index}`;
    root.visible = false;
    const escort = new THREE.Group();
    escort.name = `threat fight ${index}:escort`;
    escort.scale.setScalar(ESCORT_TOKEN_SCALE);
    escort.position.set(FIGHT_ESCORT_LOCAL[0], FIGHT_ESCORT_LOCAL[1], FIGHT_ESCORT_LOCAL[2]);
    addBox(escort, this.unitBox, escortMat, [0.062, 0.013, 0.018], [0, 0.010, 0]);
    const bow = addBox(escort, this.unitBox, escortMat, [0.024, 0.014, 0.013], [0.040, 0.012, 0]);
    bow.rotation.y = 0.58;
    // Pale house and mast over a dark hull: three parts, two values, one read.
    addBox(escort, this.unitBox, gunwaleMat, [0.024, 0.020, 0.016], [-0.010, 0.028, 0]);
    addBox(escort, this.unitBox, gunwaleMat, [0.014, 0.010, 0.011], [0.008, 0.030, 0]);
    addBox(escort, this.unitBox, escortMat, [0.004, 0.020, 0.004], [-0.010, 0.046, 0]);
    addBox(escort, this.unitBox, gunwaleMat, [0.058, 0.005, 0.020], [0.002, 0.017, 0]);
    root.add(escort);
    const pack = new THREE.Group();
    pack.name = `threat fight ${index}:pack`;
    pack.scale.setScalar(PIRATE_TOKEN_SCALE);
    pack.position.set(FIGHT_PACK_LOCAL[0], FIGHT_PACK_LOCAL[1], FIGHT_PACK_LOCAL[2]);
    const packHulls = [];
    for (let h = 0; h < 3; h += 1) {
      const skiff = new THREE.Group();
      skiff.position.set(ECHELON_OFFSETS[h][0], ECHELON_OFFSETS[h][1], ECHELON_OFFSETS[h][2]);
      // M7 item 4 — an OPAQUE dark hull under a pale deck. M6 built the pack
      // out of `pulseMat`, the ground-pulse material, at opacity 0.55: three
      // translucent red-brown boxes over blue water merge into one smear, and
      // the skiff that is supposed to be visibly sinking at 4 s had no
      // silhouette to tilt.
      addBox(skiff, this.unitBox, packHullMat, [0.034, 0.010, 0.013], [0, 0.007, 0]);
      const skiffBow = addBox(skiff, this.unitBox, packHullMat, [0.014, 0.009, 0.009], [0.022, 0.008, 0]);
      skiffBow.rotation.y = 0.6;
      addBox(skiff, this.unitBox, packDeckMat, [0.030, 0.003, 0.011], [0, 0.013, 0]);
      addBox(skiff, this.unitBox, packHullMat, [0.010, 0.012, 0.008], [-0.004, 0.017, 0]);
      // MC3 F12 — the pack flies a pennant, so which party is which survives at
      // token scale without reading the hull colour.
      if (h === 0) {
        addBox(skiff, this.unitBox, escortMat, [0.002, 0.016, 0.002], [-0.012, 0.022, 0]);
        addBox(skiff, this.unitBox, pennantMat, [0.011, 0.007, 0.002], [-0.006, 0.028, 0]);
      }
      packHulls.push(skiff);
      pack.add(skiff);
    }
    root.add(pack);
    const flashes = [
      // Sized to fit the escort-to-pack gap outright: at the fitted token sizes
      // that gap is about 33 px, so a 40 px flash could not sit in it without
      // touching one party or the other.
      addFlashStar(root, this.unitDot, this.unitBox, flashMat, FLASH_STAR_0, [
        FIGHT_FLASH_LOCAL[0] + 0.005, FIGHT_FLASH_LOCAL[1] + 0.004, FIGHT_FLASH_LOCAL[2],
      ], `threat fight ${index}:flash:0`),
      addFlashStar(root, this.unitDot, this.unitBox, flashMat, FLASH_STAR_1, [
        FIGHT_FLASH_LOCAL[0] + 0.001, FIGHT_FLASH_LOCAL[1] + 0.002, FIGHT_FLASH_LOCAL[2] - 0.006,
      ], `threat fight ${index}:flash:1`),
    ];
    // The hit, seated on the pack. It is deliberately NOT in `flashes`: the fit
    // pass keeps those inside the escort-to-pack gap, and a hit belongs on the
    // thing that was hit.
    const hitFlash = addFlashStar(root, this.unitDot, this.unitBox, hitMat, HIT_STAR_SIZE, [
      FIGHT_PACK_LOCAL[0], 0.016, FIGHT_PACK_LOCAL[2],
    ], `threat fight ${index}:hit`);
    hitFlash.visible = false;
    // M8 item 4 — the strike ring, on its own material so it can fade
    // independently of the hit it comes off.
    const hitRingMat = makeMat({
      color: 0xffd08a, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
    });
    const hitRing = addContourRing(root, this.unitRing, hitRingMat, HIT_RING_R0,
      `threat fight ${index}:hit-ring`);
    hitRing.visible = false;
    const tracers = [];
    for (let t = 0; t < 4; t += 1) {
      // A tracer is a hot core inside a soft halo. One hairline box was 1.5 px.
      const tracer = new THREE.Group();
      tracer.name = `threat fight ${index}:tracer:${t}`;
      addBox(tracer, this.unitBox, tracerHaloMat, [TRACER_HALO_W, TRACER_HALO_W, TRACER_LEN * 0.92], [0, 0, 0]);
      addBox(tracer, this.unitBox, tracerMat, [TRACER_CORE_W, TRACER_CORE_W, TRACER_LEN], [0, 0, 0]);
      tracer.visible = false;
      root.add(tracer);
      tracers.push(tracer);
    }
    const smokes = [];
    for (let s = 0; s < FIGHT_PUFF_COUNT; s += 1) {
      // Each puff fades on its own clock, so each owns its opacity.
      const puff = new THREE.Mesh(this.unitDot, smokeMat.clone());
      puff.name = `threat fight ${index}:puff:${s}`;
      puff.scale.setScalar(0.010);
      puff.position.set(FIGHT_PACK_LOCAL[0], 0.02, FIGHT_PACK_LOCAL[2]);
      puff.visible = false;
      root.add(puff);
      smokes.push(puff);
    }
    // M7 — the sea mark is a contour ring, not a plate. As a solid quad it read
    // as a flat maroon card lying between the two parties, and it only got away
    // with it while the pack was the same translucent red; against an opaque
    // dark pack it is the loudest thing in the frame.
    const pulse = addContourRing(root, this.unitRing, pulseMat, 0.042, `threat fight ${index}:mark`);
    pulse.visible = false;
    const pips = [];
    for (let p = 0; p < 3; p += 1) {
      const pip = addBox(root, this.unitBox, pipMat, [0.006, 0.005, 0.006], [0, 0.012, 0]);
      pip.visible = false;
      pips.push(pip);
    }
    // M5 F1 — measure the built gap between escort and pack, then cap how far the
    // screen-fit pass may grow either party so at least 30% of that gap survives.
    // Measured BEFORE the slot joins the globe, so the box is in the slot's own
    // frame and not smeared by the globe's live rotation.
    root.updateMatrixWorld(true);
    const eBox = new THREE.Box3().setFromObject(escort);
    const pBox = new THREE.Box3().setFromObject(pack);
    const gapX = Math.max(0, eBox.min.x - pBox.max.x);
    const share = gapX * 0.3;
    const eReach = Math.max(1e-4, escort.position.x - eBox.min.x);
    const pReach = Math.max(1e-4, pBox.max.x - pack.position.x);
    escort.userData.fitMaxScalar = Math.max(1, (eReach + share) / eReach);
    pack.userData.fitMaxScalar = Math.max(1, (pReach + share) / pReach);
    for (const flash of flashes) {
      const fBox = new THREE.Box3().setFromObject(flash);
      const halfF = Math.max(1e-4, (fBox.max.x - fBox.min.x) * 0.5);
      const room = Math.max(1e-4, Math.min(
        eBox.min.x - share - flash.position.x,
        flash.position.x - (pBox.max.x + share),
      ));
      /*
       * M8 item 4 — the ceiling may now be BELOW 1, and that is the point.
       *
       * The muzzle flash is the one part of the exchange the brief's "double
       * it" cannot have outright: M5 F1 is a standing law that the escort, the
       * pack and the flash never interpenetrate, and the flash lives in the gap
       * between the other two. `Math.max(1, ...)` meant the ceiling could only
       * ever permit growth, so doubling the built star simply broke the law.
       * The ceiling is the room, full stop: the flash is built large and the
       * gap decides how much of that it gets, which is "as big as a muzzle
       * flash can be here" rather than a number picked to fit.
       */
      flash.userData.fitMaxScalar = room / halfF;
    }
    this.root.add(root);
    const meshes = [];
    collectMeshes(root, meshes);
    return {
      key: null,
      row: null,
      bornMs: 0,
      gapX,
      root,
      escort,
      pack,
      packHulls,
      flashes,
      hitFlash,
      hitRing,
      hitRingMat,
      tracers,
      smokes,
      pulse,
      pips,
      meshes,
      escortMat,
      gunwaleMat,
      pennantMat,
      packHullMat,
      packDeckMat,
      flashMat,
      hitMat,
      tracerMat,
      tracerHaloMat,
      smokeMat,
      pulseMat,
      pipMat,
      startMap: BASS_MAP,
      targetMap: BASS_MAP,
      focusMap: BASS_MAP,
      shipmentId: null,
    };
  }

  _buildMelbourneFlash() {
    this.melbFlashMat = makeMat({
      color: 0xc04030, roughness: 0.4,
      emissive: 0x8c2418, emissiveIntensity: 1.2,
      transparent: true, opacity: 0, depthWrite: false,
    });
    this.melbFlash = new THREE.Mesh(this.unitBox, this.melbFlashMat);
    this.melbFlash.name = 'melbourne threat flash';
    this.melbFlash.scale.set(0.06, 0.01, 0.06);
    this.melbFlash.position.set(0, 0.006, 0);
    this.melbFlash.visible = false;
  }

  _buildChips() {
    if (typeof document === 'undefined') return;
    for (const slot of [...this.piratePool, ...this.dronePool]) {
      const chip = document.createElement('div');
      chip.className = 'threat-chip';
      chip.hidden = true;
      chip.dataset.kind = slot.kind;
      slot.chip = chip;
      this.chipHost?.append(chip);
    }
  }

  _orient(root, lat, lon, radius) {
    latLonInto(this._v1, lat, lon, radius);
    root.position.copy(this._v1);
    this._v2.copy(this._v1).normalize();
    root.quaternion.setFromUnitVectors(yUp, this._v2);
  }

  _releaseSighting(slot) {
    slot.id = null;
    slot.threat = null;
    slot.stops = null;
    slot.root.visible = false;
    if (slot.chip) slot.chip.hidden = true;
  }

  _assignPirate(slot, threat, nowMs, beat) {
    slot.id = threat.id;
    slot.threat = threat;
    slot.stops = routeStops(threat.targetBook);
    const basin = WORLD_THREAT_BASIN_BY_ID[threat.basinId]?.map ?? BASS_MAP;
    slot.basinFraction = closestLaneFraction(slot.stops, basin);
    const progress = approachProgress(threat, beat);
    slot.fromProgress = progress;
    slot.toProgress = progress;
    slot.easeStart = nowMs;
    slot.root.visible = true;
    this._paintChip(slot, threat, beat);
    this._resetPiratePose(slot);
  }

  _assignDrone(slot, threat, nowMs, beat) {
    slot.id = threat.id;
    slot.threat = threat;
    slot.fromMap = cityMap(threat.from);
    const progress = approachProgress(threat, beat);
    slot.fromProgress = progress;
    slot.toProgress = progress;
    slot.easeStart = nowMs;
    slot.root.visible = true;
    this._paintChip(slot, threat, beat);
  }

  _paintChip(slot, threat, beat) {
    if (!slot.chip) return;
    const live = threat.outcome == null;
    slot.chip.hidden = !live;
    if (!live) return;
    slot.chip.dataset.kind = slot.kind;
    slot.chip.innerHTML = `${itemIconHtml(slot.kind, 16)}<span>${formatThreatEtaChip(threat, beat)}</span>`;
  }

  _resetPiratePose(slot) {
    slot.token.visible = true;
    slot.token.position.set(0, 0, 0);
    for (let i = 0; i < slot.hulls.length; i += 1) {
      slot.hulls[i].position.set(ECHELON_OFFSETS[i][0], ECHELON_OFFSETS[i][1], ECHELON_OFFSETS[i][2]);
      slot.hulls[i].rotation.set(0, 0, 0);
      slot.hulls[i].visible = true;
    }
    slot.hullMat.opacity = 1;
    slot.pennantMat.opacity = 1;
    slot.wakeMat.opacity = 0.42;
    for (const wake of slot.wakes) {
      wake.scale.set(0.02, 0.002, 0.03);
      wake.visible = true;
    }
  }

  _syncSightings(world, nowMs) {
    const beat = world?.beat ?? 0;
    const live = liveThreats(world, beat);
    const pirates = [];
    const drones = [];
    for (const row of live) {
      if (row.kind === 'pirates') pirates.push(row);
      else if (row.kind === 'drones') drones.push(row);
    }
    this._syncPool(this.piratePool, pirates, nowMs, beat, (slot, threat) => {
      this._assignPirate(slot, threat, nowMs, beat);
    });
    this._syncPool(this.dronePool, drones, nowMs, beat, (slot, threat) => {
      this._assignDrone(slot, threat, nowMs, beat);
    });
  }

  _syncPool(pool, rows, nowMs, beat, assign) {
    const ids = new Set(rows.map((row) => row.id));
    for (const slot of pool) {
      if (slot.id && !ids.has(slot.id)) this._releaseSighting(slot);
    }
    for (const threat of rows) {
      const existing = pool.find((slot) => slot.id === threat.id);
      if (existing) {
        existing.threat = threat;
        const next = approachProgress(threat, beat);
        if (next !== existing.toProgress) {
          existing.fromProgress = existing.toProgress;
          existing.toProgress = next;
          existing.easeStart = nowMs;
        }
        this._paintChip(existing, threat, beat);
        continue;
      }
      const free = pool.find((slot) => slot.id == null);
      if (!free) break;
      assign(free, threat);
    }
  }

  _syncFights(world, nowMs) {
    const beat = world?.beat ?? 0;
    const rows = fightLogRows(world, beat);
    const keys = new Set();
    let used = 0;
    for (const row of rows) {
      if (used >= THREAT_CONCURRENCY_CAP) break;
      const key = fightKey(row);
      keys.add(key);
      let slot = this.fightPool.find((item) => item.key === key);
      if (!slot) {
        slot = this.fightPool.find((item) => item.key == null);
        if (!slot) continue;
        slot.key = key;
        slot.row = row;
        slot.bornMs = nowMs;
        slot.root.visible = true;
        slot.shipmentId = this._shipmentIdFor(world, row);
        const book = row.targetBook ?? row.book ?? null;
        const navy = (row.interceptors ?? []).some((item) => item.kind === 'navy');
        slot.startMap = navy && book ? bookMidpointMap(book) : BASS_MAP;
        slot.targetMap = book ? bookMidpointMap(book) : MELBOURNE_MAP;
        if (row.kind === 'drones' || row.type === 'threat-damage') {
          slot.targetMap = MELBOURNE_MAP;
        }
        used += 1;
      } else {
        used += 1;
      }
    }
    for (const slot of this.fightPool) {
      if (slot.key && !keys.has(slot.key)) {
        if (nowMs - slot.bornMs >= THREAT_FIGHT_MS) this._releaseFight(slot);
      }
    }
  }

  _shipmentIdFor(world, row) {
    const book = row.targetBook ?? row.book;
    if (!book) return null;
    const hit = (world?.threats ?? []).find((threat) => (
      threat.targetBook === book || threat.targetShipmentId
    ));
    return hit?.targetShipmentId ?? null;
  }

  _releaseFight(slot) {
    if (slot.shipmentId && this._darkened === slot.shipmentId) {
      this._setRunnerDark(slot.shipmentId, false);
      this._darkened = null;
    }
    const book = slot.row?.targetBook ?? slot.row?.book;
    if (book) {
      const pirateHome = this.piratePool.find((item) => item.threat?.targetBook === book);
      if (pirateHome) {
        pirateHome.token.visible = true;
        pirateHome.ring.visible = pirateHome.threat?.outcome == null;
        this._resetPiratePose(pirateHome);
      }
    }
    slot.key = null;
    slot.row = null;
    slot.shipmentId = null;
    slot.root.visible = false;
    slot.flashMat.opacity = 0;
    slot.tracerMat.opacity = 0;
    slot.tracerHaloMat.opacity = 0;
    slot.hitMat.opacity = 0;
    if (slot.hitFlash) slot.hitFlash.visible = false;
    for (const tracer of slot.tracers) tracer.visible = false;
    for (const puff of slot.smokes) puff.visible = false;
    for (const pip of slot.pips) pip.visible = false;
    // M7 — the sinking skiff is reset with the slot, or the next fight starts
    // with a hull already on its side.
    for (let i = 0; i < (slot.packHulls ?? []).length; i += 1) {
      const hull = slot.packHulls[i];
      hull.rotation.set(0, 0, 0);
      hull.position.set(ECHELON_OFFSETS[i][0], ECHELON_OFFSETS[i][1], ECHELON_OFFSETS[i][2]);
      hull.visible = true;
    }
  }

  _tickApproach(nowMs, world) {
    const beat = world?.beat ?? 0;
    for (const slot of this.piratePool) {
      if (!slot.id || !slot.threat) continue;
      const progress = easeBetweenBeats(
        slot.fromProgress, slot.toProgress, nowMs, slot.easeStart, this.reducedMotion,
      );
      const shipment = this._shipmentFor(world, slot.threat);
      if (!slot.stops || slot.stops.length < 2) continue;
      const runnerFrac = shipment
        ? shipmentLaneFraction(shipment, beat)
        : 0.55;
      const frac = pirateLaneProgress(slot.basinFraction, runnerFrac, progress);
      lerpLaneInto(slot.stops, frac, this._ll);
      // MC3 F12 — the fight reads this to walk the exchange to open water.
      slot.mapAt = { lat: this._ll.lat, lon: this._ll.lon };
      const lift = cargoLift(CARGO_MODE[slot.threat.targetBook] ?? 'sea-asia', frac);
      this._orient(slot.root, this._ll.lat, this._ll.lon, GLOBE_RADIUS + lift);
      const pulse = this.reducedMotion ? 1 : 1 + (Math.sin(nowMs * 0.004) * 0.12);
      slot.ring.scale.set(PIRATE_RING_XZ * pulse, 0.008, PIRATE_RING_XZ * pulse);
      slot.ringMat.opacity = this.reducedMotion ? 0.28 : 0.32 + (Math.sin(nowMs * 0.005) * 0.12);
      slot.ring.visible = slot.threat.outcome == null;
      slot.hullMat.opacity = 1;
      slot.pennantMat.opacity = 1;
    }
    for (const slot of this.dronePool) {
      if (!slot.id || !slot.threat) continue;
      const progress = easeBetweenBeats(
        slot.fromProgress, slot.toProgress, nowMs, slot.easeStart, this.reducedMotion,
      );
      slerpLatLonInto(
        slot.fromMap, MELBOURNE_MAP, progress, this._ll, this._v1, this._v2, this._v3,
      );
      this._orient(slot.root, this._ll.lat, this._ll.lon, GLOBE_RADIUS + 0.05);
      const pulse = this.reducedMotion ? 1 : 1 + (Math.sin(nowMs * 0.0045) * 0.1);
      slot.ring.scale.set(DRONE_RING_XZ * pulse, 0.008, DRONE_RING_XZ * pulse);
      slot.ringMat.opacity = this.reducedMotion ? 0.28 : 0.32 + (Math.sin(nowMs * 0.005) * 0.12);
      slot.ring.visible = slot.threat.outcome == null;
      const bob = this.reducedMotion ? 0 : Math.sin(nowMs * 0.006) * 0.003;
      for (let i = 0; i < slot.chevrons.length; i += 1) {
        slot.chevrons[i].position.y = DIAMOND_OFFSETS[i][1] + bob;
      }
      slot.bodyMat.opacity = 1;
    }
  }

  _shipmentFor(world, threat) {
    if (!threat?.targetShipmentId) return null;
    const rows = world?.shipments ?? [];
    for (const row of rows) {
      if (row.id === threat.targetShipmentId) return row;
    }
    return null;
  }

  _tickFights(nowMs) {
    let droneFlash = 0;
    for (const slot of this.fightPool) {
      if (!slot.key || !slot.row) continue;
      const elapsed = nowMs - slot.bornMs;
      if (elapsed >= THREAT_FIGHT_MS) {
        this._releaseFight(slot);
        continue;
      }
      const row = slot.row;
      if (row.kind === 'drones' || row.type === 'threat-damage') {
        droneFlash = Math.max(droneFlash, this._tickDroneFight(slot, elapsed));
      } else if (row.type === 'threat-repelled') {
        this._tickPirateRepel(slot, elapsed);
      } else {
        this._tickPirateLoss(slot, elapsed);
      }
    }
    this._paintMelbourneFlash(droneFlash);
  }

  /** Every gun, tracer, hit and puff off. One place, so no path forgets one. */
  _silenceGuns(slot) {
    slot.flashMat.opacity = 0;
    slot.tracerMat.opacity = 0;
    slot.tracerHaloMat.opacity = 0;
    slot.hitMat.opacity = 0;
    if (slot.hitFlash) slot.hitFlash.visible = false;
    // M8 — the strike ring joins the single place every reduced / loss / drone
    // / release path turns the exchange off, so no path can forget it.
    if (slot.hitRingMat) slot.hitRingMat.opacity = 0;
    if (slot.hitRing) slot.hitRing.visible = false;
    for (const tracer of slot.tracers ?? []) tracer.visible = false;
    for (const puff of slot.smokes ?? []) puff.visible = false;
  }

  _tickPirateRepel(slot, elapsed) {
    const tl = FIGHT_TIMELINE.piratesRepelled;
    const closeU = fightWindowU(tl.escortClose, elapsed);
    slerpLatLonInto(slot.startMap, slot.targetMap, closeU, this._ll, this._v1, this._v2, this._v3);
    slot.focusMap = { lat: this._ll.lat, lon: this._ll.lon };
    this._orient(slot.root, this._ll.lat, this._ll.lon, GLOBE_RADIUS + SEA_LIFT);
    slot.escort.visible = true;
    if (slot.pack) slot.pack.visible = true;
    const pirateHome = this.piratePool.find((item) => item.threat?.targetBook === (slot.row.targetBook ?? slot.row.book));
    if (pirateHome?.root?.visible) {
      // MC3 F12 — during the fight the FIGHT owns the position, not the token.
      // M5 copied the pirate token's lane position, which on the Taipei book
      // falls over New Guinea. The exchange is walked to open water and the
      // token follows it, so there is one mark and it is offshore.
      const home = pirateHome.mapAt ?? slot.focusMap;
      const sea = seawardPoint(home.lat, home.lon);
      slot.focusMap = { lat: sea.lat, lon: sea.lon };
      slot.seawardMoved = sea.moved;
      this._orient(slot.root, sea.lat, sea.lon, GLOBE_RADIUS + SEA_LIFT);
      pirateHome.root.position.copy(slot.root.position);
      pirateHome.root.quaternion.copy(slot.root.quaternion);
      pirateHome.token.visible = false;
      pirateHome.ring.visible = false;
    } else {
      const sea = seawardPoint(slot.focusMap.lat, slot.focusMap.lon);
      slot.focusMap = { lat: sea.lat, lon: sea.lon };
      slot.seawardMoved = sea.moved;
      this._orient(slot.root, sea.lat, sea.lon, GLOBE_RADIUS + SEA_LIFT);
    }
    const reduced = this.reducedMotion;
    const muzzle = !reduced
      && (inFightWindow(tl.muzzle, elapsed) || inFightWindow(tl.muzzle2, elapsed));
    const pulse = muzzle ? 0.75 + (Math.sin(elapsed * 0.04) * 0.25) : 0;
    slot.flashMat.opacity = pulse;
    for (const flash of slot.flashes) flash.visible = muzzle;
    // M7 item 4 — the hit. Seated on the lead skiff, on its own windows, so the
    // 2.5 s frame carries a round landing rather than two guns and no target.
    const hitOn = !reduced
      && (inFightWindow(tl.packHit, elapsed) || inFightWindow(tl.packHit2, elapsed));
    if (slot.hitFlash) {
      slot.hitFlash.visible = hitOn;
      if (hitOn) {
        const hu = inFightWindow(tl.packHit, elapsed)
          ? fightWindowU(tl.packHit, elapsed)
          : fightWindowU(tl.packHit2, elapsed);
        // A hit blooms and dies rather than pulsing: bright at the strike,
        // gone by the end of the window.
        slot.hitMat.opacity = 0.95 * (1 - hu * hu);
        slot.hitFlash.scale.setScalar(0.7 + hu * 1.5);
        const lead = slot.packHulls?.[0];
        slot.hitFlash.position.set(
          FIGHT_PACK_LOCAL[0] + (lead ? lead.position.x * PIRATE_TOKEN_SCALE : 0),
          0.018,
          FIGHT_PACK_LOCAL[2] + (lead ? lead.position.z * PIRATE_TOKEN_SCALE : 0),
        );
      } else {
        slot.hitMat.opacity = 0;
      }
    }
    /*
     * M8 item 4 — the strike ring. It runs for `HIT_RING_MS` off the START of
     * whichever hit window is open, not off the whole window, so it is a
     * 0.4 s event on a 1 s hit rather than a second pulse.
     */
    if (slot.hitRing) {
      const win = inFightWindow(tl.packHit, elapsed) ? tl.packHit
        : (inFightWindow(tl.packHit2, elapsed) ? tl.packHit2 : null);
      const ru = win && !reduced ? clamp01((elapsed - win[0]) / HIT_RING_MS) : 1;
      const ringOn = Boolean(win) && !reduced && ru < 1;
      slot.hitRing.visible = ringOn;
      if (ringOn) {
        const r = HIT_RING_R0 + (HIT_RING_R1 - HIT_RING_R0) * ru;
        slot.hitRing.scale.set(r, 0.006, r);
        slot.hitRing.position.set(
          slot.hitFlash ? slot.hitFlash.position.x : FIGHT_PACK_LOCAL[0],
          0.010,
          slot.hitFlash ? slot.hitFlash.position.z : FIGHT_PACK_LOCAL[2],
        );
        slot.hitRingMat.opacity = 0.9 * (1 - ru) * (1 - ru * 0.4);
      } else {
        slot.hitRingMat.opacity = 0;
      }
    }
    const tracersOn = !reduced
      && (inFightWindow(tl.tracers, elapsed) || inFightWindow(tl.tracers2, elapsed));
    slot.tracerMat.opacity = tracersOn ? 0.62 : 0;
    slot.tracerHaloMat.opacity = tracersOn ? 0.16 : 0;
    // Rounds in flight: each tracer runs escort -> pack on its own phase, so
    // the four of them read as a stream instead of a static bundle.
    const spanX = FIGHT_PACK_LOCAL[0] - FIGHT_ESCORT_LOCAL[0];
    const spanZ = FIGHT_PACK_LOCAL[2] - FIGHT_ESCORT_LOCAL[2];
    const flightYaw = Math.atan2(spanX, spanZ);
    for (let i = 0; i < slot.tracers.length; i += 1) {
      const tracer = slot.tracers[i];
      tracer.visible = tracersOn;
      if (!tracersOn) continue;
      const phase = ((elapsed * 0.0016) + (i / slot.tracers.length)) % 1;
      const along = 0.20 + phase * 0.62;
      const lane = (i - 1.5) * 0.010;
      tracer.position.set(
        FIGHT_ESCORT_LOCAL[0] + spanX * along + lane * 0.4,
        0.019,
        FIGHT_ESCORT_LOCAL[2] + spanZ * along + lane,
      );
      tracer.rotation.set(0.1, flightYaw, 0);
      tracer.scale.setScalar(1);
    }
    // M7 item 4 — smoke off the pack that persists two seconds. M6's three
    // puffs were pinned to the sink progress and were 8-20 thousandths across;
    // these are born on a cadence, live `FIGHT_PUFF_LIFE_MS`, and drift.
    const puffsOn = !reduced && inFightWindow(tl.puffs, elapsed);
    for (let i = 0; i < (slot.smokes ?? []).length; i += 1) {
      const puff = slot.smokes[i];
      if (!puffsOn) { puff.visible = false; continue; }
      const born = tl.puffs[0] + (i * FIGHT_PUFF_CADENCE_MS);
      const cycle = FIGHT_PUFF_COUNT * FIGHT_PUFF_CADENCE_MS;
      const age = ((elapsed - born) % cycle + cycle) % cycle;
      const live = elapsed >= born && age <= FIGHT_PUFF_LIFE_MS;
      puff.visible = live;
      if (!live) continue;
      const u = clamp01(age / FIGHT_PUFF_LIFE_MS);
      const lead = slot.packHulls?.[0];
      puff.position.set(
        FIGHT_PACK_LOCAL[0] + (lead ? lead.position.x * PIRATE_TOKEN_SCALE : 0) - u * 0.020,
        0.018 + u * 0.030,
        FIGHT_PACK_LOCAL[2] + (lead ? lead.position.z * PIRATE_TOKEN_SCALE : 0) + u * 0.014,
      );
      puff.scale.setScalar(0.008 + u * 0.020);
      puff.material.opacity = 0.82 * (1 - (u * u));
    }
    if (slot.pulse) {
      slot.pulse.visible = true;
      const beat = 1 + Math.sin(elapsed * 0.008) * 0.12;
      slot.pulse.scale.set(0.042 * beat, 0.004, 0.042 * beat);
      slot.pulseMat.opacity = reduced ? 0.22 : 0.32 + Math.sin(elapsed * 0.01) * 0.14;
    }
    const sinkU = fightWindowU(tl.sink, elapsed);
    const scatterU = fightWindowU(tl.scatter, elapsed);
    const hulls = slot.packHulls ?? [];
    if (hulls[0]) {
      // M7 item 4 — the sinking skiff is a silhouette going down by the bow,
      // and it STAYS on frame at 4 s. It rolls as well as pitches, so the
      // tilt reads from any globe azimuth rather than only across the view.
      hulls[0].rotation.z = sinkU * 1.05;
      hulls[0].rotation.x = sinkU * 0.42;
      hulls[0].position.y = ECHELON_OFFSETS[0][1] - (sinkU * 0.012);
      hulls[0].visible = true;
    }
    for (let i = 1; i < hulls.length; i += 1) {
      const dx = (hash01(slot.key, i) - 0.5) * 0.028;
      const dz = (hash01(slot.key, i + 3) - 0.5) * 0.028;
      hulls[i].position.set(
        ECHELON_OFFSETS[i][0] + (dx * scatterU),
        ECHELON_OFFSETS[i][1],
        ECHELON_OFFSETS[i][2] + (dz * scatterU),
      );
    }
    if (pirateHome?.id) {
      const wakeU = 1 - fightWindowU(tl.wakesDie, elapsed);
      pirateHome.wakeMat.opacity = 0.42 * wakeU;
      pirateHome.hullMat.opacity = 1 - (scatterU * 0.95);
      pirateHome.pennantMat.opacity = 1 - scatterU;
      if (reduced) {
        pirateHome.hullMat.opacity = 1 - clamp01(elapsed / THREAT_FIGHT_MS);
        pirateHome.pennantMat.opacity = pirateHome.hullMat.opacity;
        pirateHome.wakeMat.opacity = 0;
        this._silenceGuns(slot);
      }
    }
  }

  _tickPirateLoss(slot, elapsed) {
    const tl = FIGHT_TIMELINE.piratesLoss;
    slerpLatLonInto(slot.targetMap, slot.targetMap, 1, this._ll, this._v1, this._v2, this._v3);
    this._orient(slot.root, this._ll.lat, this._ll.lon, GLOBE_RADIUS + SEA_LIFT);
    slot.escort.visible = false;
    this._silenceGuns(slot);
    const pipsOn = inFightWindow(tl.pips, elapsed) || elapsed >= tl.pips[0];
    const pipU = fightWindowU(tl.pips, elapsed);
    for (let i = 0; i < slot.pips.length; i += 1) {
      const pip = slot.pips[i];
      pip.visible = pipsOn && !this.reducedMotion;
      const dx = (i - 1) * 0.018;
      pip.position.set(dx, 0.02 - (pipU * 0.05), (i % 2) * 0.01);
      slot.pipMat.opacity = 1 - pipU;
    }
    const dark = inFightWindow(tl.darken, elapsed);
    if (slot.shipmentId) {
      if (dark && this._darkened !== slot.shipmentId) {
        this._setRunnerDark(slot.shipmentId, true);
        this._darkened = slot.shipmentId;
      } else if (!dark && this._darkened === slot.shipmentId) {
        this._setRunnerDark(slot.shipmentId, false);
        this._darkened = null;
      }
    }
    if (this.reducedMotion) {
      for (const pip of slot.pips) pip.visible = false;
    }
  }

  _tickDroneFight(slot, elapsed) {
    const tl = FIGHT_TIMELINE.drones;
    const arriveU = fightWindowU(tl.arrive, elapsed);
    const from = cityMap(slot.row.from);
    slerpLatLonInto(from, MELBOURNE_MAP, arriveU, this._ll, this._v1, this._v2, this._v3);
    slot.focusMap = { lat: this._ll.lat, lon: this._ll.lon };
    this._orient(slot.root, this._ll.lat, this._ll.lon, GLOBE_RADIUS + 0.05);
    slot.escort.visible = false;
    if (slot.pack) slot.pack.visible = false;
    this._silenceGuns(slot);
    const fadeU = fightWindowU(tl.fade, elapsed);
    const swarm = this.dronePool.find((item) => item.threat?.targetFacility === (slot.row.targetFacility ?? slot.row.facility));
    if (swarm?.id) {
      swarm.bodyMat.opacity = this.reducedMotion
        ? 1 - clamp01(elapsed / THREAT_FIGHT_MS)
        : 1 - fadeU;
    }
    if (this.reducedMotion) return 0;
    if (inFightWindow(tl.flash1, elapsed)) return 1 - Math.abs((fightWindowU(tl.flash1, elapsed) - 0.5) * 2);
    if (inFightWindow(tl.flash2, elapsed)) return 1 - Math.abs((fightWindowU(tl.flash2, elapsed) - 0.5) * 2);
    return 0;
  }

  _paintMelbourneFlash(amount) {
    const flag = this.flagGroups?.find((item) => item.userData.cityId === MELBOURNE_ID);
    if (!flag) {
      this.melbFlash.visible = false;
      return;
    }
    if (this.melbFlash.parent !== flag) flag.add(this.melbFlash);
    const on = amount > 0 && !this.reducedMotion;
    this.melbFlash.visible = on;
    this.melbFlashMat.opacity = on ? 0.35 + (amount * 0.55) : 0;
    this.melbFlashMat.emissiveIntensity = on ? 0.8 + (amount * 1.4) : 0;
  }

  _setRunnerDark(shipmentId, dark) {
    if (!this.cargoRunners) return;
    const runner = this.cargoRunners.find((item) => item.userData.shipmentId === shipmentId);
    if (!runner?.userData.colourParts) return;
    for (const mesh of runner.userData.colourParts) {
      const base = mesh.userData.baseColor;
      if (!base || !mesh.material?.color) continue;
      if (dark) mesh.material.color.copy(base).multiplyScalar(0.28);
      else mesh.material.color.copy(base);
    }
  }

  sync(world, nowMs) {
    this._syncSightings(world, nowMs);
    this._syncFights(world, nowMs);
  }

  tick(nowMs, world) {
    this.sync(world, nowMs);
    this._tickApproach(nowMs, world);
    this._tickFights(nowMs);
  }

  /**
   * M11 item 4 — returns the screen rects it placed, so the city-label pass can
   * treat the threat chips as obstacles instead of discovering them by
   * overlapping them.
   */
  projectChips(camera, width, height, projected, cameraWorld, bounds, opts = {}) {
    const rects = [];
    if (!width || !height) return rects;
    const candidates = [];
    for (const slot of [...this.piratePool, ...this.dronePool]) {
      const chip = slot.chip;
      if (!chip) continue;
      if (!slot.id || !slot.root.visible || slot.threat?.outcome != null) {
        chip.hidden = true;
        continue;
      }
      slot.root.getWorldPosition(projected);
      const radialDot = this._v3.copy(projected).normalize().dot(this._v2.copy(cameraWorld).normalize());
      projected.project(camera);
      const onScreen = projected.z > -1 && projected.z < 1
        && projected.x > -1.05 && projected.x < 1.05
        && projected.y > -1.05 && projected.y < 1.05;
      const visible = onScreen && radialDot > 0.12;
      if (!visible) {
        chip.hidden = true;
        continue;
      }
      const x = ((projected.x * 0.5) + 0.5) * width;
      const y = ((-projected.y * 0.5) + 0.5) * height - 18;
      const halfW = Math.max(36, chip.offsetWidth / 2);
      const halfH = Math.max(8, chip.offsetHeight / 2);
      candidates.push({
        chip,
        item: {
          id: `threat:${slot.id}`,
          x,
          y,
          w: halfW * 2,
          h: halfH * 2,
          rank: candidates.length,
          priority: 'threat',
        },
      });
    }
    const stage = {
      left: bounds?.left ?? 8,
      right: bounds?.right ?? width - 8,
      top: bounds?.top ?? 8,
      bottom: bounds?.bottom ?? height - 8,
    };
    const items = candidates.map((row) => row.item);
    const placed = staggerLabels(items, stage, {
      reserved: opts.reserved ?? [],
      dropOnCollision: true,
    });
    const byId = new Map(placed.map((row) => [row.id, row]));
    for (const { chip, item } of candidates) {
      const row = byId.get(item.id);
      if (!row || row.hidden) {
        chip.hidden = true;
        continue;
      }
      chip.hidden = false;
      chip.style.left = `${row.x}px`;
      chip.style.top = `${row.y}px`;
      rects.push({ ...item, x: row.x, y: row.y });
    }
    return rects;
  }

  hasLiveFight() {
    return this.fightPool.some((slot) => slot.key);
  }

  _rememberBaseScale(object) {
    if (!object?.scale) return;
    if (!object.userData.fitBaseScale) {
      object.userData.fitBaseScale = object.scale.clone();
    }
  }

  projectedRect(object, camera, width, height) {
    if (!object?.visible || !camera || !width || !height) return null;
    object.updateWorldMatrix(true, true);
    this._box.setFromObject(object);
    if (this._box.isEmpty()) return null;
    const min = this._box.min;
    const max = this._box.max;
    this._corners[0].set(min.x, min.y, min.z);
    this._corners[1].set(min.x, min.y, max.z);
    this._corners[2].set(min.x, max.y, min.z);
    this._corners[3].set(min.x, max.y, max.z);
    this._corners[4].set(max.x, min.y, min.z);
    this._corners[5].set(max.x, min.y, max.z);
    this._corners[6].set(max.x, max.y, min.z);
    this._corners[7].set(max.x, max.y, max.z);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hits = 0;
    for (let i = 0; i < 8; i += 1) {
      const p = this._corners[i];
      p.project(camera);
      if (p.z < -1 || p.z > 1) continue;
      const sx = ((p.x * 0.5) + 0.5) * width;
      const sy = ((-p.y * 0.5) + 0.5) * height;
      if (sx < minX) minX = sx;
      if (sy < minY) minY = sy;
      if (sx > maxX) maxX = sx;
      if (sy > maxY) maxY = sy;
      hits += 1;
    }
    if (!hits) return null;
    const w = maxX - minX;
    const h = maxY - minY;
    return {
      minX, minY, maxX, maxY, w, h,
      longest: w > h ? w : h,
    };
  }

  _fitGroup(object, minPx, maxPx, camera, width, height) {
    if (!object) return null;
    this._rememberBaseScale(object);
    object.scale.copy(object.userData.fitBaseScale);
    object.updateWorldMatrix(true, true);
    const rect = this.projectedRect(object, camera, width, height);
    if (!rect || rect.longest < 0.35) return rect;
    let s = 1;
    if (rect.longest > maxPx) s = maxPx / rect.longest;
    else if (rect.longest < minPx) s = minPx / rect.longest;
    const ceiling = object.userData.fitMaxScalar;
    if (Number.isFinite(ceiling) && s > ceiling) s = ceiling;
    if (s !== 1) {
      object.scale.multiplyScalar(s);
      object.updateWorldMatrix(true, true);
    }
    return this.projectedRect(object, camera, width, height) ?? rect;
  }

  fitTokensToScreen(camera, width, height) {
    if (!camera || !width || !height) return;
    camera.updateMatrixWorld();
    for (const slot of this.piratePool) {
      if (!slot.root.visible) continue;
      this._fitGroup(slot.token, TOKEN_MIN_PX, PACK_MAX_PX, camera, width, height);
    }
    for (const slot of this.dronePool) {
      if (!slot.root.visible) continue;
      this._fitGroup(slot.token, TOKEN_MIN_PX, SWARM_MAX_PX, camera, width, height);
    }
    for (const slot of this.fightPool) {
      if (!slot.root.visible || !slot.key) continue;
      this._fitGroup(slot.escort, TOKEN_MIN_PX, ESCORT_MAX_PX, camera, width, height);
      this._fitGroup(slot.pack, TOKEN_MIN_PX, PACK_MAX_PX, camera, width, height);
      for (const flash of slot.flashes) {
        if (!flash.visible) continue;
        // A muzzle flash is never force-grown to the token minimum: it has to
        // live in the gap between the two parties, so it may only shrink.
        this._fitGroup(flash, 0, FLASH_MAX_PX, camera, width, height);
      }
      // M7 item 4 — the hit sits ON the pack, so it has no gap to respect and
      // is held to a floor: an exchange whose rounds land invisibly is the
      // fault this item is about.
      if (slot.hitFlash?.visible) {
        this._fitGroup(slot.hitFlash, FLASH_MIN_PX, FLASH_MAX_PX, camera, width, height);
      }
      // Tracers are NOT screen-fitted. The first M7 capture put them through
      // `_fitGroup` with the token minimum, and a round in flight is heavily
      // foreshortened: its projected rect is small, the fit grew the whole
      // group about threefold to reach 34 px, and four additive bars at triple
      // width blew the 4 s frame to white. They are built at the width they
      // should read at (`TRACER_CORE_W` ~ 3.7 px at the fitted globe scale) and
      // left alone.
    }
  }

  /**
   * M5 F4 — the fight the camera is framing. Two threats can resolve on the same
   * beat (pirates in a basin, drones on the port) forty degrees of latitude
   * apart; no single frame reads both. The party with a visible escort is the
   * one with silhouettes to read, so that one owns the shot.
   */
  fightPrimarySlot() {
    let fallback = null;
    for (const slot of this.fightPool) {
      if (!slot.key || !slot.root.visible) continue;
      if (!fallback) fallback = slot;
      if (slot.escort?.visible) return slot;
    }
    return fallback;
  }

  fightBounds(camera, width, height, primaryOnly = true) {
    if (!camera || !width || !height) return null;
    const primary = primaryOnly ? this.fightPrimarySlot() : null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hits = 0;
    for (const slot of this.fightPool) {
      if (!slot.root.visible || !slot.key) continue;
      if (primary && slot !== primary) continue;
      const parts = [slot.escort, slot.pack, ...(slot.flashes ?? [])];
      for (const part of parts) {
        if (!part?.visible) continue;
        const rect = this.projectedRect(part, camera, width, height);
        if (!rect) continue;
        if (rect.minX < minX) minX = rect.minX;
        if (rect.minY < minY) minY = rect.minY;
        if (rect.maxX > maxX) maxX = rect.maxX;
        if (rect.maxY > maxY) maxY = rect.maxY;
        hits += 1;
      }
    }
    if (!hits) return null;
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  /**
   * M5 F4 — the safe stage is the map rectangle no chrome sits on: right of
   * `.province-yard`, left of `.province-dossier`, above the footer. Callers hand
   * it in; without one the full viewport is the stage.
   */
  static safeStage(width, height, safe) {
    const left = Number.isFinite(safe?.left) ? Math.max(0, safe.left) : 0;
    const right = Number.isFinite(safe?.right) ? Math.min(width, safe.right) : width;
    const top = Number.isFinite(safe?.top) ? Math.max(0, safe.top) : 0;
    const bottom = Number.isFinite(safe?.bottom) ? Math.min(height, safe.bottom) : height;
    const w = Math.max(1, right - left);
    const h = Math.max(1, bottom - top);
    return { left, right, top, bottom, w, h, cx: left + (w * 0.5), cy: top + (h * 0.5) };
  }

  fightZoom(camera, width, height, safe = null) {
    if (this.reducedMotion || !this.hasLiveFight()) {
      this._lastFightZoom = 1;
      this._lastFightPan = null;
      return 1;
    }
    if (!camera || !width || !height) {
      this._lastFightZoom = FIGHT_ZOOM;
      return FIGHT_ZOOM;
    }
    const savedZ = camera.position.z;
    camera.position.z = CAM_REST_Z;
    camera.updateMatrixWorld();
    const bounds = this.fightBounds(camera, width, height);
    camera.position.z = savedZ;
    camera.updateMatrixWorld();
    if (!bounds) {
      this._lastFightZoom = FIGHT_ZOOM;
      return FIGHT_ZOOM;
    }
    const stage = WorldThreatLayer.safeStage(width, height, safe);
    const inset = FIGHT_VIEWPORT_INSET_PX;
    // The fight is panned to the stage centre (see fightPan), so the only test
    // left is whether it FITS: both parties plus the flash inside the stage
    // with the inset margin still clear on every side.
    const roomW = Math.max(1, stage.w - (inset * 2));
    const roomH = Math.max(1, stage.h - (inset * 2));
    const fitted = Math.min(
      FIGHT_ZOOM,
      roomW / Math.max(1, bounds.w),
      roomH / Math.max(1, bounds.h),
    );
    this._lastFightZoom = Math.max(1, Math.min(FIGHT_ZOOM, fitted));
    return this._lastFightZoom;
  }

  /**
   * M5 F4 — screen-pixel offset that carries the fight centroid from wherever the
   * globe rotation put it onto the centre of the unobscured stage. Applied by
   * `world-map.js` as a camera view offset, so it pans without changing scale.
   */
  fightPan(camera, width, height, safe = null) {
    if (this.reducedMotion || !this.hasLiveFight() || !camera || !width || !height) {
      this._lastFightPan = null;
      return null;
    }
    const bounds = this.fightBounds(camera, width, height);
    if (!bounds) {
      this._lastFightPan = null;
      return null;
    }
    const stage = WorldThreatLayer.safeStage(width, height, safe);
    const cx = (bounds.minX + bounds.maxX) * 0.5;
    const cy = (bounds.minY + bounds.maxY) * 0.5;
    const cap = FIGHT_PAN_MAX_PX;
    const pan = {
      x: Math.max(-cap, Math.min(cap, cx - stage.cx)),
      y: Math.max(-cap, Math.min(cap, cy - stage.cy)),
    };
    this._lastFightPan = pan;
    return pan;
  }

  /** Per-part screen rects for the live fight — the M5 no-overlap receipt. */
  fightPartRects(camera, width, height) {
    const out = [];
    for (const slot of this.fightPool) {
      if (!slot.root.visible || !slot.key) continue;
      // MC3 F12 receipt: where the exchange actually resolved, and how far the
      // seaward walk had to move it to get off the coast.
      const focus = slot.focusMap
        ? { lat: +slot.focusMap.lat.toFixed(3), lon: +slot.focusMap.lon.toFixed(3) }
        : null;
      const seaward = slot.seawardMoved ?? null;
      const parts = [['escort', slot.escort], ['pack', slot.pack]];
      slot.flashes.forEach((f, i) => parts.push([`flash${i}`, f]));
      // M7 item 4 receipt: the hit on the pack, the tracers in flight, the
      // puffs, and the lead skiff whose tilt is the sinking read.
      if (slot.hitFlash) parts.push(['hit', slot.hitFlash]);
      // M8 item 4 receipt: the 0.4 s strike ring.
      if (slot.hitRing) parts.push(['hitRing', slot.hitRing]);
      slot.tracers.forEach((t, i) => parts.push([`tracer${i}`, t]));
      slot.smokes.forEach((p, i) => parts.push([`puff${i}`, p]));
      if (slot.packHulls?.[0]) parts.push(['skiff0', slot.packHulls[0]]);
      const rects = {};
      for (const [label, part] of parts) {
        if (!part?.visible) { rects[label] = null; continue; }
        const r = this.projectedRect(part, camera, width, height);
        rects[label] = r ? {
          x: [Math.round(r.minX), Math.round(r.maxX)],
          y: [Math.round(r.minY), Math.round(r.maxY)],
          w: Math.round(r.w), h: Math.round(r.h), longest: Math.round(r.longest),
        } : null;
      }
      // The tracer's core width in px: the rect is the halo's, so the core is
      // that width scaled by the built ratio. This is the number M7 item 4
      // asks to be >= 3.
      const tracerRect = rects.tracer0 ?? rects.tracer1 ?? null;
      const tracerCorePx = tracerRect
        ? +(Math.min(tracerRect.w, tracerRect.h) * (TRACER_CORE_W / TRACER_HALO_W)).toFixed(2)
        : null;
      const lead = slot.packHulls?.[0];
      out.push({
        key: slot.key,
        gapX: slot.gapX,
        focus,
        seaward,
        primary: slot === this.fightPrimarySlot(),
        tracerCorePx,
        skiffTiltZ: lead ? +lead.rotation.z.toFixed(3) : null,
        skiffTiltX: lead ? +lead.rotation.x.toFixed(3) : null,
        puffsLive: (slot.smokes ?? []).filter((p) => p.visible).length,
        rects,
      });
    }
    return out;
  }

  fightSafeCheck(camera, width, height, safe = null) {
    const bounds = this.fightBounds(camera, width, height);
    if (!bounds) return null;
    const stage = WorldThreatLayer.safeStage(width, height, safe);
    const inset = FIGHT_VIEWPORT_INSET_PX;
    return {
      bounds,
      stage,
      insideStage: bounds.minX >= stage.left + inset - 0.5
        && bounds.maxX <= stage.right - inset + 0.5
        && bounds.minY >= stage.top + inset - 0.5
        && bounds.maxY <= stage.bottom - inset + 0.5,
    };
  }

  fightFocus() {
    if (!this.hasLiveFight()) return null;
    const primary = this.fightPrimarySlot();
    if (primary?.focusMap) return primary.focusMap;
    for (const slot of this.fightPool) {
      if (slot.key && slot.focusMap) return slot.focusMap;
    }
    return null;
  }

  debugState() {
    return {
      pirates: this.piratePool.filter((slot) => slot.id).map((slot) => slot.id),
      drones: this.dronePool.filter((slot) => slot.id).map((slot) => slot.id),
      fights: this.fightPool.filter((slot) => slot.key).map((slot) => slot.key),
      zoom: this._lastFightZoom,
      pan: this._lastFightPan,
    };
  }

  dispose() {
    if (this._darkened) this._setRunnerDark(this._darkened, false);
    this.root.clear();
    this.unitBox.dispose();
    this.unitDot?.dispose?.();
    this.unitRing?.dispose?.();
    this.markerDiscGeometry?.dispose?.();
    this.markerShadowGeometry?.dispose?.();
    this.markerDiscMat?.dispose?.();
    this.markerShadowMat?.map?.dispose?.();
    this.markerShadowMat?.dispose?.();
    this.melbFlashMat.dispose();
    for (const slot of this.piratePool) {
      slot.hullMat.dispose();
      slot.pennantMat.dispose();
      slot.wakeMat.dispose();
      slot.ringMat.dispose();
      slot.chip?.remove();
    }
    for (const slot of this.dronePool) {
      slot.bodyMat.dispose();
      slot.ringMat.dispose();
      slot.chip?.remove();
    }
    for (const slot of this.fightPool) {
      slot.escortMat.dispose();
      slot.gunwaleMat.dispose();
      slot.pennantMat?.dispose();
      slot.flashMat.dispose();
      slot.tracerMat.dispose();
      slot.pipMat.dispose();
      slot.smokeMat?.dispose();
      slot.pulseMat?.dispose();
      slot.hitRingMat?.dispose();
    }
    this.piratePool.length = 0;
    this.dronePool.length = 0;
    this.fightPool.length = 0;
  }
}
