// District Deck — industrial fidelity lab (V3.32).
//
// Renders `factory-light` and `warehouse-brick` from the runtime building kit against the
// runtime material library, lighting rig and post chain, so a vision critic judges the same
// pixels the board draws. Sibling of `residential-lab.js`; the contract is deliberately
// identical so `capture-industrial-aaa.mjs` is a near-copy of `capture-residential.mjs`.
//
//   ?mode=hero&id=<id>&view=<three-quarter|dock|flank|rear|detail|street|front|board>
//   ?mode=row                                — both subjects on one industrial street
//   ?mode=sheet                              — both subjects, iso grid
//
// Switches: ?studio=1  ?tod=<0..1>  ?hud=1  ?post=off  ?quality=<high|medium|low>
//           ?ids=a,b   ?facade=<0..3>  ?district=<districtId>  ?dof=<0..1>
//
// `?facade=` is a graded switch, not a debug one. `industrial/index.js` alternates the factory's
// roof by façade — closed mono on 0 and 2, sawtooth on 1 and 3 — so half of the V332 §2d product
// contract only exists on odd façades. A run that never leaves the default grades one of the two
// silhouettes and reports on both. `capture-industrial-aaa.mjs --facade <n>` drives it, and both
// the tag directory and the plate filename carry the number so an odd-façade plate cannot be
// mistaken for the default one.
//
// The lab goes through `BuildingKit` and nothing else. It does NOT import from
// `render/industrial/**` directly, so it renders whatever the board renders — the new
// procedural industrial kit once `industrial/index.js` registers its builders, and the legacy
// kit path until then. That keeps the harness testable while the scaffold seat is mid-write,
// and it is the only way a plate can honestly claim to be "the same pixels the board draws".
//
// Deterministic: no Math.random, no Date.now in scene construction. Frames are driven by hand
// through window.__indLab.step(n) so a headless capture never races the RAF loop.

import * as THREE from 'three';
import { TILE, STOREY } from './core/grid.js';
import { ARCHETYPES } from './core/content.js';
import { MaterialLibrary } from './render/materials.js';
import { BuildingKit } from './render/building-kit.js';
import { LightingRig, sunDirection } from './render/lighting.js';
import { PostChain } from './render/post.js';
import { SkyDome } from './render/sky.js';

/** The two V3.32 subjects, and nothing else. */
export const INDUSTRIAL_IDS = Object.freeze(['factory-light', 'warehouse-brick']);

// FNV-1a and the residential core's avalanche, inlined.
//
// The lab deliberately does not import `render/residential/core.js` or `render/industrial/
// core.js` for these two functions. Importing a lane's core would make the harness fail to load
// whenever that lane is mid-write — which is exactly the window this lab was built in — and
// `blind-pair.mjs` already sets the precedent of carrying its own copy for the same reason.
// The numbers match the residential lab's backdrop distribution byte for byte.
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function unitFrom(hash, salt) {
  let h = (hash ^ Math.imul(salt, 0x9e3779b9)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

const params = new URLSearchParams(location.search);
const MODE = params.get('mode') ?? 'hero';
const ID = params.get('id') ?? 'factory-light';
const VIEW = params.get('view') ?? 'three-quarter';
// An industrial district rather than a terrace one: `districtId` only biases the wall family,
// but a bond store shot with a Brighton wall bias is not the board's own building.
const DISTRICT = params.get('district') ?? 'richmond-flat';
const FACADE = Number(params.get('facade') ?? 0);
// `?tier=worn|standard|renovated` — the condition tier the industrial kit varies its yard,
// boundary, side roof and rooftop plant on. Without this the lab could only ever draw `standard`,
// so the renovated exterior — a cleared yard, an upgraded boundary, landscaping and apartment
// plant — had no capture path at all and had to be shot through a patched scratch server. Null
// means "let the kit decide", which is `standard`, so every existing URL is unchanged.
const TIER = ['worn', 'standard', 'renovated'].includes(params.get('tier'))
  ? params.get('tier')
  : null;
// 0.42 rather than the residential lab's 0.28. The residential number was tuned so a front and
// a right elevation separate on a house with two similar-sized faces; an industrial shed has one
// long flank and one dock face, and at 0.28 the dock face — the elevation the whole product
// contract lives on — sat in its own canopy shadow. 0.42 is also what the retired quality-loop
// industrial capture drove the board to, so the plates stay comparable to the board's own frames.
// The GROUND_LIGHT_GAIN constant below is measured at this value; see its note.
const TIME_OF_DAY = Number(params.get('tod') ?? 0.42);
const QUALITY = params.get('quality') ?? 'high';
const POST_ON = params.get('post') !== 'off';

const canvas = document.getElementById('lab');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !POST_ON, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = POST_ON ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.32;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#4a7ab0');

// The lab stage is one board-block wide so the rig's shadow band and env bake match the
// board's own numbers rather than a bespoke studio setup. Industrial parcels are larger than
// residential ones and `mode=row` puts two of them side by side, so the stage is wider than the
// residential lab's six tiles.
const extent = { x: TILE * 9, z: TILE * 7 };
const centre = new THREE.Vector3(extent.x / 2, 0, extent.z / 2);

const materials = new MaterialLibrary({ quality: QUALITY });
const kit = new BuildingKit(materials, { quality: QUALITY });

const lighting = new LightingRig(scene, extent, { quality: QUALITY, timeOfDay: TIME_OF_DAY, renderer });
lighting.bakeEnvironment();

// `?studio=1` shoots the model the way the reference plates are shot: a warm cream seamless,
// nothing else in frame, the yard's own slab carrying the model.
//
// The residential lab's first version of this only changed the background colour and left the
// textured concrete ground, the road band and the sky in place. A critic running the blind A/B
// then identified the in-engine render in twelve plates out of twelve WITHOUT LOOKING AT A
// SINGLE BUILDING — every reference is a warm cream seamless, every one of ours was a flat grey
// infinite plane with paver decals and a dark road strip. A blind test whose two sides are
// distinguishable by their backdrop measures nothing. So studio mode replaces the whole context:
// untextured warm plane, no road, no sky. V332 §4 carries this forward as leak two of five.
const STUDIO = params.get('studio') === '1';
if (STUDIO) scene.background = new THREE.Color('#e9e2d6');

const sky = new SkyDome(scene, extent, { quality: QUALITY, reducedMotion: true, timeOfDay: TIME_OF_DAY });
// Studio has no sky: the reference plates are shot on a seamless, and a dome behind the model
// is both a tell and the source of the blue cast that flattened every earlier plate.
for (const key of ['root', 'mesh', 'dome']) {
  const node = sky?.[key];
  if (node && typeof node === 'object' && 'visible' in node) node.visible = !STUDIO;
}

// The seamless value varies per subject, deterministically. Four blind critics defeated the
// residential r17 A/B with a single pixel sample: our backdrop corners read the same byte triple
// in every plate — (183,177,170) — while the reference field varies plate to plate. A constant is
// a signature.
//
// Hoisted above the ground plane so the ground can be derived from the same numbers. On the
// residential lane it could not be, and that was the whole horizon problem: the shell's
// brightness moved with the subject seed while the ground was a fixed `#e2dacc`, so the two could
// only ever agree for one seed and every other plate carried a visible line across it. A blind
// critic listed "a conspicuous horizon line" among the things identifying our side in all seven
// pairs.
//
// THE RANGE IS NOW CAPPED AT THE COMPOSITOR'S OWN FIELD, AND THAT IS LEAK SIX.
//
// `blind-pair.mjs` flood-fills the backdrop from the four corners and REPAINTS what it reaches to
// exactly `rgb(222,214,203)` on both sides. Our seamless shot at `rgb(236,227,216)` — brighter
// than the target — so every patch of backdrop the fill could not reach kept the brighter cream
// and survived into the composite as a glow: the cells between fence bars, the gaps in
// chain-link, the space enclosed between a building and its boundary. The r1 harsh critic counted
// non-field pixels above luminance 228 per panel and got ours at 0.90–2.12 % against the
// reference's 0.00–0.16 %, zero overlap across sixteen panels; a threshold at 0.5 % sorts all
// eight pairs without looking at a building, and the masks trace the boundary fence runs. The
// blind gate went 0/8 with that sitting under it.
//
// So the field is authored AT the compositor's target and varies only downward from it. An
// enclosed backdrop pixel is then within a few levels of the value the fill would have painted
// there, and carries no information either way.
//
// The per-subject variation SURVIVES, because the leak it was bought against is real: four blind
// critics defeated residential r17 with a single pixel sample when every plate's corners read the
// same byte triple. Both constraints are met by varying downward inside a narrow band — every
// modulation below is a factor at or under 1, so no channel can ever exceed the target, and the
// spread is still five or six levels wide, which is plenty to defeat a constant-byte-triple
// sample. Nothing here changes the compositor, which is orchestrator-owned and is not the thing
// that was wrong.
const FIELD_TARGET_SRGB = Object.freeze([222, 214, 203]);
/** sRGB byte → linear, matching what `THREE.Color.setRGB` takes in the working colour space. */
function srgbToLinear(byteValue) {
  const s = byteValue / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
const FIELD_TARGET = FIELD_TARGET_SRGB.map(srgbToLinear);
// AUTHORED IS NOT RENDERED, AND THE ERROR IS NOT A CONSTANT FACTOR. The shell is an unlit
// `MeshBasicMaterial`, so the naive expectation is that it renders the byte it is given — but the
// post chain grades the whole frame, and a plate authored at the target came back at
// `rgb(230,219,207)`, eight levels over.
//
// The first correction was a flat per-channel ratio of authored-linear to rendered-linear,
// (1.108, 1.070, 1.055), and it moved the field three levels instead of eight. The grade has a
// SHOULDER: measured across three authored values the rendered response has a slope of 0.33–0.37,
// not 1, so every flat gain lands short and a second flat gain lands short again. Chasing that
// one capture round at a time is the expensive way; `__indLab.setFieldBias()` bisects it inside a
// single page load.
//
// RE-DERIVED AGAIN after the lens vignette was turned off (see the note beside `post.vignette`).
// The vignette was darkening the corners by about eighteen levels, so every number measured at a
// corner while it was on was measuring the artefact as much as the field. With it off the
// backdrop is one value across the frame and a corner reading is finally the field's reading:
// bias 1.0/0.9/0.8/0.7/0.6/0.5 gave corners of (240,231,219)/(236,228,216)/(231,224,213)/
// (226,219,210)/(221,214,206)/(214,208,201), interpolated per channel onto (222,214,203) at
// 0.62/0.60/0.54, which is what these numbers are.
//
// RE-DERIVE RATHER THAN RE-GUESS if `post.js`, the grade or the lighting profile moves. The
// procedure is four lines of Playwright and needs no file that has to survive: open the lab at
// `?mode=hero&id=factory-light&view=three-quarter&studio=1` at any viewport, then for each bias on
// a ladder call `__indLab.setFieldBias(bias)`, `__indLab.step(4)`, screenshot, and read a corner
// pixel. Interpolate each channel onto (222,214,203), DIVIDE these three numbers by the bias each
// channel solved at, and verify at bias 1. Do NOT calibrate with a vignette on — see the note
// beside `post.vignette`, which is what made the first two attempts wrong.
//
// RE-DERIVED AGAIN for the V332 grade (see `GRADE_TOE`), and this is the pass the grade change
// could not be shipped without: the backdrop goes through the same LUT the building does, so a
// toe that darkens blue by twenty-nine levels on a wall darkens it on the seamless too. At the old
// constants the field came back at (219.3, 211.4, 186.4) against a target of (222, 214, 203) —
// seventeen levels dark in blue, which is a cool cast across every studio plate and a new tell in
// its own right.
//
// THE LADDER HAS TO RUN UPWARD NOW, and finding that out is worth the line: every channel landed
// BELOW the target at bias 1, so the 1.0 → 0.5 ladder the old note prescribes brackets nothing and
// an honest solver returns null rather than extrapolating up a curve with a shoulder in it.
// Measured at 0.8/1.0/1.2/1.4/1.6/1.8/2.0 the corners read (210.9, 203.9, 179.1) / (219.2, 211.4,
// 186.4) / (226.2, 217.8, 192.3) / (232.1, 223.0, 197.4) / (237.1, 227.2, 201.4) / (241.4, 231.0,
// 204.9) / (245.2, 234.4, 208.0), which interpolate onto (222, 214, 203) at 1.0799 / 1.0822 /
// 1.6897 — blue needing two thirds again as much authored value as before, and red and green
// barely eight per cent. Dividing the previous gains (2.1024, 2.0382, 2.3454) by those is what
// these numbers are.
//
// The ground's own gain below is a SEPARATE ratio and does not absorb this one — both surfaces go
// through the same grade, so it cancels between them and only the shell needs this.
const SHELL_RENDER_GAIN = [1.9468, 1.8834, 1.3881];
const backdropSeed = hash32(`backdrop|${MODE}|${ID}|${params.get('ids') ?? ''}|${DISTRICT}`);
// The spread is deliberately narrow — about five sRGB levels — and every factor is at or under 1
// so no channel can land above the target. That is a real reduction from the old sixteen-level
// range, and it is the right trade now: `blind-pair.mjs` repaints the reached field to the target
// on BOTH sides, so a corner sample taken off a composited panel reads the same triple whatever
// we shot, and the r14 constant-backdrop tell can no longer be exploited from a panel at all.
// What CAN still be exploited is an enclosed patch that does not match the field, which is why
// the cap matters more than the range.
const dim = 1 - unitFrom(backdropSeed, 17) * 0.022;   // 0.978 … 1.000 — never brightens
const tint = unitFrom(backdropSeed, 23) * 0.018;      // 0 … 0.018 — cools, never warms past target
// The lower shell band, before the lighting compensation the ground needs.
const shellLow = [
  (FIELD_TARGET[0] / SHELL_RENDER_GAIN[0]) * dim * (1 - tint),
  (FIELD_TARGET[1] / SHELL_RENDER_GAIN[1]) * dim * (1 - tint * 0.45),
  (FIELD_TARGET[2] / SHELL_RENDER_GAIN[2]) * dim,
];
// The rig's measured multiplier on a lit studio ground at this lab's own `tod=0.42`. A ground
// albedo equal to the shell's low band renders brighter than the unlit shell by this ratio, so
// dividing the shell's band by it lands the lit ground on the unlit shell and the join disappears
// for every seed rather than for one. The residential lab carries (1.049, 1.018, 0.990) at its own
// tod of 0.28; this lane's sun is higher and warmer, so the number is its own.
//
// Verified rather than asserted: sampling a clean column of a studio plate top to bottom — one
// with no cast shadow crossing it — the largest step between adjacent rows anywhere in the column
// is 1–2 levels out of 255, on `warehouse-brick--dock`, `warehouse-brick--street` and
// `factory-light--three-quarter` alike. The residential lane's uncorrected step measured (4,9,10)
// and a blind critic listed "a conspicuous horizon line" among the things identifying our side in
// all seven pairs. Re-measure the same way if the default tod moves.
//
// RE-MEASURED at the new band. The gain is a property of the rig AND of the grade in `post.js`,
// and a grade is not guaranteed linear — so a ratio measured against a 0.79–0.95 albedo cannot be
// assumed at 0.69–0.73. Re-derived the same way, by sampling a clean column of a studio plate
// from shell to ground with no cast shadow crossing it, on both subjects.
const GROUND_LIGHT_GAIN = [1.076, 1.049, 1.014];

// A calibration bias on the whole backdrop — shell and ground together, so their join cannot move
// while it is applied. `?fieldbias=` and `__indLab.setFieldBias()` exist because the constant
// above is only true for one post-chain grade, and the last two capture rounds were spent
// discovering that the grade has a SHOULDER: rendered response to authored value measured a slope
// of 0.33–0.37, not 1, so a flat per-channel gain lands short and a second flat gain lands short
// again. Bisecting with this hook is one page load instead of one capture round per guess, and it
// is how the next seat re-derives `SHELL_RENDER_GAIN` when `post.js` or the lighting profile moves.
//
// THE BIAS IS PER CHANNEL, and that is not a convenience — a single scalar cannot calibrate this
// grade. The LUT is three-dimensional and closes with a saturation about luma, so a channel's
// rendered value depends on the OTHER two. Calibrating the V332 toe with a scalar ladder solved
// blue at 1.6897, and applying that solution and re-measuring came back seven levels OVER target
// rather than on it: on the ladder blue was measured with red and green also scaled 1.69× and
// therefore at a much higher luma, which is a different place in the cube from the one the plate
// actually sits in. Holding two channels still and moving the third measures the cube where the
// answer lives, and blue's own luma weight is 0.0722 so moving it barely perturbs the other two.
let fieldBias = [1, 1, 1];
{
  const raw = params.get('fieldbias');
  if (raw) {
    const parts = raw.split(',').map(Number).filter((n) => Number.isFinite(n) && n !== 0);
    if (parts.length === 3) fieldBias = parts;
    else if (parts.length === 1) fieldBias = [parts[0], parts[0], parts[0]];
  }
}
let paintShell = () => {};
const biasedLow = () => [shellLow[0] * fieldBias[0], shellLow[1] * fieldBias[1], shellLow[2] * fieldBias[2]];

const groundMat = STUDIO
  ? new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(
      shellLow[0] * fieldBias[0] / GROUND_LIGHT_GAIN[0],
      shellLow[1] * fieldBias[1] / GROUND_LIGHT_GAIN[1],
      shellLow[2] * fieldBias[2] / GROUND_LIGHT_GAIN[2],
    ),
    roughness: 0.95,
    metalness: 0,
  })
  : materials.get('concrete', { variant: 'lab-ground', color: '#b9b3a6' });
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(extent.x * (STUDIO ? 12 : 3), extent.z * (STUDIO ? 12 : 3)),
  groundMat,
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(centre.x, 0, centre.z);
// V3.70 r2, ORCHESTRATOR SEAT — the seamless stops receiving in studio mode, mirroring
// `mvp/src/residential-lab.js:170` and the V3.40 note above it, which found this artefact and
// fixed it there without it ever propagating to the other three labs.
//
// A cast shadow lying on an infinite seamless is counted as SUBJECT by a border flood fill, and
// no photographed reference plate has one — the reference tile floats on a clean field with no
// spill. On the residential lane it drove measured subject aspect to 2.79–2.91 against the
// reference's 1.71–1.97 and the compositor refused five pairs outright. On L6 the same slab made
// both blind pairs sortable from our side alone, without a critic looking at a model, which is
// the same family of leak as the green ground disc in `core-lab.js` and the lens vignette below.
//
// The lot keeps its own contact shadow — that is what §2.9 grades, and the subject is still
// seated on its plate. Only the infinite seamless beyond it stops receiving, and only in studio
// mode. The board's ground is untouched.
ground.receiveShadow = !STUDIO;
scene.add(ground);

if (STUDIO) {
  // A seamless is a floor that curves up into a wall. `scene.background` alone does not do it:
  // the post chain clears to black, so anything above the horizon came out as a black band
  // across the top of every plate.
  //
  // A flat upright card fixed that only for the azimuth it faced — a tall subject shot off-axis
  // ran its sight line past the card's edge and the plate came back with a black wedge in the top
  // corner, which a critic reads as "this one is the render" before it looks at the building. An
  // enclosing shell has no edge to run past: a large inverted sphere, unlit, with the vertical
  // falloff a lit seamless has baked into its vertex colours.
  //
  // The shell's lower band is tuned to land on the *lit* ground plane's rendered value, so the
  // seamless has no horizon in it. On the residential lane the uncorrected step measured (4,9,10)
  // — small in absolute terms and plainly visible as a line across the plate. The correction is
  // the measured per-channel ratio above, applied to the low band only, so the shell still
  // carries its vertical falloff and the backdrop still varies per subject.
  const shellR = Math.max(extent.x, extent.z) * 9;
  const shell = new THREE.SphereGeometry(shellR, 32, 24);
  const pos = shell.attributes.position;
  const col = new Float32Array(pos.count * 3);
  shell.setAttribute('color', new THREE.BufferAttribute(col, 3));
  paintShell = () => {
    const band = biasedLow();
    const low = new THREE.Color().setRGB(band[0], band[1], band[2]);
    // The falloff now runs DOWNWARD toward the top of the shell rather than upward, and it is a
    // token 1.5 % rather than the old 17 sRGB levels. Both changes come from the same constraint
    // as the band itself: nothing in the backdrop may exceed the compositor's target, and the old
    // high band was 26 levels over it. Backdrop enclosed high in frame — between the guy wires,
    // through the sawtooth glazing, over a parapet — would otherwise have carried the same glow
    // the fence apertures did. A cyclorama does fall off away from the lit floor, so the
    // direction is not a lie; at two levels it is invisible either way, and what it protects is
    // measurable.
    const high = new THREE.Color().setRGB(band[0] * 0.985, band[1] * 0.985, band[2] * 0.985);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      // Height fraction over the shell, eased so the gradient sits mostly above the horizon —
      // which is where a real seamless's falloff lives.
      const t = Math.min(Math.max(pos.getY(i) / shellR * 0.5 + 0.5, 0), 1);
      c.copy(low).lerp(high, t ** 0.6);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    shell.attributes.color.needsUpdate = true;
  };
  paintShell();
  const shellMesh = new THREE.Mesh(shell, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  shellMesh.position.set(centre.x, 0, centre.z);
  shellMesh.renderOrder = -1;
  scene.add(shellMesh);
}

// Where every subject's front edge lands in `mode=row`, and where the carriageway starts. The
// carriageway itself is built after the subjects are mounted, because its position is measured
// from them: see the note beside it below.
const KERB_Z = TILE * 0.62;

const root = new THREE.Group();
scene.add(root);

/** Mount one kit model at a world offset; returns its measured bounding box. */
function mount(archetypeId, x, z, facade = 0, districtId = DISTRICT) {
  // The fifth argument is the condition tier. It was dropped here, which is why the renovated
  // exterior was invisible to the harness even after the kit could build it.
  const model = kit.get(archetypeId, districtId, facade, null, TIER);
  if (!model) return null;
  const group = new THREE.Group();
  for (const part of model.parts) {
    const mesh = new THREE.Mesh(part.geometry, part.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.position.set(x, 0, z);
  root.add(group);
  const box = new THREE.Box3().setFromObject(group);
  return { id: archetypeId, group, box, model };
}

/** Move an already-mounted subject and refresh its measured box. */
function place(m, x, z) {
  m.group.position.set(x, 0, z);
  m.group.updateMatrixWorld(true);
  m.box.setFromObject(m.group);
  return m;
}

const mounted = [];
if (MODE === 'row') {
  // V332 §2e. Both subjects on one industrial street, so the critic can grade a continuous
  // boundary line, hardstands meeting the same kerb, and the scale relationship between a shed
  // and a bond store.
  //
  // The pitch is measured, not a TILE constant. An industrial parcel is not one tile and the two
  // subjects are not the same width; laying them out on a fixed pitch either overlaps the yards
  // or leaves a gap of open ground between them, and a gap is the one thing dimension 10 is
  // asking about. So: mount, measure, then lay out edge to edge with a service gap.
  const ids = (params.get('ids') ?? INDUSTRIAL_IDS.join(',')).split(',').filter(Boolean);
  const provisional = ids.map((id, i) => mount(id, 0, centre.z, (FACADE + i) % 4)).filter(Boolean);
  const sizeOf = (m) => m.box.getSize(new THREE.Vector3());
  const GAP = 1.6;                                  // a service gap, not a vacant lot
  const widths = provisional.map((m) => sizeOf(m).x);
  const totalW = widths.reduce((a, b) => a + b, 0) + GAP * (widths.length - 1);
  let cursor = centre.x - totalW / 2;
  provisional.forEach((m, i) => {
    // Local offsets, so the placement is independent of where the model's origin happens to sit.
    const localMinX = m.box.min.x - m.group.position.x;
    const localMaxZ = m.box.max.z - m.group.position.z;
    // Every front edge lands on the same line, which is what makes the hardstands meet one kerb.
    place(m, cursor - localMinX, centre.z + KERB_Z - localMaxZ);
    cursor += widths[i] + GAP;
    mounted.push(m);
  });
} else if (MODE === 'sheet') {
  const cols = Math.min(2, INDUSTRIAL_IDS.length);
  const pitch = TILE * 2.6;
  INDUSTRIAL_IDS.forEach((id, i) => {
    const cx = centre.x + ((i % cols) - (cols - 1) / 2) * pitch;
    const cz = centre.z + (Math.floor(i / cols) - 0.5) * pitch;
    // Laddered off `FACADE` the way `mode=row` is, so `?facade=1` moves the sheet too. Left at a
    // bare `i % 4` the contact sheet came back identical for every façade, which is worse than
    // ignoring the switch: the plate lands in the façade's own tag directory looking like
    // evidence for it.
    const m = mount(id, cx, cz, (FACADE + i) % 4);
    if (m) mounted.push(m);
  });
} else {
  const m = mount(ID, centre.x, centre.z, FACADE);
  if (m) mounted.push(m);
}

lighting.applyEnvironmentToScene(scene);

const bounds = new THREE.Box3();
for (const m of mounted) bounds.union(m.box);
if (bounds.isEmpty()) bounds.setFromCenterAndSize(centre, new THREE.Vector3(TILE, STOREY * 2, TILE));

// The carriageway, built AFTER the subjects and positioned off their measured front edge.
//
// The residential lab writes the same rule as a constant — "the road has to start where the kerb
// ends" — because a residential lot is one tile deep and the number is knowable in advance. An
// industrial parcel is not: `factory-light` measures 26.9 m deep against `warehouse-brick`'s own
// figure, and a constant offset put the asphalt band straight over the factory's apron, with the
// painted bay markings reading as road markings and the stop line under the carriageway. The
// critic would have graded that as the model's own curtilage error. Measure it instead.
const KERB_LINE = bounds.max.z + 0.35;
const ROAD_W = TILE * 1.25;                      // wide enough for the truck the dock implies
const asphaltMat = materials.get('asphalt', { variant: 'lab-road' });
const road = new THREE.Mesh(new THREE.PlaneGeometry(extent.x * 3, ROAD_W), asphaltMat);
road.rotation.x = -Math.PI / 2;
road.position.set(centre.x, 0.015, KERB_LINE + ROAD_W / 2);
road.receiveShadow = true;
if (!STUDIO) scene.add(road);

// What the camera frames, as distinct from what the shadow camera must cover.
//
// `bounds` unions every mounted mesh, which on an industrial subject includes the hardstand, the
// apron, the kerb, the boundary and the stored goods — and on these subjects that is a LARGER
// fraction of the union than a house's garden is, because V332 §2b makes the yard a graded part
// of the subject. Fitting the camera to the union therefore shrinks the building further here
// than it did on the residential lane, where a blind critic measured the cost: our subject
// occupied roughly 45% of frame width against the reference pack's 85%, and named it in all
// seven pairs as one of the things identifying our side without looking at the building.
//
// The reference plates frame the building and let the base tray crop. So does this. Yard geometry
// is excluded from the framing box two ways — by name where a kit gives its parts names, and by
// height where it does not (see the note under the prefix table, which is where the work actually
// happens on this kit). It falls back to the full bounds whenever the filter leaves nothing
// plausible behind, so a kit that changes shape loses the tighter crop and never the plate.
const YARD_PREFIXES = [
  // Ground plane and its markings.
  'yard-', 'hardstand', 'apron', 'industrial-apron', 'slab-', 'pad-', 'paving', 'pavement',
  'marking', 'stopline', 'stop-line', 'bay-line', 'hatch-', 'linemark', 'tyre-', 'oil-',
  // The base tray the reference plates let crop.
  'lot-', 'plinth-foot', 'plinth-base', 'plinth-rim', 'industrial-plinth',
  // Boundary and street edge.
  'kerb', 'footpath', 'verge', 'crossover', 'driveway', 'fence-', 'palisade', 'chainlink',
  'chain-link', 'mesh-fence', 'gate-', 'boundary-', 'bollard', 'wheel-stop', 'wheelstop',
  'guard-rail', 'guardrail',
  // Stored goods and yard furniture that name the use.
  'pallet', 'stillage', 'drum-', 'skip-', 'crate', 'gas-bottle', 'bottle-cage', 'cage-',
  'stack-crate', 'sign-', 'signage', 'placard', 'street-number', 'nameplate',
  // Incidental planting.
  'tree-', 'trunk', 'weed', 'shrub', 'grass', 'turf-', 'lawn-', 'planter-',
];
const isYardPart = (name) => !!name && YARD_PREFIXES.some((p) => name.startsWith(p));

// The name filter alone does not work on this kit, and finding that out is the reason this
// paragraph exists.
//
// `industrial/index.js` merges its parts by material bucket before returning them — V332 §3 caps
// the kit at nine buckets and `board.js` draws one InstancedMesh per bucket — so a subject
// arrives as eight meshes named `industrial:brick`, `industrial:concrete`, `industrial:asphalt`
// and so on. There is no `hardstand-slab` mesh to exclude: the building's concrete and the yard's
// slab are triangles in the SAME geometry. Measured on `factory-light`: the name filter excluded
// nothing at all, the framing box came back identical to the full lot at 14.6 × 30.7 m, and the
// building standing in it is 11.5 × 15.8 — so the fit was spending a third of the frame on empty
// hardstand and the harness reported a healthy number for it. That is the v330-r1 framing leak
// wearing different clothes, and the name-prefix fix the residential lane bought does not
// transfer across a kit that merges.
//
// So the filter is geometric as well as nominal, and the geometric half is what does the work
// here: a vertex belongs to the BUILDING if it stands more than `YARD_HEIGHT` above the lot.
// Hardstand, apron, painted markings, kerb, wheel stops, bollards, stored goods and the boundary
// fence all sit below the cut and crop the way the residential lane crops its front fence.
// Everything that carries the silhouette — cladding, parapet, sawtooth, stack, canopy — is above
// it. The cut height itself is found rather than asserted; see `chooseYardHeight`.
//
// The full bounds still drive the shadow camera, because a shadow camera that cannot see the
// yard stops shading it, and an unshaded hardstand in front of a shaded shed is a harness defect
// a critic grades as dimension 9.
/** Bounding box of every vertex standing more than `above` metres over the lot. */
function frameBoxAbove(above) {
  const box = new THREE.Box3();
  const yThreshold = bounds.min.y + above;
  const v = new THREE.Vector3();
  for (const m of mounted) {
    m.group.updateMatrixWorld(true);
    m.group.traverse((node) => {
      if (!node.isMesh || isYardPart(node.geometry?.name)) return;
      const pos = node.geometry?.attributes?.position;
      if (!pos) return;
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
        if (v.y >= yThreshold) box.expandByPoint(v);
      }
    });
  }
  // The datum stays on the ground even though the sampling starts above it: `look` and `eye` are
  // fractions of the subject's height measured from the lot, and a box floating three metres in
  // the air would put every station's lens three metres too high.
  if (!box.isEmpty()) box.min.y = bounds.min.y;
  return box;
}
// The cut height is found, not asserted.
//
// The first version asserted 2.6 m — above a hardstand, above a bollard, above the 2.1–2.4 m
// boundary fence the vernacular actually builds. This kit's palisade stands past 3 m with its
// spear tips, so 2.6 m excluded nothing and the framing box came back as the whole lot with the
// harness reporting a healthy fill for it. A constant that is right for one kit revision and
// silently wrong for the next is the same class of defect as the fixed ground albedo that put a
// horizon line across every residential plate.
//
// So: walk a ladder of cut heights and take the lowest one where the footprint collapses — where
// the box stops being the lot and starts being the building. The ladder is capped at a third of
// the subject's height so a subject with no yard at all cannot be cropped into its own roof, and
// when no height qualifies the cut is zero, which leaves the full bounds and loses only the
// tighter crop. Deterministic, and it re-derives itself when a lane changes its fence.
//
// THE ZERO SAYS SO OUT LOUD. Falling back to the full bounds is a silently looser crop — the
// plate still comes back, the harness still reports a fill number for it, and the number is
// honestly measuring a box that is a third empty hardstand. That is the same shape of failure as
// the name-prefix filter that excluded nothing: a defect whose only symptom is a plausible
// number. The driver captures console errors per plate, so a lane that changes its fence and
// loses the crop finds out from `stats.json` rather than from a critic.
function chooseYardHeight() {
  const full = bounds.getSize(new THREE.Vector3());
  const fullFootprint = full.x * full.z;
  if (!(fullFootprint > 0)) {
    console.error('[industrial-lab] yard filter DISABLED: lot footprint is zero — framing falls back to full bounds');
    return 0;
  }
  const probe = new THREE.Vector3();
  const cap = Math.min(6.0, full.y * 0.35);
  for (let h = 0.4; h <= cap + 1e-6; h += 0.4) {
    const b = frameBoxAbove(h);
    if (b.isEmpty()) break;
    b.getSize(probe);
    if (probe.x * probe.z <= fullFootprint * 0.75) return Math.round(h * 100) / 100;
  }
  console.error(
    `[industrial-lab] yard filter FOUND NO CUT below ${Math.round(cap * 100) / 100} m on `
    + `${mounted.map((m) => m.id).join(',') || 'no subject'} — the footprint never collapsed to `
    + '75% of the lot, so framing falls back to the FULL bounds and every fill number on this '
    + 'plate is measuring the yard as well as the building',
  );
  return 0;
}
const YARD_HEIGHT = chooseYardHeight();
const frameBox = frameBoxAbove(YARD_HEIGHT);
// A building should be a decent share of its yard. If the filter has left a sliver — a subject
// whose mass is all below the threshold, or a kit that changed shape — the crop would be
// nonsense, so take the union. A lane that changes its geometry should lose the tighter crop,
// never the plate.
const framePlausible = !frameBox.isEmpty()
  && frameBox.getSize(new THREE.Vector3()).x > bounds.getSize(new THREE.Vector3()).x * 0.25
  && frameBox.getSize(new THREE.Vector3()).y > bounds.getSize(new THREE.Vector3()).y * 0.3;
if (!framePlausible) {
  // Same reasoning as the `chooseYardHeight` zero above: the plate survives, the crop quietly
  // does not, and nothing else in the run would say so.
  console.error(
    '[industrial-lab] framing box IMPLAUSIBLE after the yard filter — falling back to the full '
    + 'bounds, so every station on this plate is framing the whole lot',
  );
}
const fitBounds = framePlausible ? frameBox : bounds;

// The dock station's subject is the dock face AND the apron in front of it — V332 §2b says a dock
// with nothing near it is a modelled hole, so a station that crops the apron out cannot grade the
// thing the station exists for, and a station that frames the whole lot puts the dock in the
// middle distance.
//
// So this box is written out rather than taken as a fraction of something: the front slice of the
// building, plus the apron immediately in front of it, at the building's own width. It is anchored
// on the building's front plane, which is the one plane that means something here — the board aims
// an industrial subject's authored +Z face at its street, so +Z is the dock.
const buildingDepth = Math.max(fitBounds.getSize(new THREE.Vector3()).z, 1);
const dockFrontZ = fitBounds.max.z;
const dockBounds = new THREE.Box3(
  new THREE.Vector3(fitBounds.min.x, bounds.min.y, dockFrontZ - buildingDepth * 0.45),
  new THREE.Vector3(
    fitBounds.max.x,
    fitBounds.max.y,
    // 0.22 of the building's own depth forward of the dock — about 4.3 m of apron, which is what
    // `mp-factory-dock.png` shows in front of its platform.
    //
    // It was 0.55, then 0.38, and both were too much for the same reason: the box is at full
    // building WIDTH, so its near-bottom corners sit seven metres closer to a low lens than the
    // dock face does and project far wider than the wall behind them. The fit then honestly
    // frames a strip of empty apron. With `fitHeight` added above, the doors went from 14.3 % of
    // frame width to 27.2 %; trimming the forward reach is the other half of the same defect, and
    // the bar is the reference's 41.7 %. The floor on this number is §2b — the apron falling to
    // the dock, the stop line, the bay markings and the tyre scrub are graded content and a dock
    // with nothing near it is a modelled hole — so it stops at the apron's own depth rather than
    // at the dock face.
    Math.min(bounds.max.z, dockFrontZ + buildingDepth * 0.22),
  ),
);

// A CORNER, not a wall plane — the framing box behind the `detail` station.
//
// The reference seat found this the expensive way and it is recorded in the ledger: a close crop
// of a FLAT brick elevation drifts to photography, because flat masonry gives the renderer almost
// nothing to stylise and the register collapses into brick photo-texture — the exact §4 failure
// that cost eight blind rounds. `mp-warehouse-detail` failed three times before it was reframed
// onto a corner, and the corner fixed it: cornice returning, hoist beam foreshortened toward the
// camera, a rainwater head standing off the wall. Chunky objects at oblique angles are what the
// register needs. Our own `detail` station was a slightly tighter copy of `dock` — same azimuth
// family, same box — and reported a 100 % × 100 % fill, which is a hard crop of a wall, not a
// detail of anything.
//
// `mp-warehouse-detail` is also a crop of the TOP of the corner rather than the whole elevation,
// and that is not a stylistic choice: a corner column is portrait-shaped, and a portrait subject
// in the mandatory 3∶2 frame fits on height and leaves the sides empty. Cropping to the head of
// the column puts the cornice, the parapet, the wall head, the rainwater head and the upper
// openings across a landscape frame at the aspect the reference was drawn at. The base wear §2c
// grades is carried by `dock` and `street`, which look at nothing else.
//
// Both numbers are derived from the subject rather than asserted, because a constant that is
// right for one kit revision and silently wrong for the next is this file's oldest defect.
/** Every vertex standing over one corner column of the lot: `span` back along both axes. */
function cornerColumnBox(cx, cz, span, out = 1.1) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const m of mounted) {
    m.group.updateMatrixWorld(true);
    m.group.traverse((node) => {
      if (!node.isMesh) return;
      const pos = node.geometry?.attributes?.position;
      if (!pos) return;
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
        if (v.x < cx - span || v.x > cx + out) continue;
        if (v.z < cz - span || v.z > cz + out) continue;
        box.expandByPoint(v);
      }
    });
  }
  return box;
}
// The front-+X corner. On both subjects that is the corner the annex runs off — the factory's
// plant block and louvre bank, the bond store's lean-to and its ghost-sign flank — so the two
// faces meeting at it are the two most articulated faces the model has. The opposite corner is
// plain wall on both, which is the shot the reference pack could not make work.
const CORNER_X = fitBounds.max.x;
const CORNER_Z = fitBounds.max.z;
const fitSize = fitBounds.getSize(new THREE.Vector3());
// Two passes. The crop height wants to come off the corner's OWN height, and the span wants to
// come off the crop height so the box lands near 3∶2 — so read the height with a provisional
// span first, then rebuild the column at the span that reading implies.
const probeColumn = cornerColumnBox(CORNER_X, CORNER_Z, Math.min(fitSize.x, fitSize.z) * 0.34);
const probeTop = probeColumn.isEmpty() ? fitBounds.max.y : probeColumn.max.y;
// 0.52 of the corner's height, floored so a low annex still gives the lens something to hold and
// capped so a tall one does not turn the detail back into a hero shot.
const CORNER_H = Math.min(7.4, Math.max(3.6, (probeTop - bounds.min.y) * 0.52));
// Two faces meeting at 45° present about 1.41 × span of silhouette, so 1.06 × the height puts the
// content box within a few per cent of the frame's own 1.5.
const CORNER_SPAN = CORNER_H * 1.06;
const cornerColumn = cornerColumnBox(CORNER_X, CORNER_Z, CORNER_SPAN);
const cornerTop = cornerColumn.isEmpty()
  ? fitBounds.max.y
  : Math.min(cornerColumn.max.y, fitBounds.max.y);
const cornerBounds = cornerColumn.isEmpty() ? dockBounds : new THREE.Box3(
  new THREE.Vector3(
    Math.max(cornerColumn.min.x, CORNER_X - CORNER_SPAN),
    Math.max(cornerTop - CORNER_H, bounds.min.y),
    Math.max(cornerColumn.min.z, CORNER_Z - CORNER_SPAN),
  ),
  new THREE.Vector3(cornerColumn.max.x, cornerTop, cornerColumn.max.z),
);

const size = fitBounds.getSize(new THREE.Vector3());
const target = fitBounds.getCenter(new THREE.Vector3());

// Size the key's shadow camera to the subject plus the shadow it throws, rather than letting
// the board's cascade ladder pick its smallest band around a lone building. A low sun on a shed
// with a board-legible stack reaches well past that, and the plate then shows a hard straight
// edge where the shadow map ends — read by four separate critics on the residential lane as the
// ground plane running out. Driven off the FULL bounds, not the framing box, for the reason the
// comment above gives.
const fullSize = bounds.getSize(new THREE.Vector3());
lighting.shadowRadius = Math.max(fullSize.x, fullSize.z) * 0.5 + fullSize.y * 2 + TILE;

const camera = new THREE.PerspectiveCamera(26, 1, 0.5, 2000);

/**
 * Camera stations. `az` is the azimuth off the +Z frontage (the board aims an industrial
 * building's authored +Z face at its street, so +Z is the dock face), `el` is a true elevation
 * angle in radians above the aim point, `eye`/`eyeAbs` set the lens height instead where a
 * station wants a fixed one, `margin` is slack around the fitted subject (1.0 = the subject
 * exactly touches two frame edges), and `look` is where the aim point sits up the subject's
 * height. `fit: 'dock'` fits the building plus its apron; `fit: 'full'` fits the whole yard.
 */
const VIEWS = {
  // Elevation and margin are tuned so the subject fills the frame on HEIGHT, not only on width.
  // The residential lane learned this the expensive way: with the fit moved onto the building
  // box, a wide low subject filled 90% of frame width and 52% of frame height — fitted on its
  // width in a 3∶2 frame, leaving half the plate empty above and below — and a blind critic named
  // exactly that as one of the things identifying our side. The fix is elevation, not margin:
  // margin is already spending the width, and cropping further would cut the frontage. Raising
  // the lens turns a wide flat silhouette into a taller one by putting roof in the frame, and an
  // industrial shed is the widest, flattest subject in the programme.
  //
  // 0.20π (36°) rather than the residential lane's 0.16π. A terrace is all frontage and its flank
  // is a sliver; a shed is mostly flank, its length IS the silhouette, and V332 §2d grades the
  // sawtooth/parapet split which only reads with some of the roof run in frame. 36° still lets
  // the dock face lead.
  //
  // Margin 1.00, not the residential lane's 0.94. At 0.94 the crop cut the dock bumpers, the
  // pallet stack and the wheel stops off the bottom edge — and V332 §2b grades the stored goods
  // that name the use as hard as the shed. A house can spare its front fence; a dock cannot spare
  // the thing parked at it.
  //
  // The row override fits the FULL lots, not the buildings. On a single subject the yard is
  // allowed to crop, because the station is a portrait of a building; in a row the yard is the
  // subject — §2e grades whether the boundary runs continuously past the two lots and whether the
  // hardstands meet the same kerb, and a crop that takes the fence out cannot answer either.
  //
  // FITTED ON THE WHOLE LOT, AND THAT REVERSES A DECISION THIS FILE ARGUED FOR. The note above
  // says the reference plates frame the building and let the base tray crop, and that reading was
  // wrong: `mp-factory-light.png` stands the entire lot in frame — all four fence runs, the dark
  // chamfered plate, every corner — floating in field with nothing cut. What the residential lane
  // actually bought was that the *fit* must not be dragged out by a deep yard, and the fix for
  // that is elevation, not a crop.
  //
  // The r1 harsh critic then measured the cost of cropping it here, and it is worse than a soft
  // plate: `blind-pair.mjs` derives the subject box from whatever the flood fill did NOT reach, so
  // a lot cut by the source frame gives our panel a hard straight edge through the hardstand with
  // bisected pallets — named on sight in p1 and p5 — AND inflates that box, so the height-fit
  // normalisation renders our building smaller than the reference's for a reason that has nothing
  // to do with either building. `stats.json` was already recording it as `labFill.full.clipped:
  // true` on both subjects and nothing was reading the field.
  //
  // Elevation carries the cost instead: 1.55 of the subject's height rather than 1.14, which is
  // roughly where the reference hero's camera sits, and a deep lot then projects as a compact
  // rhombus rather than a long strip.
  'three-quarter': { az: Math.PI * 0.20, eye: 1.55, margin: 1.03, look: 0.44, fit: 'full', row: { eye: 1.45, margin: 1.02, look: 0.46, fit: 'full' } },

  // DOCK — the station this lane exists for. The product contract lives on this elevation (two
  // bays on the factory, one on the warehouse, V332 §2d) and so does most of what §2b grades:
  // the apron falling to the dock, the painted bay markings and stop line, the bumpers, the
  // bollards, the stored goods under the canopy.
  //
  // Framed deliberately rather than inherited:
  //  - `fit: 'dock'` so the apron in front of the building is inside the fit and the rear yard is
  //    not. Fitting the building alone put the stop line at the bottom edge or off it; fitting the
  //    whole yard pushed the dock into the middle distance.
  //  - 0.11π (20°) off frontal. Straight on, the bay reveals have no depth and two bays read as
  //    one painted rectangle; past about 25° the near jamb starts eclipsing the far bay.
  //  - a low lens (0.34 of subject height) because the apron reads in raking light and a high
  //    lens flattens the fall to the dock into a grey band.
  //  - `fit: 'dock'` so the fit is the front slab — apron, dock face, jambs, canopy — and the shed
  //    body behind is allowed to run out of frame. Fitted on the whole lot instead, the two roller
  //    doors that ARE the product contract landed across 25% of frame width while the harness
  //    reported 100%: see the note on `dockBounds` and the one on `fitBoxFor`.
  //
  // `fitHeight: 9` IS THE STATION. Without it the box was still 18.2 m tall — the whole shed plus
  // its board-legible stack — and a fit solved against an 18 m box puts an 18 m building in the
  // frame. Measured on the plate rather than argued: the two roller doors spanned 41.0 % → 55.3 %
  // of frame width, i.e. 14.3 %, with dead cream on all four sides, while `mp-factory-dock.png`
  // carries the same two doors across 31.3 % → 73.0 %, i.e. 41.7 %. Everything the station exists
  // to grade — two bays against the warehouse's one, the bay numbers, the bumpers, the stop line,
  // the tyre scrub and the oil bloom on the apron — was being rendered at a third of the size the
  // bar is drawn at, and the harness reported a healthy 59 %w because the fill it measures is the
  // whole subject including the yard. 9 m clears the canopy and the gantry and lets the shed body,
  // the roof and the stack leave the top of the frame, which is what the reference plate does.
  // The `street` station's `fitHeight` sits alongside; it is 22 m, which is ABOVE both subjects
  // and therefore clips nothing — see the note there.
  //
  // `cropsLot` is a DECLARATION, not a switch: it says this station cuts the lot on purpose, so
  // the clip warning below stays quiet for it. `mp-factory-dock.png` cuts its own lot at the left
  // edge through a pallet stack and cuts the building off the top — a product shot of a dock is
  // supposed to. Any station without the flag that clips the lot is a defect and says so.
  dock:            { az: Math.PI * 0.11, eye: 0.58, margin: 0.98, look: 0.38, fitHeight: 9, fit: 'dock', cropsLot: true, row: { eye: 0.52, margin: 1.04, look: 0.38, fitHeight: 12 } },

  // FLANK and REAR — §2.1's blank-wall rule is a named hard constraint: no elevation may be a
  // large undifferentiated plane. Both lanes built articulated rear and flank elevations to
  // satisfy it and NONE OF IT COULD BE GRADED, because every station in this table looked at the
  // frontage. Lane A had to add a station in-flight just to inspect its own west wall, which is
  // the harness making a lane pay for the harness's own gap.
  //
  // West (−X) on purpose. The +X flank is the articulated one on both subjects — the factory's
  // plant annex and louvre bank, the bond store's lean-to under its BOND STORE ghost sign — and
  // `three-quarter` already shows it. The −X flank is the one with nothing bolted to it, so it is
  // the elevation the blank-wall rule is actually asking about. Slightly off square (−79°) rather
  // than a true orthographic elevation, because a dead-flat wall shot dead flat-on is the exact
  // framing the reference seat found drifts to photography; a few degrees of return gives the
  // downpipes, pilaster strips and rainwater heads something to cast against.
  //
  // Both fit the whole lot, for the reason `three-quarter` now does and for a second one that is
  // free: from the side the lot's 31 m depth is the HORIZONTAL extent, so the full-lot box is
  // 31 × 18 — a 1.7 aspect that binds on width in a 1.5 frame. Fitted on the building instead the
  // box is 20 × 18, binds on height, and leaves a third of the frame empty at the sides. Framing
  // more of the subject makes the plate tighter here, which is not usually how that trade runs.
  flank:           { az: -Math.PI * 0.44, eye: 0.52, margin: 1.03, look: 0.46, fit: 'full', row: { margin: 1.05 } },
  // The rear three-quarter, mirrored across the frontage line from `three-quarter` (0.80π against
  // 0.20π) so the two together read every face: front and east from one, rear and east from the
  // other, west from `flank`. Fitted on the building rather than the lot — there is only 1.6 m of
  // yard behind these subjects against 9.9 m in front, so a full-lot fit here spends the frame on
  // apron that is not in shot.
  rear:            { az: Math.PI * 0.80,  eye: 0.72, margin: 1.03, look: 0.44, fit: 'full', row: { margin: 1.05 } },

  front:           { az: 0,              eye: 0.58, margin: 1.06, look: 0.42, fitDepth: 0.55 },
  // Street: eye height of a person on the far footpath — the read that decides whether the model
  // is a toy or a building. Absolute, not a fraction: a person does not get taller because the
  // building did. `fitHeight` caps how much of a tall subject the station tries to frame, so a
  // stack is allowed to leave the top of the frame rather than dragging the camera back until the
  // yard is an unreadable smear.
  // Depth scoping matters more here than anywhere: from a 1.75 m lens the near ground corner of a
  // 31 m deep parcel sits below the frame until the camera has retreated far enough to turn the
  // subject into a model on a table — which is the exact opposite of what this station is asked
  // to answer. Fitted on the whole lot the subject came back at 54% of frame height with dead
  // cream on all four sides. `fit: 'dock'` keeps the person on the footpath where a person
  // stands, opposite the frontage, and lets the back of the yard fall out of frame the way it
  // does for anyone standing there.
  //
  // THE 22 WAS INERT AND IS NOW 12. `fitHeight` is absolute metres above the lot, and the tallest
  // thing on either subject is the factory's stack cap at 18.2 m — so a 22 m clip never clipped
  // anything on any plate this lane has ever shot, and the station has been fitting the whole
  // 18 m subject from a 1.75 m lens the entire time. The factory street plate came back at
  // 54.7 %w × 47.8 %h with dead cream on all four sides, which is precisely the failure the
  // comment above says the clip exists to prevent. 12 m cuts the factory's stack and roof crown
  // out of the fit and leaves the warehouse (11.5 m overall) untouched, so only the subject that
  // had the problem moves. Same class of defect as the asserted 2.6 m yard cut: a constant that
  // reads plausible, is never checked against a measurement, and quietly does nothing.
  street:          { az: Math.PI * 0.10, eyeAbs: 1.75, margin: 1.02, look: 0.34, fitHeight: 12, fit: 'dock', cropsLot: true, row: { margin: 1.04 } },
  // Detail: the head of the front-+X CORNER — see the long note on `cornerBounds` for why a
  // corner and why the head of it. Margin sits just above 1 because the box is already the crop;
  // the old station got its tightness from `margin: 0.56` against the whole dock box, which is a
  // different operation and produced a slightly closer copy of the dock plate rather than a
  // detail. 0.24π (43°) so neither face of the corner dominates and the arris leads the frame,
  // and `el` rather than a lens height because at this range an absolute eye height either buries
  // the lens in the wall or floats it over the parapet depending on which subject is loaded.
  detail:          { az: Math.PI * 0.24, el: 0.16, margin: 1.04, look: 0.50, fit: 'corner', cropsLot: true },
  // Board: the isometric altitude the actual game camera flies at, so this one stays an angle.
  // Fitted on the full yard, because at board altitude the yard IS the parcel.
  board:           { az: Math.PI * 0.25, el: 0.62,  margin: 1.16, look: 0.45, fit: 'full' },
};

/** Corners of an arbitrary box; the fit re-derives these whenever a station clips the box. */
function cornersOf(box) {
  const out = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) out.push(new THREE.Vector3(x, y, z));
    }
  }
  return out;
}
const FIT_BOXES = {
  building: fitBounds,
  dock: dockBounds,
  corner: cornerBounds,
  full: bounds.isEmpty() ? fitBounds : bounds,
};
const fitProbe = new THREE.Vector3();

/**
 * The box a station actually fits, after its own clips.
 *
 * `fitHeight` (absolute metres) lets a tall subject leave the top of the frame. `fitDepth` (a
 * fraction of the box's depth, measured back from the +Z frontage) lets a DEEP subject leave the
 * back of the frame, and it is the fix for the defect that made this lane's first plates soft:
 *
 * An industrial parcel is 27 m deep against a house's 16, and the fit solves against the box's
 * projected corners — so the near ground corner, thirteen metres closer to the lens than the
 * building's centre, projects nearly twice as wide as the same width at the back wall and takes
 * the whole frame with it. The first `dock` plate put the two roller doors — the entire product
 * contract — across 25% of frame width with the fit reporting 100%, because the fit was honestly
 * framing a box whose widest projected element was an empty strip of apron near the lens. Fitting
 * the front slab instead puts the dock face in the frame at the size the station exists to show,
 * and lets the shed run out of the top and back, which is what a product photograph of a dock
 * does anyway.
 */
function fitBoxFor(box, v) {
  const size = box.getSize(new THREE.Vector3());
  const minY = box.min.y;
  const maxY = v.fitHeight != null ? Math.min(box.max.y, box.min.y + v.fitHeight) : box.max.y;
  const minZ = v.fitDepth != null ? box.max.z - size.z * v.fitDepth : box.min.z;
  return new THREE.Box3(
    new THREE.Vector3(box.min.x, minY, Math.max(minZ, box.min.z)),
    new THREE.Vector3(box.max.x, maxY, box.max.z),
  );
}

function placeCamera(view) {
  const base = VIEWS[view] ?? VIEWS['three-quarter'];
  const v = MODE === 'row' && base.row ? { ...base, ...base.row } : base;
  const fitKey = v.fit ?? 'building';
  const box = fitBoxFor(FIT_BOXES[fitKey] ?? fitBounds, v);
  const boxSize = box.getSize(new THREE.Vector3());
  const boxCentre = box.getCenter(new THREE.Vector3());

  // Framing is solved against the PROJECTED CORNERS, not against a closed-form approximation of
  // the bounding box's silhouette. Two earlier versions of the residential fit used closed forms
  // — first a bounding radius, then an exact orthographic silhouette — and both broke on the same
  // subject for the same reason: a long row viewed obliquely has its near end at half the
  // distance of its far end, and no orthographic width is right for that. The row plate came back
  // running off one edge with two thirds of the frame empty, which is a dimension-10 score
  // measuring the harness. On this lane the same thing would happen on `mode=row`, where a shed
  // and a bond store span most of a block.
  //
  // Perspective framing is a fixed point, so iterate it. Place the camera at a distance, project
  // every corner, find the worst overflow against the frustum, scale the distance by it. Six
  // passes converge to well under a pixel, and the same loop handles the tight `detail` crop
  // (margin below 1 asks for a controlled overflow) with no special case.
  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(camera.aspect, 0.1));
  const tanV = Math.tan(vFov / 2);
  const tanH = Math.tan(hFov / 2);
  const aimY = box.min.y + boxSize.y * v.look;

  // Camera height is set, not derived from an angle, except where a station names `el`. An angle
  // times the distance a wide yard demands puts the lens above the roof of anything short and
  // broad — which is every industrial subject — and that is how a hero plate comes back showing a
  // foreshortened roof plane instead of an elevation.
  const eyeY = v.eyeAbs != null
    ? box.min.y + v.eyeAbs
    : v.eye != null
      ? box.min.y + boxSize.y * v.eye
      : null;

  // `box` is already clipped by `fitHeight` / `fitDepth`, so a tall stack is allowed to leave the
  // top of the frame and a long shed the back of it, rather than dragging the camera back.
  const corners = cornersOf(box);

  const aim = new THREE.Vector3(boxCentre.x, aimY, boxCentre.z);
  let horiz = Math.max(boxSize.x, boxSize.y, boxSize.z) * 1.5;
  for (let pass = 0; pass < 6; pass += 1) {
    const camY = eyeY != null ? eyeY : aimY + Math.tan(v.el ?? 0.18) * horiz;
    camera.position.set(boxCentre.x + Math.sin(v.az) * horiz, camY, boxCentre.z + Math.cos(v.az) * horiz);
    camera.lookAt(aim);
    camera.updateMatrixWorld(true);

    // Worst corner, as a multiple of the frustum half-extent at that corner's own depth.
    let overflow = 0;
    for (const corner of corners) {
      fitProbe.copy(corner).applyMatrix4(camera.matrixWorldInverse);
      const depth = Math.max(-fitProbe.z, 0.05);
      overflow = Math.max(
        overflow,
        Math.abs(fitProbe.x) / (tanH * depth),
        Math.abs(fitProbe.y) / (tanV * depth),
      );
    }
    if (overflow <= 1e-4) break;
    // Distance scales roughly with the overflow; damp so an oblique subject cannot oscillate.
    const want = overflow * v.margin;
    horiz = Math.max(horiz * (1 + (want - 1) * 0.85), 8);
  }
  const camY = eyeY != null ? eyeY : aimY + Math.tan(v.el ?? 0.18) * horiz;
  camera.position.set(boxCentre.x + Math.sin(v.az) * horiz, camY, boxCentre.z + Math.cos(v.az) * horiz);
  camera.lookAt(aim);
  camera.updateProjectionMatrix();
}
placeCamera(VIEW);

let post = null;

// ————————————————————————————————————————————————————————————————————————————————————————————
// THE GRADE. TWO TERMS OF IT ARE THIS LANE'S OWN; EVERY OTHER TERM IS THE RESIDENTIAL LANE'S AND
// DELIBERATELY STAYS.
//
// `post.js:472` gates `_applyResidentialGrade()` on `renderer.domElement.id === 'lab'`, and
// `industrial-lab.html` line 32 is `<canvas id="lab">`. This lab inherited the residential lane's
// grade by sharing a canvas id, and a factorial experiment on a BLACK-ALBEDO wall — one variable
// at a time, three fixed ROIs — priced what that costs. With albedo at `#000000` the pipeline
// still rendered (95.4, 97.6, 111.0) on a lit parapet with post on against (67.6, 66.8, 65.4)
// with it off: blue goes from the lowest channel to the highest, and the measured albedo slope in
// blue FLIPS SIGN. Authoring cannot reach a colour whose channel does not answer authoring.
//
// Three blue-weighted terms stack. `post.js:280-283` injects the lift at twice red in blue
// (`r×0.70`, `g×0.86`, `b×1.40`); `post.js:576` sets `lift: 0.052` against the board's own 0.012
// and `toe: [1.12, 1.14, 1.18]`, blue highest again; `lighting.js:86` tints shadows
// `[0.96, 0.99, 1.06]`. Only the first two are ours to move, and only two numbers in them.
//
// NEITHER OBVIOUS FIX IS TAKEN, AND BOTH WOULD LOOK LIKE THEY WORKED.
//  - Renaming the canvas removes the grade AND SILENTLY BREAKS AMBIENT OCCLUSION, because the same
//    gate builds the AO depth bridge: the lab's scene target is multisampled and its depth texture
//    is not a reliable sampler source for the fullscreen AO pass. §2.9 grades AO directly and four
//    blind seats on the residential lane named its absence as a tell. The plate would come back
//    looking better in colour and worse in the thing the colour was being fixed for.
//  - Disabling the residential grade wholesale throws away `exposure ×2.00`, `contrast +0.336`,
//    `saturation +0.255` and `pivot 0.30`, which were tuned toward the SAME Monopoly-Plus register
//    this lane is graded against. Our subject saturation measures 18.2 % against the bar's 27.7 %,
//    so this lane needs more saturation, not less.
//
// So the grade is re-applied through the public `setGrade()` on this lab's own PostChain instance
// AFTER `setAmbientOcclusion()` has built the bridge and applied the residential grade — the same
// pattern this file already uses for `dofStrength`, the AO radii and `vignette`. `post.js` and
// `lighting.js` are untouched; the board and the residential lab are untouched.
//
// Reconstructed from `_initialGrade`, which is the lighting profile's own grade hint, exactly the
// way `_applyResidentialGrade` reconstructs it — so at `GRADE_LIFT = 0.052` and
// `GRADE_TOE = [1.12, 1.14, 1.18]` this bakes a byte-identical LUT to the residential one, and the
// sweep that chose the numbers below could measure its own baseline through the same code path it
// was going to ship.
//
// CRUSH IS NOT THE CONSTRAINT THE 0.052 ASSUMED IT WAS ON THIS LANE, AND THE COUNT SAYS SO HARDER
// THAN p05 DOES. That number was authored for a residential plate whose blacks are window reveals
// and verandah recesses, against a residential reference pack whose plates carry 7–185 pure-black
// pixels. THIS lane's pack is nothing like that: measured over `_reference-mp` by the same corner
// flood fill `blind-pair.mjs` uses, the reference plates run 0.21–3.95 % of subject pixels with
// every channel under 10 — 1,730 to 56,563 pixels — while our own r2 plates run 0.00–0.05 %, i.e.
// 0 to 335. We are an order of magnitude LESS crushed than the bar on the count as well as on p05
// (ours 20.17 factory / 47.67 warehouse against the pack's 10.43–24.12). That gap is the budget
// this grade spends.
//
// THE LIFT IS NOT THE LEVER, AND MEASURING IT WAS THE ROUND'S FIRST REAL RESULT.
//
// Its channel weighting is an OFFSET, not a gain — `r×0.70`, `g×0.86`, `b×1.40` shift the floor,
// while the slope term `(1 - lift)` is identical in all three channels. So cutting it lowers the
// blue floor slowly, and it drives the plate into the contrast clamp fast: with `pivot 0.30` and
// this profile's `contrast ≈ 1.456`, every post-toe value under `pivot·(1 − 1/contrast) ≈ 0.097`
// leaves the LUT at display zero, and the lift is precisely what holds the deepest shadow above
// that line. Measured on the factory three-quarter studio plate, lift 0.052 → 0.040 → 0.034 →
// 0.028 → 0.024 moved the lit blue floor 127.7 → 120.6 → 116.6 → 112.7 → 109.9 while pure-black
// pixels went 0.01 % → 0.33 % → 0.36 % → 4.69 % → 7.42 %. Seven levels of blue for a crush number
// past the reference's worst is a bad trade, and 0.012 — the board's own floor, and the number the
// round expected to land on — measured 7.63 % pure black with p05 at 0.
//
// THE TOE IS THE LEVER, AND IT RUNS THE OPPOSITE WAY TO THE OBVIOUS READING OF IT.
//
// `toe` is an EXPONENT, so `toe[2] = 1.18` standing above `toe[0] = 1.12` DARKENS blue relative to
// red: it is already the term partly counteracting the lift's blue offset, not a second source of
// it. Holding lift at 0.052 and moving `toe[2]` alone 1.18 → 1.34 → 1.50 → 1.66 took the lit blue
// floor 127.7 → 99.1 → 64.9 → 38.3 with pure-black pixels flat at 0.35 ± 0.01 % — twenty-nine
// levels of blue for no crush at all, against seven levels for a crush cliff on the lift. At equal
// crush the comparison is not close: lift 0.040 buys a blue floor of 120.6 at 0.33 %, `toe[2] 1.34`
// buys 99.1 at 0.36 %, and it lifts saturation median 10.05 % → 16.57 % on the way.
//
// So the lift stays where the residential lane left it and the toe carries the whole move.
// `[1.16, 1.18, 1.38]` measures, against the inherited `[1.12, 1.14, 1.18]`:
//
//   p05 28.03 → 8.72   p25 74.45 → 64.20   median 106.30 → 98.68   p75 125.44 → 119.23
//   p95 161.20 → 156.15   saturation median 9.64 % → 17.65 %   pure black 0.01 % → 2.05 %
//   blown above 242 stays 0 %   lit blue floor 127.7 → 93.7   mid blue floor 105.1 → 63.8
//
// against a reference pack measuring p05 10.4–24.1, p25 43.9–58.5, median 71.8–92.9, p75
// 97.8–149.2, p95 131.2–200.6, saturation 12.4–29.4 % (12.4–17.1 % on the factory plates,
// 25.1–29.4 % on the bond store) and pure black 0.21–3.95 %.
//
// ONE RUNG FURTHER IS A CLIFF, and it was walked rather than assumed. `[1.18, 1.20, 1.40]` at lift
// 0.048 and `[1.20, 1.22, 1.42]` at 0.052 both put p25 at 56–58 — dead on the reference band — and
// both measure 7.7–7.9 % pure black, twice the pack's worst plate. `[1.24, 1.28, 1.46]` reaches
// p25 44.2 at 8.63 %. 1.16/1.18 is the last rung before the clamp swallows the shadow side, and
// the residual gap in p25 and median is left open rather than bought with a §2.9 failure.
const GRADE_LIFT = 0.052;
// V3.70 r2, ORCHESTRATOR SEAT — THE TOE IS BACK ON THE PINNED RESIDENTIAL VALUES.
//
// Everything above this line is the r2 derivation of `[1.16, 1.18, 1.38]` and it is left standing,
// because the measurements in it are sound and the next seat should not re-derive them. What the
// derivation did not price is the thing the r8 critic found and correctly refused to charge to the
// lane: `post.js:_applyResidentialGrade()` is the value authority for the whole programme, every
// other lane is graded through its `toe [1.12, 1.14, 1.18]`, and this file was the only place in
// the programme reaching a different number. L6's luma, chroma and hue figures were therefore not
// comparable with any other lane's, or with the reference pack they are scored against, and a
// cross-lane comparison that everybody assumed was like-for-like was not.
//
// The r8 critic's own words: "it means the industrial register is being graded through a different
// toe from the value authority it is measured against." One pipe, or the numbers mean nothing.
//
// This is a HARNESS decision, not a lane one. It costs L6 the shadow-side gain the derivation
// above bought — that gain was real and it is being given up on purpose, because a p25 that is
// closer to the reference band but arrives through a private tone curve is worth less than a p25
// that is further away and comparable. If L6 still needs the shadow side opened after a
// re-capture, the lever is a change to the pinned residential grade for every lane at once, which
// is an owner decision under §4.9 and not a per-lab constant.
//
// `applyLabGrade()` below still overrides exposure ×2.00, contrast +0.336, saturation +0.255,
// pivot 0.30 and lift 0.052 — those five are IDENTICAL to `_applyResidentialGrade()` and were
// never a divergence. The toe was the only one. `post.vignette = 0` further down is a documented
// lab-only difference from residential's 0.18 and is deliberately NOT touched here.
const GRADE_TOE = [1.12, 1.14, 1.18];
// THE OTHER HALF OF THE FINDING IS A CONFIDENT NEGATIVE, AND IT IS NOT LIFT OR TOE.
//
// The pass/fail number this seat was given is the albedo slope: render a known albedo, change it,
// measure the response, and call blue unpinned when its slope is positive and comparable to red's.
// Reproducing the recorded experiment exactly — `#5c320f` → `#8b4a2a` on the same subject, slopes
// taken against each channel's OWN authored delta (47, 24, 27) — blue does not come back at any
// setting reachable from here:
//
//   lift 0.052 toe [1.12,1.14,1.18]  R 0.576  G 0.666  B −0.006   (the inherited grade)
//   lift 0.024 toe [1.12,1.14,1.18]  R 0.599  G 0.738  B −0.001
//   lift 0.052 toe [1.12,1.14,1.66]  R 0.573  G 0.655  B −0.013
//   lift 0.052 toe [1.16,1.18,1.38]  R 0.589  G 0.688  B −0.046   (shipped)
//
// The mechanism is arithmetic on the measured triples, not a hypothesis. `post.js:305-308` closes
// the LUT with `c = grey + (c − grey)·saturation`, and this grade's saturation is 1.395. Inverting
// that on the lit ROI — grey is invariant under it, so the pre-saturation blue is recoverable —
// gives a PRE-saturation blue slope of **+0.176** at the inherited grade and **+0.152** at the
// shipped one. Blue's own transfer answers albedo perfectly well. What the saturation stage then
// subtracts is `0.395 · δgrey`, and δgrey over that same authored step is 17.2 levels, i.e. 0.251
// of slope — larger than blue's own. Blue rising LESS than luma comes out as blue falling.
//
// That is why cutting the floor cannot fix the sign: a lower blue floor widens the gap between
// blue and grey, which makes the saturation term stronger, which is why the shipped grade's blue
// slope is slightly MORE negative than the inherited one even as its blue floor drops 34 levels.
// The remaining half of the finding lives in `saturation`, which is the one term this lane has
// measured a need for MORE of (subject saturation against the bar's 27.7 %), so it is a trade
// somebody has to price rather than a number this seat can quietly move. Recorded here so the
// next round does not spend itself re-deriving it from the lift.
//
// What DID move for the lanes is the floor, and that is the thing that was making the reference
// unreachable: the reference's brick renders (112, 74, 51), our lit blue floor was 127.7, and no
// authored blue below that floor could show. It is now 93.7 in the light and 63.8 in the mid band.
let gradeLift = GRADE_LIFT;
let gradeToe = [...GRADE_TOE];

/**
 * Re-bake the LUT with this lane's lift and toe over the residential grade's other terms.
 * Returns what it applied, so a caller can record the grade a plate was shot under rather than
 * assume it. No-op before the post chain exists.
 */
function applyLabGrade() {
  if (!post) return null;
  const base = lighting.profile?.grade ?? {};
  post.setGrade({
    ...base,
    exposure: (base.exposure ?? 1) * 2.00,
    contrast: (base.contrast ?? 1.06) + 0.336,
    saturation: (base.saturation ?? 1.06) + 0.255,
    pivot: 0.30,
    lift: gradeLift,
    toe: [gradeToe[0], gradeToe[1], gradeToe[2]],
  });
  return { lift: gradeLift, toe: [...gradeToe] };
}

// A flat authored albedo over every mounted subject material, and the restore that undoes it.
//
// MEASUREMENT ONLY, and it is the measurement the ledger asks the next seat to make: prove a grade
// change by the R/G/B albedo SLOPES — render a known albedo, change it, measure the rendered
// response — rather than by the plate looking better. A channel is answering authoring when its
// slope is positive and comparable to red's; the pinned blue that invalidated a round of albedo
// work on both lanes showed up as a slope near zero and then as a slope of the wrong sign, and no
// amount of looking at plates would have named it.
//
// The map is dropped with the colour so the response measured is the pipeline's and not the
// atlas's. The env map is left attached, because the environment's contribution is diffuse and
// therefore multiplies albedo — proven on this lane, where dropping `envBase` 0.85 → 0.02 against a
// black wall changed the rendered pixel by zero to the decimal.
//
// A CAPTURE RUN MUST NEVER LEAVE THIS SET, for the same reason a capture run must never pass
// `?fieldbias=`: a plate shot on a probe albedo is a plate of no building at all. There is no
// query parameter for it deliberately — it is reachable only from `__indLab`, one page load at a
// time, and `null` puts every material back.
const probeSaved = new Map();
function applyProbeAlbedo(hex) {
  if (hex == null || hex === '') {
    for (const [mat, saved] of probeSaved) {
      mat.color.copy(saved.color);
      mat.map = saved.map;
      mat.needsUpdate = true;
    }
    probeSaved.clear();
    return null;
  }
  for (const m of mounted) {
    m.group.traverse((node) => {
      if (!node.isMesh) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of mats) {
        if (!mat?.color) continue;
        if (!probeSaved.has(mat)) probeSaved.set(mat, { color: mat.color.clone(), map: mat.map ?? null });
        mat.color.set(hex);
        mat.map = null;
        mat.needsUpdate = true;
      }
    });
  }
  return hex;
}

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // The fit depends on the aspect, and module-level placement runs before the first resize —
  // so a plate framed for a square viewport and then widened leaves the subject at a third of
  // the frame. Re-place on every resize, which is also the only time the fit can change.
  placeCamera(VIEW);
  if (POST_ON) {
    if (!post) {
      post = new PostChain(renderer, {
        quality: QUALITY, reducedMotion: true, width: w, height: h, grade: lighting.profile.grade,
      });
      // The board's miniature bokeh is a hero-plate effect. A fidelity plate must be sharp
      // everywhere or the critic grades the blur instead of the building.
      post.dofStrength = Number(params.get('dof') ?? 0);

      // Ambient occlusion radii are authored for the board camera, which flies at ~5.4 tile
      // lengths and sees a parcel as a thumbnail. A hero plate sits at a fifth of that distance,
      // so a 0.35–1.6 unit radius resolves to a hairline the critic cannot see: all four blind
      // seats on the residential lane reported "zero ambient occlusion at wall/roof junctions"
      // and used it as one of three signatures identifying the game render. Scale the radii with
      // the subject so a dock recess, a canopy soffit and a pallet stack occlude at the scale
      // they are shot. The board is untouched — this is the lab's own post instance.
      // `setAmbientOcclusion` writes through to the live shader uniforms; assigning the fields
      // directly does nothing, because `post.js` captures them by value into the uniform object
      // at material construction.
      const aoScale = Math.max(1, Math.max(size.x, size.y, size.z) / 12);
      post.setAmbientOcclusion({
        radiusNear: 0.35 * aoScale,
        radiusFar: 1.6 * aoScale,
        intensity: 3.05,
        contactDarkness: 0.46,
      });

      // AFTER the AO call, never before. `setAmbientOcclusion` is what builds the depth bridge and
      // applies the residential grade, so a `setGrade` issued ahead of it would be overwritten by
      // the very grade it exists to correct — and the plate would come back looking exactly as if
      // the override had been applied and quietly ignored. See the long note beside `GRADE_LIFT`.
      if (!applyLabGrade()) {
        console.error('[industrial-lab] grade override did not apply — the plate is carrying the RESIDENTIAL lane\'s lift and toe, and its blue channel does not answer albedo');
      }

      // THE VIGNETTE IS OFF, AND IT WAS THE REAL SOURCE OF LEAK SIX.
      //
      // The board runs `post.vignette = 0.40`. Its own author already records why that does not
      // belong on a fidelity plate — "0.40 is a lens artefact, the mp README excludes lens
      // character by name, and on a fidelity plate it manufactures a darkness that is not in the
      // model" — and the residential lab drops it to 0.18 for exactly that reason. This lane
      // inherited the board's 0.40 and it did something worse than darken the corners.
      //
      // Measured on a studio flank plate, backdrop only: corners 219–225, frame centre 228–243.
      // That is a twenty-level radial ramp across a field that is supposed to be one value. So a
      // seamless calibrated at the corners — which is where `blind-pair.mjs` seeds its flood fill
      // and where the obvious sample is taken — is twenty levels too bright everywhere the
      // subject actually stands. The fill walks the ramp and repaints all of it flat, but the
      // patches it cannot reach keep the centre value: the enclosed cells of the boundary fence
      // measured a mean of rgb(241,231,218) against a target of rgb(222,214,203), and the r1
      // harsh critic sorted eight pairs out of eight on a count of exactly those pixels.
      //
      // Dimming the whole backdrop by twenty levels would have hidden it and left a vignetted
      // plate whose corners were then twenty levels DARK. Turning the artefact off makes the
      // field one value, which is what the calibration assumed all along. §2.9 grades the plate's
      // darkest and lightest tone, so this also stops a lens effect being scored as lighting.
      // The board's own PostChain is untouched — this is the lab's instance.
      post.vignette = 0;
      const gradeUniforms = post.gradePass?.material?.uniforms;
      if (gradeUniforms?.uVignette) gradeUniforms.uVignette.value = 0;
      else console.error('[industrial-lab] post grade exposes no uVignette — the lens vignette is still on, and leak six is open');
    } else post.setSize(w, h);
  }
}
window.addEventListener('resize', resize);
resize();

// A CLIPPED LOT IS LOUD NOW, in the same spirit as the 60 kB blank-plate floor in the driver.
//
// `labFill.full.clipped` has been in `stats.json` since this harness landed and it read `true` on
// both subjects for every plate of round 1. Nothing was reading the field, so the harness recorded
// a run of successes over plates whose base tray was cut by the frame — and the r1 harsh critic
// then identified our side partly on that, because `blind-pair.mjs` derives the subject box from
// the flood-fill's complement and a cut lot both hard-edges the panel and inflates the box.
// Silence about a defect the harness already measured is the failure family this file exists to
// prevent.
//
// The check runs here rather than inside `stats()` because the driver sets the viewport BEFORE it
// navigates, so the module-level `resize()` above has already solved the fit at the aspect the
// plate will be shot at. Stations that cut the lot on purpose declare `cropsLot`.
{
  const stationKey = VIEWS[VIEW] ? VIEW : 'three-quarter';
  const station = MODE === 'row' && VIEWS[stationKey].row
    ? { ...VIEWS[stationKey], ...VIEWS[stationKey].row }
    : VIEWS[stationKey];
  const lot = fillFraction(FIT_BOXES.full);
  if (lot?.clipped && !station.cropsLot) {
    console.error(
      `[industrial-lab] LOT IS CLIPPED by the frame on station "${stationKey}" `
      + `(${MODE}, ${mounted.map((m) => m.id).join(',') || 'no subject'}) — the base tray, the `
      + 'boundary or the stored goods are cut at a frame edge. blind-pair.mjs takes the subject '
      + 'box from what its flood fill cannot reach, so this panel gets a hard straight edge AND '
      + 'an inflated box that shrinks the building against the reference. Raise the station\'s '
      + 'elevation or margin, or declare cropsLot if the crop is the point.',
    );
  }
}

if (lighting.profile) sunDirection(lighting.profile);

let frameIndex = 0;
let elapsed = 0;
let lastRender = { calls: 0, triangles: 0, lines: 0, points: 0 };
function drawFrame() {
  frameIndex += 1;
  elapsed += 1 / 60;
  const camDistance = camera.position.distanceTo(target);
  lighting.update(camera, target, camDistance);
  sky.update(1 / 60, elapsed);
  // The temporal resolve needs several sub-frames inside one submitted frame, because the
  // capture pumps by hand and never presents the intervening RAF ticks.
  // Eight, not two. `post.js` says it plainly in its own header: a captured frame at accumulate 2
  // "only ever gets taaConvergeFrames = 2 of the 8 Halton phases — kept a raw staircase on every
  // diagonal kerb". Four blind critics independently identified the game render by
  // "stair-stepped aliasing on every fence rail and roof ridge against clean AA on the
  // reference", which is that staircase at 2 of 8 phases. A palisade fence and a sawtooth roof
  // are the two worst subjects in the programme for it. A fidelity plate is not a game frame and
  // can afford the full sequence.
  if (post) post.render(scene, camera, { accumulate: 8, elapsed, index: frameIndex });
  else renderer.render(scene, camera);
  // Read before the reset, or the stats call that follows the last frame reads zeros.
  lastRender = {
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    lines: renderer.info.render.lines,
    points: renderer.info.render.points,
  };
  renderer.info.reset();
}

/**
 * Screen-space share of the frame the fitted subject occupies, as a fraction of width and
 * height. This is the number that caught the residential framing leak — a blind critic measured
 * our subject at ~45% of frame width against the reference pack's 85% — so the harness now
 * measures it itself rather than waiting for a critic to notice. Projected bounding box, so it
 * is an upper bound on the true silhouette; the capture driver measures the rendered pixels too.
 */
function fillFraction(box) {
  if (!box || box.isEmpty()) return null;
  camera.updateMatrixWorld(true);
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  const p = new THREE.Vector3();
  for (const corner of cornersOf(box)) {
    p.copy(corner).project(camera);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  // NDC is -1..1, so a full-frame subject spans 2 on each axis.
  return {
    widthPct: Math.round(((Math.min(maxX, 1) - Math.max(minX, -1)) / 2) * 1000) / 10,
    heightPct: Math.round(((Math.min(maxY, 1) - Math.max(minY, -1)) / 2) * 1000) / 10,
    clipped: minX < -1 || maxX > 1 || minY < -1 || maxY > 1,
  };
}

/** Per-subject triangle / part / material-bucket report. */
function subjectStats(m) {
  let tris = 0; let parts = 0;
  const buckets = new Set();
  m.group.traverse((o) => {
    if (!o.isMesh) return;
    parts += 1;
    const idx = o.geometry.index;
    tris += (idx ? idx.count : o.geometry.attributes.position.count) / 3;
    if (o.material) buckets.add(o.material.uuid);
  });
  return {
    id: m.id,
    parts,
    triangles: Math.round(tris),
    // V332 §3: `board.js` creates one InstancedMesh per material bucket per batch key, so the
    // bucket count IS the per-subject draw-call cost on the board. Measured, never assumed.
    materialBuckets: buckets.size,
    drawCallsOnBoard: buckets.size,
  };
}

// Deterministic frame pump for headless capture. Contract mirrors `window.__resLab` exactly so
// `capture-industrial-aaa.mjs` stays a near-copy of `capture-residential.mjs`.
window.__indLab = {
  ready: true,
  mode: MODE,
  id: ID,
  view: VIEW,
  ids: INDUSTRIAL_IDS,
  studio: STUDIO,
  timeOfDay: TIME_OF_DAY,
  // Echoed back so `stats.json` records which façade a plate was shot on rather than assuming the
  // default. Half the §2d roof contract only exists on odd façades.
  facade: FACADE,
  step(n = 1) { for (let i = 0; i < n; i += 1) drawFrame(); },
  setView(view) { placeCamera(view); drawFrame(); },
  /**
   * Rescale the whole studio backdrop — shell and ground together — and redraw. Calibration only:
   * bisect this against a screenshot until the field lands on `blind-pair.mjs`'s target, then fold
   * the answer back into `SHELL_RENDER_GAIN` and leave the bias at 1. A capture run must never
   * pass `?fieldbias=`; a plate shot on a bias is a plate whose backdrop does not match the
   * constant the source claims.
   */
  setFieldBias(k) {
    const arr = Array.isArray(k) ? k : [k, k, k];
    fieldBias = arr.map((n) => Number(n) || 1);
    paintShell();
    if (STUDIO) {
      const band = biasedLow();
      groundMat.color.setRGB(
        band[0] / GROUND_LIGHT_GAIN[0],
        band[1] / GROUND_LIGHT_GAIN[1],
        band[2] / GROUND_LIGHT_GAIN[2],
      );
      groundMat.needsUpdate = true;
    }
    drawFrame();
    return fieldBias;
  },
  /**
   * Move the two grade terms this lane owns and redraw. Calibration only, same contract as
   * `setFieldBias`: sweep it against screenshots, fold the answer back into `GRADE_LIFT` /
   * `GRADE_TOE`, and leave the constants doing the work. Every other term of the grade is the
   * residential lane's and is not reachable from here, because the rest of it is wanted.
   *
   * RE-DERIVE THE FIELD CALIBRATION IN THE SAME PASS. `SHELL_RENDER_GAIN` is a property of the rig
   * AND of the grade — the backdrop goes through the same LUT the building does — so moving lift
   * or toe moves the studio field, and the field is what closed leak six. The procedure is written
   * beside `SHELL_RENDER_GAIN` and takes one page load.
   */
  setGradeTerms({ lift, toe } = {}) {
    if (Number.isFinite(Number(lift))) gradeLift = Number(lift);
    if (Array.isArray(toe) && toe.length === 3 && toe.every((n) => Number.isFinite(Number(n)))) {
      gradeToe = toe.map(Number);
    }
    const applied = applyLabGrade();
    drawFrame();
    return applied;
  },
  /** The grade this plate was actually shot under, read back rather than assumed. */
  gradeTerms() { return { lift: gradeLift, toe: [...gradeToe], defaults: { lift: GRADE_LIFT, toe: [...GRADE_TOE] } }; },
  /**
   * Flatten every mounted subject material to one authored albedo, or `null` to restore.
   * Measurement only — see the note on `applyProbeAlbedo`. This is how the albedo slope per
   * channel is measured: set a value, step, read the ROI, set a second value, read again.
   */
  setProbeAlbedo(hex) { const v = applyProbeAlbedo(hex); drawFrame(); return v; },
  /** Triangles, draw calls and material buckets per subject — the §3 budget read for the ledger. */
  stats() {
    const subjects = mounted.map(subjectStats);
    const totals = subjects.reduce((acc, s) => ({
      parts: acc.parts + s.parts,
      triangles: acc.triangles + s.triangles,
      materialBuckets: acc.materialBuckets + s.materialBuckets,
    }), { parts: 0, triangles: 0, materialBuckets: 0 });
    return {
      mode: MODE,
      view: VIEW,
      facade: FACADE,
      subjects,
      // Frame-level, from `renderer.info` on the last submitted frame. With the post chain on,
      // this includes the post passes — it is a frame cost, not a per-subject one, and the
      // per-subject number a seat is graded on is `materialBuckets` above.
      frameDrawCalls: lastRender.calls,
      frameTriangles: lastRender.triangles,
      // Back-compat keys so a residential-shaped consumer reads the same fields.
      parts: totals.parts,
      triangles: totals.triangles,
      archetypes: mounted.length,
      fill: {
        // `station` is the box this view actually fitted, after its height/depth clips; the other
        // two are the unclipped building and whole-yard boxes, so a seat can see what the clip
        // gave away. All three are PROJECTED-BOX numbers and therefore upper bounds on the
        // rendered silhouette — the capture driver measures the plate's own pixels as well.
        station: fillFraction(fitBoxFor(
          FIT_BOXES[(VIEWS[VIEW] ?? VIEWS['three-quarter']).fit ?? 'building'] ?? fitBounds,
          (MODE === 'row' && VIEWS[VIEW]?.row) ? { ...VIEWS[VIEW], ...VIEWS[VIEW].row } : (VIEWS[VIEW] ?? VIEWS['three-quarter']),
        )),
        building: fillFraction(FIT_BOXES.building),
        full: fillFraction(FIT_BOXES.full),
      },
      // Hoisted out of `fill.full.clipped` so a reader cannot miss it. `cropsLot` says the station
      // means it; without that flag a true here is a defect and the console carries the warning.
      lotClipped: Boolean(fillFraction(FIT_BOXES.full)?.clipped),
      lotCropIntended: Boolean((VIEWS[VIEW] ?? VIEWS['three-quarter']).cropsLot),
      // What the studio seamless was authored at, in the sRGB bytes `blind-pair.mjs` repaints its
      // field to. Recorded so the leak-six fix is checkable from `stats.json` rather than from a
      // comment claiming it landed.
      studioField: STUDIO ? { target: FIELD_TARGET_SRGB, dim, tint } : null,
      // The two grade terms this lane overrides, recorded per plate. A plate shot before the
      // override landed and a plate shot after are otherwise indistinguishable in the record, and
      // the whole finding was that a grade nobody had noticed was setting the colour of every
      // review plate. `probeAlbedo` is non-null only on a measurement page and never on a plate.
      grade: { lift: gradeLift, toe: [...gradeToe], residential: { lift: 0.052, toe: [1.12, 1.14, 1.18] } },
      probeAlbedo: probeSaved.size ? probeSaved.size : null,
    };
  },
  /**
   * The framing boxes and the yard-filter verdict per part. A seat that renames its geometry
   * loses the tighter crop silently otherwise — this is how you check the filter did something
   * before believing a fill number.
   */
  boxes() {
    const dump = (b) => (b && !b.isEmpty()
      ? { min: b.min.toArray(), max: b.max.toArray(), size: b.getSize(new THREE.Vector3()).toArray() }
      : null);
    const parts = [];
    for (const m of mounted) {
      m.group.traverse((node) => {
        if (!node.isMesh) return;
        const name = node.geometry?.name ?? '';
        const b = new THREE.Box3().setFromObject(node);
        parts.push({
          name, yard: isYardPart(name), size: b.getSize(new THREE.Vector3()).toArray().map((n) => Math.round(n * 100) / 100),
        });
      });
    }
    return {
      building: dump(FIT_BOXES.building),
      dock: dump(FIT_BOXES.dock),
      corner: dump(FIT_BOXES.corner),
      full: dump(FIT_BOXES.full),
      framePlausible,
      yardHeight: YARD_HEIGHT,
      cornerCrop: { x: CORNER_X, z: CORNER_Z, span: CORNER_SPAN, height: CORNER_H, top: cornerTop },
      // Where the yard stops and the building starts, sampled. A kit that merges its parts by
      // material bucket cannot be filtered by name, so this profile is how a seat checks that the
      // height threshold is cutting in the right place instead of assuming it.
      profile: [0.5, 1.2, 2.0, 2.6, 3.4, 4.5, 6.0].map((h) => ({
        above: h,
        size: dump(frameBoxAbove(h))?.size.map((n) => Math.round(n * 100) / 100) ?? null,
      })),
      parts,
    };
  },
  archetypeLabel(id) { return ARCHETYPES[id]?.label ?? id; },
};

drawFrame();
