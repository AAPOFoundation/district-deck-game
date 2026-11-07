// Toy PTV fleet for the inland Southern Cross precinct, plus the shared toy-detail
// primitives the station lane owns (chamfered bars, box merging, small metalwork).
// Presentation only. No Math.random.

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildTramModel, factoryTram, tramFactoryScale } from '../vehicles/tram-model.js';
import { std, addBox, addCyl, addSphere, noPick } from './kit.js';
import { buildMetroTrain, buildVLineTrain, buildPtvBus, paletteFromMats } from './station-models.js';

/**
 * P16 T10B — shadows establish contact, but the ground must still be ground.
 *
 * The live shadow/no-shadow transport pair found zero-valued texels under the
 * restored hedge, belt and windbreak casters.  This bounds only the shadow-map
 * multiplier on authored ground receivers; it does not add emissive fill, alter
 * their unshadowed colour, or soften the caster silhouettes.  Keep the floor
 * above the brief's 0.55 receipt so filtering and the contact decals still have
 * room to read without turning the country into a black cut-out.
 */
export const GROUND_SHADOW_FLOOR = 0.62;

export function applyGroundShadowFloor(material, floor = GROUND_SHADOW_FLOOR) {
  if (!material?.isMaterial) return material;
  const bounded = Math.min(1, Math.max(0, Number.isFinite(floor) ? floor : GROUND_SHADOW_FLOOR));
  if (material.userData.groundShadowFloor === bounded) return material;

  const shadowReturn = 'return mix( 1.0, shadow, shadowIntensity );';
  const boundedReturn = `return max( ${bounded.toFixed(3)}, mix( 1.0, shadow, shadowIntensity ) );`;
  const boundedChunk = THREE.ShaderChunk.shadowmap_pars_fragment
    .split(shadowReturn)
    .join(boundedReturn);
  const previousCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (typeof previousCompile === 'function') previousCompile(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <shadowmap_pars_fragment>',
      boundedChunk,
    );
  };
  const previousKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${previousKey ? previousKey() : ''}|dd-ground-shadow-${bounded.toFixed(3)}`;
  material.userData.groundShadowFloor = bounded;
  material.needsUpdate = true;
  return material;
}

// ---------------------------------------------------------------------------
// Shared toy-detail primitives.
//
// kit.js is shared with the other fringe builders and must not change while they
// are in flight, so the station lane keeps its own geometry helpers here.
// station.js and rail-link.js both import from this module; nothing imports back,
// so there is no cycle.
// ---------------------------------------------------------------------------

/**
 * Extruded octagon along local X — a box whose four long edges are cut at 45deg.
 * Flat shaded, 28 triangles, and the cheapest honest chamfer available to us.
 * Monopoly Plus has no razor edge anywhere; this is how we stop having them.
 */
export function chamferBarGeo(len, w, h, c) {
  const hw = w * 0.5;
  const hh = h * 0.5;
  const cc = Math.max(0.01, Math.min(c, hw * 0.92, hh * 0.92));
  const hx = len * 0.5;
  const prof = [
    [hh, hw - cc], [hh - cc, hw], [-hh + cc, hw], [-hh, hw - cc],
    [-hh, -hw + cc], [-hh + cc, -hw], [hh - cc, -hw], [hh, -hw + cc],
  ];
  const pos = [];
  const nor = [];
  const idx = [];
  let n = 0;
  const push = (x, y, z, nx, ny, nz) => {
    pos.push(x, y, z);
    nor.push(nx, ny, nz);
    n += 1;
  };
  for (let k = 0; k < prof.length; k += 1) {
    const [y0, z0] = prof[k];
    const [y1, z1] = prof[(k + 1) % prof.length];
    const dy = y1 - y0;
    const dz = z1 - z0;
    let ny = dz;
    let nz = -dy;
    const my = (y0 + y1) * 0.5;
    const mz = (z0 + z1) * 0.5;
    if (ny * my + nz * mz < 0) { ny = -ny; nz = -nz; }
    const inv = 1 / Math.max(1e-6, Math.hypot(ny, nz));
    ny *= inv;
    nz *= inv;
    const keep = (dz * ny + (-dy) * nz) >= 0;
    const base = n;
    if (keep) {
      push(-hx, y0, z0, 0, ny, nz);
      push(-hx, y1, z1, 0, ny, nz);
      push(hx, y1, z1, 0, ny, nz);
      push(hx, y0, z0, 0, ny, nz);
    } else {
      push(hx, y0, z0, 0, ny, nz);
      push(hx, y1, z1, 0, ny, nz);
      push(-hx, y1, z1, 0, ny, nz);
      push(-hx, y0, z0, 0, ny, nz);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  for (const side of [1, -1]) {
    const base = n;
    push(hx * side, 0, 0, side, 0, 0);
    for (const [y, z] of prof) push(hx * side, y, z, side, 0, 0);
    for (let k = 0; k < prof.length; k += 1) {
      const a = base + 1 + k;
      const b = base + 1 + ((k + 1) % prof.length);
      if (side > 0) idx.push(base, a, b);
      else idx.push(base, b, a);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/** Adds a chamfered bar. opts.rotX / rotY / rotZ orient it. */
export function addChamferBar(group, mat, len, w, h, c, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(chamferBarGeo(len, w, h, c), mat);
  mesh.position.set(x, y, z);
  if (opts.rotX) mesh.rotation.x = opts.rotX;
  if (opts.rotY) mesh.rotation.y = opts.rotY;
  if (opts.rotZ) mesh.rotation.z = opts.rotZ;
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  mesh.userData.ownsGeometry = true;
  if (opts.name) mesh.name = opts.name;
  noPick(mesh);
  group.add(mesh);
  return mesh;
}

/**
 * Accumulates axis-aligned (optionally yawed) boxes into a single buffer.
 * Sleepers, mullions, balustrade pickets and fence rails are hundreds of tiny
 * members; merging keeps the draw-call count survivable at play camera.
 */
export class BoxMerge {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.idx = [];
    this.n = 0;
  }

  box(w, h, d, x, y, z, ry = 0) {
    const hx = w * 0.5;
    const hy = h * 0.5;
    const hz = d * 0.5;
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const pts = [
      [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
      [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
    ];
    const faces = [
      [4, 5, 6, 7, 0, 0, 1], [1, 0, 3, 2, 0, 0, -1],
      [5, 1, 2, 6, 1, 0, 0], [0, 4, 7, 3, -1, 0, 0],
      [3, 7, 6, 2, 0, 1, 0], [4, 0, 1, 5, 0, -1, 0],
    ];
    for (const [a, b, cc, d2, nx, ny, nz] of faces) {
      const base = this.n;
      for (const ci of [a, b, cc, d2]) {
        const p = pts[ci];
        this.pos.push(x + p[0] * c + p[2] * s, y + p[1], z - p[0] * s + p[2] * c);
        this.nor.push(nx * c + nz * s, ny, -nx * s + nz * c);
        this.n += 1;
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return this;
  }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setIndex(this.idx);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }
}

/**
 * ── P16 T9: THREE MERGES THE CORRIDOR NEEDED AND DID NOT HAVE ──
 *
 * `BoxMerge` is the right instrument for sleepers, mullions, pickets and rails —
 * fabricated members that ARE boxes. It was also carrying the corridor's
 * vegetation, and the blind round named the result exactly: "cube-clump
 * vegetation that reads as unplaced primitives". Crop
 * `plates/r15/bd-transport-landmass.png` at (500, 560) 360 x 200 and the fault is
 * unarguable — a chain of axis-aligned green cubes with lit top faces running
 * diagonally across open ground, and pale cubes on stick trunks beside them.
 *
 * A hedge is not a row of boxes and a shrub is not a box, so neither can be built
 * out of `BoxMerge` however the boxes are jittered. These are the two shapes they
 * actually are, plus the contact decal both of them need.
 */

/**
 * A continuous clipped hedge along a polyline. Six vertices a station — base,
 * shoulder, crown, crown, shoulder, base — which is a chamfered strip with a flat
 * top, the section a laid stock hedge has. Gaps are the CALLER's business: it
 * ends one polyline and starts another at a gate, so a gap is a decision rather
 * than a per-sample dice roll that leaves stubs.
 *
 * The two base vertices take `min(centreline, their own ground)`, which can only
 * bed a corner deeper into the surface and can never open daylight under it.
 * Vertex colours are MULTIPLIERS: 1 on the lit shoulder, ~0.45 at the foot, so the
 * run carries the darker base band that separates it from its own ground.
 */
export class HedgeStrip {
  constructor({ width = 1.5, height = 1.5, groundAt = null } = {}) {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
    this.n = 0;
    this.width = width;
    this.height = height;
    this.groundAt = groundAt;
    this.runs = 0;
    this.stations = 0;
  }

  /** `pts` is [{x, z, h?}] in the caller's local frame. Fewer than two is a stub. */
  run(pts) {
    if (!pts || pts.length < 2) return this;
    const g = this.groundAt ?? (() => 0);
    const halfW = this.width * 0.5;
    const base = this.n;
    const n = pts.length;
    for (let i = 0; i < n; i += 1) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(n - 1, i + 1)];
      let dx = next.x - prev.x;
      let dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const px = -dz;
      const pz = dx;
      const x = pts[i].x;
      const z = pts[i].z;
      const y = g(x, z);
      const h = pts[i].h ?? this.height;
      const shoulderY = y + h * 0.66;
      const crownY = y + h;
      const bw = halfW * 0.88;
      const cw = halfW * 0.44;
      const bx0 = x + px * bw;
      const bz0 = z + pz * bw;
      const bx1 = x - px * bw;
      const bz1 = z - pz * bw;
      const seat = (sx, sz) => Math.min(y, g(sx, sz)) - 0.02;
      const rows = [
        [bx0, seat(bx0, bz0), bz0, 0.58],
        [x + px * halfW, shoulderY, z + pz * halfW, 1.0],
        [x + px * cw, crownY, z + pz * cw, 1.14],
        [x - px * cw, crownY, z - pz * cw, 1.08],
        [x - px * halfW, shoulderY, z - pz * halfW, 0.74],
        [bx1, seat(bx1, bz1), bz1, 0.52],
      ];
      for (const [rx, ry, rz, k] of rows) {
        this.pos.push(rx, ry, rz);
        this.col.push(k, k, k);
        this.n += 1;
      }
      // Normals: the shoulder pair points out, the crown pair up, the base pair
      // out and slightly down. Cheap and correct enough for a 6 px mark.
      this.nor.push(px, -0.12, pz);
      this.nor.push(px, 0.20, pz);
      this.nor.push(px * 0.34, 0.94, pz * 0.34);
      this.nor.push(-px * 0.34, 0.94, -pz * 0.34);
      this.nor.push(-px, 0.20, -pz);
      this.nor.push(-px, -0.12, -pz);
      this.stations += 1;
    }
    for (let i = 0; i < n - 1; i += 1) {
      const a = base + i * 6;
      const b = a + 6;
      for (let k = 0; k < 5; k += 1) {
        this.idx.push(a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k);
      }
    }
    const sN = base + (n - 1) * 6;
    for (let k = 1; k < 5; k += 1) {
      this.idx.push(base, base + k + 1, base + k);
      this.idx.push(sN, sN + k, sN + k + 1);
    }
    this.runs += 1;
    return this;
  }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.idx);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }
}

/**
 * Layered canopy lobes — the corridor's answer to the same fault the ring's
 * `makeTreeGeometry` had. A lobe is a low-poly ellipsoid, offset in plan so the
 * per-plant heading reaches the outline, and each one carries a darker underside
 * band in its vertex colour so the masses separate from one another.
 */
export class LobeMerge {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
    this.n = 0;
    this.lobes = 0;
  }

  /** One lobe: centre (x, y, z), radius r, vertical squash `flat`, tone multiplier. */
  lobe(x, y, z, r, flat = 0.86, tone = 1, seg = 5, rings = 4) {
    const g = new THREE.SphereGeometry(1, seg, rings);
    g.scale(r, r * flat, r);
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const gi = g.index;
    const base = this.n;
    const ry = r * flat;
    for (let i = 0; i < pos.count; i += 1) {
      const ly = pos.getY(i);
      this.pos.push(x + pos.getX(i), y + ly, z + pos.getZ(i));
      this.nor.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      // A BAND, not a gradient: full shade below 0.24 of the lobe's own height.
      const t = Math.max(0, Math.min(1, ((ly + ry) / (2 * ry) - 0.24) / 0.28));
      const k = (0.42 + 0.66 * t) * tone;
      this.col.push(k, k, Math.min(1.3, k * 0.97));
      this.n += 1;
    }
    for (let i = 0; i < gi.count; i += 1) this.idx.push(gi.getX(i) + base);
    g.dispose();
    this.lobes += 1;
    return this;
  }

  /** A tapered stem from (x, y0, z) to (x + dx, y1, z + dz). Bark tone. */
  stem(x, y0, z, dx, y1, dz, r0, r1, seg = 4) {
    const ex = x + dx;
    const ez = z + dz;
    const len = Math.hypot(dx, y1 - y0, dz);
    if (len < 1e-4) return this;
    const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true);
    g.translate(0, len * 0.5, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dx / len, (y1 - y0) / len, dz / len),
    );
    g.applyQuaternion(q);
    g.translate(x, y0, z);
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const gi = g.index;
    const base = this.n;
    for (let i = 0; i < pos.count; i += 1) {
      this.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      this.nor.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      // Warm and dark against the leaf tone, on the same one material.
      this.col.push(0.62, 0.40, 0.26);
      this.n += 1;
    }
    if (gi) for (let i = 0; i < gi.count; i += 1) this.idx.push(gi.getX(i) + base);
    else for (let i = 0; i < pos.count; i += 1) this.idx.push(i + base);
    g.dispose();
    void ex;
    void ez;
    return this;
  }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.idx);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }
}

/**
 * Feathered multiply contact decals. Same argument as the ring's: an OPAQUE patch
 * has to know the colour of the ground it covers and will be wrong about it, while
 * a multiply never has to know — white is a no-op and grey darkens whatever is
 * there. Rim multipliers are exactly 1, so the polygon boundary cannot show.
 */
export class ContactMerge {
  constructor({ groundAt = null, lift = 0.045 } = {}) {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
    this.n = 0;
    this.groundAt = groundAt;
    this.lift = lift;
    this.discs = 0;
  }

  disc(x, z, rad, dark = 0.80, seg = 6, yaw = 0) {
    const g = this.groundAt ?? (() => 0);
    const base = this.n;
    this.pos.push(x, g(x, z) + this.lift, z);
    this.nor.push(0, 1, 0);
    this.col.push(dark, dark, dark * 1.04);
    this.n += 1;
    const mid = 1 - (1 - dark) * 0.45;
    for (let ring = 0; ring < 2; ring += 1) {
      const rk = ring === 0 ? 0.6 : 1;
      for (let i = 0; i < seg; i += 1) {
        const a = (i / seg) * Math.PI * 2 + yaw;
        const px = x + Math.sin(a) * rad * rk;
        const pz = z + Math.cos(a) * rad * rk;
        this.pos.push(px, g(px, pz) + this.lift, pz);
        this.nor.push(0, 1, 0);
        const v = ring === 0 ? mid : 1;
        this.col.push(v, v, v);
        this.n += 1;
      }
    }
    const inner = base + 1;
    const outer = base + 1 + seg;
    for (let i = 0; i < seg; i += 1) {
      const j = (i + 1) % seg;
      this.idx.push(base, inner + i, inner + j);
      this.idx.push(inner + i, outer + i, outer + j);
      this.idx.push(inner + i, outer + j, inner + j);
    }
    this.discs += 1;
    return this;
  }

  /** A ribbon under a polyline — the hedge's own contact. */
  ribbon(pts, width, dark = 0.80) {
    if (!pts || pts.length < 2) return this;
    const g = this.groundAt ?? (() => 0);
    const base = this.n;
    const n = pts.length;
    const halfW = width * 0.5;
    // See `makeStripContact` in fringe.js: a multiply compounds per layer, and the
    // corridor's field divisions cross its boundary hedges, so three and four
    // layers land on the same ground. 2.1 -> 1.35 of the half width.
    const outer = halfW * 1.35;
    for (let i = 0; i < n; i += 1) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(n - 1, i + 1)];
      let dx = next.x - prev.x;
      let dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const px = -dz;
      const pz = dx;
      const offs = [-outer, -halfW, 0, halfW, outer];
      const vals = [1, dark + (1 - dark) * 0.35, dark, dark + (1 - dark) * 0.35, 1];
      for (let k = 0; k < 5; k += 1) {
        const ox = pts[i].x + px * offs[k];
        const oz = pts[i].z + pz * offs[k];
        this.pos.push(ox, g(ox, oz) + this.lift, oz);
        this.nor.push(0, 1, 0);
        this.col.push(vals[k], vals[k], vals[k]);
        this.n += 1;
      }
    }
    for (let i = 0; i < n - 1; i += 1) {
      const a = base + i * 5;
      const b = a + 5;
      for (let k = 0; k < 4; k += 1) {
        this.idx.push(a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k);
      }
    }
    return this;
  }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.idx);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }
}

/** The one material every contact decal in the corridor shares. */
export function contactMaterial() {
  /**
   * ── `premultipliedAlpha: true` IS LOAD-BEARING, AND THE PLATE PROVED IT TWICE ──
   *
   * three r185's `WebGLState` rejects `MultiplyBlending` without it: it calls
   * `error('MultiplyBlending requires material.premultipliedAlpha = true')` and
   * then sets NO blend func at all, so the draw falls through to whatever state
   * was last bound and the decal paints as an OPAQUE PLATE. `waterShadowMat` in
   * port.js and `hullContact` in ships.js both carry this note already; this lane
   * shipped the first T9-wip plate without the flag and reproduced it exactly —
   * every contact patch in precisely the right place, in precisely the right
   * shape, painted near-white ON the ground instead of into it. Measured on
   * `plates/T9-wip/bd-transport-landmass.png` before the fix: the decal at
   * (684, 621) read rgb (227, 225, 223) against ground of (118, 107, 78), and
   * 9.9 % of the corridor window sat over luma 200 against r15's 1.2 %. A contact
   * shadow that lightens the ground is worse than no contact shadow.
   *
   * With the flag the func is `(DST_COLOR, ONE_MINUS_SRC_ALPHA)`, so at alpha 1
   * the result is `dst * src` — the multiply the whole design rests on. Opacity is
   * therefore left at 1 deliberately: anything less re-introduces the `dst *
   * (1 - a)` term and the rim stops being a no-op.
   *
   * `toneMapped: false` for the same reason. These vertex values are FACTORS, not
   * colours; putting them through the tone curve would make the rim something
   * other than 1 and draw the decal's own polygon edge on the ground.
   *
   * `fog: false`, and this one reverses an earlier decision in this lane. Fog on a
   * basic material mixes the fragment toward the fog colour, which out here is a
   * pale haze — attractive as "aerial perspective on a shadow" until you notice it
   * lifts the RIM off 1.0 as well, which paints a faint quad edge round every
   * patch. The rim being exactly 1 is what makes the decal edgeless, so nothing is
   * allowed to move it.
   */
  return new THREE.MeshBasicMaterial({
    color: '#ffffff',
    vertexColors: true,
    transparent: true,
    premultipliedAlpha: true,
    blending: THREE.MultiplyBlending,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
}

/** Drops a merged batch into the scene as one mesh. */
export function addMerged(group, merge, mat, opts = {}) {
  if (!merge.n) return null;
  const mesh = new THREE.Mesh(merge.build(), mat);
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  mesh.userData.ownsGeometry = true;
  if (opts.name) mesh.name = opts.name;
  noPick(mesh);
  group.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// Ground-edge apron.
//
// Both transport venues stand on a raised tray — the station on a bluestone
// plinth, the airport on a soil-and-turf platform — and both trays previously
// ended in a raw vertical face onto the annulus. Measured on the r0 board plate's
// own geometry: the station's inland tray face stands 2.28-2.37 m proud of the
// terrain along its whole length, the airport's south face 2.85 m, and the
// station's seaward grass verge overhangs its plinth by 3 m with 0.5-1.15 m of
// air under it. That is gate 4's stated failure ("no hard polygon lip between two
// ground materials") and, on the verge, the floating-geometry veto as well.
//
// The fix has to follow the real terrain, because the terrain is not flat: over
// one 92 m tray edge it runs from local -1.65 to +0.93. So this builds a ribbon
// from a sampled ground function rather than a fixed batter, and lets the run per
// station fall out of the local rise. Where the ground is already above the tray
// the ribbon buries itself instead of standing a wall back up.
//
// Three bands, in the order the eye reads them down the slope: a rolled crown
// just inside the tray edge, the batter face, and a toe apron that runs out onto
// the open ground. Rubble at the toe, tussocks past it and a post-and-wire
// boundary fence on the crown break the run so no band stays straight.
// ---------------------------------------------------------------------------

/** Accumulates quads with flat face normals. Two triangles and no shared normals. */
export class StripMerge {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.idx = [];
    this.n = 0;
  }

  /** a, b, c, d are [x, y, z] in winding order. */
  quad(a, b, c, d) {
    const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
    const vx = d[0] - a[0]; const vy = d[1] - a[1]; const vz = d[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return this;
    nx /= len; ny /= len; nz /= len;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const base = this.n;
    for (const p of [a, b, c, d]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.n += 1;
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return this;
  }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setIndex(this.idx);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }
}

/** Deterministic unit in [0,1). Index maths only — no Math.random anywhere here. */
function apronUnit(seed, salt) {
  const n = Math.imul((seed >>> 0) ^ (salt >>> 0), 2246822519) >>> 0;
  const m = Math.imul(n ^ (n >>> 13), 3266489917) >>> 0;
  return ((m ^ (m >>> 16)) >>> 0) / 4294967296;
}

/**
 * Walks a closed local-space polygon at a fixed pitch, returning stations with an
 * outward unit normal and the polygon's own interpolated top height.
 *
 * `loop` entries are [x, z] or [x, z, topY]. Outward is derived from the signed
 * area, so a loop wound either way gives normals that point away from the venue.
 */
export function walkLoop(loop, step = 3.0) {
  const pts = loop.map((p) => ({ x: p[0], z: p[1], y: p.length > 2 ? p[2] : 0 }));
  let area = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a.x * b.z - b.x * a.z;
  }
  const sign = area > 0 ? 1 : -1;
  const out = [];
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const n = Math.max(1, Math.round(len / step));
    const nx = (dz / len) * sign;
    const nz = (-dx / len) * sign;
    for (let k = 0; k < n; k += 1) {
      const t = k / n;
      out.push({
        x: a.x + dx * t, z: a.z + dz * t, y: a.y + (b.y - a.y) * t, nx, nz, seg: i,
      });
    }
  }
  return out;
}

/**
 * taste W36: a test for "this x, z lies in one of these quads" (each `[x0, z0, x1, z1, x2, z2, x3, z3]` in winding order), split along the
 * same diagonal the strips are drawn on, so it covers what `StripMerge.quad` draws. The edge counts as inside.
 */
function quadsFootprint(quads) {
  const boxes = quads.map((q) => [Math.min(q[0], q[2], q[4], q[6]), Math.max(q[0], q[2], q[4], q[6]), Math.min(q[1], q[3], q[5], q[7]), Math.max(q[1], q[3], q[5], q[7])]);
  const inTri = (x, z, ax, az, bx, bz, cx, cz) => {
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-9) return false;
    const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
    const w = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
    return u >= -1e-6 && w >= -1e-6 && u + w <= 1 + 1e-6;
  };
  return (x, z) => {
    for (let i = 0; i < quads.length; i += 1) {
      const b = boxes[i];
      if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue;
      const q = quads[i];
      if (inTri(x, z, q[0], q[1], q[2], q[3], q[4], q[5]) || inTri(x, z, q[0], q[1], q[4], q[5], q[6], q[7])) return true;
    }
    return false;
  };
}

/**
 * Terrain-following edge apron. Returns the meshes it added so a caller can name
 * or re-tone them.
 *
 * taste W36: where it lays a wrap road, it also publishes the road's footprint (channel, seal, shoulder and verge: every quad it drew, from
 * the channel line to the verge's outer toe) as `group.userData.wrapRoadFootprint(lx, lz)`, in the group's own x, z; a venue that places
 * its group turns that into a parent-space test (`fringe/station.js`). The farm gateway track breaks its runs there (`farm.js`).
 *
 * opts.groundLocal(x, z) must return the open-ground height in the SAME local
 * space as the loop. Callers derive it from `plan.groundAt` (the surface that
 * actually renders) and fall back to `plan.heightAt` only when the live sampler
 * is absent, so nothing here copies a terrain constant.
 *
 * opts.keepOut(x, z) — board-AAA r2, and the reason this parameter exists rather
 * than another entry in `fenceSkip`. r1 planted this function's boundary fence
 * across the Tullamarine runway: 39 of 124 posts stood on runway pavement, 35 of
 * them on the deck itself and four on the painted numerals, because the fence is
 * offset INBOARD from the tray edge and the runway pavement reaches to within
 * 0.4 m of that same edge. `fenceSkip` could have taken the one run a critic
 * pointed at, and would have left the four posts at the north ends of the two
 * side runs standing on the runway shoulder — the same defect on a run nobody had
 * looked at. A keep-out is a property of the GROUND, so it is tested per station
 * and it governs every family this function plants: posts, wire spans, rubble and
 * tussocks alike. Segment lists cannot express that and should not be asked to.
 */
export function addGroundApron(group, opts) {
  const {
    loop, groundLocal, mats, seed = 0, salt = 0,
    step = 3.0, slope = 2.3, minRun = 1.4, maxRun = 13, toeRun = 2.4,
    crownIn = 0.9, fence = true, fenceIn = 1.9, fenceH = 1.35,
    fenceSkip = null, rubblePitch = 7, name = 'apron',
    keepOut = null, coping = null, tuftSegs = null, tuftBoost = 1,
    kerb = false, guard = false, grates = false, contact = false,
    wrapRoad = false, wrapWidth = 3.6, wrapOut = 1.1, wrapSkip = null,
  } = opts;
  const blocked = typeof keepOut === 'function' ? keepOut : () => false;
  const stations = walkLoop(loop, step);
  const nS = stations.length;
  if (nS < 3) return [];

  // Per-station section, solved once against the real ground.
  const sect = stations.map((s, i) => {
    const g0 = groundLocal(s.x + s.nx * minRun, s.z + s.nz * minRun);
    const rise = s.y - g0;
    const run = Math.max(minRun, Math.min(maxRun, minRun + Math.max(0, rise) * slope));
    const wob = (apronUnit(seed, salt + i * 37) - 0.5) * 1.5;
    const runW = Math.max(minRun * 0.7, run + wob);
    const gToeW = groundLocal(s.x + s.nx * runW, s.z + s.nz * runW);
    const outR = runW + toeRun * (0.7 + apronUnit(seed, salt + 900 + i * 11) * 0.8);
    const gOut = groundLocal(s.x + s.nx * outR, s.z + s.nz * outR);
    return {
      ...s, i, run: runW, outR, rise, ground: gToeW,
      // The crown must stay PROUD of the tray for its whole inboard run and only
      // cross below the tray top at the edge itself. An earlier section put the
      // crown's inner row 0.05 above the tray and its outer row 0.10 below, which
      // crosses the tray plane 0.4 m inboard: the strip then appears, vanishes
      // into the paving, and reappears past the edge. Inner +0.06, lip -0.02 at
      // 0.30 m outboard grazes the tray top exactly at the edge and roofs the
      // tray's own vertical face from there down.
      crown: [s.x - s.nx * crownIn, s.y + 0.06, s.z - s.nz * crownIn],
      lip: [s.x + s.nx * 0.30, s.y - 0.02, s.z + s.nz * 0.30],
      toe: [s.x + s.nx * runW, Math.min(s.y - 0.14, gToeW - 0.03), s.z + s.nz * runW],
      out: [s.x + s.nx * outR, Math.min(s.y - 0.16, gOut + 0.02), s.z + s.nz * outR],
    };
  });

  const crownM = new StripMerge();
  const faceM = new StripMerge();
  const faceAltM = new StripMerge();
  const toeM = new StripMerge();
  const toeAltM = new StripMerge();
  // Second tone on the batter face and the toe, in irregular runs.
  //
  // The r1 critic measured one green value holding for 48 consecutive plate rows
  // down this batter. A coping band caps the top of it and tussocks break the
  // bottom, but the face between them is still a single lambert ribbon across
  // half the frame's width, which is the gate-2 tell the bar names. This is the
  // same treatment that won gate 2 on the permanent way: three sleeper tones in a
  // wandering pattern rather than one. Runs are 2-5 stations long from seeded
  // index maths, so the join never falls on a regular pitch.
  let runLeft = 0;
  let runAlt = false;
  for (let i = 0; i < nS; i += 1) {
    const a = sect[i];
    const b = sect[(i + 1) % nS];
    if (runLeft <= 0) {
      runAlt = apronUnit(seed, salt + 12000 + i * 53) < 0.42;
      runLeft = 2 + Math.floor(apronUnit(seed, salt + 13000 + i * 59) * 4);
    }
    runLeft -= 1;
    if (a.seg !== b.seg && Math.hypot(b.x - a.x, b.z - a.z) > step * 2.2) continue;
    crownM.quad(a.crown, b.crown, b.lip, a.lip);
    (runAlt && mats.faceAlt ? faceAltM : faceM).quad(a.lip, b.lip, b.toe, a.toe);
    (runAlt && mats.toeAlt ? toeAltM : toeM).quad(a.toe, b.toe, b.out, a.out);
  }
  const added = [];
  const push = (m) => { if (m) added.push(m); };
  push(addMerged(group, crownM, mats.crown, { cast: false, name: `${name}:crown` }));
  push(addMerged(group, faceM, mats.face, { cast: false, name: `${name}:face` }));
  push(addMerged(group, toeM, mats.toe, { cast: false, name: `${name}:toe` }));
  if (mats.faceAlt) push(addMerged(group, faceAltM, mats.faceAlt, { cast: false, name: `${name}:face-alt` }));
  if (mats.toeAlt) push(addMerged(group, toeAltM, mats.toeAlt, { cast: false, name: `${name}:toe-alt` }));

  // Stone coping on the crown, for the runs that ask for it.
  //
  // r1's seaward station edge was the largest lane-owned flat surface in the
  // frame — one green value held for 48 consecutive plate rows. A coping band is
  // the treatment MP-5 carries along its yard edge at a comparable size: a light
  // masonry line laid over the top of the batter, which puts a hard value change
  // exactly where the eye reads the level break. Two tones alternating on the
  // index, because a coping run in one lambert colour is the gate-2 tell again in
  // a different place.
  if (coping && mats.coping) {
    const cop = new BoxMerge();
    const copAlt = new BoxMerge();
    const cw = coping.w ?? 0.85;
    const ch = coping.h ?? 0.5;
    const inset = coping.inset ?? 0.14;
    let laid = 0;
    for (let i = 0; i < nS; i += 1) {
      const s = sect[i];
      if (coping.segs && !coping.segs.includes(s.seg)) continue;
      if (blocked(s.x, s.z)) continue;
      const t = sect[(i + 1) % nS];
      if (t.seg !== s.seg && Math.hypot(t.x - s.x, t.z - s.z) > step * 2.2) continue;
      // The band straddles the lip: `inset` outboard of the loop line so its
      // outer face caps the top of the batter rather than floating over it.
      const cx = s.x + s.nx * inset;
      const cz = s.z + s.nz * inset;
      const u = apronUnit(seed, salt + 11000 + i * 43);
      // BoxMerge maps local +X to world (cos ry, -sin ry) — the same convention
      // the fence wire uses, and the same one that laid every wire across its own
      // line when it was guessed instead of read. With ry = atan2(nx, nz) the
      // box's X runs ALONG the loop and its Z runs across it, so the band's
      // LENGTH is the first argument and its width is the third. Passing them the
      // other way round laid seventeen 0.85 m stubs at a 3.1 m pitch: a dashed
      // line with 22 px gaps, caught by raycasting the critic's own plate column
      // and finding crown-then-face with nothing between them.
      const yaw = Math.atan2(s.nx, s.nz);
      const drop = (u - 0.5) * 0.05;
      (i % 2 ? copAlt : cop).box(step * 1.06, ch, cw, cx, s.y + ch * 0.5 - 0.16 + drop, cz, yaw);
      laid += 1;
    }
    if (laid) {
      push(addMerged(group, cop, mats.coping, { name: `${name}:coping` }));
      if (mats.copingAlt) push(addMerged(group, copAlt, mats.copingAlt, { name: `${name}:coping-alt` }));
    }
  }

  // Rubble at the toe and tussocks past it. Both are the gate-4 "rock band or
  // scatter of patches" clause, and both break the batter's straight run.
  if (mats.rubble) {
    const rub = new BoxMerge();
    const rubDark = new BoxMerge();
    for (let i = 0; i < nS; i += 1) {
      // Was `i % rubblePitch !== (i * 3) % 3`. `(i * 3) % 3` is identically zero,
      // so that selected the same series this does — but it would have stopped
      // doing so the moment anyone edited `rubblePitch`, which is the condition
      // class the bar's rule 5 exists for. Same series, stated honestly.
      if (i % rubblePitch !== 0) continue;
      const s = sect[i];
      if (blocked(s.x, s.z)) continue;
      const u = apronUnit(seed, salt + 2000 + i * 17);
      const v = apronUnit(seed, salt + 3000 + i * 23);
      const n = 2 + Math.floor(u * 3);
      for (let k = 0; k < n; k += 1) {
        const w = apronUnit(seed, salt + 4000 + i * 31 + k * 7);
        const off = s.run - 0.5 + w * 2.2;
        const sw = 0.45 + w * 0.75;
        const drop = 0.20 + v * 0.26;
        const bx = s.x + s.nx * off + s.nz * (v - 0.5) * step * 0.8;
        const bz = s.z + s.nz * off - s.nx * (v - 0.5) * step * 0.8;
        const by = groundLocal(bx, bz) + drop * 0.28;
        // Biased 70/30 to the dark tone, not alternating. At 1:1 the pale
        // instances read as dropped cartons on grass and the dark ones read as
        // rock, so an even mix spends half the family on the wrong reading.
        const pale = apronUnit(seed, salt + 4500 + i * 13 + k * 3) < 0.3;
        (pale ? rub : rubDark).box(sw, drop, sw * (0.7 + w * 0.6), bx, by, bz, u * 2.6 + k);
      }
    }
    push(addMerged(group, rub, mats.rubble, { cast: false, name: `${name}:rubble` }));
    if (mats.rubbleDark) push(addMerged(group, rubDark, mats.rubbleDark, { cast: false, name: `${name}:rubble-dark` }));
  }
  if (mats.tuft) {
    const tuft = new BoxMerge();
    const tuftDry = new BoxMerge();
    for (let i = 0; i < nS; i += 1) {
      const s0 = sect[i];
      // Named runs carry more planting than the rest of the loop. The seaward
      // station run is a 48-row flat green at the hero camera and rubble is
      // skipped along it by design, so tussocks are the only scatter it gets.
      const boost = (tuftSegs && tuftSegs.includes(s0.seg)) ? tuftBoost : 1;
      const u = apronUnit(seed, salt + 5000 + i * 13);
      if (u < 0.34 / boost) continue;
      const s = sect[i];
      if (blocked(s.x, s.z)) continue;
      const n = Math.min(6, Math.round((1 + Math.floor(u * 3)) * boost));
      for (let k = 0; k < n; k += 1) {
        const w = apronUnit(seed, salt + 6000 + i * 19 + k * 5);
        // Distributed DOWN the batter, not marched outward past its foot.
        //
        // r1 stepped each successive tussock a further 1.3 m outboard from a
        // mid-slope start, so with the boosted counts most of the family landed
        // beyond the toe on open ground: raycasting the critic's own plate column
        // found the batter face holding one surface for 48 unbroken rows with the
        // tussocks all sitting below it. Spreading them over 0.15 to 1.35 of the
        // run puts about three quarters on the face, where they break the vertical
        // run, and keeps the rest past the toe, where they soften the ground join
        // that gate 4 is scored on.
        const spread = 0.15 + 1.2 * ((k + 0.35 + w * 0.3) / n);
        const off = 0.30 + (s.run - 0.30) * spread;
        // 0.7 rather than 1.1: at +/- 0.55 of a step the tussock lands beyond the
        // end of its own ribbon quad often enough that corner seating becomes a
        // guess, and twelve of them ended up hanging over the station's seaward
        // corner. At +/- 0.35 it stays inside the strip it is seated against.
        const lat = (w - 0.5) * step * 0.7;
        const bx = s.x + s.nx * off + s.nz * lat;
        const bz = s.z + s.nz * off - s.nx * lat;
        const h = 0.26 + w * 0.3;
        // Seat on the BATTER SURFACE where the tussock is on the slope, and on
        // the open ground only once it is past the toe.
        //
        // r1 seated every tussock on `groundLocal`, which is the ground at the
        // FOOT of the batter. A tussock two thirds of the way up a 2.3 m slope
        // was therefore placed a metre and a half below the face ribbon it should
        // have been standing on, and vanished under it. That is why the r1 critic
        // could measure 48 unbroken rows of one green down this face while the
        // family that was supposed to break it was reported as present: it was
        // present, and buried. Found by raycasting the critic's own plate column
        // and seeing tussocks only below the toe.
        //
        // "On the slope" is decided against the QUADS the ribbon is actually made
        // of, not against this station's section alone. The tussock carries a
        // tangential offset of up to half a step, so near a corner it can sit
        // beyond the end of its own strip and over open ground; testing only the
        // outward distance says "on the slope" there and leaves it hanging. One
        // did, by 0.56 m, in frame, on the airport's south-east corner — found by
        // raycasting, not by eye. Each candidate quad is tested for BOTH its
        // tangential extent and its outward run, exactly as it is built, and the
        // lowest qualifying surface wins so a corner errs into the ground.
        let slopeY = Infinity;
        let onSlope = false;
        for (let dj = -1; dj <= 1; dj += 1) {
          const qa = sect[(i + dj + nS) % nS];
          const qb = sect[(i + dj + 1 + nS) % nS];
          // the same test the ribbon build uses to decide whether a quad exists
          if (qa.seg !== qb.seg && Math.hypot(qb.x - qa.x, qb.z - qa.z) > step * 2.2) continue;
          const ex = qb.x - qa.x;
          const ez = qb.z - qa.z;
          const el2 = ex * ex + ez * ez;
          if (el2 < 1e-6) continue;
          const uu = ((bx - qa.x) * ex + (bz - qa.z) * ez) / el2;
          if (uu < 0 || uu > 1) continue;
          const cu = Math.min(1, Math.max(0, uu));
          const nxq = qa.nx + (qb.nx - qa.nx) * cu;
          const nzq = qa.nz + (qb.nz - qa.nz) * cu;
          const dOut = (bx - (qa.x + ex * cu)) * nxq + (bz - (qa.z + ez * cu)) * nzq;
          const runq = qa.run + (qb.run - qa.run) * cu;
          const t = (dOut - 0.30) / Math.max(0.4, runq - 0.30);
          if (t <= 0.02 || t >= 0.98) continue;
          const lipY = qa.lip[1] + (qb.lip[1] - qa.lip[1]) * cu;
          const toeY = qa.toe[1] + (qb.toe[1] - qa.toe[1]) * cu;
          onSlope = true;
          slopeY = Math.min(slopeY, lipY + (toeY - lipY) * t);
        }
        const by = (onSlope ? slopeY : Math.min(groundLocal(bx, bz), s.y - 0.1)) + h * 0.42;
        (w > 0.55 ? tuftDry : tuft).box(0.34 + w * 0.3, h, 0.3 + w * 0.26, bx, by, bz, u * 3.1 + k * 0.7);
      }
    }
    push(addMerged(group, tuft, mats.tuft, { cast: false, name: `${name}:tuft` }));
    if (mats.tuftDry) push(addMerged(group, tuftDry, mats.tuftDry, { cast: false, name: `${name}:tuft-dry` }));
  }

  // Post-and-wire boundary fence on the crown. Real rail and airfield land is
  // fenced to its boundary; MP-5 puts chain-link along the whole yard edge and it
  // is the single most reliable "this is a real site" signal in that still.
  if (fence && mats.post) {
    const posts = new BoxMerge();
    const wires = new BoxMerge();
    const every = Math.max(1, Math.round(4.0 / step));
    // Two passes, because a post is only furniture if it holds a wire.
    //
    // The single-pass version emitted the post first and then discovered its
    // neighbour was ineligible, which is how r1 left one post standing on the
    // station's west coping with no wire either side — the critic found it and it
    // is exactly what a keep-out would have multiplied along the new boundary.
    // Pass 1 decides eligibility; pass 2 emits only posts that carry at least one
    // span, so the family cannot leave orphans anywhere.
    const stn = [];
    for (let i = 0; i < nS; i += every) {
      const s = sect[i];
      const px = s.x - s.nx * fenceIn;
      const pz = s.z - s.nz * fenceIn;
      // Runs that already carry their own boundary treatment are skipped rather
      // than fenced twice: a post driven through an existing shrub row reads as
      // interpenetration, not as furniture.
      const skipped = Boolean(fenceSkip && fenceSkip.includes(s.seg));
      // The keep-out is tested at the POST's own footprint, not at the station on
      // the loop line, because the post stands `fenceIn` INBOARD of that line and
      // it is the inboard point that lands on somebody's pavement. r1 tested
      // neither and put 39 posts on a runway.
      stn.push({ i, s, px, pz, ok: !skipped && !blocked(px, pz) });
    }
    const nP = stn.length;
    const spanOk = stn.map((a, k) => {
      const b = stn[(k + 1) % nP];
      if (!a.ok || !b.ok) return false;
      if (blocked((a.px + b.px) * 0.5, (a.pz + b.pz) * 0.5)) return false;
      const len = Math.hypot(b.px - a.px, b.pz - a.pz);
      return len >= 0.2 && len <= step * every * 2.0;
    });
    for (let k = 0; k < nP; k += 1) {
      const a = stn[k];
      if (!a.ok) continue;
      if (!spanOk[k] && !spanOk[(k - 1 + nP) % nP]) continue;
      const { i, s, px, pz } = a;
      const lean = (apronUnit(seed, salt + 7000 + i * 29) - 0.5) * 0.1;
      const h = fenceH * (0.94 + apronUnit(seed, salt + 7500 + i * 41) * 0.12);
      posts.box(0.15, h, 0.15, px, s.y + h * 0.5 - 0.06, pz, lean);
      if (!spanOk[k]) continue;
      const b = stn[(k + 1) % nP];
      const dx = b.px - px;
      const dz = b.pz - pz;
      const len = Math.hypot(dx, dz);
      // BoxMerge maps a box's local +X to world (cos ry, 0, -sin ry), so a bar
      // laid along (dx, dz) needs ry = atan2(-dz, dx). Getting this backwards
      // draws every wire across its own fence line instead of along it.
      const yaw = Math.atan2(-dz, dx);
      for (const [hf, th] of [[0.94, 0.05], [0.62, 0.04], [0.32, 0.04]]) {
        wires.box(len, th, th, px + dx * 0.5, s.y + h * hf - 0.06, pz + dz * 0.5, yaw);
      }
    }
    push(addMerged(group, posts, mats.post, { name: `${name}:fence-post` }));
    push(addMerged(group, wires, mats.wire ?? mats.post, { cast: false, name: `${name}:fence-wire` }));
  }

  // P15 TR — slabs meet the ground as a built edge, not a razor drop.
  // Kerb, guard, grate and contact families share the already-solved section so
  // they cannot drift off the batter they belong to. Wrap road is the paved
  // service lane outboard of the toe; keep-out and wrapSkip keep it off runway
  // pavement and off the station's already-furnished seaward verge.
  if (kerb && mats.kerb) {
    const kerbs = new BoxMerge();
    for (let i = 0; i < nS; i += 1) {
      const s = sect[i];
      const t = sect[(i + 1) % nS];
      if (s.seg !== t.seg && Math.hypot(t.x - s.x, t.z - s.z) > step * 2.2) continue;
      const yaw = Math.atan2(s.nx, s.nz);
      kerbs.box(step * 1.04, 0.22, 0.34, s.lip[0], s.y + 0.10, s.lip[2], yaw);
    }
    push(addMerged(group, kerbs, mats.kerb, { name: `${name}:kerb` }));
  }
  if (guard && mats.guard) {
    const gPost = new BoxMerge();
    const gRail = new BoxMerge();
    const every = Math.max(1, Math.round(2.4 / step));
    for (let i = 0; i < nS; i += every) {
      const s = sect[i];
      if (fenceSkip && fenceSkip.includes(s.seg)) continue;
      const px = s.x + s.nx * 0.18;
      const pz = s.z + s.nz * 0.18;
      if (blocked(px, pz)) continue;
      const h = 0.92;
      gPost.box(0.08, h, 0.08, px, s.y + h * 0.5, pz);
      const t = sect[(i + every) % nS];
      if (t.seg !== s.seg && Math.hypot(t.x - s.x, t.z - s.z) > step * every * 1.8) continue;
      if (fenceSkip && fenceSkip.includes(t.seg)) continue;
      const qx = t.x + t.nx * 0.18;
      const qz = t.z + t.nz * 0.18;
      if (blocked(qx, qz)) continue;
      const dx = qx - px;
      const dz = qz - pz;
      const len = Math.hypot(dx, dz);
      const yaw = Math.atan2(-dz, dx);
      gRail.box(len, 0.05, 0.05, px + dx * 0.5, s.y + h * 0.82, pz + dz * 0.5, yaw);
      gRail.box(len, 0.05, 0.05, px + dx * 0.5, s.y + h * 0.52, pz + dz * 0.5, yaw);
    }
    push(addMerged(group, gPost, mats.guard, { name: `${name}:guard-post` }));
    push(addMerged(group, gRail, mats.guard, { cast: false, name: `${name}:guard-rail` }));
  }
  if (grates && mats.grate) {
    const grate = new BoxMerge();
    for (let i = 0; i < nS; i += 3) {
      const s = sect[i];
      if (blocked(s.x, s.z)) continue;
      const gx = s.x + s.nx * (s.run - 0.35);
      const gz = s.z + s.nz * (s.run - 0.35);
      const gy = Math.min(s.y - 0.08, groundLocal(gx, gz) + 0.05);
      const yaw = Math.atan2(s.nx, s.nz);
      grate.box(0.72, 0.06, 0.42, gx, gy, gz, yaw);
    }
    push(addMerged(group, grate, mats.grate, { cast: false, name: `${name}:grate` }));
  }
  if (contact && mats.contact) {
    const dark = new StripMerge();
    for (let i = 0; i < nS; i += 1) {
      const a = sect[i];
      const b = sect[(i + 1) % nS];
      if (a.seg !== b.seg && Math.hypot(b.x - a.x, b.z - a.z) > step * 2.2) continue;
      const aIn = [a.x + a.nx * (a.run - 0.55), a.toe[1] + 0.02, a.z + a.nz * (a.run - 0.55)];
      const bIn = [b.x + b.nx * (b.run - 0.55), b.toe[1] + 0.02, b.z + b.nz * (b.run - 0.55)];
      const aOut = [a.x + a.nx * (a.run + 0.85), groundLocal(a.x + a.nx * (a.run + 0.85), a.z + a.nz * (a.run + 0.85)) + 0.02, a.z + a.nz * (a.run + 0.85)];
      const bOut = [b.x + b.nx * (b.run + 0.85), groundLocal(b.x + b.nx * (b.run + 0.85), b.z + b.nz * (b.run + 0.85)) + 0.02, b.z + b.nz * (b.run + 0.85)];
      dark.quad(aIn, bIn, bOut, aOut);
    }
    push(addMerged(group, dark, mats.contact, { cast: false, name: `${name}:contact` }));
  }
  // P15 TR3 — the wrap road is a ROAD SECTION, not a ribbon.
  //
  // T7's raycast named the pale quadrilateral behind the transport venues
  // (`bd-transport-landmass` px x 738-809 / y 501-615) as `${name}:service-road`,
  // and TR2 read it as "standing proud / detached". Measured on the live plan
  // before anything here was touched, all 240 vertices of the station's copy stood
  // at EXACTLY `groundLocal + 0.045`: it never floated and it was never detached.
  //
  // It read as a plate because it WAS one — a single 3.5 m quad strip in one
  // asphalt value, 117 m long, with a kerb on BOTH edges. The outboard kerb was
  // the fault: a raised lip with open ring on the other side and nothing in
  // between, which is the silhouette of a slab dropped on a field. Seating it
  // lower or higher could never have fixed that, because the height was already
  // right.
  //
  // A road at this scale is a section read across: channel, kerb, cambered seal
  // with two polished running lines, gravel shoulder, verge battered to a toe on
  // the sampled ring. The kerb stays on the INBOARD edge only, against the apron's
  // own batter toe, which is where a kerb belongs; the outboard edge of a
  // perimeter service road is a shoulder that grades into the paddock.
  //
  // The band keeps its `wrapWidth` footprint — the channel and the seal share it —
  // so nothing here widens the venue's ground take. The shoulder and verge run
  // OUTSIDE it, over ground the apron was already leaving bare.
  if (wrapRoad && mats.wrap) {
    const wrap = new StripMerge();
    const wrapAltM = new StripMerge();
    const wear = new StripMerge();
    const gutterM = new StripMerge();
    const shoulderM = new StripMerge();
    const shoulderAltM = new StripMerge();
    const vergeM = new StripMerge();
    const vergeAltM = new StripMerge();
    const wrapKerb = new BoxMerge();
    const wrapPaint = new BoxMerge();
    const skip = wrapSkip || [];
    const roadQuads = [];
    const GUT = 0.55;       // channel, inboard of the kerb line
    const CAMBER = 0.05;     // crown over the channel-side seal edge
    const SHOULDER = 0.9;    // gravel outboard of the seal
    const seal = Math.max(1.6, wrapWidth - GUT);
    /**
     * The section, as [offset from the channel line, height over the ground at
     * THAT offset]. Every entry is sampled where it stands, so the road follows
     * the ring across its own width instead of ruling one plane over it.
     */
    const SECT = [
      [0.00, 0.015], [GUT, 0.045], [GUT + seal * 0.5, 0.045 + CAMBER], [GUT + seal, 0.045],
      [GUT + seal + SHOULDER, 0.015], [GUT + seal + SHOULDER + 1.1, -0.02],
    ];
    const sectAt = (s, o) => {
      let dy = SECT[SECT.length - 1][1];
      for (let k = 0; k + 1 < SECT.length; k += 1) {
        const [o0, d0] = SECT[k];
        const [o1, d1] = SECT[k + 1];
        if (o <= o1) { dy = d0 + (d1 - d0) * ((o - o0) / (o1 - o0)); break; }
      }
      const base = s.outR + wrapOut + Math.max(0, o);
      const px = s.x + s.nx * base;
      const pz = s.z + s.nz * base;
      return [px, groundLocal(px, pz) + dy, pz];
    };
    let runLeft = 0;
    let worn = false;
    for (let i = 0; i < nS; i += 1) {
      const a = sect[i];
      const b = sect[(i + 1) % nS];
      if (runLeft <= 0) {
        worn = apronUnit(seed, salt + 21000 + i * 61) < 0.38;
        runLeft = 2 + Math.floor(apronUnit(seed, salt + 22000 + i * 67) * 3);
      }
      runLeft -= 1;
      if (skip.includes(a.seg)) continue;
      if (a.seg !== b.seg && Math.hypot(b.x - a.x, b.z - a.z) > step * 2.2) continue;
      // Keep-out is tested at the channel line and at the outer toe, the two
      // extremes of the section, so a run that clips a runway is dropped whole.
      const p0 = sectAt(a, 0);
      const pT = sectAt(a, SECT[SECT.length - 1][0]);
      const q0 = sectAt(b, 0);
      const qT = sectAt(b, SECT[SECT.length - 1][0]);
      if (blocked(p0[0], p0[2]) || blocked(pT[0], pT[2])
        || blocked(q0[0], q0[2]) || blocked(qT[0], qT[2])) continue;
      roadQuads.push([p0[0], p0[2], q0[0], q0[2], qT[0], qT[2], pT[0], pT[2]]);
      const strip =(o0, o1, bin) => bin.quad(sectAt(a, o0), sectAt(b, o0), sectAt(b, o1), sectAt(a, o1));
      strip(0, GUT, gutterM);
      const sealBin = worn && mats.wrapAlt ? wrapAltM : wrap;
      strip(GUT, GUT + seal * 0.5, sealBin);
      strip(GUT + seal * 0.5, GUT + seal, sealBin);
      // Two polished running lines, so the seal carries traffic rather than one
      // flat value across its whole width.
      if (mats.wrapWear) {
        for (const c of [0.30, 0.70]) {
          strip(GUT + seal * c - 0.28, GUT + seal * c + 0.28, wear);
        }
      }
      strip(GUT + seal, GUT + seal + SHOULDER, worn ? shoulderAltM : shoulderM);
      strip(GUT + seal + SHOULDER, SECT[SECT.length - 1][0], worn && mats.vergeAlt ? vergeAltM : vergeM);
      const yaw = Math.atan2(a.nx, a.nz);
      const kp = sectAt(a, GUT);
      wrapKerb.box(step * 1.02, 0.18, 0.20, kp[0], kp[1] + 0.06, kp[2], yaw);
      if (i % 2 === 0) {
        const cp = sectAt(a, GUT + seal * 0.5);
        wrapPaint.box(0.9, 0.04, 0.12, cp[0], cp[1] + 0.03, cp[2], yaw);
      }
    }
    if (roadQuads.length) {
      const own = quadsFootprint(roadQuads);
      const prior = group.userData.wrapRoadFootprint;
      group.userData.wrapRoadFootprint = prior ? (lx, lz) => prior(lx, lz) || own(lx, lz) : own;
    }
    push(addMerged(group, wrap, mats.wrap, { cast: false, name: `${name}:service-road` }));
    // The second tones are NAMED as well as built. An unnamed merge cannot be
    // switched off by the capture harness's `hide=`, so a family whose second
    // half is anonymous can never be attributed on a plate — which is the trap
    // that cost T7 a round on this exact object.
    if (mats.wrapAlt) push(addMerged(group, wrapAltM, mats.wrapAlt, { cast: false, name: `${name}:service-road-alt` }));
    if (mats.wrapWear) push(addMerged(group, wear, mats.wrapWear, { cast: false, name: `${name}:service-wear` }));
    push(addMerged(group, gutterM, mats.gutter ?? mats.contact ?? mats.wrap, { cast: false, name: `${name}:service-gutter` }));
    push(addMerged(group, shoulderM, mats.shoulder ?? mats.rubble ?? mats.toe, { cast: false, name: `${name}:service-shoulder` }));
    if (mats.shoulderAlt ?? mats.rubbleDark) {
      push(addMerged(group, shoulderAltM, mats.shoulderAlt ?? mats.rubbleDark, { cast: false, name: `${name}:service-shoulder-alt` }));
    }
    push(addMerged(group, vergeM, mats.verge ?? mats.toe, { cast: false, name: `${name}:service-verge` }));
    if (mats.vergeAlt ?? mats.toeAlt) push(addMerged(group, vergeAltM, mats.vergeAlt ?? mats.toeAlt, { cast: false, name: `${name}:service-verge-alt` }));
    if (mats.kerb) push(addMerged(group, wrapKerb, mats.kerb, { name: `${name}:service-kerb` }));
    if (mats.paint) push(addMerged(group, wrapPaint, mats.paint, { cast: false, name: `${name}:service-paint` }));
  }
  return added;
}

/**
 * The surface that renders. `plan.groundAt` is the hinterland sampler handed
 * to every venue; `heightAt` is the hidden annulus and is only a fallback for
 * tests that stub a flat world.
 */
export function sampleLiveGround(plan, x, z, fallback = 0) {
  if (typeof plan?.groundAt === 'function') return plan.groundAt(x, z);
  if (typeof plan?.heightAt === 'function') return plan.heightAt(x, z);
  return fallback;
}

export function transitMats() {
  return {
    tyre: std(0x191a1c, { roughness: 0.95, metalness: 0.02 }),
    rim: std(0x9aa0a6, { roughness: 0.42, metalness: 0.6 }),
    bogie: std(0x33383d, { roughness: 0.66, metalness: 0.3 }),

    // W3-A: liveries brought inside the vehicle cap (S at most 60, V 30 to 85). The 90-percent
    // metro blue, the 96-percent door yellow, the V/Line purple and gold, the bus orange and the
    // pure-white bus body are now the bible's navy, gold and white accents and two mid tones.
    metroBlue: std(0x3F6A96, { roughness: 0.36, metalness: 0.2 }),
    metroDark: std(0x2F4A6A, { roughness: 0.46, metalness: 0.18 }),
    metroSill: std(0x375B83, { roughness: 0.42, metalness: 0.2 }),
    metroSilver: std(0xB4BABF, { roughness: 0.4, metalness: 0.42 }),
    doorYellow: std(0xC9A23F, { roughness: 0.36, metalness: 0.12 }),
    // The r4 critic's highlight note names train roofs as one of the four
    // surfaces that should be reaching the top of the range. These are big
    // up-facing planes in the lower third, where the plate's p95 falls to 178
    // against Monopoly Plus's 238-254, and they were sitting at a shaded-wall
    // value. Lifted and made glossier — neutral, so the pale-pink blob fault the
    // r4 round fixed (saturated livery on a face-up plane) cannot come back.
    roofGrey: std(0xA7ADB2, { roughness: 0.44, metalness: 0.4 }),
    roofGrime: std(0x9ba1a7, { roughness: 0.72, metalness: 0.2 }),
    // Nothing in the Monopoly Plus stills sits at zero; their darkest pixels carry
    // sky bounce. Train glazing at 0x16232f was one of the two largest sources of
    // fully-crushed pixels in the r3 plate, so it now reflects a little sky.
    glassDark: std(0x2b3f52, { roughness: 0.09, metalness: 0.52 }),
    silver: std(0xB9BFC4, { roughness: 0.32, metalness: 0.62 }),
    steel: std(0x5c646c, { roughness: 0.36, metalness: 0.72 }),

    vlinePurple: std(0x6B4A82, { roughness: 0.34, metalness: 0.22 }),
    vlineDeep: std(0x3F2E4E, { roughness: 0.44, metalness: 0.18 }),
    vlineGold: std(0xC9A23F, { roughness: 0.4, metalness: 0.24 }),
    vlineGrey: std(0x8d8f96, { roughness: 0.7, metalness: 0.14 }),
    vlineRoof: std(0x8a8493, { roughness: 0.6, metalness: 0.24 }),
    // r3 capped each aircon pod with vlineDeep (0x461057). Face-up under a key
    // this strong it blew out to lilac, and the r3 critic read the two nearest
    // as flat pale-pink placeholder quads. The cap is now a neutral dark grille
    // frame, and addVLineTrain louvres it.
    vlineRoofPod: std(0x565061, { roughness: 0.66, metalness: 0.24 }),
    vlinePodCap: std(0x3a3740, { roughness: 0.58, metalness: 0.34 }),
    vlinePodVent: std(0x8e8a94, { roughness: 0.5, metalness: 0.4 }),

    // station-models.js bakes the livery colour and occlusion into the vertex colour, so each finish class is one
    // plain white vertexColors standard. The liveries themselves are the paints above.
    vcPaint: std(0xffffff, { roughness: 0.38, metalness: 0.16, vertexColors: true }),
    vcMetal: std(0xffffff, { roughness: 0.34, metalness: 0.58, vertexColors: true }),
    vcGlass: std(0xffffff, { roughness: 0.09, metalness: 0.52, vertexColors: true }),
    vcMatte: std(0xffffff, { roughness: 0.82, metalness: 0.06, vertexColors: true }),

    busOrange: std(0xC48550, { roughness: 0.38, metalness: 0.12 }),
    busWhite: std(0xD9D6CE, { roughness: 0.55, metalness: 0.06 }),
    taxiYellow: std(0xC9A23F, { roughness: 0.34, metalness: 0.12 }),
    taxiBlack: std(0x18181a, { roughness: 0.44, metalness: 0.14 }),
    light: std(0xfff3cc, {
      roughness: 0.22, metalness: 0.06, emissive: 0xffdf8f, emissiveIntensity: 0.85,
    }),
    tailLight: std(0xff5a4a, {
      roughness: 0.24, metalness: 0.06, emissive: 0xd83022, emissiveIntensity: 0.7,
    }),
    destBoard: std(0x141416, {
      roughness: 0.42, metalness: 0.1, emissive: 0xffa022, emissiveIntensity: 0.42,
    }),
    interior: std(0x39424c, { roughness: 0.84, metalness: 0.04 }),
    bumper: std(0x373b40, { roughness: 0.58, metalness: 0.26 }),
  };
}

function motion(group, kind, x, y, z, extra = {}) {
  group.userData.motion = { kind, homeX: x, homeY: y, homeZ: z, phase: extra.phase ?? 0, ...extra };
  group.position.set(x, y, z);
  return group;
}

/** Wheelset: tyre, rim, brake disc. Reads as a wheel at postage-stamp size. */
function wheel(g, mats, x, y, z, r = 0.42, width = 0.24) {
  addCyl(g, r, r, width, 10, mats.tyre, x, y, z, { rotX: Math.PI / 2 });
  addCyl(g, r * 0.46, r * 0.46, width + 0.04, 8, mats.rim, x, y, z, { rotX: Math.PI / 2 });
}

/** Material slot of each geometry that station-models.js returns. */
const SLOT_MAT = {
  paint: 'vcPaint', metal: 'vcMetal', glass: 'vcGlass', matte: 'vcMatte', lamp: 'light', tail: 'tailLight', dest: 'destBoard',
};

/** Drops the merged slot geometries of one station-models.js vehicle into a group. */
function addSlots(g, mats, slots, name) {
  for (const [slot, geo] of Object.entries(slots)) {
    const mesh = new THREE.Mesh(geo, mats[SLOT_MAT[slot]]);
    mesh.castShadow = slot !== 'lamp' && slot !== 'tail' && slot !== 'dest';
    mesh.receiveShadow = true;
    mesh.userData.ownsGeometry = true;
    mesh.name = `${name}:${slot}`;
    noPick(mesh);
    g.add(mesh);
  }
}

/**
 * PTV metro set (X'Trapolis-like), three cars, length along +X: rounded raked cab ends, inset door recesses with
 * yellow leaves, a glazed window band, gangways, bogies on the real rail line, roof plant and a pantograph.
 * The geometry is built in station-models.js.
 */
export function addMetroTrain(parent, mats, name = 'fringe:transit:metro-train') {
  addSlots(parent, mats, buildMetroTrain(paletteFromMats(mats)), name);
  parent.name = name;
  return parent;
}

/** V/Line set (VLocity-like), three cars, length along +X; purple and gold, wraparound cab windscreens. */
export function addVLineTrain(parent, mats, name = 'fringe:transit:vline-train') {
  addSlots(parent, mats, buildVLineTrain(paletteFromMats(mats)), name);
  parent.name = name;
  return parent;
}

/** PTV route bus, 12 m low floor, length along +X: one smooth body with wheel arches and door recesses. */
export function addPtvBus(parent, mats, name = 'fringe:transit:bus') {
  addSlots(parent, mats, buildPtvBus(paletteFromMats(mats)), name);
  parent.name = name;
  return parent;
}

// Subtract a doorway volume from existing triangles, interpolating their
// original normals/UVs. No replacement panels or hidden duplicate hulls.
function cutTramApertures(source, boxes, isLeaf) {
  const names = Object.keys(source.attributes);
  const attrs = names.map(n => source.attributes[n]);
  const offsets = []; let stride = 0;
  for (const a of attrs) { offsets.push(stride); stride += a.itemSize; }
  const pos = offsets[names.indexOf('position')];
  const read = i => attrs.flatMap(a => Array.from({ length: a.itemSize }, (_, k) => a.array[i * a.itemSize + k]));
  const split = (poly, axis, limit, sign) => {
    const inside = [], outside = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = sign * (a[pos + axis] - limit), db = sign * (b[pos + axis] - limit);
      (da >= 0 ? inside : outside).push(a);
      if ((da < 0) !== (db < 0)) {
        const u = da / (da - db), v = a.map((x, k) => x + (b[k] - x) * u);
        inside.push(v); outside.push(v);
      }
    }
    return [inside, outside];
  };
  const output = []; let changed = false;
  const count = source.index?.count ?? source.attributes.position.count;
  for (let j = 0; j < count; j += 3) {
    const ids = [0, 1, 2].map(k => source.index ? source.index.getX(j + k) : j + k);
    let polys = [ids.map(read)];
    if (!isLeaf(ids)) for (const box of boxes) {
      const next = [];
      for (const poly of polys) {
        if ([0, 1, 2].some(a => poly.every(v => v[pos + a] <= box[0][a])
          || poly.every(v => v[pos + a] >= box[1][a]))) { next.push(poly); continue; }
        let remainder = poly;
        for (let axis = 0; axis < 3 && remainder.length >= 3; axis++) {
          for (const end of [0, 1]) {
            const [inside, outside] = split(remainder, axis, box[end][axis], end ? -1 : 1);
            if (outside.length >= 3) next.push(outside);
            remainder = inside;
            if (remainder.length < 3) break;
          }
        }
        if (remainder.length >= 3) changed = true;
      }
      polys = next;
    }
    for (const poly of polys) for (let k = 1; k < poly.length - 1; k++) output.push(poly[0], poly[k], poly[k + 1]);
  }
  if (!changed) return source;
  const geometry = new THREE.BufferGeometry();
  names.forEach((name, j) => {
    const size = attrs[j].itemSize, data = new Float32Array(output.length * size);
    output.forEach((v, i) => { for (let k = 0; k < size; k++) data[i * size + k] = v[offsets[j] + k]; });
    geometry.setAttribute(name, new THREE.BufferAttribute(data, size));
  });
  // Clipping triangulates the remaining faces. Restore their shared vertices
  // so the doorway cut does not discard the imported hull's vertex cache.
  const indexed = mergeVertices(geometry, 1e-6);
  geometry.dispose();
  indexed.computeBoundingBox(); indexed.computeBoundingSphere();
  return indexed;
}

// The registry merges by material. Recover only the authored sliding leaves
// from those batches; retain the existing reveal, sill and surrounding hull.
// Vertex edits preserve the same draw count and also move the shadow geometry.
export function rigTramDoors(inner, model, id) {
  const modern = id.startsWith('e-class');
  const fallback = model.fallback;
  const centres = modern ? (fallback ? [-4.9, 0, 4.9] : [-1.65, 0, 1.65]) : [0];
  const offsetY = fallback ? 0 : (model.offsetY ?? 0);
  const leaves = [];
  const originals = inner.children.map(mesh => ({ mesh, geometry: mesh.geometry }));
  const boxes = centres.flatMap(c => [-1, 1].map(side => {
    const half = fallback ? .56 : modern ? .222 : .248;
    const y0 = (fallback ? .42 : modern ? .325 : .305) + offsetY;
    const y1 = (fallback ? 2.06 : modern ? 1.075 : 1.095) + offsetY;
    const z0 = fallback ? 1.05 : .45, z1 = fallback ? 1.5 : .68;
    return [[c - half, y0, side > 0 ? z0 : -z1], [c + half, y1, side > 0 ? z1 : -z0]];
  }));
  for (const mesh of inner.children) {
    const role = mesh.material?.name ?? '';
    const leafMaterial = /blackwood|smoked glass|safety yellow/i.test(role);
    let source = mesh.geometry;
    let p = source.attributes.position;
    const selected = new Map();
    const classify = (i) => {
      if (!leafMaterial) return null;
      const x = p.getX(i), y = p.getY(i) - offsetY, z = p.getZ(i);
      const az = Math.abs(z);
      const y0 = fallback ? .40 : modern ? .315 : .295;
      const y1 = fallback ? 2.075 : 1.105;
      const z0 = fallback ? 1.39 : modern ? .628 : .570;
      const z1 = fallback ? 1.455 : modern ? .647 : .622;
      if (y < y0 || y > y1 || az < z0 || az > z1) return null;
      for (const c of centres) {
        const dx = x - c;
        const width = fallback ? .578 : modern ? .25 : .253;
        if (Math.abs(dx) > .005 && Math.abs(dx) < width) {
          return { side: Math.sign(z), dir: Math.sign(dx) };
        }
      }
      return null;
    };
    const sameLeaf = ids => {
      const tags = ids.map(classify);
      return tags.every(t => t && t.side === tags[0].side && t.dir === tags[0].dir);
    };
    // Keep leaf membership from the authored mesh. Cut surround vertices must
    // never become moving stiles merely because they now touch the aperture.
    const leafCoordinates = new Map();
    const keyAt = i => [p.getX(i), p.getY(i), p.getZ(i)].map(v => v.toFixed(6)).join(',');
    const originalCount = source.index?.count ?? p.count;
    for (let j = 0; j < originalCount; j += 3) {
      const ids = [0, 1, 2].map(k => source.index ? source.index.getX(j + k) : j + k);
      if (sameLeaf(ids)) ids.forEach(i => leafCoordinates.set(keyAt(i), classify(i)));
    }
    const cut = cutTramApertures(source, boxes, sameLeaf);
    if (cut !== source) {
      mesh.geometry = cut; mesh.userData.ownsGeometry = true;
      source = cut; p = source.attributes.position;
    }
    const count = source.index?.count ?? p.count;
    for (let j = 0; j < count; j += 3) {
      const ids = [0, 1, 2].map(k => source.index ? source.index.getX(j + k) : j + k);
      const tags = ids.map(i => leafCoordinates.get(keyAt(i)));
      if (tags.every(t => t && t.side === tags[0].side && t.dir === tags[0].dir)) {
        ids.forEach((i, k) => selected.set(i, tags[k]));
      }
    }
    if (!selected.size) continue;
    if (mesh.geometry === originals.find(o => o.mesh === mesh).geometry) mesh.geometry = source.clone();
    mesh.userData.ownsGeometry = true;
    const position = mesh.geometry.attributes.position;
    position.setUsage(THREE.DynamicDrawUsage);
    leaves.push({ mesh, position, vertices: [...selected].map(([i, t]) => ({ i, x: p.getX(i), ...t })) });
  }
  return { leaves, originals, travel: fallback ? .55 : .24, open: 0, side: 0 };
}

export function poseTramDoors(rig, open, side) {
  if (!rig) return;
  open = Math.max(0, Math.min(1, open));
  if (rig.open === open && rig.side === side) return;
  for (const leaf of rig.leaves) {
    for (const v of leaf.vertices) {
      leaf.position.setX(v.i, v.x + (v.side === side ? v.dir * rig.travel * open : 0));
    }
    leaf.position.needsUpdate = true;
  }
  rig.open = open;
  rig.side = side;
}

export function updateTramDoors(tram, dwell = 4.2) {
  const along = tram.item.from + (tram.item.to - tram.item.from) * tram.t;
  const berth = tram.doorBerths?.find(b => Math.abs(b.along - along) < .05);
  const remaining = tram.dwellTimer;
  const berthed = berth && tram.speed === 0 && remaining > 0
    && Math.abs((tram.lastStopAlong ?? Infinity) - along) < .05;
  const u = berthed ? Math.max(0, Math.min(1, (dwell - remaining) / .6, remaining / .6)) : 0;
  poseTramDoors(tram.doorRig, u * u * (3 - 2 * u), berth?.side ?? 0);
}

/** Melbourne tram at a platform stop; length along +X. */
export function addTram(parent, mats, name = 'fringe:transit:tram') {
  const hull = new THREE.Group();
  hull.name = `${name}:trolley:hull`;
  hull.userData.tramModel = 'w-class-tram';
  hull.userData.fullDetailThroughM = 240;
  const model = buildTramModel('w-class-tram');
  const factory = factoryTram('w-class-tram');
  const drawn = factory ?? model;
  hull.userData.source = drawn.source;
  if (factory) { const fit=tramFactoryScale(factory,'w-class-tram'); hull.scale.set(fit.x,fit.y,fit.z); }
  for (const part of drawn.parts) {
    const material = factory ? part.material.clone() : part.material;
    if (factory) {
      const role = material.name.toLowerCase();
      if (/cream|white/.test(role)) material.color.set('#d4c6a4');
      else if (/green/.test(role)) material.color.set('#345b3e');
      else if (/glass/.test(role)) { material.color.set('#283e43'); material.roughness=.19; }
      material.emissiveIntensity = Math.min(material.emissiveIntensity??0,.08);
    }
    const mesh = new THREE.Mesh(part.geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.ownsGeometry = true;
    noPick(mesh);
    mesh.userData.ownsGeometry = !factory;
    hull.add(mesh);
  }
  if (factory) for (const part of model.parts) part.geometry.dispose();
  hull.position.y = .5; // station rail datum, 0.5 m above the old footpath massing
  parent.add(hull);
  // The station's parked W-class has the same boarding language as city stops.
  const stop = new THREE.Group();
  stop.name = `${name}:stop-platform`;
  const concrete = std('#d3cbb9', {roughness:.9});
  const iron = model.parts[3].material, cream = model.parts[1].material;
  addChamferBar(stop, concrete, 15, 1.9, .22, .07, 0, .08, 2.45);
  addBox(stop, 14.5, .035, .27, model.parts[6].material, 0, .21, 1.64);
  for (let x=-6.8;x<7;x+=.35) addBox(stop,.06,.025,.21,iron,x,.24,1.64,{cast:false});
  // P22-P1: retain the ground track, cut the complete tram overhead kit.
  const overhead = new THREE.Group();
  overhead.name = `${name}:track-bed`;
  for (const z of [-.76,.76]) addBox(overhead,22,.07,.085,iron,0,.49,z);
  for (let x=-10.5;x<11;x+=1.1) addBox(overhead,.19,.09,2.05,model.parts[5].material,x,.42,0);
  addChamferBar(overhead, concrete,22,2.7,.35,.08,0,.2,0,{cast:false});
  parent.add(overhead);
  for (const x of [-2.1,2.1]) for(const z of [1.8,3.1]) addBox(stop,.13,2.9,.13,iron,x,1.63,z);
  addChamferBar(stop,model.parts[2].material,4.8,1.7,.20,.07,0,3.15,2.45);
  addBox(stop,3.9,1.55,.055,model.parts[4].material,0,1.94,3.1);
  for(const x of [-1.2,1.2]) addBox(stop,.13,.6,.45,iron,x,.5,2.75);
  addBox(stop,2.8,.14,.55,model.parts[5].material,0,.86,2.75);
  addBox(stop,.12,2.75,.12,iron,5,1.59,2.7);
  addBox(stop,.65,.5,.1,cream,5,2.94,2.7);
  addBox(stop,.42,.23,.025,iron,5,2.94,2.64);
  // Board on the existing inner platform, clear of the seaward shrub belt.
  stop.position.set(.5,.85,-4.9);
  parent.add(stop);
  parent.name = name;
  return parent;
}

/** White/orange maintenance ute. Nose toward local +Z. */
export function addServiceUte(parent, mats, name = 'fringe:airport-link-ute') {
  const g = parent;
  const len = 4.1;
  const w = 1.72;
  addChamferBar(g, mats.bumper, w - 0.08, 0.28, len - 0.16, 0.08, 0, 0.36, 0);
  addChamferBar(g, mats.busWhite, w, 0.58, len, 0.14, 0, 0.74, 0);
  addChamferBar(g, mats.busOrange, w + 0.02, 0.12, len + 0.02, 0.04, 0, 0.48, 0);
  addChamferBar(g, mats.busWhite, w - 0.16, 0.62, 1.7, 0.16, 0, 1.28, 0.55);
  addChamferBar(g, mats.glassDark, w - 0.28, 0.42, 1.4, 0.1, 0, 1.32, 0.5);
  addChamferBar(g, mats.busOrange, w - 0.2, 0.46, 1.9, 0.1, 0, 1.12, -0.85);
  addBox(g, 0.36, 0.16, 0.22, mats.light, 0, 1.72, 0.5, { cast: false });
  for (const xs of [1, -1]) {
    addSphere(g, 0.08, 6, mats.light, xs * 0.55, 0.52, len * 0.5 - 0.06);
    addSphere(g, 0.07, 5, mats.tailLight, xs * 0.55, 0.56, -len * 0.5 + 0.06);
  }
  for (const [zx, zz] of [[0.62, 1.15], [-0.62, 1.15], [0.62, -1.15], [-0.62, -1.15]]) {
    wheel(g, mats, zx, 0.32, zz, 0.32, 0.2);
  }
  g.name = name;
  return g;
}

/** Yellow/black Melbourne cab. Nose toward local +Z. */
export function addTaxi(parent, mats, name = 'fringe:transit:taxi-a') {
  const g = parent;
  const len = 3.5;
  const w = 1.6;
  addChamferBar(g, mats.taxiBlack, len - 0.2, 0.34, w - 0.1, 0.08, 0, 0.44, 0, { rotY: Math.PI / 2 });
  addChamferBar(g, mats.taxiYellow, len, 0.62, w, 0.16, 0, 0.78, 0, { rotY: Math.PI / 2 });
  addChamferBar(g, mats.taxiBlack, len + 0.02, 0.12, w + 0.03, 0.04, 0, 0.5, 0, { rotY: Math.PI / 2 });
  addChamferBar(g, mats.taxiYellow, 1.85, 0.6, w - 0.14, 0.2, 0, 1.34, -0.1, { rotY: Math.PI / 2 });
  addChamferBar(g, mats.glassDark, 1.6, 0.44, w - 0.2, 0.1, 0, 1.36, -0.1, { rotY: Math.PI / 2 });
  addBox(g, w - 0.28, 0.4, 0.1, mats.glassDark, 0, 1.3, len * 0.5 - 0.98);
  addChamferBar(g, mats.bumper, w + 0.04, 0.2, 0.22, 0.06, 0, 0.36, len * 0.5 - 0.04);
  addChamferBar(g, mats.bumper, w + 0.04, 0.18, 0.2, 0.06, 0, 0.34, -len * 0.5 + 0.04);
  addChamferBar(g, mats.taxiBlack, 0.5, 0.22, 0.26, 0.06, 0, 1.7, -0.1);
  addBox(g, 0.4, 0.15, 0.16, mats.light, 0, 1.85, -0.1, { cast: false });
  addBox(g, 0.1, 0.5, 0.95, mats.taxiBlack, w * 0.5 + 0.01, 0.95, 0.0, { cast: false });
  for (const xs of [1, -1]) {
    addSphere(g, 0.085, 6, mats.light, xs * 0.5, 0.55, len * 0.5 - 0.06);
    addSphere(g, 0.07, 5, mats.tailLight, xs * 0.5, 0.6, -len * 0.5 + 0.06);
  }
  for (const [zx, zz] of [[0.56, 1.0], [-0.56, 1.0], [0.56, -1.0], [-0.56, -1.0]]) {
    wheel(g, mats, zx, 0.34, zz, 0.34, 0.22);
  }
  g.name = name;
  return g;
}

export { motion };
