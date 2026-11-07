// District Deck V3.70 — SIGNAGE lane. The shared text facility, for every lane.
//
//   import { signPlate, reliefLetters, assessLabel } from '../signage/index.js';
//
// TWO RENDERERS OVER ONE ALPHABET, AND THE CHOICE IS A MATERIAL-BUDGET CHOICE.
//
//   signPlate()     2 triangles for any word of any length, and +1 material bucket — ONE, for
//                   every sign on the whole board, because they share an atlas. Curved
//                   letterforms. Use where the building has a spare bucket, or where the sign
//                   stands on the lot rather than on the building.
//
//   reliefLetters() 10 triangles a stroke segment — 330 for an eight-letter word — and ZERO new
//                   materials: paint or applied metal on a bucket the building already owns
//                   (`trim` on `accent`, or `accent` on `trim`). Use where the building is at
//                   nine buckets, which `sign-buckets.mjs` measures as all three civic subjects
//                   today. The 10 is not negotiable; see the withdrawn 2-triangle decal in
//                   `strokePrism`.
//
// Both take the same `text`, so a lane can switch technique without re-authoring its signage,
// and `wordCost()` prices the relief route before a lane commits to it.
//
// LEGIBILITY IS THE DELIVERABLE, AND IT IS MEASURED AT A STATION, NOT ASSUMED FROM A POSE.
//
// `mvp/tests/l3sign-boardzoom.mjs --scale` derives 7.33 px/m at 319 m at 1920 x 1080 from the
// shipped rig, for a plane perpendicular to the view axis. A VERTICAL FACADE IS NOT THAT PLANE:
// measured off the live projection in `sign-lab.js`, the same station delivers **6.47 px/m along
// a wall and 4.97 px/m up it** — so sizing a mark against 7.33 makes it half again bigger on
// paper than it is on the plate, and every mark on this board is on a wall.
//
// `assessLabel()` is the refusal gate. It takes both projected scales and returns `reads`,
// `marginal` or `blank-plate`, so a lane can decline a word before it builds one. Taking the
// refusal is the point: at the graded 319 m station NO word reads on either route, at any cap
// height the architecture allows, and a blank plate beats a scatter of sub-pixel dots.

import * as THREE from 'three';
import { layoutWord, wordWidth, fitCap, normaliseText } from './alphabet.js';
import { getSignAtlas, paintPlate, SIGN_INK, SIGN_GROUND } from './atlas.js';

export { layoutWord, wordWidth, fitCap, normaliseText } from './alphabet.js';
export { signageMaterial, SIGN_INK, SIGN_GROUND } from './atlas.js';

/**
 * The board station, derived — not guessed. Authority: `mvp/tests/l3sign-boardzoom.mjs`, which
 * reads `scene.js:190` (fov 26), `camera.js:29-31` (az -45, polar 42) and `camera.js:37-38`.
 * Foreshortening is the measured plate figure from `sign-stations.mjs`, not a cosine assumed
 * from the pose.
 */
export const STATIONS = Object.freeze({
  board: Object.freeze({ pxPerM: 7.33, distance: 319, viewport: [1920, 1080] }),
});

/**
 * Stroke width in screen pixels.
 *
 * @param {number} strokeM stroke width in metres, as authored
 * @param {number} pxPerM  pixels per metre at the station, in the plane through the target
 * @param {number} fore    foreshortening of the sign's own plane, 1.0 face-on
 */
export function strokePx(strokeM, pxPerM, fore = 1) {
  return strokeM * pxPerM * fore;
}

/**
 * Price a word on the relief route before building it.
 * @returns {{segments:number, triangles:number, width:number, stroke:number, cap:number}}
 */
export function wordCost(text, { cap, strokeRatio = 0.16, tracking = 0.10 }) {
  const w = layoutWord(text, { cap, strokeRatio, tracking });
  return {
    segments: w.segments,
    triangles: w.segments * 10,
    width: w.width,
    stroke: w.stroke,
    cap,
  };
}

/* ─────────────────────────── the plane frame, shared by both routes ─────────────────────── */

/**
 * Map a point in the sign's own (u, v, n) frame to world.
 *
 * `u` runs left-to-right as the sign is READ, `v` runs up, `n` runs out of the face. The
 * handedness is worked rather than guessed: for a viewer on the +x side of an `axis: 'x'` face
 * the camera's screen-right is -z, so `u` maps to -z there. A mapping with determinant -1 mirrors
 * the letters, which is the one defect a signage module may not ship.
 */
function place(axis, facing, ox, oy, oz, u, v, n) {
  if (axis === 'z') return [ox + facing * u, oy + v, oz + facing * n];
  return [ox + facing * n, oy + v, oz - facing * u];
}

/* ───────────────────────────────── route 1 — the atlas plate ────────────────────────────── */

/**
 * A lettered plate: one quad, UV'd into the board-wide signage atlas.
 *
 * `x, y, z` is the CENTRE of the plate on its wall plane; `w, h` are its metres. `proud` lifts it
 * off the substrate so it is a fixed panel and not a decal fighting the wall for the depth buffer.
 * Returns `[]` outside a browser (the node instruments use `wordCost` instead).
 *
 * @returns {Array<{geometry: THREE.BufferGeometry, material: THREE.Material}>}
 */
export function signPlate(materials, {
  text, x, y, z, w, h, axis = 'z', facing = 1, proud = 0.035,
  ink = SIGN_INK, ground = SIGN_GROUND, capFrac = 0.62, strokeRatio = 0.16, tracking = 0.10,
  rule = 0, name = 'sign-plate',
}) {
  const atlas = getSignAtlas(materials);
  if (!atlas?.material) return [];
  const label = normaliseText(text);
  const aspect = Math.max(0.25, w / h);
  const key = `${label}|${ink}|${ground}|${capFrac}|${strokeRatio}|${tracking}|${rule}|${aspect.toFixed(3)}`;
  const rect = atlas.cell(key, aspect, (c2d, box) => {
    paintPlate(c2d, box, { text: label, ink, ground, capFrac, strokeRatio, tracking, rule: rule * box.h });
  });
  const geometry = new THREE.PlaneGeometry(w, h, 1, 1);
  if (rect) {
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) {
      uv.setXY(
        i,
        rect.u0 + uv.getX(i) * (rect.u1 - rect.u0),
        rect.v0 + uv.getY(i) * (rect.v1 - rect.v0),
      );
    }
    uv.needsUpdate = true;
  }
  // PlaneGeometry faces +z with u increasing to +x. Every rotation below is a rotation, never a
  // reflection, so the letters cannot come out mirrored on any face — checked by working the
  // camera's screen-right for each of the four cases rather than by looking at one plate.
  if (axis === 'z') {
    if (facing < 0) geometry.rotateY(Math.PI);
  } else {
    geometry.rotateY(facing > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  const [px, py, pz] = place(axis, facing, x, y, z, 0, 0, proud);
  geometry.translate(px, py, pz);
  geometry.name = name;
  return [{ geometry, material: atlas.material }];
}

/* ─────────────────────────────── route 2 — applied relief letters ───────────────────────── */

/**
 * One stroke segment as a solid: 10 triangles, five faces, no back face (it is against the wall).
 *
 * Square ends rather than round: a round cap is a cylinder and costs more than the letter.
 *
 * WHAT THAT COSTS, MEASURED AND NOT GUESSED. The first version of this comment said the square
 * ends fall SHORT of the ink box on a diagonal free end. `sign-determinism.mjs` section 2 says
 * the opposite and the comment was wrong: because each prism is extended half a stroke at both
 * ends so consecutive segments join square, a diagonal free end OVERSHOOTS — `HOSPITAL` at cap
 * 0.900 measures 0.957 m tall, +0.057, and `KKK` the same. The only shortfall is on a word of
 * plain vertical stems (`IIII` measures 1.062 against 1.134, exactly half a stroke narrow),
 * where the extension runs along the stem instead of across it.
 *
 * So the bound is +/- half a stroke in BOTH directions, and `reliefExtent()` returns the exact
 * ink box rather than the nominal one so a caller sizing a parapet band has the real number.
 */
function strokePrism(u0, v0, u1, v1, s, depth, embed, axis, facing, ox, oy, oz, extA, extB) {
  const dx = u1 - u0;
  const dy = v1 - v0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const cu = dx / len;
  const cv = dy / len;
  // Each end is extended by its OWN half-miter, not by a flat half stroke.
  //
  // [SEEN] `plates/r7/detail-applied.png` at the detail station with a flat s/2 on every end: the
  // O, S, G and 8 came out SERRATED — at a shallow turn each prism's far corners poke past the
  // letter's outline and the O reads as a gear rather than as an O. The exact overhang a joint
  // needs is (s/2)·tan(phi/2) for a turn of phi off straight, which is 0 on a straight run and
  // s/2 at a right angle; a free end still takes s/2 for a square cap.
  const hl = len / 2 + (extA + extB) / 2;
  const shift = (extB - extA) / 2;
  const mu = (u0 + u1) / 2 + cu * shift;
  const mv = (v0 + v1) / 2 + cv * shift;
  const hs = s / 2;

  // Local corners: a along the segment, b across it, n out of the wall.
  const corner = (a, b, n) => {
    const u = mu + cu * a - cv * b;
    const v = mv + cv * a + cu * b;
    return place(axis, facing, ox, oy, oz, u, v, n);
  };
  const P = [
    corner(-hl, -hs, depth), corner(hl, -hs, depth), corner(hl, hs, depth), corner(-hl, hs, depth),
    corner(-hl, -hs, -embed), corner(hl, -hs, -embed), corner(hl, hs, -embed), corner(-hl, hs, -embed),
  ];
  // THE BACK FACE IS OMITTED BECAUSE THE STROKE IS INSIDE THE WALL, NOT RESTING ON IT.
  //
  // A 2-TRIANGLE DECAL WAS BUILT HERE AND THEN WITHDRAWN, and the reason is worth keeping. The
  // first version of this offered `depth: 0` — a single quad standing `proud` of the wall, 2
  // triangles a segment instead of 10, a 5x saving advertised in this file. `sign-civic-place`
  // measured where it actually landed: the hospital ident word sat at z 7.799 against a panel
  // whose front face is 7.769, i.e. a zero-thickness plane floating 30 mm off its substrate. The
  // civic lane's own clash probe grows AABBs by 12 mm, so it would have been flagged a §1.2
  // floating element — and the lane had already solved this exact problem, in the paragraph above
  // `PAINT_EMBED` in `civic/core.js:1140`: paint INTERSECTS its substrate rather than resting on
  // it, `PAINT_EMBED` 20 mm inside and `PAINT_PROUD` 9 mm out, because "a tolerance wider than the
  // fault it hunts will never see it". A decal cannot intersect anything. The saving was real and
  // the geometry was unsound, so the saving is withdrawn rather than shipped for another lane to
  // inherit. Signwritten is now a thin SECTION (29 mm) rather than no section.
  const quads = [
    [0, 1, 2, 3], // front (proud)
    [4, 0, 3, 7], // start cap
    [1, 5, 6, 2], // end cap
    [4, 5, 1, 0], // lower flank
    [3, 2, 6, 7], // upper flank
  ];
  const pos = [];
  const uvs = [];
  for (const [a, b, c, d] of quads) {
    for (const idx of [a, b, c, a, c, d]) pos.push(P[idx][0], P[idx][1], P[idx][2]);
    for (const uv of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) uvs.push(uv[0], uv[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * A word as applied letters standing proud of a wall — pressed aluminium on a parapet, the
 * commonest identity signage on an Australian civic or retail frontage.
 *
 * ZERO new materials: `material` is a bucket the building already owns. That is the whole reason
 * this route exists, and it is why the civic lane can carry real words today while sitting on
 * §3.2's nine-bucket ceiling.
 *
 * `x` is the CENTRE of the word, `y` its BASELINE, `z` the substrate face.
 */
export function reliefLetters({
  text, x, y, z, cap, material, axis = 'z', facing = 1,
  // Defaults are SIGNWRITTEN: 9 mm proud on a 20 mm embed, which is `civic/core.js`'s
  // PAINT_PROUD / PAINT_EMBED pair, chosen there because 4 mm trips a coplanarity check at 6 mm
  // and 25 mm reads as a kerb. Applied pressed-metal letters pass `depth: 0.06`.
  depth = 0.009, embed = 0.020,
  strokeRatio = 0.16, tracking = 0.10, maxWidth = null, name = 'letters',
}) {
  let capH = cap;
  if (maxWidth) {
    const wide = wordWidth(text, { cap: capH, tracking });
    if (wide > maxWidth) capH = capH * (maxWidth / wide);
  }
  const word = layoutWord(text, { cap: capH, strokeRatio, tracking });
  const u0 = -word.width / 2;
  const out = [];
  for (const line of word.polylines) {
    const spans = miterSpans(line, word.stroke);
    for (let i = 0; i < line.length - 1; i += 1) {
      const g = strokePrism(
        u0 + line[i][0], line[i][1], u0 + line[i + 1][0], line[i + 1][1],
        word.stroke, depth, embed, axis, facing, x, y, z, spans[i][0], spans[i][1],
      );
      if (g) {
        g.name = `${name}-seg`;
        out.push({ geometry: g, material });
      }
    }
  }
  return out;
}

/**
 * Half-miter overhang at each end of every segment of a polyline. Shared by the builder and the
 * extent measurement so the two cannot disagree — a second copy of this arithmetic is the
 * duplicated-constant defect this programme has recorded ten times.
 */
function miterSpans(line, s) {
  const hs = s / 2;
  const dir = [];
  for (let i = 0; i < line.length - 1; i += 1) {
    const dx = line[i + 1][0] - line[i][0];
    const dy = line[i + 1][1] - line[i][1];
    const len = Math.hypot(dx, dy) || 1;
    dir.push([dx / len, dy / len]);
  }
  const half = (a, b) => {
    // `phi` is the turn off straight; the joint's overhang is hs * tan(phi / 2), clamped at a
    // hairpin where the exact miter runs away.
    const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]));
    const phi = Math.acos(dot);
    return Math.min(hs, hs * Math.tan(phi / 2));
  };
  return dir.map((d, i) => [
    i === 0 ? hs : half(dir[i - 1], d),
    i === dir.length - 1 ? hs : half(d, dir[i + 1]),
  ]);
}

/**
 * The word's ink box in metres, for a caller that has to leave room for it.
 *
 * `cap` / `width` are the NOMINAL box the layout was solved for; `inkH` / `inkW` are what the
 * prisms actually occupy once their per-joint miters are counted. A caller sizing a parapet band
 * uses `inkH`, because that is the number a plate will show.
 */
export function reliefExtent(text, { cap, strokeRatio = 0.16, tracking = 0.10, maxWidth = null }) {
  let capH = cap;
  if (maxWidth) {
    const wide = wordWidth(text, { cap: capH, tracking });
    if (wide > maxWidth) capH = capH * (maxWidth / wide);
  }
  const w = layoutWord(text, { cap: capH, strokeRatio, tracking });
  const hs = w.stroke / 2;
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (const line of w.polylines) {
    const spans = miterSpans(line, w.stroke);
    for (let i = 0; i < line.length - 1; i += 1) {
      const [ax, ay] = line[i];
      const [bx, by] = line[i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1e-6) continue;
      const [extA, extB] = spans[i];
      // The prism's AABB: half-length + its own miters along the segment, half-stroke across it.
      const cu = (bx - ax) / len;
      const cv = (by - ay) / len;
      const ex = Math.abs(cu) * (len / 2 + (extA + extB) / 2) + Math.abs(cv) * hs;
      const ey = Math.abs(cv) * (len / 2 + (extA + extB) / 2) + Math.abs(cu) * hs;
      const shift = (extB - extA) / 2;
      const mx = (ax + bx) / 2 + cu * shift;
      const my = (ay + by) / 2 + cv * shift;
      x0 = Math.min(x0, mx - ex); x1 = Math.max(x1, mx + ex);
      y0 = Math.min(y0, my - ey); y1 = Math.max(y1, my + ey);
    }
  }
  const has = Number.isFinite(x0);
  return {
    width: w.width,
    cap: capH,
    stroke: w.stroke,
    segments: w.segments,
    triangles: w.segments * 10,
    inkW: has ? x1 - x0 : 0,
    inkH: has ? y1 - y0 : 0,
    inkBottom: has ? y0 : 0,
  };
}

/* ─────────────────────────── the refusal gate — legibility beats content ───────────────── */

/**
 * WILL THIS LABEL READ? Answer before building it, and take "no" for an answer.
 *
 * The thresholds are not invented. They are read off plates this lane captured and OPENED, at
 * 1:1 with no magnification, on `mvp/_reviews/quality-loop/v370/signage/plates/`:
 *
 *   stroke 0.93 / 0.71 px, cap 4.5 px   (319 m, cap 0.90 m) — `board-both.png`
 *       a SCATTER OF DISCONNECTED DOTS. Not a word, not even a continuous mark, and tinted
 *       magenta by the post grade because a sub-pixel dark stroke arrives as the chroma the
 *       grade leaves behind (§5.2). This is the failure case and it looks worse than a blank.
 *   stroke 1.35 / 1.03 px, cap 6.5 px   (319 m, cap 1.30 m) — `board-big.png`
 *       a continuous mark that reads as LETTERING but not as a WORD at 1:1.
 *   stroke 2.27 / 1.74 px, cap 10.9 px  (190 m, cap 1.30 m) — `board190-big.png`
 *       "HOSPITAL" is readable at 1:1.
 *
 * So: the binding axis is the SMALLER of the two projected strokes, because a stroke that
 * survives horizontally and dies vertically is a broken letter either way — and at the board
 * pose the vertical is always the smaller, by about a quarter.
 *
 * @returns {{strokePx:number, capPx:number, verdict:'reads'|'marginal'|'blank-plate',
 *            reason:string}}
 */
export function assessLabel({ capM, strokeRatio = 0.16, pxPerMHoriz, pxPerMVert }) {
  const strokeM = capM * strokeRatio;
  const sh = strokeM * pxPerMHoriz;
  const sv = strokeM * pxPerMVert;
  const strokePx = Math.min(sh, sv);
  const capPx = capM * Math.min(pxPerMHoriz, pxPerMVert);
  if (strokePx >= 1.7 && capPx >= 10) {
    return { strokePx, capPx, verdict: 'reads', reason: 'stroke >= 1.7 px and cap >= 10 px' };
  }
  if (strokePx >= 1.0 && capPx >= 6) {
    return {
      strokePx,
      capPx,
      verdict: 'marginal',
      reason: 'reads as lettering, not as a word — acceptable only if the word is not the payload',
    };
  }
  return {
    strokePx,
    capPx,
    verdict: 'blank-plate',
    reason: 'sub-pixel stroke scatters into dots and takes a grade tint; ship a plate or a mark',
  };
}
