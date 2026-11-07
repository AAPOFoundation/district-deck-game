// P14 M4 — runtime dressing overlay for fringe:ship:warship-a.
// Lane A6 owns ships.js; this file never writes that module. Presentation only.

import * as THREE from 'three';
import { addBox, addCyl, addSphere, addToyLetters, noPick, WATER_Y } from '../fringe/kit.js';
import { createCityFringeMaterial } from '../materials.js';
function std(color, extra) { return createCityFringeMaterial(color, extra, 'military/warship-dress.js'); }
import { chamferBox, deckhouse, loftBand, loftCap, loftMesh } from '../fringe/ships.js';
import {
  addBowWave, addPlanCollar, addPlanShade, addSternWake, levelWaterGroup,
} from './units.js';

export const WARSHIP_FLASH_EMISSIVE = 8;
export const WARSHIP_HULL_NUMBER = 'HMAS 07';

/* ================================================================== *
 * P14 M11 ITEM 1 — THE WEATHERING PASS.
 *
 * MC6 pack-k, 2/10: "faceted UNWEATHERED hull"; pack-g, 3/10: "UNBEVELLED
 * primitive hull". Both halves are geometry-and-material facts, and both are
 * measurable before they are drawn:
 *
 *   BEVEL      the sheer and the deck edge met at a right angle. A 0.06 m
 *              chamfer is one pixel at the seafight pose (23 px/m) and three
 *              at the shipyard's (34 px/m) — the difference between an edge
 *              that catches the key and an edge that does not exist. The two
 *              constants below are the brief's floor, not a taste.
 *   FINISH     `WARSHIP_FINISHES.painted` returned one roughness for the whole
 *              shell, so the topside was one value under one key whatever the
 *              geometry did. `hullWearMap` is a roughness map: streaked
 *              vertically, so the wear runs DOWN the plating the way water
 *              does, with a rougher band low near the waterline.
 *   RUST       runs from the scuppers and the hawse, which is where a real
 *              hull streaks, and nowhere else.
 *   SALT       a pale bloom in the metre above the boot-top.
 *   BOOT-TOP   a dark band that STRADDLES the waterline (it did not: the boot
 *              sat 0.19 m under it and only the pale wetline showed).
 *   DRAUGHT    numerals at the stem and the transom.
 * ================================================================== */
export const HULL_BEVEL = Object.freeze({
  /** Horizontal inset of the sheer chamfer, metres. Brief floor 0.06. */
  sheer: 0.095,
  /** Horizontal inset of the weather-deck edge chamfer, metres. */
  deckEdge: 0.082,
  /** Vertical run of each chamfer band. */
  sheerRise: 0.14,
  deckRise: 0.11,
});
export const HULL_WEATHER = Object.freeze({
  /** Roughness-map texel grid. Square, tiled up the shell. */
  wearSize: 128,
  /** Roughness the painted topside runs at where the map is mid grey. */
  paintedRough: 0.78,
  /** Boot-top band: bottom and top relative to the waterline datum, metres. */
  bootLo: -0.16,
  bootHi: 0.14,
  /** Salt bloom band above the boot-top. */
  saltLo: 0.16,
  saltHi: 0.62,
  /** Rust streak stations along the hull, as a fraction of the plan span. */
  scuppers: Object.freeze([0.18, 0.31, 0.46, 0.58, 0.72, 0.84]),
  hawse: 0.94,
});

let _wearMap = null;
/**
 * A vertical-streak roughness field. Deterministic: a hashed lattice, and
 * this lane holds no RNG at all, so two loads produce the same shell.
 *
 * Roughness reads the GREEN channel; the field is written to all three so the
 * same texture can be read as a subtle albedo dirt map if a caller wants one.
 * Mid grey is 1.0 x the material roughness, so the field is centred there and
 * the swing is +-22 %: paint wears, it does not turn to chalk in patches.
 */
export function hullWearMap(size = HULL_WEATHER.wearSize) {
  if (_wearMap && _wearMap.image?.width === size) return _wearMap;
  const n = size * size;
  const data = new Uint8Array(n * 4);
  const hash = (x, y) => {
    let h = Math.imul(x * 374761393 + y * 668265263, 1274126177) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 1274126177) >>> 0;
    return (h >>> 8) / 16777216;
  };
  const lattice = (u, v, freq) => {
    const x = u * freq;
    const y = v * freq;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const w = (i, j) => hash(((x0 + i) % freq + freq) % freq, ((y0 + j) % freq + freq) % freq);
    const a = w(0, 0) + (w(1, 0) - w(0, 0)) * sx;
    const b = w(0, 1) + (w(1, 1) - w(0, 1)) * sx;
    return a + (b - a) * sy;
  };
  for (let y = 0; y < size; y += 1) {
    // v = 0 at the keel, 1 at the sheer.
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      // Streaks: high frequency ACROSS the shell, low frequency UP it, so the
      // field runs vertically the way rain and salt run down steel.
      const streak = lattice(u, v * 0.22, 32) * 0.55 + lattice(u, v * 0.11, 8) * 0.45;
      const patch = lattice(u, v, 6);
      // Low on the shell the paint is worked hardest — spray, fenders, the
      // boot-top's own scuff — so the roughness rises toward the waterline.
      const low = 1 - Math.min(1, Math.max(0, (v - 0.06) / 0.42));
      const value = 0.5 + (streak - 0.5) * 0.30 + (patch - 0.5) * 0.14 + low * 0.16;
      const g = Math.round(Math.min(1, Math.max(0, value)) * 255);
      const i = (y * size + x) * 4;
      data[i] = g;
      data[i + 1] = g;
      data[i + 2] = g;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.repeat.set(2.5, 1);
  tex.needsUpdate = true;
  _wearMap = tex;
  return tex;
}

/** Mean and extremes of `hullWearMap`'s green channel. The receipt, offline. */
export function hullWearStats(size = 64) {
  const tex = hullWearMap(size);
  const d = tex.image.data;
  let sum = 0;
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = d[i + 1];
    sum += g;
    if (g < lo) lo = g;
    if (g > hi) hi = g;
  }
  const n = d.length / 4;
  return { mean: sum / n / 255, min: lo / 255, max: hi / 255, texels: n };
}

/**
 * MC3 F7 (overlay half) — "the naval hull and house remain chalky stacked
 * boxes". Chalk is what one finish looks like: every face returning the same
 * roughness and the same metalness reads as unpainted plaster whatever the
 * geometry does. A real ship carries three finishes that separate under one
 * light, and they are declared here rather than tuned per mesh:
 *
 *   painted   — haze-grey topside enamel. Matte, almost no metal.
 *   galvanised— rails, fittings, mast. Bright and metallic, low roughness.
 *   nonSlip   — deck. Almost totally rough, no metal at all.
 *
 * The gaps are the point, so they are asserted rather than eyeballed.
 */
export const WARSHIP_FINISHES = Object.freeze({
  painted: Object.freeze({ color: '#78808a', roughness: 0.66, metalness: 0.10 }),
  galvanised: Object.freeze({ color: '#c4ccd2', roughness: 0.28, metalness: 0.72 }),
  nonSlip: Object.freeze({ color: '#3d443f', roughness: 0.95, metalness: 0.02 }),
});
export const WARSHIP_FINISH_MIN_GAP = 0.3;

function dressKit() {
  return {
    // ── P14 M11 item 1 — the painted topside carries a roughness MAP. ──
    // The three finishes stay (the gap the M4 audit asked for is still
    // asserted), but the painted one is no longer one number over the whole
    // shell: `hullWearMap` streaks it vertically and roughens it toward the
    // waterline, which is what stops a 28 m grey hull reading as one facet.
    painted: std(WARSHIP_FINISHES.painted.color, {
      roughness: HULL_WEATHER.paintedRough,
      metalness: WARSHIP_FINISHES.painted.metalness,
      roughnessMap: hullWearMap(),
    }),
    // The same paint without the map, for the small fittings whose UVs are not
    // worth a streak field.
    paintedFlat: std(WARSHIP_FINISHES.painted.color, {
      roughness: WARSHIP_FINISHES.painted.roughness,
      metalness: WARSHIP_FINISHES.painted.metalness,
    }),
    /** Rust wash, dark and utterly matte, transparent so it stains. */
    rust: new THREE.MeshStandardMaterial({
      color: 0x6b3a1e,
      roughness: 0.97,
      metalness: 0.0,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    }),
    rustDark: new THREE.MeshStandardMaterial({
      color: 0x40230f,
      roughness: 0.98,
      metalness: 0.0,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
    /** Salt bloom: a pale chalky film in the metre above the boot-top. */
    salt: new THREE.MeshStandardMaterial({
      color: 0xd9dee0,
      roughness: 0.99,
      metalness: 0.0,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }),
    galvanised: std(WARSHIP_FINISHES.galvanised.color, {
      roughness: WARSHIP_FINISHES.galvanised.roughness,
      metalness: WARSHIP_FINISHES.galvanised.metalness,
    }),
    nonSlip: std(WARSHIP_FINISHES.nonSlip.color, {
      roughness: WARSHIP_FINISHES.nonSlip.roughness,
      metalness: WARSHIP_FINISHES.nonSlip.metalness,
    }),
    // MC3 F7 — a boot-top is anti-fouling, not signal red. Darker, and with a
    // black bottom band under it so the waterline is a step in value.
    boot: std('#3c0f12', { roughness: 0.7, metalness: 0.08 }),
    antifoul: std('#170c0c', { roughness: 0.94, metalness: 0.03 }),
    // Salt and rust washing down from the scuppers. Low on the house only.
    weather: std('#6a5a4c', { roughness: 0.9, metalness: 0.04 }),
    glass: std('#141d24', { roughness: 0.18, metalness: 0.42 }),
    bootOld: std('#5a1418', { roughness: 0.62, metalness: 0.12 }),
    wet: std('#c8d0d4', { roughness: 0.28, metalness: 0.22 }),
    collar: std('#071018', { roughness: 0.96, metalness: 0.02 }),
    foam: std('#dfe8ee', { roughness: 0.82, metalness: 0.04 }),
    grey: std('#6a7078', { roughness: 0.48, metalness: 0.28 }),
    greyDark: std('#3a4048', { roughness: 0.5, metalness: 0.32 }),
    greyLight: std('#a8aeb4', { roughness: 0.42, metalness: 0.22 }),
    deck: std('#4a5058', { roughness: 0.62, metalness: 0.12 }),
    letter: std('#f2efe6', { roughness: 0.48, metalness: 0.06 }),
    yellow: std('#d8b030', { roughness: 0.48, metalness: 0.1 }),
    flash: new THREE.MeshStandardMaterial({
      color: 0xfff4c8,
      emissive: 0xffe08a,
      emissiveIntensity: WARSHIP_FLASH_EMISSIVE,
      roughness: 0.22,
      metalness: 0.08,
      toneMapped: false,
    }),
    flashAdd: new THREE.MeshBasicMaterial({
      color: 0xfff2b0,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    }),
  };
}

/**
 * MC2 F1 — the hull's half-beam along its length, stern (-14.6) to bow (+13.4).
 * Everything that must hug the waterline reads its shape from this one table.
 */
export const HULL_PLAN = Object.freeze([
  Object.freeze([-14.60, 1.05]),
  Object.freeze([-12.80, 2.15]),
  Object.freeze([-10.40, 2.95]),
  Object.freeze([-7.20, 3.34]),
  Object.freeze([-2.40, 3.46]),
  Object.freeze([2.60, 3.46]),
  Object.freeze([6.40, 3.30]),
  Object.freeze([9.20, 2.80]),
  Object.freeze([11.40, 2.00]),
  Object.freeze([12.70, 1.10]),
  Object.freeze([13.40, 0.30]),
]);

/**
 * Lay a narrow ribbon along both sides of HULL_PLAN at height `y`, offset
 * `outset` metres outboard of the hull edge, `width` metres across. Each segment
 * is yawed to the local plan angle, so the ribbon follows the sheer instead of
 * boxing it. Opaque and depth-tested by construction (`std` materials).
 */
export function addPlanRibbon(parent, mat, y, outset, width, name, opts = {}) {
  const made = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < HULL_PLAN.length - 1; i += 1) {
      const [x0, b0] = HULL_PLAN[i];
      const [x1, b1] = HULL_PLAN[i + 1];
      const dx = x1 - x0;
      const dz = side * (b1 - b0);
      const len = Math.hypot(dx, dz);
      if (len < 0.02) continue;
      const mesh = addBox(parent, len + width * 0.55, 0.08, width, mat,
        (x0 + x1) * 0.5,
        y,
        side * ((b0 + b1) * 0.5 + outset + width * 0.5),
        { rotY: -Math.atan2(dz, dx), name: `${name}:${side < 0 ? 'p' : 's'}${i}` });
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      noPick(mesh);
      made.push(mesh);
    }
  }
  /*
   * ── P14 M9 ITEM 3 — THE CAPS ARE GONE, AND THEY WERE THE RECTANGLE. ──
   *
   * MC4 pack-a: "hulls float on painted foam with no displacement, refraction,
   * or contact". `addPlanRibbon`'s twenty side segments do follow the plan —
   * that is what M5 F1 fixed and the test still pins — but the two CAPS did
   * not: a `width * 1.4` by `width * 1.8` box across the stem and a
   * `width * 1.6` by `2.3 + 2 * outset` box across the transom, both axis-
   * aligned, both with four square corners, both floating on open water
   * outboard of a hull that is pointed at one end and rounded at the other.
   * At the seafight pose the stern cap is the pale bar under the transom the
   * critic's crop shows.
   *
   * The ends of the outline are closed by the plan RING now
   * (`units.js addPlanCollar` / `addPlanShade`), which has no ends. Callers
   * that still want a closed ribbon on the PLATING — a boot-top line, say,
   * where a straight run is correct because it is on the steel — pass
   * `{ caps: true }`.
   */
  if (opts.caps) {
    const bow = addBox(parent, width * 1.4, 0.08, width * 1.8, mat, 13.5 + outset, y, 0, {
      name: `${name}:bow`,
    });
    bow.castShadow = false;
    made.push(bow);
    const stern = addBox(parent, width * 1.6, 0.08, 2.3 + outset * 2, mat, -14.8 - outset, y, 0, {
      name: `${name}:stern`,
    });
    stern.castShadow = false;
    made.push(stern);
  }
  return made;
}

/**
 * `HULL_PLAN` as a closed polygon in the dress's own XZ frame: down the
 * starboard side from the stem, back up the port side. This is the hull's real
 * lines plan — the same table `p14-military-art` pins at 3.46 amidships — so
 * every water decal built off it is on the hull's own shape by construction
 * rather than on a generic rounded rectangle.
 */
export function hullPlanPolygon(outset = 0) {
  const poly = [];
  for (let i = 0; i < HULL_PLAN.length; i += 1) {
    const [x, b] = HULL_PLAN[i];
    poly.push([x, b + outset]);
  }
  for (let i = HULL_PLAN.length - 1; i >= 0; i -= 1) {
    const [x, b] = HULL_PLAN[i];
    if (b + outset < 0.06) continue;
    poly.push([x, -(b + outset)]);
  }
  return poly;
}
/** Length and beam the plan spans, for the bow wave and the wake. */
export const HULL_SPAN = Object.freeze({
  x0: HULL_PLAN[0][0],
  x1: HULL_PLAN[HULL_PLAN.length - 1][0],
  len: HULL_PLAN[HULL_PLAN.length - 1][0] - HULL_PLAN[0][0],
  cx: (HULL_PLAN[HULL_PLAN.length - 1][0] + HULL_PLAN[0][0]) * 0.5,
  beam: Math.max(...HULL_PLAN.map(([, b]) => b)) * 2,
});

/**
 * M14 item 4 — stern gear shared by the afloat dress and the launch hull.
 * The group is authored in the warship's longitudinal frame (+X forward),
 * then turned onto +Z-forward shipyard hulls by `axis: 'z'`.
 */
export const WARSHIP_STERN_GEAR = Object.freeze({
  transoms: 1,
  rudders: 1,
  propGuards: 2,
  props: 2,
});

export function addWarshipSternGear(parent, mats, {
  name = 'military:navy:stern-gear',
  axis = 'x',
  stern = -14.45,
  y = 0.02,
  scale = 1,
} = {}) {
  const gear = new THREE.Group();
  gear.name = name;
  gear.position.set(axis === 'z' ? 0 : stern, y, axis === 'z' ? stern : 0);
  if (axis === 'z') gear.rotation.y = -Math.PI / 2;
  gear.scale.setScalar(scale);
  noPick(gear);
  parent.add(gear);

  const paint = mats.greyDark ?? mats.plate ?? mats.painted;
  const edge = mats.galvanised ?? mats.strake ?? paint;
  const dark = mats.antifoul ?? mats.keel ?? paint;
  const centredChamfer = (w, h, d, bevel) => {
    const geometry = chamferBox(w, h, d, bevel);
    geometry.computeBoundingBox();
    geometry.translate(0, -(geometry.boundingBox.min.y + geometry.boundingBox.max.y) * 0.5, 0);
    return geometry;
  };
  const transom = new THREE.Mesh(centredChamfer(0.42, 1.42, 3.12, 0.12), paint);
  transom.name = `${name}:transom`;
  transom.position.set(0.16, 0.43, 0);
  transom.castShadow = true;
  transom.receiveShadow = true;
  noPick(transom);
  gear.add(transom);

  const rudder = new THREE.Mesh(centredChamfer(0.30, 1.52, 0.78, 0.10), edge);
  rudder.name = `${name}:rudder`;
  rudder.position.set(-0.28, -0.42, 0);
  rudder.rotation.z = -0.08;
  rudder.castShadow = true;
  rudder.receiveShadow = true;
  noPick(rudder);
  gear.add(rudder);

  for (const side of [-1, 1]) {
    const suffix = side < 0 ? 'port' : 'starboard';
    const z = side * 0.98;
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.10, 7, 18), edge);
    guard.name = `${name}:prop-guard:${suffix}`;
    guard.position.set(-0.16, -0.38, z);
    guard.rotation.y = Math.PI / 2;
    guard.castShadow = true;
    guard.receiveShadow = true;
    noPick(guard);
    gear.add(guard);

    addCyl(gear, 0.14, 0.14, 0.72, 8, dark, -0.06, -0.38, z, {
      rotZ: Math.PI / 2,
      name: `${name}:shaft:${suffix}`,
    });
    addCyl(gear, 0.22, 0.28, 0.24, 8, edge, -0.48, -0.38, z, {
      rotZ: Math.PI / 2,
      name: `${name}:prop-hub:${suffix}`,
    });
    const prop = new THREE.Group();
    prop.name = `${name}:prop:${suffix}`;
    prop.position.set(-0.61, -0.38, z);
    noPick(prop);
    gear.add(prop);
    for (let blade = 0; blade < 3; blade += 1) {
      const angle = (blade / 3) * Math.PI * 2;
      const mesh = new THREE.Mesh(centredChamfer(0.12, 0.18, 0.72, 0.05), edge);
      mesh.position.set(0, Math.sin(angle) * 0.27, Math.cos(angle) * 0.27);
      mesh.rotation.x = angle;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      noPick(mesh);
      prop.add(mesh);
    }
    const strut = new THREE.Mesh(centredChamfer(0.20, 0.82, 0.18, 0.05), dark);
    strut.name = `${name}:guard-strut:${suffix}`;
    strut.position.set(0.02, 0.04, z);
    strut.rotation.z = side * 0.24;
    strut.castShadow = true;
    strut.receiveShadow = true;
    noPick(strut);
    gear.add(strut);
  }
  gear.userData.receipt = { ...WARSHIP_STERN_GEAR, axis };
  return gear;
}

/**
 * P14 M11 item 1 — the horizontal inset of each chamfer, measured at every
 * station of `HULL_PLAN` rather than at the one where it is widest. The brief
 * asks for >= 0.06 m at the sheer and the deck edge; this returns the minimum
 * over the whole length so the assertion cannot be passed by amidships alone.
 */
export function hullBevelInsets() {
  let sheerMin = Infinity;
  let deckMin = Infinity;
  for (const [, b] of HULL_PLAN) {
    // Both bands are built with an ABSOLUTE outset off the same scaled level,
    // so the inset is the outset itself wherever the level is not clamped.
    const sheerLevel = Math.max(0.03, b * 0.93);
    const sheerCap = Math.max(0.03, b * 0.93 - HULL_BEVEL.sheer);
    const deckLevel = Math.max(0.03, b * 0.90);
    const deckCap = Math.max(0.03, b * 0.90 - HULL_BEVEL.deckEdge);
    sheerMin = Math.min(sheerMin, sheerLevel - sheerCap);
    deckMin = Math.min(deckMin, deckLevel - deckCap);
  }
  return {
    sheer: sheerMin,
    deckEdge: deckMin,
    sheerRise: HULL_BEVEL.sheerRise,
    deckRise: HULL_BEVEL.deckRise,
  };
}

/** Interpolated half-beam at hull station `x`. */
export function hullHalfBeamAt(x) {
  const first = HULL_PLAN[0];
  const last = HULL_PLAN[HULL_PLAN.length - 1];
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < HULL_PLAN.length - 1; i += 1) {
    const [x0, b0] = HULL_PLAN[i];
    const [x1, b1] = HULL_PLAN[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / Math.max(1e-6, x1 - x0);
      return b0 + (b1 - b0) * t;
    }
  }
  return last[1];
}

function findBob(holder) {
  if (!holder) return null;
  return holder.children.find((ch) => ch.isGroup) ?? holder;
}

/**
 * Dress the navy hull in place. Idempotent. Keeps every existing fringe:ship:* name.
 */
export function dressWarship(holder) {
  if (!holder || holder.userData.warshipDressed) {
    return holder?.userData?.dress ?? null;
  }
  const bob = findBob(holder);
  if (!bob) return null;
  const mats = dressKit();
  const root = new THREE.Group();
  root.name = 'military:warship-dress';
  noPick(root);
  bob.add(root);
  /*
   * The hull's own lines plan lifted to a level at height `y`, scaled by `k`
   * and pushed out by `out` metres. Hoisted to the top of the dress in M11
   * because the boot-top, the anti-fouling and the salt bloom are BANDS ON THE
   * PLATING now rather than flat ribbons lying on the water, and they are
   * built from the same table the topside loft is.
   */
  const hullLevel = (y, k, out = 0) => HULL_PLAN.map(([x, b]) => [x, y, Math.max(0.03, b * k + out)]);

  // MC3 F7 — three bands, not one: black anti-fouling below, a darker boot-top
  // over it, the wet gloss line on top. The waterline is now a value step.
  /*
   * ── P14 M10 ITEM 1 — THE BOTTOM PAINT WAS TWO MORE RECTANGLES. ──
   *
   * `addBox(root, 22.5, 0.3, 6.66, mats.antifoul, ...)` and its boot-top twin
   * at 6.72 are the same fault M9 removed from `military:navy:wetline`, one
   * deck lower and therefore invisible while the hull sat 10.7 cm UNDER the
   * sheet. Put on the water by item 1, they surface: the plan's half-beam is
   * 1.05 m at the transom and 0.30 at the stem, so a 6.72 m slab overhangs the
   * plating by 2.31 m a side aft and 3.06 forward — about 53 px of black
   * rectangle beside a pointed hull at the seafight pose, seen through a
   * translucent sheet. Same names, same two levels, on the plan.
   */
  /*
   * ── P14 M11 ITEM 1 — THE BOTTOM PAINT IS A BAND ON THE SHELL. ──
   *
   * M10 put both bands on the PLAN, which fixed the overhang; what it left is
   * that a plan ribbon is a horizontal PLATE 0.08 m thick lying at a height,
   * so from the seafight camera the boot-top was a hairline and, at
   * `y = -0.17`, a hairline 0.19 m UNDER the water. A boot-top is by
   * definition the band that straddles the waterline, and it is the single
   * strongest read on any grey hull: the value step at the water.
   *
   * Both are lofts off `HULL_PLAN` now — vertical bands ON the plating,
   * 0.012 m proud so they cannot z-fight the shell, with the anti-fouling
   * running from the turn of the bilge up to the boot-top's own foot and the
   * boot-top spanning `HULL_WEATHER.bootLo .. bootHi` about the waterline.
   * Both keep their group name and both keep a plan RIBBON at their top edge,
   * so the twenty segments `p14-military-art` walks are still there.
   */
  for (const [name, mat, lo, hi, ribbonY, outset, width] of [
    ['military:navy:antifoul', mats.antifoul, -0.62, WATER_Y + HULL_WEATHER.bootLo,
      -0.42, -0.09, 0.36],
    ['military:navy:boot', mats.boot, WATER_Y + HULL_WEATHER.bootLo,
      WATER_Y + HULL_WEATHER.bootHi, WATER_Y + HULL_WEATHER.bootHi, -0.07, 0.30],
  ]) {
    // Each band lives in a group under its own name, the way `M5 F1` left
    // `military:navy:collar`, so every lookup that reaches for the band by name
    // still resolves while the segments themselves follow the plan.
    const band = new THREE.Group();
    band.name = name;
    noPick(band);
    root.add(band);
    loftMesh(band, loftBand([hullLevel(lo, 1.0, 0.012), hullLevel(hi, 1.0, 0.012)]), mat,
      `${name}:band`);
    addPlanRibbon(band, mat, ribbonY, outset, width, name);
  }
  /*
   * ── SALT BLOOM. ──
   * A chalky film in the half-metre above the boot-top, where spray dries and
   * leaves salt on the paint. Transparent, no depth write, utterly matte:
   * this is a stain, not a stripe, and the plating's own tone shows through.
   */
  const salt = new THREE.Group();
  salt.name = 'military:navy:salt';
  noPick(salt);
  root.add(salt);
  loftMesh(salt, loftBand([
    hullLevel(WATER_Y + HULL_WEATHER.saltLo, 1.0, 0.016),
    hullLevel(WATER_Y + HULL_WEATHER.saltHi, 1.0, 0.016),
  ]), mats.salt, 'military:navy:salt:band');
  /*
   * ── RUST STREAKS. ──
   * Not a dirt map: a run of narrow vertical planes hung from the scuppers and
   * the hawse, which is the only place a real hull streaks. Each one starts at
   * the deck edge and dies out before the boot-top, and each is a slightly
   * different width and length, taken off the station index rather than off a
   * random number. Two tones so the runs are not one bar of brown.
   */
  const rust = new THREE.Group();
  rust.name = 'military:navy:rust';
  noPick(rust);
  root.add(rust);
  const rustStations = [...HULL_WEATHER.scuppers, HULL_WEATHER.hawse];
  for (let i = 0; i < rustStations.length; i += 1) {
    const f = rustStations[i];
    const x = HULL_SPAN.x0 + HULL_SPAN.len * f;
    const b = hullHalfBeamAt(x);
    const long = i === rustStations.length - 1;
    const top = long ? 1.66 : 1.32;
    const drop = long ? 1.24 : 0.72 + (i % 3) * 0.22;
    const w = long ? 0.30 : 0.16 + (i % 2) * 0.07;
    for (const side of [-1, 1]) {
      const mesh = addBox(rust, w, drop, 0.03, i % 2 ? mats.rust : mats.rustDark,
        x + (i % 2 ? 0.08 : -0.06), top - drop * 0.5, side * (b + 0.055), {
          name: `military:navy:rust:${long ? 'hawse' : `scupper-${i}`}:${side < 0 ? 'p' : 's'}`,
        });
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 2;
      noPick(mesh);
    }
  }
  /*
   * ── DRAUGHT MARKS. ──
   * Two numerals at the stem and two at the transom, on the boot-top's own
   * band. Small: 0.34 m of glyph on a 28 m hull is 8 px at the seafight pose
   * and 12 at the shipyard's, which is exactly what a draught mark reads as.
   */
  const draught = new THREE.Group();
  draught.name = 'military:navy:draught';
  noPick(draught);
  root.add(draught);
  for (const [mark, x, z, yaw, name] of [
    ['4', 12.55, hullHalfBeamAt(12.55) + 0.05, 0, 'military:navy:draught:stem'],
    ['6', -13.40, hullHalfBeamAt(-13.40) + 0.05, 0, 'military:navy:draught:transom'],
  ]) {
    for (const side of [-1, 1]) {
      const glyph = addToyLetters(draught, mark, mats.letter, x, WATER_Y + 0.22, side * z, {
        s: 0.34, gap: 0.05, depth: 0.04,
      });
      glyph.name = `${name}:${side < 0 ? 'p' : 's'}`;
      glyph.rotation.y = yaw + (side < 0 ? Math.PI : 0);
      noPick(glyph);
    }
  }
  /*
   * ── P14 M9 ITEM 3 — THE GLOSS LINE FOLLOWS THE PLAN. ──
   *
   * `military:navy:wetline` was `addBox(root, 22.8, 0.1, 6.88, mats.wet, ...)`:
   * a 0.1 m pale plate 6.88 m ACROSS, laid at the waterline on a hull whose
   * half-beam is 3.46 m amidships and 1.05 m at the transom. Amidships it is
   * flush; at the transom it overhangs the plating by 2.39 m a side, and at the
   * stem by 3.29 — a pale rectangle sticking out of a pointed hull, which is
   * the raft read MC2 F1 removed from the contact ribbons and left here.
   *
   * It is the same ribbon the collar uses now, on the plan, hugging the
   * plating: outboard reach `outset + width` = 0.16 m, which at the seafight
   * pose is well under a pixel, so it marks the waterline without laying
   * anything on the water. The name and the second (forward) run survive.
   */
  addPlanRibbon(root, mats.wet, WATER_Y + 0.04, -0.06, 0.22, 'military:navy:wetline');
  addBox(root, 2.75, 0.26, 5.05, mats.antifoul, 11.4, -0.38, 0);
  addBox(root, 2.8, 0.26, 5.1, mats.boot, 11.4, -0.13, 0);

  const stern = new THREE.Group();
  stern.name = 'military:navy:stern';
  const sternA = new THREE.Mesh(chamferBox(2.55, 1.45, 4.35, 0.16), mats.grey);
  sternA.position.set(-12.35, 0.58, 0);
  noPick(sternA);
  stern.add(sternA);
  const sternB = new THREE.Mesh(chamferBox(1.65, 1.08, 3.15, 0.14), mats.greyDark);
  sternB.position.set(-13.55, 0.48, 0);
  noPick(sternB);
  stern.add(sternB);
  const sternC = new THREE.Mesh(chamferBox(0.95, 0.72, 1.95, 0.12), mats.grey);
  sternC.position.set(-14.35, 0.36, 0);
  noPick(sternC);
  stern.add(sternC);
  const sternPort = new THREE.Mesh(chamferBox(1.15, 0.88, 2.45, 0.1), mats.greyDark);
  sternPort.position.set(-13.05, 0.42, 2.05);
  sternPort.rotation.y = 0.36;
  noPick(sternPort);
  stern.add(sternPort);
  const sternStbd = new THREE.Mesh(chamferBox(1.15, 0.88, 2.45, 0.1), mats.greyDark);
  sternStbd.position.set(-13.05, 0.42, -2.05);
  sternStbd.rotation.y = -0.36;
  noPick(sternStbd);
  stern.add(sternStbd);
  root.add(stern);
  const sternGear = addWarshipSternGear(root, mats);
  // MC3 F7 — the knuckle is a galvanised strake standing proud of a painted
  // shell: two finishes meeting on one hard line, which is the read the audit
  // could not find on a single-finish hull.
  addBox(root, 18.6, 0.14, 0.22, mats.galvanised, -1.15, 0.98, 3.30, { name: 'military:navy:knuckle-s' });
  addBox(root, 18.6, 0.14, 0.22, mats.galvanised, -1.15, 0.98, -3.30, { name: 'military:navy:knuckle-p' });
  addBox(root, 17.2, 0.09, 0.16, mats.galvanised, -1.15, 1.62, 3.34, { name: 'military:navy:strake-s' });
  addBox(root, 17.2, 0.09, 0.16, mats.galvanised, -1.15, 1.62, -3.34, { name: 'military:navy:strake-p' });
  addBox(root, 16.8, 1.22, 0.28, mats.painted, -1.05, 0.58, 3.38);
  addBox(root, 16.8, 1.22, 0.28, mats.painted, -1.05, 0.58, -3.38);
  const plateP = new THREE.Mesh(chamferBox(14.4, 0.95, 0.42, 0.08), mats.greyDark);
  plateP.position.set(-0.85, 0.42, 3.52);
  noPick(plateP);
  root.add(plateP);
  const plateS = new THREE.Mesh(chamferBox(14.4, 0.95, 0.42, 0.08), mats.greyDark);
  plateS.position.set(-0.85, 0.42, -3.52);
  noPick(plateS);
  root.add(plateS);

  // MC2 F1 STANDING FAULT — the M4 contact was two rectangles, 21.6 x 8.15 and
  // 22.2 x 8.65, both wider than the hull's own waterline plan. A rectangle
  // sticking out beside a hull reads as a raft, so the hull read as floating.
  // These are narrow ribbons that follow HULL_PLAN, which is the hull's actual
  // half-beam along its length: dark shadow ribbon inside, foam ribbon outside.
  const collar = new THREE.Group();
  collar.name = 'military:navy:collar';
  /*
   * The wetted band keeps the ribbon, because a straight run is correct ON
   * STEEL — and this round moved it onto the steel. At `WATER_Y - 0.035` and
   * 0.85 m wide it was a 0.08 m plate lying 15 mm UNDER the harbour sheet and
   * reaching 0.85 m outboard of the plating, i.e. a water decal with a hard
   * outboard edge: twenty of them, and the live census counted every one. At
   * `WATER_Y + 0.26` and 0.34 m wide it is the dark top of the boot-top on the
   * shell itself, above the sheet, with the plan shade and the broken collar
   * below it doing the water. Same builder, same twenty segments M5 F1's
   * receipt walks, same name — a different surface.
   */
  addPlanRibbon(collar, mats.collar, WATER_Y + 0.26, -0.10, 0.34, 'military:navy:collar');
  noPick(collar);
  root.add(collar);
  /*
   * ── P14 M9 ITEM 3 — THE HULL-SHAPED SHADOW AND THE BOW WAVE. ──
   *
   * What the water under this hull carried before: a dark ribbon hugging the
   * plating, a pale ribbon 0.52 m outboard of it, and four square-cornered
   * caps. Nothing under the hull, nothing off the stem, and every edge a hard
   * one — "hulls float on painted foam with no displacement or contact",
   * exactly as MC4 read it.
   *
   * Three rings on the hull's OWN lines plan, built with the `units.js`
   * primitives PM5A proved on the port's craft:
   *   shade  a multiply on the plan, held for 42 % of its width and then ramped
   *          to white, so there is a real luma step at the plating that dies
   *          out into the chop with no outer edge anywhere
   *   collar a narrow broken additive rim ON the plating — 28 % of the rim
   *          carries no foam at all, so it cannot weld into a painted line
   *   wave   a crest that STARTS AT THE STEM and fades aft over 78 % of the
   *          length, opening outboard as the entry opens
   */
  const water = new THREE.Group();
  water.name = 'military:navy:water';
  noPick(water);
  root.add(water);
  const shade = addPlanShade(water, {
    rim: hullPlanPolygon(0.03), y: WATER_Y + 0.004, width: 3.1, hold: 0.42, step: 1.5, seed: 7,
    name: 'military:navy:water:shade',
  });
  const foam = new THREE.Group();
  foam.name = 'military:navy:foam';
  noPick(foam);
  root.add(foam);
  addPlanCollar(foam, {
    rim: hullPlanPolygon(0.16), y: WATER_Y + 0.012, width: 0.72, step: 1.3,
    amp: 0.30, seed: 4, name: 'military:navy:foam:ring',
  });
  addBowWave(foam, {
    x: HULL_SPAN.cx, z: 0, yaw: 0, len: HULL_SPAN.len, beam: HULL_SPAN.beam,
    y: WATER_Y + 0.016, amp: 0.40, run: 0.78, stations: 11, seed: 5,
    name: 'military:navy:foam:bow-wave',
  });
  /*
   * The stern wake, built here rather than by `addDepartWake`. Seven stacked
   * `PlaneGeometry` strips at descending opacity is precisely the family of
   * straight-edged decal PM5A's live census found on the port's pilot boat and
   * attributed to `port/port-vehicles.js`; that builder is another lane's file
   * and is untouched, but the military hull no longer uses it. This one is a
   * tapering closed strip whose flanks are black, so it dies out sideways as
   * well as astern. Hidden at rest; `tickWarshipDress({ underway })` shows it.
   */
  const wake = new THREE.Group();
  wake.name = 'military:navy:wake';
  noPick(wake);
  addSternWake(wake, {
    x: HULL_SPAN.x0, z: 0, yaw: 0, len: 26, beam: HULL_SPAN.beam * 1.1,
    y: WATER_Y + 0.014, amp: 0.32, stations: 12, seed: 9,
    name: 'military:navy:wake:strip',
  });
  wake.visible = false;
  root.add(wake);
  /*
   * ── P14 M11 ITEM 2 — THE BOW-WAVE DECAL IS OFF TOO. ──
   * `military:navy:foam:bow-wave` is a plate crest laid on the water off the
   * stem. The brief asks for the bow wave "as a crest, not a decal", and the
   * ocean shader now raises a real one at the stem from the hull's position
   * and heading. Hidden, not deleted: the name resolves, the builder is intact
   * and the A/B can put it back beside the displacement in one line.
   */
  const bowDecal = foam.getObjectByName('military:navy:foam:bow-wave');
  if (bowDecal) bowDecal.visible = false;

  // MC2 F1 — facet the raw main hull slab as an overlay (ships.js is A7's file).
  // Tumblehome panels on the plan line, a chine strip where they meet the
  // waterline ribbon, and a contrasting sheer strake along the top edge, so the
  // topside is three tones with two hard edges instead of one flat face.
  // ── P16-PM2B ITEM 2 — THE TOPSIDE IS A LOFT OFF THE PLAN, NOT 60 PANELS. ──
  // MC2 F1 faceted the raw hull slab by laying a box per `HULL_PLAN` segment per
  // side, plus a chine box and a sheer box on each: sixty solids following one
  // curve, every joint a corner the key catches, and every panel's `rotation.x`
  // of ±0.12 opening a wedge against its neighbour at the ends where the plan
  // turns hardest. `HULL_PLAN` is already a lines plan — the same table
  // `p14-military-art` pins at 3.46 amidships — so the shell is lofted straight
  // off it: one surface for the topside with tumblehome built in (the sheer
  // level carries 93 % of the chine's half-breadth), a strake band at the sheer
  // and a chine band under it. The plan, the beam, the ribbons and every
  // asserted name are untouched.
  const topside = new THREE.Group();
  topside.name = 'military:navy:topside';
  noPick(topside);
  const chineL = hullLevel(0.30, 1.00, 0.04);
  const midL = hullLevel(1.06, 1.00, 0.02);
  const sheerL = hullLevel(1.86, 0.93);
  /*
   * ── P14 M11 ITEM 1 — THE SHEER IS CHAMFERED, AND BY AN ABSOLUTE INSET. ──
   *
   * The sheer strake ran `hullLevel(1.98, 0.91)` against a sheer at 0.93, i.e.
   * a chamfer of TWO PER CENT OF THE LOCAL HALF-BEAM. Amidships (3.46 m) that
   * is 0.069 m and just clears the brief's 0.06; at the transom (1.05 m) it is
   * 0.021 and at the stem 0.006 — a right angle for most of the length, which
   * is the "unbevelled primitive hull" pack-g named. `HULL_BEVEL.sheer` is an
   * absolute metre inset, so the chamfer is the SAME WIDTH from stem to
   * transom and `hullBevelInsets()` can assert its minimum.
   */
  const capL = hullLevel(1.86 + HULL_BEVEL.sheerRise, 0.93, -HULL_BEVEL.sheer);
  loftMesh(topside, loftBand([chineL, midL, sheerL]), mats.painted, 'military:navy:topside:shell');
  loftMesh(topside, loftBand([sheerL, capL]), mats.greyLight, 'military:navy:topside:sheer-strake');
  loftMesh(topside, loftBand([hullLevel(0.14, 1.00, 0.05), chineL]), mats.greyDark,
    'military:navy:topside:chine');
  for (const side of [-1, 1]) {
    for (const x of [-11.2, -8.4, -5.6, -2.8, 0, 2.8, 5.6, 8.4]) {
      const b = hullHalfBeamAt(x);
      addBox(topside, 0.18, 1.2, 0.22, mats.greyDark, x, 1.02, side * (b + 0.03));
    }
  }
  root.add(topside);

  const turret = new THREE.Group();
  turret.name = 'military:navy:turret';
  turret.position.set(8.85, 2.08, 0);
  root.add(turret);
  addCyl(turret, 1.12, 1.18, 0.55, 10, mats.grey, 0, 0.28, 0);
  addBox(turret, 1.85, 0.62, 1.55, mats.greyDark, 0.12, 0.58, 0);
  const barrel = new THREE.Group();
  barrel.name = 'military:navy:barrel';
  barrel.position.set(1.15, 0.62, 0);
  turret.add(barrel);
  addCyl(barrel, 0.11, 0.11, 2.9, 8, mats.greyDark, 1.35, 0, 0, { rotZ: Math.PI / 2 });
  addCyl(barrel, 0.16, 0.16, 0.28, 8, mats.grey, 2.78, 0, 0, { rotZ: Math.PI / 2 });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), mats.flash);
  flash.name = 'military:navy:flash';
  flash.position.set(3.15, 0, 0);
  flash.visible = false;
  noPick(flash);
  barrel.add(flash);
  const flashQuad = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1.35), mats.flashAdd);
  flashQuad.name = 'military:navy:flash-quad';
  flashQuad.position.set(3.35, 0, 0);
  flashQuad.visible = false;
  flashQuad.renderOrder = 8;
  noPick(flashQuad);
  barrel.add(flashQuad);

  // MC3 F7 — the house. `ships.js` (A8's) builds the block; the overlay gives it
  // the three things that stop a block reading as chalk: a weathered band low
  // down where the scuppers wash, a dark window strip at bridge level, and a
  // non-slip deck course between the levels.
  const house = new THREE.Group();
  house.name = 'military:navy:house';
  noPick(house);
  root.add(house);
  const HOUSE_X = -1.28;
  const DECK_Y = 2.08;
  // ── P16-PM2B ITEM 2 — ONE ENCLOSED SUPERSTRUCTURE, DRESSED. ──
  // The overlay hung a weather band, a canted glass strip, four mullions and a
  // hood on EACH side plus a face plate and a deck plate, all at fixed z over a
  // `ships.js` house that has since moved. Nine plates standing off a block is
  // the terrace this round exists to remove. `deckhouse` gives the dress its own
  // enclosed two-level house at the same datum, and the bridge glass keeps its
  // asserted names as flush plates on that house's plan.
  deckhouse(house, mats, {
    x: HOUSE_X, y0: DECK_Y + 0.06,
    tiers: [
      { w: 6.26, d: 3.76, h: 1.36, edge: 0.14, mat: mats.painted, sill: 0.32, head: 0.76 },
      { w: 4.3, d: 2.9, h: 1.1, edge: 0.14, mat: mats.grey, sill: 0.16, head: 0.88, dx: 0.65 },
    ],
    body: mats.painted, glass: mats.glass, deck: mats.nonSlip, foot: mats.greyDark,
    name: 'military:navy:house-block', stations: 7,
  });
  for (const side of [-1, 1]) {
    addBox(house, 6.0, 0.34, 0.08, mats.weather, HOUSE_X, DECK_Y + 0.46, side * 1.9, {
      name: `military:navy:house-weather-${side < 0 ? 'p' : 's'}`,
    });
    addBox(house, 3.3, 0.4, 0.08, mats.glass, HOUSE_X + 0.65, DECK_Y + 2.42, side * 1.47, {
      name: `military:navy:bridge-glass-${side < 0 ? 'p' : 's'}`,
    });
  }
  addBox(house, 0.08, 0.4, 2.4, mats.glass, HOUSE_X + 2.82, DECK_Y + 2.42, 0, {
    name: 'military:navy:bridge-glass-face',
  });
  addBox(house, 6.4, 0.06, 3.9, mats.nonSlip, HOUSE_X, DECK_Y + 1.52, 0, {
    name: 'military:navy:house-deck',
  });
  // The weather deck was a 20.4 × 5.4 m rectangle over a hull 2.1 m wide at the
  // transom and pointed at the stem, so it overhung the plating by up to 1.6 m
  // a side. It is the loft's own cap now, at the same datum and the same name.
  /*
   * ── P14 M11 ITEM 1 — AND THE DECK EDGE. ──
   * The weather deck met the shell at a right angle too. The cap is pulled in
   * by `HULL_BEVEL.deckEdge` and a band runs down from it to the un-inset
   * plan, so the deck edge is a chamfer of a fixed width the whole way round.
   */
  const deckTopL = hullLevel(DECK_Y + 0.05, 0.90, -HULL_BEVEL.deckEdge);
  const deckLipL = hullLevel(DECK_Y + 0.05 - HULL_BEVEL.deckRise, 0.90);
  loftMesh(house, loftBand([deckLipL, deckTopL]), mats.nonSlip,
    'military:navy:deck-chamfer');
  loftMesh(house, loftCap(deckTopL, 1), mats.nonSlip,
    'military:navy:weather-deck');

  addCyl(root, 0.12, 0.12, 7.4, 6, mats.galvanised, -0.4, 6.4, 0, { name: 'military:navy:mast' });
  addBox(root, 1.85, 0.1, 0.42, mats.galvanised, -0.4, 7.55, 0);
  addSphere(root, 0.48, 8, mats.galvanised, -0.4, 8.15, 0);
  addBox(root, 0.12, 0.85, 0.85, mats.galvanised, 0.05, 7.15, 0);
  // MC3 F7 — mast fittings: an air-search array, a surface-search bar, a lattice
  // yard and two whips. A bare pole with a ball on it is not a warship mast.
  const radar = new THREE.Group();
  radar.name = 'military:navy:radar';
  noPick(radar);
  root.add(radar);
  const array = addBox(radar, 0.16, 1.35, 2.35, mats.galvanised, -0.4, 6.95, 0, {
    name: 'military:navy:radar-array',
  });
  array.rotation.z = 0.16;
  addBox(radar, 0.1, 0.72, 1.15, mats.painted, -0.32, 6.95, 0);
  addBox(radar, 0.12, 0.1, 3.1, mats.galvanised, -0.4, 5.75, 0, {
    name: 'military:navy:radar-bar',
  });
  for (const side of [-1, 1]) {
    addCyl(radar, 0.05, 0.05, 1.5, 5, mats.galvanised, -0.4, 5.05, side * 1.45, { rotZ: side * 0.22 });
    addCyl(radar, 0.04, 0.04, 2.3, 5, mats.galvanised, -1.15, 5.4, side * 0.55, { rotX: side * 0.2 });
  }
  addCyl(radar, 0.3, 0.3, 0.14, 10, mats.galvanised, -0.4, 7.75, 0);
  addCyl(root, 0.55, 0.62, 1.55, 8, mats.painted, -2.2, 4.55, 0);
  addCyl(root, 0.38, 0.48, 0.32, 8, mats.galvanised, -2.2, 5.42, 0);

  addCyl(root, 1.42, 1.42, 0.06, 12, mats.yellow, -10.24, 2.18, 0);
  addToyLetters(root, 'H', mats.letter, -10.52, 2.22, 0.08, { s: 0.42, gap: 0.04, depth: 0.06 });

  const deckNum = addToyLetters(root, WARSHIP_HULL_NUMBER, mats.letter, 0.2, 2.22, 0.85, {
    s: 0.22, gap: 0.04, depth: 0.06,
  });
  deckNum.rotation.x = -Math.PI / 2;
  const num = addToyLetters(root, WARSHIP_HULL_NUMBER, mats.letter, 1.15, 0.72, 3.28, {
    s: 0.28, gap: 0.05, depth: 0.07,
  });
  num.rotation.y = 0;
  const numPort = addToyLetters(root, WARSHIP_HULL_NUMBER, mats.letter, 4.55, 0.72, -3.28, {
    s: 0.28, gap: 0.05, depth: 0.07,
  });
  numPort.rotation.y = Math.PI;

  for (const side of [-1, 1]) {
    addBox(root, 0.12, 1.55, 0.12, mats.galvanised, -6.4, 2.95, side * 3.05);
    addBox(root, 1.15, 0.1, 0.1, mats.galvanised, -5.85, 3.7, side * 3.05);
    addCyl(root, 0.22, 0.22, 1.15, 8, mats.galvanised, -5.35, 3.35, side * 3.05, { rotX: Math.PI / 2 });
    // Deck-edge stanchions and a wire: the galvanised line that separates the
    // painted topside from the non-slip deck along the whole length.
    for (let i = 0; i < 9; i += 1) {
      const x = -9.6 + i * 2.35;
      addBox(root, 0.07, 0.62, 0.07, mats.galvanised, x, DECK_Y + 0.34, side * 3.16);
    }
    addBox(root, 19.2, 0.05, 0.05, mats.galvanised, -0.2, DECK_Y + 0.62, side * 3.16);
    addBox(root, 19.2, 0.04, 0.04, mats.galvanised, -0.2, DECK_Y + 0.42, side * 3.16);
  }

  const dress = {
    root,
    // M11 item 2 — false: the shader owns the wake. Set true on the live
    // object to bring the old decal back for an A/B.
    decalWake: false,
    bowDecal: bowDecal ?? null,
    turret,
    barrel,
    flash,
    flashQuad,
    collar,
    foam,
    water,
    shade,
    wake,
    sternGear,
    mats,
  };
  holder.userData.warshipDressed = true;
  holder.userData.dress = dress;
  bob.userData.dress = dress;
  return dress;
}

/**
 * P14 M10 item 1 — `level` is the object carrying the hull's swell attitude
 * (the `bob` group; pitch on Z, roll on X, and NO yaw of its own). The three
 * water groups hang under it, so they take its heave and, once counter-rotated
 * by the exact inverse of its quaternion, refuse its pitch and roll: foam lies
 * ON the water while the ship works on it. The precondition — no yaw on the
 * levelled object — is what makes a plain inverse correct rather than an
 * approximation, and it is asserted in `p14-military-art`.
 */
export function tickWarshipDress(holder, {
  flashOn = false,
  recoil = 0,
  time = 0,
  reducedMotion = false,
  aimYaw = 0,
  underway = false,
  level = null,
} = {}) {
  const dress = holder?.userData?.dress ?? dressWarship(holder);
  if (!dress) return null;
  if (level) {
    levelWaterGroup(dress.water, level);
    levelWaterGroup(dress.foam, level);
    levelWaterGroup(dress.wake, level);
  }
  // M11 item 2 — the tapering strip stays hidden at every phase; the sea
  // itself carries the wake now. `underway` still gates nothing else, and the
  // argument is kept so the A/B instrument can flip the decal back on.
  if (dress.wake) dress.wake.visible = Boolean(underway) && Boolean(dress.decalWake);
  dress.turret.rotation.y = aimYaw;
  dress.barrel.position.x = 1.15 - recoil * 0.55;
  const on = flashOn && !reducedMotion;
  dress.flash.visible = on;
  dress.flashQuad.visible = on;
  if (on) {
    const pulse = 0.85 + Math.abs(Math.sin(time * 28)) * 0.7;
    dress.flash.scale.setScalar(pulse);
    dress.flash.material.emissiveIntensity = WARSHIP_FLASH_EMISSIVE * pulse;
    dress.flashQuad.scale.setScalar(0.8 + pulse * 0.5);
  }
  const foamPulse = reducedMotion ? 1 : 1 + Math.sin(time * 2.4) * 0.012;
  dress.foam.scale.set(foamPulse, 1, foamPulse);
  return dress;
}

export function isWarshipDressed(holder) {
  return Boolean(holder?.userData?.warshipDressed);
}
