// District Deck V3.41 — MP9 lane A: `cattle-abattoir`, the Melbourne meatworks.
//
// Governing contract: `docs/next-phase/V341-MP9-BUILDINGS-SPEC.md` §6A, read with the shared
// lane brief at `mvp/_reviews/mp9/LANE-BRIEF.md` and the industrial register block at
// `mvp/_reviews/industrial/_reference-mp/README.md`.
//
// WHAT THIS REPLACES, AND WHY IT WAS A FAULT RATHER THAN A GAP.
//
// `cattle-abattoir` was `factory-light` geometry with the word ABATTOIR on a sign plate — the
// same shed as `space-works` and `dairy-processor`, three subjects sharing one silhouette on a
// board where silhouette is the only thing that survives to board altitude. The r0 baseline plate
// (`mvp/_reviews/mp9/r0-baseline/cattle-abattoir--three-quarter.png`) is a box with a near-black
// roof plane, a bare hardstand, a stack that says "process plant", and nothing anywhere that says
// an animal ever came here.
//
// THE SILHOUETTE ARGUMENT, WHICH IS THE WHOLE JOB.
//
// An abattoir is not identified by its shed. It is identified by the things standing OUTSIDE the
// shed, and §6A names them: a pen field of steel-rail cattle yards with a curved drafting race, a
// forcing pen and a raised catwalk over it; and a water tower on legs. Neither shape exists
// anywhere else on the board — no other subject has a horizontal lattice of rails filling half a
// lot, and no other subject's vertical is a tank on four legs rather than a stack or a silo. So
// the pen field and the tower are built FIRST in the composition's order of importance, and the
// building is composed around them rather than the other way about.
//
// THE MASSING, IN THREE PIECES AT THREE HEIGHTS.
//
//   killing floor   x ∈ [leftX, chillX0]   full depth   eaves 8.40 m, ridge 10.35 m
//                   blockwork base, white render upper on brick pilasters, and a SAW-TOOTH
//                   VENTILATION MONITOR the length of the ridge — the thing a killing floor
//                   actually has, because the floor below it is washed down with steam.
//   chiller wing    x ∈ [chillX0, rightX]  front 2/3    eaves 5.55 m, insulated panel, mono roof
//                   with the refrigeration gantry, two insulated dock bays under one canopy.
//   plant compound  x ∈ [chillX0, rightX]  rear 1/3     dwarf wall, ammonia plant cage, receiver
//                   vessel, and the WATER TOWER standing over it on four braced legs.
//
// The step from 10.35 to 5.55 to 2.20 (compound wall) gives the silhouette three teeth before any
// ornament is hung on it, and the tower at 15.6 m clears all three. `school.js`'s finding — that
// two masses closer than about 8 u in plate columns merge into one tooth — is why the tower stands
// at the REAR of the lot rather than on the chiller roof: from the three-quarter station it then
// separates from the ridge in plan as well as in height.
//
// THE YARD IS HALF THE SUBJECT. The 1 × 2 parcel leaves roughly 13 m of depth in front of the
// building, and every metre of it is the identity. The pen field takes the west and centre, the
// truck lane and weighbridge take the east, and the race threads between them into the plant.
//
// VALUES. The r0 plate's roof was near-black because the factory kit roofs in `steel` (#333a3e).
// Nothing large here is in `steel`: the roof pitches are `cladding`, the monitor and the tank are
// `trim` (#c6cac5, the palest bucket), the blockwork is `wallAlt`, and `steel` is reserved for
// members thin enough that a dark value reads as a line rather than as a plane. `cattle-abattoir`
// has no `MATERIAL_IDENTITY` row, so `hardstandFamily` resolves to concrete at #a9a59c — a pale
// yard rather than the factory's asphalt, which is the value floor the whole plate needs.
//
// BUCKETS: wall, wallAlt, ground, cladding, trim, steel (= shadow), glass, goods, foliage. Nine,
// which is `INDUSTRIAL_BUCKET_CAP` exactly, and no material is constructed here.
//
// SALTS. 3000–3099 and nothing else. Calls INTO the yard kit pass yard-range salts (100–199),
// which is that kit's own namespace and is what the graded control does.

import {
  // primitives
  box, slab, rotBox, cyl, taper, ball, moulding, COPING_PROFILE,
  // industrial primitives
  louvreScreen, ladderCaged, pipeRun, dockBumper, gutterAndDownpipe,
  // the yard kit
  PLATE, boardPlate, hardstandSlab, apron, palisadeFence, industrialGate,
  bollard, wheelStop, kerb, serviceGrate, palletStack, drumCluster, skipBin,
  gasBottleCage, weedLine, specimenTree, grassTuft, lawnPanel,
  // plumbing
  emit, requestWear,
} from './core.js';

/* ────────────────────────────── local dimensional constants ────────────────────────────── */

/** The lot datum. `boardPlate`'s deck top; everything the building stands on. */
const GROUND = PLATE.rise;
/** Wearing surface above the deck — `hardstandSlab` lifts its slab top by this. */
const PAVE = 0.02;

/** Blockwork base of the killing floor. A wash-down building has a solid, impervious base. */
const BASE_H = 2.55;
/** Ridge above the killing-floor eaves. 1.95 on a 3.6 m half-span is about 28°. */
const ROOF_RISE = 1.95;
/** The ventilation monitor standing on the ridge: width, upstand, and tooth pitch. */
const MON_W = 1.98;
const MON_H = 1.62;
const MON_PITCH = 1.72;
/** Chiller wing eaves. The step down from the killing floor is half the silhouette. */
const CHILL_EAVE = 5.55;
/** Depth of the open plant compound at the rear of the chiller end. */
const COMPOUND_D = 4.90;
/** Dwarf wall around that compound. */
const COMPOUND_WALL_H = 2.20;
/** Dock floor, and therefore the platform height and the insulated-door sill. Trailer-bed height. */
const DOCK_FLOOR = 1.05;
/** Underside of the water tank. The tower is the abattoir's vertical, not a stack. */
const TOWER_LEGS = 11.30;
/** Top rail of a cattle yard, and the post top just above it. */
const RAIL_TOP = 1.72;
const POST_TOP = 1.92;
/** Deck of the raised catwalk over the race. Clear of a stockman's head on the rail below. */
const CATWALK_Y = 2.28;
/** Clear paving between the boundary fence and the plate edge — the perimeter footpath. */
const VERGE_W = 1.00;
/**
 * The STREET verge is wider than the other three, and the extra 0.55 m is a grass nature strip.
 *
 * The MP9 lane brief's fourth property is that "every building stands on a designed plinth —
 * balustrade, retaining wall, LAWN BAND, paved apron, planting, lamps", and the r1 census gives
 * the same instruction as a number: 23.5 % saturation against a reference band of 26.9–42.2 %.
 * `foliage` is the most saturated bucket the palette resolves (#8ba044, 57 %) and a 13 m × 0.8 m
 * strip of it across the front of the plate is the cheapest large move available. It is also the
 * honest one: a Melbourne industrial frontage has a nature strip between the kerb and the fence,
 * and the industrial doctrine's "no lawn" rule is about the YARD, which stays hardstand.
 */
const STREET_VERGE = 1.95;

/**
 * Rail heights on a cattle yard, measured off the pen floor.
 *
 * FOUR RAILS, NOT FIVE, AND THEY ARE 75 mm RATHER THAN 58. The r1 plate is the argument: at five
 * thin rails a run stops reading as a fence and starts reading as scaffolding, and a whole field
 * of it reads as a pale haze with no pen boundaries legible in it at all. Four heavier rails at a
 * wider spacing is both what a working yard is built from and what survives to board altitude,
 * and it costs 20 % fewer members while looking like more.
 */
const RAILS = Object.freeze([0.40, 0.84, 1.28, RAIL_TOP]);

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const DEG = Math.PI / 180;

/* ─────────────────────────────────── local helpers ─────────────────────────────────── */

/**
 * Raise everything this file authors onto the board plate's deck, once.
 *
 * Identical to the graded control's helper (`factory.js`), and it exists for the same reason:
 * the yard kit is authored in ABSOLUTE y and takes `y: PLATE.rise`, while a building is far
 * easier to reason about with its ground floor at zero. Authoring both in one frame means one
 * of them carries a constant on every line.
 */
function raisedContext(ctx, dy) {
  if (!dy) return ctx;
  return {
    ...ctx,
    push(geometry, material) {
      if (!material) return;
      const list = Array.isArray(geometry) ? geometry : [geometry];
      for (const g of list) {
        if (!g) continue;
        g.translate(0, dy, 0);
        g.computeBoundingBox();
        ctx.push(g, material);
      }
    },
  };
}

/**
 * A straight member between two arbitrary points — a rail on a curve, a brace, a catwalk
 * stringer, a leg tie.
 *
 * `core.js` has no two-point member. `pipeRun` is the nearest thing and it caps both ends with
 * 48-triangle spheres, which is right for a flanged pipe and ruinous for a 60 mm yard rail when
 * the pen field wants two hundred of them. Twelve triangles each, and it routes through `rotBox`
 * rather than raw `BufferGeometry` so it picks up metre UVs, the bounding box and the uv2 channel
 * the same way every other primitive in the kit does.
 *
 * THE EULER ORDER IS THE WHOLE OF THE ARITHMETIC. `rotBox` applies Z, then X, then Y. A box whose
 * long axis is X, rotated by `pitch` about Z and then `yaw` about Y, sends that axis to
 * (cos p · cos y, sin p, −cos p · sin y) — so `pitch = asin(dy / L)` and `yaw = atan2(−dz, dx)`
 * land it on the direction wanted, with no X term needed. Writing it any other way puts a 6 m
 * rail on its corner, which is the failure `boardPlate`'s own header records from the residential
 * seat.
 */
function strut(ax, ay, az, bx, by, bz, w, name = 'strut', thickness = null) {
  const dx = bx - ax; const dy = by - ay; const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.02) return null;
  const pitch = Math.asin(clamp(dy / len, -1, 1));
  const yaw = Math.atan2(-dz, dx);
  return rotBox(len, thickness ?? w, w, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2,
    { z: pitch, y: yaw }, name);
}

/** A point on a circle in plan. Degrees, because every race dimension below is read as a bearing. */
function arcPt(cx, cz, r, deg) {
  const t = deg * DEG;
  return { x: cx + r * Math.cos(t), z: cz + r * Math.sin(t) };
}

/**
 * A run of cattle yard: dark posts at a stockman's pitch carrying pale galvanised rails.
 *
 * THE VALUE SPLIT IS `wallAlt` POSTS UNDER `trim` RAILS, AND IT IS A MEASURED CHOICE.
 *
 * r1 built the posts in `steel` (#333a3e) for contrast against the pale hardstand. The MP9
 * orchestrator then censused the r0/r1 plates against three Monopoly Plus frames on subject
 * pixels only: ours crush 7–13 % of pixels below luminance 12, every reference frame crushes
 * 1.2–1.8 %, and "Monopoly Plus has no true blacks anywhere". A pen field is several hundred thin
 * members spread across half the lot, so putting it in the darkest bucket is the single largest
 * crush contributor a lane can author. Posts are `wallAlt` (#9c9992) and rails are `trim`
 * (#c6cac5): a 25-level step, which is a legible value break and not a black one. The darks on
 * this plate are reserved for openings, which is where the reference frames keep theirs.
 *
 * r2 SPENDS THE HEADROOM THAT MEASUREMENT BOUGHT. The r1 plate came back at 1.273 % crush against
 * a 2.0 % gate and reference frames at 1.767–1.782 %, i.e. we were the CLEANEST plate in the
 * comparison — and it read as pale scaffolding because nothing in the yard had any value in it.
 * Crush is a budget, not a prohibition. The posts go back to `steel`: they are a fifteenth of the
 * pen field's surface and they are what gives it rhythm, and the rails, deck, gates and stiles
 * stay pale. Under-shooting a value gate is a failure in the same family as over-shooting it.
 *
 * `open` is the run's gate: a fraction of the run left railless with a swinging leaf hung on it,
 * so a pen has a way in. A pen field with no gates is a fence, not a yard.
 */
function railRun(out, x1, z1, x2, z2, {
  y = 0, rails = RAILS, postPitch = 2.45, postW = 0.135, railW = 0.075,
  gateAt = null, gateW = 2.6, gateSwing = 0, name = 'yard-rail',
} = {}) {
  const dx = x2 - x1; const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.3) return;
  const ux = dx / len; const uz = dz / len;
  const bays = Math.max(1, Math.round(len / postPitch));

  // The gate opening, expressed as the interval of the run that carries no rail.
  const g0 = gateAt == null ? -1 : clamp(gateAt * len - gateW / 2, 0, len);
  const g1 = gateAt == null ? -1 : clamp(gateAt * len + gateW / 2, 0, len);

  for (let i = 0; i <= bays; i += 1) {
    const s = (len * i) / bays;
    if (gateAt != null && s > g0 + 0.05 && s < g1 - 0.05) continue;
    out.steel.push(box(postW, POST_TOP, postW, x1 + ux * s, y + POST_TOP / 2, z1 + uz * s,
      `${name}-post`));
  }
  // Rails run post to post as one member per bay rather than one per run: a 9 m rail crossing a
  // gate opening is the commonest way a yard drawing loses its gate.
  for (let i = 0; i < bays; i += 1) {
    const s0 = (len * i) / bays; const s1 = (len * (i + 1)) / bays;
    if (gateAt != null && s1 > g0 && s0 < g1) continue;
    for (const h of rails) {
      out.trim.push(strut(x1 + ux * s0, y + h, z1 + uz * s0, x1 + ux * s1, y + h, z1 + uz * s1,
        railW, `${name}-rail`));
    }
  }
  if (gateAt != null && g1 > g0) {
    // The leaf, hung off the post at g0 and swung into the pen. A tubular frame with three rails
    // and a diagonal, which is what a yard gate is.
    const c = Math.cos(gateSwing); const sN = Math.sin(gateSwing);
    const hx = x1 + ux * g0; const hz = z1 + uz * g0;
    const dxg = (ux * c - uz * sN) * (g1 - g0);
    const dzg = (uz * c + ux * sN) * (g1 - g0);
    out.steel.push(box(0.12, POST_TOP + 0.16, 0.12, hx, y + (POST_TOP + 0.16) / 2, hz,
      `${name}-gate-hinge-post`));
    out.trim.push(strut(hx, y + 0.08, hz, hx + dxg, y + 0.08, hz + dzg, 0.075, `${name}-gate-sill`));
    for (const h of [0.44, 0.92, 1.40, 1.76]) {
      out.trim.push(strut(hx, y + h, hz, hx + dxg, y + h, hz + dzg, 0.072, `${name}-gate-rail`));
    }
    out.trim.push(strut(hx, y + 0.10, hz, hx + dxg, y + 1.74, hz + dzg, 0.055, `${name}-gate-brace`));
    out.wallAlt.push(box(0.09, 1.86, 0.09, hx + dxg, y + 0.93, hz + dzg, `${name}-gate-stile`));
  }
}

/**
 * A rectangular pen: four rail runs with one gate, and a bedding patch if the pen is in use.
 *
 * `sides` names which runs to build, because pens share fences — drawing all four on every pen
 * puts two rails in one place, which the containment probes count as a major and which reads on
 * the plate as a thickened line.
 */
function pen(out, x0, z0, x1, z1, {
  y = 0, sides = 'NSEW', gate = null, name = 'pen',
} = {}) {
  if (sides.includes('S')) {
    railRun(out, x0, z0, x1, z0, { y, gateAt: gate === 'S' ? 0.5 : null, name: `${name}-s` });
  }
  if (sides.includes('N')) {
    railRun(out, x0, z1, x1, z1, { y, gateAt: gate === 'N' ? 0.5 : null, name: `${name}-n` });
  }
  if (sides.includes('W')) {
    railRun(out, x0, z0, x0, z1, { y, gateAt: gate === 'W' ? 0.5 : null, name: `${name}-w` });
  }
  if (sides.includes('E')) {
    railRun(out, x1, z0, x1, z1, { y, gateAt: gate === 'E' ? 0.5 : null, name: `${name}-e` });
  }
}

/**
 * A beast, and the r1 plate is why it is built the way it is.
 *
 * §6A does not ask for cattle and the lane brief asks twice — "the lot is inhabited", "is anything
 * on the lot alive". A pen field with nothing in it is a sculpture of a pen field.
 *
 * TWO THINGS WERE WRONG IN r1, AND BOTH ARE VISIBLE AT 2× ON THE PLATE.
 *
 * 1. THE BUCKET CARRIED A MATERIAL, NOT A COLOUR. Half the r1 herd went into `wall`, which is the
 *    brick bucket with a brick albedo and a brick normal on it, and at forty pixels a brick-mapped
 *    box in a stockyard is a stack of bricks. It is the exact failure the register block warns
 *    about from the other direction — wear and identity live in material response — and it means
 *    the buckets an ANIMAL can use are the smooth ones: `steel` for black, `trim` for white-faced,
 *    `goods` for tan. `wall` is now forbidden here and the comment says so.
 * 2. THE BODY WAS A BOX. Ten cuboids read as crates however they are proportioned. The barrel is
 *    now three overlapping spheres — shoulder, mid, rump — which need no rotation at all because a
 *    sphere is symmetric, so a mob at ten different headings costs nothing extra. A rounded body
 *    over a clear leg gap is the whole silhouette of a cow at board altitude.
 *
 * Six-segment spheres: 24 triangles each, 144 a head, and eleven head is 1.6 k of a 26 k budget.
 * Built along +Z in a local frame and turned about Y by `rot`, with the local offsets rotated by
 * the same angle — `rotBox` turns a box about its own centre and takes the centre in world space,
 * so the caller owns the plan rotation.
 */
function beast(out, x, z, {
  y = 0, rot = 0, bucket = 'steel', scale = 1, blaze = false, name = 'beast',
} = {}) {
  const c = Math.cos(rot); const sn = Math.sin(rot);
  const wx = (lx, lz) => x + lx * scale * c + lz * scale * sn;
  const wz = (lx, lz) => z - lx * scale * sn + lz * scale * c;
  const put = (bkt, w, h, d, lx, ly, lz, part) => {
    out[bkt].push(rotBox(w * scale, h * scale, d * scale, wx(lx, lz), y + ly * scale, wz(lx, lz),
      { y: rot }, `${name}-${part}`));
  };
  const orb = (bkt, r, lx, ly, lz, part) => {
    out[bkt].push(ball(r * scale, wx(lx, lz), y + ly * scale, wz(lx, lz), `${name}-${part}`, 6));
  };
  // The barrel: shoulder, mid and rump, overlapping into one rounded body.
  orb(bucket, 0.455, 0, 1.10, 0.52, 'shoulder');
  orb(bucket, 0.470, 0, 1.06, -0.10, 'mid');
  orb(bucket, 0.430, 0, 1.08, -0.72, 'rump');
  put(bucket, 0.60, 0.72, 1.30, 0, 1.08, -0.10, 'flank');
  // Neck and head, dropped forward the way a standing beast holds it.
  put(bucket, 0.34, 0.36, 0.60, 0, 1.14, 1.02, 'neck');
  put(blaze ? 'trim' : bucket, 0.34, 0.36, 0.50, 0, 0.98, 1.44, 'head');
  put(bucket, 0.09, 0.50, 0.09, 0, 0.92, -1.02, 'tail');
  for (const sx of [-1, 1]) {
    put(bucket, 0.14, 0.66, 0.15, sx * 0.25, 0.33, 0.52, 'foreleg');
    put(bucket, 0.15, 0.66, 0.16, sx * 0.26, 0.33, -0.62, 'hindleg');
  }
}

/** A roof cowl: a short shaft with a flared cap. Wash-down steam has to leave the building. */
function cowl(out, x, y, z, { r = 0.30, h = 0.72, name = 'cowl' } = {}) {
  out.steel.push(cyl(r, h, x, y + h / 2, z, 'y', `${name}-shaft`, 8));
  out.trim.push(taper(r * 1.55, r * 0.55, 0.34, x, y + h, z, `${name}-cap`, 8));
  out.trim.push(slab(r * 2.4, 0.09, r * 2.4, x, y - 0.05, z, `${name}-kerb`));
}

/** An air-cooled condenser: a pale casing, a dark coil face and two fan rings on top. */
function condenser(out, x, y, z, { w = 2.05, d = 1.15, h = 0.86, name = 'condenser' } = {}) {
  out.trim.push(slab(w, h, d, x, y, z, `${name}-casing`));
  out.steel.push(slab(w * 0.94, h * 0.62, 0.07, x, y + h * 0.18, z + d / 2, `${name}-coil`));
  out.steel.push(slab(w * 0.94, h * 0.62, 0.07, x, y + h * 0.18, z - d / 2, `${name}-coil`));
  for (const f of [-1, 1]) {
    const fx = x + f * w * 0.24;
    out.steel.push(cyl(0.40, 0.16, fx, y + h + 0.08, z, 'y', `${name}-fan-ring`, 10));
    out.trim.push(cyl(0.33, 0.05, fx, y + h + 0.17, z, 'y', `${name}-fan-blade`, 8));
  }
  out.steel.push(slab(w * 0.9, 0.10, 0.14, x, y - 0.10, z, `${name}-rail`));
}

/* ───────────────────────────────────── the builder ────────────────────────────────────── */

/**
 * `cattle-abattoir` — Melbourne meatworks.
 *
 * Order of construction is the order the thing is built in: the plate and the pour, then the
 * three masses, then the roof they carry, then the plant hung on them, then the yard, then the
 * stock in it.
 */
function buildAbattoir(rootCtx) {
  const root = rootCtx;
  const { env, p, v } = root;
  const ctx = raisedContext(root, GROUND);

  const inset = env.boundaryInset;
  const halfW = env.lotW / 2 - inset;
  const halfD = env.lotD / 2 - inset;
  const Y = PLATE.rise;

  const { bodyW, frontZ, backZ, eaveH } = env;
  /* THE BOUNDARY LINE IS DECLARED FIRST, AND r1 IS WHY.
     r1 derived the pen field from `halfW` and the fence from `VERGE_W` independently, so the
     yard's west rail landed at −6.60 while the boundary wall it was supposed to stand inside
     landed at −6.25: thirty-five centimetres of cattle yard built in the nature strip, on the
     one elevation the three-quarter station looks straight down. Nothing in the code said so and
     the bounding box could not catch it, because the rail was still on the plate. Everything that
     defines where the lot ENDS is now solved once, at the top, and every run below is measured
     against it rather than against the plate. */
  const fenceX = halfW - VERGE_W + 0.10;
  const leftX = -bodyW / 2;
  const rightX = bodyW / 2;

  /** The bundle. One `emit` at the end, so bucket routing is a single readable table. */
  const B = {
    wall: [], wallAlt: [], ground: [], cladding: [], trim: [],
    steel: [], glass: [], goods: [], foliage: [],
  };

  /* ── 1. THE PLATE AND THE POUR, on the ROOT context because the yard kit is authored in
        absolute y and takes `y: PLATE.rise`. Concrete rather than asphalt: `cattle-abattoir` has
        no `MATERIAL_IDENTITY` row so the family falls through to concrete at #a9a59c, and a pale
        yard is the value floor every other item on this plate is read against. ── */
  emit(root, boardPlate(root, {
    width: env.lotW - inset * 2, depth: env.lotD - inset * 2, salt: 168,
  }));
  emit(root, hardstandSlab(root, {
    x: 0, z: 0, width: env.lotW - inset * 2, depth: env.lotD - inset * 2, y: Y,
    mode: 'concrete', jointPitch: 3.9, patches: 4, cracks: 4, tidePools: 3, salt: 100,
  }));

  /* ── 2. THE THREE MASSES ── */
  const chillW = clamp(bodyW * 0.375, 3.90, 4.70);
  const chillX0 = rightX - chillW;
  const chillCx = rightX - chillW / 2;
  const killW = chillX0 - leftX;
  const killCx = leftX + killW / 2;
  const killD = frontZ - backZ;
  const killMidZ = (frontZ + backZ) / 2;
  const compZ1 = backZ + COMPOUND_D;          // plant compound runs backZ → compZ1
  const chillD = frontZ - compZ1;
  const chillMidZ = (frontZ + compZ1) / 2;
  const ridgeY = eaveH + ROOF_RISE;

  /* — 2a. KILLING FLOOR. Blockwork base, white painted-render upper on brick pilasters.
       §6A offers "white-glazed brick OR painted render"; the render is chosen because `trim`
       (#c6cac5) is the palest bucket on the subject and the r0 fault this lane closes is a plate
       whose values crush. Brick survives as ARTICULATION rather than as the field — pilaster
       strips and a head band in `wall` — which keeps the board's warm masonry present without
       giving the elevation back to it. — */
  B.wall.push(slab(killW, BASE_H, killD, killCx, 0, killMidZ, 'kill-base'));
  B.wallAlt.push(...moulding(killW + 0.24, 0.20, killCx, BASE_H, killMidZ, 'x', COPING_PROFILE,
    'kill-base-coping'));
  B.trim.push(slab(killW - 0.08, eaveH - BASE_H, killD - 0.08, killCx, BASE_H, killMidZ,
    'kill-upper'));

  // Pilaster strips at a structural bay pitch, returning round both flanks and the front. A
  // 15.8 m elevation with nothing on it is the "large undifferentiated plane" the register block
  // names as a silhouette fault, and pilasters are what a load-bearing wash-down building has.
  const bayN = Math.max(5, Math.round(killD / 3.1));
  for (let i = 0; i <= bayN; i += 1) {
    const pz = backZ + (killD * i) / bayN;
    for (const side of [-1, 1]) {
      const px = side < 0 ? leftX : chillX0;
      if (side > 0 && i > 0 && i < bayN) continue;     // the east flank is buried by the chiller
      B.wall.push(slab(0.46, eaveH - BASE_H - 0.30, 0.66, px + side * -0.02, BASE_H, pz,
        'kill-pilaster'));
    }
  }
  for (let i = 0; i <= 3; i += 1) {
    const px = leftX + 0.55 + ((killW - 1.1) * i) / 3;
    B.wall.push(slab(0.74, eaveH - BASE_H - 0.30, 0.30, px, BASE_H, frontZ + 0.01,
      'kill-front-pilaster'));
  }
  // Head band under the eaves, and a sill band over the blockwork. Two horizontals on a tall wall.
  B.wall.push(slab(killW + 0.16, 0.88, killD + 0.16, killCx, eaveH - 0.98, killMidZ, 'kill-head-band'));
  B.wallAlt.push(...moulding(killW + 0.20, 0.16, killCx, eaveH - 0.10, killMidZ, 'x', COPING_PROFILE,
    'kill-eaves-corbel'));

  // A painted name band across the front elevation, under the dispatcher's own fascia plate. A
  // meatworks puts its name on the wall in paint a storey high, and the r1 elevation had a 2.6 m
  // sign on a 7 m face and nothing else.
  B.trim.push(slab(killW * 0.86, 1.02, 0.16, killCx, BASE_H + 0.42, frontZ + 0.10, 'name-band'));
  B.wallAlt.push(...moulding(killW * 0.90, 0.13, killCx, BASE_H + 1.44, frontZ + 0.14, 'x',
    COPING_PROFILE, 'name-band-cornice'));

  // High-level strip windows on the west flank — a killing floor is lit from above the working
  // line and never at eye level. Deep reveal, pale mullions, dark glass.
  const winY = 6.15;
  for (let i = 0; i < bayN; i += 1) {
    const wz = backZ + (killD * (i + 0.5)) / bayN;
    B.steel.push(box(0.16, 1.34, 1.86, leftX - 0.05, winY + 0.67, wz, 'kill-window-reveal'));
    B.glass.push(box(0.09, 1.16, 1.70, leftX - 0.11, winY + 0.67, wz, 'kill-window'));
    B.trim.push(box(0.13, 1.22, 0.10, leftX - 0.12, winY + 0.67, wz, 'kill-window-mullion'));
    B.wallAlt.push(slab(0.34, 0.12, 2.06, leftX - 0.10, winY - 0.12, wz, 'kill-window-sill'));
  }

  /* — 2b. THE ROOF, AND THE MONITOR THAT IS THE POINT OF IT.
       A gable with its ridge running the LONG way (along z), so the monitor on it is a 14 m run
       rather than a 7 m one. `prism` pitches to the eaves in z and cannot make this roof, so the
       two pitches are `rotBox` ramps about Z: a slab whose long axis is x, tilted by the pitch
       angle, extruded the depth of the building. `cladding` rather than `steel` — the r0 plate's
       near-black roof came from roofing a 180 m² plane in #333a3e. — */
  const halfSpan = killW / 2;
  const pitchLen = Math.hypot(halfSpan, ROOF_RISE);
  const pitchAng = Math.atan2(ROOF_RISE, halfSpan);
  for (const side of [-1, 1]) {
    B.cladding.push(rotBox(pitchLen + 0.34, 0.17, killD + 0.44,
      killCx + side * halfSpan / 2, eaveH + ROOF_RISE / 2 - 0.06, killMidZ,
      { z: side < 0 ? pitchAng : -pitchAng }, 'kill-roof-pitch'));
    // The eaves fascia, square to the world so it reads as a line under the roof edge.
    B.trim.push(slab(0.20, 0.30, killD + 0.44, killCx + side * (halfSpan + 0.16), eaveH - 0.14,
      killMidZ, 'kill-fascia'));
  }
  // Gable ends, closing the triangle at the front and the back. Two ramps meeting a wall with a
  // hole between them is the failure a critic finds first on a hand-built gable.
  for (const [gz, gn] of [[frontZ - 0.09, 'front'], [backZ + 0.09, 'back']]) {
    for (const side of [-1, 1]) {
      B.wall.push(rotBox(pitchLen, ROOF_RISE * 0.92, 0.22,
        killCx + side * halfSpan / 2, eaveH + ROOF_RISE * 0.24, gz,
        { z: side < 0 ? pitchAng : -pitchAng }, `kill-gable-${gn}`));
    }
    B.wall.push(slab(0.9, ROOF_RISE * 0.5, 0.26, killCx, eaveH, gz, `kill-gable-apex-${gn}`));
    // A louvred gable vent. A killing floor is a heat load and the ridge monitor is not the whole
    // of its ventilation; it also gives a blank gable triangle something to be read against.
    B.steel.push(box(1.35, 0.92, 0.16, killCx, eaveH + ROOF_RISE * 0.30, gz + (gz > 0 ? 0.10 : -0.10),
      `kill-gable-vent-${gn}`));
    for (let k = 0; k < 4; k += 1) {
      B.trim.push(rotBox(1.30, 0.09, 0.16, killCx, eaveH + ROOF_RISE * 0.30 - 0.33 + k * 0.22,
        gz + (gz > 0 ? 0.17 : -0.17), { x: 0.45 }, `kill-gable-blade-${gn}`));
    }
  }

  /* — THE SAW-TOOTH VENTILATION MONITOR. §6A's named item, and the reason the ridge runs long.
       Each tooth is a vertical louvred face with a pitched top falling to the foot of the next,
       so the ridge line reads as a comb from every station rather than as a straight line — the
       one profile on this board that belongs to a building that steams. The louvres face WEST,
       which is the camera side on the three-quarter station, so the teeth are read as openings
       rather than as blank boxes. — */
  const monZ0 = backZ + 1.05;
  const monZ1 = frontZ - 1.05;
  const monTeeth = Math.max(4, Math.round((monZ1 - monZ0) / MON_PITCH));
  const monBay = (monZ1 - monZ0) / monTeeth;
  B.trim.push(slab(MON_W + 0.26, 0.30, monZ1 - monZ0 + 0.30, killCx, ridgeY - 0.34, (monZ0 + monZ1) / 2,
    'monitor-kerb'));
  for (let i = 0; i < monTeeth; i += 1) {
    const z0 = monZ0 + monBay * i;
    const z1 = z0 + monBay;
    const faceZ = z1 - 0.06;
    // The riser: a louvred opening in a pale frame.
    B.trim.push(slab(MON_W, MON_H, 0.14, killCx, ridgeY - 0.06, faceZ, `monitor-riser-${i}`));
    B.steel.push(slab(MON_W - 0.30, MON_H - 0.26, 0.10, killCx, ridgeY + 0.07, faceZ - 0.09,
      `monitor-reveal-${i}`));
    emit(ctx, louvreScreen({
      x: killCx, y: ridgeY + 0.07 + (MON_H - 0.26) / 2, z: faceZ + 0.06,
      width: MON_W - 0.34, height: MON_H - 0.30, facing: 1, blade: 0.15,
      name: `monitor-louvre-${i}`,
    }));
    // The falling top, from this tooth's head down to the next tooth's foot.
    const topLen = Math.hypot(monBay, MON_H - 0.34);
    const topAng = Math.atan2(MON_H - 0.34, monBay);
    B.trim.push(rotBox(MON_W + 0.16, 0.13, topLen,
      killCx, ridgeY + MON_H * 0.5 - 0.10, (z0 + z1) / 2,
      { x: topAng }, `monitor-top-${i}`));
    // Cheeks closing the tooth at both flanks, so the comb is solid rather than a row of flags.
    for (const side of [-1, 1]) {
      B.trim.push(rotBox(0.10, MON_H * 0.86, topLen, killCx + side * (MON_W / 2 + 0.05),
        ridgeY + MON_H * 0.18, (z0 + z1) / 2, { x: topAng }, `monitor-cheek-${i}`));
    }
  }
  // Roof cowls beside the monitor — the extract a wash-down floor needs beyond the ridge vent.
  cowl(B, killCx - halfSpan * 0.52, eaveH + ROOF_RISE * 0.46, backZ + killD * 0.26, { r: 0.32 });
  cowl(B, killCx - halfSpan * 0.52, eaveH + ROOF_RISE * 0.46, backZ + killD * 0.62, { r: 0.28 });
  cowl(B, killCx + halfSpan * 0.50, eaveH + ROOF_RISE * 0.48, backZ + killD * 0.44, { r: 0.30 });

  // Gutter and downpipe on the west eaves, where the pitch actually discharges.
  emit(ctx, gutterAndDownpipe({
    x: leftX, y: eaveH - 0.02, z: killMidZ, runLength: killD, axis: 'z',
    dropAt: backZ + killD * 0.22, wallPlane: leftX, facing: -1, name: 'kill-rainwater',
  }));

  /* — 2c. CHILLER WING. Insulated panel over a blockwork kick, a mono roof falling away from the
       killing floor, and the bank of insulated dock doors §6A asks for. `cladding` here rather
       than `trim`: two white masses of similar height merge into one tooth, and the taupe of the
       abattoir's cladding list (#70584a) is the one mid value on the plate. — */
  B.wall.push(slab(chillW, 1.85, chillD, chillCx, 0, chillMidZ, 'chill-kick'));
  B.wallAlt.push(...moulding(chillW + 0.20, 0.16, chillCx, 1.85, chillMidZ, 'x', COPING_PROFILE,
    'chill-kick-coping'));
  B.cladding.push(slab(chillW, CHILL_EAVE - 1.85, chillD, chillCx, 1.85, chillMidZ, 'chill-panel'));
  // Panel joints — an insulated panel wall is read by its 1.2 m joint lines and by nothing else.
  for (let i = 1; i * 1.20 < CHILL_EAVE - 2.0; i += 1) {
    const jy = 1.85 + i * 1.20;
    B.trim.push(slab(chillW + 0.07, 0.10, chillD + 0.07, chillCx, jy, chillMidZ, 'chill-joint'));
  }
  B.trim.push(slab(chillW + 0.16, 0.30, chillD + 0.16, chillCx, CHILL_EAVE - 0.28, chillMidZ,
    'chill-capping'));
  // Vertical panel modules on the east flank — an insulated wall is a grid, not a stripe, and a
  // 11 m elevation with only horizontals on it is the undifferentiated plane the register forbids.
  for (let i = 1; i < 6; i += 1) {
    B.trim.push(box(0.08, CHILL_EAVE - 2.15, 0.09, rightX + 0.02, (CHILL_EAVE + 1.85) / 2,
      compZ1 + (chillD * i) / 6, 'chill-panel-joint-v'));
  }
  // Mono roof, falling 0.55 m from the killing-floor side out to the east eaves.
  const chillRoofLen = Math.hypot(chillW, 0.55);
  B.cladding.push(rotBox(chillRoofLen + 0.2, 0.15, chillD + 0.22, chillCx, CHILL_EAVE + 0.16,
    chillMidZ, { z: -Math.atan2(0.55, chillW) }, 'chill-roof'));

  /* — 2d. THE DOCK. Two insulated bays under one canopy, on a platform at trailer-bed height,
       with hose points, a channel drain and a wash-down bay in front of them. — */
  const bayW = 2.62;
  const bayPitch = 0.62 + bayW;
  const dockCx = chillCx + 0.12;
  const platformD = 1.80;
  B.wallAlt.push(slab(chillW + 0.5, DOCK_FLOOR, platformD, chillCx, 0, frontZ + platformD / 2,
    'dock-platform'));
  B.steel.push(slab(chillW + 0.5, 0.10, 0.10, chillCx, DOCK_FLOOR - 0.10, frontZ + platformD,
    'dock-nosing'));
  for (const s of [-1, 1]) {
    const bx = dockCx + s * bayPitch / 2;
    // The opening: a deep dark reveal with an insulated leaf inside it and heavy hinges.
    B.steel.push(box(bayW + 0.18, 3.12, 0.42, bx, DOCK_FLOOR + 1.56, frontZ - 0.14, 'dock-reveal'));
    B.trim.push(box(bayW, 2.94, 0.14, bx, DOCK_FLOOR + 1.47, frontZ + 0.03, 'dock-leaf'));
    B.trim.push(box(bayW + 0.30, 0.22, 0.26, bx, DOCK_FLOOR + 3.06, frontZ + 0.05, 'dock-head'));
    for (const h of [0.5, 1.6, 2.6]) {
      B.steel.push(box(0.34, 0.14, 0.20, bx - bayW / 2 + 0.06, DOCK_FLOOR + h, frontZ + 0.10,
        'dock-hinge'));
    }
    // Strip curtains on the east bay only — one bay open beside one bay shut is the clean-beside-
    // dirty rule applied to an opening rather than to a stain.
    if (s > 0 && ctx.detail) {
      for (let i = 0; i < 9; i += 1) {
        B.trim.push(box(0.22, 2.60, 0.05, bx - bayW / 2 + 0.22 + i * 0.26, DOCK_FLOOR + 1.36,
          frontZ + 0.12, 'dock-strip'));
      }
    }
    emit(ctx, dockBumper({ x: bx - bayW / 2 - 0.22, y: DOCK_FLOOR - 0.42, z: frontZ + platformD + 0.02, facing: 1 }));
    emit(ctx, dockBumper({ x: bx + bayW / 2 + 0.22, y: DOCK_FLOOR - 0.42, z: frontZ + platformD + 0.02, facing: 1 }));
    // Bay number and a bulkhead lamp over each opening.
    B.steel.push(box(0.30, 0.20, 0.22, bx + bayW / 2 - 0.2, DOCK_FLOOR + 3.32, frontZ + 0.14, 'dock-lamp-arm'));
    B.trim.push(ball(0.16, bx + bayW / 2 - 0.2, DOCK_FLOOR + 3.24, frontZ + 0.26, 'dock-lamp', 8));
  }
  // The canopy: a cantilevered deck on raking brackets, over both bays.
  /* r1 hung a 160 mm pale slab off the wall and it read as a floating shelf: a canopy with no
     depth at its leading edge has no shadow line under it, so nothing tells the eye it is a roof
     rather than a plane. It gets a real fascia beam in the precast bucket, a soffit, and it is
     pushed UP to sit just under the chiller eaves where a canopy is actually fixed. */
  const canopyD = 3.05;
  const canopyY = CHILL_EAVE - 0.85;
  const canopyZ = frontZ + canopyD - 0.35;
  B.trim.push(rotBox(chillW + 1.25, 0.14, canopyD, chillCx, canopyY + 0.16, frontZ + canopyD / 2 - 0.3,
    { x: 0.05 }, 'dock-canopy'));
  B.wallAlt.push(slab(chillW + 1.25, 0.38, 0.26, chillCx, canopyY - 0.22, canopyZ, 'dock-canopy-fascia'));
  B.steel.push(slab(chillW + 1.15, 0.08, canopyD - 0.4, chillCx, canopyY - 0.02, frontZ + canopyD / 2 - 0.3,
    'dock-canopy-soffit'));
  for (let i = 0; i <= 3; i += 1) {
    const bx = chillX0 + 0.4 + ((chillW - 0.8) * i) / 3;
    B.steel.push(strut(bx, canopyY - 0.10, canopyZ - 0.2, bx, canopyY - 1.55, frontZ + 0.16,
      0.14, 'dock-bracket'));
  }
  // Two bulkhead-lit signs on the fascia, so the canopy carries something rather than nothing.
  for (const sd of [-1, 1]) {
    B.steel.push(slab(0.86, 0.24, 0.06, chillCx + sd * (chillW * 0.30), canopyY - 0.16,
      canopyZ + 0.14, 'dock-bay-number'));
  }
  // Hose points and a wash-down standpipe on the platform: what a meatworks dock actually carries.
  for (const hx of [chillX0 + 0.55, rightX - 0.45]) {
    B.steel.push(cyl(0.055, 1.25, hx, DOCK_FLOOR + 0.62, frontZ + 0.22, 'y', 'hose-riser', 6));
    B.trim.push(cyl(0.20, 0.09, hx, DOCK_FLOOR + 1.18, frontZ + 0.30, 'z', 'hose-reel', 10));
  }
  // The channel drain across the apron in front of the dock, and the fall to it.
  B.steel.push(slab(chillW + 1.4, 0.10, 0.42, chillCx, PAVE - 0.09, frontZ + platformD + 0.95,
    'dock-channel'));
  for (let i = 0; i < 9; i += 1) {
    B.trim.push(slab(0.30, 0.05, 0.40, chillCx - (chillW + 1.0) / 2 + i * ((chillW + 1.0) / 8),
      PAVE - 0.02, frontZ + platformD + 0.95, 'dock-grate-bar'));
  }

  /* — 2e. THE PLANT COMPOUND at the rear of the chiller end: dwarf wall, ammonia plant in a cage,
       a horizontal receiver on saddles, and the pipework that ties them to the roof gantry. — */
  const compCx = chillCx;
  const compMidZ = (backZ + compZ1) / 2;
  for (const [x0, z0, x1, z1] of [
    [chillX0, backZ, chillX0, compZ1],
    [chillX0, backZ, rightX, backZ],
    [rightX, backZ, rightX, compZ1],
  ]) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    B.wallAlt.push(box(x0 === x1 ? 0.28 : len, COMPOUND_WALL_H, x0 === x1 ? len : 0.28,
      (x0 + x1) / 2, COMPOUND_WALL_H / 2, (z0 + z1) / 2, 'compound-wall'));
  }
  // Ammonia plant: a caged machine, because ammonia plant is caged by regulation and the cage is
  // the thing that reads.
  const ammX = chillX0 + 1.25;
  const ammZ = compMidZ + 0.7;
  B.trim.push(slab(1.55, 1.42, 1.15, ammX, 0.10, ammZ, 'ammonia-skid'));
  B.steel.push(slab(1.75, 0.16, 1.35, ammX, 0, ammZ, 'ammonia-plinth'));
  if (ctx.mid) {
    for (const [cx, cz] of [[-0.95, 0], [0.95, 0], [0, -0.78], [0, 0.78]]) {
      B.steel.push(box(cx === 0 ? 1.90 : 0.07, 2.30, cz === 0 ? 0.07 : 1.60,
        ammX + cx, 1.15, ammZ + cz, 'ammonia-cage-frame'));
    }
    for (let i = 0; i < 5; i += 1) {
      B.steel.push(box(1.86, 0.05, 0.05, ammX, 0.30 + i * 0.48, ammZ - 0.78, 'ammonia-cage-bar'));
    }
    B.steel.push(slab(1.94, 0.07, 1.64, ammX, 2.32, ammZ, 'ammonia-cage-lid'));
  }
  // Horizontal receiver vessel on two saddles.
  const recZ = backZ + 1.35;
  B.trim.push(cyl(0.52, 2.85, rightX - 1.35, 1.32, recZ, 'x', 'receiver', 12));
  B.trim.push(ball(0.52, rightX - 1.35 - 1.42, 1.32, recZ, 'receiver-cap-a', 10));
  B.trim.push(ball(0.52, rightX - 1.35 + 1.42, 1.32, recZ, 'receiver-cap-b', 10));
  for (const s of [-1, 1]) {
    B.steel.push(slab(0.34, 0.82, 0.74, rightX - 1.35 + s * 0.95, 0, recZ, 'receiver-saddle'));
  }

  /* — 2f. THE REFRIGERATION GANTRY on the chiller roof: three condensers on a raised rail frame
       with the suction and liquid lines dropping down the flank to the plant compound. §6A names
       the gantry, and a gantry that carries nothing is a handrail. — */
  const gantryY = CHILL_EAVE + 0.55;
  for (const s of [-1, 1]) {
    B.steel.push(slab(0.16, 0.62, chillD * 0.74, chillCx + s * (chillW / 2 - 0.55), CHILL_EAVE - 0.05,
      chillMidZ + 0.4, 'gantry-bearer'));
  }
  B.wallAlt.push(slab(chillW - 0.9, 0.13, chillD * 0.74, chillCx, gantryY - 0.13, chillMidZ + 0.4,
    'gantry-deck'));
  for (let i = 0; i < 3; i += 1) {
    condenser(B, chillCx, gantryY + 0.43, chillMidZ + 0.4 - chillD * 0.26 + i * chillD * 0.26,
      { w: chillW - 1.35, d: 1.10, h: 0.80, name: `condenser-${i}` });
  }
  // Handrail round the gantry deck, which is what makes it a plant deck rather than a shelf.
  if (ctx.mid) {
    const gz0 = chillMidZ + 0.4 - chillD * 0.37;
    const gz1 = chillMidZ + 0.4 + chillD * 0.37;
    for (const s of [-1, 1]) {
      const gx = chillCx + s * (chillW / 2 - 0.48);
      for (const h of [0.52, 1.02]) {
        B.trim.push(strut(gx, gantryY + h, gz0, gx, gantryY + h, gz1, 0.05, 'gantry-rail'));
      }
      for (let i = 0; i <= 4; i += 1) {
        B.wallAlt.push(box(0.07, 1.06, 0.07, gx, gantryY + 0.53, gz0 + ((gz1 - gz0) * i) / 4,
          'gantry-stanchion'));
      }
    }
  }
  // The two refrigerant lines down the east flank into the compound. Lagged suction line fat,
  // liquid line thin, both carried on brackets rather than floating beside the elevation.
  emit(ctx, pipeRun({
    points: [
      { x: rightX - 0.55, y: gantryY + 0.2, z: chillMidZ + 0.4 - chillD * 0.3 },
      { x: rightX - 0.55, y: CHILL_EAVE - 0.4, z: chillMidZ + 0.4 - chillD * 0.3 },
      { x: rightX - 0.55, y: CHILL_EAVE - 0.4, z: backZ + 2.1 },
      { x: rightX - 0.55, y: 1.9, z: backZ + 2.1 },
    ],
    radius: 0.17, bracketTo: 'x', bracketPlane: rightX, name: 'suction-line',
  }), { steel: 'trim' });
  if (ctx.detail) {
    emit(ctx, pipeRun({
      points: [
        { x: rightX - 1.05, y: gantryY + 0.1, z: chillMidZ + 0.4 + chillD * 0.2 },
        { x: rightX - 1.05, y: CHILL_EAVE - 0.85, z: chillMidZ + 0.4 + chillD * 0.2 },
        { x: rightX - 1.05, y: CHILL_EAVE - 0.85, z: compMidZ + 0.7 },
        { x: ammX + 0.7, y: CHILL_EAVE - 0.85, z: compMidZ + 0.7 },
        { x: ammX + 0.7, y: 2.4, z: compMidZ + 0.7 },
      ],
      radius: 0.085, bracketTo: 'x', bracketPlane: rightX, name: 'liquid-line',
    }), { steel: 'trim' });
  }
  // BOTH LADDERS AND ALL THREE PIPE RUNS ARE REMAPPED OFF `steel`.
  // `ladderCaged` and `pipeRun` route their members to the dark bucket, which is right for a
  // painted-black process plant and wrong here: a caged ladder up an 11 m tower is a tall column
  // of dark pixels and the r1 census puts crush at the top of the fault list. A meatworks ladder
  // and a lagged ammonia line are both galvanised or clad, so `trim` is the honest bucket as well
  // as the light one, and the remap is one argument rather than a copy of the helper.
  if (ctx.detail) {
    emit(ctx, ladderCaged({
      x: rightX - 0.18, z: chillMidZ + chillD * 0.30, yBase: 0, yTop: gantryY + 0.6,
      facing: 1, name: 'chill-ladder',
    }), { steel: 'trim' });
  }

  /* ── 3. THE WATER TOWER. §6A: "a water tower on legs over the plant end. Board-legible height,
        and it is the abattoir's vertical, not a stack." It stands in the compound on four braced
        legs, so the compound reads as a plant yard with a structure over it rather than as a
        leftover strip, and at 15.6 m it clears the ridge, the monitor and the gantry. ── */
  const towCx = compCx;
  const towCz = compMidZ - 0.15;
  const legHalf = 1.72;
  const tankR = 1.95;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const lx0 = towCx + sx * (legHalf + 0.42);
      const lz0 = towCz + sz * (legHalf + 0.42);
      const lx1 = towCx + sx * legHalf * 0.62;
      const lz1 = towCz + sz * legHalf * 0.62;
      B.trim.push(strut(lx0, 0, lz0, lx1, TOWER_LEGS, lz1, 0.24, 'tower-leg'));
      B.wallAlt.push(slab(0.62, 0.34, 0.62, lx0, 0, lz0, 'tower-footing'));
    }
  }
  // Horizontal ties and cross braces at two levels — a leg tower with no bracing is four sticks.
  for (const lev of [0.34, 0.68]) {
    const y = TOWER_LEGS * lev;
    const f = 1 - (1 - 0.62) * lev;
    const hx = (legHalf + 0.42) * f;
    for (const s of [-1, 1]) {
      B.trim.push(strut(towCx - hx, y, towCz + s * hx, towCx + hx, y, towCz + s * hx, 0.10, 'tower-tie'));
      B.trim.push(strut(towCx + s * hx, y, towCz - hx, towCx + s * hx, y, towCz + hx, 0.10, 'tower-tie'));
    }
  }
  if (ctx.mid) {
    for (const s of [-1, 1]) {
      const yA = TOWER_LEGS * 0.34; const yB = TOWER_LEGS * 0.68;
      const fA = 1 - (1 - 0.62) * 0.34; const fB = 1 - (1 - 0.62) * 0.68;
      const hA = (legHalf + 0.42) * fA; const hB = (legHalf + 0.42) * fB;
      B.steel.push(strut(towCx - hA, yA, towCz + s * hA, towCx + hB, yB, towCz + s * hB, 0.075, 'tower-brace'));
      B.steel.push(strut(towCx + hA, yA, towCz + s * hA, towCx - hB, yB, towCz + s * hB, 0.075, 'tower-brace'));
    }
  }
  // The tank: a riveted-band cylinder with a conical roof and a vent. Pale, because it is the
  // top of the silhouette and the top of the silhouette is where a value crush shows worst.
  B.wallAlt.push(slab(legHalf * 2.3, 0.20, legHalf * 2.3, towCx, TOWER_LEGS - 0.20, towCz, 'tower-table'));
  B.trim.push(cyl(tankR, 3.55, towCx, TOWER_LEGS + 1.78, towCz, 'y', 'tower-tank', 14));
  for (const h of [0.62, 1.78, 2.94]) {
    B.steel.push(cyl(tankR + 0.055, 0.14, towCx, TOWER_LEGS + h, towCz, 'y', 'tower-band', 14));
  }
  // The tank roof is `cladding` and not `steel`. It is the topmost plane on the whole subject,
  // which is where a crushed value shows worst, and the abattoir's cladding list (#70584a) is a
  // warm oxide that reads as a painted tank top rather than as a hole in the sky.
  B.cladding.push(taper(tankR + 0.10, 0.34, 0.92, towCx, TOWER_LEGS + 3.55, towCz, 'tower-roof', 14));
  B.trim.push(cyl(0.19, 0.55, towCx, TOWER_LEGS + 4.72, towCz, 'y', 'tower-vent', 8));
  B.steel.push(taper(0.30, 0.13, 0.20, towCx, TOWER_LEGS + 4.98, towCz, 'tower-vent-cap', 8));
  // Down-pipe from the tank to the plant, and the access ladder up the north-west leg.
  emit(ctx, pipeRun({
    points: [
      { x: towCx - 0.55, y: TOWER_LEGS - 0.1, z: towCz },
      { x: towCx - 0.55, y: 2.6, z: towCz },
      { x: towCx - 0.55, y: 2.6, z: compZ1 - 0.4 },
    ],
    radius: 0.115, capEnd: true, name: 'tower-downpipe',
  }), { steel: 'trim' });
  emit(ctx, ladderCaged({
    x: towCx - (legHalf + 0.42) - 0.30, z: towCz - (legHalf + 0.42), yBase: 0,
    yTop: TOWER_LEGS + 0.4, facing: -1, cageFrom: 7.6, name: 'tower-ladder',
  }), { steel: 'trim' });

  /* ══ 4. THE STOCKYARDS. THE IDENTITY. ══
       §6A: "A pen field of steel-rail cattle yards with curved drafting race, forcing pen and a
       raised catwalk over it, filling the near half of the lot. That is the silhouette nothing
       else on the board has."

       THE PLAN IS A STOCK FLOW, NOT A PATTERN. Beasts come off a truck at the ramp on the east,
       cross the drafting alley into the two holding pens on the west, are worked into the round
       forcing pen in the middle, and leave it down the curved race into the killing floor's stock
       door. Every rail below is on one of those four legs of the journey, which is why the field
       reads as a yard rather than as a grid of fences — and it is why the race is the ONE element
       whose geometry is solved rather than authored: everything else is placed to clear it. ══ */
  const penY = PAVE + 0.06;
  const laneX0 = 2.45;                          // the truck lane, east of the pen field
  const laneX1 = halfW - VERGE_W - 0.45;
  const laneCx = (laneX0 + laneX1) / 2;
  const laneW = laneX1 - laneX0;
  const penX0 = -fenceX + 0.42;
  const penX1 = laneX0 - 0.25;
  const penZ0 = frontZ + 1.15;
  const penZ1 = halfD - STREET_VERGE - 0.16;
  const alleyZ = penZ1 - 2.35;

  // The pen floor: a separate pour, 60 mm proud, in the pale precast bucket. A yard the stock
  // stand in is a different slab from the one the trucks run on, and the value step is what stops
  // the rails reading against an unbroken field of one grey.
  B.wallAlt.push(slab(penX1 - penX0, 0.06, penZ1 - penZ0, (penX0 + penX1) / 2, PAVE,
    (penZ0 + penZ1) / 2, 'pen-floor'));
  // Fall to a channel drain down the middle of the field — a stockyard is hosed out daily.
  B.steel.push(slab(penX1 - penX0 - 0.4, 0.09, 0.24, (penX0 + penX1) / 2, penY - 0.09,
    penZ0 + 2.30, 'pen-drain'));
  for (let i = 0; i < 12; i += 1) {
    B.trim.push(slab(0.34, 0.04, 0.22,
      penX0 + 0.5 + ((penX1 - penX0 - 1.0) * i) / 11, penY - 0.02, penZ0 + 2.30, 'pen-drain-bar'));
  }

  /* — 4a. THE CURVED DRAFTING RACE, SOLVED RATHER THAN DRAWN.
       A cattle race curves because a beast walks toward what looks like a way back to the mob; a
       straight corridor is the tell that the modeller drew a shape instead of a machine. The arc
       is centred EAST of the plant door at the door's own z, so two things follow by construction
       rather than by eye: the tangent at θ = 180° is exactly −z, so the race enters the building
       square instead of meeting it at a skew; and the arc bulges into the yard, presenting its
       curvature to the three-quarter station rather than hiding it against the wall. Every pen
       rail below is then placed against the arc's measured envelope. — */
  /* THE RADIUS IS SOLVED AGAINST THE PEN FIELD, NOT CHOSEN. Moving the boundary in by 0.35 m
     (see the lot-line note at the head of the builder) took the field's west edge from −6.60 to
     −5.83, and at r1's 5.55 m radius the arc's own western envelope sat at −4.29 — which left the
     holding pens 1.08 m wide, narrower than a beast is long. A 4.40 m arc pulls the envelope back
     to −3.55 and returns 2.0 m to the pens without straightening the race, and it keeps the
     forcing pen it generates inboard of the truck lane. Both of those are checked below rather
     than asserted: `penMidA` clears the measured envelope by 0.30 m and the forcing pen's east
     edge clears `penX1`. */
  const raceEntryX = leftX + killW * 0.34;
  const raceR = 4.40;
  const raceCx = raceEntryX + raceR;
  const raceCz = frontZ;
  const raceHalf = 0.42;                        // clear width 0.84 m — one beast, no turning
  const raceA0 = 133;
  const raceA1 = 180;
  const raceSteps = 9;
  const raceAng = [];
  for (let i = 0; i <= raceSteps; i += 1) raceAng.push(raceA0 + ((raceA1 - raceA0) * i) / raceSteps);

  for (const rr of [raceR - raceHalf, raceR + raceHalf]) {
    for (let i = 0; i < raceSteps; i += 1) {
      const a = arcPt(raceCx, raceCz, rr, raceAng[i]);
      const bb = arcPt(raceCx, raceCz, rr, raceAng[i + 1]);
      for (const h of [0.36, 0.78, 1.20, 1.62]) {
        B.trim.push(strut(a.x, penY + h, a.z, bb.x, penY + h, bb.z, 0.072, 'race-rail'));
      }
    }
    for (let i = 0; i <= raceSteps; i += 1) {
      const a = arcPt(raceCx, raceCz, rr, raceAng[i]);
      B.steel.push(box(0.125, 1.86, 0.125, a.x, penY + 0.93, a.z, 'race-post'));
    }
  }
  // Solid sheeting on the outer wall of the race for its first third — a race is sheeted where
  // the beast can see out, and the change from sheet to rail is a real detail rather than a filter.
  // It is also the one WARM plane inside the pen field, which the r1 census asks for by number.
  for (let i = 0; i < 4; i += 1) {
    const a = arcPt(raceCx, raceCz, raceR + raceHalf + 0.03, raceAng[i]);
    const bb = arcPt(raceCx, raceCz, raceR + raceHalf + 0.03, raceAng[i + 1]);
    B.cladding.push(strut(a.x, penY + 0.86, a.z, bb.x, penY + 0.86, bb.z, 0.05, 'race-sheet', 1.28));
  }
  // The stock door: where the race dies into the killing floor's brick base.
  B.steel.push(box(1.28, 2.32, 0.40, raceEntryX, penY + 1.16, frontZ - 0.10, 'stock-door-reveal'));
  B.wallAlt.push(box(1.62, 0.30, 0.34, raceEntryX, penY + 2.47, frontZ + 0.08, 'stock-door-head'));
  for (let i = 0; i < 5; i += 1) {
    B.trim.push(box(0.22, 2.10, 0.04, raceEntryX - 0.5 + i * 0.25, penY + 1.10, frontZ + 0.14,
      'stock-door-curtain'));
  }

  /* — 4b. THE FORCING PEN, sited UPSTREAM of the race rather than downstream of it.
       Travel along the arc runs from θ = raceA0 toward θ = 180, so the tangent there is
       (−sin θ, cos θ) and the mob has to be sitting on the OTHER side of the entry — at
       `entry + (sin θ, −cos θ) · r`. The first draft subtracted that vector instead of adding it
       and put a 5.3 m round pen through the killing floor's front wall and a stair 0.8 m off the
       lot; both were invisible in the code and unmissable in a bounding box. Round, because a
       square corner is where a mob jams. — */
  const fpEntry = arcPt(raceCx, raceCz, raceR, raceA0);
  const fpDirX = Math.sin(raceA0 * DEG);
  const fpDirZ = -Math.cos(raceA0 * DEG);
  const fpR = 2.20;
  const fpCx = fpEntry.x + fpDirX * fpR;
  const fpCz = fpEntry.z + fpDirZ * fpR;
  const fpSteps = 13;
  for (let i = 0; i < fpSteps; i += 1) {
    const a0 = (360 * i) / fpSteps;
    const a1 = (360 * (i + 1)) / fpSteps;
    const a = arcPt(fpCx, fpCz, fpR, a0);
    const bb = arcPt(fpCx, fpCz, fpR, a1);
    B.steel.push(box(0.125, POST_TOP, 0.125, a.x, penY + POST_TOP / 2, a.z, 'forcing-post'));
    // The race entry is a gap, and so is the gate the mob is pushed in through.
    if (Math.hypot(a.x - fpEntry.x, a.z - fpEntry.z) < 1.45) continue;
    if (i === 5 || i === 6) continue;
    for (const h of RAILS) {
      B.trim.push(strut(a.x, penY + h, a.z, bb.x, penY + h, bb.z, 0.072, 'forcing-rail'));
    }
  }
  /* The crowd gate: a long leaf on the pen's own pivot, swung out into the pen. It is the one
     moving part in a set of yards, and a set of yards with nothing swinging in it reads as a
     model of a yard rather than as one being worked. */
  {
    const g = arcPt(fpCx, fpCz, fpR, (360 * 5) / fpSteps);
    // NEGATIVE, and it is a clash rather than a preference: stations 5 and 6 are left railless so
    // the catwalk stair can descend due west out of the pen, and a leaf swung +1.05 rad from
    // station 5 lands on 198° — straight through the stair it was making room for.
    const sweep = -0.95;
    const ex = fpCx + Math.cos(sweep) * (g.x - fpCx) - Math.sin(sweep) * (g.z - fpCz);
    const ez = fpCz + Math.sin(sweep) * (g.x - fpCx) + Math.cos(sweep) * (g.z - fpCz);
    B.wallAlt.push(box(0.12, POST_TOP + 0.24, 0.12, fpCx, penY + (POST_TOP + 0.24) / 2, fpCz,
      'crowd-pivot'));
    for (const h of [0.44, 0.92, 1.40, 1.76]) {
      B.trim.push(strut(fpCx, penY + h, fpCz, ex, penY + h, ez, 0.058, 'crowd-gate-rail'));
    }
    B.trim.push(strut(fpCx, penY + 0.20, fpCz, ex, penY + 1.76, ez, 0.05, 'crowd-gate-brace'));
    B.wallAlt.push(box(0.09, 1.90, 0.09, ex, penY + 0.95, ez, 'crowd-gate-stile'));
  }

  /* — 4c. THE RAISED CATWALK. §6A names it, and it is the piece that turns the pen field from a
       texture into a silhouette: a deck at 2.28 m following the whole curve of the race, carried
       on across the forcing pen to a landing over the crowd gate, with handrails both sides and a
       stair down into the working alley. Nothing else on this board carries a walkway over an
       outdoor corridor at head height, and it is the element that reads first from the elevated
       three-quarter station because it is the only thing in the yard ABOVE the rail line. — */
  const cwPts = [];
  for (let i = raceSteps; i >= 0; i -= 1) cwPts.push(arcPt(raceCx, raceCz, raceR, raceAng[i]));
  cwPts.push({ x: fpCx, z: fpCz });
  for (let i = 0; i < cwPts.length - 1; i += 1) {
    const a = cwPts[i]; const bb = cwPts[i + 1];
    B.steel.push(strut(a.x, penY + CATWALK_Y, a.z, bb.x, penY + CATWALK_Y, bb.z, 0.10,
      'catwalk-stringer', 0.16));
    B.trim.push(strut(a.x, penY + CATWALK_Y + 0.10, a.z, bb.x, penY + CATWALK_Y + 0.10, bb.z,
      0.92, 'catwalk-deck', 0.07));
    const dx = bb.x - a.x; const dz = bb.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const nx = (-dz / l) * 0.46; const nz = (dx / l) * 0.46;
    for (const sd of [-1, 1]) {
      for (const h of [0.55, 1.05]) {
        B.trim.push(strut(a.x + sd * nx, penY + CATWALK_Y + 0.14 + h, a.z + sd * nz,
          bb.x + sd * nx, penY + CATWALK_Y + 0.14 + h, bb.z + sd * nz, 0.048, 'catwalk-rail'));
      }
      B.steel.push(box(0.075, 1.10, 0.075, a.x + sd * nx, penY + CATWALK_Y + 0.69,
        a.z + sd * nz, 'catwalk-stanchion'));
    }
    // Legs OUTBOARD of the race rails, every third station. A leg dropped on the deck centre-line
    // would stand in the middle of the race, which is a corridor a beast has to walk down.
    if (i % 3 === 0) {
      for (const sd of [-1, 1]) {
        B.steel.push(box(0.15, CATWALK_Y, 0.15, a.x + sd * nx * 1.85, penY + CATWALK_Y / 2,
          a.z + sd * nz * 1.85, 'catwalk-leg'));
      }
    }
  }
  // The stair down off the landing, heading west into the working alley between the forcing pen
  // and the holding pens — the one strip of the yard with no rail across it.
  {
    const run = 2.60;
    const ex = fpCx - run;
    for (let i = 1; i <= 7; i += 1) {
      const f = i / 8;
      // 0.32 of GOING in x and 0.95 of WIDTH in z. The flight runs along −x, so a tread 0.90
      // wide in x and 0.30 deep in z is a stair laid across its own direction of travel.
      B.trim.push(slab(0.32, 0.06, 0.95, fpCx - run * f, penY + (CATWALK_Y + 0.12) * (1 - f),
        fpCz, 'catwalk-tread'));
    }
    B.steel.push(strut(fpCx, penY + CATWALK_Y + 0.10, fpCz, ex, penY + 0.05, fpCz, 0.16,
      'catwalk-stair-string', 0.22));
    for (const sd of [-1, 1]) {
      B.trim.push(strut(fpCx, penY + CATWALK_Y + 1.16, fpCz + sd * 0.46,
        ex, penY + 1.04, fpCz + sd * 0.46, 0.048, 'stair-rail'));
      B.wallAlt.push(box(0.07, 1.10, 0.07, ex, penY + 0.55, fpCz + sd * 0.46, 'stair-newel'));
    }
  }

  /* — 4d. THE HOLDING PENS. Two on the west at different sizes, a drafting alley across the north,
       and every run measured against the race envelope above rather than eyeballed clear of it.
       Pens share fences: drawing four sides on every pen puts two rails in one place, which a
       containment probe counts as a major and which reads on the plate as a thickened line. — */
  const penMidA = -3.85;                        // clears the race's measured envelope by 0.30 m
  const penMidB = -2.95;                        // north of the race, so this pen runs wider
  const penSplitZ = 7.10;
  railRun(B, penX0, penZ0, penX0, penZ1, { y: penY, name: 'pen-west' });
  railRun(B, penX1, penZ0, penX1, penZ1, { y: penY, name: 'pen-east' });
  railRun(B, penX0, penZ0, penMidA, penZ0, { y: penY, name: 'pen-south-w' });
  railRun(B, -2.30, penZ0, penX1, penZ0, { y: penY, gateAt: 0.70, gateW: 2.3, gateSwing: 0.75, name: 'pen-south-e' });
  railRun(B, penX0, penSplitZ, penMidB, penSplitZ, { y: penY, gateAt: 0.78, gateW: 2.2, gateSwing: -0.7, name: 'pen-cross' });
  railRun(B, penMidA, penZ0, penMidA, penSplitZ, { y: penY, name: 'pen-mid-a' });
  railRun(B, penMidB, penSplitZ, penMidB, alleyZ, { y: penY, gateAt: 0.60, gateW: 2.3, gateSwing: -0.9, name: 'pen-mid-b' });
  railRun(B, penX0, alleyZ, penX1, alleyZ, { y: penY, gateAt: 0.20, gateW: 2.5, gateSwing: 0.85, name: 'pen-alley' });

  /* — BEDDING, AND IT IS A MEASURED FIX RATHER THAN A DRESSING.
       The r1 census: ours 23.5 % mean saturation against a reference band of 26.9–42.2 %, on a
       plate that otherwise cleared every gate. The pen field is roughly a third of the subject's
       pixels and r1 spent all of it on #a9a59c concrete at 8 % saturation — so no amount of work
       on the building could have reached the number while the yard stayed swept.

       A cattle yard is not swept. It carries trodden straw and muck, and `goods` (#a98b60, 43 %
       saturation, r−b +73) is exactly that colour. r1 laid three small trays inside the pens and
       they read as nothing; r2 lays the whole field, holds a concrete margin at every rail so the
       pour still shows where a hose reaches, and drops four darker `wall` patches where a mob
       stands. Two tones rather than one, which is the wear doctrine applied to the ground plane:
       clean surface immediately beside dirty, never a uniform filter. — */
  const bed = (x0, z0, x1, z1, bucket, h, nm) => B[bucket].push(
    slab(x1 - x0, 0.03, z1 - z0, (x0 + x1) / 2, penY + h, (z0 + z1) / 2, nm),
  );
  bed(penX0 + 0.26, penZ0 + 0.26, penMidA - 0.26, penSplitZ - 0.26, 'goods', 0.006, 'bedding-a');
  bed(penX0 + 0.26, penSplitZ + 0.26, penMidB - 0.26, alleyZ - 0.26, 'goods', 0.006, 'bedding-b');
  bed(penX0 + 0.26, alleyZ + 0.26, penX1 - 0.26, penZ1 - 0.26, 'goods', 0.006, 'bedding-c');
  bed(penMidB + 0.26, penSplitZ + 0.26, penX1 - 0.26, alleyZ - 0.26, 'goods', 0.006, 'bedding-d');
  B.goods.push(slab(fpR * 1.60, 0.03, fpR * 1.60, fpCx, penY + 0.010, fpCz, 'bedding-forcing'));
  // Trodden muck, where a mob actually stands: at the gates, at the trough and in the forcing pen.
  bed(penX0 + 0.45, penSplitZ - 1.55, penMidA - 0.45, penSplitZ - 0.30, 'wall', 0.012, 'muck-a');
  bed(penX0 + 0.60, alleyZ + 0.40, penX0 + 3.10, alleyZ + 1.85, 'wall', 0.012, 'muck-b');
  B.wall.push(cyl(fpR * 0.58, 0.03, fpCx, penY + 0.016, fpCz, 'y', 'muck-forcing', 12));

  /* — Water troughs. A concrete trough in every pen, because stock held overnight are watered,
       and because it is the one place a pen can carry a dark reflective note without a shadow. — */
  const trough = (tx, tz, nm) => {
    B.wallAlt.push(slab(1.70, 0.62, 0.72, tx, penY, tz, `${nm}-body`));
    B.glass.push(slab(1.44, 0.05, 0.48, tx, penY + 0.50, tz, `${nm}-water`));
    B.wallAlt.push(slab(1.84, 0.10, 0.86, tx, penY + 0.58, tz, `${nm}-coping`));
  };
  trough(penX0 + 1.05, penSplitZ - 0.62, 'trough-a');
  trough(penX0 + 1.15, alleyZ + 0.78, 'trough-b');

  /* — 4e. THE UNLOADING RAMP, off the truck lane into the drafting alley. A stock ramp falls FROM
       the trailer bed, so its head is at the lane and its foot is in the pen — which is also what
       explains the lane, the weighbridge and the gate as one route rather than three props. — */
  const rampZ = alleyZ + 1.15;
  const rampX1 = penX1 + 0.05;
  const rampX0 = rampX1 - 3.90;
  B.wallAlt.push(rotBox(Math.hypot(3.90, DOCK_FLOOR + 0.12), 0.22, 2.26,
    (rampX0 + rampX1) / 2, penY + (DOCK_FLOOR + 0.12) / 2, rampZ,
    { z: Math.atan2(DOCK_FLOOR + 0.12, 3.90) }, 'ramp-deck'));
  B.wall.push(slab(1.35, DOCK_FLOOR + 0.12, 2.46, rampX1 + 0.62, penY, rampZ, 'ramp-head'));
  for (const sd of [-1, 1]) {
    const rz = rampZ + sd * 1.16;
    for (let i = 0; i <= 4; i += 1) {
      const f = i / 4;
      const rx = rampX0 + 3.90 * f;
      const ry = penY + 0.15 + (DOCK_FLOOR + 0.12) * f;
      B.steel.push(box(0.12, 1.55, 0.12, rx, ry + 0.78, rz, 'ramp-post'));
      if (i < 4) {
        const rx2 = rampX0 + 3.90 * ((i + 1) / 4);
        const ry2 = penY + 0.15 + (DOCK_FLOOR + 0.12) * ((i + 1) / 4);
        for (const h of [0.42, 0.86, 1.30, 1.56]) {
          B.trim.push(strut(rx, ry + h, rz, rx2, ry2 + h, rz, 0.055, 'ramp-rail'));
        }
      }
    }
  }

  /* — 4f. THE STOCK, AND ON THE r1 PLATE IT DID NOT READ AS ANIMALS.
       Eight beasts in `goods` and `wall` on a `goods` bedding tray came out as a reddish heap that
       a stranger would call spoil. The fix is value, not shape: real yarded cattle are a MIXED
       mob — black, red and tan in the same pen — so a third of the herd goes into `steel`, which
       puts a genuinely dark silhouette on a pale-to-tan ground, and the whole mob is scaled up
       10 %. A black beast on straw is legible at any altitude; a tan beast on straw is not.

       Ten head, worked through the yard in the order the plan describes: four in the two holding
       pens, three in the drafting alley, two crowded into the forcing pen and one already in the
       race. The lane brief asks twice whether anything on the lot is alive; this is the answer,
       and at 120 triangles a head it is the cheapest answer available anywhere on the subject. — */
  if (ctx.mid) {
    const herd = [
      [penX0 + 0.98, penZ0 + 1.15, 0.14, 'steel', true],
      [penX0 + 1.02, penZ0 + 2.65, -0.22, 'goods', false],
      [penX0 + 0.95, penSplitZ + 1.05, 0.26, 'trim', false],
      [penX0 + 1.95, penSplitZ + 2.25, -0.34, 'steel', false],
      [penX0 + 0.85, penSplitZ + 3.05, 0.10, 'goods', true],
      [penX0 + 0.85, alleyZ + 0.95, 1.48, 'steel', false],
      [penX0 + 2.20, alleyZ + 1.70, 1.72, 'goods', false],
      [penX0 + 3.55, alleyZ + 0.80, 1.30, 'trim', false],
      [fpCx - 0.95, fpCz + 0.52, 3.28, 'goods', false],
      [fpCx + 0.72, fpCz - 0.62, 3.86, 'steel', false],
    ];
    herd.forEach(([bx, bz, rot, bucket, blaze], i) => {
      beast(B, bx, bz, {
        y: penY, rot: rot + v.range(3030 + i, -0.20, 0.20), bucket, blaze,
        scale: v.range(3040 + i, 1.03, 1.16), name: `beast-${i}`,
      });
    });
    // One beast in the race itself, nose to the plant, which is what a race is for.
    const rt = raceA0 + (raceA1 - raceA0) * 0.45;
    const rp = arcPt(raceCx, raceCz, raceR, rt);
    beast(B, rp.x, rp.z, {
      y: penY, rot: -rt * DEG, bucket: 'steel', scale: 1.02, name: 'beast-race',
    });
  }

  /* ── 5. THE TRUCK LANE, WEIGHBRIDGE AND CURTILAGE ── */
  emit(root, apron(root, {
    x: laneCx, z: frontZ + 3.5, width: laneW + 1.0, depth: 6.2, bays: 2, y: Y,
    stopLineZ: frontZ + 2.9, salt: 104,
  }));

  // The weighbridge: a steel deck in a precast frame, flush with the lane, with its indicator
  // post and the sample/office hut beside it. §6A names both.
  const wbZ0 = frontZ + 7.4;
  const wbZ1 = Math.min(penZ1 - 0.6, wbZ0 + 8.2);
  const wbCz = (wbZ0 + wbZ1) / 2;
  B.wallAlt.push(slab(laneW - 0.1, 0.14, wbZ1 - wbZ0 + 0.5, laneCx, PAVE, wbCz, 'weighbridge-frame'));
  B.wallAlt.push(slab(laneW - 0.95, 0.14, wbZ1 - wbZ0, laneCx, PAVE + 0.03, wbCz, 'weighbridge-deck'));
  for (let i = 0; i < 5; i += 1) {
    B.trim.push(slab(laneW - 1.05, 0.035, 0.10, laneCx, PAVE + 0.17,
      wbZ0 + ((wbZ1 - wbZ0) * i) / 4, 'weighbridge-plate-joint'));
  }
  for (const s of [-1, 1]) {
    B.trim.push(slab(0.16, 0.05, wbZ1 - wbZ0, laneCx + s * (laneW - 0.95) / 2, PAVE + 0.17, wbCz,
      'weighbridge-edge'));
  }
  // The hut: a small rendered box with a mono roof, a window on the bridge and a door.
  const hutX = laneX1 - 0.62;
  B.wall.push(slab(1.55, 2.35, 2.05, hutX, PAVE, wbCz + 1.1, 'wb-hut'));
  B.wallAlt.push(...moulding(1.75, 0.14, hutX, PAVE + 2.35, wbCz + 1.1, 'x', COPING_PROFILE,
    'wb-hut-eaves'));
  B.glass.push(box(0.10, 0.92, 1.30, hutX - 0.80, PAVE + 1.62, wbCz + 1.1, 'wb-hut-window'));
  B.trim.push(box(0.13, 1.04, 0.12, hutX - 0.82, PAVE + 1.62, wbCz + 1.1, 'wb-hut-mullion'));
  B.trim.push(box(0.13, 0.14, 1.42, hutX - 0.82, PAVE + 1.10, wbCz + 1.1, 'wb-hut-cill'));
  B.steel.push(box(0.10, 2.02, 0.86, hutX - 0.80, PAVE + 1.01, wbCz - 0.5, 'wb-hut-door'));
  B.cladding.push(rotBox(1.95, 0.13, 2.40, hutX, PAVE + 2.60, wbCz + 1.1, { z: 0.10 }, 'wb-hut-roof'));
  B.wallAlt.push(cyl(0.075, 2.35, hutX - 1.25, PAVE + 1.18, wbCz - 1.6, 'y', 'wb-indicator-post', 6));
  B.trim.push(box(0.52, 0.42, 0.22, hutX - 1.25, PAVE + 2.42, wbCz - 1.6, 'wb-indicator'));

  // Truck wash apron at the head of the lane: a bunded slab, a hose gantry and a sump.
  const washCz = frontZ + 4.1;
  B.wallAlt.push(slab(laneW - 0.5, 0.10, 3.4, laneCx, PAVE, washCz, 'wash-bay'));
  for (const s of [-1, 1]) {
    B.wallAlt.push(slab(0.22, 0.24, 3.4, laneCx + s * (laneW - 0.5) / 2, PAVE + 0.10, washCz, 'wash-bund'));
    B.wallAlt.push(cyl(0.09, 3.35, laneCx + s * (laneW - 1.1) / 2, PAVE + 1.68, washCz - 1.4, 'y',
      'wash-post', 6));
  }
  B.wallAlt.push(strut(laneCx - (laneW - 1.1) / 2, PAVE + 3.34, washCz - 1.4,
    laneCx + (laneW - 1.1) / 2, PAVE + 3.34, washCz - 1.4, 0.10, 'wash-gantry'));
  if (ctx.detail) {
    for (let i = 0; i < 4; i += 1) {
      const nx = laneCx - (laneW - 1.9) / 2 + ((laneW - 1.9) * i) / 3;
      B.trim.push(cyl(0.035, 0.42, nx, PAVE + 3.10, washCz - 1.4, 'y', 'wash-nozzle', 6));
    }
  }
  emit(root, serviceGrate(root, {
    x: laneCx, z: washCz + 1.35, y: Y, width: 1.05, depth: 0.70, salt: 132,
  }));

  /* — Paint. The cheapest legible thing on a hardstand: a pale value on the yard, 14 mm proud.
       A working lane is marked, and marks are what tell a reader where the truck goes. — */
  const paintY = PAVE + 0.07;
  const paint = [];
  const pslab = (w, d, x, z, n) => paint.push(slab(w, 0.014, d, x, paintY, z, n));
  pslab(0.14, penZ1 - frontZ - 1.0, laneX0 + 0.12, (frontZ + penZ1) / 2, 'lane-edge-w');
  pslab(0.14, penZ1 - frontZ - 1.0, laneX1 - 0.12, (frontZ + penZ1) / 2, 'lane-edge-e');
  pslab(laneW - 0.2, 0.22, laneCx, frontZ + 2.95, 'lane-stop-line');
  for (let i = 0; i < 6; i += 1) {
    paint.push(rotBox(0.15, 0.014, 2.05, laneX0 + 0.5 + i * ((laneW - 1.0) / 5), paintY + 0.006,
      frontZ + 1.55, { y: 0.62 }, 'lane-hatch'));
  }
  // A marked walkway from the dock steps round the pen field to the gate, so the yard has a route
  // through it as well as a surface.
  for (const off of [-0.60, 0.60]) {
    pslab(laneX0 - penX0 - 0.2, 0.10, (penX0 + laneX0) / 2, penZ0 - 0.75 + off, 'walkway');
  }
  ctx.push(paint, p.trim);

  /* — The perimeter: a pale paved ring outside the fence with a kerb at its outer edge, so the
       lot edge is a value step and two of these side by side share one continuous line. — */
  const ringOut = 0.03;
  const FOOTPATH = 0.70;
  const pave = (w, d, x, z, n) => B.wallAlt.push(slab(w, 0.05, d, x, PAVE - 0.005, z, n));
  pave(halfW * 2 - ringOut, FOOTPATH, 0, halfD - FOOTPATH / 2, 'footpath');
  pave(halfW * 2 - ringOut, VERGE_W, 0, -halfD + VERGE_W / 2, 'verge-rear');
  for (const sd of [-1, 1]) {
    pave(VERGE_W, halfD * 2 - (VERGE_W + FOOTPATH + 0.30), sd * (halfW - VERGE_W / 2),
      -(FOOTPATH - VERGE_W) / 2 - 0.15, 'verge-flank');
  }
  // The nature strip: turf between the footpath and the boundary wall, with the street tree
  // standing IN it rather than in a hole in the paving.
  const lawnZ0 = halfD - STREET_VERGE + 0.12;
  const lawnZ1 = halfD - FOOTPATH;
  const treeX = -fenceX + 1.55;
  const lawnCz = (lawnZ0 + lawnZ1) / 2;
  lawnPanel(root, {
    x: 0, z: lawnCz, width: halfW * 2 - VERGE_W * 2 - 0.4, depth: lawnZ1 - lawnZ0, y: Y,
    density: 0.44, salt: 300, avoid: [{ x: treeX, z: lawnCz, r: 0.70 }],
  });
  emit(root, kerb(root, {
    x1: -halfW, z1: halfD - 0.06, x2: halfW, z2: halfD - 0.06, y: Y, salt: 128,
  }));

  /* — THE BOUNDARY, AND IT IS THE ROUND'S LARGEST SINGLE SAVING IN BOTH BUDGETS.
       r1 ran `palisadeFence` round the whole lot: 85 m of it, 942 parts, **11 304 triangles —
       34 % of the entire model — every one of them in the darkest bucket.** It was simultaneously
       the reason the subject was 7 000 triangles over budget and the largest contributor to the
       crush figure the MP9 census puts at the top of the fault list, and a boundary is not a thing
       worth a third of a building.

       What replaces it is also more honest about the subject. A meatworks boundary is not a
       security palisade all the way round; it is a brick dwarf wall with stock rail over it, in
       the same rail language as the yards inside, and palisade only where the gate needs a hard
       return. The dwarf wall is `wall` brick, which puts a warm saturated band round the whole
       plate at exactly the height the camera crosses it, and the rail above is `trim`. — */
  const fenceZ = halfD - STREET_VERGE - 0.10;
  const rearZ = -halfD + VERGE_W + 0.05;
  const DWARF_H = 0.72;

  /** Brick dwarf wall with two stock rails over it — the boundary, everywhere but the gates. */
  const boundaryRun = (x1, z1, x2, z2, nm) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.4) return;
    B.wall.push(box(x1 === x2 ? 0.34 : len, DWARF_H, x1 === x2 ? len : 0.34,
      (x1 + x2) / 2, PAVE + DWARF_H / 2, (z1 + z2) / 2, `${nm}-dwarf`));
    B.wallAlt.push(...moulding(x1 === x2 ? 0.44 : len + 0.10, 0.10, (x1 + x2) / 2,
      PAVE + DWARF_H, (z1 + z2) / 2, x1 === x2 ? 'z' : 'x', COPING_PROFILE, `${nm}-coping`));
    railRun(B, x1, z1, x2, z2, {
      y: PAVE + DWARF_H + 0.10, rails: [0.42, 0.88, 1.28], postPitch: 3.1, postW: 0.10,
      name: nm,
    });
  };

  const stockGateX0 = penX0 + 1.20;
  const stockGateX1 = stockGateX0 + 4.60;
  boundaryRun(-fenceX, fenceZ, stockGateX0, fenceZ, 'bnd-street-w');
  boundaryRun(stockGateX1, fenceZ, laneX0 - 0.30, fenceZ, 'bnd-street-c');
  boundaryRun(-fenceX, fenceZ, -fenceX, rearZ, 'bnd-flank-w');
  boundaryRun(fenceX, fenceZ, fenceX, rearZ, 'bnd-flank-e');
  boundaryRun(-fenceX, rearZ, fenceX, rearZ, 'bnd-rear');

  // Palisade survives ONLY as the two hard returns beside the truck gate, which is the one place
  // on a working site that is genuinely secured. Four metres of it rather than eighty-five.
  emit(root, palisadeFence(root, {
    x1: laneX0 - 0.30, z1: fenceZ, x2: laneX0 + 1.55, z2: fenceZ, y: Y, salt: 108,
  }));
  emit(root, palisadeFence(root, {
    x1: laneX1 + 0.35, z1: fenceZ, x2: fenceX, z2: fenceZ, y: Y, salt: 109,
  }));
  emit(root, industrialGate(root, {
    x: (laneX0 + laneX1) / 2 + 0.55, z: fenceZ, y: Y, width: laneW - 0.5, height: 2.35,
    openFraction: 0.62, salt: 116,
  }));

  /* — THE WIDE STOCK GATE, §6A's own item, and it is built in the YARD'S language rather than the
       industrial kit's. A stock gate is a set of rails on two hanging posts, not a palisade leaf:
       a beast will not walk at a solid gate. One leaf shut across the opening and one swung back
       into the yard, because the picture wanted is a mob being unloaded, not a locked site. — */
  {
    const gy = PAVE;
    for (const gx of [stockGateX0, stockGateX1]) {
      B.steel.push(box(0.20, 2.42, 0.20, gx, gy + 1.21, fenceZ, 'stock-gate-post'));
    }
    railRun(B, stockGateX0, fenceZ, (stockGateX0 + stockGateX1) / 2, fenceZ,
      { y: gy, rails: [0.34, 0.72, 1.10, 1.46, 1.76], postPitch: 9, name: 'stock-gate-l' });
    const hx = stockGateX1; const half = (stockGateX1 - stockGateX0) / 2;
    for (const h of [0.34, 0.72, 1.10, 1.46, 1.76]) {
      B.trim.push(strut(hx, gy + h, fenceZ, hx - half * 0.50, gy + h, fenceZ - half * 0.86,
        0.062, 'stock-gate-r'));
    }
    B.trim.push(strut(hx, gy + 0.20, fenceZ, hx - half * 0.50, gy + 1.76, fenceZ - half * 0.86,
      0.055, 'stock-gate-r-brace'));
    B.wallAlt.push(box(0.10, 1.90, 0.10, hx - half * 0.50, gy + 0.95, fenceZ - half * 0.86,
      'stock-gate-r-stile'));
  }

  /* — 6. STORED GOODS, FITTINGS AND WEAR STATIONS. §2b's "stored goods that name the use", kept
       to the dock end where they belong on a wet-process site — a killing floor's yard is hosed,
       not stacked. — */
  emit(root, wheelStop(root, { x: laneCx - 1.2, z: frontZ + 3.05, y: Y, width: 1.75, salt: 124 }));
  emit(root, bollard(root, { x: chillX0 - 0.55, z: frontZ + platformD + 0.35, y: Y, salt: 120 }));
  emit(root, bollard(root, { x: rightX + 0.35, z: frontZ + platformD + 0.35, y: Y, salt: 121 }));
  emit(root, bollard(root, { x: laneX0 + 0.32, z: frontZ + 6.4, y: Y, salt: 122 }));
  emit(root, palletStack(root, {
    x: rightX - 0.9, z: frontZ + platformD + 1.9, y: Y, count: 6, rotationY: 0.22, salt: 136,
  }));
  emit(root, drumCluster(root, { x: chillX0 - 1.5, z: compZ1 + 1.1, y: Y, count: 4, salt: 144 }));
  emit(root, skipBin(root, { x: laneCx + 0.2, z: frontZ + 6.15, y: Y, rotationY: 0.06, salt: 148 }));
  emit(root, gasBottleCage(root, { x: rightX - 2.2, z: compZ1 + 0.85, y: Y, rotationY: 1.55, salt: 152 }));

  /* A BALE STACK WAS DRAWN HERE AND TAKEN OUT AGAIN, WHICH IS WORTH A LINE.
     It was a saturation lever — `goods` at 43 % against a plate measured at 23.5 % — and every
     position offered to it was already occupied: on the weighbridge deck, through the ramp head,
     or inside a pen a beast is standing in. The bedding trays laid over the whole pen field do
     the same job over a far larger area and stand somewhere real, so the bales are gone rather
     than wedged in. A prop that has to overlap something to exist is not a prop. */

  // Steps off the dock platform, so the platform can be reached from the yard.
  for (let i = 0; i < 4; i += 1) {
    B.wallAlt.push(slab(1.10, DOCK_FLOOR / 4, 0.30, chillX0 - 0.72, PAVE + (DOCK_FLOOR / 4) * i,
      frontZ + 0.4 + i * 0.30, 'dock-step'));
  }
  for (const h of [0.55, 1.02]) {
    B.trim.push(strut(chillX0 - 1.30, PAVE + DOCK_FLOOR + h, frontZ + 0.35,
      chillX0 - 1.30, PAVE + DOCK_FLOOR + h, frontZ + platformD, 0.05, 'dock-hand-rail'));
  }
  B.steel.push(box(0.07, DOCK_FLOOR + 1.06, 0.07, chillX0 - 1.30, PAVE + (DOCK_FLOOR + 1.06) / 2,
    frontZ + platformD - 0.1, 'dock-rail-post'));

  /* — MAST LIGHTING. The lane brief's fourth property lists lamps among the things that make a
       building stand on a designed plinth rather than on a slab, and a set of yards is worked
       before dawn. Two masts, one over the pen field and one over the dock approach: slim pale
       verticals against the sky in the near half of the lot, where nothing else is tall. — */
  for (const [mx, mz, mh, mi] of [
    [laneX0 + 0.30, penSplitZ - 0.5, 6.80, 0], [laneX1 - 0.30, frontZ + 5.4, 6.20, 1],
  ]) {
    B.wallAlt.push(slab(0.52, 0.34, 0.52, mx, PAVE, mz, `mast-${mi}-base`));
    B.wallAlt.push(taper(0.14, 0.085, mh, mx, PAVE + 0.34, mz, `mast-${mi}`, 8));
    B.steel.push(strut(mx, PAVE + 0.34 + mh, mz, mx - 0.85, PAVE + 0.34 + mh + 0.20, mz, 0.075,
      `mast-${mi}-arm`));
    B.trim.push(rotBox(0.78, 0.16, 0.46, mx - 1.05, PAVE + 0.34 + mh + 0.14, mz,
      { z: 0.26 }, `mast-${mi}-head`));
    B.steel.push(rotBox(0.66, 0.05, 0.36, mx - 1.05, PAVE + 0.34 + mh + 0.04, mz,
      { z: 0.26 }, `mast-${mi}-lens`));
  }

  /* — 7. PLANTING, which on a working meatworks is incidental and never a garden: a street tree
       at the kerb, weeds where the hose does not reach, and one tussock at the fence foot. — */
  emit(root, weedLine(root, {
    x1: -fenceX + 0.3, z1: rearZ - 0.25, x2: fenceX - 0.3, z2: rearZ - 0.25, y: Y,
    density: 0.30, salt: 164,
  }));
  emit(root, weedLine(root, {
    x1: -fenceX + 0.18, z1: rearZ + 0.5, x2: -fenceX + 0.18, z2: fenceZ - 1.0, y: Y,
    density: 0.24, salt: 165,
  }));
  // `specimenTree` returns `wood` and `leaf`, which are the residential kit's bucket names and
  // are not in the nine this palette resolves. Un-remapped, `emit` warns and drops 150 parts —
  // r1 lost its whole street tree that way, silently, on every façade.
  emit(root, specimenTree(root, {
    x: treeX, z: lawnCz, y: Y, height: v.range(3080, 5.0, 5.7), spread: 2.8,
    reach: 2.5, salt: 190,
  }), { wood: 'goods', leaf: 'foliage' });
  emit(root, grassTuft(root, { x: fenceX + 0.35, z: 6.4, y: Y, r: 0.26, salt: 3082 }));
  emit(root, grassTuft(root, { x: -fenceX - 0.32, z: 4.2, y: Y, r: 0.22, salt: 3083 }));

  /* — 8. WEAR, WHICH LIVES IN MATERIAL RESPONSE AND NEVER IN GEOMETRY CARDS.
       §6A's wear line is specific and it is the whole reason the abattoir is not the factory:
       rust from the gantry fixings, salt bloom to a splash line, chalked paint on the sun
       elevation, and CLEAN WHITE-GLAZED SURFACE IMMEDIATELY BESIDE IT. Uniform dirt is a filter
       and it scores zero, so the render bucket carries a hard splash line low on the wall and
       almost nothing above it, while the steel that holds the condensers bleeds from its fixings. — */
  requestWear(p.trim, {
    // The white surface. Salt bloom to a splash line at hose height and no further; a little
    // chalk where the sun gets it; almost no grime, because this wall is washed.
    saltBloom: 0.95, plinthY: 1.55, grimeBand: 0.16, chalk: 0.52, rustBleed: 0.14,
    shadowFloor: 0.030,
  });
  requestWear(p.wallAlt, {
    saltBloom: 0.85, plinthY: 1.15, grimeBand: 0.42, chalk: 0.22, rustBleed: 0.10,
  });
  requestWear(p.steel, {
    // The gantry, the tower legs and the yard posts are where the oxide starts.
    rustBleed: 0.92, grimeBand: 0.55, chalk: 0.12, saltBloom: 0.30, headY: CHILL_EAVE + 0.9,
  });
  requestWear(p.cladding, {
    chalk: 0.62, grimeBand: 0.62, rustBleed: 0.44, saltBloom: 0.35, headY: CHILL_EAVE,
  });
  requestWear(p.goods, { grimeBand: 0.70, grimeGain: 1.5, chalk: 0.30, saltBloom: 0.0 });

  /* — 9. EMIT. One call, one table, and a typo'd bucket warns rather than dropping geometry. — */
  emit(ctx, B);
}

/* ─────────────────────────────────────── the export ───────────────────────────────────── */

/** archetypeId → builder(ctx). `index.js` spreads this into `INDUSTRIAL_BUILDERS`. */
export const ABATTOIR_BUILDERS = Object.freeze({
  'cattle-abattoir': buildAbattoir,
});

export { buildAbattoir };
export default buildAbattoir;
