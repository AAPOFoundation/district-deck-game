// P14 M3 — city military units. Presentation only. Deterministic. No storage writes.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCK, PITCH, ROAD, cityExtent, CORRIDOR } from '../../core/grid.js';
import {
  clamp01,
  corridorCentres,
  easeInOutCubic,
  keepLeftOffset,
  polylineLength,
  samplePolyline,
} from '../port/logistics-anim.js';
import { addBox, addCyl, addSphere, noPick } from '../fringe/kit.js';
import { createCityFringeMaterial } from '../materials.js';
function std(color, extra) { return createCityFringeMaterial(color, extra, 'military/units.js'); }
import { createI4FigureGroup } from '../fringe/port.js';
import { chamferBox } from '../fringe/ships.js';
import { MILITARY_SHADOW_FILL, militaryShadowFill } from '../lighting.js';

let panelDemoFeed = null;

export function getMilitaryDemoFeed() {
  return panelDemoFeed;
}

export const TANK_SPEED_MPS = 10;
export const DRONE_SPEED_MPS = 25;
export const DRONE_ALT_M = 12;
export const OFFICER_SPEED_MPS = 2.2;
export const PAD_FLAG_H = 2.6;
export const UNIT_SLOT_SPACING_M = 7.6;
export const PARADE_STANDOFF_M = 2;
export const UNIT_KINDS = Object.freeze(['tank', 'drone', 'officer']);
/*
 * P14 M12 item 2 — one scale ledger for the roster pose.
 *
 * The city already publishes a 3.71 m car and a 1.353 m person.  The military
 * pieces used to ignore both references: the officer was 4.05 m tall and the
 * drone mast topped out above 7 m, which made the otherwise correctly sized
 * 5.35 m tank read as a toy.  These are authored metres, not screen-space
 * compensations; selection rings remain generous because they are controls.
 */
export const MILITARY_SCALE = Object.freeze({
  cityCarLengthM: 3.71,
  cityPersonHeightM: 1.353,
  tankLifeRatio: 0.80,
  tankLengthM: 5.50,
  tankTurretHeightM: 2.30,
  tankBarrelDiameterM: 0.30,
  tankBarrelLengthM: 3.50,
  droneTrailerLengthM: 4.40,
  droneMastHeightM: 3.45,
  officerHeightM: 1.353,
});
/** MC2 F6 — the tank's track box is 0.62 m wide; the print may not exceed it. */
export const TRACK_CONTACT_W = 0.62;
/** MC3 F4 — and 5.05 m long, the track box's own length. */
export const TRACK_CONTACT_L = 5.05;
/** M14: the track band is held off the carriageway kerb by this much. */
export const TANK_KERB_CLEARANCE_M = 0.30;
export const TANK_HALF_WIDTH_M = 1.79;

const PUFF_GEOM = new THREE.CircleGeometry(1, 10);
const PUFF_MAT = new THREE.MeshBasicMaterial({
  color: 0xc4b48a,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  toneMapped: false,
  side: THREE.DoubleSide,
});
const PATROL_RING_INNER = 1.85;
const PATROL_RING_OUTER = 2.35;
/** MC3 F4 — the pad stamp is the ring's own footprint, not a larger disc. */
export const PATROL_PAD_D = PATROL_RING_OUTER * 2;
const SELECT_RING_INNER = 2.28;
const SELECT_RING_OUTER = 2.62;
const OFFICER_RING_OUTER = 1.45;
export const OFFICER_PAD_D = OFFICER_RING_OUTER * 2;
export const GROUND_RING_WIDTH_M = 0.12;
export const GROUND_RING_OUTER_FALLOFF_M = 0.30;
export const GROUND_RING_OPACITY = 0.45;
export const GROUND_RING_COLOR = 0xfff2dc;
const OFFICER_RING_INNER = OFFICER_RING_OUTER - GROUND_RING_WIDTH_M;
const SELECT_RING_CORE_INNER = SELECT_RING_OUTER - GROUND_RING_WIDTH_M;
export const GROUND_RING_FEATHER = 0.055;
/**
 * MC3 F4 — the contact print is a DARKENING OF THE GROUND, not a dark colour
 * painted on top of it. A fixed dark hue is an ink blot on any surface paler
 * than itself, which is what the roster pose actually stands on (a ~190-luma
 * plaza, not asphalt). The stamp is therefore a multiply mask: `floor` at the
 * centre rising to 1.0 (no change) over the outer `feather` of the radius, so
 * the print takes the ground's own hue and can never darken it past `floor`.
 *
 * `feather` is the fraction of the radius the fade occupies — MC3 asked for the
 * alpha to reach zero over the outer 40%.
 */
export const PRINT_FLOOR = 0.70;
export const PRINT_FEATHER = 0.42;
/**
 * M7 item 3 — how far off the deck a contact stamp sits.
 *
 * M6 put the prints at 0.012-0.020 m and proved by A/B that hiding them
 * changed nothing under the tank. That reads as "the print is innocent", and
 * it is, but for a reason M6 did not find: a downward probe under the roster
 * tank returns `ground:road-straight` at y 0.02-0.052, so a stamp at 0.018 is
 * INSIDE the road and the depth test discards it. Above the road, they print.
 */
export const PRINT_LIFT_M = 0.075;
export const DUST_LIFT_M = 0.065;
export const DUST_FLOOR = 0.92;
export function stampFactorAt(r, floor, feather = PRINT_FEATHER) {
  if (r >= 1) return 1;
  const flat = 1 - feather;
  if (r <= flat) return floor;
  const k = (r - flat) / feather;
  const eased = k * k * (3 - 2 * k);
  return floor + ((1 - floor) * eased);
}
/* ------------------------------------------------------------------ *
 * P14 M10 item 4 — THE GROUND DECALS WERE NEAREST-FILTERED WITH NO MIPS.
 *
 * MC5 pack-a: "ground/water mip-filter into undifferentiated soup with no PBR
 * response". Half of that is a filtering setting and it is measurable:
 * `THREE.DataTexture` defaults to `NearestFilter` for BOTH the min and the mag
 * filter and `generateMipmaps = false` — three's own documented default, not
 * something anyone chose here. Every contact stamp, dust ring, hard-contact
 * patch and shadow-fill mask in this file was built that way, so a 64 px mask
 * stretched over a 5 m track print is magnified with no interpolation (blocky
 * where it is near) and minified with no mip chain (aliasing into noise where
 * it is far), and the raid pose has both at once.
 *
 * `groundStamp` is the one place that says what a ground decal's sampler is:
 * trilinear down the mip chain, linear on magnification, mips generated, and
 * anisotropy asked for at 16 — three clamps that to the device maximum at
 * upload (`WebGLTextures.setTextureParameters`), which this machine reports as
 * 16, so no capability probe is needed at build time.
 * ------------------------------------------------------------------ */
/** Anisotropy requested for every ground decal. Clamped to the device max. */
export const DECAL_ANISOTROPY = 16;
export function groundStamp(tex) {
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = DECAL_ANISOTROPY;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
export function makeMultiplyStamp(size, floorRgb, feather = PRINT_FEATHER) {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) * 0.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const r = Math.hypot(dx, dy);
      const i = (y * size + x) * 4;
      for (let ch = 0; ch < 3; ch += 1) {
        data[i + ch] = Math.round(255 * stampFactorAt(r, floorRgb[ch], feather));
      }
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return groundStamp(tex);
}

// MC3 F4 — a damp track print reads slightly cooler than the ground it is on,
// so the blue channel is darkened least. Board asphalt is `road-asphalt-r5-worn`
// #31353a; on that surface these factors land the print inside the asphalt's own
// hue family, and on pale concrete they land it as a shadowed band of concrete.
const TRACK_MULT = Object.freeze([PRINT_FLOOR, PRINT_FLOOR + 0.015, PRINT_FLOOR + 0.045]);
const DUST_MULT = Object.freeze([DUST_FLOOR, DUST_FLOOR + 0.01, DUST_FLOOR + 0.02]);
const TRACK_STAMP = makeMultiplyStamp(64, TRACK_MULT);
const DUST_STAMP = makeMultiplyStamp(64, DUST_MULT, 0.55);
const PRINT_GEOM = new THREE.PlaneGeometry(1, 1);
/** Above the road, below the rings (5) and the selection ring (6). */
export const PRINT_RENDER_ORDER = 4;
// `premultipliedAlpha` is required for MultiplyBlending — without it three
// warns and the blend factors are wrong on the alpha channel.
const PRINT_MAT = new THREE.MeshBasicMaterial({
  map: TRACK_STAMP,
  transparent: true,
  opacity: 1,
  blending: THREE.MultiplyBlending,
  premultipliedAlpha: true,
  depthWrite: false,
  depthTest: true,
  toneMapped: false,
  side: THREE.DoubleSide,
});
const DUST_MAT = new THREE.MeshBasicMaterial({
  map: DUST_STAMP,
  transparent: true,
  opacity: 1,
  blending: THREE.MultiplyBlending,
  premultipliedAlpha: true,
  depthWrite: false,
  depthTest: true,
  toneMapped: false,
  side: THREE.DoubleSide,
});
/**
 * MC3 F4 — a flat contact quad must never cast. It has no thickness, so its
 * shadow is a hard black slab the size of the quad, which is exactly the ink
 * blot the audit measured. The per-unit `traverse` at the end of each builder
 * used to switch `castShadow` back on for every mesh; contact meshes are tagged
 * so that sweep skips them.
 */
function markContact(mesh, order = PRINT_RENDER_ORDER) {
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = order;
  mesh.userData.contactStamp = true;
  noPick(mesh);
  return mesh;
}
/**
 * A grounded contact patch any military module can put under a figure or a
 * prop: the same multiply mask as the tank prints, so a crowd of workers reads
 * as standing ON the slip rather than hovering over it.
 */
export function makeContactPatch(diameter = 1.1, name = null, opts = {}) {
  const mesh = new THREE.Mesh(PRINT_GEOM, opts.hard ? HARD_CONTACT_MAT : DUST_MAT);
  if (name) mesh.name = name;
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(diameter, opts.depth ?? diameter, 1);
  return markContact(mesh, PRINT_RENDER_ORDER - 1);
}
/* ------------------------------------------------------------------ *
 * P14 M9 item 2/4 — CONTACT DARKENING THAT IS ACTUALLY A DARKENING.
 *
 * `DUST_FLOOR` is 0.92: an eight-per-cent multiply, which is right for the dust
 * ring a walking figure kicks up and is nothing at all as the contact under a
 * mass. MC4's pack-k ("unshadowed fill light with no AO, contact") and pack-c
 * ("ambient-flat lighting with no contact shadows") are both asking for the
 * near-field occlusion a solid standing on a surface produces, which on a
 * 190-luma apron is a third of the value, not a twelfth.
 *
 * Same multiply-mask construction as the track prints, so it can never darken
 * the ground past its floor and it takes the surface's own hue: 0.62 at the
 * centre, cool-biased (blue darkened least), feathering to no change over the
 * outer 46 % of the radius.
 * ------------------------------------------------------------------ */
export const HARD_CONTACT_FLOOR = 0.62;
export const HARD_CONTACT_FEATHER = 0.46;
const HARD_CONTACT_MULT = Object.freeze([
  HARD_CONTACT_FLOOR, HARD_CONTACT_FLOOR + 0.02, HARD_CONTACT_FLOOR + 0.055,
]);
const HARD_CONTACT_STAMP = makeMultiplyStamp(64, HARD_CONTACT_MULT, HARD_CONTACT_FEATHER);
const HARD_CONTACT_MAT = new THREE.MeshBasicMaterial({
  map: HARD_CONTACT_STAMP,
  transparent: true,
  opacity: 1,
  blending: THREE.MultiplyBlending,
  premultipliedAlpha: true,
  depthWrite: false,
  depthTest: true,
  toneMapped: false,
  side: THREE.DoubleSide,
});

/** Soft annulus coverage at normalised radius `r`; zero on both hard edges. */
export function groundRingAlphaAt(r, innerRatio, feather = GROUND_RING_FEATHER) {
  const smooth = (a, b, value) => {
    const k = clamp01((value - a) / Math.max(1e-6, b - a));
    return k * k * (3 - 2 * k);
  };
  const inner = smooth(innerRatio - feather, innerRatio + feather, r);
  const outer = 1 - smooth(1 - feather, 1, r);
  return clamp01(inner * outer);
}

function groundRingTextures(innerRatio, size = 96) {
  const alphaData = new Uint8Array(size * size * 4);
  const shadowData = new Uint8Array(size * size * 4);
  const c = (size - 1) * 0.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const r = Math.hypot((x - c) / c, (y - c) / c);
      const a = groundRingAlphaAt(r, innerRatio);
      const alpha = Math.round(a * 255);
      const shade = Math.round(255 * (1 - a * 0.22));
      const i = (y * size + x) * 4;
      alphaData[i] = alpha;
      alphaData[i + 1] = alpha;
      alphaData[i + 2] = alpha;
      alphaData[i + 3] = 255;
      shadowData[i] = shade;
      shadowData[i + 1] = shade;
      shadowData[i + 2] = shade;
      shadowData[i + 3] = 255;
    }
  }
  const alpha = new THREE.DataTexture(alphaData, size, size);
  alpha.colorSpace = THREE.NoColorSpace;
  groundStamp(alpha);
  const shadow = new THREE.DataTexture(shadowData, size, size);
  shadow.colorSpace = THREE.SRGBColorSpace;
  groundStamp(shadow);
  return { alpha, shadow };
}

/** M14: a 0.12 m ink line with a physical 0.30 m falloff, in metres. */
export function subtleRingAlphaAt(radiusM, innerM, outerM,
  falloffM = GROUND_RING_OUTER_FALLOFF_M) {
  const smooth = (a, b, value) => {
    const k = clamp01((value - a) / Math.max(1e-6, b - a));
    return k * k * (3 - 2 * k);
  };
  const innerFeather = Math.min(GROUND_RING_WIDTH_M * 0.34, innerM * 0.08);
  const rise = smooth(innerM - innerFeather, innerM + innerFeather, radiusM);
  const fall = 1 - smooth(outerM, outerM + falloffM, radiusM);
  return clamp01(rise * fall);
}

function subtleRingTextures(innerM, outerM, size = 128) {
  const radiusM = outerM + GROUND_RING_OUTER_FALLOFF_M;
  const alphaData = new Uint8Array(size * size * 4);
  const shadowData = new Uint8Array(size * size * 4);
  const c = (size - 1) * 0.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const r = Math.hypot((x - c) / c, (y - c) / c) * radiusM;
      const a = subtleRingAlphaAt(r, innerM, outerM);
      const inside = 1 - clamp01((r - Math.max(0, innerM - 0.30)) / 0.30);
      const shade = Math.round(255 * (1 - inside * 0.10));
      const i = (y * size + x) * 4;
      alphaData[i] = Math.round(a * 255);
      alphaData[i + 1] = alphaData[i];
      alphaData[i + 2] = alphaData[i];
      alphaData[i + 3] = 255;
      shadowData[i] = shade;
      shadowData[i + 1] = shade;
      shadowData[i + 2] = shade;
      shadowData[i + 3] = 255;
    }
  }
  const alpha = groundStamp(new THREE.DataTexture(alphaData, size, size));
  alpha.colorSpace = THREE.NoColorSpace;
  const shadow = groundStamp(new THREE.DataTexture(shadowData, size, size));
  shadow.colorSpace = THREE.SRGBColorSpace;
  return { alpha, shadow, radiusM };
}

const SELECT_RING_TEX = subtleRingTextures(SELECT_RING_CORE_INNER, SELECT_RING_OUTER);
const PATROL_RING_TEX = subtleRingTextures(PATROL_RING_INNER, PATROL_RING_OUTER);
const OFFICER_RING_TEX = subtleRingTextures(OFFICER_RING_INNER, OFFICER_RING_OUTER);
const GROUND_RING_GEOM = new THREE.PlaneGeometry(1, 1);

/** A lit, feathered ground decal plus its multiply-blended contact shadow. */
export function makeGroundRing(name, inner, outer, color, opacity = GROUND_RING_OPACITY) {
  const textures = (inner === SELECT_RING_INNER || inner === SELECT_RING_CORE_INNER)
      && outer === SELECT_RING_OUTER
    ? SELECT_RING_TEX
    : inner === PATROL_RING_INNER && outer === PATROL_RING_OUTER
      ? PATROL_RING_TEX
      : OFFICER_RING_TEX;
  const g = new THREE.Group();
  g.name = name;
  g.userData.militaryHudMark = true;
  const shadow = new THREE.Mesh(GROUND_RING_GEOM, new THREE.MeshBasicMaterial({
    map: textures.shadow,
    transparent: true,
    opacity: 1,
    blending: THREE.MultiplyBlending,
    premultipliedAlpha: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    side: THREE.DoubleSide,
  }));
  shadow.name = `${name}:shadow`;
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = PRINT_LIFT_M - 0.006;
  shadow.scale.set(textures.radiusM * 2, textures.radiusM * 2, 1);
  markContact(shadow, PRINT_RENDER_ORDER);
  const decal = new THREE.Mesh(GROUND_RING_GEOM, new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.04,
    emissive: new THREE.Color(color).multiplyScalar(0.16),
    emissiveIntensity: 0.18,
    alphaMap: textures.alpha,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  decal.name = `${name}:decal`;
  decal.rotation.x = -Math.PI / 2;
  decal.position.y = PRINT_LIFT_M;
  decal.scale.set(textures.radiusM * 2, textures.radiusM * 2, 1);
  decal.renderOrder = 6;
  decal.castShadow = false;
  decal.receiveShadow = true;
  noPick(decal);
  g.userData.decal = decal;
  g.userData.shadow = shadow;
  g.userData.ringSpec = {
    widthM: outer - inner,
    outerFalloffM: GROUND_RING_OUTER_FALLOFF_M,
    opacity,
    color: new THREE.Color(color).getHex(),
  };
  g.add(shadow, decal);
  noPick(g);
  return g;
}

/* ================================================================== *
 * P14 M9 item 3 — THE WATER UNDER A MILITARY HULL.
 *
 * MC4 pack-a: "hulls float on painted foam with no displacement, refraction,
 * or contact". P16-PM5A settled the same veto for the port's own craft and the
 * finding is general, so the four primitives it turns on are re-stated here
 * rather than re-derived: `port.js` keeps them private, and this lane may not
 * write that file.
 *
 *   THE RIM IS THE HULL'S OWN PLAN. `hullPlanFootprint` is pointed at the bow
 *   and rounded at the quarters on the hull's yaw, so no straight run longer
 *   than one plan segment exists anywhere on a collar and there is no corner
 *   for the eye to find.
 *   THE OUTER RIM CARRIES NO VALUE. On an additive material a black vertex
 *   adds nothing and on a multiply material a white vertex multiplies by one,
 *   so in both cases the feather IS the geometry. It costs nothing, it cannot
 *   band, and there is no outer edge to see.
 *   THE FOAM IS BROKEN. Two gap fields at incommensurate rates with a real
 *   zero floor leave about a third of the rim empty, so it can never weld into
 *   the painted white line.
 *   NOTHING IS A RECTANGLE. The census at the end of the M9 report is over
 *   four-vertex quads and low boxes under the military groups, and it is zero.
 * ================================================================== */
/** Rounded-rectangle footprint: a hull plan, not a box, in nine points. */
export function hullPlanFootprint(cx, cz, len, beam, yaw, bow = 0.34) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const hl = len * 0.5;
  const hb = beam * 0.5;
  const local = [
    [hl, 0], [hl * (1 - bow * 0.5), hb * 0.82], [hl * 0.42, hb],
    [-hl * 0.72, hb], [-hl, hb * 0.66], [-hl, -hb * 0.66],
    [-hl * 0.72, -hb], [hl * 0.42, -hb], [hl * (1 - bow * 0.5), -hb * 0.82],
  ];
  // A group's rotation.y = t maps local (1,0,0) to (cos t, 0, -sin t).
  return local.map(([lx, lz]) => [cx + lx * c + lz * s, cz - lx * s + lz * c]);
}
/** Convex polygon offset outward by `d`, mitred. Winding-agnostic. */
export function offsetPolyOutward(poly, d) {
  const n = poly.length;
  const out = [];
  let area2 = 0;
  for (let i = 0; i < n; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    area2 += a[0] * b[1] - b[0] * a[1];
  }
  const w = area2 >= 0 ? 1 : -1;
  for (let i = 0; i < n; i += 1) {
    const prev = poly[(i - 1 + n) % n];
    const cur = poly[i];
    const next = poly[(i + 1) % n];
    const e1x = cur[0] - prev[0];
    const e1z = cur[1] - prev[1];
    const e2x = next[0] - cur[0];
    const e2z = next[1] - cur[1];
    const l1 = Math.hypot(e1x, e1z) || 1;
    const l2 = Math.hypot(e2x, e2z) || 1;
    const n1x = (e1z / l1) * w;
    const n1z = (-e1x / l1) * w;
    const n2x = (e2z / l2) * w;
    const n2z = (-e2x / l2) * w;
    let mx = n1x + n2x;
    let mz = n1z + n2z;
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) { mx = n2x; mz = n2z; } else { mx /= ml; mz /= ml; }
    const cosHalf = Math.max(0.34, mx * n2x + mz * n2z);
    out.push([cur[0] + (mx * d) / cosHalf, cur[1] + (mz * d) / cosHalf]);
  }
  return out;
}
/** Drop a vertex every `step` metres round a closed polygon. Corners kept. */
export function resampleClosedPoly(poly, step) {
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.round(d / step));
    for (let j = 0; j < k; j += 1) {
      const t = j / k;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
/**
 * The broken-foam gap field. Pure, seeded, no RNG — two incommensurate
 * sinusoids in the perimeter parameter, each with a real zero floor, so their
 * product is zero over roughly a third of the rim.
 */
export function foamGapAt(u, seed = 3) {
  const gapA = Math.sin(u * Math.PI * 2 * 5.0 + seed * 1.7);
  const gapB = Math.sin(u * Math.PI * 2 * 2.3 + seed * 0.6);
  const b = Math.max(0, 0.44 + gapA * 0.56) * Math.max(0, 0.48 + gapB * 0.52);
  return Math.min(1, b * 1.6);
}
/** Additive, vertex-coloured foam. Black vertices add nothing: free feather. */
const WATER_FOAM_MAT = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  depthTest: true,
  toneMapped: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
});
/**
 * Multiply-blended, vertex-coloured shade. White vertices multiply by one, so
 * the penumbra is free. `premultipliedAlpha` is NOT optional — three refuses
 * `MultiplyBlending` without it, sets no blend func at all, and the decal then
 * paints as an opaque plate (the failure `port.js` records at its own
 * `waterShadowMat`).
 */
const WATER_SHADE_MAT = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  depthTest: true,
  toneMapped: false,
  side: THREE.DoubleSide,
  premultipliedAlpha: true,
  blending: THREE.MultiplyBlending,
});
export function waterFoamMaterial() { return WATER_FOAM_MAT; }
export function waterShadeMaterial() { return WATER_SHADE_MAT; }
/** One triangle-strip ring between two matched rims, vertex-coloured per rim. */
export function planRingMesh(inner, outer, colIn, colOut, y, mat, order = 5) {
  const n = inner.length;
  const verts = new Float32Array(n * 2 * 3);
  const cols = new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i += 1) {
    const a = inner[i];
    const b = outer[i];
    verts[i * 6] = a[0];
    verts[i * 6 + 1] = typeof y === 'function' ? y(a[0], a[1]) : y;
    verts[i * 6 + 2] = a[1];
    verts[i * 6 + 3] = b[0];
    verts[i * 6 + 4] = typeof y === 'function' ? y(b[0], b[1]) : y;
    verts[i * 6 + 5] = b[1];
    const ci = colIn(i);
    const co = colOut(i);
    cols[i * 6] = ci[0];
    cols[i * 6 + 1] = ci[1];
    cols[i * 6 + 2] = ci[2];
    cols[i * 6 + 3] = co[0];
    cols[i * 6 + 4] = co[1];
    cols[i * 6 + 5] = co[2];
  }
  const idx = [];
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    idx.push(i * 2, i * 2 + 1, j * 2 + 1);
    idx.push(i * 2, j * 2 + 1, j * 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = order;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.userData.ownsGeometry = true;
  mesh.userData.contactStamp = true;
  noPick(mesh);
  return mesh;
}
/** Renders above the ocean sheet, under the unit rings. */
export const WATER_DECAL_ORDER = Object.freeze({ shade: 5, collar: 6, foam: 7 });
/**
 * PM5A's `planRing`: one broken, feathered foam collar on the hull's own plan.
 * `y` may be a number or a function of (x, z) so a caller with a live swell
 * mirror can ride it.
 */
export function addPlanCollar(parent, {
  x = 0, z = 0, yaw = 0, len = 10, beam = 3, y = 0.02,
  hug = 0.24, width = 0.8, step = 1.4, amp = 0.34, seed = 3, bow = 0.34,
  name = null, order = WATER_DECAL_ORDER.foam, rim: rimIn = null,
} = {}) {
  // `rim` lets a caller hand in its own lines plan — the warship's `HULL_PLAN`
  // is a real table of half-breadths and beats any generated rounded rectangle.
  const plan = rimIn ?? hullPlanFootprint(x, z, len, beam, yaw, bow);
  const rim = resampleClosedPoly(rimIn ? plan : offsetPolyOutward(plan, hug), step);
  const n = rim.length;
  if (n < 3) return null;
  const out = offsetPolyOutward(rim, width);
  const mesh = planRingMesh(
    rim, out,
    (i) => {
      const v = amp * foamGapAt(i / n, seed);
      return [v, v * 1.02, v * 1.04];
    },
    () => [0, 0, 0],
    y, WATER_FOAM_MAT, order,
  );
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}
/** The tint a hull's wetted band multiplies the water by. Cool, not neutral. */
export const HULL_SHADE_TINT = Object.freeze([0.62, 0.71, 0.82]);
/**
 * The hull-shaped soft shadow: two rings on the plan, the first holding the
 * tint for `hold` of the width and the second ramping it to white. A single
 * rim-to-outer ramp puts full strength on ONE line of vertices, which is the
 * mistake PM5A measured and corrected — the dark has to HOLD before it lets go
 * or the band the waterline receipt walks is already three quarters spent.
 */
export function addPlanShade(parent, {
  x = 0, z = 0, yaw = 0, len = 10, beam = 3, y = 0.02,
  hug = 0.02, width = null, hold = 0.42, step = 1.4, seed = 7, bow = 0.34,
  tint = HULL_SHADE_TINT, name = null, order = WATER_DECAL_ORDER.shade,
  rim: rimIn = null,
} = {}) {
  const plan = rimIn ?? hullPlanFootprint(x, z, len, beam, yaw, bow);
  const rim = resampleClosedPoly(rimIn ? plan : offsetPolyOutward(plan, hug), step);
  const n = rim.length;
  if (n < 3) return null;
  const w = width ?? Math.min(6.0, Math.max(1.3, beam * 0.55));
  const held = offsetPolyOutward(rim, w * hold);
  const out = offsetPolyOutward(rim, w);
  const g = new THREE.Group();
  if (name) g.name = name;
  g.userData.contactStamp = true;
  noPick(g);
  // The inner rim is not one value: the topside shades its own wetted band and
  // the sun gets under the flare on the far side, so the tint walks with a
  // two-period term along the perimeter — a gradient, not a pattern.
  const tintAt = (i) => {
    const m = 0.90 + 0.10 * Math.cos((i / n) * Math.PI * 4 + seed);
    return [tint[0] * m, tint[1] * m, tint[2] * m];
  };
  g.add(planRingMesh(rim, held, tintAt, tintAt, y, WATER_SHADE_MAT, order));
  g.add(planRingMesh(held, out, tintAt, () => [1, 1, 1], y, WATER_SHADE_MAT, order));
  parent.add(g);
  return g;
}
/**
 * The bow wave. It STARTS AT THE STEM and fades, which is the half a foam
 * rectangle can never do: a ring is symmetric, so the wave is built as its own
 * open strip — two rows of stations running aft from the stem down each side,
 * the inboard row on the plan carrying value and the outboard row at black, so
 * the crest dies out both across the wave and along it.
 *
 * `spread` is how far outboard the wave has reached by the transom, `fade` the
 * power the crest falls off with along the run.
 */
export function addBowWave(parent, {
  x = 0, z = 0, yaw = 0, len = 10, beam = 3, y = 0.024,
  spread = null, amp = 0.42, run = 0.78, stations = 9, seed = 5,
  name = null, order = WATER_DECAL_ORDER.collar,
} = {}) {
  const hl = len * 0.5;
  const hb = beam * 0.5;
  const sp = spread ?? Math.max(0.6, beam * 0.42);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const toWorld = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const inner = [];
  const outer = [];
  const vals = [];
  // Starboard side from the stem aft, then port side forward again, so the
  // strip is one closed loop with the stem at both ends of the crest.
  for (const side of [1, -1]) {
    for (let i = 0; i < stations; i += 1) {
      const u = i / (stations - 1);
      // Along the hull from the stem aft by `run` of the length.
      const lx = hl - u * len * run;
      // The hull's own half-beam falls away at the stem, so the wave leaves the
      // stem at nothing and opens out over the forward third.
      const hbLocal = hb * Math.min(1, 0.18 + u * 2.4);
      const openness = Math.min(1, u * 3.2);
      const io = hbLocal;
      const oo = hbLocal + sp * openness;
      const a = toWorld(lx, side * io);
      const b = toWorld(lx, side * oo);
      const crest = amp * Math.pow(1 - u, 1.6) * (0.72 + 0.28 * foamGapAt(u * 0.5, seed + side));
      if (side > 0) { inner.push(a); outer.push(b); vals.push(crest); } else {
        inner.unshift(a); outer.unshift(b); vals.unshift(crest);
      }
    }
  }
  const n = inner.length;
  if (n < 4) return null;
  const mesh = planRingMesh(
    inner, outer,
    (i) => {
      const v = vals[i];
      return [v, v * 1.02, v * 1.05];
    },
    () => [0, 0, 0],
    y, WATER_FOAM_MAT, order,
  );
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}
/**
 * A stern wake that dies out: a tapering closed strip running aft from the
 * transom, the centreline row carrying value and the two flanks at black.
 * Replaces the seven stacked `PlaneGeometry` strips `addDepartWake` lays,
 * which are the straight-edged decals PM5A's census found on the pilot boat.
 */
export function addSternWake(parent, {
  x = 0, z = 0, yaw = 0, len = 26, beam = 6, y = 0.022,
  amp = 0.34, stations = 10, seed = 9, name = null,
  order = WATER_DECAL_ORDER.collar,
} = {}) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const toWorld = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const inner = [];
  const outer = [];
  const vals = [];
  for (const side of [1, -1]) {
    for (let i = 0; i < stations; i += 1) {
      const u = i / (stations - 1);
      const lx = -u * len;
      const half = beam * (0.28 + u * 0.72);
      const a = toWorld(lx, side * half * 0.34);
      const b = toWorld(lx, side * half);
      const v = amp * Math.pow(1 - u, 1.35) * (0.6 + 0.4 * foamGapAt(u * 0.7, seed + side));
      if (side > 0) { inner.push(a); outer.push(b); vals.push(v); } else {
        inner.unshift(a); outer.unshift(b); vals.unshift(v);
      }
    }
  }
  const n = inner.length;
  if (n < 4) return null;
  const mesh = planRingMesh(
    inner, outer,
    (i) => {
      const v = vals[i];
      return [v, v * 1.02, v * 1.05];
    },
    () => [0, 0, 0],
    y, WATER_FOAM_MAT, order,
  );
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}
/**
 * Every water decal a hull needs, in one call: the plan shade under it, the
 * broken collar on the plating, the bow wave off the stem. Returned as a group
 * so a caller can scale it with speed the way `_setCollarSpeed` does.
 */
export function dressHullWater(parent, opts = {}) {
  const g = new THREE.Group();
  if (opts.name) g.name = opts.name;
  g.userData.contactStamp = true;
  noPick(g);
  const shade = addPlanShade(g, { ...opts, name: opts.name ? `${opts.name}:shade` : null });
  const collar = addPlanCollar(g, { ...opts, name: opts.name ? `${opts.name}:collar` : null });
  const wave = opts.wave === false ? null
    : addBowWave(g, { ...opts, name: opts.name ? `${opts.name}:bow-wave` : null });
  parent.add(g);
  g.userData.parts = { shade, collar, wave };
  return g;
}
/* ================================================================== *
 * P14 M10 item 1 — A HULL RIDES THE DRAWN SEA.
 *
 * MC5 pack-j: "hull clips straight through the swell with zero displacement,
 * wake, or spray". The measurement behind it (`shots-v56/M10-probe.json` Q1) is
 * arithmetic and it settles both halves of the sentence:
 *
 *   `fringe:ship:warship-a` sits at world y **-0.0549** at the seafight, so its
 *     waterline datum (local `WATER_Y`) lands at **-0.0349** while the drawn sea
 *     under it is at **+0.072** — the hull is **10.7 cm UNDER** the surface, and
 *     the collar, plan shade, bow wave and stern wake it carries at
 *     `WATER_Y + 0.004 .. 0.016` are all BELOW `nature:water:ocean` (y 0.02) and
 *     `nature:water:beach-foam` (y 0.038) and are depth-tested away. That is
 *     "zero wake or spray": the wake exists and is drawn under the sea.
 *   each skiff sits at a hand-authored y **0.22 + sin(t)*0.1** and carries its
 *     water decals at local y **0.028-0.042**, i.e. world **0.248-0.262** —
 *     **0.23 m of daylight** over the sheet, about 5 px at the seafight pose.
 *     That is "floats on painted foam".
 *
 * There is a sampler for the drawn surface and it is not `water/waves.js`:
 * `outer-ocean.js: oceanSurfaceYAt(x, z, t, city, plan)` evaluates the SAME
 * `BAY_SWELL` stack, the same depth limit and the same sheltered-harbour
 * envelope the vertex program does, on the same `elapsed` clock the ocean
 * material is handed. `fringe/apostles.js` already rides it; these are the same
 * primitives, restated here because that file is another lane's and this one
 * may not write it, and because a military hull's path is a function of the
 * LAYER's clock while the sea is a function of the RENDER clock, so the bake
 * apostles uses does not apply.
 *
 * The gradient arm is 6 m — apostles' `SEA_PROBE`, and the right order for a
 * 72 m / 32 m / 14 m swell stack: short enough to be local to the hull, long
 * enough not to differentiate the 14 m component into noise.
 * ================================================================== */
export const SEA_RIDE = Object.freeze({
  /** Finite-difference arm for the surface gradient, metres. */
  probeM: 6,
  /** Low-pass time constants. Heave is quicker than attitude: a hull answers a
   *  wave with its buoyancy before it answers with its moment of inertia. */
  tauHeave: 0.28,
  /*
   * 0.44 was apostles' own feel constant and it is too slow HERE, because a
   * military hull is choreographed: the departure leg accelerates, and a
   * first-order lead cancels a constant rate but not an accelerating one. With
   * the lead in and the chord attitude in, the burst's worst navy row was still
   * 0.172 m at the stem against -0.132 at the transom in the fast part of the
   * departure — anti-symmetric, so a pitch residual — and inside 0.07 m the
   * moment the hull settled. At 0.30 the residual roughly halves and a 28 m
   * hull's trim still takes a third of a second to answer a wave.
   */
  tauAttitude: 0.30,
  /*
   * Attitude limits. These are GUARDS against a bad sample, not a shape, and
   * the first pair was neither: at 0.16 rad the burst clamped every skiff.
   * A 6.4 m skiff on a stack whose shortest component is 14 m long and whose
   * amplitude reaches 1.4 m sees chord slopes far past that, and the clamp
   * showed up as a standing anti-symmetric residual — skiff 1 at +0.52 m at the
   * bow against -0.50 at the stern, which is atan(1.02 / 6.4) = 0.157 rad, the
   * clamp itself. A 28 m warship never approaches these; a small craft does,
   * and it is right that it does.
   */
  pitchMax: 0.42,
  rollMax: 0.46,
  /** Caps on the rate feed-forward: metres for the heave, radians for the
   *  attitude. Guards against a pathological `dt`. */
  leadMax: 0.6,
  leadMaxRad: 0.12,
});
/**
 * Surface height and both horizontal gradients at a world point, from three
 * calls to the sampler. `sampler(x, z)` returns metres.
 */
export function seaFrameAt(sampler, x, z, out = { h: 0, gx: 0, gz: 0 }) {
  const d = SEA_RIDE.probeM;
  const h = sampler(x, z);
  out.h = h;
  out.gx = (sampler(x + d, z) - h) / d;
  out.gz = (sampler(x, z + d) - h) / d;
  return out;
}
/**
 * One low-pass step. `dt <= 0` HOLDS rather than snapping, because a frozen
 * re-render (the A/B harness steps `v.step(0, t)`) must reproduce the pose the
 * live frame had, not jump to the instantaneous target.
 */
export function lowPassTo(prev, target, dt, tau) {
  if (!Number.isFinite(prev)) return target;
  if (!(dt > 0) || !(tau > 0)) return prev;
  const a = 1 - Math.exp(-dt / tau);
  return prev + (target - prev) * a;
}
/**
 * The surface gradient rotated into a hull's own frame. A hull built bow-to-+X
 * and yawed by `yaw` has forward `(cos yaw, -sin yaw)` in world XZ; a surface
 * rising ahead lifts the bow, which on this rig is a positive rotation about
 * +Z, and a surface rising to port drops the boat to starboard.
 */
export function seaAttitude(gx, gz, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const gFwd = gx * c - gz * s;
  const gLat = gx * s + gz * c;
  return {
    pitch: Math.max(-SEA_RIDE.pitchMax, Math.min(SEA_RIDE.pitchMax, Math.atan(gFwd))),
    roll: Math.max(-SEA_RIDE.rollMax, Math.min(SEA_RIDE.rollMax, -Math.atan(gLat))),
  };
}
/**
 * -- A HULL LIES ON THE CHORD THROUGH ITS OWN ENDS, NOT ON A LOCAL TANGENT. --
 *
 * The first cut took the attitude from `seaFrameAt`: a 6 m finite difference at
 * the hull's centre. On a stack whose shortest component is 14 m long that is a
 * local TANGENT, and a 28 m hull spans two of those, so the slope amidships
 * says nothing about where the ends are. Measured on the burst, with the
 * warship out past the harbour envelope: `pitch` returned 0.0000 while the
 * drawn sea at the stem was **1.11 m** below the hull's own waterline there and
 * the transom was within 0.01 m -- a 28 m ship reading flat across a wave it
 * was sitting on top of.
 *
 * The chord is both the correct physics (a hull BRIDGES the water it spans, so
 * its trim is set by where its ends float rather than by the slope amidships)
 * and the thing the receipt measures. With `h` the mean of the two end samples
 * and the pitch the chord slope between them, the waterline at bow and stern
 * equals the sampled sea there identically to first order -- the residual is
 * the low pass's own lag and nothing else.
 *
 * Four samples per hull instead of three, so the cost is unchanged in order:
 * 4 x 4.0 us = 16 us per hull per frame.
 */
export function seaHullFrame(sampler, x, z, yaw, halfLen, halfBeam, out = {}) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // A group's rotation.y = yaw maps local +X to (cos yaw, 0, -sin yaw).
  const fx = c;
  const fz = -s;
  const lx = s;
  const lz = c;
  const bow = sampler(x + fx * halfLen, z + fz * halfLen);
  const stern = sampler(x - fx * halfLen, z - fz * halfLen);
  const port = sampler(x + lx * halfBeam, z + lz * halfBeam);
  const stbd = sampler(x - lx * halfBeam, z - lz * halfBeam);
  const pitchSlope = (bow - stern) / (2 * Math.max(0.5, halfLen));
  const rollSlope = (port - stbd) / (2 * Math.max(0.3, halfBeam));
  out.h = (bow + stern) * 0.5;
  out.bow = bow;
  out.stern = stern;
  out.pitch = Math.max(-SEA_RIDE.pitchMax,
    Math.min(SEA_RIDE.pitchMax, Math.atan(pitchSlope)));
  out.roll = Math.max(-SEA_RIDE.rollMax,
    Math.min(SEA_RIDE.rollMax, -Math.atan(rollSlope)));
  return out;
}
/**
 * Per-hull ride state. `heave` is the world Y the hull's WATERLINE DATUM should
 * sit at — not an offset — so a caller never has to know where the sea is
 * twice. Under `reducedMotion` the target is the mean sea (`meanY`) with no
 * attitude at all, and the state snaps to it: the brief's "the hulls sit at the
 * mean sea when set".
 */
export class HullRide {
  constructor() {
    this.y = NaN;
    this.pitch = NaN;
    this.roll = NaN;
    this.lastH = NaN;
    this.lastPitch = NaN;
    this.lastRoll = NaN;
    this.lead = 0;
  }

  /*
   * ── WHY THE HEAVE CARRIES A RATE FEED-FORWARD. ──
   *
   * A plain first-order lag has a STANDING error against a ramp of `rate * tau`,
   * and the sea under a military hull is a ramp: the departure leg carries the
   * warship out of the harbour envelope, where `harbourSwellScaleAt` opens from
   * 0.06 to 1.0, so the drawn surface under it rises and falls by 0.86 m over
   * two seconds — measured, at up to 1.4 m/s. At tau 0.28 that is a 0.39 m lag,
   * and the first burst measured exactly that: the waterline sat 0.59 m off the
   * sea while the hull was making way and inside 0.02 m once it stopped.
   *
   * Adding `dH/dt * tau` to the target cancels the ramp error identically (it
   * is the standard type-1 correction), while a STEP is still smoothed on tau —
   * so the hull follows the water it is crossing exactly and still answers a
   * wave with mass rather than with a snap. The lead is clamped so a
   * pathological `dt` cannot throw the hull.
   */
  step({
    h = 0, gx = 0, gz = 0, yaw = 0, pitch = null, roll = null,
    dt = 0, reduced = false, meanY = 0,
  } = {}) {
    if (reduced) {
      this.y = meanY;
      this.pitch = 0;
      this.roll = 0;
      this.lastH = h;
      this.lastPitch = NaN;
      this.lastRoll = NaN;
      this.lead = 0;
      return this;
    }
    // `pitch` / `roll` given: the caller measured the chord through the hull's
    // own ends (`seaHullFrame`). Otherwise fall back to the local gradient.
    const att = (pitch == null || roll == null)
      ? seaAttitude(gx, gz, yaw)
      : { pitch, roll };
    let lead = 0;
    if (dt > 0 && Number.isFinite(this.lastH)) {
      const rate = (h - this.lastH) / dt;
      lead = Math.max(-SEA_RIDE.leadMax, Math.min(SEA_RIDE.leadMax, rate * SEA_RIDE.tauHeave));
    }
    this.lead = lead;
    this.y = lowPassTo(this.y, h + lead, dt, SEA_RIDE.tauHeave);
    /*
     * THE ATTITUDE CARRIES THE SAME CORRECTION, AND FOR THE SAME REASON. With
     * the heave feed-forward in and the chord attitude in, the burst's worst
     * navy row was still 0.329 m at the stem against -0.252 at the transom —
     * ANTI-symmetric, i.e. a pitch lag and not a height one: the hull was
     * crossing a moving chord at tau 0.44 and standing 0.021 rad behind it. The
     * lead cancels the ramp; the tau still smooths a step, which is where the
     * mass is felt.
     */
    const leadAngle = (prev, target) => {
      if (!(dt > 0) || !Number.isFinite(prev)) return 0;
      const rate = (target - prev) / dt;
      return Math.max(-SEA_RIDE.leadMaxRad,
        Math.min(SEA_RIDE.leadMaxRad, rate * SEA_RIDE.tauAttitude));
    };
    const pLead = leadAngle(this.lastPitch, att.pitch);
    const rLead = leadAngle(this.lastRoll, att.roll);
    this.pitch = lowPassTo(this.pitch, att.pitch + pLead, dt, SEA_RIDE.tauAttitude);
    this.roll = lowPassTo(this.roll, att.roll + rLead, dt, SEA_RIDE.tauAttitude);
    if (dt > 0) {
      this.lastH = h;
      this.lastPitch = att.pitch;
      this.lastRoll = att.roll;
    }
    return this;
  }
}
/**
 * Level a water decal group that hangs under a hull which is pitching and
 * rolling. Foam lies ON the water: it takes the heave and refuses the attitude.
 * The group's origin coincides with the hull's, so the exact inverse rotation
 * about that origin restores a level plane through the hull's centre — no
 * small-angle approximation, and no vertical error at the centre.
 */
export function levelWaterGroup(group, hull) {
  if (!group || !hull) return null;
  group.quaternion.copy(hull.quaternion).invert();
  return group;
}
/* ------------------------------------------------------------------ *
 * P14 M7 item 3 — the shadow fill.
 *
 * M6 measured the ground under the tank at 0.20x the surrounding plaza, proved
 * by A/B that it is the shadow map rather than the contact print, and carried
 * it as a residual. It also built an additive bounce and removed it again,
 * because it could not be shown to lift anything. Three things were wrong with
 * that attempt and all three are fixed here:
 *
 *   1. **It sat under the unit.** The key stands 39.8 deg up, so the shadow
 *      lands *beside* the caster, not beneath it. A disc centred on the tank
 *      is hidden by the tank. The fill is offset along the ground-projected
 *      shadow and stretched to its length, so it covers the mass the audit
 *      drew a box around.
 *   2. **It was a tuned opacity.** The fill is a radiance now, derived from
 *      the live key's own colour and intensity through `militaryShadowFill()`,
 *      which is why it can be sized against the thing it is replacing.
 *   3. **The scene renders to a half-float target with `NoToneMapping`** (post
 *      owns the tonemap), so an additive quad adds *linear* radiance and is
 *      then rolled off by ACES exactly like real light. A value that reads as
 *      nothing in sRGB terms reads correctly here.
 *
 * `depthTest` stays on, so the unit occludes the part of its own fill it
 * stands over; `depthWrite` stays off, so the fill never occludes anything.
 * Additive over the multiply print is deliberate: the fill draws first
 * (`PRINT_RENDER_ORDER - 2`), the print multiplies the filled ground after it,
 * so the contact darkening survives at full strength.
 * ------------------------------------------------------------------ */
/*
 * M8 item 3 — the core was 30 % of the radius, and that is most of M7's
 * missing lift.
 *
 * With a smoothstep to zero at the rim, a core of 0.30 leaves the factor under
 * 0.25 over more than half the ellipse's AREA. M7's receipt is a MEDIAN over
 * the fill's own footprint, so the median pixel was being asked to carry a
 * quarter of the fill's strength even where the peak was working perfectly.
 * 0.58 makes the fill flat across the shadow it is there to lift and feathers
 * only in the last third, where the eye needs the edge to disappear.
 */
export const FILL_CORE = 0.58;
export function fillFactorAt(r) {
  if (r >= 1) return 0;
  if (r <= FILL_CORE) return 1;
  const k = 1 - ((r - FILL_CORE) / (1 - FILL_CORE));
  return k * k * (3 - 2 * k);
}
function makeFillStamp(size = 64) {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) * 0.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const v = Math.round(255 * fillFactorAt(Math.hypot(dx, dy)));
      const i = (y * size + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  // Linear, not sRGB: the map is a radiance falloff, not a colour.
  tex.colorSpace = THREE.NoColorSpace;
  return groundStamp(tex);
}
const FILL_STAMP = makeFillStamp(64);
export const FILL_RENDER_ORDER = 2;
/** Names a ground probe steps past: us, the pick proxies, effects, vehicles. */
export const FILL_GROUND_SKIP = /^military[:-]|^pick:|^v3\d+:|^people:|^nature:foliage|^streetscape:(sign|pole|lamp)/;
/** Above this a downward probe has hit a roof or a canopy, not the ground. */
export const FILL_GROUND_MAX_Y = 1.2;
/** A unit's footprint: half-width across the shadow, and how tall it casts. */
export const UNIT_FILL_SHAPE = Object.freeze({
  tank: Object.freeze({ height: 2.65, radius: 2.85 }),
  drone: Object.freeze({ height: MILITARY_SCALE.droneMastHeightM, radius: 2.55 }),
  officer: Object.freeze({ height: MILITARY_SCALE.officerHeightM, radius: 0.72 }),
});
export function makeShadowFill(name) {
  // SCREEN, not add. A plain additive fill puts the same radiance on the
  // shadow and on the lit pavement around it, so the amount that lifts a
  // 0.19x shadow to the 0.55x the receipt asks for also puts a visible glow on
  // the deck: measured, +11.6 luma on lit ground for +0.7 in the shadow, which
  // is the wrong way round. `src * (1 - dst) + dst` is bounded by construction
  // — it can only ever close the gap to white — so the darker the ground, the
  // more of the fill it takes, which is what a bounce actually does.
  const mesh = new THREE.Mesh(PRINT_GEOM, new THREE.MeshBasicMaterial({
    map: FILL_STAMP,
    transparent: true,
    opacity: 1,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneMinusDstColorFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  }));
  mesh.material.color.setRGB(0, 0, 0, THREE.LinearSRGBColorSpace);
  mesh.userData.ownsMaterial = true;
  if (name) mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = FILL_RENDER_ORDER;
  mesh.userData.contactStamp = true;
  noPick(mesh);
  return mesh;
}
/**
 * Place one fill on the ground under `kind` standing at (x, z), given the key
 * light's direction / colour / intensity. Returns the term it applied so a
 * probe can assert against the same numbers the frame carries.
 */
export function placeShadowFill(mesh, kind, x, z, key, groundY = 0) {
  const shape = UNIT_FILL_SHAPE[kind] ?? UNIT_FILL_SHAPE.tank;
  const term = militaryShadowFill({ ...key, height: shape.height, radius: shape.radius });
  term.groundY = groundY;
  mesh.position.set(
    x + term.dirXZ[0] * term.offset,
    groundY + term.lift,
    z + term.dirXZ[1] * term.offset,
  );
  // The plane's local +y maps to world -z under rotation.x = -PI/2, so a world
  // yaw of theta is a local roll of -theta.
  mesh.rotation.set(-Math.PI / 2, 0, -term.yaw);
  mesh.scale.set(term.longAxis, term.shortAxis, 1);
  mesh.material.color.setRGB(term.rgb[0], term.rgb[1], term.rgb[2], THREE.LinearSRGBColorSpace);
  return term;
}
/** Find the rig's shadow-casting key. Walked once, then cached by the caller. */
export function findKeyLight(root) {
  let node = root;
  while (node?.parent) node = node.parent;
  if (!node) return null;
  let key = null;
  node.traverse((o) => {
    if (key) return;
    if (o.isDirectionalLight && o.castShadow) key = o;
  });
  return key;
}
/** The live key, read off the scene rather than re-derived from a profile. */
export function readKeyLight(key) {
  if (!key) return null;
  key.updateWorldMatrix(true, false);
  key.target?.updateWorldMatrix(true, false);
  const p = key.position;
  const t = key.target?.position ?? { x: 0, y: 0, z: 0 };
  const dx = p.x - t.x;
  const dy = p.y - t.y;
  const dz = p.z - t.z;
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 1e-6)) return null;
  return {
    dir: { x: dx / len, y: dy / len, z: dz / len },
    color: { r: key.color.r, g: key.color.g, b: key.color.b },
    intensity: key.intensity,
  };
}
/**
 * MC3 F4 — the other half of the ink blot, proved by A/B (`M6-print-on.png`
 * against `M6-print-off.png`): hiding every contact stamp leaves the black
 * ragged mass under the tank completely unchanged, so it is the shadow map,
 * not the print.
 *
 * What this lane can do about it: stop the parts that sit ON the ground from
 * casting. A track plate 20 mm above the deck projects a shadow the map cannot
 * resolve at this texel density, and what it produces is the ragged fringe. The
 * hull, turret and mast keep casting — they are far enough off the deck to
 * resolve — and the print carries the contact. The shadow map's own resolution
 * and its black-in-shadow response belong to the lighting seat, not here.
 */
export const GROUND_CASTER_CLEARANCE_M = 0.62;
function stopGroundCasters(root, clearance = GROUND_CASTER_CLEARANCE_M) {
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  const whole = new THREE.Box3().setFromObject(root);
  if (!Number.isFinite(whole.min.y)) return 0;
  const floor = whole.min.y;
  let n = 0;
  root.traverse((ch) => {
    if (!ch.isMesh || !ch.castShadow) return;
    if (!ch.geometry) return;
    if (!ch.geometry.boundingBox) ch.geometry.computeBoundingBox();
    const bb = ch.geometry.boundingBox;
    if (!bb || !Number.isFinite(bb.min.y)) return;
    box.copy(bb).applyMatrix4(ch.matrixWorld);
    if (box.max.y - floor > clearance) return;
    ch.castShadow = false;
    n += 1;
  });
  return n;
}
function isContactMesh(obj) {
  let node = obj;
  while (node) {
    if (node.userData?.contactStamp) return true;
    node = node.parent;
  }
  return false;
}
const PICK_MAT = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
  colorWrite: false,
});

function kit() {
  return {
    hull: std('#817558', { roughness: 0.56, metalness: 0.14 }),
    camoDark: std('#3d4732', { roughness: 0.62, metalness: 0.10 }),
    camoLight: std('#9a8b61', { roughness: 0.58, metalness: 0.08 }),
    glacis: std('#69704b', { roughness: 0.54, metalness: 0.14 }),
    turret: std('#606b49', { roughness: 0.56, metalness: 0.16 }),
    barrel: std('#2a3034', { roughness: 0.38, metalness: 0.42 }),
    track: std('#1a1c20', { roughness: 0.84, metalness: 0.08 }),
    skirt: std('#2a2e28', { roughness: 0.7, metalness: 0.1 }),
    wheel: std('#1c1e20', { roughness: 0.78, metalness: 0.16 }),
    hazard: std('#c9a21a', { roughness: 0.44, metalness: 0.12 }),
    hiVis: std('#e07020', { roughness: 0.48, metalness: 0.08 }),
    navy: std('#1c3a68', { roughness: 0.62, metalness: 0.08 }),
    cap: std('#0e2244', { roughness: 0.5, metalness: 0.1 }),
    clip: std('#d8d2c4', { roughness: 0.55, metalness: 0.04 }),
    vest: std('#f07820', { roughness: 0.5, metalness: 0.06 }),
    trailer: std('#d8c48a', { roughness: 0.48, metalness: 0.1 }),
    steel: std('#2a3036', { roughness: 0.38, metalness: 0.42 }),
    steelPale: std('#c8c2a8', { roughness: 0.36, metalness: 0.28 }),
    drone: std('#1a1e22', { roughness: 0.46, metalness: 0.28 }),
    dronePale: std('#e8e0c4', { roughness: 0.42, metalness: 0.18 }),
    rotor: std('#2a2e32', { roughness: 0.4, metalness: 0.2 }),
    rotorPale: std('#8a9094', { roughness: 0.38, metalness: 0.22 }),
    pad: std('#c9a21a', { roughness: 0.5, metalness: 0.08 }),
    flag: std('#1c3a68', { roughness: 0.55, metalness: 0.06 }),
    flagRed: std('#a82820', { roughness: 0.5, metalness: 0.06 }),
    tyre: std('#1a1c20', { roughness: 0.82, metalness: 0.1 }),
    skin: std('#e8c4a8', { roughness: 0.78, metalness: 0.02 }),
    navBlue: new THREE.MeshStandardMaterial({
      color: 0x80c8ff,
      emissive: 0x2080ff,
      emissiveIntensity: 2.4,
      roughness: 0.3,
      toneMapped: false,
    }),
  };
}

function unitHash(id, salt) {
  let h = 2166136261;
  const text = `${id}:${salt}`;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function pushPoint(out, x, z) {
  const last = out[out.length - 1];
  if (!last || Math.hypot(x - last.x, z - last.z) > 0.04) out.push({ x, z });
}

function nearestValue(values, v) {
  let best = values[0] ?? 0;
  let dist = Infinity;
  for (const x of values) {
    const d = Math.abs(x - v);
    if (d < dist) {
      dist = d;
      best = x;
    }
  }
  return best;
}

export function parseBlockId(value) {
  const raw = String(value ?? '');
  const m = /^(\d+),(\d+)$/.exec(raw);
  if (!m) return null;
  return { id: raw, bx: Number(m[1]), bz: Number(m[2]) };
}

export function blockIdAt(x, z, blocksX = 4, blocksZ = 4) {
  const bx = Math.floor((x - ROAD) / PITCH);
  const bz = Math.floor((z - ROAD) / PITCH);
  if (bx < 0 || bz < 0 || bx >= blocksX || bz >= blocksZ) return null;
  return `${bx},${bz}`;
}

/** Kerb-side pad on the south footpath of the block. Slot offsets co-stationed units. */
export function padPoseForBlock(bx, bz, slot = 0) {
  // MC2 F10 — 4.2 m put a 5.8 m drone trailer inside a 5.35 m tank's footprint
  // and the roster read as one pile. 7.6 m separates them and still holds three
  // units well inside a 48 m block.
  // Seed 0's planted line is x=168/184 at this kerb. The old first pad was
  // exactly x=168, so the tank was centred on a tree. Stagger the three parade
  // slots +2/0/-2 m: the tank clears the bole and the officer clears the next.
  const paradeNudge = [PARADE_STANDOFF_M, 0, -PARADE_STANDOFF_M][slot % 3] ?? 0;
  const x = ROAD + bx * PITCH + BLOCK * 0.5 + slot * UNIT_SLOT_SPACING_M + paradeNudge;
  const z = (bz + 1) * PITCH + CORRIDOR.footpathCentreLow;
  return { x, z, y: 0, yaw: 0 };
}

/** The tank stands along the kerb, with its rubber band 0.30 m clear of it. */
export function stationPoseForBlock(bx, bz, slot = 0, kind = 'officer') {
  const pose = padPoseForBlock(bx, bz, slot);
  if (kind !== 'tank') return pose;
  const kerbZ = (bz + 1) * PITCH + CORRIDOR.kerbLow;
  return {
    ...pose,
    z: kerbZ + TANK_HALF_WIDTH_M + TANK_KERB_CLEARANCE_M,
    yaw: Math.PI / 2,
  };
}

export const PARADE_FOOTPRINT_M = Object.freeze({
  tank: Object.freeze({ halfX: 1.78, halfZ: 3.75 }),
  drone: Object.freeze({ halfX: 1.20, halfZ: 2.35 }),
  officer: Object.freeze({ halfX: 0.34, halfZ: 0.34 }),
});

/** Deterministic plan-view census against planted tree boles. */
export function paradeTreeOverlapCensus(units, trees) {
  const overlaps = [];
  for (const unit of units ?? []) {
    const footprint = PARADE_FOOTPRINT_M[unit.kind];
    if (!footprint || !Number.isFinite(unit.x) || !Number.isFinite(unit.z)) continue;
    for (const [treeIndex, tree] of (trees ?? []).entries()) {
      if (!Number.isFinite(tree?.x) || !Number.isFinite(tree?.z)) continue;
      const boleR = 0.20 * Math.max(0.65, Math.min(1.2, tree.scale ?? 1));
      const overlapsX = Math.abs(unit.x - tree.x) < footprint.halfX + boleR;
      const overlapsZ = Math.abs(unit.z - tree.z) < footprint.halfZ + boleR;
      if (overlapsX && overlapsZ) {
        overlaps.push({ unitId: unit.id, kind: unit.kind, treeIndex, x: tree.x, z: tree.z });
      }
    }
  }
  return overlaps;
}

export function speedForKind(kind) {
  if (kind === 'tank') return TANK_SPEED_MPS;
  if (kind === 'drone') return DRONE_SPEED_MPS;
  return OFFICER_SPEED_MPS;
}

export function altitudeForKind(kind) {
  // The wing is a ground trailer with parked aircraft.  Only its patrol child
  // is at DRONE_ALT_M; lifting the whole group doubled that altitude and left
  // the trailer floating twelve metres above its contact ring.
  return 0;
}

/**
 * Building-safe Manhattan: snap onto corridor centres, keep-left on the
 * middle, then peel onto the destination kerb pad.
 */
export function unitCorridorPath(from, to, extent) {
  const { xs, zs } = corridorCentres(extent);
  const raw = [];
  pushPoint(raw, from.x, from.z);
  const fromCx = nearestValue(xs, from.x);
  const fromCz = nearestValue(zs, from.z);
  const toCx = nearestValue(xs, to.x);
  const toCz = nearestValue(zs, to.z);
  if (Math.abs(from.x - fromCx) >= Math.abs(from.z - fromCz)) {
    pushPoint(raw, fromCx, from.z);
    pushPoint(raw, fromCx, fromCz);
  } else {
    pushPoint(raw, from.x, fromCz);
    pushPoint(raw, fromCx, fromCz);
  }
  if (fromCx !== toCx) pushPoint(raw, toCx, fromCz);
  pushPoint(raw, toCx, toCz);
  if (Math.abs(to.x - toCx) >= Math.abs(to.z - toCz)) {
    pushPoint(raw, toCx, to.z);
    pushPoint(raw, to.x, to.z);
  } else {
    pushPoint(raw, to.x, toCz);
    pushPoint(raw, to.x, to.z);
  }
  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    const p = raw[i];
    const n = raw[i + 1];
    const isEnd = i === 0 || i === raw.length - 1;
    if (isEnd || !n) {
      out.push({ x: p.x, z: p.z });
      continue;
    }
    const off = keepLeftOffset(n.x - p.x, n.z - p.z);
    out.push({ x: p.x + off.x, z: p.z + off.z });
  }
  return out;
}

export function pathOnCorridors(path, extent, slack = 5.2) {
  const { xs, zs } = corridorCentres(extent);
  const mid = path.slice(1, Math.max(1, path.length - 1));
  return mid.every((p) => {
    const cx = nearestValue(xs, p.x);
    const cz = nearestValue(zs, p.z);
    return Math.abs(p.x - cx) <= slack || Math.abs(p.z - cz) <= slack;
  });
}

function addQuadcopter(parent, mats, name, scale = 1, pale = false) {
  const g = new THREE.Group();
  g.name = name;
  const body = pale ? mats.dronePale : mats.drone;
  const rotors = pale ? mats.rotorPale : mats.rotor;
  addBox(g, 0.58 * scale, 0.16 * scale, 0.58 * scale, body, 0, 0.12 * scale, 0);
  addSphere(g, 0.13 * scale, 6, pale ? mats.steelPale : mats.steel, 0, 0.24 * scale, 0);
  if (pale) {
    addSphere(g, 0.07 * scale, 6, mats.navBlue, 0, 0.32 * scale, 0);
  }
  for (const [dx, dz] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
    addCyl(g, 0.28 * scale, 0.28 * scale, 0.04 * scale, 8, rotors, dx * scale, 0.28 * scale, dz * scale);
    addBox(g, 0.06 * scale, 0.08 * scale, 0.36 * scale, mats.steel, (dx * 0.5) * scale, 0.16 * scale, (dz * 0.5) * scale);
  }
  noPick(g);
  parent.add(g);
  return g;
}

function addChamfered(parent, w, h, d, mat, x, y, z, opts = {}) {
  const c = Math.max(0.006, Math.min(opts.chamfer ?? 0.07, w * 0.28, h * 0.28, d * 0.28));
  const mesh = new THREE.Mesh(chamferBox(w, h, d, c), mat);
  mesh.position.set(x, y - h + 2 * c, z);
  if (opts.rotX) mesh.rotation.x = opts.rotX;
  if (opts.rotY) mesh.rotation.y = opts.rotY;
  if (opts.rotZ) mesh.rotation.z = opts.rotZ;
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  if (opts.name) mesh.name = opts.name;
  noPick(mesh);
  parent.add(mesh);
  return mesh;
}

function bakedTankGeometry(source, position, rotation = null) {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  source.dispose?.();
  const quaternion = new THREE.Quaternion().setFromEuler(rotation ?? new THREE.Euler());
  geometry.applyMatrix4(new THREE.Matrix4().compose(
    position,
    quaternion,
    new THREE.Vector3(1, 1, 1),
  ));
  return geometry;
}

function mergeTankParts(parts) {
  const geometries = parts.map((part) => bakedTankGeometry(
    part.geometry,
    new THREE.Vector3(...part.at),
    new THREE.Euler(...(part.rot ?? [0, 0, 0])),
  ));
  const geometry = mergeGeometries(geometries, true);
  for (const part of geometries) part.dispose?.();
  if (!geometry) throw new Error('military tank geometry could not be merged');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeTankTrackBand(id, side, mats) {
  const suffix = side < 0 ? 'l' : 'r';
  const parts = [{
    geometry: chamferBox(0.62, 0.58, TRACK_CONTACT_L, 0.08),
    material: mats.track,
    at: [side * 1.42, 0.36, 0],
  }];
  const wheelZ = [-2.05, -1.23, -0.41, 0.41, 1.23, 2.05];
  for (const z of wheelZ) {
    parts.push({
      geometry: new THREE.CylinderGeometry(0.34, 0.34, 0.10, 12),
      material: mats.wheel,
      at: [side * 1.735, 0.35, z],
      rot: [0, 0, Math.PI / 2],
    });
  }
  const band = new THREE.Mesh(
    mergeTankParts(parts),
    parts.map((part) => part.material),
  );
  band.name = `military:tank:${id}:track-${suffix}`;
  band.castShadow = false;
  band.receiveShadow = true;
  band.userData.ownsGeometry = true;
  noPick(band);
  return band;
}

export function makeTank(id, mats = kit()) {
  const t = new THREE.Group();
  t.name = `military:tank:${id}`;
  // M14: the armour is one geometry and therefore one shadow caster. The
  // glacis, guards and turret overlap that same continuous mass; road wheels
  // are relief inside two rubber bands and never cast their own black blobs.
  const armourParts = [
    { geometry: chamferBox(2.82, 0.68, MILITARY_SCALE.tankLengthM, 0.09), material: mats.hull, at: [0, 0.73, 0] },
    { geometry: chamferBox(2.52, 0.42, 3.45, 0.07), material: mats.camoDark, at: [0, 1.18, -0.34] },
    { geometry: chamferBox(2.48, 0.34, 1.75, 0.06), material: mats.glacis, at: [0, 1.17, 1.72], rot: [-0.36, 0, 0] },
    { geometry: chamferBox(0.22, 0.34, 5.18, 0.05), material: mats.skirt, at: [-1.51, 0.76, 0] },
    { geometry: chamferBox(0.22, 0.34, 5.18, 0.05), material: mats.skirt, at: [1.51, 0.76, 0] },
    { geometry: chamferBox(2.08, 0.56, 2.22, 0.08), material: mats.turret, at: [0, 1.42, -0.34] },
    { geometry: chamferBox(1.56, 0.18, 1.68, 0.05), material: mats.camoLight, at: [0, 1.98, -0.38] },
    { geometry: new THREE.CylinderGeometry(0.23, 0.25, 0.18, 12), material: mats.turret, at: [0.15, 2.13, -0.48] },
  ];
  const hull = new THREE.Mesh(
    mergeTankParts(armourParts),
    armourParts.map((part) => part.material),
  );
  hull.name = `military:tank:${id}:hull`;
  hull.castShadow = true;
  hull.receiveShadow = true;
  hull.userData.mergedShadowCaster = true;
  hull.userData.ownsGeometry = true;
  noPick(hull);
  t.add(hull);
  const glacis = new THREE.Object3D();
  glacis.name = `military:tank:${id}:glacis`;
  glacis.userData.mergedInto = hull.name;
  t.add(glacis);
  t.add(makeTankTrackBand(id, -1, mats), makeTankTrackBand(id, 1, mats));
  const turret = new THREE.Group();
  turret.name = `military:tank:${id}:turret`;
  turret.position.set(0, 1.39, -0.22);
  turret.userData.mergedInto = hull.name;
  t.add(turret);
  const barrel = addCyl(turret, 0.15, 0.15, MILITARY_SCALE.tankBarrelLengthM, 10,
    mats.barrel, 0, 0.57, 2.15, {
    rotX: Math.PI / 2, name: `military:tank:${id}:barrel`,
  });
  barrel.castShadow = false;
  addCyl(turret, 0.19, 0.19, 0.28, 10, mats.steelPale, 0, 0.57, 3.82, { rotX: Math.PI / 2 });
  addCyl(turret, 0.16, 0.21, 0.16, 10, mats.barrel, 0, 0.57, 4.00, { rotX: Math.PI / 2 });
  // The seated shared figure is submerged in the turret, with a human-sized
  // head clearing the hatch cap (world y=2.22 m).
  {
    const hatchFig = createI4FigureGroup({
      name: `military:tank:${id}:hatch-crew`,
      identity: 'hi-vis', wardrobe: 'uniform', pose: 'sit',
      palette: { upper: mats.navy.color, lower: mats.navy.color },
    });
    // H1BR4: the old 0.38 m miniature disappeared under the closed hatch.
    // Keep the seated legs inside armour; align the shoulders with its opening.
    hatchFig.scale.setScalar(0.75);
    hatchFig.position.set(0.15, 0.21, -0.26);
    turret.add(hatchFig);
  }
  addCyl(turret, 0.018, 0.018, 0.24, 5, mats.steelPale, -0.70, 0.79, -0.55);
  const contact = new THREE.Group();
  contact.name = `military:tank:${id}:contact`;
  noPick(contact);
  contact.userData.contactStamp = true;
  const leftPrint = new THREE.Mesh(PRINT_GEOM, PRINT_MAT);
  leftPrint.name = `military:tank:${id}:print-l`;
  leftPrint.rotation.x = -Math.PI / 2;
  leftPrint.position.set(-1.42, PRINT_LIFT_M, 0.08);
  // MC3 F4 — exactly the track box footprint: 0.62 m wide, 5.05 m of track.
  leftPrint.scale.set(TRACK_CONTACT_W, TRACK_CONTACT_L, 1);
  markContact(leftPrint);
  contact.add(leftPrint);
  const rightPrint = new THREE.Mesh(PRINT_GEOM, PRINT_MAT);
  rightPrint.name = `military:tank:${id}:print-r`;
  rightPrint.rotation.x = -Math.PI / 2;
  rightPrint.position.set(1.42, PRINT_LIFT_M, 0.08);
  rightPrint.scale.set(TRACK_CONTACT_W, TRACK_CONTACT_L, 1);
  markContact(rightPrint);
  contact.add(rightPrint);
  const dust = new THREE.Mesh(PRINT_GEOM, DUST_MAT);
  dust.name = `military:tank:${id}:dust`;
  dust.rotation.x = -Math.PI / 2;
  dust.position.set(0, DUST_LIFT_M, 0.05);
  dust.scale.set(3.9, 5.9, 1);
  markContact(dust, PRINT_RENDER_ORDER - 1);
  contact.add(dust);
  t.add(contact);
  t.userData.turret = turret;
  t.userData.contact = contact;
  t.userData.kind = 'tank';
  t.traverse((ch) => {
    if (!ch.isMesh) return;
    ch.castShadow = ch === hull;
    ch.receiveShadow = !isContactMesh(ch);
  });
  t.userData.shadowCasters = 1;
  return t;
}

export function makeDroneWing(id, mats = kit()) {
  const t = new THREE.Group();
  t.name = `military:drone:${id}`;
  addBox(t, 2.05, 0.88, 2.15, mats.trailer, 0, 0.94, -1.02);
  addBox(t, 1.88, 0.14, 2.02, mats.hazard, 0, 1.43, -1.02);
  addBox(t, 1.84, 0.58, 0.08, mats.steelPale, 0, 1.25, -2.05);
  addBox(t, 2.02, 0.24, MILITARY_SCALE.droneTrailerLengthM, mats.steelPale, 0, 0.48, 0.42);
  addBox(t, 1.90, 0.08, 4.20, mats.hazard, 0, 0.63, 0.42);
  addCyl(t, 0.32, 0.32, 0.28, 8, mats.tyre, -0.95, 0.32, -1.2, { rotZ: Math.PI / 2 });
  addCyl(t, 0.32, 0.32, 0.28, 8, mats.tyre, 0.95, 0.32, -1.2, { rotZ: Math.PI / 2 });
  addCyl(t, 0.32, 0.32, 0.28, 8, mats.tyre, -0.95, 0.32, 1.75, { rotZ: Math.PI / 2 });
  addCyl(t, 0.32, 0.32, 0.28, 8, mats.tyre, 0.95, 0.32, 1.75, { rotZ: Math.PI / 2 });
  const cradles = [];
  const parked = [];
  const spots = [[-0.62, 0.15], [0.62, 0.15], [-0.62, 1.45], [0.62, 1.45]];
  for (let i = 0; i < 4; i += 1) {
    const [dx, dz] = spots[i];
    addBox(t, 0.62, 0.13, 0.62, mats.steelPale, dx, 0.78, dz);
    const drone = addQuadcopter(t, mats, `military:drone:${id}:parked:${i}`, 0.72, true);
    drone.position.set(dx, 0.96, dz);
    parked.push(drone);
    cradles.push({ x: dx, z: dz });
  }
  // MC2 F10 — a mast so the wing has a silhouette above the trailer roofline.
  addCyl(t, 0.055, 0.075, 2.35, 6, mats.steelPale, -0.82, 2.08, -1.95);
  addBox(t, 0.92, 0.11, 0.13, mats.hazard, -0.82, 3.22, -1.95);
  addSphere(t, 0.15, 6, mats.navBlue, -0.82, MILITARY_SCALE.droneMastHeightM, -1.95);
  addBox(t, 1.20, 0.62, 0.08, mats.hazard, 0, 1.72, -2.10, {
    name: `military:drone:${id}:board`,
  });
  const patrol = addQuadcopter(t, mats, `military:drone:${id}:patrol`, 1.55, true);
  patrol.position.set(0, DRONE_ALT_M, 0);
  // MC2 F10 — the patrol's grounded pad: a printed disc plus a soft contact
  // stamp so the wing is findable even when the drone is high in the frame.
  const patrolPad = new THREE.Group();
  patrolPad.name = `military:drone:${id}:patrol-pad`;
  patrolPad.userData.contactStamp = true;
  noPick(patrolPad);
  const patrolStamp = new THREE.Mesh(PRINT_GEOM, DUST_MAT);
  patrolStamp.name = `military:drone:${id}:patrol-shadow`;
  patrolStamp.rotation.x = -Math.PI / 2;
  patrolStamp.position.y = PRINT_LIFT_M;
  // MC3 F4 — exactly the pad footprint: the patrol ring's own outer diameter.
  patrolStamp.scale.set(PATROL_PAD_D, PATROL_PAD_D, 1);
  markContact(patrolStamp);
  patrolPad.add(patrolStamp);
  const patrolRing = makeGroundRing(
    `military:drone:${id}:patrol-ring`,
    PATROL_RING_INNER,
    PATROL_RING_OUTER,
    0x58c8ff,
    0.55,
  );
  patrolPad.add(patrolRing);
  t.add(patrolPad);
  t.userData.patrolPad = patrolPad;
  t.userData.groundRing = patrolRing;
  t.userData.parked = parked;
  t.userData.patrol = patrol;
  t.userData.cradles = cradles;
  t.userData.kind = 'drone';
  t.traverse((ch) => {
    if (!ch.isMesh) return;
    // MC3 F4 — never let this sweep switch a flat contact quad back on.
    if (isContactMesh(ch)) return;
    ch.castShadow = true;
    ch.receiveShadow = true;
  });
  stopGroundCasters(t);
  return t;
}

export function makeOfficer(id, mats = kit()) {
  const t = new THREE.Group();
  t.name = `military:officer:${id}`;
  // M5 receipt: the previous readability pass authored `h: 4.05`; M12 keeps
  // the grounded pad and contrast, but retires that three-person-tall body.
  // M12 — the officer shares the city's published 1.353 m person truth.  The
  // high-contrast vest and generous control pad preserve the roster read.
  const pad = new THREE.Group();
  pad.name = `military:officer:${id}:pad`;
  pad.userData.contactStamp = true;
  noPick(pad);
  const padStamp = new THREE.Mesh(PRINT_GEOM, DUST_MAT);
  padStamp.name = `military:officer:${id}:pad-shadow`;
  padStamp.rotation.x = -Math.PI / 2;
  padStamp.position.y = PRINT_LIFT_M;
  padStamp.scale.set(OFFICER_PAD_D, OFFICER_PAD_D, 1);
  markContact(padStamp);
  pad.add(padStamp);
  const padRing = makeGroundRing(
    `military:officer:${id}:pad-ring`,
    OFFICER_RING_INNER,
    OFFICER_RING_OUTER,
    GROUND_RING_COLOR,
    GROUND_RING_OPACITY,
  );
  pad.add(padRing);
  t.add(pad);
  // H1BR4: one shared rig mesh replaces legacy limbs and detached equipment.
  const fig = createI4FigureGroup({
    name: `military:officer:${id}:figure`,
    identity: 'hi-vis', wardrobe: 'uniform', pose: 'stand',
    palette: { upper: mats.navy.color, lower: mats.navy.color },
  });
  const body = fig.getObjectByName(`military:officer:${id}:body`) ?? fig;
  body.name = `military:officer:${id}:body`;
  const fitted = new THREE.Box3().setFromObject(fig);
  const top = fitted.max.y;
  if (top > 1e-4) fig.scale.setScalar(MILITARY_SCALE.officerHeightM / top);
  t.add(fig);
  t.userData.pad = pad;
  t.userData.groundRing = padRing;
  t.userData.kind = 'officer';
  t.traverse((ch) => {
    if (!ch.isMesh) return;
    // MC3 F4 — never let this sweep switch a flat contact quad back on.
    if (isContactMesh(ch)) return;
    ch.castShadow = true;
    ch.receiveShadow = true;
  });
  stopGroundCasters(t);
  return t;
}

function makePad(id, mats = kit()) {
  const g = new THREE.Group();
  g.name = `military:pad:${id}`;
  addCyl(g, 2.4, 2.4, 0.06, 20, mats.pad, 0, 0.03, 0);
  addCyl(g, 2.15, 1.7, 0.05, 20, mats.steel, 0, 0.04, 0);
  addBox(g, 0.55, 0.05, 1.8, mats.hazard, 0, 0.07, 0);
  addBox(g, 1.8, 0.05, 0.55, mats.hazard, 0, 0.07, 0);
  addCyl(g, 0.05, 0.05, PAD_FLAG_H, 6, mats.steelPale, 1.85, PAD_FLAG_H * 0.5, -1.4);
  addBox(g, 0.85, 0.55, 0.06, mats.flag, 2.28, PAD_FLAG_H - 0.2, -1.4);
  addBox(g, 0.22, 0.55, 0.06, mats.flagRed, 1.95, PAD_FLAG_H - 0.2, -1.4);
  noPick(g);
  return g;
}

function makePickProxy(id, kind) {
  const w = kind === 'officer' ? 1.45 : kind === 'drone' ? 3.1 : 3.55;
  const h = kind === 'drone' ? DRONE_ALT_M + 1.3
    : kind === 'officer' ? MILITARY_SCALE.officerHeightM : 2.65;
  const d = kind === 'officer' ? 1.45 : kind === 'drone' ? 4.8 : 6.7;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), PICK_MAT);
  mesh.name = `pick:military:${id}`;
  mesh.position.y = h * 0.5;
  mesh.userData.unitId = id;
  mesh.userData.kind = 'unit';
  mesh.userData.label = kind;
  return mesh;
}

function slotOnBlock(units, unit) {
  const same = units.filter((row) => row.blockId && row.blockId === unit.blockId);
  return Math.max(0, same.findIndex((row) => row.id === unit.id));
}

export function synthesizeMilitaryDemo(city) {
  const extent = city?.extent ?? cityExtent(4, 4);
  const tankFrom = padPoseForBlock(2, 1, 0);
  const tankTo = padPoseForBlock(2, 2, 0);
  const path = unitCorridorPath(tankFrom, tankTo, extent);
  return Object.freeze({
    units: Object.freeze([
      Object.freeze({
        id: 'tank-1',
        kind: 'tank',
        blockId: '2,2',
        fromBlock: '2,1',
        x: tankTo.x,
        z: tankTo.z,
        selected: true,
        moving: true,
        path,
      }),
      Object.freeze({
        id: 'drone-1',
        kind: 'drone',
        blockId: '2,2',
        x: padPoseForBlock(2, 2, 1).x,
        z: padPoseForBlock(2, 2, 1).z,
        selected: false,
        moving: false,
      }),
      Object.freeze({
        id: 'officer-1',
        kind: 'officer',
        blockId: '2,2',
        x: padPoseForBlock(2, 2, 2).x,
        z: padPoseForBlock(2, 2, 2).z,
        selected: false,
        moving: false,
      }),
    ]),
    raid: Object.freeze({
      strength: 3,
      interceptors: Object.freeze([
        Object.freeze({ kind: 'drone', id: 'drone-1' }),
        Object.freeze({ kind: 'army', id: 'tank-1' }),
      ]),
      leftover: 1,
      targetFacility: 'port',
      outcome: 'damage',
    }),
    sea: Object.freeze({
      basinId: 'bass',
      outcome: 'repelled',
      interceptors: Object.freeze([Object.freeze({ kind: 'navy', id: 'warship-a' })]),
    }),
    shipyard: Object.freeze({
      kind: 'navy',
      startedBeat: 0,
      readyBeat: 2,
      launch: true,
    }),
  });
}

/**
 * Distance that fits a group of half-width `spread` metres across the frame.
 * The city camera is a 26 deg vertical fov (scene.js): at 16:9 that is
 * tan(13 deg) * 16/9 = 0.4106 of the distance as visible half-width.
 */
export const CITY_HALF_WIDTH_PER_M = 0.4106;
export function frameDistanceFor(spread, min, max) {
  const half = Math.max(0, Number.isFinite(spread) ? spread : 0);
  const want = (half * 1.24) / CITY_HALF_WIDTH_PER_M;
  return Math.max(min, Math.min(max, want));
}

/**
 * M5 F4/F5/F9 — a phase may hand back a framing hint with its subject: `spread`
 * (half-width of everything that must fit) and `azimuth` (look across the action,
 * not down its axis). Without hints the locked table stands.
 */
export function militaryCameraPose(phase, ctx = {}) {
  const subject = ctx.subject ?? { x: 140, y: 2, z: 40 };
  const table = {
    // MC3 F1 — 42 m put the camera inside the aftermath. The raid reads as an
    // event on a quay, which needs the quay in the shot.
    raid: { azimuth: 38, polar: 30, distance: 54, min: 56, max: 104 },
    seafight: { azimuth: 118, polar: 26, distance: 46, min: 46, max: 120 },
    shipyard: { azimuth: 148, polar: 30, distance: 52, min: 40, max: 88 },
    units: { azimuth: 318, polar: 28, distance: 42, min: 38, max: 150 },
    panel: { azimuth: 310, polar: 34, distance: 62, min: 44, max: 170 },
  };
  const spec = table[phase] ?? table.units;
  const distance = Number.isFinite(subject.spread)
    ? frameDistanceFor(subject.spread, spec.min, spec.max)
    : spec.distance;
  const azimuth = Number.isFinite(subject.azimuth)
    ? ((subject.azimuth % 360) + 360) % 360
    : spec.azimuth;
  return {
    phase,
    target: { x: subject.x, y: subject.y ?? 2, z: subject.z },
    azimuth,
    polar: spec.polar,
    distance,
  };
}

/* ------------------------------------------------------------------ *
 * MC3 F1 — a combat camera that can see the combat.
 *
 * M5 framed the raid on the action's own centroid and let the locked table
 * pick the eye. At raid-t8 that put a clipped warehouse roof across the whole
 * lower frame and nothing of the raid survived. The camera now proves its own
 * shot: it lists the points that must be visible, tests every candidate eye
 * against the world boxes of the things that could stand in the way, and takes
 * the least-deviating eye that clears them all.
 *
 * Segment-vs-AABB, not triangle raycasts. A warehouse occludes as its box; the
 * test is exact enough for the decision, costs nothing, and — being pure — is
 * unit-testable without a renderer.
 * ------------------------------------------------------------------ */

/** Rig convention (`camera.js _poseCamera`): polar is elevation off horizontal. */
export function orbitEye(target, azimuthDeg, polarDeg, distance) {
  const az = (azimuthDeg * Math.PI) / 180;
  const polar = (polarDeg * Math.PI) / 180;
  const horizontal = Math.cos(polar) * distance;
  return {
    x: target.x + Math.sin(az) * horizontal,
    y: (target.y ?? 0) + Math.sin(polar) * distance,
    z: target.z + Math.cos(az) * horizontal,
  };
}

/**
 * Slab test. `box` is `{minX,minY,minZ,maxX,maxY,maxZ}`. Returns true when the
 * open segment from `a` to `b`, shortened by `clearance` at the far end, passes
 * through the box.
 */
export function segmentHitsBox(a, b, box, clearance = 1.5) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 1e-6)) return false;
  const tMax = Math.max(0, (len - clearance) / len);
  let t0 = 0;
  let t1 = tMax;
  const axis = (o, d, lo, hi) => {
    if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
    const inv = 1 / d;
    let ta = (lo - o) * inv;
    let tb = (hi - o) * inv;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    return t1 >= t0;
  };
  if (!axis(a.x, dx, box.minX, box.maxX)) return false;
  if (!axis(a.y, dy, box.minY, box.maxY)) return false;
  if (!axis(a.z, dz, box.minZ, box.maxZ)) return false;
  return t1 >= t0;
}

/** Names that never occlude: the action itself, water, ground and effects. */
export const SIGHT_IGNORE = Object.freeze([
  /^military[:-]/,
  /^nature:water/,
  /^nature:ground/,
  /^board:ground/,
  /^fringe:water/,
  /:wake(:|$)/,
  /^pick:/,
]);

export function sightIgnored(name) {
  if (!name) return false;
  return SIGHT_IGNORE.some((re) => re.test(name));
}

/**
 * Candidate eyes for a pose, cheapest deviation first. Azimuth swings first
 * because a step sideways keeps the staging; then elevation, which keeps the
 * subject but looks over the obstruction; then distance, which is the last
 * resort because it costs readable size.
 */
export const SIGHT_AZ_STEPS = Object.freeze([0, 20, -20, 40, -40, 62, -62, 84, -84, 108, -108, 134, -134, 160, -160, 180]);
export const SIGHT_POLAR_STEPS = Object.freeze([0, 9, 18, 28, 38]);
export const SIGHT_DIST_STEPS = Object.freeze([1, 1.22, 1.5]);
export const SIGHT_POLAR_MAX = 72;

export function clearPoseCandidates(base) {
  const out = [];
  for (const dd of SIGHT_DIST_STEPS) {
    for (const dp of SIGHT_POLAR_STEPS) {
      for (const da of SIGHT_AZ_STEPS) {
        out.push({
          azimuth: ((base.azimuth + da) % 360 + 360) % 360,
          polar: Math.min(SIGHT_POLAR_MAX, base.polar + dp),
          distance: base.distance * dd,
          cost: (Math.abs(da) / 60) + (dp / 12) + ((dd - 1) * 3.2),
          dAzimuth: da,
          dPolar: dp,
          dDistance: dd,
        });
      }
    }
  }
  out.sort((a, b) => a.cost - b.cost);
  return out;
}

/**
 * The least-deviating candidate whose eye sees every point in `points`.
 * `boxes` is the occluder list. If nothing is fully clear the candidate that
 * sees the most points wins, so the camera degrades rather than throwing.
 */
export function chooseClearPose(base, points, boxes, opts = {}) {
  const clearance = opts.clearance ?? 1.5;
  const pts = (points ?? []).filter((p) => p && Number.isFinite(p.x));
  const list = boxes ?? [];
  // MC3 F1 — points carry weight. When nothing is fully clear the camera should
  // give up the least important sightline, not settle for whichever pose it
  // happened to start from: a tie at the top used to hand the shot back to the
  // base pose, which at raid-t8 was the pose looking at a warehouse roof.
  const total = pts.reduce((acc, p) => acc + (p.weight ?? 1), 0);
  const best = { pose: base, score: -1, seen: -1, cost: Infinity, tried: 0 };
  if (!pts.length || !list.length) {
    return { ...base, seen: pts.length, of: pts.length, score: total, weight: total, tried: 0, clear: true };
  }
  const candidates = clearPoseCandidates(base);
  for (const cand of candidates) {
    best.tried += 1;
    const eye = orbitEye(base.target, cand.azimuth, cand.polar, cand.distance);
    if (eye.y < (opts.minEyeY ?? 2)) continue;
    let seen = 0;
    let score = 0;
    for (const p of pts) {
      let blocked = false;
      for (const box of list) {
        // Standing inside a box is not the box hiding the shot.
        if (boxContains(box, eye)) continue;
        if (segmentHitsBox(eye, p, box, clearance)) { blocked = true; break; }
      }
      if (!blocked) {
        seen += 1;
        score += p.weight ?? 1;
      }
    }
    if (score > best.score || (score === best.score && cand.cost < best.cost)) {
      best.score = score;
      best.seen = seen;
      best.cost = cand.cost;
      best.pose = cand;
    }
    if (seen === pts.length) break;
  }
  return {
    ...base,
    azimuth: best.pose.azimuth ?? base.azimuth,
    polar: best.pose.polar ?? base.polar,
    distance: best.pose.distance ?? base.distance,
    seen: best.seen,
    of: pts.length,
    score: best.score,
    weight: total,
    tried: best.tried,
    clear: best.seen === pts.length,
    dAzimuth: best.pose.dAzimuth ?? 0,
    dPolar: best.pose.dPolar ?? 0,
    dDistance: best.pose.dDistance ?? 1,
  };
}

const _occBox = new THREE.Box3();
/**
 * The span past which a world box is scenery, not an obstruction. Measured, not
 * guessed: at the raid pose the first M6 pass collected `nature:sky` (2176 m),
 * `world:edge-massing:crust` (2800 m), `fringe:hinterland-fields` (1248 m) and
 * the board itself (292 m) as occluders. The sky encloses the camera, so every
 * candidate eye "saw" nothing and the search returned the pose it started with
 * — the raid camera proved its shot against a box it was standing inside.
 * A 240 m ceiling drops all of those and keeps `fringe:port-terminal` (202 m),
 * which is a real building and a real occluder.
 */
export const SIGHT_MAX_SPAN_M = 240;
/**
 * World boxes of everything near the action that could hide it. Small props are
 * dropped: a bollard between the camera and a drone is not what the audit was
 * looking at, and keeping them would push the camera around for nothing.
 */
export function collectSightOccluders(scene, centre, radius, opts = {}) {
  const minSpan = opts.minSpan ?? 3;
  const maxSpan = opts.maxSpan ?? SIGHT_MAX_SPAN_M;
  const eye = opts.eye ?? null;
  const out = [];
  if (!scene?.traverse) return out;
  scene.updateMatrixWorld?.(true);
  scene.traverse((child) => {
    if (!child.isMesh || child.visible === false) return;
    // An InstancedMesh carries one unit cell as its geometry and the whole
    // scatter in its instance matrices; its world box is meaningless here and
    // reads NaN for the tree scatters. Skip the class outright.
    if (child.isInstancedMesh || child.isBatchedMesh) return;
    const mat = child.material;
    if (mat) {
      if (mat.colorWrite === false) return;
      if (mat.transparent && (mat.opacity ?? 1) < 0.35) return;
      if (mat.depthWrite === false && mat.transparent) return;
    }
    let node = child;
    let ignored = false;
    while (node) {
      if (sightIgnored(node.name)) { ignored = true; break; }
      node = node.parent;
    }
    if (ignored) return;
    if (!child.geometry) return;
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
    const bb = child.geometry.boundingBox;
    if (!bb || !Number.isFinite(bb.min.x) || !Number.isFinite(bb.max.x)) return;
    _occBox.copy(bb).applyMatrix4(child.matrixWorld);
    const sx = _occBox.max.x - _occBox.min.x;
    const sy = _occBox.max.y - _occBox.min.y;
    const sz = _occBox.max.z - _occBox.min.z;
    if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sz)) return;
    const span = Math.max(sx, sy, sz);
    if (span < minSpan || span > maxSpan) return;
    if (sy < 1.2) return;
    const cx = (_occBox.min.x + _occBox.max.x) * 0.5;
    const cz = (_occBox.min.z + _occBox.max.z) * 0.5;
    if (Math.hypot(cx - centre.x, cz - centre.z) > radius) return;
    const box = {
      name: child.name || child.parent?.name || '(anon)',
      minX: _occBox.min.x, minY: _occBox.min.y, minZ: _occBox.min.z,
      maxX: _occBox.max.x, maxY: _occBox.max.y, maxZ: _occBox.max.z,
    };
    if (eye && boxContains(box, eye)) return;
    out.push(box);
  });
  return out;
}

/** True when `p` is inside `box`. A box the eye stands in cannot occlude it. */
export function boxContains(box, p) {
  return p.x >= box.minX && p.x <= box.maxX
    && p.y >= box.minY && p.y <= box.maxY
    && p.z >= box.minZ && p.z <= box.maxZ;
}

export class MilitaryUnitsLayer {
  constructor(city, { reducedMotion = false } = {}) {
    this.city = city;
    this.reducedMotion = reducedMotion;
    this.root = new THREE.Group();
    this.root.name = 'military-units';
    this.mats = kit();
    this.units = new Map();
    this.pickTargets = [];
    this.selectedId = null;
    this.captureClean = false;
    this.demo = null;
    this.demoLock = false;
    this.time = 0;
    this.puffs = [];
    /** M7 item 3 — the shadow-fill term each unit applied, for the probe. */
    this.fillTerms = {};
    this.keyLight = null;
    this._keyRef = null;
    this.statusSnapshot = {
      phase: 'idle',
      time: 0,
      units: [],
    };
  }

  select(unitId) {
    this.selectedId = unitId || null;
    return this.selectedId;
  }

  setCaptureMode(on) {
    this.captureClean = Boolean(on);
    this.root.traverse((node) => {
      if (!node.userData?.militaryHudMark) return;
      const unitId = node.name?.startsWith('military:ring:')
        ? node.name.slice('military:ring:'.length)
        : null;
      node.visible = !this.captureClean && (!unitId || unitId === this.selectedId);
    });
    this.statusSnapshot = { ...this.statusSnapshot, captureClean: this.captureClean };
    return this.captureClean;
  }

  /**
   * M8 item 3 — the ground under a unit's own shadow, sampled once per unit
   * and cached until the unit moves more than a metre.
   *
   * The city's ground IS raycastable (`ground:road-*`, `topology:*` and the
   * streetscape all answer a scene ray; it is the port that is `noPick`), so a
   * plain downward probe is enough. The result is the surface the shadow
   * actually falls on: the fill is lifted off that, not off y = 0.
   */
  _fillGroundY(rec) {
    const x = rec.mesh.position.x;
    const z = rec.mesh.position.z;
    const c = rec.fillGround;
    if (c && Math.abs(c.x - x) < 1 && Math.abs(c.z - z) < 1) return c.y;
    let scene = this.root;
    while (scene?.parent) scene = scene.parent;
    let y = 0;
    if (scene) {
      if (!this._groundRay) this._groundRay = new THREE.Raycaster();
      const ray = this._groundRay;
      ray.far = 200;
      ray.set(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObject(scene, true);
      for (const h of hits) {
        let node = h.object;
        while (node && !node.name) node = node.parent;
        const nm = node?.name ?? '';
        if (FILL_GROUND_SKIP.test(nm)) continue;
        if (h.object.material?.colorWrite === false) continue;
        if (h.point.y > FILL_GROUND_MAX_Y) continue;
        y = h.point.y;
        break;
      }
    }
    rec.fillGround = { x, z, y };
    return y;
  }

  setDemo(spec) {
    this.demo = spec;
    this.demoLock = Boolean(spec);
    this.time = 0;
    panelDemoFeed = spec ?? null;
    if (spec?.units?.[0]?.selected) this.selectedId = spec.units[0].id;
    for (const rec of this.units.values()) {
      rec.blockId = null;
      rec.move = null;
    }
    return spec;
  }

  clearDemo() {
    this.demo = null;
    this.demoLock = false;
    panelDemoFeed = null;
  }

  _roster(state) {
    if (this.demoLock && this.demo?.units) return this.demo.units;
    return state?.military?.units ?? [];
  }

  _ensure(row, roster) {
    let rec = this.units.get(row.id);
    if (rec) return rec;
    const mesh = row.kind === 'tank'
      ? makeTank(row.id, this.mats)
      : row.kind === 'drone'
        ? makeDroneWing(row.id, this.mats)
        : makeOfficer(row.id, this.mats);
    const pad = makePad(row.id, this.mats);
    const proxy = makePickProxy(row.id, row.kind);
    const parsed = parseBlockId(row.blockId);
    const slot = slotOnBlock(roster, row);
    const pose = parsed
      ? stationPoseForBlock(parsed.bx, parsed.bz, slot, row.kind)
      : { x: row.x ?? 0, z: row.z ?? 0 };
    mesh.position.set(pose.x, altitudeForKind(row.kind), pose.z);
    mesh.rotation.y = pose.yaw ?? 0;
    pad.position.set(pose.x, 0, pose.z);
    proxy.position.set(pose.x, proxy.position.y, pose.z);
    const ring = makeGroundRing(
      `military:ring:${row.id}`,
      SELECT_RING_CORE_INNER,
      SELECT_RING_OUTER,
      GROUND_RING_COLOR,
      GROUND_RING_OPACITY,
    );
    ring.visible = false;
    // M7 item 3 — the fill lives in the layer root, in world space, because the
    // shadow it lifts runs along a world direction and the unit yaws.
    const fill = makeShadowFill(`military:fill:${row.id}`);
    this.root.add(fill);
    this.root.add(ring);
    this.root.add(mesh);
    this.root.add(pad);
    this.root.add(proxy);
    if (this.captureClean) {
      for (const node of [mesh, ring]) {
        node.traverse((child) => {
          if (child.userData?.militaryHudMark) child.visible = false;
        });
      }
    }
    this.pickTargets.push(proxy);
    rec = {
      id: row.id,
      kind: row.kind,
      mesh,
      pad,
      proxy,
      ring,
      fill,
      blockId: row.blockId ?? null,
      move: null,
      visual: { x: pose.x, z: pose.z, yaw: pose.yaw ?? 0 },
    };
    if (row.moving && row.path?.length) {
      const length = polylineLength(row.path);
      const speed = speedForKind(row.kind);
      rec.move = {
        path: row.path,
        t0: this.time - (length * 0.28) / Math.max(0.01, speed),
        speed,
        length,
        fromYaw: 0,
      };
    }
    this.units.set(row.id, rec);
    return rec;
  }

  _startMove(rec, to, extent) {
    const from = { x: rec.visual.x, z: rec.visual.z };
    const path = unitCorridorPath(from, to, extent);
    rec.move = {
      path,
      t0: this.time,
      speed: speedForKind(rec.kind),
      length: polylineLength(path),
    };
  }

  _puffAt(x, z) {
    if (this.puffs.length > 18) return;
    const mesh = new THREE.Mesh(PUFF_GEOM, PUFF_MAT.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.08, z);
    mesh.renderOrder = 3;
    noPick(mesh);
    this.root.add(mesh);
    this.puffs.push({ mesh, t0: this.time });
  }

  update(dt, elapsed, city = this.city, state = null) {
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.time += step;
    this.city = city ?? this.city;
    const roster = this._roster(state);
    const extent = this.city?.extent ?? cityExtent(4, 4);
    const seen = new Set();
    // M7 item 3 — the key object is found once (a scene traverse is not a
    // per-frame cost worth paying) but its transform is re-read every frame,
    // because the rig moves the key each frame to fit the shadow band.
    if (!this._keyRef) this._keyRef = findKeyLight(this.root);
    const key = readKeyLight(this._keyRef);
    this.keyLight = key;
    for (const row of roster) {
      if (!row?.id || !UNIT_KINDS.includes(row.kind)) continue;
      seen.add(row.id);
      const rec = this._ensure(row, roster);
      const parsed = parseBlockId(row.blockId);
      const slot = slotOnBlock(roster, row);
      const dest = parsed
        ? stationPoseForBlock(parsed.bx, parsed.bz, slot, rec.kind)
        : { x: row.x ?? rec.visual.x, z: row.z ?? rec.visual.z };
      rec.pad.position.set(dest.x, 0, dest.z);
      rec.pad.visible = Boolean(row.blockId);
      if (row.blockId && rec.blockId !== row.blockId && !row.moving) {
        this._startMove(rec, dest, extent);
        rec.blockId = row.blockId;
      } else if (!rec.move) {
        rec.blockId = row.blockId ?? rec.blockId;
      }
      let x = rec.visual.x;
      let z = rec.visual.z;
      let yaw = rec.visual.yaw;
      let alt = altitudeForKind(rec.kind);
      let moving = false;
      if (rec.move && rec.move.length > 0.05) {
        const dist = rec.move.speed * Math.max(0, this.time - rec.move.t0);
        const u = clamp01(dist / rec.move.length);
        const eased = easeInOutCubic(u);
        const pose = samplePolyline(rec.move.path, eased);
        x = pose.x;
        z = pose.z;
        yaw = pose.yaw;
        moving = u < 1;
        if (!this.reducedMotion && rec.kind === 'tank' && moving
          && Math.floor(this.time * 8) !== Math.floor((this.time - step) * 8)) {
          this._puffAt(x, z);
        }
        if (rec.kind === 'drone') {
          alt = DRONE_ALT_M + Math.sin(this.time * 2.4) * 0.35;
        }
        if (u >= 1) rec.move = null;
      } else if (rec.kind === 'drone') {
        x = dest.x;
        z = dest.z;
        alt = DRONE_ALT_M * 0 + 0;
      } else if (!rec.move) {
        x = dest.x;
        z = dest.z;
        yaw = dest.yaw ?? yaw;
      }
      if (rec.kind === 'drone' && !moving) {
        rec.mesh.position.set(dest.x, 0, dest.z);
        const patrol = rec.mesh.userData.patrol;
        if (patrol) {
          const orbit = this.reducedMotion ? 0 : this.time * 0.55;
          const bob = this.reducedMotion ? 0 : Math.sin(this.time * 2.3) * 0.4;
          patrol.position.set(
            Math.sin(orbit) * 3.4,
            DRONE_ALT_M + bob,
            Math.cos(orbit) * 3.4,
          );
          patrol.rotation.y = orbit + Math.PI / 2;
          patrol.rotation.z = this.reducedMotion ? 0 : Math.sin(orbit) * 0.12;
          const patrolPad = rec.mesh.userData.patrolPad;
          if (patrolPad) patrolPad.position.set(patrol.position.x, 0, patrol.position.z);
        }
      } else {
        rec.mesh.position.set(x, rec.kind === 'drone' ? alt : 0, z);
        rec.mesh.rotation.y = yaw;
        if (rec.kind === 'officer') {
          rec.mesh.position.y = moving && !this.reducedMotion
            ? Math.abs(Math.sin(this.time * 9.2)) * 0.08
            : 0;
          const opad = rec.mesh.userData.pad;
          if (opad) opad.position.y = -rec.mesh.position.y;
        }
        if (rec.kind === 'drone' && moving) {
          rec.mesh.rotation.z = this.reducedMotion ? 0 : Math.sin(this.time * 3.1) * 0.08;
          rec.mesh.position.y = alt + (this.reducedMotion ? 0 : Math.sin(this.time * 2.4) * 0.35);
        }
      }
      rec.visual.x = rec.mesh.position.x;
      rec.visual.z = rec.mesh.position.z;
      rec.visual.yaw = rec.mesh.rotation.y;
      rec.proxy.position.set(rec.mesh.position.x, rec.proxy.position.y, rec.mesh.position.z);
      rec.ring.position.set(rec.mesh.position.x, 0, rec.mesh.position.z);
      const groundedRing = rec.mesh.userData.groundRing;
      if (groundedRing) groundedRing.visible = !this.captureClean;
      if (rec.fill) {
        if (key) {
          /*
           * M8 item 3 — the fill has to be lifted off the ground it lands on,
           * not off y = 0. The M8 probe's 11 x 11 height scan under the roster
           * tank returns six distinct surfaces in 16 m: road at 0.020-0.052,
           * the zebra and footpath edges at 0.072-0.085, kerb treads at 0.260,
           * reserve turf at 0.270, hoggin at 0.347 and `topology:flat` at
           * 0.375-0.441. A quad pinned at 0.11 is UNDER four of those six, and
           * the depth test throws away every pixel of it that crosses a kerb.
           * Sampling the ground under the shadow's own centre puts the lift
           * where the shadow is; `MILITARY_SHADOW_FILL.lift` still supplies the
           * clearance above it.
           */
          const gy = this._fillGroundY(rec);
          rec.fillTerm = placeShadowFill(
            rec.fill, rec.kind, rec.mesh.position.x, rec.mesh.position.z, key, gy,
          );
          this.fillTerms[rec.id] = rec.fillTerm;
          rec.fill.visible = true;
        } else {
          rec.fill.visible = false;
        }
      }
      const selected = this.selectedId === rec.id || row.selected === true;
      rec.ring.visible = selected && !this.captureClean;
      if (selected) {
        const wave = this.reducedMotion ? 0 : Math.sin(this.time * 6.2);
        const pulse = 1 + wave * 0.14;
        rec.ring.scale.set(pulse, 1, pulse);
        const face = rec.ring.userData.decal;
        if (face?.material) {
          face.material.opacity = GROUND_RING_OPACITY * (0.94 + Math.min(0, wave) * 0.06);
        }
      }
    }
    for (const [id, rec] of this.units) {
      if (seen.has(id)) continue;
      rec.mesh.parent?.remove(rec.mesh);
      rec.pad.parent?.remove(rec.pad);
      rec.proxy.parent?.remove(rec.proxy);
      if (rec.fill) {
        rec.fill.parent?.remove(rec.fill);
        rec.fill.material?.dispose?.();
      }
      this.pickTargets = this.pickTargets.filter((p) => p !== rec.proxy);
      this.units.delete(id);
    }
    for (let i = this.puffs.length - 1; i >= 0; i -= 1) {
      const puff = this.puffs[i];
      const age = this.time - puff.t0;
      const u = clamp01(age / 0.55);
      puff.mesh.scale.setScalar(0.5 + u * 2.4);
      puff.mesh.material.opacity = 0.4 * (1 - u);
      if (u >= 1) {
        puff.mesh.parent?.remove(puff.mesh);
        puff.mesh.material?.dispose?.();
        this.puffs.splice(i, 1);
      }
    }
    this.statusSnapshot = {
      phase: roster.some((row) => this.units.get(row.id)?.move) ? 'move' : 'stationed',
      time: this.time,
      units: [...this.units.values()].map((rec) => ({
        id: rec.id,
        kind: rec.kind,
        blockId: rec.blockId,
        x: rec.visual.x,
        z: rec.visual.z,
        selected: this.selectedId === rec.id,
        moving: Boolean(rec.move),
      })),
      foliageOverlaps: paradeTreeOverlapCensus(
        [...this.units.values()].map((rec) => ({
          id: rec.id, kind: rec.kind, x: rec.visual.x, z: rec.visual.z,
        })),
        this.city?.trees ?? [],
      ),
      captureClean: this.captureClean,
    };
  }

  status() {
    return this.statusSnapshot;
  }

  subject(phase = 'units') {
    if (phase === 'units' || phase === 'panel') {
      // MC2 F10 — frame the whole roster, not just the selected unit, so what the
      // panel lists is what the viewport shows.
      const recs = [...this.units.values()];
      if (recs.length) {
        let sx = 0;
        let sz = 0;
        for (const rec of recs) {
          sx += rec.visual.x;
          sz += rec.visual.z;
        }
        const cx = sx / recs.length;
        const cz = sz / recs.length;
        let spread = 0;
        for (const rec of recs) {
          spread = Math.max(spread, Math.hypot(rec.visual.x - cx, rec.visual.z - cz));
        }
        return { x: cx, y: 1.4, z: cz, spread: spread + 9 };
      }
    }
    return { x: 96, y: 2, z: 96 };
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.units.clear();
    this.pickTargets = [];
  }
}

export function bindMilitaryDemoConsole(view) {
  const win = globalThis.window;
  if (!win || !view) return;
  if (!win.dd || typeof win.dd !== 'object') win.dd = {};
  const units = view.militaryUnits;
  const attacks = view.militaryAttacks;
  const shipyard = view.militaryShipyard;
  const applyPose = (phase) => {
    const subject = phase === 'raid'
      ? attacks?.subject?.('raid')
      : phase === 'seafight'
        ? attacks?.subject?.('seafight')
        : phase === 'shipyard'
          ? shipyard?.subject?.()
          : units?.subject?.(phase);
    const base = militaryCameraPose(phase, { subject });
    // MC3 F1 — the combat cameras prove their own shot before they take it.
    const sight = phase === 'raid' || phase === 'seafight'
      ? attacks?.sightPoints?.(phase)
      : phase === 'shipyard'
        ? shipyard?.sightPoints?.()
        : null;
    const pose = sight?.length && view.scene
      ? {
        ...base,
        ...chooseClearPose(
          base,
          sight,
          collectSightOccluders(view.scene, base.target, base.distance * 1.9 + 60),
        ),
      }
      : base;
    pose.sight = sight?.length ?? 0;
    // MC3 — M5 cut one PORT OF MELBOURNE plate per pose and left all three
    // live, so the yard shot showed the raid and sea plates edge-on as ghost
    // lettering skidding across the deck. Only the plate cut for this pose
    // shows; the others are hidden, not deleted, so every name survives.
    const plateFor = { raid: 'raid', seafight: 'sea', shipyard: 'yard' }[phase] ?? null;
    for (const id of ['yard', 'raid', 'sea']) {
      const plate = view.scene?.getObjectByName?.(`military:port-name:${id}`);
      if (plate) plate.visible = plateFor === id;
    }
    // The container-zone legend is intentionally one-faced in the inherited
    // port kit and is backwards from the shipyard camera. Keep its name and
    // geometry intact, but let the yard's two-faced plate own this debug pose.
    const legacyPortLetters = view.scene?.getObjectByName?.('fringe:port-letters');
    if (legacyPortLetters) legacyPortLetters.visible = phase !== 'shipyard';
    const rig = view.rig;
    if (rig?.target) {
      rig.target.set(pose.target.x, 0.02, pose.target.z);
      rig.azimuth = pose.azimuth * Math.PI / 180;
      rig.polar = pose.polar * Math.PI / 180;
      rig.distance = pose.distance;
      rig.smoothTarget?.copy?.(rig.target);
      rig.smoothAzimuth = rig.azimuth;
      rig.smoothPolar = rig.polar;
      rig.smoothDistance = rig.distance;
      rig.update?.(1);
    }
    if (phase === 'panel') view.onMilitaryPanel?.(true);
    return pose;
  };
  win.dd.militaryDemo = () => {
    const spec = synthesizeMilitaryDemo(view.city);
    units?.setDemo(spec);
    attacks?.setDemo(spec);
    shipyard?.setDemo(spec);
    view.onMilitaryPanel?.(true);
    return {
      ok: true,
      units: spec.units.length,
      raid: spec.raid,
      sea: spec.sea,
      shipyard: spec.shipyard,
    };
  };
  win.dd.militaryStatus = () => ({
    time: units?.time ?? 0,
    phases: {
      units: units?.status?.() ?? null,
      raid: attacks?.status?.()?.raid ?? null,
      seafight: attacks?.status?.()?.sea ?? null,
      shipyard: shipyard?.status?.() ?? null,
    },
    units: units?.status?.()?.units ?? [],
    captureClean: Boolean(view.militaryCaptureMode),
  });
  win.dd.militaryCapture = (on = true) => {
    const clean = Boolean(on);
    view.militaryCaptureMode = clean;
    units?.setCaptureMode?.(clean);
    view.onMilitaryPanel?.({ capture: clean, open: clean ? false : undefined });
    return {
      clean,
      ringsHidden: clean,
      panelHidden: clean,
      foliageOverlaps: units?.status?.()?.foliageOverlaps ?? [],
    };
  };
  win.dd.militaryCamera = (phase) => applyPose(phase || 'raid');
  if (win.__districtDeck && typeof win.__districtDeck === 'object') {
    win.__districtDeck.militaryDemo = win.dd.militaryDemo;
    win.__districtDeck.militaryStatus = win.dd.militaryStatus;
    win.__districtDeck.militaryCapture = win.dd.militaryCapture;
    win.__districtDeck.militaryCamera = win.dd.militaryCamera;
  }
}
