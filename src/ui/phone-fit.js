// Phone round P1, lane L1: the camera fit on the phone classes (docs/art-direction/PHONE-CONTRACT-2026-10-20.md, sections 2 and 6).
//
// On `tall` and `short` (data-phone-hud 1) the board is fitted into the room the phone HUD leaves, by IsoCameraRig.fitWindow: distance and a slide of the
// target at the held azimuth and polar, with no view offset. This module decides when and into what:
//
//   the opening       Scene.frameOpeningCity() calls opening(city) after it has posed the desktop opening: the reserve centre is put on the room's centre
//                     with `width` metres of ground across the room. tall: 101.2 m (?phoneFitW=), the sweep's pick for 390x844 (scratch/phone/gate/sweep:
//                     distance 340 m at polar 44, the plate 29.5 % in the room, a 16 m parcel at 61 px); never closer than 68 px a parcel, so a wide
//                     tall window (720 px) shows more ground and not a bigger parcel. short: the room is wide and 200 to 300 px high, where the same 101 m
//                     would show 8 % of the plate, so the width follows the room: a 16 m parcel at 49 px (the gate's floor is 48), about 215 to 260 m of
//                     ground across 667 to 814 px. The polar is 44 degrees (?phoneFitPolar=).
//   Frame city        rig.workFrame carries { rect, plate, curve }, and IsoCameraRig.frameAll() (the camera popover's frame key, the F key, the settlement
//                     presenter's dismissal) fits the plate's corners, at the ground and 24 m up, into the room, out to rig.fitMaxDistance (1800 m; the far
//                     plane is 2000 m). maxDistance, and with it the world curve's ramp, is not touched; the curve's bend of the plate is part of the fit.
//   the fold          on `layoutchange` and on a resize within a class (a debounced `resize`, 140 ms, and the visual viewport's), when the camera stands where
//                     the last fit left it (rig.fitIsHome()), the same fit is made again into the new room. A camera the player has moved stays theirs.
//                     The work is a few projections; it is its own listener and adds nothing to the game's resize handler.
//
// ?phoneHud=0 (and the wide class) leave everything off: workFrame and fitMaxDistance stay null, opening() returns at once, today's camera.
// Nothing here runs inside update() or _poseCamera.

import { readLayout, onLayoutChange, layoutRule } from './layout-class.js';
import { bands as readCachedBands, refreshBands, fitRoom } from './bands.js';
import { curvatureForDistance, fitDistanceForExtent } from '../render/world-curve.js';

const DEG = Math.PI / 180;

/** The fit's numbers (contract section 6: config with query knobs). */
export const PHONE_FIT = Object.freeze({
  widthM: 101.2,        // metres of ground across the room on tall (?phoneFitW=)
  polarDeg: 44,         // the opening's polar (?phoneFitPolar=)
  parcelM: 16,
  tallMaxParcelPx: 68,  // a tall room never shows a 16 m parcel larger than this: the width grows with the room instead
  shortParcelPx: 49,    // a short room shows the 16 m parcel at this size
  maxDistance: 1800,    // fitMaxDistance: the farthest a fit may stand (camera.far is 2000)
  rise: 24,             // the building allowance over the plate for Frame city, metres
  resizeMs: 140,
  reservePulse: 1.05,   // P2d CAM4: the selection ring's pulse peak (board.js: 1 + 0.05 sin), so the fitted footprint is the ring at its widest
  reserveFitPadPx: 1,   // P2d CAM4: px kept free on each side of the room, over the seat's refine tolerance (0.5 px)
});

/**
 * P2d CAM4: the least camera distance, never under `floor`, at which the reserve ring's footprint (a ground circle of `radius` metres about `ring`, at
 * `ringY`) lies inside `rect` less `pad` once the seat has put `anchor` (at the seat's 6 m) on the rect's centre, at the held `azimuth` and `polar` and the
 * camera's vertical field of view `fovDeg`. `canvas` is the canvas's client rect { left, top, width, height }; `aspect` defaults to its width over height.
 * The camera looks at its ground target (rig.focus leaves lookHeight 0), so its orientation does not depend on the distance and the seat's ground pan is a
 * translation: for a distance the camera stands on the ray through the rect's centre that meets the anchor, at the height that distance gives. The answer
 * is a function of the ring, the room, the canvas, the field of view and the held angles alone (bisection to 1 mm). It returns `floor` when the ring fits
 * there and `max` when it fits nowhere up to `max`.
 */
export function reserveFitDistance({
  anchor, ring = anchor, radius, ringY = 0.3, anchorY = 6, rect, canvas, azimuth, polar, fovDeg, aspect = null,
  floor, max, pad = PHONE_FIT.reserveFitPadPx, samples = 64,
}) {
  const w = canvas.width;
  const h = canvas.height;
  const asp = Number.isFinite(aspect) && aspect > 0 ? aspect : w / h;
  const tanH = Math.tan(((Number.isFinite(fovDeg) && fovDeg > 0 ? fovDeg : 36) * DEG) / 2);
  // The camera's axes (three's lookAt with up +y): Z from the target to the camera, X = up x Z, Y = Z x X.
  const Z = [Math.sin(azimuth) * Math.cos(polar), Math.sin(polar), Math.cos(azimuth) * Math.cos(polar)];
  const xl = Math.hypot(Z[2], Z[0]) || 1;
  const X = [Z[2] / xl, 0, -Z[0] / xl];
  const Y = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
  const nx = (((rect.left + rect.right) / 2 - canvas.left) / w) * 2 - 1;
  const ny = 1 - (((rect.top + rect.bottom) / 2 - canvas.top) / h) * 2;
  const dir = [0, 1, 2].map((i) => -Z[i] + nx * tanH * asp * X[i] + ny * tanH * Y[i]);
  const fits = (distance) => {
    if (!(dir[1] < 0)) return false;
    const s = (anchorY - distance * Math.sin(polar)) / dir[1];
    if (!(s > 0)) return false;
    const C = [anchor.x - s * dir[0], anchorY - s * dir[1], anchor.z - s * dir[2]];
    for (let k = 0; k < samples; k += 1) {
      const a = (k / samples) * Math.PI * 2;
      const v = [ring.x + radius * Math.cos(a) - C[0], ringY - C[1], ring.z + radius * Math.sin(a) - C[2]];
      const zc = v[0] * Z[0] + v[1] * Z[1] + v[2] * Z[2];
      if (!(zc < 0)) return false;
      const px = canvas.left + (((v[0] * X[0] + v[1] * X[1] + v[2] * X[2]) / (-zc * tanH * asp) + 1) / 2) * w;
      const py = canvas.top + ((1 - (v[0] * Y[0] + v[1] * Y[1] + v[2] * Y[2]) / (-zc * tanH)) / 2) * h;
      if (px < rect.left + pad || px > rect.right - pad || py < rect.top + pad || py > rect.bottom - pad) return false;
    }
    return true;
  };
  if (fits(floor)) return floor;
  if (!fits(max)) return max;
  let lo = floor;
  let hi = max;
  while (hi - lo > 1e-3) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid; else lo = mid;
  }
  return hi;
}

const num = (text) => (text == null || text === '' ? NaN : Number(text));

/** The query knobs: { widthM, polarDeg } as numbers, or null where the query has none (or a value out of range). */
export function parseKnobs(search) {
  let params = null;
  try { params = new URLSearchParams(search || ''); } catch (e) { params = null; }
  const w = num(params?.get('phoneFitW'));
  const p = num(params?.get('phoneFitPolar'));
  return {
    widthM: Number.isFinite(w) && w >= 10 && w <= 1200 ? w : null,
    polarDeg: Number.isFinite(p) && p >= 22 && p <= 68 ? p : null,
  };
}

/** Metres of ground across the room for the opening: the knob when there is one, else the rule above. `room` is { left, right }. */
export function openingWidth(room, layout, knobW = null, cfg = PHONE_FIT) {
  if (Number.isFinite(knobW) && knobW > 0) return knobW;
  const across = room.right - room.left;
  if (layout === 'short') return (across * cfg.parcelM) / cfg.shortParcelPx;
  return Math.max(cfg.widthM, (across * cfg.parcelM) / cfg.tallMaxParcelPx);
}

/**
 * Phone round P2b (item 1, one seat per fold): is the window already in another layout class than the one written on <html>? The head script writes
 * data-layout / data-orient 100 ms after a resize and then dispatches `layoutchange`, which seats the open card's selection on the new class's bands. A seat made
 * in between reads the previous class's bands and, being relative to the camera it finds, leaves the second seat path-dependent (RSZ: 4e-4 m, 5e-3 m).
 * The window is read as the head script reads it (the visual viewport scaled back by the page zoom), the class by the layout-class rule (layoutRule, not a copy).
 * An absent data-layout (no head script yet, a bare test page) counts as no flip, and so does an absent data-orient for the orientation. A flip of the
 * orientation alone inside the wide class (the iPad) is no flip.
 */
export function classFlipPending(win = window, doc = document) {
  const root = doc?.documentElement;
  const layout = root?.getAttribute('data-layout');
  if (!layout) return false;
  const vv = win.visualViewport;
  const zoom = (vv && vv.scale) || 1;
  const w = Math.round(vv ? vv.width * zoom : win.innerWidth);
  const h = Math.round(vv ? vv.height * zoom : win.innerHeight);
  if (!(w > 0 && h > 0)) return false;
  const next = layoutRule(w, h, false, false);
  if (next.layout !== layout) return true;
  // An orientation that flips while the class stays `wide` (an iPad turned, 820x1180 to 1180x820) is no class flip: the bands do not change, so the resize's
  // own seat is the right one and the iPad seats as it always did. Inside tall (650x700 to 700x650) layoutchange still follows the orientation.
  if (layout === 'wide') return false;
  const orient = root.getAttribute('data-orient');
  return !!orient && next.orient !== orient;
}

/**
 * The controller for one SceneView (`view.rig`, `view.canvas`, `view.city`). Options are for the unit test: win, readLayout, onLayoutChange, bands
 * ({ refresh(), bands() }), search.
 */
export function createPhoneFit(view, opts = {}) {
  const win = opts.win ?? window;
  const layoutNow = opts.readLayout ?? readLayout;
  const onLayout = opts.onLayoutChange ?? onLayoutChange;
  const bandApi = opts.bands ?? { refresh: refreshBands, bands: readCachedBands };
  const knobs = parseKnobs(opts.search ?? win.location?.search ?? '');
  const rig = () => view.rig;
  let lastKey = null;
  let timer = 0;
  let frameId = 0;
  let disposed = false;
  const nextFrame = (fn) => (win.requestAnimationFrame ? win.requestAnimationFrame(fn) : win.setTimeout(fn, 16));
  const cancelFrame = (id) => { if (id) { if (win.cancelAnimationFrame) win.cancelAnimationFrame(id); else win.clearTimeout(id); } };
  let stopLayout = null;

  function canvasSize() {
    const rect = view.canvas?.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) return { w: rect.width, h: rect.height };
    const l = layoutNow();
    return { w: l.w, h: l.h };
  }
  // The room is in the key: the safe-area insets settle after the size and fire no resize, so a fit made on the old insets is refitted
  // by the checks on the next two animation frames that the layout change schedules (recheck(), below).
  function keyOf(l, size) {
    const room = rig()?.workFrame?.rect;
    const rect = room ? `${Math.round(room.left)},${Math.round(room.top)},${Math.round(room.right)},${Math.round(room.bottom)}` : '-';
    return `${Math.round(size.w)}x${Math.round(size.h)}|${l.layout}|${l.orient}|${l.phoneHud ? 1 : 0}|${rect}`;
  }
  const curveOf = () => {
    const extent = view.city?.extent ?? { x: 272, z: 272 };
    const fit = fitDistanceForExtent(extent);
    return (distance) => curvatureForDistance(distance, fit, rig().maxDistance);
  };

  /**
   * Make the rig's phone state match the layout: on a phone class read the bands, set the work frame and fitMaxDistance; on wide (or with the switch at 0)
   * clear them. Returns the layout when the phone fit is on, else null.
   */
  function sync() {
    const r = rig();
    if (!r) return null;
    const l = layoutNow();
    if (!l.phoneHud) {
      r.workFrame = null;
      r.fitMaxDistance = null;
      return null;
    }
    bandApi.refresh();
    const size = canvasSize();
    const extent = view.city?.extent ?? { x: 272, z: 272 };
    r.fitMaxDistance = PHONE_FIT.maxDistance;
    r.workFrame = {
      rect: fitRoom(bandApi.bands(), size.w, size.h),
      plate: { x0: 0, z0: 0, x1: extent.x, z1: extent.z, rise: PHONE_FIT.rise },
      curve: curveOf(),
    };
    return l;
  }

  function fitOpening(city, l) {
    const r = rig();
    const rect = r.workFrame.rect;
    const extent = city?.extent ?? view.city?.extent ?? { x: 272, z: 272 };
    const centre = city?.reserve?.centre ?? view.city?.reserve?.centre ?? { x: extent.x * 0.5, z: extent.z * 0.5 };
    return r.fitWindow(
      { x: centre.x, z: centre.z, width: openingWidth(rect, l.layout, knobs.widthM) },
      rect,
      { polar: (knobs.polarDeg ?? PHONE_FIT.polarDeg) * DEG, kind: 'opening', curve: r.workFrame.curve },
    );
  }

  /** Scene.frameOpeningCity() calls this after it has posed the desktop opening. Does nothing off the phone classes. */
  function opening(city) {
    const l = sync();
    if (!l) return null;
    lastKey = keyOf(l, canvasSize());
    return fitOpening(city, l);
  }

  /** A layout change or a resize: read the bands again and, when the camera is where the last fit left it, fit again into the new room. */
  function refit() {
    if (disposed) return false;
    const l = sync();
    if (!l) { lastKey = null; return false; }
    const key = keyOf(l, canvasSize());
    if (key === lastKey) return false;
    lastKey = key;
    const r = rig();
    if (!r.fitIsHome()) return false;
    if (r.lastFit.kind === 'frame') r.frameAll();
    else fitOpening(view.city, l);
    return true;
  }

  /**
   * Round P2a (B): the pose to come back to when the settlement presenter closes. Taken when Settle is pressed, with the fit's key (window, class, orientation and
   * room), so that the return can tell whether the pose can still be had. null off the phone classes.
   */
  function holdPose() {
    const r = rig();
    const l = sync();
    if (!r || !l) return null;
    return { key: keyOf(l, canvasSize()), pose: r.poseState() };
  }

  /**
   * Round P2a (B): the presenter has closed. On a phone class the camera goes back to the held pose when the fit's key is the one it was held under, and to the
   * phone home fit for the current orientation when it is not (the layout, the orientation, the window or the room changed while the books were open) or
   * when nothing was held. Never the whole plate. Returns 'pose', 'home', or false off the phone classes (the caller keeps Frame city).
   */
  function returnPose(held) {
    if (disposed) return false;
    const l = sync();
    if (!l) { lastKey = null; return false; }
    const key = keyOf(l, canvasSize());
    lastKey = key;
    if (held && held.key === key && rig().restorePose(held.pose)) return 'pose';
    fitOpening(view.city, l);
    return 'home';
  }

  function later() {
    win.clearTimeout(timer);
    timer = win.setTimeout(refit, PHONE_FIT.resizeMs);
  }

  /**
   * The insets settle after the size and fire no resize, and the card's state follows the layout in the same task, so the room can still be the old one when the
   * layout-change refit reads it. The next two animation frames read it again and refit only when the rounded room has changed (the key), never on a timer, so a
   * settled room costs no second move and a late one is caught a frame or two on rather than 140 ms on.
   */
  function recheck() {
    cancelFrame(frameId);
    let left = 2;
    const step = () => {
      frameId = 0;
      if (disposed) return;
      refit();
      if (--left > 0) frameId = nextFrame(step);
    };
    frameId = nextFrame(step);
  }

  stopLayout = onLayout(() => { win.clearTimeout(timer); refit(); recheck(); });
  win.addEventListener('resize', later);
  win.visualViewport?.addEventListener?.('resize', later);
  // The state a page that boots on a phone starts in: the work frame is there before the first Frame city.
  sync();

  return {
    knobs,
    active: () => !!layoutNow().phoneHud,
    opening,
    holdPose,
    returnPose,
    refit,
    sync,
    dispose() {
      disposed = true;
      win.clearTimeout(timer);
      cancelFrame(frameId);
      stopLayout?.();
      win.removeEventListener('resize', later);
      win.visualViewport?.removeEventListener?.('resize', later);
      const r = rig();
      if (r) { r.workFrame = null; r.fitMaxDistance = null; }
    },
  };
}
