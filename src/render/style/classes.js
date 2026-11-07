/**
 * Style W1 L4a: the runtime class table, unwired.
 *
 * A pure table with no imports, no stamp and no define. Nothing in the runtime imports this module yet (the ratchet
 * test asserts it), so frames, draws and programs cannot move. W2's L4 wiring stamps `userData.ddClass` from it in
 * `MaterialLibrary._create`, in `createCityFringeMaterial` and in a load-time walk before the first bake.
 *
 * Keys, in the order `classOf` reads them:
 *   1. name path   the mesh's own name, then its named ancestors outward (the class pass's rule table, kept identical
 *                  to `scripts/qa/taste/instruments/classpass.js` between its RULES markers; a test holds the two equal);
 *   2. batch names `userData.mergedNames` of a baked batch, voted by name as the class pass votes;
 *   3. library     `MaterialLibrary` family and variant (`userData.family`, `userData.variant`);
 *   4. fringe      `createCityFringeMaterial`'s owner (`userData.cityFringeFinish.owner`, the caller's file path).
 * Class 'auto' marks a precinct whose meshes are told apart by their box: flat and low is venue ground, anything else
 * is a structure (the class pass's `resolveAuto`).
 *
 * A material drawn by meshes of two classes takes its majority class and is listed, never cloned, because a clone adds
 * draws (STYLE-W1-PLAN-2026-10-20.md L4); `materialClass` resolves a material's votes that way.
 */

/** The class pass's classes and false colours, in its order (classpass.js CLASSES). */
export const CLASS_IDS = Object.freeze([
  'building', 'road', 'ground', 'vegetation', 'water', 'vehicle', 'ship', 'aircraft',
  'person', 'furniture', 'venue', 'ui', 'sky', 'unknown',
]);

/**
 * Name-path rules: [pattern, class, census family], first match wins. Copied from classpass.js RULES (W0 instrument,
 * LOCK.json); edit both together, or the class-agreement test fails.
 */
export const PATH_RULES = Object.freeze([
  // overlays, effects, sky, animals: "sky and other"
  [/^nature:sky$|^weather:|^vfx:|^mischief:|^presentation:|selection-ring|people-drag-ring|^rival-intent|^ownership:|^exchange-chip|^city-fire|^world-deliveries$|^pick:|^street:p\d+:(dog-walker:dog)|gulls?(-|:|$)|gull-shadows/, 'sky', 'effects'],
  [/^v\d+:people:dog|:dog(:|-|$)|hinterland-stock/, 'sky', 'animals'],
  // water
  [/^nature:(water|beach-shelf|coast-spray)|^fringe:(far-sea|yarra$)|hinterland-dam-water|^topology:pond-(water|ripples|lily)|apostles-open-bay:(drape|swell-|kelp)|^water:/, 'water', 'water'],
  // people (before the venue and vehicle patterns, which share words)
  [/^v\d+:(people|ambient|crowd|auction-crowd|meshy-people)(:|$)|i\d+-body$|-(people|visitor|marshal|skier|crowd|guest|worker|gang|pax|crew|villager|tourer|walker|patrol|rider|driver|sitter|swimmer|kid|couple|family|spectator-bank)(:|-|\d|$)|:person:|^beach-(sitter|swimmer|group)|volley-player|kiosk-queue/, 'person', 'city.people'],
  // aircraft, ships, vehicles
  [/^(fringe:)?plane:/, 'aircraft', 'fringe.airport'],
  [/^fringe:ship:|^fringe:grand-prix-boat|apostles-open-bay:(tour-boat|trawler|jet-ski|runabout)|fringe:port-corner:kayak(:|$)/, 'ship', 'fringe.ships'],
  [/^transit:trolley|^fringe:transit:(tram|metro|vline)/, 'vehicle', 'city.trams'],
  [/^v\d+:traffic|^vehicle:|^v\d+:buses|^interchange-bus|^fringe:transit:bus|^fringe:melbourne-park-interchange-bus|beach-icecream-van|cybercab(?!-depot|-bay)|food-van|lawn-van|airport-link-(ute|shuttle)|-(truck|forklift|straddle|stacker|tug|apron-bus|shuttle|fire-tender|luggage-cart|baggage-tug)(:|-|\d|$)|^fringe:port-wagon|:wagon(:|$)|tullamarine-(luggage-cart|tug|baggage-tug|apron-bus|fire-tender)/, 'vehicle', 'city.vehicles'],
  // vegetation
  [/^nature:foliage:(pit-(public|paved))/, 'road', 'city.street-trees'],
  [/^nature:foliage:pit-lawn/, 'ground', 'city.street-trees'],
  [/^nature:foliage:contact/, 'sky', 'effects'],
  [/^nature:foliage:/, 'vegetation', 'city.street-trees'],
  [/^fringe:(trees|crest)-[ae]|^fringe:hinterland-(tussock|shrub|paddock-tufts|paddock-shrubs|hedges|windbreaks|reeds|dune-grass)|leaf-cluster-tree/, 'vegetation', 'fringe.hinterland-planting'],
  [/-tree[:-]|fringe:(tullamarine|southern-cross)-apron:tuft|fringe:venue-ground-scrub/, 'vegetation', 'fringe.venue-planting'],
  [/^topology:(reserve-leafy-beds|planting-)/, 'vegetation', 'city.reserve-park'],
  // roads and paving
  [/^streetscape:(avenue-lamps|avenue-benches|avenue-postboxes|avenue-bins|bollards|signal-|tram-stop-)|^street:p\d+(:cafe|:bin|-rear-bin|-boundary-posts)/, 'furniture', 'city.street-furniture'],
  [/^streetscape|^street:p\d+|^ground:road|^ground:concrete|^topology:reserve-hoggin|^esplanade:|^nature:piers|cybercab-bay-mark/, 'road', 'city.roads-paving'],
  // block cores and buildings
  [/^block-core|^core-toy:/, 'building', 'city.block-cores'],
  [/^buildings:|^civic:|^opening:|^succession:|^waterfront:boat-shed|^topology:reserve-(rotunda|slide)|^fringe:hinterland-sheds|^fringe:cybercab-depot|^fringe:airport-link/, 'building', 'city.buildings'],
  [/^props:|^park:|^topology:playground|^transit:stops|^fringe:hinterland-(fences|parcel-fences|walls|bales)|^beach-|^nature:beach-life|^kiosk-|^umbrella|^surfboard|^lg-|^cricket|^seawall|fence|guard-rail|^esplanade-planter|^castle-|port-bollard|port-mooring|fringe:port-corner:(towel|rug|picnic|life-|ball|bag|castle|timber|kayak-cluster|school|dog)/, 'furniture', 'coast.beach-life'],
  // ground and terrain
  [/^topology:|^ground:|^world:edge-massing|^fringe:(annulus|verge|expansion|alpine|coast-rim|hinterland-(fields|coast-rim|rim-brow|farm-track|dams))|^waterfront:sand/, 'ground', 'ground'],
  [/^fringe:(apostles?|coast-rim-boulders)|apostles-open-bay:(outlier|awash)|^fringe:falls-creek-(flank|beginner-slope|wind-crust|rock|footprint|wall-)/, 'ground', 'coast.apostles'],
  // precinct groups: the group name sets the family; the box of each mesh sets venue ground or structure
  [/^fringe:rod-laver|^fringe:melbourne-park/, 'auto', 'fringe.rod-laver'],
  [/^fringe:grand-prix/, 'auto', 'fringe.grand-prix'],
  [/^fringe:falls-creek/, 'auto', 'fringe.falls-creek'],
  [/^fringe:southern-cross/, 'auto', 'fringe.southern-cross'],
  [/^fringe:tullamarine/, 'auto', 'fringe.airport'],
  [/^fringe:port/, 'auto', 'fringe.port-terminal'],
].map((rule) => Object.freeze(rule)));

/**
 * MaterialLibrary family to class, for a library material no named mesh votes on (a batch whose sources are gone).
 * Each family takes the majority class of its drawn triangles in the W0 catalogue (seed 0, 20 Oct; figures in
 * scratch/program/notes/w1-l4a.md). Concrete and sand are paving more often than wall; foliage, timber and
 * painted_metal are drawn more on buildings than on trees, furniture or kerbs.
 */
export const FAMILY_CLASS = Object.freeze({
  brick: 'building', render: 'building', weatherboard: 'building', corrugated: 'building', slate: 'building',
  tile: 'building', limestone: 'building', glass: 'building', painted_metal: 'building', timber: 'building',
  foliage: 'building', asphalt: 'road', concrete: 'road', sand: 'road', water: 'water',
});

/** `${family}:${variant}` overrides of FAMILY_CLASS. Empty in L4a: the catalogue records userData keys, not values. */
export const VARIANT_CLASS = Object.freeze({});

/** createCityFringeMaterial owners (the third argument, the caller's path under src/render) to class and family. */
export const FRINGE_OWNER_CLASS = Object.freeze({
  'fringe/ships.js': Object.freeze({ cls: 'ship', fam: 'fringe.ships' }),
  'fringe/airport.js': Object.freeze({ cls: 'auto', fam: 'fringe.airport' }),
  'fringe/port.js': Object.freeze({ cls: 'auto', fam: 'fringe.port-terminal' }),
  'port/container-stamps.js': Object.freeze({ cls: 'auto', fam: 'fringe.port-terminal' }),
  'fringe/station.js': Object.freeze({ cls: 'auto', fam: 'fringe.southern-cross' }),
  'fringe/events/rod-laver.js': Object.freeze({ cls: 'auto', fam: 'fringe.rod-laver' }),
  'fringe/events/grand-prix.js': Object.freeze({ cls: 'auto', fam: 'fringe.grand-prix' }),
  'fringe/events/falls-creek.js': Object.freeze({ cls: 'auto', fam: 'fringe.falls-creek' }),
  'fringe/events/shared.js': Object.freeze({ cls: 'auto', fam: null }),
  'military/warship-dress.js': Object.freeze({ cls: 'ship', fam: 'fringe.ships' }),
  'military/shipyard.js': Object.freeze({ cls: 'auto', fam: 'fringe.ships' }),
  'military/units.js': Object.freeze({ cls: 'auto', fam: null }),
});

const nameCache = new Map();

/** The first PATH_RULES match for one name, or null. */
export function classifyName(name) {
  let hit = nameCache.get(name);
  if (hit !== undefined) return hit;
  hit = null;
  for (const [pattern, cls, fam] of PATH_RULES) if (pattern.test(name)) { hit = { cls, fam }; break; }
  nameCache.set(name, hit);
  return hit;
}

/** chain: the names of the mesh and its named ancestors, outermost first; the innermost match wins. */
export function classifyPath(chain) {
  for (let i = chain.length - 1; i >= 0; i--) {
    const hit = classifyName(chain[i]);
    if (hit && hit.cls !== 'unknown') return { cls: hit.cls, fam: hit.fam, via: chain[i] };
  }
  return null;
}

/** box = [cx, cy, cz, sx, sy, sz] in metres; resolves 'auto' as the class pass does. */
export function resolveAuto(box) {
  if (!box) return 'building';
  return box[4] <= 0.6 && Math.max(box[3], box[5]) >= 2 ? 'venue' : 'building';
}

/** A baked batch's mergedNames, voted name by name; null when no name votes. */
export function classifyMergedNames(names) {
  const votes = new Map();
  for (const name of names ?? []) {
    const hit = classifyPath([name]);
    if (!hit || hit.cls === 'auto') continue;
    const key = `${hit.cls}|${hit.fam}`;
    votes.set(key, (votes.get(key) ?? 0) + 1);
  }
  let best = null, n = 0;
  for (const [key, count] of votes) if (count > n) { best = key; n = count; }
  if (!best) return null;
  const [cls, fam] = best.split('|');
  return { cls, fam, via: 'mergedNames' };
}

/** A library material's class by family and variant, or null for a family the table does not hold. */
export function classOfLibrary(family, variant = 'default') {
  const cls = VARIANT_CLASS[`${family}:${variant}`] ?? FAMILY_CLASS[family];
  return cls ? { cls, fam: null, via: `library:${family}` } : null;
}

/** A fringe material's class by owner, or null for an owner the table does not hold; 'auto' is resolved by the box. */
export function classOfFringeOwner(owner, box = null) {
  const entry = FRINGE_OWNER_CLASS[owner];
  if (!entry) return null;
  return { cls: entry.cls === 'auto' ? resolveAuto(box) : entry.cls, fam: entry.fam, via: `fringe:${owner}` };
}

/**
 * One mesh's class: { cls, fam, via } or null (unclassified).
 * @param {{ path?: string[], box?: number[]|null, mergedNames?: string[]|null, family?: string, variant?: string, owner?: string }} key
 */
export function classOf({ path = [], box = null, mergedNames = null, family, variant, owner } = {}) {
  const named = classifyPath(path);
  if (named) return named.cls === 'auto' ? { ...named, cls: resolveAuto(box) } : named;
  if (mergedNames) {
    const voted = classifyMergedNames(mergedNames);
    if (voted) return voted;
  }
  // an unnamed mesh, or the board itself, is ground (the class pass's rule), unless it is a baked batch
  if (!mergedNames && (path.length === 0 || (path.length === 1 && path[0] === 'board'))) return { cls: 'ground', fam: 'ground', via: 'board' };
  if (family) {
    const lib = classOfLibrary(family, variant);
    if (lib) return lib;
  }
  if (owner) return classOfFringeOwner(owner, box);
  return null;
}

/**
 * A material's class from its meshes' votes (class -> drawn triangles): the majority class, `listed` when more than one
 * class votes. Never a clone.
 * @param {Map<string, number>|Record<string, number>} votes
 */
export function materialClass(votes) {
  const entries = (votes instanceof Map ? [...votes] : Object.entries(votes)).filter(([cls, n]) => cls && cls !== 'unknown' && n > 0);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1] || CLASS_IDS.indexOf(a[0]) - CLASS_IDS.indexOf(b[0]));
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  return { cls: entries[0][0], share: entries[0][1] / total, listed: entries.length > 1, classes: entries.map(([cls]) => cls) };
}
