// District Deck V3.70 — LANDMARKS lane, the opening system.
//
// §2.2 is the clause this file exists to satisfy: "Windows are recessed into their reveal by a
// real distance. The frame is a chunky member with visible section. Glass is a dark, slightly
// reflective body ... never a flat blue card."
//
// HOW AN APERTURE IS BUILT HERE, in the order it happens:
//   1. The BUILDER computes a hole schedule with `archedHole` / `hole` and hands it to `volume`,
//      which punches the wall. Every wall piece carries the full 0.44 m masonry depth, so the
//      reveal is the wall's own thickness and is real by construction rather than by a lining.
//   2. `volume` puts a `room` box behind the wall. That is what stops a punched hole reading as a
//      black sticker, and it is in `trim` rather than the darkest bucket for the §5.3 reason.
//   3. The functions below add the DRESSING at the same coordinates: surround, sill, mullion,
//      tracery, pane. They never punch anything, so a dressing can never disagree with its hole.
//
// The split is deliberate. Two earlier lanes in this programme shipped windows whose frame and
// hole were computed twice from the same numbers and drifted apart.

import {
  LM_METRICS, part, box, slab, rotBox, cyl, taper, extrude, remapUvY,
  pointedArchProfile, roundArchProfile, inflateProfile, archedHole, hole,
} from './kit.js';

/**
 * Face frame. `facing` is which way the elevation looks; `plane` is that face's own coordinate on
 * the perpendicular axis. `pos(u, y, out)` gives world coordinates for a point `out` metres proud
 * of the face, and `dims(w, h, t)` maps elevation dimensions onto world axes.
 */
export function faceFrame(facing, plane) {
  switch (facing) {
    case 'back': return {
      axis: 'z', sign: -1,
      pos: (u, y, out) => [u, y, plane - out],
      dims: (w, h, t) => [w, h, t],
    };
    case 'right': return {
      axis: 'x', sign: 1,
      pos: (u, y, out) => [plane + out, y, u],
      dims: (w, h, t) => [t, h, w],
    };
    case 'left': return {
      axis: 'x', sign: -1,
      pos: (u, y, out) => [plane - out, y, u],
      dims: (w, h, t) => [t, h, w],
    };
    case 'front':
    default: return {
      axis: 'z', sign: 1,
      pos: (u, y, out) => [u, y, plane + out],
      dims: (w, h, t) => [w, h, t],
    };
  }
}

/* ───────────────────────────────── Gothic — Old Arts ──────────────────────────────── */

/**
 * The hole schedule for a pointed two-light window. ONE aperture; the stepped head is how a
 * rectangle-punching wall gets an arched reveal, and `archedHole` marks which rectangle carries
 * the aperture so the census counts windows rather than slices.
 */
export function lancetHoles(u, y, w, h, tag = 'lancet') {
  return archedHole(u, y, w, h, { headFrac: 0.34, steps: 3, tag, pointed: true });
}

/**
 * A pointed window's dressing: hood mould, sill, mullion, tracery and pane.
 *
 * `tracery` false gives the plain lancet used on the flanks and the rear, which is both cheaper
 * and correct — a Collegiate Gothic range does not carry its best tracery on a service elevation,
 * and ganging or simplifying a rear elevation is an architectural decision the spec explicitly
 * allows a lane to make on its own judgement.
 */
export function lancetWindow(ctx, {
  facing = 'front', plane, u, y, w, h, tracery = true, segs = 3, name = 'lancet',
}) {
  const p = ctx.p;
  const M = LM_METRICS;
  const f = faceFrame(facing, plane);
  const out = [];
  const halfW = w / 2;
  const headFrac = 0.34;
  const spring = h * (1 - headFrac);
  const rise = h * headFrac;

  // The pane, set back a real 0.30 m behind the outer face, shaped to the arch rather than
  // squared off behind it.
  const paneProfile = pointedArchProfile({
    halfW: halfW - 0.10, spring: spring - 0.05, rise: rise - 0.05, base: 0.10, segs,
  });
  const [px, py, pz] = f.pos(u, y, -(M.reveal + 0.06));
  out.push(part(remapUvY(extrude(paneProfile, {
    depth: 0.06, axis: f.axis, x: px, y: py, z: pz, name: `${name}-pane`,
  })), p.glass));

  // Hood mould: a real moulding standing proud of the wall, following the arch and returning down
  // the jambs. Built as an extruded annulus, because a pointed arch approximated out of rotated
  // boxes costs more triangles and reads as a chevron.
  const inner = pointedArchProfile({ halfW, spring, rise, base: 0, segs });
  const outer = inflateProfile(inner, 0.20);
  const [hx, hy, hz] = f.pos(u, y, 0.09);
  out.push(part(extrude(outer, {
    depth: 0.18, axis: f.axis, x: hx, y: hy, z: hz, name: `${name}-hood`, holes: [inner],
  }), p.trim));

  // Sill with section, and a drip under it.
  const [sx, sy, sz] = f.pos(u, y - 0.13, 0.13);
  out.push(part(box(...f.dims(w + 0.46, 0.20, 0.44), sx, sy, sz, `${name}-sill`), p.trim));
  const [dx, dy, dz] = f.pos(u, y - 0.28, 0.07);
  out.push(part(box(...f.dims(w + 0.30, 0.11, 0.30), dx, dy, dz, `${name}-sill-drip`), p.trim));

  // Mullion — the member that makes this a two-light window rather than a hole.
  const [mx, my, mz] = f.pos(u, y + spring * 0.5, -(M.reveal - 0.02));
  out.push(part(box(...f.dims(0.16, spring, 0.20), mx, my, mz, `${name}-mullion`), p.trim));

  if (tracery && ctx.mid) {
    // Plate tracery in the head: two cusped bars meeting under the point, and a small ring above
    // the mullion. Four members, and at a close orbit they are what separates a Gothic window
    // from an arch with a stick in it.
    const ty = y + spring + rise * 0.32;
    for (const s of [-1, 1]) {
      const [ax, ay, az] = f.pos(u + s * halfW * 0.40, ty, -(M.reveal - 0.02));
      out.push(part(rotBox(...f.dims(0.13, rise * 0.72, 0.18), ax, ay, az,
        f.axis === 'z' ? { z: s * 0.52 } : { x: -s * 0.52 }, `${name}-tracery`), p.trim));
    }
    const [rx, ry, rz] = f.pos(u, y + spring + rise * 0.58, -(M.reveal - 0.04));
    out.push(part(cyl(halfW * 0.30, 0.16, rx, ry, rz, f.axis, `${name}-tracery-ring`, 6), p.trim));
  }
  return out;
}

/* ─────────────────────────── Classical — Melbourne Town Hall ──────────────────────── */

/** Hole schedule for a round-arched opening in the rusticated storey. One aperture. */
export function roundHeadHoles(u, y, w, h, tag = 'arch') {
  return archedHole(u, y, w, h, { headFrac: 0.42, steps: 3, tag, pointed: false });
}

/**
 * A round-arched opening with voussoirs and a keystone — the Town Hall's ground storey.
 *
 * The voussoirs are what make a rusticated arch read: a plain semicircular moulding over a hole is
 * a tunnel mouth, and the radiating joints are the whole character of the storey.
 */
export function roundArchWindow(ctx, {
  facing = 'front', plane, u, y, w, h, voussoirs = 5, name = 'arch',
}) {
  const p = ctx.p;
  const M = LM_METRICS;
  const f = faceFrame(facing, plane);
  const out = [];
  const halfW = w / 2;
  const headFrac = 0.42;
  const spring = h * (1 - headFrac);

  const paneProfile = roundArchProfile({
    halfW: halfW - 0.10, spring: spring - 0.06, base: 0.10, segs: 4,
  });
  const [px, py, pz] = f.pos(u, y, -(M.reveal + 0.06));
  out.push(part(remapUvY(extrude(paneProfile, {
    depth: 0.06, axis: f.axis, x: px, y: py, z: pz, name: `${name}-pane`,
  })), p.glass));

  // Radiating voussoirs over the head, each a real block with its own shadow.
  const n = Math.max(3, voussoirs | 1);
  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.5) / n;
    const a = Math.PI * (1 - t);
    const r = halfW + 0.24;
    const [vx, vy, vz] = f.pos(u + Math.cos(a) * r, y + spring + Math.sin(a) * r, 0.07);
    out.push(part(rotBox(...f.dims(0.34, 0.56, 0.30), vx, vy, vz,
      f.axis === 'z' ? { z: -(a - Math.PI / 2) } : { x: (a - Math.PI / 2) },
      i === (n - 1) / 2 ? `${name}-keystone` : `${name}-voussoir`), p.trim));
  }
  // Impost blocks where the arch springs, and a sill.
  for (const s of [-1, 1]) {
    const [ix, iy, iz] = f.pos(u + s * (halfW + 0.10), y + spring, 0.06);
    out.push(part(box(...f.dims(0.36, 0.22, 0.28), ix, iy, iz, `${name}-impost`), p.trim));
  }
  const [sx, sy, sz] = f.pos(u, y - 0.12, 0.12);
  out.push(part(box(...f.dims(w + 0.40, 0.18, 0.42), sx, sy, sz, `${name}-sill`), p.trim));
  // Glazing bar, so the pane is a window and not a mirror.
  const [bx, by, bz] = f.pos(u, y + h * 0.42, -(M.reveal - 0.01));
  out.push(part(box(...f.dims(w - 0.30, 0.09, 0.14), bx, by, bz, `${name}-bar`), p.metal));
  return out;
}

/** Hole schedule for a square-headed classical window. One aperture, one rectangle. */
export function sashHoles(u, y, w, h, tag = 'sash') {
  const h0 = hole(u, y, w, h, tag);
  h0.aperture = 1;
  return [h0];
}

/**
 * A pedimented sash window — architrave, consoles, sill, pediment, pane and glazing bars.
 *
 * `pediment` takes 'triangular', 'segmental' or 'none'. Alternating them up an elevation is what a
 * Renaissance-revival front actually does, and it separates the storeys without a colour change.
 */
export function sashWindow(ctx, {
  facing = 'front', plane, u, y, w, h, pediment = 'triangular', bars = true, name = 'sash',
}) {
  const p = ctx.p;
  const M = LM_METRICS;
  const f = faceFrame(facing, plane);
  const out = [];

  const [px, py, pz] = f.pos(u, y + h / 2, -(M.reveal + 0.05));
  out.push(part(box(...f.dims(w - 0.16, h - 0.16, 0.06), px, py, pz, `${name}-pane`), p.glass));

  // Architrave: two jambs and a head, standing proud, with visible section.
  for (const s of [-1, 1]) {
    const [jx, jy, jz] = f.pos(u + s * (w / 2 + 0.12), y + h / 2, 0.07);
    out.push(part(box(...f.dims(0.26, h + 0.18, 0.26), jx, jy, jz, `${name}-jamb`), p.trim));
  }
  const [ax, ay, az] = f.pos(u, y + h + 0.13, 0.07);
  out.push(part(box(...f.dims(w + 0.52, 0.26, 0.28), ax, ay, az, `${name}-head`), p.trim));

  if (pediment === 'triangular') {
    const halfW = (w + 0.62) / 2;
    const [ex, ey, ez] = f.pos(u, y + h + 0.26, 0.12);
    out.push(part(extrude([[-halfW, 0], [halfW, 0], [0, halfW * 0.46]], {
      depth: 0.30, axis: f.axis, x: ex, y: ey, z: ez, name: `${name}-pediment`,
    }), p.trim));
  } else if (pediment === 'segmental') {
    const halfW = (w + 0.62) / 2;
    const prof = roundArchProfile({ halfW, spring: 0.02, base: 0, segs: 3 })
      .map(([uu, vv]) => [uu, Math.min(vv, halfW * 0.50)]);
    const [ex, ey, ez] = f.pos(u, y + h + 0.26, 0.12);
    out.push(part(extrude(prof, {
      depth: 0.30, axis: f.axis, x: ex, y: ey, z: ez, name: `${name}-pediment`,
    }), p.trim));
  }
  // Consoles under the sill — the pediment above needs something under it or the window floats.
  for (const s of [-1, 1]) {
    const [cx2, cy2, cz2] = f.pos(u + s * (w / 2 - 0.06), y - 0.24, 0.11);
    out.push(part(box(...f.dims(0.20, 0.34, 0.32), cx2, cy2, cz2, `${name}-console`), p.trim));
  }
  const [sx, sy, sz] = f.pos(u, y - 0.10, 0.13);
  out.push(part(box(...f.dims(w + 0.52, 0.17, 0.44), sx, sy, sz, `${name}-sill`), p.trim));

  if (bars && ctx.mid) {
    const [mx, my, mz] = f.pos(u, y + h * 0.50, -(M.reveal - 0.01));
    out.push(part(box(...f.dims(w - 0.20, 0.09, 0.13), mx, my, mz, `${name}-rail`), p.metal));
    const [vx, vy, vz] = f.pos(u, y + h * 0.50, -(M.reveal - 0.01));
    out.push(part(box(...f.dims(0.09, h - 0.30, 0.13), vx, vy, vz, `${name}-bar`), p.metal));
  }
  return out;
}

/* ─────────────────────────────── interactive openings ─────────────────────────────── */

/**
 * A pair of doors that open (§3.5 — tap opens, tap shuts).
 *
 * The leaves go in `opening.parts` and NEVER in the merged mesh, because a merged leaf cannot
 * rotate. `pick` is the tap volume, sized to the doorway rather than to a leaf so a player aiming
 * at the door hits the door.
 */
export function doorLeaves(ctx, {
  id, label, facing = 'front', plane, u, y, w, h, name = 'door',
}) {
  const p = ctx.p;
  const M = LM_METRICS;
  const f = faceFrame(facing, plane);
  const leafW = w / 2 - 0.06;
  const parts = [];
  const [ox, oy, oz] = f.pos(u, y, 0);
  for (const s of [-1, 1]) {
    const [lx, ly, lz] = f.pos(u + s * (leafW / 2 + 0.03), y + h / 2, -(M.reveal * 0.55));
    parts.push(part(box(...f.dims(leafW, h - 0.10, 0.13), lx, ly, lz, `${name}-leaf`), p.metal));
    // Raised panels, so a leaf is joinery rather than a slab.
    for (const t of [0.28, 0.68]) {
      const [qx, qy, qz] = f.pos(u + s * (leafW / 2 + 0.03), y + h * t, -(M.reveal * 0.55) + 0.09);
      parts.push(part(box(...f.dims(leafW - 0.26, h * 0.26, 0.05), qx, qy, qz,
        `${name}-panel`), p.trim));
    }
    const [gx, gy, gz] = f.pos(u + s * 0.16, y + h * 0.46, -(M.reveal * 0.55) + 0.11);
    parts.push(part(cyl(0.05, 0.22, gx, gy, gz, f.axis === 'z' ? 'y' : 'y',
      `${name}-handle`, 5), p.accent));
  }
  return {
    parts,
    opening: {
      id,
      kind: 'door',
      label,
      pivot: { x: ox, y: oy, z: oz },
      axis: 'y',
      openAngle: Math.PI * 0.42,
      parts,
      pick: {
        cx: ox, cy: oy + h / 2, cz: oz,
        ...(f.axis === 'z' ? { w, h, d: 0.6 } : { w: 0.6, h, d: w }),
      },
    },
  };
}

/**
 * A casement that opens, for a street-facing window (§3.5 binds every building in the programme,
 * not only its front door).
 */
export function casementLeaf(ctx, {
  id, label, facing = 'front', plane, u, y, w, h, name = 'casement',
}) {
  const p = ctx.p;
  const M = LM_METRICS;
  const f = faceFrame(facing, plane);
  const parts = [];
  const [lx, ly, lz] = f.pos(u, y + h / 2, -(M.reveal - 0.10));
  parts.push(part(box(...f.dims(w - 0.20, h - 0.20, 0.09), lx, ly, lz, `${name}-sash`), p.metal));
  const [px, py, pz] = f.pos(u, y + h / 2, -(M.reveal - 0.10) - 0.03);
  parts.push(part(box(...f.dims(w - 0.40, h - 0.40, 0.05), px, py, pz, `${name}-pane`), p.glass));
  const [ox, oy, oz] = f.pos(u - w / 2, y, 0);
  return {
    parts,
    opening: {
      id,
      kind: 'casement',
      label,
      pivot: { x: ox, y: oy, z: oz },
      axis: 'y',
      openAngle: Math.PI * 0.30,
      parts,
      pick: {
        cx: lx, cy: ly, cz: lz,
        ...(f.axis === 'z' ? { w, h, d: 0.5 } : { w: 0.5, h, d: w }),
      },
    },
  };
}

/**
 * A clock face — the element both subjects are sorted by at board zoom, so it is sized against the
 * board station rather than against the elevation.
 *
 * At 7.33 px/m a metre is seven pixels, which is why the dial is a PALE disc in `trim` with a
 * `accent` ring and dark hands: three values at maximum separation on the darkest face of the
 * building. A dial that matched the stonework would be a smudge whatever its diameter.
 */
export function clockFace(ctx, {
  facing = 'front', plane, u, y, r, name = 'clock', hours = true,
}) {
  const p = ctx.p;
  const f = faceFrame(facing, plane);
  const out = [];
  const [dx, dy, dz] = f.pos(u, y, 0.10);
  // Surround ring, dial, then the hands standing off the dial so they cast onto it.
  out.push(part(cyl(r + 0.22, 0.22, dx, dy, dz, f.axis, `${name}-ring`, 16), p.accent));
  const [fx, fy, fz] = f.pos(u, y, 0.16);
  out.push(part(cyl(r, 0.14, fx, fy, fz, f.axis, `${name}-dial`, 16), p.trim));
  const [ax, ay, az] = f.pos(u, y, 0.24);
  // Hands at ten-past-ten, which is where every clock in every photograph of both buildings is
  // NOT — but it is the pose that reads at seven pixels a metre, because both hands clear the
  // horizontal and neither hides behind the other.
  out.push(part(rotBox(...f.dims(0.13, r * 1.5, 0.10), ax, ay + r * 0.22, az,
    f.axis === 'z' ? { z: 0.55 } : { x: -0.55 }, `${name}-hand-min`), p.metal));
  out.push(part(rotBox(...f.dims(0.15, r * 1.05, 0.10), ax, ay + r * 0.10, az,
    f.axis === 'z' ? { z: -0.95 } : { x: 0.95 }, `${name}-hand-hr`), p.metal));
  out.push(part(cyl(0.13, 0.14, ax, ay, az, f.axis, `${name}-boss`, 6), p.metal));
  if (hours && ctx.detail) {
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const [mx, my, mz] = f.pos(u + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82, 0.19);
      out.push(part(box(...f.dims(0.12, 0.12, 0.08), mx, my, mz, `${name}-mark`), p.metal));
    }
  }
  return out;
}
