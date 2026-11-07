// Phone round P1, lane L0: the layout class.
//
// One rule turns the window's size into four attributes on <html>, and the phone HUD and the camera fit are keyed on them
// (docs/art-direction/PHONE-CONTRACT-2026-10-20.md, sections 1 and 7):
//
//   data-layout     tall | short | wide
//   data-orient     portrait | landscape          (landscape is w >= h)
//   data-coarse     1 | 0                         (from (any-pointer: coarse), so an iPad with a mouse counts as touch)
//   data-phone-hud  1 | 0                         (1 when data-layout is not wide and the query has no phoneHud=0)
//
// The rule (after Pocket Reserve's layout-class.ts, Z4):
//   short: w > h && h < 560
//   tall:  w <= 720   (Pocket Reserve adds `|| (w / h <= 0.8 && w <= 860)`; District Deck leaves it out so that the iPads in
//                     portrait keep today's layout: orchestrator, 21 Oct, contract section 1; the iPad beyond 44 px targets is P2)
//   wide:  everything else
//
// The window is read from the visual viewport where there is one, scaled back by the page's own zoom so that a pinch does not
// change the class; at a zoom of 1 this is visualViewport.width and .height. Where there is none it is innerWidth and innerHeight.
//
// ONE SOURCE. play.html cannot import a module before first paint, so its head carries an inline script that sets the attributes
// at once. The text between the "layout-class:begin" and "layout-class:end" markers below is the same text, line for line, as the
// text between the same markers in the head script of mvp/play.html; mvp/tests/layout-class.test.mjs fails when the two differ
// and again when the head script's behaviour differs from this module's at any window of the contract's section 4. To change the
// rule or the event: edit one region, copy it over the other, run the test. At run time there is one instance: the head script
// stores it on window.__ddLayout, and this module's readLayout() and onLayoutChange() use that instance (and create one, once,
// on a page that has no head script). The head script owns the listeners; they are added once.
//
// The attributes follow `resize`, `orientationchange`, the visual viewport's `resize` and a change of the pointer media query,
// debounced at 100 ms. `window` gets a 'layoutchange' CustomEvent only when layout, orient, coarse or phoneHud changes, never twice
// in one resize step. event.detail and readLayout() are { layout, orient, coarse, phoneHud, w, h } with coarse and phoneHud as
// booleans (the attributes carry '1' and '0'); the attributes are written before the event is dispatched.

// layout-class:begin
function ddLayoutRule(w, h, coarse, off) {
  var orient = w >= h ? 'landscape' : 'portrait';
  var layout = w > h && h < 560 ? 'short' : w <= 720 ? 'tall' : 'wide';
  return { layout: layout, orient: orient, coarse: !!coarse, phoneHud: layout !== 'wide' && !off };
}

function ddCreateLayoutClass(win, doc) {
  var root = doc.documentElement;
  var now = null;
  var timer = 0;
  var started = false;
  var api = null;

  function copy(info) {
    return { layout: info.layout, orient: info.orient, coarse: info.coarse, phoneHud: info.phoneHud, w: info.w, h: info.h };
  }
  function size() {
    var vv = win.visualViewport;
    var zoom = (vv && vv.scale) || 1;
    return { w: Math.round(vv ? vv.width * zoom : win.innerWidth), h: Math.round(vv ? vv.height * zoom : win.innerHeight) };
  }
  function coarseNow() {
    try { return !!win.matchMedia('(any-pointer: coarse)').matches; } catch (e) { return false; }
  }
  function switchedOff() {
    try { return new win.URLSearchParams(win.location.search).get('phoneHud') === '0'; } catch (e) { return false; }
  }
  function put(name, value) {
    if (root.getAttribute(name) !== value) root.setAttribute(name, value);
  }
  function apply() {
    var s = size();
    var next = ddLayoutRule(s.w, s.h, coarseNow(), switchedOff());
    var prev = now;
    next.w = s.w;
    next.h = s.h;
    now = next;
    put('data-layout', next.layout);
    put('data-orient', next.orient);
    put('data-coarse', next.coarse ? '1' : '0');
    put('data-phone-hud', next.phoneHud ? '1' : '0');
    if (prev && (prev.layout !== next.layout || prev.orient !== next.orient || prev.coarse !== next.coarse || prev.phoneHud !== next.phoneHud)) {
      try { win.dispatchEvent(new win.CustomEvent('layoutchange', { detail: copy(next) })); } catch (e) { /* no CustomEvent: the attributes still follow */ }
    }
    return next;
  }
  function later() {
    win.clearTimeout(timer);
    timer = win.setTimeout(apply, 100);
  }
  function start() {
    if (started) return api;
    started = true;
    apply();
    win.addEventListener('resize', later);
    win.addEventListener('orientationchange', later);
    if (win.visualViewport) win.visualViewport.addEventListener('resize', later);
    try {
      var mql = win.matchMedia('(any-pointer: coarse)');
      if (mql.addEventListener) mql.addEventListener('change', later);
      else if (mql.addListener) mql.addListener(later);
    } catch (e) { /* an old engine has no media query object to watch */ }
    return api;
  }
  function read() {
    if (!now) apply();
    return copy(now);
  }
  function on(fn) {
    function handler(event) { fn(event.detail); }
    win.addEventListener('layoutchange', handler);
    return function () { win.removeEventListener('layoutchange', handler); };
  }

  api = { rule: ddLayoutRule, start: start, read: read, on: on };
  return api;
}
// layout-class:end

/** The rule on a size alone: layoutRule(w, h, coarse, off) -> { layout, orient, coarse, phoneHud }. `off` is true for ?phoneHud=0. */
export const layoutRule = ddLayoutRule;

/** A layout-class instance on a given window and document (the unit test drives it with fakes). Not started until .start(). */
export const createLayoutClass = ddCreateLayoutClass;

let shared = null;

/** The page's instance: the head script's, or one made here (and started) on a page that has no head script. */
export function layoutInstance() {
  if (shared) return shared;
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('layout-class: there is no window here; use createLayoutClass(win, doc) with a window of your own');
  }
  if (window.__ddLayout) {
    shared = window.__ddLayout;
  } else {
    shared = ddCreateLayoutClass(window, document).start();
    window.__ddLayout = shared;
  }
  return shared;
}

/** The class the window is in, as last applied (the same as the attributes on <html>): { layout, orient, coarse, phoneHud, w, h }. */
export function readLayout() {
  return layoutInstance().read();
}

/** Call `fn(detail)` each time layout, orient, coarse or phoneHud changes. Returns the function that stops it. */
export function onLayoutChange(fn) {
  return layoutInstance().on(fn);
}
