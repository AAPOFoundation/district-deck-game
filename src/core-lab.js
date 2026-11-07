// Isolated block-core review lab. Does not import board.js, traffic, water, or residential.
// ?id=playground&variant=0&view=three-quarter|detail|top|board
// window.__coreLab.step(n) for headless capture.
// window.__coreLab.fit reports the station the plate was actually shot at, which solver ran,
// and whether the solve verified against its own projection. A capture driver should record it.

import * as THREE from 'three';
import { MaterialLibrary } from './render/materials.js';
import { CoreContext, createCorePalette, instanceModel, placementAt } from './render/block-cores/kit.js';
import { buildToyMesh } from './render/block-cores/toys.js';
import { BUILDERS } from './render/block-cores/index.js';

const params = new URLSearchParams(location.search);
const ID = params.get('id') ?? 'playground';
const VARIANT = Number(params.get('variant') ?? 0) | 0;
const VIEW = params.get('view') ?? 'three-quarter';

const canvas = document.querySelector('#lab');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(canvas.clientWidth || 1536, canvas.clientHeight || 1024, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#cfe6f7');

const camera = new THREE.PerspectiveCamera(32, 1536 / 1024, 0.1, 200);

// The live board's own rig, so `board` is the read a player actually gets rather than a
// fourth invented angle. `mvp/src/render/camera.js:29-31` poses the board at azimuth −45°
// and polar 42°; `:39` floors the zoom at 38 m; `mvp/src/render/scene.js:190` runs a 26°
// vertical FOV. Azimuth and FOV are what a silhouette read depends on, and the lab's other
// three stations match none of them — `three-quarter` is a 24.7° pitch at 32°, which is a
// display angle, not the board's.
//
// The 38 m below is the authored distance only; the fit solves the real one, so a tall
// centre is not cropped the way `district-energy` was for three rounds. For scale: at the
// rig's default 190 m a 15.4 m tile stands about 180 px on a 1024-tall canvas, so §2.9's
// "read the plate in greyscale at board zoom" is this plate downsampled to ~150 px.
const BOARD_AZIMUTH = (-45 * Math.PI) / 180;
const BOARD_POLAR = (42 * Math.PI) / 180;
const BOARD_EYE = [
  38 * Math.sin(BOARD_AZIMUTH) * Math.cos(BOARD_POLAR),
  0.6 + 38 * Math.sin(BOARD_POLAR),
  38 * Math.cos(BOARD_AZIMUTH) * Math.cos(BOARD_POLAR),
];

// Each station authors a DIRECTION and an aim. The fit below sets the distance.
//
//   fit    'lot' frames the whole tile including the pad; 'above-grade' frames everything
//          standing above ROOF_Y plus the ground under it. It is NOT called 'building' —
//          see "WHAT `above-grade` SELECTS" below, which is measured rather than asserted.
//   margin how much wider than the fitted subject the frame is. 1.00 is edge-to-edge.
//   axis   'both' fits width AND height, so nothing crops — the silhouette stations need this,
//          because a cropped roofline is the fault the fit exists to prevent. 'height' fits the
//          height and lets the width run off the sides.
//   fov    per-station, because `board` reproduces the live rig's 26° and the other three
//          keep the lab's authored 32°.
//
// WHY `detail` CROPS ITS WIDTH AND THE OTHERS DO NOT. The reference pack's six block-centre
// plates were measured rather than assumed: `mp-block-*` run 1518–1536 px wide in a 1536-wide
// frame — full bleed, cropped at both sides on five of six — and 849–1024 tall with a 50–121 px
// top margin. That is a height fit with the width let go, and it is most of the difference
// between their 0.60–0.90 subject fill and a fit that keeps every corner inside the frame.
//
// It cannot be the rule for `three-quarter` or `board`, because those two are where §2.9's
// silhouette read happens and `district-energy` lost three rounds to a cropped flue. So the
// crop is confined to the one station whose job is magnification.
const views = {
  'three-quarter': {
    pos: [16, 11, 16], look: [0, 0.6, 0], fov: 32, fit: 'lot', margin: 1.06, axis: 'both',
  },
  detail: {
    pos: [8, 4.2, 6.5], look: [0, 0.8, 0], fov: 32, fit: 'above-grade', margin: 1.02, axis: 'height',
  },
  top: {
    pos: [0, 28, 0.2], look: [0, 0, 0], fov: 32, fit: 'lot', margin: 1.06, axis: 'both',
  },
  board: {
    pos: BOARD_EYE, look: [0, 0.6, 0], fov: 26, fit: 'lot', margin: 1.06, axis: 'both',
  },
};
const view = views[VIEW] ?? views['three-quarter'];
camera.fov = view.fov ?? 32;
camera.updateProjectionMatrix();
camera.position.set(...view.pos);
camera.lookAt(...view.look);

const hemi = new THREE.HemisphereLight(0xd8e8f8, 0x6a5a40, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d8, 1.35);
sun.position.set(12, 18, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

// `?blind=1` hides the green ground disc for blind-pair captures, and this is the THIRD distinct
// tell this programme has had to remove from the same test. First the reference plates carried a
// generator watermark and printed board lettering (cropped out). Then backdrop colour co-varied
// perfectly with identity (fixed by `--normalise-backdrop`, which the harness already had). Then a
// critic measured that **our** plates carry a large green ellipse while the references are
// cut-outs: green share A/B across the six pairs ran 0.00/57.2, 56.9/0.01, 55.0/0.00, 0.00/58.8,
// 0.00/50.0, 53.0/0.00 — one line of arithmetic sorts every pair without looking at a model.
//
// The lesson each time is the same: a blind test leaks through whatever the two sides do NOT share,
// and presentation is not craft. The disc stays on by default because it is a useful ground for
// ordinary review; it comes off when the plate is going into a pair.
const BLIND = params.get('blind') === '1';
if (!BLIND) {
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(22, 32),
    new THREE.MeshStandardMaterial({ color: '#8aa56a', roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

const materials = new MaterialLibrary({ quality: 'high' });
const palette = createCorePalette(materials);
const builder = BUILDERS[ID];
if (!builder) throw new Error(`unknown core id ${ID}`);
const ctx = new CoreContext(palette, VARIANT);
builder(ctx);
const model = ctx.toModel();
const { group } = instanceModel(model, [placementAt(0, 0, 0, 0)]);
group.name = `lab:${ID}:v${VARIANT}`;
scene.add(group);
/** The subject, for framing. Deliberately NOT the whole scene — see the camera fit below. */
const subjectRoots = [group];
for (const spec of model.toys) {
  const { group: toy } = buildToyMesh(spec, palette);
  toy.position.set(spec.x ?? 0, spec.y ?? 0, spec.z ?? 0);
  toy.rotation.y = ((spec.yaw ?? 0) * Math.PI) / 180;
  scene.add(toy);
  subjectRoots.push(toy);
}

// ——— V3.70: dolly the camera to fit the station's subject ———
//
// The four view entries above are FIXED positions, identical for every subject. That is fine for
// a playground and wrong for anything tall: `district-energy`'s flues had been cut off by the frame
// for three consecutive review rounds, and the lane reported it twice before anyone looked at the
// camera. A critic cannot grade a silhouette it cannot see, and a builder cannot be asked to fix a
// roofline the plate crops.
//
// FIRST ATTEMPT AT THIS BOUNDED THE WHOLE SCENE AND WAS MUCH WORSE THAN THE BUG IT FIXED. The lab
// stands its subject on a large green ground disc, so a scene-wide bounding sphere is dominated by
// the ground, not the model: the camera pulled back until the object was a thumbnail in an empty
// field and the plate fell from ~850 kB to 66 kB. Bound the SUBJECT — the instanced model group and
// its toys — and nothing else.
//
// SECOND ATTEMPT BOUNDED THE SUBJECT AND STILL COULD NOT TAKE A DETAIL VIEW, FOR FOUR ROUNDS.
// It fitted the bounding SPHERE of the whole subject INCLUDING THE LOT PAD, and it only ever
// dollied out. On a block centre the pad is most of the object's radius — a 15.75 m square pad
// has a bounding-sphere radius near 11.2 m against about 3.5 m of built height — so
// `radius × 1.12 / sin(16°)` came to roughly 47 m for every subject and every station. Both
// stations then clamped to it: `detail`, authored at 10.9 m, and `three-quarter`, authored at
// 24.9 m, were shot 0.3 m apart. Measured on the r11 plates, the two views shared a bounding-box
// width to within a few pixels on all twelve rows and `detail` carried 9–12 % LESS subject area
// than the wide shot — the detail plate was the wider of the two. The subject filled 0.13–0.15 of
// the frame against the reference pack's 0.60. A sphere sized for a flat square pad reserves
// vertical for an object that has none, and that is a factor of six in area.
//
// So the fit now does two things the sphere fit could not:
//
//   1. It solves the EXACT projected silhouette rather than a circumscribed sphere. Every fit
//      point is projected onto the camera basis and the distance is the smallest one that keeps
//      the station's fitted axis inside the frustum with a margin. A sphere circumscribes that,
//      so it is strictly more conservative — that conservatism is the factor of six.
//   2. It dollies IN as well as out. The authored `pos` is a direction and an aim; the distance
//      is always solved. Nothing is "the authored distance" any more, because on this lab the
//      authored distances never survived contact with the fit anyway.
//
// The sphere survives as what the r11 critic asked it to be and nothing more: a never-crop guard
// that keeps the eye outside the box it is framing.
//
// WHAT `above-grade` SELECTS, AND WHAT IT DOES NOT. Until r13 this mode was called `building`
// and the comment here claimed it framed "the BUILT MASS, not the pad" by discriminating on
// ROOF_Y. The r13 critic measured the box it actually produces and the claim was false; the
// name and the claim are both withdrawn. Measured on all twelve rows:
//
//   * the above-ROOF_Y box runs 14.77–15.44 m across against a 15.82 m lot — 93–98 % of it.
//   * it is not fence posts and kerb planting alone. Per material bucket on `substation` v0 the
//     outermost above-ROOF_Y geometry sits at paintG 7.66 m, concrete 7.36, roof 7.32, soil 7.29
//     and steel 7.22, against a lot half-extent of 7.91. Six of six subjects build to their own
//     boundary, so no bucket subset leaves a compact mass behind either.
//   * an inset from the lot edge cannot rescue it. Insetting by 0.6 / 1.0 / 1.4 / 2.0 m returns
//     a box 14.22–14.61 / 13.72–13.82 / 12.90–13.02 / 11.70–11.81 m wide on EVERY row — that is
//     2 × (7.91 − inset) every time. The width reported would be the parameter set rather than
//     a property measured, which is the same species of fault as the claim it would replace.
//
// There is no discriminator here that isolates a built mass, because on these subjects there is
// no compact built mass to isolate: the lot is the object. What `detail` magnifies by is
// `axis: 'height'` letting the width crop, plus margin 1.02 against the wide stations' 1.06.
// The mode is named for the only thing it actually selects — geometry above grade.
const ROOF_Y = 0.60;
const MIN_HALF = 3.2;
const fitInfo = {
  view: VIEW,
  mode: view.fit,
  distance: null,
  authored: null,
  box: null,
  points: 0,
  solver: null,
  verified: false,
  fallback: false,
  extent: null,
  bounds: null,
};
{
  scene.updateMatrixWorld(true);

  const lotBox = new THREE.Box3();
  for (const root of subjectRoots) lotBox.expandByObject(root);

  // Everything above grade, at the same threshold the lane's own probes use:
  // `mvp/tests/v370-l5-swatch.mjs:298` sets `ROOF_Y = 0.60` and `v370-l5-critic2-lot.mjs` takes
  // `--roof 0.60`. Sharing the number keeps one definition of "above grade" in the lane. It does
  // NOT separate a building from its lot on these subjects — see the measured note above.
  const v = new THREE.Vector3();
  const instance = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  /** Every subject vertex, in world space, once per instance. */
  function forEachSubjectVertex(visit) {
    for (const root of subjectRoots) {
      root.traverse((node) => {
        const attribute = node.geometry?.attributes?.position;
        if (!attribute) return;
        const count = node.isInstancedMesh ? node.count : 1;
        for (let n = 0; n < count; n += 1) {
          if (node.isInstancedMesh) {
            node.getMatrixAt(n, instance);
            world.multiplyMatrices(node.matrixWorld, instance);
          } else {
            world.copy(node.matrixWorld);
          }
          for (let i = 0; i < attribute.count; i += 1) {
            visit(v.fromBufferAttribute(attribute, i).applyMatrix4(world));
          }
        }
      });
    }
  }

  const builtBox = new THREE.Box3();
  forEachSubjectVertex((p) => { if (p.y > ROOF_Y) builtBox.expandByPoint(p); });

  // A flat centre — a basin, a pocket park — has almost nothing above 0.60 m, and framing a
  // kerb edge-to-edge would be a magnified texel rather than a detail view. Widen the box to a
  // minimum window about its own centre, and always carry it down to the ground so the plinth
  // junction §2.1 asks about is inside the frame instead of cropped off the bottom.
  if (builtBox.isEmpty()) {
    builtBox.set(new THREE.Vector3(-MIN_HALF, 0, -MIN_HALF), new THREE.Vector3(MIN_HALF, 1.2, MIN_HALF));
  } else {
    const centre = builtBox.getCenter(new THREE.Vector3());
    builtBox.min.x = Math.min(builtBox.min.x, centre.x - MIN_HALF);
    builtBox.max.x = Math.max(builtBox.max.x, centre.x + MIN_HALF);
    builtBox.min.z = Math.min(builtBox.min.z, centre.z - MIN_HALF);
    builtBox.max.z = Math.max(builtBox.max.z, centre.z + MIN_HALF);
    builtBox.min.y = Math.min(builtBox.min.y, 0);
  }

  const target = view.fit === 'lot' ? lotBox : builtBox;
  if (!target.isEmpty()) {
    const look = new THREE.Vector3(...view.look);
    const eye = new THREE.Vector3(...view.pos);
    const dir = eye.clone().sub(look).normalize();
    const centre = target.getCenter(new THREE.Vector3());

    // Camera basis at the solved pose. `f` points from the eye toward the centre, so a corner's
    // depth from the eye is `distance + rel·f`.
    const f = dir.clone().negate();
    const reference = Math.abs(f.y) > 0.999
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(f, reference).normalize();
    const up = new THREE.Vector3().crossVectors(right, f).normalize();
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const tanH = tanV * camera.aspect;
    const margin = view.margin ?? 1.06;

    // SOLVE THE PROJECTED SILHOUETTE, NOT A WORLD-SPACE PROXY, AND SOLVE THE AIM WITH IT.
    //
    // Two things went wrong with the cheaper versions of this, and both were measured rather
    // than reasoned about:
    //
    //   * A world-space bounding box has eight corners and on these subjects most of them are
    //     AIR — the four upper ones sit above the roofline out at the footprint edge, where
    //     there is no geometry. Fitting those frames an empty cuboid rather than the object.
    //   * A solve against a FIXED aim reserves a symmetric window about that aim, so an object
    //     whose extremes sit on one side of it wastes the other side. On these subjects the near
    //     pad corner is 11 m closer to the eye than the far one, so the near corner sets the
    //     distance and the far half of the frame comes back empty. At margin 1.06 the substation
    //     three-quarter measured 1066 × 692 in a 1536 × 1024 frame, which is a 6 % margin
    //     behaving like a 44 % one. The distance and the aim have to be solved together, which
    //     the closed form below does — it is not a fixed-aim solve.
    //
    // So: project the fit points and solve the distance that just contains them, with the aim
    // solved alongside it. The reference pack is the check — `mp-block-*` run 1518–1536 px wide
    // in a 1536-wide frame, i.e. the object reaches the frame edge.
    //
    // THE THIRD ATTEMPT DID THAT BY FIXED-POINT ITERATION AND DID NOT CONVERGE. It measured the
    // NDC box, multiplied the distance by how far that box was from filling the frame, slid the
    // aim to centre it, and repeated 24 times. On `axis: 'height'` rows whose above-grade mass is
    // flat that loop is a divergent oscillator: at the guard distance the near pad corner sits
    // almost on the eye, so its projected height is enormous, the pass throws the camera far out,
    // the next pass finds a tiny subject and slams it back to the guard, and the aim ratchets
    // downward every cycle. Traced on `mobility-hub` v0 the distance flipped 11.16 ↔ 51.45 m
    // while the aim walked 9.67 m below the ground plane, and the loop exited on whichever half
    // of the cycle pass 23 happened to land on. Six of twelve `detail` rows hit the pass cap
    // without meeting the convergence test and three of those exited on the far half, so three
    // plates showed the subject at 3.9–16.2 % of frame jammed against the top edge. A solve that
    // can exit at pass N and hope is not a solve.
    //
    // THE DISTANCE IS NOW CLOSED-FORM, so there is nothing left to converge. Put the fit points
    // in the camera basis about the target centre:
    //
    //     w = (p − c)·f      u = (p − c)·right      v = (p − c)·up
    //
    // The aim slides only in the right/up plane and both are perpendicular to `f`, so `w` does
    // NOT depend on the aim — that is the whole trick, and it is what the iteration was missing.
    // Writing the aim as c + a·right + b·up, the vertical NDC of a point at distance d is
    // (v − b) / ((w + d)·tanV), and the station asks that its magnitude times `margin` be ≤ 1:
    //
    //     |v − b| ≤ (w + d)·tanV / margin =: h(d)
    //
    // A feasible aim exists exactly when max(v − h) ≤ min(v + h), i.e. when every pair satisfies
    // v_i − v_j ≤ (w_i + w_j + 2d)·tanV/margin. Separating i from j gives the exact answer in
    // one pass over the points:
    //
    //     d ≥ ( max_i A_i − min_j B_j ) / 2,   A = v·margin/tanV − w,   B = v·margin/tanV + w
    //
    // and the same in u/tanH for the width. `h` increases with d, so feasibility is MONOTONE:
    // once the frame contains the subject it contains it at every greater distance. The bound is
    // therefore the infimum, not a fixed point, and it is reached without iterating.
    //
    // The aim is then a one-dimensional minimax at that fixed distance — the offset that leaves
    // the same worst-case overflow on both sides — whose residual is strictly monotone in the
    // offset, so bisection converges to it with a guaranteed bracket rather than a hope. The
    // result is finally VERIFIED against the projection it claims to have solved, and a failure
    // falls back to the circumscribed-sphere fit, which needs no solve at all. `fitInfo` records
    // which of the two ran, so a capture manifest carries the fact rather than an assumption.
    const fitPoints = [];
    if (view.fit === 'lot') {
      forEachSubjectVertex((p) => { fitPoints.push(p.x, p.y, p.z); });
    } else {
      forEachSubjectVertex((p) => { if (p.y > ROOF_Y) fitPoints.push(p.x, p.y, p.z); });
      // Above-grade geometry on its own floats. Carry the ground under it into the fit as four
      // points, so §2.1's plinth junction is in frame rather than cropped off the bottom.
      for (let i = 0; i < 4; i += 1) {
        fitPoints.push((i & 1) ? target.max.x : target.min.x, 0, (i & 2) ? target.max.z : target.min.z);
      }
    }
    const count = fitPoints.length / 3;
    fitInfo.points = count;

    const U = new Float64Array(count);
    const V = new Float64Array(count);
    const W = new Float64Array(count);
    const kv = margin / tanV;
    const kh = margin / tanH;
    let maxAv = -Infinity; let minBv = Infinity;
    let maxAu = -Infinity; let minBu = Infinity;
    let behind = -Infinity;
    for (let i = 0; i < count; i += 1) {
      const dx = fitPoints[i * 3] - centre.x;
      const dy = fitPoints[i * 3 + 1] - centre.y;
      const dz = fitPoints[i * 3 + 2] - centre.z;
      const w = dx * f.x + dy * f.y + dz * f.z;
      const u = dx * right.x + dy * right.y + dz * right.z;
      const vv = dx * up.x + dy * up.y + dz * up.z;
      U[i] = u; V[i] = vv; W[i] = w;
      if (-w > behind) behind = -w;
      const av = vv * kv - w; if (av > maxAv) maxAv = av;
      const bv = vv * kv + w; if (bv < minBv) minBv = bv;
      const au = u * kh - w; if (au > maxAu) maxAu = au;
      const bu = u * kh + w; if (bu < minBu) minBu = bu;
    }

    // The never-crop guard, and nothing else: keep the eye outside the box being framed.
    const guard = target.getBoundingSphere(new THREE.Sphere()).radius * 1.05;
    const fitWidth = (view.axis ?? 'both') === 'both';
    const bounds = {
      height: (maxAv - minBv) / 2,
      width: (maxAu - minBu) / 2,
      front: behind + 0.25,
      guard,
    };
    let distance = Math.max(guard, bounds.front, bounds.height);
    if (fitWidth) distance = Math.max(distance, bounds.width);

    /**
     * The offset along one screen axis that equalises the worst overflow on each side.
     * `residual` is strictly decreasing in the offset, so the root is unique and bisection
     * brackets it from the start. 60 halvings of a bracket under 40 m is below double precision.
     */
    const balance = (values, half) => {
      let lo = Infinity; let hi = -Infinity;
      for (let i = 0; i < count; i += 1) {
        if (values[i] < lo) lo = values[i];
        if (values[i] > hi) hi = values[i];
      }
      for (let k = 0; k < 60; k += 1) {
        const mid = (lo + hi) / 2;
        let over = -Infinity; let under = -Infinity;
        for (let i = 0; i < count; i += 1) {
          const t = (values[i] - mid) / half[i];
          if (t > over) over = t;
          if (-t > under) under = -t;
        }
        if (over > under) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    };
    const halfV = new Float64Array(count);
    const halfH = new Float64Array(count);
    for (let i = 0; i < count; i += 1) {
      halfV[i] = (W[i] + distance) * tanV;
      halfH[i] = (W[i] + distance) * tanH;
    }
    const aim = centre.clone()
      .addScaledVector(right, balance(U, halfH))
      .addScaledVector(up, balance(V, halfV));

    // Verify against the projection this claims to have solved, rather than asserting it.
    const offset = new THREE.Vector3();
    const measure = (d, point) => {
      offset.copy(point).sub(centre);
      const oa = offset.dot(right);
      const ob = offset.dot(up);
      let ex = 0; let ey = 0; let minDepth = Infinity;
      for (let i = 0; i < count; i += 1) {
        const depth = W[i] + d;
        if (depth < minDepth) minDepth = depth;
        if (depth <= 1e-3) return { ex: Infinity, ey: Infinity, minDepth };
        const x = Math.abs((U[i] - oa) / (depth * tanH)) * margin;
        const y = Math.abs((V[i] - ob) / (depth * tanV)) * margin;
        if (x > ex) ex = x;
        if (y > ey) ey = y;
      }
      return { ex, ey, minDepth };
    };
    let extent = measure(distance, aim);
    let verified = extent.minDepth > 0 && extent.ey <= 1 + 1e-6 && (!fitWidth || extent.ex <= 1 + 1e-6);
    if (!verified) {
      // Deterministic fallback: the circumscribed-sphere fit about the target centre. Strictly
      // conservative, needs no solve, and cannot produce a void plate.
      const radius = target.getBoundingSphere(new THREE.Sphere()).radius;
      const halfAngle = fitWidth
        ? Math.min(Math.atan(tanV), Math.atan(tanH))
        : Math.atan(tanV);
      distance = Math.max(guard, (margin * radius) / Math.sin(halfAngle));
      aim.copy(centre);
      extent = measure(distance, aim);
      verified = extent.minDepth > 0;
      fitInfo.fallback = true;
    }

    camera.position.copy(aim).addScaledVector(dir, distance);
    camera.lookAt(aim);

    fitInfo.distance = distance;
    fitInfo.authored = eye.distanceTo(look);
    fitInfo.aim = [aim.x, aim.y, aim.z];
    fitInfo.solver = fitInfo.fallback ? 'sphere-fallback' : 'closed-form';
    fitInfo.verified = verified;
    fitInfo.extent = { x: extent.ex, y: extent.ey, minDepth: extent.minDepth };
    fitInfo.bounds = bounds;
    fitInfo.box = {
      min: [target.min.x, target.min.y, target.min.z],
      max: [target.max.x, target.max.y, target.max.z],
    };
  }
}

function render() {
  renderer.render(scene, camera);
}
render();
// Signals the capture harness that the first frame is on the canvas. Without it a driver either
// guesses a delay or screenshots an empty buffer — and a blank plate that passes a file-size check
// has already cost this programme one wasted critic round.
window.__coreLabReady = true;

window.__coreLab = {
  id: ID,
  variant: VARIANT,
  view: VIEW,
  // What the plate was ACTUALLY shot at, so a capture driver records the station rather than
  // assuming it. Four rounds of plates were labelled `detail` and shot at the wide distance.
  fit: fitInfo,
  step: (n = 1) => {
    for (let i = 0; i < n; i += 1) render();
  },
  scene,
  camera,
};
