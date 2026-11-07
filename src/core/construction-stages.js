// District Deck — residential redevelopment construction stages.
// Pure helpers: duration, stage index, labels. Renderer + economy consume these.

import { ARCHETYPES } from './content.js';

/** Every ground-up or change-of-use job spends at least three full quarters on site. */
export const MIN_BUILD_QUARTERS = 3;

/** The authored height ladder tops out at eight storeys in the ordinary BUILD catalog. */
export const MAX_STAGED_STOREYS = 8;

/**
 * Per-quarter chance (basis points) of a construction accident while a site is open.
 * One accident max per job; delays completion by one quarter.
 */
export const CONSTRUCTION_ACCIDENT_CHANCE_BP = 1600; // 16% / quarter under works

/** Rubbish collection cycle: bin day every N quarters. */
export const BIN_DAY_PERIOD_QUARTERS = 4;

export function isBinDay(quarter) {
  return Number(quarter) > 0 && Number(quarter) % BIN_DAY_PERIOD_QUARTERS === 0;
}

/**
 * Real-world sequence for a Melbourne residential pad:
 * 0 demolition → 1 concrete slab → 2 timber frame → 3 envelope / completion
 */
export const CONSTRUCTION_STAGES = Object.freeze([
  Object.freeze({
    id: 'demolition',
    label: 'Demolition',
    short: 'Demo',
    description: 'Existing structure down · site cleared',
  }),
  Object.freeze({
    id: 'slab',
    label: 'Concrete slab',
    short: 'Slab',
    description: 'Formwork · slab pour · services stub',
  }),
  Object.freeze({
    id: 'frame',
    label: 'Timber frame',
    short: 'Frame',
    description: 'Stud walls · floor joists · roof trusses',
  }),
  Object.freeze({
    id: 'completion',
    label: 'Build completion',
    short: 'Fit-out',
    description: 'Cladding · glazing · lock-up approach',
  }),
]);

export function isResidentialBuildTarget(toArchetype, sectorAfter = null) {
  const sector = ARCHETYPES[toArchetype]?.sector ?? sectorAfter;
  return sector === 'residential';
}

export function isTownhouseBuildTarget(toArchetype) {
  return String(toArchetype ?? '').startsWith('townhouse-');
}

/**
 * Construction calendar by completed form height:
 * 1 storey 3q · 2–3 4q · 4–5 5q · 6–7 6q · 8 7q.
 * Heights beyond the current catalog keep extending by the same two-storey cadence.
 */
export function constructionDurationForStoreys(storeys) {
  const height = Math.max(1, Math.floor(Number(storeys) || 1));
  return MIN_BUILD_QUARTERS + Math.ceil((height - 1) / 2);
}

export function constructionDurationQuarters(toArchetype, sectorAfter = null) {
  void sectorAfter;
  return constructionDurationForStoreys(ARCHETYPES[toArchetype]?.storeys ?? 1);
}

/**
 * Stage for a live construction job.
 * The four authored visual stages are spread across the height-driven works calendar.
 * Jobs longer than four quarters hold their lock-up presentation while fit-out completes.
 */
export function constructionStageIndex(construction, currentQuarter) {
  if (!construction) return -1;
  const started = construction.startedQuarter ?? currentQuarter;
  const elapsed = Math.max(0, currentQuarter - started);
  const duration = Math.max(
    1,
    (construction.completionQuarter ?? (started + 1)) - started,
  );
  if (duration <= 1) return 0;
  // One named stage per elapsed quarter (demo→slab→frame→lock-up). Longer height-driven
  // jobs and accident delays hold on lock-up rather than inventing unsupported stages.
  if (duration >= CONSTRUCTION_STAGES.length) {
    return Math.min(CONSTRUCTION_STAGES.length - 1, elapsed);
  }
  // Shorter jobs: stretch stages across remaining time.
  const ratio = Math.min(0.999, elapsed / duration);
  return Math.min(
    CONSTRUCTION_STAGES.length - 1,
    Math.floor(ratio * CONSTRUCTION_STAGES.length),
  );
}

export function constructionStage(construction, currentQuarter) {
  const index = constructionStageIndex(construction, currentQuarter);
  if (index < 0) return null;
  const stage = CONSTRUCTION_STAGES[index];
  const started = construction.startedQuarter ?? currentQuarter;
  const completion = construction.completionQuarter ?? (started + 1);
  const remaining = Math.max(0, completion - currentQuarter);
  return {
    ...stage,
    index,
    startedQuarter: started,
    completionQuarter: completion,
    remainingQuarters: remaining,
    progressLabel: `${stage.label} · Q${completion}`,
  };
}

export function constructionStageLabel(construction, currentQuarter) {
  return constructionStage(construction, currentQuarter)?.progressLabel ?? 'Under construction';
}
