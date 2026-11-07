// District Deck — human figure fidelity lab (V3.32).
//
// Renders the cast, the auction ring and the ambient street through the RUNTIME material
// library, lighting rig, post chain and sky dome, so a vision critic grades the same pixels the
// board draws. A studio of its own would grade a studio.
//
//   ?mode=hero&id=<archetypeId>      one figure, three-quarter, hero distance   2.1–2.5, 2.8, 2.9
//   ?mode=turn&id=<archetypeId>      one figure, eight yaw steps in a strip     2.1, 2.2
//   ?mode=walk&id=<archetypeId>      one figure, eight phases of the cycle      2.7
//   ?mode=lineup                     the whole cast side by side, one scale     2.6
//   ?mode=board                      figures on a real board street, play alt.  2.10
//   ?mode=crowd                      the auction ring                           2.10
//   ?mode=ambient                    a populated street at distance             2.10
//   &value=1                         any mode through a luminance-only pass     2.9
//   &blind=1                         figure modes in the reference pack's frame  §4
//
// Further knobs: `&ground=concrete|asphalt|sand|foliage|timber|limestone` (the palette must
// survive every ground the board draws, §2.9), `&tod=<0..1>`, `&quality=`, `&post=off`,
// `&phase=<0..1>` with `&motion=1` to pose a still mode mid-cycle, `&seed=`, `&hud=1`.
//
// Deterministic: no `Math.random`, no `Date.now`, no wall clock. Frames are driven by hand
// through `window.__peopleLab.step(n)` so a headless capture never races the RAF loop.

import * as THREE from 'three';
import { TILE } from './core/grid.js';
import { createCity } from './core/city.js';
import { createRun } from './core/state.js';
import { MaterialLibrary } from './render/materials.js';
import { LightingRig, sunDirection } from './render/lighting.js';
import { PostChain } from './render/post.js';
import { SkyDome } from './render/sky.js';
import { AuctionCrowdLayer, PeopleLayer } from './render/people.js';
import { AmbientLifeLayer } from './render/ambient-life.js';
import { MeshyPeoplePool } from './render/people/meshy-people.js';
import { BODY_ARCHETYPES, FIGURE_SCALE, unitFrom } from './render/people/core.js';
import { PeopleFigureBatch, castFigure } from './render/people/index.js';
import { styleForPerson } from './render/people/cast.js';

/** Every figure the cast draws, in spec §1 order. */
export const PEOPLE_IDS = Object.freeze([...BODY_ARCHETYPES]);

const params = new URLSearchParams(location.search);
const MODE = params.get('mode') ?? 'hero';
const ID = params.get('id') ?? 'property-agent';
const VALUE = params.get('value') === '1' || MODE === 'value';
const SEED = params.get('seed') ?? 'DD-SHOT-0001';
const QUALITY = params.get('quality') ?? 'high';
const POST_ON = params.get('post') !== 'off';
const GROUND = params.get('ground') ?? 'concrete';

const CITY_MODES = new Set(['board', 'crowd', 'ambient']);
const isCityMode = CITY_MODES.has(MODE);

/**
 * `&blind=1` — the presentation the §4 blind gate is composited from. Figure modes only; the
 * three city modes are graded in situ and have no reference counterpart to match.
 *
 * Spec §4 puts a District Deck plate and a `_reference-mp/` plate side by side as A and B and
 * asks a harsh critic which figure it would rather have on a board. That question is only worth
 * asking if nothing except the figure separates the two panels, and the two packs were shot in
 * different frame languages. The reference stands its piece on a neutral warm-grey tile with a
 * clean dark edge against a plain pale blue-grey field, in bright even daylight, with the
 * contact shadow directly under the feet. The lab stands ours on a board ground family under
 * the runtime sky: a horizon line across the upper third, a textured receding plane, and a
 * raking mid-afternoon key throwing a shadow half the frame long.
 *
 * The first attempt at closing that gap lived in the compositor, which measured each panel's
 * backdrop and repainted both to one shared target. On a building plate that works. On these it
 * did not: the fill grew out of the pale blue field into the reference's denim and white cotton,
 * left the enclosed wedge between the legs unfilled as a blue island, and handed the critic one
 * artefacted panel and one clean one — which is worse than no blind round at all, because a
 * critic grades it anyway. Backdrop surgery is the wrong layer. Render our plate in the
 * reference's frame language and there is nothing left to normalise.
 *
 * **Only the backdrop and the ground plate change.** The figure keeps the runtime
 * `MaterialLibrary`, `LightingRig` and `PostChain` exactly as the board draws them, at the
 * board's own time of day — the point of this lab is that a critic grades the pixels the board
 * draws, and a bespoke studio would grade a studio.
 *
 * The light is left alone deliberately, and the reason is worth recording because the obvious
 * move is wrong. The reference register asks for "bright even daylight" and the lab's default
 * hour is described in the line below as a raking key, so the first version of this took
 * `timeOfDay` to noon. Measured against `solarProfile()`, that buys nothing: elevation runs
 * `3 + sin(πt)·38` degrees, so the default 0.42 is already 39.8° against noon's 41.0°, and key
 * intensity 4.30 against 4.35. The long shadow on the old plates was never the hour — it was an
 * infinite ground plane to fall across. On a tile it lands where the reference's lands, and the
 * blind figure is lit by exactly the rig that the dimension gate grades.
 */
const BLIND = params.get('blind') === '1' && !isCityMode;

// Board default: the mid-afternoon raking key `scene.js` ships, so the lab and the game agree.
/**
 * The board's mid-afternoon raking key, except under `&blind=1`.
 *
 * The blind pass already replaces the backdrop and the ground with the reference pack's own, so
 * that the comparison measures the figure rather than the frame language. The key is the same
 * class of thing and was the last systematic sorting tell left: at 0.42 a 3.8 m figure throws a
 * 4.5 m shadow, so every one of our panels carried a long cool band running out across the tile
 * against the reference's compact pool under the boots — one difference with a consistent
 * direction across every pair, which is all a critic needs to sort the set without looking at a
 * figure.
 *
 * Only the sun's elevation moves. Materials, geometry, the material library, the post chain and
 * the grade are the board's throughout, so what is being compared is still our figure and not a
 * studio of its own. Recorded rather than silent, because normalising a *light* to win a blind
 * round would be staging the test — this normalises it so the test measures what it claims to.
 */
const BLIND_TIME_OF_DAY = 0.5;
const TIME_OF_DAY = Number(params.get('tod') ?? (BLIND ? BLIND_TIME_OF_DAY : 0.42));
// Still modes freeze at the reduced-motion pose by default (§3: reduced motion must produce a
// readable figure, not a disabled one). `&motion=1` poses them mid-cycle instead.
const FORCED_MOTION = params.get('motion') === '1';
const PHASE = Number(params.get('phase') ?? 0.5);

const canvas = document.getElementById('lab');
if (VALUE) canvas.classList.add('value');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !POST_ON,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// The chain owns the transfer curve. Leaving three's tone mapping on applies it twice.
renderer.toneMapping = POST_ON ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.32;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#4a7ab0');

/**
 * The blind backdrop: a plain pale blue-grey field with the faint top-to-bottom lift the
 * reference plates carry, measured across the four `_reference-mp/` plates this round pairs
 * against (corner medians 174-186 / 195-212 / 211-235, bottom about six levels above top).
 *
 * These are scene-space values, not the numbers that land in the file. Everything the lab draws
 * goes through the post chain's mp-calibrated grade — one stop of exposure, contrast +0.336 on
 * a 0.30 pivot, saturation +0.255, AgX — so the input was calibrated by rendering and measuring
 * rather than by picking the target colour and hoping.
 *
 * The tint carries a small deterministic per-plate offset. A backdrop that is byte-identical on
 * every District Deck plate while each reference plate was generated independently and varies is
 * the exact tell that cost the residential programme rounds 17 and 18: one corner pixel sorted
 * the panels. The offset stays inside the spread the reference pack itself shows, and it is a
 * hash of the plate identity, so a round is reproducible.
 */
const BLIND_BACKDROP = Object.freeze({
  // Calibrated by capture-and-measure, 2026-08-11, in two passes. The first took the reference's
  // own sRGB straight into the scene and came back at (219,223,226) — thirty-eight levels light
  // in red and almost neutral, because one stop of exposure had carried it onto the AgX shoulder
  // where the channels converge. The second landed at (193,214,232) at frame centre, which is
  // inside the pack's range but consistently at the top of it: every reference plate measured
  // 180-188 there and ours measured 193 on all three plates. Sitting inside the range is not the
  // same as being indistinguishable from it, and a side that is reliably the brightest is a
  // sortable side. The third pass corrected an over-shoot the other way: green and blue landed
  // on the pack's own means at the frame corner (198.5 against 199.8, 219.5 against 218.8) but
  // red sat 4.7 levels under it on all four plates, and a consistent direction is what makes an
  // offset sortable, not its size. Red alone is scaled; measured corner medians are now
  // 174-179 against the pack's 174-179.
  base: [0.192, 0.315, 0.500],
  lift: [0.012, 0.014, 0.012],   // bottom of frame, added to base
  // Per-plate deterministic offset, ± this. Sized by measuring: the first spread came out at
  // about ±1.5 output levels while the reference pack's four plates span 181-189 / 205-213 /
  // 219-233, so ours varied a fifth as much as theirs. Being inside their range is not the same
  // as varying like them, and "one side's backdrop is always the same number" is precisely the
  // corner-pixel tell that voided residential rounds 17 and 18. Scaled to land at about
  // ±4 / ±4 / ±7 output levels, which is the pack's own spread; most of it is in blue, as the
  // pack's is.
  spread: [0.027, 0.034, 0.085],
});

/** A vertical two-stop gradient as a background texture. No file, no fetch, deterministic. */
function blindBackdropTexture(seedKey) {
  // `unitFrom`, not raw `hash32`. FNV-1a's high bits are correlated across keys that differ
  // only in a trailing character, so hashing ":0" / ":1" / ":2" gave all three channels the same
  // sign and nearly the same magnitude — a brightness wobble rather than a tint, and two
  // measured plates came back one code value apart. `unitFrom` runs the avalanche afterwards,
  // which is the whole reason it exists.
  const jitter = (index) => (
    (unitFrom(`v332-blind-backdrop:${seedKey}:${index}`, 17) * 2 - 1)
    * BLIND_BACKDROP.spread[index]
  );
  const offset = [jitter(0), jitter(1), jitter(2)];
  // The canvas is an sRGB surface, so the linear scene value is encoded here rather than left
  // for a colour-space guess further down the chain.
  const encode = (v) => {
    const x = Math.min(1, Math.max(0, v));
    return Math.round(255 * (x <= 0.0031308 ? x * 12.92 : 1.055 * (x ** (1 / 2.4)) - 0.055));
  };
  const stop = (t) => {
    const parts = BLIND_BACKDROP.base
      .map((v, i) => encode(v + offset[i] + BLIND_BACKDROP.lift[i] * t));
    return `rgb(${parts[0]},${parts[1]},${parts[2]})`;
  };
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, stop(0));
  grad.addColorStop(1, stop(1));
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// —— the city, for the three modes that need a real board underneath the figures ————————
const city = isCityMode
  ? createCity({ seed: MODE === 'crowd' ? (params.get('seed') ?? 'DD-SHOT-0002') : SEED })
  : null;
const state = city ? createRun({ city }) : null;

// The figure stage is a few tiles across, so the rig's shadow band and environment bake match
// the board's own numbers rather than a bespoke studio setup.
const extent = city ? city.extent : { x: TILE * 4, z: TILE * 4 };
const centre = city
  ? new THREE.Vector3(extent.x / 2, 0, extent.z / 2)
  : new THREE.Vector3(0, 0, 0);
if (city) scene.fog = new THREE.Fog('#6a8aaa', extent.x * 3.2, extent.x * 6.5);

const materials = new MaterialLibrary({ quality: QUALITY });
const lighting = new LightingRig(scene, extent, {
  quality: QUALITY, timeOfDay: TIME_OF_DAY, renderer,
});
lighting.bakeEnvironment();
// The dome is the horizon, and the horizon is half of the frame-language gap. `bakeEnvironment`
// builds its own equirect from the solar profile and does not read the dome, so the figure keeps
// the runtime environment light either way — only what the camera sees behind it changes.
const sky = BLIND ? null : new SkyDome(scene, extent, {
  quality: QUALITY, reducedMotion: true, timeOfDay: TIME_OF_DAY,
});
if (BLIND) scene.background = blindBackdropTexture(`${MODE}:${MODE === 'lineup' ? 'cast' : ID}`);

const root = new THREE.Group();
root.name = 'v332:people-lab';
scene.add(root);

// —— ground ————————————————————————————————————————————————————————————————————————————
// The figure modes stand on one of the board's own ground families, because §2.9 grades the
// cast palette against asphalt, footpath, grass, sand, boardwalk and site mud, and a bespoke
// grey card would answer none of that. City modes get their ground from the board itself, and
// the blind pass gets the reference pack's tile instead (built below, once the figures have
// been placed and their footprint is known).
if (!isCityMode && !BLIND) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(extent.x * 3, extent.z * 3),
    materials.get(GROUND, { variant: `people-lab-${GROUND}` }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(centre.x, 0, centre.z);
  ground.receiveShadow = true;
  root.add(ground);
}

// —— what each mode puts in front of the camera ————————————————————————————————————————
// Cell pitch is set by the contact decal, not by the shoulders: at 2.6 m the discs of adjacent
// cells just touch, and any closer puts two overlapping contact shadows under one figure, which
// is the kind of harness artefact a critic grades as a defect in the figure.
//
// **Every pitch and mark in this section is figure-relative and takes `FIGURE_SCALE`. g03.** The
// decal the 2.6 was set against is `PROPORTIONS.contactR`, which moved with stature; held at 2.6
// the strip would be eight figures adrift in a field of ground, the camera would fit the row
// rather than the figures, and a critic would grade the harness as "they have become coloured
// ticks". Every number is left as the round that measured it wrote it.
const CELL_PITCH = 2.6 * FIGURE_SCALE;
/**
 * The dog is 2.35 m nose to tail against a biped's ~0.7 m footprint, so at the shared 2.6 m
 * pitch adjacent dogs almost touch and a strip of them reads as a jumble rather than as eight
 * phases of one animal. A critic grading §2.7 off that plate grades the harness. Quadrupeds get
 * their own pitch; the biped pitch is unchanged, so no existing plate moves.
 */
const QUADRUPED_CELL_PITCH = 3.0 * FIGURE_SCALE;
/**
 * Four cells for a quadruped, not eight. At eight the strip is 35 m wide against a 0.96 m
 * subject, so the camera fits the row and the dog lands at about 6% of frame height — separable,
 * and still ungradeable, which is what the r02 critic reported. Four cells at 3.0 m is 12 m of
 * row and puts the animal near a fifth of frame height. Half a cycle of a diagonal trot is the
 * whole cycle mirrored, so nothing is lost by showing four.
 */
const QUADRUPED_STRIP_CELLS = 4;
const cellsFor = (archetypeId) => (archetypeId === 'dog' ? QUADRUPED_STRIP_CELLS : STRIP_CELLS);

/**
 * Ground reference marks under a walk strip.
 *
 * §2.7's no-skating clause has gone four rounds graded only arithmetically, by the same seats
 * that wrote the gait — the r02 critic pointed out that a critic has never been able to check it,
 * because a phase strip has no ruler in it.
 *
 * **State the limit honestly, because a mark that implies more than it shows is worse than none.**
 * A phase strip is eight *stationary* figures, so it cannot show skating: skating is a property of
 * motion over time and only a time-sampled track can carry it. What these marks do show is foot
 * *placement* — whether the planted foot sits at the same offset within its own cell across the
 * stance phases, whether the two contacts are symmetric about the cell, and whether the sole meets
 * the ground rather than floating or sinking. That is three of the four things a critic was being
 * asked to take on trust. A time-sampled `track` mode is the remaining piece and is not built.
 */
function addGroundMarks(count, archetypeId) {
  const pitch = pitchFor(archetypeId);
  const group = new THREE.Group();
  group.name = 'v332:ground-marks';
  // Opacity chosen off a plate, not authored: at 0.34/0.16 the marks were invisible against a
  // pale concrete ground through the post grade, which is a ruler nobody can read.
  const mark = new THREE.MeshBasicMaterial({ color: '#1a1a1a', transparent: true, opacity: 0.72 });
  const minor = new THREE.MeshBasicMaterial({ color: '#1a1a1a', transparent: true, opacity: 0.42 });
  // One heavy rule on each cell's centre line, four light ones subdividing it, all flush with
  // the ground so they read as a ruler rather than as scenery the figure might be standing on.
  for (let cell = 0; cell < count; cell += 1) {
    const x0 = stripX(cell, count, archetypeId);
    for (let tick = -2; tick <= 2; tick += 1) {
      const heavy = tick === 0;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(
          (heavy ? 0.075 : 0.038) * FIGURE_SCALE, (heavy ? 2.1 : 1.4) * FIGURE_SCALE,
        ),
        heavy ? mark : minor,
      );
      plane.rotation.x = -Math.PI / 2;
      // The 6 mm lift is depth-buffer clearance, not a ruler dimension, and stays put.
      plane.position.set(x0 + tick * (pitch / 5), 0.006, centre.z);
      plane.renderOrder = 1;
      group.add(plane);
    }
  }
  root.add(group);
}
const STRIP_CELLS = 8;
/** Idle is four cells, matching `mp-idle.png`. */
const IDLE_CELLS = 4;
/**
 * The blind lineup packs tighter, and only the blind lineup.
 *
 * `mp-lineup.png` stands its seven figures shoulder to shoulder, and its subject measures
 * 1536 x 525 — aspect 2.93. The whole eleven-figure cast at the 2.6 m grading pitch is about
 * 6.4, and the compositor refuses a pair whose two subjects differ in aspect by more than 1.45x:
 * at that gap there is no single box that shows both at one size, one side ends up a cluster in
 * an empty field, and framing is a tell. Seven figures at 1.45 m measure 2099 x 747 — aspect
 * 2.81, a gap of 1.04 — and both panels then cover their box completely, with nothing extended.
 *
 * Nothing §2.6 grades moves with the pitch: the variation gate reads build, width, posture and
 * wardrobe across the row, not the gaps between figures. The grading lineup keeps 2.6 m, where
 * the contact decals just touch and no figure carries two shadows.
 */
const BLIND_LINEUP_PITCH = 1.45 * FIGURE_SCALE;
/**
 * The blind walk strip packs tighter for the same reason, and the number is set by coverage
 * rather than by aspect alone. `mp-walk-strip.png` measures 1536 x 386 and its plank runs off
 * both frame edges, so the reference source carries no air beside its subject: any panel wider
 * than that subject has to be filled by continuing its border column, and at the 2.6 m grading
 * pitch our strip is 5.31 against its 3.98, which left a quarter of the reference panel extended
 * and two visible vertical seams down one side of the pair. At 1.75 m ours measures about 3.9
 * and both panels cover their box outright. The reference's own eight cells overlap slightly at
 * full stride; so do ours at this pitch, which is the register rather than a defect.
 */
const BLIND_WALK_PITCH = 1.75 * FIGURE_SCALE;
const pitchFor = (archetypeId) => {
  if (archetypeId === 'dog') return QUADRUPED_CELL_PITCH;
  if (BLIND && MODE === 'lineup') return BLIND_LINEUP_PITCH;
  if (BLIND && MODE === 'walk') return BLIND_WALK_PITCH;
  return CELL_PITCH;
};

let batch = null;
let people = null;
let crowd = null;
let ambient = null;
/** Subject box the camera frames, and the point it aims at. */
let subject = new THREE.Box3();
let focus = centre.clone();

/** Exact bounds of everything the batch has written, instance by instance. */
function batchBounds(figureBatch) {
  const box = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  const cell = new THREE.Box3();
  for (const mesh of figureBatch.meshes) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    for (let index = 0; index < mesh.count; index += 1) {
      mesh.getMatrixAt(index, matrix);
      cell.copy(mesh.geometry.boundingBox).applyMatrix4(matrix);
      box.union(cell);
    }
  }
  return box;
}

/** Mount the cast batch and write one frame of figures into it. */
function mountFigures(figures, { reducedMotion }) {
  batch = new PeopleFigureBatch({ capacity: Math.max(figures.length, PEOPLE_IDS.length) });
  root.add(...batch.meshes);
  batch.write(figures, { phase: PHASE, reducedMotion });
  subject = batchBounds(batch);
  focus = subject.getCenter(new THREE.Vector3());
}

/** Cell x positions for an n-cell strip centred on the stage. */
function stripX(index, count, archetypeId = null) {
  return centre.x + (index - (count - 1) / 2) * pitchFor(archetypeId);
}

const stillMotion = !FORCED_MOTION;

if (MODE === 'hero') {
  // Three-quarter comes from turning the figure, not the camera: the lens stays square to the
  // stage so the ground plane, the contact shadow and the strip modes all share one station.
  mountFigures(
    [castFigure({ id: `hero:${ID}`, archetypeId: ID, x: centre.x, z: centre.z, yaw: -0.62 })],
    { reducedMotion: stillMotion },
  );
} else if (MODE === 'turn') {
  // Eight yaw steps of one figure. Same id in every cell, so any difference between cells is
  // the rotation and nothing else.
  mountFigures(
    Array.from({ length: STRIP_CELLS }, (unused, index) => castFigure({
      id: `turn:${ID}`,
      archetypeId: ID,
      x: stripX(index, STRIP_CELLS, ID),
      z: centre.z,
      yaw: (index / STRIP_CELLS) * Math.PI * 2,
    })),
    { reducedMotion: stillMotion },
  );
} else if (MODE === 'walk') {
  // Eight evenly spaced phases of ONE gait cycle of ONE figure, in profile — the read §2.7 is
  // graded from. Profile because stride length, knee break, foot roll and the pelvic drop all
  // read side-on and none of them read front-on.
  const walkCells = cellsFor(ID);
  mountFigures(
    Array.from({ length: walkCells }, (unused, index) => castFigure({
      id: `walk:${ID}`,
      archetypeId: ID,
      x: stripX(index, walkCells, ID),
      z: centre.z,
      yaw: Math.PI / 2,
      phase: index / walkCells,
    })),
    { reducedMotion: false },
  );
  addGroundMarks(walkCells, ID);
} else if (MODE === 'idle') {
  // Four cells of ONE figure standing, differing only in the idle beat — the read §2.7 grades
  // idle from, and the one mode the programme ran two rounds without. `mp-idle.png` is the
  // target: weight left, shifting, weight right, looking off.
  //
  // Three details are load-bearing, and each one silently produces a plausible-looking wrong
  // plate if it is missed. **No `phase`** — a descriptor carrying one sets `cycleRequested` in
  // the rig and the figure walks instead of standing. **`reducedMotion: false`** — true pins the
  // beat to `REDUCED_BEAT` and all four cells come out identical. **The same `id` in every
  // cell**, as `turn` already does, so the beat is the only thing that differs between them.
  mountFigures(
    Array.from({ length: IDLE_CELLS }, (unused, index) => castFigure({
      id: `idle:${ID}`,
      archetypeId: ID,
      x: stripX(index, IDLE_CELLS, ID),
      z: centre.z,
      yaw: -0.42,
      beat: index / IDLE_CELLS,
    })),
    { reducedMotion: false },
  );
} else if (MODE === 'lineup') {
  // The whole cast at one scale, facing front. Two figures a critic can pair by outline alone
  // is the §2.6 defect, and this is the plate that finds it.
  //
  // `&ids=` narrows the row. The grading plate always shows the whole cast; the blind pass
  // shows the same seven archetypes `mp-lineup.png` shows, because a strip of eleven against a
  // strip of seven is two subjects the compositor cannot put at one size in one box.
  const lineup = (params.get('ids') ?? '')
    .split(',').map((s) => s.trim()).filter((s) => PEOPLE_IDS.includes(s));
  const cast = lineup.length ? lineup : PEOPLE_IDS;
  // `family` is two figures, not one. `styleForPerson` resolves an adult or a child from the id
  // hash, so a lineup that instantiates one record per archetype shows whichever the hash picks —
  // and it picked the child, leaving the plate with no adult in it at all. §2.6 explicitly grades
  // "an adult and a child at genuinely different heights", and it could not be satisfied while
  // the harness only ever asked for one. Ids are chosen so the pair resolves one of each; the
  // assertion below fails the plate loudly rather than shipping a row that quietly lost a figure.
  const roster = cast.flatMap((archetypeId) => (archetypeId === 'family'
    ? [{ archetypeId, id: 'lineup:family-adult' }, { archetypeId, id: 'lineup:family-child' }]
    : [{ archetypeId, id: `lineup:${archetypeId}` }]));
  if (cast.includes('family')) {
    const heights = roster
      .filter((r) => r.archetypeId === 'family')
      .map((r) => styleForPerson(r.id, 'family')[1]);
    if (new Set(heights).size < 2) {
      throw new Error(`family lineup pair resolved to one height (${heights.join(', ')})`);
    }
  }
  mountFigures(
    roster.map(({ archetypeId, id }, index) => castFigure({
      id,
      archetypeId,
      x: stripX(index, roster.length),
      z: centre.z,
      yaw: 0,
    })),
    { reducedMotion: stillMotion },
  );
}

// —— city modes ————————————————————————————————————————————————————————————————————————
/**
 * A fault anywhere in the board's own module graph is reported, never swallowed and never
 * allowed to hang. `board.js` pulls in every building lane in the repo, and three of those are
 * being written by other seats at any given moment: a mid-save `ReferenceError` in one of them
 * throws out of `new Board(...)`, the module never reaches `window.__peopleLab`, and the capture
 * then sits on `waitForFunction` for its whole budget and reports a timeout. A timeout says
 * nothing about the cause; this says which module and which line.
 */
let labError = null;

if (isCityMode) {
  try {
    // The real board, loaded exactly as `play.html` loads it. A figure at play altitude has to be
    // graded against the streets it actually stands in.
    const [{ AssetRegistry }, { Board }] = await Promise.all([
      import('./render/assets.js'),
      import('./render/board.js'),
    ]);
    const registry = new AssetRegistry();
    await registry.loadAll();
    const board = new Board(city, registry, { quality: QUALITY });
    board.setReducedMotion(true);
    scene.add(board.root);
    board.syncOwnership(state, 'player');

    if (MODE === 'board') {
      // The live quarter spawns four or five people scattered across a whole city, so a plate
      // framed on their centroid is a plate of an empty road — which is what the first version of
      // this mode produced. §2.10 asks whether a *group* of figures reads as a crowd of
      // individuals at play altitude, so the whole cast is seated in one run along the board's
    // own walk graph — the same lattice the game routes its people down, kerbs, crossings and
    // all, rather than a line invented for the plate.
      // Renderer-only: `state` here is the lab's own `createRun`, never a live game state.
      const anchor = city.civicUses?.[0]
        ? { kind: 'civic', id: city.civicUses[0].id }
        : { kind: 'parcel', id: city.order[0] };
      const cast = PEOPLE_IDS.map((archetypeId) => ({
        id: `lab:${archetypeId}`,
        archetypeId,
        spawnedQuarter: 1,
        despawnAfterQuarter: 12,
        fromAnchor: { ...anchor },
        toAnchor: { ...anchor },
        intent: 'stand',
        interactionTarget: null,
        pendingOutcome: null,
        priority: 1,
      }));
      people = new PeopleLayer(city);
      scene.add(people.root);
      people.syncState({
        ...state,
        people: {
          order: cast.map(({ id }) => id),
          byId: Object.fromEntries(cast.map((person) => [person.id, person])),
        },
        avatars: {},
      });

      // Real footpath nodes, nearest the middle of the board, taken along one east–west run.
      const nav = people.navmesh;
      const midX = extent.x / 2;
      const midZ = extent.z / 2;
      const nodes = [...nav.nodes.values()]
        .map((node) => ({ x: node.x, z: node.z }))
        .filter((node) => !nav.isInsideBuilding(node.x, node.z))
        .sort((a, b) =>
          (Math.hypot(a.x - midX, a.z - midZ) - Math.hypot(b.x - midX, b.z - midZ))
          || a.x - b.x || a.z - b.z);
      const seedNode = nodes[0] ?? { x: midX, z: midZ };
      // Step along the corridor at the figure pitch rather than taking the next eleven navmesh
      // nodes: the node lattice is spaced tens of metres apart, so "the next eleven" spread the
      // cast across the whole board and the fit then framed the entire city from three hundred
      // metres up — a plate of a diorama, not of a street. Every seat is gated back onto the
      // walkable set, so a figure that lands on a footprint still steps off it.
      const picks = Array.from({ length: cast.length }, (unused, index) => {
        const x = seedNode.x + (index - (cast.length - 1) / 2) * CELL_PITCH;
        const safe = nav.enforceWalkable(x, seedNode.z);
        return { x: safe.x, z: safe.z };
      });
      cast.forEach((person, index) => {
        const record = people.records.get(person.id);
        if (!record) return;
        const spot = picks[index];
        // A short two-point path so the figure faces −Z, toward the camera side of the street.
        record.path = [
          new THREE.Vector3(spot.x, 0, spot.z + 0.5),
          new THREE.Vector3(spot.x, 0, spot.z - 0.5),
        ];
        record.routeHidden = false;
      });
      people.phase = 0.5;
      people.update(0);

      const placed = picks.slice(0, cast.length);
      focus = new THREE.Vector3(
        placed.reduce((sum, node) => sum + node.x, 0) / placed.length,
        0,
        placed.reduce((sum, node) => sum + node.z, 0) / placed.length,
      );
      const spanX = Math.max(...placed.map((n) => n.x)) - Math.min(...placed.map((n) => n.x));
      // The box sits ON the ground, not centred on it: `look` measures up from `subject.min.y`,
      // and a box straddling y = 0 puts the aim point below the pavement.
      subject.setFromCenterAndSize(
        new THREE.Vector3(focus.x, 4, focus.z), new THREE.Vector3(spanX + 8, 8, 16),
      );
    } else if (MODE === 'crowd') {
      const auction = structuredClone(state);
      const auctionId = auction.events.order
        .find((id) => auction.events.byId[id].type === 'auction');
      if (auctionId) auction.events.byId[auctionId].payload.crowdSize = 40;
      crowd = new AuctionCrowdLayer(city);
      scene.add(crowd.root);
      crowd.syncState(auction);
      const parcel = auctionId
        ? city.parcels[auction.events.byId[auctionId].anchorIds[0]]
        : null;
      if (parcel?.centre) focus = new THREE.Vector3(parcel.centre.x, 0, parcel.centre.z);
      subject.setFromCenterAndSize(
        new THREE.Vector3(focus.x, 4, focus.z), new THREE.Vector3(26, 8, 26),
      );
    } else {
      ambient = new AmbientLifeLayer(city, { quality: QUALITY, reducedMotion: false });
      scene.add(ambient.root);
      ambient.update(0, 0);
      // The reserve is where the ambient seeder puts its densest cluster, so it is where
      // "do pedestrians at distance still read as people rather than coloured ticks" is answered.
      const spot = city.reserve?.centre ?? { x: extent.x / 2, z: extent.z / 2 };
      focus = new THREE.Vector3(spot.x, 0, spot.z);
      subject.setFromCenterAndSize(
        new THREE.Vector3(focus.x, 5, focus.z), new THREE.Vector3(58, 10, 58),
      );
    }
    if (people || ambient) {
      const meshy = new MeshyPeoplePool();
      people?.attachMeshy(meshy);
      ambient?.attachMeshy(meshy);
      scene.add(meshy.root);
      meshy.load().catch(() => {});
    }
  } catch (error) {
    labError = String(error?.stack ?? error).slice(0, 1200);
    console.error('people-lab city mode failed:', labError);
  }
}

// —— the blind ground plate ————————————————————————————————————————————————————————————
/**
 * The reference pack's tile: "a simple neutral warm-grey ground plate with a clean dark edge,
 * exactly like a board-game piece standing on its own tile". Rounded rectangle, top face flush
 * with y = 0 so the figures stand on it and the runtime contact decal lands on its surface.
 *
 * It is sized from the figures rather than fixed, so a hero gets a tile and an eight-cell strip
 * gets the long thin plank `mp-walk-strip.png` and `mp-lineup.png` use. `PAD` is chosen so most
 * of the key's shadow falls on the plate rather than off its edge into the backdrop.
 *
 * `THICKNESS` is a blind-gate number, not a taste one. The compositor matches the two panels on
 * their measured bounding box, and the box includes the tile — so the tile's share of the box is
 * what decides whether our figure and the reference figure end up the same height on screen. The
 * reference pack's own share runs 12% (`mp-lineup`) to 30% (`mp-policeman`), mean about 18%, and
 * this is set to land ours near that mean so the residual runs in both directions across a set
 * rather than one way. There is no value that matches every reference plate, because the
 * reference pack is not internally consistent about its tile.
 */
const BLIND_PLATE = Object.freeze({
  // All three are fractions of the figure standing on the tile — `thickness` explicitly so, since
  // it is set to land the tile's *share of the measured bounding box* near the reference pack's
  // 18 per cent, and a share is a ratio. g03.
  pad: 0.6 * FIGURE_SCALE,
  thickness: 0.18 * FIGURE_SCALE,
  radius: 0.34 * FIGURE_SCALE,
  // Scene-space, calibrated through the same grade as the backdrop and the same key.
  top: '#4c473c',
  // Warm, not neutral. `#161616` rendered visibly navy: the rig's fill is a saturated sky blue,
  // and a dark neutral with any environment response takes the sky as its whole colour — the
  // same mechanism that turned a near-black boot blue in r01b. A charcoal edge against the
  // reference's charcoal edge was sorting the set on its own.
  edge: '#241f1c',
});

/** The blind tile, kept so its environment response can be trimmed after the rig tunes it. */
let blindPlate = null;

if (BLIND && !subject.isEmpty()) {
  const span = subject.getSize(new THREE.Vector3());
  const mid = subject.getCenter(new THREE.Vector3());
  const width = span.x + BLIND_PLATE.pad * 2;
  const depth = span.z + BLIND_PLATE.pad * 2;
  const radius = Math.min(BLIND_PLATE.radius, width / 2.5, depth / 2.5);

  const shape = new THREE.Shape();
  const hw = width / 2 - radius;
  const hd = depth / 2 - radius;
  shape.moveTo(-hw - radius, -hd);
  shape.lineTo(-hw - radius, hd);
  shape.quadraticCurveTo(-hw - radius, hd + radius, -hw, hd + radius);
  shape.lineTo(hw, hd + radius);
  shape.quadraticCurveTo(hw + radius, hd + radius, hw + radius, hd);
  shape.lineTo(hw + radius, -hd);
  shape.quadraticCurveTo(hw + radius, -hd - radius, hw, -hd - radius);
  shape.lineTo(-hw, -hd - radius);
  shape.quadraticCurveTo(-hw - radius, -hd - radius, -hw - radius, -hd);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: BLIND_PLATE.thickness, bevelEnabled: false, curveSegments: 6,
  });
  // The shape is authored in XY and extruded along +Z; the rotation lays it flat, which leaves
  // it occupying y ∈ [0, thickness], and the drop puts its TOP face at y = 0 — the plane the
  // figures' feet and the runtime contact decal already sit on.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(mid.x, -BLIND_PLATE.thickness, mid.z);

  blindPlate = new THREE.Mesh(geometry, [
    new THREE.MeshStandardMaterial({ color: BLIND_PLATE.top, roughness: 0.94, metalness: 0 }),
    (() => {
      const edge = new THREE.MeshStandardMaterial({
        color: BLIND_PLATE.edge, roughness: 0.78, metalness: 0,
      });
      // Stamped so `LightingRig.applyEnvironmentToScene` does not rewrite this from its
      // roughness heuristic and put the sky back into the edge.
      edge.userData.envIntensityBase = 0.05;
      return edge;
    })(),
  ]);
  blindPlate.name = 'v332:blind-plate';
  blindPlate.receiveShadow = true;
  blindPlate.castShadow = false;
  root.add(blindPlate);

  // The camera fit reads `subject`, so the tile has to be in it or the frame cuts it off.
  subject.union(new THREE.Box3().setFromObject(blindPlate));
}

lighting.applyEnvironmentToScene(scene);
if (blindPlate) {
  // The rig hands every standard material a full environment response, and on a near-vertical
  // face that is a mirror of the sky: the tile's edge came back at (97,96,108) — a blue-grey
  // band where the reference pack has a near-black one at (48,48,47). The tile is presentation
  // rather than a graded surface, so its response is trimmed here, after the rig has tuned it.
  blindPlate.material[0].envMapIntensity *= 0.70;
  blindPlate.material[1].envMapIntensity *= 0.42;
}
if (subject.isEmpty()) {
  subject.setFromCenterAndSize(
    centre, new THREE.Vector3(6, 4, 6).multiplyScalar(FIGURE_SCALE),
  );
}

const size = subject.getSize(new THREE.Vector3());
// Size the key's shadow camera to the subject plus the shadow it throws. The board's cascade
// ladder picks a band sized for a city, and a lone figure inside it lands on the far edge of
// the map where the shadow resolution is worst.
lighting.shadowRadius = isCityMode
  ? Math.max(size.x, size.z) * 0.9 + TILE
  // The 4 m pad is a figure's worth of shadow throw. Held fixed against a subject box that has
  // halved it would dominate the band and spend the shadow map on empty ground. g03.
  : Math.max(size.x, size.z) * 0.5 + size.y * 2 + 4 * FIGURE_SCALE;

// —— camera ————————————————————————————————————————————————————————————————————————————
/**
 * Per-mode field of view, narrow on the figure modes.
 *
 * V3.32: the figure modes ran at 26°, and at hero distance that puts the horizon at head height
 * about 6.5 m from a 3.8 m figure, magnifying the head roughly 13% against the feet. A seat
 * measuring the six-head lock off a hero plate read 5.4 heads where the decomposed instance
 * matrix said 5.99, and off a turn cell read 6.6 — the two lab cameras bracketing the truth in
 * opposite directions, with about ±0.6 of camera in the number.
 *
 * That matters because the reference pack is shot near-orthographically, so a head count taken
 * from a wide lab plate is not comparable to one taken from `mp-cheap-builder.png`, and §2.6 is
 * graded on exactly that comparison. 12° on the figure modes costs nothing but camera distance
 * and makes the two measurable against each other. The city modes keep the board's own lens,
 * because there the point is the altitude the game is actually played at.
 */
const FOV = { hero: 12, turn: 12, walk: 12, lineup: 12 };
const camera = new THREE.PerspectiveCamera(FOV[MODE] ?? 26, 1, 0.25, 2000);

/**
 * Every station solves the same projected-corner fit against the subject box: `az` is the
 * azimuth, `el` a true elevation angle above the aim point, `margin` how much slack to leave
 * around the fitted subject (1.0 = the subject exactly touches two frame edges) and `look` how
 * far up the subject's height the aim point sits. A station may pass `orbit` instead to hold a
 * fixed distance and skip the fit.
 */
const STATIONS = {
  // Margin near 1 on purpose. The residential programme measured its subject at 45% of frame
  // width against a reference pack's 85%, and four blind critics named the wide empty margin as
  // the thing that identified the game render before they had looked at the model at all.
  hero: { az: 0, el: 0.17, margin: 1.06, look: 0.52 },
  turn: { az: 0, el: 0.13, margin: 1.05, look: 0.50 },
  walk: { az: 0, el: 0.09, margin: 1.05, look: 0.50 },
  lineup: { az: 0, el: 0.14, margin: 1.04, look: 0.50 },
  // City stations keep the board camera's own elevation — 0.62 rad is the isometric angle the
  // game is played at — and let the fit choose the distance, so the subject fills the plate at
  // the altitude that matters rather than at whatever the default zoom happens to be.
  board: { az: Math.PI * 0.25, el: 0.62, margin: 1.08, look: 0.30 },
  crowd: { az: Math.PI * 0.22, el: 0.52, margin: 1.06, look: 0.22 },
  ambient: { az: Math.PI * 0.20, el: 0.46, margin: 1.04, look: 0.16 },
};
/**
 * The blind pass widens the margin and nothing else — same azimuth, same elevation, same lens,
 * same yaw, so the figure a critic sees in a blind panel is the figure the dimension gate
 * grades. Two reasons the margin has to move. The compositor measures each panel's backdrop
 * from its corners, and a subject pressed against the frame edge leaves it nothing clean to
 * measure. And with the plate in the box, a margin of 1.05 crops the tile's near corner.
 *
 * The wide-empty-margin finding the tight margins were bought with still holds: it is about how
 * much of the FRAME the subject occupies once the two are set beside each other, and the
 * compositor now equalises exactly that. Air in the source is what it needs to do the job.
 */
const BLIND_MARGIN = { hero: 1.16, turn: 1.16, walk: 1.20, lineup: 1.20 };
const STATION = {
  ...(STATIONS[MODE] ?? STATIONS.hero),
  ...(BLIND && BLIND_MARGIN[MODE] ? { margin: BLIND_MARGIN[MODE] } : {}),
};

const CORNERS = [];
for (const x of [subject.min.x, subject.max.x]) {
  for (const y of [subject.min.y, subject.max.y]) {
    for (const z of [subject.min.z, subject.max.z]) CORNERS.push(new THREE.Vector3(x, y, z));
  }
}
const fitProbe = new THREE.Vector3();

function placeCamera() {
  const aimY = subject.min.y + size.y * STATION.look;
  const aim = new THREE.Vector3(focus.x, aimY, focus.z);

  if (STATION.orbit != null) {
    const horiz = STATION.orbit * Math.cos(STATION.el);
    camera.position.set(
      focus.x + Math.sin(STATION.az) * horiz,
      aimY + STATION.orbit * Math.sin(STATION.el),
      focus.z + Math.cos(STATION.az) * horiz,
    );
    camera.lookAt(aim);
    camera.updateProjectionMatrix();
    return;
  }

  // Perspective framing is a fixed point, so iterate it: place the camera, project every
  // corner, find the worst overflow against the frustum, scale the distance by it. A closed
  // form is wrong for a strip, whose near cell is half the distance of its far cell.
  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(camera.aspect, 0.1));
  const tanV = Math.tan(vFov / 2);
  const tanH = Math.tan(hFov / 2);
  let horiz = Math.max(size.x, size.y, size.z) * 1.5;
  for (let pass = 0; pass < 8; pass += 1) {
    camera.position.set(
      focus.x + Math.sin(STATION.az) * horiz,
      aimY + Math.tan(STATION.el) * horiz,
      focus.z + Math.cos(STATION.az) * horiz,
    );
    camera.lookAt(aim);
    camera.updateMatrixWorld(true);
    let overflow = 0;
    for (const corner of CORNERS) {
      fitProbe.copy(corner).applyMatrix4(camera.matrixWorldInverse);
      const depth = Math.max(-fitProbe.z, 0.05);
      overflow = Math.max(
        overflow,
        Math.abs(fitProbe.x) / (tanH * depth),
        Math.abs(fitProbe.y) / (tanV * depth),
      );
    }
    if (overflow <= 1e-4) break;
    const want = overflow * STATION.margin;
    horiz = Math.max(horiz * (1 + (want - 1) * 0.85), 2);
  }
  camera.position.set(
    focus.x + Math.sin(STATION.az) * horiz,
    aimY + Math.tan(STATION.el) * horiz,
    focus.z + Math.cos(STATION.az) * horiz,
  );
  camera.lookAt(aim);
  camera.updateProjectionMatrix();
}

let post = null;
function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // The fit depends on the aspect and module-level placement runs before the first resize, so
  // re-place here — which is also the only time the fit can change.
  placeCamera();
  if (!POST_ON) return;
  if (!post) {
    post = new PostChain(renderer, {
      quality: QUALITY, reducedMotion: true, width: w, height: h, grade: lighting.profile.grade,
    });
    // The board's miniature bokeh is a hero-plate effect. A fidelity plate has to be sharp
    // everywhere or the critic grades the blur instead of the figure.
    post.dofStrength = Number(params.get('dof') ?? 0);
    // Ambient occlusion radii are authored for the board camera, which sees a figure as a
    // thumbnail. A hero plate sits at a fraction of that distance, so the authored radius
    // resolves to a hairline: the neck, the armpit and the crotch stop closing, which is
    // three of the things §2.9 grades. Scale the radii with the subject.
    const aoScale = Math.max(0.35, Math.max(size.x, size.y, size.z) / 12);
    post.setAmbientOcclusion({
      radiusNear: 0.35 * aoScale,
      radiusFar: 1.6 * aoScale,
      intensity: 3.05,
      contactDarkness: 0.46,
    });
  } else post.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

if (lighting.profile) sunDirection(lighting.profile);

let frameIndex = 0;
let elapsed = 0;
function drawFrame() {
  frameIndex += 1;
  elapsed += 1 / 60;
  const camDistance = camera.position.distanceTo(focus);
  lighting.update(camera, focus, camDistance);
  if (sky) sky.update(1 / 60, elapsed);
  // Layer clocks are driven from the frame counter, never from a wall clock, so plate N is
  // the same image on every machine.
  if (people) people.update(1 / 60);
  if (ambient) ambient.update(1 / 60, elapsed);
  // The temporal resolve needs several sub-frames inside one submitted frame, because the
  // capture pumps by hand and never presents the intervening RAF ticks. Eight, not two: at
  // two the plate keeps a raw staircase on every diagonal edge.
  if (post) post.render(scene, camera, { accumulate: 8, elapsed, index: frameIndex });
  else renderer.render(scene, camera);
  renderer.info.reset();
}

/** Deterministic frame pump for headless capture. */
window.__peopleLab = {
  ready: true,
  mode: MODE,
  id: ID,
  ids: PEOPLE_IDS,
  value: VALUE,
  blind: BLIND,
  /** Non-null when the mode could not be built. The capture treats it as a failed plate. */
  error: labError,
  step(n = 1) { for (let i = 0; i < n; i += 1) drawFrame(); },
  /** Objective density read for the ledger: measured draws and triangles, never assumed. */
  stats() {
    const figureStats = batch
      ? batch.stats(Math.min(batch.capacity, batch.body.count))
      : null;
    return {
      mode: MODE,
      id: ID,
      figures: figureStats,
      people: people ? people.stats() : null,
      crowd: crowd ? crowd.stats() : null,
      ambient: ambient ? ambient.stats() : null,
      subject: {
        width: Number(size.x.toFixed(3)),
        height: Number(size.y.toFixed(3)),
        depth: Number(size.z.toFixed(3)),
      },
    };
  },
};

drawFrame();
