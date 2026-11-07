// District Deck style W1, lane L3: roughness and metal rules, and daytime emission.
//
// Two switches, both off unless the URL says so, and independent of each other:
//
//   ?styleRules=1   On every lit (standard or physical) material that is neither glass nor water: metalness at most
//                   0.15, roughness at least 0.55 (a roughness above the floor, the 0.95 and over that the landscape
//                   lane authored matte included, is never touched), clearcoat 0. The walk runs inside LightingRig.applyEnvironmentToScene, before the
//                   environment tune reads the scalars and before the world bake fingerprints them, and runs again on
//                   every later call, so a material created after the first walk (a succession, a late load) meets the
//                   rule at the next call. It is idempotent.
//   ?styleEmit=1    Daytime emission off on non-glass lit materials of two kinds: people (the Meshy GLB material
//                   ships with emissive white and an emissive map, the kit people carry a fluorescent lift, the venue
//                   crowds an emissive floor) and lamp heads (street and reserve-path lamp glow, car and bus head
//                   lamps, bus tail lamps), and nothing else: signal lenses, screens, floodlights and a venue's own
//                   lit signs are state or purpose, and stay. The
//                   lamp heads keep their authored intensity in userData and follow `lampLevel(arc)`, the complement of
//                   the curve that lights the building glass at low sun, so a rig put at dusk still lights them.
//
// Glass and water are told exactly as scripts/qa/taste/instruments/measure-core.js tells them: by the material (transmission,
// transparency, or a name that says glass, window, lens, visor, reflection or pane; a name or family that says water, ocean, foam
// or wake) and, failing that, by the names of the mesh that draws the material and of its ancestors (surface-words.js, copied
// below as GLASS_WORDS, WATER_WORDS, PLACE_NAMES and nameSurface). A blank-named material on a mesh called bus-glazing is glass, and
// one on cliff-surge-foam is water. The copies are the game's own; the instrument is never imported here, and
// mvp/tests/style-w1-l3-rules.test.mjs holds the two in agreement (the lists, the stems and the verdict of every name it tries).
// The rules are per material and the names are per mesh: a material that a pane or a wet surface shares with other meshes takes its
// majority by the triangles drawn with it (applyStyleRules), and the environment scale and the world bake read the walk's verdict
// from userData.styleSurface.
// A lit material that is transparent and writes no depth is an overlay (foam sheets, wet collars, the reef rings), which the class pass
// calls a decal and the scene probe leaves out of the drawn set; it keeps its authored values too (isDecalMaterial), because
// water/painted-rings.js retires the reef rings by their authored roughness.

/** The rule table. Frozen; the walk reads nothing else. */
export const STYLE_RULES = Object.freeze({
  metalnessMax: 0.15,
  roughnessMin: 0.55,
  clearcoatMax: 0,
});

/** The scene probe's glass name rule, copied (measure-core.js GLASS_NAME). */
export const GLASS_NAME = /glass|glaz|window|windscreen|windshield|\blens\b|reflection|visor|\bpane/i;

/** Water and sea surfaces keep their own response (the same words lighting.js's environment scale exempts). */
export const WATER_NAME = /water|ocean|foam|wake/i;

// ---- glass and water told by the names of the mesh and its ancestors (review FIX 1) ---------------------------------------
//
// The game's copy of scripts/qa/taste/instruments/surface-words.js, function for function. The rule, on the names of a mesh and of
// its named ancestors (a material's own name keeps GLASS_NAME and WATER_NAME above):
//  1. Words. A name is cut at every character that is not a letter (':', '-', '_', ' ', '.', '/', digits) and at each change of case
//     inside a word (hotelGlass is hotel, glass), lower-cased, and words of one letter are dropped. A list word matches a whole word,
//     or that word plus s or es; a list word inside a longer word never counts (wglass, glassbrick, surfboard, backpanel, panel,
//     wetted). 'glaz' is the one stem: it matches glaze, glazes, glazing and glazings, and not glazed (a glazed tile roof is ceramic).
//  2. Place names. The word runs in PLACE_NAMES are proper names and are taken out first (falls creek).
//  3. Position. A glass word counts only as the last word of a ':' segment (side-glass, bus-glazing, tram-stop-windows); window-sill,
//     window-frame and glazing-bar name parts of a window and are not glass. A water word counts anywhere in a segment (tide-band).
//  4. The nearest name decides. From the mesh up, the first name that holds a list word decides; a window part stops the walk.
// A batch mesh (batching.js) is read through the names of its sources and the parents of their stubs.

export const GLASS_WORDS = Object.freeze(['glaz', 'glass', 'window', 'windscreen', 'lens', 'visor', 'pane']);
export const WATER_WORDS = Object.freeze(['foam', 'surf', 'tide', 'wet', 'tarn', 'creek', 'waterfall', 'spray']);
export const PLACE_NAMES = Object.freeze(['falls creek']);
export const STEMS = Object.freeze({ glaz: Object.freeze(['glaze', 'glazes', 'glazing', 'glazings']) });

const formsOf = (word) => STEMS[word] ?? [word, word + 's', word + 'es'];
const SURFACE_FORM = new Map();
for (const word of GLASS_WORDS) for (const form of formsOf(word)) SURFACE_FORM.set(form, { surface: 'glass', word });
for (const word of WATER_WORDS) for (const form of formsOf(word)) SURFACE_FORM.set(form, { surface: 'water', word });
const PLACE_WORDS = PLACE_NAMES.map((place) => place.split(' '));
const ANY_LIST_WORD = new RegExp(GLASS_WORDS.concat(WATER_WORDS).join('|'), 'i');

/** The words of one name segment, as the instrument cuts them. */
export function surfaceWords(text) {
  return String(text ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z]+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 1);
}

function dropPlaceNames(words) {
  const out = [];
  for (let i = 0; i < words.length; i += 1) {
    const place = PLACE_WORDS.find((run) => run.every((word, k) => words[i + k] === word));
    if (place) { i += place.length - 1; continue; }
    out.push(words[i]);
  }
  return out;
}

/**
 * One name: { surface: 'glass' | 'water' | null, word, name, why } when it holds a list word, else null.
 * why is 'head' (a glass word ending a segment), 'word' (a water word) or 'part' (glass words only, none of them a head; surface null).
 */
export function nameSurface(name) {
  const text = String(name ?? '');
  // A list word is a run of letters of the name (the cut only separates), so a name that holds none of them as a substring is no surface;
  // most names in the scene are not, and the word cut is the expensive part.
  if (!ANY_LIST_WORD.test(text)) return null;
  let glass = null;
  let water = null;
  let part = null;
  for (const segment of text.split(':')) {
    const words = dropPlaceNames(surfaceWords(segment));
    words.forEach((word, i) => {
      const form = SURFACE_FORM.get(word);
      if (!form) return;
      if (form.surface === 'water') water ??= form.word;
      else if (i === words.length - 1) glass ??= form.word;
      else part ??= form.word;
    });
  }
  if (glass) return { surface: 'glass', word: glass, name, why: 'head' };
  if (water) return { surface: 'water', word: water, name, why: 'word' };
  if (part) return { surface: null, word: part, name, why: 'part' };
  return null;
}

/** A chain of names, outermost first: the verdict of the nearest name that holds a list word, or null when none does. */
export function surfaceOfChain(chain) {
  for (let i = (chain?.length ?? 0) - 1; i >= 0; i -= 1) {
    const verdict = nameSurface(chain[i]);
    if (verdict) return verdict;
  }
  return null;
}

// The verdict of a name is a function of the string alone, so it is kept between walks (the walk repeats at every state sync).
const NAME_VERDICTS = new Map();
const NAME_VERDICT_LIMIT = 50000;
const NO_SURFACE = Object.freeze({ glass: 0, water: 0 });
const ALL_GLASS = Object.freeze({ glass: 1, water: 0 });
const ALL_WATER = Object.freeze({ glass: 0, water: 1 });

/**
 * Reads what the names of a mesh tell, for the length of one walk: a verdict is kept per distinct name and per object, so a group's
 * name is read once however many meshes stand under it. `shares(mesh)` is the part of the mesh's triangles that is glass and the part
 * that is water: all or none of an ordinary mesh; for a batch mesh, which draws one material for many sources, the share of its
 * sources that are told (the stub's parents when the stub is registered, the source's own name when it is not), as the scene probe's
 * surfaceShares estimates it.
 */
function createSurfaceReader() {
  const byObject = new Map();
  const byMesh = new Map();
  const byVisible = new Map();
  const ofName = (name) => {
    let verdict = NAME_VERDICTS.get(name);
    if (verdict === undefined) {
      verdict = nameSurface(name);
      if (NAME_VERDICTS.size >= NAME_VERDICT_LIMIT) NAME_VERDICTS.clear();
      NAME_VERDICTS.set(name, verdict);
    }
    return verdict;
  };
  // The nearest named object from here up that holds a list word decides; a window part (surface null) stops the walk there.
  const ofObject = (object) => {
    if (!object) return null;
    let surface = byObject.get(object);
    if (surface !== undefined) return surface;
    const here = object.name ? ofName(object.name) : null;
    surface = here ? here.surface : ofObject(object.parent);
    byObject.set(object, surface);
    return surface;
  };
  const sharesOf = (mesh) => {
    if (!mesh.userData?.batchStatic) {
      const surface = ofObject(mesh);
      return surface === 'glass' ? ALL_GLASS : surface === 'water' ? ALL_WATER : NO_SURFACE;
    }
    const names = mesh.userData.mergedNames ?? [];
    if (!names.length) return NO_SURFACE;
    let top = mesh;
    while (top.parent) top = top.parent;
    const registry = top.userData?.mergedNameRegistry;
    let glass = 0;
    let water = 0;
    for (const name of names) {
      const stub = registry?.get?.(name);
      const surface = stub ? ofObject(stub) : (ofName(name)?.surface ?? null);
      if (surface === 'glass') glass += 1; else if (surface === 'water') water += 1;
    }
    return glass || water ? { glass: glass / names.length, water: water / names.length } : NO_SURFACE;
  };
  // Drawn as the scene probe counts a mesh in its drawn set: the mesh and every ancestor visible, and not a pick proxy. Meshes the game
  // hides (water.js retires covered fringe water and the reef rings, a venue's pieces wait for their event) draw nothing and do not vote.
  const isDrawn = (object) => {
    if (!object) return true;
    let drawn = byVisible.get(object);
    if (drawn === undefined) {
      drawn = object.visible !== false && !/^pick:/.test(object.name || '') && isDrawn(object.parent);
      byVisible.set(object, drawn);
    }
    return drawn;
  };
  return {
    ofObject,
    isDrawn,
    shares(mesh) {
      let shares = byMesh.get(mesh);
      if (!shares) { shares = sharesOf(mesh); byMesh.set(mesh, shares); }
      return shares;
    },
  };
}

/** The triangles a mesh would draw with `entry` (an instanced mesh counts every instance), counted as the scene probe counts them. */
function drawnTriangles(object, entry) {
  const geometry = object.geometry;
  if (!geometry?.attributes?.position) return 0;
  const length = geometry.index ? geometry.index.count : geometry.attributes.position.count;
  let triangles = length / 3;
  const range = geometry.drawRange;
  if (range && Number.isFinite(range.count)) triangles = Math.min(triangles, range.count / 3);
  if (Array.isArray(object.material)) {
    if (geometry.groups?.length) {
      triangles = 0;
      for (const group of geometry.groups) {
        if (object.material[group.materialIndex] === entry) triangles += Math.max(0, Math.min(group.count, length - group.start)) / 3;
      }
    } else if (object.material[0] !== entry) {
      return 0;
    }
  }
  return object.isInstancedMesh ? triangles * object.count : triangles;
}

/** Material names of the kit people (people/materials.js). */
const KIT_PEOPLE_NAME = /^v332:people:/;
/**
 * Names of the nodes that hold people: the kit people and the Meshy pool (v332:people, v332:meshy-people), the ambient
 * and auction crowds, and the event visitors, marshals, skiers, guests, workers and the rest that the fringe venues name
 * `fringe:<venue>-<kind>`. The game's own list; mvp/tests/style-w1-l3-rules.test.mjs holds it equal to the scene probe's
 * person rule, because the probe's "people" are what the daytime emission figure counts.
 */
export const PERSON_NODE_NAME = /^v\d+:(people|ambient|crowd|auction-crowd|meshy-people)(:|$)|i\d+-body$|-(people|visitor|marshal|skier|crowd|guest|worker|gang|pax|crew|villager|tourer|walker|patrol|rider|driver|sitter|swimmer|kid|couple|family|spectator-bank)(:|-|\d|$)|:person:|^beach-(sitter|swimmer|group)|volley-player|kiosk-queue/;
/** Variants of the shared painted-metal family that are lamp heads (board.js: avenue and reserve path lamps). */
const LAMP_VARIANT = /lamp-glow/;

/** Emission below this luminance (linear, times intensity) is not daytime emission to the probe either. */
export const EMISSIVE_DAY_THRESHOLD = 0.02;

/** Parse ?styleRules= and ?styleEmit=; only the value 1 turns a switch on. */
export function parseStyleSwitches(search) {
  const q = new URLSearchParams(search || '');
  return Object.freeze({ rules: q.get('styleRules') === '1', emit: q.get('styleEmit') === '1' });
}

/** The page's switches, read once at import (a node test has no location and gets both off). */
export const STYLE_SWITCHES = parseStyleSwitches(
  typeof location !== 'undefined' && location?.search ? location.search : '',
);

/** Glass as the scene probe tells it. */
export function isGlassMaterial(material) {
  if (!material) return false;
  if ((material.transmission ?? 0) > 0) return true;
  if (material.transparent && (material.opacity ?? 1) < 0.98) return true;
  return GLASS_NAME.test(material.name || '');
}

/** Water, as the environment scale tells it: the material's name or its family. */
export function isWaterMaterial(material) {
  if (!material) return false;
  return WATER_NAME.test(`${material.name ?? ''} ${material.userData?.family ?? ''}`);
}

/**
 * An overlay: transparent and not writing depth (the Apostles surge foam, the aerated foam and the tour boat's wet collar, contact
 * sheets). classpass.js (overlayReason) reads such a mesh as a decal and the scene probe leaves it out of the drawn set; the rules leave
 * it alone, so the shared foam material is still at its authored roughness when water/painted-rings.js looks for the reef rings by it.
 */
export function isDecalMaterial(material) {
  return Boolean(material && material.transparent && material.depthWrite === false);
}

/**
 * True for a material the rules leave alone: glass or water by its own tests, an overlay (isDecalMaterial), or told glass or water by
 * the names of a mesh that draws it (the walk stamps userData.styleSurface on those; traffic.js stamps the cars' head lamps where it
 * builds them). Daytime emission does not read this: it keeps isGlassMaterial, so a lamp lens still goes dark by day.
 */
export function isStyleExempt(material) {
  if (!material) return false;
  return Boolean(material.userData?.styleSurface) || isGlassMaterial(material) || isWaterMaterial(material) || isDecalMaterial(material);
}

/** Lit means the lighting model reads metalness and roughness: standard and physical. */
function isLit(material) {
  return Boolean(material && (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial));
}

/**
 * Rule one material in place. Returns { ruled, changed } and stamps the scalars it replaced in
 * userData.styleRules the first time it changes anything.
 */
export function ruleMaterial(material, rules = STYLE_RULES) {
  if (!isLit(material) || isStyleExempt(material)) {
    return { ruled: false, changed: false };
  }
  const before = {
    metalness: material.metalness,
    roughness: material.roughness,
    clearcoat: material.clearcoat ?? 0,
  };
  let recompile = false;
  if (Number.isFinite(material.metalness) && material.metalness > rules.metalnessMax) {
    material.metalness = rules.metalnessMax;
  }
  if (Number.isFinite(material.roughness) && material.roughness < rules.roughnessMin) {
    material.roughness = rules.roughnessMin;
  }
  if ('clearcoat' in material && material.clearcoat > rules.clearcoatMax) {
    material.clearcoat = rules.clearcoatMax;
    // USE_CLEARCOAT is a program define: only a material that stops using it needs a rebuild.
    recompile = true;
  }
  const changed = material.metalness !== before.metalness
    || material.roughness !== before.roughness
    || (material.clearcoat ?? 0) !== before.clearcoat;
  if (changed) {
    material.userData ??= {};
    material.userData.styleRules ??= before;
    if (recompile) material.needsUpdate = true;
  }
  return { ruled: true, changed };
}

/** Would the rules, or the environment scale that follows them, treat this material differently if it were glass or water? */
function matters(material, rules) {
  return material.metalness > rules.metalnessMax || material.roughness < rules.roughnessMin || (material.clearcoat ?? 0) > rules.clearcoatMax
    || material.userData?.family === 'painted_metal' || Boolean(material.userData?.styleRules);
}

/** A material the rules ruled before a mesh's name showed it to be glass or water goes back to the values it was built with. */
function restoreAuthored(material) {
  const before = material.userData?.styleRules;
  if (!before) return false;
  material.metalness = before.metalness;
  material.roughness = before.roughness;
  if ('clearcoat' in material && (material.clearcoat ?? 0) !== before.clearcoat) {
    material.clearcoat = before.clearcoat;
    material.needsUpdate = true; // USE_CLEARCOAT is a program define
  }
  delete material.userData.styleRules;
  return true;
}

/**
 * One load-time walk. Shared materials are visited once per call. Returns the receipt the rig keeps.
 * `enabled: false` is a no-op, so a caller can pass its switch straight through.
 *
 * Glass and water are told by the material first (its own tests, then an overlay: isDecalMaterial) and then by the names of the meshes
 * that draw it (the reader above). The rules are per material and the names are per mesh, so a material that a pane or a wet surface
 * shares with other meshes takes its majority, by the triangles the scene draws with it (meshes that are visible, as the scene probe's
 * drawn set is: a hidden mesh does not vote), as the style plan decides for a material bound to two classes (a clone would add draws):
 * it is exempt when the triangles told by name are at least the rest, and ruled otherwise. The walk reads names only for materials the rules or
 * the environment scale would treat differently (one the rule would change, a painted_metal, or one it has already ruled). An exemption
 * is stamped in userData.styleSurface ('glass' or 'water'), holds at every later walk (the environment scale and the bake's fingerprint
 * read the stamp), and puts back the values of a material that was ruled before the mesh that earned it appeared (`restored`).
 * `skippedByName` counts the materials exempted by a mesh's name; they are also counted in skippedGlass or skippedWater.
 * `restoredMaterials` lists the materials put back to their authored values at this walk: the rig forgets what it tuned for them
 * (their environment was derived from the ruled scalars) and tunes them again from the authored ones.
 */
export function applyStyleRules(root, { enabled = true, rules = STYLE_RULES } = {}) {
  const receipt = {
    materials: 0, ruled: 0, changed: 0, skippedGlass: 0, skippedWater: 0, skippedDecal: 0, skippedByName: 0, restored: 0, restoredMaterials: [],
  };
  if (!enabled || !root?.traverse) return receipt;
  const reader = createSurfaceReader();
  // Pass one: every material under root once, with the surface its own tests tell, or the triangles its meshes' names tell glass, water or neither.
  const found = new Map();
  root.traverse((object) => {
    const material = object.material;
    if (!material) return;
    const list = Array.isArray(material) ? material : [material];
    for (const entry of list) {
      if (!entry) continue;
      let info = found.get(entry);
      if (!info) {
        info = { lit: isLit(entry), surface: null, byName: false, read: false, glass: 0, water: 0, other: 0 };
        if (info.lit) {
          if (isGlassMaterial(entry)) info.surface = 'glass';
          else if (isWaterMaterial(entry)) info.surface = 'water';
          else if (isDecalMaterial(entry)) info.surface = 'decal';
          else if (entry.userData?.styleSurface) { info.surface = entry.userData.styleSurface; info.byName = true; }
          else info.read = matters(entry, rules);
        }
        found.set(entry, info);
      }
      if (!info.read || !reader.isDrawn(object)) continue;
      const triangles = drawnTriangles(object, entry);
      if (!triangles) continue;
      const shares = reader.shares(object);
      info.glass += triangles * shares.glass;
      info.water += triangles * shares.water;
      info.other += triangles * (1 - shares.glass - shares.water);
    }
  });
  // Pass two: the rule on what is left.
  for (const [entry, info] of found) {
    receipt.materials += 1;
    if (!info.lit) continue;
    if (info.read && info.glass + info.water > 0 && info.glass + info.water >= info.other) {
      info.surface = info.glass >= info.water ? 'glass' : 'water';
      info.byName = true;
    }
    if (info.surface) {
      if (info.surface === 'glass') receipt.skippedGlass += 1;
      else if (info.surface === 'decal') receipt.skippedDecal += 1;
      else receipt.skippedWater += 1;
      if (info.byName) {
        receipt.skippedByName += 1;
        entry.userData ??= {};
        entry.userData.styleSurface = info.surface;
        if (restoreAuthored(entry)) { receipt.restored += 1; receipt.changed += 1; receipt.restoredMaterials.push(entry); }
      }
      continue;
    }
    const result = ruleMaterial(entry, rules);
    if (result.ruled) receipt.ruled += 1;
    if (result.changed) receipt.changed += 1;
  }
  return receipt;
}

// ---- daytime emission ---------------------------------------------------------------------------------------

function smoothstep(x, lo, hi) {
  const t = Math.min(1, Math.max(0, (x - lo) / Math.max(1e-6, hi - lo)));
  return t * t * (3 - 2 * t);
}

/** Daylight as the building glass reads it (lighting.js: smoothstep(arc, 0.08, 0.35)). */
export function daylightOf(arc) {
  return smoothstep(Number.isFinite(arc) ? arc : 1, 0.08, 0.35);
}

/** How lit the lamp heads are: none in daylight, authored intensity as the sun reaches the horizon. */
export function lampLevel(arc) {
  return 1 - daylightOf(arc);
}

function emissionOf(material) {
  const e = material.emissive;
  if (!e) return 0;
  return (0.2126 * e.r + 0.7152 * e.g + 0.0722 * e.b) * (material.emissiveIntensity ?? 1);
}

/** A person group is named as above, or is one of the figure kit's (figures.js tags its groups and meshes lodFamily 'figure'). */
function underPerson(object) {
  for (let o = object; o; o = o.parent) {
    if (PERSON_NODE_NAME.test(o.name || '') || o.userData?.lodFamily === 'figure') return true;
  }
  return false;
}

/**
 * 'person', 'lamp' or null. `sharedWithOthers` says some other mesh uses this material and is not a person: a palette the
 * event venues share between their figures and their chalets stays as authored, because the material cannot be switched off for
 * the figure alone. A kit person is known by the material's own name, which no other mesh carries.
 */
export function emissionClassOf(material, object = null, sharedWithOthers = false) {
  if (!isLit(material) || isGlassMaterial(material)) return null;
  if (KIT_PEOPLE_NAME.test(material.name || '')) return 'person';
  if (object && !sharedWithOthers && underPerson(object)) return 'person';
  if (LAMP_VARIANT.test(material.userData?.variant || '') || material.userData?.styleLamp) return 'lamp';
  return null;
}

/** Switch a person's emission off for good (the GLB's emissive white, the vest lift). */
export function silencePersonEmission(material) {
  if (!material) return false;
  let changed = false;
  if (material.emissive && (material.emissive.r || material.emissive.g || material.emissive.b)) {
    material.emissive.setRGB(0, 0, 0);
    changed = true;
  }
  if ((material.emissiveIntensity ?? 0) !== 0) { material.emissiveIntensity = 0; changed = true; }
  if (material.emissiveMap) { material.emissiveMap = null; changed = true; material.needsUpdate = true; }
  return changed;
}

/** Set a lamp head to `level` of its authored intensity (the first call stamps the authored value). */
export function setLampEmission(material, level) {
  material.userData ??= {};
  if (material.userData.styleEmitBase === undefined) {
    material.userData.styleEmitBase = material.emissiveIntensity ?? 0;
  }
  material.userData.styleEmitLevel = level;
  const next = material.userData.styleEmitBase * level;
  if (material.emissiveIntensity === next) return false;
  material.emissiveIntensity = next;
  return true;
}

/**
 * The emission walk. People go to zero; lamp heads go to `level` of their authored intensity (0 by day).
 * Returns the receipt and the lamp materials found, which the rig keeps to follow the sun.
 */
export function applyStyleEmit(root, { enabled = true, level = 0 } = {}) {
  const receipt = { materials: 0, people: 0, lamps: 0, changed: 0, sharedKept: 0, lampMaterials: [] };
  if (!enabled || !root?.traverse) return receipt;
  // One pass to see every mesh that uses each material that could matter, so the answer does not depend on which mesh the
  // traverse meets first: a material is a person's only when every mesh using it is a person.
  const uses = new Map();
  root.traverse((object) => {
    const material = object.material;
    if (!material) return;
    const list = Array.isArray(material) ? material : [material];
    for (const entry of list) {
      if (!entry) continue;
      let use = uses.get(entry);
      if (!use) {
        use = { object, others: false, persons: false };
        uses.set(entry, use);
        // A cheap pre-filter: a lamp's authored intensity is stamped, a person's emission is what is left to remove.
        use.skip = !entry.userData?.styleEmitBase && emissionOf(entry) < EMISSIVE_DAY_THRESHOLD && !entry.userData?.styleLamp;
      }
      if (!use.skip) { if (underPerson(object)) use.persons = true; else use.others = true; }
    }
  });
  for (const [entry, use] of uses) {
    receipt.materials += 1;
    if (use.skip) continue;
    const kind = emissionClassOf(entry, use.object, use.others);
    if (kind === 'person') {
      receipt.people += 1;
      if (silencePersonEmission(entry)) receipt.changed += 1;
    } else if (kind === 'lamp') {
      receipt.lamps += 1;
      receipt.lampMaterials.push(entry);
      if (setLampEmission(entry, level)) receipt.changed += 1;
    } else if (use.others && use.persons) {
      receipt.sharedKept += 1;
    }
  }
  return receipt;
}
