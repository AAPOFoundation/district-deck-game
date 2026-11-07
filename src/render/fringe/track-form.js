// taste W31 to W33: the formed farm track (ruts, crown and a verge in bays), in a module of its own so that fringe.js, rail-link.js and farm.js
// can all draw it. It imports nothing from fringe.js (that would be a cycle); the palette a track is laid in comes in as an argument.
import * as THREE from 'three';
import { TASTE } from '../taste-tokens.js';
import { crownSwitch } from '../tree-forms.js';
import { applyGroundShadowFloor } from './transit.js';

/** Identical to the helpers of the same names in fringe.js (the hinterland track's hashes depend on every digit). */
function tokenLinear(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
function wob(a, b = 0, c = 0) {
  const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return v - Math.floor(v);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}
function valueNoise2(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = wob(x0, y0, seed);
  const n10 = wob(x0 + 1, y0, seed);
  const n01 = wob(x0, y0 + 1, seed);
  const n11 = wob(x0 + 1, y0 + 1, seed);
  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}
function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / Math.max(1e-6, e1 - e0));
  return t * t * (3 - 2 * t);
}

/**
 * The paddock sheet's palette, as fringe.js holds it (PADDOCK_GAIN and PADDOCK_TINT): the tracks that lie on the hinterland sheet are laid in
 * it. fringe.js passes its own; farm.js, which cannot import fringe.js, reads these.
 */
export const TRACK_PADDOCK_GAIN = 0.20;
export const TRACK_PADDOCK_TINT = [0.92, 1.0, 1.08];

/**
 * taste W31: TRACK_FORM. 1 draws a farm track as a farm track: two bare wheel ruts (pale dust at the lips, a darker, lower
 * bed, damper in stretches), a grass crown between them that wears bare patches now and then, and a grass verge whose outer edge is
 * ragged (it comes and goes in bays, between 1.95 and 2.95 m of the line) and fades out into the paddock instead of ending on a
 * ruled edge. Value moves along the run at three scales (25 m, 6 m and 2 m). It is a different mesh on a different material: the
 * verge needs vertex alpha, so the ribbon is drawn in the transparent pass (same polygon offset, same render order). The track
 * lines and the 3.2 m footprint the hedge gateways, fences and placements read are not touched; nothing is drawn past 2.95 m.
 * Browser: `?trackForm=0`; node: `DD_TRACK_FORM=0`; tests may call `setTrackForm`. 0 restores wave thirty's picture exactly: the same
 * geometry on the same material (no shader text or program key changes at 0).
 */
export const TRACK_FORM = crownSwitch('DD_TRACK_FORM', 'trackForm');
let trackFormOn = TRACK_FORM;
export function setTrackForm(v) { trackFormOn = v ? 1 : 0; }
export function trackFormActive() { return trackFormOn; }
/**
 * taste W32: TRACK_RUT. 1 draws the formed track's ruts as wheel lines and its verge as bays. Each rut is a 0.7 m bed (0.70 to 1.40 m
 * of the line) with a pale lip either side and a grass crown between the pair, dark enough to read as a line from 70 to 120 m; the
 * verge's outer edge comes and goes in bays a metre or two long (a noise in the texture's alpha, cut by an alpha test, so the bays are
 * finer than the 2.5 m stations) and nothing is drawn past 2.95 m of the line, wander included. The mesh stays one ribbon (21 columns
 * a station, 34,545 vertices at seed 0). The track lines and the 3.2 m footprint are not touched. It acts only where TRACK_FORM is on:
 * `?trackForm=0` still restores wave thirty. Browser: `?trackRut=0`; node: `DD_TRACK_RUT=0`; tests may call `setTrackRut`. 0 restores
 * wave thirty-one's picture exactly: the same geometry, the same texture, the same material and shader text.
 */
export const TRACK_RUT = crownSwitch('DD_TRACK_RUT', 'trackRut');
let trackRutOn = TRACK_RUT;
export function setTrackRut(v) { trackRutOn = v ? 1 : 0; }
export function trackRutActive() { return trackRutOn; }
/**
 * taste W33: TRACK_KIN. 1 draws the two farm tracks that were still a flat ribbon (`fringe:airport-link-farm-track`, 2.6 m wide, and
 * `farm:gateway-track`, 2.8 m wide) in the same form, scaled to their own width (the hinterland form is 5.9 m across, so the scale is the
 * half width over 2.95 m): two ruts, a crown and a verge inside the footprint each has now, on the same line and the same ground. It also
 * softens the verge's alpha-tested edge on all three tracks: the alpha test is replaced by a ramp in the fragment shader (no more
 * vertices). It acts only where TRACK_FORM and TRACK_RUT are on. Browser: `?trackKin=0`; node: `DD_TRACK_KIN=0`; tests may call
 * `setTrackKin`. 0 restores wave thirty-two's picture exactly: the same geometry hashes and the same shader text.
 */
export const TRACK_KIN = crownSwitch('DD_TRACK_KIN', 'trackKin');
let trackKinOn = TRACK_KIN;
export function setTrackKin(v) { trackKinOn = v ? 1 : 0; }
export function trackKinActive() { return trackKinOn && trackFormOn && trackRutOn ? 1 : 0; }
/**
 * taste W34: the airport-link track is drawn in the form. Wave thirty-three held it flat on the reading that its ruts ran across the link
 * road; wave thirty-four measured that it never reaches the road (`rail-link.js` `clear()` drops every vertex over the formation, so the
 * track comes in two runs with a 19.8 m gap and stands 5.1 m or more from the kerbs). 0 holds it flat.
 */
export const TRACK_KIN_AIRPORT = 1;
/**
 * taste W36: the farm gateway track is drawn in the form. Its line crosses the airport link road and runs along the Southern Cross apron's
 * service road (`fringe:southern-cross-apron:service-road`, x -50.5 to -10 at z 151.78, from `fringe/station.js`); wave thirty-five held it
 * flat because 355 of its 4,935 formed vertices lay over the apron road. `farm.js` now breaks its runs (`splitTrackRuns`, below) at both
 * roads, with the footprints `rail-link.js` and `station.js` publish, so no formed vertex lies on either. 0 holds it on the flat strip.
 * The track is built only once a player farm is placed.
 */
export const TRACK_KIN_GATEWAY = 1;
/**
 * taste W37: TRACK_APRON. The hinterland farm tracks (`fringe:hinterland-farm-track`) cross the Southern Cross apron's service road in one
 * place, and 69 of the ribbon's vertices lay over the road (a faint brown streak on it; wave thirty-six's reviewer). 1 breaks the ribbon's
 * runs there, with the footprint `station.js` publishes (`apronFootprint`, read in `_buildHinterland`, which runs after `addStation`), by the
 * way `splitTrackRuns` breaks the gateway track: a stretch is kept where the line and its whole 2.95 m reach to either side are clear, so the
 * ruts end on grass at each side and no vertex lies on the road. The track lines and the 3.2 m footprint that gateways, fences and
 * placements read do not move; every other vertex keeps its station, noise and colour. It acts only where TRACK_FORM and TRACK_RUT are on.
 * Browser: `?trackApron=0`; node: `DD_TRACK_APRON=0`; tests may call `setTrackApron`. 0 gives wave thirty-six's picture exactly.
 */
export const TRACK_APRON = crownSwitch('DD_TRACK_APRON', 'trackApron');
let trackApronOn = TRACK_APRON;
export function setTrackApron(v) { trackApronOn = v ? 1 : 0; }
export function trackApronActive() { return trackApronOn && trackFormOn && trackRutOn ? 1 : 0; }
/**
 * taste W43: TRACK_SHADOW. 1 softens the directional shadow a farm track receives. The key light runs `shadow.radius = 0`, so every
 * track and the paddock sheet under it read one hard, stair-edged shadow-map mask; the sheet hides that edge under its grass detail and
 * its weaker direct term, the track's smooth surface shows it as hard polygons. The track's material filters the same shadow map with
 * TRACK_SHADOW_TAPS taps on a Vogel disc of TRACK_SHADOW_RADIUS shadow texels (rotated per pixel, as three's own filter is), in place of
 * the one-point lookup. Where a texel is wholly in shadow every tap is, so its darkness (the 0.62 floor) is where it was. The sheet, the
 * tree-shade decal, the light and the shadow map are not touched. It acts only where TRACK_FORM is on, on every material
 * `makeTrackFormMaterial` makes. Browser: `?trackShadow=0`; node: `DD_TRACK_SHADOW=0`; tests may call `setTrackShadow`. 0 gives wave
 * forty-two's shader text and program key exactly.
 */
export const TRACK_SHADOW = crownSwitch('DD_TRACK_SHADOW', 'trackShadow');
let trackShadowOn = TRACK_SHADOW;
export function setTrackShadow(v) { trackShadowOn = v ? 1 : 0; }
export function trackShadowActive() { return trackShadowOn && trackFormOn ? 1 : 0; }
export const TRACK_SHADOW_TAPS = 12;
export const TRACK_SHADOW_RADIUS = 2.0;
/**
 * taste W84 (TRACK_BED): the hinterland farm track (the straight tracks and the routed corridors alike) is drawn as a tint on the ground under
 * it, not as a colour of its own. Its colours (pale worn bed and lips, dark ruts) were laid against the sheet's grass at a fixed light; the
 * sheet under them is lit by `ONE_GROUND` and `GROUND_SURFACE` as it is lit, so the same ribbon read as a pale band on one sheet and as two
 * dark ruts on the next. 1 gives each vertex a factor F, and the material blends it as `2 x src x dst` (0.5 is no change): the fragment writes
 * 0.5 x F (the vertex factor x the rut map x TRACK_FORM_MAP_GAIN, re-clamped, the rut gain on the depth below 1, eased to 1 by the vertex alpha
 * and the kin ramp), with no lighting, tone mapping or colour space, and fog eases it to 0.5 (no change) with distance. The sheet's own
 * light, shadow, rain and fog stay under the track; the track's own soft shadow (TRACK_SHADOW) has nothing left to filter and is not compiled
 * in. No depth is written, as before. Only the hinterland ribbon: the scaled ribbons (airport link, farm gateway) are not touched.
 *
 * Fix 1 (the factor is a value times a small, bounded colour). The per-channel factor f = (column colour x value) / (the station's grass)
 * carried the soil's redness against the grass as a red-and-blue multiplier on a ground that is already brown (a magenta cast), so it is split
 * at the vertex (CPU, `trackBedSplit`): L = the luminance of f (Rec. 709) and c = f / L, each channel of c clamped to [1 - h, 1 + h], then
 * renormalised so c's luminance is 1 (the luminance-weighted mean of its deviations is taken off, and the deviations shrink together if that
 * leaves a channel beyond 1 +- h), and F = L x c. `h` is `?trackBedHue=` (`DD_TRACK_BED_HUE`, 0 to 0.2, default 0); h = 0 is a grey tint that
 * changes only the value of the ground. The bed's value: the bed columns (crown j0 and flank j1) take max(L, lift), `lift` = `?trackBedLift=`
 * (`DD_TRACK_BED_LIFT`, 0.9 to 2.0, default 1.6), the bed's floor; the lips (j2, j8) stay no lighter than lift + 0.08; the ruts (j3 to j7)
 * and the verge (j9, j10) keep their L, and the rut gain `?trackBedRut=` (`DD_TRACK_BED_RUT`, 0 to 1.5, default 1) scales the depth below 1 in
 * the fragment. L and c are in the vertex colour (and so are the lift and the hue, read when the geometry is built); the fragment holds only
 * the rut map (a grey texture, 1.2 x its mean is 0.996, so it moves L around the vertex's L and adds no hue), the re-clamp, the rut gain and
 * the ease. The floor is a floor of the factor at full alpha: it eases to 1 by the vertex alpha and the kin ramp, as the rest does.
 * It acts only where TRACK_FORM and TRACK_RUT are on. It never reads `ONE_GROUND` or `GROUND_SURFACE`. Browser: `?trackBed=1`; node:
 * `DD_TRACK_BED=1`; tests may call `setTrackBed` and `setTrackBedKnobs`. 0 (the default) is `taste/r1-coherence`, exactly: the same colours,
 * material, shader text and program key.
 */
export const TRACK_BED = (typeof process !== 'undefined' && process?.env?.DD_TRACK_BED !== undefined)
  ? (Number(process.env.DD_TRACK_BED) > 0 ? 1 : 0)
  : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('trackBed') === '1') ? 1 : 0);
let trackBedOn = TRACK_BED;
export function setTrackBed(v) { trackBedOn = v ? 1 : 0; }
export function trackBedActive() { return trackBedOn && trackFormOn && trackRutOn ? 1 : 0; }
/** The factor's bounds on L. 2 is the most `2 x src x dst` can lift a colour; the floor keeps a rut from going black on a dark sheet. */
export const TRACK_BED_FLOOR = 0.30;
export const TRACK_BED_CEIL = 1.80;
export const TRACK_BED_LIFT_BOUND = [0.9, 2.0];
export const TRACK_BED_LIFT_DEFAULT = 1.6;
export const TRACK_BED_LIP_RISE = 0.08;
export const TRACK_BED_HUE_BOUND = [0, 0.2];
export const TRACK_BED_HUE_DEFAULT = 0;
export const TRACK_BED_RUT_BOUND = [0, 1.5];
const TRACK_BED_LUM = [0.2126, 0.7152, 0.0722];
function readBedKnob(env, param, bound, dflt) {
  let raw = null;
  if (typeof process !== 'undefined' && process?.env?.[env] !== undefined) raw = process.env[env];
  else if (typeof location !== 'undefined' && location?.search) raw = new URLSearchParams(location.search).get(param);
  const v = raw === null || raw === '' ? NaN : Number(raw);
  return Number.isFinite(v) ? Math.min(bound[1], Math.max(bound[0], v)) : dflt;
}
let trackBedLift = readBedKnob('DD_TRACK_BED_LIFT', 'trackBedLift', TRACK_BED_LIFT_BOUND, TRACK_BED_LIFT_DEFAULT);
let trackBedRut = readBedKnob('DD_TRACK_BED_RUT', 'trackBedRut', TRACK_BED_RUT_BOUND, 1);
let trackBedHue = readBedKnob('DD_TRACK_BED_HUE', 'trackBedHue', TRACK_BED_HUE_BOUND, TRACK_BED_HUE_DEFAULT);
const boundBed = (v, bound, dflt) => Math.min(bound[1], Math.max(bound[0], Number.isFinite(v) ? v : dflt));
export function setTrackBedKnobs(lift, rut, hue) {
  trackBedLift = boundBed(lift, TRACK_BED_LIFT_BOUND, TRACK_BED_LIFT_DEFAULT);
  trackBedRut = boundBed(rut, TRACK_BED_RUT_BOUND, 1);
  trackBedHue = boundBed(hue, TRACK_BED_HUE_BOUND, TRACK_BED_HUE_DEFAULT);
}
export function trackBedKnobs() { return { lift: trackBedLift, rut: trackBedRut, hue: trackBedHue }; }
/**
 * W84 (TRACK_BED): a vertex's value and colour, split. f = (column colour x value) / grass per channel; L = its Rec. 709 luminance, clamped to
 * [FLOOR, CEIL]; c = f / L with each channel's deviation from 1 clamped to +-h, the deviations then moved to a zero luminance-weighted mean (so
 * c has luminance 1) and scaled together if a channel is still beyond +-h. h = 0 gives c = (1, 1, 1).
 */
export function trackBedSplit(col, v, grass, h = trackBedHue) {
  const f = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) f[i] = (col[i] * v) / Math.max(grass[i], 1e-6);
  const L = TRACK_BED_LUM[0] * f[0] + TRACK_BED_LUM[1] * f[1] + TRACK_BED_LUM[2] * f[2];
  const c = [1, 1, 1];
  if (L > 1e-6 && h > 0) {
    const d = f.map((q) => Math.min(h, Math.max(-h, q / L - 1)));
    const m = TRACK_BED_LUM[0] * d[0] + TRACK_BED_LUM[1] * d[1] + TRACK_BED_LUM[2] * d[2];
    let mx = 0;
    for (let i = 0; i < 3; i += 1) { d[i] -= m; mx = Math.max(mx, Math.abs(d[i])); }
    const k = mx > h ? h / mx : 1;
    for (let i = 0; i < 3; i += 1) c[i] = 1 + d[i] * k;
  }
  return { L: Math.min(TRACK_BED_CEIL, Math.max(TRACK_BED_FLOOR, L)), c };
}
/**
 * W84 (TRACK_BED): a vertex's factor F = L x c for rut-form column j: the bed (j0 crown, j1 flank) takes max(L, lift), the lips (j2, j8) no more
 * than lift + 0.08, the rest keep L. `j` below 0 (or omitted) is a column with no part: L as it is.
 */
export function trackBedFactor(col, v, grass, j = -1) {
  const { L, c } = trackBedSplit(col, v, grass);
  const Lj = j === 0 || j === 1 ? Math.max(L, trackBedLift) : (j === 2 || j === 8 ? Math.min(L, trackBedLift + TRACK_BED_LIP_RISE) : L);
  return [Lj * c[0], Lj * c[1], Lj * c[2]];
}
/**
 * W84 (TRACK_BED): the fragment source of the tint. Replaces the output (after the lighting chunks) with 0.5 x F, drops tone mapping and the
 * colour space (0.5 must stay 0.5 for `2 x src x dst` to be no change) and mixes fog towards 0.5. Returns the source unchanged when a chunk
 * it replaces is not found.
 */
export function trackBedFragmentSource(src) {
  const need = ['#include <opaque_fragment>', '#include <tonemapping_fragment>', '#include <colorspace_fragment>', '#include <fog_fragment>', '#include <fog_pars_fragment>'];
  if (need.some((n) => !src.includes(n))) return src;
  const lo = TRACK_BED_FLOOR.toFixed(3);
  const hi = TRACK_BED_CEIL.toFixed(3);
  return src
    .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nuniform float uTrackBedRut;')
    .replace('#include <opaque_fragment>', `vec3 trackBedF = clamp( diffuseColor.rgb * ${TRACK_FORM_MAP_GAIN.toFixed(2)}, vec3( ${lo} ), vec3( ${hi} ) );
	trackBedF = vec3( 1.0 ) + max( trackBedF - 1.0, 0.0 ) - max( 1.0 - trackBedF, 0.0 ) * uTrackBedRut;
	trackBedF = mix( vec3( 1.0 ), trackBedF, clamp( diffuseColor.a, 0.0, 1.0 ) );
	gl_FragColor = vec4( clamp( trackBedF, 0.0, 2.0 ) * 0.5, 1.0 );`)
    .replace('#include <tonemapping_fragment>', '')
    .replace('#include <colorspace_fragment>', '')
    .replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment.replace('fogColor', 'vec3( 0.5 )'));
}
/**
 * taste W80 (TRACK_ROUTE, phase G3a of the hinterland plan): the hinterland farm tracks are routed onto shared corridors and drawn once. 1 lays
 * each shed's way to the board with `routeFarmTracks` (below: a grid search that pays for the ribbon's cross-slope and grade and for the
 * creek's waterness, and keeps clear of an earlier corridor unless the ground squeezes the two together), hands the corridors on as segments
 * to every reader of `_trackLines`, drops the albedo stamp, and draws each corridor as one ribbon (a later ribbon fades out within 4.4 m of an
 * earlier corridor's centreline, so a spur's ruts end in its trunk's verge and no two ribbons stack their alpha or their ruts). 0 (the default)
 * is today's straight lines, stamp and ribbon, exactly: the same segments, the same shader text. Unlike `crownSwitch`, which defaults on, this
 * one is off unless asked. Browser: `?trackRoute=1`; node: `DD_TRACK_ROUTE=1`; tests may call `setTrackRoute`.
 */
export const TRACK_ROUTE = (typeof process !== 'undefined' && process?.env?.DD_TRACK_ROUTE !== undefined)
  ? (Number(process.env.DD_TRACK_ROUTE) > 0 ? 1 : 0)
  : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('trackRoute') === '1') ? 1 : 0);
let trackRouteOn = TRACK_ROUTE;
export function setTrackRoute(v) { trackRouteOn = v ? 1 : 0; }
export function trackRouteActive() { return trackRouteOn; }

/**
 * taste W82 (TRACK_GATES, phase G3b part 1): every run is split where a farm track crosses it, and the gap is fitted to the track. The band
 * is `TRACK_GATE_BAND` (3.8 m) either side of a track's centreline, the 3.2 m track and 0.6 m for a post. 1 cuts a post-and-rail panel or a
 * parcel panel back to end on the band's edge on its own line (a panel lying in the band is dropped, a free end that faced another across the
 * track is run out to the band's edge), opens a hedge, the brow and a windbreak row across the band (each hedge end 3.8 m from the centreline
 * measured square to the track, so the gap is 7.6 m across and 7.6 / sin(angle) along the run), drops any hedge, fence or windbreak piece
 * under 4 m within 8 m of a track, and keeps the gateways for part 2 on `FringeLayer._trackGates`. It reads whatever `_trackLines` holds (today's
 * lines, or the routed segments with TRACK_ROUTE). 0 (the default) is `taste/r1-coherence`, exactly. Browser: `?trackGates=1`; node: `DD_TRACK_GATES=1`.
 */
export const TRACK_GATES = (typeof process !== 'undefined' && process?.env?.DD_TRACK_GATES !== undefined)
  ? (Number(process.env.DD_TRACK_GATES) > 0 ? 1 : 0)
  : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('trackGates') === '1') ? 1 : 0);
let trackGatesOn = TRACK_GATES;
export function setTrackGates(v) { trackGatesOn = v ? 1 : 0; }
export function trackGatesActive() { return trackGatesOn; }
/**
 * W82 fix 2 (TRACK_GATES): the gateways' timber. `run` (the default) takes each gateway's timber from the run it stands in (the rail fence's, `#3a342c`, for a
 * rail fence; the parcel fence posts' for a parcel fence, a hedge and the brow); `rail` is fix 1's lattice rail fence timber for all; `silver` a weathered silver-grey
 * `#8e897f` in the rail fence's material; `galv` a galvanised steel grey `#a3a7a6` with a little metalness. Read only with TRACK_GATES on.
 * Browser: `?trackGateTone=rail|silver|galv|run`; node: `DD_TRACK_GATE_TONE`.
 */
export const TRACK_GATE_TONES = Object.freeze(['run', 'rail', 'silver', 'galv']);
const readGateTone = () => {
  const raw = (typeof process !== 'undefined' && process?.env?.DD_TRACK_GATE_TONE !== undefined)
    ? process.env.DD_TRACK_GATE_TONE
    : ((typeof location !== 'undefined' && location?.search) ? new URLSearchParams(location.search).get('trackGateTone') : null);
  return TRACK_GATE_TONES.includes(raw) ? raw : 'run';
};
let trackGateToneVal = readGateTone();
export function setTrackGateTone(v) { trackGateToneVal = TRACK_GATE_TONES.includes(v) ? v : 'run'; }
export function trackGateToneActive() { return trackGatesOn ? trackGateToneVal : null; }
export const TRACK_GATE_BAND = 3.8;
export const TRACK_GATE_STUB_M = 4; // a piece shorter than this, within TRACK_GATE_NEAR_M of a track, is not drawn
export const TRACK_GATE_NEAR_M = 8;

/** W82 (TRACK_GATES): a grid over track segments `[x0, z0, x1, z1]`. `dist(x, z, limit)` is the distance to the nearest segment (Infinity past `limit`). */
export function makeTrackBandIndex(segs, cell = 16) {
  const grid = new Map();
  segs.forEach((sg, i) => {
    const x0 = Math.floor(Math.min(sg[0], sg[2]) / cell); const x1 = Math.floor(Math.max(sg[0], sg[2]) / cell);
    const z0 = Math.floor(Math.min(sg[1], sg[3]) / cell); const z1 = Math.floor(Math.max(sg[1], sg[3]) / cell);
    for (let gx = x0; gx <= x1; gx += 1) for (let gz = z0; gz <= z1; gz += 1) { const k = `${gx}:${gz}`; const l = grid.get(k); if (l) l.push(i); else grid.set(k, [i]); }
  });
  const segD = (x, z, sg) => {
    const dx = sg[2] - sg[0]; const dz = sg[3] - sg[1];
    const u = Math.max(0, Math.min(1, ((x - sg[0]) * dx + (z - sg[1]) * dz) / (dx * dx + dz * dz || 1e-9)));
    return Math.hypot(x - sg[0] - dx * u, z - sg[1] - dz * u);
  };
  const near = (x, z, limit) => {
    const k = Math.ceil(limit / cell); const cx = Math.floor(x / cell); const cz = Math.floor(z / cell);
    const seen = new Set(); let best = Infinity; let bi = -1;
    for (let a = -k; a <= k; a += 1) for (let b = -k; b <= k; b += 1) for (const i of grid.get(`${cx + a}:${cz + b}`) ?? []) {
      if (seen.has(i)) continue; seen.add(i);
      const d = segD(x, z, segs[i]);
      if (d < best) { best = d; bi = i; }
    }
    return { d: best <= limit ? best : Infinity, i: bi };
  };
  return { segs, near, dist: (x, z, limit = 24) => near(x, z, limit).d, segD };
}

const gateInt = (a, b, c, d) => { // the crossing of segments ab and cd, or null: { x, z }
  const rx = b[0] - a[0]; const rz = b[1] - a[1]; const sx = d[0] - c[0]; const sz = d[1] - c[1];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den; const u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a[0] + rx * t, z: a[1] + rz * t };
};

/** W82 (TRACK_GATES): the stretches `[s0, s1]` (metres from a) of the segment a to b that lie outside the band, edges bisected to a millimetre. */
export function bandOutside(index, a, b, band = TRACK_GATE_BAND, step = 0.2) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 1e-9) return [];
  const ux = (b[0] - a[0]) / L; const uz = (b[1] - a[1]) / L;
  const inBand = (s) => index.dist(a[0] + ux * s, a[1] + uz * s, band + 0.01) < band;
  const edge = (s0, s1) => { const was = inBand(s0); let lo = s0; let hi = s1; for (let k = 0; k < 14; k += 1) { const m = (lo + hi) * 0.5; if (inBand(m) === was) lo = m; else hi = m; } return (lo + hi) * 0.5; };
  const out = []; let from = inBand(0) ? null : 0; let prev = 0;
  for (let s = 0; s < L;) {
    const sn = Math.min(L, s + step);
    const nb = inBand(sn);
    if (nb !== (from === null)) { const e = edge(s, sn); if (nb) { out.push([from, e]); from = null; } else from = e; }
    prev = sn; s = sn;
  }
  if (from !== null) out.push([from, L]);
  return out.filter((q) => q[1] - q[0] > 0.02);
}

/**
 * W82 (TRACK_GATES): the stretches of a polyline's arc length that lie inside the band, as `[0, s0, s1]` cuts (the contact ribbon's form).
 * `stations` are `{ x, z }`; `chain` is the chain's index in the cuts.
 */
export function bandCuts(index, stations, chain, band = TRACK_GATE_BAND) {
  const cuts = []; let acc = 0;
  for (let i = 0; i < stations.length - 1; i += 1) {
    const a = [stations[i].x, stations[i].z]; const b = [stations[i + 1].x, stations[i + 1].z];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let at = 0;
    for (const [o0, o1] of bandOutside(index, a, b, band)) { if (o0 - at > 0.02) cuts.push([chain, acc + at, acc + o0]); at = o1; }
    if (L - at > 0.02) cuts.push([chain, acc + at, acc + L]);
    acc += L;
  }
  const merged = [];
  for (const c of cuts) { const l = merged[merged.length - 1]; if (l && c[1] - l[2] < 0.05) l[2] = c[2]; else merged.push(c); }
  return merged;
}

export const TRACK_GATE_EDGE = [3.6, 4.2]; // an end of a split stands this far from the centreline
export const TRACK_GATE_CENTRE_M = 0.5; // and the gap's centre within this of it
export const TRACK_GATE_MERGE_M = 4; // two crossings of one track this close share one gateway
export const TRACK_GATE_EXTEND_M = 10; // a run's end is run out into the gap by at most this (a hard cap: a longer run-out is refused)
export const TRACK_GATE_PAIR_M = 7.6; // two tracks whose centrelines are this close or closer share one gateway over both bands
export const TRACK_GATE_SPLIT_M = 11.6; // two tracks this far apart or further: the run between the bands is restored and each track has its own gateway
export const TRACK_GATE_PAIR_GAP_M = 15.2; // the widest gap one gateway spans (two bands abutting, 7.6 + 7.6)

/**
 * W82 fix 2 (TRACK_GATES): the crossings of the segment a to b with the tracks, joined where within 1.5 m of each other (a polyline's joint, or the
 * routed pieces of one track). Each is `{ x, z, sg }` with `sg` a track segment through it; `apart` is, for two, the distance between their centrelines
 * (each crossing to the other's track, averaged: the square distance, not the distance along the run).
 */
export function crossClusters(index, a, b) {
  const out = [];
  for (const sg of index.segs) {
    if (Math.max(sg[0], sg[2]) + 1 < Math.min(a[0], b[0]) || Math.min(sg[0], sg[2]) - 1 > Math.max(a[0], b[0]) || Math.max(sg[1], sg[3]) + 1 < Math.min(a[1], b[1]) || Math.min(sg[1], sg[3]) - 1 > Math.max(a[1], b[1])) continue;
    const q = gateInt(a, b, [sg[0], sg[1]], [sg[2], sg[3]]);
    if (!q) continue;
    const c = out.find((o) => Math.hypot(o.x - q.x, o.z - q.z) <= 1.5);
    if (!c) out.push({ ...q, sg });
  }
  const apart = out.length === 2 ? +((index.segD(out[1].x, out[1].z, out[0].sg) + index.segD(out[0].x, out[0].z, out[1].sg)) / 2).toFixed(3) : 0; // to a millimetre, so 11.6 m is 11.6
  return { list: out, apart, along: out.length === 2 ? Math.hypot(out[1].x - out[0].x, out[1].z - out[0].z) : 0 };
}

/** W82 fix 2 (TRACK_GATES): the reason a pair of tracks `apart` m (centrelines) is not one gateway over both bands, or null. */
export function pairReason(apart, along) {
  // W83: two decimals, and a third where the two would round to the very figure the sentence compares it with (7.604 m apart is not "7.6 m apart ... over 7.6 m")
  const f = (v) => v.toFixed(1);
  const fa = (v) => (+v.toFixed(2) !== v && [TRACK_GATE_PAIR_M, TRACK_GATE_SPLIT_M].includes(+v.toFixed(2)) ? v.toFixed(3) : v.toFixed(2));
  if (apart <= TRACK_GATE_PAIR_M) return null;
  if (apart < TRACK_GATE_SPLIT_M) return `two tracks ${fa(apart)} m apart (${f(along)} m along the run) cross the gap: over ${TRACK_GATE_PAIR_M} m and under ${TRACK_GATE_SPLIT_M} m apart is refused`;
  return `two tracks ${fa(apart)} m apart (${f(along)} m along the run) cross the gap, ${TRACK_GATE_SPLIT_M} m or more: the run between the bands is not here to give each its own gateway`;
}

/**
 * W82 fix (TRACK_GATES): a split (`{ a, b }`, the two ends of a run's gap at a track, a piece on each side) against the tracks. Returns `{ gate }`
 * (`{ kind, a, b, run, track, at, seg }`: the ends, the run's and the track's unit directions, the crossing) or `{ reject }` with the reason it
 * is not fitted: no track crosses the gap, an end is not 3.6 to 4.2 m from the centreline, or the centre is over 0.5 m off.
 * W82 fix 2: two tracks through the gap with centrelines 7.6 m apart or less are one gateway over both bands (`pair` set: `at` is the midpoint of the two crossings,
 * the gap at most 15.2 m, its centre within 0.5 m of that midpoint); over 7.6 and under 11.6 m apart, and 11.6 m or more where the run between is not there, are refused with that reason.
 */
export function gateFromSplit(index, kind, a, b) {
  const cc = crossClusters(index, a, b);
  const hits = cc.list;
  if (!hits.length) return { reject: 'no track crosses the gap' };
  if (hits.length > 2) return { reject: `${hits.length} tracks cross the gap` };
  const pair = hits.length === 2;
  const dcase = (apart) => (apart <= TRACK_GATE_PAIR_M ? 'pair' : apart < TRACK_GATE_SPLIT_M ? 'between' : 'restore');
  if (pair) { const why = pairReason(cc.apart, cc.along); if (why) return { reject: why, dcase: dcase(cc.apart) }; }
  const dA = index.near(a[0], a[1], 40).d; const dB = index.near(b[0], b[1], 40).d;
  const gm = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : 'over 40');
  if (!(dA >= TRACK_GATE_EDGE[0] && dA <= TRACK_GATE_EDGE[1] && dB >= TRACK_GATE_EDGE[0] && dB <= TRACK_GATE_EDGE[1])) return { reject: `an end is ${f2(dA >= TRACK_GATE_EDGE[0] && dA <= TRACK_GATE_EDGE[1] ? dB : dA)} m from the centreline, not 3.6 to 4.2`, ...(pair ? { dcase: 'pair' } : {}) };
  let at; let mid;
  if (pair) {
    at = [(hits[0].x + hits[1].x) / 2, (hits[0].z + hits[1].z) / 2];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > TRACK_GATE_PAIR_GAP_M) return { reject: `the gap over both bands is ${L.toFixed(1)} m, over the ${TRACK_GATE_PAIR_GAP_M} m one gateway spans (the run crosses at a shallow angle)`, dcase: 'pair' };
    mid = Math.hypot(gm[0] - at[0], gm[1] - at[1]);
  } else {
    at = [hits[0].x, hits[0].z];
    mid = index.near(gm[0], gm[1], 40).d;
  }
  if (mid > TRACK_GATE_CENTRE_M) return { reject: `the gap's centre is ${f2(mid)} m off ${pair ? 'the pair of tracks' : 'the centreline'}`, ...(pair ? { dcase: 'pair' } : {}) };
  const sg = hits[0].sg;
  const dx = b[0] - a[0]; const dz = b[1] - a[1]; const dl = Math.hypot(dx, dz) || 1; const tl = Math.hypot(sg[2] - sg[0], sg[3] - sg[1]) || 1;
  return { gate: { kind, a: [+a[0].toFixed(2), +a[1].toFixed(2)], b: [+b[0].toFixed(2), +b[1].toFixed(2)], run: [+(dx / dl).toFixed(4), +(dz / dl).toFixed(4)], track: [+((sg[2] - sg[0]) / tl).toFixed(4), +((sg[3] - sg[1]) / tl).toFixed(4)], at: [+at[0].toFixed(2), +at[1].toFixed(2)], seg: sg, ...(pair ? { pair: { apart: +cc.apart.toFixed(2), along: +cc.along.toFixed(2) } } : {}) } };
}

/**
 * W82 fix (TRACK_GATES): the plan splits a hedge or the brow at a track, so a run with a piece on each side can be two chains, each stopping in the
 * band. `halves` are `{ tip: [x, z], t: [x, z] }` (a stopped chain's end on the band's edge, and its unit direction toward the track); two that face
 * each other across a track (each within 40 degrees of the connector, 0.2 to 40 m apart, the connector crossing a track) are one split. Returns
 * `{ splits: [{ a, b }], left }`, `left` the halves with nothing across (runs that end at the track).
 */
export function pairHalfRuns(index, halves) {
  const cand = [];
  for (let m = 0; m < halves.length; m += 1) for (let n = m + 1; n < halves.length; n += 1) {
    const A = halves[m]; const B = halves[n];
    const d = Math.hypot(A.tip[0] - B.tip[0], A.tip[1] - B.tip[1]);
    if (d > 40 || d < 0.2) continue;
    const cx = (B.tip[0] - A.tip[0]) / d; const cz = (B.tip[1] - A.tip[1]) / d;
    if (A.t[0] * cx + A.t[1] * cz < 0.766 || -(B.t[0] * cx + B.t[1] * cz) < 0.766) continue;
    if (!index.segs.some((sg) => gateInt(A.tip, B.tip, [sg[0], sg[1]], [sg[2], sg[3]]))) continue;
    cand.push({ A, B, d });
  }
  cand.sort((u, v) => u.d - v.d);
  const splits = []; const used = new Set();
  for (const { A, B } of cand) {
    if (used.has(A) || used.has(B)) continue;
    used.add(A); used.add(B);
    splits.push({ a: A.tip, b: B.tip });
  }
  return { splits, left: halves.length - used.size };
}

/**
 * W82 fix (TRACK_GATES): turns a kind's splits into gateways on `list`. One gateway to a crossing: a split whose crossing lies within
 * TRACK_GATE_MERGE_M of one already on the list (same track direction) is served by it (the hedges and the brow are listed first, so a fence
 * beside a hedge is served at the hedge). Returns `{ added, merged: [{ g, into }], rejected: [{ kind, at, reason }] }`.
 */
export function resolveGateways(index, list, kind, splits) {
  const out = { added: [], merged: [], rejected: [] };
  for (const sp of splits) {
    const r = gateFromSplit(index, kind, sp.a, sp.b);
    if (r.reject) { out.rejected.push({ kind, at: [+((sp.a[0] + sp.b[0]) / 2).toFixed(1), +((sp.a[1] + sp.b[1]) / 2).toFixed(1)], reason: r.reject, ...(r.dcase ? { dcase: r.dcase } : {}) }); continue; }
    const g = r.gate;
    if (sp.restored) g.restored = true;
    const into = list.find((h) => Math.hypot(h.at[0] - g.at[0], h.at[1] - g.at[1]) <= TRACK_GATE_MERGE_M && Math.abs(h.track[0] * g.track[0] + h.track[1] * g.track[1]) >= 0.9);
    if (into) { out.merged.push({ g: { ...g, trimmedM: sp.trimmedM ?? 0 }, into, sp }); (into.merged ??= []).push({ kind, a: g.a, b: g.b, run: g.run }); continue; } // W82 fix 2: the gateway keeps the runs it serves (the kit lays a leaf back along a fence among them)
    g.trimmedM = +(sp.trimmedM ?? 0).toFixed(2); g.extendedM = +(sp.extendedM ?? 0).toFixed(2);
    list.push(g); out.added.push(g);
  }
  return out;
}

/**
 * W82 fix (TRACK_GATES): fits straight panels (`{ a: [x, z], b: [x, z], ... }`) to the tracks. In order: (1) each panel is cut to the stretches
 * outside the band (one lying wholly in it is dropped); (2) a cluster of panels (ends within `tol`) under TRACK_GATE_STUB_M long with an end
 * within TRACK_GATE_NEAR_M of a track is dropped; (3) free ends that face each other across a track (both within 14 m of it, 0.2 to 40 m apart, each
 * within 40 degrees of the connector, the connector crossing a track) are a true split (a run with a piece on each side). Each end is fitted to the
 * band's edge: one already 3.6 to 4.2 m from the centreline stays, one short of it is run out along its own line by at most TRACK_GATE_EXTEND_M, provided
 * `clear(p, q)` allows the stretch and no panel of the list stands within 0.5 m of it. A split that cannot be fitted is left as it is and
 * reported in `stats.refused` with the reason; a free end that stops at a track with nothing across it counts in `stats.ends`.
 * Returns `{ panels, splits, stats }`; a split is `{ a, b, trimmedM, extendedM }`.
 */
export function fitPanelsToTracks(panels, index, { kind, tol = 1.2, band = TRACK_GATE_BAND, clear = null } = {}) {
  const stats = { in: panels.length, dropped: 0, cut: 0, kept: 0, stubs: 0, extended: 0, extendedM: 0, trimmedM: 0, ends: 0, splits: 0, restored: 0, restoredM: 0, maxRunOutM: 0, refused: [], dropAt: [], runOuts: [], shortened: [] };
  const lenOf = (p) => Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
  const ptSegDist = (x, z, o) => index.segD(x, z, [o.a[0], o.a[1], o.b[0], o.b[1]]);
  let list = [];
  for (const p of panels) {
    const L = lenOf(p);
    const parts = L < 1e-9 ? [] : bandOutside(index, p.a, p.b, band);
    if (parts.length === 1 && parts[0][0] < 1e-3 && parts[0][1] > L - 1e-3) { list.push(p); stats.kept += 1; continue; }
    if (!parts.length) { stats.dropped += 1; stats.dropAt.push([+((p.a[0] + p.b[0]) / 2).toFixed(1), +((p.a[1] + p.b[1]) / 2).toFixed(1)]); continue; }
    stats.cut += 1;
    const ux = (p.b[0] - p.a[0]) / L; const uz = (p.b[1] - p.a[1]) / L;
    parts.forEach(([s0, s1], k) => list.push({ ...p, a: [p.a[0] + ux * s0, p.a[1] + uz * s0], b: [p.a[0] + ux * s1, p.a[1] + uz * s1], cutFrom: p, trim: { a: s0 - (k ? parts[k - 1][1] : 0), b: (k < parts.length - 1 ? parts[k + 1][0] : L) - s1 } }));
  }
  // (2) clusters by end adjacency
  const ends = (p) => [p.a, p.b];
  const cellOf = (x, z) => `${Math.floor(x / 4)}:${Math.floor(z / 4)}`;
  const clusterOf = (arr) => {
    const par = arr.map((_, i) => i); const f = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const cell = new Map();
    arr.forEach((p, i) => { for (const q of ends(p)) { const k = cellOf(q[0], q[1]); const l = cell.get(k); if (l) l.push([i, q]); else cell.set(k, [[i, q]]); } });
    arr.forEach((p, i) => { for (const q of ends(p)) { const cx = Math.floor(q[0] / 4); const cz = Math.floor(q[1] / 4); for (let u = -1; u <= 1; u += 1) for (let v = -1; v <= 1; v += 1) for (const [j, r] of cell.get(`${cx + u}:${cz + v}`) ?? []) { if (j !== i && Math.hypot(q[0] - r[0], q[1] - r[1]) <= tol) par[f(j)] = f(i); } } });
    const groups = new Map(); arr.forEach((_, i) => { const r = f(i); const l = groups.get(r); if (l) l.push(i); else groups.set(r, [i]); });
    return [...groups.values()];
  };
  const keep = new Array(list.length).fill(true);
  for (const g of clusterOf(list)) {
    const len = g.reduce((t, i) => t + lenOf(list[i]), 0);
    if (len < TRACK_GATE_STUB_M && g.some((i) => ends(list[i]).some((q) => index.dist(q[0], q[1], TRACK_GATE_NEAR_M) <= TRACK_GATE_NEAR_M))) { for (const i of g) { keep[i] = false; stats.dropAt.push([+((list[i].a[0] + list[i].b[0]) / 2).toFixed(1), +((list[i].a[1] + list[i].b[1]) / 2).toFixed(1)]); } stats.stubs += g.length; }
  }
  list = list.filter((_, i) => keep[i]);
  // (3) free ends across a track
  const fe = []; // { i, p, t, which }
  const bucket = new Map();
  list.forEach((p, i) => { for (const q of ends(p)) { const k = cellOf(q[0], q[1]); const l = bucket.get(k); if (l) l.push([i, q]); else bucket.set(k, [[i, q]]); } });
  list.forEach((p, i) => {
    const L = lenOf(p) || 1;
    [[p.a, p.b, 'a'], [p.b, p.a, 'b']].forEach(([q, o, which]) => {
      const cx = Math.floor(q[0] / 4); const cz = Math.floor(q[1] / 4); let joined = false;
      for (let u = -1; u <= 1 && !joined; u += 1) for (let v = -1; v <= 1 && !joined; v += 1) for (const [j, r] of bucket.get(`${cx + u}:${cz + v}`) ?? []) { if (j !== i && Math.hypot(q[0] - r[0], q[1] - r[1]) <= tol) { joined = true; break; } }
      if (!joined && index.dist(q[0], q[1], 14) <= 14) fe.push({ i, p: q, t: [(q[0] - o[0]) / L, (q[1] - o[1]) / L], which, used: false });
    });
  });
  const cand = [];
  for (let m = 0; m < fe.length; m += 1) for (let n = m + 1; n < fe.length; n += 1) {
    const A = fe[m]; const B = fe[n];
    if (A.i === B.i) continue;
    const d = Math.hypot(A.p[0] - B.p[0], A.p[1] - B.p[1]);
    if (d > 40 || d < 0.2) continue;
    const cx = (B.p[0] - A.p[0]) / d; const cz = (B.p[1] - A.p[1]) / d;
    if (A.t[0] * cx + A.t[1] * cz < 0.766 || -(B.t[0] * cx + B.t[1] * cz) < 0.766) continue;
    cand.push({ A, B, d });
  }
  cand.sort((u, v) => u.d - v.d);
  const splits = [];
  const edgeAlong = (E) => { // the point on E's own line where it first comes within the band
    const step = 0.1;
    for (let s = step; s <= TRACK_GATE_EXTEND_M + 1e-9; s += step) { // W82 fix 2: the run-out cap is hard (it scanned to 11 m, and a 10.2 m run-out was built)
      const x = E.p[0] + E.t[0] * s; const z = E.p[1] + E.t[1] * s;
      if (index.dist(x, z, band + 0.01) < band) { let lo = s - step; let hi = s; for (let k = 0; k < 14; k += 1) { const mid = (lo + hi) * 0.5; if (index.dist(E.p[0] + E.t[0] * mid, E.p[1] + E.t[1] * mid, band + 0.01) < band) hi = mid; else lo = mid; } return hi <= TRACK_GATE_EXTEND_M ? hi : null; }
    }
    return null;
  };
  const added = [];
  for (const { A, B } of cand) {
    if (A.used || B.used) continue;
    const cc = crossClusters(index, A.p, B.p);
    if (!cc.list.length) continue;
    const mid = [(A.p[0] + B.p[0]) * 0.5, (A.p[1] + B.p[1]) * 0.5];
    const cross = cc.list.reduce((m, q) => (!m || Math.hypot(q.x - mid[0], q.z - mid[1]) < Math.hypot(m.x - mid[0], m.z - mid[1]) ? q : m), null);
    A.used = true; B.used = true; stats.splits += 1;
    const plan = []; let why = null; let extM = 0; let cause = null; // W83: `cause` 'trunk' when `clear` named a trunk
    const pair = cc.list.length === 2;
    if (cc.list.length > 2) why = `${cc.list.length} tracks cross the gap`;
    else if (pair && cc.apart > TRACK_GATE_PAIR_M && cc.apart < TRACK_GATE_SPLIT_M) why = pairReason(cc.apart, cc.along);
    for (const E of why ? [] : [A, B]) {
      const d = index.near(E.p[0], E.p[1], 40).d;
      if (d >= TRACK_GATE_EDGE[0] && d <= TRACK_GATE_EDGE[1]) { plan.push({ E, q: E.p }); continue; }
      if (d < TRACK_GATE_EDGE[0]) { why = `an end stands ${d.toFixed(2)} m from the centreline, inside the band`; break; }
      const s = edgeAlong(E);
      if (s === null) { why = `an end ${d.toFixed(1)} m from the centreline: its own line does not reach the band within ${TRACK_GATE_EXTEND_M} m`; break; }
      const q = [E.p[0] + E.t[0] * s, E.p[1] + E.t[1] * s];
      const nStep = Math.max(1, Math.ceil(s));
      const hit = list.some((o, oi) => oi !== E.i && Array.from({ length: nStep + 1 }, (_, k) => k / nStep).some((f) => ptSegDist(E.p[0] + (q[0] - E.p[0]) * f, E.p[1] + (q[1] - E.p[1]) * f, o) < 0.5));
      if (hit) { why = `the ${s.toFixed(1)} m run-out is within 0.5 m of another run`; break; }
      if (clear && !clear(E.p, q)) {
        // W83 (part 3): a run-out that meets a trunk partway along: the shorter one that stops `clear.stop` along (the last point keeping the trunk's clearance) is built if its end still stands in the band
        const s2 = clear.why === 'trunk' ? clear.stop : null;
        if (s2 > 0) {
          const q2 = [E.p[0] + E.t[0] * s2, E.p[1] + E.t[1] * s2]; const d2 = index.near(q2[0], q2[1], 40).d;
          if (d2 >= TRACK_GATE_EDGE[0] && d2 <= TRACK_GATE_EDGE[1]) { plan.push({ E, q: q2, s: s2 }); stats.shortened.push({ kind, from: +s.toFixed(2), s: +s2.toFixed(2), at: [+q2[0].toFixed(1), +q2[1].toFixed(1)] }); continue; }
        }
        cause = clear.why ?? null; why = cause === 'trunk' ? `the ${s.toFixed(1)} m run-out comes too close to a trunk` : `the ${s.toFixed(1)} m run-out crosses water, the venue keep-out, a trunk, a bale, a shed or a hedge, the brow or a windbreak`; break;
      }
      plan.push({ E, q, s });
    }
    // W82 fix 2: two tracks 11.6 m or more apart: the run between the bands is restored (its ends on the inner band edges), and each track gets its own gateway
    let between = null;
    if (!why && pair && cc.apart >= TRACK_GATE_SPLIT_M) {
      const qa = plan[0].q; const qb = plan[1].q; const Lab = Math.hypot(qb[0] - qa[0], qb[1] - qa[1]);
      const parts = bandOutside(index, qa, qb, band);
      const inner = parts.filter((r) => r[0] > 0.6 && r[1] < Lab - 0.6).sort((u, v) => (v[1] - v[0]) - (u[1] - u[0]))[0];
      if (!inner) why = `two tracks ${cc.apart.toFixed(2)} m apart: no run between their bands along the line`;
      else if (inner[1] - inner[0] < TRACK_GATE_STUB_M - 0.005) why = `the run between the two bands is ${(inner[1] - inner[0]).toFixed(1)} m, under ${TRACK_GATE_STUB_M} m`;
      else {
        const u = [(qb[0] - qa[0]) / Lab, (qb[1] - qa[1]) / Lab];
        const p0 = [qa[0] + u[0] * inner[0], qa[1] + u[1] * inner[0]]; const p1 = [qa[0] + u[0] * inner[1], qa[1] + u[1] * inner[1]];
        const nS = Math.max(1, Math.ceil(inner[1] - inner[0]));
        const hit = list.some((o, oi) => oi !== plan[0].E.i && oi !== plan[1].E.i && Array.from({ length: nS + 1 }, (_, k) => k / nS).some((f) => ptSegDist(p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f, o) < 0.5));
        if (hit) why = 'the run between the two bands is within 0.5 m of another run';
        else if (clear && !clear(p0, p1)) { cause = clear.why ?? null; why = cause === 'trunk' ? 'the run between the two bands comes too close to a trunk' : 'the run between the two bands crosses water, the venue keep-out, a trunk, a bale, a shed or a hedge, the brow or a windbreak'; }
        else between = { p0, p1, len: inner[1] - inner[0] };
      }
    }
    if (why) { stats.refused.push({ kind, at: [+cross.x.toFixed(1), +cross.z.toFixed(1)], reason: why, ...(cause ? { cause } : {}), ...(pair ? { dcase: cc.apart <= TRACK_GATE_PAIR_M ? 'pair' : cc.apart < TRACK_GATE_SPLIT_M ? 'between' : 'restore' } : {}) }); continue; }
    let trimmed = 0; const seen = new Set();
    for (const { E, q, s } of plan) {
      if (s) { added.push({ ...list[E.i], a: E.p, b: q, extendOf: list[E.i] }); stats.extended += 1; extM += s; stats.maxRunOutM = Math.max(stats.maxRunOutM, s); stats.runOuts.push({ a: E.p, b: q, s }); }
      const src = list[E.i];
      if (src.trim && !(src.cutFrom && seen.has(src.cutFrom))) { trimmed += src.trim[E.which]; if (src.cutFrom) seen.add(src.cutFrom); }
    }
    stats.extendedM += extM; stats.trimmedM += trimmed;
    if (between) {
      added.push({ ...list[plan[0].E.i], a: between.p0, b: between.p1, own: true, restored: true }); stats.restored += 1; stats.restoredM += between.len; stats.runOuts.push({ a: between.p0, b: between.p1, s: between.len, restored: true });
      splits.push({ a: plan[0].q, b: between.p0, extendedM: extM, trimmedM: trimmed, srcA: list[plan[0].E.i], srcB: list[plan[0].E.i], restored: true });
      splits.push({ a: between.p1, b: plan[1].q, extendedM: 0, trimmedM: 0, srcA: list[plan[1].E.i], srcB: list[plan[1].E.i], restored: true });
      continue;
    }
    splits.push({ a: plan[0].q, b: plan[1].q, extendedM: extM, trimmedM: trimmed, srcA: list[plan[0].E.i], srcB: list[plan[1].E.i] });
  }
  stats.ends = fe.filter((E) => !E.used && index.near(E.p[0], E.p[1], 14).d <= TRACK_GATE_EDGE[1]).length;
  return { panels: list.concat(added), splits, stats };
}

/**
 * W43 (TRACK_SHADOW): three's PCF `getShadow` (the sampler2DShadow one) with its five-tap lookup replaced by `TRACK_SHADOW_TAPS` taps on
 * a disc of at least `TRACK_SHADOW_RADIUS` texels. Returns the source unchanged when the five-tap block is not found.
 */
export function softenTrackShadowSource(src) {
  const block = /shadow = \(\s*(?:texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( \d, 5, phi \) \* radius, shadowCoord\.z \) \)\s*\+?\s*){5}\) \* 0\.2;/;
  if (!block.test(src) || !src.includes('float radius = shadowRadius * texelSize.x;')) return src;
  return src
    .replace('float radius = shadowRadius * texelSize.x;', `float radius = max( shadowRadius, ${TRACK_SHADOW_RADIUS.toFixed(2)} ) * texelSize.x;`)
    .replace(block, `float trackAcc = 0.0;
				for ( int ti = 0; ti < ${TRACK_SHADOW_TAPS}; ti ++ ) {
					trackAcc += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( ti, ${TRACK_SHADOW_TAPS}, phi ) * radius, shadowCoord.z ) );
				}
				shadow = trackAcc / ${TRACK_SHADOW_TAPS}.0;`);
}

/**
 * taste W35: a polyline cut into runs where `blocked(x, z)` is true. A stretch is kept where the line and the two points `halfWidth` to
 * either side of it are clear (a formed vertex reaches that far across); the cut is found by bisection to 1 cm and falls on the clear
 * side, so no formed vertex lies in a blocked place. Original vertices inside a kept stretch stay (bends are kept). `yard` goes only to
 * a run that starts at the first point. `taps` (W37) are the places across the line that are tried, as fractions of `halfWidth`. Returns `[{ pts, yard? }]`, as `makeTrackKinMesh` takes. With nothing blocked: one run, all points.
 */
export function splitTrackRuns(points, blocked, { halfWidth = 1.4, yard = false, step = 0.25, taps = [0, -1, 1] } = {}) {
  const runs = [];
  let cur = null;
  const start = (p, first) => { cur = { pts: [p] }; if (yard && first) cur.yard = true; runs.push(cur); };
  const clearAt = (a, b, ux, uz, t) => {
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    for (const q of taps) if (blocked(x - uz * halfWidth * q, z + ux * halfWidth * q)) return false;
    return true;
  };
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1], b = points[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d < 1e-6) continue;
    const ux = (b[0] - a[0]) / d, uz = (b[1] - a[1]) / d;
    const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const m = Math.max(1, Math.ceil(d / step));
    let t0 = 0, f0 = clearAt(a, b, ux, uz, 0);
    if (f0 && !cur) start(a, runs.length === 0 && i === 1);
    for (let q = 1; q <= m; q += 1) {
      const t1 = q / m, f1 = clearAt(a, b, ux, uz, t1);
      if (f1 !== f0) {
        let lo = t0, hi = t1; // lo has state f0
        for (let k = 0; k < 14; k += 1) { const mid = (lo + hi) / 2; if (clearAt(a, b, ux, uz, mid) === f0) lo = mid; else hi = mid; }
        if (f0) { cur.pts.push(at(lo)); cur = null; } else start(at(hi), false);
      }
      t0 = t1; f0 = f1;
    }
    if (f0) cur.pts.push(b); else cur = null;
  }
  return runs.filter((r) => r.pts.length >= 2);
}

const TRACK_FORM_STEP = 2.5;
/** The noise tile covers this many metres a side; it multiplies the vertex colour (a mean of 0.83, which the vertex colours are laid 1.2 over). */
const TRACK_FORM_TILE_M = 6;
const TRACK_FORM_MAP_GAIN = 1.2;
/** How much of each column covers the paddock under it (crown, flank, inner lip, rut x3, outer lip); the verge sets its own. */
const TRACK_FORM_ALPHA = [0.64, 0.66, 0.74, 0.88, 0.92, 0.88, 0.74, 1, 1, 0];
/** Outward from the line: [offset m, rise m]. Crown, flank, inner lip, rut (three), outer lip, verge in, verge mid, verge edge (the last two are set per station). */
const TRACK_FORM_COLS = [[0, 0.082], [0.38, 0.076], [0.64, 0.058], [0.86, 0.032], [1.06, 0.022], [1.26, 0.032], [1.48, 0.058], [1.82, 0.046], [2.2, 0.034], [2.5, 0.018]];

/** A tileable grey noise (four octaves, 0.19 m to 1.5 m a feature at TILE_M 6) that breaks the vertex colours up along and across the track. */
function makeTrackNoiseTexture(seed) {
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  const octaves = [[4, 0.46], [8, 0.28], [16, 0.17], [32, 0.09]];
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      let acc = 0;
      for (let o = 0; o < octaves.length; o += 1) {
        const [cells, amp] = octaves[o];
        const fx = (x / N) * cells; const fy = (y / N) * cells;
        const x0 = Math.floor(fx); const y0 = Math.floor(fy);
        const tx = fx - x0; const ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx); const sy = ty * ty * (3 - 2 * ty);
        const h = (ix, iy) => wob(((ix % cells) + cells) % cells, ((iy % cells) + cells) % cells, seed + 41 + o * 7);
        acc += amp * lerp(lerp(h(x0, y0), h(x0 + 1, y0), sx), lerp(h(x0, y0 + 1), h(x0 + 1, y0 + 1), sx), sy);
      }
      const m = clamp01(0.62 + 0.42 * ((acc - 0.5) * 2.2 + 0.5));
      const k = (y * N + x) * 4;
      data[k] = data[k + 1] = data[k + 2] = Math.round(255 * m);
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** W32 (TRACK_RUT): the track's own texture is 24 m along by 6 m across (laid on the run, not the world), 4.7 cm a texel. */
const TRACK_RUT_TILE_U = 24;
const TRACK_RUT_TILE_V = 6;
/** Where the alpha test cuts: the verge's product of vertex alpha and the bay mask below it is not drawn. */
const TRACK_RUT_CUT = 0.36;
/** Outward from the line: [offset m, rise m]. Crown, flank, inner lip, inner wall, bed (three), outer wall, outer lip, verge in, verge edge. */
const TRACK_RUT_COLS = [[0, 0.082], [0.36, 0.076], [0.60, 0.064], [0.70, 0.034], [0.86, 0.016], [1.05, 0.008], [1.24, 0.016], [1.40, 0.034], [1.50, 0.064], [1.80, 0.046], [2.95, 0.020]];
/** How much of each column covers the paddock under it (crown to outer lip); the verge's two columns set their own. */
const TRACK_RUT_ALPHA = [0.64, 0.66, 0.80, 0.92, 0.95, 0.95, 0.95, 0.92, 0.80];
/** The widest lateral reach of the form, in its own metres. */
const TRACK_RUT_REACH = 2.95;

/**
 * W32 (TRACK_RUT): the colour noise of wave thirty-one, laid on the run, and in its alpha a mask for the verge's bays: a noise with
 * features about 2 m along the run and 0.9 m across, so the edge the alpha test cuts has bays a metre or two long. Inside 1.62 m of the
 * line the alpha is 1 (ruts and crown are not cut); from 1.80 m out the mask rules.
 */
function makeTrackRutTexture(seed) {
  const NU = 512;
  const NV = 128;
  const noise = (u, v, cx, cy, salt) => {
    const fx = u * cx; const fy = v * cy;
    const x0 = Math.floor(fx); const y0 = Math.floor(fy);
    const tx = fx - x0; const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx); const sy = ty * ty * (3 - 2 * ty);
    const h = (ix, iy) => wob(((ix % cx) + cx) % cx, ((iy % cy) + cy) % cy, seed + salt);
    return lerp(lerp(h(x0, y0), h(x0 + 1, y0), sx), lerp(h(x0, y0 + 1), h(x0 + 1, y0 + 1), sx), sy);
  };
  const colourOct = [[16, 4, 0.46], [32, 8, 0.28], [64, 16, 0.17], [128, 32, 0.09]];
  const bayOct = [[12, 6, 0.50], [24, 12, 0.30], [48, 24, 0.20]];
  const colour = new Float32Array(NU * NV);
  const bay = new Float32Array(NU * NV);
  let sum = 0;
  let sum2 = 0;
  for (let y = 0; y < NV; y += 1) {
    for (let x = 0; x < NU; x += 1) {
      const u = x / NU; const v = y / NV;
      let acc = 0;
      for (let o = 0; o < colourOct.length; o += 1) acc += colourOct[o][2] * noise(u, v, colourOct[o][0], colourOct[o][1], 41 + o * 7);
      let m = 0;
      for (let o = 0; o < bayOct.length; o += 1) m += bayOct[o][2] * noise(u, v, bayOct[o][0], bayOct[o][1], 71 + o * 5);
      const k = y * NU + x;
      colour[k] = clamp01(0.62 + 0.42 * ((acc - 0.5) * 2.2 + 0.5));
      bay[k] = m;
      sum += m;
      sum2 += m * m;
    }
  }
  const mean = sum / (NU * NV);
  const sd = Math.sqrt(Math.max(1e-9, sum2 / (NU * NV) - mean * mean));
  const data = new Uint8Array(NU * NV * 4);
  for (let y = 0; y < NV; y += 1) {
    const off = Math.abs(((y + 0.5) / NV) * TRACK_RUT_TILE_V - TRACK_RUT_TILE_V / 2);
    const w = smoothstep(1.62, 1.80, off);
    for (let x = 0; x < NU; x += 1) {
      const k = y * NU + x;
      const mask = clamp01(TRACK_RUT_MASK_MID + TRACK_RUT_MASK_GAIN * ((bay[k] - mean) / sd));
      const i4 = k * 4;
      data[i4] = data[i4 + 1] = data[i4 + 2] = Math.round(255 * colour[k]);
      data[i4 + 3] = Math.round(255 * lerp(1, mask, w));
    }
  }
  const tex = new THREE.DataTexture(data, NU, NV, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
const TRACK_RUT_MASK_MID = 0.66;
const TRACK_RUT_MASK_GAIN = 0.17;

/**
 * The ring paint material (moved here from fringe.js, which imports it back): the track no longer wears the ring albedo. The overlay
 * sheet under it paints its own colour from the ground tokens in the parcel shader, so a ribbon that sampled the baked map came out a
 * different, paler material (the grey shards on the east paddocks). It carries its colour in vertex colours and sits proud of the sheet
 * by a polygon offset as well as by its crown.
 */
export function makeRingPaintMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    // Taken from `fringe:hinterland-fields`, which took it from the crust. Two
    // surfaces that share an albedo and answer the environment differently read
    // as two materials, which is the fault T8 closed on the sheets themselves.
    envMapIntensity: 0.28,
    fog: true,
  });
  mat.userData.envIntensityBase = 0.28;
  return applyGroundShadowFloor(mat);
}

/** W33 (TRACK_KIN): the alpha ramp that replaces the alpha test: nothing under LO, the full alpha from HI. The old cut was a step at 0.36. */
const TRACK_KIN_EDGE_LO = 0.30;
const TRACK_KIN_EDGE_HI = 0.60;

/**
 * The formed track's material. `kin` (W33) swaps the verge's alpha test for a ramp in the fragment shader: the product of vertex alpha and
 * the bay mask, which the test cut at 0.36 and drew whole above it, now fades in between 0.30 and 0.60, so the edge of a bay is a soft edge
 * and not a stair of pixels. Off, the material is wave thirty-two's: the same alpha test and the same program key.
 */
export function makeTrackFormMaterial(seed = 0, kin = 0, bed = false) {
  bed = !!bed && trackBedActive() === 1; // W84 (TRACK_BED): only the hinterland ribbon passes it
  const mat = makeRingPaintMaterial();
  mat.map = trackRutOn ? makeTrackRutTexture(seed) : makeTrackNoiseTexture(seed);
  // W32 (TRACK_RUT): the verge's bays are cut by the alpha test (off, no test and no new shader text).
  if (trackRutOn && !kin) mat.alphaTest = TRACK_RUT_CUT;
  if (trackRutOn && kin) {
    const prior = mat.onBeforeCompile;
    const key = mat.customProgramCacheKey();
    mat.onBeforeCompile = (shader, renderer) => {
      if (typeof prior === 'function') prior.call(mat, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        `diffuseColor.a *= smoothstep( ${TRACK_KIN_EDGE_LO.toFixed(2)}, ${TRACK_KIN_EDGE_HI.toFixed(2)}, diffuseColor.a );
	if ( diffuseColor.a < 0.004 ) discard;`,
      );
    };
    mat.customProgramCacheKey = () => `${key}|track-kin-edge`;
    mat.needsUpdate = true;
  }
  if (trackShadowActive() && !bed) { // W84: the tint's output ignores the light, so the soft shadow has nothing to filter and is not compiled in
    const prior = mat.onBeforeCompile;
    const key = mat.customProgramCacheKey();
    mat.onBeforeCompile = (shader, renderer) => {
      if (typeof prior === 'function') prior.call(mat, shader, renderer);
      shader.fragmentShader = softenTrackShadowSource(shader.fragmentShader);
    };
    mat.customProgramCacheKey = () => `${key}|track-shadow-${TRACK_SHADOW_TAPS}-${TRACK_SHADOW_RADIUS.toFixed(2)}`;
    mat.needsUpdate = true;
  }
  if (bed) {
    // W84 (TRACK_BED): the ribbon is a factor on the frame under it: dst x src + src x dst, with the target's alpha kept.
    const prior = mat.onBeforeCompile;
    const key = mat.customProgramCacheKey();
    const uniforms = { uTrackBedRut: { value: trackBedRut } };
    mat.onBeforeCompile = (shader, renderer) => {
      if (typeof prior === 'function') prior.call(mat, shader, renderer);
      shader.uniforms.uTrackBedRut = uniforms.uTrackBedRut;
      shader.fragmentShader = trackBedFragmentSource(shader.fragmentShader);
    };
    mat.customProgramCacheKey = () => `${key}|track-bed-${TRACK_BED_FLOOR.toFixed(3)}-${TRACK_BED_CEIL.toFixed(3)}`;
    mat.blending = THREE.CustomBlending;
    mat.blendEquation = THREE.AddEquation;
    mat.blendSrc = THREE.DstColorFactor;
    mat.blendDst = THREE.SrcColorFactor;
    mat.blendEquationAlpha = THREE.AddEquation;
    mat.blendSrcAlpha = THREE.ZeroFactor;
    mat.blendDstAlpha = THREE.OneFactor;
    mat.toneMapped = false;
    mat.userData.trackBed = 1;
    mat.userData.trackBedUniforms = uniforms;
    mat.needsUpdate = true;
  }
  mat.addEventListener('dispose', () => mat.map?.dispose?.());
  mat.transparent = true;
  // No depth written: the screen-space occlusion pass reads the scene's depth and inked the verge's edge as a crease, which is the ruled line this switch removes.
  mat.depthWrite = false;
  return mat;
}

/**
 * The colour of one column of the W32 form: its colour and its value. `g` holds the station's grass, `dust` and `soil` the track's own
 * earth, and the rest the station's noises (tone, wet, dustK, bare). Shared by the hinterland ribbon and the scaled ones.
 */
function rutColumnLook(j, mix3, g) {
  const { grass, dust, soil, tone, wet, dustK, bare } = g;
  let col;
  let v;
  if (j === 0) { col = mix3(grass, dust.map((q) => q * 0.6), bare * 0.8); v = tone * 0.96; }
  else if (j === 1) { col = mix3(grass, dust.map((q) => q * 0.6), 0.12 + bare * 0.65); v = tone * 0.98; }
  else if (j === 2 || j === 8) { col = mix3(grass, dust.map((q) => q * 0.85), 0.50 + 0.2 * dustK); v = tone * 1.06; }
  else if (j === 3 || j === 7) { col = mix3(dust, soil, 0.35 + 0.3 * wet); v = tone * (0.72 - 0.14 * wet) * (0.92 + 0.16 * dustK); }
  else if (j === 4 || j === 6) { col = mix3(dust, soil, 0.55 + 0.3 * wet); v = tone * (0.58 - 0.12 * wet); }
  else if (j === 5) { col = mix3(dust, soil, 0.60 + 0.3 * wet); v = tone * (0.54 - 0.12 * wet); }
  else { col = mix3(grass, dust.map((q) => q * 0.6), j === 9 ? 0.12 : 0.04); v = tone * 0.96; }
  return [col, v];
}

const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function trackPalette(gain, tint) {
  const sc = (hex) => tokenLinear(hex).map((v, i) => v * gain * tint[i]);
  const lush = sc(TASTE.ground.grassLush);
  const dry = sc(TASTE.ground.grassDry);
  const soil = sc(TASTE.ground.soil);
  const pale = sc(TASTE.ground.track);
  const dust = mix3(mix3(soil, dry, 0.55), pale, 0.30);
  return { lush, dry, soil, dust };
}

/**
 * W32 (TRACK_RUT): the formed track with wheel-line ruts and a verge in bays. One ribbon, 21 columns a station: crown, flank, lip, wall,
 * three bed columns, wall, lip, then the verge's inner and outer columns. The pair of ruts wanders with the track as one (the verge
 * with it), and every column's lateral offset, wander included, is capped at 2.95 m. The texture is laid on the run (u along it, v across
 * it), so the bay mask follows the track; its alpha multiplies the vertex alpha and the alpha test cuts the verge where the product is
 * under TRACK_RUT_CUT.
 */
function makeFarmTrackRut(seed, lines, sampleGround, gain, tint, blocked = null) {
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const { lush, dry, soil, dust } = trackPalette(gain, tint);
  const GRASS_K = 0.63;
  const bed = trackBedActive() === 1; // W84 (TRACK_BED)
  const NC = TRACK_RUT_COLS.length * 2 - 1;
  const mid = TRACK_RUT_COLS.length - 1;
  let base = 0;
  let li = 0;
  for (const line of lines) {
    li += 1;
    const dx = line.x1 - line.x0;
    const dz = line.z1 - line.z0;
    const len = Math.hypot(dx, dz);
    if (len < 14) continue;
    const ux = dx / len;
    const uz = dz / len;
    const nx = -uz;
    const nz = ux;
    const n = Math.max(6, Math.round(len / TRACK_FORM_STEP));
    const lk = li * 3.71;
    // taste W37 (TRACK_APRON): the stretches of the line that stand clear of `blocked`, as [from, to] in station units (the whole line, 0 to n,
    // where nothing is blocked). Each stretch is its own strip; the noise, the stations and the tapers are the line's own.
    const spans = [[0, n]];
    if (blocked) {
      const runs = splitTrackRuns([[line.x0, line.z0], [line.x1, line.z1]], blocked, { halfWidth: TRACK_RUT_REACH, taps: TRACK_APRON_TAPS });
      spans.length = 0;
      for (const r of runs) {
        const a = r.pts[0], b = r.pts[r.pts.length - 1];
        spans.push([Math.hypot(a[0] - line.x0, a[1] - line.z0) / len * n, Math.hypot(b[0] - line.x0, b[1] - line.z0) / len * n]);
      }
    }
    for (const [iA, iB] of spans) {
    const cutA = iA > 1e-9, cutB = iB < n - 1e-9;
    const idx = [cutA ? iA : 0];
    for (let q = Math.floor(iA) + 1; q < iB - 1e-9; q += 1) if (!(cutA && q - iA < 0.05) && !(cutB && iB - q < 0.05)) idx.push(q);
    idx.push(cutB ? iB : n);
    for (const i of idx) {
      const t = i / n;
      const s = len * t;
      const x = line.x0 + dx * t;
      const z = line.z0 + dz * t;
      const taper = Math.min(1, Math.min(i - iA, iB - i) / 3);
      const yard = smoothstep(0, 6, s);
      const n1 = valueNoise2(s * 0.04, lk, seed + 601);
      const n2 = valueNoise2(s * 0.16, lk + 9, seed + 602);
      const tone = 0.84 + 0.34 * n1 + 0.18 * (n2 - 0.5);
      const wet = smoothstep(0.60, 0.80, valueNoise2(s * 0.035, lk + 4, seed + 603));
      const dustK = valueNoise2(s * 0.09, lk + 2, seed + 604);
      const dryK = 0.12 + 0.55 * valueNoise2(s * 0.05, lk + 6, seed + 605);
      const bare = smoothstep(0.62, 0.84, valueNoise2(s * 0.12, lk + 8, seed + 606));
      const wander = (valueNoise2(s * 0.025, lk + 1, seed + 620) - 0.5) * 0.36;
      const grass = mix3(lush, dry, Math.min(1, dryK + 0.18)).map((q) => q * GRASS_K);
      const u = s / TRACK_RUT_TILE_U + li * 0.137;
      for (let c = 0; c < NC; c += 1) {
        const side = c < mid ? -1 : c > mid ? 1 : 0;
        const j = Math.abs(c - mid);
        const sk = side < 0 ? 0 : 1;
        let off = TRACK_RUT_COLS[j][0];
        const rise = TRACK_RUT_COLS[j][1];
        let alpha = j <= 8 ? TRACK_RUT_ALPHA[j] : 0;
        if (j <= 8) {
          // The gauge breathes a little; the lips and the bed move with it.
          const gauge = 1 + (valueNoise2(s * 0.07, lk + 3 + sk * 13, seed + 621) - 0.5) * 0.10;
          off *= j >= 2 ? gauge : 1;
        } else {
          const bay = smoothstep(0.34, 0.66, valueNoise2(s * 0.07, lk + 2.9 + sk * 17, seed + 611));
          alpha = j === 9 ? 0.62 + 0.22 * bay : 0.40 + 0.10 * bay;
        }
        const nominal = side * off;
        let lat = nominal + wander;
        if (lat > 2.95) lat = 2.95; else if (lat < -2.95) lat = -2.95;
        const px = x + nx * lat;
        const pz = z + nz * lat;
        const jit = 1 + (wob(i * 1.37 + c * 0.91, li, seed + 9) - 0.5) * 0.12;
        const [col, v0] = rutColumnLook(j, mix3, { grass, dust, soil, tone, wet, dustK, bare });
        const v = v0 * jit;
        positions.push(px, sampleGround(px, pz) + rise * (0.4 + 0.6 * taper) + li * 0.003, pz);
        if (bed) { const f = trackBedFactor(col, v, grass, j); colors.push(f[0], f[1], f[2], alpha * yard); } // W84 (TRACK_BED)
        else colors.push(col[0] * v * TRACK_FORM_MAP_GAIN, col[1] * v * TRACK_FORM_MAP_GAIN, col[2] * v * TRACK_FORM_MAP_GAIN, alpha * yard);
        uvs.push(u, (nominal + TRACK_RUT_TILE_V / 2) / TRACK_RUT_TILE_V);
      }
    }
    for (let i = 0; i < idx.length - 1; i += 1) {
      const a = base + i * NC;
      const b2 = a + NC;
      for (let k = 0; k < NC - 1; k += 1) {
        indices.push(a + k, a + k + 1, b2 + k, a + k + 1, b2 + k + 1, b2 + k);
      }
    }
    base += idx.length * NC;
    }
  }
  const geo = new THREE.BufferGeometry();
  if (!positions.length) return geo;
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}
/** W37: the places across the line that `splitTrackRuns` tries for the hinterland track (fractions of its 2.95 m reach, a quarter apart). */
const TRACK_APRON_TAPS = [0, -0.25, -0.5, -0.75, -1, 0.25, 0.5, 0.75, 1];

/**
 * The hinterland's formed track: straight lines `{ x0, z0, x1, z1 }` laid on `sampleGround`, in the palette `gain` and `tint` (fringe.js
 * passes PADDOCK_GAIN and PADDOCK_TINT). TRACK_RUT on gives the wheel-line ribbon; off, wave thirty-one's. `blocked(x, z)` (W37, TRACK_APRON)
 * breaks the wheel-line ribbon where it is true.
 */
export function makeFarmTrackForm(seed, lines, sampleGround, gain, tint, blocked = null) {
  if (trackRutOn && trackRouteOn && lines.length && lines[0].pts) return makeFarmTrackRoute(seed, lines, sampleGround, gain, tint, trackApronActive() ? blocked : null);
  if (trackRutOn) return makeFarmTrackRut(seed, lines, sampleGround, gain, tint, trackApronActive() ? blocked : null);
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const { lush, dry, soil, dust } = trackPalette(gain, tint);
  const GRASS_K = 0.63; // the sheet's grass lights a good deal darker than its token times the gain; the ribbon is laid at what the sheet shows
  const NC = TRACK_FORM_COLS.length * 2 - 1;
  const mid = TRACK_FORM_COLS.length - 1;
  let base = 0;
  let li = 0;
  for (const line of lines) {
    li += 1;
    const dx = line.x1 - line.x0;
    const dz = line.z1 - line.z0;
    const len = Math.hypot(dx, dz);
    if (len < 14) continue;
    const ux = dx / len;
    const uz = dz / len;
    const nx = -uz;
    const nz = ux;
    const n = Math.max(6, Math.round(len / TRACK_FORM_STEP));
    const lk = li * 3.71;
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const s = len * t;
      const x = line.x0 + dx * t;
      const z = line.z0 + dz * t;
      const taper = Math.min(1, Math.min(i, n - i) / 3);
      // The yard end fades out into the paddock; the board end keeps its colour, as it always has.
      const yard = smoothstep(0, 6, s);
      const n1 = valueNoise2(s * 0.04, lk, seed + 601);
      const n2 = valueNoise2(s * 0.16, lk + 9, seed + 602);
      const tone = 0.84 + 0.34 * n1 + 0.18 * (n2 - 0.5);
      const wet = smoothstep(0.60, 0.80, valueNoise2(s * 0.035, lk + 4, seed + 603));
      const dustK = valueNoise2(s * 0.09, lk + 2, seed + 604);
      const dryK = 0.12 + 0.55 * valueNoise2(s * 0.05, lk + 6, seed + 605);
      const bare = smoothstep(0.62, 0.84, valueNoise2(s * 0.12, lk + 8, seed + 606));
      const wander = (valueNoise2(s * 0.025, lk + 1, seed + 620) - 0.5) * 0.36;
      for (let c = 0; c < NC; c += 1) {
        const side = c < mid ? -1 : c > mid ? 1 : 0;
        const j = Math.abs(c - mid);
        const sk = side < 0 ? 0 : 1;
        let off = TRACK_FORM_COLS[j][0];
        let rise = TRACK_FORM_COLS[j][1];
        // Every part is laid over the paddock, not instead of it: the crown lets the field's own colour through, so the track takes the colour of whatever it crosses.
        let alpha = TRACK_FORM_ALPHA[j];
        let v = 1;
        if (j <= 6) {
          // Ruts and crown. The rut gauge breathes a little and the pair wanders as one.
          const gauge = 1 + (valueNoise2(s * 0.07, lk + 3 + sk * 13, seed + 621) - 0.5) * 0.14;
          off *= j >= 2 ? gauge : 1;
        } else {
          const bay = smoothstep(0.34, 0.66, valueNoise2(s * 0.07, lk + 2.9 + sk * 17, seed + 611));
          const hairy = wob(i + sk * 211, li, seed + 7);
          const reach = 1.95 + 0.62 * valueNoise2(s * 0.30, lk + sk * 5, seed + 612) + 0.45 * hairy;
          const edge = Math.min(2.95, 1.9 + (reach - 1.9) * (0.25 + 0.75 * bay));
          if (j === 7) { off = 1.82 + 0.10 * bay; alpha = 0.50 + 0.30 * bay; }
          else if (j === 8) { off = Math.max(1.9, edge - 0.32); alpha = 0.28 + 0.40 * bay; }
          else { off = edge; alpha = 0; }
        }
        const lat = side * off + wander * (j >= 7 ? 0.6 : 1);
        const px = x + nx * lat;
        const pz = z + nz * lat;
        const jit = 1 + (wob(i * 1.37 + c * 0.91, li, seed + 9) - 0.5) * 0.12;
        const grass = mix3(lush, dry, Math.min(1, dryK + 0.18)).map((q) => q * GRASS_K);
        let col;
        if (j === 0) { col = mix3(grass, dust.map((q) => q * 0.6), bare * 0.8); v = tone * 0.96; }
        else if (j === 1) { col = mix3(grass, dust.map((q) => q * 0.6), 0.12 + bare * 0.65); v = tone * 0.98; }
        else if (j === 2) { col = mix3(grass, dust.map((q) => q * 0.8), 0.55); v = tone; }
        else if (j === 6) { col = mix3(grass, dust.map((q) => q * 0.85), 0.50 + 0.2 * dustK); v = tone * 1.04; }
        else if (j === 4) { col = mix3(dust, soil, 0.55 + 0.3 * wet); v = tone * (0.62 - 0.14 * wet); }
        else if (j <= 5) { col = mix3(dust, soil, 0.35 + 0.3 * wet); v = tone * (0.78 - 0.14 * wet) * (0.92 + 0.16 * dustK); }
        else { col = mix3(grass, dust.map((q) => q * 0.6), j === 7 ? 0.14 : 0.04); v = tone; }
        v *= jit;
        const r = col[0] * v; const g = col[1] * v; const b = col[2] * v;
        positions.push(px, sampleGround(px, pz) + rise * (0.4 + 0.6 * taper) + li * 0.003, pz);
        colors.push(r * TRACK_FORM_MAP_GAIN, g * TRACK_FORM_MAP_GAIN, b * TRACK_FORM_MAP_GAIN, alpha * yard);
        uvs.push(px / TRACK_FORM_TILE_M, pz / TRACK_FORM_TILE_M);
      }
    }
    for (let i = 0; i < n; i += 1) {
      const a = base + i * NC;
      const b2 = a + NC;
      for (let k = 0; k < NC - 1; k += 1) {
        indices.push(a + k, a + k + 1, b2 + k, a + k + 1, b2 + k + 1, b2 + k);
      }
    }
    base += (n + 1) * NC;
  }
  const geo = new THREE.BufferGeometry();
  if (!positions.length) return geo;
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * W33 (TRACK_KIN): the W32 ribbon scaled to a narrower track, along a polyline (the two tracks that were a flat ribbon bend, or break where
 * a viaduct crosses them). `runs` is `[{ pts: [[x, z], ...], yard?: bool }]`: a run is one unbroken stretch, `yard` fades its start in over
 * 6 form metres (the track leaves a farmyard). `o.halfWidth` is the footprint's half width; the form's 2.95 m reach is scaled to it, and
 * every distance along and across (the noises, the gauge, the wander, the fade) scales with it, so the picture is the hinterland's at
 * their size. Stations fall on every vertex of the polyline and, between two vertices more than `o.step` apart, at about that step. At a
 * bend the offset is mitred (the column stays the same distance from both legs). Heights are `sampleGround` plus `o.lift` plus the rise.
 */
export function makeTrackKinGeometry(runs, o) {
  const { seed = 0, sampleGround, gain, tint, halfWidth, lift = 0, step = TRACK_FORM_STEP * 0.6, line0 = 11 } = o;
  const k = halfWidth / TRACK_RUT_REACH;
  const riseK = Math.sqrt(k);
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const { lush, dry, soil, dust } = trackPalette(gain, tint);
  const GRASS_K = o.grassK ?? 0.63;
  const NC = TRACK_RUT_COLS.length * 2 - 1;
  const mid = TRACK_RUT_COLS.length - 1;
  let base = 0;
  let li = line0 - 1;
  for (const run of runs) {
    li += 1;
    const pts = run.pts;
    if (!pts || pts.length < 2) continue;
    // Stations: [x, z, s, mitre normal x, mitre normal z, mitre scale].
    const st = [];
    let s = 0;
    const legs = [];
    for (let a = 1; a < pts.length; a += 1) {
      const dx = pts[a][0] - pts[a - 1][0];
      const dz = pts[a][1] - pts[a - 1][1];
      const len = Math.hypot(dx, dz);
      legs.push(len > 1e-6 ? { ux: dx / len, uz: dz / len, len } : null);
    }
    const live = legs.map((l, a) => (l ? a : -1)).filter((a) => a >= 0);
    if (!live.length) continue;
    const mitre = (a, b) => {
      // the offset direction at the point between leg a and leg b (either may be null at the ends)
      const A = legs[a] ?? legs[b];
      const B = legs[b] ?? legs[a];
      const nax = -A.uz; const naz = A.ux;
      const nbx = -B.uz; const nbz = B.ux;
      let mx = nax + nbx; let mz = naz + nbz;
      const ml = Math.hypot(mx, mz);
      if (ml < 1e-6) return [nax, naz, 1];
      mx /= ml; mz /= ml;
      // taste W33: the mitre is capped at the half width (scale 1), so a right-angle bend bevels inside the old footprint instead of
      // reaching 1.33 m past it (reviewer, the gateway track's bend at local (-204, 151.78)).
      return [mx, mz, Math.min(1, 1 / Math.max(0.5, mx * nax + mz * naz))];
    };
    let prevLeg = null;
    for (let a = 0; a < legs.length; a += 1) {
      const leg = legs[a];
      if (!leg) continue;
      const n = Math.max(1, Math.round(leg.len / step));
      for (let q = (st.length ? 1 : 0); q <= n; q += 1) {
        const t = q / n;
        const x = pts[a][0] + (pts[a + 1][0] - pts[a][0]) * t;
        const z = pts[a][1] + (pts[a + 1][1] - pts[a][1]) * t;
        let m;
        if (q === 0) m = mitre(prevLeg ?? a, a);
        else if (q === n) { const nextLeg = legs.findIndex((l, b) => b > a && l); m = mitre(a, nextLeg >= 0 ? nextLeg : a); }
        else m = [-leg.uz, leg.ux, 1];
        st.push([x, z, s + leg.len * t, m[0], m[1], m[2]]);
      }
      s += leg.len;
      prevLeg = a;
    }
    // The first station of the first leg takes its own leg's normal.
    if (st.length < 2) continue;
    const total = s;
    const lk = li * 3.71;
    const n = st.length - 1;
    for (let i = 0; i <= n; i += 1) {
      const [x, z, sRaw, nx, nz, ms] = st[i];
      // Form metres: everything the hinterland form does per metre happens here per 1/k metre.
      const sf = sRaw / k;
      const taper = Math.min(1, Math.min(sRaw, total - sRaw) / (7.5 * k));
      const yard = run.yard ? smoothstep(0, 6, sf) : 1;
      const n1 = valueNoise2(sf * 0.04, lk, seed + 601);
      const n2 = valueNoise2(sf * 0.16, lk + 9, seed + 602);
      const tone = 0.84 + 0.34 * n1 + 0.18 * (n2 - 0.5);
      const wet = smoothstep(0.60, 0.80, valueNoise2(sf * 0.035, lk + 4, seed + 603));
      const dustK = valueNoise2(sf * 0.09, lk + 2, seed + 604);
      const dryK = 0.12 + 0.55 * valueNoise2(sf * 0.05, lk + 6, seed + 605);
      const bare = smoothstep(0.62, 0.84, valueNoise2(sf * 0.12, lk + 8, seed + 606));
      const wander = (valueNoise2(sf * 0.025, lk + 1, seed + 620) - 0.5) * 0.36;
      const grass = mix3(lush, dry, Math.min(1, dryK + 0.18)).map((q) => q * GRASS_K);
      const u = sf / TRACK_RUT_TILE_U + li * 0.137;
      for (let c = 0; c < NC; c += 1) {
        const side = c < mid ? -1 : c > mid ? 1 : 0;
        const j = Math.abs(c - mid);
        const sk = side < 0 ? 0 : 1;
        let off = TRACK_RUT_COLS[j][0];
        const rise = TRACK_RUT_COLS[j][1];
        let alpha = j <= 8 ? TRACK_RUT_ALPHA[j] : 0;
        if (j <= 8) {
          const gauge = 1 + (valueNoise2(sf * 0.07, lk + 3 + sk * 13, seed + 621) - 0.5) * 0.10;
          off *= j >= 2 ? gauge : 1;
        } else {
          const bay = smoothstep(0.34, 0.66, valueNoise2(sf * 0.07, lk + 2.9 + sk * 17, seed + 611));
          alpha = j === 9 ? 0.62 + 0.22 * bay : 0.40 + 0.10 * bay;
        }
        const nominal = side * off;
        let lat = nominal + wander;
        if (lat > TRACK_RUT_REACH) lat = TRACK_RUT_REACH; else if (lat < -TRACK_RUT_REACH) lat = -TRACK_RUT_REACH;
        const d = lat * k * ms;
        const px = x + nx * d;
        const pz = z + nz * d;
        const jit = 1 + (wob(i * 1.37 + c * 0.91, li, seed + 9) - 0.5) * 0.12;
        const [col, v0] = rutColumnLook(j, mix3, { grass, dust, soil, tone, wet, dustK, bare });
        const v = v0 * jit;
        positions.push(px, sampleGround(px, pz) + lift + rise * riseK * (0.4 + 0.6 * taper) + li * 0.003, pz);
        colors.push(col[0] * v * TRACK_FORM_MAP_GAIN, col[1] * v * TRACK_FORM_MAP_GAIN, col[2] * v * TRACK_FORM_MAP_GAIN, alpha * yard);
        uvs.push(u, (nominal + TRACK_RUT_TILE_V / 2) / TRACK_RUT_TILE_V);
      }
    }
    for (let i = 0; i < n; i += 1) {
      const a = base + i * NC;
      const b2 = a + NC;
      for (let c = 0; c < NC - 1; c += 1) {
        indices.push(a + c, a + c + 1, b2 + c, a + c + 1, b2 + c + 1, b2 + c);
      }
    }
    base += (n + 1) * NC;
  }
  const geo = new THREE.BufferGeometry();
  if (!positions.length) return geo;
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * W33 (TRACK_KIN): a scaled formed track as a mesh, ready to add: its geometry, its own transparent material (the geometry's disposal
 * takes the material and its texture with it), drawn in the same pass and with the same polygon offset as the hinterland's. The caller
 * names it and adds it. Null when there is nothing to draw.
 */
export function makeTrackKinMesh(runs, o) {
  const geo = makeTrackKinGeometry(runs, o);
  if (!geo.getAttribute('position')) { geo.dispose(); return null; }
  const mat = makeTrackFormMaterial(o.seed ?? 0, 1);
  geo.addEventListener('dispose', () => mat.dispose());
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.ownsGeometry = true;
  mesh.userData.trackKin = true;
  mesh.renderOrder = -15;
  return mesh;
}


/** W80 (TRACK_ROUTE): the arc length along `pts` of the point nearest (x, z). */
function routeArcOf(pts, x, z) {
  let best = Infinity, arc = 0, acc = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const dx = pts[i][0] - pts[i - 1][0], dz = pts[i][1] - pts[i - 1][1], l = Math.hypot(dx, dz), l2 = l * l;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - pts[i - 1][0]) * dx + (z - pts[i - 1][1]) * dz) / l2)) : 0;
    const d = Math.hypot(x - (pts[i - 1][0] + dx * t), z - (pts[i - 1][1] + dz * t));
    if (d < best) { best = d; arc = acc + l * t; }
    acc += l;
  }
  return arc;
}

/**
 * W80 (TRACK_ROUTE): the wheel-line ribbon of `makeFarmTrackRut`, once for each routed corridor (`{ pts }`, stations about 2.5 m apart) and
 * along its bends: the same 21 columns, noise, taper and yard fade, the offset taken from the central-difference tangent. Where the
 * ribbon lies within 4.4 m of an earlier corridor's centreline its alpha ramps from 1 down to 0 at 2.4 m (smoothstep), so a spur ends in its
 * trunk's verge and the two ribbons never stack ruts. A corridor under 5 m is not drawn (a routed spur can be short: its shed stands within 14 m of the trunk).
 */
function makeFarmTrackRoute(seed, corridors, sampleGround, gain, tint, blocked = null) {
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const { lush, dry, soil, dust } = trackPalette(gain, tint);
  const GRASS_K = 0.63;
  const bed = trackBedActive() === 1; // W84 (TRACK_BED)
  const NC = TRACK_RUT_COLS.length * 2 - 1;
  const mid = TRACK_RUT_COLS.length - 1;
  let base = 0;
  corridors.forEach((cor, ci) => {
    const li = ci + 1;
    const lk = li * 3.71;
    const pts = cor.pts;
    let total = 0;
    for (let i = 1; i < pts.length; i += 1) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (total < 5) return;
    const runs = blocked ? splitTrackRuns(pts, blocked, { halfWidth: TRACK_RUT_REACH, taps: TRACK_APRON_TAPS }) : [{ pts }];
    const others = [];
    for (let k = 0; k < ci; k += 1) others.push(corridors[k].simple ?? corridors[k].pts);
    for (const run of runs) {
      const st = resampleRoute(run.pts, TRACK_FORM_STEP);
      const m = st.length - 1;
      let s = routeArcOf(pts, st[0][0], st[0][1]);
      for (let i = 0; i <= m; i += 1) {
        if (i > 0) s += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
        const a = st[Math.max(0, i - 1)], b = st[Math.min(m, i + 1)];
        const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const nx = -(b[1] - a[1]) / dl;
        const nz = (b[0] - a[0]) / dl;
        const x = st[i][0], z = st[i][1];
        const taper = Math.min(1, Math.min(i, m - i) / 3);
        const yard = smoothstep(0, 6, s);
        let near = Infinity;
        for (const o of others) near = Math.min(near, distToPolyline(x, z, o).d);
        const n1 = valueNoise2(s * 0.04, lk, seed + 601);
        const n2 = valueNoise2(s * 0.16, lk + 9, seed + 602);
        const tone = 0.84 + 0.34 * n1 + 0.18 * (n2 - 0.5);
        const wet = smoothstep(0.60, 0.80, valueNoise2(s * 0.035, lk + 4, seed + 603));
        const dustK = valueNoise2(s * 0.09, lk + 2, seed + 604);
        const dryK = 0.12 + 0.55 * valueNoise2(s * 0.05, lk + 6, seed + 605);
        const bare = smoothstep(0.62, 0.84, valueNoise2(s * 0.12, lk + 8, seed + 606));
        const wander = (valueNoise2(s * 0.025, lk + 1, seed + 620) - 0.5) * 0.36;
        const grass = mix3(lush, dry, Math.min(1, dryK + 0.18)).map((q) => q * GRASS_K);
        const u = s / TRACK_RUT_TILE_U + li * 0.137;
        for (let c = 0; c < NC; c += 1) {
          const side = c < mid ? -1 : c > mid ? 1 : 0;
          const j = Math.abs(c - mid);
          const sk = side < 0 ? 0 : 1;
          let off = TRACK_RUT_COLS[j][0];
          const rise = TRACK_RUT_COLS[j][1];
          let alpha = j <= 8 ? TRACK_RUT_ALPHA[j] : 0;
          if (j <= 8) {
            const gauge = 1 + (valueNoise2(s * 0.07, lk + 3 + sk * 13, seed + 621) - 0.5) * 0.10;
            off *= j >= 2 ? gauge : 1;
          } else {
            const bay = smoothstep(0.34, 0.66, valueNoise2(s * 0.07, lk + 2.9 + sk * 17, seed + 611));
            alpha = j === 9 ? 0.62 + 0.22 * bay : 0.40 + 0.10 * bay;
          }
          const nominal = side * off;
          let lat = nominal + wander;
          if (lat > 2.95) lat = 2.95; else if (lat < -2.95) lat = -2.95;
          const px = x + nx * lat;
          const pz = z + nz * lat;
          let fade = 1;
          if (near < 4.4 + TRACK_RUT_REACH) {
            let dn = Infinity;
            for (const o of others) dn = Math.min(dn, distToPolyline(px, pz, o).d);
            fade = smoothstep(2.4, 4.4, dn);
          }
          const jit = 1 + (wob(i * 1.37 + c * 0.91, li, seed + 9) - 0.5) * 0.12;
          const [col, v0] = rutColumnLook(j, mix3, { grass, dust, soil, tone, wet, dustK, bare });
          const v = v0 * jit;
          positions.push(px, sampleGround(px, pz) + rise * (0.4 + 0.6 * taper) + li * 0.003, pz);
          if (bed) { const f = trackBedFactor(col, v, grass, j); colors.push(f[0], f[1], f[2], alpha * yard * fade); } // W84 (TRACK_BED)
          else colors.push(col[0] * v * TRACK_FORM_MAP_GAIN, col[1] * v * TRACK_FORM_MAP_GAIN, col[2] * v * TRACK_FORM_MAP_GAIN, alpha * yard * fade);
          uvs.push(u, (nominal + TRACK_RUT_TILE_V / 2) / TRACK_RUT_TILE_V);
        }
      }
      for (let i = 0; i < m; i += 1) {
        const a = base + i * NC;
        const b2 = a + NC;
        for (let k = 0; k < NC - 1; k += 1) indices.push(a + k, a + k + 1, b2 + k, a + k + 1, b2 + k + 1, b2 + k);
      }
      base += (m + 1) * NC;
    }
  });
  const geo = new THREE.BufferGeometry();
  if (!positions.length) return geo;
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// taste W80 (TRACK_ROUTE): the farm tracks routed onto shared corridors.
export const TRACK_ROUTE_REACH = 2.95;
const ROUTE_STATION = 2.5;
const ROUTE_MOVES = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1], [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2], [1, -2], [2, -1]];
const ROUTE_RDP_TOL = 0.2;
const ROUTE_RDP_MAX = 20;

function rdpKeep(pts, tol, maxLen) {
  const keep = new Uint8Array(pts.length);
  keep[0] = 1; keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a][0], az = pts[a][1], dx = pts[b][0] - ax, dz = pts[b][1] - az;
    const l2 = dx * dx + dz * dz;
    let worst = -1, wd = 0;
    for (let k = a + 1; k < b; k += 1) {
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((pts[k][0] - ax) * dx + (pts[k][1] - az) * dz) / l2)) : 0;
      const d = Math.hypot(pts[k][0] - (ax + dx * t), pts[k][1] - (az + dz * t));
      if (d >= wd) { wd = d; worst = k; }
    }
    if (worst > 0 && (wd > tol || Math.sqrt(l2) > maxLen)) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  return pts.filter((_, k) => keep[k]);
}

/** Resample a polyline at equal arc length about `step` apart (both ends kept). */
function resampleRoute(pts, step) {
  const seg = [];
  let L = 0;
  for (let i = 1; i < pts.length; i += 1) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; }
  const n = Math.max(1, Math.round(L / step));
  const out = [pts[0].slice()];
  let k = 0, acc = 0;
  for (let q = 1; q < n; q += 1) {
    const s = (L * q) / n;
    while (k < seg.length - 1 && acc + seg[k] < s) { acc += seg[k]; k += 1; }
    const t = seg[k] > 0 ? (s - acc) / seg[k] : 0;
    out.push([pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t]);
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

function distToPolyline(x, z, p) {
  let best = Infinity, bx = p[0][0], bz = p[0][1];
  for (let i = 1; i < p.length; i += 1) {
    const dx = p[i][0] - p[i - 1][0], dz = p[i][1] - p[i - 1][1], l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - p[i - 1][0]) * dx + (z - p[i - 1][1]) * dz) / l2)) : 0;
    const qx = p[i - 1][0] + dx * t, qz = p[i - 1][1] + dz * t, d = Math.hypot(x - qx, z - qz);
    if (d < best) { best = d; bx = qx; bz = qz; }
  }
  return { d: best, x: bx, z: bz };
}

/**
 * taste W80 (TRACK_ROUTE): routes the farm tracks onto shared corridors. `sheds` are `{ x, z }` (the ones that have a line today, in order);
 * `extent` is the board square ({ x, z }, from 0); `ground(x, z)` is the height the ribbon is seated on (fringe.js passes `sampleGround`);
 * `wet(x, z)` is the crust's waterness; `blocked(x, z)` is true where no ribbon may lie (the venue keep-out, its reach and a 10 m verge).
 * `obstacles` (optional): `points` `[x, z, zone, hit]` (a tree, crest tree, bale, shrub or shed: a metre inside `zone` costs `obsK` more, and a
 * corridor within `hit` of the centre counts as a hit) and `segs` `[x0, z0, x1, z1, zone]` (a fence, hedge or windbreak run, at half weight).
 * Each shed first searches a 1.25 m grid out to `seatR` m (lattice-aligned) so the way off a steep seat takes any heading, not the lattice's,
 * then a grid of `cell` m with 16 moves for the cheapest way to the board, where a metre costs more with the ribbon's cross-slope over 5.9 m,
 * the grade along it, the creek's waterness and the obstacles. Trunks: the search also ends, at `dist + trunkK * (length the trunk has left to
 * the board) + the connector`, on any node within `joinM` of an earlier corridor's smoothed centreline, and the spur then ends on that centreline,
 * so a later shed joins an earlier corridor and the trunk is drawn once. Every path is smoothed (a low pass over 2.5 m stations, ends pinned,
 * lighter within 28 m of the shed, so a steep seat's heading survives), checked (cross-slope, grade, obstacle hits) and searched again with the violating stretch made dearer
 * (up to `tries`). W80 fix 4: a pull toward today's line: beyond `pullFree` m (a free band) of the straight line from a shed to the board's nearest point, each
 * metre of that shed's path costs `pullK` more for every metre of distance, so a corridor keeps near today's line unless the ground forbids it, and sheds whose
 * lines stack today lay theirs on the same ground and share one trunk there. Returns `{ corridors, segments, stats }`: corridor `{ shed, pts: [[x, z], ...] (2.5 m stations), simple: [[x, z], ...]
 * (simplified vertices), parent, join, worst, hits }`, segments `{ x0, z0, x1, z1, c }`.
 */
export function routeFarmTracks(o) {
  const { sheds, extent, ground, wet, blocked, obstacles = null, cell = 5, joinM = 14, trunkK = 1, tries = 8, avoidK = 25, hitAvoid = 0, limK = 20000, gK = 1500, obsK = 16, shedK = 40, shrubW = 0.5, runK = 30, alongK = 60, runAlongM = 3.6, todayCap = 1.35, pullK = 0.15, pullKs = null, pullFree = 15, trunkPull = 0.6, shareMin = 12, yardM = 30, yardK = 0.05, yardIn = 26, yardN = 18, yardCone = 45, hardGradeW = 4, hardCrossW = 4, steepGW = 10, steepFrom = 0.22, crowdN = 1, raiseCaps = [1.6], joinTurn = 70, pullLo = null, steepA = 0.18, steepB = 0.28, gradeW = 1, crossW = 1, pullAlone = 0.1, stackM = 12, stackLen = 30, seatR = 22, detour = 1.25, clusterM = 0, bearingDeg = 0, joinSlack = 0.25, lone = false } = o;
  const REACH = TRACK_ROUTE_REACH;
  let minX = 0, maxX = extent.x, minZ = 0, maxZ = extent.z;
  for (const s of sheds) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
  const X0 = Math.floor((minX - 40) / cell) * cell, Z0 = Math.floor((minZ - 40) / cell) * cell;
  const NX = Math.ceil((maxX + 40 - X0) / cell) + 1, NZ = Math.ceil((maxZ + 40 - Z0) / cell) + 1, NN = NX * NZ;
  const hc = cell / 2, HX = (NX - 1) * 2 + 1, HZ = (NZ - 1) * 2 + 1;
  const H = new Float32Array(HX * HZ);
  for (let j = 0; j < HZ; j += 1) for (let i = 0; i < HX; i += 1) H[j * HX + i] = ground(X0 + i * hc, Z0 + j * hc);
  const WT = new Float32Array(NN);
  for (let j = 0; j < NZ; j += 1) for (let i = 0; i < NX; i += 1) WT[j * NX + i] = wet(X0 + i * cell, Z0 + j * cell);
  // around the shed being routed the ground is read at 1 m (the 2.5 m sheet smooths the bank a steep seat stands on)
  const LPN = Math.ceil((2 * (seatR + 8)) / 1) + 1;
  const LP = { x0: 0, z0: 0, on: false, H: new Float32Array(LPN * LPN) };
  const hAt = (x, z) => {
    if (LP.on) {
      const lx = x - LP.x0, lz = z - LP.z0;
      if (lx >= 0 && lz >= 0 && lx < LPN - 1.001 && lz < LPN - 1.001) {
        const i = Math.floor(lx), j = Math.floor(lz), tx = lx - i, tz = lz - j, k = j * LPN + i;
        return (LP.H[k] * (1 - tx) + LP.H[k + 1] * tx) * (1 - tz) + (LP.H[k + LPN] * (1 - tx) + LP.H[k + LPN + 1] * tx) * tz;
      }
    }
    const fx = Math.max(0, Math.min(HX - 1.001, (x - X0) / hc)), fz = Math.max(0, Math.min(HZ - 1.001, (z - Z0) / hc));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * HX + i;
    return (H[k] * (1 - tx) + H[k + 1] * tx) * (1 - tz) + (H[k + HX] * (1 - tx) + H[k + HX + 1] * tx) * tz;
  };
  const wAt = (x, z) => {
    const fx = Math.max(0, Math.min(NX - 1.001, (x - X0) / cell)), fz = Math.max(0, Math.min(NZ - 1.001, (z - Z0) / cell));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * NX + i;
    return (WT[k] * (1 - tx) + WT[k + 1] * tx) * (1 - tz) + (WT[k + NX] * (1 - tx) + WT[k + NX + 1] * tx) * tz;
  };
  const inBoard = (x, z) => x >= 0 && x <= extent.x && z >= 0 && z <= extent.z;
  const crossAt = (x, z, ux, uz) => Math.abs(hAt(x - uz * REACH, z + ux * REACH) - hAt(x + uz * REACH, z - ux * REACH)) / (2 * REACH);
  const gradMag = (x, z, d = REACH) => Math.hypot((hAt(x + d, z) - hAt(x - d, z)) / (2 * d), (hAt(x, z + d) - hAt(x, z - d)) / (2 * d));
  // W81: the weights of the shed being routed: `gradeW` and `crossW` for every shed, times `hardGradeW` and `hardCrossW` for a shed whose own lone path breaks the limits
  const shedWG = sheds.map(() => gradeW), shedWC = sheds.map(() => crossW);
  let wC = crossW, wG = gradeW;
  const mCross = (c) => wC * (c / 0.14) ** 4;
  const mGrade = (g) => wG * (g / 0.16) ** 4;
  const mWet = (w) => { const t = Math.max(0, Math.min(1, (w - 0.06) / 0.14)); return 12 * t * t * (3 - 2 * t); };

  // obstacles: a 1.25 m cost raster (1 inside an item's zone, falling to 0 over a soft margin) and a hash of the points for exact hit counts
  const OC = 1.25, OX = Math.ceil((maxX + 40 - X0) / OC) + 1, OZ = Math.ceil((maxZ + 40 - Z0) / OC) + 1;
  const OB = new Float32Array(OX * OZ);
  const obAt = (x, z) => {
    const i = Math.round((x - X0) / OC), j = Math.round((z - Z0) / OC);
    return i < 0 || j < 0 || i >= OX || j >= OZ ? 0 : OB[j * OX + i];
  };
  const stamp = (x, z, r, soft, w) => {
    const R = r + soft, i0 = Math.max(0, Math.floor((x - R - X0) / OC)), i1 = Math.min(OX - 1, Math.ceil((x + R - X0) / OC));
    const j0 = Math.max(0, Math.floor((z - R - Z0) / OC)), j1 = Math.min(OZ - 1, Math.ceil((z + R - Z0) / OC));
    for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) {
      const d = Math.hypot(X0 + i * OC - x, Z0 + j * OC - z);
      if (d >= R) continue;
      const v = w * (d <= r ? 1 : (R - d) / soft);
      if (v > OB[j * OX + i]) OB[j * OX + i] = v;
    }
  };
  // W81: the yard is worn ground: an item within `yardM` m of a shed costs `yardK` of its price at `yardIn` m or less, rising to the full price at `yardM`
  // and only for a shed whose yard is a thicket in its way: `yardN` or more items (trees, bales, shrubs) within `yardM` m of its seat and within `yardCone` degrees
  // of its bearing to the board (0: every shed)
  const yardOf = sheds.map((s) => {
    if (yardK >= 1) return false;
    const b0 = Math.atan2(Math.max(0, Math.min(extent.z, s.z)) - s.z, Math.max(0, Math.min(extent.x, s.x)) - s.x);
    let n = 0;
    for (const [x, z, zone] of obstacles?.points ?? []) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (!(zone <= 5 && d >= 1.5 && d <= yardM)) continue;
      let da = Math.abs(Math.atan2(z - s.z, x - s.x) - b0);
      da = Math.min(da, 2 * Math.PI - da);
      if ((da * 180) / Math.PI <= yardCone) n += 1;
    }
    return n >= yardN;
  });
  const yardF = (x, z) => {
    if (yardK >= 1) return 1;
    let d = Infinity;
    for (let i = 0; i < sheds.length; i += 1) if (yardOf[i]) d = Math.min(d, Math.hypot(sheds[i].x - x, sheds[i].z - z));
    return yardK + (1 - yardK) * smoothstep(yardIn, yardM, d);
  };
  const pts = []; // hit points [x, z, hit]
  const hash = new Map();
  const hkey = (cx, cz) => (cx + 512) * 4096 + (cz + 512);
  // runs (fence, hedge, windbreak): a crossing costs `runK` (a gateway: about 30 m of free ground), once for each run crossed; a path may not run along a
  // run within `runAlongM` (a station within it, heading within 30 deg of the run's, pays `alongK` a metre)
  const RUNS = [], rhash = new Map();
  const RD = new Float32Array(OX * OZ).fill(99), RUx = new Float32Array(OX * OZ), RUz = new Float32Array(OX * OZ);
  if (obstacles) {
    for (const [x, z, zone, hit] of obstacles.points ?? []) {
      if (sheds.some((s) => Math.hypot(s.x - x, s.z - z) < 1.5)) continue; // a shed's own seat is no obstacle to its own track
      // a metre inside an item's zone costs obsK (a shrub half of that, another shed's yard shedK): a track bends round a tree, not round a belt
      stamp(x, z, zone, 1.8, zone > 5 ? shedK / obsK : (zone < 3.5 ? shrubW : 1) * yardF(x, z));
      const id = pts.length; pts.push([x, z, hit]);
      const key = hkey(Math.floor(x / 8), Math.floor(z / 8));
      if (!hash.has(key)) hash.set(key, []);
      hash.get(key).push(id);
    }
    for (const [x0, z0, x1, z1] of obstacles.segs ?? []) {
      const L = Math.hypot(x1 - x0, z1 - z0);
      if (!(L > 0)) continue;
      const id = RUNS.length, ux = (x1 - x0) / L, uz = (z1 - z0) / L;
      RUNS.push([x0, z0, x1, z1]);
      for (let cx = Math.floor(Math.min(x0, x1) / 8); cx <= Math.floor(Math.max(x0, x1) / 8); cx += 1) for (let cz = Math.floor(Math.min(z0, z1) / 8); cz <= Math.floor(Math.max(z0, z1) / 8); cz += 1) {
        const key = hkey(cx, cz);
        if (!rhash.has(key)) rhash.set(key, []);
        rhash.get(key).push(id);
      }
      const R = runAlongM + OC, i0 = Math.max(0, Math.floor((Math.min(x0, x1) - R - X0) / OC)), i1 = Math.min(OX - 1, Math.ceil((Math.max(x0, x1) + R - X0) / OC));
      const j0 = Math.max(0, Math.floor((Math.min(z0, z1) - R - Z0) / OC)), j1 = Math.min(OZ - 1, Math.ceil((Math.max(z0, z1) + R - Z0) / OC));
      for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) {
        const px = X0 + i * OC, pz = Z0 + j * OC, t = Math.max(0, Math.min(1, ((px - x0) * ux + (pz - z0) * uz) / L));
        const d = Math.hypot(px - x0 - ux * L * t, pz - z0 - uz * L * t);
        if (d < RD[j * OX + i]) { RD[j * OX + i] = d; RUx[j * OX + i] = ux; RUz[j * OX + i] = uz; }
      }
    }
  }
  // the runs a straight stretch (a to b) crosses: one for each run, the pieces of one run met within 3 m of each other counting once
  const runsCrossed = (ax, az, bx, bz) => {
    if (!RUNS.length) return 0;
    const seen = new Set(), ts = [], L = Math.hypot(bx - ax, bz - az);
    for (let cx = Math.floor(Math.min(ax, bx) / 8); cx <= Math.floor(Math.max(ax, bx) / 8); cx += 1) for (let cz = Math.floor(Math.min(az, bz) / 8); cz <= Math.floor(Math.max(az, bz) / 8); cz += 1) {
      const ids = rhash.get(hkey(cx, cz));
      if (!ids) continue;
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        const [x0, z0, x1, z1] = RUNS[id], rx = x1 - x0, rz = z1 - z0, sx = bx - ax, sz = bz - az, den = sx * rz - sz * rx;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((x0 - ax) * rz - (z0 - az) * rx) / den, u = ((x0 - ax) * sz - (z0 - az) * sx) / den;
        if (t > 0 && t < 1 && u >= -0.02 && u <= 1.02) ts.push(t * L);
      }
    }
    if (!ts.length) return 0;
    ts.sort((p, q) => p - q);
    let n = 1;
    for (let k = 1; k < ts.length; k += 1) if (ts[k] - ts[k - 1] > 3) n += 1;
    return n;
  };
  // the obstacle points a polyline (stations) passes within their hit distance of: { n, at: [station index, ...] }
  const hitsAlong = (st) => {
    const seen = new Set(), at = [];
    for (let k = 0; k < st.length - 1; k += 1) {
      const a = st[k], b = st[k + 1];
      const c0 = Math.floor((Math.min(a[0], b[0]) - 9) / 8), c1 = Math.floor((Math.max(a[0], b[0]) + 9) / 8);
      const d0 = Math.floor((Math.min(a[1], b[1]) - 9) / 8), d1 = Math.floor((Math.max(a[1], b[1]) + 9) / 8);
      for (let cx = c0; cx <= c1; cx += 1) for (let cz = d0; cz <= d1; cz += 1) {
        const ids = hash.get(hkey(cx, cz));
        if (!ids) continue;
        for (const id of ids) {
          if (seen.has(id)) continue;
          const p = pts[id], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
          const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
          if (Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t) <= p[2]) { seen.add(id); at.push(k); }
        }
      }
    }
    return { n: seen.size, at };
  };

  const alongAt = (x, z, ux, uz) => {
    if (!RUNS.length) return 0;
    const i = Math.round((x - X0) / OC), j = Math.round((z - Z0) / OC);
    if (i < 0 || j < 0 || i >= OX || j >= OZ) return 0;
    const k = j * OX + i;
    return RD[k] <= runAlongM && Math.abs(ux * RUx[k] + uz * RUz[k]) > 0.866 ? alongK : 0;
  };
  // the cost of a straight stretch from (ax, az) along (ux, uz) for L m: Infinity where blocked
  const stretchCost = (ax, az, ux, uz, L, lims = null) => {
    if (blocked(ax, az)) return Infinity;
    const K = Math.max(1, Math.ceil(L / ROUTE_STATION)), ds = L / K;
    let cost = runK * runsCrossed(ax, az, ax + ux * L, az + uz * L), hPrev = hAt(ax, az), cPrev = crossAt(ax, az, ux, uz);
    for (let k = 1; k <= K; k += 1) {
      const x = ax + ux * ds * k, z = az + uz * ds * k;
      if (blocked(x, z)) return Infinity;
      const h = hAt(x, z), c = crossAt(x, z, ux, uz);
      cost += ds * (1 + mCross((c + cPrev) * 0.5) + mGrade(Math.abs(h - hPrev) / ds) + mWet(wAt(x - ux * ds * 0.5, z - uz * ds * 0.5)) + obsK * obAt(x, z) + alongAt(x, z, ux, uz)
        + (lims ? limK * (Math.max(0, (c + cPrev) * 0.5 - lims[0]) + Math.max(0, Math.abs(h - hPrev) / ds - lims[1])) : gK * (Math.max(0, (c + cPrev) * 0.5 - 0.25) + Math.max(0, Math.abs(h - hPrev) / ds - 0.3))));
      hPrev = h; cPrev = c;
    }
    return cost;
  };
  const base = new Float32Array(NN * 16).fill(NaN);
  const edgeBase = (n, m) => {
    const key = n * 16 + m;
    if (!Number.isNaN(base[key])) return base[key];
    const i = n % NX, j = (n - i) / NX, [dx, dz] = ROUTE_MOVES[m], dl = Math.hypot(dx, dz);
    const c = stretchCost(X0 + i * cell, Z0 + j * cell, dx / dl, dz / dl, cell * dl);
    base[key] = c;
    return c;
  };

  // binary heap of (cost, id)
  let hk = new Float64Array(1 << 16), hv = new Int32Array(1 << 16), hn = 0, popped = 0;
  const hpush = (k, v) => {
    if (hn === hk.length) { const a = new Float64Array(hn * 2); a.set(hk); hk = a; const b = new Int32Array(hn * 2); b.set(hv); hv = b; }
    let c = hn++;
    while (c > 0) { const p = (c - 1) >> 1; if (hk[p] <= k) break; hk[c] = hk[p]; hv[c] = hv[p]; c = p; }
    hk[c] = k; hv[c] = v;
  };
  const hpop = () => {
    const rk = hk[0], rv = hv[0]; hn -= 1;
    if (hn > 0) {
      const k = hk[hn], v = hv[hn]; let c = 0;
      for (;;) { let l = c * 2 + 1; if (l >= hn) break; if (l + 1 < hn && hk[l + 1] < hk[l]) l += 1; if (hk[l] >= k) break; hk[c] = hk[l]; hv[c] = hv[l]; c = l; }
      hk[c] = k; hv[c] = v;
    }
    popped = rk; return rv;
  };

  const FN = 4, fine = cell / FN; // the seat grid: 1.25 m, aligned with the lattice
  const dist = new Float64Array(NN), prev = new Int32Array(NN), seatFine = new Int32Array(NN), avoid = new Float32Array(NN);
  const dEarly = new Float32Array(NN).fill(Infinity), trLeft = new Float32Array(NN), trPull = new Float32Array(NN), termKind = new Uint8Array(NN), lenA = new Float32Array(NN);
  const nodeOf = (x, z) => Math.max(0, Math.min(NZ - 1, Math.round((z - Z0) / cell))) * NX + Math.max(0, Math.min(NX - 1, Math.round((x - X0) / cell)));
  const FWc = Math.ceil((2 * seatR) / cell + 2), FW = FWc * FN + 1;

  // the seat: a fine search from the shed over the lattice-aligned 1.25 m grid out to seatR m
  const seatFor = (sx, sz, lims) => ({ sx, sz, lims, fa0: Math.floor((sx - seatR - X0) / cell) * FN, fb0: Math.floor((sz - seatR - Z0) / cell) * FN, fb: new Float32Array(FW * FW * 16).fill(NaN), fd: new Float64Array(FW * FW), fp: new Int32Array(FW * FW) });
  const seatSearch = (S) => {
    const { sx, sz, fa0, fb0, fb, fd, fp, lims } = S;
    fd.fill(Infinity); fp.fill(-1); hn = 0;
    const wx = (a) => X0 + (fa0 + a) * fine, wz = (b) => Z0 + (fb0 + b) * fine;
    const av = (a, b) => 1 + avoid[nodeOf(wx(a), wz(b))];
    let any = false;
    for (let reach = 2.6; reach <= 7 && !any; reach += 2.2) {
      for (let b = 0; b < FW; b += 1) for (let a = 0; a < FW; a += 1) {
        const x = wx(a), z = wz(b), L = Math.hypot(x - sx, z - sz);
        if (L > reach) continue;
        const c = L < 0.01 ? 0 : stretchCost(sx, sz, (x - sx) / L, (z - sz) / L, L, lims);
        if (c === Infinity) continue;
        const v = c * av(a, b) + L * 0.001;
        if (v < fd[b * FW + a]) { fd[b * FW + a] = v; hpush(v, b * FW + a); any = true; }
      }
    }
    while (hn) {
      const id = hpop();
      if (popped > fd[id]) continue;
      const a = id % FW, b = (id - a) / FW;
      for (let m = 0; m < 16; m += 1) {
        const aa = a + ROUTE_MOVES[m][0], bb = b + ROUTE_MOVES[m][1];
        if (aa < 0 || bb < 0 || aa >= FW || bb >= FW) continue;
        if (Math.hypot(wx(aa) - sx, wz(bb) - sz) > seatR) continue;
        const key = id * 16 + m;
        if (Number.isNaN(fb[key])) { const dl = Math.hypot(ROUTE_MOVES[m][0], ROUTE_MOVES[m][1]); fb[key] = stretchCost(wx(a), wz(b), ROUTE_MOVES[m][0] / dl, ROUTE_MOVES[m][1] / dl, fine * dl, lims); }
        if (fb[key] === Infinity) continue;
        const nn = bb * FW + aa, c = fd[id] + fb[key] * av(aa, bb);
        if (c < fd[nn]) { fd[nn] = c; fp[nn] = id; hpush(c, nn); }
      }
    }
  };

  // steep seats: straight departures at any heading (1 deg of the best is the difference between 0.50 and 0.60 on a 0.71 bank, and a staircase of
  // lattice moves cannot hold it), each ending within 8 m of a lattice node
  const buildRays = (S) => {
    S.rays = [];
    for (let t = 0; t < 360; t += 3) {
      const ux = Math.cos((t * Math.PI) / 180), uz = Math.sin((t * Math.PI) / 180);
      for (const Lc of [10, 16, 22]) {
        const c1 = stretchCost(S.sx, S.sz, ux, uz, Lc, S.lims);
        if (c1 === Infinity) continue;
        const px = S.sx + ux * Lc, pz = S.sz + uz * Lc, ni = Math.round((px - X0) / cell), nj = Math.round((pz - Z0) / cell), ends = [];
        for (let dj = -2; dj <= 2; dj += 1) for (let di = -2; di <= 2; di += 1) {
          const i = ni + di, j = nj + dj;
          if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
          const x = X0 + i * cell, z = Z0 + j * cell, L = Math.hypot(x - px, z - pz);
          if (L > 8) continue;
          const c2 = L < 0.01 ? 0 : stretchCost(px, pz, (x - px) / L, (z - pz) / L, L, S.lims);
          if (c2 !== Infinity) ends.push([j * NX + i, c2]);
        }
        if (ends.length) S.rays.push({ px, pz, c1, ends });
      }
    }
  };
  const seatRay = new Array(NN).fill(null);

  const search = (S) => {
    dist.fill(Infinity); prev.fill(-1); seatFine.fill(-1); seatRay.fill(null);
    seatSearch(S);
    hn = 0;
    for (let b = 0; b < FW; b += 1) for (let a = 0; a < FW; a += 1) {
      if ((S.fa0 + a) % FN !== 0 || (S.fb0 + b) % FN !== 0) continue;
      const d = S.fd[b * FW + a], i = (S.fa0 + a) / FN, j = (S.fb0 + b) / FN;
      if (d === Infinity || i < 0 || j < 0 || i >= NX || j >= NZ) continue;
      const n = j * NX + i;
      dist[n] = d; seatFine[n] = b * FW + a; lenA[n] = 1.1 * Math.hypot(X0 + i * cell - S.sx, Z0 + j * cell - S.sz); hpush(d, n);
    }
    if (S.steep) {
      if (!S.rays) buildRays(S);
      for (const r of S.rays) {
        const f = 1 + avoid[nodeOf(r.px, r.pz)];
        for (const [n, c2] of r.ends) { const d = r.c1 * f + c2 + 0.001; if (d < dist[n]) { dist[n] = d; seatFine[n] = -2; seatRay[n] = r; lenA[n] = 1.05 * Math.hypot(X0 + (n % NX) * cell - S.sx, Z0 + Math.floor(n / NX) * cell - S.sz); hpush(d, n); } }
      }
    }
    while (hn) {
      const v = hpop();
      if (v >= NN) return { end: v - NN, kind: termKind[v - NN] };
      const n = v;
      if (popped > dist[n]) continue;
      const i = n % NX, j = (n - i) / NX;
      let tk = Infinity, kind = 0;
      const inB = inBoard(X0 + i * cell, Z0 + j * cell);
      if (inB) { tk = dist[n] + S.slack; kind = 0; }
      if (dEarly[n] <= joinM && lenA[n] + dEarly[n] + trLeft[n] <= S.lenCap) { const k2 = dist[n] + (trunkK + S.lam) * trLeft[n] + trPull[n] + 1.5 * dEarly[n]; if (k2 < tk) { tk = k2; kind = 1; } }
      if (tk < Infinity) { termKind[n] = kind; hpush(tk, n + NN); }
      if (inB) continue;
      for (let m = 0; m < 16; m += 1) {
        const ii = i + ROUTE_MOVES[m][0], jj = j + ROUTE_MOVES[m][1];
        if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ) continue;
        const e = edgeBase(n, m);
        if (e === Infinity) continue;
        const nn = jj * NX + ii;
        const dl = cell * Math.hypot(ROUTE_MOVES[m][0], ROUTE_MOVES[m][1]);
        const c = dist[n] + e * (1 + avoid[nn]) + S.lam * dl + 0.5 * (S.pull[n] + S.pull[nn]) * dl;
        if (c < dist[nn]) { dist[nn] = c; prev[nn] = n; seatFine[nn] = -1; lenA[nn] = lenA[n] + cell * Math.hypot(ROUTE_MOVES[m][0], ROUTE_MOVES[m][1]); hpush(c, nn); }
      }
    }
    return null;
  };

  // the pull toward today's line (W80 fix 4): for each shed, a cost per metre at each node, `pullK` x the distance from the shed's straight line to the board
  // beyond `pullFree`; a shed marked `noLine` (today's line crosses venue ground and is dropped) has none
  const pullOf = new Map();
  // W81: a pull for each shed from its own figures: today's straight line is a good guide where it runs on gentle ground and a poor one where it climbs, so the
  // pull falls from `pullK` to `pullLo` as the 90th percentile of the grade along that line (at 2.5 m stations) rises from `steepA` to `steepB`
  const lineP90 = sheds.map((sh) => {
    const qx = Math.max(0, Math.min(extent.x, sh.x)), qz = Math.max(0, Math.min(extent.z, sh.z)), L = Math.hypot(qx - sh.x, qz - sh.z), n = Math.max(1, Math.floor(L / 2.5)), g = [];
    for (let k = 1; k <= n; k += 1) g.push(Math.abs(hAt(sh.x + ((qx - sh.x) * k) / n, sh.z + ((qz - sh.z) * k) / n) - hAt(sh.x + ((qx - sh.x) * (k - 1)) / n, sh.z + ((qz - sh.z) * (k - 1)) / n)) / (L / n || 1));
    g.sort((a, b) => a - b);
    return g[Math.floor(0.9 * (g.length - 1))];
  });
  // and a shed whose line climbs (90th percentile of its grade at `steepFrom` or more) pays `steepGW` x for grade
  const baseWG = shedWG.map((w, si) => (lineP90[si] >= steepFrom ? w * steepGW : w));
  baseWG.forEach((w, si) => { shedWG[si] = w; });
  // a shed whose line has no other shed's line within `stackM` m for `stackLen` m is alone on its ground (`pullAlone` for it, when set): nothing shares its trunk to be held there
  const stacked = sheds.map((sh, si) => {
    const qx = Math.max(0, Math.min(extent.x, sh.x)), qz = Math.max(0, Math.min(extent.z, sh.z)), L = Math.hypot(qx - sh.x, qz - sh.z), n = Math.max(1, Math.floor(L / 5));
    return sheds.reduce((mates, o, oi) => {
      if (oi === si) return mates;
      const px = Math.max(0, Math.min(extent.x, o.x)), pz = Math.max(0, Math.min(extent.z, o.z));
      let near = 0;
      for (let k = 0; k <= n; k += 1) if (distToPolyline(sh.x + ((qx - sh.x) * k) / n, sh.z + ((qz - sh.z) * k) / n, [[o.x, o.z], [px, pz]]).d <= stackM) near += 1;
      return mates + (near * (L / n) >= stackLen ? 1 : 0);
    }, 0);
  });
  const pkOf = (si) => {
    if (pullKs && Number.isFinite(pullKs[si])) return pullKs[si];
    if (pullAlone !== null && stacked[si] < crowdN) return pullAlone;
    return pullLo === null ? pullK : pullLo + (pullK - pullLo) * (1 - smoothstep(steepA, steepB, lineP90[si]));
  };
  const pullFor = (si) => {
    if (pullOf.has(si)) return pullOf.get(si);
    const sh = sheds[si], P = new Float32Array(NN), pk = pkOf(si);
    if (pk > 0 && !sh.noLine) {
      const qx = Math.max(0, Math.min(extent.x, sh.x)), qz = Math.max(0, Math.min(extent.z, sh.z)), dx = qx - sh.x, dz = qz - sh.z, l2 = dx * dx + dz * dz;
      for (let j = 0; j < NZ; j += 1) for (let i = 0; i < NX; i += 1) {
        const x = X0 + i * cell - sh.x, z = Z0 + j * cell - sh.z, t = l2 > 0 ? Math.max(0, Math.min(1, (x * dx + z * dz) / l2)) : 0;
        P[j * NX + i] = pk * Math.max(0, Math.hypot(x - dx * t, z - dz * t) - pullFree);
      }
    }
    pullOf.set(si, P);
    return P;
  };

  const corridors = [];
  const smoothed = [];  // stations of each finished corridor (the index is the corridor's)
  const remOf = [];     // for each station, the length of trunk left to the board (a spur carries its trunk's)
  const rootBoard = []; // where each corridor's trunk meets the board
  const polyLen = (p) => { let l = 0; for (let k = 1; k < p.length; k += 1) l += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]); return l; };
  const rr = Math.ceil((joinM + cell) / cell);
  // the join raster of the corridors a shed may join: the distance to the nearest one's centreline and the trunk it has left to the board there
  // a shed that joins a trunk pays its pull on the trunk's remainder too: `rp[c][k]` is that cost from station k of corridor c to the board, along the trunk
  const pullPt = (si, x, z) => {
    const sh = sheds[si];
    if (!(pkOf(si) > 0) || sh.noLine) return 0;
    const dx = Math.max(0, Math.min(extent.x, sh.x)) - sh.x, dz = Math.max(0, Math.min(extent.z, sh.z)) - sh.z, l2 = dx * dx + dz * dz, px = x - sh.x, pz = z - sh.z;
    const t = l2 > 0 ? Math.max(0, Math.min(1, (px * dx + pz * dz) / l2)) : 0;
    return pkOf(si) * Math.max(0, Math.hypot(px - dx * t, pz - dz * t) - pullFree);
  };
  const remPullFor = (si) => {
    const out = [];
    corridors.forEach((cor, c) => {
      const q = smoothed[c], r = new Float64Array(q.length);
      if (cor.parent !== -1) {
        let bk = 0, bd = Infinity;
        smoothed[cor.parent].forEach((p, k) => { const d = Math.hypot(p[0] - cor.join[0], p[1] - cor.join[1]); if (d < bd) { bd = d; bk = k; } });
        r[q.length - 1] = out[cor.parent][bk];
      }
      for (let k = q.length - 2; k >= 0; k -= 1) r[k] = r[k + 1] + 0.5 * (pullPt(si, q[k][0], q[k][1]) + pullPt(si, q[k + 1][0], q[k + 1][1])) * Math.hypot(q[k + 1][0] - q[k][0], q[k + 1][1] - q[k][1]);
      out.push(r);
    });
    return out;
  };
  const fillEarly = (elig, si) => {
    dEarly.fill(Infinity);
    const rp = elig.length ? remPullFor(si) : null;
    for (const c of elig) {
      smoothed[c].forEach((q, k) => {
        const ci2 = Math.round((q[0] - X0) / cell), cj2 = Math.round((q[1] - Z0) / cell);
        for (let dj = -rr; dj <= rr; dj += 1) for (let di = -rr; di <= rr; di += 1) {
          const i = ci2 + di, j = cj2 + dj;
          if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
          const d = Math.hypot(X0 + i * cell - q[0], Z0 + j * cell - q[1]), n = j * NX + i;
          if (d < dEarly[n]) { dEarly[n] = d; trLeft[n] = remOf[c][k]; trPull[n] = trunkPull * rp[c][k]; }
        }
      });
    }
  };

  // the trunk length left to the board at a join (0 for a path that reaches the board itself)
  const tailOf = (parent, join) => {
    if (parent === -1) return 0;
    let bk = 0, bd = Infinity;
    smoothed[parent].forEach((q, k) => { const d = Math.hypot(q[0] - join[0], q[1] - join[1]); if (d < bd) { bd = d; bk = k; } });
    return remOf[parent][bk];
  };
  const LAMS = [0, 0.25, 0.6, 1.2, 2.4, 5, 10, 20, 40];

  // one shed's way to the board, or onto one of the corridors `elig` (already finished) when the whole path is at most `cap` m
  const pathFor = (si, elig, cap, slack, capWhole = Infinity) => {
    const sh = sheds[si];
    wG = shedWG[si]; wC = shedWC[si];
    const sg = gradMag(sh.x, sh.z) / Math.SQRT2; // the best max(cross-slope, grade) the ground allows at the seat
    const S = seatFor(sh.x, sh.z, [Math.max(0.22, sg + 0.02), Math.max(0.25, sg + 0.02)]); S.steep = sg > 0.2; // the seat search pays heavily for any metre over these
    S.lenCap = cap; S.slack = slack; S.lam = 0; S.pull = pullFor(si);
    LP.x0 = Math.round(sh.x) - (seatR + 8); LP.z0 = Math.round(sh.z) - (seatR + 8); LP.on = false;
    for (let j = 0; j < LPN; j += 1) for (let i = 0; i < LPN; i += 1) LP.H[j * LPN + i] = ground(LP.x0 + i, LP.z0 + j);
    LP.on = true;
    fillEarly(elig, si);
    let best = null;
    // the whole path is bounded by `capWhole` (the spur and what its trunk has left): the search pays `lam` more for every metre until it fits
    for (const lam of LAMS) {
    S.lam = lam;
    let cur = null;
    avoid.fill(0);
    for (let attempt = 0; attempt < tries; attempt += 1) {
      const r = search(S);
      if (!r) break;
      // the path, shed first: the fine seat path, then the lattice nodes
      const nodes = [];
      for (let n = r.end; n !== -1; n = prev[n]) nodes.push(n);
      nodes.reverse();
      const fineIds = [];
      const ray = seatFine[nodes[0]] === -2 ? seatRay[nodes[0]] : null;
      if (!ray) for (let f = seatFine[nodes[0]]; f !== -1; f = S.fp[f]) fineIds.push(f);
      fineIds.reverse();
      let pp = [[sh.x, sh.z], ...(ray ? [[ray.px, ray.pz]] : []), ...fineIds.map((id) => [X0 + (S.fa0 + (id % FW)) * fine, Z0 + (S.fb0 + Math.floor(id / FW)) * fine]), ...nodes.slice(fineIds.length ? 1 : 0).map((n) => [X0 + (n % NX) * cell, Z0 + Math.floor(n / NX) * cell])];
      let parent = -1, join = null;
      if (r.kind === 1) {
        // end on the nearest eligible corridor's smoothed centreline
        const e = pp[pp.length - 1];
        let bj = null;
        for (const c of elig) { const q = distToPolyline(e[0], e[1], smoothed[c]); if (!bj || q.d < bj.d) bj = { ...q, c }; }
        pp.push([bj.x, bj.z]); parent = bj.c; join = [bj.x, bj.z];
      } else {
        // clip at the board's edge: the last node is inside the square; walk back to the crossing
        const e = pp[pp.length - 1];
        let k = pp.length - 2;
        while (k > 0 && inBoard(pp[k][0], pp[k][1])) k -= 1;
        const p = pp[k];
        if (!inBoard(p[0], p[1]) && inBoard(e[0], e[1])) {
          let lo = 0, hi = 1;
          for (let q = 0; q < 24; q += 1) { const mid = (lo + hi) / 2; if (inBoard(p[0] + (e[0] - p[0]) * mid, p[1] + (e[1] - p[1]) * mid)) hi = mid; else lo = mid; }
          pp = pp.slice(0, k + 1); pp.push([p[0] + (e[0] - p[0]) * hi, p[1] + (e[1] - p[1]) * hi]);
        }
      }
      // drop points closer than 0.5 m to the one before
      pp = pp.filter((q, k) => k === 0 || Math.hypot(q[0] - pp[k - 1][0], q[1] - pp[k - 1][1]) >= 0.5 || k === pp.length - 1);
      if (pp.length < 2) pp = [[sh.x, sh.z], [sh.x + 1, sh.z]];
      let st = resampleRoute(pp, ROUTE_STATION);
      const arc = [0];
      for (let k = 1; k < st.length; k += 1) arc.push(arc[k - 1] + Math.hypot(st[k][0] - st[k - 1][0], st[k][1] - st[k - 1][1]));
      const wts = arc.map((s) => 0.9 * smoothstep(4, 30, s) + 0.1 * smoothstep(0, 10, s));
      for (let it = 0; it < 40; it += 1) {
        const nx = st.map((q) => q.slice());
        for (let k = 1; k < st.length - 1; k += 1) {
          const ax = 0.25 * st[k - 1][0] + 0.5 * st[k][0] + 0.25 * st[k + 1][0], az = 0.25 * st[k - 1][1] + 0.5 * st[k][1] + 0.25 * st[k + 1][1];
          nx[k][0] = st[k][0] + wts[k] * (ax - st[k][0]); nx[k][1] = st[k][1] + wts[k] * (az - st[k][1]);
        }
        st = nx;
      }
      // check what the readers and the ribbon will see (the simplified line, at 1.25 m so both phases of a 2.5 m station are met) against the limits
      let worst = 0, hard = 0; const badAt = [], badHit = [];
      {
        const chk = resampleRoute(rdpKeep(st, ROUTE_RDP_TOL, ROUTE_RDP_MAX), ROUTE_STATION / 2);
        let s = 0;
        for (let k = 0; k < chk.length; k += 1) {
          if (k > 0) s += Math.hypot(chk[k][0] - chk[k - 1][0], chk[k][1] - chk[k - 1][1]);
          if (k < 2) continue;
          const a = chk[k - 1], b = chk[Math.min(chk.length - 1, k + 1)], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          const c = crossAt(chk[k][0], chk[k][1], (b[0] - a[0]) / d, (b[1] - a[1]) / d);
          const g = Math.abs(hAt(chk[k][0], chk[k][1]) - hAt(chk[k - 2][0], chk[k - 2][1])) / (Math.hypot(chk[k][0] - chk[k - 2][0], chk[k][1] - chk[k - 2][1]) || 1);
          const near = s <= 20;
          const ex = Math.max(0, c - (near ? Math.max(0.22, sg + 0.02) : 0.22)) + Math.max(0, g - (near ? Math.max(0.25, sg + 0.02) : 0.25));
          hard += Math.max(0, c - (near ? Math.max(0.25, sg + 0.05) : 0.25)) + Math.max(0, g - (near ? Math.max(0.3, sg + 0.05) : 0.3));
          if (ex > 0) { badAt.push(chk[k]); worst += ex; }
        }
      }
      const hits = hitsAlong(st);
      const slope = worst;
      if (hitAvoid > 0) { worst += 0.02 * hits.n; for (const k of hits.at) badHit.push(st[k]); }
      const whole = polyLen(st) + tailOf(parent, join), ok = whole <= capWhole;
      const cand = { worst, slope, hard, st, parent, join, hits: hits.n, whole, ok, lam };
      if (!cur || (cand.ok && !cur.ok) || (cand.ok === cur.ok && (cand.ok ? worst < cur.worst : whole < cur.whole))) cur = cand;
      if (worst === 0) break;
      const mark = (q, rad, k0) => {
        const ci = Math.round((q[0] - X0) / cell), cj = Math.round((q[1] - Z0) / cell);
        for (let dj = -rad; dj <= rad; dj += 1) for (let di = -rad; di <= rad; di += 1) {
          const i = ci + di, j = cj + dj;
          if (i >= 0 && j >= 0 && i < NX && j < NZ) avoid[j * NX + i] += k0 / (1 + Math.hypot(di, dj));
        }
      };
      for (const q of badAt) mark(q, 3, avoidK);
      for (const q of badHit) mark(q, 1, avoidK * hitAvoid);
    }
    if (cur && (!best || (cur.ok && !best.ok) || (cur.ok === best.ok && !cur.ok && cur.whole < best.whole))) best = cur;
    if (best && best.ok) break;
    }
    LP.on = false;
    return best;
  };

  // 1. each shed alone to the board, with the same costs: its length L0 and the point where it meets the board
  // today's line is the straight one to the board's nearest point: a path is at most `todayCap` x its length (unless the shed is marked `noLine`: today's
  // line crosses venue ground and is dropped, and the lone path's bound alone applies)
  const todayLen = sheds.map((s) => Math.hypot(s.x - Math.max(0, Math.min(extent.x, s.x)), s.z - Math.max(0, Math.min(extent.z, s.z))));
  const capToday = sheds.map((s, si) => (s.noLine ? Infinity : todayCap * todayLen[si]));
  const raised = sheds.map(() => 0);
  const loneBest = sheds.map((_, si) => {
    let b = pathFor(si, [], Infinity, 0, capToday[si]);
    // W81: a shed whose lone path breaks the limits (`hard`) pays more for grade and cross-slope (`hardGradeW`, `hardCrossW`), kept while the excess falls
    if ((hardGradeW !== 1 || hardCrossW !== 1) && b && b.hard > 0) {
      shedWG[si] = baseWG[si] * hardGradeW; shedWC[si] = crossW * hardCrossW;
      const b2 = pathFor(si, [], Infinity, 0, capToday[si]);
      if (b2 && b2.ok && b2.hard < b.hard) b = b2; else { shedWG[si] = baseWG[si]; shedWC[si] = crossW; }
    }
    // W81: where the cap forces a grade over the limit (`hard`), this shed's cap is raised in steps (`raiseCaps`, the last the most), and kept while the excess falls
    if (raiseCaps && Number.isFinite(capToday[si])) {
      for (const f of raiseCaps) {
        if (!b || !(b.hard > 0)) break;
        const cap = f * todayLen[si], b2 = pathFor(si, [], Infinity, 0, cap);
        if (b2 && b2.ok && b2.hard < b.hard) { b = b2; capToday[si] = cap; raised[si] = f; }
      }
    }
    return b;
  });
  const L0 = loneBest.map((b) => (b ? polyLen(b.st) : 0));
  // W81: the sharpest turn (degrees) of a path at the drawn line's 2.5 m stations: a spur that doubles back on itself is no join
  const maxTurn = (st) => {
    const rs = resampleRoute(rdpKeep(st, ROUTE_RDP_TOL, ROUTE_RDP_MAX), ROUTE_STATION);
    let mx = 0;
    for (let k = 1; k < rs.length - 1; k += 1) {
      const ax = rs[k][0] - rs[k - 1][0], az = rs[k][1] - rs[k - 1][1], bx = rs[k + 1][0] - rs[k][0], bz = rs[k + 1][1] - rs[k][1], la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
      if (la > 0 && lb > 0) mx = Math.max(mx, Math.acos(Math.max(-1, Math.min(1, (ax * bx + az * bz) / (la * lb)))) * 180 / Math.PI);
    }
    return mx;
  };
  const bearing = (x0, z0, p) => Math.atan2(p[1] - z0, p[0] - x0);
  // 2. the order: the nearest first, so a farther shed whose way runs over the same ground joins the trunk a nearer one laid; a shed may join only
  //    a corridor whose trunk meets the board within clusterM of its own lone path's point, or lies within bearingDeg of its own bearing to it, or
  //    that its lone path shares 30 m of ground with (within 12 m), and only if its whole path (spur plus what the trunk has left, at full
  //    length) is at most `detour` x L0; otherwise it keeps its own line to the board, which later sheds may join
  const order = sheds.map((_, si) => si).filter((si) => loneBest[si]).sort((a, b) => L0[a] - L0[b] || a - b);
  const ratios = [];
  let tooSteep = 0;
  for (const si of order) {
    const sh = sheds[si], own = loneBest[si].st.at(-1);
    let best = loneBest[si], capped = 0, stack = false;
    const elig = [];
    if (!lone) {
      for (let c = 0; c < corridors.length; c += 1) {
        const rb = rootBoard[c];
        let da = Math.abs(bearing(sh.x, sh.z, rb) - bearing(sh.x, sh.z, own));
        da = Math.min(da, 2 * Math.PI - da);
        let shared = 0; // stations of its own lone path within 12 m of this corridor: the two lie on the same ground
        for (const q of loneBest[si].st) if (distToPolyline(q[0], q[1], smoothed[c]).d <= 12) shared += 1;
        let lying = 0; // stations of its lone path on this corridor (within 2.95 m): left alone they would be drawn twice
        for (const q of loneBest[si].st) if (distToPolyline(q[0], q[1], smoothed[c]).d <= 2.95) lying += 1;
        if (lying >= 6) stack = true;
        if (Math.hypot(rb[0] - own[0], rb[1] - own[1]) <= clusterM || (da * 180) / Math.PI <= bearingDeg || shared >= shareMin || lying >= 6) elig.push(c);
      }
    }
    // the join is searched with the whole path capped at `detour` x L0 on the lattice's lengths, which run a few percent over the smoothed line's: a
    // cap that lets the smoothed path through over the bound is lowered and the shed searched again
    // W81: a join whose spur keeps within the lone path's grade is taken at the shed's cap; failing that, at the raised caps in turn (`raiseCaps`); a shed whose
    // lone path lies on a corridor (`stack`) otherwise takes the first join that fits, so no line is drawn twice
    const joinCaps = [capToday[si]];
    if (raiseCaps && Number.isFinite(capToday[si])) for (const r of raiseCaps) if (r * todayLen[si] > capToday[si]) joinCaps.push(r * todayLen[si]);
    let fallback = null, usedCap = 0, fbCap = 0; // the cap the join was taken at (the raised cap, when the shed's own was too short)
    for (const capT of joinCaps) {
      let got = false;
      for (let f = 1.12; f > 0.7 && elig.length; f -= 0.06) {
        const capW = Math.min(detour * L0[si], capT);
        const b2 = pathFor(si, elig, Math.min(capW * f, detour * L0[si] * f), joinSlack * L0[si], capW);
        if (!b2 || b2.parent === -1) break;
        const whole = polyLen(b2.st) + tailOf(b2.parent, b2.join);
        if (whole <= capW && maxTurn(b2.st) <= joinTurn) {
          if (b2.hard <= best.hard * 1.25 + 0.05) { best = b2; got = true; usedCap = capT; break; }
          if (stack && !fallback) { fallback = b2; fbCap = capT; }
          if (stack && joinCaps.length === 1) break;
        }
        capped = 1;
      }
      if (got) { fallback = null; break; }
    }
    if (fallback) { best = fallback; usedCap = fbCap; }
    if (best.slope > 0) tooSteep += 1;
    const ci = corridors.length, st = best.st;
    smoothed.push(st);
    // the trunk length left to the board at each station (a spur carries its trunk's)
    let total = 0; const arcs = [0];
    for (let k = 1; k < st.length; k += 1) { total += Math.hypot(st[k][0] - st[k - 1][0], st[k][1] - st[k - 1][1]); arcs.push(total); }
    const tail = tailOf(best.parent, best.join);
    const rem = arcs.map((a) => total - a + tail);
    remOf.push(rem);
    rootBoard.push(best.parent === -1 ? st.at(-1) : rootBoard[best.parent]);
    const simple = rdpKeep(st, ROUTE_RDP_TOL, ROUTE_RDP_MAX);
    corridors.push({ shed: si, pts: st, simple, parent: best.parent, join: best.join, worst: best.worst, hits: best.hits, len0: L0[si], lam: best.lam, slope: best.slope, hard: best.hard, raised: Math.max(raised[si], Number.isFinite(usedCap) && todayLen[si] > 0 ? usedCap / todayLen[si] : 0), ok: best.ok, length: rem[0], ratio: L0[si] > 0 ? rem[0] / L0[si] : 1, board: rootBoard[ci], loneBoard: own, capped });
    ratios.push(L0[si] > 0 ? rem[0] / L0[si] : 1);
  }
  const segments = [];
  corridors.forEach((c, ci) => {
    for (let k = 1; k < c.simple.length; k += 1) segments.push({ x0: c.simple[k - 1][0], z0: c.simple[k - 1][1], x1: c.simple[k][0], z1: c.simple[k][1], c: ci });
  });
  return { corridors, segments, stats: { sheds: sheds.length, routed: corridors.length, nodes: NN, tooSteep, joins: corridors.filter((c) => c.parent !== -1).length, trunks: corridors.filter((c) => c.parent === -1).length, maxRatio: ratios.length ? Math.max(...ratios) : 1, capped: corridors.filter((c) => c.capped).length, raised: raised.filter((f) => f > 0).length } };
}
