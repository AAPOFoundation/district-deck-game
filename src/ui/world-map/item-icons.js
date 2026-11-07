// Shared 16×16 crisp pixel item icons. The thing itself, not a crate.
// Colours: chrome palette (world-map.css :root) plus per-good accents from
// GOOD_COLOUR in world-map.js — the P1 cargo pip map. Not world-deliveries
// colourFor(), which hashes the good name.

export const ICON_SIZE = 16;

export const ICON_CHROME = Object.freeze({
  ink: '#0c0b09',
  bone: '#ece6da',
  amber: '#d8a24a',
  steel: '#302d29',
  steelMid: '#4c4841',
  steelHigh: '#7a746a',
  carbon: '#c9c2b4',
  blue: '#6f96b8',
  muted: '#989185',
});

/** P1 cargo pip hues. Cited from GOOD_COLOUR in world-map.js. */
export const CARGO_HUE = Object.freeze({
  oil: '#c8a24a',
  fittings: '#8c5a3a',
  modular: '#6a7a8a',
  furniture: '#7a6a3a',
  tiles: '#8a7a6a',
  timber: '#7a5a2a',
  chips: '#3a5a7a',
  robots: '#5a3a2a',
  tourists: '#c8763f',
  credit: '#6a4a3a',
  food: '#d4b06a',
  people: '#69796e',
  asylum: '#8c3a3a',
  biotech: '#3a7a5a',
  'ancient-biotech': '#3a8a8a',
  coffee: '#6a3a22',
  copper: '#b45a2a',
  iron: '#8a4a2a',
  lithium: '#8aa0b4',
  'rare-earth': '#3a7a5a',
  titanium: '#8a8a9a',
  cobalt: '#2a4a8a',
  steel: '#6a7278',
  nickel: '#9a9080',
  graphite: '#2a2a2e',
  aluminium: '#c8ccd0',
  ceramics: '#c49a72',
  platinum: '#dce2e6',
  cocoa: '#5a2a18',
  lng: '#3a6a7a',
  autos: '#3a4a6a',
  wine: '#6a2a3a',
  gold: '#c4a05a',
  machinery: '#6a5a3a',
  turbines: '#5a6a72',
  marble: '#d0c8bc',
  beer: '#c4a03a',
  warships: '#4a5a6a',
  compute: '#3a6a8a',
  starlink: '#6a8aaa',
  alien: '#5a8a6a',
  'milk-powder': '#d0c4a8',
  beef: '#8c3a2a',
  education: '#3a3a5a',
  'pig-iron': '#5a3a32',
  bauxite: '#8a3a22',
  alumina: '#d8d0c4',
  quartz: '#c8c0b4',
  silicon: '#4a4a52',
  polysilicon: '#6a6a72',
  wafer: '#3a4a5a',
  die: '#2a3a4a',
  kaolin: '#d4c8b8',
  magnets: '#6a2a2a',
  windings: '#b45a2a',
  motors: '#4a5a4a',
  frames: '#6a6270',
  castings: '#5a4a3a',
  materials: '#6a5a48',
  pulp: '#c8bca8',
  paper: '#d8d0c4',
  ink: '#1a1a22',
  bibles: '#6a3a2a',
  uranium: '#c4b45a',
  'enriched-uranium': '#d8d46a',
  warhead: '#6a5a3a',
  'missile-body': '#5a6270',
  pirates: '#8c2418',
  drones: '#a03028',
});

export const ITEM_LABEL = Object.freeze({
  oil: 'Oil',
  fittings: 'Fittings',
  modular: 'Modular',
  furniture: 'Furniture',
  tiles: 'Tiles',
  timber: 'Timber',
  chips: 'Chips',
  robots: 'Robots',
  tourists: 'Tourists',
  credit: 'Credit',
  food: 'Grain',
  people: 'Labour',
  asylum: 'Asylum',
  biotech: 'Biotech',
  'ancient-biotech': 'Ancient Biotech',
  coffee: 'Coffee',
  copper: 'Copper',
  iron: 'Iron',
  lithium: 'Lithium',
  'rare-earth': 'Rare earth',
  titanium: 'Titanium',
  cobalt: 'Cobalt',
  steel: 'Steel',
  nickel: 'Nickel',
  graphite: 'Graphite',
  aluminium: 'Aluminium',
  ceramics: 'Ceramics',
  platinum: 'Platinum',
  cocoa: 'Cocoa',
  lng: 'LNG',
  autos: 'Autos',
  wine: 'Wine',
  gold: 'Gold',
  machinery: 'Machines',
  turbines: 'Turbines',
  marble: 'Marble',
  beer: 'Beer',
  warships: 'Ships',
  compute: 'Compute',
  starlink: 'Starlink',
  alien: 'Alien',
  'milk-powder': 'Milk powder',
  beef: 'Beef',
  education: 'Tuition',
  'pig-iron': 'Pig iron',
  bauxite: 'Bauxite',
  alumina: 'Alumina',
  quartz: 'Quartz',
  silicon: 'Silicon',
  polysilicon: 'Polysilicon',
  wafer: 'Wafer',
  die: 'Die',
  kaolin: 'Kaolin',
  magnets: 'Magnets',
  windings: 'Windings',
  motors: 'Motors',
  frames: 'Frames',
  castings: 'Castings',
  materials: 'Slag',
  pulp: 'Pulp',
  paper: 'Paper',
  ink: 'Ink',
  bibles: 'Bibles',
  uranium: 'Uranium',
  'enriched-uranium': 'Enriched uranium',
  warhead: 'Warhead',
  'missile-body': 'Missile body',
  cash: 'Cash',
  officer: 'Officer',
  missionary: 'Missionary',
  navy: 'Navy',
  school: 'School',
  pirates: 'Pirates',
  drones: 'Drones',
});

const { ink, bone, amber, steel, steelMid, steelHigh, carbon, blue, muted } = ICON_CHROME;

function grid() {
  return Array.from({ length: ICON_SIZE }, () => Array(ICON_SIZE).fill(null));
}

function fill(g, x, y, w, h, color) {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(ICON_SIZE, x + w);
  const y1 = Math.min(ICON_SIZE, y + h);
  for (let row = y0; row < y1; row += 1) {
    for (let col = x0; col < x1; col += 1) g[row][col] = color;
  }
}

function dot(g, x, y, color) {
  if (x >= 0 && y >= 0 && x < ICON_SIZE && y < ICON_SIZE) g[y][x] = color;
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function pal(good) {
  const accent = CARGO_HUE[good] ?? amber;
  return {
    accent,
    light: shade(accent, 40),
    dark: shade(accent, -50),
    ink,
    bone,
    steel: steelHigh,
  };
}

function plankStack(g, p) {
  fill(g, 1, 3, 14, 3, p.dark);
  fill(g, 2, 4, 12, 1, p.light);
  fill(g, 1, 7, 14, 3, p.accent);
  fill(g, 2, 8, 12, 1, p.light);
  fill(g, 1, 11, 14, 3, p.dark);
  fill(g, 2, 12, 12, 1, p.light);
  fill(g, 1, 3, 1, 11, p.ink);
  fill(g, 14, 3, 1, 11, p.ink);
}

function tinCan(g, p) {
  fill(g, 4, 3, 8, 11, bone);
  fill(g, 5, 4, 6, 9, p.light);
  fill(g, 4, 3, 8, 2, p.steel);
  fill(g, 5, 3, 6, 1, carbon);
  fill(g, 4, 8, 8, 2, p.accent);
  fill(g, 6, 9, 4, 1, p.dark);
  fill(g, 4, 13, 8, 1, p.dark);
}

function steak(g, p) {
  // Marbled slab, not a lozenge: irregular cut with a fat-cap edge.
  fill(g, 2, 5, 11, 7, p.accent);
  fill(g, 3, 4, 9, 1, p.accent);
  fill(g, 4, 3, 6, 1, p.dark);
  fill(g, 2, 12, 10, 1, p.dark);
  fill(g, 1, 7, 1, 4, p.dark);
  fill(g, 4, 6, 6, 1, p.light);
  fill(g, 5, 8, 4, 1, p.light);
  fill(g, 3, 9, 3, 1, p.light);
  dot(g, 8, 10, p.light);
  fill(g, 11, 4, 4, 8, bone);
  fill(g, 10, 5, 2, 6, bone);
  fill(g, 14, 5, 1, 6, carbon);
}

function mortarboard(g, p) {
  // Flat diamond board (top view) plus a tassel drop.
  fill(g, 6, 2, 4, 1, bone);
  fill(g, 4, 3, 8, 1, bone);
  fill(g, 3, 4, 10, 1, p.light);
  fill(g, 2, 5, 12, 1, bone);
  fill(g, 3, 6, 10, 1, p.light);
  fill(g, 4, 7, 8, 1, bone);
  fill(g, 6, 8, 4, 1, p.dark);
  fill(g, 7, 4, 2, 2, p.accent);
  fill(g, 5, 8, 6, 4, p.accent);
  fill(g, 6, 9, 4, 2, p.dark);
  fill(g, 13, 5, 2, 1, amber);
  fill(g, 14, 6, 1, 6, amber);
  dot(g, 14, 12, amber);
  dot(g, 13, 12, amber);
}

function wheatSheaf(g, p) {
  fill(g, 7, 8, 2, 7, p.dark);
  fill(g, 6, 3, 1, 7, p.accent);
  fill(g, 8, 2, 1, 8, p.light);
  fill(g, 10, 3, 1, 7, p.accent);
  fill(g, 4, 4, 1, 6, p.accent);
  fill(g, 12, 4, 1, 6, p.accent);
  fill(g, 5, 2, 2, 2, p.light);
  fill(g, 9, 2, 2, 2, p.light);
  fill(g, 3, 3, 2, 2, p.accent);
  fill(g, 11, 3, 2, 2, p.accent);
  fill(g, 6, 10, 4, 1, p.dark);
}

function labourer(g, p) {
  fill(g, 6, 2, 4, 3, p.light);
  fill(g, 7, 3, 2, 2, p.accent);
  fill(g, 5, 5, 6, 5, p.accent);
  fill(g, 4, 6, 2, 3, p.dark);
  fill(g, 10, 6, 2, 3, p.dark);
  fill(g, 6, 10, 2, 5, p.dark);
  fill(g, 9, 10, 2, 5, p.dark);
}

function oilDrum(g, p) {
  fill(g, 4, 2, 8, 12, p.accent);
  fill(g, 5, 3, 6, 10, p.light);
  fill(g, 4, 2, 8, 1, p.steel);
  fill(g, 4, 5, 8, 1, p.ink);
  fill(g, 4, 9, 8, 1, p.ink);
  fill(g, 4, 13, 8, 1, p.dark);
  fill(g, 7, 3, 2, 1, p.ink);
}

function bracket(g, p) {
  fill(g, 3, 2, 4, 12, p.light);
  fill(g, 3, 10, 11, 4, p.light);
  fill(g, 4, 3, 2, 8, p.accent);
  fill(g, 5, 11, 8, 2, p.accent);
  dot(g, 5, 5, bone);
  dot(g, 10, 12, bone);
}

function chipDie(g, p) {
  fill(g, 4, 4, 8, 8, p.accent);
  fill(g, 5, 5, 6, 6, p.dark);
  fill(g, 6, 6, 4, 4, p.light);
  for (let i = 4; i <= 11; i += 2) {
    dot(g, 3, i, p.steel);
    dot(g, 12, i, p.steel);
    dot(g, i, 3, p.steel);
    dot(g, i, 12, p.steel);
  }
}

function robotArm(g, p) {
  fill(g, 2, 12, 6, 2, p.dark);
  fill(g, 4, 8, 3, 5, p.accent);
  fill(g, 6, 5, 5, 3, p.accent);
  fill(g, 10, 3, 3, 4, p.light);
  fill(g, 12, 2, 2, 2, p.steel);
  fill(g, 13, 1, 2, 2, p.steel);
  fill(g, 11, 2, 1, 1, p.ink);
}

function flask(g, p) {
  fill(g, 6, 2, 4, 3, p.steel);
  fill(g, 7, 2, 2, 4, p.light);
  fill(g, 4, 8, 8, 6, p.accent);
  fill(g, 5, 7, 6, 2, p.accent);
  fill(g, 5, 9, 6, 4, p.light);
  fill(g, 4, 13, 8, 1, p.dark);
}

function iceCoreVial(g, p) {
  fill(g, 5, 1, 6, 2, p.steel);
  fill(g, 6, 2, 4, 1, carbon);
  fill(g, 5, 3, 6, 11, p.accent);
  fill(g, 6, 4, 4, 9, p.light);
  fill(g, 7, 5, 2, 7, amber);
  fill(g, 6, 5, 1, 7, bone);
  fill(g, 5, 14, 6, 1, p.dark);
  dot(g, 9, 7, amber);
}

function coffeeCup(g, p) {
  fill(g, 4, 6, 7, 7, p.accent);
  fill(g, 5, 7, 5, 5, p.dark);
  fill(g, 11, 8, 2, 3, p.accent);
  fill(g, 12, 9, 1, 1, p.light);
  fill(g, 4, 13, 7, 1, p.dark);
  fill(g, 6, 3, 1, 2, muted);
  fill(g, 8, 2, 1, 3, muted);
}

function ingot(g, p) {
  // Trapezoid bar (wide top, narrow base) with a shine line.
  fill(g, 2, 5, 12, 2, p.light);
  fill(g, 3, 7, 10, 2, p.accent);
  fill(g, 4, 9, 8, 3, p.dark);
  fill(g, 2, 6, 1, 2, p.dark);
  fill(g, 13, 6, 1, 2, p.dark);
  fill(g, 3, 8, 1, 2, p.dark);
  fill(g, 12, 8, 1, 2, p.dark);
  fill(g, 4, 6, 8, 1, bone);
  fill(g, 5, 7, 6, 1, p.light);
}

function iBeam(g, p) {
  fill(g, 2, 3, 12, 3, p.accent);
  fill(g, 2, 10, 12, 3, p.accent);
  fill(g, 6, 3, 4, 10, p.accent);
  fill(g, 3, 4, 10, 1, p.light);
  fill(g, 7, 6, 2, 4, p.dark);
  fill(g, 3, 11, 10, 1, p.dark);
}

function girderBundle(g, p) {
  // Three short I-girders strapped as a bundle, not iron's single beam.
  fill(g, 1, 4, 4, 2, p.dark);
  fill(g, 2, 4, 2, 8, p.dark);
  fill(g, 1, 10, 4, 2, p.dark);
  fill(g, 6, 2, 4, 2, p.accent);
  fill(g, 7, 2, 2, 11, p.accent);
  fill(g, 6, 11, 4, 2, p.accent);
  fill(g, 11, 4, 4, 2, p.light);
  fill(g, 12, 4, 2, 8, p.light);
  fill(g, 11, 10, 4, 2, p.light);
  fill(g, 1, 7, 14, 2, p.steel);
  fill(g, 2, 7, 12, 1, bone);
}

function matteIngot(g, p) {
  // Dull bar, no shine line — distinct from copper's trapezoid.
  fill(g, 3, 5, 10, 6, p.accent);
  fill(g, 4, 4, 8, 1, p.dark);
  fill(g, 4, 6, 8, 3, p.dark);
  fill(g, 3, 11, 10, 1, p.ink);
}

function graphiteBrick(g, p) {
  fill(g, 3, 4, 10, 8, p.accent);
  fill(g, 4, 5, 8, 6, p.dark);
  fill(g, 3, 4, 10, 1, p.light);
  fill(g, 4, 5, 5, 1, bone);
  fill(g, 3, 12, 10, 1, p.ink);
}

function aluminiumStack(g, p) {
  fill(g, 4, 2, 8, 3, p.light);
  fill(g, 3, 5, 10, 3, p.accent);
  fill(g, 2, 8, 12, 5, p.light);
  fill(g, 5, 3, 6, 1, bone);
  fill(g, 4, 6, 8, 1, bone);
  fill(g, 3, 9, 10, 1, bone);
  fill(g, 2, 12, 12, 1, p.dark);
}

function hexTile(g, p) {
  // Pointy-top hex, glazed. Distinct from tiles' 2×2 square grid.
  fill(g, 6, 1, 4, 1, p.accent);
  fill(g, 4, 2, 8, 1, p.accent);
  fill(g, 3, 3, 10, 2, p.accent);
  fill(g, 2, 5, 12, 6, p.accent);
  fill(g, 3, 11, 10, 2, p.accent);
  fill(g, 4, 13, 8, 1, p.accent);
  fill(g, 6, 14, 4, 1, p.accent);
  fill(g, 5, 4, 6, 8, p.light);
  fill(g, 6, 5, 3, 1, bone);
  fill(g, 4, 8, 1, 3, p.dark);
}

function platinumRing(g, p) {
  fill(g, 3, 2, 6, 1, p.accent);
  fill(g, 2, 3, 8, 1, p.accent);
  fill(g, 1, 4, 10, 4, p.accent);
  fill(g, 2, 8, 8, 1, p.accent);
  fill(g, 3, 9, 6, 1, p.accent);
  fill(g, 4, 4, 4, 4, null);
  fill(g, 3, 3, 1, 6, p.light);
  fill(g, 12, 5, 3, 6, p.light);
  fill(g, 12, 6, 3, 1, bone);
  fill(g, 12, 10, 3, 1, p.dark);
}

function battery(g, p) {
  fill(g, 5, 3, 6, 11, p.accent);
  fill(g, 6, 2, 4, 1, p.steel);
  fill(g, 6, 4, 4, 3, p.light);
  fill(g, 6, 8, 4, 5, p.dark);
  fill(g, 5, 7, 6, 1, p.ink);
}

function horseshoe(g, p) {
  fill(g, 3, 3, 3, 10, p.accent);
  fill(g, 10, 3, 3, 10, p.accent);
  fill(g, 3, 3, 10, 3, p.accent);
  fill(g, 6, 4, 4, 2, null);
  fill(g, 5, 5, 6, 2, ink);
  fill(g, 4, 4, 1, 8, p.light);
  fill(g, 11, 4, 1, 8, p.light);
  fill(g, 3, 12, 3, 2, p.steel);
  fill(g, 10, 12, 3, 2, p.steel);
}

function jetBlade(g, p) {
  // Titanium builds airframes: a top-down delta jet, nose up — the only
  // aircraft silhouette in the set, unmistakable with the label covered.
  fill(g, 7, 1, 2, 3, bone);          // nose
  fill(g, 6, 4, 4, 4, p.light);       // fuselage
  fill(g, 3, 6, 10, 3, bone);         // delta wing
  fill(g, 1, 8, 14, 2, p.light);      // wing trailing edge
  fill(g, 6, 10, 4, 3, bone);         // aft fuselage
  fill(g, 5, 13, 6, 2, p.steel);      // tailplane
  fill(g, 7, 11, 2, 4, carbon);       // exhaust line
  fill(g, 7, 4, 2, 6, p.steel);       // spine shade
}

function oreChunk(g, p) {
  fill(g, 4, 6, 8, 7, p.accent);
  fill(g, 5, 4, 6, 3, p.accent);
  fill(g, 6, 5, 4, 4, p.light);
  fill(g, 3, 8, 2, 4, p.dark);
  fill(g, 11, 8, 2, 4, p.dark);
  fill(g, 5, 12, 6, 1, p.ink);
  dot(g, 8, 7, bone);
  dot(g, 7, 9, bone);
}

function cocoaPod(g, p) {
  // Pointed oval pod with ridge lines.
  fill(g, 7, 1, 2, 2, p.dark);
  fill(g, 6, 3, 4, 1, p.accent);
  fill(g, 4, 4, 8, 2, p.accent);
  fill(g, 3, 6, 10, 5, p.accent);
  fill(g, 4, 11, 8, 2, p.accent);
  fill(g, 6, 13, 4, 1, p.dark);
  fill(g, 5, 6, 6, 5, p.light);
  fill(g, 7, 4, 1, 8, p.dark);
  fill(g, 5, 6, 1, 5, p.dark);
  fill(g, 9, 6, 1, 5, p.dark);
  dot(g, 8, 4, p.light);
}

function gasSphere(g, p) {
  // Sphere tank with support legs.
  fill(g, 5, 2, 6, 1, p.light);
  fill(g, 4, 3, 8, 1, p.light);
  fill(g, 3, 4, 10, 6, p.accent);
  fill(g, 4, 10, 8, 1, p.accent);
  fill(g, 5, 11, 6, 1, p.dark);
  fill(g, 5, 5, 3, 3, bone);
  fill(g, 3, 6, 10, 1, p.steel);
  fill(g, 4, 12, 2, 3, p.dark);
  fill(g, 10, 12, 2, 3, p.dark);
  fill(g, 7, 12, 2, 2, p.steel);
}

function carSide(g, p) {
  fill(g, 2, 8, 12, 3, p.accent);
  fill(g, 4, 5, 8, 4, p.accent);
  fill(g, 5, 6, 3, 2, p.light);
  fill(g, 9, 6, 2, 2, p.light);
  fill(g, 3, 10, 3, 3, p.ink);
  fill(g, 10, 10, 3, 3, p.ink);
  fill(g, 4, 11, 1, 1, p.steel);
  fill(g, 11, 11, 1, 1, p.steel);
}

function bottle(g, p) {
  fill(g, 6, 2, 4, 3, p.dark);
  fill(g, 7, 2, 2, 4, p.accent);
  fill(g, 5, 6, 6, 8, p.accent);
  fill(g, 6, 7, 4, 6, p.light);
  fill(g, 5, 13, 6, 1, p.dark);
}

function goldBar(g, p) {
  fill(g, 3, 6, 10, 6, p.accent);
  fill(g, 4, 5, 8, 1, p.light);
  fill(g, 3, 11, 10, 1, p.dark);
  fill(g, 5, 7, 6, 2, p.light);
  fill(g, 6, 8, 4, 1, amber);
}

function gear(g, p) {
  fill(g, 5, 2, 6, 12, p.light);
  fill(g, 2, 5, 12, 6, p.light);
  fill(g, 6, 6, 4, 4, p.dark);
  fill(g, 7, 7, 2, 2, bone);
  fill(g, 7, 1, 2, 2, p.accent);
  fill(g, 7, 13, 2, 2, p.accent);
  fill(g, 1, 7, 2, 2, p.accent);
  fill(g, 13, 7, 2, 2, p.accent);
}

function turbineFan(g, p) {
  fill(g, 7, 7, 2, 2, p.steel);
  fill(g, 7, 2, 2, 5, p.accent);
  fill(g, 7, 9, 2, 5, p.accent);
  fill(g, 2, 7, 5, 2, p.light);
  fill(g, 9, 7, 5, 2, p.light);
  fill(g, 4, 4, 3, 3, p.dark);
  fill(g, 9, 9, 3, 3, p.dark);
}

function marbleSlab(g, p) {
  // Stepped white block with grey veins — a slab, not a barcode.
  fill(g, 4, 3, 10, 3, bone);
  fill(g, 3, 4, 10, 2, bone);
  fill(g, 3, 6, 10, 7, p.accent);
  fill(g, 3, 6, 10, 1, carbon);
  fill(g, 13, 4, 2, 9, muted);
  fill(g, 12, 5, 1, 8, p.dark);
  fill(g, 5, 8, 1, 4, muted);
  fill(g, 8, 7, 1, 5, p.dark);
  fill(g, 10, 9, 1, 3, muted);
  dot(g, 6, 10, muted);
  fill(g, 3, 13, 10, 1, p.dark);
}

function beerMug(g, p) {
  fill(g, 4, 5, 7, 9, p.accent);
  fill(g, 5, 3, 5, 5, bone);
  fill(g, 5, 8, 5, 5, p.light);
  fill(g, 11, 7, 3, 4, p.accent);
  fill(g, 12, 8, 1, 2, bone);
  fill(g, 4, 13, 7, 1, p.dark);
}

function hull(g, p) {
  fill(g, 2, 8, 12, 3, p.accent);
  fill(g, 3, 7, 10, 2, p.accent);
  fill(g, 5, 4, 6, 4, p.dark);
  fill(g, 7, 2, 2, 3, p.steel);
  fill(g, 4, 10, 8, 1, p.dark);
}

function serverRack(g, p) {
  fill(g, 3, 2, 10, 12, p.light);
  fill(g, 4, 3, 8, 2, p.accent);
  fill(g, 4, 6, 8, 2, p.dark);
  fill(g, 4, 9, 8, 2, p.accent);
  fill(g, 4, 12, 8, 1, p.dark);
  dot(g, 5, 4, amber);
  dot(g, 5, 7, amber);
  dot(g, 5, 10, amber);
}

function satellite(g, p) {
  fill(g, 7, 6, 2, 4, p.steel);
  fill(g, 6, 7, 4, 2, p.accent);
  fill(g, 2, 7, 4, 2, p.light);
  fill(g, 10, 7, 4, 2, p.light);
  fill(g, 7, 4, 2, 2, p.dark);
  fill(g, 7, 10, 2, 2, p.dark);
}

function crystal(g, p) {
  fill(g, 7, 2, 2, 3, p.light);
  fill(g, 5, 5, 6, 6, p.accent);
  fill(g, 6, 6, 2, 4, p.light);
  fill(g, 9, 7, 1, 3, p.dark);
  fill(g, 4, 10, 8, 3, p.dark);
}

function roomBox(g, p) {
  fill(g, 3, 4, 10, 9, p.accent);
  fill(g, 4, 5, 8, 7, p.dark);
  fill(g, 6, 7, 4, 4, p.light);
  fill(g, 3, 4, 10, 1, p.steel);
}

function chair(g, p) {
  fill(g, 5, 4, 7, 2, p.accent);
  fill(g, 5, 6, 2, 7, p.dark);
  fill(g, 5, 8, 7, 2, p.accent);
  fill(g, 10, 10, 2, 3, p.dark);
}

function tileGrid(g, p) {
  fill(g, 3, 3, 5, 5, p.accent);
  fill(g, 8, 3, 5, 5, p.light);
  fill(g, 3, 8, 5, 5, p.light);
  fill(g, 8, 8, 5, 5, p.accent);
  fill(g, 3, 3, 10, 1, p.ink);
  fill(g, 3, 8, 10, 1, p.ink);
  fill(g, 3, 3, 1, 10, p.ink);
  fill(g, 8, 3, 1, 10, p.ink);
}

function suitcase(g, p) {
  fill(g, 3, 6, 10, 7, p.light);
  fill(g, 6, 4, 4, 2, p.accent);
  fill(g, 4, 7, 8, 5, p.accent);
  fill(g, 7, 8, 2, 3, bone);
}

function banknote(g, p) {
  fill(g, 2, 5, 12, 7, p.accent);
  fill(g, 3, 6, 10, 5, p.light);
  fill(g, 6, 7, 4, 3, p.dark);
  fill(g, 7, 8, 2, 1, amber);
}

function tent(g, p) {
  fill(g, 7, 3, 2, 2, p.accent);
  fill(g, 5, 5, 6, 3, p.accent);
  fill(g, 3, 8, 10, 5, p.accent);
  fill(g, 7, 6, 2, 7, p.dark);
  fill(g, 4, 9, 3, 3, p.light);
}

function coin(g, p) {
  fill(g, 4, 4, 8, 8, amber);
  fill(g, 5, 3, 6, 10, amber);
  fill(g, 3, 5, 10, 6, amber);
  fill(g, 6, 6, 4, 4, p.dark);
  fill(g, 7, 7, 2, 2, bone);
}

function peakedCap(g, p) {
  fill(g, 4, 5, 8, 4, p.light);
  fill(g, 2, 8, 12, 3, bone);
  fill(g, 3, 9, 10, 1, p.accent);
  fill(g, 7, 5, 2, 2, amber);
}

function schoolHouse(g, p) {
  fill(g, 3, 7, 10, 7, p.accent);
  fill(g, 2, 6, 12, 2, p.dark);
  fill(g, 7, 3, 2, 3, p.steel);
  fill(g, 6, 9, 4, 5, p.dark);
  fill(g, 4, 9, 2, 2, p.light);
  fill(g, 10, 9, 2, 2, p.light);
}

function crossBook(g, p) {
  fill(g, 4, 5, 8, 8, p.accent);
  fill(g, 5, 6, 6, 6, p.light);
  fill(g, 7, 4, 2, 10, p.dark);
  fill(g, 4, 8, 8, 2, p.dark);
}

function pigBloom(g, p) {
  fill(g, 3, 6, 10, 6, p.accent);
  fill(g, 4, 5, 8, 2, p.dark);
  fill(g, 5, 7, 6, 3, p.light);
  fill(g, 3, 11, 10, 1, p.ink);
  fill(g, 6, 4, 4, 2, p.dark);
}

function redMound(g, p) {
  fill(g, 2, 10, 12, 3, p.dark);
  fill(g, 4, 7, 8, 4, p.accent);
  fill(g, 6, 5, 4, 3, p.light);
  fill(g, 5, 9, 6, 2, p.ink);
  dot(g, 7, 6, bone);
}

function whitePile(g, p) {
  fill(g, 3, 9, 10, 4, bone);
  fill(g, 5, 6, 6, 4, p.light);
  fill(g, 6, 5, 4, 2, carbon);
  fill(g, 4, 11, 8, 1, p.dark);
}

function quartzHex(g, p) {
  fill(g, 6, 2, 4, 2, p.light);
  fill(g, 4, 4, 8, 8, p.accent);
  fill(g, 5, 5, 6, 6, bone);
  fill(g, 7, 3, 2, 10, p.dark);
  fill(g, 4, 12, 8, 1, p.ink);
}

function siliconBlock(g, p) {
  fill(g, 3, 4, 10, 9, p.accent);
  fill(g, 4, 5, 8, 7, p.dark);
  fill(g, 5, 6, 3, 3, p.light);
  fill(g, 3, 4, 10, 1, p.steel);
}

function polyRods(g, p) {
  fill(g, 3, 3, 3, 11, p.dark);
  fill(g, 7, 2, 3, 12, p.accent);
  fill(g, 11, 4, 3, 10, p.light);
  fill(g, 4, 4, 1, 8, bone);
  fill(g, 8, 3, 1, 9, bone);
}

function roundWafer(g, p) {
  fill(g, 4, 3, 8, 10, p.accent);
  fill(g, 3, 5, 10, 6, p.accent);
  fill(g, 5, 4, 6, 8, p.light);
  fill(g, 11, 4, 2, 2, p.dark);
  fill(g, 7, 7, 2, 2, p.steel);
}

function tinyDie(g, p) {
  fill(g, 5, 5, 6, 6, p.accent);
  fill(g, 6, 6, 4, 4, p.dark);
  fill(g, 7, 7, 2, 2, p.light);
  for (let i = 5; i <= 10; i += 2) {
    dot(g, 4, i, p.steel);
    dot(g, 11, i, p.steel);
  }
}

function clayBrick(g, p) {
  fill(g, 2, 6, 12, 6, p.accent);
  fill(g, 3, 7, 10, 4, p.light);
  fill(g, 2, 6, 12, 1, bone);
  fill(g, 2, 11, 12, 1, p.dark);
  fill(g, 8, 7, 1, 4, muted);
}

function barMagnet(g, p) {
  fill(g, 2, 6, 6, 5, p.accent);
  fill(g, 8, 6, 6, 5, p.dark);
  fill(g, 3, 7, 4, 3, p.light);
  fill(g, 9, 7, 4, 3, p.ink);
  fill(g, 7, 6, 2, 5, bone);
}

function copperCoil(g, p) {
  fill(g, 4, 3, 8, 11, p.accent);
  fill(g, 5, 4, 6, 9, p.dark);
  fill(g, 4, 6, 8, 2, p.light);
  fill(g, 4, 9, 8, 2, p.light);
  fill(g, 7, 3, 2, 11, p.steel);
}

function motorCan(g, p) {
  fill(g, 4, 3, 8, 11, p.accent);
  fill(g, 5, 4, 6, 9, p.light);
  fill(g, 4, 3, 8, 2, p.steel);
  fill(g, 7, 2, 2, 2, p.dark);
  fill(g, 6, 7, 4, 3, p.ink);
}

function emptyFrame(g, p) {
  fill(g, 2, 3, 12, 2, p.accent);
  fill(g, 2, 12, 12, 2, p.accent);
  fill(g, 2, 3, 2, 11, p.accent);
  fill(g, 12, 3, 2, 11, p.accent);
  fill(g, 4, 5, 8, 6, p.dark);
  fill(g, 3, 4, 10, 1, p.light);
}

function moldFlask(g, p) {
  fill(g, 3, 5, 10, 8, p.accent);
  fill(g, 4, 6, 8, 6, p.dark);
  fill(g, 3, 5, 10, 2, p.light);
  fill(g, 6, 8, 4, 3, p.steel);
  fill(g, 2, 12, 12, 2, p.ink);
}

function slagHeap(g, p) {
  fill(g, 2, 10, 12, 3, p.dark);
  fill(g, 3, 7, 10, 4, p.accent);
  fill(g, 5, 5, 6, 3, p.light);
  fill(g, 4, 9, 3, 2, muted);
  fill(g, 9, 8, 3, 2, p.ink);
}

function pulpVat(g, p) {
  fill(g, 3, 7, 10, 7, p.accent);
  fill(g, 4, 8, 8, 5, p.light);
  fill(g, 3, 7, 10, 2, p.dark);
  fill(g, 5, 5, 6, 3, p.steel);
  fill(g, 6, 4, 4, 2, bone);
  fill(g, 7, 9, 2, 3, p.ink);
}

function paperSheet(g, p) {
  fill(g, 3, 2, 10, 13, p.accent);
  fill(g, 4, 3, 8, 11, p.light);
  fill(g, 4, 5, 8, 1, p.dark);
  fill(g, 4, 8, 6, 1, p.dark);
  fill(g, 4, 11, 7, 1, muted);
}

function inkBottle(g, p) {
  fill(g, 6, 2, 4, 2, p.steel);
  fill(g, 5, 4, 6, 9, p.accent);
  fill(g, 6, 5, 4, 7, p.ink);
  fill(g, 5, 13, 6, 2, p.dark);
  fill(g, 7, 6, 2, 4, p.light);
}

function bibleBook(g, p) {
  fill(g, 3, 3, 10, 11, p.accent);
  fill(g, 4, 4, 8, 9, p.dark);
  fill(g, 7, 5, 2, 6, p.light);
  fill(g, 6, 7, 4, 2, p.light);
  fill(g, 3, 13, 10, 1, p.ink);
}

function yellowcakeDrum(g, p) {
  fill(g, 4, 3, 8, 11, p.accent);
  fill(g, 5, 4, 6, 9, p.light);
  fill(g, 4, 3, 8, 2, p.steel);
  fill(g, 4, 8, 8, 2, p.dark);
  fill(g, 7, 5, 2, 2, p.ink);
  fill(g, 4, 13, 8, 1, p.ink);
}

function fuelRod(g, p) {
  fill(g, 6, 2, 4, 12, p.accent);
  fill(g, 7, 3, 2, 10, p.light);
  fill(g, 6, 2, 4, 2, p.steel);
  fill(g, 6, 12, 4, 2, p.dark);
  dot(g, 8, 6, bone);
  dot(g, 8, 9, bone);
}

function physicsPit(g, p) {
  fill(g, 5, 4, 6, 8, p.accent);
  fill(g, 4, 6, 8, 5, p.dark);
  fill(g, 6, 5, 4, 6, p.light);
  fill(g, 7, 7, 2, 2, amber);
  fill(g, 3, 8, 2, 2, p.steel);
  fill(g, 11, 8, 2, 2, p.steel);
}

function slenderMissile(g, p) {
  fill(g, 7, 1, 2, 12, p.accent);
  fill(g, 6, 3, 4, 8, p.dark);
  fill(g, 7, 2, 2, 2, p.light);
  fill(g, 5, 11, 6, 2, p.steel);
  fill(g, 6, 13, 1, 2, p.ink);
  fill(g, 9, 13, 1, 2, p.ink);
  fill(g, 7, 1, 2, 1, bone);
}

function pirateSkiffs(g, p) {
  // Three tiny hulls, lead hull flying a red pennant.
  fill(g, 5, 2, 7, 2, p.accent);
  fill(g, 6, 1, 5, 1, p.dark);
  fill(g, 11, 2, 2, 2, p.light);
  fill(g, 7, 3, 4, 1, p.ink);
  fill(g, 9, 0, 1, 2, '#e07058');
  fill(g, 10, 0, 2, 1, '#e07058');
  fill(g, 1, 7, 6, 2, p.accent);
  fill(g, 2, 6, 4, 1, p.dark);
  fill(g, 6, 7, 2, 2, p.light);
  fill(g, 2, 8, 4, 1, p.ink);
  fill(g, 8, 11, 6, 2, p.accent);
  fill(g, 9, 10, 4, 1, p.dark);
  fill(g, 13, 11, 2, 2, p.light);
  fill(g, 9, 12, 4, 1, p.ink);
}

function droneChevrons(g, p) {
  // Five red arrowheads, a swarm pointing up-right.
  fill(g, 7, 1, 2, 2, p.light);
  fill(g, 6, 3, 4, 1, p.accent);
  fill(g, 5, 4, 6, 1, p.dark);
  fill(g, 3, 6, 2, 2, p.light);
  fill(g, 2, 8, 4, 1, p.accent);
  fill(g, 1, 9, 5, 1, p.dark);
  fill(g, 11, 6, 2, 2, p.light);
  fill(g, 10, 8, 4, 1, p.accent);
  fill(g, 10, 9, 5, 1, p.dark);
  fill(g, 2, 11, 2, 2, p.accent);
  fill(g, 1, 13, 4, 1, p.dark);
  fill(g, 12, 11, 2, 2, p.accent);
  fill(g, 11, 13, 4, 1, p.dark);
}

const PAINTERS = Object.freeze({
  timber: plankStack,
  'milk-powder': tinCan,
  beef: steak,
  education: mortarboard,
  food: wheatSheaf,
  people: labourer,
  oil: oilDrum,
  fittings: bracket,
  chips: chipDie,
  robots: robotArm,
  biotech: flask,
  'ancient-biotech': iceCoreVial,
  coffee: coffeeCup,
  copper: ingot,
  iron: iBeam,
  lithium: battery,
  'rare-earth': horseshoe,
  titanium: jetBlade,
  cobalt: oreChunk,
  steel: girderBundle,
  nickel: matteIngot,
  graphite: graphiteBrick,
  aluminium: aluminiumStack,
  ceramics: hexTile,
  platinum: platinumRing,
  cocoa: cocoaPod,
  lng: gasSphere,
  autos: carSide,
  wine: bottle,
  gold: goldBar,
  machinery: gear,
  turbines: turbineFan,
  marble: marbleSlab,
  beer: beerMug,
  warships: hull,
  compute: serverRack,
  starlink: satellite,
  alien: crystal,
  modular: roomBox,
  furniture: chair,
  tiles: tileGrid,
  tourists: suitcase,
  credit: banknote,
  asylum: tent,
  cash: coin,
  officer: peakedCap,
  navy: hull,
  missionary: crossBook,
  school: schoolHouse,
  'pig-iron': pigBloom,
  bauxite: redMound,
  alumina: whitePile,
  quartz: quartzHex,
  silicon: siliconBlock,
  polysilicon: polyRods,
  wafer: roundWafer,
  die: tinyDie,
  kaolin: clayBrick,
  magnets: barMagnet,
  windings: copperCoil,
  motors: motorCan,
  frames: emptyFrame,
  castings: moldFlask,
  materials: slagHeap,
  pulp: pulpVat,
  paper: paperSheet,
  ink: inkBottle,
  bibles: bibleBook,
  uranium: yellowcakeDrum,
  'enriched-uranium': fuelRod,
  warhead: physicsPit,
  'missile-body': slenderMissile,
  pirates: pirateSkiffs,
  drones: droneChevrons,
});

export const PAINTED_GOODS = Object.freeze(Object.keys(PAINTERS));

function outline(g, color = carbon) {
  const copy = g.map((row) => row.slice());
  for (let y = 0; y < ICON_SIZE; y += 1) {
    for (let x = 0; x < ICON_SIZE; x += 1) {
      if (copy[y][x]) continue;
      const neighbour = (
        (x > 0 && copy[y][x - 1])
        || (x + 1 < ICON_SIZE && copy[y][x + 1])
        || (y > 0 && copy[y - 1][x])
        || (y + 1 < ICON_SIZE && copy[y + 1][x])
      );
      if (neighbour) g[y][x] = color;
    }
  }
}

function paintGood(good) {
  const g = grid();
  const painter = PAINTERS[good] ?? PAINTERS.modular;
  const palKey = good === 'cash'
    ? 'gold'
    : good === 'officer'
      ? 'people'
      : good === 'school' || good === 'missionary'
        ? 'education'
        : good === 'navy'
          ? 'warships'
          : good === 'pirates' || good === 'drones'
            ? 'asylum'
            : good;
  painter(g, pal(palKey));
  outline(g);
  return g;
}

function rectsFromGrid(g) {
  const rects = [];
  for (let y = 0; y < ICON_SIZE; y += 1) {
    let x = 0;
    while (x < ICON_SIZE) {
      const color = g[y][x];
      if (!color) {
        x += 1;
        continue;
      }
      let x2 = x + 1;
      while (x2 < ICON_SIZE && g[y][x2] === color) x2 += 1;
      rects.push(`<rect x="${x}" y="${y}" width="${x2 - x}" height="1" fill="${color}"/>`);
      x = x2;
    }
  }
  return rects.join('');
}

export function itemIconSvg(good, size = ICON_SIZE) {
  const key = good in PAINTERS ? good : 'modular';
  const body = rectsFromGrid(paintGood(key));
  return `<svg class="item-icon" data-good="${key}" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;
}

export function itemIconHtml(good, size = ICON_SIZE) {
  return itemIconSvg(good, size);
}

export function hasItemIcon(good) {
  return Object.prototype.hasOwnProperty.call(PAINTERS, good);
}

/**
 * 16×16 colour grid (row-major, `null` where the icon is transparent) for the
 * good's pixel icon. Same painter as `itemIconSvg`, exposed so the port can
 * stamp the icon onto container textures synchronously (no image decode).
 */
export function itemIconGrid(good) {
  const key = good in PAINTERS ? good : 'modular';
  return paintGood(key).map((row) => row.map((cell) => cell || null));
}
