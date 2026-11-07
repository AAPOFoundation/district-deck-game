// V4.4 Wave 2 — manufacturing process catalog. Pure. No DOM.
// Schema and chains are exact to V4.4-PROCESS-TREE-DESIGN.md §1–§4.
// Cash, labour heads, timeBeats, and basis-point chances are authored here
// (the design named classes and relative weight, not the integers). Labour
// is a people-crate headcount on the row; city wages are CASH.

import { ARCHETYPES } from '../content.js';
import { hash32, stream } from '../rng.js';
import { handlingFeeForGood, WORLD_GOODS, WORLD_TRADE_ROUTES } from './catalog.js';
import { fireDamageForFacility } from './disasters.js';
import { routeIsOpen } from './trade.js';

const GOOD_SET = new Set(WORLD_GOODS);
const STOCK_CAP = 99;
const DRAW_SEQ_CAP = 1_000_000;
const DRAW_LOG_CAP = 64;
const DRAW_FACILITY_CAP = 64;
const FACILITY_ID_RE = /^[A-Za-z0-9:_-]{1,64}$/;

export const DELAY_CLASSES = Object.freeze(['accident', 'environmental', 'political']);

/** Design §1: accident +1–2, environmental +2–3, political +1–4. Exact. */
export const DELAY_BEATS = Object.freeze({
  accident: Object.freeze([1, 2]),
  environmental: Object.freeze([2, 3]),
  political: Object.freeze([1, 4]),
});

/**
 * Authored. City labour this wave is a cash wage bill (labour crates are W2).
 * $8,000 per authored labour head per run.
 */
export const LABOUR_WAGE = 8_000;

/**
 * Authored. Time amortised at $5,000 per beat for unitCostOf / importCostOf.
 */
export const TIME_COST_PER_BEAT = 5_000;

/**
 * Authored. Inbound book openFee amortised over eight crates (one crate per
 * beat, same window as the Sydney credit term).
 */
export const IMPORT_AMORTISE_BEATS = 8;

/**
 * Combo adjacency: Chebyshev tiles between facility parcels. d ≤ 2 is
 * in-range for the ladder (design §4).
 */
export const COMBO_RANGE_TILES = 2;

/**
 * Transfer time: +1 beat per K tiles of haul when d > 2.
 * K = 3 because a Hoddle-grid block face is three 1×1 tiles — one extra
 * beat to cart across a block, not per kerb.
 */
export const TRANSFER_BEAT_K = 3;

/** Quality decay, integer bp × d, applied only when d > 2. */
export const QUALITY_DECAY_BP_PER_TILE = 40;

/**
 * Accident exposure, integer bp × d, added to the accident roll when d > 2.
 * 40 bp/tile so a seven-tile haul trips seed-0 BOF run 9 and a three-tile
 * haul does not.
 */
export const ACCIDENT_EXPOSURE_BP_PER_TILE = 40;

/** Combo yield, integer bp. floor(qty × bp / 10_000) extra crates, min +0. */
export const COMBO_YIELD_BP = Object.freeze({
  2: 1_000,
  3: 1_800,
  4: 2_500,
  5: 3_500,
});

/** R1 plates. Verbatim. */
export const COMBO_CHIPS = Object.freeze({
  2: 'DOUBLE KILL',
  3: 'TRIPLE KILL',
  4: 'KILLING SPREE',
  5: 'GODLIKE',
});

export const LEGAL_YIELD_BP = Object.freeze([0, 1_000, 1_800, 2_500, 3_500]);

/**
 * Kiln heat is not a crate. While a combo at TRIPLE KILL or better holds
 * and a kiln stands in range, linked smelt/fire runs lose 1 timeBeat
 * (min 1). Authored: waste heat from the kiln box.
 */
export const KILN_HEAT_BEAT_RELIEF = 1;
export const KILN_HEAT_PROCESS_IDS = Object.freeze([
  'blast-furnace', 'bof', 'hall-heroult', 'carbothermic-si', 'kiln-firing',
]);
const KILN_HEAT_SET = new Set(KILN_HEAT_PROCESS_IDS);

/**
 * World MAKE desks. Exact set: the desk's good is MINED, not manufactured.
 * Pohang (steel), Gladstone (aluminium), Seto (ceramics) stay import-only
 * — their mines are upstream. Eneabba hosts mine-quartz (MAKE yields
 * quartz); the titanium inbound book is a different crate and still
 * harvests.
 */
export const MINE_MAKE_DESKS = Object.freeze({
  'port-hedland': 'mine-iron',
  greenbushes: 'mine-lithium',
  'mount-weld': 'mine-rare-earth',
  'eneabba-sands': 'mine-quartz',
  kolwezi: 'mine-cobalt',
  morowali: 'mine-nickel',
  balama: 'mine-graphite',
  rustenburg: 'mine-platinum',
  'olympic-dam': 'mine-uranium',
});

/**
 * World-only refine/assemble stages hosted on a MAKE desk. Enrichment and
 * the nuclear assembly chain tick after the mine shift when MAKE is on.
 */
export const WORLD_WORKS_DESKS = Object.freeze({
  'olympic-dam': Object.freeze(['enrichment', 'warhead-assembly', 'missile-body']),
});

/**
 * A globe beat is one mine shift. City timeBeats stay on the row for
 * Melbourne plants and unitCostOf.
 */
export const WORLD_MINE_SHIFT_BEATS = 1;

export const PROCESS_FACILITY_IDS = Object.freeze([
  'steelworks', 'smelter', 'terafab', 'works-hall', 'kiln', 'refinery',
]);

/** Dedicated mill/press buildings. Also host their stage; works-hall still does. */
export const DEDICATED_CITY_FACILITIES = Object.freeze(['pulp-mill', 'printing-press']);

const FACILITY_SET = new Set(PROCESS_FACILITY_IDS);
const DEDICATED_CITY_SET = new Set(DEDICATED_CITY_FACILITIES);

/**
 * Stage → facility. Six shared city forms, plus dedicated mill/press hosts.
 * World mines host on the existing supplier desks.
 */
export const STAGE_FACILITY = Object.freeze({
  'mine-iron': 'port-hedland',
  'mine-lithium': 'greenbushes',
  'mine-rare-earth': 'mount-weld',
  'mine-cobalt': 'kolwezi',
  'mine-nickel': 'morowali',
  'mine-graphite': 'balama',
  'mine-platinum': 'rustenburg',
  'mine-bauxite': 'gladstone',
  'mine-quartz': 'eneabba-sands',
  'mine-kaolin': 'seto',
  'mine-uranium': 'olympic-dam',
  enrichment: 'olympic-dam',
  'warhead-assembly': 'olympic-dam',
  'missile-body': 'olympic-dam',
  'blast-furnace': 'steelworks',
  bof: 'steelworks',
  bayer: 'refinery',
  'hall-heroult': 'smelter',
  'carbothermic-si': 'smelter',
  siemens: 'terafab',
  'cz-wafer': 'terafab',
  lithography: 'terafab',
  'chip-pack': 'terafab',
  casting: 'works-hall',
  'machine-shop': 'works-hall',
  windings: 'works-hall',
  magnets: 'works-hall',
  'turbine-assembly': 'works-hall',
  motors: 'works-hall',
  'robot-assembly': 'works-hall',
  'pulp-mill': 'works-hall',
  'printing-press': 'works-hall',
  'kiln-firing': 'kiln',
  'server-assembly': 'terafab',
});

/** Host word in delay copy. Design example names the smelter. */
export const FACILITY_HOST_WORD = Object.freeze({
  steelworks: 'the steelworks',
  smelter: 'the smelter',
  terafab: 'the fab',
  'works-hall': 'the works hall',
  kiln: 'the kiln',
  refinery: 'the refinery',
  'pulp-mill': 'the pulp mill',
  'printing-press': 'the press',
  'port-hedland': 'the mine',
  greenbushes: 'the mine',
  'mount-weld': 'the mine',
  kolwezi: 'the mine',
  morowali: 'the mine',
  balama: 'the mine',
  rustenburg: 'the mine',
  gladstone: 'the mine',
  'eneabba-sands': 'the mine',
  seto: 'the mine',
  'olympic-dam': 'the centrifuge works',
});

function freezeGoods(value, label) {
  const goods = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const frozen = {};
  for (const [good, amount] of Object.entries(goods)) {
    if (!GOOD_SET.has(good)) {
      throw new RangeError(`${label} unknown good: ${good}`);
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new RangeError(`${label}.${good} must be a positive integer.`);
    }
    frozen[good] = amount;
  }
  return Object.freeze(frozen);
}

function proc(row) {
  if (!row?.id || typeof row.id !== 'string') throw new TypeError('process id required');
  if (!Number.isInteger(row.errorChanceBp) || row.errorChanceBp <= 0) {
    throw new RangeError(`${row.id} errorChanceBp must be > 0`);
  }
  if (!row.delayBp || typeof row.delayBp !== 'object') {
    throw new TypeError(`${row.id} delayBp required`);
  }
  for (const klass of DELAY_CLASSES) {
    const bp = row.delayBp[klass];
    if (!Number.isInteger(bp) || bp <= 0) {
      throw new RangeError(`${row.id} delayBp.${klass} must be > 0`);
    }
  }
  if (!['world', 'city', 'both'].includes(row.allowedIn)) {
    throw new RangeError(`${row.id} allowedIn`);
  }
  if (row.tier === 'mine' && row.allowedIn !== 'world') {
    throw new RangeError(`${row.id} mines must be world-only`);
  }
  if (row.id === 'enrichment' && row.allowedIn !== 'world') {
    throw new RangeError(`${row.id} enrichment must be world-only`);
  }
  const facility = STAGE_FACILITY[row.id];
  if (!facility) throw new RangeError(`${row.id} missing stage→facility mapping`);
  if (row.facility !== facility) {
    throw new RangeError(`${row.id} facility ${row.facility} !== ${facility}`);
  }
  if (!Number.isInteger(row.labour) || row.labour < 0) {
    throw new RangeError(`${row.id} labour`);
  }
  if (!Number.isInteger(row.cash) || row.cash < 0) {
    throw new RangeError(`${row.id} cash`);
  }
  if (!Number.isInteger(row.timeBeats) || row.timeBeats <= 0) {
    throw new RangeError(`${row.id} timeBeats must be > 0`);
  }
  return Object.freeze({
    id: row.id,
    label: row.label,
    tier: row.tier,
    elements: Object.freeze([...row.elements]),
    inputs: freezeGoods(row.inputs, `${row.id}.inputs`),
    outputs: freezeGoods(row.outputs, `${row.id}.outputs`),
    byproducts: freezeGoods(row.byproducts ?? {}, `${row.id}.byproducts`),
    labour: row.labour,
    cash: row.cash,
    timeBeats: row.timeBeats,
    errorChanceBp: row.errorChanceBp,
    delayBp: Object.freeze({
      accident: row.delayBp.accident,
      environmental: row.delayBp.environmental,
      political: row.delayBp.political,
    }),
    allowedIn: row.allowedIn,
    facility: row.facility,
  });
}

function mine(id, label, elements, outputGood, desk, delayPolitical = 420) {
  return proc({
    id,
    label,
    tier: 'mine',
    elements,
    inputs: {},
    // A standing mine's shift fills two hoppers. Import still lands one
    // crate of certainty. unitCostOf(mineral) = 19_000 vs iron import
    // 7_000 marginal + 17_500 book capex.
    outputs: { [outputGood]: 2 },
    labour: 2,
    cash: 12_000,
    timeBeats: 2,
    errorChanceBp: 40,
    delayBp: { accident: 80, environmental: 140, political: delayPolitical },
    allowedIn: 'world',
    facility: desk,
  });
}

export const PROCESSES = Object.freeze([
  // —— Steel: Fe ore (MINE, world) + C graphite → BLAST FURNACE → BOF → steel
  mine('mine-iron', 'Iron mine', ['Fe'], 'iron', 'port-hedland', 400),
  proc({
    id: 'blast-furnace',
    label: 'Blast furnace',
    tier: 'fabricate',
    elements: ['Fe', 'C'],
    inputs: { iron: 1, graphite: 1 },
    outputs: { 'pig-iron': 1 },
    byproducts: { materials: 1 }, // slag
    labour: 4,
    cash: 28_000,
    timeBeats: 3,
    errorChanceBp: 110,
    delayBp: { accident: 120, environmental: 380, political: 90 },
    allowedIn: 'city',
    facility: 'steelworks',
  }),
  proc({
    id: 'bof',
    label: 'Basic oxygen furnace',
    tier: 'fabricate',
    elements: ['Fe', 'C'],
    inputs: { 'pig-iron': 1 },
    outputs: { steel: 1 },
    labour: 3,
    cash: 18_000,
    timeBeats: 2,
    errorChanceBp: 90,
    delayBp: { accident: 100, environmental: 220, political: 70 },
    allowedIn: 'city',
    facility: 'steelworks',
  }),

  // —— Aluminium: bauxite → BAYER → HALL-HÉROULT
  mine('mine-bauxite', 'Bauxite mine', ['Al'], 'bauxite', 'gladstone', 380),
  proc({
    id: 'bayer',
    label: 'Bayer alumina',
    tier: 'refine',
    elements: ['Al', 'O'],
    inputs: { bauxite: 1 },
    outputs: { alumina: 1 },
    byproducts: { materials: 1 }, // red-mud handling
    labour: 3,
    cash: 24_000,
    timeBeats: 2,
    errorChanceBp: 80,
    delayBp: { accident: 70, environmental: 300, political: 80 },
    allowedIn: 'city',
    facility: 'refinery',
  }),
  proc({
    id: 'hall-heroult',
    label: 'Hall-Héroult electrolysis',
    tier: 'fabricate',
    elements: ['Al', 'O'],
    // LNG is the power proxy this wave (electrolysis energy).
    inputs: { alumina: 1, lng: 1 },
    outputs: { aluminium: 1 },
    labour: 3,
    cash: 36_000,
    timeBeats: 4,
    errorChanceBp: 120,
    delayBp: { accident: 110, environmental: 400, political: 80 },
    allowedIn: 'city',
    facility: 'smelter',
  }),

  // —— Chips: quartz → CARBOTHERMIC Si → SIEMENS → CZ WAFER → LITHO → PACKAGE
  mine('mine-quartz', 'Quartz mine', ['Si'], 'quartz', 'eneabba-sands', 360),
  proc({
    id: 'carbothermic-si',
    label: 'Carbothermic silicon',
    tier: 'fabricate',
    elements: ['Si', 'C'],
    inputs: { quartz: 1, graphite: 1 },
    outputs: { silicon: 1 },
    labour: 3,
    cash: 26_000,
    timeBeats: 2,
    errorChanceBp: 100,
    delayBp: { accident: 100, environmental: 320, political: 70 },
    allowedIn: 'city',
    facility: 'smelter',
  }),
  proc({
    id: 'siemens',
    label: 'Siemens polysilicon',
    tier: 'fabricate',
    elements: ['Si'],
    inputs: { silicon: 1 },
    outputs: { polysilicon: 1 },
    labour: 4,
    cash: 40_000,
    timeBeats: 3,
    errorChanceBp: 160,
    delayBp: { accident: 80, environmental: 140, political: 50 },
    allowedIn: 'city',
    facility: 'terafab',
  }),
  proc({
    id: 'cz-wafer',
    label: 'Czochralski wafer',
    tier: 'fabricate',
    elements: ['Si'],
    inputs: { polysilicon: 1 },
    outputs: { wafer: 1 },
    labour: 4,
    cash: 44_000,
    timeBeats: 3,
    errorChanceBp: 180,
    delayBp: { accident: 70, environmental: 80, political: 40 },
    allowedIn: 'city',
    facility: 'terafab',
  }),
  proc({
    id: 'lithography',
    label: 'Lithography',
    tier: 'fabricate',
    elements: ['Si'],
    inputs: { wafer: 1 },
    outputs: { die: 1 },
    labour: 6,
    cash: 80_000,
    timeBeats: 5,
    errorChanceBp: 420,
    delayBp: { accident: 90, environmental: 60, political: 40 },
    allowedIn: 'city',
    facility: 'terafab',
  }),
  proc({
    id: 'chip-pack',
    label: 'Chip packing',
    tier: 'assemble',
    elements: ['Si'],
    inputs: { die: 1 },
    outputs: { chips: 1 },
    labour: 3,
    cash: 22_000,
    timeBeats: 2,
    errorChanceBp: 140,
    delayBp: { accident: 60, environmental: 40, political: 30 },
    allowedIn: 'city',
    facility: 'terafab',
  }),

  // —— Turbines: steel CASTING + MACHINING; copper WINDINGS; rare-earth MAGNETS; ASSEMBLY
  proc({
    id: 'casting',
    label: 'Steel casting',
    tier: 'fabricate',
    elements: ['Fe', 'C'],
    inputs: { steel: 1 },
    outputs: { castings: 1 },
    labour: 3,
    cash: 20_000,
    timeBeats: 2,
    errorChanceBp: 90,
    delayBp: { accident: 110, environmental: 120, political: 50 },
    allowedIn: 'city',
    facility: 'works-hall',
  }),
  proc({
    id: 'machine-shop',
    label: 'Machine shop',
    tier: 'fabricate',
    elements: ['Fe', 'C'],
    inputs: { steel: 1 },
    outputs: { fittings: 1 },
    labour: 3,
    cash: 16_000,
    timeBeats: 2,
    errorChanceBp: 80,
    delayBp: { accident: 90, environmental: 60, political: 40 },
    allowedIn: 'city',
    facility: 'works-hall',
  }),
  proc({
    id: 'windings',
    label: 'Copper windings',
    tier: 'fabricate',
    elements: ['Cu'],
    inputs: { copper: 1 },
    outputs: { windings: 1 },
    labour: 2,
    cash: 14_000,
    timeBeats: 2,
    errorChanceBp: 70,
    delayBp: { accident: 50, environmental: 40, political: 30 },
    allowedIn: 'city',
    facility: 'works-hall',
  }),
  proc({
    id: 'magnets',
    label: 'Rare-earth magnets',
    tier: 'fabricate',
    elements: ['Nd'],
    inputs: { 'rare-earth': 1 },
    outputs: { magnets: 1 },
    labour: 3,
    cash: 32_000,
    timeBeats: 2,
    errorChanceBp: 100,
    delayBp: { accident: 70, environmental: 180, political: 80 },
    allowedIn: 'city',
    facility: 'works-hall',
  }),
  proc({
    id: 'turbine-assembly',
    label: 'Turbine assembly',
    tier: 'assemble',
    elements: ['Fe', 'Cu', 'Nd'],
    inputs: { castings: 1, windings: 1, magnets: 1 },
    outputs: { turbines: 1 },
    labour: 5,
    cash: 40_000,
    timeBeats: 3,
    errorChanceBp: 90,
    delayBp: { accident: 80, environmental: 50, political: 40 },
    allowedIn: 'city',
    facility: 'works-hall',
  }),

  // —— Robots: steel FRAME + magnets/copper MOTORS + chips + ASSEMBLY
  proc({
    id: 'motors',
    label: 'Electric motors',
    tier: 'assemble',
    elements: ['Cu', 'Nd'],
    inputs: { magnets: 1, windings: 1 },
    outputs: { motors: 1 },
    labour: 3,
    cash: 24_000,
    timeBeats: 2,
    errorChanceBp: 85,
    delayBp: { accident: 70, environmental: 40, political: 30 },
    allowedIn: 'city',
    facility: 'works-hall',
  }),
  proc({
    id: 'robot-assembly',
    label: 'Robot assembly',
    tier: 'assemble',
    elements: ['Fe', 'Si', 'Cu'],
    inputs: { castings: 1, motors: 1, chips: 1 },
    outputs: { robots: 1 },
    labour: 5,
    cash: 48_000,
    timeBeats: 3,
    errorChanceBp: 95,
    delayBp: { accident: 70, environmental: 40, political: 30 },
    allowedIn: 'city',
    facility: 'works-hall',
  }),

  // —— Paper + bibles. Works-hall-class mill and press stage.
  // timber → PULP+PAPER MILL → paper; paper 2 + ink 1 → bibles 2.
  proc({
    id: 'pulp-mill',
    label: 'Pulp and paper mill',
    tier: 'fabricate',
    elements: ['C'],
    inputs: { timber: 1 },
    outputs: { paper: 2 },
    labour: 3,
    cash: 16_000,
    timeBeats: 2,
    errorChanceBp: 90,
    delayBp: { accident: 80, environmental: 260, political: 50 },
    allowedIn: 'city',
    facility: 'works-hall',
  }),
  proc({
    id: 'printing-press',
    label: 'Printing press',
    tier: 'assemble',
    elements: ['C'],
    inputs: { paper: 2, ink: 1 },
    outputs: { bibles: 2 },
    labour: 2,
    cash: 12_000,
    timeBeats: 2,
    errorChanceBp: 60,
    delayBp: { accident: 50, environmental: 40, political: 70 },
    allowedIn: 'city',
    facility: 'works-hall',
  }),

  // —— Ceramics: kaolin/alumina → KILN FIRING
  mine('mine-kaolin', 'Kaolin mine', ['Al', 'Si'], 'kaolin', 'seto', 340),
  // Kiln heat is not a crate. Capture is −1 timeBeat on linked smelt/fire
  // runs at TRIPLE KILL+ (KILN_HEAT_BEAT_RELIEF).
  proc({
    id: 'kiln-firing',
    label: 'Kiln firing',
    tier: 'fabricate',
    elements: ['Al', 'Si'],
    inputs: { kaolin: 1, alumina: 1 },
    outputs: { ceramics: 1 },
    labour: 2,
    cash: 18_000,
    timeBeats: 2,
    errorChanceBp: 100,
    delayBp: { accident: 80, environmental: 240, political: 50 },
    allowedIn: 'city',
    facility: 'kiln',
  }),

  // —— Compute: chips + ASSEMBLY
  proc({
    id: 'server-assembly',
    label: 'Server assembly',
    tier: 'assemble',
    elements: ['Si'],
    inputs: { chips: 1 },
    outputs: { compute: 1 },
    labour: 3,
    cash: 30_000,
    timeBeats: 2,
    errorChanceBp: 75,
    delayBp: { accident: 50, environmental: 30, political: 30 },
    allowedIn: 'city',
    facility: 'terafab',
  }),

  // —— Batteries-class minerals. MINE-only this wave (refine waits on ore intermediates).
  mine('mine-lithium', 'Lithium mine', ['Li'], 'lithium', 'greenbushes', 430),
  mine('mine-cobalt', 'Cobalt mine', ['Co'], 'cobalt', 'kolwezi', 480),
  mine('mine-nickel', 'Nickel mine', ['Ni'], 'nickel', 'morowali', 410),
  mine('mine-graphite', 'Graphite mine', ['C'], 'graphite', 'balama', 390),
  mine('mine-platinum', 'Platinum mine', ['Pt'], 'platinum', 'rustenburg', 450),
  mine('mine-rare-earth', 'Rare-earth mine', ['Nd'], 'rare-earth', 'mount-weld', 440),
  mine('mine-uranium', 'Uranium mine', ['U'], 'uranium', 'olympic-dam', 520),
  proc({
    id: 'enrichment',
    label: 'Centrifuge enrichment',
    tier: 'refine',
    elements: ['U'],
    inputs: { uranium: 1 },
    outputs: { 'enriched-uranium': 1 },
    labour: 6,
    cash: 80_000,
    timeBeats: 6,
    errorChanceBp: 180,
    delayBp: { accident: 90, environmental: 240, political: 720 },
    allowedIn: 'world',
    facility: 'olympic-dam',
  }),
  proc({
    id: 'warhead-assembly',
    label: 'Warhead assembly',
    tier: 'assemble',
    elements: ['U', 'Si'],
    inputs: { chips: 1, 'rare-earth': 1 },
    outputs: { warhead: 1 },
    labour: 5,
    cash: 60_000,
    timeBeats: 4,
    errorChanceBp: 140,
    delayBp: { accident: 80, environmental: 120, political: 520 },
    allowedIn: 'world',
    facility: 'olympic-dam',
  }),
  proc({
    id: 'missile-body',
    label: 'Missile body',
    tier: 'assemble',
    elements: ['Fe', 'Al'],
    inputs: { steel: 1, aluminium: 1, castings: 1 },
    outputs: { 'missile-body': 1 },
    labour: 5,
    cash: 48_000,
    timeBeats: 4,
    errorChanceBp: 90,
    delayBp: { accident: 90, environmental: 80, political: 220 },
    allowedIn: 'world',
    facility: 'olympic-dam',
  }),
]);

export const PROCESS_BY_ID = Object.freeze(Object.fromEntries(
  PROCESSES.map((row) => [row.id, row]),
));

if (Object.keys(PROCESS_BY_ID).length !== PROCESSES.length) {
  throw new Error('Duplicate process id');
}

export const PROCESS_CHAINS = Object.freeze({
  steel: Object.freeze(['mine-iron', 'blast-furnace', 'bof']),
  aluminium: Object.freeze(['mine-bauxite', 'bayer', 'hall-heroult']),
  chips: Object.freeze([
    'mine-quartz', 'carbothermic-si', 'siemens', 'cz-wafer', 'lithography', 'chip-pack',
  ]),
  turbines: Object.freeze([
    'casting', 'windings', 'magnets', 'turbine-assembly',
  ]),
  robots: Object.freeze(['casting', 'windings', 'magnets', 'motors', 'robot-assembly']),
  ceramics: Object.freeze(['mine-kaolin', 'bayer', 'kiln-firing']),
  compute: Object.freeze(['server-assembly']),
  fittings: Object.freeze(['machine-shop']),
  lithium: Object.freeze(['mine-lithium']),
  cobalt: Object.freeze(['mine-cobalt']),
  nickel: Object.freeze(['mine-nickel']),
  graphite: Object.freeze(['mine-graphite']),
  platinum: Object.freeze(['mine-platinum']),
  'rare-earth': Object.freeze(['mine-rare-earth']),
  iron: Object.freeze(['mine-iron']),
  paper: Object.freeze(['pulp-mill']),
  bibles: Object.freeze(['pulp-mill', 'printing-press']),
  uranium: Object.freeze(['mine-uranium']),
  'enriched-uranium': Object.freeze(['mine-uranium', 'enrichment']),
  warhead: Object.freeze(['warhead-assembly']),
  'missile-body': Object.freeze(['missile-body']),
  nuke: Object.freeze(['mine-uranium', 'enrichment', 'warhead-assembly', 'missile-body']),
});

export function processOf(id) {
  return PROCESS_BY_ID[id] ?? null;
}

export function canHostProcessInCity(process) {
  const row = typeof process === 'string' ? PROCESS_BY_ID[process] : process;
  if (!row) return false;
  if (row.allowedIn === 'world') return false;
  return FACILITY_SET.has(row.facility);
}

/**
 * Shared halls keep hosting their stages. A dedicated mill/press building
 * hosts only its own stage so a pulp mill is placeable without stealing
 * the works-hall picker.
 */
export function facilityHostsProcess(form, process) {
  const row = typeof process === 'string' ? PROCESS_BY_ID[process] : process;
  if (!form || !row) return false;
  if (form === row.facility) return true;
  return DEDICATED_CITY_SET.has(form) && form === row.id;
}

export function processesHostedBy(facility) {
  return PROCESSES.filter((row) => canHostProcessInCity(row) && facilityHostsProcess(facility, row));
}

export function wageBill(process) {
  const row = typeof process === 'string' ? PROCESS_BY_ID[process] : process;
  if (!row) return 0;
  return row.labour * LABOUR_WAGE;
}

function stageOperatingCost(row) {
  return row.cash + wageBill(row) + (row.timeBeats * TIME_COST_PER_BEAT);
}

function primaryOutputQty(row) {
  return Object.values(row?.outputs ?? {}).reduce((sum, n) => sum + n, 0);
}

export function runCashCost(process) {
  const row = typeof process === 'string' ? PROCESS_BY_ID[process] : process;
  if (!row) return 0;
  return row.cash + wageBill(row);
}

export function processStreamName(processId, runIndex) {
  return `proc:${processId}:${runIndex}`;
}

export function processStream(seed, processId, runIndex) {
  return stream(seed, processStreamName(processId, runIndex));
}

/**
 * Delay rolls at start, error roll last on the same stream so a completion
 * pin is a function of the same `proc:{id}:{run}` draws. Shape is unchanged:
 * three delay classes then error. Accident exposure and GODLIKE error-halving
 * only change the integer thresholds.
 */
export function rollProcess(seed, processId, runIndex, options = {}) {
  const row = PROCESS_BY_ID[processId];
  if (!row) throw new RangeError(`Unknown process: ${processId}`);
  const rng = processStream(seed, processId, runIndex);
  const delays = [];
  const accidentExtra = Number.isInteger(options.accidentExposureBp) ? options.accidentExposureBp : 0;
  for (const klass of DELAY_CLASSES) {
    const authored = row.delayBp[klass];
    const bp = klass === 'accident' ? authored + accidentExtra : authored;
    const hit = Math.floor(rng.unit() * 10_000) < bp;
    const [lo, hi] = DELAY_BEATS[klass];
    const beats = rng.int(lo, hi);
    if (hit) delays.push(Object.freeze({ class: klass, beats }));
  }
  const errorBp = options.errorHalved === true
    ? Math.floor(row.errorChanceBp / 2)
    : row.errorChanceBp;
  const error = Math.floor(rng.unit() * 10_000) < errorBp;
  return Object.freeze({
    delays: Object.freeze(delays),
    error,
    delayBeats: delays.reduce((sum, hit) => sum + hit.beats, 0),
  });
}

export function delayCopy(process, delayClass, beats) {
  const row = typeof process === 'string' ? PROCESS_BY_ID[process] : process;
  const host = FACILITY_HOST_WORD[row?.facility] ?? 'the plant';
  const span = beats === 1 ? '1 beat' : `${beats} beats`;
  if (delayClass === 'environmental') return `Environmental review holds ${host} — ${span}.`;
  if (delayClass === 'political') return `Political red tape holds ${host} — ${span}.`;
  return `Accident holds ${host} — ${span}.`;
}

export function scrapCopy() {
  return 'The run is scrap. Inputs are lost.';
}

export function cannotFeedCopy() {
  return 'The Yard cannot feed this run.';
}

export function waitingOnYardCopy() {
  return 'Waiting on the yard.';
}

export function globeBehindCopy() {
  return 'The globe is behind — the yard holds.';
}

export function abortRunCopy(kind = 'retract') {
  if (kind === 'committed') return 'The run is aborted. Drawn goods stay lost.';
  return 'The run is aborted. The take is withdrawn.';
}

export function globeDarkCopy() {
  return 'The globe is dark — the yard holds.';
}

export function comboChipCopy(linkedStages) {
  if (linkedStages >= 5) return COMBO_CHIPS[5];
  if (linkedStages === 4) return COMBO_CHIPS[4];
  if (linkedStages === 3) return COMBO_CHIPS[3];
  if (linkedStages === 2) return COMBO_CHIPS[2];
  return '';
}

export function comboTierFor(linkedStages) {
  if (!Number.isInteger(linkedStages) || linkedStages < 2) {
    return Object.freeze({
      stages: 0,
      chip: '',
      yieldBp: 0,
      byproductCapture: false,
      qualityBump: 0,
      errorHalved: false,
    });
  }
  const stages = linkedStages >= 5 ? 5 : linkedStages;
  return Object.freeze({
    stages,
    chip: COMBO_CHIPS[stages],
    yieldBp: COMBO_YIELD_BP[stages],
    byproductCapture: stages >= 3,
    qualityBump: stages >= 4 ? 1 : 0,
    errorHalved: stages >= 5,
  });
}

export function comboYieldQty(baseQty, yieldBp) {
  const base = Number.isInteger(baseQty) ? baseQty : 0;
  const bp = Number.isInteger(yieldBp) ? yieldBp : 0;
  const extra = Math.max(0, Math.floor(base * bp / 10_000));
  return base + extra;
}

export function distancePenalties(d) {
  if (!Number.isInteger(d) || d <= COMBO_RANGE_TILES) {
    return Object.freeze({
      transferBeats: 0,
      qualityDecayBp: 0,
      accidentExposureBp: 0,
    });
  }
  return Object.freeze({
    transferBeats: Math.floor(d / TRANSFER_BEAT_K),
    qualityDecayBp: QUALITY_DECAY_BP_PER_TILE * d,
    accidentExposureBp: ACCIDENT_EXPOSURE_BP_PER_TILE * d,
  });
}

/**
 * Authored. 250 bp of haul decay strips one quality tier.
 * d = 3 (120 bp) is still 0 tiers; the far-flung d = 7 fixture (280 bp) is 1.
 */
export const QUALITY_DECAY_BP_PER_TIER = 250;

/**
 * GODLIKE forgives one quality-decay tier. A d = 7 GODLIKE give still
 * carries quality after the haul that zeroes KILLING SPREE.
 */
export const GODLIKE_QUALITY_DECAY_TIER_RELIEF = 1;

export function qualityDecayTiers(qualityDecayBp) {
  if (!Number.isInteger(qualityDecayBp) || qualityDecayBp <= 0) return 0;
  return Math.floor(qualityDecayBp / QUALITY_DECAY_BP_PER_TIER);
}

export function netGiveQuality(comboQualityBump, qualityDecayBp, errorHalved = false) {
  const bump = Number.isInteger(comboQualityBump) ? comboQualityBump : 0;
  const tiers = qualityDecayTiers(qualityDecayBp);
  const relief = errorHalved === true ? GODLIKE_QUALITY_DECAY_TIER_RELIEF : 0;
  return Math.max(0, bump - Math.max(0, tiers - relief));
}

export function byproductEscapedCopy(process) {
  const row = typeof process === 'string' ? PROCESS_BY_ID[process] : process;
  if (row?.id === 'blast-furnace') return 'The slag escaped the run.';
  if (row?.id === 'bayer') return 'The red mud escaped the run.';
  if (row?.id === 'kiln-firing') return 'The kiln\'s heat escaped.';
  return 'A byproduct escaped the run.';
}

export function kilnHeatEscapedCopy() {
  return 'The kiln\'s heat escaped.';
}

export function makeModeCopy(on) {
  return on === true ? 'MAKE' : 'IMPORT';
}

export function makeOnCopy() {
  return 'MAKE — the mine ticks each beat.';
}

export function makeOffCopy() {
  return 'IMPORT — one crate each beat, no delay.';
}

export function makeToggleHintCopy() {
  return 'M toggles MAKE.';
}

export function noMineCopy() {
  return 'That desk has no mine.';
}

export function mineUnfundedCopy() {
  return 'Head office cannot cover the mine.';
}

export function mineTickCopy(process) {
  const row = typeof process === 'string' ? PROCESS_BY_ID[process] : process;
  return `${row?.label ?? 'The mine'} ticks.`;
}

export function mineLandCopy(process) {
  const row = typeof process === 'string' ? PROCESS_BY_ID[process] : process;
  return `${row?.label ?? 'The mine'} lands.`;
}

export function kilnHeatProcess(processId) {
  return KILN_HEAT_SET.has(processId);
}

export function takeGoodsRejectCopy() {
  return "That take is not this process's inputs.";
}

export function giveGoodsRejectCopy() {
  return "That give is not this process's outputs.";
}

export function staleDrawRejectCopy() {
  return 'That draw belongs to another city run.';
}

export function drawIdRejectCopy() {
  return 'That draw id does not match.';
}

/** Authored. Abort refunds the wage bill minus this breakage. */
export const PROCESS_ABORT_BREAKAGE = 8_000;

/** Tamper-evidence: same class as kit voucher ids. Nothing secret is seeded. */
export function deriveDrawId(runId, parcelId, seq) {
  return hash32(`${runId}:${parcelId}:${seq}`).toString(16);
}

export function chainStages(processChain) {
  if (Array.isArray(processChain)) return processChain;
  const stages = PROCESS_CHAINS[processChain];
  if (!stages) throw new RangeError(`Unknown process chain: ${processChain}`);
  return stages;
}

/**
 * Marginal MAKE cost per crate of the chain's last primary output.
 * Each stage:
 *   floor( (cash + labour×LABOUR_WAGE + timeBeats×TIME_COST_PER_BEAT
 *           + Σ inputQty × unit(input)) / primaryOutputQty )
 * In-chain outputs carry their produced unit cost — a two-hopper mine
 * halves the shift across two crates. Inputs not produced earlier take
 * importCostOf (handling + time, no book capex). Byproducts (slag) are
 * marked produced at $0 so they are not re-imported and do not split
 * the stage bill. Facility build cost is unitCapexOf, not this figure.
 *
 * Steel: mine 38_000/2 = 19_000; blast 75_000 + 19_000 + graphite 7_000;
 * BOF 52_000 + 101_000 = 153_000 / steel.
 */
export function unitCostOf(processChain) {
  const stages = chainStages(processChain);
  const unitByGood = Object.create(null);
  let last = 0;
  for (const id of stages) {
    const row = PROCESS_BY_ID[id];
    if (!row) throw new RangeError(`Unknown process: ${id}`);
    let run = stageOperatingCost(row);
    for (const [good, qty] of Object.entries(row.inputs ?? {})) {
      const unit = Object.prototype.hasOwnProperty.call(unitByGood, good)
        ? unitByGood[good]
        : (importCostOf(good) ?? 0);
      run += unit * qty;
    }
    const outputQty = primaryOutputQty(row);
    const per = outputQty ? Math.floor(run / outputQty) : 0;
    for (const good of Object.keys(row.outputs ?? {})) unitByGood[good] = per;
    for (const good of Object.keys(row.byproducts ?? {})) {
      if (!Object.prototype.hasOwnProperty.call(unitByGood, good)) unitByGood[good] = 0;
    }
    last = per;
  }
  return last;
}

export function inboundBookFor(good) {
  return WORLD_TRADE_ROUTES.find((route) => (
    route.good === good
    && route.direction === 'inbound'
    && route.playerOpenable === true
  )) ?? null;
}

/**
 * Marginal IMPORT cost per crate: handling + one beat of time.
 * Book-open capital is importCapexOf, not this figure. Pohang steel:
 * $8,000 handling + $5,000 time = $13,000.
 */
export function importCostOf(good) {
  const book = inboundBookFor(good);
  if (!book) return null;
  return handlingFeeForGood(good) + TIME_COST_PER_BEAT;
}

/**
 * Amortised inbound book-open capex per crate:
 *   floor(openFee / IMPORT_AMORTISE_BEATS)
 * Pohang steel: $220,000 / 8 = $27,500. Same window as the Sydney credit term.
 */
export function importCapexOf(good) {
  const book = inboundBookFor(good);
  if (!book) return null;
  const fee = Number.isInteger(book.openFee) ? book.openFee : 0;
  return Math.floor(fee / IMPORT_AMORTISE_BEATS);
}

/**
 * Amortised MAKE facility-build capex per crate of the chain's last output.
 * Unique city-form hosts only (ARCHETYPES.basePrice); world mine desks add 0.
 * Steelworks $2,860,000 / 8 = $357,500. Blast and BOF share one steelworks.
 */
export function unitCapexOf(processChain) {
  const stages = chainStages(processChain);
  const seen = new Set();
  let total = 0;
  for (const id of stages) {
    const row = PROCESS_BY_ID[id];
    if (!row) throw new RangeError(`Unknown process: ${id}`);
    const facility = row.facility;
    if (!facility || seen.has(facility)) continue;
    seen.add(facility);
    const price = ARCHETYPES[facility]?.basePrice;
    if (Number.isInteger(price) && price > 0) {
      total += Math.floor(price / IMPORT_AMORTISE_BEATS);
    }
  }
  return total;
}

/**
 * World MAKE unit cost for a mined good: the mine row's cash + wages,
 * divided by the authored two-hopper output. Globe shift has no extra
 * time bill. Iron: $28,000 / 2 = $14,000 vs import $7,000 + capex $17,500.
 */
export function makeCostOf(good) {
  const process = PROCESSES.find((row) => row.tier === 'mine' && (row.outputs[good] ?? 0) > 0);
  if (!process) return null;
  const qty = Object.values(process.outputs).reduce((sum, n) => sum + n, 0);
  if (!qty) return null;
  return Math.floor(runCashCost(process) / qty);
}

export function isMineMakeDesk(deskId) {
  return Object.prototype.hasOwnProperty.call(MINE_MAKE_DESKS, deskId);
}

export function mineProcessForDesk(deskId) {
  const id = MINE_MAKE_DESKS[deskId];
  return id ? PROCESS_BY_ID[id] ?? null : null;
}

function deskOpenForMine(world, cityId) {
  const city = world?.cities?.[cityId];
  if (city?.status === 'open' || city?.status === 'in-play') return true;
  return WORLD_TRADE_ROUTES.some((route) => (
    (route.from === cityId || route.to === cityId) && routeIsOpen(world, route.id)
  ));
}

/**
 * True when a funded mine shift claimed this good this beat (started funded
 * or still mid-delay). An unfunded MAKE desk does not silence import.
 */
export function mineMakeBlocksImport(world, good) {
  if (world?.ambition?.mineImportBlock?.[good] === true) return true;
  const make = world?.ambition?.mineMake ?? {};
  const mineRuns = world?.ambition?.mineRuns ?? {};
  for (const [deskId, processId] of Object.entries(MINE_MAKE_DESKS)) {
    if (make[deskId] !== true) continue;
    if (!mineRuns[deskId]) continue;
    if (!deskOpenForMine(world, deskId)) continue;
    const process = PROCESS_BY_ID[processId];
    if (process && (process.outputs[good] ?? 0) > 0) return true;
  }
  return false;
}

/**
 * City-owned until acked: a run-id rotation with leftover draws clears the
 * log and issuance watermark. Fresh run, fresh draws.
 */
export function rotateProcessDrawsForRun(state, runId) {
  if (!state || typeof runId !== 'string' || runId.length === 0) return state;
  const log = state.processDrawLog;
  if (!log || typeof log !== 'object' || Array.isArray(log)) return state;
  let stale = false;
  for (const rows of Object.values(log)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    if (rows.some((row) => typeof row?.runId === 'string' && row.runId !== runId)) {
      stale = true;
      break;
    }
  }
  if (!stale) return state;
  state.processDrawLog = {};
  state.processDrawWatermark = {};
  return state;
}

export function setMineMake(world, deskId, on) {
  if (!isMineMakeDesk(deskId)) {
    return { ok: false, reason: noMineCopy(), world };
  }
  const mineMake = { ...(world?.ambition?.mineMake ?? {}) };
  mineMake[deskId] = on === true;
  return {
    ok: true,
    reason: '',
    world: {
      ...world,
      ambition: {
        ...(world.ambition ?? {}),
        mineMake,
      },
    },
  };
}

/**
 * Opened desks with MAKE on run their mine process each globe beat:
 * treasury pays cash+wages, seeded delay/error with the authored political
 * weighting, yield into the Yard. Harvest of that good is skipped the same
 * beat (never both).
 */
export function tickWorldMines(world, options = {}) {
  const events = [];
  const logRows = [];
  const stocks = { ...(world?.stocks ?? {}) };
  let treasuryCash = world?.treasuryCash ?? 0;
  const beat = world?.beat ?? 0;
  const seed = world?.worldSeed ?? 0;
  const ambition = { ...(world?.ambition ?? {}) };
  const mineMake = { ...(ambition.mineMake ?? {}) };
  const mineRuns = { ...(ambition.mineRuns ?? {}) };
  const mineRunIndex = { ...(ambition.mineRunIndex ?? {}) };
  const importBlock = {};
  const haltMineDesks = options.haltMineDesks instanceof Set
    ? options.haltMineDesks
    : new Set(options.haltMineDesks ?? []);

  const blockImportOf = (process) => {
    for (const [good, amount] of Object.entries(process.outputs ?? {})) {
      if ((amount ?? 0) > 0) importBlock[good] = true;
    }
  };

  for (const deskId of Object.keys(MINE_MAKE_DESKS).sort()) {
    if (mineMake[deskId] !== true) continue;
    if (haltMineDesks.has(deskId)) {
      logRows.push(Object.freeze({
        beat,
        type: 'process-hold',
        body: 'MAKE is halted. Nature still sits on the mine.',
        deskId,
      }));
      continue;
    }
    if (!deskOpenForMine(world, deskId)) continue;
    const process = PROCESS_BY_ID[MINE_MAKE_DESKS[deskId]];
    if (!process) continue;
    let run = mineRuns[deskId] && typeof mineRuns[deskId] === 'object'
      ? { ...mineRuns[deskId] }
      : null;
    if (!run) {
      const cost = runCashCost(process);
      if (treasuryCash < cost) {
        logRows.push(Object.freeze({
          beat,
          type: 'process-hold',
          body: mineUnfundedCopy(),
          deskId,
        }));
        continue;
      }
      const runIndex = Number.isInteger(mineRunIndex[deskId]) ? mineRunIndex[deskId] : 0;
      const roll = rollProcess(seed, process.id, runIndex);
      treasuryCash -= cost;
      mineRunIndex[deskId] = runIndex + 1;
      run = {
        remainingBeats: WORLD_MINE_SHIFT_BEATS + roll.delayBeats,
        runIndex,
        error: roll.error,
        delayBeats: roll.delayBeats,
      };
      blockImportOf(process);
      for (const hit of roll.delays) {
        logRows.push(Object.freeze({
          beat,
          type: 'process-delay',
          body: delayCopy(process, hit.class, hit.beats),
          deskId,
        }));
      }
      logRows.push(Object.freeze({
        beat,
        type: 'process-start',
        body: mineTickCopy(process),
        deskId,
      }));
    } else {
      blockImportOf(process);
    }
    run.remainingBeats -= 1;
    if (run.remainingBeats > 0) {
      mineRuns[deskId] = Object.freeze(run);
      continue;
    }
    delete mineRuns[deskId];
    if (run.error) {
      logRows.push(Object.freeze({
        beat,
        type: 'process-error',
        body: scrapCopy(),
        deskId,
      }));
      continue;
    }
    const goods = {};
    for (const [good, amount] of Object.entries(process.outputs)) {
      stocks[good] = Math.min(STOCK_CAP, (stocks[good] ?? 0) + amount);
      goods[good] = amount;
    }
    events.push(Object.freeze({
      kind: 'process-deposit',
      facilityId: deskId,
      processId: process.id,
      goods: Object.freeze(goods),
      beat,
    }));
    logRows.push(Object.freeze({
      beat,
      type: 'process-complete',
      body: mineLandCopy(process),
      deskId,
    }));
  }

  return {
    stocks,
    treasuryCash,
    mineMake,
    mineRuns,
    mineRunIndex,
    importBlock: Object.freeze(importBlock),
    events,
    logRows,
  };
}

function stocksCanFeed(process, stocks) {
  for (const [good, need] of Object.entries(process.inputs ?? {})) {
    if ((stocks[good] ?? 0) < need) return false;
  }
  return true;
}

function takeInputs(process, stocks) {
  const next = { ...stocks };
  for (const [good, need] of Object.entries(process.inputs ?? {})) {
    next[good] = (next[good] ?? 0) - need;
  }
  return next;
}

/**
 * Opened MAKE desks run world-only refine/assemble stages after the mine
 * shift. Inputs come from the Yard. Political delay is the enrichment tax.
 */
export function tickWorldWorks(world, options = {}) {
  const events = [];
  const logRows = [];
  const stocks = { ...(world?.stocks ?? {}) };
  let treasuryCash = world?.treasuryCash ?? 0;
  const beat = world?.beat ?? 0;
  const seed = world?.worldSeed ?? 0;
  const ambition = { ...(world?.ambition ?? {}) };
  const mineMake = { ...(ambition.mineMake ?? {}) };
  const worksRuns = { ...(ambition.worksRuns ?? {}) };
  const worksRunIndex = { ...(ambition.worksRunIndex ?? {}) };
  const haltMineDesks = options.haltMineDesks instanceof Set
    ? options.haltMineDesks
    : new Set(options.haltMineDesks ?? []);

  for (const deskId of Object.keys(WORLD_WORKS_DESKS).sort()) {
    if (mineMake[deskId] !== true) continue;
    if (haltMineDesks.has(deskId)) continue;
    if (!deskOpenForMine(world, deskId)) continue;
    for (const processId of WORLD_WORKS_DESKS[deskId]) {
      const process = PROCESS_BY_ID[processId];
      if (!process) continue;
      const runKey = `${deskId}:${processId}`;
      let run = worksRuns[runKey] && typeof worksRuns[runKey] === 'object'
        ? { ...worksRuns[runKey] }
        : null;
      if (!run) {
        const cost = runCashCost(process);
        if (treasuryCash < cost || !stocksCanFeed(process, stocks)) continue;
        const runIndex = Number.isInteger(worksRunIndex[runKey]) ? worksRunIndex[runKey] : 0;
        const roll = rollProcess(seed, process.id, runIndex);
        treasuryCash -= cost;
        Object.assign(stocks, takeInputs(process, stocks));
        worksRunIndex[runKey] = runIndex + 1;
        run = {
          remainingBeats: process.timeBeats + roll.delayBeats,
          runIndex,
          error: roll.error,
          delayBeats: roll.delayBeats,
        };
        for (const hit of roll.delays) {
          logRows.push(Object.freeze({
            beat,
            type: 'process-delay',
            body: delayCopy(process, hit.class, hit.beats),
            deskId,
          }));
        }
        logRows.push(Object.freeze({
          beat,
          type: 'process-start',
          body: `${process.label} ticks.`,
          deskId,
        }));
      }
      run.remainingBeats -= 1;
      if (run.remainingBeats > 0) {
        worksRuns[runKey] = Object.freeze(run);
        continue;
      }
      delete worksRuns[runKey];
      if (run.error) {
        logRows.push(Object.freeze({
          beat,
          type: 'process-error',
          body: scrapCopy(),
          deskId,
        }));
        continue;
      }
      const goods = {};
      for (const [good, amount] of Object.entries(process.outputs)) {
        stocks[good] = Math.min(STOCK_CAP, (stocks[good] ?? 0) + amount);
        goods[good] = amount;
      }
      events.push(Object.freeze({
        kind: 'process-deposit',
        facilityId: deskId,
        processId: process.id,
        goods: Object.freeze(goods),
        beat,
      }));
      logRows.push(Object.freeze({
        beat,
        type: 'process-complete',
        body: `${process.label} lands.`,
        deskId,
      }));
    }
  }

  return {
    stocks,
    treasuryCash,
    worksRuns,
    worksRunIndex,
    events,
    logRows,
  };
}

function requireNonNegativeInt(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
  return value;
}

function freezeDrawGoods(value, label) {
  if (value == null) return Object.freeze({});
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const frozen = {};
  for (const [good, amount] of Object.entries(value)) {
    if (!GOOD_SET.has(good)) return null;
    if (!Number.isInteger(amount) || amount < 0 || amount > 100_000) return null;
    if (amount > 0) frozen[good] = amount;
  }
  return Object.freeze(frozen);
}

const DRAW_ROW_KEYS = Object.freeze([
  'seq', 'kind', 'processId', 'runIndex', 'goods', 'id', 'runId', 'parcelId',
  'quality', 'yieldBp',
]);

function parseDrawRow(value, context = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  const allowed = new Set(DRAW_ROW_KEYS);
  for (const key of keys) {
    if (!allowed.has(key)) return null;
  }
  if (!Number.isInteger(value.seq) || value.seq < 1 || value.seq > DRAW_SEQ_CAP) return null;
  if (!['take', 'give', 'scrap'].includes(value.kind)) return null;
  if (typeof value.processId !== 'string' || !PROCESS_BY_ID[value.processId]) return null;
  if (!Number.isInteger(value.runIndex) || value.runIndex < 0) return null;
  const goods = freezeDrawGoods(value.goods, 'goods');
  if (!goods) return null;
  const parcelId = typeof value.parcelId === 'string' && value.parcelId.length > 0
    ? value.parcelId
    : (typeof context.parcelId === 'string' ? context.parcelId : null);
  const runId = typeof value.runId === 'string' && value.runId.length > 0
    ? value.runId
    : (typeof context.runId === 'string' ? context.runId : null);
  if (parcelId && context.parcelId && parcelId !== context.parcelId) return null;
  const idRun = runId ?? (typeof context.runId === 'string' ? context.runId : null);
  if (context.requireDerived) {
    if (typeof value.id !== 'string' || !idRun || !parcelId) return null;
    if (value.id !== deriveDrawId(idRun, parcelId, value.seq)) return null;
  } else if (typeof value.id === 'string' && idRun && parcelId) {
    if (value.id !== deriveDrawId(idRun, parcelId, value.seq)) return null;
  }
  if (value.quality != null && (!Number.isInteger(value.quality) || value.quality < 0 || value.quality > 9)) {
    return null;
  }
  if (value.yieldBp != null && !LEGAL_YIELD_BP.includes(value.yieldBp)) {
    return null;
  }
  const parsed = {
    seq: value.seq,
    kind: value.kind,
    processId: value.processId,
    runIndex: value.runIndex,
    goods,
  };
  if (typeof value.id === 'string') parsed.id = value.id;
  if (runId) parsed.runId = runId;
  if (parcelId) parsed.parcelId = parcelId;
  if (Number.isInteger(value.quality)) parsed.quality = value.quality;
  if (Number.isInteger(value.yieldBp)) parsed.yieldBp = value.yieldBp;
  return Object.freeze(parsed);
}

export function parseProcessDraws(value, runId = null) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const restored = {};
  const keys = Object.keys(value);
  if (keys.length > DRAW_FACILITY_CAP) return null;
  for (const facilityId of keys) {
    if (!FACILITY_ID_RE.test(facilityId)) return null;
    const entry = value[facilityId];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const seq = entry.seq;
    if (!Number.isInteger(seq) || seq < 0 || seq > DRAW_SEQ_CAP) return null;
    const rows = Array.isArray(entry.rows) ? entry.rows : null;
    if (!rows || rows.length > DRAW_LOG_CAP) return null;
    const parsedRows = [];
    for (const row of rows) {
      const parsed = parseDrawRow(row, {
        requireDerived: true,
        parcelId: facilityId,
        runId,
      });
      if (!parsed) return null;
      parsedRows.push(parsed);
    }
    restored[facilityId] = Object.freeze({
      seq,
      rows: Object.freeze(parsedRows),
    });
  }
  return restored;
}

export function echoProcessDraws(log, watermark, runId) {
  const sourceLog = log && typeof log === 'object' && !Array.isArray(log) ? log : {};
  const sourceMark = watermark && typeof watermark === 'object' && !Array.isArray(watermark)
    ? watermark
    : {};
  const echoed = {};
  const ids = [...new Set([...Object.keys(sourceLog), ...Object.keys(sourceMark)])].sort();
  if (ids.length > DRAW_FACILITY_CAP) {
    throw new RangeError('processDraws has too many facilities.');
  }
  if (typeof runId !== 'string' || runId.length === 0) {
    throw new RangeError('processDraws requires a city run id.');
  }
  for (const facilityId of ids) {
    if (!FACILITY_ID_RE.test(facilityId)) {
      throw new RangeError(`Unknown processDraws facility: ${facilityId}`);
    }
    const seq = requireNonNegativeInt(
      sourceMark[facilityId] ?? 0,
      `processDrawWatermark.${facilityId}`,
    );
    if (seq > DRAW_SEQ_CAP) {
      throw new RangeError(`processDrawWatermark.${facilityId} exceeds the issuance cap.`);
    }
    const rawRows = Array.isArray(sourceLog[facilityId]) ? sourceLog[facilityId] : [];
    if (rawRows.length > DRAW_LOG_CAP) {
      throw new RangeError(`processDrawLog.${facilityId} exceeds the row cap.`);
    }
    const rows = [];
    for (const row of rawRows) {
      const parsed = parseDrawRow(row, { parcelId: facilityId });
      if (!parsed) throw new RangeError(`processDrawLog.${facilityId} is not valid.`);
      // Never restamp. Leftover old-run rows stay on their issuance runId/id
      // so the world-side `row.runId !== payload.runId` reject can fire; a
      // city run-id rotation drops them instead of laundering them.
      if (parsed.runId && parsed.runId !== runId) continue;
      const echoedRunId = parsed.runId ?? runId;
      const echoedId = parsed.id ?? deriveDrawId(echoedRunId, facilityId, parsed.seq);
      const echoed = {
        seq: parsed.seq,
        kind: parsed.kind,
        processId: parsed.processId,
        runIndex: parsed.runIndex,
        goods: parsed.goods,
        parcelId: facilityId,
        runId: echoedRunId,
        id: echoedId,
      };
      if (Number.isInteger(parsed.quality)) echoed.quality = parsed.quality;
      if (Number.isInteger(parsed.yieldBp)) echoed.yieldBp = parsed.yieldBp;
      rows.push(Object.freeze(echoed));
    }
    echoed[facilityId] = Object.freeze({ seq, rows: Object.freeze(rows) });
  }
  return echoed;
}

export function restoreProcessDrawWatermark(value) {
  if (value == null) {
    throw new RangeError('processDrawWatermark must be a record.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('processDrawWatermark must be a record.');
  }
  const restored = {};
  const keys = Object.keys(value);
  if (keys.length > DRAW_FACILITY_CAP) {
    throw new RangeError('processDrawWatermark has too many facilities.');
  }
  for (const facilityId of keys) {
    if (!FACILITY_ID_RE.test(facilityId)) {
      throw new RangeError(`Unknown processDrawWatermark facility: ${facilityId}`);
    }
    restored[facilityId] = requireNonNegativeInt(value[facilityId], `processDrawWatermark.${facilityId}`);
    if (restored[facilityId] > DRAW_SEQ_CAP) {
      throw new RangeError(`processDrawWatermark.${facilityId} exceeds the issuance cap.`);
    }
  }
  return restored;
}

export function restoreProcessDrawLog(value) {
  if (value == null) {
    throw new RangeError('processDrawLog must be a record.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('processDrawLog must be a record.');
  }
  const restored = {};
  const keys = Object.keys(value);
  if (keys.length > DRAW_FACILITY_CAP) {
    throw new RangeError('processDrawLog has too many facilities.');
  }
  for (const facilityId of keys) {
    if (!FACILITY_ID_RE.test(facilityId)) {
      throw new RangeError(`Unknown processDrawLog facility: ${facilityId}`);
    }
    const rows = value[facilityId];
    if (!Array.isArray(rows) || rows.length > DRAW_LOG_CAP) {
      throw new RangeError(`processDrawLog.${facilityId} must be a short row list.`);
    }
    restored[facilityId] = rows.map((row) => {
      const parsed = parseDrawRow(row);
      if (!parsed) throw new RangeError(`processDrawLog.${facilityId} is not valid.`);
      return parsed;
    });
  }
  return restored;
}

function canTake(stocks, goods) {
  for (const [good, amount] of Object.entries(goods)) {
    if ((stocks[good] ?? 0) < amount) return false;
  }
  return true;
}

function takeGoods(stocks, goods) {
  for (const [good, amount] of Object.entries(goods)) {
    stocks[good] = (stocks[good] ?? 0) - amount;
  }
}

function giveGoods(stocks, goods) {
  for (const [good, amount] of Object.entries(goods)) {
    stocks[good] = Math.min(STOCK_CAP, (stocks[good] ?? 0) + amount);
  }
}

/** actual ⊆ authored and each amount ≤ authored per-run (combo yield may raise the cap). */
export function goodsWithinAuthored(actual, authored, yieldBp = 0) {
  const have = authored && typeof authored === 'object' ? authored : {};
  const got = actual && typeof actual === 'object' ? actual : {};
  const bp = LEGAL_YIELD_BP.includes(yieldBp) ? yieldBp : 0;
  for (const [good, amount] of Object.entries(got)) {
    if (!Number.isInteger(amount) || amount <= 0) return false;
    if (!Number.isInteger(have[good])) return false;
    if (amount > comboYieldQty(have[good], bp)) return false;
  }
  return true;
}

function rejectDrawEvent(facilityId, row, reason, beat) {
  return Object.freeze({
    kind: 'process-reject',
    facilityId,
    processId: row?.processId ?? null,
    seq: row?.seq ?? null,
    reason,
    beat,
  });
}

/**
 * Apply echoed processDraws onto Yard stocks. Monotonic per-facility seq,
 * keyed to payload.runId. seq ≤ watermark is a no-op (exactly-once). A take
 * that cannot be funded stops that facility's apply so a later echo can retry
 * the same seq. Forged goods or ids reject the row and never mutate stocks.
 */
export function applyProcessDraws(
  stocks,
  payload,
  watermark,
  beat = 0,
  processDrawRunId = null,
  stockQuality = null,
  world = null,
) {
  const nextStocks = { ...(stocks ?? {}) };
  const nextQuality = { ...(stockQuality ?? {}) };
  const payloadRunId = typeof payload?.runId === 'string' && payload.runId.length > 0
    ? payload.runId
    : null;
  let markRunId = typeof processDrawRunId === 'string' && processDrawRunId.length > 0
    ? processDrawRunId
    : null;
  let nextWatermark = { ...(watermark ?? {}) };
  if (payloadRunId && markRunId && payloadRunId !== markRunId) {
    nextWatermark = {};
    markRunId = payloadRunId;
  } else if (payloadRunId && !markRunId) {
    markRunId = payloadRunId;
  }
  const events = [];
  const draws = payload?.processDraws ?? {};
  const facilityIds = Object.keys(draws).sort();
  for (const facilityId of facilityIds) {
    const entry = draws[facilityId];
    if (!entry) continue;
    let applied = nextWatermark[facilityId] ?? 0;
    const rows = Array.isArray(entry.rows) ? [...entry.rows].sort((a, b) => a.seq - b.seq) : [];
    for (const row of rows) {
      if (!row || !Number.isInteger(row.seq)) continue;
      if (row.seq <= applied) continue;
      if (row.seq !== applied + 1) break;
      const goods = row.goods && typeof row.goods === 'object' ? row.goods : {};
      if (payloadRunId && row.runId && row.runId !== payloadRunId) {
        events.push(rejectDrawEvent(facilityId, row, staleDrawRejectCopy(), beat));
        break;
      }
      const idRun = payloadRunId ?? row.runId;
      if (!idRun || row.id !== deriveDrawId(idRun, facilityId, row.seq)) {
        events.push(rejectDrawEvent(facilityId, row, drawIdRejectCopy(), beat));
        break;
      }
      const process = PROCESS_BY_ID[row.processId];
      if (!process) break;
      if (
        (row.kind === 'take' || row.kind === 'give')
        && world
        && fireDamageForFacility(world, process.facility, beat)
      ) {
        break;
      }
      if (row.kind === 'take') {
        if (!goodsWithinAuthored(goods, process.inputs)) {
          events.push(rejectDrawEvent(facilityId, row, takeGoodsRejectCopy(), beat));
          break;
        }
        if (!canTake(nextStocks, goods)) break;
        takeGoods(nextStocks, goods);
        if (Object.keys(goods).length) {
          events.push(Object.freeze({
            kind: 'process-draw',
            facilityId,
            processId: row.processId,
            goods: Object.freeze({ ...goods }),
            beat,
          }));
        }
      } else if (row.kind === 'give') {
        const allowed = { ...process.outputs, ...process.byproducts };
        const yieldBp = LEGAL_YIELD_BP.includes(row.yieldBp) ? row.yieldBp : 0;
        if (!goodsWithinAuthored(goods, allowed, yieldBp)) {
          events.push(rejectDrawEvent(facilityId, row, giveGoodsRejectCopy(), beat));
          break;
        }
        giveGoods(nextStocks, goods);
        const quality = Number.isInteger(row.quality) ? row.quality : 0;
        if (quality > 0) {
          for (const good of Object.keys(goods)) {
            nextQuality[good] = Math.max(nextQuality[good] ?? 0, quality);
          }
        }
        if (Object.keys(goods).length) {
          events.push(Object.freeze({
            kind: 'process-deposit',
            facilityId,
            processId: row.processId,
            goods: Object.freeze({ ...goods }),
            beat,
            ...(quality > 0 ? { quality } : {}),
          }));
        }
      } else if (row.kind === 'scrap') {
        if (!goodsWithinAuthored(goods, process.inputs)) {
          events.push(rejectDrawEvent(facilityId, row, takeGoodsRejectCopy(), beat));
          break;
        }
        events.push(Object.freeze({
          kind: 'process-scrap',
          facilityId,
          processId: row.processId,
          goods: Object.freeze({ ...goods }),
          beat,
        }));
      } else {
        break;
      }
      applied = row.seq;
    }
    nextWatermark[facilityId] = applied;
  }
  return {
    stocks: nextStocks,
    watermark: nextWatermark,
    events,
    processDrawRunId: markRunId,
    stockQuality: nextQuality,
  };
}

function producersOf(good) {
  return PROCESSES.filter((row) => (row.outputs[good] ?? 0) > 0);
}

/** Mine output, inbound book, or a good no process produces. */
export function isRawOrImportGood(good) {
  if (inboundBookFor(good)) return true;
  const producers = producersOf(good);
  if (producers.length === 0) return true;
  return producers.every((row) => row.tier === 'mine');
}

/**
 * Chain-closure: every stage input is a raw good, an import good, or an
 * earlier stage's output. Walks PROCESS_CHAINS and throws on a hole.
 */
export function assertProcessChainClosure(chains = PROCESS_CHAINS) {
  for (const [name, stages] of Object.entries(chains)) {
    const produced = new Set();
    for (const id of stages) {
      const row = PROCESS_BY_ID[id];
      if (!row) throw new RangeError(`PROCESS_CHAINS.${name}: unknown stage ${id}`);
      for (const good of Object.keys(row.inputs)) {
        if (produced.has(good)) continue;
        if (isRawOrImportGood(good)) continue;
        throw new Error(`${id} needs ${good}`);
      }
      for (const good of Object.keys(row.outputs)) produced.add(good);
    }
  }
}

assertProcessChainClosure();

export function assertWorldOnlyNuclear(processes = PROCESSES) {
  for (const row of processes) {
    if (row.tier === 'mine' || row.id === 'enrichment') {
      if (row.allowedIn !== 'world') {
        throw new RangeError(`${row.id} must be world-only`);
      }
      if (canHostProcessInCity(row)) {
        throw new RangeError(`${row.id} must not host in the city`);
      }
    }
  }
}

assertWorldOnlyNuclear();

export const PROCESS_DRAW_SEQ_CAP = DRAW_SEQ_CAP;
export const PROCESS_DRAW_LOG_CAP = DRAW_LOG_CAP;
