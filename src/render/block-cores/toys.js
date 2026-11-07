// District Deck V3.33 — block-core tap toys.
// Renderer-local. Hits raise energy; energy drives a readable motion (swing, valve,
// boom, roller, hatch, spinner). Damage stages stay in mischief.js.

import * as THREE from 'three';
import { readRestyle, restyleColour } from '../style/restyle.js';
import { MaterialLibrary } from '../materials.js';
import { furnitureLabel } from '../furniture-labels.js';

const DEG = Math.PI / 180;
const REST = 0.0008;
/** Kinds that model an opening a person operates: they toggle rather than ratchet. §3.5. */
const LATCHING = new Set(['roller', 'boom', 'hatch']);

/**
 * V3.71 lane I r2 — the one place a latching toy's open pose is written.
 *
 * It used to live inline in three branches of `step()`. It is a function now because TWO
 * things drive it: `step()`, easing toward `openTarget` for the `CoreToys.tap()` route, and
 * `setOpen()`, called every frame by `mischief.js` with its own eased `openK` for the real
 * pointer route. Two writers and one transform is how a pose starts fighting itself, so
 * `open` is the state and this is the only writer of `group`.
 *
 * `k = 0` reproduces the closed pose exactly — `rotation.z = -0`, `rotation.x = -0`,
 * `position.y = wy` — so a core that is never tapped renders identically to before.
 */
function applyOpenPose(rec) {
  const k = rec.open ?? 0;
  const g = rec.group;
  if (rec.kind === 'boom') g.rotation.z = -k * 1.35;
  else if (rec.kind === 'hatch') g.rotation.x = -k * 1.1;
  else if (rec.kind === 'roller') g.position.y = rec.wy + k * 1.6;
}

function kitBox(material, w, h, d, x, y, z, yaw = 0) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  if (yaw) geometry.rotateY(yaw * DEG);
  geometry.translate(x, y, z);
  MaterialLibrary.ensureUv2(geometry);
  return { geometry, material };
}

function kitCyl(material, rTop, rBot, h, x, y, z, seg = 10, open = false, rx = 0, rz = 0) {
  const geometry = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  if (rx) geometry.rotateX(rx);
  if (rz) geometry.rotateZ(rz);
  geometry.translate(x, y, z);
  MaterialLibrary.ensureUv2(geometry);
  return { geometry, material };
}

function kitTorus(material, r, tube, x, y, z, rx = 0) {
  const geometry = new THREE.TorusGeometry(r, tube, 8, 14);
  if (rx) geometry.rotateX(rx);
  geometry.translate(x, y, z);
  MaterialLibrary.ensureUv2(geometry);
  return { geometry, material };
}

function kitSphereish(material, r, x, y, z) {
  const geometry = new THREE.SphereGeometry(r, 8, 6);
  geometry.translate(x, y, z);
  MaterialLibrary.ensureUv2(geometry);
  return { geometry, material };
}

/**
 * Swing seat: the hole wins the ¾ silhouette.
 * Wide shallow dark opening (no taper = not a hanging cone). Inner well recedes.
 * No lip, no hoop, no cube, no colour.
 */
function addScoopedBucket(add, palette, mat, sx) {
  const bucket = mat || palette.paintR;
  add(kitCyl(bucket, 0.52, 0.40, 0.24, sx, 0.22, 0, 12, true));
  add(kitCyl(palette.soil, 0.38, 0.38, 0.04, sx, 0.10, 0, 10, false));
}

/**
 * Build the moving bits of a toy as a local group.
 * Static hosts (A-frame, tank shell) stay in the instanced prototype.
 */
/**
 * V3.70 L5 r2 — bucket redirection for toys.
 *
 * A toy is a mesh that ships on the object, so its materials count against §3.2's nine
 * buckets. The r1 lane's probe never looked at them and the r1 report therefore claimed
 * nine buckets on all twelve models while ten of twelve carried ten or eleven: the
 * `valve` handwheel pulled `paintR` onto `substation`, `stormwater-basin`,
 * `district-energy` and `mobility-hub`, and the `hatch` and `roller` pulled `paintY` and
 * `steel` onto `market-hall` and `district-energy`.
 *
 * The r1 critic's fix list gives two routes: "either fold the toy geometry into an
 * existing bucket (`paintR` on the valve handwheel can be `steel`; `paintY` on the hatch
 * can be `trim`), or take the cap to the orchestrator as a ruling — do not close this by
 * changing what the probe counts."
 *
 * This is the first route, and the choice is left to the type rather than hard-coded,
 * because the right substitute differs per object: a substation handwheel wants `steel`,
 * a market hall's cellar hatch wants `trim`. A type passes `accent` / `accent2` on the
 * toy spec naming buckets it already carries; omitting them keeps the r1 colours, so
 * `playground` and the other pre-existing types are untouched.
 */
function pick(palette, spec, key, fallback) {
  const named = key === 'accent' ? spec.accent : spec.accent2;
  return (named && palette[named]) ? palette[named] : palette[fallback];
}

/**
 * BC2 playground-toys — the true-size look, and the one switch that takes it away.
 *
 * `?pgtoys=0` restores the V3.33-V3.71 playground and toys exactly: every branch below is
 * reached only while `playgroundLookOn()` is true, and with it false neither the palette nor
 * the geometry nor the spawn/step records differ from 523b2791. Headless (no `location`) the
 * look is on, which is the default the brief asks for.
 */
export const PLAYGROUND_SWITCH = 'pgtoys';
export function playgroundLookOn() {
  try {
    const search = globalThis.location?.search ?? '';
    return new URLSearchParams(search).get(PLAYGROUND_SWITCH) !== '0';
  } catch {
    return true;
  }
}

/** Kinds the true-size rebuild owns. Latching kinds and the valve/tap stay with their types. */
export const TRUE_SIZE_KINDS = new Set(['swing', 'double-swing', 'seesaw', 'spinner', 'spring-rider']);

/**
 * Plan §2-3 material rules for the playground subtree: metal 0.15 or less, roughness 0.55 to
 * 0.95, built surfaces at saturation 10-29 with paint as small accents. The shared
 * `createCorePalette` stays as it is (kit.js belongs to the W1 palette chunk); this derives a
 * lane-local twin per bucket so the playground and its toys carry the same bucket NAMES and
 * therefore the same material count. `chroma` scales sRGB distance from luma.
 */
/**
 * Taste fix (r2): colours solved from the r2 frames, not the ACES estimate. A software z-buffer
 * of each plate (core-lab's own fit; the c01 camera fitted to the frame's edges) labels every
 * pixel with its bucket, so the rendered V and S below are per bucket. Per-channel gains
 * (rendered linear / multiplier linear) differ by view: on the softfall the lab gives
 * r 0.113, g 0.102, b 0.086 and play c01 r 0.844, g 0.828, b 1.13, so play cools a colour that
 * the lab warms (blue/red gain 1.34 against 0.76), and the lab's dark toe amplifies a
 * multiplier's chroma (log-ratio slope 1.5 against 1.04 in play, from sail against softfall).
 * Predictions below use those slopes from each bucket's own r2 reading.
 *   paintB    lighter blue. The c01 panel the r2 verdict read as charcoal (V 21) is the timber
 *             panel on the yaw-180 face in the sail's shade; the accent sat on the yaw-90 face,
 *             which c01 sees edge-on (29 px). Predicted: c01 shaded skin V 36, S 40; lit rider
 *             V 59, S 40; lab panel lit part V 28, S 36 (r2 V 6 median, 14 at p90).
 *   softfall  warm rubber: play S 8 -> about 13 at V 56 (concrete V 86); lab V 21, S about 45.
 *   sail      less blue: play S 10 -> about 12 (red the low channel); lab S 24 -> about 29.
 */
export const PLAYGROUND_RGB = Object.freeze({
  paintB: [0.42, 0.56, 0.78],
  softfall: [0.315, 0.275, 0.176],
  sail: [0.255, 0.35, 0.24],
});
// Preserve authored RGB off. Keep the round-3 linear multiplier above one: the
// render texture and instance tint still attenuate it before the albedo is measured.
function restyledPlaygroundRGB(role, hex) {
  return restyleColour(new THREE.Color().setRGB(...PLAYGROUND_RGB[role], THREE.LinearSRGBColorSpace),
    new THREE.Color(hex).multiplyScalar(1.6), { id: `core:playground.${role}` }).toArray();
}
const PLAYGROUND_TUNE = Object.freeze({
  steel: { metalness: 0.12, roughness: 0.58 },
  paintR: { metalness: 0, roughness: 0.62, chroma: 0.72 },
  paintB: { metalness: 0, roughness: 0.62, get rgb() { return restyledPlaygroundRGB('paintB', '#c1dbfe'); } },
  paintY: { metalness: 0, roughness: 0.62, chroma: 0.62 },
  paintG: { metalness: 0, roughness: 0.62, chroma: 0.8 },
  paintO: { metalness: 0, roughness: 0.62, chroma: 0.72 },
  timber: { metalness: 0, roughness: 0.82, chroma: 0.5 },
  softfall: { metalness: 0, roughness: 0.9, get rgb() { return restyledPlaygroundRGB('softfall', '#feefc2'); } },
  concrete: { metalness: 0, roughness: 0.9, chroma: 1.3 },
  trim: { metalness: 0, roughness: 0.8 },
  soil: { metalness: 0, roughness: 0.94 },
  turf: { metalness: 0, roughness: 0.94 },
  path: { metalness: 0, roughness: 0.9 },
  water: { metalness: 0, roughness: 0.55 },
  roof: { metalness: 0.12, roughness: 0.62 },
});
/**
 * Taste fix (r1): lane-local buckets that only the true-size playground uses. They are extra
 * keys on the derived palette, so `CoreContext.push` accepts them and the shared kit palette is
 * untouched. `scale` multiplies the base material's linear colour (the authored hex, linear),
 * `tint` multiplies per channel and `rgb` sets linear components (`PLAYGROUND_RGB`).
 *   fence      dark Colorbond (Woodland Grey) powder-coat for the pool fence, off `soil`
 *              charcoal. The r1 plates read the `soil` pickets at V 2-5 in both the lab and
 *              play; through ACES 1.05 a V 4 surface reaches V 21 at 4.75x its radiance, and
 *              the cool tint offsets the render map's warmth (`soil` renders at S 0.31).
 *   sail       a sage (Pale Eucalypt) shade cloth at the board's roofing value, off `trim`,
 *              which read V 84 in play against roofs at 55-63: 0.40x trim's linear luminance,
 *              about V 62 in play and V 24-29 in the lab by the same estimate. r2 frames
 *              measured it at V 57, S 10 in play (blue the high channel) and V 22, S 24 in
 *              the lab; r2 lowers its blue (see PLAYGROUND_RGB).
 *   stainTurf  the 15-20 V base stain on the lawn: worn ground at fence lines, around pads,
 *              the softfall edge, the sandpit and posts set in turf. Measured at 0.55x in the
 *              r2 frames: fence line lab 12.9 V (v0) and 10.6 (v1), play 12.5; pads and edge
 *              lab 15.3, play 13.3. At 0.44x: fence about 16.8 lab and 16.7 play.
 *   stainSoft  the same stain on the softfall, at post feet, under riders and the roundabout,
 *              now 0.36x the r2 softfall colour. Measured at 0.55x: lab 7.5 V, play 9.0. At
 *              0.36x about 15 in play; the lab's softfall sits at V 20, so it drops about 11.
 */
const PLAYGROUND_EXTRA = Object.freeze({
  fence: { from: 'soil', scale: 4.75, tint: [0.96, 1.0, 1.08], metalness: 0, roughness: 0.66 },
  sail: { from: 'trim', get rgb() { return restyledPlaygroundRGB('sail', '#dcfed6'); }, metalness: 0, roughness: 0.9 },
  stainTurf: { from: 'turf', scale: 0.44, metalness: 0, roughness: 0.94 },
  stainSoft: { from: 'softfall', get rgb() { return restyledPlaygroundRGB('softfall', '#feefc2'); }, scale: 0.36, metalness: 0, roughness: 0.9 },
});
export const PLAYGROUND_EXTRA_BUCKETS = Object.freeze(Object.keys(PLAYGROUND_EXTRA));
const derivedPalettes = [new WeakMap(), new WeakMap()];

function tuneMaterial(base, tune, bucket, extraName = null) {
  if (!base) return base;
  if (typeof base.clone !== 'function') {
    // Probe sentinel palettes: carry the figures so a headless count can read them.
    return {
      ...base,
      ...(extraName ? { name: extraName, rgb: tune.rgb, scale: tune.scale, tint: tune.tint } : {}),
      metalness: tune.metalness ?? base.metalness,
      roughness: tune.roughness ?? base.roughness,
      chroma: tune.chroma ?? 1,
      pgTuned: true,
    };
  }
  const m = base.clone();
  m.onBeforeCompile = base.onBeforeCompile;
  m.customProgramCacheKey = base.customProgramCacheKey;
  if (tune.metalness !== undefined) m.metalness = tune.metalness;
  if (tune.roughness !== undefined) m.roughness = tune.roughness;
  if (tune.rgb !== undefined && m.color) m.color.setRGB(...tune.rgb, THREE.LinearSRGBColorSpace);
  if (tune.scale !== undefined && m.color) m.color.multiplyScalar(tune.scale);
  if (tune.tint !== undefined && m.color) m.color.multiply(new THREE.Color().setRGB(...tune.tint, THREE.LinearSRGBColorSpace));
  if (tune.chroma !== undefined && m.color) {
    const c = m.color.clone().convertLinearToSRGB();
    const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    c.setRGB(l + (c.r - l) * tune.chroma, l + (c.g - l) * tune.chroma, l + (c.b - l) * tune.chroma);
    m.color.copy(c.convertSRGBToLinear());
  }
  m.name = extraName ? `${base.name || bucket}|pg-${extraName}` : `${base.name || bucket}|pg`;
  m.userData = { ...base.userData, pgTune: { bucket: extraName ?? bucket, ...tune } };
  return m;
}

export function derivePlaygroundPalette(palette) {
  if (!palette) return palette;
  const cache = derivedPalettes[Number(readRestyle(globalThis.location?.search ?? '').enabled)];
  if (cache.has(palette)) return cache.get(palette);
  const out = { ...palette };
  for (const [bucket, tune] of Object.entries(PLAYGROUND_TUNE)) {
    if (palette[bucket]) out[bucket] = tuneMaterial(palette[bucket], tune, bucket);
  }
  for (const [key, tune] of Object.entries(PLAYGROUND_EXTRA)) {
    if (palette[tune.from]) out[key] = tuneMaterial(palette[tune.from], tune, tune.from, key);
  }
  const frozen = Object.freeze(out);
  cache.set(palette, frozen);
  cache.set(frozen, frozen);
  return frozen;
}

function rodBetween(material, a, b, r, seg = 6) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const geometry = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(dx / len, dy / len, dz / len),
  );
  geometry.applyQuaternion(q);
  geometry.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  MaterialLibrary.ensureUv2(geometry);
  return { geometry, material };
}

function kitBoxRot(material, w, h, d, x, y, z, { pitch = 0, roll = 0, yaw = 0 } = {}) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  if (pitch) geometry.rotateX(pitch * DEG);
  if (roll) geometry.rotateZ(roll * DEG);
  if (yaw) geometry.rotateY(yaw * DEG);
  geometry.translate(x, y, z);
  MaterialLibrary.ensureUv2(geometry);
  return { geometry, material };
}

/** Belt seat: a 440 mm rubber strap with a slight sag, two 35 mm chain rods to the hangers. */
function addBeltSeat(add, pal, sx, seatY, pivot) {
  const rubber = pal.soil;
  add(kitBox(rubber, 0.20, 0.03, 0.17, sx, seatY, 0));
  add(kitBoxRot(rubber, 0.13, 0.03, 0.17, sx - 0.16, seatY + 0.017, 0, { roll: -15 }));
  add(kitBoxRot(rubber, 0.13, 0.03, 0.17, sx + 0.16, seatY + 0.017, 0, { roll: 15 }));
  for (const s of [-1, 1]) {
    const x = sx + s * 0.225;
    add(kitBox(pal.steel, 0.04, 0.07, 0.04, x, seatY + 0.06, 0));
    add(rodBetween(pal.steel, [x, seatY + 0.09, 0], [x, pivot - 0.07, 0], 0.0175));
    add(kitBox(pal.steel, 0.07, 0.09, 0.07, x, pivot - 0.035, 0));
  }
}

/** Toddler cradle: an open 8-sided bucket (outer and inner walls), floor, leg bar, V chains. */
function addCradleSeat(add, pal, sx, seatY, pivot, mat) {
  const h = 0.28;
  const outer = new THREE.CylinderGeometry(0.25, 0.20, h, 8, 1, true);
  outer.translate(sx, seatY + h / 2, 0);
  MaterialLibrary.ensureUv2(outer);
  add({ geometry: outer, material: mat });
  const inner = new THREE.CylinderGeometry(0.23, 0.18, h - 0.01, 8, 1, true);
  inner.scale(-1, 1, 1); // inverted winding: the wall reads from inside the bucket
  inner.translate(sx, seatY + h / 2 + 0.005, 0);
  MaterialLibrary.ensureUv2(inner);
  add({ geometry: inner, material: mat });
  const floor = new THREE.CircleGeometry(0.19, 8);
  floor.rotateX(-Math.PI / 2);
  floor.translate(sx, seatY + 0.04, 0);
  MaterialLibrary.ensureUv2(floor);
  add({ geometry: floor, material: pal.soil });
  add(kitBox(mat, 0.06, 0.20, 0.06, sx, seatY + 0.14, 0.20));
  for (const s of [-1, 1]) {
    const hx = sx + s * 0.225;
    add(kitBox(pal.steel, 0.07, 0.09, 0.07, hx, pivot - 0.035, 0));
    for (const dz of [-0.17, 0.17]) {
      add(rodBetween(pal.steel, [sx + s * 0.20, seatY + h, dz], [hx, pivot - 0.07, 0], 0.0175));
    }
  }
}

function addHelix(add, material, x, z, y0, y1, r, wire, turns) {
  const pts = [];
  const n = Math.round(turns * 10);
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(x + Math.cos(a) * r, y0 + (y1 - y0) * t, z + Math.sin(a) * r));
  }
  const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, wire, 4, false);
  MaterialLibrary.ensureUv2(geometry);
  add({ geometry, material });
}

/**
 * The five playground kinds at true size. Every figure is a real-world dimension:
 * belt seat 450 mm over the surface, cradle 550 mm, chains 35 mm, seesaw beam 3.2 m with an
 * axle at 0.55 m, roundabout 1.9 m across with its deck at 0.35 m and grab rails at 0.85 m,
 * spring rider seat at 0.60 m on a 0.38 m coil.
 */
function buildTrueSizeToy(spec, palette) {
  const pal = derivePlaygroundPalette(palette);
  const group = new THREE.Group();
  const parts = [];
  const add = (entry, parent = group) => {
    parts.push(entry);
    const mesh = new THREE.Mesh(entry.geometry, entry.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  };
  const kind = spec.kind;
  const surface = spec.surface ?? 0;
  if (kind === 'swing' || kind === 'double-swing') {
    const pivot = spec.pivot ?? 2.47;
    const belt = 0.45 - surface;
    const cradle = 0.55 - surface;
    if (kind === 'swing') addBeltSeat(add, pal, 0, belt, pivot);
    else {
      addBeltSeat(add, pal, -0.72, belt, pivot);
      addCradleSeat(add, pal, 0.72, cradle, pivot, pal[spec.seat ?? 'paintR']);
    }
    group.userData.pivot = pivot;
  } else if (kind === 'seesaw') {
    const axle = 0.55;
    const beam = pal[spec.beam ?? 'paintB'];
    add(kitBox(beam, 3.2, 0.07, 0.20, 0, axle + 0.07, 0));
    add(kitCyl(pal.steel, 0.05, 0.05, 0.30, 0, axle, 0, 8, false, Math.PI / 2));
    for (const s of [-1, 1]) {
      add(kitBox(pal.soil, 0.36, 0.05, 0.30, s * 1.38, axle + 0.13, 0));
      add(kitBox(pal.soil, 0.05, 0.16, 0.28, s * 1.57, axle + 0.21, 0));
      add(kitCyl(pal.steel, 0.018, 0.018, 0.34, s * 1.08, axle + 0.27, 0.12, 6));
      add(kitCyl(pal.steel, 0.018, 0.018, 0.34, s * 1.08, axle + 0.27, -0.12, 6));
      add(kitCyl(pal.steel, 0.02, 0.02, 0.28, s * 1.08, axle + 0.44, 0, 6, false, Math.PI / 2));
      add(kitCyl(pal.soil, 0.11, 0.11, 0.12, s * 1.38, axle - 0.04, 0, 8, false, Math.PI / 2));
    }
    group.userData.pivot = axle;
    // Review fix 1: the 3.2 m beam on a 0.55 m axle meets the softfall (local y 0) at about
    // 0.28 rad, under step()'s 0.38 rad cap, so the swing is clamped to the contact angle.
    group.userData.maxTilt = contactTilt(parts, axle, 0.005);
  } else if (kind === 'spinner') {
    const deck = pal[spec.deck ?? 'timber'];
    add(kitCyl(pal.steel, 0.09, 0.11, 0.30, 0, 0.15, 0, 8));
    add(kitCyl(deck, 0.95, 0.95, 0.06, 0, 0.32, 0, 16));
    add(kitCyl(pal.soil, 0.97, 0.97, 0.03, 0, 0.29, 0, 16, true));
    add(kitCyl(pal[spec.hub ?? 'paintY'], 0.16, 0.16, 0.06, 0, 0.38, 0, 8));
    for (const a of [0, 90, 180, 270]) {
      const c = Math.cos(a * DEG);
      const s = Math.sin(a * DEG);
      const p = (r, y) => [c * r, y, s * r];
      add(rodBetween(pal.steel, p(0.82, 0.35), p(0.82, 0.85), 0.02));
      add(rodBetween(pal.steel, p(0.24, 0.35), p(0.24, 0.85), 0.02));
      add(rodBetween(pal.steel, p(0.24, 0.85), p(0.82, 0.85), 0.02));
    }
    group.userData.spinAxis = 'y';
  } else if (kind === 'spring-rider') {
    const body = pal[spec.body ?? 'paintR'];
    // Review fix 2: the plate and coil stay on the ground; the body rocks in a child group
    // hinged at the top of the coil (0.38 m), which step() turns instead of the whole toy.
    const hinge = 0.38;
    add(kitBox(pal.steel, 0.36, 0.02, 0.36, 0, 0.01, 0));
    addHelix(add, pal.steel, 0, 0, 0.02, hinge, 0.11, 0.018, 3.5);
    const rock = new THREE.Group();
    rock.name = 'rider-rock';
    rock.position.y = hinge;
    group.add(rock);
    const addRock = (entry) => {
      entry.geometry.translate(0, -hinge, 0);
      add(entry, rock);
    };
    addRock(kitBox(pal.steel, 0.26, 0.03, 0.22, 0, 0.395, 0));
    addRock(kitBox(body, 0.66, 0.20, 0.22, 0, 0.50, 0));
    addRock(kitBoxRot(body, 0.16, 0.30, 0.16, 0.30, 0.68, 0, { roll: -20 }));
    addRock(kitBox(body, 0.26, 0.14, 0.16, 0.40, 0.84, 0));
    addRock(kitBox(body, 0.12, 0.18, 0.06, -0.33, 0.60, 0));
    addRock(kitBox(pal.soil, 0.26, 0.04, 0.24, -0.02, 0.62, 0));
    addRock(kitCyl(pal.steel, 0.016, 0.016, 0.36, 0.33, 0.80, 0, 6, false, Math.PI / 2));
    addRock(kitCyl(pal.steel, 0.016, 0.016, 0.42, 0.10, 0.45, 0, 6, false, Math.PI / 2));
    group.userData.hinge = 'z';
    group.userData.rock = rock;
  }
  return { group, parts };
}

/**
 * Largest tilt about the z axis through (0, axle, 0) that keeps every vertex of `parts` at
 * least `clear` above local y 0, for both directions (bisection on the vertex set).
 */
function contactTilt(parts, axle, clear) {
  const pts = [];
  for (const { geometry } of parts) {
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i += 1) pts.push(p.getX(i), p.getY(i) - axle);
  }
  const lowest = (t) => {
    const s = Math.sin(t);
    const c = Math.cos(t);
    let m = Infinity;
    for (let i = 0; i < pts.length; i += 2) m = Math.min(m, pts[i] * s + pts[i + 1] * c + axle);
    return m;
  };
  let lo = 0;
  let hi = 0.6;
  for (let k = 0; k < 40; k += 1) {
    const mid = (lo + hi) / 2;
    if (Math.min(lowest(mid), lowest(-mid)) >= clear) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function buildToyMesh(spec, palette) {
  if (TRUE_SIZE_KINDS.has(spec.kind) && playgroundLookOn()) return buildTrueSizeToy(spec, palette);
  const group = new THREE.Group();
  const parts = [];
  const add = (entry) => {
    parts.push(entry);
    const mesh = new THREE.Mesh(entry.geometry, entry.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  const kind = spec.kind;
  if (kind === 'swing') {
    const steel = palette.steel;
    const seat = palette.paintR;
    for (let i = 0; i < 7; i += 1) {
      const y = 1.42 - i * 0.20;
      add(kitTorus(steel, 0.055, 0.018, -0.13, y, 0, i % 2 ? 0 : Math.PI / 2));
      add(kitTorus(steel, 0.055, 0.018, 0.13, y, 0, i % 2 ? Math.PI / 2 : 0));
    }
    addScoopedBucket(add, palette, seat, 0);
    group.userData.pivotY = 1.55;
  } else if (kind === 'double-swing') {
    const steel = palette.steel;
    const a = palette.paintR;
    const b = palette.paintB;
    for (const [sx, mat] of [[-0.72, a], [0.72, b]]) {
      for (let i = 0; i < 7; i += 1) {
        const y = 1.42 - i * 0.20;
        add(kitTorus(steel, 0.055, 0.018, sx - 0.12, y, 0, i % 2 ? 0 : Math.PI / 2));
        add(kitTorus(steel, 0.055, 0.018, sx + 0.12, y, 0, i % 2 ? Math.PI / 2 : 0));
      }
      addScoopedBucket(add, palette, mat, sx);
    }
    group.userData.pivotY = 1.55;
  } else if (kind === 'valve') {
    const steel = palette.steel;
    const wheel = pick(palette, spec, 'accent', 'paintR');
    add(kitCyl(steel, 0.06, 0.06, 0.28, 0, 0.16, 0, 8));
    add(kitTorus(wheel, 0.24, 0.045, 0, 0.34, 0, Math.PI / 2));
    for (const a of [0, 60, 120]) {
      add(kitBox(wheel, 0.44, 0.04, 0.04, 0, 0.34, 0, a));
    }
    add(kitCyl(steel, 0.05, 0.05, 0.07, 0, 0.36, 0, 8));
    group.userData.spinAxis = 'y';
  } else if (kind === 'hatch') {
    const shell = pick(palette, spec, 'accent2', 'steel');
    add(kitCyl(shell, 0.42, 0.42, 0.06, 0, 0.03, 0, 12));
    add(kitCyl(pick(palette, spec, 'accent', 'paintY'), 0.36, 0.36, 0.05, 0, 0.07, 0, 12));
    add(kitBox(shell, 0.18, 0.05, 0.05, 0.28, 0.09, 0));
    group.userData.hinge = 'x';
  } else if (kind === 'spinner') {
    add(kitCyl(palette.steel, 0.10, 0.14, 0.55, 0, 0.28, 0, 8));
    add(kitCyl(palette.paintB, 1.05, 1.05, 0.12, 0, 0.52, 0, 16));
    add(kitCyl(palette.paintY, 0.72, 0.72, 0.06, 0, 0.60, 0, 14));
    for (const a of [0, 90, 180, 270]) {
      add(kitBox(palette.paintB, 0.42, 0.22, 0.38, 0, 0.68, 0.62, a));
      add(kitBox(palette.paintY, 0.12, 0.42, 0.10, 0, 0.92, 0.55, a));
    }
    group.userData.spinAxis = 'y';
  } else if (kind === 'seesaw') {
    add(kitBox(palette.paintY, 2.9, 0.12, 0.32, 0, 0.62, 0));
    add(kitBox(palette.paintR, 0.42, 0.16, 0.34, -1.22, 0.74, 0));
    add(kitBox(palette.paintB, 0.42, 0.16, 0.34, 1.22, 0.74, 0));
    add(kitBox(palette.steel, 0.10, 0.20, 0.20, -1.0, 0.82, 0));
    add(kitBox(palette.steel, 0.10, 0.20, 0.20, 1.0, 0.82, 0));
    group.userData.hinge = 'z';
  } else if (kind === 'spring-rider') {
    add(kitBox(palette.steel, 0.40, 0.05, 0.40, 0, 0.04, 0));
    add(kitTorus(palette.steel, 0.10, 0.035, 0, 0.16, 0, Math.PI / 2));
    add(kitTorus(palette.steel, 0.10, 0.035, 0, 0.26, 0, Math.PI / 2));
    add(kitTorus(palette.steel, 0.10, 0.035, 0, 0.36, 0, Math.PI / 2));
    add(kitBox(palette.paintR, 0.52, 0.22, 0.18, 0, 0.58, 0));
    add(kitBox(palette.paintY, 0.22, 0.06, 0.20, 0, 0.70, 0));
    add(kitBox(palette.paintR, 0.12, 0.18, 0.12, 0.24, 0.74, 0));
    add(kitBox(palette.paintR, 0.22, 0.12, 0.12, 0.36, 0.84, 0));
    add(kitBox(palette.paintR, 0.04, 0.08, 0.04, 0.32, 0.94, -0.05));
    add(kitBox(palette.paintR, 0.04, 0.08, 0.04, 0.32, 0.94, 0.05));
    add(kitBox(palette.steel, 0.06, 0.16, 0.22, 0.08, 0.78, 0));
    add(kitCyl(palette.paintR, 0.035, 0.035, 0.16, -0.22, 0.48, 0.06, 6));
    add(kitCyl(palette.paintR, 0.035, 0.035, 0.16, -0.08, 0.48, 0.06, 6));
    group.userData.hinge = 'z';
  } else if (kind === 'boom') {
    /**
     * V3.71 lane I — `boom` takes `accent` / `accent2` like `valve`, `hatch` and `roller`.
     *
     * It was the last LATCHING kind that did not, and it hard-coded THREE palette buckets
     * for one prop — `paintY` for the arm, `steel` for the hinge box and `paintR` for the
     * bands and the tip. A toy is a mesh that ships on the object and counts against §3.2's
     * nine, so the only object that wants a boom could not have one without spending a
     * bucket on band paint. This is the r1 fix list's own first route ("fold the toy
     * geometry into an existing bucket"), applied to the one kind it was never applied to.
     * Omitting both keys keeps the r1 colours exactly, so nothing that exists today moves.
     */
    const arm = pick(palette, spec, 'accent', 'paintY');
    const band = pick(palette, spec, 'accent2', 'paintR');
    /**
     * V3.71 lane I — THE ARM IS SLIMMED, because on the first car-park plate it was a beam.
     *
     * It was 3.8 x 0.46 x 0.46 with five 0.42 x 0.52 bands hung off it: at 1:1 scale that is
     * a 460 mm square section, which is a bridge girder, and the plate showed it as the
     * largest and most saturated object in the frame. A real boom arm is a 100-150 mm
     * aluminium section with painted bands ON it, not blocks strung along it. 3.5 x 0.15 x
     * 0.19 with five flush bands is the same read at a quarter of the mass, and the counter-
     * weight and hinge box stay so the arm is still hung rather than floating.
     *
     * `car-park` is the only caller of this kind, so nothing else moves.
     */
    add(kitBox(arm, 3.50, 0.15, 0.19, 1.62, 1.05, 0));
    add(kitBox(palette.steel, 0.46, 0.72, 0.40, 0, 1.05, 0));
    add(kitBox(palette.steel, 0.30, 0.26, 0.30, -0.30, 1.05, 0));
    add(kitCyl(band, 0.10, 0.10, 0.21, 3.32, 1.05, 0, 6));
    for (const [bx, mat] of [[0.52, band], [1.16, palette.steel], [1.80, band], [2.44, palette.steel], [3.02, band]]) {
      add(kitBox(mat, 0.40, 0.155, 0.195, bx, 1.05, 0));
    }
    group.userData.hinge = 'z';
  } else if (kind === 'roller') {
    const curtain = pick(palette, spec, 'accent', 'steel');
    const rib = pick(palette, spec, 'accent2', 'steel');
    add(kitBox(curtain, 2.4, 2.05, 0.12, 0, 1.15, 0));
    for (const y of [0.45, 0.70, 0.95, 1.20, 1.45, 1.70, 1.95]) {
      add(kitBox(rib, 2.28, 0.06, 0.08, 0, y, 0.06));
    }
    add(kitBox(rib, 2.5, 0.10, 0.08, 0, 2.18, 0.04));
    group.userData.lift = true;
  } else if (kind === 'tap') {
    add(kitCyl(palette.steel, 0.05, 0.05, 0.24, 0, 0.14, 0, 8));
    add(kitBox(pick(palette, spec, 'accent', 'paintR'), 0.28, 0.07, 0.07, 0, 0.28, 0));
    add(kitCyl(palette.steel, 0.035, 0.035, 0.18, 0.14, 0.16, 0, 6));
    add(kitCyl(pick(palette, spec, 'accent2', 'paintB'), 0.04, 0.04, 0.08, 0.14, 0.06, 0, 6));
    group.userData.spinAxis = 'y';
  } else {
    add(kitBox(palette.paintY, 0.4, 0.4, 0.4, 0, 0.2, 0));
  }
  return { group, parts };
}

export class CoreToys {
  constructor(board, palette) {
    this.board = board;
    this.palette = palette;
    this.items = [];
    this.byKey = new Map();
  }

  spawn(core, spec) {
    const { group } = buildToyMesh(spec, this.palette);
    const yaw = (spec.yaw ?? 0) * DEG;
    const wx = core.centre.x + (spec.x ?? 0);
    const wz = core.centre.z + (spec.z ?? 0);
    const wy = spec.y ?? 0;
    group.position.set(wx, wy, wz);
    group.rotation.y = yaw;
    group.name = `core-toy:${spec.kind}:${core.id}:${spec.id ?? '0'}`;
    this.board.root.add(group);

    const key = `prop:core-toy:${spec.kind}:${core.id}:${spec.id ?? '0'}`;
    const size = new THREE.Vector3(spec.sx ?? 1.2, spec.sy ?? 1.6, spec.sz ?? 1.2);
    const label = spec.label || furnitureLabel(spec.kind, key);
    const latching = LATCHING.has(spec.kind);
    /**
     * V3.71 lane I r2 — THE PROXY CENTRE MOVES WITH THE KIND, AND IT HAD TO.
     *
     * `_makeMischiefPickProxy` centres a `prop` at `y + sy / 2` and an `opening` at `y`
     * exactly, because a building opening passes the aperture's own centre while a prop
     * passes its base. A toy spec's `y` is the group ORIGIN and `sy` is the prop's height
     * above it, so re-registering these as openings without this line would have dropped the
     * boom's 1.3 m pick volume to span −0.49…0.81 — under the arm it is meant to select.
     * Half a metre of invisible geometry in the wrong place is exactly the class of fault
     * §5.5.7 was written about, so the centre is computed rather than inherited and the
     * world-space volume is unchanged.
     */
    /**
     * And `pickDx` / `pickDz`, because a boom is not centred on its hinge. The arm runs 3.5 m
     * out of a pivot at the group origin, so a proxy centred on the origin covers 48 % of the
     * arm's own span in X and the half a player would actually aim at is the half outside it.
     * The offset is in the toy's LOCAL frame and rotates with `yaw`, defaults to 0, and no
     * existing spec sets it — every other kind is symmetric about its origin and unmoved.
     */
    const pdx = spec.pickDx ?? 0;
    const pdz = spec.pickDz ?? 0;
    const pickCentre = new THREE.Vector3(
      wx + pdx * Math.cos(yaw) + pdz * Math.sin(yaw),
      latching ? wy + size.y / 2 : wy,
      wz - pdx * Math.sin(yaw) + pdz * Math.cos(yaw),
    );
    const pickProxy = this.board._makeMischiefPickProxy(
      key,
      pickCentre,
      size,
      { kind: latching ? 'opening' : 'prop', label },
    );
    const record = {
      key,
      kind: spec.kind,
      coreId: core.id,
      useId: core.useId,
      group,
      pickProxy,
      hits: 0,
      energy: 0,
      phase: hashPhase(key),
      spin: 0,
      baseYaw: yaw,
      wx,
      wy,
      wz,
      // BC2: set only by the true-size builders (`?pgtoys=0` leaves it null and `step()` as was).
      pivot: Number.isFinite(group.userData.pivot) ? group.userData.pivot : null,
      // Review fixes 1-2: the seesaw's contact angle and the spring rider's rocking child.
      maxTilt: Number.isFinite(group.userData.maxTilt) ? group.userData.maxTilt : null,
      rock: group.userData.rock ?? null,
    };
    this.items.push(record);
    this.byKey.set(key, record);

    /**
     * V3.71 lane I r2 — §3.5 IS WIRED, AND IT WAS NEVER WIRED FOR ANY BLOCK CENTRE (§5.5.6).
     *
     * Every toy on this layer registered `kind: 'prop'`. `mischief.js` routes `kind:
     * 'opening'` to its open/shut path and **everything else to the DAMAGE path**, so a tap
     * on a roller door dented it. `BlockCoreLayer.tap()` — the only route into
     * `CoreToys.tap()` — has no call site anywhere in `mvp/src`; the control is decisive,
     * `coreLayer?.step(` returns one hit and `coreLayer?.tap(` returns none. So the layer's
     * own toggle was unreachable and the registration sent the tap somewhere else. §3.5 was
     * asserted and GRADED on `market-hall` and `brigade-bay` on that basis, and this lane
     * inherited the pattern and asserted it the same way in r1.
     *
     * The fix is here rather than in a call site, and that matters: it needs no file outside
     * this directory. The LATCHING kinds — the ones that model an opening a person operates —
     * register as `kind: 'opening'` and hand mischief a `setOpen`. The route is then the same
     * one every building door already uses and which is known to work: pointer →
     * `main.js` `view.mischief.tap(hit.key)` → `mischief.tap()` → the opening branch →
     * eased `openK` → `setOpen`. The energy kinds — swing, valve, spinner, seesaw,
     * spring-rider, tap — stay props, because a swing is not an opening and the damage path
     * is the right one for them.
     *
     * `setOpen` is the single place the open pose is applied, so `step()` below and mischief
     * cannot fight over the same transform.
     */
    const target = {
      key,
      kind: latching ? 'opening' : 'prop',
      model: `core-${spec.kind}`,
      label,
      size,
      voxelKit: null,
      pickProxy,
      getPose: () => ({
        position: group.position.clone(),
        quaternion: group.quaternion.clone(),
      }),
      setOriginal: ({ visible = true, scale = 1, swayX = 0, swayZ = 0 } = {}) => {
        group.visible = visible;
        group.scale.setScalar(Math.max(0.001, scale));
        record.swayX = swayX;
        record.swayZ = swayZ;
      },
      setOpen: latching ? (k) => {
        const t = Math.max(0, Math.min(1, k));
        record.open = t;
        record.openTarget = t;
        record.latched = t >= 0.5;
        applyOpenPose(record);
      } : undefined,
      setVariant: () => {},
    };
    this.board.mischiefTargets.push(target);
    return record;
  }

  /**
   * §3.5 says "tap opens, tap shuts". Until r3 it only ever said "tap opens".
   *
   * `tap()` incremented `hits` and nothing else, and `step()` drove the roller from
   * `Math.min(1.6, hits * 0.28)`, the boom from `Math.min(1, hits * 0.28)` and the hatch
   * from `Math.min(1, hits * 0.35)` — all three monotonic in a counter that only goes up.
   * So every opening in the layer opened on the sixth tap and could never be shut again.
   * The r2 critic found it and counted it as the lane's one remaining §1-condition-2 item.
   *
   * The three LATCHING kinds are the ones that model a real opening a person operates, and
   * they toggle. The energy kinds — swing, valve, spinner, seesaw — keep the counter, because
   * a swing that reverses on the second push is not a swing.
   */
  tap(key) {
    const rec = this.byKey.get(key);
    if (!rec) return false;
    rec.hits += 1;
    rec.energy = Math.min(1, rec.energy + 0.22);
    if (LATCHING.has(rec.kind)) {
      rec.latched = !rec.latched;
      // r2: `openTarget` is the state `step()` eases toward and `setOpen()` writes, so this
      // route and the mischief route drive the same variable rather than two.
      rec.openTarget = rec.latched ? 1 : 0;
    }
    return true;
  }

  step(dt) {
    const t = dt || 0;
    for (const rec of this.items) {
      rec.energy *= Math.exp(-1.15 * t);
      if (rec.energy < REST && rec.hits === 0) continue;
      const e = rec.energy;
      const hits = rec.hits;
      rec.spin += t;
      const g = rec.group;
      if (rec.kind === 'swing' || rec.kind === 'double-swing') {
        const amp = Math.min(0.72, 0.16 + hits * 0.09) * Math.max(e, 0.08);
        const theta = Math.sin(rec.spin * 4.2 + rec.phase) * amp;
        g.rotation.x = theta + (rec.swayX ?? 0) * 0.4;
        g.rotation.z = (rec.swayZ ?? 0) * 0.3;
        if (rec.pivot !== null) holdPivot(rec);
      } else if (rec.kind === 'valve' || rec.kind === 'tap') {
        const target = hits * (Math.PI / 2);
        rec.theta = rec.theta ?? 0;
        rec.theta += (target - rec.theta) * Math.min(1, t * 6);
        g.rotation.y = rec.baseYaw + rec.theta;
      } else if (rec.kind === 'spinner') {
        rec.omega = rec.omega ?? 0;
        rec.omega += hits * 0.04;
        rec.omega *= Math.exp(-0.35 * t);
        rec.omega = Math.min(14, rec.omega + e * 8 * t);
        rec.angle = (rec.angle ?? 0) + rec.omega * t;
        g.rotation.y = rec.baseYaw + rec.angle;
      } else if (rec.kind === 'seesaw' || rec.kind === 'spring-rider') {
        let amp = Math.min(0.38, 0.12 + hits * 0.05) * Math.max(e, 0.1);
        if (rec.maxTilt !== null) amp = Math.min(amp, rec.maxTilt);
        const theta = Math.sin(rec.spin * 3.4 + rec.phase) * amp;
        if (rec.rock) rec.rock.rotation.z = theta;
        else g.rotation.z = theta;
        if (rec.pivot !== null && rec.kind === 'seesaw') holdPivot(rec);
      } else if (LATCHING.has(rec.kind)) {
        // r2: one branch for all three, easing the shared `openTarget`. Mischief drives the
        // same record through `setOpen()` on the pointer route and writes `openTarget = open`
        // as it goes, so this converges rather than pulling against it.
        const target = rec.openTarget ?? (rec.latched ? 1 : 0);
        rec.open = rec.open ?? 0;
        rec.open += (target - rec.open) * Math.min(1, t * (rec.kind === 'hatch' ? 6 : 5));
        applyOpenPose(rec);
      }
    }
  }
}

const PIVOT_LOCAL = new THREE.Vector3();
/**
 * BC2 — a swing turns about its beam and a seesaw about its axle, not about the group origin.
 * The origin stays where the pick proxy wants it (the seat zone), so the group is moved each
 * frame to keep the local pivot point fixed in the world. At rest the offset is exactly zero.
 */
function holdPivot(rec) {
  const g = rec.group;
  PIVOT_LOCAL.set(0, rec.pivot, 0).applyQuaternion(g.quaternion);
  g.position.set(rec.wx - PIVOT_LOCAL.x, rec.wy + rec.pivot - PIVOT_LOCAL.y, rec.wz - PIVOT_LOCAL.z);
}

function hashPhase(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) / 0x100000000) * Math.PI * 2;
}
