// District Deck — ring metrics. Two numbers, and nothing else.
//
// WHY THIS FILE EXISTS
//
// `edge-massing.js` (the crust) and `fringe.js` (the hinterland overlay) both
// need the outer radius and the sampling pitch of the overlay ring. They cannot
// import each other: the crust reads the live scene to seat its dishes, and the
// overlay re-derives from `surroundHeightAt`, so a direct import in either
// direction closes a cycle.
//
// The two lanes proposed solving that with a private copy on each side. That is
// the fault this programme has paid for twice already, in exactly this shape:
//
//   * `edge-massing.js portFaceM()` put the port waterline at 3.99 m while the
//     rendered wharf ran to 38.5 m, and the calm-harbour damping was sized on
//     the first number. The board's ocean stood 1.947 m proud of the concrete.
//   * The capture camera's field of view is 32, while the rig constructor's is
//     26 and never restored. Two lanes derived their own projection from the
//     stale copy and were each wrong by tan(13°)/tan(16°) — one on its boats,
//     one on all four airport legends.
//
// Both were one number living in two places. So these live in one place, in a
// module that imports NOTHING, which makes a cycle impossible by construction
// rather than by discipline. This is the port lane's precedent: it moved
// `QUAY_SEAWARD` / `DECK_Y` into `ships.js` for the same reason after finding
// that importing them back out of `port.js` produced a TDZ throw that was
// silent in one module load order and fatal in the other.
//
// Do not add anything to this file that has a dependency. If a value needs one,
// it does not belong here.

/**
 * Outer radius of the hinterland overlay ring, in board metres from centre.
 * The crust fades its own field toward this radius; the overlay stops at it.
 */
export const OVERLAY_OUTER = 624;

/**
 * Overlay vertex pitch, metres — THE MEAN OF ONE AXIS, not a limit.
 *
 * The first version of this file described 10.6 as "the finest feature either
 * sheet can carry". The overlay lane measured it on the built mesh and that is
 * false. The overlay does not have a pitch; it has two, and they differ by 3×
 * across the ring:
 *
 *   radial      min 6.33 · median 10.27 · max 14.45 · mean 10.23
 *               banded 7.43 m at r 140–250, rising to 13.36 m at r 500–624
 *   azimuthal   6.54 m at r 200 · 13.09 at r 400 · 19.63 at r 600
 *
 * 10.6 is the mean of the RADIAL axis alone. Past **r ≈ 380 the azimuthal
 * pitch is the coarser and therefore the binding one**, reaching 19.63 m at the
 * rim — nearly double the scalar.
 *
 * So the scalar is permissive near the board, where the true limit is 6.5–7.4 m
 * and finer detail could actually be carried, and optimistic at the rim, where
 * an octave between 10.6 and 19.6 m is filtered out while the constant says it
 * survives. That is the same shape as the fault the crust lane had just closed:
 * right surface, wrong statistic.
 *
 * **Use `overlayPitchAt(r)` for any filtering or authoring decision.** The
 * scalar remains only for callers that genuinely need one number, and it is the
 * mean rather than the bound.
 */
export const OVERLAY_PITCH = 10.6;

/**
 * Azimuthal divisions of the overlay ring. Azimuthal pitch is 2πr / this.
 *
 * RECONCILED (P15-T6B): the live overlay is 224 × 34 on high, and this constant
 * is 224, so `overlayPitchAt`'s azimuthal term is exact. The radial term below
 * is a fit measured on a 192 × 46 build and is therefore an approximation of
 * the current walk — it was already one before this lane, and it stays one:
 * `radialPitchAt` is outside T6B's edit list, so the fit is left alone rather
 * than re-fitted from a build nobody has re-measured. Where it matters, it
 * matters only past r ≈ 560, because inside that radius the azimuthal axis
 * binds and it is computed exactly. See `planFringe` in `fringe.js` for the
 * ring-count arithmetic and what it costs at the rim.
 */
export const OVERLAY_AZ_COUNT = 224;

/**
 * Radial pitch at radius `r`, metres. Piecewise-linear through the overlay
 * lane's measured band endpoints — measured on the built mesh, not derived from
 * the tessellation, because the radial walk is biased and does not reduce to a
 * closed form. Clamped outside the measured range rather than extrapolated.
 *
 * ── THE DISAGREEMENT THAT WAS HERE IS CLOSED, AND THE REFUSAL PAID ──
 * An earlier version of this comment recorded a conflict: the overlay lane had
 * reported the crossover — where azimuthal overtakes radial and becomes the
 * binding limit — at r ≈ 380, and a two-endpoint fit here put it at r ≈ 300.
 * That fit was deliberately NOT bent to reproduce 380, on the grounds that
 * fitting an approximation to a single reported figure is how a measurement
 * quietly becomes a guess.
 *
 * The lane then measured it properly: **the crossover is 270.0 m empirically,
 * 261.3 m closed-form.** Neither figure was right, but the unbent fit was
 * wrong by 30 m in the safe direction where 380 was wrong by 110 m in the
 * confident one. Had the curve been tuned to the reported number, this file
 * would now be confidently wrong instead of conservatively approximate.
 *
 * How the 380 arose is worth keeping, because the mechanism recurs: it compared
 * a **band mean** against a **point sample at a different radius**, with bands
 * 130–140 m wide — a bin wider than the feature being located. The band at
 * r 250–380 had already crossed. Same shape as the streak attribution earlier
 * in this programme: a real quantity read off the wrong instrument.
 */
export function radialPitchAt(r) {
  const x = Math.max(0, Number(r) || 0);
  // Linear fit over all 192 spokes × 46 steps = 8,832 measured segments.
  // rms 0.218 m, max error 0.490 m, valid r 159..617; clamped outside.
  const RAD_A = 4.2753;
  const RAD_B = 0.016365;
  return RAD_A + RAD_B * Math.min(Math.max(x, 159), 617);
}

/**
 * The pitch that actually binds at radius `r`, metres: the coarser of the two
 * axes. This is the number a filter or an authored octave must clear — an
 * octave finer than this is smoothed away rather than drawn.
 */
export function overlayPitchAt(r) {
  const x = Math.max(0, Number(r) || 0);
  return Math.max(radialPitchAt(x), (2 * Math.PI * x) / OVERLAY_AZ_COUNT);
}

export default {
  OVERLAY_OUTER,
  OVERLAY_PITCH,
  OVERLAY_AZ_COUNT,
  radialPitchAt,
  overlayPitchAt,
};
