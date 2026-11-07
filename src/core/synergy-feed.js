// District condition/readout feed for the constructor HUD, plus the surviving person
// interaction ticker. Wave L retires building-pair districts; no game-state writes here.

import { activeOrder, activeParcel } from './city.js';
import { globalTile, parseParcelId } from './grid.js';
import {
  DISTRICT_DEFINITIONS, PAIR_SYNERGIES, evaluateDistrictConditions,
  resolvePairSynergies, INFLUENCE_CURVES, nearestTileDistance, applyOperations,
} from './landuse.js';
import { STAMP_USE_LABELS, synergyStampRecipe } from './synergy-readout.js';

function hasTiles(entry) {
  return Array.isArray(entry?.tiles) && entry.tiles.length > 0;
}

function useFace(useId) {
  const known = STAMP_USE_LABELS[useId];
  if (known) return known;
  const words = String(useId ?? '').split('-').filter(Boolean).slice(0, 2);
  if (!words.length) return '';
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function faceLower(useId) {
  return useFace(useId).toLowerCase();
}

function latticeFromParcelIds(ids) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const tiles = [];
  for (const id of ids) {
    if (id && Number.isFinite(id.gx) && Number.isFinite(id.gz)) {
      tiles.push(id);
      continue;
    }
    if (typeof id !== 'string') continue;
    try {
      const position = parseParcelId(id);
      tiles.push({ id, ...globalTile(position.bx, position.bz, position.tx, position.tz) });
    } catch {
      // Core mouth ids and other non-parcel keys are resolved via emitters.
    }
  }
  return tiles;
}

function asLatticeTiles(tiles) {
  if (!Array.isArray(tiles) || !tiles.length) return [];
  if (typeof tiles[0] === 'object' && Number.isFinite(tiles[0]?.gx)) return tiles;
  return latticeFromParcelIds(tiles);
}

function buildingEntities(city) {
  const entities = [];
  for (const emitter of city.amenityEmitters ?? []) {
    if (!hasTiles(emitter) || emitter.useId === 'water') continue;
    entities.push({
      id: emitter.id,
      key: emitter.id,
      kind: 'building',
      typeId: emitter.useId,
      useId: emitter.useId,
      tiles: asLatticeTiles(emitter.tiles),
    });
  }
  return entities;
}

function buildingRecipes() {
  return PAIR_SYNERGIES.filter((recipe) =>
    recipe.participants[0].kind === 'building'
    && recipe.participants[1].kind === 'building');
}

function pickByType(entities, typeIds) {
  return entities
    .filter((entity) => typeIds.includes(entity.typeId))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function dormantMissing(recipe, left, right) {
  const leftUse = left?.typeId ?? recipe.participants[0].ids[0];
  const rightUse = right?.typeId ?? recipe.participants[1].ids[0];
  if (!left && !right) {
    return synergyStampRecipe({ leftUse, rightUse }).toLowerCase();
  }
  if (left && !right) return `${faceLower(rightUse)} within ${recipe.maxDistance}`;
  if (!left && right) return `${faceLower(leftUse)} within ${recipe.maxDistance}`;
  return `${faceLower(rightUse)} within ${recipe.maxDistance}`;
}

function freezeRow(row) {
  if (Array.isArray(row.liveNames)) {
    row.liveNames = Object.freeze([...row.liveNames]);
  }
  if (Array.isArray(row.effects)) {
    row.effects = Object.freeze([...row.effects]);
  }
  return Object.freeze(row);
}

function emitterById(city, id) {
  if (!id) return null;
  const raw = String(id).replace(/:mouth$/, '');
  return (city.amenityEmitters ?? []).find((emitter) =>
    emitter.id === id || emitter.id === raw) ?? null;
}

function tilesForAnchor(city, state, anchor, people, hop = true) {
  if (!anchor) return [];
  if (anchor.kind === 'parcel') {
    return latticeFromParcelIds(activeParcel(city, state, anchor.id)?.tiles);
  }
  if (anchor.kind === 'civic' || anchor.kind === 'core' || anchor.kind === 'reserve') {
    const emitter = emitterById(city, anchor.id);
    if (emitter && hasTiles(emitter)) return asLatticeTiles(emitter.tiles);
    if (anchor.kind === 'civic') {
      const civic = (city.civicUses ?? []).find((entry) => entry.id === anchor.id);
      return latticeFromParcelIds(civic?.tiles);
    }
    if (anchor.kind === 'reserve' && city.reserve?.id === anchor.id) {
      const fromReserve = latticeFromParcelIds(city.reserve.tiles);
      if (fromReserve.length) return fromReserve;
      return asLatticeTiles(emitterById(city, city.reserve.id)?.tiles);
    }
    if (anchor.kind === 'core') {
      const id = String(anchor.id).replace(/:mouth$/, '');
      const core = (city.blockCores ?? []).find((entry) => entry.id === id)
        ?? (city.rightsOfWay ?? []).find((entry) => entry.id === id);
      if (!core) return [];
      const tx = core.tx ?? 1;
      const tz = core.tz ?? 1;
      return latticeFromParcelIds([`p${core.bx}${core.bz}${tx}${tz}`]);
    }
    return [];
  }
  if (anchor.kind === 'person' && hop) {
    const other = people?.byId?.[anchor.id];
    return tilesForAnchor(city, state, other?.toAnchor, people, false);
  }
  return [];
}

function personEntities(city, state) {
  const people = state?.people;
  if (!people?.order?.length) return [];
  const entities = [];
  for (const id of people.order) {
    const person = people.byId?.[id];
    if (!person) continue;
    entities.push({
      id: person.id,
      key: person.id,
      kind: 'person',
      typeId: person.archetypeId,
      tiles: tilesForAnchor(city, state, person.toAnchor, people, true),
    });
  }
  return entities;
}

function fireAnchorId(match, people) {
  const sides = [match.left, match.right];
  const persons = sides.filter((side) => side.kind === 'person');
  for (const side of persons) {
    const anchor = people?.byId?.[side.id]?.toAnchor;
    if (anchor?.kind === 'parcel' && anchor.id) return anchor.id;
  }
  const building = sides.find((side) => side.kind === 'building');
  if (building?.id) return building.id;
  for (const side of persons) {
    const anchor = people?.byId?.[side.id]?.toAnchor;
    if (anchor?.id) return anchor.id;
  }
  return match.left.id;
}

function effectFragment(effect) {
  if (!effect) return '';
  if (effect.measure === 'cancelOutcome') return '×';
  if (effect.measure === 'coffeeIntelBundle' || effect.measure === 'fireTargetScore') {
    return 'intel';
  }
  if (typeof effect.value === 'boolean' && effect.value) return 'intel';
  if (Number.isFinite(effect.set)) {
    if (effect.measure === 'suppressionRadius') return `radius ${effect.set}`;
    if (effect.measure === 'worksDefectChanceBp') return `defect ${Math.round(effect.set / 100)}%`;
    return `×${effect.set}`;
  }
  if (Number.isFinite(effect.add)) {
    if (effect.measure === 'suppressionRadius') return `radius ${effect.add}`;
    return `add ${effect.add}`;
  }
  if (Number.isFinite(effect.multiplier)) {
    const delta = Math.round((effect.multiplier - 1) * 100);
    const signed = `${delta > 0 ? '+' : ''}${delta}%`;
    if (effect.measure === 'curve' || /demand/i.test(effect.measure ?? '')) {
      return `demand ${signed}`;
    }
    if (/chance/i.test(effect.measure ?? '')) return signed;
    return `×${effect.multiplier}`;
  }
  return '';
}

/** First-effect fragment for a roster row. HUD prints this when there is no buy lot. */
export function pairEffectFragment(row) {
  const recipe = PAIR_SYNERGIES.find((entry) => entry.name === row?.name);
  return effectFragment(recipe?.effects?.[0]);
}

function presentEmitters(city, row) {
  const emitters = [];
  if (row.leftId) {
    const emitter = emitterById(city, row.leftId);
    if (emitter && hasTiles(emitter)) {
      emitters.push({
        id: emitter.id,
        useId: emitter.useId,
        tiles: asLatticeTiles(emitter.tiles),
        side: 0,
      });
    }
  }
  if (row.rightId) {
    const emitter = emitterById(city, row.rightId);
    if (emitter && hasTiles(emitter)) {
      emitters.push({
        id: emitter.id,
        useId: emitter.useId,
        tiles: asLatticeTiles(emitter.tiles),
        side: 1,
      });
    }
  }
  return emitters;
}

function curveOpsFor(recipe, side, sector) {
  return recipe.effects
    .filter((effect) =>
      effect.measure === 'curve'
      && effect.target === side
      && (effect.sector == null || effect.sector === sector))
    .map((effect) => ({ ...effect, name: recipe.name }));
}

/**
 * Legacy compatibility roster. Wave L has no building↔building pair recipes, so this
 * now returns only the surviving person-interaction summary. District rows come from
 * `cityDistrictRoster` below.
 */
export function cityPairRoster(city, state = null) {
  const entities = buildingEntities(city);
  const liveMatches = resolvePairSynergies(entities);
  const byName = new Map();
  for (const match of liveMatches) {
    const list = byName.get(match.name) ?? [];
    list.push(match);
    byName.set(match.name, list);
  }
  const rows = [];
  for (const recipe of buildingRecipes().sort((left, right) =>
    left.name.localeCompare(right.name))) {
    const leftUseDefault = recipe.participants[0].ids[0];
    const rightUseDefault = recipe.participants[1].ids[0];
    const lefts = pickByType(entities, recipe.participants[0].ids);
    const rights = pickByType(entities, recipe.participants[1].ids);
    const live = (byName.get(recipe.name) ?? [])
      .slice()
      .sort((left, right) =>
        String(left.left.id).localeCompare(String(right.left.id))
        || String(left.right.id).localeCompare(String(right.right.id)));
    if (live.length) {
      const match = live[0];
      rows.push(freezeRow({
        name: recipe.name,
        live: true,
        kind: 'building',
        leftId: match.left.id,
        rightId: match.right.id,
        leftUse: match.left.typeId ?? leftUseDefault,
        rightUse: match.right.typeId ?? rightUseDefault,
        missing: null,
        maxDistance: recipe.maxDistance,
      }));
      continue;
    }
    const left = lefts[0] ?? null;
    const right = rights[0] ?? null;
    rows.push(freezeRow({
      name: recipe.name,
      live: false,
      kind: 'building',
      leftId: left?.id ?? null,
      rightId: right?.id ?? null,
      leftUse: left?.typeId ?? leftUseDefault,
      rightUse: right?.typeId ?? rightUseDefault,
      missing: dormantMissing(recipe, left, right),
      maxDistance: recipe.maxDistance,
    }));
  }
  const fires = state ? livePersonFires(city, state) : [];
  const liveNames = Object.freeze(
    [...new Set(fires.map((fire) => fire.name))].sort((left, right) =>
      left.localeCompare(right)),
  );
  const live = fires.length > 0;
  rows.push(freezeRow({
    name: 'Person pairs',
    kind: 'person-summary',
    live,
    liveCount: fires.length,
    liveNames,
    missing: live ? null : 'no people fires',
    leftId: null,
    rightId: null,
    maxDistance: 0,
  }));
  return Object.freeze(rows);
}

/** Top 1–3 tradeable lots in d1–d3 with non-zero amenity gain from this pair. */
export function pairReceivers(city, state, row) {
  if (!row || row.kind === 'person-summary') return Object.freeze([]);
  const recipe = PAIR_SYNERGIES.find((entry) => entry.name === row.name);
  if (!recipe) return Object.freeze([]);
  const emitters = presentEmitters(city, row);
  if (!emitters.length) return Object.freeze([]);
  const scored = [];
  for (const id of activeOrder(city, state)) {
    const parcel = activeParcel(city, state, id);
    if (!parcel) continue;
    const parcelTiles = latticeFromParcelIds(parcel.tiles);
    let gain = 0;
    let distance = Infinity;
    for (const emitter of emitters) {
      const nearest = nearestTileDistance(parcelTiles, emitter.tiles);
      if (nearest < 1 || nearest > 3) continue;
      const curve = INFLUENCE_CURVES[parcel.sector]?.[emitter.useId];
      if (!curve) continue;
      const base = curve[nearest - 1];
      const ops = curveOpsFor(recipe, emitter.side, parcel.sector);
      if (!ops.length) continue;
      const withPair = applyOperations(base, ops);
      const delta = withPair.bp - base;
      if (delta === 0) continue;
      gain += delta;
      if (nearest < distance) distance = nearest;
    }
    if (gain === 0) continue;
    scored.push({ id, distance, gainBp: gain });
  }
  scored.sort((left, right) =>
    Math.abs(right.gainBp) - Math.abs(left.gainBp) || left.id.localeCompare(right.id));
  return Object.freeze(scored.slice(0, 3).map((entry) => Object.freeze(entry)));
}

export function livePersonFires(city, state) {
  const people = state?.people;
  if (!people?.order?.length) return Object.freeze([]);
  const entities = [...buildingEntities(city), ...personEntities(city, state)];
  const matches = [...resolvePairSynergies(entities)]
    .filter((match) => match.left.kind === 'person' || match.right.kind === 'person')
    .sort((left, right) =>
      left.name.localeCompare(right.name)
      || String(left.left.id).localeCompare(String(right.left.id))
      || String(left.right.id).localeCompare(String(right.right.id)));
  return Object.freeze(matches.map((match) => freezeRow({
    name: match.name,
    leftId: match.left.id,
    rightId: match.right.id,
    leftKind: match.left.kind,
    rightKind: match.right.kind,
    effects: match.effects,
    anchorId: fireAnchorId(match, people),
  })));
}

function bestDistrictEvaluation(rows) {
  return [...rows].sort((left, right) =>
    right.met - left.met
    || left.missing - right.missing
    || left.blockId.localeCompare(right.blockId))[0] ?? null;
}

/**
 * One authored board row per district definition. Conditions are read live for socket
 * evidence; `live` is read only from the settled snapshot, so a recipe forms or dissolves
 * exactly at settle rather than while the player is still arranging the block.
 */
export function cityDistrictRoster(city, state) {
  const evaluations = evaluateDistrictConditions(city, state);
  const byDistrict = new Map(DISTRICT_DEFINITIONS.map((definition) => [definition.id, []]));
  for (const row of evaluations) byDistrict.get(row.districtId)?.push(row);
  const committed = state?.districtEngine?.formations ?? [];
  return Object.freeze(DISTRICT_DEFINITIONS.map((definition) => {
    const rows = byDistrict.get(definition.id) ?? [];
    const formations = committed
      .filter((formation) => formation.districtId === definition.id)
      .sort((left, right) => left.key.localeCompare(right.key));
    const formationRows = formations
      .map((formation) => rows.find((row) => row.key === formation.key) ?? null)
      .filter(Boolean);
    const primary = formations.length
      ? formationRows[0] ?? bestDistrictEvaluation(rows)
      : bestDistrictEvaluation(rows);
    const live = formations.length > 0;
    const ready = !live && primary?.formed;
    const status = live ? 'live' : ready ? 'ready' : primary?.missing === 1 ? 'one-away' : 'dormant';
    const footprintBlockIds = live
      ? [...new Set(formations.flatMap((formation) => formation.footprintBlockIds ?? []))].sort()
      : [...(primary?.footprintBlockIds ?? [])];
    const evidenceRows = live
      ? (formationRows.length ? formationRows : primary ? [primary] : [])
      : primary ? [primary] : [];
    const members = definition.requirements.map((requirement) => {
      const sockets = evidenceRows
        .map((row) => row.sockets.find((socket) => socket.id === requirement.id))
        .filter(Boolean);
      const satisfied = sockets.some((socket) => socket.satisfied);
      return Object.freeze({
        id: requirement.id,
        face: requirement.label,
        status: satisfied ? 'filled' : 'missing',
        count: sockets.length ? Math.max(...sockets.map((socket) => socket.count)) : 0,
        required: requirement.min,
        targetIds: Object.freeze([...new Set(sockets.flatMap((socket) => socket.targetIds))].sort()),
        candidateParcelIds: Object.freeze([
          ...new Set(sockets.filter((socket) => !socket.satisfied)
            .flatMap((socket) => socket.candidateParcelIds)),
        ].sort()),
      });
    });
    return Object.freeze({
      id: definition.id,
      name: definition.name,
      kind: 'district',
      live,
      ready,
      status,
      originBlockId: primary?.blockId ?? null,
      footprintBlockIds: Object.freeze(footprintBlockIds),
      formations: Object.freeze(formations),
      members: Object.freeze(members),
      met: primary?.met ?? 0,
      total: primary?.total ?? definition.requirements.length,
      pendingDissolution: live && (
        formationRows.length !== formations.length || formationRows.some((row) => !row.formed)
      ),
    });
  }));
}

export function districtNextBuildCount(city, state) {
  return cityDistrictRoster(city, state)
    .filter((row) => row.status === 'ready' || row.status === 'one-away').length;
}

/** Named fires currently true this quarter. Loop 2 ticker data. */
export function quarterFires(city, state) {
  const fires = [];
  const quarter = state?.quarter ?? 0;
  for (const formation of state?.districtEngine?.formations ?? []) {
    const name = formation.name.toUpperCase();
    const anchorId = activeOrder(city, state).find((id) => {
      const parcel = activeParcel(city, state, id);
      return parcel && `${parcel.bx},${parcel.bz}` === formation.blockId;
    }) ?? null;
    const definition = DISTRICT_DEFINITIONS.find((row) => row.id === formation.districtId);
    const effect = definition?.effects?.find((row) => row.measure === 'rent')
      ?? definition?.effects?.[0];
    fires.push(Object.freeze({
      key: `${quarter}|${name}|${formation.key}`,
      name,
      anchorId,
      fragment: effect ? `${effect.bp > 0 ? '+' : ''}${effect.bp} bp` : '',
    }));
  }
  for (const fire of livePersonFires(city, state)) {
    const name = fire.name.toUpperCase();
    fires.push(Object.freeze({
      key: `${quarter}|${name}|${fire.anchorId}`,
      name,
      anchorId: fire.anchorId,
      fragment: effectFragment(fire.effects?.[0]),
    }));
  }
  fires.sort((left, right) =>
    left.key.localeCompare(right.key)
    || left.name.localeCompare(right.name)
    || String(left.anchorId).localeCompare(String(right.anchorId)));
  return Object.freeze([...new Map(fires.map((fire) => [fire.key, fire])).values()]);
}

export function pairsHeaderSummary(city, state) {
  const roster = cityPairRoster(city, state);
  let live = 0;
  const lots = new Set();
  for (const row of roster) {
    if (row.kind === 'person-summary') {
      if (row.live) live += 1;
      continue;
    }
    if (row.live) live += 1;
    for (const receiver of pairReceivers(city, state, row)) lots.add(receiver.id);
  }
  return Object.freeze({ live, lots: lots.size });
}
