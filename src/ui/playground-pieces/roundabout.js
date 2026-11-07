// Roundabout family — spinner, dish, rocker, sit-spin. Shared kit only.
import {
  EXTRA, VOXEL_COLOURS,
  mat, box, cyl, taper, boundsOf,
} from './_kit.js';
import { variantIndexOf } from '../../core/playground-builder.js';
import * as THREE from 'three';

/**
 * Coral `#c9705a` is terracotta at iso. Kit `toyRed` has no paint map, so it lands
 * as candy-red plastic — the horse / sit-spin flag.
 */
const CANDY = VOXEL_COLOURS.toyRed;
const WHITE = '#f2efe8';
/** Untextured chrome — kit `steel` is galv and reads as stacked tyres. */
const CHROME = '#d8dee4';
const CHROME_MAT = { metal: 0.72, rough: 0.18 };

function toyRed(colour) {
  if (colour === VOXEL_COLOURS.coral || colour === VOXEL_COLOURS.rubberR) return CANDY;
  return colour;
}

export function buildRoundabout(group, entry, base, colour) {
  const v = variantIndexOf(entry.variant);
  if (v === 1) return buildRoundDish(group, entry, base, colour);
  if (v === 2) return buildRoundRocker(group, entry, base, colour);
  if (v === 3) return buildRoundSit(group, entry, base, colour);
  return buildRoundSpinner(group, entry, base, colour);
}

function addRaw(group, geometry, colour, x, y, z, extras = {}) {
  const mesh = new THREE.Mesh(geometry, mat(colour, extras));
  mesh.position.set(x, y, z);
  if (extras.rot) mesh.rotation.set(extras.rot[0] ?? 0, extras.rot[1] ?? 0, extras.rot[2] ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addDouble(group, geometry, colour, x, y, z, extras = {}) {
  const material = mat(colour, extras).clone();
  material.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (extras.rot) mesh.rotation.set(extras.rot[0] ?? 0, extras.rot[1] ?? 0, extras.rot[2] ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** White stem + candy knob. Voxel cylinders, not rust nubs. */
function knobGrip(group, x, y, z, rot) {
  cyl(group, WHITE, 0.030, 0.11, x, y, z, 8, { rough: 0.50, rot });
}

function knobEnd(group, red, x, y, z, rot) {
  cyl(group, red, 0.058, 0.11, x, y, z, 8, { rough: 0.50, rot });
}

/** Fat ring of the horse spring. Pitch is applied per-mesh so the stack winds. */
const COIL_RING = new THREE.TorusGeometry(0.148, 0.044, 8, 16);

/** Five countable chrome turns — compact wound column, not a monument helix. */
function woundCoil(group, y0) {
  const pitch = 0.086;
  const wind = 0.034;
  for (let i = 0; i < 5; i += 1) {
    const a = i * 1.26;
    addRaw(
      group, COIL_RING, CHROME,
      Math.cos(a) * wind,
      y0 + i * pitch,
      Math.sin(a) * wind,
      { metal: 0.72, rough: 0.18, rot: [Math.PI / 2 + 0.22, 0, a] },
    );
  }
}

/**
 * Spinner is a wheel: white pie face, gold dividers, proud red rim, stacked
 * yellow hub, white-stem red-knob handles. A kerbed disk is a manhole cover.
 */
export function buildRoundSpinner(group, entry, base, colour) {
  const b = boundsOf(entry);
  const r = Math.min(b.w, b.d) / 2 - 0.16;
  const red = toyRed(colour);
  const paint = { rough: 0.52 };

  cyl(group, EXTRA.rubberSole, r + 0.12, 0.07, b.cx, base + 0.035, b.cz, 16, { rough: 0.95 });
  cyl(group, EXTRA.rubberPour, r + 0.04, 0.04, b.cx, base + 0.08, b.cz, 16, { rough: 0.92 });
  taper(group, VOXEL_COLOURS.steel, 0.055, 0.09, 0.14, b.cx, base + 0.14, b.cz, 8, { metal: 0.40 });
  cyl(group, EXTRA.rubberSole, r * 0.80, 0.04, b.cx, base + 0.17, b.cz, 16, { rough: 0.92 });

  // White wearing face — pie is paint, not alternating rust bricks.
  cyl(group, WHITE, r * 0.76, 0.035, b.cx, base + 0.205, b.cz, 16, paint);
  const slices = 12;
  for (let i = 0; i < slices; i += 1) {
    const a = (i / slices) * Math.PI * 2;
    box(group, VOXEL_COLOURS.sun, r * 0.70, 0.018, 0.028,
      b.cx + Math.cos(a) * r * 0.36, base + 0.226, b.cz + Math.sin(a) * r * 0.36,
      { rough: 0.50, rot: [0, -a, 0] });
  }
  addRaw(
    group, new THREE.TorusGeometry(r * 0.80, 0.062, 8, 24),
    red, b.cx, base + 0.22, b.cz, { rough: 0.50, rot: [Math.PI / 2, 0, 0] },
  );

  // Stacked yellow boss — three courses, not a button.
  cyl(group, VOXEL_COLOURS.sun, r * 0.22, 0.050, b.cx, base + 0.24, b.cz, 12, { rough: 0.48 });
  taper(group, VOXEL_COLOURS.sun, 0.09, 0.16, 0.14, b.cx, base + 0.33, b.cz, 12, { rough: 0.48 });
  cyl(group, VOXEL_COLOURS.sun, 0.11, 0.055, b.cx, base + 0.42, b.cz, 12, { rough: 0.48 });
  cyl(group, VOXEL_COLOURS.sun, 0.07, 0.040, b.cx, base + 0.47, b.cz, 12, { rough: 0.48 });
  cyl(group, VOXEL_COLOURS.steel, 0.035, 0.03, b.cx, base + 0.50, b.cz, 8, { metal: 0.40 });

  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const tilt = [0, -a, Math.PI / 2 - 0.58];
    const hx = b.cx + ca * (r * 0.90);
    const hz = b.cz + sa * (r * 0.90);
    cyl(group, WHITE, 0.042, 0.30,
      hx, base + 0.36, hz, 8, { rough: 0.50, rot: tilt });
    cyl(group, red, 0.068, 0.13,
      b.cx + ca * (r * 1.08), base + 0.50, b.cz + sa * (r * 1.08), 8,
      { rough: 0.50, rot: tilt });
  }
}

/**
 * Dish is a stand-in saucer — hollow, shallow, floor you stand on, grab bars
 * on the rim. Tall T-posts and interior stakes read firepit.
 */
export function buildRoundDish(group, entry, base, colour) {
  const b = boundsOf(entry);
  const r = Math.min(b.w, b.d) / 2 - 0.14;
  const red = toyRed(colour);
  const paint = { rough: 0.54 };

  cyl(group, EXTRA.bluestone, r + 0.08, 0.07, b.cx, base + 0.035, b.cz, 16, { rough: 0.88 });
  taper(group, VOXEL_COLOURS.steel, 0.10, 0.16, 0.12, b.cx, base + 0.12, b.cz, 8, { metal: 0.40 });
  cyl(group, VOXEL_COLOURS.steel, 0.18, 0.04, b.cx, base + 0.19, b.cz, 10, { metal: 0.40 });

  const k = r / 0.80;
  const pts = [
    new THREE.Vector2(0.05 * k, 0.00),
    new THREE.Vector2(0.26 * k, 0.02),
    new THREE.Vector2(0.48 * k, 0.07),
    new THREE.Vector2(0.66 * k, 0.14),
    new THREE.Vector2(0.78 * k, 0.20),
    new THREE.Vector2(0.86 * k, 0.23),
    new THREE.Vector2(0.82 * k, 0.23),
    new THREE.Vector2(0.70 * k, 0.16),
    new THREE.Vector2(0.50 * k, 0.08),
    new THREE.Vector2(0.28 * k, 0.03),
    new THREE.Vector2(0.06 * k, 0.01),
  ];
  addRaw(group, new THREE.LatheGeometry(pts, 20), red, b.cx, base + 0.22, b.cz, paint);
  // Pale standing floor — the hollow is the saucer, not a fire bowl.
  cyl(group, EXTRA.paverPale, r * 0.34, 0.045, b.cx, base + 0.25, b.cz, 14, { rough: 0.60 });
  addRaw(
    group, new THREE.TorusGeometry(r * 0.84, 0.048, 6, 22),
    red, b.cx, base + 0.45, b.cz, { rough: 0.52, rot: [Math.PI / 2, 0, 0] },
  );

  // Low radial footholds on the floor, not grate posts.
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    box(group, red, r * 0.28, 0.035, 0.06,
      b.cx + Math.cos(a) * (r * 0.28), base + 0.27, b.cz + Math.sin(a) * (r * 0.28),
      { ...paint, rot: [0, -a, 0] });
  }

  // Rim grab bars — short, horizontal, on the lip.
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const hx = b.cx + Math.cos(a) * (r * 0.82);
    const hz = b.cz + Math.sin(a) * (r * 0.82);
    box(group, VOXEL_COLOURS.steel, 0.20, 0.045, 0.045, hx, base + 0.48, hz,
      { metal: 0.40, rot: [0, -a, 0] });
    cyl(group, VOXEL_COLOURS.steel, 0.028, 0.06, hx, base + 0.44, hz, 6, { metal: 0.40 });
  }

  // Short centre grab — a hold, not a pin the bowl sits on.
  cyl(group, VOXEL_COLOURS.steel, 0.045, 0.16, b.cx, base + 0.34, b.cz, 8, { metal: 0.40 });
  cyl(group, red, 0.055, 0.04, b.cx, base + 0.43, b.cz, 8, paint);
}

/**
 * Rocker is a spring horse: compact HORIZONTAL gallop (chest pitched up,
 * forelegs forward/up in air, hindlegs tucked under the rump), dark saddle,
 * chrome helix in yellow plates. Kid-toy scale. Do not grow the coil.
 */
export function buildRoundRocker(group, entry, base, colour) {
  void colour;
  const b = boundsOf(entry);
  const mount = new THREE.Group();
  mount.position.set(b.cx, 0, b.cz);
  // Authored along +X. Yaw is 0/90/180/270 and already swapped the 2×1 footprint.
  mount.rotation.y = -((entry.yaw ?? 0) * Math.PI / 180);
  group.add(mount);

  cyl(mount, EXTRA.rubberSole, 0.58, 0.07, 0, base + 0.035, 0, 16, { rough: 0.95 });
  cyl(mount, EXTRA.rubberPour, 0.48, 0.04, 0, base + 0.08, 0, 16, { rough: 0.92 });

  const rig = new THREE.Group();
  rig.position.set(0, base, 0);
  // r5 monument was 2.08. r6 loaf / r7 X stayed 1.92. Coil not grown.
  rig.scale.setScalar(1.92);
  mount.add(rig);

  const red = CANDY;
  const plate = { rough: 0.46 };
  // Yellow caps sandwich a short helix — wider than the coil so they hunt.
  cyl(rig, VOXEL_COLOURS.sun, 0.26, 0.050, 0, 0.10, 0, 14, plate);
  cyl(rig, VOXEL_COLOURS.sun, 0.21, 0.030, 0, 0.138, 0, 14, plate);
  cyl(rig, CHROME, 0.050, 0.018, 0, 0.162, 0, 10, CHROME_MAT);
  woundCoil(rig, 0.20);
  cyl(rig, CHROME, 0.044, 0.018, 0, 0.56, 0, 8, CHROME_MAT);
  cyl(rig, VOXEL_COLOURS.sun, 0.21, 0.030, 0, 0.592, 0, 14, plate);
  cyl(rig, VOXEL_COLOURS.sun, 0.25, 0.048, 0, 0.630, 0, 14, plate);
  cyl(rig, CHROME, 0.034, 0.042, 0, 0.672, 0, 8, CHROME_MAT);

  const horse = new THREE.Group();
  // Leap OVER the yellow sandwich. Coil height unchanged. Air is the silhouette.
  horse.position.set(0.10, 1.22, 0);
  horse.rotation.z = 0.18;
  rig.add(horse);

  const paint = { rough: 0.38 };
  const saddle = EXTRA.rubberSole;
  const hide = { rough: 0.86 };
  const strap = { rough: 0.48 };
  const tool = { rough: 0.72, tint: 0.62 };

  // Horizontal oval: long, low, chest proud, rump tucked. Not a cube on a disc.
  box(horse, red, 0.52, 0.08, 0.16, 0.00, 0.11, 0, paint);
  box(horse, red, 0.18, 0.12, 0.18, 0.24, 0.17, 0, paint);
  box(horse, red, 0.14, 0.08, 0.14, -0.24, 0.09, 0, paint);

  // Dark saddle tooled: pommel, horn, cantle, skirts.
  box(horse, saddle, 0.20, 0.05, 0.20, -0.02, 0.26, 0, hide);
  box(horse, saddle, 0.07, 0.12, 0.11, 0.08, 0.34, 0, hide);
  box(horse, saddle, 0.05, 0.05, 0.07, 0.08, 0.41, 0, hide);
  box(horse, saddle, 0.07, 0.10, 0.14, -0.12, 0.32, 0, hide);
  box(horse, saddle, 0.16, 0.12, 0.045, -0.02, 0.16, 0.14, hide);
  box(horse, saddle, 0.16, 0.12, 0.045, -0.02, 0.16, -0.14, hide);
  box(horse, saddle, 0.14, 0.016, 0.14, -0.02, 0.29, 0, tool);

  // Neck goes FORWARD into the skull, not a chimney.
  box(horse, red, 0.16, 0.12, 0.12, 0.34, 0.28, 0, { ...paint, rot: [0, 0, 0.30] });
  box(horse, red, 0.14, 0.12, 0.13, 0.48, 0.34, 0, paint);
  box(horse, red, 0.10, 0.08, 0.11, 0.56, 0.30, 0, paint);
  box(horse, EXTRA.rubberSole, 0.038, 0.038, 0.028, 0.46, 0.38, 0.07, hide);
  box(horse, EXTRA.rubberSole, 0.038, 0.038, 0.028, 0.46, 0.38, -0.07, hide);
  box(horse, red, 0.050, 0.048, 0.048, 0.44, 0.42, 0.046, { ...paint, rot: [0.14, 0, 0.10] });
  box(horse, red, 0.050, 0.048, 0.048, 0.44, 0.42, -0.046, { ...paint, rot: [-0.14, 0, 0.10] });

  // Chunky white bridle — must survive family iso.
  box(horse, WHITE, 0.10, 0.08, 0.16, 0.56, 0.32, 0, strap);
  box(horse, WHITE, 0.10, 0.07, 0.18, 0.46, 0.40, 0, strap);
  box(horse, WHITE, 0.16, 0.06, 0.050, 0.52, 0.33, 0.088, strap);
  box(horse, WHITE, 0.16, 0.06, 0.050, 0.52, 0.33, -0.088, strap);

  box(horse, WHITE, 0.10, 0.032, 0.032, 0.24, 0.30, 0.10, { rough: 0.50, rot: [0, 0, 0.28] });
  box(horse, WHITE, 0.10, 0.032, 0.032, 0.24, 0.30, -0.10, { rough: 0.50, rot: [0, 0, 0.28] });

  box(horse, red, 0.10, 0.06, 0.05, -0.28, 0.10, 0, { ...paint, rot: [0, 0, 0.70] });

  // GALLOP. Fore kicks FORWARD. Hind L-folds hang OFF the rump — countable at iso.
  for (const side of [-1, 1]) {
    const z = side * 0.14;
    box(horse, red, 0.10, 0.08, 0.08, 0.18, 0.07, z, paint);
    box(horse, red, 0.20, 0.07, 0.07, 0.36, 0.02, z, { ...paint, rot: [0, 0, -0.62] });
    box(horse, red, 0.14, 0.06, 0.06, 0.52, -0.06, z, { ...paint, rot: [0, 0, -0.95] });
    box(horse, saddle, 0.07, 0.05, 0.07, 0.62, -0.12, z, hide);
    box(horse, red, 0.11, 0.16, 0.11, -0.26, 0.02, z, paint);
    box(horse, red, 0.09, 0.20, 0.10, -0.18, -0.14, z, { ...paint, rot: [0, 0, 0.95] });
    box(horse, red, 0.14, 0.08, 0.09, 0.02, -0.22, z, { ...paint, rot: [0, 0, 0.15] });
    box(horse, saddle, 0.08, 0.055, 0.08, 0.12, -0.26, z, hide);
  }
}

/** Side-view U of the sit-spin bucket. High back is the silhouette. */
function makeSitScoop(scale) {
  const X = (v) => v * scale;
  const Y = (v) => v * scale;
  const s = new THREE.Shape();
  s.moveTo(X(0.20), Y(0.00));
  s.lineTo(X(-0.24), Y(0.00));
  s.lineTo(X(-0.26), Y(0.42));
  s.quadraticCurveTo(X(-0.16), Y(0.50), X(-0.08), Y(0.40));
  s.lineTo(X(-0.06), Y(0.08));
  s.quadraticCurveTo(X(0.06), Y(0.04), X(0.12), Y(0.08));
  s.lineTo(X(0.14), Y(0.16));
  s.quadraticCurveTo(X(0.18), Y(0.20), X(0.20), Y(0.14));
  s.lineTo(X(0.20), Y(0.00));
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.42 * scale,
    bevelEnabled: true,
    bevelThickness: 0.014 * scale,
    bevelSize: 0.012 * scale,
    bevelSegments: 2,
    curveSegments: 6,
    steps: 1,
  });
  g.translate(0, 0, -0.21 * scale);
  g.rotateY(-Math.PI / 2);
  return g;
}

const SIT_SCOOP = makeSitScoop(1);
const SIT_LINER = makeSitScoop(0.80);
const SIT_BOWL = new THREE.SphereGeometry(
  0.22, 12, 8, 0, Math.PI * 2, Math.PI * 0.38, Math.PI * 0.58,
);

/**
 * Sit-spin: one child, one axis — scooped bucket, high back, bolsters, T-handle
 * (white stems, red knobs), foot platter, side pegs. A grey pin with a red cube
 * on a disc is a hydrant.
 */
export function buildRoundSit(group, entry, base, colour) {
  const b = boundsOf(entry);
  const x = b.cx;
  const z = b.cz;
  const red = toyRed(colour);
  const paint = { rough: 0.38 };
  const steel = { metal: 0.40 };

  cyl(group, EXTRA.rubberSole, 0.48, 0.07, x, base + 0.035, z, 14, { rough: 0.95 });
  cyl(group, EXTRA.rubberPour, 0.40, 0.04, x, base + 0.08, z, 14, { rough: 0.92 });
  taper(group, VOXEL_COLOURS.steel, 0.08, 0.12, 0.12, x, base + 0.15, z, 8, steel);
  cyl(group, VOXEL_COLOURS.sun, 0.17, 0.04, x, base + 0.22, z, 12, { rough: 0.48 });
  cyl(group, VOXEL_COLOURS.steel, 0.10, 0.03, x, base + 0.25, z, 10, steel);

  // Foot platter — a disc you put feet on, wider than the post.
  cyl(group, VOXEL_COLOURS.steel, 0.38, 0.05, x, base + 0.30, z, 14, { metal: 0.38 });
  cyl(group, red, 0.34, 0.035, x, base + 0.335, z, 14, paint);
  for (const s of [-1, 1]) {
    cyl(group, VOXEL_COLOURS.steel, 0.028, 0.18, x, base + 0.31, z + s * 0.38, 6,
      { ...steel, rot: [Math.PI / 2, 0, 0] });
    cyl(group, EXTRA.rubberSole, 0.048, 0.08, x, base + 0.31, z + s * 0.48, 6,
      { rough: 0.9, rot: [Math.PI / 2, 0, 0] });
  }

  const seat = new THREE.Group();
  seat.position.set(x, base + 0.36, z);
  seat.scale.setScalar(1.52);
  group.add(seat);

  const scoop = addDouble(seat, SIT_SCOOP, red, 0, 0.02, 0, paint);
  scoop.rotation.y = 0.15;
  const liner = addDouble(seat, SIT_LINER, red, 0.01, 0.04, 0, { rough: 0.42, tint: 0.88 });
  liner.rotation.y = 0.15;
  const bowl = addDouble(seat, SIT_BOWL, red, -0.02, 0.12, 0, { ...paint, rot: [0.16, 0.15, 0] });
  bowl.scale.set(1.18, 0.78, 1.12);

  // High back + headrest — a chair, not a cube.
  box(seat, red, 0.09, 0.36, 0.32, -0.22, 0.28, 0, paint);
  box(seat, red, 0.07, 0.08, 0.24, -0.22, 0.48, 0, paint);
  box(seat, red, 0.18, 0.13, 0.055, -0.02, 0.14, 0.20, paint);
  box(seat, red, 0.18, 0.13, 0.055, -0.02, 0.14, -0.20, paint);
  cyl(seat, EXTRA.rubberSole, 0.12, 0.035, 0.00, 0.03, 0, 10, { rough: 0.85 });

  // T-handle: steel post, white stems, candy knobs.
  cyl(seat, VOXEL_COLOURS.steel, 0.028, 0.30, 0.20, 0.22, 0, 8, steel);
  box(seat, VOXEL_COLOURS.steel, 0.05, 0.05, 0.16, 0.20, 0.38, 0, { metal: 0.38 });
  for (const s of [-1, 1]) {
    knobGrip(seat, 0.20, 0.38, s * 0.16, [Math.PI / 2, 0, 0]);
    knobEnd(seat, red, 0.20, 0.38, s * 0.28, [Math.PI / 2, 0, 0]);
  }
}
