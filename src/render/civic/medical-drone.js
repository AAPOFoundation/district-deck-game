// District Deck V3.70 — the hospital's medical drone. Lane L3.
//
// OWNER REQUIREMENT, r4: when an injury happens on a construction site the hospital dispatches a
// DRONE to collect the patient. Two things live here, because they are two halves of one system
// and splitting them across files is how the pad and the craft drift apart:
//
//   1. `dronePad(ctx, …)`   the object on the podium roof, called by `hospital.js`. It replaces
//                           the helipad, which was a different object wearing the same paint.
//   2. `spawnMedicalDrone`  the craft, its flight and its animation, built to the same contract as
//                           `city-services.js`'s `buildAmbulanceGroup` / `_spawnAmbulance` /
//                           `_updateAmbulances` so wiring it is a one-file change in a file this
//                           lane does not own.
//
// WHY A DRONE PAD IS NOT A HELIPAD, ITEMISED, because "make it smaller" is not a rebuild:
//
//   helipad                              drone pad
//   ─────────────────────────────────    ──────────────────────────────────────────────
//   6.6 m marked circle                  4.4 m square deck — a quadcopter needs a footprint,
//                                        not a rotor-radius clearance circle
//   painted H                            painted LANDING CROSS inside a marked square, which is
//                                        what an automated craft's vision system is given
//   perimeter edge lights                four CORNER BEACONS on short posts, above deck level
//   fuel point, fire cabinet             a CHARGING CRADLE: a saucer on a pedestal with contact
//                                        rails, and the craft sits in it between calls
//   crew stair                           a HATCH with two leaves and a coaming, over the lift the
//                                        patient goes down through
//   windsock                             windsock — the one thing both objects genuinely share
//
// The craft has to read MEDICAL at board zoom or it is a camera drone: a slung casualty pod with a
// red band, a red cross on both fuselage flanks, and port/starboard/tail navigation lights on the
// same soft-pulse discipline `city-services.js` already uses (R19q: segments, never emissive orbs).
//
// Salt namespace 300–499, shared with `hospital.js` — the pad is part of that subject.

import * as THREE from 'three';
import {
  slab, box, cyl, taper, part, CIVIC_METRICS, steelRail,
} from './core.js';

const M = CIVIC_METRICS;

/* ══════════════════════════════════ 1. the pad ══════════════════════════════════ */

/**
 * Where the pad sits on the hospital, in the model's own coordinates, exported so the wiring in
 * `city-services.js` can resolve a world launch point from `hospital.centre` without importing
 * geometry. `y` is metres above the parcel's ground plane.
 *
 * The board rotates a civic use by `civic.rotation` (0/90/180/270 degrees) and offsets it by
 * `placement.modelOffset`, so the transform the caller needs is:
 *
 *   const yaw = (rotationDeg * Math.PI) / 180;
 *   padX = centre.x + offset.x + Math.cos(yaw) * PAD.x + Math.sin(yaw) * PAD.z;
 *   padZ = centre.z + offset.z - Math.sin(yaw) * PAD.x + Math.cos(yaw) * PAD.z;
 *
 * With `rotation` unavailable the centre plus `PAD.y` is a usable approximation — the craft then
 * launches from the middle of the roof rather than from the pad, which is wrong by 3.6 m at board
 * zoom and not wrong enough to hold the wiring up.
 */
export const HOSPITAL_DRONE_PAD = Object.freeze({
  x: 0.9,
  z: 3.4,
  /**
   * The height of the CRAFT'S ORIGIN when it is parked, not the height of the deck. The pad deck
   * top is 7.80 (podium 7.00 + plate rise 0.34 + roof step 0.12 + kerb 0.20 + deck 0.14) and the
   * craft's skids hang 1.16 below its origin, so a parked craft's origin sits at 8.96.
   *
   * These are the AUTHORED numbers for a 1 × 2 parcel. `index.js` scales every plan dimension by
   * the measured lot, so on a parcel that is not 15 × 31 the x and z move with it by the same
   * ratio; y does not move at all, because storey heights never scale.
   */
  y: 8.96,
  deck: 4.4,
});

/**
 * The drone pad: a square deck on a kerb, a marked landing cross, a charging cradle, four corner
 * beacons, a windsock and the hatch the patient goes down through.
 *
 * `top` is the podium roof level the pad stands on.
 */
export function dronePad(ctx, { x = 0, z = 0, top, deck = HOSPITAL_DRONE_PAD.deck, name = 'pad' }) {
  const p = ctx.p;
  const out = [];
  const half = deck / 2;
  const deckY = top + 0.34;

  // Deck on a kerb. Square, not circular: a quadcopter lands on a footprint.
  out.push(part(slab(deck + 0.44, 0.22, deck + 0.44, x, top, z, `${name}-kerb`), p.metal));
  out.push(part(slab(deck, 0.14, deck, x, top + 0.20, z, `${name}-deck`), p.ground));
  // A grated safety margin on the two camera-facing sides, in the darkest bucket, so the deck has
  // a border with section rather than a painted line. Two runs rather than four: the far pair is
  // occluded by the deck itself at every station the harness shoots, and the hospital is the
  // tightest subject in the lane against the 9,600 cap.
  for (const [gw, gd, gx, gz] of [
    [deck + 0.44, 0.20, x, z + half + 0.12],
    [0.20, deck, x + half + 0.12, z],
  ]) {
    out.push(part(slab(gw, 0.09, gd, gx, top + 0.22, gz, `${name}-grate`), p.shadow));
  }

  // N3: a small, soft-edged machine target rather than a second hard square on top of the deck.
  // Two eight-sided shallow discs make a low-poly roundel for sixteen triangles more than the six
  // old bars; the hospital still clears its 9,600 cap. The muted trim ring and tiny accent cross
  // remain legible from above without competing with the hospital's much larger identity cross.
  const markerR = Math.min(half - 0.62, 1.36);
  out.push(part(cyl(markerR, 0.035, x, deckY + 0.010, z, 'y',
    `${name}-marker-ring`, 8), p.trim));
  out.push(part(cyl(markerR * 0.72, 0.045, x, deckY + 0.020, z, 'y',
    `${name}-marker-inset`, 8), p.ground));
  out.push(part(slab(markerR * 0.92, 0.025, 0.18, x, deckY + 0.030, z,
    `${name}-marker-cross-h`), p.accent));
  out.push(part(slab(0.18, 0.025, markerR * 0.92, x, deckY + 0.030, z,
    `${name}-marker-cross-v`), p.accent));

  // Charging cradle: a pedestal, a shallow saucer the craft's skids seat into, and two contact
  // rails. This is where the drone lives between calls, and it is the single object that says the
  // pad belongs to a machine rather than to a pilot.
  const cx = x - half + 1.15;
  const cz = z - half + 1.15;
  out.push(part(slab(1.15, 0.30, 1.15, cx, deckY, cz, `${name}-dock-base`), p.metal));
  out.push(part(cyl(0.62, 0.13, cx, deckY + 0.36, cz, 'y', `${name}-dock-saucer`, 8), p.trim));
  out.push(part(box(0.86, 0.06, 0.62, cx, deckY + 0.45, cz, `${name}-dock-rail`), p.accent));
  out.push(part(box(0.24, 0.92, 0.24, cx - 0.62, deckY + 0.44, cz, `${name}-dock-riser`), p.metal));

  // Corner beacons on short posts, above deck level so they are not a painted dot.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const bx = x + sx * (half + 0.16);
      const bz = z + sz * (half + 0.16);
      out.push(part(slab(0.13, 0.52, 0.13, bx, top + 0.22, bz, `${name}-beacon-post`), p.metal));
      out.push(part(box(0.20, 0.20, 0.20, bx, top + 0.84, bz, `${name}-beacon-lens`), p.accent));
    }
  }

  // The hatch: a raised coaming with two leaves, over the lift the patient goes down through.
  const hx = x + half - 1.25;
  const hz = z + half - 1.15;
  out.push(part(slab(2.10, 0.17, 1.55, hx, deckY, hz, `${name}-hatch-coaming`), p.trim));
  for (const lo of [-0.48, 0.48]) {
    out.push(part(slab(0.92, 0.10, 1.30, hx + lo, deckY + 0.17, hz, `${name}-hatch-leaf`), p.metal));
  }

  // Windsock — the one piece of helipad vocabulary a drone pad keeps, because a light craft cares
  // about wind more than a heavy one does.
  const sx = x + half + 0.85;
  const sz = z - half + 0.55;
  out.push(part(taper(0.10, 0.07, 2.35, sx, top, sz, `${name}-sock-mast`, 6), p.metal));
  out.push(part(taper(0.26, 0.12, 0.92, sx, top + 2.35, sz, `${name}-sock`, 6), p.accent));

  // A guard rail on the open side facing the podium edge. A pad deck is a walkable surface (§1.2)
  // and the drop beyond this edge is seven metres.
  out.push(...steelRail(ctx, {
    x, y: top + 0.22, z: z + half + 0.30, w: deck + 0.30, axis: 'x', h: 0.94, name: `${name}-rail-f`,
  }));
  return out;
}

/* ═══════════════════════════════ 2. the craft ═══════════════════════════════ */

const CRAFT = Object.freeze({
  /** Rotor tip to rotor tip. Board-miniature scale — the ambulance beside it is 2.7 m long. */
  span: 3.30,
  bodyL: 1.45,
  bodyW: 0.78,
  bodyH: 0.52,
  rotorR: 0.55,
  /** How high the craft hovers over a site while the pod is on the ground. */
  hoverY: 6.0,
  /**
   * Cruise altitude. [MEASURED] the tallest thing this lane builds is `hospital-district` at
   * 23.54 m; 34 m clears it and every commercial subject in L4's ladder with room to spare, and it
   * is low enough that the craft is still a legible object at board zoom rather than a dot.
   */
  cruiseY: 34.0,
});

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.15,
    flatShading: true,
    emissive: opts.emissive ?? '#000000',
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    toneMapped: opts.toneMapped !== false,
  });
}

function boxMesh(w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * The craft. Same contract as `buildAmbulanceGroup`: returns a `THREE.Group` at the origin, its
 * own materials, nothing shared, `castShadow` on every mesh.
 *
 * IT HAS TO READ MEDICAL AT BOARD ZOOM. Three things carry that and none of them is a colour:
 *   - a slung CASUALTY POD under the fuselage, an elongated capsule with a canopy and a red band,
 *     hanging on two visible struts. A drone with a stretcher under it is not a camera drone.
 *   - a RED CROSS on both fuselage flanks and a red band around the body.
 *   - NAVIGATION LIGHTS, port red / starboard green / tail white, on the soft-pulse discipline the
 *     ambulance uses. Never an emissive orb.
 *
 * Named children the animation reaches for: `rotor0..3` (spin), `beaconR` / `beaconG` / `beaconW`
 * (pulse), `pod` (the casualty pod), `patient` (hidden until collected).
 */
export function buildMedicalDroneGroup() {
  const group = new THREE.Group();
  group.name = 'city-services:medical-drone';

  const white = mat('#eef1f3', { roughness: 0.52, metalness: 0.08 });
  const red = mat('#c42828', { roughness: 0.55, metalness: 0.08 });
  const dark = mat('#23262a', { roughness: 0.82, metalness: 0.18 });
  const grey = mat('#8f959a', { roughness: 0.6, metalness: 0.3 });
  const glass = mat('#2a3339', { roughness: 0.3, metalness: 0.12 });
  const lightRed = mat('#c42828', {
    roughness: 0.45, metalness: 0.1, emissive: '#801010', emissiveIntensity: 0.55,
  });
  const lightGreen = mat('#2e8b57', {
    roughness: 0.45, metalness: 0.1, emissive: '#10401f', emissiveIntensity: 0.55,
  });
  const lightWhite = mat('#f2f4f5', {
    roughness: 0.45, metalness: 0.1, emissive: '#6a6a60', emissiveIntensity: 0.55,
  });

  // Fuselage: a shouldered body, wider at the top, with a red band around it.
  const body = boxMesh(CRAFT.bodyL, CRAFT.bodyH, CRAFT.bodyW, white);
  body.position.y = 0.0;
  group.add(body);
  const spine = boxMesh(CRAFT.bodyL * 0.72, 0.16, CRAFT.bodyW * 0.86, grey);
  spine.position.y = CRAFT.bodyH / 2 + 0.06;
  group.add(spine);
  const band = boxMesh(CRAFT.bodyL * 0.30, CRAFT.bodyH + 0.04, CRAFT.bodyW + 0.04, red);
  band.position.set(-0.12, 0, 0);
  group.add(band);
  // Sensor head at the nose, so the craft has a front.
  const nose = boxMesh(0.24, 0.26, 0.36, dark);
  nose.position.set(CRAFT.bodyL / 2 + 0.10, -0.06, 0);
  group.add(nose);
  const lens = boxMesh(0.08, 0.16, 0.22, glass);
  lens.position.set(CRAFT.bodyL / 2 + 0.21, -0.06, 0);
  group.add(lens);

  // N3: each flank gets a real white sign plate before the red cross. The extra edge makes the
  // symbol survive against either sky or roof, while the roof cross keeps the cue facing the
  // board's elevated camera. All six pieces reuse the body/red buckets.
  for (const side of [1, -1]) {
    const plateZ = side * (CRAFT.bodyW / 2 + 0.025);
    const crossZ = side * (CRAFT.bodyW / 2 + 0.065);
    const plate = boxMesh(0.68, 0.50, 0.04, white);
    plate.position.set(0.22, 0.01, plateZ);
    plate.name = `medicalPlate${side > 0 ? 'P' : 'S'}`;
    group.add(plate);
    const crossH = boxMesh(0.52, 0.20, 0.05, red);
    crossH.position.set(0.22, 0.02, crossZ);
    crossH.name = `crossFlank${side > 0 ? 'P' : 'S'}H`;
    group.add(crossH);
    const crossV = boxMesh(0.20, 0.44, 0.05, red);
    crossV.position.set(0.22, 0.02, crossZ);
    crossV.name = `crossFlank${side > 0 ? 'P' : 'S'}V`;
    group.add(crossV);
  }
  const roofY = CRAFT.bodyH / 2 + 0.15;
  const roofH = boxMesh(0.62, 0.05, 0.20, red);
  roofH.position.set(0.10, roofY, 0);
  roofH.name = 'crossRoofH';
  group.add(roofH);
  const roofV = boxMesh(0.20, 0.05, 0.60, red);
  roofV.position.set(0.10, roofY, 0);
  roofV.name = 'crossRoofV';
  group.add(roofV);

  // Four separated corner arms and four solid spinning discs. The former centres sat only 0.56 m
  // off the fuselage, so their 1.24 m discs overlapped into one dark patch. These centres spend the
  // declared 3.30 m span: four unmistakable circles with a body-width of daylight between them.
  const arms = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  arms.forEach(([sx, sz], i) => {
    const ax = sx * (CRAFT.span / 2 - CRAFT.rotorR);
    const az = sz * (CRAFT.bodyW / 2 + CRAFT.rotorR * 0.96);
    const arm = boxMesh(Math.hypot(ax, az) * 0.94, 0.10, 0.12, grey);
    arm.position.set(ax * 0.50, 0.10, az * 0.50);
    arm.rotation.y = -Math.atan2(az, ax);
    arm.name = `rotorArm${i}`;
    group.add(arm);
    const pod = boxMesh(0.22, 0.20, 0.22, dark);
    pod.position.set(ax, 0.18, az);
    pod.name = `rotorMount${i}`;
    group.add(pod);
    // The disc: a thin cylinder, which at board zoom is what a spinning rotor looks like.
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(CRAFT.rotorR, CRAFT.rotorR, 0.045, 12),
      dark,
    );
    disc.position.set(ax, 0.31, az);
    disc.castShadow = true;
    disc.name = `rotor${i}`;
    group.add(disc);
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.15, 0.09, 8),
      grey,
    );
    hub.position.y = 0.055;
    hub.castShadow = true;
    hub.name = `rotorHub${i}`;
    disc.add(hub);
    // Two blades on the disc so the spin is visible rather than implied.
    for (const bl of [0, Math.PI / 2]) {
      const blade = boxMesh(CRAFT.rotorR * 1.85, 0.03, 0.10, grey);
      blade.rotation.y = bl;
      disc.add(blade);
      blade.position.set(0, 0.03, 0);
    }
  });

  // THE CASUALTY POD. Slung under the fuselage on two struts — the object that makes this a
  // medical craft and not a delivery one.
  const pod = new THREE.Group();
  pod.name = 'pod';
  const shell = boxMesh(1.55, 0.34, 0.52, white);
  group.add(pod);
  pod.add(shell);
  const podBand = boxMesh(0.34, 0.37, 0.55, red);
  podBand.position.x = -0.30;
  pod.add(podBand);
  const canopy = boxMesh(0.86, 0.16, 0.44, glass);
  canopy.position.set(0.18, 0.24, 0);
  pod.add(canopy);
  const cradle = boxMesh(1.62, 0.09, 0.60, grey);
  cradle.position.y = -0.20;
  pod.add(cradle);
  for (const sx of [-0.5, 0.5]) {
    const strut = boxMesh(0.09, 0.44, 0.09, grey);
    strut.position.set(sx * 1.0, 0.44, 0);
    pod.add(strut);
  }
  pod.position.y = -0.72;

  // Skids, so the craft stands on the pad rather than hovering over it in the still frame.
  for (const sz of [-1, 1]) {
    const skid = boxMesh(1.12, 0.08, 0.09, grey);
    skid.position.set(0, -1.12, sz * 0.38);
    skid.name = `skid${sz > 0 ? 'P' : 'S'}`;
    group.add(skid);
    for (const sx of [-0.38, 0.38]) {
      const leg = boxMesh(0.08, 0.32, 0.08, grey);
      leg.position.set(sx, -0.96, sz * 0.38);
      group.add(leg);
    }
  }

  // Navigation lights: port red, starboard green, tail white. Soft pulse only.
  const navR = boxMesh(0.11, 0.09, 0.11, lightRed);
  navR.position.set(0.30, 0.06, CRAFT.bodyW / 2 + 0.06);
  navR.name = 'beaconR';
  group.add(navR);
  const navG = boxMesh(0.11, 0.09, 0.11, lightGreen);
  navG.position.set(0.30, 0.06, -CRAFT.bodyW / 2 - 0.06);
  navG.name = 'beaconG';
  group.add(navG);
  const navW = boxMesh(0.11, 0.09, 0.11, lightWhite);
  navW.position.set(-CRAFT.bodyL / 2 - 0.06, 0.14, 0);
  navW.name = 'beaconW';
  group.add(navW);

  return group;
}

/* ══════════════════════════ 3. the flight, and the run ══════════════════════════ */

/**
 * A DRONE DOES NOT DRIVE, SO IT DOES NOT USE `pathToHospital`.
 *
 * `pathToHospital` snaps to a corridor centreline and turns an L — five waypoints, all at y 0, all
 * on the carriageway. That is a road vehicle's route and putting a flying craft on it would be the
 * worst of both: a drone tracing a street grid at rooftop height.
 *
 * This is a direct great-circle-in-plan flight with a vertical profile: climb from the pad, cruise
 * level at an altitude that clears the tallest building on the board, descend to a hover over the
 * site, and the reverse on the way home. Six waypoints out, six back, and the two legs share their
 * cruise altitude so the outbound and inbound tracks read as one round trip.
 */
export function droneFlightPath(pad, site, { cruiseY = CRAFT.cruiseY, hoverY = CRAFT.hoverY } = {}) {
  const padY = pad.y ?? 0;
  // A short lateral run before the climb tops out, so the craft leaves the pad rather than
  // shooting straight up like a lift.
  const dx = site.x - pad.x;
  const dz = site.z - pad.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const lead = Math.min(len * 0.22, 14);
  return [
    { x: pad.x, y: padY, z: pad.z },
    { x: pad.x, y: padY + 2.4, z: pad.z },
    { x: pad.x + ux * lead, y: cruiseY, z: pad.z + uz * lead },
    { x: site.x - ux * lead, y: cruiseY, z: site.z - uz * lead },
    { x: site.x, y: hoverY + 4.0, z: site.z },
    { x: site.x, y: hoverY, z: site.z },
  ];
}

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smootherstep = (value) => {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const damp = (from, to, dt, speed = 7) => from + (to - from) * (1 - Math.exp(-dt * speed));

/** Build once per dispatch; Catmull-Rom removes the polyline's hard heading changes. */
function flightCurve(points) {
  if (points.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(
    points.map((point) => new THREE.Vector3(point.x, point.y, point.z)),
    false,
    'catmullrom',
    0.18,
  );
  // Uniform Catmull-Rom gives this straight-in-plan route a gentle shoulder, but its spline may
  // overshoot a flat cruise pair. Preserve the authored altitude envelope explicitly.
  curve.userData = {
    flightMinY: Math.min(...points.map((point) => point.y)),
    flightMaxY: Math.max(...points.map((point) => point.y)),
  };
  curve.arcLengthDivisions = Math.max(48, points.length * 16);
  curve.updateArcLengths();
  return curve;
}

function flightPoint(curve, t) {
  const point = curve.getPointAt(clamp01(t));
  point.y = Math.max(curve.userData.flightMinY, Math.min(curve.userData.flightMaxY, point.y));
  return point;
}

function flightTangent(curve, t, radius = 0.004) {
  const before = flightPoint(curve, Math.max(0, t - radius));
  const after = flightPoint(curve, Math.min(1, t + radius));
  return after.sub(before).normalize();
}

/** Arc-length sample of a smooth 3D flight curve, including pitch and turn-derived bank. */
function sampleFlightCurve(curve, t) {
  if (!curve) return { x: 0, y: 0, z: 0, yaw: null, pitch: 0, bank: 0 };
  const u = clamp01(t);
  const point = flightPoint(curve, u);
  const tangent = flightTangent(curve, u);
  const flat = Math.hypot(tangent.x, tangent.z);
  const yaw = flat > 0.0001 ? Math.atan2(tangent.x, tangent.z) : null;
  const pitch = Math.max(-0.16, Math.min(0.16, -Math.atan2(tangent.y, Math.max(flat, 0.001))));

  const before = flightTangent(curve, Math.max(0, u - 0.025));
  const after = flightTangent(curve, Math.min(1, u + 0.025));
  const beforeFlat = Math.hypot(before.x, before.z);
  const afterFlat = Math.hypot(after.x, after.z);
  let bank = 0;
  if (beforeFlat > 0.0001 && afterFlat > 0.0001) {
    const a = Math.atan2(before.x, before.z);
    const b = Math.atan2(after.x, after.z);
    bank = Math.max(-0.12, Math.min(0.12, -angleDelta(a, b) * 1.15));
  }
  return { x: point.x, y: point.y, z: point.z, yaw, pitch, bank };
}

/** Public one-shot sampler retained for probes; live animation reuses a prebuilt curve. */
export function sampleFlight(points, t) {
  if (!points.length) return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };
  if (points.length === 1) return { ...points[0], yaw: 0, pitch: 0, bank: 0 };
  return sampleFlightCurve(flightCurve(points), t);
}

/**
 * One dispatch, ready to add to a scene and tick.
 *
 * `pad` is the world position of the hospital's drone pad including its height; `site` is the
 * construction-site anchor `city-services.js` already computes with `parcelKerbAnchor`.
 *
 * Phases, and each one is a thing the object does rather than a tween with a name:
 *
 *   launch    rotors spool up on the pad, then the craft lifts off the charging cradle
 *   outbound  climb, cruise, descend along `droneFlightPath`
 *   hover     station-keeping over the site with a slow yaw, while the pod is lowered
 *   collect   the pod comes back up on its winch with the casualty in it
 *   inbound   the reverse flight
 *   land      settle onto the pad, rotors spool down
 *
 * `update(dt, elapsed)` returns true when the run is finished and the caller should remove it.
 */
export function spawnMedicalDrone({ pad, site, patient = null } = {}) {
  const group = buildMedicalDroneGroup();
  const outPath = droneFlightPath(pad, site);
  const inPath = [...outPath].reverse();
  // Launch owns the pad → 2.4 m lift and land owns the inverse. The cruise curves therefore start
  // and finish at that same hover point instead of resampling the pad and teleporting by 2.2 m at
  // both seams (the old launch/outbound and inbound/land discontinuities).
  const outCurve = flightCurve(outPath.slice(1));
  const inCurve = flightCurve(inPath.slice(0, -1));
  const padY = pad.y ?? 0;
  const approachY = outPath[1].y;
  const approachLift = approachY - padY;
  group.position.set(pad.x, pad.y ?? 0, pad.z);
  group.rotation.order = 'YXZ';
  const pod = group.getObjectByName('pod');
  const rotors = [0, 1, 2, 3].map((i) => group.getObjectByName(`rotor${i}`));
  const lamps = ['beaconR', 'beaconG', 'beaconW'].map((n) => group.getObjectByName(n));
  if (patient) {
    patient.visible = false;
    patient.position.set(0, -0.10, 0);
    pod.add(patient);
  }
  const podRest = pod.position.y;

  const run = {
    group,
    pod,
    patient,
    outPath,
    inPath,
    phase: 'launch',
    t: 0,
    spin: 0,
    done: false,
    sitePhaseStartedAt: 0,
    update(dt, elapsed = 0) {
      if (this.done) return true;
      // Rotor speed is a state, not a constant: it spools with the phase, so a still frame of a
      // parked craft has still blades and a still frame of a flight has a disc.
      const wants = this.phase === 'launch'
        ? Math.min(1, this.t / 1.0)
        : this.phase === 'land' ? Math.max(0, 1 - this.t / 1.1) : 1;
      this.spin += dt * (4 + wants * 46);
      for (const r of rotors) if (r) r.rotation.y = this.spin;
      const pulse = 0.32 + Math.sin(elapsed * 9) * 0.22;
      for (const l of lamps) if (l?.material) l.material.emissiveIntensity = pulse;

      // ── r5: THE DEAD `reducedMotion` BRANCH IS DELETED, NOT MADE REACHABLE. ──
      //
      // r4 diagnosed exactly this defect in the ambulance — `city-services.js:536`'s
      // `const speed = this.reducedMotion ? 0.35 : 0.22` is unreachable because `_spawnAmbulance`
      // returns at the `reducedMotion` guard before it — and then shipped the same shape here. The
      // r4 critic found it and also found that the flag did nothing inside the function anyway:
      // calling `spawnMedicalDrone({ reducedMotion: true })` directly returned a live 25-second
      // run. Two dead branches where there had been one.
      //
      // The parameter is REMOVED from the signature rather than wired up, because the caller's
      // contract is that a reduced-motion session never spawns a drone at all — `city-services.js`
      // returns at `if (this.reducedMotion) return;` and that is the right place for the decision.
      // A speed constant that can only ever take one value is not a setting, it is a number.
      //
      // Tuned against the ambulance rather than chosen: `_updateAmbulances` runs at 0.22 over
      // 1.4 + 1.1 + 5.5 units of phase time, which is about 36 s of board time end to end. 0.38
      // over this run's 8.0 units lands at 40 s, so the drone reads as the same kind of event at
      // the same tempo and does not become the thing the player waits for.
      this.t += dt * 0.38;

      if (this.phase === 'launch') {
        // Spool, then ease off the cradle. The curve begins at this exact position.
        const u = Math.min(1, this.t / 1.5);
        const lift = smootherstep((u - 0.48) / 0.52);
        group.position.set(pad.x, padY + lift * approachLift, pad.z);
        group.rotation.x = damp(group.rotation.x, 0, dt);
        group.rotation.z = damp(group.rotation.z, 0, dt);
        if (u >= 1) { this.phase = 'outbound'; this.t = 0; }
      } else if (this.phase === 'outbound' || this.phase === 'inbound') {
        const curve = this.phase === 'outbound' ? outCurve : inCurve;
        const u = Math.min(1, this.t / 4.2);
        // Quintic ease reaches zero velocity at both ends without flattening the cruise middle.
        const s = sampleFlightCurve(curve, smootherstep(u));
        group.position.set(s.x, s.y, s.z);
        const yawError = s.yaw == null ? 0 : angleDelta(group.rotation.y, s.yaw);
        if (s.yaw != null) group.rotation.y += yawError * (1 - Math.exp(-dt * 6));
        // Curve curvature supplies the steady bank; heading correction supplies the gentle roll
        // while the craft reverses at the site. No elapsed-time wobble, hence no jitter.
        const targetBank = Math.max(-0.14, Math.min(0.14, s.bank - yawError * 0.07));
        group.rotation.z = damp(group.rotation.z, targetBank, dt, 6);
        group.rotation.x = damp(group.rotation.x, s.pitch, dt, 6);
        if (u >= 1) {
          this.phase = this.phase === 'outbound' ? 'hover' : 'land';
          this.t = 0;
          if (this.phase === 'hover') this.sitePhaseStartedAt = elapsed;
        }
      } else if (this.phase === 'hover') {
        // Station-keeping over the site: a slow yaw, a small continuous vertical breath, and the
        // pod winched down on its cradle. The breath starts at zero at the cruise seam.
        const u = Math.min(1, this.t / 2.2);
        const last = this.outPath[this.outPath.length - 1];
        const siteElapsed = Math.max(0, elapsed - this.sitePhaseStartedAt);
        group.position.set(last.x, last.y + Math.sin(siteElapsed * 1.35) * 0.12, last.z);
        group.rotation.y += dt * 0.22;
        group.rotation.x = damp(group.rotation.x, 0, dt);
        group.rotation.z = damp(group.rotation.z, 0, dt);
        pod.position.y = podRest - smootherstep(u) * (CRAFT.hoverY - 1.2);
        if (u >= 1) {
          this.phase = 'collect';
          this.t = 0;
          if (this.patient) this.patient.visible = true;
        }
      } else if (this.phase === 'collect') {
        const u = Math.min(1, this.t / 1.8);
        const last = this.outPath[this.outPath.length - 1];
        const siteElapsed = Math.max(0, elapsed - this.sitePhaseStartedAt);
        const breath = Math.sin(siteElapsed * 1.35) * 0.12 * (1 - smootherstep(u));
        group.position.set(last.x, last.y + breath, last.z);
        group.rotation.y += dt * 0.16;
        group.rotation.x = damp(group.rotation.x, 0, dt);
        group.rotation.z = damp(group.rotation.z, 0, dt);
        pod.position.y = podRest - (1 - smootherstep(u)) * (CRAFT.hoverY - 1.2);
        if (u >= 1) { this.phase = 'inbound'; this.t = 0; }
      } else if (this.phase === 'land') {
        const u = Math.min(1, this.t / 1.6);
        group.position.set(pad.x, padY + (1 - smootherstep(u)) * approachLift, pad.z);
        group.rotation.x = damp(group.rotation.x, 0, dt);
        group.rotation.z = damp(group.rotation.z, 0, dt);
        if (u >= 1) {
          group.position.set(pad.x, padY, pad.z);
          group.rotation.x = 0;
          group.rotation.z = 0;
          if (this.patient) this.patient.visible = false;
          this.phase = 'done';
          this.done = true;
          return true;
        }
      }
      return false;
    },
    dispose() {
      group.traverse((child) => {
        child.geometry?.dispose?.();
        if (child.material && child.material !== undefined) child.material.dispose?.();
      });
    },
  };
  return run;
}

export { CRAFT as MEDICAL_DRONE };
