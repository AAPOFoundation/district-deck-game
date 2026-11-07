// Authored world metres. Design ranges are renderer choices, not real-world regulations.
// Grid dimensions are imported so profiles cannot drift from gameplay's lattice.
import { TILE, STOREY, CORRIDOR } from '../core/grid.js';

export const AUTHORED_SCALE = Object.freeze({
  city: Object.freeze({
    units: 'metres', parcel: TILE, storey: STOREY,
    lane: CORRIDOR.carriagewayA[1] - CORRIDOR.carriagewayA[0],
    footpath: CORRIDOR.footpathA[1] - CORRIDOR.footpathA[0],
    adultHeight: Object.freeze([1.53, 1.76]), adultReferenceHeight: 1.7, childHeight: 1.18,
    benchSeat: 0.470, benchSeatSpan: Object.freeze([1.65, 1.72]), reserveBenchPadSpan: 1.98, picnicTop: 0.835,
    furniture: Object.freeze({ bollardHeight: [0.9, 1.1], binHeight: [0.9, 1.1],
      pedestrianLampHeight: [4, 6], clearWalkway: 1.5, entranceClearWidth: 1.2 }),
    groundcover: Object.freeze({ height: [0.05, 0.35], role: 'ground-following carpet, subordinate to shrubs' }),
    shrubs: Object.freeze({ height: [0.35, 1.5], role: 'bed-scale planting below adult eye level' }),
    sapling: Object.freeze({ height: [2, 4.5], role: 'young narrow planting' }),
    streetShade: Object.freeze({ height: [4, 9], crownDiameter: [3, 8], role: 'species-led street canopy' }),
    landmarkTree: Object.freeze({ height: [9, 16], crownDiameter: [4, 12], role: 'deliberate civic/park exception with measured site clearance' }),
  }),
  airport: Object.freeze({
    units: 'metres', terminalHeight: 12, secondaryTerminalHeight: 9,
    perimeterStemPitch: 112 / 17,
    adult: Object.freeze({ bodyHeadHeight: Object.freeze([1.86, 1.90, 1.94]), maxFullHeight: 2.15, guestSuitcaseHeight: .65, role: 'airport adults measured from complete emitted body/head; hats and accessories audited separately' }),
    palm: Object.freeze({ crownDiameter: [4.6, 5.6], diameterPerClearStem: 0.85,
      minWalkingClearance: 2.4, role: 'mature landside palm, clear stem retained' }),
    exceptions: Object.freeze([{ id: 'airport-figures', nominalHeightParameter: [3.05, 3.58],
      reference: 'city adult 1.53–1.76', reason: 'original nominal source parameters retained; accepted R156 sizing uses complete measured adult assemblies at body/head 1.86–1.94 m' }]),
  }),
});

export function palmCrownDiameter(clearStem, profile = AUTHORED_SCALE.airport.palm) {
  if (!Number.isFinite(clearStem) || clearStem <= 0) throw new Error('Positive measured clear stem required');
  const [lo, hi] = profile.crownDiameter;
  return Math.max(lo, Math.min(hi, clearStem * profile.diameterPerClearStem));
}

// Radius is the greatest horizontal vertex distance from the attachment, not box width.
// Both x/z spans must additionally be reported for asymmetric crowns.
export function radialCrownDiameter(position, anchor) {
  let radius = 0;
  for (let i = 0; i < position.count; i++) radius = Math.max(radius,
    Math.hypot(position.getX(i) - anchor[0], position.getZ(i) - anchor[2]));
  if (!(radius > 0)) throw new Error('Nonempty crown required');
  return radius * 2;
}

export function dimensionalRatios({ height, crownDiameter, clearStem }) {
  return { heightInStoreys: height / AUTHORED_SCALE.city.storey,
    crownInFootpaths: crownDiameter / AUTHORED_SCALE.city.footpath,
    adultReferenceHeight: AUTHORED_SCALE.city.adultReferenceHeight,
    crownInAdultHeights: crownDiameter / AUTHORED_SCALE.city.adultReferenceHeight,
    crownPerClearStem: crownDiameter / clearStem };
}
